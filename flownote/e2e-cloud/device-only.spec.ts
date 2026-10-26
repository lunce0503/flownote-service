import { markdownSource } from './helpers/markdown';
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
test.use({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.2.0' });
type Workspace = { notes: { id: string; content: { markdown: string } }[]; canvasContents: { lines: unknown[]; images: unknown[] }[]; diaries: { todos: { label: string }[] }[]; tasks: unknown[]; schedules: unknown[] };
const readWorkspace = (page: Page, owner: string): Promise<Workspace> => page.evaluate(owner => new Promise((resolve, reject) => {
  const open = indexedDB.open('flownote-device-workspaces', 1);
  open.onsuccess = () => {
    const db = open.result;
    const request = db.transaction('workspaces').objectStore('workspaces').get(owner);
    request.onsuccess = () => { resolve(request.result); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  };
  open.onerror = () => reject(open.error);
}), owner);
const toggle = async (page: Page, enabled: boolean) => {
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('switch', { name: '앱 동기화', exact: true }).click();
  await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', String(enabled));
};

test('cloud material is available offline and device edits reconcile on re-enable without background traffic', async ({ page, request }) => {
  test.setTimeout(150000);
  const email = `device-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `device-${randomUUID().slice(0, 8)}`, nickname: 'Device staging' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } }); expect(login.ok()).toBeTruthy();
  const { user, token } = await login.json(); const headers = { Authorization: `Bearer ${token}` };
  const cloudId = randomUUID();
  const original = { id: cloudId, title: 'Cloud original', content: { format: 'markdown', version: 1, markdown: 'untouched cloud' }, revision: 1, client_id: randomUUID() };
  expect((await request.post(`${api}/api/notes`, { headers, data: original })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    if (!sessionStorage.getItem('device-suite-initialized')) { localStorage.setItem('flownote_auth_user', JSON.stringify(user)); sessionStorage.setItem('device-suite-initialized', '1'); }
    Object.assign(window, { deviceExports: [], ReactNativeWebView: { postMessage(message: string) { (window as Window & { deviceExports: string[] }).deviceExports.push(message); } } });
  }, { user });
  try {
    await page.goto('/settings'); await toggle(page, false);
    await expect(page.getByText('꺼짐 · 기기 전용', { exact: true })).toBeVisible();
    const outgoing: string[] = [];
    page.on('request', request => { if (/\/web-api\/|\.railway\.app/.test(request.url())) outgoing.push(`${request.method()} ${request.url()}`); });
    await page.reload(); await expect(page.getByText('꺼짐 · 기기 전용', { exact: true })).toBeVisible();
    await page.goto('/blog'); await expect(page.getByRole('button', { name: 'Cloud original', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cloud original', exact: true }).click();
    await (await markdownSource(page)).fill('first offline revision of cloud note');
    await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
    await (await markdownSource(page)).fill('second offline revision of cloud note');
    await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
    page.once('dialog', dialog => dialog.accept('Device note'));
    await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
    await expect(page).toHaveURL(/\/blog\/device-/);
    await (await markdownSource(page)).fill('# 기기만의 원고\n\nDo not upload');
    await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
    await page.reload(); await expect((await markdownSource(page))).toHaveValue('# 기기만의 원고\n\nDo not upload');
    await page.goto('/canvas'); await page.getByRole('button', { name: '새 캔버스', exact: true }).click();
    await expect(page).toHaveURL(/\/canvas\/device-/);
    const surface = page.getByTestId('canvas-input-surface'); await expect(surface).toHaveAttribute('data-ready', 'true');
    await page.waitForTimeout(1000);
    const box = await surface.boundingBox(); expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 200, box!.y + 250); await page.mouse.down();
    await page.mouse.move(box!.x + 300, box!.y + 300, { steps: 12 }); await page.mouse.up();
    await expect.poll(async () => (await readWorkspace(page, user.id)).canvasContents[0]?.lines.length).toBe(1);
    await page.locator('input[type="file"][accept="image/*,application/pdf"]').last().setInputFiles({
      name: 'offline-pixel.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
    await expect.poll(async () => (await readWorkspace(page, user.id)).canvasContents[0]?.images.length).toBe(1);
    expect((await readWorkspace(page, user.id)).canvasContents[0].images[0]).toMatchObject({ contentType: 'image/png' });
    await page.reload(); await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
    await page.goto('/planner'); await page.getByPlaceholder('오늘의 할일').fill('기기 할 일'); await page.getByPlaceholder('오늘의 할일').press('Enter');
    await expect.poll(async () => (await readWorkspace(page, user.id)).diaries[0]?.todos[0]?.label).toBe('기기 할 일');
    await page.getByTitle('캘린더에 오늘 마감 작업으로 올리기').click();
    await expect.poll(async () => (await readWorkspace(page, user.id)).tasks.length).toBe(1);
    await page.reload(); await expect(page.getByText('기기 할 일', { exact: true }).first()).toBeVisible();
    await page.goto('/agent'); await expect(page.getByRole('heading', { name: '서버 연결이 필요한 기능입니다' })).toBeVisible();
    await page.goto('/settings'); await page.getByRole('button', { name: '기기 자료 JSON 백업 내보내기' }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { deviceExports: string[] }).deviceExports.length)).toBe(1);
    const exported = await page.evaluate(() => JSON.parse((window as Window & { deviceExports: string[] }).deviceExports[0]));
    const backup = JSON.parse(Buffer.from(exported.base64, 'base64').toString('utf8'));
    expect(backup.workspace.notes.find((item: { title: string }) => item.title === 'Device note').content.markdown).toContain('Do not upload'); expect(backup).not.toHaveProperty('token');
    const stalePageBlocked = await page.evaluate(async ({ owner }) => {
      localStorage.setItem(`flownote.device-mode:${owner}`, 'cloud');
      try {
        await fetch('/web-api/api/diary/2026-10-20', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Flownote-Web': '1' }, body: JSON.stringify({ todos: [], grid: {}, journal: [{ text: 'Must never upload from stale local page' }] }) });
        return false;
      } catch { return true; }
      finally { localStorage.setItem(`flownote.device-mode:${owner}`, 'device'); }
    }, { owner: user.id });
    expect(stalePageBlocked).toBeTruthy();
    expect(outgoing).toEqual([]);
    const beforeCloud = await (await request.get(`${api}/api/notes`, { headers })).json();
    expect(beforeCloud).toHaveLength(1); expect(beforeCloud[0].content.markdown).toBe(original.content.markdown);
    await page.evaluate(async ({ owner }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(`flownote-note-drafts-device:${owner}`);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put({ userId: owner, note: { id: 'device-uncommitted', title: 'Uncommitted', content: { format: 'markdown', markdown: 'must survive' } }, sequence: 'synthetic', baseRevision: 0 }, 'synthetic-draft');
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
        }; open.onerror = () => reject(open.error);
      });
    }, { owner: user.id });
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('switch', { name: '앱 동기화', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('미저장 초안');
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');
    await page.evaluate(async ({ owner }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(`flownote-note-drafts-device:${owner}`);
        open.onsuccess = () => { const db = open.result, tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').delete('synthetic-draft'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
        open.onerror = () => reject(open.error);
      });
    }, { owner: user.id });
    let interrupted = false;
    await page.route('**/web-api/api/notes', async route => {
      if (!interrupted && route.request().method() === 'POST') { interrupted = true; await route.abort('internetdisconnected'); return; }
      await route.continue();
    });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('switch', { name: '앱 동기화', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');
    expect(interrupted).toBeTruthy();
    await page.unroute('**/web-api/api/notes');
    await toggle(page, true);
    await page.goto('/blog'); await expect(page.getByRole('button', { name: 'Cloud original', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Device note', exact: true })).toBeVisible();
    const afterCloud = await (await request.get(`${api}/api/notes`, { headers })).json();
    expect(afterCloud).toHaveLength(2);
    expect(afterCloud.find((item: { id: string }) => item.id === cloudId)?.content.markdown).toBe('second offline revision of cloud note');
    expect(afterCloud.find((item: { title: string; content: { markdown: string } }) => item.title === 'Device note')?.content.markdown).toContain('Do not upload');
    const cloudCanvases = await (await request.get(`${api}/api/canvas/documents`, { headers })).json();
    expect(cloudCanvases).toHaveLength(1);
    const cloudElements = await (await request.get(`${api}/api/canvas/elements?canvasId=${cloudCanvases[0].id}`, { headers })).json();
    expect(cloudElements.lines).toHaveLength(1); expect(cloudElements.images).toHaveLength(1);
    expect((await (await request.get(`${api}/api/tasks`, { headers })).json())).toHaveLength(1);
    await page.goto('/settings'); await toggle(page, false);
    await page.goto('/blog'); await page.getByRole('button', { name: 'Device note', exact: true }).click();
    await expect((await markdownSource(page))).toHaveValue('# 기기만의 원고\n\nDo not upload');
    expect(await page.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally {
    const notes = await (await request.get(`${api}/api/notes`, { headers })).json();
    for (const item of notes) await request.delete(`${api}/api/notes/${item.id}`, { headers });
    const canvases = await (await request.get(`${api}/api/canvas/documents`, { headers })).json();
    for (const item of canvases) await request.delete(`${api}/api/canvas/documents/${item.id}`, { headers });
    const tasks = await (await request.get(`${api}/api/tasks`, { headers })).json();
    for (const item of tasks) await request.delete(`${api}/api/tasks/${item.id}`, { headers });
  }
});

test('same-field conflict keeps the more substantial offline edit and preserves the server loser', async ({ page, request }) => {
  test.setTimeout(120000);
  const email = `device-conflict-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `conflict-${randomUUID().slice(0, 8)}`, nickname: 'Device conflict' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } }); expect(login.ok()).toBeTruthy();
  const { user, token } = await login.json(); const headers = { Authorization: `Bearer ${token}` };
  const id = randomUUID(), baseMarkdown = 'common base';
  expect((await request.post(`${api}/api/notes`, { headers, data: {
    id, title: 'Conflict note', content: { format: 'markdown', version: 1, markdown: baseMarkdown }, revision: 1, client_id: randomUUID(),
  } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), { user });
  const localMarkdown = '# offline detailed edit\n\n' + Array.from({ length: 24 }, (_, index) => `meaningful-${index}`).join(' ');
  try {
    await page.goto('/settings'); await toggle(page, false);
    await page.goto(`/blog/${id}`); await (await markdownSource(page)).fill(localMarkdown);
    await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
    expect((await request.post(`${api}/api/notes`, { headers, data: {
      id, title: 'Conflict note', content: { format: 'markdown', version: 1, markdown: 'remote short edit' }, revision: 2, client_id: randomUUID(),
    } })).ok()).toBeTruthy();
    await page.goto('/settings'); await toggle(page, true);
    const stored = await (await request.get(`${api}/api/notes/${id}`, { headers })).json();
    expect(stored.content.markdown).toBe(localMarkdown);
    const workspace = await readWorkspace(page, user.id) as Workspace & { sync: { recovery: { winner: string; loser: { content: { markdown: string } } }[] } };
    expect(workspace.sync.recovery).toHaveLength(1);
    expect(workspace.sync.recovery[0].winner).toBe('local');
    expect(workspace.sync.recovery[0].loser.content.markdown).toBe('remote short edit');
  } finally {
    await request.delete(`${api}/api/notes/${id}`, { headers });
  }
});

test('device mode is isolated by account and unavailable storage cannot silently disable cloud sync', async ({ page, request }) => {
  const email = `device-isolation-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `device-${randomUUID().slice(0, 8)}`, nickname: 'Device isolation' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } }); expect(login.ok()).toBeTruthy();
  const { user, token } = await login.json();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => { if (!sessionStorage.getItem('device-isolation-initialized')) { localStorage.setItem('flownote_auth_user', JSON.stringify(user)); sessionStorage.setItem('device-isolation-initialized', '1'); } }, { user });
  await page.goto('/settings');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('switch', { name: '앱 동기화', exact: true }).click();
  await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open() { throw new DOMException('Unavailable', 'SecurityError'); } } }); });
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('switch', { name: '앱 동기화', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.reload(); await toggle(page, false);
  await page.goto('/blog'); page.once('dialog', dialog => dialog.accept('Only account A'));
  await page.getByRole('button', { name: '새 노트', exact: true }).first().click(); await expect(page.getByLabel('노트 제목')).toHaveValue('Only account A');
  await page.evaluate(({ user }) => { localStorage.setItem('flownote_auth_user', JSON.stringify({ ...user, id: `${user.id}-other` })); localStorage.setItem(`flownote.device-mode:${user.id}-other`, 'device'); }, { user });
  await page.goto('/blog'); await expect(page.getByRole('button', { name: 'Only account A', exact: true })).toHaveCount(0);
  await page.evaluate(({ user }) => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), { user });
  await page.goto('/blog'); await expect(page.getByRole('button', { name: 'Only account A', exact: true })).toBeVisible();
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('Synthetic quota', 'QuotaExceededError'); }; });
  page.once('dialog', dialog => dialog.accept('Must not be called saved'));
  await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
  await expect(page.locator('div[role="alert"]')).toContainText('파일 작업에 실패');
  await page.reload(); await expect(page.getByRole('button', { name: 'Must not be called saved', exact: true })).toHaveCount(0);
  expect((await (await request.get(`${api}/api/notes`, { headers: { Authorization: `Bearer ${token}` } })).json())).toEqual([]);
});

test('phone and desktop app markers restore an independent device workspace without a server session', async ({ browser }) => {
  for (const [marker, viewport] of [['FlownoteAndroid/1.2.0', { width: 390, height: 844 }], ['FlownoteDesktop/1.2.0', { width: 1280, height: 900 }]] as const) {
    const context = await browser.newContext({ userAgent: `Mozilla/5.0 ${marker}`, viewport });
    try {
      const owner = `synthetic-device-${randomUUID()}`;
      await context.addInitScript(({ owner }) => {
        localStorage.setItem('flownote_auth_user', JSON.stringify({ id: owner, username: 'Device', nickname: 'Device', email: 'device@example.com', role: 'USER' }));
        localStorage.setItem(`flownote.device-mode:${owner}`, 'device');
      }, { owner });
      const page = await context.newPage(); const outgoing: string[] = [];
      page.on('request', request => { if (/\/web-api\/|\.railway\.app/.test(request.url())) outgoing.push(request.url()); });
      await page.goto(`${web}/settings`);
      await expect(page.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('button', { name: '프로필 저장', exact: true })).toBeDisabled();
      await expect(page.locator('header')).toHaveCount(0);
      await page.goto(`${web}/blog`); page.once('dialog', dialog => dialog.accept('Device restore'));
      await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
      await (await markdownSource(page)).fill('Stored only on this device');
      await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
      await page.reload(); await expect((await markdownSource(page))).toHaveValue('Stored only on this device');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      expect(outgoing).toEqual([]);
    } finally { await context.close(); }
  }
});
