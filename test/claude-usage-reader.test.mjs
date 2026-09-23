import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readClaudeUsageOnce,
  canonicalClaudeWindowsFromOAuth,
  ClaudeUsageReader,
  CLAUDE_USAGE_CADENCE_MINUTES,
  isClaudeUsageCadenceMinutes
} from '../out/control-plane/claude-usage-reader.js';

const GOOD_CREDENTIALS = JSON.stringify({ claudeAiOauth: { accessToken: 'secret-token-xyz', expiresAt: Date.now() + 3_600_000 } });
const OAUTH_PAYLOAD = {
  five_hour: { utilization: 40, resets_at: '2026-09-22T06:21:20.000Z' },
  seven_day: { utilization: 57, resets_at: '2026-09-24T23:05:01.000Z' }
};

const readFileOk = async () => GOOD_CREDENTIALS;
const jsonResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body
});

// ---------------------------------------------------------------------------
// readClaudeUsageOnce / canonicalClaudeWindowsFromOAuth
// ---------------------------------------------------------------------------

test('OAuth percent normalizes to canonical 0..1 fraction and ISO reset to Unix seconds', async () => {
  const outcome = await readClaudeUsageOnce({
    readFileImpl: readFileOk,
    fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD)
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.windows.five_hour.utilization, 0.4);
  assert.equal(outcome.windows.five_hour.resetsAt, Math.floor(Date.parse('2026-09-22T06:21:20.000Z') / 1000));
  assert.equal(outcome.windows.seven_day.utilization, 0.57);
  assert.equal(outcome.windows.seven_day.resetsAt, Math.floor(Date.parse('2026-09-24T23:05:01.000Z') / 1000));
});

test('both Claude windows are acquired from one payload', async () => {
  const windows = canonicalClaudeWindowsFromOAuth(OAUTH_PAYLOAD);
  assert.ok(windows.five_hour);
  assert.ok(windows.seven_day);
});

test('a missing or invalid window is omitted, never zero-filled', () => {
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 40, resets_at: '2026-09-22T06:21:20.000Z' } }), {
    five_hour: { utilization: 0.4, resetsAt: Math.floor(Date.parse('2026-09-22T06:21:20.000Z') / 1000) }
  });
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 150, resets_at: '2026-09-22T06:21:20.000Z' } }), {});
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 40, resets_at: 'not-a-date' } }), {});
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({}), {});
  assert.deepEqual(canonicalClaudeWindowsFromOAuth(null), {});
});

test('the provider\'s post-reset shape five_hour {utilization:0, resets_at:null} is kept as canonical idle, not dropped', () => {
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 61, resets_at: '2026-09-26T12:00:01.000Z' } }), {
    five_hour: { utilization: 0, resetsAt: null },
    seven_day: { utilization: 0.61, resetsAt: Math.floor(Date.parse('2026-09-26T12:00:01.000Z') / 1000) }
  });
  // Only that exact shape is positive idle evidence; anything else without a valid reset stays unknown.
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 12, resets_at: null } }), {});
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: { utilization: 0 } }), {});
  assert.deepEqual(canonicalClaudeWindowsFromOAuth({ five_hour: null }), {});
});

test('credentials_unreadable when the credential file cannot be read or parsed', async () => {
  const outcome = await readClaudeUsageOnce({ readFileImpl: async () => { throw new Error('ENOENT'); } });
  assert.deepEqual(outcome, { ok: false, code: 'credentials_unreadable', reason: outcome.reason });
  assert.doesNotMatch(outcome.reason, /secret|token/i);
});

test('credential_expired triggers no fetch and reports the code', async () => {
  let fetchCalled = false;
  const expired = JSON.stringify({ claudeAiOauth: { accessToken: 'secret-token-xyz', expiresAt: 1000 } });
  const outcome = await readClaudeUsageOnce({
    readFileImpl: async () => expired,
    now: () => 2000,
    fetchImpl: async () => { fetchCalled = true; return jsonResponse(200, OAUTH_PAYLOAD); }
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 'credential_expired');
  assert.equal(fetchCalled, false, 'an expired token must never be sent');
});

test('HTTP 401/403 maps to auth_rejected', async () => {
  const outcome = await readClaudeUsageOnce({ readFileImpl: readFileOk, fetchImpl: async () => jsonResponse(401, {}) });
  assert.equal(outcome.code, 'auth_rejected');
});

test('HTTP 429 maps to rate_limited and honors a larger Retry-After', async () => {
  const outcome = await readClaudeUsageOnce({
    readFileImpl: readFileOk,
    fetchImpl: async () => jsonResponse(429, {}, { 'retry-after': '120' })
  });
  assert.equal(outcome.code, 'rate_limited');
  assert.equal(outcome.retryAfterMs, 120_000);
});

test('malformed JSON payload maps to malformed_response', async () => {
  const outcome = await readClaudeUsageOnce({
    readFileImpl: readFileOk,
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error('bad json'); } })
  });
  assert.equal(outcome.code, 'malformed_response');
});

test('a network/fetch failure maps to network_error', async () => {
  const outcome = await readClaudeUsageOnce({ readFileImpl: readFileOk, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(outcome.code, 'network_error');
});

test('the OAuth token never appears in any outcome, success or failure', async () => {
  const ok = await readClaudeUsageOnce({ readFileImpl: readFileOk, fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD) });
  assert.doesNotMatch(JSON.stringify(ok), /secret-token-xyz/);
  const fail = await readClaudeUsageOnce({ readFileImpl: readFileOk, fetchImpl: async () => jsonResponse(401, {}) });
  assert.doesNotMatch(JSON.stringify(fail), /secret-token-xyz/);
});

test('cadence allowlist is exactly 3/5/10/15 minutes, floor 3, old seconds-era values rejected', () => {
  assert.deepEqual(CLAUDE_USAGE_CADENCE_MINUTES, [3, 5, 10, 15]);
  for (const value of [3, 5, 10, 15]) assert.equal(isClaudeUsageCadenceMinutes(value), true);
  for (const value of [0, 1, 2, 4, 6, 11, 20, 30, '5', null, undefined]) assert.equal(isClaudeUsageCadenceMinutes(value), false);
});

// ---------------------------------------------------------------------------
// ClaudeUsageReader lifecycle (fake timers, injected fetch)
// ---------------------------------------------------------------------------

const flush = async (ticks = 3) => { for (let i = 0; i < ticks; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function fakeTimers() {
  const scheduled = [];
  return {
    setTimer: (fn, ms) => { const handle = { fn, ms, cleared: false }; scheduled.push(handle); return handle; },
    clearTimer: (handle) => { handle.cleared = true; },
    last: () => scheduled[scheduled.length - 1],
    all: () => scheduled
  };
}

test('start() performs an immediate acquisition without waiting for a timer', async () => {
  let fetchCount = 0;
  const ingested = [];
  const timers = fakeTimers();
  const reader = new ClaudeUsageReader({
    ingest: (windows) => { ingested.push(windows); return true; },
    readFileImpl: readFileOk,
    fetchImpl: async () => { fetchCount += 1; return jsonResponse(200, OAUTH_PAYLOAD); },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCount, 1, 'the first read happens at startup, before any timer fires');
  assert.equal(ingested.length, 1);
  reader.stop();
});

test('configured cadence (3/5/10/15 minutes) schedules the next read at that interval on success', async () => {
  for (const minutes of [3, 5, 10, 15]) {
    const timers = fakeTimers();
    const reader = new ClaudeUsageReader({
      ingest: () => true,
      initialCadenceMinutes: minutes,
      readFileImpl: readFileOk,
      fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD),
      setTimer: timers.setTimer, clearTimer: timers.clearTimer
    });
    reader.start();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(timers.last().ms, minutes * 60_000, `cadence ${minutes}m`);
    reader.stop();
  }
});

test('default cadence is 5 minutes, not the old 10 seconds', () => {
  const reader = new ClaudeUsageReader({ ingest: () => true });
  assert.equal(reader.getCadenceMinutes(), 5);
});

test('setCadenceMinutes rejects any value below 3 (and any value off the allowlist, including old seconds-era numbers)', () => {
  const reader = new ClaudeUsageReader({ ingest: () => true });
  for (const bad of [0, 1, 2, 4, 6, 20, 30]) {
    assert.equal(reader.setCadenceMinutes(bad), false, `${bad} must be rejected`);
    assert.equal(reader.getCadenceMinutes(), 5, 'cadence stays at the default after a rejected value');
  }
  assert.equal(reader.setCadenceMinutes(10), true);
  assert.equal(reader.getCadenceMinutes(), 10);
});

test('changing cadence updates the ONE reader\'s next schedule; no second reader is created', async () => {
  const timers = fakeTimers();
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    readFileImpl: readFileOk,
    fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD),
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await flush();
  assert.equal(timers.last().ms, 5 * 60_000);
  reader.setCadenceMinutes(15);
  timers.last().fn();
  await flush();
  assert.equal(timers.last().ms, 15 * 60_000, 'the same reader instance now schedules at the new cadence');
  reader.stop();
});

test('concurrent reads (a scheduled tick racing a manual refresh) dedupe to one fetch', async () => {
  let fetchCount = 0;
  let resolveFetch;
  const timers = fakeTimers();
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    readFileImpl: readFileOk,
    fetchImpl: async () => { fetchCount += 1; return new Promise((resolve) => { resolveFetch = () => resolve(jsonResponse(200, OAUTH_PAYLOAD)); }); },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await new Promise((resolve) => setImmediate(resolve));
  const refreshPromise = reader.refresh();
  resolveFetch();
  await refreshPromise;
  assert.equal(fetchCount, 1, 'the manual refresh joined the in-flight startup read');
  reader.stop();
});

test('failure delay does not exceed configured cadence, never self-escalates, and recovery preserves cadence', async () => {
  const timers = fakeTimers();
  let shouldFail = true;
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    initialCadenceMinutes: 3,
    readFileImpl: readFileOk,
    fetchImpl: async () => (shouldFail ? jsonResponse(500, {}) : jsonResponse(200, OAUTH_PAYLOAD)),
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await flush();
  assert.equal(timers.last().ms, 3 * 60_000, 'first failure is capped at configured cadence (3m)');
  timers.last().fn(); await flush();
  assert.equal(timers.last().ms, 3 * 60_000, 'second failure stays capped at configured cadence');
  timers.last().fn(); await flush();
  assert.equal(timers.last().ms, 3 * 60_000, 'third failure stays capped at configured cadence');
  shouldFail = false;
  timers.last().fn(); await flush();
  assert.equal(timers.last().ms, 3 * 60_000, 'recovery preserves configured cadence');
  reader.stop();
});

test('HTTP 429 without Retry-After: fallback gate is capped at configured cadence and manual refresh bypasses fallback gate', async () => {
  const timers = fakeTimers();
  let currentTime = 1_700_000_000_000;
  let fetchCount = 0;
  let shouldFail = true;
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    initialCadenceMinutes: 5,
    readFileImpl: readFileOk,
    now: () => currentTime,
    fetchImpl: async () => { fetchCount += 1; return shouldFail ? jsonResponse(429, {}) : jsonResponse(200, OAUTH_PAYLOAD); },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });

  reader.start();
  await flush();
  assert.equal(fetchCount, 1, 'startup performed one real request');
  assert.equal(timers.last().ms, 5 * 60_000, 'first 429 (no Retry-After) establishes the 5m fallback gate');

  // Manual refresh after anti-spam guard (e.g. 5 seconds later) CAN bypass Sideline fallback gate
  currentTime += 5000;
  const midGate = await reader.refresh();
  assert.equal(fetchCount, 2, 'manual refresh bypassed Sideline fallback gate to make real attempt');
  assert.equal(midGate.outcome.code, 'rate_limited');

  // Advance time past the 5-minute gate: second failure STILL caps at 5m, does NOT escalate to 10m
  currentTime += 5 * 60_000 + 1;
  timers.last().fn(); await flush();
  assert.equal(fetchCount, 3);
  assert.equal(timers.last().ms, 5 * 60_000, 'second consecutive 429 stays capped at 5m (no escalation)');

  shouldFail = false;
  currentTime += 5 * 60_000 + 1;
  timers.last().fn(); await flush();
  assert.equal(timers.last().ms, 5 * 60_000, 'recovery preserves configured cadence');
  reader.stop();
});

test('a valid Retry-After larger than the computed backoff step is honored', async () => {
  const timers = fakeTimers();
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    initialCadenceMinutes: 5,
    readFileImpl: readFileOk,
    fetchImpl: async () => jsonResponse(429, {}, { 'retry-after': '900' }),
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await flush();
  assert.equal(timers.last().ms, 900_000, 'a 15-minute Retry-After exceeds the 5m backoff step and is honored');
  reader.stop();
});

test('manual refresh does not bypass an active provider rate-limit gate', async () => {
  let fetchCount = 0;
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    initialCadenceMinutes: 5,
    readFileImpl: readFileOk,
    fetchImpl: async () => { fetchCount += 1; return jsonResponse(429, {}, { 'retry-after': '600' }); },
    setTimer: () => ({}), clearTimer: () => undefined
  });
  reader.start();
  await flush();
  assert.equal(fetchCount, 1, 'the scheduled read hit the endpoint once and got 429');
  const { outcome } = await reader.refresh();
  assert.equal(fetchCount, 1, 'manual refresh did not make a second request while the Retry-After gate is active');
  assert.equal(outcome.code, 'rate_limited');
  reader.stop();
});

test('stop() clears the pending timer and aborts an in-flight request', async () => {
  const timers = fakeTimers();
  let aborted = false;
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    readFileImpl: readFileOk,
    fetchImpl: async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      });
    },
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  reader.start();
  await new Promise((resolve) => setImmediate(resolve));
  reader.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(aborted, true);
});

// ---------------------------------------------------------------------------
// Stage 2: event-driven freshness (Claude work observed → one bounded early read)
// ---------------------------------------------------------------------------

function activityReader({ fetchImpl }) {
  let t = 0;
  const timers = fakeTimers();
  const reader = new ClaudeUsageReader({
    ingest: () => true,
    initialCadenceMinutes: 5,
    readFileImpl: readFileOk,
    fetchImpl,
    now: () => t,
    setTimer: timers.setTimer, clearTimer: timers.clearTimer
  });
  const pending = () => timers.all().filter((h) => !h.cleared && !h.fired);
  const fire = async (handle) => { handle.fired = true; handle.fn(); await flush(); };
  return { reader, timers, pending, fire, at: (ms) => { t = ms; } };
}

test('Claude activity: a burst coalesces into ONE early read after it settles, and the cadence restarts as a single chain', async () => {
  let fetchCount = 0;
  const r = activityReader({ fetchImpl: async () => { fetchCount += 1; return jsonResponse(200, OAUTH_PAYLOAD); } });
  r.reader.start();
  await flush();
  assert.equal(fetchCount, 1);
  const startupCadence = r.pending()[0];
  assert.equal(startupCadence.ms, 5 * 60_000);

  for (const sec of [100, 101, 105]) { r.at(sec * 1000); r.reader.noteClaudeActivity(); }
  const activity = r.pending().filter((h) => h !== startupCadence);
  assert.equal(activity.length, 1, 'the burst leaves exactly one pending activity read');
  assert.equal(activity[0].ms, 15_000, 'fires once activity has been quiet for 15s (t=120s), not 5 minutes later');

  r.at(120_000);
  await r.fire(activity[0]);
  assert.equal(fetchCount, 2, 'the activity produced one real read without waiting for the cadence');
  assert.equal(startupCadence.cleared, true, 'the old cadence timer is replaced, not left running');
  const chains = r.pending();
  assert.equal(chains.length, 1, 'exactly one cadence chain remains');
  assert.equal(chains[0].ms, 5 * 60_000);
  r.reader.stop();
});

test('Claude activity: reads are spaced at least 90s apart, and continuous work still converges within 2 minutes', async () => {
  const r = activityReader({ fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD) });
  r.reader.start();
  await flush();
  // Right after the startup read (t=0), activity at t=5s waits for spacing (t=90s), not settle (t=20s).
  r.at(5_000); r.reader.noteClaudeActivity();
  assert.equal(r.timers.last().ms, 85_000);
  r.reader.stop();

  const c = activityReader({ fetchImpl: async () => jsonResponse(200, OAUTH_PAYLOAD) });
  c.reader.start();
  await flush();
  // Activity every 10s from t=100s: the settle point keeps moving, but never past t=220s (100s + 120s max wait).
  for (let sec = 100; sec <= 210; sec += 10) { c.at(sec * 1000); c.reader.noteClaudeActivity(); }
  assert.equal(c.timers.last().ms, 10_000, 'scheduled for t=220s even though activity has not stopped');
  c.reader.stop();
});

test('Claude activity never bypasses an explicit provider Retry-After', async () => {
  let fetchCount = 0;
  const r = activityReader({ fetchImpl: async () => { fetchCount += 1; return jsonResponse(429, {}, { 'retry-after': '600' }); } });
  r.reader.start();
  await flush();
  assert.equal(fetchCount, 1);
  r.at(10_000); r.reader.noteClaudeActivity();
  const activity = r.timers.last();
  r.at(10_000 + activity.ms);
  await r.fire(activity);
  assert.equal(fetchCount, 1, 'no request while the provider-directed gate is active');
  r.reader.stop();
});

test('stop() cancels a pending activity read', async () => {
  let fetchCount = 0;
  const r = activityReader({ fetchImpl: async () => { fetchCount += 1; return jsonResponse(200, OAUTH_PAYLOAD); } });
  r.reader.start();
  await flush();
  r.at(200_000); r.reader.noteClaudeActivity();
  const activity = r.timers.last();
  r.reader.stop();
  assert.equal(activity.cleared, true);
  r.reader.noteClaudeActivity();
  assert.equal(r.timers.last(), activity, 'a stopped reader schedules nothing');
  assert.equal(fetchCount, 1);
});
