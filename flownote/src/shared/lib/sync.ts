import { API_SYNC_BASE_URL, authHeaders, getAuthToken } from "../api";
import { io, type Socket } from "socket.io-client";

export type SyncResource = "notes" | "canvas" | "tasks" | "schedule" | "all";

export type SyncEventPayload = {
  resource: SyncResource;
  action: string;
  at: string;
  noteId?: string;
  revision?: number;
  clientId?: string;
};

type SyncEventDetails = Pick<SyncEventPayload, "noteId" | "revision" | "clientId">;

const listeners = new Set<(event: SyncEventPayload) => void>();
let socket: Socket | null = null;
let socketToken: string | null = null;
let publishing = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

const releaseSocket = () => {
  if (listeners.size || publishing) return;
  clearTimeout(reconnectTimer);
  socket?.disconnect();
  socket = null;
  socketToken = null;
};

const getSyncSocket = () => {
  const token = getAuthToken();
  if (!API_SYNC_BASE_URL || !token) return null;
  if (!socket || socketToken !== token) {
    clearTimeout(reconnectTimer);
    socket?.disconnect();
    socketToken = token;
    const connection = io(`${new URL(API_SYNC_BASE_URL).origin}/sync`, {
      path: "/web-api/socket.io",
      addTrailingSlash: false,
      transports: ["polling"],
      withCredentials: true,
      extraHeaders: authHeaders(),
      forceNew: true,
    });
    socket = connection;
    let connectedBefore = false;
    connection.on("flownote-sync", (event: SyncEventPayload) => {
      if (socketToken !== getAuthToken()) return;
      listeners.forEach((listener) => listener(event));
    });
    connection.on("connect", () => {
      if (connectedBefore) {
        listeners.forEach((listener) => listener({ resource: "all", action: "reconnected", at: new Date().toISOString() }));
      }
      connectedBefore = true;
    });
    connection.on("disconnect", (reason) => {
      if (reason === "io server disconnect" && (listeners.size || publishing)) {
        reconnectTimer = setTimeout(() => {
          if (socket === connection && getAuthToken()) connection.connect();
        }, 1_000);
      }
    });
  }
  return socket;
};

const SYNC_CLIENT_ID_KEY = "flownote.sync.clientId";

const getSyncClientId = () => {
  const existing = sessionStorage.getItem(SYNC_CLIENT_ID_KEY);
  if (existing) return existing;

  const clientId = crypto.randomUUID();
  sessionStorage.setItem(SYNC_CLIENT_ID_KEY, clientId);
  return clientId;
};

const publishSyncEvent = async (
  resource: SyncResource,
  action = "changed",
  details: SyncEventDetails = {},
) => {
  const connection = getSyncSocket();
  if (!connection) return;
  publishing += 1;
  try {
    if (!connection.connected) connection.connect();
    const response = await connection.timeout(10_000).emitWithAck("publish", { resource, action, ...details });
    if (!response?.ok) throw new Error(`Sync publish failed (${response?.status ?? "unknown"})`);
  } catch (error) {
    console.warn("동기화 이벤트 발행 실패:", error);
  } finally {
    publishing -= 1;
    releaseSocket();
  }
};

const subscribeSyncEvents = (onEvent: (event: SyncEventPayload) => void) => {
  if (!getSyncSocket()) return () => {};
  listeners.add(onEvent);
  return () => {
    listeners.delete(onEvent);
    releaseSocket();
  };
};

export { getSyncClientId, publishSyncEvent, subscribeSyncEvents };
