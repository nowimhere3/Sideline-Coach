import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  buildRpcRequest,
  buildRpcNotification,
  buildRpcResponse,
  buildRpcError,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcError,
  type DispatchRequestParams,
  type PlayerActionParams,
  type CapabilityRefreshParams,
  type GamePickResult,
  type GameOpenParams,
  type GameOpenResult,
  type PlayerLifecycleResult,
  type ControlPlaneFreshness
} from './control-plane/protocol';
import { getDurableStadiumId, createSessionInstanceId, type ResolvedGameContext, type StadiumIdentity } from './game-identity';
import type { PlayerControlHost } from './player-control/host';
import type { PlayerRoster } from './player-roster';

export interface CoachReportItem {
  gameId?: string;
  project: string;
  agent: string;
  filename: string;
  path: string;
  mtime: number;
  content: string;
}

export interface StadiumClientOptions {
  port?: number;
  controlPlaneUrl?: string;
  dir?: string;
  token?: string;
  stadiumIdentity?: StadiumIdentity;
  instanceId?: string;
  gameContextGetter: () => ResolvedGameContext;
  playerRoster?: PlayerRoster;
  playerControlHost?: PlayerControlHost;
  reportsGetter?: () => Promise<CoachReportItem[]> | CoachReportItem[];
  sendTerminalText?: (terminalName: string, text: string) => Promise<boolean> | boolean;
  addGame?: () => Promise<{ success: boolean; message?: string }> | { success: boolean; message?: string };
  /** Native repository picker. Only a Stadium can show one; the browser cannot. */
  pickGame?: () => Promise<GamePickResult>;
  /** Open a VS Code window on a Game. Environment-specific mechanics live in the Stadium. */
  openGame?: (params: GameOpenParams) => Promise<GameOpenResult>;
  /** Single dispatch point for Q2.9 Player lifecycle RPCs. */
  playerLifecycle?: (method: string, params: Record<string, unknown>) => Promise<PlayerLifecycleResult>;
  autoReconnect?: boolean;
  /**
   * Freshness Guard: find (or safely start/replace) the Control Plane before each
   * reconnect. A replaced daemon may live on a different port or token.
   */
  resolveControlPlane?: () => Promise<{ port: number; freshness?: ControlPlaneFreshness }>;
  /** The Control Plane build this Stadium loaded at activation. */
  controlPlaneBuildId?: string;
}

export class StadiumClient extends EventEmitter {
  private socket: WebSocket | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private connected = false;
  private nextRpcId = 1;
  private readonly pendingRpcRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  readonly stadiumId: string;
  readonly instanceId: string;
  readonly dir: string;
  private port: number;
  private token: string;

  constructor(private readonly options: StadiumClientOptions) {
    super();
    this.dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    this.stadiumId = options.stadiumIdentity?.stadiumId ?? getDurableStadiumId(this.dir);
    this.instanceId = options.instanceId ?? createSessionInstanceId(this.stadiumId);
    this.port = options.port ?? 3100;
    this.token = options.token ?? this.resolveToken();
  }

  get isConnected(): boolean {
    return this.connected && Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }

  setPort(port: number): void {
    this.port = port;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private controlPlaneFreshness: ControlPlaneFreshness | undefined;

  /** The launcher's verdict for the Control Plane this Stadium is about to join. */
  setControlPlaneFreshness(freshness: ControlPlaneFreshness | undefined): void {
    this.controlPlaneFreshness = freshness;
  }

  async connect(): Promise<boolean> {
    if (this.disposed) return false;

    if (!this.token) {
      this.token = this.resolveToken();
    }

    const wsUrl = `ws://127.0.0.1:${this.port}/stadium?token=${encodeURIComponent(this.token)}`;

    return new Promise((resolve) => {
      try {
        const socket = new WebSocket(wsUrl);
        this.socket = socket;

        const connectTimeout = setTimeout(() => {
          if (!this.connected) {
            try {
              socket.close();
            } catch {}
            resolve(false);
          }
        }, 5000);

        socket.on('open', () => {
          this.sendHello()
            .then(() => {
              clearTimeout(connectTimeout);
              this.connected = true;
              this.startHeartbeat();
              this.announceGameAndState();
              this.emit('connected');
              resolve(true);
            })
            .catch(() => {
              clearTimeout(connectTimeout);
              try {
                socket.close();
              } catch {}
              resolve(false);
            });
        });

        socket.on('message', (raw: string | Buffer) => {
          this.handleIncomingMessage(raw.toString('utf8'));
        });

        socket.on('close', () => {
          this.handleClose();
        });

        socket.on('error', (err) => {
          // An unobserved EventEmitter 'error' throws. A refused or abandoned connect is
          // routine while a Control Plane is being replaced, and throwing here killed the
          // reconnect chain in the P0.1 field proof. Report only when someone listens.
          if (this.listenerCount('error') > 0) this.emit('error', err);
        });
      } catch (err) {
        resolve(false);
      }
    });
  }

  announceGameAndState(): void {
    if (!this.isConnected) return;

    const ctx = this.options.gameContextGetter();
    if (ctx.game.gameId !== 'unknown') {
      this.sendNotification('game.connected', {
        stadiumId: this.stadiumId,
        instanceId: this.instanceId,
        game: ctx.game,
        rootFsPath: ctx.binding.rootFsPath
      });
    }

    void this.sendRosterSnapshot();
    this.sendCapabilitySnapshot();
    this.sendDiscoverySnapshot();
    void this.sendReportSnapshot();
  }

  async sendRosterSnapshot(): Promise<void> {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    const roster = this.options.playerRoster ? await this.options.playerRoster.status(ctx.game.gameId) : [];
    this.sendNotification('roster.snapshot', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      roster
    });
  }

  sendCapabilitySnapshot(): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    const capabilities = this.options.playerRoster ? this.options.playerRoster.getRoutingCapabilities(ctx.game.gameId) : [];
    this.sendNotification('capability.snapshot', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      capabilities
    });
  }

  sendDiscoverySnapshot(): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    const discovery = this.options.playerRoster?.getLastDiscovery();
    if (!discovery || discovery.gameId !== ctx.game.gameId) return;
    this.sendNotification('player.discovery.snapshot', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      discovery
    });
  }

  sendDiscoveryChanged(): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    const discovery = this.options.playerRoster?.getLastDiscovery();
    if (!discovery || discovery.gameId !== ctx.game.gameId) return;
    this.sendNotification('player.discovery.changed', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      discovery
    });
  }

  /** Canonical scan of this Stadium's Game, published as a snapshot. Returns the count, or undefined when offline. */
  async sendReportSnapshot(method: 'report.snapshot' | 'report.changed' = 'report.snapshot'): Promise<number | undefined> {
    if (!this.isConnected) return undefined;
    const ctx = this.options.gameContextGetter();
    let reports: CoachReportItem[] = [];
    if (this.options.reportsGetter) {
      reports = await this.options.reportsGetter();
    }
    if (!this.isConnected) return undefined;
    this.sendNotification(method, {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      reports
    });
    return reports.length;
  }

  /** A report file changed in this Game: rescan and publish (Stadium report watcher). */
  async publishReportsChanged(): Promise<number | undefined> {
    return this.sendReportSnapshot('report.changed');
  }

  sendTurnChanged(turn: unknown): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    this.sendNotification('turn.changed', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      turn
    });
  }

  async sendRosterChanged(): Promise<void> {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    const roster = this.options.playerRoster ? await this.options.playerRoster.status(ctx.game.gameId) : [];
    this.sendNotification('roster.changed', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      roster
    });
  }

  sendReportChanged(reports: CoachReportItem[]): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    this.sendNotification('report.changed', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      reports
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.isConnected) {
      const ctx = this.options.gameContextGetter();
      try {
        this.sendNotification('game.disconnected', {
          stadiumId: this.stadiumId,
          instanceId: this.instanceId,
          gameId: ctx.game.gameId
        });
      } catch {}
    }

    this.connected = false;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = undefined;
    }
    this.emit('disconnected');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect();
  }

  private resolveToken(): string {
    const tokenPath = path.join(this.dir, 'token');
    try {
      if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf8').trim();
      }
    } catch {}
    return '';
  }

  private sendHello(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRpcId++;
      const timer = setTimeout(() => {
        this.pendingRpcRequests.delete(id);
        reject(new Error('stadium.hello handshake timed out.'));
      }, 5000);

      this.pendingRpcRequests.set(id, { resolve, reject, timer });

      const ctx = this.options.gameContextGetter();
      const frame = buildRpcRequest(id, 'stadium.hello', {
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
        stadiumId: this.stadiumId,
        instanceId: this.instanceId,
        name: ctx.stadium.name || os.hostname(),
        platform: process.platform,
        token: this.token,
        game: ctx.game.gameId !== 'unknown' ? ctx.game : undefined,
        rootFsPath: ctx.binding.rootFsPath,
        controlPlaneBuildId: this.options.controlPlaneBuildId,
        controlPlaneFreshness: this.controlPlaneFreshness
      });

      this.socket?.send(JSON.stringify(frame));
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendNotification('stadium.heartbeat', {
          instanceId: this.instanceId,
          timestamp: Date.now()
        });
      }
    }, 10000);
    this.heartbeatTimer.unref();
  }

  private handleClose(): void {
    this.connected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.emit('disconnected');

    if (!this.disposed && (this.options.autoReconnect ?? true)) {
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          void this.reconnect();
        }, 2000);
        this.reconnectTimer.unref();
      }
    }
  }

  /**
   * Reconnect through the Freshness Guard: a Control Plane that went away may have
   * been replaced (new port, new token), or may need starting. Failure just waits
   * for the next attempt; the socket close schedules it.
   */
  private async reconnect(): Promise<void> {
    if (this.disposed) return;
    if (this.options.resolveControlPlane) {
      this.emit('control-plane-resolving');
      try {
        const resolved = await this.options.resolveControlPlane();
        this.port = resolved.port;
        this.controlPlaneFreshness = resolved.freshness;
        this.token = this.resolveToken() || this.token;
      } catch {
        // Unknown for now; try again shortly. Never pretend to be connected.
        if (!this.disposed && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.reconnect(); }, 2000);
          this.reconnectTimer.unref();
        }
        return;
      }
    }
    const ok = await this.connect();
    if (!ok && !this.disposed && !this.connected && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.reconnect(); }, 2000);
      this.reconnectTimer.unref();
    }
  }

  private handleIncomingMessage(rawText: string): void {
    try {
      const msg = JSON.parse(rawText) as unknown;

      if (isJsonRpcResponse(msg) || isJsonRpcError(msg)) {
        const pending = this.pendingRpcRequests.get(msg.id as string | number);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRpcRequests.delete(msg.id as string | number);
          if (isJsonRpcResponse(msg)) {
            pending.resolve(msg.result);
          } else {
            pending.reject(new Error(msg.error.message));
          }
        }
        return;
      }

      if (isJsonRpcRequest(msg)) {
        void this.handleIncomingRequest(msg);
        return;
      }
    } catch {}
  }

  private async handleIncomingRequest(req: { id: string | number; method: string; params: unknown }): Promise<void> {
    if (req.method === 'dispatch.request') {
      const params = req.params as DispatchRequestParams;
      await this.executeDispatch(params);
      this.sendResponse(req.id, { success: true });
      return;
    }

    if (req.method === 'player.action') {
      const params = req.params as PlayerActionParams;
      let result = { success: false, message: 'No roster available' };
      if (this.options.playerRoster) {
        if (params.action === 'field') {
          result = (await this.options.playerRoster.putOnField(params.playerId)) as any;
        } else if (params.action === 'instance') {
          result = (await this.options.playerRoster.addInstance(params.playerId, { allowDuplicate: params.allowDuplicate === true })) as any;
        } else if (params.action === 'controlled') {
          result = (await this.options.playerRoster.addControlledInstance(params.playerId, { allowDuplicate: params.allowDuplicate === true })) as any;
        }
      }
      this.sendResponse(req.id, result);
      return;
    }

    if (req.method === 'game.add') {
      if (!this.options.addGame) {
        this.sendResponse(req.id, { success: false, message: 'This Stadium cannot open the Add Game dialog.' });
        return;
      }
      try {
        const result = await this.options.addGame();
        this.sendResponse(req.id, result);
      } catch (err) {
        this.sendResponse(req.id, { success: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (req.method === 'game.pick') {
      if (!this.options.pickGame) {
        this.sendResponse(req.id, { success: false, message: 'This Stadium cannot show a repository picker.' });
        return;
      }
      try {
        this.sendResponse(req.id, await this.options.pickGame());
      } catch (err) {
        this.sendResponse(req.id, { success: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (req.method === 'game.open') {
      if (!this.options.openGame) {
        this.sendResponse(req.id, { success: false, outcome: 'failed', message: 'This Stadium cannot open Game windows.' });
        return;
      }
      try {
        this.sendResponse(req.id, await this.options.openGame(req.params as GameOpenParams));
      } catch (err) {
        this.sendResponse(req.id, {
          success: false,
          outcome: 'failed',
          message: err instanceof Error ? err.message : String(err)
        });
      }
      return;
    }

    if (req.method.startsWith('player.') && req.method !== 'player.action' && this.options.playerLifecycle) {
      try {
        this.sendResponse(req.id, await this.options.playerLifecycle(req.method, (req.params ?? {}) as Record<string, unknown>));
      } catch (err) {
        this.sendResponse(req.id, { success: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // Refresh Incoming: recovery only. The watcher publishes normally without it.
    if (req.method === 'report.rescan') {
      try {
        const count = await this.publishReportsChanged();
        const ctx = this.options.gameContextGetter();
        this.sendResponse(req.id, { success: true, count: count ?? 0, gameId: ctx.game.gameId });
      } catch (err) {
        this.sendResponse(req.id, { success: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (req.method === 'capability.refresh') {
      let result = { success: true };
      if (this.options.playerRoster?.refreshCapabilities) {
        await this.options.playerRoster.refreshCapabilities();
      }
      this.sendResponse(req.id, result);
      return;
    }

    this.sendError(req.id, -32601, `Method '${req.method}' not implemented.`);
  }

  private async executeDispatch(params: DispatchRequestParams): Promise<void> {
    const { clientRef, stadiumId, gameId, playerInstanceId, terminalName } = params;

    // 1. If playerInstanceId is specified and PlayerRoster is available, resolve transport
    if (playerInstanceId && this.options.playerRoster) {
      const resolution = this.options.playerRoster.resolve(playerInstanceId);
      if (resolution.state === 'pending') {
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId,
          error: { code: -32000, message: 'That Player is reconnecting — try again in a moment.' }
        });
        return;
      }
      if (resolution.state === 'unavailable') {
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId,
          error: { code: -32000, message: resolution.message }
        });
        return;
      }
      if (resolution.state === 'live') {
        if (resolution.transport === 'controlled') {
          await this.deliverControlled(params);
          return;
        }
        if (resolution.transport === 'legacy') {
          if (resolution.instance.playerType === 'terminal') {
            this.deliverTerminalCommand(params);
            return;
          }
          // Terminal-backed provider Player: its EXACT terminal, never a same-named sibling.
          const sent = this.options.playerRoster.sendToProviderTerminal(playerInstanceId, params.prompt, params.modelSwitch);
          this.sendNotification(sent.success ? 'dispatch.accepted' : 'dispatch.rejected', sent.success
            ? { clientRef, stadiumId, gameId, playerInstanceId, acceptedAt: Date.now() }
            : { clientRef, stadiumId, gameId, playerInstanceId, error: { code: -32000, message: sent.message } });
          return;
        }
      }

      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId,
        error: { code: -32000, message: 'That Player has left the field.' }
      });
      return;
    }

    // 2. Controlled Player transport fallback (when playerRoster is not configured)
    if (playerInstanceId && this.options.playerControlHost) {
      await this.deliverControlled(params);
      return;
    }

    // 3. Legacy terminal transport fallback
    if (terminalName && this.options.sendTerminalText) {
      await this.deliverTerminal(params, terminalName);
      return;
    }

    // Neither transport matched
    this.sendNotification('dispatch.rejected', {
      clientRef,
      stadiumId,
      gameId,
      playerInstanceId: playerInstanceId || 'unknown',
      error: { code: -32602, message: 'No target player instance or terminal available for dispatch.' }
    });
  }

  private async deliverControlled(params: DispatchRequestParams): Promise<void> {
    const { clientRef, stadiumId, gameId, playerInstanceId, prompt, model, effort } = params;
    if (!this.options.playerControlHost || !playerInstanceId) {
      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId: playerInstanceId || 'unknown',
        error: { code: -32000, message: 'Controlled Player host is not available.' }
      });
      return;
    }

    try {
      const outcome = await this.options.playerControlHost.deliver(playerInstanceId, prompt, {
        model,
        effort
      });

      if (outcome.kind === 'accepted') {
        this.sendNotification('dispatch.accepted', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId,
          turnRef: outcome.turnRef,
          acceptedAt: Date.now()
        });
      } else if (outcome.kind === 'refused') {
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId,
          error: { code: -32000, message: outcome.message }
        });
      } else {
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId,
          error: { code: -32000, message: outcome.reason }
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId,
        error: { code: -32000, message: msg }
      });
    }
  }

  /** Terminal Player: one exact command, one exact instance. Refusals say nothing ran. */
  private deliverTerminalCommand(params: DispatchRequestParams): void {
    const { clientRef, stadiumId, gameId, playerInstanceId, prompt } = params;
    const outcome = this.options.playerRoster!.runTerminalCommand(playerInstanceId!, prompt);
    if (outcome.kind === 'accepted') {
      this.sendNotification('dispatch.accepted', { clientRef, stadiumId, gameId, playerInstanceId, turnRef: outcome.turnRef, acceptedAt: Date.now() });
    } else {
      this.sendNotification('dispatch.rejected', { clientRef, stadiumId, gameId, playerInstanceId, error: { code: -32000, message: outcome.message } });
    }
  }

  private async deliverTerminal(params: DispatchRequestParams, targetTerminalName: string): Promise<void> {
    const { clientRef, stadiumId, gameId, playerInstanceId, prompt } = params;
    if (!this.options.sendTerminalText) {
      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId: playerInstanceId || `term_${targetTerminalName}`,
        error: { code: -32000, message: 'Terminal transport is not available.' }
      });
      return;
    }

    try {
      if (params.modelSwitch) {
        await this.options.sendTerminalText(targetTerminalName, params.modelSwitch);
      }
      const sent = await this.options.sendTerminalText(targetTerminalName, prompt);
      if (sent === false) {
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId: playerInstanceId || `term_${targetTerminalName}`,
          error: { code: -32000, message: `Terminal '${targetTerminalName}' was not found.` }
        });
        return;
      }

      this.sendNotification('dispatch.accepted', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId: playerInstanceId || `term_${targetTerminalName}`,
        acceptedAt: Date.now()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId: playerInstanceId || `term_${targetTerminalName}`,
        error: { code: -32000, message: msg }
      });
    }
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.isConnected) return;
    const notif = buildRpcNotification(method, params);
    this.socket?.send(JSON.stringify(notif));
  }

  private sendResponse(id: string | number, result: unknown): void {
    if (!this.isConnected) return;
    const resp = buildRpcResponse(id, result);
    this.socket?.send(JSON.stringify(resp));
  }

  private sendError(id: string | number, code: number, message: string): void {
    if (!this.isConnected) return;
    const err = buildRpcError(id, code, message);
    this.socket?.send(JSON.stringify(err));
  }
}
