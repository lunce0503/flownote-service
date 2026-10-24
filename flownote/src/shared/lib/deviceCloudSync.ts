import axios from 'axios';
import { API_BASE_URL, authHeaders } from '../api';
import { withDeviceWorkspace } from './deviceStorage';
import { deviceOwner } from './deviceMode';
import { pendingCloudDraftMessage, pendingDeviceDraftMessage, readCloudDraftBackup, readDeviceDraftBackup } from './devicePendingDrafts';
import { buildDeviceSyncPlan, prepareOfflineWorkspace } from './deviceSyncModel';
import { DEVICE_SYNC_HEADER, runWithDeviceSyncNetwork } from './deviceSyncNetwork';
import {
  createWorkspaceSnapshot,
  workspaceSnapshot,
  type CanvasSnapshot,
  type DeviceSyncOperation,
  type DeviceSyncPlan,
  type Item,
  type WorkspaceSnapshot,
} from './deviceWorkspace';

type Progress = (message: string) => void;
const headers = () => ({ ...authHeaders(), [DEVICE_SYNC_HEADER]: '1' });
const api = (path: string) => `${API_BASE_URL.replace(/\/$/, '')}${path}`;
const asItems = (value: unknown, keys: string[] = []): Item[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is Item => Boolean(entry) && typeof entry === 'object' && typeof (entry as Item).id === 'string');
  if (!value || typeof value !== 'object') return [];
  for (const key of keys) {
    const nested = (value as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return asItems(nested);
  }
  return [];
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('이미지를 기기 형식으로 변환하지 못했습니다.'));
  reader.onerror = () => reject(reader.error ?? new Error('이미지를 기기에 저장하지 못했습니다.'));
  reader.readAsDataURL(blob);
});

const assetProxyUrl = (image: Item) => {
  if (typeof image.assetId === 'string' && image.assetId) return api(`/api/canvas/assets/${encodeURIComponent(image.assetId)}`);
  if (typeof image.objectKey === 'string' && image.objectKey.startsWith('canvas/') && !image.objectKey.includes('..')) {
    return api(`/api/canvas/assets/by-key?objectKey=${encodeURIComponent(image.objectKey)}`);
  }
  if (typeof image.url === 'string' && image.url.startsWith('data:image/')) return image.url;
  return '';
};

const downloadCanvasImage = async (image: Item): Promise<Item> => {
  const source = assetProxyUrl(image);
  if (!source) throw new Error('오프라인에 저장할 수 없는 캔버스 이미지가 있습니다. 이미지를 다시 첨부한 뒤 시도해주세요.');
  if (source.startsWith('data:')) return structuredClone(image);
  const response = await axios.get<Blob>(source, { headers: headers(), responseType: 'blob' });
  const contentType = response.data.type || String(image.contentType ?? '');
  if (!contentType.startsWith('image/')) throw new Error('캔버스 이미지 응답 형식을 확인할 수 없습니다.');
  const dataUrl = await readBlobAsDataUrl(response.data);
  return { ...image, cloudUrl: image.url, url: dataUrl, contentType, byteSize: response.data.size };
};

const fetchNotes = async (progress: Progress) => {
  const summaries: Item[] = [];
  const cursors = new Set<string>();
  let cursor = '';
  do {
    const response = await axios.get(api('/api/notes'), { params: { view: 'summary', limit: 50, cursor: cursor || undefined }, headers: headers() });
    const page = response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : {};
    summaries.push(...asItems(page.notes));
    cursor = typeof page.next_cursor === 'string' ? page.next_cursor : '';
    if (cursor && cursors.has(cursor)) throw new Error('노트 목록 페이지가 반복되어 스냅샷을 중단했습니다.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const notes: Item[] = [];
  for (let index = 0; index < summaries.length; index += 1) {
    progress(`노트 저장 중 · ${index + 1}/${summaries.length}`);
    const response = await axios.get<Item>(api(`/api/notes/${encodeURIComponent(summaries[index].id)}`), { headers: headers() });
    notes.push(response.data);
  }
  return notes;
};

export async function fetchCloudWorkspace(progress: Progress = () => {}): Promise<WorkspaceSnapshot> {
  progress('서버 자료 확인 중');
  const owner = deviceOwner();
  const session = await axios.get<Item>(api('/api/users/me'), { headers: headers() });
  if (!owner || session.data.id !== owner || deviceOwner() !== owner) throw new Error('서버 로그인 계정이 기기 자료 계정과 다릅니다. 같은 계정으로 다시 로그인해주세요.');
  const result = createWorkspaceSnapshot();
  result.notes = await fetchNotes(progress);
  progress('폴더와 플래너 저장 중');
  const [noteFolders, canvases, canvasFolders, tasks, schedules, diaryDates] = await Promise.all([
    axios.get(api('/api/note-folders'), { headers: headers() }),
    axios.get(api('/api/canvas/documents'), { headers: headers() }),
    axios.get(api('/api/canvas/folders'), { headers: headers() }),
    axios.get(api('/api/tasks'), { headers: headers() }),
    axios.get(api('/api/schedule-items'), { headers: headers() }),
    axios.get(api('/api/diary/dates'), { headers: headers() }),
  ]);
  result.noteFolders = asItems(noteFolders.data, ['folders', 'noteFolders']);
  result.canvases = asItems(canvases.data);
  result.canvasFolders = asItems(canvasFolders.data).map(folder => {
    const normalized: Item = { ...folder, canvas_ids: folder.canvas_ids ?? (folder as Record<string, unknown>).canvasIds ?? [] };
    delete normalized.canvasIds;
    return normalized;
  });
  result.tasks = asItems(tasks.data, ['tasks']);
  result.schedules = asItems(schedules.data, ['scheduleItems', 'schedule_items']);

  const dates = Array.isArray(diaryDates.data) ? diaryDates.data.filter((value): value is string => typeof value === 'string') : [];
  for (const date of dates) {
    const response = await axios.get<Item>(api('/api/diary'), { params: { date }, headers: headers() });
    if (response.data.id) result.diaries.push(response.data);
  }

  for (let index = 0; index < result.canvases.length; index += 1) {
    const canvas = result.canvases[index];
    progress(`캔버스와 이미지 저장 중 · ${index + 1}/${result.canvases.length}`);
    const [metadata, elements] = await Promise.all([
      axios.get(api('/api/canvas/metadata'), { params: { canvasId: canvas.id }, headers: headers() }),
      axios.get(api('/api/canvas/elements'), { params: { canvasId: canvas.id }, headers: headers() }),
    ]);
    const body = elements.data && typeof elements.data === 'object' ? elements.data as Record<string, unknown> : {};
    if (body.status === 'PARTIAL' || (Array.isArray(body.failedElements) && body.failedElements.length > 0)) {
      throw new Error(`“${String(canvas.title ?? '캔버스')}”의 일부 자료를 내려받지 못해 동기화를 끄지 않았습니다.`);
    }
    const rawImages = Array.isArray(body.images) ? body.images as Item[] : [];
    const images: Item[] = [];
    for (const image of rawImages) images.push(await downloadCanvasImage(image));
    const revision = Number((metadata.data as Record<string, unknown>)?.revision ?? body.revision ?? 0);
    result.canvasContents.push({
      id: canvas.id,
      lines: Array.isArray(body.lines) ? body.lines as Item[] : [],
      images,
      textBoxes: Array.isArray(body.textBoxes) ? body.textBoxes as Item[] : [],
      revision: Number.isFinite(revision) ? revision : 0,
    });
  }
  return result;
}

const ensureStorageCapacity = async (snapshot: WorkspaceSnapshot) => {
  const estimate = await navigator.storage?.estimate?.();
  if (!estimate?.quota) return;
  const required = new Blob([JSON.stringify(snapshot)]).size * 1.25;
  const available = estimate.quota - (estimate.usage ?? 0);
  if (required > available) throw new Error('기기 저장 공간이 부족하여 동기화를 끄지 않았습니다. 저장 공간을 확보한 뒤 다시 시도해주세요.');
};

export async function prepareDeviceOffline(progress: Progress = () => {}) {
  const owner = deviceOwner();
  const cloud = await fetchCloudWorkspace(progress);
  await ensureStorageCapacity(cloud);
  // A snapshot from the network may predate an editor's last pending save.
  // Check existing cloud drafts immediately before committing the device copy.
  const pending = pendingCloudDraftMessage(cloud, await readCloudDraftBackup());
  if (pending) throw new Error(pending);
  progress('기기 저장소에 확정 중');
  await withDeviceWorkspace(true, state => {
    if (deviceOwner() !== owner) throw new Error('계정이 변경되어 스냅샷 저장을 중단했습니다.');
    prepareOfflineWorkspace(state, cloud);
  });
}

const valuesById = (value: unknown) => new Map((Array.isArray(value) ? value : []).filter((item): item is Item => Boolean(item) && typeof item === 'object' && typeof item.id === 'string').map(item => [item.id, item]));
const canvasDelta = (remote: CanvasSnapshot | undefined, desired: CanvasSnapshot) => {
  const delta: Record<string, Item[]> = {};
  for (const [field, suffix] of [['lines', 'Lines'], ['images', 'Images'], ['textBoxes', 'TextBoxes']] as const) {
    const before = valuesById(remote?.[field]);
    const after = valuesById(desired[field]);
    delta[`added${suffix}`] = [...after.values()].filter(item => !before.has(item.id));
    delta[`modified${suffix}`] = [...after.values()].filter(item => before.has(item.id) && JSON.stringify(item) !== JSON.stringify(before.get(item.id)));
    delta[`deleted${suffix}`] = [...before.values()].filter(item => !after.has(item.id)).map(item => ({ id: item.id }));
  }
  return delta;
};

const dataUrlFile = (url: string, fallbackType: string) => {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match || !match[1].startsWith('image/')) throw new Error('기기 이미지 형식을 확인할 수 없습니다.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], `offline-image.${match[1].split('/')[1] || 'bin'}`, { type: match[1] || fallbackType });
};

const restoreCanvasImages = async (images: Item[]) => {
  const restored: Item[] = [];
  for (const image of images) {
    const next = structuredClone(image);
    if (typeof next.cloudUrl === 'string' && next.assetId) {
      next.url = next.cloudUrl;
      delete next.cloudUrl;
      restored.push(next);
      continue;
    }
    if (typeof next.url === 'string' && next.url.startsWith('data:image/')) {
      const form = new FormData();
      form.set('image', dataUrlFile(next.url, String(next.contentType ?? 'image/png')));
      const response = await axios.post<Item>(api('/api/canvas/assets'), form, { headers: headers() });
      Object.assign(next, {
        assetId: response.data.id,
        objectKey: response.data.objectKey,
        url: response.data.url,
        contentType: response.data.contentType,
        byteSize: response.data.byteSize,
      });
      delete next.cloudUrl;
    }
    restored.push(next);
  }
  return restored;
};

const withoutMeta = (item: Item, omitted: string[] = []) => Object.fromEntries(
  Object.entries(item).filter(([key]) => !['created_at', 'updated_at', ...omitted].includes(key)),
);

const ignoreMissingDelete = async (request: () => Promise<unknown>) => {
  try { await request(); }
  catch (error) { if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error; }
};

async function applyOperation(plan: DeviceSyncPlan, operation: DeviceSyncOperation): Promise<void> {
  const value = operation.value;
  if (operation.collection === 'notes') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/notes/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    // Offline revisions count local saves. Cloud Markdown requires exactly one
    // increment from its current revision, regardless of local edit count.
    const nextRevision = operation.remote ? Number(operation.remote.revision ?? 0) + 1 : 1;
    await axios.post(api('/api/notes'), { ...withoutMeta(value!), revision: nextRevision, client_id: plan.id }, { headers: headers() });
    return;
  }
  if (operation.collection === 'canvases') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/canvas/documents/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    if (operation.remote) await axios.patch(api(`/api/canvas/documents/${encodeURIComponent(operation.itemId)}`), { title: value?.title }, { headers: headers() });
    else await axios.post(api('/api/canvas/documents'), { id: operation.itemId, title: value?.title }, { headers: headers() });
    return;
  }
  if (operation.collection === 'canvasContents') {
    if (operation.action === 'delete') return;
    const desired = structuredClone(value!) as CanvasSnapshot;
    desired.images = await restoreCanvasImages(desired.images);
    const payload = canvasDelta(operation.remote as CanvasSnapshot | undefined, desired);
    await axios.post(api('/api/canvas/save'), {
      canvasId: operation.itemId, mutationId: plan.id, payload,
      trigger: 'offline-sync', operationId: operation.id, clientCreatedAt: plan.createdAt,
    }, { headers: headers() });
    return;
  }
  if (operation.collection === 'tasks') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/tasks/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    const body = withoutMeta(value!, ['id']);
    if (operation.remote) await axios.patch(api(`/api/tasks/${encodeURIComponent(operation.itemId)}`), body, { headers: headers() });
    else await axios.post(api('/api/tasks'), { ...body, id: operation.itemId }, { headers: headers() });
    return;
  }
  if (operation.collection === 'schedules') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/schedule-items/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    const body = withoutMeta(value!, ['id']);
    if (operation.remote) await axios.patch(api(`/api/schedule-items/${encodeURIComponent(operation.itemId)}`), body, { headers: headers() });
    else await axios.post(api('/api/schedule-items'), { ...body, id: operation.itemId }, { headers: headers() });
    return;
  }
  if (operation.collection === 'diaries') {
    if (operation.action === 'delete') return;
    const date = String(value?.entry_date ?? operation.itemId);
    await axios.put(api(`/api/diary/${encodeURIComponent(date)}`), { todos: value?.todos ?? [], grid: value?.grid ?? {}, journal: value?.journal ?? [] }, { headers: headers() });
    return;
  }
  if (operation.collection === 'noteFolders') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/note-folders/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    const body = { id: operation.itemId, category: value?.category, name: value?.name, note_ids: value?.note_ids ?? value?.noteIds ?? [] };
    if (operation.remote) await axios.patch(api(`/api/note-folders/${encodeURIComponent(operation.itemId)}`), body, { headers: headers() });
    else await axios.post(api('/api/note-folders'), body, { headers: headers() });
    return;
  }
  if (operation.collection === 'canvasFolders') {
    if (operation.action === 'delete') return ignoreMissingDelete(() => axios.delete(api(`/api/canvas/folders/${encodeURIComponent(operation.itemId)}`), { headers: headers() }));
    const body = { id: operation.itemId, category: value?.category, name: value?.name, canvas_ids: value?.canvas_ids ?? value?.canvasIds ?? [] };
    if (operation.remote) await axios.patch(api(`/api/canvas/folders/${encodeURIComponent(operation.itemId)}`), body, { headers: headers() });
    else await axios.post(api('/api/canvas/folders'), body, { headers: headers() });
  }
}

export async function reconcileDeviceToCloud(progress: Progress = () => {}) {
  return runWithDeviceSyncNetwork(async () => {
    const owner = deviceOwner();
    let plan: DeviceSyncPlan;
    try {
      const drafts = await readDeviceDraftBackup();
      const pendingDraft = await withDeviceWorkspace(false, state => pendingDeviceDraftMessage(state, drafts));
      if (pendingDraft) throw new Error(pendingDraft);
      await withDeviceWorkspace(true, state => { state.sync.status = 'syncing'; });
      progress('서버의 최신 변경 확인 중');
      const remote = await fetchCloudWorkspace(progress);
      plan = await withDeviceWorkspace(true, state => {
        const created = buildDeviceSyncPlan(state, remote);
        // A failed attempt may already have reached the server. Re-plan against
        // its latest state, keeping stable ID mappings and earlier recovery copies.
        if (state.sync.pending) {
          state.sync.recovery = [...state.sync.recovery, ...state.sync.pending.conflicts];
        }
        state.sync.status = 'syncing';
        state.sync.pending = created;
        state.sync.lastError = undefined;
        return created;
      });
      for (let index = plan.cursor; index < plan.operations.length; index += 1) {
        if (deviceOwner() !== owner) throw new Error('계정이 변경되어 동기화를 중단했습니다.');
        progress(`변경 업로드 중 · ${index + 1}/${plan.operations.length}`);
        await applyOperation(plan, plan.operations[index]);
        plan.cursor = index + 1;
        await withDeviceWorkspace(true, state => {
          if (state.sync.pending?.id !== plan!.id) throw new Error('동기화 계획이 변경되어 중단했습니다.');
          state.sync.pending.cursor = plan!.cursor;
        });
      }
      progress('업로드 결과 확인 중');
      const finalCloud = await fetchCloudWorkspace(progress);
      const finalDrafts = await readDeviceDraftBackup();
      await withDeviceWorkspace(true, state => {
        const newerDraft = pendingDeviceDraftMessage(state, finalDrafts);
        if (newerDraft) throw new Error(newerDraft);
        for (const [key, items] of Object.entries(finalCloud)) state[key as keyof WorkspaceSnapshot] = items as never;
        state.sync.base = structuredClone(finalCloud);
        state.sync.recovery = [...state.sync.recovery, ...plan!.conflicts];
        state.sync.status = 'idle';
        state.sync.pending = undefined;
        state.sync.lastError = undefined;
        state.sync.lastSyncedAt = new Date().toISOString();
      });
      return { conflicts: plan.conflicts.length, workspace: workspaceSnapshot(finalCloud as never) };
    } catch (error) {
      const message = axios.isAxiosError(error) && error.response?.status === 401
        ? '서버 로그인이 만료되었습니다. 기기 자료는 보존했습니다. 기기 모드에서 로그아웃한 뒤 같은 계정으로 다시 로그인하고 동기화를 켜주세요.'
        : error instanceof Error ? error.message : '동기화하지 못했습니다.';
      await withDeviceWorkspace(true, state => { state.sync.status = 'failed'; state.sync.lastError = message.slice(0, 500); });
      throw new Error(message, { cause: error });
    }
  });
}
