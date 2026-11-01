import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n.js';
import { useLanguage } from '../lib/use-language.js';
import { completeOAuthLogin, newApi } from '../lib/newapi.js';
import { consumeOAuthLogin, OAUTH_LOGIN_KEY } from '../lib/auth-methods.js';
import { clearReferralCode } from '../lib/referrals.js';
import { SiteBrand } from './Identity.jsx';
import AuthPage from './AuthPage.jsx';

export default function OAuthCallback({ provider, onNavigate, onAuthenticated, branding }) {
  useLanguage();
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [redirect, setRedirect] = useState('/console/dashboard');
  const exchange = useRef(null);
  const handlers = useRef({ onAuthenticated });
  handlers.current = { onAuthenticated };
  useEffect(() => {
    let active = true;
    if (!exchange.current) exchange.current = (async () => {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      if (!sessionStorage.getItem(OAUTH_LOGIN_KEY)) {
        // Native admin authorization/binding flows keep their original callback handler.
        window.location.replace(`/newapi-admin/oauth/${encodeURIComponent(provider)}${search}`);
        return null;
      }
      window.history.replaceState(window.history.state, '', window.location.pathname);
      const destination = await consumeOAuthLogin(sessionStorage, provider, params.get('state') || '');
      if (params.has('error')) throw new Error(t('已取消第三方授权，请返回登录页重试。'));
      if (!params.get('code')) throw new Error(t('未收到授权码，请返回登录页重试。'));
      const result = await completeOAuthLogin(provider, params.get('code'), params.get('state'));
      return { result, destination };
    })();
    exchange.current.then(async (completed) => {
      if (!active || !completed) return;
      const { result, destination } = completed;
      if (result.requiresVerification) {
        if (!result.challenge?.methods?.some((method) => method.available && ['2fa', 'passkey'].includes(method.method))) throw new Error(t('当前账户没有可用的验证方式，请联系管理员。'));
        setRedirect(destination); setChallenge(result.challenge);
      } else {
        const user = result.user || await newApi.currentUser();
        if (active) { clearReferralCode(); handlers.current.onAuthenticated(user, destination); }
      }
    }).catch((issue) => { if (active) setError(issue.message || t('请求失败，请稍后再试。')); });
    return () => { active = false; };
  }, [provider]);
  if (challenge) return <AuthPage branding={branding} mode="login" initialChallenge={challenge} onNavigate={onNavigate} onAuthenticated={(user) => onAuthenticated(user, redirect)} />;
  return <main className="auth-page"><section className="auth-form-side"><div className="auth-form-wrap"><div className="auth-inline-brand"><SiteBrand status={branding} onNavigate={onNavigate} /></div><div className="auth-title"><h2>{t(error ? '登录未完成' : '正在完成登录…')}</h2><p>{t('验证完成后将返回你的工作台。')}</p></div>{error ? <><div className="form-error" role="alert">{t(error)}</div><button className="auth-submit" onClick={() => onNavigate('/login')}>{t('返回登录')}</button></> : <p className="auth-status" role="status">{t('正在验证第三方授权…')}</p>}</div></section></main>;
}
