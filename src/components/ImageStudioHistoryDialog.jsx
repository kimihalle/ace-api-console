import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import Dialog from './Dialog.jsx';
import ImageStudioImageActions from './ImageStudioImageActions.jsx';
import ImageStudioPreviewDialog from './ImageStudioPreviewDialog.jsx';
import { getLocale, t } from '../lib/i18n.js';
import { imageStudioSourceUrl, newApi } from '../lib/newapi.js';

export default function ImageStudioHistoryDialog({ userId, onClose, onToast }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    newApi.imageStudioRecords()
      .then((items) => { if (active) setRecords(items); })
      .catch((cause) => { if (active) setError(cause.message || t('生成记录读取失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  return <>
    {!selected && <Dialog title={t('生成记录')} onClose={onClose} className="image-studio-history-dialog">
      {error ? <div className="image-studio-record-message" role="alert">{error}</div> : loading ? <div className="image-studio-record-message" role="status">{t('正在加载生成记录…')}</div> : records.length === 0 ? <div className="image-studio-record-empty"><ImagePlus size={28} /><strong>{t('还没有生成记录')}</strong><span>{t('成功生成的图片会显示在这里。')}</span></div> : <div className="image-studio-history-grid">
        {records.flatMap((record) => Array.from({ length: record.image_count || 0 }, (_, index) => {
          const source = imageStudioSourceUrl(record.id, index);
          const previewRecord = { ...record, createdAt: record.created_at * 1000 };
          return <article className="image-studio-history-item" key={`${record.id}-${index}`}>
          <div className="image-studio-history-image"><button type="button" className="image-studio-history-open" title={t('查看图片')} aria-label={t('查看图片')} onClick={() => setSelected({ record: previewRecord, source, index })}><img src={source} alt={`${record.model} ${index + 1}`} loading="lazy" /></button><ImageStudioImageActions source={source} filename={`image-${record.created_at}-${index + 1}`} onView={() => setSelected({ record: previewRecord, source, index })} onToast={onToast} /></div>
          <div className="image-studio-history-caption"><strong title={record.model}>{record.model}</strong><time dateTime={new Date(record.created_at * 1000).toISOString()}>{new Date(record.created_at * 1000).toLocaleString(getLocale())}</time></div>
        </article>;
        }) )}
      </div>}
    </Dialog>}
    {selected && <ImageStudioPreviewDialog {...selected} onClose={() => setSelected(null)} onToast={onToast} />}
  </>;
}
