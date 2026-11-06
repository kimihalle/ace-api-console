import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDailyUsage, buildUsageTrendChart, dailyUsageWindow, summarizeDailyUsage } from './usage-trend.js';
import { formatUsdQuota } from './usage-format.js';
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
    { created_at: ts(17), model_name: 'a', quota: 500000, count: 1, token_used: 12, cache_read_tokens: 10 },
    { created_at: ts(17, 23), model_name: 'b', quota: 250000, count: 2, token_used: 30 },
    { created_at: ts(18), quota: 0, count: 1, token_used: 10 },
    { created_at: ts(23, 12), quota: 1371, count: 1, token_used: 6 },
    { created_at: ts(16, 23), quota: 999, count: 5, token_used: 100 },
    { created_at: ts(23, 13), quota: 999, count: 5, token_used: 100 },
  ], range);
  assert.equal(points[0].quota, 750000);
  assert.equal(points[0].count, 3);
  assert.equal(points[0].tokens, 42);
  assert.equal(formatUsdQuota(points[0].quota, { quota_display_type: 'CNY', usd_exchange_rate: 7.3 }), '$1.50');
  assert.equal(points[1].recorded, true);
  assert.equal(points[1].quota, 0);
  assert.equal(points[2].recorded, false);
  assert.equal(points.at(-1).quota, 1371);
  assert.deepEqual(summarizeDailyUsage(points), {
    totalQuota: 751371,
    totalTokens: 58,
    maxQuota: 750000,
    averageQuota: 751371 / 7,
  }, 'period totals include all in-range model buckets once, without adding cached tokens again');
});

test('failed/malformed aggregate responses cannot masquerade as zero consumption', () => {
  const range = dailyUsageWindow();
  assert.throws(() => aggregateDailyUsage({}, range));
  assert.throws(() => aggregateDailyUsage([{ created_at: range.start, quota: null, count: 1, token_used: 2 }], range));
  assert.throws(() => aggregateDailyUsage([{ created_at: range.start, quota: -1, count: 1, token_used: 2 }], range));
  assert.equal(aggregateDailyUsage([], range).some((point) => point.recorded), false);
  assert.deepEqual(summarizeDailyUsage(aggregateDailyUsage([], range)), {
    totalQuota: 0, totalTokens: 0, maxQuota: 0, averageQuota: 0,
  });
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

test('trend curves break at missing days while recorded zero and isolated days remain visible', () => {
  const points = [
    { recorded: true, quota: 0 },
    { recorded: true, quota: 100 },
    { recorded: false, quota: 0 },
    { recorded: true, quota: 20 },
  ];
  const chart = buildUsageTrendChart(points);
  assert.equal(chart.curves.length, 1, 'only consecutive measured days can be connected');
  assert.equal(chart.points[0].y, chart.baseline, 'measured zero is a real point on the baseline');
  assert.equal(chart.points[2].y, null, 'missing data must not get a zero-value chart point');
  assert.ok(chart.points[3].y < chart.baseline, 'the isolated last day still has a visible point');
  assert.ok(chart.curves[0].line.endsWith(`${chart.points[1].x} ${chart.points[1].y}`));
  assert.equal(points[2].recorded, false, 'chart rendering never changes source records');

  const onlyToday = buildUsageTrendChart([
    { recorded: false, quota: 0 },
    { recorded: false, quota: 0 },
    { recorded: true, quota: 200 },
  ]);
  assert.equal(onlyToday.curves.length, 0, 'one measured day must not invent a trend');
  assert.ok(onlyToday.points.at(-1).y >= onlyToday.top);
  assert.ok(onlyToday.points.at(-1).y < onlyToday.baseline);
  assert.deepEqual(buildUsageTrendChart([]).curves, []);
});

test('smoothed daily spending stays within measured values and never dips below zero', () => {
  const chart = buildUsageTrendChart([40, 100, 0, 80].map((quota) => ({ recorded: true, quota })));
  assert.equal(chart.curves.length, 1);
  const segments = [...chart.curves[0].line.matchAll(/C ([\d.e+-]+) ([\d.e+-]+), ([\d.e+-]+) ([\d.e+-]+), ([\d.e+-]+) ([\d.e+-]+)/g)];
  assert.equal(segments.length, 3);
  segments.forEach((segment, index) => {
    const start = chart.points[index];
    const end = chart.points[index + 1];
    const control1 = Number(segment[2]);
    const control2 = Number(segment[4]);
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const y = (1 - ratio) ** 3 * start.y + 3 * (1 - ratio) ** 2 * ratio * control1 + 3 * (1 - ratio) * ratio ** 2 * control2 + ratio ** 3 * end.y;
      assert.ok(y >= Math.min(start.y, end.y) - 1e-9 && y <= Math.max(start.y, end.y) + 1e-9);
      assert.ok(y <= chart.baseline && y >= chart.top);
    }
  });
  const zero = buildUsageTrendChart([{ recorded: true, quota: 0 }, { recorded: true, quota: 0 }]);
  assert.ok(zero.points.every((point) => point.y === zero.baseline));
  assert.ok(!zero.curves[0].line.includes('NaN'));
});
