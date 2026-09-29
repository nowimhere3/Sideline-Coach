/** R12 — Browser Preview V1 wire contract: exact-Game Stadium pull, local-only URLs, no proxy. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { classifyDaemonRoute } from '../out/control-plane/remote-routes.js';

const GAME = 'game_preview_wire';
const endpoint = {
  previewId: `${GAME}:stadium-preview:5173`, gameId: GAME, stadiumId: 'stadium-preview',
  localUrl: 'http://localhost:5173/', clientUrl: 'http://localhost:5173/', port: 5173,
  protocol: 'http', source: 'detected', ownership: 'verified', label: 'Vite', primary: true, observedAt: 1
};

async function harness({ features = ['game.preview.v1'], respond = () => ({ success: true, gameId: GAME, available: true, endpoints: [endpoint] }) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-wire-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 42700 + Math.floor(Math.random() * 250), idleTimeoutMs: 60_000 });
  await daemon.start();
  const calls = [];
  const socket = {
    readyState: 1,
    send(raw) {
      const frame = JSON.parse(String(raw));
      calls.push(frame);
      if (frame.method === 'game.preview.resolve') setImmediate(() => daemon.handleWsResponseForTest(frame.id, respond(frame)));
    },
    close() {}
  };
  daemon.registryInstance.registerSession({
    instanceId: 'session-preview', stadiumId: 'stadium-preview', name: 'Preview', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'Preview', fingerprintSource: 'test' }, rootFsPath: os.tmpdir(),
    roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features
  });
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  return {
    daemon, calls, api,
    async cleanup() { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

test('PW-1: the local dashboard pulls from the exact Stadium and gets a shaped endpoint', async () => {
  const h = await harness();
  try {
    const res = await h.api(`/api/games/preview?gameId=${GAME}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.available, true);
    assert.equal(res.body.endpoints[0].clientUrl, 'http://localhost:5173/');
    assert.equal('localUrl' in res.body.endpoints[0], false, 'the Stadium-side URL stays in the Stadium');
    const call = h.calls.at(-1);
    assert.equal(call.method, 'game.preview.resolve');
    assert.deepEqual(call.params, { gameId: GAME });
  } finally { await h.cleanup(); }
});

test('PW-2: a Stadium without game.preview.v1 is reported unsupported; an untrusted answer is a 502', async () => {
  const old = await harness({ features: ['game.files.v1'] });
  try {
    const res = await old.api(`/api/games/preview?gameId=${GAME}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'unsupported');
    assert.equal(old.calls.length, 0);
  } finally { await old.cleanup(); }

  const hostile = await harness({ respond: () => ({ success: true, gameId: GAME, available: true, endpoints: [{ ...endpoint, clientUrl: 'javascript:alert(1)' }] }) });
  try {
    const res = await hostile.api(`/api/games/preview?gameId=${GAME}`);
    assert.equal(res.status, 502);
  } finally { await hostile.cleanup(); }
});

test('PW-3: a paired phone is told preview lives on the computer and the Stadium is never asked', async () => {
  assert.equal(classifyDaemonRoute('GET', '/api/games/preview'), 'remote-read');
  const h = await harness();
  try {
    let status;
    let body = '';
    const res = { headersSent: false, writeHead(s) { status = s; this.headersSent = true; }, setHeader() {}, end(chunk) { body += chunk ?? ''; } };
    const req = Readable.from([]);
    Object.assign(req, { method: 'GET', url: `/api/games/preview?gameId=${GAME}`, headers: { host: 'h-test.sideline.live' }, socket: {} });
    await h.daemon.handleHttpRequest(req, res, { kind: 'remote-device', deviceId: 'paired-1', authenticatedBy: 'in-process', expectedOrigin: 'https://h-test.sideline.live' });
    assert.equal(status, 200);
    assert.deepEqual(JSON.parse(body), { success: true, gameId: GAME, available: false, endpoints: [], reason: 'remote-viewer' });
    assert.equal(h.calls.filter((call) => call.method === 'game.preview.resolve').length, 0);
  } finally { await h.cleanup(); }
});

test('PW-4: the daemon gained no outbound HTTP path to Game ports', () => {
  const daemonSource = fs.readFileSync(path.resolve('src/control-plane/daemon.ts'), 'latin1');
  const previewBlock = daemonSource.slice(daemonSource.indexOf("'/api/games/preview'"), daemonSource.indexOf('// S6: read-only Game filesystem contract.'));
  assert.ok(previewBlock.length > 0);
  assert.doesNotMatch(previewBlock, /https?\.(request|get)\(|net\.connect|localhost:/);
});

function client(previewResolver) {
  const sent = [];
  const stadium = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: 'exact-game', displayName: 'Exact', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: 'exact-game', stadiumId: 'stadium', rootFsPath: 'C:\\exact', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    previewResolver
  });
  stadium.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
  stadium.connected = true;
  return { stadium, sent };
}

test('PW-5: the Stadium resolves only its own Game, from its own root', async () => {
  const seen = [];
  const { stadium, sent } = client(async (gameId, root) => { seen.push([gameId, root]); return { available: false, endpoints: [], reason: 'not-running' }; });
  await stadium.handleIncomingRequest({ id: 1, method: 'game.preview.resolve', params: { gameId: 'other-game' } });
  assert.equal(seen.length, 0);
  assert.match(sent[0].result.message, /Game mismatch/i);

  await stadium.handleIncomingRequest({ id: 2, method: 'game.preview.resolve', params: { gameId: 'exact-game', rootFsPath: 'C:\\caller-must-not-control' } });
  assert.deepEqual(seen, [['exact-game', 'C:\\exact']]);
  assert.deepEqual(sent[1].result, { success: true, gameId: 'exact-game', available: false, endpoints: [], reason: 'not-running' });
});
