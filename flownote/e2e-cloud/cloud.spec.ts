import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string;
let user: Record<string, unknown>;
let canvasId: string;
const email = `cloud-${randomUUID()}@example.com`;
const password = randomUUID();
const headers = () => ({ Authorization: `Bearer ${token}` });

const createMinimalPdf = () => {
  const content = 'BT /F1 24 Tf 72 720 Td (Flownote PDF import) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
};

test.beforeAll(async ({ request }) => {
  const account = await request.post(`${api}/api/users`, { data: {
    email, password, username: `cloud-${randomUUID().slice(0, 8)}`, nickname: 'Cloud verification',
  } });
  expect(account.ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  ({ token, user } = await login.json());
  const canvas = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: 'Cloud verification' } });
  expect(canvas.ok()).toBeTruthy();
  canvasId = (await canvas.json()).id;
});

test.afterAll(async ({ request }) => {
  if (canvasId) {
    const response = await request.delete(`${api}/api/canvas/documents/${canvasId}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
  }
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { token, user });
});

test('cloud authentication, CORS, mobile configuration and retired local AI', async ({ request }) => {
  const me = await request.get(`${api}/api/users/me`, { headers: { ...headers(), Origin: web } });
  expect(me.status()).toBe(200);
  expect(me.headers()['access-control-allow-origin']).toBe(web);
  const config = await (await request.get(`${api}/api/mobile/config`)).json();
  expect(config.core_api_url ?? config.coreApiUrl).toBe(api);
  expect(config.ai_api_url ?? config.aiApiUrl).toBe(api);
  expect(config.web_url ?? config.webUrl).toBe(web);
  const capabilities = await (await request.get(`${api}/api/capabilities`)).json();
  expect(capabilities.capabilities.agent_note.enabled).toBe(false);
  expect((await request.post(`${api}/api/agent-note/query`, { data: {} })).status()).toBe(410);
});

test('canvas drawing persists through a reload using cloud services only', async ({ page, request }) => {
  const localRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^(localhost|127\.|192\.|10\.)/.test(url.hostname) || url.hostname.endsWith('.local')) localRequests.push(url.origin);
  });
  await page.goto(`/canvas/${canvasId}`);
  const surface = page.getByTestId('canvas-input-surface');
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.getByTestId('canvas-viewport-status').evaluate((element) => getComputedStyle(element).position), {
    message: 'The deployed canvas stylesheet must be active before pointer input is tested',
  }).toBe('fixed');
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '0');
  await page.waitForTimeout(1000);
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 400, box!.y + 250);
  await page.mouse.down();
  await page.mouse.move(box!.x + 520, box!.y + 320, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
  await expect.poll(async () => {
    const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).lines.length;
  }, { timeout: 30000 }).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
  expect(localRequests).toEqual([]);
});

test('canvas controls expose pen colors on demand and keep status overlays compact', async ({ page }) => {
  await page.goto(`/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '펜 색상 선택' })).toHaveCount(0);

  const penButton = page.locator('[data-pen-trigger="true"]:visible');
  await expect(penButton).toHaveAttribute('aria-expanded', 'false');
  await penButton.click();
  const palette = page.getByRole('dialog', { name: '펜 색상 선택' });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '펜 색상 파랑' }).click();
  await expect(palette).toHaveCount(0);

  const saveStatus = page.locator('[data-testid="canvas-save-status"]:visible');
  await expect(saveStatus).toBeVisible();
  await expect(saveStatus.locator(':scope > span:not(.sr-only)')).toHaveCount(0);

  const viewportStatus = page.getByTestId('canvas-viewport-status');
  await expect(viewportStatus).toBeVisible();
  const placement = await viewportStatus.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { position: getComputedStyle(element).position, left: rect.left, bottom: innerHeight - rect.bottom };
  });
  expect(placement.position).toBe('fixed');
  expect(placement.left).toBeLessThanOrEqual(16);
  expect(placement.bottom).toBeLessThanOrEqual(16);
});

test('canvas title editing and feedback controls persist in cloud staging', async ({ page, request }) => {
  const nextTitle = `Edited canvas ${randomUUID().slice(0, 8)}`;
  await page.goto(`/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');

  const titleButton = page.getByRole('button', { name: /캔버스 제목 편집:/ }).filter({ visible: true });
  await titleButton.click();
  await page.getByRole('textbox', { name: '캔버스 제목' }).fill(nextTitle);
  await page.getByRole('button', { name: '제목 저장' }).click();
  await expect(page.getByRole('button', { name: `캔버스 제목 편집: ${nextTitle}` })).toBeVisible();

  await expect.poll(async () => {
    const response = await request.get(`${api}/api/canvas/documents`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
    const documents = await response.json() as Array<{ id: string; title: string }>;
    return documents.find(document => document.id === canvasId)?.title;
  }).toBe(nextTitle);

  const libraryButton = page.getByTestId('canvas-library-button').filter({ visible: true });
  const undoButton = page.getByTestId('canvas-undo-button').filter({ visible: true });
  const [libraryStyle, undoStyle] = await Promise.all([
    libraryButton.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius })),
    undoButton.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius })),
  ]);
  expect(libraryStyle.background).not.toBe(undoStyle.background);
  expect(libraryStyle.radius).toBe(undoStyle.radius);

  const assetInput = page.locator('label[aria-label="이미지 또는 PDF 추가"]:visible input[type="file"]');
  await expect(assetInput).toHaveAttribute('accept', 'image/*,application/pdf');
  await expect(assetInput).toHaveAttribute('multiple', '');
});

test('new canvases appear immediately while the cloud request is pending', async ({ page, request }) => {
  let createdCanvasId: string | null = null;
  await page.route('**/api/canvas/documents', async route => {
    if (route.request().method() === 'POST') await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });

  try {
    await page.goto('/canvas');
    await expect(page.getByRole('heading', { name: '작업 공간', exact: true })).toBeVisible();
    const createResponse = page.waitForResponse(response => (
      response.request().method() === 'POST' && response.url().endsWith('/api/canvas/documents')
    ));
    await page.getByRole('button', { name: '새 캔버스', exact: true }).click();
    await expect(page.locator('[role="row"][data-pending="true"]').first()).toContainText('서버에 만드는 중');
    const response = await createResponse;
    createdCanvasId = ((await response.json()) as { id: string }).id;
    await expect(page).toHaveURL(new RegExp(`/canvas/${createdCanvasId}$`));
  } finally {
    if (createdCanvasId) {
      const response = await request.delete(`${api}/api/canvas/documents/${createdCanvasId}`, { headers: headers() });
      expect(response.ok()).toBeTruthy();
    }
  }
});

test('PDF pages import as editable canvas images', async ({ page, request }) => {
  const response = await request.post(`${api}/api/canvas/documents`, {
    headers: headers(),
    data: { title: `PDF import ${randomUUID().slice(0, 8)}` },
  });
  expect(response.ok()).toBeTruthy();
  const pdfCanvasId = ((await response.json()) as { id: string }).id;

  try {
    await page.goto(`/canvas/${pdfCanvasId}`);
    await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
    const assetInput = page.locator('label[aria-label="이미지 또는 PDF 추가"]:visible input[type="file"]');
    await assetInput.setInputFiles({ name: 'feedback.pdf', mimeType: 'application/pdf', buffer: createMinimalPdf() });
    await expect(page.getByRole('status').filter({ hasText: '1개를 가져왔습니다' })).toBeVisible();
    await expect.poll(async () => {
      const loadResponse = await request.get(`${api}/api/canvas/load?canvasId=${pdfCanvasId}`, { headers: headers() });
      expect(loadResponse.ok()).toBeTruthy();
      return ((await loadResponse.json()).images as unknown[]).length;
    }, { timeout: 30000 }).toBe(1);
  } finally {
    const deleteResponse = await request.delete(`${api}/api/canvas/documents/${pdfCanvasId}`, { headers: headers() });
    expect(deleteResponse.ok()).toBeTruthy();
  }
});

test('copied elements can be pasted after moving to another canvas', async ({ page, request }) => {
  const targetTitle = `Paste target ${randomUUID().slice(0, 8)}`;
  const targetResponse = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: targetTitle } });
  expect(targetResponse.ok()).toBeTruthy();
  const targetCanvasId = ((await targetResponse.json()) as { id: string }).id;

  try {
    await page.goto(`/canvas/${canvasId}`);
    const surface = page.getByTestId('canvas-input-surface');
    await expect(surface).toHaveAttribute('data-ready', 'true');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();

    // Keep this copy contract independent from drawing performed by another test.
    await page.getByRole('button', { name: '펜', exact: true }).filter({ visible: true }).click();
    await page.mouse.move(box!.x + 400, box!.y + 250);
    await page.mouse.down();
    await page.mouse.move(box!.x + 520, box!.y + 320, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('canvas-render-surface')).not.toHaveAttribute('data-visible-line-count', '0');
    await page.getByRole('button', { name: '올가미', exact: true }).filter({ visible: true }).click();
    const points = [
      [box!.x + 340, box!.y + 190],
      [box!.x + 620, box!.y + 190],
      [box!.x + 620, box!.y + 410],
      [box!.x + 340, box!.y + 410],
      [box!.x + 340, box!.y + 190],
    ];
    await page.mouse.move(points[0][0], points[0][1]);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByLabel('선택 영역')).toContainText(/선택 [1-9]/);
    await page.getByTitle('선택 영역 복사하기').click();

    await page.getByTestId('canvas-library-button').filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/canvas$/);
    await page.getByTestId('canvas-recent-section').getByRole('button', { name: targetTitle, exact: true }).click();
    await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: '올가미', exact: true }).filter({ visible: true }).click();
    await page.getByTitle('복사한 선택 영역 붙여넣기').click();
    await expect(page.getByTestId('canvas-render-surface')).not.toHaveAttribute('data-visible-line-count', '0');
    await expect.poll(async () => {
      const response = await request.get(`${api}/api/canvas/load?canvasId=${targetCanvasId}`, { headers: headers() });
      expect(response.ok()).toBeTruthy();
      return ((await response.json()).lines as unknown[]).length;
    }, { timeout: 30000 }).toBeGreaterThan(0);
  } finally {
    const response = await request.delete(`${api}/api/canvas/documents/${targetCanvasId}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
  }
});

test('canvas mobile toolbar shows the active tool until expanded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');

  const currentTool = page.getByTestId('canvas-current-tool');
  const toggle = page.getByTestId('canvas-tool-menu-toggle');
  await expect(currentTool).toHaveAttribute('aria-label', '현재 도구: 펜');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: '도구 선택' })).toHaveCount(0);

  await toggle.click();
  const toolMenu = page.getByRole('group', { name: '도구 선택' });
  await expect(toolMenu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toolMenu.getByRole('button', { name: '지우개' }).click();

  await expect(toolMenu).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(currentTool).toHaveAttribute('aria-label', '현재 도구: 지우개');
});

test('canvas zooms out to 10 percent and restores the saved viewport', async ({ page }) => {
  await page.goto(`/canvas/${canvasId}`);
  const surface = page.getByTestId('canvas-input-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true');
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  for (let step = 0; step < 28; step++) await page.mouse.wheel(0, 400);

  const viewport = page.getByTestId('canvas-viewport-status');
  await expect(viewport).toContainText('10%');
  await page.reload();
  await expect(viewport).toContainText('10%');

  await page.evaluate((id) => {
    const key = `flownote.canvas.viewport.${id}`;
    const saved = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...saved, scale: 0.05 }));
  }, canvasId);
  await page.reload();
  await expect(viewport).toContainText('10%');
});

test('pencil-only one-finger pan locks to the initial axis', async ({ page }) => {
  await page.goto(`/canvas/${canvasId}`);
  const surface = page.getByTestId('canvas-input-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true');
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  // Settle the requested inertia deterministically between the two axis gestures.
  // Both movement and orthogonal-axis invariants remain asserted below.
  await page.clock.install();

  const viewport = page.getByTestId('canvas-viewport-status');
  const readCenter = async () => {
    const label = await viewport.getAttribute('aria-label');
    const match = label?.match(/화면 중앙 좌표 (-?\d+), (-?\d+)/);
    expect(match).not.toBeNull();
    return { x: Number(match![1]), y: Number(match![2]) };
  };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = { x: bounds!.x + 240, y: bounds!.y + 260 };
  const initial = await readCenter();

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await page.clock.runFor(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 80, y: start.y + 20, id: 1 }] });
  await page.clock.runFor(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 120, y: start.y + 100, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(400);
  await expect.poll(async () => (await readCenter()).x).not.toBe(initial.x);
  const afterHorizontal = await readCenter();
  expect(afterHorizontal.y).toBe(initial.y);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2 }] });
  await page.clock.runFor(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 20, y: start.y + 80, id: 2 }] });
  await page.clock.runFor(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 100, y: start.y + 120, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(400);
  await expect.poll(async () => (await readCenter()).y).not.toBe(afterHorizontal.y);
  const afterVertical = await readCenter();
  expect(afterVertical.x).toBe(afterHorizontal.x);
});

test('large HTTP save preserves mutation deduplication and data', async ({ request }) => {
  const data = { canvasId, mutationId: randomUUID(), payload: { addedTextBoxes: [{
    id: randomUUID(), x: 20, y: 20, text: 'cloud'.repeat(220000), width: 200, height: 100,
  }] } };
  const first = await request.post(`${api}/api/canvas/save`, { headers: headers(), data });
  expect(first.ok()).toBeTruthy();
  expect((await first.json()).ok).toBe(true);
  const duplicate = await request.post(`${api}/api/canvas/save`, { headers: headers(), data });
  expect(duplicate.ok()).toBeTruthy();
  expect((await duplicate.json()).data.duplicate).toBe(true);
  const loaded = await (await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() })).json();
  expect((loaded.textBoxes ?? loaded.text_boxes).find((box: { id: string }) => box.id === data.payload.addedTextBoxes[0].id)?.text.length).toBe(1100000);
});

test('planner timetable emphasizes ten-minute boundaries', async ({ page }) => {
  await page.goto('/planner');
  const timetable = page.getByTestId('planner-timetable-canvas');
  await expect(timetable).toBeVisible();

  const colors = await timetable.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Planner timetable context is unavailable');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const gridWidth = rect.width - 44;
    const sampleBoundary = (column: number) => {
      const cssX = Math.round(44 + column * (gridWidth / 12));
      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((cssX + 0.5) * scaleX)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(13 * scaleY)));
      return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
    };
    return { fiveMinutes: sampleBoundary(1), tenMinutes: sampleBoundary(2) };
  });

  const brightness = (rgb: number[]) => rgb.reduce((sum, channel) => sum + channel, 0);
  expect(brightness(colors.tenMinutes)).toBeLessThan(brightness(colors.fiveMinutes) - 100);
});

test('cloud planner and libraries fit desktop and mobile viewports', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/planner', '/canvas', '/blog']) {
      await page.goto(route);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  }
});

test('authenticated sync events travel between cloud connections', async () => {
  const sockets = [0, 1].map(() => io(`${api}/sync`, {
    transports: ['websocket'], auth: { authorization: `Bearer ${token}` }, reconnection: false,
  }));
  try {
    for (const socket of sockets) {
      if (!socket.connected) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Cloud sync timeout')), 20000);
        socket.once('connect', () => { clearTimeout(timer); resolve(); });
        socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
      });
    }
    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cloud event timeout')), 10000);
      sockets[1].once('flownote-sync', event => { clearTimeout(timer); resolve(event); });
    });
    const reply = await sockets[0].timeout(10000).emitWithAck('publish', { resource: 'canvas', action: 'changed', noteId: canvasId });
    expect(reply.ok).toBe(true);
    expect((await received).noteId).toBe(canvasId);
  } finally { sockets.forEach(socket => socket.disconnect()); }
});

test('planner saves several weekday/time periods in cloud staging', async ({ page, request }) => {
  const title = `Cloud periods ${randomUUID().slice(0, 8)}`;
  await page.goto('/planner');
  await page.getByRole('button', { name: '주간', exact: true }).click();
  await page.getByRole('button', { name: '일정 추가' }).click();
  await page.getByPlaceholder('일정 이름').fill(title);
  const first = page.getByRole('group', { name: '기간 1' });
  await first.getByLabel('시작').fill('09:30');
  await first.getByLabel('종료').fill('11:00');
  await page.getByRole('button', { name: '기간 추가' }).click();
  const second = page.getByRole('group', { name: '기간 2' });
  await second.getByRole('button', { name: '수', exact: true }).click();
  await second.getByLabel('시작').fill('14:00');
  await second.getByLabel('종료').fill('16:30');
  await page.getByRole('button', { name: '기간 2개 저장' }).click();
  await expect(page.getByRole('list', { name: '주간 일정 목록' }).getByRole('listitem')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '주간', exact: true }).click();
  await expect(page.getByRole('list', { name: '주간 일정 목록' }).getByRole('listitem')).toHaveCount(2);
  const response = await request.get(`${api}/api/schedule-items`, { headers: headers() });
  expect(response.ok()).toBeTruthy();
});
