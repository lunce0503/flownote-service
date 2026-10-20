import assert from 'node:assert/strict';
import test from 'node:test';
import { installedAppPlatform } from './installedAppPlatform.ts';
test('iOS marker enables the same installed UI without treating iPad Safari as an app', () => {
  assert.equal(installedAppPlatform('Mozilla/5.0 (iPad) AppleWebKit/605.1.15 FlownoteIOS/1.1.0'), 'ios');
  assert.equal(installedAppPlatform('FlownoteAndroid/1.1.0'), 'android');
  assert.equal(installedAppPlatform('FlownoteDesktop/1.1.1'), 'desktop');
  assert.equal(installedAppPlatform('Mozilla/5.0 (iPad) Version/26.0 Safari/605.1.15'), null);
  assert.equal(installedAppPlatform('FlownoteIOS/not-a-version'), null);
});
