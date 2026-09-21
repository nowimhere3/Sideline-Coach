import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCoachRefresh, COACH_REFRESH_LIMITS } from '../out/scout-coach-refresh.js';
import { combineDerivedFormationCandidates } from '../out/scout-combine-formation-bridge.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-coach-refresh-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Durable Reports');
  const scorecardsDir = path.join(durableReportRoot, 'Combine', 'Scorecards');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.mkdirSync(scorecardsDir, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"refresh-fixture"}\n');
  return { root, gameRoot, durableReportRoot, scorecardsDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function prospect(id) {
  return { candidateId: id, provider: 'openrouter', model: `openrouter/vendor/${id}:free`, displayName: `Prospect ${id}`, harness: 'opencode', discoveredAt: '2026-09-01T00:00:00.000Z', advertisedFree: true, supportsTools: true, sourceEvidence: 'fixture' };
}

function discovery(ids) {
  const prospects = ids.map(prospect);
  return { discoveredAt: '2026-09-17T00:00:00.000Z', prospects, sources: [{ id: 'openrouter', available: true, count: prospects.length }, { id: 'opencode-hosted', available: true, count: 0 }] };
}

function writeScorecard(dir, id, overrides = {}) {
  const card = {
    schemaVersion: 1, candidateId: id, provider: 'openrouter', model: `openrouter/vendor/${id}:free`, displayName: `Prospect ${id}`, harness: 'opencode',
    firstSeen: '2026-09-01T00:00:00.000Z', lastSeen: '2026-09-16T00:00:00.000Z', lastTryoutAt: '2026-09-16T00:00:00.000Z', currentStatus: 'READY',
    totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
    routeAttempts: { C: { attempts: 1, completions: 1 } }, latestEvidencePaths: [], latestObservedRoute: `openrouter/vendor/${id}:free`, notes: [], ...overrides
  };
  fs.writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(card, null, 2)}\n`);
}

function report(id) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${id}\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n`;
}

function complete(id) {
  return { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-17T12:00:00.000Z', endedAt: '2026-09-17T12:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
}

function executorFactory(run) {
  return (candidate) => ({ id: candidate.candidateId, player: candidate.displayName, harness: 'OpenCode', provider: 'OpenRouter', execute: () => run(candidate) });
}

test('CoachRefresh-1. No due candidates is a successful measured no-op and a current READY Scout is not hammered', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'ready-current');
    let starts = 0;
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['ready-current']), now: () => new Date('2026-09-17T00:00:00.000Z'),
      executorFactory: executorFactory(() => { starts += 1; return complete('unexpected'); })
    });
    assert.equal(completion.selectionPolicy, 'refresh-due');
    assert.equal(completion.prospectsDue, 0);
    assert.equal(completion.prospectsSelected, 0);
    assert.equal(starts, 0);
    assert.equal(completion.scorecardUpdates.length, 0);
    assert.equal(completion.readyDepthChartChanged, false);
    assert.match(fs.readFileSync(completion.resultPath, 'utf8'), /none \(clean no-op\)/);
  } finally { l.cleanup(); }
});

test('CoachRefresh-2. Existing callback and staleness rules are honored without immediate retries', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'recent-callback', { currentStatus: 'CALL BACK LATER' });
    writeScorecard(l.scorecardsDir, 'recent-unknown', { currentStatus: 'UNKNOWN' });
    writeScorecard(l.scorecardsDir, 'stale-callback', { currentStatus: 'CALL BACK LATER', lastTryoutAt: '2026-09-01T00:00:00.000Z' });
    writeScorecard(l.scorecardsDir, 'stale-ready', { lastTryoutAt: '2026-09-01T00:00:00.000Z' });
    const started = [];
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['recent-callback', 'recent-unknown', 'stale-callback', 'stale-ready']),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
      executorFactory: executorFactory((candidate) => { started.push(candidate.candidateId); return complete(candidate.candidateId); })
    });
    assert.deepEqual(started.sort(), ['stale-callback', 'stale-ready']);
    assert.equal(completion.prospectsDue, 2);
    assert.equal(completion.candidatesConsidered.find((entry) => entry.candidateId === 'recent-callback').due, false);
    assert.equal(completion.candidatesConsidered.find((entry) => entry.candidateId === 'stale-ready').due, true);
  } finally { l.cleanup(); }
});

test('CoachRefresh-3. Candidate count and concurrency stay hard-bounded even when a caller asks for more', async () => {
  const l = layout();
  try {
    let active = 0;
    let maxActive = 0;
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
      budget: { maxTryouts: 100, maxConcurrency: 100 },
      executorFactory: executorFactory(async (candidate) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return complete(candidate.candidateId);
      })
    });
    assert.equal(completion.prospectsSelected, COACH_REFRESH_LIMITS.maxTryouts);
    assert.equal(completion.maxTryouts, COACH_REFRESH_LIMITS.maxTryouts);
    assert.equal(completion.maxConcurrency, COACH_REFRESH_LIMITS.maxConcurrency);
    assert.ok(maxActive <= COACH_REFRESH_LIMITS.maxConcurrency);
  } finally { l.cleanup(); }
});

test('CoachRefresh-4. A failed provider is isolated; Combine writes scorecards and Formation sees a newly READY unknown identity', async () => {
  const l = layout();
  try {
    const newId = 'never-hardcoded-model';
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['provider-failure', newId]),
      executorFactory: executorFactory((candidate) => {
        if (candidate.candidateId === 'provider-failure') throw new Error('provider fixture unavailable');
        return complete(candidate.candidateId);
      })
    });
    assert.equal(completion.attempts.find((attempt) => attempt.executorId === 'provider-failure').completionState, 'FAILED');
    assert.equal(completion.scorecardUpdates.find((entry) => entry.candidateId === 'provider-failure').status, 'CALL BACK LATER');
    assert.equal(completion.scorecardUpdates.find((entry) => entry.candidateId === newId).status, 'READY');
    assert.equal(JSON.parse(fs.readFileSync(path.join(l.scorecardsDir, `${newId}.json`), 'utf8')).currentStatus, 'READY');
    assert.equal(completion.readyDepthChartChanged, true);

    const formationCandidate = combineDerivedFormationCandidates(l.durableReportRoot).find((candidate) => candidate.id === newId);
    assert.ok(formationCandidate, 'Formation discovers the new scorecard without a hardcoded identity or refresh-specific wiring');
    assert.equal(formationCandidate.eligible({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, env: process.env }).eligible, true);
  } finally { l.cleanup(); }
});

test('CoachRefresh-5. Invalid caller budgets fail closed instead of disabling the bound', async () => {
  const l = layout();
  try {
    await assert.rejects(runCoachRefresh({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery: discovery(['one']), budget: { maxTryouts: 0 } }), /positive integer/);
  } finally { l.cleanup(); }
});

test('CoachRefresh-6. Current READY and LIMITED evidence remains protected when it has no invalidated infrastructure boundary', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'ready-current');
    writeScorecard(l.scorecardsDir, 'limited-current', { currentStatus: 'LIMITED' });
    let starts = 0;
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['ready-current', 'limited-current']),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {},
      executorFactory: executorFactory(() => { starts += 1; return complete('unexpected'); })
    });
    assert.equal(completion.prospectsDue, 0);
    assert.equal(starts, 0);
    assert.match(completion.candidatesConsidered.find((entry) => entry.candidateId === 'limited-current').reason, /staleness window/);
  } finally { l.cleanup(); }
});

test('CoachRefresh-7. Matching pre-repair OpenRouter evidence becomes due early without rewriting historical counters', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'stranded', {
      currentStatus: 'CALL BACK LATER',
      totals: { starts: 4, completions: 0, failures: 4, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
      notes: ['2026-09-16T00:00:00.000Z: Error: {']
    });
    let starts = 0;
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['stranded']), now: () => new Date('2026-09-17T00:00:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {},
      executorFactory: executorFactory(() => {
        const before = JSON.parse(fs.readFileSync(path.join(l.scorecardsDir, 'stranded.json'), 'utf8'));
        assert.equal(before.totals.starts, 4, 'selection itself must not mutate game-film counters');
        starts += 1;
        return complete('stranded');
      })
    });
    const consideration = completion.candidatesConsidered.find((entry) => entry.candidateId === 'stranded');
    assert.equal(consideration.due, true);
    assert.match(consideration.reason, /pre-repair OpenRouter\/OpenCode execution environment/);
    assert.equal(starts, 1);
    const after = JSON.parse(fs.readFileSync(path.join(l.scorecardsDir, 'stranded.json'), 'utf8'));
    assert.equal(after.currentStatus, 'READY');
    assert.deepEqual(after.totals, { starts: 5, completions: 1, failures: 4, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 });
    assert.equal(after.qualificationEvidence.scope, 'openrouter/opencode');
  } finally { l.cleanup(); }
});

test('CoachRefresh-8. Unrelated harness evidence and explicit hosted-tier FIELD_BLOCKED truth are not invalidated', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'other-provider', {
      provider: 'opencode-hosted', model: 'opencode/big-pickle', currentStatus: 'CALL BACK LATER',
      notes: ['2026-09-16T00:00:00.000Z: Error: {']
    });
    writeScorecard(l.scorecardsDir, 'field-blocked', {
      currentStatus: 'UNAVAILABLE', availabilityEvidence: { state: 'FIELD_BLOCKED', observedAt: '2026-09-16T00:00:00.000Z' },
      notes: ['OpenCode free tier can only be used from within OpenCode.']
    });
    const mixedDiscovery = discovery(['field-blocked']);
    const completion = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: { ...mixedDiscovery, prospects: [...mixedDiscovery.prospects, { ...prospect('other-provider'), provider: 'opencode-hosted', model: 'opencode/big-pickle' }] },
      now: () => new Date('2026-09-17T00:00:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {},
      executorFactory: executorFactory(() => { throw new Error('must not execute'); })
    });
    assert.equal(completion.prospectsDue, 0);
    assert.equal(completion.prospectsSelected, 0);
  } finally { l.cleanup(); }
});

test('CoachRefresh-9. A truthful failed requalification records the current execution contract and cannot loop immediately', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'provider-boundary', {
      currentStatus: 'PROVIDER UNSTABLE',
      notes: ['AUTH ISSUE: OPENROUTER_API_KEY is not available to the isolated OpenCode Scout process.']
    });
    let starts = 0;
    const failedExecutor = executorFactory(() => {
      starts += 1;
      return { state: 'BLOCKED', stdout: '', stderr: 'provider unavailable', model: 'fixture', startedAt: '2026-09-17T12:00:00.000Z', endedAt: '2026-09-17T12:00:01.000Z', exitCode: 1, signal: null, readOnlyContractHeld: true, providerError: 'provider temporarily unavailable', failureBoundary: 'provider temporarily unavailable' };
    });
    const first = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['provider-boundary']), now: () => new Date('2026-09-17T12:00:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {}, executorFactory: failedExecutor
    });
    assert.equal(first.scorecardUpdates.find((entry) => entry.candidateId === 'provider-boundary').status, 'PROVIDER UNSTABLE');
    assert.equal(starts, 1);
    const second = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['provider-boundary']), now: () => new Date('2026-09-17T12:01:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {}, executorFactory: failedExecutor
    });
    assert.equal(second.prospectsDue, 0);
    assert.equal(second.prospectsSelected, 0);
    assert.equal(starts, 1);
  } finally { l.cleanup(); }
});

test('CoachRefresh-10. A missing-credential attempt clears only representativeness so credential restoration can requalify early', async () => {
  const l = layout();
  try {
    writeScorecard(l.scorecardsDir, 'credential-return', {
      currentStatus: 'READY', lastTryoutAt: '2026-09-01T00:00:00.000Z',
      qualificationEvidence: { scope: 'openrouter/opencode', revision: 'authenticated-isolated-opencode-v1', observedAt: '2026-09-01T00:00:00.000Z' }
    });
    const missing = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['credential-return']), now: () => new Date('2026-09-17T12:00:00.000Z'),
      processEnvironment: {},
      executorFactory: executorFactory(() => ({ state: 'BLOCKED', stdout: '', stderr: 'credential missing', model: 'fixture', startedAt: '2026-09-17T12:00:00.000Z', endedAt: '2026-09-17T12:00:01.000Z', exitCode: null, signal: null, readOnlyContractHeld: true, providerError: 'OPENROUTER_API_KEY is not available to the isolated OpenCode Scout process.', failureBoundary: 'AUTH ISSUE: OPENROUTER_API_KEY is not available to the isolated OpenCode Scout process.' }))
    });
    assert.equal(missing.scorecardUpdates.find((entry) => entry.candidateId === 'credential-return').status, 'AUTH ISSUE');
    const afterMissing = JSON.parse(fs.readFileSync(path.join(l.scorecardsDir, 'credential-return.json'), 'utf8'));
    assert.equal(Object.hasOwn(afterMissing, 'qualificationEvidence'), false);

    let starts = 0;
    const restored = await runCoachRefresh({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: discovery(['credential-return']), now: () => new Date('2026-09-17T12:01:00.000Z'),
      resolveOpenRouterApiKey: async () => 'fixture-secret', processEnvironment: {},
      executorFactory: executorFactory(() => { starts += 1; return complete('credential-return'); })
    });
    assert.equal(restored.candidatesConsidered.find((entry) => entry.candidateId === 'credential-return').due, true);
    assert.equal(starts, 1);
  } finally { l.cleanup(); }
});
