import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import QRCode from '../../host/node_modules/qrcode/lib/index.js';
import { controlSocketPathFor } from '../../host/dist/config.js';
import { sendControlRequest } from '../../host/dist/control.js';

const assets = resolve('apps/android/app/src/androidTest/assets');
const { configDir } = JSON.parse(await readFile(join(assets, 'host-control.json'), 'utf8'));
const invitation = await sendControlRequest(controlSocketPathFor(configDir), { action: 'pair', name: 'QR PC' });
await writeFile(join(assets, 'pairing.json'), JSON.stringify(invitation), { mode: 0o600 });
const png = await QRCode.toBuffer(JSON.stringify(invitation), { width: 1000, margin: 4, errorCorrectionLevel: 'M' });
await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), 'remote-pairing-qr.png'), png, { mode: 0o600 });
await writeFile(join(assets, 'pairing.png'), png, { mode: 0o600 });
console.log('One-time pairing fixture ready; payload is not logged.');
