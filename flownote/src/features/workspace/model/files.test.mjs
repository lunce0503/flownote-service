import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFiles, workspaceFileKey } from './files.ts';
const canvases = [{ id: 'same', title: 'Calculus canvas', updated_at: '2026-10-25' }];
const notes = [{ id: 'same', title: 'Calculus note', updated_at: '2026-10-26' }, { id: 'other', title: 'Physics', updated_at: '2026-10-24' }];
const canvasFolders = [{ id: 'folder', canvasIds: ['same'] }];
const noteFolders = [{ id: 'folder', noteIds: ['same'] }];
const files = (location = 'all', query = '', kind = 'all') => workspaceFiles(canvases, notes, canvasFolders, noteFolders, location, query, kind);
test('one recent/search list interleaves notes and canvases and keeps identities distinct', () => {
 assert.deepEqual(files().map(workspaceFileKey), ['note:same', 'canvas:same', 'note:other']);
 assert.equal(new Set(files().map(workspaceFileKey)).size, 3);
 assert.deepEqual(files('all','calculus').map(file => file.kind), ['note','canvas']);
 assert.deepEqual(files('all','','note').map(file => file.title), ['Calculus note','Physics']);
});
test('legacy folders keep the correct domain membership and unfiled state', () => {
 assert.deepEqual(files('folder').map(workspaceFileKey), ['canvas:same']);
 assert.deepEqual(files('note:folder').map(workspaceFileKey), ['note:same']);
 assert.deepEqual(files('unfiled').map(workspaceFileKey), ['note:other']);
});
test('search is not restricted to the six recent files', () => {
 const many = Array.from({length:10},(_,i)=>({ id:String(i),title:`Note ${i}`,updated_at:`2026-10-${String(i+1).padStart(2,'0')}` }));
 assert.equal(workspaceFiles([],many,[],[],'recent','','all').length,6);
 assert.equal(workspaceFiles([],many,[],[],'recent','Note 0','all')[0].id,'0');
});
