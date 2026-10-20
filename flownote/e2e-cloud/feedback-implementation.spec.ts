import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';
let token: string;
let user: Record<string, unknown>;
let canvasId: string;
const email = `feedback-${randomUUID()}@example.com`;
const password = randomUUID();
const headers = () => ({ Authorization: `Bearer ${token}` });
const taskTitle = `보고서 제출 ${randomUUID().slice(0, 8)}`;
const scheduleTitle = `팀 회의 ${randomUUID().slice(0, 8)}`;
const canvasTitle = `캔버스 제목 일정 ${randomUUID().slice(0, 8)}`;
const date = '2026-12-17';

test.beforeAll(async ({ request }) => {
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `feedback-${randomUUID().slice(0, 8)}`, nickname: 'Feedback verification' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  ({ token, user } = await login.json());
  const canvas = await request.post(`${api}/api/canvas/documents`, { headers: headers(), data: { title: `${date} 10:00~11:00 ${canvasTitle}` } });
  expect(canvas.ok()).toBeTruthy();
  canvasId = (await canvas.json()).id;
  expect((await request.post(`${api}/api/canvas/save`, { headers: headers(), data: { canvasId, mutationId: randomUUID(), payload: { addedTextBoxes: [{ id: randomUUID(), text: `${date} ${taskTitle}\n${date} 14:00~15:00 ${scheduleTitle}`, x: 200, y: 200, width: 500, height: 180 }] } } })).ok()).toBeTruthy();
  expect((await request.put(`${api}/api/diary/${date}`, { headers: headers(), data: { todos: [{ id: 'existing', label: '기존 일정', color: '#000000', done: false }], grid: { startHour: 0, endHour: 24, cols: 12, cells: { 0: 'existing' }, strokes: [] }, journal: [{ type: 'paragraph', content: '기존 일기' }] } })).ok()).toBeTruthy();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: '__Host-flownote_session', value: token,
    url: 'https://flownote-react-staging.vercel.app', secure: true, httpOnly: true, sameSite: 'Strict' }]);
  await page.addInitScript(({ user }) => {
    localStorage.setItem('flownote_auth_user', JSON.stringify(user));
  }, { token, user });
});
test.afterAll(async ({ request }) => {
  if (token) {
    const taskResponse = await request.get(`${api}/api/tasks`, { headers: headers() });
    if (taskResponse.ok()) {
      const taskData = await taskResponse.json();
      const tasks = Array.isArray(taskData) ? taskData : taskData.tasks ?? [];
      for (const task of tasks) if (task.task_name === taskTitle) expect((await request.delete(`${api}/api/tasks/${task.id}`, { headers: headers() })).ok()).toBeTruthy();
    }
    expect((await request.put(`${api}/api/diary/${date}`, { headers: headers(), data: { todos: [], grid: { startHour: 0, endHour: 24, cols: 12, cells: {}, strokes: [] }, journal: [] } })).ok()).toBeTruthy();
  }
  if (canvasId) expect((await request.delete(`${api}/api/canvas/documents/${canvasId}`, { headers: headers() })).ok()).toBeTruthy();
});

test('profile changes persist and email change requires current password', async ({ page, request }) => {
  expect((await request.patch(`${api}/api/users/me`, { data: { username: 'user', nickname: 'name', email } })).status()).toBe(401);
  const changedEmail = `updated-${randomUUID()}@example.com`;
  expect((await request.patch(`${api}/api/users/me`, { headers: headers(), data: { username: user.username, nickname: user.nickname, email: changedEmail } })).status()).toBe(403);
  await page.goto('/settings');
  await page.getByLabel('표시 이름', { exact: true }).fill('수정된 프로필');
  await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '프로필이 저장되었습니다.' })).toBeVisible();
  expect((await (await request.get(`${api}/api/users/me`, { headers: headers() })).json()).nickname).toBe('수정된 프로필');
  await page.getByLabel('이메일', { exact: true }).fill(changedEmail);
  await page.getByLabel('현재 비밀번호 (이메일 변경 확인)', { exact: true }).fill(password);
  await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '프로필이 저장되었습니다.' })).toBeVisible();
  expect((await request.post(`${api}/api/users/login`, { data: { email: changedEmail, password } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('표시 이름', { exact: true })).toHaveValue('수정된 프로필');
  await expect(page.getByLabel('이메일', { exact: true })).toHaveValue(changedEmail);
});

test('canvas suggests tasks and schedules, preserves the planner, and uses round white library controls', async ({ page, request }) => {
  await page.goto(`/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
  const library = page.getByTestId('canvas-library-button').filter({ visible: true });
  await expect(library).toHaveClass(/rounded-full/);
  await expect(library).toHaveClass(/bg-white/);
  await page.getByRole('button', { name: '플래너 제안', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '캔버스 플래너 제안' });
  await expect(panel.getByLabel('제안 내용').nth(0)).toHaveValue(canvasTitle);
  await expect(panel.getByLabel('시작 시간').nth(0)).toHaveValue('10:00');
  await expect(panel.getByLabel('종료 시간').nth(0)).toHaveValue('11:00');
  await expect(panel.getByLabel('제안 내용').nth(1)).toHaveValue(taskTitle);
  await expect(panel.getByLabel('제안 내용').nth(2)).toHaveValue(scheduleTitle);
  expect((await (await request.get(`${api}/api/tasks`, { headers: headers() })).json()).length).toBe(0);
  await panel.getByRole('button', { name: '플래너에 추가', exact: true }).first().click();
  await expect(panel.getByRole('button', { name: '추가됨' })).toHaveCount(1);
  await panel.getByRole('button', { name: '플래너에 추가', exact: true }).first().click();
  await expect(panel.getByRole('button', { name: '추가됨' })).toHaveCount(2);
  await panel.getByRole('button', { name: '플래너에 추가', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('3건을 플래너에 추가했습니다.');
  const tasks = await (await request.get(`${api}/api/tasks`, { headers: headers() })).json();
  expect(tasks.filter((task: { task_name: string }) => task.task_name === taskTitle)).toHaveLength(1);
  const diary = await (await request.get(`${api}/api/diary?date=${date}`, { headers: headers() })).json();
  expect(diary.todos.some((todo: { label: string }) => todo.label === scheduleTitle)).toBeTruthy();
  expect(diary.todos.some((todo: { label: string }) => todo.label === canvasTitle)).toBeTruthy();
  expect(Object.keys(diary.grid.cells)).toHaveLength(25);
  const titleTodo = diary.todos.find((todo: { label: string }) => todo.label === canvasTitle);
  expect(diary.grid.cells['120']).toBe(titleTodo.id);
  expect(diary.grid.cells['131']).toBe(titleTodo.id);
  expect(diary.grid.cells['0']).toBe('existing');
  expect(diary.journal).toEqual([{ type: 'paragraph', content: '기존 일기' }]);
  await panel.getByRole('button', { name: '플래너 제안 닫기' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '파일 동작', exact: true }).click();
  await page.getByRole('menuitem', { name: '플래너 제안' }).click();
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('settings use the available width and keep supported preferences after reload and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/settings');
  const panel = page.getByTestId('settings-panel');
  expect((await panel.boundingBox())!.width).toBeGreaterThan(1200);
  await page.getByRole('button', { name: '큰 글자', exact: true }).click();
  await page.getByRole('button', { name: '촘촘한 간격', exact: true }).click();
  await page.getByRole('switch', { name: '움직임 줄이기', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'large');
  await expect(page.locator('html')).toHaveClass(/motion-reduced/);
  await page.goto(`/canvas/${canvasId}`);
  await expect(page.getByTestId('canvas-input-surface')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveClass(/motion-reduced/);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '큰 글자', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: '움직임 줄이기' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: '삭제 전 확인' })).toHaveCount(0);
  await page.getByRole('button', { name: '보기 설정 초기화' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-scale', 'normal');
  await expect(page.locator('html')).not.toHaveClass(/motion-reduced/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: '큰 글자', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '큰 글자', exact: true })).toBeInViewport();
});
