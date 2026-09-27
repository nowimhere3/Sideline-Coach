/**
 * R6 Recommendation engine (S57.1 §4, §5.4, §9–§13, §15.5; S57.2 §10; S57.9 A2).
 *
 * One pure brain: `recommendRoute(input) → RoutingRecommendation`. It runs AFTER the
 * existing router has fixed its decision and never changes that decision: the decision
 * enters only as `baseline`, a fact to compare against (shadow mode, S57.1 §19).
 *
 * Canonical inputs, never re-derived here:
 *   seats      R4 `eligibleSeats` (resource pool is the seat's own, never the model's)
 *   belief     R3 `computeBelief` over R5 `buildAttributedFilmIndex`
 *   economics  R1 `RoutingEconomicsSnapshot` (current truth; Film receipts are never read)
 *   possession existing context ownership + Work Ledger (possession.ts)
 *   Scout      Scout seat readiness + R5 Scout-correctness Film (scout-roi.ts)
 *   envelope   S57.2 `RoutingCapabilitySet` (capability facts only; no plans, no SKUs)
 *
 * Deterministic: the clock and every input are injected; no Math.random; numbers are
 * rounded to 6 decimals so the object and its Film digest replay byte-identically.
 */

import * as crypto from 'node:crypto';
import type { RouteConstraints, RoutingMode, TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import type { RouteSeat } from '../routing-candidates';
import {
  estimatePoolEconomicCost,
  type RoutingEconomicsPool,
  type RoutingEconomicsSnapshot,
  type RoutingEconomicsWindow
} from '../control-plane/routing-economics';
import type { ProviderResourcePolicy } from '../control-plane/resource-policy';
import type { RoutingFilmRecommendationDigest, RoutingFilmRecommendationOption } from './routing-film';
import { computeBelief, type CapabilityBelief, type EvidenceStrength } from './belief';
import type { FilmIndex } from './film-index';
import type { BaselinePreference, PriorOrigin } from './lineage';
import type { PriorPackSource } from './prior-pack';
import {
  POSSESSION_CONSTANTS,
  projectPossession,
  reacquisitionCost,
  type PossessionInput,
  type PossessionTier,
  type SeatPossession
} from './possession';
import {
  SCOUT_ROI_CONSTANTS,
  assessScoutIntel,
  reconFraction,
  scoutNetValue,
  scoutPRight,
  type ScoutIntelAssessment,
  type ScoutIntelRecord,
  type ScoutNetValue,
  type ScoutTier
} from './scout-roi';
import { orderReasons, type ReasonCode } from './reasons';

export const RECOMMENDATION_ENGINE_VERSION = 'r6-recommend-1';

export type RoutingPosture = 'fast' | 'balanced' | 'sure' | 'conserve';
export type Urgency = 'whenever' | 'normal' | 'now';

interface PostureWeights {
  readonly lambdaC: number;
  readonly lambdaD: number;
  readonly lambdaR: number;
  readonly q: 'mean' | 'lo';
  readonly weeklyWait: boolean;
}

/** S57.1 §5.4 V1 constants, frozen and stamped on every recommendation. */
export const ROUTING_WEIGHTS = Object.freeze({
  version: 'r6-weights-1',
  postures: Object.freeze({
    fast: Object.freeze({ lambdaC: 0.5, lambdaD: 0.30, lambdaR: 0.5, q: 'mean', weeklyWait: false }),
    balanced: Object.freeze({ lambdaC: 1.0, lambdaD: 0.05, lambdaR: 0.5, q: 'mean', weeklyWait: false }),
    sure: Object.freeze({ lambdaC: 0.8, lambdaD: 0.05, lambdaR: 1.0, q: 'lo', weeklyWait: false }),
    conserve: Object.freeze({ lambdaC: 2.5, lambdaD: 0.01, lambdaR: 0.5, q: 'mean', weeklyWait: true })
  } satisfies Record<RoutingPosture, PostureWeights>),
  urgencyMult: Object.freeze({ whenever: 0.3, normal: 1, now: 5 } satisfies Record<Urgency, number>),
  /** A cheap miss costs a repair. */
  repairRho: 0.6,
  /** §18.1: UNKNOWN resource evidence adds this to Risk. */
  unknownRisk: 0.1,
  /** §11.1: pre-reset scarcity floors (from R1's ResourcePolicy window verdicts). */
  interrupt: Object.freeze({ p75Over: 0.5, p50Over: 0.9 }),
  /** §12.1 strength bands, in σ_Δ. */
  strength: Object.freeze({ clear: 2, lean: 0.5 }),
  /** §15.5 wait-for-reset generation. */
  wait: Object.freeze({ fiveHourMaxMin: 90, weeklyMaxHours: 36, improveBy: 0.02, interruptAt: 0.5 }),
  /**
   * S57.7 §531: every R0 node has burn `null`, so at cold start burn is UNKNOWN. A burn-unknown
   * option is charged the same neutral cost as every other burn-unknown option (the median
   * known option cost when one exists), plus the UNKNOWN risk increment. Equal across options,
   * it never flips a ranking by fiction; it only scales reacquisition and the repair term.
   * It is never used as saved burn for Scout ROI.
   */
  unknownBurnNeutralCost: 0.10,
  maxCandidates: 12,
  possession: POSSESSION_CONSTANTS,
  scout: SCOUT_ROI_CONSTANTS
});

/** S57.2 §10.2: capability facts only. Built from the entitlement snapshot by one adapter. */
export interface RoutingCapabilitySet {
  readonly intelligent: boolean;
  readonly economics: boolean;
  readonly nextBest: boolean;
  readonly schedule: boolean;
  readonly scoutExecutionAllowed: boolean;
  readonly autonomous: boolean;
}

export const FULL_ROUTING_CAPABILITIES: RoutingCapabilitySet = Object.freeze({
  intelligent: true, economics: true, nextBest: true, schedule: true, scoutExecutionAllowed: true, autonomous: true
});

export interface RecommendationProfile {
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly role: 'player' | 'scout';
  /** Envelope field (future); V1 is always `normal`, never lexically guessed. */
  readonly urgency: Urgency;
  readonly scoutNeed: { readonly reconnaissancePrimary: boolean; readonly materialEvidenceGap: boolean };
  readonly followUp: 'new-work' | 'continuation';
  /** Hashed touch keys (R5). */
  readonly touchKeys: readonly string[];
  /** One automatic Scout stage maximum: a post-Scout continuation never buys another Scout. */
  readonly postScoutContinuation: boolean;
}

/** The existing router's decision, already fixed. */
export interface RecommendationBaseline {
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly action: 'dispatch' | 'queue' | 'handoff';
  readonly executionType?: 'reasoning' | 'direct-shell' | 'scout-formation';
}

export interface RecommendationScoutInput {
  /** Scout seat is on the field and its Formation receiver is Combine-proven READY. */
  readonly seatReady: boolean;
  /** Runtime readiness; undefined = UNKNOWN (then no Scout option). */
  readonly pRuns?: number;
  /** The Scout's own expected duration (R3 Scout-role Film); undefined = UNKNOWN (then no Scout option). */
  readonly delayMin?: number;
  /** Declared cost in cost units. Current Scout lanes run free models: 0. */
  readonly scoutPriceCost: number;
  readonly intel: readonly ScoutIntelRecord[];
  readonly contradictedReportKeys: readonly string[];
  /** R5 Film: weighted clean post-Scout Plays and `bad-scout-evidence` attributions. */
  readonly pRightEvidence: { readonly successes: number; readonly failures: number };
}

export interface RecommendRouteInput {
  readonly now: number;
  readonly gameId: string;
  readonly clientRef?: string;
  readonly profile: RecommendationProfile;
  readonly authority: { readonly mode: RoutingMode; readonly constraints?: RouteConstraints };
  readonly baseline?: RecommendationBaseline;
  /** R4 `eligibleSeats` output. Scout and Terminal seats are ignored for Player ranking. */
  readonly seats: readonly RouteSeat[];
  readonly economics: RoutingEconomicsSnapshot;
  readonly priorPack: PriorPackSource;
  readonly filmIndex: FilmIndex;
  readonly baselinePreference: BaselinePreference;
  readonly possession: Omit<PossessionInput, 'gameId' | 'now'>;
  readonly scout: RecommendationScoutInput;
  /** S57.2: default all-true (developer / unlimited behavior). */
  readonly capabilities?: RoutingCapabilitySet;
  readonly posture?: { readonly value: RoutingPosture; readonly source: 'coach-default' | 'play-envelope' };
}

export interface RouteTargetView {
  readonly playerType: string;
  readonly lineage?: string;
  readonly modelId: string;
  readonly effort: string;
}

export interface WindowCostView {
  readonly pool: string;
  readonly window: string;
  readonly remainingFraction?: number;
  readonly timeToResetMin?: number;
  readonly pacePressure?: number;
  readonly price: number | 'unknown' | 'not-entitled';
  readonly floor?: 'LOW' | 'CRITICAL';
  readonly burnP50?: number;
  readonly cost?: number;
}

export interface RouteOptionScores {
  readonly utility: number;
  readonly firstPass: { readonly mean: number; readonly lo: number; readonly hi: number };
  readonly q: number;
  readonly cost: {
    /** Priced burn + reacquisition; `neutral` when burn was UNKNOWN (S57.7 §531). */
    readonly units: number;
    readonly neutral: boolean;
    readonly pricedBurn: number;
    readonly reacquisition: number;
    readonly effective: number;
    readonly windows: readonly WindowCostView[];
  };
  readonly possession: { readonly tier: PossessionTier; readonly value: number };
  readonly delayMin: number;
  readonly risk: number;
  readonly interrupt: number;
  readonly sigmaU: number;
}

export interface RouteOption {
  readonly kind: 'send' | 'queue' | 'handoff' | 'scout-first' | 'wait-for-reset';
  readonly target: RouteTargetView;
  /** The exact executable route fields (what a later `optionToDecision` would send). */
  readonly route: { readonly playerInstanceId: string; readonly model?: string; readonly effort?: string };
  readonly resourcePool: string;
  readonly scout?: { readonly tier: ScoutTier; readonly intelRef?: string };
  readonly wait?: { readonly pool: string; readonly window: string; readonly resetsAt: number; readonly cycleToken: number };
  /** Absent for a specialized route kind (Scout reconnaissance, Terminal) that has no Player belief. */
  readonly scores?: RouteOptionScores;
  readonly belief?: {
    readonly evidence: EvidenceStrength;
    readonly source: PriorOrigin;
    readonly nPrior: number;
    readonly nLocalEff: number;
    readonly pooled: number;
    readonly priorNode?: string;
    readonly inheritedFrom?: string;
    readonly drift?: 'suspected';
    readonly burnConfidence: string;
    readonly durationP50Min?: number;
  };
  readonly reasons: readonly ReasonCode[];
}

export type UnknownFactKind =
  | 'resource-price' | 'burn' | 'duration' | 'queue-delay' | 'session-continuity'
  | 'scout-readiness' | 'scout-delay' | 'no-candidate' | 'baseline-unscored';

export interface UnknownFact { readonly kind: UnknownFactKind; readonly subject: string }

export interface RoutingRecommendation {
  readonly id: string;
  readonly engineVersion: string;
  readonly weightsVersion: string;
  readonly priorPackVersion: string;
  readonly computedAt: number;
  readonly gameId: string;
  readonly clientRef?: string;
  readonly profile: {
    readonly taskClass: TaskClassification;
    readonly difficulty: PlayDifficulty;
    readonly role: 'player' | 'scout';
    readonly urgency: Urgency;
    readonly followUp: 'new-work' | 'continuation';
    readonly touchesCount: number;
  };
  readonly posture: { readonly value: RoutingPosture; readonly source: 'coach-default' | 'play-envelope' };
  readonly authority: {
    readonly mode: RoutingMode;
    readonly lockedBy: readonly string[];
    /** True when the Coach locked the route: MANUAL, or any explicit envelope dimension. */
    readonly advisoryOnly: boolean;
  };
  readonly capabilities: RoutingCapabilitySet;
  readonly baseline?: RouteOption;
  readonly primary?: RouteOption;
  readonly nextBest?: RouteOption;
  readonly waitOption?: RouteOption;
  readonly scoutOption?: RouteOption;
  /** Ranked scored options (Dev), capped. */
  readonly candidates: readonly RouteOption[];
  readonly strength: {
    readonly recommendation: 'clear' | 'lean' | 'toss-up';
    readonly evidence: EvidenceStrength;
    /**
     * R10 (S57.1 §12.3, S57.27): the primary's own `firstPass.mean`, unrounded. Present only when its task
     * class is graduated and the value falls in a supported bin. Added after ranking by `withCalibration`;
     * never an input to ordering.
     */
    readonly calibratedFirstPass?: number;
  };
  readonly baselineAgreement: 'agree' | 'disagree' | 'no-baseline';
  readonly possession: { readonly max: number; readonly seats: readonly SeatPossession[] };
  readonly scout: {
    readonly considered: boolean;
    readonly blockedBy?: 'not-entitled' | 'not-ready' | 'readiness-unknown' | 'delay-unknown' | 'reconnaissance-play'
      | 'post-scout-continuation' | 'scout-role' | 'no-premium-primary' | 'field-possessed' | 'urgency-now';
    readonly intel?: ScoutIntelAssessment;
    readonly pRuns?: number;
    readonly pRight?: number;
    readonly value?: ScoutNetValue;
    readonly verdict: 'scout-first' | 'no-scout' | 'not-considered';
  };
  /** ResourcePolicy verbatim per pool (Scarcity: a fact, never a weight). */
  readonly scarcity: Readonly<Record<string, ProviderResourcePolicy | undefined>>;
  readonly unknowns: readonly UnknownFact[];
}

const LOCK_DIMENSIONS: ReadonlySet<string> = new Set(['player', 'instance', 'model', 'effort', 'model-exclusion', 'scout-directive', 'route-shorthand']);
const Z20 = 0.841621;

interface Scored {
  option: RouteOption;
  key: string;
  q: number;
  sigmaQ: number;
  sigmaBurnCost: number;
  pricedBurn: number;
  pricedBurnKnown: boolean;
  priceUnknown: boolean;
  queueDelayUnknown: boolean;
  belief: CapabilityBelief;
  seat: RouteSeat;
  possession: SeatPossession;
  durationMin?: number;
  windows: WindowCostView[];
  interrupt: number;
  delayMin: number;
  kind: RouteOption['kind'];
}

export function recommendRoute(input: RecommendRouteInput): RoutingRecommendation {
  const capabilities = input.capabilities ?? FULL_ROUTING_CAPABILITIES;
  const posture = input.posture ?? { value: 'balanced' as const, source: 'coach-default' as const };
  const weights = ROUTING_WEIGHTS.postures[posture.value];
  const urgencyMult = ROUTING_WEIGHTS.urgencyMult[input.profile.urgency];
  const lockedBy = [
    ...(input.authority.mode === 'manual' ? ['manual'] : []),
    ...(input.authority.constraints?.recognized ?? []).filter((dimension) => LOCK_DIMENSIONS.has(dimension))
  ];
  const unique = [...new Set(lockedBy)].sort();
  const advisoryOnly = unique.length > 0;
  const unknowns = new UnknownSet();

  const premiumSeats = input.seats
    .filter((seat) => seat.executionType !== 'scout-formation' && seat.executionType !== 'direct-shell' && seat.playerType !== 'terminal')
    .filter((seat) => seat.state === 'ready' || seat.state === 'busy')
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId));

  const baselineSeat = input.baseline
    ? input.seats.find((seat) => seat.instanceId === input.baseline?.playerInstanceId)
    : undefined;
  const possessionSeats = [...new Set([...premiumSeats.map((seat) => seat.instanceId), ...(baselineSeat ? [baselineSeat.instanceId] : [])])];
  const possession = projectPossession({ ...input.possession, gameId: input.gameId, now: input.now }, possessionSeats);
  if (possessionSeats.length) unknowns.add('session-continuity', 'all-seats');
  const maxPossession = Math.max(0, ...[...possession.values()].map((entry) => entry.value));
  const intel = assessScoutIntel(input.scout.intel, new Set(input.scout.contradictedReportKeys), input.now);
  const freshIntel = intel?.state === 'fresh';

  const context: ScoreContext = {
    input, capabilities, weights, urgencyMult, possession, unknowns,
    owner: input.possession.owner?.instanceId
  };

  // [3]–[7] Expand each seat over its live catalog, score every target, keep the best seat per target.
  const byTarget = new Map<string, Scored>();
  for (const seat of premiumSeats) {
    for (const route of expandTargets(seat, input.authority.mode === 'manual' ? undefined : input.authority.constraints)) {
      const scored = scoreTarget(context, seat, route);
      if (!scored) continue;
      const current = byTarget.get(scored.key);
      if (!current || prefer(scored, current)) byTarget.set(scored.key, scored);
    }
  }
  const scoredList = [...byTarget.values()];
  // Baseline is scored with the same function, even when its seat is busy or outside the ranked set.
  const baselineScored = baselineSeat && input.baseline && isPremium(baselineSeat)
    ? findBaseline(scoredList, input.baseline) ?? scoreTarget(context, baselineSeat, {
        playerInstanceId: baselineSeat.instanceId, model: input.baseline.model, effort: input.baseline.effort
      }, baselineKind(input.baseline.action))
    : undefined;
  const all = baselineScored && !scoredList.includes(baselineScored) ? [...scoredList, baselineScored] : scoredList;
  finalizeUtilities(all, context, freshIntel, maxPossession);

  const ranked = [...scoredList].sort(compareScored);
  const baselineOption = input.baseline
    ? (baselineScored
        ? baselineScored.option
        : specializedOption(input.baseline, baselineSeat, unknowns))
    : undefined;

  const scarcity: Record<string, ProviderResourcePolicy | undefined> = {};
  for (const [pool, entry] of Object.entries(input.economics.pools).sort(([a], [b]) => a.localeCompare(b))) scarcity[pool] = entry.policy;

  const base = {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    weightsVersion: ROUTING_WEIGHTS.version,
    priorPackVersion: input.priorPack.packVersion,
    computedAt: input.now,
    gameId: input.gameId,
    ...(input.clientRef ? { clientRef: input.clientRef } : {}),
    profile: {
      taskClass: input.profile.taskClass,
      difficulty: input.profile.difficulty,
      role: input.profile.role,
      urgency: input.profile.urgency,
      followUp: input.profile.followUp,
      touchesCount: input.profile.touchKeys.length
    },
    posture,
    authority: { mode: input.authority.mode, lockedBy: unique, advisoryOnly },
    capabilities,
    possession: { max: round(maxPossession), seats: [...possession.values()] },
    scarcity
  };

  // S57.2 §10.3: basic profile. One brain: the baseline it already carries, no alternatives.
  if (!capabilities.intelligent) {
    const primary = baselineOption ? withReasons(baselineOption, ['BASELINE_ONLY', ...(advisoryOnly ? ['COACH_LOCKED' as const] : [])]) : undefined;
    if (!primary) unknowns.add('no-candidate', 'baseline');
    return finish({
      ...base,
      ...(baselineOption ? { baseline: baselineOption } : {}),
      ...(primary ? { primary } : {}),
      candidates: primary ? [primary] : [],
      strength: { recommendation: 'toss-up', evidence: primary?.belief?.evidence ?? 'prior-only' },
      baselineAgreement: baselineOption ? 'agree' : 'no-baseline',
      scout: { considered: false, verdict: 'not-considered' },
      unknowns: unknowns.list()
    });
  }

  // Specialized route kinds keep today's path: a Scout reconnaissance Play, or a Terminal command.
  const specialized = input.baseline && (input.baseline.executionType === 'scout-formation' || input.baseline.executionType === 'direct-shell'
    || input.profile.role === 'scout');
  if (specialized && baselineOption) {
    const primary = withReasons(baselineOption, ['SPECIALIZED_ROUTE_KEPT', ...(advisoryOnly ? ['COACH_LOCKED' as const] : [])]);
    const candidates = ranked.slice(0, ROUTING_WEIGHTS.maxCandidates).map((entry) => withReasons(entry.option, optionReasons(entry, ranked, context)));
    return finish({
      ...base,
      baseline: baselineOption,
      primary,
      candidates,
      strength: { recommendation: 'toss-up', evidence: 'prior-only' },
      baselineAgreement: 'agree',
      scout: { considered: false, blockedBy: input.profile.role === 'scout' ? 'scout-role' : 'reconnaissance-play', verdict: 'not-considered' },
      unknowns: unknowns.list()
    });
  }

  if (ranked.length === 0) {
    unknowns.add('no-candidate', 'premium-seats');
    return finish({
      ...base,
      ...(baselineOption ? { baseline: baselineOption } : {}),
      candidates: [],
      strength: { recommendation: 'toss-up', evidence: 'prior-only' },
      baselineAgreement: baselineOption ? 'disagree' : 'no-baseline',
      scout: { considered: false, blockedBy: 'no-premium-primary', verdict: 'not-considered' },
      unknowns: unknowns.list()
    });
  }

  // [9] Selection with §5.4 toss-up stability.
  let top = ranked[0];
  const challenger = ranked.find((entry) => entry !== top);
  const strength = challenger ? strengthBetween(top, challenger) : 'clear';
  const reasonsExtra: ReasonCode[] = [];
  if (strength === 'toss-up' && baselineScored && ranked.includes(baselineScored) && baselineScored !== top) {
    top = baselineScored;
    reasonsExtra.push('TOSS_UP_KEPT_BASELINE');
  } else if (strength === 'toss-up' && baselineScored === top) {
    reasonsExtra.push('TOSS_UP_KEPT_BASELINE');
  }
  const nextBestEntry = ranked.find((entry) => entry !== top
    && (entry.option.target.playerType !== top.option.target.playerType || entry.option.target.lineage !== top.option.target.lineage));

  // [7] Scout-before-premium (§10) on the premium primary.
  const scout = evaluateScout(context, top, intel, freshIntel, maxPossession);
  if (scout.noScoutFieldPossessed) reasonsExtra.push('NO_SCOUT_FIELD_POSSESSED');

  // [7] Wait-for-reset (§15.5), never against an UNKNOWN horizon.
  const waitOption = capabilities.schedule ? waitFor(top, context) : undefined;

  const directPrimary = withReasons(top.option, [
    ...(advisoryOnly ? ['COACH_LOCKED' as const] : []),
    ...optionReasons(top, ranked, context),
    ...reasonsExtra
  ]);
  const primary = scout.verdict === 'scout-first' && scout.option
    ? withReasons(scout.option, [...(advisoryOnly ? ['COACH_LOCKED' as const] : []), 'SCOUT_SAVES_PREMIUM', ...optionReasons(top, ranked, context)])
    : directPrimary;
  const candidates = ranked.slice(0, ROUTING_WEIGHTS.maxCandidates)
    .map((entry) => entry === top ? directPrimary : withReasons(entry.option, optionReasons(entry, ranked, context)));
  const nextBest = nextBestEntry ? withReasons(nextBestEntry.option, optionReasons(nextBestEntry, ranked, context)) : undefined;
  const baselineAgreement = !baselineOption ? 'no-baseline' : sameRoute(primary, baselineOption) ? 'agree' : 'disagree';

  return finish({
    ...base,
    ...(baselineOption ? { baseline: baselineOption } : {}),
    primary,
    ...(nextBest ? { nextBest } : {}),
    ...(waitOption ? { waitOption } : {}),
    ...(scout.option && scout.verdict !== 'scout-first' ? { scoutOption: scout.option } : scout.verdict === 'scout-first' ? { scoutOption: primary } : {}),
    candidates,
    strength: { recommendation: strength, evidence: top.belief.evidence },
    baselineAgreement,
    scout: scout.summary,
    unknowns: unknowns.list()
  });
}

// --- Scoring ------------------------------------------------------------------------------

interface ScoreContext {
  readonly input: RecommendRouteInput;
  readonly capabilities: RoutingCapabilitySet;
  readonly weights: PostureWeights;
  readonly urgencyMult: number;
  readonly possession: Map<string, SeatPossession>;
  readonly unknowns: UnknownSet;
  readonly owner?: string;
}

interface ExpandedRoute { readonly playerInstanceId: string; readonly model?: string; readonly effort?: string }

/** Every model × supported effort the seat's live catalog (already narrowed by R4 constraints) allows. */
function expandTargets(seat: RouteSeat, constraints: RouteConstraints | undefined): ExpandedRoute[] {
  if (seat.transport !== 'controlled' || seat.capability.models.length === 0) {
    return [{ playerInstanceId: seat.instanceId, ...(seat.activeModel ? { model: seat.activeModel } : {}) }];
  }
  const routes: ExpandedRoute[] = [];
  for (const model of [...seat.capability.models].sort((a, b) => a.id.localeCompare(b.id))) {
    const efforts = constraints?.effort
      ? [constraints.effort]
      : model.supportedEfforts.length ? [...model.supportedEfforts].sort() : [undefined];
    for (const effort of efforts) routes.push({ playerInstanceId: seat.instanceId, model: model.id, ...(effort ? { effort } : {}) });
  }
  return routes;
}

function scoreTarget(context: ScoreContext, seat: RouteSeat, route: ExpandedRoute, forcedKind?: RouteOption['kind']): Scored | undefined {
  const { input, capabilities } = context;
  const kind = forcedKind ?? optionKind(seat, context.owner);
  if (!kind) return undefined;
  const pool = seat.resourcePool;
  const belief = computeBelief(
    { playerType: seat.playerType, ...(route.model ? { modelId: route.model } : {}), ...(route.effort ? { effort: route.effort } : {}) },
    { taskClass: input.profile.taskClass, difficulty: input.profile.difficulty, role: 'player', gameId: input.gameId },
    input.priorPack,
    input.filmIndex,
    input.now,
    { baselinePreference: input.baselinePreference, ...(pool !== 'unknown' ? { resourcePool: pool } : {}) }
  );
  const q = context.weights.q === 'lo' ? belief.firstPass.lo : belief.firstPass.mean;
  const sigmaQ = Math.max(0, belief.firstPass.hi - belief.firstPass.lo) / (2 * Z20);
  const durationMin = belief.durationMin.confidence === 'unknown' ? undefined : belief.durationMin.p50;
  if (durationMin === undefined) context.unknowns.add('duration', belief.key);

  const economicsPool: RoutingEconomicsPool | undefined = pool === 'unknown' ? undefined : input.economics.pools[pool];
  const windows: WindowCostView[] = [];
  let priceUnknown = pool === 'unknown' || !economicsPool;
  if (economicsPool) {
    for (const window of economicsPool.windows) {
      if (window.price === 'unknown') priceUnknown = true;
      windows.push(windowView(pool, window, capabilities.economics));
    }
  }
  if (priceUnknown && capabilities.economics) context.unknowns.add('resource-price', pool);

  const burnWindows = belief.burn.confidence === 'unknown' ? [] : belief.burn.windows;
  const pricedBurnKnown = burnWindows.length > 0;
  if (!pricedBurnKnown) context.unknowns.add('burn', belief.key);
  let pricedBurn = 0;
  let sigmaBurnCost = 0;
  let interrupt = 0;
  for (const burn of burnWindows) {
    const window = economicsPool?.windows.find((candidate) => candidate.id === burn.window);
    const cost = windowCost(economicsPool, window, burn.window, burn.p50, durationMin, capabilities.economics);
    const price = cost / Math.max(burn.p50, 1e-9);
    pricedBurn += cost;
    sigmaBurnCost += price * Math.max(0, burn.p75 - burn.p25) / 1.349;
    const view = windows.find((entry) => entry.window === burn.window);
    if (view) Object.assign(view, { burnP50: round(burn.p50), cost: round(cost) });
    else windows.push({ pool, window: burn.window, price: capabilities.economics ? 'unknown' : 'not-entitled', burnP50: round(burn.p50), cost: round(cost) });
    if (capabilities.economics && window && window.remainingFraction !== undefined && window.timeToResetMin !== undefined) {
      const preShare = durationMin === undefined ? 1 : Math.min(1, window.timeToResetMin / Math.max(durationMin, 1e-9));
      if (burn.p50 * preShare > window.remainingFraction) interrupt = Math.max(interrupt, ROUTING_WEIGHTS.interrupt.p50Over);
      else if (burn.p75 * preShare > window.remainingFraction) interrupt = Math.max(interrupt, ROUTING_WEIGHTS.interrupt.p75Over);
    }
  }

  const queueDelayUnknown = kind === 'queue';
  if (queueDelayUnknown) context.unknowns.add('queue-delay', seat.instanceId);
  const seatPossession = context.possession.get(seat.instanceId) ?? {
    seat: seat.instanceId, tier: 'none' as const, base: 0, ageMin: 0, continuity: POSSESSION_CONSTANTS.continuity.unknown, continuityState: 'unknown' as const, value: 0
  };
  const target: RouteTargetView = {
    playerType: belief.target.playerType,
    ...(belief.target.lineage ? { lineage: belief.target.lineage } : {}),
    modelId: belief.target.modelId,
    effort: belief.target.effort
  };
  const option: RouteOption = {
    kind,
    target,
    route: { playerInstanceId: seat.instanceId, ...(route.model ? { model: route.model } : {}), ...(route.effort ? { effort: route.effort } : {}) },
    resourcePool: pool,
    belief: {
      evidence: belief.evidence,
      source: belief.source,
      nPrior: belief.nPrior,
      nLocalEff: belief.nLocalEff,
      pooled: belief.pooled,
      ...(belief.priorNode ? { priorNode: belief.priorNode } : {}),
      ...(belief.inheritedFrom ? { inheritedFrom: belief.inheritedFrom } : {}),
      ...(belief.drift ? { drift: belief.drift } : {}),
      burnConfidence: belief.burn.confidence,
      ...(durationMin !== undefined ? { durationP50Min: round(durationMin) } : {})
    },
    reasons: []
  };
  return {
    option, key: belief.key, q, sigmaQ, sigmaBurnCost, pricedBurn, pricedBurnKnown, priceUnknown, queueDelayUnknown,
    belief, seat, possession: seatPossession, ...(durationMin !== undefined ? { durationMin } : {}),
    windows, interrupt, delayMin: 0, kind
  };
}

/** §11.1 per-window cost through R1's canonical primitive. Economics off → neutral price 1.0. */
function windowCost(
  pool: RoutingEconomicsPool | undefined,
  window: RoutingEconomicsWindow | undefined,
  windowId: string,
  burnP50: number,
  durationMin: number | undefined,
  economics: boolean
): number {
  if (!economics || !pool || !window || window.price === 'unknown' || window.timeToResetMin === undefined) return burnP50;
  // Unknown duration: the Play is treated as finishing before the reset (pre-reset price, floor applies).
  const duration = durationMin ?? 1e-6;
  const cost = estimatePoolEconomicCost(pool, [{ window: windowId, fraction: burnP50 }], duration);
  return cost === 'unknown' ? burnP50 : cost;
}

function windowView(pool: string, window: RoutingEconomicsWindow, economics: boolean): WindowCostView {
  if (!economics) return { pool, window: window.id, price: 'not-entitled' };
  return {
    pool,
    window: window.id,
    ...(window.remainingFraction !== undefined ? { remainingFraction: round(window.remainingFraction) } : {}),
    ...(window.timeToResetMin !== undefined ? { timeToResetMin: round(window.timeToResetMin) } : {}),
    ...(window.pacePressure !== undefined ? { pacePressure: round(window.pacePressure) } : {}),
    price: window.price === 'unknown' ? 'unknown' : round(window.price),
    ...(window.floor === 4 ? { floor: 'CRITICAL' as const } : window.floor === 1.5 ? { floor: 'LOW' as const } : {})
  };
}

/** Neutral cost for burn-UNKNOWN options, then reacquisition, C_eff and U (§5.4). */
function finalizeUtilities(scored: Scored[], context: ScoreContext, freshIntel: boolean, maxPossession: number): void {
  const known = scored.filter((entry) => entry.pricedBurnKnown).map((entry) => entry.pricedBurn).sort((a, b) => a - b);
  const neutral = known.length ? median(known) : ROUTING_WEIGHTS.unknownBurnNeutralCost;
  const { weights, urgencyMult } = context;
  for (const entry of scored) {
    const neutralCost = !entry.pricedBurnKnown;
    const pricedBurn = neutralCost ? neutral : entry.pricedBurn;
    const reacquisition = reacquisitionCost(maxPossession, entry.possession.value, context.input.profile.taskClass, pricedBurn, freshIntel);
    const units = pricedBurn + reacquisition;
    const effective = units * (1 + (1 - entry.q) * ROUTING_WEIGHTS.repairRho);
    const risk = entry.interrupt
      + (entry.priceUnknown || neutralCost || entry.queueDelayUnknown ? ROUTING_WEIGHTS.unknownRisk : 0);
    const utility = entry.q - weights.lambdaC * effective - weights.lambdaD * urgencyMult * (entry.delayMin / 60) - weights.lambdaR * risk;
    const dUdq = 1 + weights.lambdaC * units * ROUTING_WEIGHTS.repairRho;
    const dUdC = weights.lambdaC * (1 + (1 - entry.q) * ROUTING_WEIGHTS.repairRho);
    const sigmaU = Math.sqrt((dUdq * entry.sigmaQ) ** 2 + (dUdC * entry.sigmaBurnCost) ** 2);
    entry.pricedBurn = pricedBurn;
    (entry.option as { scores?: RouteOptionScores }).scores = {
      utility: round(utility),
      firstPass: entry.belief.firstPass,
      q: round(entry.q),
      cost: {
        units: round(units),
        neutral: neutralCost,
        pricedBurn: round(pricedBurn),
        reacquisition: round(reacquisition),
        effective: round(effective),
        windows: entry.windows
      },
      possession: { tier: entry.possession.tier, value: entry.possession.value },
      delayMin: round(entry.delayMin),
      risk: round(risk),
      interrupt: round(entry.interrupt),
      sigmaU: round(sigmaU)
    };
  }
}

function strengthBetween(a: Scored, b: Scored): 'clear' | 'lean' | 'toss-up' {
  const delta = utility(a) - utility(b);
  const sigma = Math.sqrt(sigmaU(a) ** 2 + sigmaU(b) ** 2);
  if (delta <= 0) return 'toss-up';
  if (sigma === 0) return 'clear';
  if (delta > ROUTING_WEIGHTS.strength.clear * sigma) return 'clear';
  if (delta > ROUTING_WEIGHTS.strength.lean * sigma) return 'lean';
  return 'toss-up';
}

function optionKind(seat: RouteSeat, owner: string | undefined): RouteOption['kind'] | undefined {
  if (seat.state === 'ready') return owner && owner !== seat.instanceId ? 'handoff' : 'send';
  // A busy seat takes the Play only as the context owner's queue (existing Q2.10D semantics).
  if (seat.state === 'busy' && owner === seat.instanceId && seat.transport === 'controlled' && seat.supportsQueue !== false) return 'queue';
  return undefined;
}

function baselineKind(action: RecommendationBaseline['action']): RouteOption['kind'] {
  return action === 'queue' ? 'queue' : action === 'handoff' ? 'handoff' : 'send';
}

function isPremium(seat: RouteSeat): boolean {
  return seat.executionType !== 'scout-formation' && seat.executionType !== 'direct-shell' && seat.playerType !== 'terminal';
}

function findBaseline(scored: readonly Scored[], baseline: RecommendationBaseline): Scored | undefined {
  return scored.find((entry) => entry.option.route.playerInstanceId === baseline.playerInstanceId
    && (entry.option.route.model ?? '') === (baseline.model ?? '')
    && (entry.option.route.effort ?? '') === (baseline.effort ?? ''));
}

function specializedOption(baseline: RecommendationBaseline, seat: RouteSeat | undefined, unknowns: UnknownSet): RouteOption {
  unknowns.add('baseline-unscored', baseline.playerInstanceId);
  return {
    kind: baselineKind(baseline.action),
    target: {
      playerType: baseline.playerType ?? seat?.playerType ?? 'unknown',
      modelId: baseline.model ?? 'provider-default',
      effort: baseline.effort ?? 'provider-managed'
    },
    route: { playerInstanceId: baseline.playerInstanceId, ...(baseline.model ? { model: baseline.model } : {}), ...(baseline.effort ? { effort: baseline.effort } : {}) },
    resourcePool: seat?.resourcePool ?? 'unknown',
    reasons: []
  };
}

/** Better utility wins; ties go to more possession, then a ready seat, then the stable instance order. */
function prefer(a: Scored, b: Scored): boolean {
  if (a.possession.value !== b.possession.value) return a.possession.value > b.possession.value;
  if (a.kind !== b.kind) return a.kind === 'send' || (a.kind === 'handoff' && b.kind === 'queue');
  return a.seat.instanceId.localeCompare(b.seat.instanceId) < 0;
}

function compareScored(a: Scored, b: Scored): number {
  return utility(b) - utility(a) || a.key.localeCompare(b.key) || a.seat.instanceId.localeCompare(b.seat.instanceId);
}

function utility(entry: Scored): number {
  return entry.option.scores?.utility ?? Number.NEGATIVE_INFINITY;
}

function sigmaU(entry: Scored): number {
  return entry.option.scores?.sigmaU ?? 0;
}

// --- Scout ROI ------------------------------------------------------------------------------

interface ScoutEvaluation {
  readonly verdict: 'scout-first' | 'no-scout' | 'not-considered';
  readonly option?: RouteOption;
  readonly noScoutFieldPossessed: boolean;
  readonly summary: RoutingRecommendation['scout'];
}

function evaluateScout(
  context: ScoreContext,
  primary: Scored,
  intel: ScoutIntelAssessment | undefined,
  freshIntel: boolean,
  maxPossession: number
): ScoutEvaluation {
  const { input, capabilities, weights, urgencyMult } = context;
  const scout = input.scout;
  const blocked = (blockedBy: NonNullable<RoutingRecommendation['scout']['blockedBy']>, noScoutFieldPossessed = false): ScoutEvaluation => ({
    verdict: blockedBy === 'field-possessed' ? 'no-scout' : 'not-considered',
    noScoutFieldPossessed,
    summary: { considered: false, blockedBy, ...(intel ? { intel } : {}), verdict: blockedBy === 'field-possessed' ? 'no-scout' : 'not-considered' }
  });
  // §10.3: field already possessed, or fresh existing intel covers the topic. Existing intel is never gated.
  if (maxPossession >= POSSESSION_CONSTANTS.fieldPossessed || freshIntel) return blocked('field-possessed', true);
  if (input.profile.role !== 'player') return blocked('scout-role');
  if (input.profile.scoutNeed.reconnaissancePrimary) return blocked('reconnaissance-play');
  if (input.profile.postScoutContinuation) return blocked('post-scout-continuation');
  if (!capabilities.scoutExecutionAllowed) return blocked('not-entitled');
  if (!scout.seatReady) return blocked('not-ready');
  if (scout.pRuns === undefined) { context.unknowns.add('scout-readiness', 'scout'); return blocked('readiness-unknown'); }
  if (scout.delayMin === undefined) { context.unknowns.add('scout-delay', 'scout'); return blocked('delay-unknown'); }

  const tier = 'cheap-formation' as const;
  const pRight = scoutPRight(tier, scout.pRightEvidence);
  const scores = primary.option.scores as RouteOptionScores;
  // S57.7 §531: a neutral (UNKNOWN) burn is never saved burn. Cold-start ROI cannot fire from it.
  const primaryPricedBurn = scores.cost.neutral ? 0 : scores.cost.pricedBurn;
  const primaryPlayCost = scores.cost.neutral ? 0 : scores.cost.units;
  const value = scoutNetValue({
    pRuns: scout.pRuns,
    pRight,
    reconFraction: reconFraction({
      taskClass: input.profile.taskClass,
      materialEvidenceGap: input.profile.scoutNeed.materialEvidenceGap,
      maxPossession,
      freshIntel
    }),
    primaryPricedBurn,
    primaryPlayCost,
    taskClass: input.profile.taskClass,
    difficulty: input.profile.difficulty,
    lambdaC: weights.lambdaC,
    lambdaD: weights.lambdaD,
    urgencyMult,
    delayMin: scout.delayMin,
    scoutPriceCost: scout.scoutPriceCost
  });
  const option: RouteOption = {
    ...primary.option,
    kind: 'scout-first',
    scout: { tier, ...(intel && intel.state !== 'fresh' ? { intelRef: intel.reportKey } : {}) },
    scores: {
      ...scores,
      utility: round(scores.utility + value.net),
      delayMin: round(scores.delayMin + scout.delayMin)
    },
    reasons: []
  };
  const scoutFirst = value.net > SCOUT_ROI_CONSTANTS.netMargin && input.profile.urgency !== 'now';
  const verdict = scoutFirst ? 'scout-first' : 'no-scout';
  return {
    verdict,
    option,
    noScoutFieldPossessed: false,
    summary: {
      considered: true,
      ...(input.profile.urgency === 'now' && value.net > SCOUT_ROI_CONSTANTS.netMargin ? { blockedBy: 'urgency-now' as const } : {}),
      ...(intel ? { intel } : {}),
      pRuns: scout.pRuns,
      pRight,
      value,
      verdict
    }
  };
}

// --- Wait for reset (§15.5) ----------------------------------------------------------------

function waitFor(primary: Scored, context: ScoreContext): RouteOption | undefined {
  const { input, weights, urgencyMult, capabilities } = context;
  if (!capabilities.economics || !primary.pricedBurnKnown || primary.seat.resourcePool === 'unknown') return undefined;
  const pool = input.economics.pools[primary.seat.resourcePool];
  const scores = primary.option.scores;
  if (!pool || !scores) return undefined;
  let best: { option: RouteOption; gain: number } | undefined;
  for (const window of pool.windows) {
    if (window.stale || window.resetsAt === undefined || window.timeToResetMin === undefined || window.price === 'unknown') continue;
    const fiveHour = window.lengthMin <= 300;
    if (fiveHour && window.timeToResetMin > ROUTING_WEIGHTS.wait.fiveHourMaxMin) continue;
    if (!fiveHour && (!weights.weeklyWait || input.profile.urgency === 'now' || window.timeToResetMin > ROUTING_WEIGHTS.wait.weeklyMaxHours * 60)) continue;
    const burn = primary.belief.burn.windows.find((entry) => entry.window === window.id);
    if (!burn) continue;
    // After the reset this window's burn is charged at the fresh-window price 1.0.
    const current = scores.cost.windows.find((entry) => entry.window === window.id)?.cost ?? burn.p50;
    const pricedAfter = scores.cost.pricedBurn - current + burn.p50;
    const units = pricedAfter + scores.cost.reacquisition;
    const effective = units * (1 + (1 - primary.q) * ROUTING_WEIGHTS.repairRho);
    const risk = Math.max(0, scores.risk - scores.interrupt);
    const delayHours = window.timeToResetMin / 60;
    const waitUtility = primary.q - weights.lambdaC * effective - weights.lambdaD * urgencyMult * delayHours - weights.lambdaR * risk;
    const gain = waitUtility - scores.utility;
    if (scores.interrupt < ROUTING_WEIGHTS.wait.interruptAt && gain < ROUTING_WEIGHTS.wait.improveBy) continue;
    const option: RouteOption = {
      ...primary.option,
      kind: 'wait-for-reset',
      wait: { pool: pool.pool, window: window.id, resetsAt: window.resetsAt, cycleToken: window.resetsAt },
      scores: {
        ...scores,
        utility: round(waitUtility),
        cost: { ...scores.cost, units: round(units), pricedBurn: round(pricedAfter), effective: round(effective) },
        delayMin: round(window.timeToResetMin),
        risk: round(risk),
        interrupt: 0
      },
      reasons: orderReasons(['RESET_SOON', ...(scores.interrupt >= ROUTING_WEIGHTS.wait.interruptAt ? ['INTERRUPT_RISK' as const] : [])])
    };
    if (!best || gain > best.gain) best = { option, gain };
  }
  return best?.option;
}

// --- Reasons --------------------------------------------------------------------------------

function optionReasons(entry: Scored, ranked: readonly Scored[], context: ScoreContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const scores = entry.option.scores;
  if (entry.possession.value >= POSSESSION_CONSTANTS.fieldPossessed) reasons.push('FIELD_POSSESSED');
  if (context.capabilities.economics) {
    for (const window of entry.windows) {
      if (window.floor === 'CRITICAL') reasons.push('SCARCITY_CRITICAL');
      if (window.floor === 'LOW') reasons.push('SCARCITY_LOW');
      const fiveHour = window.window === 'five_hour';
      if (fiveHour && window.timeToResetMin !== undefined && window.timeToResetMin <= ROUTING_WEIGHTS.wait.fiveHourMaxMin) {
        reasons.push('RESET_SOON');
        if (window.pacePressure !== undefined && window.pacePressure < 1) reasons.push('EXPIRING_5H');
      }
    }
    if (entry.priceUnknown) reasons.push('RESOURCE_UNKNOWN');
    // The strongest-q alternative was avoided because its own pool is scarce.
    const bestQ = [...ranked].sort((a, b) => b.q - a.q || a.key.localeCompare(b.key))[0];
    if (bestQ && bestQ !== entry && bestQ.q > entry.q && bestQ.seat.resourcePool !== entry.seat.resourcePool) {
      for (const window of bestQ.windows) {
        const scarce = window.floor !== undefined || (typeof window.price === 'number' && window.price > 1);
        if (!scarce) continue;
        if (window.window === 'weekly') reasons.push('WEEKLY_SCARCE');
        if (window.window === 'five_hour') reasons.push('FIVE_HOUR_SCARCE');
      }
    }
  }
  if ((scores?.interrupt ?? 0) >= ROUTING_WEIGHTS.wait.interruptAt) reasons.push('INTERRUPT_RISK');
  const topQ = Math.max(...ranked.map((candidate) => candidate.q));
  if (entry.q >= topQ) reasons.push('BEST_FIT');
  if (entry.belief.drift) reasons.push('DRIFT_SUSPECTED');
  if (entry.belief.source === 'inherited') reasons.push('NEW_MODEL_INHERITED');
  if (entry.belief.evidence === 'prior-only') reasons.push('PRIOR_ONLY');
  if (entry.belief.evidence === 'thin') reasons.push('THIN_EVIDENCE');
  return reasons;
}

function withReasons(option: RouteOption, reasons: readonly ReasonCode[]): RouteOption {
  return { ...option, reasons: orderReasons([...option.reasons, ...reasons]) };
}

function sameRoute(a: RouteOption, b: RouteOption): boolean {
  return a.kind !== 'scout-first' && a.kind !== 'wait-for-reset'
    && a.route.playerInstanceId === b.route.playerInstanceId
    && (a.route.model ?? '') === (b.route.model ?? '')
    && (a.route.effort ?? '') === (b.route.effort ?? '');
}

// --- Assembly -------------------------------------------------------------------------------

function finish(body: Omit<RoutingRecommendation, 'id'>): RoutingRecommendation {
  const identity = {
    gameId: body.gameId,
    clientRef: body.clientRef,
    minute: Math.floor(body.computedAt / 60_000),
    profile: body.profile,
    authority: body.authority,
    versions: [body.engineVersion, body.weightsVersion, body.priorPackVersion],
    baseline: body.baseline?.route,
    primary: body.primary ? [body.primary.kind, body.primary.route, body.primary.scores?.utility] : undefined,
    candidates: body.candidates.map((option) => [option.route, option.scores?.utility])
  };
  const id = `rec_${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 20)}`;
  return { id, ...body };
}

class UnknownSet {
  private readonly facts = new Map<string, UnknownFact>();
  add(kind: UnknownFactKind, subject: string): void {
    this.facts.set(`${kind}|${subject}`, { kind, subject });
  }
  list(): UnknownFact[] {
    return [...this.facts.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
  }
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// --- Film digest ----------------------------------------------------------------------------

/**
 * The shadow digest written into the Film decision event at real dispatch. It names
 * recommended options; it never claims an outcome for any of them. Only the chosen
 * route ever receives an outcome event.
 */
export function recommendationDigest(rec: RoutingRecommendation): RoutingFilmRecommendationDigest {
  return {
    v: 1,
    id: rec.id,
    engineVersion: rec.engineVersion,
    weightsVersion: rec.weightsVersion,
    priorPackVersion: rec.priorPackVersion,
    computedAt: rec.computedAt,
    posture: rec.posture.value,
    authority: { mode: rec.authority.mode, advisoryOnly: rec.authority.advisoryOnly, lockedBy: [...rec.authority.lockedBy] },
    capabilities: { ...rec.capabilities },
    ...(rec.baseline ? { baseline: optionDigest(rec.baseline) } : {}),
    ...(rec.primary ? { primary: optionDigest(rec.primary) } : {}),
    ...(rec.nextBest ? { nextBest: optionDigest(rec.nextBest) } : {}),
    ...(rec.waitOption ? { waitOption: optionDigest(rec.waitOption) } : {}),
    ...(rec.scoutOption ? { scoutOption: optionDigest(rec.scoutOption) } : {}),
    // Explicit fields: the Film digest stays exactly what R6 froze (R10's exposure is not a Film fact).
    strength: { recommendation: rec.strength.recommendation, evidence: rec.strength.evidence },
    baselineAgreement: rec.baselineAgreement,
    scoutVerdict: rec.scout.verdict,
    ...(rec.scout.value ? { scoutNet: rec.scout.value.net } : {}),
    unknowns: [...new Set(rec.unknowns.map((fact) => fact.kind))].sort()
  };
}

/** The predicted p50 burn per pool/window that the scores already carried; nothing is recomputed. */
function burnReceipt(option: RouteOption): { pool: string; window: string; p50: number }[] | undefined {
  const receipt = (option.scores?.cost.windows ?? [])
    .filter((window) => window.burnP50 !== undefined)
    .map((window) => ({ pool: window.pool, window: window.window, p50: window.burnP50 as number }));
  return receipt.length ? receipt : undefined;
}

function optionDigest(option: RouteOption): RoutingFilmRecommendationOption {
  return {
    kind: option.kind,
    playerType: option.target.playerType,
    ...(option.target.lineage ? { lineage: option.target.lineage } : {}),
    modelId: option.target.modelId,
    effort: option.target.effort,
    playerInstanceId: option.route.playerInstanceId,
    resourcePool: option.resourcePool,
    ...(option.scores ? {
      utility: option.scores.utility,
      firstPass: option.scores.firstPass.mean,
      cost: option.scores.cost.neutral ? 'unknown' as const : option.scores.cost.units,
      possession: option.scores.possession.value
    } : {}),
    ...(burnReceipt(option) ? { burn: burnReceipt(option) } : {}),
    ...(option.wait ? { wait: { ...option.wait } } : {}),
    ...(option.scout ? { scoutTier: option.scout.tier } : {}),
    reasons: [...option.reasons]
  };
}
