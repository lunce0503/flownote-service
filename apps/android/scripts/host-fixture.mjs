import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeHost } from '../../host/dist/config.js';
import { HostServer } from '../../host/dist/server.js';

const configDir = await mkdtemp(join(tmpdir(), 'android-host-test-'));
const fixture = await initializeHost({ configDir, bind: '0.0.0.0', advertisedHost: '10.0.2.2', port: 17443, shell: '/bin/bash', cwd: process.cwd() });
const server = new HostServer({ configDir, config: fixture.config });
await server.start();
const destination = resolve('apps/android/app/src/androidTest/assets');
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'host.json'), JSON.stringify({ name: 'CI Linux PC', endpoint: 'wss://10.0.2.2:17443/v1/connect', token: fixture.token, fingerprint: fixture.fingerprint }), { mode: 0o600 });
console.log('Android integration host ready; ephemeral credentials written to test assets.');
async function stop() { await server.close(); await rm(configDir, { recursive: true, force: true }); process.exit(0); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
