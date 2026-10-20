import { test, expect } from '@playwright/test';
import { createHash, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { verifyEnvelope } = require('../../flownote-desktop/updater.cjs');
const key = readFileSync(new URL('../../flownote-desktop/update-public.pem', import.meta.url));

test('app update feeds enforce signed platform/channel/artifact contracts', async ({ request }) => {
  for (const channel of ['staging', 'production']) {
    for (const platform of ['windows', 'android']) {
      const response = await request.get(`/updates/${channel}/${platform}.json`);
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['cache-control']).toContain('no-store');
      const envelope = await response.json(); const payload = Buffer.from(envelope.payload, 'base64');
      expect(verify('sha256', payload, key, Buffer.from(envelope.signature, 'base64'))).toBeTruthy();
      const manifest = JSON.parse(payload.toString('utf8'));
      expect(manifest.schema).toBe(1); expect(manifest.platform).toBe(platform); expect(manifest.channel).toBe(channel);
      expect(manifest.version).toBe(platform === 'windows' ? '1.1.1' : '1.1.0'); expect(manifest.notes.length).toBeGreaterThan(0);
      if (platform === 'windows') {
        expect(verifyEnvelope(await response.text(), channel).version).toBe('1.1.1');
        expect(() => verifyEnvelope(JSON.stringify(envelope), channel === 'staging' ? 'production' : 'staging')).toThrow();
      } else {
        expect(manifest.versionCode).toBe(11000);
        const origin = channel === 'staging' ? 'https://flownote-react-staging.vercel.app' : 'https://flownote-react.vercel.app';
        expect(manifest.artifacts.apk.url).toBe(`${origin}/downloads/flownote-1.1.0${channel === 'staging' ? '-staging' : ''}.apk`);
      }
    }
  }
});

test('exact Android staging/release APKs served on staging match their signed digests', async ({ request }) => {
  for (const channel of ['staging', 'production']) {
    const envelope = await (await request.get(`/updates/${channel}/android.json`)).json();
    const manifest = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
    // Verify both files on staging, never install or mutate production data.
    const response = await request.get(new URL(manifest.artifacts.apk.url).pathname);
    expect(response.ok()).toBeTruthy(); const bytes = await response.body();
    expect(bytes.length).toBe(manifest.artifacts.apk.size);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.artifacts.apk.sha256);
  }
});

test('Windows installer and portable release links are actually downloadable', async ({ request }) => {
  const envelope = await (await request.get('/updates/staging/windows.json')).json();
  const manifest = verifyEnvelope(JSON.stringify(envelope), 'staging');
  for (const artifact of Object.values(manifest.artifacts) as { url: string; size: number }[]) {
    const response = await request.head(artifact.url, { timeout: 60000 });
    expect(response.ok()).toBeTruthy();
    expect(Number(response.headers()['content-length'])).toBe(artifact.size);
  }
});
