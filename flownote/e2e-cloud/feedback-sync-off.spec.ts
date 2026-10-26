import { markdownSource } from './helpers/markdown';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
test.use({ browserName: 'webkit',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.2.0' });

test('OFF refuses an unsaved cloud draft, then keeps server-authored content and offline edits through reload', async ({ page, request }) => {
  test.setTimeout(150000);
  const email = `feedback-off-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `off-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic feedback OFF check',
  } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const id = randomUUID();
  const note = { id, title: 'Server-authored feedback check', content: { format: 'markdown', version: 1, markdown: 'Original server body' }, revision: 1, client_id: randomUUID() };
  expect((await request.post(`${api}/api/notes`, { headers, data: note })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), user);
  try {
    await page.goto('/settings');
    await page.evaluate(({ owner, note }) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('flownote-note-drafts', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('drafts');
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({ userId: owner, note: { ...note, content: { ...note.content, markdown: 'Unacknowledged input' } },
          baseRevision: 1, sequence: 'feedback-off-draft', updatedAt: Date.now() }, JSON.stringify([owner, note.id]));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      open.onerror = () => reject(open.error);
    }), { owner: user.id, note });
    const toggle = page.getByRole('switch', { name: '앱 동기화', exact: true });
    page.once('dialog', dialog => dialog.accept());
    await toggle.click();
    await expect(page.getByRole('alert')).toContainText('서버에 저장되지 않은 초안');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const readDraft = () => page.evaluate(({ owner, id }) => new Promise<{ note: { content: { markdown: string } } }>((resolve, reject) => {
      const open = indexedDB.open('flownote-note-drafts', 1);
      open.onsuccess = () => {
        const db = open.result, row = db.transaction('drafts').objectStore('drafts').get(JSON.stringify([owner, id]));
        row.onsuccess = () => { db.close(); resolve(row.result); }; row.onerror = () => { db.close(); reject(row.error); };
      }; open.onerror = () => reject(open.error);
    }), { owner: user.id, id });
    expect((await readDraft()).note.content.markdown).toBe('Unacknowledged input');
    // Simulate the editor's save acknowledgement on the real cloud API. The
    // persisted draft stays present with identical content, so it must not block OFF.
    const remote = await (await request.get(`${api}/api/notes/${id}`, { headers })).json();
    expect(remote.content.markdown).toBe('Original server body');
    expect((await request.post(`${api}/api/notes`, { headers, data: { id, title: remote.title,
      revision: Number(remote.revision) + 1, client_id: randomUUID(),
      content: { ...remote.content, markdown: 'Unacknowledged input' } } })).ok()).toBeTruthy();
    page.once('dialog', dialog => dialog.accept());
    await toggle.click();
    await expect(page.getByText('꺼짐 · 기기 전용', { exact: true })).toBeVisible();
    const outgoing: string[] = [];
    page.on('request', request => { if (/\/web-api\/|\.railway\.app/.test(request.url())) outgoing.push(request.method()); });
    await page.goto(`/blog/${id}`);
    await expect((await markdownSource(page))).toHaveValue('Unacknowledged input');
    await (await markdownSource(page)).fill('Offline edit of the server-authored note');
    await expect(page.getByTestId('note-save-status')).toHaveText('기기에 저장됨 · 동기화 꺼짐');
    await page.reload();
    await expect((await markdownSource(page))).toHaveValue('Offline edit of the server-authored note');
    expect(outgoing).toEqual([]);
    const after = await (await request.get(`${api}/api/notes/${id}`, { headers })).json();
    expect(after.content.markdown).toBe('Unacknowledged input', 'OFF edits must never secretly upload');
  } finally {
    expect((await request.delete(`${api}/api/notes/${id}`, { headers })).ok()).toBeTruthy();
  }
});
