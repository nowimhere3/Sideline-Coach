/** Q2.10F.2 Slice A2 — exact active-turn recovery after daemon replacement. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { projectExecution } from '../out/control-plane/execution-projection.js';

const GAME_A = 'game_recovery_a';
const GAME_B = 'game_recovery_b';
const CLAUDE = 'claude-a2a2a2a2';
const CODEX = 'codex-b2b2b2b2';

const capability = (instanceId, overrides = {}) => ({
  instanceId,
  playerType: instanceId.startsWith('codex') ? 'codex' : 'claude',
  transport: 'controlled',
  fieldLabel: instanceId.startsWith('codex') ? 'Codex' : 'Claude',
  state: 'busy',
  capability: { provider: 'test', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
  ...overrides
});

test('Q2.10F.2-A2.1 started and accepted active-turn evidence recover exact semantic states', () => {
  let now = 9_000;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.observeRoster(GAME_A, [capability(CLAUDE, {
    activeTurn: { turnRef: 'turn-started', state: 'started', startedAt: 1_234 }
  })]);

  const started = ledger.get(GAME_A, CLAUDE);
  assert.equal(started.workState, 'working');
  assert.deepEqual(started.currentPlay, {
    clientRef: 'turn-started',
    startedAt: 1_234,
    executionStartedAt: 1_234,
    turnRef: 'turn-started',
    recovered: true
  });
  assert.deepEqual(
    { state: projectExecution({ instanceId: CLAUDE, entry: started, now }).state, executionStartedAt: started.currentPlay.executionStartedAt },
    { state: 'working', executionStartedAt: 1_234 }
  );

  now = 10_000;
  ledger.observeRoster(GAME_A, [capability(CODEX, {
    activeTurn: { turnRef: 'turn-accepted', state: 'accepted', startedAt: 2_345 }
  })], new Set([CLAUDE, CODEX]));
  const accepted = ledger.get(GAME_A, CODEX);
  assert.equal(accepted.currentPlay.turnRef, 'turn-accepted');
  assert.equal(accepted.currentPlay.startedAt, 2_345, 'recovery keeps the Stadium event timestamp as its fallback attribution time');
  assert.equal(accepted.currentPlay.executionStartedAt, undefined, 'accepted is not genuine execution start');
  assert.equal(projectExecution({ instanceId: CODEX, entry: accepted, now }).state, 'starting');
});

test('Q2.10F.2-A2.2 busy without activeTurn remains honest Working without fabricated identity or clock', () => {
  const ledger = new InstanceWorkLedger(() => 5_000);
  ledger.observeRoster(GAME_A, [capability(CLAUDE)]);
  const entry = ledger.get(GAME_A, CLAUDE);
  assert.equal(entry.workState, 'working');
  assert.equal(entry.currentPlay, undefined);
  assert.deepEqual(projectExecution({ instanceId: CLAUDE, entry, now: 5_000 }), {
    instanceId: CLAUDE,
    revision: entry.revision,
    state: 'working',
    playRef: undefined,
    summary: undefined,
    executionStartedAt: undefined
  });
});

test('Q2.10F.2-A2.3 genuine terminal history rejects stale activeTurn evidence', () => {
  let now = 100;
  for (const terminalState of ['completed', 'failed', 'interrupted', 'unknown']) {
    const ledger = new InstanceWorkLedger(() => ++now);
    const turnRef = `turn-${terminalState}`;
    ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: `play-${terminalState}` });
    ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef });
    ledger.recordTurn(GAME_A, { instanceId: CLAUDE, state: terminalState, turnRef });
    const terminal = ledger.get(GAME_A, CLAUDE);
    ledger.observeRoster(GAME_A, [capability(CLAUDE, {
      activeTurn: { turnRef, state: 'started', startedAt: 1 }
    })]);
    const after = ledger.get(GAME_A, CLAUDE);
    assert.equal(after.currentPlay, undefined, `${terminalState} must not be resurrected`);
    assert.equal(after.recentPlays[0].outcome, terminalState);
    assert.ok(after.revision >= terminal.revision, 'busy reconciliation may revise work visibility but revision never regresses');
  }
});

test('Q2.10F.2-A2.4 replacement reclaims only process-loss Unknown and completes through the normal report path', () => {
  let oldNow = 2_000;
  const oldLedger = new InstanceWorkLedger(() => oldNow);
  oldLedger.recordReports(GAME_A, []);
  oldLedger.recordDispatch({
    gameId: GAME_A, playerInstanceId: CLAUDE, playerType: 'claude', clientRef: 'play-original',
    promptSummary: 'Implement recovery', model: 'opus', effort: 'high', at: 1_000
  });
  oldLedger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'turn-live' });
  const persisted = oldLedger.serialize();

  let now = 8_000;
  const replacement = new InstanceWorkLedger(() => now);
  replacement.restore(persisted);
  assert.notEqual(replacement.epoch, oldLedger.epoch);
  assert.equal(replacement.get(GAME_A, CLAUDE).recentPlays[0].recoveryCandidate, true);

  const beforeRecoveryRevision = replacement.get(GAME_A, CLAUDE).revision;
  replacement.observeRoster(GAME_A, [capability(CLAUDE, {
    activeTurn: { turnRef: 'turn-live', state: 'started', startedAt: 2_000 }
  })]);
  const recovered = replacement.get(GAME_A, CLAUDE);
  assert.equal(recovered.currentPlay.clientRef, 'play-original', 'durable Coach identity survives replacement');
  assert.equal(recovered.currentPlay.startedAt, 1_000, 'known dispatch attribution time is preserved');
  assert.equal(recovered.currentPlay.executionStartedAt, 2_000, 'Stadium semantic start is adopted only during recovery');
  assert.equal(recovered.currentPlay.recovered, true);
  assert.equal(recovered.recentPlays.some((play) => play.turnRef === 'turn-live'), false, 'the process-loss placeholder is reclaimed');
  assert.ok(recovered.revision > beforeRecoveryRevision);

  now = 9_000;
  replacement.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'completed', turnRef: 'turn-live', summary: 'Done' });
  const completed = replacement.get(GAME_A, CLAUDE);
  assert.equal(completed.currentPlay, undefined);
  assert.equal(completed.recentPlays[0].clientRef, 'play-original');
  assert.equal(completed.recentPlays[0].outcome, 'completed');
  assert.equal(completed.recentPlays[0].executionStartedAt, 2_000);
  assert.equal(projectExecution({ instanceId: CLAUDE, entry: completed, now }).durationMs, 7_000);

  replacement.recordReports(GAME_A, [{
    path: 'REPORTS/Claude/recovered.md', filename: 'recovered.md', mtime: 9_010,
    provenance: { gameId: GAME_A, clientRef: 'play-original', playerInstanceId: CLAUDE, playerType: 'claude' }
  }]);
  const finished = projectExecution({ instanceId: CLAUDE, entry: replacement.get(GAME_A, CLAUDE), now: 9_020 });
  assert.equal(finished.state, 'finished');
  assert.equal(finished.report.path, 'REPORTS/Claude/recovered.md');

  const persistedAgain = replacement.serialize();
  const restoredAgain = new InstanceWorkLedger(() => 10_000);
  restoredAgain.restore(persistedAgain);
  assert.equal(restoredAgain.get(GAME_A, CLAUDE).recentPlays[0].clientRef, 'play-original');
  assert.equal(restoredAgain.get(GAME_A, CLAUDE).recentPlays[0].recoveryCandidate, undefined, 'completed history is never marked recoverable');
});

test('Q2.10F.2-A2.5 recovery is Game and exact-instance isolated and malformed evidence is ignored', () => {
  const ledger = new InstanceWorkLedger(() => 7_000);
  ledger.observeRoster(GAME_A, [
    capability(CLAUDE, { activeTurn: { turnRef: 'game-a-turn', state: 'started', startedAt: 100 } }),
    capability(CODEX, { activeTurn: { turnRef: 'bad-turn', state: 'started', startedAt: 'yesterday' } })
  ]);
  ledger.observeRoster(GAME_B, [capability(CLAUDE, {
    activeTurn: { turnRef: 'game-b-turn', state: 'accepted', startedAt: 200 }
  })]);

  assert.equal(ledger.get(GAME_A, CLAUDE).currentPlay.turnRef, 'game-a-turn');
  assert.equal(ledger.get(GAME_B, CLAUDE).currentPlay.turnRef, 'game-b-turn');
  assert.equal(ledger.get(GAME_A, CODEX).currentPlay, undefined, 'invalid timestamps cannot become canonical identity');
  assert.equal(ledger.get(GAME_B, CODEX), undefined);
});

test('Q2.10F.2-A2.6 completion racing ahead of the replacement snapshot closes the durable active Play', () => {
  let now = 1_000;
  const oldLedger = new InstanceWorkLedger(() => now);
  oldLedger.recordDispatch({ gameId: GAME_A, playerInstanceId: CLAUDE, clientRef: 'race-play', at: 100 });
  oldLedger.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'started', turnRef: 'race-turn' });

  const replacement = new InstanceWorkLedger(() => now += 1_000);
  replacement.restore(oldLedger.serialize());
  replacement.recordTurn(GAME_A, { instanceId: CLAUDE, state: 'completed', turnRef: 'race-turn' });

  const completed = replacement.get(GAME_A, CLAUDE);
  assert.equal(completed.currentPlay, undefined);
  assert.equal(completed.recentPlays.length, 1);
  assert.equal(completed.recentPlays[0].clientRef, 'race-play');
  assert.equal(completed.recentPlays[0].outcome, 'completed');
  assert.equal(completed.recentPlays[0].recoveryCandidate, undefined);
  assert.equal(completed.recentPlays[0].executionStartedAt, 1_000);
});
