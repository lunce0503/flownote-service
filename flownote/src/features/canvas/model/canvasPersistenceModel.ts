import type { Dispatch, SetStateAction } from 'react';
import type { LineElement, ImageElement, TextBoxElement, CanvasLoadData, CanvasSavePayload } from '@/entities/canvas';

// React.Dispatch 함수 타입을 명확히 정의
export type SetLines = Dispatch<SetStateAction<LineElement[]>>;
export type SetImages = Dispatch<SetStateAction<ImageElement[]>>;
export type SetTextBoxes = Dispatch<SetStateAction<TextBoxElement[]>>;
export type SerializableImageElement = Omit<ImageElement, "image">;
export type CanvasLocalDraft = {
  lines: LineElement[];
  images: SerializableImageElement[];
  textBoxes: TextBoxElement[];
  updatedAt: number;
  hasPendingChanges: boolean;
  baseRevision?: number;
};
export type CanvasSaveStatus = "idle" | "loading" | "pending" | "saving" | "saved" | "failed" | "retrying";
export type CanvasSaveTrigger = "auto" | "manual" | "retry" | "flush";
export type CanvasLoadTrigger = "selection" | "manual" | "remote";
export type CanvasSaveState = {
  status: CanvasSaveStatus;
  message: string;
  pendingRetries: number;
  lastSavedAt?: number;
  lastErrorAt?: number;
};
export const SAVE_TRIGGER_PRIORITY: Record<CanvasSaveTrigger, number> = {
  manual: 100,
  flush: 90,
  auto: 50,
  retry: 40,
};
export const LOAD_TRIGGER_PRIORITY: Record<CanvasLoadTrigger, number> = {
  manual: 90,
  selection: 80,
  remote: 70,
};

export const enqueueUniqueByPriority = <T extends string>(queue: T[], value: T, priorities: Record<T, number>) => (
  [...queue.filter((item) => item !== value), value].sort((left, right) => priorities[right] - priorities[left])
);

const LINE_POINT_PRECISION = 10;
const LINE_POINT_MIN_DISTANCE = 0.75;
const LINE_POINT_SIMPLIFY_TOLERANCE = 0.45;

const EMPTY_CANVAS_DATA: CanvasLoadData = {
  lines: [],
  images: [],
  textBoxes: [],
};

export const normalizeCanvasLoadData = (data: unknown): CanvasLoadData => {
  if (!data || typeof data !== "object") {
    return EMPTY_CANVAS_DATA;
  }

  const record = data as Partial<CanvasLoadData>;

  return {
    id: typeof record.id === "string" ? record.id : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
    revision: typeof record.revision === "number" ? record.revision : undefined,
    loadStatus: record.loadStatus === "PARTIAL" ? "PARTIAL" : "COMPLETE",
    loadWarnings: Array.isArray(record.loadWarnings) ? record.loadWarnings.filter((item): item is string => typeof item === "string") : [],
    lines: Array.isArray(record.lines) ? record.lines : [],
    images: Array.isArray(record.images) ? record.images : [],
    textBoxes: Array.isArray(record.textBoxes) ? record.textBoxes : [],
  };
};

const roundCoordinate = (value: number) => Math.round(value * LINE_POINT_PRECISION) / LINE_POINT_PRECISION;

const normalizePoint = (point: { x: number; y: number }) => ({
  x: roundCoordinate(point.x),
  y: roundCoordinate(point.y),
});

const getPointDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => (
  Math.hypot(a.x - b.x, a.y - b.y)
);

const getPointLineDistance = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return getPointDistance(point, start);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
};

const simplifyLinePoints = (points: LineElement["points"]) => {
  if (points.length <= 2) return points.map(normalizePoint);

  const deduped = points.map(normalizePoint).filter((point, index, normalizedPoints) => (
    index === 0 || getPointDistance(point, normalizedPoints[index - 1]) >= LINE_POINT_MIN_DISTANCE
  ));
  if (deduped.length <= 2) return deduped;

  const simplified = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    if (getPointLineDistance(current, previous, next) > LINE_POINT_SIMPLIFY_TOLERANCE) {
      simplified.push(current);
    }
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
};

export const serializeLine = ({ status: _status, ...line }: LineElement) => ({
  ...line,
  points: simplifyLinePoints(line.points),
});

export const serializeImage = ({ image: _image, status: _status, ...image }: ImageElement) => image;

export const serializeTextBox = ({ status: _status, ...textBox }: TextBoxElement) => textBox;

export const buildDeletedElement = <T extends { id: string }>(element: T) => ({ id: element.id } as Omit<T, "status">);

export const hasCanvasSavePayloadChanges = (payload: CanvasSavePayload) => (
  Object.values(payload).some((items) => Array.isArray(items) && items.length > 0)
);

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export const getCanvasLoadFailureMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("timed out") ? "불러오기 시간 초과" : "불러오기 실패";
};

export const applyServerCanvasStatus = (data: CanvasLoadData): CanvasLocalDraft => ({
  lines: (data.lines ?? []).map((line) => ({ ...line, status: "unchanged" })),
  images: (data.images ?? []).map((image) => ({ ...image, status: "unchanged" })),
  textBoxes: (data.textBoxes ?? []).map((textBox) => ({ ...textBox, status: "unchanged" })),
  updatedAt: Date.now(),
  hasPendingChanges: false,
});

export const markLinesSaved = (lines: LineElement[]) => (
  lines
    .filter((line) => line.status !== "deleted")
    .map((line) => ({ ...line, status: "unchanged" as const }))
);

export const markImagesSaved = (images: ImageElement[]) => (
  images
    .filter((image) => image.status !== "deleted")
    .map((image) => ({ ...image, status: "unchanged" as const }))
);

export const markTextBoxesSaved = (textBoxes: TextBoxElement[]) => (
  textBoxes
    .filter((textBox) => textBox.status !== "deleted")
    .map((textBox) => ({ ...textBox, status: "unchanged" as const }))
);
