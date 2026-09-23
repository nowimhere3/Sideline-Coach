import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HealthAuthority, fileHealthStateStore } from '../out/control-plane/health-authority.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-health-authority-'));
// Real Claude provider shape (see Ai Usage - Real Time's
// test/fixtures/claude-rate-limit-event.json): a single event already nests
// BOTH windows under unifiedWindows, each with a 0-1 utilization fraction and
// a Unix-seconds resetsAt.
const evidence = (info = {
  status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
  unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 123456 }, seven_day: { utilization: 0.15, resetsAt: 654321 } }
}) => ({
  stadiumId: 'stadium-1', instanceId: 'window-1', gameId: 'game-1', playerInstanceId: 'claude-1',
  evidence: { provider: 'claude', type: 'rate_limit_event', rate_limit_info: info }
});
const codexEvidence = (facts = { primary: { usedPercent: 17, resetsAt: 777, windowDurationMins: 300 }, secondary: null, planType: 'pro', rateLimitReachedType: null }) => ({
  stadiumId: 'stadium-1', instanceId: 'window-1', gameId: 'game-1', playerInstanceId: 'codex-1',
  evidence: { provider: 'codex', type: 'account_rate_limits', rate_limits: facts }
});

test('missing file initializes cleanly', () => {
  const dir = temp();
  try { assert.deepEqual(new HealthAuthority(fileHealthStateStore(path.join(dir, 'ai-health-state.json'))).getSnapshot(), { schemaVersion: 1, providers: {} }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('real Claude event renders both windows from unifiedWindows, is replay-stable, replaceable, and defensively copied', () => {
  const states = [];
  let tick = 0;
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(++tick * 1000), onChange: (state) => states.push(state) });
  const first = evidence();
  assert.equal(authority.ingest(first), true);
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo;
  assert.equal(snapshot.unifiedWindows.five_hour.utilization, 0.42);
  assert.equal(snapshot.unifiedWindows.seven_day.utilization, 0.15);
  assert.equal('classification' in authority.getSnapshot().providers.claude, false);
  assert.equal('policy' in authority.getSnapshot().providers.claude, false);
  assert.equal(authority.ingest(first), false, 'identical canonical windows are suppressed as replay');
  assert.equal(states.length, 1, 'identical replay produces no false change');
  const updated = evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.73, resetsAt: 999999 }, seven_day: { utilization: 0.15, resetsAt: 654321 } }
  });
  assert.equal(authority.ingest(updated), true);
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.73);
  const copy = authority.getSnapshot();
  copy.providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization = 999;
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.73);
});

test('partial incoming Claude window (legacy flat single-window evidence) preserves the other last-known unifiedWindows window', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(0) });
  assert.equal(authority.ingest(evidence()), true, 'real event seeds both windows');
  const flatFiveHour = evidence({ status: 'allowed', utilization: 0.88, resetsAt: 200000, rateLimitType: 'five_hour' });
  assert.equal(authority.ingest(flatFiveHour), true);
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo;
  assert.equal(snapshot.unifiedWindows.five_hour.utilization, 0.88, 'incoming five_hour overwrites');
  assert.equal(snapshot.unifiedWindows.seven_day.utilization, 0.15, 'previously known seven_day is preserved, not dropped');
});

test('legacy flat single-window Claude evidence (no unifiedWindows) still loads and renders its own window', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store);
  const legacy = evidence({ status: 'allowed', utilization: 0.42, resetsAt: 123456, rateLimitType: 'five_hour' });
  assert.equal(authority.ingest(legacy), true);
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo;
  assert.equal(snapshot.unifiedWindows.five_hour.utilization, 0.42, 'legacy flat frame is normalized into canonical unifiedWindows');
  assert.equal(snapshot.unifiedWindows.seven_day, undefined, 'no seven_day was ever known');
});

test('Codex coexists with Claude, updates independently, and suppresses provider-specific replay', () => {
  const changes = [];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { onChange: (state) => changes.push(state) });
  authority.ingest(evidence());
  const codex = codexEvidence();
  assert.equal(authority.ingest(codex), true);
  assert.deepEqual(authority.getSnapshot().providers.codex.rateLimitInfo, codex.evidence.rate_limits);
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.42);
  assert.equal(authority.ingest(codex), false);
  assert.equal(changes.length, 2);
  assert.equal(authority.ingest(codexEvidence({ primary: { usedPercent: 23 }, planType: 'pro' })), true);
  assert.equal(authority.getSnapshot().providers.codex.rateLimitInfo.primary.usedPercent, 23);
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.42, 'Codex update does not overwrite Claude');
  assert.equal('classification' in authority.getSnapshot().providers.codex, false);
});

test('Claude replay dedupes on canonical windows regardless of source/provenance, and is observed at ingestion time', () => {
  const changes = [];
  const times = [new Date('2026-09-21T20:00:00.000Z'), new Date('2026-09-21T20:01:00.000Z'), new Date('2026-09-21T20:02:00.000Z')];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => times.shift(), onChange: (snapshot) => changes.push(snapshot) });
  const fromA = evidence();
  assert.equal(authority.ingest(fromA), true, 'Player A evidence is accepted');
  assert.equal(authority.ingest(fromA), false, 'exact Player A replay is suppressed');
  const fromB = { ...structuredClone(fromA), instanceId: 'window-2', playerInstanceId: 'claude-2' };
  assert.equal(authority.ingest(fromB), false, 'identical canonical windows from a distinct source do not cause a false change');
  const snapshot = authority.getSnapshot();
  assert.equal(changes.length, 1, 'only the first ingest produced a change');
  assert.equal(snapshot.providers.claude.source.playerInstanceId, 'claude-1', 'source from the first ingest is retained since the second was deduped');
  assert.equal(snapshot.providers.claude.rateLimitInfo.unifiedWindows.five_hour.resetsAt, 123456, 'provider reset remains a native fact');
  assert.equal(snapshot.providers.claude.observedAt, '2026-09-21T20:00:00.000Z', 'observation is ingestion time of the accepted evidence');
  assert.equal('classification' in snapshot.providers.claude, false);
  assert.equal('healthy' in snapshot.providers.claude, false);
  assert.equal('degraded' in snapshot.providers.claude, false);
  assert.equal('critical' in snapshot.providers.claude, false);
});

test('Claude retains both five_hour and seven_day canonical windows from successive legacy flat frames, and each replays independently', () => {
  const changes = [];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(0), onChange: (state) => changes.push(state) });
  const fiveHour = evidence({ status: 'allowed', utilization: 1.0, resetsAt: 111, rateLimitType: 'five_hour' });
  assert.equal(authority.ingest(fiveHour), true);
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.seven_day, undefined, 'only one window known: no seven_day yet');

  const sevenDay = evidence({ status: 'allowed', utilization: 0.57, resetsAt: 222, rateLimitType: 'seven_day' });
  assert.equal(authority.ingest(sevenDay), true);
  const snapshot = authority.getSnapshot();
  assert.equal(snapshot.providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 1.0);
  assert.equal(snapshot.providers.claude.rateLimitInfo.unifiedWindows.five_hour.resetsAt, 111);
  assert.equal(snapshot.providers.claude.rateLimitInfo.unifiedWindows.seven_day.utilization, 0.57);
  assert.equal(snapshot.providers.claude.rateLimitInfo.unifiedWindows.seven_day.resetsAt, 222);
  assert.equal(snapshot.providers.claude.rateLimitInfo.rateLimitType, 'seven_day', 'top-level facts reflect the latest observation');

  assert.equal(authority.ingest(sevenDay), false, 'identical seven_day replay is suppressed');
  assert.equal(changes.length, 2, 'no false onChange for the identical replay');
  assert.equal(authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 1.0, 'five_hour survives the seven_day replay attempt');

  const updatedFiveHour = evidence({ status: 'allowed', utilization: 0.88, resetsAt: 333, rateLimitType: 'five_hour' });
  assert.equal(authority.ingest(updatedFiveHour), true);
  const latest = authority.getSnapshot();
  assert.equal(latest.providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.88, 'five_hour updates independently');
  assert.equal(latest.providers.claude.rateLimitInfo.unifiedWindows.seven_day.utilization, 0.57, 'seven_day unaffected by five_hour update');
  assert.equal('classification' in latest.providers.claude, false);
  assert.equal('healthy' in latest.providers.claude, false);
});

test('Codex rate limits remain unaffected by Claude dual-window retention', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store);
  authority.ingest(evidence({ status: 'allowed', utilization: 0.1, resetsAt: 1, rateLimitType: 'five_hour' }));
  authority.ingest(evidence({ status: 'allowed', utilization: 0.2, resetsAt: 2, rateLimitType: 'seven_day' }));
  const codex = codexEvidence();
  assert.equal(authority.ingest(codex), true);
  assert.deepEqual(authority.getSnapshot().providers.codex.rateLimitInfo, codex.evidence.rate_limits);
  assert.equal(authority.ingest(codex), false, 'Codex replay suppression is unchanged');
});

test('push and OAuth-reader evidence with identical canonical windows converge to one change, not two', () => {
  const changes = [];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { onChange: (state) => changes.push(state) });
  assert.equal(authority.ingest(evidence()), true, 'push evidence accepted');
  assert.equal(
    authority.ingestClaudeUsage({ five_hour: { utilization: 0.42, resetsAt: 123456 }, seven_day: { utilization: 0.15, resetsAt: 654321 } }),
    false,
    'identical OAuth-reader windows produce no duplicate change'
  );
  assert.equal(changes.length, 1);
});

test('ingestClaudeUsage with a changed factual window produces one change and is visible via the same snapshot the Scoreboard reads', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(0) });
  assert.equal(authority.ingest(evidence()), true);
  assert.equal(authority.ingestClaudeUsage({ five_hour: { utilization: 0.6, resetsAt: 200000 } }), true, 'a changed five_hour is a real change');
  const snapshot = authority.getSnapshot().providers.claude;
  assert.equal(snapshot.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.6);
  assert.equal(snapshot.rateLimitInfo.unifiedWindows.seven_day.utilization, 0.15, 'seven_day preserved from the earlier push');
  assert.equal(snapshot.evidenceType, 'oauth_usage', 'provenance of the most recent accepted change');
});

test('ingestClaudeUsage never persists reader source/credential detail and ignores an empty window set', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store);
  assert.equal(authority.ingestClaudeUsage({}), false, 'nothing acquired is not a change');
  assert.equal(authority.ingestClaudeUsage({ five_hour: { utilization: 0.1, resetsAt: 1 } }), true);
  const source = authority.getSnapshot().providers.claude.source;
  assert.equal(source.stadiumId, 'control-plane');
  assert.equal(source.playerInstanceId, 'claude-oauth-reader');
});

test('atomic save writes valid JSON and restores into a new Authority', () => {
  const dir = temp();
  const file = path.join(dir, 'ai-health-state.json');
  try {
    const authority = new HealthAuthority(fileHealthStateStore(file), { now: () => new Date('2026-09-21T12:00:00.000Z') });
    authority.ingest(evidence());
    authority.ingest(codexEvidence());
    assert.equal(authority.flush(), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), authority.getSnapshot());
    assert.deepEqual(new HealthAuthority(fileHealthStateStore(file)).getSnapshot(), authority.getSnapshot());
    assert.ok(authority.getSnapshot().providers.claude && authority.getSnapshot().providers.codex, 'both providers persist together');
    assert.deepEqual(fs.readdirSync(dir), ['ai-health-state.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('corrupt JSON and unsupported newer schema are quarantined and start clean', () => {
  for (const [name, content] of [['corrupt', '{nope'], ['newer', JSON.stringify({ schemaVersion: 99, providers: {} })]]) {
    const dir = temp();
    const file = path.join(dir, 'ai-health-state.json');
    try {
      fs.writeFileSync(file, content);
      const authority = new HealthAuthority(fileHealthStateStore(file));
      assert.deepEqual(authority.getSnapshot(), { schemaVersion: 1, providers: {} }, name);
      assert.equal(fs.existsSync(file), false, name);
      assert.ok(fs.readdirSync(dir).some((entry) => entry.startsWith('ai-health-state.json') && entry.endsWith('.bak')), name);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

// ---------------------------------------------------------------------------
// Claude 5H Freshness repair: an expired window with no fresh provider
// replacement must not survive indefinitely as current truth (Rule A), zero
// is never fabricated (Rule B), and an older reset cycle can never overwrite
// a newer one (Rule C). See Reports/AntiGravity/Claude-5H-Freshness-Seam-
// Validation__20260922-063800__AntiGravity.md.
// ---------------------------------------------------------------------------

test('expired five_hour with no fresh replacement is dropped, not retained as stale current truth', () => {
  const changes = [];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  // "now" sits after five_hour's resetsAt (200) but before seven_day's (999999).
  const authority = new HealthAuthority(store, { now: () => new Date(500_000), onChange: (state) => changes.push(state) });
  assert.equal(authority.ingest(evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.26, resetsAt: 200 }, seven_day: { utilization: 0.1, resetsAt: 999999 } }
  })), true, 'seeds both windows');
  // Incoming OAuth read omits five_hour (provider boundary lag) but carries a valid seven_day.
  assert.equal(authority.ingestClaudeUsage({ seven_day: { utilization: 0.1, resetsAt: 999999 } }), true, 'five_hour disappearing is itself a real state change');
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.deepEqual(snapshot.five_hour, { utilization: 0, resetsAt: null }, 'expired five_hour transitions to post-reset state: 100% left / 0% used / reset UNKNOWN');
  assert.equal(snapshot.seven_day.utilization, 0.1, 'still-valid seven_day is unaffected');
  assert.equal(changes.length, 2, 'the eviction triggered a normal change notification');
});

test('fresh (not-yet-expired) missing window is still preserved', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  // "now" sits before five_hour's resetsAt (999999): it has not expired yet.
  const authority = new HealthAuthority(store, { now: () => new Date(500_000) });
  assert.equal(authority.ingest(evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.26, resetsAt: 999999 }, seven_day: { utilization: 0.1, resetsAt: 999999 } }
  })), true);
  assert.equal(authority.ingestClaudeUsage({ seven_day: { utilization: 0.12, resetsAt: 999999 } }), true);
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapshot.five_hour.utilization, 0.26, 'still-fresh five_hour survives being temporarily missing from this read');
  assert.equal(snapshot.seven_day.utilization, 0.12);
});

test('an older reset cycle cannot overwrite a newer stored reset cycle (stale replay rejected)', () => {
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(500_000) });
  assert.equal(authority.ingest(evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0, resetsAt: 999999 } }
  })), true, 'seeds the newer T2 reset cycle');
  // A stale, out-of-order rate_limit_event push carrying the OLDER T1 cycle arrives afterward.
  assert.equal(authority.ingest(evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.9, resetsAt: 600000 } }
  })), false, 'older reset cycle is rejected as a stale replay; no change');
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapshot.five_hour.utilization, 0, 'the newer stored cycle remains authoritative');
  assert.equal(snapshot.five_hour.resetsAt, 999999);
});

test('a legitimate new reset (valid zero, future resetsAt) is ingested even when the old cycle just expired', () => {
  const changes = [];
  const store = { load: () => undefined, save: () => undefined, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { now: () => new Date(500_000), onChange: (state) => changes.push(state) });
  assert.equal(authority.ingest(evidence({
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.99, resetsAt: 200 } }
  })), true, 'seeds an old, about-to-expire five_hour');
  assert.equal(authority.ingestClaudeUsage({ five_hour: { utilization: 0, resetsAt: 999999 } }), true, 'provider-supplied zero for the new cycle is a real change');
  const snapshot = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapshot.five_hour.utilization, 0, 'real provider zero is preserved, never dropped or refused');
  assert.equal(snapshot.five_hour.resetsAt, 999999);
  assert.equal(changes.length, 2);
});

test('persistence failure leaves good in-memory state intact', () => {
  const warnings = [];
  const store = { load: () => undefined, save: () => { throw new Error('disk full'); }, quarantine: () => undefined };
  const authority = new HealthAuthority(store, { warn: (message) => warnings.push(message) });
  authority.ingest(evidence());
  const before = authority.getSnapshot();
  assert.equal(authority.flush(), false);
  assert.deepEqual(authority.getSnapshot(), before);
  assert.match(warnings[0], /disk full/);
});
