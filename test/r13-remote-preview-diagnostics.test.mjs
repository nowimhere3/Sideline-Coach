import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RemotePreviewGateway, derivePreviewTag, PREVIEW_GRANT_IDLE_MS } from '../out/control-plane/remote-preview-gateway.js';
import { StaticPreviewServer } from '../out/static-preview.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { RelayClient } from '../out/control-plane/relay-client.js';
import { DeviceRegistry } from '../out/control-plane/device-registry.js';

function sink() {
  const res = new EventEmitter();
  Object.assign(res, { headers: {}, chunks: [], writeHead(status, headers) { res.status = status; res.headers = headers; },
    write(chunk) { res.chunks.push(Buffer.from(chunk)); return true; }, end(chunk) { if (chunk) res.chunks.push(Buffer.from(chunk)); }, destroy() { res.emit('close'); } });
  return res;
}
async function rig(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-diag-'));
  const body = Buffer.from('Preview binary\0💥');
  fs.writeFileSync(path.join(dir, 'index.html'), body);
  const server = new StaticPreviewServer();
  await server.urlFor('safe-game', dir, 'index.html');
  t.after(async () => { await server.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  const registry = new DeviceRegistry(path.join(dir, 'devices.json'));
  const phone = registry.createDevice('Phone');
  const state = { now: 10000, advertised: false, rpc: 0, deviceReads: 0, touches: 0,
    session: { instanceId: 'stadium-private-instance', features: ['game.preview.remote.v1'] } };
  const host = 'a'.repeat(20);
  const tag = derivePreviewTag(host, 'safe-game');
  const gateway = new RemotePreviewGateway({ origin: () => ({ hostPublicId: host, relayDomain: 'example.test' }),
    tunnelConnected: () => true, previewAdvertised: () => state.advertised,
    deviceLive(id) { state.deviceReads++; return registry.isLive(id); }, admission: () => ({ state: 'allow' }),
    touch() { state.touches++; }, knownGame: () => true,
    session: () => ({ status: 'connected', session: state.session }), now: () => state.now,
    rpc: async (_session, _method, params) => { state.rpc++; return { success: true, gameId: params.gameId,
      available: true, port: server.activePort, instanceId: server.activeInstanceId }; }
  });
  const call = async (url, cookie, method = 'GET') => {
    const res = sink(); await gateway.handle({ url, method, headers: {} }, res, { previewTag: tag, cookie }); return res;
  };
  return { gateway, server, state, phone, registry, dir, body, call };
}

test('S7 empty current-truth block, exact schema and observed capability state', async (t) => {
  const r = await rig(t);
  assert.deepEqual(r.gateway.diagnosticsSnapshot(), { advertised: false, grants: [], counters: { entered: 0, served: 0, bytes: 0, denied: {} } });
  r.state.advertised = true;
  assert.equal(r.gateway.diagnosticsSnapshot().advertised, true);
  const getter = Object.getOwnPropertyDescriptor(RelayClient.prototype, 'previewAdvertised').get;
  assert.equal(getter.call({ conn: { dead: false, helloSent: false, ws: { readyState: 1 } } }), false);
  assert.equal(getter.call({ conn: { dead: false, helloSent: true, ws: { readyState: 1 } } }), true);
  assert.equal(getter.call({ conn: { dead: true, helloSent: true, ws: { readyState: 1 } } }), false);
  assert.equal(getter.call({ conn: undefined }), false);
});

test('S7 grants are privacy-safe, detached summaries; reads never refresh, purge, RPC or touch devices/lifecycle', async (t) => {
  const r = await rig(t);
  const minted = await r.gateway.mint({ deviceId: r.phone.deviceId, gameId: 'safe-game', pagePath: 'index.html' });
  assert.equal(minted.ok, true);
  const ticket = new URL(minted.frameUrl).searchParams.get('t');
  const entered = await r.call(new URL(minted.frameUrl).pathname + new URL(minted.frameUrl).search);
  const cookie = entered.headers['set-cookie'].split(';')[0];
  await r.call('/index.html', cookie);
  const before = { stats: r.gateway.stats, grants: JSON.stringify([...r.gateway.grants]),
    rpc: r.state.rpc, devices: fs.readFileSync(path.join(r.dir, 'devices.json'), 'utf8'),
    deviceReads: r.state.deviceReads, touches: r.state.touches, port: r.server.activePort, identity: r.server.activeInstanceId };
  r.state.now += PREVIEW_GRANT_IDLE_MS + 5000;
  const snapshot = r.gateway.diagnosticsSnapshot();
  assert.deepEqual(snapshot.counters, { entered: 1, served: 1, bytes: r.body.length, denied: {} });
  assert.deepEqual(snapshot.grants[0], { gameId: 'safe-game',
    deviceTag: crypto.createHash('sha256').update(r.phone.deviceId).digest('hex').slice(0, 6),
    ageS: 1805, idleS: 1805, stadiumMatch: true, staticMatch: true });
  const serialized = JSON.stringify(snapshot);
  for (const secret of [ticket, cookie, cookie.split('=')[1], r.phone.deviceId, r.phone.rawToken, r.dir,
    r.server.activeInstanceId, 'stadium-private-instance', String(r.server.activePort)]) assert.ok(!serialized.includes(secret), secret);
  for (const key of ['port', 'instanceId', 'cookie', 'grantId', 'secretHash', 'deviceId', 'path', 'url']) assert.ok(!serialized.includes(`"${key}"`));
  snapshot.grants[0].deviceTag = 'mutated'; snapshot.counters.denied.method = 999;
  assert.notEqual(r.gateway.diagnosticsSnapshot().grants[0].deviceTag, 'mutated');
  assert.deepEqual(r.gateway.stats, before.stats);
  assert.equal(JSON.stringify([...r.gateway.grants]), before.grants);
  assert.equal(r.state.rpc, before.rpc);
  assert.equal(r.state.deviceReads, before.deviceReads);
  assert.equal(r.state.touches, before.touches);
  assert.equal(fs.readFileSync(path.join(r.dir, 'devices.json'), 'utf8'), before.devices);
  assert.equal(r.server.activePort, before.port);
  assert.equal(r.server.activeInstanceId, before.identity);
  r.state.session = { ...r.state.session, instanceId: 'different-session' };
  assert.equal(r.gateway.diagnosticsSnapshot().grants[0].stadiumMatch, false);
  r.gateway.targets.clear();
  assert.equal(r.gateway.diagnosticsSnapshot().grants[0].staticMatch, 'unknown');
});

test('S7 actual denials retain richer vocabulary and last observed timestamps', async (t) => {
  const r = await rig(t);
  await r.call('/__sideline/preview/enter?t=invalid');
  assert.deepEqual(r.gateway.diagnosticsSnapshot().lastDenial, { code: 'bad-ticket', at: 10000 });
  r.state.now += 1000;
  await r.call('/__sideline/reserved');
  r.state.now += 1000;
  await r.call('/%00bad');
  await r.call('/index.html', undefined, 'POST');
  const diag = r.gateway.diagnosticsSnapshot();
  assert.deepEqual(diag.counters.denied, { 'bad-ticket': 1, reserved: 1, 'bad-path': 1, method: 1 });
  assert.deepEqual(diag.lastDenial, { code: 'method', at: 12000 });
  assert.equal(diag.counters.served, 0);
});

test('S7 local-only existing diagnostics endpoint includes additive remotePreview and preserves existing fields', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13-diag-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 43754, idleTimeoutMs: 60000 });
  t.after(async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${daemon.port}/api/diagnostics`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.controlPlane); assert.ok(Array.isArray(body.sessions)); assert.equal(typeof body.at, 'number');
  assert.deepEqual(body.remotePreview, { advertised: false, grants: [], counters: { entered: 0, served: 0, bytes: 0, denied: {} } });
  const phone = daemon.deviceRegistry.createDevice('Phone');
  const frames = [];
  const { InProcessRemoteAdapter } = await import('../out/control-plane/remote-dispatch.js');
  const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: daemon.deviceRegistry, expectedOrigin: 'https://h-test.example' });
  await adapter.dispatch({ t: 'req', id: 'diag', method: 'GET', path: '/api/diagnostics', headers: { cookie: `__Host-sl_dev=${phone.rawToken}` } }, (frame) => frames.push(frame));
  assert.equal(frames.find((f) => f.t === 'head').status, 403);
  assert.ok(!JSON.stringify(frames).includes('remotePreview'));
});
