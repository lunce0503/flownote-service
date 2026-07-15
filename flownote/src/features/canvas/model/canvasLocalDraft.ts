import { v4 as uuidv4 } from 'uuid';
import type { LineElement, ImageElement, TextBoxElement, CanvasSavePayload } from '@/entities/canvas';
import {
  readCanvasDraft as readIndexedDbCanvasDraft,
  removeCanvasDraft as removeIndexedDbCanvasDraft,
  writeCanvasDraft as writeIndexedDbCanvasDraft,
  writeCanvasOperationQueue,
} from './canvasIndexedDb';
import { serializeImage, type CanvasLocalDraft } from './canvasPersistenceModel';

export type CanvasRetryQueueItem = {
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

let canvasRetryQueueMemory: CanvasRetryQueueItem[] = [];
const canvasDraftMemory = new Map<string, CanvasLocalDraft>();
const canvasDraftTimers = new Map<string, number>();
const CANVAS_DRAFT_WRITE_DELAY_MS = 1_500;
const canvasDraftKey = (canvasId?: string | null) => canvasId ?? "default";

// IndexedDB에서 복원한 큐를 메모리 큐와 병합한다. 복원이 끝나기 전에 이번 세션에서
// 이미 실패 항목이 쌓였을 수 있으므로(느린 기기에서 실제 발생) 덮어쓰지 않고,
// 캔버스별 1항목 불변식에 따라 같은 캔버스는 더 최신인 메모리 항목을 우선한다.
export const hydrateCanvasRetryQueue = (persistedQueue: CanvasRetryQueueItem[]) => {
  const memoryQueue = canvasRetryQueueMemory;
  if (memoryQueue.length === 0) {
    canvasRetryQueueMemory = persistedQueue;
    return;
  }
  const memoryCanvasKeys = new Set(memoryQueue.map((item) => item.canvasId));
  const restored = persistedQueue.filter((item) => !memoryCanvasKeys.has(item.canvasId));
  writeCanvasRetryQueue([...restored, ...memoryQueue]);
};

export const readCanvasRetryQueue = (): CanvasRetryQueueItem[] => {
  return canvasRetryQueueMemory;
};

const writeCanvasRetryQueue = (queue: CanvasRetryQueueItem[]) => {
  canvasRetryQueueMemory = queue;
  void writeCanvasOperationQueue(queue).catch((error) => {
    console.warn("캔버스 재시도 큐 IndexedDB 저장 실패:", error);
  });
};

export const getCanvasRetryCount = (canvasId?: string | null) => (
  readCanvasRetryQueue().filter((item) => item.canvasId === (canvasId ?? null)).length
);

export const addCanvasRetryQueueItem = (
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
      // 새 payload는 이전 실패의 백오프를 상속하지 않는다(최대 5분 지연 방지).
      attempts: payloadChanged ? 0 : existingItem.attempts,
      nextAttemptAt: payloadChanged ? Date.now() : existingItem.nextAttemptAt,
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

// 소켓 재연결 직후처럼 실패 원인이 사라졌을 때 백오프를 무시하고 즉시 재시도 대상으로 만든다.
export const resetCanvasRetryBackoff = (canvasId?: string | null) => {
  const target = canvasId ?? null;
  writeCanvasRetryQueue(readCanvasRetryQueue().map((item) => (
    item.canvasId === target ? { ...item, nextAttemptAt: Date.now() } : item
  )));
};

export const removeCanvasRetryQueueItem = (id: string) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().filter((item) => item.id !== id));
};

export const clearCanvasRetryQueue = (canvasId?: string | null) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().filter((item) => item.canvasId !== (canvasId ?? null)));
};

export const updateCanvasRetryQueueItem = (id: string, patch: Partial<CanvasRetryQueueItem>) => {
  writeCanvasRetryQueue(readCanvasRetryQueue().map((item) => (
    item.id === id ? { ...item, ...patch } : item
  )));
};

export const serializeCanvasDraft = (
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

export const serializeCanvasDraftInWorker = (
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

export const readCanvasLocalDraft = (canvasId?: string | null): CanvasLocalDraft | null => {
  return canvasDraftMemory.get(canvasDraftKey(canvasId)) ?? null;
};

export const readCanvasLocalDraftPersisted = async (canvasId?: string | null): Promise<CanvasLocalDraft | null> => {
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

export const removeCanvasLocalDraft = (canvasId: string | null | undefined) => {
  const key = canvasDraftKey(canvasId);
  const timer = canvasDraftTimers.get(key);
  if (timer !== undefined) window.clearTimeout(timer);
  canvasDraftTimers.delete(key);
  canvasDraftMemory.delete(key);
  void removeIndexedDbCanvasDraft(key).catch((error) => console.warn("로컬 캔버스 초안 삭제 실패:", error));
};

export const writeCanvasLocalDraft = (
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

export const scheduleCanvasLocalDraft = (
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
