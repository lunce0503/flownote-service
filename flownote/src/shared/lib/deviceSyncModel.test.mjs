import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeviceSyncPlan,
  prepareOfflineWorkspace,
  reconcileWorkspace,
} from './deviceSyncModel.ts';
import { createDeviceWorkspace, migrateDeviceWorkspace } from './deviceWorkspace.ts';

const note = (id, title, markdown, revision = 1, updated_at = '2026-10-20T00:00:00.000Z') => ({
  id, title, revision, updated_at,
  content: { format: 'markdown', version: 1, markdown },
});

test('v1 workspaces migrate without dropping device documents or drafts', () => {
  const legacy = {
    version: 1,
    notes: [note('device-legacy-note', '기존 기기 노트', '절대 지우지 않기')],
    noteFolders: [], canvases: [], canvasFolders: [], canvasContents: [],
    tasks: [{ id: 'device-task', task_name: '기존 작업' }], schedules: [], diaries: [],
  };
  const migrated = migrateDeviceWorkspace(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.notes[0].id, 'device-legacy-note');
  assert.equal(migrated.tasks[0].id, 'device-task');
  assert.equal(migrated.sync.legacyImported, true);
});

test('turning sync off snapshots cloud data while preserving legacy device-only material', () => {
  const local = createDeviceWorkspace();
  local.notes.push(note('device-legacy-note', '기기 초안', 'local only'));
  local.canvases.push({ id: 'device-canvas', title: '기기 캔버스' });
  local.canvasContents.push({ id: 'device-canvas', lines: [{ id: 'line-local', points: [{ x: 1, y: 1 }] }], images: [], textBoxes: [], revision: 2 });
  const cloud = createDeviceWorkspace();
  cloud.notes.push(note('11111111-1111-4111-8111-111111111111', '서버 노트', 'cloud'));
  cloud.canvases.push({ id: '22222222-2222-4222-8222-222222222222', title: '서버 캔버스' });
  cloud.canvasContents.push({ id: '22222222-2222-4222-8222-222222222222', lines: [], images: [{ id: 'image-1', url: 'data:image/png;base64,aGk=' }], textBoxes: [], revision: 4 });

  prepareOfflineWorkspace(local, cloud, '2026-10-21T00:00:00.000Z');
  assert.deepEqual(local.notes.map(item => item.id).sort(), ['11111111-1111-4111-8111-111111111111', 'device-legacy-note']);
  assert.deepEqual(local.canvases.map(item => item.id).sort(), ['22222222-2222-4222-8222-222222222222', 'device-canvas']);
  assert.equal(local.canvasContents.find(item => item.id.startsWith('2222')).images[0].url, 'data:image/png;base64,aGk=');
  assert.equal(local.sync.base.notes.length, 1);
  assert.equal(local.sync.status, 'offline');
});

test('three-way reconciliation combines unrelated edits and picks the more meaningful conflicting edit', () => {
  const base = createDeviceWorkspace();
  base.notes.push(note('note-a', '기준 제목', 'one two three'));
  base.tasks.push({ id: 'task-a', task_name: '기준 작업', status: 'TODO' });

  const local = structuredClone(base);
  local.notes[0] = note('note-a', '기준 제목', 'one two three four five six seven');
  local.tasks[0].status = 'DONE';

  const remote = structuredClone(base);
  remote.notes[0] = note('note-a', '기준 제목', 'one two changed');
  remote.notes.push(note('note-b', '다른 기기', 'remote only'));
  remote.tasks[0].task_name = '서버에서 이름 변경';

  const result = reconcileWorkspace(base, local, remote, 'sync-a');
  assert.equal(result.workspace.notes.find(item => item.id === 'note-a').content.markdown, 'one two three four five six seven');
  assert.equal(result.workspace.notes.find(item => item.id === 'note-b').title, '다른 기기');
  assert.equal(result.workspace.tasks[0].status, 'DONE');
  assert.equal(result.workspace.tasks[0].task_name, '서버에서 이름 변경');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].winner, 'local');
  assert.equal(result.conflicts[0].loser.content.markdown, 'one two changed');
});

test('deletion conflicts are scored, the loser is recoverable, and ties prefer the newer timestamp', () => {
  const base = createDeviceWorkspace();
  base.notes.push(note('note-a', '기준', '짧은 본문'));
  const local = structuredClone(base);
  local.notes = [];
  const remote = structuredClone(base);
  remote.notes[0] = note('note-a', '기준', '서버에서 길고 의미 있게 여러 단락을 편집했습니다\n둘째 단락', 2, '2026-10-21T01:00:00.000Z');
  const result = reconcileWorkspace(base, local, remote, 'sync-delete');
  assert.equal(result.workspace.notes[0].revision, 2);
  assert.equal(result.conflicts[0].winner, 'remote');
  assert.equal(result.conflicts[0].loser, null);
});

test('partial sync successes become the base for later offline edits without reusing the old edit score', () => {
  const state = createDeviceWorkspace();
  state.tasks.push({ id: 'device-task', task_name: 'first', status: 'TODO' });
  const remote = createDeviceWorkspace();
  const first = buildDeviceSyncPlan(state, remote, 'sync-first', () => 'task-cloud');
  first.cursor = first.operations.length;
  state.sync.pending = first;
  remote.tasks.push({ ...first.desired.tasks[0], memo: null, time_logs: [], updated_at: '2026-10-22T00:00:00Z' });
  state.tasks[0].task_name = 'next';
  remote.tasks[0].status = 'DONE';
  const retry = buildDeviceSyncPlan(state, remote, 'sync-retry');
  assert.equal(retry.desired.tasks[0].id, 'task-cloud');
  assert.equal(retry.desired.tasks[0].task_name, 'next');
  assert.equal(retry.desired.tasks[0].status, 'DONE');
  assert.equal(retry.conflicts.length, 0);
});

test('sync plans remap device ids consistently and keep a resumable ordered operation cursor', () => {
  const workspace = createDeviceWorkspace();
  workspace.sync.base = structuredClone(createDeviceWorkspace());
  workspace.notes.push(note('device-note', '로컬', 'draft'));
  workspace.noteFolders.push({ id: 'device-folder', category: '기본', name: '로컬 폴더', note_ids: ['device-note'] });
  workspace.canvases.push({ id: 'device-canvas', title: '로컬 캔버스' });
  workspace.canvasContents.push({ id: 'device-canvas', lines: [{ id: 'device-line', points: [] }], images: [], textBoxes: [], revision: 1 });
  const remote = createDeviceWorkspace();
  const ids = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  ];
  const plan = buildDeviceSyncPlan(workspace, remote, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', () => ids.shift());
  const mappedNote = plan.idMap['device-note'];
  const mappedCanvas = plan.idMap['device-canvas'];
  assert.match(mappedNote, /^[a-f0-9-]{36}$/);
  assert.equal(plan.desired.noteFolders[0].note_ids[0], mappedNote);
  assert.equal(plan.desired.canvasContents[0].id, mappedCanvas);
  assert.equal(plan.cursor, 0);
  assert.ok(plan.operations.find(op => op.collection === 'notes' && op.itemId === mappedNote));
  assert.ok(plan.operations.find(op => op.collection === 'canvasContents' && op.itemId === mappedCanvas));
  assert.ok(plan.operations.find(op => op.collection === 'noteFolders'));
});
