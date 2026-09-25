import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { PairingStore, PAIRING_TTL_MS, PAIRING_CODE_ALPHABET } from '../out/control-plane/pairing.js';
import { DeviceRegistry, DEVICE_IDLE_EXPIRY_MS } from '../out/control-plane/device-registry.js';
import { classifyDaemonRoute, principalMayAccess } from '../out/control-plane/remote-routes.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';

const tempRemoteDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-host-id-')), 'remote');
const cleanup = (dir) => fs.rmSync(path.dirname(dir), { recursive: true, force: true });

test('RA2A-1. new host identity is generated with a 20-char lowercase base32 hostPublicId that matches the key', () => {
  const dir = tempRemoteDir();
  try {
    const identity = new HostIdentityManager().ensureIdentity(dir);
    assert.match(identity.hostPublicId, /^[a-z2-7]{20}$/);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'host-key.json'), 'utf8'));
    assert.equal(stored.version, 1);
    assert.equal(stored.hostPublicId, identity.hostPublicId);
    assert.match(stored.publicKeyHex, /^[0-9a-f]{64}$/);
    assert.match(stored.privateKeyHex, /^[0-9a-f]{64}$/);
    // Independent derivation: base32(sha256(rawPublicKey)), first 20 chars.
    const digest = crypto.createHash('sha256').update(Buffer.from(stored.publicKeyHex, 'hex')).digest();
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const bits = [...digest].map((byte) => byte.toString(2).padStart(8, '0')).join('');
    let expected = '';
    for (let i = 0; expected.length < 20; i += 5) expected += alphabet[parseInt(bits.slice(i, i + 5), 2)];
    assert.equal(identity.hostPublicId, expected);
    const sig = crypto.sign(null, Buffer.from('challenge'), identity.privateKey);
    assert.equal(crypto.verify(null, Buffer.from('challenge'), identity.publicKey, sig), true, 'stored key is a working Ed25519 pair');
    assert.deepEqual(fs.readdirSync(dir), ['host-key.json'], 'no temp file left behind');
  } finally {
    cleanup(dir);
  }
});

test('RA2A-2. reloading an existing identity returns the same hostPublicId and does not rewrite the file', () => {
  const dir = tempRemoteDir();
  try {
    const first = new HostIdentityManager().ensureIdentity(dir);
    const file = path.join(dir, 'host-key.json');
    const before = fs.readFileSync(file, 'utf8');
    const second = new HostIdentityManager().ensureIdentity(dir);
    assert.equal(second.hostPublicId, first.hostPublicId);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally {
    cleanup(dir);
  }
});

test('RA2A-3. an existing corrupt or inconsistent host key fails closed and is never overwritten', () => {
  const dir = tempRemoteDir();
  try {
    const manager = new HostIdentityManager();
    manager.ensureIdentity(dir);
    const file = path.join(dir, 'host-key.json');
    const good = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cases = [
      'not json {',
      '',
      JSON.stringify({ version: 2 }),
      JSON.stringify({ ...good, hostPublicId: 'a'.repeat(20) }),
      JSON.stringify({ ...good, privateKeyHex: '00'.repeat(32) })
    ];
    for (const content of cases) {
      fs.writeFileSync(file, content);
      assert.throws(() => manager.ensureIdentity(dir), /Refusing to overwrite existing host key/);
      assert.equal(fs.readFileSync(file, 'utf8'), content, 'corrupt file is left exactly as found');
    }
  } finally {
    cleanup(dir);
  }
});

test('RA2A-4. host key file is owner-only where the platform exposes POSIX mode', { skip: process.platform === 'win32' }, () => {
  const dir = tempRemoteDir();
  try {
    new HostIdentityManager().ensureIdentity(dir);
    assert.equal(fs.statSync(path.join(dir, 'host-key.json')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(dir).mode & 0o077, 0, 'remote directory is not group/world accessible');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------- Slice 2B

const request = (port, route, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : undefined }));
  });
  req.on('error', reject);
  if (body !== undefined) req.write(JSON.stringify(body));
  req.end();
});

const makeDaemon = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-remote-stage2-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 42200 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  return { daemon, dir, token, stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
};

const bearer = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const json = { 'Content-Type': 'application/json' };

test('RA2B-1. pairing create is local-admin only; unauthenticated and remote callers are denied', async () => {
  const h = await makeDaemon();
  try {
    assert.equal(classifyDaemonRoute('POST', '/api/pairing/create'), 'local-only');
    assert.equal((await request(h.daemon.port, '/api/pairing/create', { method: 'POST' })).status, 401);
    const created = await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) });
    assert.equal(created.status, 200);
    assert.equal(created.body.success, true);
    assert.ok(created.body.secret.length >= 22, '128-bit secret, base64url');
    assert.match(created.body.code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    assert.ok(created.body.expiresAt > Date.now());

    const remote = { kind: 'remote-device', deviceId: 'paired-1', authenticatedBy: 'in-process', expectedOrigin: 'https://h-test.sideline.live' };
    for (const [method, url] of [['POST', '/api/pairing/create'], ['GET', '/api/devices'], ['DELETE', '/api/devices'], ['PATCH', '/api/devices/abc'], ['DELETE', '/api/devices/abc']]) {
      const res = { headersSent: false, status: undefined, writeHead(status) { this.status = status; this.headersSent = true; }, setHeader() {}, end() {} };
      const req = Readable.from([]);
      Object.assign(req, { method, url, headers: { origin: remote.expectedOrigin, 'x-sideline-action': '1' }, socket: {} });
      await h.daemon.handleHttpRequest(req, res, remote);
      assert.equal(res.status, 403, `${method} ${url} is denied to remote-device`);
    }
  } finally {
    await h.stop();
  }
});

test('RA2B-2. QR secret works once; reuse fails; wrong secret fails; fallback code works once', () => {
  const store = new PairingStore();
  const a = store.createPairing();
  assert.equal(store.exchange({ secret: 'wrong-secret' }).ok, false);
  assert.equal(store.exchange({ secret: a.secret }).ok, true);
  assert.equal(store.exchange({ secret: a.secret }).ok, false, 'secret is single use');
  assert.equal(store.exchange({ code: a.code }).ok, false, 'consuming the secret consumes the whole pairing');

  const b = store.createPairing();
  assert.equal(store.exchange({ code: b.code.toLowerCase() }).ok, true, 'fallback code normalizes case and separator');
  assert.equal(store.exchange({ code: b.code }).ok, false);
  const c = store.createPairing();
  assert.equal(store.exchange({ code: c.code.replace('-', '') }).ok, true);
  assert.equal(store.exchange({}).ok, false);
});

test('RA2B-3. pairing expires after 5 minutes; fallback code is 8 chars from the alphabet', () => {
  let now = 1_000_000;
  const store = new PairingStore(() => now);
  const p = store.createPairing();
  assert.equal(p.expiresAt, now + PAIRING_TTL_MS);
  now += PAIRING_TTL_MS;
  assert.equal(store.exchange({ secret: p.secret }).ok, false, 'expired secret fails');
  const q = store.createPairing();
  now += PAIRING_TTL_MS + 1;
  assert.equal(store.exchange({ code: q.code }).ok, false, 'expired code fails');

  const raw = store.createPairing().code.replace('-', '');
  assert.equal(raw.length, 8);
  for (const ch of raw) assert.ok(PAIRING_CODE_ALPHABET.includes(ch));
  assert.equal(PAIRING_CODE_ALPHABET.length, 30);
});

test('RA2B-4. five failed attempts burn the pairing for both secret and code', () => {
  const store = new PairingStore();
  const p = store.createPairing();
  for (let i = 0; i < 4; i += 1) assert.equal(store.exchange({ code: 'AAAA-AAAA' }).ok, false);
  assert.deepEqual(store.exchange({ code: 'AAAA-AAAA' }), { ok: false, reason: 'burned' });
  assert.equal(store.exchange({ code: p.code }).ok, false, 'correct code no longer works');
  assert.equal(store.exchange({ secret: p.secret }).ok, false, 'correct secret no longer works');

  const q = store.createPairing();
  for (let i = 0; i < 4; i += 1) store.exchange({ secret: 'nope' });
  assert.equal(store.exchange({ secret: q.secret }).ok, true, 'four failures do not burn it');
});

test('RA2B-5. only SHA-256 hashes of secret and code are retained in memory', () => {
  const store = new PairingStore();
  const p = store.createPairing();
  const raw = p.code.replace('-', '');
  const internals = JSON.stringify([...store.records.values()]);
  assert.ok(!internals.includes(p.secret) && !internals.includes(raw) && !internals.includes(p.code));
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
  const [record] = [...store.records.values()];
  assert.equal(record.secretHash, sha(p.secret));
  assert.equal(record.codeHash, sha(raw));
  assert.equal(new PairingStore().records.size, 0, 'a fresh store (e.g. after daemon restart) has no pairings');
});

test('RA2B-6. exchange issues sl_dev once, stores only the token hash, and a loopback sl_dev is never a principal', async () => {
  assert.equal(classifyDaemonRoute('POST', '/api/pairing/exchange'), 'public');
  const h = await makeDaemon();
  try {
    const pairing = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    const bad = await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: 'wrong' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers['set-cookie'], undefined, 'failed exchange issues no device');
    assert.equal((await request(h.daemon.port, '/api/devices', { headers: bearer(h.token) })).body.devices.length, 0);

    const ok = await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: pairing.secret, label: 'Dad phone' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    assert.match(ok.body.deviceId, /^[0-9a-f]{32}$/);
    const cookie = ok.headers['set-cookie'][0];
    assert.match(cookie, /^sl_dev=[A-Za-z0-9_-]{43};/, '256-bit token');
    for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i, /Path=\//]) assert.match(cookie, flag);
    const rawToken = cookie.split(';', 1)[0].slice('sl_dev='.length);

    const reuse = await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: pairing.secret } });
    assert.equal(reuse.status, 401);

    const disk = fs.readFileSync(path.join(h.dir, 'remote', 'devices.json'), 'utf8');
    assert.ok(!disk.includes(rawToken), 'raw device token is never written to devices.json');
    const stored = JSON.parse(disk).devices;
    assert.equal(stored.length, 1);
    assert.deepEqual(Object.keys(stored[0]).sort(), ['createdAt', 'deviceId', 'label', 'lastSeenAt', 'tokenHash']);
    assert.equal(stored[0].tokenHash, crypto.createHash('sha256').update(rawToken).digest('hex'));
    assert.equal(stored[0].label, 'Dad phone');

    const listed = await request(h.daemon.port, '/api/devices', { headers: bearer(h.token) });
    assert.equal(listed.status, 200);
    assert.ok(!JSON.stringify(listed.body).includes('tokenHash'));

    assert.equal((await request(h.daemon.port, '/api/status', { headers: { Cookie: `sl_dev=${rawToken}` } })).status, 401, 'loopback sl_dev does not authenticate');

    const second = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    const viaCode = await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { code: second.code } });
    assert.equal(viaCode.status, 200, 'fallback code exchanges over HTTP');
  } finally {
    await h.stop();
  }
});

test('RA2B-7. device management via local-admin: list omits hashes, rename, revoke, revoke-all', async () => {
  const h = await makeDaemon();
  try {
    assert.equal(classifyDaemonRoute('GET', '/api/devices'), 'local-only');
    assert.equal(classifyDaemonRoute('DELETE', '/api/devices'), 'local-only');
    assert.equal(classifyDaemonRoute('PATCH', '/api/devices/abc'), 'local-only');
    assert.equal(classifyDaemonRoute('DELETE', '/api/devices/abc'), 'local-only');
    assert.equal(principalMayAccess({ kind: 'remote-device', deviceId: 'x', authenticatedBy: 'in-process' }, 'local-only'), false);
    assert.equal((await request(h.daemon.port, '/api/devices')).status, 401);

    const pair = async (label) => {
      const p = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
      return (await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: p.secret, label } })).body.deviceId;
    };
    const a = await pair('A');
    const b = await pair('B');
    const c = await pair('C');
    const list = () => request(h.daemon.port, '/api/devices', { headers: bearer(h.token) }).then((r) => r.body.devices);
    assert.deepEqual((await list()).map((d) => d.label).sort(), ['A', 'B', 'C']);

    const renamed = await request(h.daemon.port, `/api/devices/${a}`, { method: 'PATCH', headers: bearer(h.token), body: { label: 'Kitchen iPad' } });
    assert.equal(renamed.status, 200);
    assert.equal((await list()).find((d) => d.deviceId === a).label, 'Kitchen iPad');

    assert.equal((await request(h.daemon.port, `/api/devices/${b}`, { method: 'DELETE', headers: bearer(h.token) })).status, 200);
    assert.deepEqual((await list()).map((d) => d.deviceId).sort(), [a, c].sort());
    assert.equal((await request(h.daemon.port, `/api/devices/${b}`, { method: 'DELETE', headers: bearer(h.token) })).status, 404);

    assert.equal((await request(h.daemon.port, '/api/devices', { method: 'DELETE', headers: bearer(h.token) })).status, 200);
    assert.deepEqual(await list(), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.dir, 'remote', 'devices.json'), 'utf8')).devices, []);
  } finally {
    await h.stop();
  }
});

test('RA2B-8. DeviceRegistry: 30-day sliding idle expiry, lastSeenAt slides, persists and reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-devreg-'));
  const file = path.join(dir, 'remote', 'devices.json');
  try {
    let now = 5_000_000;
    const registry = new DeviceRegistry(file, () => now);
    const { deviceId, rawToken } = registry.createDevice('Phone');
    assert.ok(!('tokenHash' in registry.list()[0]));
    assert.equal(registry.authenticate('not-the-token'), undefined);

    now += DEVICE_IDLE_EXPIRY_MS - 1000;
    const first = registry.authenticate(rawToken);
    assert.equal(first.deviceId, deviceId);
    assert.equal(first.lastSeenAt, now, 'authentication slides lastSeenAt');

    now += DEVICE_IDLE_EXPIRY_MS - 1000; // idle < 30d since the slide, but > 30d since creation
    assert.ok(registry.authenticate(rawToken), 'sliding window keeps an active device alive');

    const reloaded = new DeviceRegistry(file, () => now);
    assert.equal(reloaded.list().length, 1, 'registry survives restart');
    assert.ok(reloaded.authenticate(rawToken));

    now += DEVICE_IDLE_EXPIRY_MS + 1;
    assert.equal(reloaded.authenticate(rawToken), undefined, 'stale device is rejected');
    assert.equal(reloaded.list().length, 0, 'expired device is pruned');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['devices.json'], 'no temp files left behind');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Slice 2C

const TRUSTED_ORIGIN = 'https://h-test.sideline.live';

const makeRemote = async () => {
  const h = await makeDaemon();
  const adapter = new InProcessRemoteAdapter({ daemon: h.daemon, deviceRegistry: h.daemon.deviceRegistry, expectedOrigin: TRUSTED_ORIGIN });
  const pairDevice = (label = 'Phone') => h.daemon.deviceRegistry.createDevice(label);
  let counter = 0;
  const call = async (frame) => {
    const frames = [];
    await adapter.dispatch({ id: `req-${++counter}`, headers: {}, ...frame }, (f) => frames.push(f));
    const head = frames.find((f) => f.t === 'head');
    const text = frames.filter((f) => f.t === 'data').map((f) => f.chunk).join('');
    return { frames, head, status: head?.status, text, json: text ? JSON.parse(text) : undefined };
  };
  return { ...h, adapter, pairDevice, call, nextId: () => `req-${++counter}` };
};

const cookieOf = (rawToken) => ({ cookie: `sl_dev=${rawToken}` });
const mutationHeaders = (rawToken, extra = {}) => ({ ...cookieOf(rawToken), 'x-sideline-action': '1', origin: TRUSTED_ORIGIN, 'content-type': 'application/json', ...extra });

test('RA2C-1. valid sl_dev authenticates through the adapter; remote-read route works; JSON becomes head/data/end frames', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const out = await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(rawToken) });
    assert.equal(out.status, 200);
    assert.deepEqual(out.frames.map((f) => f.t), ['head', 'data', 'end']);
    assert.equal(out.head.headers['content-type'], 'application/json');
    assert.ok(out.frames.every((f) => f.id === out.head.id));
    assert.equal(typeof out.json, 'object');
  } finally {
    await r.stop();
  }
});

test('RA2C-2. invalid, revoked, and expired tokens get 401 before daemon routing and no refreshed cookie', async () => {
  const r = await makeRemote();
  try {
    const seen = [];
    const original = r.daemon.dispatchRemoteRequest.bind(r.daemon);
    r.daemon.dispatchRemoteRequest = (...args) => { seen.push(args); return original(...args); };

    const bogus = await r.call({ method: 'GET', path: '/api/status', headers: cookieOf('not-a-real-token') });
    assert.equal(bogus.status, 401);
    assert.equal(bogus.head.headers['set-cookie'], undefined);
    assert.equal((await r.call({ method: 'GET', path: '/api/status' })).status, 401, 'no cookie at all');

    const revoked = r.pairDevice('gone');
    assert.equal((await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(revoked.rawToken) })).status, 200);
    r.daemon.deviceRegistry.revoke(revoked.deviceId);
    const afterRevoke = await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(revoked.rawToken) });
    assert.equal(afterRevoke.status, 401);
    assert.equal(afterRevoke.head.headers['set-cookie'], undefined, 'revoked device is not refreshed');

    const stale = r.pairDevice('stale');
    const record = r.daemon.deviceRegistry.devices.find((d) => d.deviceId === stale.deviceId);
    record.lastSeenAt = Date.now() - DEVICE_IDLE_EXPIRY_MS - 1000;
    const expired = await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(stale.rawToken) });
    assert.equal(expired.status, 401);
    assert.equal(expired.head.headers['set-cookie'], undefined, 'expired device is not refreshed');

    assert.equal(seen.length, 1, 'only the one valid request entered daemon routing');
  } finally {
    await r.stop();
  }
});

test('RA2C-3. local-only routes are 403; admin Bearer and ?token= cannot elevate a remote request', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const shutdown = await r.call({ method: 'POST', path: '/api/control-plane/shutdown', headers: mutationHeaders(rawToken) });
    assert.ok([401, 403].includes(shutdown.status), 'shutdown is refused (the freshness handler answers 401 to non-local principals)');
    assert.equal((await r.call({ method: 'GET', path: '/api/diagnostics', headers: cookieOf(rawToken) })).status, 403);

    const bearerHeaders = { ...mutationHeaders(rawToken), authorization: `Bearer ${r.token}` };
    assert.equal((await r.call({ method: 'POST', path: '/api/pairing/create', headers: bearerHeaders, body: '{}' })).status, 403, 'Bearer does not unlock local-only');
    assert.equal((await r.call({ method: 'GET', path: '/api/devices', headers: { ...cookieOf(rawToken), authorization: `Bearer ${r.token}` } })).status, 403);
    assert.equal((await r.call({ method: 'GET', path: '/api/status', headers: { authorization: `Bearer ${r.token}` } })).status, 401, 'Bearer alone is not a remote credential');

    assert.equal((await r.call({ method: 'GET', path: `/api/status?token=${encodeURIComponent(r.token)}`, headers: cookieOf(rawToken) })).status, 401);
    assert.equal((await r.call({ method: 'GET', path: '/api/status?token=x' })).status, 401);
  } finally {
    await r.stop();
  }
});

test('RA2C-4. remote mutations need X-Sideline-Action + the trusted expectedOrigin (never Host)', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const path = '/api/queue/work-1/cancel';
    const base = { method: 'POST', path };
    assert.equal((await r.call({ ...base, headers: { ...cookieOf(rawToken), origin: TRUSTED_ORIGIN } })).status, 403, 'missing action header');
    assert.equal((await r.call({ ...base, headers: mutationHeaders(rawToken, { origin: 'https://evil.test' }) })).status, 403, 'foreign Origin');
    assert.equal((await r.call({ ...base, headers: mutationHeaders(rawToken, { origin: 'https://spoofed.test', host: 'spoofed.test' }) })).status, 403, 'Host header is not trusted');
    const { origin: _omit, ...noOrigin } = mutationHeaders(rawToken);
    assert.equal((await r.call({ ...base, headers: noOrigin })).status, 403, 'missing Origin');
    const ok = await r.call({ ...base, headers: mutationHeaders(rawToken) });
    assert.notEqual(ok.status, 403, 'matching trusted origin reaches normal route handling');
    assert.ok(ok.status === 404 || ok.status === 200 || ok.status === 409);
  } finally {
    await r.stop();
  }
});

test('RA2C-5. sl_dev is refreshed to a 30-day Max-Age on authenticated requests; existing headers survive', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const before = r.daemon.deviceRegistry.devices[0].lastSeenAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const out = await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(rawToken) });
    assert.equal(out.head.headers['set-cookie'], `sl_dev=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
    assert.equal(out.head.headers['content-type'], 'application/json', 'daemon headers are preserved');
    assert.ok(r.daemon.deviceRegistry.devices[0].lastSeenAt > before, 'host-side idle window slid too');
    assert.ok(!fs.readFileSync(path.join(r.dir, 'remote', 'devices.json'), 'utf8').includes(rawToken), 'raw token is not persisted');
    // A 403 from an authenticated-but-forbidden route still keeps the live device alive.
    const denied = await r.call({ method: 'GET', path: '/api/diagnostics', headers: cookieOf(rawToken) });
    assert.match(denied.head.headers['set-cookie'], /Max-Age=2592000/);
  } finally {
    await r.stop();
  }
});

test('RA2C-6. pairing exchange bootstraps through the adapter without sl_dev and is not cookie-refreshed twice', async () => {
  const r = await makeRemote();
  try {
    const pairing = r.daemon.pairingStore.createPairing();
    const bad = await r.call({ method: 'POST', path: '/api/pairing/exchange', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong' }) });
    assert.equal(bad.status, 401);
    assert.equal(bad.head.headers['set-cookie'], undefined);
    const ok = await r.call({ method: 'POST', path: '/api/pairing/exchange', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: pairing.secret, label: 'Remote phone' }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.success, true);
    assert.match(ok.head.headers['set-cookie'], /^sl_dev=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/);
    // The freshly minted cookie now authenticates through the adapter.
    const rawToken = ok.head.headers['set-cookie'].split(';', 1)[0].slice('sl_dev='.length);
    assert.equal((await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(rawToken) })).status, 200);
    // Exchange is only bootstrap-exempt for exactly POST /api/pairing/exchange.
    assert.equal((await r.call({ method: 'GET', path: '/api/pairing/exchange' })).status, 401);
    assert.equal((await r.call({ method: 'POST', path: '/api/pairing/create' })).status, 401);
  } finally {
    await r.stop();
  }
});

test('RA2C-7. SSE streams separate data frames, and cancel(id) closes the subscription and heartbeat cleanly', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const frames = [];
    const id = r.nextId();
    const dispatched = r.adapter.dispatch({ id, method: 'GET', path: '/api/events', headers: cookieOf(rawToken) }, (f) => frames.push(f));
    await dispatched;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const head = frames.find((f) => f.t === 'head');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-type'], 'text/event-stream');
    assert.equal(head.headers['cache-control'], 'no-cache, no-transform');
    assert.match(head.headers['set-cookie'], /Max-Age=2592000/);
    const data = frames.filter((f) => f.t === 'data').map((f) => f.chunk);
    assert.ok(data.length >= 4, `multiple streamed frames, got ${data.length}`);
    for (const event of ['hello', 'status', 'ai-health', 'execution']) assert.ok(data.some((chunk) => chunk.startsWith(`event: ${event}\n`)), `${event} frame`);
    assert.ok(!frames.some((f) => f.t === 'end'), 'stream stays open');
    assert.equal(r.daemon.sseClients.size, 1);

    r.adapter.cancel(id);
    assert.equal(r.daemon.sseClients.size, 0, 'daemon removed the subscriber and cleared its heartbeat');
    assert.equal(frames.filter((f) => f.t === 'end').length, 1);
    const count = frames.length;
    r.daemon.broadcast('status', { after: 'cancel' });
    assert.equal(frames.length, count, 'nothing streams after cancel');
    r.adapter.cancel(id); // idempotent
    assert.equal(frames.filter((f) => f.t === 'end').length, 1);
  } finally {
    await r.stop();
  }
});

test('RA2C-8. a loopback request carrying sl_dev still never authenticates', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    assert.equal((await request(r.daemon.port, '/api/status', { headers: { Cookie: `sl_dev=${rawToken}` } })).status, 401);
    assert.equal((await request(r.daemon.port, '/api/events', { headers: { Cookie: `sl_dev=${rawToken}` } })).status, 401);
  } finally {
    await r.stop();
  }
});

// ---------------------------------------------------------------- Slice 2D: Stage 2 acceptance gate

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walkFiles(full) : [full];
});

test('RA2D-1. pairing secret is 128-bit random, fallback code is independent, and neither raw value is ever persisted', async () => {
  const store = new PairingStore();
  const seenSecrets = new Set();
  const seenCodes = new Set();
  for (let i = 0; i < 200; i += 1) {
    const p = store.createPairing();
    assert.equal(Buffer.from(p.secret, 'base64url').length, 16, '128-bit secret');
    assert.match(p.secret, /^[A-Za-z0-9_-]{22}$/);
    const raw = p.code.replace('-', '');
    assert.match(raw, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    seenSecrets.add(p.secret);
    seenCodes.add(raw);
  }
  assert.equal(seenSecrets.size, 200, 'no repeated secrets');
  assert.ok(seenCodes.size > 195, 'codes are fresh randomness, not a fixed function of anything constant');
  // Independence: two pairings never share code characters in a way tied to secret bytes -
  // the code is not a prefix/encoding of the secret.
  const q = store.createPairing();
  const secretHex = Buffer.from(q.secret, 'base64url').toString('hex').toUpperCase();
  assert.ok(!secretHex.includes(q.code.replace('-', '')));
  assert.ok(!q.secret.toUpperCase().includes(q.code.replace('-', '')));
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'pairing.ts'), 'utf8');
  assert.match(source, /generateFallbackCode\(\)[\s\S]*randomBytes\(16\)/, 'code drawn from its own randomBytes');
  assert.doesNotMatch(source.match(/function generateFallbackCode[\s\S]*?\n}\n/)[0], /secret/i, 'code generator never sees the secret');

  const h = await makeDaemon();
  try {
    const pairing = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: pairing.secret } });
    await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { code: 'ZZZZ-ZZZZ' } });
    const rawCode = pairing.code.replace('-', '');
    for (const file of walkFiles(h.dir)) {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!text.includes(pairing.secret) && !text.includes(rawCode), `${path.basename(file)} contains no raw pairing material`);
    }
  } finally {
    await h.stop();
  }
});

test('RA2D-2. pairing is memory-only, a new pairing supersedes the prior one, and every failure looks identical', async () => {
  const h = await makeDaemon();
  let second;
  try {
    const first = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    const replacement = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    const failures = [];
    failures.push(await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: first.secret } }));
    failures.push(await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { code: first.code } }));
    failures.push(await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: {} }));
    failures.push(await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: 'x' } }));
    for (const failure of failures) {
      assert.equal(failure.status, 401);
      assert.deepEqual(failure.body, { success: false, message: 'Pairing could not be verified.' }, 'generic body: no oracle detail');
      assert.equal(failure.headers['set-cookie'], undefined);
    }
    // Burn the replacement, then confirm burned/expired/unknown are indistinguishable from a wrong guess.
    for (let i = 0; i < 5; i += 1) await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { code: 'AAAA-AAAA' } });
    const burned = await request(h.daemon.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: replacement.secret } });
    assert.equal(burned.status, 401);
    assert.deepEqual(burned.body, failures[0].body);

    // Leave one live pairing, then restart the daemon on the same directory.
    second = (await request(h.daemon.port, '/api/pairing/create', { method: 'POST', headers: bearer(h.token) })).body;
    await h.daemon.stop();
    const restarted = new ControlPlaneDaemon({ dir: h.dir, port: 42700 + Math.floor(Math.random() * 200), idleTimeoutMs: 60_000 });
    await restarted.start();
    try {
      const after = await request(restarted.port, '/api/pairing/exchange', { method: 'POST', headers: json, body: { secret: second.secret } });
      assert.equal(after.status, 401, 'no pairing state survives a daemon restart');
    } finally {
      await restarted.stop();
    }
  } finally {
    fs.rmSync(h.dir, { recursive: true, force: true });
  }
});

test('RA2D-3. a corrupt devices.json honors no credential until replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-devreg-corrupt-'));
  const file = path.join(dir, 'remote', 'devices.json');
  try {
    const first = new DeviceRegistry(file);
    const { rawToken } = first.createDevice('Phone');
    assert.ok(new DeviceRegistry(file).authenticate(rawToken), 'valid registry reloads');
    for (const corrupt of ['not json {', '', '{"devices": "nope"}', '{"devices":[{"deviceId":1}]}']) {
      fs.writeFileSync(file, corrupt);
      const registry = new DeviceRegistry(file);
      assert.equal(registry.authenticate(rawToken), undefined, `no credential honored for: ${corrupt.slice(0, 20)}`);
      assert.deepEqual(registry.list(), []);
    }
    const replaced = new DeviceRegistry(file);
    const fresh = replaced.createDevice('New');
    assert.ok(new DeviceRegistry(file).authenticate(fresh.rawToken), 'registry works again once replaced');
    assert.equal(new DeviceRegistry(file).authenticate(rawToken), undefined, 'old credential stays dead');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RA2D-4. local Bearer and sl_local behavior are unchanged; remote-device is only constructible in the adapter', async () => {
  const h = await makeDaemon();
  try {
    assert.equal((await request(h.daemon.port, '/api/status', { headers: { Authorization: `Bearer ${h.token}` } })).status, 200);
    assert.equal((await request(h.daemon.port, '/api/status', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    const session = await request(h.daemon.port, '/api/session', { method: 'POST', headers: { Authorization: `Bearer ${h.token}` } });
    assert.equal(session.status, 200);
    const local = session.headers['set-cookie'][0].split(';', 1)[0];
    assert.equal((await request(h.daemon.port, '/api/status', { headers: { Cookie: local } })).status, 200);
    assert.equal((await request(h.daemon.port, '/api/status', { headers: { Cookie: 'sl_local=forged' } })).status, 401);
    const admin = await request(h.daemon.port, '/api/devices', { headers: bearer(h.token) });
    assert.equal(admin.status, 200, 'local admin is not a remote principal');
  } finally {
    await h.stop();
  }
  const daemonSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'utf8');
  const dispatchSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'remote-dispatch.ts'), 'utf8');
  assert.doesNotMatch(daemonSource, /kind:\s*'remote-device'\s*,/, 'daemon never constructs a remote-device principal');
  assert.match(dispatchSource, /kind:\s*'remote-device'\s*,/, 'the adapter is where it is constructed');
  assert.match(daemonSource, /principal: Extract<Principal, \{ kind: 'remote-device' \}>/, 'typed seam');
  assert.match(daemonSource, /private async handleHttpRequest/, 'generic injection stays private');
  const resolveBody = daemonSource.match(/private resolvePrincipal[\s\S]*?\n  }\n/)[0];
  assert.doesNotMatch(resolveBody, /sl_dev|remote-device/, 'resolvePrincipal is local-only');
});

test('RA2D-5. the pairing bootstrap exemption is exactly POST /api/pairing/exchange, and the placeholder never escapes', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const seen = [];
    const original = r.daemon.dispatchRemoteRequest.bind(r.daemon);
    r.daemon.dispatchRemoteRequest = (req, res, principal) => { seen.push({ method: req.method, url: req.url, principal }); return original(req, res, principal); };

    const deny = { method: 'GET', headers: {} };
    for (const frame of [
      { method: 'GET', path: '/api/pairing/exchange' },
      { method: 'PUT', path: '/api/pairing/exchange' },
      { method: 'DELETE', path: '/api/pairing/exchange' },
      { method: 'POST', path: '/api/pairing/exchange/' },
      { method: 'POST', path: '/api/pairing/exchange/extra' },
      { method: 'POST', path: '/API/pairing/exchange' },
      { method: 'POST', path: '/api/pairing/exchange%2F' },
      { method: 'POST', path: '/api/preferences?next=/api/pairing/exchange' },
      { method: 'GET', path: '/api/status?/api/pairing/exchange' },
      { method: 'POST', path: '/api/pairing/create' },
      { method: 'GET', path: '/api/devices' },
      { method: 'POST', path: '/api/dispatch', headers: { origin: TRUSTED_ORIGIN, 'x-sideline-action': '1' } },
      deny
    ]) {
      const out = await r.call({ headers: {}, ...frame, path: frame.path ?? '/api/status' });
      assert.equal(out.status, 401, `${frame.method} ${frame.path} gets no bootstrap exemption`);
    }
    assert.equal(seen.length, 0, 'none of those reached the daemon');

    // Query on the exchange URL: still the same secret-gated route, still no principal power elsewhere.
    const viaQuery = await r.call({ method: 'POST', path: '/api/pairing/exchange?x=1', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'wrong' }) });
    assert.equal(viaQuery.status, 401, 'exchange stays secret-gated');
    assert.deepEqual(viaQuery.json, { success: false, message: 'Pairing could not be verified.' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].principal.deviceId, 'unpaired');

    // Every other dispatched request carries the real device id, never the placeholder.
    await r.call({ method: 'GET', path: '/api/status', headers: cookieOf(rawToken) });
    await r.call({ method: 'GET', path: '/api/diagnostics', headers: cookieOf(rawToken) });
    await r.call({ method: 'POST', path: '/api/queue/x/cancel', headers: mutationHeaders(rawToken) });
    const realId = r.daemon.deviceRegistry.list()[0].deviceId;
    for (const entry of seen.slice(1)) assert.equal(entry.principal.deviceId, realId);
    assert.ok(seen.slice(1).every((entry) => entry.principal.deviceId !== 'unpaired'));
  } finally {
    await r.stop();
  }
});

test('RA2D-6. no header, cookie, or query value can select or forge remote-device or local-admin', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const seen = [];
    const original = r.daemon.dispatchRemoteRequest.bind(r.daemon);
    r.daemon.dispatchRemoteRequest = (req, res, principal) => { seen.push({ headers: { ...req.headers }, principal }); return original(req, res, principal); };

    const forged = {
      authorization: `Bearer ${r.token}`,
      'proxy-authorization': `Bearer ${r.token}`,
      'x-forwarded-for': '127.0.0.1',
      'x-sideline-principal': 'local-admin',
      'x-principal-kind': 'remote-device',
      'x-remote-device': 'attacker',
      cookie: `sl_local=forged; sl_dev=${rawToken}`
    };
    // No valid credential besides forged ones -> refused before dispatch.
    const noDevice = await r.call({ method: 'GET', path: '/api/status', headers: { ...forged, cookie: 'sl_local=forged' } });
    assert.equal(noDevice.status, 401);
    assert.equal(seen.length, 0);

    const withDevice = await r.call({ method: 'GET', path: '/api/diagnostics', headers: forged });
    assert.equal(withDevice.status, 403, 'still only a remote-device; forged headers do not elevate');
    assert.equal(seen.length, 1);
    const [entry] = seen;
    assert.equal(entry.principal.kind, 'remote-device');
    assert.equal(entry.principal.deviceId, r.daemon.deviceRegistry.list()[0].deviceId);
    for (const stripped of ['authorization', 'proxy-authorization', 'cookie', 'x-forwarded-for']) assert.equal(entry.headers[stripped], undefined, `${stripped} is stripped`);

    for (const [param, value] of [['token', r.token], ['principal', 'local-admin'], ['deviceId', 'x']]) {
      const out = await r.call({ method: 'GET', path: `/api/status?${param}=${encodeURIComponent(value)}`, headers: cookieOf(rawToken) });
      if (param === 'token') assert.equal(out.status, 401); else assert.equal(out.status, 200);
    }
  } finally {
    await r.stop();
  }
});

test('RA2D-7. route policy through the adapter: remote-read ok, remote-mutate guarded, local-only and /stadium refused (actual codes recorded)', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const codes = {};
    const record = async (label, frame) => { codes[label] = (await r.call(frame)).status; return codes[label]; };
    assert.equal(await record('GET /api/status (remote-read)', { method: 'GET', path: '/api/status', headers: cookieOf(rawToken) }), 200);
    assert.equal(await record('GET /api/preferences (remote-read)', { method: 'GET', path: '/api/preferences', headers: cookieOf(rawToken) }), 200);
    assert.equal(await record('POST /api/queue/x/cancel no action (remote-mutate)', { method: 'POST', path: '/api/queue/x/cancel', headers: cookieOf(rawToken) }), 403);
    assert.notEqual(await record('POST /api/queue/x/cancel guarded ok (remote-mutate)', { method: 'POST', path: '/api/queue/x/cancel', headers: mutationHeaders(rawToken) }), 403);
    for (const [method, route] of [
      ['GET', '/api/diagnostics'], ['GET', '/api/devices'], ['DELETE', '/api/devices'],
      ['POST', '/api/session'], ['POST', '/api/pairing/create'],
      ['POST', '/api/scout/openrouter-credential'], ['DELETE', '/api/scout/openrouter-credential']
    ]) {
      const status = await record(`${method} ${route} (local-only)`, { method, path: route, headers: mutationHeaders(rawToken) });
      assert.ok(status === 401 || status === 403, `${method} ${route} refused, got ${status}`);
    }
    for (const [method, route] of [
      ['POST', '/api/preferences'], ['POST', '/api/games/files/absolute-path'],
      ['POST', '/api/players/p1/field'], ['POST', '/api/game/add']
    ]) {
      const status = await record(`${method} ${route} (remote-allowed)`, { method, path: route, headers: mutationHeaders(rawToken) });
      assert.notEqual(status, 403, `${method} ${route} not 403`);
    }
    const shutdown = await record('POST /api/control-plane/shutdown (local-only)', { method: 'POST', path: '/api/control-plane/shutdown', headers: mutationHeaders(rawToken) });
    assert.ok(shutdown === 401 || shutdown === 403);
    const stadium = await record('GET /stadium', { method: 'GET', path: '/stadium', headers: cookieOf(rawToken) });
    assert.ok(stadium === 403 || stadium === 404, '/stadium unavailable remotely');
    assert.equal(r.daemon.deviceRegistry.list().length, 1);
    fs.writeFileSync(path.join(r.dir, 'stage2d-deny-codes.json'), JSON.stringify(codes, null, 2));
    console.log('ra2d-7 actual status codes', JSON.stringify(codes));
  } finally {
    await r.stop();
  }
});

test('RA2D-8. remote reports are redacted, local-admin stays verbatim, and the terminal override never disables hard-secret redaction', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const apiKey = 'sk-ant-api03-EXAMPLEEXAMPLEEXAMPLE1234567890';
    const bearerSecret = 'Authorization: Bearer abcdefghijklmnop1234567890';
    const reports = [{ path: 'REPORTS/Codex/x.md', content: `# Result\nkey=${apiKey}\n${bearerSecret}\nplain text stays` }];
    r.daemon.registry.getReportsForGame = () => reports;

    const local = await request(r.daemon.port, '/api/reports', { headers: bearer(r.token) });
    assert.equal(local.status, 200);
    assert.ok(JSON.stringify(local.body).includes(apiKey), 'local-admin sees the report verbatim');

    const remote = await r.call({ method: 'GET', path: '/api/reports', headers: cookieOf(rawToken) });
    assert.equal(remote.status, 200);
    assert.ok(!remote.text.includes(apiKey) && !remote.text.includes('abcdefghijklmnop1234567890'), 'secrets redacted for remote-device');
    assert.match(remote.text, /\[redacted\]/);
    assert.match(remote.text, /plain text stays/);

    const pref = await request(r.daemon.port, '/api/preferences', { method: 'POST', headers: bearer(r.token), body: { remoteSensitiveTerminalOutput: true } });
    assert.equal(pref.body.preferences.remoteSensitiveTerminalOutput, true);
    const override = await r.call({ method: 'GET', path: '/api/reports', headers: cookieOf(rawToken) });
    assert.ok(!override.text.includes(apiKey) && !override.text.includes('abcdefghijklmnop1234567890'), 'override does not disable hard-secret redaction');
    assert.ok(JSON.stringify((await request(r.daemon.port, '/api/reports', { headers: bearer(r.token) })).body).includes(apiKey), 'local still verbatim');
  } finally {
    await r.stop();
  }
});

test('RA2D-9. response framing preserves status and headers; sliding cookie never leaks the raw token to disk or to invalid devices', async () => {
  const r = await makeRemote();
  try {
    const { rawToken, deviceId } = r.pairDevice();
    const ok = await r.call({ method: 'GET', path: '/api/health', headers: cookieOf(rawToken) });
    assert.deepEqual(ok.frames.map((f) => f.t), ['head', 'data', 'end']);
    assert.equal(ok.head.status, 200);
    assert.equal(ok.head.headers['content-type'], 'application/json');
    assert.equal(ok.head.headers['set-cookie'], `sl_dev=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
    const missing = await r.call({ method: 'POST', path: '/api/queue/nope/cancel', headers: mutationHeaders(rawToken) });
    assert.match(missing.head.headers['set-cookie'] ?? '', /Max-Age=2592000/, 'authenticated non-2xx may refresh');
    for (const file of walkFiles(r.dir)) assert.ok(!fs.readFileSync(file, 'utf8').includes(rawToken), `${path.basename(file)} never holds the raw token`);

    r.daemon.deviceRegistry.revoke(deviceId);
    const dead = await r.call({ method: 'GET', path: '/api/health', headers: cookieOf(rawToken) });
    assert.equal(dead.head.status, 401);
    assert.equal(dead.head.headers['set-cookie'], undefined);

    // Exchange keeps its own single cookie, with no extra refresh header.
    const pairing = r.daemon.pairingStore.createPairing();
    const exchange = await r.call({ method: 'POST', path: '/api/pairing/exchange', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.code }) });
    assert.equal(exchange.status, 200);
    assert.match(exchange.head.headers['set-cookie'], /^sl_dev=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/);
  } finally {
    await r.stop();
  }
});

test('RA2D-10. SSE heartbeat passes through as streamed data; stream stays open until cancel; no data after cancel', async () => {
  const r = await makeRemote();
  try {
    const { rawToken } = r.pairDevice();
    const frames = [];
    const id = r.nextId();
    await r.adapter.dispatch({ id, method: 'GET', path: '/api/events', headers: cookieOf(rawToken) }, (f) => frames.push(f));
    assert.equal(frames.find((f) => f.t === 'head').headers['content-type'], 'text/event-stream');
    await new Promise((resolve) => setTimeout(resolve, 15_500));
    const data = frames.filter((f) => f.t === 'data').map((f) => f.chunk);
    assert.ok(data.some((chunk) => chunk.startsWith(': hb ')), 'heartbeat streamed as its own data frame');
    assert.ok(!frames.some((f) => f.t === 'end'), 'still open');
    r.adapter.cancel(id);
    assert.equal(r.daemon.sseClients.size, 0);
    const count = frames.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    r.daemon.broadcast('status', { late: true });
    assert.equal(frames.length, count, 'no data after cancellation');
  } finally {
    await r.stop();
  }
});

test('RA2D-11. every daemon route literal is still explicitly classified (default-deny intact with Stage 2 routes)', () => {
  const daemonSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'utf8');
  const literalPaths = new Set(['/stadium']);
  for (const match of daemonSource.matchAll(/['`](\/api\/[A-Za-z0-9_./:-]+)['`]/g)) literalPaths.add(match[1]);
  for (const pathname of literalPaths) assert.notEqual(classifyDaemonRoute('GET', pathname) ?? classifyDaemonRoute('POST', pathname) ?? classifyDaemonRoute('PATCH', pathname) ?? classifyDaemonRoute('DELETE', pathname), undefined, `${pathname} classified`);
  assert.equal(classifyDaemonRoute('POST', '/api/pairing/exchange'), 'public');
  assert.equal(classifyDaemonRoute('GET', '/api/pairing/exchange'), undefined);
  assert.equal(classifyDaemonRoute('PUT', '/api/devices'), undefined);
  assert.equal(classifyDaemonRoute('POST', '/api/pairing/exchange/'), undefined);
});
