import { t } from './i18n.js';
import { consolePage } from './routes.js';

export const DEFAULT_FAVICON = '/newapi-admin/favicon.ico';
const BRANDING_CACHE_KEY = 'ace-site-branding';

// Cache display-only fields; authentication switches always come from a fresh status response.
export function readCachedBranding(storage) {
  try {
    const cached = JSON.parse((storage || window.localStorage).getItem(BRANDING_CACHE_KEY));
    if (!cached || typeof cached.system_name !== 'string') return null;
    return {
      system_name: cached.system_name,
      logo: typeof cached.logo === 'string' ? cached.logo : '',
      favicon: typeof cached.favicon === 'string' ? cached.favicon : '',
    };
  } catch { return null; }
}

export function cacheSiteBranding(status, storage) {
  if (!status) return;
  try {
    const name = typeof status.system_name === 'string' ? status.system_name.trim() : '';
    (storage || window.localStorage).setItem(BRANDING_CACHE_KEY, JSON.stringify({
      system_name: name || t('模型工作台'),
      logo: status.logo || status.logo_url || status.system_logo || '',
      favicon: typeof status.favicon === 'string' ? status.favicon : '',
    }));
  } catch { /* Browsing with storage disabled must still work. */ }
}

const pageNames = {
  dashboard: '仪表盘', redeem: '兑换订阅', usage: '使用统计', bills: '账单明细',
  keys: 'API 密钥', models: '模型广场', pelican: '鹈鹕测智', plans: '购买订阅',
  '/login': '登录', '/register': '注册', '/forgot-password': '忘记密码',
  '/user/reset': '重置密码', '/reset': '重置密码',
};

export function websiteTitle(status, route) {
  const name = status ? status.system_name?.trim() || t('模型工作台') : '';
  if (!name) return '';
  const pageName = pageNames[consolePage(route)] || pageNames[route];
  return pageName ? `${t(pageName)} - ${name}` : name;
}

export function applySiteBranding(status, route, doc = document) {
  doc.title = websiteTitle(status, route);
  const icon = status ? status.favicon || DEFAULT_FAVICON : 'data:,';
  const existing = doc.querySelectorAll('link[rel~="icon"]');
  if (existing.length === 1 && existing[0].getAttribute('href') === icon) return;
  const link = doc.createElement('link');
  link.rel = 'icon';
  link.href = icon;
  existing.forEach((item) => item.remove());
  doc.head.appendChild(link);
}
