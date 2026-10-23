import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [platform, channel, version, directory, code] = process.argv.slice(2);
if (!['windows', 'android'].includes(platform) || !['staging', 'production'].includes(channel) || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version || '') || !directory) throw new Error('Usage: sign-app-update.mjs windows|android staging|production version artifact-directory [android-version-code]');
const root = fileURLToPath(new URL('../', import.meta.url));
const key = createPrivateKey(readFileSync(process.env.FLOWNOTE_UPDATE_SIGNING_KEY));
const pinned = createPublicKey(readFileSync(path.join(root, 'flownote-desktop/update-public.pem'))).export({ type: 'spki', format: 'der' });
if (!pinned.equals(createPublicKey(key).export({ type: 'spki', format: 'der' }))) throw new Error('Signing key does not match the key pinned in the applications');
const notes = ['동기화 OFF 전 서버 자료·이미지 기기 저장과 오프라인 편집', '동기화 ON 시 기준본 기반 조정·재시도와 충돌 복구본 보존', '시작·재개·주기 확인 후 새 버전 자동 다운로드', '서명·SHA-256 검증, 업데이트 이력·진행·재시도', platform === 'windows' ? '설치형은 확인 후 설치 실행, 포터블은 검증된 ZIP을 직접 압축 해제' : 'APK 자동 다운로드 후 Android 설치 확인 · 기존 자료 보존'];
if (platform === 'windows' && version === '1.1.1') notes.unshift('GitHub 다운로드 주소 전환 중 자동 다운로드가 중단되던 문제 수정');
if (version === '1.3.0' || version === '1.3.1') notes.unshift('전공서 책장: PDF 기기 보관·표지·이어 읽기·책갈피', '원본 PDF 100MiB까지 내보내기 · 책장은 기기별 저장');
const manifest = { schema: 1, platform, channel, version, publishedAt: new Date().toISOString(), notes, artifacts: {} };
// Release assets were built/tested and SHA256SUMS-verified by the Windows job.
// GitHub's upload digest avoids moving two large binaries through this host.
let remoteAssets;
if (platform === 'windows' && directory === '--github-release') {
  const response = await fetch(`https://api.github.com/repos/lunce0503/flownote-service/releases/tags/windows-v${version}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub release: ${response.status}`);
  const release = await response.json();
  if (release.draft || release.prerelease || release.tag_name !== `windows-v${version}`) throw new Error('Expected a published verified release');
  remoteAssets = release.assets;
}
function artifact(file, url) {
  if (remoteAssets) {
    const item = remoteAssets.find(asset => asset.name === file);
    if (!item || item.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(item.digest || '')) throw new Error(`Missing trusted GitHub asset digest: ${file}`);
    return { url, size: item.size, sha256: item.digest.slice(7) };
  }
  const data = readFileSync(path.join(directory, file)); return { url, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
if (platform === 'windows') {
  for (const [kind, label, ext] of [['installer', 'Setup', 'exe'], ['portable', 'Portable', 'zip']]) {
    const name = `Flownote-${label}-${version}-x64.${ext}`;
    manifest.artifacts[kind] = artifact(name, `https://github.com/lunce0503/flownote-service/releases/download/windows-v${version}/${name}`);
  }
} else {
  if (!Number.isSafeInteger(Number(code)) || Number(code) < 1 || Number(code) > 2147483647) throw new Error('Android versionCode required');
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
