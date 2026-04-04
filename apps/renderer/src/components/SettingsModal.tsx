import type { AiProvider } from "@hinterview/shared";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/appStore";

type SettingsSection = "general" | "agents";

const providerOptions: Array<{ value: AiProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Gemini" }
];

const providerModels: Record<AiProvider, string[]> = {
  openai: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "o4-mini"],
  openrouter: [
    "openai/gpt-4o",
    "openai/gpt-4.1",
    "anthropic/claude-3.7-sonnet",
    "google/gemini-2.5-pro-preview"
  ],
  anthropic: ["claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  google: ["gemini-2.5-pro-preview-03-25", "gemini-2.0-flash", "gemini-1.5-pro"]
};

export function SettingsModal() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    agentProfiles,
    closeSettings,
    createAgentProfile,
    deleteAgentProfile,
    error,
    lastAgentValidation,
    settings,
    settingsOpen,
    updateSettings,
    validateAgentProfile
  } = useAppStore();

  const [section, setSection] = useState<SettingsSection>("general");
  const [triesInput, setTriesInput] = useState(settings?.defaultMaxTries ?? 3);
  const [defaultAgentId, setDefaultAgentId] = useState<string>(settings?.defaultAgentId ?? "");
  const [profileName, setProfileName] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);
  const isSettingsRoute = location.pathname === "/settings";
  const suggestedModels = providerModels[provider];

  useEffect(() => {
    if (settings) {
      setTriesInput(settings.defaultMaxTries);
      setDefaultAgentId(settings.defaultAgentId ?? "");
    }
  }, [settings]);

  const handleClose = () => {
    closeSettings();

    if (isSettingsRoute) {
      if (window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate("/", { replace: true });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    if (!settingsOpen) {
      return;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, settingsOpen]);

  if (!settingsOpen) {
    return null;
  }

  const resetAgentForm = () => {
    setProfileName("");
    setProvider("openai");
    setModel("");
    setApiKey("");
    setSystemPrompt("");
  };

  const canSaveAgent =
    profileName.trim().length > 0 &&
    model.trim().length > 0 &&
    apiKey.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
      <div className="relative grid h-[80vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(22,28,36,0.28)] lg:grid-cols-[240px_minmax(0,1fr)]">
        <button
          aria-label="Close settings"
          className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:border-slate-300 hover:text-brand-ink"
          onClick={handleClose}
          type="button"
        >
          ×
        </button>

        <aside className="overflow-y-auto border-b border-slate-200 bg-brand-surface px-6 py-6 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Settings</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink">Workspace controls</h2>
          </div>

          <div className="mt-6 space-y-2">
            <button
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                section === "general" ? "bg-brand-ink text-white" : "bg-white text-slate-600 hover:text-brand-ink"
              }`}
              onClick={() => setSection("general")}
            >
              General
            </button>
            <button
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                section === "agents" ? "bg-brand-ink text-white" : "bg-white text-slate-600 hover:text-brand-ink"
              }`}
              onClick={() => setSection("agents")}
            >
              AI Agents
            </button>
          </div>

        </aside>

        <div className="overflow-y-auto px-8 py-7">
          {section === "general" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-3xl font-semibold tracking-tight text-brand-ink">Interview flow defaults</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Configure the default number of tries a new stage gets before the reference answer is revealed.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-brand-surface px-5 py-5">
                <label className="block space-y-3">
                  <span className="text-sm font-medium text-brand-ink">Default tries per stage</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-brand-ink outline-none transition focus:border-brand-teal"
                    max={10}
                    min={1}
                    type="number"
                    value={triesInput}
                    onChange={(event) => setTriesInput(Number(event.target.value))}
                  />
                </label>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  This applies to new sessions. Existing sessions keep the tries they started with.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  className="rounded-full bg-brand-teal px-5 py-2 text-sm font-medium text-white transition hover:brightness-105"
                  onClick={() =>
                    void updateSettings({
                      defaultMaxTries: Math.min(10, Math.max(1, triesInput)),
                      defaultAgentId: defaultAgentId || null
                    })
                  }
                >
                  Save general settings
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-3xl font-semibold tracking-tight text-brand-ink">AI agent profiles</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Add multiple providers and models now. Keys are format-validated before save, stored locally in
                  encrypted form, and connected to the session-level prompt scaffolds used for hint, answer, and
                  evaluation actions.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                <label className="block space-y-3">
                  <span className="text-sm font-medium text-brand-ink">Default interview agent</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                    value={defaultAgentId}
                    onChange={(event) => setDefaultAgentId(event.target.value)}
                  >
                    <option value="">No default agent selected</option>
                    {agentProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.model}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 flex justify-end">
                  <button
                    className="rounded-full bg-brand-ink px-5 py-2 text-sm font-medium text-white transition hover:brightness-105"
                    onClick={() =>
                      void updateSettings({
                        defaultMaxTries: Math.min(10, Math.max(1, triesInput)),
                        defaultAgentId: defaultAgentId || null
                      })
                    }
                    type="button"
                  >
                    Save default agent
                  </button>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  {agentProfiles.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-dashed border-brand-line bg-slate-50 px-5 py-6 text-sm text-slate-500">
                      No AI agent profiles yet.
                    </div>
                  ) : (
                    agentProfiles.map((profile) => (
                      <article
                        className="flex items-start justify-between gap-4 rounded-[1.5rem] border border-brand-line bg-white px-5 py-5"
                        key={profile.id}
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-brand-surface px-3 py-1 text-xs uppercase tracking-[0.16em] text-brand-teal">
                              {profile.provider}
                            </span>
                            <span className="rounded-full border border-brand-line px-3 py-1 text-xs text-slate-500">
                              {profile.model}
                            </span>
                          </div>
                          <h4 className="text-lg font-semibold text-brand-ink">{profile.name}</h4>
                          <p className="text-sm text-slate-500">Stored key: {profile.maskedKey}</p>
                          {profile.systemPrompt ? (
                            <p className="max-w-2xl text-sm leading-6 text-slate-600">{profile.systemPrompt}</p>
                          ) : null}
                        </div>

                        <button
                          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500 transition hover:border-rose-200 hover:text-rose-700"
                          onClick={() => void deleteAgentProfile(profile.id)}
                        >
                          Delete
                        </button>
                      </article>
                    ))
                  )}
                </div>

                <div className="rounded-[1.75rem] border border-brand-line bg-brand-surface px-5 py-5">
                  <h4 className="text-lg font-semibold text-brand-ink">Add agent profile</h4>
                  <div className="mt-5 space-y-4">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-brand-ink">Profile name</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                        placeholder="OpenAI GPT-4o Evaluator"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-brand-ink">Provider</span>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                        value={provider}
                        onChange={(event) => setProvider(event.target.value as AiProvider)}
                      >
                        {providerOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-brand-ink">Model</span>
                      <input
                        list="provider-model-suggestions"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                        placeholder={suggestedModels[0] ?? "Enter model id"}
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                      />
                      <datalist id="provider-model-suggestions">
                        {suggestedModels.map((suggestedModel) => (
                          <option key={suggestedModel} value={suggestedModel} />
                        ))}
                      </datalist>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {suggestedModels.map((suggestedModel) => (
                          <button
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-brand-teal/40 hover:text-brand-ink"
                            key={suggestedModel}
                            onClick={() => setModel(suggestedModel)}
                            type="button"
                          >
                            {suggestedModel}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-brand-ink">API key</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                        placeholder="Paste provider API key"
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-brand-ink">System prompt</span>
                      <textarea
                        className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-brand-ink outline-none transition focus:border-brand-teal"
                        placeholder="Optional custom system prompt for this agent profile"
                        value={systemPrompt}
                        onChange={(event) => setSystemPrompt(event.target.value)}
                      />
                    </label>

                    <button
                      className="w-full rounded-full bg-brand-teal px-4 py-3 text-sm font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!canSaveAgent || agentSaving}
                      onClick={() => {
                        const payload = {
                          name: profileName,
                          provider,
                          model,
                          apiKey,
                          systemPrompt
                        } as const;

                        setAgentSaving(true);
                        void validateAgentProfile(payload)
                          .then((validation) => {
                            if (!validation.isValid) {
                              return;
                            }

                            return createAgentProfile(payload).then(() => {
                              resetAgentForm();
                            });
                          })
                          .finally(() => {
                            setAgentSaving(false);
                          });
                      }}
                    >
                      {agentSaving ? "Validating profile..." : "Validate and save agent"}
                    </button>

                    {lastAgentValidation ? (
                      <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-brand-ink">
                            {lastAgentValidation.isValid ? "Validation passed" : "Validation blocked"}
                          </div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            {lastAgentValidation.validationMode} check
                          </div>
                        </div>

                        <div className="mt-3 text-slate-600">
                          Normalized model: <span className="font-medium text-brand-ink">{lastAgentValidation.normalizedModel}</span>
                        </div>

                        {lastAgentValidation.issues.length ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-800">
                            {lastAgentValidation.issues.join(" ")}
                          </div>
                        ) : null}

                        {lastAgentValidation.warnings.length ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
                            {lastAgentValidation.warnings.join(" ")}
                          </div>
                        ) : null}

                        <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                          Supports: {lastAgentValidation.supportedActions.join(", ")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-6 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
