import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'https://flownote-api-staging.up.railway.app';

test('offline UUID creates are idempotent and preserve owned folder references', async ({ request }) => {
  const email = `offline-api-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${api}/api/users`, { data: { email, password, username: `offline-${randomUUID().slice(0, 8)}`, nickname: 'Offline contract' } })).ok()).toBeTruthy();
  const login = await request.post(`${api}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json(), headers = { Authorization: `Bearer ${token}` };
  const note = randomUUID(), canvas = randomUUID(), noteFolder = randomUUID(), canvasFolder = randomUUID(), schedule = randomUUID();
  const entries = [
    { path: '/api/notes', id: note, body: { id: note, title: 'Offline UUID note', content: { format: 'markdown', version: 1, markdown: 'stable retry' }, revision: 1, client_id: randomUUID() } },
    { path: '/api/canvas/documents', id: canvas, body: { id: canvas, title: 'Offline UUID canvas' } },
    { path: '/api/note-folders', id: noteFolder, body: { id: noteFolder, name: 'Offline note folder', category: '기본', note_ids: [note] } },
    { path: '/api/canvas/folders', id: canvasFolder, body: { id: canvasFolder, name: 'Offline canvas folder', category: '기본', canvas_ids: [canvas] } },
    { path: '/api/schedule-items', id: schedule, body: { id: schedule, title: 'Offline schedule', days_of_week: ['MON'], start_time: '10:00:00', end_time: '11:00:00', memo: 'unchanged after retry' } },
  ];
  try {
    for (const entry of entries) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request.post(api + entry.path, { headers, data: entry.body });
        expect(response.ok(), `${entry.path}: ${response.status()}`).toBeTruthy();
        expect((await response.json()).id).toBe(entry.id);
      }
    }
    const folders = await (await request.get(api + '/api/note-folders', { headers })).json();
    expect(folders.find((folder: { id: string }) => folder.id === noteFolder).note_ids).toEqual([note]);
    const schedules = await (await request.get(api + '/api/schedule-items', { headers })).json();
    expect(schedules.filter((item: { id: string }) => item.id === schedule)).toHaveLength(1);
  } finally {
    for (const entry of [...entries].reverse()) await request.delete(`${api}${entry.path}/${entry.id}`, { headers });
  }
});
