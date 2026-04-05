import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  stageEvaluationHistoryEntrySchema,
  agentProfileInputSchema,
  appMetaSchema,
  appSettingsSchema,
  draftUpdateSchema,
  healthResponseSchema,
  learningDashboardSchema,
  learningItemInputSchema,
  learningNoteInputSchema,
  learningNoteSchema,
  questionChatHistorySchema,
  questionChatRequestSchema,
  questionChatResponseSchema,
  questionAuthoringInputSchema,
  questionDetailSchema,
  questionDraftSchema,
  questionStageAuthoringInputSchema,
  questionStageDraftSchema,
  questionStageSuggestionSchema,
  telemetryEventSchema,
  sessionAgentUpdateSchema,
  sessionRequestSchema
} from "@hinterview/shared";
import {
  addStageToQuestion,
  beautifyQuestionDraftWithAi,
  beautifyQuestionStageWithAi,
  createQuestion,
  createQuestionDraft,
  createAgentProfile,
  createOrResumeSession,
  deleteAgentProfile,
  getPromptScaffoldBundle,
  getQuestionChatHistory,
  getStageAnswer,
  listStageEvaluations,
  getStageHint,
  getQuestionBySlug,
  getQuestionSummaries,
  getSeededQuestionCount,
  getSessionById,
  getSettings,
  getLearningDashboard,
  listAgentProfiles,
  resetStageProgress,
  saveLearningNote,
  saveLearningItemOverride,
  deleteLearningNote,
  deleteLearningItemOverride,
  getAppMeta,
  suggestQuestionStageWithAi,
  askQuestionChat,
  syncSharedStageData,
  submitStageAnswer,
  recordTelemetryEvent,
  validateAgentProfile,
  updateSessionAgent,
  updateSettings,
  updateStageDraft
} from "./db.js";
import { transcribeAudioBytes } from "./audio.js";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: true
    })
  );
  app.use(express.json());

  app.post("/api/audio/transcribe", express.raw({ type: ["audio/wav", "application/octet-stream"], limit: "32mb" }), async (request, response) => {
    try {
      const locale =
        typeof request.query.locale === "string" && request.query.locale.trim().length > 0
          ? request.query.locale
          : "en-US";
      const fileName =
        typeof request.query.fileName === "string" && request.query.fileName.trim().length > 0
          ? request.query.fileName
          : "recording.wav";
      const body = request.body;
      const audioBytes =
        body instanceof Uint8Array
          ? body
          : Buffer.isBuffer(body)
            ? new Uint8Array(body)
            : null;

      if (!audioBytes || audioBytes.length === 0) {
        response.status(400).json({ message: "Audio bytes are required." });
        return;
      }

      response.json(await transcribeAudioBytes({ audioBytes, fileName, locale }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to transcribe audio";
      response.status(400).json({ message });
    }
  });

  app.get("/api/health", (_request, response) => {
    response.json(
      healthResponseSchema.parse({
        ok: true,
        service: "hinterview-server",
        timestamp: new Date().toISOString(),
        seededQuestions: getSeededQuestionCount()
      })
    );
  });

  app.get("/api/meta", (_request, response) => {
    response.json(appMetaSchema.parse(getAppMeta()));
  });

  app.post("/api/telemetry", (request, response) => {
    try {
      const payload = telemetryEventSchema.parse(request.body);
      recordTelemetryEvent(payload);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to store telemetry event";
      response.status(400).json({ message });
    }
  });

  app.get("/api/settings", (_request, response) => {
    response.json(getSettings());
  });

  app.get("/api/agents", (_request, response) => {
    response.json({
      items: listAgentProfiles()
    });
  });

  app.post("/api/agents", (request, response) => {
    try {
      const payload = agentProfileInputSchema.parse(request.body);
      response.json(createAgentProfile(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create agent profile";
      response.status(400).json({ message });
    }
  });

  app.post("/api/agents/validate", (request, response) => {
    try {
      const payload = agentProfileInputSchema.parse(request.body);
      response.json(validateAgentProfile(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to validate agent profile";
      response.status(400).json({ message });
    }
  });

  app.delete("/api/agents/:agentId", (request, response) => {
    try {
      deleteAgentProfile(request.params.agentId);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete agent profile";
      response.status(400).json({ message });
    }
  });

  app.put("/api/settings", (request, response) => {
    try {
      const settings = appSettingsSchema.parse(request.body);
      response.json(updateSettings(settings));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update settings";
      response.status(400).json({ message });
    }
  });

  app.get("/api/questions", (_request, response) => {
    response.json({
      items: getQuestionSummaries()
    });
  });

  app.get("/api/questions/:slug", (request, response) => {
    const question = getQuestionBySlug(request.params.slug);

    if (!question) {
      response.status(404).json({
        message: "Question not found"
      });
      return;
    }

    response.json(question);
  });

  app.get("/api/questions/:slug/chat", (request, response) => {
    try {
      const mode = typeof request.query.mode === "string" ? request.query.mode : "";
      if (mode !== "hld" && mode !== "lld") {
        response.status(400).json({ message: "A valid mode is required." });
        return;
      }

      response.json(questionChatHistorySchema.parse(getQuestionChatHistory(request.params.slug, mode)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load question chat";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/:slug/chat", async (request, response) => {
    try {
      const payload = questionChatRequestSchema.parse(request.body);
      response.json(questionChatResponseSchema.parse(await askQuestionChat(request.params.slug, payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to ask AI about this question";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/drafts", (request, response) => {
    try {
      const payload = questionAuthoringInputSchema.parse(request.body);
      response.json(questionDraftSchema.parse(createQuestionDraft(payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build question draft";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/drafts/beautify", async (request, response) => {
    try {
      const payload = questionAuthoringInputSchema.parse(request.body);
      response.json(questionDraftSchema.parse(await beautifyQuestionDraftWithAi(payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to beautify question draft";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions", (request, response) => {
    try {
      const payload = questionDraftSchema.parse(request.body);
      response.json(questionDetailSchema.parse(createQuestion(payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create question";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/:slug/stages/drafts/beautify", async (request, response) => {
    try {
      const payload = questionStageAuthoringInputSchema.parse({
        ...request.body,
        questionSlug: request.params.slug
      });
      response.json(questionStageDraftSchema.parse(await beautifyQuestionStageWithAi(payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to beautify stage draft";
      response.status(400).json({ message });
    }
  });

  app.get("/api/questions/:slug/stages/suggest", async (request, response) => {
    try {
      const mode = typeof request.query.mode === "string" ? request.query.mode : "";
      if (mode !== "hld" && mode !== "lld") {
        response.status(400).json({ message: "A valid mode is required." });
        return;
      }

      response.json(questionStageSuggestionSchema.parse(await suggestQuestionStageWithAi(request.params.slug, mode)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to suggest stage question";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/:slug/stages", (request, response) => {
    try {
      const payload = questionStageDraftSchema.parse(request.body);
      response.json(questionDetailSchema.parse(addStageToQuestion(request.params.slug, payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add stage";
      response.status(400).json({ message });
    }
  });

  app.get("/api/learning", (_request, response) => {
    response.json(learningDashboardSchema.parse(getLearningDashboard()));
  });

  app.post("/api/learning/notes", (request, response) => {
    try {
      const payload = learningNoteInputSchema.parse(request.body);
      response.json(learningNoteSchema.parse(saveLearningNote(payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save learning note";
      response.status(400).json({ message });
    }
  });

  app.delete("/api/learning/notes/:noteId", (request, response) => {
    try {
      deleteLearningNote(request.params.noteId);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete learning note";
      response.status(400).json({ message });
    }
  });

  app.post("/api/learning/themes/:itemId", (request, response) => {
    try {
      const payload = learningItemInputSchema.parse({
        ...request.body,
        id: request.params.itemId
      });
      saveLearningItemOverride("theme", payload);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save learning theme";
      response.status(400).json({ message });
    }
  });

  app.delete("/api/learning/themes/:itemId", (request, response) => {
    try {
      deleteLearningItemOverride("theme", request.params.itemId);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete learning theme";
      response.status(400).json({ message });
    }
  });

  app.post("/api/learning/recommendations/:itemId", (request, response) => {
    try {
      const payload = learningItemInputSchema.parse({
        ...request.body,
        id: request.params.itemId
      });
      saveLearningItemOverride("recommendation", payload);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save recommendation";
      response.status(400).json({ message });
    }
  });

  app.delete("/api/learning/recommendations/:itemId", (request, response) => {
    try {
      deleteLearningItemOverride("recommendation", request.params.itemId);
      response.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete recommendation";
      response.status(400).json({ message });
    }
  });

  app.post("/api/questions/:slug/sessions", (request, response) => {
    try {
      const payload = sessionRequestSchema.parse(request.body);
      response.json(createOrResumeSession(request.params.slug, payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      response.status(400).json({ message });
    }
  });

  app.get("/api/sessions/:sessionId", (request, response) => {
    const session = getSessionById(request.params.sessionId);

    if (!session) {
      response.status(404).json({
        message: "Session not found"
      });
      return;
    }

    response.json(session);
  });

  app.put("/api/sessions/:sessionId/agent", (request, response) => {
    try {
      const payload = sessionAgentUpdateSchema.parse(request.body);
      response.json(updateSessionAgent(request.params.sessionId, payload.agentId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update session agent";
      response.status(400).json({ message });
    }
  });

  app.put("/api/sessions/:sessionId/stages/:stageId/draft", (request, response) => {
    try {
      const payload = draftUpdateSchema.parse(request.body);
      response.json(updateStageDraft(request.params.sessionId, request.params.stageId, payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft";
      response.status(400).json({ message });
    }
  });

  app.post("/api/sessions/:sessionId/stages/:stageId/hint", async (request, response) => {
    try {
      response.json(await getStageHint(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate hint";
      response.status(400).json({ message });
    }
  });

  app.post("/api/sessions/:sessionId/stages/:stageId/answer", async (request, response) => {
    try {
      response.json(await getStageAnswer(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate answer";
      response.status(400).json({ message });
    }
  });

  app.post("/api/sessions/:sessionId/stages/:stageId/reset", (request, response) => {
    try {
      response.json(resetStageProgress(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset stage";
      response.status(400).json({ message });
    }
  });

  app.post("/api/sessions/:sessionId/stages/:stageId/sync-shared", (request, response) => {
    try {
      response.json(syncSharedStageData(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync shared stage";
      response.status(400).json({ message });
    }
  });

  app.post("/api/sessions/:sessionId/stages/:stageId/submit", async (request, response) => {
    try {
      response.json(await submitStageAnswer(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit stage";
      response.status(400).json({ message });
    }
  });

  app.get("/api/sessions/:sessionId/stages/:stageId/evaluations", (request, response) => {
    try {
      response.json({
        items: stageEvaluationHistoryEntrySchema.array().parse(
          listStageEvaluations(request.params.sessionId, request.params.stageId)
        )
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load stage evaluations";
      response.status(400).json({ message });
    }
  });

  app.get("/api/sessions/:sessionId/stages/:stageId/prompts", (request, response) => {
    try {
      response.json(getPromptScaffoldBundle(request.params.sessionId, request.params.stageId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build prompt scaffolds";
      response.status(400).json({ message });
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    response.status(500).json({ message });
  });

  return app;
};
