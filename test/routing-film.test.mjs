import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ROUTING_FILM_FILE,
  RoutingFilmRecorder,
  RoutingFilmStore,
  deriveRoutingFilmBurn,
  projectRoutingFilmConcurrency,
  projectRoutingFilmReceipt,
  summarizeRoutingFilmIsolation
} from '../out/routing-intel/routing-film.js';
import { resourcePoolForSeat } from '../out/control-plane/routing-economics.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-routing-film-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let sequence = 0;
const dir = (name) => path.join(scratch, `${++sequence}-${name}`);
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.parse('2026-09-26T15:00:00.000Z');

const receipt = ({
  pool = 'codex', at = T0, observedAt = T0, remaining = 80,
  resetsAt = Math.floor((T0 + 4 * 60 * 60_000) / 1000), stale = false
} = {}) => ({
  pool,
  evidence: stale ? 'unknown' : 'known',
  capturedAt: iso(at),
  windows: [{
    pool, window: 'five_hour', windowLengthMin: 300, remainingPercent: remaining,
    resetsAt, observedAt: iso(observedAt), stale
  }]
});

const target = (overrides = {}) => ({
  playerInstanceId: 'codex-seat-1', playerType: 'codex', transport: 'controlled',
  model: 'gpt-5.6-sol', effort: 'high', resourcePool: 'codex', ...overrides
});

const decision = (clientRef, overrides = {}) => ({
  schemaVersion: 1,
  kind: 'decision',
  at: T0,
  clientRef,
  gameId: 'game-1',
  baseline: target(),
  chosen: target(),
  decidedBy: 'auto-baseline',
  routeAction: 'dispatch',
  receiptBefore: receipt(),
  ...overrides
});

const outcome = (clientRef, overrides = {}) => ({
  schemaVersion: 1,
  kind: 'outcome',
  at: T0 + 60_000,
  clientRef,
  gameId: 'game-1',
  ledgerOutcome: 'completed',
  startedAt: T0,
  executionStartedAt: T0,
  finishedAt: T0 + 60_000,
  durationMs: 60_000,
  retries: 0,
  reportProduced: false,
  receiptAfter: receipt({ at: T0 + 60_000, observedAt: T0 + 60_000, remaining: 79 }),
  concurrency: { samePool: [], otherPool: [], unknownPool: [] },
  isolation: 'high',
  isolationReason: 'fresh-isolated-bracket',
  burn: [],
  ...overrides
});

test('R2-1. append-only JSONL round-trips decision/outcome and survives recorder restart', () => {
  const root = dir('round-trip');
  const store = new RoutingFilmStore({ dir: root });
  const first = new RoutingFilmRecorder(store);
  assert.equal(first.recordDecision(decision('ref-a')), true);
  assert.equal(first.recordOutcome(outcome('ref-a')), true);

  const lines = fs.readFileSync(path.join(root, ROUTING_FILM_FILE), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => JSON.parse(line).kind), ['decision', 'outcome']);
  assert.ok(lines.every((line) => JSON.parse(line).schemaVersion === 1));

  const restarted = new RoutingFilmRecorder(new RoutingFilmStore({ dir: root }));
  assert.equal(restarted.decision('ref-a').chosen.resourcePool, 'codex');
  assert.equal(restarted.recordDecision(decision('ref-a')), false, 'one decision per clientRef survives restart');
  assert.equal(restarted.recordOutcome(outcome('ref-a')), false, 'one terminal outcome per clientRef survives restart');
  assert.equal(fs.readFileSync(path.join(root, ROUTING_FILM_FILE), 'utf8').trim().split('\n').length, 2);
});

test('R2-2. tolerant reader skips malformed, torn, unsupported, and future-kind lines without losing valid events', () => {
  const root = dir('tolerant');
  const store = new RoutingFilmStore({ dir: root });
  store.append(decision('ref-good'));
  fs.appendFileSync(path.join(root, ROUTING_FILM_FILE), [
    '{bad json',
    JSON.stringify({ schemaVersion: 99, kind: 'decision' }),
    JSON.stringify({ schemaVersion: 1, kind: 'future-kind', clientRef: 'x', gameId: 'g', at: T0 }),
    '{"schemaVersion":1'
  ].join('\n'));
  const result = store.read();
  assert.deepEqual(result.events.map((event) => event.clientRef), ['ref-good']);
  assert.deepEqual(result.diagnostics.map((item) => item.reason), [
    'malformed-json', 'unsupported-schema', 'unsupported-kind', 'malformed-json'
  ]);
});

test('R2-3. rotation preserves JSONL event order, keeps three rotated generations, and never loses the triggering event', () => {
  const root = dir('rotation');
  const probe = `${JSON.stringify(decision('ref-probe'))}\n`;
  const store = new RoutingFilmStore({ dir: root, maxBytes: Buffer.byteLength(probe) + 4, rotations: 3 });
  for (let i = 1; i <= 6; i += 1) store.append(decision(`ref-${i}`));
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith('routing-film')).sort(),
    ['routing-film.1.jsonl', 'routing-film.2.jsonl', 'routing-film.3.jsonl', 'routing-film.jsonl']
  );
  assert.deepEqual(store.read().events.map((event) => event.clientRef), ['ref-3', 'ref-4', 'ref-5', 'ref-6']);
});

test('R2-4. recorder swallows append and rotation failures so the primary Play can continue', () => {
  const warnings = [];
  const broken = new RoutingFilmRecorder({
    read: () => ({ events: [], diagnostics: [] }),
    append: () => { throw new Error('disk unavailable'); }
  }, { warn: (message) => warnings.push(message) });
  assert.doesNotThrow(() => assert.equal(broken.recordDecision(decision('ref-fail')), false));
  assert.doesNotThrow(() => assert.equal(broken.recordOutcome(outcome('ref-fail')), false));
  assert.match(warnings[0], /append failed/);

  const root = dir('rotation-failure');
  const store = new RoutingFilmStore({ dir: root, maxBytes: 1, rotations: 3 });
  const recorder = new RoutingFilmRecorder(store, { warn: (message) => warnings.push(message) });
  assert.equal(recorder.recordDecision(decision('ref-first')), true);
  store.rotateIfNeeded = () => { throw new Error('rotation unavailable'); };
  assert.doesNotThrow(() => assert.equal(recorder.recordDecision(decision('ref-rotation-fail')), false));
});

test('R2-5. receipt projection scopes to the chosen open pool/window identities and preserves UNKNOWN honestly', () => {
  const economics = {
    projectedAt: iso(T0),
    pools: {
      codex: { pool: 'codex', evidence: 'known', windows: [
        { id: 'five_hour', lengthMin: 300, remainingFraction: 0.88, resetsAt: 1234, price: 1, stale: false, policyLag: false }
      ] },
      claude: { pool: 'claude', evidence: 'known', windows: [
        { id: 'weekly', lengthMin: 10080, remainingFraction: 0.96, resetsAt: 5678, price: 1, stale: false, policyLag: false }
      ] }
    }
  };
  const codex = projectRoutingFilmReceipt(economics, 'codex', iso(T0 - 1000));
  assert.deepEqual(codex.windows.map((window) => [window.pool, window.window, window.windowLengthMin]), [['codex', 'five_hour', 300]]);
  assert.equal(codex.windows[0].remainingPercent, 88);
  assert.doesNotMatch(JSON.stringify(codex), /claude|weekly/);

  const claude = projectRoutingFilmReceipt(economics, 'claude', iso(T0 - 1000));
  assert.deepEqual(claude.windows.map((window) => [window.pool, window.window]), [['claude', 'weekly']]);
  assert.doesNotMatch(JSON.stringify(claude), /codex|five_hour/);

  const unknown = projectRoutingFilmReceipt(economics, 'antigravity');
  assert.deepEqual(unknown, { pool: 'antigravity', evidence: 'unknown', capturedAt: iso(T0), windows: [] });

  const root = dir('open-identity');
  const custom = decision('ref-custom', {
    baseline: target({ resourcePool: 'future-pool' }),
    chosen: target({ resourcePool: 'future-pool' }),
    receiptBefore: {
      pool: 'future-pool', evidence: 'known', capturedAt: iso(T0),
      windows: [{ pool: 'future-pool', window: 'rolling_90m', windowLengthMin: 90, remainingPercent: 50, stale: false }]
    }
  });
  const store = new RoutingFilmStore({ dir: root });
  store.append(custom);
  assert.equal(store.read().events[0].receiptBefore.windows[0].window, 'rolling_90m');
});

test('R2-6. resource identity comes from the seat/transport and model branding cannot redirect it', () => {
  const capability = (playerType, provider, transport = 'controlled') => ({ playerType, transport, capability: { provider } });
  assert.equal(resourcePoolForSeat(capability('claude', 'claude')), 'claude');
  assert.equal(resourcePoolForSeat(capability('codex', 'codex')), 'codex');
  const antigravity = { ...capability('antigravity', 'claude'), activeModel: 'claude-opus-4-1' };
  assert.equal(resourcePoolForSeat(antigravity), 'unknown');
});

test('R2-7. same-pool overlap is contamination; different and unknown pools are context only', () => {
  const targetInterval = { clientRef: 'target', playerInstanceId: 'c1', resourcePool: 'codex', startedAt: 1000, finishedAt: 5000 };
  const concurrency = projectRoutingFilmConcurrency(targetInterval, [
    targetInterval,
    { clientRef: 'same', playerInstanceId: 'c2', playerType: 'codex', resourcePool: 'codex', startedAt: 2000, finishedAt: 4000 },
    { clientRef: 'other', playerInstanceId: 'a1', playerType: 'claude', resourcePool: 'claude', startedAt: 2500, finishedAt: 4500 },
    { clientRef: 'mystery', playerInstanceId: 'ag1', playerType: 'antigravity', resourcePool: 'unknown', startedAt: 3000 }
  ]);
  assert.deepEqual(concurrency.samePool.map((item) => [item.clientRef, item.overlapMs]), [['same', 2000]]);
  assert.deepEqual(concurrency.otherPool.map((item) => item.clientRef), ['other']);
  assert.deepEqual(concurrency.unknownPool.map((item) => item.clientRef), ['mystery']);
  assert.doesNotMatch(JSON.stringify(concurrency), /prompt|reportBody|secret/i);
});

test('R2-8. burn observations classify HIGH/MEDIUM/LOW/NONE without assigning concurrent burn', () => {
  const finish = T0 + 10 * 60_000;
  const before = receipt({ at: T0, observedAt: T0, remaining: 80 });
  const afterHigh = receipt({ at: finish, observedAt: finish, remaining: 78 });
  const empty = { samePool: [], otherPool: [], unknownPool: [] };
  let [burn] = deriveRoutingFilmBurn(before, afterHigh, T0, finish, empty);
  assert.deepEqual({ isolation: burn.isolation, delta: burn.remainingPercentDelta }, { isolation: 'high', delta: 2 });

  const beforeMedium = receipt({ at: T0, observedAt: T0 - 20 * 60_000, remaining: 80 });
  const afterMedium = receipt({ at: finish, observedAt: finish + 20 * 60_000, remaining: 80 });
  [burn] = deriveRoutingFilmBurn(beforeMedium, afterMedium, T0, finish, empty);
  assert.equal(burn.isolation, 'medium');
  assert.equal(burn.censoredAtMostPercent, 1);

  [burn] = deriveRoutingFilmBurn(before, afterHigh, T0, finish, {
    samePool: [{ clientRef: 'same', playerInstanceId: 'c2', resourcePool: 'codex', startedAt: T0, overlapMs: 1000 }],
    otherPool: [], unknownPool: []
  });
  assert.equal(burn.isolation, 'low');
  assert.equal(burn.reason, 'same-pool-work-overlapped');

  [burn] = deriveRoutingFilmBurn(before, receipt({ at: finish, observedAt: finish, remaining: 81 }), T0, finish, empty);
  assert.deepEqual({ isolation: burn.isolation, reason: burn.reason }, { isolation: 'none', reason: 'negative-impossible-delta' });
  [burn] = deriveRoutingFilmBurn(before, receipt({ at: finish, observedAt: finish, remaining: 78, resetsAt: 9999 }), T0, finish, empty);
  assert.equal(burn.reason, 'reset-cycle-crossed');
  [burn] = deriveRoutingFilmBurn(before, receipt({ at: finish, observedAt: finish, stale: true }), T0, finish, empty);
  assert.equal(burn.reason, 'receipt-stale-or-unproven');
  assert.deepEqual(summarizeRoutingFilmIsolation([]), { isolation: 'none', reason: 'resource-evidence-unknown' });
  assert.deepEqual(summarizeRoutingFilmIsolation([burn]), { isolation: 'none', reason: 'one-or-more-windows-unusable' });
});

test('R2-9. daemon authoritative dispatch/completion seams write once; preview writes zero and no recommendation', () => {
  const root = dir('daemon');
  const events = [];
  const journal = { read: () => ({ events: [], diagnostics: [] }), append: (event) => events.push(event) };
  const daemon = new ControlPlaneDaemon({ dir: root, port: 0, idleTimeoutMs: 60_000, routingFilm: { journal } });
  const capability = {
    instanceId: 'codex-seat-1', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready',
    capability: { provider: 'codex', authenticated: true, models: [], observedAt: T0, freshness: 'live' }
  };
  daemon.registry.getCapabilitiesForGame = () => [capability];
  daemon.registry.getGames = () => [{ gameId: 'game-1' }];
  daemon.registry.getSession = () => ({ game: { gameId: 'game-1' } });

  const previewCount = events.length;
  daemon.routerInstance.computeRoute('game-1', 'Implement a bounded helper', [capability]);
  assert.equal(events.length, previewCount, 'route preview never writes Film');

  const record = {
    gameId: 'game-1', playerInstanceId: 'codex-seat-1', playerType: 'codex', clientRef: 'ref-daemon',
    model: 'gpt-5.6-sol', effort: 'high', transport: 'controlled', at: T0, routingMode: 'auto', routeAction: 'dispatch',
    promptSummary: 'must never enter Film'
  };
  daemon.routerInstance.emit('play-dispatched', record);
  daemon.routerInstance.emit('play-dispatched', record);
  assert.equal(events.filter((event) => event.kind === 'decision').length, 1);
  assert.equal(events[0].baseline.resourcePool, 'codex');
  assert.deepEqual(events[0].baseline, events[0].chosen, 'baseline is the actual existing route at R2');
  assert.equal(events[0].receiptBefore.pool, 'codex');
  assert.equal(Object.hasOwn(events[0], 'recommendation'), false);
  assert.doesNotMatch(JSON.stringify(events), /must never enter Film/);

  const socket = { send: () => undefined };
  daemon.handleWsNotification(socket, { method: 'turn.changed', params: {
    gameId: 'game-1', turn: { instanceId: 'codex-seat-1', state: 'started', turnRef: 'turn-daemon', at: T0 + 1 }
  } }, 'stadium-1');
  daemon.handleWsNotification(socket, { method: 'turn.changed', params: {
    gameId: 'game-1', turn: { instanceId: 'codex-seat-1', state: 'completed', turnRef: 'turn-daemon', at: T0 + 60_000, summary: 'done' }
  } }, 'stadium-1');
  daemon.handleWsNotification(socket, { method: 'turn.changed', params: {
    gameId: 'game-1', turn: { instanceId: 'codex-seat-1', state: 'completed', turnRef: 'turn-daemon', at: T0 + 60_000, summary: 'duplicate' }
  } }, 'stadium-1');
  const outcomes = events.filter((event) => event.kind === 'outcome');
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].clientRef, 'ref-daemon');
  assert.equal(outcomes[0].ledgerOutcome, 'completed');
  assert.equal(outcomes[0].retries, 0, 'existing dispatch has no same-clientRef resend path');
  assert.equal(outcomes[0].receiptAfter.pool, 'codex');
  assert.deepEqual(
    { isolation: outcomes[0].isolation, reason: outcomes[0].isolationReason },
    { isolation: 'none', reason: 'one-or-more-windows-unusable' }
  );
});

test('R2-10. daemon Film append failure does not block the dispatch ledger seam', () => {
  const daemon = new ControlPlaneDaemon({
    dir: dir('daemon-failure'), port: 0, idleTimeoutMs: 60_000,
    routingFilm: { journal: { read: () => ({ events: [], diagnostics: [] }), append: () => { throw new Error('camera down'); } } }
  });
  const record = {
    gameId: 'game-1', playerInstanceId: 'codex-seat-1', playerType: 'codex', clientRef: 'ref-survives',
    transport: 'controlled', at: T0, routingMode: 'manual', routeAction: 'dispatch'
  };
  assert.doesNotThrow(() => daemon.routerInstance.emit('play-dispatched', record));
  assert.equal(daemon.ledger.hasPendingDispatch('game-1', 'codex-seat-1'), true, 'camera failure did not stop primary dispatch accounting');
});
