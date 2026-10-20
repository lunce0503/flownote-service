import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string, user: Record<string, unknown>, canvasId: string;
const noteId = randomUUID();
const canvasIds: string[] = [], folderIds: string[] = [];
const headers = () => ({ Authorization: `Bearer ${token}` });
test.beforeAll(async ({ request }) => {
  const email = `explorer-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `explorer-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic explorer' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); ({ token, user } = await login.json());
  const canvas = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: 'Workspace canvas' } });
  expect(canvas.ok()).toBeTruthy(); canvasId = (await canvas.json()).id; canvasIds.push(canvasId);
  expect((await request.post(`${api}/api/notes`, { headers: headers(), data: { id: noteId, title: 'Workspace note', content: { format: 'markdown', version: 1, markdown: '# 작업 공간\n\n합성 디자인 검증 문서입니다.' }, revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), user);
});
test.afterAll(async ({ request }) => {
  for (const id of canvasIds) expect([200, 204, 404]).toContain((await request.delete(`${api}/api/canvas/documents/${id}`, { headers: headers() })).status());
  for (const id of folderIds) expect([200, 204, 404]).toContain((await request.delete(`${api}/api/canvas/folders/${id}`, { headers: headers() })).status());
  expect((await request.delete(`${api}/api/notes/${noteId}`, { headers: headers() })).ok()).toBeTruthy();
});

test('explorer folder CRUD, keyboard rename, moving files and deleting only a folder preserve the canvas', async ({ page, request }) => {
  const extra = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: 'Explorer file' } });
  expect(extra.ok()).toBeTruthy(); const id = (await extra.json()).id; canvasIds.push(id);
  await page.goto('/canvas');
  await expect(page.getByRole('table', { name: '최근 항목 캔버스' })).toBeVisible();
  await expect(page.locator('.canvas-library article')).toHaveCount(0);
  await page.getByRole('button', { name: '새 캔버스 폴더', exact: true }).click();
  await page.getByLabel('폴더 카테고리', { exact: true }).fill('개인 작업');
  await page.getByLabel('폴더 이름', { exact: true }).fill('Workspace folder');
  const created = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/canvas/folders'));
  await page.getByRole('button', { name: '폴더 만들기', exact: true }).click();
  const folder = await (await created).json(); folderIds.push(folder.id);
  await expect(page.locator(`[data-folder="${folder.id}"]`)).toContainText('Workspace folder');
  await page.getByRole('button', { name: '모든 캔버스', exact: true }).click();
  const row = page.locator('[role="row"][data-pending="false"]').filter({ hasText: 'Explorer file' });
  await row.focus(); await row.press('F2');
  await page.getByLabel('캔버스 이름', { exact: true }).fill('Renamed explorer file');
  const renamed = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/api/canvas/documents/${id}`));
  await page.getByLabel('캔버스 이름', { exact: true }).press('Enter'); await renamed;
  await expect(page.getByRole('button', { name: 'Renamed explorer file', exact: true })).toBeVisible();
  await page.getByLabel('Renamed explorer file 이동', { exact: true }).selectOption(folder.id);
  await expect.poll(async () => {
    const folders = await (await request.get(`${api}/api/canvas/folders`, { headers: headers() })).json();
    const f = folders.find((f: { id: string }) => f.id === folder.id);
    return f?.canvas_ids ?? f?.canvasIds;
  }).toContain(id);
  await page.reload();
  await page.locator(`[data-folder="${folder.id}"]`).click();
  await expect(page.getByRole('table', { name: 'Workspace folder 캔버스' }).getByRole('button', { name: 'Renamed explorer file', exact: true })).toBeVisible();
  await page.getByLabel('현재 폴더 동작', { exact: true }).click();
  await page.getByRole('button', { name: '폴더 이름·카테고리 변경', exact: true }).click();
  await page.getByLabel('폴더 이름', { exact: true }).fill('Renamed folder');
  await page.getByRole('button', { name: '폴더 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed folder', exact: true })).toBeVisible();
  await page.getByLabel('현재 폴더 동작', { exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '폴더만 삭제 (캔버스 유지)', exact: true }).click();
  await expect(page.getByRole('table', { name: '미분류 캔버스' }).getByRole('button', { name: 'Renamed explorer file', exact: true })).toBeVisible();
  const remaining = await (await request.get(`${api}/api/canvas/documents`, { headers: headers() })).json();
  expect(remaining.some((document: { id: string }) => document.id === id)).toBeTruthy();
  await page.getByLabel('Renamed explorer file 삭제', { exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Renamed explorer file', exact: true })).toHaveCount(0);
});

for (const width of [390, 820, 1440]) test(`canvas and note share warm neutral palettes without overflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/canvas');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => localStorage.setItem('flownote_theme', theme), theme);
    await page.reload();
    const canvas = page.getByTestId('canvas-explorer');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: 'Workspace canvas', exact: true })).toBeVisible();
    const palette = await canvas.evaluate(node => ['--workspace-paper', '--workspace-sidebar', '--workspace-ink'].map(k => getComputedStyle(node).getPropertyValue(k).trim()));
    expect(palette).toEqual(theme === 'light' ? ['#ffffff', '#f5f1e8', '#211f1b'] : ['#1d1c19', '#25231f', '#f5f1e8']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.goto(`/blog/${noteId}`);
    await expect(page.getByLabel('Markdown 본문')).toBeVisible();
    const notePalette = await page.getByTestId('markdown-workspace').evaluate(node => ['--workspace-paper', '--workspace-sidebar', '--workspace-ink'].map(k => getComputedStyle(node).getPropertyValue(k).trim()));
    expect(notePalette).toEqual(palette);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await expect(page).toHaveTitle('노트-Workspace note');
    await page.goto('/canvas');
  }
});

test('navigation and document titles consistently use Canvas and Notes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '노트', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '캔버스', exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/게시글|그림판/);
  await page.goto(`/canvas/${canvasId}`);
  await expect(page).toHaveTitle('캔버스-Workspace canvas');
  await expect(page.getByRole('button', { name: '캔버스 목록으로', exact: true })).toBeVisible();
  await page.goto('/canvas');
  await expect(page).toHaveTitle('캔버스-목록');
});
