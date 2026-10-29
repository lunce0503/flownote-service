import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  allDeploymentTargets,
  mainResourceVariables,
  serviceSleepPolicy,
} from './cloud-resource-policy.mjs';

test('all deployments mirror the production services that are currently active', () => {
  assert.deepEqual(allDeploymentTargets, [
    'main',
    'canvas',
    'serve',
    'api',
    'web',
  ]);
  assert.equal(allDeploymentTargets.includes('expo'), false);
  assert.equal(allDeploymentTargets.includes('ai'), false);
  assert.equal(allDeploymentTargets.includes('mobile'), false);
});

test('staging keeps the public auth gateway warm and other application sleep defaults', () => {
  assert.deepEqual(serviceSleepPolicy('staging'), {
    'flownote-main': true,
    'flownote-canvas': true,
    'flownote-sub': true,
    'flownote-ai': true,
    'flownote-api': false,
    mobile: true,
    expo: true,
  });
});

test('production services stay warm', () => {
  assert.deepEqual(serviceSleepPolicy('production'), {
    'flownote-main': false,
    'flownote-canvas': false,
    'flownote-sub': false,
    'flownote-ai': false,
    'flownote-api': false,
    mobile: false,
    expo: false,
  });
});

test('service manifests do not override the environment sleep policy', () => {
  for (const file of [
    '../flownote-server/railway.json',
    '../flownote-canvas/railway.json',
    '../flownote-serve/railway.json',
    '../flownote-API/railway.json',
    '../flownote-ai/railway.json',
    '../flownote-mobile/railway.json',
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(file, import.meta.url)));
    assert.equal('sleepApplication' in manifest.deploy, false, file);
  }
});

test('Spring resource policy uses a small heap and environment-sized idle pools', () => {
  const staging = mainResourceVariables('staging');
  const production = mainResourceVariables('production');

  assert.match(staging.JAVA_TOOL_OPTIONS, /-Xms32m/);
  assert.match(staging.JAVA_TOOL_OPTIONS, /-Xmx256m/);
  assert.equal(staging.SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE, '0');
  assert.equal(staging.SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE, '4');
  assert.equal(staging.SPRING_DATASOURCE_HIKARI_KEEPALIVE_TIME, '0');
  assert.equal(production.SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE, '1');
  assert.equal(production.SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE, '5');
});
