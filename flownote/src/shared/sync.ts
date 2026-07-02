import { API_SYNC_BASE_URL, getAuthToken } from "./api";

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
  const token = getAuthToken();
  if (!API_SYNC_BASE_URL || !token) return;

  try {
    await fetch(`${API_SYNC_BASE_URL}/api/sync/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, resource, action, ...details }),
      keepalive: true,
    });
  } catch (error) {
    console.warn("동기화 이벤트 발행 실패:", error);
  }
};

const subscribeSyncEvents = (onEvent: (event: SyncEventPayload) => void) => {
  const token = getAuthToken();
  if (!API_SYNC_BASE_URL || !token) return () => {};

  const source = new EventSource(`${API_SYNC_BASE_URL}/api/sync/events?token=${encodeURIComponent(token)}`);
  source.addEventListener("flownote-sync", (event) => {
    try {
      onEvent(JSON.parse((event as MessageEvent).data));
    } catch {
      // Ignore malformed sync packets from older server instances.
    }
  });

  return () => source.close();
};

export { getSyncClientId, publishSyncEvent, subscribeSyncEvents };
