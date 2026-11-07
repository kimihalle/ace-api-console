import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuotaDisplay, formatUsdQuota, formatLoggedAmount, formatLogDuration, readLogOther, logUsage, logTiming, usageLogQuery, usageColumns, usageTableColumns, usageGroupLabel, usageCsvRow, csvLine, healthHours, healthDisplayBuckets, healthProbeSamples } from './usage-format.js';

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

test('account and usage credits stay in USD without applying model, group or display rates again', () => {
  const status = { quota_per_unit: 500000, usd_exchange_rate: 7.3, custom_currency_symbol: '€', custom_currency_exchange_rate: 2 };
  for (const quota_display_type of ['USD', 'CNY', 'CUSTOM', 'TOKENS']) {
    const configured = { ...status, quota_display_type, display_in_currency: false };
    assert.equal(formatUsdQuota(47118, configured), '$0.094236');
    assert.equal(formatUsdQuota(9900000, configured), '$19.80');
    assert.equal(formatUsdQuota(0, configured), '$0.00');
    const row = { type: 2, quota: 47118, other: { model_ratio: 10, group_ratio: 3, cache_ratio: 0.1 } };
    const cells = usageCsvRow(row, configured);
    assert.equal(cells[usageColumns.indexOf('消耗额度（USD）')], '$0.094236');
    assert.equal(cells.length, usageColumns.length);
  }
  assert.equal(formatUsdQuota(123, { quota_per_unit: 100 }), '$1.23');
  assert.equal(formatUsdQuota(0.1, { quota_per_unit: 500000 }), '$<0.000001');
  for (const quota_per_unit of [0, -1, Infinity, 'invalid']) {
    assert.equal(formatUsdQuota(500000, { quota_per_unit }), '$1.00');
  }
  for (const missing of [undefined, null, '', '  ', NaN, Infinity, 'invalid', true, []]) {
    assert.equal(formatUsdQuota(missing, status), '—');
  }
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
  assert.equal(usageCsvRow(row, {})[usageColumns.indexOf('消耗额度（USD）')], '$0.00');
});

test('exports share server filtering, column order and protect spreadsheet formulas', () => {
  assert.equal(usageLogQuery('start_timestamp=123').get('usage_only'), 'true');
  const groups = [{ value: 'vip', label: 'Claude AWS渠道' }];
  const row = { type: 2, model_name: '=cmd()', group: 'vip', prompt_tokens: 11, completion_tokens: 53, quota: 1371 };
  const cells = usageCsvRow(row, {}, groups);
  assert.deepEqual(cells.slice(2), ['Claude AWS渠道', '11', '53', '0', '0', '$0.002742', '—', '—', '成功']);
  assert.equal(usageGroupLabel('missing', groups), 'missing');
  assert.equal(usageGroupLabel('', groups), '—');
  assert.match(csvLine(cells), /"'=cmd\(\)"/);
});

test('usage exports show recorded request duration in seconds without using first-token milliseconds', () => {
  const durationIndex = usageColumns.indexOf('耗时');
  assert.ok(durationIndex >= 0, 'Usage must expose the same duration recorded in backend logs');
  const row = { type: 2, use_time: 5, is_stream: true, other: { frt: 780 } };
  const before = JSON.stringify(row);
  const cells = usageCsvRow(row, {});
  assert.equal(cells.length, usageColumns.length);
  assert.equal(cells[durationIndex], '5s');
  assert.equal(cells.at(-1), '成功');
  assert.equal(JSON.stringify(row), before);

  for (const [seconds, expected] of [[0, '0s'], [1.25, '1.25s'], [125, '125s'], ['4', '4s']]) {
    assert.equal(usageCsvRow({ ...row, use_time: seconds }, {})[durationIndex], expected);
  }
  assert.equal(usageCsvRow({ ...row, type: 5, use_time: 4 }, {})[durationIndex], '4s');
});

test('average usage durations retain fractional seconds and show in seconds', () => {
  assert.equal(formatLogDuration(14 / 3), '4.667s');
  assert.equal(formatLogDuration(0), '0s');
  assert.equal(formatLogDuration(null), '—');
});

test('a large cached input remains input and compact table columns preserve separate export values', () => {
  const row = { type: 2, prompt_tokens: 158331, completion_tokens: 147, other: { cache_tokens: 157952 } };
  const usage = logUsage(row);
  assert.equal(usage.input, 158331);
  assert.equal(usage.output, 147);
  assert.equal(usage.cacheRead, 157952);
  assert.deepEqual(usageCsvRow(row, {}).slice(3, 5), ['158331', '147']);
  assert.ok(usageTableColumns.includes('输入 / 输出 Token'));
  assert.ok(usageTableColumns.includes('首字 / 耗时'));
  assert.equal(logUsage({ ...row, prompt_tokens: 379, other: { input_tokens_total: 158331, cache_tokens: 157952 } }).input, 158331);
});

test('streaming first-token milliseconds and total seconds are formatted independently for display and export', () => {
  for (const other of [{ frt: 2000 }, JSON.stringify({ frt: 2000 })]) {
    const row = { type: 2, is_stream: true, other, use_time: 15 };
    const before = JSON.stringify(row);
    assert.deepEqual(logTiming(row), { firstToken: '2s', total: '15s' });
    const cells = usageCsvRow(row, {});
    assert.equal(cells[usageColumns.indexOf('首字')], '2s');
    assert.equal(cells[usageColumns.indexOf('耗时')], '15s');
    assert.equal(cells.length, usageColumns.length);
    assert.equal(JSON.stringify(row), before);
  }
  assert.deepEqual(logTiming({ is_stream: true, other: { frt: 780 }, use_time: 0 }), { firstToken: '0.78s', total: '0s' });
  assert.equal(logTiming({ is_stream: true, other: { frt: 1 } }).firstToken, '0.001s');
});

test('non-streaming and missing or invalid first-token measurements remain unknown', () => {
  for (const frt of [undefined, null, '', '  ', 0, -1000, NaN, Infinity, 'invalid', true, []]) {
    assert.deepEqual(logTiming({ is_stream: true, other: { frt }, use_time: 15 }), { firstToken: '—', total: '15s' });
  }
  for (const is_stream of [false, undefined, 'false']) {
    assert.deepEqual(logTiming({ is_stream, other: { frt: 2000 }, use_time: 15 }), { firstToken: '—', total: '15s' });
  }
  assert.deepEqual(logTiming({ is_stream: true, other: 'bad json' }), { firstToken: '—', total: '—' });
});

test('missing or invalid request duration stays unknown rather than becoming zero or first-token time', () => {
  const durationIndex = usageColumns.indexOf('耗时');
  assert.ok(durationIndex >= 0);
  for (const seconds of [undefined, null, '', '  ', -1, NaN, Infinity, 'invalid', true]) {
    const row = { type: 2, use_time: seconds, is_stream: true, other: { frt: 1000 } };
    assert.equal(usageCsvRow(row, {})[durationIndex], '—');
  }
});

test('usage groups follow each invocation, not the account or the current key group', () => {
  const groups = [{ value: 'api-vip', label: 'VIP线路' }, { value: 'api-public', label: '公共线路' }];
  const base = { type: 2, model_name: 'same-model', token_id: 42, user_group: 'account-only', token_group: 'current-key-group' };
  assert.equal(usageCsvRow({ ...base, group: 'api-vip' }, {}, groups)[2], 'VIP线路');
  assert.equal(usageCsvRow({ ...base, group: 'api-public' }, {}, groups)[2], '公共线路');
  assert.equal(usageCsvRow({ ...base, group: 'old-deleted-group' }, {}, groups)[2], 'old-deleted-group');
  assert.equal(usageCsvRow(base, {}, groups)[2], '—');
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

test('probe timeline includes only actual samples, sorted in time, with no synthetic gap buckets', () => {
  const start = 1800000000;
  const samples = healthProbeSamples({ recent_success_series: [
    { ts: start + 1200, success_rate: 0 },
    { ts: start + 600, success_rate: 100 },
    { ts: start + 1800, success_rate: 140 },
    { ts: start + 2400, success_rate: null },
    { ts: start - 600, success_rate: 50 },
  ] }, start, start + 3600);
  assert.deepEqual(samples, [
    { ts: start + 600, rate: 100 },
    { ts: start + 1200, rate: 0 },
    { ts: start + 1800, rate: 100 },
  ]);
  assert.deepEqual(healthProbeSamples(null, start, start), []);
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
