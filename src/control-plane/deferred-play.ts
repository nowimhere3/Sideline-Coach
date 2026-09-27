/**
 * R9 DeferredPlay: a durable, Player-bound intent to CONTINUE an interrupted Play.
 *
 * WHAT IT IS (Coach decision, S57.24): the exact controlled Player was performing a Play, the
 * provider refused it on a usage/rate limit (structured `blocker`, S57.23), and Dad chose
 * "Schedule after reset". After the reset, the SAME Player in the SAME provider conversation
 * receives one fixed instruction: continue the task. Nothing else is stored or replayed.
 *
 * WHAT IT IS NOT: a routed Play, a PlayQueue item, a copy of the prompt or transcript, or a
 * generic scheduler. It never selects or substitutes a Player; it never reranks.
 *
 * States (S57.1 §15.2, S57.21 §4):
 *   waiting          durably armed; waits for the reset, for fresh proof of recovery, and for the
 *                    exact Player to be free. Waiting for a busy Player keeps ownership here.
 *   firing           every truth check passed and the continuation is being sent (write-ahead
 *                    correlation persisted first). Only a proven no-send (busy) returns to waiting.
 *   handed-off       Player Control accepted the continuation. R9 ownership ends.
 *   needs-attention  something could not be proven; nothing fires until Dad retries or cancels.
 *   cancelled        Dad cancelled. Never fires.
 *
 * This module is pure apart from the atomic file store.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PlayerRoutingCapability } from '../capability-types';
import { parseProviderLimitBlocker, type ProviderLimitBlocker } from '../player-control/contract';
import type { RoutingEconomicsSnapshot } from './routing-economics';
import type { InstanceLedgerEntry, LedgerRecentPlay } from './work-ledger';

export const DEFERRED_PLAY_FILE = 'deferred-plays.json';

/** The one fixed, bounded continuation instruction. The conversation already holds the task. */
export const CONTINUE_TASK_PROMPT = 'Continue the current task from where you were interrupted.';

/** Fixed instruction appended to the existing handoff preamble for an explicit "Use another Player". */
export const HANDOFF_AFTER_LIMIT_INSTRUCTION = [
  'The previous Player was interrupted by a provider usage or rate limit while performing this task.',
  'Inspect the current working tree and the existing task/report context first.',
  'Determine what has already been completed and what remains, then continue the same task from the current proven state.',
  'Do not redo completed work merely because the previous Player is unavailable.'
].join('\n');

export const DEFERRED_PLAY_CONSTANTS = Object.freeze({
  /** Fallback wakeup after the recorded horizon (S57.1 §15.3). */
  fallbackAfterResetMs: 2 * 60_000,
  /** How long after the horizon Coach keeps waiting for fresh proof of recovery before asking Dad. */
  recoveryGraceMs: 30 * 60_000,
  /** AlarmEngine treats reset jitter within this bound as one provider cycle. */
  sameCycleToleranceSeconds: 15 * 60,
  /** Minimum remaining fraction of each armed window that counts as "recovered enough to continue". */
  minRemainingFraction: 0.05,
  /** Only terminal records beyond this many are pruned (newest kept). */
  terminalRetention: 50
});

export type DeferredPlayState = 'waiting' | 'firing' | 'handed-off' | 'needs-attention' | 'cancelled';
export type DeferredPlayWaitingFor = 'reset' | 'recovery' | 'player' | 'game';

export interface DeferredPlayCondition {
  /** R1 resource pool of the Player that was refused. */
  readonly pool: string;
  /** The R1 windows armed against, each with the horizon it must pass. */
  readonly windows: readonly { readonly id: string; readonly resetsAt: number }[];
  /** Unix seconds: the latest armed horizon. Nothing fires before it. */
  readonly cycleResetsAt: number;
  /** Where the horizon came from: the provider's own refusal, or R1 truth for that pool. */
  readonly horizonSource: 'provider-refusal' | 'resource-truth';
}

/** Identity of the interrupted Play (Work Ledger), never its text. */
export interface InterruptedPlayRef {
  readonly clientRef: string;
  readonly turnRef?: string;
  readonly finishedAt: number;
  readonly model?: string;
  readonly effort?: string;
  readonly blocker: ProviderLimitBlocker;
}

export interface DeferredPlay {
  readonly id: string;
  /** One continuation intent per interrupted Play: `gameId|instance|interruptedClientRef`. */
  readonly idempotencyKey: string;
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerType: string;
  readonly interrupted: InterruptedPlayRef;
  /** The conversation the interrupted Play ran in (S57.23). Sending requires the Player still holds it. */
  readonly expectedSessionKey: string;
  readonly condition: DeferredPlayCondition;
  readonly continuation: 'continue-task';
  readonly state: DeferredPlayState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly waitingFor?: DeferredPlayWaitingFor;
  /** Write-ahead correlation of the continuation send (the router's clientRef), persisted before sending. */
  readonly attempt?: { readonly clientRef: string; readonly at: number };
  readonly handedOff?: { readonly clientRef: string; readonly turnRef?: string; readonly at: number };
  /** Dad-readable reason, only in needs-attention. */
  readonly attention?: string;
}

// --- Store ------------------------------------------------------------------------------

export interface DeferredPlayStore {
  load(): unknown;
  save(records: readonly DeferredPlay[]): void;
}

/** Atomic JSON beside the Control Plane manifest. An unreadable file is quarantined, never overwritten blind. */
export function fileDeferredPlayStore(file: string, warn: (message: string) => void = () => undefined): DeferredPlayStore {
  return {
    load: () => {
      let text: string;
      try { text = fs.readFileSync(file, 'utf8'); }
      catch { return undefined; }
      try { return JSON.parse(text); }
      catch {
        const quarantine = `${file}.${Date.now()}.corrupt.bak`;
        try { fs.renameSync(file, quarantine); } catch { /* best effort */ }
        warn(`Scheduled continuations could not be read; the file was kept at ${quarantine} and nothing from it will fire.`);
        return undefined;
      }
    },
    save: (records) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, records }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    }
  };
}

export const MEMORY_DEFERRED_PLAY_STORE: DeferredPlayStore = { load: () => undefined, save: () => undefined };

// --- Book (state machine) ------------------------------------------------------------------

export interface ArmInput {
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerType: string;
  readonly interrupted: InterruptedPlayRef;
  readonly expectedSessionKey: string;
  readonly condition: DeferredPlayCondition;
}

const ACTIVE: ReadonlySet<DeferredPlayState> = new Set<DeferredPlayState>(['waiting', 'firing', 'needs-attention']);

export class DeferredPlayBook {
  private records: DeferredPlay[] = [];

  constructor(private readonly store: DeferredPlayStore = MEMORY_DEFERRED_PLAY_STORE, private readonly now: () => number = Date.now) {
    const loaded = store.load() as { version?: unknown; records?: unknown } | undefined;
    if (loaded?.version === 1 && Array.isArray(loaded.records)) {
      for (const raw of loaded.records) {
        const record = validRecord(raw);
        if (record) this.records.push(record);
      }
    }
  }

  get(id: string): DeferredPlay | undefined { return this.records.find((record) => record.id === id); }
  all(): readonly DeferredPlay[] { return this.records.map(clone); }
  forGame(gameId: string): DeferredPlay[] { return this.records.filter((record) => record.gameId === gameId).map(clone); }
  /** The one non-cancelled intent for an interrupted Play, if any. */
  forInterruption(gameId: string, playerInstanceId: string, clientRef: string): DeferredPlay | undefined {
    const key = idempotencyKey(gameId, playerInstanceId, clientRef);
    const found = this.records.find((record) => record.idempotencyKey === key && record.state !== 'cancelled');
    return found ? clone(found) : undefined;
  }
  active(): DeferredPlay[] { return this.records.filter((record) => ACTIVE.has(record.state)).map(clone); }

  /** Idempotent: a second Schedule for the same interruption returns the existing intent. */
  arm(input: ArmInput): { record: DeferredPlay; created: boolean } {
    const key = idempotencyKey(input.gameId, input.playerInstanceId, input.interrupted.clientRef);
    const existing = this.records.find((record) => record.idempotencyKey === key && record.state !== 'cancelled');
    if (existing) return { record: clone(existing), created: false };
    const at = this.now();
    const record: DeferredPlay = {
      id: `dp_${crypto.createHash('sha256').update(`${key}|${at}|${this.records.length}`).digest('hex').slice(0, 16)}`,
      idempotencyKey: key,
      gameId: input.gameId,
      playerInstanceId: input.playerInstanceId,
      playerType: input.playerType,
      interrupted: { ...input.interrupted, blocker: { ...input.interrupted.blocker } },
      expectedSessionKey: input.expectedSessionKey,
      condition: { ...input.condition, windows: input.condition.windows.map((window) => ({ ...window })) },
      continuation: 'continue-task',
      state: 'waiting',
      waitingFor: 'reset',
      createdAt: at,
      updatedAt: at
    };
    this.records.push(record);
    this.persist();
    return { record: clone(record), created: true };
  }

  /** waiting → waiting with a new reason (no persistence churn when unchanged). */
  noteWaiting(id: string, waitingFor: DeferredPlayWaitingFor): boolean {
    return this.transition(id, ['waiting'], (record) => record.waitingFor === waitingFor ? undefined : { waitingFor });
  }

  /** waiting → firing, with the continuation's correlation written ahead of the send in the same write. */
  beginFiring(id: string, clientRef: string): boolean {
    return this.transition(id, ['waiting'], () => ({ state: 'firing', waitingFor: undefined, attempt: { clientRef, at: this.now() } }), true);
  }

  /** firing → waiting ONLY when the send was proven not to have happened (e.g. the Player was busy). */
  returnToWaiting(id: string, waitingFor: DeferredPlayWaitingFor): boolean {
    return this.transition(id, ['firing'], () => ({ state: 'waiting', waitingFor, attempt: undefined }), true);
  }

  markHandedOff(id: string, clientRef: string, turnRef?: string): boolean {
    return this.transition(id, ['firing', 'waiting', 'needs-attention'], () => ({
      state: 'handed-off', waitingFor: undefined, attention: undefined,
      handedOff: { clientRef, ...(turnRef ? { turnRef } : {}), at: this.now() }
    }), true);
  }

  needsAttention(id: string, attention: string): boolean {
    return this.transition(id, ['waiting', 'firing'], () => ({ state: 'needs-attention', waitingFor: undefined, attention }), true);
  }

  /** Dad: from waiting or needs-attention. A continuation being sent right now cannot be cancelled. */
  cancel(id: string, gameId?: string): DeferredPlay | undefined {
    const record = this.get(id);
    if (!record || (gameId && record.gameId !== gameId)) return undefined;
    if (!this.transition(id, ['waiting', 'needs-attention'], () => ({ state: 'cancelled', waitingFor: undefined }), true)) return undefined;
    return clone(this.get(id) as DeferredPlay);
  }

  /** Dad: needs-attention → waiting. Every truth check runs again; nothing is bypassed. */
  retry(id: string, gameId?: string): boolean {
    const record = this.get(id);
    if (!record || (gameId && record.gameId !== gameId)) return false;
    return this.transition(id, ['needs-attention'], () => ({ state: 'waiting', waitingFor: 'reset', attention: undefined }), true);
  }

  private transition(
    id: string,
    from: readonly DeferredPlayState[],
    change: (record: DeferredPlay) => Partial<Omit<DeferredPlay, 'id'>> | undefined,
    always = false
  ): boolean {
    const index = this.records.findIndex((record) => record.id === id);
    if (index < 0) return false;
    const record = this.records[index];
    if (!from.includes(record.state)) return false;
    const patch = change(record);
    if (!patch && !always) return true;
    const next = { ...record, ...(patch ?? {}), updatedAt: this.now() } as DeferredPlay;
    for (const key of Object.keys(next) as (keyof DeferredPlay)[]) if (next[key] === undefined) delete (next as unknown as Record<string, unknown>)[key];
    this.records[index] = next;
    this.prune();
    this.persist();
    return true;
  }

  private prune(): void {
    const terminal = this.records.filter((record) => !ACTIVE.has(record.state)).sort((a, b) => b.updatedAt - a.updatedAt);
    if (terminal.length <= DEFERRED_PLAY_CONSTANTS.terminalRetention) return;
    const drop = new Set(terminal.slice(DEFERRED_PLAY_CONSTANTS.terminalRetention));
    this.records = this.records.filter((record) => !drop.has(record));
  }

  private persist(): void {
    this.store.save(this.records.map(clone));
  }
}

export function idempotencyKey(gameId: string, playerInstanceId: string, clientRef: string): string {
  return `${gameId}|${playerInstanceId}|${clientRef}`;
}

// --- Eligibility (arm) --------------------------------------------------------------------

export type ContinuationEligibility =
  | {
      readonly eligible: true;
      readonly interrupted: InterruptedPlayRef;
      readonly expectedSessionKey: string;
      readonly condition: DeferredPlayCondition;
    }
  | {
      readonly eligible: false;
      readonly reason: 'no-interruption' | 'not-controlled' | 'no-session' | 'session-changed' | 'player-working' | 'reset-unknown';
    };

/**
 * Schedule is offered only for the exact controlled Player whose MOST RECENT Play ended with a
 * structured provider-limit blocker (S57.23), in the conversation the Player still holds, with a
 * known reset horizon. Text, LOW/CRITICAL state and scarcity never make a Play eligible; R1 truth
 * is used only to name the horizon when the provider's refusal did not state one.
 */
export function continuationEligibility(input: {
  readonly capability: PlayerRoutingCapability | undefined;
  readonly entry: InstanceLedgerEntry | undefined;
  readonly economics: RoutingEconomicsSnapshot;
}): ContinuationEligibility {
  const latest = input.entry?.recentPlays[0];
  const blocker = parseProviderLimitBlocker(latest?.blocker);
  if (!latest || !blocker || latest.outcome === 'completed' || latest.outcome === 'partial') return { eligible: false, reason: 'no-interruption' };
  const capability = input.capability;
  if (!capability || capability.transport !== 'controlled' || capability.executionType === 'direct-shell' || capability.executionType === 'scout-formation') {
    return { eligible: false, reason: 'not-controlled' };
  }
  if (!latest.sessionKey) return { eligible: false, reason: 'no-session' };
  if (capability.sessionKey !== latest.sessionKey) return { eligible: false, reason: 'session-changed' };
  if (input.entry?.currentPlay) return { eligible: false, reason: 'player-working' };
  const condition = deriveCondition(blocker, input.economics);
  if (!condition) return { eligible: false, reason: 'reset-unknown' };
  return { eligible: true, interrupted: interruptedRef(latest, blocker), expectedSessionKey: latest.sessionKey, condition };
}

function interruptedRef(play: LedgerRecentPlay, blocker: ProviderLimitBlocker): InterruptedPlayRef {
  return {
    clientRef: play.clientRef,
    ...(play.turnRef ? { turnRef: play.turnRef } : {}),
    finishedAt: play.finishedAt,
    ...(play.model ? { model: play.model } : {}),
    ...(play.effort ? { effort: play.effort } : {}),
    blocker
  };
}

/** Provider window names → R1 window ids. Anything unrecognised falls back to R1 truth for the pool. */
function r1WindowFor(providerWindow: string | undefined): string | undefined {
  if (!providerWindow) return undefined;
  if (providerWindow === 'five_hour') return 'five_hour';
  if (/^seven_day/.test(providerWindow) || providerWindow === 'weekly') return 'weekly';
  return undefined;
}

export function deriveCondition(blocker: ProviderLimitBlocker, economics: RoutingEconomicsSnapshot): DeferredPlayCondition | undefined {
  const pool = economics.pools[blocker.pool];
  const mapped = r1WindowFor(blocker.window);
  if (blocker.resetsAt !== undefined && mapped && pool?.windows.some((window) => window.id === mapped)) {
    return { pool: blocker.pool, windows: [{ id: mapped, resetsAt: blocker.resetsAt }], cycleResetsAt: blocker.resetsAt, horizonSource: 'provider-refusal' };
  }
  if (!pool) return undefined;
  // The refusal named no usable horizon: take it from current R1 truth for the refused pool — every
  // window that is exhausted right now must reset before the Player can continue.
  const exhausted = pool.windows.filter((window) => !window.stale && window.resetsAt !== undefined && window.remainingFraction !== undefined
    && (window.floor === 4 || window.remainingFraction <= 0.02));
  if (!exhausted.length) return undefined;
  const windows = exhausted.map((window) => ({ id: window.id, resetsAt: window.resetsAt as number }));
  return { pool: blocker.pool, windows, cycleResetsAt: Math.max(...windows.map((window) => window.resetsAt)), horizonSource: 'resource-truth' };
}

// --- Revalidation (fire) --------------------------------------------------------------------

export type RevalidationVerdict =
  | { readonly kind: 'ready' }
  | { readonly kind: 'wait'; readonly waitingFor: DeferredPlayWaitingFor }
  | { readonly kind: 'attention'; readonly message: string };

export interface RevalidationInput {
  readonly record: DeferredPlay;
  readonly now: number;
  readonly economics: RoutingEconomicsSnapshot;
  readonly game: { readonly connected: boolean; readonly rosterSynchronized: boolean };
  readonly rosterInstanceIds?: ReadonlySet<string>;
  readonly capability: PlayerRoutingCapability | undefined;
  readonly entry: InstanceLedgerEntry | undefined;
  readonly playerName: string;
}

/**
 * Fresh truth, every time. A wakeup only says "check now". UNKNOWN is never success: while the
 * reset is still settling it keeps waiting (bounded by the recovery grace), then asks Dad.
 */
export function revalidateContinuation(input: RevalidationInput): RevalidationVerdict {
  const { record, now } = input;
  const constants = DEFERRED_PLAY_CONSTANTS;
  const horizonMs = record.condition.cycleResetsAt * 1000;
  if (now < horizonMs) return { kind: 'wait', waitingFor: 'reset' };

  const resource = resourceRecovered(record.condition, input.economics);
  if (resource !== 'recovered') {
    if (now < horizonMs + constants.recoveryGraceMs) return { kind: 'wait', waitingFor: 'recovery' };
    return {
      kind: 'attention',
      message: resource === 'unknown'
        ? `Coach couldn't get current usage for ${poolName(record.condition.pool)} to confirm the reset. Check usage, then try again or cancel.`
        : resource === 'same-cycle'
          ? `${poolName(record.condition.pool)} hasn't reported a new usage window yet, so the reset couldn't be confirmed. Try again or cancel.`
          : `${poolName(record.condition.pool)} usage still looks too low to continue. Try again later or cancel.`
    };
  }

  if (!input.game.connected || !input.game.rosterSynchronized) return { kind: 'wait', waitingFor: 'game' };
  const name = input.playerName;
  if (input.rosterInstanceIds && !input.rosterInstanceIds.has(record.playerInstanceId)) {
    return { kind: 'attention', message: `${name} is no longer on your Team, so the continuation won't be sent. Cancel it or use another Player.` };
  }
  const capability = input.capability;
  if (!capability) return { kind: 'attention', message: `${name} is on the bench. Put it back on field, then try again — or cancel.` };
  if (capability.transport !== 'controlled') return { kind: 'attention', message: `${name} can't continue a scheduled task. Cancel it or use another Player.` };
  if (capability.state === 'unavailable' || capability.state === 'needs-verification') {
    return { kind: 'attention', message: `${name} can't take Plays right now. Try again once it is ready — or cancel.` };
  }
  if (capability.sessionKey !== record.expectedSessionKey) {
    return { kind: 'attention', message: `${name} is no longer in the conversation that was interrupted, so the continuation won't be sent. Use another Player or cancel.` };
  }
  if (capability.state === 'busy' || input.entry?.workState === 'working' || input.entry?.currentPlay) return { kind: 'wait', waitingFor: 'player' };

  const latest = input.entry?.recentPlays[0];
  if (!latest) return { kind: 'attention', message: `Coach can't find the interrupted Play for ${name} anymore. Check the Player, then try again or cancel.` };
  if (latest.clientRef !== record.interrupted.clientRef) {
    return { kind: 'attention', message: `${name} has worked on something else since it was interrupted. Check the Player before continuing — try again or cancel.` };
  }
  if (latest.outcome === 'completed' || latest.outcome === 'partial') {
    return { kind: 'attention', message: `The interrupted Play on ${name} is already finished. Nothing will be sent.` };
  }
  return { kind: 'ready' };
}

function resourceRecovered(condition: DeferredPlayCondition, economics: RoutingEconomicsSnapshot): 'recovered' | 'unknown' | 'same-cycle' | 'low' {
  const pool = economics.pools[condition.pool];
  if (!pool) return 'unknown';
  let verdict: 'recovered' | 'same-cycle' | 'low' = 'recovered';
  for (const armed of condition.windows) {
    const window = pool.windows.find((candidate) => candidate.id === armed.id);
    if (!window || window.stale || window.remainingFraction === undefined || window.resetsAt === undefined) return 'unknown';
    if (window.resetsAt - armed.resetsAt <= DEFERRED_PLAY_CONSTANTS.sameCycleToleranceSeconds) verdict = 'same-cycle';
    else if (window.remainingFraction < DEFERRED_PLAY_CONSTANTS.minRemainingFraction || window.floor === 4) verdict = verdict === 'recovered' ? 'low' : verdict;
  }
  return verdict;
}

function poolName(pool: string): string {
  return pool ? pool.charAt(0).toUpperCase() + pool.slice(1) : 'The provider';
}

// --- Validation of persisted records -------------------------------------------------------

const STATES: ReadonlySet<string> = new Set(['waiting', 'firing', 'handed-off', 'needs-attention', 'cancelled']);
const WAITING_FOR: ReadonlySet<string> = new Set(['reset', 'recovery', 'player', 'game']);

function validRecord(raw: unknown): DeferredPlay | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const str = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 300;
  const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (!str(r.id) || !str(r.idempotencyKey) || !str(r.gameId) || !str(r.playerInstanceId) || !str(r.playerType)) return undefined;
  if (!str(r.expectedSessionKey) || !/^[0-9a-f]{8}$/.test(r.expectedSessionKey)) return undefined;
  if (r.continuation !== 'continue-task' || !str(r.state) || !STATES.has(r.state) || !num(r.createdAt) || !num(r.updatedAt)) return undefined;
  const interrupted = r.interrupted as Record<string, unknown> | undefined;
  const blocker = parseProviderLimitBlocker(interrupted?.blocker);
  if (!interrupted || !str(interrupted.clientRef) || !num(interrupted.finishedAt) || !blocker) return undefined;
  const condition = r.condition as Record<string, unknown> | undefined;
  if (!condition || !str(condition.pool) || !num(condition.cycleResetsAt) || !Array.isArray(condition.windows) || condition.windows.length === 0) return undefined;
  if (condition.horizonSource !== 'provider-refusal' && condition.horizonSource !== 'resource-truth') return undefined;
  const windows = (condition.windows as unknown[]).map((w) => w as Record<string, unknown>);
  if (!windows.every((w) => str(w.id) && num(w.resetsAt))) return undefined;
  const attempt = r.attempt as Record<string, unknown> | undefined;
  const handedOff = r.handedOff as Record<string, unknown> | undefined;
  if (attempt !== undefined && (!str(attempt.clientRef) || !num(attempt.at))) return undefined;
  if (handedOff !== undefined && (!str(handedOff.clientRef) || !num(handedOff.at))) return undefined;
  if (r.state === 'firing' && !attempt) return undefined;
  return {
    id: r.id,
    idempotencyKey: r.idempotencyKey,
    gameId: r.gameId,
    playerInstanceId: r.playerInstanceId,
    playerType: r.playerType,
    interrupted: {
      clientRef: interrupted.clientRef as string,
      ...(str(interrupted.turnRef) ? { turnRef: interrupted.turnRef } : {}),
      finishedAt: interrupted.finishedAt as number,
      ...(str(interrupted.model) ? { model: interrupted.model } : {}),
      ...(str(interrupted.effort) ? { effort: interrupted.effort } : {}),
      blocker
    },
    expectedSessionKey: r.expectedSessionKey,
    condition: {
      pool: condition.pool as string,
      windows: windows.map((w) => ({ id: w.id as string, resetsAt: w.resetsAt as number })),
      cycleResetsAt: condition.cycleResetsAt as number,
      horizonSource: condition.horizonSource
    },
    continuation: 'continue-task',
    state: r.state as DeferredPlayState,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(str(r.waitingFor) && WAITING_FOR.has(r.waitingFor) ? { waitingFor: r.waitingFor as DeferredPlayWaitingFor } : {}),
    ...(attempt ? { attempt: { clientRef: attempt.clientRef as string, at: attempt.at as number } } : {}),
    ...(handedOff ? { handedOff: { clientRef: handedOff.clientRef as string, ...(str(handedOff.turnRef) ? { turnRef: handedOff.turnRef } : {}), at: handedOff.at as number } } : {}),
    ...(str(r.attention) ? { attention: r.attention } : {})
  };
}

function clone(record: DeferredPlay): DeferredPlay {
  return JSON.parse(JSON.stringify(record)) as DeferredPlay;
}
