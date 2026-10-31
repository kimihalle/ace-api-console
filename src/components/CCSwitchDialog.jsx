import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import Dialog from './Dialog.jsx';
import ModelSelect from './ModelSelect.jsx';
import { apiBaseLabel } from '../lib/newapi.js';
import { buildCCSwitchUrl, ccSwitchModels } from '../lib/cc-switch.js';
import { useLanguage } from '../lib/use-language.js';

const clients = [{ value: 'claude', label: 'Claude Code' }, { value: 'codex', label: 'Codex' }, { value: 'gemini', label: 'Gemini' }];

export default function CCSwitchDialog({ token, catalog, status, loading, onClose }) {
  const { t } = useLanguage();
  const [app, setApp] = useState('claude');
  const [name, setName] = useState(`${status?.system_name || 'API'} · ${token.name}`);
  const [models, setModels] = useState({});
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => ccSwitchModels(catalog, token.raw), [catalog, token.raw]);
  const updateApp = (value) => { setApp(value); setModels({}); setExpanded(false); setError(''); };
  const submit = (event) => {
    event.preventDefault();
    if (!options.includes(models.model)) { setError('请选择主模型'); return; }
    if (app === 'claude' && ['haikuModel', 'sonnetModel', 'opusModel'].some((field) => models[field] && !options.includes(models[field]))) { setError('所选模型已不可用，请重新选择'); return; }
    try {
      const url = buildCCSwitchUrl({ app, name, models, apiKey: token.secret, serverAddress: apiBaseLabel() });
      window.open(url, '_self', 'noopener');
      onClose();
    } catch (error) { setError(error.message || '无法打开 CC Switch，请确认已安装'); }
  };
  return <Dialog title={t('导入 CC Switch')} className="cc-switch-dialog" onClose={onClose}>
    <form className="cc-switch-form" onSubmit={submit}>
      <div className="cc-switch-clients" role="radiogroup" aria-label={t('客户端')} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (clients.findIndex((client) => client.value === app) + (event.key === 'ArrowLeft' ? 2 : 1)) % clients.length;
        updateApp(clients[index].value);
        event.currentTarget.querySelectorAll('[role="radio"]')[index].focus();
      }}>{clients.map((client) => <button key={client.value} type="button" role="radio" aria-checked={app === client.value} tabIndex={app === client.value ? 0 : -1} className={app === client.value ? 'is-selected' : ''} onClick={() => updateApp(client.value)}>{client.label}</button>)}</div>
      <div><label className="field-label" htmlFor="cc-switch-name">{t('配置名称')}</label><input id="cc-switch-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} data-initial-focus /></div>
      <div><label className="field-label">{t('主模型')}</label><ModelSelect ariaLabel={t('主模型')} value={models.model || ''} onChange={(value) => { setModels((current) => ({ ...current, model: value })); setError(''); }} options={options} placeholder={t(loading ? '正在加载模型…' : '选择模型')} disabled={loading} /></div>
      {!loading && !options.length && <p className="cc-switch-empty" role="status">{t('此密钥分组暂无可用模型')}</p>}
      {app === 'claude' && <><button type="button" className="cc-switch-more" aria-expanded={expanded} aria-controls="cc-switch-mappings" onClick={() => setExpanded((value) => !value)}>{t(expanded ? '收起模型映射' : '更多模型映射（可选）')}</button>{expanded && <div id="cc-switch-mappings" className="cc-switch-mappings">{[['haikuModel', 'Haiku'], ['sonnetModel', 'Sonnet'], ['opusModel', 'Opus']].map(([field, label]) => <div key={field}><label className="field-label">{label}</label><ModelSelect ariaLabel={label} value={models[field] || '__primary__'} onChange={(value) => setModels((current) => ({ ...current, [field]: value === '__primary__' ? '' : value }))} options={[{ value: '__primary__', label: t('跟随主模型') }, ...options]} /></div>)}</div>}</>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <div className="modal-actions"><button type="button" className="button outline" onClick={onClose}>{t('取消')}</button><button type="submit" className="button primary" disabled={loading || !options.length}><Download size={15} />{t('打开 CC Switch')}</button></div>
    </form>
  </Dialog>;
}
