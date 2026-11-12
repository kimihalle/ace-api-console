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

export function availableMarketGroups(usableGroups, ratios, displayOrder = []) {
  const positions = new Map();
  if (Array.isArray(displayOrder)) {
    for (const name of displayOrder) {
      if (typeof name === 'string' && !positions.has(name)) positions.set(name, positions.size);
    }
  }
  return Object.entries(usableGroups || {})
    .filter(([value]) => value && value !== 'auto' && configuredGroupRatio(ratios, value) !== null)
    .sort(([a], [b]) => (positions.get(a) ?? positions.size) - (positions.get(b) ?? positions.size))
    .map(([value, info]) => {
      const desc = typeof info === 'string' ? info : info?.desc;
      const description = typeof desc === 'string' ? desc.trim() : '';
      let label = value;
      if (value === 'default') label = t('默认分组');
      if (value === 'vip') label = t('VIP 分组');
      return { value, label, ...(description ? { description } : {}) };
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

export function marketPriceDisplay(model, group, status, expressionPricing = null) {
  const price = model.pricing;
  const ratio = configuredGroupRatio(model.groupRatios, group);
  const empty = { unit: '每百万 Tokens', items: [['输入', '—', '—'], ['输出', '—', '—'], ['缓存创建', '—', '—'], ['缓存读取', '—', '—']] };
  if (!price || ratio === null || !modelInGroup(model, group)) return empty;
  const type = status?.quota_display_type || (status?.display_in_currency === false ? 'TOKENS' : 'USD');
  const exchange = finiteNumber(type === 'CNY' ? status?.usd_exchange_rate : type === 'CUSTOM' ? status?.custom_currency_exchange_rate : 1);
  const symbol = type === 'CNY' ? '¥' : type === 'CUSTOM' ? status?.custom_currency_symbol || '¤' : '$';
  const money = (value) => value === null || !Number.isFinite(value) || value < 0 ? '—' : formatMoney(value * (exchange > 0 ? exchange : 1), symbol);
  if ((price.billing_mode && price.billing_mode !== 'ratio') || expressionPricing) {
    if (!expressionPricing?.tiers?.length) return { mode: '动态计费价格需按规则计算', unit: '动态计费', items: [] };

    const tokenFields = [
      ['inputPrice', t('输入')], ['outputPrice', t('输出')], ['cacheCreatePrice', t('缓存创建')],
      ['cacheReadPrice', t('缓存读取')], ['cacheCreate1hPrice', t('缓存创建（1 小时）')],
      ['imageCachePrice', t('图像缓存')], ['imagePrice', t('图像输入')], ['imageOutputPrice', t('图像输出')],
      ['audioInputPrice', t('音频输入')], ['audioOutputPrice', t('音频输出')],
    ];
    const items = [];
    let hasTokenPrice = false;
    let hasRequestPrice = false;
    let hasTaskPrice = false;
    const conditionNames = { p: t('输入 Tokens'), c: t('输出 Tokens'), len: t('上下文长度') };

    for (const entry of expressionPricing.tiers) {
      const tier = entry.tier;
      const conditions = tier.conditionText || (tier.conditions || []).map((condition) => `${conditionNames[condition.var] || condition.field} ${condition.op || '='} ${condition.value}`).join(' · ');
      const descriptor = [entry.sourceLabel, tier.label, conditions].filter(Boolean).join(' · ');
      if (entry.kind === 'task') {
        hasTaskPrice = true;
        for (const [field, definition] of Object.entries(entry.usageSchema || {})) {
          const amount = finiteNumber(tier.unitPrices?.[field]);
          if (amount === null || amount < 0) continue;
          const unitName = ({ second: t('秒'), count: t('次'), token: t('Token'), credit: t('计费单位') })[definition?.unit] || definition?.unit || t('单位');
          items.push([`${field}（每${unitName}）${descriptor ? ` · ${descriptor}` : ''}`, money(amount), money(amount * ratio)]);
        }
        if (finiteNumber(tier.constant) > 0) {
          items.push([`${t('基础费用')}（${t('每次请求')}）${descriptor ? ` · ${descriptor}` : ''}`, money(tier.constant), money(tier.constant * ratio)]);
          hasRequestPrice = true;
        }
        continue;
      }
      if (tier.billingUnit === 'request' && finiteNumber(tier.fixedPrice) !== null) {
        hasRequestPrice = true;
        items.push([`${t('请求价格')}（${t('每次请求')}）${descriptor ? ` · ${descriptor}` : ''}`, money(tier.fixedPrice), money(tier.fixedPrice * ratio)]);
        continue;
      }
      for (const [field, label] of tokenFields) {
        const amount = finiteNumber(tier[field]);
        if (amount === null || amount < 0) continue;
        hasTokenPrice = true;
        items.push([`${label}${descriptor ? ` · ${descriptor}` : ''}`, money(amount), money(amount * ratio)]);
      }
    }

    if (!items.length) return { mode: '动态计费价格需按规则计算', unit: '动态计费', items: [] };
    const unit = hasTaskPrice ? t('任务用量价格（单位见项目）')
      : hasTokenPrice && hasRequestPrice ? t('价格单位见项目')
        : hasRequestPrice ? t('每次请求') : t('每百万 Tokens');
    return {
      unit,
      items,
      ...(expressionPricing.hasRequestRules ? { note: t('展示基础价格，实际费用可能受请求规则影响') } : {}),
    };
  }
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
