import { useState } from 'react';
import { Activity } from 'lucide-react';
import { healthDisplayBuckets } from '../lib/usage-format.js';
import { useLanguage } from '../lib/use-language.js';

export default function ModelHealth({ model, metric: selectedMetric, scope, metrics, loading, error }) {
  const { t, locale } = useLanguage();
  const group = scope || t('全部分组');
  const probes = metrics?.source === 'channel_checks';
  const interval = probes ? Number(metrics?.bucket_seconds) || 300 : 3600;
  const [active, setActive] = useState(null);
  const metric = selectedMetric !== undefined ? selectedMetric : metrics?.models?.find((item) => item.model_name === model);
  const firstSample = probes ? metrics?.success_series?.[0]?.ts : null;
  const displayStart = Number(firstSample) > 0 ? firstSample : metrics?.window_start;
  const buckets = healthDisplayBuckets(metric, displayStart, metrics?.window_end, interval);
  const rate = metric?.success_rate;
  const hasData = rate != null && Number.isFinite(Number(rate)) && buckets.some((bucket) => bucket.rate != null);
  const current = active == null ? null : buckets[active];
  const label = error ? t('暂不可用') : hasData ? `${Number(rate).toFixed(1)}%` : loading ? t('读取中') : t('暂无数据');
  const tone = hasData ? Number(rate) === 100 ? 'healthy' : Number(rate) === 0 ? 'failed' : 'degraded' : 'unknown';
  const time = (ts) => new Date(ts * 1000).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return <div className="model-health">
    <div className="model-health-heading" title={t(probes ? '{scope}的渠道检测成功率；按后台检测间隔采样，灰色表示该时段暂无检测' : '{scope}的实际调用成功率；每格一小时，灰色表示暂无请求', { scope: group })}><span><Activity size={13} />{t('状态趋势')}</span><strong className={`health-rate ${error ? 'unknown' : tone}`}>{label}</strong><small>{t('近 8 小时')}</small></div>
    <div className={`health-timeline ${probes ? 'probe-timeline' : ''}`} style={{ '--health-bucket-count': Math.max(buckets.length, 1) }} role="group" tabIndex={buckets.length ? 0 : undefined}
      aria-label={t('{model}，{label}。左右方向键查看时段。', { model, label })}
      onFocus={() => setActive(buckets.length - 1)} onBlur={() => setActive(null)} onMouseLeave={(event) => { if (document.activeElement !== event.currentTarget) setActive(null); }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        setActive((index) => event.key === 'Escape' ? null : event.key === 'Home' ? 0 : event.key === 'End' ? buckets.length - 1 : Math.max(0, Math.min(buckets.length - 1, (index ?? buckets.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
      {(buckets.length ? buckets : Array.from({ length: probes ? 96 : 8 }, (_, index) => ({ ts: index, rate: null }))).map((bucket, index) => <span key={bucket.ts} aria-hidden="true"
        className={`health-bar ${error || bucket.rate == null ? 'unknown' : bucket.rate === 100 ? 'healthy' : bucket.rate === 0 ? 'failed' : 'degraded'} ${active === index ? 'inspected' : ''}`}
        onMouseEnter={() => setActive(buckets.length ? index : null)} />)}
      {current && <div className="health-tooltip" role="status">{time(current.ts)} – {time(Math.min(current.ts + interval, Number(metrics.window_end)))}<br />{error ? t('监测数据读取失败') : current.rate == null ? t(probes ? '该时段暂无检测' : '该时段暂无请求') : t(probes ? '{scope} · 检测成功率 {rate}%' : '{scope} · 调用成功率 {rate}%', { scope: group, rate: current.rate.toFixed(1) })}</div>}
    </div>
    {buckets.length > 0 && <div className="mp-health-axis"><span title={time(displayStart)}>{t(probes ? '最早检测' : '8 小时前')}</span><span title={time(metrics.window_end)}>{t('最新')}</span></div>}
  </div>;
}
