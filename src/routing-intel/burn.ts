/**
 * R3 BurnEstimate and duration estimate (S57.1 §11.7).
 *
 * Only isolated Film evidence counts: per-window R2 burn observations with
 * isolation `high` or `medium`, in the target seat's own resource pool. `low`
 * (same-pool overlap) and `none` are audit-only. A zero delta is censored at
 * ≤ 1%: excluded from the estimate, counted as a small Play. Every estimate is a
 * range with a confidence word; with no evidence and no prior it is UNKNOWN.
 */

import type { FilmObservation } from './film-index';
import type { NormalizedTarget } from './lineage';
import type { PriorNode } from './prior-pack';
import {
  comparabilityWeight,
  poolingLambda,
  poolingLevel,
  pooledScale,
  type QueryProfile
} from './comparability';

export type EstimateConfidence = 'high' | 'medium' | 'low';

export const BURN_CONSTANTS = Object.freeze({
  /** S57.1 §11.7: empirical quantiles need Σw ≥ 5; otherwise the range is widened 1.5×. */
  empiricalMinWeight: 5,
  highConfidenceMinWeight: 15,
  highConfidenceMinHighShare: 0.5,
  widenFactor: 1.5,
  /** Floor on a thin range's log half-width, so one sample never reads as exact (×/÷ 1.5). */
  minLogSpread: Math.log(1.5),
  /** S57.1 §11.7: Δ above 3× the comparable p75 is possible external usage. */
  outlierFactor: 3,
  outlierMinSamples: 4
});

export interface WindowBurnEstimate {
  readonly pool: string;
  readonly window: string;
  readonly windowLengthMin: number;
  /** Fractions of the window (0..1). */
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly confidence: EstimateConfidence;
  readonly basis: 'prior' | 'comparable-film' | 'blended';
  /** Σ comparability weight of the samples used. */
  readonly weight: number;
  readonly samples: number;
  /** Zero-delta (≤ 1%) observations: excluded from the estimate. */
  readonly censoredSmall: number;
  readonly outliersDropped: number;
}

export interface BurnEstimate {
  readonly pool: string;
  readonly confidence: EstimateConfidence | 'unknown';
  readonly windows: readonly WindowBurnEstimate[];
}

export type DurationEstimate =
  | { readonly confidence: 'unknown' }
  | {
      readonly p25: number;
      readonly p50: number;
      readonly p75: number;
      readonly confidence: EstimateConfidence;
      readonly basis: 'prior' | 'comparable-film' | 'blended';
      readonly weight: number;
      readonly samples: number;
    };

interface Sample { readonly value: number; readonly weight: number; readonly high: boolean }

interface LogEstimate {
  readonly p25: number; readonly p50: number; readonly p75: number;
  readonly confidence: EstimateConfidence;
  readonly basis: 'prior' | 'comparable-film' | 'blended';
  readonly weight: number;
  readonly samples: number;
}

export function estimateBurn(
  target: NormalizedTarget,
  resourcePool: string | undefined,
  query: QueryProfile,
  observations: readonly FilmObservation[],
  now: number,
  prior: PriorNode | undefined,
  priorStrength: number
): BurnEstimate {
  const pool = resourcePool ?? 'unknown';
  if (pool === 'unknown') return { pool, confidence: 'unknown', windows: [] };

  type Acc = { windowLengthMin: number; own: Sample[]; pooled: Sample[]; censored: number };
  const byWindow = new Map<string, Acc>();
  for (const observation of observations) {
    if (observation.ledgerOutcome === 'not-sent') continue;
    const level = poolingLevel(target, query.role, observation);
    if (!level) continue;
    const weight = comparabilityWeight(observation, query, now) * poolingLambda(level);
    if (weight <= 0) continue;
    for (const burn of observation.burn) {
      if (burn.pool !== pool || (burn.isolation !== 'high' && burn.isolation !== 'medium')) continue;
      if (burn.remainingPercentDelta === undefined) continue;
      const acc = byWindow.get(burn.window) ?? { windowLengthMin: burn.windowLengthMin, own: [], pooled: [], censored: 0 };
      byWindow.set(burn.window, acc);
      if (burn.remainingPercentDelta <= 0 || burn.censoredAtMostPercent !== undefined) { acc.censored += 1; continue; }
      (level === 'own' ? acc.own : acc.pooled).push({ value: burn.remainingPercentDelta / 100, weight, high: burn.isolation === 'high' });
    }
  }

  const windowIds = [...new Set([...byWindow.keys(), ...Object.keys(prior?.burn ?? {})])].sort();
  const windows: WindowBurnEstimate[] = [];
  for (const window of windowIds) {
    const acc = byWindow.get(window);
    const samples = acc ? capPooled(acc.own, acc.pooled) : [];
    const { kept, dropped } = dropOutliers(samples);
    const priorRange = prior?.burn?.[window];
    const estimate = logEstimate(kept, priorRange ? { range: priorRange, strength: priorStrength } : undefined, 1);
    if (!estimate) continue;
    windows.push({
      pool,
      window,
      windowLengthMin: acc?.windowLengthMin ?? 0,
      ...estimate,
      censoredSmall: acc?.censored ?? 0,
      outliersDropped: dropped
    });
  }
  return { pool, confidence: weakest(windows.map((w) => w.confidence)), windows };
}

/** Wall-clock minutes of completed comparable Plays. */
export function estimateDuration(
  target: NormalizedTarget,
  query: QueryProfile,
  observations: readonly FilmObservation[],
  now: number,
  prior: PriorNode | undefined,
  priorStrength: number
): DurationEstimate {
  const own: Sample[] = [];
  const pooled: Sample[] = [];
  for (const observation of observations) {
    if (observation.ledgerOutcome !== 'completed' || !(observation.durationMs > 0)) continue;
    const level = poolingLevel(target, query.role, observation);
    if (!level) continue;
    const weight = comparabilityWeight(observation, query, now) * poolingLambda(level);
    if (weight <= 0) continue;
    (level === 'own' ? own : pooled).push({ value: observation.durationMs / 60_000, weight, high: true });
  }
  const estimate = logEstimate(capPooled(own, pooled), prior?.durationMin ? { range: prior.durationMin, strength: priorStrength } : undefined, Infinity);
  return estimate ?? { confidence: 'unknown' };
}

function capPooled(own: readonly Sample[], pooled: readonly Sample[]): Sample[] {
  const scale = pooledScale(pooled.reduce((sum, s) => sum + s.weight, 0));
  return [...own, ...pooled.map((s) => ({ ...s, weight: s.weight * scale }))];
}

function dropOutliers(samples: readonly Sample[]): { kept: Sample[]; dropped: number } {
  if (samples.length < BURN_CONSTANTS.outlierMinSamples) return { kept: [...samples], dropped: 0 };
  const p75 = weightedQuantile(samples.map((s) => ({ value: s.value, weight: s.weight })), 0.75);
  const kept = samples.filter((s) => s.value <= BURN_CONSTANTS.outlierFactor * p75);
  return { kept, dropped: samples.length - kept.length };
}

/**
 * S57.1 §11.7 log-scale shrinkage:
 * μ = (n₀·log(prior p50) + Σ wᵢ·log xᵢ) / (n₀ + Σ wᵢ).
 * Range: weighted empirical quantiles when Σw ≥ 5; otherwise the prior range
 * (or, with no prior, the thin empirical range) widened 1.5× around the centre.
 */
function logEstimate(
  samples: readonly Sample[],
  prior: { range: readonly [number, number, number]; strength: number } | undefined,
  ceiling: number
): LogEstimate | undefined {
  const totalWeight = samples.reduce((sum, s) => sum + s.weight, 0);
  const priorWeight = prior ? prior.strength : 0;
  if (totalWeight <= 0 && !prior) return undefined;

  const logs = samples.map((s) => ({ value: Math.log(s.value), weight: s.weight }));
  const mu = (priorWeight * (prior ? Math.log(prior.range[1]) : 0) + logs.reduce((sum, s) => sum + s.weight * s.value, 0))
    / (priorWeight + totalWeight);

  let lo: number;
  let hi: number;
  if (totalWeight >= BURN_CONSTANTS.empiricalMinWeight) {
    lo = weightedQuantile(logs, 0.25);
    hi = weightedQuantile(logs, 0.75);
  } else {
    const baseLo = prior ? Math.log(prior.range[0]) : (logs.length ? weightedQuantile(logs, 0.25) : mu);
    const baseHi = prior ? Math.log(prior.range[2]) : (logs.length ? weightedQuantile(logs, 0.75) : mu);
    const spreadLo = Math.max((mu - baseLo) * BURN_CONSTANTS.widenFactor, BURN_CONSTANTS.minLogSpread);
    const spreadHi = Math.max((baseHi - mu) * BURN_CONSTANTS.widenFactor, BURN_CONSTANTS.minLogSpread);
    lo = mu - spreadLo;
    hi = mu + spreadHi;
  }
  lo = Math.min(lo, mu);
  hi = Math.max(hi, mu);

  const highWeight = samples.filter((s) => s.high).reduce((sum, s) => sum + s.weight, 0);
  const confidence: EstimateConfidence = totalWeight >= BURN_CONSTANTS.highConfidenceMinWeight
    && highWeight / totalWeight >= BURN_CONSTANTS.highConfidenceMinHighShare
    ? 'high'
    : totalWeight >= BURN_CONSTANTS.empiricalMinWeight ? 'medium' : 'low';
  return {
    p25: round(Math.min(Math.exp(lo), ceiling)),
    p50: round(Math.min(Math.exp(mu), ceiling)),
    p75: round(Math.min(Math.exp(hi), ceiling)),
    confidence,
    basis: totalWeight <= 0 ? 'prior' : prior ? 'blended' : 'comparable-film',
    weight: round(totalWeight),
    samples: samples.length
  };
}

/** Lower weighted quantile over (value, weight); deterministic tie order by value. */
function weightedQuantile(items: readonly { value: number; weight: number }[], q: number): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, s) => sum + s.weight, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= q * total) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

function weakest(values: readonly EstimateConfidence[]): EstimateConfidence | 'unknown' {
  if (values.length === 0) return 'unknown';
  if (values.includes('low')) return 'low';
  if (values.includes('medium')) return 'medium';
  return 'high';
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
