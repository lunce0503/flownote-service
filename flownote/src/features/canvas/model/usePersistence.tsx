import { useCallback, useEffect, useRef, useState } from 'react';
import type { LineElement, ImageElement, TextBoxElement, CanvasLoadData, CanvasSavePayload } from '../../../entities/canvas/model/types';
import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, SetStateAction } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, API_CORE_BASE_URL, authHeaders, resolveBrowserReachableUrl } from '../../../shared/api';
import { publishSyncEvent } from '../../../shared/sync';
import {
  appendCanvasDeviceDiagnostic,
  readCanvasDraft as readIndexedDbCanvasDraft,
  readCanvasOperationQueue,
  removeCanvasDraft as removeIndexedDbCanvasDraft,
  writeCanvasDraft as writeIndexedDbCanvasDraft,
  writeCanvasOperationQueue,
} from './canvasIndexedDb';

// React.Dispatch 함수 타입을 명확히 정의
type SetLines = Dispatch<SetStateAction<LineElement[]>>;
type SetImages = Dispatch<SetStateAction<ImageElement[]>>;
type SetTextBoxes = Dispatch<SetStateAction<TextBoxElement[]>>;
type SerializableImageElement = Omit<ImageElement, "image">;
type CanvasLocalDraft = {
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
type CanvasRetryQueueItem = {
  id: string;
  mutationId: string;
  canvasId: string | null;
  payload: CanvasSavePayload;
  createdAt: number;
  attempts: number;
  lastError?: string;
  nextAttemptAt: number;
  priority: number;
};

const SAVE_TRIGGER_PRIORITY: Record<CanvasSaveTrigger, number> = {
  manual: 100,
  flush: 90,
  auto: 50,
  retry: 40,
};
const LOAD_TRIGGER_PRIORITY: Record<CanvasLoadTrigger, number> = {
  manual: 90,
  selection: 80,
  remote: 70,
};

const enqueueUniqueByPriority = <T extends string>(queue: T[], value: T, priorities: Record<T, number>) => (
  [...queue.filter((item) => item !== value), value].sort((left, right) => priorities[right] - priorities[left])
);

const CANVAS_SAVE_REQUEST_TIMEOUT_MS = 30_000;
const CANVAS_SOCKET_REQUEST_TIMEOUT_MS = 30_000;
const CANVAS_SOCKET_LOAD_TIMEOUT_MS = 180_000;
const CANVAS_SOCKET_UPLOAD_TIMEOUT_MS = 120_000;
const LINE_POINT_PRECISION = 10;
const LINE_POINT_MIN_DISTANCE = 0.75;
const LINE_POINT_SIMPLIFY_TOLERANCE = 0.45;

const EMPTY_CANVAS_DATA: CanvasLoadData = {
  lines: [],
  images: [],
  textBoxes: [],
};

const normalizeCanvasLoadData = (data: unknown): CanvasLoadData => {
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

const serializeLine = ({ status: _status, ...line }: LineElement) => ({
  ...line,
  points: simplifyLinePoints(line.points),
});

const serializeImage = ({ image: _image, status: _status, ...image }: ImageElement) => image;

const serializeTextBox = ({ status: _status, ...textBox }: TextBoxElement) => textBox;

const buildDeletedElement = <T extends { id: string }>(element: T) => ({ id: element.id } as Omit<T, "status">);

const hasCanvasSavePayloadChanges = (payload: CanvasSavePayload) => (
  Object.values(payload).some((items) => Array.isArray(items) && items.length > 0)
);

type CanvasSocketResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

type CanvasSaveResponse = {
  mutationId: string;
  revision: number;
  duplicate: boolean;
  storageStatus?: "PENDING" | "READY";
};

type CanvasSocketAssetUpload = {
  dataUrl: string;
  name: string;
  contentType: string;
};

type CanvasChangedEvent = {
  canvasId?: string | null;
  mutationId?: string;
  revision?: number;
};

export type CanvasLineStreamStartEvent = {
  canvasId?: string | null;
  line?: Omit<LineElement, "status">;
};

export type CanvasLineStreamPointsEvent = {
  canvasId?: string | null;
  lineId?: string;
  points?: LineElement["points"];
};

export type CanvasLineStreamEndEvent = {
  canvasId?: string | null;
  lineId?: string;
  line?: Omit<LineElement, "status">;
};

type CanvasStreamCallbacks = {
  onLineStreamStart?: (event: CanvasLineStreamStartEvent) => void;
  onLineStreamPoints?: (event: CanvasLineStreamPointsEvent) => void;
  onLineStreamEnd?: (event: CanvasLineStreamEndEvent) => void;
  onRemoteCanvasChanged?: (event: CanvasChangedEvent) => void;
};

let canvasSocket: Socket | null = null;
let canvasSocketUrl: string | null = null;

const getCanvasSocket = (socketUrl: string) => {
  if (!canvasSocket || canvasSocketUrl !== socketUrl) {
    canvasSocket?.disconnect();
    canvasSocketUrl = socketUrl;
    canvasSocket = io(socketUrl, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
    });
  }
  return canvasSocket;
};

const emitCanvasSocket = <T,>(
  socketUrl: string,
  eventName: string,
  payload: Record<string, unknown>,
  init?: Pick<RequestInit, "signal"> & { timeoutMs?: number },
): Promise<T> => (
  new Promise((resolve, reject) => {
    const socket = getCanvasSocket(socketUrl);
    const rejectAbort = () => reject(new DOMException("Socket request aborted", "AbortError"));

    if (init?.signal?.aborted) {
      rejectAbort();
      return;
    }

    const handleAbort = () => {
      rejectAbort();
    };
    init?.signal?.addEventListener("abort", handleAbort, { once: true });

    socket.timeout(init?.timeoutMs ?? CANVAS_SOCKET_REQUEST_TIMEOUT_MS).emit(
      eventName,
      payload,
      (error: Error | null, response?: CanvasSocketResponse<T>) => {
        init?.signal?.removeEventListener("abort", handleAbort);
        if (init?.signal?.aborted) {
          rejectAbort();
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || `${eventName} socket request failed`));
          return;
        }
        resolve(response.data as T);
      },
    );
  })
);

let canvasRetryQueueMemory: CanvasRetryQueueItem[] = [];
const canvasDraftMemory = new Map<string, CanvasLocalDraft>();
const canvasDraftTimers = new Map<string, number>();
const CANVAS_DRAFT_WRITE_DELAY_MS = 1_500;
const canvasDraftKey = (canvasId?: string | null) => canvasId ?? "default";

const readCanvasRetryQueue = (): CanvasRetryQueueItem[] => {
  return canvasRetryQueueMemory;
};

const writeCanvasRetryQueue = (queue: CanvasRetryQueueItem[]) => {
  canvasRetryQueueMemory = queue;
  void writeCanvasOperationQueue(queue).catch((error) => {
    console.warn("캔버스 재시도 큐 IndexedDB 저장 실패:", error);
  });
};

const getCanvasRetryCount = (canvasId?: string | null) => (
  readCanvasRetryQueue().filter((item) => item.canvasId === (canvasId ?? null)).length
);

const addCanvasRetryQueueItem = (
  canvasId: string | null | undefined,
  payload: CanvasSavePayload,
  lastError?: string,
  mutationId?: string,
  priority = 40,
): CanvasRetryQueueItem => {
  const queue = readCanvasRetryQueue();
  const targetCanvasId = canvasId ?? null;
  const existingItem = queue.find((item) => item.canvasId === targetCanvasId);
  if (existingItem) {
    const payloadChanged = JSON.stringify(existingItem.payload) !== JSON.stringify(payload);
    const updatedItem = {
      ...existingItem,
      mutationId: mutationId ?? (payloadChanged ? uuidv4() : existingItem.mutationId),
      payload,
      lastError,
      createdAt: Date.now(),
      priority: Math.max(existingItem.priority ?? 40, priority),
    };
    writeCanvasRetryQueue(queue.map((item) => item.id === existingItem.id ? updatedItem : item));
    return updatedItem;
  }
  const item: CanvasRetryQueueItem = {
    id: uuidv4(),
    mutationId: mutationId ?? uuidv4(),
    canvasId: targetCanvasId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    lastError,
    nextAttemptAt: Date.now(),
    priority,
  };
  writeCanvasRetryQueue([...queue, item]);
  return item;
};

const removeCanvasRetryQueueItem = (id: string) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().filter((item) => item.id !== id));
};

const clearCanvasRetryQueue = (canvasId?: string | null) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().filter((item) => item.canvasId !== (canvasId ?? null)));
};

const updateCanvasRetryQueueItem = (id: string, patch: Partial<CanvasRetryQueueItem>) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().map((item) => (
    item.id === id ? { ...item, ...patch } : item
  )));
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const getCanvasLoadFailureMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("timed out") ? "불러오기 시간 초과" : "불러오기 실패";
};

const saveCanvasPayload = async (
  socketUrl: string,
  canvasId: string | null | undefined,
  payload: CanvasSavePayload,
  mutationId: string,
  trigger: CanvasSaveTrigger,
  init?: Pick<RequestInit, "keepalive" | "signal">,
): Promise<CanvasSaveResponse> => {
  try {
    const response = await emitCanvasSocket<CanvasSaveResponse>(socketUrl, "canvas:save", {
      authorization: authHeaders().Authorization,
      canvasId: canvasId ?? null,
      mutationId,
      operationId: uuidv4(),
      trigger: trigger === "auto" ? "automatic" : trigger,
      clientCreatedAt: new Date().toISOString(),
      payload,
    }, {
      signal: init?.signal,
      timeoutMs: CANVAS_SAVE_REQUEST_TIMEOUT_MS,
    });
    if (response.mutationId !== mutationId) {
      throw new Error("캔버스 저장 응답의 mutationId가 요청과 일치하지 않습니다.");
    }
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      if (init?.signal?.aborted) throw error;
      throw new Error("캔버스 저장 시간이 초과되어 최신 변경만 다시 저장합니다.");
    }
    throw error;
  }
};

type CanvasAssetUploadResponse = {
  id: string;
  objectKey: string;
  url: string;
  contentType: string;
  byteSize: number;
};

const uploadCanvasAssetViaSocket = async (socketUrl: string, file: File): Promise<CanvasAssetUploadResponse> => {
  const dataUrl = await readFileAsDataUrl(file);
  return await emitCanvasSocket<CanvasAssetUploadResponse>(socketUrl, "canvas:asset-upload", {
    authorization: authHeaders().Authorization,
    file: {
      dataUrl,
      name: file.name,
      contentType: file.type || "application/octet-stream",
    } satisfies CanvasSocketAssetUpload,
  }, {
    timeoutMs: CANVAS_SOCKET_UPLOAD_TIMEOUT_MS,
  });
};

const uploadCanvasAssetViaHttp = async (apiUrl: string, file: File): Promise<CanvasAssetUploadResponse> => {
  const formData = new FormData();
  formData.set("image", file);
  const response = await fetch(`${apiUrl}/api/canvas/assets`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json() as CanvasAssetUploadResponse;
};

const uploadCanvasAsset = async (
  apiUrl: string,
  socketUrl: string,
  file: File,
): Promise<CanvasAssetUploadResponse | null> => {
  if (apiUrl) {
    try {
      return await uploadCanvasAssetViaHttp(apiUrl, file);
    } catch (error) {
      console.warn("HTTP 이미지 업로드 실패, 소켓 업로드로 재시도합니다:", error);
    }
  }
  if (!socketUrl) return null;
  return await uploadCanvasAssetViaSocket(socketUrl, file);
};

const buildCanvasAssetProxyUrl = (apiUrl: string, assetId?: string) => (
  apiUrl && assetId ? `${apiUrl}/api/canvas/assets/${encodeURIComponent(assetId)}` : ""
);

const isCanvasAssetObjectKey = (objectKey?: string) => (
  Boolean(objectKey && objectKey.startsWith("canvas/") && !objectKey.includes(".."))
);

const extractCanvasAssetObjectKeyFromUrl = (url?: string) => {
  if (!url) return "";
  try {
    const parsedUrl = new URL(url);
    const objectKeyParam = parsedUrl.searchParams.get("objectKey") ?? "";
    if (isCanvasAssetObjectKey(objectKeyParam)) {
      return objectKeyParam;
    }
    const objectKey = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    return isCanvasAssetObjectKey(objectKey) ? objectKey : "";
  } catch {
    return "";
  }
};

const buildCanvasAssetObjectKeyProxyUrl = (apiUrl: string, objectKey?: string) => (
  apiUrl && isCanvasAssetObjectKey(objectKey)
    ? `${apiUrl}/api/canvas/assets/by-key?objectKey=${encodeURIComponent(objectKey ?? "")}`
    : ""
);

const resolveCanvasImageUrl = (imageData: SerializableImageElement, apiUrl: string) => (
  buildCanvasAssetProxyUrl(apiUrl, imageData.assetId)
  || buildCanvasAssetObjectKeyProxyUrl(apiUrl, imageData.objectKey)
  || buildCanvasAssetObjectKeyProxyUrl(apiUrl, extractCanvasAssetObjectKeyFromUrl(imageData.url))
  || imageData.url
);

const resolveCanvasImageObjectKey = (imageData: SerializableImageElement) => (
  isCanvasAssetObjectKey(imageData.objectKey)
    ? imageData.objectKey
    : extractCanvasAssetObjectKeyFromUrl(imageData.url)
);

const readFileAsDataUrl = (file: File): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("이미지를 data URL로 읽지 못했습니다."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  })
);

const loadImage = (url: string, signal?: AbortSignal): Promise<HTMLImageElement> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    const handleAbort = () => {
      image.src = "";
      reject(new DOMException("Image load aborted", "AbortError"));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = async () => {
      signal?.removeEventListener("abort", handleAbort);
      try {
        if ("decode" in image) {
          await image.decode();
        }
      } catch {
        // Safari may reject decode for already-loaded images; onload is enough here.
      }
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener("abort", handleAbort);
      reject(new Error(`이미지 로드 실패: ${url}`));
    };
    image.src = url;
  })
);

const serializeCanvasDraft = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  baseRevision?: number,
): CanvasLocalDraft => ({
  lines: drawnLines,
  images: images.map(serializeImage),
  textBoxes,
  updatedAt: Date.now(),
  hasPendingChanges: [...drawnLines, ...images, ...textBoxes].some((item) => item.status && item.status !== "unchanged"),
  baseRevision,
});

let canvasDraftWorker: Worker | null = null;
const canvasDraftWorkerRequests = new Map<string, {
  resolve: (draft: CanvasLocalDraft) => void;
  reject: (error: Error) => void;
}>();

const serializeCanvasDraftInWorker = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  baseRevision?: number,
): Promise<CanvasLocalDraft> => {
  if (typeof Worker === "undefined") {
    return Promise.resolve(serializeCanvasDraft(drawnLines, images, textBoxes, baseRevision));
  }
  if (!canvasDraftWorker) {
    canvasDraftWorker = new Worker(new URL("./canvasDraftWorker.ts", import.meta.url), { type: "module" });
    canvasDraftWorker.onmessage = (event: MessageEvent<{ requestId: string; draft: CanvasLocalDraft }>) => {
      const pending = canvasDraftWorkerRequests.get(event.data.requestId);
      if (!pending) return;
      canvasDraftWorkerRequests.delete(event.data.requestId);
      pending.resolve(event.data.draft);
    };
    canvasDraftWorker.onerror = () => {
      canvasDraftWorkerRequests.forEach(({ reject }) => reject(new Error("캔버스 초안 Worker 처리에 실패했습니다.")));
      canvasDraftWorkerRequests.clear();
      canvasDraftWorker?.terminate();
      canvasDraftWorker = null;
    };
  }

  const requestId = uuidv4();
  return new Promise((resolve, reject) => {
    canvasDraftWorkerRequests.set(requestId, { resolve, reject });
    canvasDraftWorker!.postMessage({
      requestId,
      lines: drawnLines,
      images: images.map(({ image: _image, ...image }) => image),
      textBoxes,
      baseRevision,
    });
  });
};

const readCanvasLocalDraft = (canvasId?: string | null): CanvasLocalDraft | null => {
  return canvasDraftMemory.get(canvasDraftKey(canvasId)) ?? null;
};

const readCanvasLocalDraftPersisted = async (canvasId?: string | null): Promise<CanvasLocalDraft | null> => {
  const memoryDraft = readCanvasLocalDraft(canvasId);
  if (memoryDraft) return memoryDraft;
  try {
    const draft = await readIndexedDbCanvasDraft<CanvasLocalDraft>(canvasDraftKey(canvasId));
    if (!draft || !Array.isArray(draft.lines) || !Array.isArray(draft.images) || !Array.isArray(draft.textBoxes)) {
      return null;
    }
    canvasDraftMemory.set(canvasDraftKey(canvasId), draft);
    return draft;
  } catch (error) {
    console.warn("로컬 캔버스 초안 읽기 실패:", error);
    return null;
  }
};

const removeCanvasLocalDraft = (canvasId: string | null | undefined) => {
  const key = canvasDraftKey(canvasId);
  const timer = canvasDraftTimers.get(key);
  if (timer !== undefined) window.clearTimeout(timer);
  canvasDraftTimers.delete(key);
  canvasDraftMemory.delete(key);
  void removeIndexedDbCanvasDraft(key).catch((error) => console.warn("로컬 캔버스 초안 삭제 실패:", error));
};

const writeCanvasLocalDraft = (
  canvasId: string | null | undefined,
  draft: CanvasLocalDraft,
  options?: { immediate?: boolean },
) => {
  if (!draft.hasPendingChanges) {
    removeCanvasLocalDraft(canvasId);
    return;
  }

  const key = canvasDraftKey(canvasId);
  canvasDraftMemory.set(key, draft);
  const previousTimer = canvasDraftTimers.get(key);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  const persist = () => {
    canvasDraftTimers.delete(key);
    void writeIndexedDbCanvasDraft(key, canvasDraftMemory.get(key) ?? draft)
      .catch((error) => console.warn("로컬 캔버스 초안 저장 실패:", error));
  };
  if (options?.immediate) persist();
  else canvasDraftTimers.set(key, window.setTimeout(persist, CANVAS_DRAFT_WRITE_DELAY_MS));
};

const scheduleCanvasLocalDraft = (
  canvasId: string | null | undefined,
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  baseRevision?: number,
) => {
  const key = canvasDraftKey(canvasId);
  const previousTimer = canvasDraftTimers.get(key);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  canvasDraftTimers.set(key, window.setTimeout(() => {
    canvasDraftTimers.delete(key);
    void serializeCanvasDraftInWorker(drawnLines, images, textBoxes, baseRevision)
      .catch(() => serializeCanvasDraft(drawnLines, images, textBoxes, baseRevision))
      .then((draft) => writeCanvasLocalDraft(canvasId, draft, { immediate: true }));
  }, CANVAS_DRAFT_WRITE_DELAY_MS));
};

const hydrateImageElement = async (
  imageData: SerializableImageElement,
  apiUrl: string,
  signal?: AbortSignal,
): Promise<ImageElement> => {
  const resolvedObjectKey = resolveCanvasImageObjectKey(imageData);
  const preferredUrl = resolveCanvasImageUrl(imageData, apiUrl);
  try {
    const image = await loadImage(preferredUrl, signal);
    return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, url: preferredUrl, image };
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.warn("이미지 로드 실패:", preferredUrl, error);
    const isR2DirectUrl = Boolean(extractCanvasAssetObjectKeyFromUrl(imageData.url));
    if (imageData.url && imageData.url !== preferredUrl && !isR2DirectUrl) {
      try {
        const image = await loadImage(imageData.url, signal);
        return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, image };
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        console.warn("이미지 원본 fallback 로드 실패:", imageData.url, fallbackError);
      }
    }
    return { ...imageData, objectKey: resolvedObjectKey || imageData.objectKey, image: new Image() };
  }
};

const applyServerCanvasStatus = (data: CanvasLoadData): CanvasLocalDraft => ({
  lines: (data.lines ?? []).map((line) => ({ ...line, status: "unchanged" })),
  images: (data.images ?? []).map((image) => ({ ...image, status: "unchanged" })),
  textBoxes: (data.textBoxes ?? []).map((textBox) => ({ ...textBox, status: "unchanged" })),
  updatedAt: Date.now(),
  hasPendingChanges: false,
});

const markLinesSaved = (lines: LineElement[]) => (
  lines
    .filter((line) => line.status !== "deleted")
    .map((line) => ({ ...line, status: "unchanged" as const }))
);

const markImagesSaved = (images: ImageElement[]) => (
  images
    .filter((image) => image.status !== "deleted")
    .map((image) => ({ ...image, status: "unchanged" as const }))
);

const markTextBoxesSaved = (textBoxes: TextBoxElement[]) => (
  textBoxes
    .filter((textBox) => textBox.status !== "deleted")
    .map((textBox) => ({ ...textBox, status: "unchanged" as const }))
);

export const usePersistence = (
  drawnLines: LineElement[],
  images: ImageElement[],
  textBoxes: TextBoxElement[],
  setDrawnLines: SetLines,
  setImages: SetImages,
  setTextBoxes: SetTextBoxes,
  canvasId?: string | null,
  streamCallbacks: CanvasStreamCallbacks = {},
) => {

  const CANVAS_API_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CANVAS_API_URL) || API_CORE_BASE_URL || "";
  const CANVAS_SOCKET_URL = resolveBrowserReachableUrl(import.meta.env.VITE_CANVAS_SOCKET_URL) || API_BASE_URL || CANVAS_API_URL;

  const drawnLinesRef = useRef(drawnLines);
  const imagesRef = useRef(images);
  const textBoxesRef = useRef(textBoxes);
  const linesByIdRef = useRef(new Map<string, LineElement>());
  const imagesByIdRef = useRef(new Map<string, ImageElement>());
  const textBoxesByIdRef = useRef(new Map<string, TextBoxElement>());
  const dirtyLineIdsRef = useRef(new Set<string>());
  const dirtyImageIdsRef = useRef(new Set<string>());
  const dirtyTextBoxIdsRef = useRef(new Set<string>());
  const canvasIdRef = useRef(canvasId);
  const localRevisionRef = useRef(0);
  const serverRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveAgainRequestedRef = useRef(false);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const handleLoadRef = useRef<((trigger?: CanvasLoadTrigger) => Promise<void>) | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const loadAgainRequestedRef = useRef(false);
  const pendingLoadTriggersRef = useRef<CanvasLoadTrigger[]>([]);
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const activeLoadRequestIdRef = useRef<string | null>(null);
  const loadCancelRequestedRef = useRef(false);
  const retryAbortControllerRef = useRef<AbortController | null>(null);
  const retryCancelRequestedRef = useRef(false);
  const pendingSaveTriggersRef = useRef<CanvasSaveTrigger[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const streamedPointsByLineRef = useRef(new Map<string, LineElement["points"]>());
  const streamPointsFrameRef = useRef<number | null>(null);
  const remoteChangeQueueRef = useRef<CanvasChangedEvent[]>([]);
  const streamCallbacksRef = useRef(streamCallbacks);
  const [saveState, setSaveState] = useState<CanvasSaveState>(() => ({
    status: "loading",
    message: "불러오는 중",
    pendingRetries: getCanvasRetryCount(canvasId),
  }));

  useEffect(() => {
    streamCallbacksRef.current = streamCallbacks;
  }, [streamCallbacks]);

  useEffect(() => {
    let active = true;
    void readCanvasOperationQueue<CanvasRetryQueueItem>().then((queue) => {
      if (!active) return;
      canvasRetryQueueMemory = queue.map((item) => ({
        ...item,
        mutationId: item.mutationId || item.id,
        canvasId: item.canvasId ?? null,
        nextAttemptAt: item.nextAttemptAt ?? item.createdAt ?? Date.now(),
        priority: item.priority ?? 40,
      }));
      setSaveState((current) => ({
        ...current,
        pendingRetries: getCanvasRetryCount(canvasIdRef.current),
      }));
    }).catch((error) => console.warn("캔버스 재시도 큐 복원 실패:", error));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    remoteChangeQueueRef.current = [];
    pendingSaveTriggersRef.current = [];
    pendingLoadTriggersRef.current = ["selection"];
    loadAgainRequestedRef.current = true;
  }, [canvasId]);

  useEffect(() => {
    drawnLinesRef.current = drawnLines;
    imagesRef.current = images;
    textBoxesRef.current = textBoxes;
    linesByIdRef.current = new Map(drawnLines.map((line) => [line.id, line]));
    imagesByIdRef.current = new Map(images.map((image) => [image.id, image]));
    textBoxesByIdRef.current = new Map(textBoxes.map((textBox) => [textBox.id, textBox]));
    dirtyLineIdsRef.current = new Set(drawnLines.filter((line) => line.status && line.status !== "unchanged").map((line) => line.id));
    dirtyImageIdsRef.current = new Set(images.filter((image) => image.status && image.status !== "unchanged").map((image) => image.id));
    dirtyTextBoxIdsRef.current = new Set(textBoxes.filter((textBox) => textBox.status && textBox.status !== "unchanged").map((textBox) => textBox.id));
    canvasIdRef.current = canvasId;
    localRevisionRef.current += 1;
    scheduleCanvasLocalDraft(canvasId, drawnLines, images, textBoxes, serverRevisionRef.current);

    const hasDirtyElements = dirtyLineIdsRef.current.size + dirtyImageIdsRef.current.size + dirtyTextBoxIdsRef.current.size > 0;
    const pendingRetries = getCanvasRetryCount(canvasId);
    if (hasDirtyElements) {
      setSaveState((current) => ({
        ...current,
        status: current.status === "saving" || current.status === "retrying" ? current.status : "pending",
        message: current.status === "saving" || current.status === "retrying" ? current.message : "저장할 변경 있음",
        pendingRetries,
      }));
      return;
    }

    setSaveState((current) => ({
      ...current,
      status: pendingRetries > 0 && current.status !== "saving" && current.status !== "retrying" ? "failed" : current.status,
      message: pendingRetries > 0 && current.status !== "saving" && current.status !== "retrying" ? "재시도 대기" : current.message,
      pendingRetries,
    }));
  }, [canvasId, drawnLines, images, textBoxes]);

  const buildCurrentSavePayload = useCallback((): CanvasSavePayload => {
    const payload: CanvasSavePayload = {
      addedLines: [], modifiedLines: [], deletedLines: [],
      addedImages: [], modifiedImages: [], deletedImages: [],
      addedTextBoxes: [], modifiedTextBoxes: [], deletedTextBoxes: [],
    };
    dirtyLineIdsRef.current.forEach((id) => {
      const line = linesByIdRef.current.get(id);
      if (!line) return;
      if (line.status === "new") payload.addedLines!.push(serializeLine(line));
      else if (line.status === "modified") payload.modifiedLines!.push(serializeLine(line));
      else if (line.status === "deleted") payload.deletedLines!.push(buildDeletedElement(line));
    });
    dirtyImageIdsRef.current.forEach((id) => {
      const image = imagesByIdRef.current.get(id);
      if (!image) return;
      if (image.status === "new") payload.addedImages!.push(serializeImage(image));
      else if (image.status === "modified") payload.modifiedImages!.push(serializeImage(image));
      else if (image.status === "deleted") payload.deletedImages!.push(buildDeletedElement(image));
    });
    dirtyTextBoxIdsRef.current.forEach((id) => {
      const textBox = textBoxesByIdRef.current.get(id);
      if (!textBox) return;
      if (textBox.status === "new") payload.addedTextBoxes!.push(serializeTextBox(textBox));
      else if (textBox.status === "modified") payload.modifiedTextBoxes!.push(serializeTextBox(textBox));
      else if (textBox.status === "deleted") payload.deletedTextBoxes!.push(buildDeletedElement(textBox));
    });
    return payload;
  }, []);

  const applyCanvasDraft = useCallback(async (
    draft: CanvasLocalDraft,
    targetCanvasId: string | null,
    signal?: AbortSignal,
  ) => {
    if (signal?.aborted || canvasIdRef.current !== targetCanvasId) return false;
    const imagePlaceholders = draft.images.map((image) => ({ ...image, image: new Image() }));
    setDrawnLines(draft.lines);
    setTextBoxes(draft.textBoxes);
    setImages(imagePlaceholders);

    await Promise.all(draft.images.map(async (imageData) => {
      const hydratedImage = await hydrateImageElement(imageData, CANVAS_API_URL, signal);
      if (signal?.aborted || canvasIdRef.current !== targetCanvasId) return;
      setImages((current) => current.map((image) => (
        image.id === hydratedImage.id ? hydratedImage : image
      )));
    }));
    if (signal?.aborted || canvasIdRef.current !== targetCanvasId) return false;
    return true;
  }, [CANVAS_API_URL, setDrawnLines, setImages, setTextBoxes]);

  const commitSavedCanvasState = useCallback(() => {
    const savedLines = markLinesSaved(drawnLinesRef.current);
    const savedImages = markImagesSaved(imagesRef.current);
    const savedTextBoxes = markTextBoxesSaved(textBoxesRef.current);

    drawnLinesRef.current = savedLines;
    imagesRef.current = savedImages;
    textBoxesRef.current = savedTextBoxes;

    setDrawnLines(savedLines);
    setImages(savedImages);
    setTextBoxes(savedTextBoxes);
    writeCanvasLocalDraft(canvasIdRef.current, serializeCanvasDraft(
      savedLines, savedImages, savedTextBoxes, serverRevisionRef.current,
    ));
  }, [setDrawnLines, setImages, setTextBoxes]);

  const fetchCanvasData = useCallback(async (
    targetCanvasId: string | null,
    requestId: string,
    trigger: CanvasLoadTrigger,
    signal: AbortSignal,
  ): Promise<CanvasLoadData> => {
    if (!CANVAS_SOCKET_URL) throw new Error("캔버스 소켓 URL이 설정되지 않았습니다.");
    const data = await emitCanvasSocket<CanvasLoadData>(CANVAS_SOCKET_URL, "canvas:load", {
      authorization: authHeaders().Authorization,
      canvasId: targetCanvasId,
      requestId,
      trigger,
    }, {
      signal,
      timeoutMs: CANVAS_SOCKET_LOAD_TIMEOUT_MS,
    });
    return normalizeCanvasLoadData(data);
  }, [CANVAS_SOCKET_URL]);

  const hasPendingLocalChanges = useCallback(() => {
    const payload = buildCurrentSavePayload();
    return hasCanvasSavePayloadChanges(payload) || getCanvasRetryCount(canvasIdRef.current) > 0;
  }, [buildCurrentSavePayload]);

  const drainRemoteChangeQueue = useCallback(() => {
    if (saveInFlightRef.current || hasPendingLocalChanges()) return false;
    let nextEvent = remoteChangeQueueRef.current.shift();
    while (nextEvent && typeof nextEvent.revision === "number" && nextEvent.revision <= serverRevisionRef.current) {
      nextEvent = remoteChangeQueueRef.current.shift();
    }
    if (!nextEvent) return false;

    streamCallbacksRef.current.onRemoteCanvasChanged?.(nextEvent);
    void handleLoadRef.current?.("remote");
    return true;
  }, [hasPendingLocalChanges]);

  const retryPendingSaves = useCallback(async (options?: { skipInFlightGuard?: boolean }) => {
    if (!CANVAS_SOCKET_URL) return;

    if (!options?.skipInFlightGuard) {
      pendingSaveTriggersRef.current = enqueueUniqueByPriority(
        pendingSaveTriggersRef.current, "retry", SAVE_TRIGGER_PRIORITY,
      );
    }

    if (!options?.skipInFlightGuard) {
      if (saveInFlightRef.current) {
        saveAgainRequestedRef.current = true;
        return;
      }
      saveInFlightRef.current = true;
    }

    try {
      const targetCanvasId = canvasIdRef.current ?? null;
      const now = Date.now();
      const queue = readCanvasRetryQueue()
        .filter((item) => item.canvasId === targetCanvasId && item.nextAttemptAt <= now)
        .sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt)
        .slice(0, 1);
      if (queue.length === 0) {
        const pendingRetries = getCanvasRetryCount(targetCanvasId);
        setSaveState((current) => ({
          ...current,
          pendingRetries,
          status: pendingRetries > 0 ? "failed" : current.status === "failed" ? "idle" : "saved",
          message: pendingRetries > 0 ? "재시도 대기" : current.status === "failed" ? "저장 대기" : "저장 완료",
          lastSavedAt: pendingRetries > 0 || current.status === "failed" ? current.lastSavedAt : Date.now(),
        }));
        return;
      }

      setSaveState((current) => ({
        ...current,
        status: "retrying",
        message: "재시도 중",
        pendingRetries: queue.length,
      }));

      retryCancelRequestedRef.current = false;
      const retryAbortController = new AbortController();
      retryAbortControllerRef.current = retryAbortController;
      const revisionAtRetryStart = localRevisionRef.current;
      let failedCount = 0;
      for (const item of queue) {
        if (retryCancelRequestedRef.current || retryAbortController.signal.aborted) break;
        const currentPayload = buildCurrentSavePayload();
        const hasChangesAfterQueuedMutation = JSON.stringify(currentPayload) !== JSON.stringify(item.payload);
        updateCanvasRetryQueueItem(item.id, { lastError: undefined });
        const payloadToSave = hasChangesAfterQueuedMutation ? currentPayload : item.payload;
        const mutationIdToSave = hasChangesAfterQueuedMutation ? uuidv4() : item.mutationId;

        if (!hasCanvasSavePayloadChanges(payloadToSave)) {
          removeCanvasRetryQueueItem(item.id);
          continue;
        }

        if (hasChangesAfterQueuedMutation) {
          updateCanvasRetryQueueItem(item.id, {
            mutationId: mutationIdToSave,
            payload: payloadToSave,
            priority: Math.max(item.priority ?? 40, SAVE_TRIGGER_PRIORITY.retry),
          });
        }

        try {
          const response = await saveCanvasPayload(CANVAS_SOCKET_URL, item.canvasId, payloadToSave, mutationIdToSave, "retry", {
            signal: retryAbortController.signal,
          });
          serverRevisionRef.current = response.revision;
          removeCanvasRetryQueueItem(item.id);
        } catch (error) {
          if (retryCancelRequestedRef.current || isAbortError(error)) break;
          failedCount += 1;
          updateCanvasRetryQueueItem(item.id, {
            attempts: item.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
            nextAttemptAt: Date.now() + Math.min(300_000, 2 ** Math.min(item.attempts + 1, 8) * 1000),
          });
        }
      }

      const remainingRetries = getCanvasRetryCount(targetCanvasId);
      if (retryCancelRequestedRef.current || retryAbortController.signal.aborted) {
        setSaveState((current) => ({
          ...current,
          status: "idle",
          message: "재시도 취소됨",
          pendingRetries: remainingRetries,
        }));
        return;
      }

      if (failedCount > 0) {
        setSaveState((current) => ({
          ...current,
          status: "failed",
          message: "저장 실패",
          pendingRetries: remainingRetries,
          lastErrorAt: Date.now(),
        }));
        return;
      }

      if (saveAgainRequestedRef.current || localRevisionRef.current !== revisionAtRetryStart) {
        saveAgainRequestedRef.current = true;
        setSaveState((current) => ({
          ...current,
          status: "pending",
          message: "저장할 변경 있음",
          pendingRetries: remainingRetries,
        }));
        return;
      }

      commitSavedCanvasState();

      setSaveState((current) => ({
        ...current,
        status: "saved",
        message: "저장 완료",
        pendingRetries: remainingRetries,
        lastSavedAt: Date.now(),
      }));
      void publishSyncEvent("canvas", "canvas-saved");
    } finally {
      retryAbortControllerRef.current = null;
      if (!options?.skipInFlightGuard) {
        saveInFlightRef.current = false;
        drainRemoteChangeQueue();
        if (saveAgainRequestedRef.current && !retryCancelRequestedRef.current) {
          saveAgainRequestedRef.current = false;
          window.setTimeout(() => {
            void handleSaveRef.current?.();
          }, 0);
        }
      }
    }
  }, [CANVAS_SOCKET_URL, buildCurrentSavePayload, commitSavedCanvasState, drainRemoteChangeQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!navigator.onLine || saveInFlightRef.current) return;
      const hasDueRetry = readCanvasRetryQueue().some((item) => (
        item.canvasId === (canvasIdRef.current ?? null) && item.nextAttemptAt <= Date.now()
      ));
      if (hasDueRetry) void retryPendingSaves();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [retryPendingSaves]);

  const handleSave = useCallback(async (trigger: CanvasSaveTrigger = "manual") => {
    if (!CANVAS_SOCKET_URL) {
      console.warn("캔버스 소켓 URL이 설정되지 않아 저장을 건너뜁니다.");
      return;
    }

    pendingSaveTriggersRef.current = enqueueUniqueByPriority(
      pendingSaveTriggersRef.current, trigger, SAVE_TRIGGER_PRIORITY,
    );

    if (saveInFlightRef.current) {
      saveAgainRequestedRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setSaveState((current) => ({
      ...current,
      status: "saving",
      message: "저장 중",
      pendingRetries: getCanvasRetryCount(canvasIdRef.current),
    }));

    let activeMutation: { mutationId: string; payload: CanvasSavePayload } | null = null;
    try {
      do {
        saveAgainRequestedRef.current = false;
        const currentTrigger = pendingSaveTriggersRef.current.shift() ?? trigger;

        if (getCanvasRetryCount(canvasIdRef.current) > 0) {
          await retryPendingSaves({ skipInFlightGuard: true });
          if (getCanvasRetryCount(canvasIdRef.current) > 0) return;
          if (saveAgainRequestedRef.current) continue;
        }

        const payload = buildCurrentSavePayload();
        if (!hasCanvasSavePayloadChanges(payload)) {
          return;
        }

        const revisionAtSaveStart = localRevisionRef.current;
        const mutationId = uuidv4();
        activeMutation = { mutationId, payload };
        const response = await saveCanvasPayload(CANVAS_SOCKET_URL, canvasIdRef.current, payload, mutationId, currentTrigger);
        serverRevisionRef.current = response.revision;
        activeMutation = null;

        if (localRevisionRef.current !== revisionAtSaveStart) {
          saveAgainRequestedRef.current = true;
          continue;
        }

        void publishSyncEvent("canvas", "canvas-saved");
        commitSavedCanvasState();
        clearCanvasRetryQueue(canvasIdRef.current);
        setSaveState((current) => ({
          ...current,
          status: "saved",
          message: "저장 완료",
          pendingRetries: getCanvasRetryCount(canvasIdRef.current),
          lastSavedAt: Date.now(),
        }));
      } while (saveAgainRequestedRef.current);
    } catch (err) {
      console.error("저장 실패:", err);
      void appendCanvasDeviceDiagnostic({
        id: uuidv4(),
        operation: "SAVE",
        canvasId: canvasIdRef.current ?? null,
        message: err instanceof Error ? err.message : String(err),
        createdAt: Date.now(),
      });
      const payload = activeMutation?.payload
        ?? buildCurrentSavePayload();
      if (hasCanvasSavePayloadChanges(payload)) {
        addCanvasRetryQueueItem(
          canvasIdRef.current,
          payload,
          err instanceof Error ? err.message : String(err),
          activeMutation?.mutationId,
          SAVE_TRIGGER_PRIORITY[trigger],
        );
      }
      setSaveState((current) => ({
        ...current,
        status: "failed",
        message: "저장 실패",
        pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        lastErrorAt: Date.now(),
      }));
    } finally {
      saveInFlightRef.current = false;
      drainRemoteChangeQueue();
    }
  }, [CANVAS_SOCKET_URL, buildCurrentSavePayload, commitSavedCanvasState, drainRemoteChangeQueue, retryPendingSaves]);

  handleSaveRef.current = handleSave;

  const requestSave = useCallback(() => {
    if (!CANVAS_SOCKET_URL) return;

    const payload = buildCurrentSavePayload();
    if (!hasCanvasSavePayloadChanges(payload) && getCanvasRetryCount(canvasIdRef.current) === 0) return;

    setSaveState((current) => ({
      ...current,
      status: current.status === "saving" || current.status === "retrying" ? current.status : "pending",
      message: current.status === "saving" || current.status === "retrying" ? current.message : "저장 중",
      pendingRetries: getCanvasRetryCount(canvasIdRef.current),
    }));

    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void handleSave("auto");
    }, 800);
  }, [CANVAS_SOCKET_URL, buildCurrentSavePayload, handleSave]);

  const cancelPendingSaves = useCallback(() => {
    retryCancelRequestedRef.current = true;
    retryAbortControllerRef.current?.abort();
    clearCanvasRetryQueue(canvasIdRef.current);
    saveAgainRequestedRef.current = false;

    setSaveState((current) => ({
      ...current,
      status: "idle",
      message: "재시도 취소됨",
      pendingRetries: getCanvasRetryCount(canvasIdRef.current),
    }));
  }, []);

  const handleFlushSave = useCallback(() => {
    if (!CANVAS_SOCKET_URL) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    writeCanvasLocalDraft(canvasIdRef.current, serializeCanvasDraft(
      drawnLinesRef.current, imagesRef.current, textBoxesRef.current, serverRevisionRef.current,
    ), { immediate: true });
    const payload = buildCurrentSavePayload();
    if (!hasCanvasSavePayloadChanges(payload)) return;

    addCanvasRetryQueueItem(canvasIdRef.current, payload, undefined, undefined, SAVE_TRIGGER_PRIORITY.flush);
    setSaveState((current) => ({
      ...current,
      status: "saving",
      message: "저장 중",
      pendingRetries: getCanvasRetryCount(canvasIdRef.current),
    }));

    void handleSave("flush");
  }, [CANVAS_SOCKET_URL, buildCurrentSavePayload, handleSave]);


  const performLoad = useCallback(async (
    targetCanvasId: string | null,
    requestId: string,
    trigger: CanvasLoadTrigger,
    signal: AbortSignal,
  ) => {
    const localDraft = await readCanvasLocalDraftPersisted(targetCanvasId);
    try {
      if (canvasIdRef.current !== targetCanvasId) return;
      setSaveState((current) => ({
        ...current,
        status: "loading",
        message: "불러오는 중",
        pendingRetries: getCanvasRetryCount(canvasIdRef.current),
      }));

      if (!CANVAS_SOCKET_URL) {
        console.warn("캔버스 소켓 URL이 설정되지 않아 빈 캔버스를 사용합니다.");
        if (localDraft) {
          await applyCanvasDraft(localDraft, targetCanvasId, signal);
          if (canvasIdRef.current !== targetCanvasId) return;
          setSaveState((current) => ({
            ...current,
            status: localDraft.hasPendingChanges ? "pending" : "idle",
            message: localDraft.hasPendingChanges ? "저장할 변경 있음" : "저장 대기",
            pendingRetries: getCanvasRetryCount(canvasIdRef.current),
          }));
          return;
        }
        setDrawnLines([]);
        setImages([]);
        setTextBoxes([]);
        setSaveState((current) => ({
          ...current,
          status: "idle",
          message: "저장 대기",
          pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        }));
        return;
      }

      const data = await fetchCanvasData(targetCanvasId, requestId, trigger, signal);
      if (canvasIdRef.current !== targetCanvasId) return;
      console.log("불러온 데이터:", data);

      const remoteRevision = typeof data.revision === "number" ? data.revision : 0;
      const draftConflictsWithRemote = Boolean(
        localDraft?.hasPendingChanges
        && localDraft.baseRevision != null
        && remoteRevision > localDraft.baseRevision,
      );
      serverRevisionRef.current = remoteRevision;

      if (localDraft?.hasPendingChanges) {
        await applyCanvasDraft(localDraft, targetCanvasId, signal);
        if (canvasIdRef.current !== targetCanvasId) return;
        setSaveState((current) => ({
          ...current,
          status: draftConflictsWithRemote ? "failed" : "pending",
          message: draftConflictsWithRemote ? "다른 기기의 변경과 충돌" : "저장할 변경 있음",
          pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        }));
        return;
      }

      await applyCanvasDraft(applyServerCanvasStatus(data), targetCanvasId, signal);
      if (canvasIdRef.current !== targetCanvasId) return;
      const partialLoad = data.loadStatus === "PARTIAL";
      setSaveState((current) => ({
        ...current,
        status: partialLoad || getCanvasRetryCount(canvasIdRef.current) > 0 ? "failed" : "saved",
        message: partialLoad
          ? data.loadWarnings?.[0] ?? "일부 요소 불러오기 실패"
          : getCanvasRetryCount(canvasIdRef.current) > 0 ? "재시도 대기" : "저장 완료",
        pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        lastSavedAt: Date.now(),
      }));
      void retryPendingSaves();

      console.log("캔버스 데이터 로드 및 적용 완료.");
      window.setTimeout(() => drainRemoteChangeQueue(), 0);
    } catch (error) {
      if (isAbortError(error)) {
        if (loadCancelRequestedRef.current && canvasIdRef.current === targetCanvasId) {
          setSaveState((current) => ({
            ...current,
            status: "idle",
            message: "불러오기 취소됨",
            pendingRetries: getCanvasRetryCount(canvasIdRef.current),
          }));
        }
        return;
      }
      console.error("불러오기 실패:", error);
      void appendCanvasDeviceDiagnostic({
        id: uuidv4(),
        operation: "LOAD",
        canvasId: targetCanvasId,
        message: error instanceof Error ? error.message : String(error),
        createdAt: Date.now(),
      });
      if (canvasIdRef.current !== targetCanvasId) return;
      const failureMessage = getCanvasLoadFailureMessage(error);
      if (localDraft) {
        await applyCanvasDraft(localDraft, targetCanvasId, signal);
        if (canvasIdRef.current !== targetCanvasId) return;
        setSaveState((current) => ({
          ...current,
          status: localDraft.hasPendingChanges ? "pending" : "failed",
          message: localDraft.hasPendingChanges ? "저장할 변경 있음" : failureMessage,
          pendingRetries: getCanvasRetryCount(canvasIdRef.current),
          lastErrorAt: Date.now(),
        }));
        return;
      }
      setDrawnLines([]);
      setImages([]);
      setTextBoxes([]);
      setSaveState((current) => ({
        ...current,
        status: "failed",
        message: failureMessage,
        pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        lastErrorAt: Date.now(),
      }));
    }
  }, [CANVAS_SOCKET_URL, applyCanvasDraft, drainRemoteChangeQueue, fetchCanvasData, retryPendingSaves, setDrawnLines, setImages, setTextBoxes]);

  const cancelActiveLoadRequest = useCallback((userRequested: boolean) => {
    if (userRequested) {
      loadCancelRequestedRef.current = true;
      loadAgainRequestedRef.current = false;
      pendingLoadTriggersRef.current = [];
    }
    const requestId = activeLoadRequestIdRef.current;
    loadAbortControllerRef.current?.abort();
    if (CANVAS_SOCKET_URL && requestId) {
      getCanvasSocket(CANVAS_SOCKET_URL).emit("canvas:load-cancel", { requestId });
    }
  }, [CANVAS_SOCKET_URL]);

  const cancelCanvasLoad = useCallback(() => {
    cancelActiveLoadRequest(true);
  }, [cancelActiveLoadRequest]);

  useEffect(() => () => {
    cancelActiveLoadRequest(false);
  }, [cancelActiveLoadRequest]);

  const handleLoad = useCallback((trigger: CanvasLoadTrigger = "manual"): Promise<void> => {
    pendingLoadTriggersRef.current = enqueueUniqueByPriority(
      pendingLoadTriggersRef.current, trigger, LOAD_TRIGGER_PRIORITY,
    );
    loadAgainRequestedRef.current = true;
    loadCancelRequestedRef.current = false;
    if (loadInFlightRef.current) {
      if (trigger === "selection") cancelActiveLoadRequest(false);
      return loadInFlightRef.current;
    }

    const loadPromise = (async () => {
      do {
        loadAgainRequestedRef.current = false;
        const currentTrigger = pendingLoadTriggersRef.current.shift() ?? trigger;
        const targetCanvasId = canvasIdRef.current ?? null;
        const requestId = uuidv4();
        const abortController = new AbortController();
        activeLoadRequestIdRef.current = requestId;
        loadAbortControllerRef.current = abortController;
        try {
          await performLoad(targetCanvasId, requestId, currentTrigger, abortController.signal);
        } finally {
          if (activeLoadRequestIdRef.current === requestId) {
            activeLoadRequestIdRef.current = null;
            loadAbortControllerRef.current = null;
          }
        }
        if (canvasIdRef.current !== targetCanvasId) {
          loadAgainRequestedRef.current = true;
        }
        if (pendingLoadTriggersRef.current.length > 0) {
          loadAgainRequestedRef.current = true;
        }
      } while (loadAgainRequestedRef.current && !loadCancelRequestedRef.current);
    })().finally(() => {
      loadInFlightRef.current = null;
    });

    loadInFlightRef.current = loadPromise;
    return loadPromise;
  }, [cancelActiveLoadRequest, performLoad]);

  handleLoadRef.current = handleLoad;

  useEffect(() => {
    if (!CANVAS_SOCKET_URL || !canvasId) return undefined;

    let isActive = true;
    const socket = getCanvasSocket(CANVAS_SOCKET_URL);
    const handleRemoteCanvasChanged = (event: CanvasChangedEvent) => {
      if (!isActive || event?.canvasId !== canvasIdRef.current) return;

      remoteChangeQueueRef.current = [...remoteChangeQueueRef.current, event].slice(-50);

      if (saveInFlightRef.current || hasPendingLocalChanges()) {
        setSaveState((current) => ({
          ...current,
          status: current.status === "saving" || current.status === "retrying" ? current.status : "pending",
          message: current.status === "saving" || current.status === "retrying" ? current.message : "원격 변경 대기",
          pendingRetries: getCanvasRetryCount(canvasIdRef.current),
        }));
        return;
      }

      drainRemoteChangeQueue();
    };

    const handleRemoteLineStart = (event: CanvasLineStreamStartEvent) => {
      if (!isActive || event?.canvasId !== canvasIdRef.current) return;
      streamCallbacksRef.current.onLineStreamStart?.(event);
    };
    const handleRemoteLinePoints = (event: CanvasLineStreamPointsEvent) => {
      if (!isActive || event?.canvasId !== canvasIdRef.current) return;
      streamCallbacksRef.current.onLineStreamPoints?.(event);
    };
    const handleRemoteLineEnd = (event: CanvasLineStreamEndEvent) => {
      if (!isActive || event?.canvasId !== canvasIdRef.current) return;
      streamCallbacksRef.current.onLineStreamEnd?.(event);
    };

    socket.on("canvas:changed", handleRemoteCanvasChanged);
    socket.on("canvas:line-start", handleRemoteLineStart);
    socket.on("canvas:line-points", handleRemoteLinePoints);
    socket.on("canvas:line-end", handleRemoteLineEnd);
    void emitCanvasSocket(CANVAS_SOCKET_URL, "canvas:join", {
      authorization: authHeaders().Authorization,
      canvasId,
    }).catch((error) => {
      console.warn("캔버스 실시간 동기화 참여 실패:", error);
    });

    return () => {
      isActive = false;
      socket.off("canvas:changed", handleRemoteCanvasChanged);
      socket.off("canvas:line-start", handleRemoteLineStart);
      socket.off("canvas:line-points", handleRemoteLinePoints);
      socket.off("canvas:line-end", handleRemoteLineEnd);
      socket.emit("canvas:leave", {
        authorization: authHeaders().Authorization,
        canvasId,
      });
    };
  }, [CANVAS_SOCKET_URL, canvasId, drainRemoteChangeQueue, hasPendingLocalChanges]);

  const streamLineStart = useCallback((line: Omit<LineElement, "status">) => {
    if (!CANVAS_SOCKET_URL || !canvasIdRef.current) return;
    getCanvasSocket(CANVAS_SOCKET_URL).emit("canvas:line-start", {
      authorization: authHeaders().Authorization,
      canvasId: canvasIdRef.current,
      line,
    });
  }, [CANVAS_SOCKET_URL]);

  const flushStreamLinePoints = useCallback((lineId?: string) => {
    if (!CANVAS_SOCKET_URL || !canvasIdRef.current) return;
    const entries = lineId
      ? [[lineId, streamedPointsByLineRef.current.get(lineId) ?? []] as const]
      : [...streamedPointsByLineRef.current.entries()];
    entries.forEach(([targetLineId, points]) => {
      if (points.length === 0) return;
      streamedPointsByLineRef.current.delete(targetLineId);
      getCanvasSocket(CANVAS_SOCKET_URL).emit("canvas:line-points", {
        authorization: authHeaders().Authorization,
        canvasId: canvasIdRef.current,
        lineId: targetLineId,
        points,
      });
    });
  }, [CANVAS_SOCKET_URL]);

  const streamLinePoints = useCallback((lineId: string, points: LineElement["points"]) => {
    if (!CANVAS_SOCKET_URL || !canvasIdRef.current || points.length === 0) return;
    const pending = streamedPointsByLineRef.current.get(lineId) ?? [];
    streamedPointsByLineRef.current.set(lineId, [...pending, ...points]);
    if (streamPointsFrameRef.current !== null) return;
    streamPointsFrameRef.current = window.requestAnimationFrame(() => {
      streamPointsFrameRef.current = null;
      flushStreamLinePoints();
    });
  }, [CANVAS_SOCKET_URL, flushStreamLinePoints]);

  const streamLineEnd = useCallback((line: Omit<LineElement, "status">) => {
    if (!CANVAS_SOCKET_URL || !canvasIdRef.current) return;
    flushStreamLinePoints(line.id);
    getCanvasSocket(CANVAS_SOCKET_URL).emit("canvas:line-end", {
      authorization: authHeaders().Authorization,
      canvasId: canvasIdRef.current,
      lineId: line.id,
      line,
    });
  }, [CANVAS_SOCKET_URL, flushStreamLinePoints]);

  useEffect(() => () => {
    if (streamPointsFrameRef.current !== null) window.cancelAnimationFrame(streamPointsFrameRef.current);
    flushStreamLinePoints();
  }, [flushStreamLinePoints]);


  const addImageFile = useCallback(async (
    file: File,
    placementCenter?: { x: number; y: number },
  ) => {
    if (!file) return;

    try {
      const uploadedAsset = await uploadCanvasAsset(CANVAS_API_URL, CANVAS_SOCKET_URL, file);
      const uploadedAssetUrl = buildCanvasAssetProxyUrl(CANVAS_API_URL, uploadedAsset?.id);
      const imageUrl = uploadedAssetUrl || uploadedAsset?.url || await readFileAsDataUrl(file);
      let normalizedImageUrl = imageUrl;
      let img: HTMLImageElement;
      try {
        img = await loadImage(imageUrl);
      } catch (error) {
        const fallbackUrl = buildCanvasAssetProxyUrl(CANVAS_API_URL, uploadedAsset?.id);
        if (!fallbackUrl) throw error;
        img = await loadImage(fallbackUrl);
        normalizedImageUrl = fallbackUrl;
      }
      const imgElement: ImageElement = {
        id: uuidv4(), // 이미지에도 고유 ID 부여
        image: img,
        url: normalizedImageUrl,
        assetId: uploadedAsset?.id,
        objectKey: uploadedAsset?.objectKey,
        contentType: uploadedAsset?.contentType,
        byteSize: uploadedAsset?.byteSize,
        x: 0,
        y: 0,
        width: img.width * 0.5,
        height: img.height * 0.5,
        status: 'new' // 새로 추가된 상태
      };
      const center = placementCenter ?? { x: 100 + imgElement.width / 2, y: 100 + imgElement.height / 2 };
      imgElement.x = center.x - imgElement.width / 2;
      imgElement.y = center.y - imgElement.height / 2;
      setImages(prev => [...prev, imgElement]);
    } catch (err) {
      console.error("업로드 실패:", err);
      // alert("이미지 업로드 실패");
    }
  }, [CANVAS_API_URL, CANVAS_SOCKET_URL, setImages]);

  const handleImageUpload = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    placementCenter?: { x: number; y: number },
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addImageFile(file, placementCenter);
    e.target.value = "";
  }, [addImageFile]);

  return {
    handleSave,
    requestSave,
    handleLoad,
    cancelCanvasLoad,
    handleImageUpload,
    addImageFile,
    handleFlushSave,
    retryPendingSaves,
    cancelPendingSaves,
    saveState,
    streamLineStart,
    streamLinePoints,
    streamLineEnd,
  };
};
