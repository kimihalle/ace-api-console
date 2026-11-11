import { useState } from 'react';
import { Download, Eye, LoaderCircle } from 'lucide-react';
import { downloadStudioImage } from '../lib/image-studio-download.js';
import { t } from '../lib/i18n.js';

export default function ImageStudioImageActions({ source, filename, onView, onToast }) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await downloadStudioImage(source, filename);
    } catch {
      onToast?.(t('图片下载失败，请稍后重试'));
    } finally {
      setDownloading(false);
    }
  };

  return <div className="image-studio-image-actions">
    <button type="button" title={t('下载图片')} aria-label={t('下载图片')} disabled={downloading} onClick={(event) => { event.stopPropagation(); void download(); }}>{downloading ? <LoaderCircle size={16} className="image-studio-spin" /> : <Download size={16} />}</button>
    {onView && <button type="button" title={t('查看图片')} aria-label={t('查看图片')} onClick={(event) => { event.stopPropagation(); onView(); }}><Eye size={16} /></button>}
  </div>;
}
