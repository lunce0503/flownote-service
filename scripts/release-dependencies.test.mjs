import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { releaseDependencies } from './release-dependencies.mjs';

test('a same-root worktree mounts the target of its dependency symlink', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'flownote-release-deps-'));
  try {
    const source = path.join(temp, 'worktree'), installed = path.join(temp, 'installed');
    mkdirSync(path.join(source, 'flownote'), { recursive: true }); mkdirSync(installed);
    symlinkSync(installed, path.join(source, 'flownote/node_modules'), 'dir');
    assert.equal(releaseDependencies(source, source), installed);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('a dependency-free source snapshot retains the trusted control dependency fallback', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'flownote-release-deps-'));
  try {
    const source = path.join(temp, 'snapshot'), control = path.join(temp, 'control');
    mkdirSync(source); mkdirSync(path.join(control, 'flownote/node_modules'), { recursive: true });
    assert.equal(releaseDependencies(source, control), path.join(control, 'flownote/node_modules'));
    mkdirSync(path.join(source, 'flownote/node_modules'), { recursive: true });
    assert.equal(releaseDependencies(source, control), path.join(source, 'flownote/node_modules'));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
