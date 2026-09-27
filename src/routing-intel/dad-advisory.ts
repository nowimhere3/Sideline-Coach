/**
 * R8 Dad advisory view (S57.1 §16).
 *
 * At most one line, one subline and two actions (`USE`, `Dismiss`). Wording comes only from the closed
 * fixed templates below, keyed by the option's headline reason code; a code without a template shows no
 * subline (nothing is generated). Dad never sees prices, evidence counts or possession values. The one
 * number is R10's calibrated percent (S57.1 §12.2), and only when the recommendation carries
 * `strength.calibratedFirstPass` (graduated class, supported bin) and the primary's resource evidence is
 * not UNKNOWN (§18.2, §21). It is rounded here, at presentation only, and shown within 1–99%.
 *
 * Visibility: AUTO only, and only when the recommendation DISAGREES with the baseline AUTO pick. Never
 * under MANUAL or an explicit route lock (advisory-only). Whether the stage is open is the caller's gate;
 * this module holds no gate and no state.
 */

import type { ReasonCode } from './reasons';
import type { RoutingRecommendation } from './recommend';

export const DAD_LINE_MAX = 28;
export const DAD_SUBLINE_MAX = 40;

export interface DadAdvisoryView {
  readonly recommendationId: string;
  readonly line: string;
  readonly subline?: string;
  readonly primaryAction: 'USE';
  readonly dismissAction: 'DISMISS';
  /** The existing route choice `[USE]` sends. */
  readonly choice: 'recommended-primary';
}

const STRENGTH_WORD: Readonly<Record<'clear' | 'lean', string>> = Object.freeze({ clear: 'Strong pick', lean: 'Good pick' });

const cap = (value: string): string => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
const fit = (text: string, max: number): string => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Fixed templates (S57.1 §16 examples). Codes not listed have no subline. */
function subline(code: ReasonCode | undefined, primaryProvider: string, baselineProvider: string): string | undefined {
  switch (code) {
    case 'EXPIRING_5H': return `Uses ${primaryProvider} 5H before it resets`;
    case 'WEEKLY_SCARCE': return `Saves ${baselineProvider}'s scarce Weekly`;
    case 'FIVE_HOUR_SCARCE': return `Saves ${baselineProvider}'s scarce 5H`;
    case 'SCOUT_SAVES_PREMIUM': return `Scout first · saves ${primaryProvider} 5H`;
    case 'NO_SCOUT_FIELD_POSSESSED':
    case 'FIELD_POSSESSED': return 'Already knows this field';
    case 'PRIOR_ONLY': return 'Early pick · still learning';
    default: return undefined;
  }
}

/** Presentation-only rounding. A posterior mean is never certain, so Dad never sees 0% or 100%. */
export function dadPercent(probability: number): number {
  return Math.min(99, Math.max(1, Math.round(probability * 100)));
}

/** The Dad percent, or undefined (words) when calibration has not earned it or resource truth is UNKNOWN. */
export function dadCalibratedPercent(rec: RoutingRecommendation): number | undefined {
  const calibrated = rec.strength.calibratedFirstPass;
  const primary = rec.primary;
  if (calibrated === undefined || !Number.isFinite(calibrated) || !primary) return undefined;
  const resourceUnknown = primary.reasons.includes('RESOURCE_UNKNOWN')
    || (primary.scores?.cost.windows ?? []).some((window) => window.price === 'unknown');
  return resourceUnknown ? undefined : dadPercent(calibrated);
}

export function dadAdvisoryView(
  rec: RoutingRecommendation,
  ctx: { readonly names?: ReadonlyMap<string, string> } = {}
): DadAdvisoryView | undefined {
  if (rec.authority.mode !== 'auto' || rec.authority.advisoryOnly) return undefined;
  if (rec.baselineAgreement !== 'disagree') return undefined;
  const primary = rec.primary;
  if (!primary || primary.kind === 'wait-for-reset') return undefined;
  const strength = rec.strength.recommendation;
  if (strength === 'toss-up') return undefined; // a toss-up keeps the baseline; never advise on noise

  const who = primary.kind === 'scout-first'
    ? 'Scout'
    : ctx.names?.get(primary.route.playerInstanceId) ?? cap(primary.target.playerType);
  const percent = dadCalibratedPercent(rec);
  const headline = `Suggest ${who} · ${percent === undefined ? STRENGTH_WORD[strength] : `${percent}%`}`;
  const line = headline.length <= DAD_LINE_MAX ? headline : fit(`Suggest ${who}`, DAD_LINE_MAX);
  const text = subline(
    primary.reasons[0],
    cap(primary.target.playerType),
    cap(rec.baseline?.target.playerType ?? primary.target.playerType)
  );
  return {
    recommendationId: rec.id,
    line,
    ...(text ? { subline: fit(text, DAD_SUBLINE_MAX) } : {}),
    primaryAction: 'USE',
    dismissAction: 'DISMISS',
    choice: 'recommended-primary'
  };
}
