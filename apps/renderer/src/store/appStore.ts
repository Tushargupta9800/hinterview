import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppSettings,
  AppMeta,
  AgentProfile,
  AgentProfileInput,
  AgentValidation,
  HealthResponse,
  InterviewMode,
  InterviewSession,
  LearningDashboard,
  LearningItemInput,
  LearningNoteInput,
  QuestionDetail,
  QuestionSummary,
  StageAnswer,
  StageEvaluation,
  StageEvaluationHistoryEntry,
  StageHint
} from "@hinterview/shared";
import {
  createAgentProfile as persistAgentProfile,
  deleteLearningRecommendation as removeLearningRecommendation,
  deleteLearningTheme as removeLearningTheme,
  deleteLearningNote as removeLearningNote,
  deleteAgentProfile as removeAgentProfile,
  createOrResumeSession,
  fetchAppMeta,
  fetchStageAnswer,
  fetchStageHint,
  fetchAgentProfiles,
  fetchHealth,
  fetchLearningDashboard,
  fetchQuestion,
  fetchQuestions,
  fetchSession,
  fetchStageEvaluations,
  fetchSettings,
  resetStage as resetSessionStage,
  saveSettings as persistSettings,
  saveLearningNote as persistLearningNote,
  saveLearningRecommendation as persistLearningRecommendation,
  saveLearningTheme as persistLearningTheme,
  saveStageDraft,
  submitStage,
  syncSharedStage as syncSharedSessionStage,
  trackTelemetry,
  validateAgentProfile as runAgentValidation
} from "../lib/api";

type AppState = {
  theme: "light" | "dark";
  health: HealthResponse | null;
  appMeta: AppMeta | null;
  settings: AppSettings | null;
  agentProfiles: AgentProfile[];
  lastAgentValidation: AgentValidation | null;
  questions: QuestionSummary[];
  currentQuestion: QuestionDetail | null;
  currentSession: InterviewSession | null;
  currentMode: InterviewMode | null;
  learningDashboard: LearningDashboard | null;
  lastEvaluation: StageEvaluation | null;
  stageEvaluationHistory: Record<string, StageEvaluationHistoryEntry[]>;
  cachedStageAnswers: Record<string, StageAnswer>;
  hintHistory: StageHint[];
  lastAnswer: StageAnswer | null;
  bootLoading: boolean;
  questionLoading: boolean;
  sessionLoading: boolean;
  savingDraft: boolean;
  settingsOpen: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  refreshQuestions: () => Promise<void>;
  loadQuestion: (slug: string) => Promise<void>;
  loadLearningDashboard: () => Promise<void>;
  saveLearningTheme: (input: LearningItemInput) => Promise<void>;
  deleteLearningTheme: (itemId: string) => Promise<void>;
  saveLearningRecommendation: (input: LearningItemInput) => Promise<void>;
  deleteLearningRecommendation: (itemId: string) => Promise<void>;
  saveLearningNote: (input: LearningNoteInput) => Promise<void>;
  deleteLearningNote: (noteId: string) => Promise<void>;
  selectMode: (mode: InterviewMode) => void;
  startOrResumeSession: (slug: string, mode: InterviewMode, restart?: boolean) => Promise<void>;
  refreshSession: (sessionId: string) => Promise<void>;
  saveDraft: (sessionId: string, stageId: string, answer: string) => Promise<void>;
  requestStageHint: (sessionId: string, stageId: string) => Promise<void>;
  requestStageAnswer: (sessionId: string, stageId: string) => Promise<void>;
  loadStageEvaluations: (sessionId: string, stageId: string) => Promise<void>;
  resetStage: (sessionId: string, stageId: string) => Promise<void>;
  syncSharedStage: (sessionId: string, stageId: string) => Promise<void>;
  submitCurrentStage: (sessionId: string, stageId: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  loadAgentProfiles: () => Promise<void>;
  validateAgentProfile: (input: AgentProfileInput) => Promise<AgentValidation>;
  createAgentProfile: (input: AgentProfileInput) => Promise<void>;
  deleteAgentProfile: (agentId: string) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  clearEvaluation: () => void;
  toggleTheme: () => void;
};

const normalizeError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  theme: "dark",
  health: null,
  appMeta: null,
  settings: null,
  agentProfiles: [],
  lastAgentValidation: null,
  questions: [],
  currentQuestion: null,
  currentSession: null,
  currentMode: null,
  learningDashboard: null,
  lastEvaluation: null,
  stageEvaluationHistory: {},
  cachedStageAnswers: {},
  hintHistory: [],
  lastAnswer: null,
  bootLoading: true,
  questionLoading: false,
  sessionLoading: false,
  savingDraft: false,
  settingsOpen: false,
  error: null,
  bootstrap: async () => {
    set({
      bootLoading: true,
      error: null
    });

    try {
      const [health, appMeta, settings, questions, agentProfiles] = await Promise.all([
        fetchHealth(),
        fetchAppMeta(),
        fetchSettings(),
        fetchQuestions(),
        fetchAgentProfiles()
      ]);
      set({
        health,
        appMeta,
        settings,
        questions,
        agentProfiles,
        bootLoading: false
      });
      void trackTelemetry({
        name: "app_bootstrap_succeeded",
        scope: "app",
        path: "/",
        questionSlug: null,
        mode: null,
        metadata: {
          seededQuestions: String(questions.length)
        },
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to load app shell."),
        bootLoading: false
      });
    }
  },
  refreshQuestions: async () => {
    try {
      const questions = await fetchQuestions();
      set({ questions });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to refresh questions.")
      });
    }
  },
  loadQuestion: async (slug) => {
    const existingQuestion = get().currentQuestion;
    const existingSession = get().currentSession;
    const isSameQuestion = existingQuestion?.slug === slug;

    set({
      questionLoading: !isSameQuestion,
      currentQuestion: isSameQuestion ? existingQuestion : null,
      currentSession: isSameQuestion ? existingSession : null,
      lastEvaluation: null,
      hintHistory: [],
      lastAnswer: null,
      error: null
    });

    try {
      const question = await fetchQuestion(slug);
      const preferredMode = question.progress?.activeMode ?? question.supportedModes[0] ?? null;

      set({
        currentQuestion: question,
        currentMode: preferredMode,
        questionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to load problem."),
        questionLoading: false
      });
    }
  },
  loadLearningDashboard: async () => {
    set({ error: null });

    try {
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to load learning dashboard.")
      });
    }
  },
  saveLearningTheme: async (input) => {
    set({ error: null });

    try {
      await persistLearningTheme(input);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to save learning theme.")
      });
    }
  },
  deleteLearningTheme: async (itemId) => {
    set({ error: null });

    try {
      await removeLearningTheme(itemId);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to delete learning theme.")
      });
    }
  },
  saveLearningRecommendation: async (input) => {
    set({ error: null });

    try {
      await persistLearningRecommendation(input);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to save recommendation.")
      });
    }
  },
  deleteLearningRecommendation: async (itemId) => {
    set({ error: null });

    try {
      await removeLearningRecommendation(itemId);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to delete recommendation.")
      });
    }
  },
  saveLearningNote: async (input) => {
    set({ error: null });

    try {
      await persistLearningNote(input);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to save learning note.")
      });
    }
  },
  deleteLearningNote: async (noteId) => {
    set({ error: null });

    try {
      await removeLearningNote(noteId);
      const learningDashboard = await fetchLearningDashboard();
      set({ learningDashboard });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to delete learning note.")
      });
    }
  },
  selectMode: (mode) => {
    set({
      currentMode: mode,
      currentSession:
        get().currentSession?.mode === mode
          ? get().currentSession
          : null,
      lastEvaluation: null,
      hintHistory: [],
      lastAnswer: null
    });
  },
  startOrResumeSession: async (slug, mode, restart = false) => {
    set({
      sessionLoading: true,
      lastEvaluation: null,
      error: null
    });

    try {
      const session = await createOrResumeSession(slug, mode, restart);
      const [questions, question] = await Promise.all([fetchQuestions(), fetchQuestion(slug)]);

      set({
        questions,
        currentQuestion: question,
        currentSession: session,
        currentMode: mode,
        hintHistory: [],
        lastAnswer: null,
        lastEvaluation: null,
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to start session."),
        sessionLoading: false
      });
    }
  },
  refreshSession: async (sessionId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const session = await fetchSession(sessionId);
      set({
        currentSession: session,
        currentMode: session.mode,
        hintHistory: [],
        lastAnswer: null,
        lastEvaluation: null,
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to refresh session."),
        sessionLoading: false
      });
    }
  },
  saveDraft: async (sessionId, stageId, answer) => {
    set({
      savingDraft: true,
      error: null
    });

    try {
      const session = await saveStageDraft(sessionId, stageId, answer);
      const existingEvaluation = get().lastEvaluation;
      set({
        currentSession: session,
        currentMode: session.mode,
        savingDraft: false,
        lastEvaluation:
          existingEvaluation && existingEvaluation.session.id === session.id ? { ...existingEvaluation, session } : existingEvaluation
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to save draft."),
        savingDraft: false
      });
    }
  },
  requestStageHint: async (sessionId, stageId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const hint = await fetchStageHint(sessionId, stageId);
      set({
        hintHistory: [...get().hintHistory, hint],
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to generate hint."),
        sessionLoading: false
      });
    }
  },
  requestStageAnswer: async (sessionId, stageId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const answer = await fetchStageAnswer(sessionId, stageId);
      set({
        currentSession: answer.session ?? get().currentSession,
        cachedStageAnswers: {
          ...get().cachedStageAnswers,
          [stageId]: answer
        },
        lastAnswer: answer,
        hintHistory: [],
        lastEvaluation: null,
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to generate answer."),
        sessionLoading: false
      });
    }
  },
  loadStageEvaluations: async (sessionId, stageId) => {
    try {
      const items = await fetchStageEvaluations(sessionId, stageId);
      set({
        stageEvaluationHistory: {
          ...get().stageEvaluationHistory,
          [stageId]: items
        }
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to load stage evaluations.")
      });
    }
  },
  resetStage: async (sessionId, stageId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const session = await resetSessionStage(sessionId, stageId);
      const [questions, question, history] = await Promise.all([
        fetchQuestions(),
        get().currentQuestion ? fetchQuestion(get().currentQuestion!.slug) : Promise.resolve(null),
        fetchStageEvaluations(sessionId, stageId)
      ]);

      set({
        questions,
        currentQuestion: question,
        currentSession: session,
        currentMode: session.mode,
        stageEvaluationHistory: {
          ...get().stageEvaluationHistory,
          [stageId]: history
        },
        lastEvaluation: null,
        hintHistory: [],
        lastAnswer: null,
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to reset stage."),
        sessionLoading: false
      });
    }
  },
  syncSharedStage: async (sessionId, stageId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const session = await syncSharedSessionStage(sessionId, stageId);
      const [questions, question, history] = await Promise.all([
        fetchQuestions(),
        get().currentQuestion ? fetchQuestion(get().currentQuestion!.slug) : Promise.resolve(null),
        fetchStageEvaluations(sessionId, stageId)
      ]);

      set({
        questions,
        currentQuestion: question,
        currentSession: session,
        currentMode: session.mode,
        stageEvaluationHistory: {
          ...get().stageEvaluationHistory,
          [stageId]: history
        },
        lastEvaluation: null,
        hintHistory: [],
        lastAnswer: null,
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to sync shared stage."),
        sessionLoading: false
      });
    }
  },
  submitCurrentStage: async (sessionId, stageId) => {
    set({
      sessionLoading: true,
      error: null
    });

    try {
      const evaluation = await submitStage(sessionId, stageId);
      const [questions, question, history] = await Promise.all([
        fetchQuestions(),
        get().currentQuestion ? fetchQuestion(get().currentQuestion!.slug) : Promise.resolve(null),
        fetchStageEvaluations(sessionId, stageId)
      ]);

      set({
        questions,
        currentQuestion: question,
        currentSession: evaluation.session,
        currentMode: evaluation.session.mode,
        stageEvaluationHistory: {
          ...get().stageEvaluationHistory,
          [stageId]: history
        },
        lastEvaluation: evaluation,
        lastAnswer: null,
        hintHistory: [],
        sessionLoading: false
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to submit stage."),
        sessionLoading: false
      });
    }
  },
  updateSettings: async (settingsInput) => {
    set({
      error: null
    });

    try {
      const settings = await persistSettings(settingsInput);
      set({ settings });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to update settings.")
      });
    }
  },
  loadAgentProfiles: async () => {
    try {
      const agentProfiles = await fetchAgentProfiles();
      set({ agentProfiles });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to load agent profiles.")
      });
    }
  },
  validateAgentProfile: async (input) => {
    set({ error: null });

    try {
      const validation = await runAgentValidation(input);
      set({ lastAgentValidation: validation });
      return validation;
    } catch (error) {
      const message = normalizeError(error, "Failed to validate agent profile.");
      set({
        error: message,
        lastAgentValidation: null
      });
      throw new Error(message);
    }
  },
  createAgentProfile: async (input) => {
    set({ error: null });

    try {
      const created = await persistAgentProfile(input);
      set({
        agentProfiles: [created, ...get().agentProfiles]
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to create agent profile.")
      });
    }
  },
  deleteAgentProfile: async (agentId) => {
    set({ error: null });

    try {
      await removeAgentProfile(agentId);
      set({
        agentProfiles: get().agentProfiles.filter((profile) => profile.id !== agentId)
      });
    } catch (error) {
      set({
        error: normalizeError(error, "Failed to delete agent profile.")
      });
    }
  },
  openSettings: () => {
    set({ settingsOpen: true });
  },
  closeSettings: () => {
    set({ settingsOpen: false });
  },
  clearEvaluation: () => {
    set({
      lastEvaluation: null,
      hintHistory: [],
      lastAnswer: null
    });
  },
  toggleTheme: () => {
    set((state) => ({
      theme: state.theme === "dark" ? "light" : "dark"
    }));
  }
    }),
    {
      name: "hinterview-stage-cache",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        stageEvaluationHistory: state.stageEvaluationHistory,
        cachedStageAnswers: state.cachedStageAnswers
      })
    }
  )
);
