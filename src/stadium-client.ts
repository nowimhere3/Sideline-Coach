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
  type CapabilityRefreshParams
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
  autoReconnect?: boolean;
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
          this.emit('error', err);
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

  async sendReportSnapshot(): Promise<void> {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    let reports: CoachReportItem[] = [];
    if (this.options.reportsGetter) {
      reports = await this.options.reportsGetter();
    }
    this.sendNotification('report.snapshot', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      reports
    });
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
        rootFsPath: ctx.binding.rootFsPath
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
          void this.connect();
        }, 2000);
        this.reconnectTimer.unref();
      }
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
          result = (await this.options.playerRoster.addInstance(params.playerId)) as any;
        } else if (params.action === 'controlled') {
          result = (await this.options.playerRoster.addControlledInstance(params.playerId)) as any;
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
    const { clientRef, stadiumId, gameId, playerInstanceId, terminalName, prompt, model, effort } = params;

    // 1. Controlled Player transport
    if (playerInstanceId && this.options.playerControlHost) {
      try {
        const outcome = await this.options.playerControlHost.deliver(playerInstanceId, prompt, {
          model,
          effort
        });

        if (outcome.kind === 'accepted') {
          // Certified downstream ingress confirmed -> send dispatch.accepted
          this.sendNotification('dispatch.accepted', {
            clientRef,
            stadiumId,
            gameId,
            playerInstanceId,
            turnRef: outcome.turnRef,
            acceptedAt: Date.now()
          });
          return;
        } else if (outcome.kind === 'refused') {
          this.sendNotification('dispatch.rejected', {
            clientRef,
            stadiumId,
            gameId,
            playerInstanceId,
            error: { code: -32000, message: outcome.message }
          });
          return;
        } else {
          this.sendNotification('dispatch.rejected', {
            clientRef,
            stadiumId,
            gameId,
            playerInstanceId,
            error: { code: -32000, message: outcome.reason }
          });
          return;
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
        return;
      }
    }

    // 2. Legacy terminal transport
    if (terminalName && this.options.sendTerminalText) {
      try {
        let textToSend = prompt;
        if (params.modelSwitch) {
          await this.options.sendTerminalText(terminalName, params.modelSwitch);
        }
        await this.options.sendTerminalText(terminalName, textToSend);

        this.sendNotification('dispatch.accepted', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId: playerInstanceId || `term_${terminalName}`,
          acceptedAt: Date.now()
        });
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendNotification('dispatch.rejected', {
          clientRef,
          stadiumId,
          gameId,
          playerInstanceId: playerInstanceId || `term_${terminalName}`,
          error: { code: -32000, message: msg }
        });
        return;
      }
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
