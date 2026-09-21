/**
 * One bounded Scout -> Coach -> Player continuation ledger.
 *
 * This is orchestration state, not Scout health or Player ranking. It retains
 * the original human Play while Formation runs, records the durable evidence
 * reference, and makes every automatic next action auditable. Records are
 * bounded and atomically persisted beside the other Control Plane state.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RoutingDecision } from '../capability-types';
import type { ScoutContinuationAuthority } from '../play-analyzer';

export type ScoutFormationOutcome = 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNKNOWN';
export type ScoutContinuationState =
  | 'awaiting-scout'
  | 'stopped'
  | 'dispatching'
  | 'queued'
  | 'received'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'unknown';

export interface ContinuationCandidateEvidence {
  readonly instanceId: string;
  readonly playerType: string;
  readonly provider: string;
  readonly state: string;
  readonly eligible: boolean;
  readonly reason: string;
}

export interface ScoutContinuationRecord {
  readonly id: string;
  readonly gameId: string;
  readonly originalClientRef: string;
  readonly originalPrompt: string;
  readonly originalPlayLabel?: string;
  readonly createdAt: number;
  readonly scoutReason: string;
  readonly authority: ScoutContinuationAuthority;
  readonly originalContextPreamble?: string;
  readonly originalContextReportPath?: string;
  scoutTurnRef?: string;
  formationId?: string;
  formationOutcome?: ScoutFormationOutcome;
  scoutReportPath?: string;
  continuationCandidates?: readonly ContinuationCandidateEvidence[];
  continuationDecision?: RoutingDecision;
  continuationClientRef?: string;
  continuationTurnRef?: string;
  /** Set when the continuation's second dispatch was queued for a busy instance — the
   *  Play Queue item this record is waiting on, so its eventual release can bind the
   *  real turn identity back onto THIS exact record. */
  continuationQueueItemId?: string;
  state: ScoutContinuationState;
  note?: string;
  updatedAt: number;
}

export interface ScoutContinuationStore {
  load(): unknown;
  save(records: readonly ScoutContinuationRecord[]): void;
}

export const MEMORY_SCOUT_CONTINUATION_STORE: ScoutContinuationStore = {
  load: () => undefined,
  save: () => undefined
};

export function fileScoutContinuationStore(file: string): ScoutContinuationStore {
  return {
    load: () => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
    },
    save: (records) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, records }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    }
  };
}

const RECORD_LIMIT = 50;

export class ScoutContinuationLedger {
  private records: ScoutContinuationRecord[] = [];

  constructor(
    private readonly store: ScoutContinuationStore = MEMORY_SCOUT_CONTINUATION_STORE,
    private readonly now: () => number = Date.now
  ) {
    const loaded = store.load() as { version?: unknown; records?: unknown } | undefined;
    if (loaded?.version !== 1 || !Array.isArray(loaded.records)) return;
    for (const raw of loaded.records) {
      const item = raw as Partial<ScoutContinuationRecord>;
      if (typeof item.id !== 'string' || typeof item.gameId !== 'string'
        || typeof item.originalClientRef !== 'string' || typeof item.originalPrompt !== 'string'
        || !item.authority || typeof item.authority.authorized !== 'boolean') continue;
      const restored = { ...item } as ScoutContinuationRecord;
      if (restored.state === 'dispatching') {
        restored.state = 'unknown';
        restored.note = 'Coach restarted while continuation dispatch was in flight; delivery outcome is Unknown and was not retried.';
      } else if (restored.state === 'awaiting-scout' && !restored.scoutTurnRef) {
        restored.state = 'unknown';
        restored.note = 'Coach restarted before the Scout turn identity was acknowledged; no automatic continuation was attempted.';
      }
      this.records.push(restored);
    }
    this.trim();
    this.persist();
  }

  stage(input: Omit<ScoutContinuationRecord, 'id' | 'state' | 'updatedAt'>): ScoutContinuationRecord {
    const existing = this.records.find((record) => record.originalClientRef === input.originalClientRef);
    if (existing) return clone(existing);
    const record: ScoutContinuationRecord = {
      ...input,
      id: `scout_cont_${crypto.randomBytes(6).toString('hex')}`,
      state: 'awaiting-scout',
      updatedAt: this.now()
    };
    this.records.push(record);
    this.trim();
    this.persist();
    return clone(record);
  }

  acceptScout(originalClientRef: string, turnRef: string): void {
    const record = this.records.find((candidate) => candidate.originalClientRef === originalClientRef);
    if (!record || record.state !== 'awaiting-scout') return;
    record.scoutTurnRef = turnRef;
    this.touch(record);
  }

  failScoutDelivery(originalClientRef: string, note: string, state: 'failed' | 'unknown'): void {
    const record = this.records.find((candidate) => candidate.originalClientRef === originalClientRef);
    if (!record || record.state !== 'awaiting-scout') return;
    record.state = state;
    record.note = note;
    this.touch(record);
  }

  recordScoutOutcome(input: {
    gameId: string;
    turnRef: string;
    outcome: ScoutFormationOutcome;
    formationId?: string;
    reportPath?: string;
  }): ScoutContinuationRecord | undefined {
    const record = this.records.find((candidate) => candidate.gameId === input.gameId
      && candidate.scoutTurnRef === input.turnRef
      && candidate.state === 'awaiting-scout');
    if (!record) return undefined;
    record.formationOutcome = input.outcome;
    record.formationId = input.formationId;
    record.scoutReportPath = input.reportPath;
    if (input.outcome === 'COMPLETE' && !input.reportPath) {
      record.state = 'unknown';
      record.note = 'Scout reported COMPLETE without a durable evidence path; Coach did not continue blindly.';
    } else if (input.outcome !== 'COMPLETE') {
      record.state = input.outcome.toLowerCase() as ScoutContinuationState;
      record.note = `Scout Formation ended ${input.outcome}; Coach did not pretend the evidence was sufficient for automatic continuation.`;
    } else if (!record.authority.authorized) {
      record.state = 'stopped';
      record.note = record.authority.reason;
    }
    this.touch(record);
    return clone(record);
  }

  beginContinuation(id: string, candidates: readonly ContinuationCandidateEvidence[]): ScoutContinuationRecord | undefined {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record || record.formationOutcome !== 'COMPLETE' || !record.authority.authorized || record.state !== 'awaiting-scout') return undefined;
    record.continuationCandidates = candidates.map((candidate) => ({ ...candidate }));
    record.state = 'dispatching';
    record.note = 'Coach is re-evaluating the original human Play with Scout evidence and the current live Team.';
    this.touch(record);
    return clone(record);
  }

  stopContinuation(id: string, note: string): void {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record || record.state !== 'dispatching') return;
    record.state = 'stopped';
    record.note = note;
    this.touch(record);
  }

  recordContinuationDispatch(id: string, input: {
    decision?: RoutingDecision;
    clientRef?: string;
    turnRef?: string;
    status?: 'received' | 'failed' | 'unknown' | 'queued';
    message?: string;
    /** Present exactly when status === 'queued' — the Play Queue item to bind later. */
    queueItemId?: string;
  }): void {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record || record.state !== 'dispatching') return;
    record.continuationDecision = input.decision;
    record.continuationClientRef = input.clientRef;
    record.continuationTurnRef = input.turnRef;
    record.continuationQueueItemId = input.status === 'queued' ? input.queueItemId : undefined;
    record.state = input.status === 'received'
      ? 'received'
      : input.status === 'queued'
        ? 'queued'
        : input.status === 'unknown'
          ? 'unknown'
          : 'failed';
    record.note = input.message;
    this.touch(record);
  }

  /**
   * The queued continuation's Play was released to its exact turn (Q2.13). Binds
   * the real turn identity onto the SAME record so the existing terminal-turn
   * handler (recordContinuationOutcome, keyed by turnRef) can later close it
   * truthfully — no second queue, no polling, no new ledger. Idempotent: once a
   * record leaves `queued` (here, to `received`), a replayed release event finds
   * no matching `queued` record and is a no-op.
   */
  bindQueueRelease(queueItemId: string, turnRef: string): ScoutContinuationRecord | undefined {
    const record = this.records.find((candidate) => candidate.continuationQueueItemId === queueItemId && candidate.state === 'queued');
    if (!record) return undefined;
    record.continuationTurnRef = turnRef;
    record.state = 'received';
    record.note = 'Coach released the queued continuation to its exact turn.';
    this.touch(record);
    return clone(record);
  }

  recordContinuationOutcome(gameId: string, turnRef: string, state: string, summary?: string): void {
    const record = this.records.find((candidate) => candidate.gameId === gameId
      && candidate.continuationTurnRef === turnRef
      && (candidate.state === 'received' || candidate.state === 'queued'));
    if (!record || !['completed', 'partial', 'blocked', 'failed', 'interrupted', 'unknown'].includes(state)) return;
    record.state = state === 'interrupted' ? 'failed' : state as ScoutContinuationState;
    record.note = summary;
    this.touch(record);
  }

  get(id: string): ScoutContinuationRecord | undefined {
    const record = this.records.find((candidate) => candidate.id === id);
    return record ? clone(record) : undefined;
  }

  forGame(gameId: string): ScoutContinuationRecord[] {
    return this.records.filter((record) => record.gameId === gameId).map(clone);
  }

  private touch(record: ScoutContinuationRecord): void {
    record.updatedAt = this.now();
    this.persist();
  }

  private trim(): void {
    if (this.records.length > RECORD_LIMIT) this.records = this.records.slice(-RECORD_LIMIT);
  }

  private persist(): void {
    try { this.store.save(this.records); } catch { /* In-memory truth remains; the next mutation retries. */ }
  }
}

export function buildScoutContinuationPreamble(input: {
  reportPath: string;
  formationId?: string;
  authorityReason: string;
}): string {
  const lines = [
    '[Sideline Coach Scout continuation]',
    'Continue the original human objective below; it remains authoritative.',
    `Scout reconnaissance completed${input.formationId ? ` as ${input.formationId}` : ''}.`,
    `Read the durable Scout evidence before proceeding: ${input.reportPath}`,
    'Scout findings are evidence, not architecture authority. Validate, synthesize, and disagree when warranted.',
    input.authorityReason,
    '---'
  ];
  return `${lines.join('\n')}\n`;
}

function clone(record: ScoutContinuationRecord): ScoutContinuationRecord {
  return JSON.parse(JSON.stringify(record)) as ScoutContinuationRecord;
}
