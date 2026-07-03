const DATABASE_NAME = "flownote-canvas";
const DATABASE_VERSION = 1;
const OPERATIONS_STORE = "operations";
const DRAFTS_STORE = "drafts";

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(OPERATIONS_STORE)) {
      database.createObjectStore(OPERATIONS_STORE);
    }
    if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
      database.createObjectStore(DRAFTS_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없습니다."));
});

const runRequest = async <T>(storeName: string, mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청에 실패했습니다."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 트랜잭션이 취소되었습니다."));
    });
  } finally {
    database.close();
  }
};

export const readCanvasOperationQueue = async <T>(): Promise<T[]> => {
  if (typeof indexedDB === "undefined") return [];
  const value = await runRequest<unknown>(OPERATIONS_STORE, "readonly", (store) => store.get("retryQueue"));
  return Array.isArray(value) ? value as T[] : [];
};

export const writeCanvasOperationQueue = async <T>(queue: T[]): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  await runRequest<IDBValidKey>(OPERATIONS_STORE, "readwrite", (store) => store.put(queue, "retryQueue"));
};

export const readCanvasDraft = async <T>(canvasId: string): Promise<T | null> => {
  if (typeof indexedDB === "undefined") return null;
  const value = await runRequest<unknown>(DRAFTS_STORE, "readonly", (store) => store.get(canvasId));
  return value == null ? null : value as T;
};

export const writeCanvasDraft = async <T>(canvasId: string, draft: T): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  await runRequest<IDBValidKey>(DRAFTS_STORE, "readwrite", (store) => store.put(draft, canvasId));
};

export const removeCanvasDraft = async (canvasId: string): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  await runRequest<undefined>(DRAFTS_STORE, "readwrite", (store) => store.delete(canvasId));
};

export type CanvasDeviceDiagnostic = {
  id: string;
  operation: "LOAD" | "SAVE";
  canvasId: string | null;
  message: string;
  createdAt: number;
};

export const appendCanvasDeviceDiagnostic = async (event: CanvasDeviceDiagnostic): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  const current = await readCanvasDeviceDiagnostics();
  await runRequest<IDBValidKey>(OPERATIONS_STORE, "readwrite", (store) => (
    store.put([event, ...current].slice(0, 100), "deviceDiagnostics")
  ));
};

export const readCanvasDeviceDiagnostics = async (): Promise<CanvasDeviceDiagnostic[]> => {
  if (typeof indexedDB === "undefined") return [];
  const value = await runRequest<unknown>(OPERATIONS_STORE, "readonly", (store) => store.get("deviceDiagnostics"));
  return Array.isArray(value) ? value as CanvasDeviceDiagnostic[] : [];
};
