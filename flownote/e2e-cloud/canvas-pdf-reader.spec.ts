import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Always exercise synthetic staging data, regardless of a caller's baseURL.
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string;
let user: Record<string, unknown>;
let canvasId: string;
const headers = () => ({ Authorization: `Bearer ${token}` });

const createBookPdf = (count = 3) => {
  const fontId = 3 + count * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${count} >>`,
  ];
  for (let index = 0; index < count; index += 1) {
    const pageId = 3 + index * 2;
    const content = `${index / count} 0.4 0.8 rg 40 40 300 500 re f\nBT /F1 24 Tf 72 720 Td (Synthetic page ${index + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
};

test.beforeAll(async ({ request }) => {
  const email = `pdf-reader-${randomUUID()}@example.com`;
  const password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `pdf-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic PDF reader check',
  } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  ({ token, user } = await login.json());
  const created = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: 'Synthetic PDF reading' } });
  expect(created.ok()).toBeTruthy();
  canvasId = (await created.json()).id;
  expect((await request.post(`${api}/api/canvas/save`, { headers: headers(), data: {
    canvasId, mutationId: randomUUID(), payload: {
      addedLines: [{ id: randomUUID(), points: [{ x: 20, y: 200 }, { x: 40, y: 220 }], color: '#000000', strokeWidth: 2 }],
      addedTextBoxes: [{ id: randomUUID(), text: 'Synthetic existing note', x: 80, y: 240, width: 200, height: 80 }],
    },
  } })).ok()).toBeTruthy();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { token, user });
});

test.afterAll(async ({ request }) => {
  if (canvasId) expect((await request.delete(`${api}/api/canvas/documents/${canvasId}`, { headers: headers() })).ok()).toBeTruthy();
});

test('turns PDF pages beside an editable canvas, preserves notes, and releases the reader on close', async ({ page, request }) => {
  const readCanvas = async () => {
    const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const before = await readCanvas();
  const uploads: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/assets')) uploads.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${web}/canvas/${canvasId}`);
  const surface = page.getByTestId('canvas-input-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'PDF 책 읽기', exact: true }).click();
  const reader = page.getByRole('complementary', { name: 'PDF 책 읽기' });
  const fileInput = reader.getByLabel('읽을 PDF 선택');
  await expect(fileInput).toBeFocused();
  await expect(reader.getByRole('status')).toContainText('PDF를 선택');
  await fileInput.setInputFiles({ name: 'synthetic-book.pdf', mimeType: 'application/pdf', buffer: createBookPdf() });
  const pageImage = reader.getByTestId('canvas-pdf-page');
  await expect(pageImage).toHaveAttribute('data-page-number', '1');
  await expect(reader.getByRole('button', { name: 'PDF 이전 페이지' })).toHaveAttribute('aria-disabled', 'true');
  const firstPage = await pageImage.screenshot();
  const next = reader.getByRole('button', { name: 'PDF 다음 페이지' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(pageImage).toHaveAttribute('data-page-number', '2');
  expect((await pageImage.screenshot()).equals(firstPage)).toBe(false);
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pageImage).toHaveAttribute('data-page-number', '3');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toBeFocused();
  // Focus must survive consecutive turns and a boundary, without manual refocus.
  await page.keyboard.press('t');
  await page.keyboard.press('Control+z');
  await expect(next).toBeFocused();
  await reader.getByRole('button', { name: 'PDF 이전 페이지' }).click();
  await expect(pageImage).toHaveAttribute('data-page-number', '2');
  // Reader keystrokes must not switch the canvas from pen to text mode.
  await page.keyboard.press('t');
  const afterReading = await readCanvas();
  expect(afterReading.lines).toEqual(before.lines);
  expect(afterReading.images).toEqual(before.images);
  expect(afterReading.textBoxes).toEqual(before.textBoxes);
  expect(uploads).toEqual([]);
  const [canvasBox, readerBox] = await Promise.all([surface.boundingBox(), reader.boundingBox()]);
  expect(canvasBox).not.toBeNull();
  expect(readerBox).not.toBeNull();
  expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(readerBox!.x + 1);
  await page.mouse.move(canvasBox!.x + 180, canvasBox!.y + 180);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 250, canvasBox!.y + 220, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await readCanvas()).lines.length, { timeout: 30000 }).toBe(before.lines.length + 1);
  await reader.getByRole('button', { name: 'PDF 책 읽기 닫기' }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PDF 책 읽기', exact: true })).toBeFocused();
  await page.reload();
  await expect(surface).toHaveAttribute('data-ready', 'true');
  await expect(reader).toHaveCount(0);
  const after = await readCanvas();
  expect(after.textBoxes).toEqual(before.textBoxes);
  expect(after.images).toEqual(before.images);
  expect(after.lines).toEqual(expect.arrayContaining(before.lines));
  expect(after.lines).toHaveLength(before.lines.length + 1);
});

test('mobile reader keeps the canvas visible and recovers from invalid and replaced PDFs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${web}/canvas/${canvasId}`);
  const surface = page.getByTestId('canvas-input-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '파일 동작', exact: true }).click();
  await page.getByRole('menuitem', { name: 'PDF 책 읽기', exact: true }).click();
  const reader = page.getByRole('complementary', { name: 'PDF 책 읽기' });
  const input = reader.getByLabel('읽을 PDF 선택');
  await input.setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(reader.getByRole('alert')).toContainText('PDF를 열지 못했습니다');
  await input.setInputFiles({ name: 'synthetic-book.pdf', mimeType: 'application/pdf', buffer: createBookPdf() });
  const image = reader.getByTestId('canvas-pdf-page');
  await expect(image).toHaveAttribute('data-page-number', '1');
  await reader.getByRole('button', { name: 'PDF 다음 페이지' }).click();
  await expect(image).toHaveAttribute('data-page-number', '2');
  await input.setInputFiles({ name: 'synthetic-single.pdf', mimeType: 'application/pdf', buffer: createBookPdf(1) });
  await expect(image).toHaveAttribute('data-page-number', '1');
  await expect(reader.getByRole('status')).toHaveText('1 / 1 페이지');
  await expect(reader.getByRole('button', { name: 'PDF 이전 페이지' })).toHaveAttribute('aria-disabled', 'true');
  await expect(reader.getByRole('button', { name: 'PDF 다음 페이지' })).toHaveAttribute('aria-disabled', 'true');
  await expect(reader.getByRole('alert')).toHaveCount(0);
  const [canvasBox, readerBox] = await Promise.all([surface.boundingBox(), reader.boundingBox()]);
  expect(canvasBox).not.toBeNull();
  expect(readerBox).not.toBeNull();
  expect(readerBox!.y + readerBox!.height).toBeLessThanOrEqual(canvasBox!.y + 1);
  expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 600 });
  await expect.poll(async () => {
    const [canvas, panel] = await Promise.all([surface.boundingBox(), reader.boundingBox()]);
    return Boolean(canvas && panel && panel.y + panel.height <= canvas.y + 1 && canvas.y + canvas.height <= 600);
  }).toBe(true);
  // A short landscape viewport must show actual PDF pixels, not just a panel box.
  await page.setViewportSize({ width: 844, height: 390 });
  const scroller = reader.getByTestId('canvas-pdf-scroll');
  await expect.poll(async () => (await scroller.boundingBox())?.height ?? 0).toBeGreaterThan(80);
  const navigation = await reader.getByRole('navigation', { name: 'PDF 페이지 이동' }).boundingBox();
  expect(navigation!.y + navigation!.height).toBeLessThanOrEqual(390);
  const [landscapeCanvas, landscapeReader] = await Promise.all([surface.boundingBox(), reader.boundingBox()]);
  expect(landscapeCanvas!.height).toBeGreaterThan(200);
  expect(landscapeCanvas!.x + landscapeCanvas!.width).toBeLessThanOrEqual(landscapeReader!.x + 1);
  await expect(image).toBeInViewport();
  const scrollBox = (await scroller.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const finger = { x: scrollBox.x + scrollBox.width / 2, y: scrollBox.y + scrollBox.height - 10, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  for (let distance = 10; distance <= 70; distance += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, y: finger.y - distance }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await reader.getByRole('button', { name: 'PDF 책 읽기 닫기' }).click();
  await expect(page.getByRole('button', { name: '파일 동작', exact: true })).toBeFocused();
});
