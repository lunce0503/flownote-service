const { strict: assert } = require('node:assert');
const { mkdtemp, writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { UpdateClient } = require('../updater.cjs');
(async () => {
  // Public staging only; signature + exact release URL remain enforced.
  for (const kind of ['installer', 'portable']) {
    const directory = await mkdtemp(path.join(os.tmpdir(), `flownote-${kind}-update-`));
    let requests = 0;
    const fetcher = (url, options) => { if (!url.endsWith('.json')) requests++; return fetch(url, options); };
    const options = { directory, channel: 'staging', version: '1.0.0', kind, fetcher };
    const client = new UpdateClient(options);
    await Promise.all([client.check(), client.check()]);
    assert.equal(client.state.status, 'ready', client.state.error);
    await client.verifyReady(); const firstRequests = requests;
    await new UpdateClient(options).check(); assert.equal(requests, firstRequests, 'A verified cached release must not be downloaded twice');
    const current = new UpdateClient({ ...options, version: client.state.version });
    await current.check(); assert.equal(current.state.status, 'current'); assert.equal(requests, firstRequests);
    await writeFile(path.join(directory, 'draft-preservation-probe.txt'), 'keep');
    await client.check(); assert.equal(await readFile(path.join(directory, 'draft-preservation-probe.txt'), 'utf8'), 'keep');
    console.log(`PASS Windows ${kind}: signed cloud feed, actual artifact download, SHA-256, cached restart, duplicate prevention, current-version skip and data preservation`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
