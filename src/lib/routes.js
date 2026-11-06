export const consolePages = ['dashboard', 'redeem', 'usage', 'keys', 'models', 'images', 'pelican', 'plans'];

export function isBillingPath(path) {
  return /^\/console\/(?:plans\/)?bills\/?$/.test(path);
}

export function isConsolePath(path) {
  return path === '/console' || path.startsWith('/console/');
}

export function consolePage(path) {
  if (path === '/console' || path === '/console/') return 'dashboard';
  if (isBillingPath(path)) return 'plans';
  const page = path.match(/^\/console\/([^/]+)\/?$/)?.[1];
  return consolePages.includes(page) ? page : null;
}

export function consolePath(page) {
  if (page === 'bills') return '/console/plans/bills';
  return `/console/${consolePages.includes(page) ? page : 'dashboard'}`;
}

export function consoleReturnPath(search) {
  const path = new URLSearchParams(search).get('redirect') || '';
  return consolePage(path) ? path : consolePath('dashboard');
}
