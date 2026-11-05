import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import Dialog from './Dialog.jsx';
import ImageStudioImageActions from './ImageStudioImageActions.jsx';
import ImageStudioPreviewDialog from './ImageStudioPreviewDialog.jsx';
import { getLocale, t } from '../lib/i18n.js';
import { listImageStudioRecords } from '../lib/image-studio-records.js';

export default function ImageStudioHistoryDialog({ userId, onClose, onToast }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    listImageStudioRecords(userId)
      .then((items) => { if (active) setRecords(items); })
      .catch(() => { if (active) setError(t('无法读取本地生成记录，请检查浏览器存储权限。')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  return <>
    {!selected && <Dialog title={t('生成记录')} onClose={onClose} className="image-studio-history-dialog">
      {error ? <div className="image-studio-record-message" role="alert">{error}</div> : loading ? <div className="image-studio-record-message" role="status">{t('正在加载生成记录…')}</div> : records.length === 0 ? <div className="image-studio-record-empty"><ImagePlus size={28} /><strong>{t('还没有生成记录')}</strong><span>{t('成功生成的图片会显示在这里。')}</span></div> : <div className="image-studio-history-grid">
        {records.flatMap((record) => record.sources.map((source, index) => <article className="image-studio-history-item" key={`${record.userId}-${record.id}-${index}`}>
          <div className="image-studio-history-image"><img src={source} alt={t('图片模型')} loading="lazy" /><ImageStudioImageActions source={source} filename={`image-${record.createdAt}-${index + 1}`} onView={() => setSelected({ record, source, index })} onToast={onToast} /></div>
          <div className="image-studio-history-caption"><strong title={record.model}>{record.model}</strong><time dateTime={new Date(record.createdAt).toISOString()}>{new Date(record.createdAt).toLocaleString(getLocale())}</time></div>
        </article>))}
      </div>}
    </Dialog>}
    {selected && <ImageStudioPreviewDialog {...selected} onClose={() => setSelected(null)} onToast={onToast} />}
  </>;
}
