import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { t } from '../lib/i18n.js';
import { consoleReturnPath } from '../lib/routes.js';
import { enabledLoginProviders, oauthAuthorizationURL, rememberOAuthLogin, passkeyRequestOptions, passkeyAssertion } from '../lib/auth-methods.js';
import { logout, createOAuthLogin, loginWithWeChat, beginPasskeyLogin, finishPasskeyLogin } from '../lib/newapi.js';

export default function AlternativeLogin({ status, disabled, beforeLogin, onResult, onError, onBusy, challenge }) {
  const [busy, setBusy] = useState(false);
  const [wechatOpen, setWeChatOpen] = useState(false);
  const [code, setCode] = useState('');
  const [rpID, setRPID] = useState('');
  const operation = useRef(null);
  const locked = useRef(false);
  useEffect(() => () => operation.current?.abort(), []);
  const providers = challenge ? (challenge.methods?.some((item) => item.method === 'passkey' && item.available) ? [{ slug: 'passkey', name: t('通行密钥'), kind: 'passkey' }] : []) : enabledLoginProviders(status);
  if (!providers.length) return null;

  async function start(provider) {
    if (locked.current || disabled) return;
    if (provider.kind === 'wechat' && !wechatOpen) { setWeChatOpen(true); return; }
    locked.current = true; setBusy(true); onBusy(true); onError('');
    const controller = new AbortController();
    operation.current = controller;
    try {
      await beforeLogin();
      if (provider.kind === 'oauth') {
        await logout();
        const authorization = await createOAuthLogin(provider.slug, new URLSearchParams(location.search).get('aff'));
        const url = oauthAuthorizationURL(provider, authorization, location.origin);
        await rememberOAuthLogin(sessionStorage, provider.slug, authorization, consoleReturnPath(location.search));
        window.location.assign(url);
      } else if (provider.kind === 'wechat') {
        if (!code.trim()) throw new Error(t('请填写微信验证码。'));
        await onResult(await loginWithWeChat(code.trim()));
        setCode(''); setWeChatOpen(false);
      } else {
        if (!window.PublicKeyCredential || !navigator.credentials?.get || !window.isSecureContext) throw new Error(t('当前浏览器不支持通行密钥，请使用支持的浏览器与 HTTPS。'));
        if (challenge && challenge.expires_at * 1000 <= Date.now()) throw new Error(t('登录验证已过期，请重新登录。'));
        const begin = await beginPasskeyLogin({ flowToken: challenge?.flow_token, rpID, signal: controller.signal });
        if (!begin.flow_token) throw new Error(t('通行密钥验证数据无效，请重试。'));
        const publicKey = passkeyRequestOptions(begin.options || begin);
        const credential = await navigator.credentials.get({ publicKey, signal: controller.signal });
        controller.signal.throwIfAborted();
        const result = await finishPasskeyLogin({ flowToken: challenge?.flow_token, passkeyFlowToken: begin.flow_token, credential: passkeyAssertion(credential), signal: controller.signal });
        await onResult(result);
      }
    } catch (issue) {
      if (!controller.signal.aborted) onError(issue.name === 'NotAllowedError' ? t('已取消通行密钥验证。') : issue.message || t('请求失败，请稍后再试。'));
    } finally { if (!controller.signal.aborted) { setBusy(false); onBusy(false); } locked.current = false; }
  }

  return <section className="auth-alternatives" aria-label={t('其他登录方式')}>
    <div className="auth-alternatives-label"><span>{t(challenge ? '或使用通行密钥验证' : '其他登录方式')}</span></div>
    <div className="auth-provider-grid">{providers.map((provider) => <button className="auth-provider-button" type="button" data-provider={provider.slug} disabled={disabled || busy} onClick={() => start(provider)} key={provider.slug}>{provider.kind === 'passkey' ? <KeyRound size={16} /> : <ShieldCheck size={16} />}<span>{busy ? t('处理中…') : t('使用 {name} 登录', { name: provider.name })}</span></button>)}</div>
    {providers.some((item) => item.kind === 'passkey') && status?.passkey_rp_ids?.length > 1 && <label className="auth-rp-select">{t('通行密钥域名')}<select className="field-control" value={rpID} disabled={busy || disabled} onChange={(event) => setRPID(event.target.value)}><option value="">{t('使用默认域名')}</option>{status.passkey_rp_ids.map((id) => <option value={id} key={id}>{id}</option>)}</select></label>}
    {wechatOpen && status?.wechat_login && <form className="auth-wechat-panel" onSubmit={(event) => { event.preventDefault(); start(providers.find((item) => item.kind === 'wechat')); }}>
      {/^https?:\/\//.test(status.wechat_qrcode || '') ? <img src={status.wechat_qrcode} alt={t('微信登录二维码')} referrerPolicy="no-referrer" /> : null}
      <p>{t('关注公众号获取验证码，输入后登录。')}</p><label className="field-label" htmlFor="auth-wechat-code">{t('微信验证码')}</label><input className="field-control" id="auth-wechat-code" autoComplete="one-time-code" value={code} disabled={busy} required onChange={(event) => setCode(event.target.value)} />
      <button className="auth-submit" type="submit" disabled={busy || disabled || !code.trim()}>{t('验证并登录')}</button><button className="auth-text-link auth-recovery-link" type="button" disabled={busy} onClick={() => { setWeChatOpen(false); setCode(''); }}>{t('取消')}</button>
    </form>}
  </section>;
}
