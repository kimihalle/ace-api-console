import { useEffect, useId, useState } from 'react';
import { ChartSpline, RefreshCw } from 'lucide-react';
import { newApi } from '../lib/newapi.js';
import { formatNumber, formatUsdQuota } from '../lib/usage-format.js';
import { aggregateDailyUsage, buildUsageTrendChart, dailyUsageWindow, summarizeDailyUsage } from '../lib/usage-trend.js';
import { useLanguage } from '../lib/use-language.js';
import './usage-trend.css';

export default function UsageTrend({ status }) {
  const { t, locale } = useLanguage();
  const gradientId = useId();
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
  const summary = summarizeDailyUsage(points);
  const active = points[selected ?? points.length - 1];
  const chart = buildUsageTrendChart(points);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <section className="panel usage-trend" aria-label={t('每日消费趋势')} aria-busy={!disabled && loading}>
    <div className="usage-trend-heading"><div><h2><ChartSpline size={18} />{t('每日消费趋势')}</h2><p title={`${t('按自然日统计')} · ${zone}`}>{t('美元额度（USD）')} · {t('近 {days} 个自然日', { days })} · {t('全部模型与分组')}</p></div><div className="usage-trend-controls"><div className="segmented" role="group" aria-label={t('消费趋势周期')}>{[7, 30].map((value) => <button key={value} aria-pressed={days === value} className={days === value ? 'selected' : ''} onClick={() => setDays(value)}>{t('近 {days} 天', { days: value })}</button>)}</div><button className="icon-button" aria-label={t('刷新消费趋势')} disabled={disabled || loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button></div></div>
    {disabled ? <p className="usage-trend-empty">{t('站点尚未启用消费聚合统计，请联系管理员。')}</p> : loading ? <p className="usage-trend-empty" role="status">{t('正在读取消费趋势…')}</p> : state.error ? <div className="usage-trend-empty" role="alert">{t('消费趋势暂时无法加载')}<button className="button outline small" onClick={() => setRevision((value) => value + 1)}>{t('重试')}</button></div> : !hasRecords ? <p className="usage-trend-empty">{t('当前周期暂无消费统计')}</p> : <>
      <div className="usage-trend-summary"><div><span>{t('已统计消费')}</span><strong>{formatUsdQuota(summary.totalQuota, status)}</strong></div><div><span>{t('日均消费')}</span><strong>{formatUsdQuota(summary.averageQuota, status)}</strong></div><div><span>{t('单日最高')}</span><strong>{formatUsdQuota(summary.maxQuota, status)}</strong></div><div title={t('输入与输出 Token 合计，缓存用量不重复累加')}><span>{t('总消耗 Token')}</span><strong>{formatNumber(summary.totalTokens)}</strong></div></div>
      <div className="usage-trend-detail" aria-live="polite"><time dateTime={active.date.toISOString()}>{active.date.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })}</time><strong>{active.recorded ? formatUsdQuota(active.quota, status) : t('无聚合记录')}</strong>{active.recorded && <><span>{t('{count} 次请求', { count: formatNumber(active.count) })}</span><span>{t('当日总 Token（输入 + 输出）')} <b>{formatNumber(active.tokens)}</b></span></>}</div>
      <div className="usage-trend-chart" role="group" aria-label={t('每日消费曲线图')}>
        <div className="usage-trend-axis" aria-hidden="true">{chart.ticks.map((tick) => <span key={tick.value} style={{ top: `${tick.y / chart.height * 100}%` }}>{formatUsdQuota(tick.value, status)}</span>)}</div>
        <div className="usage-trend-plot">
          <svg className="usage-trend-curve" viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0.015" /></linearGradient></defs>
            {chart.ticks.map((tick) => <line className="usage-trend-gridline" key={tick.value} x1="0" x2={chart.width} y1={tick.y} y2={tick.y} />)}
            {chart.curves.map((curve, index) => <g key={index}><path d={curve.area} fill={`url(#${gradientId})`} /><path className="usage-trend-line" d={curve.line} /></g>)}
          </svg>
          <div className="usage-trend-days" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
            {points.map((point, index) => {
              const date = point.date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
              const label = `${date} · ${point.recorded ? `${formatUsdQuota(point.quota, status)} · ${t('{count} 次请求', { count: formatNumber(point.count) })} · ${t('当日总 Token（输入 + 输出）')} ${formatNumber(point.tokens)}` : t('无聚合记录')}`;
              return <button type="button" key={point.date.getTime()} className={`usage-trend-day${active === point ? ' selected' : ''}`} aria-label={label} title={label} aria-pressed={active === point} tabIndex={active === point ? 0 : -1} onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
                event.currentTarget.parentElement.children[next]?.focus();
              }}>
                {active === point && <span className="usage-trend-cursor" aria-hidden="true" />}
                {point.recorded && <span className="usage-trend-dot" style={{ top: `${chart.points[index].y / chart.height * 100}%` }} aria-hidden="true" />}
                <span className={`usage-trend-date${days === 30 && index % 5 !== 0 && index !== points.length - 1 ? ' sparse' : ''}`}>{date}</span>
              </button>;
            })}
          </div>
        </div>
      </div>
      <p className="usage-trend-note">{t('包含今天，聚合统计可能延迟；无记录日期按 0 计入日均，最终消费以调用记录为准。')} {t('调用消费汇总未扣除后续退款，账户累计以仪表盘为准。')}</p>
    </>}
  </section>;
}
