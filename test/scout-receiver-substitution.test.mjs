/**
 * Scout receiver substitution (the injured list) + the ONE master report handoff.
 *
 * Two execution engines, one contract: the CLI runner (scout-play-runner) and the product Formation
 * (scout-formation) share classification and bounded selection from scout-substitution.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runScoutPlay, formatScoutPlayHandoff, SCOUT_ROSTER } from '../out/scout-play-runner.js';
import { runScoutFormation } from '../out/scout-formation.js';
import { classifyReceiverFailure, selectSubstitute, combineReadinessForModel } from '../out/scout-substitution.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const fixture = path.join(here, 'fixtures', 'scout-process.mjs');

// ---------------------------------------------------------------- CLI-runner lab

function lab(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const gameRoot = path.join(root, 'Game With Spaces');
  const workspaceRoot = path.join(root, 'Work');
  const durableReportRoot = path.join(root, 'Scout Intelligence');
  fs.mkdirSync(path.join(gameRoot, '.opencode', 'agents'), { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  for (const [agent, model] of Object.entries(SCOUT_ROSTER)) {
    fs.writeFileSync(path.join(gameRoot, '.opencode', 'agents', `${agent}.md`), `---\nmode: primary\nmodel: ${model}\npermission:\n  "*": deny\n  read:\n    "*": allow\n  glob: allow\n  grep: allow\n  list: allow\n  external_directory: deny\n---\nRead only.\n`);
  }
  return { root, gameRoot, workspaceRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const lane = (id, agent) => ({ id, agent, objective: `Investigate bounded lane ${id}.` });
const failing = (text, code = 1) => ({ command: process.execPath, args: ['-e', `process.stderr.write(${JSON.stringify(`${text}\n`)}); process.exit(${code});`] });
const succeeding = (id, delay = 20) => ({ command: process.execPath, args: [fixture, '--scout-id', id, '--delay', String(delay)] });
const eligibleAll = () => ({ eligible: true, reason: 'test: eligible now' });

// ---------------------------------------------------------------- pure policy

test('SUB-1. Classification is conservative: only positive infrastructure evidence is substitutable', () => {
  const c = (state, text = '', extra = {}) => classifyReceiverFailure({ state, text, ...extra });
  assert.deepEqual([c('FAILED', 'Error: Unexpected error\n\ndatabase is locked').failureClass, c('FAILED', 'Error: Unexpected error\n\ndatabase is locked').substitutable], ['contention', true], 'the field failure');
  assert.equal(c('FAILED', 'HTTP 429 rate limit exceeded').failureClass, 'availability');
  assert.equal(c('FAILED', 'ProviderModelNotFoundError').substitutable, true);
  assert.equal(c('BLOCKED', '').substitutable, true, 'executors already classify BLOCKED as infrastructure');
  assert.equal(c('FAILED', '', { couldNotStart: true }).substitutable, true, 'a process that could not start');
  assert.equal(c('COMPLETE', 'rate limit mentioned in the answer').substitutable, false, 'an answer is never an infrastructure failure, whatever it says');
  assert.equal(c('FAILED', 'TypeError: something odd').failureClass, 'unknown');
  assert.equal(c('FAILED', 'TypeError: something odd').substitutable, false, 'UNKNOWN is legitimate and not auto-substituted');
  assert.equal(c('INTERRUPTED', '429').substitutable, false, 'a human interrupt is never replaced');
  assert.equal(c('UNKNOWN', '429').substitutable, true, 'positive infrastructure evidence resolves UNKNOWN mechanically');
  assert.equal(c('UNKNOWN', '').substitutable, false, 'no evidence stays UNKNOWN and is not substituted');
});

test('SUB-2. Selection never reuses an attempted or already-fielded receiver, asks for CURRENT eligibility, and keeps skip reasons', () => {
  const bench = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const asked = [];
  const choice = selectSubstitute({
    bench, attempted: new Set(['a']), claimed: new Set(['b']),
    isEligible: (candidate) => { asked.push(candidate.id); return candidate.id === 'c' ? { eligible: false, reason: 'RATE LIMITED now' } : { eligible: true, reason: 'ok' }; }
  });
  assert.equal(choice.pick.id, 'd');
  assert.deepEqual(asked, ['c', 'd'], 'attempted and claimed receivers are not even asked');
  assert.deepEqual(choice.skipped.map((s) => s.id), ['a', 'b', 'c']);
  assert.match(choice.skipped[2].reason, /RATE LIMITED/);
  assert.equal(selectSubstitute({ bench, attempted: new Set(), claimed: new Set(), isEligible: () => { throw new Error('boom'); } }).pick, undefined, 'a throwing eligibility check means not eligible, never eligible');
});

test('SUB-3. Readiness comes from the Combine depth chart, fresh each call; no scorecard means UNKNOWN, which is not eligible', () => {
  const l = lab('sub-readiness');
  try {
    const dir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    assert.equal(combineReadinessForModel(l.durableReportRoot, 'm/x').eligible, false, 'no depth chart at all');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ model: 'm/x', currentStatus: 'READY', lastTryoutAt: 't' }));
    assert.equal(combineReadinessForModel(l.durableReportRoot, 'm/x').eligible, true);
    fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ model: 'm/x', currentStatus: 'RATE LIMITED' }));
    assert.match(combineReadinessForModel(l.durableReportRoot, 'm/x').reason, /RATE LIMITED/, 'yesterday READY is not today READY');
    assert.equal(combineReadinessForModel(l.durableReportRoot, 'm/unlisted').eligible, false, 'unknown is not invented as ready');
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------- CLI runner

test('SUB-4. Lane A infrastructure-fails, an eligible receiver takes Lane A, the surviving Lane B is never restarted, and the failed film is preserved', async () => {
  const l = lab('sub-primary');
  try {
    const launches = [];
    const notes = [];
    const completion = await runScoutPlay({
      playId: 'primary', gameRoot: l.gameRoot, maxConcurrency: 2,
      scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout')]
    }, {
      workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, contentionBackoffMs: 0,
      substituteEligibility: eligibleAll,
      onNote: (message) => notes.push(message),
      commandForScout: (scout) => {
        launches.push(`${scout.id}:${scout.agent}`);
        if (scout.id === 'lane-a' && scout.agent === 'sideline-scout-quick') return failing('Error: Unexpected error\n\ndatabase is locked');
        return succeeding(scout.id, scout.id === 'lane-b' ? 250 : 20);
      }
    });

    assert.equal(completion.outcome, 'COMPLETE', 'the Formation still finishes whole');
    assert.deepEqual(launches.sort(), ['lane-a:sideline-scout-balanced', 'lane-a:sideline-scout-quick', 'lane-b:sideline-scout'].sort());
    const [a, b] = completion.scouts;
    assert.equal(a.state, 'COMPLETE');
    assert.equal(a.agent, 'sideline-scout-balanced', 'same lane, next eligible receiver (roster order: quick, scout, balanced, deep)');
    assert.equal(a.originalAgent, 'sideline-scout-quick');
    assert.equal(a.model, SCOUT_ROSTER['sideline-scout-balanced']);
    assert.equal(b.attempts.length, 1, 'the surviving lane was never touched');
    assert.equal(b.agent, 'sideline-scout');

    // The failed attempt is preserved, classified and linked — not erased or overwritten.
    assert.equal(a.attempts.length, 2);
    const [failed, took] = a.attempts;
    assert.deepEqual([failed.agent, failed.state, failed.failureClass, failed.replacedBy], ['sideline-scout-quick', 'FAILED', 'contention', 'sideline-scout-balanced']);
    assert.match(fs.readFileSync(failed.stderrPath, 'utf8'), /database is locked/, 'game film survives');
    assert.notEqual(failed.stderrPath, took.stderrPath, 'a later attempt never overwrites earlier film');
    assert.equal(took.state, 'COMPLETE');
    assert.equal(completion.scoutsSubstituted, 1);
    assert.equal(completion.substitutions[0].failedReceiver, 'sideline-scout-quick');
    assert.equal(completion.substitutions[0].replacement, 'sideline-scout-balanced');
    assert.ok(notes.some((n) => /\[SUBSTITUTE\] lane-a: sideline-scout-quick → sideline-scout-balanced/.test(n)));
    assert.match(fs.readFileSync(a.durableReportPath, 'utf8'), /only-lane-a/, 'the substitute produced the lane report');
  } finally { l.cleanup(); }
});

test('SUB-5. Each distinct eligible receiver is tried at most once per lane (the finite bench is the bound); exhaustion leaves the lane truthfully failed', async () => {
  const l = lab('sub-bounded');
  try {
    const launches = [];
    const completion = await runScoutPlay({
      playId: 'bounded', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('only', 'sideline-scout-quick')]
    }, {
      workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, contentionBackoffMs: 0,
      substituteEligibility: eligibleAll,
      commandForScout: (scout) => { launches.push(scout.agent); return failing('HTTP 429 rate limit exceeded'); }
    });
    assert.deepEqual(launches, ['sideline-scout-quick', 'sideline-scout', 'sideline-scout-balanced', 'sideline-scout-deep'], 'the whole bench, once each, in depth-chart order');
    assert.equal(new Set(launches).size, launches.length, 'no receiver twice on the same lane');
    assert.equal(completion.outcome, 'FAILED');
    const last = completion.substitutions.at(-1);
    assert.equal(last.replacement, null);
    assert.ok(last.skipped.every((skip) => /Already attempted/.test(skip.reason)), 'every bench receiver was already tried');
    assert.equal(completion.scouts[0].attempts.length, launches.length, 'every attempt preserved');
  } finally { l.cleanup(); }
});

test('SUB-6. No eligible substitute → truthful PARTIAL, the surviving lane still completes, and the master report says so', async () => {
  const l = lab('sub-none');
  try {
    const completion = await runScoutPlay({
      playId: 'none-eligible', gameRoot: l.gameRoot, maxConcurrency: 2,
      scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout')]
    }, {
      workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot,
      substituteEligibility: (agent) => ({ eligible: false, reason: `${agent} is RATE LIMITED right now` }),
      commandForScout: (scout) => (scout.id === 'lane-a' ? failing('Error: HTTP 429 rate limit') : succeeding(scout.id, 100))
    });
    assert.equal(completion.outcome, 'PARTIAL');
    assert.equal(completion.scoutsCompleted, 1);
    assert.equal(completion.scoutsFailed, 1);
    assert.equal(completion.substitutions[0].replacement, null);
    assert.ok(completion.substitutions[0].skipped.some((s) => /RATE LIMITED right now/.test(s.reason)), 'why nobody was fielded is recorded');
    assert.equal(completion.scouts[0].attempts.length, 1);

    const master = fs.readFileSync(completion.masterReportPath, 'utf8');
    assert.match(master, /FORMATION PARTIAL · 1\/2 lanes completed · 0 substitutions · elapsed \d\d:\d\d:\d\d/);
    assert.match(master, /NO ELIGIBLE SUBSTITUTE REMAINED/);
    assert.match(master, /## FAILED \/ BLOCKED ATTEMPTS/);
    assert.match(master, /only-lane-b/, 'the surviving Scout report is embedded in the master report');
    assert.match(master, /## UNKNOWN \/ UNFILLED TERRITORY/);
    assert.ok(master.includes(completion.scouts[0].stderrPath), 'failed film is referenced by path');
    assert.equal(fs.existsSync(completion.scouts[1].durableReportPath), true, 'the child report survives as subordinate evidence');
  } finally { l.cleanup(); }
});

test('SUB-7. A substantive answer, or a failure that cannot be identified as infrastructure, is NEVER substituted even with an eligible bench', async () => {
  const l = lab('sub-substantive');
  try {
    const launches = [];
    const completion = await runScoutPlay({
      playId: 'no-sub', gameRoot: l.gameRoot, maxConcurrency: 2,
      scouts: [lane('poor-answer', 'sideline-scout-quick'), lane('odd-failure', 'sideline-scout')]
    }, {
      workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, contentionBackoffMs: 0,
      substituteEligibility: eligibleAll,
      commandForScout: (scout) => {
        launches.push(scout.id);
        return scout.id === 'poor-answer'
          ? { command: process.execPath, args: ['-e', 'process.stdout.write("I could not find anything useful.\\n")'] }
          : failing('TypeError: something unrelated exploded', 3);
      }
    });
    assert.deepEqual(launches.sort(), ['odd-failure', 'poor-answer'], 'each lane launched exactly once');
    assert.equal(completion.scouts[0].state, 'COMPLETE', 'a weak answer is still an answer');
    assert.equal(completion.scouts[1].state, 'FAILED');
    assert.equal(completion.scouts[1].attempts[0].failureClass, 'unknown');
    assert.equal(completion.substitutions.length, 0);
    assert.equal(completion.outcome, 'PARTIAL');
  } finally { l.cleanup(); }
});

test('SUB-8. Eligibility is CURRENT: the default gate reads the Combine depth chart and skips a receiver that is not READY now', async () => {
  const l = lab('sub-current');
  try {
    const dir = path.join(l.durableReportRoot, 'Combine', 'Scorecards');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'balanced.json'), JSON.stringify({ model: SCOUT_ROSTER['sideline-scout-balanced'], currentStatus: 'RATE LIMITED' }));
    fs.writeFileSync(path.join(dir, 'deep.json'), JSON.stringify({ model: SCOUT_ROSTER['sideline-scout-deep'], currentStatus: 'READY', lastTryoutAt: 'today' }));
    const launches = [];
    const completion = await runScoutPlay({
      playId: 'current', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')]
    }, {
      workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, contentionBackoffMs: 0,
      commandForScout: (scout) => { launches.push(scout.agent); return scout.agent === 'sideline-scout-quick' ? failing('database is locked') : succeeding(scout.id); }
    });
    assert.deepEqual(launches, ['sideline-scout-quick', 'sideline-scout-deep'], 'balanced (not READY) and scout (no scorecard = unknown) were passed over');
    assert.equal(completion.scouts[0].agent, 'sideline-scout-deep');
    const skipped = Object.fromEntries(completion.substitutions[0].skipped.map((s) => [s.id, s.reason]));
    assert.match(skipped['sideline-scout-balanced'], /RATE LIMITED/);
    assert.match(skipped['sideline-scout'], /readiness is unknown/);
  } finally { l.cleanup(); }
});

test('SUB-9. Substitution can be switched off in the manifest, and an ordinary all-success Formation is unchanged', async () => {
  const l = lab('sub-off');
  try {
    const off = await runScoutPlay({
      playId: 'off', gameRoot: l.gameRoot, maxConcurrency: 1, substitution: 'off', scouts: [lane('lane-a', 'sideline-scout-quick')]
    }, { workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, substituteEligibility: eligibleAll, commandForScout: () => failing('database is locked') });
    assert.equal(off.outcome, 'FAILED');
    assert.equal(off.scouts[0].attempts.length, 1);
    assert.equal(off.substitutions.length, 0);

    const ok = await runScoutPlay({
      playId: 'ok', gameRoot: l.gameRoot, maxConcurrency: 2, scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout')]
    }, { workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, commandForScout: (scout) => succeeding(scout.id) });
    assert.equal(ok.outcome, 'COMPLETE');
    assert.equal(ok.scoutsSubstituted, 0);
    assert.deepEqual(ok.scouts.map((s) => s.attempts.length), [1, 1]);
    const master = fs.readFileSync(ok.masterReportPath, 'utf8');
    assert.match(master, /FORMATION COMPLETE · 2\/2 lanes completed · 0 substitutions/);
    assert.match(master, /only-lane-a/);
    assert.match(master, /only-lane-b/);
    assert.match(master, /Substitutions: 0/, 'no injuries, none claimed');
    assert.doesNotMatch(master, /benched:/, 'nobody was benched');
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------- one clickable handoff

test('SUB-10. The master report is FORMATION-RESULT.md in the durable Play folder, and the handoff ends with ONLY its absolute clickable path', async () => {
  const l = lab('sub-handoff');
  try {
    const completion = await runScoutPlay({
      playId: 'handoff', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')]
    }, { workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, commandForScout: (scout) => succeeding(scout.id) });
    assert.equal(completion.masterReportPath, path.join(l.durableReportRoot, 'handoff', 'FORMATION-RESULT.md'));
    assert.ok(path.isAbsolute(completion.masterReportPath));
    assert.equal(fs.existsSync(completion.masterReportPath), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(l.durableReportRoot, 'handoff', 'SCOUT-PLAY-COMPLETE.json'), 'utf8')).masterReportPath, completion.masterReportPath);
    const lines = formatScoutPlayHandoff(completion);
    assert.equal(lines.at(-1), `${completion.masterReportPath}:1`);
    assert.match(lines[0], /^FORMATION COMPLETE · 1\/1 lane completed · 0 substitutions · elapsed \d\d:\d\d:\d\d$/);
    assert.ok(lines.slice(0, -1).every((line) => !line.includes('.md')), 'no other path competes with the final one');
  } finally { l.cleanup(); }
});

test('SUB-11. The real CLI ends a failed Formation with a headline and a final line that is the clickable master report path', () => {
  const l = lab('sub-cli');
  try {
    const manifest = path.join(l.root, 'play.json');
    fs.writeFileSync(manifest, JSON.stringify({ playId: 'cli-play', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')] }));
    // node stands in for opencode: `node run --agent ...` fails at once with a non-infrastructure error.
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'tools', 'scouts', 'run-scout-play.mjs'), '--manifest', manifest, '--workspace-root', l.workspaceRoot, '--reports-root', l.durableReportRoot, '--opencode', process.execPath], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    const lines = run.stdout.split(/\r?\n/).filter((line) => line.length);
    const finalLine = lines.at(-1);
    assert.equal(finalLine, `${path.join(l.durableReportRoot, 'cli-play', 'FORMATION-RESULT.md')}:1`);
    assert.match(lines[0], /^FORMATION FAILED · 0\/1 lane completed · 0 substitutions · elapsed \d\d:\d\d:\d\d$/);
    assert.equal(lines.filter((line) => /FORMATION-RESULT\.md/.test(line)).length, 1, 'exactly one report path is printed');
    assert.equal(fs.existsSync(finalLine.slice(0, -2)), true, 'the path opens a real master report');
    assert.match(fs.readFileSync(finalLine.slice(0, -2), 'utf8'), /FAILED \/ BLOCKED ATTEMPTS/, 'even a FAILED Formation leaves an inspectable truthful parent');
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------- product Formation engine

function productLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-sub-formation-'));
  const gameRoot = path.join(root, 'Game');
  const durableReportRoot = path.join(root, 'Durable');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.mkdirSync(durableReportRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  return { root, gameRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const goodReport = (label) => `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee src/example.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/example.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
const OK = (id) => ({ state: 'COMPLETE', stdout: goodReport(id), stderr: '', model: `m-${id}`, startedAt: '2026-09-20T13:00:00.000Z', endedAt: '2026-09-20T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true });
const BLOCKED = { state: 'BLOCKED', stdout: '', stderr: 'rate limited', exitCode: null, signal: null, readOnlyContractHeld: true, failureBoundary: 'RATE LIMITED: HTTP 429 from provider.' };
function candidate(id, { eligible = () => ({ eligible: true, reason: 'fixture eligible' }), outcome, log } = {}) {
  return {
    id, player: `Player-${id}`, provider: `Provider-${id}`, eligible,
    createExecutor() {
      return { id, player: `Player-${id}`, harness: 'h', provider: `Provider-${id}`, async execute() { log?.push(id); await new Promise((resolve) => setTimeout(resolve, 5)); return outcome ? outcome() : OK(id); } };
    }
  };
}

test('SUB-12. Product Formation: a BLOCKED lane is taken over by the next currently-eligible candidate; the survivor runs once; the failed attempt is preserved; the parent says so', async () => {
  const l = productLayout();
  try {
    const log = [];
    const candidates = [candidate('a', { outcome: () => BLOCKED, log }), candidate('b', { log }), candidate('c', { log })];
    const completion = await runScoutFormation({ objective: 'Substitution objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates, formationSize: 2 });
    assert.equal(completion.outcome, 'COMPLETE');
    assert.equal(completion.scoutsRequested, 2, 'the Play sets the lane count, not the identity of the first receiver');
    assert.deepEqual(log.sort(), ['a', 'b', 'c'], 'b (the survivor) ran exactly once');
    assert.deepEqual(completion.attempts.map((attempt) => attempt.executorId).sort(), ['b', 'c'], 'attempts is one FINAL attempt per lane');
    assert.deepEqual(completion.preservedAttempts.map((attempt) => [attempt.executorId, attempt.completionState]), [['a', 'BLOCKED']]);
    assert.equal(completion.substitutions[0].failedReceiver, 'a');
    assert.equal(completion.substitutions[0].replacement, 'c');
    assert.equal(completion.substitutions[0].failureClass, 'availability');
    const result = fs.readFileSync(completion.resultPath, 'utf8');
    assert.match(result, /Substitutions \(injured list\):/);
    assert.match(result, /Lane a: a → c/);
    assert.ok(fs.existsSync(path.join(completion.durablePath, 'FORMATION-COMPLETE.json')));
  } finally { l.cleanup(); }
});

test('SUB-13. Product Formation: gated by CURRENT eligibility; with none, the Formation is a truthful PARTIAL and the parent still exists', async () => {
  const l = productLayout();
  try {
    const candidates = [
      candidate('a', { outcome: () => BLOCKED }),
      candidate('b'),
      candidate('c', { eligible: () => ({ eligible: false, reason: 'Combine scorecard status is RATE LIMITED, not READY.' }) })
    ];
    const completion = await runScoutFormation({ objective: 'No bench objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates, players: ['a', 'b'] });
    assert.equal(completion.outcome, 'PARTIAL');
    assert.equal(completion.substitutions[0].replacement, null);
    assert.match(completion.substitutions[0].skipped.find((s) => s.id === 'c').reason, /RATE LIMITED/);
    assert.equal(completion.scoutsCompleted, 1);
    const result = fs.readFileSync(completion.resultPath, 'utf8');
    assert.match(result, /NO eligible substitute remained/);
    assert.ok(fs.existsSync(completion.attempts.find((attempt) => attempt.executorId === 'b').durableReportPath), 'the surviving child report is intact');
  } finally { l.cleanup(); }
});

test('SUB-14. Product Formation: a completed-but-weak answer and an unidentified FAILED are not substituted; nobody runs twice; off means off; ordinary runs carry no substitution fields', async () => {
  const l = productLayout();
  try {
    const log = [];
    const weak = { state: 'COMPLETE', stdout: 'thin answer', stderr: '', model: 'm', exitCode: 0, signal: null, readOnlyContractHeld: true };
    const oddFail = { state: 'FAILED', stdout: '', stderr: 'boom', exitCode: 2, signal: null, readOnlyContractHeld: true, failureBoundary: 'Process exited with code 2.' };
    const c = await runScoutFormation({ objective: 'No sub objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates: [candidate('weak', { outcome: () => weak, log }), candidate('odd', { outcome: () => oddFail, log }), candidate('spare', { log })], players: ['weak', 'odd'] });
    assert.deepEqual(log.sort(), ['odd', 'weak'], 'the eligible spare was never fielded');
    assert.equal(c.substitutions, undefined);

    const twice = [];
    const chain = await runScoutFormation({ objective: 'Chain objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates: [candidate('a', { outcome: () => BLOCKED, log: twice }), candidate('b', { outcome: () => BLOCKED, log: twice }), candidate('c', { log: twice })], formationSize: 1 });
    assert.deepEqual(twice, ['a', 'b', 'c'], 'each receiver at most once, in depth-chart order');
    assert.equal(chain.outcome, 'COMPLETE');
    assert.equal(chain.attempts.length, 1);
    assert.equal(chain.preservedAttempts.length, 2);

    const off = await runScoutFormation({ objective: 'Off objective.', gameRoot: l.gameRoot, durableReportRoot: l.durableReportRoot, candidates: [candidate('a', { outcome: () => BLOCKED }), candidate('b')], formationSize: 1, substitution: 'off' });
    assert.equal(off.outcome, 'BLOCKED');
    assert.equal(off.substitutions, undefined);
  } finally { l.cleanup(); }
});
