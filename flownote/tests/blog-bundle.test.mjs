import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parseAst } from 'rollup/parseAst';
const dist = resolve(import.meta.dirname, '../dist');
function staticGraph(entry, visited = new Set()) {
  if (visited.has(entry)) return visited;
  visited.add(entry);
  const ast = parseAst(readFileSync(entry, 'utf8'));
  for (const node of ast.body) {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
      const source = node.source.value;
      if (source.endsWith('.js')) staticGraph(resolve(entry, '..', source), visited);
    }
  }
  return visited;
}
test('built blog and application static imports exclude both preview and legacy editor vendors', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const script = html.match(/<script[^>]+src="([^"]+\.js)"/)[1];
  const blog = readdirSync(resolve(dist, 'assets')).find(n => /^MarkdownWorkspace-.*\.js$/.test(n));
  assert.ok(blog, 'shared Markdown workspace chunk exists');
  const loaded = [...staticGraph(resolve(dist, script.replace(/^\//,''))), ...staticGraph(resolve(dist, 'assets', blog))].map(path => basename(path));
  const paths = new Set([...staticGraph(resolve(dist, script.replace(/^\//,''))), ...staticGraph(resolve(dist, 'assets', blog))]);
  for (const path of paths) assert.doesNotMatch(readFileSync(path, 'utf8'), /BlockNoteEditor|blocknote-editor|ProseMirror/, 'legacy editor implementation must stay lazy even when chunks are renamed');
  assert.deepEqual(loaded.filter(n => /editor-blocknote|editor-integration|editor-prosemirror|editor-yjs|MarkdownPreview|ReactMarkdownRender|katex/.test(n)), []);
});
