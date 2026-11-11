import { useState } from 'react';
import { Copy, ZoomIn, ZoomOut } from 'lucide-react';
import Dialog from './Dialog.jsx';
import ImageStudioImageActions from './ImageStudioImageActions.jsx';
import ImageStudioSourceImage from './ImageStudioSourceImage.jsx';
import { copyText } from '../lib/clipboard.js';
import { getLocale, t } from '../lib/i18n.js';

export default function ImageStudioPreviewDialog({ record, source, index = 0, onClose, onToast }) {
  const [zoomed, setZoomed] = useState(false);
  const copyPrompt = async () => {
    try {
      await copyText(record.prompt);
      onToast?.(t('提示词已复制'));
    } catch (cause) {
      onToast?.(cause.message || t('复制失败，请手动选择并复制'));
    }
  };

  return <Dialog title={t('查看图片')} onClose={onClose} className="image-studio-preview-dialog">
    <div className="image-studio-preview-layout">
      <div className="image-studio-preview-stage">
        <div className={`image-studio-preview-scroll${zoomed ? ' is-zoomed' : ''}`}>
          <button type="button" className="image-studio-preview-image" title={zoomed ? t('适应窗口') : t('放大图片')} aria-label={zoomed ? t('适应窗口') : t('放大图片')} aria-pressed={zoomed} onClick={() => setZoomed((current) => !current)}><ImageStudioSourceImage source={source} alt={record.prompt || record.model} /></button>
        </div>
        <div className="image-studio-preview-zoom"><button type="button" title={zoomed ? t('适应窗口') : t('放大图片')} aria-label={zoomed ? t('适应窗口') : t('放大图片')} aria-pressed={zoomed} onClick={() => setZoomed((current) => !current)}>{zoomed ? <ZoomOut size={17} /> : <ZoomIn size={17} />}</button></div>
        <ImageStudioImageActions source={source} filename={`image-${record.createdAt}-${index + 1}`} onToast={onToast} />
      </div>
      <aside className="image-studio-preview-info">
        <div className="image-studio-detail-meta"><span>{t('生成日期')}</span><time dateTime={new Date(record.createdAt).toISOString()}>{new Date(record.createdAt).toLocaleString(getLocale())}</time></div>
        <div className="image-studio-detail-meta"><span>{t('图片模型')}</span><strong>{record.model}</strong></div>
        <div className="image-studio-detail-prompt"><div><span>{t('提示词')}</span><button type="button" className="image-studio-copy-prompt" aria-label={t('复制提示词')} title={t('复制提示词')} onClick={() => void copyPrompt()}><Copy size={15} /></button></div><p>{record.prompt}</p></div>
      </aside>
    </div>
  </Dialog>;
}
