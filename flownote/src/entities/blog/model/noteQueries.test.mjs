import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectNoteSummaries } from './noteQueries.ts';
test('all summary pages are traversed without synthesizing body content', async () => {
  const cursors = [];
  const notes = await collectNoteSummaries(async cursor => {
    cursors.push(cursor);
    return cursor ? { notes: [{ id: 'b', title: 'B' }] } : { notes: [{ id: 'a', title: 'A' }], next_cursor: 'second' };
  });
  assert.deepEqual(cursors, [undefined, 'second']);
  assert.deepEqual(notes.map(n => n.id), ['a', 'b']);
  assert.equal('content' in notes[0], false);
});
test('a repeated cursor fails instead of looping or returning a partial library', async () => {
  await assert.rejects(collectNoteSummaries(async () => ({ notes: [], next_cursor: 'same' })), /cursor/);
});
test('page errors propagate instead of presenting a complete empty library', async () => {
  await assert.rejects(collectNoteSummaries(async () => { throw new Error('page unavailable'); }), /unavailable/);
});
test('the first metadata page is usable before a slow later page completes', async () => {
  let release;
  const later = new Promise(resolve => { release = resolve; });
  const pages = [];
  const done = collectNoteSummaries(async cursor => cursor ? later : {
    notes: [{ id: 'first', title: 'First' }], next_cursor: 'later',
  }, notes => pages.push(notes));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(pages, [[{ id: 'first', title: 'First' }]]);
  release({ notes: [{ id: 'last', title: 'Last' }] });
  assert.deepEqual((await done).map(note => note.id), ['first', 'last']);
  assert.equal(pages[0].length, 1, 'published pages are not mutated by later results');
});
