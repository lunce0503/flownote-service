import { useSyncExternalStore } from 'react';
import { Download, History } from 'lucide-react';
import { isAndroidApp } from '@/shared/lib/androidApp';

type AndroidUpdateState = {
  schema: 1;
  version: string;
  channel: 'staging' | 'production';
  status: string;
  availableVersion?: string;
};

declare global {
  interface Window { __flownoteAndroidUpdateState?: AndroidUpdateState }
}

const subscribe = (changed: () => void) => {
  window.addEventListener('flownote-android-update-state', changed);
  return () => window.removeEventListener('flownote-android-update-state', changed);
};
const snapshot = () => {
  const state = window.__flownoteAndroidUpdateState;
  return state?.schema === 1 && typeof state.version === 'string' && state.version.length <= 40
    && (state.channel === 'staging' || state.channel === 'production')
    && typeof state.status === 'string' && state.status.length <= 300 ? state : null;
};

/** Display-only native state. The fixed link opens native UI; it cannot select a URL, APK or file. */
export default function AndroidUpdateSettings() {
  const state = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!isAndroidApp) return null;
  return (
    <section aria-labelledby="android-updates-title" data-testid="android-update-settings"
      className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Download size={20} aria-hidden="true" className="text-stone-700" />
        <h2 id="android-updates-title" className="text-lg font-black text-stone-950">앱 업데이트</h2>
      </div>
      {state ? <>
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
          <span>설치 버전 {state.version}</span>
          {state.channel === 'staging' && <span className="rounded bg-stone-100 px-2 py-1">테스트 채널</span>}
        </div>
        <p role="status" className="my-2 break-words text-sm text-stone-600">{state.status}</p>
        <a href="/__flownote_native__/updates"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2">
          <History size={18} aria-hidden="true" />업데이트 확인·설치·이력
        </a>
      </> : <>
        <p className="mb-3 text-sm text-stone-600">현재 앱은 화면 하단의 업데이트 버튼에서 확인·설치·이력을 제공합니다.</p>
        <a href="/android.html" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-bold text-stone-800">최신 앱 설치 안내</a>
      </>}
    </section>
  );
}
