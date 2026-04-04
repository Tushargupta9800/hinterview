# Hinterview PRD

## 1. Product Summary

Hinterview is a desktop-first system design interview practice application inspired by Hello Interview. It helps users work through structured system design prompts for both HLD and LLD, draw diagrams when needed, submit text or audio answers, and receive AI-guided evaluation that is optimized for interview readiness rather than production implementation quality.

The product must run as:

- A mac desktop application
- A web-hosted application

Recommended delivery model:

- Electron for mac desktop packaging
- React + TypeScript + Vite frontend
- Tailwind CSS for styling
- Zustand for client state
- Zod for schemas and runtime validation
- Node.js + Express backend/services

## 1.1 Locked v1 Stack

- Desktop shell: Electron
- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Client state: Zustand
- Validation/contracts: Zod
- Backend: Node.js + Express
- Persistence: SQLite for desktop-first local mode

## 2. Problem Statement

Candidates preparing for system design interviews need more than static articles or model answers. They need:

- Structured question flows that mirror an interview
- Stepwise enforcement so they think in the right order
- A place to sketch HLD diagrams and explore LLD structure where needed
- AI feedback on both their explanation and architecture
- Hints and full answer reveal when they are blocked
- Persistent learning history and improvement tracking

Most current tools are either passive content libraries or unstructured chat experiences.

## 3. Goals

### Primary Goals

- Provide a guided, step-by-step system design interview simulator
- Support both HLD and LLD practice under one shared problem library without duplicating problems
- Support multiple AI providers/models selected at interview time
- Let users securely store their own API keys in encrypted form
- Combine text, voice transcription, and visual design input into AI scoring
- Persist user progress, answers, and learnings across sessions
- Support both prebuilt question banks and user-generated custom questions

### Success Criteria

- User can start an interview question in under 60 seconds
- User can switch between configured AI agents/models before answering
- User can choose HLD or LLD mode for problems that support both
- User completes every sub-step in sequence without bypassing required flow
- User receives score, strengths, weaknesses, hint, and full answer support
- User’s progress and learnings are visible in a dedicated review area

## 4. Target Users

### Primary Persona

Software engineers preparing for mid-level to senior system design interviews.

### Secondary Personas

- Engineering managers refreshing interview skills
- Candidates practicing FAANG-style interview structure
- Coaches or mentors creating custom design exercises

## 5. Core User Stories

- As a user, I can configure multiple AI agents and models so I can choose the evaluator that fits my practice style.
- As a user, I can save my own provider API keys securely on device.
- As a user, I can pick a system design problem and see all sub-questions, while still being forced to answer in order.
- As a user, I can choose whether I want to practice the HLD or LLD path for the same problem when both are available.
- As a user, I can answer each step using text or recorded audio (which will be passed to AI agent in text format not in audio).
- As a user, I can create an HLD diagram on a whiteboard-style canvas.
- As a user, I can request a hint for the current step.
- As a user, I can reveal the expected answer for the current step.
- As a user, I can submit my response and diagram to an AI evaluator for scoring and feedback.
- As a user, I can see progress across questions and revisit previous answers.
- As a user, I can review and edit generalized learnings in system design terms, not tied only to one prompt.
- As a user, I can add a custom question and have the platform generate the same structured journey automatically.

## 6. Scope

### In Scope

- Authentication-free local-first experience for v1
- Question library for common system design prompts
- Question broken into ordered interview stages for HLD and/or LLD
- Single problem catalog with optional HLD and LLD tracks, without duplicating the base problem
- Diagram canvas similar to Excalidraw for HLD creation
- Text answers and voice recording with local speech-to-text
- AI hint generation
- AI answer generation
- AI scoring out of 10 with strengths, weaknesses, and improvement suggestions in a point wise manner
- AI-provider settings with multiple agents/models
- Encrypted local persistence of API keys
- User progress, answer history, and learning summaries
- Custom question generation pipeline
- Desktop packaging for macOS
- Web deployment support

### Out of Scope for v1

- Real-time multiplayer mock interviews
- Video recording and webcam coaching
- Team/shared workspaces
- Mobile native apps
- Provider-managed billing
- Production-grade collaborative whiteboarding

## 7. Functional Requirements

### 7.1 AI Agent Management

- User can create, edit, delete, enable, and disable AI agent profiles.
- Each profile includes:
  - Provider name
  - Model name
  - API key reference
  - Optional system prompt customization
  - Use case tags such as evaluator, hint, answer-generator
- User can select an agent/model before or during an interview session.

### 7.2 Secure API Key Storage

- User can store multiple provider API keys.
- Keys must be persisted locally in encrypted form.
- Plaintext keys must never be stored in logs or UI state snapshots.
- Desktop app should prefer OS keychain integration if feasible; otherwise encrypted local storage with a user-specific derived key.
- Web-hosted mode must use a secure server-side encrypted secret store and never persist raw keys in browser localStorage.

### 7.3 Question Library

- System must ship with a curated list of common system design prompts.
- Each prompt must include:
  - Problem title
  - Difficulty
  - Tags
  - Expected time
  - Primary focus area
  - Supported interview mode: HLD, LLD, or both
  - Ordered sub-questions/stages per mode
  - Hint content strategy
  - Reference answer structure
- Each problem should define its scope clearly and avoid irrelevant expansion.
- Example: “Design Chat Application” should focus on chat delivery, fan-out, ordering, storage, and scale, not authentication unless explicitly requested.
- Each sample problem must define where the interview focus is strongest, such as scaling, concurrency, consistency, storage, scheduling, or object modeling.

Suggested starter prompts:

- Design TinyURL
- Design WhatsApp
- Design Dropbox
- Design Uber
- Design YouTube
- Design Rate Limiter
- Design Notification Service
- Design News Feed
- Design Search Autocomplete
- Design Ticket Booking System

### 7.4 Structured Interview Flow

- User can view the full list of stages at once.
- User can choose HLD or LLD mode when the selected problem supports both.
- Only the current stage is answerable.
- Future stages remain locked until the current one is completed.
- Stages must be problem-aware rather than generic boilerplate.
- The system should not always ask template prompts such as entities or API contracts when they are not central to the problem.
- Example stage types include:
  - Clarify focused requirements
  - Traffic spike handling
  - Concurrency control
  - Data partitioning
  - Consistency tradeoffs
  - Queueing and retries
  - Failure handling
  - LLD class/interface design
  - HLD component responsibilities
  - Scaling bottlenecks
  - Tradeoffs
- Generic stages like entities or APIs may appear only when they are relevant to the selected problem and mode.
- Each stage has a configurable maximum try count, defaulting to 3 and configurable from settings.
- If the user exhausts the allowed tries for a stage, the system reveals the correct interview-oriented answer before allowing forward progression.
- A stage is considered solved when score is greater than 8 out of 10.
- After a stage is solved, the user can move to the next stage or retry voluntarily.

### 7.5 Diagram Canvas

- Diagram canvas is required primarily for HLD flows and optional for LLD flows when class or component diagrams help.
- User can draw boxes, arrows, labels, groups, and freehand notes.
- Diagram state must be auto-saved per stage/question.
- Export snapshot/image or structured scene JSON for AI evaluation.
- Canvas interaction should feel lightweight and interview oriented, not CAD-like.

### 7.6 Answer Input

- User can type an answer.
- User can record audio and convert it to text.
- Speech-to-text must run locally on device; raw audio must not be sent to the AI model.
- Transcript should be editable before submission.
- Submitted answer should retain:
  - Raw transcript
  - User-edited final answer
  - Timestamp
  - Related stage

### 7.7 AI Guidance

- Hint action returns incremental help, not the full answer by default.
- Get Answer action returns the expected interview-grade answer for the current stage.
- AI prompts must stay bounded to the problem statement and the declared focus area.
- AI should not drift into unrelated domains such as authentication, billing, or user management unless the problem explicitly includes them.
- Score action evaluates:
  - User text/transcript
  - Diagram content
  - Stage context
  - Interview expectations
- Feedback must emphasize interview-readiness and communication quality over production completeness.
- Scoring must not penalize grammar, spelling, or shorthand API notation if the design intent is clear.
- Answers like `GET /api/v1/order/{orderId}` are acceptable shorthand and should be judged on conceptual correctness.
- Main scoring focus is whether the user understands the concept, tradeoff, and reasoning.

### 7.8 Progress and Learnings

- System stores completion state per question and per stage.
- System stores attempts, answers, diagrams, scores, and feedback.
- My Learning section aggregates generalized insights such as:
  - “You often skip explicit non-functional requirements”
  - “Your API contracts are strong, but tradeoff discussion is shallow”
- Learnings must be phrased as reusable system design skills, not prompt-specific trivia.
- User can manually add, edit, and delete personal learning notes in My Learning.
- AI-generated learnings and user-authored learnings should coexist.

### 7.9 Custom Questions

- User can submit a custom system design prompt.
- AI converts it into a structured interview journey with stages, hints, expected answer outline, scoring rubric, difficulty, focus area, and HLD/LLD applicability.
- User can review and start that generated question like any built-in question.

## 8. Non-Functional Requirements

- Cross-platform architecture with macOS desktop support first
- Web deployment support from same core codebase
- Local-first responsiveness for draft saving
- Secure secret handling
- Reliable autosave and crash recovery
- Extensible provider architecture for multiple LLM vendors
- Observability hooks for errors and AI failures
- Accessible keyboard-friendly interview flow
- Local speech-to-text inference for privacy

## 9. UX Principles

- Practice should feel like a guided interview, not a chatbot
- The current stage must stay clear and focused
- Hints should be progressive
- Feedback should be actionable and concise
- Diagramming should be frictionless
- Saved work should feel durable and easy to revisit

## 10. Risks and Open Questions

- ExpressJS alone cannot satisfy desktop packaging; an app shell is required.
- Excalidraw-like functionality can be embedded or approximated, but full parity is expensive.
- Local speech-to-text model choice affects accuracy, package size, and performance.
- Storing user API keys securely differs between desktop and web-hosted modes.
- AI scoring consistency across models may vary and will require rubric normalization.

## 11. Recommended v1 Delivery

### Phase Focus

- Single-user local-first experience
- Curated built-in question bank
- Ordered interview flow for both HLD and LLD
- Embedded diagram canvas
- Local speech-to-text from early versions
- One or two LLM providers to start
- Basic learning synthesis
- Locked stack: Electron + React + TypeScript + Vite + Tailwind + Zustand + Zod + Express

### Deferred to v2

- Rich analytics
- Fine-grained rubric tuning dashboard
- Multi-session comparison charts
- Shared question marketplace
- Collaborative mock interviews
