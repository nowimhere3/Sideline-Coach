/**
 * S57.2 — Commercial capability catalogue.
 *
 * WHAT a capability is, never how it is sold. IDs are feature-semantic and stable;
 * plan names, prices and billing never appear here or in feature code. Packaging
 * moves capabilities between offerings by changing grants (see profiles.ts), not code.
 *
 * `reserved` capabilities are defined so packaging can name them, but no product code
 * gates on them yet: either the feature is not built (Intelligent Routing surfaces,
 * DeferredPlay, PolicyGate) or it was not found in source (Autofill, Wires). They must
 * never be presented as implemented features.
 */

export type MeterKind = 'flag' | 'count' | 'minutes' | 'ceiling';

export type CapabilityUnit = 'count' | 'minutes' | 'games';

export const CAPABILITY_IDS = [
  'games.active',
  'remote.access',
  'scout.play',
  'scout.formation.wide',
  'scout.maintenance',
  'routing.intelligent',
  'routing.intelligent.economics',
  'routing.intelligent.nextBest',
  'routing.intelligent.scorecards',
  'routing.intelligent.confidence',
  'routing.schedule',
  'routing.autonomous',
  'routines',
  'alerts.advanced',
  'autofill',
  'wires'
] as const;

export type CapabilityId = typeof CAPABILITY_IDS[number];

export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly meter: MeterKind;
  /** A facet uses its own grant when one exists, otherwise its parent's. */
  readonly parent?: CapabilityId;
  /** Defined for packaging only: no product code gates on it yet. */
  readonly reserved?: true;
  /** Human copy for gate messages. Capability-named, never plan-named. */
  readonly dadName: string;
  readonly unit?: CapabilityUnit;
}

const DEFINITIONS: readonly CapabilityDefinition[] = [
  // VERIFIED gate points (S57.2 §2, §20 C2).
  { id: 'games.active', meter: 'ceiling', dadName: 'Active Games', unit: 'games' },
  { id: 'remote.access', meter: 'minutes', dadName: 'Mobile Remote', unit: 'minutes' },
  { id: 'scout.play', meter: 'count', dadName: 'Scout Plays', unit: 'count' },
  { id: 'scout.maintenance', meter: 'count', dadName: 'Scout Roster Refresh', unit: 'count' },
  // Coach Routines (Dad-facing "Coach Refresh" handoff). Q3 (closed): Scout maintenance is "Scout Roster Refresh".
  { id: 'routines', meter: 'flag', dadName: 'Coach Routines' },

  // RESERVED: designed but not built.
  { id: 'scout.formation.wide', meter: 'ceiling', reserved: true, dadName: 'Wide Scout Formations', unit: 'count' },
  { id: 'routing.intelligent', meter: 'flag', reserved: true, dadName: 'Intelligent Routing' },
  { id: 'routing.intelligent.economics', meter: 'flag', parent: 'routing.intelligent', reserved: true, dadName: 'Routing Economics' },
  { id: 'routing.intelligent.nextBest', meter: 'flag', parent: 'routing.intelligent', reserved: true, dadName: 'Next Best' },
  { id: 'routing.intelligent.scorecards', meter: 'flag', parent: 'routing.intelligent', reserved: true, dadName: 'Player Scorecards' },
  { id: 'routing.intelligent.confidence', meter: 'flag', parent: 'routing.intelligent', reserved: true, dadName: 'Routing Confidence' },
  { id: 'routing.schedule', meter: 'flag', reserved: true, dadName: 'Schedule After Reset' },
  { id: 'routing.autonomous', meter: 'flag', reserved: true, dadName: 'Autonomous Routing' },
  { id: 'alerts.advanced', meter: 'flag', reserved: true, dadName: 'Advanced Alerts' },
  // RESERVED: NOT FOUND in source (S57.2 §2.6, §2.7).
  { id: 'autofill', meter: 'flag', reserved: true, dadName: 'Autofill' },
  { id: 'wires', meter: 'flag', reserved: true, dadName: 'Wires' }
];

export const CAPABILITY_CATALOGUE: ReadonlyMap<CapabilityId, CapabilityDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.id, Object.freeze({ ...definition })])
);

export function isCapabilityId(value: unknown): value is CapabilityId {
  return typeof value === 'string' && CAPABILITY_CATALOGUE.has(value as CapabilityId);
}

export function capabilityDefinition(id: CapabilityId): CapabilityDefinition {
  const definition = CAPABILITY_CATALOGUE.get(id);
  if (!definition) throw new Error(`Unknown capability: ${String(id)}`);
  return definition;
}
