import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runScoutFormation, freshFormationId } from '../out/scout-formation.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-formation-'));
  const gameRoot = path.join(root, 'Game With Spaces');
  const durableReportRoot = path.join(root, 'Durable Reports');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report(label, contradiction = 'None.') {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee src/example.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\n${contradiction}\n# Relevant files / symbols\nsrc/example.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
}

function fakeCandidate(id, { eligible = true, reason = 'fixture eligible', delayMs = 5, outcome } = {}) {
  return {
    id,
    player: `Player-${id}`,
    provider: `Provider-${id}`,
    eligible() { return { eligible, reason }; },
    createExecutor() {
      return {
        id,
        player: `Player-${id}`,
        harness: `harness-${id}`,
        provider: `Provider-${id}`,
        async execute(envelope) {
          if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
          return outcome
            ? outcome(envelope)
            : { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-17T13:00:00.000Z', endedAt: '2026-09-17T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
        }
      };
    }
  };
}

test('a fresh Formation identity is generated automatically and is filesystem-safe', () => {
  const id = freshFormationId(new Date('2026-09-17T13:41:00.000Z'));
  assert.match(id, /^Scout-Formation__\d{4}-\d{2}-\d{2}_\d{6}_\d{3}_[A-Za-z0-9+-]+$/);
});

test('the same canonical Play and semantic prompt are delivered to every selected Scout, concurrently, bounded by Formation size', async () => {
  const l = layout();
  const observed = [];
  const candidates = [
    fakeCandidate('one', { delayMs: 40 }),
    fakeCandidate('two', { delayMs: 40 })
  ];
  candidates.forEach((candidate) => {
    const original = candidate.createExecutor;
    candidate.createExecutor = () => {
      const executor = original();
      const inner = executor.execute.bind(executor);
      executor.execute = async (envelope) => {
        const entry = { id: executor.id, playHash: envelope.playHash, promptHash: envelope.semanticPromptHash, start: Date.now() };
        observed.push(entry);
        const result = await inner(envelope);
        entry.end = Date.now();
        return result;
      };
      return executor;
    };
  });
  try {
    const completion = await runScoutFormation({ objective: 'Investigate the bounded fixture surface.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates });
    assert.equal(completion.scoutsRequested, 2);
    assert.equal(completion.scoutsCompleted, 2);
    assert.equal(completion.outcome, 'COMPLETE');
    assert.equal(observed.length, 2);
    assert.equal(observed[0].playHash, observed[1].playHash);
    assert.equal(observed[0].promptHash, observed[1].promptHash);
    // Concurrency proof: the second Scout starts before the first ends.
    assert.ok(observed[1].start < observed[0].end, 'expected overlapping execution windows for a 2-Scout Formation');
  } finally { l.cleanup(); }
});

test('Formation size is bounded to the V0.2 range and defaults to min(2, eligible)', async () => {
  const l = layout();
  try {
    const oneEligible = await runScoutFormation({
      objective: 'Bounded single-candidate objective.',
      gameRoot: l.gameRoot,
      durableReportRoot: l.durableReportRoot,
      candidates: [fakeCandidate('solo'), fakeCandidate('ghost', { eligible: false, reason: 'not usable' })]
    });
    assert.equal(oneEligible.scoutsRequested, 1, 'must not fail simply because the eligible roster is smaller than desired');
    assert.equal(oneEligible.candidatesConsidered.find((c) => c.id === 'ghost').eligible, false);

    await assert.rejects(runScoutFormation({
      objective: 'Explicit selection exceeds bound.',
      gameRoot: l.gameRoot,
      durableReportRoot: l.durableReportRoot,
      candidates: [fakeCandidate('a'), fakeCandidate('b'), fakeCandidate('c'), fakeCandidate('d')],
      players: ['a', 'b', 'c', 'd']
    }), /exceeds the V0\.2 bound of 3/);
  } finally { l.cleanup(); }
});

test('explicit human Player selection outranks automatic eligibility', async () => {
  const l = layout();
  try {
    const completion = await runScoutFormation({
      objective: 'Explicit override objective.',
      gameRoot: l.gameRoot,
      durableReportRoot: l.durableReportRoot,
      candidates: [fakeCandidate('preferred', { eligible: false, reason: 'auto would skip this one' }), fakeCandidate('auto-favorite')],
      players: ['preferred']
    });
    assert.equal(completion.scoutsRequested, 1);
    assert.equal(completion.attempts[0].executorId, 'preferred');
  } finally { l.cleanup(); }
});

test('one Scout failing does not corrupt another Scout\'s independent evidence, and the Formation reports PARTIAL', async () => {
  const l = layout();
  const candidates = [
    fakeCandidate('failing', { outcome: () => ({ state: 'FAILED', stdout: '', stderr: 'boom', exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'Player execution failure.' }) }),
    fakeCandidate('succeeding')
  ];
  try {
    const completion = await runScoutFormation({ objective: 'Mixed outcome objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates });
    assert.equal(completion.outcome, 'PARTIAL');
    assert.equal(completion.scoutsCompleted, 1);
    assert.equal(completion.scoutsFailed, 1);
    const failing = completion.attempts.find((a) => a.executorId === 'failing');
    const succeeding = completion.attempts.find((a) => a.executorId === 'succeeding');
    assert.equal(failing.completionState, 'FAILED');
    assert.equal(succeeding.completionState, 'COMPLETE');
    assert.ok(fs.existsSync(succeeding.durableReportPath));
    assert.equal(failing.durableReportPath, undefined);
    assert.equal(completion.synthesis.failedScouts.length, 1);
    assert.equal(completion.synthesis.failedScouts[0].executorId, 'failing');
  } finally { l.cleanup(); }
});

test('a provider BLOCKED outcome is distinguished from a hard FAILED outcome', async () => {
  const l = layout();
  const candidates = [fakeCandidate('blocked', { outcome: () => ({ state: 'BLOCKED', stdout: '', stderr: 'no credential', exitCode: null, signal: null, readOnlyContractHeld: true, failureBoundary: 'PROVIDER BLOCKED: missing credential.' }) })];
  try {
    const completion = await runScoutFormation({ objective: 'Blocked provider objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates });
    assert.equal(completion.outcome, 'BLOCKED');
    assert.equal(completion.scoutsBlocked, 1);
  } finally { l.cleanup(); }
});

test('self-reported contradictions are surfaced rather than averaged into false consensus', async () => {
  const l = layout();
  const candidates = [
    fakeCandidate('a', { outcome: () => ({ state: 'COMPLETE', stdout: report('finding A', 'Scout B disagrees about ownership of the config path.'), stderr: '', model: 'm', startedAt: '2026-09-17T13:00:00.000Z', endedAt: '2026-09-17T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true }) }),
    fakeCandidate('b')
  ];
  try {
    const completion = await runScoutFormation({ objective: 'Contradiction objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates });
    assert.equal(completion.synthesis.contradictions.length, 1);
    assert.equal(completion.synthesis.contradictions[0].executorId, 'a');
    assert.match(completion.synthesis.contradictions[0].excerpt, /disagrees/);
  } finally { l.cleanup(); }
});

test('Formation results persist to durable evidence with no-overwrite protection and one obvious result path', async () => {
  const l = layout();
  const now = () => new Date('2026-09-17T13:41:00.000Z');
  const candidates = [fakeCandidate('one')];
  try {
    const completion = await runScoutFormation({ objective: 'Persistence objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates, now });
    assert.ok(fs.existsSync(completion.resultPath));
    assert.ok(fs.existsSync(path.join(completion.durablePath, 'FORMATION-COMPLETE.json')));
    // V0.4: Formation computes its OWN Formations/<id> namespace internally —
    // durableReportRoot itself stays the plain Scout Only root, the same root
    // ANTIGRAVITY_CANDIDATE and Combine-derived candidates read sibling
    // evidence from (Player Verification/, Combine/Scorecards/).
    assert.equal(completion.durablePath, path.join(l.durableReportRoot, 'Formations', completion.formationId));
    assert.match(fs.readFileSync(completion.resultPath, 'utf8'), /SCOUT FORMATION RESULT/);
    await assert.rejects(runScoutFormation({ objective: 'Persistence objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates, now }), /already exists/);
  } finally { l.cleanup(); }
});

test('read-only authority evidence is preserved per Scout in the Formation telemetry', async () => {
  const l = layout();
  const candidates = [fakeCandidate('one')];
  try {
    const completion = await runScoutFormation({ objective: 'Authority objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates });
    assert.equal(completion.attempts[0].readOnlyContractHeld, true);
  } finally { l.cleanup(); }
});
