import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, History, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { request } from '../lib/newapi.js';
import { mergePelicanHistory } from '../lib/pelican-preview.js';
import { useLanguage } from '../lib/use-language.js';
import Dialog from './Dialog.jsx';
import SampleImage from './PelicanSamplePreview.jsx';

export default function PelicanHistory({ target, initialId, initialFocus = false, onClose }) {
  const { t, locale } = useLanguage();
  const [state, setState] = useState({ records: [], next: 0, loading: true, error: false });
  const [cursor, setCursor] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState(initialId ?? null);
  const [filter, setFilter] = useState('all');
  const [focused, setFocused] = useState(initialFocus);
  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    request(`/pelican/history?${new URLSearchParams({ group: target.group, model: target.model, before: String(cursor) })}`)
      .then((data) => { if (active) setState((previous) => ({ records: cursor ? mergePelicanHistory(previous.records, data.records) : mergePelicanHistory(initialId && target.latest?.id === initialId ? [target.latest] : [], data.records).sort((a, b) => b.hour - a.hour), next: data.next_before, loading: false, error: false })); })
      .catch(() => { if (active) setState((previous) => ({ ...previous, loading: false, error: true })); });
    return () => { active = false; };
  }, [target.group, target.model, cursor, revision]);

  const records = state.records.filter((record) => filter === 'all' || record.status === filter);
  const sample = records.find((record) => record.id === selectedId) || records.find((record) => record.status === 'success') || records[0];
  const index = records.findIndex((record) => record.id === sample?.id);
  const shortTime = (timestamp) => new Date(timestamp * 1000).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return <Dialog title={t('每小时实测记录')} onClose={onClose} className={`pelican-dialog pelican-history-dialog${focused ? ' is-focused' : ''}`}>
    <div className="pelican-viewer-heading">
      <div className="pelican-target"><span>{target.group}</span><h3>{target.model}</h3></div>
      <button className="button outline small" aria-pressed={focused} onClick={() => setFocused((value) => !value)}>
        {focused ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}{t(focused ? '显示时间轴' : '收起时间轴')}
      </button>
    </div>
    <div className="pelican-history-workspace">
      <aside className="pelican-history-sidebar" aria-label={t('实测时间轴')}>
        <div className="pelican-history-sidebar-heading"><History size={15} /><strong>{t('实测时间轴')}</strong><span>{t('已加载 {count} 条', { count: state.records.length })}</span></div>
        <div className="pelican-history-filters" role="group" aria-label={t('筛选实测状态')}>
          {[['all', '全部'], ['success', '成功'], ['failed', '失败']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelectedId(null); }}>{t(label)}</button>)}
        </div>
        <div className="pelican-history">
          {records.map((record) => <button type="button" key={record.id} className={`pelican-history-item ${record.status}${sample?.id === record.id ? ' selected' : ''}`} aria-pressed={sample?.id === record.id} onClick={() => setSelectedId(record.id)}>
            <span className="pelican-history-dot" />
            <span className="pelican-history-label"><time dateTime={new Date(record.hour * 1000).toISOString()}>{shortTime(record.hour)}</time><span className={`pelican-status ${record.status}`}>{t(record.status === 'success' ? '生成成功' : record.status === 'running' ? '正在生成…' : '生成失败')}</span></span>
            <span className="pelican-history-duration">{t('耗时 {seconds} 秒', { seconds: (record.latency_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 3 }) })}</span>
            {sample?.id === record.id && <Check size={14} className="pelican-history-selected" />}
          </button>)}
          {!state.loading && !state.error && !records.length && <p className="pelican-history-empty">{t('当前筛选下暂无记录')}</p>}
          {state.loading && <p className="pelican-history-empty" role="status">{t('正在读取实测记录…')}</p>}
          {state.error && <div role="alert" className="pelican-retry">{t('实测记录暂时无法加载')}<button onClick={() => setRevision((n) => n + 1)}>{t('重试')}</button></div>}
          {state.next > 0 && !state.error && <button className="pelican-load-earlier" disabled={state.loading} onClick={() => setCursor(state.next)}>{t('加载更早记录')}</button>}
        </div>
        <p className="pelican-history-disclaimer">{t('没有记录的时段表示未采样，不代表检测成功。')}</p>
      </aside>
      <section className="pelican-history-stage" aria-label={t('实测结果大预览')}>
        <header className="pelican-stage-heading">
          <div><span>{t('实测结果')}</span>{sample && <time dateTime={new Date(sample.hour * 1000).toISOString()}>{shortTime(sample.hour)}</time>}</div>
          <div className="pelican-stage-navigation">
            <button aria-label={t('较新记录')} disabled={index <= 0} onClick={() => setSelectedId(records[index - 1].id)}><ChevronLeft size={18} /></button>
            <span>{sample ? index + 1 : 0} / {records.length}</span>
            <button aria-label={t('较早记录')} disabled={index < 0 || index >= records.length - 1} onClick={() => setSelectedId(records[index + 1].id)}><ChevronRight size={18} /></button>
          </div>
        </header>
        <div className="pelican-stage-visual"><SampleImage key={sample?.id ?? 'empty'} sample={sample} model={target.model} /></div>
        {sample && <footer className="pelican-stage-meta">
          <span className={`pelican-status ${sample.status}`}>{t(sample.status === 'success' ? '生成成功' : sample.status === 'running' ? '正在生成…' : '生成失败')}</span>
          <span>{t('耗时 {seconds} 秒', { seconds: (sample.latency_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 3 }) })}</span>
          <span>{t('实际检测时间')} {new Date(sample.checked_at * 1000).toLocaleString(locale)}</span>
          <span className="pelican-prompt-version">{sample.prompt_version}</span>
        </footer>}
      </section>
    </div>
  </Dialog>;
}
