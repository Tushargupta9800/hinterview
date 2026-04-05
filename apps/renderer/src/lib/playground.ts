import type {
  InterviewMode,
  PlaygroundArrowItem,
  PlaygroundFrame,
  PlaygroundItem,
  PlaygroundScene,
  PlaygroundShapeKind,
  PlaygroundTextItem,
  StagePlaygroundAnswer,
  StageProgress
} from "@hinterview/shared";
import { playgroundSceneSchema, stagePlaygroundAnswerSchema } from "@hinterview/shared";

const FRAME_X = 56;
const FRAME_Y = 40;
const FRAME_WIDTH = 1120;
const FRAME_HEIGHT = 320;
const FRAME_GAP = 40;

const nowIso = () => new Date().toISOString();

const normalizeDraftAnswerForStage = (
  rawDraftAnswer: string,
  questionSlug: string,
  mode: InterviewMode,
  stageId: string
): StagePlaygroundAnswer | null => {
  try {
    const parsed = stagePlaygroundAnswerSchema.parse(JSON.parse(rawDraftAnswer));
    return stagePlaygroundAnswerSchema.parse({
      ...parsed,
      questionSlug,
      mode,
      stageId,
      frame: {
        ...parsed.frame,
        stageId
      },
      items: parsed.items.map((item) => ({
        ...item,
        stageId
      }))
    });
  } catch {
    return null;
  }
};

export const getPlaygroundStorageKey = (questionSlug: string, mode: InterviewMode) =>
  `hinterview:playground:${questionSlug}:${mode}`;

export const createStageFrames = (
  stages: Pick<StageProgress, "stageId" | "title" | "orderIndex">[]
): PlaygroundFrame[] =>
  [...stages]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((stage, index) => ({
      stageId: stage.stageId,
      title: stage.title,
      x: FRAME_X,
      y: FRAME_Y + index * (FRAME_HEIGHT + FRAME_GAP),
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT
    }));

export const createDefaultScene = (
  questionSlug: string,
  mode: InterviewMode,
  stages: Pick<StageProgress, "stageId" | "title" | "orderIndex">[]
): PlaygroundScene =>
  playgroundSceneSchema.parse({
    version: 1,
    questionSlug,
    mode,
    updatedAt: nowIso(),
    frames: createStageFrames(stages),
    items: []
  });

export const mergeSceneWithStages = (
  maybeScene: unknown,
  questionSlug: string,
  mode: InterviewMode,
  stages: Pick<StageProgress, "stageId" | "title" | "orderIndex" | "draftAnswer">[]
): PlaygroundScene => {
  const fallback = createDefaultScene(questionSlug, mode, stages);
  const stageDraftItems = new Map<string, PlaygroundItem[]>();
  const stageDraftFrames = new Map<string, PlaygroundFrame>();
  for (const stage of stages) {
    const parsed = normalizeDraftAnswerForStage(stage.draftAnswer, questionSlug, mode, stage.stageId);
    if (parsed) {
      stageDraftItems.set(stage.stageId, parsed.items);
      stageDraftFrames.set(stage.stageId, parsed.frame);
    } else {
      stageDraftItems.set(stage.stageId, []);
    }
  }

  try {
    const parsed = playgroundSceneSchema.parse(maybeScene);
    const validStageIds = new Set(stages.map((stage) => stage.stageId));
    const defaultFrames = createStageFrames(stages);
    const parsedFrames = new Map(parsed.frames.map((frame) => [frame.stageId, frame]));
    const parsedItems = parsed.items.filter((item) => validStageIds.has(item.stageId));
    const hydratedItems = [...parsedItems];
    const stagesHydratedFromDraft = new Set<string>();

    for (const stage of stages) {
      const hasStageItems = parsedItems.some((item) => item.stageId === stage.stageId);
      if (hasStageItems) {
        continue;
      }

      const draftItems = stageDraftItems.get(stage.stageId) ?? [];
      if (draftItems.length > 0) {
        hydratedItems.push(...draftItems);
        stagesHydratedFromDraft.add(stage.stageId);
      }
    }

    return playgroundSceneSchema.parse({
      ...parsed,
      questionSlug,
      mode,
      updatedAt: parsed.updatedAt ?? nowIso(),
      frames: defaultFrames.map((frame) => {
        const saved = parsedFrames.get(frame.stageId);
        const draftFrame = stageDraftFrames.get(frame.stageId);
        if (stagesHydratedFromDraft.has(frame.stageId) && draftFrame) {
          return {
            ...draftFrame,
            title: frame.title
          };
        }
        return saved
          ? {
              ...saved,
              title: frame.title
            }
          : frame;
      }),
      items: hydratedItems
    });
  } catch {
    const items = stages.flatMap((stage) => stageDraftItems.get(stage.stageId) ?? []);
    const frames = createStageFrames(stages).map((frame) => {
      const draftFrame = stageDraftFrames.get(frame.stageId);
      return draftFrame
        ? {
            ...draftFrame,
            title: frame.title
          }
        : frame;
    });

    return playgroundSceneSchema.parse({
      ...fallback,
      frames,
      items
    });
  }
};

export const getFrameForStage = (scene: PlaygroundScene, stageId: string) =>
  scene.frames.find((frame) => frame.stageId === stageId) ?? null;

export const getItemsForStage = (scene: PlaygroundScene, stageId: string): PlaygroundItem[] =>
  scene.items.filter((item) => item.stageId === stageId);

export const buildStagePlaygroundAnswer = (
  scene: PlaygroundScene,
  stageId: string
): StagePlaygroundAnswer | null => {
  const frame = getFrameForStage(scene, stageId);
  if (!frame) {
    return null;
  }

  const items = getItemsForStage(scene, stageId);
  const plainText = items
    .filter((item): item is PlaygroundTextItem => item.type === "text")
    .sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y))
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n");

  return stagePlaygroundAnswerSchema.parse({
    version: 1,
    kind: "playground-stage-answer",
    questionSlug: scene.questionSlug,
    mode: scene.mode,
    stageId,
    plainText,
    items,
    frame
  });
};

export const createDefaultTextItem = (stageId: string, frame: PlaygroundFrame): PlaygroundTextItem => {
  const timestamp = nowIso();
  const defaultMaxWidth = Math.max(frame.width - 56, 180);
  return {
    id: crypto.randomUUID(),
    type: "text",
    stageId,
    x: frame.x + 28,
    y: frame.y + 54,
    width: 180,
    height: 48,
    rotation: 0,
    color: "#0f172a",
    text: "",
    fontFamily: "sans",
    fontSize: 16,
    fontWeight: "medium",
    maxWidth: defaultMaxWidth,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createDefaultShapeItem = (
  stageId: string,
  frame: PlaygroundFrame,
  shapeKind: PlaygroundShapeKind
): PlaygroundItem => {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    type: "shape",
    stageId,
    shapeKind,
    x: frame.x + 36,
    y: frame.y + 72,
    width: 140,
    height: shapeKind === "cylinder" ? 96 : 110,
    rotation: 0,
    color: "#0f766e",
    fillColor: "rgba(15, 118, 110, 0)",
    strokeColor: "#0f766e",
    strokeWidth: 2,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createDefaultArrowItem = (stageId: string, frame: PlaygroundFrame): PlaygroundArrowItem => {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    type: "arrow",
    stageId,
    x: frame.x + 60,
    y: frame.y + 80,
    endX: frame.x + 220,
    endY: frame.y + 80,
    color: "#000000",
    style: "solid",
    strokeWidth: 2,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};
