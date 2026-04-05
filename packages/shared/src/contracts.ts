import { z } from "zod";

export const interviewModeSchema = z.enum(["hld", "lld"]);

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const problemFocusSchema = z.enum([
  "scaling",
  "concurrency",
  "consistency",
  "storage",
  "object-modeling",
  "delivery"
]);

export const stageStatusSchema = z.enum(["locked", "active", "solved", "revealed"]);

export const sessionStatusSchema = z.enum(["active", "completed"]);
export const aiProviderSchema = z.enum(["openai", "openrouter", "anthropic", "google"]);
export const aiPromptActionSchema = z.enum(["hint", "answer", "evaluation"]);
export const playgroundShapeKindSchema = z.enum(["rectangle", "circle", "cylinder", "diamond"]);
export const playgroundArrowStyleSchema = z.enum(["solid", "bold", "hashed"]);
export const playgroundFontFamilySchema = z.enum(["sans", "serif", "mono", "display"]);

export const questionStageSchema = z.object({
  id: z.string(),
  mode: interviewModeSchema,
  title: z.string(),
  prompt: z.string(),
  guidance: z.string(),
  referenceAnswer: z.string(),
  expectedKeywords: z.array(z.string()).min(1),
  orderIndex: z.number().int().nonnegative(),
  minimumWords: z.number().int().min(1).max(500).default(20),
  isCoreFocus: z.boolean().default(false),
  maxTries: z.number().int().positive().default(3)
});

export const questionProgressSchema = z.object({
  hasActiveSession: z.boolean(),
  activeMode: interviewModeSchema.nullable(),
  solvedModes: z.array(interviewModeSchema),
  completionPercent: z.number().min(0).max(100),
  modeCompletionPercent: z.record(interviewModeSchema, z.number().min(0).max(100)).default({
    hld: 0,
    lld: 0
  }),
  modeHasActiveSession: z.record(interviewModeSchema, z.boolean()).default({
    hld: false,
    lld: false
  })
});

export const questionSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  difficulty: difficultySchema,
  focusArea: problemFocusSchema,
  tags: z.array(z.string()),
  supportedModes: z.array(interviewModeSchema).min(1),
  progress: questionProgressSchema.optional()
});

export const questionDetailSchema = questionSummarySchema.extend({
  scope: z.string(),
  detailedDescription: z.string(),
  assumptions: z.array(z.string()).min(1),
  qpsAssumptions: z.array(z.string()).default([]),
  inScope: z.array(z.string()).min(1),
  outOfScope: z.array(z.string()).min(1),
  focusPoints: z.array(z.string()).min(1),
  stages: z.array(questionStageSchema).min(1)
});

export const questionStageDraftSchema = z.object({
  mode: interviewModeSchema,
  title: z.string().min(1).max(160),
  prompt: z.string().min(1).max(2000),
  guidance: z.string().min(1).max(2000),
  referenceAnswer: z.string().min(1).max(6000),
  expectedKeywords: z.array(z.string()).min(1).max(12),
  minimumWords: z.number().int().min(1).max(500),
  isCoreFocus: z.boolean().default(false)
});

export const questionDraftSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(400),
  difficulty: difficultySchema,
  focusArea: problemFocusSchema,
  tags: z.array(z.string()).max(12).default([]),
  supportedModes: z.array(interviewModeSchema).min(1).max(2),
  scope: z.string().min(1).max(2000),
  detailedDescription: z.string().min(1).max(6000),
  assumptions: z.array(z.string()).min(1).max(12),
  qpsAssumptions: z.array(z.string()).max(8).default([]),
  inScope: z.array(z.string()).min(1).max(12),
  outOfScope: z.array(z.string()).min(1).max(12),
  focusPoints: z.array(z.string()).min(1).max(12),
  stages: z.array(questionStageDraftSchema).min(1).max(16)
});

export const questionAuthoringInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  mainFocusPoint: z.string().min(1).max(400),
  outOfScope: z.string().max(4000).default(""),
  assumptions: z.string().max(4000).default(""),
  supportedModes: z.array(interviewModeSchema).min(1).max(2),
  sampleQuestions: z.string().max(4000).default(""),
  relatedQuestionSlug: z.string().nullable().default(null),
  relatedQuestionPrompt: z.string().max(2000).default("")
});

export const questionStageAuthoringInputSchema = z.object({
  questionSlug: z.string().min(1),
  mode: interviewModeSchema,
  sampleQuestion: z.string().min(1).max(4000)
});

export const questionStageSuggestionSchema = z.object({
  sampleQuestion: z.string().min(1).max(4000)
});

export const questionChatMessageRoleSchema = z.enum(["user", "assistant"]);

export const questionChatMessageSchema = z.object({
  id: z.string(),
  questionSlug: z.string(),
  mode: interviewModeSchema,
  role: questionChatMessageRoleSchema,
  content: z.string().min(1).max(12000),
  createdAt: z.string()
});

export const questionChatHistorySchema = z.object({
  questionSlug: z.string(),
  mode: interviewModeSchema,
  items: z.array(questionChatMessageSchema)
});

export const questionChatRequestSchema = z.object({
  mode: interviewModeSchema,
  message: z.string().min(1).max(4000)
});

export const questionChatResponseSchema = z.object({
  userMessage: questionChatMessageSchema,
  assistantMessage: questionChatMessageSchema,
  history: questionChatHistorySchema
});

export const appSettingsSchema = z.object({
  defaultMaxTries: z.number().int().min(1).max(10),
  defaultAgentId: z.string().nullable().default(null),
  sequentialStageFlow: z.boolean().default(true)
});

export const stageProgressSchema = z.object({
  stageId: z.string(),
  mode: interviewModeSchema,
  orderIndex: z.number().int().nonnegative(),
  title: z.string(),
  prompt: z.string(),
  guidance: z.string(),
  referenceAnswer: z.string(),
  expectedKeywords: z.array(z.string()).min(1),
  minimumWords: z.number().int().min(1).max(500),
  isCoreFocus: z.boolean(),
  status: stageStatusSchema,
  draftAnswer: z.string(),
  triesUsed: z.number().int().nonnegative(),
  remainingTries: z.number().int().nonnegative(),
  maxTries: z.number().int().positive(),
  lastScore: z.number().min(0).max(10).nullable(),
  lastFeedbackSummary: z.string().nullable().default(null),
  lastStrengths: z.array(z.string()).default([]),
  lastWeaknesses: z.array(z.string()).default([])
});

export const interviewSessionSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  questionSlug: z.string(),
  questionTitle: z.string(),
  mode: interviewModeSchema,
  selectedAgentId: z.string().nullable(),
  status: sessionStatusSchema,
  currentStageIndex: z.number().int().nonnegative(),
  solvedStageCount: z.number().int().nonnegative(),
  totalStageCount: z.number().int().positive(),
  completionPercent: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
  stages: z.array(stageProgressSchema).min(1)
});

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  timestamp: z.string(),
  seededQuestions: z.number().int().nonnegative()
});

export const appMetaSchema = z.object({
  schemaVersion: z.string(),
  latestMigrationAt: z.string().nullable(),
  desktopTarget: z.literal("macos"),
  webSupported: z.boolean()
});

export const telemetryEventSchema = z.object({
  name: z.string().min(1).max(120),
  scope: z.enum(["app", "library", "question", "learning", "settings"]),
  path: z.string().min(1).max(400),
  questionSlug: z.string().nullable().default(null),
  mode: interviewModeSchema.nullable().default(null),
  metadata: z.record(z.string(), z.string()).default({}),
  createdAt: z.string()
});

export const secretCredentialSummarySchema = z.object({
  id: z.string(),
  provider: aiProviderSchema,
  maskedKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: aiProviderSchema,
  model: z.string(),
  systemPrompt: z.string(),
  credentialId: z.string(),
  maskedKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const agentProfileInputSchema = z.object({
  name: z.string().min(1).max(120),
  provider: aiProviderSchema,
  model: z.string().min(1).max(160),
  apiKey: z.string().min(10).max(500),
  systemPrompt: z.string().max(4000).default("")
});

export const agentValidationSchema = z.object({
  provider: aiProviderSchema,
  model: z.string(),
  normalizedModel: z.string(),
  isValid: z.boolean(),
  validationMode: z.literal("format"),
  issues: z.array(z.string()),
  warnings: z.array(z.string()),
  supportedActions: z.array(aiPromptActionSchema).min(1)
});

export const sessionRequestSchema = z.object({
  mode: interviewModeSchema,
  restart: z.boolean().optional().default(false)
});

export const draftUpdateSchema = z.object({
  answer: z.string().max(100000)
});

export const sessionAgentUpdateSchema = z.object({
  agentId: z.string().nullable()
});

export const stageEvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  feedbackSummary: z.string(),
  isSolved: z.boolean(),
  attemptsRemaining: z.number().int().nonnegative(),
  forcedReveal: z.boolean(),
  referenceAnswer: z.string().nullable(),
  session: interviewSessionSchema
});

export const stageEvaluationHistoryEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  stageId: z.string(),
  score: z.number().min(0).max(10),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  feedbackSummary: z.string(),
  createdAt: z.string()
});

export const stageHintSchema = z.object({
  hint: z.string()
});

export const stageAnswerSchema = z.object({
  stageId: z.string(),
  answer: z.string(),
  session: interviewSessionSchema.optional()
});

export const learningThemeSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  evidenceCount: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(10).nullable(),
  relatedQuestionSlugs: z.array(z.string()).default([]),
  relatedStageTitles: z.array(z.string()).default([])
});

export const learningRecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  updatedAt: z.string()
});

export const learningNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const learningNoteInputSchema = z.object({
  id: z.string().nullable().default(null),
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(4000)
});

export const learningItemInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000)
});

export const learningAttemptReviewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  questionSlug: z.string(),
  questionTitle: z.string(),
  focusArea: problemFocusSchema,
  mode: interviewModeSchema,
  stageId: z.string(),
  stageTitle: z.string(),
  score: z.number().min(0).max(10),
  feedbackSummary: z.string(),
  createdAt: z.string()
});

export const learningDashboardSchema = z.object({
  totalAttempts: z.number().int().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  totalQuestionsAttempted: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(10).nullable(),
  bestScore: z.number().min(0).max(10).nullable(),
  overallCompletionPercent: z.number().min(0).max(100),
  recommendations: z.array(learningRecommendationSchema).default([]),
  themes: z.array(learningThemeSchema).default([]),
  notes: z.array(learningNoteSchema).default([]),
  recentAttempts: z.array(learningAttemptReviewSchema).default([])
});

const playgroundBaseItemSchema = z.object({
  id: z.string(),
  stageId: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  color: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const playgroundTextItemSchema = playgroundBaseItemSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  fontFamily: playgroundFontFamilySchema,
  fontSize: z.number().int().min(6).max(25),
  fontWeight: z.enum(["regular", "medium", "bold"]),
  maxWidth: z.number().positive().optional()
});

export const playgroundShapeItemSchema = playgroundBaseItemSchema.extend({
  type: z.literal("shape"),
  shapeKind: playgroundShapeKindSchema,
  fillColor: z.string(),
  strokeColor: z.string(),
  strokeWidth: z.number().min(1).max(8)
});

export const playgroundArrowItemSchema = z.object({
  id: z.string(),
  type: z.literal("arrow"),
  stageId: z.string(),
  x: z.number(),
  y: z.number(),
  endX: z.number(),
  endY: z.number(),
  color: z.string(),
  style: playgroundArrowStyleSchema,
  strokeWidth: z.number().min(1).max(8),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const playgroundItemSchema = z.discriminatedUnion("type", [
  playgroundTextItemSchema,
  playgroundShapeItemSchema,
  playgroundArrowItemSchema
]);

export const playgroundFrameSchema = z.object({
  stageId: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
});

export const playgroundSceneSchema = z.object({
  version: z.literal(1),
  questionSlug: z.string(),
  mode: interviewModeSchema,
  updatedAt: z.string(),
  frames: z.array(playgroundFrameSchema).min(1),
  items: z.array(playgroundItemSchema)
});

export const stagePlaygroundAnswerSchema = z.object({
  version: z.literal(1),
  kind: z.literal("playground-stage-answer"),
  questionSlug: z.string(),
  mode: interviewModeSchema,
  stageId: z.string(),
  plainText: z.string(),
  items: z.array(playgroundItemSchema),
  frame: playgroundFrameSchema
});

export const promptScaffoldSchema = z.object({
  action: aiPromptActionSchema,
  provider: aiProviderSchema,
  model: z.string(),
  systemPrompt: z.string(),
  userPrompt: z.string(),
  compactPayload: z.string()
});

export const promptScaffoldBundleSchema = z.object({
  sessionId: z.string(),
  stageId: z.string(),
  items: z.array(promptScaffoldSchema).length(3)
});

export type InterviewMode = z.infer<typeof interviewModeSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;
export type ProblemFocus = z.infer<typeof problemFocusSchema>;
export type StageStatus = z.infer<typeof stageStatusSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiPromptAction = z.infer<typeof aiPromptActionSchema>;
export type QuestionStage = z.infer<typeof questionStageSchema>;
export type QuestionStageDraft = z.infer<typeof questionStageDraftSchema>;
export type QuestionProgress = z.infer<typeof questionProgressSchema>;
export type QuestionSummary = z.infer<typeof questionSummarySchema>;
export type QuestionDetail = z.infer<typeof questionDetailSchema>;
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type QuestionAuthoringInput = z.infer<typeof questionAuthoringInputSchema>;
export type QuestionStageAuthoringInput = z.infer<typeof questionStageAuthoringInputSchema>;
export type QuestionStageSuggestion = z.infer<typeof questionStageSuggestionSchema>;
export type QuestionChatMessage = z.infer<typeof questionChatMessageSchema>;
export type QuestionChatHistory = z.infer<typeof questionChatHistorySchema>;
export type QuestionChatRequest = z.infer<typeof questionChatRequestSchema>;
export type QuestionChatResponse = z.infer<typeof questionChatResponseSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type StageProgress = z.infer<typeof stageProgressSchema>;
export type InterviewSession = z.infer<typeof interviewSessionSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type AppMeta = z.infer<typeof appMetaSchema>;
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
export type DraftUpdate = z.infer<typeof draftUpdateSchema>;
export type SessionAgentUpdate = z.infer<typeof sessionAgentUpdateSchema>;
export type StageEvaluation = z.infer<typeof stageEvaluationSchema>;
export type StageEvaluationHistoryEntry = z.infer<typeof stageEvaluationHistoryEntrySchema>;
export type StageHint = z.infer<typeof stageHintSchema>;
export type StageAnswer = z.infer<typeof stageAnswerSchema>;
export type LearningTheme = z.infer<typeof learningThemeSchema>;
export type LearningRecommendation = z.infer<typeof learningRecommendationSchema>;
export type LearningNote = z.infer<typeof learningNoteSchema>;
export type LearningNoteInput = z.infer<typeof learningNoteInputSchema>;
export type LearningItemInput = z.infer<typeof learningItemInputSchema>;
export type LearningAttemptReview = z.infer<typeof learningAttemptReviewSchema>;
export type LearningDashboard = z.infer<typeof learningDashboardSchema>;
export type SecretCredentialSummary = z.infer<typeof secretCredentialSummarySchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type AgentProfileInput = z.infer<typeof agentProfileInputSchema>;
export type AgentValidation = z.infer<typeof agentValidationSchema>;
export type PromptScaffold = z.infer<typeof promptScaffoldSchema>;
export type PromptScaffoldBundle = z.infer<typeof promptScaffoldBundleSchema>;
export type PlaygroundShapeKind = z.infer<typeof playgroundShapeKindSchema>;
export type PlaygroundArrowStyle = z.infer<typeof playgroundArrowStyleSchema>;
export type PlaygroundFontFamily = z.infer<typeof playgroundFontFamilySchema>;
export type PlaygroundTextItem = z.infer<typeof playgroundTextItemSchema>;
export type PlaygroundShapeItem = z.infer<typeof playgroundShapeItemSchema>;
export type PlaygroundArrowItem = z.infer<typeof playgroundArrowItemSchema>;
export type PlaygroundItem = z.infer<typeof playgroundItemSchema>;
export type PlaygroundFrame = z.infer<typeof playgroundFrameSchema>;
export type PlaygroundScene = z.infer<typeof playgroundSceneSchema>;
export type StagePlaygroundAnswer = z.infer<typeof stagePlaygroundAnswerSchema>;
