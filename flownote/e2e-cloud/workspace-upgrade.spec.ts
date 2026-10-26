import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createCloudActor as actor, stagingApi as api, stagingWeb as web } from './helpers/accounts';
import { registerLiveMarkdown } from './helpers/live-markdown';
test.use({ hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36 FlownoteAndroid/1.3.0' });
registerLiveMarkdown(390, 'chromium');

test('one workspace list searches, sorts and opens both file types without fetching note bodies', async ({ page, request }) => {
  const account = await actor(request), headers = { Authorization: `Bearer ${account.token}` }, id = randomUUID();
  const created = await request.post(`${api}/api/canvas/documents`, { headers, data: { title: 'Unified matching canvas' } });
  expect(created.ok()).toBeTruthy(); const canvas = await created.json();
  expect((await request.post(`${api}/api/notes`, { headers, data: { id, title: 'Unified matching note', content: { format: 'markdown', version: 1, markdown: '# Unified note' }, revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: account.token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), account.user);
  try {
    const bodies: string[] = []; page.on('request', r => { if (/\/api\/notes\/[0-9a-f-]+(?:\?|$)/.test(r.url())) bodies.push(r.url()); });
    await page.goto(`${web}/canvas`); const list = page.getByTestId('canvas-explorer');
    await expect(list).toHaveAttribute('data-unified', 'true');
    await expect(list.getByRole('button', { name: 'Unified matching canvas', exact: true })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Unified matching note', exact: true })).toBeVisible(); expect(bodies).toHaveLength(0);
    await page.getByLabel('노트와 캔버스 검색', { exact: true }).fill('Unified matching');
    await expect(list.locator('[data-file-kind]')).toHaveCount(2);
    await page.getByLabel('파일 종류', { exact: true }).selectOption('note');
    await expect(list.locator('[data-file-kind]')).toHaveCount(1); await expect(list.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'note');
    await page.getByLabel('파일 종류', { exact: true }).selectOption('all'); await page.getByLabel('파일 정렬', { exact: true }).selectOption('title');
    await expect(list.locator('[data-file-kind]').first()).toHaveAttribute('data-file-kind', 'canvas');
    await list.getByRole('button', { name: 'Unified matching note', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${id}$`)); await expect(page.getByTestId('markdown-live-editor')).toContainText('Unified note');
    await page.goto(`${web}/blog`); await expect(page.getByTestId('canvas-explorer')).toHaveAttribute('data-unified', 'true');
    await page.getByRole('button', { name: 'Unified matching canvas', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/canvas/${canvas.id}$`));
    const surface = page.getByTestId('canvas-input-surface'); await expect(surface).toHaveAttribute('data-ready', 'true');
    const save = page.locator('[data-testid="canvas-save-status"]:visible');
    await expect(save).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); await expect(save).toHaveCSS('box-shadow', 'none');
    const channels = await save.evaluate(node => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!; context.fillStyle = getComputedStyle(node).color; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    });
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(25);
    expect(Math.max(...channels)).toBeGreaterThan(70); expect(Math.max(...channels)).toBeLessThan(180);
    await expect(save.locator('.lucide-cloud,.lucide-cloud-upload,.lucide-circle-check')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^전체 화면/ })).toHaveCount(0);
    const box = await surface.boundingBox(); expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 140, box!.y + 220); await page.mouse.down(); await page.mouse.move(box!.x + 180, box!.y + 240, { steps: 6 }); await page.mouse.up();
    await expect(save).toHaveAttribute('data-save-state', 'saved'); await expect(save.locator('.lucide-check')).toBeVisible();
  } finally {
    expect((await request.delete(`${api}/api/notes/${id}`, { headers })).ok()).toBeTruthy();
    expect((await request.delete(`${api}/api/canvas/documents/${canvas.id}`, { headers })).ok()).toBeTruthy();
  }
});
