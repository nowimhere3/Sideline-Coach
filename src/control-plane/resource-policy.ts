import type { AlarmProvider, AlarmWindow } from './alarm-engine';
import type { AlarmRuleState, AlarmStateSnapshot, PersistedAlarmRuleState } from './alarm-state-store';

export type ProviderConserveLevel = 'none' | 'low' | 'critical';
export type ResourceEvidenceState = 'known' | 'unknown';

export interface ProviderResourcePolicy {
  readonly provider: AlarmProvider;
  readonly isConserveActive: boolean;
  readonly conserveLevel: ProviderConserveLevel;
  readonly evidenceState: ResourceEvidenceState;
  readonly rationale: string;
  readonly activeResetsAt: number | null;
}

export type ProviderResourcePolicies = Readonly<Record<AlarmProvider, ProviderResourcePolicy>>;

export interface AlarmStateReader {
  getState(): AlarmStateSnapshot;
}

const WINDOWS: readonly AlarmWindow[] = ['five_hour', 'weekly'];
const SCARCITY_RANK: Readonly<Record<AlarmRuleState, number>> = {
  UNKNOWN: -1,
  NORMAL: 0,
  LOW: 1,
  CRITICAL: 2
};

/**
 * Stateless query seam for future routing consumers. AlarmEngine remains the
 * only threshold/state authority; this service retains no mutable policy data.
 */
export class ResourcePolicyService {
  constructor(private readonly alarmState: AlarmStateReader) {}

  get(provider: AlarmProvider): ProviderResourcePolicy {
    return projectProviderResourcePolicy(this.alarmState.getState(), provider);
  }

  getAll(): ProviderResourcePolicies {
    const snapshot = this.alarmState.getState();
    return {
      claude: projectProviderResourcePolicy(snapshot, 'claude'),
      codex: projectProviderResourcePolicy(snapshot, 'codex')
    };
  }
}

/** Pure projection over canonical AlarmEngine transition state. */
export function projectProviderResourcePolicy(
  snapshot: AlarmStateSnapshot,
  provider: AlarmProvider
): ProviderResourcePolicy {
  const windows = WINDOWS.map((window) => ({
    window,
    rule: snapshot.rules[`${provider}:${window}`]
  }));
  const unknown = windows.filter(({ rule }) => !rule || rule.state === 'UNKNOWN');
  const known = windows.filter((entry): entry is { window: AlarmWindow; rule: PersistedAlarmRuleState } => Boolean(entry.rule) && entry.rule.state !== 'UNKNOWN');
  const strongestRank = known.reduce((rank, { rule }) => Math.max(rank, SCARCITY_RANK[rule.state]), 0);
  const strongestState: 'LOW' | 'CRITICAL' | undefined = strongestRank === SCARCITY_RANK.CRITICAL
    ? 'CRITICAL'
    : strongestRank === SCARCITY_RANK.LOW ? 'LOW' : undefined;
  const evidenceState: ResourceEvidenceState = unknown.length > 0 ? 'unknown' : 'known';

  if (!strongestState) {
    return {
      provider,
      isConserveActive: false,
      conserveLevel: 'none',
      evidenceState,
      rationale: normalOrUnknownRationale(provider, unknown.map(({ window }) => window)),
      activeResetsAt: null
    };
  }

  const drivers = known.filter(({ rule }) => rule.state === strongestState);
  const activeResetsAt = selectDrivingReset(drivers);
  return {
    provider,
    isConserveActive: true,
    conserveLevel: strongestState === 'CRITICAL' ? 'critical' : 'low',
    evidenceState,
    rationale: scarcityRationale(provider, strongestState, drivers.map(({ window }) => window), unknown.map(({ window }) => window), activeResetsAt),
    activeResetsAt
  };
}

function selectDrivingReset(drivers: readonly { window: AlarmWindow; rule: PersistedAlarmRuleState }[]): number | null {
  // Only strongest-state windows participate. The earliest defined canonical
  // horizon wins; equal horizons are naturally stable in 5H-then-Weekly order.
  return drivers
    .map(({ rule }) => rule.horizonResetsAt)
    .filter((value): value is number => value !== undefined)
    .reduce<number | null>((earliest, value) => earliest === null ? value : Math.min(earliest, value), null);
}

function normalOrUnknownRationale(provider: AlarmProvider, unknown: readonly AlarmWindow[]): string {
  const name = providerName(provider);
  if (unknown.length === 0) return `${name} 5H and Weekly are NORMAL.`;
  if (unknown.length === WINDOWS.length) return `${name} usage evidence is currently UNKNOWN.`;
  return `${name} usage evidence is incomplete; ${windowList(unknown)} is UNKNOWN.`;
}

function scarcityRationale(
  provider: AlarmProvider,
  state: 'LOW' | 'CRITICAL',
  drivers: readonly AlarmWindow[],
  unknown: readonly AlarmWindow[],
  activeResetsAt: number | null
): string {
  const subject = `${providerName(provider)} ${windowList(drivers)}`;
  const reset = activeResetsAt === null
    ? '.'
    : drivers.length > 1
      ? `; earliest driving reset is ${new Date(activeResetsAt * 1000).toISOString()}.`
      : `; resets at ${new Date(activeResetsAt * 1000).toISOString()}.`;
  const incomplete = unknown.length > 0 ? ` ${windowList(unknown)} evidence is UNKNOWN.` : '';
  return `${subject} ${drivers.length > 1 ? 'are' : 'is'} ${state} at Dad's configured threshold${reset}${incomplete}`;
}

function providerName(provider: AlarmProvider): 'Claude' | 'Codex' {
  return provider === 'claude' ? 'Claude' : 'Codex';
}

function windowList(windows: readonly AlarmWindow[]): string {
  return windows.map((window) => window === 'five_hour' ? '5H' : 'Weekly').join(' and ');
}
