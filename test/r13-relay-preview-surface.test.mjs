import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { ReferenceRelay, DEFAULT_RATE_LIMITS, MAX_PREVIEW_RESPONSE_QUEUE_BYTES } from '../out/relay-build/relay/reference-relay.js';
import { deriveHostPublicId } from '../out/control-plane/host-identity.js';
import { RelayClient } from '../out/control-plane/relay-client.js';
import { loadConfig, startRelay } from '../out/relay-build/relay/index.js';

const tag = 'abcdef2345';
async function setup(t, caps, options = {}) {
  const relay = new ReferenceRelay({ relayDomain: 'preview.test', ...options });
  const port = await relay.listen();
  t.after(() => relay.close());
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const id = deriveHostPublicId(raw);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/tunnel/v1`);
  const frames = [];
  const registered = new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString());
      if (frame.t === 'challenge') {
        ws.send(JSON.stringify({ t: 'hello', v: 1, hostPublicId: id, publicKey: raw.toString('hex'),
          sig: crypto.sign(null, Buffer.from(frame.nonce, 'base64url'), privateKey).toString('base64url'),
          client: 's3-test', ...(caps === undefined ? {} : { caps }) }));
        // Ordered messages on this socket: pong implies hello was processed first.
        ws.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
        resolve();
      }
      if (frame.t === 'req') {
        frames.push(frame);
        ws.send(JSON.stringify({ t: 'head', id: frame.id, status: 200, headers: { 'content-type': 'text/plain' } }));
        ws.send(JSON.stringify({ t: 'data', id: frame.id, chunk: 'ok' }));
        ws.send(JSON.stringify({ t: 'end', id: frame.id }));
      }
    });
  });
  await registered;
  // Event-loop polling only for registration, never for limiter-window timing.
  while (!relay.isHostConnected(id)) await new Promise((resolve) => setImmediate(resolve));
  const request = (surface = 'preview', { method = 'GET', path = '/asset.png', headers = {}, hostname } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path,
      headers: { host: hostname ?? `${surface === 'preview' ? `p-${id}-${tag}` : `h-${id}`}.preview.test:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  return { relay, ws, frames, request, id, port };
}

test('S3: Preview framing, exact allowlist, methods, and path redaction; app remains unchanged', async (t) => {
  const logs = [];
  const { request, frames } = await setup(t, ['preview.v1'], { log: (entry) => logs.push(entry) });
  const allowed = { accept: 'image/png', cookie: '__Host-sl_pv=test', 'user-agent': 's3', 'service-worker': 'script' };
  assert.equal((await request('preview', { path: '/private-game.png?ticket=secret', headers: {
    ...allowed, authorization: 'Bearer secret', origin: 'https://evil.test', 'x-sideline-action': '1',
    'content-type': 'text/plain', 'last-event-id': '9', range: 'bytes=0-1', 'if-none-match': 'x',
    'if-modified-since': 'y', 'x-forwarded-for': '1.2.3.4', 'x-custom': 'secret'
  } })).status, 200);
  assert.equal(frames[0].surface, 'preview');
  assert.equal(frames[0].previewTag, tag);
  assert.equal(frames[0].path, '/private-game.png?ticket=secret');
  assert.deepEqual(frames[0].headers, allowed);
  assert.equal((await request('preview', { method: 'HEAD' })).status, 200);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const count = frames.length;
    const res = await request('preview', { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
    assert.equal(frames.length, count);
  }
  assert.equal((await request('preview', { path: '/health' })).status, 200);
  assert.equal(frames.at(-1).surface, 'preview', 'Preview health path is not a relay-health bypass');
  assert.ok(logs.every((entry) => entry.path === '/<preview>' && entry.surface === 'preview'));
  assert.ok(!JSON.stringify(logs).includes('secret'));
  assert.ok(!JSON.stringify(logs).includes('private-game'));
  assert.equal((await request('app', { method: 'POST', path: '/api/test?private=query', headers: { origin: 'https://app.test', 'x-sideline-action': '1' } })).status, 200);
  assert.equal(frames.at(-1).surface, 'app');
  assert.equal(frames.at(-1).previewTag, undefined);
  assert.equal(frames.at(-1).headers.origin, 'https://app.test');
  assert.equal(logs.at(-1).path, '/api/test');
  assert.equal(logs.at(-1).surface, undefined);
});

test('S3: legacy host remains app-capable but Preview is 404; malformed hosts never forward', async (t) => {
  const logs = [];
  const { request, frames, id, port } = await setup(t, undefined, { log: (e) => logs.push(e) });
  assert.equal((await request()).status, 404);
  assert.equal(logs[0].path, '/<preview>');
  assert.equal(frames.length, 0);
  assert.equal((await request('app')).status, 200);
  for (const hostname of [`p-${id}-abcdef2340.preview.test:${port}`, `p-${id}-abcdef234.preview.test`,
    `p-${id.slice(1)}-${tag}.preview.test`, `p-${id}-${tag}.evil.test`, `p-${id}-${tag}.preview.test.evil`]) {
    assert.equal((await request('preview', { hostname })).status, 404);
  }
  assert.equal(frames.length, 1);
});

test('S3: separate exact 600 Preview / 120 app budgets with injected clock', async (t) => {
  let now = 1000;
  const events = [];
  const { request, frames } = await setup(t, ['preview.v1'], { rateLimits: {}, now: () => now, onEvent: (e) => events.push(e) });
  assert.equal(DEFAULT_RATE_LIMITS.previewPerWindow, 600);
  for (let i = 0; i < 600; i++) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
  for (let i = 0; i < 120; i++) assert.equal((await request('app')).status, 200);
  assert.equal((await request('app')).status, 429);
  assert.equal(frames.length, 720);
  assert.deepEqual(events.filter((e) => e.event === 'rate_limit').map((e) => e.scope), ['preview', 'http']);
  now += 60_000;
  assert.equal((await request()).status, 200);
  assert.equal((await request('app')).status, 200);
});

test('S3: client validates additive surface fields and passes them through without advertising capability', async () => {
  const parse = RelayClient.prototype.parseReq;
  const base = { t: 'req', id: 'x', method: 'GET', path: '/', headers: {} };
  assert.deepEqual(parse.call({}, base), base);
  const preview = { ...base, surface: 'preview', previewTag: tag };
  assert.deepEqual(parse.call({}, preview), preview);
  for (const extra of [{ surface: 'other' }, { surface: 'preview' }, { previewTag: tag },
    { surface: 'app', previewTag: tag }, { surface: 'preview', previewTag: 'abcdef2340' }, { surface: 'preview', previewTag: 123 }]) {
    assert.equal(parse.call({}, { ...base, ...extra }), undefined);
  }
  let seen;
  const client = { active: new Set(), adapter: { dispatch: async (req) => { seen = req; } }, enqueue: () => true };
  RelayClient.prototype.onReq.call(client, { dead: false, drainListeners: new Set() }, preview);
  assert.equal(seen.surface, 'preview');
  assert.equal(seen.previewTag, tag);
  const errors = [];
  let closed = false;
  RelayClient.prototype.onMessage.call({ parseReq: parse, sendControl: (_conn, frame) => errors.push(frame) },
    { helloSent: true, ws: { close() { closed = true; } } }, JSON.stringify({ ...base, surface: 'preview', previewTag: 'invalid' }));
  assert.deepEqual(errors, [{ t: 'error', id: 'x', code: 'bad_frame' }]);
  assert.equal(closed, false, 'bad additive request fails only that request');
});

test('S3: stalled Preview response capped at 8 MiB, app still 1 MiB; cancel only that response', async (t) => {
  const relay = new ReferenceRelay({ relayDomain: 'preview.test' });
  t.after(() => relay.close());
  const sent = [];
  const ws = { readyState: WebSocket.OPEN, send: (s) => sent.push(JSON.parse(s)) };
  for (const [surface, limit] of [['app', 1024 * 1024], ['preview', MAX_PREVIEW_RESPONSE_QUEUE_BYTES]]) {
    let destroyed = false;
    const res = { writableLength: limit, write() {}, destroy() { destroyed = true; } };
    relay.inflight.set(surface, { surface, ws, res, headSent: true, bytes: 0, pathname: '/secret', started: Date.now() });
    relay.onResponseFrame(ws, { t: 'data', id: surface, chunkB64: 'AA==' });
    assert.equal(destroyed, false, 'at boundary remains open');
    res.writableLength++;
    relay.onResponseFrame(ws, { t: 'data', id: surface, chunkB64: 'AA==' });
    assert.equal(destroyed, true);
    assert.equal(relay.inflight.has(surface), false);
    assert.deepEqual(sent.at(-1), { t: 'cancel', id: surface });
  }
});

test('S3: production log serialization labels Preview and never exposes its path or query', async (t) => {
  const lines = [];
  const config = loadConfig({ PORT: '0', BIND_HOST: '127.0.0.1', RELAY_DOMAIN: 'preview.test', ALLOW_OPEN_ENROLLMENT: 'true' });
  assert.equal(config.rateLimits.previewPerWindow, 600);
  const running = await startRelay(config, (line) => lines.push(JSON.parse(line)));
  t.after(() => running.shutdown());
  const res = await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: running.port, path: '/hidden-game.png?ticket=secret',
      headers: { host: `p-${'a'.repeat(20)}-${tag}.preview.test` } }, (res) => {
      res.resume(); res.on('end', () => resolve(res));
    });
    req.on('error', reject);
  });
  assert.equal(res.statusCode, 404);
  const entry = lines.find((e) => e.event === 'req');
  assert.equal(entry.surface, 'preview');
  assert.equal(entry.path, '/<preview>');
  assert.ok(!JSON.stringify(lines).includes('hidden-game'));
  assert.ok(!JSON.stringify(lines).includes('secret'));
});
