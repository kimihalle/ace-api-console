import { useEffect, useId, useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';
import { usageFilterQuery } from '../lib/usage-filters.js';
import './usage-filters.css';

export default function UsageFilters({ filters, range, models, onApply }) {
  const { t } = useLanguage();
  const listId = useId();
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft({ ...filters, startDate: range === 'custom' ? filters.startDate : '', endDate: range === 'custom' ? filters.endDate : '' });
    setError('');
  }, [filters, range]);
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const today = new Date().toLocaleDateString('sv-SE');
  return <form className="usage-filter-form" aria-label={t('调用记录筛选')} onSubmit={(event) => {
    event.preventDefault();
    const nextRange = draft.startDate || draft.endDate ? 'custom' : range === 'custom' ? '24h' : range;
    try {
      usageFilterQuery(nextRange, draft);
      setError('');
      onApply({ ...draft, model: draft.model.trim() }, nextRange);
    } catch (failure) { setError(failure.message); }
  }}>
    <div className="usage-filter-fields"><label><span>{t('模型')}</span><input value={draft.model} onChange={(event) => change('model', event.target.value)} list={listId} placeholder={t('输入或选择模型')} /><datalist id={listId}>{[...new Set(models.map((model) => model.model_name || model.name).filter(Boolean))].sort().map((name) => <option key={name} value={name} />)}</datalist></label>
      <label><span>{t('状态')}</span><select value={draft.status} onChange={(event) => change('status', event.target.value)}><option value="all">{t('全部状态')}</option><option value="success">{t('成功')}</option><option value="failed">{t('失败')}</option></select></label>
      <label><span>{t('开始日期')}</span><input type="date" value={draft.startDate} max={today} onChange={(event) => change('startDate', event.target.value)} /></label>
      <label><span>{t('结束日期')}</span><input type="date" value={draft.endDate} max={today} min={draft.startDate || undefined} onChange={(event) => change('endDate', event.target.value)} /></label>
      <div className="usage-filter-actions"><button className="button primary small" type="submit"><Search size={14} />{t('筛选')}</button><button className="icon-button" type="button" aria-label={t('重置筛选')} title={t('重置筛选')} onClick={() => { setError(''); onApply({ model: '', status: 'all', startDate: '', endDate: '' }, '24h'); }}><RotateCcw size={16} /></button></div>
    </div>
    {error && <p className="usage-filter-error" role="alert">{error}</p>}
    {range === 'custom' && <p className="usage-filter-hint">{t('当前日期范围：{start} 至 {end}（包含结束日期）', { start: filters.startDate, end: filters.endDate })}</p>}
  </form>;
}
