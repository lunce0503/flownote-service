import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [platform, channel, version, directory, code] = process.argv.slice(2);
if (!['windows', 'android'].includes(platform) || !['staging', 'production'].includes(channel) || !/^\d+\.\d+\.\d+$/.test(version || '') || !directory) throw new Error('Usage: sign-app-update.mjs windows|android staging|production version artifact-directory [android-version-code]');
const root = fileURLToPath(new URL('../', import.meta.url));
const key = createPrivateKey(readFileSync(process.env.FLOWNOTE_UPDATE_SIGNING_KEY));
const pinned = createPublicKey(readFileSync(path.join(root, 'flownote-desktop/update-public.pem'))).export({ type: 'spki', format: 'der' });
if (!pinned.equals(createPublicKey(key).export({ type: 'spki', format: 'der' }))) throw new Error('Signing key does not match the key pinned in the applications');
const notes = ['캔버스·노트의 베이지·흰색·검정 공통 디자인과 폴더 탐색', '시작·재개·주기 확인 후 새 버전 자동 다운로드', '서명·SHA-256 검증, 업데이트 이력·진행·재시도', platform === 'windows' ? '설치형은 확인 후 설치 실행, 포터블은 검증된 ZIP을 직접 압축 해제' : 'APK 자동 다운로드 후 Android 설치 확인 · 기존 자료 보존'];
const manifest = { schema: 1, platform, channel, version, publishedAt: new Date().toISOString(), notes, artifacts: {} };
function artifact(file, url) { const data = readFileSync(path.join(directory, file)); return { url, size: data.length, sha256: createHash('sha256').update(data).digest('hex') }; }
if (platform === 'windows') {
  for (const [kind, label, ext] of [['installer', 'Setup', 'exe'], ['portable', 'Portable', 'zip']]) {
    const name = `Flownote-${label}-${version}-x64.${ext}`;
    manifest.artifacts[kind] = artifact(name, `https://github.com/lunce0503/flownote-service/releases/download/windows-v${version}/${name}`);
  }
} else {
  if (!Number.isSafeInteger(Number(code)) || Number(code) < 1) throw new Error('Android versionCode required');
  manifest.versionCode = Number(code);
  const name = `flownote-${version}${channel === 'staging' ? '-staging' : ''}.apk`;
  const origin = channel === 'staging' ? 'https://flownote-react-staging.vercel.app' : 'https://flownote-react.vercel.app';
  manifest.artifacts.apk = artifact(name, `${origin}/downloads/${name}`);
}
const payload = Buffer.from(JSON.stringify(manifest));
const envelope = { payload: payload.toString('base64'), signature: sign('sha256', payload, key).toString('base64') };
const output = path.join(root, 'flownote/public/updates', channel);
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, `${platform}.json`), JSON.stringify(envelope, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
