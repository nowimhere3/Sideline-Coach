import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isCapabilityId } from './capabilities';
import {
  applyReceipt,
  cloneUsageState,
  emptyUsageState,
  pruneUsageState,
  USAGE_STATE_VERSION,
  type PendingReceipt,
  type UsageReceipt,
  type UsageState
} from './meters';

/**
 * S57.2 §6.4 — local usage persistence. Support-grade, not a financial ledger.
 *
 *   ~/.sideline/entitlement/usage.json          fast-path state (atomic temp + rename)
 *   ~/.sideline/entitlement/usage-journal.jsonl  append-only receipts, rotated at 1 MB, 3 kept
 *
 * Every receipt carries a sequence number and the state records the last one it folded.
 * Commit order is journal first, then state, so a crash between the two is repaired by
 * replaying newer journal lines at the next load. A corrupt or missing state file is
 * rebuilt from whatever journal remains. Anything unrecoverable is simply absent, which
 * under-counts rather than over-counts.
 *
 * One Control Plane process owns the store, like every other ~/.sideline store.
 */

export const USAGE_STATE_FILE = 'usage.json';
export const USAGE_JOURNAL_FILE = 'usage-journal.jsonl';
export const JOURNAL_MAX_BYTES = 1024 * 1024;
export const JOURNAL_KEEP = 3;

/**
 * `fresh`    no state and no journal
 * `loaded`   state file valid and current
 * `replayed` state file valid; newer journal receipts were folded in
 * `rebuilt`  state file missing or corrupt; rebuilt from the journal
 */
export type UsageLoadStatus = 'fresh' | 'loaded' | 'replayed' | 'rebuilt';

export interface UsageReader {
  readonly state: UsageState;
}

export interface UsageStoreOptions {
  /** Directory holding the store, normally `~/.sideline/entitlement`. */
  readonly dir: string;
  readonly now?: () => number;
  readonly journalMaxBytes?: number;
  readonly journalKeep?: number;
  readonly warn?: (message: string) => void;
}

export class UsageStore implements UsageReader {
  private current: UsageState;
  readonly loadStatus: UsageLoadStatus;
  private readonly stateFile: string;
  private readonly journalFile: string;
  private readonly now: () => number;
  private readonly journalMaxBytes: number;
  private readonly journalKeep: number;
  private readonly warn: (message: string) => void;

  constructor(private readonly options: UsageStoreOptions) {
    this.stateFile = path.join(options.dir, USAGE_STATE_FILE);
    this.journalFile = path.join(options.dir, USAGE_JOURNAL_FILE);
    this.now = options.now ?? Date.now;
    this.journalMaxBytes = options.journalMaxBytes ?? JOURNAL_MAX_BYTES;
    this.journalKeep = options.journalKeep ?? JOURNAL_KEEP;
    this.warn = options.warn ?? (() => undefined);
    const { state, status } = this.load();
    this.current = state;
    this.loadStatus = status;
    if (status === 'replayed' || status === 'rebuilt') this.trySave();
  }

  /** Read-only view. Callers must not mutate it. */
  get state(): UsageState {
    return this.current;
  }

  /**
   * Durably records receipts and returns them with sequence numbers. Throws if the journal
   * cannot be written, in which case nothing was recorded (the caller under-counts).
   */
  commit(pending: readonly PendingReceipt[]): UsageReceipt[] {
    if (pending.length === 0) return [];
    let seq = this.current.seq;
    const receipts = pending.map((receipt) => ({ ...receipt, seq: ++seq }));
    fs.mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
    this.rotateIfNeeded();
    fs.appendFileSync(this.journalFile, receipts.map((receipt) => JSON.stringify(receipt)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    const next = cloneUsageState(this.current);
    for (const receipt of receipts) applyReceipt(next, receipt);
    this.current = next;
    this.trySave();
    return receipts;
  }

  /** Every journal receipt still on disk, oldest first (support/audit). */
  journal(): UsageReceipt[] {
    return this.readJournal();
  }

  private load(): { state: UsageState; status: UsageLoadStatus } {
    const fromFile = this.readStateFile();
    const journal = this.readJournal();
    if (fromFile) {
      const newer = journal.filter((receipt) => receipt.seq > fromFile.seq);
      if (newer.length === 0) return { state: fromFile, status: 'loaded' };
      for (const receipt of newer) applyReceipt(fromFile, receipt);
      return { state: fromFile, status: 'replayed' };
    }
    if (journal.length === 0) return { state: emptyUsageState(), status: 'fresh' };
    const rebuilt = emptyUsageState();
    for (const receipt of journal) applyReceipt(rebuilt, receipt);
    this.warn('Usage state was missing or unreadable; rebuilt from the usage journal.');
    return { state: rebuilt, status: 'rebuilt' };
  }

  private readStateFile(): UsageState | undefined {
    let text: string;
    try { text = fs.readFileSync(this.stateFile, 'utf8'); } catch { return undefined; }
    try {
      const parsed = JSON.parse(text) as Partial<UsageState>;
      if (!parsed || parsed.v !== USAGE_STATE_VERSION || !Number.isInteger(parsed.seq) || (parsed.seq as number) < 0) return undefined;
      for (const field of ['buckets', 'keys', 'minuteSets', 'members'] as const) {
        if (!parsed[field] || typeof parsed[field] !== 'object' || Array.isArray(parsed[field])) return undefined;
      }
      return parsed as UsageState;
    } catch {
      return undefined;
    }
  }

  private journalFiles(): string[] {
    // Oldest rotation first, live file last.
    const rotated = Array.from({ length: this.journalKeep }, (_, index) => `${this.journalFile}.${this.journalKeep - index}`);
    return [...rotated, this.journalFile];
  }

  private readJournal(): UsageReceipt[] {
    const bySeq = new Map<number, UsageReceipt>();
    for (const file of this.journalFiles()) {
      let text: string;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const receipt = parseReceipt(line);
        // A torn final line (crash mid-append) or foreign text is skipped, never guessed.
        if (receipt && !bySeq.has(receipt.seq)) bySeq.set(receipt.seq, receipt);
      }
    }
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  }

  private rotateIfNeeded(): void {
    let size = 0;
    try { size = fs.statSync(this.journalFile).size; } catch { return; }
    if (size < this.journalMaxBytes) return;
    try { fs.unlinkSync(`${this.journalFile}.${this.journalKeep}`); } catch { /* not present */ }
    for (let index = this.journalKeep - 1; index >= 1; index--) {
      try { fs.renameSync(`${this.journalFile}.${index}`, `${this.journalFile}.${index + 1}`); } catch { /* not present */ }
    }
    fs.renameSync(this.journalFile, `${this.journalFile}.1`);
  }

  private trySave(): void {
    try {
      fs.mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
      const snapshot = cloneUsageState(this.current);
      pruneUsageState(snapshot, this.now());
      const tmp = `${this.stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.stateFile);
    } catch (error) {
      // The journal already holds the receipts; the next load replays them.
      this.warn(`Usage state could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function parseReceipt(line: string): UsageReceipt | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return undefined; }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const receipt = parsed as Partial<UsageReceipt>;
  if (!Number.isInteger(receipt.seq) || (receipt.seq as number) < 1) return undefined;
  if (typeof receipt.id !== 'string' || !isCapabilityId(receipt.capability)) return undefined;
  if (receipt.meter !== 'count' && receipt.meter !== 'minutes' && receipt.meter !== 'ceiling') return undefined;
  if (typeof receipt.grantId !== 'string' || typeof receipt.periodKey !== 'string') return undefined;
  if (!Number.isInteger(receipt.units) || receipt.units === 0 || typeof receipt.at !== 'number') return undefined;
  if (receipt.meter === 'minutes') {
    const range = receipt.minutes;
    if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0]) || !Number.isInteger(range[1]) || range[1] < range[0]) return undefined;
  }
  return receipt as UsageReceipt;
}
