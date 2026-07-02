type SyncPayload = {
  token: string;
  resource: 'notes' | 'canvas' | 'tasks' | 'schedule' | 'all';
  action: string;
  at: string;
  noteId?: string;
  revision?: number;
  clientId?: string;
};

type SyncClient = {
  id: string;
  token: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const encoder = new TextEncoder();

const getClients = () => {
  const globalStore = globalThis as typeof globalThis & {
    __flownoteSyncClients?: Map<string, SyncClient>;
  };
  if (!globalStore.__flownoteSyncClients) {
    globalStore.__flownoteSyncClients = new Map();
  }
  return globalStore.__flownoteSyncClients;
};

const writeEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) => {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
};

const addSyncClient = (token: string, clientId: string, controller: ReadableStreamDefaultController<Uint8Array>) => {
  getClients().set(clientId, { id: clientId, token, controller });
};

const removeSyncClient = (clientId: string) => {
  getClients().delete(clientId);
};

const publishSyncEvent = (payload: SyncPayload) => {
  for (const client of getClients().values()) {
    if (client.token !== payload.token) continue;

    try {
      writeEvent(client.controller, 'flownote-sync', payload);
    } catch {
      removeSyncClient(client.id);
    }
  }
};

export { addSyncClient, publishSyncEvent, removeSyncClient, writeEvent };
export type { SyncPayload };
