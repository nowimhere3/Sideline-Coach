import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeScoutContinuationAuthority, analyzeScoutNeed } from '../out/play-analyzer.js';
import { ScoutPlayerAdapter } from '../out/scout-player.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';
import {
  ScoutContinuationLedger,
  MEMORY_SCOUT_CONTINUATION_STORE,
  buildScoutContinuationPreamble
} from '../out/control-plane/scout-continuation.js';

const GAME = 'game_scout_continuation';
const IMPLEMENT_AFTER_RECON = 'Investigate which subsystem owns the report watcher across multiple current systems before fixing the bounded stale label, then fix it.';
const RECON_ONLY = 'Scout this current architecture across multiple systems and tell me what you find.';

function temp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function model(provider) {
  return {
    provider,
    authenticated: true,
    observedAt: Date.now(),
    freshness: 'live',
    models: [{ id: `${provider}-model`, displayName: `${provider} model`, isDefault: true, supportedEfforts: ['medium'], defaultEffort: 'medium' }]
  };
}

function capability(instanceId, playerType, overrides = {}) {
  return {
    instanceId,
    playerType,
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: playerType.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    state: 'ready',
    capability: model(playerType),
    ...overrides
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function until(predicate, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function api(port, dir, body) {
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${port}/api/dispatch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function status(port, dir) {
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
}

function chainHarness({ players, prompt = IMPLEMENT_AFTER_RECON, outcome = 'COMPLETE' }) {
  const dir = temp('sideline-scout-continuation-');
  const gameRoot = path.join(dir, 'Game');
  fs.mkdirSync(gameRoot, { recursive: true });
  const port = 47000 + Math.floor(Math.random() * 1000);
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000 });
  const formation = deferred();
  const delivered = [];
  const turnRefs = [];
  const livePlayers = [...players];
  const scout = new ScoutPlayerAdapter({
    candidates: [{
      id: 'fixture-receiver', player: 'Fixture Receiver', provider: 'Fixture',
      eligible: () => ({ eligible: true, reason: 'fixture READY' }),
      createExecutor: () => { throw new Error('runFormation fixture owns execution'); }
    }],
    runFormation: () => formation.promise
  });
  const roster = {
    resolve(id) {
      const found = livePlayers.find((candidate) => candidate.instanceId === id);
      return found
        ? { state: 'live', transport: found.transport, instance: { instanceId: id, playerType: found.playerType, onField: true } }
        : { state: 'unknown' };
    },
    // S31 Slice 5: Scout is a roster-native Virtual Player, so a Scout on the Team comes from the roster
    // (a roster instance plus its routing capability) exactly like every other Player. Nothing is injected.
    status: async () => [
      ...livePlayers.map((candidate, index) => ({
        id: candidate.playerType,
        name: candidate.fieldLabel,
        instances: [{ instanceId: candidate.instanceId, playerType: candidate.playerType, seat: index + 1, fieldLabel: candidate.fieldLabel, onField: true }]
      })),
      { id: 'scout', name: 'Scout', virtual: true, instances: [{ instanceId: 'scout', playerType: 'scout', seat: 1, fieldLabel: 'Scout', onField: true, virtual: true, singleton: true, readinessState: 'ready', readinessLabel: 'Ready' }] }
    ],
    getRoutingCapabilities: () => [...livePlayers, scout.capability(gameRoot)].filter(Boolean),
    isVirtualOnField: () => true,
    getLastDiscovery: () => undefined
  };
  const host = {
    async deliver(instanceId, deliveredPrompt, options) {
      const turnRef = `continuation-turn-${delivered.length + 1}`;
      delivered.push({ instanceId, prompt: deliveredPrompt, options, turnRef });
      turnRefs.push(turnRef);
      return { kind: 'accepted', turnRef };
    }
  };
  const stadiumId = getDurableStadiumId(dir);
  const client = new StadiumClient({
    port,
    dir,
    instanceId: `inst_${stadiumId}_scout_continuation`,
    gameContextGetter: () => ({
      game: { gameId: GAME, displayName: 'Continuation Game', fingerprintSource: 'test' },
      stadium: { stadiumId, name: 'Test Stadium', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: GAME, stadiumId, rootFsPath: gameRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    playerRoster: roster,
    playerControlHost: host,
    scoutPlayer: scout,
    reportsGetter: async () => [],
    autoReconnect: false
  });
  const finishScout = () => formation.resolve({
    schemaVersion: 1,
    formationId: 'Scout-Formation__fixture',
    objective: prompt,
    canonicalPlayHash: 'sha256:fixture',
    semanticPromptHash: 'sha256:fixture',
    gameRoot,
    workspacePath: path.join(gameRoot, 'Scouts', 'fixture'),
    durablePath: path.join(gameRoot, 'REPORTS', 'Scout Only', 'Formations', 'fixture'),
    resultPath: path.join(gameRoot, 'REPORTS', 'Scout Only', 'Formations', 'fixture', 'FORMATION-RESULT.md'),
    maxConcurrency: 1,
    startedAt: new Date(Date.now() - 10).toISOString(),
    endedAt: new Date().toISOString(),
    candidatesConsidered: [],
    selectedCandidateIds: ['fixture-receiver'],
    scoutsRequested: 1,
    scoutsCompleted: outcome === 'COMPLETE' ? 1 : 0,
    scoutsFailed: outcome === 'FAILED' ? 1 : 0,
    scoutsBlocked: outcome === 'BLOCKED' ? 1 : 0,
    scoutsInterrupted: 0,
    scoutsUnknown: outcome === 'UNKNOWN' ? 1 : 0,
    outcome,
    attempts: [],
    reportPaths: [],
    contradictions: [],
    uniqueFindings: [],
    combinedReport: 'fixture'
  });
  return { dir, daemon, client, delivered, livePlayers, finishScout, turnRefs };
}

test('continuation authority distinguishes implementation/synthesis from reconnaissance-only intent', () => {
  assert.equal(analyzeScoutNeed('Investigate why report discovery is broken and fix it.').shouldUseScout, true);
  assert.equal(analyzeScoutContinuationAuthority('Investigate why report discovery is broken and fix it.').authorized, true);
  assert.equal(analyzeScoutContinuationAuthority('Audit the current architecture and recommend the smallest next change.').authorized, true);
  const only = analyzeScoutContinuationAuthority(RECON_ONLY);
  assert.equal(only.authorized, false);
  assert.equal(only.reconnaissanceOnly, true);
});

test('the bounded ledger preserves the original Play and stops every non-COMPLETE Scout outcome', () => {
  for (const outcome of ['PARTIAL', 'BLOCKED', 'FAILED', 'UNKNOWN']) {
    const ledger = new ScoutContinuationLedger(MEMORY_SCOUT_CONTINUATION_STORE, () => 10);
    const record = ledger.stage({
      gameId: GAME,
      originalClientRef: `ref-${outcome}`,
      originalPrompt: IMPLEMENT_AFTER_RECON,
      originalPlayLabel: 'Medium implementation Play',
      createdAt: 1,
      scoutReason: 'Evidence first.',
      authority: analyzeScoutContinuationAuthority(IMPLEMENT_AFTER_RECON)
    });
    ledger.acceptScout(record.originalClientRef, `turn-${outcome}`);
    const finished = ledger.recordScoutOutcome({ gameId: GAME, turnRef: `turn-${outcome}`, outcome, reportPath: 'REPORTS/Scout/result.md' });
    assert.equal(finished.originalPrompt, IMPLEMENT_AFTER_RECON);
    assert.equal(finished.state, outcome.toLowerCase());
    assert.equal(finished.continuationDecision, undefined);
  }
});

test('the compact handoff references durable evidence and explicitly keeps Scout findings non-authoritative', () => {
  const preamble = buildScoutContinuationPreamble({
    reportPath: 'REPORTS/Scout Only/Formations/f/FORMATION-RESULT.md',
    formationId: 'f',
    authorityReason: 'The original Play requests implementation.'
  });
  assert.match(preamble, /Read the durable Scout evidence/);
  assert.match(preamble, /evidence, not architecture authority/);
  assert.doesNotMatch(preamble, /# FACTS|Combined findings/);
});

test('real Control Plane chain returns COMPLETE Scout evidence to Coach and selects the sole live future Player', async () => {
  const future = capability('future-player-11111111', 'future-player');
  const h = chainHarness({ players: [future] });
  try {
    await h.daemon.start();
    assert.equal(await h.client.connect(), true);
    assert.ok(await until(() => h.daemon.registryInstance.getCapabilitiesForGame(GAME).length === 2));

    const first = await api(h.daemon.port, h.dir, { gameId: GAME, routingMode: 'auto', prompt: IMPLEMENT_AFTER_RECON });
    assert.equal(first.body.decision.playerInstanceId, 'scout');
    assert.equal(first.body.decision.mode, 'auto');
    const pending = h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0];
    assert.equal(pending.originalPrompt, IMPLEMENT_AFTER_RECON);
    assert.equal(pending.authority.authorized, true);

    h.finishScout();
    assert.ok(await until(() => h.delivered.length === 1), 'Coach should dispatch one continuation');
    assert.equal(h.delivered[0].instanceId, future.instanceId);
    assert.match(h.delivered[0].prompt, /Scout continuation/);
    assert.match(h.delivered[0].prompt, /FORMATION-RESULT\.md/);
    assert.match(h.delivered[0].prompt, /evidence, not architecture authority/);
    assert.match(h.delivered[0].prompt, new RegExp(IMPLEMENT_AFTER_RECON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const continued = h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0];
    assert.equal(continued.formationOutcome, 'COMPLETE');
    assert.equal(continued.continuationDecision.playerInstanceId, future.instanceId);
    assert.equal(continued.continuationDecision.scoutContinuation.phase, 'post-scout');
    assert.deepEqual(continued.continuationCandidates.map((candidate) => candidate.instanceId), [future.instanceId]);
    assert.equal(continued.state, 'received');

    h.client.sendTurnChanged({ instanceId: future.instanceId, turnRef: h.turnRefs[0], state: 'completed', summary: 'Bounded follow-on complete.', at: Date.now() });
    assert.ok(await until(() => h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0].state === 'completed'));
    const projected = (await status(h.daemon.port, h.dir)).scoutContinuations[0];
    assert.equal(projected.state, 'completed');
    assert.equal(projected.selectedPlayerInstanceId, future.instanceId);
    assert.equal('originalPrompt' in projected, false, 'normal status does not expose the retained full human prompt');
  } finally {
    h.client.dispose();
    await h.daemon.stop();
    fs.rmSync(h.dir, { recursive: true, force: true });
  }
});

test('actual live Team membership, not Claude/Codex identity, determines continuation eligibility', async () => {
  for (const [label, players, expected] of [
    ['no Claude', [capability('codex-only-11111111', 'codex')], 'codex-only-11111111'],
    ['no Codex', [capability('antigravity-only-11111111', 'antigravity')], 'antigravity-only-11111111'],
    ['neither named provider', [capability('gemini-future-11111111', 'gemini-future')], 'gemini-future-11111111']
  ]) {
    const h = chainHarness({ players });
    try {
      await h.daemon.start();
      assert.equal(await h.client.connect(), true, label);
      assert.ok(await until(() => h.daemon.registryInstance.getCapabilitiesForGame(GAME).length === 2));
      const first = await api(h.daemon.port, h.dir, { gameId: GAME, routingMode: 'auto', prompt: IMPLEMENT_AFTER_RECON });
      assert.equal(first.body.decision.playerInstanceId, 'scout');
      h.finishScout();
      assert.ok(await until(() => h.delivered.length === 1), label);
      assert.equal(h.delivered[0].instanceId, expected, label);
    } finally {
      h.client.dispose();
      await h.daemon.stop();
      fs.rmSync(h.dir, { recursive: true, force: true });
    }
  }
});

test('a Control Plane replacement receives one replayed Scout completion and resumes the durable original Play', async () => {
  const worker = capability('replacement-worker-11111111', 'future-worker');
  const h = chainHarness({ players: [worker] });
  let replacement;
  try {
    await h.daemon.start();
    assert.equal(await h.client.connect(), true);
    assert.ok(await until(() => h.daemon.registryInstance.getCapabilitiesForGame(GAME).length === 2));
    const first = await api(h.daemon.port, h.dir, { gameId: GAME, routingMode: 'auto', prompt: IMPLEMENT_AFTER_RECON });
    assert.equal(first.body.decision.playerInstanceId, 'scout');
    assert.ok(await until(() => Boolean(h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0]?.scoutTurnRef)));

    await h.daemon.stop();
    assert.ok(await until(() => !h.client.isConnected));
    h.finishScout();
    await new Promise((resolve) => setTimeout(resolve, 50));

    replacement = new ControlPlaneDaemon({ dir: h.dir, port: 49000 + Math.floor(Math.random() * 500), idleTimeoutMs: 60_000 });
    await replacement.start();
    h.client.setPort(replacement.port);
    assert.equal(await h.client.connect(), true);
    assert.ok(await until(() => h.delivered.length === 1), 'replayed terminal Scout turn should resume exactly one continuation');
    assert.equal(h.delivered[0].instanceId, worker.instanceId);
    assert.match(h.delivered[0].prompt, new RegExp(IMPLEMENT_AFTER_RECON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const restored = replacement.scoutContinuationLedgerInstance.forGame(GAME)[0];
    assert.equal(restored.originalClientRef, first.body.clientRef);
    assert.equal(restored.formationOutcome, 'COMPLETE');
    assert.equal(restored.continuationDecision.playerInstanceId, worker.instanceId);

    h.client.sendTurnChanged({ instanceId: worker.instanceId, turnRef: h.turnRefs[0], state: 'completed', summary: 'Replacement continuation complete.', at: Date.now() });
    assert.ok(await until(() => replacement.scoutContinuationLedgerInstance.forGame(GAME)[0].state === 'completed'));
    h.client.announceGameAndState();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(h.delivered.length, 1, 'duplicate replay is idempotent and cannot launch a second continuation');
  } finally {
    h.client.dispose();
    if (replacement) await replacement.stop();
    else await h.daemon.stop();
    fs.rmSync(h.dir, { recursive: true, force: true });
  }
});

test('reconnaissance-only authority, no eligible Player, and non-COMPLETE outcomes stop without recursive dispatch', async () => {
  for (const scenario of [
    { name: 'recon only', prompt: RECON_ONLY, players: [capability('worker-11111111', 'future-worker')], outcome: 'COMPLETE', expected: 'stopped' },
    { name: 'no eligible Player', prompt: IMPLEMENT_AFTER_RECON, players: [], outcome: 'COMPLETE', expected: 'stopped' },
    { name: 'partial evidence', prompt: IMPLEMENT_AFTER_RECON, players: [capability('worker-22222222', 'future-worker')], outcome: 'PARTIAL', expected: 'partial' }
  ]) {
    const h = chainHarness(scenario);
    try {
      await h.daemon.start();
      assert.equal(await h.client.connect(), true, scenario.name);
      const expectedCapabilities = scenario.players.length + 1;
      assert.ok(await until(() => h.daemon.registryInstance.getCapabilitiesForGame(GAME).length === expectedCapabilities));
      const first = await api(h.daemon.port, h.dir, { gameId: GAME, routingMode: 'auto', prompt: scenario.prompt });
      assert.equal(first.body.decision.playerInstanceId, 'scout', scenario.name);
      h.finishScout();
      assert.ok(await until(() => h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0]?.state === scenario.expected), scenario.name);
      assert.equal(h.delivered.length, 0, scenario.name);
      const record = h.daemon.scoutContinuationLedgerInstance.forGame(GAME)[0];
      assert.equal(record.continuationDecision, undefined, scenario.name);
    } finally {
      h.client.dispose();
      await h.daemon.stop();
      fs.rmSync(h.dir, { recursive: true, force: true });
    }
  }
});

test('the continuation layer contains no provider handoff identity or hidden Scout maintenance engine', () => {
  const source = fs.readFileSync(path.resolve('src/control-plane/scout-continuation.ts'), 'utf8');
  assert.doesNotMatch(source, /runScoutFormation|runCoachRefresh|runScoutCombine|combineDerivedFormationCandidates/);
  assert.doesNotMatch(source, /send to (?:Claude|Codex|AntiGravity)|architecture\s*=>\s*(?:Claude|Codex)/i);
});

// ---------------------------------------------------------------------------
// Q2.13 — Queued Scout Continuation Outcome Linkage V0.1
//
// S19.0 named the gap directly: a continuation routed into the existing
// Player queue is delivered correctly, but its audit record never acquired
// the later released turn identity, so it could remain `queued` forever even
// after the released Play finished. bindQueueRelease() closes that lineage
// gap by binding the queue item's eventual REAL turnRef onto the SAME
// record — no second queue, no polling, no new ledger.
// ---------------------------------------------------------------------------

function stagedQueuedLedgerFixture(now = () => 10) {
  const ledger = new ScoutContinuationLedger(MEMORY_SCOUT_CONTINUATION_STORE, now);
  const staged = ledger.stage({
    gameId: GAME,
    originalClientRef: 'ref-queued',
    originalPrompt: IMPLEMENT_AFTER_RECON,
    originalPlayLabel: 'Medium implementation Play',
    createdAt: 1,
    scoutReason: 'Evidence first.',
    authority: analyzeScoutContinuationAuthority(IMPLEMENT_AFTER_RECON)
  });
  ledger.acceptScout(staged.originalClientRef, 'scout-turn-1');
  ledger.recordScoutOutcome({ gameId: GAME, turnRef: 'scout-turn-1', outcome: 'COMPLETE', formationId: 'f', reportPath: 'REPORTS/Scout/result.md' });
  ledger.beginContinuation(staged.id, [{ instanceId: 'busy-worker', playerType: 'future-worker', provider: 'future-worker', state: 'busy', eligible: true, reason: 'fixture' }]);
  ledger.recordContinuationDispatch(staged.id, { status: 'queued', queueItemId: 'queue_fixture_1', clientRef: 'client-queued-1' });
  return { ledger, id: staged.id };
}

test('Q2.13-1. A queued continuation dispatch retains its Play Queue item identity, and only when actually queued', () => {
  const { ledger, id } = stagedQueuedLedgerFixture();
  const queuedRecord = ledger.get(id);
  assert.equal(queuedRecord.state, 'queued');
  assert.equal(queuedRecord.continuationQueueItemId, 'queue_fixture_1');
  assert.equal(queuedRecord.continuationTurnRef, undefined, 'no turn exists yet — nothing has run');

  // The ordinary immediate (non-queued) path never records a queue item.
  const immediate = new ScoutContinuationLedger(MEMORY_SCOUT_CONTINUATION_STORE, () => 10);
  const record = immediate.stage({
    gameId: GAME, originalClientRef: 'ref-immediate', originalPrompt: IMPLEMENT_AFTER_RECON,
    createdAt: 1, scoutReason: 'x', authority: analyzeScoutContinuationAuthority(IMPLEMENT_AFTER_RECON)
  });
  immediate.acceptScout(record.originalClientRef, 'scout-turn-2');
  immediate.recordScoutOutcome({ gameId: GAME, turnRef: 'scout-turn-2', outcome: 'COMPLETE', reportPath: 'r.md' });
  immediate.beginContinuation(record.id, []);
  immediate.recordContinuationDispatch(record.id, { status: 'received', turnRef: 'immediate-turn-1', clientRef: 'client-immediate-1' });
  assert.equal(immediate.get(record.id).continuationQueueItemId, undefined, 'an immediately-received continuation never carries a queue item id');
});

test('Q2.13-2. Queue release binds the exact real turn onto the SAME record and closes it when that turn finishes', () => {
  const { ledger, id } = stagedQueuedLedgerFixture();
  const bound = ledger.bindQueueRelease('queue_fixture_1', 'released-turn-1');
  assert.equal(bound.id, id);
  assert.equal(bound.state, 'received');
  assert.equal(bound.continuationTurnRef, 'released-turn-1');
  assert.equal(bound.continuationQueueItemId, 'queue_fixture_1', 'the queue-item identity is retained as history, not erased');

  ledger.recordContinuationOutcome(GAME, 'released-turn-1', 'completed', 'Queued continuation finished.');
  const finished = ledger.get(id);
  assert.equal(finished.state, 'completed');
  assert.equal(finished.note, 'Queued continuation finished.');
});

test('Q2.13-3. A queue-release event for an unrelated queue item is a no-op — never binds the wrong record', () => {
  const { ledger, id } = stagedQueuedLedgerFixture();
  const bound = ledger.bindQueueRelease('queue_some_other_item', 'released-turn-x');
  assert.equal(bound, undefined);
  const untouched = ledger.get(id);
  assert.equal(untouched.state, 'queued');
  assert.equal(untouched.continuationTurnRef, undefined);
});

test('Q2.13-4. Replayed/duplicate release events are idempotent — a second bind for the same queue item never re-fires or rebinds', () => {
  const { ledger, id } = stagedQueuedLedgerFixture();
  const first = ledger.bindQueueRelease('queue_fixture_1', 'released-turn-1');
  assert.equal(first.state, 'received');
  // A duplicate release notification (e.g. a replayed event after Control
  // Plane replacement) must not find a `queued` record to rebind, and must
  // never overwrite the already-bound turn with a different one.
  const second = ledger.bindQueueRelease('queue_fixture_1', 'released-turn-DIFFERENT');
  assert.equal(second, undefined);
  assert.equal(ledger.get(id).continuationTurnRef, 'released-turn-1', 'the original real turn identity is never overwritten');
});

test('Q2.13-5. Truthful terminal outcomes survive the queue-release path exactly as the immediate path: failed/interrupted/unknown are never upgraded to completed', () => {
  for (const [reported, expected] of [['failed', 'failed'], ['interrupted', 'failed'], ['unknown', 'unknown'], ['blocked', 'blocked'], ['partial', 'partial']]) {
    const { ledger, id } = stagedQueuedLedgerFixture();
    ledger.bindQueueRelease('queue_fixture_1', 'released-turn-1');
    ledger.recordContinuationOutcome(GAME, 'released-turn-1', reported, `Reported ${reported}.`);
    assert.equal(ledger.get(id).state, expected, `${reported} -> ${expected}`);
  }
});

test('Q2.13-6. Field proof: a real Play Queue release binds the real turn, and the real terminal turn event closes the SAME continuation record', async () => {
  const busyWorker = capability('busy-worker-11111111', 'future-worker', { state: 'busy' });
  const h = chainHarness({ players: [busyWorker] });
  try {
    await h.daemon.start();
    assert.equal(await h.client.connect(), true);
    assert.ok(await until(() => h.daemon.registryInstance.getCapabilitiesForGame(GAME).length === 2));

    // A REAL queued Play for this exact busy instance — ordinary manual queueing,
    // reused rather than reinvented, so the release below is real PlayQueue/router
    // behavior, not a simulation.
    const queued = await api(h.daemon.port, h.dir, {
      gameId: GAME, routingMode: 'manual', playerInstanceId: busyWorker.instanceId,
      whenBusy: 'queue', prompt: 'Placeholder queued Play body.'
    });
    assert.equal(queued.body.status, 'queued', JSON.stringify(queued.body));
    const queueItemId = queued.body.queueItemId;
    assert.ok(queueItemId);

    // A Scout continuation record reaches the SAME queued state that
    // continueAfterScout() would have produced had computeContextAwareRoute
    // queued its second dispatch for this same busy instance.
    const ledger = h.daemon.scoutContinuationLedgerInstance;
    const staged = ledger.stage({
      gameId: GAME,
      originalClientRef: 'ref-field-queued',
      originalPrompt: IMPLEMENT_AFTER_RECON,
      originalPlayLabel: 'Medium implementation Play',
      createdAt: Date.now(),
      scoutReason: 'Evidence first.',
      authority: analyzeScoutContinuationAuthority(IMPLEMENT_AFTER_RECON)
    });
    ledger.acceptScout(staged.originalClientRef, 'scout-turn-field-1');
    ledger.recordScoutOutcome({ gameId: GAME, turnRef: 'scout-turn-field-1', outcome: 'COMPLETE', formationId: 'f', reportPath: 'REPORTS/Scout/result.md' });
    ledger.beginContinuation(staged.id, [{ instanceId: busyWorker.instanceId, playerType: busyWorker.playerType, provider: busyWorker.capability.provider, state: 'busy', eligible: true, reason: 'fixture' }]);
    ledger.recordContinuationDispatch(staged.id, { status: 'queued', queueItemId, clientRef: 'client-field-queued-1' });
    assert.equal(ledger.get(staged.id).state, 'queued');

    // The instance becomes free; Coach releases the queue for real.
    h.livePlayers[0] = { ...busyWorker, state: 'ready' };
    h.client.sendCapabilitySnapshot();
    h.client.sendTurnChanged({ instanceId: busyWorker.instanceId, turnRef: 'prior-unrelated-turn', state: 'completed', summary: 'Unrelated prior work finished.', at: Date.now() });

    assert.ok(await until(() => h.delivered.length === 1), 'the queued Play should be released and actually delivered');
    const releasedTurnRef = h.turnRefs[h.turnRefs.length - 1];
    assert.ok(await until(() => ledger.get(staged.id).state === 'received'), 'release must bind the record, not leave it stuck at queued');
    assert.equal(ledger.get(staged.id).continuationTurnRef, releasedTurnRef, 'the exact released turn, not a placeholder');

    // That exact released turn finishes: the SAME record closes truthfully.
    h.client.sendTurnChanged({ instanceId: busyWorker.instanceId, turnRef: releasedTurnRef, state: 'completed', summary: 'Queued continuation complete.', at: Date.now() });
    assert.ok(await until(() => ledger.get(staged.id).state === 'completed'));

    // A replayed/duplicate terminal event for the same turn cannot double-close
    // or corrupt the record.
    h.client.sendTurnChanged({ instanceId: busyWorker.instanceId, turnRef: releasedTurnRef, state: 'failed', summary: 'Replayed duplicate — must not flip a completed record.', at: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(ledger.get(staged.id).state, 'completed', 'a completed record is not reopened by a stray duplicate event');
  } finally {
    h.client.dispose();
    await h.daemon.stop();
    fs.rmSync(h.dir, { recursive: true, force: true });
  }
});
