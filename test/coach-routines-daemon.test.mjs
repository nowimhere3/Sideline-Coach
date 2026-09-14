/** Coach Routines V0 Slices A+B — real daemon API and router-event wiring. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const GAME_A = 'game_routine_wire_a';
const GAME_B = 'game_routine_wire_b';
const CODEX = 'codex-routine-a';
const TERMINAL = 'terminal-routine-a';
const tick = () => new Promise((resolve) => setImmediate(resolve));

function capability(instanceId, playerType = 'codex', state = 'ready') {
  return {
    instanceId, playerType, transport: 'controlled', transportLabel: 'Controlled',
    fieldLabel: playerType === 'terminal' ? 'Terminal' : 'Codex', state,
    executionType: playerType === 'terminal' ? 'direct-shell' : 'reasoning',
    capability: { provider: playerType, authenticated: true, observedAt: Date.now(), freshness: 'live', models: [] }
  };
}

async function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40100 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
  await daemon.start();
  let dispatchResult = 'received';
  const register = (gameId, displayName, instances, capabilities) => {
    const socket = {
      readyState: 1,
      send(raw) {
        const frame = JSON.parse(String(raw));
        if (frame.method !== 'dispatch.request') return;
        setImmediate(() => {
          if (dispatchResult === 'received') daemon.routerInstance.handleDispatchAccepted({
            clientRef: frame.params.clientRef, turnRef: `turn-${frame.params.clientRef}`, acceptedAt: Date.now()
          });
          else daemon.routerInstance.handleDispatchRejected({
            clientRef: frame.params.clientRef, error: { code: 'TEST_REJECTED', message: 'Rejected for test.' }
          });
        });
      },
      close() {}
    };
    const roster = [{ id: `team-${gameId}`, name: 'Players', instances: instances.map(({ instanceId, playerType }) => ({
      instanceId, playerType, seat: 1, fieldLabel: playerType === 'terminal' ? 'Terminal' : 'Codex', onField: true, controlState: 'ready'
    })) }];
    daemon.registryInstance.registerSession({
      instanceId: `session-${gameId}`, stadiumId: `stadium-${gameId}`, name: displayName, platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName, fingerprintSource: 'test', repoUri: `https://example.test/${gameId}.git` },
      rootFsPath: `C:\\Games\\${displayName}`, roster, capabilities, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
    });
    daemon.registryInstance.updateRoster(`session-${gameId}`, roster);
    daemon.registryInstance.updateCapabilities(`session-${gameId}`, capabilities);
  };
  register(GAME_A, 'Routine Game A', [{ instanceId: CODEX, playerType: 'codex' }, { instanceId: TERMINAL, playerType: 'terminal' }], [capability(CODEX), capability(TERMINAL, 'terminal')]);
  register(GAME_B, 'Routine Game B', [{ instanceId: 'codex-routine-b', playerType: 'codex' }], [capability('codex-routine-b')]);
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return { status: response.status, body: await response.json() };
  };
  return { dir, daemon, api, setDispatchResult: (value) => { dispatchResult = value; } };
}

const createBody = (overrides = {}) => ({
  gameId: GAME_A, name: 'Architecture Refresh', template: 'canonical-refresh', enabled: true,
  cadence: { kind: 'plays', every: 2 }, targets: { strategyBoard: true, players: false },
  sources: [{ path: 'Project SOP/NORTH-STAR.md', kind: 'file' }], includeLocalRoot: true, ...overrides
});

test('Coach Routines B1: status exposes default-off preference and only the selected Game projection', async () => {
  const h = await harness();
  try {
    const status = (await h.api('/api/status')).body;
    assert.equal(status.preferences.devMode, false);
    assert.equal(status.routines.gameId, GAME_A);
    assert.equal(status.routines.devMode, false);
    assert.equal(status.routines.handoff, undefined);
    h.daemon.routineEngineInstance.create(GAME_B, createBody({ gameId: GAME_B, name: 'Hidden Game B' }));
    const selected = (await h.api('/api/status')).body;
    assert.equal(selected.routines.gameId, GAME_A);
    assert.equal(selected.routines.routines.some((routine) => routine.name === 'Hidden Game B'), false);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B2: first Dev Mode transition creates the amended default once and missing files stay truthful', async () => {
  const h = await harness();
  try {
    const enabled = await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.preferences.devMode, true);
    assert.equal(enabled.body.routines.routines.length, 1);
    assert.equal(enabled.body.routines.routines[0].name, 'Canonical Refresh');
    assert.equal(enabled.body.routines.routines[0].needs, 'sources');
    assert.equal(enabled.body.routines.handoff, undefined);
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: false }) });
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).routines.length, 1);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B3: deleting the default persists human intent across Dev Mode toggles', async () => {
  const h = await harness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    const id = h.daemon.routineEngineInstance.forGame(GAME_A).routines[0].id;
    assert.equal((await h.api(`/api/routines/${id}`, { method: 'DELETE', body: JSON.stringify({ gameId: GAME_A }) })).status, 200);
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: false }) });
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).routines.length, 0);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B4: CRUD, manual Due and status projection use one exact-Game API path', async () => {
  const h = await harness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    const created = await h.api('/api/routines', { method: 'POST', body: JSON.stringify(createBody()) });
    assert.equal(created.status, 201);
    const id = created.body.routine.id;
    h.daemon.routineEngineInstance.recordSourceCheck(GAME_A, Date.now(), [{ path: 'Project SOP/NORTH-STAR.md', state: 'file' }]);
    const patched = await h.api(`/api/routines/${id}`, { method: 'PATCH', body: JSON.stringify({ gameId: GAME_A, cadence: { kind: 'plays', every: 1 }, name: 'Updated Refresh' }) });
    assert.equal(patched.body.routine.name, 'Updated Refresh');
    assert.deepEqual(patched.body.routine.cadence, { kind: 'plays', every: 1 });
    const due = await h.api(`/api/routines/${id}/due`, { method: 'POST', body: JSON.stringify({ gameId: GAME_A }) });
    assert.equal(due.body.projection.routines.find((routine) => routine.id === id).due, true);
    const listed = await h.api(`/api/routines?gameId=${GAME_A}`);
    assert.equal(listed.body.definitions.some((routine) => routine.id === id), true);
    assert.equal((await h.api(`/api/routines?gameId=${GAME_B}`)).body.definitions.some((routine) => routine.id === id), false);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B5: delivery is explicit, idempotent, stale-safe and wrong-Game closed', async () => {
  const h = await harness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    const created = await h.api('/api/routines', { method: 'POST', body: JSON.stringify(createBody()) });
    const id = created.body.routine.id;
    h.daemon.routineEngineInstance.recordSourceCheck(GAME_A, Date.now(), [{ path: 'Project SOP/NORTH-STAR.md', state: 'file' }]);
    const due = await h.api(`/api/routines/${id}/due`, { method: 'POST', body: JSON.stringify({ gameId: GAME_A }) });
    const cycle = due.body.projection.routines.find((routine) => routine.id === id).cycle;
    const request = { gameId: GAME_A, via: 'copy-report', reportPath: 'REPORTS/Codex/Proof.md', deliveries: [{ routineId: id, cycle }] };
    const wrong = await h.api('/api/routines/delivered', { method: 'POST', body: JSON.stringify({ ...request, gameId: GAME_B }) });
    assert.equal(wrong.status, 404);
    const stale = await h.api('/api/routines/delivered', { method: 'POST', body: JSON.stringify({ ...request, deliveries: [{ routineId: id, cycle: 'stale' }] }) });
    assert.equal(stale.status, 409);
    assert.equal(h.daemon.routineEngineInstance.project(GAME_A, true).routines.find((routine) => routine.id === id).due, true);
    const first = await h.api('/api/routines/delivered', { method: 'POST', body: JSON.stringify(request) });
    assert.equal(first.body.delivered, true);
    const second = await h.api('/api/routines/delivered', { method: 'POST', body: JSON.stringify(request) });
    assert.equal(second.status, 200);
    assert.equal(second.body.alreadyDelivered, true);
    assert.equal(h.daemon.routineEngineInstance.project(GAME_A, true).routines.find((routine) => routine.id === id).due, false);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B6: real received/rejected/direct-shell verdicts count with exact target Game semantics', async () => {
  const h = await harness();
  try {
    const before = h.daemon.routineEngineInstance.forGame(GAME_A).playCount;
    const received = await h.daemon.routerInstance.dispatch({ prompt: 'Implement the change', gameId: GAME_A, routingMode: 'manual', playerInstanceId: CODEX });
    assert.equal(received.status, 'received');
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).playCount, before + 1);
    h.setDispatchResult('failed');
    const rejected = await h.daemon.routerInstance.dispatch({ prompt: 'Rejected Play', gameId: GAME_A, routingMode: 'manual', playerInstanceId: CODEX });
    assert.equal(rejected.status, 'failed');
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).playCount, before + 1);
    h.setDispatchResult('received');
    const shell = await h.daemon.routerInstance.dispatch({ prompt: 'echo harmless', gameId: GAME_A, routingMode: 'manual', playerInstanceId: TERMINAL });
    assert.equal(shell.status, 'received');
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).playCount, before + 1, 'direct-shell is excluded');
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_B).playCount, 0);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B7: production play-queued wiring counts once and release/retry cannot double count', async () => {
  const h = await harness();
  try {
    h.daemon.registryInstance.updateCapabilities('session-game_routine_wire_a', [capability(CODEX, 'codex', 'busy'), capability(TERMINAL, 'terminal')]);
    const queued = await h.daemon.routerInstance.dispatch({
      prompt: 'Queue this exact reasoning Play', gameId: GAME_A, routingMode: 'manual', playerInstanceId: CODEX, whenBusy: 'queue'
    });
    assert.equal(queued.status, 'queued');
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).playCount, 1);
    h.daemon.routerInstance.emit('play-queued', { gameId: GAME_A, playerInstanceId: CODEX, playerType: 'codex', queueItemId: queued.queueItemId });
    h.daemon.routineEngineInstance.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'release', queueRelease: true });
    assert.equal(h.daemon.routineEngineInstance.forGame(GAME_A).playCount, 1);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B8: API validation rejects wrong Games and unsafe values without fabricating state', async () => {
  const h = await harness();
  try {
    assert.equal((await h.api('/api/routines', { method: 'POST', body: JSON.stringify(createBody({ gameId: 'not-a-game' })) })).status, 404);
    assert.equal((await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true }) })).status, 400);
    assert.equal((await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: 'yes' }) })).status, 400);
    assert.equal((await h.api('/api/routines', { method: 'POST', body: JSON.stringify(createBody({ sources: [{ path: '../escape', kind: 'file' }] })) })).status, 400);
    assert.equal(h.daemon.routineEngineInstance.hasGame('not-a-game'), false);
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('Coach Routines B9: daemon replacement reloads counters, definitions and first-enable marker atomically', async () => {
  const h = await harness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ gameId: GAME_A, devMode: true }) });
    h.daemon.routineEngineInstance.observePlay({ gameId: GAME_A, kind: 'unknown', clientRef: 'survives' });
    await h.daemon.stop();
    const replacement = new ControlPlaneDaemon({ dir: h.dir, port: 40650 + Math.floor(Math.random() * 200), idleTimeoutMs: 60_000 });
    await replacement.start();
    try {
      const game = replacement.routineEngineInstance.forGame(GAME_A);
      assert.equal(game.playCount, 1);
      assert.equal(game.routines.length, 1);
      assert.equal(game.defaultsInitialized, true);
    } finally { await replacement.stop(); }
  } finally { await h.daemon.stop(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});
