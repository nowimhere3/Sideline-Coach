/**
 * R6 reason codes (S57.1 §13).
 *
 * Stable machine codes only. Human copy (Dad chip templates, Dev narrative) belongs
 * to R7/R8 and is deliberately absent here. Every option's reasons are emitted in
 * one fixed priority order, so the headline (first code) is deterministic.
 */

export const REASON_CODES = [
  // S57.1 §13, verbatim.
  'COACH_LOCKED',
  'SCOUT_SAVES_PREMIUM',
  'NO_SCOUT_FIELD_POSSESSED',
  'FIELD_POSSESSED',
  'EXPIRING_5H',
  'WEEKLY_SCARCE',
  'FIVE_HOUR_SCARCE',
  'SCARCITY_CRITICAL',
  'SCARCITY_LOW',
  'RESET_SOON',
  'INTERRUPT_RISK',
  'BEST_FIT',
  'TOSS_UP_KEPT_BASELINE',
  'RESOURCE_UNKNOWN',
  'DRIFT_SUSPECTED',
  'NEW_MODEL_INHERITED',
  'PRIOR_ONLY',
  'THIN_EVIDENCE',
  // R6 additions (additive; see S57.17): a specialized route kind (Scout reconnaissance,
  // Terminal) is kept as-is, and the basic capability profile carries only the baseline.
  'SPECIALIZED_ROUTE_KEPT',
  'BASELINE_ONLY'
] as const;

export type ReasonCode = typeof REASON_CODES[number];

const PRIORITY: ReadonlyMap<ReasonCode, number> = new Map(REASON_CODES.map((code, index) => [code, index]));

/** Deduplicated, in the one fixed priority order. */
export function orderReasons(codes: Iterable<ReasonCode>): ReasonCode[] {
  return [...new Set(codes)].sort((a, b) => (PRIORITY.get(a) ?? 0) - (PRIORITY.get(b) ?? 0));
}

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && PRIORITY.has(value as ReasonCode);
}
