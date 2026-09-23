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
  type ScoutOpenRouterCredentialParams,
  type GamePickResult,
  type GameOpenParams,
  type GameOpenResult,
  type PlayerLifecycleResult,
  type ControlPlaneFreshness,
  type GameFilesBrowseParams,
  type GameFilesCheckParams,
  type GameFilesSearchParams,
  type GameFilesResolveAbsoluteParams,
  type GameFilesystemInspectParams,
  type GameFilesystemApplyParams,
  type GameFilesystemApplyResult,
  type GameFilesystemEnsureParams,
  type GameFilesystemEnsureResult
  , type HealthEvidence
} from './control-plane/protocol';
import { getDurableStadiumId, createSessionInstanceId, type ResolvedGameContext, type StadiumIdentity } from './game-identity';
import type { PlayerControlHost } from './player-control/host';
import type { PlayerRoster } from './player-roster';
import { suggestSources, browseSources, checkSources, MAX_ROUTINE_SOURCE_CHECKS } from './routine-sources';
import {
  browseGameDirectory,
  checkGamePaths,
  searchGameFiles,
  resolveAbsoluteGamePath,
  inspectGameFilesystemEvidence,
  ensureGameFilesystemStructure,
  MAX_GAME_PATH_CHECKS,
  MAX_GAME_FILE_SEARCH_LIMIT,
  type GamePathState,
  type SearchGameFilesResult,
  type AbsoluteGamePathEnvironment,
  type ResolveAbsoluteGamePathResult,
  type EnsureGameFilesystemRequest,
  type EnsureGameFilesystemResult
} from './game-files';
import type { GameFilesystemEvidence } from './game-filesystem-contract';
import type { ScoutPlayerAdapter } from './scout-player';
import { SCOUT_PLAYER_INSTANCE_ID } from './scout-player-contract';
import { mergeSidelineOwnedParents, reportPathKey, type ReportSource } from './scout-intelligence-report-source';
import { ScoutBootstrapError, type ScoutBootstrapService } from './scout-bootstrap';
import type { ReportProvenance } from './report-provenance';

export interface CoachReportItem {
  gameId?: string;
  project: string;
  agent: string;
  filename: string;
  path: string;
  mtime: number;
  content: string;
  provenance?: ReportProvenance;
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
  /** One logical Scout routing target backed by the existing Formation engine. */
  scoutPlayer?: ScoutPlayerAdapter;
  /** Secure extension-owned credential operations; responses contain boolean state only. */
  scoutOpenRouterCredential?: {
    status: () => PromiseLike<{ configured: boolean }>;
    save: (apiKey: string) => PromiseLike<{ configured: boolean }>;
    disconnect: () => PromiseLike<{ configured: boolean }>;
  };
  /** Product-capability seam, deliberately separate from secret ownership. */
  scoutAvailable?: () => boolean;
  /** Durable source for Dad-facing Scout Formation parents (outside every Game's report root). */
  scoutReportSource?: ReportSource;
  /** In-product Scout bootstrap (S31 Slice 4). Only a human action reaches it; nothing here schedules anything. */
  scoutBootstrap?: Pick<ScoutBootstrapService, 'status' | 'authorizeAndStart' | 'decline' | 'refresh'>;
  reportsGetter?: () => Promise<CoachReportItem[]>;
  sendTerminalText?: (terminalName: string, text: string) => Promise<boolean> | boolean;
  addGame?: () => Promise<{ success: boolean; message?: string }> | { success: boolean; message?: string };
  /** Native repository picker. Only a Stadium can show one; the browser cannot. */
  pickGame?: () => Promise<GamePickResult>;
  /** Open a VS Code window on a Game. Environment-specific mechanics live in the Stadium. */
  openGame?: (params: GameOpenParams) => Promise<GameOpenResult>;
  /** Single dispatch point for Q2.9 Player lifecycle RPCs. */
  playerLifecycle?: (method: string, params: Record<string, unknown>) => Promise<PlayerLifecycleResult>;
  routineSources?: {
    suggest?: (gameId: string, rootFsPath: string) => Promise<Array<{ path: string; kind: 'file' | 'folder'; reason: string }>>;
    browse?: (gameId: string, rootFsPath: string, dir?: string) => Promise<{ dir: string; entries: Array<{ name: string; path: string; kind: 'file' | 'folder' }> }>;
    check?: (gameId: string, rootFsPath: string, paths: string[]) => Promise<Array<{ path: string; state: GamePathState }>>;
  };
  /** Neutral Game Files test/adaptation seam. The Stadium still supplies the authoritative root. */
  gameFiles?: {
    browse?: (gameId: string, rootFsPath: string, dir?: string) => Promise<{ dir: string; entries: Array<{ name: string; path: string; kind: 'file' | 'folder' }>; truncated: boolean }>;
    check?: (gameId: string, rootFsPath: string, paths: string[]) => Promise<Array<{ path: string; state: GamePathState }>>;
    search?: (
      gameId: string,
      rootFsPath: string,
      query: string,
      limit: number | undefined,
      isSuperseded: () => boolean,
      allowSingleCharacter?: boolean
    ) => Promise<SearchGameFilesResult>;
    resolveAbsolute?: (
      gameId: string,
      rootFsPath: string,
      path: string,
      environment: AbsoluteGamePathEnvironment
    ) => Promise<ResolveAbsoluteGamePathResult>;
    /** S6 read-only evidence seam. The Stadium still supplies the authoritative root. */
    inspect?: (
      gameId: string,
      rootFsPath: string,
      options: { checkPaths?: string[]; reportPaths?: string[] }
    ) => Promise<GameFilesystemEvidence>;
    /** S8.0 narrow mutation seam. The Stadium still supplies the authoritative root. */
    ensure?: (
      gameId: string,
      rootFsPath: string,
      request: EnsureGameFilesystemRequest
    ) => Promise<EnsureGameFilesystemResult>;
  };
  /**
   * S6: Game-relative coordinates of reports Sideline already discovers, used only as
   * bootstrap evidence. No content crosses this seam.
   */
  reportPathsGetter?: (gameId: string) => Promise<string[]>;
  /** S7 memory-only contract apply; the callback rebuilds watchers before acknowledging. */
  filesystemContractApplier?: (params: GameFilesystemApplyParams) => Promise<GameFilesystemApplyResult> | GameFilesystemApplyResult;
  autoReconnect?: boolean;
  /**
   * Freshness Guard: find (or safely start/replace) the Control Plane before each
   * reconnect. A replaced daemon may live on a different port or token.
   */
  resolveControlPlane?: () => Promise<{ port: number; freshness?: ControlPlaneFreshness }>;
  /** The Control Plane build this Stadium loaded at activation. */
  controlPlaneBuildId?: string;
  /** Q2.8H: this Stadium's own extension-source build identity (dev-harness proof). */
  extensionBuildId?: string;
  /** VS Code workspace environment used only by Stadium-owned absolute resolution. */
  workspaceScheme?: string;
  remoteName?: string;
}

export class StadiumClient extends EventEmitter {
  private socket: WebSocket | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private connected = false;
  private nextRpcId = 1;
  private lastRoutineSourceCheckAt = 0;
  private readonly latestSearchIdByGame = new Map<string, string>();
  /** Last terminal logical-Scout turn, replayable after Control Plane replacement. */
  private lastScoutTerminalTurn: { gameId: string; turn: Record<string, unknown> } | undefined;
  /**
   * Fast path only: the exact parent a logical Scout turn just produced, so it
   * reaches Incoming without waiting for a watcher tick. Durability belongs to
   * `options.scoutReportSource`; the same path is never two reports.
   */
  private readonly scoutFormationReports = new Map<string, CoachReportItem>();
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
    if (this.lastScoutTerminalTurn?.gameId === ctx.game.gameId) {
      // Terminal turn notifications are idempotent in the Ledger and continuation
      // ledger. Replaying one bounded last Scout result closes the replacement
      // window where Formation finished while the socket was disconnected.
      this.sendTurnChanged(this.lastScoutTerminalTurn.turn);
    }
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
    // Scout is a roster-native Virtual Player (S31 Slice 5): its capability, present or truthfully
    // unavailable, comes from the roster like every other Player's. Nothing is injected here.
    const capabilities = this.options.playerRoster ? [...this.options.playerRoster.getRoutingCapabilities(ctx.game.gameId)] : [];
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
    const registered = [...this.scoutFormationReports.values()]
      .filter((report) => report.gameId === ctx.game.gameId);
    let durable: CoachReportItem[] = [];
    if (this.options.scoutReportSource && ctx.game.gameId !== 'unknown') {
      // A source failure must never take ordinary Game reports down with it.
      try { durable = await this.options.scoutReportSource.list(ctx.game.gameId, { project: ctx.game.displayName || ctx.game.gameId }); }
      catch { durable = []; }
    }
    const scoutReports = mergeSidelineOwnedParents(durable, registered);
    const scoutPaths = new Set(scoutReports.map((report) => reportPathKey(report.path)));
    reports = [...scoutReports, ...reports.filter((candidate) => !scoutPaths.has(reportPathKey(candidate.path)))]
      .sort((a, b) => (b.mtime - a.mtime) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
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

  /** Live Player Terminal: one already-sanitized activity line for one exact Player. */
  sendPlayerActivity(activity: unknown): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    this.sendNotification('player.activity', {
      stadiumId: this.stadiumId,
      instanceId: this.instanceId,
      gameId: ctx.game.gameId,
      activity
    });
  }

  /** Push one bounded live health frame; the daemon remains the trust boundary. */
  sendHealthEvidence(playerInstanceId: string, evidence: HealthEvidence): void {
    if (!this.isConnected) return;
    const ctx = this.options.gameContextGetter();
    this.sendNotification('health.evidence', {
      stadiumId: this.stadiumId, instanceId: this.instanceId, gameId: ctx.game.gameId,
      playerInstanceId, evidence
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
        controlPlaneFreshness: this.controlPlaneFreshness,
        extensionBuildId: this.options.extensionBuildId,
        features: ['game.files.v1', 'game.filesystem.v1', 'game.filesystem.apply.v1', 'game.filesystem.ensure.v1', 'scout.openrouter-credential.v1', 'scout.formation-operator.v1', 'scout.bootstrap.v1', 'health.evidence.v1']
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

    if (req.method === 'scout.openrouterCredential.status'
      || req.method === 'scout.openrouterCredential.save'
      || req.method === 'scout.openrouterCredential.disconnect') {
      await this.withExactGame(req, async (ctx, params) => {
        const credential = this.options.scoutOpenRouterCredential;
        if (!credential) throw new Error('This Stadium cannot manage Scout credentials.');
        let state: { configured: boolean };
        let message: string;
        if (req.method === 'scout.openrouterCredential.save') {
          const typed = params as unknown as ScoutOpenRouterCredentialParams;
          if (typeof typed.apiKey !== 'string') throw new Error('Enter an OpenRouter API key.');
          state = await credential.save(typed.apiKey);
          message = 'API key saved securely.';
        } else if (req.method === 'scout.openrouterCredential.disconnect') {
          state = await credential.disconnect();
          message = 'OpenRouter disconnected.';
        } else {
          state = await credential.status();
          message = state.configured ? 'API key is saved securely.' : 'OpenRouter is not configured.';
        }
        return {
          success: true,
          gameId: ctx.game.gameId,
          configured: state.configured,
          available: this.options.scoutAvailable?.() !== false,
          message
        };
      });
      return;
    }

    if (req.method === 'scout.bootstrap.status'
      || req.method === 'scout.bootstrap.authorize'
      || req.method === 'scout.bootstrap.decline'
      || req.method === 'scout.bootstrap.refresh') {
      await this.withExactGame(req, async (ctx) => {
        const bootstrap = this.options.scoutBootstrap;
        if (!bootstrap) throw new Error('This Stadium cannot manage Scout tryouts.');
        // The Game is only the reconnaissance target; Scout-owned state never lives in it.
        const gameRoot = ctx.binding.rootFsPath;
        try {
          const status = req.method === 'scout.bootstrap.authorize' ? await bootstrap.authorizeAndStart(gameRoot)
            : req.method === 'scout.bootstrap.decline' ? await bootstrap.decline(gameRoot)
              : req.method === 'scout.bootstrap.refresh' ? await bootstrap.refresh(gameRoot)
                : await bootstrap.status(gameRoot);
          return { success: true, gameId: ctx.game.gameId, status };
        } catch (error) {
          // An expected refusal (authorize first, already running, no credential) is data for
          // Settings, not a transport failure.
          if (error instanceof ScoutBootstrapError) {
            return { success: false, gameId: ctx.game.gameId, code: error.code, message: error.message };
          }
          throw error;
        }
      });
      return;
    }

    if (req.method === 'scout.formation.receivers' || req.method === 'scout.formation.run') {
      await this.withExactGame(req, async (ctx, params) => {
        const scout = this.options.scoutPlayer;
        if (!scout) throw new Error('This Stadium cannot run Scout Formations.');
        const availability = scout.availability(ctx.binding.rootFsPath);
        const ready = availability.considered.filter((candidate) => candidate.eligible);
        if (req.method === 'scout.formation.receivers') {
          return {
            success: true,
            gameId: ctx.game.gameId,
            receivers: ready.map(({ id, player, provider }) => ({ id, player, provider }))
          };
        }
        const receiverId = typeof params.receiverId === 'string' ? params.receiverId.trim() : '';
        const objective = typeof params.objective === 'string' ? params.objective.trim() : '';
        if (!receiverId || !objective || objective.length > 2_000) throw new Error('Choose one READY Scout and enter a bounded objective.');
        const receiver = ready.find((candidate) => candidate.id === receiverId);
        if (!receiver) throw new Error('That Scout receiver is not currently READY in the canonical depth chart.');
        if (/openrouter/i.test(receiver.provider)) {
          const credential = await this.options.scoutOpenRouterCredential?.status();
          if (!credential?.configured) throw new Error('Configure the OpenRouter credential in Sideline Settings before this field test.');
        }
        const clientRef = `scout-dev_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
        void this.deliverScout({
          clientRef,
          stadiumId: this.stadiumId,
          gameId: ctx.game.gameId,
          playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
          prompt: objective,
          routingMode: 'dev-operator'
        }, { players: [receiverId], direct: true });
        return { success: true, gameId: ctx.game.gameId, clientRef, receiverId, message: `${receiver.player} fielded through the existing Scout Formation runtime.` };
      });
      return;
    }

    if (req.method === 'game.files.browse') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesBrowseParams;
        const result = this.options.gameFiles?.browse
          ? await this.options.gameFiles.browse(ctx.game.gameId, ctx.binding.rootFsPath, typed.dir)
          : await browseGameDirectory(ctx.binding.rootFsPath, typed.dir);
        return { success: true, gameId: ctx.game.gameId, dir: result.dir, entries: result.entries, truncated: result.truncated };
      });
      return;
    }

    if (req.method === 'game.files.check') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesCheckParams;
        if (!Array.isArray(typed.paths) || typed.paths.some((candidate) => typeof candidate !== 'string') || typed.paths.length > MAX_GAME_PATH_CHECKS) {
          throw new Error(`Provide at most ${MAX_GAME_PATH_CHECKS} Game paths as strings.`);
        }
        const checkedAt = Math.max(Date.now(), this.lastRoutineSourceCheckAt + 1);
        this.lastRoutineSourceCheckAt = checkedAt;
        const checks = this.options.gameFiles?.check
          ? await this.options.gameFiles.check(ctx.game.gameId, ctx.binding.rootFsPath, typed.paths)
          : await checkGamePaths(ctx.binding.rootFsPath, typed.paths);
        return { success: true, gameId: ctx.game.gameId, checkedAt, checks };
      });
      return;
    }

    if (req.method === 'game.files.search') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesSearchParams;
        if (typeof typed.query !== 'string' || typed.query.length > 120) {
          throw new Error('Search query must be a string no longer than 120 characters.');
        }
        if (typeof typed.searchId !== 'string' || !typed.searchId.trim() || typed.searchId.length > 120) {
          throw new Error('Search request requires a valid searchId.');
        }
        if (typed.limit !== undefined && (!Number.isInteger(typed.limit) || typed.limit < 1 || typed.limit > MAX_GAME_FILE_SEARCH_LIMIT)) {
          throw new Error(`Search limit must be an integer from 1 to ${MAX_GAME_FILE_SEARCH_LIMIT}.`);
        }
        if (typed.allowSingleCharacter !== undefined && typeof typed.allowSingleCharacter !== 'boolean') {
          throw new Error('Search single-character policy must be boolean.');
        }
        const gameId = ctx.game.gameId;
        const searchId = typed.searchId.trim();
        this.latestSearchIdByGame.set(gameId, searchId);
        const isSuperseded = () => this.latestSearchIdByGame.get(gameId) !== searchId;
        const result = this.options.gameFiles?.search
          ? await this.options.gameFiles.search(gameId, ctx.binding.rootFsPath, typed.query, typed.limit, isSuperseded, typed.allowSingleCharacter === true)
          : await searchGameFiles(ctx.binding.rootFsPath, typed.query, { limit: typed.limit, allowSingleCharacter: typed.allowSingleCharacter === true }, isSuperseded);
        return { success: true, gameId, searchId, ...result };
      });
      return;
    }

    if (req.method === 'game.files.resolveAbsolute') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesResolveAbsoluteParams;
        if (typeof typed.path !== 'string' || !typed.path.trim() || typed.path.length > 240) {
          throw new Error('Absolute resolution requires one Game-relative path no longer than 240 characters.');
        }
        const environment: AbsoluteGamePathEnvironment = {
          workspaceScheme: this.options.workspaceScheme,
          remoteName: this.options.remoteName,
          platform: process.platform
        };
        const result = this.options.gameFiles?.resolveAbsolute
          ? await this.options.gameFiles.resolveAbsolute(ctx.game.gameId, ctx.binding.rootFsPath, typed.path, environment)
          : await resolveAbsoluteGamePath(ctx.binding.rootFsPath, typed.path, environment);
        return { success: true, gameId: ctx.game.gameId, ...result };
      });
      return;
    }

    // S6: read-only bootstrap evidence. Creates nothing, renames nothing, reads no content.
    if (req.method === 'game.filesystem.inspect') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesystemInspectParams;
        const rawCheckPaths = Array.isArray(typed.checkPaths) ? typed.checkPaths : [];
        if (rawCheckPaths.some((candidate) => typeof candidate !== 'string') || rawCheckPaths.length > MAX_GAME_PATH_CHECKS) {
          throw new Error(`Provide at most ${MAX_GAME_PATH_CHECKS} Game paths as strings.`);
        }
        const checkPaths = rawCheckPaths as string[];
        let reportPaths: string[] = [];
        try {
          reportPaths = (await this.options.reportPathsGetter?.(ctx.game.gameId)) ?? [];
        } catch {
          // Report coordinates are supporting evidence only; their absence is not a failure.
          reportPaths = [];
        }
        const evidence = this.options.gameFiles?.inspect
          ? await this.options.gameFiles.inspect(ctx.game.gameId, ctx.binding.rootFsPath, { checkPaths, reportPaths })
          : await inspectGameFilesystemEvidence(ctx.game.gameId, ctx.binding.rootFsPath, { checkPaths, reportPaths });
        return { success: true, gameId: ctx.game.gameId, evidence };
      });
      return;
    }

    // S7: Control Plane projects only the exact Game's minimum report-discovery state.
    if (req.method === 'game.filesystem.apply') {
      await this.withExactGame(req, async (ctx, params) => {
        if (!this.options.filesystemContractApplier) throw new Error('This Stadium does not support filesystem contract apply.');
        const typed = params as unknown as GameFilesystemApplyParams;
        const result = await this.options.filesystemContractApplier(typed);
        return { ...result, gameId: ctx.game.gameId };
      });
      return;
    }

    // S8.0: the one narrow, verified filesystem mutation. Creates at most one
    // canonical root and/or missing provider lanes; never renames, merges or deletes.
    if (req.method === 'game.filesystem.ensure') {
      await this.withExactGame(req, async (ctx, params) => {
        const typed = params as unknown as GameFilesystemEnsureParams;
        if (!Number.isSafeInteger(typed.revision) || typed.revision < 0) {
          throw new Error('Filesystem ensure requires a non-negative integer revision.');
        }
        const request: EnsureGameFilesystemRequest = {
          root: typed.root && typeof typed.root.name === 'string' && typed.root.name.trim() ? { name: typed.root.name } : undefined,
          lanesRoot: typeof typed.lanesRoot === 'string' && typed.lanesRoot.trim() ? typed.lanesRoot : undefined,
          lanes: Array.isArray(typed.lanes) ? typed.lanes.filter((lane): lane is string => typeof lane === 'string') : undefined
        };
        const result = this.options.gameFiles?.ensure
          ? await this.options.gameFiles.ensure(ctx.game.gameId, ctx.binding.rootFsPath, request)
          : await ensureGameFilesystemStructure(ctx.binding.rootFsPath, request);
        return { success: true, gameId: ctx.game.gameId, revision: typed.revision, ...result };
      });
      return;
    }

    if (req.method === 'routine.sources.suggest') {
      const params = (req.params ?? {}) as { gameId?: string };
      const ctx = this.options.gameContextGetter();
      if (!params.gameId || params.gameId !== ctx.game.gameId) {
        this.sendResponse(req.id, {
          success: false,
          message: `Game mismatch: Stadium is bound to '${ctx.game.gameId}', not '${params.gameId}'.`
        });
        return;
      }
      try {
        const rootFsPath = ctx.binding.rootFsPath;
        const suggestions = this.options.routineSources?.suggest
          ? await this.options.routineSources.suggest(ctx.game.gameId, rootFsPath)
          : await suggestSources(rootFsPath);
        this.sendResponse(req.id, {
          success: true,
          gameId: ctx.game.gameId,
          suggestions
        });
      } catch (err) {
        this.sendResponse(req.id, {
          success: false,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      return;
    }

    if (req.method === 'routine.sources.browse') {
      const params = (req.params ?? {}) as { gameId?: string; dir?: string };
      const ctx = this.options.gameContextGetter();
      if (!params.gameId || params.gameId !== ctx.game.gameId) {
        this.sendResponse(req.id, {
          success: false,
          message: `Game mismatch: Stadium is bound to '${ctx.game.gameId}', not '${params.gameId}'.`
        });
        return;
      }
      try {
        const rootFsPath = ctx.binding.rootFsPath;
        const result = this.options.routineSources?.browse
          ? await this.options.routineSources.browse(ctx.game.gameId, rootFsPath, params.dir)
          : await browseSources(rootFsPath, params.dir);
        this.sendResponse(req.id, {
          success: true,
          gameId: ctx.game.gameId,
          dir: result.dir,
          entries: result.entries
        });
      } catch (err) {
        this.sendResponse(req.id, {
          success: false,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      return;
    }

    if (req.method === 'routine.sources.check') {
      const params = (req.params ?? {}) as { gameId?: string; paths?: string[] };
      const ctx = this.options.gameContextGetter();
      if (!params.gameId || params.gameId !== ctx.game.gameId) {
        this.sendResponse(req.id, {
          success: false,
          message: `Game mismatch: Stadium is bound to '${ctx.game.gameId}', not '${params.gameId}'.`
        });
        return;
      }
      try {
        const rootFsPath = ctx.binding.rootFsPath;
        if (!Array.isArray(params.paths) || params.paths.some((candidate) => typeof candidate !== 'string') || params.paths.length > MAX_ROUTINE_SOURCE_CHECKS) {
          throw new Error(`Provide at most ${MAX_ROUTINE_SOURCE_CHECKS} source paths as strings.`);
        }
        const paths = params.paths;
        const checkedAt = Math.max(Date.now(), this.lastRoutineSourceCheckAt + 1);
        this.lastRoutineSourceCheckAt = checkedAt;
        const checks = this.options.routineSources?.check
          ? await this.options.routineSources.check(ctx.game.gameId, rootFsPath, paths)
          : await checkSources(rootFsPath, paths);
        this.sendResponse(req.id, {
          success: true,
          gameId: ctx.game.gameId,
          checkedAt,
          checks
        });
      } catch (err) {
        this.sendResponse(req.id, {
          success: false,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      return;
    }

    this.sendError(req.id, -32601, `Method '${req.method}' not implemented.`);
  }

  private async withExactGame(
    req: { id: string | number; params: unknown },
    operation: (ctx: ResolvedGameContext, params: Record<string, unknown>) => Promise<unknown>
  ): Promise<void> {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const requestedGameId = typeof params.gameId === 'string' ? params.gameId : '';
    const ctx = this.options.gameContextGetter();
    if (!requestedGameId || requestedGameId !== ctx.game.gameId) {
      this.sendResponse(req.id, {
        success: false,
        message: `Game mismatch: Stadium is bound to '${ctx.game.gameId}', not '${requestedGameId || 'missing'}'.`
      });
      return;
    }
    try {
      this.sendResponse(req.id, await operation(ctx, params));
    } catch (error) {
      this.sendResponse(req.id, { success: false, gameId: ctx.game.gameId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async executeDispatch(params: DispatchRequestParams): Promise<void> {
    const { clientRef, stadiumId, gameId, playerInstanceId, terminalName } = params;

    // Scout is a logical Player rather than a terminal/roster process. MANUAL
    // and future AUTO both arrive here with the same canonical target id.
    if (playerInstanceId === SCOUT_PLAYER_INSTANCE_ID) {
      await this.deliverScout(params);
      return;
    }

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

  private async deliverScout(
    params: DispatchRequestParams,
    options: { readonly players?: readonly string[]; readonly direct?: boolean } = {}
  ): Promise<void> {
    const { clientRef, stadiumId, gameId, playerInstanceId, prompt } = params;
    const scout = this.options.scoutPlayer;
    const ctx = this.options.gameContextGetter();
    const capability = scout?.capability(ctx.binding.rootFsPath);
    // Membership is per Game and human-owned. The Dev Mode operator is a diagnostic and skips it; every
    // routed Play must find Scout On Field here. Refuse only when the roster AFFIRMATIVELY says it is not:
    // a roster that cannot answer is never a reason to fail a dispatch.
    const onField = this.options.playerRoster?.isVirtualOnField?.(SCOUT_PLAYER_INSTANCE_ID);
    const notOnField = !options.direct && onField === false;
    if (!scout || !capability || capability.state !== 'ready' || gameId !== ctx.game.gameId || notOnField) {
      this.sendNotification('dispatch.rejected', {
        clientRef,
        stadiumId,
        gameId,
        playerInstanceId: playerInstanceId || SCOUT_PLAYER_INSTANCE_ID,
        error: { code: -32000, message: notOnField
          ? 'Scout is not on this Game\u2019s field. Recruit Scout or put it back On Field first.'
          : 'Scout is unavailable: disabled, already working, or no eligible Formation receiver is currently proven READY.' }
      });
      return;
    }

    const turnRef = `scout_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    this.lastScoutTerminalTurn = undefined;
    // Q2.14: the exact, truthful receiver count Formation is about to dispatch —
    // never a guess, never a live per-receiver progress feed (Formation itself
    // exposes no such feed; not built here). Fires once, synchronously before
    // any receiver actually runs, so the working card can say "N Scouts
    // running" instead of an unlabeled generic state.
    const promptSummary = summarizeScoutObjective(prompt);
    // The Play this Formation answers. Known now, so the parent report can carry
    // it in the artifact itself (see FORMATION PARENT SELF-DESCRIPTION) instead
    // of depending on this in-memory turn surviving.
    const playClientRef = options.direct ? turnRef : clientRef;
    const run = scout.execute(prompt, ctx.binding.rootFsPath, {
      players: options.players,
      reportAttribution: { gameId, clientRef: playClientRef },
      onSelected: (info) => {
        const count = info.count;
        this.sendTurnChanged({
          instanceId: SCOUT_PLAYER_INSTANCE_ID,
          turnRef,
          state: 'started',
          promptSummary,
          activitySummary: `${count} Scout${count === 1 ? '' : 's'} running`,
          at: Date.now()
        });
      }
    });
    this.sendNotification('dispatch.accepted', {
      clientRef,
      stadiumId,
      gameId,
      playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
      turnRef,
      acceptedAt: Date.now()
    });
    this.sendTurnChanged({ instanceId: SCOUT_PLAYER_INSTANCE_ID, turnRef, state: 'accepted', promptSummary, at: Date.now() });
    this.sendCapabilitySnapshot();
    void this.sendRosterChanged();

    try {
      const result = await run;
      const state = result.outcome === 'COMPLETE' ? 'completed' : result.outcome.toLowerCase();
      const requested = result.formation.scoutsRequested;
      const completed = result.formation.scoutsCompleted;
      const terminalSummary = result.outcome === 'COMPLETE'
        ? `Formation complete · ${completed} Scout${completed === 1 ? '' : 's'}`
        : result.outcome === 'PARTIAL'
          ? `Formation partial · ${completed} of ${requested} Scouts completed`
          : `Formation ${result.outcome.toLowerCase()} · ${completed} of ${requested} Scouts completed`;
      let reportRegistered = true;
      try {
        await this.registerScoutFormationReport({
          gameId,
          clientRef: playClientRef,
          resultPath: result.formation.resultPath,
          at: result.formation.endedAt
        });
      } catch {
        // The Formation outcome remains its own truth. A missing/unreadable parent
        // artifact is a handoff failure, not retroactive negative Scout game film.
        reportRegistered = false;
      }
      const terminalTurn = {
        instanceId: SCOUT_PLAYER_INSTANCE_ID,
        turnRef,
        state,
        formationOutcome: result.outcome,
        formationId: result.formation.formationId,
        reportPath: result.formation.resultPath,
        activitySummary: `${requested} Scout${requested === 1 ? '' : 's'} fielded`,
        summary: reportRegistered ? terminalSummary : `${terminalSummary} · Formation report handoff unavailable`,
        at: Date.parse(result.formation.endedAt) || Date.now()
      };
      this.lastScoutTerminalTurn = { gameId, turn: terminalTurn };
      this.sendTurnChanged(terminalTurn);
      await this.publishReportsChanged();
    } catch (error) {
      const terminalTurn = {
        instanceId: SCOUT_PLAYER_INSTANCE_ID,
        turnRef,
        state: 'failed',
        formationOutcome: 'FAILED',
        summary: error instanceof Error ? error.message : String(error),
        at: Date.now()
      };
      this.lastScoutTerminalTurn = { gameId, turn: terminalTurn };
      this.sendTurnChanged(terminalTurn);
    } finally {
      this.sendCapabilitySnapshot();
      void this.sendRosterChanged();
    }
  }

  /**
   * BREADCRUMB — logical Scout turn / Formation report handoff.
   *
   * WAS: Scout execution could complete while the synthetic Player card lost its
   * working telemetry and exact report handoff, returning directly to Ready.
   * IS: one logical Scout turn owns aggregate Formation telemetry and the exact
   * Formation result until Dad intentionally acknowledges that report.
   * WHY: a multi-receiver Scout Player must collapse subordinate execution
   * complexity into one understandable lifecycle without losing its intelligence.
   * WILL BE: roster-native Virtual / Orchestrated Players may reuse this logical-
   * turn contract whether workers are terminals, APIs, services, or Formations.
   *
   * S31 Slice 2: this registration is now the FAST PATH, not the durability
   * owner. The parent carries its own provenance and is rediscovered from the
   * Scout Intelligence root by `scoutReportSource` after any restart; the merge
   * in `sendReportSnapshot` keeps the two from becoming competing truths.
   */
  private async registerScoutFormationReport(input: {
    gameId: string;
    clientRef: string;
    resultPath: string;
    at: string;
  }): Promise<void> {
    const resultPath = path.resolve(input.resultPath);
    const [content, stat] = await Promise.all([
      fs.promises.readFile(resultPath, 'utf8'),
      fs.promises.stat(resultPath)
    ]);
    const ctx = this.options.gameContextGetter();
    this.scoutFormationReports.set(`${input.gameId}\0${resultPath}`, {
      gameId: input.gameId,
      project: ctx.game.displayName || input.gameId,
      agent: 'Scout',
      filename: path.basename(resultPath),
      path: resultPath,
      mtime: stat.mtimeMs,
      content,
      provenance: {
        gameId: input.gameId,
        clientRef: input.clientRef,
        playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
        playerType: 'scout',
        provider: 'scout-formation',
        at: input.at
      }
    });
    while (this.scoutFormationReports.size > 10) {
      const oldest = this.scoutFormationReports.keys().next().value as string | undefined;
      if (!oldest) break;
      this.scoutFormationReports.delete(oldest);
    }
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

function summarizeScoutObjective(value: string): string {
  const concise = value.replace(/\s+/g, ' ').trim();
  return concise.length <= 160 ? concise : `${concise.slice(0, 157).trimEnd()}…`;
}
