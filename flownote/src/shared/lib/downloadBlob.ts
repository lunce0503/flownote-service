import { isIOSApp } from './androidApp';

declare global {
  interface Window { ReactNativeWebView?: { postMessage: (message: string) => void } }
}

// The only native capability exposed to the trusted web page is a bounded, user-confirmed export.
export async function downloadBlob(name: string, blob: Blob): Promise<void> {
  try {
    if (isIOSApp) {
      if (!window.ReactNativeWebView || blob.size > 8 * 1024 * 1024) throw new Error('Export unavailable');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Export failed')); reader.readAsDataURL(blob);
      });
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flownote.export', name,
        mime: blob.type.split(';')[0], base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }));
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(link); link.click(); link.remove();
    // Native Android downloads read the selected blob asynchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { window.alert('파일을 내보내지 못했습니다. iOS 앱에서는 8MB 이하 파일을 저장할 수 있습니다.'); }
}
