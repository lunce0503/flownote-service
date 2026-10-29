import { showReaderTools } from './helpers/reader';
import { expect, test, devices, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { textbookPdf } from '../../flownote-desktop/scripts/library-fixture.mjs';
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
test.use({ browserName: 'webkit' });
const MiB = 1024 * 1024;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function account(request: APIRequestContext) {
  const email = `cloud-books-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `bk-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic cloud library' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); return login.json();
}
const headers = (actor: { token: string }) => ({ Authorization: `Bearer ${actor.token}` });
const metadata = (bytes: number, title = 'Synthetic cloud textbook') => ({ id: randomUUID(), title, subject: '수학', pages: 1, page: 1,
  bookmarks: [], favorite: false, cover: png, filename: 'synthetic-cloud.pdf', bytes, createdAt: new Date().toISOString() });
async function upload(request: APIRequestContext, actor: { token: string; user: { id: string } }, original: Buffer, book = metadata(original.length)) {
  const start = await request.post(`${api}/api/library/uploads`, { headers: headers(actor), data: { book } });
  expect(start.ok()).toBeTruthy(); const session = await start.json();
  expect(session.chunkBytes).toBe(MiB);
  for (let part = 0; part < Math.ceil(original.length / MiB); part++) {
    const chunk = original.subarray(part * MiB, (part + 1) * MiB);
    const saved = await request.put(`${api}/api/library/uploads/${session.id}/chunks/${part}`, {
      headers: { ...headers(actor), 'Content-Type': 'application/octet-stream', 'X-Chunk-Sha256': createHash('sha256').update(chunk).digest('hex') }, data: chunk,
    });
    expect(saved.ok(), `chunk ${part}`).toBeTruthy();
  }
  const complete = await request.post(`${api}/api/library/uploads/${session.id}/complete`, { headers: headers(actor) });
  expect(complete.ok()).toBeTruthy(); expect(complete.headers()['x-flownote-owner']).toBe(actor.user.id);
  return complete.json();
}
async function remove(request: APIRequestContext, actor: { token: string }, id: string) {
  const current = await request.get(`${api}/api/library/books/${id}`, { headers: headers(actor) });
  if (current.status() === 404) return;
  expect(current.ok()).toBeTruthy(); const book = await current.json();
  if (!book.deleted) expect((await request.delete(`${api}/api/library/books/${id}?revision=${book.revision}`, { headers: headers(actor) })).ok()).toBeTruthy();
}

test('private library API enforces ownership, chunk hashes, metadata revisions, saved dictionary and tombstones', async ({ request }) => {
  test.setTimeout(180000);
  const actor = await account(request), other = await account(request), original = textbookPdf(2 * MiB + 777);
  const book = metadata(original.length);
  const start = await request.post(`${api}/api/library/uploads`, { headers: headers(actor), data: { book } });
  expect(start.ok()).toBeTruthy(); const session = await start.json();
  try {
    expect((await request.put(`${api}/api/library/uploads/${session.id}/chunks/0`, { headers: headers(other), data: Buffer.from('%PDF-') })).status()).toBe(404);
    expect((await request.put(`${api}/api/library/uploads/${session.id}/chunks/0`, { headers: { ...headers(actor), 'X-Chunk-Sha256': '0'.repeat(64) }, data: original.subarray(0, MiB) })).status()).toBe(400);
    expect((await request.post(`${api}/api/library/uploads/${session.id}/complete`, { headers: headers(actor) })).status()).toBe(400);
    const saved = await upload(request, actor, original, book);
    const duplicate = await request.post(`${api}/api/library/uploads/${session.id}/complete`, { headers: headers(actor) });
    expect(duplicate.ok()).toBeTruthy(); expect((await duplicate.json()).revision).toBe(saved.revision);
    expect((await request.get(`${api}/api/library/books`, { headers: { ...headers(actor), 'X-Flownote-Expected-Owner': other.user.id } })).status()).toBe(409);
    for (const path of [`/books/${book.id}`, `/books/${book.id}/file`, `/books/${book.id}/terms`]) {
      expect((await request.get(`${api}/api/library${path}`, { headers: { ...headers(other), 'X-Flownote-Owner': actor.user.id } })).status()).toBe(404);
    }
    expect((await request.post(`${api}/api/library/uploads`, { headers: headers(actor), data: { book: { ...book, id: randomUUID(), user_id: other.user.id } } })).status()).toBe(400);
    expect((await request.post(`${api}/api/library/uploads`, { headers: headers(actor), data: { book: { ...book, id: randomUUID(), bytes: 100 * MiB + 1 } } })).status()).toBe(400);
    const changed = await request.patch(`${api}/api/library/books/${book.id}`, { headers: headers(actor), data: { revision: saved.revision, changes: { title: 'Cloud renamed book', favorite: true, bookmarks: [1] } } });
    expect(changed.ok()).toBeTruthy(); const updated = await changed.json();
    expect(updated.title).toBe('Cloud renamed book'); expect(updated.favorite).toBe(true);
    expect((await request.patch(`${api}/api/library/books/${book.id}`, { headers: headers(actor), data: { revision: saved.revision, changes: { title: 'Stale overwrite' } } })).status()).toBe(409);
    const file = await request.get(`${api}/api/library/books/${book.id}/file`, { headers: headers(actor) });
    expect(file.ok()).toBeTruthy(); expect(file.headers()['cache-control']).toContain('no-store');
    expect(createHash('sha256').update(await file.body()).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
    const lookup = await request.post(`${api}/api/library/books/${book.id}/lookup`, { headers: headers(actor), data: { id: randomUUID(), page: 1, term: 'derivative' } });
    expect(lookup.ok()).toBeTruthy(); const found = await lookup.json();
    expect(found.result.status).toBe('temporarily_unavailable');expect(found.result.found).toBe(false);expect(found.result.definition).toBe('');expect(found.result.senses).toEqual([]);
    expect(found.saved.bookId).toBe(book.id); expect(found.saved.page).toBe(1);
    const manual = await request.post(`${api}/api/library/books/${book.id}/terms`, { headers: headers(actor), data: { id: found.saved.id, page: 1, term: 'derivative', definition: 'Synthetic preserved study note' } });
    expect(manual.ok()).toBeTruthy();
    const again = await request.post(`${api}/api/library/books/${book.id}/lookup`, { headers: headers(actor), data: { page: 1, term: 'derivative' } });
    expect(again.ok()).toBeTruthy(); const preserved=await again.json();expect(preserved.result.status).toBe('temporarily_unavailable');expect(preserved.saved.definition).toBe('Synthetic preserved study note');expect(preserved.saved.sourceUrl).toBe(found.saved.sourceUrl);
    const terms = await (await request.get(`${api}/api/library/books/${book.id}/terms`, { headers: headers(actor) })).json();
    expect(terms.terms).toHaveLength(1); expect(terms.terms[0].definition).toBe('Synthetic preserved study note');
    await remove(request, actor, book.id);
    expect((await request.get(`${api}/api/library/books/${book.id}/file`, { headers: headers(actor) })).status()).toBe(404);
    const list = await (await request.get(`${api}/api/library/books`, { headers: headers(actor) })).json();
    expect(list.books.find((item: { id: string }) => item.id === book.id).deleted).toBe(true);
    expect((await request.post(`${api}/api/library/uploads`, { headers: headers(actor), data: { book } })).status()).toBe(409);
  } finally { await remove(request, actor, book.id); }
});

test('100MiB private cloud upload and downloaded original have identical bytes', async ({ request }) => {
  test.setTimeout(300000);
  const actor = await account(request), original = textbookPdf(100 * MiB);
  const book = metadata(original.length, 'Synthetic 100MiB cloud original');
  try {
    await upload(request, actor, original, book);
    const response = await request.get(`${api}/api/library/books/${book.id}/file`, { headers: headers(actor), timeout: 120000 });
    expect(response.ok()).toBeTruthy(); const bytes = await response.body();
    expect(bytes.length).toBe(100 * MiB);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
  } finally { await remove(request, actor, book.id); }
});

async function device(browser: Browser, actor: { token: string; user: { id: string } }) {
  const context = await browser.newContext({ ...devices['iPad Pro 11'], userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.3.0' });
  await context.addCookies([{ name: '__Host-flownote_session', value: actor.token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await context.addInitScript(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), actor.user);
  return context;
}
test.describe('iPad WebKit cloud reader', () => {
  test('OFF library edits stay on device, then metadata and vocabulary reconcile and appear on another device', async ({ browser, request }) => {
    test.setTimeout(240000);
    const actor = await account(request), original = textbookPdf(4096), book = metadata(original.length, 'Offline transition book');
    const saved = await upload(request, actor, original, book);
    const seeded = await request.post(`${api}/api/library/books/${book.id}/terms`, { headers: headers(actor), data: {
      id: randomUUID(), page: 1, term: 'integral', definition: 'Cloud baseline definition',
    } });
    expect(seeded.ok()).toBeTruthy();
    const first = await device(browser, actor), second = await device(browser, actor);
    try {
      const a = await first.newPage(), b = await second.newPage();
      await a.goto(`${web}/library`);
      await expect(a.getByRole('button', { name: `${book.title} 표지 보기` })).toBeVisible();
      await a.goto(`${web}/settings`);
      a.once('dialog', dialog => dialog.accept());
      await a.getByRole('switch', { name: '앱 동기화', exact: true }).click();
      await expect(a.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'false');

      const outgoing: string[] = [];
      a.on('request', request => { if (request.url().includes('/api/library/')) outgoing.push(`${request.method()} ${request.url()}`); });
      await a.goto(`${web}/library`);
      await a.getByRole('button', { name: `${book.title} 표지 보기` }).click();
      await a.getByRole('button', { name: '책 읽기', exact: true }).click();
      await a.getByRole('button', { name: '읽기 메뉴', exact: true }).click();
      await a.getByRole('menuitem', { name: '책 제목·분야 수정' }).click();
      const details = a.getByRole('dialog', { name: '책 세부 정보 수정' });
      await details.getByLabel('책 제목').fill('Offline reconciled book');
      await details.getByLabel('분야 / 칸막이').fill('오프라인수학');
      await details.getByRole('button', { name: '제목·분야 저장' }).click();
      await a.getByRole('button', { name: '읽기 메뉴', exact: true }).click();
      await a.getByRole('menuitem', { name: '사전·단어장' }).click();
      const dictionary = a.getByRole('dialog', { name: '사전과 단어장' });
      await expect(dictionary.getByRole('region', { name: '저장한 단어장' })).toContainText('integral');
      await dictionary.getByRole('button', { name: '뜻·메모 편집' }).click();
      await dictionary.getByLabel('integral 뜻과 메모').fill('Offline expanded definition');
      await dictionary.getByRole('button', { name: '뜻·메모 저장' }).click();
      await expect(dictionary.getByRole('region', { name: '저장한 단어장' })).toContainText('Offline expanded definition');
      expect(outgoing).toEqual([]);
      const unchanged = await (await request.get(`${api}/api/library/books/${book.id}`, { headers: headers(actor) })).json();
      expect(unchanged.title).toBe(saved.title);
      const unchangedTerms = await (await request.get(`${api}/api/library/books/${book.id}/terms`, { headers: headers(actor) })).json();
      expect(unchangedTerms.terms[0].definition).toBe('Cloud baseline definition');

      await a.goto(`${web}/settings`);
      a.once('dialog', dialog => dialog.accept());
      await a.getByRole('switch', { name: '앱 동기화', exact: true }).click();
      await expect(a.getByRole('switch', { name: '앱 동기화', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect.poll(async () => (await (await request.get(`${api}/api/library/books/${book.id}`, { headers: headers(actor) })).json()).title).toBe('Offline reconciled book');
      await expect.poll(async () => {
        const value = await (await request.get(`${api}/api/library/books/${book.id}/terms`, { headers: headers(actor) })).json();
        return value.terms.find((term: { term: string }) => term.term === 'integral')?.definition;
      }).toBe('Offline expanded definition');

      await b.goto(`${web}/library`);
      await expect(b.getByRole('button', { name: 'Offline reconciled book 표지 보기' })).toBeVisible();
      await b.getByRole('button', { name: 'Offline reconciled book 표지 보기' }).click();
      await expect(b.getByRole('dialog', { name: '책 펼쳐 보기' })).toContainText('오프라인수학');
      await b.getByRole('button', { name: '책 읽기', exact: true }).click();
      await b.getByRole('button', { name: '읽기 메뉴', exact: true }).click();
      await b.getByRole('menuitem', { name: '사전·단어장' }).click();
      await expect(b.getByRole('region', { name: '저장한 단어장' })).toContainText('Offline expanded definition');
    } finally { await first.close(); await second.close(); await remove(request, actor, book.id); }
  });

  test('a fresh device opens the same book, selects PDF text, stores a dictionary entry, edits details and receives deletion', async ({ browser, request }) => {
    test.setTimeout(180000);
    const actor = await account(request), original = textbookPdf(4096), book = metadata(original.length, 'Cross-device study book');
    await upload(request, actor, original, book);
    const first = await device(browser, actor), second = await device(browser, actor);
    try {
      const a = await first.newPage(), b = await second.newPage();
      await a.goto(`${web}/library`);
      await a.getByRole('button', { name: `${book.title} 표지 보기` }).click();
      await a.getByRole('button', { name: '책 읽기', exact: true }).click();
      await expect(a.getByTestId('library-pdf-page')).toHaveAttribute('data-page', '1');
      const text = a.getByTestId('library-pdf-text'); await expect(text).toContainText('Synthetic native textbook');
      await expect(a.getByRole('button', { name: '다음 페이지', exact:true })).toBeHidden();
      // Native browser mouse drag across actual PDF glyphs; no selection event or range is installed.
      const bounds = await text.evaluate(layer => {
        const node = Array.from(layer.querySelectorAll('span')).find(span => span.textContent?.includes('textbook'))?.firstChild;
        if (!node) throw new Error('Selectable PDF text missing');
        const start = node.textContent!.indexOf('textbook'); const range = document.createRange();
        range.setStart(node, start); range.setEnd(node, start + 'textbook'.length);
        const r = range.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await a.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2); await a.mouse.down();
      await a.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 12 }); await a.mouse.up();
      await expect.poll(() => a.evaluate(() => window.getSelection()?.toString().trim())).toBe('textbook');
      await a.getByRole('button', { name: /textbook.*단어 보관/ }).click();
      const dictionary = a.getByRole('dialog', { name: '사전과 단어장' });
      await expect(dictionary.getByRole('region', { name: '단어 보관 상태' })).toBeVisible({ timeout: 30000 });
      await expect(dictionary.getByRole('region', { name: '저장한 단어장' })).toContainText('textbook');
      await dictionary.getByRole('button', { name: '대화상자 닫기' }).click();
      await a.getByRole('button', { name: '읽기 메뉴', exact: true }).click();
      await a.getByRole('menuitem', { name: '책 제목·분야 수정' }).click();
      const details = a.getByRole('dialog', { name: '책 세부 정보 수정' });
      await details.getByLabel('책 제목').fill('Renamed cross-device book');
      await details.getByLabel('분야 / 칸막이').fill('응용수학');
      await details.getByRole('button', { name: '제목·분야 저장' }).click();
      await expect.poll(async () => (await (await request.get(`${api}/api/library/books/${book.id}`, { headers: headers(actor) })).json()).title).toBe('Renamed cross-device book');
      await b.goto(`${web}/library`);
      await b.getByRole('button', { name: 'Renamed cross-device book 표지 보기' }).click();
      await expect(b.getByRole('dialog', { name: '책 펼쳐 보기' })).toContainText('응용수학');
      await b.getByRole('button', { name: '책 읽기', exact: true }).click();
      await expect(b.getByTestId('library-pdf-page')).toHaveAttribute('data-page', '1');
      await b.getByRole('button', { name: '읽기 메뉴', exact: true }).click();
      await b.getByRole('menuitem', { name: '사전·단어장' }).click();
      await expect(b.getByRole('region', { name: '저장한 단어장' })).toContainText('textbook');
      await b.getByRole('button', { name: '대화상자 닫기' }).click();
      await showReaderTools(b);
      await b.getByRole('button', { name: '표지로', exact: true }).click();
      await b.getByRole('button', { name: '대화상자 닫기' }).click();
      await remove(request, actor, book.id);
      await b.reload(); await expect(b.getByRole('button', { name: 'Renamed cross-device book 표지 보기' })).toHaveCount(0);
    } finally { await first.close(); await second.close(); await remove(request, actor, book.id); }
  });
});

test('suspended dictionary is explicit, preserves words and manual sources, and keeps ownership/page validation', async ({ request }) => {
  const actor=await account(request),other=await account(request),original=textbookPdf(4096),book=metadata(original.length,'Suspended dictionary contract');
  await upload(request,actor,original,book);
  try {
    for(const term of ['bank','derivative','은행']) {
      const lookup=await request.post(`${api}/api/library/books/${book.id}/lookup`,{headers:headers(actor),data:{term,page:1}});expect(lookup.ok()).toBeTruthy();const value=await lookup.json();
      expect(value.result.status).toBe('temporarily_unavailable');expect(value.result.found).toBe(false);expect(value.result.senses).toEqual([]);expect(value.result.definition).toBe('');expect(value.saved.term).toBe(term);
    }
    const saved=await request.post(`${api}/api/library/books/${book.id}/terms`,{headers:headers(actor),data:{page:1,term:'derivative',definition:'기존 메모를 그대로 보존'}});expect(saved.ok()).toBeTruthy();const prior=await saved.json();
    const again=await request.post(`${api}/api/library/books/${book.id}/lookup`,{headers:headers(actor),data:{term:'derivative',page:1}});expect(again.ok()).toBeTruthy();const value=await again.json();expect(value.saved.definition).toBe(prior.definition);expect(value.saved.sourceUrl).toBe(prior.sourceUrl);
    expect((await request.post(`${api}/api/library/books/${book.id}/lookup`,{headers:headers(other),data:{term:'derivative',page:1}})).status()).toBe(404);
    expect((await request.post(`${api}/api/library/books/${book.id}/lookup`,{headers:headers(actor),data:{term:'derivative',page:0}})).status()).toBe(400);
    expect((await request.post(`${api}/api/library/books/${book.id}/lookup`,{headers:headers(actor),data:{term:'x'.repeat(121),page:1}})).status()).toBe(400);
    expect((await request.post(`${api}/api/library/books/${book.id}/terms`,{headers:headers(actor),data:{term:'derivative',page:1,definition:'unchanged',sourceProvider:'opendict'}})).status()).toBe(400);
    const all=await(await request.get(`${api}/api/library/books/${book.id}/terms`,{headers:headers(actor)})).json();expect(all.terms).toHaveLength(3);expect(all.terms.find((term:{term:string})=>term.term==='derivative').definition).toBe(prior.definition);
  } finally {await remove(request,actor,book.id);}
});
