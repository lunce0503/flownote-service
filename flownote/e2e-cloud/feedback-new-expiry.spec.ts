import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Fixed staging origins; all records belong to a new synthetic account per test.
const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';
const day = 24 * 60 * 60 * 1000;

for (const width of [1440, 390]) {
  test(`feedback NEW expires without changing the saved record at ${width}px`, async ({ page, request }) => {
    const email = `feedback-expiry-${randomUUID()}@example.com`;
    const password = randomUUID();
    expect((await request.post(`${api}/api/users`, { data: {
      email, password, username: `expiry-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic expiry check',
    } })).ok()).toBeTruthy();
    const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const { token, user } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const empty = await request.get(`${api}/api/feedback`, { headers });
      expect(empty.ok()).toBeTruthy();
      expect(await empty.json()).toEqual([]);
      await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
        url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
      await page.addInitScript(({ user }) => {
        localStorage.setItem('flownote_auth_user', JSON.stringify(user));
      }, { user });
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.install();
      const loaded = page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/api/feedback') && response.request().method() === 'GET');
      await page.goto(`${web}/settings`);
      expect((await loaded).ok()).toBeTruthy();
      const message = `Synthetic feedback expiry check ${randomUUID()}`;
      await page.getByRole('textbox', { name: '내용', exact: true }).fill(message);
      const responsePromise = page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/api/feedback') && response.request().method() === 'POST');
      await page.getByRole('button', { name: '피드백 보내기', exact: true }).click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const created = await response.json();
      expect(created.message).toBe(message);
      expect(created.status).toBe('NEW');
      const row = page.getByRole('listitem').filter({ hasText: message });
      const label = row.getByText('NEW', { exact: true });
      await row.scrollIntoViewIfNeeded();
      await expect(label).toBeVisible();

      // Only browser time moves; the cloud session and data keep their real times.
      await page.clock.pauseAt(new Date(Date.parse(created.created_at) + day - 1000));
      await expect(label).toBeVisible();
      await page.clock.runFor(2000);
      await expect(label).toHaveCount(0);
      await expect(row.getByText(message, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

      await page.reload();
      await row.scrollIntoViewIfNeeded();
      await expect(row.getByText(message, { exact: true })).toBeVisible();
      await expect(label).toHaveCount(0);
      const saved = await request.get(`${api}/api/feedback`, { headers });
      expect(saved.ok()).toBeTruthy();
      expect(await saved.json()).toEqual([created]);
    } finally {
      // The API has no feedback/account deletion route; retain only synthetic fixtures.
      expect((await request.post(`${api}/api/users/logout`, { headers })).status()).toBe(204);
    }
  });
}
