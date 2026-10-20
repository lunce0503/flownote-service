export const DEVICE_SYNC_HEADER = 'X-Flownote-Offline-Reconcile';
let activeScopes = 0;

const headerValue = (headers: unknown): string => {
  if (!headers) return '';
  if (headers instanceof Headers) return headers.get(DEVICE_SYNC_HEADER) ?? '';
  if (typeof headers === 'object' && headers && 'get' in headers && typeof headers.get === 'function') {
    return String(headers.get(DEVICE_SYNC_HEADER) ?? '');
  }
  if (typeof headers === 'object') {
    const entries = Object.entries(headers as Record<string, unknown>);
    return String(entries.find(([key]) => key.toLowerCase() === DEVICE_SYNC_HEADER.toLowerCase())?.[1] ?? '');
  }
  return '';
};

export const isDeviceSyncNetworkRequest = (headers: unknown) => activeScopes > 0 && headerValue(headers) === '1';

export async function runWithDeviceSyncNetwork<T>(action: () => Promise<T>): Promise<T> {
  activeScopes += 1;
  try { return await action(); }
  finally { activeScopes -= 1; }
}
