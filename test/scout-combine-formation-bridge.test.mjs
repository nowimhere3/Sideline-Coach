/**
 * Combine -> Formation bridge (V0.4).
 *
 * Proves the wiring, not the Combine or the Formation dispatcher again (both
 * already have their own suites). Scorecards are hand-written fixtures on
 * disk — no real Combine run, no real OpenCode process — so these tests are
 * fast and hermetic while exercising the REAL bridge function and the REAL
 * Formation selection/dispatch path.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { combineDerivedFormationCandidates } from '../out/scout-combine-formation-bridge.js';
import { runScoutFormation } from '../out/scout-formation.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-combine-bridge-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Durable Reports');
  const scorecardsDir = path.join(durableReportRoot, 'Combine', 'Scorecards');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.mkdirSync(scorecardsDir, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture-game"}\n');
  return { root, gameRoot, durableReportRoot, scorecardsDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function writeScorecard(dir, id, overrides = {}) {
  const card = {
    schemaVersion: 1,
    candidateId: id,
    provider: 'opencode-hosted',
    model: `opencode/${id}`,
    displayName: `Prospect ${id}`,
    harness: 'opencode',
    firstSeen: '2026-09-17T00:00:00.000Z',
    lastSeen: '2026-09-17T00:00:00.000Z',
    lastTryoutAt: '2026-09-17T00:00:00.000Z',
    currentStatus: 'READY',
    totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
    routeAttempts: { C: { attempts: 1, completions: 1 } },
    latestEvidencePaths: [],
    latestObservedRoute: `opencode/${id}`,
    notes: [],
    ...overrides
  };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(card, null, 2));
  return card;
}

function report(label) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n`;
}

function fakeBuiltIn(id, { outcome } = {}) {
  return {
    id,
    player: `Player-${id}`,
    provider: `Provider-${id}`,
    eligible() { return { eligible: true, reason: 'fixture eligible' }; },
    createExecutor() {
      return {
        id,
        player: `Player-${id}`,
        harness: 'fixture-harness',
        provider: `Provider-${id}`,
        async execute(envelope) {
          return outcome ? outcome(envelope) : { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-17T13:00:00.000Z', endedAt: '2026-09-17T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
        }
      };
    }
  };
}

test('Bridge-1. A READY Combine scorecard becomes a Formation candidate with correct provider/model identity — never a hardcoded name', () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'big-pickle', { provider: 'opencode-hosted', model: 'opencode/big-pickle', displayName: 'Big Pickle' });
    writeScorecard(l.scorecardsDir, 'exotic-new-model', { provider: 'openrouter', model: 'openrouter/some-vendor/exotic:free', displayName: 'Exotic New Model' });
    const candidates = combineDerivedFormationCandidates(l.durableReportRoot);
    assert.equal(candidates.length, 2, 'one FormationCandidate per scorecard on disk, whatever it currently contains');
    const pickle = candidates.find((c) => c.id === 'big-pickle');
    assert.equal(pickle.player, 'Big Pickle');
    assert.equal(pickle.provider, 'OpenCode Zen');
    const exotic = candidates.find((c) => c.id === 'exotic-new-model');
    assert.equal(exotic.provider, 'OpenRouter');
    const executor = exotic.createExecutor();
    assert.equal(executor.id, 'exotic-new-model');
    assert.equal(executor.provider, 'OpenRouter', 'the executor route identity comes from the scorecard, not any hardcoded list');
  } finally { l.cleanup(); }
});

test('Bridge-8. A real Formation infrastructure block suspends stale READY truth through Combine authority without negative Player film', async () => {
  const l = layout();
  try {
    const before = writeScorecard(l.scorecardsDir, 'hosted-blocked', { currentStatus: 'READY', displayName: 'Hosted Blocked' });
    const candidate = combineDerivedFormationCandidates(l.durableReportRoot)[0];
    candidate.createExecutor = () => ({
      id: candidate.id, player: candidate.player, harness: 'OpenCode', provider: candidate.provider,
      async execute() {
        return {
          state: 'BLOCKED', stdout: '', stderr: "OpenCode's free tier can only be used from within OpenCode", model: 'opencode/hosted-blocked',
          startedAt: '2026-09-18T00:00:00.000Z', endedAt: '2026-09-18T00:00:01.000Z', exitCode: 1, signal: null, readOnlyContractHeld: true,
          providerError: "OpenCode's free tier can only be used from within OpenCode", failureBoundary: "OpenCode's free tier can only be used from within OpenCode"
        };
      }
    });
    const completion = await runScoutFormation({
      objective: 'Prove the current hosted receiver fieldability boundary.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [candidate], players: ['hosted-blocked']
    });
    assert.equal(completion.outcome, 'BLOCKED');
    const after = JSON.parse(fs.readFileSync(path.join(l.scorecardsDir, 'hosted-blocked.json'), 'utf8'));
    assert.equal(after.currentStatus, 'UNAVAILABLE');
    assert.equal(after.availabilityEvidence.state, 'FIELD_BLOCKED');
    assert.deepEqual(after.totals, before.totals, 'infrastructure field evidence does not become negative Player-quality film');
    assert.match(after.notes[0], /Real Formation execution was BLOCKED/);
    const context = { gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: process.env };
    assert.equal(candidate.eligible(context).eligible, false, 'the same bridge immediately sees canonical suspended readiness');
  } finally { l.cleanup(); }
});

test('Bridge-2. Eligibility is decided by the scorecard\'s CURRENT status, re-read fresh — READY is eligible, everything else is not', () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'ready-one', { currentStatus: 'READY' });
    writeScorecard(l.scorecardsDir, 'limited-one', { currentStatus: 'LIMITED' });
    writeScorecard(l.scorecardsDir, 'unknown-one', { currentStatus: 'UNKNOWN' });
    writeScorecard(l.scorecardsDir, 'callback-one', { currentStatus: 'CALL BACK LATER' });
    const context = { gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: process.env };
    const candidates = combineDerivedFormationCandidates(l.durableReportRoot);
    const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
    assert.equal(byId['ready-one'].eligible(context).eligible, true);
    for (const id of ['limited-one', 'unknown-one', 'callback-one']) {
      const result = byId[id].eligible(context);
      assert.equal(result.eligible, false, `${id} must not be automatically eligible`);
      assert.match(result.reason, new RegExp(id === 'limited-one' ? 'LIMITED' : id === 'unknown-one' ? 'UNKNOWN' : 'CALL BACK LATER'));
    }
  } finally { l.cleanup(); }
});

test('Bridge-3. A READY scorecard missing its provider/model/harness contract is treated as ineligible, never guessed', () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'broken', { currentStatus: 'READY', model: '' });
    const context = { gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: process.env };
    const candidates = combineDerivedFormationCandidates(l.durableReportRoot);
    const result = candidates[0].eligible(context);
    assert.equal(result.eligible, false);
    assert.match(result.reason, /UNKNOWN/);
  } finally { l.cleanup(); }
});

test('Bridge-4. Eligibility is re-read fresh: a status change between discovery and Formation dispatch is honored with no code change', () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'flaky', { currentStatus: 'READY' });
    const candidates = combineDerivedFormationCandidates(l.durableReportRoot);
    const context = { gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: process.env };
    assert.equal(candidates[0].eligible(context).eligible, true);
    // A later Combine tryout demotes it — no restart, no re-discovery call needed.
    writeScorecard(l.scorecardsDir, 'flaky', { currentStatus: 'CALL BACK LATER' });
    assert.equal(candidates[0].eligible(context).eligible, false, 'the SAME candidate object reflects the new scorecard state');
  } finally { l.cleanup(); }
});

test('Bridge-5. End-to-end: a real bridge-produced candidate is selected alongside a built-in, receives the identical canonical Play, and explicit human selection still outranks automatic selection', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'combo-scout', { currentStatus: 'READY', displayName: 'Combo Scout' });
    const seenEnvelopes = [];
    const combo = combineDerivedFormationCandidates(l.durableReportRoot)[0];
    combo.createExecutor = () => ({
      id: combo.id, player: combo.player, harness: 'fixture-harness', provider: combo.provider,
      async execute(envelope) { seenEnvelopes.push(envelope); return { state: 'COMPLETE', stdout: report('combo'), stderr: '', model: 'combo-model', startedAt: '2026-09-17T13:00:00.000Z', endedAt: '2026-09-17T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true }; }
    });
    const builtIn = fakeBuiltIn('anti', { outcome: (envelope) => { seenEnvelopes.push(envelope); return { state: 'COMPLETE', stdout: report('anti'), stderr: '', model: 'anti-model', startedAt: '2026-09-17T13:00:00.000Z', endedAt: '2026-09-17T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true }; } });

    const completion = await runScoutFormation({
      objective: 'Investigate the bounded fixture surface.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [builtIn, combo]
    });
    assert.equal(completion.scoutsRequested, 2);
    assert.deepEqual(new Set(completion.attempts.map((a) => a.executorId)), new Set(['anti', 'combo-scout']));
    assert.equal(seenEnvelopes.length, 2);
    assert.equal(seenEnvelopes[0].playHash, seenEnvelopes[1].playHash, 'both receivers get the identical canonical Play');

    // Explicit human selection still outranks automatic eligibility.
    const explicit = await runScoutFormation({
      objective: 'Investigate the bounded fixture surface, take two.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [builtIn, combo],
      players: ['combo-scout']
    });
    assert.equal(explicit.scoutsRequested, 1);
    assert.equal(explicit.attempts[0].executorId, 'combo-scout');
  } finally { l.cleanup(); }
});

test('Bridge-6. A Combine-derived receiver failing never corrupts the built-in receiver\'s independent evidence', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'flaky-combo', { currentStatus: 'READY' });
    const combo = combineDerivedFormationCandidates(l.durableReportRoot)[0];
    combo.createExecutor = () => ({
      id: combo.id, player: combo.player, harness: 'fixture-harness', provider: combo.provider,
      async execute() { throw new Error('combo executor exploded'); }
    });
    const builtIn = fakeBuiltIn('steady');

    const completion = await runScoutFormation({
      objective: 'Investigate the bounded fixture surface.',
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      candidates: [builtIn, combo]
    });
    const steady = completion.attempts.find((a) => a.executorId === 'steady');
    const flaky = completion.attempts.find((a) => a.executorId === 'flaky-combo');
    assert.equal(steady.completionState, 'COMPLETE');
    assert.ok(steady.durableReportPath && fs.existsSync(steady.durableReportPath));
    assert.equal(flaky.completionState, 'FAILED');
    assert.equal(completion.outcome, 'PARTIAL');
  } finally { l.cleanup(); }
});

test('Bridge-7. With no scorecards on disk at all, the bridge contributes zero candidates — never a crash', () => {
  const l = layout();
  fs.rmSync(l.scorecardsDir, { recursive: true, force: true });
  try {
    const candidates = combineDerivedFormationCandidates(l.durableReportRoot);
    assert.deepEqual(candidates, []);
  } finally { l.cleanup(); }
});
