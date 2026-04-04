import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { navigateToLibraryBase } from "../lib/navigation";
import { useAppStore } from "../store/appStore";

const modeLabel = {
  hld: "High-level design",
  lld: "Low-level design"
} as const;

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentMode, currentQuestion, openSettings, saveLearningNote, theme, toggleTheme } = useAppStore();
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isQuestionPage = location.pathname.startsWith("/questions/");
  const isLibraryPage = location.pathname === "/";

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setFileMenuOpen(false);
    setRulesOpen(false);
  }, [location.pathname]);

  const sectionLabel = location.pathname.startsWith("/questions/") ? "Practice Session" : "Question Library";
  const questionRules = currentQuestion
    ? ([
        `Stay inside the scope of this problem: ${currentQuestion.scope}`,
        "Build your answer in interview-ready language.",
        "Shorthand APIs and imperfect grammar are fine if the concept is correct.",
        "Focus on responsibilities, tradeoffs, scaling, and correctness before implementation trivia.",
        "Only the active stage can be answered. Future stages stay locked until you clear the current one.",
        currentMode ? `Current track: ${modeLabel[currentMode]}.` : null
      ].filter((rule): rule is string => Boolean(rule)))
    : [];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/92 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-6 py-4 md:px-10">
          <div className="flex min-w-0 items-center gap-4">
            {isQuestionPage ? (
              <button
                className="shrink-0 rounded-2xl border border-slate-300 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-brand-teal/60 hover:bg-brand-ink"
                onClick={() => navigateToLibraryBase(navigate)}
                type="button"
              >
                Back to Library
              </button>
            ) : null}

            <button className="flex items-center gap-3" onClick={() => navigateToLibraryBase(navigate)} type="button">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-ink text-sm font-semibold text-white">
                HI
              </span>
              <div>
                <div className="text-sm font-semibold tracking-tight text-brand-ink">Hinterview</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{sectionLabel}</div>
              </div>
            </button>
            <Link
              className="hidden rounded-2xl border border-slate-200 bg-brand-surface px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:border-brand-teal/50 hover:text-brand-teal md:inline-flex"
              to="/learning"
            >
              My Learning
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            {isQuestionPage && currentQuestion ? (
              <div className="hidden min-w-0 flex-1 justify-end gap-2 overflow-x-auto md:flex">
                <span className="rounded-full bg-brand-surface px-3 py-2 text-xs uppercase tracking-[0.16em] text-brand-teal">
                  {currentQuestion.focusArea}
                </span>
                <span className="rounded-full bg-brand-ink px-3 py-2 text-xs uppercase tracking-[0.16em] text-white">
                  {currentQuestion.difficulty}
                </span>
                {currentMode ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-600">
                    {modeLabel[currentMode]}
                  </span>
                ) : null}
                {currentQuestion.tags.map((tag) => (
                  <span
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-500"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="relative" ref={menuRef}>
              <button
                aria-expanded={fileMenuOpen}
                aria-haspopup="menu"
                className="rounded-2xl border border-slate-300 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-brand-teal/60 hover:bg-brand-ink"
                onClick={() => setFileMenuOpen((value) => !value)}
                type="button"
              >
                File
              </button>

              {fileMenuOpen ? (
                <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(22,28,36,0.18)]">
                  <div className="px-3 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Workspace</div>
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-brand-surface hover:text-brand-ink"
                    onClick={() => {
                      setFileMenuOpen(false);
                      openSettings();
                    }}
                    type="button"
                  >
                    <span>Settings</span>
                  </button>
                  {!isLibraryPage ? (
                    <button
                      className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-brand-surface hover:text-brand-ink"
                      onClick={() => {
                        setFileMenuOpen(false);
                        navigateToLibraryBase(navigate);
                      }}
                      type="button"
                    >
                      <span>Question Library</span>
                    </button>
                  ) : null}
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-brand-surface hover:text-brand-ink"
                    onClick={() => {
                      setFileMenuOpen(false);
                      setAddNoteOpen(true);
                    }}
                    type="button"
                  >
                    <span>Add notes</span>
                  </button>
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-brand-surface hover:text-brand-ink"
                    onClick={() => {
                      toggleTheme();
                      setFileMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span>{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
                  </button>

                  <div className="mx-2 my-2 h-px bg-slate-200" />
                  <div className="px-3 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Rules</div>
                  <button
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-brand-surface hover:text-brand-ink disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!currentQuestion}
                    onClick={() => {
                      setFileMenuOpen(false);
                      setRulesOpen(true);
                    }}
                  >
                    <span>Open Question Rules</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {rulesOpen && currentQuestion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
          <div
            aria-labelledby="question-rules-title"
            aria-modal="true"
            className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Question rules</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink" id="question-rules-title">{currentQuestion.title}</h2>
              </div>
              <button
                aria-label="Close question rules dialog"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-brand-ink"
                onClick={() => setRulesOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {questionRules.map((rule) => (
                <div className="rounded-[1.3rem] border border-slate-200 bg-brand-surface px-4 py-4 text-sm leading-6 text-slate-700" key={rule}>
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {addNoteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-sm">
          <div
            aria-labelledby="header-add-note-title"
            aria-modal="true"
            className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_28px_90px_rgba(22,28,36,0.28)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-teal">Add notes</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink" id="header-add-note-title">Save a learning note</h2>
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
    </>
  );
}
