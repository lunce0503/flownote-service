import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { verifyReader } from './reader-web-smoke.mjs';
import { verifyNoteEditing } from './note-web-smoke.mjs';

const web = 'https://flownote-react-staging.vercel.app';
const api = 'https://flownote-api-staging.up.railway.app';
const hash = value => createHash('sha256').update(value).digest('hex');
const html = await (await fetch(web)).text();
const entry = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/);
assert(entry, 'Staging entry module missing');
const entryUrl = new URL(entry[1], web).href;
const expectedHash = hash(Buffer.from(await (await fetch(entryUrl)).arrayBuffer()));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const route of ['/api/users/me', '/api/canvas/documents']) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(api + route, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (response?.status === 401) break;
    assert(attempt < 9, 'Staging auth readiness'); await pause(2000);
  }
}
async function request(route, method, body, token) {
  const response = await fetch(api + route, { method, signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert(response.ok, `Staging ${method} ${route}: ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const failures = [];
for (const executablePath of process.argv.slice(2)) {
  const kind = executablePath.includes('FlownotePortable') ? 'portable' : 'installer';
  const failed = (phase, error) => {
    failures.push({ kind, phase, error: String(error.stack ?? error.message).slice(0, 5000) });
    console.error(`FAIL ${kind} ${phase}: ${error.stack ?? error.message}`);
  };
  const email = `native-feedback-${randomUUID()}@example.com`, password = randomUUID();
  await request('/api/users', 'POST', { email, password, username: `nf-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic native web release' });
  const { token } = await request('/api/users/login', 'POST', { email, password });
  const canvas = await request('/api/canvas/documents', 'POST', { title: 'Synthetic native shared web' }, token);
  let app;
  const launch = async () => {
    app = await electron.launch({ executablePath, args: ['--staging'], timeout: 60000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(45000);
    await page.waitForURL(`${web}/**`);
    return page;
  };
  try {
    let page = await launch();
    await page.context().clearCookies();
    await page.goto(`${web}/login`);
    await page.getByLabel('이메일').fill(email); await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await page.getByRole('navigation', { name: '앱 기능' }).waitFor();
    await page.evaluate(() => localStorage.setItem('flownote-shared-web-release-probe', 'preserved'));
    await app.close(); app = undefined;
    page = await launch();
    await page.getByRole('navigation', { name: '앱 기능' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('flownote-shared-web-release-probe')), 'preserved');
    const response = page.waitForResponse(response => response.url() === entryUrl);
    await page.reload();
    assert([200, 304].includes((await response).status()), 'Entry module did not load or revalidate');
    // Electron exposes cache revalidation as 304; that response has no body.
    // Read the browser's cached bytes and also require the executing entry URL.
    const loaded = await page.evaluate(async url => {
      const script = document.querySelector('script[type="module"][src]');
      if (!script || new URL(script.getAttribute('src'), location.href).href !== url) throw new Error('Unexpected executing entry');
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Cached entry unavailable');
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }, entryUrl);
    assert.equal(loaded, expectedHash, 'Published binary cached an older web bundle');
    await page.goto(`${web}/canvas/${canvas.id}`);
    const surface = page.getByTestId('canvas-input-surface');
    await surface.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="canvas-input-surface"]')?.getAttribute('data-ready') === 'true');
    const toggle = page.getByTestId('canvas-tool-menu-toggle');
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole('button', { name: '펜', exact: true }).click();
    await page.keyboard.press('Escape');
    const box = await surface.boundingBox(); assert(box);
    // Settle the real toolbar mouse before introducing a separate pen stream.
    await page.mouse.move(box.x + 180, box.y + 240);
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    // Presentation event only. This does not certify Windows pen hardware.
    await surface.dispatchEvent('pointermove', { pointerId: 90, pointerType: 'pen', clientX: box.x + 180, clientY: box.y + 240, buttons: 0 });
    const marker = page.getByTestId('canvas-tool-pointer');
    await marker.waitFor(); assert.equal(await marker.getAttribute('data-tool'), 'pen');
    assert.equal(await marker.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
    assert.equal(await marker.textContent(), '');
    assert.equal(await marker.locator('svg').count(), 0);
    const tip = await page.getByTestId('canvas-tool-pointer-tip').boundingBox();
    assert(tip); assert.equal(tip.width, 4); assert.equal(tip.height, 4);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-testid="canvas-input-surface"]')?.getAttribute('data-ready') === 'true');
    await page.getByTestId('canvas-tool-pointer').waitFor({ state: 'attached' });
    assert.equal(await page.getByTestId('canvas-tool-pointer').count(), 1);
    try { await verifyNoteEditing(page, token); } catch (error) { failed('note editing', error); }
    try { await verifyReader(page); } catch (error) { failed('existing reader', error); }
    console.log('PASS existing published Windows app: current staging entry SHA-256, reload/process restart, login/draft preservation and new tool-pointer presentation');
  } catch (error) {
    failed('shared app setup', error);
  } finally {
    if (app) await app.close();
    try {
      await request(`/api/canvas/documents/${canvas.id}`, 'DELETE', null, token);
      await request('/api/users/logout', 'POST', null, token);
    } catch (error) { failed('synthetic cleanup', error); }
  }
}
assert.equal(failures.length, 0, JSON.stringify(failures));
