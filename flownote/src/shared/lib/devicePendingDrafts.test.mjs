import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingDeviceDraftMessage } from './devicePendingDrafts.ts';
import { createDeviceWorkspace } from './deviceWorkspace.ts';

test('mode changes preserve unmatched editor drafts and ignore already-saved acknowledgements', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ id: 'owner' }) };
  try {
    const workspace = createDeviceWorkspace();
    const note = { id: 'device-note', title: 'Draft', content: { format: 'markdown', markdown: 'saved' } };
    workspace.notes.push(note);
    const backup = { notes: [{ key: 'note', value: { userId: 'owner', note: structuredClone(note) } }], canvases: [], operations: [] };
    assert.equal(pendingDeviceDraftMessage(workspace, backup), '');
    backup.notes[0].value.note.content.markdown = 'unsaved input';
    assert.match(pendingDeviceDraftMessage(workspace, backup), /미저장 초안/);
    backup.notes[0].value.userId = 'another-owner';
    assert.equal(pendingDeviceDraftMessage(workspace, backup), '');
    backup.canvases.push({ key: 'canvas', value: { hasPendingChanges: true } });
    assert.match(pendingDeviceDraftMessage(workspace, backup), /캔버스.*미저장/);
    backup.canvases = [];
    backup.operations.push({ key: 'retryQueue', value: [{ mutationId: 'not-uploaded' }] });
    assert.match(pendingDeviceDraftMessage(workspace, backup), /저장 대기/);
  } finally { delete globalThis.localStorage; }
});
