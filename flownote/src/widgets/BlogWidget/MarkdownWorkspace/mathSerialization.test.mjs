import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separateAdjacentInlineMath } from './mathSerialization.ts';

test('adjacent math atoms keep their values and neighbours with an unambiguous serialization boundary', () => {
  const source = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Pair: ' }, { type: 'inlineMath', attrs: { latex: '\\frac{a}{b}' } },
    { type: 'inlineMath', attrs: { latex: '\\sqrt{4}' } }, { type: 'text', text: ' tail' },
  ] }] };
  const original = JSON.stringify(source), result = separateAdjacentInlineMath(source);
  assert.deepEqual(result.content[0].content, [source.content[0].content[0], source.content[0].content[1], { type: 'text', text: ' ' }, source.content[0].content[2], source.content[0].content[3]]);
  assert.equal(JSON.stringify(source), original, 'serialization must not mutate the live document');
  assert.deepEqual(separateAdjacentInlineMath(result), result, 'boundaries must not accumulate');
});
test('math boundaries are preserved recursively in table cells without changing code or literal dollars', () => {
  const math = latex => ({ type: 'inlineMath', attrs: { latex } });
  const source = { type: 'tableCell', content: [{ type: 'paragraph', content: [math('a'), math('b'), math('c')] },
    { type: 'codeBlock', content: [{ type: 'text', text: '$a$$b$' }] }, { type: 'blockMath', attrs: { latex: 'x\ny' } }] };
  const result = separateAdjacentInlineMath(source);
  assert.equal(result.content[0].content.filter(n => n.type === 'inlineMath').length, 3);
  assert.deepEqual(result.content[0].content.filter(n => n.type === 'text').map(n => n.text), [' ', ' ']);
  assert.deepEqual(result.content.slice(1), source.content.slice(1));
});
