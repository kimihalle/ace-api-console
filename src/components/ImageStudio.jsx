import { useEffect, useMemo, useState } from 'react';
import { History, ImagePlus, LoaderCircle, Scan, Sparkles, WandSparkles, X } from 'lucide-react';
import ModelSelect from './ModelSelect.jsx';
import ImageStudioImageActions from './ImageStudioImageActions.jsx';
import ImageStudioHistoryDialog from './ImageStudioHistoryDialog.jsx';
import ImageStudioPreviewDialog from './ImageStudioPreviewDialog.jsx';
import { generateImage, newApi } from '../lib/newapi.js';
import { fullTokenKey } from '../lib/tokens.js';
import { imageModels, imageRequest, imageSources } from '../lib/image-studio.js';
import { ccSwitchModels } from '../lib/cc-switch.js';
import { t } from '../lib/i18n.js';
import './ImageStudio.css';

function SizeIcon({ width, height }) {
  const scale = 18 / Math.max(width, height);
  const w = width * scale;
  const h = height * scale;
  return <svg className="image-studio-size-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x={(24 - w) / 2} y={(24 - h) / 2} width={w} height={h} rx="2" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

const sizes = ['256x256', '512x512', '768x768', '1024x1024', '2048x2048', '1536x1024', '1024x1536', '1792x1024', '1024x1792', '1536x864', '864x1536', '1344x768', '768x1344'].map((value) => {
  const [width, height] = value.split('x').map(Number);
  return { value, label: `${width} × ${height}`, icon: <SizeIcon width={width} height={height} /> };
});

export default function ImageStudio({ models = [], userId, onToast }) {
  const [tokens, setTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokenId, setTokenId] = useState('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [works, setWorks] = useState([]);
  const [preview, setPreview] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const first = await newApi.tokens('?p=1&size=100');
        const items = [...(first?.items || [])];
        const total = Number(first?.total || items.length);
        for (let page = 2; items.length < total && page <= 10; page += 1) {
          const next = await newApi.tokens(`?p=${page}&size=100`);
          const batch = next?.items || [];
          if (!batch.length) break;
          items.push(...batch);
        }
        if (active) setTokens(items.filter((item) => Number(item.status) === 1));
      } catch (cause) {
        if (active) setError(cause.message || '密钥加载失败');
      } finally {
        if (active) setTokensLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const selectedToken = tokens.find((item) => String(item.id) === tokenId);
  const availableModels = useMemo(() => {
    const imageOptions = imageModels(models);
    if (!selectedToken) return imageOptions;
    const allowed = new Set(ccSwitchModels(imageOptions, selectedToken));
    return imageOptions.filter((item) => allowed.has(item.name));
  }, [models, selectedToken]);
  useEffect(() => {
    if (model && !availableModels.some((item) => item.name === model)) setModel('');
  }, [availableModels, model]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedToken) return setError('请先选择一个启用中的 API 密钥');
    let payload;
    try {
      payload = imageRequest({ model, prompt, size, count });
    } catch (cause) {
      return setError(cause.message);
    }
    const controller = new AbortController();
    setBusy(true);
    try {
      const key = await newApi.tokenKey(selectedToken.id);
      const secret = fullTokenKey(key?.key);
      if (!secret) throw new Error('无法读取密钥，请在 API 密钥页检查该密钥');
      const generated = await generateImage(secret, payload, controller.signal);
      const sources = imageSources(generated.data);
      if (!sources.length) throw new Error('上游未返回可显示的图片');
      const record = { id: crypto.randomUUID(), request_id: generated.requestId, model, prompt: payload.prompt, sources };
      try {
        if (!record.request_id) throw new Error('服务端没有返回请求编号');
        await newApi.saveImageStudioRecord(record);
        const saved = { ...record, createdAt: Date.now(), sources };
        setWorks((previous) => [saved, ...previous].slice(0, 12));
      } catch (cause) {
        setWorks((previous) => [{ ...record, createdAt: Date.now() }, ...previous].slice(0, 12));
        throw new Error(t('图片已生成，但记录保存失败：{reason}', { reason: cause.message || t('请稍后重试') }));
      }
    } catch (cause) {
      setError(cause.message || '生成失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return <div className="image-studio">
    <div className="image-studio-grid">
      <section className="image-studio-compose" aria-label={t('图片生成设置')}>
        <div className="image-studio-section-head"><span className="image-studio-icon"><WandSparkles size={18} /></span><div><h2>{t('创作设置')}</h2><p>{t('选择密钥和模型，描述你想生成的画面')}</p></div></div>
        <form onSubmit={submit}>
          <div className="image-studio-fields">
            <label className="image-studio-field"><span>{t('API 密钥')}</span><ModelSelect className="image-studio-select" value={tokenId} onChange={setTokenId} options={tokens.map((item) => ({ value: String(item.id), label: item.name || `Key ${item.id}`, description: item.group || '' }))} placeholder={tokensLoading ? t('正在加载密钥') : t('选择已有密钥')} ariaLabel={t('选择 API 密钥')} disabled={busy || tokensLoading} /></label>
            <label className="image-studio-field"><span>{t('图片模型')}</span><ModelSelect className="image-studio-select" value={model} onChange={setModel} options={availableModels.map((item) => ({ value: item.name, label: item.name, description: item.vendor }))} placeholder={t('选择生图模型')} ariaLabel={t('选择生图模型')} disabled={busy} /></label>
          </div>
          <label className="image-studio-field image-studio-prompt"><span>{t('画面描述')}</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder={t('描述画面主体、场景、风格、光线与构图…')} disabled={busy} required /><small>{prompt.length} / 4000</small></label>
          <div className="image-studio-fields image-studio-options">
            <label className="image-studio-field"><span>{t('画面尺寸')}</span><ModelSelect className="image-studio-select" value={size} onChange={setSize} options={[{ value: '', label: t('模型默认'), icon: <Scan size={22} aria-hidden="true" /> }, ...sizes]} ariaLabel={t('画面尺寸')} disabled={busy} allowEmpty /><small className="image-studio-size-hint">{t('可用尺寸取决于所选模型')}</small></label>
            <label className="image-studio-field"><span>{t('生成张数')}</span><div className="image-studio-count" role="group" aria-label={t('生成张数')}>{[1, 2, 3, 4].map((value) => <button type="button" key={value} className={count === value ? 'active' : ''} aria-pressed={count === value} disabled={busy} onClick={() => setCount(value)}>{value}</button>)}</div></label>
          </div>
          {error && <div className="image-studio-error" role="alert">{error}</div>}
          {!tokensLoading && tokens.length === 0 && <div className="image-studio-error" role="status">{t('暂无启用中的 API 密钥，请先到 API 密钥页面创建。')}</div>}
          {!tokensLoading && tokens.length > 0 && availableModels.length === 0 && <div className="image-studio-error" role="status">{t('此密钥分组暂无支持图片生成的模型。')}</div>}
          <button className="image-studio-submit" type="submit" disabled={busy || !tokens.length || !availableModels.length}>{busy ? <LoaderCircle size={17} className="image-studio-spin" /> : <Sparkles size={17} />}{busy ? t('正在生成图片…') : t('开始生成')}</button>
          <p className="image-studio-privacy">{t('调用使用所选密钥扣费。请及时下载生成的图片。')}</p>
        </form>
      </section>
      <section className="image-studio-results" aria-label={t('生成结果')}>
        <div className="image-studio-results-head"><div><h2>{t('生成结果')}</h2><p>{works.length ? t('当前会话的作品') : t('你的作品会显示在这里')}</p></div><div className="image-studio-results-actions"><button className="image-studio-clear" type="button" onClick={() => setHistoryOpen(true)} title={t('生成记录')} aria-label={t('生成记录')}><History size={17} /></button>{works.length > 0 && <button className="image-studio-clear" type="button" onClick={() => setWorks([])} title={t('清空当前作品')} aria-label={t('清空当前作品')}><X size={17} /></button>}</div></div>
        {works.length ? <div className="image-studio-works">{works.map((work) => <article key={work.id} className="image-studio-work"><div className="image-studio-work-head"><strong>{work.model}</strong><time dateTime={new Date(work.createdAt).toISOString()}>{new Date(work.createdAt).toLocaleTimeString()}</time></div><div className="image-studio-art-grid">{work.sources.map((source, index) => <div className="image-studio-art" key={`${work.id}-${index}`}><img src={source} alt={`${work.prompt.slice(0, 80)} (${index + 1})`} /><ImageStudioImageActions source={source} filename={`image-${work.createdAt}-${index + 1}`} onView={() => setPreview({ record: work, source, index })} onToast={onToast} /></div>)}</div><p>{work.prompt}</p></article>)}</div> : <div className="image-studio-empty"><span><ImagePlus size={34} strokeWidth={1.5} /></span><strong>{t('还没有生成的图片')}</strong><p>{t('填写左侧设置，开始你的第一次创作')}</p></div>}
      </section>
    </div>
    {preview && <ImageStudioPreviewDialog {...preview} onClose={() => setPreview(null)} onToast={onToast} />}
    {historyOpen && <ImageStudioHistoryDialog userId={userId} onClose={() => setHistoryOpen(false)} onToast={onToast} />}
  </div>;
}
