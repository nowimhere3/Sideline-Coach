/** Q2.10F.2 Slice A — canonical, revisioned execution truth. */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { InstanceWorkLedger, REPORT_GRACE_MS } from '../out/control-plane/work-ledger.js';
import { projectExecution } from '../out/control-plane/execution-projection.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { PlayQueue } from '../out/control-plane/play-queue.js';

const GAME_A = 'game_execution_a';
const GAME_B = 'game_execution_b';
const CLAUDE = 'claude-11111111';
const CODEX = 'codex-22222222';
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const capability = (instanceId, overrides = {}) => ({
  instanceId,
  playerType: instanceId.startsWith('codex') ? 'codex' : 'claude',
  transport: 'controlled',
  transportLabel: 'Controlled',
  fieldLabel: instanceId.startsWith('codex') ? 'Codex' : 'Claude',
  state: 'ready',
  capability: {
    provider: instanceId.startsWith('codex') ? 'codex' : 'claude',
    authenticated: true,
    observedAt: Date.now(),
    freshness: 'live',
    models: [{ id: 'model-1', displayName: 'Model 1', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
  },
  ...overrides
});

const entry = (overrides = {}) => ({
  gameId: GAME_A,
  playerInstanceId: CLAUDE,
  playerType: 'claude',
  revision: 10,
  workState: 'idle',
  recentPlays: [],
  reports: [],
  updatedAt: 1,
  ...overrides
});

test('Q2.10F.2-A1. executionStartedAt is genuine first-start evidence; revisions advance only when canonical truth changes', () => {
  let now = 1_000;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.observeRoster(GAME_A, [capability(CLAUDE), capability(CODEX)]);
  const siblingBefore = ledger.get(GAME_A, CODEX);

  now = 1_100;
  ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, playerType: 'claude', clientRef: 'play-a', at: 900 });
  const dispatched = ledger.get(GAME_A, CLAUDE);
  assert.equal(dispatched.currentPlay, undefined, 'dispatch remains pending and does not fabricate active execution');

  now = 1_200;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'accepted', turnRef: 'turn-a', at: 50 });
  const accepted = ledger.get(GAME_A, CLAUDE);
  assert.equal(accepted.currentPlay.startedAt, 900, 'startedAt retains Coach dispatch/attribution meaning');
  assert.equal(accepted.currentPlay.executionStartedAt, undefined, 'accepted is Starting, not a clock origin');
  assert.ok(accepted.revision > dispatched.revision);

  now = 1_300;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'turn-a', at: 75 });
  const started = ledger.get(GAME_A, CLAUDE);
  assert.equal(started.currentPlay.executionStartedAt, 1_300, 'Control Plane now(), not Stadium turn.at, owns the clock origin');
  assert.ok(started.revision > accepted.revision);

  now = 9_999;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'turn-a', at: 8_888 });
  const repeated = ledger.get(GAME_A, CLAUDE);
  assert.equal(repeated.currentPlay.executionStartedAt, 1_300);
  assert.equal(repeated.revision, started.revision, 'repeated evidence does not pretend canonical truth mutated');
  assert.deepEqual(ledger.get(GAME_A, CODEX), siblingBefore, 'one exact instance never advances its sibling');
});

test('Q2.10F.2-A2. terminal turn identity is monotonic, including a terminal event that arrives before accepted', () => {
  let now = 10;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: 'fast-play', at: 5 });
  now = 20;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'completed', turnRef: 'fast-turn' });
  const completed = ledger.get(GAME_A, CLAUDE);
  assert.equal(completed.recentPlays[0].outcome, 'completed');
  assert.equal(completed.recentPlays[0].turnRef, 'fast-turn', 'terminal-first evidence retains the provider turn identity');

  now = 30;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'fast-turn' });
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'accepted', turnRef: 'fast-turn' });
  const afterStale = ledger.get(GAME_A, CLAUDE);
  assert.equal(afterStale.workState, 'completed');
  assert.equal(afterStale.currentPlay, undefined);
  assert.equal(afterStale.revision, completed.revision, 'stale active evidence cannot resurrect or revise a terminal Play');

  for (const outcome of ['failed', 'interrupted', 'unknown']) {
    const book = new InstanceWorkLedger(() => ++now);
    book.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: `play-${outcome}` });
    book.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: `turn-${outcome}` });
    book.recordTurn(GAME_A, { instanceId: CLAUDE, state: outcome, turnRef: `turn-${outcome}` });
    const terminal = book.get(GAME_A, CLAUDE);
    book.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: `turn-${outcome}` });
    assert.equal(book.get(GAME_A, CLAUDE).revision, terminal.revision, `${outcome} is final for its exact turn`);
    assert.equal(book.get(GAME_A, CLAUDE).recentPlays[0].outcome, outcome);
  }
});

test('Q2.10F.2-A3. pure projection obeys precedence and never fabricates a Working or queue clock', () => {
  const current = { clientRef: 'play', promptSummary: 'Do the work', activitySummary: '3 Scouts running', startedAt: 100, executionStartedAt: 200, turnRef: 'turn' };
  const completed = { clientRef: 'done', promptSummary: 'Finished work', outcome: 'completed', startedAt: 1, executionStartedAt: 2, finishedAt: 10 };
  const failed = { ...completed, clientRef: 'failed', outcome: 'failed', summary: 'Provider exited.' };
  const unknown = { ...completed, clientRef: 'unknown', outcome: 'unknown', summary: 'Telemetry was lost.' };
  const queue = [{ state: 'queued', reasonKind: 'own-current-play', waitingOnName: 'Claude' }];

  const needs = projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'working', currentPlay: current }), queued: [{ ...queue[0], state: 'needs-attention', attention: 'Choose what happens next.' }], now: 500 });
  assert.equal(needs.state, 'needs-you');
  const working = projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'working', currentPlay: current }), queued: queue, now: 500 });
  assert.equal(working.state, 'working');
  assert.equal(working.executionStartedAt, 200);
  assert.equal(working.activitySummary, '3 Scouts running');
  assert.equal(working.queue.count, 1, 'queued work rides alongside current execution');
  const recoveredWorking = projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'working' }), now: 500 });
  assert.equal(recoveredWorking.state, 'working');
  assert.equal(recoveredWorking.executionStartedAt, undefined, 'known activity without a recovered start gets no fake timer');
  const starting = projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'working', currentPlay: { ...current, executionStartedAt: undefined } }), queued: queue, now: 500 });
  assert.equal(starting.state, 'starting');
  assert.equal(starting.executionStartedAt, undefined);
  const capacity = projectExecution({ instanceId: CLAUDE, entry: entry(), waitingCapacity: true, queued: queue, now: 500 });
  assert.equal(capacity.state, 'waiting-capacity');
  const queuedView = projectExecution({ instanceId: CLAUDE, entry: entry({ recentPlays: [completed] }), queued: queue, now: 500 });
  assert.equal(queuedView.state, 'queued');
  assert.equal(queuedView.playRef, undefined, 'an undispatched queue item never borrows the previous Play identity');
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'unknown', recentPlays: [unknown] }), now: 500 }).state, 'unknown');
  const deliveryUnknown = projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'unknown', currentPlay: { ...current, executionStartedAt: undefined } }), now: 500 });
  assert.deepEqual({ state: deliveryUnknown.state, playRef: deliveryUnknown.playRef, summary: deliveryUnknown.summary }, { state: 'unknown', playRef: 'play', summary: 'Do the work' }, 'delivery uncertainty keeps exact Play identity without a timer');
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: entry({ recentPlays: [failed] }), now: 500 }).state, 'couldnt-finish');
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: entry({ workState: 'completed', recentPlays: [completed] }), now: 20 }).state, 'finished');
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: entry(), now: 500 }).state, 'idle');
});

test('Q2.10F.2-A4. completed → awaiting report → exact report → acknowledged is one durable Ledger lifecycle', () => {
  let now = 100;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.observeRoster(GAME_A, [capability(CLAUDE)]);
  ledger.recordReports(GAME_A, []);
  ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: 'report-play', at: 90 });
  ledger.recordDelivery('report-play', 'received', { turnRef: 'report-turn' });
  now = 110;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'report-turn' });
  now = 200;
  ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'completed', turnRef: 'report-turn' });
  let view = projectExecution({ instanceId: CLAUDE, entry: ledger.get(GAME_A, CLAUDE), now: 200 + REPORT_GRACE_MS - 1 });
  assert.equal(view.state, 'finished');
  assert.equal(view.awaitingReport, true);
  assert.equal(view.durationMs, 90);

  ledger.recordReports(GAME_A, [{
    path: 'REPORTS/Claude/result.md', filename: 'result.md', mtime: 210,
    provenance: { gameId: GAME_A, clientRef: 'report-play', playerInstanceId: CLAUDE, playerType: 'claude', executionProvider: 'Claude' }
  }]);
  view = projectExecution({ instanceId: CLAUDE, entry: ledger.get(GAME_A, CLAUDE), now: 220 });
  assert.equal(view.state, 'finished');
  assert.deepEqual(view.report, { path: 'REPORTS/Claude/result.md', filename: 'result.md', acknowledged: false });

  const revisionBeforeAck = ledger.get(GAME_A, CLAUDE).revision;
  assert.deepEqual(ledger.acknowledge({ gameId: GAME_A, instanceId: CLAUDE, playRef: 'report-play', reportPath: 'REPORTS/Claude/result.md' }), { found: true, changed: true, instanceId: CLAUDE });
  assert.ok(ledger.get(GAME_A, CLAUDE).revision > revisionBeforeAck);
  assert.deepEqual(ledger.acknowledge({ gameId: GAME_A, instanceId: CLAUDE, playRef: 'report-play', reportPath: 'REPORTS/Claude/result.md' }), { found: true, changed: false, instanceId: CLAUDE }, 'acknowledgement is idempotent');
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: ledger.get(GAME_A, CLAUDE), now: 220 }).state, 'idle');

  const serialized = ledger.serialize();
  const replacement = new InstanceWorkLedger(() => 300);
  replacement.restore(serialized);
  assert.notEqual(replacement.epoch, ledger.epoch);
  assert.ok(replacement.get(GAME_A, CLAUDE).reports[0].acknowledgedAt, 'existing persistence carries acknowledgement into the new epoch');
});

test('Q2.10F.2-A5. failure/Unknown acknowledgement is exact-instance and Game scoped', () => {
  let now = 1;
  const ledger = new InstanceWorkLedger(() => ++now);
  const finish = (gameId, instanceId, ref, state) => {
    ledger.recordDispatch({ gameId, playerInstanceId: instanceId, clientRef: ref });
    ledger.recordTurn(gameId, { instanceId, state: 'started', turnRef: `${ref}-turn` });
    ledger.recordTurn(gameId, { instanceId, state, turnRef: `${ref}-turn`, summary: state });
  };
  finish(GAME_A, CLAUDE, 'same-ref', 'failed');
  finish(GAME_A, CODEX, 'codex-ref', 'unknown');
  finish(GAME_B, CLAUDE, 'same-ref', 'failed');
  const gameBBefore = ledger.get(GAME_B, CLAUDE);

  assert.equal(ledger.acknowledge({ gameId: GAME_A, instanceId: CLAUDE, playRef: 'same-ref' }).changed, true);
  assert.equal(ledger.get(GAME_A, CLAUDE).recentPlays[0].acknowledgedAt > 0, true);
  assert.equal(ledger.get(GAME_A, CODEX).recentPlays[0].acknowledgedAt, undefined);
  assert.deepEqual(ledger.get(GAME_B, CLAUDE), gameBBefore, 'same ref in another Game is untouched');
  assert.equal(ledger.acknowledge({ gameId: GAME_A, instanceId: CODEX, playRef: 'codex-ref' }).changed, true, 'Unknown is dismissible without becoming failure');
  assert.equal(projectExecution({ instanceId: CODEX, entry: ledger.get(GAME_A, CODEX), now: 999 }).state, 'idle');

  const deliveryUnknown = 'claude-33333333';
  ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: deliveryUnknown, clientRef: 'delivery-unknown' });
  ledger.recordDelivery('delivery-unknown', 'unknown');
  assert.equal(projectExecution({ instanceId: deliveryUnknown, entry: ledger.get(GAME_A, deliveryUnknown), now: 999 }).state, 'unknown');
  assert.equal(ledger.acknowledge({ gameId: GAME_A, instanceId: deliveryUnknown, playRef: 'delivery-unknown' }).changed, true, 'a delivery-timeout Unknown can also be acknowledged exactly');
  assert.equal(ledger.get(GAME_A, deliveryUnknown).currentPlay, undefined);
  assert.equal(ledger.get(GAME_A, deliveryUnknown).recentPlays[0].acknowledgedAt > 0, true);
});

test('Q2.10F.2-A6. daemon status and coalesced execution publication project every exact roster instance', async () => {
  const dir = tmp('sideline-q210f2-daemon-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39480, idleTimeoutMs: 60_000 });
  await daemon.start();
  const roster = [{ id: 'team', name: 'Claude', instances: [
    { instanceId: CLAUDE, playerType: 'claude', seat: 1, fieldLabel: 'Claude', onField: true, controlState: 'ready' },
    { instanceId: CODEX, playerType: 'codex', seat: 1, fieldLabel: 'Codex', onField: false, controlState: 'ready' }
  ] },
  // S31 Slice 5: Scout is a roster-native Virtual Player, so a MEMBER arrives as an ordinary roster instance.
  { id: 'scout', name: 'Scout', virtual: true, instances: [
    { instanceId: 'scout', playerType: 'scout', seat: 1, fieldLabel: 'Scout', onField: true, virtual: true, singleton: true, readinessState: 'ready', readinessLabel: 'Ready' }
  ] }];
  const socket = { readyState: 1, send() {}, close() {} };
  daemon.registryInstance.registerSession({
    instanceId: 'stadium-session', stadiumId: 'stadium-a', name: 'Windows', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: GAME_A, displayName: 'Execution A', fingerprintSource: 'test' },
    rootFsPath: 'C:\\Games\\ExecutionA', roster, capabilities: [capability(CLAUDE), capability('scout', { playerType: 'scout', executionType: 'scout-formation' })], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  daemon.registryInstance.updateRoster('stadium-session', roster);
  daemon.registryInstance.updateCapabilities('stadium-session', [capability(CLAUDE), capability('scout', { playerType: 'scout', executionType: 'scout-formation' })]);
  await tick();

  try {
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const status = await (await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(status.execution.gameId, GAME_A);
    assert.equal(status.execution.epoch, daemon.ledgerInstance.epoch);
    assert.equal(typeof status.execution.serverNow, 'number');
    assert.deepEqual(Object.keys(status.execution.byInstance).sort(), [CLAUDE, CODEX, 'scout'].sort(), 'every roster instance, including the Scout member, has a view');
    assert.equal(status.execution.byInstance.scout.executionType, 'scout-formation', 'the roster instance is classified as a Scout Formation, not a reasoning Player');

    const initialSse = await new Promise((resolve, reject) => {
      let settled = false;
      const request = http.get(`http://127.0.0.1:${daemon.port}/api/events?token=${encodeURIComponent(token)}`, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += String(chunk);
          if (!settled && body.includes('event: execution')) {
            settled = true;
            response.destroy();
            resolve(body);
          }
        });
      });
      request.on('error', (error) => { if (!settled) reject(error); });
      setTimeout(() => { if (!settled) { settled = true; request.destroy(); reject(new Error('execution SSE not received')); } }, 1_000).unref();
    });
    assert.match(initialSse, /event: execution\r?\ndata: \{"gameId":"game_execution_a","epoch":"execution_/);

    const executionEvents = [];
    daemon.broadcast = (event, data) => { if (event === 'execution') executionEvents.push(data); };
    daemon.ledgerInstance.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: 'sse-play' });
    daemon.ledgerInstance.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'accepted', turnRef: 'sse-turn' });
    daemon.ledgerInstance.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'sse-turn' });
    await tick();
    assert.equal(executionEvents.length, 1, 'same-tick mutations coalesce into one execution event');
    assert.equal(executionEvents[0].gameId, GAME_A);
    assert.equal(executionEvents[0].epoch, daemon.ledgerInstance.epoch);
    assert.equal(executionEvents[0].views.find((view) => view.instanceId === CLAUDE).state, 'working');
    const eventCount = executionEvents.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(executionEvents.length, eventCount, 'elapsed display never creates per-second server events');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Q2.10F.2-A7. acknowledgement endpoint is Game-scoped, idempotent, and persists through the Ledger store', async () => {
  const dir = tmp('sideline-q210f2-ack-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39481, idleTimeoutMs: 60_000 });
  await daemon.start();
  try {
    const ledger = daemon.ledgerInstance;
    ledger.observeRoster(GAME_A, [capability(CLAUDE)]);
    ledger.recordReports(GAME_A, []);
    ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: 'api-play' });
    ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'api-turn' });
    ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'completed', turnRef: 'api-turn' });
    ledger.recordReports(GAME_A, [{ path: 'REPORTS/Codex/api.md', filename: 'api.md', mtime: Date.now(), provenance: { gameId: GAME_A, clientRef: 'api-play', playerInstanceId: CLAUDE } }]);
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const post = async (body) => {
      const response = await fetch(`http://127.0.0.1:${daemon.port}/api/work/acknowledge`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await post({ gameId: GAME_B, instanceId: CLAUDE, playRef: 'api-play', reportPath: 'REPORTS/Codex/api.md' })).status, 404);
    const first = await post({ gameId: GAME_A, instanceId: CLAUDE, playRef: 'api-play', reportPath: 'REPORTS/Codex/api.md' });
    assert.deepEqual({ status: first.status, changed: first.body.changed }, { status: 200, changed: true });
    const repeated = await post({ gameId: GAME_A, instanceId: CLAUDE, playRef: 'api-play', reportPath: 'REPORTS/Codex/api.md' });
    assert.deepEqual({ status: repeated.status, changed: repeated.body.changed }, { status: 200, changed: false });
    await new Promise((resolve) => setTimeout(resolve, 320));
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'work-ledger.json'), 'utf8'));
    const restored = new InstanceWorkLedger();
    restored.restore(persisted);
    assert.ok(restored.get(GAME_A, CLAUDE).reports[0].acknowledgedAt);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Q2.10F.2-A8. AUTO and MANUAL dispatch results name the exact target; queued MANUAL does too', async () => {
  const frames = [];
  const registry = new EventEmitter();
  const player = capability(CODEX);
  const session = { instanceId: 'session', stadiumId: 'stadium', rosterSynchronized: true, capabilities: [player], socket: { send: (raw) => frames.push(JSON.parse(raw)) } };
  registry.getSelectedGameId = () => GAME_A;
  registry.getAuthoritativeSessionForGame = () => ({ status: 'connected', session });
  const router = new ControlPlaneRouter(registry);

  const manualPromise = router.dispatch({ gameId: GAME_A, routingMode: 'manual', playerInstanceId: CODEX, prompt: 'Implement the change' });
  router.handleDispatchAccepted({ clientRef: frames.at(-1).params.clientRef, turnRef: 'manual-turn', acceptedAt: Date.now() });
  const manual = await manualPromise;
  assert.deepEqual({ instance: manual.playerInstanceId, name: manual.playerName }, { instance: CODEX, name: 'Codex' });

  const autoPromise = router.dispatch({ gameId: GAME_A, routingMode: 'auto', prompt: 'Implement the change' });
  router.handleDispatchAccepted({ clientRef: frames.at(-1).params.clientRef, turnRef: 'auto-turn', acceptedAt: Date.now() });
  const auto = await autoPromise;
  assert.deepEqual({ instance: auto.playerInstanceId, name: auto.playerName }, { instance: CODEX, name: 'Codex' });

  player.state = 'busy';
  router.setPlayQueue(new PlayQueue());
  const queued = await router.dispatch({ gameId: GAME_A, routingMode: 'manual', playerInstanceId: CODEX, prompt: 'Wait for this Player', whenBusy: 'queue' });
  assert.deepEqual({ status: queued.status, instance: queued.playerInstanceId, name: queued.playerName }, { status: 'queued', instance: CODEX, name: 'Codex' });
});
