import { messages, apiMessages } from './messages.js';

export const LANGUAGE_KEY = 'relay-console.language';
const listeners = new Set();
let language = 'zh';
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(LANGUAGE_KEY) === 'en') language = 'en';
} catch { /* Storage may be blocked; switching still works for this session. */ }

export const getLanguage = () => language;
export const getLocale = () => language === 'en' ? 'en-US' : 'zh-CN';
export const subscribeLanguage = (callback) => { listeners.add(callback); return () => listeners.delete(callback); };
const chineseMessages = { ...Object.fromEntries(Object.entries(messages).map(([zh, en]) => [en, zh])), ...apiMessages };
const englishMessages = { ...Object.fromEntries(Object.entries(apiMessages).map(([en, zh]) => [zh, en])), ...messages };

export function t(key, values = {}) {
  if (typeof key !== 'string') return key;
  const catalog = language === 'en' ? englishMessages : chineseMessages;
  const translated = Object.hasOwn(catalog, key) ? catalog[key] : key;
  return translated.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

export function formatDuration(plan) {
  const unit = plan?.duration_unit === 'custom' ? 'second' : plan?.duration_unit;
  const count = plan?.duration_unit === 'custom' ? plan.custom_duration_seconds : plan?.duration_value;
  if (!(Number(count) > 0)) return '—';
  const labels = { year: '年', month: '月', week: '周', day: '天', hour: '小时', minute: '分钟', second: '秒' };
  const label = labels[unit] ? t(labels[unit]) : unit || '';
  return `${Number(count).toLocaleString(getLocale())} ${label}${language === 'en' && Number(count) !== 1 && labels[unit] ? 's' : ''}`;
}

export function setLanguage(next) {
  if (!['zh', 'en'].includes(next)) return;
  const changed = language !== next;
  language = next;
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* In-memory fallback. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = getLocale();
  if (changed) listeners.forEach((callback) => callback());
}

if (typeof document !== 'undefined') document.documentElement.lang = getLocale();
if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key === LANGUAGE_KEY) setLanguage(event.newValue === 'en' ? 'en' : 'zh');
});
