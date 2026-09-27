/**
 * R7 Dev Mode views (S57.1 §8.4, §17, §19).
 *
 * Read-only projections over the canonical R3 belief, R5 attribution and the Routing Film. Nothing
 * here scores, ranks or persists: every number is either an R3/R5/R6 output passed through or a plain
 * count of Film facts. Human wording comes from stable reason codes (a closed table), never from
 * free-form generation.
 *
 * Counterfactual honesty (§19.3): only the CHOSEN route ever has an outcome. Nothing here states or
 * implies what an unchosen option would have done, and insufficient evidence is reported as such.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import { SCOUT_PLAYER_TYPE } from '../scout-player-contract';
import { FIX_CAUSES, type FixCause } from '../control-plane/follow-up-evidence';
import { ROUTING_WEIGHTS, type RoutingRecommendation, type UnknownFact } from './recommend';
import { REASON_CODES, type ReasonCode } from './reasons';
import { computeBelief, type EvidenceStrength } from './belief';
import { normalizeTarget, type BaselinePreference } from './lineage';
import type { PriorPackSource } from './prior-pack';
import {
  buildAttributedFilmIndex,
  effectiveAttributions,
  indexFilmPlays,
  projectFirstPassResolutions,
  type EffectiveAttribution
} from './attribution';
import type { RoutingFilmEvent } from './routing-film';
import { buildCalibrationReport, frozenChosenFirstPass, type CalibrationReport } from './calibration';

export const DEV_VIEWS_VERSION = 'r7-dev-views-1';

/** Below these counts a figure is shown with its n but labelled insufficient. */
export const SHADOW_MIN_N = Object.freeze({
  agreement: 10,
  outcomeGroup: 5,
  calibrationBin: 5,
  burn: 5,
  scout: 5,
  /** S57.1 §19.4 exit criterion: dispatched Plays logged before the advisory chip is considered. */
  graduationPlays: 50
});

// ── Recommendation narrative: stable reason codes → fixed sentences ────────────────────────

export const REASON_NARRATIVE: Readonly<Record<ReasonCode, string>> = Object.freeze({
  COACH_LOCKED: 'The Coach locked this route; the recommendation is advisory only.',
  SCOUT_SAVES_PREMIUM: 'A Scout first is expected to save premium burn.',
  NO_SCOUT_FIELD_POSSESSED: 'No Scout: the field is already possessed or fresh intel covers it.',
  FIELD_POSSESSED: 'A Player already holds useful context for this Play.',
  EXPIRING_5H: 'The 5-hour window resets soon, so its remaining capacity is cheap to spend.',
  WEEKLY_SCARCE: 'Weekly capacity is scarce.',
  FIVE_HOUR_SCARCE: '5-hour capacity is scarce.',
  SCARCITY_CRITICAL: 'Capacity is critically low.',
  SCARCITY_LOW: 'Capacity is low.',
  RESET_SOON: 'A reset is close.',
  INTERRUPT_RISK: 'The Play may not finish before the window resets.',
  BEST_FIT: 'Best expected first-pass value for the cost.',
  TOSS_UP_KEPT_BASELINE: 'Too close to call, so the existing AUTO choice is kept.',
  RESOURCE_UNKNOWN: 'Resource state is UNKNOWN for this seat; a neutral cost was used.',
  DRIFT_SUSPECTED: 'Recent outcomes drifted from expectation.',
  NEW_MODEL_INHERITED: 'A newer model inheriting evidence from its lineage.',
  PRIOR_ONLY: 'Researched prior only; no local evidence yet.',
  THIN_EVIDENCE: 'Little local evidence so far.',
  SPECIALIZED_ROUTE_KEPT: 'A specialized route (Scout reconnaissance or Terminal) is kept as today.',
  BASELINE_ONLY: 'Basic profile: only the existing AUTO choice is shown.'
});

export interface NarrativeLine { readonly code: string; readonly text: string }

/** Unknown codes are shown as themselves, never invented into prose. */
export function reasonNarrative(codes: readonly string[]): NarrativeLine[] {
  return codes.map((code) => ({
    code,
    text: (REASON_CODES as readonly string[]).includes(code) ? REASON_NARRATIVE[code as ReasonCode] : `Reason code ${code}`
  }));
}

const UNKNOWN_NARRATIVE: Readonly<Record<UnknownFact['kind'], string>> = Object.freeze({
  'resource-price': 'Resource price is UNKNOWN',
  burn: 'Burn is UNKNOWN (no isolated Film yet)',
  duration: 'Duration is UNKNOWN',
  'queue-delay': 'Queue delay is UNKNOWN',
  'session-continuity': 'Session continuity is UNKNOWN',
  'scout-readiness': 'Scout readiness is UNKNOWN',
  'scout-delay': 'Scout delay is UNKNOWN',
  'no-candidate': 'No eligible candidate',
  'baseline-unscored': 'The baseline route could not be scored'
});

export function unknownNarrative(fact: UnknownFact): string {
  return `${UNKNOWN_NARRATIVE[fact.kind] ?? `${fact.kind} is UNKNOWN`} · ${fact.subject}`;
}

export interface RecommendationNarrative {
  readonly baseline: readonly NarrativeLine[];
  readonly primary: readonly NarrativeLine[];
  readonly nextBest: readonly NarrativeLine[];
  readonly waitOption: readonly NarrativeLine[];
  readonly scoutOption: readonly NarrativeLine[];
  /** Parallel to `recommendation.candidates`. */
  readonly candidates: readonly (readonly NarrativeLine[])[];
  readonly unknowns: readonly string[];
  /** The posture's weights, verbatim from R6's frozen table. */
  readonly weights: Readonly<Record<string, number | string | boolean>>;
}

/** Dev narrative for an R6 recommendation: derived from its reason codes only. */
export function recommendationNarrative(rec: RoutingRecommendation): RecommendationNarrative {
  const of = (option: { readonly reasons: readonly string[] } | undefined): NarrativeLine[] => option ? reasonNarrative(option.reasons) : [];
  return {
    baseline: of(rec.baseline), primary: of(rec.primary), nextBest: of(rec.nextBest),
    waitOption: of(rec.waitOption), scoutOption: of(rec.scoutOption),
    candidates: rec.candidates.map((candidate) => of(candidate)),
    unknowns: rec.unknowns.map(unknownNarrative),
    weights: ROUTING_WEIGHTS.postures[rec.posture.value] as Readonly<Record<string, number | string | boolean>>
  };
}

// ── Follow-up attribution rows (correction chips) ──────────────────────────────────────────────

export interface FollowUpAttributionRow {
  readonly clientRef: string;
  readonly parentClientRef: string;
  readonly gameId: string;
  readonly linkEvidence: string;
  readonly linkedAt: number;
  readonly cause: FixCause;
  readonly source: 'rule' | 'coach' | 'envelope';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly ruleId?: string;
  /** `Cause: player-defect · rule 7 · low` */
  readonly label: string;
  /** True when no attribution event exists and `unattributed` is the implicit default. */
  readonly implicit: boolean;
}

export function attributionLabel(cause: string, source: string, confidence: string, ruleId?: string): string {
  const who = source === 'rule' ? (ruleId ? `rule ${ruleId.replace(/^R5-/, '')}` : 'rule') : source;
  return `Cause: ${cause} · ${who} · ${confidence}`;
}

export function listFollowUpAttributions(events: readonly RoutingFilmEvent[], limit = 50): FollowUpAttributionRow[] {
  const effective = effectiveAttributions(events);
  const seen = new Set<string>();
  const rows: FollowUpAttributionRow[] = [];
  for (const event of events) {
    if (event.kind !== 'link' || seen.has(event.clientRef)) continue;
    seen.add(event.clientRef);
    const attribution: EffectiveAttribution | undefined = effective.get(event.clientRef);
    const cause = attribution?.cause ?? 'unattributed';
    const source = attribution?.source ?? 'rule';
    const confidence = attribution?.confidence ?? 'low';
    rows.push({
      clientRef: event.clientRef,
      parentClientRef: event.parentClientRef,
      gameId: event.gameId,
      linkEvidence: event.linkEvidence,
      linkedAt: event.at,
      cause,
      source,
      confidence,
      ...(attribution?.ruleId ? { ruleId: attribution.ruleId } : {}),
      label: attributionLabel(cause, source, confidence, attribution?.ruleId),
      implicit: !attribution
    });
  }
  return rows.sort((a, b) => b.linkedAt - a.linkedAt || a.clientRef.localeCompare(b.clientRef)).slice(0, limit);
}

// ── Scorecard browser (node × task class) ────────────────────────────────────────────────────────

export interface ScorecardRow {
  readonly key: string;
  readonly role: 'player' | 'scout';
  readonly playerType: string;
  readonly lineage?: string;
  readonly modelId: string;
  readonly effort: string;
  /** `unknown` when Film lines pre-date the R5 profile join. */
  readonly taskClass: TaskClassification | 'unknown';
  /** The difficulty the belief was evaluated at: the most common one in this row's Film. */
  readonly difficulty: PlayDifficulty;
  readonly belief: {
    readonly mean: number; readonly lo: number; readonly hi: number;
    readonly nPrior: number; readonly nLocalEff: number; readonly pooled: number;
    readonly source: string; readonly evidence: EvidenceStrength; readonly drift?: 'suspected';
  };
  /** Finished Plays observed at this node × class. */
  readonly n: number;
  /** Plays whose first pass is resolved into evidence (clean or player-defect). */
  readonly resolved: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly resolutions: Readonly<Record<string, number>>;
  /** Linked follow-ups of this row's Plays, by effective cause. */
  readonly causes: Readonly<Record<string, number>>;
  readonly followUps: number;
  /** Diagnostic only: unattributed / linked follow-ups. Never a Player penalty. `null` = no follow-ups. */
  readonly unattributedRate: number | null;
}

export interface ScorecardView {
  readonly rows: readonly ScorecardRow[];
  readonly note: string;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

function mode<T extends string>(values: readonly T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T = fallback;
  let bestCount = 0;
  for (const [value, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) { best = value; bestCount = count; }
  }
  return best;
}

export function buildScorecards(
  events: readonly RoutingFilmEvent[],
  pack: PriorPackSource,
  now: number,
  baselinePreference: BaselinePreference
): ScorecardView {
  const index = buildAttributedFilmIndex(events, pack, now);
  const projection = projectFirstPassResolutions(events, now);
  const states = new Map(projection.details.map((detail) => [detail.clientRef, detail.state]));
  const effective = effectiveAttributions(events);
  const groupOf = new Map<string, string>();
  const groups = new Map<string, typeof index.observations[number][]>();
  for (const observation of index.observations) {
    const taskClass = observation.profile?.taskClass ?? 'unknown';
    const groupKey = `${observation.target.key}|${observation.role}|${taskClass}`;
    groupOf.set(observation.clientRef, groupKey);
    const list = groups.get(groupKey) ?? [];
    list.push(observation);
    groups.set(groupKey, list);
  }

  const causeCounts = new Map<string, Map<string, number>>();
  const seenLinks = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'link' || seenLinks.has(event.clientRef)) continue;
    seenLinks.add(event.clientRef);
    const groupKey = groupOf.get(event.parentClientRef);
    if (!groupKey) continue;
    const cause = effective.get(event.clientRef)?.cause ?? 'unattributed';
    const counts = causeCounts.get(groupKey) ?? new Map<string, number>();
    counts.set(cause, (counts.get(cause) ?? 0) + 1);
    causeCounts.set(groupKey, counts);
  }

  const rows: ScorecardRow[] = [];
  for (const [groupKey, observations] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const first = observations[0];
    const taskClass = first.profile?.taskClass ?? 'unknown';
    const difficulty = mode(observations.map((o) => o.profile?.difficulty ?? 'medium'), 'medium') as PlayDifficulty;
    const belief = computeBelief(
      { playerType: first.target.playerType, modelId: first.target.modelId, effort: first.target.effort },
      { taskClass: taskClass === 'unknown' ? 'default' : taskClass, difficulty, role: first.role },
      pack, index, now, { baselinePreference, resourcePool: first.resourcePool }
    );
    const outcomes: Record<string, number> = {};
    const resolutions: Record<string, number> = {};
    for (const observation of observations) {
      outcomes[observation.ledgerOutcome] = (outcomes[observation.ledgerOutcome] ?? 0) + 1;
      const state = states.get(observation.clientRef) ?? 'pending';
      resolutions[state] = (resolutions[state] ?? 0) + 1;
    }
    const causes: Record<string, number> = {};
    for (const [cause, count] of [...(causeCounts.get(groupKey) ?? new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b))) causes[cause] = count;
    const followUps = Object.values(causes).reduce((sum, count) => sum + count, 0);
    rows.push({
      key: first.target.key,
      role: first.role,
      playerType: first.target.playerType,
      ...(first.target.lineage ? { lineage: first.target.lineage } : {}),
      modelId: first.target.modelId,
      effort: first.target.effort,
      taskClass,
      difficulty,
      belief: {
        mean: belief.firstPass.mean, lo: belief.firstPass.lo, hi: belief.firstPass.hi,
        nPrior: belief.nPrior, nLocalEff: belief.nLocalEff, pooled: belief.pooled,
        source: belief.source, evidence: belief.evidence, ...(belief.drift ? { drift: belief.drift } : {})
      },
      n: observations.length,
      resolved: observations.filter((o) => o.firstPass !== undefined).length,
      outcomes,
      resolutions,
      causes,
      followUps,
      unattributedRate: followUps ? round((causes.unattributed ?? 0) / followUps) : null
    });
  }
  return {
    rows,
    note: 'Belief is R3 over the attributed Film. A high unattributed rate means the attribution rules may need improving; it is not a Player penalty.'
  };
}

// ── Shadow report (§19.3) ───────────────────────────────────────────────────────────────────────

export interface BurnPredictionReport {
  /** `not-evaluable` until at least one frozen prediction meets an isolated observation. */
  readonly status: 'evaluated' | 'not-evaluable';
  readonly reason: string;
  /** Prediction/observation pairs used. */
  readonly n: number;
  readonly sufficient: boolean;
  /** Median of (predicted - observed) / observed. `null` when not evaluable. */
  readonly medianRelativeError: number | null;
  readonly medianAbsRelativeError: number | null;
  readonly byWindow: readonly { readonly pool: string; readonly window: string; readonly n: number; readonly medianRelativeError: number }[];
  /** Isolated (high/medium) burn observations on file, paired or not. */
  readonly isolatedObservations: number;
  /** Isolated observations with no frozen prediction. They are never reconstructed. */
  readonly withoutPrediction: number;
  readonly limitation: string;
}

export interface Rate { readonly n: number; readonly successes: number; readonly rate: number | null; readonly sufficient: boolean }

const rate = (successes: number, n: number, min: number): Rate => ({
  n, successes, rate: n ? round(successes / n) : null, sufficient: n >= min
});

export interface CalibrationBin {
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly meanPredicted: number | null;
  readonly observedRate: number | null;
  readonly sufficient: boolean;
}

export interface ShadowReport {
  readonly version: string;
  /** Dispatched Plays whose decision carries an R6 recommendation digest. */
  readonly recommendedPlays: number;
  readonly agreement: Rate & { readonly disagreements: number };
  readonly disagreementOutcome: {
    readonly whenAgreed: Rate;
    readonly whenDisagreed: Rate;
    readonly caveat: string;
  };
  readonly calibration: {
    readonly bins: readonly CalibrationBin[];
    /** Chosen routes with a resolved outcome whose predicted first pass was recorded. */
    readonly n: number;
    /** Resolved chosen routes with no recorded prediction (e.g. MANUAL choices outside the digest). */
    readonly withoutPrediction: number;
    readonly caveat: string;
  };
  readonly burnPrediction: BurnPredictionReport;
  readonly scoutRoi: {
    readonly label: 'observational, confounded';
    readonly comparisons: readonly {
      readonly pool: string; readonly window: string;
      readonly scouted: { readonly n: number; readonly meanBurnPercent: number | null };
      readonly unscouted: { readonly n: number; readonly meanBurnPercent: number | null };
      readonly sufficient: boolean;
    }[];
    readonly scoutedPlays: number;
  };
  readonly graduation: {
    readonly status: 'shadow';
    readonly playsLogged: number;
    readonly playsRequired: number;
    readonly playsCriterionMet: boolean;
    readonly burnErrorCriterion: 'not-evaluable' | 'within-50-percent' | 'outside-50-percent';
    readonly invariantTests: 'not-evaluated-here';
    readonly calibratedPercent: 'not-granted';
    readonly note: string;
  };
  readonly counterfactual: string;
}

const COUNTERFACTUAL_NOTE = 'Unchosen options have no outcome and are never scored here. Nothing in this report makes any claim about the result of an alternative.';

export function buildShadowReport(
  events: readonly RoutingFilmEvent[],
  pack: PriorPackSource,
  now: number
): ShadowReport {
  const plays = indexFilmPlays(events);
  const index = buildAttributedFilmIndex(events, pack, now);
  const observed = new Map(index.observations.map((observation) => [observation.clientRef, observation]));

  const keyOf = (target: { playerType?: string; modelId?: string; model?: string; effort?: string }): string =>
    normalizeTarget(pack, { playerType: target.playerType ?? 'unknown', modelId: target.modelId ?? target.model, effort: target.effort }).key;

  let recommended = 0;
  let agreed = 0;
  const outcomeAgreed = { successes: 0, n: 0 };
  const outcomeDisagreed = { successes: 0, n: 0 };
  const CAL_BINS = 5;
  const bins = Array.from({ length: CAL_BINS }, () => ({ n: 0, predicted: 0, observed: 0 }));
  let calibrated = 0;
  let withoutPrediction = 0;

  for (const [clientRef, play] of plays) {
    const digest = play.decision.recommendation;
    if (!digest?.primary) continue;
    recommended += 1;
    const chosen = play.decision.chosen;
    const primary = digest.primary;
    const agree = primary.kind === 'scout-first'
      ? chosen.playerType === SCOUT_PLAYER_TYPE
      : keyOf(primary) === keyOf({ playerType: chosen.playerType, model: chosen.model, effort: chosen.effort });
    if (agree) agreed += 1;

    const firstPass = observed.get(clientRef)?.firstPass;
    if (!firstPass) continue; // only resolved, skill-eligible outcomes of the CHOSEN route
    const group = agree ? outcomeAgreed : outcomeDisagreed;
    group.n += 1;
    group.successes += firstPass.y;

    const chosenKey = keyOf({ playerType: chosen.playerType, model: chosen.model, effort: chosen.effort });
    const predicted = frozenChosenFirstPass(play.decision, chosenKey, keyOf);
    if (predicted === undefined) { withoutPrediction += 1; continue; }
    const bin = Math.min(CAL_BINS - 1, Math.floor(predicted * CAL_BINS));
    bins[bin].n += 1;
    bins[bin].predicted += predicted;
    bins[bin].observed += firstPass.y;
    calibrated += 1;
  }

  const burnPrediction = burnPredictionReport(plays, keyOf);

  return {
    version: DEV_VIEWS_VERSION,
    recommendedPlays: recommended,
    agreement: { ...rate(agreed, recommended, SHADOW_MIN_N.agreement), disagreements: recommended - agreed },
    disagreementOutcome: {
      whenAgreed: rate(outcomeAgreed.successes, outcomeAgreed.n, SHADOW_MIN_N.outcomeGroup),
      whenDisagreed: rate(outcomeDisagreed.successes, outcomeDisagreed.n, SHADOW_MIN_N.outcomeGroup),
      caveat: 'Selection-biased: the Coach chose these routes for reasons the recommendation did not see. Compare with the n shown, not as a verdict on either side.'
    },
    calibration: {
      bins: bins.map((bin, i) => ({
        lo: i / CAL_BINS, hi: (i + 1) / CAL_BINS, n: bin.n,
        meanPredicted: bin.n ? round(bin.predicted / bin.n) : null,
        observedRate: bin.n ? round(bin.observed / bin.n) : null,
        sufficient: bin.n >= SHADOW_MIN_N.calibrationBin
      })),
      n: calibrated,
      withoutPrediction,
      caveat: 'Chosen routes only; only they have outcomes.'
    },
    burnPrediction,
    scoutRoi: scoutRoiCheck(events, plays),
    graduation: {
      status: 'shadow',
      playsLogged: recommended,
      playsRequired: SHADOW_MIN_N.graduationPlays,
      playsCriterionMet: recommended >= SHADOW_MIN_N.graduationPlays,
      burnErrorCriterion: burnPrediction.sufficient && burnPrediction.medianAbsRelativeError !== null
        ? (burnPrediction.medianAbsRelativeError <= 0.5 ? 'within-50-percent' : 'outside-50-percent')
        : 'not-evaluable',
      invariantTests: 'not-evaluated-here',
      calibratedPercent: 'not-granted',
      note: 'Shadow mode continues. Leaving it needs all three S57.1 §19.4 criteria; a calibrated percentage has its own separate gate (§12.3) and is not granted by R7.'
    },
    counterfactual: COUNTERFACTUAL_NOTE
  };
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Section 19.3 burn prediction error: the p50 R6 froze in the digest at recommendation time (for the option
 * that became the chosen target) against the observed delta of the same pool/window on high/medium-isolation
 * Plays. Predictions are read only from the persisted receipt; a Play without one is never reconstructed.
 */
function burnPredictionReport(
  plays: ReturnType<typeof indexFilmPlays>,
  keyOf: (target: { playerType?: string; modelId?: string; model?: string; effort?: string }) => string
): BurnPredictionReport {
  const errors: { pool: string; window: string; error: number }[] = [];
  let isolatedObservations = 0;
  let withoutPrediction = 0;
  for (const play of plays.values()) {
    if (!play.outcome) continue;
    const observations = play.outcome.burn.filter((b) => (b.isolation === 'high' || b.isolation === 'medium')
      && b.remainingPercentDelta !== undefined && b.censoredAtMostPercent === undefined && b.remainingPercentDelta > 0);
    isolatedObservations += observations.length;
    const digest = play.decision.recommendation;
    const chosen = play.decision.chosen;
    const chosenKey = keyOf({ playerType: chosen.playerType, model: chosen.model, effort: chosen.effort });
    const option = [digest?.primary, digest?.baseline, digest?.nextBest].find((candidate) =>
      candidate && candidate.kind !== 'scout-first' && candidate.kind !== 'wait-for-reset' && candidate.burn?.length && keyOf(candidate) === chosenKey);
    for (const observed of observations) {
      const predicted = option?.burn?.find((entry) => entry.pool === observed.pool && entry.window === observed.window);
      if (!predicted) { withoutPrediction += 1; continue; }
      const observedPercent = observed.remainingPercentDelta as number;
      errors.push({ pool: observed.pool, window: observed.window, error: (predicted.p50 * 100 - observedPercent) / observedPercent });
    }
  }
  const limitation = 'Only Plays with high/medium isolation (no same-pool overlap, tight receipt bracket) are compared; predictions are the ones frozen at recommendation time, never reconstructed.';
  if (!errors.length) {
    return {
      status: 'not-evaluable',
      reason: 'No frozen burn prediction has met an isolated observation yet (older Film carries no prediction).',
      n: 0, sufficient: false, medianRelativeError: null, medianAbsRelativeError: null, byWindow: [],
      isolatedObservations, withoutPrediction, limitation
    };
  }
  const groups = new Map<string, { pool: string; window: string; errors: number[] }>();
  for (const entry of errors) {
    const key = `${entry.pool}|${entry.window}`;
    const group = groups.get(key) ?? { pool: entry.pool, window: entry.window, errors: [] };
    group.errors.push(entry.error);
    groups.set(key, group);
  }
  return {
    status: 'evaluated',
    reason: 'Median of (predicted - observed) / observed over frozen predictions and isolated observations.',
    n: errors.length,
    sufficient: errors.length >= SHADOW_MIN_N.burn,
    medianRelativeError: round(median(errors.map((e) => e.error))),
    medianAbsRelativeError: round(median(errors.map((e) => Math.abs(e.error)))),
    byWindow: [...groups.values()].sort((a, b) => `${a.pool}|${a.window}`.localeCompare(`${b.pool}|${b.window}`))
      .map((g) => ({ pool: g.pool, window: g.window, n: g.errors.length, medianRelativeError: round(median(g.errors)) })),
    isolatedObservations, withoutPrediction, limitation
  };
}

function scoutRoiCheck(events: readonly RoutingFilmEvent[], plays: ReturnType<typeof indexFilmPlays>): ShadowReport['scoutRoi'] {
  // Scouted = a premium Play that acted on a Scout report (post-Scout continuation); comparable = same task class + difficulty.
  const comparable = new Set<string>();
  const scouted = new Set<string>();
  for (const [clientRef, play] of plays) {
    if (!play.outcome || !play.decision.profile || play.decision.profile.role === 'scout') continue;
    const cls = `${play.decision.profile.taskClass}|${play.decision.profile.difficulty}`;
    if (play.decision.scoutReportKey) { scouted.add(clientRef); comparable.add(cls); }
  }
  const buckets = new Map<string, { scouted: number[]; unscouted: number[]; pool: string; window: string }>();
  for (const [clientRef, play] of plays) {
    if (!play.outcome || !play.decision.profile || play.decision.profile.role === 'scout') continue;
    const cls = `${play.decision.profile.taskClass}|${play.decision.profile.difficulty}`;
    if (!comparable.has(cls)) continue;
    for (const burn of play.outcome.burn) {
      if ((burn.isolation !== 'high' && burn.isolation !== 'medium') || burn.remainingPercentDelta === undefined || burn.censoredAtMostPercent !== undefined) continue;
      const key = `${burn.pool}|${burn.window}`;
      const bucket = buckets.get(key) ?? { scouted: [], unscouted: [], pool: burn.pool, window: burn.window };
      (scouted.has(clientRef) ? bucket.scouted : bucket.unscouted).push(burn.remainingPercentDelta);
      buckets.set(key, bucket);
    }
  }
  const mean = (values: readonly number[]): number | null => values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  return {
    label: 'observational, confounded',
    scoutedPlays: scouted.size,
    comparisons: [...buckets.values()]
      .sort((a, b) => `${a.pool}|${a.window}`.localeCompare(`${b.pool}|${b.window}`))
      .map((bucket) => ({
        pool: bucket.pool, window: bucket.window,
        scouted: { n: bucket.scouted.length, meanBurnPercent: mean(bucket.scouted) },
        unscouted: { n: bucket.unscouted.length, meanBurnPercent: mean(bucket.unscouted) },
        sufficient: bucket.scouted.length >= SHADOW_MIN_N.scout && bucket.unscouted.length >= SHADOW_MIN_N.scout
      }))
  };
}

// ── One Dev read model ─────────────────────────────────────────────────────────────────────────────

export interface RoutingIntelligenceView {
  readonly version: string;
  readonly generatedAt: number;
  readonly scorecards: ScorecardView;
  readonly shadow: ShadowReport;
  /** R10: per-task-class calibration graduation (§12.3). Separate from `shadow.graduation` (§19.4). */
  readonly calibration: CalibrationReport;
  readonly followUps: readonly FollowUpAttributionRow[];
  readonly causes: readonly FixCause[];
  readonly filmEvents: number;
}

export function buildRoutingIntelligenceView(
  events: readonly RoutingFilmEvent[],
  pack: PriorPackSource,
  now: number,
  baselinePreference: BaselinePreference
): RoutingIntelligenceView {
  return {
    version: DEV_VIEWS_VERSION,
    generatedAt: now,
    scorecards: buildScorecards(events, pack, now, baselinePreference),
    shadow: buildShadowReport(events, pack, now),
    calibration: buildCalibrationReport(events, pack, now),
    followUps: listFollowUpAttributions(events),
    causes: FIX_CAUSES,
    filmEvents: events.length
  };
}
