/**
 * Coach Refresh V0.1 — bounded maintenance for the Scout depth chart.
 *
 * WAS: Humans manually initiated Combine refreshes.
 *
 * IS: Coach Refresh provides a bounded reusable mechanism for identifying due
 * Scout prospects and invoking existing Combine tryout machinery. It owns
 * only the maintenance decision and hard caps; discovery, execution, failure
 * classification, evidence, and scorecard writes remain owned by Combine.
 * Formation continues to read the resulting READY scorecards fresh.
 *
 * WHY: Future Scout-as-Player routing should rely on maintained evidence
 * rather than forcing the human to maintain the Scout bench.
 *
 * WILL BE / FUTURE: policy may trigger this callable at lifecycle boundaries
 * such as startup, pre-Scout routing, scheduled maintenance, or explicit
 * human refresh. Trigger policy remains separate from Scout tryout truth.
 *
 * S31 Slice 4: the product trigger now exists and is an explicit human action in
 * Settings, owned by scout-bootstrap.ts (one consent, then manual refreshes). It
 * calls this function unchanged, so the limits and the 7-day due rule below still
 * decide WHAT is tried; they never decide WHETHER to spend. Startup, timer and
 * scheduled triggers are deliberately still not built.
 */
import {
  runScoutCombine,
  type CombineBudget,
  type CombineCompletion,
  type CombineRequest
} from './scout-combine';

export const COACH_REFRESH_LIMITS = Object.freeze({ maxTryouts: 5, maxConcurrency: 2 });

export interface CoachRefreshRequest extends Omit<CombineRequest, 'budget' | 'selectionPolicy'> {
  readonly budget?: CombineBudget;
}

/**
 * Inspect current discovery + scorecard truth and give only due prospects a
 * bounded Combine tryout. The existing seven-day Combine staleness window is
 * also the minimum retry window for callback/UNKNOWN/LIMITED results, which
 * prevents an immediate retry loop without inventing a second health clock.
 */
export function runCoachRefresh(request: CoachRefreshRequest): Promise<CombineCompletion> {
  const requestedTryouts = request.budget?.maxTryouts ?? COACH_REFRESH_LIMITS.maxTryouts;
  const requestedConcurrency = request.budget?.maxConcurrency ?? COACH_REFRESH_LIMITS.maxConcurrency;
  const budget = {
    maxTryouts: Math.min(requestedTryouts, COACH_REFRESH_LIMITS.maxTryouts),
    maxConcurrency: Math.min(requestedConcurrency, COACH_REFRESH_LIMITS.maxConcurrency)
  };
  return runScoutCombine({
    ...request,
    budget,
    selectionPolicy: 'refresh-due'
  });
}
