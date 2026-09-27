/**
 * R3 Belief Engine (S57.1 §5.1–§5.5, §6.2, §11.7).
 *
 * RESEARCHED PRIOR + LOCAL FIELD EVIDENCE = CURRENT CAPABILITY BELIEF.
 * Beta-Binomial with hierarchical partial pooling. Pure: every input, including
 * the clock, is injected; the same inputs always give the same object. It ranks
 * nothing, recommends nothing and is not read by routing.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import type { BeliefRole, FilmIndex, FilmObservation } from './film-index';
import type { PriorPackSource } from './prior-pack';
import {
  normalizeTarget,
  resolvePrior,
  type BaselinePreference,
  type BeliefTarget,
  type NormalizedTarget,
  type PriorOrigin,
  type ResolvedPrior
} from './lineage';
import {
  BELIEF_CONSTANTS,
  BELIEF_ENGINE_VERSION,
  ageDays,
  comparabilityWeight,
  halfLifeDecay,
  poolingLambda,
  poolingLevel,
  pooledScale,
  type QueryProfile
} from './comparability';
import { estimateBurn, estimateDuration, type BurnEstimate, type DurationEstimate } from './burn';

export { BELIEF_ENGINE_VERSION, BELIEF_CONSTANTS };

export interface BeliefProfile {
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  /** Scout-role belief never mixes with Player-role belief (S57.1 §5.2). */
  readonly role?: BeliefRole;
  /** Enables the small same-Game bonus (S57.1 §5.2). */
  readonly gameId?: string;
}

export interface BeliefOptions {
  /**
   * Today's static depth chart, used only as the weakest prior (S57.1 §6.2).
   * Callers pass `PROVIDER_PREFERENCE`; R3 never assumes which Player types exist.
   */
  readonly baselinePreference: BaselinePreference;
  /** The seat's resource pool (R1 `resourcePoolForSeat`), for burn. */
  readonly resourcePool?: string;
}

export type EvidenceStrength = 'prior-only' | 'thin' | 'building' | 'established';

export interface CapabilityBelief {
  readonly engineVersion: string;
  readonly key: string;
  readonly target: { readonly playerType: string; readonly lineage?: string; readonly modelId: string; readonly effort: string };
  readonly role: BeliefRole;
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  /** Beta posterior mean and 20th / 80th percentiles. */
  readonly firstPass: { readonly mean: number; readonly lo: number; readonly hi: number };
  /** Prior pseudo-reps after inheritance and age decay. */
  readonly nPrior: number;
  /** Weighted local reps at this exact node. */
  readonly nLocalEff: number;
  /** Pooled pseudo-reps from siblings (≤ cap). */
  readonly pooled: number;
  readonly source: PriorOrigin;
  readonly priorMean: number;
  readonly priorNode?: string;
  readonly inheritedFrom?: string;
  readonly priorNote?: ResolvedPrior['note'];
  readonly priorPackVersion: string;
  readonly segmentVersion?: string;
  readonly evidence: EvidenceStrength;
  readonly drift?: 'suspected';
  readonly durationMin: DurationEstimate;
  readonly burn: BurnEstimate;
}

export interface FirstPassEvidence {
  readonly successes: number;
  readonly failures: number;
  readonly pooledSuccesses: number;
  readonly pooledFailures: number;
}

export function computeBelief(
  target: BeliefTarget,
  profile: BeliefProfile,
  priorPack: PriorPackSource,
  filmIndex: FilmIndex,
  now: number,
  options: BeliefOptions
): CapabilityBelief {
  const normalized = normalizeTarget(priorPack, target);
  const query: QueryProfile = {
    taskClass: profile.taskClass,
    difficulty: profile.difficulty,
    role: profile.role ?? 'player',
    ...(profile.gameId !== undefined ? { gameId: profile.gameId } : {})
  };
  const prior = resolvePrior(priorPack, normalized, profile.taskClass, profile.difficulty, options.baselinePreference);
  const nPrior = decayedStrength(prior, now);
  const alpha0 = prior.mean * nPrior;
  const beta0 = (1 - prior.mean) * nPrior;
  const observations = filmIndex.observations;

  const drift = detectDrift(normalized, query, observations, now, alpha0, beta0);
  const ownHalfLife = drift ? BELIEF_CONSTANTS.driftHalfLifeDays : BELIEF_CONSTANTS.filmHalfLifeDays;
  const evidence = accumulateFirstPass(normalized, query, observations, now, ownHalfLife);

  const alpha = alpha0 + evidence.successes + evidence.pooledSuccesses;
  const beta = beta0 + evidence.failures + evidence.pooledFailures;
  const nLocalEff = evidence.successes + evidence.failures;

  return {
    engineVersion: BELIEF_ENGINE_VERSION,
    key: normalized.key,
    target: {
      playerType: normalized.playerType,
      ...(normalized.lineage ? { lineage: normalized.lineage } : {}),
      modelId: normalized.modelId,
      effort: normalized.effort
    },
    role: query.role,
    taskClass: profile.taskClass,
    difficulty: profile.difficulty,
    firstPass: {
      mean: round(alpha / (alpha + beta)),
      lo: round(betaQuantile(0.2, alpha, beta)),
      hi: round(betaQuantile(0.8, alpha, beta))
    },
    nPrior: round(nPrior),
    nLocalEff: round(nLocalEff),
    pooled: round(evidence.pooledSuccesses + evidence.pooledFailures),
    source: prior.source,
    priorMean: prior.mean,
    ...(prior.priorNode ? { priorNode: prior.priorNode } : {}),
    ...(prior.inheritedFrom ? { inheritedFrom: prior.inheritedFrom } : {}),
    ...(prior.note ? { priorNote: prior.note } : {}),
    priorPackVersion: priorPack.packVersion,
    ...(prior.segmentVersion ? { segmentVersion: prior.segmentVersion } : {}),
    evidence: evidenceStrength(nLocalEff),
    ...(drift ? { drift: 'suspected' as const } : {}),
    durationMin: estimateDuration(normalized, query, observations, now, prior.node, nPrior),
    burn: estimateBurn(normalized, options.resourcePool, query, observations, now, prior.node, nPrior)
  };
}

/** S57.1 §6.2: n₀_eff = n₀ · 0.5^(age / 180 d). Baseline priors are policy, not research, and do not age. */
export function decayedStrength(prior: ResolvedPrior, now: number): number {
  if (!prior.researchedAt) return prior.strength;
  const age = now - Date.parse(prior.researchedAt);
  return prior.strength * halfLifeDecay(age, BELIEF_CONSTANTS.priorHalfLifeDays);
}

/** S57.1 §12.1 Evidence Strength from own-node local reps. */
export function evidenceStrength(nLocalEff: number): EvidenceStrength {
  if (nLocalEff <= 0) return 'prior-only';
  if (nLocalEff < 5) return 'thin';
  if (nLocalEff < 20) return 'building';
  return 'established';
}

/**
 * S57.1 §5.3 sums. Own node: w·y. Ancestors: λ_level · w · y, then scaled so the
 * total pooled mass never exceeds the cap (a busy sibling cannot drown a node).
 */
export function accumulateFirstPass(
  target: NormalizedTarget,
  query: QueryProfile,
  observations: readonly FilmObservation[],
  now: number,
  ownHalfLifeDays: number = BELIEF_CONSTANTS.filmHalfLifeDays,
  exclude: ReadonlySet<string> = new Set()
): FirstPassEvidence {
  let successes = 0;
  let failures = 0;
  let pooledS = 0;
  let pooledF = 0;
  for (const observation of observations) {
    if (!observation.firstPass || exclude.has(observation.clientRef)) continue;
    const level = poolingLevel(target, query.role, observation);
    if (!level) continue;
    const halfLife = level === 'own' ? ownHalfLifeDays : BELIEF_CONSTANTS.filmHalfLifeDays;
    const w = comparabilityWeight(observation, query, now, halfLife) * observation.firstPass.attribution;
    if (w <= 0) continue;
    if (level === 'own') {
      if (observation.firstPass.y === 1) successes += w; else failures += w;
    } else {
      const lw = w * poolingLambda(level);
      if (observation.firstPass.y === 1) pooledS += lw; else pooledF += lw;
    }
  }
  const scale = pooledScale(pooledS + pooledF);
  return { successes, failures, pooledSuccesses: pooledS * scale, pooledFailures: pooledF * scale };
}

/**
 * S57.1 §5.5: with ≥ 5 recent comparable (same task class, own node, resolved)
 * outcomes, test the latest 5 against the 5th–95th band of the belief built from
 * everything before them. Because the latest 5 are binary, the band is the
 * posterior *predictive* one (Beta-Binomial, n = 5): drift is suspected when
 * the observed success count sits in either 5% tail. Comparing a 5-sample mean
 * with the band of the posterior mean itself would flag healthy nodes routinely.
 * Recomputed from Film each time, so the flag clears once the newest five land
 * back inside the band. Never resets evidence.
 */
export function detectDrift(
  target: NormalizedTarget,
  query: QueryProfile,
  observations: readonly FilmObservation[],
  now: number,
  alpha0: number,
  beta0: number
): boolean {
  const window = 5;
  const comparable = observations.filter((o) => o.firstPass
    && o.role === query.role
    && o.target.key === target.key
    && (o.profile?.taskClass ?? 'default') === query.taskClass
    && now - o.at >= 0
    && ageDays(now - o.at) <= BELIEF_CONSTANTS.foldWindowDays);
  if (comparable.length < window) return false;
  const recent = comparable.slice(-window);
  const excluded = new Set(recent.map((o) => o.clientRef));
  const reference = accumulateFirstPass(target, query, observations, now, BELIEF_CONSTANTS.filmHalfLifeDays, excluded);
  const a = alpha0 + reference.successes + reference.pooledSuccesses;
  const b = beta0 + reference.failures + reference.pooledFailures;
  const k = recent.reduce((sum, o) => sum + (o.firstPass?.y ?? 0), 0);
  let lower = 0;
  let upper = 0;
  for (let j = 0; j <= window; j += 1) {
    const pmf = Math.exp(betaBinomialLogPmf(j, window, a, b));
    if (j <= k) lower += pmf;
    if (j >= k) upper += pmf;
  }
  return lower < 0.05 || upper < 0.05;
}

function betaBinomialLogPmf(k: number, n: number, a: number, b: number): number {
  const logChoose = logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  return logChoose + logBeta(k + a, n - k + b) - logBeta(a, b);
}

function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

// ── Beta distribution (deterministic, closed-form numerics) ──────────────────

/** Inverse regularized incomplete beta by bisection; 60 halvings ≈ 1e-18 precision. */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaContinuedFraction(x, a, b) / a
    : 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) sum += LANCZOS[i] / (x + i + 1);
  const t = x + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
