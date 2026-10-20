import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 FlownoteDesktop/1.0.0', viewport: { width: 1280, height: 900 } });

test('Windows app restores login and adapts its header-free navigation to window resizing', async ({ page, request }) => {
  const email = `windows-ui-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password,
    username: `windows-${randomUUID().slice(0, 8)}`, nickname: 'Windows UI verification' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const { token, user } = await login.json();
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { token, user });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '앱 기능' });
  await expect(nav).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-desktop-app', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  let box = await nav.boundingBox();
  expect(box!.width).toBeLessThan(100);
  expect(box!.height).toBeGreaterThan(700);
  await page.getByRole('button', { name: '전체 기능', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 기능' });
  await expect(menu.getByRole('link', { name: '설정', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: '전체 기능', exact: true })).toBeFocused();
  await page.reload();
  await expect(nav).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 760, height: 700 });
  box = await nav.boundingBox();
  expect(box!.width).toBe(760);
  expect(box!.height).toBeLessThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
