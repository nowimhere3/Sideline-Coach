import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { savePreferences, DEFAULT_PREFERENCES } from '../out/running-players.js';

const IDLE = 300; // ms: stands in for the production 30-minute idle window
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(10);
  }
  return fn();
};

const deadPort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

/** A real daemon whose idle exit is observable instead of terminating the test process. */
const makeDaemon = async ({ remoteOn = false, relayPort } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-ra4e-'));
  if (remoteOn) savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, remoteAccess: { enabled: true } });
  const exits = [];
  const daemon = new ControlPlaneDaemon({
    dir, port: 46100 + Math.floor(Math.random() * 500), idleTimeoutMs: IDLE, exitProcess: (code) => exits.push({ code, at: Date.now() }),
    ...(relayPort ? { remoteRelay: { relayUrl: `ws://127.0.0.1:${relayPort}/tunnel/v1`, relayDomain: 'localhost', tuning: { backoffScheduleMs: [20] } } } : {})
  });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const setRemote = (enabled) => fetch(`http://127.0.0.1:${daemon.port}/api/preferences`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ remoteAccess: { enabled } }) });
  const logText = () => { try { return fs.readFileSync(path.join(dir, 'logs', 'control-plane.log'), 'utf8'); } catch { return ''; } };
  return { daemon, dir, exits, setRemote, logText, startedAt: Date.now(), stop: async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
};

test('RA4E-1. Remote Access OFF: the existing idle policy still ends an unowned daemon', async () => {
  const h = await makeDaemon();
  try {
    assert.ok(await waitUntil(() => h.exits.length === 1, 3000), 'idle shutdown still happens');
    assert.equal(h.exits[0].code, 0);
    assert.ok(h.exits[0].at - h.startedAt >= IDLE * 0.8, 'not before the idle window');
  } finally { await h.stop(); }
});

test('RA4E-2. Remote Access ON holds the daemon well past the idle window with no remote traffic', async () => {
  const h = await makeDaemon({ remoteOn: true });
  try {
    await sleep(IDLE * 4);
    assert.equal(h.exits.length, 0, 'still alive after 4x the idle window with no Stadium and no remote request');
    assert.equal(h.daemon.idleTimer, undefined, 'no countdown is even running');
    assert.equal((await fetch(`http://127.0.0.1:${h.daemon.port}/api/health`)).status, 200);
  } finally { await h.stop(); }
});

test('RA4E-3. Remote Access ON with the relay unreachable still holds the daemon while RelayClient keeps reconnecting', async () => {
  const relayPort = await deadPort();
  const h = await makeDaemon({ remoteOn: true, relayPort });
  try {
    assert.ok(await waitUntil(() => h.daemon.relayClient && h.daemon.relayClient.stats.attempt >= 2), 'reconnect attempts are happening');
    await sleep(IDLE * 4);
    assert.equal(h.exits.length, 0);
    assert.equal(h.daemon.relayClient.stats.stopped, false);
    assert.ok(h.daemon.relayClient.stats.attempt >= 4, 'RelayClient kept retrying throughout');
    assert.equal(h.daemon.idleTimer, undefined);
  } finally { await h.stop(); }
});

test('RA4E-4. enabling Remote Access during an idle countdown cancels the pending shutdown', async () => {
  const h = await makeDaemon();
  try {
    assert.ok(h.daemon.idleTimer, 'countdown running');
    await sleep(IDLE * 0.4);
    assert.equal((await h.setRemote(true)).status, 200);
    assert.equal(h.daemon.idleTimer, undefined, 'countdown cancelled');
    await sleep(IDLE * 3);
    assert.equal(h.exits.length, 0, 'survived past the original deadline');
    assert.match(h.logText(), /Remote Access enabled\. Idle shutdown timer cancelled\./);
  } finally { await h.stop(); }
});

test('RA4E-5. disabling Remote Access restores a clean, full idle countdown (no immediate exit)', async () => {
  const h = await makeDaemon({ remoteOn: true });
  try {
    await sleep(IDLE * 2);
    assert.equal(h.exits.length, 0);
    const before = Date.now();
    assert.equal((await h.setRemote(false)).status, 200);
    assert.ok(h.daemon.idleTimer, 'exactly one countdown started');
    await sleep(IDLE * 0.4);
    assert.equal(h.exits.length, 0, 'no premature exit from stale state');
    assert.ok(await waitUntil(() => h.exits.length === 1, 3000), 'normal idle shutdown is eligible again');
    assert.ok(h.exits[0].at - before >= IDLE * 0.8, 'the full window was honoured after disable');
    assert.equal(h.daemon.idleTimer, undefined);
  } finally { await h.stop(); }
});

test('RA4E-6. rapid enable/disable/enable leaves one coherent state with no duplicate or leaked timers', async () => {
  const h = await makeDaemon();
  try {
    await Promise.all([h.setRemote(true), h.setRemote(false), h.setRemote(true), h.setRemote(false), h.setRemote(true)]);
    assert.equal(h.daemon.getPreferences().remoteAccess.enabled, true);
    assert.equal(h.daemon.idleTimer, undefined, 'final state ON: no countdown');
    assert.ok(h.daemon.relayClient === undefined, 'no relay configured: no client');
    await sleep(IDLE * 3);
    assert.equal(h.exits.length, 0, 'no premature exit');
    // Now end on OFF: exactly one countdown, exactly one exit.
    const startsBefore = (h.logText().match(/Starting \d+ms idle shutdown timer/g) ?? []).length;
    await Promise.all([h.setRemote(false), h.setRemote(true), h.setRemote(false)]);
    assert.ok(h.daemon.idleTimer, 'one countdown after ending OFF');
    assert.ok(await waitUntil(() => h.exits.length === 1, 3000));
    await sleep(IDLE);
    assert.equal(h.exits.length, 1, 'exactly one exit');
    const starts = (h.logText().match(/Starting \d+ms idle shutdown timer/g) ?? []).length - startsBefore;
    assert.ok(starts >= 1 && starts <= 2, `countdown starts were coherent (${starts})`);
    assert.equal(h.daemon.idleTimer, undefined, 'no leaked timer');
  } finally { await h.stop(); }
});
