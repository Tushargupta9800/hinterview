import {
  appMetaSchema,
  agentProfileInputSchema,
  agentProfileSchema,
  agentValidationSchema,
  appSettingsSchema,
  healthResponseSchema,
  interviewSessionSchema,
  learningDashboardSchema,
  learningItemInputSchema,
  learningNoteInputSchema,
  learningNoteSchema,
  promptScaffoldBundleSchema,
  questionAuthoringInputSchema,
  questionChatHistorySchema,
  questionChatRequestSchema,
  questionChatResponseSchema,
  questionDetailSchema,
  questionDraftSchema,
  questionStageAuthoringInputSchema,
  questionStageDraftSchema,
  questionStageSuggestionSchema,
  questionSummarySchema,
  sessionAgentUpdateSchema,
  telemetryEventSchema,
  stageAnswerSchema,
  stageEvaluationSchema,
  stageEvaluationHistoryEntrySchema,
  stageHintSchema,
  type AppSettings,
  type AppMeta,
  type AgentProfile,
  type AgentProfileInput,
  type AgentValidation,
  type HealthResponse,
  type InterviewMode,
  type InterviewSession,
  type LearningDashboard,
  type LearningItemInput,
  type LearningNote,
  type LearningNoteInput,
  type PromptScaffoldBundle,
  type QuestionAuthoringInput,
  type QuestionChatHistory,
  type QuestionChatRequest,
  type QuestionChatResponse,
  type QuestionDetail,
  type QuestionDraft,
  type QuestionStageAuthoringInput,
  type QuestionStageDraft,
  type QuestionStageSuggestion,
  type QuestionSummary,
  type TelemetryEvent,
  type StageAnswer,
  type StageHint,
  type StageEvaluation,
  type StageEvaluationHistoryEntry
} from "@hinterview/shared";

const API_BASE_URL =
  window.hinterviewDesktop?.apiBaseUrl ??
  import.meta.env.VITE_API_BASE_URL ??
  "";

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const shouldRetryRequest = (method: string, error: unknown) => {
  if (method !== "GET") {
    return false;
  }

  if (error instanceof Error) {
    return /fetch|network|failed to fetch|load failed/i.test(error.message);
  }

  return false;
};

const fetchWithRetry = async (input: RequestInfo | URL, init?: RequestInit, retries = 1): Promise<Response> => {
  const method = (init?.method ?? "GET").toUpperCase();

  try {
    return await fetch(input, init);
  } catch (error) {
    if (retries <= 0 || !shouldRetryRequest(method, error)) {
      throw error;
    }

    await delay(250);
    return fetchWithRetry(input, init, retries - 1);
  }
};

const parseJson = async <T>(response: Response, parser: (value: unknown) => T): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (!contentType.includes("application/json")) {
    const preview = raw.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected JSON from ${response.url}, but received ${contentType || "unknown content type"}${preview ? `: ${preview}` : ""}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    const preview = raw.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(`Invalid JSON from ${response.url}${preview ? `: ${preview}` : ""}`);
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data && typeof data.message === "string"
        ? data.message
        : "Request failed";
    throw new Error(message);
  }

  return parser(data);
};

export const fetchHealth = async (): Promise<HealthResponse> => {
  const response = await fetchWithRetry(buildUrl("/api/health"));
  return parseJson(response, (value) => healthResponseSchema.parse(value));
};

export const fetchAppMeta = async (): Promise<AppMeta> => {
  const response = await fetchWithRetry(buildUrl("/api/meta"));
  return parseJson(response, (value) => appMetaSchema.parse(value));
};

export const trackTelemetry = async (event: TelemetryEvent): Promise<void> => {
  const payload = telemetryEventSchema.parse(event);
  try {
    await fetch(buildUrl("/api/telemetry"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Telemetry must never break the user flow.
  }
};

export const fetchSettings = async (): Promise<AppSettings> => {
  const response = await fetchWithRetry(buildUrl("/api/settings"));
  return parseJson(response, (value) => appSettingsSchema.parse(value));
};

export const fetchLearningDashboard = async (): Promise<LearningDashboard> => {
  const response = await fetchWithRetry(buildUrl("/api/learning"));
  return parseJson(response, (value) => learningDashboardSchema.parse(value));
};

export const saveLearningNote = async (input: LearningNoteInput): Promise<LearningNote> => {
  const payload = learningNoteInputSchema.parse(input);
  const response = await fetch(buildUrl("/api/learning/notes"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => learningNoteSchema.parse(value));
};

export const deleteLearningNote = async (noteId: string): Promise<void> => {
  const response = await fetch(buildUrl(`/api/learning/notes/${noteId}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to delete learning note");
  }
};

export const saveLearningTheme = async (input: LearningItemInput): Promise<void> => {
  const payload = learningItemInputSchema.parse(input);
  const response = await fetch(buildUrl(`/api/learning/themes/${payload.id}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to save learning theme");
  }
};

export const deleteLearningTheme = async (itemId: string): Promise<void> => {
  const response = await fetch(buildUrl(`/api/learning/themes/${itemId}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to delete learning theme");
  }
};

export const saveLearningRecommendation = async (input: LearningItemInput): Promise<void> => {
  const payload = learningItemInputSchema.parse(input);
  const response = await fetch(buildUrl(`/api/learning/recommendations/${payload.id}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to save recommendation");
  }
};

export const deleteLearningRecommendation = async (itemId: string): Promise<void> => {
  const response = await fetch(buildUrl(`/api/learning/recommendations/${itemId}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to delete recommendation");
  }
};

export const saveSettings = async (settings: AppSettings): Promise<AppSettings> => {
  const response = await fetch(buildUrl("/api/settings"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(appSettingsSchema.parse(settings))
  });

  return parseJson(response, (value) => appSettingsSchema.parse(value));
};

export const fetchAgentProfiles = async (): Promise<AgentProfile[]> => {
  const response = await fetchWithRetry(buildUrl("/api/agents"));
  const data = await parseJson(response, (value) => value as { items: unknown });
  return agentProfileSchema.array().parse(data.items);
};

export const createAgentProfile = async (input: AgentProfileInput): Promise<AgentProfile> => {
  const payload = agentProfileInputSchema.parse(input);
  const response = await fetch(buildUrl("/api/agents"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => agentProfileSchema.parse(value));
};

export const validateAgentProfile = async (input: AgentProfileInput): Promise<AgentValidation> => {
  const payload = agentProfileInputSchema.parse(input);
  const response = await fetch(buildUrl("/api/agents/validate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => agentValidationSchema.parse(value));
};

export const deleteAgentProfile = async (agentId: string): Promise<void> => {
  const response = await fetch(buildUrl(`/api/agents/${agentId}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(typeof data?.message === "string" ? data.message : "Failed to delete agent profile");
  }
};

export const fetchQuestions = async (): Promise<QuestionSummary[]> => {
  const response = await fetchWithRetry(buildUrl("/api/questions"));
  const data = await parseJson(response, (value) => value as { items: unknown });
  return questionSummarySchema.array().parse(data.items);
};

export const fetchQuestion = async (slug: string): Promise<QuestionDetail> => {
  const response = await fetchWithRetry(buildUrl(`/api/questions/${slug}`));
  return parseJson(response, (value) => questionDetailSchema.parse(value));
};

export const fetchQuestionChatHistory = async (slug: string, mode: InterviewMode): Promise<QuestionChatHistory> => {
  const response = await fetchWithRetry(buildUrl(`/api/questions/${slug}/chat?mode=${mode}`));
  return parseJson(response, (value) => questionChatHistorySchema.parse(value));
};

export const sendQuestionChatMessage = async (slug: string, input: QuestionChatRequest): Promise<QuestionChatResponse> => {
  const response = await fetch(buildUrl(`/api/questions/${slug}/chat`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(questionChatRequestSchema.parse(input))
  });

  return parseJson(response, (value) => questionChatResponseSchema.parse(value));
};

export const createQuestionDraft = async (input: QuestionAuthoringInput): Promise<QuestionDraft> => {
  const payload = questionAuthoringInputSchema.parse(input);
  const response = await fetch(buildUrl("/api/questions/drafts"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => questionDraftSchema.parse(value));
};

export const beautifyQuestionDraft = async (input: QuestionAuthoringInput): Promise<QuestionDraft> => {
  const payload = questionAuthoringInputSchema.parse(input);
  const response = await fetch(buildUrl("/api/questions/drafts/beautify"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => questionDraftSchema.parse(value));
};

export const saveQuestionDraft = async (draft: QuestionDraft): Promise<QuestionDetail> => {
  const payload = questionDraftSchema.parse(draft);
  const response = await fetch(buildUrl("/api/questions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => questionDetailSchema.parse(value));
};

export const beautifyQuestionStageDraft = async (
  slug: string,
  input: QuestionStageAuthoringInput
): Promise<QuestionStageDraft> => {
  const payload = questionStageAuthoringInputSchema.parse(input);
  const response = await fetch(buildUrl(`/api/questions/${slug}/stages/drafts/beautify`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => questionStageDraftSchema.parse(value));
};

export const saveQuestionStageDraft = async (
  slug: string,
  draft: QuestionStageDraft
): Promise<QuestionDetail> => {
  const payload = questionStageDraftSchema.parse(draft);
  const response = await fetch(buildUrl(`/api/questions/${slug}/stages`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => questionDetailSchema.parse(value));
};

export const suggestQuestionStage = async (
  slug: string,
  mode: InterviewMode
): Promise<QuestionStageSuggestion> => {
  const response = await fetchWithRetry(buildUrl(`/api/questions/${slug}/stages/suggest?mode=${mode}`));
  return parseJson(response, (value) => questionStageSuggestionSchema.parse(value));
};

export const createOrResumeSession = async (
  slug: string,
  mode: InterviewMode,
  restart = false
): Promise<InterviewSession> => {
  const response = await fetch(buildUrl(`/api/questions/${slug}/sessions`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ mode, restart })
  });

  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const fetchSession = async (sessionId: string): Promise<InterviewSession> => {
  const response = await fetchWithRetry(buildUrl(`/api/sessions/${sessionId}`));
  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const saveSessionAgent = async (
  sessionId: string,
  agentId: string | null
): Promise<InterviewSession> => {
  const payload = sessionAgentUpdateSchema.parse({ agentId });
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/agent`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const saveStageDraft = async (
  sessionId: string,
  stageId: string,
  answer: string
): Promise<InterviewSession> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/draft`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ answer })
  });

  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const submitStage = async (sessionId: string, stageId: string): Promise<StageEvaluation> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/submit`), {
    method: "POST"
  });

  return parseJson(response, (value) => stageEvaluationSchema.parse(value));
};

export const fetchStageHint = async (sessionId: string, stageId: string): Promise<StageHint> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/hint`), {
    method: "POST"
  });

  return parseJson(response, (value) => stageHintSchema.parse(value));
};

export const fetchStageAnswer = async (sessionId: string, stageId: string): Promise<StageAnswer> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/answer`), {
    method: "POST"
  });

  return parseJson(response, (value) => stageAnswerSchema.parse(value));
};

export const transcribeAudio = async (
  audioBytes: Uint8Array,
  options?: { locale?: string; fileName?: string }
): Promise<{ text: string }> => {
  const uploadBytes = new Uint8Array(audioBytes.byteLength);
  uploadBytes.set(audioBytes);
  const params = new URLSearchParams();
  if (options?.locale) {
    params.set("locale", options.locale);
  }
  if (options?.fileName) {
    params.set("fileName", options.fileName);
  }

  const response = await fetch(buildUrl(`/api/audio/transcribe${params.size > 0 ? `?${params.toString()}` : ""}`), {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav"
    },
    body: new Blob([uploadBytes], { type: "audio/wav" })
  });

  return parseJson(response, (value) => {
    if (typeof value !== "object" || value === null || typeof (value as { text?: unknown }).text !== "string") {
      throw new Error("Invalid audio transcription response");
    }

    return {
      text: (value as { text: string }).text
    };
  });
};

export const fetchStageEvaluations = async (
  sessionId: string,
  stageId: string
): Promise<StageEvaluationHistoryEntry[]> => {
  const response = await fetchWithRetry(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/evaluations`));
  const data = await parseJson(response, (value) => value as { items: unknown });
  return stageEvaluationHistoryEntrySchema.array().parse(data.items);
};

export const resetStage = async (sessionId: string, stageId: string): Promise<InterviewSession> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/reset`), {
    method: "POST"
  });

  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const syncSharedStage = async (sessionId: string, stageId: string): Promise<InterviewSession> => {
  const response = await fetch(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/sync-shared`), {
    method: "POST"
  });

  return parseJson(response, (value) => interviewSessionSchema.parse(value));
};

export const fetchPromptScaffolds = async (
  sessionId: string,
  stageId: string
): Promise<PromptScaffoldBundle> => {
  const response = await fetchWithRetry(buildUrl(`/api/sessions/${sessionId}/stages/${stageId}/prompts`));
  return parseJson(response, (value) => promptScaffoldBundleSchema.parse(value));
};
