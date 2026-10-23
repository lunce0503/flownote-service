import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string;
let user: Record<string, unknown>;
const title = 'Synthetic Calculus <script> — 미적분학';
const pdf = () => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>'];
  for (let i = 0; i < 3; i++) {
    const text = `BT /F1 24 Tf 70 700 Td (Synthetic textbook ${i + 1}) Tj ET\n0.4 0.3 0.2 rg 80 400 180 180 re f`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4 + i * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let data = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(data)); data += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const offset = Buffer.byteLength(data);
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return { name: 'synthetic-textbook.pdf', mimeType: 'application/pdf', buffer: Buffer.from(data) };
};
test.beforeAll(async ({ request }) => {
  const email = `library-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `lib-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic library' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); ({ token, user } = await login.json());
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    if (!sessionStorage.getItem('library-test-account-switch')) localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { user });
});
async function add(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '책 추가', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '책장에 책 꽂기' });
  await dialog.getByLabel('PDF 파일').setInputFiles(pdf());
  await dialog.getByLabel('책 제목').fill(title);
  await dialog.getByLabel('분야 / 칸막이').fill('수학');
  await dialog.getByRole('button', { name: '책장에 추가', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '책 펼쳐 보기' })).toBeVisible();
}
test('stores a textbook, opens its cover first, resumes pages and bookmarks, and organizes vertical spines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && /assets|library|upload/.test(request.url())) uploads.push(new URL(request.url()).pathname); });
  await page.goto(`${web}/library`);
  await expect(page.getByRole('heading', { name: '전공서 책장' })).toBeVisible();
  await add(page);
  const cover = page.getByRole('dialog', { name: '책 펼쳐 보기' });
  await expect(cover.getByRole('img')).toBeVisible();
  await expect(page.getByTestId('library-pdf-page')).toHaveCount(0);
  await cover.getByRole('button', { name: '즐겨찾기', exact: true }).click();
  await expect(cover.getByRole('button', { name: '즐겨찾기 해제' })).toHaveAttribute('aria-pressed', 'true');
  await cover.getByRole('button', { name: '책 읽기', exact: true }).click();
  const canvas = page.getByTestId('library-pdf-page');
  await expect(canvas).toHaveAttribute('data-page', '1');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-page', '2');
  await page.getByRole('button', { name: '현재 페이지 책갈피' }).click();
  await expect(page.getByRole('navigation', { name: '페이지 책갈피 목록' }).getByRole('button', { name: '2쪽' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('읽던 위치 저장됨');
  await page.reload();
  await page.getByRole('button', { name: `${title} 표지 보기` }).click();
  await page.getByRole('button', { name: '2쪽부터 이어 읽기' }).click();
  await expect(canvas).toHaveAttribute('data-page', '2');
  await page.getByRole('button', { name: '표지로' }).click();
  await page.getByRole('dialog').getByLabel('분야 / 칸막이').fill('응용수학');
  await page.getByRole('button', { name: '제목·분야 저장' }).click();
  await expect(page.getByRole('dialog').getByText('응용수학', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '대화상자 닫기' }).click();
  const spine = page.getByRole('button', { name: `${title} 표지 보기` });
  await expect(spine.locator('.library-spine-title')).toHaveCSS('writing-mode', 'vertical-rl');
  await expect(page.getByRole('region', { name: '응용수학 선반' })).toBeVisible();
  await spine.click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '원본 PDF 내보내기' }).click();
  expect((await downloaded).suggestedFilename()).toBe('synthetic-textbook.pdf');
  expect(uploads).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '책장에서 삭제', exact: true }).click();
  await expect(spine).toHaveCount(0);
});
test('phone reading contains zoom and column scrolling inside the PDF area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${web}/library`); await add(page);
  await page.getByRole('button', { name: '책 읽기', exact: true }).click();
  await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page', '1');
  await page.getByLabel('페이지 보기').selectOption('left');
  await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page', '1');
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await expect(page.getByRole('button', { name: '폭 맞춤 125%' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.getByLabel('PDF 페이지 확대 영역').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.getByLabel('페이지 보기').selectOption('right');
  await page.getByLabel('이동할 페이지').fill('3'); await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.getByTestId('library-pdf-page')).toHaveAttribute('data-page', '3');
  await expect(page.getByRole('button', { name: '다음 페이지', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: test.info().outputPath('library-phone.png'), fullPage: true });
});
test('invalid files and failed storage do not publish an empty book', async ({ page }) => {
  await page.goto(`${web}/library`);
  await page.getByRole('button', { name: '책 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('PDF 파일').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await dialog.getByRole('button', { name: '책장에 추가', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('올바른 PDF');
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === 'files') throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });
  await dialog.getByLabel('PDF 파일').setInputFiles(pdf());
  await dialog.getByRole('button', { name: '책장에 추가', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: '대화상자 닫기' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '당신의 첫 전공서를 꽂아 보세요' })).toBeVisible();
});
test('another signed-in account cannot see or replace the existing device library', async ({ page, request }) => {
  await page.goto(`${web}/library`); await add(page);
  await page.getByRole('button', { name: '대화상자 닫기' }).click();
  const email = `library-other-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `other-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic other reader' } })).ok()).toBeTruthy();
  const response = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy(); const other = await response.json();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: other.token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.evaluate(user => {
    sessionStorage.setItem('library-test-account-switch', '1'); localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, other.user);
  await page.reload();
  await expect(page.getByRole('heading', { name: '당신의 첫 전공서를 꽂아 보세요' })).toBeVisible();
  await expect(page.getByRole('button', { name: `${title} 표지 보기` })).toHaveCount(0);
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.evaluate(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), user);
  await page.reload();
  await expect(page.getByRole('button', { name: `${title} 표지 보기` })).toBeVisible();
});
