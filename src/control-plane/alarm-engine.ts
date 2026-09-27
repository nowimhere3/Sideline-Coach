import * as crypto from 'node:crypto';
import type { AlarmPreferences } from '../running-players';
import type { HealthAuthoritySnapshot, ProviderHealthState } from './health-authority';
import {
  ALARM_STATE_SCHEMA_VERSION,
  type AlarmRuleState,
  type AlarmStateSnapshot,
  type AlarmStateStore,
  type PersistedAlarmRuleState
} from './alarm-state-store';

export type AlarmProvider = 'claude' | 'codex';
export type AlarmWindow = 'five_hour' | 'weekly';
export type AlarmEventType =
  | 'alarm:threshold_entered'
  | 'alarm:threshold_escalated'
  | 'alarm:reset_boundary_reached'
  | 'alarm:recovered'
  | 'alarm:stale';
export type AlarmSeverity = 'info' | 'warning' | 'critical';

export interface AiAlarmEvent {
  readonly id: string;
  readonly type: AlarmEventType;
  readonly provider: AlarmProvider;
  readonly window: AlarmWindow;
  readonly windowLabel: '5H' | 'Weekly';
  readonly previousState: AlarmRuleState;
  readonly currentState: AlarmRuleState;
  readonly severity: AlarmSeverity;
  readonly remainingPercent?: number;
  readonly configuredThresholdPercent?: number;
  readonly resetsAt?: number;
  readonly timestamp: string;
  readonly message: string;
}

export interface NormalizedAlarmFact {
  readonly provider: AlarmProvider;
  readonly window: AlarmWindow;
  readonly observedAt?: string;
  readonly remainingPercent?: number;
  readonly resetsAt?: number;
  readonly stale: boolean;
}

export interface AlarmEngineOptions {
  readonly preferences: () => AlarmPreferences;
  /** Optional live read keeps periodic stale evaluation anchored to HealthAuthority itself. */
  readonly healthSnapshot?: () => HealthAuthoritySnapshot;
  readonly onEvent?: (event: AiAlarmEvent) => void;
  readonly now?: () => Date;
  readonly warn?: (message: string) => void;
  readonly heartbeatMs?: number;
  readonly setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  readonly clearTimer?: (timer: NodeJS.Timeout) => void;
}

const RULES: readonly { provider: AlarmProvider; window: AlarmWindow }[] = [
  { provider: 'claude', window: 'five_hour' },
  { provider: 'claude', window: 'weekly' },
  { provider: 'codex', window: 'five_hour' },
  { provider: 'codex', window: 'weekly' }
];
const EXIT_HYSTERESIS_PERCENT = 2;
const MAX_CLOCK_HEARTBEAT_MS = 60_000;
// HealthAuthority already treats reset jitter within this bound as one provider cycle.
const SAME_RESET_CYCLE_TOLERANCE_SECONDS = 15 * 60;
type MutableRuleState = { -readonly [K in keyof PersistedAlarmRuleState]: PersistedAlarmRuleState[K] };

export class AlarmEngine {
  private state: AlarmStateSnapshot;
  private readonly now: () => Date;
  private readonly warn: (message: string) => void;
  private readonly heartbeatMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearTimer: (timer: NodeJS.Timeout) => void;
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private latestSnapshot: HealthAuthoritySnapshot | undefined;

  constructor(private readonly store: AlarmStateStore, private readonly options: AlarmEngineOptions) {
    this.now = options.now ?? (() => new Date());
    this.warn = options.warn ?? (() => undefined);
    this.heartbeatMs = Math.min(MAX_CLOCK_HEARTBEAT_MS, Math.max(1_000, options.heartbeatMs ?? MAX_CLOCK_HEARTBEAT_MS));
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.state = store.load();
  }

  /** Startup restores horizons, audits missed resets, then adopts current health without replaying old threshold alarms. */
  start(snapshot: HealthAuthoritySnapshot): AiAlarmEvent[] {
    if (this.started) return [];
    this.started = true;
    const resetEvents = this.reconcileClockHorizons(this.now(), false);
    const events = [...resetEvents, ...this.evaluateTelemetry(snapshot, { suppressThresholdEvents: true })];
    this.deliver(resetEvents);
    this.scheduleClockReconciliation();
    return events;
  }

  stop(): void {
    this.started = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  getState(): AlarmStateSnapshot {
    return structuredClone(this.state);
  }

  evaluateTelemetry(
    snapshot: HealthAuthoritySnapshot,
    options: { suppressThresholdEvents?: boolean } = {}
  ): AiAlarmEvent[] {
    this.latestSnapshot = structuredClone(snapshot);
    const now = this.now();
    const preferences = this.options.preferences();
    const events = this.reconcileClockHorizons(now, false);
    let changed = events.length > 0;

    for (const fact of normalizeAlarmFacts(snapshot, now, preferences.maxStaleAgeMinutes)) {
      const key = ruleKey(fact.provider, fact.window);
      const previous = this.state.rules[key];
      const priorState = previous?.state ?? 'UNKNOWN';
      const resetAlreadyProcessed = sameResetCycle(previous?.lastProcessedResetCycle, fact.resetsAt);
      const threshold = lowThreshold(preferences, fact.provider, fact.window);
      const critical = criticalThreshold(preferences, fact.provider, fact.window);
      const currentState = resetAlreadyProcessed
        ? 'NORMAL'
        : evaluateAlarmState(priorState, fact, threshold, critical);
      const nowIso = now.toISOString();
      const next: MutableRuleState = {
        state: currentState,
        enteredAt: previous && currentState === priorState ? previous.enteredAt : nowIso,
        ...(previous?.lastEventType ? { lastEventType: previous.lastEventType } : {}),
        ...(previous?.lastEventId ? { lastEventId: previous.lastEventId } : {}),
        ...(previous?.lastFiredAt ? { lastFiredAt: previous.lastFiredAt } : {}),
        ...(fact.resetsAt !== undefined ? { horizonResetsAt: fact.resetsAt } : previous?.horizonResetsAt !== undefined ? { horizonResetsAt: previous.horizonResetsAt } : {}),
        ...(previous?.lastProcessedResetCycle !== undefined ? { lastProcessedResetCycle: previous.lastProcessedResetCycle } : {})
      };

      const type = transitionEventType(priorState, currentState);
      const mayEmit = preferences.enabled
        && preferences.notifyOnThreshold
        && !options.suppressThresholdEvents
        && Boolean(type)
        && !(type === 'alarm:stale' && !previous);
      if (mayEmit && type) {
        const eventThreshold = type === 'alarm:threshold_escalated' ? critical : threshold;
        const event = createEvent(type, fact, priorState, currentState, eventThreshold, now);
        next.lastEventType = event.type;
        next.lastEventId = event.id;
        next.lastFiredAt = event.timestamp;
        events.push(event);
      }

      if (!sameRule(previous, next)) {
        this.replaceRule(key, next);
        changed = true;
      }
    }

    if (changed) this.persist();
    this.deliver(events);
    this.scheduleClockReconciliation();
    return events;
  }

  /** Public deterministic seam used both by the timer and sleep/wake/restart reconciliation. */
  reconcileClockHorizons(now = this.now(), deliver = true): AiAlarmEvent[] {
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const preferences = this.options.preferences();
    const events: AiAlarmEvent[] = [];
    let changed = false;

    for (const rule of RULES) {
      const key = ruleKey(rule.provider, rule.window);
      const previous = this.state.rules[key];
      const horizon = previous?.horizonResetsAt;
      if (!previous || horizon === undefined || horizon > nowSeconds || sameResetCycle(previous.lastProcessedResetCycle, horizon)) continue;
      const next: MutableRuleState = {
        ...previous,
        state: 'NORMAL',
        enteredAt: now.toISOString(),
        lastProcessedResetCycle: horizon
      };
      if (preferences.enabled && preferences.notifyOnReset) {
        const event = createEvent('alarm:reset_boundary_reached', {
          ...rule,
          resetsAt: horizon
        }, previous.state, 'NORMAL', undefined, now);
        next.lastEventType = event.type;
        next.lastEventId = event.id;
        next.lastFiredAt = event.timestamp;
        events.push(event);
      }
      this.replaceRule(key, next);
      changed = true;
    }

    if (changed) this.persist();
    if (deliver) this.deliver(events);
    this.scheduleClockReconciliation();
    return events;
  }

  private replaceRule(key: string, rule: PersistedAlarmRuleState): void {
    this.state = {
      schemaVersion: ALARM_STATE_SCHEMA_VERSION,
      rules: { ...this.state.rules, [key]: rule }
    };
  }

  private persist(): void {
    try { this.store.save(this.state); }
    catch (error) { this.warn(`AI alarm state could not be saved: ${messageOf(error)}`); }
  }

  private deliver(events: readonly AiAlarmEvent[]): void {
    for (const event of events) {
      try { this.options.onEvent?.(event); }
      catch (error) { this.warn(`AI alarm event delivery failed: ${messageOf(error)}`); }
    }
  }

  private scheduleClockReconciliation(): void {
    if (!this.started) return;
    if (this.timer) this.clearTimer(this.timer);
    const nowMs = this.now().getTime();
    const nearestMs = Object.values(this.state.rules)
      .map((rule) => rule.horizonResetsAt)
      .filter((horizon): horizon is number => horizon !== undefined && horizon * 1000 > nowMs)
      .reduce<number | undefined>((nearest, horizon) => nearest === undefined ? horizon : Math.min(nearest, horizon), undefined);
    const delay = nearestMs === undefined
      ? this.heartbeatMs
      : Math.max(1, Math.min(this.heartbeatMs, nearestMs * 1000 - nowMs));
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      const snapshot = this.options.healthSnapshot?.() ?? this.latestSnapshot;
      if (snapshot) this.evaluateTelemetry(snapshot);
      else this.reconcileClockHorizons();
    }, delay);
    this.timer.unref?.();
  }
}

export function normalizeAlarmFacts(
  snapshot: HealthAuthoritySnapshot,
  now: Date,
  maxStaleAgeMinutes: number
): NormalizedAlarmFact[] {
  return RULES.map(({ provider, window }) => {
    const providerState = snapshot.providers[provider];
    const raw = providerState ? rawWindow(providerState, window) : undefined;
    const observedMs = providerState ? Date.parse(providerState.observedAt) : Number.NaN;
    const stale = !providerState || !Number.isFinite(observedMs) || now.getTime() - observedMs > maxStaleAgeMinutes * 60_000;
    const remainingPercent = raw === undefined ? undefined : remainingFrom(provider, raw);
    const resetsAt = raw === undefined ? undefined : timestampFrom(raw.resetsAt);
    return {
      provider,
      window,
      ...(providerState ? { observedAt: providerState.observedAt } : {}),
      ...(remainingPercent !== undefined ? { remainingPercent } : {}),
      ...(resetsAt !== undefined ? { resetsAt } : {}),
      stale: stale || remainingPercent === undefined
    };
  });
}

export function evaluateAlarmState(
  previous: AlarmRuleState,
  fact: Pick<NormalizedAlarmFact, 'remainingPercent' | 'stale'>,
  lowPercent: number,
  criticalPercent: number
): AlarmRuleState {
  if (fact.stale || fact.remainingPercent === undefined) return 'UNKNOWN';
  const remaining = fact.remainingPercent;
  if (previous === 'CRITICAL' && remaining <= criticalPercent + EXIT_HYSTERESIS_PERCENT) return 'CRITICAL';
  if (remaining <= criticalPercent) return 'CRITICAL';
  if (previous === 'LOW' && remaining <= lowPercent + EXIT_HYSTERESIS_PERCENT) return 'LOW';
  if (remaining <= lowPercent) return 'LOW';
  return 'NORMAL';
}

function rawWindow(provider: ProviderHealthState, window: AlarmWindow): Record<string, unknown> | undefined {
  const info = provider.rateLimitInfo;
  const unified = isObject(info.unifiedWindows) ? info.unifiedWindows : undefined;
  if (provider.provider === 'claude') {
    const value = window === 'five_hour'
      ? (unified?.five_hour ?? info.five_hour ?? (info.rateLimitType === 'five_hour' ? info : undefined))
      : (unified?.seven_day ?? info.seven_day ?? (info.rateLimitType === 'seven_day' ? info : undefined));
    return isObject(value) ? value : undefined;
  }
  const values = [info.primary, info.secondary, unified?.five_hour, unified?.seven_day].filter(isObject);
  return values.find((value) => {
    const duration = value.windowDurationMins;
    const type = value.rateLimitType;
    return window === 'five_hour' ? duration === 300 || type === 'five_hour' : duration === 10080 || type === 'seven_day';
  });
}

function remainingFrom(provider: AlarmProvider, raw: Record<string, unknown>): number | undefined {
  const used = typeof raw.usedPercent === 'number' && Number.isFinite(raw.usedPercent)
    ? raw.usedPercent
    : typeof raw.utilization === 'number' && Number.isFinite(raw.utilization)
      ? raw.utilization * 100
      : undefined;
  if (used === undefined) return undefined;
  return clampPercent(100 - used);
}

function timestampFrom(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value > 1e11 ? value / 1000 : value);
}

function transitionEventType(previous: AlarmRuleState, current: AlarmRuleState): AlarmEventType | undefined {
  if (previous === current) return undefined;
  if (current === 'UNKNOWN') return 'alarm:stale';
  if (current === 'CRITICAL') return 'alarm:threshold_escalated';
  if (current === 'LOW') return previous === 'CRITICAL' ? undefined : 'alarm:threshold_entered';
  if (current === 'NORMAL' && (previous === 'LOW' || previous === 'CRITICAL')) return 'alarm:recovered';
  return undefined;
}

function createEvent(
  type: AlarmEventType,
  fact: Pick<NormalizedAlarmFact, 'provider' | 'window' | 'remainingPercent' | 'resetsAt'>,
  previousState: AlarmRuleState,
  currentState: AlarmRuleState,
  threshold: number | undefined,
  now: Date
): AiAlarmEvent {
  const timestamp = now.toISOString();
  const windowLabel = fact.window === 'five_hour' ? '5H' : 'Weekly';
  const severity: AlarmSeverity = currentState === 'CRITICAL' ? 'critical'
    : type === 'alarm:threshold_entered' || type === 'alarm:stale' ? 'warning' : 'info';
  const event: AiAlarmEvent = {
    id: stableEventId(type, fact.provider, fact.window, fact.resetsAt ?? timestamp),
    type,
    provider: fact.provider,
    window: fact.window,
    windowLabel,
    previousState,
    currentState,
    severity,
    ...(fact.remainingPercent !== undefined ? { remainingPercent: fact.remainingPercent } : {}),
    ...(threshold !== undefined && (type === 'alarm:threshold_entered' || type === 'alarm:threshold_escalated') ? { configuredThresholdPercent: threshold } : {}),
    ...(fact.resetsAt !== undefined ? { resetsAt: fact.resetsAt } : {}),
    timestamp,
    message: alarmMessage(type, fact, now)
  };
  return event;
}

function alarmMessage(
  type: AlarmEventType,
  fact: Pick<NormalizedAlarmFact, 'provider' | 'window' | 'remainingPercent' | 'resetsAt'>,
  now: Date
): string {
  const provider = fact.provider === 'claude' ? 'Claude' : 'Codex';
  const label = fact.window === 'five_hour' ? '5H' : 'Weekly';
  if (type === 'alarm:reset_boundary_reached') return `${provider} ${label} window has reset.`;
  if (type === 'alarm:stale') return `${provider} ${label} usage is stale · current quota state is unknown`;
  const remaining = fact.remainingPercent === undefined ? '' : `${formatPercent(fact.remainingPercent)}% remaining`;
  if (type === 'alarm:recovered') return `${provider} ${label} quota recovered${remaining ? ` · ${remaining}` : ''}`;
  const condition = type === 'alarm:threshold_escalated' ? 'critical' : 'quota low';
  const reset = fact.resetsAt !== undefined && fact.resetsAt * 1000 > now.getTime()
    ? ` · resets in ${formatDuration(fact.resetsAt * 1000 - now.getTime())}`
    : '';
  return `${provider} ${label} ${condition}${remaining ? ` · ${remaining}` : ''}${reset}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function stableEventId(type: AlarmEventType, provider: AlarmProvider, window: AlarmWindow, discriminator: number | string): string {
  return `alarm_${crypto.createHash('sha256').update(`${type}|${provider}|${window}|${discriminator}`).digest('hex').slice(0, 20)}`;
}

function lowThreshold(preferences: AlarmPreferences, provider: AlarmProvider, window: AlarmWindow): number {
  const providerThresholds = preferences.thresholds[provider];
  return window === 'five_hour' ? providerThresholds.fiveHourLowPercent : providerThresholds.weeklyLowPercent;
}

function criticalThreshold(preferences: AlarmPreferences, provider: AlarmProvider, window: AlarmWindow): number {
  const providerThresholds = preferences.thresholds[provider];
  return window === 'five_hour' ? providerThresholds.fiveHourCriticalPercent : providerThresholds.weeklyCriticalPercent;
}

function ruleKey(provider: AlarmProvider, window: AlarmWindow): string {
  return `${provider}:${window}`;
}

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function sameResetCycle(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && Math.abs(a - b) <= SAME_RESET_CYCLE_TOLERANCE_SECONDS;
}

function sameRule(a: PersistedAlarmRuleState | undefined, b: PersistedAlarmRuleState): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
