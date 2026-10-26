import { markdownSource } from './helpers/markdown';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Trusted staging only. Do not run this synthetic-account suite against production.
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string;
let user: Record<string, unknown>;
const ids: string[] = [];
const folderIds: string[] = [];
const markdown = '# 한글\n\n- [x] 보존\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n$x^2$\n\n<script>window.blogInjected = true</script>\n[blocked](javascript:alert(1))\n';
const headers = () => ({ Authorization: `Bearer ${token}` });
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const email = `blog-workspace-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `blog-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic blog' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); ({ token, user } = await login.json());
  for (let i = 0; i < 5; i++) {
    const id = randomUUID(); ids.push(id);
    expect((await request.post(`${api}/api/notes`, { headers: headers(), data: { id, title: `Synthetic note ${i}`,
      content: { format: 'markdown', version: 1, markdown: i === 0 ? markdown : `note ${i}` },
      created_at: '2026-10-19T00:00:00Z', revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
  }
  const folder = await request.post(`${api}/api/note-folders`, { headers: headers(), data: { category: 'Synthetic category', name: 'Synthetic folder', note_ids: [] } });
  expect(folder.ok()).toBeTruthy(); folderIds.push((await folder.json()).id);
});
test.afterAll(async ({ request }) => {
  for (const id of ids) expect((await request.delete(`${api}/api/notes/${id}`, { headers: headers() })).ok()).toBeTruthy();
  for (const id of folderIds) expect((await request.delete(`${api}/api/note-folders/${id}`, { headers: headers() })).ok()).toBeTruthy();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), { user });
});

test('summary pagination, detail, legacy full-list and old-client write protection', async ({ request }) => {
  const observed: string[] = []; let cursor = '';
  do {
    const response = await request.get(`${api}/api/notes?view=summary&limit=2&cursor=${encodeURIComponent(cursor)}`, { headers: headers() });
    expect(response.ok()).toBeTruthy(); const page = await response.json();
    for (const note of page.notes) { expect(note).not.toHaveProperty('content'); observed.push(note.id); }
    cursor = page.next_cursor ?? '';
  } while (cursor);
  expect(new Set(observed).size).toBe(5); expect(observed).toHaveLength(5);
  const detail = await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() });
  expect(detail.ok()).toBeTruthy(); expect((await detail.json()).content.markdown).toBe(markdown);
  expect((await request.post(`${api}/api/notes`, { headers: headers(), data: { id: ids[0], title: 'old client', content: [], revision: 2, client_id: randomUUID() } })).status()).toBe(409);
  const full = await (await request.get(`${api}/api/notes`, { headers: headers() })).json();
  expect(Array.isArray(full)).toBeTruthy(); expect(full.find((n: { id: string }) => n.id === ids[0]).content.markdown).toBe(markdown);
  expect((await request.get(`${api}/api/notes?view=summary&cursor=invalid`, { headers: headers() })).status()).toBe(400);
  expect((await request.get(`${api}/api/notes/${randomUUID()}`, { headers: headers() })).status()).toBe(404);
  expect((await request.get(`${api}/api/notes/${ids[0]}`)).status()).toBe(401);
});

test('metadata shell does not fetch bodies/renderers; selection, preview safety and exact .md export', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', r => requested.push(r.url()));
  await page.goto('/blog');
  await expect(page.getByTestId('canvas-explorer')).toHaveAttribute('data-unified', 'true');
  await expect(page.getByRole('button', { name: 'Synthetic note 0', exact: true })).toBeVisible();
  expect(requested.filter(url => /\/api\/notes\/[0-9a-f-]+(?:\?|$)/.test(url))).toEqual([]);
  expect(requested.filter(url => /editor-blocknote|editor-integration|MarkdownPreview/.test(url))).toEqual([]);
  expect(requested.filter(url => /\/api\/notes(?:\?|$)/.test(url)).every(url => url.includes('view=summary'))).toBeTruthy();
  await page.getByRole('button', { name: 'Synthetic note 0', exact: true }).click();
  await expect((await markdownSource(page))).toHaveValue(markdown);
  expect(requested.filter(url => /\/api\/notes\/[0-9a-f-]+(?:\?|$)/.test(url)).every(url => url.includes(ids[0]))).toBeTruthy();
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByTestId('markdown-preview').getByRole('heading', { name: '한글' })).toBeVisible();
  await expect(page.getByTestId('markdown-preview').locator('table')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { blogInjected?: boolean }).blogInjected)).toBeUndefined();
  expect(await page.getByTestId('markdown-preview').locator('a').evaluateAll(nodes => nodes.every(n => !n.getAttribute('href')?.startsWith('javascript:')))).toBeTruthy();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '.md 내보내기', exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/\.md$/);
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(markdown);
});

test('a reused client revision only acknowledges the same document', async ({ request }) => {
  const id = randomUUID(), clientId = randomUUID(); ids.push(id);
  const original = { id, title: 'Idempotent synthetic note', content: { format: 'markdown', version: 1, markdown: 'first' }, revision: 1, client_id: clientId };
  try {
    expect((await request.post(`${api}/api/notes`, { headers: headers(), data: original })).ok()).toBeTruthy();
    expect((await request.post(`${api}/api/notes`, { headers: headers(), data: original })).ok()).toBeTruthy();
    expect((await request.post(`${api}/api/notes`, { headers: headers(), data: { ...original, content: { ...original.content, markdown: 'different unsaved input' } } } )).status()).toBe(409);
    const stored = await (await request.get(`${api}/api/notes/${id}`, { headers: headers() })).json();
    expect(stored.content.markdown).toBe('first');
  } finally {
    expect((await request.delete(`${api}/api/notes/${id}`, { headers: headers() })).ok()).toBeTruthy();
    ids.splice(ids.indexOf(id), 1);
  }
});

test('fast route changes, failed saves and reload keep the latest draft', async ({ page }) => {
  await page.goto(`/blog/${ids[0]}`);
  await expect((await markdownSource(page))).toHaveValue(markdown);
  await page.route('**/web-api/api/notes', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic failure"}' }) : route.continue());
  const text = markdown + '\n빠른 이동 마지막 입력';
  await (await markdownSource(page)).fill(text);
  await page.getByRole('treeitem', { name: 'Synthetic note 1.md', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Synthetic note 0.md', exact: true }).click();
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect((await markdownSource(page))).toHaveValue(text);
  await expect(page.getByTestId('note-save-status')).toContainText('저장 실패');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect((await markdownSource(page))).toHaveValue(text);
  await page.unroute('**/web-api/api/notes');
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
});

test('a real concurrent API write exposes conflict recovery without a sync event', async ({ page, request }) => {
  const initial = await (await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).json();
  await page.goto(`/blog/${ids[0]}`);
  await expect((await markdownSource(page))).toHaveValue(initial.content.markdown);
  const localText = initial.content.markdown + '\n확인 후 복구할 로컬 입력';
  const remoteText = initial.content.markdown + '\n다른 클라이언트의 변경';
  await page.route('**/web-api/api/notes', async route => {
    expect(route.request().method()).toBe('POST');
    const remote = await request.post(`${api}/api/notes`, { headers: headers(), data: {
      ...initial, content: { ...initial.content, markdown: remoteText }, revision: initial.revision + 1, client_id: randomUUID(),
    } });
    expect(remote.ok()).toBeTruthy();
    await route.continue();
  }, { times: 1 });
  await (await markdownSource(page)).fill(localText);
  await expect(page.getByTestId('note-save-status')).toContainText('충돌');
  await expect((await markdownSource(page))).toBeDisabled();
  expect((await (await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).json()).content.markdown).toBe(remoteText);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '서버본 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '초안 복구', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '초안 복구', exact: true }).click();
  await expect((await markdownSource(page))).toHaveValue(localText);
  await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
  expect((await (await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).json()).content.markdown).toBe(localText);
});

test('the explorer renders its first metadata page while a later page is delayed', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let firstTitle = '';
  let remaining: unknown[] = [];
  await page.route('**/web-api/api/notes?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'summary') return route.continue();
    if (url.searchParams.get('cursor') === 'delayed-page') {
      await waiting;
      return route.fulfill({ json: { notes: remaining } });
    }
    const response = await route.fetch();
    const result = await response.json();
    firstTitle = result.notes[0].title;
    remaining = result.notes.slice(1);
    await route.fulfill({ response, json: { notes: result.notes.slice(0, 1), next_cursor: 'delayed-page' } });
  });
  try {
    await page.goto('/blog');
    await expect.poll(() => firstTitle).not.toBe('');
    await expect(page.getByRole('button', { name: firstTitle, exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Synthetic note 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Synthetic note \d$/ })).toHaveCount(5);
});

for (const width of [390, 820, 1440]) test(`workspace navigation and overflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/blog/${ids[0]}`);
  await expect((await markdownSource(page))).toBeVisible();
  if (width === 390) {
    const toggle = page.getByRole('button', { name: '탐색기 토글' }); await toggle.click();
    await expect(page.getByRole('dialog', { name: '노트 탐색기' })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(toggle).toBeFocused();
    await toggle.click();
  }
  const folder = page.getByRole('treeitem', { name: 'Synthetic folder', exact: true });
  await folder.focus(); await page.keyboard.press('ArrowLeft'); await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight'); await expect(folder).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('real folder movement does not resave note body; folder deletion leaves notes', async ({ request }) => {
  const before = await (await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).json();
  expect((await request.post(`${api}/api/note-folders/${folderIds[0]}/notes/${ids[0]}`, { headers: headers() })).ok()).toBeTruthy();
  const after = await (await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).json();
  expect(after.content).toEqual(before.content); expect(after.revision).toBe(before.revision);
  const folder = folderIds.pop()!;
  expect((await request.delete(`${api}/api/note-folders/${folder}`, { headers: headers() })).ok()).toBeTruthy();
  expect((await request.get(`${api}/api/notes/${ids[0]}`, { headers: headers() })).ok()).toBeTruthy();
});

test('sidebar creates, renames, moves and deletes files without arbitrary nesting', async ({ page, request }) => {
  await page.goto('/blog');
  const initialIds = new Set(ids);
  page.once('dialog', dialog => dialog.accept('UI synthetic note'));
  await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
  await expect((await markdownSource(page))).toBeVisible();
  const id = page.url().split('/').at(-1)!;
  expect(initialIds.has(id)).toBeFalsy(); ids.push(id);
  await page.getByLabel('노트 제목').fill('UI renamed note');
  await (await markdownSource(page)).fill('# Sidebar saved body');
  await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
  const before = await (await request.get(`${api}/api/notes/${id}`, { headers: headers() })).json();
  const dialogs = ['UI folder', 'UI category'];
  const accept = (dialog: import('@playwright/test').Dialog) => dialog.accept(dialogs.shift()!);
  page.on('dialog', accept);
  await page.getByRole('button', { name: '새 폴더', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'UI folder', exact: true })).toBeVisible();
  page.off('dialog', accept);
  const folders = await (await request.get(`${api}/api/note-folders`, { headers: headers() })).json();
  const folder = folders.find((f: { name: string }) => f.name === 'UI folder'); folderIds.push(folder.id);
  await page.getByLabel('UI renamed note 파일 동작').click();
  await page.getByLabel('UI renamed note 이동').selectOption(folder.id);
  await expect(page.getByRole('group', { name: 'UI folder 노트', exact: true }).getByRole('treeitem', { name: 'UI renamed note.md', exact: true })).toBeVisible();
  const after = await (await request.get(`${api}/api/notes/${id}`, { headers: headers() })).json();
  expect(after.revision).toBe(before.revision); expect(after.content).toEqual(before.content);
  await page.getByLabel('UI folder 폴더 동작').click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '폴더만 삭제 (노트 유지)' }).click();
  await expect(page.getByRole('treeitem', { name: 'UI folder', exact: true })).toHaveCount(0);
  folderIds.splice(folderIds.indexOf(folder.id), 1);
  await expect(page.getByRole('group', { name: '미분류', exact: true }).getByRole('treeitem', { name: 'UI renamed note.md', exact: true })).toBeVisible();
  await page.getByLabel('UI renamed note 파일 동작').click();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '노트 삭제', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'UI renamed note.md', exact: true })).toHaveCount(0);
  ids.splice(ids.indexOf(id), 1);
});

test('records synthetic alternating API measurements for a trusted staging run', async ({ request }, testInfo) => {
  const canvases: string[] = [];
  const measurements: { kind: string; milliseconds: number; bytes: number }[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const response = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: `Synthetic blog comparison ${i}` } });
      expect(response.ok()).toBeTruthy(); canvases.push((await response.json()).id);
    }
    for (let i = 0; i < 5; i++) {
      for (const [kind, path] of [['notes-summary', '/api/notes?view=summary&limit=50'], ['canvas-list', '/api/canvas/documents'], ['notes-detail', `/api/notes/${ids[0]}`], ['notes-legacy-list', '/api/notes']]) {
        const start = performance.now(); const response = await request.get(`${api}${path}`, { headers: headers() });
        const body = await response.body(); const milliseconds = performance.now() - start;
        expect(response.ok()).toBeTruthy(); measurements.push({ kind, milliseconds, bytes: body.byteLength });
      }
    }
    await testInfo.attach('synthetic-api-observations', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      environment: 'staging', data: 'five synthetic notes and canvases', conditions: 'warm sequential alternating requests',
      metric: 'API request through body completion; not browser total or TTFB', measurements,
    }, null, 2)) });
  } finally {
    for (const id of canvases) expect((await request.delete(`${api}/api/canvas/documents/${id}`, { headers: headers() })).ok()).toBeTruthy();
  }
});

test('another synthetic account cannot read, title-update, delete or move these notes', async ({ request }) => {
  const email = `blog-other-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `other-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic other' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); const other = { Authorization: `Bearer ${(await login.json()).token}` };
  expect((await request.get(`${api}/api/notes/${ids[0]}`, { headers: other })).status()).toBe(404);
  expect((await request.patch(`${api}/api/notes/${ids[0]}`, { headers: other, data: { title: 'forbidden', revision: 999, client_id: randomUUID() } })).status()).toBe(404);
  expect((await request.delete(`${api}/api/notes/${ids[0]}`, { headers: other })).status()).toBe(404);
  expect((await request.get(`${api}/api/notes?view=summary`, { headers: other })).ok()).toBeTruthy();
  const summary = await (await request.get(`${api}/api/notes?view=summary`, { headers: other })).json();
  expect(summary.notes).toEqual([]);
  const created = await request.post(`${api}/api/note-folders`, { headers: other, data: { name: 'Other-owned folder', category: 'Synthetic', note_ids: [] } });
  expect(created.ok()).toBeTruthy(); const folder = (await created.json()).id;
  try {
    expect((await request.post(`${api}/api/note-folders/${folder}/notes/${ids[0]}`, { headers: other })).status()).toBe(404);
  } finally { expect((await request.delete(`${api}/api/note-folders/${folder}`, { headers: other })).ok()).toBeTruthy(); }
});

test('explicit legacy conversion keeps drawing, image, math, table and unknown originals server-owned', async ({ request }) => {
  const id = randomUUID(); ids.push(id);
  const original = [
    { type: 'drawing', props: { strokes: [{ x: 1, y: 2 }] } },
    { type: 'image', props: { url: 'https://example.com/synthetic.png', caption: 'image' } },
    { type: 'paragraph', content: [{ type: 'latex', props: { latex: 'x^2', displayMode: false } }] },
    { type: 'table', content: { rows: [{ cells: [[{ text: 'A' }]] }] } },
    { type: 'future-block', props: { payload: [1, 2] }, children: [{ type: 'paragraph', content: [{ text: 'nested' }] }] },
  ];
  const write = (content: unknown, revision: number, clientId = randomUUID()) => request.post(`${api}/api/notes`, {
    headers: headers(), data: { id, title: 'Legacy preservation', content, revision, client_id: clientId },
  });
  expect((await write(original, 1)).ok()).toBeTruthy();
  const opened = await (await request.get(`${api}/api/notes/${id}`, { headers: headers() })).json();
  expect(opened.content).toEqual(original); expect(opened.revision).toBe(1);
  const converted = await write({ format: 'markdown', version: 1, markdown: '# converted', legacy_original: [] }, 2);
  expect(converted.ok()).toBeTruthy(); expect((await converted.json()).content.legacy_original).toEqual(original);
  const client = randomUUID();
  const updated = await write({ format: 'markdown', version: 1, markdown: '# changed', legacy_original: [] }, 3, client);
  expect(updated.ok()).toBeTruthy(); expect((await updated.json()).content.legacy_original).toEqual(original);
  expect((await write({ format: 'markdown', version: 1, markdown: '# different' }, 3, client)).status()).toBe(409);
  expect((await write([], 4)).status()).toBe(409);
  expect((await write({ format: 'markdown', version: 2, markdown: '# unsupported' }, 4)).status()).toBe(400);
});

test('failed target detail exposes a draft export and leaves other notes usable', async ({ page }) => {
  await page.route('**/web-api/api/notes', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic save failure"}' }) : route.continue());
  await page.goto(`/blog/${ids[1]}`);
  await expect((await markdownSource(page))).toBeVisible();
  await (await markdownSource(page)).fill('draft before target body failure');
  await expect(page.getByTestId('note-save-status')).toContainText('기기에 보관됨');
  const target = `**/web-api/api/notes/${ids[1]}`;
  await page.route(target, route => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"synthetic body unavailable"}' }));
  await page.getByRole('treeitem', { name: 'Synthetic note 2.md', exact: true }).click();
  await expect((await markdownSource(page))).toBeVisible();
  await page.getByRole('treeitem', { name: 'Synthetic note 1.md', exact: true }).click();
  await expect(page.getByRole('button', { name: '기기 초안 .md 내보내기', exact: true })).toBeVisible();
  await expect(page.getByLabel('Markdown 본문')).toHaveCount(0);
  await expect(page.getByLabel('노트 편집')).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Synthetic note 2.md', exact: true }).click();
  await expect((await markdownSource(page))).toBeVisible();
});
