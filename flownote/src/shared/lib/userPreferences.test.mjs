import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, defaultPreferences } from './userPreferences.ts';
test('preferences restore only supported values and reject corrupt or mistyped storage', () => {
  for (const raw of [null, 'broken', 'null', '[]', 'true', '{"fontScale":3,"density":false,"reduceMotion":"false"}']) {
    assert.deepEqual(parsePreferences(raw), defaultPreferences);
  }
  assert.deepEqual(parsePreferences('{"fontScale":"large","density":"compact","reduceMotion":true,"confirmBeforeDelete":false}'),
    { fontScale: 'large', density: 'compact', reduceMotion: true });
});
