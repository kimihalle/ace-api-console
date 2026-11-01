import test from 'node:test';
import assert from 'node:assert/strict';
import { usageFilterQuery } from './usage-filters.js';
import { usageLogQuery } from './usage-format.js';

test('model and status filters use the same server query for rows and exports', () => {
  const filters = { model: '  gpt-test/model + v2  ', group: '  vip  ', status: 'failed' };
  const params = usageFilterQuery('7d', filters, new Date(2026, 9, 23, 12));
  assert.equal(params.get('model_name'), 'gpt-test/model + v2');
  assert.equal(params.get('group'), 'vip');
  assert.equal(params.get('type'), '5');
  assert.equal(Number(params.get('end_timestamp')) - Number(params.get('start_timestamp')), 7 * 86400);
  assert.equal(usageLogQuery(params).get('usage_only'), 'true');
  assert.equal(usageLogQuery(params).get('model_name'), params.get('model_name'));
  assert.equal(usageLogQuery(params).get('group'), 'vip');
  assert.equal(usageFilterQuery('24h', { status: 'success' }).get('type'), '2');
  assert.equal(usageFilterQuery('24h', { status: 'all' }).has('type'), false);
});

test('calendar ranges include the entire last day and stop at now for today', () => {
  const now = new Date(2026, 9, 23, 12, 15);
  const past = usageFilterQuery('custom', { startDate: '2026-10-20', endDate: '2026-10-21' }, now);
  assert.equal(Number(past.get('start_timestamp')), new Date(2026, 9, 20).getTime() / 1000);
  assert.equal(Number(past.get('end_timestamp')), new Date(2026, 9, 22).getTime() / 1000 - 1);
  const today = usageFilterQuery('custom', { startDate: '2026-10-23', endDate: '2026-10-23' }, now);
  assert.equal(Number(today.get('end_timestamp')), now.getTime() / 1000);
});

test('incomplete, impossible, reversed and future dates are rejected before requests', () => {
  const now = new Date(2026, 9, 23, 12);
  for (const dates of [
    { startDate: '2026-10-20', endDate: '' },
    { startDate: '2026-02-30', endDate: '2026-03-01' },
    { startDate: '2026-10-21', endDate: '2026-10-20' },
    { startDate: '2026-10-24', endDate: '2026-10-24' },
  ]) assert.throws(() => usageFilterQuery('custom', dates, now));
});
