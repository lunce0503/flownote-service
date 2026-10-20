import { useEffect, useState } from 'react';
import { isDeviceOnly, setDeviceOnly } from '@/shared/lib/deviceMode';
import { readDeviceBackup, withDeviceWorkspace } from '@/shared/lib/deviceStorage';
import { downloadBlob } from '@/shared/lib/downloadBlob';
import { prepareDeviceOffline, reconcileDeviceToCloud } from '@/shared/lib/deviceCloudSync';

export default function DeviceSyncSettings() {
  const local = isDeviceOnly();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [recoveryCount, setRecoveryCount] = useState(0);
  useEffect(() => {
    if (!local) return;
    void withDeviceWorkspace(false, state => state.sync.recovery.length).then(setRecoveryCount).catch(() => {});
  }, [local]);
  const change = async () => {
    const message = local
      ? '동기화를 켤까요? 서버의 최신 변경과 이 기기의 오프라인 변경을 안전하게 조정해 업로드합니다. 충돌한 다른 버전은 복구본으로 보존합니다.'
      : '동기화를 끌까요? 먼저 서버의 노트·캔버스·이미지·플래너를 이 기기에 저장합니다. 준비가 끝난 뒤부터 서버 저장과 실시간 수신을 중지합니다.';
    if (!window.confirm(message)) return;
    setBusy(true); setError(''); setProgress('준비 중');
    try {
      if (local) {
        const result = await reconcileDeviceToCloud(setProgress);
        setDeviceOnly(false);
        if (result.conflicts > 0) setProgress(`${result.conflicts}개 충돌을 조정하고 다른 버전을 복구본에 보존했습니다.`);
      } else {
        await prepareDeviceOffline(setProgress);
        setDeviceOnly(true);
      }
      window.dispatchEvent(new Event('flownote-device-mode-changing'));
      window.location.replace('/settings');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '전환하지 못했습니다. 기기 저장소·네트워크·저장 공간을 확인해주세요.');
      setBusy(false); setProgress('');
    }
  };
  return <section aria-labelledby="device-sync-title" className="rounded-2xl border border-stone-300 bg-white p-4">
    <h2 id="device-sync-title" className="text-lg font-black text-stone-950">앱 동기화</h2>
    <div className="mt-3 flex items-start justify-between gap-4">
      <div className="min-w-0"><p className="font-bold">{local ? '꺼짐 · 기기 전용' : '켜짐 · 서버 작업 공간'}</p>
        <p className="mt-1 text-sm text-stone-600">끄면 노트·캔버스·할 일·시간표·일기를 이 기기에만 저장하며, 서버 저장과 다른 기기의 변경 수신을 모두 중지합니다.</p>
      </div>
      <button type="button" role="switch" aria-label="앱 동기화" aria-checked={!local} disabled={busy} onClick={() => void change()}
        className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 disabled:opacity-50 ${local ? 'justify-start bg-stone-300' : 'justify-end bg-stone-950'}`}>
        <span className="h-6 w-6 rounded-full bg-[#f7f3e8]" />
      </button>
    </div>
    <p className="mt-3 text-sm text-stone-600">끄기 전에 현재 서버 자료를 기기에 저장합니다. 다시 켜면 공통 기준 이후 변경을 조정해 업로드하며, 같은 내용의 충돌은 편집량이 더 큰 버전을 반영하고 다른 버전도 복구본으로 남깁니다. 이 설정은 현재 계정의 이 앱에만 적용됩니다.</p>
    {local && <>
      <p className="mt-3 text-sm font-bold text-stone-800">기기 전용에서는 AI·소셜·프로필 변경·피드백 등 서버 기능을 사용할 수 없습니다.</p>
      <p className="mt-2 text-sm text-stone-600">앱 화면을 처음 불러올 때는 인터넷이 필요할 수 있습니다. 앱 삭제·사이트 데이터 삭제·OS 저장 공간 정리 시 기기 자료와 충돌 복구본을 잃을 수 있으므로 중요한 내용은 내보내세요.</p>
      {recoveryCount > 0 && <p className="mt-2 text-sm font-bold text-stone-800">복구 가능한 충돌 버전 {recoveryCount}개 · JSON 백업에 포함됨</p>}
      <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-lg border border-stone-400 px-4 text-sm font-bold" onClick={() => {
        setBusy(true); setError('');
        void readDeviceBackup().then(async backup => {
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          if (blob.size > 8 * 1024 * 1024) throw new Error('백업이 8MB를 넘습니다. 노트는 .md로 각각 내보내고 큰 이미지를 별도 보관해주세요.');
          await downloadBlob(`flownote-device-${new Date().toISOString().slice(0, 10)}.json`, blob);
        }).catch(cause => setError(cause instanceof Error ? cause.message : '백업을 읽지 못했습니다.')).finally(() => setBusy(false));
      }}>기기 자료 JSON 백업 내보내기</button>
      <p className="mt-1 text-xs text-stone-500">전체 백업은 8MB 이하입니다. 백업에는 개인 작성 내용과 기준본·충돌 복구본이 포함됩니다.</p>
    </>}
    {busy && <p role="status" className="mt-2 text-sm">{progress || '처리 중…'}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>;
}
