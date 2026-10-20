import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertLegacy, isMarkdown, safeMarkdownUrl } from './markdown.ts';

test('conversion preserves original drawing/image/math/table/unknown/nested blocks without mutating input', () => {
  const original = [
    { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '제목', styles: { bold: true } }] },
    { type: 'paragraph', content: [{ type: 'latex', props: { latex: 'x^2' } }] },
    { type: 'image', props: { url: 'https://example.com/image.png', caption: '그림' } },
    { type: 'table', content: { rows: [{ cells: [[{ type: 'text', text: 'a|b' }], [{ type: 'text', text: 'c' }]] }] } },
    { type: 'drawing', props: { strokes: [1, 2] } },
    { type: 'custom', content: [{ text: 'unknown' }], children: [{ type: 'paragraph', content: [{ text: 'child' }] }] },
  ];
  const before = JSON.stringify(original);
  const result = convertLegacy(original);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(result.content.legacy_original, original);
  assert.ok(isMarkdown(result.content));
  assert.match(result.content.markdown, /## \*\*제목\*\*/);
  assert.match(result.content.markdown, /\$x\^2\$/);
  assert.match(result.content.markdown, /!\[그림\]/);
  assert.match(result.content.markdown, /a\\\|b/);
  assert.match(result.content.markdown, /child/);
  assert.ok(result.warnings.length >= 2);
});
test('Markdown is explicit and URLs never enable active content', () => {
  assert.equal(isMarkdown({ format: 'markdown', version: 2, markdown: '' }), false);
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'vbscript:x', '//evil.example/a', 'java\nscript:x']) assert.equal(safeMarkdownUrl(url), '');
  for (const url of ['https://example.com/a', '/uploads/a.png', '#title', 'mailto:a@example.com']) assert.equal(safeMarkdownUrl(url), url);
});
test('code fences, checklist, nested lists and unsafe images preserve their original snapshot', () => {
  const original=[{type:'codeBlock',props:{language:'js'},content:[{text:'const x = `a`;\n```'}]},
    {type:'checkListItem',props:{checked:true},content:[{text:'done'}],children:[{type:'bulletListItem',content:[{text:'child'}]}]},
    {type:'image',props:{url:'javascript:alert(1)',caption:'unsafe'}},
  ];
  const result=convertLegacy(original);
  assert.match(result.content.markdown,/````js\nconst x = `a`;\n```\n````/);
  assert.match(result.content.markdown,/- \[x\] done/);
  assert.match(result.content.markdown,/  - child/);
  assert.doesNotMatch(result.content.markdown,/javascript:/);
  assert.equal(result.content.legacy_original[2].props.url,'javascript:alert(1)');
});
