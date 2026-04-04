import type { LearningAttemptReview, LearningNote, LearningRecommendation, LearningTheme } from "@hinterview/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trackTelemetry } from "../lib/api";
import { useAppStore } from "../store/appStore";

type SectionKey = "notes" | "themes" | "recommendations" | "attempts";
type EditingState = {
  kind: "theme" | "recommendation" | "note";
  id: string;
  title: string;
  summary: string;
} | null;

export function LearningPage() {
  const navigate = useNavigate();
  const {
    error,
    learningDashboard,
    loadLearningDashboard,
    saveLearningTheme,
    deleteLearningTheme,
    saveLearningRecommendation,
    deleteLearningRecommendation,
    saveLearningNote,
    deleteLearningNote
  } = useAppStore();
  const [openSection, setOpenSection] = useState<SectionKey | null>("notes");
  const [editing, setEditing] = useState<EditingState>(null);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  useEffect(() => {
    void loadLearningDashboard();
  }, [loadLearningDashboard]);

  useEffect(() => {
    void trackTelemetry({
      name: "learning_viewed",
      scope: "learning",
      path: "/learning",
      questionSlug: null,
      mode: null,
      metadata: {},
      createdAt: new Date().toISOString()
    });
  }, []);

  const stats = useMemo(
    () => [
      { label: "Attempts", value: learningDashboard?.totalAttempts ?? 0 },
      { label: "Sessions", value: learningDashboard?.totalSessions ?? 0 },
      { label: "Questions", value: learningDashboard?.totalQuestionsAttempted ?? 0 },
      { label: "Avg score", value: learningDashboard?.averageScore?.toFixed(2) ?? "0.00" },
      { label: "Best score", value: learningDashboard?.bestScore?.toFixed(2) ?? "0.00" },
      { label: "Progress", value: `${learningDashboard?.overallCompletionPercent ?? 0}%` }
    ],
    [learningDashboard]
  );

  const sortedNotes = useMemo(
    () => [...(learningDashboard?.notes ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [learningDashboard?.notes]
  );
  const sortedThemes = useMemo(
    () => [...(learningDashboard?.themes ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [learningDashboard?.themes]
  );
  const sortedRecommendations = useMemo(
    () => [...(learningDashboard?.recommendations ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [learningDashboard?.recommendations]
  );
  const sortedAttempts = useMemo(
    () => [...(learningDashboard?.recentAttempts ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [learningDashboard?.recentAttempts]
  );

  const toggleSection = (section: SectionKey) => {
    setOpenSection((current) => (current === section ? null : section));
  };

  const saveEdit = async () => {
    if (!editing || !editing.title.trim() || !editing.summary.trim()) {
      return;
    }

    if (editing.kind === "theme") {
      await saveLearningTheme({ id: editing.id, title: editing.title, summary: editing.summary });
    } else if (editing.kind === "recommendation") {
      await saveLearningRecommendation({ id: editing.id, title: editing.title, summary: editing.summary });
    } else {
      await saveLearningNote({ id: editing.id, title: editing.title, content: editing.summary });
    }

    setEditing(null);
  };

  const renderSection = (
    section: SectionKey,
    titleText: string,
    count: number,
    headerAction: React.ReactNode,
    children: React.ReactNode
  ) => (
    <section className="rounded-[1.75rem] border border-brand-line bg-white shadow-card">
      <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" onClick={() => toggleSection(section)} type="button">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{titleText}</div>
            <div className="mt-1 text-sm text-slate-500">{count} items</div>
          </div>
          {headerAction ? (
            <div
              className="shrink-0"
              onClick={(event) => event.stopPropagation()}
            >
              {headerAction}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 text-sm text-slate-400">{openSection === section ? "⌃" : "⌄"}</span>
      </button>
      {openSection === section ? <div className="border-t border-brand-line px-6 py-5">{children}</div> : null}
    </section>
  );

  return (
    <main className="min-h-screen px-6 py-8 text-brand-ink md:px-10">
      <div className="space-y-6">
        <div className="flex justify-start">
          <button
            className="rounded-2xl border border-slate-300 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-brand-teal/60 hover:bg-brand-ink"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
                return;
              }
              navigate("/");
            }}
            type="button"
          >
            Back
          </button>
        </div>

        {error && !learningDashboard ? (
          <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-6 py-8 shadow-card">
            <div className="text-xs uppercase tracking-[0.16em] text-rose-700">Load failed</div>
            <p className="mt-2 text-sm leading-6 text-rose-900">{error}</p>
            <button
              className="mt-4 rounded-2xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white"
              onClick={() => void loadLearningDashboard()}
              type="button"
            >
              Retry loading learning
            </button>
          </section>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => (
            <article className="rounded-[1.4rem] border border-brand-line bg-white px-5 py-4 shadow-card" key={stat.label}>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{stat.label}</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink">{stat.value}</div>
            </article>
          ))}
        </section>

        {renderSection(
          "notes",
          "My notes",
          sortedNotes.length,
          <button
            className="shrink-0 rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white"
            onClick={() => setAddNoteOpen(true)}
            type="button"
          >
            Add note
          </button>,
          <div className="space-y-6">
            <div className="space-y-3">
              {sortedNotes.length ? (
                sortedNotes.map((note: LearningNote) => (
                  <article className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4" key={note.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-semibold text-brand-ink">{note.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{note.content}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600"
                          onClick={() =>
                            setEditing({
                              kind: "note",
                              id: note.id,
                              title: note.title,
                              summary: note.content
                            })
                          }
                          type="button"
                        >
                          ✎
                        </button>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-700"
                          onClick={() => void deleteLearningNote(note.id)}
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4 text-sm text-slate-500">
                  No personal learning notes yet.
                </div>
              )}
            </div>
          </div>
        )}

        {renderSection(
          "themes",
          "Learning themes",
          sortedThemes.length,
          null,
          <div className="space-y-4">
            {sortedThemes.length ? (
              sortedThemes.map((theme: LearningTheme) => (
                <article className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4" key={theme.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold text-brand-ink">{theme.title}</h2>
                        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {theme.evidenceCount} signals
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{theme.summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600"
                        onClick={() =>
                          setEditing({
                            kind: "theme",
                            id: theme.id,
                            title: theme.title,
                            summary: theme.summary
                          })
                        }
                        type="button"
                      >
                        ✎
                      </button>
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-700"
                        onClick={() => void deleteLearningTheme(theme.id)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4 text-sm text-slate-500">
                Solve a few stages to unlock cross-question learning themes.
              </div>
            )}
          </div>
        )}

        {renderSection(
          "recommendations",
          "Recommendations",
          sortedRecommendations.length,
          null,
          <div className="space-y-4">
            {sortedRecommendations.length ? (
              sortedRecommendations.map((item: LearningRecommendation) => (
                <article className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4" key={item.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-brand-ink">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600"
                        onClick={() =>
                          setEditing({
                            kind: "recommendation",
                            id: item.id,
                            title: item.title,
                            summary: item.summary
                          })
                        }
                        type="button"
                      >
                        ✎
                      </button>
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-700"
                        onClick={() => void deleteLearningRecommendation(item.id)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4 text-sm text-slate-500">
                Recommendations will appear once you build some attempt history.
              </div>
            )}
          </div>
        )}

        {renderSection(
          "attempts",
          "Recent attempts",
          sortedAttempts.length,
          null,
          <div className="space-y-3">
            {sortedAttempts.length ? (
              sortedAttempts.map((attempt: LearningAttemptReview) => (
                <Link
                  className="block rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4 transition hover:border-brand-teal/40 hover:bg-white"
                  key={attempt.id}
                  to={`/questions/${attempt.questionSlug}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-brand-ink">{attempt.questionTitle}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                        {attempt.mode} • {attempt.stageTitle}
                      </div>
                    </div>
                    <div className="rounded-full bg-brand-ink px-3 py-1 text-sm font-medium text-white">
                      {attempt.score.toFixed(2)}/10
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{attempt.feedbackSummary}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.3rem] border border-brand-line bg-brand-surface px-4 py-4 text-sm text-slate-500">
                No saved attempts yet.
              </div>
            )}
          </div>
        )}

        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
            <div
              aria-labelledby="learning-edit-title"
              aria-modal="true"
              className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
              role="dialog"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Edit {editing.kind === "note" ? "note" : editing.kind}
              </div>
              <h2 className="sr-only" id="learning-edit-title">
                Edit learning item
              </h2>
              <div className="mt-4 space-y-3">
                <input
                  className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm outline-none transition focus:border-brand-teal"
                  onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  type="text"
                  value={editing.title}
                />
                <textarea
                  className="min-h-[160px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                  onChange={(event) => setEditing({ ...editing, summary: event.target.value })}
                  value={editing.summary}
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setEditing(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white"
                  onClick={() => void saveEdit()}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {addNoteOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
            <div
              aria-labelledby="learning-add-note-title"
              aria-modal="true"
              className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
              role="dialog"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Add notes</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink" id="learning-add-note-title">Save a learning note</h2>
                </div>
                <button
                  aria-label="Close add note dialog"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-brand-ink"
                  onClick={() => setAddNoteOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <input
                  className="w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm outline-none transition focus:border-brand-teal"
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="Note title"
                  type="text"
                  value={noteTitle}
                />
                <textarea
                  className="min-h-[180px] w-full rounded-[1rem] border border-brand-line bg-brand-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-teal"
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder="Write the note you want to keep..."
                  value={noteContent}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setAddNoteOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                  disabled={!noteTitle.trim() || !noteContent.trim()}
                  onClick={() => {
                    void saveLearningNote({ id: null, title: noteTitle, content: noteContent });
                    setNoteTitle("");
                    setNoteContent("");
                    setAddNoteOpen(false);
                  }}
                  type="button"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div>
        ) : null}
      </div>
    </main>
  );
}
