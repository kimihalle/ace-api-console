import test from 'node:test';
import assert from 'node:assert/strict';
import { pelicanTargetKey, snapshotPelicanComparison, togglePelicanComparison } from './pelican-preview.js';

const target = (id, group = 'default', model = `model-${id}`) => ({ group, model, latest: { id, status: 'success', hour: id * 3600, prompt_version: `v${id}` } });

test('comparison keys distinguish groups and delimiter-containing model names', () => {
  assert.notEqual(pelicanTargetKey(target(1, 'a/b', 'c')), pelicanTargetKey(target(2, 'a', 'b/c')));
  assert.notEqual(pelicanTargetKey(target(1, 'default', 'same')), pelicanTargetKey(target(2, 'vip', 'same')));
});

test('comparison selection toggles across groups, caps at four and removes unavailable targets', () => {
  const targets = [target(1), target(2, 'vip'), target(3), target(4), target(5), { ...target(6), latest: { id: 6, status: 'failed' } }];
  let keys = [];
  for (const item of targets) keys = togglePelicanComparison(keys, item, targets);
  assert.equal(keys.length, 4);
  assert.ok(keys.includes(pelicanTargetKey(targets[1])));
  keys = togglePelicanComparison(keys, targets[1], targets);
  assert.equal(keys.length, 3);
  keys = togglePelicanComparison(keys, targets[4], targets.slice(2));
  assert.equal(keys.length, 3);
  assert.ok(!keys.includes(pelicanTargetKey(targets[0])));
});

test('open comparison snapshots keep original samples and versions when catalog refreshes', () => {
  const targets = [target(1), target(2, 'vip')];
  const snapshot = snapshotPelicanComparison(targets.map(pelicanTargetKey), targets);
  targets[0].latest.id = 100;
  targets[0].latest.prompt_version = 'new';
  assert.equal(snapshot[0].latest.id, 1);
  assert.equal(snapshot[0].latest.prompt_version, 'v1');
  assert.equal(snapshot[1].latest.hour, 7200);
  assert.deepEqual(snapshotPelicanComparison(['removed'], targets), []);
});
