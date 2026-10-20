import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
const web = 'https://flownote-react-staging.vercel.app';

test('HttpOnly web login, CSRF protection, logout and security headers', async ({ page, request }) => {
  const email = `security-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: {
    email, password, username: `security-${randomUUID().slice(0, 8)}`, nickname: 'Security verification',
  } })).ok()).toBeTruthy();
  const native = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(native.ok()).toBeTruthy();
  const { token } = await native.json();
  const login = await page.context().request.post(`${web}/web-api/api/users/login`, {
    headers: { Origin: web, 'X-Flownote-Web': '1' }, data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).token === 'web-session').toBe(true);
  const cookies = await page.context().cookies(web);
  const session = cookies.find(cookie => cookie.name === '__Host-flownote_session')!;
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);
  expect(session?.sameSite).toBe('Strict');
  expect(session?.path).toBe('/');
  await page.goto('/login');
  expect((await page.evaluate(() => document.cookie)).includes(session.value)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('flownote_auth_token'))).toBeNull();
  const me = await page.context().request.get(`${web}/web-api/api/users/me`);
  expect(me.status()).toBe(200);
  const forbidden = await page.context().request.post(`${web}/web-api/api/users/logout`, {
    headers: { Origin: 'https://example.invalid', 'X-Flownote-Web': '1' }, data: {},
  });
  expect(forbidden.status()).toBe(403);
  expect((await page.context().request.get(`${web}/web-api/api/users/me`)).status()).toBe(200);
  const logout = await page.context().request.post(`${web}/web-api/api/users/logout`, {
    headers: { Origin: web, 'X-Flownote-Web': '1' }, data: {},
  });
  expect(logout.status()).toBe(204);
  for (const path of ['/api/users/me', '/api/canvas/documents', '/api/tasks']) {
    expect((await request.get(`${api}${path}`, { headers: { Authorization: `Bearer ${session.value}` } })).status()).toBe(401);
  }
  // Another native session stays valid until explicit all-device revocation.
  expect((await request.get(`${api}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
  expect((await request.post(`${api}/api/users/logout-all`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
  expect((await request.get(`${api}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  for (const path of ['/', '/login', '/canvas']) {
    const response = await request.get(`${web}${path}`);
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
});

test('registration rejects invalid passwords and shared login throttle returns Retry-After', async ({ request }) => {
  const email = `security-limit-${randomUUID()}@example.com`;
  for (const password of [null, '', '               ', 'short', 'passwordpassword', '가'.repeat(25)]) {
    expect((await request.post(`${api}/api/users`, { data: { email, password, username: 'security', nickname: 'Security' } })).status()).toBe(400);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    expect((await request.post(`${api}/api/users/login`, { data: { email, password: 'invalid-long-passphrase' } })).status()).toBe(401);
  }
  const limited = await request.post(`${api}/api/users/login`, { data: { email, password: 'invalid-long-passphrase' } });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  await new Promise(resolve => setTimeout(resolve, 61_000));
  expect((await request.post(`${api}/api/users/login`, { data: { email, password: 'invalid-long-passphrase' } })).status()).toBe(401);
});
