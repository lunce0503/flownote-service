import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

test('iOS and iPadOS use the linked EAS project and exempt system HTTPS encryption', () => {
  const { expo } = read('app.json');
  assert.equal(expo.ios.supportsTablet, true);
  assert.equal(expo.ios.bundleIdentifier, 'com.flownote.mobile');
  assert.equal(expo.ios.config.usesNonExemptEncryption, false);
  assert.equal(expo.extra.eas.projectId, '0026ed46-eac0-4368-88ec-51f945829eb0');
  assert.equal(expo.owner, 'lunce02');
});

test('TestFlight builds are store archives, use Xcode 26, and isolate staging from production', () => {
  const { build, submit } = read('eas.json');
  for (const profile of ['testflight', 'production']) {
    assert.equal(build[profile].distribution, 'store');
    assert.equal(build[profile].autoIncrement, true);
    assert.equal(build[profile].ios.image, 'macos-sequoia-15.6-xcode-26.0');
    assert.notEqual(build[profile].developmentClient, true);
    assert.ok(submit[profile]);
  }
  assert.equal(build.testflight.env.EXPO_PUBLIC_WAS_URL, 'https://flownote-api-staging.up.railway.app');
  assert.equal(build.production.env.EXPO_PUBLIC_WAS_URL, 'https://flownote-api-production.up.railway.app');
});
