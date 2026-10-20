import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWebOrigin, navigationAction, parseExport } from '../lib/web-shell-policy.ts';

const origin = 'https://flownote-react.vercel.app';
test('only the two cloud web origins can be selected; no default production fallback', () => {
  assert.equal(resolveWebOrigin(origin), origin);
  assert.equal(resolveWebOrigin('https://flownote-react-staging.vercel.app'), 'https://flownote-react-staging.vercel.app');
  for (const value of [undefined, '', 'http://localhost:3000', `${origin}/canvas`, `${origin}.evil.test`, `https://user@flownote-react.vercel.app`]) {
    assert.throws(() => resolveWebOrigin(value));
  }
});
test('navigation pins the full origin and rejects credentials, native/file schemes and insecure links', () => {
  assert.equal(navigationAction(`${origin}/canvas/a`, origin), 'internal');
  assert.equal(navigationAction('https://example.com', origin), 'external');
  assert.equal(navigationAction('mailto:help@example.com', origin), 'external');
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'http://example.com', 'intent://x', 'https://user:pass@example.com', 'mailto:help@example.com\nBcc:evil@example.com']) {
    assert.equal(navigationAction(value, origin), 'block');
  }
});
test('the export bridge accepts bounded data only from the pinned web origin and sanitizes names', () => {
  const payload = { type: 'flownote.export', name: '../../노트.md', mime: 'text/markdown', base64: 'aGk=' };
  const parsed = parseExport(JSON.stringify(payload), `${origin}/blog/1`, origin);
  assert.equal(parsed.base64, 'aGk='); assert.equal(parsed.name, '노트.md');
  for (const source of ['https://evil.test', 'https://flownote-react-staging.vercel.app', 'file:///x']) {
    assert.throws(() => parseExport(JSON.stringify(payload), source, origin));
  }
  for (const patch of [{type:'open-url'}, {mime:'text/html'}, {base64:'%%%%'}, {base64:'a'}, {base64:'a'.repeat(12_000_000)}, {url:'https://evil.test'}, {name:42}]) {
    assert.throws(() => parseExport(JSON.stringify({...payload,...patch}), origin, origin));
  }
  assert.equal(parseExport(JSON.stringify({...payload,name:'file.html'}), origin, origin).name, 'file.html.md');
});
