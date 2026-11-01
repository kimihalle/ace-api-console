import { t, getLocale, formatDuration } from './lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Bell, Check, CheckCircle2, CircleHelp, Clock3, Copy, CreditCard, Eye, EyeOff,
  Download, FileText, Gauge, Gift, KeyRound, LayoutDashboard, LockKeyhole, Megaphone,
  LogOut, Menu, Plus, Receipt, Search, Settings2, ShieldCheck, Sparkles, Ticket, Trash2, Users,
  WalletCards, X, Zap,
} from 'lucide-react';
import { apiBaseLabel, clearAccessToken, login, logout, newApi, newApiConsoleUrl, register, restoreSession } from './lib/newapi.js';
import { PublicHome } from './components/PublicPages.jsx';
import AuthPage from './components/AuthPage.jsx';
import OAuthCallback from './components/OAuthCallback.jsx';
import { AccountAvatar, SiteBrand } from './components/Identity.jsx';
import ModelSelect from './components/ModelSelect.jsx';
import ModelMarketplace from './components/ModelMarketplace.jsx';
import PelicanSamples from './components/PelicanSamples.jsx';
import ApiEndpoint from './components/ApiEndpoint.jsx';
import { formatQuotaDisplay, formatLoggedAmount, readLogOther, logUsage, usageLogQuery, usageColumns, usageCsvRow, csvLine } from './lib/usage-format.js';
import { availableMarketGroups, marketGroupVendors } from './lib/model-marketplace.js';
import { consolePage, consolePath, consoleReturnPath, isConsolePath } from './lib/routes.js';
import { useLanguage } from './lib/use-language.js';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import AnnouncementDialog, { AnnouncementContent } from './components/Announcements.jsx';
import { useAnnouncements } from './lib/use-announcements.js';
import { tokenRows, fullTokenKey } from './lib/tokens.js';
import { copyText } from './lib/clipboard.js';
import KeyDialog from './components/KeyDialog.jsx';
import Dialog from './components/Dialog.jsx';
import ReferralCard from './components/ReferralCard.jsx';
import CCSwitchDialog from './components/CCSwitchDialog.jsx';
import UsageTrend from './components/UsageTrend.jsx';
import UsageFilters from './components/UsageFilters.jsx';
import PurchaseStore from './components/PurchaseStore.jsx';
import { usageFilterQuery } from './lib/usage-filters.js';
import { applySiteBranding, cacheSiteBranding, readCachedBranding } from './lib/site-branding.js';
import VendorIcon from './components/VendorIcon.jsx';

const navItems = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'redeem', label: '兑换订阅', icon: Ticket },
  { id: 'usage', label: '使用统计', icon: Activity },
  { id: 'bills', label: '账单明细', icon: Receipt },
  { id: 'keys', label: 'API 密钥', icon: KeyRound },
  { id: 'models', label: '模型广场', icon: Sparkles },
  { id: 'pelican', label: '鹈鹕测智', icon: Activity },
  { id: 'plans', label: '购买订阅', icon: CreditCard },
];

const asList = (value) => Array.isArray(value) ? value : value?.items || value?.list || value?.data || [];

function timeRangeQuery(range) {
  const durations = { '24h': 24 * 60 * 60, '7d': 7 * 24 * 60 * 60, '30d': 30 * 24 * 60 * 60 };
  const end = Math.floor(Date.now() / 1000);
  const start = end - (durations[range] || durations['24h']);
  return new URLSearchParams({ start_timestamp: String(start), end_timestamp: String(end) }).toString();
}

function formatTokenAccessTime(value) {
  const timestamp = Number(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toLocaleString(getLocale()) : t('从未使用');
}

function timestampToLocalInput(value) {
  const timestamp = Number(value);
  if (timestamp <= 0) return '';
  const date = new Date(timestamp * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function tokenStatusLabel(value) {
  return ({ 1: '启用中', 2: '已停用', 3: '已过期', 4: '额度耗尽' })[Number(value)] || '未知状态';
}

function normalizeModelCatalog(modelData, pricing) {
  const pricingRows = Array.isArray(pricing?.data) ? pricing.data : [];
  const vendorMap = new Map((pricing?.vendors || []).map((item) => [Number(item.id), item]));
  const pricingByName = new Map(pricingRows.map((item) => [item.model_name, item]));
  const userModelMap = new Map(asList(modelData).map((model) => [typeof model === 'string' ? model : model.id || model.name || model.model_name, model]));
  const catalogModels = Array.isArray(pricing?.data) ? pricingRows.map((price) => userModelMap.get(price.model_name) || price.model_name) : asList(modelData);
  return catalogModels.map((model) => {
    const name = typeof model === 'string' ? model : model.id || model.name || model.model_name;
    const modelDetail = typeof model === 'string' ? '' : model.description;
    const price = pricingByName.get(name);
    const groups = Array.isArray(price?.enable_groups) ? price.enable_groups : [];
    const vendorInfo = price ? vendorMap.get(Number(price.vendor_id)) : null;
    return {
      name,
      vendor: vendorInfo?.name || model.provider || model.vendor || 'OpenAI-compatible',
      vendorIcon: vendorInfo?.icon || price?.icon || '',
      detail: price?.description || modelDetail || '可通过 OpenAI 兼容接口调用',
      groups,
      pricing: price,
      groupRatios: pricing?.group_ratio || {},
      tag: groups.map((group) => {
        const info = pricing?.usable_group?.[group];
        return typeof info === 'string' ? info : info?.desc || group;
      }).join(' · '),
    };
  }).filter((model) => model.name);
}

function getPlanPaymentOptions(plan, paymentInfo) {
  const options = [];
  if (plan?.allow_balance_pay !== false) options.push({ value: 'balance', label: t("账户余额"), description: t("直接从账户余额扣款") });
  if (paymentInfo?.enable_online_topup) {
    (paymentInfo.pay_methods || []).filter((method) => !['stripe', 'creem', 'waffo', 'waffo_pancake'].includes(method.type)).forEach((method) => {
      options.push({ value: `epay:${method.type}`, label: method.name || method.type, description: t("在线支付") });
    });
  }
  if (paymentInfo?.enable_stripe_topup && plan?.stripe_price_id) options.push({ value: 'stripe', label: 'Stripe', description: t("银行卡及国际支付") });
  if (paymentInfo?.enable_creem_topup && plan?.creem_product_id) options.push({ value: 'creem', label: 'Creem', description: t("国际在线支付") });
  if (paymentInfo?.enable_waffo_pancake_topup && plan?.waffo_pancake_product_id) options.push({ value: 'pancake', label: 'Waffo Pancake', description: t("安全托管结账") });
  return options;
}

function App() {
  const { language } = useLanguage();
  const [route, setRoute] = useState(window.location.pathname);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isConsolePath(window.location.pathname));
  const inConsole = isConsolePath(route);
  const page = consolePage(route);
  const [keys, setKeys] = useState([]);
  const [keyPage, setKeyPage] = useState(1);
  const [keyTotal, setKeyTotal] = useState(0);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyRevision, setKeyRevision] = useState(0);
  const [keyError, setKeyError] = useState('');
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [keyName, setKeyName] = useState('');
  const [keyLimit, setKeyLimit] = useState('');
  const [keyExpiry, setKeyExpiry] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState('');
  const [referralRevision, setReferralRevision] = useState(0);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralTransferError, setReferralTransferError] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [keySearch, setKeySearch] = useState('');
  const [redeem, setRedeem] = useState('');
  const [backendError, setBackendError] = useState('');
  const [userModels, setUserModels] = useState([]);
  const [plans, setPlans] = useState([]);
  const [userSummary, setUserSummary] = useState(null);
  const [usageRows, setUsageRows] = useState([]);
  const [usageRange, setUsageRange] = useState('24h');
  const [usageFilters, setUsageFilters] = useState({ model: '', group: '', status: 'all', startDate: '', endDate: '' });
  const [usagePage, setUsagePage] = useState(1);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);
  const [billRows, setBillRows] = useState([]);
  const [billPage, setBillPage] = useState(1);
  const [billTotal, setBillTotal] = useState(0);
  const [billLoading, setBillLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [topUpInfo, setTopUpInfo] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [siteStatus, setSiteStatus] = useState(null);
  const [cachedBranding] = useState(readCachedBranding);
  const siteBranding = siteStatus || cachedBranding;
  useEffect(() => { applySiteBranding(siteBranding, route); }, [siteBranding, route, language]);
  const [siteNotice, setSiteNotice] = useState('');
  const [pricingCatalog, setPricingCatalog] = useState({ vendors: [], usable_group: {}, group_ratio: {}, supported_endpoint: {} });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [pelicanMenuEnabled, setPelicanMenuEnabled] = useState(true);
  const [keyGroup, setKeyGroup] = useState('');
  const workspaceNavRef = useRef(null);
  const groups = useMemo(() => availableMarketGroups(pricingCatalog.usable_group, pricingCatalog.group_ratio, pricingCatalog.group_display_order), [pricingCatalog, language]);
  const keyGroupOptions = useMemo(() => groups.map(({ value, label }) => {
    const brands = marketGroupVendors(userModels, value).slice(0, 3);
    return {
      value,
      label,
      icon: <span className="key-group-icons" role="img" aria-label={brands.map((brand) => brand.name).join('、') || t('暂无可用模型')}>
        {brands.length ? brands.map((brand) => <span className="key-group-icon" key={`${brand.name}-${brand.icon}`} aria-hidden="true"><VendorIcon name={brand.icon} fallback={brand.name.slice(0, 1)} size={18} /></span>) : <span className="key-group-icon is-empty" aria-hidden="true"><Activity size={16} /></span>}
      </span>,
    };
  }), [groups, userModels, language]);
  const announcements = useAnnouncements({ userId: inConsole && !authLoading ? authUser?.id : null, status: siteStatus, notice: siteNotice, blocked: Boolean(modal) || page === 'plans' });

  useEffect(() => {
    if (!groups.length) return;
    if (!groups.some((item) => item.value === keyGroup)) setKeyGroup(groups[0].value);
  }, [groups, keyGroup]);

  const go = (path) => {
    const [pathname, searchParams = ''] = path.split('?');
    const nextPath = `${pathname}${searchParams ? `?${searchParams}` : ''}`;
    if (isConsolePath(pathname) && !inConsole) setAuthLoading(true);
    window.history.pushState({}, '', nextPath);
    setRoute(pathname);
  };

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let refreshAgain = false;
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        await Promise.allSettled([
          newApi.publicStatus().then((status) => {
            if (!active) return;
            cacheSiteBranding(status);
            setSiteStatus(status);
          }),
          newApi.notice().then((notice) => { if (active) setSiteNotice(typeof notice === 'string' ? notice : ''); }),
        ]);
      } finally {
        inFlight = false;
        if (refreshAgain && active && !document.hidden) {
          refreshAgain = false;
          refresh();
        }
      }
    };
    const refreshBranding = (event) => {
      if (event instanceof StorageEvent && event.key !== 'ace-branding-updated') return;
      refresh();
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refreshBranding);
    window.addEventListener('ace-branding-updated', refreshBranding);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refreshBranding); window.removeEventListener('ace-branding-updated', refreshBranding); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  useEffect(() => {
    if (!inConsole || !authUser?.id || authLoading) return;
    let active = true;
    newApi.topUpInfo().then((info) => { if (active) setTopUpInfo(info); }).catch(() => {});
    return () => { active = false; };
  }, [inConsole, authUser?.id, authLoading]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      if (isConsolePath(path) && !inConsole) setAuthLoading(true);
      setRoute(path);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [inConsole]);

  useEffect(() => {
    if (!inConsole) return;
    let active = true;
    setAuthLoading(true);
    restoreSession({ force: true }).then((user) => {
      if (!active) return;
      if (!user) { setAuthUser(null); go(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); }
      else setAuthUser(user);
    }).catch(() => { if (active) { setAuthUser(null); go(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); } }).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [inConsole]);

  useEffect(() => {
    if (!inConsole || !authUser) return;
    let active = true;
    let inFlight = false;
    setCatalogLoading(true);
    const refreshCatalog = async () => {
      if (!active) return;
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        const [modelResult, pricingResult] = await Promise.allSettled([newApi.userModels(), newApi.pricing()]);
        if (!active) return;
        const modelData = modelResult.status === 'fulfilled' ? modelResult.value : [];
        const pricing = pricingResult.status === 'fulfilled' && pricingResult.value?.success !== false ? pricingResult.value : null;
        setUserModels(normalizeModelCatalog(modelData, pricing));
        setPricingCatalog({ vendors: pricing?.vendors || [], usable_group: pricing?.usable_group || {}, group_ratio: pricing?.group_ratio || {}, group_display_order: pricing?.group_display_order || [], supported_endpoint: pricing?.supported_endpoint || {} });
        setCatalogError(!pricing);
        setCatalogLoading(false);
      } finally {
        inFlight = false;
        if (refreshAgain && active) {
          refreshAgain = false;
          refreshCatalog();
        }
      }
    };
    const refreshVisible = () => { if (!document.hidden) refreshCatalog(); };
    const onPricingUpdated = (event) => { if (!event.key || event.key === 'ace-pricing-updated') refreshVisible(); };
    refreshCatalog();
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('storage', onPricingUpdated);
    window.addEventListener('ace-pricing-updated', onPricingUpdated);
    const timer = page === 'models' ? window.setInterval(refreshVisible, 60000) : null;
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('storage', onPricingUpdated);
      window.removeEventListener('ace-pricing-updated', onPricingUpdated);
    };
  }, [route, authUser?.id, authUser?.group, page === 'models']);

  useEffect(() => {
    if (!inConsole || !authUser || authLoading) return;
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await newApi.pelicanCatalog();
        if (active) setPelicanMenuEnabled(data?.public_enabled !== false);
      } catch {
        // Preserve the current navigation state while the endpoint is unavailable.
      } finally {
        inFlight = false;
      }
    };
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [inConsole, authUser?.id, authLoading]);

  useEffect(() => {
    if (inConsole && page === 'pelican' && !pelicanMenuEnabled) {
      const dashboardPath = consolePath('dashboard');
      window.history.replaceState({}, '', dashboardPath);
      setRoute(dashboardPath);
      setWorkspaceMenuOpen(false);
    }
  }, [inConsole, page, pelicanMenuEnabled]);

  useEffect(() => {
    if (route === '/admin') window.location.replace(newApiConsoleUrl());
  }, [route]);

  useEffect(() => {
    if (!inConsole) return;
    const revealCurrentPage = () => {
      const nav = workspaceNavRef.current;
      const selected = nav?.querySelector('[aria-current="page"]');
      if (!selected || nav.scrollWidth <= nav.clientWidth) return;
      const left = selected.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      nav.scrollTo({ left: left - (nav.clientWidth - selected.clientWidth) / 2 });
    };
    revealCurrentPage();
    window.addEventListener('resize', revealCurrentPage);
    return () => window.removeEventListener('resize', revealCurrentPage);
  }, [route, page, authUser?.id, workspaceMenuOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOutside = (event) => { if (!event.target.closest('.workspace-header')) setWorkspaceMenuOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setWorkspaceMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event) => { if (!event.target.closest('.profile-menu-wrap')) setProfileOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [profileOpen]);

  useEffect(() => {
    if (!inConsole || !authUser) return;
    let active = true;
    setBackendError('');
    const load = async () => {
      try {
        if (page === 'dashboard') {
          setReferralLoading(true);
          setReferralError('');
          const [self, usage, subscription, affiliate] = await Promise.allSettled([newApi.currentUser(), newApi.usageStats(`?${timeRangeQuery('7d')}`), newApi.currentSubscription(), newApi.affiliateCode()]);
          if (!active) return;
          if (self.status === 'fulfilled') setAuthUser(self.value);
          setUserSummary({ usage: usage.status === 'fulfilled' ? usage.value : null, subscription: subscription.status === 'fulfilled' ? subscription.value : null });
          const code = affiliate.status === 'fulfilled' && typeof affiliate.value === 'string' ? affiliate.value : '';
          setReferralCode(code);
          if (!code) setReferralError(affiliate.reason?.message || t('邀请链接暂时不可用'));
        } else if (page === 'redeem') {
          const info = await newApi.topUpInfo();
          if (active) setTopUpInfo(info);
        } else if (page === 'keys') {
          setKeyLoading(true);
          setKeys([]);
          const result = keySearch
            ? await newApi.searchTokens(keySearch, keyPage, 20)
            : await newApi.tokens(`?p=${keyPage}&size=20`);
          const data = asList(result);
          if (active) {
            const rows = tokenRows(data);
            setKeys(rows.map((key) => ({ ...key, status: tokenStatusLabel(key.raw.status) })));
            setKeyTotal(Number(result?.total ?? result?.count ?? data.length));
            if (rows.length) {
              const secrets = await newApi.tokenKeys(rows.map((key) => key.id));
              if (active) setKeys(tokenRows(data, secrets?.keys).map((key) => ({ ...key, status: tokenStatusLabel(key.raw.status) })));
            }
          }
        } else if (page === 'usage') {
          setUsageLoading(true);
          setUsageRows([]);
          setUsageTotal(0);
          setUserSummary((current) => ({ ...current, usage: null }));
          const rangeQuery = usageFilterQuery(usageRange, usageFilters).toString();
          const pageParams = usageLogQuery(rangeQuery);
          pageParams.set('p', String(usagePage));
          pageParams.set('size', '20');
          const pageQuery = pageParams.toString();
          const [stats, logs] = await Promise.all([newApi.usageStats(`?${rangeQuery}`), newApi.usageLogs(`?${pageQuery}`)]);
          if (active) {
            setUserSummary((current) => ({ ...current, usage: stats }));
            setUsageRows(asList(logs));
            setUsageTotal(Number(logs?.total || 0));
          }
        } else if (page === 'bills') {
          setBillLoading(true);
          setBillRows([]);
          setBillTotal(0);
          const params = new URLSearchParams({ type: '1', p: String(billPage), size: '20' });
          const logs = await newApi.usageLogs(`?${params.toString()}`);
          if (active) {
            setBillRows(asList(logs));
            setBillTotal(Number(logs?.total || 0));
          }
        }
      } catch (error) { if (active) setBackendError(error.message || t("服务请求失败")); }
      finally {
        if (active && page === 'usage') setUsageLoading(false);
        if (active && page === 'keys') setKeyLoading(false);
        if (active && page === 'bills') setBillLoading(false);
        if (active && page === 'dashboard') setReferralLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [route, page, authUser?.id, usageRange, usageFilters, usagePage, keySearch, keyPage, billPage, keyRevision, referralRevision]);

  const signOut = async () => {
    try { await logout(); } catch { clearAccessToken(); }
    setAuthUser(null);
    setKeys([]);
    setCreatedKey('');
    setReferralCode('');
    setModal('');
    go('/');
  };

  if (route === '/') return <PublicHome onNavigate={go} status={siteStatus} branding={siteBranding} />;
  if (/^\/oauth\/[a-zA-Z0-9_-]+\/?$/.test(route)) return <OAuthCallback key={route} branding={siteBranding} provider={route.split('/')[2]} onNavigate={go} onAuthenticated={(user, destination) => { setAuthUser(user); go(destination); }} />;
  if (['/login', '/register', '/forgot-password', '/user/reset', '/reset'].includes(route)) return <AuthPage key={route} branding={siteBranding} mode={route === '/user/reset' || route === '/reset' ? 'reset' : route.slice(1)} onNavigate={go} onAuthenticated={(user) => { setAuthUser(user); go(consoleReturnPath(window.location.search)); }} />;
  if (route === '/admin') return <RouteLoading />;
  if (inConsole && (authLoading || !authUser)) return <RouteLoading />;
  if (!inConsole || !authUser) return <PublicHome onNavigate={go} />;
  if (!consolePage(route)) return <div className="route-loading"><LanguageSwitcher /><h1>{t('页面不存在')}</h1><button className="button primary" onClick={() => go(consolePath('dashboard'))}>{t('返回仪表盘')}</button></div>;

  const visibleNavItems = pelicanMenuEnabled ? navItems : navItems.filter((item) => item.id !== 'pelican');
  const current = visibleNavItems.find((item) => item.id === page) ?? visibleNavItems[0];

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const createKey = async (event) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) return;
    if (!keyGroup) return setKeyError(t("当前账户没有可用于创建密钥的分组"));
    if (keyExpiry && Date.parse(keyExpiry) <= Date.now()) return setKeyError(t("密钥到期时间必须晚于当前时间"));
    try {
      setKeyError('');
      setBackendError('');
      setKeySaving(true);
      const unlimitedQuota = keyLimit === '';
      const remainQuota = unlimitedQuota ? 0 : Number(keyLimit);
      const result = await newApi.createToken({ name, group: keyGroup, remain_quota: remainQuota, expired_time: keyExpiry ? Math.floor(Date.parse(keyExpiry) / 1000) : -1, unlimited_quota: unlimitedQuota, model_limits_enabled: false, model_limits: '' });
      const token = result?.token || result;
      const secret = fullTokenKey(token?.key);
      setCreatedKey(secret);
      // Always reload the authoritative page; never insert a row without a server id.
      setKeyRevision((value) => value + 1);
      setKeyPage(1);
      setKeySearch('');
      setKeyName('');
      setKeyLimit('');
      setKeyExpiry('');
      setKeyGroup(groups[0]?.value || '');
      setModal(secret ? 'new-key-created' : '');
      if (!secret) notify(t('密钥已创建，可在列表中查看和复制'));
    } catch (error) { setKeyError(error.message || t("创建密钥失败")); }
    finally { setKeySaving(false); }
  };

  const openKeyConfig = (key) => {
    setKeyError('');
    const raw = key.raw || {};
    setEditingKey(raw);
    setKeyName(key.name);
    setKeyGroup(groups.some((item) => item.value === raw.group) ? raw.group : (groups[0]?.value || ''));
    setKeyLimit(raw.unlimited_quota ? '' : String(raw.remain_quota ?? 0));
    setKeyExpiry(timestampToLocalInput(raw.expired_time));
    setModal('edit-key');
  };

  const updateKey = async (event) => {
    event.preventDefault();
    if (!editingKey?.id || !keyName.trim()) return;
    if (!keyGroup) return setKeyError(t("请选择可用分组"));
    if (keyExpiry && Date.parse(keyExpiry) <= Date.now()) return setKeyError(t("密钥到期时间必须晚于当前时间"));
    try {
      setKeyError('');
      setKeySaving(true);
      const unlimitedQuota = keyLimit === '';
      const payload = {
        id: editingKey.id,
        name: keyName.trim(),
        group: keyGroup,
        remain_quota: unlimitedQuota ? 0 : Number(keyLimit),
        unlimited_quota: unlimitedQuota,
        expired_time: keyExpiry ? Math.floor(Date.parse(keyExpiry) / 1000) : -1,
        model_limits_enabled: Boolean(editingKey.model_limits_enabled),
        model_limits: editingKey.model_limits || '',
        allow_ips: editingKey.allow_ips || '',
        allow_user_quota_query: Boolean(editingKey.allow_user_quota_query),
        auto_groups: editingKey.auto_groups || [],
        cross_group_retry: Boolean(editingKey.cross_group_retry),
      };
      await newApi.updateToken(payload);
      setKeys((items) => items.map((key) => String(key.id) === String(editingKey.id) ? {
        ...key,
        name: payload.name,
        group: payload.group,
        raw: { ...key.raw, ...payload },
      } : key));
      setModal('');
      setEditingKey(null);
      notify(t("密钥配置已更新"));
    } catch (error) { setKeyError(error.message || t("更新密钥配置失败")); }
    finally { setKeySaving(false); }
  };

  const revealKey = async (id) => {
    try {
      const result = await newApi.tokenKey(id);
      const secret = fullTokenKey(result?.key);
      if (!secret) throw new Error(t('密钥读取失败，请重试'));
      setKeys((items) => items.map((key) => key.id === id ? { ...key, secret } : key));
    } catch (error) { setBackendError(error.message || t("读取密钥失败")); }
  };

  const copyKey = async (id) => {
    try {
      let secret = keys.find((key) => key.id === id)?.secret;
      if (!secret) {
        const result = await newApi.tokenKey(id);
        secret = fullTokenKey(result?.key);
        if (!secret) throw new Error(t('密钥读取失败，请重试'));
        setKeys((items) => items.map((key) => key.id === id ? { ...key, secret } : key));
      }
      await copyText(secret);
      notify(t("密钥已复制"));
    } catch (error) { setBackendError(error.message || t("复制密钥失败")); }
  };

  const toggleKey = async (id) => {
    const key = keys.find((item) => String(item.id) === String(id));
    if (!key) return;
    const currentStatus = Number(key.raw?.status);
    if (![1, 2, 3, 4].includes(currentStatus)) return notify(t("当前密钥状态不支持此操作"));
    if (currentStatus !== 1) {
      const expires = Number(key.raw?.expired_time);
      if (expires > 0 && expires <= Math.floor(Date.now() / 1000)) return notify(t("请先更新密钥到期时间，再启用"));
      if (!key.raw?.unlimited_quota && Number(key.raw?.remain_quota) <= 0) return notify(t("请先增加密钥额度，再启用"));
    }
    const status = currentStatus === 1 ? 2 : 1;
    try {
      await newApi.setTokenStatus(id, status);
      setKeys((items) => items.map((item) => String(item.id) === String(id) ? { ...item, status: tokenStatusLabel(status), raw: { ...item.raw, status } } : item));
    }
    catch (error) { setBackendError(error.message || t("更新密钥状态失败")); }
  };

  const removeKey = async (id) => {
    try {
      await newApi.deleteToken(id);
      setKeys((items) => items.filter((key) => String(key.id) !== String(id)));
      if (keys.length === 1 && keyPage > 1) setKeyPage((currentPage) => currentPage - 1);
      setKeyTotal((total) => Math.max(0, total - 1));
      notify(t("密钥已删除"));
    }
    catch (error) { setBackendError(error.message || t("删除密钥失败")); }
  };

  const exportUsage = async () => {
    try {
      setExportBusy(true);
      const responseText = await newApi.exportUsageLogs(`?${usageLogQuery(usageFilterQuery(usageRange, usageFilters))}`);
      if (responseText && typeof responseText === 'object' && responseText.success === false) throw new Error(responseText.message || t("日志导出失败"));
      const lines = String(responseText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const records = lines.map((line) => JSON.parse(line));
      const result = records.at(-1);
      if (!result || !Object.hasOwn(result, 'success')) throw new Error(t("导出未完成，请重试"));
      records.pop();
      if (!result.success) throw new Error(result.message || t("日志导出失败"));
      if (!records.length) return notify(t("当前周期没有可导出的调用记录"));
      const blob = new Blob(['\uFEFF', [csvLine(usageColumns.map((column) => t(column))), ...records.map((record) => csvLine(usageCsvRow(record, siteStatus)))].join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `usage-logs-${usageRange}-${new Date().toLocaleDateString('sv-SE')}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      notify(t("已导出 {v0} 条调用记录", { v0: records.length }));
    } catch (error) { setBackendError(error.message || t("日志导出失败")); }
    finally { setExportBusy(false); }
  };

  const navigate = (id) => {
    setProfileOpen(false);
    setWorkspaceMenuOpen(false);
    go(consolePath(id));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  const isAdmin = Number(authUser?.role) >= 10 || authUser?.role === 'admin' || authUser?.is_admin === true;
  const username = authUser?.username || authUser?.display_name || t("用户");
  const summaryValue = (value) => value == null ? '—' : Number(value).toLocaleString(getLocale());
  const purchasePaymentOptions = selectedPlan ? getPlanPaymentOptions(selectedPlan, topUpInfo) : [];
  const copyReferral = async (link) => {
    try { await copyText(link); notify(t('邀请链接已复制')); }
    catch (error) { setReferralError(error.message); }
  };
  const transferReferral = async () => {
    if (referralBusy) return;
    setReferralTransferError('');
    const quota = Number(authUser?.aff_quota);
    if (!Number.isSafeInteger(quota) || quota <= 0) return setReferralTransferError(t('没有可转入的奖励额度'));
    try {
      setReferralBusy(true);
      await newApi.transferAffiliate(quota);
      setModal('');
      const self = await newApi.currentUser().catch(() => null);
      if (self) setAuthUser(self);
      setReferralRevision((value) => value + 1);
      notify(t('奖励已转入账户余额'));
    } catch (error) {
      const minimum = error.message?.match(/^Minimum transfer quota is (.*)!$/);
      setReferralTransferError(minimum ? t('最低转入额度为 {amount}', { amount: minimum[1] }) : error.message || t('奖励转入失败，请重试'));
    }
    finally { setReferralBusy(false); }
  };
  const redeemCode = async () => {
    if (!redeem.trim()) return notify(t("请输入兑换码"));
    if (topUpInfo?.enable_redemption === false) return notify(t("当前实例未启用兑换功能"));
    try { await newApi.redeem(redeem.trim()); setRedeem(''); notify(t("兑换已完成")); go(consolePath('dashboard')); }
    catch (error) {
      const message = error.message === 'Redemption failed, please try again later'
        ? t("兑换失败，请稍后重试或联系管理员核验。")
        : error.message || t("兑换失败");
      setBackendError(message);
    }
  };
  const buyPlan = (planId) => {
    const plan = plans.map((item) => item.plan || item).find((item) => String(item.id) === String(planId));
    if (!plan) return setBackendError(t("套餐信息已失效，请刷新页面"));
    const options = getPlanPaymentOptions(plan, topUpInfo);
    setSelectedPlan(plan);
    setPaymentMethod(options[0]?.value || '');
    setModal('purchase-plan');
  };

  const submitPlanPayment = async () => {
    if (!selectedPlan || !paymentMethod) return notify(t("当前套餐没有可用的支付方式"));
    try {
      setPaymentBusy(true);
      const payload = { plan_id: selectedPlan.id };
      if (paymentMethod === 'balance') {
        await newApi.buySubscription(payload);
        const [self, subscription] = await Promise.all([newApi.currentUser(), newApi.currentSubscription()]);
        setAuthUser(self);
        setUserSummary((current) => ({ ...current, subscription }));
        setModal('');
        go(consolePath('dashboard'));
        notify(t("订阅已开通"));
        return;
      }

      let result;
      let checkoutUrl = '';
      if (paymentMethod.startsWith('epay:')) {
        result = await newApi.paySubscriptionEpay({ ...payload, payment_method: paymentMethod.slice(5) });
        checkoutUrl = result?.url || '';
        if (!checkoutUrl) throw new Error(result?.message === 'error' ? (result?.data || t("在线支付创建失败")) : t("支付服务未返回收银台地址"));
        const form = document.createElement('form');
        form.action = checkoutUrl;
        form.method = 'POST';
        form.target = '_blank';
        Object.entries(result.data || {}).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = String(value);
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        form.remove();
        setModal('');
        notify(t("支付页面已打开"));
        return;
      }
      if (paymentMethod === 'stripe') result = await newApi.paySubscriptionStripe(payload);
      else if (paymentMethod === 'creem') result = await newApi.paySubscriptionCreem(payload);
      else if (paymentMethod === 'pancake') result = await newApi.paySubscriptionPancake(payload);
      checkoutUrl = result?.pay_link || result?.checkout_url || '';
      if (!checkoutUrl) throw new Error(t("支付服务未返回收银台地址"));
      window.location.assign(checkoutUrl);
    } catch (error) { setBackendError(error.message || t("订阅购买失败")); }
    finally { setPaymentBusy(false); }
  };

  return (
    <div className="app-shell console-shell console-topnav">
      <header className="workspace-header">
        <div className="workspace-header-main">
          <SiteBrand status={siteBranding} className="brand" logoClassName="brand-mark console-brand-mark" nameClassName="brand-word" onNavigate={() => { setWorkspaceMenuOpen(false); go('/'); }} />
          <nav ref={workspaceNavRef} id="workspace-navigation" className={`workspace-nav ${workspaceMenuOpen ? 'is-open' : ''}`} aria-label={t("工作区导航")}>{visibleNavItems.map(({ id, label }) => <a key={id} href={consolePath(id)} className={`workspace-nav-link ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(id); }}><span>{t(label)}</span></a>)}</nav>
          <div className="workspace-header-actions">
            <LanguageSwitcher />
            <button className="workspace-menu-toggle" onClick={() => { setProfileOpen(false); setWorkspaceMenuOpen((open) => !open); }} aria-label={workspaceMenuOpen ? t("关闭导航菜单") : t("打开导航菜单")} aria-controls="workspace-navigation" aria-expanded={workspaceMenuOpen}>{workspaceMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
            <div className="profile-menu-wrap"><button className="profile-button" onClick={() => { setWorkspaceMenuOpen(false); setProfileOpen((open) => !open); }} aria-label={t("账户菜单")} aria-expanded={profileOpen}><AccountAvatar user={authUser} name={username} /><span className="profile-name">{username}</span></button>{profileOpen && <div className="profile-menu"><button onClick={() => { setProfileOpen(false); go('/'); }}>{t("返回首页")}</button>{isAdmin && <button onClick={() => { setProfileOpen(false); go('/admin'); }}>{t("管理工作台")}</button>}<button onClick={() => { setProfileOpen(false); notify(t("请联系管理员获取帮助")); }}><CircleHelp size={14} />{t("帮助与支持")}</button><button className="profile-menu-danger" onClick={signOut}><LogOut size={14} />{t("退出登录")}</button></div>}</div>
          </div>
        </div>
      </header>
      <main className={`main-content ${page === 'dashboard' ? 'dashboard-view' : ''}`}>
        <div className="page-heading">
          <div>
            {page === 'dashboard' ? <><h1>{t("欢迎回来，")}{username}</h1><p>{t("你的模型工作区概览")}</p></> : <><h1>{current.label === 'API 密钥' ? t("API 密钥管理") : t(current.label)}</h1><p>{pageSubtitle(page)}</p></>}
          </div>
          {page === 'keys' && <button className="button primary" onClick={() => { setKeyError(''); setKeyName(''); setKeyLimit(''); setKeyExpiry(''); setModal('new-key'); }}><Plus size={17} />{t("创建新密钥")}</button>}
        </div>
        {backendError && <div className="backend-error-banner"><CircleHelp size={16} /><span>{t(backendError)}</span><button onClick={() => setBackendError('')}>{t("关闭")}</button></div>}
        {page === 'dashboard' && <Dashboard user={authUser} status={siteStatus} summary={userSummary} announcements={announcements.items} onAnnouncement={announcements.show} onNavigate={navigate} onToast={notify} referralCode={referralCode} referralLoading={referralLoading} referralError={referralError} onReferralRetry={() => setReferralRevision((value) => value + 1)} onReferralCopy={copyReferral} onReferralTransfer={() => { setReferralTransferError(''); setModal('transfer-referral'); }} />}
        {page === 'redeem' && <Redeem value={redeem} enabled={topUpInfo?.enable_redemption !== false} onChange={setRedeem} onSubmit={redeemCode} />}
        {page === 'usage' && <Usage data={userSummary?.usage} status={siteStatus} rows={usageRows} range={usageRange} onRange={(value) => { setUsageRange(value); setUsagePage(1); }} filters={usageFilters} models={userModels} groups={groups} onApplyFilters={(filters, range) => { setUsageFilters(filters); setUsageRange(range); setUsagePage(1); }} page={usagePage} total={usageTotal} loading={usageLoading} onPage={setUsagePage} onExport={exportUsage} exportBusy={exportBusy} />}
        {page === 'keys' && <Keys keys={keys} search={keySearch} onSearch={(value) => { setKeySearch(value); setKeyPage(1); }} page={keyPage} total={keyTotal} loading={keyLoading} onPage={setKeyPage} onConfigure={openKeyConfig} onReveal={revealKey} onCopy={copyKey} onToggle={toggleKey} onDelete={removeKey} onToast={notify} catalog={userModels} status={siteStatus} catalogLoading={catalogLoading} />}
        {page === 'bills' && <Bills rows={billRows} page={billPage} total={billTotal} loading={billLoading} onPage={setBillPage} />}
        {page === 'models' && <ModelMarketplace models={userModels} groups={groups} catalog={pricingCatalog} quota={authUser?.quota} userGroup={authUser?.group} status={siteStatus} loading={catalogLoading} error={catalogError} onToast={notify} />}
        {page === 'pelican' && <PelicanSamples />}
        {page === 'plans' && <PurchaseStore user={authUser} status={siteStatus} onToast={notify} onBalanceChange={() => { newApi.currentUser().then(setAuthUser).catch(() => {}); }} />}
      </main>
      {modal === 'transfer-referral' ? <Dialog title={t('转入余额')} className="referral-transfer-dialog" onClose={() => { if (!referralBusy) setModal(''); }}><p className="transfer-description">{t('将全部邀请奖励转入账户余额，用于模型调用。')}</p><div className="transfer-amount">{formatQuotaDisplay(authUser?.aff_quota, siteStatus)}</div>{referralTransferError && <p className="form-error" role="alert">{t(referralTransferError)}</p>}<div className="modal-actions"><button className="button outline" disabled={referralBusy} onClick={() => setModal('')}>{t('取消')}</button><button className="button primary" disabled={referralBusy} onClick={transferReferral}>{t(referralBusy ? '正在转入…' : '确认转入')}</button></div></Dialog>
        : modal && <KeyDialog type={modal} name={keyName} setName={setKeyName} keyLimit={keyLimit} setKeyLimit={setKeyLimit} keyExpiry={keyExpiry} setKeyExpiry={setKeyExpiry} keySaving={keySaving} createdKey={createdKey} error={keyError} onClose={() => { if (keySaving) return; setModal(''); setCreatedKey(''); setKeyError(''); setEditingKey(null); }} onCreate={createKey} onUpdate={updateKey} onToast={notify} keyGroup={keyGroup} onKeyGroup={setKeyGroup} keyGroupOptions={keyGroupOptions} />}
      {toast && <div className="toast"><CheckCircle2 size={17} />{t(toast)}</div>}
      {announcements.open && <AnnouncementDialog items={announcements.items} onClose={announcements.close} />}
    </div>
  );
}

function pageSubtitle(page) {
  return ({
    redeem: t("使用兑换码激活你的订阅服务"),
    usage: t("查看模型调用和消费明细"),
    bills: t("兑换、充值与订阅明细"),
    keys: t("创建和管理你的 API 访问密钥"),
    models: t("浏览可用模型、价格和接入方式"),
    pelican: t("查看各分组模型的动态卡片、源代码和每小时记录"),
    plans: t("选择适合你的使用额度"),
  })[page] ?? '';
}

function SectionTitle({ title, detail, action }) {
  return <div className="section-title"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function Metric({ icon: Icon, label, value, note, tone = 'orange' }) {
  return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div></div>;
}

function Dashboard({ user, status, summary, announcements = [], onAnnouncement, onNavigate, onToast, referralCode, referralLoading, referralError, onReferralRetry, onReferralCopy, onReferralTransfer }) {
  const quota = user?.quota;
  const used = user?.used_quota;
  const subscriptions = summary?.subscription?.subscriptions || summary?.subscription?.all_subscriptions || [];
  const activeSubscription = Array.isArray(subscriptions) ? subscriptions.find((item) => (item.subscription || item).status === 'active') : null;
  const activePlan = activeSubscription?.plan?.title || activeSubscription?.plan?.name || t("已开通");
  const announcement = announcements[0];
  return <div className="page-stack">
    <section className="dashboard-top">
      <div className="panel balance-panel">
        <SectionTitle title={t("账户额度")} />
        <div className="balance-grid">
          <div className="balance-tile warm"><Metric icon={WalletCards} label={t("剩余额度")} value={formatQuotaDisplay(quota, status)} /></div>
          <div className="balance-tile mint"><Metric icon={Activity} label={t("累计消耗")} value={formatQuotaDisplay(used, status)} tone="green" /></div>
        </div>
      </div>
      <div className="panel compact-panel">
        <SectionTitle title={t("当前订阅")} />
        <div className="dashboard-card-value"><span className="metric-icon green"><CreditCard size={16} /></span><div><strong>{activeSubscription ? activePlan : t("暂无订阅")}</strong><small>{activeSubscription ? t("已开通") : t("查看可购买套餐")}</small></div></div>
        <button className="button primary full" onClick={() => onNavigate('plans')}><FileText size={17} />{t("查看订阅方案")}</button>
      </div>
      <div className="panel compact-panel">
        <SectionTitle title={t("账户状态")} />
        <div className="dashboard-card-value"><span className="metric-icon green"><CheckCircle2 size={16} /></span><div><strong>{user?.status === 1 ? t("正常") : user?.status == null ? '—' : t("受限")}</strong><small>{t("分组：")}{user?.group || '—'}</small></div></div>
        <button className="button outline full" onClick={() => onNavigate('redeem')}><Ticket size={16} />{t("兑换额度码")}</button>
      </div>
    </section>

    <section className="dashboard-mid">
      <div className="panel info-panel"><SectionTitle title={t("使用指南")} action={<span className="subtle-label"><CircleHelp size={15} />{t("快速开始")}</span>} />
        <div className="notice warm-notice"><div className="notice-icon"><Zap size={17} /></div><div><strong>{t("连接你的工具")}</strong><p>{t("创建 API 密钥，在客户端设置接口地址和模型名称。")}</p><button className="text-button" onClick={() => onNavigate('keys')}>{t("管理 API 密钥")}</button></div></div>
      </div>
      <div className="panel info-panel"><SectionTitle title={t("系统公告")} action={<span className="subtle-label"><Megaphone size={15} />{t("服务通知")}</span>} />
        <div className="notice yellow-notice"><div className="notice-icon"><Bell size={17} /></div><div className="announcement-card-copy"><strong>{announcement?.title || t("系统公告")}</strong>{announcement ? <><AnnouncementContent className="announcement-preview" content={announcement.content} /><button className="text-button" onClick={onAnnouncement}>{t('查看公告')}</button></> : <p>{t("当前暂无公告")}</p>}</div></div>
      </div>
    </section>

    <ReferralCard user={user} status={status} code={referralCode} loading={referralLoading} error={referralError} onRetry={onReferralRetry} onCopy={onReferralCopy} onTransfer={onReferralTransfer} />
  </div>;
}

function summaryValueFor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(getLocale()) : '—';
}

function billingDescription(row) {
  const part = readLogOther(row).content_parts?.[0];
  const key = part?.key || '';
  const params = part?.params || {};
  const value = (name) => ['quota', 'amount'].includes(name) ? formatLoggedAmount(params[name], { payment: name === 'amount' }) : params[name] == null ? '—' : String(params[name]);
  const descriptions = {
    'Topped up {{quota}} with a redemption code, code ID {{id}}': t("兑换码入账 · {v0} · 记录 {v1}", { v0: value('quota'), v1: value('id') }),
    'Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}': t("在线充值 · 到账 {v0} · 支付 {v1}", { v0: value('quota'), v1: value('amount') }),
    '{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}': t("{v0}充值 · 到账 {v1} · 支付 {v2}", { v0: value('provider'), v1: value('quota'), v2: value('amount') }),
    'Administrator completed the order, amount added: {{quota}}, payment amount: {{amount}}': t("订单入账 · 到账 {v0} · 支付 {v1}", { v0: value('quota'), v1: value('amount') }),
    'Payment received; redemption code issued for order {{order}}': t('已付款并发放兑换码 · 订单 {order}', { order: value('order') }),
    'Subscription purchased, plan: {{plan}}, payment amount: {{amount}}, payment method: {{method}}': t("订阅购买 · {v0} · 支付 {v1}（{v2}）", { v0: value('plan'), v1: value('amount'), v2: value('method') }),
    'Subscription purchased with balance, plan: {{plan}}, payment amount: {{amount}}, quota deducted: {{quota}}': t("余额购买订阅 · {v0} · 扣除 {v1}", { v0: value('plan'), v1: value('quota') }),
  };
  return descriptions[key] || row?.content || key || t("额度入账");
}

function billingCategory(row) {
  const key = readLogOther(row).content_parts?.[0]?.key || row?.content || '';
  if (/redemption code/i.test(key)) return t("兑换码");
  if (/subscription purchased/i.test(key)) return t("订阅");
  if (/top.?up|completed the order/i.test(key)) return t("充值");
  return t("额度入账");
}

function logDate(value) {
  const timestamp = Number(value);
  return timestamp > 0 ? new Date(timestamp * 1000).toLocaleString(getLocale()) : '—';
}

function Bills({ rows, page, total, loading, onPage }) {
  const pageCount = Math.max(1, Math.ceil(total / 20));
  return <div className="page-stack">
    <section className="panel table-panel usage-table-panel">
      <SectionTitle title={t("账单明细")} detail={t("共 {v0} 条兑换、充值与订阅记录", { v0: total.toLocaleString(getLocale()) })} />
      <div className="table-wrap"><table><thead><tr><th>{t("类型")}</th><th>{t("时间")}</th><th>{t("说明")}</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.id ?? `${row.created_at}-${index}`}>
          <td><span className="status-pill success">{billingCategory(row)}</span></td>
          <td>{logDate(row.created_at)}</td>
          <td>{billingDescription(row)}{readLogOther(row).content_parts?.[0]?.params?.order && <a className="button outline small" style={{ marginLeft: 12 }} href={`/console/plans?order=${encodeURIComponent(readLogOther(row).content_parts[0].params.order)}`}>{t('查看订单')}</a>}</td>
        </tr>)}
      </tbody></table></div>
      {loading && <div className="table-empty">{t("正在读取账单…")}</div>}
      {!loading && !rows.length && <div className="table-empty">{t("暂无账单记录")}</div>}
      {total > 0 && <div className="usage-pagination"><span>{t("第 {page} / {pages} 页", { page, pages: pageCount })}</span><button className="button outline small" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>{t("上一页")}</button><button className="button outline small" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount || loading}>{t("下一页")}</button></div>}
    </section>
  </div>;
}

function Redeem({ value, enabled, onChange, onSubmit }) {
  return <div className="narrow-stack"><section className="panel form-panel"><label className="field-label" htmlFor="redeem-code">{t("兑换码")}</label><div className="input-with-icon"><input id="redeem-code" value={value} disabled={!enabled} onChange={(event) => onChange(event.target.value)} placeholder={t("请输入兑换码")} autoCapitalize="off" autoCorrect="off" spellCheck="false" /><Ticket size={18} /></div><p className="field-hint">{enabled ? t("兑换码由管理员提供。") : t("当前实例未启用兑换功能。")}</p><button className="button primary full redeem-submit" onClick={onSubmit} disabled={!enabled}>{t("立即兑换")}</button></section>
    <section className="panel instructions"><h2>{t("使用说明")}</h2>{[t("输入你获得的兑换码"), t("确认订阅内容与有效期"), t("兑换成功后，额度将自动加入账户"), t("在仪表盘查看订阅和用量")].map((text, index) => <div className="instruction-row" key={text}><span>{index + 1}</span><p>{text}</p></div>)}<div className="notice yellow-notice compact-notice"><CircleHelp size={17} /><p>{t("兑换前请确认当前登录的是需要激活的账户。")}</p></div></section></div>;
}

function UsageLegacy({ data, rows, onToast }) {
  const stats = data && typeof data === 'object' ? data : {};
  const points = (Array.isArray(data) ? data : data?.items || data?.data || data?.points || []).map((point) => Number(point.quota ?? point.value ?? point.count ?? 0));
  const max = Math.max(1, ...points);
  const labels = (row) => [row.model_name || row.model || '—', row.created_at || row.created_time || '—', `${row.prompt_tokens ?? 0} / ${row.completion_tokens ?? 0}`, summaryValueFor(row.quota), row.code === 0 || row.status === 'success' ? '成功' : row.status || '—'];
  return <div className="page-stack"><div className="usage-summary"><div className="panel"><Metric icon={WalletCards} label="周期消耗" value={summaryValueFor(stats.quota ?? stats.total_quota ?? stats.today_quota)} /></div><div className="panel"><Metric icon={Zap} label="请求数量" value={summaryValueFor(stats.request_count ?? stats.count ?? stats.total)} note="当前统计周期" tone="green" /></div><div className="panel"><Metric icon={Gauge} label="输入 Tokens" value={summaryValueFor(stats.prompt_tokens ?? stats.prompt_token)} note="来自使用统计接口" tone="blue" /></div></div>
    <section className="panel chart-panel"><SectionTitle title="调用趋势" detail="当前账户的额度统计" action={<div className="segmented"><button className="selected">24 小时</button></div>} /><div className="chart"><div className="chart-y"><span>MAX</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="chart-plot"><div className="grid-lines"><i /><i /><i /><i /><i /></div>{points.length ? <div className="bar-row">{points.map((value, index) => <div key={index} className="chart-bar" style={{ height: `${Math.max(2, value / max * 100)}%` }} />)}</div> : <div className="chart-empty">该统计周期没有可绘制的数据</div>}<div className="chart-x"><span>周期起点</span><span>统计窗口</span><span>当前</span></div></div></div></section>
    <section className="panel table-panel"><SectionTitle title="最近调用" detail="最近的模型请求记录" action={<button className="button outline small" onClick={() => onToast('请在日志页面导出完整记录')}><FileText size={15} />导出指引</button>} /><div className="table-wrap"><table><thead><tr><th>模型</th><th>时间</th><th>输入 / 输出 Tokens</th><th>额度</th><th>状态</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{labels(row).map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong className="mono">{cell}</strong> : cellIndex === 4 ? <span className={`status-pill ${cell === '成功' ? 'success' : 'muted'}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div>{!rows.length && <div className="table-empty">当前没有调用记录</div>}</section></div>;
}

function Usage({ data, status: siteStatus, rows, range, onRange, filters, models, groups, onApplyFilters, page, total, loading, onPage, onExport, exportBusy }) {
  const stats = data && typeof data === 'object' ? data : {};
  const pageCount = Math.max(1, Math.ceil(total / 20));
  return <div className="page-stack">
    <div className="usage-summary">
      <div className="panel"><Metric icon={WalletCards} label={t("成功调用消费")} note={t('所选模型与日期范围')} value={formatQuotaDisplay(stats.quota, siteStatus)} /></div>
      <div className="panel"><Metric icon={Zap} label={t("每分钟请求")} value={summaryValueFor(stats.rpm)} note="RPM" tone="green" /></div>
      <div className="panel"><Metric icon={Gauge} label={t("每分钟 Tokens")} value={summaryValueFor(stats.tpm)} note="TPM" tone="blue" /></div>
    </div>
    <UsageTrend status={siteStatus} />
    <section className="panel table-panel usage-table-panel">
      <SectionTitle title={t("调用记录")} detail={t("共 {v0} 条记录", { v0: total.toLocaleString(getLocale()) })} action={<div className="usage-controls"><div className="segmented" aria-label={t("统计周期")}>{[['24h', t("24 小时")], ['7d', t("7 天")], ['30d', t("30 天")]].map(([value, label]) => <button key={value} className={range === value ? 'selected' : ''} onClick={() => onRange(value)}>{label}</button>)}</div><button className="button outline small" onClick={onExport} disabled={exportBusy}><Download size={15} />{exportBusy ? t("正在导出") : t("导出")}</button></div>} />
      <UsageFilters filters={filters} range={range} models={models} groups={groups} onApply={onApplyFilters} />
      <div className="table-wrap usage-detail-wrap" tabIndex={0} role="region" aria-label={t("调用记录，可横向滚动")}><table className="usage-detail-table"><thead><tr>{usageColumns.map((label, index) => <th key={label} scope="col" className={index >= 3 && index <= 8 ? 'numeric' : ''} title={index === 7 ? t("实际扣除的内部额度；订阅请求使用订阅扣费额度") : index === 8 ? t("按站点额度单位换算的消费，保留本次请求的计费结果") : undefined}>{t(label)}</th>)}</tr></thead><tbody>{rows.map((row, index) => {
        const usage = logUsage(row);
        const failed = Number(row.type) === 5;
        return <tr key={row.id ?? `${row.created_at}-${index}`}>
          <td className="usage-time">{logDate(row.created_at)}</td>
          <td><strong className="mono usage-model" title={row.model_name}>{row.model_name || '—'}</strong></td>
          <td><span className="soft-tag usage-group" title={row.group || undefined}>{row.group || '—'}</span></td>
          <td className="numeric">{usage.input == null ? '—' : summaryValueFor(usage.input)}</td>
          <td className="numeric">{usage.output == null ? '—' : summaryValueFor(usage.output)}</td>
          <td className="numeric">{usage.cacheWrite == null ? '—' : summaryValueFor(usage.cacheWrite)}</td>
          <td className="numeric">{usage.cacheRead == null ? '—' : summaryValueFor(usage.cacheRead)}</td>
          <td className="numeric">{usage.quota == null ? '—' : summaryValueFor(usage.quota)}</td>
          <td className="numeric usage-cost" title={t(usage.source)}>{formatQuotaDisplay(usage.quota, siteStatus)}</td>
          <td><span className={`status-pill ${failed ? 'failure' : 'success'}`}>{failed ? t("失败") : t("成功")}</span></td>
        </tr>;
      })}</tbody></table></div>
      {loading && <div className="table-empty">{t("正在读取调用记录…")}</div>}
      {!loading && !rows.length && <div className="table-empty">{t("当前周期没有调用记录")}</div>}
      <div className="usage-pagination"><span>{t("第 {page} / {pages} 页", { page, pages: pageCount })}</span><button className="button outline small" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>{t("上一页")}</button><button className="button outline small" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount || loading}>{t("下一页")}</button></div>
    </section>
  </div>;
}

function KeysLegacy({ keys, search, onSearch, onCreate, onToggle, onDelete, onToast }) {
  const visibleKeys = keys.filter((key) => `${key.name} ${key.group} ${key.status}`.toLowerCase().includes(search.toLowerCase()));
  const endpoint = `${apiBaseLabel().replace(/\/$/, '')}/v1`;
  return <div className="page-stack"><div className="endpoint-strip"><strong>API 端点</strong><div className="endpoint-chip"><span className="endpoint-dot" /><small>OpenAI 兼容</small><code>{endpoint}</code><button className="icon-button tiny" onClick={() => { navigator.clipboard?.writeText(endpoint); onToast('API 端点已复制'); }} aria-label="复制 API 端点"><Copy size={14} /></button></div></div>
    <section className="panel table-panel key-list"><SectionTitle title="你的 API 密钥" detail="用密钥连接支持的模型客户端" action={<label className="filter-control"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索密钥" /></label>} /><div className="key-items">{visibleKeys.map((key) => <article className="key-row" key={key.id}><div className="key-main"><div className="key-title"><h3>{key.name}</h3><span className={`status-pill ${key.status === '启用中' ? 'success' : 'muted'}`}>{t(key.status)}</span><span className="soft-tag">{key.raw?.group || t('默认分组')}</span></div><div className="key-meta"><span>最近使用：{formatTokenAccessTime(key.raw?.accessed_time)}</span><span>近 30 天消费：<strong>{key.used}</strong></span></div><code className="key-preview">{key.prefix}••••••••••••{key.suffix}</code><button className="icon-button inline-icon" aria-label="查看密钥" onClick={() => onToast('为保护密钥，完整值仅在创建时展示')}><Eye size={16} /></button><button className="icon-button inline-icon" aria-label="复制密钥" onClick={() => onToast('完整密钥仅在创建时展示，无法复制已隐藏的值')}><Copy size={15} /></button></div><div className="key-actions"><button className="button outline small" onClick={() => onToast('客户端配置指引已打开')}><Settings2 size={15} />配置</button><button className={`button small ${key.status === '启用中' ? 'warning' : 'outline'}`} onClick={() => onToggle(key.id)}>{key.status === '启用中' ? '停用' : '启用'}</button><button className="button danger small" onClick={() => onDelete(key.id)}><Trash2 size={15} />删除</button></div></article>)}</div>{visibleKeys.length === 0 && <div className="empty-state"><KeyRound size={28} /><strong>{keys.length ? '没有匹配的密钥' : '还没有 API 密钥'}</strong><p>{keys.length ? '试试其他名称或模型分组。' : '创建一个密钥，用你喜欢的客户端开始调用模型。'}</p>{keys.length === 0 && <button className="button primary" onClick={onCreate}><Plus size={16} />创建密钥</button>}</div>}</section>
    <section className="panel key-tip"><ShieldCheck size={19} /><div><strong>保护你的密钥</strong><p>不要在公开代码仓库、前端网页或截图中暴露密钥。发现异常调用时，请立即停用并重新创建。</p></div></section></div>;
}

function Keys({ keys, search, onSearch, page, total, loading, onPage, onConfigure, onReveal, onCopy, onToggle, onDelete, onToast, catalog, status, catalogLoading }) {
  const [ccSwitchKey, setCCSwitchKey] = useState(null);
  const visibleKeys = keys;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  return <div className="page-stack">
    <ApiEndpoint onToast={onToast} />
    <section className="panel table-panel key-list">
      <SectionTitle title={t("你的 API 密钥")} detail={t("共 {v0} 个密钥", { v0: total.toLocaleString(getLocale()) })} action={<label className="filter-control"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t("搜索密钥")} /></label>} />
      <div className="key-items">{visibleKeys.map((key) => {
        const canToggle = [1, 2, 3, 4].includes(Number(key.raw?.status));
        return <article className="key-row" key={key.id}>
          <div className="key-main"><div className="key-title"><h3>{key.name}</h3><span className={`status-pill ${key.status === '启用中' ? 'success' : 'muted'}`}>{t(key.status)}</span><span className="soft-tag">{key.raw?.group || t('默认分组')}</span></div>
            <div className="key-meta"><span>{t("最近使用：")}{formatTokenAccessTime(key.raw?.accessed_time)}</span><span>{t("累计消费：")}<strong>{summaryValueFor(key.used)}</strong></span></div>
            <div className="key-secret-row"><code className="key-preview">{key.secret || t(loading ? '读取中' : '密钥读取失败')}</code>{!loading && !key.secret && <button className="text-button" onClick={() => onReveal(key.id)}>{t('重试')}</button>}<button className="icon-button inline-icon" aria-label={t("复制完整密钥")} title={t("复制完整密钥")} onClick={() => onCopy(key.id)} disabled={loading}><Copy size={15} /></button></div>
          </div>
          <div className="key-actions"><button className="button outline small cc-switch-import" onClick={() => setCCSwitchKey(key)} disabled={loading || !key.secret}><Download size={15} />{t('导入 CC Switch')}</button><button className="button outline small" onClick={() => onConfigure(key)}><Settings2 size={15} />{t("配置")}</button><button className={`button small ${key.status === '启用中' ? 'warning' : 'outline'}`} onClick={() => onToggle(key.id)} disabled={!canToggle}>{key.status === '启用中' ? t("停用") : key.status === '已停用' ? t("启用") : t("需配置")}</button><button className="button danger small" onClick={() => onDelete(key.id)}><Trash2 size={15} />{t("删除")}</button></div>
        </article>;
      })}</div>
      {loading && <div className="table-empty">{t("正在读取密钥…")}</div>}
      {!loading && visibleKeys.length === 0 && <div className="empty-state"><KeyRound size={28} /><strong>{total ? t("没有匹配的密钥") : t("还没有 API 密钥")}</strong></div>}
      {total > 20 && <div className="usage-pagination"><span>{t("第 {page} / {pages} 页", { page, pages: pageCount })}</span><button className="button outline small" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>{t("上一页")}</button><button className="button outline small" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount || loading}>{t("下一页")}</button></div>}
    </section>
    <section className="panel key-tip"><ShieldCheck size={19} /><div><strong>{t("保护你的密钥")}</strong><p>{t("不要分享密钥。发现异常调用时，请立即停用并重新创建。")}</p></div></section>
    {ccSwitchKey && <CCSwitchDialog token={ccSwitchKey} catalog={catalog} status={status} loading={catalogLoading} onClose={() => setCCSwitchKey(null)} />}
  </div>;
}

function PlansLegacy({ plans: apiPlans, onToast, onNavigate, onBuy }) {
  const plans = apiPlans.length ? apiPlans.map((item) => { const plan = item.plan || item; return { id: plan.id, name: plan.title || plan.name || '订阅套餐', price: plan.price_amount == null ? '—' : `${plan.currency || 'USD'} ${plan.price_amount}`, cadence: plan.duration_value ? `/ ${plan.duration_value} ${plan.duration_unit || ''}` : '', detail: plan.subtitle || '由当前实例提供的订阅计划', features: [`额度：${summaryValueFor(plan.total_amount ?? plan.quota ?? '—')}`, `周期：${plan.duration_value || '—'} ${plan.duration_unit || ''}`, plan.allow_balance_pay === false ? '不支持余额支付' : '支持余额支付'], icon: Sparkles, featured: plan.sort_order === 0 }; }) : [{ name: '当前暂无可购买套餐', price: '—', detail: '可用套餐会在发布后显示', features: ['额度与有效期清晰展示', '支持多种支付方式', '购买后自动同步到账户'], icon: CircleHelp }];
  return <div className="page-stack"><section className="plan-grid">{plans.map((plan) => <article className={`panel plan-card ${plan.featured ? 'featured' : ''}`} key={plan.id || plan.name}>{plan.featured && <span className="plan-ribbon">推荐</span>}<div className="plan-icon"><plan.icon size={19} /></div><h2>{plan.name}</h2><p className="plan-detail">{plan.detail}</p><div className="plan-price">{plan.price}<small>{plan.cadence}</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul><button className={`button ${plan.featured ? 'primary' : 'outline'} full`} onClick={() => plan.id ? onBuy(plan.id) : onNavigate('dashboard')}>{plan.id ? '选择此套餐' : '返回额度概览'}</button></article>)}</section><section className="panel billing-note"><ShieldCheck size={19} /><p>支付由管理后台配置的余额或支付渠道处理；成功后订阅状态会从服务端刷新。</p></section></div>;
}

function Plans({ plans: apiPlans, paymentInfo, onNavigate, onBuy }) {
  const plans = apiPlans.map((item) => item.plan || item).map((plan) => ({
    ...plan,
    name: plan.title || plan.name || t("订阅套餐"),
    paymentOptions: getPlanPaymentOptions(plan, paymentInfo),
  }));
  return <div className="page-stack">
    {plans.length ? <section className="plan-grid">{plans.map((plan) => <article className={`panel plan-card ${plan.sort_order === 0 ? 'featured' : ''}`} key={plan.id}>
      {plan.sort_order === 0 && <span className="plan-ribbon">{t("推荐")}</span>}
      <div className="plan-icon"><Sparkles size={19} /></div><h2>{plan.name}</h2>{plan.subtitle && <p className="plan-detail">{plan.subtitle}</p>}
      <div className="plan-price">{plan.price_amount == null ? '—' : `${plan.currency || 'USD'} ${Number(plan.price_amount).toFixed(2)}`}<small>{`/ ${formatDuration(plan)}`}</small></div>
      <ul><li><Check size={15} />{t("额度：")}{summaryValueFor(plan.total_amount ?? 0)}</li><li><Check size={15} />{t("有效期：")}{formatDuration(plan)}</li><li><Check size={15} />{t("可用支付：")}{plan.paymentOptions.map((option) => option.label).join(getLocale() === 'en-US' ? ', ' : '、') || t("暂无")}</li></ul>
      <button className={`button ${plan.sort_order === 0 ? 'primary' : 'outline'} full`} onClick={() => onBuy(plan.id)} disabled={!plan.paymentOptions.length}>{t("选择此套餐")}</button>
    </article>)}</section> : <section className="panel empty-state plans-empty"><CreditCard size={27} /><strong>{t("当前暂无可购买套餐")}</strong><p>{t("请稍后再查看可用方案。")}</p><button className="button outline" onClick={() => onNavigate('dashboard')}>{t("返回额度概览")}</button></section>}
  </div>;
}

function RouteLoading() {
  return <div className="route-loading"><span className="brand-mark"><Zap size={17} fill="currentColor" /></span><strong>{t("正在恢复工作区")}</strong><small>{t("正在检查登录状态…")}</small></div>;
}

export default App;
