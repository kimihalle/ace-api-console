import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Cpu, KeyRound, Layers3, LockKeyhole, LogOut, Menu,
  Network, ShieldCheck, Sparkles, Terminal, X, Zap,
} from 'lucide-react';
import { clearAccessToken, logout, newApi } from '../lib/newapi.js';
import { AccountAvatar, SiteBrand } from './Identity.jsx';
import { useLanguage } from '../lib/use-language.js';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export function PublicHome({ onNavigate, status, branding }) {
  useLanguage();
  const [service, setService] = useState('checking');
  const [content, setContent] = useState(null);
  const [initialStatus, setSiteStatus] = useState(null);
  const siteStatus = status || initialStatus;
  const [sessionUser, setSessionUser] = useState(null);
  const [models, setModels] = useState([]);

  useEffect(() => {
    let active = true;
    newApi.publicStatus().then((data) => {
      if (active) { setSiteStatus(data); setService('online'); }
    }).catch(() => { if (active) setService('unavailable'); });
    newApi.homeContent().then((data) => { if (active) setContent(data); }).catch(() => {});
    newApi.restoreSession({ force: true }).then((user) => { if (active && user) setSessionUser(user); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    newApi.userModels().then((data) => {
      const list = Array.isArray(data) ? data : data?.items || data?.data || data?.list || [];
      setModels(list.map((model) => {
        const name = typeof model === 'string' ? model : model.id || model.name || t("兼容模型");
        return {
          name,
          provider: typeof model === 'string' ? '' : model.provider || model.vendor || '',
          detail: typeof model === 'string' ? '' : model.description || '',
        };
      }).slice(0, 4));
    }).catch(() => setModels([]));
  }, [sessionUser]);

  const managedText = typeof content === 'string' ? content.replace(/<[^>]+>/g, ' ').replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim() : '';
  const title = content?.title || content?.home_page_title || t("把模型接入你的工作流");
  const subtitle = content?.subtitle || content?.home_page_content || managedText || t("一个入口连接多家模型服务，统一管理密钥、额度和调用体验。");
  const brandStatus = siteStatus || branding;
  const displayName = brandStatus?.system_name || '';
  const loggedInName = sessionUser?.username || sessionUser?.display_name || t("进入工作台");
  const signOut = async () => {
    try { await logout(); } catch { clearAccessToken(); }
    setSessionUser(null);
    onNavigate('/');
  };

  return <HomeLanding onNavigate={onNavigate} branding={brandStatus} siteStatus={siteStatus} displayName={displayName} title={title} subtitle={subtitle} service={service} sessionUser={sessionUser} loggedInName={loggedInName} models={models} onSignOut={signOut} />;

  return <div className="site-home">
    <header className="site-nav"><a className="site-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}><span className="site-brand-icon">{brandIcon}</span><span>{displayName}<span className="brand-period">/</span></span></a>
      <button className="site-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="切换导航">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className={menuOpen ? 'site-links open' : 'site-links'}><a href="#models" onClick={() => setMenuOpen(false)}>模型目录</a><a href="#how" onClick={() => setMenuOpen(false)}>接入方式</a><a href="#plans" onClick={() => setMenuOpen(false)}>订阅方案</a>{sessionUser ? <button className="site-login" onClick={() => onNavigate('/console')}>{loggedInName}</button> : <button className="site-login" onClick={() => onNavigate('/login')}>登录</button>}{!sessionUser && <button className="site-signup" onClick={() => onNavigate('/register')}>创建账户 <ArrowUpRight size={15} /></button>}</nav>
    </header>

    <main>
      <section className="site-hero">
        <div className="hero-gridline" aria-hidden="true" />
        <div className="hero-inner"><div className="hero-copy"><div className="eyebrow"><span className={`service-indicator ${service}`} />{service === 'online' ? '服务状态正常' : service === 'checking' ? '正在检查服务状态' : '模型路由工作台'}</div><h1>{title}</h1><p>{subtitle}</p><div className="hero-actions"><button className="hero-cta" onClick={() => onNavigate('/register')}>开始使用 <ArrowRight size={17} /></button><button className="hero-secondary" onClick={() => document.getElementById('models')?.scrollIntoView({ behavior: 'smooth' })}>浏览模型目录 <ArrowDownRight size={16} /></button></div><div className="hero-proof"><span><Check size={14} />兼容 OpenAI API</span><span><Check size={14} />按实际用量计费</span><span><Check size={14} />密钥由你管理</span></div></div>
          <div className="hero-console" aria-label="模型路由工作台预览"><div className="console-topline"><span className="console-lights"><i /><i /><i /></span><span>ROUTE / PREVIEW</span><span className="console-live">示意界面</span></div><div className="console-body"><div className="console-rail"><span className="rail-logo"><Network size={14} /></span><span className="rail-active"><Activity size={15} /></span><span><Layers3 size={15} /></span><span><KeyRound size={15} /></span><span><Terminal size={15} /></span></div><div className="console-main"><div className="console-heading"><div><small>WORKSPACE / PREVIEW</small><strong>模型路由工作台</strong></div><span className="route-latency">示意数据</span></div><div className="route-lines"><div className="route-line"><span className="route-dot violet">A</span><span><strong>上游渠道</strong><small>模型服务商配置</small></span><span className="route-meter"><i style={{ width: '77%' }} /></span><b>已配置</b></div><div className="route-line"><span className="route-dot lime">M</span><span><strong>模型目录</strong><small>按账户分组展示</small></span><span className="route-meter"><i style={{ width: '88%' }} /></span><b>可管理</b></div><div className="route-line"><span className="route-dot blue">K</span><span><strong>访问密钥</strong><small>由服务端签发</small></span><span className="route-meter"><i style={{ width: '63%' }} /></span><b>可管理</b></div></div><div className="console-bottom"><span><small>DATA SOURCE</small><strong>当前实例</strong></span><div className="spark-bars">{[28,36,30,54,42,48,63,40,70,56,77,61,84,65,91,74,100,72,86,61,78,68,96,72,88,64,82,70,98,80,90,75,100,86,96,78].map((height, i) => <i style={{ height: `${height}%` }} key={i} />)}</div></div></div></div></div>
        </div><div className="hero-index"><span>01</span><span>ROUTE INTELLIGENCE</span><span>SCROLL TO EXPLORE</span></div>
      </section>

      <section className="trust-band"><span>ONE GATEWAY</span><i /><span>ANY MODEL</span><i /><span>YOUR KEYS</span><i /><span>YOUR WORKFLOW</span><div className="trust-quote"><strong>1</strong> endpoint <span>/</span> multiple providers</div></section>

      <section className="section models-section" id="models"><div className="section-kicker">01 / MODEL DIRECTORY</div><div className="section-heading-row"><div><h2>把模型放在一起看。</h2><p>模型和价格由当前实例提供，不展示预置样例。</p></div><button className="inline-link" onClick={() => onNavigate('/register')}>创建账户 <ArrowUpRight size={15} /></button></div>{models.length ? <><div className="model-list-heading"><span>MODEL</span><span>PROVIDER</span><span>BEST FOR</span><span>INPUT / OUTPUT · 1M</span><span /></div>{models.map(([name, provider, bestFor, price], index) => <div className="public-model-row" key={name}><span className="model-index">0{index + 1}</span><strong>{name}</strong><span className={`provider-name provider-${provider.toLowerCase()}`}>{provider}</span><span className="model-usecase">{bestFor}</span><span className="model-price">{price}</span><button className="row-arrow" aria-label={`查看 ${name}`} onClick={() => onNavigate('/register')}><ArrowUpRight size={16} /></button></div>)}</> : <div className="public-model-empty">注册并登录后，模型目录会按你的账户权限加载。</div>}<div className="section-tail"><span>目录与定价以实例实际配置为准</span><span>MODEL CATALOG <ArrowRight size={13} /></span></div></section>

      <section className="workflow-section" id="how"><div className="section"><div className="section-kicker">02 / CONNECTION FLOW</div><div className="workflow-intro"><h2>沿用你的工具链。</h2><p>只替换接口地址和 API Key，现有客户端与工作流无需重写。</p></div><div className="workflow-grid"><article><span className="workflow-num">A</span><Code2 size={20} /><h3>创建密钥</h3><p>为项目、环境或成员分别管理访问凭据。</p></article><article><span className="workflow-num">B</span><Terminal size={20} /><h3>设置端点</h3><p>将兼容接口地址填入你正在使用的客户端。</p></article><article><span className="workflow-num">C</span><Activity size={20} /><h3>查看用量</h3><p>按请求追踪模型、额度和消费变化。</p></article></div></div></section>

      <section className="section plans-section" id="plans"><div className="section-kicker">03 / ACCESS</div><div className="plans-copy"><div><h2>从小规模开始，<br />按需要扩展。</h2><p>不锁定模型。按量余额和订阅额度在用户工作区统一管理。</p></div><div className="plan-preview"><div className="plan-preview-head"><span>PAY-AS-YOU-GO</span><Cpu size={18} /></div><strong>按需调用</strong><p>查看实例当前支持的额度、套餐和支付方式。</p><button onClick={() => onNavigate('/register')}>查看可用方案 <ChevronRight size={16} /></button></div></div></section>

      <section className="closing-band"><div><span className="section-kicker">READY WHEN YOU ARE</span><h2>从一个端点开始。</h2></div><button className="hero-cta" onClick={() => onNavigate('/register')}>创建账户 <ArrowRight size={17} /></button></section>
    </main>
    <footer className="site-footer"><a className="site-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}><span className="site-brand-icon">{brandIcon}</span><span>{displayName}<span className="brand-period">/</span></span></a><span>Model routing workspace</span><span>Powered by New API</span><button onClick={() => onNavigate(sessionUser ? '/console' : '/login')}>{sessionUser ? '进入工作台' : '登录'} <ArrowUpRight size={14} /></button></footer>
  </div>;
}

function IDEPreview({ displayName }) {
  const lines = [
    { indent: 0, parts: [{ text: 'const ', tone: 'keyword' }, { text: 'client ', tone: 'plain' }, { text: '= ', tone: 'operator' }, { text: 'new ', tone: 'keyword' }, { text: 'OpenAI', tone: 'type' }, { text: '({', tone: 'plain' }] },
    { indent: 1, parts: [{ text: 'baseURL', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: "'https://api.", tone: 'string' }, { text: displayName.toLowerCase(), tone: 'brand' }, { text: ".ai/v1'", tone: 'string' }, { text: ',', tone: 'plain' }] },
    { indent: 1, parts: [{ text: 'apiKey', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: 'process.env.', tone: 'plain' }, { text: 'AI_API_KEY', tone: 'constant' }, { text: ',', tone: 'plain' }] },
    { indent: 0, parts: [{ text: '});', tone: 'plain' }] },
    { indent: 0, parts: [{ text: '', tone: 'plain' }] },
    { indent: 0, parts: [{ text: 'const ', tone: 'keyword' }, { text: 'answer ', tone: 'plain' }, { text: '= await ', tone: 'keyword' }, { text: 'client.chat.completions', tone: 'property' }, { text: '.create({', tone: 'plain' }] },
    { indent: 1, parts: [{ text: 'model', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: "'claude-sonnet'", tone: 'string' }, { text: ',', tone: 'plain' }] },
    { indent: 1, parts: [{ text: 'messages', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: '[{ ', tone: 'plain' }, { text: 'role', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: "'user'", tone: 'string' }, { text: ', ', tone: 'plain' }, { text: 'content', tone: 'property' }, { text: ': ', tone: 'plain' }, { text: "'Hello, models.'", tone: 'string' }, { text: ' }]', tone: 'plain' }] },
    { indent: 0, parts: [{ text: '});', tone: 'plain' }] },
    { indent: 0, parts: [{ text: 'console.log(answer.choices[0].message);', tone: 'plain' }] },
  ];
  const lengths = lines.map((line) => line.parts.reduce((sum, part) => sum + part.text.length, 0));
  const [cursor, setCursor] = useState({ line: 0, char: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setCursor((current) => {
      const currentLength = lengths[current.line];
      if (current.char < currentLength) return { ...current, char: current.char + 1 };
      if (current.line < lines.length - 1) return { line: current.line + 1, char: 0 };
      return current;
    }), 42);
    const reset = window.setInterval(() => setCursor({ line: 0, char: 0 }), 10500);
    return () => { window.clearInterval(timer); window.clearInterval(reset); };
  }, [displayName]);

  return <div className="home-ide" aria-label={t("代码编辑器动态预览")}>
    <div className="ide-titlebar"><div className="ide-window-dots"><i /><i /><i /></div><span className="ide-file-tab"><Code2 size={13} /> quickstart.ts</span><span className="ide-window-label">{displayName}</span></div>
    <div className="ide-workspace"><div className="ide-gutter"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span></div><pre className="ide-code">{lines.map((line, lineIndex) => {
      const visible = lineIndex < cursor.line ? lengths[lineIndex] : lineIndex === cursor.line ? cursor.char : 0;
      let remaining = visible;
      return <span className="ide-code-line" key={lineIndex}>{'  '.repeat(line.indent)}{line.parts.map((part, partIndex) => {
        const shown = part.text.slice(0, Math.max(0, Math.min(part.text.length, remaining)));
        remaining -= part.text.length;
        return shown ? <span className={`ide-${part.tone}`} key={partIndex}>{shown}</span> : null;
      })}{lineIndex === cursor.line && <i className="ide-caret" />}</span>;
    })}</pre></div>
    <div className="ide-statusbar"><span><i /> Ready</span><span>TypeScript&nbsp;&nbsp; UTF-8&nbsp;&nbsp; {displayName}</span></div>
  </div>;
}

function HomeLanding({ onNavigate, siteStatus, branding, displayName, title, subtitle, service, sessionUser, loggedInName, models, onSignOut }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const goTo = (target) => onNavigate(target);
  const registrationOpen = Boolean(siteStatus) && siteStatus.register_enabled !== false && siteStatus.password_register_enabled !== false;
  const startPath = sessionUser ? '/console' : registrationOpen ? '/register' : '/login';

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onPointerDown = (event) => { if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false); };
    const onKeyDown = (event) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  return <div className="site-home home-v2">
    <header className="site-nav home-nav">
      <SiteBrand status={branding} name={displayName} onNavigate={goTo} />
      <nav className="site-links">
        <LanguageSwitcher />
        {sessionUser ? <div className="profile-menu-wrap home-account-menu" ref={accountMenuRef}>
          <button className="site-user-link" type="button" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-label={t("打开账户菜单")}><AccountAvatar user={sessionUser} name={loggedInName} /><span>{loggedInName}</span><ChevronDown size={14} /></button>
          {accountMenuOpen && <div className="profile-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); goTo('/console'); }}>{t("进入控制台")}</button><button type="button" role="menuitem" className="profile-menu-danger" onClick={onSignOut}><LogOut size={14} />{t("退出登录")}</button></div>}
        </div> : <button className="site-login" onClick={() => goTo('/login')}>{t("登录")}</button>}
        {!sessionUser && registrationOpen && <button className="site-signup" onClick={() => goTo('/register')}>{t("注册")}</button>}
      </nav>
    </header>
    <main>
      <section className="home-hero-v2">
        <div className="home-hero-v2-inner">
          <div className="home-hero-copy-v2">
            <div className="home-status"><span className={`service-indicator ${service}`} />{t("面向开发者的模型工作台")}</div>
            <h1>{title}<em>{t("，更专注。")}</em></h1>
            <p>{subtitle}</p>
            <div className="home-hero-actions"><button className="home-primary-action" onClick={() => goTo(startPath)}>{sessionUser ? t("进入工作台") : t("开始使用")}</button><button className="home-secondary-action" onClick={() => document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })}>{t("了解能力")}</button></div>
            <div className="home-trust-row"><span><Check size={14} />{t("OpenAI 兼容接口")}</span><span><Check size={14} />{t("统一密钥管理")}</span><span><Check size={14} />{t("按用量清晰计费")}</span></div>
          </div>
          <IDEPreview displayName={displayName} />
        </div>
      </section>

      <section className="home-proof-band"><div><strong>{models.length || t("多家")}</strong><span>{t("模型服务，统一接入")}</span></div><div><strong>{t("1 个")}</strong><span>{t("兼容 OpenAI 的访问入口")}</span></div><div><strong>{t("实时")}</strong><span>{t("查看额度与调用记录")}</span></div><div><strong>{t("按量")}</strong><span>{t("清楚掌握每次调用")}</span></div></section>

      <section className="home-models-band" id="models"><div className="home-section-narrow"><div className="section-kicker">MODEL ACCESS</div><div className="home-models-heading"><div><h2>{t("把选择权留在你手里。")}</h2><p>{models.length ? t("当前账户可用的模型会在工作台中持续更新。") : t("登录后，模型目录会根据你的账户权限显示。")}</p></div><button className="home-text-action" onClick={() => goTo(sessionUser ? '/console' : '/login')}>{sessionUser ? t("查看模型") : t("登录查看模型")}</button></div>{models.length ? <div className="home-model-list">{models.map((model) => <div className="home-model-line" key={model.name}><span className="home-model-mark">{model.name.slice(0, 1).toUpperCase()}</span><strong>{model.name}</strong><span>{model.provider || t("兼容接入")}</span><small>{model.detail || t("通过统一接口调用")}</small></div>)}</div> : <div className="home-model-empty"><span className="home-empty-mark"><Layers3 size={18} /></span><span>{t("登录后即可查看当前实例提供的模型、价格和可用范围。")}</span></div>}</div></section>

      <section className="home-capabilities" id="capabilities"><div className="home-section-narrow"><div className="section-kicker section-kicker-light">WHY {displayName.toUpperCase()}</div><div className="home-capabilities-head"><h2>{t("让复杂的模型接入，")}<br /><span>{t("回到清晰的工作流。")}</span></h2><p>{t("从调用到结算，每一步都保持可见、可控、可替换。")}</p></div><div className="home-capability-grid"><article><span className="capability-icon"><Layers3 size={18} /></span><strong>{t("多模型，一处管理")}</strong><p>{t("统一查看模型、可用范围和访问策略。")}</p></article><article><span className="capability-icon"><KeyRound size={18} /></span><strong>{t("密钥，按项目隔离")}</strong><p>{t("为团队、项目和环境分别管理凭据。")}</p></article><article><span className="capability-icon"><Activity size={18} /></span><strong>{t("用量，实时掌握")}</strong><p>{t("额度、请求和消费变化都在工作台里。")}</p></article><article><span className="capability-icon"><ShieldCheck size={18} /></span><strong>{t("接口，稳定兼容")}</strong><p>{t("沿用熟悉的 OpenAI 风格调用方式。")}</p></article></div></div></section>

      <section className="home-steps" id="steps"><div className="home-section-narrow"><div className="section-kicker">HOW IT WORKS</div><div className="home-steps-head"><h2>{t("三步，开始调用。")}</h2><p>{t("不改工具链，只把模型能力接入你的日常工作。")}</p></div><div className="home-step-grid"><article><span>01</span><Code2 size={20} /><h3>{t("创建账户")}</h3><p>{t("注册后进入属于你的模型工作台。")}</p></article><article><span>02</span><KeyRound size={20} /><h3>{t("生成密钥")}</h3><p>{t("创建项目密钥，连接正在使用的客户端。")}</p></article><article><span>03</span><Activity size={20} /><h3>{t("开始调用")}</h3><p>{t("在一个入口里管理模型、额度和记录。")}</p></article></div></div></section>

      <section className="home-plans-landing" id="plans"><div className="home-section-narrow home-plans-inner"><div><div className="section-kicker">READY WHEN YOU ARE</div><h2>{t("从一个入口开始，")}<br />{t("把时间留给真正重要的事。")}</h2><p>{registrationOpen ? t("现在注册，进入你的模型工作台。") : t("登录后继续管理你的模型接入。")}</p></div><button className="home-primary-action" onClick={() => goTo(startPath)}>{sessionUser ? t("进入工作台") : registrationOpen ? t("创建账户") : t("登录")}</button></div></section>
    </main>
    <footer className="home-copyright">© 2026 {displayName}. All rights reserved.</footer>
  </div>;
}
