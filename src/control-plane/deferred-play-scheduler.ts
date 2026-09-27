/**
 * R9 DeferredPlay scheduler: turns wakeups into fresh revalidation, and a proven-ready
 * continuation into exactly one send to the same Player and conversation.
 *
 * Wakeups (all mean "check now", never "it is safe"):
 *   - AlarmEngine `alarm:reset_boundary_reached` / `alarm:recovered` for the armed pool
 *   - HealthAuthority changes (fresh resource truth arriving after a reset)
 *   - the exact Player finishing a turn, or its Game/roster changing (busy → free)
 *   - a fallback timer at horizon + 2 min, and again at the end of the recovery grace
 *   - startup (a reset that passed while Coach was closed is revalidated, not failed)
 *
 * Sending reuses the one routing/execution brain: `router.dispatch` in MANUAL to the exact
 * instance with `expectedSessionKey`, which Player Control proves before anything reaches the
 * provider (S57.23). Never the PlayQueue, never another Player.
 *
 * Exactly once, or UNKNOWN: the router's clientRef is minted here and persisted (write-ahead)
 * before the send. After a restart mid-send, only Work Ledger evidence of that exact clientRef
 * proves it was received; anything else becomes needs-attention. A newer Play on the Player also
 * blocks any further send, so an uncertain earlier send can never be followed by a second one.
 */

import * as crypto from 'node:crypto';
import type { PlayerRoutingCapability } from '../capability-types';
import type { AiAlarmEvent } from './alarm-engine';
import {
  CONTINUE_TASK_PROMPT,
  DEFERRED_PLAY_CONSTANTS,
  revalidateContinuation,
  type DeferredPlay,
  type DeferredPlayBook
} from './deferred-play';
import type { RoutingEconomicsSnapshot } from './routing-economics';
import type { DispatchOptions, DispatchResult } from './router';
import type { InstanceLedgerEntry } from './work-ledger';

export interface DeferredPlayGameView {
  readonly connected: boolean;
  readonly rosterSynchronized: boolean;
  readonly capabilities: readonly PlayerRoutingCapability[];
  readonly rosterInstanceIds?: ReadonlySet<string>;
  readonly names: ReadonlyMap<string, string>;
}

export interface DeferredPlaySchedulerDeps {
  readonly book: DeferredPlayBook;
  readonly now?: () => number;
  readonly economics: () => RoutingEconomicsSnapshot;
  readonly game: (gameId: string) => DeferredPlayGameView;
  readonly ledger: (gameId: string, playerInstanceId: string) => InstanceLedgerEntry | undefined;
  readonly dispatch: (options: DispatchOptions) => Promise<DispatchResult>;
  readonly onChange?: () => void;
  readonly log?: (message: string) => void;
  readonly timers?: {
    readonly set: (callback: () => void, delayMs: number) => unknown;
    readonly clear: (handle: unknown) => void;
  };
}

const MAX_TIMER_MS = 2 ** 31 - 1;

export class DeferredPlayScheduler {
  private readonly now: () => number;
  private readonly timers: NonNullable<DeferredPlaySchedulerDeps['timers']>;
  private readonly handles = new Map<string, unknown>();
  private readonly evaluating = new Set<string>();
  private readonly again = new Set<string>();
  private stopped = false;

  constructor(private readonly deps: DeferredPlaySchedulerDeps) {
    this.now = deps.now ?? Date.now;
    this.timers = deps.timers ?? {
      set: (callback, delayMs) => { const handle = setTimeout(callback, delayMs); handle.unref?.(); return handle; },
      clear: (handle) => clearTimeout(handle as NodeJS.Timeout)
    };
  }

  /** Startup: settle anything that was mid-send, then check every armed continuation now. */
  async start(): Promise<void> {
    for (const record of this.deps.book.active()) {
      if (record.state === 'firing') this.reconcileInterruptedSend(record);
    }
    this.deps.onChange?.();
    await this.wake({});
  }

  stop(): void {
    this.stopped = true;
    for (const handle of this.handles.values()) this.timers.clear(handle);
    this.handles.clear();
  }

  /** Alarm events matter only when they concern a pool something is waiting on. */
  onAlarm(event: AiAlarmEvent): Promise<void> {
    if (event.type !== 'alarm:reset_boundary_reached' && event.type !== 'alarm:recovered') return Promise.resolve();
    return this.wake({ pool: event.provider });
  }

  /** Check the matching waiting continuations now. Concurrent wakeups for one record collapse into one. */
  async wake(filter: { gameId?: string; playerInstanceId?: string; pool?: string; id?: string }): Promise<void> {
    if (this.stopped) return;
    const candidates = this.deps.book.active().filter((record) => record.state === 'waiting'
      && (!filter.id || record.id === filter.id)
      && (!filter.gameId || record.gameId === filter.gameId)
      && (!filter.playerInstanceId || record.playerInstanceId === filter.playerInstanceId)
      && (!filter.pool || record.condition.pool === filter.pool));
    await Promise.all(candidates.map((record) => this.evaluate(record.id)));
  }

  /** Dad pressed Retry: Work Ledger evidence first (never resend what already landed), then full checks. */
  async retry(id: string, gameId?: string): Promise<boolean> {
    const record = this.deps.book.get(id);
    if (!record || record.state !== 'needs-attention' || (gameId && record.gameId !== gameId)) return false;
    if (record.attempt && this.sendLanded(record, record.attempt.clientRef)) {
      this.deps.book.markHandedOff(id, record.attempt.clientRef);
      this.deps.onChange?.();
      return true;
    }
    if (!this.deps.book.retry(id, gameId)) return false;
    this.deps.onChange?.();
    await this.wake({ id });
    return true;
  }

  cancel(id: string, gameId?: string): DeferredPlay | undefined {
    const cancelled = this.deps.book.cancel(id, gameId);
    if (cancelled) {
      const handle = this.handles.get(id);
      if (handle !== undefined) this.timers.clear(handle);
      this.handles.delete(id);
      this.deps.onChange?.();
    }
    return cancelled;
  }

  /** A freshly armed continuation gets its fallback timer and an immediate check. */
  async armed(id: string): Promise<void> {
    this.schedule(this.deps.book.get(id));
    await this.wake({ id });
  }

  private async evaluate(id: string): Promise<void> {
    if (this.evaluating.has(id)) { this.again.add(id); return; }
    this.evaluating.add(id);
    try {
      do {
        this.again.delete(id);
        await this.evaluateOnce(id);
      } while (this.again.has(id) && !this.stopped);
    } catch (error) {
      this.deps.log?.(`Scheduled continuation ${id} check failed: ${error instanceof Error ? error.message : String(error)}`);
      this.deps.book.needsAttention(id, 'Coach hit a problem while checking this scheduled continuation. Try again or cancel.');
      this.deps.onChange?.();
    } finally {
      this.evaluating.delete(id);
    }
  }

  private async evaluateOnce(id: string): Promise<void> {
    const record = this.deps.book.get(id);
    if (!record || record.state !== 'waiting') return;
    const game = this.deps.game(record.gameId);
    const verdict = revalidateContinuation({
      record,
      now: this.now(),
      economics: this.deps.economics(),
      game,
      ...(game.rosterInstanceIds ? { rosterInstanceIds: game.rosterInstanceIds } : {}),
      capability: game.capabilities.find((candidate) => candidate.instanceId === record.playerInstanceId),
      entry: this.deps.ledger(record.gameId, record.playerInstanceId),
      playerName: game.names.get(record.playerInstanceId) ?? 'This Player'
    });
    if (verdict.kind === 'wait') {
      if (this.deps.book.noteWaiting(id, verdict.waitingFor)) this.deps.onChange?.();
      this.schedule(this.deps.book.get(id));
      return;
    }
    if (verdict.kind === 'attention') {
      this.deps.book.needsAttention(id, verdict.message);
      this.clearTimer(id);
      this.deps.onChange?.();
      return;
    }
    await this.send(record);
  }

  /** Write-ahead correlation, then the one send through the existing router. */
  private async send(record: DeferredPlay): Promise<void> {
    const clientRef = `ref_dp_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    if (!this.deps.book.beginFiring(record.id, clientRef)) return;
    this.clearTimer(record.id);
    this.deps.onChange?.();
    let result: DispatchResult;
    try {
      result = await this.deps.dispatch({
        gameId: record.gameId,
        routingMode: 'manual',
        playerInstanceId: record.playerInstanceId,
        ...(record.interrupted.model ? { model: record.interrupted.model } : {}),
        ...(record.interrupted.effort ? { effort: record.interrupted.effort } : {}),
        prompt: CONTINUE_TASK_PROMPT,
        expectedSessionKey: record.expectedSessionKey,
        clientRef
      });
    } catch (error) {
      result = { success: false, statusCode: 500, status: 'unknown', message: error instanceof Error ? error.message : String(error) };
    }
    const name = this.deps.game(record.gameId).names.get(record.playerInstanceId) ?? 'This Player';
    if (result.success && result.status !== 'queued') {
      this.deps.book.markHandedOff(record.id, clientRef, result.turnRef);
    } else if (result.reason === 'busy') {
      // Proven no-send: the Player was still working. Keep ownership; its next turn event wakes us.
      this.deps.book.returnToWaiting(record.id, 'player');
    } else if (result.reason === 'session-changed') {
      this.deps.book.needsAttention(record.id, `${name} is no longer in the conversation that was interrupted, so nothing was sent. Use another Player or cancel.`);
    } else if (result.status === 'unknown') {
      this.deps.book.needsAttention(record.id, `Coach can't tell whether ${name} received the continuation. Check the Player before trying again.`);
    } else {
      this.deps.book.needsAttention(record.id, `The continuation couldn't be sent to ${name}: ${result.message ?? 'unknown reason'}. Nothing was sent. Try again or cancel.`);
    }
    this.deps.onChange?.();
  }

  /** Restart mid-send: only Ledger evidence of this exact clientRef proves the continuation landed. */
  private reconcileInterruptedSend(record: DeferredPlay): void {
    const clientRef = record.attempt?.clientRef;
    if (clientRef && this.sendLanded(record, clientRef)) {
      this.deps.book.markHandedOff(record.id, clientRef);
      return;
    }
    this.deps.book.needsAttention(record.id, "Coach restarted while sending the continuation and can't tell whether it arrived. Check the Player, then try again or cancel.");
  }

  private sendLanded(record: DeferredPlay, clientRef: string): boolean {
    const entry = this.deps.ledger(record.gameId, record.playerInstanceId);
    return Boolean(entry && (entry.currentPlay?.clientRef === clientRef || entry.recentPlays.some((play) => play.clientRef === clientRef)));
  }

  private schedule(record: DeferredPlay | undefined): void {
    if (!record || record.state !== 'waiting' || this.stopped) return;
    const horizonMs = record.condition.cycleResetsAt * 1000;
    const now = this.now();
    const fallback = horizonMs + DEFERRED_PLAY_CONSTANTS.fallbackAfterResetMs;
    const graceEnd = horizonMs + DEFERRED_PLAY_CONSTANTS.recoveryGraceMs;
    const target = now < fallback ? fallback : now < graceEnd ? graceEnd + 1 : undefined;
    this.clearTimer(record.id);
    if (target === undefined) return;
    const handle = this.timers.set(() => {
      this.handles.delete(record.id);
      void this.wake({ id: record.id });
    }, Math.min(MAX_TIMER_MS, Math.max(0, target - now)));
    this.handles.set(record.id, handle);
  }

  private clearTimer(id: string): void {
    const handle = this.handles.get(id);
    if (handle !== undefined) this.timers.clear(handle);
    this.handles.delete(id);
  }
}
