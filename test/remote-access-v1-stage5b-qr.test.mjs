import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { PAIRING_MAX_FAILED_ATTEMPTS, PAIRING_TTL_MS } from '../out/control-plane/pairing.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY_DOMAIN = 'relay.example.test';

const request = (port, route, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { text += chunk; });
    res.on('end', () => resolve({
      status: res.statusCode,
      headers: res.headers,
      text,
      body: text && /^application\/json/.test(String(res.headers['content-type'])) ? JSON.parse(text) : undefined
    }));
  });
  req.on('error', reject);
  if (body !== undefined) req.write(JSON.stringify(body));
  req.end();
});

const makeDaemon = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra5b-'));
  const daemon = new ControlPlaneDaemon({
    dir,
    port: 47200 + Math.floor(Math.random() * 1_000),
    idleTimeoutMs: 60_000,
    remoteRelay: {
      relayUrl: 'wss://relay.example.test/tunnel/v1',
      relayDomain: RELAY_DOMAIN,
      enrollmentKey: 'test-enrollment-key-not-for-production'
    }
  });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  return {
    daemon,
    dir,
    token,
    create: () => request(daemon.port, '/api/pairing/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }),
    exchange: (body) => request(daemon.port, '/api/pairing/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }),
    stop: async () => {
      await daemon.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
};

const openLocalEvents = (port, token) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: '/api/events',
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }
  });
  req.on('error', reject);
  req.on('response', (res) => {
    if (res.statusCode !== 200) {
      reject(new Error(`SSE returned ${res.statusCode}`));
      return;
    }
    const bus = new EventEmitter();
    const events = [];
    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: ([^\n]+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (!event || data === undefined) continue;
        const parsed = { event, data: JSON.parse(data) };
        events.push(parsed);
        bus.emit(event, parsed);
      }
    });
    const waitFor = (event, timeoutMs = 2_000) => {
      const existing = events.find((entry) => entry.event === event);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolveEvent, rejectEvent) => {
        const timer = setTimeout(() => {
          bus.removeListener(event, onEvent);
          rejectEvent(new Error(`Timed out waiting for ${event}`));
        }, timeoutMs);
        const onEvent = (entry) => {
          clearTimeout(timer);
          resolveEvent(entry);
        };
        bus.once(event, onEvent);
      });
    };
    resolve({ events, waitFor, close: () => { req.destroy(); res.destroy(); } });
  });
  req.end();
});

test('RA5B-1. qrcode produces a valid, non-empty SVG for the exact pairing URL', async () => {
  const target = 'https://h-abcdefghijklmnopqrst.relay.example.test/pair#0123456789abcdefghij';
  const svg = await QRCode.toString(target, { type: 'svg' });
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<path /);
  assert.ok(svg.length > 500);
  assert.equal(svg, await QRCode.toString(target, { type: 'svg' }), 'the exact input has deterministic SVG output');
  assert.notEqual(svg, await QRCode.toString(`${target}x`, { type: 'svg' }), 'changing the encoded URL changes the symbol');
});

test('RA5B-2. local pairing creation returns the exact Stage 5B UI contract', async () => {
  const h = await makeDaemon();
  try {
    const beforeCreate = Date.now();
    const response = await h.create();
    const afterCreate = Date.now();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ['code', 'expiresAt', 'pairingId', 'qrSvg', 'secret', 'success', 'url']);
    assert.equal(response.body.success, true);
    assert.match(response.body.pairingId, /^[0-9a-f]{16}$/);
    assert.match(response.body.code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    assert.ok(response.body.expiresAt >= beforeCreate + PAIRING_TTL_MS);
    assert.ok(response.body.expiresAt <= afterCreate + PAIRING_TTL_MS);
    assert.match(response.body.qrSvg, /^<svg/);
  } finally { await h.stop(); }
});

test('RA5B-3. pairing URLs use the trusted relay domain and fragment-only secret transport', async () => {
  const h = await makeDaemon();
  try {
    const { body } = await h.create();
    const url = new URL(body.url);
    assert.match(url.hostname, new RegExp(`^h-[a-z2-7]{20}\\.${RELAY_DOMAIN.replaceAll('.', '\\.')}$$`));
    assert.equal(url.pathname, '/pair');
    assert.equal(url.search, '');
    assert.equal(url.hash, `#${body.secret}`);
    assert.equal(body.url, `https://${url.hostname}/pair#${body.secret}`);
    assert.doesNotMatch(body.url, /[?&](?:secret|code|token)=/i);
    assert.equal(body.qrSvg, await QRCode.toString(body.url, { type: 'svg' }), 'qrSvg encodes exactly the returned URL');
  } finally { await h.stop(); }
});

test('RA5B-4. QR generation performs no HTTP, HTTPS, or fetch request', async () => {
  const calls = [];
  const original = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request, httpsGet: https.get, fetch: globalThis.fetch };
  const blocked = (...args) => { calls.push(args); throw new Error('network access is forbidden during QR generation'); };
  http.request = blocked;
  http.get = blocked;
  https.request = blocked;
  https.get = blocked;
  globalThis.fetch = blocked;
  try {
    const svg = await QRCode.toString('https://h-local.example/pair#offline-secret', { type: 'svg' });
    assert.match(svg, /^<svg/);
    assert.equal(calls.length, 0);
  } finally {
    http.request = original.httpRequest;
    http.get = original.httpGet;
    https.request = original.httpsRequest;
    https.get = original.httpsGet;
    globalThis.fetch = original.fetch;
  }
});

test('RA5B-5. a successful durable exchange emits exactly one safe correlated pairing-complete event', async () => {
  const h = await makeDaemon();
  const sse = await openLocalEvents(h.daemon.port, h.token);
  try {
    await sse.waitFor('hello');
    const pairing = (await h.create()).body;
    const exchange = await h.exchange({ secret: pairing.secret, label: '  Dad Phone  ' });
    assert.equal(exchange.status, 200);
    const completed = await sse.waitFor('pairing-complete');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(completed.data, { pairingId: pairing.pairingId, deviceId: exchange.body.deviceId, label: 'Dad Phone' });
    assert.equal(sse.events.filter((entry) => entry.event === 'pairing-complete').length, 1);
    assert.deepEqual(Object.keys(completed.data).sort(), ['deviceId', 'label', 'pairingId']);
    const persisted = JSON.parse(fs.readFileSync(path.join(h.dir, 'remote', 'devices.json'), 'utf8'));
    assert.equal(persisted.devices.some((device) => device.deviceId === exchange.body.deviceId && device.label === 'Dad Phone'), true);
  } finally { sse.close(); await h.stop(); }
});

test('RA5B-6. invalid, expired, and burned exchanges emit zero pairing-complete events', async () => {
  const h = await makeDaemon();
  const sse = await openLocalEvents(h.daemon.port, h.token);
  try {
    await sse.waitFor('hello');
    assert.equal((await h.exchange({ secret: 'invalid' })).status, 401);

    const expired = (await h.create()).body;
    const record = h.daemon.pairingStore.records.get(expired.pairingId);
    record.expiresAt = Date.now() - 1;
    assert.equal((await h.exchange({ secret: expired.secret })).status, 401);

    const burned = (await h.create()).body;
    for (let i = 0; i < PAIRING_MAX_FAILED_ATTEMPTS; i += 1) {
      assert.equal((await h.exchange({ code: 'AAAA-AAAA' })).status, 401);
    }
    assert.equal((await h.exchange({ secret: burned.secret })).status, 401);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sse.events.filter((entry) => entry.event === 'pairing-complete').length, 0);
    assert.deepEqual((await request(h.daemon.port, '/api/devices', { headers: { Authorization: `Bearer ${h.token}` } })).body.devices, []);
  } finally { sse.close(); await h.stop(); }
});

test('RA5B-7. raw pairing and device credentials stay out of events, logs, persistence, and response bodies', async () => {
  const h = await makeDaemon();
  const sse = await openLocalEvents(h.daemon.port, h.token);
  try {
    await sse.waitFor('hello');
    const pairing = (await h.create()).body;
    const exchange = await h.exchange({ secret: pairing.secret, label: 'Safety Phone' });
    const event = await sse.waitFor('pairing-complete');
    const cookie = String(exchange.headers['set-cookie']);
    const rawToken = /^sl_dev=([^;]+)/.exec(cookie)?.[1];
    assert.match(rawToken, /^[A-Za-z0-9_-]{43}$/);

    const eventText = JSON.stringify(event.data);
    const deviceFile = fs.readFileSync(path.join(h.dir, 'remote', 'devices.json'), 'utf8');
    const logs = fs.readFileSync(path.join(h.dir, 'logs', 'control-plane.log'), 'utf8');
    const devicesResponse = await request(h.daemon.port, '/api/devices', { headers: { Authorization: `Bearer ${h.token}` } });
    for (const material of [pairing.secret, pairing.code, rawToken]) {
      assert.equal(eventText.includes(material), false, 'event payload is credential-free');
      assert.equal(deviceFile.includes(material), false, 'durable device file stores no raw credential');
      assert.equal(logs.includes(material), false, 'daemon logs store no raw credential');
      assert.equal(exchange.text.includes(material), false, 'exchange response body stores no raw credential');
      assert.equal(devicesResponse.text.includes(material), false, 'device summaries store no raw credential');
    }
    assert.match(deviceFile, /"tokenHash": "[0-9a-f]{64}"/);
    assert.doesNotMatch(deviceFile, /sl_dev|rawToken|secret/i);
  } finally { sse.close(); await h.stop(); }
});

test('RA5B-8. package manifest and audit cover the complete qrcode runtime closure and exclude dev-only packages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const packages = lock.packages;
  const resolveDependency = (packagePath, dependency) => {
    let scope = packagePath;
    for (;;) {
      const nested = `${scope}/node_modules/${dependency}`;
      if (packages[nested]) return nested;
      const marker = scope.lastIndexOf('/node_modules/');
      if (marker < 0) break;
      scope = scope.slice(0, marker);
    }
    const root = `node_modules/${dependency}`;
    assert.ok(packages[root], `lockfile is missing runtime dependency ${dependency}`);
    return root;
  };
  const closure = new Set();
  const visit = (packagePath) => {
    if (closure.has(packagePath)) return;
    closure.add(packagePath);
    for (const dependency of Object.keys(packages[packagePath]?.dependencies ?? {})) visit(resolveDependency(packagePath, dependency));
  };
  visit('node_modules/qrcode');
  const packagePaths = [...closure].map((entry) => entry.slice('node_modules/'.length)).sort();
  const expected = [
    'ansi-styles', 'camelcase', 'cliui', 'cliui/node_modules/ansi-regex', 'cliui/node_modules/strip-ansi',
    'color-convert', 'color-name', 'decamelize',
    'dijkstrajs', 'emoji-regex', 'find-up', 'get-caller-file', 'is-fullwidth-code-point', 'locate-path',
    'p-limit', 'p-locate', 'p-try', 'path-exists', 'pngjs', 'qrcode', 'require-directory',
    'require-main-filename', 'set-blocking', 'string-width', 'string-width/node_modules/ansi-regex',
    'string-width/node_modules/strip-ansi', 'which-module', 'wrap-ansi', 'wrap-ansi/node_modules/ansi-regex',
    'wrap-ansi/node_modules/strip-ansi',
    'y18n', 'yargs', 'yargs-parser'
  ].sort();
  assert.deepEqual(packagePaths, expected);
  assert.equal(manifest.dependencies.qrcode, '^1.5.4');
  assert.equal(manifest.devDependencies['@types/qrcode'], '^1.5.6');
  for (const packagePath of closure) {
    const topLevelPackage = packagePath.split('/node_modules/')[0];
    assert.ok(manifest.files.includes(`${topLevelPackage}/**`), `${packagePath} must ship through ${topLevelPackage}`);
  }
  assert.equal(manifest.files.some((entry) => entry.includes('@types/qrcode')), false, 'type-only package is not shipped');

  const audit = fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'audit-vsix.mjs'), 'utf8');
  for (const packagePath of expected) assert.ok(audit.includes(`'${packagePath}'`), `VSIX audit must require ${packagePath}`);
  assert.match(audit, /Unexpected node_modules packages/);
});
