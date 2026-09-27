/**
 * R3 FilmIndex: a pure, deterministic projection of R2 Routing Film events into
 * belief observations.
 *
 * R3/R5 boundary: an R2 `completed` outcome is NOT a clean first pass. First-pass
 * evidence exists only when a resolution is supplied (R5 owns attribution and
 * resolution; synthetic fixtures may supply them). Unresolved observations still
 * carry burn and duration evidence, which do not depend on attribution.
 *
 * R2 does not record the Play profile (task class, difficulty). Profiles join by
 * `clientRef` when a source supplies them; otherwise the observation's class and
 * difficulty are UNKNOWN and comparability treats them conservatively.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import type { LedgerOutcome } from '../control-plane/work-ledger';
import { SCOUT_PLAYER_TYPE } from '../scout-player-contract';
import type { PriorPackSource } from './prior-pack';
import { normalizeTarget, type NormalizedTarget } from './lineage';
import type {
  RoutingFilmBurnObservation,
  RoutingFilmDecisionEvent,
  RoutingFilmEvent,
  RoutingFilmOutcomeEvent
} from './routing-film';

export type BeliefRole = 'player' | 'scout';

export interface ObservedPlayProfile {
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly role?: BeliefRole;
}

/**
 * R5-owned resolution of one Play (S57.1 §5.1, §8). R3 only consumes it.
 * - `clean`: completed, no player-defect repair within the window → y = 1
 * - `player-defect`: failed for player reasons, or a repair attributed to the Player → y = 0
 * - `excluded` / `pending`: contributes nothing
 */
export interface FirstPassResolution {
  readonly state: 'clean' | 'player-defect' | 'excluded' | 'pending';
  /** Who established a `player-defect`: outcome fact, Coach, envelope, or a rule. */
  readonly source?: 'outcome' | 'coach' | 'envelope' | 'rule';
  readonly confidence?: 'high' | 'medium' | 'low';
}

/** S57.1 §5.2 attribution weights. Medium rule confidence is treated as low (no S57.1 rule emits it for player-defect). */
export function attributionWeight(resolution: FirstPassResolution): number {
  if (resolution.state === 'clean') return 1;
  if (resolution.source === 'rule') return resolution.confidence === 'high' ? 0.6 : 0.3;
  return 1;
}

export interface FilmObservation {
  readonly clientRef: string;
  readonly gameId: string;
  /** Decision time (ms); ordering and age are taken from here. */
  readonly at: number;
  readonly target: NormalizedTarget;
  readonly role: BeliefRole;
  readonly resourcePool: string;
  readonly profile?: ObservedPlayProfile;
  readonly ledgerOutcome: LedgerOutcome;
  readonly durationMs: number;
  readonly burn: readonly RoutingFilmBurnObservation[];
  /** Present only for resolved, skill-eligible outcomes. */
  readonly firstPass?: { readonly y: 0 | 1; readonly attribution: number };
}

export interface FilmIndexDiagnostic {
  readonly clientRef: string;
  readonly reason: 'orphan-outcome' | 'pending-decision' | 'duplicate-decision' | 'duplicate-outcome' | 'resolution-inconsistent';
}

export interface FilmIndex {
  readonly observations: readonly FilmObservation[];
  readonly diagnostics: readonly FilmIndexDiagnostic[];
}

export interface FilmIndexJoins {
  readonly profiles?: Readonly<Record<string, ObservedPlayProfile>>;
  readonly resolutions?: Readonly<Record<string, FirstPassResolution>>;
}

/** Outcomes that are never Player skill evidence (S57.1 §5.1). */
const NEVER_SKILL: ReadonlySet<LedgerOutcome> = new Set<LedgerOutcome>(['interrupted', 'unknown', 'not-sent']);
const PLAYER_FAILURE_OUTCOMES: ReadonlySet<LedgerOutcome> = new Set<LedgerOutcome>(['failed', 'partial', 'blocked']);

export function buildFilmIndex(
  events: readonly RoutingFilmEvent[],
  source: PriorPackSource,
  joins: FilmIndexJoins = {}
): FilmIndex {
  const diagnostics: FilmIndexDiagnostic[] = [];
  const decisions = new Map<string, RoutingFilmDecisionEvent>();
  const outcomes = new Map<string, RoutingFilmOutcomeEvent>();
  // Deterministic regardless of journal order: earliest event per clientRef wins, as in R2's recorder.
  const ordered = [...events].sort((a, b) => a.at - b.at || a.clientRef.localeCompare(b.clientRef) || a.kind.localeCompare(b.kind));
  for (const event of ordered) {
    if (event.kind === 'decision') {
      if (decisions.has(event.clientRef)) diagnostics.push({ clientRef: event.clientRef, reason: 'duplicate-decision' });
      else decisions.set(event.clientRef, event);
    } else if (event.kind !== 'outcome') {
      continue; // R5 link / attribution / resolution events carry no dispatch or outcome truth
    } else if (outcomes.has(event.clientRef)) {
      diagnostics.push({ clientRef: event.clientRef, reason: 'duplicate-outcome' });
    } else {
      outcomes.set(event.clientRef, event);
    }
  }

  const observations: FilmObservation[] = [];
  for (const [clientRef, decision] of decisions) {
    const outcome = outcomes.get(clientRef);
    if (!outcome) { diagnostics.push({ clientRef, reason: 'pending-decision' }); continue; }
    const chosen = decision.chosen;
    const profile = joins.profiles?.[clientRef];
    const playerType = chosen.playerType ?? 'unknown';
    const role: BeliefRole = profile?.role === 'scout' || playerType === SCOUT_PLAYER_TYPE ? 'scout' : 'player';
    const target = normalizeTarget(source, { playerType, modelId: chosen.model, effort: chosen.effort });
    const firstPass = resolveFirstPass(outcome.ledgerOutcome, joins.resolutions?.[clientRef]);
    if (firstPass === 'inconsistent') diagnostics.push({ clientRef, reason: 'resolution-inconsistent' });
    observations.push({
      clientRef,
      gameId: decision.gameId,
      at: decision.at,
      target,
      role,
      resourcePool: chosen.resourcePool,
      ...(profile ? { profile: { taskClass: profile.taskClass, difficulty: profile.difficulty, ...(profile.role ? { role: profile.role } : {}) } } : {}),
      ledgerOutcome: outcome.ledgerOutcome,
      durationMs: outcome.durationMs,
      burn: outcome.burn,
      ...(firstPass && firstPass !== 'inconsistent' ? { firstPass } : {})
    });
  }
  for (const clientRef of outcomes.keys()) {
    if (!decisions.has(clientRef)) diagnostics.push({ clientRef, reason: 'orphan-outcome' });
  }
  observations.sort((a, b) => a.at - b.at || a.clientRef.localeCompare(b.clientRef));
  diagnostics.sort((a, b) => a.clientRef.localeCompare(b.clientRef) || a.reason.localeCompare(b.reason));
  return { observations, diagnostics };
}

function resolveFirstPass(
  outcome: LedgerOutcome,
  resolution: FirstPassResolution | undefined
): FilmObservation['firstPass'] | 'inconsistent' | undefined {
  if (!resolution || NEVER_SKILL.has(outcome)) return undefined;
  if (resolution.state === 'clean') {
    return outcome === 'completed' ? { y: 1, attribution: attributionWeight(resolution) } : 'inconsistent';
  }
  if (resolution.state === 'player-defect') {
    return outcome === 'completed' || PLAYER_FAILURE_OUTCOMES.has(outcome)
      ? { y: 0, attribution: attributionWeight(resolution) }
      : 'inconsistent';
  }
  return undefined;
}
