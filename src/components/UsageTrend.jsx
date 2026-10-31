import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { newApi } from '../lib/newapi.js';
import { formatNumber, formatQuotaDisplay } from '../lib/usage-format.js';
import { aggregateDailyUsage, dailyUsageWindow } from '../lib/usage-trend.js';
import { useLanguage } from '../lib/use-language.js';
import './usage-trend.css';

export default function UsageTrend({ status }) {
  const { t, locale } = useLanguage();
  const [days, setDays] = useState(7);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ points: [], loading: true, error: false, days: 7 });
  const [selected, setSelected] = useState(null);
  const disabled = status?.enable_data_export === false;
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    setSelected(null);
    setState({ points: [], loading: true, error: false, days });
    const window = dailyUsageWindow(days);
    const query = new URLSearchParams({ start_timestamp: String(window.start), end_timestamp: String(window.end) });
    newApi.usageTrend(`?${query}`, controller.signal).then((rows) => {
      const points = aggregateDailyUsage(rows, window);
      if (!controller.signal.aborted) setState({ points, loading: false, error: false, days });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ points: [], loading: false, error: true, days });
    });
    return () => controller.abort();
  }, [days, revision, disabled]);
  const loading = state.loading || state.days !== days;
  const points = loading || disabled ? [] : state.points;
  const hasRecords = points.some((point) => point.recorded);
  const total = points.reduce((sum, point) => sum + point.quota, 0);
  const max = Math.max(0, ...points.map((point) => point.quota));
  const active = points[selected ?? points.length - 1];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <section className="panel usage-trend" aria-label={t('每日消费趋势')} aria-busy={!disabled && loading}>
    <div className="usage-trend-heading"><div><h2><BarChart3 size={18} />{t('每日消费趋势')}</h2><p>{t('按自然日统计')} · {zone}</p></div><div className="usage-trend-controls"><div className="segmented" role="group" aria-label={t('消费趋势周期')}>{[7, 30].map((value) => <button key={value} aria-pressed={days === value} className={days === value ? 'selected' : ''} onClick={() => setDays(value)}>{t('近 {days} 天', { days: value })}</button>)}</div><button className="icon-button" aria-label={t('刷新消费趋势')} disabled={disabled || loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button></div></div>
    {disabled ? <p className="usage-trend-empty">{t('站点尚未启用消费聚合统计，请联系管理员。')}</p> : loading ? <p className="usage-trend-empty" role="status">{t('正在读取消费趋势…')}</p> : state.error ? <div className="usage-trend-empty" role="alert">{t('消费趋势暂时无法加载')}<button className="button outline small" onClick={() => setRevision((value) => value + 1)}>{t('重试')}</button></div> : !hasRecords ? <p className="usage-trend-empty">{t('当前周期暂无消费统计')}</p> : <>
      <div className="usage-trend-summary"><div><span>{t('已统计消费')}</span><strong>{formatQuotaDisplay(total, status)}</strong></div><div><span>{t('日均消费')}</span><strong>{formatQuotaDisplay(total / points.length, status)}</strong></div><div><span>{t('单日最高')}</span><strong>{formatQuotaDisplay(max, status)}</strong></div></div>
      <div className="usage-trend-detail" aria-live="polite"><time dateTime={active.date.toISOString()}>{active.date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })}</time><strong>{active.recorded ? formatQuotaDisplay(active.quota, status) : t('无聚合记录')}</strong><span>{t('{count} 次请求', { count: formatNumber(active.count) })} · {formatNumber(active.tokens)} Tokens</span></div>
      <div className="usage-trend-chart" role="group" aria-label={t('每日消费柱状图')}>
        {points.map((point, index) => {
          const date = point.date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
          const label = `${date} · ${point.recorded ? formatQuotaDisplay(point.quota, status) : t('无聚合记录')} · ${t('{count} 次请求', { count: formatNumber(point.count) })}`;
          return <button key={point.date.getTime()} className={`usage-trend-day${active === point ? ' selected' : ''}`} aria-label={label} title={label} aria-pressed={active === point} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
            event.currentTarget.parentElement.children[next]?.focus();
          }}><span className="usage-trend-track"><span className={`usage-trend-bar${point.recorded ? '' : ' unrecorded'}`} style={{ height: `${max > 0 ? point.quota / max * 100 : 0}%` }} /></span><span className={`usage-trend-date${days === 30 && index % 5 !== 0 && index !== points.length - 1 ? ' sparse' : ''}`}>{date}</span></button>;
        })}
      </div>
      <p className="usage-trend-note">{t('包含今天，聚合统计可能延迟；无记录日期按 0 计入日均，最终消费以调用记录为准。')}</p>
    </>}
  </section>;
}
