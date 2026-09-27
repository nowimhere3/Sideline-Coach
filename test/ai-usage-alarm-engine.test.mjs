import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlarmEngine } from '../out/control-plane/alarm-engine.js';
import { fileAlarmStateStore } from '../out/control-plane/alarm-state-store.js';
import { DEFAULT_ALARM_PREFERENCES, DEFAULT_PREFERENCES, isAlarmPreferences, loadPreferences, normalizeAlarmPreferences, savePreferences } from '../out/running-players.js';

const iso = (ms) => new Date(ms).toISOString();
const emptyHealth = () => ({ schemaVersion: 1, providers: {} });
const claudeHealth = ({ now, remaining5h, remainingWeekly = 80, reset5h, resetWeekly }) => ({
  schemaVersion: 1,
  updatedAt: iso(now),
  providers: {
    claude: {
      provider: 'claude', evidenceType: 'oauth_usage', observedAt: iso(now),
      source: { stadiumId: 'control-plane', instanceId: 'reader', gameId: 'control-plane', playerInstanceId: 'reader' },
      rateLimitInfo: { unifiedWindows: {
        five_hour: { utilization: (100 - remaining5h) / 100, resetsAt: reset5h },
        seven_day: { utilization: (100 - remainingWeekly) / 100, resetsAt: resetWeekly ?? reset5h + 604800 }
      } }
    }
  }
});
const codexHealth = ({ now, remaining5h, remainingWeekly = 80, reset5h }) => ({
  schemaVersion: 1,
  updatedAt: iso(now),
  providers: {
    codex: {
      provider: 'codex', evidenceType: 'account_rate_limits', observedAt: iso(now),
      source: { stadiumId: 'control-plane', instanceId: 'reader', gameId: 'control-plane', playerInstanceId: 'reader' },
      rateLimitInfo: {
        primary: { usedPercent: 100 - remaining5h, resetsAt: reset5h, windowDurationMins: 300 },
        secondary: { usedPercent: 100 - remainingWeekly, resetsAt: reset5h + 604800, windowDurationMins: 10080 }
      }
    }
  }
});

function memoryStore(seed = { schemaVersion: 1, rules: {} }) {
  let state = structuredClone(seed);
  return {
    load: () => structuredClone(state),
    save: (next) => { state = structuredClone(next); },
    read: () => structuredClone(state)
  };
}

function rig(startMs = Date.parse('2026-09-25T16:00:00.000Z'), store = memoryStore(), preferences = DEFAULT_ALARM_PREFERENCES) {
  let nowMs = startMs;
  const delivered = [];
  const timer = { unref() {} };
  let scheduled;
  const engine = new AlarmEngine(store, {
    preferences: () => preferences,
    now: () => new Date(nowMs),
    onEvent: (event) => delivered.push(event),
    setTimer: (callback) => { scheduled = callback; return timer; },
    clearTimer: () => { scheduled = undefined; }
  });
  return {
    engine, store, delivered, now: () => nowMs, setNow: (value) => { nowMs = value; },
    tick: () => { const callback = scheduled; scheduled = undefined; callback?.(); }
  };
}

test('Stage 1A alarm preferences use reconciled defaults and round-trip durably', () => {
  assert.deepEqual(DEFAULT_ALARM_PREFERENCES.thresholds, {
    claude: { fiveHourLowPercent: 20, fiveHourCriticalPercent: 5, weeklyLowPercent: 15, weeklyCriticalPercent: 5 },
    codex: { fiveHourLowPercent: 20, fiveHourCriticalPercent: 5, weeklyLowPercent: 20, weeklyCriticalPercent: 5 }
  });
  assert.equal(DEFAULT_ALARM_PREFERENCES.maxStaleAgeMinutes, 30);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-alarm-prefs-'));
  try {
    const file = path.join(dir, 'preferences.json');
    const alarms = { ...DEFAULT_ALARM_PREFERENCES, thresholds: {
      ...DEFAULT_ALARM_PREFERENCES.thresholds,
      claude: { ...DEFAULT_ALARM_PREFERENCES.thresholds.claude, fiveHourLowPercent: 18, weeklyLowPercent: 14 }
    } };
    savePreferences(file, { ...DEFAULT_PREFERENCES, alarms });
    assert.deepEqual(loadPreferences(file).alarms, alarms);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Stage 1B migrates the Stage 1A shared CRITICAL value and keeps validation canonical', () => {
  const legacy = {
    enabled: true, notifyOnThreshold: true, notifyOnReset: true,
    channels: { vscode: true, browser: false },
    thresholds: {
      claude: { fiveHourLowPercent: 20, weeklyLowPercent: 15 },
      codex: { fiveHourLowPercent: 20, weeklyLowPercent: 20 },
      criticalPercent: 5
    },
    maxStaleAgeMinutes: 30
  };
  const migrated = normalizeAlarmPreferences(legacy);
  assert.equal(migrated.thresholds.claude.fiveHourCriticalPercent, 5);
  assert.equal(migrated.thresholds.claude.weeklyCriticalPercent, 5);
  assert.equal(migrated.thresholds.codex.fiveHourCriticalPercent, 5);
  assert.equal(migrated.thresholds.codex.weeklyCriticalPercent, 5);
  assert.equal(isAlarmPreferences({
    ...migrated,
    thresholds: { ...migrated.thresholds, claude: { ...migrated.thresholds.claude, fiveHourCriticalPercent: 21 } }
  }), false, 'CRITICAL above its paired LOW is rejected by the canonical validator');
});

test('AT-1/2/3 threshold entry emits once, does not spam, and critical escalation emits once', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 7200;
  h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 22, reset5h: reset }));
  const entered = h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 19, reset5h: reset }));
  assert.deepEqual(entered.map((event) => event.type), ['alarm:threshold_entered']);
  assert.equal(entered[0].message, 'Claude 5H quota low · 19% remaining · resets in 2h');
  for (const remaining5h of [18, 17]) {
    assert.equal(h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h, reset5h: reset })).length, 0);
  }
  const critical = h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 4, reset5h: reset }));
  assert.deepEqual(critical.map((event) => event.type), ['alarm:threshold_escalated']);
  assert.equal(critical[0].configuredThresholdPercent, 5);
});

test('Codex native primary/secondary windows use the same canonical threshold machine', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 7200;
  h.engine.evaluateTelemetry(codexHealth({ now: h.now(), remaining5h: 22, reset5h: reset }));
  const events = h.engine.evaluateTelemetry(codexHealth({ now: h.now(), remaining5h: 19, reset5h: reset }));
  assert.equal(events.length, 1);
  assert.equal(events[0].provider, 'codex');
  assert.equal(events[0].window, 'five_hour');
  assert.equal(events[0].message, 'Codex 5H quota low · 19% remaining · resets in 2h');
});

test('Stage 1B per-window CRITICAL preference is the AlarmEngine threshold authority', () => {
  const preferences = {
    ...DEFAULT_ALARM_PREFERENCES,
    thresholds: {
      ...DEFAULT_ALARM_PREFERENCES.thresholds,
      claude: { ...DEFAULT_ALARM_PREFERENCES.thresholds.claude, weeklyLowPercent: 19, weeklyCriticalPercent: 8 }
    }
  };
  const h = rig(Date.parse('2026-09-25T16:00:00.000Z'), memoryStore(), preferences);
  const reset = Math.floor(h.now() / 1000) + 7200;
  h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 80, remainingWeekly: 20, reset5h: reset }));
  const events = h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 80, remainingWeekly: 7, reset5h: reset }));
  assert.equal(events.length, 1);
  assert.equal(events[0].window, 'weekly');
  assert.equal(events[0].type, 'alarm:threshold_escalated');
  assert.equal(events[0].configuredThresholdPercent, 8);
});

test('2% exit hysteresis prevents jitter and recovery is an event, not a persistent state', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 7200;
  h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 19, reset5h: reset }));
  assert.equal(h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 21, reset5h: reset })).length, 0);
  assert.equal(h.engine.getState().rules['claude:five_hour'].state, 'LOW');
  const recovered = h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 23, reset5h: reset }));
  assert.deepEqual(recovered.map((event) => event.type), ['alarm:recovered']);
  assert.equal(h.engine.getState().rules['claude:five_hour'].state, 'NORMAL');
});

test('AT-4 absolute reset fires without new telemetry and returns alarm state to NORMAL', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 5;
  h.engine.start(claudeHealth({ now: h.now(), remaining5h: 19, reset5h: reset }));
  h.setNow(h.now() + 5_100);
  const events = h.engine.reconcileClockHorizons();
  assert.deepEqual(events.filter((event) => event.window === 'five_hour').map((event) => event.type), ['alarm:reset_boundary_reached']);
  assert.equal(h.engine.getState().rules['claude:five_hour'].state, 'NORMAL');
  assert.equal(h.engine.reconcileClockHorizons().length, 0, 'same reset cycle is deduped');
  h.engine.stop();
});

test('AT-5 first startup reconciliation processes a reset crossed during sleep/offline exactly once', () => {
  const now = Date.parse('2026-09-25T16:00:00.000Z');
  const past = Math.floor(now / 1000) - 30;
  const store = memoryStore({ schemaVersion: 1, rules: {
    'claude:five_hour': { state: 'LOW', enteredAt: iso(now - 3600000), horizonResetsAt: past }
  } });
  const h = rig(now, store);
  const events = h.engine.start(emptyHealth());
  assert.equal(events.filter((event) => event.type === 'alarm:reset_boundary_reached').length, 1);
  assert.equal(store.read().rules['claude:five_hour'].lastProcessedResetCycle, past);
  h.engine.stop();
});

test('AT-6 persisted LOW restores without replaying threshold entry and stores no telemetry percentage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-alarm-'));
  try {
    const file = path.join(dir, 'alarm-state.json');
    const now = Date.parse('2026-09-25T16:00:00.000Z');
    const reset = Math.floor(now / 1000) + 7200;
    const first = rig(now, fileAlarmStateStore(file));
    first.engine.evaluateTelemetry(claudeHealth({ now, remaining5h: 19, reset5h: reset }));
    const second = rig(now, fileAlarmStateStore(file));
    const startup = second.engine.start(claudeHealth({ now, remaining5h: 19, reset5h: reset }));
    assert.equal(startup.some((event) => event.type === 'alarm:threshold_entered'), false);
    assert.equal(second.engine.getState().rules['claude:five_hour'].state, 'LOW');
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /remaining|utilization|usedPercent/);
    second.engine.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('AT-7 late telemetry for a clock-processed reset cycle cannot fire a second reset', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 5;
  h.engine.start(claudeHealth({ now: h.now(), remaining5h: 19, reset5h: reset }));
  h.setNow(h.now() + 5_100);
  assert.equal(h.engine.reconcileClockHorizons().filter((event) => event.window === 'five_hour').length, 1);
  const late = h.engine.evaluateTelemetry(claudeHealth({ now: h.now(), remaining5h: 19, reset5h: reset + 12 }));
  assert.equal(late.some((event) => event.type === 'alarm:reset_boundary_reached'), false);
  assert.equal(h.engine.getState().rules['claude:five_hour'].state, 'NORMAL');
  h.engine.stop();
});

test('AT-8 periodic reconciliation turns stale evidence UNKNOWN without new telemetry', () => {
  const h = rig();
  const reset = Math.floor(h.now() / 1000) + 7200;
  h.engine.start(claudeHealth({ now: h.now(), remaining5h: 80, reset5h: reset }));
  h.setNow(h.now() + 31 * 60_000);
  h.tick();
  assert.deepEqual(h.delivered.filter((event) => event.window === 'five_hour').map((event) => event.type), ['alarm:stale']);
  assert.equal(h.engine.getState().rules['claude:five_hour'].state, 'UNKNOWN');
  h.engine.stop();
});
