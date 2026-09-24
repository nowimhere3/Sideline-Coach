import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ReferenceRelay, DEFAULT_RATE_LIMITS } from '../out/relay-build/relay/reference-relay.js';
import { loadConfig, startRelay as startProductionRelay, RelayConfigError } from '../out/relay-build/relay/index.js';

const KEY = 'beta-enrollment-key-0123456789';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, ms = 2500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(10);
  }
  return fn();
};

const makeClock = (start = 1_000_000) => {
  const clock = { t: start, now: () => clock.t, advance(ms) { clock.t += ms; } };
  return clock;
};

const makeIdentity = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4a-'));
  const identity = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { identity, hostPublicId: identity.hostPublicId, publicKeyHex: Buffer.from(identity.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex') };
};

const startEngine = async (options = {}) => {
  const events = [];
  const logs = [];
  const relay = new ReferenceRelay({ relayDomain: 'localhost', onEvent: (e) => events.push(e), log: (e) => logs.push(e), ...options });
  const port = await relay.listen(0);
  return { relay, port, events, logs };
};

/** One raw upgrade attempt: resolves { status } (101 = accepted) without keeping the socket. */
const upgradeAttempt = (port, headers = {}) => new Promise((resolve) => {
  const req = http.request({
    host: '127.0.0.1', port, path: '/tunnel/v1',
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers }
  });
  req.on('upgrade', (res, socket) => { socket.destroy(); resolve({ status: 101 }); });
  req.on('response', (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', (error) => resolve({ status: 0, error: error.message }));
  req.end();
});

const connectHost = async (port, headers = {}) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/tunnel/v1`, { headers });
  const host = { ws, frames: [], closed: null };
  ws.on('message', (data) => host.frames.push(JSON.parse(data.toString())));
  ws.on('close', (code) => { host.closed = { code }; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await waitUntil(() => host.frames.some((f) => f.t === 'challenge'));
  host.challenge = host.frames.find((f) => f.t === 'challenge');
  host.send = (frame) => ws.send(JSON.stringify(frame));
  host.reqs = () => host.frames.filter((f) => f.t === 'req');
  return host;
};

const helloFor = (id, nonce, sigOverride) => ({
  t: 'hello', v: 1, hostPublicId: id.hostPublicId, publicKey: id.publicKeyHex,
  sig: sigOverride ?? crypto.sign(null, Buffer.from(nonce, 'base64url'), id.identity.privateKey).toString('base64url'),
  client: 'sideline/test'
});

const registerHost = async (relay, port, headers = {}, id = makeIdentity()) => {
  const host = await connectHost(port, headers);
  host.send(helloFor(id, host.challenge.nonce));
  assert.ok(await waitUntil(() => relay.isHostConnected(id.hostPublicId)), 'host registered');
  return { host, id };
};

const browser = (port, hostPublicId, { method = 'GET', path: reqPath = '/', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: reqPath, agent: false, headers: { Host: `h-${hostPublicId}.localhost:${port}`, ...headers } }, (res) => {
    let text = '';
    res.on('data', (c) => { text += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    res.on('error', reject);
  });
  req.on('error', reject);
  req.end(body);
});

const plainGet = (port, p, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method, agent: false, headers }, (res) => {
    let text = '';
    res.on('data', (c) => { text += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
  });
  req.on('error', reject);
  req.end();
});

const OFFLINE_HOST = 'abcdefghijklmnopqrst';

test('RA4A-0. production config validates fail-fast without echoing secrets; the entrypoint really starts and answers /health', async () => {
  const good = { PORT: '0', RELAY_DOMAIN: 'Relay.Example.com', ENROLLMENT_KEY: KEY };
  const cfg = loadConfig(good);
  assert.equal(cfg.relayDomain, 'relay.example.com');
  assert.equal(cfg.port, 0);
  assert.equal(cfg.enrollmentKey, KEY);
  assert.deepEqual(cfg.rateLimits, DEFAULT_RATE_LIMITS, 'documented defaults: 10/min, 5 failures, 15 min, 120/min, 10/min');
  assert.equal(cfg.trustProxy, false);
  assert.equal(cfg.drainMs, 5000);
  const tuned = loadConfig({ ...good, RATE_HANDSHAKE_PER_MIN: '3', RATE_INVALID_BEFORE_BAN: '2', BAN_MINUTES: '1', RATE_HTTP_PER_MIN: '7', RATE_PAIRING_PER_MIN: '4', TRUST_PROXY: 'true', DRAIN_MS: '100' });
  assert.equal(tuned.rateLimits.handshakePerWindow, 3);
  assert.equal(tuned.rateLimits.invalidBeforeBan, 2);
  assert.equal(tuned.rateLimits.banMs, 60_000);
  assert.equal(tuned.rateLimits.httpPerWindow, 7);
  assert.equal(tuned.rateLimits.pairingPerWindow, 4);
  assert.equal(tuned.trustProxy, true);
  const bad = [
    {}, { ...good, PORT: 'abc' }, { ...good, PORT: '70000' }, { ...good, RELAY_DOMAIN: undefined }, { ...good, RELAY_DOMAIN: 'https://x.com' },
    { ...good, ENROLLMENT_KEY: 'shortsecret' }, { PORT: '0', RELAY_DOMAIN: 'relay.example.com' }, { ...good, TRUST_PROXY: 'yes' },
    { ...good, RATE_HTTP_PER_MIN: '0' }, { ...good, DRAIN_MS: '9000' }
  ];
  for (const env of bad) {
    assert.throws(() => loadConfig(env), (error) => error instanceof RelayConfigError && !String(error.message).includes('shortsecret') && !String(error.message).includes(KEY));
  }
  assert.equal(loadConfig({ PORT: '0', RELAY_DOMAIN: 'localhost', ALLOW_OPEN_ENROLLMENT: 'true' }).enrollmentKey, undefined);

  // Real process: invalid config exits 1 with a structured, secret-free error.
  const entry = fileURLToPath(new URL('../out/relay-build/relay/index.js', import.meta.url));
  const bad1 = await new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: '0', RELAY_DOMAIN: 'relay.example.com', ENROLLMENT_KEY: 'shortsecret' } });
    let err = '';
    child.stderr.on('data', (c) => { err += c; });
    child.on('exit', (code) => resolve({ code, err }));
  });
  assert.equal(bad1.code, 1);
  assert.equal(JSON.parse(bad1.err.trim()).event, 'config_error');
  assert.ok(!bad1.err.includes('shortsecret'));
  // Valid config: it listens and serves /health.
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: '0', BIND_HOST: '127.0.0.1', RELAY_DOMAIN: 'localhost', ENROLLMENT_KEY: KEY } });
  try {
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    assert.ok(await waitUntil(() => out.includes('"event":"listening"'), 8000), 'entrypoint started');
    const listening = JSON.parse(out.split('\n').find((line) => line.includes('"listening"')));
    const health = await plainGet(listening.port, '/health');
    assert.equal(health.status, 200);
    assert.ok(!out.includes(KEY), 'startup log never contains the enrollment key');
  } finally {
    child.kill();
  }
});

test('RA4A-1. GET /health is a safe public liveness probe; other methods never act as health', async () => {
  const { relay, port } = await startEngine({ enrollmentKey: KEY });
  try {
    await registerHost(relay, port, { 'x-sideline-enrollment': KEY });
    const before = { hosts: relay.hosts.size, conns: relay.connectionCount, inflight: relay.inflight.size };
    for (const p of ['/health', '/healthz', '/health?probe=1']) {
      const res = await plainGet(port, p);
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'application/json');
      assert.equal(res.headers['cache-control'], 'no-store');
      const body = JSON.parse(res.text);
      assert.deepEqual(Object.keys(body).sort(), ['status', 'uptime']);
      assert.equal(body.status, 'ok');
      assert.ok(Number.isInteger(body.uptime) && body.uptime >= 0);
      assert.doesNotMatch(res.text, new RegExp(KEY));
    }
    const noHost = await plainGet(port, '/health', 'GET', { Host: 'anything.example.com' });
    assert.equal(noHost.status, 200, 'available on any Host header');
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await plainGet(port, '/health', method);
      assert.equal(res.status, 405);
      assert.equal(res.headers.allow, 'GET');
      assert.equal(res.text, '{"status":"method_not_allowed"}');
    }
    assert.deepEqual({ hosts: relay.hosts.size, conns: relay.connectionCount, inflight: relay.inflight.size }, before, 'no state changed');
  } finally { await relay.close(); }
});

test('RA4A-2. correct enrollment key: upgrade accepted, challenge issued, normal Ed25519 hello proceeds', async () => {
  const { relay, port, events } = await startEngine({ enrollmentKey: KEY });
  try {
    const { host, id } = await registerHost(relay, port, { 'x-sideline-enrollment': KEY });
    assert.equal(Buffer.from(host.challenge.nonce, 'base64url').length, 32);
    assert.equal(relay.isHostConnected(id.hostPublicId), true);
    assert.ok(events.some((e) => e.event === 'connect' && e.hostPublicId === id.hostPublicId));
    // The hello semantics are unchanged: a forged signature is still refused after enrollment passes.
    const other = makeIdentity();
    const forger = await connectHost(port, { 'x-sideline-enrollment': KEY });
    forger.send(helloFor(other, forger.challenge.nonce, crypto.randomBytes(64).toString('base64url')));
    assert.ok(await waitUntil(() => forger.closed));
    assert.equal(forger.closed.code, 4403);
  } finally { await relay.close(); }
});

test('RA4A-3. missing or wrong enrollment key is rejected 403 before any challenge and leaks nothing', async () => {
  const { relay, port, events, logs } = await startEngine({ enrollmentKey: KEY });
  try {
    const wrong = 'WRONG-ENROLLMENT-SENTINEL-value';
    const missing = await upgradeAttempt(port);
    const badKey = await upgradeAttempt(port, { 'x-sideline-enrollment': wrong });
    const prefix = await upgradeAttempt(port, { 'x-sideline-enrollment': KEY.slice(0, -1) });
    for (const res of [missing, badKey, prefix]) {
      assert.equal(res.status, 403);
      assert.equal(res.body, '');
      assert.doesNotMatch(JSON.stringify(res.headers), new RegExp(`${KEY}|${wrong}`));
    }
    await assert.rejects(() => connectHost(port, { 'x-sideline-enrollment': wrong }), (error) => /403/.test(error.message) && !error.message.includes(wrong) && !error.message.includes(KEY));
    assert.equal(relay.connectionCount, 0, 'no socket was ever accepted');
    assert.equal(relay.pending.size, 0, 'no pending handshake state');
    assert.equal(relay.hosts.size, 0);
    assert.equal(relay.wss.clients.size, 0);
    assert.equal(events.filter((e) => e.event === 'enrollment_rejected').length, 4);
    assert.doesNotMatch(JSON.stringify({ events, logs }), new RegExp(`${KEY}|${wrong}`));
  } finally { await relay.close(); }
});

test('RA4A-4. with no enrollment key configured the gate is off and Stage 3 behaviour is unchanged', async () => {
  const { relay, port } = await startEngine();
  try {
    assert.equal((await upgradeAttempt(port)).status, 101);
    const { host } = await registerHost(relay, port);
    assert.ok(host.challenge);
    const { id } = await registerHost(relay, port, { 'x-sideline-enrollment': 'ignored-when-gate-off' });
    assert.equal(relay.isHostConnected(id.hostPublicId), true);
  } finally { await relay.close(); }
});

test('RA4A-5. daemon remote-relay config carries the enrollment key to RelayClient without persisting or logging it', async () => {
  const { relay, port, events, logs } = await startEngine({ enrollmentKey: KEY });
  const dirs = [];
  const makeDaemon = async (enrollmentKey) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4a-d-'));
    dirs.push(dir);
    const daemon = new ControlPlaneDaemon({
      dir, port: 43900 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000,
      remoteRelay: { relayUrl: `ws://127.0.0.1:${port}/tunnel/v1`, relayDomain: 'localhost', ...(enrollmentKey ? { enrollmentKey } : {}), tuning: { backoffScheduleMs: [50] } }
    });
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const hostPublicId = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote')).hostPublicId;
    const call = (p, init = {}) => fetch(`http://127.0.0.1:${daemon.port}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return { daemon, dir, hostPublicId, call, enable: () => call('/api/preferences', { method: 'POST', body: JSON.stringify({ remoteAccess: { enabled: true } }) }) };
  };
  const good = await makeDaemon(KEY);
  const wrong = await makeDaemon('WRONG-DAEMON-KEY-0123456789');
  const none = await makeDaemon(undefined);
  try {
    assert.equal((await good.enable()).status, 200);
    assert.ok(await waitUntil(() => relay.isHostConnected(good.hostPublicId)), 'enrolled daemon registered');
    assert.equal(good.daemon.relayClient.options.enrollmentKey, KEY);
    assert.equal((await wrong.enable()).status, 200);
    assert.equal((await none.enable()).status, 200);
    assert.ok(await waitUntil(() => events.filter((e) => e.event === 'enrollment_rejected').length >= 2, 4000));
    assert.equal(relay.isHostConnected(wrong.hostPublicId), false);
    assert.equal(relay.isHostConnected(none.hostPublicId), false);
    assert.equal((await wrong.call('/api/status')).status, 200, 'local daemon unaffected by a rejected enrollment');
    // Never persisted or exposed: scan every file the daemons wrote, the preferences API and relay output.
    const prefs = await (await good.call('/api/preferences')).text();
    assert.doesNotMatch(prefs, new RegExp(KEY));
    const scan = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? scan(full) : [full];
    });
    for (const dir of dirs) {
      for (const file of scan(dir)) assert.ok(!fs.readFileSync(file).includes(KEY), `${path.basename(file)} must not contain the enrollment key`);
    }
    assert.doesNotMatch(JSON.stringify({ events, logs }), new RegExp(`${KEY}|WRONG-DAEMON-KEY`));
  } finally {
    for (const d of [good, wrong, none]) await d.daemon.stop();
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    await relay.close();
  }
});

test('RA4A-6. handshake attempts are limited per client identity; identities are independent; the window recovers', async () => {
  const clock = makeClock();
  const { relay, port, events } = await startEngine({ rateLimits: { handshakePerWindow: 3 }, trustProxy: true, now: clock.now });
  try {
    const as = (ip) => upgradeAttempt(port, { 'x-forwarded-for': ip });
    for (let i = 0; i < 3; i += 1) assert.equal((await as('10.0.0.1')).status, 101);
    const limited = await as('10.0.0.1');
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal((await as('10.0.0.2')).status, 101, 'a different identity is unaffected');
    assert.equal((await as('10.0.0.1')).status, 429);
    assert.ok(events.some((e) => e.event === 'rate_limit' && e.scope === 'handshake'));
    clock.advance(61_000);
    assert.equal((await as('10.0.0.1')).status, 101, 'sliding window expired');
    assert.ok(await waitUntil(() => relay.pending.size === 0), 'refused upgrades left no handshake state and dropped sockets are cleaned');
  } finally { await relay.close(); }
});

test('RA4A-7. consecutive invalid enrollment/handshake failures trigger a temporary block that lifts on the (injected) clock', async () => {
  const clock = makeClock();
  const { relay, port, events } = await startEngine({ enrollmentKey: KEY, rateLimits: { handshakePerWindow: 1000, invalidBeforeBan: 3, banMs: 15 * 60_000 }, trustProxy: true, now: clock.now });
  try {
    const as = (ip, key) => upgradeAttempt(port, { 'x-forwarded-for': ip, ...(key ? { 'x-sideline-enrollment': key } : {}) });
    for (let i = 0; i < 3; i += 1) assert.equal((await as('10.1.0.1', 'nope')).status, 403);
    const banned = await as('10.1.0.1', KEY); // even a correct key is refused while blocked
    assert.equal(banned.status, 429);
    assert.ok(Number(banned.headers['retry-after']) > 800, 'Retry-After reflects the ~15 minute block');
    assert.ok(events.some((e) => e.scope === 'ban_started'));
    assert.equal((await as('10.1.0.2', KEY)).status, 101, 'other identities are not blocked');
    clock.advance(14 * 60_000);
    assert.equal((await as('10.1.0.1', KEY)).status, 429, 'still blocked before 15 minutes');
    clock.advance(61_000);
    assert.equal((await as('10.1.0.1', KEY)).status, 101, 'block lifted after 15 minutes');

    // A successful handshake resets the consecutive counter.
    const ok = async (ip) => registerHost(relay, port, { 'x-forwarded-for': ip, 'x-sideline-enrollment': KEY });
    assert.equal((await as('10.1.0.3', 'nope')).status, 403);
    assert.equal((await as('10.1.0.3', 'nope')).status, 403);
    await ok('10.1.0.3');
    assert.equal((await as('10.1.0.3', 'nope')).status, 403);
    assert.equal((await as('10.1.0.3', 'nope')).status, 403);
    assert.equal((await as('10.1.0.3', KEY)).status, 101, 'not blocked: the count restarted after the success');

    // Failed hello signatures count too.
    for (let i = 0; i < 3; i += 1) {
      const host = await connectHost(port, { 'x-forwarded-for': '10.1.0.4', 'x-sideline-enrollment': KEY });
      host.send(helloFor(makeIdentity(), host.challenge.nonce, crypto.randomBytes(64).toString('base64url')));
      assert.ok(await waitUntil(() => host.closed));
      assert.equal(host.closed.code, 4403);
    }
    assert.equal((await as('10.1.0.4', KEY)).status, 429);
  } finally { await relay.close(); }
});

test('RA4A-8. browser HTTP is rate limited per identity without affecting others', async () => {
  const clock = makeClock();
  const { relay, port, events } = await startEngine({ rateLimits: { httpPerWindow: 5 }, trustProxy: true, now: clock.now });
  try {
    const as = (ip) => browser(port, OFFLINE_HOST, { path: '/api/status', headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 5; i += 1) assert.equal((await as('10.2.0.1')).status, 503, 'passes the limiter (host is offline)');
    const limited = await as('10.2.0.1');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['content-type'], 'application/json');
    assert.equal(JSON.parse(limited.text).code, 'rate_limited');
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    assert.equal((await as('10.2.0.2')).status, 503, 'another client is unaffected');
    assert.equal((await plainGet(port, '/health', 'GET', { 'X-Forwarded-For': '10.2.0.1' })).status, 200, 'health is never limited');
    assert.ok(events.some((e) => e.event === 'rate_limit' && e.scope === 'http'));
    clock.advance(61_000);
    assert.equal((await as('10.2.0.1')).status, 503);
  } finally { await relay.close(); }
});

test('RA4A-9. pairing exchange has a tighter dedicated bucket and the secret-gated semantics are untouched', async () => {
  const clock = makeClock();
  const { relay, port } = await startEngine({ rateLimits: { httpPerWindow: 100, pairingPerWindow: 3 }, trustProxy: true, now: clock.now });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4a-p-'));
  const daemon = new ControlPlaneDaemon({
    dir, port: 44500 + Math.floor(Math.random() * 400), idleTimeoutMs: 60_000,
    remoteRelay: { relayUrl: `ws://127.0.0.1:${port}/tunnel/v1`, relayDomain: 'localhost', tuning: { backoffScheduleMs: [50] } }
  });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const hostPublicId = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote')).hostPublicId;
    await fetch(`http://127.0.0.1:${daemon.port}/api/preferences`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ remoteAccess: { enabled: true } }) });
    assert.ok(await waitUntil(() => relay.isHostConnected(hostPublicId)));
    const exchange = (secret, ip = '10.3.0.1') => browser(port, hostPublicId, { method: 'POST', path: '/api/pairing/exchange', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ secret, label: 'Phone' }) });
    const pairing = daemon.pairingStore.createPairing();
    assert.equal((await exchange('wrong-secret')).status, 401, 'wrong secret still refused by the host');
    const ok = await exchange(pairing.secret);
    assert.equal(ok.status, 200, 'right secret still succeeds within the limit');
    assert.match(String(ok.headers['set-cookie']), /^sl_dev=/);
    assert.equal((await exchange('wrong-secret')).status, 401);
    const limited = await exchange(daemon.pairingStore.createPairing().secret);
    assert.equal(limited.status, 429, 'fourth exchange in the window hits the pairing bucket even with a valid secret');
    assert.equal((await exchange(daemon.pairingStore.createPairing().secret, '10.3.0.2')).status, 200, 'another identity is unaffected');
    // The general bucket is separate: same identity can still make ordinary requests.
    const cookie = String(ok.headers['set-cookie']).split(';', 1)[0];
    assert.equal((await browser(port, hostPublicId, { path: '/api/status', headers: { Cookie: cookie, 'X-Forwarded-For': '10.3.0.1' } })).status, 200);
    clock.advance(61_000);
    assert.equal((await exchange(daemon.pairingStore.createPairing().secret)).status, 200, 'window recovered');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    await relay.close();
  }
});

test('RA4A-10. forwarded headers cannot choose the limiter identity (unless proxy trust is explicit) and never reach the host', async () => {
  // Untrusted: rotating forged XFF does not evade the limit.
  const a = await startEngine({ rateLimits: { httpPerWindow: 3 }, trustProxy: false });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await browser(a.port, OFFLINE_HOST, { path: '/api/x', headers: { 'X-Forwarded-For': `9.9.9.${i}` } })).status);
    assert.deepEqual(statuses, [503, 503, 503, 429, 429], 'identity stayed the socket peer despite forged X-Forwarded-For');
    // Handshakes too.
    const b = await startEngine({ rateLimits: { handshakePerWindow: 2 }, trustProxy: false });
    try {
      const results = [];
      for (let i = 0; i < 4; i += 1) results.push((await upgradeAttempt(b.port, { 'x-forwarded-for': `8.8.8.${i}` })).status);
      assert.deepEqual(results, [101, 101, 429, 429]);
    } finally { await b.relay.close(); }
  } finally { await a.relay.close(); }

  // Trusted mode uses the rightmost entry (appended by the edge); a client-forged left part is ignored.
  const t = await startEngine({ rateLimits: { httpPerWindow: 1 }, trustProxy: true });
  try {
    assert.equal((await browser(t.port, OFFLINE_HOST, { headers: { 'X-Forwarded-For': 'forged-1, 7.7.7.7' } })).status, 503);
    assert.equal((await browser(t.port, OFFLINE_HOST, { headers: { 'X-Forwarded-For': 'forged-2, 7.7.7.7' } })).status, 429);
    assert.equal((await browser(t.port, OFFLINE_HOST, { headers: { 'X-Forwarded-For': 'forged-1, 7.7.7.8' } })).status, 503);
  } finally { await t.relay.close(); }

  // Proxy metadata never enters a RelayReqFrame, in either mode.
  for (const trustProxy of [false, true]) {
    const { relay, port } = await startEngine({ trustProxy });
    try {
      const { host, id } = await registerHost(relay, port);
      void browser(port, id.hostPublicId, {
        path: '/api/x',
        headers: { 'X-Forwarded-For': '1.2.3.4', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Port': '443', Forwarded: 'for=1.2.3.4', 'X-Real-IP': '1.2.3.4', 'Fly-Client-IP': '1.2.3.4', Accept: 'application/json' }
      });
      assert.ok(await waitUntil(() => host.reqs().length === 1));
      assert.deepEqual(Object.keys(host.reqs()[0].headers), ['accept']);
      host.ws.close();
    } finally { await relay.close(); }
  }
});

test('RA4A-11. structured production logs are metadata-only: no sentinel secret ever appears', async () => {
  const lines = [];
  const config = loadConfig({ PORT: '0', BIND_HOST: '127.0.0.1', RELAY_DOMAIN: 'localhost', ENROLLMENT_KEY: 'ENROLL-SENTINEL-0123456789', DRAIN_MS: '300' });
  const running = await startProductionRelay(config, (line) => lines.push(line));
  const { relay, port } = running;
  try {
    const { host, id } = await registerHost(relay, port, { 'x-sideline-enrollment': 'ENROLL-SENTINEL-0123456789' });
    const response = browser(port, id.hostPublicId, {
      method: 'POST', path: '/api/pairing/exchange?token=QUERY-SENTINEL#FRAG-SENTINEL', body: '{"secret":"BODY-SENTINEL"}',
      headers: { Cookie: 'sl_dev=COOKIE-SENTINEL', Authorization: 'Bearer AUTH-SENTINEL', 'Proxy-Authorization': 'Basic PROXY-SENTINEL', 'Content-Type': 'application/json' }
    });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const rid = host.reqs()[0].id;
    assert.equal(host.reqs()[0].body, '{"secret":"BODY-SENTINEL"}', 'the body did travel (so its absence from logs is meaningful)');
    host.send({ t: 'head', id: rid, status: 200, headers: { 'set-cookie': 'sl_dev=SETCOOKIE-SENTINEL; HttpOnly' } });
    host.send({ t: 'data', id: rid, chunk: 'RESPONSE-SENTINEL' });
    host.send({ t: 'end', id: rid });
    await response;
    await upgradeAttempt(port, { 'x-sideline-enrollment': 'WRONG-ENROLL-SENTINEL' });
    await upgradeAttempt(port);
    await browser(port, OFFLINE_HOST, { path: '/api/x?secret=QUERY2-SENTINEL', headers: { Cookie: 'sl_dev=COOKIE2-SENTINEL' } });
    host.ws.close();
    await waitUntil(() => !relay.isHostConnected(id.hostPublicId));
    const text = lines.join('');
    assert.doesNotMatch(text, /SENTINEL/, 'no sentinel value anywhere in the structured log output');
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.length >= 5);
    const allowed = new Set(['ts', 'event', 'hostPublicId', 'method', 'path', 'status', 'bytes', 'durationMs', 'scope', 'client', 'code', 'phase', 'port', 'relayDomain', 'enrollment', 'trustProxy', 'clientIpSource']);
    for (const record of records) {
      assert.ok(Object.keys(record).every((key) => allowed.has(key)), `unexpected log field in ${JSON.stringify(record)}`);
      assert.equal(typeof record.event, 'string');
    }
    const req = records.find((r) => r.event === 'req' && r.path === '/api/pairing/exchange');
    assert.ok(req, 'request logged with pathname only');
    assert.equal(req.method, 'POST');
    assert.equal(req.status, 200);
    assert.ok(records.some((r) => r.event === 'enrollment_rejected'));
    assert.ok(records.some((r) => r.event === 'connect') && records.some((r) => r.event === 'disconnect'));
  } finally { await running.shutdown(); }
});

test('RA4A-12. graceful shutdown: goaway shutdown to hosts, new work refused, in-flight drains or hits the bounded timeout, everything cleaned', async () => {
  // (a) in-flight work completes during the drain.
  const a = await startEngine();
  try {
    const { host, id } = await registerHost(a.relay, a.port);
    const inflight = browser(a.port, id.hostPublicId, { path: '/api/slow' });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const started = Date.now();
    const done = a.relay.shutdown(3000);
    assert.ok(await waitUntil(() => host.frames.some((f) => f.t === 'goaway')));
    assert.deepEqual(host.frames.find((f) => f.t === 'goaway'), { t: 'goaway', reason: 'shutdown' });
    const late = await browser(a.port, id.hostPublicId, { path: '/api/new' }).catch(() => ({ status: 0 }));
    assert.ok(late.status === 0 || late.status === 503, `new work refused (got ${late.status})`);
    assert.equal((await upgradeAttempt(a.port)).status === 101, false, 'no new tunnels accepted');
    const rid = host.reqs()[0].id;
    host.send({ t: 'head', id: rid, status: 200, headers: {} });
    host.send({ t: 'data', id: rid, chunk: 'drained' });
    host.send({ t: 'end', id: rid });
    const res = await inflight;
    assert.equal(res.status, 200);
    assert.equal(res.text, 'drained', 'existing work completed during the drain');
    await done;
    assert.ok(Date.now() - started < 2500, 'drain ended as soon as work finished');
    assert.deepEqual([a.relay.inflight.size, a.relay.hosts.size, a.relay.pending.size, a.relay.wss.clients.size, a.relay.socketClient.size], [0, 0, 0, 0, 0]);
    assert.equal(a.relay.pingTimer, undefined);
    assert.equal(a.relay.server.listening, false);
    assert.ok(a.events.some((e) => e.event === 'shutdown' && e.phase === 'draining') && a.events.some((e) => e.event === 'shutdown' && e.phase === 'closed'));
  } finally { await a.relay.close(); }

  // (b) stuck work is cut at the bounded timeout.
  const b = await startEngine();
  try {
    const { host, id } = await registerHost(b.relay, b.port);
    const stuck = browser(b.port, id.hostPublicId, { path: '/api/never' });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const t0 = Date.now();
    await b.relay.shutdown(300);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 250 && elapsed < 2000, `bounded drain took ${elapsed} ms`);
    assert.equal((await stuck).status, 503, 'stuck request released');
    assert.deepEqual([b.relay.inflight.size, b.relay.hosts.size, b.relay.wss.clients.size], [0, 0, 0]);
    assert.ok(await waitUntil(() => host.closed), 'host socket closed');
  } finally { await b.relay.close(); }
});
