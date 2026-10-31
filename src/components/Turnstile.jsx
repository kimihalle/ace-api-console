import { useEffect, useRef, useState } from 'react';
import { t, getLanguage } from '../lib/i18n.js';

let scriptPromise;
function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => fail(), 15000);
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      scriptPromise = null;
      reject(new Error('Turnstile unavailable'));
    };
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      if (!window.turnstile?.render) return fail();
      clearTimeout(timeout);
      resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptPromise;
}

export default function Turnstile({ siteKey, resetKey, onToken }) {
  const container = useRef(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const language = getLanguage();
  useEffect(() => {
    let active = true, widget, client;
    setFailed(false);
    callback.current('');
    if (!siteKey) { setFailed(true); return; }
    loadTurnstile().then((api) => {
      if (!active) return;
      client = api;
      widget = api.render(container.current, {
        sitekey: siteKey, theme: 'light', size: 'flexible', language: language === 'zh' ? 'zh-cn' : 'en',
        callback: (token) => { if (active) { setFailed(false); callback.current(token); } },
        'expired-callback': () => { if (active) callback.current(''); },
        'error-callback': () => { if (active) { callback.current(''); setFailed(true); } },
      });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (client && widget !== undefined) client.remove(widget); };
  }, [siteKey, resetKey, retry, language]);
  return <div className="auth-challenge"><div ref={container} />{failed && <div className="auth-challenge-error" role="alert"><span>{t(siteKey ? '安全验证加载失败，请重试。' : '安全验证尚未配置，请联系管理员。')}</span>{siteKey && <button type="button" onClick={() => setRetry((value) => value + 1)}>{t('重新加载验证')}</button>}</div>}</div>;
}
