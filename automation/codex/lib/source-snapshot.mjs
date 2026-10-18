import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { snapshotFileAllowed } from './feedback-release-policy.mjs';

export function sourceFiles(root) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0');
  if (existsSync(path.join(root, 'AGENTS.md'))) files.push('AGENTS.md');
  function addInstructions(directory) {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) addInstructions(file);
      else files.push(file);
    }
  }
  for (const directory of ['skills', 'rules', 'checklists', 'prompts', 'harness', 'memories']) {
    if (existsSync(path.join(root, `.codex/${directory}`))) addInstructions(`.codex/${directory}`);
  }
  if (existsSync(path.join(root, '.codex/README.md'))) files.push('.codex/README.md');
  return [...new Set(files)].filter(file => file && snapshotFileAllowed(file) && existsSync(path.join(root, file)) &&
    (/^(?:flownote(?:-server|-canvas|-serve|-API)?|scripts|docs|automation)\//.test(file) || /^logs\/(?:report|bugs)\//.test(file) || /^\.codex\/skills\//.test(file) || /^\.codex\/(?:rules|checklists|prompts|harness|memories)\/.+\.md$/.test(file) || file === '.codex/README.md' || !file.includes('/'))).sort();
}

export function sourceFingerprint(root) {
  const hash = createHash('sha256');
  const actualRoot = realpathSync(root);
  for (const file of sourceFiles(root)) {
    const full = path.join(root, file);
    if (!lstatSync(full).isFile() || !realpathSync(full).startsWith(`${actualRoot}/`)) throw new Error('Snapshot contains a non-regular or escaping file.');
    // Reports may be appended while a job runs; they do not change executable source.
    if (/^(?:logs|docs)\//.test(file) || file.endsWith('.md')) continue;
    hash.update(file).update(readFileSync(full));
  }
  return hash.digest('hex');
}
