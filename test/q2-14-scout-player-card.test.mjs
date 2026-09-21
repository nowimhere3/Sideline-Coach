/**
 * Q2.14 — Scout Player Card backend wiring: truthful receiver count exposed
 * BEFORE any receiver runs (never a live per-receiver progress feed, never a
 * guess), and the one small work-ledger seam that lets that count reach the
 * SAME Play-strip summary every other Player's card already uses.
 *
 * Frontend card/strip rendering itself is proven end-to-end against the real
 * production script in test/q2-10f-2-completion-report-ready-acknowledgement.test.mjs
 * (Q2.14-1..5) — not duplicated here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runScoutFormation } from '../out/scout-formation.js';
import { ScoutPlayerAdapter } from '../out/scout-player.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-scout-card-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Durable Reports');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture-game"}\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report(label) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n`;
}

function fakeCandidate(id, { eligible = true, delayMs = 5 } = {}) {
  return {
    id,
    player: `Player-${id}`,
    provider: `Provider-${id}`,
    eligible: () => ({ eligible, reason: 'fixture' }),
    createExecutor: () => ({
      id,
      player: `Player-${id}`,
      harness: 'fixture',
      provider: `Provider-${id}`,
      async execute() {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), exitCode: 0, signal: null, readOnlyContractHeld: true };
      }
    })
  };
}

test('Q2.14-B1. onSelected fires exactly once, synchronously after selection, with the REAL selected count — before any receiver runs', async () => {
  const l = layout();
  try {
    const events = [];
    let receiversStartedAt = [];
    const candidates = [
      { ...fakeCandidate('one', { delayMs: 30 }), createExecutor: () => ({ ...fakeCandidate('one').createExecutor(), async execute() { receiversStartedAt.push(Date.now()); return fakeCandidate('one').createExecutor().execute(); } }) },
      fakeCandidate('two', { delayMs: 30 })
    ];
    const onSelected = (info) => events.push({ ...info, at: Date.now() });
    const completion = await runScoutFormation({
      objective: 'Investigate the bounded fixture surface.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates, onSelected
    });
    assert.equal(events.length, 1, 'fires exactly once per Formation');
    assert.equal(events[0].count, 2, 'the real selected count, not the eligible/discovered count');
    assert.deepEqual([...events[0].candidateIds].sort(), ['one', 'two']);
    assert.equal(completion.scoutsRequested, 2, 'matches the Formation\'s own truth');
  } finally { l.cleanup(); }
});

test('Q2.14-B2. onSelected reflects an explicit bounded formationSize, never the full eligible count', async () => {
  const l = layout();
  try {
    const events = [];
    const candidates = [fakeCandidate('a'), fakeCandidate('b'), fakeCandidate('c')];
    await runScoutFormation({
      objective: 'Investigate the bounded fixture surface.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates, formationSize: 1, onSelected: (info) => events.push(info)
    });
    assert.equal(events[0].count, 1);
  } finally { l.cleanup(); }
});

test('Q2.14-B3. No eligible candidates: onSelected never fires — never a truthful-looking count for a Formation that cannot run', async () => {
  const l = layout();
  try {
    const events = [];
    await assert.rejects(runScoutFormation({
      objective: 'Investigate the bounded fixture surface.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [fakeCandidate('a', { eligible: false })], onSelected: (info) => events.push(info)
    }));
    assert.equal(events.length, 0);
  } finally { l.cleanup(); }
});

test('Q2.14-B4. ScoutPlayerAdapter.execute() forwards onSelected through to the Formation engine unchanged', async () => {
  const l = layout();
  try {
    let observed;
    const adapter = new ScoutPlayerAdapter({
      candidates: [fakeCandidate('solo')],
      runFormation: (request) => {
        request.onSelected?.({ count: 1, candidateIds: ['solo'] });
        return Promise.resolve({
          schemaVersion: 1, formationId: 'fixture', objective: request.objective, canonicalPlayHash: 'sha256:x', semanticPromptHash: 'sha256:y',
          gameRoot: request.gameRoot, workspacePath: path.join(l.gameRoot, 'Scouts', 'fixture'), durablePath: l.durableReportRoot,
          maxConcurrency: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
          candidatesConsidered: [], scoutsRequested: 1, scoutsCompleted: 1, scoutsFailed: 0, scoutsBlocked: 0, scoutsInterrupted: 0, scoutsUnknown: 0,
          outcome: 'COMPLETE', attempts: [], synthesis: { consensus: '', uniqueFindings: [], contradictions: [], missingEvidence: [], failedScouts: [], recommendedNextStep: '' },
          resultPath: path.join(l.durableReportRoot, 'FORMATION-RESULT.md')
        });
      }
    });
    const result = await adapter.execute('Investigate.', l.gameRoot, { onSelected: (info) => { observed = info; } });
    assert.deepEqual(observed, { count: 1, candidateIds: ['solo'] });
    assert.equal(result.outcome, 'COMPLETE');
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------------------
// The work-ledger seam keeps the logical task separate from aggregate worker
// telemetry. Trusted direct dispatch can fill an absent task summary, while a
// real router DispatchRecord remains authoritative.
// ---------------------------------------------------------------------------

test('Q2.14-B5. A trusted Scout turn fills an EMPTY promptSummary and records aggregate activity separately', () => {
  const book = new InstanceWorkLedger(() => 1_000);
  book.recordTurn('g1', { instanceId: 'scout', state: 'accepted', turnRef: 'turn-1' });
  assert.equal(book.get('g1', 'scout').currentPlay.promptSummary, undefined);
  book.recordTurn('g1', { instanceId: 'scout', state: 'started', turnRef: 'turn-1', promptSummary: 'Inspect report handoff', activitySummary: '2 Scouts running' });
  assert.equal(book.get('g1', 'scout').currentPlay.promptSummary, 'Inspect report handoff');
  assert.equal(book.get('g1', 'scout').currentPlay.activitySummary, '2 Scouts running');
});

test('Q2.14-B6. A started event\'s summary never overwrites a real dispatched Play\'s own promptSummary', () => {
  const book = new InstanceWorkLedger(() => 1_000);
  book.recordDispatch({ gameId: 'g1', playerInstanceId: 'codex-11111111', playerType: 'codex', clientRef: 'ref-1', promptSummary: 'Fix the report watcher', at: 1_000 });
  book.recordTurn('g1', { instanceId: 'codex-11111111', state: 'accepted', turnRef: 'turn-1' });
  book.recordTurn('g1', { instanceId: 'codex-11111111', state: 'started', turnRef: 'turn-1', promptSummary: 'something unrelated', activitySummary: '2 workers running' });
  assert.equal(book.get('g1', 'codex-11111111').currentPlay.promptSummary, 'Fix the report watcher', 'the real dispatched Play\'s own summary is never replaced');
  assert.equal(book.get('g1', 'codex-11111111').currentPlay.activitySummary, '2 workers running');
});

test('Q2.14-B7. Repeated started evidence never resets the task summary or elapsed-timer origin', () => {
  const book = new InstanceWorkLedger(() => 1_000);
  book.recordTurn('g1', { instanceId: 'scout', state: 'accepted', turnRef: 'turn-1' });
  book.recordTurn('g1', { instanceId: 'scout', state: 'started', turnRef: 'turn-1', promptSummary: 'Inspect lifecycle', activitySummary: '2 Scouts running' });
  assert.equal(book.get('g1', 'scout').currentPlay.executionStartedAt, 1_000);
  book.recordTurn('g1', { instanceId: 'scout', state: 'started', turnRef: 'turn-1', promptSummary: 'Must not replace', activitySummary: '2 Scouts running' });
  assert.equal(book.get('g1', 'scout').currentPlay.executionStartedAt, 1_000, 'elapsed origin is stamped once, never restarted');
  assert.equal(book.get('g1', 'scout').currentPlay.promptSummary, 'Inspect lifecycle');
});
