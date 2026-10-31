import { useEffect, useMemo, useRef, useState } from 'react';
import { Bird, ChevronLeft, ChevronRight, Clock3, History, Maximize2, RefreshCw } from 'lucide-react';
import { request } from '../lib/newapi.js';
import { mergePelicanHistory, pelicanGalleryRecords, pelicanTargetKey, pelicanWorkKey } from '../lib/pelican-preview.js';
import { useLanguage } from '../lib/use-language.js';
import SampleImage from './PelicanSamplePreview.jsx';

export default function PelicanGalleryGroup({ name, targets, filter, revision, selectedKeys, onCompare, onOpen, onHistory }) {
  const { t, locale } = useLanguage();
  const host = useRef(null);
  const strip = useRef(null);
  const pageRequest = useRef(null);
  const [visible, setVisible] = useState(false);
  const [histories, setHistories] = useState({});
  const [model, setModel] = useState('');
  const [limit, setLimit] = useState(12);
  const [retry, setRetry] = useState(0);
  const [paging, setPaging] = useState(false);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const signature = JSON.stringify(targets);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    pageRequest.current?.abort();
    setPaging(false);
    const items = JSON.parse(signature);
    setHistories({});
    setLimit(12);
    let index = 0;
    const load = async () => {
      while (index < items.length && !controller.signal.aborted) {
        const target = items[index++];
        const key = pelicanTargetKey(target);
        try {
          const data = await request(`/pelican/history?${new URLSearchParams({ group: target.group, model: target.model })}`, { signal: controller.signal });
          if (!controller.signal.aborted) setHistories((previous) => ({ ...previous, [key]: { records: data.records || [], next: data.next_before || 0, loaded: true, error: false } }));
        } catch {
          if (!controller.signal.aborted) setHistories((previous) => ({ ...previous, [key]: { loaded: false, error: true } }));
        }
      }
    };
    for (let worker = 0; worker < Math.min(items.length, 3); worker++) void load();
    return () => { controller.abort(); pageRequest.current?.abort(); };
  }, [signature, revision, retry, visible]);
  useEffect(() => { setLimit(12); strip.current?.scrollTo({ left: 0 }); }, [model, filter]);

  const selectedModel = targets.some((target) => target.model === model) ? model : '';
  const works = useMemo(() => pelicanGalleryRecords(targets, histories), [targets, histories]);
  const records = works.filter((work) => (!selectedModel || work.model === selectedModel) && (filter === 'all' || work.latest.status === filter));
  const displayed = records.slice(0, limit);
  const loading = visible && targets.some((target) => !histories[pelicanTargetKey(target)]);
  const failed = targets.some((target) => histories[pelicanTargetKey(target)]?.error);
  const canPage = targets.some((target) => (!selectedModel || target.model === selectedModel) && histories[pelicanTargetKey(target)]?.next > 0);
  const hasMore = records.length > limit || canPage;
  const latest = Math.max(0, ...works.map((work) => work.latest.checked_at));
  const shortTime = (time) => new Date(time * 1000).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const update = () => setScroll({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [displayed.length, hasMore]);

  const loadMore = async () => {
    if (records.length > limit) { setLimit((value) => value + 12); return; }
    if (paging) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setPaging(true);
    const items = targets.filter((target) => (!selectedModel || target.model === selectedModel) && histories[pelicanTargetKey(target)]?.next > 0);
    await Promise.allSettled(items.map(async (target) => {
      const key = pelicanTargetKey(target);
      const before = histories[key].next;
      try {
        const data = await request(`/pelican/history?${new URLSearchParams({ group: target.group, model: target.model, before: String(before) })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setHistories((previous) => ({ ...previous, [key]: { ...previous[key], records: mergePelicanHistory(previous[key]?.records || [], data.records || []), next: data.next_before || 0, error: false } }));
      } catch { if (!controller.signal.aborted) setHistories((previous) => ({ ...previous, [key]: { ...previous[key], error: true } })); }
    }));
    if (!controller.signal.aborted) { setLimit((value) => value + 12); setPaging(false); }
  };
  const move = (direction) => strip.current?.scrollBy({ left: direction * (strip.current.clientWidth * .85), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });

  return <section ref={host} className="pelican-gallery-group" aria-label={name} aria-busy={loading}>
    <header className="pelican-group-heading">
      <div className="pelican-group-identity"><div className="pelican-group-icon"><Bird size={23} /></div><div><h3>{name}</h3><p>{t('{count} 个模型', { count: targets.length })}{latest > 0 && <><span>·</span>{t('最近检测 {time}', { time: shortTime(latest) })}</>}</p></div></div>
      <div className="pelican-group-controls"><select aria-label={t('筛选 {group} 的模型', { group: name })} value={selectedModel} onChange={(event) => setModel(event.target.value)}><option value="">{t('全部模型')}</option>{targets.map((target) => <option value={target.model} key={target.model}>{target.model}</option>)}</select><div className="pelican-row-navigation"><button className="icon-button" aria-label={t('向左浏览 {group}', { group: name })} disabled={!scroll.left} onClick={() => move(-1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label={t('向右浏览 {group}', { group: name })} disabled={!scroll.right} onClick={() => move(1)}><ChevronRight size={18} /></button></div></div>
    </header>
    {failed && <div className="pelican-group-error" role="alert">{t('部分历史记录加载失败，已显示可用结果。')}<button onClick={() => setRetry((value) => value + 1)}><RefreshCw size={13} />{t('重试')}</button></div>}
    <div ref={strip} className="pelican-gallery-strip" role="region" aria-label={t('{group} 的作品，可横向滚动', { group: name })} tabIndex={0}>
      {displayed.map((work) => {
        const sample = work.latest;
        const key = pelicanWorkKey(work);
        const checked = selectedKeys.includes(key);
        const disabled = sample.status !== 'success' || (!checked && selectedKeys.length >= 4);
        return <article className={`pelican-work-card${checked ? ' is-comparing' : ''}`} key={key} data-sample-id={sample.id}>
          <div className="pelican-work-thumbnail"><SampleImage compact sample={sample} model={work.model} /><button className="pelican-open-work" aria-label={t('查看 {model} 在 {time} 的作品', { model: work.model, time: shortTime(sample.checked_at) })} onClick={() => onOpen(work)}><span><Maximize2 size={15} />{t('放大查看')}</span></button></div>
          <footer><div className="pelican-work-card-title"><strong title={work.model}>{work.model}</strong><span className={`pelican-status ${sample.status}`}><i />{t(sample.status === 'success' ? '成功' : sample.status === 'running' ? '正在生成…' : '失败')}</span></div><div className="pelican-work-card-meta"><time dateTime={new Date(sample.checked_at * 1000).toISOString()}>{shortTime(sample.checked_at)}</time><span><Clock3 size={12} />{t('耗时 {seconds} 秒', { seconds: (sample.latency_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }) })}</span></div><div className="pelican-work-card-actions"><label className={`pelican-compare-check${disabled ? ' disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} aria-label={t('加入对比 {group} / {model}', work)} onChange={() => onCompare(work)} />{t('对比')}</label><button onClick={() => onHistory(work)}><History size={13} />{t('模型历史')}</button></div></footer>
        </article>;
      })}
      {hasMore && <div className="pelican-gallery-more"><button className="button outline small" disabled={loading || paging} onClick={loadMore}>{paging ? t('正在读取实测记录…') : t('加载更多作品')}<ChevronRight size={15} /></button><span>{t('已加载 {count} 条', { count: works.length })}</span></div>}
      {!displayed.length && <div className="pelican-gallery-empty" role="status"><Bird size={28} /><p>{t(loading || !visible ? '正在读取实测记录…' : works.length ? '当前筛选下暂无记录' : '等待首次实测')}</p></div>}
    </div>
  </section>;
}
