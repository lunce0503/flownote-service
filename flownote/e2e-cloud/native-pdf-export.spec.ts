import { expect, test } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createPdfExportReceiver } from '../../flownote-mobile/lib/pdf-export-protocol';
import { textbookPdf } from '../../flownote-desktop/scripts/library-fixture.mjs';

test.use({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.3.0' });
test('iOS web PDF sender and native receiver preserve a 100MiB book with backpressure', async ({ page, request }) => {
  test.setTimeout(240000);
  const api = 'https://flownote-api-staging.up.railway.app', web = 'https://flownote-react-staging.vercel.app';
  const email = `pdf-bridge-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `pdf-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic bridge' } })).ok()).toBeTruthy();
  const response = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy(); const account = await response.json();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: account.token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(user => { localStorage.setItem('flownote_auth_user', JSON.stringify(user)); localStorage.setItem(`flownote.device-mode:${user.id}`, 'device'); }, account.user);
  const original = textbookPdf(100 * 1024 * 1024), hash = createHash('sha256');
  const inputPath = test.info().outputPath('ios-100mib.pdf'); await writeFile(inputPath, original);
  let bytes = 0, closed = false, shared = false, removed = false, chunks = 0;
  const receiver = createPdfExportReceiver({
    confirm: async () => true,
    open: () => ({ uri: 'synthetic-private-cache.pdf', append: chunk => { hash.update(chunk); bytes += chunk.length; chunks++; }, close: () => { closed = true; }, remove: () => { removed = true; } }),
    share: async () => { expect(closed).toBe(true); shared = true; },
    notify: status => { void page.evaluate(detail => window.dispatchEvent(new CustomEvent('flownote:pdf-export-status', { detail })), status); },
  });
  await page.exposeBinding('nativePdfMessage', async (_source, raw: string) => receiver.receive(raw, page.url(), web));
  await page.addInitScript(() => {
    Object.assign(window, { __flownotePdfExportV1: true, ReactNativeWebView: { postMessage: (raw: string) => { void (window as unknown as { nativePdfMessage(raw: string): Promise<void> }).nativePdfMessage(raw); } } });
  });
  try {
    await page.goto(`${web}/library`);
    await page.getByRole('button', { name: '책 추가', exact: true }).click();
    await page.getByLabel('PDF 파일').setInputFiles(inputPath);
    await page.getByLabel('책 제목', { exact: true }).fill('Native bridge textbook');
    await page.getByRole('button', { name: '책장에 추가', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '책 펼쳐 보기' })).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: '원본 PDF 내보내기' }).click();
    await expect.poll(() => shared && removed, { timeout: 120000 }).toBe(true);
    expect(bytes).toBe(original.length); expect(chunks).toBe(400);
    expect(hash.digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
  } finally { receiver.cancel(); }
});
