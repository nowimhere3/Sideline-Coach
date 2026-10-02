/** S57.39 — Codex usage self-healing: verifiedAt freshness, periodic reads, backoff, coordinator. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HealthAuthority, providerFreshness } from '../out/control-plane/health-authority.js';
import { AlarmEngine, normalizeAlarmFacts } from '../out/control-plane/alarm-engine.js';
import { CodexUsageReader, CODEX_USAGE_MAX_BACKOFF_MS } from '../out/control-plane/codex-usage-reader.js';
import { UsageFreshnessCoordinator, codexFreshnessDeadlines, CODEX_RESET_GRACE_MS } from '../out/control-plane/usage-freshness-coordinator.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { DEFAULT_ALARM_PREFERENCES } from '../out/running-players.js';

const MIN = 60_000;
const T0 = Date.parse('2026-09-29T16:00:00.000Z');
const S0 = Math.floor(T0 / 1000);
const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const memoryStore = () => ({ load: () => undefined, save: () => undefined, quarantine: () => undefined });
const codexSource = { stadiumId: 'control-plane', instanceId: 'codex-manual-reader', gameId: 'control-plane', playerInstanceId: 'codex-manual-reader' };
const codexLimits = (used5h = 25, usedWeekly = 7) => ({
  primary: { usedPercent: used5h, windowDurationMins: 300, resetsAt: S0 + 4 * 3600 },
  secondary: { usedPercent: usedWeekly, windowDurationMins: 10080, resetsAt: S0 + 6 * 86400 }
});
const codexIngest = (authority, rateLimits) => authority.ingest({ ...codexSource, evidence: { provider: 'codex', type: 'account_rate_limits', rate_limits: rateLimits } });
const claudeWindows = { five_hour: { utilization: 0.3, resetsAt: S0 + 3 * 3600 }, seven_day: { utilization: 0.1, resetsAt: S0 + 5 * 86400 } };

/** Deterministic clock + timers shared by readers and coordinators. */
function clock(start = T0) {
  let now = start;
  let seq = 0;
  const timers = new Set();
  return {
    now: () => now,
    date: () => new Date(now),
    setTimer: (fn, ms) => { const handle = { fn, at: now + ms, seq: seq++, unref() {} }; timers.add(handle); return handle; },
    clearTimer: (handle) => { timers.delete(handle); },
    pending: () => [...timers],
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers].filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        timers.delete(due);
        now = Math.max(now, due.at);
        due.fn();
        await flush();
      }
      now = target;
      await flush();
    }
  };
}

function reader(c, { outcomes, cadence = 5, ingest = () => true } = {}) {
  const reads = [];
  const queue = outcomes ? [...outcomes] : [];
  const r = new CodexUsageReader({
    ingest,
    initialCadenceMinutes: cadence,
    now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer,
    readOnceImpl: async () => {
      reads.push(c.now());
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return typeof next === 'function' ? next() : (next ?? { ok: true, rateLimits: codexLimits() });
    }
  });
  return { r, reads };
}
const fail = (code = 'timeout') => ({ ok: false, code, reason: code });

// --- 1. verifiedAt --------------------------------------------------------------

test('SH-1: an unchanged trusted read moves verifiedAt, not observedAt, and still publishes', () => {
  let now = T0;
  const changes = [];
  const authority = new HealthAuthority(memoryStore(), { now: () => new Date(now), onChange: (s) => changes.push(s) });
  assert.equal(codexIngest(authority, codexLimits()), true);
  now += 5 * MIN;
  assert.equal(codexIngest(authority, codexLimits()), false, 'unchanged is still reported as unchanged');
  const codex = authority.getSnapshot().providers.codex;
  assert.equal(codex.observedAt, new Date(T0).toISOString());
  assert.equal(codex.verifiedAt, new Date(T0 + 5 * MIN).toISOString());
  assert.equal(changes.length, 2, 'freshness moved, so the change is published');
  assert.equal(authority.getSnapshot().updatedAt, new Date(T0).toISOString(), 'updatedAt still means last fact change');

  assert.equal(authority.ingestClaudeUsage(claudeWindows), true);
  now += 5 * MIN;
  assert.equal(authority.ingestClaudeUsage(claudeWindows), false);
  assert.equal(authority.getSnapshot().providers.claude.verifiedAt, new Date(now).toISOString(), 'Claude shares the same rule (no reader change)');
});

// --- 2. idle is not stale ---------------------------------------------------------

test('SH-2: 45 idle minutes of successful identical reads never go stale; without them they do', () => {
  const run = (confirm) => {
    let now = T0;
    const delivered = [];
    const prefs = { ...DEFAULT_ALARM_PREFERENCES, enabled: true, notifyOnThreshold: true };
    let state = { schemaVersion: 1, rules: {} };
    const engine = new AlarmEngine({ load: () => structuredClone(state), save: (s) => { state = structuredClone(s); } }, {
      preferences: () => prefs, now: () => new Date(now), onEvent: (e) => delivered.push(e),
      setTimer: () => ({ unref() {} }), clearTimer: () => {}
    });
    const authority = new HealthAuthority(memoryStore(), { now: () => new Date(now), onChange: (s) => engine.evaluateTelemetry(s) });
    codexIngest(authority, codexLimits());
    authority.ingestClaudeUsage(claudeWindows);
    engine.start(authority.getSnapshot());
    for (let minute = 5; minute <= 45; minute += 5) {
      now = T0 + minute * MIN;
      if (confirm) { codexIngest(authority, codexLimits()); authority.ingestClaudeUsage(claudeWindows); }
      engine.evaluateTelemetry(authority.getSnapshot());
    }
    const facts = normalizeAlarmFacts(authority.getSnapshot(), new Date(now), prefs.maxStaleAgeMinutes);
    return { delivered, facts };
  };
  const idle = run(true);
  assert.deepEqual(idle.delivered.filter((e) => e.type === 'alarm:stale'), [], 'no stale alarm while reads succeed');
  assert.ok(idle.facts.every((fact) => fact.stale === false), 'routing/alarm facts stay current');

  const unverified = run(false);
  assert.ok(unverified.delivered.some((e) => e.type === 'alarm:stale' && e.provider === 'codex'), 'genuinely unconfirmed data does go stale');
  assert.ok(unverified.facts.every((fact) => fact.stale === true));
});

// --- 3/4. periodic lifecycle ----------------------------------------------------------

test('SH-3: start reads once, then ONE chain at Dad\'s cadence; any finished read re-times it; stop ends it', async () => {
  const c = clock();
  const { r, reads } = reader(c);
  r.start();
  await flush();
  assert.deepEqual(reads, [T0], 'start reads immediately');
  r.start();
  await flush();
  assert.equal(reads.length, 1, 'start is idempotent');
  await c.advance(5 * MIN);
  assert.deepEqual(reads, [T0, T0 + 5 * MIN]);
  await c.advance(3 * MIN);
  await r.refresh(); // manual at +8
  await flush();
  assert.equal(c.pending().length, 1, 'never more than one pending chain timer');
  await c.advance(4 * MIN); // +12: the old +10 tick must not fire
  assert.equal(reads.length, 3);
  await c.advance(1 * MIN); // +13 = manual + 5
  assert.equal(reads.length, 4);
  assert.equal(r.getStatus().nextAttemptAt, new Date(T0 + 18 * MIN).toISOString(), 'diagnostic next attempt');

  assert.equal(r.setCadenceMinutes(10), true);
  assert.equal(r.getCadenceMinutes(), 10);
  await c.advance(9 * MIN);
  assert.equal(reads.length, 4, 'cadence change re-times from the last read');
  await c.advance(1 * MIN);
  assert.equal(reads.length, 5);

  r.stop();
  await c.advance(120 * MIN);
  assert.equal(reads.length, 5, 'stop ends the chain');
  assert.equal(c.pending().length, 0);
});

test('SH-3b: stop during an in-flight read leaves no timer behind', async () => {
  const c = clock();
  let release;
  const { r } = reader(c, { outcomes: [() => new Promise((resolve) => { release = () => resolve({ ok: true, rateLimits: codexLimits() }); })] });
  r.start();
  await flush();
  r.stop();
  release();
  await flush();
  assert.equal(c.pending().length, 0);
});

test('SH-4: Codex use outside the CLI (no rollout growth) reaches the authority on the next scheduled read', async () => {
  const c = clock();
  const authority = new HealthAuthority(memoryStore(), { now: c.date });
  let used = 4;
  const { r } = reader(c, { outcomes: [() => ({ ok: true, rateLimits: codexLimits(used, 4) })], ingest: (limits) => codexIngest(authority, limits) });
  r.start();
  await flush();
  assert.equal(authority.getSnapshot().providers.codex.rateLimitInfo.primary.usedPercent, 4);
  used = 25; // Dad works in the native VS Code Codex extension: nothing local changes
  await c.advance(5 * MIN);
  assert.equal(authority.getSnapshot().providers.codex.rateLimitInfo.primary.usedPercent, 25, '96% → 75% left without Refresh');
});

// --- 5. backoff ---------------------------------------------------------------

test('SH-5: failures back off cadence, 2x, 4x … capped at 60 min; success resets; cli_not_found holds 60', async () => {
  const c = clock();
  const outcomes = [fail(), fail(), fail(), fail(), fail(), { ok: true, rateLimits: codexLimits() }, fail('cli_not_found'), { ok: true, rateLimits: codexLimits() }];
  const { r, reads } = reader(c, { outcomes });
  r.start();
  await flush();
  for (const step of [5, 10, 20, 40, 60, 5, 60]) await c.advance(step * MIN);
  const gaps = reads.slice(1).map((at, i) => (at - reads[i]) / MIN);
  assert.deepEqual(gaps, [5, 10, 20, 40, 60, 5, 60]);
  assert.equal(CODEX_USAGE_MAX_BACKOFF_MS, 60 * MIN);
  r.stop();
});

test('SH-5b: manual Refresh bypasses backoff; coordinator reads respect it; activity skips only a cli_not_found hold', async () => {
  const c = clock();
  const { r, reads } = reader(c, { outcomes: [fail('rpc_failed'), fail('rpc_failed'), fail('cli_not_found'), { ok: true, rateLimits: codexLimits() }] });
  r.start();
  await flush();
  await c.advance(1 * MIN);
  assert.equal(await r.requestRead('stale'), false, 'stale request refused while backing off');
  assert.equal(await r.requestRead('reset'), false, 'reset request refused while backing off');
  r.noteCodexActivity();
  await c.advance(2 * MIN);
  assert.equal(reads.length, 1, 'activity does not break an rpc_failed backoff');
  await r.refresh();
  assert.equal(reads.length, 2, 'manual Refresh always reads');
  await r.refresh(); // cli_not_found
  assert.equal(reads.length, 3);
  r.noteCodexActivity();
  await c.advance(3 * MIN);
  assert.equal(reads.length, 4, 'a growing rollout proves the CLI exists');
  r.stop();
});

// --- 6. coordinator ---------------------------------------------------------------

test('SH-6: deadlines come from canonical freshness and known resets', () => {
  const authority = new HealthAuthority(memoryStore(), { now: () => new Date(T0) });
  codexIngest(authority, codexLimits());
  const deadlines = codexFreshnessDeadlines(authority.getSnapshot(), new Date(T0), 30);
  assert.deepEqual(deadlines[0], { reason: 'stale', at: T0 + 30 * MIN + 1 });
  assert.deepEqual(deadlines.slice(1).map((d) => d.at), [(S0 + 4 * 3600) * 1000 + CODEX_RESET_GRACE_MS, (S0 + 6 * 86400) * 1000 + CODEX_RESET_GRACE_MS]);
  assert.ok(deadlines.slice(1).every((d) => d.reason === 'reset'));
});

test('SH-6b: coordinator heals at the stale deadline even with alarms off, once per deadline, then at the reset', async () => {
  const c = clock();
  const authority = new HealthAuthority(memoryStore(), { now: c.date });
  codexIngest(authority, { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: S0 + 3600 } });
  const requests = [];
  const coordinator = new UsageFreshnessCoordinator({
    reader: { requestRead: async (reason) => { requests.push([reason, c.now()]); return false; } },
    now: c.date, setTimer: c.setTimer, clearTimer: c.clearTimer
  });
  // AlarmEngine with notifications disabled emits nothing — healing must not depend on it.
  const delivered = [];
  const engine = new AlarmEngine({ load: () => ({ schemaVersion: 1, rules: {} }), save: () => {} }, {
    preferences: () => ({ ...DEFAULT_ALARM_PREFERENCES, enabled: false }), now: c.date, onEvent: (e) => delivered.push(e),
    setTimer: () => ({ unref() {} }), clearTimer: () => {}
  });
  engine.start(authority.getSnapshot());
  coordinator.rearm(authority.getSnapshot(), 30);
  await c.advance(31 * MIN);
  engine.evaluateTelemetry(authority.getSnapshot());
  assert.deepEqual(delivered, [], 'alarms disabled: no alarm:stale');
  assert.deepEqual(requests, [['stale', T0 + 30 * MIN + 1]], 'the stale deadline still requested a read');
  coordinator.rearm(authority.getSnapshot(), 30);
  await c.advance(10 * MIN);
  assert.equal(requests.length, 1, 'a fired deadline never fires again');
  await c.advance(30 * MIN); // past resetsAt (+60 min) + grace
  assert.deepEqual(requests[1], ['reset', (S0 + 3600) * 1000 + CODEX_RESET_GRACE_MS]);
  coordinator.stop();
  assert.equal(c.pending().length, 0);
});

test('SH-6c: a successful stale read re-arms from the new verifiedAt', async () => {
  const c = clock();
  const authority = new HealthAuthority(memoryStore(), { now: c.date });
  let coordinator;
  const { r } = reader(c, { ingest: (limits) => codexIngest(authority, limits), cadence: 5 });
  codexIngest(authority, codexLimits());
  coordinator = new UsageFreshnessCoordinator({ reader: r, now: c.date, setTimer: c.setTimer, clearTimer: c.clearTimer });
  authority.options.onChange = (s) => coordinator.rearm(s, 30);
  coordinator.rearm(authority.getSnapshot(), 30);
  await c.advance(31 * MIN); // reader never started: only the coordinator can heal
  const verifiedAt = Date.parse(authority.getSnapshot().providers.codex.verifiedAt);
  assert.equal(verifiedAt, T0 + 30 * MIN + 1, 'stale deadline read confirmed the facts');
  assert.equal(coordinator.armedDeadline.reason, 'stale');
  assert.equal(coordinator.armedDeadline.at, verifiedAt + 30 * MIN + 1);
  coordinator.stop();
  r.stop();
});

// --- 8. compatibility ---------------------------------------------------------------

test('SH-8: snapshots persisted before S57.39 fall back to observedAt; verifiedAt round-trips', () => {
  const legacy = { provider: 'codex', evidenceType: 'account_rate_limits', rateLimitInfo: codexLimits(), observedAt: new Date(T0).toISOString(), source: codexSource };
  const fresh = providerFreshness(legacy, new Date(T0 + 29 * MIN), 30);
  assert.equal(fresh.current, true);
  assert.equal(fresh.verifiedAt, new Date(T0).toISOString());
  assert.equal(providerFreshness(legacy, new Date(T0 + 31 * MIN), 30).current, false);
  assert.deepEqual(providerFreshness(undefined, new Date(T0), 30), { current: false });

  const saved = { schemaVersion: 1, providers: { codex: { ...legacy, verifiedAt: new Date(T0 + 20 * MIN).toISOString() } } };
  const restored = new HealthAuthority({ load: () => structuredClone(saved), save: () => {}, quarantine: () => undefined });
  assert.equal(restored.getSnapshot().providers.codex.verifiedAt, saved.providers.codex.verifiedAt);
  assert.equal(providerFreshness(restored.getSnapshot().providers.codex, new Date(T0 + 45 * MIN), 30).current, true, 'verifiedAt outranks observedAt');
  const noVerified = new HealthAuthority({ load: () => ({ schemaVersion: 1, providers: { codex: legacy } }), save: () => {}, quarantine: () => undefined });
  assert.equal(noVerified.getSnapshot().providers.codex.observedAt, legacy.observedAt, 'legacy snapshot restores unchanged');
});

// --- daemon wiring ---------------------------------------------------------------

test('SH-9: daemon starts explicit Codex acquisition, projects freshness, and honours Dad\'s cadence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-self-heal-'));
  let reads = 0;
  let daemon;
  const codexReader = new CodexUsageReader({
    ingest: (limits) => codexIngest(daemon.healthAuthorityInstance, limits),
    readOnceImpl: async () => {
      reads += 1;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const rateLimits = codexLimits();
      rateLimits.primary.resetsAt = nowSeconds + 4 * 3600;
      rateLimits.secondary.resetsAt = nowSeconds + 6 * 86400;
      return { ok: true, rateLimits };
    }
  });
  daemon = new ControlPlaneDaemon({ dir, port: 39731, idleTimeoutMs: 60000, claudeUsage: { enabled: false }, codexUsage: { enabled: true, reader: codexReader } });
  try {
    await daemon.start();
    await flush();
    assert.equal(reads, 1, 'explicit enablement reads once at start');
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const health = await (await fetch('http://127.0.0.1:39731/api/ai-health', { headers })).json();
    assert.equal(health.health.freshness.codex.current, true);
    assert.ok(Date.parse(health.health.freshness.codex.staleAfter) > Date.now());
    assert.equal(typeof health.acquisition.codex.nextAttemptAt, 'string');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'ai-health-state.json'), 'utf8'));
    assert.equal('freshness' in saved, false, 'freshness is derived, never persisted');
    const pref = await fetch('http://127.0.0.1:39731/api/preferences', { method: 'POST', headers, body: JSON.stringify({ aiUsageRefreshMinutes: 10 }) });
    assert.equal(pref.status, 200);
    assert.equal(codexReader.getCadenceMinutes(), 10, 'Codex honours "Refresh every"');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
