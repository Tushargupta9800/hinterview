import type { AgentProfile, AiPromptAction, AiProvider } from "@hinterview/shared";

type ProviderCallInput = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
};

const readJson = async (response: Response) => {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Provider request failed with ${response.status}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Provider returned a non-JSON response");
  }
};

const extractOpenAiText = (payload: any): string => {
  const messageContent = payload?.choices?.[0]?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }

  throw new Error("OpenAI response did not include message content");
};

const extractAnthropicText = (payload: any): string => {
  const content = payload?.content;
  if (!Array.isArray(content)) {
    throw new Error("Anthropic response did not include content");
  }

  return content
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
};

const extractGoogleText = (payload: any): string => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Google response did not include candidates");
  }

  return parts
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
};

const callOpenAi = async ({ model, apiKey, systemPrompt, userPrompt }: ProviderCallInput): Promise<string> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  return extractOpenAiText(await readJson(response));
};

const callOpenRouter = async ({ model, apiKey, systemPrompt, userPrompt }: ProviderCallInput): Promise<string> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hinterview.local",
      "X-Title": "Hinterview"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  return extractOpenAiText(await readJson(response));
};

const callAnthropic = async ({ model, apiKey, systemPrompt, userPrompt }: ProviderCallInput): Promise<string> => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    })
  });

  return extractAnthropicText(await readJson(response));
};

const callGoogle = async ({ model, apiKey, systemPrompt, userPrompt }: ProviderCallInput): Promise<string> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`
              }
            ]
          }
        ]
      })
    }
  );

  return extractGoogleText(await readJson(response));
};

const extractJsonObject = (value: string): string => {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Provider did not return a JSON object");
  }

  return value.slice(firstBrace, lastBrace + 1);
};

export const invokeProviderJson = async (
  agent: AgentProfile,
  apiKey: string,
  action: AiPromptAction,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> => {
  const input: ProviderCallInput = {
    provider: agent.provider,
    model: agent.model,
    apiKey,
    systemPrompt,
    userPrompt
  };

  const raw =
    agent.provider === "openai"
      ? await callOpenAi(input)
      : agent.provider === "openrouter"
        ? await callOpenRouter(input)
      : agent.provider === "anthropic"
        ? await callAnthropic(input)
        : await callGoogle(input);

  try {
    return JSON.parse(extractJsonObject(raw)) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider parsing error";
    throw new Error(`Failed to parse ${action} response from ${agent.provider}: ${message}`);
  }
};
