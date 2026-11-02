import { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';
import { usageFilterQuery } from '../lib/usage-filters.js';
import ModelSelect from './ModelSelect.jsx';
import './usage-filters.css';

export default function UsageFilters({ filters, range, models, groups, onApply }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft({ ...filters, startDate: range === 'custom' ? filters.startDate : '', endDate: range === 'custom' ? filters.endDate : '' });
    setError('');
  }, [filters, range]);
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const modelOptions = useMemo(() => [{ value: '', label: t('全部模型') }, ...[...new Set(models.map((model) => typeof model === 'string' ? model : model.model_name || model.name).filter(Boolean))].sort().map((name) => ({ value: name, label: name }))], [models, t]);
  const groupOptions = useMemo(() => [{ value: '', label: t('全部分组') }, ...groups.map(({ value, label }) => ({ value, label }))], [groups, t]);
  const statusOptions = useMemo(() => [{ value: 'all', label: t('全部状态') }, { value: 'success', label: t('成功') }, { value: 'failed', label: t('失败') }], [t]);
  const today = new Date().toLocaleDateString('sv-SE');
  return <form className="usage-filter-form" aria-label={t('调用记录筛选')} onSubmit={(event) => {
    event.preventDefault();
    const nextRange = draft.startDate || draft.endDate ? 'custom' : range === 'custom' ? '24h' : range;
    try {
      usageFilterQuery(nextRange, draft);
      setError('');
      onApply({ ...draft, model: draft.model.trim(), group: draft.group?.trim() || '' }, nextRange);
    } catch (failure) { setError(failure.message); }
  }}>
    <div className="usage-filter-fields"><div className="usage-filter-field"><span>{t('模型')}</span><ModelSelect searchable allowCustom allowEmpty value={draft.model} onChange={(value) => change('model', value)} options={modelOptions} placeholder={t('输入或选择模型')} ariaLabel={t('模型')} /></div>
      <div className="usage-filter-field"><span>{t('分组')}</span><ModelSelect searchable allowEmpty value={draft.group || ''} onChange={(value) => change('group', value)} options={groupOptions} placeholder={t('全部分组')} ariaLabel={t('分组')} /></div>
      <div className="usage-filter-field"><span>{t('状态')}</span><ModelSelect searchable value={draft.status} onChange={(value) => change('status', value)} options={statusOptions} placeholder={t('全部状态')} ariaLabel={t('状态')} /></div>
      <label><span>{t('开始日期')}</span><input type="date" value={draft.startDate} max={today} onChange={(event) => change('startDate', event.target.value)} /></label>
      <label><span>{t('结束日期')}</span><input type="date" value={draft.endDate} max={today} min={draft.startDate || undefined} onChange={(event) => change('endDate', event.target.value)} /></label>
      <div className="usage-filter-actions"><button className="button primary small" type="submit"><Search size={14} />{t('筛选')}</button><button className="icon-button" type="button" aria-label={t('重置筛选')} title={t('重置筛选')} onClick={() => { setError(''); onApply({ model: '', group: '', status: 'all', startDate: '', endDate: '' }, '24h'); }}><RotateCcw size={16} /></button></div>
    </div>
    {error && <p className="usage-filter-error" role="alert">{error}</p>}
    {range === 'custom' && <p className="usage-filter-hint">{t('当前日期范围：{start} 至 {end}（包含结束日期）', { start: filters.startDate, end: filters.endDate })}</p>}
  </form>;
}
