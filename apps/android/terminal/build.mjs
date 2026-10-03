import { cp, mkdir } from 'node:fs/promises';
const target = new URL('../app/src/main/assets/terminal/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [source, name] of [
  ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['@xterm/xterm/LICENSE', 'LICENSE-xterm'],
  ['@xterm/addon-fit/LICENSE', 'LICENSE-addon-fit'],
]) await cp(new URL(`node_modules/${source}`, import.meta.url), new URL(name, target));
