import type {
  PlaygroundArrowItem,
  PlaygroundArrowStyle,
  PlaygroundFontFamily,
  PlaygroundFrame,
  PlaygroundItem,
  PlaygroundScene,
  PlaygroundShapeKind
} from "@hinterview/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDefaultArrowItem,
  createDefaultShapeItem,
  createDefaultTextItem,
  getFrameForStage
} from "../lib/playground";
import { transcribeAudio as transcribeAudioApi } from "../lib/api";

type Tool = "select" | "group-select" | "text" | PlaygroundShapeKind | "arrow";
type ResizeHandle = "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";

type DragState =
  | {
      kind: "select-box";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    }
  | {
      kind: "move-frame";
      frameId: string;
      startX: number;
      startY: number;
      original: PlaygroundFrame;
      originalItems: PlaygroundItem[];
    }
  | {
      kind: "move-item";
      itemId: string;
      startX: number;
      startY: number;
      original: PlaygroundItem;
    }
  | {
      kind: "move-group";
      startX: number;
      startY: number;
      itemIds: string[];
      originals: PlaygroundItem[];
    }
  | {
      kind: "resize-item";
      itemId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      original: PlaygroundItem;
    }
  | {
      kind: "resize-frame";
      frameId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      original: PlaygroundFrame;
    }
  | {
      kind: "rotate-item";
      itemId: string;
      startX: number;
      startY: number;
      centerX: number;
      centerY: number;
      pointerAngle: number;
      originalAngle: number;
      original: PlaygroundItem;
    }
  | {
      kind: "move-arrow-endpoint";
      itemId: string;
      endpoint: "start" | "end";
      startX: number;
      startY: number;
      original: PlaygroundArrowItem;
    }
  | {
      kind: "draw-arrow";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    }
  | {
      kind: "draw-shape";
      shapeKind: PlaygroundShapeKind;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

type InterviewPlaygroundProps = {
  scene: PlaygroundScene;
  selectedStageId: string;
  stageScores: Record<string, number | null>;
  contentEditable: boolean;
  layoutEditable: boolean;
  minimumWords: number;
  sessionLoading: boolean;
  canRequestHint: boolean;
  canRequestAnswer: boolean;
  hasReferenceAnswer: boolean;
  onSceneChange: (scene: PlaygroundScene) => void;
  onSubmit: () => void;
  onRequestHint: () => void;
  onRequestAnswer: () => void;
  onSelectStage: (stageId: string) => void;
};

const fontOptions: Array<{ value: PlaygroundFontFamily; label: string; family: string }> = [
  { value: "sans", label: "Aa", family: "ui-sans-serif, system-ui, sans-serif" },
  { value: "serif", label: "Ag", family: "Georgia, serif" },
  { value: "mono", label: "[]", family: "\"SFMono-Regular\", Consolas, monospace" },
  { value: "display", label: "Ad", family: "\"Trebuchet MS\", \"Avenir Next\", sans-serif" }
];

const toolIcons: Record<Tool, string> = {
  select: "⌖",
  "group-select": "⬚",
  text: "T",
  rectangle: "▭",
  circle: "◯",
  cylinder: "⛁",
  diamond: "◇",
  arrow: "→"
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.05;
const MIN_TEXT_FONT_SIZE = 6;
const MAX_TEXT_FONT_SIZE = 25;
const CLIPBOARD_STORAGE_KEY = "hinterview:playground-clipboard";
const AUDIO_MAX_SECONDS = 5 * 60;
const updateTimestamp = <T extends PlaygroundItem>(item: T): T => ({ ...item, updatedAt: new Date().toISOString() });
const fontFamilyCss = (font: PlaygroundFontFamily) => fontOptions.find((item) => item.value === font)?.family ?? fontOptions[0]!.family;
const arrowDash = (style: PlaygroundArrowStyle) => (style === "hashed" ? "14 10" : undefined);
const arrowWidth = (item: PlaygroundArrowItem) => (item.style === "bold" ? Math.max(item.strokeWidth, 4) : item.strokeWidth);
const formatLabel = (tool: Tool) => (tool === "text" ? "Text" : tool.charAt(0).toUpperCase() + tool.slice(1));
const toolOrder: Tool[] = ["select", "text", "rectangle", "circle", "cylinder", "diamond", "arrow", "group-select"];
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)
  .toString()
  .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const stageActionButtons: Array<{ key: "hint" | "answer" | "submit"; icon: string; label: string }> = [
  { key: "hint", icon: "💡", label: "Hint" },
  { key: "answer", icon: "✦", label: "Get answer" },
  { key: "submit", icon: "↑", label: "Submit" }
];
const toolLabels: Record<Tool, string> = {
  select: "Select",
  "group-select": "Group",
  text: "Text",
  rectangle: "Rectangle",
  circle: "Circle",
  cylinder: "Cylinder",
  diamond: "Diamond",
  arrow: "Arrow"
};

const getWordCount = (scene: PlaygroundScene, stageId: string) =>
  scene.items
    .filter((item): item is Extract<PlaygroundItem, { type: "text" }> => item.type === "text" && item.stageId === stageId)
    .flatMap((item) => item.text.trim().split(/\s+/))
    .filter(Boolean).length;

const getCanvasHeight = (scene: PlaygroundScene) => Math.max(...scene.frames.map((frame) => frame.y + frame.height), 760) + 80;
const getCanvasWidth = (scene: PlaygroundScene) => Math.max(...scene.frames.map((frame) => frame.x + frame.width), 1100) + 120;
const getFigureCount = (scene: PlaygroundScene, stageId: string) => scene.items.filter((item) => item.stageId === stageId).length;
const withAlpha = (hex: string, alpha: number) => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) {
    return hex;
  }

  const [, r = "00", g = "00", b = "00"] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
};

const measureTextItemSize = ({
  text,
  fontSize,
  fontFamily,
  fontWeight,
  maxWidth,
  minWidth = 160,
  minHeight = 48
}: {
  text: string;
  fontSize: number;
  fontFamily: PlaygroundFontFamily;
  fontWeight: "regular" | "medium" | "bold";
  maxWidth: number;
  minWidth?: number;
  minHeight?: number;
}) => {
  const horizontalPadding = 20;
  const verticalPadding = 10;
  const lineHeight = Math.max(8, Math.round(fontSize * 1.25));
  const content = text.trim().length ? text : "";
  const paragraphs = (content || " ").split("\n");

  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const context = canvas?.getContext("2d");
  if (!context) {
    return {
      width: minWidth,
      height: minHeight
    };
  }

  const cssWeight = fontWeight === "regular" ? 400 : fontWeight === "medium" ? 500 : 700;
  context.font = `${cssWeight} ${fontSize}px ${fontFamilyCss(fontFamily)}`;

  const contentMaxWidth = Math.max(maxWidth - horizontalPadding, minWidth - horizontalPadding);
  const tokenWidth = (value: string) => context.measureText(value).width;

  let targetWidth = minWidth;
  for (const paragraph of paragraphs) {
    const measured = Math.ceil(tokenWidth(paragraph || " "));
    targetWidth = Math.max(targetWidth, Math.min(measured + horizontalPadding, maxWidth));
  }

  const availableLineWidth = Math.max(targetWidth - horizontalPadding, 40);
  let totalLines = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      totalLines += 1;
      continue;
    }

    let currentLine = "";
    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (tokenWidth(nextLine) <= availableLineWidth || currentLine.length === 0) {
        currentLine = nextLine;
        continue;
      }
      totalLines += 1;
      currentLine = word;
    }
    if (currentLine.length > 0) {
      totalLines += 1;
    }
  }

  const width = clamp(Math.ceil(targetWidth), minWidth, Math.max(minWidth, maxWidth));
  const height = Math.max(minHeight, totalLines * lineHeight + verticalPadding);

  if (width >= contentMaxWidth && content.length > 0) {
    const wrapLineWidth = Math.max(width - horizontalPadding, 40);
    let wrappedLines = 0;
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        wrappedLines += 1;
        continue;
      }
      let currentLine = "";
      for (const word of words) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (tokenWidth(nextLine) <= wrapLineWidth || currentLine.length === 0) {
          currentLine = nextLine;
          continue;
        }
        wrappedLines += 1;
        currentLine = word;
      }
      if (currentLine.length > 0) {
        wrappedLines += 1;
      }
    }

    return {
      width,
      height: Math.max(minHeight, wrappedLines * lineHeight + verticalPadding)
    };
  }

  return {
    width,
    height
  };
};

const getTextResizeScale = (
  handle: ResizeHandle,
  original: { width: number; height: number },
  next: { width: number; height: number }
) => {
  const widthRatio = next.width / Math.max(original.width, 1);
  const heightRatio = next.height / Math.max(original.height, 1);

  if (handle === "east" || handle === "west") {
    return widthRatio;
  }

  if (handle === "north" || handle === "south") {
    return heightRatio;
  }

  return Math.sqrt(widthRatio * heightRatio);
};

const fitTextFontSizeForBox = ({
  text,
  fontFamily,
  fontWeight,
  targetWidth,
  targetHeight,
  preferredFontSize
}: {
  text: string;
  fontFamily: PlaygroundFontFamily;
  fontWeight: "regular" | "medium" | "bold";
  targetWidth: number;
  targetHeight: number;
  preferredFontSize: number;
}) => {
  let best = MIN_TEXT_FONT_SIZE;
  for (let candidate = MIN_TEXT_FONT_SIZE; candidate <= clamp(Math.round(preferredFontSize), MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE); candidate += 1) {
    const measured = measureTextItemSize({
      text,
      fontSize: candidate,
      fontFamily,
      fontWeight,
      maxWidth: targetWidth,
      minWidth: 0,
      minHeight: 0
    });

    if (measured.height <= targetHeight && measured.width <= targetWidth) {
      best = candidate;
      continue;
    }
  }
  return best;
};

const itemBounds = (item: PlaygroundItem) => {
  if (item.type === "arrow") {
    return {
      x: Math.min(item.x, item.endX),
      y: Math.min(item.y, item.endY),
      width: Math.abs(item.endX - item.x),
      height: Math.abs(item.endY - item.y)
    };
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height
  };
};

const groupBounds = (items: PlaygroundItem[]) => {
  const bounds = items.map(itemBounds);
  return {
    x: Math.min(...bounds.map((b) => b.x)),
    y: Math.min(...bounds.map((b) => b.y)),
    width: Math.max(...bounds.map((b) => b.x + b.width)) - Math.min(...bounds.map((b) => b.x)),
    height: Math.max(...bounds.map((b) => b.y + b.height)) - Math.min(...bounds.map((b) => b.y))
  };
};

const getPasteOrigin = (frame: PlaygroundFrame) => ({
  x: frame.x + 24,
  y: frame.y + 56
});

const getAudioContextCtor = () => {
  const candidate = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return candidate.AudioContext || candidate.webkitAudioContext || null;
};

const requestMicrophoneStream = async () => {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }

  const legacyNavigator = navigator as Navigator & {
    getUserMedia?: (
      constraints: MediaStreamConstraints,
      onSuccess: (stream: MediaStream) => void,
      onError: (error: unknown) => void
    ) => void;
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      onSuccess: (stream: MediaStream) => void,
      onError: (error: unknown) => void
    ) => void;
  };

  const legacyGetUserMedia = legacyNavigator.getUserMedia || legacyNavigator.webkitGetUserMedia;
  if (!legacyGetUserMedia) {
    throw new Error("Microphone recording is not available in this desktop runtime.");
  }

  return new Promise<MediaStream>((resolve, reject) => {
    legacyGetUserMedia.call(legacyNavigator, { audio: true }, resolve, reject);
  });
};

const mergeAudioChunks = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const encodeWavBytes = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
};

export function InterviewPlayground({
  scene,
  selectedStageId,
  stageScores,
  contentEditable,
  layoutEditable,
  minimumWords,
  sessionLoading,
  canRequestHint,
  canRequestAnswer,
  hasReferenceAnswer,
  onSceneChange,
  onSubmit,
  onRequestHint,
  onRequestAnswer,
  onSelectStage
}: InterviewPlaygroundProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pendingFocusTextId, setPendingFocusTextId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [clipboardItem, setClipboardItem] = useState<PlaygroundItem | null>(null);
  const [clipboardGroup, setClipboardGroup] = useState<PlaygroundItem[]>([]);
  const [arrowDraftMarker, setArrowDraftMarker] = useState<{ x: number; y: number } | null>(null);
  const [shapeDraft, setShapeDraft] = useState<{
    shapeKind: PlaygroundShapeKind;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [audioPromptOpen, setAudioPromptOpen] = useState(false);
  const [audioSecondsLeft, setAudioSecondsLeft] = useState(AUDIO_MAX_SECONDS);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioTranscriptDraft, setAudioTranscriptDraft] = useState("");
  const [audioRecording, setAudioRecording] = useState(false);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const audioStopTimeoutRef = useRef<number | null>(null);
  const audioTickIntervalRef = useRef<number | null>(null);
  const audioTargetStageRef = useRef<string | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioMuteNodeRef = useRef<GainNode | null>(null);
  const audioSamplesRef = useRef<Float32Array[]>([]);
  const audioSampleRateRef = useRef(44100);

  const selectedFrame = getFrameForStage(scene, selectedStageId);
  const selectedItem = scene.items.find((item) => item.id === selectedItemId) ?? null;
  const selectedBounds = selectedItem ? itemBounds(selectedItem) : null;
  const selectedGroupItems = scene.items.filter((item) => selectedGroupIds.includes(item.id));
  const selectedGroupBounds = selectedGroupItems.length > 1 ? groupBounds(selectedGroupItems) : null;
  const wordCount = getWordCount(scene, selectedStageId);
  const figureCount = getFigureCount(scene, selectedStageId);
  const canSubmit = contentEditable && (wordCount >= minimumWords || figureCount > 3);
  const canvasHeight = getCanvasHeight(scene);
  const canvasWidth = getCanvasWidth(scene);
  const audioAvailable = true as boolean;

  const clearAudioTimers = () => {
    if (audioStopTimeoutRef.current !== null) {
      window.clearTimeout(audioStopTimeoutRef.current);
      audioStopTimeoutRef.current = null;
    }
    if (audioTickIntervalRef.current !== null) {
      window.clearInterval(audioTickIntervalRef.current);
      audioTickIntervalRef.current = null;
    }
  };

  const clearAudioCapture = () => {
    audioProcessorRef.current?.disconnect();
    audioMuteNodeRef.current?.disconnect();
    audioSourceNodeRef.current?.disconnect();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
    }
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioProcessorRef.current = null;
    audioMuteNodeRef.current = null;
    audioSourceNodeRef.current = null;
    audioContextRef.current = null;
    audioStreamRef.current = null;
  };

  const insertTranscriptIntoStage = (stageId: string, rawTranscript: string) => {
    const cleaned = rawTranscript.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      return;
    }

    const frame = getFrameForStage(scene, stageId);
    if (!frame) {
      return;
    }

    const textItems = scene.items.filter(
      (item): item is Extract<PlaygroundItem, { type: "text" }> => item.type === "text" && item.stageId === stageId
    );
    const nextY =
      textItems.length > 0
        ? Math.max(...textItems.map((item) => item.y + item.height)) + 18
        : frame.y + 54;
    const measured = measureTextItemSize({
      text: cleaned,
      fontSize: 16,
      fontFamily: "sans",
      fontWeight: "medium",
      maxWidth: Math.max(frame.width - 56, 180)
    });
    const item = {
      ...createDefaultTextItem(stageId, frame),
      x: frame.x + 28,
      y: clamp(nextY, frame.y + 54, frame.y + frame.height - 120),
      width: measured.width,
      height: measured.height,
      text: cleaned
    };

    updateScene((current) => ({
      ...current,
      items: [...current.items, item]
    }));
    setSelectedItemId(item.id);
  };

  const stopAudioRecording = async (reason: "manual" | "timeout" | "cancel" = "manual") => {
    clearAudioTimers();
    const stageId = audioTargetStageRef.current;
    setAudioRecording(false);
    clearAudioCapture();

    if (reason === "cancel") {
      audioTargetStageRef.current = null;
      setAudioPromptOpen(false);
      setAudioSecondsLeft(AUDIO_MAX_SECONDS);
      setAudioTranscriptDraft("");
      setAudioTranscribing(false);
      audioSamplesRef.current = [];
      return;
    }

    if (!stageId) {
      setAudioError("Unable to match this recording to the selected stage.");
      setAudioTranscriptDraft("");
      setAudioSecondsLeft(AUDIO_MAX_SECONDS);
      setAudioTranscribing(false);
      audioSamplesRef.current = [];
      return;
    }

    const mergedSamples = mergeAudioChunks(audioSamplesRef.current);
    audioSamplesRef.current = [];

    if (mergedSamples.length < 2048) {
      setAudioError("No speech was detected. Try again and speak more clearly into the microphone.");
      setAudioTranscriptDraft("");
      setAudioSecondsLeft(AUDIO_MAX_SECONDS);
      setAudioTranscribing(false);
      return;
    }

    try {
      setAudioTranscribing(true);
      setAudioError(null);
      const wavBytes = encodeWavBytes(mergedSamples, audioSampleRateRef.current);
      const response = window.hinterviewDesktop?.transcribeAudio
        ? await window.hinterviewDesktop.transcribeAudio({
            audioBytes: wavBytes,
            fileName: "recording.wav",
            locale: "en-US"
          })
        : await transcribeAudioApi(wavBytes, {
            fileName: "recording.wav",
            locale: "en-US"
          });

      const nextTranscript = response?.text?.trim() ?? "";
      if (!nextTranscript) {
        throw new Error("No speech was detected. Try again and speak more clearly into the microphone.");
      }

      setAudioTranscriptDraft(nextTranscript);
      setAudioSecondsLeft(AUDIO_MAX_SECONDS);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Local audio transcription failed.");
      setAudioTranscriptDraft("");
      setAudioSecondsLeft(AUDIO_MAX_SECONDS);
    } finally {
      setAudioTranscribing(false);
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        item?: unknown;
        group?: unknown;
      };

      if (Array.isArray(parsed.group)) {
        setClipboardGroup(parsed.group as PlaygroundItem[]);
      }

      if (parsed.item && typeof parsed.item === "object") {
        setClipboardItem(parsed.item as PlaygroundItem);
      }
    } catch {
      window.localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
    }
  }, []);

  useEffect(() => () => {
    clearAudioTimers();
    clearAudioCapture();
  }, []);

  useEffect(() => {
    if (!audioPromptOpen) {
      return;
    }

    setAudioSecondsLeft(AUDIO_MAX_SECONDS);
  }, [audioPromptOpen]);

  useEffect(() => {
    if (selectedItem && selectedItem.stageId !== selectedStageId) {
      setSelectedItemId(null);
    }
  }, [selectedItem, selectedStageId]);

  useEffect(() => {
    setSelectedGroupIds((current) => current.filter((id) => scene.items.some((item) => item.id === id && item.stageId === selectedStageId)));
  }, [scene.items, selectedStageId]);

  useEffect(() => {
    if (!selectedFrame || !viewportRef.current) {
      return;
    }

    viewportRef.current.scrollTo({
      top: Math.max(selectedFrame.y * zoom - 24, 0),
      behavior: "smooth"
    });
  }, [selectedFrame, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    let gestureBaseZoom = zoom;

    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      gestureBaseZoom = zoom;
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as Event & { scale?: number };
      event.preventDefault();
      const scale = gestureEvent.scale ?? 1;
      setZoom(clamp(Math.round(gestureBaseZoom * scale * 100) / 100, ZOOM_MIN, ZOOM_MAX));
    };

    viewport.addEventListener("gesturestart", handleGestureStart, { passive: false });
    viewport.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      viewport.removeEventListener("gesturestart", handleGestureStart);
      viewport.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const looksLikePinchGesture =
        (Math.abs(event.deltaY) > 0 && Math.abs(event.deltaY) < 16 && Math.abs(event.deltaX) > 0) ||
        Math.abs(event.deltaZ) > 0;

      if (!event.ctrlKey && !event.metaKey && !looksLikePinchGesture) {
        return;
      }

      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const magnitude = Math.min(Math.abs(event.deltaY) / 600, 1) * 0.04;
      setZoom((value) => clamp(Math.round((value + direction * magnitude) * 100) / 100, ZOOM_MIN, ZOOM_MAX));
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

    if (!event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget) {
      if (event.key === "0") {
        setZoom((value) => clamp(Math.round((value - ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX));
        return;
      }

      if (event.key === "9") {
        setZoom((value) => clamp(Math.round((value + ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX));
        return;
      }

      const numeric = Number(event.key);
      if (numeric >= 1 && numeric <= toolOrder.length) {
        setTool(toolOrder[numeric - 1]!);
        return;
      }
    }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedItem && !isTypingTarget) {
        event.preventDefault();
        setClipboardItem(selectedItem);
        setClipboardGroup([]);
        window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ item: selectedItem, group: [] }));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedGroupIds.length > 1 && !isTypingTarget) {
        event.preventDefault();
        setClipboardGroup(selectedGroupItems);
        setClipboardItem(null);
        window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ item: null, group: selectedGroupItems }));
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && clipboardGroup.length > 1 && selectedFrame && layoutEditable && !isTypingTarget) {
        event.preventDefault();
        const timestamp = new Date().toISOString();
        const sourceBounds = groupBounds(clipboardGroup);
        const pasteOrigin = getPasteOrigin(selectedFrame);
        const deltaX = pasteOrigin.x - sourceBounds.x;
        const deltaY = pasteOrigin.y - sourceBounds.y;
        const copies = clipboardGroup.map((item) =>
          item.type === "arrow"
            ? {
                ...item,
                id: crypto.randomUUID(),
                x: item.x + deltaX,
                y: item.y + deltaY,
                endX: item.endX + deltaX,
                endY: item.endY + deltaY,
                stageId: selectedStageId,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            : {
                ...item,
                id: crypto.randomUUID(),
                x: item.x + deltaX,
                y: item.y + deltaY,
                stageId: selectedStageId,
                createdAt: timestamp,
                updatedAt: timestamp
              }
        );
        updateScene((current) => ({
          ...current,
          items: [...current.items, ...copies]
        }));
        setSelectedGroupIds(copies.map((item) => item.id));
        setSelectedItemId(null);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && clipboardItem && selectedFrame && layoutEditable && !isTypingTarget) {
        event.preventDefault();
        const timestamp = new Date().toISOString();
        const sourceBounds = itemBounds(clipboardItem);
        const pasteOrigin = getPasteOrigin(selectedFrame);
        const deltaX = pasteOrigin.x - sourceBounds.x;
        const deltaY = pasteOrigin.y - sourceBounds.y;
        const copy =
          clipboardItem.type === "arrow"
            ? {
                ...clipboardItem,
                id: crypto.randomUUID(),
                x: clipboardItem.x + deltaX,
                y: clipboardItem.y + deltaY,
                endX: clipboardItem.endX + deltaX,
                endY: clipboardItem.endY + deltaY,
                stageId: selectedStageId,
                createdAt: timestamp,
                updatedAt: timestamp
              }
            : {
                ...clipboardItem,
                id: crypto.randomUUID(),
                x: clamp(
                  clipboardItem.x + deltaX,
                  selectedFrame.x + 8,
                  selectedFrame.x + selectedFrame.width - clipboardItem.width - 8
                ),
                y: clamp(
                  clipboardItem.y + deltaY,
                  selectedFrame.y + 44,
                  selectedFrame.y + selectedFrame.height - clipboardItem.height - 8
                ),
                stageId: selectedStageId,
                createdAt: timestamp,
                updatedAt: timestamp
              };

        updateScene((current) => ({
          ...current,
          items: [...current.items, copy]
        }));
        setSelectedItemId(copy.id);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedGroupIds.length > 1 && !isTypingTarget && layoutEditable) {
        event.preventDefault();
        updateScene((current) => ({
          ...current,
          items: current.items.filter((item) => !selectedGroupIds.includes(item.id))
        }));
        setSelectedGroupIds([]);
        setSelectedItemId(null);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedItem && !isTypingTarget && layoutEditable) {
        event.preventDefault();
        updateScene((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== selectedItem.id)
        }));
        setSelectedItemId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clipboardGroup, clipboardItem, layoutEditable, selectedFrame, selectedGroupIds, selectedGroupItems, selectedItem, selectedStageId]);

  const updateScene = (updater: (current: PlaygroundScene) => PlaygroundScene) => {
    onSceneChange(
      updater({
        ...scene,
        updatedAt: new Date().toISOString()
      })
    );
  };

  const startAudioRecording = async () => {
    if (!contentEditable || !selectedFrame || !audioAvailable) {
      return;
    }

    setAudioError(null);
    setAudioTranscriptDraft("");
    audioTargetStageRef.current = selectedStageId;
    setAudioSecondsLeft(AUDIO_MAX_SECONDS);
    setAudioTranscribing(false);
    audioSamplesRef.current = [];

    const AudioContextCtor = getAudioContextCtor();

    if (!AudioContextCtor) {
      setAudioError("Audio capture is not available in this desktop runtime.");
      return;
    }

    try {
      const stream = await requestMicrophoneStream();
      const context = new AudioContextCtor();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mute = context.createGain();
      mute.gain.value = 0;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const channel = event.inputBuffer.getChannelData(0);
        audioSamplesRef.current.push(new Float32Array(channel));
      };

      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);

      audioStreamRef.current = stream;
      audioContextRef.current = context;
      audioSourceNodeRef.current = source;
      audioProcessorRef.current = processor;
      audioMuteNodeRef.current = mute;
      audioSampleRateRef.current = context.sampleRate;
      setAudioRecording(true);
    } catch (error) {
      setAudioError(
        error instanceof Error && /permission|denied|not allowed/i.test(error.message)
          ? "Microphone access is blocked. Allow microphone access and try again."
          : "Unable to start local audio recording."
      );
      audioTargetStageRef.current = null;
      return;
    }

    clearAudioTimers();
    audioTickIntervalRef.current = window.setInterval(() => {
      setAudioSecondsLeft((current) => {
        if (current <= 1) {
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    audioStopTimeoutRef.current = window.setTimeout(() => {
      void stopAudioRecording("timeout");
    }, AUDIO_MAX_SECONDS * 1000);
  };

  const getPoint = (event: React.PointerEvent) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds || !viewportRef.current) {
      return { x: 0, y: 0 };
    }

    return {
      x: (event.clientX - bounds.left + viewportRef.current.scrollLeft) / zoom,
      y: (event.clientY - bounds.top + viewportRef.current.scrollTop) / zoom
    };
  };

  const addNewItem = (point: { x: number; y: number }) => {
    if (!selectedFrame || !contentEditable) {
      return;
    }

    const x = clamp(point.x, selectedFrame.x + 16, selectedFrame.x + selectedFrame.width - 180);
    const y = clamp(point.y, selectedFrame.y + 52, selectedFrame.y + selectedFrame.height - 120);
    const item =
      tool === "text"
        ? { ...createDefaultTextItem(selectedStageId, selectedFrame), x, y }
        : tool === "rectangle" || tool === "circle" || tool === "cylinder" || tool === "diamond"
          ? { ...createDefaultShapeItem(selectedStageId, selectedFrame, tool), x, y }
          : null;

    if (!item) {
      return;
    }

    updateScene((current) => ({
      ...current,
      items: [...current.items, item]
    }));
    setSelectedItemId(item.id);
    setTool("select");
  };

  const updateItem = (itemId: string, updater: (item: PlaygroundItem) => PlaygroundItem) => {
    updateScene((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? updateTimestamp(updater(item)) : item))
    }));
  };

  const updateFrame = (frameId: string, updater: (frame: PlaygroundFrame) => PlaygroundFrame) => {
    updateScene((current) => {
      const targetFrame = current.frames.find((frame) => frame.stageId === frameId);

      if (!targetFrame) {
        return current;
      }

      const updatedFrame = updater(targetFrame);

      return {
        ...current,
        frames: current.frames.map((frame) => (frame.stageId === frameId ? updatedFrame : frame)),
        items: current.items.map((item) => {
          if (item.stageId !== frameId) {
            return item;
          }

          if (item.type === "arrow") {
            return item;
          }

          const maxX = updatedFrame.x + updatedFrame.width - item.width - 8;
          const minX = updatedFrame.x + 8;
          const maxY = updatedFrame.y + updatedFrame.height - item.height - 8;
          const minY = updatedFrame.y + 44;
          return {
            ...item,
            x: clamp(item.x, minX, Math.max(minX, maxX)),
            y: clamp(item.y, minY, Math.max(minY, maxY))
          };
        })
      };
    });
  };

  const startItemMove = (event: React.PointerEvent, item: PlaygroundItem) => {
    if (!layoutEditable || item.stageId !== selectedStageId || tool !== "select") {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      kind: "move-item",
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      original: item
    };
    setSelectedItemId(item.id);
    setSelectedGroupIds([]);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startGroupMove = (event: React.PointerEvent) => {
    if (!layoutEditable || selectedGroupIds.length < 2 || tool !== "select") {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      kind: "move-group",
      startX: event.clientX,
      startY: event.clientY,
      itemIds: selectedGroupIds,
      originals: selectedGroupItems
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startFrameMove = (event: React.PointerEvent, frame: PlaygroundFrame) => {
    if (!layoutEditable || frame.stageId !== selectedStageId) {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      kind: "move-frame",
      frameId: frame.stageId,
      startX: event.clientX,
      startY: event.clientY,
      original: frame,
      originalItems: scene.items.filter((item) => item.stageId === frame.stageId)
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startItemResize = (event: React.PointerEvent, item: PlaygroundItem, handle: ResizeHandle) => {
    if (!layoutEditable || item.stageId !== selectedStageId) {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      kind: "resize-item",
      itemId: item.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      original: item
    };
    setSelectedItemId(item.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startItemRotate = (event: React.PointerEvent, item: PlaygroundItem) => {
    if (!layoutEditable || item.stageId !== selectedStageId) {
      return;
    }

    event.stopPropagation();
    const bounds = itemBounds(item);
    const pointer = getPoint(event);
    const pointerAngle = Math.atan2(pointer.y - (bounds.y + bounds.height / 2), pointer.x - (bounds.x + bounds.width / 2));
    const originalAngle =
      item.type === "arrow" ? Math.atan2(item.endY - item.y, item.endX - item.x) : (item.rotation * Math.PI) / 180;
    dragRef.current = {
      kind: "rotate-item",
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2,
      pointerAngle,
      originalAngle,
      original: item
    };
    setSelectedItemId(item.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startFrameResize = (event: React.PointerEvent, frame: PlaygroundFrame, handle: ResizeHandle) => {
    if (!layoutEditable || frame.stageId !== selectedStageId) {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      kind: "resize-frame",
      frameId: frame.stageId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      original: frame
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startArrowDraft = (event: React.PointerEvent) => {
    if (!contentEditable || tool !== "arrow" || !selectedFrame) {
      return;
    }

    const point = getPoint(event);
    const clamped = {
      x: clamp(point.x, selectedFrame.x + 20, selectedFrame.x + selectedFrame.width - 20),
      y: clamp(point.y, selectedFrame.y + 54, selectedFrame.y + selectedFrame.height - 20)
    };

    dragRef.current = {
      kind: "draw-arrow",
      startX: clamped.x,
      startY: clamped.y,
      currentX: clamped.x,
      currentY: clamped.y
    };
    setArrowDraftMarker(clamped);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const startShapeDraft = (event: React.PointerEvent, shapeKind: PlaygroundShapeKind) => {
    if (!contentEditable || !selectedFrame) {
      return;
    }

    const point = getPoint(event);
    const clamped = {
      x: clamp(point.x, selectedFrame.x + 8, selectedFrame.x + selectedFrame.width - 8),
      y: clamp(point.y, selectedFrame.y + 44, selectedFrame.y + selectedFrame.height - 8)
    };

    dragRef.current = {
      kind: "draw-shape",
      shapeKind,
      startX: clamped.x,
      startY: clamped.y,
      currentX: clamped.x,
      currentY: clamped.y
    };
    setShapeDraft({
      shapeKind,
      startX: clamped.x,
      startY: clamped.y,
      currentX: clamped.x,
      currentY: clamped.y
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedFrame) {
      return;
    }

    const point = getPoint(event);
    const inside =
      point.x >= selectedFrame.x &&
      point.x <= selectedFrame.x + selectedFrame.width &&
      point.y >= selectedFrame.y &&
      point.y <= selectedFrame.y + selectedFrame.height;

    if (!inside) {
      setSelectedItemId(null);
      setSelectedGroupIds([]);
      if (tool !== "arrow") {
        setArrowDraftMarker(null);
      }
      return;
    }

    if (tool === "arrow" && contentEditable) {
      if (dragRef.current?.kind === "draw-arrow") {
        const point = getPoint(event);
        const clamped = {
          x: clamp(point.x, selectedFrame.x + 20, selectedFrame.x + selectedFrame.width - 20),
          y: clamp(point.y, selectedFrame.y + 54, selectedFrame.y + selectedFrame.height - 20)
        };
        const arrow = createDefaultArrowItem(selectedStageId, selectedFrame);
        const nextArrow: PlaygroundArrowItem = {
          ...arrow,
          color: "#0f172a",
          x: dragRef.current.startX,
          y: dragRef.current.startY,
          endX: clamped.x,
          endY: clamped.y
        };

        updateScene((current) => ({
          ...current,
          items: [...current.items, nextArrow]
        }));
        setSelectedItemId(nextArrow.id);
        setTool("select");
        setArrowDraftMarker(null);
        dragRef.current = null;
      } else {
        startArrowDraft(event);
      }
      return;
    }

    if ((tool === "rectangle" || tool === "circle" || tool === "cylinder" || tool === "diamond") && contentEditable) {
      startShapeDraft(event, tool);
      return;
    }

    if (tool !== "select" && tool !== "group-select" && contentEditable) {
      addNewItem(point);
      return;
    }

    if (tool === "group-select" && layoutEditable) {
      dragRef.current = {
        kind: "select-box",
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y
      };
      setSelectionBox({
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y
      });
      setSelectedItemId(null);
      setSelectedGroupIds([]);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }

    setSelectedItemId(null);
    setSelectedGroupIds([]);
  };

  const startArrowEndpointMove = (
    event: React.PointerEvent,
    item: PlaygroundArrowItem,
    endpoint: "start" | "end"
  ) => {
    event.stopPropagation();
    dragRef.current = {
      kind: "move-arrow-endpoint",
      itemId: item.id,
      endpoint,
      startX: event.clientX,
      startY: event.clientY,
      original: item
    };
    setSelectedItemId(item.id);
    setSelectedGroupIds([]);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleTripleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!contentEditable || !selectedFrame) {
      return;
    }

    if (event.detail !== 3) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement || target.closest("textarea")) {
      return;
    }

    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds || !viewportRef.current) {
      return;
    }

    const point = {
      x: (event.clientX - bounds.left + viewportRef.current.scrollLeft) / zoom,
      y: (event.clientY - bounds.top + viewportRef.current.scrollTop) / zoom
    };

    const inside =
      point.x >= selectedFrame.x &&
      point.x <= selectedFrame.x + selectedFrame.width &&
      point.y >= selectedFrame.y &&
      point.y <= selectedFrame.y + selectedFrame.height;

    if (!inside) {
      return;
    }

    const x = clamp(point.x, selectedFrame.x + 16, selectedFrame.x + selectedFrame.width - 180);
    const y = clamp(point.y, selectedFrame.y + 52, selectedFrame.y + selectedFrame.height - 120);
    const item = { ...createDefaultTextItem(selectedStageId, selectedFrame), x, y };

    updateScene((current) => ({
      ...current,
      items: [...current.items, item]
    }));
    setSelectedItemId(item.id);
    setPendingFocusTextId(item.id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState) {
      return;
    }

    const point = getPoint(event);

    const deltaX = (event.clientX - dragState.startX) / zoom;
    const deltaY = (event.clientY - dragState.startY) / zoom;

    if (dragState.kind === "move-frame") {
      updateScene((current) => ({
        ...current,
        frames: current.frames.map((frame) =>
          frame.stageId === dragState.frameId
            ? {
                ...frame,
                x: clamp(dragState.original.x + deltaX, 32, Math.max(32, canvasWidth - dragState.original.width - 32)),
                y: clamp(dragState.original.y + deltaY, 32, Math.max(32, canvasHeight - dragState.original.height - 32))
              }
            : frame
        ),
        items: current.items.map((item) =>
          item.stageId === dragState.frameId
            ? (() => {
                const originalItem = dragState.originalItems.find((entry) => entry.id === item.id) ?? item;
                return originalItem.type === "arrow"
                  ? {
                      ...item,
                      x: originalItem.x + deltaX,
                      y: originalItem.y + deltaY,
                      endX: originalItem.endX + deltaX,
                      endY: originalItem.endY + deltaY
                    }
                  : {
                      ...item,
                      x: originalItem.x + deltaX,
                      y: originalItem.y + deltaY
                    };
              })()
            : item
        )
      }));
      return;
    }

    if (dragState.kind === "select-box") {
      dragRef.current = {
        ...dragState,
        currentX: point.x,
        currentY: point.y
      };
      setSelectionBox({
        startX: dragState.startX,
        startY: dragState.startY,
        currentX: point.x,
        currentY: point.y
      });
      return;
    }

    const frame = selectedFrame;
    if (!frame) {
      return;
    }

    if (dragState.kind === "draw-arrow") {
      const clamped = {
        x: clamp(point.x, frame.x + 20, frame.x + frame.width - 20),
        y: clamp(point.y, frame.y + 54, frame.y + frame.height - 20)
      };
      dragRef.current = {
        ...dragState,
        currentX: clamped.x,
        currentY: clamped.y
      };
      return;
    }

    if (dragState.kind === "draw-shape") {
      const clamped = {
        x: clamp(point.x, frame.x + 8, frame.x + frame.width - 8),
        y: clamp(point.y, frame.y + 44, frame.y + frame.height - 8)
      };
      dragRef.current = {
        ...dragState,
        currentX: clamped.x,
        currentY: clamped.y
      };
      setShapeDraft({
        shapeKind: dragState.shapeKind,
        startX: dragState.startX,
        startY: dragState.startY,
        currentX: clamped.x,
        currentY: clamped.y
      });
      return;
    }

    if (dragState.kind === "move-group") {
      updateScene((current) => ({
        ...current,
        items: current.items.map((item) => {
          const original = dragState.originals.find((entry) => entry.id === item.id);
          if (!original) {
            return item;
          }

          return original.type === "arrow"
            ? {
                ...item,
                x: original.x + deltaX,
                y: original.y + deltaY,
                endX: original.endX + deltaX,
                endY: original.endY + deltaY
              }
            : {
                ...item,
                x: original.x + deltaX,
                y: original.y + deltaY
              };
        })
      }));
      return;
    }

    if (dragState.kind === "move-item") {
      updateItem(dragState.itemId, (item) => {
        if (item.type === "arrow") {
          const width = item.endX - item.x;
          const height = item.endY - item.y;
          const nextX = clamp(dragState.original.x + deltaX, frame.x + 8, frame.x + frame.width - Math.abs(width) - 8);
          const nextY = clamp(dragState.original.y + deltaY, frame.y + 44, frame.y + frame.height - Math.abs(height) - 8);
          return {
            ...item,
            x: nextX,
            y: nextY,
            endX: nextX + width,
            endY: nextY + height
          };
        }

        return {
          ...item,
          x: clamp(dragState.original.x + deltaX, frame.x + 8, frame.x + frame.width - item.width - 8),
          y: clamp(dragState.original.y + deltaY, frame.y + 44, frame.y + frame.height - item.height - 8)
        };
      });
      return;
    }

    if (dragState.kind === "move-arrow-endpoint") {
      updateItem(dragState.itemId, (item) => {
        if (item.type !== "arrow") {
          return item;
        }

        const clamped = {
          x: clamp(point.x, frame.x + 8, frame.x + frame.width - 8),
          y: clamp(point.y, frame.y + 44, frame.y + frame.height - 8)
        };

        return dragState.endpoint === "start"
          ? {
              ...item,
              x: clamped.x,
              y: clamped.y
            }
          : {
              ...item,
              endX: clamped.x,
              endY: clamped.y
            };
      });
      return;
    }

    if (dragState.kind === "rotate-item") {
      const point = getPoint(event);
      const currentPointerAngle = Math.atan2(point.y - dragState.centerY, point.x - dragState.centerX);
      const nextAngle = dragState.originalAngle + (currentPointerAngle - dragState.pointerAngle);
      updateItem(dragState.itemId, (item) => {
        if (item.type === "arrow" && dragState.original.type === "arrow") {
          const centerX = dragState.centerX;
          const centerY = dragState.centerY;
          const length = Math.hypot(dragState.original.endX - dragState.original.x, dragState.original.endY - dragState.original.y);
          const halfX = (Math.cos(nextAngle) * length) / 2;
          const halfY = (Math.sin(nextAngle) * length) / 2;
          return {
            ...item,
            x: centerX - halfX,
            y: centerY - halfY,
            endX: centerX + halfX,
            endY: centerY + halfY
          };
        }

        return {
          ...item,
          rotation: Math.round((nextAngle * 180) / Math.PI)
        };
      });
      return;
    }

    if (dragState.kind === "resize-item") {
      updateItem(dragState.itemId, (item) => {
        if (item.type === "arrow") {
          const originalItem = dragState.original.type === "arrow" ? dragState.original : item;
          const baseLength = Math.hypot(originalItem.endX - originalItem.x, originalItem.endY - originalItem.y);
          const radians = Math.atan2(originalItem.endY - originalItem.y, originalItem.endX - originalItem.x);
          const delta = dragState.handle === "south" ? deltaY : dragState.handle === "east" ? deltaX : Math.max(deltaX, deltaY);
          const nextLength = clamp(baseLength + delta, 40, 1200);
          return {
            ...item,
            endX: item.x + Math.cos(radians) * nextLength,
            endY: item.y + Math.sin(radians) * nextLength
          };
        }

        if (item.type === "text") {
          const originalItem = dragState.original.type === "text" ? dragState.original : item;
          const minScale = MIN_TEXT_FONT_SIZE / Math.max(originalItem.fontSize, 1);
          const minWidth = Math.max(48, Math.round(originalItem.width * minScale));
          const minHeight = Math.max(24, Math.round(originalItem.height * minScale));
          let nextWidth = item.width;
          let nextHeight = item.height;
          let nextX = item.x;
          let nextY = item.y;

          if (dragState.handle === "east" || dragState.handle === "northeast" || dragState.handle === "southeast") {
            nextWidth = clamp(originalItem.width + deltaX, minWidth, frame.x + frame.width - item.x - 8);
          }
          if (dragState.handle === "west" || dragState.handle === "northwest" || dragState.handle === "southwest") {
            const width = clamp(originalItem.width - deltaX, minWidth, originalItem.x + originalItem.width - (frame.x + 8));
            nextWidth = width;
            nextX = clamp(originalItem.x + deltaX, frame.x + 8, originalItem.x + originalItem.width - minWidth);
          }
          if (dragState.handle === "south" || dragState.handle === "southeast" || dragState.handle === "southwest") {
            nextHeight = clamp(originalItem.height + deltaY, minHeight, frame.y + frame.height - item.y - 8);
          }
          if (dragState.handle === "north" || dragState.handle === "northeast" || dragState.handle === "northwest") {
            const height = clamp(originalItem.height - deltaY, minHeight, originalItem.y + originalItem.height - (frame.y + 44));
            nextHeight = height;
            nextY = clamp(originalItem.y + deltaY, frame.y + 44, originalItem.y + originalItem.height - minHeight);
          }

          const resizedWidth = Math.max(nextWidth, minWidth);
          const resizedHeight = Math.max(nextHeight, minHeight);
          const isShrinking = resizedWidth < originalItem.width || resizedHeight < originalItem.height;
          let nextFontSize = originalItem.fontSize;

          if (isShrinking) {
            const measuredAtCurrentFont = measureTextItemSize({
              text: originalItem.text,
              fontSize: originalItem.fontSize,
              fontFamily: originalItem.fontFamily,
              fontWeight: originalItem.fontWeight,
              maxWidth: resizedWidth,
              minWidth: 0,
              minHeight: 0
            });
            const horizontalPadding = resizedWidth - measuredAtCurrentFont.width;
            const canKeepCurrentFont =
              horizontalPadding > 20 && measuredAtCurrentFont.height <= resizedHeight;

            if (!canKeepCurrentFont) {
              nextFontSize = fitTextFontSizeForBox({
                text: originalItem.text,
                fontFamily: originalItem.fontFamily,
                fontWeight: originalItem.fontWeight,
                targetWidth: resizedWidth,
                targetHeight: resizedHeight,
                preferredFontSize: originalItem.fontSize
              });
            }
          } else {
            const resizeScale = getTextResizeScale(
              dragState.handle,
              {
                width: Math.max(originalItem.width, minWidth),
                height: Math.max(originalItem.height, minHeight)
              },
              {
                width: resizedWidth,
                height: resizedHeight
              }
            );
            nextFontSize = clamp(Math.round(originalItem.fontSize * resizeScale), MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
          }

          return {
            ...item,
            x: nextX,
            y: nextY,
            width: resizedWidth,
            height: resizedHeight,
            maxWidth: resizedWidth,
            fontSize: nextFontSize
          };
        }

        const originalItem = dragState.original.type === "arrow" ? item : dragState.original;
        const next = { ...item };

        if (dragState.handle === "east" || dragState.handle === "northeast" || dragState.handle === "southeast") {
          next.width = clamp(originalItem.width + deltaX, 48, frame.x + frame.width - item.x - 8);
        }
        if (dragState.handle === "west" || dragState.handle === "northwest" || dragState.handle === "southwest") {
          const width = clamp(originalItem.width - deltaX, 48, originalItem.x + originalItem.width - (frame.x + 8));
          next.width = width;
          next.x = clamp(originalItem.x + deltaX, frame.x + 8, originalItem.x + originalItem.width - 48);
        }
        if (dragState.handle === "south" || dragState.handle === "southeast" || dragState.handle === "southwest") {
          next.height = clamp(originalItem.height + deltaY, 48, frame.y + frame.height - item.y - 8);
        }
        if (dragState.handle === "north" || dragState.handle === "northeast" || dragState.handle === "northwest") {
          const height = clamp(originalItem.height - deltaY, 48, originalItem.y + originalItem.height - (frame.y + 44));
          next.height = height;
          next.y = clamp(originalItem.y + deltaY, frame.y + 44, originalItem.y + originalItem.height - 48);
        }

        return next;
      });
      return;
    }

    if (dragState.kind !== "resize-frame") {
      return;
    }

    updateFrame(dragState.frameId, (currentFrame) => {
      const next = { ...currentFrame };

      if (dragState.handle === "east" || dragState.handle === "northeast" || dragState.handle === "southeast") {
        next.width = clamp(dragState.original.width + deltaX, 520, 1600);
      }
      if (dragState.handle === "west" || dragState.handle === "northwest" || dragState.handle === "southwest") {
        next.width = clamp(dragState.original.width - deltaX, 520, 1600);
        next.x = clamp(dragState.original.x + deltaX, 32, dragState.original.x + dragState.original.width - 520);
      }
      if (dragState.handle === "south" || dragState.handle === "southeast" || dragState.handle === "southwest") {
        next.height = clamp(dragState.original.height + deltaY, 220, 1200);
      }
      if (dragState.handle === "north" || dragState.handle === "northeast" || dragState.handle === "northwest") {
        next.height = clamp(dragState.original.height - deltaY, 220, 1200);
        next.y = clamp(dragState.original.y + deltaY, 32, dragState.original.y + dragState.original.height - 220);
      }

      return next;
    });
  };

  const handlePointerUp = () => {
    const dragState = dragRef.current;
    if (!dragState || !selectedFrame) {
      dragRef.current = null;
      return;
    }

    if (dragState.kind === "draw-arrow") {
      const width = Math.abs(dragState.currentX - dragState.startX);
      const height = Math.abs(dragState.currentY - dragState.startY);
      if (width >= 6 || height >= 6) {
        const arrow = createDefaultArrowItem(selectedStageId, selectedFrame);
        const nextArrow: PlaygroundArrowItem = {
          ...arrow,
          color: "#0f172a",
          x: dragState.startX,
          y: dragState.startY,
          endX: dragState.currentX,
          endY: dragState.currentY
        };

        updateScene((current) => ({
          ...current,
          items: [...current.items, nextArrow]
        }));
        setSelectedItemId(nextArrow.id);
        setTool("select");
        setArrowDraftMarker(null);
        dragRef.current = null;
      }
      return;
    }

    if (dragState.kind === "draw-shape") {
      const width = Math.abs(dragState.currentX - dragState.startX);
      const height = Math.abs(dragState.currentY - dragState.startY);

      if (selectedFrame) {
        if (width < 6 && height < 6) {
          const item = {
            ...createDefaultShapeItem(selectedStageId, selectedFrame, dragState.shapeKind),
            x: clamp(dragState.startX, selectedFrame.x + 16, selectedFrame.x + selectedFrame.width - 180),
            y: clamp(dragState.startY, selectedFrame.y + 52, selectedFrame.y + selectedFrame.height - 120)
          };

          updateScene((current) => ({
            ...current,
            items: [...current.items, item]
          }));
          setSelectedItemId(item.id);
        } else {
          const item = {
            ...createDefaultShapeItem(selectedStageId, selectedFrame, dragState.shapeKind),
            x: Math.min(dragState.startX, dragState.currentX),
            y: Math.min(dragState.startY, dragState.currentY),
            width: Math.max(48, width),
            height: Math.max(48, height)
          };

          updateScene((current) => ({
            ...current,
            items: [...current.items, item]
          }));
          setSelectedItemId(item.id);
        }
      }

      setShapeDraft(null);
      setTool("select");
      dragRef.current = null;
      return;
    }

    if (dragState.kind === "select-box") {
      const minX = Math.min(dragState.startX, dragState.currentX);
      const maxX = Math.max(dragState.startX, dragState.currentX);
      const minY = Math.min(dragState.startY, dragState.currentY);
      const maxY = Math.max(dragState.startY, dragState.currentY);
      const ids = scene.items
        .filter((item) => item.stageId === selectedStageId)
        .filter((item) => {
          const bounds = itemBounds(item);
          return bounds.x >= minX && bounds.y >= minY && bounds.x + bounds.width <= maxX && bounds.y + bounds.height <= maxY;
        })
        .map((item) => item.id);
      setSelectedGroupIds(ids.length > 1 ? ids : []);
      setSelectedItemId(ids.length === 1 ? ids[0]! : null);
      setTool("select");
      setSelectionBox(null);
      dragRef.current = null;
      return;
    }

    if (dragState.kind === "resize-item") {
      const resizedItem = scene.items.find((item) => item.id === dragState.itemId);
      if (resizedItem?.type === "text") {
        updateItem(resizedItem.id, (item) => {
          if (item.type !== "text") {
            return item;
          }

          return {
            ...item,
            fontSize: fitTextFontSizeForBox({
              text: item.text,
              fontFamily: item.fontFamily,
              fontWeight: item.fontWeight,
              targetWidth: item.width,
              targetHeight: item.height,
              preferredFontSize: item.fontSize
            })
          };
        });
      }
    }

    dragRef.current = null;
    setSelectionBox(null);
    setShapeDraft(null);
  };

  const selectedInlineToolbar = useMemo(() => {
    if (!selectedItem || !selectedBounds) {
      return null;
    }

    const isArrow = selectedItem.type === "arrow";
    const currentColor = selectedItem.type === "shape" ? selectedItem.strokeColor : selectedItem.color;
    return (
      <div
        className="absolute z-[90] flex w-44 flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          left: selectedBounds.x + selectedBounds.width + 14,
          top: Math.max(selectedBounds.y - 8, 8)
        }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Color</span>
          <input
            className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1"
            onChange={(event) =>
              updateItem(selectedItem.id, (item) =>
                item.type === "shape"
                  ? {
                      ...item,
                      strokeColor: event.target.value,
                      fillColor: withAlpha(event.target.value, 0.18),
                      color: event.target.value
                    }
                  : {
                      ...item,
                      color: event.target.value
                    }
              )
            }
            type="color"
            value={currentColor}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Text Style</span>
          {selectedItem.type === "text" ? (
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              onChange={(event) =>
                updateItem(selectedItem.id, (item) =>
                  item.type === "text" ? { ...item, fontFamily: event.target.value as PlaygroundFontFamily } : item
                )
              }
              value={selectedItem.fontFamily}
            >
              {fontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>
          ) : null}
          {selectedItem.type === "text" ? (
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              onChange={(event) =>
                updateItem(selectedItem.id, (item) =>
                  item.type === "text" ? { ...item, fontWeight: event.target.value as "regular" | "bold" | "medium" } : item
                )
              }
              value={selectedItem.fontWeight}
            >
              <option value="regular">regular</option>
              <option value="medium">medium</option>
              <option value="bold">bold</option>
            </select>
          ) : null}
          {selectedItem.type === "text" ? (
            null
          ) : null}
        </div>

        {isArrow ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Line Style</span>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              onChange={(event) =>
                updateItem(selectedItem.id, (item) => (item.type === "arrow" ? { ...item, style: event.target.value as PlaygroundArrowStyle } : item))
              }
              value={selectedItem.style}
            >
              <option value="solid">solid</option>
              <option value="bold">bold</option>
              <option value="hashed">hashed</option>
            </select>
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-600"
            onClick={() => {
              const timestamp = new Date().toISOString();
              const copy =
                selectedItem.type === "arrow"
                  ? {
                      ...selectedItem,
                      id: crypto.randomUUID(),
                      x: selectedItem.x + 24,
                      y: selectedItem.y + 24,
                      endX: selectedItem.endX + 24,
                      endY: selectedItem.endY + 24,
                      createdAt: timestamp,
                      updatedAt: timestamp
                    }
                  : {
                      ...selectedItem,
                      id: crypto.randomUUID(),
                      x: selectedItem.x + 24,
                      y: selectedItem.y + 24,
                      createdAt: timestamp,
                      updatedAt: timestamp
                    };

              updateScene((current) => ({
                ...current,
                items: [...current.items, copy]
              }));
              setSelectedItemId(copy.id);
            }}
            title="Copy"
            type="button"
          >
            ⧉
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-sm text-rose-700"
            onClick={() => {
              updateScene((current) => ({
                ...current,
                items: current.items.filter((item) => item.id !== selectedItem.id)
              }));
              setSelectedItemId(null);
            }}
            title="Delete"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }, [selectedBounds, selectedItem]);

  const orderedFrames = useMemo(() => {
    const unselected = scene.frames.filter((frame) => frame.stageId !== selectedStageId);
    const selected = scene.frames.find((frame) => frame.stageId === selectedStageId);
    return selected ? [...unselected, selected] : scene.frames;
  }, [scene.frames, selectedStageId]);

  const orderedArrows = useMemo(() => {
    const arrows = scene.items.filter((item): item is PlaygroundArrowItem => item.type === "arrow");
    const unselected = arrows.filter((item) => item.stageId !== selectedStageId);
    const selected = arrows.filter((item) => item.stageId === selectedStageId);
    return [...unselected, ...selected];
  }, [scene.items, selectedStageId]);

  const orderedNonArrowItems = useMemo(() => {
    const items = scene.items.filter((item) => item.type !== "arrow");
    const unselected = items.filter((item) => item.stageId !== selectedStageId);
    const selected = items.filter((item) => item.stageId === selectedStageId);
    return [...unselected, ...selected];
  }, [scene.items, selectedStageId]);

  const selectedGroupToolbar = useMemo(() => {
    if (!selectedGroupBounds || selectedGroupIds.length < 2) {
      return null;
    }

    return (
      <div
        className="absolute z-[90] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          left: selectedGroupBounds.x + selectedGroupBounds.width + 14,
          top: Math.max(selectedGroupBounds.y - 8, 8)
        }}
      >
        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-600"
          onClick={() => {
            setClipboardGroup(selectedGroupItems);
            setClipboardItem(null);
          }}
          title="Copy group"
          type="button"
        >
          ⧉
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-sm text-rose-700"
          onClick={() => {
            updateScene((current) => ({
              ...current,
              items: current.items.filter((item) => !selectedGroupIds.includes(item.id))
            }));
            setSelectedGroupIds([]);
          }}
          title="Delete group"
          type="button"
        >
          ✕
        </button>
      </div>
    );
  }, [selectedGroupBounds, selectedGroupIds, selectedGroupItems]);

  return (
    <section className="playground-shell overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-[#eef7f7] px-5 py-4">
        <h3 className="text-lg font-semibold text-brand-ink">Playground</h3>
      </div>

      <div className="relative px-5 py-5">
        <div
          className="overflow-auto rounded-[1.4rem] border border-slate-200 bg-[linear-gradient(to_right,#eef2f7_1px,transparent_1px),linear-gradient(to_bottom,#eef2f7_1px,transparent_1px)] bg-[size:24px_24px]"
          ref={viewportRef}
        >
          <div
            className="relative origin-top-left"
            onClick={handleTripleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "top left"
            }}
          >
            {orderedFrames.map((frame) => {
              const isSelected = frame.stageId === selectedStageId;
              const stageScore = stageScores[frame.stageId];
              return (
                <div
                  className={`absolute rounded-[1.6rem] border-2 bg-white/90 shadow-sm ${
                    isSelected ? "border-brand-teal shadow-[0_0_0_3px_rgba(15,118,110,0.12)]" : "border-slate-200"
                  }`}
                  key={frame.stageId}
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.width,
                    height: frame.height,
                    zIndex: isSelected ? 20 : 1
                  }}
                >
                  <button
                    className="flex w-full cursor-move items-center justify-between border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-brand-ink"
                    onClick={() => onSelectStage(frame.stageId)}
                    onPointerDown={(event) => startFrameMove(event, frame)}
                    type="button"
                  >
                    <span>{frame.title}</span>
                    {stageScore !== null && stageScore !== undefined ? (
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] text-slate-500">
                        Best {stageScore.toFixed(2)}
                      </span>
                    ) : null}
                  </button>

                  {isSelected && layoutEditable ? (
                    <>
                      <button
                        className="absolute left-[-7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "west")}
                        type="button"
                      />
                      <button
                        className="absolute right-[-7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "east")}
                        type="button"
                      />
                      <button
                        className="absolute left-1/2 top-[-7px] h-3.5 w-3.5 -translate-x-1/2 cursor-ns-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "north")}
                        type="button"
                      />
                      <button
                        className="absolute bottom-[-7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-ns-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "south")}
                        type="button"
                      />
                      <button
                        className="absolute left-[-7px] top-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "northwest")}
                        type="button"
                      />
                      <button
                        className="absolute right-[-7px] top-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "northeast")}
                        type="button"
                      />
                      <button
                        className="absolute bottom-[-7px] left-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "southwest")}
                        type="button"
                      />
                      <button
                        className="absolute bottom-[-7px] right-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                        onPointerDown={(event) => startFrameResize(event, frame, "southeast")}
                        type="button"
                      />
                    </>
                  ) : null}
                </div>
              );
            })}

            <svg className="pointer-events-none absolute inset-0 z-[24] h-full w-full">
              {orderedArrows.map((item) => {
                  const angle = Math.atan2(item.endY - item.y, item.endX - item.x);
                  const head = 14;
                  const leftX = item.endX - head * Math.cos(angle - Math.PI / 6);
                  const leftY = item.endY - head * Math.sin(angle - Math.PI / 6);
                  const rightX = item.endX - head * Math.cos(angle + Math.PI / 6);
                  const rightY = item.endY - head * Math.sin(angle + Math.PI / 6);

                  return (
                    <g key={item.id}>
                      <line
                        stroke={item.color}
                        strokeDasharray={arrowDash(item.style)}
                        strokeWidth={arrowWidth(item)}
                        x1={item.x}
                        x2={item.endX}
                        y1={item.y}
                        y2={item.endY}
                      />
                      <polyline
                        fill="none"
                        points={`${leftX},${leftY} ${item.endX},${item.endY} ${rightX},${rightY}`}
                        stroke={item.color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={arrowWidth(item)}
                      />
                    </g>
                  );
                })}
              {arrowDraftMarker ? (
                dragRef.current?.kind === "draw-arrow" &&
                (Math.abs(dragRef.current.currentX - dragRef.current.startX) >= 6 ||
                  Math.abs(dragRef.current.currentY - dragRef.current.startY) >= 6) ? (
                  <g>
                    <line
                      stroke="#0f766e"
                      strokeDasharray="8 6"
                      strokeWidth={2}
                      x1={dragRef.current.startX}
                      x2={dragRef.current.currentX}
                      y1={dragRef.current.startY}
                      y2={dragRef.current.currentY}
                    />
                    <circle
                      cx={dragRef.current.startX}
                      cy={dragRef.current.startY}
                      fill="#0f766e"
                      r={4}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                ) : (
                  <circle
                    cx={arrowDraftMarker.x}
                    cy={arrowDraftMarker.y}
                    fill="#0f766e"
                    r={5}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                )
              ) : null}
            </svg>

            {orderedArrows.map((item) => {
                const editable = layoutEditable && item.stageId === selectedStageId;
                const bounds = itemBounds(item);

                return (
                  <div
                    className="absolute bg-transparent"
                    key={`${item.id}-hitbox`}
                    style={{
                      left: bounds.x - 12,
                      top: bounds.y - 12,
                      width: Math.max(bounds.width, 24) + 24,
                      height: Math.max(bounds.height, 24) + 24,
                      zIndex: item.stageId === selectedStageId ? 26 : 6,
                      pointerEvents: "none"
                    }}
                  >
                    {tool === "select" ? (
                      <svg className="absolute inset-0 overflow-visible" height="100%" style={{ pointerEvents: "none" }} width="100%">
                        <line
                          onPointerDown={(event) => startItemMove(event, item)}
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ pointerEvents: "stroke", cursor: "move" }}
                          x1={item.x - (bounds.x - 12)}
                          x2={item.endX - (bounds.x - 12)}
                          y1={item.y - (bounds.y - 12)}
                          y2={item.endY - (bounds.y - 12)}
                        />
                      </svg>
                    ) : null}
                    {editable && selectedItemId === item.id ? (
                      <>
                        <button
                          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startArrowEndpointMove(event, item, "start")}
                          style={{
                            left: item.x - (bounds.x - 12),
                            top: item.y - (bounds.y - 12),
                            pointerEvents: "auto"
                          }}
                          type="button"
                        />
                        <button
                          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startArrowEndpointMove(event, item, "end")}
                          style={{
                            left: item.endX - (bounds.x - 12),
                            top: item.endY - (bounds.y - 12),
                            pointerEvents: "auto"
                          }}
                          type="button"
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}

            {orderedNonArrowItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                const layoutItemEditable = layoutEditable && item.stageId === selectedStageId;
                const textContentEditable = contentEditable && item.stageId === selectedStageId;

                if (item.type === "text") {
                  return (
                    <div
                      className={`absolute rounded-xl bg-transparent ${isSelected ? "border border-brand-teal shadow-[0_0_0_2px_rgba(15,118,110,0.12)]" : "border border-transparent"}`}
                      key={item.id}
                      onPointerDown={(event) => {
                        if (tool === "select") {
                          startItemMove(event, item);
                        }
                      }}
                      style={{
                        left: item.x,
                        top: item.y,
                        width: item.width,
                        height: item.height,
                        transform: `rotate(${item.rotation}deg)`,
                        zIndex: item.stageId === selectedStageId ? 25 : 5
                      }}
                    >
                      {layoutItemEditable && isSelected ? (
                        <button
                          className="absolute left-[calc(50%-1.55rem)] top-[-24px] flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-[4px] border border-dashed border-brand-teal bg-white text-[8px] leading-none text-brand-teal"
                          onPointerDown={(event) => startItemMove(event, item)}
                          title="Move text"
                          type="button"
                        >
                          ::
                        </button>
                      ) : null}
                      <textarea
                        className="block h-full w-full resize-none overflow-hidden rounded-xl bg-transparent outline-none"
                        autoFocus={pendingFocusTextId === item.id}
                        onChange={(event) =>
                          updateItem(item.id, (current) => {
                            if (current.type !== "text") {
                              return current;
                            }
                            const frame = getFrameForStage(scene, current.stageId);
                            const frameMaxWidth = frame ? Math.max(frame.width - 56, 180) : 520;
                            const maxWidth = Math.min(current.maxWidth ?? frameMaxWidth, frameMaxWidth);
                            const measured = measureTextItemSize({
                              text: event.target.value,
                              fontSize: current.fontSize,
                              fontFamily: current.fontFamily,
                              fontWeight: current.fontWeight,
                              maxWidth
                            });
                            return {
                              ...current,
                              text: event.target.value,
                              maxWidth,
                              width: Math.max(current.width, measured.width),
                              height: Math.max(current.height, measured.height)
                            };
                          })
                        }
                        placeholder="Write here"
                        onClick={() => {
                          if (tool === "select") {
                            setSelectedItemId(item.id);
                            setSelectedGroupIds([]);
                          }
                        }}
                        onFocus={() => {
                          if (pendingFocusTextId === item.id) {
                            setPendingFocusTextId(null);
                          }
                          if (tool === "select") {
                            setSelectedItemId(item.id);
                            setSelectedGroupIds([]);
                          }
                        }}
                        onPointerDown={(event) => {
                          if (tool === "select") {
                            event.stopPropagation();
                            setSelectedItemId(item.id);
                            setSelectedGroupIds([]);
                          }
                        }}
                        readOnly={!textContentEditable}
                        style={{
                          boxSizing: "border-box",
                          color: item.color,
                          fontFamily: fontFamilyCss(item.fontFamily),
                          fontSize: item.fontSize,
                          fontWeight: item.fontWeight === "regular" ? 400 : item.fontWeight === "medium" ? 500 : 700,
                          lineHeight: `${Math.max(8, Math.round(item.fontSize * 1.25))}px`,
                          padding: 0,
                          paddingLeft: 10,
                          paddingTop: 10
                        }}
                        value={item.text}
                      />
                      {layoutItemEditable && isSelected ? (
                        <>
                          <button
                            className="absolute left-1/2 top-[-24px] h-4 w-4 -translate-x-1/2 rounded-full border border-brand-teal bg-white"
                            onPointerDown={(event) => startItemRotate(event, item)}
                            type="button"
                          />
                          <span className="pointer-events-none absolute left-1/2 top-[-8px] h-4 w-[1px] -translate-x-1/2 bg-brand-teal" />
                          <button
                            className="absolute left-[-7px] top-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                            onPointerDown={(event) => startItemResize(event, item, "northwest")}
                            type="button"
                          />
                          <button
                            className="absolute right-[-7px] top-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                            onPointerDown={(event) => startItemResize(event, item, "northeast")}
                            type="button"
                          />
                          <button
                            className="absolute bottom-[-7px] left-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                            onPointerDown={(event) => startItemResize(event, item, "southwest")}
                            type="button"
                          />
                          <button
                            className="absolute bottom-[-7px] right-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                            onPointerDown={(event) => startItemResize(event, item, "southeast")}
                            type="button"
                          />
                        </>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <div
                    className={`absolute ${isSelected ? "ring-2 ring-brand-teal/30" : ""}`}
                    key={item.id}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.width,
                      height: item.height,
                      transform: `rotate(${item.rotation}deg)`,
                      zIndex: item.stageId === selectedStageId ? 25 : 5,
                      pointerEvents: "none"
                    }}
                  >
                    <svg className="pointer-events-none" height={item.height} width={item.width}>
                      {item.shapeKind === "rectangle" ? (
                        <rect
                          fill={item.fillColor}
                          height={item.height - 4}
                          rx={18}
                          stroke={item.strokeColor}
                          strokeWidth={item.strokeWidth}
                          width={item.width - 4}
                          x={2}
                          y={2}
                        />
                      ) : item.shapeKind === "circle" ? (
                        <ellipse
                          cx={item.width / 2}
                          cy={item.height / 2}
                          fill={item.fillColor}
                          rx={(item.width - 6) / 2}
                          ry={(item.height - 6) / 2}
                          stroke={item.strokeColor}
                          strokeWidth={item.strokeWidth}
                        />
                      ) : item.shapeKind === "diamond" ? (
                        <polygon
                          fill={item.fillColor}
                          points={`${item.width / 2},2 ${item.width - 2},${item.height / 2} ${item.width / 2},${item.height - 2} 2,${item.height / 2}`}
                          stroke={item.strokeColor}
                          strokeWidth={item.strokeWidth}
                        />
                      ) : (
                        <>
                          <ellipse
                            cx={item.width / 2}
                            cy={14}
                            fill={item.fillColor}
                            rx={(item.width - 8) / 2}
                            ry={12}
                            stroke={item.strokeColor}
                            strokeWidth={item.strokeWidth}
                          />
                          <rect
                            fill={item.fillColor}
                            height={item.height - 28}
                            stroke={item.strokeColor}
                            strokeWidth={item.strokeWidth}
                            width={item.width - 8}
                            x={4}
                            y={14}
                          />
                          <ellipse
                            cx={item.width / 2}
                            cy={item.height - 14}
                            fill={item.fillColor}
                            rx={(item.width - 8) / 2}
                            ry={12}
                            stroke={item.strokeColor}
                            strokeWidth={item.strokeWidth}
                          />
                        </>
                      )}
                    </svg>
                    {tool === "select" ? (
                      item.shapeKind === "diamond" ? (
                        <svg className="absolute inset-0 overflow-visible" height={item.height} width={item.width}>
                          <polygon
                            fill="none"
                            points={`${item.width / 2},2 ${item.width - 2},${item.height / 2} ${item.width / 2},${item.height - 2} 2,${item.height / 2}`}
                            stroke="transparent"
                            strokeWidth={10}
                            style={{ pointerEvents: "stroke", cursor: "move" }}
                            onPointerDown={(event) => startItemMove(event, item)}
                          />
                        </svg>
                      ) : (
                        <>
                          <button
                            className="absolute left-[-5px] right-[-5px] top-[-5px] h-3 cursor-move bg-transparent"
                            onPointerDown={(event) => startItemMove(event, item)}
                            style={{ pointerEvents: "auto" }}
                            type="button"
                          />
                          <button
                            className="absolute bottom-[-5px] left-[-5px] right-[-5px] h-3 cursor-move bg-transparent"
                            onPointerDown={(event) => startItemMove(event, item)}
                            style={{ pointerEvents: "auto" }}
                            type="button"
                          />
                          <button
                            className="absolute bottom-[-5px] left-[-5px] top-[-5px] w-3 cursor-move bg-transparent"
                            onPointerDown={(event) => startItemMove(event, item)}
                            style={{ pointerEvents: "auto" }}
                            type="button"
                          />
                          <button
                            className="absolute bottom-[-5px] right-[-5px] top-[-5px] w-3 cursor-move bg-transparent"
                            onPointerDown={(event) => startItemMove(event, item)}
                            style={{ pointerEvents: "auto" }}
                            type="button"
                          />
                        </>
                      )
                    ) : null}
                    {layoutItemEditable && isSelected ? (
                      <>
                        <button
                          className="absolute left-1/2 top-[-24px] h-4 w-4 -translate-x-1/2 rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemRotate(event, item)}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <span className="pointer-events-none absolute left-1/2 top-[-8px] h-4 w-[1px] -translate-x-1/2 bg-brand-teal" />
                        <button
                          className="absolute left-[-7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "west")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute right-[-7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "east")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute left-1/2 top-[-7px] h-3.5 w-3.5 -translate-x-1/2 cursor-ns-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "north")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute bottom-[-7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-ns-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "south")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute left-[-7px] top-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "northwest")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute right-[-7px] top-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "northeast")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute bottom-[-7px] left-[-7px] h-4 w-4 cursor-nesw-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "southwest")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                        <button
                          className="absolute bottom-[-7px] right-[-7px] h-4 w-4 cursor-nwse-resize rounded-full border border-brand-teal bg-white"
                          onPointerDown={(event) => startItemResize(event, item, "southeast")}
                          style={{ pointerEvents: "auto" }}
                          type="button"
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}

            {selectionBox ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-brand-teal bg-brand-teal/10"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.currentX),
                  top: Math.min(selectionBox.startY, selectionBox.currentY),
                  width: Math.abs(selectionBox.currentX - selectionBox.startX),
                  height: Math.abs(selectionBox.currentY - selectionBox.startY),
                  zIndex: 70
                }}
              />
            ) : null}

            {shapeDraft ? (
              <div
                className="pointer-events-none absolute z-[72] border-2 border-dashed border-brand-teal bg-brand-teal/10"
                style={{
                  left: Math.min(shapeDraft.startX, shapeDraft.currentX),
                  top: Math.min(shapeDraft.startY, shapeDraft.currentY),
                  width: Math.max(2, Math.abs(shapeDraft.currentX - shapeDraft.startX)),
                  height: Math.max(2, Math.abs(shapeDraft.currentY - shapeDraft.startY)),
                  borderRadius: shapeDraft.shapeKind === "rectangle" ? 18 : shapeDraft.shapeKind === "circle" ? "9999px" : 0
                }}
              />
            ) : null}

            {selectedGroupBounds && selectedGroupIds.length > 1 ? (
              <>
                <div
                  className="pointer-events-none absolute rounded-xl border-2 border-dashed border-brand-teal bg-brand-teal/5"
                  style={{
                    left: selectedGroupBounds.x - 6,
                    top: selectedGroupBounds.y - 6,
                    width: selectedGroupBounds.width + 12,
                    height: selectedGroupBounds.height + 12,
                    zIndex: 75
                  }}
                />
                <button
                  className="absolute flex h-4 w-4 items-center justify-center rounded-[4px] border border-dashed border-brand-teal bg-white text-[8px] leading-none text-brand-teal"
                  onPointerDown={startGroupMove}
                  style={{
                    left: selectedGroupBounds.x + selectedGroupBounds.width / 2 - 24,
                    top: selectedGroupBounds.y - 24,
                    zIndex: 76
                  }}
                  title="Move selected group"
                  type="button"
                >
                  ::
                </button>
              </>
            ) : null}

            {selectedInlineToolbar}
            {selectedGroupToolbar}
          </div>
        </div>

        <div className="pointer-events-none fixed right-8 top-1/2 z-[60] -translate-y-1/2">
          <div className="group pointer-events-auto flex w-[4.25rem] flex-col items-center gap-2 rounded-[1.4rem] border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur transition-all duration-200 hover:w-[11rem]">
            <div className="flex w-full items-center justify-center gap-2">
              <button
                className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-200 group-hover:flex-1"
                onClick={() => setZoom((value) => clamp(Math.round((value - ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX))}
                title="Zoom out"
                type="button"
              >
                <span className="text-sm">−</span>
                <span className="absolute bottom-1 right-1 text-[10px] leading-none text-slate-400">0</span>
              </button>
              <button
                className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-200 group-hover:flex-1"
                onClick={() => setZoom((value) => clamp(Math.round((value + ZOOM_STEP) * 100) / 100, ZOOM_MIN, ZOOM_MAX))}
                title="Zoom in"
                type="button"
              >
                <span className="text-sm">+</span>
                <span className="absolute bottom-1 right-1 text-[10px] leading-none text-slate-400">9</span>
              </button>
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{Math.round(zoom * 100)}%</div>
            <div className="my-1 h-px w-full bg-slate-200" />
            {toolOrder.map((entry, index) => (
              <button
                className={`relative flex h-10 w-10 items-center justify-center self-center overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 group-hover:w-full group-hover:justify-start group-hover:px-3 ${
                  tool === entry ? "border-brand-teal text-brand-teal" : "border-slate-200 text-slate-600"
                }`}
                key={entry}
                onClick={() => setTool(entry)}
                title={formatLabel(entry)}
                type="button"
              >
                <span className="shrink-0 text-sm">{toolIcons[entry]}</span>
                <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium uppercase tracking-[0.14em] opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[7rem] group-hover:opacity-100">
                  {toolLabels[entry]}
                </span>
                <span className="absolute bottom-1 right-1 text-[10px] leading-none text-slate-400">{index + 1}</span>
              </button>
            ))}
            {(canRequestHint || canRequestAnswer || contentEditable) ? (
              <div className="my-2 h-px w-full bg-slate-200" />
            ) : null}

            {stageActionButtons.map((action) => {
              if (action.key === "hint" && !canRequestHint) {
                return null;
              }
              if (action.key === "answer" && !canRequestAnswer) {
                return null;
              }
              if (action.key === "submit" && !contentEditable) {
                return null;
              }

              const isPrimary = action.key === "submit";
              const disabled = action.key === "submit" ? !canSubmit || sessionLoading : false;
              const onClick =
                action.key === "hint"
                  ? onRequestHint
                  : action.key === "answer"
                    ? onRequestAnswer
                    : onSubmit;

              return (
                <button
                  className={`relative flex h-10 w-10 items-center justify-center self-center overflow-hidden rounded-2xl border shadow-sm transition-all duration-200 group-hover:w-full group-hover:justify-start group-hover:px-3 ${
                    isPrimary
                      ? "border-brand-ink bg-brand-ink text-white disabled:border-slate-300 disabled:bg-slate-300"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  disabled={disabled}
                  key={action.key}
                  onClick={onClick}
                  type="button"
                >
                  <span className="shrink-0 text-sm">{action.key === "submit" && sessionLoading ? "…" : action.icon}</span>
                  <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium uppercase tracking-[0.14em] opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[7rem] group-hover:opacity-100">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
