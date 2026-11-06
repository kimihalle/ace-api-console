import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePelicanHistory, pelicanGalleryRecords, pelicanTargetKey, pelicanWorkKey, successfulPelicanRecords, togglePelicanWorkComparison } from './pelican-preview.js';

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

test('public gallery and history exclude failed, running and unknown records, including catalog fallback', () => {
  const success = work(10);
  const failed = { ...work(30), latest: { ...work(30).latest, status: 'failed' } };
  const running = { ...work(20, 20, 'running'), latest: { ...work(20).latest, status: 'running' } };
  const unknown = { ...work(40, 40, 'unknown'), latest: { ...work(40).latest, status: undefined } };
  const records = [failed.latest, running.latest, unknown.latest, success.latest];
  assert.deepEqual(successfulPelicanRecords(records), [success.latest]);
  assert.deepEqual(pelicanGalleryRecords([failed, running, unknown], {}), []);
  const histories = { [pelicanTargetKey(failed)]: { loaded: true, records } };
  assert.deepEqual(pelicanGalleryRecords([failed, running, unknown], histories), [success]);
  assert.deepEqual(records.map((sample) => sample.status), ['failed', 'running', undefined, 'success']);
});

test('legacy history pagination can pass a failed-only page to reach older successes', () => {
  const target = work(30);
  const failedPage = { records: [{ id: 30, hour: 30, status: 'failed' }, { id: 20, hour: 20, status: 'running' }], next_before: 20 };
  const history = { loaded: true, records: failedPage.records, next: failedPage.next_before };
  const histories = { [pelicanTargetKey(target)]: history };
  assert.deepEqual(pelicanGalleryRecords([target], histories), []);
  assert.equal(history.next, 20);
  history.records = mergePelicanHistory(history.records, [work(10).latest]);
  history.next = 0;
  assert.deepEqual(pelicanGalleryRecords([target], histories).map((item) => item.latest.id), [10]);
  assert.deepEqual(successfulPelicanRecords(history.records).map((item) => item.id), [10]);
});
