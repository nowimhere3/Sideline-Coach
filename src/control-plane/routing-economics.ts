import type { PlayerRoutingCapability } from '../capability-types';
import type { AlarmPreferences } from '../running-players';
import { normalizeAlarmFacts, type AlarmProvider, type AlarmWindow, type NormalizedAlarmFact } from './alarm-engine';
import type { AlarmRuleState, AlarmStateSnapshot, PersistedAlarmRuleState } from './alarm-state-store';
import type { HealthAuthoritySnapshot } from './health-authority';
import { ResourcePolicyService, type ProviderResourcePolicy } from './resource-policy';

/** Open identity: later resource authorities do not require widening a closed provider union. */
export type ResourcePoolId = string;

export interface RoutingEconomicsWindow {
  readonly id: string;
  /** Data carried with the window, never inferred from its id. */
  readonly lengthMin: number;
  readonly remainingFraction?: number;
  readonly resetsAt?: number;
  readonly timeToResetMin?: number;
  readonly pacePressure?: number;
  /** Base pace price. Duration-dependent policy floors are represented separately. */
  readonly price: number | 'unknown';
  readonly floor?: number;
  readonly stale: boolean;
  readonly policyLag: boolean;
}

export interface RoutingEconomicsPool {
  readonly pool: ResourcePoolId;
  readonly evidence: 'known' | 'unknown';
  readonly windows: readonly RoutingEconomicsWindow[];
  /** Stage 2A policy, carried without reshaping or threshold re-evaluation. */
  readonly policy?: ProviderResourcePolicy;
}

export interface RoutingEconomicsSnapshot {
  readonly projectedAt: string;
  readonly pools: Readonly<Record<ResourcePoolId, RoutingEconomicsPool>>;
}

export type RoutingEconomicsPreferences = Pick<AlarmPreferences, 'maxStaleAgeMinutes'>;
export type ResourcePoolSeat = Pick<PlayerRoutingCapability, 'playerType' | 'transport' | 'capability'>;

interface CanonicalPoolDescriptor {
  readonly pool: ResourcePoolId;
  /** Closed Stage 2A identity exists only at this adaptation boundary. */
  readonly policyProvider: AlarmProvider;
  readonly windows: readonly {
    readonly id: string;
    readonly alarmWindow: AlarmWindow;
    readonly lengthMin: number;
  }[];
}

const CANONICAL_POOL_DESCRIPTORS: readonly CanonicalPoolDescriptor[] = [
  {
    pool: 'claude', policyProvider: 'claude',
    windows: [
      { id: 'five_hour', alarmWindow: 'five_hour', lengthMin: 300 },
      { id: 'weekly', alarmWindow: 'weekly', lengthMin: 10_080 }
    ]
  },
  {
    pool: 'codex', policyProvider: 'codex',
    windows: [
      { id: 'five_hour', alarmWindow: 'five_hour', lengthMin: 300 },
      { id: 'weekly', alarmWindow: 'weekly', lengthMin: 10_080 }
    ]
  }
];

/**
 * Pure current-state projection. HealthAuthority supplies raw facts,
 * AlarmEngine supplies window verdicts, and Stage 2A supplies provider policy.
 */
export function projectRoutingEconomics(
  health: HealthAuthoritySnapshot,
  alarmState: AlarmStateSnapshot,
  preferences: RoutingEconomicsPreferences,
  now: Date
): RoutingEconomicsSnapshot {
  const facts = normalizeAlarmFacts(health, now, preferences.maxStaleAgeMinutes);
  const factsByRule = new Map(facts.map((fact) => [ruleKey(fact.provider, fact.window), fact]));
  const policyService = new ResourcePolicyService({ getState: () => alarmState });
  const pools: Record<ResourcePoolId, RoutingEconomicsPool> = {};

  for (const descriptor of CANONICAL_POOL_DESCRIPTORS) {
    const policy = policyService.get(descriptor.policyProvider);
    const windows = descriptor.windows.map((window) => projectWindow(
      window,
      factsByRule.get(ruleKey(descriptor.policyProvider, window.alarmWindow)),
      alarmState.rules[ruleKey(descriptor.policyProvider, window.alarmWindow)],
      now
    ));
    pools[descriptor.pool] = {
      pool: descriptor.pool,
      evidence: policy.evidenceState === 'known' && windows.every((window) => window.price !== 'unknown') ? 'known' : 'unknown',
      windows,
      policy
    };
  }

  return { projectedAt: now.toISOString(), pools };
}

/** Recomputes on every read; it never caches or becomes another resource authority. */
export class RoutingEconomicsReader {
  private readonly now: () => Date;

  constructor(private readonly inputs: {
    readonly health: () => HealthAuthoritySnapshot;
    readonly alarmState: () => AlarmStateSnapshot;
    readonly preferences: () => RoutingEconomicsPreferences;
    readonly now?: () => Date;
  }) {
    this.now = inputs.now ?? (() => new Date());
  }

  read(): RoutingEconomicsSnapshot {
    return projectRoutingEconomics(
      this.inputs.health(),
      this.inputs.alarmState(),
      this.inputs.preferences(),
      this.now()
    );
  }
}

/**
 * Maps a concrete seat to its resource authority. Model and lineage are
 * deliberately absent from the decision: an AntiGravity seat stays unknown
 * even when its active model name contains Claude or Codex branding.
 */
export function resourcePoolForSeat(seat: ResourcePoolSeat): ResourcePoolId | 'unknown' {
  const playerType = seat.playerType.trim().toLowerCase();
  const authority = seat.capability.provider.trim().toLowerCase();
  if (playerType === 'claude' && authority === 'claude') return 'claude';
  if (playerType === 'codex' && authority === 'codex') return 'codex';
  return 'unknown';
}

export interface RoutingEconomicsBurn {
  readonly window: string;
  readonly fraction: number;
}

/**
 * Pure §11 cost primitive used by later consumers. Duration is explicit, so R1
 * never invents it. A policy floor applies only when scarcity survives the Play;
 * burn after a reset is charged at the architecture's fresh-window price 1.0.
 */
export function estimatePoolEconomicCost(
  pool: RoutingEconomicsPool,
  burns: readonly RoutingEconomicsBurn[],
  expectedDurationMin: number
): number | 'unknown' {
  if (!Number.isFinite(expectedDurationMin) || expectedDurationMin <= 0) return 'unknown';
  let cost = 0;
  for (const burn of burns) {
    if (!Number.isFinite(burn.fraction) || burn.fraction < 0) return 'unknown';
    const window = pool.windows.find((candidate) => candidate.id === burn.window);
    if (!window || window.price === 'unknown' || window.timeToResetMin === undefined) return 'unknown';
    const floorApplies = window.floor !== undefined && window.timeToResetMin > expectedDurationMin;
    const prePrice = floorApplies ? Math.max(window.price, window.floor as number) : window.price;
    const preFraction = burn.fraction * Math.min(1, window.timeToResetMin / expectedDurationMin);
    cost += prePrice * preFraction + (burn.fraction - preFraction);
  }
  return cost;
}

function projectWindow(
  descriptor: CanonicalPoolDescriptor['windows'][number],
  fact: NormalizedAlarmFact | undefined,
  alarmRule: PersistedAlarmRuleState | undefined,
  now: Date
): RoutingEconomicsWindow {
  const stale = !fact || fact.stale;
  const policyLag = observablePolicyLag(fact, alarmRule);
  const floor = policyFloor(alarmRule?.state);
  if (stale || fact.remainingPercent === undefined || fact.resetsAt === undefined) {
    return {
      id: descriptor.id,
      lengthMin: descriptor.lengthMin,
      price: 'unknown',
      ...(floor !== undefined ? { floor } : {}),
      stale,
      policyLag
    };
  }

  const remainingFraction = fact.remainingPercent / 100;
  const timeToResetMin = Math.max(0, (fact.resetsAt * 1000 - now.getTime()) / 60_000);
  const pacePressure = (timeToResetMin / descriptor.lengthMin) / Math.max(remainingFraction, 0.01);
  return {
    id: descriptor.id,
    lengthMin: descriptor.lengthMin,
    remainingFraction,
    resetsAt: fact.resetsAt,
    timeToResetMin,
    pacePressure,
    price: clamp(pacePressure, 0.05, 10),
    ...(floor !== undefined ? { floor } : {}),
    stale: false,
    policyLag
  };
}

function observablePolicyLag(fact: NormalizedAlarmFact | undefined, rule: PersistedAlarmRuleState | undefined): boolean {
  // R1 never compares percentages to Dad's thresholds. It can truthfully flag
  // observable freshness/cycle skew while AlarmEngine's verdict remains final.
  const factUnknown = !fact || fact.stale || fact.remainingPercent === undefined;
  const policyUnknown = !rule || rule.state === 'UNKNOWN';
  if (factUnknown !== policyUnknown) return true;
  if (factUnknown) return false;
  const factHasHorizon = fact?.resetsAt !== undefined;
  const policyHasHorizon = rule?.horizonResetsAt !== undefined;
  if (factHasHorizon !== policyHasHorizon) return true;
  return factHasHorizon && policyHasHorizon && fact.resetsAt !== rule.horizonResetsAt;
}

function policyFloor(state: AlarmRuleState | undefined): number | undefined {
  if (state === 'CRITICAL') return 4;
  if (state === 'LOW') return 1.5;
  return undefined;
}

function ruleKey(provider: AlarmProvider, window: AlarmWindow): string {
  return `${provider}:${window}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
