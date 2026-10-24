import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingCloudDraftMessage } from './devicePendingDrafts.ts';
import { createWorkspaceSnapshot } from './deviceWorkspace.ts';

test('turning sync off refuses an unacknowledged cloud note draft instead of hiding it in a different workspace', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ id: 'owner' }) };
  try {
    const cloud = createWorkspaceSnapshot();
    cloud.notes.push({ id: 'cloud-note', title: '서버 노트', content: { markdown: 'saved' } });
    const backup = { notes: [{ key: 'draft', value: { userId: 'owner', note: { id: 'cloud-note', title: '서버 노트', content: { markdown: 'unsaved' } } } }], canvases: [], operations: [] };
    const original = structuredClone(backup);
    assert.match(pendingCloudDraftMessage(cloud, backup), /서버에 저장되지 않은.*동기화를 끄지 않았/);
    assert.deepEqual(backup, original, 'a refused transition must not erase the draft');
    cloud.notes[0].content.markdown = 'unsaved';
    assert.equal(pendingCloudDraftMessage(cloud, backup), '', 'already saved acknowledgements must not block');
    backup.notes[0].value.userId = 'other-owner';
    cloud.notes = [];
    assert.equal(pendingCloudDraftMessage(cloud, backup), '', 'another account draft is not this account data');
  } finally { delete globalThis.localStorage; }
});

test('cloud canvas drafts and retry operations block only their owning snapshot canvases', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ id: 'owner' }) };
  try {
    const cloud = createWorkspaceSnapshot();
    cloud.canvases.push({ id: 'own-canvas' });
    const backup = { notes: [], canvases: [{ key: 'other-canvas', value: { hasPendingChanges: true } }], operations: [] };
    assert.equal(pendingCloudDraftMessage(cloud, backup), '');
    backup.canvases[0].key = 'own-canvas';
    assert.match(pendingCloudDraftMessage(cloud, backup), /캔버스.*동기화를 끄지 않았/);
    backup.canvases[0].value.hasPendingChanges = false;
    assert.equal(pendingCloudDraftMessage(cloud, backup), '');
    backup.operations.push({ key: 'retryQueue', value: [{ canvasId: 'own-canvas' }] });
    assert.match(pendingCloudDraftMessage(cloud, backup), /저장 대기.*동기화를 끄지 않았/);
    backup.operations[0].value[0].canvasId = 'other-canvas';
    assert.equal(pendingCloudDraftMessage(cloud, backup), '');
  } finally { delete globalThis.localStorage; }
});
