import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createStaticServer } from './serve-static.mjs';

const startServer = async () => {
  const root = await mkdtemp(join(tmpdir(), 'flownote-mobile-static-'));
  await writeFile(join(root, 'index.html'), '<h1>home</h1>');
  await writeFile(join(root, 'canvas.html'), '<h1>canvas</h1>');
  await writeFile(join(root, 'app.js'), 'console.log("ok")');

  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return { root, server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('serves health, static routes, and assets', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'UP', service: 'flownote-mobile' });

  const canvas = await fetch(`${baseUrl}/canvas`);
  assert.equal(canvas.status, 200);
  assert.equal(await canvas.text(), '<h1>canvas</h1>');

  const asset = await fetch(`${baseUrl}/app.js`);
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
});

test('falls back to the app shell without allowing path traversal', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const fallback = await fetch(`${baseUrl}/unknown-route`);
  assert.equal(fallback.status, 200);
  assert.equal(await fallback.text(), '<h1>home</h1>');

  const traversal = await fetch(`${baseUrl}/%2e%2e%2fpackage.json`);
  assert.equal(traversal.status, 400);
});
