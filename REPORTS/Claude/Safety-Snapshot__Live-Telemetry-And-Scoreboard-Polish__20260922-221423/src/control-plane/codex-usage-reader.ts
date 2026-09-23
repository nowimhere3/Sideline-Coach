// Global zero-inference Codex account usage reader — provides manual Refresh
// for Codex without requiring a running Game, Stadium, or background polling loop.
// Connects to Codex's installed app-server protocol, initializes, performs
// `account/rateLimits/read`, ingests the factual limits into HealthAuthority,
// and terminates cleanly.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

export interface CodexUsageReaderOptions {
  ingest: (rateLimits: Record<string, unknown>) => boolean;
  timeoutMs?: number;
  readOnceImpl?: (options?: ReadCodexUsageOptions) => Promise<CodexUsageOutcome>;
  now?: () => number;
  log?: (message: string) => void;
  onStatusChange?: (status: CodexUsageStatus) => void;
}

export class CodexUsageReader {
  private readonly ingestFn: (rateLimits: Record<string, unknown>) => boolean;
  private readonly readOnceImpl: (options?: ReadCodexUsageOptions) => Promise<CodexUsageOutcome>;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly onStatusChange: (status: CodexUsageStatus) => void;

  private inFlight: Promise<{ outcome: CodexUsageOutcome; changed: boolean }> | undefined;
  private status: CodexUsageStatus = { state: 'idle' };

  constructor(options: CodexUsageReaderOptions) {
    this.ingestFn = options.ingest;
    this.readOnceImpl = options.readOnceImpl ?? readCodexUsageOnce;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => undefined);
    this.onStatusChange = options.onStatusChange ?? (() => undefined);
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
