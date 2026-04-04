import {
  agentValidationSchema,
  type AgentProfileInput,
  type AgentValidation,
  type AiPromptAction,
  type AiProvider
} from "@hinterview/shared";

type ProviderAdapter = {
  provider: AiProvider;
  supportedActions: AiPromptAction[];
  normalizeModel: (model: string) => string;
  validateApiKey: (apiKey: string) => { issues: string[]; warnings: string[] };
};

const providerAdapters: Record<AiProvider, ProviderAdapter> = {
  openai: {
    provider: "openai",
    supportedActions: ["hint", "answer", "evaluation"],
    normalizeModel: (model) => model.trim(),
    validateApiKey: (apiKey) => {
      const trimmed = apiKey.trim();
      const issues: string[] = [];
      const warnings: string[] = [];

      if (!trimmed.startsWith("sk-")) {
        warnings.push("OpenAI keys usually start with 'sk-'.");
      }

      if (trimmed.length < 20) {
        issues.push("OpenAI API key looks too short.");
      }

      return { issues, warnings };
    }
  },
  openrouter: {
    provider: "openrouter",
    supportedActions: ["hint", "answer", "evaluation"],
    normalizeModel: (model) => model.trim(),
    validateApiKey: (apiKey) => {
      const trimmed = apiKey.trim();
      const issues: string[] = [];
      const warnings: string[] = [];

      if (!trimmed.startsWith("sk-or-")) {
        warnings.push("OpenRouter keys usually start with 'sk-or-'.");
      }

      if (trimmed.length < 20) {
        issues.push("OpenRouter API key looks too short.");
      }

      return { issues, warnings };
    }
  },
  anthropic: {
    provider: "anthropic",
    supportedActions: ["hint", "answer", "evaluation"],
    normalizeModel: (model) => model.trim(),
    validateApiKey: (apiKey) => {
      const trimmed = apiKey.trim();
      const issues: string[] = [];
      const warnings: string[] = [];

      if (!trimmed.startsWith("sk-ant-")) {
        warnings.push("Anthropic keys usually start with 'sk-ant-'.");
      }

      if (trimmed.length < 20) {
        issues.push("Anthropic API key looks too short.");
      }

      return { issues, warnings };
    }
  },
  google: {
    provider: "google",
    supportedActions: ["hint", "answer", "evaluation"],
    normalizeModel: (model) => model.trim(),
    validateApiKey: (apiKey) => {
      const trimmed = apiKey.trim();
      const issues: string[] = [];
      const warnings: string[] = [];

      if (!(trimmed.startsWith("AIza") || trimmed.length >= 30)) {
        warnings.push("Google AI keys often start with 'AIza' or are longer provider-issued secrets.");
      }

      if (trimmed.length < 20) {
        issues.push("Google API key looks too short.");
      }

      return { issues, warnings };
    }
  }
};

export const getProviderAdapter = (provider: AiProvider): ProviderAdapter => providerAdapters[provider];

export const validateAgentProfileInput = (input: AgentProfileInput): AgentValidation => {
  const adapter = getProviderAdapter(input.provider);
  const normalizedModel = adapter.normalizeModel(input.model);
  const { issues, warnings } = adapter.validateApiKey(input.apiKey);

  if (normalizedModel.length === 0) {
    issues.push("Model name is required.");
  }

  return agentValidationSchema.parse({
    provider: input.provider,
    model: input.model,
    normalizedModel,
    isValid: issues.length === 0,
    validationMode: "format",
    issues,
    warnings,
    supportedActions: adapter.supportedActions
  });
};
