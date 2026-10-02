import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { StaticPreviewServer, STATIC_PREVIEW_INSTANCE_HEADER } from '../out/static-preview.js';
import { StadiumClient } from '../out/stadium-client.js';

const header = STATIC_PREVIEW_INSTANCE_HEADER.toLowerCase();
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-s4-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>game asset</h1>');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=never');
  return root;
}

function request(port, requestPath, { method = 'GET', expected } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method,
      headers: expected === undefined ? {} : { [STATIC_PREVIEW_INSTANCE_HEADER]: expected } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

function stadiumHarness(server, root, remoteName) {
  const sent = [];
  const stadium = new StadiumClient({
    autoReconnect: false,
    previewStaticServer: server,
    ...(remoteName === undefined ? {} : { remoteName }),
    gameContextGetter: () => ({
      game: { gameId: 'g1', displayName: 'Game', fingerprintSource: 'test' },
      stadium: { stadiumId: 's1', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'g1', stadiumId: 's1', rootFsPath: root, boundAt: 1, isPrimary: true, status: 'bound' }
    })
  });
  stadium.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))), close() {} };
  stadium.connected = true;
  return { stadium, sent };
}

async function rpc(harness, id = 1) {
  await harness.stadium.handleIncomingRequest({ id, method: 'game.preview.remoteTarget', params: { gameId: 'g1' } });
  return harness.sent.at(-1).result;
}

async function advertisedFeatures(harness) {
  const pending = harness.stadium.sendHello();
  const hello = harness.sent.at(-1);
  harness.stadium.handleIncomingMessage(JSON.stringify({ jsonrpc: '2.0', id: hello.id, result: { success: true } }));
  await pending;
  return hello.params.features;
}

test('S4 static server mints a fresh 128-bit identity per start and stale identity fails on the replacement', async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = new StaticPreviewServer();
  t.after(() => server.dispose());
  const first = await server.urlFor('g1', root, 'index.html');
  const a = server.activeInstanceId;
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  await server.dispose();
  assert.equal(server.activeInstanceId, undefined);
  assert.equal(server.activePort, undefined);
  const second = await server.urlFor('g1', root, 'index.html');
  const b = server.activeInstanceId;
  assert.match(b, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
  const stale = await request(Number(second.port), '/index.html', { expected: a });
  assert.equal(stale.status, 409, 'stale identity cannot validate the listener now occupying the target port');
  assert.equal(stale.headers[header], b);
  assert.doesNotMatch(stale.body, /game asset/);
  assert.ok(first.port, 'the first listener had an independent ephemeral target');
});

test('S4 instance header verifies before path/filesystem handling and every response echoes current identity', async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = new StaticPreviewServer();
  t.after(() => server.dispose());
  const url = await server.urlFor('g1', root, 'index.html');
  const port = Number(url.port);
  const current = server.activeInstanceId;
  const correct = await request(port, '/index.html', { expected: current });
  assert.equal(correct.status, 200);
  assert.equal(correct.body, '<h1>game asset</h1>');
  const desktop = await request(port, '/index.html');
  assert.equal(desktop.status, 200, 'no expected-instance header preserves desktop Preview');
  assert.equal(desktop.body, correct.body);
  for (const sample of [
    await request(port, '/missing.html'),
    await request(port, '/.env'),
    await request(port, '/index.html', { method: 'POST' })
  ]) assert.equal(sample.headers[header], current);
  const staleMalformed = await request(port, '/%00-would-be-bad', { expected: 'stale-instance' });
  assert.equal(staleMalformed.status, 409, 'identity rejection precedes even URL/path validation');
  assert.equal(staleMalformed.headers[header], current);
  assert.doesNotMatch(staleMalformed.body, /game asset|SECRET/);
});

test('S4 remoteTarget is read-only, exact-Game, lifecycle-current, and refuses non-colocated targets', async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = new StaticPreviewServer();
  const local = stadiumHarness(server, root, undefined);
  t.after(() => local.stadium.dispose());
  assert.deepEqual(await rpc(local), { success: true, gameId: 'g1', available: false, reason: 'not-running' });
  assert.equal(server.activePort, undefined, 'observation did not start Preview');
  await local.stadium.handleIncomingRequest({ id: 10, method: 'game.preview.remoteTarget', params: { gameId: 'other-game' } });
  assert.equal(local.sent.at(-1).result.success, false);
  assert.equal('port' in local.sent.at(-1).result, false, 'a mismatched Game cannot observe a target');
  const url = await server.urlFor('g1', root, 'index.html');
  const port = Number(url.port);
  const instanceId = server.activeInstanceId;
  assert.deepEqual(await rpc(local, 2), { success: true, gameId: 'g1', available: true, port, instanceId });
  assert.equal(server.activePort, port, 'observation did not replace the running listener');
  assert.equal(server.activeInstanceId, instanceId);
  const otherRoot = fixture();
  t.after(() => fs.rmSync(otherRoot, { recursive: true, force: true }));
  await server.prepare('g2', otherRoot);
  assert.equal(server.activeInstanceId, undefined, 'switching Games invalidates the old server identity');
  assert.equal(server.activePort, undefined);
  assert.deepEqual(await rpc(local, 3), { success: true, gameId: 'g1', available: false, reason: 'not-running' });

  const remoteServer = new StaticPreviewServer();
  await remoteServer.urlFor('g1', root, 'index.html');
  const remote = stadiumHarness(remoteServer, root, 'ssh-remote');
  t.after(() => remote.stadium.dispose());
  assert.deepEqual(await rpc(remote), { success: true, gameId: 'g1', available: false, reason: 'not-colocated' });
});

test('S4 advertises remote Preview capability only for co-located Stadiums', async (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const local = stadiumHarness(new StaticPreviewServer(), root, undefined);
  const remote = stadiumHarness(new StaticPreviewServer(), root, 'wsl');
  t.after(() => local.stadium.dispose());
  t.after(() => remote.stadium.dispose());
  assert.ok((await advertisedFeatures(local)).includes('game.preview.remote.v1'));
  assert.ok(!(await advertisedFeatures(remote)).includes('game.preview.remote.v1'));
});
