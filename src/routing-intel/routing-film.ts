/**
 * R2 Routing Film: append-only observations of dispatch and outcome truth.
 *
 * Film is historical evidence, never current resource authority. Resource
 * receipts are projections of R1 at capture time and use open pool/window ids.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LedgerOutcome } from '../control-plane/work-ledger';
import { FIX_CAUSES, type DispatchProfile, type FixCause, type FollowUpLinkEvidence } from '../control-plane/follow-up-evidence';
import type {
  ResourcePoolId,
  RoutingEconomicsSnapshot
} from '../control-plane/routing-economics';

export const ROUTING_FILM_SCHEMA_VERSION = 1 as const;
export const ROUTING_FILM_FILE = 'routing-film.jsonl';
export const ROUTING_FILM_MAX_BYTES = 5 * 1024 * 1024;
export const ROUTING_FILM_ROTATIONS = 3;

export interface RoutingFilmReceiptWindow {
  readonly pool: ResourcePoolId;
  readonly window: string;
  readonly windowLengthMin: number;
  readonly remainingPercent?: number;
  readonly resetsAt?: number;
  readonly observedAt?: string;
  readonly stale: boolean;
}

export interface RoutingFilmReceipt {
  readonly pool: ResourcePoolId;
  readonly evidence: 'known' | 'unknown';
  readonly capturedAt: string;
  readonly windows: readonly RoutingFilmReceiptWindow[];
}

export interface RoutingFilmTarget {
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly transport?: string;
  readonly model?: string;
  readonly effort?: string;
  /** Seat/transport authority from R1; never inferred from model branding. */
  readonly resourcePool: ResourcePoolId | 'unknown';
}

interface RoutingFilmEventBase {
  readonly schemaVersion: typeof ROUTING_FILM_SCHEMA_VERSION;
  readonly at: number;
  readonly clientRef: string;
  readonly gameId: string;
}

export interface RoutingFilmDecisionEvent extends RoutingFilmEventBase {
  readonly kind: 'decision';
  /** Existing routing decision, not an R2 recommendation. */
  readonly baseline: RoutingFilmTarget;
  readonly chosen: RoutingFilmTarget;
  /** R8: `coach-accepted-*` only when the Coach explicitly accepted a recommendation (never a dormant or unseen one). */
  readonly decidedBy: 'auto-baseline' | 'coach-manual' | 'coach-envelope'
    | 'coach-accepted-primary' | 'coach-accepted-next-best' | 'coach-accepted-scout';
  readonly routeAction: 'dispatch' | 'handoff';
  /**
   * R6 shadow recommendation digest (optional; R2–R5 lines lack it and stay readable). It names
   * what Sideline would have recommended at this dispatch. It is never an outcome: only `chosen`
   * ever receives one, so every unchosen option stays unobserved.
   */
  readonly recommendation?: RoutingFilmRecommendationDigest;
  /** R6 (S57.1 §7): field possession of the chosen seat at dispatch. */
  readonly possession?: { readonly tier: string; readonly value: number };
  readonly receiptBefore: RoutingFilmReceipt;
  /**
   * R5 profile join (optional; R2-era lines lack it and stay readable). The canonical
   * Play analysis of the committed Play: task class, difficulty, and role.
   */
  readonly profile?: DispatchProfile;
  /** R5: hashed file-like references the Play named. Never paths, never prompt text. */
  readonly touchKeys?: readonly string[];
  /** R5: the route's context state and the (hashed) report it carried. */
  readonly context?: { readonly state: 'owner' | 'unknown' | 'none'; readonly reportKey?: string };
  /** R5: set only on the one post-Scout continuation; the (hashed) Scout report it acted on. */
  readonly scoutReportKey?: string;
}

/** One recommended option as recorded in Film: a target and its scores, never an outcome. */
export interface RoutingFilmRecommendationOption {
  readonly kind: 'send' | 'queue' | 'handoff' | 'scout-first' | 'wait-for-reset';
  readonly playerType: string;
  readonly lineage?: string;
  readonly modelId: string;
  readonly effort: string;
  readonly playerInstanceId: string;
  readonly resourcePool: string;
  readonly utility?: number;
  readonly firstPass?: number;
  /** Cost units; `unknown` when burn was UNKNOWN and a neutral cost was used. */
  readonly cost?: number | 'unknown';
  readonly possession?: number;
  readonly wait?: { readonly pool: string; readonly window: string; readonly resetsAt: number; readonly cycleToken: number };
  /**
   * Predicted burn receipt (optional, additive; older lines lack it). The p50 burn R6 predicted for
   * this option per pool/window, frozen at recommendation time, as a fraction of the window (0..1).
   * Absent when burn was UNKNOWN. It is a forecast to be compared with later observed burn, never an outcome.
   */
  readonly burn?: readonly { readonly pool: string; readonly window: string; readonly p50: number }[];
  readonly scoutTier?: string;
  readonly reasons: readonly string[];
}

/** R6 digest of a `RoutingRecommendation` (S57.1 §7 `RecommendationDigest`). Plain JSON, deterministic. */
export interface RoutingFilmRecommendationDigest {
  readonly v: 1;
  readonly id: string;
  readonly engineVersion: string;
  readonly weightsVersion: string;
  readonly priorPackVersion: string;
  readonly computedAt: number;
  readonly posture: string;
  readonly authority: { readonly mode: 'auto' | 'manual'; readonly advisoryOnly: boolean; readonly lockedBy: readonly string[] };
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly baseline?: RoutingFilmRecommendationOption;
  readonly primary?: RoutingFilmRecommendationOption;
  readonly nextBest?: RoutingFilmRecommendationOption;
  readonly waitOption?: RoutingFilmRecommendationOption;
  readonly scoutOption?: RoutingFilmRecommendationOption;
  readonly strength: { readonly recommendation: 'clear' | 'lean' | 'toss-up'; readonly evidence: string };
  readonly baselineAgreement: 'agree' | 'disagree' | 'no-baseline';
  readonly scoutVerdict: 'scout-first' | 'no-scout' | 'not-considered';
  readonly scoutNet?: number;
  readonly unknowns: readonly string[];
}

export interface RoutingFilmOverlap {
  readonly clientRef: string;
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly resourcePool: ResourcePoolId | 'unknown';
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly overlapMs: number;
}

export interface RoutingFilmConcurrency {
  readonly samePool: readonly RoutingFilmOverlap[];
  readonly otherPool: readonly RoutingFilmOverlap[];
  readonly unknownPool: readonly RoutingFilmOverlap[];
}

export type RoutingFilmIsolation = 'high' | 'medium' | 'low' | 'none';

export interface RoutingFilmBurnObservation {
  readonly pool: ResourcePoolId;
  readonly window: string;
  readonly windowLengthMin: number;
  readonly isolation: RoutingFilmIsolation;
  readonly reason: string;
  readonly remainingPercentDelta?: number;
  /** A zero percentage-point receipt delta is only an upper bound at source precision. */
  readonly censoredAtMostPercent?: number;
}

export interface RoutingFilmOutcomeEvent extends RoutingFilmEventBase {
  readonly kind: 'outcome';
  readonly ledgerOutcome: LedgerOutcome;
  readonly startedAt: number;
  readonly executionStartedAt?: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly reportProduced: boolean;
  readonly retries: number;
  readonly substitutedTo?: RoutingFilmTarget;
  readonly failureClass?: string;
  readonly receiptAfter: RoutingFilmReceipt;
  readonly concurrency: RoutingFilmConcurrency;
  /** Play-level audit summary; window-specific evidence remains in `burn`. */
  readonly isolation: RoutingFilmIsolation;
  readonly isolationReason: string;
  readonly burn: readonly RoutingFilmBurnObservation[];
}

/** R5 (S57.1 §7). A follow-up Play proven to continue an earlier Play. */
export interface RoutingFilmLinkEvent extends RoutingFilmEventBase {
  readonly kind: 'link';
  readonly parentClientRef: string;
  readonly linkEvidence: FollowUpLinkEvidence;
}

export type RoutingFilmAttributionSource = 'rule' | 'coach' | 'envelope';
export type RoutingFilmConfidence = 'high' | 'medium' | 'low';

/** R5 (S57.1 §8). `clientRef` is the follow-up; the pair (clientRef, parentClientRef) is the subject. */
export interface RoutingFilmAttributionEvent extends RoutingFilmEventBase {
  readonly kind: 'attribution';
  readonly parentClientRef: string;
  readonly cause: FixCause;
  readonly source: RoutingFilmAttributionSource;
  readonly confidence: RoutingFilmConfidence;
  readonly ruleId?: string;
}

export type RoutingFilmResolutionState = 'clean' | 'repaired' | 'failed' | 'excluded';

/**
 * R5 audit record of a settled first-pass resolution. Belief never reads this: it is
 * re-derived from the facts by `projectFirstPassResolutions`, so replay stays exact.
 */
export interface RoutingFilmResolutionEvent extends RoutingFilmEventBase {
  readonly kind: 'resolution';
  readonly state: RoutingFilmResolutionState;
  readonly closedBy: 'window-72h' | 'three-later-plays';
}

export type RoutingFilmEvent =
  | RoutingFilmDecisionEvent
  | RoutingFilmOutcomeEvent
  | RoutingFilmLinkEvent
  | RoutingFilmAttributionEvent
  | RoutingFilmResolutionEvent;

export interface RoutingFilmReadDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly reason: 'malformed-json' | 'unsupported-schema' | 'unsupported-kind' | 'invalid-event';
}

export interface RoutingFilmReadResult {
  readonly events: readonly RoutingFilmEvent[];
  readonly diagnostics: readonly RoutingFilmReadDiagnostic[];
}

export interface RoutingFilmJournal {
  append(event: RoutingFilmEvent): void;
  read(): RoutingFilmReadResult;
}

export interface RoutingFilmStoreOptions {
  readonly dir: string;
  readonly maxBytes?: number;
  readonly rotations?: number;
  readonly warn?: (message: string) => void;
}

/** One-process owner, matching the other daemon-owned ~/.sideline journals. */
export class RoutingFilmStore implements RoutingFilmJournal {
  private readonly file: string;
  private readonly maxBytes: number;
  private readonly rotations: number;
  private readonly warn: (message: string) => void;

  constructor(private readonly options: RoutingFilmStoreOptions) {
    this.file = path.join(options.dir, ROUTING_FILM_FILE);
    this.maxBytes = options.maxBytes ?? ROUTING_FILM_MAX_BYTES;
    this.rotations = options.rotations ?? ROUTING_FILM_ROTATIONS;
    this.warn = options.warn ?? (() => undefined);
  }

  append(event: RoutingFilmEvent): void {
    const line = `${JSON.stringify(event)}\n`;
    fs.mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
    this.rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
    fs.appendFileSync(this.file, line, { encoding: 'utf8', mode: 0o600 });
  }

  read(): RoutingFilmReadResult {
    const events: RoutingFilmEvent[] = [];
    const diagnostics: RoutingFilmReadDiagnostic[] = [];
    for (const file of this.filesOldestFirst()) {
      let text: string;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        const parsed = parseFilmEvent(line);
        if (parsed.event) {
          events.push(parsed.event);
          continue;
        }
        const diagnostic = { file, line: index + 1, reason: parsed.reason } as const;
        diagnostics.push(diagnostic);
        this.warn(`Routing Film skipped ${path.basename(file)} line ${index + 1}: ${parsed.reason}.`);
      }
    }
    return { events, diagnostics };
  }

  private rotated(index: number): string {
    const extension = path.extname(this.file);
    return `${this.file.slice(0, -extension.length)}.${index}${extension}`;
  }

  private filesOldestFirst(): string[] {
    return [
      ...Array.from({ length: this.rotations }, (_, offset) => this.rotated(this.rotations - offset)),
      this.file
    ];
  }

  private rotateIfNeeded(nextBytes: number): void {
    let size = 0;
    try { size = fs.statSync(this.file).size; } catch { return; }
    if (size === 0 || size + nextBytes <= this.maxBytes) return;
    try { fs.unlinkSync(this.rotated(this.rotations)); } catch { /* oldest absent */ }
    for (let index = this.rotations - 1; index >= 1; index -= 1) {
      try { fs.renameSync(this.rotated(index), this.rotated(index + 1)); } catch { /* generation absent */ }
    }
    fs.renameSync(this.file, this.rotated(1));
  }
}

export interface RoutingFilmRecorderOptions {
  readonly warn?: (message: string) => void;
}

/**
 * Failure-isolated append boundary plus restart-safe event dedupe. A camera
 * failure is logged and swallowed; it never changes the Play path.
 */
export class RoutingFilmRecorder {
  private readonly decisions = new Map<string, RoutingFilmDecisionEvent>();
  private readonly outcomes = new Set<string>();
  private readonly links = new Set<string>();
  private readonly attributionKeys = new Set<string>();
  private readonly resolutions = new Map<string, RoutingFilmResolutionState>();
  /** In-memory mirror of the retained journal, in chronological order. */
  private readonly retained: RoutingFilmEvent[] = [];
  private readonly warn: (message: string) => void;

  constructor(private readonly journal: RoutingFilmJournal, options: RoutingFilmRecorderOptions = {}) {
    this.warn = options.warn ?? (() => undefined);
    try {
      for (const event of journal.read().events) {
        this.retained.push(event);
        if (event.kind === 'decision' && !this.decisions.has(event.clientRef)) this.decisions.set(event.clientRef, event);
        if (event.kind === 'outcome') this.outcomes.add(event.clientRef);
        if (event.kind === 'link') this.links.add(event.clientRef);
        if (event.kind === 'attribution' && event.source !== 'coach') this.attributionKeys.add(attributionKey(event));
        if (event.kind === 'resolution') this.resolutions.set(event.clientRef, event.state);
      }
    } catch (error) {
      this.warn(`Routing Film could not be read: ${messageOf(error)}.`);
    }
  }

  decision(clientRef: string): RoutingFilmDecisionEvent | undefined {
    return this.decisions.get(clientRef);
  }

  /** Every retained event, oldest first. Read-only view for pure R5 projections. */
  events(): readonly RoutingFilmEvent[] {
    return this.retained;
  }

  recordDecision(event: RoutingFilmDecisionEvent): boolean {
    if (this.decisions.has(event.clientRef)) return false;
    try {
      this.journal.append(event);
      this.retained.push(event);
      this.decisions.set(event.clientRef, event);
      return true;
    } catch (error) {
      this.warn(`Routing Film decision append failed for ${event.clientRef}: ${messageOf(error)}.`);
      return false;
    }
  }

  recordOutcome(event: RoutingFilmOutcomeEvent): boolean {
    if (this.outcomes.has(event.clientRef)) return false;
    try {
      this.journal.append(event);
      this.retained.push(event);
      this.outcomes.add(event.clientRef);
      return true;
    } catch (error) {
      this.warn(`Routing Film outcome append failed for ${event.clientRef}: ${messageOf(error)}.`);
      return false;
    }
  }

  /** One parent per follow-up: the first proven link wins. */
  recordLink(event: RoutingFilmLinkEvent): boolean {
    if (this.links.has(event.clientRef)) return false;
    if (this.append(event, `link for ${event.clientRef}`)) { this.links.add(event.clientRef); return true; }
    return false;
  }

  /**
   * Rule and envelope attribution is written once per pair. Coach corrections are always
   * appended: the last valid event for a pair wins (see `effectiveAttributions`).
   */
  recordAttribution(event: RoutingFilmAttributionEvent): boolean {
    const dedupe = event.source !== 'coach';
    if (dedupe && this.attributionKeys.has(attributionKey(event))) return false;
    if (this.append(event, `attribution for ${event.clientRef}`)) {
      if (dedupe) this.attributionKeys.add(attributionKey(event));
      return true;
    }
    return false;
  }

  /** Written only when the settled state of a Play changes. */
  recordResolution(event: RoutingFilmResolutionEvent): boolean {
    if (this.resolutions.get(event.clientRef) === event.state) return false;
    if (this.append(event, `resolution for ${event.clientRef}`)) { this.resolutions.set(event.clientRef, event.state); return true; }
    return false;
  }

  private append(event: RoutingFilmEvent, label: string): boolean {
    try {
      this.journal.append(event);
      this.retained.push(event);
      return true;
    } catch (error) {
      this.warn(`Routing Film ${label} append failed: ${messageOf(error)}.`);
      return false;
    }
  }
}

function attributionKey(event: RoutingFilmAttributionEvent): string {
  return `${event.clientRef}|${event.parentClientRef}|${event.source}`;
}

/** Capture only the pool the chosen seat consumes. Unknown has no invented windows. */
export function projectRoutingFilmReceipt(
  snapshot: RoutingEconomicsSnapshot,
  pool: ResourcePoolId | 'unknown',
  observedAt?: string
): RoutingFilmReceipt {
  const projected = snapshot.pools[pool];
  if (!projected || pool === 'unknown') {
    return { pool, evidence: 'unknown', capturedAt: snapshot.projectedAt, windows: [] };
  }
  return {
    pool,
    evidence: projected.evidence,
    capturedAt: snapshot.projectedAt,
    windows: projected.windows.map((window) => ({
      pool,
      window: window.id,
      windowLengthMin: window.lengthMin,
      ...(window.remainingFraction !== undefined ? { remainingPercent: window.remainingFraction * 100 } : {}),
      ...(window.resetsAt !== undefined ? { resetsAt: window.resetsAt } : {}),
      ...(observedAt ? { observedAt } : {}),
      stale: window.stale
    }))
  };
}

export interface RoutingFilmWorkInterval {
  readonly clientRef: string;
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly resourcePool: ResourcePoolId | 'unknown';
  readonly startedAt: number;
  readonly finishedAt?: number;
}

/** Pure overlap projection. Unknown pool equality never claims same-pool contamination. */
export function projectRoutingFilmConcurrency(
  target: RoutingFilmWorkInterval & { readonly finishedAt: number },
  candidates: readonly RoutingFilmWorkInterval[]
): RoutingFilmConcurrency {
  const samePool: RoutingFilmOverlap[] = [];
  const otherPool: RoutingFilmOverlap[] = [];
  const unknownPool: RoutingFilmOverlap[] = [];
  for (const candidate of candidates) {
    if (candidate.clientRef === target.clientRef) continue;
    const overlapStart = Math.max(target.startedAt, candidate.startedAt);
    const overlapEnd = Math.min(target.finishedAt, candidate.finishedAt ?? target.finishedAt);
    if (overlapEnd <= overlapStart) continue;
    const overlap: RoutingFilmOverlap = {
      clientRef: candidate.clientRef,
      playerInstanceId: candidate.playerInstanceId,
      ...(candidate.playerType ? { playerType: candidate.playerType } : {}),
      resourcePool: candidate.resourcePool,
      startedAt: candidate.startedAt,
      ...(candidate.finishedAt !== undefined ? { finishedAt: candidate.finishedAt } : {}),
      overlapMs: overlapEnd - overlapStart
    };
    if (target.resourcePool !== 'unknown' && candidate.resourcePool === target.resourcePool) samePool.push(overlap);
    else if (candidate.resourcePool === 'unknown') unknownPool.push(overlap);
    else otherPool.push(overlap);
  }
  const order = (left: RoutingFilmOverlap, right: RoutingFilmOverlap): number => left.startedAt - right.startedAt || left.clientRef.localeCompare(right.clientRef);
  return { samePool: samePool.sort(order), otherPool: otherPool.sort(order), unknownPool: unknownPool.sort(order) };
}

/**
 * Direct R2 observation only. It does not pool samples, learn estimates, or
 * assign contaminated burn to one Play.
 */
export function deriveRoutingFilmBurn(
  before: RoutingFilmReceipt,
  after: RoutingFilmReceipt,
  dispatchAt: number,
  finishedAt: number,
  concurrency: RoutingFilmConcurrency
): RoutingFilmBurnObservation[] {
  const observations: RoutingFilmBurnObservation[] = [];
  const afterByWindow = new Map(after.windows.map((window) => [window.window, window]));
  const beforeIds = new Set(before.windows.map((window) => window.window));
  const ids = [...new Set([...beforeIds, ...after.windows.map((window) => window.window)])].sort();
  if (ids.length === 0) return [];

  for (const id of ids) {
    const first = before.windows.find((window) => window.window === id);
    const last = afterByWindow.get(id);
    const identity = first ?? last;
    if (!identity) continue;
    const none = (reason: string): RoutingFilmBurnObservation => ({
      pool: identity.pool, window: identity.window, windowLengthMin: identity.windowLengthMin,
      isolation: 'none', reason
    });
    if (!first || !last) { observations.push(none('receipt-missing')); continue; }
    if (before.evidence === 'unknown' || after.evidence === 'unknown' || first.stale || last.stale
      || first.remainingPercent === undefined || last.remainingPercent === undefined
      || first.resetsAt === undefined || last.resetsAt === undefined
      || !first.observedAt || !last.observedAt) {
      observations.push(none('receipt-stale-or-unproven'));
      continue;
    }
    if (first.resetsAt !== last.resetsAt) { observations.push(none('reset-cycle-crossed')); continue; }
    const delta = first.remainingPercent - last.remainingPercent;
    if (delta < 0) { observations.push(none('negative-impossible-delta')); continue; }
    const firstObserved = Date.parse(first.observedAt);
    const lastObserved = Date.parse(last.observedAt);
    if (!Number.isFinite(firstObserved) || !Number.isFinite(lastObserved)
      || firstObserved > dispatchAt || lastObserved < finishedAt) {
      observations.push(none('receipt-bracket-invalid'));
      continue;
    }
    const beforeLag = dispatchAt - firstObserved;
    const afterLag = lastObserved - finishedAt;
    const bracket = Math.max(beforeLag, afterLag);
    if (bracket > 45 * 60_000) { observations.push(none('receipt-bracket-too-loose')); continue; }
    const isolation: RoutingFilmIsolation = concurrency.samePool.length > 0
      ? 'low'
      : bracket <= 15 * 60_000 ? 'high' : 'medium';
    observations.push({
      pool: first.pool,
      window: first.window,
      windowLengthMin: first.windowLengthMin,
      isolation,
      reason: isolation === 'low' ? 'same-pool-work-overlapped' : isolation === 'high' ? 'fresh-isolated-bracket' : 'loose-isolated-bracket',
      remainingPercentDelta: delta,
      ...(delta === 0 ? { censoredAtMostPercent: 1 } : {})
    });
  }
  return observations;
}

export function summarizeRoutingFilmIsolation(
  burn: readonly RoutingFilmBurnObservation[]
): { isolation: RoutingFilmIsolation; reason: string } {
  if (burn.length === 0) return { isolation: 'none', reason: 'resource-evidence-unknown' };
  if (burn.some((item) => item.isolation === 'none')) return { isolation: 'none', reason: 'one-or-more-windows-unusable' };
  if (burn.some((item) => item.isolation === 'low')) return { isolation: 'low', reason: 'same-pool-work-overlapped' };
  if (burn.some((item) => item.isolation === 'medium')) return { isolation: 'medium', reason: 'loose-isolated-bracket' };
  return { isolation: 'high', reason: 'fresh-isolated-bracket' };
}

function parseFilmEvent(line: string): { event?: RoutingFilmEvent; reason: RoutingFilmReadDiagnostic['reason'] } {
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return { reason: 'malformed-json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { reason: 'invalid-event' };
  const event = parsed as Partial<RoutingFilmEvent> & Record<string, unknown>;
  if (event.schemaVersion !== ROUTING_FILM_SCHEMA_VERSION) return { reason: 'unsupported-schema' };
  if (event.kind !== 'decision' && event.kind !== 'outcome' && event.kind !== 'link'
    && event.kind !== 'attribution' && event.kind !== 'resolution') return { reason: 'unsupported-kind' };
  if (typeof event.clientRef !== 'string' || !event.clientRef || typeof event.gameId !== 'string' || !event.gameId
    || !finite(event.at)) return { reason: 'invalid-event' };
  if (event.kind === 'decision') {
    const decision = event as Partial<RoutingFilmDecisionEvent>;
    if (!validTarget(decision.baseline) || !validTarget(decision.chosen)
      || !DECIDED_BY.has(decision.decidedBy as string)
      || (decision.routeAction !== 'dispatch' && decision.routeAction !== 'handoff')
      || !validReceipt(decision.receiptBefore)) return { reason: 'invalid-event' };
  } else if (event.kind === 'link') {
    const link = event as Partial<RoutingFilmLinkEvent>;
    if (typeof link.parentClientRef !== 'string' || !link.parentClientRef || link.parentClientRef === link.clientRef
      || !LINK_EVIDENCE.has(link.linkEvidence as string)) return { reason: 'invalid-event' };
  } else if (event.kind === 'attribution') {
    const attribution = event as Partial<RoutingFilmAttributionEvent>;
    if (typeof attribution.parentClientRef !== 'string' || !attribution.parentClientRef || attribution.parentClientRef === attribution.clientRef
      || !(FIX_CAUSES as readonly string[]).includes(attribution.cause as string)
      || (attribution.source !== 'rule' && attribution.source !== 'coach' && attribution.source !== 'envelope')
      || (attribution.confidence !== 'high' && attribution.confidence !== 'medium' && attribution.confidence !== 'low')) return { reason: 'invalid-event' };
  } else if (event.kind === 'resolution') {
    const resolution = event as Partial<RoutingFilmResolutionEvent>;
    if (!RESOLUTION_STATES.has(resolution.state as string)
      || (resolution.closedBy !== 'window-72h' && resolution.closedBy !== 'three-later-plays')) return { reason: 'invalid-event' };
  } else {
    const outcome = event as Partial<RoutingFilmOutcomeEvent>;
    if (!validOutcome(outcome.ledgerOutcome) || !finite(outcome.startedAt) || !finite(outcome.finishedAt)
      || !finite(outcome.durationMs) || !validReceipt(outcome.receiptAfter)
      || !Number.isInteger(outcome.retries) || (outcome.retries as number) < 0 || typeof outcome.reportProduced !== 'boolean'
      || !validIsolation(outcome.isolation) || typeof outcome.isolationReason !== 'string'
      || !outcome.concurrency || !Array.isArray(outcome.burn)) return { reason: 'invalid-event' };
  }
  return { event: event as RoutingFilmEvent, reason: 'invalid-event' };
}

const DECIDED_BY: ReadonlySet<string> = new Set([
  'auto-baseline', 'coach-manual', 'coach-envelope', 'coach-accepted-primary', 'coach-accepted-next-best', 'coach-accepted-scout'
]);
const LINK_EVIDENCE: ReadonlySet<string> = new Set([
  'named-report', 'incoming-report', 'latest-play', 'touch-overlap', 'scout-continuation'
]);
const RESOLUTION_STATES: ReadonlySet<string> = new Set(['clean', 'repaired', 'failed', 'excluded']);

function validTarget(value: unknown): value is RoutingFilmTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const target = value as Partial<RoutingFilmTarget>;
  return typeof target.playerInstanceId === 'string' && target.playerInstanceId.length > 0
    && typeof target.resourcePool === 'string' && target.resourcePool.length > 0;
}

function validReceipt(value: unknown): value is RoutingFilmReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<RoutingFilmReceipt>;
  return typeof receipt.pool === 'string' && receipt.pool.length > 0
    && (receipt.evidence === 'known' || receipt.evidence === 'unknown')
    && typeof receipt.capturedAt === 'string' && Number.isFinite(Date.parse(receipt.capturedAt))
    && Array.isArray(receipt.windows);
}

function validOutcome(value: unknown): value is LedgerOutcome {
  return value === 'completed' || value === 'partial' || value === 'blocked' || value === 'failed'
    || value === 'interrupted' || value === 'unknown' || value === 'not-sent';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validIsolation(value: unknown): value is RoutingFilmIsolation {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'none';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
