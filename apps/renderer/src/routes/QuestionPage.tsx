import type { InterviewMode, PlaygroundScene, QuestionStage, QuestionStageDraft, StageProgress } from "@hinterview/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { InterviewPlayground } from "../components/InterviewPlayground";
import { beautifyQuestionStageDraft, saveQuestionStageDraft, suggestQuestionStage, trackTelemetry } from "../lib/api";
import { buildStagePlaygroundAnswer, getPlaygroundStorageKey, mergeSceneWithStages } from "../lib/playground";
import { useAppStore } from "../store/appStore";

const modeLabel: Record<InterviewMode, string> = {
  hld: "High-level design",
  lld: "Low-level design"
};

const emptyEvaluationHistory: ReadonlyArray<never> = [];
const formatScore = (score: number) => score.toFixed(2);
const getPanelStorageKey = (slug: string, mode: InterviewMode) => `hinterview:selected-panel:${slug}:${mode}`;
const sharedStageTitles = new Set([
  "Functional requirements",
  "Non-functional requirements",
  "Core entities",
  "API routes"
]);

type StageListItem = QuestionStage | StageProgress;
type RightPanel = "question-details" | string;

const getStageKey = (stage: StageListItem) => ("stageId" in stage ? stage.stageId : stage.id);
const parseLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
const toMultiline = (items: string[]) => items.join("\n");

const getStageStatus = (stage: StageListItem): StageProgress["status"] =>
  "status" in stage ? stage.status : stage.orderIndex === 0 ? "active" : "locked";

const isSharedStageTitle = (title: string, supportedModes: InterviewMode[] = []) =>
  supportedModes.includes("hld") && supportedModes.includes("lld") && sharedStageTitles.has(title);

const hasStoredStageDraftData = (draftAnswer: string): boolean => {
  const trimmed = draftAnswer.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as { plainText?: string; items?: unknown[] };
    return Boolean(parsed.plainText?.trim()) || Array.isArray(parsed.items) && parsed.items.length > 0;
  } catch {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return false;
    }
    return true;
  }
};

export function QuestionPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const {
    agentProfiles,
    bootLoading,
    cachedStageAnswers,
    clearEvaluation,
    currentMode,
    currentQuestion,
    currentSession,
    error,
    hintHistory,
    lastAnswer,
    loadStageEvaluations,
    loadQuestion,
    refreshSession,
    questionLoading,
    requestStageAnswer,
    requestStageHint,
    resetStage,
    selectMode,
    sessionLoading,
    settings,
    startOrResumeSession,
    submitCurrentStage,
    saveDraft,
    syncSharedStage
  } = useAppStore();

  const [playgroundScene, setPlaygroundScene] = useState<PlaygroundScene | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<RightPanel>("question-details");
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [leftRailHoverOpen, setLeftRailHoverOpen] = useState(false);
  const [leftRailHovering, setLeftRailHovering] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [relatedQuestionOpen, setRelatedQuestionOpen] = useState(false);
  const [relatedSampleQuestion, setRelatedSampleQuestion] = useState("");
  const [relatedDraft, setRelatedDraft] = useState<QuestionStageDraft | null>(null);
  const [relatedQuestionError, setRelatedQuestionError] = useState<string | null>(null);
  const [relatedQuestionBusy, setRelatedQuestionBusy] = useState<"suggest" | "beautify" | "save" | null>(null);
  const rightSectionRef = useRef<HTMLElement | null>(null);
  const rightHeaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (slug && currentQuestion?.slug !== slug) {
      void loadQuestion(slug);
    }
  }, [currentQuestion?.slug, loadQuestion, slug]);

  const selectedMode = currentMode ?? currentQuestion?.supportedModes[0] ?? null;

  useEffect(() => {
    if (!slug || !selectedMode) {
      return;
    }

    void trackTelemetry({
      name: "question_viewed",
      scope: "question",
      path: `/questions/${slug}`,
      questionSlug: slug,
      mode: selectedMode,
      metadata: {},
      createdAt: new Date().toISOString()
    });
  }, [selectedMode, slug]);

  const questionStages = useMemo(() => {
    if (!currentQuestion || !selectedMode) {
      return [];
    }

    return currentQuestion.stages
      .filter((stage) => stage.mode === selectedMode)
      .sort((left, right) => left.orderIndex - right.orderIndex);
  }, [currentQuestion, selectedMode]);

  const stageDefinitions = useMemo(
    () => new Map(questionStages.map((stage) => [stage.id, stage])),
    [questionStages]
  );

  const activeSessionForMode = currentSession && currentSession.mode === selectedMode ? currentSession : null;
  const stageRows = activeSessionForMode?.stages ?? questionStages;
  const activeStage = activeSessionForMode?.stages.find((stage) => stage.status === "active") ?? null;
  const hasSolvedMode = Boolean(selectedMode && currentQuestion?.progress?.solvedModes.includes(selectedMode));
  const sequentialStageFlow = settings?.sequentialStageFlow ?? true;

  useEffect(() => {
    if (!currentQuestion || !selectedMode || sessionLoading) {
      return;
    }

    if (currentSession?.mode === selectedMode) {
      return;
    }

    void startOrResumeSession(currentQuestion.slug, selectedMode);
  }, [currentQuestion, currentSession?.mode, selectedMode, sessionLoading, startOrResumeSession]);

  useEffect(() => {
    if (!slug || !selectedMode) {
      return;
    }

    const storedPanel = window.localStorage.getItem(getPanelStorageKey(slug, selectedMode));
    if (storedPanel) {
      setSelectedPanel(storedPanel);
      return;
    }

    if (activeStage?.stageId) {
      setSelectedPanel(activeStage.stageId);
    } else {
      setSelectedPanel("question-details");
    }
  }, [activeStage?.stageId, selectedMode, slug]);

  useEffect(() => {
    if (selectedPanel === "question-details") {
      return;
    }

    const selectedStillExists = stageRows.some((stage) => getStageKey(stage) === selectedPanel);
    if (selectedStillExists) {
      return;
    }

    if (activeStage?.stageId) {
      setSelectedPanel(activeStage.stageId);
      return;
    }

    setSelectedPanel("question-details");
  }, [activeStage?.stageId, selectedPanel, stageRows]);

  useEffect(() => {
    if (!slug || !selectedMode) {
      return;
    }

    window.localStorage.setItem(getPanelStorageKey(slug, selectedMode), selectedPanel);
  }, [selectedMode, selectedPanel, slug]);

  useEffect(() => {
    if (!currentQuestion || !selectedMode || !activeSessionForMode) {
      setPlaygroundScene(null);
      return;
    }

    const stored = window.localStorage.getItem(getPlaygroundStorageKey(currentQuestion.slug, selectedMode));
    let parsed: unknown = null;
    if (stored) {
      try {
        parsed = JSON.parse(stored);
      } catch {
        parsed = null;
      }
    }

    setPlaygroundScene(
      mergeSceneWithStages(parsed, currentQuestion.slug, selectedMode, activeSessionForMode.stages)
    );
  }, [activeSessionForMode, currentQuestion, selectedMode]);

  useEffect(() => {
    const activeEditorStage = activeSessionForMode?.stages.find((stage) => stage.status === "active");

    if (!currentQuestion || !selectedMode || !playgroundScene || !activeSessionForMode || !activeEditorStage) {
      return;
    }

    window.localStorage.setItem(
      getPlaygroundStorageKey(currentQuestion.slug, selectedMode),
      JSON.stringify(playgroundScene)
    );

    const stageAnswer = buildStagePlaygroundAnswer(playgroundScene, activeEditorStage.stageId);
    const serialized = stageAnswer ? JSON.stringify(stageAnswer) : "";

    if (serialized === activeEditorStage.draftAnswer) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveDraft(activeSessionForMode.id, activeEditorStage.stageId, serialized);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [activeSessionForMode, currentQuestion, playgroundScene, saveDraft, selectedMode]);

  useEffect(() => {
    if (!activeSessionForMode || selectedPanel === "question-details") {
      return;
    }

    void loadStageEvaluations(activeSessionForMode.id, selectedPanel);
  }, [activeSessionForMode, loadStageEvaluations, selectedPanel]);

  const selectedStage = useMemo(
    () => stageRows.find((stage) => getStageKey(stage) === selectedPanel) ?? null,
    [selectedPanel, stageRows]
  );

  const selectedStageDefinition = selectedStage ? stageDefinitions.get(getStageKey(selectedStage)) ?? null : null;
  const selectedStageStatus = selectedStage ? getStageStatus(selectedStage) : "locked";
  const selectedStageKey = selectedStage ? getStageKey(selectedStage) : null;
  const evaluationHistory = useAppStore((state) =>
    selectedStageKey ? state.stageEvaluationHistory[selectedStageKey] ?? emptyEvaluationHistory : emptyEvaluationHistory
  );
  const latestEvaluation =
    evaluationHistory[0] ??
    (selectedStage && "lastScore" in selectedStage && selectedStage.lastScore !== null
      ? {
          score: selectedStage.lastScore,
          strengths: selectedStage.lastStrengths,
          weaknesses: selectedStage.lastWeaknesses,
          feedbackSummary: selectedStage.lastFeedbackSummary ?? "No saved summary found.",
          matchedKeywords: [],
          missingKeywords: [],
          createdAt: "",
          id: `session-${selectedStage.stageId}`,
          sessionId: activeSessionForMode?.id ?? "",
          stageId: selectedStage.stageId
        }
      : null);
  const revealedAnswerForSelectedStage =
    (selectedStageKey && lastAnswer?.stageId === selectedStageKey ? lastAnswer : null) ??
    (selectedStageKey ? cachedStageAnswers[selectedStageKey] ?? null : null);
  const persistedReferenceAnswer =
    selectedStage &&
    "referenceAnswer" in selectedStage &&
    selectedStageDefinition &&
    selectedStage.referenceAnswer !== selectedStageDefinition.referenceAnswer
      ? selectedStage.referenceAnswer
      : null;
  const visibleReferenceAnswer = revealedAnswerForSelectedStage?.answer ?? persistedReferenceAnswer;
  const selectedAgent =
    activeSessionForMode?.selectedAgentId
      ? agentProfiles.find((profile) => profile.id === activeSessionForMode.selectedAgentId) ?? null
      : null;
  const isSelectedStageActive = Boolean(
    selectedStage &&
      (((activeStage &&
        selectedStageKey === activeStage.stageId &&
        selectedStageStatus === "active") ||
        (!sequentialStageFlow && selectedStageStatus !== "revealed" && selectedStageStatus !== "solved")) &&
      "stageId" in selectedStage) &&
      activeSessionForMode
  );
  const minimumWords = selectedStageDefinition?.minimumWords ?? 0;
  const canRequestAnswerForSelectedStage = Boolean(
    activeSessionForMode &&
      selectedStage &&
      "stageId" in selectedStage &&
      (selectedStageStatus === "active" || selectedStageStatus === "solved" || (!sequentialStageFlow && selectedStageStatus === "locked"))
  );
  const canRequestHintForSelectedStage = Boolean(
    isSelectedStageActive && activeSessionForMode && selectedStage && "stageId" in selectedStage
  );
  const canEditSelectedStageLayout = Boolean(
    selectedStage &&
      (selectedStageStatus !== "locked" || !sequentialStageFlow)
  );
  const canRenderPlayground = Boolean(playgroundScene || (activeSessionForMode?.stages.length ?? 0) > 0);
  const selectedStageHasStoredDraftData = Boolean(
    selectedStage &&
      "draftAnswer" in selectedStage &&
      hasStoredStageDraftData(selectedStage.draftAnswer)
  );
  const selectedStageRenderedAnswer =
    selectedStageKey && playgroundScene ? buildStagePlaygroundAnswer(playgroundScene, selectedStageKey) : null;
  const selectedStageHasRenderedPlaygroundData = Boolean(
    selectedStageRenderedAnswer &&
      (selectedStageRenderedAnswer.plainText.trim().length > 0 || selectedStageRenderedAnswer.items.length > 0)
  );
  const canSyncSharedStage = Boolean(
    activeSessionForMode &&
      selectedStage &&
      "stageId" in selectedStage &&
      isSharedStageTitle(selectedStage.title, currentQuestion?.supportedModes ?? []) &&
      (!selectedStageHasStoredDraftData || !selectedStageHasRenderedPlaygroundData)
  );
  const stageScores = useMemo(
    () =>
      Object.fromEntries(
        (activeSessionForMode?.stages ?? []).map((stage) => [stage.stageId, stage.lastScore])
      ) as Record<string, number | null>,
    [activeSessionForMode?.stages]
  );
  const leftRailExpanded = !leftRailCollapsed || leftRailHoverOpen;
  const shouldShowTopStagePreview = leftRailHoverOpen || (leftRailHovering && !leftRailCollapsed && !headerVisible);

  useEffect(() => {
    const container = rightSectionRef.current;
    const header = rightHeaderRef.current;

    if (!container || !header) {
      return;
    }

    const updateVisibility = () => {
      const headerBottom = header.offsetTop + header.offsetHeight;
      setHeaderVisible(container.scrollTop < headerBottom - 24);
    };

    updateVisibility();
    container.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      container.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [selectedPanel, currentQuestion?.slug, selectedMode]);

  const buildRelatedQuestionDraft = async () => {
    if (!currentQuestion || !selectedMode || !relatedSampleQuestion.trim()) {
      return;
    }

    setRelatedQuestionBusy("beautify");
    setRelatedQuestionError(null);

    try {
      const draft = await beautifyQuestionStageDraft(currentQuestion.slug, {
        questionSlug: currentQuestion.slug,
        mode: selectedMode,
        sampleQuestion: relatedSampleQuestion.trim()
      });
      setRelatedDraft(draft);
    } catch (error) {
      setRelatedQuestionError(error instanceof Error ? error.message : "Failed to beautify related question.");
    } finally {
      setRelatedQuestionBusy(null);
    }
  };

  const suggestRelatedQuestion = async () => {
    if (!currentQuestion || !selectedMode) {
      return;
    }

    setRelatedQuestionBusy("suggest");
    setRelatedQuestionError(null);

    try {
      const suggestion = await suggestQuestionStage(currentQuestion.slug, selectedMode);
      setRelatedSampleQuestion(suggestion.sampleQuestion);
      const draft = await beautifyQuestionStageDraft(currentQuestion.slug, {
        questionSlug: currentQuestion.slug,
        mode: selectedMode,
        sampleQuestion: suggestion.sampleQuestion
      });
      setRelatedDraft(draft);
    } catch (error) {
      setRelatedQuestionError(error instanceof Error ? error.message : "Failed to suggest a stage question.");
    } finally {
      setRelatedQuestionBusy(null);
    }
  };

  const saveRelatedQuestion = async () => {
    if (!relatedDraft || !currentQuestion) {
      return;
    }

    setRelatedQuestionBusy("save");
    setRelatedQuestionError(null);

    try {
      await saveQuestionStageDraft(currentQuestion.slug, relatedDraft);
      setRelatedQuestionOpen(false);
      setRelatedSampleQuestion("");
      setRelatedDraft(null);
      void loadQuestion(currentQuestion.slug);
      if (currentSession) {
        await refreshSession(currentSession.id);
      }
    } catch (error) {
      setRelatedQuestionError(error instanceof Error ? error.message : "Failed to add stage.");
    } finally {
      setRelatedQuestionBusy(null);
    }
  };
  if (!bootLoading && agentProfiles.length === 0) {
    return <Navigate replace to="/settings" />;
  }

  if (questionLoading || !currentQuestion || !selectedMode) {
    if (!questionLoading && (!currentQuestion || !selectedMode)) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#07141f] px-6 text-white">
          <section className="w-full max-w-2xl rounded-[2rem] border border-rose-400/20 bg-white/10 px-8 py-8 shadow-card backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-rose-200">Load failed</div>
            <p className="mt-3 text-sm leading-6 text-slate-100">{error ?? "The question could not be restored."}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-[#07141f]"
                onClick={() => {
                  if (slug) {
                    void loadQuestion(slug);
                  }
                }}
                type="button"
              >
                Retry loading question
              </button>
              <button
                className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white"
                onClick={() => navigate("/")}
                type="button"
              >
                Back to library
              </button>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07141f] px-6 text-white">
        <div className="rounded-2xl border border-white/10 bg-white/10 px-6 py-4 shadow-card backdrop-blur">
          Loading problem...
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-[#07141f] px-6 py-8 text-white md:px-10">
      <div className="flex h-[calc(100vh-7rem)] w-full flex-col gap-6">
        {shouldShowTopStagePreview ? (
          <div className="pointer-events-none fixed left-1/2 top-[5.25rem] z-20 w-full max-w-[42rem] -translate-x-1/2 px-6">
            <section className="pointer-events-auto rounded-[1.5rem] border border-white/10 bg-[#0d1d2b]/95 px-5 py-4 shadow-card backdrop-blur">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {selectedPanel === "question-details" ? "Current section" : "Current stage"}
                </div>
                {selectedPanel === "question-details" ? (
                  <>
                    <div className="text-base font-semibold text-white">Question details</div>
                    <p className="text-sm leading-6 text-slate-300">{currentQuestion.summary}</p>
                  </>
                ) : selectedStage ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        Stage {(selectedStage.orderIndex ?? 0) + 1}
                      </span>
                      {isSharedStageTitle(selectedStage.title, currentQuestion?.supportedModes ?? []) ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                          Shared
                        </span>
                      ) : null}
                    </div>
                    <div className="text-base font-semibold text-white">{selectedStage.title}</div>
                    <p className="text-sm leading-6 text-slate-300">
                      {"prompt" in selectedStage ? selectedStage.prompt : stageDefinitions.get(getStageKey(selectedStage))?.prompt ?? ""}
                    </p>
                    {("guidance" in selectedStage ? selectedStage.guidance : stageDefinitions.get(getStageKey(selectedStage))?.guidance) ? (
                      <p className="text-xs leading-5 text-slate-400">
                        {"guidance" in selectedStage ? selectedStage.guidance : stageDefinitions.get(getStageKey(selectedStage))?.guidance}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <section className={`grid min-h-0 ${leftRailCollapsed ? "gap-0 xl:grid-cols-[58px_minmax(0,1fr)]" : "gap-6 xl:grid-cols-[310px_minmax(0,1fr)]"}`}>
          <aside
            className="relative min-h-0"
            onMouseEnter={() => {
              setLeftRailHovering(true);
              if (leftRailCollapsed) {
                setLeftRailHoverOpen(true);
              }
            }}
            onMouseLeave={() => {
              setLeftRailHovering(false);
              if (leftRailCollapsed) {
                setLeftRailHoverOpen(false);
              }
            }}
          >
            {leftRailCollapsed ? (
              <div className="hidden h-full w-[58px] xl:block">
                <div className="absolute left-[-3px] top-0 z-20 flex w-10 flex-col items-center gap-3 py-4">
                <button
                  aria-label="Expand left section"
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[#0d1d2b] text-lg text-white transition hover:border-brand-teal/40 hover:text-brand-teal"
                  onClick={() => {
                    setLeftRailCollapsed(false);
                    setLeftRailHoverOpen(false);
                  }}
                  type="button"
                >
                  {">"}
                </button>
                <button
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm transition ${
                    selectedPanel === "question-details"
                      ? "border-brand-teal bg-white text-[#07141f]"
                      : "border-white/10 bg-[#0d1d2b] text-slate-300 hover:border-brand-teal/40 hover:text-white"
                  }`}
                  onClick={() => setSelectedPanel("question-details")}
                  type="button"
                >
                  Q
                </button>
                {stageRows.map((stage) => {
                  const stageKey = getStageKey(stage);
                  const stageStatus = getStageStatus(stage);
                  const isSelected = selectedStageKey === stageKey;
                  return (
                    <button
                      className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border text-xs font-medium transition ${
                        isSelected
                          ? "border-brand-teal bg-white text-[#07141f]"
                          : "border-white/10 bg-[#0d1d2b] text-slate-300 hover:border-brand-teal/40 hover:text-white"
                      }`}
                      key={stageKey}
                      onClick={() => setSelectedPanel(stageKey)}
                      type="button"
                    >
                      {stage.orderIndex + 1}
                      <span
                        className={`absolute right-1 top-1 h-2 w-2 rounded-full ${
                          stageStatus === "solved"
                            ? "bg-emerald-500"
                            : stageStatus === "revealed"
                              ? "bg-amber-400"
                              : stageStatus === "active"
                                ? "bg-sky-500"
                                : "bg-white/20"
                        }`}
                      />
                    </button>
                  );
                })}
                </div>
              </div>
            ) : null}

            {leftRailExpanded ? (
              <div
                className={
                  leftRailCollapsed
                    ? "absolute left-[-3px] top-0 z-30 flex h-full w-[310px] min-h-0 flex-col overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0d1d2b] shadow-card"
                    : "flex h-full min-h-0 flex-col gap-5 pr-1 xl:-ml-[3px]"
                }
              >
                <section
                  className={
                    leftRailCollapsed
                      ? "relative px-6 pb-5 pt-6"
                      : "relative rounded-[1.8rem] border border-white/10 bg-[#0d1d2b] p-6 shadow-card"
                  }
                >
                  <button
                    aria-label={leftRailCollapsed ? "Expand left section" : "Collapse left section"}
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-white transition hover:border-brand-teal/40 hover:text-brand-teal"
                    onClick={() => {
                      setLeftRailCollapsed((value) => !value);
                      setLeftRailHoverOpen(false);
                    }}
                    type="button"
                  >
                    {leftRailCollapsed ? ">" : "<"}
                  </button>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Track</div>
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.supportedModes.map((mode) => (
                      <button
                        className={`rounded-full px-4 py-2 text-sm uppercase tracking-[0.16em] transition ${
                          mode === selectedMode
                            ? "bg-white text-[#07141f]"
                            : "border border-white/10 bg-white/5 text-slate-300 hover:border-brand-teal/50 hover:text-white"
                        }`}
                        key={mode}
                        onClick={() => {
                          clearEvaluation();
                          selectMode(mode);
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-400">
                    <span>Progress</span>
                    <span>{activeSessionForMode?.completionPercent ?? currentQuestion.progress?.completionPercent ?? 0}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-teal"
                      style={{
                        width: `${activeSessionForMode?.completionPercent ?? currentQuestion.progress?.completionPercent ?? 0}%`
                      }}
                    />
                  </div>

                  {selectedAgent ? (
                    <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                      Using default agent <span className="font-medium text-white">{selectedAgent.name}</span> with{" "}
                      <span className="font-medium text-white">{selectedAgent.model}</span>.
                    </div>
                  ) : null}

                  {sessionLoading ? (
                    <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                      Restoring saved progress for this track...
                    </div>
                  ) : hasSolvedMode ? (
                    <div className="mt-4 rounded-[1.2rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-50">
                      This track was completed before. The latest saved stage state is loaded automatically.
                    </div>
                  ) : null}
                </div>
              </div>
                </section>

                <section
                  className={
                    leftRailCollapsed
                      ? "min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-5 py-5"
                      : "min-h-0 flex-1 overflow-y-auto rounded-[1.8rem] border border-white/10 bg-[#0d1d2b] p-5 shadow-card"
                  }
                >
                  <div className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">Question flow</div>

                  <button
                    className={`mb-3 flex w-full items-start gap-3 rounded-[1.2rem] px-3 py-3 text-left transition ${
                      selectedPanel === "question-details" ? "bg-white text-[#07141f]" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setSelectedPanel("question-details")}
                  >
                    <div
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        selectedPanel === "question-details" ? "bg-brand-teal" : "bg-white/20"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className={`text-[11px] uppercase tracking-[0.18em] ${selectedPanel === "question-details" ? "text-slate-500" : "text-slate-400"}`}>
                        Overview
                      </div>
                      <div className="mt-1 text-sm font-medium">Question details</div>
                    </div>
                  </button>

                  <div className="space-y-1.5">
                    {stageRows.map((stage) => {
                      const stageKey = getStageKey(stage);
                      const stageStatus = getStageStatus(stage);
                      const isSelected = selectedStageKey === stageKey;
                      const isSharedStage = isSharedStageTitle(stage.title, currentQuestion?.supportedModes ?? []);

                      return (
                        <button
                          className={`flex w-full items-start gap-3 rounded-[1.2rem] px-3 py-3 text-left transition ${
                            isSelected ? "bg-white text-[#07141f]" : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`}
                          key={stageKey}
                          onClick={() => setSelectedPanel(stageKey)}
                        >
                          <div
                            className={`mt-1 h-2.5 w-2.5 rounded-full ${
                              stageStatus === "solved"
                                ? "bg-emerald-500"
                                : stageStatus === "revealed"
                                  ? "bg-amber-400"
                                  : stageStatus === "active"
                                    ? "bg-sky-500"
                                    : isSelected
                                      ? "bg-slate-500"
                                      : "bg-white/20"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className={`text-[11px] uppercase tracking-[0.18em] ${isSelected ? "text-slate-500" : "text-slate-400"}`}>
                              Stage {(stage.orderIndex ?? 0) + 1}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{stage.title}</span>
                              {isSharedStage ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                                    isSelected
                                      ? "border-slate-300 bg-slate-100 text-slate-600"
                                      : "border-white/10 bg-white/5 text-slate-400"
                                  }`}
                                >
                                  Shared
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {"stageId" in stage && (stage.status === "revealed" || stage.status === "solved") && activeSessionForMode ? (
                            <span
                              aria-label={stage.status === "solved" ? "Redo solved stage" : "Retry failed stage"}
                              className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                                isSelected
                                  ? "border-slate-300 text-[#07141f] hover:bg-slate-100"
                                  : "border-white/10 text-white hover:bg-white/10"
                              }`}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void resetStage(activeSessionForMode.id, stage.stageId);
                              }}
                              role="button"
                              title={stage.status === "solved" ? "Redo stage" : "Retry stage"}
                            >
                              ↻
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {error ? (
                    <div className="mt-4 rounded-[1.2rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  ) : null}
                  <button
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-brand-teal/40 hover:text-white"
                    onClick={() => {
                      setRelatedQuestionOpen(true);
                      setRelatedQuestionError(null);
                      setRelatedDraft(null);
                    }}
                    type="button"
                  >
                    <span className="text-lg leading-none">+</span>
                    <span>Add related question</span>
                  </button>
                </section>
              </div>
            ) : null}
          </aside>

          <section className="min-h-0 overflow-y-auto rounded-[2rem] border border-white/10 bg-[#f7fbfc] text-brand-ink shadow-card" ref={rightSectionRef}>
            <div className="border-b border-slate-200 bg-white px-7 py-6 md:px-8" ref={rightHeaderRef}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  {selectedPanel === "question-details" ? (
                    <>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{modeLabel[selectedMode]}</div>
                      <h1 className="text-3xl font-semibold tracking-tight">{currentQuestion.title}</h1>
                      <p className="max-w-5xl text-sm leading-6 text-slate-600">{currentQuestion.detailedDescription}</p>
                    </>
                  ) : selectedStage ? (
                    <>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Stage {(selectedStage.orderIndex ?? 0) + 1}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-3xl font-semibold tracking-tight">{selectedStage.title}</h2>
                        {isSharedStageTitle(selectedStage.title, currentQuestion?.supportedModes ?? []) ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-sky-700">
                            Shared in HLD + LLD
                          </span>
                        ) : null}
                      </div>
                      <p className="max-w-5xl text-sm leading-6 text-slate-600">{selectedStage.prompt}</p>
                      <p className="max-w-5xl text-sm leading-6 text-slate-500">{selectedStage.guidance}</p>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canSyncSharedStage ? (
                    <button
                      className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                      onClick={() => {
                        if (activeSessionForMode && selectedStage && "stageId" in selectedStage) {
                          setPlaygroundScene((current) => {
                            if (!current) {
                              return current;
                            }

                            const next = {
                              ...current,
                              items: current.items.filter((item) => item.stageId !== selectedStage.stageId),
                              updatedAt: new Date().toISOString()
                            };

                            if (currentQuestion && selectedMode) {
                              window.localStorage.setItem(
                                getPlaygroundStorageKey(currentQuestion.slug, selectedMode),
                                JSON.stringify(next)
                              );
                            }

                            return next;
                          });
                          void syncSharedStage(activeSessionForMode.id, selectedStage.stageId);
                        }
                      }}
                      type="button"
                    >
                      Sync shared
                    </button>
                  ) : null}
                  {(selectedStageStatus === "revealed" || selectedStageStatus === "solved") &&
                  activeSessionForMode &&
                  selectedStage &&
                  "stageId" in selectedStage ? (
                    <button
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-500 transition hover:border-brand-teal/40 hover:text-brand-ink"
                      onClick={() => void resetStage(activeSessionForMode.id, selectedStage.stageId)}
                      type="button"
                    >
                      ↻ {selectedStageStatus === "solved" ? "Redo stage" : "Retry stage"}
                    </button>
                  ) : null}
                  {selectedStage ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {"remainingTries" in selectedStage ? `${selectedStage.remainingTries} tries left` : `${selectedStage.maxTries} tries`}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-6 px-7 py-7 md:px-8">
              {selectedPanel === "question-details" ? (
                <section className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">Assumptions</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {currentQuestion.assumptions.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </section>
                  {currentQuestion.qpsAssumptions.length > 0 ? (
                    <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">QPS assumptions</div>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        {currentQuestion.qpsAssumptions.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">Focus points</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {currentQuestion.focusPoints.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">In scope</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {currentQuestion.inScope.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">Out of scope</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {currentQuestion.outOfScope.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </section>
                </section>
              ) : selectedStage ? (
                <>
                  {canRenderPlayground ? (
                    <InterviewPlayground
                      scene={
                        playgroundScene ??
                        mergeSceneWithStages(null, currentQuestion.slug, selectedMode, activeSessionForMode?.stages ?? [])
                      }
                      selectedStageId={selectedStageKey ?? ""}
                      stageScores={stageScores}
                      minimumWords={minimumWords}
                      sessionLoading={sessionLoading}
                      contentEditable={isSelectedStageActive}
                      layoutEditable={canEditSelectedStageLayout}
                      canRequestHint={canRequestHintForSelectedStage}
                      canRequestAnswer={canRequestAnswerForSelectedStage}
                      hasReferenceAnswer={Boolean(visibleReferenceAnswer)}
                      onSceneChange={(nextScene) => {
                        clearEvaluation();
                        setPlaygroundScene(nextScene);
                      }}
                      onSubmit={() => {
                        if (activeSessionForMode && activeStage) {
                          void trackTelemetry({
                            name: "stage_submitted",
                            scope: "question",
                            path: `/questions/${currentQuestion.slug}`,
                            questionSlug: currentQuestion.slug,
                            mode: selectedMode,
                            metadata: {
                              stageId: activeStage.stageId
                            },
                            createdAt: new Date().toISOString()
                          });
                          void submitCurrentStage(activeSessionForMode.id, activeStage.stageId);
                        }
                      }}
                      onRequestHint={() => {
                        if (activeSessionForMode && activeStage) {
                          void trackTelemetry({
                            name: "stage_hint_requested",
                            scope: "question",
                            path: `/questions/${currentQuestion.slug}`,
                            questionSlug: currentQuestion.slug,
                            mode: selectedMode,
                            metadata: {
                              stageId: activeStage.stageId
                            },
                            createdAt: new Date().toISOString()
                          });
                          void requestStageHint(activeSessionForMode.id, activeStage.stageId);
                        }
                      }}
                      onRequestAnswer={() => {
                        if (activeSessionForMode && selectedStage && "stageId" in selectedStage) {
                          void trackTelemetry({
                            name: "stage_answer_requested",
                            scope: "question",
                            path: `/questions/${currentQuestion.slug}`,
                            questionSlug: currentQuestion.slug,
                            mode: selectedMode,
                            metadata: {
                              stageId: selectedStage.stageId
                            },
                            createdAt: new Date().toISOString()
                          });
                          void requestStageAnswer(activeSessionForMode.id, selectedStage.stageId);
                        }
                      }}
                      onSelectStage={(stageId) => setSelectedPanel(stageId)}
                    />
                  ) : (
                    <section className="rounded-[1.7rem] border border-slate-200 bg-white px-6 py-6 text-sm text-slate-500">
                      Restoring playground...
                    </section>
                  )}

                  {visibleReferenceAnswer ? (
                    <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-amber-800">Reference answer</div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-amber-950">{visibleReferenceAnswer}</p>
                    </section>
                  ) : null}

                  {latestEvaluation ? (
                    <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Latest evaluation</div>
                          <h3 className="mt-1 text-lg font-semibold text-brand-ink">Stage feedback</h3>
                        </div>
                        <div className="rounded-full bg-brand-ink px-3 py-1 text-sm font-medium text-white">
                          {formatScore(latestEvaluation.score)}/10
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Strengths</div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {latestEvaluation.strengths.length ? latestEvaluation.strengths.join(", ") : "No strengths returned yet."}
                          </p>
                        </div>
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Weaknesses</div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {latestEvaluation.weaknesses.length ? latestEvaluation.weaknesses.join(", ") : "No weaknesses returned yet."}
                          </p>
                        </div>
                        <div className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Outcome</div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {selectedStageStatus === "solved"
                              ? "Solved. The next stage is unlocked."
                              : selectedStageStatus === "revealed"
                                ? "No tries left. The reference answer is now visible."
                                : "This stage still needs another submission."}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-[1.2rem] bg-slate-50 px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Summary</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{latestEvaluation.feedbackSummary}</p>
                      </div>
                    </section>
                  ) : null}

                  {isSelectedStageActive && hintHistory.length > 0 ? (
                    <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Hints</div>
                      {hintHistory.map((hint, index) => (
                        <div
                          className="mt-4 rounded-[1.2rem] border border-brand-line bg-brand-surface px-4 py-4 text-sm leading-6 text-slate-700"
                          key={`${hint.hint}-${index}`}
                        >
                          <div className="text-xs uppercase tracking-[0.16em] text-brand-teal">Hint {index + 1}</div>
                          <p className="mt-2">{hint.hint}</p>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {evaluationHistory.length > 0 ? (
                    <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Evaluation history</div>
                      <div className="mt-4 space-y-3">
                        {evaluationHistory.map((entry, index) => (
                          <article className="rounded-[1.2rem] bg-slate-50 px-4 py-4" key={entry.id}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm font-medium text-brand-ink">Attempt {evaluationHistory.length - index}</div>
                              <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-brand-ink">
                                {formatScore(entry.score)}/10
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{entry.feedbackSummary}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                </>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </main>

    {relatedQuestionOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
        <div
          aria-labelledby="related-stage-title"
          aria-modal="true"
          className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-8 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Related question</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink" id="related-stage-title">
                {relatedDraft ? "Edit generated question" : "Generate from one sample question"}
              </h2>
            </div>
            <button
              aria-label="Close add stage dialog"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-brand-ink"
              onClick={() => {
                setRelatedQuestionOpen(false);
                setRelatedQuestionError(null);
                setRelatedDraft(null);
              }}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <section className="space-y-4">
                <label className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Sample question</div>
                  <textarea
                    className="min-h-[160px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 text-brand-ink outline-none transition focus:border-brand-teal"
                    onChange={(event) => setRelatedSampleQuestion(event.target.value)}
                    placeholder="Example: Design a hotel room booking system focused only on room availability and concurrent booking control."
                    value={relatedSampleQuestion}
                  />
                </label>

                <button
                  className="rounded-full border border-brand-line px-4 py-2 text-sm font-medium text-brand-ink transition hover:border-brand-teal/40 hover:text-brand-teal disabled:opacity-50"
                  disabled={relatedQuestionBusy !== null}
                  onClick={() => void suggestRelatedQuestion()}
                  type="button"
                >
                  {relatedQuestionBusy === "suggest" ? "Creating..." : "Suggest and create with AI"}
                </button>

                <button
                  className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-[#102232] disabled:bg-slate-300"
                  disabled={relatedQuestionBusy !== null || !relatedSampleQuestion.trim()}
                  onClick={() => void buildRelatedQuestionDraft()}
                  type="button"
                >
                  {relatedQuestionBusy === "beautify" ? "Beautifying..." : "Beautify stage with AI"}
                </button>

                {relatedQuestionError ? (
                  <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {relatedQuestionError}
                  </div>
                ) : null}
              </section>

              <section className="space-y-4">
                {relatedDraft ? (
                  <>
                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Title</div>
                      <input
                        className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                        onChange={(event) => setRelatedDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                        value={relatedDraft.title}
                      />
                    </label>

                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Prompt</div>
                      <textarea
                        className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 text-brand-ink outline-none transition focus:border-brand-teal"
                        onChange={(event) => setRelatedDraft((current) => (current ? { ...current, prompt: event.target.value } : current))}
                        value={relatedDraft.prompt}
                      />
                    </label>

                    <label className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Guidance</div>
                      <textarea
                        className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 text-brand-ink outline-none transition focus:border-brand-teal"
                        onChange={(event) => setRelatedDraft((current) => (current ? { ...current, guidance: event.target.value } : current))}
                        value={relatedDraft.guidance}
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Expected keywords</div>
                        <input
                          className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                          onChange={(event) =>
                            setRelatedDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    expectedKeywords: event.target.value
                                      .split(",")
                                      .map((value) => value.trim())
                                      .filter(Boolean)
                                  }
                                : current
                            )
                          }
                          value={relatedDraft.expectedKeywords.join(", ")}
                        />
                      </label>

                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Min words</div>
                        <input
                          className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                          min={1}
                          onChange={(event) =>
                            setRelatedDraft((current) =>
                              current ? { ...current, minimumWords: Number(event.target.value) || 1 } : current
                            )
                          }
                          type="number"
                          value={relatedDraft.minimumWords}
                        />
                      </label>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        checked={relatedDraft.isCoreFocus}
                        onChange={(event) =>
                          setRelatedDraft((current) => (current ? { ...current, isCoreFocus: event.target.checked } : current))
                        }
                        type="checkbox"
                      />
                      Core focus stage
                    </label>
                  </>
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-brand-line bg-brand-surface px-8 text-center text-sm leading-6 text-slate-500">
                    Enter one sample question. AI will create one focused stage for this current question and mode, and you can edit it before adding it to the drawer.
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-8 py-5">
            <div className="text-sm text-slate-500">
              {relatedDraft ? "Review the generated stage, edit it if needed, then add it to this question." : "Start with one sample question only."}
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                onClick={() => setRelatedQuestionOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                disabled={!relatedDraft || relatedQuestionBusy !== null}
                onClick={() => void saveRelatedQuestion()}
                type="button"
              >
                {relatedQuestionBusy === "save" ? "Adding..." : "Add stage"}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
