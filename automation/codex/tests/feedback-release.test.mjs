import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { checkChanges, releaseDecision, runGates, runRepairGates, snapshotFileAllowed } from '../lib/feedback-release-policy.mjs';

test('source changes select affected targets and always include web for cloud E2E', () => {
  assert.deepEqual(checkChanges([{ path: 'flownote/src/pages/SettingsPage/index.tsx', status: 'M', mode: '100644' },
    { path: 'flownote/e2e-cloud/new-feedback.spec.ts', status: 'A', mode: '100644' }]), ['web']);
  assert.deepEqual(checkChanges([{ path: 'flownote-server/src/main/java/com/flownote/user/UserService.java', status: 'M', mode: '100644' },
    { path: 'flownote-server/src/test/java/com/flownote/user/NewTest.java', status: 'A', mode: '100644' }]), ['main', 'web']);
});
test('required product-owner documents can accompany a verified feature', () => {
  assert.deepEqual(checkChanges([{ path: 'docs/PRODUCT_SENSE.md', status: 'M', mode: '100644' },
    { path: 'docs/product-specs/canvas-pdf-reader.md', status: 'A', mode: '100644' }]), ['web']);
});

for (const path of ['automation/codex/bin/flownote-codex-run', 'scripts/deploy-cloud.mjs', '.github/workflows/x.yml',
  'AGENTS.md', 'flownote/package.json', 'flownote/vite.config.ts', 'flownote/playwright.config.ts',
  'flownote-server/src/main/resources/db/migration/V99.sql', 'flownote-server/src/main/java/com/flownote/auth/AuthService.java',
  'flownote/src/features/auth/model/AuthContext.tsx', '../escape.ts', '/tmp/escape.ts', 'flownote/src/../../scripts/a.ts']) {
  test(`protected path is rejected: ${path}`, () => assert.throws(() => checkChanges([{ path, status: 'M', mode: '100644' }])));
}
test('symlinks and modified baseline browser tests cannot pass', () => {
  assert.throws(() => checkChanges([{ path: 'flownote/src/a.ts', status: 'A', mode: '120000' }]));
  assert.throws(() => checkChanges([{ path: 'flownote/e2e-cloud/cloud.spec.ts', status: 'M', mode: '100644' }]));
});
test('code changes require regression coverage', () => assert.throws(() => checkChanges([
  { path: 'flownote/src/a.ts', status: 'M', mode: '100644' }])));
test('only completed, non-deploying model output can advance', () => {
  assert.equal(releaseDecision({ status: 'completed', deployment_performed: false }, true), 'release');
  assert.equal(releaseDecision({ status: 'completed', deployment_performed: false }, false), 'no_change');
  assert.throws(() => releaseDecision({ status: 'action_required', deployment_performed: false }, true));
  assert.throws(() => releaseDecision({ status: 'completed', deployment_performed: true }, true));
});
test('validation, review and source guard must all precede release', async () => {
  const calls = [];
  await runGates(...['validate', 'review', 'guard', 'release', 'adopt'].map(name => async () => calls.push(name)));
  assert.deepEqual(calls, ['validate', 'review', 'guard', 'release', 'adopt']);
});
for (const failing of ['validate', 'review', 'guard']) {
  test(`${failing} failure prevents any deployment or adoption`, async () => {
    const calls = [];
    await assert.rejects(runGates(...['validate', 'review', 'guard', 'release', 'adopt'].map(name => async () => {
      calls.push(name); if (name === failing) throw new Error('blocked');
    })));
    assert.ok(!calls.includes('release')); assert.ok(!calls.includes('adopt'));
  });
}
test('release failure prevents source adoption', async () => {
  let adopted = false;
  await assert.rejects(runGates(async () => {}, async () => {}, async () => {}, async () => { throw new Error('cloud failure'); }, async () => { adopted = true; }));
  assert.equal(adopted, false);
});
test('snapshots exclude secrets, generated assets and links to credentials', () => {
  for (const path of ['.env', 'flownote/.env.production', 'auth.json', 'a/private.key', 'x/node_modules/a.js', 'x/.venv/a.py', 'uploads/a.pdf', '.git/config']) assert.equal(snapshotFileAllowed(path), false, path);
  assert.equal(snapshotFileAllowed('flownote/src/a.ts'), true);
  assert.equal(snapshotFileAllowed('AGENTS.md'), true);
});
test('snapshot generation works with the systemd PATH and no host rg dependency', () => {
  const script = `import {sourceFiles,sourceFingerprint} from './automation/codex/lib/source-snapshot.mjs'; console.log(JSON.stringify({count:sourceFiles(process.cwd()).length,hash:sourceFingerprint(process.cwd())}));`;
  const data = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../../../', import.meta.url), encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' },
  }));
  assert.ok(data.count > 0); assert.match(data.hash, /^[a-f0-9]{64}$/);
});
test('technical validation failures get bounded repair and full revalidation', async () => {
  let checked = 0, repaired = 0, reviewed = 0;
  await runRepairGates(2, async () => { if (++checked === 1) throw new Error('lint'); },
    async () => { reviewed++; return { status: 'completed', findings: [] }; }, async () => { repaired++; });
  assert.deepEqual([checked, repaired, reviewed], [2, 1, 1]);
});
test('technical medium review findings can be fixed but must be reviewed again', async () => {
  let reviewed = 0, repaired = 0;
  await runRepairGates(2, async () => {}, async () => ++reviewed === 1 ? {
    status: 'action_required', findings: [{ severity: 'medium', title: 'Mobile overflow', evidence: 'panel.tsx', recommended_action: 'Fix layout' }],
  } : { status: 'completed', findings: [] }, async () => { repaired++; });
  assert.deepEqual([reviewed, repaired], [2, 1]);
});
test('high risk review does not enter automated repair or release', async () => {
  let repairs = 0;
  await assert.rejects(runRepairGates(2, async () => {}, async () => ({ status: 'action_required', findings: [{ severity: 'high', title: 'Authorization bypass' }] }), async () => { repairs++; }));
  assert.equal(repairs, 0);
});
test('ambiguous product policy requires human review', async () => {
  let repairs = 0;
  await assert.rejects(runRepairGates(2, async () => {}, async () => ({ status: 'action_required', findings: [{ severity: 'medium', title: 'Clarify product policy' }] }), async () => { repairs++; }));
  assert.equal(repairs, 0);
});
test('repair limit stops repeated failures', async () => {
  let repairs = 0;
  await assert.rejects(runRepairGates(2, async () => { throw new Error('still failing'); }, async () => {}, async () => { repairs++; }));
  assert.equal(repairs, 2);
});
test('a validation-time source mutation is not automatically repaired', async () => {
  let repairs = 0;
  await assert.rejects(runRepairGates(2, async () => { const error = new Error('source mutation'); error.noRepair = true; throw error; }, async () => {}, async () => { repairs++; }));
  assert.equal(repairs, 0);
});
test('reviewer mutation claims cannot pass gates', async () => {
  let repairs = 0;
  await assert.rejects(runRepairGates(2, async () => {}, async () => ({ status: 'completed', findings: [], deployment_performed: true }), async () => { repairs++; }));
  assert.equal(repairs, 0);
});
