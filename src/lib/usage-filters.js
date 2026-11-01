import { t } from './i18n.js';

export function usageFilterQuery(range = '24h', filters = {}, now = new Date()) {
  const end = Math.floor(now.getTime() / 1000);
  const durations = { '24h': 86400, '7d': 604800, '30d': 2592000 };
  let start = end - (durations[range] || durations['24h']);
  let finish = end;
  if (range === 'custom') {
    const dates = [filters.startDate, filters.endDate].map((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error(t('请选择完整的开始和结束日期'));
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error(t('日期无效'));
      return date;
    });
    if (dates[0] > dates[1]) throw new Error(t('开始日期不能晚于结束日期'));
    if (dates[0] > now) throw new Error(t('开始日期不能晚于今天'));
    start = Math.floor(dates[0].getTime() / 1000);
    dates[1].setDate(dates[1].getDate() + 1);
    finish = Math.min(end, Math.floor(dates[1].getTime() / 1000) - 1);
  }
  const params = new URLSearchParams({ start_timestamp: String(start), end_timestamp: String(finish) });
  if (filters.model?.trim()) params.set('model_name', filters.model.trim());
  if (filters.group?.trim()) params.set('group', filters.group.trim());
  if (filters.status === 'success') params.set('type', '2');
  if (filters.status === 'failed') params.set('type', '5');
  return params;
}
