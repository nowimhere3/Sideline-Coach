import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  estimatePoolEconomicCost,
  projectRoutingEconomics,
  resourcePoolForSeat,
  RoutingEconomicsReader
} from '../out/control-plane/routing-economics.js';
import { projectProviderResourcePolicy } from '../out/control-plane/resource-policy.js';
import { DEFAULT_ALARM_PREFERENCES } from '../out/running-players.js';

const NOW = Date.parse('2026-09-26T16:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW / 1000);
const observedAt = new Date(NOW).toISOString();
const source = { stadiumId: 'control-plane', instanceId: 'reader', gameId: 'control-plane', playerInstanceId: 'reader' };
const alarmRule = (state, horizonResetsAt) => ({ state, enteredAt: observedAt, horizonResetsAt });

function workedHealth() {
  return {
    schemaVersion: 1,
    updatedAt: observedAt,
    providers: {
      codex: {
        provider: 'codex', evidenceType: 'account_rate_limits', observedAt, source,
        rateLimitInfo: {
          primary: { usedPercent: 5, resetsAt: NOW_SECONDS + 240 * 60, windowDurationMins: 300 },
          secondary: { usedPercent: 85, resetsAt: NOW_SECONDS + 4 * 24 * 60 * 60, windowDurationMins: 10_080 }
        }
      },
      claude: {
        provider: 'claude', evidenceType: 'oauth_usage', observedAt, source,
        rateLimitInfo: { unifiedWindows: {
          five_hour: { utilization: 0.75, resetsAt: NOW_SECONDS + 10 * 60 },
          seven_day: { utilization: 0.4, resetsAt: NOW_SECONDS + 2 * 24 * 60 * 60 }
        } }
      }
    }
  };
}

function workedAlarmState() {
  return {
    schemaVersion: 1,
    rules: {
      'codex:five_hour': alarmRule('NORMAL', NOW_SECONDS + 240 * 60),
      'codex:weekly': alarmRule('LOW', NOW_SECONDS + 4 * 24 * 60 * 60),
      'claude:five_hour': alarmRule('NORMAL', NOW_SECONDS + 10 * 60),
      'claude:weekly': alarmRule('NORMAL', NOW_SECONDS + 2 * 24 * 60 * 60)
    }
  };
}

const closeTo = (actual, expected, tolerance = 0.005) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

test('R1-1. S57.1 §11.3 economics makes Claude B less than half the cost of Codex A', () => {
  const alarmState = workedAlarmState();
  const economics = projectRoutingEconomics(workedHealth(), alarmState, DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  const codex = economics.pools.codex;
  const claude = economics.pools.claude;
  const [codex5h, codexWeekly] = codex.windows;
  const [claude5h, claudeWeekly] = claude.windows;

  assert.equal(codex5h.lengthMin, 300);
  assert.equal(codexWeekly.lengthMin, 10_080);
  closeTo(codex5h.pacePressure, 0.84);
  closeTo(codexWeekly.pacePressure, 3.81);
  assert.equal(codexWeekly.floor, 1.5);
  assert.ok(codexWeekly.price > codexWeekly.floor, 'LOW floor does not lower an already-higher pace price');

  closeTo(claude5h.pacePressure, 0.13);
  closeTo(claudeWeekly.pacePressure, 0.48);

  const burns = [{ window: 'five_hour', fraction: 0.12 }, { window: 'weekly', fraction: 0.03 }];
  const costA = estimatePoolEconomicCost(codex, burns, 30);
  const costB = estimatePoolEconomicCost(claude, burns, 30);
  assert.notEqual(costA, 'unknown');
  assert.notEqual(costB, 'unknown');
  closeTo(costA, 0.215, 0.002);
  closeTo(costB, 0.099, 0.002);
  assert.ok(costB < costA / 2, 'B is less than half A despite only 25% remaining on B 5H');
});

test('R1-2/3. missing and canonically stale facts preserve UNKNOWN with the AlarmEngine max-stale rule', () => {
  const missing = projectRoutingEconomics({ schemaVersion: 1, providers: {} }, { schemaVersion: 1, rules: {} }, DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  for (const pool of Object.values(missing.pools)) {
    assert.equal(pool.evidence, 'unknown');
    assert.equal(pool.policy.evidenceState, 'unknown');
    for (const window of pool.windows) {
      assert.equal(window.price, 'unknown');
      assert.equal(window.remainingFraction, undefined);
      assert.equal(window.resetsAt, undefined);
      assert.equal(window.stale, true);
    }
  }

  const staleHealth = workedHealth();
  staleHealth.providers.claude.observedAt = new Date(NOW - 31 * 60_000).toISOString();
  const stale = projectRoutingEconomics(staleHealth, workedAlarmState(), { maxStaleAgeMinutes: 30 }, new Date(NOW));
  assert.equal(stale.pools.claude.evidence, 'unknown');
  assert.equal(stale.pools.claude.windows[0].price, 'unknown');
  assert.equal(stale.pools.claude.windows[0].stale, true);
  assert.equal(stale.pools.claude.windows[0].policyLag, true);

  const justFreshHealth = workedHealth();
  justFreshHealth.providers.claude.observedAt = new Date(NOW - 30 * 60_000).toISOString();
  const justFresh = projectRoutingEconomics(justFreshHealth, workedAlarmState(), { maxStaleAgeMinutes: 30 }, new Date(NOW));
  assert.notEqual(justFresh.pools.claude.windows[0].price, 'unknown');
});

test('R1-4. ResourcePoolId/window identities are open strings and lengths are descriptor data', () => {
  const sourceText = fs.readFileSync(new URL('../src/control-plane/routing-economics.ts', import.meta.url), 'utf8');
  assert.match(sourceText, /export type ResourcePoolId = string/);
  assert.match(sourceText, /readonly id: string/);
  assert.match(sourceText, /readonly lengthMin: number/);
  assert.doesNotMatch(sourceText, /Record<AlarmProvider, RoutingEconomicsPool>/);
  assert.doesNotMatch(sourceText, /window === 'five_hour'\s*\?\s*300/);
});

test('R1-5. resource pool belongs to the direct seat authority, never the model name', () => {
  const capability = (playerType, provider, model = 'provider-default', transport = 'controlled') => ({
    instanceId: `${playerType}-1`, playerType, transport, fieldLabel: playerType, state: 'ready', activeModel: model,
    capability: { provider, authenticated: true, models: [], observedAt: NOW, freshness: 'live' }
  });
  assert.equal(resourcePoolForSeat(capability('claude', 'claude')), 'claude');
  assert.equal(resourcePoolForSeat(capability('codex', 'codex', 'gpt-6', 'legacy')), 'codex');
  assert.equal(resourcePoolForSeat(capability('antigravity', 'agy', 'claude-opus-5.5')), 'unknown');
  assert.equal(resourcePoolForSeat(capability('antigravity', 'claude', 'claude-opus-5.5')), 'unknown', 'model/provider branding cannot override the Player ecosystem');
  assert.equal(resourcePoolForSeat(capability('terminal', 'claude', 'claude-opus-5.5', 'legacy')), 'unknown');
});

test('R1-6. projection and reader are deterministic for identical inputs and injected time', () => {
  const health = workedHealth();
  const alarmState = workedAlarmState();
  const first = projectRoutingEconomics(health, alarmState, DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  const second = projectRoutingEconomics(structuredClone(health), structuredClone(alarmState), DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  assert.deepEqual(first, second);

  const reader = new RoutingEconomicsReader({
    health: () => structuredClone(health), alarmState: () => structuredClone(alarmState),
    preferences: () => DEFAULT_ALARM_PREFERENCES, now: () => new Date(NOW)
  });
  assert.deepEqual(reader.read(), first);
  assert.deepEqual(reader.read(), first);
});

test('R1-7. Stage 2A policy is carried verbatim and threshold verdicts are not recomputed', () => {
  const alarmState = workedAlarmState();
  const economics = projectRoutingEconomics(workedHealth(), alarmState, DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  assert.deepEqual(economics.pools.codex.policy, projectProviderResourcePolicy(alarmState, 'codex'));
  assert.deepEqual(economics.pools.claude.policy, projectProviderResourcePolicy(alarmState, 'claude'));
  const laggingHealth = workedHealth();
  laggingHealth.providers.codex.rateLimitInfo.secondary.resetsAt += 60;
  const lagging = projectRoutingEconomics(laggingHealth, alarmState, DEFAULT_ALARM_PREFERENCES, new Date(NOW));
  assert.equal(lagging.pools.codex.windows[1].policyLag, true, 'canonical fact/policy cycle skew is surfaced while the policy verdict still wins');
  assert.equal(lagging.pools.codex.windows[1].floor, 1.5);
  const sourceText = fs.readFileSync(new URL('../src/control-plane/routing-economics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceText, /fiveHourLowPercent|weeklyLowPercent|fiveHourCriticalPercent|weeklyCriticalPercent|evaluateAlarmState/);
});

test('R1-8. daemon constructs the reader and only R2 Film—not routing—consumes its projection', () => {
  const daemon = fs.readFileSync(new URL('../src/control-plane/daemon.ts', import.meta.url), 'utf8');
  const router = fs.readFileSync(new URL('../src/control-plane/router.ts', import.meta.url), 'utf8');
  const routingPolicy = fs.readFileSync(new URL('../src/routing-policy.ts', import.meta.url), 'utf8');
  assert.match(daemon, /this\.routingEconomics = new RoutingEconomicsReader\(/);
  assert.match(daemon, /get routingEconomicsReaderInstance\(\): RoutingEconomicsReader/);
  assert.doesNotMatch(router, /routing-economics|RoutingEconomics/);
  assert.doesNotMatch(routingPolicy, /routing-economics|RoutingEconomics/);
  assert.equal((daemon.match(/this\.routingEconomics\.read\(\)/g) || []).length, 1, 'R2 has one bounded receipt-capture read');
  assert.match(daemon, /captureRoutingFilmReceipt[\s\S]*?this\.routingEconomics\.read\(\)/);
});

test('R1-9. R1 is read-only and defines no Routing Film persistence schema', () => {
  const sourceText = fs.readFileSync(new URL('../src/control-plane/routing-economics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceText, /node:fs|writeFile|appendFile|routing-film|jsonl/i);
  assert.match(sourceText, /readonly pool: ResourcePoolId/);
  assert.match(sourceText, /readonly id: string/);
  assert.match(sourceText, /readonly lengthMin: number/);
});
