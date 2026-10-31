import { topUpDestination } from './site-content.js';

export function storeDeliveryModes(catalog) {
  const configured = Array.isArray(catalog?.delivery_modes) ? catalog.delivery_modes : ['balance', 'redemption'];
  return ['balance', 'redemption'].filter((mode) => configured.includes(mode) && (mode !== 'redemption' || catalog?.redemption_enabled !== false));
}

export function storeOrderPayload(product, paymentId, delivery) {
  const payment = product?.payments?.find((item) => item.id === paymentId);
  if (!product?.id || !payment || !['balance', 'redemption'].includes(delivery) || !Number.isSafeInteger(payment.quota) || payment.quota <= 0) throw new Error('请选择有效商品和支付方式');
  return { product_id: product.id, payment_id: payment.id, delivery_mode: delivery, quoted_money: payment.money, quoted_currency: payment.currency, quoted_quota: payment.quota };
}

export function storeCheckout(result) {
  if (result?.success === false || result?.message === 'error') throw new Error(typeof result.data === 'string' ? result.data : result.message || '创建订单失败，请重试');
  const data = result?.data || {};
  const orderId = result?.order_id || data.order_id;
  const url = topUpDestination({ topup_link: result?.url || data.pay_link || data.checkout_url || data.payment_url });
  if (!url || typeof orderId !== 'string' || !orderId) throw new Error('支付服务未返回完整的订单信息');
  const destination = new URL(url);
  if (result.url) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('支付服务未返回完整的订单信息');
    for (const [name, value] of Object.entries(data)) {
      if (!['string', 'number'].includes(typeof value)) throw new Error('支付服务未返回完整的订单信息');
      destination.searchParams.set(name, String(value));
    }
  }
  if (new TextEncoder().encode(destination.href).length > 1800) throw new Error('支付链接过长，请联系管理员');
  return { orderId, url: destination.href };
}
