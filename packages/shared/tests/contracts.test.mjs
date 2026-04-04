import test from "node:test";
import assert from "node:assert/strict";
import {
  questionDraftSchema,
  telemetryEventSchema,
  appMetaSchema
} from "../dist/index.js";

test("question draft accepts up to sixteen stages", () => {
  const stage = {
    mode: "hld",
    title: "Functional requirements",
    prompt: "List the main requirements.",
    guidance: "Keep the answer short and scoped.",
    referenceAnswer: "Answer outline",
    expectedKeywords: ["user", "system"],
    minimumWords: 20,
    isCoreFocus: true
  };

  const parsed = questionDraftSchema.parse({
    title: "Design a URL Shortener",
    summary: "Focus on create and redirect only.",
    difficulty: "beginner",
    focusArea: "storage",
    tags: [],
    supportedModes: ["hld", "lld"],
    scope: "Core redirect flow only.",
    detailedDescription: "Interview question",
    assumptions: ["Single region to start."],
    qpsAssumptions: ["100 redirects/sec"],
    inScope: ["Create short URL", "Redirect resolution"],
    outOfScope: ["Analytics"],
    focusPoints: ["Collision handling"],
    stages: Array.from({ length: 16 }, () => stage)
  });

  assert.equal(parsed.stages.length, 16);
});

test("telemetry event requires a valid scope and path", () => {
  const parsed = telemetryEventSchema.parse({
    name: "question_viewed",
    scope: "question",
    path: "/questions/url-shortener",
    questionSlug: "url-shortener",
    mode: "hld",
    metadata: { source: "test" },
    createdAt: new Date().toISOString()
  });

  assert.equal(parsed.scope, "question");
  assert.equal(parsed.metadata.source, "test");
});

test("app meta schema keeps migration metadata stable", () => {
  const parsed = appMetaSchema.parse({
    schemaVersion: "005-hardening-ledger",
    latestMigrationAt: new Date().toISOString(),
    desktopTarget: "macos",
    webSupported: true
  });

  assert.equal(parsed.desktopTarget, "macos");
  assert.equal(parsed.webSupported, true);
});
