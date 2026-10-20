const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const { mkdtemp, readFile, writeFile, readdir } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { compareVersions, validateManifest, verifyEnvelope, UpdateClient } = require('../updater.cjs');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const bytes = Buffer.from('verified installation test bytes');
const artifact = kind => ({ url: `https://github.com/lunce0503/flownote-service/releases/download/windows-v1.1.0/Flownote-${kind === 'installer' ? 'Setup' : 'Portable'}-1.1.0-x64.${kind === 'installer' ? 'exe' : 'zip'}`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
const manifest = (overrides = {}) => ({ schema: 1, platform: 'windows', channel: 'production', version: '1.1.0', notes: ['Automatic verified updates'], artifacts: { installer: artifact('installer'), portable: artifact('portable') }, ...overrides });
function envelope(value) { const payload = Buffer.from(JSON.stringify(value)); return JSON.stringify({ payload: payload.toString('base64'), signature: sign('sha256', payload, privateKey).toString('base64') }); }
test('numeric versions prevent same-version and downgrade updates, including malformed releases', () => {
  assert(compareVersions('1.10.0', '1.9.9') > 0);
  assert.equal(compareVersions('1.1.0', '1.1.0'), 0);
  assert(compareVersions('1.0.9', '1.1.0') < 0);
  for (const version of ['1.1.0-beta', '../1.1.0', '01.1.0', '99999999999999999999.0.0']) assert.throws(() => compareVersions(version, '1.0.0'));
});
test('manifest signatures, channel, platform and exact GitHub artifact paths are mandatory', () => {
  assert.equal(verifyEnvelope(envelope(manifest()), 'production', publicKey).version, '1.1.0');
  const changed = JSON.parse(envelope(manifest())); changed.payload = Buffer.from(JSON.stringify(manifest({ version: '9.0.0' }))).toString('base64');
  assert.throws(() => verifyEnvelope(JSON.stringify(changed), 'production', publicKey));
  for (const fields of [{ channel: 'staging' }, { platform: 'android' }, { version: '../x' }, { artifacts: { installer: { ...artifact('installer'), url: 'https://evil.example/x.exe' } } }]) assert.throws(() => validateManifest(manifest(fields), 'production'));
  const bad = manifest(); bad.artifacts.installer.url = bad.artifacts.installer.url.replace('github.com/', 'github.com@evil.example/');
  assert.throws(() => validateManifest(bad, 'production'));
});
test('downloads are verified, atomic, single-flight and cached across restarts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flownote-update-test-'));
  let downloads = 0;
  const fetcher = async url => url.endsWith('.json') ? new Response(envelope(manifest())) : (downloads++, new Response(bytes));
  const options = { directory, channel: 'production', version: '1.0.0', kind: 'installer', publicKey, fetcher };
  const client = new UpdateClient(options);
  await Promise.all([client.check(), client.check(), client.check()]);
  assert.equal(client.state.status, 'ready'); assert.equal(downloads, 1);
  assert.deepEqual(await readFile(client.state.file), bytes);
  await new UpdateClient(options).check(); assert.equal(downloads, 1);
  await new UpdateClient({ ...options, version: '1.1.0' }).check(); assert.equal(downloads, 1);
  await writeFile(client.state.file, 'tampered');
  await new UpdateClient(options).check(); assert.equal(downloads, 2);
  assert(!(await readdir(directory)).some(name => name.endsWith('.part')));
});
test('bad hashes and interrupted downloads fail closed and a later check retries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flownote-update-test-'));
  let fail = true;
  const fetcher = async url => url.endsWith('.json') ? new Response(envelope(manifest())) : new Response(fail ? Buffer.from('invalid') : bytes);
  const client = new UpdateClient({ directory, channel: 'production', version: '1.0.0', kind: 'portable', publicKey, fetcher });
  await client.check(); assert.equal(client.state.status, 'error'); assert(!client.state.file);
  fail = false; await client.check(); assert.equal(client.state.status, 'ready');
  await client.verifyReady();
  await writeFile(client.state.file, 'changed after download');
  await assert.rejects(() => client.verifyReady());
});
test('an observed newer version cannot be replaced by an older signed feed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flownote-update-test-'));
  await writeFile(path.join(directory, 'highest.json'), JSON.stringify({ version: '1.2.0' }));
  let downloads = 0;
  const fetcher = async url => { if (url.endsWith('.json')) return new Response(envelope(manifest())); downloads++; return new Response(bytes); };
  const client = new UpdateClient({ directory, channel: 'production', version: '1.0.0', kind: 'installer', publicKey, fetcher });
  await client.check(); assert.equal(client.state.status, 'error'); assert.equal(downloads, 0);
});
test('HTTP downgrade, unknown hosts and oversized streams never produce an installable file', async () => {
  for (const location of ['http://github.com/file', 'https://evil.example/a.exe', 'https://github.com@evil.example/a.exe', 'https://github.com:444/a.exe']) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'flownote-update-test-'));
    const fetcher = async url => url.endsWith('.json') ? new Response(envelope(manifest())) : new Response(null, { status: 302, headers: { location } });
    const client = new UpdateClient({ directory, channel: 'production', version: '1.0.0', kind: 'installer', publicKey, fetcher });
    await client.check(); assert.equal(client.state.status, 'error'); assert(!client.state.file);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'flownote-update-test-'));
  const fetcher = async url => url.endsWith('.json') ? new Response(envelope(manifest())) : new Response(Buffer.concat([bytes, bytes]));
  const client = new UpdateClient({ directory, channel: 'production', version: '1.0.0', kind: 'installer', publicKey, fetcher });
  await client.check(); assert.equal(client.state.status, 'error'); assert(!(await readdir(directory)).some(name => name.endsWith('.exe') || name.endsWith('.part')));
});
