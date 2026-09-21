import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { runCoachRefresh } from '../out/scout-coach-refresh.js';
import { ensureScoutIntelligenceRoot } from '../out/scout-intelligence-root.js';
import { ScoutPlayerAdapter } from '../out/scout-player.js';
import {
  SCOUT_BOOTSTRAP_CONSENT_KEY,
  ScoutBootstrapConsentStore,
  ScoutBootstrapError,
  ScoutBootstrapService
} from '../out/scout-bootstrap.js';
import { StadiumClient } from '../out/stadium-client.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const SECRET = 'sk-or-test-secret-1234567890abcdef';

// The built-in Gemini receiver becomes eligible when these exist on a developer machine. Keep the
// "no Scouts yet" baseline about the depth chart, not about whose environment runs the tests.
const savedEnv = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
test.after(() => { for (const [k, v] of Object.entries(savedEnv)) if (v !== undefined) process.env[k] = v; });

// --- fixtures ----------------------------------------------------------------------------------

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-bootstrap-'));
  const scoutRoot = path.join(root, 'Scout Intelligence');
  ensureScoutIntelligenceRoot(scoutRoot);
  const gameRoot = path.join(root, 'Game');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"fixture-game"}\n');
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  return { root, scoutRoot, gameRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Behaves like VS Code's globalState: values are serialized, so a "restart" only sees what was truly persisted. */
class FakeMemento {
  constructor(entries = []) { this.map = new Map(entries); this.updates = 0; }
  get(key) { return this.map.has(key) ? JSON.parse(this.map.get(key)) : undefined; }
  async update(key, value) { this.updates += 1; this.map.set(key, JSON.stringify(value)); }
  snapshot() { return [...this.map.entries()]; }
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

const bytes = (dir) => {
  let total = 0;
  const walk = (current) => { for (const e of fs.readdirSync(current, { withFileTypes: true })) { const f = path.join(current, e.name); if (e.isDirectory()) walk(f); else total += fs.statSync(f).size; } };
  if (fs.existsSync(dir)) walk(dir);
  return total;
};

const REPORT = 'This report is reconnaissance, not final architectural authority.\n# Executive answer\nOK\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n';

const stamp = () => ({ startedAt: new Date(Date.now() - 1000).toISOString(), endedAt: new Date().toISOString() });
const OUTCOMES = {
  READY: () => ({ state: 'COMPLETE', stdout: REPORT, stderr: '', model: 'm', exitCode: 0, signal: null, readOnlyContractHeld: true, ...stamp() }),
  FAILED: () => ({ state: 'FAILED', stdout: '', stderr: 'nothing usable\n', model: 'm', exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'FAILED: model returned no usable report', ...stamp() }),
  RATE: () => ({ state: 'BLOCKED', stdout: '', stderr: 'upstream: temporarily rate-limited\n', model: 'm', exitCode: 1, signal: null, readOnlyContractHeld: true, providerError: 'model is temporarily rate-limited upstream', failureBoundary: 'RATE LIMITED: model is temporarily rate-limited upstream', ...stamp() }),
  AUTH: () => ({ state: 'BLOCKED', stdout: '', stderr: 'unauthorized\n', model: 'm', exitCode: 1, signal: null, readOnlyContractHeld: true, providerError: 'unauthorized', failureBoundary: 'AUTH ISSUE: OPENROUTER_API_KEY is not available', ...stamp() })
};

const prospect = (id) => ({
  candidateId: id, provider: 'openrouter', model: `openrouter/${id}`, displayName: `Prospect ${id}`, harness: 'opencode',
  discoveredAt: new Date().toISOString(), advertisedFree: true, supportsTools: true, sourceEvidence: 'fixture'
});
const discovery = (ids) => ({ discoveredAt: new Date().toISOString(), prospects: ids.map(prospect), sources: [{ id: 'openrouter', available: true, count: ids.length }, { id: 'opencode-hosted', available: true, count: 0 }] });

/** A stand-in provider. Counts every tryout that actually executes, and writes OpenCode-like scaffolding. */
function provider(ids, outcome, options = {}) {
  const stats = { executed: 0, inFlight: 0, maxInFlight: 0, contexts: [], gate: options.gate };
  const executorFactory = (p) => ({
    id: p.candidateId, player: p.displayName, harness: 'OpenCode', provider: 'OpenRouter',
    async execute(envelope, context) {
      stats.executed += 1;
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      stats.contexts.push({ gameRoot: context.gameRoot, playerPath: context.playerPath, playGameRoot: envelope.play.gameRoot });
      try {
        fs.readFileSync(path.join(context.gameRoot, 'package.json'), 'utf8');
        const config = path.join(context.playerPath, '.opencode-combine');
        fs.mkdirSync(path.join(config, 'agents'), { recursive: true });
        fs.writeFileSync(path.join(config, 'agents', 'a.md'), 'agent');
        for (let i = 0; i < 8; i += 1) { fs.mkdirSync(path.join(config, 'node_modules', `p${i}`), { recursive: true }); fs.writeFileSync(path.join(config, 'node_modules', `p${i}`, 'i.js'), 'x'.repeat(4096)); }
        fs.mkdirSync(path.join(context.playerPath, '.opencode-combine-data'), { recursive: true });
        fs.writeFileSync(path.join(context.playerPath, '.opencode-combine-data', 'session.db'), 'd'.repeat(2048));
        if (stats.gate) await stats.gate;
        return (typeof outcome === 'function' ? outcome(p.candidateId) : OUTCOMES[outcome])();
      } finally { stats.inFlight -= 1; }
    }
  });
  return { ids, stats, executorFactory };
}

function bootstrap(l, { memento = new FakeMemento(), fake, configured = true, enabled, log, runSpy } = {}) {
  const calls = { refresh: 0, requests: [], finished: 0, keyResolutions: 0, logs: [] };
  const finished = [];
  const service = new ScoutBootstrapService({
    scoutIntelligenceRoot: l.scoutRoot,
    consent: new ScoutBootstrapConsentStore(memento),
    credentialConfigured: async () => configured,
    resolveOpenRouterApiKey: async () => { calls.keyResolutions += 1; return SECRET; },
    enabled,
    runRefresh: (request) => {
      calls.refresh += 1;
      calls.requests.push(request);
      if (runSpy) return runSpy(request);
      return runCoachRefresh({ ...request, discovery: discovery(fake.ids), executorFactory: fake.executorFactory, processEnvironment: {} });
    },
    onFinished: () => { calls.finished += 1; finished.splice(0).forEach((resolve) => resolve()); },
    log: log ?? ((message) => calls.logs.push(message))
  });
  const done = () => new Promise((resolve) => finished.push(resolve));
  return { service, calls, memento, done };
}

const idle = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const scorecards = (l) => {
  const dir = path.join(l.scoutRoot, 'Combine', 'Scorecards');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))) : [];
};

// --- 1-2: no automatic spend -----------------------------------------------------------------------

test('Bootstrap-1. A fresh Scout root and a configured credential cause NO tryouts, however often status is read', async () => {
  const l = layout();
  try {
    const fake = provider(['a', 'b', 'c'], 'READY');
    const { service, calls } = bootstrap(l, { fake });
    const first = await service.status(l.gameRoot);
    assert.equal(first.phase, 'ready-to-find');
    assert.equal(first.consent, 'not-decided');
    assert.equal(first.credentialConfigured, true);
    assert.equal(first.readyCount, 0);
    assert.deepEqual([first.canFind, first.canRefresh, first.holdingTryouts], [true, false, false]);
    for (let i = 0; i < 5; i += 1) await service.status(l.gameRoot);
    await idle(200);
    assert.equal(calls.refresh, 0, 'Coach Refresh was never invoked');
    assert.equal(fake.stats.executed, 0, 'zero provider execution');
    assert.equal(calls.keyResolutions, 0, 'the credential was never even read');
    assert.equal(scorecards(l).length, 0);
    assert.equal(fs.readdirSync(path.join(l.scoutRoot, 'Work')).length, 0);
    assert.equal(fs.readdirSync(path.join(l.scoutRoot, 'Combine', 'Runs')).length, 0);
  } finally { l.cleanup(); }
});

test('Bootstrap-2. Without a credential the service offers nothing, and an attempt is refused without recording consent', async () => {
  const l = layout();
  try {
    const fake = provider(['a'], 'READY');
    const { service, calls, memento } = bootstrap(l, { fake, configured: false });
    assert.equal((await service.status(l.gameRoot)).phase, 'credential-required');
    assert.equal((await service.status(l.gameRoot)).canFind, false);
    await assert.rejects(() => service.authorizeAndStart(l.gameRoot), (error) => error instanceof ScoutBootstrapError && error.code === 'credential-required');
    assert.equal(memento.updates, 0, 'a refused attempt does not record consent');
    assert.equal(calls.refresh, 0);
    const disabled = bootstrap(l, { fake, enabled: () => false });
    await assert.rejects(() => disabled.service.authorizeAndStart(l.gameRoot), (error) => error.code === 'disabled');
    assert.equal(disabled.calls.refresh, 0);
  } finally { l.cleanup(); }
});

// --- 3-8, 16: the central fresh-install contract ------------------------------------------------------

test('Bootstrap-3. CENTRAL: fresh install -> explicit consent -> bounded Coach Refresh -> canonical evidence -> Scout capability, with no terminal and no Game mutation', async () => {
  const l = layout();
  try {
    const before = snapshot(l.gameRoot);
    const adapter = new ScoutPlayerAdapter({ durableReportRoot: () => l.scoutRoot });
    assert.equal(adapter.capability(l.gameRoot), undefined, 'a fresh install has no Scout capability');

    const fake = provider(['a', 'b'], 'READY');
    const { service, calls, done } = bootstrap(l, { fake });
    await idle(150);
    assert.equal(fake.stats.executed, 0, 'still nothing before consent');

    const finished = done();
    const started = await service.authorizeAndStart(l.gameRoot);
    assert.equal(started.phase, 'holding-tryouts', 'returns immediately; the session runs in the background');
    assert.equal(started.holdingTryouts, true);
    assert.deepEqual([started.canFind, started.canRefresh], [false, false], 'no second start while holding tryouts');
    await finished;

    // Coach Refresh was invoked once, against the canonical root, with no Game-derived workspace.
    assert.equal(calls.refresh, 1);
    const request = calls.requests[0];
    assert.equal(request.durableReportRoot, l.scoutRoot, 'the canonical Scout Intelligence root');
    assert.equal(request.gameRoot, path.resolve(l.gameRoot), 'the Game is only the reconnaissance target');
    assert.ok(!('workspaceRoot' in request), 'no workspaceRoot: Combine derives <Scout Intelligence>/Work itself');
    assert.equal(typeof request.resolveOpenRouterApiKey, 'function', 'the credential arrives only through the trusted resolver');

    // Canonical evidence exists, and Work stays outside the Game.
    const cards = scorecards(l);
    assert.deepEqual(cards.map((c) => c.candidateId).sort(), ['a', 'b']);
    assert.ok(cards.every((c) => c.currentStatus === 'READY'));
    const runs = fs.readdirSync(path.join(l.scoutRoot, 'Combine', 'Runs'));
    assert.equal(runs.length, 1);
    assert.ok(fs.existsSync(path.join(l.scoutRoot, 'Combine', 'Runs', runs[0], 'COMBINE-COMPLETE.json')));
    const work = path.join(l.scoutRoot, 'Work', runs[0]);
    assert.ok(fs.existsSync(path.join(work, 'discovery.json')), 'working state is under <Scout Intelligence>/Work');
    for (const ctx of fake.stats.contexts) {
      assert.equal(ctx.gameRoot, path.resolve(l.gameRoot));
      assert.ok(ctx.playerPath.startsWith(path.join(l.scoutRoot, 'Work')), 'each tryout works outside the Game');
    }
    assert.equal(fs.existsSync(path.join(l.gameRoot, 'Scouts')), false, 'no <Game>/Scouts is created');
    assert.deepEqual(snapshot(l.gameRoot), before, 'not one Game byte changed');

    // S37 hygiene still applies to product-triggered runs.
    for (const id of ['a', 'b']) {
      assert.equal(fs.existsSync(path.join(work, id, '.opencode-combine', 'node_modules')), false, 'regenerable scaffolding released');
      assert.equal(fs.existsSync(path.join(work, id, '.opencode-combine-data')), false);
      assert.ok(fs.existsSync(path.join(work, id, 'telemetry.json')), 'evidence retained');
    }

    // READY evidence makes Scout available through the existing capability path, with no reload.
    const status = await service.status(l.gameRoot);
    assert.equal(status.phase, 'scouts-ready');
    assert.equal(status.readyCount, 2);
    assert.equal(status.holdingTryouts, false);
    assert.equal(status.canRefresh, true);
    assert.equal(status.canFind, false);
    assert.equal(calls.finished, 1, 'the capability snapshot is republished when the session ends');
    const capability = adapter.capability(l.gameRoot);
    assert.ok(capability, 'Scout capability is now available');
    assert.equal(capability.executionType, 'scout-formation');
    assert.equal(capability.state, 'ready');
    assert.equal(status.lastRun.completed, 2);
  } finally { l.cleanup(); }
});

test('Bootstrap-4. The Coach Refresh bounds are the existing ones, and refresh-due skips receivers that do not need a tryout', async () => {
  const l = layout();
  try {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const fake = provider(ids, 'READY');
    const { service, calls, done } = bootstrap(l, { fake });
    let finished = done();
    await service.authorizeAndStart(l.gameRoot);
    await finished;
    assert.equal(fake.stats.executed, 5, 'at most 5 tryouts in one session, out of 8 discovered');
    assert.ok(fake.stats.maxInFlight <= 2, `at most 2 concurrent (saw ${fake.stats.maxInFlight})`);
    const run1 = JSON.parse(fs.readFileSync(path.join(l.scoutRoot, 'Combine', 'Runs', fs.readdirSync(path.join(l.scoutRoot, 'Combine', 'Runs'))[0], 'COMBINE-COMPLETE.json'), 'utf8'));
    assert.equal(run1.selectionPolicy, 'refresh-due');
    assert.equal(run1.maxTryouts, 5);
    assert.equal(run1.maxConcurrency, 2);
    const status = await service.status(l.gameRoot);
    assert.equal(status.maxTryouts, 5);
    assert.equal(status.staleDays, 7);

    // A manual Refresh only tries what is still due: the 5 just tried are fresh, so only the other 3 run.
    finished = done();
    await service.refresh(l.gameRoot);
    await finished;
    assert.equal(fake.stats.executed, 8, '5 + the remaining 3, never a re-test of fresh receivers');
    assert.equal(calls.refresh, 2);
    assert.deepEqual(scorecards(l).map((c) => c.candidateId).sort(), ids);
  } finally { l.cleanup(); }
});

// --- 9-10: truthful outcomes ---------------------------------------------------------------------------

test('Bootstrap-5. Zero READY is truthful, keeps the evidence, and is retryable without spending on its own', async () => {
  const l = layout();
  try {
    const fake = provider(['a', 'b'], 'FAILED');
    const { service, calls, done } = bootstrap(l, { fake });
    const finished = done();
    await service.authorizeAndStart(l.gameRoot);
    await finished;
    const status = await service.status(l.gameRoot);
    assert.equal(status.phase, 'no-scouts-ready', 'not "Scout is broken", and not "provider limited"');
    assert.equal(status.readyCount, 0);
    assert.equal(status.canRefresh, true, 'Dad can retry later');
    assert.equal(scorecards(l).length, 2, 'scorecards are preserved');
    for (const card of scorecards(l)) {
      assert.equal(card.currentStatus, 'CALL BACK LATER', 'a model that produced nothing is a quality result, not a provider condition');
      assert.equal(card.totals.failures, 1, 'recorded as quality film');
    }
    assert.equal(status.providerLimitedCount, 0, 'and never counted as provider-limited');
    assert.equal(new ScoutPlayerAdapter({ durableReportRoot: () => l.scoutRoot }).capability(l.gameRoot), undefined);
    await idle(300);
    assert.equal(calls.refresh, 1, 'nothing retries automatically');
    assert.equal(fake.stats.executed, 2);
  } finally { l.cleanup(); }
});

test('Bootstrap-6. Rate limits and auth problems stay infrastructure: quality counters untouched, no raw provider text exposed', async () => {
  for (const [kind, expected] of [['RATE', 'RATE LIMITED'], ['AUTH', 'AUTH ISSUE']]) {
    const l = layout();
    try {
      const fake = provider(['a', 'b'], kind);
      const { service, done } = bootstrap(l, { fake });
      const finished = done();
      await service.authorizeAndStart(l.gameRoot);
      await finished;
      const cards = scorecards(l);
      assert.ok(cards.every((c) => c.currentStatus === expected), `${kind}: classified as ${expected}`);
      for (const card of cards) {
        assert.equal(card.totals.failures, 0, 'not a quality failure');
        assert.equal(card.totals.completions, 0);
        assert.ok(card.totals.blocked >= 1, 'recorded as blocked, the infrastructure bucket');
      }
      const status = await service.status(l.gameRoot);
      assert.equal(status.phase, 'provider-limited');
      assert.equal(status.providerLimitedCount, 2);
      assert.equal(status.readyCount, 0);
      assert.equal(status.canRefresh, true);
      const serialized = JSON.stringify(status);
      for (const raw of ['rate-limited', 'unauthorized', 'OPENROUTER_API_KEY', 'upstream']) {
        assert.ok(!serialized.includes(raw), `the raw provider text "${raw}" never reaches Settings`);
      }
      assert.equal(status.lastRun.blocked, 2);
      assert.equal(status.lastRun.failed, 0);
    } finally { l.cleanup(); }
  }
});

test('Bootstrap-7. A tooling or catalog problem is reported plainly instead of looking like "no Scouts qualified"', async () => {
  const l = layout();
  try {
    const { service, done } = bootstrap(l, {
      runSpy: (request) => runCoachRefresh({
        ...request, processEnvironment: {}, executorFactory: () => { throw new Error('should not run'); },
        discovery: { discoveredAt: new Date().toISOString(), prospects: [], sources: [{ id: 'openrouter', available: false, count: 0, error: 'network unreachable' }, { id: 'opencode-hosted', available: false, count: 0, error: 'spawn ENOENT' }] }
      })
    });
    const finished = done();
    await service.authorizeAndStart(l.gameRoot);
    await finished;
    const status = await service.status(l.gameRoot);
    assert.deepEqual(status.lastRun.notes, ["OpenRouter's model list could not be reached.", "Scout's tooling (OpenCode) could not be used on this computer."]);
    assert.ok(!JSON.stringify(status).includes('ENOENT') && !JSON.stringify(status).includes('network unreachable'), 'raw diagnostics stay out of Settings');
  } finally { l.cleanup(); }
});

// --- 11-14: consent -----------------------------------------------------------------------------------------------

test('Bootstrap-8. The decision persists across restart, in extension state and not in any Game, scorecard or browser', async () => {
  const l = layout();
  try {
    const memento = new FakeMemento();
    await new ScoutBootstrapConsentStore(memento).authorize();
    const persisted = memento.snapshot();
    assert.deepEqual(persisted.map(([k]) => k), [SCOUT_BOOTSTRAP_CONSENT_KEY]);
    const stored = JSON.parse(persisted[0][1]);
    assert.equal(stored.state, 'authorized');
    assert.ok(!Number.isNaN(Date.parse(stored.decidedAt)));
    assert.deepEqual(Object.keys(stored).sort(), ['decidedAt', 'state'], 'a preference only: nothing secret is stored');

    // "Restart": a brand-new store, service and memento rebuilt from the persisted bytes alone.
    const fake = provider(['a'], 'READY');
    const restarted = bootstrap(l, { memento: new FakeMemento(persisted), fake });
    const status = await restarted.service.status(l.gameRoot);
    assert.equal(status.consent, 'authorized');
    assert.equal(status.canRefresh, true);
    assert.equal(status.canFind, false);

    const declined = new FakeMemento();
    await new ScoutBootstrapConsentStore(declined).decline();
    assert.equal(new ScoutBootstrapConsentStore(new FakeMemento(declined.snapshot())).read().state, 'declined');
    assert.equal(new ScoutBootstrapConsentStore(new FakeMemento()).read().state, 'not-decided');
    // Corrupt or unknown stored values are read as "not decided", never as consent.
    for (const bad of [{ state: 'yes', decidedAt: 'x' }, { state: 'authorized' }, 'authorized', 7, null]) {
      assert.equal(new ScoutBootstrapConsentStore(new FakeMemento([[SCOUT_BOOTSTRAP_CONSENT_KEY, JSON.stringify(bad)]])).read().state, 'not-decided', JSON.stringify(bad));
    }
    assert.equal(snapshotHas(l.gameRoot, 'bootstrapConsent'), false, 'nothing about consent is written into the Game');
    assert.equal(snapshotHas(l.scoutRoot, 'bootstrapConsent'), false, 'nor into the Scout evidence tree');
  } finally { l.cleanup(); }
});

function snapshotHas(dir, needle) {
  return Object.keys(snapshot(dir)).some((name) => name.includes(needle))
    || Object.keys(snapshot(dir)).some((name) => !name.endsWith('/') && fs.readFileSync(path.join(dir, name), 'utf8').includes(needle));
}

test('Bootstrap-9. Declining does not nag or spend, and a manual authorization later still works', async () => {
  const l = layout();
  try {
    const fake = provider(['a', 'b'], 'READY');
    const { service, calls, done } = bootstrap(l, { fake });
    const declined = await service.decline(l.gameRoot);
    assert.equal(declined.phase, 'declined');
    assert.equal(declined.consent, 'declined');
    assert.equal(declined.canFind, true, 'the manual action stays available');
    assert.equal(declined.canRefresh, false);
    for (let i = 0; i < 5; i += 1) assert.equal((await service.status(l.gameRoot)).phase, 'declined');
    await assert.rejects(() => service.refresh(l.gameRoot), (error) => error.code === 'authorization-required', 'Refresh needs the consent that was declined');
    await idle(200);
    assert.equal(calls.refresh, 0);
    assert.equal(fake.stats.executed, 0);

    const finished = done();
    await service.authorizeAndStart(l.gameRoot); // Dad changes his mind
    await finished;
    assert.equal((await service.status(l.gameRoot)).consent, 'authorized');
    assert.equal(calls.refresh, 1);
  } finally { l.cleanup(); }
});

test('Bootstrap-10. An authorized user refreshes with no second consent ceremony, and the extension refuses Refresh without consent', async () => {
  const l = layout();
  try {
    const fake = provider(['a', 'b'], 'READY');
    const { service, calls, memento, done } = bootstrap(l, { fake });
    await assert.rejects(() => service.refresh(l.gameRoot), (error) => error instanceof ScoutBootstrapError && error.code === 'authorization-required');
    assert.equal(calls.refresh, 0, 'not decided is refused server-side, whatever the UI does');

    let finished = done();
    await service.authorizeAndStart(l.gameRoot);
    await finished;
    const updatesAfterConsent = memento.updates;
    assert.equal(updatesAfterConsent, 1, 'exactly one consent write');

    finished = done();
    const refreshed = await service.refresh(l.gameRoot);
    await finished;
    assert.equal(refreshed.phase, 'holding-tryouts');
    assert.equal(memento.updates, updatesAfterConsent, 'Refresh wrote no new consent and asked for none');
    assert.equal(calls.refresh, 2);
  } finally { l.cleanup(); }
});

test('Bootstrap-11. Only one session can run at a time, even for two rapid requests', async () => {
  const l = layout();
  try {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fake = provider(['a', 'b'], 'READY', { gate });
    const { service, calls, done } = bootstrap(l, { fake });
    const finished = done();
    const results = await Promise.allSettled([service.authorizeAndStart(l.gameRoot), service.authorizeAndStart(l.gameRoot)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'already-running');
    await assert.rejects(() => service.refresh(l.gameRoot), (error) => error.code === 'already-running');
    release();
    await finished;
    assert.equal(calls.refresh, 1, 'one Coach Refresh for two requests');
    assert.equal(fake.stats.executed, 2);
  } finally { l.cleanup(); }
});

// --- 4: the secret boundary -------------------------------------------------------------------------------------------

test('Bootstrap-12. The credential is never in status, consent, scorecards, evidence, Work or logs, including when a run throws', async () => {
  const l = layout();
  try {
    const fake = provider(['a', 'b'], 'READY');
    const ok = bootstrap(l, { fake });
    const finished = ok.done();
    const started = await ok.service.authorizeAndStart(l.gameRoot);
    await finished;
    assert.equal(ok.calls.keyResolutions, 1, 'resolved once, inside the run, from the trusted resolver');
    const everything = JSON.stringify([started, await ok.service.status(l.gameRoot), ok.memento.snapshot()]);
    assert.ok(!everything.includes(SECRET));
    assert.equal(snapshotHas(l.scoutRoot, SECRET), false, 'no scorecard, run evidence or Work file contains it');
    assert.equal(snapshotHas(l.gameRoot, SECRET), false);

    const l2 = layout();
    try {
      const thrown = bootstrap(l2, {
        runSpy: async (request) => { await request.resolveOpenRouterApiKey(); throw new Error(`OpenRouter rejected ${SECRET} while starting`); }
      });
      const finishedThrow = thrown.done();
      await thrown.service.authorizeAndStart(l2.gameRoot);
      await finishedThrow;
      const status = await thrown.service.status(l2.gameRoot);
      assert.equal(status.lastRun.stopped, true);
      assert.ok(!JSON.stringify(status).includes(SECRET), 'not in the status');
      assert.ok(!JSON.stringify(status).includes('rejected'), 'nor the raw error');
      assert.ok(thrown.calls.logs.length === 1 && !thrown.calls.logs[0].includes(SECRET) && thrown.calls.logs[0].includes('[REDACTED]'), 'the log line is redacted');
      assert.equal(status.canRefresh, true, 'a stopped session leaves Dad able to try again');
      assert.equal(thrown.calls.finished, 1);
    } finally { l2.cleanup(); }
  } finally { l.cleanup(); }
});

// --- 4, 13: the HTTP bridge and the Stadium RPC ----------------------------------------------------------------------------

function bridgeStatus(overrides = {}) {
  return {
    phase: 'ready-to-find', consent: 'not-decided', credentialConfigured: true, readyCount: 0, providerLimitedCount: 0,
    holdingTryouts: false, canFind: true, canRefresh: false, maxTryouts: 5, staleDays: 7, ...overrides
  };
}

test('Bootstrap-13. The daemon bridge carries no credential in either direction and rebuilds the response from an allowlist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-bootstrap-http-'));
  const gameId = 'game-bootstrap-http';
  const daemon = new ControlPlaneDaemon({ dir, port: 42900 + Math.floor(Math.random() * 300), idleTimeoutMs: 60_000 });
  const frames = [];
  try {
    await daemon.start();
    const socket = {
      readyState: 1,
      send(raw) {
        const frame = JSON.parse(String(raw));
        frames.push(frame);
        // A hostile / buggy Stadium answer: extra fields that must never reach the browser.
        daemon.handleWsResponseForTest(frame.id, {
          success: true, gameId, apiKey: 'LEAKED-KEY', rootFsPath: 'C:\\secret\\path', providerError: 'raw provider text',
          status: { ...bridgeStatus({ phase: 'scouts-ready', readyCount: 3, canRefresh: true, canFind: false, consent: 'authorized' }), apiKey: 'LEAKED-KEY', workspacePath: 'C:\\Work\\x',
            lastRun: { endedAt: '2026-09-19T00:00:00Z', tryoutsHeld: 5, completed: 3, blocked: 2, failed: 0, notes: ['ok'], rawStderr: 'LEAKED-STDERR' } }
        });
      },
      close() {}
    };
    daemon.registryInstance.registerSession({
      instanceId: 'bootstrap-session', stadiumId: 'bootstrap-stadium', name: 'Bootstrap', platform: 'win32', socket,
      lastHeartbeat: Date.now(), game: { gameId, displayName: 'Bootstrap', fingerprintSource: 'test' }, rootFsPath: repoRoot,
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: ['scout.bootstrap.v1']
    });
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const api = async (url, init = {}) => {
      const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      return { status: response.status, body: await response.json() };
    };

    const read = await api(`/api/scout/bootstrap?gameId=${encodeURIComponent(gameId)}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.status.phase, 'scouts-ready');
    assert.equal(read.body.status.readyCount, 3);
    assert.equal(read.body.status.lastRun.blocked, 2);
    const serialized = JSON.stringify(read.body);
    for (const leaked of ['LEAKED-KEY', 'LEAKED-STDERR', 'C:\\\\secret', 'C:\\\\Work', 'raw provider text', 'rootFsPath', 'workspacePath', 'rawStderr']) {
      assert.ok(!serialized.includes(leaked), `${leaked} is dropped by the allowlist`);
    }
    assert.deepEqual(frames.at(-1).params, { gameId }, 'the RPC carries the Game id and nothing else');
    assert.equal(frames.at(-1).method, 'scout.bootstrap.status');

    // The browser cannot smuggle a key or another Game root through the action.
    const post = await api('/api/scout/bootstrap', { method: 'POST', body: JSON.stringify({ gameId, action: 'authorize', apiKey: 'BROWSER-KEY', gameRoot: 'C:\\evil' }) });
    assert.equal(post.status, 200);
    assert.deepEqual(frames.at(-1).params, { gameId });
    assert.equal(frames.at(-1).method, 'scout.bootstrap.authorize');
    assert.equal(JSON.stringify(frames).includes('BROWSER-KEY'), false);

    for (const [action, method] of [['decline', 'scout.bootstrap.decline'], ['refresh', 'scout.bootstrap.refresh']]) {
      await api('/api/scout/bootstrap', { method: 'POST', body: JSON.stringify({ gameId, action }) });
      assert.equal(frames.at(-1).method, method);
    }
    const before = frames.length;
    assert.equal((await api('/api/scout/bootstrap', { method: 'POST', body: JSON.stringify({ gameId, action: 'run-anything' }) })).status, 400);
    assert.equal((await api('/api/scout/bootstrap', { method: 'POST', body: JSON.stringify({ gameId }) })).status, 400);
    assert.equal((await api('/api/scout/bootstrap', { method: 'POST', body: JSON.stringify({ action: 'authorize' }) })).status, 400);
    assert.equal((await api('/api/scout/bootstrap?gameId=', { method: 'GET' })).status, 400);
    assert.equal((await api(`/api/scout/bootstrap?gameId=${gameId}`, { method: 'DELETE' })).status, 405);
    assert.equal(frames.length, before, 'rejected requests never reach the Stadium');

    // A Stadium that predates the feature is reported as unsupported, not silently ignored.
    daemon.registryInstance.getSession('bootstrap-session').features = [];
    assert.equal((await api(`/api/scout/bootstrap?gameId=${encodeURIComponent(gameId)}`)).status, 409);

    const persisted = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => fs.readFileSync(path.join(e.parentPath, e.name), 'utf8')).join('\n');
    assert.ok(!persisted.includes('LEAKED-KEY') && !persisted.includes('BROWSER-KEY'), 'the Control Plane persists nothing from this bridge');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Bootstrap-14. Stadium RPC: uses this Game\'s root as the target, returns expected refusals as data, and advertises the feature', async () => {
  const l = layout();
  try {
    const gameId = 'game-bootstrap-rpc';
    const roots = [];
    const port = {
      status: async (root) => { roots.push(root); return bridgeStatus(); },
      authorizeAndStart: async (root) => { roots.push(root); return bridgeStatus({ phase: 'holding-tryouts', holdingTryouts: true, canFind: false }); },
      decline: async (root) => { roots.push(root); return bridgeStatus({ phase: 'declined', consent: 'declined' }); },
      refresh: async () => { throw new ScoutBootstrapError('Authorize Scout tryouts first.', 'authorization-required'); }
    };
    const sent = [];
    const client = new StadiumClient({
      autoReconnect: false,
      gameContextGetter: () => ({
        game: { gameId, displayName: 'RPC Game', fingerprintSource: 'test' },
        stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
        binding: { gameId, stadiumId: 'stadium', rootFsPath: l.gameRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
      }),
      scoutBootstrap: port
    });
    client.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
    client.connected = true;

    await client.handleIncomingRequest({ id: 1, method: 'scout.bootstrap.status', params: { gameId } });
    await client.handleIncomingRequest({ id: 2, method: 'scout.bootstrap.authorize', params: { gameId } });
    await client.handleIncomingRequest({ id: 3, method: 'scout.bootstrap.decline', params: { gameId } });
    await client.handleIncomingRequest({ id: 4, method: 'scout.bootstrap.refresh', params: { gameId } });
    assert.deepEqual(roots, [l.gameRoot, l.gameRoot, l.gameRoot], 'this Stadium\'s Game root is the only target; the caller cannot choose one');
    assert.equal(sent[0].result.status.phase, 'ready-to-find');
    assert.equal(sent[1].result.status.phase, 'holding-tryouts');
    assert.equal(sent[2].result.status.consent, 'declined');
    assert.equal(sent[3].error, undefined, 'an expected refusal is not a transport error');
    assert.deepEqual([sent[3].result.success, sent[3].result.code, sent[3].result.message], [false, 'authorization-required', 'Authorize Scout tryouts first.']);

    // Another Game's request is refused by the exact-Game guard.
    await client.handleIncomingRequest({ id: 5, method: 'scout.bootstrap.status', params: { gameId: 'some-other-game' } });
    assert.equal(sent[4].result.success, false, 'a different Game id is refused');
    assert.match(sent[4].result.message, /Game mismatch/);
    assert.equal(roots.length, 3, 'and the service was never called for it');

    const stadiumSource = fs.readFileSync(path.join(repoRoot, 'src', 'stadium-client.ts'), 'utf8');
    assert.match(stadiumSource, /features: \[[^\]]*'scout\.bootstrap\.v1'/);
    const noPort = new StadiumClient({ autoReconnect: false, gameContextGetter: () => ({ game: { gameId, displayName: 'x', fingerprintSource: 'test' }, stadium: {}, binding: { gameId, rootFsPath: l.gameRoot } }) });
    noPort.socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(String(raw))) };
    noPort.connected = true;
    await noPort.handleIncomingRequest({ id: 6, method: 'scout.bootstrap.status', params: { gameId } });
    assert.equal(sent.at(-1).result.success, false, 'a Stadium without the service fails clearly');
    assert.match(sent.at(-1).result.message, /cannot manage Scout tryouts/);
  } finally { l.cleanup(); }
});

// --- Settings UI contract ---------------------------------------------------------------------------------------------------

test('Bootstrap-15. Settings: small, truthful consent copy; nothing starts without the explicit confirm; no browser-owned authority', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  for (const id of ['scoutBootstrap', 'scoutBootstrapState', 'scoutBootstrapCopy', 'scoutBootstrapConfirm', 'scoutBootstrapStartBtn', 'scoutBootstrapNotNowBtn', 'scoutBootstrapFindBtn', 'scoutBootstrapRefreshBtn', 'scoutBootstrapStatus']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  const confirm = html.match(/<div id="scoutBootstrapConfirm"[\s\S]*?<p class="tiny">([\s\S]*?)<\/p>/)[1];
  for (const [label, pattern] of [
    ['contacts external AI services', /AI models from OpenRouter/],
    ['sends Game content to that provider', /read a few project files from your open Game[\s\S]*content is sent to that provider/],
    ['may use quota / hit rate limits', /provider quota or hit rate limits/],
    ['may download or set up tooling', /download or set up provider tooling/],
    ['takes time', /several minutes/],
    ['nothing runs without the human', /Nothing runs until you start it/]
  ]) assert.match(confirm, pattern, label);
  assert.doesNotMatch(confirm, /\bMB\b|megabyte|instant|free of charge|no cost/i, 'no invented size or cost claims');

  const script = html.slice(html.indexOf('Scout bootstrap (S31 Slice 4)'), html.indexOf("$('scoutFormationRunBtn')?.addEventListener"));
  // The Find button only reveals the confirmation. It must not call the API.
  const findHandler = script.match(/\$\('scoutBootstrapFindBtn'\)\?\.addEventListener\('click', \(\) => \{([\s\S]*?)\n      \}\);/)[1];
  assert.doesNotMatch(findHandler, /api\(|postScoutBootstrap/);
  assert.match(findHandler, /scoutBootstrapConfirming = true/);
  // 'authorize' is posted from exactly one place: the confirmation's Start button.
  assert.equal((script.match(/postScoutBootstrap\('authorize'/g) || []).length, 1);
  assert.match(script, /\$\('scoutBootstrapStartBtn'\)\?\.addEventListener\('click', \(\) => void postScoutBootstrap\('authorize'/);
  // The status poll only reads.
  const poll = script.match(/const scheduleScoutBootstrapPoll = \(\) => \{([\s\S]*?)\n      \};/)[1];
  assert.match(poll, /loadScoutBootstrap/);
  assert.doesNotMatch(poll, /postScoutBootstrap|method: 'POST'/);
  const load = script.match(/const loadScoutBootstrap = async \(\) => \{([\s\S]*?)\n      \};/)[1];
  assert.doesNotMatch(load, /method: 'POST'/);
  // The payload is the Game id and an action, never a key or a path.
  assert.match(script, /body: JSON\.stringify\(\{ gameId: currentGameId, action \}\)/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB/, 'consent is never browser-owned');
  assert.doesNotMatch(script, /apiKey|scoutOpenRouterApiKey/, 'this block never touches the key');
  // Truthful phase vocabulary.
  for (const phrase of ['Ready to find Scouts', 'Holding Scout tryouts…', 'No Scouts ready yet', 'Provider limited', 'Scout tryouts are off', 'Refresh Scouts', 'Find Scouts']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.doesNotMatch(html.match(/case 'no-scouts-ready':[\s\S]*?\n/)[0], /broken|error|fail/i, '"no READY receiver" is never called "broken"');
  // And the page still parses.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const source of scripts) assert.doesNotThrow(() => new vm.Script(source), 'the inline script is valid JavaScript');
});

// --- 15: no scheduler ------------------------------------------------------------------------------------------------------------

test('Bootstrap-16. There is no scheduler, timer, or activation hook: tryouts start only from an explicit request', async () => {
  const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const service = read('src', 'scout-bootstrap.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(service, /setInterval|setTimeout|cron|schedule|onStartup|activate\(/i, 'the service has no timer or scheduler');
  const extension = read('src', 'extension.ts');
  assert.doesNotMatch(extension.slice(extension.indexOf('const scoutBootstrap = new ScoutBootstrapService'), extension.indexOf('const scoutPlayer = new ScoutPlayerAdapter')), /setInterval|setTimeout|authorizeAndStart|\.refresh\(|runCoachRefresh/, 'wiring constructs the service and starts nothing');
  // The only callers of the starting methods are the Stadium's RPC handlers.
  const callers = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.ts')) { const t = fs.readFileSync(f, 'utf8'); if (/\.authorizeAndStart\(|bootstrap\.refresh\(|scoutBootstrap\??\.refresh\(/.test(t)) callers.push(path.relative(repoRoot, f).replace(/\\/g, '/')); } } };
  walk(path.join(repoRoot, 'src'));
  assert.deepEqual(callers, ['src/stadium-client.ts']);
  const handlers = read('src', 'stadium-client.ts');
  assert.ok(handlers.indexOf('bootstrap.authorizeAndStart') > handlers.indexOf("req.method === 'scout.bootstrap.status'"), 'reachable only inside the bootstrap RPC handler');

  // Behavior: after a session ends, nothing else ever starts.
  const l = layout();
  try {
    const fake = provider(['a', 'b'], 'READY');
    const { service: svc, calls, done } = bootstrap(l, { fake });
    const finished = done();
    await svc.authorizeAndStart(l.gameRoot);
    await finished;
    await idle(500);
    assert.equal(calls.refresh, 1, 'one explicit request, one session, and nothing afterwards');
    assert.equal(fake.stats.executed, 2);
  } finally { l.cleanup(); }
});

test('Bootstrap-17. Bounds and roots come from current source, not from this Play', () => {
  const refresh = fs.readFileSync(path.join(repoRoot, 'src', 'scout-coach-refresh.ts'), 'utf8');
  assert.match(refresh, /COACH_REFRESH_LIMITS = Object\.freeze\(\{ maxTryouts: 5, maxConcurrency: 2 \}\)/);
  const combine = fs.readFileSync(path.join(repoRoot, 'src', 'scout-combine.ts'), 'utf8');
  assert.match(combine, /COMBINE_STALE_MS = 7 \* 24 \* 60 \* 60 \* 1_000/);
  const service = fs.readFileSync(path.join(repoRoot, 'src', 'scout-bootstrap.ts'), 'utf8');
  assert.match(service, /runCoachRefresh/);
  assert.doesNotMatch(service.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /runScoutCombine|maxTryouts:\s*\d|budget/, 'no second runner, and no limit overrides');
});

// --- one session per machine (several windows share one Scout root) -------------------------------------------------------------

const lockFile = (l) => path.join(l.scoutRoot, 'Work', '.coach-refresh.lock');

test('Bootstrap-18. A second window cannot start a second session: it sees "holding tryouts", is refused, spends nothing, and records no consent', async () => {
  const l = layout();
  try {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fakeA = provider(['a', 'b'], 'READY', { gate });
    const fakeB = provider(['a', 'b'], 'READY');
    const windowA = bootstrap(l, { fake: fakeA });
    const windowB = bootstrap(l, { fake: fakeB }); // another window: its own memory, its own consent state, the same Scout root
    const finishedA = windowA.done();
    await windowA.service.authorizeAndStart(l.gameRoot);
    await idle(60);
    assert.ok(fs.existsSync(lockFile(l)), 'the machine-wide guard exists while a session runs');

    const seenByB = await windowB.service.status(l.gameRoot);
    assert.equal(seenByB.phase, 'holding-tryouts', 'the other window reports the truth');
    assert.equal(seenByB.holdingTryouts, true);
    assert.deepEqual([seenByB.canFind, seenByB.canRefresh], [false, false]);
    await assert.rejects(() => windowB.service.authorizeAndStart(l.gameRoot), (error) => error.code === 'already-running');
    assert.equal(windowB.memento.updates, 0, 'a refused start records no consent');
    await windowB.memento.update(SCOUT_BOOTSTRAP_CONSENT_KEY, { state: 'authorized', decidedAt: new Date().toISOString() });
    await assert.rejects(() => windowB.service.refresh(l.gameRoot), (error) => error.code === 'already-running');
    assert.equal(windowB.calls.refresh, 0);
    assert.equal(fakeB.stats.executed, 0, 'the second window spent nothing');

    release();
    await finishedA;
    assert.equal(fs.existsSync(lockFile(l)), false, 'released when the session ends');
    assert.equal(fakeA.stats.executed, 2);
    assert.equal((await windowB.service.status(l.gameRoot)).holdingTryouts, false);
    const finishedB = windowB.done();
    await windowB.service.refresh(l.gameRoot); // now allowed
    await finishedB;
    assert.equal(windowB.calls.refresh, 1);
  } finally { l.cleanup(); }
});

test('Bootstrap-19. A crashed or ancient session can never wedge Scout, but a live one is respected', async () => {
  const l = layout();
  // A real, live process that is not this one, so "a live holder" is deterministic on any machine.
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    const write = (record, ageMs = 0) => {
      fs.writeFileSync(lockFile(l), typeof record === 'string' ? record : JSON.stringify(record));
      if (ageMs) { const t = new Date(Date.now() - ageMs); fs.utimesSync(lockFile(l), t, t); }
    };
    const fake = provider(['a'], 'READY');
    const attempt = async () => {
      const w = bootstrap(l, { fake });
      const finished = w.done();
      try { await w.service.authorizeAndStart(l.gameRoot); await finished; return 'started'; }
      catch (error) { return error.code; }
    };

    write({ pid: 2_000_000_000, startedAt: Date.now() });               // holder process is gone
    assert.equal(await attempt(), 'started', 'dead holder: stale');
    write({ pid: process.pid, startedAt: Date.now() - 31 * 60_000 });   // older than any session can last
    assert.equal(await attempt(), 'started', 'too old: stale, even with a live pid');
    write('{ not json', 5 * 60_000);                                     // garbage, and old
    assert.equal(await attempt(), 'started', 'old unreadable file: stale');

    write({ pid: holder.pid, startedAt: Date.now() });                   // a live process, fresh
    assert.equal(await attempt(), 'already-running', 'a live holder is respected');
    assert.ok(fs.existsSync(lockFile(l)), 'and its lock is left alone');
    write('{ not json');                                                 // garbage but brand new: maybe mid-write
    assert.equal(await attempt(), 'already-running', 'a fresh unreadable file is treated as held');
    fs.rmSync(lockFile(l), { force: true });
    assert.equal(await attempt(), 'started', 'and once cleared, Scout works again');
  } finally { holder.kill(); l.cleanup(); }
});

test('Bootstrap-20. The guard is released on success and on failure, so a stopped session leaves Scout retryable', async () => {
  const l = layout();
  try {
    const ok = bootstrap(l, { fake: provider(['a'], 'READY') });
    const finishedOk = ok.done();
    await ok.service.authorizeAndStart(l.gameRoot);
    await finishedOk;
    assert.equal(fs.existsSync(lockFile(l)), false);

    const failing = bootstrap(l, { runSpy: async () => { throw new Error('the harness fell over'); } });
    const finishedFail = failing.done();
    await failing.service.authorizeAndStart(l.gameRoot);
    await finishedFail;
    assert.equal(fs.existsSync(lockFile(l)), false, 'released even when the session throws');
    assert.equal((await failing.service.status(l.gameRoot)).canRefresh, true);
  } finally { l.cleanup(); }
});
