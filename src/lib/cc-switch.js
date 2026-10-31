import { fullTokenKey } from './tokens.js';
import { modelInGroup } from './model-marketplace.js';

export function ccSwitchModels(catalog, token) {
  const limits = token?.model_limits_enabled ? new Set((token.model_limits || '').split(',').map((name) => name.trim()).filter(Boolean)) : null;
  const groups = token?.group === 'auto' ? token.auto_groups || [] : token?.group ? [token.group] : [];
  return [...new Set(catalog.filter((model) => (!groups.length || !model.groups?.length || groups.some((group) => modelInGroup(model, group))) && (!limits || limits.has(model.name))).map((model) => model.name).filter(Boolean))];
}

export function buildCCSwitchUrl({ app, name, models, apiKey, serverAddress }) {
  if (!['claude', 'codex', 'gemini'].includes(app)) throw new Error('请选择客户端');
  const key = fullTokenKey(apiKey);
  if (!key) throw new Error('密钥读取失败，请重试');
  if (!name?.trim()) throw new Error('请填写配置名称');
  if (!models?.model?.trim()) throw new Error('请选择主模型');
  let server;
  try { server = new URL(serverAddress?.trim()); } catch { throw new Error('API 接入地址无效，请联系管理员'); }
  if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password || server.search || server.hash) throw new Error('API 接入地址无效，请联系管理员');
  const base = server.href.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const params = new URLSearchParams({ resource: 'provider', app, name: name.trim(), endpoint: app === 'codex' ? `${base}/v1` : base, apiKey: key, homepage: base, enabled: 'true' });
  for (const field of app === 'claude' ? ['model', 'haikuModel', 'sonnetModel', 'opusModel'] : ['model']) {
    if (models[field]?.trim()) params.set(field, models[field].trim());
  }
  return `ccswitch://v1/import?${params}`;
}
