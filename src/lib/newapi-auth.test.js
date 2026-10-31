import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { login, verifyLoginCode, register, sendRegistrationCode, sendPasswordResetEmail, confirmPasswordReset, request, newApi, clearAccessToken, createOAuthLogin, completeOAuthLogin, beginPasskeyLogin, finishPasskeyLogin } from './newapi.js';
import { enabledLoginProviders, oauthAuthorizationURL, rememberOAuthLogin, consumeOAuthLogin, OAUTH_LOGIN_KEY, passkeyRequestOptions, passkeyAssertion } from './auth-methods.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearAccessToken(); });
const response = (data) => new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });

test('email APIs encode the address and security token and never attach an authenticated bearer', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return response({}); };
  await sendRegistrationCode('  customer+api@example.test  ', 'single&use=token');
  await sendPasswordResetEmail('customer+api@example.test', 'another-token');
  for (const { url, init } of calls) {
    const parsed = new URL(url, 'https://example.test');
    assert.equal(parsed.searchParams.get('email'), 'customer+api@example.test');
    assert.equal(init.headers.get('Authorization'), null);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'include');
  }
  assert.equal(new URL(calls[0].url, 'https://example.test').searchParams.get('turnstile'), 'single&use=token');
});

test('registration forwards server-owned email verification without inventing a local code', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url, 'https://example.test').pathname, '/api/user/register');
    assert.deepEqual(JSON.parse(init.body), { username: 'fixture', email: 'fixture@example.test', password: 'fixture-password', verification_code: '123456', aff_code: 'invite', turnstile: '' });
    return response({});
  };
  await register({ username: 'fixture', email: 'fixture@example.test', password: 'fixture-password', verification_code: '123456', aff_code: 'invite' });
});

test('password recovery preserves generic responses and confirms with an explicit POST', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('/api/reset_password')) return response({});
    assert.equal(url, '/api/user/reset');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { email: 'fixture@example.test', token: 'one-use-fixture' });
    return response('generated-fixture-password');
  };
  assert.deepEqual(await sendPasswordResetEmail('unknown@example.test'), {});
  assert.equal(calls.length, 1);
  assert.equal(await confirmPasswordReset('fixture@example.test', 'one-use-fixture'), 'generated-fixture-password');
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Password reset link is invalid or has expired' }), { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(confirmPasswordReset('fixture@example.test', 'expired'), /invalid or has expired/);
});

test('login challenges do not grant authentication before server verification succeeds', async () => {
  const challenge = { require_verification: true, flow_token: 'fixture-flow', expires_at: 9999999999, methods: [{ method: '2fa', available: true }] };
  globalThis.fetch = async (url, init) => {
    if (url === '/api/status') { assert.equal(init.cache, 'no-store'); return response({}); }
    if (url.startsWith('/api/user/login?')) return response(challenge);
    if (url === '/api/user/login/verify') {
      assert.deepEqual(JSON.parse(init.body), { flow_token: 'fixture-flow', method: '2fa', code: '654321' });
      return response({ access_token: 'verified-fixture', user: { id: 99999 } });
    }
    assert.equal(init.headers.get('Authorization'), url === '/api/before' ? null : 'Bearer verified-fixture');
    return response({});
  };
  const pending = await login({ username: 'fixture', password: 'fixture-password' });
  assert.equal(pending.requiresVerification, true);
  assert.equal(pending.challenge.flow_token, 'fixture-flow');
  await request('/before');
  assert.deepEqual(await verifyLoginCode('fixture-flow', '654321'), { user: { id: 99999 } });
  await request('/after');
  await newApi.publicStatus();
});

test('alternative sign-in methods follow enabled and configured backend providers', () => {
  assert.deepEqual(enabledLoginProviders({}), []);
  assert.deepEqual(enabledLoginProviders({ github_client_id: 'disabled', github_oauth: false, oidc_enabled: true, telegram_oauth: true }), []);
  const providers = enabledLoginProviders({ github_oauth: true, github_client_id: 'client+id', oidc_enabled: true, oidc_client_id: 'oidc-client', oidc_authorization_endpoint: 'https://identity.example.test/authorize?existing=1', oidc_display_name: 'Company login', passkey_login: true, custom_oauth_providers: [{ slug: 'company', name: 'Company', client_id: 'custom-client', authorization_endpoint: 'https://custom.example.test/authorize', scopes: 'openid email' }] });
  assert.deepEqual(providers.map((provider) => provider.slug), ['passkey', 'github', 'oidc', 'company']);
  const url = new URL(oauthAuthorizationURL(providers.find((provider) => provider.slug === 'oidc'), { flow_token: 'state&fixture' }, 'https://console.example.test'));
  assert.equal(url.searchParams.get('state'), 'state&fixture');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://console.example.test/oauth/oidc');
  assert.equal(url.searchParams.get('scope'), 'openid profile email');
  assert.equal(url.searchParams.get('existing'), '1');
  assert.throws(() => oauthAuthorizationURL({ slug: 'custom', endpoint: 'javascript:alert(1)' }, { flow_token: 'fixture' }, 'https://console.example.test'), /无效|invalid/);
});

test('OAuth callbacks require the same browser transaction and expire once, with safe return paths', async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  await rememberOAuthLogin(storage, 'github', { flow_token: 'secret-state-fixture', expires_at: Date.now() / 1000 + 60 }, '/console/plans');
  assert.ok(!values.get(OAUTH_LOGIN_KEY).includes('secret-state-fixture'));
  assert.equal(await consumeOAuthLogin(storage, 'github', 'secret-state-fixture'), '/console/plans');
  await assert.rejects(consumeOAuthLogin(storage, 'github', 'secret-state-fixture'));
  for (const [provider, state] of [['discord', 'matching-fixture'], ['github', 'mismatched-fixture']]) {
    await rememberOAuthLogin(storage, 'github', { flow_token: 'matching-fixture' }, '//external.example.test');
    await assert.rejects(consumeOAuthLogin(storage, provider, state));
  }
  await rememberOAuthLogin(storage, 'github', { flow_token: 'expired-fixture', expires_at: 1 }, '/console/plans');
  await assert.rejects(consumeOAuthLogin(storage, 'github', 'expired-fixture'));
  await rememberOAuthLogin(storage, 'github', { flow_token: 'matching-fixture' }, 'https://external.example.test');
  assert.equal(await consumeOAuthLogin(storage, 'github', 'matching-fixture'), '/console/dashboard');
});

test('OAuth and passkey APIs preserve server challenge verification before granting a session', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === '/api/oauth/state') return response({ flow_token: 'oauth-fixture', expires_at: 9999999999 });
    if (url.startsWith('/api/oauth/github?')) return response({ require_verification: true, flow_token: 'login-fixture', expires_at: 9999999999, methods: [{ method: 'passkey', available: true }] });
    if (url.endsWith('/begin')) return response({ flow_token: 'passkey-fixture', options: { publicKey: { challenge: 'AQID', rpId: 'example.test' } } });
    if (url.endsWith('/finish')) return response({ access_token: 'verified-passkey-fixture', user: { id: 99999 } });
    assert.equal(init.headers.get('Authorization'), url === '/api/before' ? null : 'Bearer verified-passkey-fixture');
    return response({});
  };
  await createOAuthLogin('github', 'invitation');
  assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'github', intent: 'login', aff: 'invitation' });
  assert.equal((await completeOAuthLogin('github', 'code+fixture', 'oauth-fixture')).requiresVerification, true);
  assert.equal(new URL(calls[1].url, 'https://example.test').searchParams.get('code'), 'code+fixture');
  await request('/before');
  await beginPasskeyLogin({ flowToken: 'login-fixture', rpID: 'example.test' });
  assert.equal(calls.at(-1).url, '/api/user/login/passkey/begin');
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { flow_token: 'login-fixture', rp_id: 'example.test' });
  await finishPasskeyLogin({ flowToken: 'login-fixture', passkeyFlowToken: 'passkey-fixture', credential: { id: 'credential-fixture' } });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { flow_token: 'login-fixture', passkey_flow_token: 'passkey-fixture', credential: { id: 'credential-fixture' } });
  await request('/after');
  const publicKey = passkeyRequestOptions({ publicKey: { challenge: 'AQID', allowCredentials: [{ type: 'public-key', id: 'BAUG' }] } });
  assert.deepEqual([...publicKey.challenge], [1, 2, 3]);
  assert.deepEqual([...publicKey.allowCredentials[0].id], [4, 5, 6]);
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const assertion = passkeyAssertion({ id: 'fixture', type: 'public-key', rawId: bytes, response: { authenticatorData: bytes, clientDataJSON: bytes, signature: bytes, userHandle: null } });
  assert.equal(assertion.response.signature, 'AQID');
  assert.equal(assertion.response.userHandle, null);
});
