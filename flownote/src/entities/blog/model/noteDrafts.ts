import type { BlockDataProps } from './types';
import { deviceNamespace } from '../../../shared/lib/deviceMode.ts';
const databaseName = deviceNamespace('flownote-note-drafts');

export type NoteDraft = {
  userId: string;
  note: BlockDataProps;
  baseRevision: number;
  sequence: string;
  updatedAt: number;
};
type DraftStorage = {
  rebase?: (key: string, sequence: string, revision: number) => Promise<void>;
  removeAcknowledged?: (key: string, sequence: string) => Promise<void>;
  keys?: () => Promise<IDBValidKey[]>;
  read: (key: string) => Promise<NoteDraft | null>;
  write: (key: string, value: NoteDraft | null) => Promise<void>;
};
const keyFor = (userId: string, noteId: string) => JSON.stringify([userId, noteId]);

// The serial persistence queue outlives the editor. Acks remove only their own snapshot.
export function createDraftQueue(storage: DraftStorage) {
  let tail: Promise<unknown> = Promise.resolve();
  let sequence = 0;
  const instanceId = crypto.randomUUID();
  const revoked = new Set<string>();
  const known = new Map<string, string>();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const next = tail.then(action);
    tail = next.catch(() => undefined);
    return next;
  };
  return {
    hasUser(userId: string) {
      return serial(async () => {
        for (const key of await storage.keys?.() ?? [...known.keys()]) {
          if (typeof key === 'string' && JSON.parse(key)[0] === userId && await storage.read(key)) return true;
        }
        return false;
      });
    },
    activate(userId: string) { revoked.delete(userId); },
    capture(userId: string, note: BlockDataProps, baseRevision: number) {
      if (revoked.has(userId)) throw new Error('Draft session ended');
      const key = keyFor(userId, note.id);
      known.set(key, userId);
      const draft: NoteDraft = { userId, note: structuredClone(note), baseRevision, sequence: `${instanceId}:${++sequence}`, updatedAt: Date.now() };
      const persisted = serial(() => storage.write(key, draft));
      return { draft, persisted };
    },
    read(userId: string, noteId: string) {
      const key = keyFor(userId, noteId);
      known.set(key, userId);
      return serial(() => storage.read(key));
    },
    ack(userId: string, noteId: string, ackSequence: string) {
      const key = keyFor(userId, noteId);
      return serial(async () => {
        if (storage.removeAcknowledged) return storage.removeAcknowledged(key, ackSequence);
        const current = await storage.read(key);
        if (current?.sequence === ackSequence) await storage.write(key, null);
      });
    },
    rebase(userId: string, noteId: string, sequence: string, revision: number) {
      const key = keyFor(userId, noteId);
      return serial(async () => {
        if (storage.rebase) return storage.rebase(key, sequence, revision);
        const current = await storage.read(key);
        if (current?.sequence === sequence) await storage.write(key, { ...current, baseRevision: revision });
      });
    },
    remove(userId: string, noteId: string) {
      return serial(() => storage.write(keyFor(userId, noteId), null));
    },
    clearUser(userId: string) {
      revoked.add(userId);
      return serial(async () => {
        const keys = new Set<string>([...known].filter(([, owner]) => owner === userId).map(([key]) => key));
        for (const key of await storage.keys?.() ?? []) {
          if (typeof key === 'string' && JSON.parse(key)[0] === userId) keys.add(key);
        }
        for (const key of keys) await storage.write(key, null);
      });
    },
  };
}

export function recoveryState(draft: Pick<NoteDraft, 'note' | 'baseRevision'>, server: BlockDataProps) {
  if (draft.note.title === server.title && JSON.stringify(draft.note.content) === JSON.stringify(server.content)) return 'matched';
  return draft.baseRevision === (server.revision ?? 0) ? 'recover' : 'conflict';
}

const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
  const request = indexedDB.open(databaseName, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Draft database unavailable'));
  request.onblocked = () => reject(new Error('Draft database blocked'));
});
const transaction = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Draft persistence failed'));
    });
  } finally { db.close(); }
};
export const noteDrafts = createDraftQueue({
  rebase: async (key, sequence, revision) => {
    await transaction('readwrite', store => {
      const request = store.get(key);
      request.onsuccess = () => { if (request.result?.sequence === sequence) store.put({ ...request.result, baseRevision: revision }, key); };
      return request;
    });
  },
  removeAcknowledged: async (key, sequence) => {
    // Compare and delete in ONE IDB transaction, including edits from another tab.
    await transaction('readwrite', store => {
      const request = store.get(key);
      request.onsuccess = () => { if (request.result?.sequence === sequence) store.delete(key); };
      return request;
    });
  },
  keys: () => transaction('readonly', store => store.getAllKeys()),
  read: async key => (await transaction('readonly', store => store.get(key))) ?? null,
  write: async (key, value) => {
    if (value) await transaction('readwrite', store => store.put(value, key));
    else await transaction('readwrite', store => store.delete(key));
  },
});
// Includes drafts from earlier page loads in the same serial transaction queue.
export const clearNoteDraftsForUser = (userId: string) => noteDrafts.clearUser(userId);
