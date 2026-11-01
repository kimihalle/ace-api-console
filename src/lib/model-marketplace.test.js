import test from 'node:test';
import assert from 'node:assert/strict';
import { availableMarketGroups, filterMarketModels, configuredGroupRatio, marketGroupVendors, marketPriceDisplay, estimatedGroupCredit } from './model-marketplace.js';

const model = { name: 'test-model', vendor: '后台厂商', groups: ['all'], groupRatios: { basic: 1, discounted: 0.5, free: 0 }, pricing: { model_ratio: 2.5, completion_ratio: 5, cache_ratio: 0.1, create_cache_ratio: 1.25, supported_endpoint_types: ['anthropic'] } };

test('saved display order controls available groups without exposing hidden or deleted groups', () => {
  const usable = { '2': 'Two', '10': 'Ten', basic: '基础', free: '免费', auto: '自动' };
  const ratios = { '2': 0.2, '10': 0.1, basic: 1, free: 0, auto: 1, private: 2 };
  assert.deepEqual(availableMarketGroups(usable, ratios, ['private', 'deleted', '10', 'free', '10', '2']).map((group) => group.value), ['10', 'free', '2', 'basic']);
  assert.deepEqual(availableMarketGroups(usable, ratios, null).map((group) => group.value), ['2', '10', 'basic', 'free']);
  assert.deepEqual(availableMarketGroups({}, ratios, ['basic']), []);
});

test('only authorized groups with configured ratios are selectable; empty configured groups remain visible', () => {
  const usable = { default: 'User group', discounted: 'GPT-特价', unused: { desc: '尚未绑定渠道' }, free: '免费体验', auto: '自动', invalid: '无效' };
  assert.deepEqual(availableMarketGroups(usable, { discounted: 0.05, unused: 0.25, free: 0, auto: 1, invalid: null, 'admin-only': 1 }), [
    { value: 'discounted', label: 'GPT-特价' }, { value: 'unused', label: '尚未绑定渠道' }, { value: 'free', label: '免费体验' },
  ]);
  assert.deepEqual(availableMarketGroups({ default: 'Default group' }, { default: 1 }), [{ value: 'default', label: '默认分组' }]);
  assert.deepEqual(availableMarketGroups({ default: '自定义展示名' }, { default: 1 }), [{ value: 'default', label: '自定义展示名' }]);
});

test('group vendor icons come from actual model membership, never from the group name', () => {
  const models = [
    { ...model, vendor: '后台厂商 A', vendorIcon: 'https://example.test/a.svg', groups: ['GPT-特价'] },
    { ...model, name: 'second', vendor: '后台厂商 A', vendorIcon: 'https://example.test/a.svg', groups: ['GPT-特价'] },
    { ...model, vendor: '后台厂商 B', vendorIcon: 'Gemini.Color', groups: ['GPT-特价', 'vip'] },
    { ...model, vendor: '通用厂商', vendorIcon: 'OpenAI', groups: ['all'] },
  ];
  assert.deepEqual(marketGroupVendors(models, 'GPT-特价'), [
    { name: '后台厂商 A', icon: 'https://example.test/a.svg' }, { name: '后台厂商 B', icon: 'Gemini.Color' }, { name: '通用厂商', icon: 'OpenAI' },
  ]);
  assert.deepEqual(marketGroupVendors(models.slice(0, 3), 'GPT-官KEY'), []);
  assert.deepEqual(marketGroupVendors(models, 'vip'), [{ name: '后台厂商 B', icon: 'Gemini.Color' }, { name: '通用厂商', icon: 'OpenAI' }]);
});

test('market filters combine configured endpoints, vendors, group availability and trimmed search', () => {
  const models = [model, { ...model, name: 'other', vendor: '另一厂商', groups: ['basic'] }];
  assert.deepEqual(filterMarketModels(models, { group: 'discounted', vendor: '后台厂商', endpoint: 'anthropic', search: ' TEST ' }), [model]);
  assert.equal(filterMarketModels(models, { endpoint: 'openai' }).length, 0);
  assert.equal(filterMarketModels(models, { group: 'discounted' }).length, 1);
});

test('upstream baseline and group price follow synced ratios, including zero', () => {
  const display = marketPriceDisplay(model, 'discounted', {});
  assert.equal(display.unit, '每百万 Tokens');
  assert.deepEqual(display.items, [['输入', '$5.00', '$2.50'], ['输出', '$25.00', '$12.50'], ['缓存创建', '$6.25', '$3.125'], ['缓存读取', '$0.50', '$0.25']]);
  assert.deepEqual(marketPriceDisplay(model, 'free', {}).items.map((item) => item.slice(1)), [['$5.00', '$0.00'], ['$25.00', '$0.00'], ['$6.25', '$0.00'], ['$0.50', '$0.00']]);
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, cache_ratio: 0, create_cache_ratio: null } }, 'basic', {}).items[2][1], '—');
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, cache_ratio: 0 } }, 'basic', {}).items[3][1], '$0.00');
  assert.equal(marketPriceDisplay(model, 'basic', { quota_display_type: 'CNY', usd_exchange_rate: 7 }).items[0][1], '¥35.00');
});

test('missing prices or ratios are never silently presented as free; dynamic modes are not guessed', () => {
  assert.equal(configuredGroupRatio({ basic: null }, 'basic'), null);
  assert.equal(configuredGroupRatio({ basic: -1 }, 'basic'), null);
  assert.equal(marketPriceDisplay(model, 'missing', {}).items[0][1], '—');
  assert.equal(marketPriceDisplay({ ...model, pricing: { quota_type: 1 } }, 'basic', {}).items[0][1], '—');
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, quota_type: 1, model_price: 0.2 } }, 'discounted', {}).items[0][2], '$0.10');
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, billing_mode: 'expression', quota_type: 1, model_price: 0 } }, 'basic', {}).mode, '动态计费价格需按规则计算');
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, quota_type: 1, model_price: 0.2 } }, 'discounted', {}).unit, '每次请求');
  assert.equal(marketPriceDisplay({ ...model, pricing: { ...model.pricing, billing_mode: 'expression' } }, 'discounted', {}).unit, '动态计费');
  assert.equal(estimatedGroupCredit(50000000, 0.5, { quota_per_unit: 500000 }), '$200.00');
  assert.equal(estimatedGroupCredit(50000000, 0, {}), '不扣额度');
  assert.equal(estimatedGroupCredit(null, 1, {}), '—');
});
