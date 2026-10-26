import { expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export const stagingApi = 'https://flownote-api-staging.up.railway.app';
export const stagingWeb = 'https://flownote-react-staging.vercel.app';
export async function createCloudActor(request: APIRequestContext) {
  const email = `workspace-${randomUUID()}@example.com`, password = randomUUID();
  expect((await request.post(`${stagingApi}/api/users`, { data: { email, password, username: `ws-${randomUUID().slice(0, 8)}`, nickname: 'Synthetic workspace' } })).ok()).toBeTruthy();
  const login = await request.post(`${stagingApi}/api/users/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy(); return login.json();
}
