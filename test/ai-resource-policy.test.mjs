import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AlarmEngine } from '../out/control-plane/alarm-engine.js';
import { projectProviderResourcePolicy, ResourcePolicyService } from '../out/control-plane/resource-policy.js';
import { DEFAULT_ALARM_PREFERENCES } from '../out/running-players.js';

const enteredAt = '2026-09-25T16:00:00.000Z';
const rule = (state, horizonResetsAt) => ({ state, enteredAt, ...(horizonResetsAt ? { horizonResetsAt } : {}) });
const snapshot = (rules) => ({ schemaVersion: 1, rules });
const providerRules = (provider, fiveHour, weekly) => ({
  [`${provider}:five_hour`]: fiveHour,
  [`${provider}:weekly`]: weekly
});

test('RP-1/2/3/5. NORMAL is abundant, while LOW and CRITICAL project canonical scarcity', () => {
  const normal = projectProviderResourcePolicy(snapshot(providerRules('claude', rule('NORMAL'), rule('NORMAL'))), 'claude');
  assert.deepEqual(normal, {
    provider: 'claude', isConserveActive: false, conserveLevel: 'none', evidenceState: 'known',
    rationale: 'Claude 5H and Weekly are NORMAL.', activeResetsAt: null
  });

  const low = projectProviderResourcePolicy(snapshot(providerRules('claude', rule('LOW', 1_800_007_200), rule('NORMAL'))), 'claude');
  assert.equal(low.isConserveActive, true);
  assert.equal(low.conserveLevel, 'low');
  assert.equal(low.activeResetsAt, 1_800_007_200);
  assert.match(low.rationale, /^Claude 5H is LOW at Dad's configured threshold; resets at /);

  const critical = projectProviderResourcePolicy(snapshot(providerRules('claude', rule('NORMAL'), rule('CRITICAL', 1_800_600_000))), 'claude');
  assert.equal(critical.conserveLevel, 'critical');
  assert.equal(critical.activeResetsAt, 1_800_600_000);
});

test('RP-4/10/11. CRITICAL outranks LOW and tied strongest windows select the earliest canonical reset', () => {
  const mixed = projectProviderResourcePolicy(snapshot(providerRules('codex', rule('LOW', 1_800_001_000), rule('CRITICAL', 1_800_900_000))), 'codex');
  assert.equal(mixed.conserveLevel, 'critical');
  assert.equal(mixed.activeResetsAt, 1_800_900_000, 'only the strongest-state window contributes its reset');

  const tied = projectProviderResourcePolicy(snapshot(providerRules('codex', rule('CRITICAL', 1_800_002_000), rule('CRITICAL', 1_800_001_000))), 'codex');
  assert.equal(tied.activeResetsAt, 1_800_001_000, 'earliest defined reset wins a strongest-state tie');
  assert.match(tied.rationale, /^Codex 5H and Weekly are CRITICAL .*earliest driving reset is /);
});

test('RP-6/7. UNKNOWN stays unproven, including beside authoritative known scarcity', () => {
  const unknown = projectProviderResourcePolicy(snapshot({}), 'claude');
  assert.equal(unknown.conserveLevel, 'none');
  assert.equal(unknown.evidenceState, 'unknown');
  assert.equal(unknown.rationale, 'Claude usage evidence is currently UNKNOWN.');

  const partial = projectProviderResourcePolicy(snapshot(providerRules('claude', rule('LOW', 1_800_007_200), rule('UNKNOWN'))), 'claude');
  assert.equal(partial.conserveLevel, 'low');
  assert.equal(partial.isConserveActive, true);
  assert.equal(partial.evidenceState, 'unknown');
  assert.match(partial.rationale, /Weekly evidence is UNKNOWN\.$/);
});

test('RP-8. Claude and Codex are independent through the stable query service', () => {
  const state = snapshot({
    ...providerRules('claude', rule('LOW', 1_800_007_200), rule('NORMAL')),
    ...providerRules('codex', rule('NORMAL'), rule('CRITICAL', 1_800_600_000))
  });
  const service = new ResourcePolicyService({ getState: () => structuredClone(state) });
  const all = service.getAll();
  assert.equal(all.claude.conserveLevel, 'low');
  assert.equal(all.codex.conserveLevel, 'critical');
  assert.equal(service.get('claude').provider, 'claude');
});

test('RP-9. Dad-configured AlarmEngine state is consumed without a second threshold evaluator', () => {
  const now = Date.parse(enteredAt);
  const reset = Math.floor(now / 1000) + 7200;
  const health = {
    schemaVersion: 1,
    updatedAt: enteredAt,
    providers: {
      claude: {
        provider: 'claude', evidenceType: 'oauth_usage', observedAt: enteredAt,
        source: { stadiumId: 'control-plane', instanceId: 'reader', gameId: 'control-plane', playerInstanceId: 'reader' },
        rateLimitInfo: { unifiedWindows: {
          five_hour: { utilization: 0.85, resetsAt: reset },
          seven_day: { utilization: 0.1, resetsAt: reset + 604800 }
        } }
      }
    }
  };
  const makeEngine = (fiveHourLowPercent) => {
    let state = snapshot({});
    const store = { load: () => structuredClone(state), save: (next) => { state = structuredClone(next); } };
    const preferences = {
      ...DEFAULT_ALARM_PREFERENCES,
      thresholds: {
        ...DEFAULT_ALARM_PREFERENCES.thresholds,
        claude: { ...DEFAULT_ALARM_PREFERENCES.thresholds.claude, fiveHourLowPercent }
      }
    };
    const engine = new AlarmEngine(store, { preferences: () => preferences, now: () => new Date(now) });
    engine.evaluateTelemetry(health);
    return engine;
  };

  assert.equal(new ResourcePolicyService(makeEngine(20)).get('claude').conserveLevel, 'low');
  assert.equal(new ResourcePolicyService(makeEngine(10)).get('claude').conserveLevel, 'none');
});

test('RP-12/13/19. projection persists no percentages or policy files and routing remains disconnected', () => {
  const policySource = fs.readFileSync(new URL('../src/control-plane/resource-policy.ts', import.meta.url), 'utf8');
  const routingSource = fs.readFileSync(new URL('../src/routing-policy.ts', import.meta.url), 'utf8');
  const daemonSource = fs.readFileSync(new URL('../src/control-plane/daemon.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(policySource, /remainingPercent|usedPercent|utilization|AlarmPreferences|node:fs|writeFile|\.json/);
  assert.doesNotMatch(policySource, /routing-policy|computeAutoRoute/);
  assert.doesNotMatch(routingSource, /resource-policy/);
  assert.doesNotMatch(daemonSource, /resource-policy/);

  const projected = projectProviderResourcePolicy(snapshot(providerRules('codex', rule('LOW', 1_800_007_200), rule('NORMAL'))), 'codex');
  assert.deepEqual(Object.keys(projected).sort(), ['activeResetsAt', 'conserveLevel', 'evidenceState', 'isConserveActive', 'provider', 'rationale'].sort());
});
