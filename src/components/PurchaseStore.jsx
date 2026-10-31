import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CheckCircle2, Clock3, Copy, CreditCard, ExternalLink, Gift, RefreshCw, WalletCards } from 'lucide-react';
import { newApi } from '../lib/newapi.js';
import { useLanguage } from '../lib/use-language.js';
import { formatQuotaDisplay } from '../lib/usage-format.js';
import { topUpDestination } from '../lib/site-content.js';
import { copyText } from '../lib/clipboard.js';
import { storeCheckout, storeDeliveryModes, storeOrderPayload } from '../lib/store.js';
import Dialog from './Dialog.jsx';
import './purchase-store.css';

function CreditTicket({ quota, status, compact = false, tone = 0 }) {
  const { t } = useLanguage();
  return <div className={`store-ticket tone-${tone % 4}${compact ? ' compact' : ''}`} aria-hidden="true"><div className="store-ticket-top">API CREDIT</div><div className="store-ticket-face"><span>{t('额度补给')}</span><strong>{formatQuotaDisplay(quota, status)}</strong><small>{t('模型调用额度')}</small></div><div className="store-ticket-barcode" /><span className="store-ticket-bottom">API · CREDIT</span></div>;
}

function PaymentPrice({ payment, locale }) {
  const { t } = useLanguage();
  if (!payment || payment.estimated) return <>{t('收银台确认金额')}</>;
  return <>{payment.currency ? new Intl.NumberFormat(locale, { style: 'currency', currency: payment.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(payment.money)) : payment.money}</>;
}

function PurchaseConfirm({ product, user, status, deliveryModes, onClose, onCreated }) {
  const { t, locale } = useLanguage();
  const [paymentId, setPaymentId] = useState(product.payments[0]?.id || '');
  const [delivery, setDelivery] = useState(deliveryModes[0] || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const payment = product.payments.find((item) => item.id === paymentId);
  const name = product.name || t('{amount} 额度包', { amount: formatQuotaDisplay(payment?.quota, status) });
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current || !deliveryModes.includes(delivery)) return;
    inFlight.current = true;
    setError(''); setBusy(true);
    try {
      const result = await newApi.createStoreOrder(storeOrderPayload(product, paymentId, delivery));
      onCreated({ ...storeCheckout(result), name, payment, delivery });
    } catch (error) { setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Dialog title={t('确认购买')} onClose={() => { if (!busy) onClose(); }} className="store-dialog store-confirm-dialog">
    <form onSubmit={submit}>
      <div className="store-confirm-product"><CreditTicket compact quota={payment?.quota} status={status} /><div><span className="store-eyebrow">{t('API 调用额度')}</span><h3>{name}</h3><p>{formatQuotaDisplay(payment?.quota, status)} · {t(delivery === 'redemption' ? '领取兑换码' : '直接充值')}</p></div></div>
      {deliveryModes.length > 1 && <fieldset className="store-fieldset" disabled={busy}><legend>{t('交付方式')}</legend><div className="store-delivery-options">{[['balance', '直接充值', '付款后自动增加账户余额', WalletCards], ['redemption', '领取兑换码', '付款后领取，可自用或赠送', Gift]].filter(([value]) => deliveryModes.includes(value)).map(([value, label, detail, Icon]) => <label key={value} className={delivery === value ? 'selected' : ''}><input type="radio" name="delivery" value={value} checked={delivery === value} onChange={() => setDelivery(value)} /><Icon size={18} /><span><strong>{t(label)}</strong><small>{t(detail)}</small></span></label>)}</div></fieldset>}
      <fieldset className="store-fieldset" disabled={busy}><legend>{t('支付方式')}</legend><div className="store-payment-options">{product.payments.map((method) => <label key={method.id} className={paymentId === method.id ? 'selected' : ''}><input type="radio" name="store-payment" value={method.id} checked={paymentId === method.id} onChange={() => setPaymentId(method.id)} /><CreditCard size={17} /><span>{method.name || method.id}</span>{paymentId === method.id && <CheckCircle2 size={16} />}</label>)}</div></fieldset>
      <div className="store-account"><span>{t('购买账户')}</span><strong>{user.email || user.username}</strong></div>
      <div className="store-checkout-total"><span>{t('应付金额')}</span><strong><PaymentPrice payment={payment} locale={locale} /></strong></div>
      {payment?.estimated && <p className="store-help">{t('实际支付金额及优惠以网关收银台为准。')}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <div className="modal-actions"><button type="button" className="button outline" disabled={busy} onClick={onClose}>{t('取消')}</button><button className="button primary" type="submit" disabled={busy || !payment || !deliveryModes.includes(delivery)}>{busy ? t('正在创建订单…') : t('立即支付')}<ArrowRight size={16} /></button></div>
    </form>
  </Dialog>;
}

export function OrderReceipt({ tradeNo, checkout, status, onClose, onPaid, onToast }) {
  const { t, locale } = useLanguage();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const paid = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    let polling = true;
    const load = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await newApi.storeOrder(tradeNo, controller.signal);
        if (controller.signal.aborted) return;
        setState({ data, loading: false, error: '' });
        polling = data.order?.status === 'pending';
        if (data.order?.status === 'success' && !paid.current) { paid.current = true; onPaidRef.current?.(); }
      } catch (error) { if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false, error: error.message })); }
      finally { inFlight = false; }
    };
    load();
    const timer = setInterval(() => { if (polling) load(); }, 4000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [tradeNo, revision]);
  const order = state.data?.order;
  const code = state.data?.redemption;
  const success = order?.status === 'success';
  const pending = !order || order.status === 'pending';
  let heading = '等待付款';
  let detail = '支付完成后会自动更新，也可手动检查。';
  if (success) {
    heading = order.delivery_mode === 'redemption' ? '兑换码已发放' : '充值已到账';
    detail = order.delivery_mode === 'redemption' ? '可复制兑换码自用或赠送，仅可兑换一次。' : '额度已增加到你的账户余额。';
  } else if (!pending) {
    heading = order.status === 'expired' ? '订单已过期' : '订单未完成';
    detail = '请关闭窗口后重新下单。';
  } else if (checkout?.url) {
    detail = '请扫码进入支付，付款成功后此窗口会自动更新。';
  }
  const copy = async (value, message) => { try { await copyText(value); onToast(t(message)); } catch (error) { onToast(error.message); } };
  return <Dialog title={t(pending ? '等待付款' : '订单详情')} onClose={onClose} className="store-dialog store-receipt-dialog">
    {checkout && <div className="store-payment-product"><CreditTicket compact quota={checkout.payment.quota} status={status} /><div><h3>{checkout.name}</h3><strong><PaymentPrice payment={checkout.payment} locale={locale} /></strong><span>{checkout.payment.name || checkout.payment.id}</span></div></div>}
    {pending && checkout?.url && <div className="store-qr-panel"><div className="store-qr-code"><QRCodeSVG value={checkout.url} size={224} level="M" marginSize={4} title={t('付款二维码')} /></div></div>}
    <div className={`store-receipt-state${success ? ' success' : ''}`} role="status">{success ? <CheckCircle2 size={30} /> : !checkout?.url && <Clock3 size={30} />}<h3>{t(heading)}</h3><p>{t(detail)}</p></div>
    {code && <div className="store-code-box"><label>{t(code.status === 3 ? '兑换码已使用' : code.status === 2 ? '兑换码已停用' : '你的兑换码')}</label><div><code>{code.key}</code><button className="icon-button" aria-label={t('复制兑换码')} onClick={() => copy(code.key, '兑换码已复制')}><Copy size={17} /></button></div></div>}
    <div className="store-receipt-meta"><span>{t('订单号')}</span><code>{tradeNo}</code></div>
    {!checkout && order && <dl className="store-order-summary"><div><dt>{t('创建时间')}</dt><dd>{new Date(order.create_time * 1000).toLocaleString(locale)}</dd></div>{order.credited_quota > 0 && <div><dt>{t('额度')}</dt><dd>{formatQuotaDisplay(order.credited_quota, status)}</dd></div>}</dl>}
    {state.data?.redemption_unavailable && <p className="form-error">{t('兑换码已被移除，请凭订单号联系管理员。')}</p>}
    {state.error && <p className="form-error" role="alert">{t(state.error)}</p>}
    <div className="modal-actions">{pending ? <><button className="button outline" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} />{t('检查支付结果')}</button>{checkout?.url && <button className="button primary" onClick={() => copy(checkout.url, '付款链接已复制')}><Copy size={15} />{t('复制付款链接')}</button>}</> : <button className="button primary" onClick={onClose}>{t('关闭')}</button>}</div>
  </Dialog>;
}

export default function PurchaseStore({ user, status, onBalanceChange, onToast }) {
  const { t, locale } = useLanguage();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(() => {
    const orderId = new URLSearchParams(window.location.search).get('order')?.slice(0, 255);
    return orderId ? { orderId } : null;
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    newApi.storeCatalog(controller.signal).then((data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); }).catch((error) => { if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false, error: error.message })); });
    return () => controller.abort();
  }, [revision]);
  const products = state.data?.products || [];
  const deliveryModes = storeDeliveryModes(state.data);
  let deliveryDescription = '可选直接到账 / 领取兑换码';
  if (deliveryModes.length === 1) deliveryDescription = deliveryModes[0] === 'redemption' ? '付款后领取，可自用或赠送' : '付款后自动增加账户余额';
  const destination = topUpDestination(state.data);
  const external = destination && new URL(destination).origin === window.location.origin && new URL(destination).pathname.replace(/\/$/, '') === '/console/plans' ? '' : destination;
  const closeReceipt = () => {
    setReceipt(null);
    if (new URLSearchParams(window.location.search).has('order')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('order');
      window.history.replaceState(window.history.state, '', url);
    }
  };
  return <section className="purchase-store">
    <div className="store-toolbar"><span className="store-catalog-label">{t('额度商品')}</span><div className="store-toolbar-actions">{external && <a href={external} target="_blank" rel="noopener noreferrer" className="button outline small"><ExternalLink size={14} />{t('外部充值入口')}</a>}<button className="icon-button" disabled={state.loading} aria-label={t('刷新购买页面')} onClick={() => { setSelected(null); setRevision((value) => value + 1); }}><RefreshCw size={16} /></button></div></div>
    {state.error && <p className="form-error" role="alert">{t('商品暂时无法加载，请重试。')} <button className="mp-reset" onClick={() => setRevision((value) => value + 1)}>{t('重试')}</button></p>}
    {state.loading && !state.data ? <div className="store-empty" role="status">{t('正在加载商品…')}</div> : <div className="store-products">{products.map((product, index) => {
      const payment = product.payments[0];
      const name = product.name || t('{amount} 额度包', { amount: formatQuotaDisplay(payment?.quota, status) });
      return <article className="store-product" key={product.id}><div className="store-product-art"><CreditTicket quota={payment?.quota} status={status} tone={index} /></div><div className="store-product-info"><span className="store-product-type">{t('API 调用额度')}</span><h3>{name}</h3><p>{t(deliveryDescription)}</p><div className="store-product-price"><strong><PaymentPrice payment={payment} locale={locale} /></strong><small>{t('/ 份')}</small></div><button className="button primary" disabled={!payment || state.loading || !deliveryModes.length} onClick={() => setSelected(product)}>{t('立即购买')}<ArrowRight size={18} /></button></div></article>;
    })}</div>}
    {!state.loading && !state.error && !products.length && <div className="store-empty"><CreditCard size={30} /><strong>{t('暂未开放在线购买')}</strong><p>{t(external ? '可通过上方外部充值入口购买，或使用已有兑换码。' : '管理员配置支付网关和充值档位后，商品会显示在这里。')}</p></div>}
    {selected && <PurchaseConfirm product={selected} user={user} status={status} deliveryModes={deliveryModes} onClose={() => setSelected(null)} onCreated={(checkout) => { setSelected(null); setReceipt(checkout); }} />}
    {receipt && <OrderReceipt key={receipt.orderId} tradeNo={receipt.orderId} checkout={receipt.url ? receipt : null} status={status} onClose={closeReceipt} onPaid={() => { onBalanceChange(); setRevision((value) => value + 1); }} onToast={onToast} />}
  </section>;
}
