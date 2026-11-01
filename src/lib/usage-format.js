import { getLocale, t } from './i18n.js';

export function formatNumber(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 6 }).format(number) : '—';
}

export function formatMoney(value, symbol = '$') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const formatted = new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(amount);
  if (amount !== 0 && Math.abs(amount) < 0.000001) return `${amount < 0 ? '-' : ''}${symbol}<0.000001`;
  return `${symbol}${formatted}`;
}

export function formatQuotaDisplay(value, status) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const displayType = status?.quota_display_type || (status?.display_in_currency === false ? 'TOKENS' : 'USD');
  if (displayType === 'TOKENS') return formatNumber(value);
  const configuredUnit = Number(status?.quota_per_unit);
  const unit = configuredUnit > 0 && Number.isFinite(configuredUnit) ? configuredUnit : 500000;
  const configuredRate = Number(displayType === 'CNY' ? status?.usd_exchange_rate
    : displayType === 'CUSTOM' ? status?.custom_currency_exchange_rate : 1);
  const rate = configuredRate > 0 && Number.isFinite(configuredRate) ? configuredRate : 1;
  const symbol = displayType === 'CNY' ? '¥' : displayType === 'CUSTOM' ? status?.custom_currency_symbol || '¤' : '$';
  return formatMoney(Number(value) / unit * rate, symbol);
}

// Stored billing messages already contain the currency/unit used at purchase time.
// Never treat these amounts as internal quota or apply today's exchange rate again.
export function formatLoggedAmount(value, { payment = false } = {}) {
  if (value == null || value === '') return '—';
  const text = String(value).trim().replace(/＄/g, '$').replace(/￥/g, '¥');
  const match = text.match(/^([^\d+\-]*?)\s*([+\-]?[\d,]+(?:\.\d+)?)(\s*[^\d]*)$/u);
  if (!match) return text;
  const amount = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return text;
  const symbol = match[1].trim();
  const suffix = match[3].trim();
  const formatted = symbol || suffix || payment ? formatMoney(amount, symbol) : formatNumber(amount);
  return `${formatted}${suffix ? ` ${suffix}` : ''}`;
}

export function readLogOther(row) {
  const other = row?.other;
  if (other && typeof other === 'object' && !Array.isArray(other)) return other;
  try {
    const parsed = JSON.parse(other || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function tokenCount(value) {
  return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

export function logUsage(row) {
  const other = readLogOther(row);
  const splitWrite = (tokenCount(other.cache_creation_tokens_5m) || 0) + (tokenCount(other.cache_creation_tokens_1h) || 0);
  const defaultValue = Number(row?.type) === 5 ? null : 0;
  return {
    input: tokenCount(other.input_tokens_total) ?? tokenCount(row?.prompt_tokens) ?? defaultValue,
    output: tokenCount(row?.completion_tokens) ?? defaultValue,
    cacheWrite: tokenCount(other.cache_write_tokens) ?? (splitWrite > 0 ? splitWrite : tokenCount(other.cache_creation_tokens)) ?? defaultValue,
    cacheRead: tokenCount(other.cache_tokens) ?? defaultValue,
    quota: other.billing_source === 'subscription' ? other.subscription_consumed ?? row?.quota : row?.quota,
    source: other.billing_source === 'subscription' ? '订阅' : '余额',
  };
}

export function usageLogQuery(rangeQuery) {
  const params = new URLSearchParams(rangeQuery);
  params.set('usage_only', 'true');
  return params;
}

export const usageColumns = ['时间', '模型', '分组', '输入 Token', '输出 Token', '缓存创建 Token', '缓存读取 Token', '额度使用', '消费（基数额度）', '状态'];

export function usageGroupLabel(value, groups = []) {
  if (value == null || value === '') return '—';
  const group = groups.find((item) => String(item.value) === String(value));
  return group?.label || String(value);
}

export function usageCsvRow(row, status, groups = []) {
  const usage = logUsage(row);
  return [
    Number(row.created_at) > 0 ? new Date(Number(row.created_at) * 1000).toLocaleString(getLocale()) : '—',
    row.model_name || '—', usageGroupLabel(row.group, groups), usage.input, usage.output, usage.cacheWrite, usage.cacheRead,
    usage.quota, formatQuotaDisplay(usage.quota, status), t(Number(row.type) === 5 ? '失败' : '成功'),
  ].map((value) => value == null ? '—' : String(value));
}

export function csvLine(cells) {
  return cells.map((value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(',');
}

export function healthHours(metric, windowStart, windowEnd, bucketSeconds = 3600) {
  if (!(Number(windowStart) > 0) || !(Number(windowEnd) >= Number(windowStart))) return [];
  const points = new Map((metric?.recent_success_series || []).map((point) => [Number(point.ts), point]));
  const interval = Number.isFinite(Number(bucketSeconds)) && Number(bucketSeconds) > 0 ? Math.floor(Number(bucketSeconds)) : 3600;
  const endHour = Math.floor(Number(windowEnd) / interval) * interval;
  const startHour = Math.ceil(Number(windowStart) / interval) * interval;
  const buckets = [];
  for (let ts = startHour; ts <= endHour; ts += interval) {
    const point = points.get(ts);
    const rate = point?.success_rate;
    buckets.push({ ts, rate: rate != null && Number.isFinite(Number(rate)) ? Math.min(100, Math.max(0, Number(rate))) : null });
  }
  return buckets;
}

export function healthDisplayBuckets(metric, windowStart, windowEnd, bucketSeconds = 3600) {
  if (!(Number(windowStart) > 0) || !(Number(windowEnd) >= Number(windowStart))) return [];
  const points = new Map((metric?.recent_success_series || []).map((point) => [Number(point.ts), point]));
  const interval = Number.isFinite(Number(bucketSeconds)) && Number(bucketSeconds) > 0 ? Math.floor(Number(bucketSeconds)) : 3600;
  const buckets = [];
  for (let ts = Number(windowStart); ts <= Number(windowEnd); ts += interval) {
    const rate = points.get(ts)?.success_rate;
    buckets.push({ ts, rate: rate != null && Number.isFinite(Number(rate)) ? Math.min(100, Math.max(0, Number(rate))) : null });
  }
  return buckets;
}
