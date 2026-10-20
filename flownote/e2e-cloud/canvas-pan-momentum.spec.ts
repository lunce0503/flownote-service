import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Fixed staging endpoints: the test creates only its own synthetic account/documents.
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
let token: string;
let user: Record<string, unknown>;
let canvasId: string;
const headers = () => ({ Authorization: `Bearer ${token}` });

const viewport = (page: Page) => page.getByTestId('canvas-input-surface').evaluate(surface => {
  const grid = surface.parentElement?.querySelector('svg > g') as SVGGElement | null;
  const matrix = grid?.transform.baseVal.consolidate()?.matrix;
  if (!matrix) throw new Error('Canvas viewport transform is missing');
  return { x: matrix.e, y: matrix.f, scale: matrix.a };
});

test.beforeAll(async ({ request }) => {
  const email = `pan-${randomUUID()}@example.com`;
  const password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `pan-${randomUUID().slice(0, 8)}`, nickname: 'Pan verification',
  } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  ({ token, user } = await login.json());
});

test.beforeEach(async ({ page, request }) => {
  const canvas = await request.post(`${api}/api/canvas/documents`, {
    headers: headers(), data: { title: 'Synthetic pan verification' },
  });
  expect(canvas.ok()).toBeTruthy();
  canvasId = (await canvas.json()).id;
  expect((await request.post(`${api}/api/canvas/save`, { headers: headers(), data: {
    canvasId, mutationId: randomUUID(), payload: {
      addedLines: [{ id: randomUUID(), points: [{ x: 40, y: 40 }, { x: 60, y: 50 }], color: '#000000', strokeWidth: 2 }],
      addedTextBoxes: [{ id: randomUUID(), text: 'Synthetic preserved content', x: 50, y: 80, width: 200, height: 60 }],
    },
  } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
    localStorage.setItem('flownote.canvas.pencilOnlyMode', 'true');
  }, { token, user });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${web}/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
  // Control only browser time after the real staging document has loaded.
  await page.clock.install();
});

test.afterEach(async ({ request }) => {
  if (canvasId) {
    expect((await request.delete(`${api}/api/canvas/documents/${canvasId}`, { headers: headers() })).ok()).toBeTruthy();
    canvasId = '';
  }
});

const mousePan = async (page: Page, step: number, interval = 20) => {
  const box = await page.getByTestId('canvas-input-surface').boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + 250, y: box!.y + 250 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 2; i++) {
    await page.clock.runFor(interval);
    await page.mouse.move(start.x + step * i, start.y - step * i / 2);
  }
  return viewport(page);
};

test('fast mouse pan coasts, settles, restores its viewport and preserves saved elements', async ({ page, request }) => {
  const load = async () => {
    const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return { lines: data.lines, textBoxes: data.textBoxes ?? data.text_boxes };
  };
  const original = await load();
  expect(original.lines).toHaveLength(1);
  expect(original.textBoxes).toHaveLength(1);
  const released = await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(64);
  const coasting = await viewport(page);
  expect(coasting.x).toBeGreaterThan(released.x + 2);
  expect(coasting.y).toBeLessThan(released.y - 2);
  expect(coasting.scale).toBe(released.scale);
  await page.clock.runFor(400);
  const settled = await viewport(page);
  expect(Math.hypot(settled.x - released.x, settled.y - released.y)).toBeLessThanOrEqual(400.001);
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(settled);
  expect(await load()).toEqual(original);
  await page.reload();
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
  expect(await viewport(page)).toEqual(settled);
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
});

test('slow and paused pans stop on release; reduced motion disables coasting', async ({ page }) => {
  let released = await mousePan(page, 2, 40);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(released);
  released = await mousePan(page, 30);
  await page.clock.runFor(150);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(released);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  released = await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(released);
});

test('new pointer input, wheel zoom and Escape interrupt coasting', async ({ page }) => {
  await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(32);
  // Holding a new middle drag without moving must cancel the previous flick.
  await page.mouse.down({ button: 'middle' });
  let stopped = await viewport(page);
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(stopped);
  await page.mouse.up({ button: 'middle' });

  await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(32);
  await page.mouse.wheel(0, -100);
  await page.clock.runFor(16);
  stopped = await viewport(page);
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(stopped);

  await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(32);
  await page.keyboard.press('Escape');
  stopped = await viewport(page);
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(stopped);
});

test('mouse exit after release stops inertia even when no pointer remains registered', async ({ page }) => {
  await mousePan(page, 30);
  await page.mouse.up({ button: 'middle' });
  await page.clock.runFor(32);
  await page.mouse.move(5, 5);
  const stopped = await viewport(page);
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(stopped);
});

test('mobile one-finger flick retains axis lock and touch cancellation stops motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(32);
  const box = await page.getByTestId('canvas-input-surface').boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + 90, y: box!.y + 200 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  for (const axis of ['x', 'y'] as const) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    for (let i = 1; i <= 2; i++) {
      await page.clock.runFor(20);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: start.x + (axis === 'x' ? 60 * i : 10 * i),
        y: start.y + (axis === 'y' ? 60 * i : 10 * i), id: 1,
      }] });
    }
    const released = await viewport(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(64);
    const coasting = await viewport(page);
    expect(coasting[axis]).toBeGreaterThan(released[axis] + 2);
    expect(coasting[axis === 'x' ? 'y' : 'x']).toBe(released[axis === 'x' ? 'y' : 'x']);
    await page.clock.runFor(400);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await page.clock.runFor(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 60, y: start.y, id: 1 }] });
  const cancelled = await viewport(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(cancelled);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
});

test('two-finger translation coasts while a pinch stops at its final scale', async ({ page }) => {
  const box = await page.getByTestId('canvas-input-surface').boundingBox();
  expect(box).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const pair = [{ x: box!.x + 200, y: box!.y + 230, id: 1 }, { x: box!.x + 400, y: box!.y + 230, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair });
  for (let i = 1; i <= 2; i++) {
    await page.clock.runFor(20);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair.map(p => ({ ...p, x: p.x + 40 * i, y: p.y + 20 * i })) });
  }
  const released = await viewport(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(64);
  const coasting = await viewport(page);
  expect(coasting.x).toBeGreaterThan(released.x + 2);
  expect(coasting.y).toBeGreaterThan(released.y + 2);
  expect(coasting.scale).toBeCloseTo(released.scale, 6);
  await page.clock.runFor(400);
  const initialScale = (await viewport(page)).scale;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair });
  for (let i = 1; i <= 2; i++) {
    await page.clock.runFor(20);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { ...pair[0], x: pair[0].x - 20 * i }, { ...pair[1], x: pair[1].x + 20 * i },
    ] });
  }
  const pinched = await viewport(page);
  expect(pinched.scale).toBeGreaterThan(initialScale);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(400);
  expect(await viewport(page)).toEqual(pinched);
});
