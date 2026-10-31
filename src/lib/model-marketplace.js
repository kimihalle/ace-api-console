import { formatMoney, formatQuotaDisplay } from './usage-format.js';
import { t } from './i18n.js';

const finiteNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function modelInGroup(model, group) {
  return Boolean(group && (model.groups?.includes(group) || model.groups?.includes('all')));
}

export function filterMarketModels(models, { group, vendor = '', endpoint = '', search = '' } = {}) {
  const term = search.trim().toLocaleLowerCase();
  return models.filter((model) => (!group || modelInGroup(model, group))
    && (!vendor || model.vendor === vendor)
    && (!endpoint || model.pricing?.supported_endpoint_types?.includes(endpoint))
    && (!term || `${model.name} ${model.vendor} ${model.detail || ''}`.toLocaleLowerCase().includes(term)));
}

export function configuredGroupRatio(ratios, group) {
  const ratio = finiteNumber(ratios?.[group]);
  return ratio !== null && ratio >= 0 ? ratio : null;
}

export function availableMarketGroups(usableGroups, ratios) {
  return Object.entries(usableGroups || {})
    .filter(([value]) => value && value !== 'auto' && configuredGroupRatio(ratios, value) !== null)
    .map(([value, info]) => {
      const description = typeof info === 'string' ? info : info?.desc;
      const label = { 'Default group': '默认分组', 'VIP group': 'VIP 分组', 'User group': value === 'default' ? '默认分组' : value }[description];
      return { value, label: label ? t(label) : description || value };
    });
}

export function marketGroupVendors(models, group) {
  const vendors = new Map();
  for (const model of models) {
    if (!modelInGroup(model, group)) continue;
    const name = model.vendor || '兼容模型';
    const icon = model.vendorIcon || '';
    vendors.set(`${name}\u0000${icon}`, { name, icon });
  }
  return [...vendors.values()];
}

export function marketPriceDisplay(model, group, status) {
  const price = model.pricing;
  const ratio = configuredGroupRatio(model.groupRatios, group);
  const empty = { unit: '每百万 Tokens', items: [['输入', '—', '—'], ['输出', '—', '—'], ['缓存创建', '—', '—'], ['缓存读取', '—', '—']] };
  if (!price || ratio === null || !modelInGroup(model, group)) return empty;
  if (price.billing_mode && price.billing_mode !== 'ratio') return { mode: '动态计费价格需按规则计算', unit: '动态计费', items: [] };
  const type = status?.quota_display_type || (status?.display_in_currency === false ? 'TOKENS' : 'USD');
  const exchange = finiteNumber(type === 'CNY' ? status?.usd_exchange_rate : type === 'CUSTOM' ? status?.custom_currency_exchange_rate : 1);
  const symbol = type === 'CNY' ? '¥' : type === 'CUSTOM' ? status?.custom_currency_symbol || '¤' : '$';
  const money = (value) => value === null || !Number.isFinite(value) || value < 0 ? '—' : formatMoney(value * (exchange > 0 ? exchange : 1), symbol);
  if (Number(price.quota_type) === 1) {
    const fixed = finiteNumber(price.model_price);
    return { unit: '每次请求', items: [['请求价格', money(fixed), money(fixed === null ? null : fixed * ratio)]] };
  }
  const inputRatio = finiteNumber(price.model_ratio);
  const baseInput = inputRatio === null || inputRatio < 0 ? null : inputRatio * 2;
  const multiplied = (value, groupRatio = 1) => {
    const multiplier = finiteNumber(value);
    return money(baseInput === null || multiplier === null || multiplier < 0 ? null : baseInput * multiplier * groupRatio);
  };
  return { ...empty, items: [
    ['输入', money(baseInput), multiplied(1, ratio)],
    ['输出', multiplied(price.completion_ratio), multiplied(price.completion_ratio, ratio)],
    ['缓存创建', multiplied(price.create_cache_ratio), multiplied(price.create_cache_ratio, ratio)],
    ['缓存读取', multiplied(price.cache_ratio), multiplied(price.cache_ratio, ratio)],
  ] };
}

export function estimatedGroupCredit(quota, ratio, status) {
  const balance = finiteNumber(quota);
  if (balance === null || ratio === null || ratio < 0) return '—';
  if (ratio === 0) return t('不扣额度');
  return formatQuotaDisplay(balance / ratio, status);
}
