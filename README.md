# Hinterview

Hinterview is a guided system-design interview practice app for macOS desktop and web. It combines a staged interview flow, AI-backed hints and scoring, a shared diagram playground, learning review, and custom question generation in one local-first workspace.

The app is built as a monorepo with:
- `apps/renderer`: React + TypeScript + Vite + Tailwind UI
- `apps/server`: Express + TypeScript API with SQLite persistence
- `apps/desktop`: Electron shell for macOS
- `packages/shared`: shared Zod contracts, seeded questions, and common types
- `codex`: PRD, milestones, and release planning docs

## What The App Does

Hinterview is designed around one shared question library where a problem appears once and can support:
- `HLD`
- `LLD`
- or both

The user can:
- open a scoped interview question
- move through the stages in order
- answer with text and diagrams on a common playground
- get AI hints, AI reference answers, and AI scoring
- revisit old attempts and generalized learning themes
- create custom questions and custom stages with AI assistance

## Current Feature Set

### Guided interview flow

- Shared question library with search and filters
- Difficulty-first sorting
- Separate HLD and LLD progress on each question tile
- Single problem entry for shared HLD/LLD questions
- Stage locking and ordered progression
- Retry and redo support per stage
- Shared-stage syncing across HLD and LLD for common stages
- Persistent session restore

### AI agent settings

- Multiple provider profiles
- OpenAI, OpenRouter, Anthropic, and Gemini provider support
- Encrypted local API key storage
- Default agent selection in Settings
- Agent-gated question access

### Hint, answer, and scoring loop

- AI-backed `Hint`
- AI-backed `Get answer`
- AI-backed evaluation with score out of `10.00`
- Pass threshold at `>= 8.00`
- Stored evaluation history per stage
- Stored reference answers and feedback on revisit
- Prompt rules tuned for interview-style, scoped, concise evaluation

### Diagram playground

- Shared global playground per question + mode
- Separate stage containers inside the same canvas
- Text fields
- Rectangle, circle, cylinder, diamond
- Arrow tool
- Move, resize, rotate, copy, delete
- Multi-select grouping
- Stage-aware autosave
- Stage-aware JSON serialization for AI evaluation
- Cross-question copy/paste support

### Learning and review

- `My Learning` page
- Recent attempts
- Learning themes
- Recommendations
- User-authored notes
- Edit and delete actions for notes/themes/recommendations
- Newest-first ordering

### Custom content generation

- Create a full custom question from the library page
- AI beautify for full question generation
- Editable generated draft before saving
- Add a related stage question from an existing question drawer
- AI suggestion for the next stage question
- Editable generated stage draft before adding

### Desktop and launch hardening

- Local SQLite persistence in `.data/hinterview.sqlite`
- Migration ledger
- Local telemetry hooks
- Retry states for key page loads
- Global error boundary
- Dark mode toggle
- Release checklist and release-check script
- Shared contract tests

## Screenshots

Project screenshots are available in [`screenshots/`](/Users/tushargupta/personal/hinterview/screenshots).

Included files:
- [Screenshot 2026-04-04 at 7.38.05 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.38.05%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.38.31 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.38.31%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.38.52 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.38.52%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.39.36 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.39.36%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.41.36 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.41.36%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.41.53 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.41.53%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.42.09 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.42.09%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.42.31 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.42.31%E2%80%AFPM.png)
- [Screenshot 2026-04-04 at 7.42.42 PM.png](/Users/tushargupta/personal/hinterview/screenshots/Screenshot%202026-04-04%20at%207.42.42%E2%80%AFPM.png)

## Commands

Install dependencies:

```bash
npm install
```

Run web mode:

```bash
npm run dev:web
```

Run desktop + server + renderer together:

```bash
npm run dev
```

Build everything:

```bash
npm run build
```

Run shared contract tests:

```bash
npm run test
```

Run release checks:

```bash
npm run release:check
```

## Persistence

- App data is stored locally in `.data/`
- SQLite database path: `.data/hinterview.sqlite`
- Secret key path: `.data/secret.key`
- API keys are encrypted at rest
- Renderer also keeps selected cached review data in local storage

## Notes

- The seeded built-in questions are intentionally scoped to one main interview focus area instead of trying to cover everything at once.
- Shared questions across HLD and LLD reuse common stages where appropriate.
- AI evaluation is constrained by prompt rules so it judges the current stage only and stays closer to mock-interview expectations than to production-spec completeness.
- The audio milestone was started but is currently not active in the UI.
- In Electron dev mode on macOS, some app-shell branding can still inherit Electron runtime behavior until a packaged build is produced.

## Docs

- Product plan: [codex/PRD.md](/Users/tushargupta/personal/hinterview/codex/PRD.md)
- Milestones: [codex/milestones.md](/Users/tushargupta/personal/hinterview/codex/milestones.md)
- Release checklist: [codex/release-checklist.md](/Users/tushargupta/personal/hinterview/codex/release-checklist.md)
