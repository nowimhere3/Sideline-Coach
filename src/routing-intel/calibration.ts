/**
 * R10 calibration graduation (S57.1 §12.3, as adjudicated by S57.27 Option 1).
 *
 * Pure and derived: every verdict is a function of the Routing Film (the durable truth), the prior
 * pack and a weekly evaluation instant. Nothing here is persisted, scored or ranked. A class that
 * graduates only AUTHORIZES the existing posterior mean (Model A); there is no fitted recalibration.
 *
 *   sample     chosen-route Plays of one task class whose first pass resolved (clean / player-defect)
 *              with the prediction R6 FROZE at recommendation time; never recomputed from today's belief
 *   G1         N ≥ 30
 *   G2         Brier strictly beats the class's pooled in-sample base rate (float ties fail)
 *   G3         3 equal-width bins; a bin with n ≥ 5 is supported and must sit within ±10 pp;
 *              sparse bins (1–4) neither pass nor fail; no minimum count of supported bins
 *   display    after graduation a percent is exposed only for a prediction in a supported bin
 *   weekly     evaluated at the weekly instant from Film events at or before it; a later failure
 *              un-graduates back to words
 *
 * Numbers are carried unrounded (only the existing 1e-6 determinism rounding upstream applies).
 */

import type { TaskClassification } from '../capability-types';
import { buildAttributedFilmIndex, indexFilmPlays } from './attribution';
import { normalizeTarget } from './lineage';
import type { PriorPackSource } from './prior-pack';
import type { RoutingRecommendation } from './recommend';
import type { RoutingFilmDecisionEvent, RoutingFilmEvent, RoutingFilmRecommendationOption } from './routing-film';

export const CALIBRATION_VERSION = 'r10-calibration-1';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CALIBRATION_GATE = Object.freeze({
  /** §12.3: resolved outcomes per task class, across all targets. */
  minResolved: 30,
  bins: 3,
  /** A bin is supported at this n (the existing R7 `SHADOW_MIN_N.calibrationBin`). */
  supportedBinMin: 5,
  /** ±10 pp, compared with a representation tolerance so |0.7 − 0.8| passes. */
  tolerance: 0.10,
  toleranceEpsilon: 1e-9,
  /** Brier must beat the base rate by more than float noise: an exact tie fails. */
  brierEpsilon: 1e-12,
  weekMs: 7 * DAY_MS,
  /** Weekly instants fall on Monday 00:00 UTC (1970-01-05 was a Monday). */
  weekAnchorMs: 4 * DAY_MS
});

export const TASK_CLASSES: readonly TaskClassification[] = Object.freeze(['architecture', 'implementation', 'quick', 'default']);

/** Only these kinds carry a per-target prediction the gate can bin. */
const CALIBRATED_KINDS: ReadonlySet<RoutingFilmRecommendationOption['kind']> = new Set(['send', 'queue', 'handoff']);

export type CalibrationStatus = 'insufficient-evidence' | 'not-graduated' | 'graduated' | 'un-graduated';

export type CalibrationFailure = 'insufficient-evidence' | 'brier-not-better' | 'bin-outside-tolerance';

export interface CalibrationSample {
  readonly clientRef: string;
  readonly taskClass: TaskClassification;
  /** The chosen route's first pass, frozen in the R6 digest at recommendation time. */
  readonly p: number;
  readonly y: 0 | 1;
}

export interface CalibrationBinReport {
  readonly index: number;
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly meanPredicted: number | null;
  readonly observedRate: number | null;
  /** |observed − mean predicted|; null when the bin is empty. */
  readonly error: number | null;
  readonly supported: boolean;
  /** Only a supported bin is tested; a sparse or empty bin is null (neither pass nor fail). */
  readonly passes: boolean | null;
}

export interface TaskClassCalibration {
  readonly taskClass: TaskClassification;
  readonly graduated: boolean;
  readonly n: number;
  readonly required: number;
  /** Resolved chosen routes in this class with no frozen prediction; reported, never counted. */
  readonly withoutPrediction: number;
  readonly baseRate: number | null;
  readonly brierModel: number | null;
  readonly brierBaseRate: number | null;
  readonly brierBeatsBaseRate: boolean;
  readonly bins: readonly CalibrationBinReport[];
  readonly reliabilityMet: boolean;
  /** Bins in which a graduated class may speak in percentages. */
  readonly supportedBins: readonly number[];
  readonly failures: readonly CalibrationFailure[];
}

export interface CalibrationEvaluation {
  readonly version: string;
  /** The weekly instant this evaluation stands for; Film events after it are not read. */
  readonly evaluatedAt: number;
  readonly classes: readonly TaskClassCalibration[];
}

export interface TaskClassGraduationView extends TaskClassCalibration {
  readonly status: CalibrationStatus;
  readonly previouslyGraduated: boolean;
}

export interface CalibrationReport {
  readonly version: string;
  readonly evaluatedAt: number;
  readonly previousEvaluatedAt: number;
  readonly nextEvaluationAt: number;
  readonly classes: readonly TaskClassGraduationView[];
  readonly gate: typeof CALIBRATION_GATE;
  readonly note: string;
}

/** The weekly evaluation instant at or before `now`. */
export function calibrationWeekStart(now: number): number {
  const { weekMs, weekAnchorMs } = CALIBRATION_GATE;
  return weekAnchorMs + Math.floor((now - weekAnchorMs) / weekMs) * weekMs;
}

/** Equal-width bins [0,1/3) [1/3,2/3) [2/3,1]; p = 1 falls in the top bin. */
export function calibrationBinIndex(p: number): number {
  return Math.min(CALIBRATION_GATE.bins - 1, Math.floor(p * CALIBRATION_GATE.bins));
}

type KeyOf = (target: { playerType?: string; modelId?: string; model?: string; effort?: string }) => string;

/** The first pass R6 recorded for the option that became the chosen target (never reconstructed). */
export function frozenChosenFirstPass(decision: RoutingFilmDecisionEvent, chosenKey: string, keyOf: KeyOf): number | undefined {
  const digest = decision.recommendation;
  if (!digest) return undefined;
  for (const option of [digest.primary, digest.baseline, digest.nextBest]) {
    if (option && CALIBRATED_KINDS.has(option.kind) && option.firstPass !== undefined && keyOf(option) === chosenKey) return option.firstPass;
  }
  return undefined;
}

/**
 * Chosen-route (p, y) pairs from Film events at or before `at`, with resolutions projected at `at`.
 * Player role only (S57.1 §5.2: Scout-role observations never mix with Player-role ones).
 */
export function calibrationSamples(
  events: readonly RoutingFilmEvent[],
  pack: PriorPackSource,
  at: number
): { readonly samples: readonly CalibrationSample[]; readonly withoutPrediction: Readonly<Record<string, number>> } {
  const visible = events.filter((event) => event.at <= at);
  const plays = indexFilmPlays(visible);
  const observed = new Map(buildAttributedFilmIndex(visible, pack, at).observations.map((observation) => [observation.clientRef, observation]));
  const keyOf: KeyOf = (target) => normalizeTarget(pack, { playerType: target.playerType ?? 'unknown', modelId: target.modelId ?? target.model, effort: target.effort }).key;
  const samples: CalibrationSample[] = [];
  const withoutPrediction: Record<string, number> = {};
  for (const [clientRef, play] of plays) {
    const observation = observed.get(clientRef);
    const firstPass = observation?.firstPass;
    const taskClass = play.decision.profile?.taskClass;
    if (!firstPass || !taskClass || observation.role === 'scout' || play.decision.profile?.role === 'scout') continue;
    const chosen = play.decision.chosen;
    const p = frozenChosenFirstPass(play.decision, keyOf({ playerType: chosen.playerType, model: chosen.model, effort: chosen.effort }), keyOf);
    if (p === undefined || !Number.isFinite(p) || p < 0 || p > 1) {
      withoutPrediction[taskClass] = (withoutPrediction[taskClass] ?? 0) + 1;
      continue;
    }
    samples.push({ clientRef, taskClass, p, y: firstPass.y });
  }
  return { samples, withoutPrediction };
}

/** The §12.3 gate for one task class over its (p, y) pairs, summed in the given (Film) order. */
export function evaluateTaskClass(taskClass: TaskClassification, samples: readonly CalibrationSample[], withoutPrediction = 0): TaskClassCalibration {
  const { minResolved, bins: binCount, supportedBinMin, tolerance, toleranceEpsilon, brierEpsilon } = CALIBRATION_GATE;
  const n = samples.length;
  const bins = Array.from({ length: binCount }, () => ({ n: 0, p: 0, y: 0 }));
  let ySum = 0;
  let brierSum = 0;
  for (const sample of samples) {
    ySum += sample.y;
    brierSum += (sample.p - sample.y) ** 2;
    const bin = bins[calibrationBinIndex(sample.p)];
    bin.n += 1;
    bin.p += sample.p;
    bin.y += sample.y;
  }
  const baseRate = n ? ySum / n : null;
  const brierModel = n ? brierSum / n : null;
  const brierBaseRate = baseRate === null ? null : baseRate * (1 - baseRate);
  const brierBeatsBaseRate = brierModel !== null && brierBaseRate !== null && brierBaseRate - brierModel > brierEpsilon;

  const binReports: CalibrationBinReport[] = bins.map((bin, index) => {
    const meanPredicted = bin.n ? bin.p / bin.n : null;
    const observedRate = bin.n ? bin.y / bin.n : null;
    const error = meanPredicted !== null && observedRate !== null ? Math.abs(observedRate - meanPredicted) : null;
    const supported = bin.n >= supportedBinMin;
    return {
      index, lo: index / binCount, hi: (index + 1) / binCount, n: bin.n, meanPredicted, observedRate, error, supported,
      passes: supported ? (error as number) <= tolerance + toleranceEpsilon : null
    };
  });
  const reliabilityMet = binReports.every((bin) => bin.passes !== false);
  const countMet = n >= minResolved;
  const failures: CalibrationFailure[] = [
    ...(countMet ? [] : ['insufficient-evidence' as const]),
    ...(countMet && !brierBeatsBaseRate ? ['brier-not-better' as const] : []),
    ...(countMet && !reliabilityMet ? ['bin-outside-tolerance' as const] : [])
  ];
  const graduated = failures.length === 0;
  return {
    taskClass, graduated, n, required: minResolved, withoutPrediction,
    baseRate, brierModel, brierBaseRate, brierBeatsBaseRate,
    bins: binReports, reliabilityMet,
    supportedBins: graduated ? binReports.filter((bin) => bin.supported).map((bin) => bin.index) : [],
    failures
  };
}

/** Every task class, evaluated at one weekly instant from Film events at or before it. */
export function evaluateCalibration(events: readonly RoutingFilmEvent[], pack: PriorPackSource, evaluatedAt: number): CalibrationEvaluation {
  const { samples, withoutPrediction } = calibrationSamples(events, pack, evaluatedAt);
  return {
    version: CALIBRATION_VERSION,
    evaluatedAt,
    classes: TASK_CLASSES.map((taskClass) => evaluateTaskClass(taskClass, samples.filter((sample) => sample.taskClass === taskClass), withoutPrediction[taskClass] ?? 0))
  };
}

/** The current weekly evaluation and the one before it (to name an un-graduation). Pure; recomputable at any time. */
export function buildCalibrationReport(events: readonly RoutingFilmEvent[], pack: PriorPackSource, now: number): CalibrationReport {
  const evaluatedAt = calibrationWeekStart(now);
  const previousEvaluatedAt = evaluatedAt - CALIBRATION_GATE.weekMs;
  const current = evaluateCalibration(events, pack, evaluatedAt);
  const previous = evaluateCalibration(events, pack, previousEvaluatedAt);
  return {
    version: CALIBRATION_VERSION,
    evaluatedAt,
    previousEvaluatedAt,
    nextEvaluationAt: evaluatedAt + CALIBRATION_GATE.weekMs,
    classes: current.classes.map((entry) => {
      const previouslyGraduated = previous.classes.find((candidate) => candidate.taskClass === entry.taskClass)?.graduated === true;
      const status: CalibrationStatus = entry.graduated ? 'graduated'
        : previouslyGraduated ? 'un-graduated'
          : entry.failures.includes('insufficient-evidence') ? 'insufficient-evidence' : 'not-graduated';
      return { ...entry, status, previouslyGraduated };
    }),
    gate: CALIBRATION_GATE,
    note: 'S57.1 §12.3 per task class, weekly, from frozen predictions on chosen routes only. A graduated class shows a percent only for predictions in a supported bin; this gate is separate from the §19.4 advisory-chip criteria and never satisfies them.'
  };
}

/**
 * Model A: the primary's own posterior mean, exposed only when its task class is graduated at the
 * current weekly instant, the option kind is one the gate bins, and its bin is supported.
 */
export function calibratedFirstPassFor(rec: RoutingRecommendation, evaluation: Pick<CalibrationEvaluation, 'classes'>): number | undefined {
  if (rec.profile.role === 'scout') return undefined;
  const cls = evaluation.classes.find((entry) => entry.taskClass === rec.profile.taskClass);
  const primary = rec.primary;
  if (!cls?.graduated || !primary?.scores || !CALIBRATED_KINDS.has(primary.kind)) return undefined;
  const p = primary.scores.firstPass.mean;
  if (!Number.isFinite(p) || p < 0 || p > 1) return undefined;
  return cls.supportedBins.includes(calibrationBinIndex(p)) ? p : undefined;
}

/** Adds `strength.calibratedFirstPass` when earned; otherwise returns the recommendation untouched. Never reorders. */
export function withCalibration(rec: RoutingRecommendation, evaluation: Pick<CalibrationEvaluation, 'classes'>): RoutingRecommendation {
  const calibratedFirstPass = calibratedFirstPassFor(rec, evaluation);
  return calibratedFirstPass === undefined ? rec : { ...rec, strength: { ...rec.strength, calibratedFirstPass } };
}
