import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Mail } from 'lucide-react';
import { t } from '../lib/i18n.js';
import { useLanguage } from '../lib/use-language.js';
import { login, register, verifyLoginCode, newApi, sendRegistrationCode, sendPasswordResetEmail, confirmPasswordReset } from '../lib/newapi.js';
import { consoleReturnPath } from '../lib/routes.js';
import { copyText } from '../lib/clipboard.js';
import { SiteBrand } from './Identity.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import Turnstile from './Turnstile.jsx';
import AlternativeLogin from './AlternativeLogin.jsx';
import './auth.css';

function useAuthStatus() {
  const [status, setStatus] = useState(null);
  const [connection, setConnection] = useState('loading');
  const reload = useRef(null);
  useEffect(() => {
    let active = true, version = 0;
    const refresh = async () => {
      const current = ++version;
      try {
        const data = await newApi.publicStatus();
        if (active && current === version) { setStatus(data); setConnection('ready'); }
        return data;
      } catch (error) {
        if (active && current === version) setConnection('error');
        throw error;
      }
    };
    reload.current = refresh;
    const refreshVisible = () => { if (!document.hidden) refresh().catch(() => {}); };
    refreshVisible();
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = setInterval(refreshVisible, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); };
  }, []);
  return { status, connection, refresh: () => reload.current() };
}

function useCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [until]);
  return [Math.max(0, Math.ceil((until - now) / 1000)), () => { const time = Date.now(); setNow(time); setUntil(time + 60000); }];
}

export default function AuthPage({ mode, onNavigate, onAuthenticated, initialChallenge = null, branding }) {
  useLanguage();
  const { status, connection, refresh } = useAuthStatus();
  const isRegister = mode === 'register', isForgot = mode === 'forgot-password', isReset = mode === 'reset';
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', verification_code: '', turnstile: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [challengeKey, setChallengeKey] = useState(0);
  const [seconds, startCountdown] = useCountdown();
  const [resetLink, setResetLink] = useState(() => {
    if (!isReset) return null;
    const params = new URLSearchParams(window.location.search);
    // Older New API email links did not escape '+' in email aliases.
    const rawEmail = window.location.search.match(/[?&]email=([^&]*)/)?.[1] || '';
    let email;
    try { email = decodeURIComponent(rawEmail); } catch { email = ''; }
    return { email, token: params.get('token') || '' };
  });
  const [newPassword, setNewPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [loginChallenge, setLoginChallenge] = useState(initialChallenge);
  const [loginCode, setLoginCode] = useState('');
  const lock = useRef(false);
  const emailVerified = status?.email_verification === true;
  const registerEnabled = status?.register_enabled !== false && status?.password_register_enabled !== false;
  const loginEnabled = status?.password_login_enabled !== false;
  const needsTurnstile = !isReset && !loginChallenge && Boolean(status?.turnstile_check || status?.turnstile_check_enabled);
  const requiresLegal = !isForgot && !isReset && Boolean(status?.user_agreement_enabled || status?.privacy_policy_enabled);
  const available = isReset || Boolean(loginChallenge) || (isRegister ? registerEnabled : loginEnabled);
  const working = busy || sending;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const resetChallenge = () => { update('turnstile', ''); setChallengeKey((value) => value + 1); };

  // Email links contain a one-use secret. Keep it in memory and remove it from the address bar.
  useEffect(() => {
    if (!isReset) return;
    const meta = document.createElement('meta');
    meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.append(meta);
    window.history.replaceState(window.history.state, '', window.location.pathname);
    return () => meta.remove();
  }, [isReset]);
  useEffect(() => {
    if (isRegister && !emailVerified) setForm((current) => ({ ...current, email: '', verification_code: '' }));
  }, [emailVerified, isRegister]);

  function target(path, extra = {}) {
    const params = new URLSearchParams({ redirect: consoleReturnPath(window.location.search), ...extra });
    const affiliate = new URLSearchParams(window.location.search).get('aff');
    if (affiliate) params.set('aff', affiliate);
    return `${path}?${params}`;
  }
  function validateChallenge(current) {
    if ((current.turnstile_check || current.turnstile_check_enabled) && !form.turnstile) throw new Error(t('请先完成安全验证。'));
  }

  async function handleLoginResult(result) {
    if (result.requiresVerification) {
      update('password', '');
      if (!result.challenge?.methods?.some((method) => ['2fa', 'passkey'].includes(method.method) && method.available)) throw new Error(t('当前账户没有可用的验证方式，请联系管理员。'));
      setLoginChallenge(result.challenge); setLoginCode('');
      return;
    }
    await onAuthenticated(result.user || await newApi.currentUser());
  }

  async function beforeAlternativeLogin() {
    const current = await refresh();
    if (!loginChallenge && (current.user_agreement_enabled || current.privacy_policy_enabled) && !accepted) throw new Error(t('请先同意服务条款和隐私政策。'));
  }

  async function sendCode() {
    if (lock.current || seconds) return;
    const emailInput = document.getElementById('auth-email');
    if (!emailInput?.reportValidity()) return;
    lock.current = true; setSending(true); setError(''); setNotice('');
    try {
      const current = await refresh();
      if (!current.email_verification || current.register_enabled === false || current.password_register_enabled === false) throw new Error(t('注册设置已更新，请按当前页面重新填写。'));
      validateChallenge(current);
      await sendRegistrationCode(form.email, form.turnstile);
      startCountdown();
      setNotice(t('验证码已发送，请查看邮箱和垃圾邮件。'));
    } catch (issue) { setError(issue.message || t('请求失败，请稍后再试。')); }
    finally { resetChallenge(); setSending(false); lock.current = false; }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (isReset) {
        if (!resetLink?.email || !resetLink?.token || newPassword) throw new Error(t('重置链接无效，请重新申请。'));
        const password = await confirmPasswordReset(resetLink.email, resetLink.token);
        if (typeof password !== 'string' || !password) throw new Error(t('未收到新密码，请联系管理员。'));
        setNewPassword(password); setResetLink((current) => ({ ...current, token: '' }));
        return;
      }
      if (loginChallenge) {
        if (Date.now() >= loginChallenge.expires_at * 1000) {
          setLoginChallenge(null); setLoginCode('');
          throw new Error(t('登录验证已过期，请重新登录。'));
        }
        const result = await verifyLoginCode(loginChallenge.flow_token, loginCode.trim());
        await onAuthenticated(result.user || await newApi.currentUser());
        return;
      }
      const current = await refresh();
      const emailRequired = current.email_verification === true;
      validateChallenge(current);
      if (isForgot) {
        if (current.password_login_enabled === false) throw new Error(t('当前未开放邮箱找回，请联系管理员。'));
        if (seconds) return;
        await sendPasswordResetEmail(form.email, form.turnstile);
        startCountdown();
        setNotice(t('如果该邮箱已绑定账户，你会收到密码重置邮件。请检查收件箱和垃圾邮件，未收到可稍后重试。'));
      } else if (isRegister) {
        if (current.register_enabled === false || current.password_register_enabled === false) throw new Error(t('管理员暂未开放账号注册。'));
        if (form.password.length < 8 || form.password.length > 128) throw new Error(t('密码需要 8–128 个字符。'));
        if (form.password !== form.confirm) throw new Error(t('两次输入的密码不一致。'));
        if (emailRequired && (!form.email.trim() || !form.verification_code.trim())) throw new Error(t('请填写邮箱和邮箱验证码。'));
        if ((current.user_agreement_enabled || current.privacy_policy_enabled) && !accepted) throw new Error(t('请先同意服务条款和隐私政策。'));
        await register({
          username: form.username.trim(), password: form.password, turnstile: form.turnstile,
          ...(emailRequired ? { email: form.email.trim(), verification_code: form.verification_code.trim() } : {}),
          aff_code: new URLSearchParams(window.location.search).get('aff') || undefined,
        });
        onNavigate(target('/login', { created: '1' }));
      } else {
        if (current.password_login_enabled === false) throw new Error(t('管理员已关闭密码登录。'));
        if ((current.user_agreement_enabled || current.privacy_policy_enabled) && !accepted) throw new Error(t('请先同意服务条款和隐私政策。'));
        const result = await login({ username: form.username.trim(), password: form.password, turnstile: form.turnstile });
        await handleLoginResult(result);
      }
    } catch (issue) { setError(issue.message || t('请求失败，请稍后再试。')); }
    finally { if (!isReset) resetChallenge(); setBusy(false); lock.current = false; }
  }

  async function copyPassword() {
    try { await copyText(newPassword); setCopied(true); }
    catch (issue) { setError(issue.message); }
  }
  const title = loginChallenge ? '验证身份' : isRegister ? '创建你的账户' : isForgot ? '找回密码' : isReset ? (newPassword ? '密码已重置' : '设置新密码') : '欢迎回来';
  const description = isRegister ? (emailVerified ? '验证邮箱后，开启你的模型工作台。' : '注册后即可查看实例支持的模型和额度。')
    : loginChallenge ? '完成身份验证后继续登录。' : isForgot ? '输入账户绑定的邮箱，我们会发送重置链接。'
      : isReset ? (newPassword ? '请保存新密码，再返回登录。登录后可在个人设置中修改。' : '确认后将为你生成新密码，原密码会失效。') : '登录后继续管理你的模型接入。';
  return <main className="auth-page"><section className="auth-form-side"><div className="auth-form-wrap">
    <div className="auth-inline-brand"><SiteBrand status={status || branding} onNavigate={onNavigate} /><LanguageSwitcher /></div>
    <div className="auth-title"><h2>{t(title)}</h2><p>{t(description)}</p></div>
    {connection === 'loading' && <p className="auth-status" role="status">{t('正在读取账户设置…')}</p>}
    {connection === 'error' && <div className="connection-callout" role="alert"><span>{t('服务暂时不可用，请稍后重试。')}</span><button type="button" onClick={() => refresh().catch(() => {})}>{t('重试')}</button></div>}
    {!isReset && connection === 'ready' && !available && <div className="connection-callout" role="status">{t(isRegister ? '管理员暂未开放账号注册。' : isForgot ? '当前未开放邮箱找回，请联系管理员。' : '管理员已关闭密码登录。')}</div>}
    {!isRegister && !isForgot && !isReset && new URLSearchParams(window.location.search).get('created') === '1' && <div className="success-callout" role="status"><Check size={16} />{t('账户已创建，请使用新账户登录。')}</div>}
    <form className="auth-form" onSubmit={submit}>
      {available && !isReset && <fieldset disabled={working || connection !== 'ready'}>
        {loginChallenge?.methods?.some((method) => method.method === '2fa' && method.available) && <><label className="field-label" htmlFor="auth-login-code">{t('验证码或恢复码')}</label><input id="auth-login-code" className="field-control" autoComplete="one-time-code" autoFocus value={loginCode} onChange={(event) => setLoginCode(event.target.value)} required /></>}
        {!isForgot && !loginChallenge && <><label className="field-label" htmlFor="auth-username">{t(isRegister ? '用户名' : '用户名或邮箱')}</label><input id="auth-username" className="field-control" autoComplete="username" autoCapitalize="off" spellCheck="false" maxLength={isRegister ? 20 : undefined} value={form.username} onChange={(event) => update('username', event.target.value)} placeholder={t(isRegister ? '输入用户名' : '输入用户名或邮箱')} required /></>}
        {(isForgot || (isRegister && emailVerified)) && <>
          <label className="field-label" htmlFor="auth-email">{t('邮箱')}</label><input id="auth-email" type="email" className="field-control" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => { update('email', event.target.value); update('verification_code', ''); }} placeholder="name@example.com" required />
          {isRegister && <><div className="auth-code-label"><label className="field-label" htmlFor="auth-code">{t('邮箱验证码')}</label><span>{t('6 位数字')}</span></div><div className="auth-code-row"><input id="auth-code" className="field-control" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={form.verification_code} onChange={(event) => update('verification_code', event.target.value.replace(/\D/g, ''))} placeholder={t('输入验证码')} required /><button type="button" className="auth-code-send" onClick={sendCode} disabled={sending || seconds > 0 || !form.email.trim() || (needsTurnstile && !form.turnstile)}>{sending ? t('发送中…') : seconds ? t('{seconds} 秒后重发', { seconds }) : t('发送验证码')}</button></div></>}
        </>}
        {!isForgot && !loginChallenge && <>
          <div className="password-label"><label className="field-label" htmlFor="auth-password">{t('密码')}</label>{!isRegister && <button type="button" onClick={() => onNavigate(target('/forgot-password'))}>{t('忘记密码？')}</button>}</div>
          <div className="password-wrap"><input id="auth-password" className="field-control" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} maxLength={isRegister ? 128 : undefined} value={form.password} onChange={(event) => update('password', event.target.value)} placeholder={t(isRegister ? '8–128 个字符' : '输入密码')} required /><button type="button" aria-label={t(showPassword ? '隐藏密码' : '显示密码')} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          {isRegister && <><label className="field-label" htmlFor="auth-confirm">{t('确认密码')}</label><input id="auth-confirm" className="field-control" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={form.confirm} onChange={(event) => update('confirm', event.target.value)} placeholder={t('再次输入密码')} required /></>}
        </>}
        {needsTurnstile && <Turnstile siteKey={status?.turnstile_site_key} resetKey={challengeKey} onToken={(token) => update('turnstile', token)} />}
        {requiresLegal && !loginChallenge && <label className="legal-check"><input type="checkbox" checked={accepted} required onChange={(event) => setAccepted(event.target.checked)} /><span>{t('我已阅读并同意该实例的服务条款与隐私政策。')} {status?.user_agreement_enabled && <a href="/newapi-admin/user-agreement" target="_blank" rel="noopener noreferrer">{t('服务条款')}</a>} {status?.privacy_policy_enabled && <a href="/newapi-admin/privacy-policy" target="_blank" rel="noopener noreferrer">{t('隐私政策')}</a>}</span></label>}
        {(!loginChallenge || loginChallenge.methods?.some((method) => method.method === '2fa' && method.available)) && <button className="auth-submit" type="submit" disabled={working || (isForgot && seconds > 0) || (needsTurnstile && !form.turnstile)}>{busy ? t('处理中…') : loginChallenge ? t('验证并登录') : isRegister ? t('创建账户') : isForgot ? (seconds ? t('{seconds} 秒后重发', { seconds }) : t('发送重置邮件')) : t('登录工作区')}</button>}
        {loginChallenge && <button type="button" className="auth-text-link auth-recovery-link" onClick={() => { setLoginChallenge(null); setLoginCode(''); setError(''); }}>{t('重新登录')}</button>}
      </fieldset>}
      {isReset && <>
        <label className="field-label" htmlFor="auth-reset-email">{t('账户邮箱')}</label><input id="auth-reset-email" className="field-control" type="email" value={resetLink?.email || ''} disabled />
        {newPassword ? <><div className="auth-reset-success"><Check size={19} /><span>{t('新密码仅在本页展示，请妥善保存。')}</span></div><label className="field-label" htmlFor="auth-new-password">{t('新密码')}</label><div className="auth-code-row"><input id="auth-new-password" className="field-control auth-generated-password" type="text" autoComplete="off" readOnly value={newPassword} /><button className="auth-code-send" type="button" onClick={copyPassword}>{copied ? <Check size={16} /> : <Copy size={16} />}{t(copied ? '已复制' : '复制')}</button></div><button className="auth-submit" type="button" onClick={() => onNavigate('/login')}>{t('返回登录')}</button></>
          : resetLink?.email && resetLink?.token ? <button className="auth-submit" type="submit" disabled={busy}>{busy ? t('处理中…') : t('确认重置密码')}</button>
            : <div className="form-error" role="alert">{t('重置链接无效，请重新申请。')}</div>}
        {!newPassword && <button className="auth-text-link auth-recovery-link" type="button" onClick={() => onNavigate('/forgot-password')}>{t('重新申请重置邮件')}</button>}
      </>}
      {notice && <div className="success-callout" role="status"><Mail size={16} /><span>{notice}</span></div>}
      {error && <div className="form-error" role="alert">{t(error)}</div>}
    </form>
    {!available && !isRegister && !isForgot && !isReset && requiresLegal && <label className="legal-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>{t('我已阅读并同意该实例的服务条款与隐私政策。')} {status?.user_agreement_enabled && <a href="/newapi-admin/user-agreement" target="_blank" rel="noopener noreferrer">{t('服务条款')}</a>} {status?.privacy_policy_enabled && <a href="/newapi-admin/privacy-policy" target="_blank" rel="noopener noreferrer">{t('隐私政策')}</a>}</span></label>}
    <div className="auth-footer-links">
      {isForgot || isReset ? <button className="auth-text-link" type="button" onClick={() => onNavigate(target('/login'))}><ArrowLeft size={14} />{t('返回登录')}</button>
        : isRegister ? <div className="auth-switch">{t('已经有账户？')}<button type="button" onClick={() => onNavigate(target('/login'))}>{t('登录')}</button></div>
          : registerEnabled && connection === 'ready' ? <div className="auth-switch">{t('还没有账户？')}<button type="button" onClick={() => onNavigate(target('/register'))}>{t('注册')}</button></div> : null}
      <button className="auth-home-link" type="button" onClick={() => onNavigate('/')}>{t('返回首页')}</button>
    </div>
    {!isRegister && !isForgot && !isReset && connection === 'ready' && <AlternativeLogin status={status} challenge={loginChallenge} disabled={working} beforeLogin={beforeAlternativeLogin} onResult={handleLoginResult} onError={setError} onBusy={setBusy} />}
  </div></section></main>;
}
