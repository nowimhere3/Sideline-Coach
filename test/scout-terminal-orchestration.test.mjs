/**
 * Scout terminal orchestration: automatic same-lane substitution (broadened), Player provenance,
 * the ONE compiled master report, the running clock, and the final clickable handoff.
 *
 * A receiver is a Player, not the Play. If the Player goes down, the Play survives.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runScoutPlay, formatScoutPlayHandoff, hashObjective, SCOUT_ROSTER } from '../out/scout-play-runner.js';
import { classifyReceiverFailure, laneAttemptCeiling } from '../out/scout-substitution.js';
import { extractReportSections, formatElapsed, renderMasterReport } from '../out/scout-master-report.js';
import { describeReceiver, REASONING_EFFORT_UNKNOWN, reasoningEffortFromDefinition } from '../out/scout-receiver-identity.js';
import { ScoutTerminalView } from '../out/scout-terminal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// ---------------------------------------------------------------- lab

const NAMES = {
  'sideline-scout-quick': 'North Mini Code',
  'sideline-scout': 'Laguna S 2.1',
  'sideline-scout-balanced': 'NVIDIA: Nemotron 3 Super (free)',
  'sideline-scout-deep': 'NVIDIA: Nemotron 3 Ultra (free)'
};

function lab(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  const gameRoot = path.join(root, 'Game With Spaces');
  const workspaceRoot = path.join(root, 'Work');
  const durableReportRoot = path.join(root, 'Scout Intelligence');
  fs.mkdirSync(path.join(gameRoot, '.opencode', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(durableReportRoot, 'Combine', 'Scorecards'), { recursive: true });
  for (const [agent, model] of Object.entries(SCOUT_ROSTER)) {
    // Only the balanced agent DECLARES a reasoning effort; the others do not, and must render UNKNOWN.
    const effort = agent === 'sideline-scout-balanced' ? 'reasoningEffort: high\n' : '';
    fs.writeFileSync(path.join(gameRoot, '.opencode', 'agents', `${agent}.md`), `---\nmode: primary\nmodel: ${model}\n${effort}permission:\n  "*": deny\n  read:\n    "*": allow\n  glob: allow\n  grep: allow\n  list: allow\n  external_directory: deny\n---\nRead only.\n`);
    fs.writeFileSync(path.join(durableReportRoot, 'Combine', 'Scorecards', `${agent}.json`), JSON.stringify({ model, displayName: NAMES[agent], currentStatus: 'READY', lastTryoutAt: 'today' }));
  }
  return { root, gameRoot, workspaceRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const lane = (id, agent) => ({ id, agent, objective: `Investigate bounded lane ${id}.` });
const node = (source) => ({ command: process.execPath, args: ['-e', source] });
const failing = (text, code = 1) => node(`process.stderr.write(${JSON.stringify(`${text}\n`)}); process.exit(${code});`);
const REPORT = (id, extra = '') => `# RESULT\nLane ${id} answer.\n# KEY DISCOVERIES\nDiscovery for ${id}: only-${id}.\n# FACT\nFact for ${id}.\n# INFERENCE\nInference for ${id}.\n# UNKNOWN\nUnknown for ${id}.\n# CONTRADICTION\n${extra || 'None.'}\n# IMPORTANT FILES / PATHS\nsrc/${id}.ts\n`;
const reporting = (id, extra = '', delay = 20) => node(`setTimeout(() => process.stdout.write(${JSON.stringify(REPORT(id, extra))}), ${delay});`);
const eligibleAll = () => ({ eligible: true, reason: 'test: eligible now' });
const base = (l, extra = {}) => ({ workspaceRoot: l.workspaceRoot, durableReportRoot: l.durableReportRoot, contentionBackoffMs: 0, substituteEligibility: eligibleAll, ...extra });

// ---------------------------------------------------------------- substitution

const INFRASTRUCTURE_CASES = {
  'rate limit': 'Error: rate limit exceeded, slow down',
  'HTTP 429': 'HTTP 429 Too Many Requests',
  'upstream unavailable': 'HTTP 503 Service Unavailable: upstream provider error',
  'quota exhausted': 'Error: quota exhausted for this key',
  'model unavailable': 'ProviderModelNotFoundError: model not found',
  'auth problem': 'Error: 401 unauthorized - invalid api key',
  'transport failure': 'Error: connect ECONNRESET 104.18.0.1:443',
  'database lock': 'Error: Unexpected error\n\ndatabase is locked',
  'migration race': 'Error: Unexpected error\n\nFailed query: CREATE TABLE `workspace` (',
  'process crash': 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'
};

test('ORCH-1..7. Every infrastructure/availability/execution failure class is replaced automatically, in the SAME lane, with the next currently-eligible Player', async () => {
  for (const [name, text] of Object.entries(INFRASTRUCTURE_CASES)) {
    const l = lab(`orch-class`);
    try {
      const launches = [];
      const completion = await runScoutPlay({ playId: 'p', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
        commandForScout: (scout) => { launches.push(scout.agent); return launches.length === 1 ? failing(text, name === 'process crash' ? 134 : 1) : reporting(scout.id); }
      }));
      assert.equal(completion.outcome, 'COMPLETE', name);
      assert.equal(completion.scouts[0].attempts.length, 2, name);
      assert.equal(completion.scouts[0].originalAgent, 'sideline-scout-quick', name);
      assert.notEqual(completion.scouts[0].agent, 'sideline-scout-quick', `${name}: a different Player finished the lane`);
      assert.equal(completion.scouts[0].attempts[0].replacedBy, completion.scouts[0].agent, name);
    } finally { l.cleanup(); }
  }
});

test('ORCH-5b. A process that cannot start, and a clean exit with no report, are replaced (non-human execution failures)', async () => {
  const l = lab('orch-start');
  try {
    const noStart = await runScoutPlay({ playId: 'nostart', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
      commandForScout: (scout) => (scout.agent === 'sideline-scout-quick' ? { command: path.join(l.root, 'definitely-not-a-binary.exe'), args: [] } : reporting(scout.id))
    }));
    assert.equal(noStart.outcome, 'COMPLETE');
    assert.equal(noStart.scouts[0].attempts[0].failureLabel, 'COULD NOT START');
    const empty = await runScoutPlay({ playId: 'empty', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
      commandForScout: (scout) => (scout.agent === 'sideline-scout-quick' ? node('') : reporting(scout.id))
    }));
    assert.equal(empty.outcome, 'COMPLETE');
    assert.equal(empty.scouts[0].attempts[0].state, 'FAILED', 'exit 0 with no report is not a completed Scout');
    assert.equal(empty.scouts[0].attempts[0].failureLabel, 'NO REPORT');
  } finally { l.cleanup(); }
});

test('ORCH-8. A deliberate human interrupt never triggers a replacement, and the Formation still ends with a master report', async () => {
  const l = lab('orch-abort');
  const controller = new AbortController();
  try {
    const launches = [];
    const promise = runScoutPlay({ playId: 'abort', gameRoot: l.gameRoot, maxConcurrency: 2, scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout')] }, base(l, {
      signal: controller.signal,
      commandForScout: (scout) => { launches.push(scout.agent); return node('setTimeout(() => {}, 5000);'); }
    }));
    setTimeout(() => controller.abort(), 120);
    const completion = await promise;
    assert.equal(completion.outcome, 'INTERRUPTED');
    assert.deepEqual(launches.sort(), ['sideline-scout', 'sideline-scout-quick'], 'nobody was fielded behind the human\'s back');
    assert.equal(completion.scoutsSubstituted, 0);
    assert.ok(completion.scouts.every((s) => s.attempts.length === 1 && s.attempts[0].failureClass === 'human-abort'));
    assert.equal(fs.existsSync(completion.masterReportPath), true);
    assert.match(fs.readFileSync(completion.masterReportPath, 'utf8'), /FORMATION INTERRUPTED/);
  } finally { l.cleanup(); }
});

test('ORCH-8b. Policy refusals, weak answers and unidentifiable failures are not routed around; unknown stays UNKNOWN', () => {
  const c = (input) => classifyReceiverFailure(input);
  assert.equal(c({ state: 'FAILED', text: 'Blocked by content policy: request refused due to safety filter' }).failureClass, 'policy');
  assert.equal(c({ state: 'FAILED', text: 'Blocked by content policy' }).substitutable, false);
  assert.equal(c({ state: 'COMPLETE', text: '429 rate limit' }).substitutable, false);
  assert.equal(c({ state: 'FAILED', text: 'boom at line 500' }).failureClass, 'unknown', 'a bare number in a stack trace is not an HTTP status');
  assert.equal(c({ state: 'FAILED', text: '', exitCode: 2 }).substitutable, false);
  assert.equal(c({ state: 'FAILED', text: '', killedBySignal: 'SIGSEGV' }).failureClass, 'execution', 'killed by a signal nobody requested');
  assert.equal(c({ state: 'FAILED', text: '', exitCode: 3221225477 }).failureClass, 'execution', 'Windows access-violation exit code');
  assert.equal(c({ state: 'FAILED', text: '429', humanAbort: true }).failureClass, 'human-abort');
  assert.equal(c({ state: 'FAILED', text: 'HTTP 502 Bad Gateway' }).label, 'PROVIDER UNAVAILABLE');
  assert.equal(c({ state: 'FAILED', text: 'rate limit' }).label, 'RATE LIMITED');
});

test('ORCH-10..12,15. The bench is the bound: each eligible Player once per lane, readiness re-read before EVERY substitution, exhaustion ends truthfully, all film kept', async () => {
  const l = lab('orch-bench');
  try {
    const asked = [];
    let deepReady = true;
    const launches = [];
    const completion = await runScoutPlay({ playId: 'bench', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
      substituteEligibility: (agent) => {
        asked.push(agent);
        if (agent === 'sideline-scout') return { eligible: false, reason: 'Laguna is RATE LIMITED right now' };
        if (agent === 'sideline-scout-balanced') { deepReady = false; return { eligible: true, reason: 'ready' }; } // balanced is ready now, but its failure will change the chart
        return deepReady ? { eligible: true, reason: 'ready' } : { eligible: false, reason: 'Nemotron Ultra went RATE LIMITED since the last decision' };
      },
      commandForScout: (scout) => { launches.push(scout.agent); return failing('HTTP 429 rate limit'); }
    }));
    assert.deepEqual(launches, ['sideline-scout-quick', 'sideline-scout-balanced'], 'Laguna skipped (not READY), Ultra skipped (no longer READY at the SECOND decision)');
    assert.equal(completion.outcome, 'FAILED');
    assert.equal(completion.substitutions.length, 2);
    assert.equal(completion.substitutions[0].replacement, 'sideline-scout-balanced');
    assert.equal(completion.substitutions[1].replacement, null);
    assert.match(completion.substitutions[1].skipped.find((s) => s.id === 'sideline-scout-deep').reason, /went RATE LIMITED since the last decision/);
    assert.ok(asked.filter((a) => a === 'sideline-scout').length >= 2, 'the depth chart was consulted again for the second decision');
    // Preserved film for both attempts.
    for (const attempt of completion.scouts[0].attempts) assert.match(fs.readFileSync(attempt.stderrPath, 'utf8'), /429/);
    assert.equal(laneAttemptCeiling(4), 5, 'ceiling is derived from the finite bench');
  } finally { l.cleanup(); }
});

test('ORCH-13,14. Surviving lanes are never restarted, and the canonical objective (and its hash) is identical across every attempt of the lane', async () => {
  const l = lab('orch-lanes');
  try {
    const launches = [];
    const prompts = [];
    const completion = await runScoutPlay({
      playId: 'lanes', gameRoot: l.gameRoot, maxConcurrency: 3,
      scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout'), lane('lane-c', 'sideline-scout-deep')]
    }, base(l, {
      commandForScout: (scout, prompt) => {
        launches.push(`${scout.id}:${scout.agent}`); prompts.push({ id: scout.id, prompt });
        if (scout.id === 'lane-a' && scout.agent === 'sideline-scout-quick') return failing('HTTP 429 rate limit');
        return reporting(scout.id, '', scout.id === 'lane-a' ? 20 : 250);
      }
    }));
    assert.equal(completion.outcome, 'COMPLETE');
    assert.equal(launches.filter((l2) => l2.startsWith('lane-b')).length, 1);
    assert.equal(launches.filter((l2) => l2.startsWith('lane-c')).length, 1);
    assert.deepEqual(completion.scouts.map((s) => s.attempts.length), [2, 1, 1]);

    const objective = 'Investigate bounded lane lane-a.';
    const laneA = prompts.filter((p) => p.id === 'lane-a');
    assert.equal(laneA.length, 2);
    for (const { prompt } of laneA) assert.ok(prompt.includes(`BOUNDED OBJECTIVE\n${objective}`), 'the objective is byte-identical for every Player');
    assert.equal(new Set(completion.scouts[0].attempts.map((a) => a.objectiveHash)).size, 1);
    assert.equal(completion.scouts[0].objectiveHash, hashObjective(objective));
    assert.equal(fs.readFileSync(path.join(completion.workspacePath, 'lane-a', 'objective.txt'), 'utf8'), `${objective}\n`, 'the saved objective never changed');
    // The substitute is told the lane's history — facts only.
    assert.doesNotMatch(laneA[0].prompt, /SAME LANE/);
    assert.match(laneA[1].prompt, /SAME LANE — PRIOR ATTEMPT/);
    assert.match(laneA[1].prompt, /RATE LIMITED/);
    assert.match(laneA[1].prompt, /left no usable partial output/);
  } finally { l.cleanup(); }
});

test('ORCH-14b. Useful partial output from a failed receiver is handed to the substitute as UNVERIFIED facts; an error message is not', async () => {
  const l = lab('orch-partial');
  try {
    const partial = `Partial finding: ${'the config loader reads src/config.ts and never validates ports. '.repeat(6)}`;
    const prompts = [];
    await runScoutPlay({ playId: 'partial', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
      commandForScout: (scout, prompt) => {
        prompts.push(prompt);
        return scout.agent === 'sideline-scout-quick' ? node(`process.stdout.write(${JSON.stringify(partial)}); process.stderr.write('HTTP 503 Service Unavailable upstream\\n'); process.exit(1);`) : reporting(scout.id);
      }
    }));
    assert.match(prompts[1], /Treat it as UNVERIFIED/);
    assert.ok(prompts[1].includes('the config loader reads src/config.ts'));
    assert.ok(prompts[0].indexOf('PARTIAL OUTPUT') === -1);
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------- OpenCode DB contention

test('ORCH-DB. Each attempt starts against its OWN OpenCode database (contention impossible), the DB is disposable, and inherit mode is explicit', async () => {
  const l = lab('orch-db');
  const previous = process.env.OPENCODE_DB;
  process.env.OPENCODE_DB = path.join(l.root, 'shared-scout.db');
  try {
    const printDb = (scout) => node(`process.stdout.write('DB=' + process.env.OPENCODE_DB + '\\n# RESULT\\nok ${scout.id}\\n');`);
    const isolated = await runScoutPlay({ playId: 'iso', gameRoot: l.gameRoot, maxConcurrency: 3, scouts: [lane('a', 'sideline-scout-quick'), lane('b', 'sideline-scout'), lane('c', 'sideline-scout-deep')] }, base(l, { commandForScout: printDb }));
    const dbs = isolated.scouts.map((s) => /DB=(.*)/.exec(fs.readFileSync(s.durableReportPath, 'utf8'))[1].trim());
    assert.equal(new Set(dbs).size, 3, 'no two concurrent receivers share a database');
    assert.ok(dbs.every((db) => db !== process.env.OPENCODE_DB && db.startsWith(isolated.workspacePath)), 'never the shared scout.db');
    assert.ok(isolated.scouts.every((s) => s.attempts[0].dbIsolation === 'per-attempt'));
    assert.ok(dbs.every((db) => !fs.existsSync(path.dirname(db))), 'disposable DB scaffolding is removed after the attempt');

    const inherited = await runScoutPlay({ playId: 'inh', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('a', 'sideline-scout')] }, base(l, { dbIsolation: 'inherit', commandForScout: printDb }));
    assert.equal(/DB=(.*)/.exec(fs.readFileSync(inherited.scouts[0].durableReportPath, 'utf8'))[1].trim(), process.env.OPENCODE_DB);
    assert.equal(inherited.scouts[0].attempts[0].dbIsolation, 'inherited');
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_DB; else process.env.OPENCODE_DB = previous;
    l.cleanup();
  }
});

// ---------------------------------------------------------------- provenance + compilation

test('ORCH-16..21. The master report says who ACTUALLY played: agent, provider, exact model, effort (or UNKNOWN), timing, and the substitution lineage', async () => {
  const l = lab('orch-prov');
  try {
    let tick = Date.parse('2026-09-20T18:00:00.000Z');
    const completion = await runScoutPlay({ playId: 'prov', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout-quick')] }, base(l, {
      now: () => new Date((tick += 1_000)),
      substituteEligibility: (agent) => (agent === 'sideline-scout' ? { eligible: false, reason: 'not READY' } : { eligible: true, reason: 'ready' }),
      commandForScout: (scout) => (scout.agent === 'sideline-scout-quick' ? failing('HTTP 429 rate limit') : reporting(scout.id))
    }));
    const [first, second] = completion.scouts[0].attempts;
    assert.deepEqual([first.agent, second.agent], ['sideline-scout-quick', 'sideline-scout-balanced'], 'the Player that finished was NOT the one originally assigned');
    assert.equal(second.provider, 'OpenRouter');
    assert.equal(second.model, 'openrouter/nvidia/nemotron-3-super-120b-a12b:free');
    assert.equal(second.displayName, 'NVIDIA: Nemotron 3 Super (free)');
    assert.equal(second.reasoningEffort, 'high', 'declared by the agent definition');
    assert.equal(first.reasoningEffort, REASONING_EFFORT_UNKNOWN, 'never fabricated');
    assert.match(REASONING_EFFORT_UNKNOWN, /UNKNOWN/);
    assert.deepEqual([first.durationMs, second.durationMs], [1000, 1000], 'per-attempt elapsed, from the injected clock');
    assert.equal(second.substituteFor, 'sideline-scout-quick');
    assert.equal(first.replacedBy, 'sideline-scout-balanced');
    assert.ok(completion.elapsedMs >= 2_000);

    const master = fs.readFileSync(completion.masterReportPath, 'utf8');
    assert.match(master, /^# FORMATION RESULT/m);
    assert.match(master, new RegExp(`TOTAL ELAPSED TIME: ${formatElapsed(completion.elapsedMs)}`));
    assert.match(master, /Total receiver attempts: 2/);
    assert.match(master, /Substitutions: 1/);
    assert.match(master, /## PLAYERS WHO TOOK THE FIELD/);
    const rows = master.split('\n').filter((line) => line.startsWith('| lane-a'));
    assert.equal(rows.length, 2, 'every attempt has a row');
    assert.match(rows[0], /North Mini Code \(sideline-scout-quick\).*OpenRouter.*openrouter\/cohere\/north-mini-code:free.*UNKNOWN - not exposed by provider.*00:00:01.*FAILED.*RATE LIMITED \[availability\].*replaced by sideline-scout-balanced/);
    assert.match(rows[1], /NVIDIA: Nemotron 3 Super \(free\) \(sideline-scout-balanced\).*OpenRouter.*nemotron-3-super-120b-a12b:free.*\| high \|.*00:00:01.*COMPLETE.*substituted for sideline-scout-quick/);
    assert.match(master, /- Lane lane-a: North Mini Code \(sideline-scout-quick\) → NVIDIA: Nemotron 3 Super \(free\) \(sideline-scout-balanced\) → COMPLETE/);
    assert.match(master, /North Mini Code \(sideline-scout-quick\) benched: RATE LIMITED/);
  } finally { l.cleanup(); }
});

test('ORCH-22..27. The master report compiles every child report with attribution, keeps contradictions unadjudicated, and shows unfilled lanes as UNKNOWN — for COMPLETE, PARTIAL and FAILED', async () => {
  const l = lab('orch-compile');
  try {
    const partial = await runScoutPlay({
      playId: 'compile', gameRoot: l.gameRoot, maxConcurrency: 3,
      scouts: [lane('lane-a', 'sideline-scout-quick'), lane('lane-b', 'sideline-scout'), lane('lane-c', 'sideline-scout-deep')]
    }, base(l, {
      substituteEligibility: (agent) => (agent === 'sideline-scout-balanced' ? { eligible: true, reason: 'ready' } : { eligible: false, reason: 'not READY' }),
      commandForScout: (scout) => {
        if (scout.id === 'lane-a') return scout.agent === 'sideline-scout-quick' ? failing('HTTP 429 rate limit') : failing('HTTP 429 rate limit');
        if (scout.id === 'lane-b') return reporting('lane-b', 'Lane C claims the retention seam is elsewhere; this Scout disagrees.');
        return reporting('lane-c');
      }
    }));
    assert.equal(partial.outcome, 'PARTIAL');
    const master = fs.readFileSync(partial.masterReportPath, 'utf8');
    // Both surviving child reports are present in the master, attributed to the Player that produced them.
    assert.match(master, /### Laguna S 2\.1 \(sideline-scout\)[\s\S]*only-lane-b/);
    assert.match(master, /### NVIDIA: Nemotron 3 Ultra \(free\) \(sideline-scout-deep\)[\s\S]*only-lane-c/);
    assert.match(master, /### Full report — lane lane-b/);
    assert.match(master, /### Full report — lane lane-c/);
    assert.match(master, /\*\*FACT:\*\* Fact for lane-b\./);
    assert.match(master, /\*\*INFERENCE:\*\* Inference for lane-c\./);
    assert.match(master, /\*\*Important files:\*\* src\/lane-b\.ts/);
    // Contradictions stay attributed and unadjudicated.
    assert.match(master, /## CONTRADICTIONS[\s\S]*- Laguna S 2\.1 \(sideline-scout\) · lane lane-b: Lane C claims/);
    assert.match(master, /not adjudicated/);
    // The lane that never completed is UNKNOWN territory, with its failed attempts as separate film.
    assert.match(master, /## UNKNOWN \/ UNFILLED TERRITORY[\s\S]*- lane-a: FAILED/);
    assert.match(master, /## FAILED \/ BLOCKED ATTEMPTS[\s\S]*Lane lane-a · attempt 2 · NVIDIA: Nemotron 3 Super/);
    assert.ok(master.includes(partial.scouts[0].attempts[0].stderrPath), 'failed film has evidence paths');
    assert.match(master, /## CHILD REPORTS/);

    const failed = await runScoutPlay({ playId: 'allfail', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')] }, base(l, { substitution: undefined, substituteEligibility: () => ({ eligible: false, reason: 'none' }), commandForScout: () => failing('HTTP 429 rate limit') }));
    assert.equal(failed.outcome, 'FAILED');
    const failedMaster = fs.readFileSync(failed.masterReportPath, 'utf8');
    for (const heading of ['# FORMATION RESULT', '## PLAYERS WHO TOOK THE FIELD', '## SUBSTITUTION CHAIN', '## DISCOVERIES BY PLAYER', '## COMBINED FORMATION FINDINGS', '## FAILED / BLOCKED ATTEMPTS', '## CONTRADICTIONS', '## UNKNOWN / UNFILLED TERRITORY', '## CHILD REPORTS']) assert.ok(failedMaster.includes(heading), `FAILED parent has ${heading}`);
    assert.match(failedMaster, /No Scout completed, so there are no discoveries to attribute/);
    assert.match(failedMaster, /NO ELIGIBLE SUBSTITUTE REMAINED/);

    const complete = await runScoutPlay({ playId: 'allok', gameRoot: l.gameRoot, maxConcurrency: 2, scouts: [lane('lane-a', 'sideline-scout'), lane('lane-b', 'sideline-scout-deep')] }, base(l, { commandForScout: (scout) => reporting(scout.id) }));
    assert.equal(complete.outcome, 'COMPLETE');
    assert.match(fs.readFileSync(complete.masterReportPath, 'utf8'), /Every requested lane returned a completed report/);
  } finally { l.cleanup(); }
});

test('ORCH-6b. Report identity extraction is defensive and mechanical: recognises headings, tolerates absence with UNKNOWN, never invents', () => {
  const rich = extractReportSections('## Executive answer\nIt works.\n**FACTS**\nA fact.\n### Inferences\nAn inference.\n# UNKNOWNS\nNone known.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/a.ts\n');
  assert.equal(rich.result, 'It works.');
  assert.equal(rich.facts, 'A fact.');
  assert.equal(rich.inferences, 'An inference.');
  assert.equal(rich.files, 'src/a.ts');
  assert.equal(rich.structured, true);
  const bare = extractReportSections('Just some prose with no headings at all.');
  assert.deepEqual([bare.result, bare.facts, bare.contradictions, bare.structured], ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', false]);
  assert.equal(reasoningEffortFromDefinition('---\nmode: primary\nmodel: x/y\n---\n'), undefined);
  assert.equal(reasoningEffortFromDefinition('---\nmode: primary\nreasoning_effort: medium\n---\n'), 'medium');
  const l = lab('orch-identity');
  try {
    const identity = describeReceiver({ gameRoot: l.gameRoot, scoutIntelligenceRoot: l.durableReportRoot, agent: 'sideline-scout', model: SCOUT_ROSTER['sideline-scout'] });
    assert.deepEqual([identity.provider, identity.displayName, identity.reasoningEffort], ['OpenRouter', 'Laguna S 2.1', REASONING_EFFORT_UNKNOWN]);
    const unlisted = describeReceiver({ gameRoot: l.gameRoot, scoutIntelligenceRoot: path.join(l.root, 'nowhere'), agent: 'sideline-scout', model: 'google/gemini-flash' });
    assert.equal(unlisted.provider, 'Google Gemini API');
    assert.equal(unlisted.displayName, 'gemini-flash');
  } finally { l.cleanup(); }
  assert.match(renderMasterReport({ playId: 'x', gameRoot: 'g', startedAt: 's', endedAt: 'e', elapsedMs: 3_723_000, outcome: 'FAILED', lanes: [], substitutions: [], durablePath: 'd', workspacePath: 'w' }), /TOTAL ELAPSED TIME: 01:02:03/);
});

// ---------------------------------------------------------------- clock + terminal UX

function fakeTerminal({ isTTY }) {
  const writes = [];
  const state = { t: 1_000_000, timers: new Map(), nextId: 1, cleared: [] };
  const view = new ScoutTerminalView({
    write: (text) => writes.push(text), isTTY, now: () => state.t,
    setTimer: (callback, ms) => { const id = state.nextId++; state.timers.set(id, { callback, ms }); return id; },
    clearTimer: (id) => { state.cleared.push(id); state.timers.delete(id); },
    fallbackIntervalMs: 30_000, columns: 100
  });
  return { view, writes, state, tick(ms) { state.t += ms; for (const timer of [...state.timers.values()]) timer.callback(); } };
}
const ev = {
  start: { type: 'formation-start', playId: 'p', lanes: 2 },
  queued: (lane, displayName) => ({ type: 'lane-queued', lane, receiver: 'r', displayName }),
  begin: (lane, displayName, attempt = 1) => ({ type: 'attempt-start', lane, attempt, receiver: 'r', displayName, model: 'm' }),
  end: (lane, displayName, label, durationMs = 1000, state = 'FAILED') => ({ type: 'attempt-end', lane, attempt: 1, receiver: 'r', displayName, state, label, durationMs }),
  swap: { type: 'substitute', lane: 'lane-a', from: 'x', fromName: 'Laguna S 2.1', to: 'y', toName: 'Nemotron 3 Super', label: 'RATE LIMITED', reason: 'r' },
  done: (lane) => ({ type: 'lane-complete', lane, receiver: 'r', displayName: 'n' })
};

test('ORCH-28..30,33. The clock starts with the Formation, advances on the injected clock, and stops on EVERY terminal outcome with nothing printed afterwards', () => {
  for (const outcome of ['COMPLETE', 'PARTIAL', 'FAILED', 'INTERRUPTED']) {
    const t = fakeTerminal({ isTTY: true });
    assert.equal(t.view.elapsedMs(), 0, 'no clock before the Formation begins');
    assert.deepEqual(t.writes, []);
    t.view.handle(ev.start);
    assert.match(t.writes.at(-1), /\[00:00:00\] SCOUTING · 0 running · 0 complete of 2 · 0 substitutions/);
    t.view.handle(ev.begin('lane-a', 'Laguna S 2.1'));
    t.tick(197_000);
    assert.match(t.writes.at(-1), /\[00:03:17\] SCOUTING · 1 running/, 'the running clock advances');
    assert.equal(t.state.timers.size, 1);
    t.view.handle({ type: 'formation-end', outcome, elapsedMs: 197_000 });
    t.view.stop();
    assert.equal(t.state.timers.size, 0, `no interval survives ${outcome}`);
    assert.equal(t.state.cleared.length, 1);
    const before = t.writes.length;
    t.tick(60_000);
    t.view.handle(ev.begin('lane-a', 'ghost'));
    t.view.line('LATE', 'must never appear');
    assert.equal(t.writes.length, before, 'nothing is printed after the handoff');
    assert.ok(t.view.suppressedAfterStop >= 2);
    t.view.stop(); // idempotent
  }
});

test('ORCH-9,34. Event lines carry time, lane, Player, failure meaning and the substitute; the TTY status line never corrupts them; non-TTY degrades to readable periodic lines', () => {
  const tty = fakeTerminal({ isTTY: true });
  tty.view.handle(ev.start);
  tty.view.handle(ev.queued('lane-a', 'Laguna S 2.1'));
  tty.tick(102_000);
  tty.view.handle(ev.end('lane-a', 'Laguna S 2.1', 'RATE LIMITED', 102_000));
  tty.view.handle(ev.swap);
  tty.view.handle(ev.begin('lane-a', 'Nemotron 3 Super', 2));
  tty.view.handle(ev.done('lane-a'));
  const joined = tty.writes.join('');
  assert.match(joined, /\[00:01:42\] \[RATE LIMITED\] lane-a · Laguna S 2\.1 \(elapsed 00:01:42\)\n/);
  assert.match(joined, /\[00:01:42\] \[SUBSTITUTE\] lane-a · Laguna S 2\.1 → Nemotron 3 Super\n/);
  assert.match(joined, /\[RUNNING\] lane-a · Nemotron 3 Super \(attempt 2\)/);
  assert.match(tty.writes.at(-1), /1 complete of 2 · 1 substitution/, 'counters are live');
  // Every event line is preceded by an erase of the live status line, so it can never be glued onto it.
  for (const write of tty.writes.filter((w) => w.includes('] [') && w.endsWith('\n'))) assert.ok(write.startsWith('\r\u001b[2K'), 'status line erased before an event');
  tty.view.stop();
  assert.equal(tty.writes.at(-1), '\r\u001b[2K', 'the live line is erased at stop');

  const plain = fakeTerminal({ isTTY: false });
  plain.view.handle(ev.start);
  plain.view.handle(ev.queued('lane-a', 'Laguna S 2.1'));
  for (let i = 0; i < 20; i += 1) plain.tick(30_000); // ten minutes
  plain.view.handle(ev.end('lane-a', 'Laguna S 2.1', 'RATE LIMITED', 600_000));
  const text = plain.writes.join('');
  assert.doesNotMatch(text, /\u001b|\r/, 'no escape codes or carriage returns off a TTY');
  assert.ok(plain.writes.length <= 25, `restrained: ${plain.writes.length} writes for ten minutes, not a flood`);
  assert.ok(plain.writes.every((w) => w.endsWith('\n')), 'every write is a whole line');
  assert.match(text, /\[00:10:00\] SCOUTING/);
  assert.match(text, /\[00:10:00\] \[RATE LIMITED\] lane-a · Laguna S 2\.1/);
  assert.equal(plain.state.timers.size, 1);
  plain.view.stop();
  assert.equal(plain.state.timers.size, 0);
});

test('ORCH-28,31,32. The runner emits formation-start first and formation-end last, and per-attempt and total elapsed use one injected clock', async () => {
  const l = lab('orch-clock');
  try {
    let tick = Date.parse('2026-09-20T18:00:00.000Z');
    const events = [];
    const completion = await runScoutPlay({ playId: 'clock', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')] }, base(l, {
      now: () => new Date((tick += 1_000)), onEvent: (event) => events.push(event.type),
      commandForScout: (scout) => reporting(scout.id)
    }));
    assert.equal(events[0], 'formation-start');
    assert.equal(events.at(-1), 'formation-end');
    assert.deepEqual(events.filter((e) => e === 'lane-complete'), ['lane-complete']);
    assert.equal(completion.scouts[0].attempts[0].durationMs, 1000);
    assert.equal(completion.elapsedMs, Date.parse(completion.endedAt) - Date.parse(completion.startedAt));
    assert.match(fs.readFileSync(completion.masterReportPath, 'utf8'), new RegExp(`TOTAL ELAPSED TIME: ${formatElapsed(completion.elapsedMs)}`));
    assert.equal(JSON.parse(fs.readFileSync(path.join(l.durableReportRoot, 'clock', 'SCOUT-PLAY-COMPLETE.json'), 'utf8')).elapsedMs, completion.elapsedMs);
  } finally { l.cleanup(); }
});

// ---------------------------------------------------------------- final handoff

test('ORCH-35..38. The handoff is compact, prints exactly ONE master-report path as the FINAL line, and --json is opt-in without polluting the ordinary output', { timeout: 90_000 }, () => {
  const l = lab('orch-handoff');
  try {
    const manifest = path.join(l.root, 'play.json');
    fs.writeFileSync(manifest, JSON.stringify({ playId: 'cli-play', gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')] }));
    const run = (extra = []) => {
      // Each run needs a fresh play id/folder.
      const id = `cli-${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(manifest, JSON.stringify({ playId: id, gameRoot: l.gameRoot, maxConcurrency: 1, scouts: [lane('lane-a', 'sideline-scout')] }));
      return { id, run: spawnSync(process.execPath, [path.join(repoRoot, 'tools', 'scouts', 'run-scout-play.mjs'), '--manifest', manifest, '--workspace-root', l.workspaceRoot, '--reports-root', l.durableReportRoot, '--opencode', process.execPath, ...extra], { encoding: 'utf8', timeout: 30_000 }) };
    };
    const plain = run();
    const lines = plain.run.stdout.split(/\r?\n/).filter((line) => line.length);
    const expected = `${path.join(l.durableReportRoot, plain.id, 'FORMATION-RESULT.md')}:1`;
    assert.equal(lines.at(-1), expected, 'the very last line is ONLY the absolute clickable path');
    assert.match(lines[0], /^FORMATION FAILED · 0\/1 lane completed · 0 substitutions · elapsed \d\d:\d\d:\d\d$/, 'compact headline');
    assert.equal(lines.filter((line) => /FORMATION-RESULT\.md/.test(line)).length, 1, 'exactly one canonical path');
    assert.ok(lines.length <= 4, `compact: ${lines.length} stdout lines`);
    assert.doesNotMatch(plain.run.stdout, /[{}]/, 'ordinary output carries no JSON');
    assert.match(plain.run.stderr, /\[QUEUED\] lane-a/);
    assert.match(plain.run.stderr, /\[RUNNING\] lane-a/);
    assert.match(plain.run.stderr, /\[FAILED\] lane-a/);
    assert.ok(path.isAbsolute(expected.slice(0, -2)));
    assert.equal(fs.existsSync(expected.slice(0, -2)), true);

    const json = run(['--json']);
    const jsonLines = json.run.stdout.split(/\r?\n/).filter((line) => line.length);
    assert.equal(jsonLines.at(-1), `${path.join(l.durableReportRoot, json.id, 'FORMATION-RESULT.md')}:1`, '--json still ends with the path');
    const body = json.run.stdout.slice(0, json.run.stdout.lastIndexOf('\n\nFORMATION'));
    assert.equal(JSON.parse(body).playId, json.id, '--json prints the machine completion, parseable, before the handoff');

    const handoff = formatScoutPlayHandoff({ outcome: 'PARTIAL', scoutsCompleted: 2, scoutsRequested: 3, scoutsSubstituted: 1, elapsedMs: 462_000, masterReportPath: 'C:\\x\\FORMATION-RESULT.md' });
    assert.deepEqual(handoff, ['FORMATION PARTIAL · 2/3 lanes completed · 1 substitution · elapsed 00:07:42', '', 'MASTER SCOUT REPORT:', 'C:\\x\\FORMATION-RESULT.md:1']);
  } finally { l.cleanup(); }
});
