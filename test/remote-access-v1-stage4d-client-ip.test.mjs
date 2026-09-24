import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { HostIdentityManager } from '../out/control-plane/host-identity.js';
import { ReferenceRelay } from '../out/relay-build/relay/reference-relay.js';
import { loadConfig, RelayConfigError } from '../out/relay-build/relay/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, ms = 2500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(10);
  }
  return fn();
};

const startEngine = async (options = {}) => {
  const events = [];
  const relay = new ReferenceRelay({ relayDomain: 'localhost', onEvent: (e) => events.push(e), ...options });
  const port = await relay.listen(0);
  return { relay, port, events };
};

const browser = (port, hostPublicId, { path: reqPath = '/', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: reqPath, agent: false, headers: { Host: `h-${hostPublicId}.localhost:${port}`, ...headers } }, (res) => {
    let text = '';
    res.on('data', (c) => { text += c; });
    res.on('end', () => resolve({ status: res.statusCode, text }));
  });
  req.on('error', reject);
  req.end();
});

const upgradeAttempt = (port, headers = {}) => new Promise((resolve) => {
  const req = http.request({
    host: '127.0.0.1', port, path: '/tunnel/v1',
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers }
  });
  req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
  req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
  req.on('error', () => resolve(0));
  req.end();
});

const OFFLINE = 'abcdefghijklmnopqrst';

test('RA4D-IP-1. CLIENT_IP_SOURCE config: default socket, fly opt-in, invalid or conflicting values refused', () => {
  const base = { PORT: '0', RELAY_DOMAIN: 'remote.mysidelinecoach.com', ENROLLMENT_KEY: 'k'.repeat(32) };
  assert.equal(loadConfig(base).clientIpSource, 'socket');
  assert.equal(loadConfig({ ...base, CLIENT_IP_SOURCE: 'fly' }).clientIpSource, 'fly');
  assert.throws(() => loadConfig({ ...base, CLIENT_IP_SOURCE: 'xff' }), RelayConfigError);
  assert.throws(() => loadConfig({ ...base, CLIENT_IP_SOURCE: 'fly', TRUST_PROXY: 'true' }), RelayConfigError);
});

test('RA4D-IP-2. fly mode: Fly-Client-IP alone picks the limiter bucket; forged X-Forwarded-For and junk values cannot', async () => {
  const { relay, port } = await startEngine({ clientIpSource: 'fly', rateLimits: { httpPerWindow: 3 } });
  try {
    const as = (headers) => browser(port, OFFLINE, { path: '/api/x', headers }).then((r) => r.status);
    // Client A exhausts its bucket; rotating forged XFF does not help.
    assert.deepEqual([await as({ 'Fly-Client-IP': '198.51.100.1', 'X-Forwarded-For': '1.1.1.1' }), await as({ 'Fly-Client-IP': '198.51.100.1', 'X-Forwarded-For': '2.2.2.2' }), await as({ 'Fly-Client-IP': '198.51.100.1' })], [503, 503, 503]);
    assert.equal(await as({ 'Fly-Client-IP': '198.51.100.1', 'X-Forwarded-For': '3.3.3.3' }), 429);
    // Client B (different Fly-Client-IP, incl. IPv6) is independent and not poisoned.
    assert.equal(await as({ 'Fly-Client-IP': '198.51.100.2' }), 503);
    assert.equal(await as({ 'Fly-Client-IP': '2001:db8::7' }), 503);
    // Missing / invalid values fall back to the socket peer: one shared bucket, never a chosen identity.
    const fallback = [];
    for (const value of [undefined, 'garbage', '1.2.3.4, 5.6.7.8', '999.1.1.1', '']) fallback.push(await as(value === undefined ? {} : { 'Fly-Client-IP': value }));
    assert.deepEqual(fallback, [503, 503, 503, 429, 429], 'invalid header values all share the socket-peer bucket');
  } finally { await relay.close(); }

  // Handshakes use the same identity source.
  const h = await startEngine({ clientIpSource: 'fly', rateLimits: { handshakePerWindow: 2 } });
  try {
    const results = [];
    for (const ip of ['198.51.100.9', '198.51.100.9', '198.51.100.9', '198.51.100.10']) results.push(await upgradeAttempt(h.port, { 'fly-client-ip': ip, 'x-forwarded-for': `9.9.9.${results.length}` }));
    assert.deepEqual(results, [101, 101, 429, 101]);
  } finally { await h.relay.close(); }
});

test('RA4D-IP-3. socket mode ignores Fly-Client-IP entirely', async () => {
  const { relay, port } = await startEngine({ clientIpSource: 'socket', rateLimits: { httpPerWindow: 2 } });
  try {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await browser(port, OFFLINE, { headers: { 'Fly-Client-IP': `198.51.100.${i}` } })).status);
    assert.deepEqual(statuses, [503, 503, 429, 429]);
  } finally { await relay.close(); }
});

test('RA4D-IP-4. neither Fly-Client-IP nor any forwarding header reaches the host frame; raw addresses never appear in events', async () => {
  const { relay, port, events } = await startEngine({ clientIpSource: 'fly', rateLimits: { httpPerWindow: 1 } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4d-'));
  const identity = new HostIdentityManager().ensureIdentity(path.join(dir, 'remote'));
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/tunnel/v1`);
    const frames = [];
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())));
    await new Promise((resolve) => ws.once('open', resolve));
    await waitUntil(() => frames.some((f) => f.t === 'challenge'));
    const nonce = frames.find((f) => f.t === 'challenge').nonce;
    ws.send(JSON.stringify({
      t: 'hello', v: 1, hostPublicId: identity.hostPublicId,
      publicKey: Buffer.from(identity.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex'),
      sig: crypto.sign(null, Buffer.from(nonce, 'base64url'), identity.privateKey).toString('base64url'), client: 'test'
    }));
    assert.ok(await waitUntil(() => relay.isHostConnected(identity.hostPublicId)));
    void browser(port, identity.hostPublicId, { path: '/api/x', headers: { 'Fly-Client-IP': '203.0.113.77', 'X-Forwarded-For': '203.0.113.88', 'X-Forwarded-Proto': 'https', Accept: 'application/json' } });
    assert.ok(await waitUntil(() => frames.some((f) => f.t === 'req')));
    assert.deepEqual(Object.keys(frames.find((f) => f.t === 'req').headers), ['accept']);
    // Trigger a 429 for that identity and confirm only a hash is ever emitted.
    assert.equal((await browser(port, OFFLINE, { headers: { 'Fly-Client-IP': '203.0.113.77' } })).status, 429);
    const limited = events.find((e) => e.event === 'rate_limit');
    assert.match(limited.client, /^[0-9a-f]{12}$/);
    assert.doesNotMatch(JSON.stringify(events), /203\.0\.113/);
    ws.close();
  } finally { await relay.close(); }
});
