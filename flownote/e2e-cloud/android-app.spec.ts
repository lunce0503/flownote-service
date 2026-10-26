import { markdownSource } from './helpers/markdown';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const androidUA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36 FlownoteAndroid/1.0.0';

test.use({ userAgent: androidUA, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

test('Android login persists, original header is absent, all feature routes remain reachable', async ({ page, request }) => {
  const email = `android-${randomUUID()}@example.com`;
  const password = randomUUID();
  const signup = await request.post(`${api}/api/users`, { data: {
    email, password, username: `android-${randomUUID().slice(0, 8)}`, nickname: 'Android verification',
  } });
  expect(signup.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('navigation', { name: '앱 기능' })).toHaveCount(0);
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '계속하기', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const nav = page.getByRole('navigation', { name: '앱 기능' });
  await expect(nav).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(247, 243, 232)');

  await page.reload();
  await expect(nav).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await nav.getByRole('button', { name: '전체 기능', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 기능' });
  for (const href of ['/canvas', '/library', '/planner', '/social', '/agent', '/settings', '/stocks', '/banpick', '/screw-puzzle', '/magic', '/admin/canvas', '/admin/feedback']) {
    await expect(menu.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await menu.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('header')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await nav.getByRole('button', { name: '전체 기능', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('Android tablet layout preserves touch targets and canvas full working area', async ({ page, request }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  const email = `android-tablet-${randomUUID()}@example.com`;
  const password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `tablet-${randomUUID().slice(0, 8)}`, nickname: 'Tablet verification',
  } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { token, user });
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post(`${api}/api/canvas/documents`, { headers, data: { title: 'Android tablet verification' } });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  try {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '앱 기능' });
    await expect(nav).toBeVisible();
    for (const target of await nav.locator('a, button').all()) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await page.goto(`/canvas/${id}`);
    await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('header')).toHaveCount(0);
    await expect(nav).toHaveCount(0);
    await expect(page.getByRole('link', { name: '작업 공간으로 돌아가기' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.getByRole('link', { name: '작업 공간으로 돌아가기' }).click();
    await expect(nav).toBeVisible();
  } finally {
    expect((await request.delete(`${api}/api/canvas/documents/${id}`, { headers })).ok()).toBeTruthy();
  }
});

test('Android preserves the structured original and saves Markdown through the shared cloud API', async ({ page, request }) => {
  const email = `android-notes-${randomUUID()}@example.com`;
  const password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `notes-${randomUUID().slice(0, 8)}`, nickname: 'Notes verification',
  } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const id = randomUUID();
  const content = [{ id: randomUUID(), type: 'paragraph', props: {},
    content: [{ type: 'text', text: '서식 노트 원본', styles: { bold: true } }], children: [] }];
  expect((await request.post(`${api}/api/notes`, { headers, data: {
    id, title: 'Android structured note', content, created_at: new Date().toISOString(), revision: 1, client_id: randomUUID(),
  } })).ok()).toBeTruthy();
  try {
    await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
      url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    await page.addInitScript(({ user }) => {
      localStorage.setItem('flownote_auth_user', JSON.stringify(user));
    }, { token, user });
    await page.goto(`/blog/${id}`);
    await expect(page.getByLabel('노트 제목')).toHaveValue('Android structured note');
    await page.getByRole('button', { name: '원본 보기', exact: true }).click();
    await expect(page.getByTestId('legacy-original')).toContainText('서식 노트 원본');
    const untouched = await (await request.get(`${api}/api/notes/${id}`, { headers })).json();
    expect(untouched.content).toEqual(content);
    expect(untouched.revision).toBe(1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '원본 보관 후 Markdown으로 전환' }).click();
    const editor = (await markdownSource(page));
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('**서식 노트 원본**');
    await page.getByLabel('노트 제목').fill('Android edited note');
    await editor.fill('**서식 노트 원본** 앱에서 편집');
    await expect.poll(async () => {
      const response = await request.get(`${api}/api/notes`, { headers });
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      const note = (Array.isArray(payload) ? payload : payload.notes).find((item: { id: string }) => item.id === id);
      if (note?.title !== 'Android edited note') return false;
      expect(note.content.legacy_original).toEqual(content);
      return note.content.format === 'markdown' && note.content.version === 1 && note.content.markdown === '**서식 노트 원본** 앱에서 편집';
    }, { timeout: 30000 }).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel('노트 제목')).toHaveValue('Android edited note');
    await expect((await markdownSource(page))).toHaveValue('**서식 노트 원본** 앱에서 편집');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.locator('strong').filter({ hasText: '서식 노트 원본' })).toBeVisible();
  } finally {
    expect((await request.delete(`${api}/api/notes/${id}`, { headers })).ok()).toBeTruthy();
  }
});
