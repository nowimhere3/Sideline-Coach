/**
 * R13 S5 — RemotePreviewGateway core. Proves the S57.45 §E/§F security contract with a real
 * StaticPreviewServer, a real ReferenceRelay + RelayClient chain, and adversarial upstreams.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ReferenceRelay } from '../out/relay-build/relay/reference-relay.js';
import { RelayClient } from '../out/control-plane/relay-client.js';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { DeviceRegistry } from '../out/control-plane/device-registry.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { classifyDaemonRoute } from '../out/control-plane/remote-routes.js';
import { StaticPreviewServer } from '../out/static-preview.js';
import {
  RemotePreviewGateway, derivePreviewTag, PREVIEW_COOKIE, PREVIEW_ENTER_PATH, MAX_PREVIEW_ASSET_BYTES,
  PREVIEW_TICKET_TTL_MS, PREVIEW_GRANT_IDLE_MS, PREVIEW_GRANT_ABSOLUTE_MS, PREVIEW_GRANT_CAP, PREVIEW_TARGET_TTL_MS
} from '../out/control-plane/remote-preview-gateway.js';

const HOST = 'abcdefghijklmnopqrst'.replace(/[^a-z2-7]/g, 'a');
const GAME = 'game_s5';
const DOMAIN = 'localhost';
const TAG = derivePreviewTag(HOST, GAME);
const INSTANCE_HEADER = 'x-sideline-preview-instance';

function tmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Binary fixture covering every byte value (PNG-like header first). */
const binaryFixture = () => {
  const body = Buffer.alloc(300 * 1024);
  for (let i = 0; i < body.length; i++) body[i] = i % 256;
  Buffer.from('89504e470d0a1a0a', 'hex').copy(body);
  return body;
};

async function rig(t, { gameFiles = true } = {}) {
  const dir = tmp(t, 'r13-s5-');
  const root = path.join(dir, 'game');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><h1>GS3 💥</h1>');
  fs.writeFileSync(path.join(root, 'sub', 'page.html'), '<p>sub</p>');
  fs.writeFileSync(path.join(root, 'logo.png'), binaryFixture());
  fs.writeFileSync(path.join(root, 'big.bin'), Buffer.alloc(MAX_PREVIEW_ASSET_BYTES + 1, 7));
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=never');
  const server = new StaticPreviewServer();
  t.after(() => server.dispose());
  if (gameFiles) await server.urlFor(GAME, root, 'index.html');
  const registry = new DeviceRegistry(path.join(dir, 'devices.json'));
  const phone = registry.createDevice('Phone');
  const state = {
    now: 1_000_000,
    known: true,
    status: 'connected',
    session: { instanceId: 'stadium-session-1', features: ['game.preview.v1', 'game.preview.remote.v1'] },
    admission: { state: 'allow' },
    tunnel: true,
    rpcCalls: 0,
    upstream: [],
    touches: 0
  };
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: HOST, relayDomain: DOMAIN }),
    tunnelConnected: () => state.tunnel,
    deviceLive: (id) => registry.isLive(id),
    admission: () => state.admission,
    touch: () => { state.touches++; },
    knownGame: () => state.known,
    session: () => ({ status: state.status, session: state.status === 'connected' ? state.session : undefined }),
    rpc: async (_session, method, params) => {
      assert.equal(method, 'game.preview.remoteTarget');
      state.rpcCalls++;
      return server.activePort === undefined
        ? { success: true, gameId: params.gameId, available: false, reason: 'not-running' }
        : { success: true, gameId: params.gameId, available: true, port: server.activePort, instanceId: server.activeInstanceId };
    },
    now: () => state.now,
    httpRequest: (options) => { state.upstream.push(options); return http.request(options); }
  });
  return { dir, root, server, registry, phone, state, gateway };
}

/** A fake adapter response. `write` honours backpressure only when `blocked` is set. */
function fakeRes() {
  const res = new EventEmitter();
  Object.assign(res, {
    status: undefined, headers: {}, chunks: [], ended: false, blocked: false, destroyed: false,
    writeHead(status, headers) { res.status = status; res.headers = headers ?? {}; },
    write(chunk) { res.chunks.push(Buffer.from(chunk)); return !res.blocked; },
    end(chunk) { if (chunk !== undefined) res.chunks.push(Buffer.from(chunk)); res.ended = true; },
    destroy() { res.destroyed = true; res.emit('close'); },
  });
  Object.defineProperty(res, 'body', { get: () => Buffer.concat(res.chunks) });
  return res;
}

const call = async (gateway, { path: p = '/index.html', method = 'GET', cookie, headers = {}, tag = TAG, res = fakeRes() } = {}) => {
  await gateway.handle({ method, url: p, headers }, res, { previewTag: tag, ...(cookie !== undefined ? { cookie } : {}) });
  return res;
};

/** mint → enter → cookie header for follow-up requests. */
async function enterGrant(r, { deviceId = r.phone.deviceId, pagePath = 'index.html' } = {}) {
  const minted = await r.gateway.mint({ deviceId, gameId: GAME, pagePath });
  assert.equal(minted.ok, true);
  const url = new URL(minted.frameUrl);
  const enter = await call(r.gateway, { path: `${url.pathname}${url.search}` });
  assert.equal(enter.status, 303);
  const setCookie = enter.headers['set-cookie'];
  const cookie = setCookie.split(';', 1)[0];
  return { minted, enter, cookie };
}

// ------------------------------------------------------------------------------------------------

test('S5-1. mint → single-use ticket → __Host-sl_pv → static asset; fixed headers, nothing upstream crosses', async (t) => {
  const r = await rig(t);
  const { minted, enter, cookie } = await enterGrant(r);
  assert.match(minted.frameUrl, new RegExp(`^https://p-${HOST}-${TAG}\\.localhost/__sideline/preview/enter\\?t=[A-Za-z0-9_-]{43}$`));
  assert.equal(minted.openUrl, `https://p-${HOST}-${TAG}.localhost/index.html`);
  assert.equal(minted.expiresAt, r.state.now + PREVIEW_TICKET_TTL_MS);
  assert.equal(enter.headers.location, '/index.html');
  assert.match(enter.headers['set-cookie'], /^__Host-sl_pv=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/$/);
  assert.doesNotMatch(enter.headers['set-cookie'], /Domain|Max-Age|Expires/i, 'host-only session cookie');
  assert.equal(cookie.startsWith(`${PREVIEW_COOKIE}=`), true);

  const page = await call(r.gateway, { cookie });
  assert.equal(page.status, 200);
  assert.equal(page.body.toString('utf8'), '<!doctype html><h1>GS3 💥</h1>');
  assert.equal(page.headers['set-cookie'], undefined, 'Set-Cookie appears only on enter');
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal(page.headers['content-security-policy'], `frame-ancestors 'self' https://h-${HOST}.localhost`);
  assert.equal(page.headers[INSTANCE_HEADER], undefined, 'the instance proof is consumed, not forwarded');
  assert.ok(r.state.touches >= 1, 'Remote Minutes are metered for preview traffic');
  const head = await call(r.gateway, { cookie, method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal((await call(r.gateway, { cookie, path: '/sub/page.html' })).status, 200);
  assert.equal((await call(r.gateway, { cookie, path: '/.env' })).status, 403, 'static server containment stays authoritative');
  assert.equal((await call(r.gateway, { cookie, path: '/nope.js' })).status, 404);
});

test('S5-2. ticket is single-use, expires after 60 s, and is bound to its origin tag', async (t) => {
  const r = await rig(t);
  const first = await r.gateway.mint({ deviceId: r.phone.deviceId, gameId: GAME, pagePath: 'index.html' });
  const ticketPath = `${new URL(first.frameUrl).pathname}${new URL(first.frameUrl).search}`;
  assert.equal((await call(r.gateway, { path: ticketPath })).status, 303);
  const replay = await call(r.gateway, { path: ticketPath });
  assert.equal(replay.status, 401, 'replay refused');
  assert.equal(replay.headers['set-cookie'], undefined);

  const second = await r.gateway.mint({ deviceId: r.phone.deviceId, gameId: GAME, pagePath: 'index.html' });
  const secondPath = `${new URL(second.frameUrl).pathname}${new URL(second.frameUrl).search}`;
  r.state.now += PREVIEW_TICKET_TTL_MS + 1;
  assert.equal((await call(r.gateway, { path: secondPath })).status, 401, 'expired ticket');

  const third = await r.gateway.mint({ deviceId: r.phone.deviceId, gameId: GAME, pagePath: 'index.html' });
  const thirdPath = `${new URL(third.frameUrl).pathname}${new URL(third.frameUrl).search}`;
  assert.equal((await call(r.gateway, { path: thirdPath, tag: 'aaaaaaaaaa' })).status, 401, 'wrong origin tag burns the ticket');
  assert.equal((await call(r.gateway, { path: thirdPath })).status, 401, 'and it cannot be retried');
  for (const bad of [PREVIEW_ENTER_PATH, `${PREVIEW_ENTER_PATH}?t=`, `${PREVIEW_ENTER_PATH}?t=${'x'.repeat(500)}`]) {
    assert.equal((await call(r.gateway, { path: bad })).status, 401, bad);
  }
});

test('S5-3. a grant binds device, Game tag, Stadium session and static instance', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie })).status, 200);
  assert.equal((await call(r.gateway, { cookie, tag: 'aaaaaaaaaa' })).status, 401, 'a different Game origin cannot use the grant');
  assert.equal((await call(r.gateway)).status, 401, 'no cookie');
  assert.equal((await call(r.gateway, { cookie: `${PREVIEW_COOKIE}=forged` })).status, 401, 'forged secret');
  assert.equal((await call(r.gateway, { cookie: 'sl_dev=whatever; __Host-sl_dev=whatever' })).status, 401, 'device credentials are not preview credentials');

  // Stadium offline is transient (503); a different Stadium session is a different authority (410, grant dropped).
  r.state.status = 'offline';
  assert.equal((await call(r.gateway, { cookie })).status, 503);
  r.state.status = 'connected';
  assert.equal((await call(r.gateway, { cookie })).status, 200, 'grant survives a transient outage');
  r.state.session = { ...r.state.session, instanceId: 'stadium-session-2' };
  assert.equal((await call(r.gateway, { cookie })).status, 410);
  r.state.session = { ...r.state.session, instanceId: 'stadium-session-1' };
  assert.equal((await call(r.gateway, { cookie })).status, 401, 'never silently rebound');
});

test('S5-4. StaticPreviewServer restart invalidates old authority and is never rebound', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie })).status, 200);
  await r.server.dispose();
  await r.server.urlFor(GAME, r.root, 'index.html'); // new listener: new port, new instance id
  r.state.now += PREVIEW_TARGET_TTL_MS + 1; // past the target cache
  const stale = await call(r.gateway, { cookie });
  assert.equal(stale.status, 410);
  assert.doesNotMatch(stale.body.toString(), /127\.0\.0\.1|:\d{2,5}\b/, 'no port leaks into the ended page');
  assert.equal((await call(r.gateway, { cookie })).status, 401, 'the old grant is gone; Dad must tap Preview Work again');
  const again = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie: again.cookie })).status, 200, 'a fresh grant binds the new instance');
  // Server disposed entirely: nothing is started remotely.
  await r.server.dispose();
  r.state.now += PREVIEW_TARGET_TTL_MS + 1;
  assert.equal((await call(r.gateway, { cookie: again.cookie })).status, 410);
  assert.equal(r.server.activePort, undefined, 'the gateway never starts a Preview');
});

test('S5-5. a cached target never outlives a stale instance: the echoed instance must match before any byte moves', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie })).status, 200);
  const rpcBefore = r.state.rpcCalls;
  // Replace the server inside the 5 s cache window: the cached port now belongs to a new instance.
  const oldPort = r.server.activePort;
  await r.server.dispose();
  // Stand an impostor on any port: a server that answers without the expected instance proof.
  const impostor = http.createServer((_req, res) => { res.setHeader(INSTANCE_HEADER, 'some-other-instance-id'); res.end('IMPOSTOR'); });
  await new Promise((resolve) => impostor.listen(oldPort, '127.0.0.1', resolve)).catch(() => undefined);
  t.after(() => impostor.close());
  const out = await call(r.gateway, { cookie });
  assert.equal(r.state.rpcCalls, rpcBefore, 'served from the 5 s cache');
  assert.equal(out.status, 502);
  assert.doesNotMatch(out.body.toString(), /IMPOSTOR/, 'nothing from an unproven server is forwarded');
});

test('S5-6. a newer grant for the same device+Game revokes the old one; other devices are independent', async (t) => {
  const r = await rig(t);
  const tablet = r.registry.createDevice('Tablet');
  const a = await enterGrant(r);
  const other = await enterGrant(r, { deviceId: tablet.deviceId });
  const b = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie: a.cookie })).status, 401, 'old grant revoked');
  assert.equal((await call(r.gateway, { cookie: b.cookie })).status, 200);
  assert.equal((await call(r.gateway, { cookie: other.cookie })).status, 200, 'another device keeps its grant');
});

test('S5-7. a revoked or idle-expired device loses Preview on the next request', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  assert.equal((await call(r.gateway, { cookie })).status, 200);
  assert.equal(r.registry.revoke(r.phone.deviceId), true);
  assert.equal((await call(r.gateway, { cookie })).status, 401);
  // A revoked device also cannot complete a ticket it was already handed.
  const tablet = r.registry.createDevice('Tablet');
  const minted = await r.gateway.mint({ deviceId: tablet.deviceId, gameId: GAME, pagePath: 'index.html' });
  r.registry.revoke(tablet.deviceId);
  const url = new URL(minted.frameUrl);
  assert.equal((await call(r.gateway, { path: `${url.pathname}${url.search}` })).status, 401);
  assert.deepEqual(await r.gateway.mint({ deviceId: tablet.deviceId, gameId: GAME, pagePath: 'index.html' }), { ok: false });
});

test('S5-8. grants expire after 30 min idle and 8 h absolute; revokeAll clears everything', async (t) => {
  const r = await rig(t);
  const idle = await enterGrant(r);
  r.state.now += PREVIEW_GRANT_IDLE_MS - 1;
  assert.equal((await call(r.gateway, { cookie: idle.cookie })).status, 200, 'activity slides the idle window');
  r.state.now += PREVIEW_GRANT_IDLE_MS + 1;
  assert.equal((await call(r.gateway, { cookie: idle.cookie })).status, 401, 'idle expiry');

  const long = await enterGrant(r);
  const step = PREVIEW_GRANT_IDLE_MS - 60_000;
  let elapsed = 0;
  while (elapsed + step < PREVIEW_GRANT_ABSOLUTE_MS) {
    r.state.now += step;
    elapsed += step;
    assert.equal((await call(r.gateway, { cookie: long.cookie })).status, 200);
  }
  r.state.now += PREVIEW_GRANT_ABSOLUTE_MS - elapsed + 1;
  assert.equal((await call(r.gateway, { cookie: long.cookie })).status, 401, 'absolute expiry even while active');

  const last = await enterGrant(r);
  r.gateway.revokeAll();
  assert.equal((await call(r.gateway, { cookie: last.cookie })).status, 401);
  assert.equal(r.gateway.stats.grants, 0);
  assert.equal(r.gateway.stats.tickets, 0);
});

test('S5-9. the 32-grant cap evicts the least-recently-used grant', async (t) => {
  const r = await rig(t);
  const first = await enterGrant(r);
  r.state.now += 1000;
  for (let i = 0; i < PREVIEW_GRANT_CAP; i++) {
    const device = r.registry.createDevice(`d${i}`);
    await r.gateway.mint({ deviceId: device.deviceId, gameId: GAME, pagePath: 'index.html' });
    r.state.now += 10;
  }
  assert.equal(r.gateway.stats.grants, PREVIEW_GRANT_CAP);
  assert.equal((await call(r.gateway, { cookie: first.cookie })).status, 401);
});

test('S5-10. unsupported or non-static targets cannot mint; nothing is ever started', async (t) => {
  const r = await rig(t);
  const mint = () => r.gateway.mint({ deviceId: r.phone.deviceId, gameId: GAME, pagePath: 'index.html' });
  r.state.session = { instanceId: 's', features: ['game.preview.v1'] };
  assert.deepEqual(await mint(), { ok: false }, 'Stadium without game.preview.remote.v1 (not co-located)');
  r.state.session = { instanceId: 's', features: ['game.preview.remote.v1'] };
  await r.server.dispose();
  assert.deepEqual(await mint(), { ok: false }, 'no running static server');
  assert.equal(r.server.activePort, undefined);
  await r.server.urlFor(GAME, r.root, 'index.html');
  r.state.tunnel = false;
  assert.deepEqual(await mint(), { ok: false }, 'tunnel down');
  r.state.tunnel = true;
  r.state.status = 'offline';
  assert.deepEqual(await mint(), { ok: false });
  r.state.status = 'connected';
  assert.equal((await mint()).ok, true);
  assert.equal(r.gateway.isAvailable(GAME), true);
  r.state.session = { instanceId: 's', features: [] };
  assert.equal(r.gateway.isAvailable(GAME), false);
});

test('S5-11. browser input can never choose a host or port: upstream is always 127.0.0.1:<Stadium port>, pathname only', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  const attempts = [
    '/index.html?port=22&host=evil.test', 'http://evil.test:9999/index.html', '//evil.test:81/index.html',
    '/index.html#x', '/logo.png?__proto__=1&url=http://169.254.169.254/'
  ];
  for (const attempt of attempts) {
    await gatewayCall(r, cookie, attempt, { 'x-forwarded-host': 'evil.test:1', host: 'evil.test:2', 'x-forwarded-port': '22' });
  }
  assert.ok(r.state.upstream.length >= attempts.length - 1);
  for (const options of r.state.upstream) {
    assert.equal(options.host, '127.0.0.1');
    assert.equal(options.port, r.server.activePort);
    assert.equal(options.headers.host, `127.0.0.1:${r.server.activePort}`);
    assert.doesNotMatch(options.path, /[?#]|^[a-z]+:/i, options.path);
  }
});
async function gatewayCall(r, cookie, p, headers) { return call(r.gateway, { cookie, path: p, headers }); }

test('S5-12. reserved /__sideline/*, service workers, bad methods and bad paths fail safely without touching the upstream', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  const before = r.state.upstream.length;
  for (const reserved of ['/__sideline', '/__sideline/', '/__sideline/preview/other', '/__SIDELINE/x', '//__sideline/x',
    '/%5F%5Fsideline/x', '/./__sideline/x', '/__sideline/preview/enter/extra', `/\\__sideline/x`]) {
    const out = await call(r.gateway, { cookie, path: reserved });
    assert.equal(out.status, 404, reserved);
  }
  assert.equal((await call(r.gateway, { path: PREVIEW_ENTER_PATH, method: 'HEAD' })).status, 404, 'HEAD cannot consume a ticket');
  for (const sw of ['/sw.js', '/index.html']) {
    const out = await call(r.gateway, { cookie, path: sw, headers: { 'service-worker': 'script' } });
    assert.equal(out.status, 403, 'service-worker registration refused');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
    const out = await call(r.gateway, { cookie, method });
    assert.equal(out.status, 405);
    assert.equal(out.headers.allow, 'GET, HEAD');
  }
  for (const bad of ['/a%00b', `/${'a'.repeat(2100)}`, '/%zz']) {
    assert.equal((await call(r.gateway, { cookie, path: bad })).status, 404, bad.slice(0, 20));
  }
  assert.equal(r.state.upstream.length, before, 'none of those reached the upstream');
});

test('S5-13. unsafe request and response headers never cross the boundary (adversarial upstream)', async (t) => {
  const r = await rig(t);
  const seen = [];
  const evil = http.createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(200, {
      [INSTANCE_HEADER]: r.server.activeInstanceId,
      'content-type': 'text/html; charset=utf-8',
      'content-length': '5',
      'set-cookie': 'sl_dev=stolen; Domain=localhost',
      'content-security-policy': 'default-src *',
      'access-control-allow-origin': '*',
      'x-frame-options': 'ALLOWALL',
      location: 'http://evil.test/',
      server: 'evil',
      'www-authenticate': 'Basic'
    });
    res.end('hello');
  });
  await new Promise((resolve) => evil.listen(0, '127.0.0.1', resolve));
  t.after(() => evil.close());
  // Point the target at the adversarial upstream by swapping the Stadium answer.
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: HOST, relayDomain: DOMAIN }), tunnelConnected: () => true,
    deviceLive: () => true, admission: () => ({ state: 'allow' }), touch() {}, knownGame: () => true,
    session: () => ({ status: 'connected', session: r.state.session }),
    rpc: async (_s, _m, p) => ({ success: true, gameId: p.gameId, available: true, port: evil.address().port, instanceId: r.server.activeInstanceId }),
    now: () => r.state.now
  });
  const minted = await gateway.mint({ deviceId: 'dev-1', gameId: GAME, pagePath: 'index.html' });
  const url = new URL(minted.frameUrl);
  const cookie = (await call(gateway, { path: `${url.pathname}${url.search}` })).headers['set-cookie'].split(';', 1)[0];
  const out = await call(gateway, {
    cookie, headers: { 'user-agent': 'UA', authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4', origin: 'https://h-x.localhost', 'x-sideline-action': '1', accept: 'text/html' }
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.toString(), 'hello');
  for (const banned of ['set-cookie', 'access-control-allow-origin', 'x-frame-options', 'location', 'server', 'www-authenticate', INSTANCE_HEADER]) {
    assert.equal(out.headers[banned], undefined, banned);
  }
  assert.equal(out.headers['content-security-policy'], `frame-ancestors 'self' https://h-${HOST}.localhost`, 'the fixed CSP replaces the upstream one');
  assert.deepEqual(Object.keys(seen[0]).sort(), ['accept', 'connection', 'host', INSTANCE_HEADER].sort(), 'only fixed request headers reach the static server');
  assert.ok(!JSON.stringify(seen[0]).includes(cookie.split('=')[1]), 'the grant secret never goes upstream');
});

test('S5-14. upstream content-type is sanitized, statuses are whitelisted, and a missing length on 200 fails closed', async (t) => {
  const r = await rig(t);
  let mode = 'odd-type';
  const evil = http.createServer((_req, res) => {
    res.setHeader(INSTANCE_HEADER, r.server.activeInstanceId);
    if (mode === 'odd-type') { res.writeHead(200, { 'content-type': 'text/html; evil=1, <script>', 'content-length': '2' }); res.end('ok'); }
    else if (mode === 'redirect') { res.writeHead(302, { location: 'http://evil.test/' }); res.end(); }
    else if (mode === 'chunked') { res.writeHead(200, { 'content-type': 'text/plain' }); res.write('a'); res.end('b'); }
    else { res.writeHead(500, { 'content-length': '3' }); res.end('err'); }
  });
  await new Promise((resolve) => evil.listen(0, '127.0.0.1', resolve));
  t.after(() => evil.close());
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: HOST, relayDomain: DOMAIN }), tunnelConnected: () => true,
    deviceLive: () => true, admission: () => ({ state: 'allow' }), touch() {}, knownGame: () => true,
    session: () => ({ status: 'connected', session: r.state.session }),
    rpc: async (_s, _m, p) => ({ success: true, gameId: p.gameId, available: true, port: evil.address().port, instanceId: r.server.activeInstanceId }),
    now: () => r.state.now
  });
  const minted = await gateway.mint({ deviceId: 'dev-1', gameId: GAME, pagePath: 'index.html' });
  const url = new URL(minted.frameUrl);
  const cookie = (await call(gateway, { path: `${url.pathname}${url.search}` })).headers['set-cookie'].split(';', 1)[0];
  assert.equal((await call(gateway, { cookie })).headers['content-type'], 'application/octet-stream');
  mode = 'redirect';
  assert.equal((await call(gateway, { cookie })).status, 502);
  mode = 'chunked';
  assert.equal((await call(gateway, { cookie })).status, 502);
  mode = 'error';
  const failed = await call(gateway, { cookie });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(failed.body.toString(), /err\b.*err/);
});

test('S5-15. >8 MiB is refused (413) before any byte moves; allowance exhaustion is a 403 page that keeps the grant', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  const big = await call(r.gateway, { cookie, path: '/big.bin' });
  assert.equal(big.status, 413);
  assert.ok(big.body.length < 2000, 'an ended page, not asset bytes');
  assert.equal(r.gateway.stats.inflight, 0);
  assert.equal((await call(r.gateway, { cookie })).status, 200, 'the grant and server are unharmed');

  r.state.admission = { state: 'exhausted', decision: { dadMessage: 'used up' } };
  assert.equal((await call(r.gateway, { cookie })).status, 403);
  r.state.admission = { state: 'not-entitled', decision: {} };
  assert.equal((await call(r.gateway, { cookie })).status, 403);
  r.state.admission = { state: 'grace' };
  assert.equal((await call(r.gateway, { cookie })).status, 200, 'grace keeps flowing; the grant was never dropped');
});

test('S5-16. the target RPC is cached for 5 s and refreshed afterwards', async (t) => {
  const r = await rig(t);
  const { cookie } = await enterGrant(r);
  const base = r.state.rpcCalls;
  for (let i = 0; i < 4; i++) await call(r.gateway, { cookie });
  assert.equal(r.state.rpcCalls, base);
  r.state.now += PREVIEW_TARGET_TTL_MS + 1;
  await call(r.gateway, { cookie });
  assert.equal(r.state.rpcCalls, base + 1);
});

test('S5-17. downstream cancel destroys the upstream request; backpressure pauses the upstream', async (t) => {
  const r = await rig(t);
  let produced = 0;
  let upstreamClosed;
  const closed = new Promise((resolve) => { upstreamClosed = resolve; });
  const endless = http.createServer((req, res) => {
    res.writeHead(404, { [INSTANCE_HEADER]: r.server.activeInstanceId, 'content-type': 'application/octet-stream' });
    const chunk = Buffer.alloc(64 * 1024, 1);
    const pump = () => { while (res.write(chunk)) produced += chunk.length; produced += chunk.length; res.once('drain', pump); };
    pump();
    req.on('close', () => upstreamClosed());
    res.on('close', () => upstreamClosed());
  });
  await new Promise((resolve) => endless.listen(0, '127.0.0.1', resolve));
  t.after(() => endless.close());
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: HOST, relayDomain: DOMAIN }), tunnelConnected: () => true,
    deviceLive: () => true, admission: () => ({ state: 'allow' }), touch() {}, knownGame: () => true,
    session: () => ({ status: 'connected', session: r.state.session }),
    rpc: async (_s, _m, p) => ({ success: true, gameId: p.gameId, available: true, port: endless.address().port, instanceId: r.server.activeInstanceId }),
    now: () => r.state.now
  });
  const minted = await gateway.mint({ deviceId: 'dev-1', gameId: GAME, pagePath: 'index.html' });
  const url = new URL(minted.frameUrl);
  const cookie = (await call(gateway, { path: `${url.pathname}${url.search}` })).headers['set-cookie'].split(';', 1)[0];

  const res = fakeRes();
  res.blocked = true; // the tunnel says "full": write() returns false until 'drain'
  const done = gateway.handle({ method: 'GET', url: '/stream.bin', headers: {} }, res, { previewTag: TAG, cookie });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const pausedAt = res.chunks.length;
  assert.ok(pausedAt >= 1 && pausedAt <= 4, `producer paused after ${pausedAt} chunks`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(res.chunks.length, pausedAt, 'no further bytes while the sink is full');
  assert.ok(produced < 16 * 1024 * 1024, 'the upstream was throttled too, not just buffered in the daemon');
  res.blocked = false;
  res.emit('drain');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(res.chunks.length > pausedAt, 'drain resumes the stream');

  res.emit('close'); // phone went away / tunnel cancel
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream still open')), 2000))]);
  await done;
  assert.equal(gateway.stats.inflight, 0);
});

test('S5-18. revokeAll aborts in-flight streams', async (t) => {
  const r = await rig(t);
  const hang = http.createServer((req, res) => {
    res.writeHead(404, { [INSTANCE_HEADER]: r.server.activeInstanceId, 'content-length': '1000' });
    res.write('x');
  });
  await new Promise((resolve) => hang.listen(0, '127.0.0.1', resolve));
  t.after(() => { hang.closeAllConnections?.(); hang.close(); });
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: HOST, relayDomain: DOMAIN }), tunnelConnected: () => true,
    deviceLive: () => true, admission: () => ({ state: 'allow' }), touch() {}, knownGame: () => true,
    session: () => ({ status: 'connected', session: r.state.session }),
    rpc: async (_s, _m, p) => ({ success: true, gameId: p.gameId, available: true, port: hang.address().port, instanceId: r.server.activeInstanceId }),
    now: () => r.state.now
  });
  const minted = await gateway.mint({ deviceId: 'dev-1', gameId: GAME, pagePath: 'index.html' });
  const url = new URL(minted.frameUrl);
  const cookie = (await call(gateway, { path: `${url.pathname}${url.search}` })).headers['set-cookie'].split(';', 1)[0];
  const frames = [];
  let sinkDestroyed = 0;
  let firstData;
  const streaming = new Promise((resolve) => { firstData = resolve; });
  const adapter = new InProcessRemoteAdapter({
    daemon: { dispatchRemotePreview(req, res, ctx) {
      const destroy = res.destroy.bind(res);
      res.destroy = () => { sinkDestroyed++; return destroy(); };
      return gateway.handle(req, res, ctx);
    } }, deviceRegistry: r.registry, expectedOrigin: 'https://h-test.localhost'
  });
  const done = adapter.dispatch({ t: 'req', id: 'revoked-stream', method: 'GET', path: '/slow', surface: 'preview', previewTag: TAG, headers: { cookie } },
    (frame) => { frames.push(frame); if (frame.t === 'data') firstData(); });
  await streaming;
  assert.equal(gateway.stats.inflight, 1);
  gateway.revokeAll();
  await done;
  assert.equal(gateway.stats.inflight, 0);
  assert.equal(sinkDestroyed, 1);
  assert.deepEqual(frames.filter((f) => f.t === 'error'), [{ t: 'error', id: 'revoked-stream', code: 'aborted' }]);
  assert.equal(frames.some((f) => f.t === 'end'), false);
});

// ------------------------------------------------------------------------------------------------
// Adapter surface split + the full relay chain.

test('S5-19. the adapter never authenticates or routes the preview surface through the app router', async (t) => {
  const calls = { app: 0, preview: [] };
  const daemon = {
    async dispatchRemoteRequest() { calls.app++; },
    async dispatchRemotePreview(req, res, ctx) { calls.preview.push({ headers: req.headers, ctx }); res.writeHead(200, {}); res.end('ok'); }
  };
  const dir = tmp(t, 'r13-s5-adapter-');
  const registry = new DeviceRegistry(path.join(dir, 'd.json'));
  const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: registry, expectedOrigin: 'https://h-x.localhost' });
  const frames = [];
  await adapter.dispatch({ t: 'req', id: 'p1', method: 'GET', path: '/index.html', surface: 'preview', previewTag: TAG, headers: {
    cookie: `${PREVIEW_COOKIE}=abc; sl_dev=devtoken; __Host-sl_dev=devtoken2`, origin: 'https://p-evil.localhost', 'x-sideline-action': '1',
    'content-type': 'application/json', 'last-event-id': '9', 'user-agent': 'UA', accept: '*/*', 'service-worker': 'script'
  } }, (f) => { frames.push(f); });
  assert.equal(calls.app, 0, 'never dispatchRemoteRequest');
  assert.equal(calls.preview.length, 1);
  assert.equal(calls.preview[0].ctx.previewTag, TAG);
  assert.match(calls.preview[0].ctx.cookie, /__Host-sl_pv=abc/);
  assert.deepEqual(Object.keys(calls.preview[0].headers).sort(), ['accept', 'service-worker', 'user-agent']);
  assert.equal(frames.find((f) => f.t === 'head').status, 200);
  assert.equal(frames.find((f) => f.t === 'head').headers['set-cookie'], undefined, 'no device cookie refresh on the preview surface');

  // Preview frame without a tag is malformed; an app frame still reaches the app router.
  const bad = [];
  await adapter.dispatch({ t: 'req', id: 'p2', method: 'GET', path: '/', surface: 'preview', headers: {} }, (f) => { bad.push(f); });
  assert.equal(bad[0].t, 'error');
  assert.equal(calls.preview.length, 1);
});

async function relayRig(t) {
  const r = await rig(t);
  const identity = new HostIdentityManager().ensureIdentity(path.join(r.dir, 'remote'));
  const tag = derivePreviewTag(identity.hostPublicId, GAME);
  // Re-point the gateway at the real host identity and relay.
  const relay = new ReferenceRelay({ relayDomain: 'localhost' });
  const port = await relay.listen(0);
  const gateway = new RemotePreviewGateway({
    origin: () => ({ hostPublicId: identity.hostPublicId, relayDomain: 'localhost' }), tunnelConnected: () => true,
    deviceLive: (id) => r.registry.isLive(id), admission: () => ({ state: 'allow' }), touch() {}, knownGame: () => true,
    session: () => ({ status: 'connected', session: r.state.session }),
    rpc: async (_s, _m, p) => ({ success: true, gameId: p.gameId, available: true, port: r.server.activePort, instanceId: r.server.activeInstanceId }),
    now: () => Date.now()
  });
  const daemon = {
    async dispatchRemoteRequest(_req, res) { res.writeHead(200, {}); res.end('app'); },
    dispatchRemotePreview: (req, res, ctx) => gateway.handle(req, res, ctx)
  };
  const client = new RelayClient({ identity, deviceRegistry: r.registry, daemon, relayUrl: `ws://127.0.0.1:${port}/tunnel/v1`, relayDomain: 'localhost' });
  await client.start();
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('relay hello timeout')), 3000);
    const poll = () => relay.isHostConnected(identity.hostPublicId) ? (clearTimeout(deadline), resolve()) : setTimeout(poll, 5);
    poll();
  });
  t.after(async () => { await client.stop(); await relay.close(); });
  const browse = (p, { headers = {}, method = 'GET', hostPrefix = `p-${identity.hostPublicId}-${tag}` } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: `${hostPrefix}.localhost:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
  const enter = async () => {
    const minted = await gateway.mint({ deviceId: r.phone.deviceId, gameId: GAME, pagePath: 'index.html' });
    const url = new URL(minted.frameUrl);
    const out = await browse(`${url.pathname}${url.search}`);
    return { out, cookie: String(out.headers['set-cookie']).split(';', 1)[0] };
  };
  return { ...r, relay, port, identity, tag, client, browse, enter, gateway };
}

test('S5-20. byte-exact binary asset and HttpOnly cookie through the real relay + tunnel; >8 MiB does not kill the tunnel', async (t) => {
  const r = await relayRig(t);
  const { out: entered, cookie } = await r.enter();
  assert.equal(entered.status, 303);
  assert.match(String(entered.headers['set-cookie']), /^__Host-sl_pv=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/$/);
  assert.equal(entered.headers.location, '/index.html');

  const png = await r.browse('/logo.png', { headers: { Cookie: cookie } });
  assert.equal(png.status, 200);
  assert.deepEqual(png.body, binaryFixture(), 'byte-exact');
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.headers['content-length'], String(binaryFixture().length));
  assert.equal(png.headers['content-security-policy'], `frame-ancestors 'self' https://h-${r.identity.hostPublicId}.localhost`);

  const big = await r.browse('/big.bin', { headers: { Cookie: cookie } });
  assert.equal(big.status, 413);
  assert.equal(r.client.stats.connected, true, 'tunnel survived');
  assert.equal(r.relay.isHostConnected(r.identity.hostPublicId), true);
  assert.deepEqual((await r.browse('/logo.png', { headers: { Cookie: cookie } })).body, binaryFixture(), 'and keeps serving');

  // The app origin on the same tunnel still reaches the app router and never the preview cookie path.
  const app = await r.browse('/api/status', { hostPrefix: `h-${r.identity.hostPublicId}`, headers: { Cookie: `__Host-sl_dev=${r.phone.rawToken}` } });
  assert.equal(app.body.toString(), 'app');
  assert.equal((await r.browse('/index.html', { headers: { Cookie: cookie }, hostPrefix: `p-${r.identity.hostPublicId}-aaaaaaaaaa` })).status, 401, 'another Game origin rejects the grant');
});

test('S5-21. a revoked device and a stopped gateway lose the relay path immediately', async (t) => {
  const r = await relayRig(t);
  const { cookie } = await r.enter();
  assert.equal((await r.browse('/index.html', { headers: { Cookie: cookie } })).status, 200);
  r.registry.revoke(r.phone.deviceId);
  assert.equal((await r.browse('/index.html', { headers: { Cookie: cookie } })).status, 401);
  const tablet = r.registry.createDevice('Tablet');
  const minted = await r.gateway.mint({ deviceId: tablet.deviceId, gameId: GAME, pagePath: 'index.html' });
  const url = new URL(minted.frameUrl);
  const out = await r.browse(`${url.pathname}${url.search}`);
  const tabletCookie = String(out.headers['set-cookie']).split(';', 1)[0];
  assert.equal((await r.browse('/index.html', { headers: { Cookie: tabletCookie } })).status, 200);
  r.gateway.revokeAll();
  assert.equal((await r.browse('/index.html', { headers: { Cookie: tabletCookie } })).status, 401);
});

test('MF1 incomplete upstream body aborts through Gateway, adapter and real relay', { timeout: 5000 }, async (t) => {
  const r = await relayRig(t);
  let upstreamResponse;
  let arrived;
  const delivered = new Promise((resolve) => { arrived = resolve; });
  const broken = http.createServer((_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { [INSTANCE_HEADER]: r.server.activeInstanceId, 'content-length': '1000' });
    res.write('partial');
  });
  await new Promise((resolve) => broken.listen(0, '127.0.0.1', resolve));
  t.after(() => { broken.closeAllConnections(); broken.close(); });
  const { cookie } = await r.enter();
  r.gateway.httpRequest = (options) => http.request({ ...options, port: broken.address().port });
  const frames = [];
  const dispatch = r.client.adapter.dispatch.bind(r.client.adapter);
  r.client.adapter.dispatch = (req, send, flow) => dispatch(req, (frame) => {
    frames.push(frame);
    const accepted = send(frame);
    if (frame.t === 'data') arrived();
    return accepted;
  }, flow);
  const result = r.browse('/broken.bin', { headers: { Cookie: cookie } });
  const failed = assert.rejects(result, /aborted|reset|socket hang up/i);
  await delivered;
  upstreamResponse.destroy();
  await failed;
  assert.equal(frames.filter((f) => f.t === 'error' && f.code === 'aborted').length, 1);
  assert.equal(frames.some((f) => f.t === 'end'), false);
  assert.equal(r.gateway.stats.inflight, 0);
  assert.equal(r.client.stats.connected, true);
});

test('MF1 backpressure suspends timeout beyond its deadline, drain rearms it and completes exact bytes', async (t) => {
  const r = await rig(t);
  const request = new EventEmitter();
  const response = new EventEmitter();
  let clock = 0;
  let deadline;
  let paused = false;
  let destroys = 0;
  const payload = Buffer.from('binary-\u0000-💥-payload');
  Object.assign(request, {
    setTimeout(ms) { deadline = ms ? clock + ms : undefined; return request; },
    destroy() { destroys++; },
    end() { request.emit('response', response); }
  });
  Object.assign(response, {
    headers: { [INSTANCE_HEADER]: r.server.activeInstanceId, 'content-length': String(payload.length) },
    statusCode: 200, complete: false,
    pause() { paused = true; },
    resume() { paused = false; }, destroy() { destroys++; }
  });
  r.gateway.deps.upstreamTimeoutMs = 10;
  r.gateway.httpRequest = (options) => { request.setTimeout(options.timeout); return request; };
  const sink = fakeRes(); sink.blocked = true;
  const done = r.gateway.forward(sink, false,
    { staticInstanceId: r.server.activeInstanceId, stadiumInstanceId: 'session' },
    { port: r.server.activePort }, '/asset');
  response.emit('data', payload.subarray(0, 3));
  assert.equal(paused, true);
  assert.equal(deadline, undefined);
  clock += 100; // ten timeout intervals, without any wall-clock race
  if (deadline !== undefined && clock >= deadline) request.emit('timeout');
  request.emit('timeout'); // even a previously scheduled timeout callback is ignored while paused
  assert.equal(sink.destroyed, false);
  sink.blocked = false; sink.emit('drain');
  assert.equal(paused, false);
  assert.equal(deadline, 110);
  response.emit('data', payload.subarray(3));
  response.complete = true;
  response.emit('end');
  response.emit('close');
  await done;
  assert.deepEqual(sink.body, payload);
  assert.equal(sink.ended, true);
  assert.equal(sink.destroyed, false);
  assert.equal(destroys, 0);
});

test('MF1 post-head timeout, error, incomplete close and byte overflow destroy once without end', async (t) => {
  const r = await rig(t);
  for (const failure of ['timeout', 'error', 'close', 'overflow']) {
    const req = new EventEmitter();
    const upstream = new EventEmitter();
    Object.assign(req, { end() { req.emit('response', upstream); }, destroy() {}, setTimeout() {} });
    Object.assign(upstream, { statusCode: 404, headers: { [INSTANCE_HEADER]: r.server.activeInstanceId }, complete: false, resume() {}, destroy() {}, pause() {} });
    r.gateway.httpRequest = () => req;
    const sink = fakeRes();
    let destroyed = 0;
    sink.destroy = () => { destroyed++; sink.emit('close'); };
    const done = r.gateway.forward(sink, false, { staticInstanceId: r.server.activeInstanceId, stadiumInstanceId: 'session' }, { port: r.server.activePort }, '/asset');
    if (failure === 'timeout') req.emit('timeout');
    if (failure === 'error') upstream.emit('error', new Error('read failed'));
    if (failure === 'close') upstream.emit('close');
    if (failure === 'overflow') upstream.emit('data', Buffer.alloc(MAX_PREVIEW_ASSET_BYTES + 1));
    upstream.emit('close');
    req.emit('error', new Error('late error'));
    await done;
    assert.equal(destroyed, 1, failure);
    assert.equal(sink.ended, false, failure);
    assert.equal(r.gateway.stats.inflight, 0);
  }
});

// ------------------------------------------------------------------------------------------------
// Daemon route: POST /api/games/preview/remote.

function daemonRig(t, { endpoint, staticRunning = true } = {}) {
  const dir = tmp(t, 'r13-s5-daemon-');
  const daemon = new ControlPlaneDaemon({ dir, port: 42900 + Math.floor(Math.random() * 90), idleTimeoutMs: 60_000 });
  const calls = [];
  const STATIC = {
    previewId: `${GAME}:stadium-secret-id:43110`, gameId: GAME, stadiumId: 'stadium-secret-id',
    localUrl: 'http://127.0.0.1:43110/index.html', clientUrl: 'http://127.0.0.1:43110/index.html', port: 43110,
    protocol: 'http', source: 'static', ownership: 'verified', label: 'Static', primary: true, loopbackIpv4: true, observedAt: 5,
    pages: [
      { path: 'index.html', label: 'Home', primary: true, clientUrl: 'http://127.0.0.1:43110/index.html' },
      { path: 'sub/page.html', label: 'Sub', primary: false, clientUrl: 'http://127.0.0.1:43110/sub/page.html' }
    ]
  };
  const socket = {
    readyState: 1,
    close() {},
    send(raw) {
      const frame = JSON.parse(String(raw));
      calls.push(frame);
      const reply = frame.method === 'game.preview.resolve'
        ? { success: true, gameId: GAME, available: true, endpoints: [endpoint ?? STATIC] }
        : staticRunning
          ? { success: true, gameId: GAME, available: true, port: 43110, instanceId: 'AbCdEfGhIjKlMnOpQrStUv' }
          : { success: true, gameId: GAME, available: false, reason: 'not-running' };
      setImmediate(() => daemon.handleWsResponseForTest(frame.id, reply));
    }
  };
  const start = async () => {
    await daemon.start();
    daemon.registryInstance.registerSession({
      instanceId: 'session-s5', stadiumId: 'stadium-secret-id', name: 'S5', platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'S5', fingerprintSource: 'test' }, rootFsPath: os.tmpdir(),
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(),
      features: ['game.preview.v1', 'game.preview.remote.v1']
    });
    // A connected tunnel identity, without a real relay: only what the gateway reads.
    daemon.remoteRelay = { relayUrl: 'ws://x', relayDomain: 'localhost' };
    daemon.relayClient = { hostPublicId: HOST, stats: { connected: true }, async stop() {} };
  };
  t.after(async () => { daemon.relayClient = undefined; await daemon.stop(); });
  return { daemon, calls, start, token: () => fs.readFileSync(path.join(dir, 'token'), 'utf8').trim() };
}

async function remoteRequest(daemon, method, url, body, headers = {}, principal) {
  const { Readable } = await import('node:stream');
  let status; let text = '';
  const res = { headersSent: false, writeHead(s) { status = s; this.headersSent = true; }, setHeader() {}, end(chunk) { text += chunk ?? ''; } };
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: `h-${HOST}.localhost`, 'content-type': 'application/json', ...headers }, socket: {} });
  await daemon.handleHttpRequest(req, res, principal ?? { kind: 'remote-device', deviceId: 'dev-paired', authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` });
  return { status, json: text ? JSON.parse(text) : undefined, text };
}
const mutationHeaders = { 'x-sideline-action': '1', origin: `https://h-${HOST}.localhost` };

test('S5-22. POST /api/games/preview/remote: remote-mutate policy, local callers refused, eligible static Game gets a leak-free projection', async (t) => {
  assert.equal(classifyDaemonRoute('POST', '/api/games/preview/remote'), 'remote-mutate');
  const d = daemonRig(t);
  await d.start();
  // A paired device in the registry is required for the per-request liveness check at mint.
  const device = d.daemon.deviceRegistry.createDevice('Phone');
  const principal = { kind: 'remote-device', deviceId: device.deviceId, authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` };

  const noAction = await remoteRequest(d.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, { origin: mutationHeaders.origin }, principal);
  assert.equal(noAction.status, 403, 'the existing action/Origin protection applies');
  const badOrigin = await remoteRequest(d.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, { 'x-sideline-action': '1', origin: 'https://p-x-aaaaaaaaaa.localhost' }, principal);
  assert.equal(badOrigin.status, 403);

  const local = await remoteRequest(d.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, {}, { kind: 'local-admin', authenticatedBy: 'bearer' });
  assert.equal(local.status, 409);
  assert.equal(local.json.reason, 'local-viewer');
  assert.equal(d.calls.length, 0, 'a local caller never reaches the Stadium through this route');

  const ok = await remoteRequest(d.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, mutationHeaders, principal);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.available, true);
  const endpoint = ok.json.endpoints[0];
  assert.equal(endpoint.source, 'static');
  assert.match(endpoint.remote.frameUrl, new RegExp(`^https://p-${HOST}-${derivePreviewTag(HOST, GAME)}\\.localhost/__sideline/preview/enter\\?t=[A-Za-z0-9_-]{43}$`));
  assert.equal(endpoint.remote.openUrl, `https://p-${HOST}-${derivePreviewTag(HOST, GAME)}.localhost/index.html`);
  assert.equal(endpoint.pages[1].remoteUrl, `https://p-${HOST}-${derivePreviewTag(HOST, GAME)}.localhost/sub/page.html`);
  for (const leak of ['127.0.0.1', '43110', 'stadium-secret-id', 'localUrl', 'clientUrl', 'loopbackIpv4', 'AbCdEfGhIjKlMnOpQrStUv', os.tmpdir()]) {
    assert.ok(!ok.text.includes(leak), `projection must not contain ${leak}`);
  }
  // The daemon re-resolved and asked the Stadium for the target; it never sent anything but the Game id.
  assert.deepEqual(d.calls.map((c) => c.method), ['game.preview.resolve', 'game.preview.remoteTarget']);
  assert.deepEqual(d.calls[1].params, { gameId: GAME });

  // The same route's GET advertises availability without starting anything.
  const get = await remoteRequest(d.daemon, 'GET', `/api/games/preview?gameId=${GAME}`, undefined, {}, principal);
  assert.deepEqual(get.json, { success: true, gameId: GAME, available: false, endpoints: [], reason: 'remote-viewer', remotePreview: true });
});

test('S5-23. non-static, not-running and tunnel-less cases are "remote-viewer" and mint nothing', async (t) => {
  const vite = {
    previewId: `${GAME}:s:5173`, gameId: GAME, stadiumId: 's', localUrl: 'http://localhost:5173/', clientUrl: 'http://localhost:5173/', port: 5173,
    protocol: 'http', source: 'detected', ownership: 'verified', label: 'Vite', primary: true, observedAt: 1
  };
  const a = daemonRig(t, { endpoint: vite });
  await a.start();
  const device = a.daemon.deviceRegistry.createDevice('Phone');
  const principal = { kind: 'remote-device', deviceId: device.deviceId, authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` };
  const out = await remoteRequest(a.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, mutationHeaders, principal);
  assert.deepEqual(out.json, { success: true, gameId: GAME, available: false, endpoints: [], reason: 'remote-viewer' });
  assert.ok(!a.calls.some((c) => c.method === 'game.preview.remoteTarget'), 'no target lookup for a dev-server endpoint');
  assert.equal(a.daemon.remotePreviewGateway.stats.grants, 0);

  const b = daemonRig(t, { staticRunning: false });
  await b.start();
  const dev2 = b.daemon.deviceRegistry.createDevice('Phone');
  const out2 = await remoteRequest(b.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, mutationHeaders,
    { kind: 'remote-device', deviceId: dev2.deviceId, authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` });
  assert.equal(out2.json.reason, 'remote-viewer');
  assert.equal(b.daemon.remotePreviewGateway.stats.grants, 0);

  const c = daemonRig(t);
  await c.start();
  c.daemon.relayClient = undefined; // Remote Access off: no tunnel identity
  const dev3 = c.daemon.deviceRegistry.createDevice('Phone');
  const out3 = await remoteRequest(c.daemon, 'POST', '/api/games/preview/remote', { gameId: GAME }, mutationHeaders,
    { kind: 'remote-device', deviceId: dev3.deviceId, authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` });
  assert.equal(out3.json.reason, 'remote-viewer');
  assert.equal(c.calls.length, 0, 'the Stadium is not even asked');
  for (const bad of [{}, { gameId: '' }, { gameId: GAME, staticEntrypoint: 'x'.repeat(501) }]) {
    const r = await remoteRequest(c.daemon, 'POST', '/api/games/preview/remote', bad, mutationHeaders,
      { kind: 'remote-device', deviceId: dev3.deviceId, authenticatedBy: 'in-process', expectedOrigin: `https://h-${HOST}.localhost` });
    assert.equal(r.status, 400);
  }
});
