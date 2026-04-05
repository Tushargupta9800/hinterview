import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  agentProfileInputSchema,
  agentProfileSchema,
  agentValidationSchema,
  appSettingsSchema,
  appMetaSchema,
  aiProviderSchema,
  draftUpdateSchema,
  interviewSessionSchema,
  promptScaffoldBundleSchema,
  questionAuthoringInputSchema,
  questionDetailSchema,
  questionDraftSchema,
  questionStageAuthoringInputSchema,
  questionStageDraftSchema,
  questionStageSuggestionSchema,
  questionSummarySchema,
  seededQuestions,
  secretCredentialSummarySchema,
  sessionRequestSchema,
  stagePlaygroundAnswerSchema,
  stageAnswerSchema,
  stageEvaluationSchema,
  stageHintSchema,
  telemetryEventSchema,
  learningDashboardSchema,
  learningItemInputSchema,
  learningNoteInputSchema,
  type AgentProfile,
  type AgentProfileInput,
  type AgentValidation,
  type AppSettings,
  type AppMeta,
  type AiProvider,
  type DraftUpdate,
  type InterviewMode,
  type InterviewSession,
  type PromptScaffoldBundle,
  type QuestionAuthoringInput,
  type QuestionDetail,
  type QuestionDraft,
  type QuestionStageDraft,
  type QuestionStageAuthoringInput,
  type QuestionStage,
  type QuestionStageSuggestion,
  type QuestionSummary,
  type SessionRequest,
  type StageAnswer,
  type StageEvaluation,
  type StageEvaluationHistoryEntry,
  type StageHint,
  type TelemetryEvent,
  type LearningItemInput,
  type LearningRecommendation,
  type LearningDashboard,
  type LearningNote,
  type LearningNoteInput,
  type StageProgress,
  type StageStatus
} from "@hinterview/shared";
import { buildPromptScaffolds } from "./ai/prompts.js";
import { invokeProviderJson } from "./ai/runtime.js";
import { validateAgentProfileInput } from "./ai/providers.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "../../..");
const dataDir = path.join(repoRoot, ".data");
const databasePath = path.join(dataDir, "hinterview.sqlite");
const encryptionKeyPath = path.join(dataDir, "secret.key");

fs.mkdirSync(dataDir, { recursive: true });

const database = new Database(databasePath);

database.pragma("journal_mode = WAL");

database.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    focus_area TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL,
    supported_modes_json TEXT NOT NULL,
    scope TEXT NOT NULL,
    detailed_description TEXT NOT NULL DEFAULT '',
    assumptions_json TEXT NOT NULL DEFAULT '[]',
    qps_assumptions_json TEXT NOT NULL DEFAULT '[]',
    in_scope_json TEXT NOT NULL DEFAULT '[]',
    out_of_scope_json TEXT NOT NULL DEFAULT '[]',
    focus_points_json TEXT NOT NULL DEFAULT '[]',
    stages_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    question_slug TEXT NOT NULL,
    question_title TEXT NOT NULL,
    mode TEXT NOT NULL,
    selected_agent_id TEXT,
    status TEXT NOT NULL,
    current_stage_index INTEGER NOT NULL,
    solved_stage_count INTEGER NOT NULL,
    total_stage_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS stage_progress (
    session_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    guidance TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    expected_keywords_json TEXT NOT NULL,
    minimum_words INTEGER NOT NULL DEFAULT 20,
    is_core_focus INTEGER NOT NULL,
    status TEXT NOT NULL,
    draft_answer TEXT NOT NULL DEFAULT '',
    tries_used INTEGER NOT NULL,
    remaining_tries INTEGER NOT NULL,
    max_tries INTEGER NOT NULL,
    last_score REAL,
    last_feedback_summary TEXT,
    last_strengths_json TEXT NOT NULL DEFAULT '[]',
    last_weaknesses_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (session_id, stage_id)
  );

  CREATE TABLE IF NOT EXISTS stage_attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    strengths_json TEXT NOT NULL,
    weaknesses_json TEXT NOT NULL,
    matched_keywords_json TEXT NOT NULL,
    missing_keywords_json TEXT NOT NULL,
    feedback_summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS secret_credentials (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    masked_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS learning_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS learning_item_overrides (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telemetry_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    path TEXT NOT NULL,
    question_slug TEXT,
    mode TEXT,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const appliedMigrationIds = new Set(
  (
    database.prepare("SELECT id FROM schema_migrations ORDER BY applied_at ASC").all() as Array<{ id: string }>
  ).map((row) => row.id)
);

const recordMigration = (id: string, description: string) => {
  if (appliedMigrationIds.has(id)) {
    return;
  }

  database
    .prepare(
      `
        INSERT INTO schema_migrations (id, description, applied_at)
        VALUES (@id, @description, @appliedAt)
      `
    )
    .run({
      id,
      description,
      appliedAt: new Date().toISOString()
    });
  appliedMigrationIds.add(id);
};

const stageProgressColumns = database.prepare("PRAGMA table_info(stage_progress)").all() as Array<{ name: string }>;
if (!stageProgressColumns.some((column) => column.name === "minimum_words")) {
  database.exec("ALTER TABLE stage_progress ADD COLUMN minimum_words INTEGER NOT NULL DEFAULT 20");
}
if (!stageProgressColumns.some((column) => column.name === "last_feedback_summary")) {
  database.exec("ALTER TABLE stage_progress ADD COLUMN last_feedback_summary TEXT");
}
if (!stageProgressColumns.some((column) => column.name === "last_strengths_json")) {
  database.exec("ALTER TABLE stage_progress ADD COLUMN last_strengths_json TEXT NOT NULL DEFAULT '[]'");
}
if (!stageProgressColumns.some((column) => column.name === "last_weaknesses_json")) {
  database.exec("ALTER TABLE stage_progress ADD COLUMN last_weaknesses_json TEXT NOT NULL DEFAULT '[]'");
}

const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
if (!sessionColumns.some((column) => column.name === "selected_agent_id")) {
  database.exec("ALTER TABLE sessions ADD COLUMN selected_agent_id TEXT");
}

const questionColumns = database.prepare("PRAGMA table_info(questions)").all() as Array<{ name: string }>;
if (!questionColumns.some((column) => column.name === "detailed_description")) {
  database.exec("ALTER TABLE questions ADD COLUMN detailed_description TEXT NOT NULL DEFAULT ''");
}
if (!questionColumns.some((column) => column.name === "assumptions_json")) {
  database.exec("ALTER TABLE questions ADD COLUMN assumptions_json TEXT NOT NULL DEFAULT '[]'");
}
if (!questionColumns.some((column) => column.name === "qps_assumptions_json")) {
  database.exec("ALTER TABLE questions ADD COLUMN qps_assumptions_json TEXT NOT NULL DEFAULT '[]'");
}
if (!questionColumns.some((column) => column.name === "in_scope_json")) {
  database.exec("ALTER TABLE questions ADD COLUMN in_scope_json TEXT NOT NULL DEFAULT '[]'");
}
if (!questionColumns.some((column) => column.name === "out_of_scope_json")) {
  database.exec("ALTER TABLE questions ADD COLUMN out_of_scope_json TEXT NOT NULL DEFAULT '[]'");
}
if (!questionColumns.some((column) => column.name === "focus_points_json")) {
  database.exec("ALTER TABLE questions ADD COLUMN focus_points_json TEXT NOT NULL DEFAULT '[]'");
}

recordMigration("001-core-schema", "Initialize core persistence tables.");
recordMigration("002-stage-feedback-columns", "Add stage feedback and strength/weakness persistence.");
recordMigration("003-session-agent-selection", "Add selected agent persistence to sessions.");
recordMigration("004-question-detail-columns", "Add detailed question metadata and QPS assumptions.");
recordMigration("005-hardening-ledger", "Add schema migration ledger and local telemetry event storage.");

type QuestionRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  difficulty: string;
  focus_area: string;
  tags_json: string;
  estimated_minutes: number;
  supported_modes_json: string;
  scope: string;
  detailed_description: string;
  assumptions_json: string;
  qps_assumptions_json: string;
  in_scope_json: string;
  out_of_scope_json: string;
  focus_points_json: string;
  stages_json: string;
};

type SettingsRow = {
  key: string;
  value: string;
};

type SessionRow = {
  id: string;
  question_id: string;
  question_slug: string;
  question_title: string;
  mode: InterviewMode;
  selected_agent_id: string | null;
  status: "active" | "completed";
  current_stage_index: number;
  solved_stage_count: number;
  total_stage_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type StageProgressRow = {
  session_id: string;
  stage_id: string;
  mode: InterviewMode;
  order_index: number;
  title: string;
  prompt: string;
  guidance: string;
  reference_answer: string;
  expected_keywords_json: string;
  minimum_words: number;
  is_core_focus: number;
  status: StageStatus;
  draft_answer: string;
  tries_used: number;
  remaining_tries: number;
  max_tries: number;
  last_score: number | null;
  last_feedback_summary: string | null;
  last_strengths_json: string;
  last_weaknesses_json: string;
};

type SecretCredentialRow = {
  id: string;
  provider: AiProvider;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  masked_key: string;
  created_at: string;
  updated_at: string;
};

type AgentProfileRow = {
  id: string;
  name: string;
  provider: AiProvider;
  model: string;
  system_prompt: string;
  credential_id: string;
  created_at: string;
  updated_at: string;
};

type StageAttemptRow = {
  id: string;
  session_id: string;
  stage_id: string;
  score: number;
  strengths_json: string;
  weaknesses_json: string;
  matched_keywords_json: string;
  missing_keywords_json: string;
  feedback_summary: string;
  created_at: string;
};

type LearningNoteRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type LearningAttemptAggregateRow = {
  id: string;
  session_id: string;
  question_slug: string;
  question_title: string;
  focus_area: QuestionRow["focus_area"];
  mode: InterviewMode;
  stage_id: string;
  stage_title: string;
  score: number;
  weaknesses_json: string;
  feedback_summary: string;
  created_at: string;
};

type LearningItemOverrideRow = {
  id: string;
  item_type: "theme" | "recommendation";
  title: string;
  summary: string;
  deleted: number;
  updated_at: string;
};

const defaultSettings: AppSettings = {
  defaultMaxTries: 3,
  defaultAgentId: null,
  sequentialStageFlow: true
};

if (!fs.existsSync(encryptionKeyPath)) {
  fs.writeFileSync(encryptionKeyPath, randomBytes(32).toString("hex"), { mode: 0o600 });
}

const encryptionKey = Buffer.from(fs.readFileSync(encryptionKeyPath, "utf8").trim(), "hex");

const maskApiKey = (apiKey: string): string => {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};

const toLearningNote = (row: LearningNoteRow): LearningNote => ({
  id: row.id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toActionTitle = (text: string) => {
  const cleaned = text
    .replace(/^did not\s+/i, "")
    .replace(/^does not\s+/i, "")
    .replace(/^missing\s+/i, "")
    .replace(/^lacks\s+/i, "")
    .trim();

  if (!cleaned) {
    return "Improve this area";
  }

  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return capitalized.endsWith(".") ? capitalized : `${capitalized}`;
};

const toActionSummary = (text: string, stageTitle: string) => {
  const normalized = text.toLowerCase();

  if (normalized.includes("functional requirement")) {
    return "List the main user-facing requirements in short bullets and keep each point clearly in scope.";
  }

  if (normalized.includes("non-functional requirement")) {
    return "Write the main quality goals like latency, availability, scale, and reliability in short interview-ready bullets.";
  }

  if (normalized.includes("scope")) {
    return "State the in-scope answer directly and avoid spending time on extra systems the prompt did not ask for.";
  }

  if (normalized.includes("tradeoff")) {
    return "Call out the main tradeoff in one or two direct lines instead of leaving the decision implied.";
  }

  if (normalized.includes("ordering")) {
    return "Mention the ordering rule explicitly and say where relaxed behavior is acceptable.";
  }

  if (normalized.includes("retry")) {
    return "State the retry behavior, failure case, and duplicate-safety expectation in one concise point.";
  }

  return `Answer the ${stageTitle.toLowerCase()} prompt directly in short interview-ready bullets before adding extra detail.`;
};

const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
};

const decryptSecret = (row: SecretCredentialRow): string => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(row.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_value, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

const splitLines = (value: string): string[] =>
  value
    .split(/\r?\n|;/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

const uniqueSlugForTitle = (title: string): string => {
  const base = slugify(title) || `question-${randomUUID().slice(0, 8)}`;
  let candidate = base;
  let index = 2;

  while (database.prepare("SELECT 1 FROM questions WHERE slug = ?").get(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
};

const inferDifficulty = (input: QuestionAuthoringInput): QuestionDraft["difficulty"] => {
  const source = `${input.title} ${input.description} ${input.mainFocusPoint}`.toLowerCase();
  if (/\bbeginner\b|\beasy\b|\bintro\b|\bbasic\b/.test(source)) {
    return "beginner";
  }
  if (/\badvanced\b|\bhard\b|\bcomplex\b|\bdistributed\b|\bpeak\b|\bconsistency\b/.test(source)) {
    return "advanced";
  }
  return "intermediate";
};

const inferFocusArea = (input: QuestionAuthoringInput): QuestionDraft["focusArea"] => {
  const source = `${input.title} ${input.description} ${input.mainFocusPoint}`.toLowerCase();
  if (source.includes("delivery") || source.includes("message") || source.includes("notification")) {
    return "delivery";
  }
  if (source.includes("storage") || source.includes("database") || source.includes("url shortener")) {
    return "storage";
  }
  if (source.includes("consistency") || source.includes("ordering")) {
    return "consistency";
  }
  if (source.includes("entity") || source.includes("object") || source.includes("class")) {
    return "object-modeling";
  }
  if (source.includes("concurrency") || source.includes("reservation") || source.includes("locking")) {
    return "concurrency";
  }
  return "scaling";
};

const normalizeDifficulty = (
  value: unknown,
  fallback: QuestionDraft["difficulty"]
): QuestionDraft["difficulty"] => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "beginner" || normalized === "easy" || normalized === "basic" || normalized === "intro") {
    return "beginner";
  }

  if (
    normalized === "intermediate" ||
    normalized === "medium" ||
    normalized === "mid" ||
    normalized === "moderate"
  ) {
    return "intermediate";
  }

  if (normalized === "advanced" || normalized === "hard" || normalized === "complex") {
    return "advanced";
  }

  return fallback;
};

const inferFocusAreaFromText = (value: string): QuestionDraft["focusArea"] => {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("concurrency") ||
    normalized.includes("booking") ||
    normalized.includes("reservation") ||
    normalized.includes("locking") ||
    normalized.includes("availability and concurrent")
  ) {
    return "concurrency";
  }
  if (normalized.includes("delivery") || normalized.includes("message") || normalized.includes("notification")) {
    return "delivery";
  }
  if (
    normalized.includes("storage") ||
    normalized.includes("database") ||
    normalized.includes("persistence") ||
    normalized.includes("read heavy") ||
    normalized.includes("write heavy")
  ) {
    return "storage";
  }
  if (normalized.includes("consistency") || normalized.includes("ordering")) {
    return "consistency";
  }
  if (normalized.includes("entity") || normalized.includes("object") || normalized.includes("class")) {
    return "object-modeling";
  }
  return "scaling";
};

const normalizeFocusArea = (
  value: unknown,
  fallback: QuestionDraft["focusArea"]
): QuestionDraft["focusArea"] => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (
    normalized === "scaling" ||
    normalized === "concurrency" ||
    normalized === "consistency" ||
    normalized === "storage" ||
    normalized === "object-modeling" ||
    normalized === "delivery"
  ) {
    return normalized;
  }

  if (!normalized) {
    return fallback;
  }

  return inferFocusAreaFromText(normalized);
};

const normalizeSupportedModes = (
  value: unknown,
  fallback: InterviewMode[]
): InterviewMode[] => {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized = rawItems
    .flatMap((item) =>
      typeof item === "string"
        ? item
            .toLowerCase()
            .split(/[,/|]+/)
            .map((part) => part.trim())
        : []
    )
    .map((item) => {
      if (item === "high level" || item === "high-level" || item === "hld") {
        return "hld";
      }
      if (item === "low level" || item === "low-level" || item === "lld") {
        return "lld";
      }
      return item;
    })
    .filter((item): item is InterviewMode => item === "hld" || item === "lld");

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
};

const normalizeQuestionDraft = (value: unknown, input: QuestionAuthoringInput): QuestionDraft => {
  const fallbackDraft = buildDefaultQuestionDraft(input);
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const normalizedStages = Array.isArray(record.stages) ? record.stages.slice(0, 16) : fallbackDraft.stages;
  const toStringArray = (candidate: unknown, fallback: string[]) =>
    Array.isArray(candidate)
      ? candidate.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : fallback;
  const normalized: Record<string, unknown> = {
    ...record,
    difficulty: normalizeDifficulty(record.difficulty, fallbackDraft.difficulty),
    focusArea: normalizeFocusArea(record.focusArea, fallbackDraft.focusArea),
    supportedModes: normalizeSupportedModes(record.supportedModes, fallbackDraft.supportedModes),
    tags: toStringArray(record.tags, fallbackDraft.tags),
    assumptions: toStringArray(record.assumptions, fallbackDraft.assumptions),
    qpsAssumptions: toStringArray(record.qpsAssumptions, fallbackDraft.qpsAssumptions),
    inScope: toStringArray(record.inScope, fallbackDraft.inScope),
    outOfScope: toStringArray(record.outOfScope, fallbackDraft.outOfScope),
    focusPoints: toStringArray(record.focusPoints, fallbackDraft.focusPoints),
    stages: normalizedStages
  };

  return questionDraftSchema.parse(normalized);
};

const buildDefaultQpsAssumptions = (input: QuestionAuthoringInput): string[] => {
  const source = `${input.title} ${input.description} ${input.mainFocusPoint}`.toLowerCase();

  if (source.includes("shortener") || source.includes("redirect")) {
    return [
      "Assume writes are moderate, around a few hundred to one thousand requests per second at peak.",
      "Assume reads are much higher than writes, often tens of thousands of redirect lookups per second at peak.",
      "Assume the main scale pressure is on the read path, not the create path."
    ];
  }

  if (source.includes("rate limit")) {
    return [
      "Assume the hot path serves a very large request volume, often above one hundred thousand checks per second across the fleet.",
      "Assume limiter latency budget is only a few milliseconds.",
      "Assume policy updates are rare compared to request checks."
    ];
  }

  if (source.includes("chat") || source.includes("message")) {
    return [
      "Assume sustained message-send traffic in the low thousands of requests per second at peak.",
      "Assume recent-history reads are common but still secondary to the hot write-and-deliver path."
    ];
  }

  if (source.includes("order") || source.includes("inventory") || source.includes("reservation")) {
    return [
      "Assume flash-sale spikes can reach tens of thousands of writes per second.",
      "Assume a small set of hot keys or SKUs receives a large share of traffic."
    ];
  }

  if (source.includes("scale") || source.includes("throughput") || source.includes("traffic")) {
    return [
      "Assume peak traffic is meaningfully higher than average traffic and should be stated before design tradeoffs.",
      "Assume read and write traffic are not necessarily balanced, so the interview should call out which side is hotter."
    ];
  }

  return [];
};

const buildDefaultTags = (input: QuestionAuthoringInput): string[] =>
  Array.from(
    new Set(
      [
        slugify(input.title).replace(/-/g, " "),
        input.mainFocusPoint,
        ...splitLines(input.sampleQuestions)
      ]
        .flatMap((item) => item.split(/[,\s]+/))
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 3 && item.length <= 24)
    )
  )
    .slice(0, 6)
    .map((item) => item.replace(/\s+/g, "-"));

const stageReferenceFromTitle = (title: string, focus: string): string => {
  const normalized = title.toLowerCase();

  if (normalized === "functional requirements") {
    return "List only the main user-facing capabilities in scope for this problem. Keep each point short, concrete, and interview-ready.";
  }
  if (normalized === "non-functional requirements") {
    return "List the quality goals that matter most here, such as latency, availability, scale, durability, or consistency, and say which ones matter most.";
  }
  if (normalized === "core entities") {
    return "Define the smallest useful entity set, the key fields each entity carries, and the main relationships between them.";
  }
  if (normalized === "api routes") {
    return "Write the main request flows or APIs in simple interview shorthand, with enough detail to show intent and ownership.";
  }
  if (normalized.includes("high level")) {
    return `Describe the main components and request flow for ${focus} in simple interview-ready language.`;
  }
  if (normalized.includes("low level")) {
    return `Define the main modules, classes, or services needed to implement ${focus}, along with their boundaries and responsibilities.`;
  }
  return `Answer this stage directly and stay focused on ${focus}.`;
};

const buildDefaultQuestionDraft = (inputValue: QuestionAuthoringInput): QuestionDraft => {
  const input = questionAuthoringInputSchema.parse(inputValue);
  const difficulty = inferDifficulty(input);
  const focusArea = inferFocusArea(input);
  const title = input.title.trim();
  const description = input.description.trim();
  const focus = input.mainFocusPoint.trim();
  const assumptions = splitLines(input.assumptions);
  const outOfScope = splitLines(input.outOfScope);
  const sampleLines = splitLines(input.sampleQuestions);
  const supportedModes = input.supportedModes;
  const qpsAssumptions = buildDefaultQpsAssumptions(input);

  const buildCommonStagesForMode = (mode: InterviewMode) => {
    const items: QuestionDraft["stages"] = [
      {
        mode,
        title: "Functional requirements",
        prompt: `For ${title}, what functional requirements are in scope if the surrounding platform pieces already exist?`,
        guidance: "List only the core user-facing capabilities. Stay tightly inside the asked scope.",
        referenceAnswer: stageReferenceFromTitle("Functional requirements", focus),
        expectedKeywords: ["scope", "user", "flow", "requirement"],
        minimumWords: 20,
        isCoreFocus: false
      },
      {
        mode,
        title: "Non-functional requirements",
        prompt: `For ${title}, what non-functional requirements should guide the design discussion?`,
        guidance: "Focus on the quality goals that actually shape the design. Keep it brief and interview-ready.",
        referenceAnswer: stageReferenceFromTitle("Non-functional requirements", focus),
        expectedKeywords: ["latency", "availability", "scale", "reliability"],
        minimumWords: 20,
        isCoreFocus: false
      }
    ];

    if (supportedModes.length === 2 || mode === "lld") {
      items.push(
        {
          mode,
          title: "Core entities",
          prompt: `For ${title}, what are the core entities or state records needed to support ${focus}?`,
          guidance: "Keep the entity list small and relevant to the actual interview scope.",
          referenceAnswer: stageReferenceFromTitle("Core entities", focus),
          expectedKeywords: ["entity", "id", "state", "field"],
          minimumWords: 18,
          isCoreFocus: false
        },
        {
          mode,
          title: "API routes",
          prompt: `For ${title}, what are the main APIs or request flows needed to support the core use cases?`,
          guidance: "Shorthand route notation is fine. Focus on intent, not exhaustive coverage.",
          referenceAnswer: stageReferenceFromTitle("API routes", focus),
          expectedKeywords: ["post", "get", "request", "response"],
          minimumWords: 18,
          isCoreFocus: false
        }
      );
    }

    return items;
  };

  const stages: QuestionDraft["stages"] = [
    ...supportedModes.flatMap((mode) => buildCommonStagesForMode(mode)),
    ...(supportedModes.includes("hld")
      ? [
          {
            mode: "hld" as const,
            title: "High level design",
            prompt: `What is your high-level architecture for ${focus} in ${title}?`,
            guidance: "Explain the main components, request flow, and why each component exists.",
            referenceAnswer: stageReferenceFromTitle("High level design", focus),
            expectedKeywords: ["component", "flow", "service", "storage", "tradeoff"],
            minimumWords: 28,
            isCoreFocus: true
          },
          {
            mode: "hld" as const,
            title: qpsAssumptions.length > 0 ? "Scale, QPS, and tradeoffs" : "Scale and tradeoffs",
            prompt: qpsAssumptions.length > 0
              ? `Using the stated QPS assumptions, what scaling or tradeoff decisions matter most for ${title}?`
              : `What scaling or tradeoff decisions matter most for ${title}?`,
            guidance: "Use the assumed traffic shape only if it changes the design. Stay on one main focus.",
            referenceAnswer: `Explain the main scaling path, the hottest traffic path, and the most important tradeoff for ${focus} without drifting into unrelated systems.`,
            expectedKeywords: ["scale", "latency", "throughput", "tradeoff"],
            minimumWords: 24,
            isCoreFocus: true
          }
        ]
      : []),
    ...(supportedModes.includes("lld")
      ? [
          {
            mode: "lld" as const,
            title: "Low level design",
            prompt: `What classes, modules, or services would you define to implement ${focus} in ${title}?`,
            guidance: "Focus on responsibilities, boundaries, and simple interfaces.",
            referenceAnswer: stageReferenceFromTitle("Low level design", focus),
            expectedKeywords: ["service", "class", "module", "interface"],
            minimumWords: 24,
            isCoreFocus: true
          },
          {
            mode: "lld" as const,
            title: "Correctness and edge cases",
            prompt: `How will your low-level design keep ${focus} correct under retries, concurrency, or failure cases?`,
            guidance: "Discuss only the correctness mechanisms that matter for this design.",
            referenceAnswer: `Explain the main correctness guardrails for ${focus}, such as idempotency, state transitions, validation, or concurrency safety.`,
            expectedKeywords: ["correctness", "retry", "state", "validation"],
            minimumWords: 24,
            isCoreFocus: true
          }
        ]
      : [])
  ];

  return questionDraftSchema.parse({
    title,
    summary: description.slice(0, 220),
    difficulty,
    focusArea,
    tags: buildDefaultTags(input),
    supportedModes,
    scope: `Focus only on ${focus}. ${outOfScope.length > 0 ? `Assume these are already handled or out of scope: ${outOfScope.join(", ")}.` : ""}`.trim(),
    detailedDescription: description,
    assumptions: assumptions.length > 0 ? assumptions : ["State only the assumptions that change the design discussion."],
    qpsAssumptions,
    inScope: [focus, ...sampleLines].slice(0, 8),
    outOfScope: outOfScope.length > 0 ? outOfScope : ["Anything not needed for the main focus point."],
    focusPoints: [focus, ...sampleLines].slice(0, 8),
    stages
  });
};

const buildQuestionAuthoringPrompt = (
  input: QuestionAuthoringInput,
  relatedQuestion: QuestionDetail | null
) => {
  const relatedContext = relatedQuestion
    ? {
        title: relatedQuestion.title,
        summary: relatedQuestion.summary,
        scope: relatedQuestion.scope,
        focusPoints: relatedQuestion.focusPoints,
        outOfScope: relatedQuestion.outOfScope,
        supportedModes: relatedQuestion.supportedModes
      }
    : null;

  const compactInput = {
    t: input.title,
    d: input.description,
    f: input.mainFocusPoint,
    o: input.outOfScope,
    a: input.assumptions,
    m: input.supportedModes,
    s: input.sampleQuestions,
    rp: input.relatedQuestionPrompt,
    rq: relatedContext
      ? {
          t: relatedContext.title,
          s: relatedContext.summary,
          sc: relatedContext.scope,
          fp: relatedContext.focusPoints,
          oo: relatedContext.outOfScope,
          m: relatedContext.supportedModes
        }
      : null
  };

  return [
    "Return one raw JSON object only. No markdown. No code fence. No extra text.",
    "Create one focused mock system-design interview question.",
    "Use one major focus point only.",
    "Difficulty must be one of: beginner, intermediate, advanced.",
    "focusArea must be one of: scaling, concurrency, consistency, storage, object-modeling, delivery.",
    "supportedModes must contain only hld and/or lld.",
    "If both modes exist, shared stages in both modes should be: Functional requirements, Non-functional requirements, Core entities, API routes.",
    "Keep total stage count between 4 and 16.",
    "Include qpsAssumptions only if traffic assumptions are useful before scaling discussion.",
    "Required top-level fields: title, summary, difficulty, focusArea, tags, supportedModes, scope, detailedDescription, assumptions, qpsAssumptions, inScope, outOfScope, focusPoints, stages.",
    "Each stage fields: mode, title, prompt, guidance, referenceAnswer, expectedKeywords, minimumWords, isCoreFocus.",
    JSON.stringify(compactInput)
  ].join("\n");
};

const getDefaultAgentProfileOrThrow = (): AgentProfile => {
  const settings = getSettings();
  const profileId = settings.defaultAgentId ?? listAgentProfiles()[0]?.id ?? null;
  if (!profileId) {
    throw new Error("Add an AI agent profile before using AI question generation");
  }

  const profile = getAgentProfileById(profileId);
  if (!profile) {
    throw new Error("Default AI agent profile not found");
  }

  return profile;
};

const createQuestionDetailFromDraft = (draftValue: QuestionDraft): QuestionDetail => {
  const draft = questionDraftSchema.parse(draftValue);
  const slug = uniqueSlugForTitle(draft.title);
  const perModeOrder = new Map<InterviewMode, number>();
  const maxTries = getSettings().defaultMaxTries;

  const stages = draft.stages.map((stage) => {
    const currentOrder = perModeOrder.get(stage.mode) ?? 0;
    perModeOrder.set(stage.mode, currentOrder + 1);
    const stageSlug = slugify(stage.title) || `stage-${currentOrder + 1}`;

    return {
      id: `${stage.mode}-${slug}-${stageSlug}-${currentOrder + 1}`,
      mode: stage.mode,
      title: stage.title.trim(),
      prompt: stage.prompt.trim(),
      guidance: stage.guidance.trim(),
      referenceAnswer: stage.referenceAnswer.trim(),
      expectedKeywords: stage.expectedKeywords.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      orderIndex: currentOrder,
      minimumWords: stage.minimumWords,
      isCoreFocus: stage.isCoreFocus,
      maxTries
    };
  });

  for (const mode of draft.supportedModes) {
    if (!stages.some((stage) => stage.mode === mode)) {
      throw new Error(`Generated question is missing ${mode.toUpperCase()} stages`);
    }
  }

  return questionDetailSchema.parse({
    id: `q_custom_${slug}`,
    slug,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    difficulty: draft.difficulty,
    focusArea: draft.focusArea,
    tags: draft.tags.map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    supportedModes: draft.supportedModes,
    scope: draft.scope.trim(),
    detailedDescription: draft.detailedDescription.trim(),
    assumptions: draft.assumptions.map((item) => item.trim()).filter(Boolean),
    qpsAssumptions: draft.qpsAssumptions.map((item) => item.trim()).filter(Boolean),
    inScope: draft.inScope.map((item) => item.trim()).filter(Boolean),
    outOfScope: draft.outOfScope.map((item) => item.trim()).filter(Boolean),
    focusPoints: draft.focusPoints.map((item) => item.trim()).filter(Boolean),
    stages
  });
};

const normalizeQuestionStageDraft = (
  value: unknown,
  mode: InterviewMode,
  fallbackPrompt: string
): QuestionStageDraft => {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const title =
    typeof record.title === "string" && record.title.trim().length > 0
      ? record.title.trim()
      : "Additional stage";
  const prompt =
    typeof record.prompt === "string" && record.prompt.trim().length > 0
      ? record.prompt.trim()
      : fallbackPrompt;
  const guidance =
    typeof record.guidance === "string" && record.guidance.trim().length > 0
      ? record.guidance.trim()
      : "Keep the answer scoped to this stage only and write it in simple interview-ready language.";
  const referenceAnswer =
    typeof record.referenceAnswer === "string" && record.referenceAnswer.trim().length > 0
      ? record.referenceAnswer.trim()
      : `Answer the ${title.toLowerCase()} stage directly and keep it scoped to the current problem.`;
  const expectedKeywords = Array.isArray(record.expectedKeywords)
    ? record.expectedKeywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : ["scope", "design"];
  const minimumWords =
    typeof record.minimumWords === "number" && Number.isFinite(record.minimumWords)
      ? Math.max(1, Math.min(500, Math.round(record.minimumWords)))
      : 18;

  return questionStageDraftSchema.parse({
    mode,
    title,
    prompt,
    guidance,
    referenceAnswer,
    expectedKeywords: expectedKeywords.length > 0 ? expectedKeywords : ["scope", "design"],
    minimumWords,
    isCoreFocus: Boolean(record.isCoreFocus)
  });
};

const buildQuestionStageAuthoringPrompt = (
  question: QuestionDetail,
  mode: InterviewMode,
  sampleQuestion: string
) =>
  [
    "Return one raw JSON object only. No markdown. No code fence. No extra text.",
    "Create one additional stage for the existing interview question.",
    "Keep it tightly scoped to the current question.",
    "Do not repeat an existing stage.",
    "Use this exact mode only: " + mode,
    "Fields required: mode, title, prompt, guidance, referenceAnswer, expectedKeywords, minimumWords, isCoreFocus.",
    JSON.stringify({
      q: question.title,
      sc: question.scope,
      fp: question.focusPoints,
      st: question.stages.filter((stage) => stage.mode === mode).map((stage) => stage.title),
      sq: sampleQuestion
    })
  ].join("\n");

const buildQuestionStageSuggestionPrompt = (question: QuestionDetail, mode: InterviewMode) =>
  [
    "Return one raw JSON object only. No markdown. No code fence. No extra text.",
    "Suggest one good next stage question for this existing mock system-design problem.",
    "It must fit the current problem and current mode.",
    "It must not repeat an existing stage title or ask for the same thing again.",
    "Keep it focused, interview-ready, and answerable in one stage.",
    "Return field: sampleQuestion.",
    JSON.stringify({
      q: question.title,
      sc: question.scope,
      fp: question.focusPoints,
      m: mode,
      existingStages: question.stages
        .filter((stage) => stage.mode === mode)
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((stage) => stage.title)
    })
  ].join("\n");

const insertQuestion = database.prepare(`
  INSERT OR REPLACE INTO questions (
    id,
    slug,
    title,
    summary,
    difficulty,
    focus_area,
    tags_json,
    estimated_minutes,
    supported_modes_json,
    scope,
    detailed_description,
    assumptions_json,
    qps_assumptions_json,
    in_scope_json,
    out_of_scope_json,
    focus_points_json,
    stages_json
  ) VALUES (
    @id,
    @slug,
    @title,
    @summary,
    @difficulty,
    @focus_area,
    @tags_json,
    @estimated_minutes,
    @supported_modes_json,
    @scope,
    @detailed_description,
    @assumptions_json,
    @qps_assumptions_json,
    @in_scope_json,
    @out_of_scope_json,
    @focus_points_json,
    @stages_json
  )
`);

const persistQuestion = (question: QuestionDetail) => {
  insertQuestion.run({
    id: question.id,
    slug: question.slug,
    title: question.title,
    summary: question.summary,
    difficulty: question.difficulty,
    focus_area: question.focusArea,
    tags_json: JSON.stringify(question.tags),
    estimated_minutes: 0,
    supported_modes_json: JSON.stringify(question.supportedModes),
    scope: question.scope,
    detailed_description: question.detailedDescription,
    assumptions_json: JSON.stringify(question.assumptions),
    qps_assumptions_json: JSON.stringify(question.qpsAssumptions ?? []),
    in_scope_json: JSON.stringify(question.inScope),
    out_of_scope_json: JSON.stringify(question.outOfScope),
    focus_points_json: JSON.stringify(question.focusPoints),
    stages_json: JSON.stringify(question.stages)
  });
};

const upsertSeedQuestions = () => {

  const seedTransaction = database.transaction((questions: QuestionDetail[]) => {
    for (const question of questions) {
      persistQuestion(question);
    }
  });

  seedTransaction(seededQuestions);
};

const upsertDefaultSettings = () => {
  const insert = database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)");
  insert.run("defaultMaxTries", String(defaultSettings.defaultMaxTries));
  insert.run("defaultAgentId", "");
};

upsertSeedQuestions();
upsertDefaultSettings();

const toQuestionDetail = (row: QuestionRow): QuestionDetail =>
  questionDetailSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    difficulty: row.difficulty,
    focusArea: row.focus_area,
    tags: JSON.parse(row.tags_json),
    supportedModes: JSON.parse(row.supported_modes_json),
    scope: row.scope,
    detailedDescription: row.detailed_description,
    assumptions: JSON.parse(row.assumptions_json),
    qpsAssumptions: JSON.parse(row.qps_assumptions_json),
    inScope: JSON.parse(row.in_scope_json),
    outOfScope: JSON.parse(row.out_of_scope_json),
    focusPoints: JSON.parse(row.focus_points_json),
    stages: JSON.parse(row.stages_json)
  });

const toStageProgress = (row: StageProgressRow): StageProgress => ({
  stageId: row.stage_id,
  mode: row.mode,
  orderIndex: row.order_index,
  title: row.title,
  prompt: row.prompt,
  guidance: row.guidance,
  referenceAnswer: row.reference_answer,
  expectedKeywords: JSON.parse(row.expected_keywords_json),
  minimumWords: row.minimum_words,
  isCoreFocus: Boolean(row.is_core_focus),
  status: row.status,
  draftAnswer: row.draft_answer,
  triesUsed: row.tries_used,
  remainingTries: row.remaining_tries,
  maxTries: row.max_tries,
  lastScore: row.last_score,
  lastFeedbackSummary: row.last_feedback_summary,
  lastStrengths: JSON.parse(row.last_strengths_json),
  lastWeaknesses: JSON.parse(row.last_weaknesses_json)
});

const toStageEvaluationHistoryEntry = (row: StageAttemptRow): StageEvaluationHistoryEntry => ({
  id: row.id,
  sessionId: row.session_id,
  stageId: row.stage_id,
  score: row.score,
  strengths: JSON.parse(row.strengths_json),
  weaknesses: JSON.parse(row.weaknesses_json),
  matchedKeywords: JSON.parse(row.matched_keywords_json),
  missingKeywords: JSON.parse(row.missing_keywords_json),
  feedbackSummary: row.feedback_summary,
  createdAt: row.created_at
});

const computeCompletionPercent = (stages: StageProgress[]): number => {
  const completedCount = stages.filter((stage) => stage.status === "solved" || stage.status === "revealed").length;
  return Math.round((completedCount / stages.length) * 100);
};

const computeSolvedStageCount = (stages: StageProgress[]): number =>
  stages.filter((stage) => stage.status === "solved").length;

const currentStageIndexFromStages = (stages: StageProgress[]): number => {
  const activeStage = stages.find((stage) => stage.status === "active");
  if (activeStage) {
    return activeStage.orderIndex;
  }

  const completedCount = stages.filter((stage) => stage.status === "solved" || stage.status === "revealed").length;
  return Math.max(0, Math.min(completedCount, stages.length - 1));
};

const updateSessionAggregate = (sessionId: string) => {
  const stages = getStageProgressRows(sessionId).map(toStageProgress);
  const solvedStageCount = computeSolvedStageCount(stages);
  const currentStageIndex = currentStageIndexFromStages(stages);
  const hasActiveStage = stages.some((stage) => stage.status === "active");
  const status = hasActiveStage ? "active" : "completed";
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE sessions
       SET solved_stage_count = ?,
           current_stage_index = ?,
           status = ?,
           updated_at = ?,
           completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END
       WHERE id = ?`
    )
    .run(solvedStageCount, currentStageIndex, status, now, status, now, sessionId);
};

const getQuestionRows = (): QuestionRow[] =>
  database.prepare("SELECT * FROM questions ORDER BY title ASC").all() as QuestionRow[];

const getStageProgressRows = (sessionId: string): StageProgressRow[] =>
  database
    .prepare("SELECT * FROM stage_progress WHERE session_id = ? ORDER BY order_index ASC")
    .all(sessionId) as StageProgressRow[];

const getSessionRow = (sessionId: string): SessionRow | null => {
  const row = database.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
  return row ?? null;
};

const hydrateSession = (sessionId: string): InterviewSession | null => {
  const session = getSessionRow(sessionId);
  if (!session) {
    return null;
  }

  backfillSharedStageDataFromOtherMode(sessionId);

  const stages = getStageProgressRows(sessionId).map(toStageProgress);

  return interviewSessionSchema.parse({
    id: session.id,
    questionId: session.question_id,
    questionSlug: session.question_slug,
    questionTitle: session.question_title,
    mode: session.mode,
    selectedAgentId: session.selected_agent_id,
    status: session.status,
    currentStageIndex: session.current_stage_index,
    solvedStageCount: session.solved_stage_count,
    totalStageCount: session.total_stage_count,
    completionPercent: computeCompletionPercent(stages),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    stages
  });
};

const getQuestionBySlugInternal = (slug: string): QuestionDetail | null => {
  const row = database.prepare("SELECT * FROM questions WHERE slug = ?").get(slug) as QuestionRow | undefined;
  return row ? toQuestionDetail(row) : null;
};

const isSessionCompatible = (sessionId: string): boolean => {
  const session = getSessionRow(sessionId);
  if (!session) {
    return false;
  }

  const question = getQuestionBySlugInternal(session.question_slug);
  if (!question) {
    return false;
  }

  const validStageIds = new Set(
    question.stages.filter((stage) => stage.mode === session.mode).map((stage) => stage.id)
  );
  const stageRows = getStageProgressRows(sessionId);

  return stageRows.length > 0 && stageRows.every((stage) => validStageIds.has(stage.stage_id));
};

const getLatestActiveSessionRow = (questionSlug: string, mode: InterviewMode): SessionRow | null => {
  const rows = database
    .prepare(
      `SELECT * FROM sessions
       WHERE question_slug = ? AND mode = ? AND status = 'active'
       ORDER BY updated_at DESC`
    )
    .all(questionSlug, mode) as SessionRow[];

  return rows.find((row) => isSessionCompatible(row.id)) ?? null;
};

const isFullySolvedSession = (sessionId: string): boolean => {
  const session = hydrateSession(sessionId);
  return session?.stages.every((stage) => stage.status === "solved") ?? false;
};

const getPreferredSessionRow = (questionSlug: string, mode: InterviewMode): SessionRow | null => {
  const rows = database
    .prepare(
      `SELECT * FROM sessions
       WHERE question_slug = ? AND mode = ?
       ORDER BY updated_at DESC`
    )
    .all(questionSlug, mode) as SessionRow[];

  const compatibleRows = rows.filter((row) => isSessionCompatible(row.id));
  if (compatibleRows.length === 0) {
    return null;
  }

  const fullySolved = compatibleRows.find((row) => isFullySolvedSession(row.id));
  if (fullySolved) {
    return fullySolved;
  }

  return compatibleRows.find((row) => row.status === "active") ?? compatibleRows[0] ?? null;
};

const getQuestionProgressMap = (): Map<string, QuestionSummary["progress"]> => {
  const rows = database
    .prepare(
      `SELECT question_slug, mode, status, updated_at, id
       FROM sessions
       ORDER BY updated_at DESC`
    )
    .all() as Array<{
      question_slug: string;
      mode: InterviewMode;
      status: "active" | "completed";
      updated_at: string;
      id: string;
    }>;

  const map = new Map<string, QuestionSummary["progress"]>();
  const latestModeSeen = new Set<string>();

  for (const row of rows) {
    if (!isSessionCompatible(row.id)) {
      continue;
    }

    const existing = map.get(row.question_slug) ?? {
      hasActiveSession: false,
      activeMode: null,
      solvedModes: [],
      completionPercent: 0,
      modeCompletionPercent: {
        hld: 0,
        lld: 0
      },
      modeHasActiveSession: {
        hld: false,
        lld: false
      }
    };

    const session = hydrateSession(row.id);
    const completionPercent = session?.completionPercent ?? existing.completionPercent;
    const latestModeKey = `${row.question_slug}:${row.mode}`;
    const hasIncompleteStage =
      session?.stages.some((stage) => stage.status === "active" || stage.status === "locked") ?? (row.status === "active");
    const allStagesSolved = session?.stages.every((stage) => stage.status === "solved") ?? false;

    if (!latestModeSeen.has(latestModeKey)) {
      existing.modeHasActiveSession[row.mode] = hasIncompleteStage && !allStagesSolved;
      if (existing.modeHasActiveSession[row.mode] && !existing.hasActiveSession) {
        existing.hasActiveSession = true;
        existing.activeMode = row.mode;
        existing.completionPercent = completionPercent;
      }
      latestModeSeen.add(latestModeKey);
    }

    existing.modeCompletionPercent[row.mode] = Math.max(existing.modeCompletionPercent[row.mode] ?? 0, completionPercent);

    if (allStagesSolved) {
      if (!existing.solvedModes.includes(row.mode)) {
        existing.solvedModes.push(row.mode);
      }
      existing.modeHasActiveSession[row.mode] = false;
      if (existing.activeMode === row.mode) {
        existing.activeMode = null;
      }
      existing.hasActiveSession = Object.values(existing.modeHasActiveSession).some(Boolean);
      existing.completionPercent = Math.max(existing.completionPercent, completionPercent);
    } else {
      existing.completionPercent = Math.max(existing.completionPercent, completionPercent);
    }

    map.set(row.question_slug, existing);
  }

  return map;
};

const recalculateStageStatuses = (sessionId: string) => {
  const rows = getStageProgressRows(sessionId);
  let activeAssigned = false;

  const update = database.prepare("UPDATE stage_progress SET status = ? WHERE session_id = ? AND stage_id = ?");

  for (const row of rows) {
    if (row.status === "solved" || row.status === "revealed") {
      continue;
    }

    if (!activeAssigned) {
      update.run("active", sessionId, row.stage_id);
      activeAssigned = true;
    } else {
      update.run("locked", sessionId, row.stage_id);
    }
  }

  updateSessionAggregate(sessionId);
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countWords = (value: string): number => {
  let source = value;

  try {
    const parsed = stagePlaygroundAnswerSchema.parse(JSON.parse(value));
    source = parsed.plainText;
  } catch {
    source = value;
  }

  const normalized = normalizeText(source);
  return normalized.length === 0 ? 0 : normalized.split(" ").length;
};

const sharedStageTitles = new Set([
  "Functional requirements",
  "Non-functional requirements",
  "Core entities",
  "API routes"
]);

const getCrossModeSharedStageKey = (stage: Pick<QuestionStage, "title">): string | null =>
  sharedStageTitles.has(stage.title) ? stage.title : null;

const normalizeSharedDraftAnswerForTarget = (
  rawDraftAnswer: string,
  questionSlug: string,
  targetMode: InterviewMode,
  targetStageId: string
): string => {
  if (!rawDraftAnswer.trim()) {
    return rawDraftAnswer;
  }

  try {
    const parsed = stagePlaygroundAnswerSchema.parse(JSON.parse(rawDraftAnswer));
    return JSON.stringify(
      stagePlaygroundAnswerSchema.parse({
        ...parsed,
        questionSlug,
        mode: targetMode,
        stageId: targetStageId,
        frame: {
          ...parsed.frame,
          stageId: targetStageId
        },
        items: parsed.items.map((item) => ({
          ...item,
          stageId: targetStageId
        }))
      })
    );
  } catch {
    return rawDraftAnswer;
  }
};

const getQuestionStageDefinition = (sessionId: string, stageId: string): QuestionStage => {
  const session = getSessionRow(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const question = getQuestionBySlugInternal(session.question_slug);
  if (!question) {
    throw new Error("Question not found");
  }

  const stage = question.stages.find((candidate) => candidate.id === stageId && candidate.mode === session.mode);
  if (!stage) {
    throw new Error("Stage definition not found");
  }

  return stage;
};

const findEquivalentStageForMode = (
  question: QuestionDetail,
  sourceStage: QuestionStage,
  targetMode: InterviewMode
): QuestionStage | null => {
  const sharedKey = getCrossModeSharedStageKey(sourceStage);
  if (!sharedKey) {
    return null;
  }

  return (
    question.stages.find((candidate) => candidate.mode === targetMode && getCrossModeSharedStageKey(candidate) === sharedKey) ??
    null
  );
};

const getCompatibleSessionsForQuestion = (questionSlug: string): SessionRow[] =>
  (database
    .prepare(
      `SELECT *
       FROM sessions
       WHERE question_slug = ?
       ORDER BY updated_at DESC`
    )
    .all(questionSlug) as SessionRow[]).filter((row) => isSessionCompatible(row.id));

const copySharedStageDataFromOtherMode = (sessionId: string, stageId: string): boolean => {
  const session = getSessionRow(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const question = getQuestionBySlugInternal(session.question_slug);
  if (!question) {
    throw new Error("Question not found");
  }

  const targetDefinition = question.stages.find((candidate) => candidate.id === stageId && candidate.mode === session.mode);
  if (!targetDefinition) {
    throw new Error("Stage definition not found");
  }

  const sharedKey = getCrossModeSharedStageKey(targetDefinition);
  if (!sharedKey) {
    return false;
  }

  const targetStageRow = database
    .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
    .get(sessionId, stageId) as StageProgressRow | undefined;
  if (!targetStageRow) {
    throw new Error("Stage progress not found");
  }

  const relatedSessions = getCompatibleSessionsForQuestion(session.question_slug).filter(
    (row) => row.id !== sessionId && row.mode !== session.mode
  );

  const updateStage = database.prepare(
    `UPDATE stage_progress
     SET draft_answer = ?,
         reference_answer = ?,
         last_score = ?,
         last_feedback_summary = ?,
         last_strengths_json = ?,
         last_weaknesses_json = ?
     WHERE session_id = ? AND stage_id = ?`
  );

  for (const relatedSession of relatedSessions) {
    const sourceDefinition = question.stages.find(
      (candidate) => candidate.mode === relatedSession.mode && getCrossModeSharedStageKey(candidate) === sharedKey
    );
    if (!sourceDefinition) {
      continue;
    }

    const sourceStageRow = database
      .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
      .get(relatedSession.id, sourceDefinition.id) as StageProgressRow | undefined;

    if (!sourceStageRow) {
      continue;
    }

    const sourceStrengths = JSON.parse(sourceStageRow.last_strengths_json) as string[];
    const sourceWeaknesses = JSON.parse(sourceStageRow.last_weaknesses_json) as string[];
    const hasUsefulDraft = sourceStageRow.draft_answer.trim().length > 0;
    const hasUsefulReferenceAnswer = sourceStageRow.reference_answer.trim().length > 0;
    const hasUsefulEvaluation =
      sourceStageRow.last_score !== null ||
      sourceStageRow.last_feedback_summary !== null ||
      sourceStrengths.length > 0 ||
      sourceWeaknesses.length > 0;

    if (!hasUsefulDraft && !hasUsefulReferenceAnswer && !hasUsefulEvaluation) {
      continue;
    }

    updateStage.run(
      hasUsefulDraft
        ? normalizeSharedDraftAnswerForTarget(sourceStageRow.draft_answer, session.question_slug, session.mode, stageId)
        : targetStageRow.draft_answer,
      hasUsefulReferenceAnswer ? sourceStageRow.reference_answer : targetStageRow.reference_answer,
      hasUsefulEvaluation ? sourceStageRow.last_score : targetStageRow.last_score,
      hasUsefulEvaluation ? sourceStageRow.last_feedback_summary : targetStageRow.last_feedback_summary,
      hasUsefulEvaluation ? sourceStageRow.last_strengths_json : targetStageRow.last_strengths_json,
      hasUsefulEvaluation ? sourceStageRow.last_weaknesses_json : targetStageRow.last_weaknesses_json,
      sessionId,
      stageId
    );

    return true;
  }

  return false;
};

const backfillSharedStageDataFromOtherMode = (sessionId: string) => {
  const session = getSessionRow(sessionId);
  if (!session) {
    return;
  }

  const question = getQuestionBySlugInternal(session.question_slug);
  if (!question) {
    return;
  }

  const currentStageRows = getStageProgressRows(sessionId);
  const relatedSessions = getCompatibleSessionsForQuestion(session.question_slug).filter(
    (row) => row.id !== sessionId && row.mode !== session.mode
  );

  if (relatedSessions.length === 0) {
    return;
  }

  const updateStage = database.prepare(
    `UPDATE stage_progress
     SET draft_answer = ?,
         reference_answer = ?,
         last_score = ?,
         last_feedback_summary = ?,
         last_strengths_json = ?,
         last_weaknesses_json = ?
     WHERE session_id = ? AND stage_id = ?`
  );

  for (const stageRow of currentStageRows) {
    const stageDefinition = question.stages.find(
      (candidate) => candidate.id === stageRow.stage_id && candidate.mode === session.mode
    );
    if (!stageDefinition || !getCrossModeSharedStageKey(stageDefinition)) {
      continue;
    }

    const needsDraft = stageRow.draft_answer.trim().length === 0;
    const needsReferenceAnswer =
      stageRow.reference_answer.trim().length === 0 || stageRow.reference_answer === stageDefinition.referenceAnswer;
    const currentStrengths = JSON.parse(stageRow.last_strengths_json) as string[];
    const currentWeaknesses = JSON.parse(stageRow.last_weaknesses_json) as string[];
    const needsEvaluation =
      stageRow.last_score === null &&
      stageRow.last_feedback_summary === null &&
      currentStrengths.length === 0 &&
      currentWeaknesses.length === 0;

    if (!needsDraft && !needsReferenceAnswer && !needsEvaluation) {
      continue;
    }

    let matchedSource: StageProgressRow | null = null;

    for (const relatedSession of relatedSessions) {
      const sourceDefinition = question.stages.find(
        (candidate) =>
          candidate.mode === relatedSession.mode &&
          getCrossModeSharedStageKey(candidate) === getCrossModeSharedStageKey(stageDefinition)
      );
      if (!sourceDefinition) {
        continue;
      }

      const sourceStageRow = database
        .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
        .get(relatedSession.id, sourceDefinition.id) as StageProgressRow | undefined;

      if (!sourceStageRow) {
        continue;
      }

      const sourceStrengths = JSON.parse(sourceStageRow.last_strengths_json) as string[];
      const sourceWeaknesses = JSON.parse(sourceStageRow.last_weaknesses_json) as string[];
      const hasUsefulDraft = sourceStageRow.draft_answer.trim().length > 0;
      const hasUsefulReferenceAnswer = sourceStageRow.reference_answer.trim().length > 0;
      const hasUsefulEvaluation =
        sourceStageRow.last_score !== null ||
        sourceStageRow.last_feedback_summary !== null ||
        sourceStrengths.length > 0 ||
        sourceWeaknesses.length > 0;

      if (!hasUsefulDraft && !hasUsefulReferenceAnswer && !hasUsefulEvaluation) {
        continue;
      }

      matchedSource = sourceStageRow;
      break;
    }

    if (!matchedSource) {
      continue;
    }

    updateStage.run(
      needsDraft
        ? normalizeSharedDraftAnswerForTarget(matchedSource.draft_answer, session.question_slug, session.mode, stageRow.stage_id)
        : stageRow.draft_answer,
      needsReferenceAnswer ? matchedSource.reference_answer : stageRow.reference_answer,
      needsEvaluation ? matchedSource.last_score : stageRow.last_score,
      needsEvaluation ? matchedSource.last_feedback_summary : stageRow.last_feedback_summary,
      needsEvaluation ? matchedSource.last_strengths_json : stageRow.last_strengths_json,
      needsEvaluation ? matchedSource.last_weaknesses_json : stageRow.last_weaknesses_json,
      sessionId,
      stageRow.stage_id
    );
  }
};

const syncSolvedSharedStageAcrossModes = (
  sourceSessionId: string,
  sourceStageId: string,
  evaluation: {
    score: number;
    feedbackSummary: string;
    strengths: string[];
    weaknesses: string[];
  }
) => {
  const sourceSession = getSessionRow(sourceSessionId);
  if (!sourceSession) {
    return;
  }

  const question = getQuestionBySlugInternal(sourceSession.question_slug);
  if (!question) {
    return;
  }

  const sourceStage = question.stages.find((item) => item.id === sourceStageId && item.mode === sourceSession.mode);
  if (!sourceStage) {
    return;
  }

  const sharedKey = getCrossModeSharedStageKey(sourceStage);
  if (!sharedKey) {
    return;
  }

  const hydratedSourceSession = hydrateSession(sourceSessionId);
  const sourceStageProgress = hydratedSourceSession?.stages.find((item) => item.stageId === sourceStageId);
  const sourceReferenceAnswer = sourceStageProgress?.referenceAnswer ?? sourceStage.referenceAnswer;

  const candidateSessions = getCompatibleSessionsForQuestion(sourceSession.question_slug).filter(
    (row) => row.id !== sourceSessionId && row.mode !== sourceSession.mode
  );

  for (const candidateSession of candidateSessions) {
    const equivalentStage = findEquivalentStageForMode(question, sourceStage, candidateSession.mode);
    if (!equivalentStage) {
      continue;
    }

    const stageRow = database
      .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
      .get(candidateSession.id, equivalentStage.id) as StageProgressRow | undefined;

    if (!stageRow) {
      continue;
    }

    const normalizedSourceDraft = normalizeSharedDraftAnswerForTarget(
      sourceStageProgress?.draftAnswer ?? "",
      sourceSession.question_slug,
      candidateSession.mode,
      equivalentStage.id
    );

    database
      .prepare(
        `UPDATE stage_progress
         SET status = 'solved',
             draft_answer = ?,
             reference_answer = ?,
             tries_used = CASE WHEN tries_used > 0 THEN tries_used ELSE 1 END,
             remaining_tries = max_tries,
             last_score = ?,
             last_feedback_summary = ?,
             last_strengths_json = ?,
             last_weaknesses_json = ?
         WHERE session_id = ? AND stage_id = ?`
      )
      .run(
        normalizedSourceDraft,
        sourceReferenceAnswer,
        evaluation.score,
        evaluation.feedbackSummary,
        JSON.stringify(evaluation.strengths),
        JSON.stringify(evaluation.weaknesses),
        candidateSession.id,
        equivalentStage.id
      );

    recalculateStageStatuses(candidateSession.id);
  }
};

const getSecretCredentialForProfile = (credentialId: string): SecretCredentialRow => {
  const secret = database
    .prepare("SELECT * FROM secret_credentials WHERE id = ?")
    .get(credentialId) as SecretCredentialRow | undefined;

  if (!secret) {
    throw new Error("Credential not found");
  }

  return secret;
};

const requireSessionAgent = (session: InterviewSession): AgentProfile => {
  if (!session.selectedAgentId) {
    throw new Error("Select an AI agent before requesting hints, answers, or evaluation");
  }

  const agent = getAgentProfileById(session.selectedAgentId);
  if (!agent) {
    throw new Error("Selected agent profile was not found");
  }

  return agent;
};

const parseEvaluationResponse = (value: unknown, stage: StageProgress) => {
  const fallbackMissingKeywords = stage.expectedKeywords;
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const numericScore = typeof record.score === "number" ? record.score : Number(record.score ?? 0);
  const boundedScore = Math.max(0, Math.min(10, Number.isFinite(numericScore) ? numericScore : 0));
  const score = Math.round(boundedScore * 100) / 100;
  const strengths = Array.isArray(record.strengths) ? record.strengths.filter((item): item is string => typeof item === "string") : [];
  const weaknesses = Array.isArray(record.weaknesses) ? record.weaknesses.filter((item): item is string => typeof item === "string") : [];
  const matchedKeywords = Array.isArray(record.matchedKeywords)
    ? record.matchedKeywords.filter((item): item is string => typeof item === "string")
    : [];
  const missingKeywords = Array.isArray(record.missingKeywords)
    ? record.missingKeywords.filter((item): item is string => typeof item === "string")
    : fallbackMissingKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const feedbackSummary =
    typeof record.feedbackSummary === "string" && record.feedbackSummary.trim().length > 0
      ? record.feedbackSummary.trim()
      : "No summary returned by the provider.";
  const isSolved = score >= 8;

  return {
    score,
    strengths,
    weaknesses,
    matchedKeywords,
    missingKeywords,
    feedbackSummary,
    isSolved
  };
};

export const getSettings = (): AppSettings => {
  const rows = database.prepare("SELECT * FROM app_settings").all() as SettingsRow[];
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return appSettingsSchema.parse({
    defaultMaxTries: Number(values.defaultMaxTries ?? defaultSettings.defaultMaxTries),
    defaultAgentId: values.defaultAgentId ? String(values.defaultAgentId) : null,
    sequentialStageFlow: values.sequentialStageFlow ? values.sequentialStageFlow === "true" : defaultSettings.sequentialStageFlow
  });
};

export const getAppMeta = (): AppMeta => {
  const latestMigration = database
    .prepare("SELECT applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1")
    .get() as { applied_at: string } | undefined;

  return appMetaSchema.parse({
    schemaVersion: Array.from(appliedMigrationIds).sort().at(-1) ?? "000",
    latestMigrationAt: latestMigration?.applied_at ?? null,
    desktopTarget: "macos",
    webSupported: true
  });
};

export const recordTelemetryEvent = (input: TelemetryEvent): void => {
  const payload = telemetryEventSchema.parse(input);

  database
    .prepare(
      `
        INSERT INTO telemetry_events (
          id,
          name,
          scope,
          path,
          question_slug,
          mode,
          metadata_json,
          created_at
        )
        VALUES (
          @id,
          @name,
          @scope,
          @path,
          @questionSlug,
          @mode,
          @metadataJson,
          @createdAt
        )
      `
    )
    .run({
      id: randomUUID(),
      name: payload.name,
      scope: payload.scope,
      path: payload.path,
      questionSlug: payload.questionSlug,
      mode: payload.mode,
      metadataJson: JSON.stringify(payload.metadata),
      createdAt: payload.createdAt
    });
};

export const updateSettings = (input: AppSettings): AppSettings => {
  const settings = appSettingsSchema.parse(input);
  const update = database.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
  update.run("defaultMaxTries", String(settings.defaultMaxTries));
  if (settings.defaultAgentId) {
    const agent = database.prepare("SELECT id FROM agent_profiles WHERE id = ?").get(settings.defaultAgentId) as { id: string } | undefined;
    if (!agent) {
      throw new Error("Default agent profile not found");
    }
  }
  update.run("defaultAgentId", settings.defaultAgentId ?? "");
  update.run("sequentialStageFlow", String(settings.sequentialStageFlow));
  return getSettings();
};

export const listAgentProfiles = (): AgentProfile[] => {
  const rows = database
    .prepare(
      `SELECT
         a.id,
         a.name,
         a.provider,
         a.model,
         a.system_prompt,
         a.credential_id,
         a.created_at,
         a.updated_at,
         s.masked_key
       FROM agent_profiles a
       JOIN secret_credentials s ON s.id = a.credential_id
       ORDER BY a.updated_at DESC`
    )
    .all() as Array<AgentProfileRow & { masked_key: string }>;

  return rows.map((row) =>
    agentProfileSchema.parse({
      id: row.id,
      name: row.name,
      provider: row.provider,
      model: row.model,
      systemPrompt: row.system_prompt,
      credentialId: row.credential_id,
      maskedKey: row.masked_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })
  );
};

export const createAgentProfile = (input: AgentProfileInput): AgentProfile => {
  const payload = agentProfileInputSchema.parse(input);
  aiProviderSchema.parse(payload.provider);
  const validation = validateAgentProfileInput(payload);

  if (!validation.isValid) {
    throw new Error(validation.issues.join(" "));
  }

  const now = new Date().toISOString();
  const credentialId = randomUUID();
  const profileId = randomUUID();
  const encrypted = encryptSecret(payload.apiKey);
  const maskedKey = maskApiKey(payload.apiKey);

  const insertCredential = database.prepare(`
    INSERT INTO secret_credentials (
      id,
      provider,
      encrypted_value,
      iv,
      auth_tag,
      masked_key,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProfile = database.prepare(`
    INSERT INTO agent_profiles (
      id,
      name,
      provider,
      model,
      system_prompt,
      credential_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = database.transaction(() => {
    insertCredential.run(
      credentialId,
      payload.provider,
      encrypted.encryptedValue,
      encrypted.iv,
      encrypted.authTag,
      maskedKey,
      now,
      now
    );

    insertProfile.run(
      profileId,
      payload.name,
      payload.provider,
      payload.model,
      payload.systemPrompt,
      credentialId,
      now,
      now
    );
  });

  transaction();

  const profile = listAgentProfiles().find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("Failed to create agent profile");
  }

  return profile;
};

export const validateAgentProfile = (input: AgentProfileInput): AgentValidation =>
  agentValidationSchema.parse(validateAgentProfileInput(agentProfileInputSchema.parse(input)));

export const deleteAgentProfile = (profileId: string): void => {
  const profile = database
    .prepare("SELECT * FROM agent_profiles WHERE id = ?")
    .get(profileId) as AgentProfileRow | undefined;

  if (!profile) {
    throw new Error("Agent profile not found");
  }

  const secret = database
    .prepare("SELECT * FROM secret_credentials WHERE id = ?")
    .get(profile.credential_id) as SecretCredentialRow | undefined;

  if (secret) {
    decryptSecret(secret);
  }

  const transaction = database.transaction(() => {
    database.prepare("UPDATE sessions SET selected_agent_id = NULL WHERE selected_agent_id = ?").run(profileId);
    database.prepare("DELETE FROM agent_profiles WHERE id = ?").run(profileId);
    database.prepare("DELETE FROM secret_credentials WHERE id = ?").run(profile.credential_id);
    database.prepare("UPDATE app_settings SET value = '' WHERE key = 'defaultAgentId' AND value = ?").run(profileId);
  });

  transaction();
};

export const getAgentProfileById = (profileId: string): AgentProfile | null =>
  listAgentProfiles().find((profile) => profile.id === profileId) ?? null;

export const getQuestionSummaries = (): QuestionSummary[] => {
  const progressMap = getQuestionProgressMap();

  return getQuestionRows().map((row) =>
    questionSummarySchema.parse({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      difficulty: row.difficulty,
      focusArea: row.focus_area,
      tags: JSON.parse(row.tags_json),
      supportedModes: JSON.parse(row.supported_modes_json),
      progress: progressMap.get(row.slug)
    })
  );
};

export const getQuestionBySlug = (slug: string): QuestionDetail | null => {
  const question = getQuestionBySlugInternal(slug);
  if (!question) {
    return null;
  }

  const progress = getQuestionProgressMap().get(slug);
  return questionDetailSchema.parse({
    ...question,
    progress
  });
};

export const createQuestionDraft = (inputValue: QuestionAuthoringInput): QuestionDraft =>
  buildDefaultQuestionDraft(questionAuthoringInputSchema.parse(inputValue));

export const beautifyQuestionDraftWithAi = async (inputValue: QuestionAuthoringInput): Promise<QuestionDraft> => {
  const input = questionAuthoringInputSchema.parse(inputValue);
  const agent = getDefaultAgentProfileOrThrow();
  const secret = getSecretCredentialForProfile(agent.credentialId);
  const relatedQuestion = input.relatedQuestionSlug ? getQuestionBySlugInternal(input.relatedQuestionSlug) : null;
  const systemPrompt = [
    "You create focused mock system-design interview questions.",
    "Return only valid JSON.",
    "Keep the question tightly scoped to one major topic.",
    "Use simple English and technical terms.",
    agent.systemPrompt.trim()
  ]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = buildQuestionAuthoringPrompt(input, relatedQuestion);
  const response = await invokeProviderJson(agent, decryptSecret(secret), "answer", systemPrompt, userPrompt);

  return normalizeQuestionDraft(response, input);
};

export const createQuestion = (draftValue: QuestionDraft): QuestionDetail => {
  const question = createQuestionDetailFromDraft(questionDraftSchema.parse(draftValue));
  persistQuestion(question);
  return question;
};

export const beautifyQuestionStageWithAi = async (
  inputValue: QuestionStageAuthoringInput
): Promise<QuestionStageDraft> => {
  const input = questionStageAuthoringInputSchema.parse(inputValue);
  const question = getQuestionBySlugInternal(input.questionSlug);
  if (!question) {
    throw new Error("Question not found");
  }

  const agent = getDefaultAgentProfileOrThrow();
  const secret = getSecretCredentialForProfile(agent.credentialId);
  const systemPrompt = [
    "You create one focused follow-up stage for an existing mock system-design question.",
    "Return raw JSON only.",
    "Keep simple English and technical terms.",
    agent.systemPrompt.trim()
  ]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = buildQuestionStageAuthoringPrompt(question, input.mode, input.sampleQuestion);
  const response = await invokeProviderJson(agent, decryptSecret(secret), "answer", systemPrompt, userPrompt);

  return normalizeQuestionStageDraft(response, input.mode, input.sampleQuestion);
};

export const suggestQuestionStageWithAi = async (
  questionSlug: string,
  mode: InterviewMode
): Promise<QuestionStageSuggestion> => {
  const question = getQuestionBySlugInternal(questionSlug);
  if (!question) {
    throw new Error("Question not found");
  }

  if (!question.supportedModes.includes(mode)) {
    throw new Error("This question does not support the selected mode");
  }

  const agent = getDefaultAgentProfileOrThrow();
  const secret = getSecretCredentialForProfile(agent.credentialId);
  const systemPrompt = [
    "You suggest one strong follow-up stage question for an existing mock system-design problem.",
    "Return raw JSON only.",
    "Keep simple English and technical terms.",
    agent.systemPrompt.trim()
  ]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = buildQuestionStageSuggestionPrompt(question, mode);
  const response = await invokeProviderJson(agent, decryptSecret(secret), "answer", systemPrompt, userPrompt);
  const record = typeof response === "object" && response !== null ? (response as Record<string, unknown>) : {};
  const sampleQuestion =
    typeof record.sampleQuestion === "string" && record.sampleQuestion.trim().length > 0
      ? record.sampleQuestion.trim()
      : `What important ${mode.toUpperCase()} stage is still missing for ${question.title}?`;

  return questionStageSuggestionSchema.parse({ sampleQuestion });
};

export const addStageToQuestion = (questionSlug: string, draftValue: QuestionStageDraft): QuestionDetail => {
  const question = getQuestionBySlugInternal(questionSlug);
  if (!question) {
    throw new Error("Question not found");
  }

  const draft = questionStageDraftSchema.parse(draftValue);
  if (!question.supportedModes.includes(draft.mode)) {
    throw new Error("This question does not support the selected mode");
  }

  const modeStages = question.stages
    .filter((stage) => stage.mode === draft.mode)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const nextOrderIndex = modeStages.length;
  const stageId = `${draft.mode}-${question.slug}-${slugify(draft.title) || `stage-${nextOrderIndex + 1}`}-${nextOrderIndex + 1}`;
  const maxTries = getSettings().defaultMaxTries;

  const updatedQuestion = questionDetailSchema.parse({
    ...question,
    stages: [
      ...question.stages,
      {
        id: stageId,
        mode: draft.mode,
        title: draft.title.trim(),
        prompt: draft.prompt.trim(),
        guidance: draft.guidance.trim(),
        referenceAnswer: draft.referenceAnswer.trim(),
        expectedKeywords: draft.expectedKeywords.map((item) => item.trim()).filter(Boolean).slice(0, 12),
        orderIndex: nextOrderIndex,
        minimumWords: draft.minimumWords,
        isCoreFocus: draft.isCoreFocus,
        maxTries
      }
    ]
  });

  persistQuestion(updatedQuestion);

  const relatedSessions = getCompatibleSessionsForQuestion(question.slug).filter((session) => session.mode === draft.mode);
  for (const session of relatedSessions) {
    const stageRows = getStageProgressRows(session.id);
    const hasActiveStage = stageRows.some((row) => row.status === "active");
    const allDone = stageRows.length > 0 && stageRows.every((row) => row.status === "solved" || row.status === "revealed");
    const nextStatus: StageStatus = hasActiveStage ? "locked" : allDone ? "active" : "locked";

    database
      .prepare(
        `INSERT INTO stage_progress (
          session_id,
          stage_id,
          mode,
          order_index,
          title,
          prompt,
          guidance,
          reference_answer,
          expected_keywords_json,
          minimum_words,
          is_core_focus,
          status,
          draft_answer,
          tries_used,
          remaining_tries,
          max_tries,
          last_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, NULL)`
      )
      .run(
        session.id,
        stageId,
        draft.mode,
        nextOrderIndex,
        draft.title.trim(),
        draft.prompt.trim(),
        draft.guidance.trim(),
        draft.referenceAnswer.trim(),
        JSON.stringify(draft.expectedKeywords),
        draft.minimumWords,
        draft.isCoreFocus ? 1 : 0,
        nextStatus,
        maxTries,
        maxTries
      );

    database
      .prepare("UPDATE sessions SET total_stage_count = total_stage_count + 1, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), session.id);

    updateSessionAggregate(session.id);
  }

  return updatedQuestion;
};

export const createOrResumeSession = (slug: string, requestBody: SessionRequest): InterviewSession => {
  const request = sessionRequestSchema.parse(requestBody);
  if (listAgentProfiles().length === 0) {
    throw new Error("Add an AI agent profile before starting an interview session");
  }

  const existing = request.restart ? null : getPreferredSessionRow(slug, request.mode);

  if (existing) {
    const session = hydrateSession(existing.id);
    if (!session) {
      throw new Error("Failed to hydrate active session");
    }
    return session;
  }

  const question = getQuestionBySlugInternal(slug);
  if (!question) {
    throw new Error("Question not found");
  }

  const modeStages = question.stages
    .filter((stage) => stage.mode === request.mode)
    .sort((left, right) => left.orderIndex - right.orderIndex);

  if (modeStages.length === 0) {
    throw new Error("This problem does not support the requested mode");
  }

  const settings = getSettings();
  const defaultAgentId = settings.defaultAgentId ?? listAgentProfiles()[0]?.id ?? null;
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const relatedSessions = getCompatibleSessionsForQuestion(question.slug).filter((row) => row.mode !== request.mode);
  const carriedSharedStageState = new Map<
    string,
    {
      draftAnswer: string;
      referenceAnswer: string;
      score: number | null;
      feedbackSummary: string | null;
      strengths: string[];
      weaknesses: string[];
    }
  >();

  for (const relatedSession of relatedSessions) {
    const hydrated = hydrateSession(relatedSession.id);
    if (!hydrated) {
      continue;
    }

    for (const relatedStage of hydrated.stages) {
      if (relatedStage.status !== "solved") {
        continue;
      }

      const sourceDefinition = question.stages.find(
        (candidate) => candidate.id === relatedStage.stageId && candidate.mode === relatedSession.mode
      );
      if (!sourceDefinition) {
        continue;
      }

      const equivalentStage = findEquivalentStageForMode(question, sourceDefinition, request.mode);
      if (!equivalentStage || carriedSharedStageState.has(equivalentStage.id)) {
        continue;
      }

      carriedSharedStageState.set(equivalentStage.id, {
        draftAnswer: normalizeSharedDraftAnswerForTarget(
          relatedStage.draftAnswer,
          question.slug,
          request.mode,
          equivalentStage.id
        ),
        referenceAnswer: relatedStage.referenceAnswer,
        score: relatedStage.lastScore,
        feedbackSummary: relatedStage.lastFeedbackSummary,
        strengths: relatedStage.lastStrengths,
        weaknesses: relatedStage.lastWeaknesses
      });
    }
  }

  const insertSession = database.prepare(`
    INSERT INTO sessions (
      id,
      question_id,
      question_slug,
      question_title,
      mode,
      selected_agent_id,
      status,
      current_stage_index,
      solved_stage_count,
      total_stage_count,
      created_at,
      updated_at,
      completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertStage = database.prepare(`
    INSERT INTO stage_progress (
      session_id,
      stage_id,
      mode,
      order_index,
      title,
      prompt,
      guidance,
      reference_answer,
      expected_keywords_json,
      minimum_words,
      is_core_focus,
      status,
      draft_answer,
      tries_used,
      remaining_tries,
      max_tries,
      last_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = database.transaction((stages: QuestionStage[]) => {
    insertSession.run(
      sessionId,
      question.id,
      question.slug,
      question.title,
      request.mode,
      defaultAgentId,
      "active",
      0,
      0,
      stages.length,
      now,
      now,
      null
    );

    for (const stage of stages) {
      const carriedState = carriedSharedStageState.get(stage.id);

      insertStage.run(
        sessionId,
        stage.id,
        request.mode,
        stage.orderIndex,
        stage.title,
        stage.prompt,
        stage.guidance,
        carriedState?.referenceAnswer ?? stage.referenceAnswer,
        JSON.stringify(stage.expectedKeywords),
        stage.minimumWords,
        stage.isCoreFocus ? 1 : 0,
        carriedState ? "solved" : stage.orderIndex === 0 ? "active" : "locked",
        carriedState?.draftAnswer ?? "",
        carriedState ? 1 : 0,
        carriedState ? settings.defaultMaxTries : settings.defaultMaxTries,
        settings.defaultMaxTries,
        carriedState?.score ?? null
      );

      if (carriedState) {
        database
          .prepare(
            `UPDATE stage_progress
             SET last_feedback_summary = ?,
                 last_strengths_json = ?,
                 last_weaknesses_json = ?
             WHERE session_id = ? AND stage_id = ?`
          )
          .run(
            carriedState.feedbackSummary,
            JSON.stringify(carriedState.strengths),
            JSON.stringify(carriedState.weaknesses),
            sessionId,
            stage.id
          );
      }
    }
  });

  transaction(modeStages);
  if (carriedSharedStageState.size > 0) {
    recalculateStageStatuses(sessionId);
  }

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Failed to create session");
  }

  return session;
};

export const getSessionById = (sessionId: string): InterviewSession | null => hydrateSession(sessionId);

export const syncSharedStageData = (sessionId: string, stageId: string): InterviewSession => {
  copySharedStageDataFromOtherMode(sessionId, stageId);

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return session;
};

export const updateSessionAgent = (sessionId: string, agentId: string | null): InterviewSession => {
  if (agentId) {
    const agent = database
      .prepare("SELECT id FROM agent_profiles WHERE id = ?")
      .get(agentId) as { id: string } | undefined;

    if (!agent) {
      throw new Error("Agent profile not found");
    }
  }

  const result = database.prepare("UPDATE sessions SET selected_agent_id = ?, updated_at = ? WHERE id = ?").run(
    agentId,
    new Date().toISOString(),
    sessionId
  );

  if (result.changes === 0) {
    throw new Error("Session not found");
  }

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return session;
};

export const getPromptScaffoldBundle = (sessionId: string, stageId: string): PromptScaffoldBundle => {
  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (!session.selectedAgentId) {
    throw new Error("Select an agent profile before generating prompt scaffolds");
  }

  const question = getQuestionBySlugInternal(session.questionSlug);
  if (!question) {
    throw new Error("Question not found");
  }

  const stage = session.stages.find((item) => item.stageId === stageId);
  if (!stage) {
    throw new Error("Stage not found");
  }

  const agent = getAgentProfileById(session.selectedAgentId);
  if (!agent) {
    throw new Error("Agent profile not found");
  }

  return promptScaffoldBundleSchema.parse(buildPromptScaffolds(question, session, stage, agent));
};

const getPromptForAction = (sessionId: string, stageId: string, action: "hint" | "answer" | "evaluation") => {
  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const agent = requireSessionAgent(session);
  const secret = getSecretCredentialForProfile(agent.credentialId);
  const prompts = getPromptScaffoldBundle(sessionId, stageId);
  const prompt = prompts.items.find((item) => item.action === action);

  if (!prompt) {
    throw new Error(`Prompt scaffold missing for ${action}`);
  }

  return {
    session,
    agent,
    apiKey: decryptSecret(secret),
    prompt
  };
};

const generateStageAnswerText = async (sessionId: string, stageId: string): Promise<string> => {
  const { agent, apiKey, prompt } = getPromptForAction(sessionId, stageId, "answer");
  const response = await invokeProviderJson(agent, apiKey, "answer", prompt.systemPrompt, prompt.userPrompt);
  const parsed = stageAnswerSchema.omit({ stageId: true, session: true }).parse(response);

  database
    .prepare("UPDATE stage_progress SET reference_answer = ? WHERE session_id = ? AND stage_id = ?")
    .run(parsed.answer, sessionId, stageId);

  return parsed.answer;
};

export const getStageHint = async (sessionId: string, stageId: string): Promise<StageHint> => {
  const { agent, apiKey, prompt } = getPromptForAction(sessionId, stageId, "hint");
  const response = await invokeProviderJson(agent, apiKey, "hint", prompt.systemPrompt, prompt.userPrompt);
  return stageHintSchema.parse(response);
};

export const getStageAnswer = async (sessionId: string, stageId: string): Promise<StageAnswer> => {
  const row = database
    .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
    .get(sessionId, stageId) as StageProgressRow | undefined;

  if (!row) {
    throw new Error("Stage not found");
  }

  if (row.status === "locked" && getSettings().sequentialStageFlow) {
    throw new Error("This stage is still locked");
  }

  const answer = await generateStageAnswerText(sessionId, stageId);

  if (row.status === "active") {
    database
      .prepare(
        `UPDATE stage_progress
         SET status = 'revealed',
             remaining_tries = 0
         WHERE session_id = ? AND stage_id = ?`
      )
      .run(sessionId, stageId);

    recalculateStageStatuses(sessionId);
  }

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return stageAnswerSchema.parse({
    stageId,
    answer,
    session
  });
};

export const listStageEvaluations = (sessionId: string, stageId: string): StageEvaluationHistoryEntry[] => {
  const rows = database
    .prepare(
      `SELECT *
       FROM stage_attempts
       WHERE session_id = ? AND stage_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`
    )
    .all(sessionId, stageId) as StageAttemptRow[];

  return rows.map(toStageEvaluationHistoryEntry);
};

const listLearningNoteRows = (): LearningNoteRow[] =>
  database
    .prepare("SELECT * FROM learning_notes ORDER BY datetime(updated_at) DESC, id DESC")
    .all() as LearningNoteRow[];

const listLearningAttemptRows = (): LearningAttemptAggregateRow[] =>
  database
    .prepare(
      `SELECT
         a.id,
         a.session_id,
         s.question_slug,
         s.question_title,
         q.focus_area,
         s.mode,
         a.stage_id,
         sp.title AS stage_title,
         a.score,
         a.weaknesses_json,
         a.feedback_summary,
         a.created_at
       FROM stage_attempts a
       JOIN sessions s ON s.id = a.session_id
       JOIN stage_progress sp ON sp.session_id = a.session_id AND sp.stage_id = a.stage_id
       JOIN questions q ON q.slug = s.question_slug
       ORDER BY datetime(a.created_at) DESC, a.id DESC`
    )
    .all() as LearningAttemptAggregateRow[];

const listLearningItemOverrides = (): LearningItemOverrideRow[] =>
  database
    .prepare("SELECT * FROM learning_item_overrides ORDER BY datetime(updated_at) DESC, id DESC")
    .all() as LearningItemOverrideRow[];

const buildLearningRecommendations = (attempts: LearningAttemptAggregateRow[]): LearningRecommendation[] => {
  if (attempts.length === 0) {
    return [
      {
        id: "start-practice",
        title: "Start one full practice flow",
        summary: "Finish a few stages so the app can synthesize reusable learning patterns from real attempts.",
        updatedAt: new Date().toISOString()
      }
    ];
  }

  const lowScoreAttempts = attempts.filter((attempt) => attempt.score < 8);
  const recommendations: LearningRecommendation[] = [];

  const stageTitleCounts = new Map<string, { count: number; totalScore: number }>();
  for (const attempt of lowScoreAttempts) {
    const current = stageTitleCounts.get(attempt.stage_title) ?? { count: 0, totalScore: 0 };
    current.count += 1;
    current.totalScore += attempt.score;
    stageTitleCounts.set(attempt.stage_title, current);
  }

  const weakestStageTitle = [...stageTitleCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].totalScore - right[1].totalScore)[0];

  if (weakestStageTitle) {
    const latestStageAttempt =
      lowScoreAttempts.find((attempt) => attempt.stage_title === weakestStageTitle[0])?.created_at ??
      attempts[0]?.created_at ??
      new Date().toISOString();
    recommendations.push({
      id: `stage-${weakestStageTitle[0].toLowerCase().replace(/\s+/g, "-")}`,
      title: `Practice ${weakestStageTitle[0].toLowerCase()} answers`,
      summary: "Start with short, interview-style bullets that cover the core ask before adding extra depth.",
      updatedAt: latestStageAttempt
    });
  }

  const focusCounts = new Map<string, number>();
  for (const attempt of lowScoreAttempts) {
    focusCounts.set(attempt.focus_area, (focusCounts.get(attempt.focus_area) ?? 0) + 1);
  }

  const weakestFocus = [...focusCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (weakestFocus) {
    const latestFocusAttempt =
      lowScoreAttempts.find((attempt) => attempt.focus_area === weakestFocus[0])?.created_at ??
      attempts[0]?.created_at ??
      new Date().toISOString();
    recommendations.push({
      id: `focus-${weakestFocus[0]}`,
      title: `Do one focused ${weakestFocus[0]} round`,
      summary: "Pick one problem in this focus area and compare your rewritten answer with your previous feedback history.",
      updatedAt: latestFocusAttempt
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "revisit-solved-stages",
      title: "Revisit solved stages",
      summary: "Compare your broad bullet answer with the strongest evaluation you already reached and tighten the wording.",
      updatedAt: attempts[0]?.created_at ?? new Date().toISOString()
    });
  }

  return recommendations
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);
};

const buildLearningThemes = (attempts: LearningAttemptAggregateRow[]): LearningDashboard["themes"] => {
  const themeMap = new Map<
    string,
    {
      title: string;
      evidenceCount: number;
      totalScore: number;
      questionSlugs: Set<string>;
      stageTitles: Set<string>;
      exampleWeakness: string;
      latestAt: string;
    }
  >();

  for (const attempt of attempts) {
    const weaknesses = JSON.parse(attempt.weaknesses_json) as string[];
    for (const rawWeakness of weaknesses) {
      const normalized = rawWeakness.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      if (normalized.length < 8) {
        continue;
      }

      const title =
        attempt.stage_title === "Functional requirements"
          ? "Write clear in-scope functional requirements"
          : attempt.stage_title === "Non-functional requirements"
            ? "Write clear non-functional requirements"
            : toActionTitle(rawWeakness);

      const current = themeMap.get(normalized) ?? {
        title,
        evidenceCount: 0,
        totalScore: 0,
        questionSlugs: new Set<string>(),
        stageTitles: new Set<string>(),
        exampleWeakness: toActionSummary(rawWeakness, attempt.stage_title),
        latestAt: attempt.created_at
      };

      current.evidenceCount += 1;
      current.totalScore += attempt.score;
      current.questionSlugs.add(attempt.question_slug);
      current.stageTitles.add(attempt.stage_title);
      if (attempt.created_at > current.latestAt) {
        current.latestAt = attempt.created_at;
      }
      themeMap.set(normalized, current);
    }
  }

  return [...themeMap.entries()]
    .sort((left, right) => right[1].latestAt.localeCompare(left[1].latestAt) || right[1].evidenceCount - left[1].evidenceCount || left[1].totalScore - right[1].totalScore)
    .slice(0, 6)
    .map(([id, value]) => ({
      id,
      title: value.title,
      summary: value.exampleWeakness,
      updatedAt: value.latestAt,
      evidenceCount: value.evidenceCount,
      averageScore: value.evidenceCount > 0 ? Math.round((value.totalScore / value.evidenceCount) * 100) / 100 : null,
      relatedQuestionSlugs: [...value.questionSlugs],
      relatedStageTitles: [...value.stageTitles]
    }));
};

const applyLearningOverrides = <T extends { id: string; title: string; summary: string; updatedAt: string }>(
  items: T[],
  itemType: LearningItemOverrideRow["item_type"],
  overrides: LearningItemOverrideRow[]
): T[] =>
  items
    .filter((item) => {
      const override = overrides.find((candidate) => candidate.item_type === itemType && candidate.id === item.id);
      return !override || override.deleted === 0;
    })
    .map((item) => {
      const override = overrides.find((candidate) => candidate.item_type === itemType && candidate.id === item.id);
      if (!override) {
        return item;
      }

      return {
        ...item,
        title: override.title,
        summary: override.summary,
        updatedAt: override.updated_at
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

export const getLearningDashboard = (): LearningDashboard => {
  const attempts = listLearningAttemptRows();
  const notes = listLearningNoteRows().map(toLearningNote);
  const overrides = listLearningItemOverrides();
  const progressMap = getQuestionProgressMap();
  const completionValues = [...progressMap.values()].map((progress) => progress?.completionPercent ?? 0);
  const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
  const bestScore = attempts.length > 0 ? Math.max(...attempts.map((attempt) => attempt.score)) : null;

  return learningDashboardSchema.parse({
    totalAttempts: attempts.length,
    totalSessions: new Set(attempts.map((attempt) => attempt.session_id)).size,
    totalQuestionsAttempted: new Set(attempts.map((attempt) => attempt.question_slug)).size,
    averageScore: attempts.length > 0 ? Math.round((totalScore / attempts.length) * 100) / 100 : null,
    bestScore,
    overallCompletionPercent:
      completionValues.length > 0
        ? Math.round((completionValues.reduce((sum, value) => sum + value, 0) / completionValues.length) * 100) / 100
        : 0,
    recommendations: applyLearningOverrides(buildLearningRecommendations(attempts), "recommendation", overrides),
    themes: applyLearningOverrides(buildLearningThemes(attempts), "theme", overrides),
    notes,
    recentAttempts: attempts.slice(0, 20).map((attempt) => ({
      id: attempt.id,
      sessionId: attempt.session_id,
      questionSlug: attempt.question_slug,
      questionTitle: attempt.question_title,
      focusArea: attempt.focus_area,
      mode: attempt.mode,
      stageId: attempt.stage_id,
      stageTitle: attempt.stage_title,
      score: attempt.score,
      feedbackSummary: attempt.feedback_summary,
      createdAt: attempt.created_at
    }))
  });
};

export const saveLearningNote = (input: LearningNoteInput): LearningNote => {
  const payload = learningNoteInputSchema.parse(input);
  const now = new Date().toISOString();
  const id = payload.id ?? randomUUID();

  database
    .prepare(
      `INSERT INTO learning_notes (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         updated_at = excluded.updated_at`
    )
    .run(id, payload.title.trim(), payload.content.trim(), now, now);

  const row = database.prepare("SELECT * FROM learning_notes WHERE id = ?").get(id) as LearningNoteRow;
  return toLearningNote(row);
};

export const deleteLearningNote = (noteId: string): void => {
  database.prepare("DELETE FROM learning_notes WHERE id = ?").run(noteId);
};

export const saveLearningItemOverride = (
  itemType: LearningItemOverrideRow["item_type"],
  input: LearningItemInput
): void => {
  const payload = learningItemInputSchema.parse(input);
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO learning_item_overrides (id, item_type, title, summary, deleted, updated_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         summary = excluded.summary,
         deleted = 0,
         updated_at = excluded.updated_at`
    )
    .run(payload.id, itemType, payload.title.trim(), payload.summary.trim(), now);
};

export const deleteLearningItemOverride = (itemType: LearningItemOverrideRow["item_type"], itemId: string): void => {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO learning_item_overrides (id, item_type, title, summary, deleted, updated_at)
       VALUES (?, ?, '', '', 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         deleted = 1,
         updated_at = excluded.updated_at`
    )
    .run(itemId, itemType, now);
};

export const resetStageProgress = (sessionId: string, stageId: string): InterviewSession => {
  const targetRow = database
    .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
    .get(sessionId, stageId) as StageProgressRow | undefined;

  if (!targetRow) {
    throw new Error("Stage not found");
  }

  if (targetRow.status !== "revealed" && targetRow.status !== "solved") {
    throw new Error("Only solved or failed stages can be reset");
  }

  const rows = getStageProgressRows(sessionId);
  const resetTransaction = database.transaction(() => {
    database
      .prepare(
        `UPDATE stage_progress
         SET status = 'active',
             tries_used = 0,
             remaining_tries = max_tries,
             last_score = NULL,
             last_feedback_summary = NULL,
             last_strengths_json = '[]',
             last_weaknesses_json = '[]'
         WHERE session_id = ? AND stage_id = ?`
      )
      .run(sessionId, stageId);

    for (const row of rows) {
      if (row.order_index > targetRow.order_index && row.status === "active") {
        database
          .prepare("UPDATE stage_progress SET status = 'locked' WHERE session_id = ? AND stage_id = ?")
          .run(sessionId, row.stage_id);
      }
    }
  });

  resetTransaction();
  updateSessionAggregate(sessionId);

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return session;
};

export const updateStageDraft = (sessionId: string, stageId: string, body: DraftUpdate): InterviewSession => {
  const input = draftUpdateSchema.parse(body);
  const row = database
    .prepare("SELECT status FROM stage_progress WHERE session_id = ? AND stage_id = ?")
    .get(sessionId, stageId) as { status: StageStatus } | undefined;

  if (!row) {
    throw new Error("Stage not found");
  }

  if (row.status === "locked" && getSettings().sequentialStageFlow) {
    throw new Error("Cannot edit a locked stage");
  }

  database
    .prepare("UPDATE stage_progress SET draft_answer = ? WHERE session_id = ? AND stage_id = ?")
    .run(input.answer, sessionId, stageId);

  database.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), sessionId);

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  return session;
};

export const submitStageAnswer = async (sessionId: string, stageId: string): Promise<StageEvaluation> => {
  const row = database
    .prepare("SELECT * FROM stage_progress WHERE session_id = ? AND stage_id = ?")
    .get(sessionId, stageId) as StageProgressRow | undefined;

  if (!row) {
    throw new Error("Stage not found");
  }

  const stage = toStageProgress(row);
  const stageDefinition = getQuestionStageDefinition(sessionId, stageId);

  if (stage.status === "locked" && getSettings().sequentialStageFlow) {
    throw new Error("This stage is still locked");
  }

  if (stage.status === "solved" || stage.status === "revealed") {
    const session = hydrateSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    return stageEvaluationSchema.parse({
      score: stage.lastScore ?? 0,
      matchedKeywords: [],
      missingKeywords: [],
      strengths: stage.lastStrengths,
      weaknesses: stage.lastWeaknesses,
      feedbackSummary: stage.lastFeedbackSummary ?? "No previous evaluation summary found.",
      isSolved: stage.status === "solved",
      attemptsRemaining: stage.remainingTries,
      forcedReveal: stage.status === "revealed",
      referenceAnswer: stage.status === "revealed" ? stage.referenceAnswer : null,
      session
    });
  }

  if (countWords(stage.draftAnswer) < stageDefinition.minimumWords) {
    throw new Error(`Write at least ${stageDefinition.minimumWords} words before submitting`);
  }

  const { agent, apiKey, prompt } = getPromptForAction(sessionId, stageId, "evaluation");
  const providerResponse = await invokeProviderJson(agent, apiKey, "evaluation", prompt.systemPrompt, prompt.userPrompt);
  const evaluation = parseEvaluationResponse(providerResponse, stage);
  let nextStatus: StageStatus = "active";
  let remainingTries = stage.remainingTries;
  let triesUsed = stage.triesUsed;
  let forcedReveal = false;
  let referenceAnswer: string | null = null;

  if (evaluation.isSolved) {
    nextStatus = "solved";
  } else {
    triesUsed += 1;
    remainingTries = Math.max(0, stage.remainingTries - 1);

    if (remainingTries === 0) {
      nextStatus = "revealed";
      forcedReveal = true;
      referenceAnswer = await generateStageAnswerText(sessionId, stageId);
    }
  }

  database
    .prepare(
      `UPDATE stage_progress
       SET status = ?,
           tries_used = ?,
           remaining_tries = ?,
           last_score = ?,
           last_feedback_summary = ?,
           last_strengths_json = ?,
           last_weaknesses_json = ?
       WHERE session_id = ? AND stage_id = ?`
    )
    .run(
      nextStatus,
      triesUsed,
      remainingTries,
      evaluation.score,
      evaluation.feedbackSummary,
      JSON.stringify(evaluation.strengths),
      JSON.stringify(evaluation.weaknesses),
      sessionId,
      stageId
    );

  database
    .prepare(
      `INSERT INTO stage_attempts (
        id,
        session_id,
        stage_id,
        score,
        strengths_json,
        weaknesses_json,
        matched_keywords_json,
        missing_keywords_json,
        feedback_summary,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      sessionId,
      stageId,
      evaluation.score,
      JSON.stringify(evaluation.strengths),
      JSON.stringify(evaluation.weaknesses),
      JSON.stringify(evaluation.matchedKeywords),
      JSON.stringify(evaluation.missingKeywords),
      evaluation.feedbackSummary,
      new Date().toISOString()
    );

  if (nextStatus === "solved" || nextStatus === "revealed") {
    recalculateStageStatuses(sessionId);
  } else {
    updateSessionAggregate(sessionId);
  }

  if (nextStatus === "solved") {
    syncSolvedSharedStageAcrossModes(sessionId, stageId, {
      score: evaluation.score,
      feedbackSummary: evaluation.feedbackSummary,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses
    });
  }

  const session = hydrateSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return stageEvaluationSchema.parse({
    score: evaluation.score,
    matchedKeywords: evaluation.matchedKeywords,
    missingKeywords: evaluation.missingKeywords,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    feedbackSummary: evaluation.feedbackSummary,
    isSolved: evaluation.isSolved,
    attemptsRemaining: remainingTries,
    forcedReveal,
    referenceAnswer,
    session
  });
};

export const getSeededQuestionCount = (): number => {
  const row = database.prepare("SELECT COUNT(*) as count FROM questions").get() as { count: number };
  return row.count;
};
