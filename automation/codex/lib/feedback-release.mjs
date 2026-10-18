import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, chmodSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChanges, releaseDecision, runGates, runRepairGates } from './feedback-release-policy.mjs';
import { sourceFiles, sourceFingerprint } from './source-snapshot.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const automationRoot = path.join(root, 'automation/codex');
const state = process.env.FLOWNOTE_AUTOMATION_STATE_DIR ?? path.join(process.env.HOME, '.local/state/flownote-codex');
const id = `${new Date().toISOString().replace(/[-:.]/g, '')}-feedback-release-${process.pid}`;
const runDir = path.join(state, 'runs', id);
const snapshot = path.join(runDir, 'source');
mkdirSync(runDir, { recursive: true, mode: 0o700 });
mkdirSync(snapshot, { mode: 0o700 });
const finalPath = path.join(runDir, 'final.json');
const log = path.join(runDir, 'release.log');
const validation = [];
let deployed = false;
let candidateResult;
let lastReview;
let changes = [];
let stage = 'input';
const save = result => { writeFileSync(finalPath, JSON.stringify(result, null, 2), { mode: 0o600 }); };
const env = { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.2.1', RAILWAY_AGENT_SESSION: `flownote-feedback-${id}` };

async function command(binary, args, options = {}) {
  const { rawOutput = false, ...processOptions } = options;
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: snapshot, env, ...processOptions, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let out = '', err = '';
    child.stdout.on('data', data => { out += data; if (out.length > 32 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', data => { err += data; if (err.length > 32 * 1024 * 1024) child.kill(); });
    child.on('error', reject);
    child.on('close', code => {
      writeFileSync(log, `\n${binary} ${args.join(' ')}\n${out}\n${err}`, { flag: 'a', mode: 0o600 });
      if (code !== 0) reject(new Error(`${binary} failed at ${stage} (exit ${code}); inspect release.log.`));
      else resolve(rawOutput ? out : out.trim());
    });
  });
}

async function model(task, input) {
  const output = await command(path.join(automationRoot, 'bin/flownote-codex-run'), [task, input], {
    env: { ...env, FLOWNOTE_AUTOMATION_REPOSITORY: snapshot, FLOWNOTE_AUTOMATION_BASE_REF: 'main', FLOWNOTE_AUTOMATION_SKIP_FETCH: '1', FLOWNOTE_AUTOMATION_RUNTIME: 'container', FLOWNOTE_AUTOMATION_NOTIFY: '0' },
  });
  const dir = /^run_dir=(.+)$/m.exec(output)?.[1];
  if (!dir || !dir.startsWith(`${path.resolve(state)}/runs/`)) throw new Error('Runner did not return a valid result directory.');
  return { dir, result: JSON.parse(readFileSync(path.join(dir, 'final.json'))) };
}

async function validate(targets) {
  const cache = '/work/node_modules/.validation-cache';
  mkdirSync(path.join(snapshot, 'node_modules/.validation-cache'), { recursive: true });
  const testEnv = ['-e', 'CI=true', '-e', 'HOME=/tmp', '-e', `GRADLE_USER_HOME=${cache}/gradle`, '-e', `UV_CACHE_DIR=${cache}/uv`, '-e', `GOCACHE=${cache}/go-cache`, '-e', `GOMODCACHE=${cache}/go-mod`];
  async function container(image, directory, script, network = 'none') {
    await command('docker', ['run', '--rm', '--network', network, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=512', '--memory=4g', '--cpus=2', '--user', `${process.getuid()}:${process.getgid()}`, '-v', `${snapshot}:/work:rw`, '-v', `${automationRoot}/container:/trusted:ro`, '-w', `/work/${directory}`, ...testEnv, image, 'bash', '-euc', script]);
    validation.push({ command: `${directory}: ${network === 'none' ? 'isolated offline build/tests' : 'trusted dependency installation'}`, status: 'passed', notes: 'No host home, Docker socket, cloud auth or .env mounts. Application build/tests run with network=none.' });
  }
  const lintFiles = changes.filter(change => change.path.startsWith('flownote/src/') && /\.[cm]?[jt]sx?$/.test(change.path)).map(change => change.path.slice('flownote/'.length));
  const safeLint = lintFiles.map(file => `'${file.replaceAll("'", "'\\''")}'`).join(' ');
  await container('mcr.microsoft.com/playwright:v1.62.1-noble', 'flownote', 'yarn install --frozen-lockfile --ignore-scripts', 'bridge');
  await container('mcr.microsoft.com/playwright:v1.62.1-noble', 'flownote', `yarn build; ${safeLint ? `yarn eslint ${safeLint};` : ''} tests=$(find src -name '*.test.mjs' -print); if [ -n "$tests" ]; then node --test $tests; fi`);
  if (targets.includes('main')) {
    await container('gradle:8.10-jdk17', 'flownote-server', './gradlew --init-script /trusted/resolve-dependencies.gradle resolveAutomationDependencies --no-daemon', 'bridge');
    await container('gradle:8.10-jdk17', 'flownote-server', './gradlew test --offline --no-daemon');
  }
  for (const [target, directory] of [['canvas', 'flownote-canvas'], ['serve', 'flownote-serve']]) {
    if (targets.includes(target)) {
      await container('golang:1.24-bookworm', directory, 'go mod download', 'bridge');
      await container('golang:1.24-bookworm', directory, 'go test ./...');
    }
  }
  if (targets.includes('api')) {
    await container('ghcr.io/astral-sh/uv:python3.12-bookworm', 'flownote-API', 'uv sync --frozen', 'bridge');
    await container('ghcr.io/astral-sh/uv:python3.12-bookworm', 'flownote-API', 'uv run --offline --frozen pytest');
  }
  if (await command('git', ['status', '--porcelain', '--untracked-files=all'])) {
    const error = new Error('Validation modified candidate source or control files.'); error.noRepair = true; throw error;
  }
}

try {
  const input = process.argv[2];
  if (!input || !lstatSync(input).isFile() || lstatSync(input).isSymbolicLink() || lstatSync(input).size > 1048576) throw new Error('Regular sanitized feedback input is required.');
  const event = JSON.parse(readFileSync(input, 'utf8'));
  if (event.event_type !== 'flownote.user_feedback.created' || typeof event.feedback?.message !== 'string' || event.feedback.message.length > 4000) throw new Error('Invalid feedback event.');
  stage = 'snapshot';
  const fingerprint = sourceFingerprint(root);
  for (const file of sourceFiles(root)) {
    const destination = path.join(snapshot, file);
    if (!lstatSync(path.join(root, file)).isFile()) throw new Error('Symbolic links are not copied into release snapshots.');
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, file), destination);
    chmodSync(destination, lstatSync(path.join(root, file)).mode & 0o777);
  }
  if (sourceFingerprint(root) !== fingerprint) throw new Error('Development source changed during snapshot creation.');
  await command('git', ['init', '--quiet', '--initial-branch=main']);
  await command('git', ['config', 'user.name', 'Flownote Feedback Automation']);
  await command('git', ['config', 'user.email', 'feedback-automation@example.invalid']);
  await command('git', ['add', '-A']);
  for (const file of ['AGENTS.md', '.codex']) if (existsSync(path.join(snapshot, file))) await command('git', ['add', '-f', '--', file]);
  await command('git', ['commit', '--quiet', '-m', 'Isolated source snapshot; original worktree unchanged']);
  const baseCommit = await command('git', ['rev-parse', 'HEAD']);
  stage = 'implementation';
  let implementation;
  if (process.env.FLOWNOTE_FEEDBACK_REUSE_RUN) {
    const previous = realpathSync(process.env.FLOWNOTE_FEEDBACK_REUSE_RUN);
    if (!previous.startsWith(`${realpathSync(path.join(state, 'runs'))}/`) ||
      !/^task=feedback-implement$/m.test(readFileSync(path.join(previous, 'metadata.txt'), 'utf8'))) throw new Error('Only a preserved implementation result can be reused by the operator.');
    implementation = { dir: previous, result: JSON.parse(readFileSync(path.join(previous, 'final.json'))) };
  } else implementation = await model('feedback-implement', input);
  candidateResult = implementation.result;
  let patchPath = path.join(implementation.dir, 'change.patch');
  const patch = readFileSync(patchPath);
  if (patch.length > 524288) throw new Error('Patch exceeds the 512 KiB automatic release limit.');
  if (releaseDecision(candidateResult, patch.length > 0) === 'no_change') {
    save({ ...candidateResult, changed_files: [], deployment_performed: false });
  } else {
    stage = 'policy';
    await command('git', ['apply', '--check', patchPath]);
    await command('git', ['apply', patchPath]);
    await command('git', ['add', '-A']);
    async function inspectCandidate() {
      const rows = (await command('git', ['diff', '--raw', '--no-abbrev', '-z', baseCommit])).split('\0');
      changes = [];
      for (let i = 0; i + 1 < rows.length; i += 2) {
        const match = /^:\d+ (\d+) \w+ \w+ (\w+)$/.exec(rows[i]);
        if (!match) throw new Error('Unrecognized candidate diff.');
        changes.push({ mode: match[1], status: match[2], path: rows[i + 1] });
      }
      const selected = checkChanges(changes);
      for (const change of changes.filter(change => /\.(?:tsx?|jsx?|mjs|py|go|java)$/.test(change.path))) {
        const diff = await command('git', ['diff', '--unified=0', baseCommit, '--', change.path]);
        if (diff.split('\n').some(line => line.startsWith('+') && !line.startsWith('+++') && /eslint-disable|@ts-ignore|@ts-nocheck|\b(?:test|describe|it)\.(?:skip|fixme|only)\s*\(/.test(line))) throw new Error('Candidate weakens validation; human review required.');
      }
      return selected;
    }
    let targets = await inspectCandidate();
    await command('git', ['commit', '--quiet', '-m', 'Candidate feedback implementation (private snapshot only)']);
    const guard = async () => {
      if (sourceFingerprint(root) !== fingerprint) throw new Error('Development source changed; automatic release/adoption blocked.');
    };
    await runGates(
      async () => {
        await runRepairGates(2,
          async () => { stage = 'validation'; await validate(targets); },
          async () => {
            stage = 'independent-review';
            const reviewInput = path.join(runDir, `review-input-${validation.length}.json`);
            writeFileSync(reviewInput, JSON.stringify({ base_commit: baseCommit, feedback: event.feedback, implementation_summary: candidateResult.summary, trusted_validation: validation }), { mode: 0o600 });
            const review = await model('feedback-release-review', reviewInput);
            lastReview = review.result;
            const passed = review.result.status === 'completed' && !review.result.findings.some(finding => ['critical', 'high', 'medium'].includes(finding.severity));
            validation.push({ command: 'Independent read-only release review', status: passed ? 'passed' : 'failed', notes: review.dir });
            return review.result;
          },
          async evidence => {
            stage = 'bounded-repair';
            if (await command('git', ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Candidate changed during validation; repair is blocked.');
            const repairRecord = { command: `Automatic technical repair ${evidence.attempt}/2`, status: 'failed', notes: `Previous gate failed at ${evidence.stage}; every gate will be rerun.` };
            validation.push(repairRecord);
            const repairInput = path.join(runDir, `repair-input-${evidence.attempt}.json`);
            writeFileSync(repairInput, JSON.stringify({ ...event, controller_validation: evidence, trusted_log_excerpt: evidence.stage === 'validation' ? readFileSync(log, 'utf8').slice(-14000) : undefined }), { mode: 0o600 });
            const repaired = await model('feedback-implement', repairInput);
            candidateResult = repaired.result;
            const deltaPath = path.join(repaired.dir, 'change.patch');
            const delta = readFileSync(deltaPath);
            if (releaseDecision(candidateResult, delta.length > 0) !== 'release' || delta.length > 524288) throw new Error('Repair did not produce an acceptable bounded change.');
            await command('git', ['apply', '--check', deltaPath]);
            await command('git', ['apply', deltaPath]);
            await command('git', ['add', '-A']);
            targets = await inspectCandidate();
            await command('git', ['commit', '--quiet', '-m', `Private technical repair ${evidence.attempt}`]);
            repairRecord.status = 'passed'; repairRecord.notes = 'A bounded correction was created. Full validation and whole-diff review must pass separately.';
          });
        const combined = await command('git', ['diff', '--binary', baseCommit, 'HEAD'], { rawOutput: true });
        if (Buffer.byteLength(combined) > 524288) throw new Error('Combined repair patch exceeds the release size limit.');
        patchPath = path.join(runDir, 'accepted.patch');
        writeFileSync(patchPath, combined, { mode: 0o600 });
      }, async () => {}, guard,
      async () => {
        stage = 'staging-first-release';
        const profiles = JSON.parse(readFileSync(path.join(root, 'scripts/cloud-environments.json')));
        const prior = [];
        const names = { main: 'flownote-main', canvas: 'flownote-canvas', serve: 'flownote-sub', api: 'flownote-api' };
        for (const target of targets.filter(target => target !== 'web')) {
          const rows = JSON.parse(await command('railway', ['deployment', 'list', '--service', names[target], '--environment', profiles.production.environmentId, '--limit', '10', '--json'], { cwd: root }));
          const success = rows.find(row => row.status === 'SUCCESS');
          if (!success) throw new Error('No previous successful backend deployment is available for rollback.');
          prior.push({ service: names[target], id: success.id, status: success.status });
        }
        const inspected = JSON.parse(await command('vercel', ['inspect', profiles.production.webUrl, '--json'], { cwd: root }));
        const web = inspected.deployment ?? inspected;
        if (!web.id) throw new Error('Previous web deployment could not be resolved for rollback.');
        prior.push({ service: 'web', id: web.id, url: web.url });
        writeFileSync(path.join(runDir, 'rollback-reference.json'), JSON.stringify({ previous_production: prior, instructions: 'Restore these deployments via docs/DEPLOYMENT.md. Do not delete services or automatically roll back database migrations.' }, null, 2), { mode: 0o600 });
        await command('node', [path.join(root, 'scripts/deploy-cloud.mjs'), 'release', 'feedback-auto'], { env: { ...env, FLOWNOTE_RELEASE_SOURCE_ROOT: snapshot, FLOWNOTE_RELEASE_TARGETS: targets.join(','), FLOWNOTE_RELEASE_GUARD_ROOT: root, FLOWNOTE_RELEASE_GUARD_FINGERPRINT: fingerprint } });
        deployed = true;
        for (const name of ['staging', 'production']) copyFileSync(path.join(snapshot, '.release', `${name}-feedback-auto.json`), path.join(runDir, `${name}-receipt.json`));
        validation.push({ command: 'node scripts/deploy-cloud.mjs release feedback-auto', status: 'passed', notes: 'Staging cloud browser tests, matching source fingerprint, production deploy and smoke checks passed.' });
      },
      async () => {
        stage = 'source-adoption'; await guard();
        await command('git', ['-C', root, 'apply', '--check', patchPath]);
        await command('git', ['-C', root, 'apply', patchPath]);
      },
    );
    save({ ...candidateResult, status: 'completed', validation, changed_files: changes.map(change => change.path), deployment_performed: true,
      summary: `피드백 자동 구현·검증·독립 리뷰와 스테이징→운영 배포 완료. ${candidateResult.summary}` });
  }
} catch (error) {
  if (stage === 'staging-first-release' && existsSync(log)) deployed = /(?:staging|production) (?:web|flownote-[\w-]+): /.test(readFileSync(log, 'utf8'));
  const reason = candidateResult && candidateResult.status !== 'completed' ? candidateResult.summary : error.message;
  save({ status: 'action_required', summary: `피드백 자동 반영이 ${stage} 단계에서 중단되었습니다. ${reason}`, findings: lastReview?.findings?.length ? lastReview.findings : [{ severity: 'high', title: '자동 배포 중단: 검토 필요', evidence: `실행 단계: ${stage}. 상세 기록은 이 실행 디렉터리에 보존됩니다.`, recommended_action: '실패 로그와 구현 후보를 확인하고 원인을 해결한 뒤 명시적으로 재시도하세요. 실패를 성공 처리하거나 검증을 생략하지 마세요.' }], validation, changed_files: changes.map(change => change.path), deployment_performed: deployed });
  process.exitCode = 70;
} finally {
  writeFileSync(path.join(runDir, 'metadata.txt'), `task=feedback-release\nmodel=gpt-6.1-sol\nruntime=trusted-controller\nstage=${stage}\nsource_root=${snapshot}\n`, { mode: 0o600 });
  console.log(`run_dir=${runDir}`);
}
