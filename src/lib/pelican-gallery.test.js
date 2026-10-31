import test from 'node:test';
import assert from 'node:assert/strict';
import { pelicanGalleryRecords, pelicanTargetKey, pelicanWorkKey, togglePelicanWorkComparison } from './pelican-preview.js';

const work = (id, hour = id, model = 'same', group = 'a') => ({ group, model, latest: { id, hour, checked_at: hour + 1, status: 'success' } });

test('gallery merges actual history by model, orders generations newest first and uses catalog only until history loads', () => {
  const first = work(10, 10), second = work(30, 30, 'other');
  const history = { [pelicanTargetKey(first)]: { loaded: true, records: [work(2, 2).latest, work(11, 11).latest, work(11, 11).latest] } };
  assert.deepEqual(pelicanGalleryRecords([first, second], history).map((item) => item.latest.id), [30, 11, 2]);
  history[pelicanTargetKey(second)] = { loaded: true, records: [] };
  assert.deepEqual(pelicanGalleryRecords([first, second], history).map((item) => item.latest.id), [11, 2]);
  history[pelicanTargetKey(first)] = { error: true };
  assert.deepEqual(pelicanGalleryRecords([first, second], history).map((item) => item.latest.id), [10]);
});

test('comparison supports two generations of the same model and fixed snapshots across groups, capped at four', () => {
  const first = work(1), older = work(2, 0), otherGroup = work(3, 3, 'same', 'b');
  assert.notEqual(pelicanWorkKey(first), pelicanWorkKey(older));
  let selected = togglePelicanWorkComparison([], first);
  selected = togglePelicanWorkComparison(selected, older);
  selected = togglePelicanWorkComparison(selected, otherGroup);
  selected = togglePelicanWorkComparison(selected, work(4));
  selected = togglePelicanWorkComparison(selected, work(5));
  assert.equal(selected.length, 4);
  first.latest.hour = 999;
  assert.equal(selected[0].latest.hour, 1);
  selected = togglePelicanWorkComparison(selected, older);
  assert.deepEqual(selected.map((item) => item.latest.id), [1, 3, 4]);
  const failed = { ...work(6), latest: { id: 6, status: 'failed' } };
  assert.equal(togglePelicanWorkComparison(selected, failed), selected);
});
