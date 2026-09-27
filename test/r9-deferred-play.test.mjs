// R9 Part 2 — DeferredPlay: continue the SAME interrupted task on the SAME Player and conversation (S57.24).
//
//   arm        only a Player whose latest Play carries a structured provider-limit blocker (S57.23),
//              in the conversation it still holds, with a known reset horizon
//   persist    ~/.sideline/deferred-plays.json, atomic, corrupt → quarantined, never fires from bad data
//   wake       reset event · recovery event · fallback timer · startup · Player-free · Game/roster change
//   revalidate fresh truth every time; UNKNOWN is never success
//   send       one fixed "continue" instruction, MANUAL to the exact instance with expectedSessionKey,
//              write-ahead correlation; exactly once or needs-attention; never the PlayQueue
//   handoff    "Use another Player" is an explicit human choice through the existing router + handoff preamble
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTINUE_TASK_PROMPT,
  DEFERRED_PLAY_CONSTANTS,
  DeferredPlayBook,
  HANDOFF_AFTER_LIMIT_INSTRUCTION,
  continuationEligibility,
  fileDeferredPlayStore,
  revalidateContinuation
} from '../out/control-plane/deferred-play.js';
import { DeferredPlayScheduler } from '../out/control-plane/deferred-play-scheduler.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { classifyDaemonRoute } from '../out/control-plane/remote-routes.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r9-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const MIN = 60_000;
const NOW = Date.parse('2026-09-27T09:00:00Z');
const S = (ms) => Math.floor(ms / 1000);
const GAME = 'game-r9';
const CLAUDE = 'claude-a1b2c3d4';
const CODEX = 'codex-e5f6a7b8';
const KEY = 'abcdef01';
const CLAUDE_BLOCKER = { kind: 'provider-limit', pool: 'claude', window: 'five_hour', resetsAt: S(NOW + 30 * MIN), evidence: 'claude-rate-limit-event', providerCode: 'rejected' };
const CODEX_BLOCKER = { kind: 'provider-limit', pool: 'codex', evidence: 'codex-turn-error', providerCode: 'usageLimitExceeded' };

const win = (id, lengthMin, { R, resetsAt, stale = false, floor } = {}) => stale || R === undefined || resetsAt === undefined
  ? { id, lengthMin, price: 'unknown', stale: true, policyLag: false }
  : { id, lengthMin, remainingFraction: R, resetsAt, timeToResetMin: 60, pacePressure: 1, price: 1, ...(floor ? { floor } : {}), stale: false, policyLag: false };
const economics = (pools) => ({ projectedAt: new Date(NOW).toISOString(), pools });
const pool = (name, windows) => ({ pool: name, evidence: 'known', windows });
/** Before the reset: Claude 5H exhausted until the refusal's horizon. */
const BLOCKED = economics({
  claude: pool('claude', [win('five_hour', 300, { R: 0, resetsAt: CLAUDE_BLOCKER.resetsAt, floor: 4 }), win('weekly', 10_080, { R: 0.6, resetsAt: S(NOW + 3 * 24 * 60 * MIN) })]),
  codex: pool('codex', [win('five_hour', 300, { R: 0.01, resetsAt: S(NOW + 90 * MIN), floor: 4 }), win('weekly', 10_080, { R: 0.5, resetsAt: S(NOW + 5 * 24 * 60 * MIN) })])
});
/** After the reset: a NEW 5H cycle (horizon advanced by ~5 h) with plenty remaining. */
const RECOVERED = economics({
  claude: pool('claude', [win('five_hour', 300, { R: 0.98, resetsAt: CLAUDE_BLOCKER.resetsAt + 5 * 3600 }), win('weekly', 10_080, { R: 0.6, resetsAt: S(NOW + 3 * 24 * 60 * MIN) })]),
  codex: pool('codex', [win('five_hour', 300, { R: 0.97, resetsAt: S(NOW + 90 * MIN) + 5 * 3600 }), win('weekly', 10_080, { R: 0.5, resetsAt: S(NOW + 5 * 24 * 60 * MIN) })])
});

const capability = (instanceId, extra = {}) => ({
  instanceId, playerType: instanceId.split('-')[0], transport: 'controlled', fieldLabel: instanceId, state: 'ready', sessionKey: KEY,
  capability: { provider: instanceId.split('-')[0], authenticated: true, observedAt: 1, freshness: 'live', models: [{ id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] },
  ...extra
});

/** A Ledger whose Player's latest Play ended the given way (the real recordTurn path). */
function ledgerWith(instanceId, { blocker, sessionKey = KEY, state = 'failed', ref = 'ref_interrupted_1', model = 'opus', effort = 'high' } = {}) {
  const ledger = new InstanceWorkLedger(() => NOW - 10 * MIN);
  ledger.recordDispatch({ gameId: GAME, playerInstanceId: instanceId, playerType: instanceId.split('-')[0], clientRef: ref, model, effort, promptSummary: 'Build the parser', transport: 'controlled', at: NOW - 20 * MIN });
  ledger.recordDelivery(ref, 'received', { turnRef: `turn-${ref}` });
  ledger.recordTurn(GAME, { instanceId, state: 'started', turnRef: `turn-${ref}`, at: NOW - 20 * MIN });
  ledger.recordTurn(GAME, { instanceId, state, turnRef: `turn-${ref}`, summary: 'Failed', ...(blocker ? { blocker } : {}), ...(sessionKey ? { sessionKey } : {}) });
  return ledger;
}

// ═════════════════════════════════════ ARM ═════════════════════════════════════

test('R9-1 only a structured provider-limit interruption in the same conversation, with a known reset, is schedulable', () => {
  const eligible = continuationEligibility({ capability: capability(CLAUDE), entry: ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER }).get(GAME, CLAUDE), economics: BLOCKED });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.interrupted.clientRef, 'ref_interrupted_1');
  assert.equal(eligible.expectedSessionKey, KEY, 'the interrupted Play\'s own conversation');
  assert.deepEqual(eligible.condition, { pool: 'claude', windows: [{ id: 'five_hour', resetsAt: CLAUDE_BLOCKER.resetsAt }], cycleResetsAt: CLAUDE_BLOCKER.resetsAt, horizonSource: 'provider-refusal' });
  assert.deepEqual([eligible.interrupted.model, eligible.interrupted.effort], ['opus', 'high']);

  const codex = continuationEligibility({ capability: capability(CODEX), entry: ledgerWith(CODEX, { blocker: CODEX_BLOCKER }).get(GAME, CODEX), economics: BLOCKED });
  assert.equal(codex.eligible, true);
  assert.equal(codex.condition.horizonSource, 'resource-truth', 'Codex names no reset on the turn: the horizon comes from R1 for the refused pool');
  assert.deepEqual(codex.condition.windows.map((w) => w.id), ['five_hour']);

  const no = (label, input, reason) => {
    const result = continuationEligibility(input);
    assert.deepEqual([result.eligible, result.reason], [false, reason], label);
  };
  no('unrelated failure', { capability: capability(CLAUDE), entry: ledgerWith(CLAUDE).get(GAME, CLAUDE), economics: BLOCKED }, 'no-interruption');
  no('failure text alone never becomes a blocker', { capability: capability(CLAUDE), entry: ledgerWith(CLAUDE, { blocker: { ...CLAUDE_BLOCKER, evidence: 'failure-text' } }).get(GAME, CLAUDE), economics: BLOCKED }, 'no-interruption');
  no('general scarcity (exhausted R1 windows) without a blocker', { capability: capability(CODEX), entry: ledgerWith(CODEX).get(GAME, CODEX), economics: BLOCKED }, 'no-interruption');
  no('completed Play', { capability: capability(CLAUDE), entry: ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER, state: 'completed' }).get(GAME, CLAUDE), economics: BLOCKED }, 'no-interruption');
  no('no sessionKey', { capability: capability(CLAUDE), entry: ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER, sessionKey: null }).get(GAME, CLAUDE), economics: BLOCKED }, 'no-session');
  no('conversation already changed', { capability: capability(CLAUDE, { sessionKey: '99999999' }), entry: ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER }).get(GAME, CLAUDE), economics: BLOCKED }, 'session-changed');
  no('legacy terminal Player', { capability: capability(CLAUDE, { transport: 'legacy' }), entry: ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER }).get(GAME, CLAUDE), economics: BLOCKED }, 'not-controlled');
  no('reset unknown', { capability: capability(CODEX), entry: ledgerWith(CODEX, { blocker: CODEX_BLOCKER }).get(GAME, CODEX), economics: RECOVERED }, 'reset-unknown');
});

// ═════════════════════════════════════ PERSISTENCE ═════════════════════════════════════

const armInput = (overrides = {}) => ({
  gameId: GAME, playerInstanceId: CLAUDE, playerType: 'claude',
  interrupted: { clientRef: 'ref_interrupted_1', turnRef: 'turn-ref_interrupted_1', finishedAt: NOW - 10 * MIN, model: 'opus', effort: 'high', blocker: CLAUDE_BLOCKER },
  expectedSessionKey: KEY,
  condition: { pool: 'claude', windows: [{ id: 'five_hour', resetsAt: CLAUDE_BLOCKER.resetsAt }], cycleResetsAt: CLAUDE_BLOCKER.resetsAt, horizonSource: 'provider-refusal' },
  ...overrides
});

test('R9-2 durable, atomic, idempotent; corrupt state is quarantined and never fires; cancellation survives restart', () => {
  const dir = fs.mkdtempSync(path.join(scratch, 'store-'));
  const file = path.join(dir, 'deferred-plays.json');
  let clock = NOW;
  const book = new DeferredPlayBook(fileDeferredPlayStore(file), () => clock);
  const first = book.arm(armInput());
  const second = book.arm(armInput());
  assert.equal(first.created, true);
  assert.deepEqual([second.created, second.record.id], [false, first.record.id], 'double Schedule / browser retry → one intent');
  assert.deepEqual(fs.readdirSync(dir), ['deferred-plays.json'], 'atomic write leaves no temp files');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(stored.version, 1);
  assert.doesNotMatch(JSON.stringify(stored), /Build the parser/, 'no prompt or transcript is stored');

  const restarted = new DeferredPlayBook(fileDeferredPlayStore(file), () => clock);
  assert.equal(restarted.get(first.record.id)?.state, 'waiting', 'armed intent survives restart');
  clock += 1000;
  assert.ok(restarted.cancel(first.record.id, GAME));
  assert.equal(new DeferredPlayBook(fileDeferredPlayStore(file)).get(first.record.id).state, 'cancelled', 'cancellation persists');
  assert.equal(restarted.arm(armInput()).created, true, 'after cancel, a new Schedule is a new intent');

  const corruptFile = path.join(dir, 'corrupt.json');
  fs.writeFileSync(corruptFile, '{ not json');
  const warnings = [];
  const corrupt = new DeferredPlayBook(fileDeferredPlayStore(corruptFile, (m) => warnings.push(m)));
  assert.deepEqual(corrupt.all(), []);
  assert.equal(fs.existsSync(corruptFile), false);
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith('corrupt.json.') && name.endsWith('.corrupt.bak')), 'kept for inspection');
  assert.match(warnings[0], /nothing from it will fire/);

  const mixed = path.join(dir, 'mixed.json');
  const good = JSON.parse(fs.readFileSync(file, 'utf8')).records[0];
  fs.writeFileSync(mixed, JSON.stringify({ version: 1, records: [good, { ...good, id: 'dp_bad', expectedSessionKey: 'NOT-A-KEY' }, { ...good, id: 'dp_firing', state: 'firing' }] }));
  assert.deepEqual(new DeferredPlayBook(fileDeferredPlayStore(mixed)).all().map((r) => r.id), [good.id], 'invalid records (and firing without write-ahead) are dropped');
});

// ═════════════════════════════════════ REVALIDATION ═════════════════════════════════════

function verdict({ record = new DeferredPlayBook(undefined, () => NOW).arm(armInput()).record, now = NOW + 40 * MIN, econ = RECOVERED, game = { connected: true, rosterSynchronized: true }, cap = capability(CLAUDE), entry = ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER }).get(GAME, CLAUDE), roster = new Set([CLAUDE]) } = {}) {
  return revalidateContinuation({ record, now, economics: econ, game, rosterInstanceIds: roster, capability: cap, entry, playerName: 'Claude 1' });
}

test('R9-3 fresh truth every time; UNKNOWN, stale, wrong cycle and not-recovered never pass', () => {
  assert.deepEqual(verdict(), { kind: 'ready' }, 'fresh recovered quota passes');
  assert.deepEqual(verdict({ now: NOW + 10 * MIN }), { kind: 'wait', waitingFor: 'reset' }, 'before the horizon nothing fires');
  const grace = CLAUDE_BLOCKER.resetsAt * 1000 + DEFERRED_PLAY_CONSTANTS.recoveryGraceMs;
  const stale = economics({ claude: pool('claude', [win('five_hour', 300, { stale: true })]) });
  assert.deepEqual(verdict({ econ: stale }), { kind: 'wait', waitingFor: 'recovery' }, 'stale truth right after the reset: keep waiting for fresh proof');
  assert.equal(verdict({ econ: stale, now: grace + 1 }).kind, 'attention', 'still stale after the grace → Dad decides');
  assert.equal(verdict({ econ: economics({}), now: grace + 1 }).kind, 'attention', 'UNKNOWN pool never passes');
  assert.equal(verdict({ econ: BLOCKED, now: grace + 1 }).kind, 'attention', 'same reset cycle (horizon did not advance) is not a reset');
  assert.match(verdict({ econ: BLOCKED, now: grace + 1 }).message, /reset couldn't be confirmed/);
  const low = economics({ claude: pool('claude', [win('five_hour', 300, { R: 0.01, resetsAt: CLAUDE_BLOCKER.resetsAt + 5 * 3600 })]) });
  assert.equal(verdict({ econ: low, now: grace + 1 }).kind, 'attention', 'recovered too little');
  assert.deepEqual(verdict({ game: { connected: false, rosterSynchronized: false } }), { kind: 'wait', waitingFor: 'game' });
  assert.match(verdict({ cap: capability(CLAUDE, { sessionKey: '99999999' }) }).message, /no longer in the conversation/, 'session changed fails');
  assert.deepEqual(verdict({ cap: capability(CLAUDE, { state: 'busy' }) }), { kind: 'wait', waitingFor: 'player' }, 'busy → R9 keeps ownership');
  assert.equal(verdict({ cap: null }).kind, 'attention', 'benched');
  assert.equal(verdict({ roster: new Set() }).kind, 'attention', 'no longer on the Team');
  assert.equal(verdict({ cap: capability(CLAUDE, { state: 'unavailable' }) }).kind, 'attention');
  const moved = ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER });
  moved.recordDispatch({ gameId: GAME, playerInstanceId: CLAUDE, clientRef: 'ref_other', at: NOW });
  moved.recordDelivery('ref_other', 'received', { turnRef: 'turn-other' });
  moved.recordTurn(GAME, { instanceId: CLAUDE, state: 'started', turnRef: 'turn-other' });
  moved.recordTurn(GAME, { instanceId: CLAUDE, state: 'completed', turnRef: 'turn-other', summary: 'done' });
  assert.match(verdict({ entry: moved.get(GAME, CLAUDE) }).message, /worked on something else/, 'the Player moved on: never inject a continuation');
});

// ═════════════════════════════════════ SCHEDULER ═════════════════════════════════════

function harness({ econ = RECOVERED, cap = capability(CLAUDE), ledger = ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER }), now = NOW + 40 * MIN, dispatchImpl, book } = {}) {
  const state = { econ, cap, now, dispatched: [], timers: [], changes: 0 };
  state.book = book ?? new DeferredPlayBook(undefined, () => state.now);
  state.ledger = ledger;
  state.scheduler = new DeferredPlayScheduler({
    book: state.book,
    now: () => state.now,
    economics: () => state.econ,
    game: () => ({ connected: true, rosterSynchronized: true, capabilities: state.cap ? [state.cap] : [], rosterInstanceIds: new Set([CLAUDE]), names: new Map([[CLAUDE, 'Claude 1']]) }),
    ledger: (gameId, id) => state.ledger.get(gameId, id),
    dispatch: async (options) => {
      state.dispatched.push({ options, stateAtSend: state.book.get(state.book.active().find((r) => r.attempt?.clientRef === options.clientRef)?.id)?.state, attempt: state.book.active().find((r) => r.attempt?.clientRef === options.clientRef)?.attempt });
      await new Promise((r) => setImmediate(r));
      return dispatchImpl ? dispatchImpl(options, state) : { success: true, statusCode: 200, status: 'received', turnRef: 'turn-continue', clientRef: options.clientRef };
    },
    onChange: () => { state.changes += 1; },
    timers: { set: (callback, delayMs) => { const t = { callback, delayMs, cleared: false }; state.timers.push(t); return t; }, clear: (t) => { t.cleared = true; } }
  });
  return state;
}

test('R9-4 a reset event wakes it; one bounded continue-task goes to the exact Player and conversation, write-ahead', async () => {
  const h = harness();
  const { record } = h.book.arm(armInput());
  await h.scheduler.onAlarm({ type: 'alarm:reset_boundary_reached', provider: 'claude' });
  assert.equal(h.dispatched.length, 1);
  const [{ options, stateAtSend, attempt }] = h.dispatched;
  assert.deepEqual(
    { mode: options.routingMode, id: options.playerInstanceId, key: options.expectedSessionKey, model: options.model, effort: options.effort, prompt: options.prompt },
    { mode: 'manual', id: CLAUDE, key: KEY, model: 'opus', effort: 'high', prompt: CONTINUE_TASK_PROMPT }
  );
  assert.equal(options.whenBusy, undefined, 'never the PlayQueue');
  assert.equal(options.queueItemId, undefined);
  assert.equal(stateAtSend, 'firing');
  assert.equal(attempt.clientRef, options.clientRef, 'the correlation was persisted before the send');
  assert.doesNotMatch(JSON.stringify(options), /Build the parser/, 'the original prompt is never replayed');
  const done = h.book.get(record.id);
  assert.equal(done.state, 'handed-off');
  assert.deepEqual([done.handedOff.clientRef, done.handedOff.turnRef], [options.clientRef, 'turn-continue']);
  await h.scheduler.onAlarm({ type: 'alarm:recovered', provider: 'claude' });
  await h.scheduler.wake({});
  assert.equal(h.dispatched.length, 1, 'ownership ended: later wakeups do nothing');
  await h.scheduler.onAlarm({ type: 'alarm:threshold_entered', provider: 'claude' });
  assert.equal(h.dispatched.length, 1);
});

test('R9-5 fallback timer, startup after a missed reset, and duplicate wakeups each send at most once', async () => {
  const early = harness({ now: NOW });
  const { record } = early.book.arm(armInput());
  await early.scheduler.armed(record.id);
  assert.equal(early.dispatched.length, 0, 'before the reset nothing is sent');
  const timer = early.timers.find((t) => !t.cleared);
  assert.equal(timer.delayMs, CLAUDE_BLOCKER.resetsAt * 1000 + DEFERRED_PLAY_CONSTANTS.fallbackAfterResetMs - NOW, 'fallback at horizon + 2 min');
  early.now = NOW + 40 * MIN;
  timer.callback();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(early.dispatched.length, 1, 'the fallback timer wakes it');

  // Coach was closed through the reset: startup revalidates and continues.
  const offline = harness();
  offline.book.arm(armInput());
  await offline.scheduler.start();
  assert.equal(offline.dispatched.length, 1, 'a reset that passed while Coach was offline is not a failure');

  // Alarm + timer + health change + recovery racing.
  const race = harness();
  race.book.arm(armInput());
  await Promise.all([
    race.scheduler.onAlarm({ type: 'alarm:reset_boundary_reached', provider: 'claude' }),
    race.scheduler.onAlarm({ type: 'alarm:recovered', provider: 'claude' }),
    race.scheduler.wake({}),
    race.scheduler.wake({ gameId: GAME, playerInstanceId: CLAUDE })
  ]);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(race.dispatched.length, 1, 'duplicate wakeups never duplicate the continuation');
});

test('R9-6 cancelled never fires; retry re-runs every check', async () => {
  const h = harness();
  const { record } = h.book.arm(armInput());
  assert.ok(h.scheduler.cancel(record.id, GAME));
  await h.scheduler.wake({});
  await h.scheduler.onAlarm({ type: 'alarm:reset_boundary_reached', provider: 'claude' });
  assert.equal(h.dispatched.length, 0);
  assert.equal(h.scheduler.cancel(record.id, GAME), undefined, 'a cancelled intent cannot be cancelled twice');

  const stale = harness({ now: NOW + 40 * MIN + DEFERRED_PLAY_CONSTANTS.recoveryGraceMs, econ: economics({}) });
  const armed = stale.book.arm(armInput()).record;
  await stale.scheduler.wake({});
  assert.equal(stale.book.get(armed.id).state, 'needs-attention');
  assert.equal(await stale.scheduler.retry(armed.id, GAME), true);
  assert.equal(stale.book.get(armed.id).state, 'needs-attention', 'retry does not bypass resource freshness');
  assert.equal(stale.dispatched.length, 0);
  stale.econ = RECOVERED;
  await stale.scheduler.retry(armed.id, GAME);
  assert.equal(stale.book.get(armed.id).state, 'handed-off');
  assert.equal(stale.dispatched.length, 1);
});

test('R9-7 same Player busy: R9 keeps ownership (no PlayQueue), then sends only to that Player/conversation', async () => {
  const h = harness({ cap: capability(CLAUDE, { state: 'busy' }) });
  const { record } = h.book.arm(armInput());
  await h.scheduler.wake({});
  assert.equal(h.dispatched.length, 0);
  assert.deepEqual([h.book.get(record.id).state, h.book.get(record.id).waitingFor], ['waiting', 'player']);
  const live = h.timers.filter((t) => !t.cleared);
  assert.ok(live.length <= 1, 'no polling: the Player-free event is the wakeup');
  assert.ok(live.every((t) => t.delayMs >= 10 * MIN), 'at most the single recovery-grace boundary timer, never a short poll');
  h.cap = capability(CLAUDE);
  await h.scheduler.wake({ gameId: GAME, playerInstanceId: CLAUDE });
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.dispatched[0].options.playerInstanceId, CLAUDE);

  // Busy discovered at send time (Player Control refused before sending): back to waiting, no duplicate.
  let refusals = 1;
  const race = harness({ dispatchImpl: (options) => refusals-- > 0
    ? { success: false, statusCode: 400, status: 'failed', reason: 'busy', message: 'That Player is still working.' }
    : { success: true, statusCode: 200, status: 'received', turnRef: 't', clientRef: options.clientRef } });
  const raced = race.book.arm(armInput()).record;
  await race.scheduler.wake({});
  assert.deepEqual([race.book.get(raced.id).state, race.book.get(raced.id).waitingFor, race.book.get(raced.id).attempt], ['waiting', 'player', undefined]);
  await race.scheduler.wake({ gameId: GAME, playerInstanceId: CLAUDE });
  assert.equal(race.book.get(raced.id).state, 'handed-off');
  assert.equal(race.dispatched.length, 2, 'the proven no-send and the one real send');

  // The conversation changes while waiting → needs-attention, never a fresh-conversation send.
  const moved = harness({ cap: capability(CLAUDE, { state: 'busy' }) });
  const waitingRecord = moved.book.arm(armInput()).record;
  await moved.scheduler.wake({});
  moved.cap = capability(CLAUDE, { sessionKey: 'fe11ce11' });
  await moved.scheduler.wake({ gameId: GAME, playerInstanceId: CLAUDE });
  assert.equal(moved.book.get(waitingRecord.id).state, 'needs-attention');
  assert.equal(moved.dispatched.length, 0);

  // Player Control's own pre-send refusal is respected too.
  const refused = harness({ dispatchImpl: () => ({ success: false, statusCode: 400, status: 'failed', reason: 'session-changed', message: 'Nothing was sent.' }) });
  const refusedRecord = refused.book.arm(armInput()).record;
  await refused.scheduler.wake({});
  assert.match(refused.book.get(refusedRecord.id).attention, /no longer in the conversation/);
});

test('R9-8 restart during firing: Ledger evidence of the exact clientRef, otherwise needs-attention — never blind replay', async () => {
  const dir = fs.mkdtempSync(path.join(scratch, 'restart-'));
  const file = path.join(dir, 'deferred-plays.json');
  const seed = new DeferredPlayBook(fileDeferredPlayStore(file), () => NOW);
  const landed = seed.arm(armInput()).record;
  seed.beginFiring(landed.id, 'ref_dp_landed_1');
  const lost = seed.arm(armInput({ interrupted: { ...armInput().interrupted, clientRef: 'ref_interrupted_2' } })).record;
  seed.beginFiring(lost.id, 'ref_dp_lost_1');

  const ledger = ledgerWith(CLAUDE, { blocker: CLAUDE_BLOCKER });
  ledger.recordDispatch({ gameId: GAME, playerInstanceId: CLAUDE, clientRef: 'ref_dp_landed_1', at: NOW });
  ledger.recordDelivery('ref_dp_landed_1', 'received', { turnRef: 'turn-cont' });

  const h = harness({ book: new DeferredPlayBook(fileDeferredPlayStore(file), () => NOW + 40 * MIN), ledger });
  await h.scheduler.start();
  assert.equal(h.book.get(landed.id).state, 'handed-off', 'definitive existing outcome respected');
  assert.equal(h.book.get(lost.id).state, 'needs-attention', 'uncertain outcome → needs-attention');
  assert.match(h.book.get(lost.id).attention, /restarted while sending/);
  assert.equal(h.dispatched.length, 0, 'nothing was resent');

  // Retry runs every check again: the Player is working, so it waits (no send) …
  await h.scheduler.retry(lost.id, GAME);
  assert.equal(h.dispatched.length, 0);
  assert.deepEqual([h.book.get(lost.id).state, h.book.get(lost.id).waitingFor], ['waiting', 'player']);
  // … and once that work finishes, the Player has moved past the interruption: needs-attention, never a blind resend.
  ledger.recordTurn(GAME, { instanceId: CLAUDE, state: 'completed', turnRef: 'turn-cont', summary: 'done' });
  await h.scheduler.wake({ gameId: GAME, playerInstanceId: CLAUDE });
  assert.equal(h.dispatched.length, 0);
  assert.equal(h.book.get(lost.id).state, 'needs-attention');

  const unknown = harness({ dispatchImpl: () => ({ success: false, statusCode: 504, status: 'unknown', message: 'no ack' }) });
  const u = unknown.book.arm(armInput()).record;
  await unknown.scheduler.wake({});
  assert.equal(unknown.book.get(u.id).state, 'needs-attention', 'an unconfirmed send is never retried automatically');
  assert.equal(unknown.dispatched.length, 1);
});

// ═════════════════════════════════════ DAEMON CHAIN ═════════════════════════════════════

function daemonHarness(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  const daemon = new ControlPlaneDaemon({ dir, port: 0, idleTimeoutMs: 60_000, routingFilm: { journal: { read: () => ({ events: [], diagnostics: [] }), append: () => undefined } } });
  const frames = [];
  const caps = [capability(CLAUDE), capability(CODEX, { sessionKey: '12345678' })];
  daemon.registry.registerSession({
    instanceId: 'stadium-1', stadiumId: 'stadium-r9', name: 'R9', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
    lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R9', fingerprintSource: 'git' },
    roster: [{ id: 'claude', name: 'Claude', instances: [{ instanceId: CLAUDE }] }, { id: 'codex', name: 'Codex', instances: [{ instanceId: CODEX }] }],
    capabilities: caps, reports: [], rosterSynchronized: true, rosterSyncedAt: 1
  });
  daemon.registry.setSelectedGameId?.(GAME);
  let econ = BLOCKED;
  daemon.currentRoutingEconomics = () => econ;
  // The interrupted Play, recorded through the real Ledger turn path.
  daemon.ledger.recordDispatch({ gameId: GAME, playerInstanceId: CLAUDE, playerType: 'claude', clientRef: 'ref_interrupted_1', model: 'opus', effort: 'high', promptSummary: 'Build the parser', transport: 'controlled', at: Date.now() - 20 * MIN });
  daemon.ledger.recordDelivery('ref_interrupted_1', 'received', { turnRef: 'turn-int' });
  daemon.ledger.recordTurn(GAME, { instanceId: CLAUDE, state: 'started', turnRef: 'turn-int' });
  const blocker = { ...CLAUDE_BLOCKER, resetsAt: S(Date.now() - 5 * MIN) };
  daemon.ledger.recordTurn(GAME, { instanceId: CLAUDE, state: 'failed', turnRef: 'turn-int', summary: 'Failed', blocker, sessionKey: KEY });
  return {
    daemon, frames, caps, blocker, dir,
    setEconomics: (next) => { econ = next; },
    recovered: () => economics({ claude: pool('claude', [win('five_hour', 300, { R: 0.97, resetsAt: blocker.resetsAt + 5 * 3600 })]) }),
    blocked: () => economics({ claude: pool('claude', [win('five_hour', 300, { R: 0, resetsAt: blocker.resetsAt, floor: 4 })]) })
  };
}
const waitFor = async (predicate, label) => {
  const end = Date.now() + 4_000;
  while (Date.now() < end) { const v = await predicate(); if (v) return v; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`timed out waiting for ${label}`);
};

test('R9-9 daemon: status offers Schedule only on the interrupted Player; arming sends one continue-task through the real router', async () => {
  const h = daemonHarness('chain');
  h.setEconomics(h.blocked());
  const status = h.daemon.buildStatus();
  assert.deepEqual(status.continuations.map((offer) => offer.playerInstanceId), [CLAUDE], 'only the Player with a structured provider-limit interruption');
  assert.equal(status.continuations[0].interruptedClientRef, 'ref_interrupted_1');
  assert.deepEqual(status.continuations[0].alternatives.map((alt) => alt.instanceId), [CODEX]);
  assert.equal('sessionKey' in status.continuations[0], false, 'no session identity reaches the browser projection');

  const armed = h.daemon.armDeferredContinuation(GAME, CLAUDE, 'ref_interrupted_1');
  assert.equal(armed.status, 200);
  assert.equal(h.daemon.armDeferredContinuation(GAME, CLAUDE, 'ref_interrupted_1').body.created, false, 'idempotent arm');
  assert.equal(h.daemon.armDeferredContinuation(GAME, CODEX, 'anything').status, 409, 'a Player without a provider-limit interruption cannot be scheduled');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.frames.filter((f) => f.method === 'dispatch.request').length, 0, 'the old cycle is still reported: nothing fires yet');
  const projected = h.daemon.buildStatus();
  assert.equal(projected.continuations.length, 0, 'once scheduled, the offer becomes the scheduled line');
  assert.deepEqual(projected.deferredPlays.map((item) => [item.playerInstanceId, item.state]), [[CLAUDE, 'waiting']]);
  assert.equal(h.daemon.playQueue.forGame(GAME).length, 0, 'nothing entered the PlayQueue');

  // Fresh truth arrives for the new cycle: the health seam wakes the scheduler.
  h.setEconomics(h.recovered());
  void h.daemon.deferredScheduler.wake({}); // resolves only when the Stadium acks: do not await it here
  const frame = await waitFor(() => h.frames.find((f) => f.method === 'dispatch.request'), 'continuation frame');
  assert.equal(frame.params.playerInstanceId, CLAUDE);
  assert.equal(frame.params.expectedSessionKey, KEY);
  assert.equal(frame.params.routingMode, 'manual');
  assert.ok(frame.params.prompt.startsWith(CONTINUE_TASK_PROMPT));
  assert.doesNotMatch(frame.params.prompt, /Build the parser/, 'no original-prompt replay');
  const record = h.daemon.deferredPlays.active()[0];
  assert.equal(frame.params.clientRef, record.attempt.clientRef, 'the frame carries the persisted write-ahead correlation');
  h.daemon.routerInstance.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: "stadium-r9", gameId: GAME, playerInstanceId: CLAUDE, turnRef: "turn-cont", acceptedAt: Date.now() });
  await waitFor(() => h.daemon.deferredPlays.get(record.id).state === 'handed-off', 'handed-off');
  assert.equal(h.frames.filter((f) => f.method === 'dispatch.request').length, 1, 'exactly once');
  const stored = JSON.parse(fs.readFileSync(path.join(h.dir, 'deferred-plays.json'), 'utf8'));
  assert.equal(stored.records[0].state, 'handed-off', 'durable at ~/.sideline/deferred-plays.json');
  h.daemon.deferredScheduler.stop();
});

test('R9-10 Use another Player: explicit exact receiver through the existing router with the handoff package', async () => {
  const h = daemonHarness('handoff');
  h.setEconomics(h.blocked());
  assert.equal(h.frames.length, 0, 'nothing is sent to anyone without a human choice');
  const pending = h.daemon.useAnotherPlayer(GAME, CLAUDE, 'ref_interrupted_1', CODEX);
  const frame = await waitFor(() => h.frames.find((f) => f.method === 'dispatch.request'), 'handoff frame');
  assert.equal(frame.params.playerInstanceId, CODEX, 'the exact Player Dad chose');
  assert.equal(frame.params.routingMode, 'manual');
  assert.equal('expectedSessionKey' in frame.params, false, 'a different Player is a different conversation by design');
  assert.match(frame.params.prompt, /^\[Sideline Coach handoff\]/, 'the existing handoff preamble');
  assert.match(frame.params.prompt, /Previous Play: "Build the parser"/);
  assert.ok(frame.params.prompt.includes(HANDOFF_AFTER_LIMIT_INSTRUCTION), 'inspect the working tree, continue from the proven state');
  h.daemon.routerInstance.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-r9', gameId: GAME, playerInstanceId: CODEX, acceptedAt: Date.now() });
  assert.equal((await pending).status, 200);

  const again = daemonHarness('handoff-scheduled');
  again.setEconomics(again.blocked());
  again.daemon.armDeferredContinuation(GAME, CLAUDE, 'ref_interrupted_1');
  const refused = await again.daemon.useAnotherPlayer(GAME, CLAUDE, 'ref_interrupted_1', CODEX);
  assert.equal(refused.status, 409, 'never both: a scheduled continuation must be cancelled first');
  assert.equal((await again.daemon.useAnotherPlayer(GAME, CLAUDE, 'ref_interrupted_1', CLAUDE)).status, 400);
  again.daemon.deferredScheduler.stop();
});

test('R9-11 routes are default-deny classified; the UI action is Player-contextual only', () => {
  assert.equal(classifyDaemonRoute('POST', '/api/deferred-play'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/deferred-play/use-another'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/deferred-play/dp_1/cancel'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('POST', '/api/deferred-play/dp_1/retry'), 'remote-mutate');
  assert.equal(classifyDaemonRoute('GET', '/api/deferred-play'), undefined);

  const page = read('src', 'public', 'index.html');
  const markup = page.slice(0, page.indexOf('<script>'));
  assert.doesNotMatch(markup, /Schedule/i, 'no static/global Schedule control anywhere in the page markup');
  const script = page.slice(page.indexOf('<script>'));
  assert.equal(script.match(/Schedule after reset/g)?.length, 1, 'one affordance…');
  const at = script.indexOf('Schedule after reset');
  const block = script.slice(script.lastIndexOf('continuationByInstance.get(instance.instanceId)', at), at);
  assert.ok(block.length > 0 && block.length < 1200, '…built only inside the exact Player\'s strip, from that Player\'s interruption');
  assert.match(script, /deferredByInstance\.get\(instance\.instanceId\)/, 'scheduled / attention lines attach to the exact Player');
});

test('R9-12 PlayQueue, AUTO routing, R8 and recommendation scoring are untouched by R9', () => {
  for (const [file, pattern] of [
    [['src', 'control-plane', 'play-queue.ts'], /deferred|DeferredPlay|expectedSessionKey|continue-task/i],
    [['src', 'routing-policy.ts'], /deferred|DeferredPlay|expectedSessionKey/i],
    [['src', 'routing-intel', 'recommend.ts'], /DeferredPlay|deferred-play/],
    [['src', 'routing-intel', 'advisory-stage.ts'], /DeferredPlay|deferred-play/]
  ]) {
    assert.doesNotMatch(read(...file), pattern, file.join('/'));
  }
  const scheduler = read('src', 'control-plane', 'deferred-play-scheduler.ts');
  assert.doesNotMatch(scheduler, /whenBusy|queueItemId|computeRoute|routingMode: 'auto'|recommendRoute/, 'no queueing, no second routing path');
});
