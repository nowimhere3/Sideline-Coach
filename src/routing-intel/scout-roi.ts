/**
 * R6 Scout-before-premium ROI (S57.1 §10).
 *
 * Four things stay separate:
 *   readiness      P_runs  — can a Scout run now (the Scout seat's Combine-proven READY state)
 *   correctness    P_right — was Scout intelligence right (R5 Film: clean post-Scout Plays vs
 *                            `bad-scout-evidence` attributions); a ready Scout is not a correct one
 *   cost / delay   declared cost class and the Scout's own observed duration
 *   what is held   fresh existing intel and field possession, which shrink what a new Scout can save
 *
 * Scout nodes never enter the Player prior pack. Direct Scout routing is unchanged: this
 * only values Scout-before-premium. Pure; the clock is injected.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import { effectiveAttributions, indexFilmPlays, projectFirstPassResolutions } from './attribution';
import type { RoutingFilmEvent } from './routing-film';

export type ScoutTier = 'existing-intel' | 'cheap-formation' | 'strong-scout' | 'a-team-reconciled';

export const SCOUT_ROI_CONSTANTS = Object.freeze({
  /** §10.2 reconPrior by task class. */
  reconPrior: Object.freeze({ architecture: 0.30, implementation: 0.20, default: 0.20, quick: 0.05 } satisfies Record<TaskClassification, number>),
  materialGapMultiplier: 1.3,
  /** Fresh existing intel leaves only 30% of the reconnaissance to buy. */
  existingIntelFactor: 0.3,
  /** §10.1 P_right prior mean per executable tier; strength n₀ = 4. */
  pRightPrior: Object.freeze({ 'cheap-formation': 0.5, 'strong-scout': 0.65, 'a-team-reconciled': 0.8 }),
  pRightStrength: 4,
  qualityLift: 0.02,
  harmFactor: 0.5,
  /** §10.3 stability margin. */
  netMargin: 0.02,
  /** §18.1: without cited paths, Scout intel is stale after 24 h (never fresher than the 72 h cap). */
  freshHours: 24,
  staleHours: 72,
  /**
   * P_runs for a Scout seat whose receiver Combine has proven READY. The daemon sees Combine
   * only through that READY projection, so V1 values it at §10.5's worked-example 0.9.
   * Not READY means no Scout option at all.
   */
  readyPRuns: 0.9
});

export type ScoutIntelState = 'fresh' | 'stale' | 'contradicted';

export interface ScoutIntelRecord {
  /** Hashed report path (R5 `evidenceKey`). */
  readonly reportKey: string;
  readonly at: number;
  /** The Play names this report, continues from it, or shares touched files with the Scout Play. */
  readonly coversPlay: boolean;
}

export interface ScoutIntelAssessment {
  readonly reportKey: string;
  readonly state: ScoutIntelState;
  readonly ageMin: number;
}

/**
 * The best Scout intel on file for this Play: covering records only; contradicted beats
 * nothing, and the newest record wins. §10.4: stale or contradicted is never `existing-intel`.
 */
export function assessScoutIntel(
  records: readonly ScoutIntelRecord[],
  contradicted: ReadonlySet<string>,
  now: number
): ScoutIntelAssessment | undefined {
  const covering = records.filter((record) => record.coversPlay)
    .sort((a, b) => b.at - a.at || a.reportKey.localeCompare(b.reportKey));
  const newest = covering[0];
  if (!newest) return undefined;
  const ageMin = Math.max(0, (now - newest.at) / 60_000);
  const state: ScoutIntelState = contradicted.has(newest.reportKey)
    ? 'contradicted'
    : ageMin <= SCOUT_ROI_CONSTANTS.freshHours * 60 ? 'fresh' : 'stale';
  return { reportKey: newest.reportKey, state, ageMin: round(ageMin) };
}

/** P_right: Beta(m, n₀ = 4) updated by weighted Film successes and failures. */
export function scoutPRight(
  tier: Exclude<ScoutTier, 'existing-intel'>,
  evidence: { readonly successes: number; readonly failures: number }
): number {
  const m = SCOUT_ROI_CONSTANTS.pRightPrior[tier];
  const n = SCOUT_ROI_CONSTANTS.pRightStrength;
  const successes = Math.max(0, evidence.successes);
  const failures = Math.max(0, evidence.failures);
  return round((m * n + successes) / (n + successes + failures));
}

export interface ReconFractionInput {
  readonly taskClass: TaskClassification;
  readonly materialEvidenceGap: boolean;
  readonly maxPossession: number;
  readonly freshIntel: boolean;
}

export function reconFraction(input: ReconFractionInput): number {
  return round(SCOUT_ROI_CONSTANTS.reconPrior[input.taskClass]
    * (input.materialEvidenceGap ? SCOUT_ROI_CONSTANTS.materialGapMultiplier : 1)
    * (1 - Math.min(1, Math.max(0, input.maxPossession)))
    * (input.freshIntel ? SCOUT_ROI_CONSTANTS.existingIntelFactor : 1));
}

export interface ScoutNetValueInput {
  readonly pRuns: number;
  readonly pRight: number;
  readonly reconFraction: number;
  /** The premium primary's priced burn, Σ price_w · burn_w(p50) (no reacquisition). */
  readonly primaryPricedBurn: number;
  /** The premium primary's C_play (priced burn + reacquisition). */
  readonly primaryPlayCost: number;
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly lambdaC: number;
  readonly lambdaD: number;
  readonly urgencyMult: number;
  readonly delayMin: number;
  /** Declared Scout cost in the same units (current Scout lanes are free: 0). */
  readonly scoutPriceCost: number;
}

export interface ScoutNetValue {
  readonly pUseful: number;
  /** Priced premium burn the Scout is expected to save. */
  readonly savedCost: number;
  readonly gain: number;
  readonly harm: number;
  readonly cost: number;
  readonly net: number;
}

/**
 * §10.2:
 *   savedCost = P_useful · reconFraction · Σ price_w·burn_w          (P_useful = P_runs · P_right)
 *   gain      = λ_c · savedCost + qualityLift (0.02·P_useful for hard or architecture Plays)
 *   harm      = (1 − P_right) · 0.5 · reconFraction · C_play
 *   cost      = λ_c · scoutPrice + λ_d · urgency · delayHours + harm
 */
export function scoutNetValue(input: ScoutNetValueInput): ScoutNetValue {
  const pUseful = input.pRuns * input.pRight;
  const savedCost = pUseful * input.reconFraction * Math.max(0, input.primaryPricedBurn);
  const lift = input.difficulty === 'hard' || input.taskClass === 'architecture' ? SCOUT_ROI_CONSTANTS.qualityLift * pUseful : 0;
  const gain = input.lambdaC * savedCost + lift;
  const harm = (1 - input.pRight) * SCOUT_ROI_CONSTANTS.harmFactor * input.reconFraction * Math.max(0, input.primaryPlayCost);
  const cost = input.lambdaC * input.scoutPriceCost + input.lambdaD * input.urgencyMult * (input.delayMin / 60) + harm;
  return {
    pUseful: round(pUseful),
    savedCost: round(savedCost),
    gain: round(gain),
    harm: round(harm),
    cost: round(cost),
    net: round(gain - cost)
  };
}

export interface ScoutFilmEvidence {
  /** Hashed Scout report keys a `bad-scout-evidence` attribution has contradicted. */
  readonly contradictedReportKeys: readonly string[];
  /** Weighted P_right evidence: clean post-Scout Plays vs `bad-scout-evidence` repairs. */
  readonly pRightEvidence: { readonly successes: number; readonly failures: number };
}

/**
 * Scout intelligence correctness from R5 Film only (S57.1 §10.1, §10.4). A post-Scout
 * continuation carries `scoutReportKey`. When it resolves `clean`, the intel it acted on held.
 * When a follow-up of it is attributed `bad-scout-evidence`, that report is contradicted.
 * The weight follows R3/R5: Coach/envelope 1.0, rule high 0.6, otherwise 0.3.
 */
export function scoutFilmEvidence(events: readonly RoutingFilmEvent[], now: number): ScoutFilmEvidence {
  const plays = indexFilmPlays(events);
  const resolutions = projectFirstPassResolutions(events, now).resolutions;
  const contradicted = new Set<string>();
  let successes = 0;
  let failures = 0;
  for (const attribution of effectiveAttributions(events).values()) {
    if (attribution.cause !== 'bad-scout-evidence') continue;
    const reportKey = plays.get(attribution.parentClientRef)?.decision.scoutReportKey;
    if (!reportKey) continue;
    contradicted.add(reportKey);
    failures += attribution.source !== 'rule' ? 1 : attribution.confidence === 'high' ? 0.6 : 0.3;
  }
  for (const [clientRef, play] of plays) {
    if (play.decision.scoutReportKey && resolutions[clientRef]?.state === 'clean') successes += 1;
  }
  return {
    contradictedReportKeys: [...contradicted].sort(),
    pRightEvidence: { successes: round(successes), failures: round(failures) }
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
