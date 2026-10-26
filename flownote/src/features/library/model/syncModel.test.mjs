import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeBook, bookChanges, dirtyBook, mergeCloudBook, uploadBookMetadata } from './syncModel.ts';

const book = { id: 'a', title: 'Original', subject: 'Math', page: 1, pages: 10, bookmarks: [2], favorite: false,
    cover: 'cover', filename: 'a.pdf', bytes: 100, createdAt: '2026-10-26T00:00:00Z' };
const cloud = (changes = {}) => ({ ...book, revision: 1, deleted: false, updatedAt: '2026-10-26T00:00:01Z', ...changes });

test('clean remote metadata is shared but a pending local field survives another device edit', () => {
    const initial = mergeCloudBook(undefined, cloud());
    let local = dirtyBook({ ...initial, title: 'Local title' }, ['title']);
    local = mergeCloudBook(local, cloud({ revision: 2, subject: 'Physics', title: 'Remote title', page: 3 }));
    assert.equal(local.title, 'Local title'); assert.equal(local.subject, 'Physics'); assert.equal(local.page, 3);
    assert.deepEqual(bookChanges(local), { title: 'Local title' });
    assert.equal(mergeCloudBook(local, cloud()).title, 'Local title', 'stale responses cannot replace current state');
});
test('an old ACK never clears later edits, including toggles made during upload', () => {
    const first = dirtyBook({ ...mergeCloudBook(undefined, cloud()), title: 'First' }, ['title']);
    const captured = { ...first.dirty };
    const second = dirtyBook({ ...first, title: 'Second', favorite: true }, ['title', 'favorite']);
    const result = acknowledgeBook(second, cloud({ revision: 2, title: 'First' }), captured);
    assert.equal(result.title, 'Second'); assert.equal(result.favorite, true);
    assert.deepEqual(Object.keys(result.dirty).sort(), ['favorite', 'title']);
    const settled = acknowledgeBook(result, cloud({ revision: 3, title: 'Second', favorite: true }), result.dirty);
    assert.equal(settled.dirty, undefined); assert.equal(settled.cloudRevision, 3);
});
test('bookmark three-way merge keeps remote additions and deliberate local removals', () => {
    const local = dirtyBook({ ...mergeCloudBook(undefined, cloud()), bookmarks: [4] }, ['bookmarks']);
    const result = mergeCloudBook(local, cloud({ revision: 2, bookmarks: [2, 6] }));
    assert.deepEqual(result.bookmarks, [4, 6]);
});
test('cloud tombstones prevent stale device resurrection; API upload excludes local internals', () => {
    const local = dirtyBook({ ...mergeCloudBook(undefined, cloud()), title: 'Pending', deleted: true }, ['title']);
    assert.equal(mergeCloudBook(local, cloud({ revision: 2, deleted: true })).deleted, true);
    assert.equal(acknowledgeBook(local, cloud({ revision: 2 }), local.dirty).deleted, true);
    const payload = uploadBookMetadata({ ...local, uploadId: 'private-upload', syncError: 'local' });
    for (const field of ['dirty', 'cloudBase', 'cloudRevision', 'localVersion', 'deleted', 'uploadId', 'syncError', 'user_id']) assert.equal(field in payload, false);
});
