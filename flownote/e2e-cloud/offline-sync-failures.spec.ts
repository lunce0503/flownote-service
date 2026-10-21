import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
test.use({ userAgent: 'Mozilla/5.0 FlownoteIOS/1.2.0' });

test('snapshot asset/quota failures and an expired sync session preserve the device workspace', async ({ page, request }) => {
  test.setTimeout(120000);
  const email = `offline-failure-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(api + '/api/users', { data: { email, password, username: `failure-${randomUUID().slice(0, 8)}`, nickname: 'Offline failure check' } })).ok()).toBeTruthy();
  const signIn = async () => {
    const response = await request.post(api + '/api/users/login', { data: { email, password } });
    expect(response.ok()).toBeTruthy(); return response.json();
  };
  const { user, token } = await signIn(), headers = { Authorization: `Bearer ${token}` };
  const noteId = randomUUID(), canvasId = randomUUID();
  expect((await request.post(api + '/api/notes', { headers, data: { id: noteId, title: 'Failure check', content: { format: 'markdown', version: 1, markdown: 'preserve through failures' }, revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
  expect((await request.post(api + '/api/canvas/documents', { headers, data: { id: canvasId, title: 'Failure check image' } })).ok()).toBeTruthy();
  const assetResponse = await request.post(api + '/api/canvas/assets', { headers, multipart: { image: {
    name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  } } });
  expect(assetResponse.ok()).toBeTruthy(); const asset = await assetResponse.json();
  expect((await request.post(api + `/api/canvas/elements/save?canvasId=${canvasId}`, { headers, data: { mutationId: randomUUID(), addedImages: [{ id: randomUUID(), assetId: asset.id, objectKey: asset.objectKey, url: asset.url, contentType: asset.contentType, byteSize: asset.byteSize, x: 0, y: 0, width: 1, height: 1 }] } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(user => {
    if (!sessionStorage.getItem('offline-failure-initialized')) {
      localStorage.setItem('flownote_auth_user', JSON.stringify(user)); sessionStorage.setItem('offline-failure-initialized', '1');
    }
  }, user);
  const toggle = async () => { page.once('dialog', dialog => dialog.accept()); await page.getByRole('switch', { name: '앱 동기화', exact: true }).click(); };
  try {
    await page.goto('/settings');
    await page.route('**/web-api/api/canvas/assets/**', route => route.abort('failed'));
    await toggle(); await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.unroute('**/web-api/api/canvas/assets/**');
    await page.evaluate(() => Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: async () => ({ quota: 1, usage: 0 }) }));
    await toggle(); await expect(page.getByRole('alert')).toContainText('저장 공간');
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.reload(); await toggle();
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');
    expect((await request.post(api + '/api/users/logout', { headers })).ok()).toBeTruthy();
    await toggle(); await expect(page.getByRole('alert')).toContainText('로그인이 만료');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');
    const state = await page.evaluate(owner => new Promise<{ notes: { content: { markdown: string } }[]; canvasContents: { images: { url: string }[] }[]; sync: { status: string } }>((resolve, reject) => {
      const open = indexedDB.open('flownote-device-workspaces', 1);
      open.onsuccess = () => { const db = open.result, row = db.transaction('workspaces').objectStore('workspaces').get(owner); row.onsuccess = () => { db.close(); resolve(row.result); }; row.onerror = () => reject(row.error); };
      open.onerror = () => reject(open.error);
    }), user.id);
    expect(state.notes[0].content.markdown).toBe('preserve through failures');
    expect(state.canvasContents[0].images[0].url).toMatch(/^data:image\//);
    expect(state.sync.status).toBe('failed');
  } finally {
    const fresh = await signIn(), cleanup = { Authorization: `Bearer ${fresh.token}` };
    await request.delete(api + `/api/notes/${noteId}`, { headers: cleanup });
    await request.delete(api + `/api/canvas/documents/${canvasId}`, { headers: cleanup });
  }
});
