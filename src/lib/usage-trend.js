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
