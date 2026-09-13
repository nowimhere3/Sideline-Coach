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

import type { InstanceWorkState } from '../routing-policy';

export const RECENT_PLAY_LIMIT = 10;
export const REPORT_LINK_LIMIT = 10;
/** A report written this soon after a Play finished can still belong to it. */
export const REPORT_GRACE_MS = 2 * 60_000;

export type LedgerOutcome = 'completed' | 'failed' | 'interrupted' | 'unknown' | 'not-sent';

export interface LedgerPlay {
  readonly clientRef: string;
  readonly playLabel?: string;
  readonly promptSummary?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly transport?: 'controlled' | 'legacy';
  readonly startedAt: number;
  readonly turnRef?: string;
}

export interface LedgerRecentPlay {
  readonly clientRef: string;
  readonly playLabel?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly outcome: LedgerOutcome;
  readonly summary?: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export interface LedgerReportLink {
  readonly path: string;
  readonly filename?: string;
  readonly mtime: number;
  /** How Coach knows: the only Play running (or just finished) in that Game when it was written. */
  readonly attribution: 'single-active-play';
  readonly clientRef?: string;
}

export interface InstanceLedgerEntry {
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerType?: string;
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
}

export interface TurnRecord {
  instanceId?: string;
  state?: string;
  turnRef?: string;
  summary?: string;
  at?: number;
}

interface MutableEntry {
  gameId: string;
  playerInstanceId: string;
  playerType?: string;
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
}

export class InstanceWorkLedger {
  private readonly entries = new Map<string, MutableEntry>();
  /** Dispatches sent but not yet confirmed by the Stadium, by clientRef. */
  private readonly sending = new Map<string, DispatchRecord>();
  private readonly seenReports = new Map<string, Set<string>>();

  constructor(private readonly now: () => number = Date.now) {}

  /** A Play was routed to an exact instance. Nothing is claimed until the Stadium confirms. */
  recordDispatch(record: DispatchRecord): void {
    this.sending.set(record.clientRef, { ...record, at: record.at ?? this.now() });
    const entry = this.entry(record.gameId, record.playerInstanceId, record.playerType);
    entry.updatedAt = this.now();
  }

  /** The router's delivery verdict for a dispatch. */
  recordDelivery(clientRef: string, state: string, detail: { turnRef?: string; error?: string } = {}): void {
    const dispatch = this.sending.get(clientRef);
    if (!dispatch) return;
    if (state === 'sending') return;
    this.sending.delete(clientRef);
    const entry = this.entry(dispatch.gameId, dispatch.playerInstanceId, dispatch.playerType);
    const at = this.now();
    if (state === 'received') {
      // The Stadium's turn events usually arrive first; a very fast Play may even
      // have finished already, and must not be resurrected as working.
      const alreadyFinished = entry.recentPlays.some((play) => play.clientRef === dispatch.clientRef);
      if (!alreadyFinished) {
        const knownTurnRef = entry.currentPlay?.clientRef === dispatch.clientRef ? entry.currentPlay.turnRef : undefined;
        entry.currentPlay = { ...toPlay(dispatch), turnRef: detail.turnRef ?? knownTurnRef };
        // A terminal-transport Player usually gives no completion signal, so its activity
        // is Unknown — unless the Stadium already proved a command started (shell integration).
        entry.workState = dispatch.transport === 'legacy' && entry.workState !== 'working' ? 'unknown' : 'working';
      }
    } else if (state === 'failed') {
      pushRecent(entry, { ...recentOf(toPlay(dispatch), 'not-sent', at), summary: detail.error });
    } else if (state === 'unknown') {
      entry.currentPlay = { ...toPlay(dispatch), turnRef: detail.turnRef };
      entry.workState = 'unknown';
    }
    entry.updatedAt = at;
  }

  /** Semantic turn lifecycle from the Stadium (Controlled Players). */
  recordTurn(gameId: string, turn: TurnRecord): void {
    const instanceId = typeof turn.instanceId === 'string' ? turn.instanceId : undefined;
    if (!instanceId || !gameId) return;
    const entry = this.entry(gameId, instanceId);
    const at = this.now();
    const state = turn.state;
    if (state === 'accepted' || state === 'started') {
      if (!entry.currentPlay) {
        const pending = this.pendingFor(gameId, instanceId);
        entry.currentPlay = pending
          ? { ...toPlay(pending), turnRef: turn.turnRef }
          : { clientRef: turn.turnRef ?? `turn-${at}`, startedAt: turn.at ?? at, turnRef: turn.turnRef };
      } else if (turn.turnRef && !entry.currentPlay.turnRef) {
        entry.currentPlay = { ...entry.currentPlay, turnRef: turn.turnRef };
      }
      entry.workState = 'working';
    } else if (state === 'completed' || state === 'failed' || state === 'interrupted' || state === 'unknown') {
      const play = entry.currentPlay ?? (this.pendingFor(gameId, instanceId) ? toPlay(this.pendingFor(gameId, instanceId)!) : undefined);
      if (play && (!turn.turnRef || !play.turnRef || play.turnRef === turn.turnRef)) {
        pushRecent(entry, { ...recentOf(play, state, at), summary: turn.summary });
        entry.currentPlay = undefined;
      }
      entry.workState = state === 'completed' ? 'completed' : state === 'unknown' ? 'unknown' : 'idle';
    } else {
      return;
    }
    entry.updatedAt = at;
  }

  /** The Stadium carrying this Game went away. Work in progress becomes Disconnected, never Completed. */
  markGameDisconnected(gameId: string | undefined): void {
    if (!gameId) return;
    for (const entry of this.entries.values()) {
      if (entry.gameId !== gameId) continue;
      entry.workState = 'disconnected';
      entry.updatedAt = this.now();
    }
  }

  /**
   * Reconcile with the Stadium's canonical routing projection: new instances get
   * an entry, removed instances leave, and a reconnected instance's activity is
   * only what the Stadium can prove right now.
   */
  observeRoster(gameId: string | undefined, capabilities: readonly unknown[] | undefined): void {
    if (!gameId || !Array.isArray(capabilities)) return;
    const present = new Set<string>();
    for (const raw of capabilities) {
      const candidate = raw as RosterCandidate;
      if (typeof candidate?.instanceId !== 'string') continue;
      present.add(candidate.instanceId);
      const entry = this.entry(gameId, candidate.instanceId, typeof candidate.playerType === 'string' ? candidate.playerType : undefined);
      const controlled = candidate.transport === 'controlled';
      if (candidate.state === 'busy') {
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
      } else if (controlled && candidate.state === 'ready' && entry.workState === 'working' && !this.pendingFor(gameId, candidate.instanceId)) {
        // A Controlled Player that reports ready is not running a turn.
        if (entry.currentPlay) pushRecent(entry, recentOf(entry.currentPlay, 'unknown', this.now()));
        entry.currentPlay = undefined;
        entry.workState = 'unknown';
      } else if (controlled && candidate.state === 'ready' && entry.workState === 'unknown' && !entry.currentPlay && entry.recentPlays.length === 0) {
        entry.workState = 'idle';
      }
    }
    for (const [key, entry] of this.entries) {
      if (entry.gameId === gameId && !present.has(entry.playerInstanceId)) this.entries.delete(key);
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
      .map((raw) => raw as { path?: unknown; filename?: unknown; mtime?: unknown })
      .filter((report): report is { path: string; filename?: string; mtime: number } => typeof report.path === 'string' && typeof report.mtime === 'number');
    if (!seen) {
      // Reports that existed before the Ledger was watching have no known author.
      this.seenReports.set(gameId, new Set(valid.map((report) => report.path)));
      return;
    }
    for (const report of valid) {
      if (seen.has(report.path)) continue;
      seen.add(report.path);
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
      entry.reports.unshift({ path: report.path, filename: report.filename, mtime: report.mtime, attribution: 'single-active-play', clientRef });
      entry.reports.length = Math.min(entry.reports.length, REPORT_LINK_LIMIT);
      entry.updatedAt = this.now();
    }
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
      entry = { gameId, playerInstanceId, playerType, workState: 'unknown', recentPlays: [], reports: [], updatedAt: this.now() };
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
}

function key(gameId: string, instanceId: string): string { return `${gameId} ${instanceId}`; }

function toPlay(record: DispatchRecord): LedgerPlay {
  return {
    clientRef: record.clientRef,
    playLabel: record.playLabel,
    promptSummary: record.promptSummary,
    model: record.model,
    effort: record.effort,
    transport: record.transport,
    startedAt: record.at ?? Date.now()
  };
}

function recentOf(play: LedgerPlay, outcome: string, finishedAt: number): LedgerRecentPlay {
  const known: LedgerOutcome = outcome === 'completed' || outcome === 'failed' || outcome === 'interrupted' || outcome === 'not-sent' ? outcome : 'unknown';
  return { clientRef: play.clientRef, playLabel: play.playLabel, model: play.model, effort: play.effort, outcome: known, startedAt: play.startedAt, finishedAt };
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
    workState: entry.workState,
    currentPlay: entry.currentPlay ? { ...entry.currentPlay } : undefined,
    recentPlays: entry.recentPlays.map((play) => ({ ...play })),
    reports: entry.reports.map((report) => ({ ...report })),
    updatedAt: entry.updatedAt
  };
}
