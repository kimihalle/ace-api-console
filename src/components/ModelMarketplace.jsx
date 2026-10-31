import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Grid2X2, Layers3, List, Search, SlidersHorizontal, X } from 'lucide-react';
import VendorIcon from './VendorIcon.jsx';
import ModelHealth from './ModelHealth.jsx';
import { useLanguage } from '../lib/use-language.js';
import { newApi } from '../lib/newapi.js';
import { copyText } from '../lib/clipboard.js';
import { formatQuotaDisplay } from '../lib/usage-format.js';
import { configuredGroupRatio, estimatedGroupCredit, filterMarketModels, marketGroupVendors, marketPriceDisplay } from '../lib/model-marketplace.js';
import './model-marketplace.css';

// Names describe API protocols, not invented client groups or model vendors.
const endpointLabels = { openai: 'Chat Completions', 'openai-response': 'Responses', 'openai-response-compact': 'Responses Compact', anthropic: 'Messages', gemini: 'Gemini', embeddings: 'Embeddings', 'image-generation': 'Images', 'jina-rerank': 'Rerank', 'openai-video': 'Video' };

export default function ModelMarketplace({ models, groups, catalog, quota, userGroup, status, loading, error, onToast }) {
  useLanguage();
  const [endpoint, setEndpoint] = useState('');
  const [vendor, setVendor] = useState('');
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const [copied, setCopied] = useState('');
  const [monitor, setMonitor] = useState({ group: '', data: null, loading: true, error: false });
  const routeModels = useMemo(() => filterMarketModels(models, { endpoint, vendor }), [models, endpoint, vendor]);
  const groupOptions = groups;
  const selected = groupOptions.find((item) => item.value === group)
    || groupOptions.find((item) => item.value === userGroup)
    || groupOptions.find((item) => filterMarketModels(models, { group: item.value }).length > 0)
    || groupOptions[0];
  const selectedGroup = selected?.value || '';
  const ratio = configuredGroupRatio(catalog.group_ratio, selectedGroup);
  const ratioTone = Math.max(0, groupOptions.findIndex((item) => item.value === selectedGroup)) % 6;
  const endpoints = useMemo(() => [...new Set(models.flatMap((model) => model.pricing?.supported_endpoint_types || []))], [models]);
  const vendors = useMemo(() => [...new Map(models.map((model) => [model.vendor, { name: model.vendor, icon: model.vendorIcon }])).values()], [models]);
  const routeVendors = useMemo(() => new Map(groups.map((item) => [item.value, marketGroupVendors(models, item.value)])), [models, groups]);
  const selectedModels = selectedGroup ? filterMarketModels(routeModels, { group: selectedGroup }) : [];
  const visible = filterMarketModels(selectedModels, { search });
  const currentMonitor = monitor.group === selectedGroup ? monitor : { data: null, loading: true, error: false };

  useEffect(() => { if (endpoint && !endpoints.includes(endpoint)) setEndpoint(''); }, [endpoint, endpoints]);
  useEffect(() => { if (vendor && !vendors.some((item) => item.name === vendor)) setVendor(''); }, [vendor, vendors]);
  useEffect(() => { if (group && !groupOptions.some((item) => item.value === group)) setGroup(''); }, [group, groupOptions]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(''), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!selectedGroup) return;
    let active = true;
    let inFlight = false;
    setMonitor({ group: selectedGroup, data: null, loading: true, error: false });
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await newApi.channelHealthSummary(`?${new URLSearchParams({ hours: '8', group: selectedGroup })}`);
        if (active) setMonitor({ group: selectedGroup, data, loading: false, error: false });
      } catch {
        if (active) setMonitor({ group: selectedGroup, data: null, loading: false, error: true });
      } finally { inFlight = false; }
    };
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [selectedGroup]);

  const copyModel = async (name) => {
    try {
      await copyText(name);
      setCopied(name);
      onToast(t("模型名称已复制"));
    } catch { onToast(t("复制失败，请手动复制模型名称")); }
  };
  const clearFilters = () => { setSearch(''); setVendor(''); setEndpoint(''); setGroup(''); };

  return <section className="model-marketplace" aria-label={t("模型目录")} aria-busy={loading}>
    <div className="mp-filters">
      <div className="mp-filter-row"><span className="mp-filter-label">{t("API 类型")}</span><div className="mp-filter-options">
        <button className={`mp-filter-chip ${!endpoint ? 'selected' : ''}`} aria-pressed={!endpoint} onClick={() => setEndpoint('')}>{t("全部")}<span>{models.length}</span></button>
        {endpoints.map((value) => <button key={value} className={`mp-filter-chip ${endpoint === value ? 'selected' : ''}`} aria-pressed={endpoint === value} onClick={() => setEndpoint(value)} title={catalog.supported_endpoint?.[value]?.path || value}>{endpointLabels[value] || value}<span>{filterMarketModels(models, { endpoint: value }).length}</span></button>)}
      </div></div>
      <div className="mp-filter-row"><span className="mp-filter-label">{t("厂商")}</span><div className="mp-filter-options mp-vendor-options">
        <button className={`mp-vendor-chip ${!vendor ? 'selected' : ''}`} aria-pressed={!vendor} onClick={() => setVendor('')}>{t("全部")}<span>{filterMarketModels(models, { endpoint }).length}</span></button>
        {vendors.map((item) => <button key={item.name} className={`mp-vendor-chip ${vendor === item.name ? 'selected' : ''}`} aria-pressed={vendor === item.name} onClick={() => setVendor(item.name)}><span className="mp-inline-brand"><VendorIcon name={item.icon} fallback={item.name.slice(0, 1)} size={16} /></span>{item.name}<span>{filterMarketModels(models, { endpoint, vendor: item.name }).length}</span></button>)}
      </div></div>
    </div>

    {loading ? <div className="mp-empty" role="status">{t("正在加载模型目录…")}</div> : error ? <div className="mp-empty" role="alert"><SlidersHorizontal size={25} /><strong>{t("模型目录暂时无法加载")}</strong><span>{t("请稍后刷新重试")}</span></div> : !groupOptions.length ? <div className="mp-empty"><SlidersHorizontal size={25} /><strong>{t("暂无可用分组")}</strong></div> : <div className="mp-layout">
      <aside className="mp-routes" aria-label={t("线路分组")}><div className="mp-routes-heading"><h2>{t("线路分组")}</h2><span>{groupOptions.length}</span></div><div className="mp-route-list">
        {groupOptions.map((item, index) => {
          const count = filterMarketModels(routeModels, { group: item.value }).length;
          const groupRatio = configuredGroupRatio(catalog.group_ratio, item.value);
          const brands = routeVendors.get(item.value) || [];
          const brandLabel = brands.length ? t("厂商：{v0}", { v0: brands.map((brand) => brand.name).join('、') }) : t("暂无可用模型");
          return <button key={item.value} className={`mp-route ${selectedGroup === item.value ? 'selected' : ''}`} aria-pressed={selectedGroup === item.value} onClick={() => setGroup(item.value)}>
            <span className="mp-route-name"><span className="mp-route-brands" role="img" aria-label={brandLabel} title={brandLabel}>{brands.length ? brands.slice(0, 3).map((brand) => <span key={`${brand.name}-${brand.icon}`} className="mp-route-brand" aria-hidden="true"><VendorIcon name={brand.icon} fallback={brand.name.slice(0, 1)} size={15} /></span>) : <span className="mp-route-brand" aria-hidden="true"><Layers3 size={15} /></span>}</span><strong title={item.label}>{item.label}</strong>{groupRatio !== null && <span className={`mp-ratio mp-ratio-tone-${index % 6}`} aria-label={t('倍率 {value}', { value: groupRatio })}>×{groupRatio}</span>}</span>
            <span className="mp-route-meta"><span>{t("{count} 个模型", { count })}</span>{selectedGroup === item.value && <Check size={13} />}</span>
          </button>;
        })}
      </div></aside>

      <div className="mp-catalog">
        <header className="mp-route-detail"><div className="mp-detail-title"><h2>{selected.label}</h2>{ratio !== null && <span className={`mp-ratio mp-ratio-tone-${ratioTone}`} aria-label={t('倍率 {value}', { value: ratio })}>×{ratio}</span>}<span className="mp-detail-count">{t("{count} 个模型", { count: filterMarketModels(models, { group: selectedGroup }).length })}</span></div>
          <div className="mp-credit"><span>{t("预计可用额度")}</span><strong>{estimatedGroupCredit(quota, ratio, status)}</strong><span className="mp-credit-balance">{t("余额 ")}{formatQuotaDisplay(quota, status)}{ratio !== null && ratio > 0 ? t(" / {v0} 倍率", { v0: ratio }) : ''}</span></div>
          <ModelHealth model={selected.label} metric={currentMonitor.data?.summary ? { ...currentMonitor.data.summary, recent_success_series: currentMonitor.data.success_series || [] } : null} scope={t("当前线路分组")} metrics={currentMonitor.data} loading={currentMonitor.loading} error={currentMonitor.error} />
        </header>
        <div className="mp-toolbar"><label className="mp-search"><Search size={15} /><input aria-label={t("搜索模型")} placeholder={t("搜索模型")} value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label={t("清除搜索")} onClick={() => setSearch('')}><X size={13} /></button>}</label><span className="mp-model-count">{t("{count} 个模型", { count: visible.length })}</span><div className="mp-view-toggle" role="group" aria-label={t("模型展示方式")}><button className={view === 'grid' ? 'selected' : ''} aria-label={t("网格视图")} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={15} /></button><button className={view === 'list' ? 'selected' : ''} aria-label={t("列表视图")} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div></div>
        <div className={`mp-models ${view === 'list' ? 'is-list' : ''}`}>
          {visible.map((model) => {
            const pricing = marketPriceDisplay(model, selectedGroup, status);
            return <article className="mp-model" key={model.name}><div className="mp-model-heading"><span className="mp-model-brand"><VendorIcon name={model.vendorIcon} fallback={model.vendor.slice(0, 1)} size={20} /></span><div className="mp-model-identity"><h3 title={model.name}>{model.name}</h3><span>{model.vendor}</span></div><button className="mp-copy" aria-label={t("复制模型名称 {v0}", { v0: model.name })} title={t("复制模型名称")} onClick={() => copyModel(model.name)}>{copied === model.name ? <Check size={13} /> : <Copy size={13} />}</button></div>
              <div className="mp-model-pricing">{pricing.mode ? <div className="mp-dynamic-price">{t(pricing.mode)}</div> : <dl>{pricing.items.map(([label, price]) => <div key={label}><dt>{t(label)}</dt><dd>{price}</dd></div>)}</dl>}<span className="mp-price-unit">{t(pricing.unit)}</span></div>
            </article>;
          })}
        </div>
        {!visible.length && <div className="mp-empty"><Search size={24} /><strong>{search || vendor || endpoint ? t("没有匹配的模型") : t("此分组暂无可用模型")}</strong>{(search || vendor || endpoint) && <button className="mp-reset" onClick={clearFilters}>{t("清除筛选")}</button>}</div>}
      </div>
    </div>}
  </section>;
}
