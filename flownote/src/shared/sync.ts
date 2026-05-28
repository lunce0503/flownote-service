import { API_SYNC_BASE_URL, getAuthToken } from "./api";

export type SyncResource = "notes" | "canvas" | "tasks" | "schedule" | "all";

type SyncEventPayload = {
  resource: SyncResource;
  action: string;
  at: string;
};

const publishSyncEvent = async (resource: SyncResource, action = "changed") => {
  const token = getAuthToken();
  if (!API_SYNC_BASE_URL || !token) return;

  try {
    await fetch(`${API_SYNC_BASE_URL}/api/sync/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, resource, action }),
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

export { publishSyncEvent, subscribeSyncEvents };
