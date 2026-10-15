import { cp, mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const target = new URL('../app/src/main/assets/terminal/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [source, name] of [
  ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['@xterm/xterm/LICENSE', 'LICENSE-xterm'],
  ['@xterm/addon-fit/LICENSE', 'LICENSE-addon-fit'],
]) await cp(new URL(`node_modules/${source}`, import.meta.url), new URL(name, target));
const editor = new URL('../app/src/main/assets/editor/vendor/', import.meta.url);
await mkdir(editor, { recursive: true });
await build({ entryPoints: [new URL('editor.mjs', import.meta.url).pathname], outfile: new URL('editor.js', editor).pathname,
  bundle: true, format: 'iife', target: ['chrome90'], minify: true, legalComments: 'eof' });
await mkdir(new URL('licenses/', editor), { recursive: true });
const lock = JSON.parse(await readFile(new URL('package-lock.json', import.meta.url), 'utf8'));
for (const [dependency, metadata] of Object.entries(lock.packages)) {
  if (!dependency || metadata.dev || !dependency.startsWith('node_modules/')) continue;
  const name = dependency.slice('node_modules/'.length).replaceAll('/', '-');
  for (const license of ['LICENSE', 'LICENSE.txt']) {
    try { await cp(new URL(`${dependency}/${license}`, import.meta.url), new URL(`licenses/${name}.txt`, editor)); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
