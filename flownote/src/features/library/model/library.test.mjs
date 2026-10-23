import test from 'node:test';
import assert from 'node:assert/strict';
import { bookPage, bookTitle, bookSubject, readingCrop, toggleBookmark, validateBookFile, MAX_BOOK_BYTES } from './library.ts';

test('book registration rejects empty, oversized and disguised files before reading bytes', () => {
  for (const file of [
    { name: 'a.pdf', type: 'application/pdf', size: 0 },
    { name: 'a.pdf', type: 'application/pdf', size: MAX_BOOK_BYTES + 1 },
    { name: 'a.html', type: 'application/pdf', size: 10 },
    { name: 'a.pdf', type: 'text/html', size: 10 },
  ]) assert.throws(() => validateBookFile(file));
  assert.doesNotThrow(() => validateBookFile({ name: 'a.PDF', type: '', size: 1024 }));
});
test('reading positions and bookmarks stay inside actual page boundaries', () => {
  assert.equal(bookPage(-3, 10), 1); assert.equal(bookPage(Infinity, 10), 10);
  assert.equal(bookPage(NaN, 10), 1); assert.equal(bookPage(15, 10), 10);
  assert.deepEqual(toggleBookmark([2, 4], 3, 10), [2, 3, 4]);
  assert.deepEqual(toggleBookmark([2, 3, 4], 3, 10), [2, 4]);
  assert.deepEqual(toggleBookmark([], 50, 10), [10]);
});
test('column focus preserves original coordinates and overlaps the gutter', () => {
  const left = readingCrop(1000, 1400, 'left'), right = readingCrop(1000, 1400, 'right');
  assert.ok(left.x + left.width >= right.x, 'no omitted strip at the center');
  assert.ok(right.x + right.width <= 1000);
  assert.equal(left.width, right.width); assert.equal(left.height, right.height);
  assert.deepEqual(readingCrop(1000, 1400, 'page'), { x: 0, y: 0, width: 1000, height: 1400 });
});
test('titles and subject names are bounded and have useful fallbacks', () => {
  assert.equal(bookTitle('  ', 'calculus.pdf'), 'calculus');
  assert.equal(bookTitle('A'.repeat(200), 'a.pdf').length, 160);
  assert.equal(bookSubject('  '), '미분류');
  assert.equal(bookSubject('수학'.repeat(40)).length, 40);
});
