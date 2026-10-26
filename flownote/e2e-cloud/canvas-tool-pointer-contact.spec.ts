import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Native browser contact input, including pointer capture and the existing React
// gesture handlers. WebKit hover coverage remains in canvas-tool-pointer.spec.ts;
// CDP emulation does not certify physical iOS/Pencil hardware behavior.
test.use({ browserName: 'chromium', hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36 FlownoteAndroid/1.3.0' });
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';

type Point = { x: number; y: number };
type SavedCanvas = {
  lines: { id: string; points: Point[] }[];
  textBoxes?: unknown[];
  text_boxes?: unknown[];
};

// Negative visibility assertions must run after the component's queued frame.
const paint = (page: Page) => page.evaluate(() => new Promise<void>(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
}));

const viewport = (page: Page) => page.getByTestId('canvas-input-surface').evaluate(surface => {
  const grid = surface.parentElement?.querySelector('svg > g') as SVGGElement | null;
  const matrix = grid?.transform.baseVal.consolidate()?.matrix;
  if (!matrix) throw new Error('Canvas viewport transform is missing');
  return { x: matrix.e, y: matrix.f, scale: matrix.a };
});

const pen = async (page: Page, cdp: CDPSession,
  type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', point: Point) => {
  if (type === 'mousePressed') {
    // Tool selection used Playwright's mouse. Settle that distinct device on
    // the surface before the FIRST pen event, so its queued leave cannot race
    // a pen contact. No pen hover, capture stub or drawing state reset is used.
    await page.mouse.move(point.x, point.y);
    await paint(page);
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type, x: point.x, y: point.y, pointerType: 'pen', button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    force: type === 'mouseReleased' ? 0 : 0.5, clickCount: 1,
  });
  await paint(page);
};

const touch = async (page: Page, cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd', points: (Point & { id: number })[]) => {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await paint(page);
};

const selectTool = async (page: Page, label: string) => {
  const toggle = page.getByTestId('canvas-tool-menu-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.keyboard.press('Escape');
};

const expectMarker = async (page: Page, tool: string, point: Point) => {
  const marker = page.getByTestId('canvas-tool-pointer');
  if (tool === 'pen') {
    await expect(marker).toBeHidden();
    await expect(page.getByTestId('canvas-input-surface')).toHaveCSS('cursor', 'none');
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.getAttribute('data-testid'), point)).toBe('canvas-input-surface');
    return;
  }
  await expect(marker).toBeVisible().catch(async error => {
    console.log('Pointer event sequence:', await page.evaluate(() => (window as unknown as { __pointerProbe?: unknown[] }).__pointerProbe));
    throw error;
  });
  await expect(marker).toHaveAttribute('data-tool', tool);
  await expect(marker).toHaveText('');
  await expect(marker.locator('svg')).toHaveCount(0);
  await expect(marker.locator('span')).toHaveCount(1);
  await expect(marker).toHaveAttribute('aria-hidden', 'true');
  await expect(marker).toHaveCSS('pointer-events', 'none');
  const tip = await page.getByTestId('canvas-tool-pointer-tip').boundingBox();
  expect(tip).not.toBeNull();
  expect(tip!.width).toBe(tool === 'eraser' ? 32 : 4);
  expect(tip!.height).toBe(tool === 'eraser' ? 32 : 4);
  expect(tip!.x + tip!.width / 2).toBeCloseTo(point.x, 0);
  expect(tip!.y + tip!.height / 2).toBeCloseTo(point.y, 0);
  // The visual overlay must leave the actual input surface hit-testable.
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)
    ?.getAttribute('data-testid'), point)).toBe('canvas-input-surface');
};

for (const width of [390, 820]) {
  test.describe(`canvas contact markers at ${width}px`, () => {
    test.use({ viewport: { width, height: 1180 }, reducedMotion: 'reduce' });
    let token: string;
    let user: Record<string, unknown>;
    let canvasId = '';
    let original: SavedCanvas;
    const headers = () => ({ Authorization: `Bearer ${token}` });

    test.beforeAll(async ({ request }) => {
      const email = `contact-${randomUUID()}@example.com`, password = randomUUID();
      expect((await request.post(`${api}/api/users`, { data: {
        email, password, username: `contact-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic contact verification',
      } })).ok()).toBeTruthy();
      const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
      expect(login.ok()).toBeTruthy();
      ({ token, user } = await login.json());
    });

    test.beforeEach(async ({ page, request }) => {
      const created = await request.post(`${api}/api/canvas/documents`, {
        headers: headers(), data: { title: 'Synthetic contact verification' },
      });
      expect(created.ok()).toBeTruthy();
      canvasId = (await created.json()).id;
      expect((await request.post(`${api}/api/canvas/save`, { headers: headers(), data: {
        canvasId, mutationId: randomUUID(), payload: {
          addedLines: [{ id: randomUUID(), points: [{ x: 30, y: 40 }, { x: 90, y: 80 }], color: '#000000', strokeWidth: 2 }],
          addedTextBoxes: [{ id: randomUUID(), text: 'Synthetic preserved text', x: 40, y: 120, width: 180, height: 60 }],
        },
      } })).ok()).toBeTruthy();
      const loaded = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
      expect(loaded.ok()).toBeTruthy();
      original = await loaded.json();
      expect(original.lines).toHaveLength(1);
      expect(original.textBoxes ?? original.text_boxes).toHaveLength(1);
      await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
        url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
      await page.addInitScript(({ user }) => {
        localStorage.setItem('flownote_auth_user', JSON.stringify(user));
        localStorage.setItem('flownote.canvas.pencilOnlyMode', 'true');
      }, { user });
      await page.goto(`${web}/canvas/${canvasId}`);
      await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
      await page.evaluate(() => {
        const events: unknown[] = [];
        (window as unknown as { __pointerProbe: unknown[] }).__pointerProbe = events;
        const surface = document.querySelector('[data-testid="canvas-input-surface"]')!;
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture']) {
          surface.addEventListener(type, event => {
            const e = event as PointerEvent;
            events.push({ type, id: e.pointerId, kind: e.pointerType, x: e.clientX, y: e.clientY });
            if (events.length > 100) events.shift();
          });
        }
        window.addEventListener('blur', () => events.push({ type: 'window-blur' }));
      });
      await selectTool(page, '펜');
      await expect(page.getByTestId('canvas-tool-pointer')).toBeHidden();
    });

    test.afterEach(async ({ request }) => {
      if (canvasId) {
        expect((await request.delete(`${api}/api/canvas/documents/${canvasId}`, { headers: headers() })).ok()).toBeTruthy();
        canvasId = '';
      }
    });

    test('Pencil down/move/up tracks the contact and preserves drawing, save and reload', async ({ page, request }) => {
      const cdp = await page.context().newCDPSession(page);
      const box = await page.getByTestId('canvas-input-surface').boundingBox();
      expect(box).not.toBeNull();
      const start = { x: box!.x + 100, y: box!.y + 320 };
      const end = { x: start.x + 80, y: start.y + 40 };
      const before = await viewport(page);
      // No preceding hover event: contact alone must make the marker visible.
      await pen(page, cdp, 'mousePressed', start);
      await expectMarker(page, 'pen', start);
      await pen(page, cdp, 'mouseMoved', { x: start.x + 40, y: start.y + 20 });
      await pen(page, cdp, 'mouseMoved', end);
      await expectMarker(page, 'pen', end);
      await pen(page, cdp, 'mouseReleased', end);
      await expect(page.getByTestId('canvas-tool-pointer')).toBeHidden();
      expect(await viewport(page)).toEqual(before);
      const load = async (): Promise<SavedCanvas> => {
        const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
        expect(response.ok()).toBeTruthy();
        return response.json();
      };
      await expect.poll(async () => (await load()).lines.length).toBe(2);
      const saved = await load();
      expect(saved.lines.find(line => line.id === original.lines[0].id)).toEqual(original.lines[0]);
      expect(saved.textBoxes ?? saved.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);
      const drawn = saved.lines.find(line => line.id !== original.lines[0].id)!;
      expect(drawn.points.length).toBeGreaterThanOrEqual(2);
      // The existing drawing handler samples browser-coalesced events. Verify
      // a progressing stroke and its final coordinates without assuming that
      // the browser supplies a coalesced sample on pointerdown itself.
      expect(drawn.points[0].x).toBeLessThan(drawn.points.at(-1)!.x);
      expect(drawn.points[0].y).toBeLessThan(drawn.points.at(-1)!.y);
      expect(drawn.points.at(-1)!.x).toBeCloseTo((180 - before.x) / before.scale, 0);
      expect(drawn.points.at(-1)!.y).toBeCloseTo((360 - before.y) / before.scale, 0);
      await page.reload();
      await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '2');
      await expect(page.getByTestId('canvas-tool-pointer')).toBeHidden();
    });

    test('Pencil-only finger contact shows navigation and retains axis lock for drawing tools', async ({ page, request }) => {
      const cdp = await page.context().newCDPSession(page);
      const box = await page.getByTestId('canvas-input-surface').boundingBox();
      expect(box).not.toBeNull();
      const start = { x: box!.x + 100, y: box!.y + 320, id: 1 };
      for (const [label, axis] of [['펜', 'x'], ['지우개', 'y'], ['올가미', 'x']] as const) {
        await selectTool(page, label);
        await expect(page.getByTestId('canvas-current-tool')).toHaveAttribute('aria-label', `현재 도구: ${label}`);
        const before = await viewport(page);
        await touch(page, cdp, 'touchStart', [start]);
        await expectMarker(page, 'pan', start);
        for (const step of [1, 2]) {
          const point = { ...start, x: start.x + (axis === 'x' ? 40 : 5) * step,
            y: start.y + (axis === 'y' ? 40 : 5) * step };
          await touch(page, cdp, 'touchMove', [point]);
          await expectMarker(page, 'pan', point);
        }
        const moved = await viewport(page);
        expect(moved[axis]).toBeGreaterThan(before[axis] + 20);
        expect(moved[axis === 'x' ? 'y' : 'x']).toBeCloseTo(before[axis === 'x' ? 'y' : 'x'], 6);
        expect(moved.scale).toBe(before.scale);
        await touch(page, cdp, 'touchEnd', []);
        await expect(page.getByTestId('canvas-tool-pointer')).toBeHidden();
        expect(await viewport(page)).toEqual(moved);
      }
      const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
      expect(response.ok()).toBeTruthy();
      const saved: SavedCanvas = await response.json();
      expect(saved.lines).toEqual(original.lines);
      expect(saved.textBoxes ?? saved.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
    });

    test('eraser contact shows a 32px ring and still removes the new stroke while preserving existing content', async ({ page, request }) => {
      const cdp = await page.context().newCDPSession(page);
      const surface = page.getByTestId('canvas-input-surface'); const box = await surface.boundingBox(); expect(box).not.toBeNull();
      const start = { x: box!.x + 140, y: box!.y + 420 }, end = { x: box!.x + 220, y: box!.y + 460 };
      await pen(page, cdp, 'mousePressed', start); await pen(page, cdp, 'mouseMoved', { x: start.x + 40, y: start.y + 20 }); await pen(page, cdp, 'mouseMoved', end); await pen(page, cdp, 'mouseReleased', end);
      const load = async (): Promise<SavedCanvas> => (await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() })).json();
      await expect.poll(async () => (await load()).lines.length).toBe(2);
      await selectTool(page, '지우개');
      await pen(page, cdp, 'mousePressed', end); await expectMarker(page, 'eraser', end);
      await expect(surface).toHaveCSS('cursor', 'none');
      await expect(page.getByTestId('canvas-tool-pointer-tip')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await pen(page, cdp, 'mouseMoved', { x: end.x - 5, y: end.y - 3 }); await pen(page, cdp, 'mouseReleased', end);
      await expect.poll(async () => (await load()).lines.length).toBe(1);
      const saved = await load(); expect(saved.lines).toEqual(original.lines);
      expect(saved.textBoxes ?? saved.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);
    });

    test('multiple contacts suppress markers through partial release and preserve pinch navigation', async ({ page, request }) => {
      const cdp = await page.context().newCDPSession(page);
      const box = await page.getByTestId('canvas-input-surface').boundingBox();
      expect(box).not.toBeNull();
      const first = { x: box!.x + 90, y: box!.y + 320, id: 1 };
      const second = { x: box!.x + 230, y: box!.y + 320, id: 2 };
      const marker = page.getByTestId('canvas-tool-pointer');

      // Separate pen and touch streams allow a real partial release without
      // replacing DOM events, stubbing capture, or resetting component state.
      await selectTool(page, '올가미');
      await pen(page, cdp, 'mousePressed', first);
      await expectMarker(page, 'lasso', first);
      await touch(page, cdp, 'touchStart', [second]);
      await expect(marker).toBeHidden();
      await touch(page, cdp, 'touchMove', [{ ...second, x: second.x + 20 }]);
      await expect(marker).toBeHidden();
      await touch(page, cdp, 'touchEnd', []);
      await expect(marker).toBeHidden();
      await pen(page, cdp, 'mouseMoved', { ...first, x: first.x + 20 });
      await expect(marker).toBeHidden();
      await pen(page, cdp, 'mouseReleased', { ...first, x: first.x + 20 });
      await expect(marker).toBeHidden();

      // Once every contact ends, a new single contact must be visible again.
      await touch(page, cdp, 'touchStart', [first]);
      await expectMarker(page, 'pan', first);
      const beforePinch = await viewport(page);
      await touch(page, cdp, 'touchStart', [first, second]);
      await expect(marker).toBeHidden();
      await touch(page, cdp, 'touchMove', [{ ...first, x: first.x - 20 }, { ...second, x: second.x + 20 }]);
      await expect(marker).toBeHidden();
      const pinched = await viewport(page);
      expect(pinched.scale).toBeGreaterThan(beforePinch.scale);
      await touch(page, cdp, 'touchEnd', []);
      await expect(marker).toBeHidden();
      expect(await viewport(page)).toEqual(pinched);
      await touch(page, cdp, 'touchStart', [first]);
      await expectMarker(page, 'pan', first);
      await touch(page, cdp, 'touchEnd', []);
      await expect(marker).toBeHidden();
      const response = await request.get(`${api}/api/canvas/load?canvasId=${canvasId}`, { headers: headers() });
      expect(response.ok()).toBeTruthy();
      const saved: SavedCanvas = await response.json();
      expect(saved.lines).toEqual(original.lines);
      expect(saved.textBoxes ?? saved.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
    });
  });
}
