import { lazy, Suspense, useMemo } from 'react';

const iconModules = import.meta.glob('../../node_modules/@lobehub/icons/es/{OpenAI,Claude,Gemini,Moonshot,Zhipu,Qwen,DeepSeek,Minimax,Wenxin,Spark,Hunyuan,Cohere,Cloudflare,Ai360,Yi,Jina,Mistral,XAI,Ollama,Doubao,Kling,Jimeng,Vidu,AzureAI}/components/{Mono,Color}.js');
const iconCache = new Map();

function resolveIcon(name) {
  const [brand, requestedVariant] = String(name || '').trim().split('.');
  if (!brand) return null;
  const variant = requestedVariant === 'Color' ? 'Color' : 'Mono';
  const path = `../../node_modules/@lobehub/icons/es/${brand}/components/${variant}.js`;
  const fallbackPath = `../../node_modules/@lobehub/icons/es/${brand}/components/Mono.js`;
  const loader = iconModules[path] || iconModules[fallbackPath];
  if (!loader) return null;
  const cacheKey = iconModules[path] ? path : fallbackPath;
  if (!iconCache.has(cacheKey)) iconCache.set(cacheKey, lazy(loader));
  return iconCache.get(cacheKey);
}

export default function VendorIcon({ name, fallback, size = 30 }) {
  const url = typeof name === 'string' && /^https?:\/\//i.test(name) ? name : '';
  const Icon = useMemo(() => resolveIcon(url ? '' : name), [name, url]);
  if (url) return <img className="vendor-brand-image" src={url} alt="" width={size} height={size} loading="lazy" />;
  if (!Icon) return <span aria-hidden="true">{fallback || '?'}</span>;
  return <Suspense fallback={<span aria-hidden="true">{fallback || '?'}</span>}><Icon size={size} /></Suspense>;
}
