import { useState } from 'react';
import { Clock3, History } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';
import Dialog from './Dialog.jsx';
import SampleImage from './PelicanSamplePreview.jsx';

export default function PelicanWorkViewer({ work, onClose, onHistory }) {
  const { t, locale } = useLanguage();
  const [display, setDisplay] = useState('fit');
  const sample = work.latest;
  return <Dialog title={`${work.group} · ${work.model}`} onClose={onClose} className="pelican-dialog pelican-work-dialog">
    <div className="pelican-work-toolbar">
      <div className="pelican-work-meta"><span className="pelican-group-badge">{work.group}</span><time dateTime={new Date(sample.checked_at * 1000).toISOString()}>{new Date(sample.checked_at * 1000).toLocaleString(locale)}</time><span><Clock3 size={14} />{t('耗时 {seconds} 秒', { seconds: (sample.latency_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }) })}</span></div>
      <div className="pelican-display-toggle" role="group" aria-label={t('作品显示比例')}><button aria-pressed={display === 'fit'} onClick={() => setDisplay('fit')}>{t('适应窗口')}</button><button aria-pressed={display === 'actual'} onClick={() => setDisplay('actual')}>100%</button></div>
    </div>
    <div className="pelican-work-stage"><SampleImage key={sample.id} sample={sample} model={work.model} display={display} /></div>
    <footer className="pelican-work-footer"><span>{sample.prompt_version}</span><button className="button outline small" onClick={onHistory}><History size={14} />{t('查看该模型历史')}</button></footer>
  </Dialog>;
}
