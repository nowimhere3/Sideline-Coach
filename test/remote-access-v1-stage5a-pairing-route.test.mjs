import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';
import { classifyDaemonRoute, DAEMON_ROUTE_POLICIES } from '../out/control-plane/remote-routes.js';
import { PAIRING_MAX_FAILED_ATTEMPTS } from '../out/control-plane/pairing.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pairSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'pair.html'), 'utf8');
const TRUSTED_ORIGIN = 'https://h-test.sideline.live';

const makeRemote = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra5a-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 46700 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: daemon.deviceRegistry, expectedOrigin: TRUSTED_ORIGIN });
  let counter = 0;
  const call = async (frame) => {
    const frames = [];
    await adapter.dispatch({ id: `r-${++counter}`, headers: {}, ...frame }, (f) => frames.push(f));
    const head = frames.find((f) => f.t === 'head');
    const text = frames.filter((f) => f.t === 'data').map((f) => f.chunk).join('');
    return { status: head?.status, headers: head?.headers ?? {}, text };
  };
  return { daemon, call, stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
};

test('RA5A-1. route policy: /pair and /pair.html are public GET only; nothing else became public', () => {
  assert.equal(classifyDaemonRoute('GET', '/pair'), 'public');
  assert.equal(classifyDaemonRoute('GET', '/pair.html'), 'public');
  for (const [method, p] of [['POST', '/pair'], ['PUT', '/pair'], ['DELETE', '/pair'], ['GET', '/pair/x'], ['GET', '/pairing'], ['GET', '/pair.htm'], ['GET', '/pair.html/']]) {
    assert.equal(classifyDaemonRoute(method, p), undefined, `${method} ${p} is not routable`);
  }
  const publicRoutes = DAEMON_ROUTE_POLICIES.filter((r) => r.access === 'public').flatMap((r) => r.methods.map((m) => `${m} ${String(r.path)}`)).sort();
  assert.deepEqual(publicRoutes, ['GET /', 'GET /api/health', 'GET /index.html', 'GET /pair', 'GET /pair.html', 'POST /api/pairing/exchange']);
  assert.equal(classifyDaemonRoute('POST', '/api/pairing/create'), 'local-only');
  assert.equal(classifyDaemonRoute('GET', '/api/devices'), 'local-only');
  assert.equal(classifyDaemonRoute('GET', '/api/status'), 'remote-read');
});

test('RA5A-2. remote dispatch serves the pair page to an unauthenticated browser, with strict headers, and the daemon serves it locally too', async () => {
  const r = await makeRemote();
  try {
    for (const p of ['/pair', '/pair.html']) {
      const res = await r.call({ method: 'GET', path: p, headers: { accept: 'text/html' } });
      assert.equal(res.status, 200, `${p} needs no device cookie`);
      assert.match(res.headers['content-type'], /^text\/html/);
      assert.equal(res.text, pairSource);
      assert.equal(res.headers['set-cookie'], undefined, 'serving the page grants nothing');
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      const csp = res.headers['content-security-policy'];
      const scriptHash = `'sha256-${crypto.createHash('sha256').update(/<script>([\s\S]*?)<\/script>/.exec(pairSource)[1]).digest('base64')}'`;
      const styleHash = `'sha256-${crypto.createHash('sha256').update(/<style>([\s\S]*?)<\/style>/.exec(pairSource)[1]).digest('base64')}'`;
      assert.ok(csp.includes(`script-src ${scriptHash}`) && csp.includes(`style-src ${styleHash}`), 'CSP pins the page\'s own inline code');
      assert.ok(csp.includes("default-src 'none'") && csp.includes("connect-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("form-action 'none'"));
    }
    // Only the exact GET routes are bootstrap-exempt.
    assert.equal((await r.call({ method: 'POST', path: '/pair' })).status, 401);
    assert.equal((await r.call({ method: 'GET', path: '/pair?token=abc', headers: { accept: 'text/html' } })).status, 401, '?token= is still rejected');
    assert.equal((await r.call({ method: 'GET', path: '/pair/extra' })).status, 401);
    // Directly on the daemon (local browser) the page is served too, still without granting anything.
    const local = await fetch(`http://127.0.0.1:${r.daemon.port}/pair`);
    assert.equal(local.status, 200);
    assert.equal(local.headers.get('cache-control'), 'no-store');
    assert.equal(await local.text(), pairSource);
  } finally { await r.stop(); }
});

test('RA5A-3. an unpaired browser opening the app root gets a friendly HTML 401, not raw JSON', async () => {
  const r = await makeRemote();
  try {
    const html = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    for (const [p, headers] of [['/', html], ['/index.html', html], ['/', { ...html, cookie: 'sl_dev=not-a-real-token' }]]) {
      const res = await r.call({ method: 'GET', path: p, headers });
      assert.equal(res.status, 401);
      assert.match(res.headers['content-type'], /^text\/html/);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.match(res.text, /<h1>Device Not Paired<\/h1>/);
      assert.match(res.text, /Use Send to Phone on your Sideline Coach computer to connect this device\./);
      assert.doesNotMatch(res.text, /"success"|Unauthorized/, 'no raw JSON UX');
      assert.equal(res.headers['set-cookie'], undefined);
    }
    // Non-browser callers of the root keep the JSON contract.
    for (const accept of ['application/json', '*/*', undefined]) {
      const res = await r.call({ method: 'GET', path: '/', headers: accept ? { accept } : {} });
      assert.equal(res.status, 401);
      assert.equal(res.headers['content-type'], 'application/json');
    }
  } finally { await r.stop(); }
});

test('RA5A-4. API 401 is unchanged: JSON even when the caller sends a browser Accept header', async () => {
  const r = await makeRemote();
  try {
    for (const accept of ['text/html', 'application/json', undefined]) {
      const res = await r.call({ method: 'GET', path: '/api/status', headers: accept ? { accept } : {} });
      assert.equal(res.status, 401);
      assert.equal(res.headers['content-type'], 'application/json');
      assert.deepEqual(JSON.parse(res.text), { success: false, message: 'Unauthorized' });
    }
    assert.equal((await r.call({ method: 'GET', path: '/api/events', headers: { accept: 'text/html' } })).headers['content-type'], 'application/json');
    assert.equal((await r.call({ method: 'GET', path: '/api/devices', headers: { accept: 'text/html' } })).status, 401);
  } finally { await r.stop(); }
});

test('RA5A-5. pairing exchange semantics are unchanged (secret, fallback code, single use, generic failures, local-only creation)', async () => {
  const r = await makeRemote();
  try {
    const json = { 'content-type': 'application/json' };
    const exchange = (body) => r.call({ method: 'POST', path: '/api/pairing/exchange', headers: json, body: JSON.stringify(body) });
    // Secret path.
    const p1 = r.daemon.pairingStore.createPairing();
    const ok = await exchange({ secret: p1.secret, label: 'Phone' });
    assert.equal(ok.status, 200);
    assert.match(ok.headers['set-cookie'], /^sl_dev=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/);
    assert.deepEqual(Object.keys(JSON.parse(ok.text)).sort(), ['deviceId', 'success'], 'the raw token is never in the body');
    assert.doesNotMatch(ok.text, /sl_dev|token/i);
    const again = await exchange({ secret: p1.secret });
    assert.equal(again.status, 401, 'single use');
    // Fallback code path (lower case / spacing tolerated by the existing normaliser).
    const p2 = r.daemon.pairingStore.createPairing();
    assert.match(p2.code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    const byCode = await exchange({ code: p2.code.toLowerCase() });
    assert.equal(byCode.status, 200);
    assert.match(byCode.headers['set-cookie'], /^sl_dev=/);
    // Failures are generic and indistinguishable: unknown, reused, expired-like and burned all look the same.
    const unknown = await exchange({ secret: 'nope' });
    const p3 = r.daemon.pairingStore.createPairing();
    let burned;
    for (let i = 0; i < PAIRING_MAX_FAILED_ATTEMPTS + 1; i += 1) burned = await exchange({ code: 'WRNG-CODE' });
    const afterBurn = await exchange({ secret: p3.secret });
    for (const res of [unknown, again, burned, afterBurn]) {
      assert.equal(res.status, 401);
      assert.equal(res.headers['set-cookie'], undefined);
      assert.deepEqual(JSON.parse(res.text), { success: false, message: 'Pairing could not be verified.' });
    }
    // Creation and device management stay local-only.
    assert.equal((await r.call({ method: 'POST', path: '/api/pairing/create' })).status, 401);
    const cookie = ok.headers['set-cookie'].split(';', 1)[0];
    const asDevice = { cookie, 'x-sideline-action': '1', origin: TRUSTED_ORIGIN, 'content-type': 'application/json' };
    assert.equal((await r.call({ method: 'POST', path: '/api/pairing/create', headers: asDevice })).status, 403);
    assert.equal((await r.call({ method: 'GET', path: '/api/devices', headers: { cookie } })).status, 403);
    assert.equal((await r.call({ method: 'GET', path: '/api/status', headers: { cookie } })).status, 200, 'the fresh device works');
  } finally { await r.stop(); }
});

test('RA5A-6. pair.html static safety: no storage, no external loads, no query-secret construction, no logging of pairing material', () => {
  for (const banned of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console.', 'XMLHttpRequest', 'sendBeacon', 'eval(', 'document.write', 'innerHTML']) {
    assert.ok(!pairSource.includes(banned), `must not contain ${banned}`);
  }
  assert.doesNotMatch(pairSource, /<script[^>]*\ssrc=/i, 'no external scripts');
  assert.doesNotMatch(pairSource, /<link\b|@import|<img\b|<iframe\b|<object\b|<embed\b/i, 'no external assets');
  assert.doesNotMatch(pairSource, /https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}/i, 'no absolute or protocol-relative URLs');
  assert.doesNotMatch(pairSource, /analytics|gtag|googletagmanager|segment|mixpanel|sentry|hotjar|fbq\(/i);
  assert.doesNotMatch(pairSource, /location\.search|\?secret|\?code|\?token|'\?'|"\?"|\+\s*'&|encodeURIComponent/, 'the fragment is never moved into a query string');
  assert.doesNotMatch(pairSource, /setRequestHeader|Authorization|headers:\s*\{[^}]*(secret|captured|code)/i, 'never placed in a header');
  assert.match(pairSource, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  const inputFont = /input\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(pairSource);
  assert.ok(inputFont && Number(inputFont[1]) >= 1, 'text input is at least 16px');
  assert.match(pairSource, /window\.location\.replace\('\/'\)/);
  assert.match(pairSource, /fetch\('\/api\/pairing\/exchange'/);
  assert.match(pairSource, /body: JSON\.stringify\(payload\)/);
  // Scrub happens before the exchange is started.
  assert.ok(pairSource.indexOf("window.history.replaceState(null, '', '/pair')") < pairSource.indexOf('exchange({ secret: captured })'));
  assert.ok(pairSource.length < 20_000, 'small, fast page');
});

/** Runs the real page script in a sandbox with stubbed browser APIs and records what the browser would do. */
const runPage = async ({ hash = '', respond = () => ({ ok: true, status: 200 }) } = {}) => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(pairSource)[1];
  const events = [];
  const elements = {};
  const el = (id) => (elements[id] ??= { id, hidden: true, value: '', textContent: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, focus() {} });
  const fetches = [];
  const window = {
    location: { hash, replace: (url) => events.push(['location.replace', url]) },
    history: { replaceState: (...args) => { events.push(['replaceState', args]); window.location.hash = ''; } }
  };
  const context = {
    window, document: { getElementById: el },
    fetch: (url, init) => { fetches.push({ url, init }); events.push(['fetch', url]); return Promise.resolve(respond({ url, init })); },
    AbortController, setTimeout, clearTimeout, JSON, String, Object
  };
  vm.runInNewContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { events, fetches, el, visible: () => Object.keys(elements).filter((k) => ['working', 'entry', 'failed', 'network'].includes(k) && elements[k].hidden === false) };
};

test('RA5A-7. browser flow (page script in a sandbox): capture hash, scrub URL BEFORE the exchange, POST JSON, replace to /', async () => {
  const SECRET = 'SECRET-fragment-value_123';
  const page = await runPage({ hash: `#${SECRET}` });
  assert.deepEqual(page.events[0], ['replaceState', [null, '', '/pair']], 'history scrubbed first');
  assert.equal(page.events[1][0], 'fetch');
  assert.equal(page.fetches.length, 1);
  const { url, init } = page.fetches[0];
  assert.equal(url, '/api/pairing/exchange');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(init.body), { secret: SECRET });
  assert.ok(!url.includes(SECRET), 'never in the request URL');
  assert.ok(!JSON.stringify(init.headers).includes(SECRET), 'never in a header');
  assert.deepEqual(page.events.at(-1), ['location.replace', '/']);
  assert.equal(JSON.stringify(page.events.filter((e) => e[0] !== 'fetch')).includes(SECRET), false, 'the secret is not in the scrubbed URL or redirect');
});

test('RA5A-8. browser flow failures are generic (no oracle), and fallback code entry uses the same exchange contract', async () => {
  // Any non-OK, non-429 status looks identical to the visitor.
  const views = [];
  for (const status of [401, 403, 404, 410, 500]) {
    const page = await runPage({ hash: '#abc', respond: () => ({ ok: false, status }) });
    views.push(page.visible().join(','));
    assert.equal(page.events.some((e) => e[0] === 'location.replace'), false, 'no navigation on failure');
    assert.equal(page.el('failed').hidden, false);
  }
  assert.deepEqual([...new Set(views)], ['failed']);
  assert.match(pairSource, /This connection link is no longer valid\./);
  assert.match(pairSource, /Create a new Send to Phone connection from Sideline Coach\./);
  assert.doesNotMatch(pairSource, /expired|already used|burned|attempts remaining|too many wrong/i, 'no pairing oracle copy');

  // No fragment: fallback form, no request until submitted, same exchange endpoint, code uppercased.
  const page = await runPage({ hash: '' });
  assert.deepEqual(page.visible(), ['entry']);
  assert.equal(page.fetches.length, 0);
  assert.equal(page.events.some((e) => e[0] === 'replaceState'), false);
  page.el('code').value = ' abcd-efgh ';
  page.el('codeForm').handlers.submit({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(page.fetches.length, 1);
  assert.equal(page.fetches[0].url, '/api/pairing/exchange');
  assert.deepEqual(JSON.parse(page.fetches[0].init.body), { code: 'ABCD-EFGH' });
  assert.deepEqual(page.events.at(-1), ['location.replace', '/']);
  // Network failure shows a retryable transport message, not a pairing verdict.
  const offline = await runPage({ hash: '#abc', respond: () => Promise.reject(new Error('offline')) });
  assert.deepEqual(offline.visible(), ['network']);
});
