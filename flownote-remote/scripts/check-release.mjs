import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const props = readFileSync(path.join(root, 'Directory.Build.props'), 'utf8');
const version = props.match(/<Version>([0-9]+\.[0-9]+\.[0-9]+)<\/Version>/)?.[1];
const android = readFileSync(path.join(root, 'android/app/build.gradle.kts'), 'utf8');
if (!version || android.match(/versionName = "([^"]+)"/)?.[1] !== version)
  throw new Error('Windows and Android release versions must match');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error('Release tag must match the source version');
if (!existsSync(path.join(root, `release-notes/v${version}.md`)))
  throw new Error('Release notes are missing');
console.log(version);
