import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_MODE_PREFIX, deviceNamespace, isDeviceOnly, newWorkspaceId, setDeviceOnly } from './deviceMode.ts';

test('device setting is per account, app-only, persistent and fail-closed for corrupt values', async () => {
  const rows = new Map();
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'FlownoteIOS/1.1.0' } });
  globalThis.localStorage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  try {
    rows.set('flownote_auth_user', JSON.stringify({ id: 'a' }));
    assert.equal(isDeviceOnly(), false); setDeviceOnly(true);
    assert.equal(isDeviceOnly(), true); assert.match(newWorkspaceId(), /^device-/);
    assert.equal(deviceNamespace('drafts'), 'drafts-device:a');
    rows.set('flownote_auth_user', JSON.stringify({ id: 'b' }));
    assert.equal(isDeviceOnly(), false);
    rows.set(`${DEVICE_MODE_PREFIX}b`, 'corrupt'); assert.equal(isDeviceOnly(), true);
    setDeviceOnly(false); assert.equal(isDeviceOnly(), false);
    rows.set('flownote_auth_user', JSON.stringify({ id: 'a' })); assert.equal(isDeviceOnly(), true);
    navigator.userAgent = 'Safari'; assert.equal(isDeviceOnly(), false);
    navigator.userAgent = 'FlownoteAndroid/1.1.0'; assert.equal(isDeviceOnly(), true);
    navigator.userAgent = 'FlownoteDesktop/1.1.1'; assert.equal(isDeviceOnly(), true);
    const devicePage = await import('./deviceMode.ts?device-page');
    assert.equal(devicePage.isDeviceModeTransitioning(), false);
    setDeviceOnly(false); assert.equal(devicePage.isDeviceModeTransitioning(), true);
    setDeviceOnly(true); assert.equal(devicePage.isDeviceModeTransitioning(), false);
    rows.set('flownote_auth_user', JSON.stringify({ id: 'b' }));
    setDeviceOnly(true); assert.equal(devicePage.isDeviceModeTransitioning(), true);
  } finally {
    delete globalThis.localStorage;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
