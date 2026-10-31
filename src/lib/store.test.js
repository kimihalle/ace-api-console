import test from 'node:test';
import assert from 'node:assert/strict';
import { storeOrderPayload, storeCheckout, storeDeliveryModes } from './store.js';

const payment = { id: 'epay:alipay', quota: 5000000, money: '49.00', currency: 'CNY' };
const product = { id: 'amount:10', payments: [payment, { ...payment, id: 'stripe', currency: '', quota: 6000000 }] };

test('checkout submits the selected quote and delivery mode for server verification', () => {
  assert.deepEqual(storeOrderPayload(product, 'epay:alipay', 'redemption'), { product_id: 'amount:10', payment_id: 'epay:alipay', delivery_mode: 'redemption', quoted_money: '49.00', quoted_currency: 'CNY', quoted_quota: 5000000 });
  assert.equal(storeOrderPayload(product, 'stripe', 'balance').quoted_quota, 6000000);
  for (const [item, method, mode] of [[product, 'unknown', 'balance'], [product, 'stripe', 'invalid'], [{ ...product, payments: [{ ...payment, quota: Number.MAX_SAFE_INTEGER + 1 }] }, payment.id, 'balance']]) assert.throws(() => storeOrderPayload(item, method, mode));
});

test('checkout supports gateway links and signed Epay form fields without losing the order', () => {
  const fields = { sign: 'fixture', out_trade_no: 'test-order' };
  assert.deepEqual(storeCheckout({ message: 'success', order_id: 'test-order', url: 'https://pay.example.test/submit', data: fields }), { orderId: 'test-order', url: 'https://pay.example.test/submit?sign=fixture&out_trade_no=test-order' });
  for (const key of ['pay_link', 'checkout_url', 'payment_url']) assert.equal(storeCheckout({ data: { order_id: 'order', [key]: 'https://pay.example.test/' } }).url, 'https://pay.example.test/');
  for (const response of [{ success: false, message: 'quote changed' }, { message: 'error', data: 'gateway rejected' }, { data: { pay_link: 'https://pay.example.test/' } }, { data: { order_id: 'test', pay_link: 'javascript:alert(1)' } }, { data: { order_id: 'test', pay_link: 'https://user:password@pay.example.test/' } }]) assert.throws(() => storeCheckout(response));
});

test('delivery options honor the enabled administrator mode', () => {
  assert.deepEqual(storeDeliveryModes({ delivery_modes: ['balance'] }), ['balance']);
  assert.deepEqual(storeDeliveryModes({ delivery_modes: ['redemption'] }), ['redemption']);
  assert.deepEqual(storeDeliveryModes({ delivery_modes: ['balance', 'redemption'] }), ['balance', 'redemption']);
  assert.deepEqual(storeDeliveryModes({ delivery_modes: ['redemption'], redemption_enabled: false }), []);
});

test('QR payment links preserve signed special characters and reject invalid payloads', () => {
  const fields = { sign: 'fixture', name: 'API & 额度 + 10', return_url: 'https://site.example.test/?order=test-order' };
  const checkout = storeCheckout({ message: 'success', order_id: 'test-order', url: 'https://pay.example.test/submit.php', data: fields });
  const url = new URL(checkout.url);
  for (const [key, value] of Object.entries(fields)) assert.equal(url.searchParams.get(key), value);
  assert.throws(() => storeCheckout({ order_id: 'test', url: 'https://pay.example.test/', data: { sign: {} } }));
  assert.throws(() => storeCheckout({ data: { order_id: 'test', pay_link: `https://pay.example.test/?x=${'x'.repeat(2000)}` } }));
});
