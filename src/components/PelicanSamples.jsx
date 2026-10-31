import { useEffect, useMemo, useState } from 'react';
import { Bird, Clock3, Columns2, Play, RefreshCw, X } from 'lucide-react';
import { request } from '../lib/newapi.js';
import { pelicanTargetKey, pelicanWorkKey, togglePelicanWorkComparison } from '../lib/pelican-preview.js';
import { useLanguage } from '../lib/use-language.js';
import Dialog from './Dialog.jsx';
import SampleImage from './PelicanSamplePreview.jsx';
import PelicanHistory from './PelicanHistory.jsx';
import PelicanGalleryGroup from './PelicanGalleryGroup.jsx';
import PelicanWorkViewer from './PelicanWorkViewer.jsx';
import './pelican-samples.css';

function PelicanComparison({ targets, onClose, onExpand }) {
  const { t, locale } = useLanguage();
  const [replayVersion, setReplayVersion] = useState(0);
  const sameHour = new Set(targets.map((target) => target.latest.hour)).size === 1;
  const samePrompt = new Set(targets.map((target) => target.latest.prompt_version)).size === 1;
  return <Dialog title={t('模型结果对比')} onClose={onClose} className="pelican-dialog pelican-compare-dialog">
    <div className="pelican-compare-heading"><p className="pelican-note">{t('已固定本次打开的样例，可跨分组比较。')}</p><button className="button outline small" onClick={() => setReplayVersion((value) => value + 1)}><Play size={14} />{t('全部重播')}</button></div>
    {(!sameHour || !samePrompt) && <p className="pelican-compare-warning" role="note">{t('这些样例的采样时段或提示词版本不同，请结合标注比较。')}</p>}
    <div className="pelican-comparison-scroll" role="region" aria-label={t('模型结果并排对比，可横向滚动')} tabIndex={0}>
      <div className="pelican-comparison-grid" style={{ '--compare-count': targets.length }}>
        {targets.map((target) => <article className="pelican-card" key={pelicanWorkKey(target)}>
          <header><h3 title={target.model}>{target.model}</h3><span>{target.group}</span></header>
          <SampleImage sample={target.latest} model={target.model} replayVersion={replayVersion} onExpand={() => onExpand(target)} />
          <div className="pelican-compare-meta"><time dateTime={new Date(target.latest.checked_at * 1000).toISOString()}>{new Date(target.latest.checked_at * 1000).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span>{t('耗时 {seconds} 秒', { seconds: (target.latest.latency_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }) })}</span><small>{target.latest.prompt_version || '—'}</small></div>
        </article>)}
      </div>
    </div>
  </Dialog>;
}

export default function PelicanSamples() {
  const { t } = useLanguage();
  const [state, setState] = useState({ data: null, loading: true, error: false });
  const [filter, setFilter] = useState('success');
  const [group, setGroup] = useState('');
  const [detail, setDetail] = useState(null);
  const [work, setWork] = useState(null);
  const [revision, setRevision] = useState(0);
  const [selectedWorks, setSelectedWorks] = useState([]);
  const [comparison, setComparison] = useState(null);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await request('/pelican/catalog');
        if (active) setState({ data, loading: false, error: false });
      } catch { if (active) setState((previous) => ({ ...previous, loading: false, error: true })); }
      finally { inFlight = false; }
    };
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [revision]);
  const targets = state.data?.targets || [];
  const groups = useMemo(() => [...new Set(targets.map((item) => item.group))], [targets]);
  const selectedGroup = groups.includes(group) ? group : '';
  const isPublished = (target) => target && targets.some((item) => pelicanTargetKey(item) === pelicanTargetKey(target));
  const publicDetail = isPublished(detail) && detail;
  const publicWork = isPublished(work) && work;
  const comparisonTargets = selectedWorks.filter(isPublished);
  const selectedKeys = comparisonTargets.map(pelicanWorkKey);
  const publicComparison = comparison?.filter(isPublished);
  const openWork = (target) => { setComparison(null); setDetail(null); setWork(target); };
  const openHistory = (target) => { setWork(null); setComparison(null); setDetail(target); };

  if (!state.loading && state.data?.public_enabled === false) return null;
  return <section className="pelican-samples" aria-label={t('鹈鹕测智')} aria-busy={state.loading}>
    <header className="pelican-heading"><div className="pelican-heading-title"><h2>{t('作品画廊')}</h2><span>{t('按分组浏览模型的真实生成结果')}</span></div><div className="pelican-summary"><span className="pelican-cadence"><Clock3 size={14} />{t('每小时一次')}</span><button className="icon-button" aria-label={t('刷新实测结果')} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} /></button></div></header>
    {state.data && !state.data.enabled && <div className="pelican-note">{t('定时实测已暂停，历史结果仍可查看。')}</div>}
    {state.error && <div role="alert" className="pelican-retry">{t('实测记录暂时无法加载')}<button onClick={() => setRevision((n) => n + 1)}><RefreshCw size={14} />{t('重试')}</button></div>}
    {state.loading ? <div className="mp-empty" role="status">{t('正在读取实测记录…')}</div> : !targets.length && !state.error ? <div className="mp-empty"><Bird size={30} /><strong>{t('管理员尚未配置公开实测模型')}</strong></div> : <>
      <div className="pelican-browse-toolbar"><select aria-label={t('公开实测分组')} value={selectedGroup} onChange={(event) => setGroup(event.target.value)}><option value="">{t('全部分组')}</option>{groups.map((name) => <option key={name} value={name}>{name}</option>)}</select><div className="pelican-gallery-filters" role="group" aria-label={t('筛选实测状态')}>{[['all', '全部'], ['success', '成功'], ['failed', '失败']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}</div><span className="pelican-gallery-hint">{t('横向浏览，点击作品放大')}</span></div>
      <div className="pelican-gallery">{groups.filter((name) => !selectedGroup || name === selectedGroup).map((name) => <PelicanGalleryGroup key={name} name={name} targets={targets.filter((target) => target.group === name)} filter={filter} revision={revision} selectedKeys={selectedKeys} onCompare={(target) => setSelectedWorks(togglePelicanWorkComparison(comparisonTargets, target))} onOpen={openWork} onHistory={openHistory} />)}</div>
      {!!selectedKeys.length && <div className="pelican-compare-toolbar"><div className="pelican-compare-selection"><span>{t('已选 {count}/4', { count: selectedKeys.length })}</span>{comparisonTargets.map((target) => <button key={pelicanWorkKey(target)} title={`${target.group} / ${target.model}`} aria-label={t('移除对比 {group} / {model}', target)} onClick={() => setSelectedWorks((items) => items.filter((item) => pelicanWorkKey(item) !== pelicanWorkKey(target)))}><span>{target.group} · {target.model}</span><X size={12} /></button>)}</div><div className="pelican-compare-actions"><button className="mp-reset" onClick={() => setSelectedWorks([])}>{t('清空')}</button><button className="button primary small" disabled={selectedKeys.length < 2} onClick={() => setComparison(comparisonTargets.map((item) => ({ ...item, latest: { ...item.latest } }))) }><Columns2 size={15} />{t('并排对比')}</button></div></div>}
    </>}
    {state.data?.prompt && <details className="pelican-prompt"><summary>{t('统一测试提示词')} · {state.data.prompt_version}</summary><p>{state.data.prompt}</p><span>{t('历史记录保留 {days} 天', { days: state.data.retention_days })}</span></details>}
    {publicWork && <PelicanWorkViewer key={pelicanWorkKey(publicWork)} work={publicWork} onClose={() => setWork(null)} onHistory={() => openHistory(publicWork)} />}
    {publicDetail && <PelicanHistory key={pelicanTargetKey(publicDetail)} target={publicDetail} initialId={publicDetail.latest?.id} onClose={() => setDetail(null)} />}
    {publicComparison?.length >= 2 && <PelicanComparison targets={publicComparison} onExpand={openWork} onClose={() => setComparison(null)} />}
  </section>;
}
