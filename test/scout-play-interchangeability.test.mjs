import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createScoutPlayEnvelope, normalizeScoutPlay, scoutPlayHash } from '../out/scout-play.js';
import { evaluateScoutReport, runInterchangeabilityProof, validateDirectGeminiAgent } from '../out/scout-interchangeability-runner.js';
import { antigravityDialect, ANTIGRAVITY_READ_ONLY_SCOUT_ARGS } from '../out/player-control/structured-print.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-interchangeability-'));
  const gameRoot = path.join(root, 'Game With Spaces');
  const durableReportRoot = path.join(root, 'Durable Reports');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  return { root, gameRoot, durableReportRoot };
}

function play(gameRoot, playId = 'same-play') {
  return {
    playId,
    gameRoot,
    taskClass: 'bounded-test',
    objective: 'Classify one current source behavior.',
    scope: ['Current source.'],
    nonGoals: ['No implementation.'],
    authority: { mode: 'read-only-reconnaissance', allowed: ['Read and search.'], denied: ['No writes.'] },
    evidenceContract: ['Cite exact current evidence.'],
    reportContract: {
      requiredStatement: 'This report is reconnaissance, not final architectural authority.',
      sections: ['Executive answer', 'FACTS', 'INFERENCES', 'UNKNOWNS', 'CONTRADICTIONS', 'Relevant files / symbols', 'Recommended next step', 'Provenance']
    }
  };
}

function report(label = 'usable') {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee src/example.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/example.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
}

function executor(id, observed, outcome = {}) {
  return {
    id,
    player: id,
    harness: `harness-${id}`,
    provider: `provider-${id}`,
    async execute(envelope) {
      observed.push({ envelope, playHash: envelope.playHash, promptHash: envelope.semanticPromptHash, prompt: envelope.semanticPrompt });
      return { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-16T13:00:00.000Z', endedAt: '2026-09-16T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true, ...outcome };
    }
  };
}

test('one ScoutPlay normalizes once into a deterministic immutable identity', () => {
  const l = layout();
  try {
    const first = createScoutPlayEnvelope(play(l.gameRoot));
    const second = createScoutPlayEnvelope(JSON.parse(JSON.stringify(play(l.gameRoot))));
    assert.equal(first.playHash, second.playHash);
    assert.equal(first.semanticPromptHash, second.semanticPromptHash);
    assert.ok(Object.isFrozen(first.play));
    assert.ok(Object.isFrozen(first.play.authority.denied));
    assert.equal(scoutPlayHash(normalizeScoutPlay(play(l.gameRoot))), first.playHash);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('two executors receive the same Play identity and exact semantic prompt', async () => {
  const l = layout();
  const observed = [];
  try {
    const completion = await runInterchangeabilityProof(play(l.gameRoot), { durableReportRoot: l.durableReportRoot, executors: [executor('one', observed), executor('two', observed)] });
    assert.equal(completion.outcome, 'PASS');
    assert.equal(observed.length, 2);
    assert.strictEqual(observed[0].envelope, observed[1].envelope);
    assert.equal(observed[0].playHash, observed[1].playHash);
    assert.equal(observed[0].promptHash, observed[1].promptHash);
    assert.equal(observed[0].prompt, observed[1].prompt);
    assert.deepEqual(completion.attempts.map((attempt) => attempt.canonicalPlayHash), [completion.canonicalPlayHash, completion.canonicalPlayHash]);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('an executor cannot mutate semantic fields and common results stay normalized', async () => {
  const l = layout();
  const observed = [];
  let mutationBlocked = false;
  const mutator = executor('mutator', observed);
  mutator.execute = async (envelope) => {
    observed.push({ envelope });
    try { envelope.play.objective = 'provider-specific fork'; } catch { mutationBlocked = true; }
    return { state: 'COMPLETE', stdout: report(), stderr: '', startedAt: '2026-09-16T13:00:00.000Z', endedAt: '2026-09-16T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
  };
  try {
    const completion = await runInterchangeabilityProof(play(l.gameRoot), { durableReportRoot: l.durableReportRoot, executors: [mutator, executor('other', observed)] });
    assert.equal(mutationBlocked, true);
    assert.equal(completion.attempts[0].scoutPlayId, 'same-play');
    assert.equal(completion.attempts[0].evaluation.reportStructurallyUsable, true);
    assert.equal(completion.attempts[1].evaluation.reportStructurallyUsable, true);
    assert.deepEqual(Object.keys(completion.attempts[0]), Object.keys(completion.attempts[1]));
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('one executor failure neither corrupts the Play nor prevents the next executor', async () => {
  const l = layout();
  const observed = [];
  const failing = { id: 'failure', player: 'failure', harness: 'test', provider: 'test', async execute(envelope) { observed.push(envelope.playHash); throw new Error('bounded failure'); } };
  try {
    const completion = await runInterchangeabilityProof(play(l.gameRoot), { durableReportRoot: l.durableReportRoot, executors: [failing, executor('success', observed)] });
    assert.equal(completion.outcome, 'PARTIAL');
    assert.equal(completion.attempts[0].completionState, 'FAILED');
    assert.equal(completion.attempts[1].completionState, 'COMPLETE');
    assert.equal(completion.canonicalPlayHash, observed[0]);
    assert.equal(completion.canonicalPlayHash, observed[1].playHash);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('secret values are redacted from all generated artifacts and reports', async () => {
  const l = layout();
  const secret = ['fixture', 'credential', 'must', 'not', 'persist'].join('-');
  const observed = [];
  try {
    await runInterchangeabilityProof(play(l.gameRoot), {
      durableReportRoot: l.durableReportRoot,
      secretValues: [secret],
      executors: [executor('one', observed, { stdout: `${report()}\n${secret}`, stderr: `provider rejected ${secret}`, providerError: `bad ${secret}` })]
    });
    const files = fs.readdirSync(l.root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
    assert.ok(files.length > 0);
    for (const file of files) assert.equal(fs.readFileSync(file, 'utf8').includes(secret), false, file);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});

test('result evaluation uses the shared structural contract and direct agent preflight is read-only', () => {
  const l = layout();
  try {
    assert.equal(evaluateScoutReport(report(), l.gameRoot).reportStructurallyUsable, true);
    assert.equal(evaluateScoutReport('free form', l.gameRoot).reportStructurallyUsable, false);
    validateDirectGeminiAgent(path.resolve('tools/scouts/opencode-interchangeability'), 'sideline-gemini-direct-scout');
    assert.deepEqual(antigravityDialect().authorityArgs({ permission: 'read-only-scout' }), [...ANTIGRAVITY_READ_ONLY_SCOUT_ARGS]);
  } finally { fs.rmSync(l.root, { recursive: true, force: true }); }
});
