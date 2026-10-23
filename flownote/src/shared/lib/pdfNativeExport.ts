declare global {
  interface Window { __flownotePdfExportV1?: boolean }
}

const chunkBytes = 256 * 1024;
type Status = { id: string; state: string; index?: number };
let busy = false;

// Backpressure keeps only a single base64 chunk in the WKWebView/native bridge.
export async function exportNativePdf(name: string, blob: Blob): Promise<void> {
  if (busy || !window.ReactNativeWebView || blob.size < 5 || blob.size > 100 * 1024 * 1024) throw new Error('PDF export unavailable');
  busy = true;
  const id = crypto.randomUUID();
  let pending: { state: string; index?: number; resolve(): void; reject(error: Error): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const receive = (event: Event) => {
    const detail = (event as CustomEvent<Status>).detail;
    if (!detail || detail.id !== id || !pending) return;
    if (detail.state === 'cancelled' || detail.state === 'error') pending.reject(new Error(detail.state));
    else if (detail.state === pending.state && detail.index === pending.index) pending.resolve();
  };
  const send = (message: object, state: string, index?: number, timeout = 60000) => new Promise<void>((resolve, reject) => {
    const settle = (error?: Error) => { clearTimeout(timer); pending = undefined; if (error) reject(error); else resolve(); };
    pending = { state, index, resolve: () => settle(), reject: error => settle(error) };
    timer = setTimeout(() => settle(new Error('PDF export timed out')), timeout);
    window.ReactNativeWebView!.postMessage(JSON.stringify({ ...message, id }));
  });
  window.addEventListener('flownote:pdf-export-status', receive);
  try {
    await send({ type: 'flownote.pdf-export.start', name, bytes: blob.size }, 'ready', undefined, 300000);
    for (let offset = 0, index = 0; offset < blob.size; offset += chunkBytes, index++) {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('PDF read failed')); reader.readAsDataURL(blob.slice(offset, offset + chunkBytes));
      });
      await send({ type: 'flownote.pdf-export.chunk', index, base64: data }, 'chunk', index);
    }
    await send({ type: 'flownote.pdf-export.finish' }, 'complete', undefined, 600000);
  } catch (error) {
    window.ReactNativeWebView!.postMessage(JSON.stringify({ type: 'flownote.pdf-export.cancel', id }));
    if (!(error instanceof Error && error.message === 'cancelled')) throw error;
  } finally {
    clearTimeout(timer); window.removeEventListener('flownote:pdf-export-status', receive); busy = false;
  }
}
