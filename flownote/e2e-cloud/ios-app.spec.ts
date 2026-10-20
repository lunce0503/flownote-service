import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
const userAgent = 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlownoteIOS/1.1.0';
test.use({ userAgent, hasTouch: true });

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 1366 }]) {
  test(`iOS app login, shared feature navigation and session restore at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const email = `ios-${randomUUID()}@example.com`, password = randomUUID();
    expect((await request.post(`${api}/api/users`, { data: { email, password, username: `ios-${randomUUID().slice(0, 8)}`, nickname: 'iOS staging' } })).ok()).toBeTruthy();
    await page.goto('/'); await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('이메일').fill(email); await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    const nav = page.getByRole('navigation', { name: '앱 기능' });
    await expect(nav).toBeVisible(); await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-ios-app', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(247, 243, 232)');
    await page.getByRole('button', { name: '전체 기능', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '전체 기능' });
    for (const href of ['/blog', '/canvas', '/planner', '/social', '/agent', '/settings', '/stocks', '/banpick', '/screw-puzzle', '/magic', '/admin/canvas', '/admin/feedback']) {
      await expect(menu.locator(`a[href="${href}"]`)).toBeVisible();
    }
    await menu.getByRole('link', { name: '설정', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.reload(); await expect(nav).toBeVisible(); await expect(page).toHaveURL(/\/settings$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('iOS shared notes save through the cloud and export exact Markdown and calendar data to the bounded native bridge', async ({ page, request }) => {
  const email = `ios-export-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `ios-${randomUUID().slice(0, 8)}`, nickname: 'iOS export' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } }); expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json(); const headers = { Authorization: `Bearer ${token}` };
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
    Object.assign(window, { nativeExports: [], ReactNativeWebView: { postMessage(data: string) {
      (window as unknown as { nativeExports: unknown[] }).nativeExports.push(JSON.parse(data));
    } } });
  }, { user });
  const id = randomUUID(), markdown = '# iPad 한글\n\n웹과 같은 문서';
  expect((await request.post(`${api}/api/notes`, { headers, data: { id, title: 'iPad export',
    content: { format: 'markdown', version: 1, markdown }, created_at: new Date().toISOString(), revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
  try {
    await page.goto(`/blog/${id}`); await expect(page.getByLabel('Markdown 본문')).toHaveValue(markdown);
    const updated = markdown + '\n저장 동기화'; await page.getByLabel('Markdown 본문').fill(updated);
    await expect.poll(async () => (await (await request.get(`${api}/api/notes/${id}`, { headers })).json()).content.markdown).toBe(updated);
    await page.getByRole('button', { name: '.md 내보내기', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { nativeExports: unknown[] }).nativeExports.length)).toBe(1);
    const file = await page.evaluate(() => (window as unknown as { nativeExports: {type:string;mime:string;base64:string;name:string}[] }).nativeExports[0]);
    expect(file.type).toBe('flownote.export'); expect(file.mime).toBe('text/markdown'); expect(file.name).toBe('iPad export.md');
    expect(Buffer.from(file.base64, 'base64').toString('utf8')).toBe(updated);
    await page.goto('/planner'); await page.getByRole('button', { name: '월간', exact: true }).click();
    await page.getByRole('button', { name: '캘린더 내보내기' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { nativeExports: unknown[] }).nativeExports.length)).toBe(1);
    const calendar = await page.evaluate(() => (window as unknown as { nativeExports: {mime:string;base64:string}[] }).nativeExports[0]);
    expect(calendar.mime).toBe('text/calendar'); expect(Buffer.from(calendar.base64, 'base64').toString('utf8')).toContain('BEGIN:VCALENDAR');
  } finally { expect((await request.delete(`${api}/api/notes/${id}`, { headers })).ok()).toBeTruthy(); }
});

test('iPad canvas keeps the full editor and persists pointer strokes across reloads', async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  const email = `ios-pen-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `pen-${randomUUID().slice(0, 8)}`, nickname: 'iPad pen' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } }); expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json(); const headers = { Authorization: `Bearer ${token}` };
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), { user });
  const created = await request.post(`${api}/api/canvas/documents`, { headers, data: { title: 'iPad pen staging' } });
  expect(created.ok()).toBeTruthy(); const { id } = await created.json();
  try {
    await page.goto(`/canvas/${id}`);
    const surface = page.getByTestId('canvas-input-surface');
    await expect(surface).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('canvas-viewport-status')).toHaveCSS('position', 'fixed');
    await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '0');
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '앱 기능' })).toHaveCount(0);
    await page.waitForTimeout(1000);
    const box = await surface.boundingBox(); expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 200, box!.y + 250); await page.mouse.down();
    await page.mouse.move(box!.x + 300, box!.y + 300, { steps: 12 }); await page.mouse.up();
    await expect.poll(async () => (await (await request.get(`${api}/api/canvas/load?canvasId=${id}`, { headers })).json()).lines.length).toBe(1);
    await page.reload(); await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
    await expect(page.getByRole('link', { name: '캔버스 목록으로 돌아가기' })).toBeVisible();
  } finally { expect((await request.delete(`${api}/api/canvas/documents/${id}`, { headers })).ok()).toBeTruthy(); }
});
