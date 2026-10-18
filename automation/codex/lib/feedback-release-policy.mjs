import path from 'node:path';

export function snapshotFileAllowed(file) {
  const parts = file.split('/');
  return !parts.some(part => /^\.env(?:\.|$)/.test(part) || ['.git', '.vercel', '.venv', 'node_modules', 'build', 'dist', '.gradle', '__pycache__', 'uploads', 'DB', '.release'].includes(part)) &&
    !/(?:^|\/)(?:auth\.json|credentials[^/]*|[^/]+\.(?:key|pem|p12))$/.test(file);
}

const targets = ['main', 'canvas', 'serve', 'api', 'web'];
export function checkChanges(changes) {
  if (changes.length > 60) throw new Error('Change exceeds the 60-file automatic release limit.');
  const selected = new Set(['web']);
  let code = false, tests = false;
  for (const change of changes) {
    const file = change.path;
    if (path.posix.normalize(file) !== file || path.posix.isAbsolute(file) || file.split('/').includes('..') || !snapshotFileAllowed(file)) throw new Error('Unsafe candidate path.');
    if (!['100644', '100755'].includes(change.mode) || change.status !== 'A' && change.status !== 'M') throw new Error('Deletion, rename, or symbolic link requires human review.');
    if (/\/(?:auth|security|db\/migration)\//i.test(file) || file.startsWith('flownote/src/features/auth/')) throw new Error('Authentication, authorization or migration change requires human review.');
    if (/^docs\/(?:product-specs|design-docs)\/.+\.md$/.test(file) || /^docs\/(?:PRODUCT_SENSE|FRONTEND|DESIGN|README)\.md$/.test(file) || /^logs\/(?:report|bugs)\/.+\.md$/.test(file)) continue;
    const rules = [
      ['web', /^flownote\/src\/.+\.(?:tsx?|jsx?|mjs|css)$/],
      ['web', /^flownote\/e2e-cloud\/.+\.spec\.ts$/],
      ['main', /^flownote-server\/src\/(?:main|test)\/java\/.+\.java$/],
      ['canvas', /^flownote-canvas\/(?:internal|tests)\/.+\.go$/],
      ['serve', /^flownote-serve\/(?:internal|tests)\/.+\.go$/],
      ['api', /^flownote-API\/(?:app|tests)\/.+\.py$/],
    ];
    const matched = rules.find(([, rule]) => rule.test(file));
    if (!matched) throw new Error(`Protected control/build/configuration file: ${file}`);
    if (file.startsWith('flownote/e2e-cloud/') && change.status !== 'A') throw new Error('Baseline cloud tests cannot be weakened.');
    selected.add(matched[0]);
    if (/\.test\.|\.spec\.|_test\.go$|\/tests?\//.test(file)) tests = true;
    else code = true;
  }
  if (code && !tests) throw new Error('Code change requires regression coverage.');
  return targets.filter(target => selected.has(target));
}

export function releaseDecision(result, hasChanges) {
  if (result.status !== 'completed' || result.deployment_performed !== false) throw new Error('Model requested review or claimed an unauthorized deployment.');
  return hasChanges ? 'release' : 'no_change';
}

export async function runGates(validate, review, guard, release, adopt) {
  await validate(); await review(); await guard(); await release(); await adopt();
}

export async function runRepairGates(maxRepairs, validate, review, repair) {
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try { await validate(); }
    catch (error) {
      if (error.noRepair || attempt === maxRepairs) throw error;
      await repair({ stage: 'validation', error: error.message, attempt: attempt + 1 });
      continue;
    }
    const result = await review();
    if (result.deployment_performed === true || result.changed_files?.length) throw new Error('Reviewer reported unauthorized mutations.');
    if (result.status === 'completed' && !result.findings.some(finding => ['critical', 'high', 'medium'].includes(finding.severity))) return;
    const requiresHuman = result.findings.length === 0 || result.findings.some(finding => ['critical', 'high'].includes(finding.severity) ||
      /auth|credential|migration|ambig|clarif|product (?:decision|policy)|권한|마이그레이션|모호|비밀값/i.test(`${finding.title} ${finding.evidence} ${finding.recommended_action}`));
    if (requiresHuman || attempt === maxRepairs) throw new Error('Independent review requires human attention; automatic repair stopped.');
    await repair({ stage: 'independent-review', review: result, attempt: attempt + 1 });
  }
}
