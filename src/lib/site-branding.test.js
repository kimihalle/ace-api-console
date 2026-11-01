import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteTitle, applySiteBranding, DEFAULT_FAVICON } from './site-branding.js';
import { setLanguage } from './i18n.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('cold startup never paints a hardcoded brand while status is pending', () => {
  assert.equal(websiteTitle(null, '/'), '');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title><\/title>/);
  assert.doesNotMatch(html, /模型工作台/);
});

test('head bootstrap restores cached title and independent favicon before React starts', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script id="site-branding-bootstrap">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'first paint must restore branding before loading the application');
  const icon = { href: '' };
  const doc = { title: '', querySelector: () => icon };
  runInNewContext(script, { document: doc, localStorage: { getItem: () => JSON.stringify({ system_name: '25code', logo: '/wide.svg', favicon: '/tab.svg' }) } });
  assert.equal(doc.title, '25code');
  assert.equal(icon.href, '/tab.svg');
  assert.doesNotThrow(() => runInNewContext(script, { document: doc, get localStorage() { throw Error('disabled'); } }));
});

test('branding cache only persists public branding, tolerates broken storage, and respects clearing', async () => {
  const { cacheSiteBranding, readCachedBranding } = await import('./site-branding.js');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  cacheSiteBranding({ system_name: '25code', logo: '/wide.svg', favicon: '/tab.svg', register_enabled: true, access_token: 'never-cache' }, storage);
  assert.deepEqual(readCachedBranding(storage), { system_name: '25code', logo: '/wide.svg', favicon: '/tab.svg' });
  cacheSiteBranding({ system_name: 'ACE', logo: '', favicon: '' }, storage);
  assert.deepEqual(readCachedBranding(storage), { system_name: 'ACE', logo: '', favicon: '' });
  assert.equal(readCachedBranding({ getItem: () => '{broken' }), null);
  assert.equal(readCachedBranding({ getItem: () => '[]' }), null);
  assert.doesNotThrow(() => cacheSiteBranding({}, { setItem() { throw Error('disabled'); } }));
});

test('every console and account page title includes the configured website name', () => {
  for (const page of ['dashboard', 'redeem', 'usage', 'bills', 'keys', 'models', 'pelican', 'plans']) {
    assert.ok(websiteTitle({ system_name: '25code' }, `/console/${page}`).endsWith(' - 25code'));
  }
  assert.equal(websiteTitle({ system_name: '25code' }, '/'), '25code');
  assert.equal(websiteTitle({ system_name: '25code' }, '/login'), '登录 - 25code');
  assert.equal(websiteTitle({ system_name: '25code' }, '/forgot-password'), '忘记密码 - 25code');
  assert.equal(websiteTitle({ system_name: '25code' }, '/user/reset'), '重置密码 - 25code');
  assert.equal(websiteTitle(null, '/'), '');
  assert.equal(websiteTitle({}, '/'), '模型工作台');
  setLanguage('en');
  try { assert.equal(websiteTitle({ system_name: '25code' }, '/console/dashboard'), 'Dashboard - 25code'); }
  finally { setLanguage('zh'); }
});

test('changing and clearing the favicon never substitutes the custom logo', () => {
  const links = [];
  const doc = {
    title: '', querySelectorAll: () => [...links],
    createElement: () => ({ getAttribute(key) { return this[key]; }, remove() { links.splice(links.indexOf(this), 1); } }),
    head: { appendChild: (link) => links.push(link) },
  };
  applySiteBranding({ system_name: '25code', logo: '/wide.svg', favicon: '/tab.svg' }, '/console/models', doc);
  assert.equal(doc.title, '模型广场 - 25code');
  assert.equal(links[0].href, '/tab.svg');
  applySiteBranding({ system_name: 'ACE', logo: '/wide.svg', favicon: '' }, '/console/plans', doc);
  assert.equal(doc.title, '购买订阅 - ACE');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, DEFAULT_FAVICON);
});
