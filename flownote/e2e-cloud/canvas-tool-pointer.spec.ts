import { devices, expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Explicit WebKit override: the existing ios-webkit project's match list stays intact.
test.use({ ...devices['iPad Pro 11'], browserName: 'webkit',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.2.0' });
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';

for (const width of [390, 820, 1024]) {
  test(`canvas tool markers in mobile WebKit at ${width}px preserve saved content and drawing`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1180 });
    const email = `pointer-${randomUUID()}@example.com`, password = randomUUID();
    expect((await request.post(`${api}/api/users`, { data: {
      email, password, username: `pointer-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic pointer verification',
    } })).ok()).toBeTruthy();
    const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const { token, user } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };
    const created = await request.post(`${api}/api/canvas/documents`, {
      headers, data: { title: 'Synthetic tool pointer verification' },
    });
    expect(created.ok()).toBeTruthy();
    const { id } = await created.json();
    const seedId = randomUUID();
    const load = async () => {
      const response = await request.get(`${api}/api/canvas/load?canvasId=${id}`, { headers });
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    try {
      expect((await request.post(`${api}/api/canvas/save`, { headers, data: {
        canvasId: id, mutationId: randomUUID(), payload: {
          addedLines: [{ id: seedId, points: [{ x: 30, y: 40 }, { x: 90, y: 80 }], color: '#000000', strokeWidth: 2 }],
          addedTextBoxes: [{ id: randomUUID(), text: 'Synthetic preserved text', x: 40, y: 120, width: 180, height: 60 }],
        },
      } })).ok()).toBeTruthy();
      const original = await load();
      await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
        url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
      await page.addInitScript(({ user }) => {
        localStorage.setItem('flownote_auth_user', JSON.stringify(user));
        localStorage.setItem('flownote.canvas.pencilOnlyMode', 'true');
      }, { user });
      await page.goto(`${web}/canvas/${id}`);
      const surface = page.getByTestId('canvas-input-surface');
      const marker = page.getByTestId('canvas-tool-pointer');
      await expect(surface).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '1');
      await expect(marker).toBeHidden();

      // Browser PointerEvents exercise presentation only; physical Pencil hover is a device check.
      const hover = async (rightEdge = false) => {
        const box = await surface.boundingBox();
        expect(box).not.toBeNull();
        const point = { x: box!.x + (rightEdge ? box!.width - 4 : 160), y: box!.y + 240 };
        // Settle the real mouse left by the toolbar click before introducing a
        // synthetic pen stream; a queued mouse leave must not race that sample.
        await page.mouse.move(point.x, point.y);
        await page.evaluate(() => new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
        await surface.dispatchEvent('pointermove', {
          pointerId: 51, pointerType: 'pen', clientX: point.x, clientY: point.y, buttons: 0,
        });
        // Visibility can already be true from the prior hover. Wait for the
        // queued position update before checking the unchanged coordinate contract.
        await page.evaluate(() => new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
        await expect(marker).toBeVisible();
        const tip = await page.getByTestId('canvas-tool-pointer-tip').boundingBox();
        expect(tip).not.toBeNull();
        expect(tip!.width).toBe(4);
        expect(tip!.height).toBe(4);
        expect(await page.getByTestId('canvas-tool-pointer-tip').evaluate(tip =>
          parseFloat(getComputedStyle(tip).borderTopLeftRadius))).toBeGreaterThanOrEqual(2);
        await expect(page.getByTestId('canvas-tool-pointer-tip')).toHaveCSS('box-shadow', 'none');
        expect(tip!.x + tip!.width / 2).toBeCloseTo(point.x, 0);
        expect(tip!.y + tip!.height / 2).toBeCloseTo(point.y, 0);
      };
      const selectTool = async (label: string) => {
        const toggle = page.getByTestId('canvas-tool-menu-toggle');
        if (await toggle.isVisible()) await toggle.click();
        await page.getByRole('button', { name: label, exact: true }).click();
        // The pen's existing palette must remain dismissible.
        await page.keyboard.press('Escape');
      };
      for (const [tool, label] of [['eraser', '지우개'], ['lasso', '올가미'], ['handle', '이동'], ['text', '텍스트'], ['pen', '펜']]) {
        await selectTool(label);
        if (width < 1024) {
          await expect(page.getByTestId('canvas-current-tool')).toContainText(label);
          await expect(page.getByTestId('canvas-current-tool')).toHaveAttribute('aria-label', `현재 도구: ${label}`);
        }
        await hover();
        await expect(marker).toHaveAttribute('data-tool', tool);
        await expect(marker).toHaveText('');
        await expect(marker.locator('svg')).toHaveCount(0);
        await expect(marker.locator('span')).toHaveCount(1);
        await expect(marker).toHaveCSS('pointer-events', 'none');
        await expect(marker).toHaveAttribute('aria-hidden', 'true');
      }
      // Tool switches from the existing Pencil double-tap event update a stationary marker.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('flownote:apple-pencil-double-tap')));
      await expect(marker).toHaveAttribute('data-tool', 'eraser');
      await expect(marker).toHaveText('');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('flownote:apple-pencil-double-tap')));
      await expect(marker).toHaveAttribute('data-tool', 'pen');
      await hover(true);
      const tipBox = await page.getByTestId('canvas-tool-pointer-tip').boundingBox();
      expect(tipBox).not.toBeNull();
      expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      for (const type of ['pointerleave', 'pointercancel', 'lostpointercapture']) {
        await hover();
        await surface.dispatchEvent(type, { pointerId: 51, pointerType: 'pen' });
        await expect(marker).toBeHidden();
      }
      await hover();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(marker).toBeHidden();
      const unchanged = await load();
      expect(unchanged.lines).toEqual(original.lines);
      expect(unchanged.textBoxes ?? unchanged.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);

      // Real mouse input still reaches drawing, auto-save and reload despite the overlay.
      const box = await surface.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + 160, box!.y + 300);
      await page.mouse.down();
      await page.mouse.move(box!.x + 230, box!.y + 340, { steps: 8 });
      await page.mouse.up();
      await expect(marker).toBeHidden();
      await expect.poll(async () => (await load()).lines.length).toBe(2);
      const saved = await load();
      expect(saved.lines.find((line: { id: string }) => line.id === seedId)).toEqual(original.lines[0]);
      expect(saved.textBoxes ?? saved.text_boxes).toEqual(original.textBoxes ?? original.text_boxes);
      await page.reload();
      await expect(page.getByTestId('canvas-render-surface')).toHaveAttribute('data-visible-line-count', '2');
      await expect(marker).toBeHidden();
    } finally {
      expect((await request.delete(`${api}/api/canvas/documents/${id}`, { headers })).ok()).toBeTruthy();
    }
  });
}
