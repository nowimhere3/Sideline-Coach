import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseReportProvenance } from '../out/report-provenance.js';
import { runScoutCombine } from '../out/scout-combine.js';
import { runCoachRefresh } from '../out/scout-coach-refresh.js';
import { runScoutFormation } from '../out/scout-formation.js';
import { ensureScoutIntelligenceRoot } from '../out/scout-intelligence-root.js';
import {
  disposableScaffolding,
  releaseReceiverScaffolding,
  summarizeWorkHygiene
} from '../out/scout-work-hygiene.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const NOW = '2026-09-19T15:00:00.000Z';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-hygiene-'));
  const scoutRoot = path.join(root, 'Scout Intelligence');
  ensureScoutIntelligenceRoot(scoutRoot);
  const gameRoot = path.join(root, 'Game');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture-game"}\n');
  return { root, scoutRoot, gameRoot, work: path.join(scoutRoot, 'Work'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function snapshot(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { out[`${path.relative(dir, full)}/`] = 'dir'; walk(full); }
      else out[path.relative(dir, full)] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

function bytes(target) {
  if (!fs.existsSync(target)) return 0;
  if (fs.statSync(target).isFile()) return fs.statSync(target).size;
  const dir = target;
  let total = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full); else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

const inside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const REPORT = 'This report is reconnaissance, not final architectural authority.\n# Executive answer\nOK\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n';

/** What a real OpenCode attempt leaves in a receiver's folder: a plugin node_modules around a tiny agent record, plus a session store. */
const LIGHT = { files: 12, kb: 16 };   // default: cheap, proves behavior
const HEAVY = { files: 24, kb: 256 };  // ~6 MB, few files: only for the storage-reduction measurement
function writeOpenCodeScaffolding(playerPath, scale = LIGHT) {
  const config = path.join(playerPath, '.opencode-combine');
  fs.mkdirSync(path.join(config, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(config, 'agents', 'sideline-combine-scout.md'), 'x'.repeat(594));
  fs.writeFileSync(path.join(config, 'package.json'), '{"dependencies":{"@opencode-ai/plugin":"1.18.31"}}\n');
  fs.writeFileSync(path.join(config, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(config, '.gitignore'), '');
  for (let i = 0; i < scale.files; i += 1) {
    const pkg = path.join(config, 'node_modules', `pkg-${i}`);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'index.js'), 'a'.repeat(scale.kb * 1024));
  }
  const data = path.join(playerPath, '.opencode-combine-data', 'opencode');
  fs.mkdirSync(path.join(data, 'log'), { recursive: true });
  fs.writeFileSync(path.join(data, 'log', 'opencode.log'), 'log line\n'.repeat(200));
  fs.writeFileSync(path.join(data, 'opencode.db'), 'd'.repeat(scale === HEAVY ? 256 * 1024 : 8 * 1024));
}

const OUTCOMES = {
  COMPLETE: { state: 'COMPLETE', stdout: REPORT, stderr: '', model: 'm', startedAt: '2026-09-19T15:00:00.000Z', endedAt: '2026-09-19T15:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true },
  EMPTY: { state: 'COMPLETE', stdout: '', stderr: '', model: 'm', startedAt: '2026-09-19T15:00:00.000Z', endedAt: '2026-09-19T15:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true },
  BLOCKED: { state: 'BLOCKED', stdout: '', stderr: 'rate limited upstream\n', model: 'm', exitCode: 1, signal: null, readOnlyContractHeld: true, providerError: 'qwen is temporarily rate-limited upstream', failureBoundary: 'RATE LIMITED: qwen is temporarily rate-limited upstream' },
  FAILED: { state: 'FAILED', stdout: '', stderr: 'model produced nothing usable\n', model: 'm', exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'FAILED: fixture' }
};

/** A receiver that behaves like OpenCode: reads the Game as its target, leaves scaffolding in its own folder. */
function makeExecutor(id, mode, seen, scale = LIGHT) {
  return {
    id, player: `Player-${id}`, harness: 'OpenCode', provider: 'OpenRouter',
    async execute(envelope, context) {
      seen?.push({ id, gameRoot: context.gameRoot, playGameRoot: envelope.play.gameRoot, playerPath: context.playerPath });
      fs.readFileSync(path.join(context.gameRoot, 'package.json'), 'utf8');
      writeOpenCodeScaffolding(context.playerPath, scale);
      if (mode === 'THROW') throw new Error('harness crashed');
      return OUTCOMES[mode];
    }
  };
}

const prospect = (id) => ({
  candidateId: id, provider: 'openrouter', model: `openrouter/${id}`, displayName: `Prospect ${id}`, harness: 'opencode',
  discoveredAt: '2026-09-19T00:00:00.000Z', advertisedFree: true, supportsTools: true, sourceEvidence: 'fixture'
});
const discovery = (ids) => ({ discoveredAt: NOW, prospects: ids.map(prospect), sources: [{ id: 'openrouter', available: true, count: ids.length }, { id: 'opencode-hosted', available: true, count: 0 }] });

const combine = (l, { ids = ['one', 'two'], mode = 'COMPLETE', seen, scale, extra = {} } = {}) => runScoutCombine({
  gameRoot: l.gameRoot,
  durableReportRoot: l.scoutRoot,
  discovery: discovery(ids),
  executorFactory: (p) => makeExecutor(p.candidateId, typeof mode === 'function' ? mode(p.candidateId) : mode, seen, scale),
  budget: { maxTryouts: ids.length, maxConcurrency: 2 },
  processEnvironment: {},
  now: () => new Date(NOW),
  ...extra
});

const formationCandidate = (id, mode, seen, scale) => ({
  id, player: `Player-${id}`, provider: `Provider-${id}`,
  eligible: () => ({ eligible: true, reason: 'fixture' }),
  createExecutor: () => makeExecutor(id, mode, seen, scale)
});

const formation = (l, { modes = { one: 'COMPLETE', two: 'COMPLETE' }, seen, scale, extra = {} } = {}) => runScoutFormation({
  objective: 'Investigate the bounded fixture surface.',
  gameRoot: l.gameRoot,
  durableReportRoot: l.scoutRoot,
  candidates: Object.entries(modes).map(([id, mode]) => formationCandidate(id, mode, seen, scale)),
  formationSize: Object.keys(modes).length,
  now: () => new Date(NOW),
  reportAttribution: { gameId: 'game_hygiene', clientRef: 'play_hygiene' },
  ...extra
});

const noopRemove = () => {};

// --- The rule itself -------------------------------------------------------------------------------

test('Hygiene-1. The disposable set is an explicit two-item allowlist, and never names evidence', () => {
  assert.deepEqual(disposableScaffolding(false), [path.join('.opencode-combine', 'node_modules')]);
  assert.deepEqual(disposableScaffolding(true), [path.join('.opencode-combine', 'node_modules'), '.opencode-combine-data']);
  for (const evidence of ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md', 'agents', 'package.json', 'package-lock.json', '.gitignore']) {
    for (const target of [...disposableScaffolding(true)]) {
      assert.ok(!target.split(path.sep).includes(evidence), `${evidence} is not disposable`);
    }
  }
});

test('Hygiene-2. Completed: removes node_modules and the session store; keeps every byte of evidence and the agent/version record', async () => {
  const l = layout();
  try {
    const receiver = path.join(l.root, 'receiver');
    fs.mkdirSync(receiver);
    writeOpenCodeScaffolding(receiver);
    for (const name of ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md']) fs.writeFileSync(path.join(receiver, name), name);
    const result = await releaseReceiverScaffolding(receiver, { complete: true });
    assert.deepEqual(result.removed, [path.join('.opencode-combine', 'node_modules'), '.opencode-combine-data']);
    assert.deepEqual(result.failed, []);
    assert.equal(fs.existsSync(path.join(receiver, '.opencode-combine', 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(receiver, '.opencode-combine-data')), false);
    for (const kept of ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md', path.join('.opencode-combine', 'agents', 'sideline-combine-scout.md'), path.join('.opencode-combine', 'package.json'), path.join('.opencode-combine', 'package-lock.json'), path.join('.opencode-combine', '.gitignore')]) {
      assert.ok(fs.existsSync(path.join(receiver, kept)), `${kept} is retained`);
    }
    // Idempotent, and absent paths are not errors.
    assert.deepEqual(await releaseReceiverScaffolding(receiver, { complete: true }), { removed: [], failed: [] });
    assert.deepEqual(await releaseReceiverScaffolding(path.join(l.root, 'does-not-exist'), { complete: true }), { removed: [], failed: [] });
  } finally { l.cleanup(); }
});

test('Hygiene-3. Not completed: removes ONLY node_modules; the session store stays as forensic evidence', async () => {
  const l = layout();
  try {
    const receiver = path.join(l.root, 'receiver');
    fs.mkdirSync(receiver);
    writeOpenCodeScaffolding(receiver);
    const result = await releaseReceiverScaffolding(receiver, { complete: false });
    assert.deepEqual(result.removed, [path.join('.opencode-combine', 'node_modules')]);
    assert.equal(fs.existsSync(path.join(receiver, '.opencode-combine-data', 'opencode', 'log', 'opencode.log')), true);
    assert.equal(fs.existsSync(path.join(receiver, '.opencode-combine-data', 'opencode', 'opencode.db')), true);
  } finally { l.cleanup(); }
});

test('Hygiene-4. Cleanup never throws: an error is returned as data, and other targets are still attempted', async () => {
  const l = layout();
  try {
    const receiver = path.join(l.root, 'receiver');
    fs.mkdirSync(receiver);
    writeOpenCodeScaffolding(receiver);
    const attempted = [];
    const result = await releaseReceiverScaffolding(receiver, {
      complete: true,
      remove: (target) => {
        attempted.push(path.basename(target));
        if (target.endsWith('node_modules')) throw new Error('EBUSY: resource busy or locked');
        fs.rmSync(target, { recursive: true, force: true });
      }
    });
    assert.deepEqual(attempted, ['node_modules', '.opencode-combine-data'], 'one failure does not stop the next target');
    assert.deepEqual(result.removed, ['.opencode-combine-data']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].path, path.join('.opencode-combine', 'node_modules'));
    assert.match(result.failed[0].message, /EBUSY/);
    const rejecting = await releaseReceiverScaffolding(receiver, { complete: true, remove: () => Promise.reject(new Error('EPERM: operation not permitted')) });
    assert.equal(rejecting.failed.length, 1, 'an asynchronous rejection is captured as data too');
    assert.match(rejecting.failed[0].message, /EPERM/);
    const summary = summarizeWorkHygiene([{ receiver: 'one', result }, { receiver: 'two', result: undefined }]);
    assert.deepEqual(summary, { receiversCleaned: 1, pathsRemoved: 1, failures: [{ receiver: 'one', path: path.join('.opencode-combine', 'node_modules'), message: 'EBUSY: resource busy or locked' }] });
  } finally { l.cleanup(); }
});

// --- Combine: workspace ownership ---------------------------------------------------------------------

test('Hygiene-5. Combine defaults its working state to <Scout Intelligence>/Work; the Game stays the target and is not touched', async () => {
  const l = layout();
  try {
    const before = snapshot(l.gameRoot);
    const seen = [];
    const completion = await combine(l, { seen });
    assert.equal(completion.workspacePath, path.join(l.work, completion.combineId), 'canonical Work/<combineId>');
    assert.equal(inside(completion.workspacePath, l.gameRoot), false, 'outside the Game');
    for (const file of ['discovery.json', 'COMBINE-RESULT.md', 'COMBINE-COMPLETE.json']) assert.ok(fs.existsSync(path.join(completion.workspacePath, file)), `${file} under Work`);
    for (const id of ['one', 'two']) for (const file of ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md']) {
      assert.ok(fs.existsSync(path.join(completion.workspacePath, id, file)), `${id}/${file} under Work`);
    }
    assert.equal(seen.length, 2);
    for (const entry of seen) {
      assert.equal(entry.gameRoot, path.resolve(l.gameRoot), 'the Game is still each receiver\'s reconnaissance target');
      assert.equal(entry.playGameRoot, path.resolve(l.gameRoot));
      assert.equal(inside(entry.playerPath, l.gameRoot), false);
    }
    assert.equal(completion.gameRoot, path.resolve(l.gameRoot));
    assert.equal(fs.existsSync(path.join(l.gameRoot, 'Scouts')), false, 'no <Game>/Scouts is created');
    assert.deepEqual(snapshot(l.gameRoot), before, 'no Game file added, changed or removed');
  } finally { l.cleanup(); }
});

test('Hygiene-6. Combine\'s explicit workspaceRoot override still wins, and Coach Refresh (which calls Combine) inherits the safe default', async () => {
  const l = layout();
  try {
    const custom = path.join(l.root, 'Diagnostic Workspaces');
    const overridden = await combine(l, { extra: { workspaceRoot: custom } });
    assert.equal(overridden.workspacePath, path.join(custom, overridden.combineId));

    const l2 = layout();
    try {
      const refreshed = await runCoachRefresh({
        gameRoot: l2.gameRoot, durableReportRoot: l2.scoutRoot, discovery: discovery(['one']),
        executorFactory: (p) => makeExecutor(p.candidateId, 'COMPLETE'), processEnvironment: {}, now: () => new Date(NOW)
      });
      assert.equal(path.dirname(refreshed.workspacePath), l2.work);
      assert.equal(fs.existsSync(path.join(l2.gameRoot, 'Scouts')), false);
    } finally { l2.cleanup(); }
  } finally { l.cleanup(); }
});

test('Hygiene-7. A historical <Game>/Scouts folder is neither migrated nor modified by Combine', async () => {
  const l = layout();
  try {
    fs.mkdirSync(path.join(l.gameRoot, 'Scouts', 'Combine__2026-09-01_000000_000_MDT'), { recursive: true });
    fs.writeFileSync(path.join(l.gameRoot, 'Scouts', 'Combine__2026-09-01_000000_000_MDT', 'discovery.json'), '{"historical":true}');
    const before = snapshot(l.gameRoot);
    await combine(l);
    assert.deepEqual(snapshot(l.gameRoot), before);
  } finally { l.cleanup(); }
});

// --- Durable evidence intact -----------------------------------------------------------------------------

test('Hygiene-8. Combine: scorecards and durable run evidence are identical whether or not cleanup ran, and identical when cleanup FAILS', async () => {
  const [a, b, c] = [layout(), layout(), layout()];
  try {
    const control = await combine(a, { extra: { removeWorkPath: noopRemove } });
    const cleaned = await combine(b);
    const failing = await combine(c, { extra: { removeWorkPath: () => { throw new Error('EBUSY: locked'); } } });
    const card = (l, id) => JSON.parse(fs.readFileSync(path.join(l.scoutRoot, 'Combine', 'Scorecards', `${id}.json`), 'utf8'));
    for (const id of ['one', 'two']) {
      const pick = (x) => ({ currentStatus: x.currentStatus, totals: x.totals, routeAttempts: x.routeAttempts, notes: x.notes, availabilityEvidence: x.availabilityEvidence });
      assert.deepEqual(pick(card(b, id)), pick(card(a, id)), `${id}: scorecard semantics unchanged by cleanup`);
      assert.deepEqual(pick(card(c, id)), pick(card(a, id)), `${id}: scorecard unchanged even when cleanup fails`);
    }
    for (const [l, completion] of [[a, control], [b, cleaned], [c, failing]]) {
      const durable = path.join(l.scoutRoot, 'Combine', 'Runs', completion.combineId);
      for (const file of ['COMBINE-RESULT.md', 'COMBINE-COMPLETE.json', 'DISCOVERY.json', 'one-SCOUT-REPORT.md', 'two-SCOUT-REPORT.md']) assert.ok(fs.existsSync(path.join(durable, file)), file);
      assert.equal(completion.durablePath, durable);
    }
    assert.deepEqual(cleaned.attempts.map((x) => [x.completionState, x.reportCreated, x.evaluation.reportStructurallyUsable]), control.attempts.map((x) => [x.completionState, x.reportCreated, x.evaluation.reportStructurallyUsable]));
    assert.deepEqual(cleaned.scorecardUpdates, control.scorecardUpdates);
    assert.equal(cleaned.readyDepthChartChanged, control.readyDepthChartChanged);
  } finally { a.cleanup(); b.cleanup(); c.cleanup(); }
});

test('Hygiene-9. Formation: durable parent, children and S35 provenance are intact after cleanup; the hygiene summary is recorded on disk', async () => {
  const l = layout();
  try {
    const completion = await formation(l);
    const durable = path.join(l.scoutRoot, 'Formations', completion.formationId);
    assert.equal(completion.resultPath, path.join(durable, 'FORMATION-RESULT.md'));
    assert.deepEqual(JSON.parse(JSON.stringify(parseReportProvenance(fs.readFileSync(completion.resultPath, 'utf8')))), {
      gameId: 'game_hygiene', clientRef: 'play_hygiene', playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation', at: completion.endedAt
    });
    assert.deepEqual(completion.children, ['one-SCOUT-REPORT.md', 'two-SCOUT-REPORT.md']);
    for (const child of completion.children) assert.ok(fs.existsSync(path.join(durable, child)));
    assert.equal(completion.outcome, 'COMPLETE');
    assert.deepEqual(completion.workspaceHygiene, { receiversCleaned: 2, pathsRemoved: 4, failures: [] });
    const onDisk = JSON.parse(fs.readFileSync(path.join(durable, 'FORMATION-COMPLETE.json'), 'utf8'));
    assert.deepEqual(onDisk.workspaceHygiene, completion.workspaceHygiene, 'recorded in the durable machine-readable completion');
    assert.ok(!/workspaceHygiene|cleanup|scaffolding|node_modules/i.test(fs.readFileSync(completion.resultPath, 'utf8')), 'the Dad-facing parent says nothing about housekeeping');
  } finally { l.cleanup(); }
});

// --- Bounded growth --------------------------------------------------------------------------------------

test('Hygiene-10. A successful run leaves no regenerable scaffolding, and storage drops by orders of magnitude (measured)', async (t) => {
  const [control, treated] = [layout(), layout()];
  try {
    const before = await formation(control, { scale: HEAVY, extra: { removeWorkPath: noopRemove } }); // scaffolding left in place
    const after = await formation(treated, { scale: HEAVY });
    const [full, lean] = [bytes(before.workspacePath), bytes(after.workspacePath)];
    const evidence = (dir) => ['one', 'two'].reduce((sum, id) => sum + ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md'].reduce((s, f) => s + bytes(path.join(dir, id, f)), 0), 0);
    t.diagnostic(`Formation Work folder, 2 receivers: ${(full / 1024).toFixed(0)} KB without cleanup -> ${(lean / 1024).toFixed(1)} KB with cleanup (${((1 - lean / full) * 100).toFixed(1)}% reduction); evidence bytes retained: ${evidence(after.workspacePath)}`);
    for (const id of ['one', 'two']) {
      assert.equal(fs.existsSync(path.join(after.workspacePath, id, '.opencode-combine', 'node_modules')), false);
      assert.equal(fs.existsSync(path.join(after.workspacePath, id, '.opencode-combine-data')), false);
    }
    assert.ok(full > 4 * 1024 * 1024, 'the control really holds the scaffolding');
    assert.ok(lean < 0.02 * full, `cleanup removes >98% (${lean} of ${full} bytes remain)`);
    assert.equal(evidence(after.workspacePath), evidence(before.workspacePath), 'every evidence byte is retained');
    const combined = await combine(treated, { scale: HEAVY });
    assert.ok(bytes(combined.workspacePath) < 200 * 1024, 'a Combine run is bounded the same way');
  } finally { control.cleanup(); treated.cleanup(); }
});

// --- Failure safety ----------------------------------------------------------------------------------------

test('Hygiene-11. BLOCKED / FAILED / thrown / empty-COMPLETE attempts keep enough forensic truth, and their outcomes are not disturbed', async () => {
  const [a, b, c] = [layout(), layout(), layout()];
  try {
    // Formation is bounded at 3 receivers, so the three hard-failure shapes run together...
    const modes = { blocked: 'BLOCKED', failed: 'FAILED', crashed: 'THROW' };
    const control = await formation(a, { modes, extra: { removeWorkPath: noopRemove } });
    const treated = await formation(b, { modes });
    // ...and "COMPLETE but no report was produced" (so no durable report exists) runs on its own.
    const empty = await formation(c, { modes: { empty: 'EMPTY' } });

    const shape = (x) => [x.executorId, x.completionState, x.failureBoundary, x.reportCreated];
    assert.deepEqual(treated.attempts.map(shape), control.attempts.map(shape), 'outcomes and boundaries identical to the no-cleanup control');
    assert.equal(treated.outcome, control.outcome);
    assert.equal(treated.outcome, 'BLOCKED');
    for (const [completion, ids] of [[treated, Object.keys(modes)], [empty, ['empty']]]) {
      for (const id of ids) {
        const dir = path.join(completion.workspacePath, id);
        assert.equal(fs.existsSync(path.join(dir, '.opencode-combine', 'node_modules')), false, `${id}: regenerable node_modules gone`);
        assert.equal(fs.existsSync(path.join(dir, '.opencode-combine-data', 'opencode', 'log', 'opencode.log')), true, `${id}: session log retained`);
        assert.equal(fs.existsSync(path.join(dir, '.opencode-combine-data', 'opencode', 'opencode.db')), true, `${id}: session store retained`);
        for (const kept of ['stdout.log', 'stderr.log', 'telemetry.json', path.join('.opencode-combine', 'agents', 'sideline-combine-scout.md'), path.join('.opencode-combine', 'package.json')]) {
          assert.ok(fs.existsSync(path.join(dir, kept)), `${id}: ${kept} retained`);
        }
      }
    }
    assert.equal(empty.attempts[0].completionState, 'COMPLETE');
    assert.equal(empty.attempts[0].reportCreated, false, 'a COMPLETE attempt with no durable report is NOT treated as safely secured');
    assert.match(fs.readFileSync(path.join(treated.workspacePath, 'blocked', 'stderr.log'), 'utf8'), /rate limited upstream/);
    const telemetry = JSON.parse(fs.readFileSync(path.join(treated.workspacePath, 'blocked', 'telemetry.json'), 'utf8'));
    assert.equal(telemetry.completionState, 'BLOCKED');
    assert.match(telemetry.failureBoundary, /RATE LIMITED/);
    assert.deepEqual([treated.workspaceHygiene.receiversCleaned, treated.workspaceHygiene.pathsRemoved], [3, 3], 'only node_modules, once per receiver');
    assert.deepEqual([empty.workspaceHygiene.receiversCleaned, empty.workspaceHygiene.pathsRemoved], [1, 1]);
  } finally { a.cleanup(); b.cleanup(); c.cleanup(); }
});

test('Hygiene-12. A cleanup FAILURE is a separate filesystem fact: it never changes a Formation outcome, an attempt, or a scorecard', async () => {
  const [a, b] = [layout(), layout()];
  try {
    const control = await formation(a, { extra: { removeWorkPath: noopRemove } });
    const failing = await formation(b, { extra: { removeWorkPath: () => { throw new Error('EBUSY: resource busy or locked'); } } });

    assert.equal(failing.outcome, 'COMPLETE', 'a valid Scout result stays valid');
    assert.equal(failing.outcome, control.outcome);
    assert.equal(failing.scoutsCompleted, 2);
    assert.equal(failing.scoutsFailed, 0);
    assert.equal(failing.scoutsBlocked, 0);
    assert.deepEqual(failing.attempts.map((x) => [x.completionState, x.reportCreated, x.failureBoundary, x.providerError, x.rateLimitOrQuotaEvent]), control.attempts.map((x) => [x.completionState, x.reportCreated, x.failureBoundary, x.providerError, x.rateLimitOrQuotaEvent]));
    assert.ok(!JSON.stringify(failing.attempts).includes('EBUSY'), 'the error is not inside any attempt');
    assert.ok(!JSON.stringify(failing.synthesis).includes('EBUSY'), 'nor in the synthesis');
    assert.ok(!fs.readFileSync(failing.resultPath, 'utf8').includes('EBUSY'), 'nor in the Dad-facing parent');
    assert.deepEqual(failing.children, control.children);
    assert.equal(failing.workspaceHygiene.receiversCleaned, 0);
    assert.equal(failing.workspaceHygiene.failures.length, 4, 'two targets x two receivers, each reported');
    for (const failure of failing.workspaceHygiene.failures) assert.match(failure.message, /EBUSY/);
    assert.ok(fs.existsSync(path.join(failing.workspacePath, 'one', '.opencode-combine', 'node_modules')), 'the uncleaned scaffolding is simply still there');
    assert.ok(fs.existsSync(path.join(b.scoutRoot, 'Formations', failing.formationId, 'FORMATION-RESULT.md')), 'durable evidence is unaffected');
  } finally { a.cleanup(); b.cleanup(); }
});

test('Hygiene-13. Cleanup never touches a Game: even Game folders that look like scaffolding are left byte-identical', async () => {
  const l = layout();
  try {
    writeOpenCodeScaffolding(path.join(l.gameRoot, 'looks-like-a-receiver'));
    fs.mkdirSync(path.join(l.gameRoot, 'node_modules', 'left-pad'), { recursive: true });
    fs.writeFileSync(path.join(l.gameRoot, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;');
    const before = snapshot(l.gameRoot);
    await formation(l);
    await combine(l);
    assert.deepEqual(snapshot(l.gameRoot), before);
  } finally { l.cleanup(); }
});

// --- Wiring guards ---------------------------------------------------------------------------------------------

test('Hygiene-14. Source contract: Combine has no Game-derived default, and its CLIs pass no override', () => {
  const combineSource = fs.readFileSync(path.join(repoRoot, 'src', 'scout-combine.ts'), 'utf8');
  assert.match(combineSource, /request\.workspaceRoot \?\? resolveScoutWorkRoot\(request\.durableReportRoot\)/);
  assert.ok(!/path\.join\(gameRoot, 'Scouts'\)/.test(combineSource), 'the Game-local fallback is gone from Combine');
  for (const cli of ['run-scout-combine.mjs', 'run-coach-refresh.mjs']) {
    const source = fs.readFileSync(path.join(repoRoot, 'tools', 'scouts', cli), 'utf8');
    assert.match(source, /resolveDevelopmentScoutIntelligenceRoot\(\)/);
    assert.ok(!/workspaceRoot/.test(source), `${cli} passes no workspaceRoot, so it inherits <dev Scout root>/Work`);
  }
  // The audit's shell-independence (no `tar`) has its own tests in vsix-entries.test.mjs.
});
