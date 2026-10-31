import { t } from './i18n.js';
import { consoleReturnPath } from './routes.js';

export const OAUTH_LOGIN_KEY = 'relay-console.oauth-login';

export function enabledLoginProviders(status) {
  if (!status) return [];
  const providers = [];
  if (status.passkey_login) providers.push({ slug: 'passkey', name: t('通行密钥'), kind: 'passkey' });
  if (status.wechat_login) providers.push({ slug: 'wechat', name: t('微信'), kind: 'wechat' });
  for (const [slug, enabled, client, name, endpoint, scope] of [
    ['github', status.github_oauth, status.github_client_id, 'GitHub', 'https://github.com/login/oauth/authorize', 'user:email'],
    ['discord', status.discord_oauth, status.discord_client_id, 'Discord', 'https://discord.com/oauth2/authorize', 'identify+openid'],
    ['linuxdo', status.linuxdo_oauth, status.linuxdo_client_id, 'LinuxDO', 'https://connect.linux.do/oauth2/authorize', ''],
    ['oidc', status.oidc_enabled, status.oidc_client_id, status.oidc_display_name?.trim() || 'OIDC', status.oidc_authorization_endpoint, 'openid profile email'],
  ]) {
    if (enabled && client && endpoint) providers.push({ slug, name, kind: 'oauth', client, endpoint, scope });
  }
  if (status.telegram_oauth && status.telegram_oauth_configured) providers.push({ slug: 'telegram', name: 'Telegram', kind: 'oauth' });
  for (const provider of status.custom_oauth_providers || []) {
    if (!/^[a-zA-Z0-9_-]+$/.test(provider.slug) || !provider.client_id || !provider.authorization_endpoint || providers.some((item) => item.slug === provider.slug)) continue;
    providers.push({ slug: provider.slug, name: provider.name, kind: 'oauth', client: provider.client_id, endpoint: provider.authorization_endpoint, scope: provider.scopes });
  }
  return providers;
}

export function oauthAuthorizationURL(provider, authorization, origin) {
  const state = typeof authorization === 'string' ? authorization : authorization?.flow_token;
  if (!state) throw new Error(t('无法初始化第三方登录，请重试。'));
  const url = new URL(provider.slug === 'telegram' ? authorization.authorization_url : provider.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(t('第三方登录地址配置无效，请联系管理员。'));
  if (provider.slug === 'telegram') return url.href;
  url.searchParams.set('client_id', provider.client);
  url.searchParams.set('state', state);
  if (provider.slug !== 'github') url.searchParams.set('response_type', 'code');
  if (!['github', 'linuxdo'].includes(provider.slug)) url.searchParams.set('redirect_uri', `${origin}/oauth/${provider.slug}`);
  if (provider.scope) url.searchParams.set('scope', provider.scope);
  return url.href;
}

// Only a hash is persisted; authorization codes, flow tokens and access tokens stay out of storage.
export async function rememberOAuthLogin(storage, provider, authorization, redirect) {
  const state = typeof authorization === 'string' ? authorization : authorization?.flow_token;
  if (!state) throw new Error(t('无法初始化第三方登录，请重试。'));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state))), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const expiresAt = Math.min(authorization?.expires_at * 1000 || Infinity, Date.now() + 600000);
  storage.setItem(OAUTH_LOGIN_KEY, JSON.stringify({ provider, digest, redirect: consoleReturnPath(`?redirect=${encodeURIComponent(redirect)}`), expiresAt }));
}

export async function consumeOAuthLogin(storage, provider, state) {
  const raw = storage.getItem(OAUTH_LOGIN_KEY);
  if (!raw) throw new Error(t('登录授权已失效，请返回登录页重试。'));
  storage.removeItem(OAUTH_LOGIN_KEY);
  const pending = JSON.parse(raw);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state))), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!state || provider !== pending.provider || digest !== pending.digest || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now()) throw new Error(t('登录授权已失效，请返回登录页重试。'));
  return consoleReturnPath(`?redirect=${encodeURIComponent(pending.redirect)}`);
}

export function passkeyRequestOptions(payload) {
  const options = payload?.publicKey ?? payload?.PublicKey ?? payload?.response ?? payload?.Response;
  if (!options?.challenge) throw new Error(t('通行密钥验证数据无效，请重试。'));
  const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), (character) => character.charCodeAt(0));
  return { ...options, challenge: decode(options.challenge), ...(options.allowCredentials ? { allowCredentials: options.allowCredentials.map((item) => ({ ...item, id: decode(item.id) })) } : {}) };
}

export function passkeyAssertion(credential) {
  if (!credential) throw new Error(t('已取消通行密钥验证。'));
  const encode = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return {
    id: credential.id, rawId: encode(credential.rawId), type: credential.type, authenticatorAttachment: credential.authenticatorAttachment,
    response: { authenticatorData: encode(credential.response.authenticatorData), clientDataJSON: encode(credential.response.clientDataJSON), signature: encode(credential.response.signature), userHandle: credential.response.userHandle ? encode(credential.response.userHandle) : null },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };
}
