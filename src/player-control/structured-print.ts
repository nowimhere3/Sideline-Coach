/**
 * Controlled Claude and Controlled AntiGravity (Q2.10C).
 *
 * One Coach-owned provider session per Player instance, driven Play by Play
 * through the provider's structured print mode:
 *
 *   Play → spawn `<cli> <print flags> <authority> <session> <model/effort>` in the Game
 *        → prompt on stdin as one stream-json message
 *        → semantic events (init → progress → result) → turn lifecycle
 *
 * Why print mode, not a terminal: Q2.10B proved `--model` / `--effort` on this
 * path are invocation-scoped and never rewrite the human's global provider
 * settings, while `/model` inside an interactive session can. One process per
 * Play keeps per-Play model/effort exact.
 *
 * Provider syntax lives in the two dialects below; the runtime is shared. The
 * contract is verified from the installed CLI's own `--help` before launch, so
 * an update that removes a required flag fails closed (Needs verification)
 * instead of silently changing authority.
 */

import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { ControlledBindingRecord } from './bindings';
import {
  ControlOpenError,
  isFullAutonomyAuthority,
  isProviderAuthority,
  type ControlEvent,
  type ControlOpenRequest,
  type ControlRestoreOutcome,
  type DeliverOptions,
  type DeliveryOutcome,
  type PlayerControl,
  type PlayerControlFactory,
  type ProviderPlayerAuthority
} from './contract';
import type { ProviderCapabilitySnapshot } from '../capability-types';
import {
  antigravityCapabilitySnapshot,
  antigravityModelArgs,
  claudeCapabilitySnapshot,
  parseAntiGravityModels,
  parseClaudeEffortLevels,
  parseClaudeModelStatus,
  type AntiGravityModel
} from '../provider-control';

const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;

/** What one provider stdout line meant, in provider-neutral terms. */
export type PrintSignal =
  | { kind: 'init'; sessionRef?: string; model?: string }
  | { kind: 'message'; text: string }
  | { kind: 'command' | 'tool'; summary: string }
  | { kind: 'denied'; summary: string }
  | { kind: 'result'; ok: boolean; summary: string; denied: number };

export type SessionCheck =
  | { kind: 'present' }
  | { kind: 'missing'; replacementRef?: string }
  | { kind: 'unknown'; message: string };

export interface PrintProcessResult { code: number | null; stdout: string; stderr: string; spawnError?: string }

export interface PrintLaunchOptions {
  /** Test seam: the executable to launch instead of the provider CLI. */
  command?: string;
  /** Test seam: arguments placed before the provider arguments (e.g. a fixture path). */
  prefixArgs?: readonly string[];
  env?: NodeJS.ProcessEnv;
  /** How long a Play may take to report `init` before Coach stops waiting. */
  initTimeoutMs?: number;
  /** Budget for local, no-inference probes (help, version, models, session checks). */
  probeTimeoutMs?: number;
  closeGraceMs?: number;
}

interface TurnContext {
  readonly sessionRef: string;
  readonly started: boolean;
  readonly authority: ProviderPlayerAuthority;
  readonly model?: string;
  readonly effort?: string;
}

interface Runner {
  run(args: readonly string[], cwd: string, stdinText?: string): Promise<PrintProcessResult>;
}

/** Provider-specific syntax. Everything else is shared. */
export interface PrintDialect {
  readonly playerType: 'claude' | 'antigravity';
  readonly adapterId: string;
  readonly displayName: string;
  readonly executable: string;
  /** Flags the installed CLI must advertise before Coach trusts the contract. */
  requiredHelpTerms(authority: ProviderPlayerAuthority): readonly string[];
  /** Prompt is written only after `init` confirms the exact session (AntiGravity). */
  readonly promptAfterInit: boolean;
  authorityArgs(authority: ProviderPlayerAuthority): string[];
  turnArgs(turn: TurnContext): string[];
  promptFrame(play: string): JsonObject;
  parse(frame: JsonObject): PrintSignal[];
  createSession(runner: Runner, gameRoot: string, authority: ProviderPlayerAuthority): Promise<string>;
  checkSession(runner: Runner, gameRoot: string, sessionRef: string, historyExpected: boolean, authority: ProviderPlayerAuthority): Promise<SessionCheck>;
  probeCapabilities(runner: Runner): Promise<ProviderCapabilitySnapshot>;
  /** True when a failed start means "this session id is already taken" (Claude). */
  isSessionInUse?(stderr: string): boolean;
  isSessionMissing(stderr: string, stdout: string): boolean;
}

// --- Claude -----------------------------------------------------------------

export const CLAUDE_ACCEPT_EDITS_AUTHORITY_ARGS = ['--permission-mode', 'acceptEdits', '--permission-prompts', 'none'] as const;
export const CLAUDE_FULL_AUTONOMY_ARGS = ['--dangerously-skip-permissions'] as const;
export const CLAUDE_AUTHORITY_ARGS = CLAUDE_FULL_AUTONOMY_ARGS;

export function claudeDialect(): PrintDialect {
  const base = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
  const dialect: PrintDialect = {
    playerType: 'claude',
    adapterId: 'claude-print-stream',
    displayName: 'Claude',
    executable: 'claude',
    requiredHelpTerms: (authority) => [
      '--session-id', '--resume', 'stream-json', '--model', '--effort',
      ...(isFullAutonomyAuthority(authority)
        ? ['--dangerously-skip-permissions']
        : ['--permission-mode', 'acceptEdits', '--permission-prompts'])
    ],
    promptAfterInit: false,
    authorityArgs: (authority) => isFullAutonomyAuthority(authority)
      ? [...CLAUDE_FULL_AUTONOMY_ARGS]
      : [...CLAUDE_ACCEPT_EDITS_AUTHORITY_ARGS],
    turnArgs: (turn) => [
      ...base,
      ...dialect.authorityArgs(turn.authority),
      // A Claude session exists on disk only after its first Play. Until then Coach
      // names it (--session-id) so the identity is known before anything runs.
      ...(turn.started ? ['--resume', turn.sessionRef] : ['--session-id', turn.sessionRef]),
      ...(turn.model && turn.model !== 'default' ? ['--model', turn.model] : []),
      ...(turn.effort && turn.effort !== 'default' ? ['--effort', turn.effort] : [])
    ],
    promptFrame: (play) => ({ type: 'user', message: { role: 'user', content: play } }),
    parse: parseClaudeFrame,
    // Claude persists nothing until a Play runs, so opening needs no process.
    createSession: async () => randomUUID(),
    checkSession: async (runner, gameRoot, sessionRef, historyExpected, authority) => {
      if (!historyExpected) return { kind: 'present' };
      // `--resume` with an empty stream: exits 0 without a model call when the
      // conversation exists, and fails fast with "No conversation found" when not.
      const result = await runner.run([...base, ...dialect.authorityArgs(authority), '--resume', sessionRef], gameRoot, '');
      if (result.spawnError) return { kind: 'unknown', message: result.spawnError };
      if (result.code === 0) return { kind: 'present' };
      if (dialect.isSessionMissing(result.stderr, result.stdout)) return { kind: 'missing' };
      return { kind: 'unknown', message: firstLine(result.stderr) || `Claude exited with code ${result.code}.` };
    },
    probeCapabilities: async (runner) => {
      const neutral = os.tmpdir();
      const [model, effort] = await Promise.all([
        runner.run(['-p', '/model', '--no-session-persistence'], neutral, ''),
        runner.run(['-p', '/effort', '--no-session-persistence'], neutral, '')
      ]);
      return claudeCapabilitySnapshot(
        parseClaudeModelStatus(model.stdout),
        parseClaudeEffortLevels(effort.stdout)
      ) as ProviderCapabilitySnapshot;
    },
    isSessionInUse: (stderr) => /session id .* is already in use/i.test(stderr),
    isSessionMissing: (stderr, stdout) => /no conversation found/i.test(`${stderr}\n${stdout}`)
  };
  return dialect;
}

function parseClaudeFrame(frame: JsonObject): PrintSignal[] {
  const type = stringValue(frame.type);
  if (type === 'system' && frame.subtype === 'init') {
    return [{ kind: 'init', sessionRef: stringValue(frame.session_id), model: stringValue(frame.model) }];
  }
  if (type === 'system' && frame.subtype === 'permission_denied') {
    return [{ kind: 'denied', summary: `Needed approval, so it was skipped: ${compact(frame.tool_name ?? asObject(frame.tool).name ?? 'an action')}` }];
  }
  if (type === 'assistant') {
    const content = asObject(frame.message).content;
    const signals: PrintSignal[] = [];
    for (const raw of Array.isArray(content) ? content : []) {
      const block = asObject(raw);
      if (block.type === 'text' && stringValue(block.text)) signals.push({ kind: 'message', text: String(block.text) });
      else if (block.type === 'tool_use') {
        const name = stringValue(block.name) ?? 'tool';
        const input = asObject(block.input);
        if (/^(bash|powershell)$/i.test(name)) signals.push({ kind: 'command', summary: compact(input.command ?? name) });
        else signals.push({ kind: 'tool', summary: compact(stringValue(input.file_path) ? `${name} ${input.file_path}` : name) });
      }
    }
    return signals;
  }
  if (type === 'result') {
    const denied = Array.isArray(frame.permission_denials) ? frame.permission_denials.length : 0;
    const ok = frame.subtype === 'success' && frame.is_error !== true;
    const detail = stringValue(frame.result) ?? (Array.isArray(frame.errors) ? frame.errors.map(String).join('; ') : undefined);
    return [{ kind: 'result', ok, denied, summary: ok ? 'Completed' : `Failed${detail ? `: ${compact(detail)}` : ''}` }];
  }
  return [];
}

// --- AntiGravity ------------------------------------------------------------

export const ANTIGRAVITY_ACCEPT_EDITS_AUTHORITY_ARGS = ['--mode', 'accept-edits'] as const;
export const ANTIGRAVITY_FULL_AUTONOMY_ARGS = ['--dangerously-skip-permissions'] as const;
export const ANTIGRAVITY_AUTHORITY_ARGS = ANTIGRAVITY_FULL_AUTONOMY_ARGS;

export function antigravityDialect(): PrintDialect {
  let catalog: AntiGravityModel[] | undefined;
  const base = ['--input-format', 'stream-json', '--output-format', 'stream-json'];
  const openArgs = (authority: ProviderPlayerAuthority, conversation?: string): string[] => [
    ...base,
    ...dialect.authorityArgs(authority),
    ...(conversation ? ['--conversation', conversation] : []),
    // Headless waits are bounded by --print-timeout (default 5m); a real Play can
    // run far longer, so Coach owns liveness instead.
    '--print-timeout', '24h'
  ];
  const dialect: PrintDialect = {
    playerType: 'antigravity',
    adapterId: 'antigravity-print-stream',
    displayName: 'AntiGravity',
    executable: 'agy',
    requiredHelpTerms: (authority) => [
      '--conversation', '--input-format', 'stream-json', '--model', '--effort',
      ...(isFullAutonomyAuthority(authority) ? ['--dangerously-skip-permissions'] : ['--mode', 'accept-edits'])
    ],
    // AntiGravity silently starts a NEW conversation when `--conversation` is
    // unknown (1.2.2: stderr warning only). Its `init` arrives before stdin is
    // read, so Coach confirms the exact conversation before sending the Play.
    promptAfterInit: true,
    authorityArgs: (authority) => isFullAutonomyAuthority(authority)
      ? [...ANTIGRAVITY_FULL_AUTONOMY_ARGS]
      : [...ANTIGRAVITY_ACCEPT_EDITS_AUTHORITY_ARGS],
    turnArgs: (turn) => [...openArgs(turn.authority, turn.sessionRef), ...antigravityModelArgs(catalog, turn.model, turn.effort), '-p='],
    promptFrame: (play) => ({ event: 'user', message: { role: 'user', content: play } }),
    parse: parseAntiGravityFrame,
    createSession: async (runner, gameRoot, authority) => {
      // An empty stream opens and persists a conversation without a model call.
      const result = await runner.run([...openArgs(authority), '-p='], gameRoot, '');
      const init = initOf(result.stdout);
      if (!init) throw new Error(firstLine(result.stderr) || result.spawnError || 'AntiGravity did not open a conversation.');
      return init;
    },
    checkSession: async (runner, gameRoot, sessionRef, _historyExpected, authority) => {
      const result = await runner.run([...openArgs(authority, sessionRef), '-p='], gameRoot, '');
      if (result.spawnError) return { kind: 'unknown', message: result.spawnError };
      const init = initOf(result.stdout);
      if (!init) return { kind: 'unknown', message: firstLine(result.stderr) || 'AntiGravity did not answer.' };
      return init === sessionRef ? { kind: 'present' } : { kind: 'missing', replacementRef: init };
    },
    probeCapabilities: async (runner) => {
      const result = await runner.run(['models'], os.tmpdir(), '');
      const models = parseAntiGravityModels(result.stdout);
      if (models) catalog = models;
      return antigravityCapabilitySnapshot(models) as ProviderCapabilitySnapshot;
    },
    isSessionMissing: (stderr) => /conversation .* not found/i.test(stderr)
  };
  return dialect;
}

function parseAntiGravityFrame(frame: JsonObject): PrintSignal[] {
  const event = stringValue(frame.event);
  if (event === 'init') return [{ kind: 'init', sessionRef: stringValue(frame.conversation_id), model: stringValue(asObject(frame.init).model) }];
  if (event === 'step_update') {
    const step = asObject(frame.step_update);
    if (step.step_type === 'agent_response' && stringValue(step.text_delta)) return [{ kind: 'message', text: String(step.text_delta) }];
    if (step.step_type === 'tool' && step.state === 'ACTIVE') {
      const name = stringValue(step.tool_name) ?? 'tool';
      const parameters = asObject(asObject(step.tool_info).parameters);
      if (name === 'run_command') return [{ kind: 'command', summary: compact(parameters.CommandLine ?? name) }];
      return [{ kind: 'tool', summary: compact(stringValue(parameters.TargetFile) ? `${name} ${parameters.TargetFile}` : name) }];
    }
    return [];
  }
  if (event === 'result') {
    const result = asObject(frame.result);
    const denied = Array.isArray(result.denied_actions) ? result.denied_actions.length : 0;
    const ok = result.status === 'SUCCESS';
    const error = stringValue(result.error);
    return [{ kind: 'result', ok, denied, summary: ok ? 'Completed' : `Failed${error ? `: ${compact(error)}` : ''}` }];
  }
  return [];
}

function initOf(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const frame = parseJson(line);
    if (frame && frame.event === 'init') return stringValue(frame.conversation_id);
  }
  return undefined;
}

// --- Shared runtime -----------------------------------------------------------

class ProcessRunner implements Runner {
  constructor(private readonly dialect: PrintDialect, private readonly options: PrintLaunchOptions) {}

  spawn(args: readonly string[], cwd: string): ChildProcessWithoutNullStreams {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.options.env };
    // A Stadium started from inside a Claude Code session must not make the
    // Player believe it is a nested session.
    delete env.CLAUDECODE;
    return spawn(this.options.command ?? this.dialect.executable, [...(this.options.prefixArgs ?? []), ...args], {
      cwd,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  run(args: readonly string[], cwd: string, stdinText = ''): Promise<PrintProcessResult> {
    return new Promise((resolve) => {
      let child: ChildProcessWithoutNullStreams;
      try { child = this.spawn(args, cwd); }
      catch (error) { resolve({ code: null, stdout: '', stderr: '', spawnError: messageOf(error) }); return; }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: PrintProcessResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        void killTree(child);
        finish({ code: null, stdout, stderr, spawnError: `${this.dialect.displayName} did not answer in time.` });
      }, this.options.probeTimeoutMs ?? 15_000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { if (stdout.length < 1_000_000) stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { if (stderr.length < 64_000) stderr += chunk; });
      child.once('error', (error) => finish({ code: null, stdout, stderr, spawnError: describeSpawnError(this.dialect, error) }));
      child.once('close', (code) => finish({ code, stdout, stderr }));
      child.stdin.on('error', () => undefined);
      child.stdin.end(stdinText);
    });
  }
}

export class StructuredPrintControl implements PlayerControl {
  private readonly listeners = new Set<(event: ControlEvent) => void>();
  private readonly eventHistory: ControlEvent[] = [];
  private controlState: PlayerControl['state'] = 'ready';
  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private interruptRequested = false;
  model: string | undefined;
  effort: string | undefined;

  constructor(
    readonly instanceId: string,
    readonly providerSessionRef: string,
    readonly runtimeVersion: string,
    private readonly gameRoot: string,
    private readonly dialect: PrintDialect,
    private readonly runner: ProcessRunner,
    private readonly options: PrintLaunchOptions,
    private readonly authority: ProviderPlayerAuthority,
    /** Whether the provider session already holds history (a Play has run in it). */
    private started: boolean
  ) {}

  get state(): PlayerControl['state'] { return this.controlState; }

  async deliver(play: string, clientRef: string, options?: DeliverOptions): Promise<DeliveryOutcome> {
    if (!play.trim()) return { kind: 'refused', reason: 'invalid', message: 'Play cannot be empty.' };
    if (this.controlState === 'active') return { kind: 'refused', reason: 'busy', message: 'That Player is still working.' };
    if (this.controlState !== 'ready') {
      return { kind: 'refused', reason: this.controlState === 'closed' ? 'closed' : 'unavailable', message: 'That controlled Player is unavailable.' };
    }
    this.controlState = 'active';
    const outcome = await this.startTurn(play, clientRef, options, false);
    if (outcome.kind === 'refused' && this.controlState === 'active') this.controlState = 'ready';
    return outcome;
  }

  private startTurn(play: string, clientRef: string, options: DeliverOptions | undefined, retried: boolean): Promise<DeliveryOutcome> {
    const turnRef = `turn-${clientRef}`;
    const model = options?.model && options.model !== 'default' ? options.model : undefined;
    const effort = options?.effort && options.effort !== 'default' ? options.effort : undefined;
    const args = this.dialect.turnArgs({ sessionRef: this.providerSessionRef, started: this.started, authority: this.authority, model, effort });
    return new Promise<DeliveryOutcome>((resolve) => {
      let child: ChildProcessWithoutNullStreams;
      try { child = this.runner.spawn(args, this.gameRoot); }
      catch (error) { resolve({ kind: 'refused', reason: 'unavailable', message: describeSpawnError(this.dialect, error) }); return; }
      this.activeChild = child;
      this.interruptRequested = false;
      let accepted = false;
      let decided = false;
      let result: Extract<PrintSignal, { kind: 'result' }> | undefined;
      let denied = 0;
      let stderr = '';
      let buffer = '';
      const decide = (outcome: DeliveryOutcome): void => {
        if (decided) return;
        decided = true;
        clearTimeout(initTimer);
        resolve(outcome);
      };
      const writePrompt = (): void => {
        child.stdin.on('error', () => undefined);
        child.stdin.end(`${JSON.stringify(this.dialect.promptFrame(play))}\n`);
      };
      const accept = (): void => {
        if (accepted) return;
        accepted = true;
        this.model = model ?? this.model;
        this.effort = effort ?? this.effort;
        if (model || effort) this.emit({ kind: 'settings', model: this.model, effort: this.effort, runtimeVersion: this.runtimeVersion });
        this.emit({ kind: 'turn', state: 'accepted', turnRef, summary: `Play received · ${play.length.toLocaleString()} chars · ${lineCount(play)} lines` });
        this.emit({ kind: 'turn', state: 'started', turnRef, summary: 'Working…' });
        decide({ kind: 'accepted', turnRef });
      };

      // Claude reads the prompt right away; AntiGravity only after `init` proves the
      // exact conversation, so a stale id can never run a Play in a new conversation.
      if (!this.dialect.promptAfterInit) writePrompt();
      const initTimer = setTimeout(() => {
        if (accepted) return;
        if (this.dialect.promptAfterInit) {
          void killTree(child);
          decide({ kind: 'refused', reason: 'unavailable', message: `${this.dialect.displayName} didn't start in time. Nothing was sent.` });
        } else {
          // The Play already crossed on stdin; the provider is simply slow to report.
          accept();
        }
      }, this.options.initTimeoutMs ?? (this.dialect.promptAfterInit ? 12_000 : 8_000));

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => { if (stderr.length < 64_000) stderr += chunk; });
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        for (;;) {
          const newline = buffer.indexOf('\n');
          if (newline < 0) break;
          const frame = parseJson(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (!frame) continue;
          for (const signal of this.dialect.parse(frame)) {
            if (signal.kind === 'init') {
              if (signal.sessionRef && signal.sessionRef !== this.providerSessionRef) {
                // Never let a Play run in a different conversation than this instance owns.
                void killTree(child);
                this.loseSession(`${this.dialect.displayName} couldn't reopen this Player's conversation.`);
                decide({ kind: 'refused', reason: 'closed', message: `Can't reach this Player's conversation. Nothing was sent.` });
                return;
              }
              if (signal.model) this.model = signal.model;
              if (this.dialect.promptAfterInit) writePrompt();
              this.started = true;
              accept();
            } else if (signal.kind === 'message') {
              this.emit({ kind: 'progress', category: 'message', summary: signal.text });
            } else if (signal.kind === 'command' || signal.kind === 'tool') {
              this.emit({ kind: 'progress', category: signal.kind, summary: signal.summary });
            } else if (signal.kind === 'denied') {
              denied += 1;
              this.emit({ kind: 'request', state: 'declined', summary: signal.summary });
            } else if (signal.kind === 'result') {
              result = signal;
            }
          }
        }
      });
      child.once('error', (error) => {
        if (!accepted) decide({ kind: 'refused', reason: 'unavailable', message: describeSpawnError(this.dialect, error) });
      });
      child.once('close', (code) => {
        this.activeChild = undefined;
        if (!accepted) {
          clearTimeout(initTimer);
          if (!retried && this.dialect.isSessionInUse?.(stderr)) {
            // The session already holds a Play whose record was lost: continue it.
            this.started = true;
            void this.startTurn(play, clientRef, options, true).then(decide);
            return;
          }
          if (this.dialect.isSessionMissing(stderr, '')) {
            this.loseSession(`${this.dialect.displayName} couldn't reopen this Player's conversation.`);
            decide({ kind: 'refused', reason: 'closed', message: `Can't reach this Player's conversation. Nothing was sent.` });
            return;
          }
          decide({ kind: 'refused', reason: 'unavailable', message: `${this.dialect.displayName} stopped before taking the Play${firstLine(stderr) ? `: ${firstLine(stderr)}` : ` (exit ${code}).`}` });
          return;
        }
        if (this.controlState === 'closed') return;
        this.controlState = this.controlState === 'lost' ? 'lost' : 'ready';
        if (this.interruptRequested) {
          this.emit({ kind: 'turn', state: 'interrupted', turnRef, summary: 'Interrupted — it may have made partial changes' });
        } else if (result) {
          const skipped = Math.max(denied, result.denied);
          const note = skipped ? ` · ${skipped} action${skipped === 1 ? '' : 's'} needed approval and ${skipped === 1 ? 'was' : 'were'} skipped` : '';
          this.emit({ kind: 'turn', state: result.ok ? 'completed' : 'failed', turnRef, summary: `${result.summary}${note}` });
        } else {
          // A process that ends without a result says nothing about what the Play did.
          this.emit({ kind: 'turn', state: 'unknown', turnRef, summary: 'Stopped without reporting a result — check the Game before sending it again' });
        }
      });
    });
  }

  async queryCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.dialect.probeCapabilities(this.runner);
  }

  async interrupt(): Promise<boolean> {
    const child = this.activeChild;
    if (!child) return false;
    this.interruptRequested = true;
    await killTree(child);
    return true;
  }

  onEvent(listener: (event: ControlEvent) => void): () => void {
    this.listeners.add(listener);
    for (const event of this.eventHistory) listener(event);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.controlState === 'closed') return;
    this.controlState = 'closed';
    const child = this.activeChild;
    this.activeChild = undefined;
    if (child) await killTree(child, this.options.closeGraceMs);
    this.listeners.clear();
  }

  /** Announce a ready channel (after open or restore). */
  announceReady(): void {
    this.emit({ kind: 'channel', state: 'ready', summary: `CONTROLLED ${this.dialect.displayName.toUpperCase()} READY` });
  }

  private loseSession(summary: string): void {
    this.controlState = 'lost';
    this.emit({ kind: 'channel', state: 'lost', summary });
  }

  private emit(event: ControlEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 50) this.eventHistory.shift();
    for (const listener of this.listeners) listener(event);
  }
}

export class StructuredPrintFactory implements PlayerControlFactory {
  readonly adapterId: string;
  private readonly runner: ProcessRunner;

  constructor(private readonly dialect: PrintDialect, private readonly options: PrintLaunchOptions = {}) {
    this.adapterId = dialect.adapterId;
    this.runner = new ProcessRunner(dialect, options);
  }

  async open(request: ControlOpenRequest): Promise<PlayerControl> {
    const authority = this.requireAuthority(request);
    const gameRoot = path.resolve(request.gameRoot);
    const runtimeVersion = await this.verifyContract(authority);
    let sessionRef: string;
    try { sessionRef = await this.dialect.createSession(this.runner, gameRoot, authority); }
    catch (error) { throw new ControlOpenError('failed', `${this.dialect.displayName} couldn't open a conversation: ${messageOf(error)}`); }
    const control = new StructuredPrintControl(request.instanceId, sessionRef, runtimeVersion, gameRoot, this.dialect, this.runner, this.options, authority, false);
    control.announceReady();
    return control;
  }

  async restore(request: ControlOpenRequest, binding: ControlledBindingRecord): Promise<ControlRestoreOutcome> {
    if (!isProviderAuthority(request.authority)) return { kind: 'needs-decision', message: `${this.dialect.displayName} has no supported permission policy for this Player.` };
    const authority = request.authority;
    const gameRoot = path.resolve(request.gameRoot);
    let runtimeVersion: string;
    try { runtimeVersion = await this.verifyContract(authority); }
    catch (error) {
      const message = messageOf(error);
      return error instanceof ControlOpenError && error.outcome === 'needs-verification'
        ? { kind: 'needs-verification', message }
        : { kind: 'needs-decision', message };
    }
    const check = await this.dialect.checkSession(this.runner, gameRoot, binding.sessionRef, binding.historyExpected, authority);
    const reconciliation = binding.pendingPlay
      ? { kind: 'unknown' as const, summary: 'Unknown — check the Game before sending it again' }
      : { kind: 'none' as const };

    if (check.kind === 'present') {
      const control = new StructuredPrintControl(request.instanceId, binding.sessionRef, runtimeVersion, gameRoot, this.dialect, this.runner, this.options, authority, binding.historyExpected);
      control.announceReady();
      return { kind: 'ready', control, reconciliation, openedFresh: false };
    }
    if (check.kind === 'missing') {
      if (binding.historyExpected) {
        return { kind: 'needs-decision', message: `Can't resume this controlled Player. Its conversation is no longer available.`, capabilities: await this.captureCapabilities() };
      }
      // No Play had run in it yet, so there is no history to lose: open a new one once.
      let sessionRef = check.replacementRef;
      if (!sessionRef) {
        try { sessionRef = await this.dialect.createSession(this.runner, gameRoot, authority); }
        catch (error) { return { kind: 'needs-decision', message: `Coach couldn't reopen this Player's conversation. ${messageOf(error)}`, capabilities: await this.captureCapabilities() }; }
      }
      const control = new StructuredPrintControl(request.instanceId, sessionRef, runtimeVersion, gameRoot, this.dialect, this.runner, this.options, authority, false);
      control.announceReady();
      return { kind: 'ready', control, reconciliation: { kind: 'none' }, openedFresh: true };
    }
    return { kind: 'needs-decision', message: `Coach couldn't reopen this Player's conversation. ${check.message}`, capabilities: await this.captureCapabilities() };
  }

  private requireAuthority(request: ControlOpenRequest): ProviderPlayerAuthority {
    if (!isProviderAuthority(request.authority)) {
      throw new ControlOpenError('needs-decision', `${this.dialect.displayName} has no supported permission policy for this Player.`);
    }
    return request.authority;
  }

  /**
   * The installed CLI must advertise every flag this adapter relies on,
   * authority flags included. Missing → Needs verification; never a fallback.
   */
  private async verifyContract(authority: ProviderPlayerAuthority): Promise<string> {
    const help = await this.runner.run(['--help'], os.tmpdir(), '');
    if (help.spawnError) throw new ControlOpenError('failed', help.spawnError);
    const text = `${help.stdout}\n${help.stderr}`;
    const missing = this.dialect.requiredHelpTerms(authority).filter((term) => !text.includes(term));
    if (missing.length) {
      const setting = isFullAutonomyAuthority(authority) ? 'Full Autonomy' : 'Ask for risky actions';
      throw new ControlOpenError('needs-verification', `Coach could not start this ${this.dialect.displayName} with your selected ${setting} permission setting (${missing.join(', ')}). Coach won't silently use different permissions.`);
    }
    const version = await this.runner.run(['--version'], os.tmpdir(), '');
    return firstLine(version.stdout) || firstLine(version.stderr) || 'unknown version';
  }

  private async captureCapabilities(): Promise<ProviderCapabilitySnapshot | undefined> {
    try {
      const snapshot = await this.dialect.probeCapabilities(this.runner);
      return snapshot.models.length ? snapshot : undefined;
    } catch {
      return undefined;
    }
  }
}

export function createClaudeControlFactory(options?: PrintLaunchOptions): StructuredPrintFactory {
  return new StructuredPrintFactory(claudeDialect(), options);
}

export function createAntiGravityControlFactory(options?: PrintLaunchOptions): StructuredPrintFactory {
  return new StructuredPrintFactory(antigravityDialect(), options);
}

// --- helpers ------------------------------------------------------------------

async function killTree(child: ChildProcessWithoutNullStreams, graceMs = 0): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.stdin.end(); } catch { /* already closed */ }
  if (graceMs > 0) {
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), graceMs))
    ]);
    if (exited) return;
  }
  if (process.platform === 'win32' && child.pid) {
    try { await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 3_000 }); return; }
    catch { /* it may have exited meanwhile */ }
  }
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
}

function describeSpawnError(dialect: PrintDialect, error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return `${dialect.displayName} isn't installed in this Stadium.`;
  return `${dialect.displayName} couldn't start: ${messageOf(error)}`;
}

function parseJson(line: string): JsonObject | undefined {
  const trimmed = line.trim().replace(/^﻿/, '');
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : undefined;
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
function firstLine(text: string): string { return text.trim().split(/\r?\n/, 1)[0]?.replace(/^error:\s*/i, '').trim() ?? ''; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function lineCount(text: string): number { return text.length ? text.split(/\r\n|\n|\r/).length : 0; }
function compact(value: unknown): string { return String(value).replace(/\s+/g, ' ').trim().slice(0, 180); }
