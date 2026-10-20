import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraftQueue, recoveryState } from './noteDrafts.ts';

const note = (title = '한글') => ({ id: 'n', title, content: [{ text: title }], created_at: '2026-10-18', revision: 4 });
const setup = () => {
  const rows = new Map();
  const storage = { read: async key => rows.get(key) ?? null, write: async (key, value) => { if (value) rows.set(key, value); else rows.delete(key); } };
  return { rows, queue: createDraftQueue(storage) };
};
test('body/title are durable before debounce and isolated by account', async () => {
  const { queue } = setup();
  const a = queue.capture('a', note(), 3);
  await a.persisted;
  assert.equal((await queue.read('a', 'n')).note.title, '한글');
  assert.equal(await queue.read('b', 'n'), null);
});
test('ack A cannot delete newer draft B; latest ack clears it', async () => {
  const { queue } = setup();
  const a = queue.capture('a', note('A'), 3);
  const b = queue.capture('a', note('B'), 3);
  await Promise.all([a.persisted, b.persisted]);
  await queue.ack('a', 'n', a.draft.sequence);
  assert.equal((await queue.read('a', 'n')).note.title, 'B');
  await queue.ack('a', 'n', b.draft.sequence);
  assert.equal(await queue.read('a', 'n'), null);
});
test('revocation fences delayed writes and acknowledgements', async () => {
  const { queue } = setup();
  const a = queue.capture('a', note(), 3);
  await queue.clearUser('a');
  await a.persisted;
  assert.equal(await queue.read('a', 'n'), null);
  assert.throws(() => queue.capture('a', note(), 3), /session/i);
  queue.activate('a');
  await queue.capture('a', note('new session'), 3).persisted;
  await queue.ack('a', 'n', a.draft.sequence);
  assert.equal((await queue.read('a', 'n')).note.title, 'new session');
});
test('storage failure rejects rather than claiming device persistence', async () => {
  const queue = createDraftQueue({ read: async () => null, write: async () => { throw new Error('quota'); } });
  await assert.rejects(queue.capture('a', note(), 3).persisted, /quota/);
});
test('recovery distinguishes matching server, unchanged base and remote edits', () => {
  const draft = { note: note('local'), baseRevision: 3 };
  assert.equal(recoveryState(draft, note('local')), 'matched');
  assert.equal(recoveryState(draft, { ...note('remote'), revision: 3 }), 'recover');
  assert.equal(recoveryState(draft, note('remote')), 'conflict');
});

test('account cleanup removes earlier-page drafts and preserves another account', async () => {
  const rows = new Map([[JSON.stringify(['a', 'old-note']), { sequence: 'old' }], [JSON.stringify(['b', 'n']), { sequence: 'other' }]]);
  const queue = createDraftQueue({ keys: async () => [...rows.keys()], read: async key => rows.get(key), write: async (key, value) => value ? rows.set(key, value) : rows.delete(key) });
  await queue.clearUser('a');
  assert.equal(rows.has(JSON.stringify(['a', 'old-note'])), false);
  assert.equal(rows.has(JSON.stringify(['b', 'n'])), true);
});
test('independent tabs cannot accidentally use the same acknowledgement sequence', async () => {
  const storage = { read: async () => null, write: async () => {} };
  const a = createDraftQueue(storage).capture('a', note(), 3);
  const b = createDraftQueue(storage).capture('a', note(), 3);
  await Promise.all([a.persisted, b.persisted]);
  assert.notEqual(a.draft.sequence, b.draft.sequence);
});
test('rebase does not alter a newer sequence or a different account; hasUser sees durable drafts', async () => {
  const {queue}=setup();
  const a=queue.capture('a',note('A'),3);await a.persisted;
  const b=queue.capture('a',note('B'),3);await b.persisted;
  await queue.rebase('a','n',a.draft.sequence,4);
  assert.equal((await queue.read('a','n')).baseRevision,3);
  await queue.rebase('a','n',b.draft.sequence,4);
  assert.equal((await queue.read('a','n')).baseRevision,4);
  assert.equal(await queue.hasUser('a'),true);assert.equal(await queue.hasUser('b'),false);
});
