import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { apiBaseLabel } from '../lib/newapi.js';
import './ApiEndpoint.css';

export default function ApiEndpoint({ onToast }) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const address = `${apiBaseLabel().replace(/\/+$/, '')}/v1`;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyAddress = async () => {
    setCopying(true);
    setCopied(false);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(address);
      setCopied(true);
      onToast?.(t("API 接入地址已复制"));
    } catch {
      onToast?.(t("复制失败，请手动复制接入地址"));
    } finally {
      setCopying(false);
    }
  };

  return <div className="api-endpoint" role="group" aria-label={t("本站 API 接入地址")}>
    <span className="api-endpoint-label">{t("API 接入地址")}</span>
    <div className="api-endpoint-value">
      <code className="api-endpoint-address" title={address}>{address}</code>
      <button type="button" className="api-endpoint-copy" aria-label={t("复制 API 接入地址")} disabled={copying} onClick={copyAddress}>
        {copied ? <Check size={14} /> : <Copy size={14} />}<span aria-live="polite">{copied ? t("已复制") : t("复制")}</span>
      </button>
    </div>
  </div>;
}
