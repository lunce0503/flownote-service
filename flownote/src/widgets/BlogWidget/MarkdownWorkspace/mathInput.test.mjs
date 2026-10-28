import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latexCompletion, replaceCompletion, inlineMathMatch, multilineMath } from './mathInput.ts';

test('single dollar input keeps leading characters, spaces, currency, escapes and code distinct', () => {
  assert.deepEqual(inlineMathMatch('text $ x^2 $'), { from: 5, latex: 'x^2' });
  for (const input of ['price $20', 'price $20 and $30', '\\$x$', '$$x$$', '`$x$`', '$  $']) assert.equal(inlineMathMatch(input), null, input);
});
test('block math requires complete standalone delimiters and preserves multiple lines', () => {
  assert.equal(multilineMath(['$$', 'x = 1', 'y = 2', '$$']), 'x = 1\ny = 2');
  for (const input of [['$$', '$$'], ['prefix $$', 'x', '$$'], ['$$', 'x', '$$$']]) assert.equal(multilineMath(input), null);
});
test('recommendations only appear inside open math, not escaped commands or fenced code', () => {
  const src = 'text $ \\fr';
  const result = latexCompletion(src, src.length);
  assert.equal(result.items[0].label, '\\frac');
  assert.deepEqual(replaceCompletion(src, result, result.items[0]), { value: 'text $ \\frac{}{}', cursor: 13 });
  assert.equal(latexCompletion('plain \\fr', 9), null);
  assert.equal(latexCompletion('`$ \\fr', 7), null);
  assert.equal(latexCompletion('```latex\n$$\n\\fr', 16), null);
  assert.equal(latexCompletion('$ x $ \\fr', 10), null);
  assert.equal(latexCompletion('$ \\\\fr', 7), null);
  assert.ok(latexCompletion('\\sq', 3, true).items.some(i => i.label === '\\sqrt'));
});
