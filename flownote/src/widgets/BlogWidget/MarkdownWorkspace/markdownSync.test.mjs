import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownSync } from './markdownSync.ts';
test('late echoes of a line edit cannot reset the current document or composition caret', () => {
  const sync = markdownSync('first line');
  sync.emit('first 한 line'); sync.emit('first 한글 line');
  assert.equal(sync.receive('first 한 line'), false);
  assert.equal(sync.receive('first 한글 line'), false);
  assert.equal(sync.receive('first 한 line'), false);
  assert.equal(sync.receive('explicit recovered draft'), true);
  assert.equal(sync.receive('explicit recovered draft'), false);
});
