/**
 * Instance Work Ledger (Q2.10C) — what each EXACT Player instance is doing, and
 * what it just did. A small Control Plane memory for orchestration, not an archive:
 * no transcripts, bounded history, in memory only.
 *
 *   On Field  → may receive Plays (eligibility, owned by the Stadium roster)
 *   Ledger    → idle / working / completed / unknown / disconnected (activity)
 *
 * Only what Coach KNOWS moves the state:
 *   dispatch received          → working (Controlled) / unknown (Terminal: no completion signal)
 *   semantic turn completion   → completed, and the Play joins recent history
 *   Stadium disconnect         → disconnected (never a fabricated completion)
 * Nothing is inferred from elapsed time. Unknown is a valid answer.
 */

import * as crypto from 'node:crypto';
import type { InstanceWorkState } from '../routing-policy';
import type { ReportProvenance } from '../report-provenance';

export const RECENT_PLAY_LIMIT = 10;
export const REPORT_LINK_LIMIT = 10;
/** A report written this soon after a Play finished can still belong to it. */
export const REPORT_GRACE_MS = 2 * 60_000;

export type LedgerOutcome = 'completed' | 'partial' | 'blocked' | 'failed' | 'interrupted' | 'unknown' | 'not-sent';

export interface LedgerPlay {
  readonly clientRef: string;
  readonly playLabel?: string;
  readonly promptSummary?: string;
  /** Aggregate worker activity for one logical orchestrated Player turn. */
  readonly activitySummary?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly transport?: 'controlled' | 'legacy';
  /** Coach dispatch/attribution time. This meaning is intentionally unchanged. */
  readonly startedAt: number;
  /** First genuine provider `started` evidence, stamped once by Control Plane time. */
  readonly executionStartedAt?: number;
  readonly turnRef?: string;
  /** True only when a replacement Control Plane adopted this turn from Stadium evidence. */
  readonly recovered?: true;
  /** File-like references the Play named (collision awareness). Never the prompt itself. */
  readonly touches?: readonly string[];
  readonly reportRequested?: boolean;
}

export interface LedgerRecentPlay {
  readonly clientRef: string;
  readonly playLabel?: string;
  readonly promptSummary?: string;
  readonly activitySummary?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly outcome: LedgerOutcome;
  readonly summary?: string;
  readonly startedAt: number;
  readonly executionStartedAt?: number;
  readonly turnRef?: string;
  readonly finishedAt: number;
  readonly acknowledgedAt?: number;
  /** Process-loss Unknown that exact active-turn evidence may safely reclaim. */
  readonly recoveryCandidate?: true;
  readonly reportRequested?: boolean;
}

export interface LedgerReportLink {
  readonly path: string;
  readonly filename?: string;
  readonly mtime: number;
  /** How Coach knows: the only Play running (or just finished) in that Game when it was written. */
  readonly attribution: 'explicit-provenance' | 'single-active-play';
  readonly clientRef?: string;
  readonly acknowledgedAt?: number;
  /** Exact execution facts carried by the report itself, when present. */
  readonly provenance?: ReportProvenance;
}

export interface InstanceLedgerEntry {
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerType?: string;
  readonly revision: number;
  readonly workState: InstanceWorkState;
  readonly currentPlay?: LedgerPlay;
  readonly recentPlays: readonly LedgerRecentPlay[];
  readonly reports: readonly LedgerReportLink[];
  readonly updatedAt: number;
}

export interface DispatchRecord {
  gameId: string;
  playerInstanceId: string;
  playerType?: string;
  clientRef: string;
  playLabel?: string;
  promptSummary?: string;
  model?: string;
  effort?: string;
  transport?: 'controlled' | 'legacy';
  at?: number;
  touches?: readonly string[];
  reportRequested?: boolean;
}

export interface TurnRecord {
  instanceId?: string;
  state?: string;
  turnRef?: string;
  summary?: string;
  /** Concise task text when a trusted non-router seam starts the turn. */
  promptSummary?: string;
  /** Aggregate Formation activity, separate from the logical Play summary. */
  activitySummary?: string;
  at?: number;
}

interface MutableEntry {
  gameId: string;
  playerInstanceId: string;
  playerType?: string;
  revision: number;
  workState: InstanceWorkState;
  currentPlay?: LedgerPlay;
  recentPlays: LedgerRecentPlay[];
  reports: LedgerReportLink[];
  updatedAt: number;
}

interface RosterCandidate {
  instanceId?: unknown;
  playerType?: unknown;
  transport?: unknown;
  state?: unknown;
  activeTurn?: unknown;
}

interface ActiveTurnEvidence {
  turnRef: string;
  state: 'accepted' | 'started';
  startedAt: number;
}

/**
 * BREADCRUMB — Adaptive Coaching Intelligence (not built here; Q2.13).
 *
 * WAS: Sideline routing began with useful provider/model priors and
 * increasingly gained real execution evidence.
 *
 * Scout/continuation work (S16.0-S19.0, Q2.13) now creates durable lineage
 * from human Play through routing and actual execution — this ledger
 * (`TurnRecord`/`DispatchRecord`, per-instance `LedgerPlay`/`LedgerRecentPlay`
 * history) is exactly that lineage: which Player, which model/effort, which
 * turn, which truthful terminal outcome.
 *
 * IS: reliable Play -> Player -> model/effort -> outcome lineage is useful
 * game film. Sideline should collect as much truthful execution evidence as
 * reasonably available while preserving UNKNOWN when data is unavailable.
 * Observation stays separate from inference and routing policy — this class
 * only records what happened; it does not score or rank anyone. Infrastructure
 * failures such as auth, quota, rate limit, provider outage, harness failure,
 * or interruption must not automatically become evidence that a Player/model
 * is poor (see `LedgerOutcome`'s own distinct `blocked`/`unknown` states,
 * already kept separate from `failed`).
 *
 * WHY: future Sideline should learn the actual Team it coaches rather than
 * permanently relying on assumptions such as "Claude is architect" or "Codex
 * is worker." Different users and Games may have different Teams. Real Plays
 * should gradually reveal which Player/model/effort combinations perform
 * well for different task classes.
 *
 * WILL BE / FUTURE: future Adaptive Coaching Intelligence may combine Player
 * Health/Scoreboard truth, real Game Film (this ledger's own history), task-
 * class outcomes, model + effort, duration, tokens/cost/credits where
 * truthfully observable, quota/window/headroom where truthfully observable,
 * retries/rework/human intervention, Game-local context and continuity, and
 * sample size/uncertainty into dynamic Team depth charts and a compact Coach
 * Brief for the Assistant Coach. AUTO and future CONSERVE may consume that
 * evidence. General model reputation remains a prior, not a law. Human
 * routing remains authoritative. Not implemented here: no scoring, no
 * learned routing, no CONSERVE, no Scoreboard changes, no new telemetry
 * collection, no Coach Brief generation.
 */
export class InstanceWorkLedger {
  private readonly entries = new Map<string, MutableEntry>();
  /** Dispatches sent but not yet confirmed by the Stadium, by clientRef. */
  private readonly sending = new Map<string, DispatchRecord>();
  private readonly seenReports = new Map<string, Set<string>>();
  private revisionCounter = 0;
  /** Revisions are ordered only within this one Control Plane/ledger lifetime. */
  readonly epoch = `execution_${crypto.randomBytes(12).toString('hex')}`;

  constructor(private readonly now: () => number = Date.now) {}

  /** A Play was routed to an exact instance. Nothing is claimed until the Stadium confirms. */
  recordDispatch(record: DispatchRecord): void {
    this.sending.set(record.clientRef, { ...record, at: record.at ?? this.now() });
    const entry = this.entry(record.gameId, record.playerInstanceId, record.playerType);
    this.touch(entry, this.now());
  }

  /** The router's delivery verdict for a dispatch. */
  recordDelivery(clientRef: string, state: string, detail: { turnRef?: string; error?: string } = {}): void {
    const dispatch = this.sending.get(clientRef);
    if (!dispatch) return;
    if (state === 'sending') return;
    this.sending.delete(clientRef);
    const entry = this.entry(dispatch.gameId, dispatch.playerInstanceId, dispatch.playerType);
    const at = this.now();
    const before = fingerprint(entry);
    if (state === 'received') {
      // The Stadium's turn events usually arrive first; a very fast Play may even
      // have finished already, and must not be resurrected as working.
      const alreadyFinished = entry.recentPlays.some((play) => play.clientRef === dispatch.clientRef);
      if (!alreadyFinished) {
        const knownTurnRef = entry.currentPlay?.clientRef === dispatch.clientRef ? entry.currentPlay.turnRef : undefined;
        const executionStartedAt = entry.currentPlay?.clientRef === dispatch.clientRef ? entry.currentPlay.executionStartedAt : undefined;
        entry.currentPlay = { ...toPlay(dispatch), turnRef: detail.turnRef ?? knownTurnRef, executionStartedAt };
        // A terminal-transport Player usually gives no completion signal, so its activity
        // is Unknown — unless the Stadium already proved a command started (shell integration).
        entry.workState = dispatch.transport === 'legacy' && entry.workState !== 'working' ? 'unknown' : 'working';
      }
    } else if (state === 'failed') {
      pushRecent(entry, { ...recentOf(toPlay(dispatch), 'not-sent', at), summary: detail.error });
      entry.currentPlay = undefined;
      entry.workState = 'idle';
    } else if (state === 'unknown') {
      entry.currentPlay = { ...toPlay(dispatch), turnRef: detail.turnRef };
      entry.workState = 'unknown';
    }
    // Removing the pending-dispatch marker is itself canonical Starting-state
    // truth, even when a very fast terminal event already closed the Play.
    if (fingerprint(entry) === before) this.touch(entry, at);
    else this.commit(entry, before, at);
  }

  /** Semantic turn lifecycle from the Stadium (Controlled Players). */
  recordTurn(gameId: string, turn: TurnRecord): void {
    const instanceId = typeof turn.instanceId === 'string' ? turn.instanceId : undefined;
    if (!instanceId || !gameId) return;
    const entry = this.entry(gameId, instanceId);
    const at = this.now();
    const state = turn.state;
    const terminalForTurn = turn.turnRef
      ? entry.recentPlays.find((play) => play.turnRef === turn.turnRef && play.recoveryCandidate !== true)
      : undefined;
    // A terminal outcome is final for this exact provider turn. Late delivery
    // evidence cannot resurrect it, regardless of event arrival timestamps.
    if (terminalForTurn) return;
    const before = fingerprint(entry);
    if (state === 'accepted' || state === 'started') {
      if (!entry.currentPlay) {
        const pending = this.pendingFor(gameId, instanceId);
        entry.currentPlay = pending
          ? { ...toPlay(pending), turnRef: turn.turnRef }
          : { clientRef: turn.turnRef ?? `turn-${at}`, startedAt: turn.at ?? at, turnRef: turn.turnRef };
      } else if (turn.turnRef && entry.currentPlay.turnRef && entry.currentPlay.turnRef !== turn.turnRef) {
        return;
      } else if (turn.turnRef && !entry.currentPlay.turnRef) {
        entry.currentPlay = { ...entry.currentPlay, turnRef: turn.turnRef };
      }
      if (state === 'started' && entry.currentPlay && entry.currentPlay.executionStartedAt === undefined) {
        entry.currentPlay = { ...entry.currentPlay, executionStartedAt: at };
      }
      // A dispatch that never went through the router (Scout's Formation dispatch
      // is client-initiated) has no DispatchRecord and so no promptSummary. A
      // truthful `started` summary (e.g. "2 Scouts running") is accepted here,
      // but only to FILL an empty promptSummary — never to overwrite a real
      // Play's own dispatch-time summary.
      if (entry.currentPlay && turn.promptSummary && !entry.currentPlay.promptSummary) {
        entry.currentPlay = { ...entry.currentPlay, promptSummary: turn.promptSummary };
      }
      if (state === 'started' && entry.currentPlay && turn.activitySummary) {
        entry.currentPlay = { ...entry.currentPlay, activitySummary: turn.activitySummary };
      }
      entry.workState = 'working';
    } else if (state === 'completed' || state === 'partial' || state === 'blocked' || state === 'failed' || state === 'interrupted' || state === 'unknown') {
      const recoveryCandidate = turn.turnRef
        ? entry.recentPlays.find((play) => play.turnRef === turn.turnRef && play.recoveryCandidate === true)
        : undefined;
      const play = entry.currentPlay
        ?? (this.pendingFor(gameId, instanceId) ? toPlay(this.pendingFor(gameId, instanceId)!) : undefined)
        ?? (recoveryCandidate ? playFromRecoveryCandidate(recoveryCandidate) : undefined);
      if (play && (!turn.turnRef || !play.turnRef || play.turnRef === turn.turnRef)) {
        const terminalPlay = turn.turnRef && !play.turnRef ? { ...play, turnRef: turn.turnRef } : play;
        if (recoveryCandidate) entry.recentPlays = entry.recentPlays.filter((candidate) => candidate !== recoveryCandidate);
        pushRecent(entry, { ...recentOf(terminalPlay, state, at), summary: turn.summary });
        entry.currentPlay = undefined;
      }
      entry.workState = state === 'completed' || state === 'partial' ? 'completed' : state === 'unknown' ? 'unknown' : 'idle';
    } else {
      return;
    }
    this.commit(entry, before, at);
  }

  /** The Stadium carrying this Game went away. Work in progress becomes Disconnected, never Completed. */
  markGameDisconnected(gameId: string | undefined): void {
    if (!gameId) return;
    for (const entry of this.entries.values()) {
      if (entry.gameId !== gameId) continue;
      const before = fingerprint(entry);
      entry.workState = 'disconnected';
      this.commit(entry, before, this.now());
    }
  }

  /**
   * Reconcile with the Stadium's canonical routing projection: new instances get
   * an entry, removed instances leave, and a reconnected instance's activity is
   * only what the Stadium can prove right now.
   */
  observeRoster(gameId: string | undefined, capabilities: readonly unknown[] | undefined, rosterInstanceIds?: ReadonlySet<string>): void {
    if (!gameId || !Array.isArray(capabilities)) return;
    const present = new Set<string>();
    for (const raw of capabilities) {
      const candidate = raw as RosterCandidate;
      if (typeof candidate?.instanceId !== 'string') continue;
      present.add(candidate.instanceId);
      const existed = this.entries.has(key(gameId, candidate.instanceId));
      const entry = this.entry(gameId, candidate.instanceId, typeof candidate.playerType === 'string' ? candidate.playerType : undefined);
      const before = fingerprint(entry);
      const controlled = candidate.transport === 'controlled';
      if (candidate.state === 'busy') {
        const activeTurn = controlled ? readActiveTurn(candidate.activeTurn) : undefined;
        if (!entry.currentPlay && activeTurn) {
          const matching = entry.recentPlays.filter((play) => play.turnRef === activeTurn.turnRef);
          const terminal = matching.find((play) => play.recoveryCandidate !== true);
          if (!terminal) {
            const durable = matching.find((play) => play.recoveryCandidate === true);
            entry.recentPlays = entry.recentPlays.filter((play) => !(play.turnRef === activeTurn.turnRef && play.recoveryCandidate === true));
            entry.currentPlay = recoveredPlay(activeTurn, durable);
          }
        }
        entry.workState = 'working';
      } else if (entry.workState === 'disconnected') {
        if (entry.currentPlay) {
          // Coach cannot know how a Play it lost sight of ended.
          pushRecent(entry, recentOf(entry.currentPlay, 'unknown', this.now()));
          entry.currentPlay = undefined;
          entry.workState = 'unknown';
        } else {
          entry.workState = controlled && candidate.state === 'ready' ? 'idle' : 'unknown';
        }
      } else if (controlled && candidate.state !== 'busy' && entry.workState === 'working' && !this.pendingFor(gameId, candidate.instanceId)) {
        // A Controlled Player that reports anything but busy (ready, unavailable, needs
        // verification) is not running a turn Coach can see.
        if (entry.currentPlay) pushRecent(entry, recentOf(entry.currentPlay, 'unknown', this.now()));
        entry.currentPlay = undefined;
        entry.workState = 'unknown';
      } else if (controlled && candidate.state === 'ready' && entry.workState === 'unknown' && !entry.currentPlay && entry.recentPlays.length === 0) {
        entry.workState = 'idle';
      }
      const committed = this.commit(entry, before, this.now());
      if (!existed && !committed) this.changed(gameId);
    }
    // Capabilities list only on-field instances. When the full roster is known, a
    // benched instance keeps its history (it still owns its context); only instances
    // that left the Team leave the Ledger.
    const stillOnTeam = rosterInstanceIds ?? present;
    for (const [key, entry] of this.entries) {
      if (entry.gameId === gameId && !stillOnTeam.has(entry.playerInstanceId)) {
        this.entries.delete(key);
        this.changed(gameId);
      }
    }
  }

  /** Called after every mutation; the Control Plane persists on it. */
  onChange: ((gameId: string) => void) | undefined;

  private changed(gameId: string): void { this.onChange?.(gameId); }

  /**
   * Durable projection: history and report ownership survive a Control Plane
   * replacement. Activity does not — it is re-learned from the Stadiums, so a
   * restored instance is Unknown until evidence arrives, and a Play that was running
   * is recorded as Unknown rather than assumed finished.
   */
  serialize(): { version: 1; entries: unknown[]; seenReports: Record<string, string[]> } {
    return {
      version: 1,
      entries: [...this.entries.values()].map((entry) => ({
        gameId: entry.gameId,
        playerInstanceId: entry.playerInstanceId,
        playerType: entry.playerType,
        recentPlays: entry.currentPlay
          ? [{ ...recentOf(entry.currentPlay, 'unknown', entry.updatedAt), recoveryCandidate: true as const }, ...entry.recentPlays].slice(0, RECENT_PLAY_LIMIT)
          : entry.recentPlays,
        reports: entry.reports
      })),
      seenReports: Object.fromEntries([...this.seenReports.entries()].map(([gameId, paths]) => [gameId, [...paths].slice(-500)]))
    };
  }

  restore(data: unknown): void {
    const record = data as { version?: unknown; entries?: unknown; seenReports?: unknown } | undefined;
    if (!record || record.version !== 1 || !Array.isArray(record.entries)) return;
    for (const raw of record.entries) {
      const item = raw as Partial<MutableEntry>;
      if (typeof item.gameId !== 'string' || typeof item.playerInstanceId !== 'string') continue;
      const entry = this.entry(item.gameId, item.playerInstanceId, typeof item.playerType === 'string' ? item.playerType : undefined);
      const before = fingerprint(entry);
      entry.workState = 'unknown';
      entry.recentPlays = Array.isArray(item.recentPlays) ? item.recentPlays.slice(0, RECENT_PLAY_LIMIT) as LedgerRecentPlay[] : [];
      entry.reports = Array.isArray(item.reports) ? item.reports.slice(0, REPORT_LINK_LIMIT) as LedgerReportLink[] : [];
      this.commit(entry, before, this.now());
    }
    if (record.seenReports && typeof record.seenReports === 'object') {
      for (const [gameId, paths] of Object.entries(record.seenReports as Record<string, unknown>)) {
        if (Array.isArray(paths)) this.seenReports.set(gameId, new Set(paths.filter((p): p is string => typeof p === 'string')));
      }
    }
  }

  /**
   * Link newly written reports to the exact instance that wrote them — only when
   * exactly one instance in that Game was running (or had just finished) a Play at
   * the report's write time. Ambiguous reports stay unattributed.
   */
  recordReports(gameId: string | undefined, reports: readonly unknown[] | undefined): void {
    if (!gameId || !Array.isArray(reports)) return;
    const seen = this.seenReports.get(gameId);
    const valid = reports
      .map((raw) => raw as { path?: unknown; filename?: unknown; mtime?: unknown; provenance?: ReportProvenance })
      .filter((report): report is { path: string; filename?: string; mtime: number; provenance?: ReportProvenance } => typeof report.path === 'string' && typeof report.mtime === 'number');

    // Explicit provenance is authoritative whenever present — even for reports that
    // predate the Ledger — but only for an instance of THIS Game.
    for (const report of valid) {
      const declared = report.provenance;
      if (!declared || typeof declared.playerInstanceId !== 'string') continue;
      if (declared.gameId !== undefined && declared.gameId !== gameId) continue;
      const entry = this.entries.get(key(gameId, declared.playerInstanceId));
      if (!entry) continue;
      const existing = entry.reports.find((link) => link.path === report.path);
      const alreadyCanonical = existing?.attribution === 'explicit-provenance'
        && existing.clientRef === declared.clientRef
        && existing.mtime === report.mtime;
      if (alreadyCanonical) continue;
      // A report may first arrive without its final marker and receive a conservative
      // timing link. Once explicit provenance appears, remove every older projection
      // of that path in this Game before attaching it to its declared exact owner.
      for (const candidate of this.entries.values()) {
        if (candidate.gameId !== gameId) continue;
        const before = fingerprint(candidate);
        candidate.reports = candidate.reports.filter((link) => link.path !== report.path);
        this.commit(candidate, before, this.now());
      }
      const before = fingerprint(entry);
      entry.reports.unshift({
        path: report.path,
        filename: report.filename,
        mtime: report.mtime,
        attribution: 'explicit-provenance',
        clientRef: declared.clientRef,
        provenance: { ...declared },
        ...(existing?.acknowledgedAt !== undefined ? { acknowledgedAt: existing.acknowledgedAt } : {})
      });
      entry.reports.length = Math.min(entry.reports.length, REPORT_LINK_LIMIT);
      this.commit(entry, before, this.now());
    }

    if (!seen) {
      // Reports that existed before the Ledger was watching have no known author.
      this.seenReports.set(gameId, new Set(valid.map((report) => report.path)));
      this.changed(gameId);
      return;
    }
    for (const report of valid) {
      if (seen.has(report.path)) continue;
      seen.add(report.path);
      if (report.provenance?.playerInstanceId) continue; // attributed explicitly above
      const owners: Array<{ entry: MutableEntry; clientRef?: string }> = [];
      for (const entry of this.entries.values()) {
        if (entry.gameId !== gameId) continue;
        if (entry.currentPlay && entry.currentPlay.startedAt <= report.mtime) {
          owners.push({ entry, clientRef: entry.currentPlay.clientRef });
          continue;
        }
        const last = entry.recentPlays[0];
        if (last && last.outcome !== 'not-sent' && last.startedAt <= report.mtime && report.mtime <= last.finishedAt + REPORT_GRACE_MS) {
          owners.push({ entry, clientRef: last.clientRef });
        }
      }
      if (owners.length !== 1) continue;
      const { entry, clientRef } = owners[0];
      const before = fingerprint(entry);
      entry.reports.unshift({ path: report.path, filename: report.filename, mtime: report.mtime, attribution: 'single-active-play', clientRef });
      entry.reports.length = Math.min(entry.reports.length, REPORT_LINK_LIMIT);
      this.commit(entry, before, this.now());
    }
    this.changed(gameId);
  }

  /** Queue storage stays in PlayQueue; this advances the canonical view revision. */
  recordQueueMutation(gameId: string, playerInstanceId: string): void {
    if (!gameId || !playerInstanceId) return;
    this.touch(this.entry(gameId, playerInstanceId), this.now());
  }

  hasPendingDispatch(gameId: string, playerInstanceId: string): boolean {
    return Boolean(this.pendingFor(gameId, playerInstanceId));
  }

  /** Idempotent, Game-scoped acknowledgement using existing Ledger records only. */
  acknowledge(input: { gameId: string; reportPath?: string; instanceId?: string; playRef?: string }): { found: boolean; changed: boolean; instanceId?: string } {
    if (!input.gameId) return { found: false, changed: false };
    const at = this.now();
    if (input.reportPath) {
      for (const entry of this.entries.values()) {
        if (entry.gameId !== input.gameId || (input.instanceId && entry.playerInstanceId !== input.instanceId)) continue;
        const report = entry.reports.find((link) => link.path === input.reportPath
          && (!input.playRef || link.clientRef === input.playRef));
        if (!report) continue;
        if (report.acknowledgedAt !== undefined) return { found: true, changed: false, instanceId: entry.playerInstanceId };
        const before = fingerprint(entry);
        entry.reports = entry.reports.map((candidate) => candidate === report ? { ...candidate, acknowledgedAt: at } : candidate);
        this.commit(entry, before, at);
        return { found: true, changed: true, instanceId: entry.playerInstanceId };
      }
      return { found: false, changed: false };
    }

    if (!input.instanceId || !input.playRef) return { found: false, changed: false };
    const entry = this.entries.get(key(input.gameId, input.instanceId));
    const play = entry?.recentPlays.find((candidate) => (candidate.clientRef === input.playRef || candidate.turnRef === input.playRef)
      && ['failed', 'interrupted', 'unknown', 'not-sent'].includes(candidate.outcome));
    if (!entry) return { found: false, changed: false };
    if (!play && entry.workState === 'unknown' && entry.currentPlay
      && (entry.currentPlay.clientRef === input.playRef || entry.currentPlay.turnRef === input.playRef)) {
      const before = fingerprint(entry);
      pushRecent(entry, { ...recentOf(entry.currentPlay, 'unknown', at), acknowledgedAt: at });
      entry.currentPlay = undefined;
      entry.workState = 'idle';
      this.commit(entry, before, at);
      return { found: true, changed: true, instanceId: entry.playerInstanceId };
    }
    if (!play) return { found: false, changed: false };
    if (play.acknowledgedAt !== undefined) return { found: true, changed: false, instanceId: entry.playerInstanceId };
    const before = fingerprint(entry);
    entry.recentPlays = entry.recentPlays.map((candidate) => candidate === play ? { ...candidate, acknowledgedAt: at } : candidate);
    this.commit(entry, before, at);
    return { found: true, changed: true, instanceId: entry.playerInstanceId };
  }

  get(gameId: string, playerInstanceId: string): InstanceLedgerEntry | undefined {
    const entry = this.entries.get(key(gameId, playerInstanceId));
    return entry ? snapshot(entry) : undefined;
  }

  forGame(gameId: string | undefined): InstanceLedgerEntry[] {
    if (!gameId) return [];
    return [...this.entries.values()].filter((entry) => entry.gameId === gameId).map(snapshot);
  }

  private entry(gameId: string, playerInstanceId: string, playerType?: string): MutableEntry {
    const id = key(gameId, playerInstanceId);
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { gameId, playerInstanceId, playerType, revision: ++this.revisionCounter, workState: 'unknown', recentPlays: [], reports: [], updatedAt: this.now() };
      this.entries.set(id, entry);
    } else if (playerType && !entry.playerType) {
      entry.playerType = playerType;
    }
    return entry;
  }

  private pendingFor(gameId: string, instanceId: string): DispatchRecord | undefined {
    for (const record of this.sending.values()) {
      if (record.gameId === gameId && record.playerInstanceId === instanceId) return record;
    }
    return undefined;
  }

  private touch(entry: MutableEntry, at: number): void {
    entry.updatedAt = at;
    entry.revision = ++this.revisionCounter;
    this.changed(entry.gameId);
  }

  private commit(entry: MutableEntry, before: string, at: number): boolean {
    if (fingerprint(entry) === before) return false;
    this.touch(entry, at);
    return true;
  }
}

function key(gameId: string, instanceId: string): string { return `${gameId} ${instanceId}`; }

function toPlay(record: DispatchRecord): LedgerPlay {
  const reportRequested = record.reportRequested !== undefined
    ? record.reportRequested
    : (record.clientRef?.includes('report') ? true : false);
  return {
    clientRef: record.clientRef,
    playLabel: record.playLabel,
    promptSummary: record.promptSummary,
    model: record.model,
    effort: record.effort,
    transport: record.transport,
    startedAt: record.at ?? Date.now(),
    ...(record.touches?.length ? { touches: [...record.touches] } : {}),
    ...(reportRequested !== undefined ? { reportRequested } : {})
  };
}

function readActiveTurn(value: unknown): ActiveTurnEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const turn = value as Record<string, unknown>;
  if (typeof turn.turnRef !== 'string' || !turn.turnRef) return undefined;
  if (turn.state !== 'accepted' && turn.state !== 'started') return undefined;
  if (typeof turn.startedAt !== 'number' || !Number.isFinite(turn.startedAt) || turn.startedAt < 0) return undefined;
  return { turnRef: turn.turnRef, state: turn.state, startedAt: turn.startedAt };
}

function recoveredPlay(activeTurn: ActiveTurnEvidence, durable?: LedgerRecentPlay): LedgerPlay {
  return {
    clientRef: durable?.clientRef ?? activeTurn.turnRef,
    ...(durable?.playLabel ? { playLabel: durable.playLabel } : {}),
    ...(durable?.promptSummary ? { promptSummary: durable.promptSummary } : {}),
    ...(durable?.activitySummary ? { activitySummary: durable.activitySummary } : {}),
    ...(durable?.model ? { model: durable.model } : {}),
    ...(durable?.effort ? { effort: durable.effort } : {}),
    startedAt: durable?.startedAt ?? activeTurn.startedAt,
    ...(activeTurn.state === 'started' ? { executionStartedAt: activeTurn.startedAt } : {}),
    turnRef: activeTurn.turnRef,
    recovered: true,
    ...(durable?.reportRequested !== undefined ? { reportRequested: durable.reportRequested } : {})
  };
}

function playFromRecoveryCandidate(play: LedgerRecentPlay): LedgerPlay {
  return {
    clientRef: play.clientRef,
    ...(play.playLabel ? { playLabel: play.playLabel } : {}),
    ...(play.promptSummary ? { promptSummary: play.promptSummary } : {}),
    ...(play.activitySummary ? { activitySummary: play.activitySummary } : {}),
    ...(play.model ? { model: play.model } : {}),
    ...(play.effort ? { effort: play.effort } : {}),
    startedAt: play.startedAt,
    ...(play.executionStartedAt !== undefined ? { executionStartedAt: play.executionStartedAt } : {}),
    ...(play.turnRef ? { turnRef: play.turnRef } : {}),
    recovered: true,
    ...(play.reportRequested !== undefined ? { reportRequested: play.reportRequested } : {})
  };
}

function recentOf(play: LedgerPlay, outcome: string, finishedAt: number): LedgerRecentPlay {
  const known: LedgerOutcome = outcome === 'completed' || outcome === 'partial' || outcome === 'blocked'
    || outcome === 'failed' || outcome === 'interrupted' || outcome === 'not-sent' ? outcome : 'unknown';
  return {
    clientRef: play.clientRef,
    playLabel: play.playLabel,
    promptSummary: play.promptSummary,
    activitySummary: play.activitySummary,
    model: play.model,
    effort: play.effort,
    outcome: known,
    startedAt: play.startedAt,
    executionStartedAt: play.executionStartedAt,
    turnRef: play.turnRef,
    finishedAt,
    ...(play.reportRequested !== undefined ? { reportRequested: play.reportRequested } : {})
  };
}

function pushRecent(entry: MutableEntry, play: LedgerRecentPlay): void {
  entry.recentPlays.unshift(play);
  if (entry.recentPlays.length > RECENT_PLAY_LIMIT) entry.recentPlays.length = RECENT_PLAY_LIMIT;
}

function snapshot(entry: MutableEntry): InstanceLedgerEntry {
  return {
    gameId: entry.gameId,
    playerInstanceId: entry.playerInstanceId,
    playerType: entry.playerType,
    revision: entry.revision,
    workState: entry.workState,
    currentPlay: entry.currentPlay ? { ...entry.currentPlay } : undefined,
    recentPlays: entry.recentPlays.map((play) => ({ ...play })),
    reports: entry.reports.map((report) => ({ ...report })),
    updatedAt: entry.updatedAt
  };
}

function fingerprint(entry: MutableEntry): string {
  return JSON.stringify({
    playerType: entry.playerType,
    workState: entry.workState,
    currentPlay: entry.currentPlay,
    recentPlays: entry.recentPlays,
    reports: entry.reports
  });
}
