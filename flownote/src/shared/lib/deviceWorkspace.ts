export type Item = Record<string, unknown> & { id: string };
export type CanvasSnapshot = Item & { lines: Item[]; images: Item[]; textBoxes: Item[]; revision: number;
  lastMutation?: { id: string; payload: string; revision: number } };
export type WorkspaceSnapshot = {
  notes: Item[];
  noteFolders: Item[];
  canvases: Item[];
  canvasFolders: Item[];
  canvasContents: CanvasSnapshot[];
  tasks: Item[];
  schedules: Item[];
  diaries: Item[];
};
export type DeviceConflict = {
  id: string;
  syncId: string;
  collection: keyof WorkspaceSnapshot;
  itemId: string;
  winner: 'local' | 'remote';
  base: Item | null;
  local: Item | null;
  remote: Item | null;
  loser: Item | null;
  localScore: number;
  remoteScore: number;
  createdAt: string;
};
export type DeviceSyncOperation = {
  id: string;
  collection: keyof WorkspaceSnapshot;
  action: 'upsert' | 'delete';
  itemId: string;
  value?: Item;
  remote?: Item;
};
export type DeviceSyncPlan = {
  id: string;
  createdAt: string;
  cursor: number;
  idMap: Record<string, string>;
  desired: WorkspaceSnapshot;
  operations: DeviceSyncOperation[];
  conflicts: DeviceConflict[];
};
export type DeviceWorkspace = WorkspaceSnapshot & {
  version: 2;
  sync: {
    status: 'idle' | 'offline' | 'syncing' | 'failed';
    base: WorkspaceSnapshot;
    preparedAt?: string;
    lastSyncedAt?: string;
    lastError?: string;
    legacyImported?: boolean;
    recovery: DeviceConflict[];
    pending?: DeviceSyncPlan;
  };
};

export const createWorkspaceSnapshot = (): WorkspaceSnapshot => ({
  notes: [], noteFolders: [], canvases: [], canvasFolders: [], canvasContents: [],
  tasks: [], schedules: [], diaries: [],
});

export const createDeviceWorkspace = (): DeviceWorkspace => ({
  version: 2,
  ...createWorkspaceSnapshot(),
  sync: { status: 'idle', base: createWorkspaceSnapshot(), recovery: [] },
});

const snapshotKeys = [
  'notes', 'noteFolders', 'canvases', 'canvasFolders', 'canvasContents', 'tasks', 'schedules', 'diaries',
] as const satisfies readonly (keyof WorkspaceSnapshot)[];

export const workspaceSnapshot = (value: Pick<DeviceWorkspace, keyof WorkspaceSnapshot>): WorkspaceSnapshot => (
  Object.fromEntries(snapshotKeys.map(key => [key, structuredClone(value[key])])) as WorkspaceSnapshot
);

export function migrateDeviceWorkspace(value: unknown): DeviceWorkspace {
  const source = record(value);
  if (source.version !== 1 && source.version !== 2) throw new Error('기기 자료 형식을 읽을 수 없습니다. 초기화하지 않았습니다.');
  for (const key of snapshotKeys) {
    if (!Array.isArray(source[key])) throw new Error('기기 자료 형식을 읽을 수 없습니다. 초기화하지 않았습니다.');
  }
  const snapshot = Object.fromEntries(snapshotKeys.map(key => [key, structuredClone(source[key])])) as WorkspaceSnapshot;
  if (source.version === 1) {
    return {
      version: 2,
      ...snapshot,
      sync: { status: 'idle', base: createWorkspaceSnapshot(), recovery: [], legacyImported: true },
    };
  }
  const rawSync = record(source.sync);
  const baseSource = record(rawSync.base);
  const base = Object.fromEntries(snapshotKeys.map(key => [key, Array.isArray(baseSource[key]) ? structuredClone(baseSource[key]) : []])) as WorkspaceSnapshot;
  const status = ['idle', 'offline', 'syncing', 'failed'].includes(String(rawSync.status))
    ? rawSync.status as DeviceWorkspace['sync']['status'] : 'failed';
  return {
    version: 2,
    ...snapshot,
    sync: {
      status,
      base,
      preparedAt: typeof rawSync.preparedAt === 'string' ? rawSync.preparedAt : undefined,
      lastSyncedAt: typeof rawSync.lastSyncedAt === 'string' ? rawSync.lastSyncedAt : undefined,
      lastError: typeof rawSync.lastError === 'string' ? rawSync.lastError : undefined,
      legacyImported: rawSync.legacyImported === true,
      recovery: Array.isArray(rawSync.recovery) ? structuredClone(rawSync.recovery) as DeviceConflict[] : [],
      pending: rawSync.pending && typeof rawSync.pending === 'object' ? structuredClone(rawSync.pending) as DeviceSyncPlan : undefined,
    },
  };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const now = () => new Date().toISOString();
const newId = () => `device-${crypto.randomUUID()}`;
const missing = (): never => { throw new Error('기기 자료를 찾을 수 없습니다. 스냅샷과 현재 계정을 확인해주세요.'); };
const find = <T extends Item>(items: T[], id?: string) => items.find(item => item.id === id) ?? missing();
const allowedId = (id: unknown): id is string => typeof id === 'string' && /^device-[\w-]{1,100}$/.test(id);
const idFor = (input: Record<string, unknown>) => {
  if (input.id === undefined) return newId();
  if (!allowedId(input.id)) throw new Error('기기 전용 자료 ID가 아닙니다.');
  return input.id;
};

// Pure contract implementation. Persistence wraps the WHOLE operation in one IDB transaction.
export function handleDeviceRequest(state: DeviceWorkspace, method: string, path: string, input?: unknown): unknown {
  const url = new URL(path, 'https://device.invalid');
  const parts = url.pathname.replace(/^.*?\/api\//, '').split('/').map(decodeURIComponent);
  const body = record(input);
  const verb = method.toUpperCase();
  if (verb !== 'GET' && state.sync.status === 'syncing') throw new Error('동기화 중입니다. 완료 후 다시 편집해주세요. 입력은 편집기 초안에 보존됩니다.');
  const [resource, id, relation, memberId] = parts;
  if (resource === 'notes' && parts.length <= 2) {
    if (verb === 'GET') {
      if (id) return find(state.notes, id);
      if (url.searchParams.get('view') === 'summary') return { notes: state.notes.map(note => ({ id: note.id, title: note.title, revision: note.revision, created_at: note.created_at, updated_at: note.updated_at })) };
      return state.notes;
    }
    if (verb === 'POST' || verb === 'PATCH') {
      const noteId = id ?? (typeof body.id === 'string' && state.notes.some(note => note.id === body.id) ? body.id : idFor(body));
      const existing = state.notes.find(note => note.id === noteId);
      if (verb === 'PATCH' && !existing) missing();
      const revision = typeof body.revision === 'number' ? body.revision : Number(existing?.revision ?? 0) + 1;
      if (revision !== Number(existing?.revision ?? 0) + 1) throw new Error('노트 저장 충돌 — 기기 원본을 다시 확인해주세요.');
      const note: Item = { ...existing, ...body, id: noteId, revision, created_at: existing?.created_at ?? now(), updated_at: now() };
      if (typeof note.title !== 'string' || (!Array.isArray(note.content) && typeof record(note.content).markdown !== 'string')) throw new Error('지원하지 않는 노트 형식입니다.');
      state.notes = [...state.notes.filter(item => item.id !== noteId), note];
      return note;
    }
    if (verb === 'DELETE' && id) {
      find(state.notes, id); state.notes = state.notes.filter(item => item.id !== id);
      state.noteFolders.forEach(folder => { folder.note_ids = (folder.note_ids as string[]).filter(value => value !== id); });
      return {};
    }
  }
  if (resource === 'note-folders' || (resource === 'canvas' && id === 'folders')) {
    const canvas = resource === 'canvas';
    const folderId = canvas ? relation : id;
    const childKind = canvas ? parts[3] : relation;
    const childId = canvas ? parts[4] : memberId;
    const folders = canvas ? state.canvasFolders : state.noteFolders;
    const field = canvas ? 'canvas_ids' : 'note_ids';
    if (verb === 'GET' && !folderId) return folders;
    if (childKind && childId && childKind === (canvas ? 'documents' : 'notes') && ['POST', 'DELETE'].includes(verb)) {
      find(canvas ? state.canvases : state.notes, childId);
      const folder = find(folders, folderId);
      const ids = folder[field] as string[];
      folder[field] = verb === 'POST' ? [...new Set([...ids, childId])] : ids.filter(value => value !== childId);
      return folder;
    }
    if (!childKind && ['POST', 'PATCH'].includes(verb)) {
      const existing = folderId ? find(folders, folderId) : undefined;
      const ids = body[field] ?? existing?.[field] ?? [];
      if (!Array.isArray(ids) || !ids.every(value => typeof value === 'string' && (canvas ? state.canvases : state.notes).some(item => item.id === value))) throw new Error('잘못된 폴더 연결입니다.');
      const folder = { ...existing, ...body, id: existing?.id ?? newId(), [field]: ids, created_at: existing?.created_at ?? now(), updated_at: now() };
      if (existing) Object.assign(existing, folder); else folders.push(folder);
      return folder;
    }
    if (verb === 'DELETE' && folderId && !childKind) {
      find(folders, folderId);
      if (canvas) state.canvasFolders = folders.filter(folder => folder.id !== folderId);
      else state.noteFolders = folders.filter(folder => folder.id !== folderId);
      return {};
    }
  }
  if (resource === 'canvas' && id === 'documents' && parts.length <= 3) {
    if (verb === 'GET') return relation ? find(state.canvases, relation) : state.canvases;
    if (verb === 'POST' && !relation) {
      const canvas = { id: newId(), title: String(body.title ?? '새 캔버스'), created_at: now(), updated_at: now() };
      state.canvases.push(canvas);
      state.canvasContents.push({ id: canvas.id, lines: [], images: [], textBoxes: [], revision: 0 });
      return canvas;
    }
    if (verb === 'PATCH' && relation) { const canvas = find(state.canvases, relation); canvas.title = String(body.title ?? canvas.title); canvas.updated_at = now(); return canvas; }
    if (verb === 'DELETE' && relation) {
      find(state.canvases, relation); state.canvases = state.canvases.filter(canvas => canvas.id !== relation);
      state.canvasContents = state.canvasContents.filter(canvas => canvas.id !== relation);
      state.canvasFolders.forEach(folder => { folder.canvas_ids = (folder.canvas_ids as string[]).filter(value => value !== relation); });
      return {};
    }
  }
  if ((resource === 'tasks' || resource === 'schedule-items') && parts.length <= 2) {
    const items = resource === 'tasks' ? state.tasks : state.schedules;
    if (verb === 'GET') return id ? find(items, id) : items;
    if (verb === 'POST' && !id) {
      const itemId = idFor(body);
      if (items.some(item => item.id === itemId)) throw new Error('이미 저장된 기기 자료입니다.');
      const item = { tags: [], links: [], time_logs: [], ...body, id: itemId, created_at: now(), updated_at: now() };
      items.push(item); return item;
    }
    if (verb === 'PATCH' && id) {
      const item = find(items, id); Object.assign(item, body, { id, updated_at: now() });
      return resource === 'tasks' ? { updatedTask: item } : { updatedScheduleItem: item };
    }
    if (verb === 'DELETE' && id) {
      const item = find(items, id);
      if (resource === 'tasks') state.tasks = items.filter(value => value.id !== id);
      else state.schedules = items.filter(value => value.id !== id);
      return resource === 'tasks' ? { deletedTask: item } : { deletedScheduleItem: item };
    }
  }
  if (resource === 'diary' && parts.length <= 2) {
    if (verb === 'GET' && id === 'dates') return state.diaries.map(item => item.entry_date).sort().reverse();
    const date = id ?? url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 확인해주세요.');
    const entry = state.diaries.find(item => item.entry_date === date);
    if (verb === 'GET') return entry ?? { entry_date: date, todos: [], grid: [], journal: [] };
    if (verb === 'PUT') {
      const next = { ...body, id: entry?.id ?? newId(), entry_date: date, created_at: entry?.created_at ?? now(), updated_at: now() };
      state.diaries = [...state.diaries.filter(item => item.entry_date !== date), next]; return next;
    }
  }
  throw new Error('기기 전용 모드에서는 이 서버 기능을 사용할 수 없습니다. 설정에서 동기화를 켜주세요.');
}

export function handleDeviceCanvas(state: DeviceWorkspace, event: string, request: Record<string, unknown>): unknown {
  if (event === 'canvas:save' && state.sync.status === 'syncing') throw new Error('동기화 중입니다. 완료 후 다시 저장해주세요.');
  if (!['canvas:load', 'canvas:save'].includes(event)) throw new Error('기기 전용 모드에서는 이 캔버스 서버 기능을 사용할 수 없습니다.');
  const canvasId = typeof request.canvasId === 'string' ? request.canvasId : undefined;
  const canvas = find(state.canvasContents, canvasId);
  if (event === 'canvas:load') return { ...canvas, loadStatus: 'COMPLETE', lastMutation: undefined };
  if (event === 'canvas:save') {
    const payload = record(request.payload), mutationId = String(request.mutationId ?? '');
    if (!mutationId) throw new Error('저장 ID가 필요합니다.');
    const encoded = JSON.stringify(payload);
    if (canvas.lastMutation?.id === mutationId) {
      if (canvas.lastMutation.payload !== encoded) throw new Error('캔버스 저장 충돌');
      return { mutationId, revision: canvas.lastMutation.revision, duplicate: true, storageStatus: 'READY' };
    }
    for (const [field, suffix] of [['lines', 'Lines'], ['images', 'Images'], ['textBoxes', 'TextBoxes']] as const) {
      const changes = (key: string): Item[] => {
        const value = payload[key] ?? [];
        if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== 'string')) throw new Error('잘못된 캔버스 변경입니다.');
        return value as Item[];
      };
      const upserts = [...changes(`added${suffix}`), ...changes(`modified${suffix}`)];
      const removed = new Set([...upserts, ...changes(`deleted${suffix}`)].map(item => item.id));
      canvas[field] = [...canvas[field].filter(item => !removed.has(item.id)), ...upserts];
    }
    canvas.revision += 1;
    canvas.lastMutation = { id: mutationId, payload: encoded, revision: canvas.revision };
    find(state.canvases, canvasId).updated_at = now();
    return { mutationId, revision: canvas.revision, duplicate: false, storageStatus: 'READY' };
  }
  throw new Error('기기 전용 모드에서는 이 캔버스 서버 기능을 사용할 수 없습니다.');
}
