export const consolePages = ['dashboard', 'redeem', 'usage', 'bills', 'keys', 'models', 'pelican', 'plans'];

export function isConsolePath(path) {
  return path === '/console' || path.startsWith('/console/');
}

export function consolePage(path) {
  if (path === '/console' || path === '/console/') return 'dashboard';
  const page = path.match(/^\/console\/([^/]+)\/?$/)?.[1];
  return consolePages.includes(page) ? page : null;
}

export function consolePath(page) {
  return `/console/${consolePages.includes(page) ? page : 'dashboard'}`;
}

export function consoleReturnPath(search) {
  const path = new URLSearchParams(search).get('redirect') || '';
  return consolePage(path) ? path : consolePath('dashboard');
}
