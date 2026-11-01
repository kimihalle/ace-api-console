import { t, getLocale } from './i18n.js';
import { tokenId } from './tokens.js';
let accessToken = null;
let refreshPromise = null;

const API_ROOT = (import.meta.env?.VITE_NEW_API_BASE_URL || '').replace(/\/$/, '');
const ADMIN_CONSOLE_URL = (import.meta.env?.VITE_NEW_API_CONSOLE_URL || '').replace(/\/$/, '');

function readHintCookie() {
  return typeof document !== 'undefined' && document.cookie.split(';').some((part) => part.trim() === 'new_api_has_session=1');
}

function unwrap(payload) {
  if (payload?.success === false) throw new Error(payload.message || t("请求未成功"));
  return payload?.data ?? payload;
}

async function parseResponse(response, unwrapData = true, responseType) {
  if (responseType === 'blob' && response.ok) return response.blob();
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (typeof body === 'string' && /<html|<!doctype/i.test(body)) throw new Error(t("服务端未连接：当前地址返回了网页而不是接口响应"));
  if (!response.ok) {
    const message = typeof body === 'object' ? body?.message || body?.error : body;
    throw new Error((message || t("请求失败 ({v0})", { v0: response.status })).toString().slice(0, 240));
  }
  return unwrapData ? unwrap(body) : body;
}

async function encryptPassword(password) {
  const keyData = await request('/user/login/encryption-key', { auth: false });
  if (!keyData?.kid || !keyData?.public_key) throw new Error(t("服务端未提供密码加密公钥"));
  const pem = keyData.public_key.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const binary = atob(pem);
  const der = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', der.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(password));
  const bytes = new Uint8Array(encrypted);
  let binaryCiphertext = '';
  bytes.forEach((byte) => { binaryCiphertext += String.fromCharCode(byte); });
  return { password_encrypted: btoa(binaryCiphertext), encryption_key_id: keyData.kid };
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(`${API_ROOT}/api/user/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': getLocale() },
  }).then(parseResponse).then((data) => {
    accessToken = data?.access_token || null;
    return accessToken;
  }).catch((error) => {
    accessToken = null;
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function request(path, options = {}) {
  const { auth = true, retry = true, unwrapData = true, responseType, ...init } = options;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', getLocale());
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (auth && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_ROOT}/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (auth && retry && response.status === 401 && readHintCookie()) {
    await refreshAccessToken();
    if (accessToken) return request(path, { ...options, retry: false });
  }
  return parseResponse(response, unwrapData, responseType);
}

export function loadPelicanImage(id, signal) {
  return request(`/pelican/image/${encodeURIComponent(id)}`, { responseType: 'blob', signal });
}

export function loadPelicanDocument(id, signal) {
  return request(`/pelican/document/${encodeURIComponent(id)}`, { signal });
}

export async function login(credentials) {
  const status = await newApi.publicStatus();
  const passwordFields = status?.password_login_encryption_enabled
    ? await encryptPassword(credentials.password)
    : { password: credentials.password };
  const data = await request(`/user/login?turnstile=${encodeURIComponent(credentials.turnstile || '')}`, {
    method: 'POST', auth: false,
    body: JSON.stringify({ username: credentials.username, ...passwordFields }),
  });
  return readLoginResult(data);
}

function readLoginResult(data) {
  const requiresVerification = Boolean(data?.require_verification || data?.verification_required || data?.flow_token);
  accessToken = requiresVerification ? null : data?.access_token || data?.token || null;
  return { user: data?.user || data?.user_info || null, requiresVerification, challenge: data?.flow_token ? data : null };
}

export async function verifyLoginCode(flowToken, code) {
  const data = await request('/user/login/verify', {
    method: 'POST', auth: false, cache: 'no-store',
    body: JSON.stringify({ flow_token: flowToken, method: '2fa', code }),
  });
  accessToken = data?.access_token || null;
  return { user: data?.user || data?.user_info || null };
}

export function createOAuthLogin(provider, aff) {
  return request('/oauth/state', {
    method: 'POST', auth: false, cache: 'no-store',
    body: JSON.stringify({ provider, intent: 'login', ...(aff ? { aff } : {}) }),
  });
}

export async function completeOAuthLogin(provider, code, state) {
  const query = new URLSearchParams({ code, state });
  return readLoginResult(await request(`/oauth/${encodeURIComponent(provider)}?${query}`, { auth: false, cache: 'no-store', referrerPolicy: 'no-referrer' }));
}

export async function loginWithWeChat(code) {
  return readLoginResult(await request(`/oauth/wechat?${new URLSearchParams({ code })}`, { auth: false, cache: 'no-store', referrerPolicy: 'no-referrer' }));
}

export function beginPasskeyLogin({ flowToken, rpID, signal } = {}) {
  return request(flowToken ? '/user/login/passkey/begin' : '/user/passkey/login/begin', {
    method: 'POST', auth: false, cache: 'no-store', signal,
    body: JSON.stringify({ ...(flowToken ? { flow_token: flowToken } : {}), ...(rpID ? { rp_id: rpID } : {}) }),
  });
}

export async function finishPasskeyLogin({ flowToken, passkeyFlowToken, credential, signal }) {
  const body = flowToken ? { flow_token: flowToken, passkey_flow_token: passkeyFlowToken, credential } : { flow_token: passkeyFlowToken, credential };
  return readLoginResult(await request(flowToken ? '/user/login/passkey/finish' : '/user/passkey/login/finish', {
    method: 'POST', auth: false, cache: 'no-store', signal, body: JSON.stringify(body),
  }));
}

export function register(details) {
  const { turnstile = '', ...body } = details;
  return request(`/user/register?turnstile=${encodeURIComponent(turnstile)}`, { method: 'POST', auth: false, body: JSON.stringify({ ...body, turnstile }) });
}

export function sendRegistrationCode(email, turnstile = '') {
  const query = new URLSearchParams({ email: email.trim(), turnstile });
  return request(`/verification?${query}`, { auth: false, cache: 'no-store' });
}

export function sendPasswordResetEmail(email, turnstile = '') {
  const query = new URLSearchParams({ email: email.trim(), turnstile });
  return request(`/reset_password?${query}`, { auth: false, cache: 'no-store' });
}

export function confirmPasswordReset(email, token) {
  return request('/user/reset', {
    method: 'POST', auth: false, cache: 'no-store',
    body: JSON.stringify({ email, token }),
  });
}

export async function logout() {
  try {
    await request('/user/auth/logout', { method: 'POST', retry: false });
  } finally {
    accessToken = null;
  }
}

export async function restoreSession({ force = false } = {}) {
  if (!force && !readHintCookie()) return null;
  await refreshAccessToken();
  if (!accessToken) return null;
  return request('/user/self', { retry: false });
}

export function clearAccessToken() {
  accessToken = null;
}

export function apiBaseLabel() {
  return API_ROOT || (typeof window !== 'undefined' ? window.location.origin : '');
}

export function newApiConsoleUrl() {
  const consoleRoot = ADMIN_CONSOLE_URL || API_ROOT || (typeof window !== 'undefined' ? window.location.origin : '');
  return consoleRoot ? `${consoleRoot.replace(/\/$/, '')}/newapi-admin/users` : '';
}

export const newApi = {
  publicStatus: () => request('/status', { auth: false, cache: 'no-store' }),
  notice: () => request('/notice', { auth: false, cache: 'no-cache' }),
  homeContent: () => request('/home_page_content', { auth: false }),
  pelicanCatalog: () => request('/pelican/catalog', { auth: false, cache: 'no-cache' }),
  restoreSession,
  currentUser: () => request('/user/self'),
  affiliateCode: () => request('/user/aff'),
  transferAffiliate: (quota) => request('/user/aff_transfer', { method: 'POST', body: JSON.stringify({ quota }) }),
  userModels: () => request('/user/models'),
  pricing: () => request('/pricing', { unwrapData: false, cache: 'no-store' }),
  modelMetricsSummary: (query = '?hours=8') => request(`/perf-metrics/summary${query}`),
  channelHealthSummary: (query) => request(`/perf-metrics/channel-health${query}`),
  groups: () => request('/group'),
  tokens: (query = '?p=1&size=100') => request(`/token/${query}`),
  searchTokens: (keyword, page = 1, size = 100) => {
    const params = new URLSearchParams({ keyword, p: String(page), size: String(size) });
    return request(`/token/search?${params.toString()}`);
  },
  createToken: (payload) => request('/token/', { method: 'POST', body: JSON.stringify(payload) }),
  updateToken: (payload) => request('/token/', { method: 'PUT', body: JSON.stringify(payload) }),
  deleteToken: (id) => request(`/token/${tokenId(id)}`, { method: 'DELETE' }),
  setTokenStatus: (id, status) => request('/token/?status_only=true', { method: 'PUT', body: JSON.stringify({ id: tokenId(id), status }) }),
  tokenKey: (id) => request(`/token/${tokenId(id)}/key`, { method: 'POST' }),
  tokenKeys: (ids) => request('/token/batch/keys', { method: 'POST', body: JSON.stringify({ ids: ids.map(tokenId) }) }),
  usageStats: (query = '') => request(`/log/self/stat${query}`),
  usageTrend: (query = '', signal) => request(`/data/self${query}`, { signal }),
  usageLogs: (query = '') => request(`/log/self${query}`),
  exportUsageLogs: (query = '') => request(`/log/self/export${query}`, { unwrapData: false }),
  topUpInfo: () => request('/user/topup/info'),
  storeCatalog: (signal) => request('/user/store/catalog', { signal }),
  createStoreOrder: (payload) => request('/user/store/orders', { method: 'POST', body: JSON.stringify(payload), unwrapData: false }),
  storeOrder: (tradeNo, signal) => request(`/user/store/orders/${encodeURIComponent(tradeNo)}`, { signal }),
  topUpOrders: (page = 1, signal) => request(`/user/topup/self?p=${page}&size=10`, { signal }),
  redeem: (code) => request('/user/topup', { method: 'POST', body: JSON.stringify({ key: code }) }),
  subscriptionPlans: () => request('/subscription/plans'),
  currentSubscription: () => request('/subscription/self'),
  buySubscription: (payload) => request('/subscription/balance/pay', { method: 'POST', body: JSON.stringify(payload) }),
  paySubscriptionEpay: (payload) => request('/subscription/epay/pay', { method: 'POST', body: JSON.stringify(payload), unwrapData: false }),
  paySubscriptionStripe: (payload) => request('/subscription/stripe/pay', { method: 'POST', body: JSON.stringify(payload) }),
  paySubscriptionCreem: (payload) => request('/subscription/creem/pay', { method: 'POST', body: JSON.stringify(payload) }),
  paySubscriptionPancake: (payload) => request('/subscription/waffo-pancake/pay', { method: 'POST', body: JSON.stringify(payload) }),
};
