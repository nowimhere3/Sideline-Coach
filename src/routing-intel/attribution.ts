/**
 * R5 Fix Attribution (S57.1 §8).
 *
 *   follow-up Play → link to parent when proven → ordered attribution → FirstPassResolution → R3
 *
 * A follow-up alone is never Player failure. Every function here is pure over Film events and an
 * injected clock; the only side effects live in `recordDispatchAttribution` / `settleResolutions`,
 * which write through the existing failure-isolated RoutingFilmRecorder (~/.sideline/routing-film.jsonl).
 * No prompt or report text is read or kept: wording arrives as boolean signals, paths as hashed keys.
 *
 * Attribution is written once, at the follow-up's dispatch. Resolution is a projection: it is
 * re-derived from those facts and `now`, so replay is exact and no scheduler exists.
 */

import type { InstanceLedgerEntry } from '../control-plane/work-ledger';
import {
  FIX_CAUSES,
  type FixCause,
  type FollowUpEvidence,
  type FollowUpLinkEvidence,
  type DispatchEvidence
} from '../control-plane/follow-up-evidence';
import type { PriorPackSource } from './prior-pack';
import { buildFilmIndex, type FilmIndex, type FirstPassResolution, type ObservedPlayProfile } from './film-index';
import type {
  RoutingFilmAttributionEvent,
  RoutingFilmConfidence,
  RoutingFilmDecisionEvent,
  RoutingFilmEvent,
  RoutingFilmLinkEvent,
  RoutingFilmOutcomeEvent,
  RoutingFilmRecorder,
  RoutingFilmResolutionState
} from './routing-film';

export const ATTRIBUTION_ENGINE_VERSION = 'r5-attribution-1';

/** S57.1 §5.1: 72 hours, or 3 later same-Game Plays touching the same files, whichever closes first. */
export const RESOLUTION_WINDOW_MS = 72 * 60 * 60_000;
export const RESOLUTION_LATER_PLAYS = 3;
/** S57.1 §8.2: touch overlap links only to a Play completed within 72 hours. */
export const LINK_TOUCH_WINDOW_MS = 72 * 60 * 60_000;

/** Failure classes that are never Player skill (routing-policy doctrine). */
const ENVIRONMENT_FAILURE_CLASSES: ReadonlySet<string> = new Set(['provider', 'auth', 'quota', 'harness', 'interrupted']);
const NEVER_SKILL_OUTCOMES: ReadonlySet<string> = new Set(['interrupted', 'unknown', 'not-sent']);

// --- Film views -----------------------------------------------------------------

export interface FilmPlay {
  readonly decision: RoutingFilmDecisionEvent;
  readonly outcome?: RoutingFilmOutcomeEvent;
}

/** First decision and first outcome per clientRef, matching R2's recorder and R3's index. */
export function indexFilmPlays(events: readonly RoutingFilmEvent[]): Map<string, FilmPlay> {
  const decisions = new Map<string, RoutingFilmDecisionEvent>();
  const outcomes = new Map<string, RoutingFilmOutcomeEvent>();
  for (const event of events) {
    if (event.kind === 'decision' && !decisions.has(event.clientRef)) decisions.set(event.clientRef, event);
    else if (event.kind === 'outcome' && !outcomes.has(event.clientRef)) outcomes.set(event.clientRef, event);
  }
  const plays = new Map<string, FilmPlay>();
  for (const [clientRef, decision] of decisions) {
    const outcome = outcomes.get(clientRef);
    plays.set(clientRef, outcome ? { decision, outcome } : { decision });
  }
  return plays;
}

function overlaps(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left?.length || !right?.length) return false;
  const set = new Set(left);
  return right.some((key) => set.has(key));
}

// --- Linking ---------------------------------------------------------------------

export interface FollowUpDispatch {
  readonly clientRef: string;
  readonly gameId: string;
  /** Dispatch time of the follow-up. */
  readonly at: number;
  readonly playerInstanceId?: string;
  readonly evidence: DispatchEvidence;
}

export interface FilmLink {
  readonly parentClientRef: string;
  readonly linkEvidence: FollowUpLinkEvidence;
}

/**
 * S57.1 §8.2, in this order (first proven wins), reusing existing authorities:
 *   1. Scout continuation → its Formation Play
 *   2. detectFollowUp + resolveContextOwner named a report or Play (named-report | incoming-report | latest-play)
 *   3. same-Game touch overlap with a Play completed within 72 h
 * The parent must be a Play of this Game that Film witnessed. Nothing provable → undefined.
 */
export function linkFollowUp(
  follow: FollowUpDispatch,
  plays: ReadonlyMap<string, FilmPlay>,
  ledger: readonly InstanceLedgerEntry[]
): FilmLink | undefined {
  const known = (clientRef: string | undefined): string | undefined => {
    if (!clientRef || clientRef === follow.clientRef) return undefined;
    const play = plays.get(clientRef);
    return play && play.decision.gameId === follow.gameId ? clientRef : undefined;
  };

  const scoutParent = known(follow.evidence.followUp.scoutParentClientRef);
  if (scoutParent) return { parentClientRef: scoutParent, linkEvidence: 'scout-continuation' };

  const owner = follow.evidence.followUp.owner;
  if (follow.evidence.followUp.detected === 'continuation' && owner
    && (owner.evidence === 'named-report' || owner.evidence === 'incoming-report' || owner.evidence === 'latest-play')) {
    const entry = ledger.find((candidate) => candidate.gameId === follow.gameId && candidate.playerInstanceId === owner.instanceId);
    let parent: string | undefined;
    if (owner.evidence === 'latest-play') {
      const candidates: { clientRef: string; at: number }[] = [];
      if (entry?.currentPlay) candidates.push({ clientRef: entry.currentPlay.clientRef, at: entry.currentPlay.startedAt });
      for (const recent of entry?.recentPlays ?? []) {
        if (recent.outcome !== 'not-sent') candidates.push({ clientRef: recent.clientRef, at: recent.finishedAt });
      }
      candidates.sort((a, b) => b.at - a.at || a.clientRef.localeCompare(b.clientRef));
      parent = candidates.map((candidate) => known(candidate.clientRef)).find(Boolean);
    } else {
      // A named/incoming report proves its author only through the report's own provenance or the Ledger's link.
      const viaLedger = entry?.reports.find((link) => link.path === owner.reportPath)?.clientRef;
      parent = known(owner.reportClientRef) ?? known(viaLedger);
    }
    if (parent) return { parentClientRef: parent, linkEvidence: owner.evidence };
  }

  const touched = follow.evidence.touchKeys;
  if (touched.length) {
    let best: { clientRef: string; finishedAt: number } | undefined;
    for (const [clientRef, play] of plays) {
      if (clientRef === follow.clientRef || play.decision.gameId !== follow.gameId || !play.outcome) continue;
      const finishedAt = play.outcome.finishedAt;
      if (finishedAt > follow.at || follow.at - finishedAt > LINK_TOUCH_WINDOW_MS) continue;
      if (!overlaps(play.decision.touchKeys, touched)) continue;
      if (!best || finishedAt > best.finishedAt || (finishedAt === best.finishedAt && clientRef < best.clientRef)) {
        best = { clientRef, finishedAt };
      }
    }
    if (best) return { parentClientRef: best.clientRef, linkEvidence: 'touch-overlap' };
  }
  return undefined;
}

// --- Ordered attribution -----------------------------------------------------------

export interface RuleAttribution {
  readonly cause: FixCause;
  readonly confidence: RoutingFilmConfidence;
  /** Absent when nothing matched. */
  readonly ruleId?: string;
}

export interface AttributionInput {
  readonly follow: { readonly clientRef: string; readonly touchKeys: readonly string[]; readonly followUp: FollowUpEvidence };
  readonly parent: FilmPlay;
  readonly plays: ReadonlyMap<string, FilmPlay>;
  /** The follow-up's dispatch time (bounds rule 2). */
  readonly at: number;
}

/**
 * S57.1 §8.3. Pure, ordered, first match wins. The default is `unattributed`; blame needs evidence.
 */
export function attributeFollowUp(input: AttributionInput): RuleAttribution {
  const { follow, parent, plays } = input;
  const signals = follow.followUp.signals;
  const parentOutcome = parent.outcome;
  const parentTouches = parent.decision.touchKeys;

  // 1. The parent failed for an environmental reason.
  if (parentOutcome && (ENVIRONMENT_FAILURE_CLASSES.has(parentOutcome.failureClass ?? '')
    || parentOutcome.ledgerOutcome === 'interrupted' || parentOutcome.ledgerOutcome === 'not-sent')) {
    return { cause: 'environment-drift', confidence: 'high', ruleId: 'R5-1' };
  }

  // 2. Another instance completed overlapping work between the parent and the follow-up.
  if (parentOutcome && parentTouches?.length) {
    for (const [clientRef, other] of plays) {
      if (clientRef === follow.clientRef || clientRef === parent.decision.clientRef) continue;
      if (other.decision.gameId !== parent.decision.gameId || !other.outcome) continue;
      if (other.decision.chosen.playerInstanceId === parent.decision.chosen.playerInstanceId) continue;
      if (other.outcome.ledgerOutcome !== 'completed') continue;
      if (other.outcome.finishedAt <= parentOutcome.finishedAt || other.outcome.finishedAt > input.at) continue;
      if (overlaps(parentTouches, other.decision.touchKeys)) {
        return { cause: 'upstream-change', confidence: 'medium', ruleId: 'R5-2' };
      }
    }
  }

  // 3. Post-Scout continuation; the follow-up names the Scout report and says it was wrong.
  const scoutKey = parent.decision.scoutReportKey;
  if (scoutKey && signals.correction
    && (follow.followUp.namedReportKey === scoutKey || signals.scoutEvidence)) {
    return { cause: 'bad-scout-evidence', confidence: 'medium', ruleId: 'R5-3' };
  }

  // 4. Change language without defect language: the ask moved.
  if (signals.change && !signals.defect) return { cause: 'prompt-change', confidence: 'medium', ruleId: 'R5-4' };

  // 5. Names the next stage/step of a plan.
  if (signals.planStage) return { cause: 'planned-continuation', confidence: 'high', ruleId: 'R5-5' };

  // 6. The parent lacked context and the follow-up supplies a report/file it did not have.
  const parentLackedContext = parent.decision.context?.state === 'unknown' || parent.decision.routeAction === 'handoff';
  if (parentLackedContext) {
    const parentKeys = parentTouches ?? [];
    const suppliesReport = follow.followUp.namedReportKey !== undefined
      && follow.followUp.namedReportKey !== parent.decision.context?.reportKey;
    const suppliesFile = follow.touchKeys.some((key) => !parentKeys.includes(key));
    if (suppliesReport || suppliesFile) return { cause: 'missing-context', confidence: 'low', ruleId: 'R5-6' };
  }

  // 7. Defect language on the same files, and nothing above matched.
  if (signals.defect && overlaps(follow.touchKeys, parentTouches)) {
    return { cause: 'player-defect', confidence: 'low', ruleId: 'R5-7' };
  }

  return { cause: 'unattributed', confidence: 'low' };
}

// --- Authoritative overrides -----------------------------------------------------------

/** A Coach correction. R7 will call this from the Dev Mode chips; R5 owns only the data seam. */
export function coachAttributionEvent(input: {
  clientRef: string;
  parentClientRef: string;
  gameId: string;
  cause: FixCause;
  at: number;
}): RoutingFilmAttributionEvent {
  return {
    schemaVersion: 1, kind: 'attribution', at: input.at, clientRef: input.clientRef, gameId: input.gameId,
    parentClientRef: input.parentClientRef, cause: input.cause, source: 'coach', confidence: 'high'
  };
}

export interface EffectiveAttribution {
  readonly clientRef: string;
  readonly parentClientRef: string;
  readonly cause: FixCause;
  readonly source: 'rule' | 'coach' | 'envelope';
  readonly confidence: RoutingFilmConfidence;
  readonly ruleId?: string;
  readonly at: number;
}

/**
 * One winning attribution per linked follow-up. Coach and envelope outrank any rule; among
 * authoritative events the last valid one for the pair wins. Events for a pair Film never linked
 * are void: no link means nothing to attribute.
 */
export function effectiveAttributions(events: readonly RoutingFilmEvent[]): Map<string, EffectiveAttribution> {
  const links = new Map<string, RoutingFilmLinkEvent>();
  for (const event of events) {
    if (event.kind === 'link' && !links.has(event.clientRef)) links.set(event.clientRef, event);
  }
  const winners = new Map<string, { event: RoutingFilmAttributionEvent; index: number }>();
  events.forEach((event, index) => {
    if (event.kind !== 'attribution') return;
    const link = links.get(event.clientRef);
    if (!link || link.parentClientRef !== event.parentClientRef) return;
    if (!(FIX_CAUSES as readonly string[]).includes(event.cause)) return;
    const current = winners.get(event.clientRef);
    if (!current) { winners.set(event.clientRef, { event, index }); return; }
    const authoritative = event.source !== 'rule';
    const currentAuthoritative = current.event.source !== 'rule';
    if (currentAuthoritative && !authoritative) return;
    if (authoritative === currentAuthoritative && (event.at < current.event.at)) return;
    winners.set(event.clientRef, { event, index });
  });
  const result = new Map<string, EffectiveAttribution>();
  for (const [clientRef, { event }] of [...winners].sort(([a], [b]) => a.localeCompare(b))) {
    result.set(clientRef, {
      clientRef, parentClientRef: event.parentClientRef, cause: event.cause, source: event.source,
      confidence: event.confidence, ...(event.ruleId ? { ruleId: event.ruleId } : {}), at: event.at
    });
  }
  return result;
}

// --- First-pass resolution ---------------------------------------------------------------

export interface ResolutionDetail {
  readonly clientRef: string;
  readonly gameId: string;
  readonly state: RoutingFilmResolutionState | 'pending';
  readonly resolution: FirstPassResolution;
  /** When the window closed; absent while pending. */
  readonly closedAt?: number;
  readonly closedBy?: 'window-72h' | 'three-later-plays';
  readonly linkedFollowUps: number;
}

export interface FirstPassProjection {
  readonly resolutions: Readonly<Record<string, FirstPassResolution>>;
  readonly details: readonly ResolutionDetail[];
}

const weightRank = (attribution: EffectiveAttribution): number =>
  attribution.source !== 'rule' ? 1 : attribution.confidence === 'high' ? 0.6 : 0.3;

/**
 * Resolve every finished Play as of `now`. Pending Plays (window still open) are reported as
 * `pending` and contribute nothing to R3. Repairs count only when the follow-up's dispatch fell
 * inside the window.
 *
 *   clean     completed, window closed, no follow-up linked
 *   repaired  completed, a follow-up was attributed player-defect       → failure evidence (weighted)
 *   failed    failed/partial/blocked with player-defect repair, or failureClass 'player' → failure evidence
 *   excluded  environment/interrupted/not-sent, or a follow-up that is not a player-defect
 *             (unattributed, prompt-change, planned-continuation, …): credit is withheld, blame is not assigned
 */
export function projectFirstPassResolutions(events: readonly RoutingFilmEvent[], now: number): FirstPassProjection {
  const plays = indexFilmPlays(events);
  const attributions = effectiveAttributions(events);
  const linksByParent = new Map<string, RoutingFilmLinkEvent[]>();
  const seenLink = new Set<string>();
  for (const event of events) {
    if (event.kind !== 'link' || seenLink.has(event.clientRef)) continue;
    seenLink.add(event.clientRef);
    const list = linksByParent.get(event.parentClientRef) ?? [];
    list.push(event);
    linksByParent.set(event.parentClientRef, list);
  }

  const details: ResolutionDetail[] = [];
  for (const [clientRef, play] of [...plays].sort(([a], [b]) => a.localeCompare(b))) {
    const { decision, outcome } = play;
    if (!outcome) continue; // no outcome yet: nothing to resolve
    const gameId = decision.gameId;

    // Window: 72 h from completion, or the dispatch of the 3rd later same-Game Play touching the same files.
    const expiry = outcome.finishedAt + RESOLUTION_WINDOW_MS;
    const laterTouching: number[] = [];
    if (decision.touchKeys?.length) {
      for (const [otherRef, other] of plays) {
        if (otherRef === clientRef || other.decision.gameId !== gameId) continue;
        if (other.decision.at <= outcome.finishedAt) continue;
        if (overlaps(decision.touchKeys, other.decision.touchKeys)) laterTouching.push(other.decision.at);
      }
      laterTouching.sort((a, b) => a - b);
    }
    const third = laterTouching[RESOLUTION_LATER_PLAYS - 1];
    const byPlays = third !== undefined && third < expiry;
    const closedAt = byPlays ? third : expiry;
    const closedBy = byPlays ? 'three-later-plays' as const : 'window-72h' as const;

    const followLinks = (linksByParent.get(clientRef) ?? []).filter((link) => link.at <= closedAt);
    if (now < closedAt) {
      details.push({ clientRef, gameId, state: 'pending', resolution: { state: 'pending' }, linkedFollowUps: followLinks.length });
      continue;
    }

    const repairs = followLinks
      .map((link) => attributions.get(link.clientRef) ?? implicitUnattributed(link))
      .sort((a, b) => a.at - b.at || a.clientRef.localeCompare(b.clientRef));
    const defects = repairs.filter((attribution) => attribution.cause === 'player-defect');
    const finish = (state: RoutingFilmResolutionState, resolution: FirstPassResolution): void => {
      details.push({ clientRef, gameId, state, resolution, closedAt, closedBy, linkedFollowUps: followLinks.length });
    };
    const excluded = (): void => finish('excluded', { state: 'excluded' });

    if (NEVER_SKILL_OUTCOMES.has(outcome.ledgerOutcome) || ENVIRONMENT_FAILURE_CLASSES.has(outcome.failureClass ?? '')) { excluded(); continue; }
    if (defects.length) {
      const strongest = defects.reduce((best, next) => weightRank(next) > weightRank(best) ? next : best);
      finish(outcome.ledgerOutcome === 'completed' ? 'repaired' : 'failed', {
        state: 'player-defect', source: strongest.source, confidence: strongest.confidence
      });
      continue;
    }
    if (outcome.ledgerOutcome === 'completed') {
      if (repairs.length === 0) finish('clean', { state: 'clean' });
      else excluded();
      continue;
    }
    // failed / partial / blocked: a Player failure only when the cause is proven to be the Player's.
    if (outcome.failureClass === 'player') finish('failed', { state: 'player-defect', source: 'outcome', confidence: 'high' });
    else excluded();
  }

  const resolutions: Record<string, FirstPassResolution> = {};
  for (const detail of details) resolutions[detail.clientRef] = detail.resolution;
  return { resolutions, details };
}

function implicitUnattributed(link: RoutingFilmLinkEvent): EffectiveAttribution {
  return {
    clientRef: link.clientRef, parentClientRef: link.parentClientRef, cause: 'unattributed',
    source: 'rule', confidence: 'low', at: link.at
  };
}

// --- R3 joins ------------------------------------------------------------------------------

/** Profile join: the canonical Play analysis carried by each decision. Older Film lines simply have none. */
export function joinFilmProfiles(events: readonly RoutingFilmEvent[]): Record<string, ObservedPlayProfile> {
  const profiles: Record<string, ObservedPlayProfile> = {};
  for (const event of events) {
    if (event.kind !== 'decision' || !event.profile || profiles[event.clientRef]) continue;
    profiles[event.clientRef] = { taskClass: event.profile.taskClass, difficulty: event.profile.difficulty, role: event.profile.role };
  }
  return profiles;
}

/** The FilmIndex R3 should be given: Film + profile join + R5 first-pass resolutions. */
export function buildAttributedFilmIndex(
  events: readonly RoutingFilmEvent[],
  source: PriorPackSource,
  now: number
): FilmIndex {
  return buildFilmIndex(events, source, {
    profiles: joinFilmProfiles(events),
    resolutions: projectFirstPassResolutions(events, now).resolutions
  });
}

// --- Recording seams (write through the existing failure-isolated recorder) ---------------------

export interface DispatchAttributionOutcome {
  readonly link?: FilmLink;
  readonly attribution?: RuleAttribution & { readonly source: 'rule' | 'envelope' };
}

/**
 * At a follow-up's real dispatch: link it to its parent when proven, then attribute it. A structured
 * `FIX CAUSE:` envelope value outranks the rules. No link, nothing written.
 */
export function recordDispatchAttribution(
  recorder: RoutingFilmRecorder,
  dispatch: FollowUpDispatch,
  ledger: readonly InstanceLedgerEntry[]
): DispatchAttributionOutcome {
  const plays = indexFilmPlays(recorder.events());
  const link = linkFollowUp(dispatch, plays, ledger);
  if (!link) return {};
  const parent = plays.get(link.parentClientRef);
  if (!parent) return {};
  recorder.recordLink({
    schemaVersion: 1, kind: 'link', at: dispatch.at, clientRef: dispatch.clientRef, gameId: dispatch.gameId,
    parentClientRef: link.parentClientRef, linkEvidence: link.linkEvidence
  });
  const envelope = dispatch.evidence.followUp.fixCause;
  const decided: RuleAttribution & { source: 'rule' | 'envelope' } = envelope
    ? { cause: envelope, confidence: 'high', source: 'envelope' }
    : {
        ...attributeFollowUp({
          follow: { clientRef: dispatch.clientRef, touchKeys: dispatch.evidence.touchKeys, followUp: dispatch.evidence.followUp },
          parent, plays, at: dispatch.at
        }),
        source: 'rule'
      };
  recorder.recordAttribution({
    schemaVersion: 1, kind: 'attribution', at: dispatch.at, clientRef: dispatch.clientRef, gameId: dispatch.gameId,
    parentClientRef: link.parentClientRef, cause: decided.cause, source: decided.source, confidence: decided.confidence,
    ...(decided.ruleId ? { ruleId: decided.ruleId } : {})
  });
  return { link, attribution: decided };
}

/**
 * Persist newly settled resolutions as audit records. Belief never reads them (it re-derives from
 * facts), so this is idempotent bookkeeping, not an authority. Called at existing outcome/dispatch
 * seams with an injected clock; there is no timer.
 */
export function settleResolutions(recorder: RoutingFilmRecorder, now: number): number {
  let written = 0;
  for (const detail of projectFirstPassResolutions(recorder.events(), now).details) {
    if (detail.state === 'pending' || !detail.closedBy || detail.closedAt === undefined) continue;
    if (recorder.recordResolution({
      schemaVersion: 1, kind: 'resolution', at: now, clientRef: detail.clientRef, gameId: detail.gameId,
      state: detail.state, closedBy: detail.closedBy
    })) written += 1;
  }
  return written;
}
