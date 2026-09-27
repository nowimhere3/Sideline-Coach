/**
 * R8 `optionToDecision` (S57.1 §13, §22): the single bridge from an R6 recommendation option to an
 * executable, existing `RoutingDecision`.
 *
 * Pure and deterministic. It consumes the option's own executable `route` (instance / model / effort)
 * and the action implied by its `kind`; it never re-runs the recommendation, never reselects a Player,
 * model or effort, and holds no eligibility logic. The only checks are "is this still true right now"
 * guards (the seat still exists in the same state, the model/effort are still in its catalog), so a
 * stale suggestion is refused rather than silently rerouted.
 *
 * `wait-for-reset` is not actionable here: R9 owns DeferredPlay / SCHEDULE.
 * `scout-first` maps onto the existing Scout decision shape, which the router already turns into the
 * Scout Formation dispatch and the one bounded post-Scout continuation.
 */

import type { PlayerRoutingCapability, RoutingDecision } from '../capability-types';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from '../scout-player-contract';
import { buildHandoffPreamble } from '../control-plane/context-affinity';
import type { RouteOption, RoutingRecommendation } from './recommend';

export type AdvisedChoice = 'recommended-primary' | 'recommended-next-best' | 'recommended-scout';
export type AcceptedDecidedBy = 'coach-accepted-primary' | 'coach-accepted-next-best' | 'coach-accepted-scout';

export const ADVISED_CHOICES: readonly AdvisedChoice[] = ['recommended-primary', 'recommended-next-best', 'recommended-scout'];

export function isAdvisedChoice(value: unknown): value is AdvisedChoice {
  return typeof value === 'string' && (ADVISED_CHOICES as readonly string[]).includes(value);
}

const DECIDED_BY: Readonly<Record<AdvisedChoice, AcceptedDecidedBy>> = Object.freeze({
  'recommended-primary': 'coach-accepted-primary',
  'recommended-next-best': 'coach-accepted-next-best',
  'recommended-scout': 'coach-accepted-scout'
});

export interface OptionDecisionContext {
  readonly choice: AdvisedChoice;
  /** The existing AUTO decision for this same Play (its Game, label and context evidence). */
  readonly base: RoutingDecision;
  /** The roster the route is checked against. */
  readonly candidates: readonly PlayerRoutingCapability[];
  readonly names?: ReadonlyMap<string, string>;
  readonly scoutNeed: { readonly reconnaissancePrimary: boolean; readonly materialEvidenceGap: boolean };
  readonly now: number;
}

export type OptionDecisionRefusal =
  | 'no-option' | 'wait-not-actionable' | 'advisory-only' | 'not-a-disagreement' | 'choice-mismatch'
  | 'seat-unavailable' | 'route-stale' | 'context-unavailable';

export type OptionDecisionResult =
  | { readonly ok: true; readonly decision: RoutingDecision; readonly decidedBy: AcceptedDecidedBy }
  | { readonly ok: false; readonly reason: OptionDecisionRefusal };

const refuse = (reason: OptionDecisionRefusal): OptionDecisionResult => ({ ok: false, reason });

export function optionToDecision(
  rec: RoutingRecommendation,
  option: RouteOption | undefined,
  ctx: OptionDecisionContext
): OptionDecisionResult {
  if (!option) return refuse('no-option');
  if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');
  // Dad's explicit routing always wins: a locked or MANUAL route is advisory only and cannot be replaced.
  if (rec.authority.mode !== 'auto' || rec.authority.advisoryOnly) return refuse('advisory-only');
  const expected = ctx.choice === 'recommended-primary' ? rec.primary
    : ctx.choice === 'recommended-next-best' ? rec.nextBest
      : rec.scoutOption;
  if (!expected || option !== expected) return refuse('choice-mismatch');
  if (ctx.choice === 'recommended-primary' && rec.baselineAgreement !== 'disagree') return refuse('not-a-disagreement');
  const decidedBy = DECIDED_BY[ctx.choice];

  if (option.kind === 'scout-first') {
    const scout = ctx.candidates.find((candidate) => candidate.instanceId === SCOUT_PLAYER_INSTANCE_ID
      && candidate.playerType === SCOUT_PLAYER_TYPE
      && candidate.executionType === 'scout-formation'
      && candidate.transport === 'controlled'
      && candidate.state === 'ready');
    if (!scout) return refuse('seat-unavailable');
    return {
      ok: true,
      decidedBy,
      decision: {
        mode: 'auto',
        gameId: ctx.base.gameId,
        playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
        playerLabel: 'Scout',
        playerName: 'Scout',
        provider: SCOUT_PLAYER_TYPE,
        modelDisplayName: 'Scout Formation',
        reason: 'Scout first, as Sideline suggested.',
        stagedAt: ctx.now,
        transport: 'controlled',
        ...(ctx.base.playLabel ? { playLabel: ctx.base.playLabel } : {}),
        action: 'dispatch',
        rationale: {
          player: 'You accepted the Scout-first suggestion.',
          instance: 'The canonical Scout capability is ready for this Game.',
          model: 'Formation will select receivers from current verification and Combine evidence.',
          effort: 'Formation owns bounded subordinate Scout execution.'
        },
        summary: 'Scout · Sideline suggested reconnaissance first.',
        scoutNeed: {
          reconnaissancePrimary: ctx.scoutNeed.reconnaissancePrimary,
          materialEvidenceGap: ctx.scoutNeed.materialEvidenceGap,
          actionBlockedByUncertainty: false,
          boundedParallelReconUseful: false,
          scoutAvailable: true,
          reason: 'Recommended by Sideline routing and accepted by the Coach.'
        }
      }
    };
  }

  const seat = ctx.candidates.find((candidate) => candidate.instanceId === option.route.playerInstanceId);
  if (!seat || seat.executionType === 'scout-formation' || seat.executionType === 'direct-shell') return refuse('seat-unavailable');
  if (option.kind === 'queue' ? seat.state !== 'busy' : seat.state !== 'ready') return refuse('seat-unavailable');
  const model = option.route.model ? seat.capability.models.find((entry) => entry.id === option.route.model) : undefined;
  if (option.route.model && !model) return refuse('route-stale');
  if (option.route.effort && model && !model.supportedEfforts.includes(option.route.effort)) return refuse('route-stale');

  let contextPreamble: string | undefined;
  if (option.kind === 'handoff') {
    contextPreamble = ctx.base.contextPreamble;
    if (!contextPreamble && ctx.base.context?.state === 'owner') {
      contextPreamble = buildHandoffPreamble({
        ...(ctx.base.context.ownerName ? { ownerName: ctx.base.context.ownerName } : {}),
        ...(ctx.base.context.reportPath ? { report: { path: ctx.base.context.reportPath, mtime: 0 } } : {}),
        reason: 'owner-busy'
      });
    }
    if (!contextPreamble) return refuse('context-unavailable');
  }

  const name = ctx.names?.get(seat.instanceId) ?? seat.fieldLabel;
  return {
    ok: true,
    decidedBy,
    decision: {
      mode: 'auto',
      gameId: ctx.base.gameId,
      playerInstanceId: seat.instanceId,
      playerLabel: seat.fieldLabel,
      playerName: name,
      provider: seat.capability.provider || seat.playerType,
      ...(option.route.model ? { model: option.route.model } : {}),
      modelDisplayName: model?.displayName ?? 'Provider Default',
      ...(option.route.effort ? { effort: option.route.effort } : {}),
      reason: `${name} is Sideline's suggestion, and you chose it.`,
      stagedAt: ctx.now,
      transport: seat.transport,
      ...(ctx.base.playLabel ? { playLabel: ctx.base.playLabel } : {}),
      action: option.kind === 'send' ? 'dispatch' : option.kind,
      rationale: {
        player: 'You accepted the suggestion.',
        instance: `${seat.instanceId} (${name}) is the exact suggested seat.`,
        model: option.route.model ? `${option.route.model} as suggested.` : 'Provider default model.',
        effort: option.route.effort ? `${option.route.effort} as suggested.` : 'Provider default effort.'
      },
      summary: `${name} · Sideline's suggestion.`,
      ...(option.kind !== 'send' && ctx.base.context ? { context: ctx.base.context } : {}),
      ...(contextPreamble ? { contextPreamble } : {})
    }
  };
}
