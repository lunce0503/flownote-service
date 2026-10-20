import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SYNC_HEADER, isDeviceSyncNetworkRequest, runWithDeviceSyncNetwork } from './deviceSyncNetwork.ts';

test('offline reconciliation network access is scoped and requires the private marker', async () => {
  const marked = { [DEVICE_SYNC_HEADER]: '1' };
  assert.equal(isDeviceSyncNetworkRequest(marked), false);
  await runWithDeviceSyncNetwork(async () => {
    assert.equal(isDeviceSyncNetworkRequest({}), false);
    assert.equal(isDeviceSyncNetworkRequest(marked), true);
    assert.equal(isDeviceSyncNetworkRequest(new Headers(marked)), true);
  });
  assert.equal(isDeviceSyncNetworkRequest(marked), false);
});
