/**
 * R6 field possession / context value (S57.1 §9).
 *
 * Values existing evidence only: the context owner `resolveContextOwner` already named,
 * the Work Ledger's current and recent Plays for this Game, and the Film's hashed touch
 * keys. No context receipt, no session store. Stable provider-session continuity is not
 * canonically observable today (S57.1 §18.3 open fact 1), so it stays UNKNOWN (0.7).
 *
 * Possession never forces a route: it only lowers the reacquisition cost of owners.
 * Pure: every input, including the clock, is injected.
 */

import type { TaskClassification } from '../capability-types';
import type { ContextEvidence } from '../control-plane/context-affinity';
import { evidenceKey } from '../control-plane/follow-up-evidence';
import type { InstanceLedgerEntry } from '../control-plane/work-ledger';

export type PossessionTier = 'active' | 'owner-strong' | 'owner-medium' | 'game-recent' | 'game-only' | 'none';
export type SessionContinuity = 'persisting' | 'restarted' | 'unknown';

export const POSSESSION_CONSTANTS = Object.freeze({
  base: Object.freeze({
    active: 1.0,
    'owner-strong': 0.85,
    'owner-medium': 0.55,
    'game-recent': 0.30,
    'game-only': 0.10,
    none: 0
  } satisfies Record<PossessionTier, number>),
  halfLifeMin: 240,
  continuity: Object.freeze({ persisting: 1.0, restarted: 0.4, unknown: 0.7 } satisfies Record<SessionContinuity, number>),
  /** S57.1 §9.3 reacquisition prior by task class. */
  reacq: Object.freeze({ architecture: 0.35, implementation: 0.25, default: 0.20, quick: 0.05 } satisfies Record<TaskClassification, number>),
  /** §9.5: fresh Scout intelligence is shared possession; it lowers every seat's reacquisition by up to 50%. */
  sharedIntelReacqCut: 0.5,
  /** §10.3: at or above this, the field is already possessed. */
  fieldPossessed: 0.55
});

export interface PossessionOwner {
  readonly instanceId: string;
  /** The evidence `resolveContextOwner` recorded for this owner. */
  readonly evidence: ContextEvidence;
}

export interface PossessionInput {
  readonly gameId: string;
  readonly now: number;
  /** Work Ledger entries. Only this Game's entries are read. */
  readonly ledger: readonly InstanceLedgerEntry[];
  /** The canonical context owner of this Play, when one was proven. */
  readonly owner?: PossessionOwner;
  /** Hashed touch keys of the Play being routed (R5 `touchKeys`). */
  readonly playTouchKeys: readonly string[];
  /** Film decision touch keys by clientRef, for Plays the Ledger no longer holds touches for. */
  readonly filmTouchKeys: ReadonlyMap<string, readonly string[]>;
  /** V1: always UNKNOWN; no canonical session identity is observable. */
  readonly continuity?: SessionContinuity;
}

export interface SeatPossession {
  readonly seat: string;
  readonly tier: PossessionTier;
  readonly base: number;
  readonly ageMin: number;
  readonly continuity: number;
  readonly continuityState: SessionContinuity;
  readonly value: number;
}

/**
 * Mirrors `resolveContextOwner`: wording-only report references and latest-Play
 * attribution are `medium`; a named or Incoming report is `strong`.
 */
export function ownerConfidence(evidence: ContextEvidence): 'strong' | 'medium' {
  return evidence === 'latest-report' || evidence === 'latest-play' ? 'medium' : 'strong';
}

/** Possession for every requested seat. Seats with no evidence in this Game are `none`. */
export function projectPossession(input: PossessionInput, seatIds: readonly string[]): Map<string, SeatPossession> {
  const continuityState = input.continuity ?? 'unknown';
  const continuity = POSSESSION_CONSTANTS.continuity[continuityState];
  const playKeys = new Set(input.playTouchKeys);
  const entries = new Map(input.ledger.filter((entry) => entry.gameId === input.gameId).map((entry) => [entry.playerInstanceId, entry]));
  const result = new Map<string, SeatPossession>();

  for (const seat of [...new Set(seatIds)].sort()) {
    const entry = entries.get(seat);
    const { tier, at } = classify(seat, entry, input.owner, playKeys, input.filmTouchKeys, input.now);
    const base = POSSESSION_CONSTANTS.base[tier];
    const ageMin = tier === 'none' || tier === 'active' ? 0 : Math.max(0, (input.now - at) / 60_000);
    const value = tier === 'none' ? 0 : base * Math.pow(0.5, ageMin / POSSESSION_CONSTANTS.halfLifeMin) * continuity;
    result.set(seat, { seat, tier, base, ageMin: round(ageMin), continuity, continuityState, value: round(value) });
  }
  return result;
}

function classify(
  seat: string,
  entry: InstanceLedgerEntry | undefined,
  owner: PossessionOwner | undefined,
  playKeys: ReadonlySet<string>,
  filmTouchKeys: ReadonlyMap<string, readonly string[]>,
  now: number
): { tier: PossessionTier; at: number } {
  const latest = latestActivity(entry, now);
  if (owner && owner.instanceId === seat) {
    if (entry?.workState === 'working' && entry.currentPlay) return { tier: 'active', at: now };
    return { tier: ownerConfidence(owner.evidence) === 'strong' ? 'owner-strong' : 'owner-medium', at: latest ?? now };
  }
  if (!entry) return { tier: 'none', at: now };
  const overlapAt = overlappingActivity(entry, playKeys, filmTouchKeys);
  if (overlapAt !== undefined) return { tier: 'game-recent', at: overlapAt };
  if (latest !== undefined) return { tier: 'game-only', at: latest };
  return { tier: 'none', at: now };
}

function latestActivity(entry: InstanceLedgerEntry | undefined, now: number): number | undefined {
  if (!entry) return undefined;
  if (entry.currentPlay) return now;
  return entry.recentPlays.reduce<number | undefined>((max, play) => max === undefined || play.finishedAt > max ? play.finishedAt : max, undefined);
}

/** Most recent time this seat worked on a Play touching one of this Play's files. */
function overlappingActivity(
  entry: InstanceLedgerEntry,
  playKeys: ReadonlySet<string>,
  filmTouchKeys: ReadonlyMap<string, readonly string[]>
): number | undefined {
  if (playKeys.size === 0) return undefined;
  let best: number | undefined;
  const current = entry.currentPlay;
  if (current && ((current.touches ?? []).some((touch) => playKeys.has(evidenceKey(touch)))
    || (filmTouchKeys.get(current.clientRef) ?? []).some((key) => playKeys.has(key)))) {
    best = current.startedAt;
  }
  for (const play of entry.recentPlays) {
    if ((filmTouchKeys.get(play.clientRef) ?? []).some((key) => playKeys.has(key))) {
      best = best === undefined ? play.finishedAt : Math.max(best, play.finishedAt);
    }
  }
  return best;
}

/**
 * S57.1 §9.3: reacquisition(seat) = (maxPossession − possession(seat)) · reacq(taskClass) · playCost.
 * `playCost` is the target's own priced burn, so re-reading context is charged at the same
 * window prices as the Play. Raising possession never raises this cost.
 */
export function reacquisitionCost(
  maxPossession: number,
  possession: number,
  taskClass: TaskClassification,
  playCost: number,
  sharedIntel: boolean
): number {
  const gap = Math.max(0, maxPossession - possession);
  const shared = sharedIntel ? 1 - POSSESSION_CONSTANTS.sharedIntelReacqCut : 1;
  return round(gap * POSSESSION_CONSTANTS.reacq[taskClass] * Math.max(0, playCost) * shared);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
