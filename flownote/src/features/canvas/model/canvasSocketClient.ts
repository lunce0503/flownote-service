import { io, type Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import type { LineElement, CanvasSavePayload } from '@/entities/canvas';
import { authHeaders } from '@/shared/api';
import { isAbortError, type CanvasSaveTrigger } from './canvasPersistenceModel';

export const CANVAS_SAVE_REQUEST_TIMEOUT_MS = 30_000;
export const CANVAS_SOCKET_REQUEST_TIMEOUT_MS = 30_000;
export const CANVAS_SOCKET_LOAD_TIMEOUT_MS = 180_000;
export const CANVAS_SOCKET_UPLOAD_TIMEOUT_MS = 120_000;

export type CanvasSocketResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

export type CanvasSaveResponse = {
  mutationId: string;
  revision: number;
  duplicate: boolean;
  storageStatus?: "PENDING" | "READY";
};

export type CanvasSocketAssetUpload = {
  dataUrl: string;
  name: string;
  contentType: string;
};

export type CanvasChangedEvent = {
  canvasId?: string | null;
  mutationId?: string;
  revision?: number;
  // 증분 동기화: 게이트웨이가 저장 변경분을 실어 보낸다(대형 mutation은 null → 전체 리로드 폴백).
  changes?: CanvasSavePayload | null;
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

export type CanvasStreamCallbacks = {
  onLineStreamStart?: (event: CanvasLineStreamStartEvent) => void;
  onLineStreamPoints?: (event: CanvasLineStreamPointsEvent) => void;
  onLineStreamEnd?: (event: CanvasLineStreamEndEvent) => void;
  onRemoteCanvasChanged?: (event: CanvasChangedEvent) => void;
};

let canvasSocket: Socket | null = null;
let canvasSocketUrl: string | null = null;

export const getCanvasSocket = (socketUrl: string) => {
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

export const emitCanvasSocket = <T,>(
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

export const saveCanvasPayload = async (
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
