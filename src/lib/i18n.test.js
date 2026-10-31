import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, getLocale, setLanguage, subscribeLanguage, t, LANGUAGE_KEY, formatDuration } from './i18n.js';
import { messages } from './messages.js';
import { usageColumns, usageCsvRow } from './usage-format.js';
import { availableMarketGroups } from './model-marketplace.js';

test('language switching updates copy, valid Intl locales, CSV and configured labels', () => {
  setLanguage('en');
  assert.equal(getLocale(), 'en-US');
  assert.equal(t('仪表盘'), 'Dashboard');
  assert.equal(t('{count} 个模型', { count: 12 }), '12 models');
  assert.equal(t('第 {page} / {pages} 页', { page: 2, pages: 3 }), 'Page 2 of 3');
  assert.equal(usageColumns.map((column) => t(column))[0], 'Time');
  assert.equal(usageCsvRow({ type: 2 }, {})[8], 'Succeeded');
  assert.deepEqual(availableMarketGroups({ default: 'Default group', custom: '自定义运营分组' }, { default: 1, custom: 0.5 }), [
    { value: 'default', label: 'Default group' }, { value: 'custom', label: '自定义运营分组' },
  ]);
  assert.equal(t('自定义站点/模型名称'), '自定义站点/模型名称');
  assert.equal(t('__proto__'), '__proto__');
  assert.equal(formatDuration({ duration_unit: 'month', duration_value: 2 }), '2 months');
  setLanguage('zh');
  assert.equal(getLocale(), 'zh-CN');
  assert.equal(t('Invalid parameters'), '参数无效');
  assert.equal(formatDuration({ duration_unit: 'month', duration_value: 2 }), '2 月');
  assert.equal(t('Dashboard'), '仪表盘');
  assert.equal(t('第 {page} / {pages} 页', { page: 2, pages: 3 }), '第 2 / 3 页');
});

test('selection persists without reload and blocked storage has an in-memory fallback', async () => {
  const previous = globalThis.localStorage;
  const previousDocument = globalThis.document;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.document = { documentElement: { lang: '' } };
  let updates = 0;
  const unsubscribe = subscribeLanguage(() => updates++);
  try {
    setLanguage('en');
    setLanguage('en');
    setLanguage('unsupported');
    assert.equal(updates, 1);
    assert.equal(values.get(LANGUAGE_KEY), 'en');
    assert.equal(document.documentElement.lang, 'en-US');
    const reloaded = await import('./i18n.js?persisted-test');
    assert.equal(reloaded.getLanguage(), 'en');
    globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    setLanguage('zh');
    assert.equal(getLanguage(), 'zh');
    const blocked = await import('./i18n.js?blocked-storage-test');
    assert.equal(blocked.getLanguage(), 'zh');
  } finally {
    unsubscribe();
    globalThis.localStorage = previous;
    globalThis.document = previousDocument;
    setLanguage('zh');
  }
});

test('every interface translation is nonempty and preserves interpolation parameters', () => {
  for (const [key, value] of Object.entries(messages)) {
    assert.ok(value.trim(), key);
    assert.deepEqual([...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), key);
  }
});
