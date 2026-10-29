import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Source snapshots may omit dependencies; ordinary worktrees may use a host symlink.
// Resolve either layout before mounting it over /work/flownote/node_modules in Docker.
export function releaseDependencies(sourceRoot, controlRoot) {
  const candidate = path.join(sourceRoot, 'flownote/node_modules');
  return realpathSync(existsSync(candidate) ? candidate : path.join(controlRoot, 'flownote/node_modules'));
}
