import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

if (process.env.CI !== 'true') throw new Error('Virtual scene fixtures may only be configured in CI.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Android SDK path is missing.');
const path = join(sdk, 'emulator', 'resources', 'Toren1BD.posters');
const original = await readFile(path, 'utf8');
if (!original.includes('poster wall') || !original.includes('poster table')) throw new Error('Unexpected emulator virtual scene layout.');
// Keep the entire code on the wall above the scene's physical table.
await writeFile(path, 'poster wall\nsize 1.2 1.2\nposition -0.807 0.820 5.316\nrotation 0 -150 0\ndefault poster.png\n\nposter table\nsize 1 1\nposition -2.205 -0.077 3.949\nrotation -90 0 120\n');
console.log('CI QR wall fixture placed above furniture before emulator startup.');
