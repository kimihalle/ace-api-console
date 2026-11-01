import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import { Network } from 'lucide-react';

export function SiteLogo({ status, className = 'site-brand-icon', onImageError, onImageLoad }) {
  const [failed, setFailed] = useState(false);
  const logo = status?.logo || status?.logo_url || status?.system_logo;
  const hasImage = Boolean(logo && !failed);

  useEffect(() => setFailed(false), [logo]);

  return <span className={`${className}${hasImage ? ' has-site-image' : ''}`} aria-hidden="true">
    {logo && !failed ? <img src={logo} alt="" onLoad={onImageLoad} onError={() => { setFailed(true); onImageError?.(logo); }} /> : status && <Network size={18} />}
  </span>;
}

export function SiteBrand({ status, name, onNavigate, className = 'site-brand', logoClassName, nameClassName, suffix }) {
  const [failedLogo, setFailedLogo] = useState('');
  const logo = status?.logo || status?.logo_url || status?.system_logo;
  const logoOnly = Boolean(logo && failedLogo !== logo);
  const displayName = name || (status ? status.system_name || t('模型工作台') : '');
  return <a className={className} href="/" aria-label={displayName || t('首页')} aria-busy={!status} onClick={(event) => {
    if (onNavigate && !event.button && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onNavigate('/');
    }
  }}>
    {status && <SiteLogo key={logo} status={status} className={logoClassName} onImageError={setFailedLogo} onImageLoad={() => setFailedLogo('')} />}
    {!logoOnly && <span className={nameClassName}>{displayName}{suffix && <span className="brand-period">{suffix}</span>}</span>}
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
