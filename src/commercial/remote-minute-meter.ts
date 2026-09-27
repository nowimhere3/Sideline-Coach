import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FeatureGate, GateDecision } from './gate';

/**
 * S57.2 §7 / C4 — Remote Minute metering.
 *
 * One Remote Minute = one UTC wall-clock minute (floor(ms / 60 000)) during which at least
 * one paired phone was connected to this Sideline: a remote-device `/api/events` stream was
 * open at some instant of that minute, or an authenticated remote-device request was handled
 * in it. Minutes are counted once per install: the usage store keeps a minute-index SET, so
 * two phones, many tabs and reconnect storms inside one minute still consume one minute.
 *
 * Minutes are charged as they are reached — on stream open/close, on each request, and on a
 * 60 s checkpoint while any remote stream is open — and every charge is durable (journaled)
 * immediately. A crash therefore loses at most the minutes after the last checkpoint and can
 * never over-count. Continuous presence between checkpoints is filled in only when the gap
 * is short (≤ 2 minutes): after a suspended process or a sleeping laptop only the current
 * minute is charged, so a stale "open" stream can never manufacture minutes.
 *
 * The meter only OBSERVES runtime session state (the daemon's SSE map and request seam).
 * Mobile client code, the relay protocol and the tunnel are untouched.
 *
 * Exhaustion: when a finite allowance reaches zero a grace episode starts (grant.graceMinutes,
 * default 5). During grace remote requests continue; afterwards they are refused and remote
 * streams are closed. The episode is persisted so a restart never grants a fresh grace, and it
 * clears as soon as the allowance is available again (reset or new grant). Unlimited never
 * enters exhaustion.
 */

export const REMOTE_CAPABILITY = 'remote.access' as const;
export const DEFAULT_REMOTE_GRACE_MINUTES = 5;
export const REMOTE_CHECKPOINT_MS = 60_000;
/** Longest gap (minutes) between marks that is still treated as continuous presence. */
export const MAX_CONTINUOUS_FILL_MINUTES = 2;
export const REMOTE_METER_STATE_FILE = 'remote-meter.json';
const MINUTE_MS = 60_000;

export type RemoteAdmission =
  | { readonly state: 'allow'; readonly decision: GateDecision }
  | { readonly state: 'grace'; readonly decision: GateDecision; readonly graceUntil: number }
  | { readonly state: 'exhausted'; readonly decision: GateDecision }
  | { readonly state: 'not-entitled'; readonly decision: GateDecision };

interface GraceEpisode {
  readonly graceStartedAt: number;
  readonly graceUntil: number;
}

export interface RemoteMinuteMeterOptions {
  readonly gate: Pick<FeatureGate, 'check' | 'chargeMinutes'>;
  /** Grace declared by the in-force grants, if any. */
  readonly graceMinutes: () => number | undefined;
  /** Directory for the persisted grace episode (normally `~/.sideline/entitlement`). */
  readonly dir: string;
  readonly now?: () => number;
  readonly timers?: {
    readonly setInterval: (callback: () => void, ms: number) => unknown;
    readonly clearInterval: (handle: unknown) => void;
  };
  readonly checkpointMs?: number;
  /** Once per episode: a finite allowance just ran out and grace began. */
  readonly onGraceStarted?: (episode: GraceEpisode, decision: GateDecision) => void;
  /** Once per episode: grace is over; the daemon closes remote streams. */
  readonly onGraceEnded?: (decision: GateDecision) => void;
  /**
   * S57.2 §14 (C8): a Remote session — continuous stream presence, where a reconnect within
   * REMOTE_SESSION_MERGE_MS continues the same session — has ended. Observer only.
   */
  readonly onSessionEnded?: (session: RemoteSessionSummary) => void;
  /** Timer for the session-merge window (separate from the checkpoint timers). */
  readonly sessionTimers?: {
    readonly setTimeout: (callback: () => void, ms: number) => unknown;
    readonly clearTimeout: (handle: unknown) => void;
  };
  readonly warn?: (message: string) => void;
}

/** A stream gap shorter than this is a reconnect inside the same session. */
export const REMOTE_SESSION_MERGE_MS = 60_000;

export interface RemoteSessionSummary {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  /** Stream re-opens that continued the session (reconnects). */
  readonly reconnects: number;
}

export class RemoteMinuteMeter {
  private readonly streams = new Set<unknown>();
  /** Last minute charged while at least one stream stayed open (continuous-presence anchor). */
  private anchorMinute: number | undefined;
  /** Memo: the minute most recently confirmed charged (skips repeat work within a minute). */
  private chargedMinute: number | undefined;
  private timer: unknown;
  private episode: GraceEpisode | undefined;
  private graceEndedFor: number | undefined;
  /** Current Remote session (C8 observer): start, reconnects, and when the last stream closed. */
  private session: { startedAt: number; reconnects: number; lastClosedAt?: number; pending?: unknown } | undefined;
  private readonly sessionTimers: NonNullable<RemoteMinuteMeterOptions['sessionTimers']>;
  private readonly stateFile: string;
  private readonly now: () => number;
  private readonly timers: NonNullable<RemoteMinuteMeterOptions['timers']>;
  private readonly checkpointMs: number;
  private readonly warn: (message: string) => void;

  constructor(private readonly options: RemoteMinuteMeterOptions) {
    this.stateFile = path.join(options.dir, REMOTE_METER_STATE_FILE);
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? {
      setInterval: (callback, ms) => { const handle = setInterval(callback, ms); handle.unref?.(); return handle; },
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
    };
    this.checkpointMs = options.checkpointMs ?? REMOTE_CHECKPOINT_MS;
    this.sessionTimers = options.sessionTimers ?? {
      setTimeout: (callback, ms) => { const handle = setTimeout(callback, ms); handle.unref?.(); return handle; },
      clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
    };
    this.warn = options.warn ?? (() => undefined);
    this.episode = this.readEpisode();
  }

  get openStreams(): number {
    return this.streams.size;
  }

  get graceEpisode(): GraceEpisode | undefined {
    return this.episode;
  }

  /** A remote-device SSE stream opened. */
  streamOpened(key: unknown): void {
    if (this.streams.has(key)) return;
    this.mark();
    this.streams.add(key);
    this.anchorMinute = this.minute();
    if (this.timer === undefined) this.timer = this.timers.setInterval(() => this.tick(), this.checkpointMs);
    this.sessionStreamOpened();
  }

  /** A remote-device SSE stream closed. The closing minute counts. */
  streamClosed(key: unknown): void {
    if (!this.streams.has(key)) return;
    this.mark();
    this.streams.delete(key);
    if (this.streams.size === 0) {
      this.anchorMinute = undefined;
      this.stopTimer();
      this.sessionAllStreamsClosed();
    }
  }

  /** An authenticated remote-device request is being handled. */
  touch(): void {
    this.mark();
  }

  /** 60 s checkpoint while any remote stream is open; also ends grace on time. */
  tick(): void {
    this.mark();
    const episode = this.episode;
    if (episode && this.now() >= episode.graceUntil && this.graceEndedFor !== episode.graceStartedAt) {
      const decision = this.options.gate.check(REMOTE_CAPABILITY);
      if (!decision.allowed && decision.reason === 'allowance-exhausted') {
        this.graceEndedFor = episode.graceStartedAt;
        this.options.onGraceEnded?.(decision);
      }
    }
  }

  /** May a remote request proceed right now? Pure except for clearing a finished episode. */
  admission(): RemoteAdmission {
    const decision = this.options.gate.check(REMOTE_CAPABILITY);
    if (decision.allowed) {
      if (this.episode) this.clearEpisode();
      return { state: 'allow', decision };
    }
    if (decision.reason !== 'allowance-exhausted') return { state: 'not-entitled', decision };
    const episode = this.episode;
    if (episode && this.now() < episode.graceUntil) return { state: 'grace', decision, graceUntil: episode.graceUntil };
    return { state: 'exhausted', decision };
  }

  /** Final checkpoint and timer cleanup (daemon stop). Streams are forgotten, not charged further. */
  stop(): void {
    const hadStreams = this.streams.size > 0;
    if (hadStreams) this.mark();
    this.streams.clear();
    this.anchorMinute = undefined;
    this.stopTimer();
    if (this.session) this.endSession(hadStreams ? this.now() : this.session.lastClosedAt ?? this.now());
  }

  private sessionStreamOpened(): void {
    if (!this.session) {
      this.session = { startedAt: this.now(), reconnects: 0 };
      return;
    }
    if (this.session.pending !== undefined) {
      // Reopened inside the merge window: the same session continues.
      this.sessionTimers.clearTimeout(this.session.pending);
      this.session.pending = undefined;
      this.session.lastClosedAt = undefined;
      this.session.reconnects += 1;
    }
  }

  private sessionAllStreamsClosed(): void {
    const session = this.session;
    if (!session) return;
    session.lastClosedAt = this.now();
    session.pending = this.sessionTimers.setTimeout(() => {
      if (this.session === session && this.streams.size === 0) this.endSession(session.lastClosedAt ?? this.now());
    }, REMOTE_SESSION_MERGE_MS);
  }

  private endSession(endedAt: number): void {
    const session = this.session;
    if (!session) return;
    if (session.pending !== undefined) this.sessionTimers.clearTimeout(session.pending);
    this.session = undefined;
    try {
      this.options.onSessionEnded?.({ startedAt: session.startedAt, endedAt, durationMs: Math.max(0, endedAt - session.startedAt), reconnects: session.reconnects });
    } catch {
      // Observers never affect metering.
    }
  }

  private minute(): number {
    return Math.floor(this.now() / MINUTE_MS);
  }

  private mark(): void {
    const current = this.minute();
    const continuous = this.streams.size > 0 && this.anchorMinute !== undefined
      && current >= this.anchorMinute && current - this.anchorMinute <= MAX_CONTINUOUS_FILL_MINUTES;
    const first = continuous ? this.anchorMinute! : current;
    if (this.streams.size > 0) this.anchorMinute = current;
    if (first === current && this.chargedMinute === current) return;
    let result;
    try {
      result = this.options.gate.chargeMinutes(REMOTE_CAPABILITY, first, current);
    } catch (error) {
      this.warn(`Remote minutes could not be metered: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.chargedMinute = current;
    const { decision } = result;
    if (!decision.allowed && decision.reason === 'allowance-exhausted' && !this.episode) this.startEpisode(decision);
  }

  private startEpisode(decision: GateDecision): void {
    const graceStartedAt = this.now();
    const minutes = this.options.graceMinutes() ?? DEFAULT_REMOTE_GRACE_MINUTES;
    this.episode = { graceStartedAt, graceUntil: graceStartedAt + minutes * MINUTE_MS };
    this.writeEpisode();
    this.options.onGraceStarted?.(this.episode, decision);
  }

  private clearEpisode(): void {
    this.episode = undefined;
    this.graceEndedFor = undefined;
    try { fs.rmSync(this.stateFile, { force: true }); } catch { /* best effort */ }
  }

  private stopTimer(): void {
    if (this.timer === undefined) return;
    this.timers.clearInterval(this.timer);
    this.timer = undefined;
  }

  private readEpisode(): GraceEpisode | undefined {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as { v?: unknown; graceStartedAt?: unknown; graceUntil?: unknown };
      if (parsed.v !== 1 || typeof parsed.graceStartedAt !== 'number' || typeof parsed.graceUntil !== 'number') return undefined;
      if (!(parsed.graceUntil >= parsed.graceStartedAt)) return undefined;
      return { graceStartedAt: parsed.graceStartedAt, graceUntil: parsed.graceUntil };
    } catch {
      return undefined;
    }
  }

  private writeEpisode(): void {
    if (!this.episode) return;
    try {
      fs.mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, ...this.episode }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.stateFile);
    } catch (error) {
      this.warn(`Remote grace episode could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
