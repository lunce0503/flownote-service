import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceWorkspace, handleDeviceRequest, handleDeviceCanvas } from './deviceWorkspace.ts';

test('device notes and folders keep full content, revision and summaries without a server', () => {
  const state = createDeviceWorkspace();
  const note = handleDeviceRequest(state, 'POST', '/api/notes', { id: 'device-note', title: '기기 노트', content: { format: 'markdown', markdown: '# local' }, revision: 1 });
  assert.equal(note.id, 'device-note');
  assert.deepEqual(handleDeviceRequest(state, 'GET', '/api/notes/device-note').content, note.content);
  assert.equal(handleDeviceRequest(state, 'GET', '/api/notes?view=summary').notes[0].content, undefined);
  assert.throws(() => handleDeviceRequest(state, 'POST', '/api/notes', { ...note, revision: 0 }), /충돌/);
  const folder = handleDeviceRequest(state, 'POST', '/api/note-folders', { name: '폴더', category: '기본' });
  assert.deepEqual(handleDeviceRequest(state, 'POST', `/api/note-folders/${folder.id}/notes/device-note`).note_ids, ['device-note']);
  handleDeviceRequest(state, 'DELETE', `/api/note-folders/${folder.id}`);
  assert.equal(handleDeviceRequest(state, 'GET', '/api/notes/device-note').title, '기기 노트');
});

test('planner contracts, unsupported cloud actions and foreign resource IDs fail closed', () => {
  const state = createDeviceWorkspace();
  const task = handleDeviceRequest(state, 'POST', '/api/tasks', { task_name: 'local' });
  assert.equal(handleDeviceRequest(state, 'PATCH', `/api/tasks/${task.id}`, { status: 'DONE' }).updatedTask.status, 'DONE');
  const schedule = handleDeviceRequest(state, 'POST', '/api/schedule-items', { title: '일정' });
  assert.equal(handleDeviceRequest(state, 'PATCH', `/api/schedule-items/${schedule.id}`, { title: '수정' }).updatedScheduleItem.title, '수정');
  handleDeviceRequest(state, 'PUT', '/api/diary/2026-10-20', { journal: [{ text: 'local' }] });
  assert.deepEqual(handleDeviceRequest(state, 'GET', '/api/diary/dates'), ['2026-10-20']);
  assert.throws(() => handleDeviceRequest(state, 'POST', '/api/chat', { text: 'private' }), /기기 전용/);
  assert.throws(() => handleDeviceRequest(state, 'PATCH', '/api/notes/cloud-note', { title: 'unsafe' }), /찾을 수 없/);
});

test('canvas snapshots apply deltas atomically and duplicate mutations do not duplicate strokes', () => {
  const state = createDeviceWorkspace();
  const canvas = handleDeviceRequest(state, 'POST', '/api/canvas/documents', { title: '로컬 필기' });
  const request = { canvasId: canvas.id, mutationId: 'a', payload: { addedLines: [{ id: 'l1', points: [{ x: 1, y: 2 }] }] } };
  assert.equal(handleDeviceCanvas(state, 'canvas:save', request).revision, 1);
  assert.equal(handleDeviceCanvas(state, 'canvas:save', request).duplicate, true);
  assert.equal(handleDeviceCanvas(state, 'canvas:load', { canvasId: canvas.id }).lines.length, 1);
  assert.throws(() => handleDeviceCanvas(state, 'canvas:save', { ...request, payload: { deletedLines: [{ id: 'l1' }] } }), /충돌/);
  handleDeviceCanvas(state, 'canvas:save', { ...request, mutationId: 'b', payload: { deletedLines: [{ id: 'l1' }] } });
  assert.equal(handleDeviceCanvas(state, 'canvas:load', { canvasId: canvas.id }).lines.length, 0);
  assert.throws(() => handleDeviceCanvas(state, 'canvas:unknown', {}), /기기 전용/);
});
