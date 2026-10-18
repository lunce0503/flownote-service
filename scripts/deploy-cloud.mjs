import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { allDeploymentTargets } from './cloud-resource-policy.mjs';
import { sourceFingerprint } from '../automation/codex/lib/source-snapshot.mjs';

const controlRoot = fileURLToPath(new URL('../', import.meta.url));
const root = process.env.FLOWNOTE_RELEASE_SOURCE_ROOT ? path.resolve(process.env.FLOWNOTE_RELEASE_SOURCE_ROOT) : controlRoot;
const profiles = JSON.parse(readFileSync(new URL('./cloud-environments.json', import.meta.url)));
const mode = process.argv[2] ?? 'release';
const target = process.argv[3] ?? 'all';
const services = { main: ['flownote-main', 'flownote-server'], canvas: ['flownote-canvas', 'flownote-canvas'],
  serve: ['flownote-sub', 'flownote-serve'], ai: ['flownote-ai', 'flownote-ai'], api: ['flownote-api', 'flownote-API'],
  mobile: [null, 'flownote-mobile'], expo: [null, 'flownote-mobile'], web: [null, 'flownote'] };
if (!['release', 'staging', 'production'].includes(mode) || (target !== 'all' && target !== 'feedback' && target !== 'feedback-auto' && !services[target])) {
  throw new Error('Usage: node scripts/deploy-cloud.mjs [release|staging|production] [all|feedback|web|api|main|canvas|serve|ai|mobile|expo]');
}
const targets = target === 'feedback-auto' ? (process.env.FLOWNOTE_RELEASE_TARGETS ?? '').split(',')
  : target === 'all' ? allDeploymentTargets : target === 'feedback' ? ['main', 'web'] : [target];
if (target === 'feedback-auto' && (targets.length === 0 || targets.some(name => !allDeploymentTargets.includes(name)) || !targets.includes('web') || new Set(targets).size !== targets.length)) {
  throw new Error('Automatic feedback release requires explicit unique active targets including web.');
}
function checkSourceGuard() {
  if (process.env.FLOWNOTE_RELEASE_GUARD_ROOT && sourceFingerprint(process.env.FLOWNOTE_RELEASE_GUARD_ROOT) !== process.env.FLOWNOTE_RELEASE_GUARD_FINGERPRINT) {
    throw new Error('Development source changed during feedback release. Production is blocked.');
  }
}
const env = { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.2.1',
  RAILWAY_AGENT_SESSION: process.env.RAILWAY_AGENT_SESSION ?? `flownote-cloud-${Date.now()}` };
const receiptPath = path.join(root, '.release', `staging-${target}.json`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: options.capture ? 'pipe' : 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? result.error ?? ''}`);
  return result.stdout?.trim();
}
async function runWithRetry(command, args, options = {}, attempts = 4) {
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return run(command, args, options);
    } catch (error) {
      failure = error;
      if (attempt < attempts) await wait(attempt * 2000);
    }
  }
  throw failure;
}
function fingerprint() {
  const files = run('git', ['ls-files', '-co', '--exclude-standard', '-z'], { capture: true }).split('\0');
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    if (!file || !existsSync(path.join(root, file)) || /^(logs|docs|\.release)\//.test(file) || file.endsWith('.md')) continue;
    hash.update(file).update(readFileSync(path.join(root, file)));
  }
  return hash.digest('hex');
}
const revision = fingerprint();
const message = process.env.RELEASE_MESSAGE ?? `Cloud-only release ${revision.slice(0, 12)}`;
async function deployRailway(name, source, environment) {
  const args = ['--service', name, '--environment', profiles[environment].environmentId];
  const result = JSON.parse(await runWithRetry('railway', ['up', path.join(root, source), '--path-as-root', '--project', profiles.projectId,
    ...args, '--detach', '--json', '--message', message], { capture: true }));
  const id = result.deploymentId;
  if (!id) throw new Error('Railway did not return a deployment ID');
  console.log(`${environment} ${name}: ${id}`);
  for (let attempt = 0; attempt < 180; attempt++) {
    const rows = JSON.parse(await runWithRetry('railway', ['deployment', 'list', ...args, '--limit', '30', '--json'], { capture: true }));
    const deployment = rows.find(row => row.id === id);
    if (deployment?.status === 'SUCCESS') return { service: name, id, status: 'SUCCESS' };
    if (['FAILED', 'CRASHED', 'REMOVED'].includes(deployment?.status)) throw new Error(`${name} ${id}: ${deployment.status}`);
    await wait(10000);
  }
  throw new Error(`Still awaiting ${name} ${id}; inspect this deployment, do not start another one.`);
}
function deployWeb(environment) {
  const profile = profiles[environment];
  const cliEnv = { ...env, VERCEL_ORG_ID: profiles.vercelOrgId, VERCEL_PROJECT_ID: profile.vercelProjectId };
  const args = ['deploy', '--prod', '--yes', '--json', '--project', profile.vercelProjectId];
  args.push('--build-env', 'VITE_ALLOW_ANONYMOUS=false');
  for (const key of ['VITE_API_BASE_URL', 'VITE_API_BASE_URL2', 'VITE_CORE_API_URL', 'VITE_AI_BASE_URL',
    'VITE_CANVAS_API_URL', 'VITE_CANVAS_SOCKET_URL', 'VITE_UPLOAD_API_URL']) args.push('--build-env', `${key}=${profile.apiUrl}`);
  const output = run('vercel', args, { cwd: path.join(root, 'flownote'), env: cliEnv, capture: true });
  const response = JSON.parse(output);
  const deployment = response.deployment ?? response;
  const url = deployment.url ?? deployment.deploymentUrl;
  if (!url) throw new Error('Vercel did not return a deployment URL');
  console.log(`${environment} web: ${url}`);
  return { service: 'web', id: deployment.id, url, status: deployment.readyState ?? response.status };
}
async function waitForWebAssets(webUrl) {
  let failure = 'no asset manifest found';
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const htmlResponse = await fetch(webUrl, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!htmlResponse.ok) throw new Error(`HTML returned ${htmlResponse.status}`);
      const html = await htmlResponse.text();
      const paths = [...new Set([...html.matchAll(/(?:src|href)="([^"?]*\/assets\/[^"?]+)"/g)].map(match => match[1]))];
      if (paths.length === 0) throw new Error('HTML did not reference build assets');
      const assets = await Promise.all(paths.map(assetPath => fetch(new URL(assetPath, webUrl), {
        cache: 'no-store', signal: AbortSignal.timeout(30000),
      })));
      const unavailable = assets.findIndex(response => !response.ok);
      if (unavailable >= 0) throw new Error(`${paths[unavailable]} returned ${assets[unavailable].status}`);
      if (!paths.some(assetPath => assetPath.endsWith('.css'))) throw new Error('HTML did not reference a stylesheet');
      return;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      if (attempt < 8) await wait(attempt * 1000);
    }
  }
  throw new Error(`${webUrl}: Vercel assets did not become ready: ${failure}`);
}
async function fetchExpectedStatus(url, expectedStatus) {
  let failure = 'request was not attempted';
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (response.status === expectedStatus) return response;
      failure = `expected ${expectedStatus}, got ${response.status}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 8) await wait(attempt * 1000);
  }
  throw new Error(`${url}: ${failure}`);
}
async function smoke(environment) {
  const profile = profiles[environment];
  await waitForWebAssets(profile.webUrl);
  const checks = [[profile.apiUrl, 200], [profile.webUrl, 200],
    [`${profile.apiUrl}/api/users/me`, 401], [`${profile.apiUrl}/api/mobile/config`, 200]];
  if (target === 'mobile') checks.push([`${profile.mobileUrl}/health`, 200]);
  for (const [url, status] of checks) {
    const response = await fetchExpectedStatus(url, status);
    if (url.endsWith('/api/mobile/config')) {
      const config = await response.json();
      if ((config.core_api_url ?? config.coreApiUrl) !== profile.apiUrl || (config.web_url ?? config.webUrl) !== profile.webUrl) {
        throw new Error(`${environment}: mobile configuration points at another environment`);
      }
    }
  }
  if (target === 'expo') {
    const manifest = await fetch(profile.expoUrl, { headers: { 'expo-platform': 'ios', Accept: 'application/expo+json' }, signal: AbortSignal.timeout(60000) });
    if (manifest.status !== 200) throw new Error(`${environment}: Expo Go manifest unavailable`);
    const data = await manifest.json();
    if (!data.launchAsset?.url?.startsWith(profile.expoUrl)) throw new Error(`${environment}: Expo bundle is not hosted in the selected cloud environment`);
  }
}
async function deploy(environment) {
  run('node', [path.join(controlRoot, 'scripts/configure-cloud.mjs'), environment]);
  const results = [];
  for (const selected of targets) {
    const [name, source] = services[selected];
    results.push(selected === 'web' ? deployWeb(environment)
      : await deployRailway(name ?? (selected === 'expo' ? profiles[environment].expoService : profiles[environment].mobileService), source, environment));
  }
  await smoke(environment);
  return results;
}

run('node', [path.join(controlRoot, 'scripts/check-cloud-config.mjs')]);
const context = JSON.parse(run('railway', ['status', '--json'], { capture: true, cwd: controlRoot }));
if (context.id !== profiles.projectId) throw new Error('Railway project context does not match the cloud profiles.');
if (mode !== 'production') {
  const results = await deploy('staging');
  // Browser tests exercise cloud staging, never a local application or production DB.
  if (process.env.CI) run('yarn', ['e2e', '--retries=0'], { cwd: path.join(root, 'flownote') });
  else run('docker', ['run', '--rm', '-v', `${root}:/work`, '-w', '/work/flownote', '-e', 'CI=true',
    'mcr.microsoft.com/playwright:v1.62.1-noble', 'yarn', 'e2e', '--retries=0']);
  if (revision !== fingerprint()) throw new Error('Source changed while staging was being verified. Production is blocked.');
  checkSourceGuard();
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify({ revision, target, verifiedAt: new Date().toISOString(), results }, null, 2));
  console.log('Staging deployment and cloud browser tests passed.');
}
if (mode !== 'staging') {
  const receipt = JSON.parse(readFileSync(receiptPath));
  if (receipt.revision !== revision || receipt.target !== target || Date.now() - Date.parse(receipt.verifiedAt) > 86400000) {
    throw new Error('Production requires a matching staging verification from the last 24 hours.');
  }
  await smoke('staging');
  checkSourceGuard();
  const results = await deploy('production');
  writeFileSync(path.join(root, '.release', `production-${target}.json`), JSON.stringify({ revision, results, deployedAt: new Date().toISOString() }, null, 2));
  console.log('Production deployment and smoke checks passed.');
}
