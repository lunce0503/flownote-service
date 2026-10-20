const WEB_ORIGINS = ['https://flownote-react.vercel.app', 'https://flownote-react-staging.vercel.app'];
export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = Math.ceil(MAX_EXPORT_BYTES / 3) * 4 + 1024;
const extensions: Record<string, string> = {
  'text/markdown': '.md', 'text/plain': '.txt', 'text/calendar': '.ics', 'application/json': '.json',
  'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg',
};

export function resolveWebOrigin(value: string | undefined): string {
  if (!value || !WEB_ORIGINS.includes(value)) throw new Error('EXPO_PUBLIC_WEB_URL must select a Flownote cloud web origin.');
  return value;
}

export function navigationAction(raw: string, origin: string): 'internal' | 'external' | 'block' {
  if (raw.length > 4096 || /[\u0000-\u0020\u007f]/.test(raw)) return 'block';
  try {
    const url = new URL(raw);
    if (url.username || url.password) return 'block';
    if (url.protocol === 'https:') return url.origin === origin ? 'internal' : 'external';
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return 'external';
  } catch { /* A malformed URL never reaches the OS. */ }
  return 'block';
}

export type WebExport = { name: string; mime: string; base64: string };
export function parseExport(raw: string, source: string, origin: string): WebExport {
  if (navigationAction(source, origin) !== 'internal' || raw.length > MAX_MESSAGE_LENGTH) throw new Error('Untrusted export.');
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'base64,mime,name,type'
    || data.type !== 'flownote.export' || typeof data.name !== 'string' || data.name.length > 512
    || typeof data.mime !== 'string' || typeof data.base64 !== 'string') throw new Error('Invalid export.');
  const extension = extensions[data.mime];
  if (!extension || data.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)) throw new Error('Unsupported export.');
  const bytes = data.base64.length / 4 * 3 - (data.base64.endsWith('==') ? 2 : data.base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_EXPORT_BYTES) throw new Error('Export is too large.');
  let name = data.name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 60) || 'flownote';
  if (!name.toLowerCase().endsWith(extension)) name += extension;
  return { name, mime: data.mime, base64: data.base64 };
}
