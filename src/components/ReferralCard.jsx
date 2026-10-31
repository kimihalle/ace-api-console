import { Copy, Users } from 'lucide-react';
import { formatQuotaDisplay } from '../lib/usage-format.js';
import { useLanguage } from '../lib/use-language.js';

export default function ReferralCard({ user, status, code, loading, error, onRetry, onCopy, onTransfer }) {
  const { t, locale } = useLanguage();
  const link = code ? `${location.origin}/register?aff=${encodeURIComponent(code)}` : '';
  return <section className="panel referral-panel">
    <div className="referral-header"><div className="referral-heading"><div className="metric-icon orange"><Users size={18} /></div><div><h2>{t('邀请推广')}</h2><p>{t('邀请朋友加入，获取账户奖励')}</p></div></div>{Number(user?.aff_quota) > 0 && <button className="button outline small" onClick={onTransfer}>{t('转入余额')}</button>}</div>
    <div className="referral-stats"><div><span>{t('邀请人数')}</span><strong>{Number(user?.aff_count ?? 0).toLocaleString(locale)}</strong></div><div><span>{t('已获得额度')}</span><strong>{formatQuotaDisplay(user?.aff_history_quota ?? 0, status)}</strong></div><div><span>{t('可转入额度')}</span><strong>{formatQuotaDisplay(user?.aff_quota ?? 0, status)}</strong></div></div>
    <div className="referral-link"><div><strong>{t('我的邀请链接')}</strong><span>{link || t(loading ? '正在获取邀请链接…' : '邀请链接暂时不可用')}</span></div>{error ? <button className="button outline" onClick={onRetry}>{t('重试')}</button> : <button className="button primary" disabled={!link || loading} onClick={() => onCopy(link)}><Copy size={16} />{t('复制链接')}</button>}</div>
    {error && <p className="referral-error" role="alert">{t(error)}</p>}
  </section>;
}
