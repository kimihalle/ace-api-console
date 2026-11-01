import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuotaDisplay, formatLoggedAmount, readLogOther, logUsage, usageLogQuery, usageGroupLabel, usageCsvRow, csvLine, healthHours, healthDisplayBuckets } from './usage-format.js';

test('quota units and currency precision stay consistent, including small call costs', () => {
  assert.equal(formatQuotaDisplay(50000000, { quota_per_unit: 500000 }), '$100.00');
  assert.equal(formatQuotaDisplay(1371, { quota_per_unit: 500000 }), '$0.002742');
  assert.equal(formatQuotaDisplay(500000, { quota_display_type: 'CNY', usd_exchange_rate: 7.3 }), '¥7.30');
  assert.equal(formatQuotaDisplay(100, { quota_display_type: 'CUSTOM', quota_per_unit: 100, custom_currency_symbol: '€', custom_currency_exchange_rate: 2 }), '€2.00');
  assert.equal(formatQuotaDisplay(1000, { quota_display_type: 'TOKENS' }), '1,000');
  assert.equal(formatQuotaDisplay(0, {}), '$0.00');
  assert.equal(formatQuotaDisplay(null, {}), '—');
});

test('historical billing strings are formatted, not converted a second time', () => {
  assert.equal(formatLoggedAmount('$ 100.000000'), '$100.00');
  assert.equal(formatLoggedAmount('＄0.002742'), '$0.002742');
  assert.equal(formatLoggedAmount('¥730.000000'), '¥730.00');
  assert.equal(formatLoggedAmount('50000000'), '50,000,000');
  assert.equal(formatLoggedAmount('100', { payment: true }), '100.00');
  assert.equal(formatLoggedAmount('USD 100.000000'), 'USD100.00');
  assert.equal(formatLoggedAmount('not an amount'), 'not an amount');
});

test('cache writes use the normalized total, then split TTLs, without double counting', () => {
  const row = { type: 2, prompt_tokens: 20, completion_tokens: 3, quota: 1371, other: JSON.stringify({ cache_tokens: 8, cache_write_tokens: 7, cache_creation_tokens: 100, cache_creation_tokens_5m: 3, cache_creation_tokens_1h: 4 }) };
  assert.deepEqual(logUsage(row), { input: 20, output: 3, cacheWrite: 7, cacheRead: 8, quota: 1371, source: '余额' });
  assert.equal(logUsage({ ...row, other: { cache_creation_tokens_5m: 3, cache_creation_tokens_1h: 4, cache_creation_tokens: 100 } }).cacheWrite, 7);
  assert.equal(logUsage({ ...row, other: { cache_creation_tokens: 9 } }).cacheWrite, 9);
  assert.equal(logUsage({ ...row, other: { input_tokens_total: 30 } }).input, 30);
  assert.deepEqual(readLogOther({ other: 'null' }), {});
  assert.deepEqual(readLogOther({ other: 'bad JSON' }), {});
  assert.equal(logUsage({ type: 5 }).cacheRead, null);
});

test('subscription use and zero consumption are not replaced by the wallet quota', () => {
  const row = { type: 2, quota: 500000, other: { billing_source: 'subscription', subscription_consumed: 0 } };
  assert.equal(logUsage(row).quota, 0);
  assert.equal(usageCsvRow(row, {})[8], '$0.00');
});

test('exports share server filtering, column order and protect spreadsheet formulas', () => {
  assert.equal(usageLogQuery('start_timestamp=123').get('usage_only'), 'true');
  const groups = [{ value: 'vip', label: 'Claude AWS渠道' }];
  const row = { type: 2, model_name: '=cmd()', group: 'vip', prompt_tokens: 11, completion_tokens: 53, quota: 1371 };
  const cells = usageCsvRow(row, {}, groups);
  assert.deepEqual(cells.slice(2), ['Claude AWS渠道', '11', '53', '0', '0', '1371', '$0.002742', '成功']);
  assert.equal(usageGroupLabel('missing', groups), 'missing');
  assert.equal(usageGroupLabel('', groups), '—');
  assert.match(csvLine(cells), /"'=cmd\(\)"/);
});

test('health gaps remain unknown; failed samples stay failed and old hours are excluded', () => {
  const start = 1792314000;
  const buckets = healthHours({ recent_success_series: [{ ts: start - 3600, success_rate: 100 }, { ts: start, success_rate: 100 }, { ts: start + 3600, success_rate: 0 }] }, start, start + 7 * 3600 + 120);
  assert.equal(buckets.length, 8);
  assert.deepEqual(buckets.slice(0, 3).map((bucket) => bucket.rate), [100, 0, null]);
  assert.equal(buckets.at(-1).rate, null);
  assert.deepEqual(healthHours(null, null, null), []);
});

test('active probes use 96 five-minute buckets without inventing healthy history', () => {
  const start = 1792314000;
  const buckets = healthHours({ recent_success_series: [{ ts: start, success_rate: 0 }, { ts: start + 600, success_rate: 100 }] }, start, start + 95 * 300 + 12, 300);
  assert.equal(buckets.length, 96);
  assert.deepEqual(buckets.slice(0, 4).map(({ rate }) => rate), [0, null, 100, null]);
  assert.equal(buckets.at(-1).rate, null);
});

test('health display runs oldest to newest from left to right and preserves gaps and original series', () => {
  const start = 1792314000;
  const metric = { recent_success_series: [{ ts: start, success_rate: 0 }, { ts: start + 95 * 300, success_rate: 100 }] };
  const before = JSON.stringify(metric);
  const buckets = healthDisplayBuckets(metric, start, start + 95 * 300 + 12, 300);
  assert.equal(buckets.length, 96);
  assert.deepEqual(buckets[0], { ts: start, rate: 0 });
  assert.equal(buckets[1].rate, null);
  assert.deepEqual(buckets.at(-1), { ts: start + 95 * 300, rate: 100 });
  assert.equal(JSON.stringify(metric), before);
  assert.deepEqual(healthDisplayBuckets(null, null, null), []);
  const advanced = healthDisplayBuckets({ recent_success_series: [...metric.recent_success_series, { ts: start + 96 * 300, success_rate: 50 }] }, start + 300, start + 96 * 300 + 12, 300);
  assert.equal(advanced.length, 96);
  assert.deepEqual(advanced[0], { ts: start + 300, rate: null });
  assert.deepEqual(advanced.at(-1), { ts: start + 96 * 300, rate: 50 });
  const hours = healthDisplayBuckets({ recent_success_series: [{ ts: start, success_rate: 0 }, { ts: start + 7 * 3600, success_rate: 100 }] }, start, start + 7 * 3600 + 12);
  assert.ok(hours.every((bucket, index) => index === 0 || bucket.ts > hours[index - 1].ts));
});

test('health display can use compact five-minute slots without inventing probe results', () => {
  const start = 1800000000;
  const buckets = healthDisplayBuckets({ recent_success_series: [
    { ts: start, success_rate: 100 },
    { ts: start + 600, success_rate: 0 },
  ] }, start, start + 8 * 3600 - 300, 300);
  assert.equal(buckets.length, 96);
  assert.deepEqual(buckets.slice(0, 4).map(({ ts, rate }) => [ts, rate]), [
    [start, 100], [start + 300, null], [start + 600, 0], [start + 900, null],
  ]);
  assert.ok(buckets.every((bucket, index) => index === 0 || bucket.ts - buckets[index - 1].ts === 300));
});
