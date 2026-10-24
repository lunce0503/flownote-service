import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackStatusLabel } from './feedbackStatus.ts';

const createdAt = '2026-10-01T00:00:00.000Z';
const created = Date.parse(createdAt);
const day = 24 * 60 * 60 * 1000;

test('new feedback expires at 24 hours, including after reopening the list', () => {
  for (const status of ['NEW', 'new', 'New']) {
    assert.equal(feedbackStatusLabel(status, createdAt, created), status);
    assert.equal(feedbackStatusLabel(status, createdAt, created + day - 1), status);
    assert.equal(feedbackStatusLabel(status, createdAt, created + day), '');
    assert.equal(feedbackStatusLabel(status, createdAt, created + 7 * day), '');
  }
});

test('expiry uses the timestamp instant rather than the local calendar day', () => {
  assert.equal(feedbackStatusLabel('new', '2026-10-01T09:00:00+09:00', created + day), '');
  assert.equal(feedbackStatusLabel('new', '2026-10-01T09:00:00+09:00', created + day - 1), 'new');
});

test('other processing statuses are preserved regardless of age or timestamp validity', () => {
  for (const status of ['REVIEWING', 'RESOLVED', 'reviewing', 'resolved', '']) {
    assert.equal(feedbackStatusLabel(status, createdAt, created + 7 * day), status);
    assert.equal(feedbackStatusLabel(status, 'invalid', created), status);
  }
});

test('invalid or future timestamps do not show a misleading new label', () => {
  for (const timestamp of ['', 'invalid', '2026-10-02T00:00:00.000Z']) {
    assert.equal(feedbackStatusLabel('new', timestamp, created), '');
  }
});
