import { io, type Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import type { LineElement, CanvasSavePayload } from '@/entities/canvas';
import { authHeaders } from '@/shared/api';
import { isAbortError, type CanvasSaveTrigger } from './canvasPersistenceModel';

// 게이트웨이 저장 포워딩 타임아웃(CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS=90s)보다 살짝 크게 잡는다.
// 30s로 두면 대용량 필기·느린 백엔드(30~90s)에서 클라이언트가 먼저 포기→재시도하며,
// 백엔드가 결국 성공해도 성공 ack를 못 받아 "재시도"만 무한 반복하는 루프가 생긴다.
export const CANVAS_SAVE_REQUEST_TIMEOUT_MS = 95_000;
export const CANVAS_SOCKET_REQUEST_TIMEOUT_MS = 30_000;
export const CANVAS_SOCKET_LOAD_TIMEOUT_MS = 180_000;
export const CANVAS_SOCKET_UPLOAD_TIMEOUT_MS = 120_000;
// Leave space for the Socket.IO event name, ack id and authorization envelope.
export const CANVAS_SOCKET_SAFE_BYTES = 900_000;
export const CANVAS_SAVE_MAX_BYTES = 32 * 1024 * 1024;

export const canvasMessageBytes = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload)).byteLength;

export type CanvasSocketResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  retryable?: boolean;
};

// 게이트웨이가 실어 보낸 status/retryable을 보존한다.
// 메시지만 남기면 호출부가 "영구 오류(4xx)"와 "일시 오류"를 구분하지 못해 무한 재시도에 빠진다.
export class CanvasSocketError extends Error {
  readonly status?: number;
  readonly retryable?: boolean;

  constructor(message: string, status?: number, retryable?: boolean) {
    super(message);
    this.name = "CanvasSocketError";
    this.status = status;
    this.retryable = retryable;
  }
}

// 저장 멱등성 충돌(409): 서버에 이미 기록된 mutationId에 다른 payload를 보낸 경우.
// 같은 (mutationId, payload) 조합으로는 영원히 409이므로 새 mutationId로 갈아타야 자가 치유된다.
export const isCanvasMutationConflict = (error: unknown) => (
  error instanceof CanvasSocketError && error.status === 409
);

export const isCanvasPermanentSaveError = (error: unknown) => (
  error instanceof CanvasSocketError && (
    error.retryable === false
    || (error.status !== undefined && error.status >= 400 && error.status < 500
      && ![408, 409, 429].includes(error.status))
  )
);

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
    canvasSocket = io(new URL(socketUrl).origin, {
      path: "/web-api/socket.io",
      addTrailingSlash: false,
      transports: ["polling"],
      extraHeaders: authHeaders(),
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
    if (canvasMessageBytes(payload) > CANVAS_SOCKET_SAFE_BYTES) {
      reject(new CanvasSocketError("소켓 전송 크기를 초과했습니다.", 413, false));
      return;
    }
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
          reject(new CanvasSocketError(
            response?.error || `${eventName} socket request failed`,
            response?.status,
            response?.retryable,
          ));
          return;
        }
        resolve(response.data as T);
      },
    );
  })
);

export const emitCanvasStream = (socketUrl: string, event: string, payload: Record<string, unknown>) => {
  const socket = getCanvasSocket(socketUrl);
  if (!socket.connected || canvasMessageBytes(payload) > CANVAS_SOCKET_SAFE_BYTES) return;
  // Transient previews are recoverable from the durable save; never buffer them offline.
  socket.volatile.emit(event, payload);
};

export const saveCanvasPayload = async (
  socketUrl: string,
  canvasId: string | null | undefined,
  payload: CanvasSavePayload,
  mutationId: string,
  trigger: CanvasSaveTrigger,
  init?: Pick<RequestInit, "keepalive" | "signal">,
): Promise<CanvasSaveResponse> => {
  try {
    const request = {
      authorization: authHeaders().Authorization,
      canvasId: canvasId ?? null,
      mutationId,
      operationId: uuidv4(),
      trigger: trigger === "auto" ? "automatic" : trigger,
      clientCreatedAt: new Date().toISOString(),
      payload,
    };
    const requestBytes = canvasMessageBytes(request);
    if (requestBytes > CANVAS_SAVE_MAX_BYTES) {
      throw new CanvasSocketError("저장 데이터가 32MB 제한을 초과했습니다. 내용을 나눈 뒤 다시 저장해 주세요.", 413, false);
    }
    let response: CanvasSaveResponse;
    if (requestBytes > CANVAS_SOCKET_SAFE_BYTES) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      init?.signal?.addEventListener("abort", abort, { once: true });
      if (init?.signal?.aborted) controller.abort();
      const timer = setTimeout(abort, CANVAS_SAVE_REQUEST_TIMEOUT_MS);
      try {
        const result = await fetch(`${socketUrl}/api/canvas/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const body = await result.json().catch(() => null) as CanvasSocketResponse<CanvasSaveResponse> | null;
        if (!result.ok || !body?.ok || !body.data) {
          throw new CanvasSocketError(body?.error || "캔버스 HTTP 저장에 실패했습니다.", result.ok ? body?.status : result.status, body?.retryable);
        }
        response = body.data;
      } finally {
        clearTimeout(timer);
        init?.signal?.removeEventListener("abort", abort);
      }
    } else {
      response = await emitCanvasSocket<CanvasSaveResponse>(socketUrl, "canvas:save", request, {
        signal: init?.signal,
        timeoutMs: CANVAS_SAVE_REQUEST_TIMEOUT_MS,
      });
    }
    if (response.mutationId !== mutationId) {
      throw new Error("캔버스 저장 응답의 mutationId가 요청과 일치하지 않습니다.");
    }
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      if (init?.signal?.aborted) throw error;
      throw new Error("캔버스 저장 시간이 초과되어 최신 변경만 다시 저장합니다.", { cause: error });
    }
    throw error;
  }
};
