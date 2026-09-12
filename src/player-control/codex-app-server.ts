import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { ControlledBindingRecord } from './bindings';
import { ControlOpenError, type ControlEvent, type ControlOpenRequest, type ControlRestoreOutcome, type DeliveryOutcome, type DeliverOptions, type PlayerControl, type PlayerControlFactory, type ReconciledPlayOutcome } from './contract';
import type { ModelDescriptor, ProviderCapabilitySnapshot } from '../capability-types';

const execFileAsync = promisify(execFile);
const CERTIFIED_VERSION = '0.154.0';
const REQUEST_ALLOWLIST = new Set(['initialize', 'thread/start', 'turn/start', 'account/read', 'thread/read', 'thread/resume', 'thread/turns/list', 'model/list']);
const APPROVAL_METHODS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']);

type JsonObject = Record<string, unknown>;

interface RpcPending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  mayHaveCrossed: boolean;
}

class RpcResponseError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
    this.name = 'RpcResponseError';
  }
}

class RpcChannelError extends Error {
  constructor(message: string, readonly mayHaveCrossed: boolean) {
    super(message);
    this.name = 'RpcChannelError';
  }
}

interface LaunchOptions {
  command?: string;
  args?: string[];
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
  certifiedVersions?: readonly string[];
  requestTimeoutMs?: number;
  retryDelayMs?: number;
  resumeRetryDelaysMs?: readonly number[];
  maxHistoryPages?: number;
  closeGraceMs?: number;
}

class StdioRpcClient {
  private nextId = 1;
  private buffer = '';
  private failed = false;
  private readonly pending = new Map<number, RpcPending>();

  constructor(
    readonly child: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
    private readonly onNotification: (method: string, params: unknown) => void,
    private readonly onServerRequest: (method: string, params: unknown) => unknown,
    private readonly onFailure: (reason: string, state: 'lost' | 'exited') => void
  ) {
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk));
    child.stderr.on('data', () => { /* Drain provider diagnostics; stderr is never protocol. */ });
    child.stdout.on('error', (error) => this.fail(`Provider stdout failed: ${error.message}`, 'lost'));
    child.stderr.on('error', (error) => this.fail(`Provider stderr failed: ${error.message}`, 'lost'));
    child.stdout.once('end', () => setImmediate(() => this.fail('Provider stdout closed.', child.exitCode === null ? 'lost' : 'exited')));
    child.stdin.on('error', (error) => this.fail(`Provider stdin failed: ${error.message}`, 'lost'));
    child.once('error', (error) => this.fail(`Provider process failed: ${error.message}`, 'lost'));
    child.once('exit', (code, signal) => this.fail(`Provider process exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`, 'exited'));
  }

  async request(method: string, params: JsonObject): Promise<unknown> {
    if (!REQUEST_ALLOWLIST.has(method)) throw new Error(`Provider method '${method}' is not allowed.`);
    if (this.failed || !this.child.stdin.writable) throw new RpcChannelError('Provider channel is unavailable.', false);
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const current = this.pending.get(id);
        if (!current) return;
        this.pending.delete(id);
        reject(new RpcChannelError(`Provider did not acknowledge '${method}' in time.`, current.mayHaveCrossed));
      }, this.timeoutMs);
      const pending: RpcPending = { resolve, reject, timer, mayHaveCrossed: false };
      this.pending.set(id, pending);
      const frame = `${JSON.stringify({ id, method, params })}\n`;
      try {
        pending.mayHaveCrossed = true;
        this.child.stdin.write(frame, 'utf8', (error) => {
          if (!error) return;
          const current = this.pending.get(id);
          if (!current) return;
          this.pending.delete(id);
          clearTimeout(current.timer);
          current.reject(new RpcChannelError(`Could not write '${method}': ${error.message}`, current.mayHaveCrossed));
        });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new RpcChannelError(error instanceof Error ? error.message : String(error), pending.mayHaveCrossed));
      }
    });
  }

  notify(method: string, params?: JsonObject): void {
    if (this.failed || !this.child.stdin.writable) return;
    const frame = params ? { method, params } : { method };
    this.child.stdin.write(`${JSON.stringify(frame)}\n`);
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: JsonObject;
      try {
        const parsed: unknown = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('frame is not an object');
        message = parsed as JsonObject;
      } catch (error) {
        this.fail(`Malformed provider protocol frame: ${error instanceof Error ? error.message : String(error)}`, 'lost');
        return;
      }
      this.handle(message);
    }
  }

  private handle(message: JsonObject): void {
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        let result: unknown;
        try { result = this.onServerRequest(message.method, message.params); }
        catch (error) {
          this.respond(message.id, undefined, { code: -32603, message: error instanceof Error ? error.message : String(error) });
          return;
        }
        this.respond(message.id, result);
      } else {
        this.onNotification(message.method, message.params);
      }
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    const rpcError = message.error;
    if (rpcError && typeof rpcError === 'object' && !Array.isArray(rpcError)) {
      const error = rpcError as JsonObject;
      pending.reject(new RpcResponseError(typeof error.code === 'number' ? error.code : -32603, typeof error.message === 'string' ? error.message : 'Provider request failed.', error.data));
    } else {
      pending.resolve(message.result);
    }
  }

  private respond(id: unknown, result?: unknown, error?: { code: number; message: string }): void {
    if (this.failed || !this.child.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(error ? { id, error } : { id, result })}\n`);
  }

  private fail(reason: string, state: 'lost' | 'exited'): void {
    if (this.failed) return;
    this.failed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RpcChannelError(reason, pending.mayHaveCrossed));
    }
    this.pending.clear();
    this.onFailure(reason, state);
  }
}

class CodexAppServerControl implements PlayerControl {
  private readonly listeners = new Set<(event: ControlEvent) => void>();
  private readonly eventHistory: ControlEvent[] = [];
  private controlState: PlayerControl['state'] = 'ready';
  private activeTurnRef: string | undefined;
  private closing = false;

  model: string | undefined;
  effort: string | undefined;

  private constructor(
    readonly instanceId: string,
    readonly providerSessionRef: string,
    readonly runtimeVersion: string,
    model: string | undefined,
    effort: string | undefined,
    private readonly rpc: StdioRpcClient,
    private readonly retryDelayMs: number,
    private readonly closeGraceMs: number
  ) {
    this.model = model;
    this.effort = effort;
  }

  get state(): PlayerControl['state'] { return this.controlState; }

  static async open(request: ControlOpenRequest, options: LaunchOptions): Promise<CodexAppServerControl> {
    const childEnv = { ...process.env, ...options.env };
    delete childEnv.CODEX_API_KEY;
    const launch = await resolveLaunch(options);
    const child = spawn(launch.command, launch.args, {
      cwd: request.gameRoot,
      env: childEnv,
      shell: launch.shell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let control: CodexAppServerControl | undefined;
    const earlyEvents: ControlEvent[] = [];
    const emitOrQueue = (event: ControlEvent): void => {
      if (control) control.emit(event);
      else earlyEvents.push(event);
    };
    const rpc = new StdioRpcClient(
      child,
      options.requestTimeoutMs ?? 15_000,
      (method, params) => control?.notification(method, params),
      (method) => CodexAppServerControl.answerServerRequest(method, emitOrQueue),
      (reason, state) => control?.channelFailed(reason, state)
    );

    try {
      const initialized = asObject(await rpc.request('initialize', {
        clientInfo: { name: 'sideline_coach', version: '0.1.0' },
        capabilities: null
      }));
      rpc.notify('initialized');
      const userAgent = stringValue(initialized.userAgent);
      const runtimeVersion = parseRuntimeVersion(userAgent);
      const certified = options.certifiedVersions ?? [CERTIFIED_VERSION];
      if (!runtimeVersion || !certified.includes(runtimeVersion)) {
        await closeOwnedProcess(child, options.closeGraceMs ?? 750);
        throw new ControlOpenError('needs-verification', `Installed provider version '${runtimeVersion || userAgent || 'unknown'}' is not certified for controlled dispatch.`);
      }

      await requireChatGptAccount(rpc);

      const gameRoot = path.resolve(request.gameRoot);
      const started = asObject(await rpc.request('thread/start', {
        cwd: gameRoot,
        approvalPolicy: request.authority.approvalPolicy,
        sandbox: request.authority.sandbox
      }));
      const thread = asObject(started.thread);
      const threadId = stringValue(thread.id);
      const reportedCwd = stringValue(started.cwd);
      if (!threadId) throw new Error('Provider did not return a thread id.');
      if (!samePath(reportedCwd, gameRoot)) throw new Error(`Provider reported unexpected Game cwd '${reportedCwd || 'unknown'}'.`);
      if (stringValue(thread.cwd) && !samePath(stringValue(thread.cwd), gameRoot)) throw new Error(`Provider captured unexpected Game cwd '${stringValue(thread.cwd) || 'unknown'}'.`);
      if (started.approvalPolicy !== request.authority.approvalPolicy) throw new Error('Provider contradicted the requested approval policy.');
      const sandbox = asObject(started.sandbox);
      if (sandbox.type !== 'dangerFullAccess') throw new Error('Provider contradicted the requested sandbox authority.');

      control = new CodexAppServerControl(
        request.instanceId,
        threadId,
        runtimeVersion,
        stringValue(started.model),
        stringValue(started.reasoningEffort),
        rpc,
        options.retryDelayMs ?? 25,
        options.closeGraceMs ?? 750
      );
      if (threadStatus(thread) === 'active') control.controlState = 'active';
      for (const event of earlyEvents) control.emit(event);
      control.emit({ kind: 'settings', model: control.model, effort: control.effort, runtimeVersion });
      control.emit({ kind: 'channel', state: 'ready', summary: 'CONTROLLED CODEX READY' });
      return control;
    } catch (error) {
      await closeOwnedProcess(child, options.closeGraceMs ?? 750);
      if (error instanceof ControlOpenError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/api key/i.test(message)) throw new ControlOpenError('failed', `Provider unexpectedly required an API key: ${message}`);
      if (/sign.?in|login|unauth|auth/i.test(message)) throw new ControlOpenError('needs-sign-in', message);
      throw new ControlOpenError('failed', message);
    }
  }

  static async restore(request: ControlOpenRequest, binding: ControlledBindingRecord, options: LaunchOptions): Promise<ControlRestoreOutcome> {
    const childEnv = { ...process.env, ...options.env };
    delete childEnv.CODEX_API_KEY;
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const launch = await resolveLaunch(options);
      child = spawn(launch.command, launch.args, {
        cwd: request.gameRoot,
        env: childEnv,
        shell: launch.shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let control: CodexAppServerControl | undefined;
      const earlyEvents: ControlEvent[] = [];
      const emitOrQueue = (event: ControlEvent): void => {
        if (control) control.emit(event);
        else earlyEvents.push(event);
      };
      const rpc = new StdioRpcClient(
        child,
        options.requestTimeoutMs ?? 15_000,
        (method, params) => control?.notification(method, params),
        (method) => CodexAppServerControl.answerServerRequest(method, emitOrQueue),
        (reason, state) => control?.channelFailed(reason, state)
      );

      const initialized = asObject(await rpc.request('initialize', {
        clientInfo: { name: 'sideline_coach', version: '0.1.0' },
        capabilities: null
      }));
      rpc.notify('initialized');
      const userAgent = stringValue(initialized.userAgent);
      const runtimeVersion = parseRuntimeVersion(userAgent);
      const certified = options.certifiedVersions ?? [CERTIFIED_VERSION];
      if (!runtimeVersion || !certified.includes(runtimeVersion)) {
        await closeOwnedProcess(child, options.closeGraceMs ?? 750);
        return { kind: 'needs-verification', message: `Installed provider version '${runtimeVersion || userAgent || 'unknown'}' is not certified for controlled resume.` };
      }

      const account = await classifyAccount(rpc);
      if (account !== 'chatgpt') {
        await closeOwnedProcess(child, options.closeGraceMs ?? 750);
        return account === 'none'
          ? { kind: 'needs-sign-in', message: 'Codex is not signed in. Sign in with ChatGPT before resuming this Player.' }
          : { kind: 'needs-decision', message: 'Codex is using API-key authentication. Coach will not switch billing authority silently.' };
      }

      const gameRoot = path.resolve(request.gameRoot);
      let openedFresh = false;
      let response: JsonObject;
      try {
        const read = asObject(await rpc.request('thread/read', { threadId: binding.sessionRef }));
        validateStoredThread(asObject(read.thread), binding.sessionRef, gameRoot);
      } catch (error) {
        if (!isMissingThread(error)) throw error;
        if (binding.historyExpected) {
          await closeOwnedProcess(child, options.closeGraceMs ?? 750);
          return { kind: 'needs-decision', message: `Can't resume this controlled Player. Its conversation is no longer available.` };
        }
        response = asObject(await rpc.request('thread/start', {
          cwd: gameRoot,
          approvalPolicy: request.authority.approvalPolicy,
          sandbox: request.authority.sandbox
        }));
        validateAuthorityResponse(response, undefined, gameRoot, request);
        openedFresh = true;
      }

      if (!openedFresh) {
        const params = {
          threadId: binding.sessionRef,
          cwd: gameRoot,
          approvalPolicy: request.authority.approvalPolicy,
          sandbox: request.authority.sandbox,
          excludeTurns: true
        };
        const retryDelays = options.resumeRetryDelaysMs ?? [250, 500, 1_000, 1_500, 2_000, 2_500, 2_250];
        let attempt = 0;
        for (;;) {
          try {
            response = asObject(await rpc.request('thread/resume', params));
            break;
          } catch (error) {
            if (!isWriterBusy(error) || attempt >= retryDelays.length) throw error;
            await delay(retryDelays[attempt++]);
          }
        }
        validateAuthorityResponse(response!, binding.sessionRef, gameRoot, request);
      }

      const thread = asObject(response!.thread);
      const sessionRef = stringValue(thread.id);
      if (!sessionRef) throw new Error('Provider did not return a thread id while restoring.');
      const reconciliation = openedFresh ? { kind: 'none' as const } : await reconcilePending(rpc, binding, options.maxHistoryPages ?? 3);
      control = new CodexAppServerControl(
        request.instanceId,
        sessionRef,
        runtimeVersion,
        stringValue(response!.model),
        stringValue(response!.reasoningEffort),
        rpc,
        options.retryDelayMs ?? 25,
        options.closeGraceMs ?? 750
      );
      if (threadStatus(thread) === 'active') control.controlState = 'active';
      for (const event of earlyEvents) control.emit(event);
      control.emit({ kind: 'settings', model: control.model, effort: control.effort, runtimeVersion });
      control.emit({ kind: 'channel', state: 'ready', summary: 'CONTROLLED CODEX READY' });
      return { kind: 'ready', control, reconciliation, openedFresh };
    } catch (error) {
      if (child) await closeOwnedProcess(child, options.closeGraceMs ?? 750);
      const message = error instanceof Error ? error.message : String(error);
      if (/active writer/i.test(message)) return { kind: 'needs-decision', message: 'Previous Codex process is still running for this conversation.' };
      if (/api key/i.test(message)) return { kind: 'needs-decision', message };
      if (/sign.?in|login|unauth|auth/i.test(message)) return { kind: 'needs-sign-in', message };
      return { kind: 'needs-decision', message };
    }
  }

  async deliver(play: string, clientRef: string, options?: DeliverOptions): Promise<DeliveryOutcome> {
    if (!play.trim()) return { kind: 'refused', reason: 'invalid', message: 'Play cannot be empty.' };
    if (this.controlState === 'active') return { kind: 'refused', reason: 'busy', message: 'That Player is still working.' };
    if (this.controlState === 'needs-verification') return { kind: 'refused', reason: 'needs-verification', message: 'That Player needs provider-version verification.' };
    if (this.controlState !== 'ready') return { kind: 'refused', reason: this.controlState === 'closed' ? 'closed' : 'unavailable', message: 'That controlled Player is unavailable.' };

    this.controlState = 'active';
    const params: JsonObject = {
      threadId: this.providerSessionRef,
      input: [{ type: 'text', text: play, text_elements: [] }],
      clientUserMessageId: clientRef
    };
    if (options?.model && options.model !== 'default') {
      params.model = options.model;
    }
    if (options?.effort && options.effort !== 'default') {
      params.effort = options.effort;
    }
    try {
      let response: JsonObject;
      try {
        response = asObject(await this.rpc.request('turn/start', params));
      } catch (error) {
        if (!(error instanceof RpcResponseError) || error.code !== -32001) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, this.retryDelayMs));
        response = asObject(await this.rpc.request('turn/start', params));
      }
      const turn = asObject(response.turn);
      const turnRef = stringValue(turn.id);
      if (!turnRef) {
        this.controlState = 'lost';
        this.emit({ kind: 'turn', state: 'unknown', summary: 'Provider acknowledged the Play without a turn reference.' });
        return { kind: 'unknown', reason: 'Provider acknowledgement omitted the turn reference.' };
      }
      this.activeTurnRef = turnRef;
      if (options?.model && options.model !== 'default') {
        this.model = options.model;
      }
      if (options?.effort && options.effort !== 'default') {
        this.effort = options.effort;
      }
      if (options?.model || options?.effort) {
        this.emit({ kind: 'settings', model: this.model, effort: this.effort, runtimeVersion: this.runtimeVersion });
      }
      this.emit({ kind: 'turn', state: 'accepted', turnRef, summary: `Play received · ${play.length.toLocaleString()} chars · ${lineCount(play)} lines` });
      return { kind: 'accepted', turnRef };
    } catch (error) {
      if (error instanceof RpcChannelError && error.mayHaveCrossed) {
        this.controlState = 'lost';
        this.emit({ kind: 'turn', state: 'unknown', summary: error.message });
        return { kind: 'unknown', reason: error.message };
      }
      this.controlState = this.controlState === 'lost' ? 'lost' : 'ready';
      const message = error instanceof Error ? error.message : String(error);
      const reason = /thread not found|closed/i.test(message) ? 'closed' : 'unavailable';
      return { kind: 'refused', reason, message };
    }
  }

  async queryCapabilities(): Promise<ProviderCapabilitySnapshot> {
    try {
      const [accountRes, modelsRes] = await Promise.all([
        this.rpc.request('account/read', { refreshToken: false }).catch(() => undefined),
        this.rpc.request('model/list', {}).catch(() => undefined)
      ]);
      return normalizeCodexCapabilities(accountRes, modelsRes);
    } catch {
      return {
        provider: 'codex',
        authenticated: false,
        models: [],
        observedAt: 0,
        freshness: 'unavailable'
      };
    }
  }

  onEvent(listener: (event: ControlEvent) => void): () => void {
    this.listeners.add(listener);
    for (const event of this.eventHistory) listener(event);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.controlState === 'closed') return;
    this.closing = true;
    this.controlState = 'closed';
    await closeOwnedProcess(this.rpc.child, this.closeGraceMs);
    this.listeners.clear();
  }

  private notification(method: string, rawParams: unknown): void {
    const params = asObject(rawParams);
    const threadId = stringValue(params.threadId);
    if (threadId && threadId !== this.providerSessionRef) return;
    if (method === 'turn/started') {
      const turn = asObject(params.turn);
      this.activeTurnRef = stringValue(turn.id) || this.activeTurnRef;
      this.controlState = 'active';
      this.emit({ kind: 'turn', state: 'started', turnRef: this.activeTurnRef, summary: 'Working…' });
      return;
    }
    if (method === 'turn/completed') {
      const turn = asObject(params.turn);
      const turnRef = stringValue(turn.id) || this.activeTurnRef;
      const status = typeof turn.status === 'string' ? turn.status : stringValue(asObject(turn.status).type);
      this.activeTurnRef = undefined;
      this.controlState = 'ready';
      const state = status === 'failed' ? 'failed' : status === 'interrupted' ? 'interrupted' : 'completed';
      const error = stringValue(asObject(turn.error).message);
      this.emit({ kind: 'turn', state, turnRef, summary: state === 'completed' ? 'Completed' : state === 'interrupted' ? 'Interrupted' : `Failed${error ? `: ${error}` : ''}` });
      return;
    }
    if (method === 'item/agentMessage/delta') {
      const delta = stringValue(params.delta);
      if (delta) this.emit({ kind: 'progress', category: 'message', summary: delta });
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = asObject(params.item);
      const type = stringValue(item.type);
      if (type === 'commandExecution') this.emit({ kind: 'progress', category: 'command', summary: compactSummary(item.command ?? item.commands ?? 'command') });
      else if (type && /tool|mcp/i.test(type)) this.emit({ kind: 'progress', category: 'tool', summary: compactSummary(item.title ?? item.tool ?? item.name ?? type) });
    }
  }

  private channelFailed(reason: string, channelState: 'lost' | 'exited'): void {
    if (this.closing || this.controlState === 'closed' || this.controlState === 'lost') return;
    const hadActiveTurn = this.controlState === 'active';
    this.controlState = 'lost';
    if (hadActiveTurn) this.emit({ kind: 'turn', state: 'unknown', turnRef: this.activeTurnRef, summary: reason });
    this.emit({ kind: 'channel', state: channelState, summary: reason });
  }

  private emit(event: ControlEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 50) this.eventHistory.shift();
    for (const listener of this.listeners) listener(event);
  }

  private static answerServerRequest(method: string, emit: (event: ControlEvent) => void): unknown {
    emit({ kind: 'request', state: 'declined', summary: `Unexpected provider request declined: ${method}` });
    if (APPROVAL_METHODS.has(method)) return { decision: 'decline' };
    if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' };
    if (method === 'item/tool/requestUserInput') return { answers: {} };
    if (method === 'mcpServer/elicitation/request') return { action: 'decline' };
    throw new Error(`Unsupported provider request '${method}'.`);
  }
}

export class CodexAppServerFactory implements PlayerControlFactory {
  readonly adapterId = 'codex-app-server';
  constructor(private readonly options: LaunchOptions = {}) {}
  open(request: ControlOpenRequest): Promise<PlayerControl> { return CodexAppServerControl.open(request, this.options); }
  restore(request: ControlOpenRequest, binding: ControlledBindingRecord): Promise<ControlRestoreOutcome> { return CodexAppServerControl.restore(request, binding, this.options); }
}

async function classifyAccount(rpc: StdioRpcClient): Promise<'chatgpt' | 'none' | 'other'> {
  const response = asObject(await rpc.request('account/read', { refreshToken: false }));
  if (response.account === null || response.account === undefined) return 'none';
  return stringValue(asObject(response.account).type) === 'chatgpt' ? 'chatgpt' : 'other';
}

async function requireChatGptAccount(rpc: StdioRpcClient): Promise<void> {
  const account = await classifyAccount(rpc);
  if (account === 'none') throw new ControlOpenError('needs-sign-in', 'Codex is not signed in. Sign in with ChatGPT before opening a controlled Player.');
  if (account !== 'chatgpt') throw new ControlOpenError('needs-decision', 'Codex is using API-key authentication. Coach will not switch billing authority silently.');
}

function validateStoredThread(thread: JsonObject, sessionRef: string, gameRoot: string): void {
  if (stringValue(thread.id) !== sessionRef) throw new Error('Provider returned a different conversation than the stored binding.');
  if (thread.ephemeral !== false) throw new Error('Provider conversation is ephemeral and cannot be resumed safely.');
  if (!samePath(stringValue(thread.cwd), gameRoot)) throw new Error(`Provider conversation belongs to a different Game cwd '${stringValue(thread.cwd) || 'unknown'}'.`);
}

function validateAuthorityResponse(response: JsonObject, expectedSessionRef: string | undefined, gameRoot: string, request: ControlOpenRequest): void {
  const thread = asObject(response.thread);
  const threadId = stringValue(thread.id);
  if (!threadId || (expectedSessionRef && threadId !== expectedSessionRef)) throw new Error('Provider resumed a different conversation than requested.');
  if (thread.ephemeral === true) throw new Error('Provider resumed the conversation as ephemeral.');
  if (!samePath(stringValue(thread.cwd) ?? stringValue(response.cwd), gameRoot)) throw new Error('Provider contradicted the stored Game cwd.');
  if (!samePath(stringValue(response.cwd), gameRoot)) throw new Error('Provider reported a contradictory effective Game cwd.');
  if (response.approvalPolicy !== request.authority.approvalPolicy) throw new Error('Provider contradicted the requested approval policy.');
  if (asObject(response.sandbox).type !== 'dangerFullAccess') throw new Error('Provider contradicted the requested sandbox authority.');
  const status = stringValue(asObject(thread.status).type) ?? stringValue(thread.status);
  if (status && status !== 'idle' && status !== 'active') throw new Error(`Provider conversation is not healthy (${status}).`);
}

async function reconcilePending(rpc: StdioRpcClient, binding: ControlledBindingRecord, maxPages: number): Promise<ReconciledPlayOutcome> {
  if (!binding.pendingPlay) return { kind: 'none' };
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const response = asObject(await rpc.request('thread/turns/list', {
      threadId: binding.sessionRef,
      ...(cursor ? { cursor } : {}),
      limit: 10,
      sortDirection: 'desc',
      itemsView: 'full'
    }));
    const turns = Array.isArray(response.data) ? response.data.map(asObject) : [];
    const match = binding.pendingPlay.turnRef
      ? turns.find((turn) => stringValue(turn.id) === binding.pendingPlay!.turnRef)
      : turns.find((turn) => {
          const items = Array.isArray(turn.items) ? turn.items.map(asObject) : [];
          return items.some((item) => item.type === 'userMessage' && item.clientId === binding.pendingPlay!.clientRef);
        });
    if (match) return classifyReconciledTurn(match);
    cursor = stringValue(response.nextCursor);
    if (!cursor) break;
  }
  return { kind: 'unknown', summary: 'Unknown — check the Game before sending it again' };
}

function classifyReconciledTurn(turn: JsonObject): ReconciledPlayOutcome {
  const status = threadStatus(turn);
  if (status === 'completed') return { kind: 'completed', summary: 'Completed' };
  if (status === 'failed') {
    const reason = stringValue(asObject(turn.error).message);
    return { kind: 'failed', summary: `Failed${reason ? `: ${reason}` : ''}` };
  }
  if (status === 'interrupted') return { kind: 'interrupted', summary: 'Interrupted — it may have made partial changes' };
  return { kind: 'unknown', summary: 'Unknown — check the Game before sending it again' };
}

function threadStatus(value: JsonObject): string | undefined { return stringValue(value.status) ?? stringValue(asObject(value.status).type); }

function isMissingThread(error: unknown): boolean { return error instanceof RpcResponseError && /no rollout found|thread not found|not found/i.test(error.message); }
function isWriterBusy(error: unknown): boolean { return error instanceof RpcResponseError && /active writer/i.test(error.message); }
function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }

function parseRuntimeVersion(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  return userAgent.match(/\/(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
}

function samePath(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function lineCount(text: string): number { return text.length ? text.split(/\r\n|\n|\r/).length : 0; }

function compactSummary(value: unknown): string {
  const text = Array.isArray(value) ? value.map(String).join(' ') : String(value);
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function resolveLaunch(options: LaunchOptions): Promise<{ command: string; args: string[]; shell: boolean }> {
  if (options.command) return { command: options.command, args: options.args ?? [], shell: options.shell ?? false };
  if (process.platform !== 'win32') return { command: 'codex', args: ['app-server'], shell: false };
  const script = "[pscustomobject]@{codex=(Get-Command -Name 'codex' -ErrorAction Stop).Source;node=(Get-Command -Name 'node' -ErrorAction Stop).Source} | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script], { windowsHide: true, timeout: 3_000 });
  const discovery = JSON.parse(stdout.trim()) as { codex?: unknown; node?: unknown };
  const discovered = stringValue(discovery.codex);
  if (!discovered) throw new Error('The installed controlled-Player command could not be resolved.');
  const nodeCommand = stringValue(discovery.node);
  const packageEntry = path.join(path.dirname(discovered), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (nodeCommand && existsSync(packageEntry)) {
    return { command: nodeCommand, args: [packageEntry, 'app-server'], shell: false };
  }
  if (/\.ps1$/i.test(discovered)) {
    const commandShim = discovered.replace(/\.ps1$/i, '.cmd');
    if (existsSync(commandShim)) return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${commandShim}" app-server`], shell: false };
  }
  if (/\.(cmd|bat)$/i.test(discovered)) {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${discovered}" app-server`], shell: false };
  }
  return { command: discovered, args: ['app-server'], shell: false };
}

async function closeOwnedProcess(child: ChildProcessWithoutNullStreams, graceMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.stdin.end(); } catch { /* Closing an already-broken pipe is harmless. */ }
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), graceMs))
  ]);
  if (exited || !child.pid) return;
  if (process.platform === 'win32') {
    try { await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 3_000 }); } catch { /* It may have exited during taskkill. */ }
  } else {
    try { child.kill('SIGTERM'); } catch { /* It may have exited during shutdown. */ }
  }
}

export function normalizeCodexCapabilities(accountRes: unknown, modelsRes: unknown): ProviderCapabilitySnapshot {
  const accountObj = asObject(accountRes);
  const account = asObject(accountObj.account);
  const authenticated = stringValue(account.type) === 'chatgpt';
  const email = stringValue(account.email);
  const planType = stringValue(account.planType);

  const modelsObj = asObject(modelsRes);
  const rawData = Array.isArray(modelsObj.data) ? modelsObj.data : [];
  const models: ModelDescriptor[] = [];

  for (const item of rawData) {
    const raw = asObject(item);
    const id = stringValue(raw.id) ?? stringValue(raw.model);
    if (!id || raw.hidden === true) continue;
    const displayName = stringValue(raw.displayName) ?? id;
    const description = stringValue(raw.description);
    const isDefault = Boolean(raw.isDefault);
    const rawEfforts = Array.isArray(raw.supportedReasoningEfforts) ? raw.supportedReasoningEfforts : [];
    const supportedEfforts: string[] = [];
    for (const effortItem of rawEfforts) {
      const effortStr = typeof effortItem === 'string' ? effortItem : stringValue(asObject(effortItem).reasoningEffort);
      if (effortStr && !supportedEfforts.includes(effortStr)) {
        supportedEfforts.push(effortStr);
      }
    }
    const defaultEffort = stringValue(raw.defaultReasoningEffort);
    models.push({
      id,
      displayName,
      description,
      isDefault,
      supportedEfforts,
      defaultEffort
    });
  }

  const defaultModel = models.find((m) => m.isDefault);
  const defaultModelId = defaultModel?.id ?? (models.length > 0 ? models[0].id : undefined);

  return {
    provider: 'codex',
    authenticated,
    accountEmail: email,
    planType,
    models,
    defaultModelId,
    observedAt: Date.now(),
    freshness: models.length > 0 ? 'live' : 'unavailable'
  };
}
