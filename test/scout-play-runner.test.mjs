import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runScoutPlay, validateScoutPlay, validateScoutAgentContract } from '../out/scout-play-runner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures', 'scout-process.mjs');

function lab(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const gameRoot = path.join(root, 'Game With Spaces');
  const workspaceRoot = path.join(root, 'Temporary Scout Workspaces');
  const durableReportRoot = path.join(root, 'Durable Scout Reports');
  fs.mkdirSync(gameRoot);
  fs.writeFileSync(path.join(gameRoot, 'game-source.txt'), 'must not change\n');
  const agents = path.join(gameRoot, '.opencode', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  const models = {
    'sideline-scout-quick': 'openrouter/cohere/north-mini-code:free',
    'sideline-scout': 'openrouter/poolside/laguna-s-2.1:free',
    'sideline-scout-balanced': 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
    'sideline-scout-deep': 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free'
  };
  for (const [agent, model] of Object.entries(models)) fs.writeFileSync(path.join(agents, `${agent}.md`), `---\nmode: primary\nmodel: ${model}\npermission:\n  "*": deny\n  read:\n    "*": allow\n  glob: allow\n  grep: allow\n  list: allow\n  external_directory: deny\n---\nRead only.\n`);
  return { root, gameRoot, workspaceRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const scout = (id, agent = 'sideline-scout') => ({ id, agent, objective: `Investigate bounded route ${id}.` });

function fixtureCommand(definition, delays = {}, failures = new Set()) {
  return {
    command: process.execPath,
    args: [fixture, '--scout-id', definition.id, '--delay', String(delays[definition.id] ?? 30), ...(failures.has(definition.id) ? ['--fail'] : [])]
  };
}

test('Scout Runner V0.1-1: one Scout executes through process pipes and persists a separate report without Game mutation', async () => {
  const l = lab('scout-one');
  try {
    const before = fs.readFileSync(path.join(l.gameRoot, 'game-source.txt'), 'utf8');
    const completion = await runScoutPlay({ playId: 'one-scout', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [scout('A')] }, {
      workspaceRoot: l.workspaceRoot,
      durableReportRoot: l.durableReportRoot,
      commandForScout: (definition) => fixtureCommand(definition)
    });
    assert.equal(completion.outcome, 'COMPLETE');
    assert.equal(completion.scoutsCompleted, 1);
    assert.equal(completion.scouts[0].state, 'COMPLETE');
    assert.equal(completion.scouts[0].exitCode, 0);
    assert.match(fs.readFileSync(completion.scouts[0].stdoutPath, 'utf8'), /only-A/);
    assert.match(fs.readFileSync(completion.scouts[0].stderrPath, 'utf8'), /stderr-A/);
    assert.match(fs.readFileSync(completion.scouts[0].durableReportPath, 'utf8'), /REPORT TYPE: SCOUT REPORT/);
    assert.equal(fs.readFileSync(path.join(l.gameRoot, 'game-source.txt'), 'utf8'), before);
    assert.deepEqual(fs.readdirSync(l.gameRoot).sort(), ['.opencode', 'game-source.txt'], 'report persistence requires no Game write when an external workspace root is selected');
  } finally { l.cleanup(); }
});

test('Scout Runner V0.1-2: three Scouts overlap, outputs stay isolated, and paths containing spaces work', async () => {
  const l = lab('scout-three');
  try {
    let running = 0;
    let peak = 0;
    const seen = new Map();
    const completion = await runScoutPlay({
      playId: 'three-concurrent', gameRoot: l.gameRoot, maxConcurrency: 3,
      scouts: [scout('A', 'sideline-scout-quick'), scout('B'), scout('C', 'sideline-scout-deep')]
    }, {
      workspaceRoot: l.workspaceRoot,
      durableReportRoot: l.durableReportRoot,
      commandForScout: (definition) => fixtureCommand(definition, { A: 180, B: 180, C: 180 }),
      onStateChange(result) {
        const prior = seen.get(result.id);
        if (prior !== 'RUNNING' && result.state === 'RUNNING') running += 1;
        if (prior === 'RUNNING' && result.state !== 'RUNNING') running -= 1;
        peak = Math.max(peak, running);
        seen.set(result.id, result.state);
      }
    });
    assert.equal(peak, 3);
    assert.equal(completion.scoutsCompleted, 3);
    for (const result of completion.scouts) {
      const output = fs.readFileSync(result.stdoutPath, 'utf8');
      assert.match(output, new RegExp(`only-${result.id}`));
      for (const other of completion.scouts.filter((item) => item.id !== result.id)) assert.doesNotMatch(output, new RegExp(`only-${other.id}`));
    }
  } finally { l.cleanup(); }
});

test('Scout Runner V0.1-3: maxConcurrency is respected and queued Scouts start as capacity opens', async () => {
  const l = lab('scout-bound');
  try {
    let running = 0;
    let peak = 0;
    const state = new Map();
    const starts = [];
    const completion = await runScoutPlay({
      playId: 'five-bounded', gameRoot: l.gameRoot, maxConcurrency: 2,
      scouts: ['A', 'B', 'C', 'D', 'E'].map((id) => scout(id))
    }, {
      workspaceRoot: l.workspaceRoot,
      durableReportRoot: l.durableReportRoot,
      commandForScout: (definition) => fixtureCommand(definition, { A: 100, B: 100, C: 40, D: 40, E: 20 }),
      onStateChange(result) {
        const prior = state.get(result.id);
        if (prior !== 'RUNNING' && result.state === 'RUNNING') { running += 1; starts.push(result.id); }
        if (prior === 'RUNNING' && result.state !== 'RUNNING') running -= 1;
        peak = Math.max(peak, running);
        state.set(result.id, result.state);
      }
    });
    assert.equal(peak, 2);
    assert.deepEqual(starts.slice(0, 2), ['A', 'B']);
    assert.equal(completion.scoutsCompleted, 5);
  } finally { l.cleanup(); }
});

test('Scout Runner V0.1-4: one failure is truthful, does not erase successes, and completion metadata records actual outcomes', async () => {
  const l = lab('scout-failure');
  try {
    const completion = await runScoutPlay({
      playId: 'partial-play', gameRoot: l.gameRoot, maxConcurrency: 3,
      scouts: [scout('A'), scout('B', 'sideline-scout-balanced'), scout('C')]
    }, {
      workspaceRoot: l.workspaceRoot,
      durableReportRoot: l.durableReportRoot,
      commandForScout: (definition) => fixtureCommand(definition, { A: 40, B: 10, C: 60 }, new Set(['B']))
    });
    assert.equal(completion.outcome, 'PARTIAL');
    assert.equal(completion.scoutsCompleted, 2);
    assert.equal(completion.scoutsFailed, 1);
    assert.deepEqual(completion.scouts.map(({ id, state, exitCode }) => ({ id, state, exitCode })), [
      { id: 'A', state: 'COMPLETE', exitCode: 0 },
      { id: 'B', state: 'FAILED', exitCode: 7 },
      { id: 'C', state: 'COMPLETE', exitCode: 0 }
    ]);
    assert.equal(completion.scouts[1].durableReportPath, undefined, 'failed stdout is retained as execution evidence, not promoted as a completed report');
    assert.ok(fs.existsSync(completion.scouts[0].durableReportPath));
    assert.ok(fs.existsSync(completion.scouts[2].durableReportPath));
    const durableCompletion = JSON.parse(fs.readFileSync(path.join(l.durableReportRoot, 'partial-play', 'SCOUT-PLAY-COMPLETE.json'), 'utf8'));
    assert.equal(durableCompletion.outcome, 'PARTIAL');
    assert.equal(durableCompletion.scouts[1].exitCode, 7);
  } finally { l.cleanup(); }
});

test('Scout Runner V0.1-5: validation refuses unsafe paths, duplicate identities, invalid concurrency, and non-Scout agents', () => {
  const l = lab('scout-validation');
  try {
    assert.throws(() => validateScoutPlay({ playId: '../escape', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [scout('A')] }), /playId/);
    assert.throws(() => validateScoutPlay({ playId: 'x', gameRoot: l.gameRoot, maxConcurrency: 0, scouts: [scout('A')] }), /maxConcurrency/);
    assert.throws(() => validateScoutPlay({ playId: 'x', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [scout('A'), scout('A')] }), /Duplicate/);
    assert.throws(() => validateScoutPlay({ playId: 'x', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [{ ...scout('A'), agent: 'build' }] }), /approved read-only/);
    fs.writeFileSync(path.join(l.gameRoot, '.opencode', 'agents', 'sideline-scout.md'), '---\nmode: primary\nmodel: openrouter/poolside/laguna-s-2.1:free\npermission:\n  "*": allow\n---\n');
    assert.throws(() => validateScoutAgentContract(l.gameRoot, scout('A')), /not provably/);
  } finally { l.cleanup(); }
});

test('Scout Runner V0.1-6: cancellation interrupts active Scouts and never marks stopped output complete', async () => {
  const l = lab('scout-interrupt');
  const controller = new AbortController();
  try {
    const promise = runScoutPlay({ playId: 'interrupted-play', gameRoot: l.gameRoot, maxConcurrency: 2, scouts: [scout('A'), scout('B')] }, {
      workspaceRoot: l.workspaceRoot,
      durableReportRoot: l.durableReportRoot,
      signal: controller.signal,
      commandForScout: (definition) => fixtureCommand(definition, { A: 2_000, B: 2_000 })
    });
    setTimeout(() => controller.abort(), 80);
    const completion = await promise;
    assert.equal(completion.outcome, 'INTERRUPTED');
    assert.equal(completion.scoutsInterrupted, 2);
    assert.ok(completion.scouts.every((result) => result.state === 'INTERRUPTED' && result.exitCode === null && result.signal));
  } finally { l.cleanup(); }
});
