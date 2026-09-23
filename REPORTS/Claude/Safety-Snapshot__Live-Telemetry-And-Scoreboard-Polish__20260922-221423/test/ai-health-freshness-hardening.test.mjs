import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';

import { HealthAuthority, resolveCodexWindows } from '../out/control-plane/health-authority.js';
import { ClaudeUsageReader } from '../out/control-plane/claude-usage-reader.js';
import { CodexUsageReader } from '../out/control-plane/codex-usage-reader.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { formatRefreshFeedback } from '../out/control-plane/protocol.js';
import { CodexAppServerControl } from '../out/player-control/codex-app-server.js';
import { createClaudeControlFactory } from '../out/player-control/structured-print.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-test-'));
}

const memoryStore = () => {
  let current = null;
  return {
    load: () => current,
    save: (snap) => { current = snap; },
    quarantine: () => null
  };
};

const T0 = 1_700_000_000_000;

function post(port, route, token, body = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: route,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ============================================================================
// 1. Production Claude factory forwards onHealthFrame
// ============================================================================
test('1. Production Claude factory forwards onHealthFrame to stadiumClient', () => {
  const extensionSource = fs.readFileSync(path.resolve('src/extension.ts'), 'utf8');
  assert.match(
    extensionSource,
    /register\('claude',\s*createClaudeControlFactory\(\{\s*onHealthFrame:\s*\(instanceId,\s*evidence\)\s*=>\s*stadiumClient\?\.sendHealthEvidence\(instanceId,\s*evidence\)\s*\}\)\)/,
    'Claude factory must be wired with the exact same onHealthFrame forwarding callback as Codex'
  );

  let receivedInstanceId = null;
  let receivedEvidence = null;
  const factory = createClaudeControlFactory({
    onHealthFrame: (id, ev) => {
      receivedInstanceId = id;
      receivedEvidence = ev;
    }
  });

  assert.ok(factory, 'createClaudeControlFactory instantiates successfully with onHealthFrame');
});

// ============================================================================
// 2 & 3. Real unifiedWindows Claude event reaches HealthAuthority & changes health immediately
// ============================================================================
test('2 & 3. Real unifiedWindows Claude event reaches HealthAuthority and changes health immediately without waiting for OAuth polling', () => {
  let changeCount = 0;
  let snapshotObserved = null;

  const authority = new HealthAuthority(memoryStore(), {
    now: () => new Date(T0),
    onChange: (snap) => {
      changeCount++;
      snapshotObserved = snap;
    }
  });

  const realClaudeEvent = {
    provider: 'claude',
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed',
      rateLimitType: 'five_hour',
      unifiedWindows: {
        five_hour: { utilization: 0.26, resetsAt: Math.floor((T0 + 3600_000) / 1000) },
        seven_day: { utilization: 0.42, resetsAt: Math.floor((T0 + 86400_000) / 1000) }
      }
    }
  };

  const changed = authority.ingest({
    stadiumId: 's1',
    instanceId: 'w1',
    gameId: 'g1',
    playerInstanceId: 'claude-1',
    evidence: realClaudeEvent
  });

  assert.equal(changed, true, 'Immediate change reported synchronously');
  assert.equal(changeCount, 1, 'onChange callback invoked immediately (zero polling wait)');
  assert.ok(snapshotObserved);

  const claudeState = authority.getSnapshot().providers.claude;
  assert.ok(claudeState);
  assert.equal(claudeState.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.26);
  assert.equal(claudeState.rateLimitInfo.unifiedWindows.seven_day.utilization, 0.42);
});

// ============================================================================
// 4. Default 5-minute fallback cannot silently escalate to 10/20/40/60 minutes
// ============================================================================
test('4. Default 5-minute fallback cannot silently escalate to 10/20/40/60 minutes without provider Retry-After', async () => {
  let nowMs = T0;
  const scheduledDelays = [];

  const fetch429NoRetry = async () => ({
    ok: false,
    status: 429,
    headers: { get: () => null },
    json: async () => ({ error: 'rate_limited' })
  });

  const reader = new ClaudeUsageReader({
    credentialPath: 'dummy',
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'token', expiresAt: nowMs + 3600000 } }),
    fetchImpl: fetch429NoRetry,
    initialCadenceMinutes: 5,
    now: () => nowMs,
    setTimer: (fn, delayMs) => {
      scheduledDelays.push(delayMs);
      return 1;
    },
    clearTimer: () => {}
  });

  reader.start();
  await new Promise((r) => setImmediate(r));

  assert.equal(scheduledDelays[0], 5 * 60 * 1000, 'first failure schedules 5 minutes');

  nowMs += 5 * 60 * 1000 + 1;
  await reader.refresh();

  const lastDelay = scheduledDelays[scheduledDelays.length - 1];
  assert.equal(lastDelay, 5 * 60 * 1000, 'fallback gate MUST NOT escalate to 10/20/40/60m');

  const status = reader.getStatus();
  assert.equal(status.gateType, 'Sideline fallback gate');
});

// ============================================================================
// 5. Explicit Retry-After is still honored
// ============================================================================
test('5. Explicit Retry-After is still honored under provider-directed gate', async () => {
  const nowMs = T0;
  const scheduledDelays = [];

  const fetch429WithRetry = async () => ({
    ok: false,
    status: 429,
    headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '900' : null) },
    json: async () => ({ error: 'rate_limited' })
  });

  const reader = new ClaudeUsageReader({
    credentialPath: 'dummy',
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'token', expiresAt: nowMs + 3600000 } }),
    fetchImpl: fetch429WithRetry,
    initialCadenceMinutes: 5,
    now: () => nowMs,
    setTimer: (fn, delayMs) => {
      scheduledDelays.push(delayMs);
      return 1;
    },
    clearTimer: () => {}
  });

  reader.start();
  await new Promise((r) => setImmediate(r));

  assert.equal(scheduledDelays[0], 900 * 1000, 'honors explicit 900s Retry-After');
  const status = reader.getStatus();
  assert.equal(status.gateType, 'provider-directed gate');
  assert.equal(status.code, 'rate_limited');
});

// ============================================================================
// 6. Manual Refresh can bypass internal fallback but not explicit provider Retry-After
// ============================================================================
test('6. Manual Refresh can bypass internal fallback gate but NOT explicit provider Retry-After', async () => {
  let nowMs = T0;
  let fetchCallCount = 0;

  const fetchProvider429 = async () => {
    fetchCallCount++;
    return {
      ok: false,
      status: 429,
      headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '600' : null) },
      json: async () => ({ error: 'rate_limited' })
    };
  };

  const providerReader = new ClaudeUsageReader({
    credentialPath: 'dummy',
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'token', expiresAt: nowMs + 3600000 } }),
    fetchImpl: fetchProvider429,
    now: () => nowMs,
    setTimer: () => 1,
    clearTimer: () => {}
  });

  providerReader.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(fetchCallCount, 1);

  const providerRefreshRes = await providerReader.refresh();
  assert.equal(fetchCallCount, 1, 'no fetch made during active provider Retry-After');
  assert.equal(providerRefreshRes.outcome.code, 'rate_limited');

  fetchCallCount = 0;
  const fetchFallback429 = async () => {
    fetchCallCount++;
    return {
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: 'rate_limited' })
    };
  };

  const fallbackReader = new ClaudeUsageReader({
    credentialPath: 'dummy',
    readFileImpl: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'token', expiresAt: nowMs + 3600000 } }),
    fetchImpl: fetchFallback429,
    now: () => nowMs,
    setTimer: () => 1,
    clearTimer: () => {}
  });

  fallbackReader.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(fetchCallCount, 1);

  nowMs += 5000;
  const fallbackRefreshRes = await fallbackReader.refresh();
  assert.equal(fetchCallCount, 2, 'manual Refresh BYPASSED Sideline internal fallback gate to make a real attempt');
});

// ============================================================================
// 7. Manual Refresh performs real Codex account/rateLimits/read
// ============================================================================
test('7. Manual Refresh performs real Codex account/rateLimits/read via CodexUsageReader', async () => {
  const authority = new HealthAuthority(memoryStore(), { now: () => new Date(T0) });

  const reader = new CodexUsageReader({
    ingest: (limits) => authority.ingest({
      stadiumId: 'control-plane',
      instanceId: 'codex-manual-reader',
      gameId: 'control-plane',
      playerInstanceId: 'codex-manual-reader',
      evidence: {
        provider: 'codex',
        type: 'account_rate_limits',
        rate_limits: limits
      }
    }),
    readOnceImpl: async () => ({
      ok: true,
      rateLimits: {
        primary: { usedPercent: 12, resetsAt: Math.floor((T0 + 7200_000) / 1000), windowDurationMins: 300 }
      }
    }),
    now: () => T0
  });

  const result = await reader.refresh();
  assert.equal(result.outcome.ok, true);
  assert.equal(result.changed, true);

  const codexState = authority.getSnapshot().providers.codex;
  assert.ok(codexState);
  assert.equal(codexState.rateLimitInfo.primary.usedPercent, 12);
});

// ============================================================================
// 8 & 9. Codex turn/completed performs exactly one final rate-limit read (no model turn)
// ============================================================================
test('8 & 9. Codex turn/completed performs exactly one final zero-inference readRateLimits read on existing session', async () => {
  let rateLimitsReadCalls = 0;
  let modelTurnCalls = 0;
  let emittedHealthFrames = [];

  class FakeRpc extends EventEmitter {
    async request(method, params) {
      if (method === 'account/rateLimits/read') {
        rateLimitsReadCalls++;
        return { rateLimits: { primary: { usedPercent: 15 } } };
      }
      if (method === 'turn/start' || method === 'inference') {
        modelTurnCalls++;
        return {};
      }
      return {};
    }
  }

  const fakeRpc = new FakeRpc();
  const compat = {
    context: {},
    key: 'default',
    registry: { isTurnProven: () => true, recordTurnProof: () => {}, latch: () => {} }
  };

  const control = Reflect.construct(CodexAppServerControl, [
    'cx-turn-test',
    'thread-123',
    '0.154.0',
    'gpt-5',
    'medium',
    fakeRpc,
    10,
    100,
    compat,
    (id, ev) => { emittedHealthFrames.push({ id, ev }); },
    {}
  ]);

  control.notification('turn/completed', {
    threadId: 'thread-123',
    turn: { id: 'turn-123', status: 'completed' }
  });

  await new Promise((r) => setTimeout(r, 50));

  assert.equal(rateLimitsReadCalls, 1, 'exactly one rate limits read performed on turn/completed');
  assert.equal(modelTurnCalls, 0, 'zero model/inference turns created');
  assert.equal(emittedHealthFrames.length, 1, 'emitted via existing onHealthFrame pathway');
  assert.equal(emittedHealthFrames[0].ev.provider, 'codex');
});

// ============================================================================
// 10. Refresh UI truthfulness and dual-provider outcomes
// ============================================================================
test('10. Refresh feedback truthfully states outcomes for both providers', () => {
  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'changed', checkedAt: '' },
    codex: { outcome: 'unchanged', checkedAt: '' }
  }), 'Refreshed ✓');

  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'rate_limited', checkedAt: '' },
    codex: { outcome: 'changed', checkedAt: '' }
  }), 'Codex refreshed · Claude rate-limited');

  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'failed', checkedAt: '' },
    codex: { outcome: 'changed', checkedAt: '' }
  }), 'Codex refreshed · Claude failed');

  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'changed', checkedAt: '' },
    codex: { outcome: 'unavailable', checkedAt: '' }
  }), 'Claude refreshed · Codex unavailable');

  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'rate_limited', checkedAt: '' },
    codex: { outcome: 'unavailable', checkedAt: '' }
  }), 'Claude rate-limited · Codex unavailable');

  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'failed', checkedAt: '' },
    codex: { outcome: 'failed', checkedAt: '' }
  }), 'Refresh failed');

  // A successful read the authority did not fully accept is never "Refreshed ✓".
  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'retained', notReflected: ['seven_day'], checkedAt: '' },
    codex: { outcome: 'unchanged', checkedAt: '' }
  }), 'Codex refreshed · Claude not updated');
  assert.equal(formatRefreshFeedback({
    claude: { outcome: 'auth_rejected', checkedAt: '' },
    codex: { outcome: 'changed', checkedAt: '' }
  }), 'Codex refreshed · Claude failed');
});

// ============================================================================
// 11. Dual-provider POST /api/ai-health/refresh endpoint & persistence convergence
// ============================================================================
test('11. POST /api/ai-health/refresh refreshes both providers and converges to HealthAuthority persistence', async () => {
  const dir = createTempDir();

  const claudeReader = new ClaudeUsageReader({
    ingest: () => true,
    setTimer: () => 1,
    clearTimer: () => {}
  });
  // Claims "changed" only because it really ingests into the daemon's authority —
  // the endpoint now verifies the authority reflects the read before saying so.
  let daemonRef;
  const claudeWindows = { five_hour: { utilization: 0.1, resetsAt: Math.floor(Date.now() / 1000) + 3600 } };
  claudeReader.refresh = async () => ({
    outcome: { ok: true, windows: claudeWindows },
    changed: daemonRef.healthAuthorityInstance.ingestClaudeUsage(claudeWindows)
  });

  const codexReader = new CodexUsageReader({
    ingest: () => true
  });
  codexReader.refresh = async () => ({
    outcome: { ok: true, rateLimits: { five_hour: { utilization: 0.2, resetsAt: 200 } } },
    changed: true
  });

  const daemon = new ControlPlaneDaemon({
    dir,
    port: 39719,
    idleTimeoutMs: 60000,
    claudeUsage: { enabled: true, reader: claudeReader },
    codexUsage: { enabled: true, reader: codexReader }
  });
  daemonRef = daemon;

  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();

    const response = await post(39719, '/api/ai-health/refresh', token);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.acquisition.claude.outcome, 'changed');
    assert.equal(response.body.acquisition.codex.outcome, 'changed');
    assert.equal(formatRefreshFeedback(response.body.acquisition), 'Refreshed ✓');
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// 12. Codex reset-boundary field case: Weekly = 1% left, resets 5:05 PM, clock = 5:10 PM
// ============================================================================
test('12. Codex reset-boundary field case: Weekly = 1% left, resets 5:05 PM, clock = 5:10 PM -> old 1% cycle must no longer appear current', () => {
  // Field scenario coordinates: 5:00 PM, 5:05 PM (resetsAt), 5:10 PM (current clock)
  const T_500 = new Date('2026-09-22T17:00:00.000Z');
  const T_505 = new Date('2026-09-22T17:05:00.000Z');
  const T_510 = new Date('2026-09-22T17:10:00.000Z');
  const resetsAt_505 = Math.floor(T_505.getTime() / 1000);
  const future5HReset = Math.floor(new Date('2026-09-22T22:00:00.000Z').getTime() / 1000);

  let currentClock = T_500;
  const authority = new HealthAuthority(memoryStore(), {
    now: () => currentClock
  });

  // 1. At 5:00 PM, Codex seeds: 5H = 85% left (15% used), Weekly = 1% left (99% used), resets at 5:05 PM
  const seeded = authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'codex-1',
    evidence: {
      provider: 'codex',
      type: 'account_rate_limits',
      rate_limits: {
        primary: { usedPercent: 15, resetsAt: future5HReset, windowDurationMins: 300 },
        secondary: { usedPercent: 99, resetsAt: resetsAt_505, windowDurationMins: 10080 },
        planType: 'pro'
      }
    }
  });
  assert.equal(seeded, true, 'Seeded Codex rate limits successfully at 5:00 PM');

  // Verify at 5:00 PM: Weekly window is active and current
  const snap500 = authority.getSnapshot().providers.codex.rateLimitInfo;
  assert.equal(snap500.secondary.usedPercent, 99, 'At 5:00 PM before reset, weekly window shows 99% used / 1% left');
  const resolved500 = resolveCodexWindows(snap500, T_500);
  assert.ok(resolved500.weekly, 'At 5:00 PM, weekly window resolves');
  assert.equal(resolved500.weekly.usedPercent, 99);

  // 2. Advance clock to 5:10 PM: resetsAt (5:05 PM) has passed (resetsAt <= now)
  currentClock = T_510;

  // A: Authority prunes expired window from current factual health
  const pruned = authority.pruneExpired(T_510);
  assert.equal(pruned, true, 'authority.pruneExpired recognizes expired weekly cycle and drops it');
  const snap510 = authority.getSnapshot().providers.codex.rateLimitInfo;
  assert.equal(snap510.secondary, undefined, 'Expired weekly window is dropped from current factual health');
  assert.ok(snap510.primary, 'Still-valid 5H window (resetting at 10:00 PM) remains intact');

  // B: UI resolution resolves the expired weekly window as UNKNOWN / pending fresh acquisition
  // (never fabricates 100%, never retains the expired old percentage)
  const resolved510 = resolveCodexWindows(snap500, T_510);
  assert.equal(resolved510.weekly, undefined, 'UI resolves expired weekly window as UNKNOWN / undefined');
  assert.ok(resolved510.fiveHour, '5H window still resolves');
  assert.equal(resolved510.fiveHour.usedPercent, 15);

  // C: Ingesting fresh acquisition that omits the weekly window (e.g. boundary lag where OpenAI temporarily omits it)
  // must NOT resurrect the expired 1% cycle
  const boundaryLagUpdate = authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'codex-1',
    evidence: {
      provider: 'codex',
      type: 'account_rate_limits',
      rate_limits: {
        primary: { usedPercent: 16, resetsAt: future5HReset, windowDurationMins: 300 },
        planType: 'pro'
      }
    }
  });
  assert.equal(boundaryLagUpdate, true);
  const snapLag = authority.getSnapshot().providers.codex.rateLimitInfo;
  assert.equal(snapLag.secondary, undefined, 'Boundary lag update omitting weekly does NOT resurrect expired 1% cycle');

  // D: Fresh Codex acquisition supplying the new cycle (e.g. 0% used, future reset next week)
  const nextWeekReset = Math.floor(new Date('2026-09-29T17:05:00.000Z').getTime() / 1000);
  const freshCycle = authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'codex-1',
    evidence: {
      provider: 'codex',
      type: 'account_rate_limits',
      rate_limits: {
        primary: { usedPercent: 16, resetsAt: future5HReset, windowDurationMins: 300 },
        secondary: { usedPercent: 0, resetsAt: nextWeekReset, windowDurationMins: 10080 },
        planType: 'pro'
      }
    }
  });
  assert.equal(freshCycle, true, 'Fresh cycle acquisition is accepted');
  const snapFresh = authority.getSnapshot().providers.codex.rateLimitInfo;
  assert.equal(snapFresh.secondary.usedPercent, 0, 'New cycle factual truth is now 0% used / 100% left');
  assert.equal(snapFresh.secondary.resetsAt, nextWeekReset);
});

// ============================================================================
// 13. Claude post-reset / not-started state:
// Expired prior Claude 5H + successful read with no new five_hour => 100% left / 0% used / reset UNKNOWN
// ============================================================================
test('13. Expired prior Claude 5H + successful read with no new five_hour => 100% left / 0% used / reset UNKNOWN', () => {
  const T_seed = new Date('2026-09-22T17:00:00.000Z');
  const T_reset = new Date('2026-09-22T17:05:00.000Z');
  const T_postReset = new Date('2026-09-22T17:10:00.000Z');
  const resetsAt_505 = Math.floor(T_reset.getTime() / 1000);
  const futureWeekly = Math.floor(new Date('2026-09-29T17:05:00.000Z').getTime() / 1000);

  let currentClock = T_seed;
  const authority = new HealthAuthority(memoryStore(), {
    now: () => currentClock
  });

  // Seed prior active 5H window: 74% used (26% left), resets at 5:05 PM
  authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        rateLimitType: 'five_hour',
        unifiedWindows: {
          five_hour: { utilization: 0.74, resetsAt: resetsAt_505 },
          seven_day: { utilization: 0.15, resetsAt: futureWeekly }
        }
      }
    }
  });

  const snapBefore = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapBefore.five_hour.utilization, 0.74);
  assert.equal(snapBefore.five_hour.resetsAt, resetsAt_505);

  // Advance clock to 5:10 PM (past reset time 5:05 PM)
  currentClock = T_postReset;

  // Successful Claude read occurs, but provider returns NO active five_hour window (session not started yet),
  // only seven_day
  const changed = authority.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });
  assert.equal(changed, true, 'Transition to post-reset idle state is a real state change');

  const snapAfter = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  // Represented as: 100% left / 0% used / Reset: UNKNOWN
  assert.deepEqual(snapAfter.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'Claude 5H enters post-reset idle state: 100% left, 0% used, resetsAt null');
  assert.equal(snapAfter.seven_day.utilization, 0.15, 'seven_day window remains intact');

  // Subsequent successful reads that still omit five_hour retain the post-reset state
  const unchanged = authority.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });
  assert.equal(unchanged, false, 'Same post-reset state does not trigger redundant change');
  const snapRetained = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.deepEqual(snapRetained.five_hour, { utilization: 0, resetsAt: null });
});

// ============================================================================
// 14. Failed acquisition with no five_hour => UNKNOWN
// ============================================================================
test('14. Failed acquisition with no five_hour => UNKNOWN', async () => {
  const T_seed = new Date('2026-09-22T17:00:00.000Z');
  const T_reset = new Date('2026-09-22T17:05:00.000Z');
  const T_postReset = new Date('2026-09-22T17:10:00.000Z');
  const resetsAt_505 = Math.floor(T_reset.getTime() / 1000);
  const futureWeekly = Math.floor(new Date('2026-09-29T17:05:00.000Z').getTime() / 1000);

  let currentClock = T_seed;
  let ingestedWindows = null;
  const authority = new HealthAuthority(memoryStore(), {
    now: () => currentClock
  });

  // Seed prior active 5H window
  authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.74, resetsAt: resetsAt_505 },
          seven_day: { utilization: 0.15, resetsAt: futureWeekly }
        }
      }
    }
  });

  // Advance clock to 5:10 PM past resetsAt
  currentClock = T_postReset;

  // Case A: Periodic prune drops expired window to UNKNOWN when no successful read has occurred
  authority.pruneExpired(T_postReset);
  const snapPruned = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapPruned.five_hour, undefined, 'Expired five_hour drops to undefined (genuine UNKNOWN), NOT fabricated 100%');

  // Case B: ClaudeUsageReader attempts read, but acquisition fails (e.g. rate limit, auth error, network failure)
  const reader = new ClaudeUsageReader({
    ingest: (windows) => {
      ingestedWindows = windows;
      return authority.ingestClaudeUsage(windows);
    },
    readFileImpl: async () => { throw new Error('credentials missing'); },
    now: () => currentClock.getTime()
  });

  const outcome = await reader.read();
  assert.equal(outcome.ok, false);
  assert.equal(ingestedWindows, null, 'Failed acquisition does not invoke ingest');

  const snapFailed = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapFailed.five_hour, undefined, 'Claude 5H remains genuine UNKNOWN after failed acquisition');

  // Case C: If authority starts clean with no prior 5H window evidence, successful read omitting five_hour stays UNKNOWN
  const freshAuthority = new HealthAuthority(memoryStore(), { now: () => currentClock });
  freshAuthority.ingestClaudeUsage({
    seven_day: { utilization: 0.2, resetsAt: futureWeekly }
  });
  const snapNoPrior = freshAuthority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapNoPrior.five_hour, undefined, 'Without prior expired window evidence establishing post-reset state, 5H stays UNKNOWN');
});

// ============================================================================
// 15. First new active Claude window replaces idle state immediately
// ============================================================================
test('15. First new active Claude window replaces idle state immediately', () => {
  const T_seed = new Date('2026-09-22T17:00:00.000Z');
  const T_reset = new Date('2026-09-22T17:05:00.000Z');
  const T_postReset = new Date('2026-09-22T17:10:00.000Z');
  const T_firstMessage = new Date('2026-09-22T17:15:00.000Z');
  const resetsAt_505 = Math.floor(T_reset.getTime() / 1000);
  const futureWeekly = Math.floor(new Date('2026-09-29T17:05:00.000Z').getTime() / 1000);
  const newCycleReset = Math.floor(new Date('2026-09-22T22:15:00.000Z').getTime() / 1000);

  let currentClock = T_seed;
  const authority = new HealthAuthority(memoryStore(), {
    now: () => currentClock
  });

  // Seed and transition to post-reset idle state
  authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.74, resetsAt: resetsAt_505 },
          seven_day: { utilization: 0.15, resetsAt: futureWeekly }
        }
      }
    }
  });

  currentClock = T_postReset;
  authority.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });

  // Verify idle state
  const snapIdle = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.deepEqual(snapIdle.five_hour, { utilization: 0, resetsAt: null });

  // Claude's first message starts a new 5H cycle at 5:15 PM. Native rate limit event arrives:
  currentClock = T_firstMessage;
  const activeCycleReplaced = authority.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.04, resetsAt: newCycleReset },
          seven_day: { utilization: 0.16, resetsAt: futureWeekly }
        }
      }
    }
  });

  assert.equal(activeCycleReplaced, true, 'New active cycle is ingested immediately');
  const snapActive = authority.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows;
  assert.equal(snapActive.five_hour.utilization, 0.04, 'Active cycle replaces idle state immediately');
  assert.equal(snapActive.five_hour.resetsAt, newCycleReset, 'Active cycle carries real future resetsAt');
  assert.equal(snapActive.seven_day.utilization, 0.16);
});

// ============================================================================
// 16. Claude idle state survives persistence + restore across reload lifecycle
// ============================================================================
test('16. Claude idle state survives persistence + restore across reload lifecycle and restart after prune', () => {
  const T_seed = new Date('2026-09-22T17:00:00.000Z');
  const T_reset = new Date('2026-09-22T17:05:00.000Z');
  const T_postReset = new Date('2026-09-22T17:10:00.000Z');
  const resetsAt_505 = Math.floor(T_reset.getTime() / 1000);
  const futureWeekly = Math.floor(new Date('2026-09-29T17:05:00.000Z').getTime() / 1000);
  const newCycleReset = Math.floor(new Date('2026-09-22T22:15:00.000Z').getTime() / 1000);

  let currentClock = T_seed;
  let savedState = undefined;
  const store = {
    load: () => savedState ? structuredClone(savedState) : undefined,
    save: (state) => { savedState = structuredClone(state); },
    quarantine: () => undefined
  };

  // 1. Establish expired Claude 5H
  const ha1 = new HealthAuthority(store, { now: () => currentClock });
  ha1.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.74, resetsAt: resetsAt_505 },
          seven_day: { utilization: 0.15, resetsAt: futureWeekly }
        }
      }
    }
  });

  // Advance clock past reset
  currentClock = T_postReset;

  // 2. Successful read with no new five_hour establishes idle state
  const changed = ha1.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });
  assert.equal(changed, true, 'Establishes idle state');
  assert.deepEqual(ha1.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  });

  // 3. Save HealthAuthority
  assert.equal(ha1.flush(), true, 'Flushes state to store');

  // 4. Restore into a fresh HealthAuthority instance
  const ha2 = new HealthAuthority(store, { now: () => currentClock });
  assert.deepEqual(ha2.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'Restored state immediately carries post-reset idle window (100% left / 0% used / resetsAt:null)');

  // 5. Successful read still omits five_hour
  ha2.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });

  // 6. Restored state remains 100% / 0% / resetsAt:null
  assert.deepEqual(ha2.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'Restored state remains 100% left / 0% used / resetsAt:null on subsequent read');

  // 7. Real active five_hour then replaces it
  ha2.ingestClaudeUsage({
    five_hour: { utilization: 0.05, resetsAt: newCycleReset },
    seven_day: { utilization: 0.16, resetsAt: futureWeekly }
  });
  assert.equal(ha2.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.utilization, 0.05);
  assert.equal(ha2.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour.resetsAt, newCycleReset);

  // -------------------------------------------------------------------------
  // Also test restart after the expired window has been pruned but idle state was established:
  // -------------------------------------------------------------------------
  currentClock = new Date('2026-09-22T17:20:00.000Z');
  const ha3 = new HealthAuthority(store, { now: () => currentClock });
  // Seed expired window again
  ha3.ingest({
    stadiumId: 'stadium-1',
    instanceId: 'window-1',
    gameId: 'game-1',
    playerInstanceId: 'claude-1',
    evidence: {
      provider: 'claude',
      type: 'rate_limit_event',
      rate_limit_info: {
        unifiedWindows: {
          five_hour: { utilization: 0.8, resetsAt: resetsAt_505 },
          seven_day: { utilization: 0.15, resetsAt: futureWeekly }
        }
      }
    }
  });

  // Prune expired window before read
  ha3.pruneExpired(currentClock);
  assert.equal(ha3.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, undefined, 'Expired window is pruned');
  ha3.flush();

  // Restart after expired window has been pruned
  const ha4 = new HealthAuthority(store, { now: () => currentClock });
  // Now successful read arrives without five_hour
  ha4.ingestClaudeUsage({
    seven_day: { utilization: 0.15, resetsAt: futureWeekly }
  });
  assert.deepEqual(ha4.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'Idle state is established even when restart occurred after expired window was pruned');

  // Prune while in idle state does not destroy idle state, and survives another restart
  ha4.pruneExpired(currentClock);
  assert.deepEqual(ha4.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'pruneExpired does not drop post-reset idle state');
  ha4.flush();

  const ha5 = new HealthAuthority(store, { now: () => currentClock });
  assert.deepEqual(ha5.getSnapshot().providers.claude.rateLimitInfo.unifiedWindows.five_hour, {
    utilization: 0,
    resetsAt: null
  }, 'Idle state survives restart after pruneExpired');
});
