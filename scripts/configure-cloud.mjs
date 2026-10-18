import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { mainResourceVariables, serviceSleepPolicy } from './cloud-resource-policy.mjs';

const profiles = JSON.parse(readFileSync(new URL('./cloud-environments.json', import.meta.url)));
const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) throw new Error('Choose staging or production');
const profile = profiles[environment];
const cors = `${profile.webUrl},${profile.mobileUrl}`;
const configurations = {
  'flownote-main': {
    CORS_ORIGINS: cors, MOBILE_CORE_API_URL: profile.apiUrl, MOBILE_AI_API_URL: profile.apiUrl,
    MOBILE_WEB_URL: profile.webUrl,
    ...mainResourceVariables(environment),
  },
  'flownote-api': {
    PORT: '8080', CORS_ORIGINS: cors,
    CORE_API_BASE_URL: 'http://${{flownote-main.RAILWAY_PRIVATE_DOMAIN}}:8080',
    CANVAS_API_BASE_URL: 'http://${{flownote-canvas.RAILWAY_PRIVATE_DOMAIN}}:8080',
    AI_API_BASE_URL: 'http://${{flownote-ai.RAILWAY_PRIVATE_DOMAIN}}:8000',
    SERVE_API_BASE_URL: 'http://${{flownote-sub.RAILWAY_PRIVATE_DOMAIN}}:8095',
  },
  'flownote-canvas': { PORT: '8080', CORS_ORIGINS: cors },
  'flownote-sub': { PORT: '8095', CORS_ORIGINS: cors,
    STOCK_MARKET_DATA_URL: 'http://${{flownote-api.RAILWAY_PRIVATE_DOMAIN}}:8080/api/market' },
  'flownote-ai': { PORT: '8000', CORS_ORIGINS: cors,
    CORE_API_BASE_URL: 'http://${{flownote-api.RAILWAY_PRIVATE_DOMAIN}}:8080' },
  [profile.mobileService]: { PORT: '8080', EXPO_PUBLIC_WAS_URL: profile.apiUrl },
  [profile.expoService]: { PORT: '8080', EXPO_PUBLIC_WAS_URL: profile.apiUrl },
};
for (const [service, variables] of Object.entries(configurations)) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = spawnSync('railway', ['variable', 'set', '--project', profiles.projectId,
    '--environment', profile.environmentId, '--service', service, '--skip-deploys',
    ...Object.entries(variables).map(([key, value]) => `${key}=${value}`)], {
    stdio: 'inherit', env: { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.2.1',
      RAILWAY_AGENT_SESSION: process.env.RAILWAY_AGENT_SESSION ?? 'flownote-cloud-20260907' },
    });
    if (result.status === 0) break;
    // Reapplying these public key/value settings is idempotent; no deploy is triggered.
    await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
  }
  if (result.status !== 0) throw new Error(`Configuration failed: ${environment}/${service}`);
  console.log(`${environment}/${service}: cloud endpoints configured (deployment pending)`);
}

const sleepPolicy = serviceSleepPolicy(environment);
const sleepTargets = {
  ...sleepPolicy,
  [profile.mobileService]: sleepPolicy.mobile,
  [profile.expoService]: sleepPolicy.expo,
};
delete sleepTargets.mobile;
delete sleepTargets.expo;

for (const [service, enabled] of Object.entries(sleepTargets)) {
  const result = spawnSync('railway', [
    'environment', 'edit', '--project', profiles.projectId, '--environment', profile.environmentId,
    '--service-config', service, 'deploy.sleepApplication', String(enabled),
  ], {
    stdio: 'inherit', env: { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.2.1',
      RAILWAY_AGENT_SESSION: process.env.RAILWAY_AGENT_SESSION ?? 'flownote-cloud-20260907' },
  });
  if (result.status !== 0) throw new Error(`Serverless policy failed: ${environment}/${service}`);
  console.log(`${environment}/${service}: serverless=${enabled} (next deployment)`);
}
