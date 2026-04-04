# Hinterview Milestones

## Delivery Approach

Build the product in vertical slices so every milestone leaves behind a usable application state. The sequencing below is optimized to de-risk architecture first, then user workflow, then AI quality, then richer input modes.

The problem catalog should be shared across HLD and LLD. A problem appears once in the library, and the user chooses the mode when the problem supports both.

## Milestone 1: Foundation and App Shell

### Objective

Establish the shared application architecture for both mac desktop and web deployment.

### Deliverables

- Monorepo or structured workspace for shared frontend, backend, and desktop shell
- React + TypeScript + Vite renderer app shell with navigation
- Express.js + TypeScript API baseline
- Electron mac shell with local app boot
- Tailwind CSS setup and design tokens baseline
- Zustand store setup
- Zod schema layer shared across boundaries
- SQLite persistence for desktop mode
- Basic theme, layout, and design system primitives
- Local question seed loading mechanism

### Exit Criteria

- App runs locally in browser
- App runs locally as mac desktop shell
- Shared UI can talk to Express API
- Seeded questions can be loaded from persistence

## Milestone 2: Guided Interview Flow

### Objective

Build the structured interview experience and enforce ordered answering.

### Deliverables

- Question library page
- Shared problem detail with HLD/LLD mode selector where supported
- Question detail page with all stages visible
- Stage locking and sequential completion logic
- Default 3 tries per stage with settings override
- Solved rule when score is greater than 8
- Forced answer reveal after try limit is exhausted
- Session creation and resume support
- Draft text answer editor
- Autosave for answers
- Progress indicators by question and stage

### Exit Criteria

- User can start a built-in question
- User can only answer the current unlocked stage
- User can switch into HLD or LLD mode without duplicating the problem in the library
- Stage attempts respect the try limit and solve threshold
- Drafts and stage completions survive app restart

## Milestone 3: AI Agent Settings and Secure Credentials

### Objective

Add configurable AI providers and secure bring-your-own-key support.

### Deliverables

- Settings UI for multiple AI agents and models
- Provider adapter abstraction
- API key validation flow
- Encrypted key persistence
- Agent selection during session start or mid-session
- Prompt scaffolding for hint, answer, and evaluation actions

### Exit Criteria

- User can save at least two provider profiles
- Keys are stored encrypted at rest
- User can select active agent per session

## Milestone 4: Hint, Answer, and Scoring Loop

### Objective

Make the practice loop useful with interview-focused AI feedback.

### Deliverables

- Hint action for each stage
- Get Answer action for each stage
- Stage submission endpoint and scoring pipeline
- Score out of 10 plus strengths and weaknesses
- Scoring ignores grammar/spelling noise and focuses on conceptual understanding
- Prompt guardrails keep answers aligned to the scoped problem only
- Unlock-next-stage logic after evaluation
- Feedback storage with attempt history

### Exit Criteria

- Every stage can be evaluated
- Feedback is persisted and visible on revisit
- Scoring clearly targets interview readiness

## Milestone 5: Diagram Canvas

### Objective

Enable users to sketch diagrams and include them in evaluation, primarily for HLD and optionally for LLD.

### Deliverables

- Excalidraw-like canvas integration
- Scene autosave and restore
- Basic tools: shapes, connectors, text, select, pan
- Diagram export or summarization for AI ingestion
- Diagram embedded in question workflow
- Problem-specific focus labels in the UI so users know what the interviewer cares about most

### Exit Criteria

- User can create and edit architecture diagrams
- Diagram persists per question/stage
- AI evaluation can use diagram context

## Milestone 6: Audio Answers and Transcription

### Objective

Support spoken answers in addition to typed responses using local-only transcription.

### Deliverables

- Microphone recording UI
- Audio asset persistence
- Local speech-to-text integration
- Transcript review and edit flow
- Transcript submission to scoring engine

### Exit Criteria

- User can record audio and receive editable transcript text
- Raw audio never leaves the device
- Transcript and text answer are both supported in evaluation flow

## Milestone 7: My Learning and Review

### Objective

Turn practice history into generalized learning insights.

### Deliverables

- My Learning section
- Cross-question learning synthesis
- Editable user-authored learnings
- Progress dashboard
- Past attempts review
- Generic system-design skill recommendations

### Exit Criteria

- User can see non-question-specific learning themes
- User can revisit prior answers, diagrams, and feedback

## Milestone 8: Custom Question Generation

### Objective

Let users create their own interview prompts and get the same guided journey.

### Deliverables

- Custom question creation UI
- AI generation pipeline for stages, hints, rubric, and answer outlines
- Review/edit step before saving
- Persisted custom question library support

### Exit Criteria

- User can create a custom question and practice it end to end
- Generated flow follows the same stage-locking rules as built-in questions

## Milestone 9: Hardening and Launch Prep

### Objective

Stabilize the product for repeatable use and initial release.

### Deliverables

- Error handling and retry states
- Telemetry hooks
- Migration strategy for persistence
- Accessibility pass
- Performance tuning
- Packaging and release workflow

### Exit Criteria

- Desktop build is releaseable for macOS
- Web deployment is stable
- Core flows are covered by automated tests

## Suggested Implementation Order

1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
6. Milestone 6
7. Milestone 7
8. Milestone 8
9. Milestone 9

## Recommended First Build Scope

If you want the fastest path to a usable v1, implement through Milestone 4 first, then add Milestones 5 to 8 iteratively.
