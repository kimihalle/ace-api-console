import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import { Network } from 'lucide-react';

export function SiteLogo({ status, name = '', className = 'site-brand-icon' }) {
  const [failed, setFailed] = useState(false);
  const logo = status?.logo || status?.logo_url || status?.system_logo;

  useEffect(() => setFailed(false), [logo]);

  return <span className={className} aria-hidden="true">
    {logo && !failed ? <img src={logo} alt="" onError={() => setFailed(true)} /> : <Network size={18} />}
  </span>;
}

export function SiteBrand({ status, name, onNavigate, className = 'site-brand', suffix }) {
  const displayName = name || status?.system_name || t("模型工作台");
  return <a className={className} href="/" onClick={(event) => {
    if (onNavigate) {
      event.preventDefault();
      onNavigate('/');
    }
  }}>
    <SiteLogo status={status} name={displayName} />
    <span>{displayName}{suffix && <span className="brand-period">{suffix}</span>}</span>
  </a>;
}

export function AccountAvatar({ user, name = '', className = '' }) {
  const [failed, setFailed] = useState(false);
  const image = user?.avatar_url || user?.avatar || user?.profile_picture;
  const displayName = name || user?.username || user?.display_name || t("用户");
  const initial = Array.from(displayName.trim())[0]?.toUpperCase() || 'U';

  useEffect(() => setFailed(false), [image]);

  return <span className={`account-avatar ${className}`.trim()} aria-hidden="true">
    {image && !failed ? <img src={image} alt="" onError={() => setFailed(true)} /> : initial}
  </span>;
}
