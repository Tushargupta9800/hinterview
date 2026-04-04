# Hinterview

Milestone 1 scaffolds the shared app shell for the interview-practice desktop/web product described in [`codex/PRD.md`](/Users/tushargupta/personal/hinterview/codex/PRD.md).

## Workspace Layout

- `apps/desktop`: Electron shell for mac desktop packaging
- `apps/renderer`: React + TypeScript + Vite + Tailwind application shell
- `apps/server`: Express + TypeScript API with SQLite seed loading
- `packages/shared`: Shared Zod schemas and seeded problem definitions
- `codex`: Product planning docs

## What Milestone 1 Includes

- npm workspace layout
- Shared TypeScript configuration
- Shared Zod contracts for question and health payloads
- Seeded SQLite problem library
- Express API:
  - `GET /api/health`
  - `GET /api/questions`
  - `GET /api/questions/:slug`
- React/Tailwind shell using Zustand state
- Electron main/preload process that can host the same renderer

## Commands

```bash
npm install
npm run dev:web
```

Runs the shared package watch, Express API, and Vite renderer.

```bash
npm run dev
```

Runs the shared package watch, Express API, Vite renderer, Electron TypeScript watcher, and starts Electron once the renderer and API are reachable.

```bash
npm run build
```

Builds shared, server, renderer, and desktop packages in dependency order.

## Notes

- Seeded data persists to `.data/hinterview.sqlite`.
- The seeded sample problems already follow the scoped-problem rule from the PRD, so they focus on delivery, concurrency, scaling, and correctness instead of drifting into unrelated concerns like authentication.
- The renderer uses a desktop bridge when running inside Electron and falls back to relative `/api` requests in browser mode.
