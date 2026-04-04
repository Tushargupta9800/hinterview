import type { InterviewMode, QuestionAuthoringInput, QuestionDraft, QuestionSummary } from "@hinterview/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { beautifyQuestionDraft, saveQuestionDraft, trackTelemetry } from "../lib/api";
import { useAppStore } from "../store/appStore";

const difficultyTone: Record<string, string> = {
  beginner: "bg-emerald-100 text-emerald-800",
  intermediate: "bg-sky-100 text-sky-800",
  advanced: "bg-orange-100 text-orange-800"
};

const difficultyRank: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2
};

const emptyAuthoringInput = (): QuestionAuthoringInput => ({
  title: "",
  description: "",
  mainFocusPoint: "",
  outOfScope: "",
  assumptions: "",
  supportedModes: ["hld", "lld"],
  sampleQuestions: "",
  relatedQuestionSlug: null,
  relatedQuestionPrompt: ""
});

const parseLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const toMultiline = (items: string[]) => items.join("\n");

export function LibraryPage() {
  const navigate = useNavigate();
  const { agentProfiles, error, questions, refreshQuestions } = useAppStore();
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [focusFilter, setFocusFilter] = useState("all");
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [authoringInput, setAuthoringInput] = useState<QuestionAuthoringInput>(emptyAuthoringInput);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [authoringBusy, setAuthoringBusy] = useState<"beautify" | "save" | null>(null);

  useEffect(() => {
    void trackTelemetry({
      name: "library_viewed",
      scope: "library",
      path: "/",
      questionSlug: null,
      mode: null,
      metadata: {},
      createdAt: new Date().toISOString()
    });
  }, []);

  const availableFocusOptions = useMemo(
    () => ["all", ...Array.from(new Set(questions.map((question) => question.focusArea))).sort()],
    [questions]
  );

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...questions]
      .sort((left, right) => {
        const difficultyGap =
          (difficultyRank[left.difficulty] ?? Number.MAX_SAFE_INTEGER) -
          (difficultyRank[right.difficulty] ?? Number.MAX_SAFE_INTEGER);

        if (difficultyGap !== 0) {
          return difficultyGap;
        }

        return left.title.localeCompare(right.title);
      })
      .filter((question) => {
        if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) {
          return false;
        }

        if (focusFilter !== "all" && question.focusArea !== focusFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const haystack = [
          question.title,
          question.summary,
          question.focusArea,
          question.difficulty,
          ...question.tags
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      });
  }, [difficultyFilter, focusFilter, questions, search]);

  const openQuestion = (question: QuestionSummary) => {
    navigate(agentProfiles.length === 0 ? "/settings" : `/questions/${question.slug}`);
  };

  const toggleMode = (mode: InterviewMode) => {
    setAuthoringInput((current) => {
      const exists = current.supportedModes.includes(mode);
      const nextModes = exists
        ? current.supportedModes.filter((item) => item !== mode)
        : [...current.supportedModes, mode];

      return {
        ...current,
        supportedModes: nextModes.length > 0 ? nextModes : [mode]
      };
    });
  };

  const buildDraft = async () => {
    setAuthoringBusy("beautify");
    setAuthoringError(null);

    try {
      const nextDraft = await beautifyQuestionDraft(authoringInput);
      setDraft(nextDraft);
    } catch (caught) {
      setAuthoringError(caught instanceof Error ? caught.message : "Failed to build question draft.");
    } finally {
      setAuthoringBusy(null);
    }
  };

  const confirmCreateQuestion = async () => {
    if (!draft) {
      return;
    }

    setAuthoringBusy("save");
    setAuthoringError(null);

    try {
      const created = await saveQuestionDraft(draft);
      await refreshQuestions();
      setAuthoringOpen(false);
      setDraft(null);
      navigate(`/questions/${created.slug}`);
    } catch (caught) {
      setAuthoringError(caught instanceof Error ? caught.message : "Failed to create question.");
    } finally {
      setAuthoringBusy(null);
    }
  };

  const showRetryState = !filteredQuestions.length && Boolean(error);

  return (
    <>
      <main className="min-h-screen px-6 py-8 text-brand-ink md:px-10">
        <div className="flex w-full flex-col gap-8">
          <section className="space-y-4">
            <div className="grid gap-3 rounded-[1.5rem] border border-brand-line bg-white p-4 shadow-card md:grid-cols-[minmax(0,1.4fr)_210px_210px_auto]">
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Search</span>
                <input
                  className="rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by title, summary, tag..."
                  type="text"
                  value={search}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Difficulty</span>
                <select
                  className="rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm capitalize text-brand-ink outline-none transition focus:border-brand-teal"
                  onChange={(event) => setDifficultyFilter(event.target.value)}
                  value={difficultyFilter}
                >
                  <option value="all">All difficulties</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Focus Area</span>
                <select
                  className="rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm capitalize text-brand-ink outline-none transition focus:border-brand-teal"
                  onChange={(event) => setFocusFilter(event.target.value)}
                  value={focusFilter}
                >
                  <option value="all">All focus areas</option>
                  {availableFocusOptions
                    .filter((option) => option !== "all")
                    .map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  className="w-full rounded-[1rem] bg-brand-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#102232]"
                  onClick={() => {
                    setAuthoringInput(emptyAuthoringInput());
                    setDraft(null);
                    setAuthoringError(null);
                    setAuthoringOpen(true);
                  }}
                  type="button"
                >
                  + Create question
                </button>
              </div>
            </div>

            {agentProfiles.length === 0 ? (
              <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
                Add at least one AI agent profile in <Link className="font-semibold underline" to="/settings">Settings</Link> before opening a question or using AI beautify.
              </div>
            ) : null}

            {showRetryState ? (
              <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-6 py-8 shadow-card">
                <div className="text-xs uppercase tracking-[0.16em] text-rose-700">Load failed</div>
                <p className="mt-2 text-sm leading-6 text-rose-900">{error}</p>
                <button
                  className="mt-4 rounded-2xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white"
                  onClick={() => void refreshQuestions()}
                  type="button"
                >
                  Retry loading questions
                </button>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[1.75rem] border border-brand-line bg-white shadow-card">
              {filteredQuestions.map((question, index) => {
                const modeCards = question.supportedModes;

                return (
                  <article
                    className="group cursor-pointer border-b border-brand-line/80 transition last:border-b-0 hover:bg-brand-surface/75"
                    key={question.id}
                    onClick={() => openQuestion(question)}
                  >
                    <div
                      className="grid items-center gap-4 px-6 py-4 md:grid-cols-[minmax(0,1fr)_230px] md:px-8"
                      style={{
                        backgroundImage: `linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, rgba(15, 118, 110, 0.08) ${question.progress?.completionPercent ?? 0}%, transparent ${question.progress?.completionPercent ?? 0}%, transparent 100%)`
                      }}
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {(index + 1).toString().padStart(2, "0")}
                          </span>
                          <span className="rounded-full bg-brand-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-brand-teal">
                            {question.focusArea}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                              difficultyTone[question.difficulty] ?? "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {question.difficulty}
                          </span>
                          {question.supportedModes.length > 1 ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-700">
                              {question.supportedModes.map((mode) => mode.toUpperCase()).join(", ")}
                            </span>
                          ) : (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-700">
                              {question.supportedModes[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-xl font-semibold tracking-tight text-brand-ink transition group-hover:text-brand-teal">
                              {question.title}
                            </h3>
                          </div>
                          <p className="max-w-3xl text-sm leading-6 text-slate-600">{question.summary}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5 rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-3.5">
                        <div className={`grid gap-2 ${modeCards.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {modeCards.map((mode) => (
                            <div className="rounded-[1rem] border border-brand-line bg-white px-3 py-2.5" key={mode}>
                              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                <span>{mode}</span>
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-brand-line">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    question.progress?.modeHasActiveSession?.[mode]
                                      ? "bg-sky-500"
                                      : question.progress?.solvedModes.includes(mode)
                                        ? "bg-emerald-500"
                                        : "bg-brand-teal"
                                  }`}
                                  style={{ width: `${question.progress?.modeCompletionPercent?.[mode] ?? 0}%` }}
                                />
                              </div>
                              <div className="mt-1.5 text-[11px] text-slate-500">
                                {question.progress?.modeHasActiveSession?.[mode]
                                  ? "Active now"
                                  : question.progress?.solvedModes.includes(mode)
                                    ? "Solved"
                                    : "Not started"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

              {filteredQuestions.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500 md:px-8">
                  No questions match the current search or filters.
                </div>
              ) : null}
            </div>

            {error && !showRetryState ? (
              <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div>
            ) : null}
          </section>
        </div>
      </main>

      {authoringOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
          <div
            aria-labelledby="create-question-title"
            aria-modal="true"
            className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-8 py-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Create question</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink" id="create-question-title">
                  {draft ? "Edit generated question" : "Question authoring"}
                </h2>
              </div>
              <button
                aria-label="Close create question dialog"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-brand-ink"
                onClick={() => {
                  setAuthoringOpen(false);
                  setDraft(null);
                  setAuthoringError(null);
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <section className="space-y-4">
                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Question title</div>
                    <input
                      className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Design a URL Shortener"
                      value={authoringInput.title}
                    />
                  </label>

                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Question description</div>
                    <textarea
                      className="min-h-[110px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, description: event.target.value }))}
                      value={authoringInput.description}
                    />
                  </label>

                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Main focus point</div>
                    <input
                      className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, mainFocusPoint: event.target.value }))}
                      value={authoringInput.mainFocusPoint}
                    />
                  </label>

                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Out of scope</div>
                    <textarea
                      className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, outOfScope: event.target.value }))}
                      value={authoringInput.outOfScope}
                    />
                  </label>

                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Assumptions</div>
                    <textarea
                      className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, assumptions: event.target.value }))}
                      value={authoringInput.assumptions}
                    />
                  </label>

                  <label className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Sample question</div>
                    <textarea
                      className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                      onChange={(event) => setAuthoringInput((current) => ({ ...current, sampleQuestions: event.target.value }))}
                      value={authoringInput.sampleQuestions}
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Interview tracks</div>
                    <div className="flex gap-2">
                      {(["hld", "lld"] as const).map((mode) => (
                        <button
                          className={`rounded-full border px-4 py-2 text-sm font-medium uppercase tracking-[0.12em] transition ${
                            authoringInput.supportedModes.includes(mode)
                              ? "border-brand-teal bg-brand-teal text-white"
                              : "border-brand-line bg-brand-surface text-slate-600"
                          }`}
                          key={mode}
                          onClick={() => toggleMode(mode)}
                          type="button"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-[#102232] disabled:bg-slate-300"
                    disabled={
                      authoringBusy !== null ||
                      !authoringInput.title.trim() ||
                      !authoringInput.description.trim() ||
                      !authoringInput.mainFocusPoint.trim()
                    }
                    onClick={() => void buildDraft()}
                    type="button"
                  >
                    {authoringBusy === "beautify" ? "Beautifying..." : "Beautify with AI"}
                  </button>

                  {authoringError ? (
                    <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {authoringError}
                    </div>
                  ) : null}
                </section>

                <section className="space-y-4">
                  {draft ? (
                    <>
                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Title</div>
                        <input
                          className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm outline-none transition focus:border-brand-teal"
                          onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                          value={draft.title}
                        />
                      </label>

                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Summary</div>
                        <textarea
                          className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                          onChange={(event) => setDraft((current) => (current ? { ...current, summary: event.target.value } : current))}
                          value={draft.summary}
                        />
                      </label>

                      <label className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">QPS assumptions</div>
                        <textarea
                          className="min-h-[90px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                          onChange={(event) => setDraft((current) => (current ? { ...current, qpsAssumptions: parseLines(event.target.value) } : current))}
                          value={toMultiline(draft.qpsAssumptions)}
                        />
                      </label>

                      <div className="space-y-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Stage questions</div>
                        {draft.stages.map((stage, index) => (
                          <article className="rounded-[1.2rem] border border-brand-line bg-brand-surface p-4" key={`${stage.mode}-${index}`}>
                            <div className="mb-3 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 w-fit">
                              {stage.mode}
                            </div>
                            <div className="grid gap-3">
                              <input
                                className="w-full rounded-[0.9rem] border border-brand-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-teal"
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          stages: current.stages.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, title: event.target.value } : item
                                          )
                                        }
                                      : current
                                  )
                                }
                                value={stage.title}
                              />
                              <textarea
                                className="min-h-[82px] w-full rounded-[0.9rem] border border-brand-line bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-brand-teal"
                                onChange={(event) =>
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          stages: current.stages.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, prompt: event.target.value } : item
                                          )
                                        }
                                      : current
                                  )
                                }
                                value={stage.prompt}
                              />
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-brand-line bg-brand-surface px-8 text-center text-sm leading-6 text-slate-500">
                      Fill the authoring inputs, then use AI to create the editable question draft.
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-8 py-5">
              <div className="text-sm text-slate-500">
                {draft ? "Review the generated draft, edit the stage questions if needed, then add it to the library." : "Start by filling the authoring inputs."}
              </div>
              <div className="flex gap-3">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setAuthoringOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                  disabled={!draft || authoringBusy !== null}
                  onClick={() => void confirmCreateQuestion()}
                  type="button"
                >
                  {authoringBusy === "save" ? "Adding..." : "Add to library"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
