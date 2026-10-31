import { Check, Copy, Plus } from 'lucide-react';
import Dialog from './Dialog.jsx';
import ModelSelect from './ModelSelect.jsx';
import { useLanguage } from '../lib/use-language.js';
import { copyText } from '../lib/clipboard.js';

export default function KeyDialog({ type, name, setName, keyLimit, setKeyLimit, keyExpiry, setKeyExpiry, keySaving, createdKey, error, onClose, onCreate, onUpdate, onToast, keyGroup, onKeyGroup, keyGroupOptions }) {
  const { t } = useLanguage();
  const isCreated = type === 'new-key-created';
  const isEdit = type === 'edit-key';
  return <Dialog className="key-dialog" title={t(isCreated ? '密钥已创建' : isEdit ? '配置 API 密钥' : '创建新的 API 密钥')} onClose={onClose}>
    {isCreated ? <><label className="field-label">{t('API 密钥')}</label><div className="secret-field"><code>{createdKey}</code><button className="icon-button" aria-label={t('复制密钥')} onClick={async () => { try { await copyText(createdKey); onToast(t('密钥已复制')); } catch (error) { onToast(error.message); } }}><Copy size={16} /></button></div><div className="modal-actions"><button className="button primary" onClick={onClose}>{t('完成')}</button></div></>
      : <form className="key-form" onSubmit={isEdit ? onUpdate : onCreate}>
        <div className="key-field key-field-wide"><label className="field-label" htmlFor="key-name">{t('密钥名称')}</label><input id="key-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder={t('例如：个人开发环境')} required data-initial-focus /></div>
        <div className="key-field key-field-wide"><label className="field-label">{t('调用分组')}</label><ModelSelect value={keyGroup} onChange={onKeyGroup} options={keyGroupOptions} ariaLabel={t('调用分组')} placeholder={t('选择可用分组')} /></div>
        <div className="key-field"><label className="field-label" htmlFor="key-limit">{t('消费上限（可选）')}</label><input id="key-limit" className="form-input" type="number" min="0" step="1" value={keyLimit} onChange={(event) => setKeyLimit(event.target.value)} placeholder={t('不限制')} /></div>
        <div className="key-field key-expiry-field"><label className="field-label" htmlFor="key-expiry">{t('到期时间')}</label><input id="key-expiry" className="form-input" type="datetime-local" value={keyExpiry} onChange={(event) => setKeyExpiry(event.target.value)} title={t('留空表示永不过期')} /></div>
        {error && <p className="form-error key-field-wide" role="alert">{t(error)}</p>}
        <div className="modal-actions key-field-wide"><button type="button" className="button outline" onClick={onClose} disabled={keySaving}>{t('取消')}</button><button type="submit" className="button primary" disabled={keySaving}>{keySaving ? t('正在保存') : isEdit ? <><Check size={16} />{t('保存配置')}</> : <><Plus size={16} />{t('创建密钥')}</>}</button></div>
      </form>}
  </Dialog>;
}
