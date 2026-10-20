import { deviceOwner } from './deviceMode.ts';
import type { DeviceWorkspace } from './deviceWorkspace.ts';

type Stored = { key: IDBValidKey; value: unknown };
export type DeviceDraftBackup = { notes: Stored[]; canvases: Stored[]; operations: Stored[] };

// Read only existing stores. Aborting first creation avoids fabricating a
// schema which would prevent the editor from creating its own database later.
const readExisting = (name: string, stores: string[]): Promise<Record<string, Stored[]>> => new Promise((resolve, reject) => {
  const request = indexedDB.open(name);
  let absent = false;
  request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
  request.onerror = () => absent ? resolve({}) : reject(new Error('기기 초안 저장소를 확인하지 못했습니다. 전환하지 않았습니다.'));
  request.onblocked = () => reject(new Error('다른 창의 초안 저장이 끝난 뒤 다시 시도해주세요.'));
  request.onsuccess = () => {
    const db = request.result;
    const names = stores.filter(name => db.objectStoreNames.contains(name));
    if (!names.length) { db.close(); resolve({}); return; }
    const tx = db.transaction(names, 'readonly');
    const result: Record<string, Stored[]> = {};
    for (const name of names) {
      result[name] = [];
      const cursor = tx.objectStore(name).openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        result[name].push({ key: cursor.result.key, value: cursor.result.value });
        cursor.result.continue();
      };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('기기 초안을 읽지 못해 전환하지 않았습니다.')); };
  };
});

export async function readDeviceDraftBackup(): Promise<DeviceDraftBackup> {
  const owner = deviceOwner();
  if (!owner) throw new Error('기기 초안 계정을 확인해주세요.');
  const [notes, canvas] = await Promise.all([
    readExisting(`flownote-note-drafts-device:${owner}`, ['drafts']),
    readExisting(`flownote-canvas-device:${owner}`, ['drafts', 'operations']),
  ]);
  if (deviceOwner() !== owner) throw new Error('계정이 변경되어 초안 읽기를 중단했습니다.');
  return { notes: notes.drafts ?? [], canvases: canvas.drafts ?? [], operations: canvas.operations ?? [] };
}

export const pendingDeviceDraftMessage = (workspace: DeviceWorkspace, backup: DeviceDraftBackup): string => {
  for (const entry of backup.notes) {
    const draft = entry.value as { userId?: string; note?: { id?: string; title?: string; content?: unknown } } | undefined;
    if (!draft?.note?.id || draft.userId !== deviceOwner()) continue;
    const stored = workspace.notes.find(note => note.id === draft.note!.id);
    if (!stored || stored.title !== draft.note.title || JSON.stringify(stored.content) !== JSON.stringify(draft.note.content)) {
      return `“${draft.note.title || '노트'}”에 미저장 초안이 있습니다. 해당 노트의 초안을 복구·저장하거나 내보낸 뒤 동기화를 켜주세요. 초안과 기기 원본은 보존했습니다.`;
    }
  }
  for (const entry of backup.canvases) {
    const draft = entry.value as { hasPendingChanges?: boolean } | undefined;
    if (draft?.hasPendingChanges) return '캔버스에 미저장 초안이 있습니다. 해당 캔버스의 저장·복구 상태를 확인한 뒤 동기화를 켜주세요. 초안과 기기 원본은 보존했습니다.';
  }
  if (backup.operations.some(entry => entry.key === 'retryQueue' && Array.isArray(entry.value) && entry.value.length)) {
    return '캔버스에 저장 대기 변경이 있습니다. 캔버스에서 재시도·복구한 뒤 동기화를 켜주세요. 대기 변경은 보존했습니다.';
  }
  return '';
};
