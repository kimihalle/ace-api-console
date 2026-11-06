export function dailyUsageWindow(days = 7, now = new Date()) {
  const count = days === 30 ? 30 : 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - count + 1);
  const dates = [];
  const cursor = new Date(start);
  for (let index = 0; index < count; index++) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { dates, start: Math.floor(start.getTime() / 1000), end: Math.floor(now.getTime() / 1000) };
}

function localDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function aggregateDailyUsage(rows, window) {
  if (!Array.isArray(rows)) throw new Error('Invalid usage trend response');
  const buckets = window.dates.map((date) => ({ date, quota: 0, count: 0, tokens: 0, recorded: false }));
  const byDate = new Map(buckets.map((bucket) => [localDateKey(bucket.date), bucket]));
  for (const row of rows) {
    const timestamp = Number(row.created_at);
    // The server stores hourly buckets; keep today's in-progress hour.
    if (!(timestamp >= window.start && timestamp <= window.end)) continue;
    const values = [row.quota, row.count, row.token_used];
    if (values.some((value) => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error('Invalid usage trend totals');
    const bucket = byDate.get(localDateKey(new Date(timestamp * 1000)));
    if (!bucket) continue;
    bucket.quota += Number(row.quota);
    bucket.count += Number(row.count);
    bucket.tokens += Number(row.token_used);
    bucket.recorded = true;
  }
  return buckets;
}

export function summarizeDailyUsage(points) {
  let totalQuota = 0;
  let totalTokens = 0;
  let maxQuota = 0;
  for (const point of points) {
    if (!point.recorded) continue;
    totalQuota += point.quota;
    totalTokens += point.tokens;
    maxQuota = Math.max(maxQuota, point.quota);
  }
  return { totalQuota, totalTokens, maxQuota, averageQuota: points.length ? totalQuota / points.length : 0 };
}

// Keep unrecorded days as gaps. Bezier controls stay at the two measured values,
// so smoothing can never invent a negative charge or overshoot a daily peak.
export function buildUsageTrendChart(points) {
  const width = 1000;
  const height = 200;
  const top = 14;
  const baseline = 190;
  const maximum = Math.max(0, ...points.filter((point) => point.recorded).map((point) => point.quota));
  const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum / 4)) : 1;
  const step = maximum > 0 ? [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= maximum / 4) * magnitude : 1;
  const ceiling = maximum > 0 ? Math.ceil(maximum / step) * step : 1;
  const ticks = maximum > 0
    ? Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => ({ value: index * step, y: baseline - index * step / ceiling * (baseline - top) }))
    : [{ value: 0, y: baseline }];
  const plotted = points.map((point, index) => ({
    ...point,
    x: (index + 0.5) / points.length * width,
    y: point.recorded ? baseline - point.quota / ceiling * (baseline - top) : null,
  }));
  const segments = [];
  for (let index = 0; index < plotted.length; index++) {
    const point = plotted[index];
    if (!point.recorded) continue;
    const previous = plotted[index - 1];
    if (!previous?.recorded) segments.push([point]);
    else segments.at(-1).push(point);
  }
  const curves = segments.filter((segment) => segment.length > 1).map((segment) => {
    let line = `M ${segment[0].x} ${segment[0].y}`;
    for (let index = 1; index < segment.length; index++) {
      const previous = segment[index - 1];
      const point = segment[index];
      const middle = (previous.x + point.x) / 2;
      line += ` C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
    }
    return { line, area: `${line} L ${segment.at(-1).x} ${baseline} L ${segment[0].x} ${baseline} Z` };
  });
  return { width, height, top, baseline, ticks, points: plotted, curves };
}
