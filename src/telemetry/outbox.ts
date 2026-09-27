import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateProductEvent, type ProductEvent } from './events';

/**
 * S57.2 §15 / C7 — local, bounded, best-effort product telemetry outbox.
 *
 *   ~/.sideline/telemetry/outbox.jsonl   one record per line: { event, attempts, nextAttemptAt? }
 *
 * - Consent is a function the owner supplies. When it says `off`, emit() writes nothing at
 *   all — no directory, no file. Choosing the public default (opt-in vs opt-out) is a Dad
 *   decision (S57.2 §21 Q7); until then the runtime default is the privacy-preserving `off`.
 * - emit() validates synchronously and persists asynchronously. It never throws into its
 *   caller and nothing in the product waits on it.
 * - Bounded: at most 5 000 events / 2 MB; the oldest are dropped first. Events older than
 *   7 days are dropped. Torn or invalid lines are skipped.
 * - Transport is pluggable and ships as NO-OP: there is no sender, no endpoint and no
 *   network code in this module. The no-op transport never delivers, so events simply wait
 *   (bounded) until a real transport exists.
 * - Entirely separate from entitlement: analytics failure never influences access and
 *   entitlement failure never influences analytics.
 */

export const TELEMETRY_OUTBOX_FILE = 'outbox.jsonl';
export const OUTBOX_MAX_EVENTS = 5_000;
export const OUTBOX_MAX_BYTES = 2 * 1024 * 1024;
export const OUTBOX_RETENTION_MS = 7 * 86_400_000;
export const OUTBOX_BATCH_SIZE = 200;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 6 * 3_600_000;

export type TelemetryConsent = 'on' | 'off';
export const DEFAULT_TELEMETRY_CONSENT: TelemetryConsent = 'off';

export interface TelemetryBatch {
  /** Deterministic: derived from the batch's event ids, so a resend is recognisable. */
  readonly batchId: string;
  readonly events: readonly ProductEvent[];
}

export interface TelemetryTransport {
  readonly kind: 'none' | 'network';
  send(batch: TelemetryBatch): Promise<'delivered' | 'retry'>;
}

/** C7 ships with no sender: nothing leaves the machine. */
export const NOOP_TRANSPORT: TelemetryTransport = Object.freeze({
  kind: 'none' as const,
  async send(): Promise<'retry'> { return 'retry'; }
});

interface OutboxRecord {
  readonly event: ProductEvent;
  attempts: number;
  nextAttemptAt?: number;
}

export type EmitResult = { readonly accepted: true } | { readonly accepted: false; readonly reason: string };

export interface TelemetryOutboxOptions {
  /** `~/.sideline/telemetry` */
  readonly dir: string;
  readonly consent: () => TelemetryConsent;
  readonly transport?: TelemetryTransport;
  readonly now?: () => number;
  readonly maxEvents?: number;
  readonly maxBytes?: number;
  readonly retentionMs?: number;
  readonly warn?: (message: string) => void;
}

export function telemetryBatchId(events: readonly ProductEvent[]): string {
  return crypto.createHash('sha256').update(events.map((event) => event.eventId).join('\n')).digest('hex').slice(0, 32);
}

export class TelemetryOutbox {
  private records: OutboxRecord[] | undefined;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly transport: TelemetryTransport;
  private readonly now: () => number;
  private readonly maxEvents: number;
  private readonly maxBytes: number;
  private readonly retentionMs: number;
  private readonly warn: (message: string) => void;

  constructor(private readonly options: TelemetryOutboxOptions) {
    this.file = path.join(options.dir, TELEMETRY_OUTBOX_FILE);
    this.transport = options.transport ?? NOOP_TRANSPORT;
    this.now = options.now ?? Date.now;
    this.maxEvents = options.maxEvents ?? OUTBOX_MAX_EVENTS;
    this.maxBytes = options.maxBytes ?? OUTBOX_MAX_BYTES;
    this.retentionMs = options.retentionMs ?? OUTBOX_RETENTION_MS;
    this.warn = options.warn ?? (() => undefined);
  }

  get transportKind(): TelemetryTransport['kind'] {
    return this.transport.kind;
  }

  consent(): TelemetryConsent {
    try { return this.options.consent() === 'on' ? 'on' : 'off'; } catch { return 'off'; }
  }

  /** Validate and enqueue. Never throws; never blocks the caller on disk. */
  emit(candidate: unknown): EmitResult {
    try {
      if (this.consent() !== 'on') return { accepted: false, reason: 'consent-off' };
      const validation = validateProductEvent(candidate);
      if (!validation.ok) return { accepted: false, reason: validation.reason };
      const records = this.load();
      if (records.some((record) => record.event.eventId === validation.event.eventId)) return { accepted: false, reason: 'duplicate' };
      records.push({ event: validation.event, attempts: 0 });
      const dropped = this.enforceBounds(records);
      this.schedule(dropped ? 'rewrite' : 'append', validation.event);
      return { accepted: true };
    } catch (error) {
      this.warn(`Telemetry event dropped: ${error instanceof Error ? error.message : String(error)}`);
      return { accepted: false, reason: 'internal' };
    }
  }

  /**
   * Turning consent OFF discards anything still waiting (C9): nothing collected while it was on
   * is kept once the user says no. Removes the outbox file; never throws.
   */
  discardPending(): void {
    this.records = [];
    this.writeChain = this.writeChain.then(async () => {
      try { await fs.promises.rm(this.file, { force: true }); } catch { /* best effort */ }
    });
  }

  /** Events waiting to be sent (Dev preview seam). */
  pending(): readonly ProductEvent[] {
    try { return this.load().map((record) => record.event); } catch { return []; }
  }

  /** One batch attempt through the transport. Never throws; with NO-OP nothing is delivered. */
  async flush(): Promise<{ readonly attempted: number; readonly delivered: number; readonly batchId?: string }> {
    try {
      if (this.consent() !== 'on') return { attempted: 0, delivered: 0 };
      const records = this.load();
      const now = this.now();
      const batchRecords = records.filter((record) => (record.nextAttemptAt ?? 0) <= now).slice(0, OUTBOX_BATCH_SIZE);
      if (batchRecords.length === 0) return { attempted: 0, delivered: 0 };
      const batch: TelemetryBatch = { batchId: telemetryBatchId(batchRecords.map((record) => record.event)), events: batchRecords.map((record) => record.event) };
      let outcome: 'delivered' | 'retry';
      try { outcome = await this.transport.send(batch); } catch { outcome = 'retry'; }
      if (outcome === 'delivered') {
        const sent = new Set(batch.events.map((event) => event.eventId));
        this.records = records.filter((record) => !sent.has(record.event.eventId));
      } else {
        for (const record of batchRecords) {
          record.attempts += 1;
          record.nextAttemptAt = now + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (record.attempts - 1));
        }
      }
      this.schedule('rewrite');
      await this.whenIdle();
      return { attempted: batch.events.length, delivered: outcome === 'delivered' ? batch.events.length : 0, batchId: batch.batchId };
    } catch (error) {
      this.warn(`Telemetry flush failed: ${error instanceof Error ? error.message : String(error)}`);
      return { attempted: 0, delivered: 0 };
    }
  }

  /** Resolves once queued disk writes have settled (tests, shutdown). */
  whenIdle(): Promise<void> {
    return this.writeChain;
  }

  private load(): OutboxRecord[] {
    if (this.records) return this.records;
    const records: OutboxRecord[] = [];
    let text = '';
    try { text = fs.readFileSync(this.file, 'utf8'); } catch { /* no outbox yet */ }
    const cutoff = this.now() - this.retentionMs;
    const seen = new Set<string>();
    let dirty = false;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { dirty = true; continue; }
      const record = parsed as Partial<OutboxRecord>;
      const validation = validateProductEvent(record?.event);
      if (!validation.ok || seen.has(validation.event.eventId) || validation.event.at < cutoff) { dirty = true; continue; }
      seen.add(validation.event.eventId);
      records.push({
        event: validation.event,
        attempts: Number.isInteger(record.attempts) && (record.attempts as number) >= 0 ? record.attempts as number : 0,
        ...(typeof record.nextAttemptAt === 'number' && Number.isFinite(record.nextAttemptAt) ? { nextAttemptAt: record.nextAttemptAt } : {})
      });
    }
    this.records = records;
    if (this.enforceBounds(records) || dirty) this.schedule('rewrite');
    return records;
  }

  /** Drops stale and oldest records in place; true when anything was removed. */
  private enforceBounds(records: OutboxRecord[]): boolean {
    const before = records.length;
    const cutoff = this.now() - this.retentionMs;
    for (let index = records.length - 1; index >= 0; index--) if (records[index].event.at < cutoff) records.splice(index, 1);
    while (records.length > this.maxEvents) records.shift();
    let bytes = records.reduce((sum, record) => sum + Buffer.byteLength(JSON.stringify(record)) + 1, 0);
    while (bytes > this.maxBytes && records.length > 0) bytes -= Buffer.byteLength(JSON.stringify(records.shift())) + 1;
    return records.length !== before;
  }

  private schedule(mode: 'append' | 'rewrite', event?: ProductEvent): void {
    this.writeChain = this.writeChain.then(async () => {
      try {
        await fs.promises.mkdir(this.options.dir, { recursive: true, mode: 0o700 });
        if (mode === 'append' && event) {
          const record = this.records?.find((candidate) => candidate.event.eventId === event.eventId);
          if (record) await fs.promises.appendFile(this.file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
          return;
        }
        const body = (this.records ?? []).map((record) => JSON.stringify(record)).join('\n');
        const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
        await fs.promises.writeFile(tmp, body ? `${body}\n` : '', { encoding: 'utf8', mode: 0o600 });
        await fs.promises.rename(tmp, this.file);
      } catch (error) {
        this.warn(`Telemetry outbox write failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}
