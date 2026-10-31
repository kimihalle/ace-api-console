import { useEffect, useRef, useState } from 'react';
import { Bird, Clock3, Code2, Maximize2, Play } from 'lucide-react';
import { loadPelicanDocument } from '../lib/newapi.js';
import { useLanguage } from '../lib/use-language.js';
import PelicanPreview from './PelicanPreview.jsx';

const errorLabels = {
  upstream_error: '上游请求失败', no_channel: '当前没有可用渠道', timeout: '生成超时',
  no_svg: '模型未返回 SVG', invalid_svg: 'SVG 格式不完整', unsafe_svg: '旧版记录被安全过滤，请重新检测',
  output_too_large: '输出超出大小限制', interrupted: '检测被中断',
  pricing_error: '模型计价配置错误', request_configuration_error: '检测请求配置错误',
  connection_error: '无法连接上游', upstream_http_error: '上游拒绝检测请求',
  response_error: '上游响应解析失败', internal_error: '检测内部错误',
  no_html: '模型未返回 HTML', invalid_html: 'HTML 不完整，请重新检测',
};

export default function PelicanSamplePreview({ sample, model, replayVersion = 0, onExpand, compact = false, display = 'responsive' }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  const [document, setDocument] = useState(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const host = useRef(null);
  const [visible, setVisible] = useState(!compact);
  useEffect(() => {
    if (!compact) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [compact]);
  useEffect(() => {
    if (!visible || sample?.status !== 'success') return;
    setDocument(null);
    setFailed(false);
    const controller = new AbortController();
    loadPelicanDocument(sample.id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setDocument(data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [sample?.id, sample?.status, sample?.checked_at, attempt, visible]);

  if (!sample) return <div ref={host} className="pelican-placeholder"><Bird size={32} /><strong>{t('等待首次实测')}</strong></div>;
  if (sample.status !== 'success' || failed) return <div ref={host} className={`pelican-placeholder ${sample.status}`}>
    <Clock3 size={30} />
    <strong>{failed ? t('卡片暂时无法显示') : sample.status === 'running' ? t('正在生成…') : t(errorLabels[sample.error_code] || '卡片暂时无法显示')}</strong>
    {sample.status === 'failed' && <span>{t('本次没有生成可预览的结果，可切换其他时段。')}</span>}
    {failed && !compact && <button className="mp-reset" onClick={() => setAttempt((n) => n + 1)}>{t('重试')}</button>}
  </div>;
  if (!document) return <div ref={host} className="pelican-placeholder" role="status">{t('正在读取实测记录…')}</div>;
  return <div ref={host} className="pelican-renderer">
    <PelicanPreview source={document.source} format={document.format} title={t('{model} 生成的鹈鹕骑行图', { model })} revision={`${replayVersion}:${revision}`} display={compact ? 'thumbnail' : display} />
    {!compact && <div className="pelican-render-tools">
      <span className="pelican-format"><i />{document.format === 'html' ? t('动态 HTML') : t('历史 SVG')}</span>
      <button onClick={() => setRevision((n) => n + 1)} title={t('重新播放')} aria-label={t('重新播放')}><Play size={15} /><span>{t('重播')}</span></button>
      <button aria-expanded={sourceOpen} onClick={() => setSourceOpen((value) => !value)}><Code2 size={15} />{t(sourceOpen ? '收起代码' : '查看代码')}</button>
      {onExpand && <button onClick={onExpand}><Maximize2 size={15} />{t('放大查看')}</button>}
    </div>}
    {sourceOpen && <pre className="pelican-source" tabIndex={0}><code>{document.source}</code></pre>}
  </div>;
}
