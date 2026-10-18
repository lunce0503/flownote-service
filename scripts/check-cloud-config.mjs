import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBrowserReachableUrl } from '../flownote/src/shared/api/cloudUrl.ts';

const config = JSON.parse(readFileSync(new URL('./cloud-environments.json', import.meta.url)));
assert.notEqual(config.staging.environmentId, config.production.environmentId);
assert.notEqual(config.staging.vercelProjectId, config.production.vercelProjectId);
for (const name of ['staging', 'production']) {
  const env = config[name];
  assert.equal(resolveBrowserReachableUrl(env.apiUrl), env.apiUrl);
  assert.equal(new URL(env.webUrl).protocol, 'https:');
}
for (const url of ['http://localhost:8000', 'https://localhost', 'https://192.168.0.10',
  'https://127.0.0.1', 'https://[::1]', 'https://api.railway.internal',
  'https://user:password@api.up.railway.app', 'https://api.up.railway.app:8000']) {
  assert.throws(() => resolveBrowserReachableUrl(url));
}
console.log('Cloud profiles are separate; web and mobile reject local API destinations.');
