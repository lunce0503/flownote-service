import {
  createWorkspaceSnapshot,
  workspaceSnapshot,
  type DeviceConflict,
  type DeviceSyncOperation,
  type DeviceSyncPlan,
  type DeviceWorkspace,
  type Item,
  type WorkspaceSnapshot,
} from './deviceWorkspace.ts';

const collections = [
  'notes', 'noteFolders', 'canvases', 'canvasFolders', 'canvasContents', 'tasks', 'schedules', 'diaries',
] as const satisfies readonly (keyof WorkspaceSnapshot)[];
const operationOrder = [
  'notes', 'canvases', 'canvasContents', 'tasks', 'schedules', 'diaries', 'noteFolders', 'canvasFolders',
] as const satisfies readonly (keyof WorkspaceSnapshot)[];
const metadataKeys = new Set(['created_at', 'updated_at', 'revision', 'client_id', 'lastMutation']);

const itemKey = (collection: keyof WorkspaceSnapshot, item: Item) => (
  collection === 'diaries' && typeof item.entry_date === 'string' ? item.entry_date : item.id
);
const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).filter(key => !metadataKeys.has(key)).sort().map(key => [key, stable(value[key])]));
};
const same = (left: unknown, right: unknown) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

const stringEditScore = (base: string, changed: string) => {
  if (base === changed) return 0;
  let prefix = 0;
  while (prefix < base.length && prefix < changed.length && base[prefix] === changed[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < base.length - prefix && suffix < changed.length - prefix
    && base[base.length - 1 - suffix] === changed[changed.length - 1 - suffix]) suffix += 1;
  const changedSpan = changed.slice(prefix, changed.length - suffix);
  const baseSpan = base.slice(prefix, base.length - suffix);
  const changedTokens = changedSpan.trim() ? changedSpan.trim().split(/\s+/u).length : 0;
  const baseTokens = baseSpan.trim() ? baseSpan.trim().split(/\s+/u).length : 0;
  return 1 + Math.max(changedTokens, baseTokens) + Math.ceil(Math.abs(changedSpan.length - baseSpan.length) / 16);
};

const weight = (value: unknown): number => {
  if (value == null) return 1;
  if (typeof value === 'string') return 1 + Math.ceil(value.trim().length / 24);
  if (Array.isArray(value)) return 1 + value.reduce((sum, entry) => sum + weight(entry), 0);
  if (isObject(value)) return 1 + Object.entries(value).filter(([key]) => !metadataKeys.has(key)).reduce((sum, [, entry]) => sum + weight(entry), 0);
  return 1;
};

export const meaningfulEditScore = (base: unknown, changed: unknown): number => {
  if (same(base, changed)) return 0;
  if (changed == null || base == null) return weight(base ?? changed);
  if (typeof base === 'string' && typeof changed === 'string') return stringEditScore(base, changed);
  if (Array.isArray(base) && Array.isArray(changed)) {
    const length = Math.max(base.length, changed.length);
    let score = Math.abs(base.length - changed.length);
    for (let index = 0; index < length; index += 1) score += meaningfulEditScore(base[index], changed[index]);
    return Math.max(1, score);
  }
  if (isObject(base) && isObject(changed)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(changed)]);
    let score = 0;
    for (const key of keys) if (!metadataKeys.has(key)) score += meaningfulEditScore(base[key], changed[key]);
    return Math.max(1, score);
  }
  return 1;
};

const latestSide = (local: Item | null, remote: Item | null): 'local' | 'remote' => {
  const localTime = Date.parse(String(local?.updated_at ?? '')) || 0;
  const remoteTime = Date.parse(String(remote?.updated_at ?? '')) || 0;
  return remoteTime > localTime ? 'remote' : 'local';
};

const mergeIdArray = (base: unknown, local: unknown, remote: unknown, winner: 'local' | 'remote') => {
  if (![base, local, remote].every(value => Array.isArray(value) && value.every(entry => typeof entry === 'string'))) {
    return winner === 'local' ? structuredClone(local) : structuredClone(remote);
  }
  const baseSet = new Set(base as string[]), localSet = new Set(local as string[]), remoteSet = new Set(remote as string[]);
  const all = [...new Set([...(remote as string[]), ...(local as string[]), ...(base as string[])])];
  return all.filter(id => {
    const inBase = baseSet.has(id), inLocal = localSet.has(id), inRemote = remoteSet.has(id);
    if (inLocal === inRemote) return inLocal;
    if (inLocal === inBase) return inRemote;
    if (inRemote === inBase) return inLocal;
    return winner === 'local' ? inLocal : inRemote;
  });
};

const mergeElementArray = (base: unknown, local: unknown, remote: unknown, winner: 'local' | 'remote') => {
  if (![base, local, remote].every(value => Array.isArray(value) && value.every(entry => isObject(entry) && typeof entry.id === 'string'))) {
    return winner === 'local' ? structuredClone(local) : structuredClone(remote);
  }
  const byId = (value: unknown) => new Map((value as Item[]).map(item => [item.id, item]));
  const baseMap = byId(base), localMap = byId(local), remoteMap = byId(remote);
  const ids = [...new Set([...(remote as Item[]).map(item => item.id), ...(local as Item[]).map(item => item.id), ...(base as Item[]).map(item => item.id)])];
  return ids.flatMap(id => {
    const b = baseMap.get(id) ?? null, l = localMap.get(id) ?? null, r = remoteMap.get(id) ?? null;
    if (same(l, r)) return l ? [structuredClone(l)] : [];
    if (same(l, b)) return r ? [structuredClone(r)] : [];
    if (same(r, b)) return l ? [structuredClone(l)] : [];
    const selected = winner === 'local' ? l : r;
    return selected ? [structuredClone(selected)] : [];
  });
};

const elementArrayHasConflict = (base: unknown, local: unknown, remote: unknown) => {
  if (![base, local, remote].every(value => Array.isArray(value) && value.every(entry => isObject(entry) && typeof entry.id === 'string'))) return true;
  const byId = (value: unknown) => new Map((value as Item[]).map(item => [item.id, item]));
  const b = byId(base), l = byId(local), r = byId(remote);
  for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const bv = b.get(id) ?? null, lv = l.get(id) ?? null, rv = r.get(id) ?? null;
    if (!same(lv, bv) && !same(rv, bv) && !same(lv, rv)) return true;
  }
  return false;
};

const mergeItem = (
  collection: keyof WorkspaceSnapshot,
  base: Item,
  local: Item,
  remote: Item,
  winner: 'local' | 'remote',
) => {
  const result: Record<string, unknown> = {};
  let conflicted = false;
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const b = base[key], l = local[key], r = remote[key];
    if (same(l, r)) result[key] = structuredClone(l);
    else if (same(l, b)) result[key] = structuredClone(r);
    else if (same(r, b)) result[key] = structuredClone(l);
    else if (metadataKeys.has(key)) result[key] = structuredClone(winner === 'local' ? l : r);
    else if ((key === 'note_ids' || key === 'noteIds' || key === 'canvas_ids' || key === 'canvasIds')) {
      result[key] = mergeIdArray(b, l, r, winner);
    } else if (collection === 'canvasContents' && ['lines', 'images', 'textBoxes'].includes(key)) {
      result[key] = mergeElementArray(b, l, r, winner);
      conflicted ||= elementArrayHasConflict(b, l, r);
    } else if ((collection === 'tasks' && key === 'time_logs') || (collection === 'diaries' && key === 'todos')) {
      result[key] = mergeElementArray(b, l, r, winner);
      conflicted ||= elementArrayHasConflict(b, l, r);
    } else {
      result[key] = structuredClone(winner === 'local' ? l : r);
      conflicted = true;
    }
  }
  return { item: result as Item, conflicted };
};

export function reconcileWorkspace(
  base: WorkspaceSnapshot,
  local: WorkspaceSnapshot,
  remote: WorkspaceSnapshot,
  syncId: string,
  createdAt = new Date().toISOString(),
): { workspace: WorkspaceSnapshot; conflicts: DeviceConflict[] } {
  const workspace = createWorkspaceSnapshot();
  const conflicts: DeviceConflict[] = [];
  for (const collection of collections) {
    const map = (items: Item[]) => new Map(items.map(item => [itemKey(collection, item), item]));
    const baseMap = map(base[collection]), localMap = map(local[collection]), remoteMap = map(remote[collection]);
    const ids = [...new Set([...remoteMap.keys(), ...localMap.keys(), ...baseMap.keys()])];
    const resolved: Item[] = [];
    for (const id of ids) {
      const b = baseMap.get(id) ?? null, l = localMap.get(id) ?? null, r = remoteMap.get(id) ?? null;
      if (same(l, r)) { if (l) resolved.push(structuredClone(l)); continue; }
      if (same(l, b)) { if (r) resolved.push(structuredClone(r)); continue; }
      if (same(r, b)) { if (l) resolved.push(structuredClone(l)); continue; }
      const localScore = meaningfulEditScore(b, l);
      const remoteScore = meaningfulEditScore(b, r);
      const winner = localScore === remoteScore ? latestSide(l, r) : localScore > remoteScore ? 'local' : 'remote';
      const merged = l && r && b ? mergeItem(collection, b, l, r, winner) : null;
      const selected = merged?.item ?? (winner === 'local' ? l : r);
      if (selected) resolved.push(structuredClone(selected));
      if (!merged || merged.conflicted) conflicts.push({
        id: `${syncId}:${collection}:${id}`,
        syncId,
        collection,
        itemId: id,
        winner,
        base: b ? structuredClone(b) : null,
        local: l ? structuredClone(l) : null,
        remote: r ? structuredClone(r) : null,
        loser: winner === 'local' ? (r ? structuredClone(r) : null) : (l ? structuredClone(l) : null),
        localScore,
        remoteScore,
        createdAt,
      });
    }
    workspace[collection] = resolved as never;
  }
  return { workspace, conflicts };
}

const appendUnique = (target: Item[], candidates: Item[], collection: keyof WorkspaceSnapshot, previousBase: WorkspaceSnapshot) => {
  const ids = new Set(target.map(item => itemKey(collection, item)));
  const baseIds = new Set(previousBase[collection].map(item => itemKey(collection, item)));
  for (const item of candidates) {
    const id = itemKey(collection, item);
    if (ids.has(id)) continue;
    if (item.id.startsWith('device-') || !baseIds.has(id)) {
      target.push(structuredClone(item));
      ids.add(id);
    }
  }
};

export function prepareOfflineWorkspace(state: DeviceWorkspace, cloudValue: WorkspaceSnapshot | DeviceWorkspace, preparedAt = new Date().toISOString()) {
  if (state.sync.status === 'syncing') throw new Error('이전 동기화를 마친 뒤 다시 시도해주세요.');
  const cloud = workspaceSnapshot(cloudValue);
  const previous = workspaceSnapshot(state);
  const next = structuredClone(cloud);
  for (const collection of collections) appendUnique(next[collection], previous[collection], collection, state.sync.base);
  for (const collection of collections) state[collection] = next[collection] as never;
  state.sync = {
    ...state.sync,
    status: 'offline',
    base: structuredClone(cloud),
    preparedAt,
    lastError: undefined,
    pending: undefined,
  };
}

const relationKeys = new Set(['note_ids', 'noteIds', 'canvas_ids', 'canvasIds']);
const remapValue = (value: unknown, idMap: Record<string, string>): unknown => {
  if (typeof value === 'string') return idMap[value] ?? value;
  if (Array.isArray(value)) return value.map(entry => remapValue(entry, idMap));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    key === 'id' || relationKeys.has(key) ? remapValue(entry, idMap) : structuredClone(entry),
  ]));
};

const remapSnapshot = (source: WorkspaceSnapshot, idMap: Record<string, string>): WorkspaceSnapshot => {
  const result = createWorkspaceSnapshot();
  for (const collection of collections) result[collection] = source[collection].map(item => remapValue(item, idMap) as Item) as never;
  return result;
};

export function buildDeviceSyncPlan(
  state: DeviceWorkspace,
  remoteValue: WorkspaceSnapshot | DeviceWorkspace,
  syncId = crypto.randomUUID(),
  idFactory: () => string = () => crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): DeviceSyncPlan {
  const local = workspaceSnapshot(state);
  const remote = workspaceSnapshot(remoteValue);
  const idMap = { ...(state.sync.pending?.idMap ?? {}) };
  for (const collection of collections) {
    for (const item of local[collection]) {
      if (item.id.startsWith('device-') && !idMap[item.id]) idMap[item.id] = idFactory();
    }
  }
  const remappedLocal = remapSnapshot(local, idMap);
  const { workspace: desired, conflicts } = reconcileWorkspace(state.sync.base, remappedLocal, remote, syncId, createdAt);
  const operations: DeviceSyncOperation[] = [];
  for (const collection of operationOrder) {
    const desiredMap = new Map(desired[collection].map(item => [itemKey(collection, item), item]));
    const remoteMap = new Map(remote[collection].map(item => [itemKey(collection, item), item]));
    for (const id of [...new Set([...remoteMap.keys(), ...desiredMap.keys()])]) {
      const target = desiredMap.get(id), current = remoteMap.get(id);
      if (!target && current) {
        operations.push({ id: `${syncId}:${collection}:${id}:delete`, collection, action: 'delete', itemId: id, remote: structuredClone(current) });
      } else if (target && (!current || !same(target, current))) {
        operations.push({ id: `${syncId}:${collection}:${id}:upsert`, collection, action: 'upsert', itemId: id, value: structuredClone(target), remote: current ? structuredClone(current) : undefined });
      }
    }
  }
  return { id: syncId, createdAt, cursor: 0, idMap, desired, operations, conflicts };
}
