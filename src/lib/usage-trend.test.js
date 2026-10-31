import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDailyUsage, dailyUsageWindow } from './usage-trend.js';
import { formatQuotaDisplay } from './usage-format.js';
import { newApi } from './newapi.js';

test('daily range includes today and crosses month/year boundaries at local midnight', () => {
  const now = new Date(2026, 0, 3, 14, 25, 39);
  const range = dailyUsageWindow(7, now);
  assert.equal(range.dates.length, 7);
  assert.deepEqual([range.dates[0].getFullYear(), range.dates[0].getMonth(), range.dates[0].getDate(), range.dates[0].getHours()], [2025, 11, 28, 0]);
  assert.equal(range.dates.at(-1).getDate(), 3);
  assert.equal(range.end, Math.floor(now.getTime() / 1000));
  assert.equal(dailyUsageWindow(30, now).dates.length, 30);
  assert.equal(now.getHours(), 14);
});

test('all models in hourly aggregates contribute once, with missing days distinguished from recorded zero', () => {
  const range = dailyUsageWindow(7, new Date(2026, 9, 23, 12));
  const ts = (day, hour = 0) => new Date(2026, 9, day, hour).getTime() / 1000;
  const points = aggregateDailyUsage([
    { created_at: ts(17), model_name: 'a', quota: 500000, count: 1, token_used: 12 },
    { created_at: ts(17, 23), model_name: 'b', quota: 250000, count: 2, token_used: 30 },
    { created_at: ts(18), quota: 0, count: 1, token_used: 10 },
    { created_at: ts(23, 12), quota: 1371, count: 1, token_used: 6 },
    { created_at: ts(16, 23), quota: 999, count: 5, token_used: 100 },
    { created_at: ts(23, 13), quota: 999, count: 5, token_used: 100 },
  ], range);
  assert.equal(points[0].quota, 750000);
  assert.equal(points[0].count, 3);
  assert.equal(points[0].tokens, 42);
  assert.equal(formatQuotaDisplay(points[0].quota, { quota_display_type: 'CNY', usd_exchange_rate: 7.3 }), '¥10.95');
  assert.equal(points[1].recorded, true);
  assert.equal(points[1].quota, 0);
  assert.equal(points[2].recorded, false);
  assert.equal(points.at(-1).quota, 1371);
});

test('failed/malformed aggregate responses cannot masquerade as zero consumption', () => {
  const range = dailyUsageWindow();
  assert.throws(() => aggregateDailyUsage({}, range));
  assert.throws(() => aggregateDailyUsage([{ created_at: range.start, quota: null, count: 1, token_used: 2 }], range));
  assert.throws(() => aggregateDailyUsage([{ created_at: range.start, quota: -1, count: 1, token_used: 2 }], range));
  assert.equal(aggregateDailyUsage([], range).some((point) => point.recorded), false);
});

test('calendar buckets remain consecutive across daylight saving transitions', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const range = dailyUsageWindow(7, new Date(2026, 2, 10, 12));
    assert.deepEqual(range.dates.map((date) => date.getDate()), [4, 5, 6, 7, 8, 9, 10]);
    assert.ok(range.dates.every((date) => date.getHours() === 0));
    const gaps = range.dates.slice(1).map((date, index) => (date - range.dates[index]) / 3600000);
    // Windows may not apply a changed TZ at runtime; calendar iteration is still checked above.
    if (range.dates[0].getTimezoneOffset() !== range.dates.at(-1).getTimezoneOffset()) assert.ok(gaps.includes(23));
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('trend requests use the user aggregate endpoint with cancellation and propagate failures', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/data/self?start_timestamp=100&end_timestamp=200');
      assert.equal(init.signal, controller.signal);
      return new Response(JSON.stringify({ success: true, data: [] }), { headers: { 'Content-Type': 'application/json' } });
    };
    assert.deepEqual(await newApi.usageTrend('?start_timestamp=100&end_timestamp=200', controller.signal), []);
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'unavailable' }), { headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(newApi.usageTrend(), /unavailable/);
  } finally { globalThis.fetch = originalFetch; }
});
