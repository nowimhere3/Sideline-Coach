/**
 * Scout Work hygiene (pre-Slice-4).
 *
 * BREADCRUMB — Scout working storage stays bounded.
 *
 * WAS: Formation work moved outside the Game (S36), but Combine still wrote into
 * `<Game>/Scouts`, and Scout Work could grow without bound: about 57 MB per
 * Formation, of which roughly 91% was the OpenCode plugin `node_modules` that
 * OpenCode reinstalls into each receiver's isolated config folder, around a
 * 594-byte Sideline-authored agent file.
 *
 * IS: all product-bound Scout execution (Formation and Combine) uses Sideline-
 * owned `Scout Intelligence/Work`, and a receiver's disposable scaffolding is
 * removed the moment that receiver's durable outputs are secured. What is
 * disposable is an explicit, tiny allowlist below; everything else stays.
 *
 * WHY: read-only Scout authority must stay true during bootstrap, and invisible
 * internal storage must not grow without bound where Dad is never meant to look.
 * Deleting only regenerable scaffolding keeps every byte that is evidence.
 *
 * WILL BE: Slice 4 can run automatic tryouts without mutating Games or quietly
 * consuming gigabytes of hidden storage. If retention ever needs more (for
 * example aging out old forensic folders), it should extend this rule rather than
 * add a second mechanism.
 *
 * Cleanup is housekeeping, not Player evidence. It runs only AFTER an attempt's
 * outcome and telemetry are final, it never throws, and its result is reported
 * separately from the attempt so a filesystem error can never read as a Player-
 * quality failure.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** OpenCode's isolated config folder inside a receiver's working folder. */
const OPENCODE_CONFIG_DIR = '.opencode-combine';
/** OpenCode's isolated data folder (session database, WAL, snapshot). */
const OPENCODE_DATA_DIR = '.opencode-combine-data';

/**
 * The only paths ever removed, relative to one receiver's working folder.
 *
 * ALWAYS, whatever the outcome:
 *   `.opencode-combine/node_modules` is regenerable from the `package.json` and
 *   `package-lock.json` that stay beside it, and is never forensic evidence.
 *   Measured across 56 real receiver folders it is ~99.9% of the config folder.
 *
 * ONLY WHEN THE ATTEMPT COMPLETED AND ITS DURABLE REPORT EXISTS:
 *   `.opencode-combine-data` is OpenCode's own session store. After a completed
 *   attempt its content is already in the durable report and telemetry. After a
 *   BLOCKED / FAILED / INTERRUPTED / UNKNOWN attempt it is kept, because it is the
 *   nearest thing to a transcript of what went wrong.
 *
 * NEVER removed (this is what stays, and it is all of the evidence): `stdout.log`,
 * `stderr.log`, `telemetry.json`, `SCOUT-REPORT.md`, the Formation/Combine level
 * files, and `.opencode-combine/agents`, `package.json`, `package-lock.json` and
 * `.gitignore`, which record exactly which agent contract and plugin version ran.
 */
export function disposableScaffolding(complete: boolean): readonly string[] {
  return complete
    ? [path.join(OPENCODE_CONFIG_DIR, 'node_modules'), OPENCODE_DATA_DIR]
    : [path.join(OPENCODE_CONFIG_DIR, 'node_modules')];
}

export interface WorkHygieneFailure {
  /** Path relative to the receiver's working folder. */
  readonly path: string;
  readonly message: string;
}

export interface ReceiverWorkHygiene {
  readonly removed: readonly string[];
  readonly failed: readonly WorkHygieneFailure[];
}

export interface ReceiverWorkHygieneOptions {
  /** True only when the attempt COMPLETED and its durable report was written. */
  readonly complete: boolean;
  /** Test seam. Defaults to a bounded-retry, NON-blocking recursive delete. */
  readonly remove?: (target: string) => void | PromiseLike<void>;
}

/**
 * Housekeeping outcome for a whole run, recorded in the run's machine-readable
 * completion. It is deliberately NOT part of any attempt, scorecard, evaluation
 * or Player status: a cleanup problem is a filesystem fact, never Player quality.
 */
export interface WorkHygieneSummary {
  readonly receiversCleaned: number;
  readonly pathsRemoved: number;
  readonly failures: readonly { readonly receiver: string; readonly path: string; readonly message: string }[];
}

/**
 * Asynchronous on purpose: Formation runs inside the shared VS Code extension host,
 * and a synchronous delete of a ~3,700-file tree blocks that thread for roughly half a
 * second per receiver. maxRetries covers the brief EBUSY/EPERM a just-exited Windows
 * child can leave behind. Removing a link removes the link itself and never follows it.
 */
function defaultRemove(target: string): Promise<void> {
  return fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

/**
 * Remove one receiver's disposable scaffolding. Never throws: any error is
 * returned as data so the caller's already-final attempt is untouched.
 */
export async function releaseReceiverScaffolding(playerPath: string, options: ReceiverWorkHygieneOptions): Promise<ReceiverWorkHygiene> {
  const removed: string[] = [];
  const failed: WorkHygieneFailure[] = [];
  const remove = options.remove ?? defaultRemove;
  const base = path.resolve(playerPath);
  for (const relative of disposableScaffolding(options.complete)) {
    const target = path.join(base, relative);
    try {
      // Defense in depth: the allowlist is relative and constant, but never delete
      // anything that does not resolve strictly inside this receiver's folder.
      const inside = path.relative(base, target);
      if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Refused: path is outside the receiver working folder.');
      let exists = true;
      try { await fs.promises.lstat(target); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error;
      }
      if (!exists) continue;
      await remove(target);
      removed.push(relative);
    } catch (error) {
      failed.push({ path: relative, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { removed, failed };
}

export function summarizeWorkHygiene(results: readonly { readonly receiver: string; readonly result: ReceiverWorkHygiene | undefined }[]): WorkHygieneSummary {
  let receiversCleaned = 0;
  let pathsRemoved = 0;
  const failures: { receiver: string; path: string; message: string }[] = [];
  for (const { receiver, result } of results) {
    if (!result) continue;
    if (result.removed.length > 0) receiversCleaned += 1;
    pathsRemoved += result.removed.length;
    for (const failure of result.failed) failures.push({ receiver, path: failure.path, message: failure.message });
  }
  return { receiversCleaned, pathsRemoved, failures };
}
