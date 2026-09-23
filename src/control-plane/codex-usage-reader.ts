// Global zero-inference Codex account usage reader — provides manual Refresh
// for Codex without requiring a running Game, Stadium, or background polling loop.
// Connects to Codex's installed app-server protocol, initializes, performs
// `account/rateLimits/read`, ingests the factual limits into HealthAuthority,
// and terminates cleanly.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { resolveBaseLaunch, closeOwnedProcess } from '../player-control/codex-app-server';

export type CodexUsageFailureCode =
  | 'cli_not_found'
  | 'process_error'
  | 'timeout'
  | 'malformed_response'
  | 'rpc_failed'
  | 'no_limits';

export type CodexUsageOutcome =
  | { ok: true; rateLimits: Record<string, unknown> }
  | { ok: false; code: CodexUsageFailureCode; reason: string };

export interface CodexUsageStatus {
  state: 'idle' | 'ok' | 'unavailable';
  code?: CodexUsageFailureCode;
  reason?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
}

export interface ReadCodexUsageOptions {
  timeoutMs?: number;
  command?: string;
  args?: string[];
  shell?: boolean;
  spawnImpl?: (command: string, args: string[], options: Record<string, unknown>) => ChildProcessWithoutNullStreams;
  resolveLaunchImpl?: () => Promise<{ command: string; args: string[]; shell: boolean }>;
}

export async function readCodexUsageOnce(options: ReadCodexUsageOptions = {}): Promise<CodexUsageOutcome> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const spawnImpl = options.spawnImpl ?? ((cmd, args, opts) => spawn(cmd, args, opts) as ChildProcessWithoutNullStreams);
  const resolveLaunchImpl = options.resolveLaunchImpl ?? resolveBaseLaunch;

  let launch: { command: string; args: string[]; shell: boolean };
  if (options.command) {
    launch = { command: options.command, args: options.args ?? ['app-server'], shell: options.shell ?? false };
  } else {
    try {
      launch = await resolveLaunchImpl();
    } catch {
      return { ok: false, code: 'cli_not_found', reason: 'Codex CLI is not installed or could not be found.' };
    }
  }

  return new Promise<CodexUsageOutcome>((resolve) => {
    let settled = false;
    let child: ChildProcessWithoutNullStreams | undefined;
    let timer: NodeJS.Timeout | undefined;

    const finish = async (outcome: CodexUsageOutcome): Promise<void> => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child) {
        await closeOwnedProcess(child, 500).catch(() => undefined);
      }
      resolve(outcome);
    };

    timer = setTimeout(() => {
      void finish({ ok: false, code: 'timeout', reason: 'Timed out waiting for Codex app-server response.' });
    }, timeoutMs);

    try {
      child = spawnImpl(launch.command, launch.args, {
        windowsHide: true,
        shell: launch.shell,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      void finish({
        ok: false,
        code: 'process_error',
        reason: error instanceof Error ? error.message : 'Failed to spawn Codex app-server.'
      });
      return;
    }

    child.on('error', (err: unknown) => {
      const code = (err as { code?: string })?.code;
      void finish({
        ok: false,
        code: code === 'ENOENT' ? 'cli_not_found' : 'process_error',
        reason: err instanceof Error ? err.message : 'Codex app-server process error.'
      });
    });

    child.on('exit', (code) => {
      if (!settled) {
        void finish({
          ok: false,
          code: 'process_error',
          reason: `Codex app-server exited unexpectedly with code ${String(code)}.`
        });
      }
    });

    const rl = createInterface({ input: child.stdout });

    const sendLine = (payload: unknown): void => {
      if (child && child.stdin && child.stdin.writable) {
        child.stdin.write(`${JSON.stringify(payload)}\n`);
      }
    };

    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.id === 1) {
        // initialize completed
        sendLine({ method: 'initialized' });
        sendLine({ id: 2, method: 'account/rateLimits/read', params: {} });
      } else if (msg.id === 2) {
        if (msg.error) {
          const err = msg.error as Record<string, unknown>;
          void finish({
            ok: false,
            code: 'rpc_failed',
            reason: typeof err.message === 'string' ? err.message : 'Codex rateLimits/read request failed.'
          });
          return;
        }
        const result = msg.result as Record<string, unknown> | undefined;
        const rateLimits = result?.rateLimits;
        if (!rateLimits || typeof rateLimits !== 'object' || Array.isArray(rateLimits)) {
          void finish({
            ok: false,
            code: 'malformed_response',
            reason: 'Codex app-server returned malformed rate-limit data.'
          });
          return;
        }
        void finish({ ok: true, rateLimits: rateLimits as Record<string, unknown> });
      }
    });

    // Initiate initialize handshake
    sendLine({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'sideline_coach', version: '0.1.0' },
        capabilities: null
      }
    });
  });
}

// Event-driven Codex freshness. Codex work anywhere on this machine (Dad's Codex
// terminal included, not just Sideline-controlled Players) appends to its session
// rollout under ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Codex holds that file
// open while it writes, and on Windows fs.watch reports NOTHING for appends through
// a held-open handle (field-probed: 6 appends, 0 events) and the mtime stays stale —
// but stat().size is exact. So a cheap LOCAL size check (no network, no process)
// detects the work, and one bounded authoritative account/rateLimits/read follows
// once it settles. Same bounds as the Claude activity path.
export const CODEX_ACTIVITY_SCAN_MS = 10_000;
export const CODEX_ACTIVITY_SETTLE_MS = 15_000;
export const CODEX_ACTIVITY_MAX_WAIT_MS = 120_000;
export const CODEX_ACTIVITY_MIN_SPACING_MS = 90_000;

export function defaultCodexSessionsDir(): string {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
}

export interface CodexActivityWatchOptions {
  intervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Calls `onActivity` when any Codex session rollout in today's or yesterday's (local
 * date) session directory is created or grows. Reads no file content. The first scan
 * is a silent baseline, so starting the daemon never counts as activity. Returns stop.
 */
export function watchCodexActivity(
  sessionsDir: string,
  onActivity: () => void,
  options: CodexActivityWatchOptions = {}
): () => void {
  const now = options.now ?? Date.now;
  const sizes = new Map<string, number>();
  let baseline = true;
  let warned = false;
  const dayDir = (ms: number): string => {
    const d = new Date(ms);
    return path.join(sessionsDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  };
  const scan = (): void => {
    let grew = false;
    const t = now();
    for (const dir of new Set([dayDir(t - 86_400_000), dayDir(t)])) {
      let names: string[];
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const name of names) {
        if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue;
        const file = path.join(dir, name);
        let size: number;
        try { size = fs.statSync(file).size; } catch { continue; }
        const before = sizes.get(file);
        if (!baseline && (before === undefined || size > before)) grew = true;
        sizes.set(file, size);
      }
    }
    baseline = false;
    if (grew) onActivity();
  };
  try {
    scan();
  } catch (error) {
    if (!warned) options.log?.(`[codex-usage-reader] activity scan unavailable: ${error instanceof Error ? error.message : String(error)}`);
    warned = true;
  }
  const timer = setInterval(() => { try { scan(); } catch { /* next scan retries */ } }, options.intervalMs ?? CODEX_ACTIVITY_SCAN_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

export interface CodexUsageReaderOptions {
  ingest: (rateLimits: Record<string, unknown>) => boolean;
  timeoutMs?: number;
  readOnceImpl?: (options?: ReadCodexUsageOptions) => Promise<CodexUsageOutcome>;
  now?: () => number;
  log?: (message: string) => void;
  onStatusChange?: (status: CodexUsageStatus) => void;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (handle: NodeJS.Timeout) => void;
}

export class CodexUsageReader {
  private readonly ingestFn: (rateLimits: Record<string, unknown>) => boolean;
  private readonly readOnceImpl: (options?: ReadCodexUsageOptions) => Promise<CodexUsageOutcome>;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly onStatusChange: (status: CodexUsageStatus) => void;

  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (handle: NodeJS.Timeout) => void;

  private inFlight: Promise<{ outcome: CodexUsageOutcome; changed: boolean }> | undefined;
  private status: CodexUsageStatus = { state: 'idle' };
  private lastAttemptMs: number | undefined;
  private activityTimer: NodeJS.Timeout | undefined;
  private activityStartedMs: number | undefined;
  private stopped = false;

  constructor(options: CodexUsageReaderOptions) {
    this.ingestFn = options.ingest;
    this.readOnceImpl = options.readOnceImpl ?? readCodexUsageOnce;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => undefined);
    this.onStatusChange = options.onStatusChange ?? (() => undefined);
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  /**
   * Codex work was observed (a session rollout grew). Debounces it into ONE
   * authoritative account/rateLimits/read: after CODEX_ACTIVITY_SETTLE_MS of quiet,
   * or after CODEX_ACTIVITY_MAX_WAIT_MS of continuous work, never sooner than
   * CODEX_ACTIVITY_MIN_SPACING_MS after the previous read. Zero inference.
   */
  noteCodexActivity(): void {
    if (this.stopped) return;
    const now = this.now();
    this.activityStartedMs ??= now;
    const settledAt = Math.min(now + CODEX_ACTIVITY_SETTLE_MS, this.activityStartedMs + CODEX_ACTIVITY_MAX_WAIT_MS);
    const spacedAt = this.lastAttemptMs === undefined ? now : this.lastAttemptMs + CODEX_ACTIVITY_MIN_SPACING_MS;
    const at = Math.max(settledAt, spacedAt);
    if (this.activityTimer) this.clearTimer(this.activityTimer);
    this.activityTimer = this.setTimer(() => {
      this.activityTimer = undefined;
      this.activityStartedMs = undefined;
      if (this.stopped) return;
      this.log('[codex-usage-reader] Codex activity observed; reading account rate limits.');
      void this.refresh().catch(() => undefined);
    }, Math.max(0, at - now));
    if (typeof this.activityTimer.unref === 'function') this.activityTimer.unref();
  }

  stop(): void {
    this.stopped = true;
    if (this.activityTimer) this.clearTimer(this.activityTimer);
    this.activityTimer = undefined;
    this.activityStartedMs = undefined;
  }

  getStatus(): CodexUsageStatus {
    return { ...this.status };
  }

  /**
   * Forced manual read for Codex. Joins in-flight read if one is active.
   * Never background polls.
   */
  async refresh(): Promise<{ outcome: CodexUsageOutcome; changed: boolean }> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performRefresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async performRefresh(): Promise<{ outcome: CodexUsageOutcome; changed: boolean }> {
    this.lastAttemptMs = this.now();
    const outcome = await this.readOnceImpl({ timeoutMs: this.timeoutMs });
    const attemptedAt = new Date(this.now()).toISOString();
    let changed = false;

    if (outcome.ok) {
      changed = this.ingestFn(outcome.rateLimits);
      this.setStatus({ state: 'ok', lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt });
    } else {
      this.log(`[codex-usage-reader] ${outcome.code}: ${outcome.reason}`);
      this.setStatus({
        state: 'unavailable',
        code: outcome.code,
        reason: outcome.reason,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: this.status.lastSuccessAt
      });
    }

    return { outcome, changed };
  }

  private setStatus(next: CodexUsageStatus): void {
    const changed = next.state !== this.status.state || next.code !== this.status.code;
    this.status = next;
    if (changed) this.onStatusChange(this.getStatus());
  }
}
