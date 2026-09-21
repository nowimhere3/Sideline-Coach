import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runScoutCombine, freshCombineId, deriveCombineStatus, createCombineExecutor, TRYOUT_ROUTES } from '../out/scout-combine.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(testDir, 'fixtures', 'fake-opencode-cli.mjs');

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-combine-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Durable Reports');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture-game"}\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report() {
  return 'This report is reconnaissance, not final architectural authority.\n# Executive answer\nOK\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n';
}

function prospect(id, overrides = {}) {
  return {
    candidateId: id,
    provider: 'openrouter',
    model: `openrouter/${id}`,
    displayName: `Prospect ${id}`,
    harness: 'opencode',
    discoveredAt: '2026-09-17T00:00:00.000Z',
    advertisedFree: true,
    supportsTools: true,
    sourceEvidence: 'fixture',
    ...overrides
  };
}

function fakeDiscovery(prospects) {
  return { discoveredAt: new Date().toISOString(), prospects, sources: [{ id: 'openrouter', available: true, count: prospects.length }, { id: 'opencode-hosted', available: true, count: 0 }] };
}

function fakeExecutorFactory(outcomeFor) {
  return (candidate) => ({
    id: candidate.candidateId,
    player: candidate.displayName,
    harness: 'OpenCode',
    provider: 'OpenRouter',
    async execute() { return outcomeFor(candidate); }
  });
}

const COMPLETE_OUTCOME = { state: 'COMPLETE', stdout: report(), stderr: '', model: 'x', startedAt: '2026-09-17T00:00:00.000Z', endedAt: '2026-09-17T00:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };

test('Combine-1. A fresh Combine identity is generated automatically and is filesystem-safe', () => {
  const id = freshCombineId(new Date('2026-09-17T13:41:00.000Z'));
  assert.match(id, /^Combine__\d{4}-\d{2}-\d{2}_\d{6}_\d{3}_[A-Za-z0-9+-]+$/);
});

test('Combine-2. Tryout routes A/B/C are all defined but the funnel dispatches Route C by default', async () => {
  assert.deepEqual(Object.keys(TRYOUT_ROUTES).sort(), ['A', 'B', 'C']);
  const l = layout();
  try {
    const seen = [];
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('one')]),
      executorFactory: fakeExecutorFactory((candidate) => { seen.push(candidate.candidateId); return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.route, 'C');
    assert.deepEqual(seen, ['one']);
  } finally { l.cleanup(); }
});

test('Combine-3. Bounded tryout budget: more prospects than the budget never all run', async () => {
  const l = layout();
  try {
    const prospects = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => prospect(id));
    let started = 0;
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery(prospects),
      budget: { maxTryouts: 3, maxConcurrency: 2 },
      executorFactory: fakeExecutorFactory(() => { started += 1; return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.prospectsDiscovered, 7);
    assert.equal(completion.prospectsSelected, 3);
    assert.equal(started, 3, 'never more tryouts than the budget, regardless of how many were discovered');
  } finally { l.cleanup(); }
});

test('Combine-3b. An explicit budget of { maxTryouts: undefined } (a CLI flag simply not passed) still falls back to the default budget, never an unbounded sweep', async () => {
  const l = layout();
  try {
    const prospects = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => prospect(id));
    let started = 0;
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery(prospects),
      // Mirrors exactly what the CLI used to build when neither --max-tryouts
      // nor --max-concurrency was passed — an explicit-undefined key, not a
      // missing one. A naive { ...DEFAULT_BUDGET, ...request.budget } spread
      // lets `undefined` win and silently disables the budget entirely.
      budget: { maxTryouts: undefined, maxConcurrency: undefined },
      executorFactory: fakeExecutorFactory(() => { started += 1; return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.prospectsDiscovered, 8);
    assert.equal(completion.prospectsSelected, 5, 'the documented default (5), not every discovered prospect');
    assert.equal(started, 5);
  } finally { l.cleanup(); }
});

test('Combine-4. Selection prioritizes newly-discovered, then stale, then callback, over recently-proven candidates', async () => {
  const l = layout();
  try {
    const now = new Date('2026-09-17T00:00:00.000Z');
    const scorecardsDir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(scorecardsDir, { recursive: true });
    const writeScorecard = (id, overrides) => fs.writeFileSync(path.join(scorecardsDir, `${id}.json`), JSON.stringify({
      schemaVersion: 1, candidateId: id, provider: 'openrouter', model: `openrouter/${id}`, displayName: id, harness: 'opencode',
      firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', lastTryoutAt: '2026-09-16T00:00:00.000Z',
      currentStatus: 'READY', totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
      routeAttempts: {}, latestEvidencePaths: [], latestObservedRoute: `openrouter/${id}`, notes: [], ...overrides
    }));
    // "proven" was tried yesterday and is READY (lowest priority).
    writeScorecard('proven', {});
    // "callback" was tried yesterday but needs another try.
    writeScorecard('callback', { currentStatus: 'RATE LIMITED' });
    // "stale" has ancient evidence.
    writeScorecard('stale', { lastTryoutAt: '2020-01-01T00:00:00.000Z' });
    // "fresh" has no scorecard at all (newly discovered) — highest priority.

    const order = [];
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('proven'), prospect('callback'), prospect('stale'), prospect('fresh')]),
      budget: { maxTryouts: 3, maxConcurrency: 1 },
      now: () => now,
      executorFactory: fakeExecutorFactory((candidate) => { order.push(candidate.candidateId); return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.prospectsSelected, 3);
    assert.deepEqual(order, ['fresh', 'stale', 'callback'], 'proven (lowest priority) is the one excluded by the budget');
  } finally { l.cleanup(); }
});

test('Combine-5. One prospect throwing never corrupts another prospect\'s evidence or scorecard', async () => {
  const l = layout();
  try {
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('boom'), prospect('fine')]),
      executorFactory: fakeExecutorFactory((candidate) => {
        if (candidate.candidateId === 'boom') throw new Error('executor exploded');
        return COMPLETE_OUTCOME;
      })
    });
    const boom = completion.attempts.find((a) => a.executorId === 'boom');
    const fine = completion.attempts.find((a) => a.executorId === 'fine');
    assert.equal(boom.completionState, 'FAILED');
    assert.match(boom.failureBoundary, /threw before returning/);
    assert.equal(fine.completionState, 'COMPLETE');
    assert.ok(fs.existsSync(path.join(completion.scorecardsPath, 'fine.json')));
    const fineCard = JSON.parse(fs.readFileSync(path.join(completion.scorecardsPath, 'fine.json'), 'utf8'));
    assert.equal(fineCard.currentStatus, 'READY');
  } finally { l.cleanup(); }
});

test('Combine-6. deriveCombineStatus separates provider/auth/rate-limit conditions from a genuine hard failure, and never cuts a Player', () => {
  assert.equal(deriveCombineStatus({ completionState: 'COMPLETE', reportCreated: true, readOnlyContractHeld: true, evaluation: { reportStructurallyUsable: true, significantEvidenceMissing: null, obviousUnsupportedClaim: null } }), 'READY');
  assert.equal(deriveCombineStatus({ completionState: 'COMPLETE', evaluation: { reportStructurallyUsable: false } }), 'LIMITED');
  assert.equal(deriveCombineStatus({ completionState: 'BLOCKED', failureBoundary: 'Error: Provider not found: openrouter', evaluation: {} }), 'AUTH ISSUE');
  assert.equal(deriveCombineStatus({ completionState: 'BLOCKED', failureBoundary: 'AUTH ISSUE: OPENROUTER_API_KEY is missing', evaluation: {} }), 'AUTH ISSUE');
  assert.equal(deriveCombineStatus({ completionState: 'BLOCKED', failureBoundary: 'rate limit exceeded (429)', evaluation: {} }), 'RATE LIMITED');
  assert.equal(deriveCombineStatus({ completionState: 'BLOCKED', failureBoundary: "OpenCode's free tier can only be used from within OpenCode", evaluation: {} }), 'UNAVAILABLE');
  assert.equal(deriveCombineStatus({ completionState: 'BLOCKED', failureBoundary: 'some other provider hiccup', evaluation: {} }), 'PROVIDER UNSTABLE');
  assert.equal(deriveCombineStatus({ completionState: 'FAILED', evaluation: {} }), 'CALL BACK LATER', 'a hard failure earns a reversible callback, never CUT FROM TEAM');
  assert.equal(deriveCombineStatus({ completionState: 'INTERRUPTED', evaluation: {} }), 'UNKNOWN');
});

test('Combine-7. Scorecards accumulate across runs at a deterministic path and never erase prior evidence', async () => {
  const l = layout();
  try {
    const first = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('repeat')]),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
      executorFactory: fakeExecutorFactory(() => ({ ...COMPLETE_OUTCOME }))
    });
    const cardPath = path.join(l.durableReportRoot, 'Combine', 'Scorecards', 'repeat.json');
    assert.equal(cardPath, path.join(first.scorecardsPath, 'repeat.json'));
    const afterFirst = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    assert.equal(afterFirst.totals.starts, 1);
    assert.equal(afterFirst.totals.completions, 1);
    assert.equal(afterFirst.firstSeen, '2026-09-17T00:00:00.000Z');

    const failing = { state: 'FAILED', stdout: '', stderr: 'boom', model: 'x', startedAt: '2026-09-18T00:00:00.000Z', endedAt: '2026-09-18T00:00:01.000Z', exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'contract violation' };
    await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('repeat')]),
      now: () => new Date('2026-09-18T00:00:00.000Z'),
      executorFactory: fakeExecutorFactory(() => failing)
    });
    const afterSecond = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    assert.equal(afterSecond.totals.starts, 2, 'counters accumulate rather than reset');
    assert.equal(afterSecond.totals.completions, 1, 'the prior completion is not erased by a later failure');
    assert.equal(afterSecond.totals.failures, 1);
    assert.equal(afterSecond.firstSeen, '2026-09-17T00:00:00.000Z', 'firstSeen never regresses');
    assert.equal(afterSecond.currentStatus, 'CALL BACK LATER');
    assert.ok(afterSecond.notes.some((note) => note.includes('contract violation')), 'the new failure is recorded');
  } finally { l.cleanup(); }
});

test('Combine-8. Running the same Combine identity twice refuses to silently overwrite prior evidence', async () => {
  const l = layout();
  try {
    const now = () => new Date('2026-09-17T00:00:00.000Z');
    await runScoutCombine({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery: fakeDiscovery([prospect('one')]), now, executorFactory: fakeExecutorFactory(() => COMPLETE_OUTCOME) });
    await assert.rejects(
      runScoutCombine({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery: fakeDiscovery([prospect('one')]), now, executorFactory: fakeExecutorFactory(() => COMPLETE_OUTCOME) }),
      /already exists/
    );
  } finally { l.cleanup(); }
});

test('Combine-9. Discovery source availability failures are preserved in the Combine result, never silently dropped', async () => {
  const l = layout();
  try {
    const discovery = { discoveredAt: new Date().toISOString(), prospects: [], sources: [{ id: 'openrouter', available: false, count: 0, error: 'network unreachable' }, { id: 'opencode-hosted', available: false, count: 0, error: 'Database is not empty and has no session table' }] };
    const completion = await runScoutCombine({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery });
    assert.equal(completion.prospectsDiscovered, 0);
    assert.equal(completion.prospectsSelected, 0);
    assert.deepEqual(completion.discovery.sources.map((s) => s.available), [false, false]);
    const markdown = fs.readFileSync(completion.resultPath, 'utf8');
    assert.match(markdown, /network unreachable/);
    assert.match(markdown, /Database is not empty/);
  } finally { l.cleanup(); }
});

test('Combine-10. createCombineExecutor: the real read-only agent contract is written and validated (reused, never a second permission system)', async () => {
  const l = layout();
  try {
    const executor = createCombineExecutor(prospect('fixture-model'), 'Bounded Evidence Answer tryout', {
      opencodeExecutable: process.execPath,
      prefixArgs: [fixture],
      env: { FAKE_OPENCODE_MODE: 'complete', OPENROUTER_API_KEY: 'fixture-key' }
    });
    const outcome = await executor.execute({ semanticPrompt: 'go', play: { playId: 'p1' }, playHash: 'h', semanticPromptHash: 'sh' }, { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt-complete') });
    assert.equal(outcome.state, 'COMPLETE');
    assert.equal(outcome.readOnlyContractHeld, true);
    assert.ok(fs.existsSync(path.join(l.root, 'attempt-complete', '.opencode-combine', 'agents', 'sideline-combine-scout.md')));
  } finally { l.cleanup(); }
});

test('Combine-11. createCombineExecutor classifies a real auth-blocked OpenCode failure as BLOCKED with the provider text preserved', async () => {
  const l = layout();
  try {
    const executor = createCombineExecutor(prospect('fixture-model'), 'Bounded Evidence Answer tryout', {
      opencodeExecutable: process.execPath,
      prefixArgs: [fixture],
      env: { FAKE_OPENCODE_MODE: 'auth-blocked', OPENROUTER_API_KEY: 'fixture-key' }
    });
    const outcome = await executor.execute({ semanticPrompt: 'go', play: { playId: 'p1' }, playHash: 'h', semanticPromptHash: 'sh' }, { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt-auth') });
    assert.equal(outcome.state, 'BLOCKED');
    assert.match(outcome.providerError, /Provider not found: openrouter/);
  } finally { l.cleanup(); }
});

test('Combine-12. A COMPLETE-but-not-structurally-usable tryout scores LIMITED end-to-end, not READY and not a hard failure', async () => {
  const l = layout();
  try {
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('fixture-model')]),
      executorFactory: (candidate, route) => createCombineExecutor(candidate, route.name, {
        opencodeExecutable: process.execPath,
        prefixArgs: [fixture],
        env: { FAKE_OPENCODE_MODE: 'not-structurally-usable', OPENROUTER_API_KEY: 'fixture-key' }
      })
    });
    const attempt = completion.attempts[0];
    assert.equal(attempt.completionState, 'COMPLETE', 'the process itself ran fine');
    assert.equal(attempt.evaluation.reportStructurallyUsable, false);
    assert.equal(completion.scorecardUpdates[0].status, 'LIMITED', 'a usable-process/unusable-report tryout is LIMITED, never READY and never a hard failure');
  } finally { l.cleanup(); }
});

test('Combine-13. createCombineExecutor: a genuine hard failure (not a provider/auth/quota condition) is FAILED, not BLOCKED', async () => {
  const l = layout();
  try {
    const executor = createCombineExecutor(prospect('fixture-model'), 'Bounded Evidence Answer tryout', {
      opencodeExecutable: process.execPath,
      prefixArgs: [fixture],
      env: { FAKE_OPENCODE_MODE: 'hard-fail', OPENROUTER_API_KEY: 'fixture-key' }
    });
    const outcome = await executor.execute({ semanticPrompt: 'go', play: { playId: 'p1' }, playHash: 'h', semanticPromptHash: 'sh' }, { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt-hard-fail') });
    assert.equal(outcome.state, 'FAILED');
    assert.equal(deriveCombineStatus({ completionState: outcome.state, failureBoundary: outcome.failureBoundary, providerError: outcome.providerError, evaluation: { reportStructurallyUsable: false } }), 'CALL BACK LATER');
  } finally { l.cleanup(); }
});

test('Combine-14. OpenRouter execution fails closed before spawn when the isolated harness has no environment credential', async () => {
  const l = layout();
  try {
    const invocationLog = path.join(l.root, 'invocations.jsonl');
    const executor = createCombineExecutor(prospect('credential-required'), 'Route C tryout', {
      opencodeExecutable: process.execPath,
      prefixArgs: [fixture],
      env: { OPENROUTER_API_KEY: '', FAKE_OPENCODE_LOG: invocationLog }
    });
    const outcome = await executor.execute({ semanticPrompt: 'go', play: { playId: 'p1' }, playHash: 'h', semanticPromptHash: 'sh' }, { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt-no-key') });
    assert.equal(outcome.state, 'BLOCKED');
    assert.match(outcome.failureBoundary, /AUTH ISSUE.*OPENROUTER_API_KEY/);
    assert.equal(fs.existsSync(invocationLog), false, 'the provider/harness is not hammered when its required credential is absent');
  } finally { l.cleanup(); }
});

test('Combine-15. OpenCode diagnostic flags preserve a structured provider failure instead of collapsing it to Error: {', async () => {
  const l = layout();
  try {
    const invocationLog = path.join(l.root, 'invocations.jsonl');
    const executor = createCombineExecutor(prospect('opaque'), 'Route C tryout', {
      opencodeExecutable: process.execPath,
      prefixArgs: [fixture],
      env: { OPENROUTER_API_KEY: 'fixture-key', FAKE_OPENCODE_MODE: 'opaque-provider-fail', FAKE_OPENCODE_LOG: invocationLog }
    });
    const outcome = await executor.execute({ semanticPrompt: 'go', play: { playId: 'p1' }, playHash: 'h', semanticPromptHash: 'sh' }, { gameRoot: l.gameRoot, playerPath: path.join(l.root, 'attempt-opaque') });
    assert.equal(outcome.state, 'BLOCKED');
    assert.match(outcome.providerError, /UnknownError.*Unexpected server error.*err_fixture123/);
    assert.notEqual(outcome.providerError, 'Error: {');
    const invocation = JSON.parse(fs.readFileSync(invocationLog, 'utf8').trim());
    assert.deepEqual(invocation.args.slice(0, 4), ['--print-logs', '--log-level', 'ERROR', 'run']);
  } finally { l.cleanup(); }
});

test('Combine-16. Successful catalog truth suspends a disappeared READY receiver without recording negative Player film', async () => {
  const l = layout();
  try {
    const dir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(dir, { recursive: true });
    const card = {
      schemaVersion: 1, candidateId: 'departed', provider: 'opencode-hosted', model: 'opencode/departed', displayName: 'Departed', harness: 'opencode',
      firstSeen: '2026-09-17T00:00:00.000Z', lastSeen: '2026-09-17T00:00:00.000Z', lastTryoutAt: '2026-09-17T00:00:00.000Z', currentStatus: 'READY',
      totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
      routeAttempts: { C: { attempts: 1, completions: 1 } }, latestEvidencePaths: [], latestObservedRoute: 'opencode/departed', notes: []
    };
    fs.writeFileSync(path.join(dir, 'departed.json'), JSON.stringify(card));
    const discovery = { discoveredAt: '2026-09-18T00:00:00.000Z', prospects: [], sources: [{ id: 'openrouter', available: false, count: 0, error: 'offline' }, { id: 'opencode-hosted', available: true, count: 0 }] };
    const completion = await runScoutCombine({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery, now: () => new Date('2026-09-18T00:00:00.000Z') });
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'departed.json'), 'utf8'));
    assert.equal(after.currentStatus, 'UNAVAILABLE');
    assert.deepEqual(after.totals, card.totals, 'catalog disappearance is infrastructure availability, not negative Player game film');
    assert.deepEqual(completion.readyDepthChartBefore, ['departed']);
    assert.deepEqual(completion.readyDepthChartAfter, []);
    assert.deepEqual(completion.scorecardUpdates, [{ candidateId: 'departed', status: 'UNAVAILABLE' }]);
  } finally { l.cleanup(); }
});

test('Combine-17. An unavailable catalog never demotes a READY receiver, and rediscovery requires a fresh bounded tryout', async () => {
  const l = layout();
  try {
    const dir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(dir, { recursive: true });
    const base = {
      schemaVersion: 1, candidateId: 'returning', provider: 'openrouter', model: 'openrouter/vendor/returning:free', displayName: 'Returning', harness: 'opencode',
      firstSeen: '2026-09-17T00:00:00.000Z', lastSeen: '2026-09-17T00:00:00.000Z', lastTryoutAt: '2026-09-17T00:00:00.000Z', currentStatus: 'READY',
      totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
      routeAttempts: { C: { attempts: 1, completions: 1 } }, latestEvidencePaths: [], latestObservedRoute: 'openrouter/vendor/returning:free', notes: []
    };
    const cardPath = path.join(dir, 'returning.json');
    fs.writeFileSync(cardPath, JSON.stringify(base));
    const unavailable = { discoveredAt: '2026-09-18T00:00:00.000Z', prospects: [], sources: [{ id: 'openrouter', available: false, count: 0, error: 'network down' }, { id: 'opencode-hosted', available: false, count: 0, error: 'harness down' }] };
    await runScoutCombine({ gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, discovery: unavailable, now: () => new Date('2026-09-18T00:00:00.000Z') });
    assert.equal(JSON.parse(fs.readFileSync(cardPath, 'utf8')).currentStatus, 'READY', 'absence of catalog truth is not evidence of receiver absence');

    fs.writeFileSync(cardPath, JSON.stringify({ ...base, currentStatus: 'UNAVAILABLE', availabilityEvidence: { state: 'CATALOG_ABSENT', observedAt: '2026-09-18T00:00:00.000Z' } }));
    let starts = 0;
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('returning', { model: base.model })]), selectionPolicy: 'refresh-due',
      now: () => new Date('2026-09-18T00:00:01.000Z'),
      executorFactory: fakeExecutorFactory(() => { starts += 1; return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.candidatesConsidered[0].due, true);
    assert.match(completion.candidatesConsidered[0].reason, /reappeared/);
    assert.equal(starts, 1);
    assert.equal(JSON.parse(fs.readFileSync(cardPath, 'utf8')).currentStatus, 'READY');
  } finally { l.cleanup(); }
});

test('Combine-18. A recent field-blocked receiver is not immediately retried by Coach Refresh', async () => {
  const l = layout();
  try {
    const dir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(dir, { recursive: true });
    const card = {
      schemaVersion: 1, candidateId: 'field-blocked', provider: 'openrouter', model: 'openrouter/vendor/field-blocked:free', displayName: 'Field Blocked', harness: 'opencode',
      firstSeen: '2026-09-17T00:00:00.000Z', lastSeen: '2026-09-18T00:00:00.000Z', lastTryoutAt: '2026-09-18T00:00:00.000Z', currentStatus: 'UNAVAILABLE',
      totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
      routeAttempts: { C: { attempts: 1, completions: 1 } }, latestEvidencePaths: [], latestObservedRoute: 'openrouter/vendor/field-blocked:free', notes: [],
      availabilityEvidence: { state: 'FIELD_BLOCKED', observedAt: '2026-09-18T00:00:01.000Z' }
    };
    fs.writeFileSync(path.join(dir, 'field-blocked.json'), JSON.stringify(card));
    let starts = 0;
    const completion = await runScoutCombine({
      gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot,
      discovery: fakeDiscovery([prospect('field-blocked', { model: card.model })]), selectionPolicy: 'refresh-due',
      now: () => new Date('2026-09-18T00:00:02.000Z'),
      executorFactory: fakeExecutorFactory(() => { starts += 1; return COMPLETE_OUTCOME; })
    });
    assert.equal(completion.candidatesConsidered[0].due, false);
    assert.equal(completion.prospectsSelected, 0);
    assert.equal(starts, 0, 'field failure does not create an immediate retry storm');
  } finally { l.cleanup(); }
});
