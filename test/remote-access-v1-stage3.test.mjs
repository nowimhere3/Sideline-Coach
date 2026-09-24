import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InProcessRemoteAdapter, ALLOWED_REQUEST_HEADERS } from '../out/control-plane/remote-dispatch.js';
import { DeviceRegistry } from '../out/control-plane/device-registry.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../out/running-players.js';

// ---------------------------------------------------------------- Slice 3A

test('RA3A-1. every wire frame type round-trips through JSON without field loss', () => {
  const frames = [
    { t: 'challenge', nonce: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' },
    { t: 'req', id: '3f0c6c1e-5b0a-4f6e-9a55-1c2d3e4f5a6b', method: 'POST', path: '/api/x?v=1', headers: { accept: 'application/json' }, body: '{"a":1}' },
    { t: 'req', id: 'r2', method: 'POST', path: '/b', headers: {}, bodyB64: 'AAEC' },
    { t: 'cancel', id: 'r1' },
    { t: 'ping', ts: 1758664020000 },
    { t: 'goaway', reason: 'superseded' },
    { t: 'hello', v: 1, hostPublicId: 'abcdefghijklmnopqrst', publicKey: 'ab'.repeat(32), sig: 'c2ln', client: 'sideline/1.0' },
    { t: 'head', id: 'r1', status: 200, headers: { 'content-type': 'text/plain' } },
    { t: 'data', id: 'r1', chunk: 'hello' },
    { t: 'data', id: 'r1', chunkB64: 'AAEC' },
    { t: 'end', id: 'r1' },
    { t: 'error', id: 'r1', code: 'duplicate_id' },
    { t: 'pong', ts: 1758664020000 }
  ];
  for (const frame of frames) assert.deepEqual(JSON.parse(JSON.stringify(frame)), frame);
  assert.deepEqual([...new Set(frames.map((f) => f.t))].sort(),
    ['cancel', 'challenge', 'data', 'end', 'error', 'goaway', 'head', 'hello', 'ping', 'pong', 'req']);
});

test('RA3A-2. remote header allowlist: only the seven approved headers reach the daemon; the cookie authenticates but never arrives', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra3a-'));
  try {
    const registry = new DeviceRegistry(path.join(dir, 'devices.json'));
    const { rawToken } = registry.createDevice('Phone');
    let seen;
    const daemon = {
      async dispatchRemoteRequest(req, res) { seen = { headers: { ...req.headers }, url: req.url }; res.end('ok'); }
    };
    const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: registry, expectedOrigin: 'https://h-test.sideline.live' });
    assert.deepEqual([...ALLOWED_REQUEST_HEADERS].sort(),
      ['accept', 'content-type', 'cookie', 'last-event-id', 'origin', 'user-agent', 'x-sideline-action']);
    const frames = [];
    await adapter.dispatch({
      t: 'req', id: 'a1', method: 'GET', path: '/api/status',
      headers: {
        Accept: 'text/event-stream', 'Content-Type': 'application/json', Cookie: `sl_dev=${rawToken}`,
        Origin: 'https://h-test.sideline.live', 'X-Sideline-Action': '1', 'Last-Event-ID': '7', 'User-Agent': 'jest/1',
        Authorization: 'Bearer admin', 'Proxy-Authorization': 'Basic x', 'X-Forwarded-For': '1.2.3.4',
        'X-Custom': 'z', 'X-Principal': 'admin', 'x-device-id': 'forged', Host: 'evil.example'
      }
    }, (f) => frames.push(f));
    assert.equal(frames.find((f) => f.t === 'head')?.status, 200, 'cookie was still usable for device auth');
    assert.deepEqual(Object.keys(seen.headers).sort(),
      ['accept', 'content-type', 'last-event-id', 'origin', 'user-agent', 'x-sideline-action']);
    assert.equal(seen.headers.accept, 'text/event-stream');
    assert.equal(seen.headers['last-event-id'], '7');
    assert.equal(seen.headers.cookie, undefined, 'raw device cookie is not handed to daemon handlers');
    // Auth still required: a forbidden-header-only request is unauthorized and never dispatched.
    seen = undefined;
    const denied = [];
    await adapter.dispatch({ t: 'req', id: 'a2', method: 'GET', path: '/api/status', headers: { Authorization: 'Bearer admin' } }, (f) => denied.push(f));
    assert.equal(denied.find((f) => f.t === 'head')?.status, 401);
    assert.equal(seen, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RA3A-3. remoteAccess.enabled defaults false and legacy preference files stay compatible', () => {
  assert.equal(DEFAULT_PREFERENCES.remoteAccess.enabled, false);
  assert.equal('relayDomain' in DEFAULT_PREFERENCES.remoteAccess, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra3a-pref-'));
  try {
    const file = path.join(dir, 'preferences.json');
    fs.writeFileSync(file, JSON.stringify({ runningPlayers: 'auto-add', devMode: true }), 'utf8');
    const legacy = loadPreferences(file);
    assert.equal(legacy.runningPlayers, 'auto-add');
    assert.equal(legacy.devMode, true);
    assert.equal(legacy.remoteAccess.enabled, false);
    fs.writeFileSync(file, JSON.stringify({ remoteAccess: { enabled: 'yes' } }), 'utf8');
    assert.equal(loadPreferences(file).remoteAccess.enabled, false, 'non-boolean-true is not enabled');
    savePreferences(file, { ...legacy, remoteAccess: { enabled: true } });
    assert.equal(loadPreferences(file).remoteAccess.enabled, true);
    assert.equal(loadPreferences(path.join(dir, 'missing.json')).remoteAccess.enabled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Slice 3B

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { ReferenceRelay } from '../out/relay-build/relay/reference-relay.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(10);
  }
  return fn();
};

const makeIdentity = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra3b-'));
  const identity = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote'));
  fs.rmSync(dir, { recursive: true, force: true });
  const publicKeyHex = Buffer.from(identity.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return { identity, hostPublicId: identity.hostPublicId, publicKeyHex };
};

const startRelay = async (options = {}) => {
  const relay = new ReferenceRelay({ relayDomain: 'localhost', ...options });
  const port = await relay.listen(0);
  return { relay, port };
};

/** Test-only host: raw ws client that records frames and the close code. */
const connectHost = async (port) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/tunnel/v1`);
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

const signHello = (id, nonce, overrides = {}) => ({
  t: 'hello', v: 1, hostPublicId: id.hostPublicId, publicKey: id.publicKeyHex,
  sig: crypto.sign(null, Buffer.from(nonce, 'base64url'), id.identity.privateKey).toString('base64url'),
  client: 'sideline/test', ...overrides
});

const registerHost = async (relay, port, id = makeIdentity()) => {
  const host = await connectHost(port);
  host.send(signHello(id, host.challenge.nonce));
  assert.ok(await waitUntil(() => relay.isHostConnected(id.hostPublicId)), 'host registered');
  return { host, id };
};

const browser = (port, hostPublicId, { method = 'GET', path: reqPath = '/', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: reqPath, headers: { Host: `h-${hostPublicId}.localhost:${port}`, ...headers } }, (res) => {
    const out = { status: res.statusCode, headers: res.headers, chunks: [], res };
    res.on('data', (c) => out.chunks.push({ at: Date.now(), text: c.toString('utf8') }));
    res.on('end', () => { out.text = out.chunks.map((c) => c.text).join(''); resolve(out); });
    res.on('error', reject);
  });
  req.on('error', reject);
  req.end(body);
});

test('RA3B-1. valid challenge and signed hello registers the host; nonce is 32 random bytes base64url', async () => {
  const { relay, port } = await startRelay();
  try {
    const id = makeIdentity();
    const host = await connectHost(port);
    assert.equal(Buffer.from(host.challenge.nonce, 'base64url').length, 32);
    assert.match(host.challenge.nonce, /^[A-Za-z0-9_-]{43}$/);
    const other = await connectHost(port);
    assert.notEqual(other.challenge.nonce, host.challenge.nonce);
    host.send(signHello(id, host.challenge.nonce));
    assert.ok(await waitUntil(() => relay.isHostConnected(id.hostPublicId)));
    assert.equal(host.closed, null);
    host.ws.close(); other.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-2. forged signature is rejected with 4403 and not registered', async () => {
  const { relay, port } = await startRelay();
  try {
    const id = makeIdentity();
    const attacker = makeIdentity();
    const host = await connectHost(port);
    host.send(signHello(id, host.challenge.nonce, { sig: crypto.sign(null, Buffer.from(host.challenge.nonce, 'base64url'), attacker.identity.privateKey).toString('base64url') }));
    assert.ok(await waitUntil(() => host.closed));
    assert.equal(host.closed.code, 4403);
    assert.equal(relay.isHostConnected(id.hostPublicId), false);
  } finally { await relay.close(); }
});

test('RA3B-3. hostPublicId / publicKey mismatch and malformed keys are rejected with 4403', async () => {
  const { relay, port } = await startRelay();
  try {
    const a = makeIdentity();
    const b = makeIdentity();
    const mismatch = await connectHost(port);
    mismatch.send(signHello(b, mismatch.challenge.nonce, { hostPublicId: a.hostPublicId }));
    assert.ok(await waitUntil(() => mismatch.closed));
    assert.equal(mismatch.closed.code, 4403);
    const upper = await connectHost(port);
    upper.send(signHello(a, upper.challenge.nonce, { publicKey: a.publicKeyHex.toUpperCase() }));
    assert.ok(await waitUntil(() => upper.closed));
    assert.equal(upper.closed.code, 4403);
    assert.equal(relay.isHostConnected(a.hostPublicId) || relay.isHostConnected(b.hostPublicId), false);
  } finally { await relay.close(); }
});

test('RA3B-4. a nonce is single use: second hello on the socket and a replayed signature are rejected', async () => {
  const { relay, port } = await startRelay();
  try {
    const id = makeIdentity();
    const first = await connectHost(port);
    const oldHello = signHello(id, first.challenge.nonce);
    first.send(oldHello);
    assert.ok(await waitUntil(() => relay.isHostConnected(id.hostPublicId)));
    first.send(oldHello); // nonce already consumed
    assert.ok(await waitUntil(() => first.closed));
    assert.equal(first.closed.code, 4401);
    // Replaying the old signature against a fresh challenge fails verification.
    const second = await connectHost(port);
    second.send(oldHello);
    assert.ok(await waitUntil(() => second.closed));
    assert.equal(second.closed.code, 4403);
  } finally { await relay.close(); }
});

test('RA3B-5. an expired challenge is rejected with 4401', async () => {
  const { relay, port } = await startRelay({ challengeTtlMs: 40 });
  try {
    const id = makeIdentity();
    const host = await connectHost(port);
    await sleep(120);
    host.send(signHello(id, host.challenge.nonce));
    assert.ok(await waitUntil(() => host.closed));
    assert.equal(host.closed.code, 4401);
    assert.equal(relay.isHostConnected(id.hostPublicId), false);
  } finally { await relay.close(); }
});

test('RA3B-6. a duplicate host connection supersedes the old one (goaway, close, in-flight cleaned)', async () => {
  const { relay, port } = await startRelay();
  try {
    const id = makeIdentity();
    const { host: oldHost } = await registerHost(relay, port, id);
    const pendingRequest = browser(port, id.hostPublicId, { path: '/api/slow' });
    assert.ok(await waitUntil(() => oldHost.reqs().length === 1));
    const newHost = await connectHost(port);
    newHost.send(signHello(id, newHost.challenge.nonce));
    assert.ok(await waitUntil(() => oldHost.closed));
    assert.deepEqual(oldHost.frames.find((f) => f.t === 'goaway'), { t: 'goaway', reason: 'superseded' });
    assert.equal(oldHost.closed.code, 4000);
    const cut = await pendingRequest;
    assert.equal(cut.status, 503, 'old in-flight request is released with host_offline');
    assert.equal(relay.isHostConnected(id.hostPublicId), true, 'new socket owns the id');
    const next = browser(port, id.hostPublicId, { path: '/api/x' });
    assert.ok(await waitUntil(() => newHost.reqs().length === 1));
    const reqId = newHost.reqs()[0].id;
    newHost.send({ t: 'head', id: reqId, status: 200, headers: {} });
    newHost.send({ t: 'end', id: reqId });
    assert.equal((await next).status, 200);
    newHost.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-7. offline API request gets the exact 503 JSON contract', async () => {
  const { relay, port } = await startRelay();
  try {
    const res = await browser(port, makeIdentity().hostPublicId, { path: '/api/status' });
    assert.equal(res.status, 503);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.text, '{"code":"host_offline","message":"Desktop host is offline"}');
    const byAccept = await browser(port, makeIdentity().hostPublicId, { path: '/x', headers: { Accept: 'application/json' } });
    assert.equal(byAccept.headers['content-type'], 'application/json');
  } finally { await relay.close(); }
});

test('RA3B-8. offline document request gets the static Desktop Offline page', async () => {
  const { relay, port } = await startRelay();
  try {
    const res = await browser(port, makeIdentity().hostPublicId, { path: '/', headers: { Accept: 'text/html' } });
    assert.equal(res.status, 503);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.match(res.text, /<title>Desktop Offline - Sideline Coach<\/title>/);
    assert.match(res.text, /<h1>Desktop Offline<\/h1>/);
  } finally { await relay.close(); }
});

test('RA3B-9. request bodies over 1 MiB get 413 and never reach the host; exactly 1 MiB is forwarded', async () => {
  const { relay, port } = await startRelay();
  try {
    const { host, id } = await registerHost(relay, port);
    const big = await browser(port, id.hostPublicId, { method: 'POST', path: '/api/big', body: Buffer.alloc(1024 * 1024 + 1, 97) });
    assert.equal(big.status, 413);
    await sleep(100);
    assert.equal(host.reqs().length, 0, 'host received nothing');
    const exact = browser(port, id.hostPublicId, { method: 'POST', path: '/api/ok', body: Buffer.alloc(1024 * 1024, 97) });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    assert.equal(host.reqs()[0].body.length, 1024 * 1024);
    host.send({ t: 'head', id: host.reqs()[0].id, status: 204, headers: {} });
    host.send({ t: 'end', id: host.reqs()[0].id });
    assert.equal((await exact).status, 204);
    host.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-10. the relay applies the exact 7-header allowlist and keeps cookie/origin opaque', async () => {
  const { relay, port } = await startRelay();
  try {
    const { host, id } = await registerHost(relay, port);
    void browser(port, id.hostPublicId, {
      method: 'POST', path: '/api/x?v=1', body: '{"a":1}',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json', Cookie: 'sl_dev=opaque-token; other=1', Origin: 'https://h-x.sideline.live',
        'X-Sideline-Action': '1', 'Last-Event-ID': '9', 'User-Agent': 'ua/1',
        Authorization: 'Bearer admin', 'Proxy-Authorization': 'Basic x', 'X-Forwarded-For': '9.9.9.9', 'X-Custom': 'z', 'X-Sideline-Host': 'forged'
      }
    });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const frame = host.reqs()[0];
    assert.deepEqual(Object.keys(frame.headers).sort(), ['accept', 'content-type', 'cookie', 'last-event-id', 'origin', 'user-agent', 'x-sideline-action']);
    assert.equal(frame.headers.cookie, 'sl_dev=opaque-token; other=1');
    assert.equal(frame.headers.origin, 'https://h-x.sideline.live');
    assert.equal(frame.path, '/api/x?v=1');
    assert.equal(frame.method, 'POST');
    assert.equal(frame.body, '{"a":1}');
    host.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-11. request ids are relay-generated UUIDs and unique', async () => {
  const { relay, port } = await startRelay();
  try {
    const { host, id } = await registerHost(relay, port);
    for (let i = 0; i < 5; i += 1) void browser(port, id.hostPublicId, { path: '/api/n', headers: { 'X-Request-Id': 'browser-chosen' } });
    assert.ok(await waitUntil(() => host.reqs().length === 5));
    const ids = host.reqs().map((f) => f.id);
    assert.equal(new Set(ids).size, 5);
    for (const rid of ids) assert.match(rid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    host.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-12. two connected hosts are strictly isolated', async () => {
  const { relay, port } = await startRelay();
  try {
    const a = await registerHost(relay, port);
    const b = await registerHost(relay, port);
    const respA = browser(port, a.id.hostPublicId, { path: '/api/who' });
    assert.ok(await waitUntil(() => a.host.reqs().length === 1));
    await sleep(50);
    assert.equal(b.host.reqs().length, 0, 'B never sees A traffic');
    const rid = a.host.reqs()[0].id;
    // B tries to answer A's request: ignored.
    b.host.send({ t: 'head', id: rid, status: 200, headers: {} });
    b.host.send({ t: 'data', id: rid, chunk: 'from-B' });
    b.host.send({ t: 'end', id: rid });
    await sleep(50);
    a.host.send({ t: 'head', id: rid, status: 200, headers: {} });
    a.host.send({ t: 'data', id: rid, chunk: 'from-A' });
    a.host.send({ t: 'end', id: rid });
    assert.equal((await respA).text, 'from-A');
    // Unknown host subdomain and header-forged host identity do not reach either host.
    const stranger = await browser(port, makeIdentity().hostPublicId, { path: '/api/who' });
    assert.equal(stranger.status, 503);
    const forged = await browser(port, makeIdentity().hostPublicId, { path: '/api/who', headers: { 'X-Sideline-Host': a.id.hostPublicId, Origin: `https://h-${a.id.hostPublicId}.localhost` } });
    assert.equal(forged.status, 503);
    await sleep(50);
    assert.equal(a.host.reqs().length, 1);
    assert.equal(b.host.reqs().length, 0);
    // Dropping A does not affect B.
    a.host.ws.close();
    assert.ok(await waitUntil(() => !relay.isHostConnected(a.id.hostPublicId)));
    assert.equal(relay.isHostConnected(b.id.hostPublicId), true);
    b.host.ws.close();
  } finally { await relay.close(); }
});

test('RA3B-13. head/data/end frames stream to the browser incrementally; log is metadata only', async () => {
  const logs = [];
  const { relay, port } = await startRelay({ log: (entry) => logs.push(entry) });
  try {
    const { host, id } = await registerHost(relay, port);
    const response = browser(port, id.hostPublicId, { path: '/api/events?secret=querysecret', headers: { Cookie: 'sl_dev=cookiesecret', Accept: 'text/event-stream' } });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const rid = host.reqs()[0].id;
    host.send({ t: 'head', id: rid, status: 200, headers: { 'content-type': 'text/event-stream', 'set-cookie': 'sl_dev=cookiesecret; HttpOnly' } });
    host.send({ t: 'data', id: rid, chunk: 'data: one\n\n' });
    await sleep(150);
    host.send({ t: 'data', id: rid, chunkB64: Buffer.from('data: two\n\n').toString('base64') });
    await sleep(50);
    host.send({ t: 'end', id: rid });
    const out = await response;
    assert.equal(out.status, 200);
    assert.equal(out.headers['content-type'], 'text/event-stream');
    assert.equal(out.headers['set-cookie'][0], 'sl_dev=cookiesecret; HttpOnly');
    assert.equal(out.text, 'data: one\n\ndata: two\n\n');
    assert.ok(out.chunks.length >= 2 && out.chunks[out.chunks.length - 1].at - out.chunks[0].at >= 100, 'chunks arrived separately, not buffered');
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0]).sort(), ['bytes', 'durationMs', 'hostPublicId', 'method', 'path', 'status', 'ts']);
    assert.equal(logs[0].path, '/api/events');
    assert.equal(logs[0].status, 200);
    assert.equal(logs[0].bytes, 'data: one\n\ndata: two\n\n'.length);
    assert.doesNotMatch(JSON.stringify(logs), /querysecret|cookiesecret/);
    // A host `error` before head becomes a bounded 502.
    const failing = browser(port, id.hostPublicId, { path: '/api/fail' });
    assert.ok(await waitUntil(() => host.reqs().length === 2));
    host.send({ t: 'error', id: host.reqs()[1].id, code: 'dispatch_failed' });
    const failed = await failing;
    assert.equal(failed.status, 502);
    assert.equal(JSON.parse(failed.text).code, 'dispatch_failed');
    host.ws.close();
  } finally { await relay.close(); }
});

// ---------------------------------------------------------------- Slice 3C

import { WebSocketServer } from 'ws';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { RelayClient } from '../out/control-plane/relay-client.js';

const makeHostStack = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra3c-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 42700 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  const identity = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote'));
  const publicKeyHex = Buffer.from(identity.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return {
    daemon, identity, publicKeyHex, hostPublicId: identity.hostPublicId,
    pairDevice: () => daemon.deviceRegistry.createDevice('Phone'),
    stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  };
};

const startClient = async (stack, url) => {
  const client = new RelayClient({ relayUrl: url, relayDomain: 'localhost', identity: stack.identity, daemon: stack.daemon, deviceRegistry: stack.daemon.deviceRegistry });
  await client.start();
  return client;
};

/** Test-only relay peer: sends a real challenge, records everything the RelayClient answers. */
const startMiniRelay = async () => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/tunnel/v1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  const peer = { frames: [], closed: null, nonce: crypto.randomBytes(32), ws: null };
  wss.on('connection', (ws) => {
    peer.ws = ws;
    ws.on('message', (data) => peer.frames.push(JSON.parse(data.toString())));
    ws.on('close', (code) => { peer.closed = { code }; });
    ws.send(JSON.stringify({ t: 'challenge', nonce: peer.nonce.toString('base64url') }));
  });
  peer.url = `ws://127.0.0.1:${wss.address().port}/tunnel/v1`;
  peer.send = (frame) => peer.ws.send(JSON.stringify(frame));
  peer.close = () => new Promise((resolve) => { for (const c of wss.clients) c.terminate(); wss.close(() => resolve()); });
  return peer;
};

test('RA3C-1. RelayClient connects, signs the raw nonce with the durable host key and registers the real hostPublicId', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  let client;
  try {
    client = await startClient(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)), 'reference relay verified hello and registered the real id');
    assert.equal(client.expectedOrigin, `https://h-${stack.hostPublicId}.localhost`);
  } finally {
    await client?.stop();
    await relay.close();
    await stack.stop();
  }
  await assert.rejects(() => client.start(), /stopped/, 'stopped client cannot be reused');
});

test('RA3C-1b. hello frame content: canonical fields, hex key, signature over the decoded 32 raw bytes, malformed frames fail safely', async () => {
  const stack = await makeHostStack();
  const peer = await startMiniRelay();
  let client;
  try {
    client = await startClient(stack, peer.url);
    assert.ok(await waitUntil(() => peer.frames.length === 1));
    const hello = peer.frames[0];
    assert.deepEqual(Object.keys(hello).sort(), ['client', 'hostPublicId', 'publicKey', 'sig', 't', 'v']);
    assert.equal(hello.t, 'hello');
    assert.equal(hello.v, 1);
    assert.equal(hello.client, 'sideline/1.0');
    assert.equal(hello.hostPublicId, stack.hostPublicId);
    assert.equal(hello.publicKey, stack.publicKeyHex);
    assert.equal(crypto.verify(null, peer.nonce, stack.identity.publicKey, Buffer.from(hello.sig, 'base64url')), true, 'signed the RAW nonce bytes');
    assert.equal(crypto.verify(null, Buffer.from(peer.nonce.toString('base64url')), stack.identity.publicKey, Buffer.from(hello.sig, 'base64url')), false, 'not the encoded string');
    peer.send({ t: 'req', id: 5, method: 'GET', path: '/api/status', headers: {} }); // non-string id
    assert.ok(await waitUntil(() => peer.closed));
    assert.equal(peer.closed.code, 1002);
  } finally {
    await client?.stop();
    await peer.close();
    await stack.stop();
  }
});

test('RA3C-1c. bad challenge nonces and unparseable frames are refused without signing', async () => {
  const stack = await makeHostStack();
  try {
    for (const nonce of ['short', Buffer.alloc(31).toString('base64url'), '!'.repeat(43)]) {
      const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
      await new Promise((resolve) => wss.once('listening', resolve));
      const seen = { frames: [], closed: null };
      wss.on('connection', (ws) => {
        ws.on('message', (d) => seen.frames.push(d.toString()));
        ws.on('close', (code) => { seen.closed = code; });
        ws.send(JSON.stringify({ t: 'challenge', nonce }));
      });
      const client = await startClient(stack, `ws://127.0.0.1:${wss.address().port}/tunnel/v1`);
      assert.ok(await waitUntil(() => seen.closed !== null));
      assert.equal(seen.closed, 1002);
      assert.deepEqual(seen.frames, [], 'no hello for a bad nonce');
      await client.stop();
      await new Promise((resolve) => wss.close(() => resolve()));
    }
    const peer = await startMiniRelay();
    const client = await startClient(stack, peer.url);
    assert.ok(await waitUntil(() => peer.frames.length === 1));
    peer.ws.send('not json');
    assert.ok(await waitUntil(() => peer.closed));
    assert.equal(peer.closed.code, 1002);
    await client.stop();
    await peer.close();
  } finally {
    await stack.stop();
  }
});

test('RA3C-2. real GET round trip: browser -> relay -> RelayClient -> adapter -> daemon -> back', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  let client;
  try {
    client = await startClient(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const { rawToken } = stack.pairDevice();
    const res = await browser(port, stack.hostPublicId, { path: '/api/status', headers: { Cookie: `sl_dev=${rawToken}`, Accept: 'application/json' } });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    const body = JSON.parse(res.text);
    assert.equal(body.success, true);
    assert.match(String(res.headers['set-cookie']), /sl_dev=.*HttpOnly.*Max-Age=2592000/, 'adapter slid the device cookie');
    // No credential at all: adapter answers 401 across the same path.
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/status' })).status, 401);
  } finally {
    await client?.stop();
    await relay.close();
    await stack.stop();
  }
});

test('RA3C-3. valid sl_dev authenticates only at the adapter; local-only routes and Bearer elevation stay refused through the relay', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  let client;
  try {
    client = await startClient(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const { rawToken } = stack.pairDevice();
    const cookie = { Cookie: `sl_dev=${rawToken}` };
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/status', headers: cookie })).status, 200);
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/devices', headers: cookie })).status, 403, 'local-only route refused');
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/diagnostics', headers: cookie })).status, 403);
    // Bearer is stripped by the relay allowlist; it cannot stand in for the device cookie or unlock local-only.
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/status', headers: { Authorization: 'Bearer anything' } })).status, 401);
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/devices', headers: { ...cookie, Authorization: 'Bearer anything' } })).status, 403);
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/status?token=x', headers: cookie })).status, 401, '?token= still rejected');
    assert.equal((await browser(port, stack.hostPublicId, { path: '/api/status', headers: { Cookie: 'sl_dev=forged' } })).status, 401);
  } finally {
    await client?.stop();
    await relay.close();
    await stack.stop();
  }
});

test('RA3C-4. a canonical cancel frame reaches adapter.cancel: SSE subscription is torn down; cancel is idempotent', async () => {
  const stack = await makeHostStack();
  const peer = await startMiniRelay();
  let client;
  try {
    client = await startClient(stack, peer.url);
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'hello')));
    const { rawToken } = stack.pairDevice();
    peer.send({ t: 'req', id: 'sse-1', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}`, accept: 'text/event-stream' } });
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 1), 'daemon registered the SSE subscriber');
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'head' && f.id === 'sse-1')));
    peer.send({ t: 'cancel', id: 'sse-1' });
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 0), 'host-side subscription cleaned up');
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'end' && f.id === 'sse-1')));
    const count = peer.frames.length;
    stack.daemon.broadcast('status', { after: 'cancel' });
    await sleep(60);
    assert.equal(peer.frames.length, count, 'nothing streams after cancel');
    peer.send({ t: 'cancel', id: 'sse-1' });
    peer.send({ t: 'cancel', id: 'never-existed' });
    await sleep(60);
    assert.equal(peer.frames.filter((f) => f.t === 'end' && f.id === 'sse-1').length, 1);
    assert.equal(peer.closed, null, 'idempotent cancel does not disturb the tunnel');
    // A duplicate live id is refused, not re-dispatched.
    peer.send({ t: 'req', id: 'dup', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}` } });
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 1));
    peer.send({ t: 'req', id: 'dup', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}` } });
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'error' && f.id === 'dup' && f.code === 'duplicate_id')));
    assert.equal(stack.daemon.sseClients.size, 1);
  } finally {
    await client?.stop();
    await peer.close();
    assert.equal(stack.daemon.sseClients.size, 0, 'stop() cancelled remaining in-flight streams');
    await stack.stop();
  }
});

test('RA3C-5. SSE data frames cross the tunnel individually, not buffered until end', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  const peer = await startMiniRelay();
  let client;
  let realClient;
  try {
    // (a) frame level: several distinct `data` frames and no `end` while the stream is open.
    client = await startClient(stack, peer.url);
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'hello')));
    const { rawToken } = stack.pairDevice();
    peer.send({ t: 'req', id: 's1', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}` } });
    assert.ok(await waitUntil(() => peer.frames.filter((f) => f.t === 'data' && f.id === 's1').length >= 4));
    const datas = peer.frames.filter((f) => f.t === 'data' && f.id === 's1').map((f) => f.chunk);
    for (const event of ['hello', 'status', 'ai-health', 'execution']) assert.ok(datas.some((c) => c.startsWith(`event: ${event}\n`)), `${event} frame`);
    assert.equal(peer.frames.some((f) => f.t === 'end' && f.id === 's1'), false, 'stream still open');
    const before = peer.frames.filter((f) => f.t === 'data' && f.id === 's1').length;
    stack.daemon.broadcast('status', { tick: 1 });
    assert.ok(await waitUntil(() => peer.frames.filter((f) => f.t === 'data' && f.id === 's1').length === before + 1), 'a later broadcast arrives as its own frame');
    await client.stop();
    client = undefined;
    // (b) end to end through the reference relay: the browser sees chunks arrive over time.
    realClient = await startClient(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const response = new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `h-${stack.hostPublicId}.localhost:${port}`, Cookie: `sl_dev=${rawToken}`, Accept: 'text/event-stream' } }, (res) => {
        const seen = [];
        res.on('data', (c) => seen.push({ at: Date.now(), text: c.toString('utf8') }));
        resolve({ res, seen, req });
      });
      req.on('error', () => {});
      req.end();
    });
    const live = await response;
    assert.equal(live.res.statusCode, 200);
    assert.equal(live.res.headers['content-type'], 'text/event-stream');
    assert.ok(await waitUntil(() => live.seen.some((c) => c.text.includes('event: hello'))));
    const first = live.seen.length;
    await sleep(120);
    stack.daemon.broadcast('status', { tick: 2 });
    assert.ok(await waitUntil(() => live.seen.slice(first).some((c) => c.text.includes('"tick":2'))), 'later frame reaches the browser while the stream is still open');
    assert.ok(live.seen[live.seen.length - 1].at - live.seen[0].at >= 100, 'delivered incrementally over time');
    live.req.destroy();
  } finally {
    await client?.stop();
    await realClient?.stop();
    await peer.close();
    await relay.close();
    await stack.stop();
  }
});

// ---------------------------------------------------------------- Slice 3D

import * as net from 'node:net';
import { computeBackoffMs, BACKOFF_SCHEDULE_MS } from '../out/control-plane/relay-client.js';

const startClientWith = async (stack, url, extra = {}) => {
  const client = new RelayClient({ relayUrl: url, relayDomain: 'localhost', identity: stack.identity, daemon: stack.daemon, deviceRegistry: stack.daemon.deviceRegistry, ...extra });
  await client.start();
  return client;
};

/** Test-only relay peer with switchable per-connection behaviour and connection accounting. */
const startPeer = async (mode = 'silent') => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/tunnel/v1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  const peer = { mode, connections: 0, frames: [], closedCodes: [], ws: null };
  wss.on('connection', (ws) => {
    peer.connections += 1;
    peer.ws = ws;
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString());
      peer.frames.push(frame);
      if (frame.t === 'hello' && peer.mode === 'ping') ws.send(JSON.stringify({ t: 'ping', ts: 777 }));
      if (frame.t === 'hello' && peer.mode === 'dropAfterHello') ws.terminate();
    });
    ws.on('close', (code) => peer.closedCodes.push(code));
    if (peer.mode === 'drop') {
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify({ t: 'challenge', nonce: crypto.randomBytes(32).toString('base64url') }));
  });
  peer.url = `ws://127.0.0.1:${wss.address().port}/tunnel/v1`;
  peer.send = (frame) => peer.ws.send(JSON.stringify(frame));
  peer.hellos = () => peer.frames.filter((f) => f.t === 'hello').length;
  peer.close = () => new Promise((resolve) => { for (const c of wss.clients) c.terminate(); wss.close(() => resolve()); });
  return peer;
};

const fakeTimers = () => {
  const timers = { list: [], setTimeout(fn, ms) { const h = { fn, ms, cleared: false }; timers.list.push(h); return h; }, clearTimeout(h) { h.cleared = true; } };
  return timers;
};

test('RA3D-1. verified hosts get pings, RelayClient echoes the exact ts, unverified sockets are never pinged', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay({ pingIntervalMs: 40 });
  const peer = await startPeer('silent');
  let client;
  try {
    const unverified = await connectHost(port);
    const { host } = await registerHost(relay, port);
    host.ws.on('message', (data) => { const f = JSON.parse(data.toString()); if (f.t === 'ping') host.send({ t: 'pong', ts: f.ts }); });
    await sleep(250);
    const pings = host.frames.filter((f) => f.t === 'ping');
    assert.ok(pings.length >= 3, `verified host pinged repeatedly, got ${pings.length}`);
    assert.ok(pings.every((f) => Number.isInteger(f.ts)));
    assert.equal(host.closed, null, 'a host that pongs is never declared stale');
    assert.equal(unverified.frames.filter((f) => f.t === 'ping').length, 0, 'unverified socket gets no heartbeat');
    unverified.ws.close();
    host.ws.close();
    // Client side: echo the timestamp exactly.
    client = await startClientWith(stack, peer.url);
    assert.ok(await waitUntil(() => peer.hellos() === 1));
    peer.send({ t: 'ping', ts: 1758664020123 });
    assert.ok(await waitUntil(() => peer.frames.some((f) => f.t === 'pong')));
    assert.deepEqual(peer.frames.find((f) => f.t === 'pong'), { t: 'pong', ts: 1758664020123 });
  } finally {
    await client?.stop();
    await peer.close();
    await relay.close();
    await stack.stop();
  }
});

test('RA3D-2. a verified host that never pongs is closed 4008 after two missed intervals and its requests are released', async () => {
  const { relay, port } = await startRelay({ pingIntervalMs: 30 });
  try {
    const { host, id } = await registerHost(relay, port);
    const pending = browser(port, id.hostPublicId, { path: '/api/hang' });
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    assert.ok(await waitUntil(() => host.closed, 1500));
    assert.equal(host.closed.code, 4008);
    assert.equal(relay.isHostConnected(id.hostPublicId), false);
    assert.equal((await pending).status, 503, 'in-flight browser request released');
    assert.equal(relay.inflight.size, 0);
  } finally { await relay.close(); }
});

test('RA3D-3. host watchdog closes a silent relay connection and reconnects with a fresh challenge/hello; traffic keeps it alive', async () => {
  const stack = await makeHostStack();
  const peer = await startPeer('silent');
  let client;
  try {
    client = await startClientWith(stack, peer.url, { watchdogMs: 100, backoffScheduleMs: [10] });
    assert.ok(await waitUntil(() => peer.hellos() === 1));
    assert.ok(await waitUntil(() => peer.connections === 2, 1500), 'silence for the watchdog interval triggered a reconnect');
    assert.ok(await waitUntil(() => peer.hellos() === 2), 'fresh challenge answered with a new hello');
    // Keep-alive: steady pings prevent the watchdog from firing.
    const conns = peer.connections;
    for (let i = 0; i < 6; i += 1) { peer.send({ t: 'ping', ts: i }); await sleep(50); }
    assert.equal(peer.connections, conns, 'pings reset the watchdog');
  } finally {
    await client?.stop();
    await peer.close();
    await stack.stop();
  }
});

test('RA3D-4. backoff is 1/2/5/10/30/30 s with ±20% jitter; the counter resets only after confirmed healthy post-hello traffic', async () => {
  // Pure schedule.
  const bases = [1000, 2000, 5000, 10000, 30000, 30000, 30000];
  assert.deepEqual(BACKOFF_SCHEDULE_MS, [1000, 2000, 5000, 10000, 30000]);
  bases.forEach((base, attempt) => {
    assert.equal(computeBackoffMs(attempt, () => 0.5), base);
    assert.ok(Math.abs(computeBackoffMs(attempt, () => 0) - base * 0.8) < 1e-6);
    assert.ok(Math.abs(computeBackoffMs(attempt, () => 1) - base * 1.2) < 1e-6);
  });
  const stack = await makeHostStack();
  const peer = await startPeer('drop');
  try {
    // Real client, fake reconnect timer, always-failing relay: exact delays in order.
    const timers = fakeTimers();
    let client = await startClientWith(stack, peer.url, { timers, random: () => 0.5 });
    const fire = async (n) => {
      timers.list[n].fn();
      assert.ok(await waitUntil(() => timers.list.length === n + 2), `timer ${n + 1} scheduled`);
    };
    assert.ok(await waitUntil(() => timers.list.length === 1));
    for (let n = 0; n < 5; n += 1) await fire(n);
    assert.deepEqual(timers.list.map((t) => t.ms), [1000, 2000, 5000, 10000, 30000, 30000]);
    await client.stop();
    assert.ok(timers.list.at(-1).cleared, 'stop() cleared the pending reconnect timer');

    // Reset semantics: open / hello alone do not reset; a post-hello relay frame does.
    const timers2 = fakeTimers();
    peer.mode = 'drop';
    client = await startClientWith(stack, peer.url, { timers: timers2, random: () => 0.5 });
    assert.ok(await waitUntil(() => timers2.list.length === 1));
    timers2.list[0].fn();                                      // fails again
    assert.ok(await waitUntil(() => timers2.list.length === 2));
    peer.mode = 'dropAfterHello';                              // open + hello, then relay drops: NOT healthy
    timers2.list[1].fn();
    assert.ok(await waitUntil(() => timers2.list.length === 3));
    assert.deepEqual(timers2.list.map((t) => t.ms), [1000, 2000, 5000], 'open + hello did not reset the counter');
    assert.equal(client.stats.attempt, 3);
    peer.mode = 'ping';                                        // relay answers hello with a ping: healthy
    timers2.list[2].fn();
    assert.ok(await waitUntil(() => client.stats.healthy));
    assert.equal(client.stats.attempt, 0, 'first post-hello frame reset the counter');
    peer.ws.terminate();
    assert.ok(await waitUntil(() => timers2.list.length === 4));
    assert.equal(timers2.list[3].ms, 1000, 'schedule restarted from 1 s');
    await client.stop();
  } finally {
    await peer.close();
    await stack.stop();
  }
});

test('RA3D-5. severed relay: in-flight work is cancelled, the client reconnects with a fresh hello, and REST works again', async () => {
  const stack = await makeHostStack();
  let relay = new ReferenceRelay({ relayDomain: 'localhost' });
  const port = await relay.listen(0);
  let client;
  try {
    client = await startClientWith(stack, `ws://127.0.0.1:${port}/tunnel/v1`, { backoffScheduleMs: [30] });
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const { rawToken } = stack.pairDevice();
    const cookie = { Cookie: `sl_dev=${rawToken}` };
    const sse = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `h-${stack.hostPublicId}.localhost:${port}`, ...cookie, Accept: 'text/event-stream' } }, (res) => { res.on('data', () => {}); res.on('error', () => {}); });
    sse.on('error', () => {});
    sse.end();
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 1));
    await relay.close(); // sever the tunnel
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 0), 'host-side SSE subscriber cancelled');
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal(client.stats.active, 0);
    relay = new ReferenceRelay({ relayDomain: 'localhost' });
    await relay.listen(port);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId), 4000), 'reconnected and re-verified');
    const res = await browser(port, stack.hostPublicId, { path: '/api/status', headers: cookie });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.text).success, true);
  } finally {
    await client?.stop();
    await relay.close();
    await stack.stop();
  }
});

test('RA3D-6. stop() leaves no reconnect timer and never opens another socket', async () => {
  const stack = await makeHostStack();
  const peer = await startPeer('silent');
  try {
    const client = await startClientWith(stack, peer.url, { backoffScheduleMs: [150] });
    assert.ok(await waitUntil(() => peer.hellos() === 1));
    peer.ws.terminate(); // unexpected disconnect -> reconnect pending
    assert.ok(await waitUntil(() => client.stats.reconnectPending));
    await client.stop();
    assert.equal(client.stats.reconnectPending, false);
    assert.equal(client.stats.connected, false);
    assert.equal(client.stats.watchdogArmed, false);
    await sleep(350);
    assert.equal(peer.connections, 1, 'no new socket after stop()');
    // Intentional stop while connected also does not reconnect.
    const client2 = await startClientWith(stack, peer.url, { backoffScheduleMs: [20] });
    assert.ok(await waitUntil(() => peer.connections === 2));
    await client2.stop();
    await sleep(150);
    assert.equal(peer.connections, 2);
    assert.equal(client2.stats.reconnectPending, false);
  } finally {
    await peer.close();
    await stack.stop();
  }
});

test('RA3D-7. goaway superseded stops the client (no reconnect); other goaway reasons reconnect', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  const peer = await startPeer('silent');
  let client;
  let other;
  try {
    client = await startClientWith(stack, `ws://127.0.0.1:${port}/tunnel/v1`, { backoffScheduleMs: [10] });
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const { host: usurper } = await registerHost(relay, port, { identity: stack.identity, hostPublicId: stack.hostPublicId, publicKeyHex: stack.publicKeyHex });
    assert.ok(await waitUntil(() => client.stats.stopped), 'goaway superseded stopped the client');
    await sleep(200);
    assert.equal(client.stats.connected, false);
    assert.equal(client.stats.reconnectPending, false);
    assert.equal(usurper.closed, null, 'the new connection was left alone (no reconnect fight)');
    assert.equal(relay.isHostConnected(stack.hostPublicId), true);
    usurper.ws.close();

    other = await startClientWith(stack, peer.url, { backoffScheduleMs: [10] });
    assert.ok(await waitUntil(() => peer.hellos() === 1));
    peer.send({ t: 'goaway', reason: 'shutdown' });
    assert.ok(await waitUntil(() => peer.connections === 2, 1500), 'shutdown goaway reconnects');
    assert.equal(other.stats.stopped, false);
  } finally {
    await client?.stop();
    await other?.stop();
    await peer.close();
    await relay.close();
    await stack.stop();
  }
});

test('RA3D-8. browser disconnect through the real relay becomes a cancel that tears down the host SSE subscription', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay();
  let client;
  try {
    client = await startClientWith(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    const { rawToken } = stack.pairDevice();
    const seen = [];
    const req = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `h-${stack.hostPublicId}.localhost:${port}`, Cookie: `sl_dev=${rawToken}`, Accept: 'text/event-stream' } }, (res) => { res.on('data', (c) => seen.push(c.toString())); res.on('error', () => {}); });
    req.on('error', () => {});
    req.end();
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 1 && seen.length > 0));
    assert.equal(relay.inflight.size, 1);
    req.destroy(); // browser aborts
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 0), 'daemon SSE subscriber cleaned up');
    assert.ok(await waitUntil(() => relay.inflight.size === 0), 'relay released the request');
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal(client.stats.active, 0);
    assert.equal(relay.isHostConnected(stack.hostPublicId), true, 'tunnel unharmed');
  } finally {
    await client?.stop();
    await relay.close();
    await stack.stop();
  }
});

test('RA3D-9. a stalled browser exceeding the 1 MiB response queue is cut and cancelled; other requests and the host link are unaffected', async () => {
  const { relay, port } = await startRelay();
  try {
    const { host, id } = await registerHost(relay, port);
    const stalled = net.connect(port, '127.0.0.1');
    stalled.on('error', () => {});
    stalled.pause();
    stalled.write(`GET /api/big HTTP/1.1\r\nHost: h-${id.hostPublicId}.localhost:${port}\r\n\r\n`);
    assert.ok(await waitUntil(() => host.reqs().length === 1));
    const stalledId = host.reqs()[0].id;
    const healthy = browser(port, id.hostPublicId, { path: '/api/ok' });
    assert.ok(await waitUntil(() => host.reqs().length === 2));
    const healthyId = host.reqs()[1].id;
    host.send({ t: 'head', id: stalledId, status: 200, headers: { 'content-type': 'text/plain' } });
    const chunk = 'x'.repeat(256 * 1024);
    for (let i = 0; i < 400 && !host.frames.some((f) => f.t === 'cancel'); i += 1) {
      host.send({ t: 'data', id: stalledId, chunk });
      await sleep(3);
    }
    assert.ok(await waitUntil(() => host.frames.some((f) => f.t === 'cancel')), 'relay cancelled the slow response');
    assert.deepEqual(host.frames.find((f) => f.t === 'cancel'), { t: 'cancel', id: stalledId });
    assert.equal(host.closed, null, 'host connection stays up');
    // The unrelated request still completes.
    host.send({ t: 'head', id: healthyId, status: 200, headers: {} });
    host.send({ t: 'data', id: healthyId, chunk: 'fine' });
    host.send({ t: 'end', id: healthyId });
    const ok = await healthy;
    assert.equal(ok.status, 200);
    assert.equal(ok.text, 'fine');
    stalled.destroy();
    await sleep(80);
    assert.equal(host.frames.filter((f) => f.t === 'cancel' && f.id === stalledId).length, 1, 'no duplicate cancel');
    assert.equal(relay.inflight.size, 0);
    assert.equal(relay.isHostConnected(id.hostPublicId), true);
    host.ws.close();
  } finally { await relay.close(); }
});

const backpressureRig = async (extra = {}) => {
  const stack = await makeHostStack();
  const peer = await startPeer('silent');
  const fake = { buffered: 0 };
  const client = await startClientWith(stack, peer.url, {
    createSocket: (url) => {
      const ws = new WebSocket(url);
      Object.defineProperty(ws, 'bufferedAmount', { get: () => fake.buffered });
      return ws;
    },
    ...extra
  });
  assert.ok(await waitUntil(() => peer.hellos() === 1));
  const { rawToken } = stack.pairDevice();
  peer.send({ t: 'req', id: 'bp', method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${rawToken}` } });
  assert.ok(await waitUntil(() => peer.frames.filter((f) => f.t === 'data').length >= 4));
  await sleep(50);
  return { stack, peer, fake, client, done: async () => { await client.stop(); await peer.close(); await stack.stop(); } };
};

const ticks = (peer) => peer.frames.filter((f) => f.t === 'data' && /"tick":\d+/.test(f.chunk)).map((f) => Number(/"tick":(\d+)/.exec(f.chunk)[1]));

test('RA3D-10. host backpressure: pauses above 4 MiB, queues in order, resumes at or below 2 MiB without loss or reordering', async () => {
  const rig = await backpressureRig();
  try {
    const { stack, peer, fake, client } = rig;
    fake.buffered = 5 * 1024 * 1024;
    for (let i = 1; i <= 5; i += 1) stack.daemon.broadcast('status', { tick: i });
    await sleep(120);
    assert.deepEqual(ticks(peer), [], 'nothing sent while above the high-water mark');
    assert.ok(client.stats.queuedBytes > 0, 'frames are queued');
    assert.equal(client.stats.pumpArmed, true);
    fake.buffered = 3 * 1024 * 1024; // between low and high: still paused (hysteresis)
    await sleep(120);
    assert.deepEqual(ticks(peer), []);
    fake.buffered = 2 * 1024 * 1024; // low-water: resume
    assert.ok(await waitUntil(() => ticks(peer).length === 5));
    assert.deepEqual(ticks(peer), [1, 2, 3, 4, 5], 'in order, none lost');
    assert.equal(client.stats.queuedBytes, 0);
    assert.equal(client.stats.pumpArmed, false, 'poll timer released once drained');
    fake.buffered = 0;
    stack.daemon.broadcast('status', { tick: 6 });
    assert.ok(await waitUntil(() => ticks(peer).length === 6), 'normal streaming resumes immediately');
  } finally { await rig.done(); }
});

test('RA3D-11. host queue hard bound: more than 8 MiB queued fails the tunnel closed with full cleanup', async () => {
  const rig = await backpressureRig({ backoffScheduleMs: [10] });
  try {
    const { stack, peer, fake, client } = rig;
    fake.buffered = 5 * 1024 * 1024;
    const blob = 'x'.repeat(3 * 1024 * 1024);
    stack.daemon.broadcast('status', { blob });
    stack.daemon.broadcast('status', { blob });
    assert.ok(client.stats.queuedBytes > 6 * 1024 * 1024 && client.stats.queuedBytes <= 8 * 1024 * 1024, 'still within the cap');
    const closedBefore = peer.closedCodes.length;
    stack.daemon.broadcast('status', { blob }); // pushes past 8 MiB
    assert.ok(await waitUntil(() => peer.closedCodes.length > closedBefore), 'tunnel terminated');
    assert.ok(await waitUntil(() => client.stats.queuedBytes === 0 && client.stats.active === 0));
    assert.equal(stack.daemon.sseClients.size, 0, 'in-flight SSE cancelled');
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal(ticks(peer).length, 0);
  } finally { await rig.done(); }
});

test('RA3D-12. cleanup: stop and disconnect leave no timers, queues, subscribers or request maps behind', async () => {
  const stack = await makeHostStack();
  const { relay, port } = await startRelay({ pingIntervalMs: 30 });
  let client;
  try {
    client = await startClientWith(stack, `ws://127.0.0.1:${port}/tunnel/v1`);
    assert.ok(await waitUntil(() => relay.isHostConnected(stack.hostPublicId)));
    assert.ok(await waitUntil(() => client.stats.healthy), 'relay ping confirmed the connection');
    assert.equal(client.stats.watchdogArmed, true);
    const { rawToken } = stack.pairDevice();
    const sse = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `h-${stack.hostPublicId}.localhost:${port}`, Cookie: `sl_dev=${rawToken}` } }, (res) => { res.on('data', () => {}); res.on('error', () => {}); });
    sse.on('error', () => {});
    sse.end();
    assert.ok(await waitUntil(() => stack.daemon.sseClients.size === 1 && relay.inflight.size === 1));
    await client.stop();
    assert.deepEqual(client.stats, { connected: false, healthy: false, attempt: client.stats.attempt, reconnectPending: false, watchdogArmed: false, pumpArmed: false, active: 0, queuedBytes: 0, stopped: true });
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal(stack.daemon.sseClients.size, 0);
    assert.ok(await waitUntil(() => relay.inflight.size === 0 && !relay.isHostConnected(stack.hostPublicId)), 'relay released the request and host mapping');
    assert.equal(relay.lastPongAt.size, 0);
    sse.destroy();
  } finally {
    await client?.stop();
    await relay.close();
    assert.equal(relay.pingTimer, undefined, 'heartbeat interval cleared on relay stop');
    assert.equal(relay.inflight.size, 0);
    assert.equal(relay.hosts.size, 0);
    assert.equal(relay.pending.size, 0);
    await stack.stop();
  }
});

// ---------------------------------------------------------------- Slice 3E

/** A real ControlPlaneDaemon that owns its RelayClient, pointed at a local reference relay. */
const makeE2E = async (relayPort, { tuning = { backoffScheduleMs: [30] }, remoteRelay = relayPort ? { relayUrl: `ws://127.0.0.1:${relayPort}/tunnel/v1`, relayDomain: 'localhost', tuning } : undefined } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra3e-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 43300 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000, remoteRelay });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const hostPublicId = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote')).hostPublicId;
  const local = (p, init = {}) => fetch(`http://127.0.0.1:${daemon.port}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const setRemote = (enabled) => local('/api/preferences', { method: 'POST', body: JSON.stringify({ remoteAccess: { enabled } }) });
  return {
    daemon, dir, token, hostPublicId, local, setRemote,
    origin: `https://h-${hostPublicId}.localhost`,
    pairDevice: () => daemon.deviceRegistry.createDevice('Phone'),
    stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  };
};

/** Counts every WebSocket connection a relay ever accepted. */
const countConnections = (relay) => ({ get n() { return relay.connectionCount; } });

const openSse = (port, hostPublicId, rawToken) => {
  const live = { seen: [], res: null };
  live.req = http.request({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `h-${hostPublicId}.localhost:${port}`, Cookie: `sl_dev=${rawToken}`, Accept: 'text/event-stream' } }, (res) => {
    live.res = res;
    res.on('data', (c) => live.seen.push({ at: Date.now(), text: c.toString('utf8') }));
    res.on('error', () => {});
  });
  live.req.on('error', () => {});
  live.req.end();
  live.text = () => live.seen.map((c) => c.text).join('');
  return live;
};

test('RA3E-1. disabled by default: the daemon starts, opens no relay socket, and stays fully local-functional', async () => {
  const { relay, port } = await startRelay();
  const conns = countConnections(relay);
  const e = await makeE2E(port); // relay configured, preference untouched
  try {
    const prefs = await (await e.local('/api/preferences')).json();
    assert.equal(prefs.preferences.remoteAccess.enabled, false);
    await sleep(250);
    assert.equal(conns.n, 0, 'no socket was ever opened');
    assert.equal(e.daemon.relayClient, undefined);
    assert.equal(relay.isHostConnected(e.hostPublicId), false);
    assert.equal((await e.local('/api/status')).status, 200);
    // Enabled but with no relay configuration: still nothing connects.
    const bare = await makeE2E(undefined);
    try {
      assert.equal((await bare.setRemote(true)).status, 200);
      await sleep(150);
      assert.equal(bare.daemon.relayClient, undefined);
      assert.equal(conns.n, 0);
      assert.equal((await bare.local('/api/status')).status, 200);
    } finally { await bare.stop(); }
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-2. enabling through the local preference path starts exactly one RelayClient that registers the real hostPublicId', async () => {
  const { relay, port } = await startRelay();
  const conns = countConnections(relay);
  const e = await makeE2E(port);
  try {
    assert.equal((await e.local('/api/preferences', { method: 'POST', body: JSON.stringify({ remoteAccess: { enabled: 'yes' } }) })).status, 400, 'strict boolean');
    const res = await e.setRemote(true);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.preferences.remoteAccess.enabled, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(e.dir, 'preferences.json'), 'utf8')).remoteAccess.enabled, true, 'persisted');
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)), 'relay verified the durable host identity');
    const client = e.daemon.relayClient;
    assert.ok(client);
    assert.equal(client.expectedOrigin, e.origin);
    // Repeating the enable never duplicates the client or the socket.
    await e.setRemote(true);
    await e.setRemote(true);
    await sleep(150);
    assert.equal(e.daemon.relayClient, client);
    assert.equal(conns.n, 1);
    assert.equal(relay.wss.clients.size, 1);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-3. disabling stops the RelayClient: socket closed, no reconnect, timers and in-flight state cleared, local daemon healthy', async () => {
  const { relay, port } = await startRelay();
  const conns = countConnections(relay);
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const { rawToken } = e.pairDevice();
    const sse = openSse(port, e.hostPublicId, rawToken);
    assert.ok(await waitUntil(() => e.daemon.sseClients.size === 1));
    const client = e.daemon.relayClient;
    await e.setRemote(false);
    assert.equal(e.daemon.relayClient, undefined);
    assert.deepEqual(client.stats, { connected: false, healthy: false, attempt: client.stats.attempt, reconnectPending: false, watchdogArmed: false, pumpArmed: false, active: 0, queuedBytes: 0, stopped: true });
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal(e.daemon.sseClients.size, 0);
    assert.ok(await waitUntil(() => !relay.isHostConnected(e.hostPublicId) && relay.wss.clients.size === 0 && relay.inflight.size === 0));
    await sleep(200);
    assert.equal(conns.n, 1, 'no reconnect after an intentional disable');
    assert.equal((await e.local('/api/status')).status, 200);
    sse.req.destroy();
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-4. re-enabling builds a fresh client with exactly one new connection, and requests work again', async () => {
  const { relay, port } = await startRelay();
  const conns = countConnections(relay);
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const first = e.daemon.relayClient;
    await e.setRemote(false);
    assert.ok(await waitUntil(() => !relay.isHostConnected(e.hostPublicId)));
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const second = e.daemon.relayClient;
    assert.notEqual(second, first, 'a stopped client is never reused');
    assert.equal(first.stats.stopped, true);
    await sleep(150);
    assert.equal(conns.n, 2, 'exactly one connection per enable');
    assert.equal(relay.wss.clients.size, 1);
    const { rawToken } = e.pairDevice();
    assert.equal((await browser(port, e.hostPublicId, { path: '/api/status', headers: { Cookie: `sl_dev=${rawToken}` } })).status, 200);
    // Rapid flapping still leaves exactly one live client/socket.
    await Promise.all([e.setRemote(false), e.setRemote(true), e.setRemote(false), e.setRemote(true)]);
    await sleep(200);
    assert.ok(e.daemon.relayClient);
    assert.equal(relay.wss.clients.size, 1);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-5. full REST path through the daemon-owned tunnel: auth, local-only denial, no Bearer or ?token= elevation', async () => {
  const { relay, port } = await startRelay();
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const { rawToken } = e.pairDevice();
    const cookie = { Cookie: `sl_dev=${rawToken}` };
    const ok = await browser(port, e.hostPublicId, { path: '/api/status', headers: { ...cookie, Accept: 'application/json' } });
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(ok.text).success, true);
    assert.match(String(ok.headers['set-cookie']), /sl_dev=.*Max-Age=2592000/);
    assert.equal((await browser(port, e.hostPublicId, { path: '/api/status' })).status, 401, 'no credential');
    assert.equal((await browser(port, e.hostPublicId, { path: '/api/status', headers: { Cookie: 'sl_dev=nope' } })).status, 401, 'invalid credential');
    for (const p of ['/api/devices', '/api/diagnostics']) {
      assert.equal((await browser(port, e.hostPublicId, { path: p, headers: cookie })).status, 403, `${p} is local-only`);
    }
    const bearer = { Authorization: `Bearer ${e.token}` };
    assert.equal((await browser(port, e.hostPublicId, { path: '/api/status', headers: bearer })).status, 401, 'admin Bearer is not a remote credential');
    assert.equal((await browser(port, e.hostPublicId, { path: '/api/devices', headers: { ...cookie, ...bearer } })).status, 403, 'Bearer cannot unlock local-only');
    assert.equal((await browser(port, e.hostPublicId, { path: `/api/status?token=${encodeURIComponent(e.token)}`, headers: cookie })).status, 401, '?token= cannot elevate');
    // A remote device cannot switch Remote Access off (or change anything) through the tunnel.
    const toggle = await browser(port, e.hostPublicId, { method: 'POST', path: '/api/preferences', body: JSON.stringify({ remoteAccess: { enabled: false } }), headers: { ...cookie, 'Content-Type': 'application/json', 'X-Sideline-Action': '1', Origin: e.origin } });
    assert.equal(toggle.status, 403);
    assert.equal((await (await e.local('/api/preferences')).json()).preferences.remoteAccess.enabled, true);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-6. remote mutation security holds over the real tunnel (action header + trusted Origin, never Host)', async () => {
  const { relay, port } = await startRelay();
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const { rawToken } = e.pairDevice();
    const p = '/api/queue/work-1/cancel';
    const base = { method: 'POST', path: p };
    const cookie = { Cookie: `sl_dev=${rawToken}` };
    assert.equal((await browser(port, e.hostPublicId, { ...base, headers: { ...cookie, Origin: e.origin } })).status, 403, 'missing action header');
    assert.equal((await browser(port, e.hostPublicId, { ...base, headers: { ...cookie, 'X-Sideline-Action': '1' } })).status, 403, 'missing Origin');
    assert.equal((await browser(port, e.hostPublicId, { ...base, headers: { ...cookie, 'X-Sideline-Action': '1', Origin: 'https://evil.test' } })).status, 403, 'foreign Origin');
    assert.equal((await browser(port, e.hostPublicId, { ...base, headers: { ...cookie, 'X-Sideline-Action': '1', Origin: `http://127.0.0.1:${port}` } })).status, 403, 'relay Host/loopback origin is not trusted');
    const good = await browser(port, e.hostPublicId, { ...base, headers: { ...cookie, 'X-Sideline-Action': '1', Origin: e.origin } });
    assert.notEqual(good.status, 403, 'trusted Origin + action header reaches routing');
    assert.ok([200, 404, 409].includes(good.status), `routing answered ${good.status}`);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-7. SSE streams end to end incrementally, later broadcasts arrive live, and the 15 s heartbeat still flows', async () => {
  const { relay, port } = await startRelay();
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const { rawToken } = e.pairDevice();
    const t0 = Date.now();
    const sse = openSse(port, e.hostPublicId, rawToken);
    assert.ok(await waitUntil(() => ['hello', 'status', 'ai-health', 'execution'].every((n) => sse.text().includes(`event: ${n}\n`))));
    assert.ok(sse.seen[0].at - t0 < 1000, 'first event within a second');
    assert.equal(sse.res.headers['content-type'], 'text/event-stream');
    const before = sse.seen.length;
    await sleep(120);
    e.daemon.broadcast('status', { tick: 42 });
    assert.ok(await waitUntil(() => sse.seen.slice(before).some((c) => c.text.includes('"tick":42'))), 'later broadcast delivered while the stream is open');
    assert.equal(sse.res.complete, false, 'stream not buffered to end');
    assert.ok(await waitUntil(() => sse.text().includes(': hb'), 20_000), 'existing 15 s SSE heartbeat crosses the tunnel');
    sse.req.destroy();
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-8. browser abort through the relay returns SSE subscribers and in-flight state to zero', async () => {
  const { relay, port } = await startRelay();
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const { rawToken } = e.pairDevice();
    const sse = openSse(port, e.hostPublicId, rawToken);
    assert.ok(await waitUntil(() => e.daemon.sseClients.size === 1 && sse.seen.length > 0));
    sse.req.destroy();
    assert.ok(await waitUntil(() => e.daemon.sseClients.size === 0));
    assert.ok(await waitUntil(() => relay.inflight.size === 0));
    assert.equal(e.daemon.relayClient.adapter.inflight.size, 0);
    assert.equal(e.daemon.relayClient.stats.active, 0);
    assert.equal(relay.isHostConnected(e.hostPublicId), true);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-9. relay loss and recovery: local stays healthy, in-flight work is cleaned, the same client reconnects and serves again', async () => {
  let relay = new ReferenceRelay({ relayDomain: 'localhost' });
  const port = await relay.listen(0);
  const e = await makeE2E(port);
  try {
    await e.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
    const client = e.daemon.relayClient;
    const { rawToken } = e.pairDevice();
    const sse = openSse(port, e.hostPublicId, rawToken);
    assert.ok(await waitUntil(() => e.daemon.sseClients.size === 1));
    await relay.close();
    sse.req.destroy();
    assert.ok(await waitUntil(() => e.daemon.sseClients.size === 0), 'in-flight remote work cleaned');
    assert.equal(client.adapter.inflight.size, 0);
    assert.equal((await e.local('/api/status')).status, 200, 'local daemon healthy without the relay');
    assert.ok(await waitUntil(() => client.stats.reconnectPending || client.stats.attempt > 0), 'reconnect behaviour engaged');
    relay = new ReferenceRelay({ relayDomain: 'localhost' });
    const conns = countConnections(relay);
    await relay.listen(port);
    assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId), 5000), 'fresh challenge/hello re-registered the host');
    assert.equal(e.daemon.relayClient, client, 'no duplicated RelayClient');
    const res = await browser(port, e.hostPublicId, { path: '/api/status', headers: { Cookie: `sl_dev=${rawToken}` } });
    assert.equal(res.status, 200);
    await sleep(200);
    assert.equal(relay.wss.clients.size, 1);
    assert.ok(conns.n >= 1);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-10. with the daemon up but no live tunnel, the relay answers the established 503 host_offline while local stays reachable', async () => {
  const { relay, port } = await startRelay();
  const e = await makeE2E(port); // Remote Access off => no verified connection
  try {
    const api = await browser(port, e.hostPublicId, { path: '/api/status' });
    assert.equal(api.status, 503);
    assert.equal(api.headers['content-type'], 'application/json');
    assert.equal(api.headers['cache-control'], 'no-store');
    assert.equal(api.text, '{"code":"host_offline","message":"Desktop host is offline"}');
    const page = await browser(port, e.hostPublicId, { path: '/', headers: { Accept: 'text/html' } });
    assert.equal(page.status, 503);
    assert.match(page.text, /Desktop Offline/);
    assert.equal((await e.local('/api/status')).status, 200);
  } finally {
    await e.stop();
    await relay.close();
  }
});

test('RA3E-11. two daemon hosts stay isolated: routes, devices and trusted origins never cross', async () => {
  const { relay, port } = await startRelay();
  const a = await makeE2E(port);
  const b = await makeE2E(port);
  try {
    assert.notEqual(a.hostPublicId, b.hostPublicId);
    await a.setRemote(true);
    await b.setRemote(true);
    assert.ok(await waitUntil(() => relay.isHostConnected(a.hostPublicId) && relay.isHostConnected(b.hostPublicId)));
    const devA = a.pairDevice();
    const devB = b.pairDevice();
    const asA = (headers) => browser(port, a.hostPublicId, { path: '/api/status', headers });
    const asB = (headers) => browser(port, b.hostPublicId, { path: '/api/status', headers });
    const okA = await asA({ Cookie: `sl_dev=${devA.rawToken}` });
    const okB = await asB({ Cookie: `sl_dev=${devB.rawToken}` });
    assert.equal(okA.status, 200);
    assert.equal(okB.status, 200);
    assert.notEqual(okA.text, okB.text, 'each origin is answered by its own daemon');
    assert.equal((await asA({ Cookie: `sl_dev=${devB.rawToken}` })).status, 401, "B's device is unknown to A");
    assert.equal((await asB({ Cookie: `sl_dev=${devA.rawToken}` })).status, 401, "A's device is unknown to B");
    // Trusted origin is per host: B's origin cannot authorize a mutation on A.
    const cross = await browser(port, a.hostPublicId, { method: 'POST', path: '/api/queue/x/cancel', headers: { Cookie: `sl_dev=${devA.rawToken}`, 'X-Sideline-Action': '1', Origin: b.origin } });
    assert.equal(cross.status, 403);
    // Disabling A leaves B untouched.
    await a.setRemote(false);
    assert.ok(await waitUntil(() => !relay.isHostConnected(a.hostPublicId)));
    assert.equal((await asB({ Cookie: `sl_dev=${devB.rawToken}` })).status, 200);
    assert.equal((await asA({ Cookie: `sl_dev=${devA.rawToken}` })).status, 503);
  } finally {
    await a.stop();
    await b.stop();
    await relay.close();
  }
});

test('RA3E-12. daemon shutdown while enabled tears everything down and leaves nothing running', async () => {
  const { relay, port } = await startRelay({ pingIntervalMs: 30 });
  const conns = countConnections(relay);
  const e = await makeE2E(port);
  await e.setRemote(true);
  assert.ok(await waitUntil(() => relay.isHostConnected(e.hostPublicId)));
  const client = e.daemon.relayClient;
  assert.ok(await waitUntil(() => client.stats.healthy), 'heartbeat active before shutdown');
  const { rawToken } = e.pairDevice();
  const sse = openSse(port, e.hostPublicId, rawToken);
  assert.ok(await waitUntil(() => e.daemon.sseClients.size === 1));
  await e.daemon.stop();
  assert.equal(e.daemon.relayClient, undefined);
  assert.deepEqual(client.stats, { connected: false, healthy: false, attempt: client.stats.attempt, reconnectPending: false, watchdogArmed: false, pumpArmed: false, active: 0, queuedBytes: 0, stopped: true });
  assert.equal(client.adapter.inflight.size, 0);
  assert.equal(e.daemon.sseClients.size, 0);
  assert.ok(await waitUntil(() => !relay.isHostConnected(e.hostPublicId) && relay.wss.clients.size === 0 && relay.inflight.size === 0), 'relay mapping and requests gone');
  const seen = conns.n;
  await sleep(250);
  assert.equal(conns.n, seen, 'nothing reconnects after shutdown');
  sse.req.destroy();
  await relay.close();
  fs.rmSync(e.dir, { recursive: true, force: true });
});

test('RA3E-13. a mutation interrupted by a disconnect is never replayed after reconnect', async () => {
  const stack = await makeHostStack();
  const peer = await startPeer('silent');
  let dispatched = 0;
  const original = stack.daemon.dispatchRemoteRequest.bind(stack.daemon);
  stack.daemon.dispatchRemoteRequest = async (...args) => { dispatched += 1; return original(...args); };
  let client;
  try {
    client = await startClientWith(stack, peer.url, { backoffScheduleMs: [20] });
    assert.ok(await waitUntil(() => peer.hellos() === 1));
    const { rawToken } = stack.pairDevice();
    peer.send({ t: 'req', id: 'mut-1', method: 'POST', path: '/api/queue/x/cancel', headers: { cookie: `sl_dev=${rawToken}`, 'x-sideline-action': '1', origin: client.expectedOrigin, 'content-type': 'application/json' }, body: '{}' });
    assert.ok(await waitUntil(() => dispatched === 1));
    peer.ws.terminate();
    assert.ok(await waitUntil(() => peer.connections === 2, 2000), 'reconnected');
    assert.ok(await waitUntil(() => peer.hellos() === 2));
    await sleep(300);
    assert.equal(dispatched, 1, 'the interrupted mutation was not retried');
    assert.equal(client.stats.active, 0);
  } finally {
    await client?.stop();
    await peer.close();
    await stack.stop();
  }
});
