import { useCallback, useEffect, useRef, useState } from 'react';
import type { LineElement, ImageElement, TextBoxElement, CanvasLoadData, CanvasSavePayload } from '@/entities/canvas';
import { v4 as uuidv4 } from 'uuid';
import { API_BASE_URL, API_CORE_BASE_URL, authHeaders, resolveBrowserReachableUrl } from '@/shared/api';
import { publishSyncEvent } from '@/shared/lib/sync';
import { appendCanvasDeviceDiagnostic, readCanvasOperationQueue } from './canvasIndexedDb';
import {
  SAVE_TRIGGER_PRIORITY,
  LOAD_TRIGGER_PRIORITY,
  enqueueUniqueByPriority,
  normalizeCanvasLoadData,
  serializeLine,
  serializeImage,
  serializeTextBox,
  buildDeletedElement,
  hasCanvasSavePayloadChanges,
  isAbortError,
  getCanvasLoadFailureMessage,
  applyServerCanvasStatus,
  markLinesSaved,
  markImagesSaved,
  markTextBoxesSaved,
  type SetLines,
  type SetImages,
  type SetTextBoxes,
  type CanvasLocalDraft,
  type CanvasSaveTrigger,
  type CanvasLoadTrigger,
  type CanvasSaveState,
} from './canvasPersistenceModel';
import {
  CANVAS_SOCKET_LOAD_TIMEOUT_MS,
  getCanvasSocket,
  emitCanvasSocket,
  saveCanvasPayload,
  type CanvasChangedEvent,
  type CanvasStreamCallbacks,
  type CanvasLineStreamStartEvent,
  type CanvasLineStreamPointsEvent,
  type CanvasLineStreamEndEvent,
} from './canvasSocketClient';
import {
  readCanvasRetryQueue,
  hydrateCanvasRetryQueue,
  getCanvasRetryCount,
  addCanvasRetryQueueItem,
  removeCanvasRetryQueueItem,
  clearCanvasRetryQueue,
  updateCanvasRetryQueueItem,
  serializeCanvasDraft,
  readCanvasLocalDraftPersisted,
  writeCanvasLocalDraft,
  scheduleCanvasLocalDraft,
  type CanvasRetryQueueItem,
} from './canvasLocalDraft';
import { uploadCanvasAsset, buildCanvasAssetProxyUrl, readFileAsDataUrl, loadImage, hydrateImageElement } from './canvasAssetApi';

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
      hydrateCanvasRetryQueue(queue.map((item) => ({
        ...item,
        mutationId: item.mutationId || item.id,
        canvasId: item.canvasId ?? null,
        nextAttemptAt: item.nextAttemptAt ?? item.createdAt ?? Date.now(),
        priority: item.priority ?? 40,
      })));
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
