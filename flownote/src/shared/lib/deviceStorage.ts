import { deviceOwner } from './deviceMode';
import { createDeviceWorkspace, migrateDeviceWorkspace, type DeviceWorkspace } from './deviceWorkspace';
import { readDeviceDraftBackup } from './devicePendingDrafts';

const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('flownote-device-workspaces', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('workspaces');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('기기 저장소를 열지 못했습니다.'));
  request.onblocked = () => reject(new Error('기기 저장소가 다른 창에서 사용 중입니다.'));
});
export async function withDeviceWorkspace<T>(write: boolean, action: (state: DeviceWorkspace) => T): Promise<T> {
  const owner = deviceOwner();
  if (!owner) throw new Error('기기 자료의 계정을 확인하지 못했습니다.');
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('workspaces', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('workspaces');
      const request = store.get(owner);
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          if (deviceOwner() !== owner) throw new Error('계정이 변경되어 기기 자료 요청을 중단했습니다.');
          const state: DeviceWorkspace = request.result === undefined
            ? createDeviceWorkspace()
            : migrateDeviceWorkspace(request.result);
          result = action(state);
          if (write) store.put(state, owner);
        } catch (error) { failure = error; tx.abort(); }
      };
      // Success means durable transaction completion, NOT just request.onsuccess.
      tx.oncomplete = () => {
        if (deviceOwner() !== owner) { reject(new Error('계정이 변경되어 기기 자료 응답을 중단했습니다.')); return; }
        resolve(structuredClone(result));
      };
      tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error('기기에 저장하지 못했습니다. 저장 공간을 확인하고 내보내기를 이용하세요.'));
    });
  } finally { db.close(); }
}
export const readDeviceBackup = async () => {
  const backup = await withDeviceWorkspace(false, state => ({ format: 'flownote-device-workspace', version: 2, exportedAt: new Date().toISOString(), owner: deviceOwner(), workspace: state }));
  const drafts = await readDeviceDraftBackup();
  if (backup.owner !== deviceOwner()) throw new Error('계정이 변경되어 백업을 중단했습니다.');
  return { ...backup, drafts };
};
