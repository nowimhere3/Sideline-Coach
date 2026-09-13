import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  buildRpcResponse,
  buildRpcError,
  buildRpcRequest,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcError,
  type ControlPlaneDiscoveryRecord,
  type StadiumHelloParams,
  type StadiumHeartbeatParams,
  type GameConnectedParams,
  type GameDisconnectedParams,
  type RosterSnapshotParams,
  type CapabilitySnapshotParams,
  type PlayerDiscoverySnapshotParams,
  type ReportSnapshotParams,
  type TurnChangedParams,
  type DispatchAcceptedParams,
  type DispatchRejectedParams,
  type PlayerActionResult,
  type GamePickResult,
  type GameOpenResult,
  type PlayerLifecycleResult
} from './protocol';
import { decideAddGame } from '../game-lifecycle';
import { StadiumRegistry, type StadiumSession } from './stadium-registry';
import { ControlPlaneRouter } from './router';
import { computeAutoRoute, createRoutingPolicies, type ProviderRoutingPolicy } from '../routing-policy';
import { InstanceWorkLedger, type DispatchRecord, type TurnRecord } from './work-ledger';
import { CONTROL_PLANE_SERVICE, computeControlPlaneBuild } from './freshness';
import type { PlayerRoutingCapability, RoutingDecision, RoutingMode } from '../capability-types';
import { projectInstanceControls, type ProviderControlProfile } from '../provider-control';
import {
  RUNNING_PLAYERS_SAVED,
  isRunningPlayersPreference,
  loadPreferences,
  projectDiscovery,
  savePreferences,
  type CoachPreferences
} from '../running-players';

export interface ManualRoutingSelection {
  playerInstanceId?: string;
  model?: string;
  effort?: string;
}

export interface DaemonOptions {
  port?: number;
  dir?: string;
  idleTimeoutMs?: number;
  /** Instance nonce; a replacing Stadium names its child so it can recognise it. */
  instanceId?: string;
  /** Build ids this daemon replaced (lineage), newest first. */
  supersedes?: readonly string[];
  /** Why this daemon was started as a replacement, when it was. */
  replacementReason?: string;
  /** Entrypoint whose runtime closure defines this daemon's build identity. */
  daemonScriptPath?: string;
  /** Exit the process after an owner-verified shutdown request (detached daemon only). */
  exitOnShutdown?: boolean;
}

function parseSupersedes(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

export class ControlPlaneDaemon {
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  private readonly registry: StadiumRegistry;
  private readonly router: ControlPlaneRouter;
  private readonly sseClients = new Set<http.ServerResponse>();
  private readonly pendingRpcRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private nextRpcId = 1;
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private boundPort = 0;
  private readonly dir: string;
  private readonly requestedPort: number;
  private readonly idleTimeoutMs: number;
  private authToken = '';
  private routingMode: RoutingMode = 'auto';
  private manualSelection: ManualRoutingSelection | undefined;
  private readonly policies = createRoutingPolicies();
  private readonly ledger = new InstanceWorkLedger();
  private readonly daemonScriptPath: string;
  private readonly buildId: string | undefined;
  private readonly instanceNonce: string;
  private readonly supersedes: string[];
  private readonly replacementReason: string | undefined;
  private readonly exitOnShutdown: boolean;
  /** The human's last selected Game, restored when it reconnects after a restart. */
  private preferredSelectedGameId: string | undefined;

  constructor(options: DaemonOptions = {}) {
    this.dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    this.requestedPort = options.port ?? (process.env.SIDELINE_PORT ? parseInt(process.env.SIDELINE_PORT, 10) : 3100);
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;

    // Freshness Guard identity: what build this daemon IS, which instance, and why it exists.
    this.daemonScriptPath = path.resolve(options.daemonScriptPath ?? path.join(__dirname, 'daemon.js'));
    try { this.buildId = computeControlPlaneBuild(this.daemonScriptPath).buildId; }
    catch { this.buildId = undefined; }
    this.instanceNonce = options.instanceId ?? process.env.SIDELINE_DAEMON_INSTANCE ?? `cpi_${crypto.randomBytes(8).toString('hex')}`;
    this.supersedes = [...(options.supersedes ?? parseSupersedes(process.env.SIDELINE_SUPERSEDES))];
    this.replacementReason = options.replacementReason ?? process.env.SIDELINE_REPLACEMENT_REASON ?? undefined;
    this.exitOnShutdown = options.exitOnShutdown ?? false;
    this.preferredSelectedGameId = this.loadPreferredSelection();

    this.registry = new StadiumRegistry();
    this.router = new ControlPlaneRouter(this.registry);

    // Instance Work Ledger: only what Coach knows moves an instance's activity.
    this.router.on('play-dispatched', (record: DispatchRecord) => this.ledger.recordDispatch(record));
    // AUTO dispatch reads the same per-instance activity the staged route showed.
    this.router.setCandidateEnricher((gameId, candidates) => candidates.map((candidate) => {
      const entry = this.ledger.get(gameId, candidate.instanceId);
      return entry ? { ...candidate, work: { workState: entry.workState } } : candidate;
    }));

    // Forward status updates to SSE clients
    this.router.on('status-update', (payload) => {
      if (typeof payload?.clientRef === 'string' && typeof payload?.state === 'string') {
        this.ledger.recordDelivery(payload.clientRef, payload.state, { turnRef: payload.turnRef, error: payload.error });
      }
      this.broadcast('turn', payload);
      this.broadcast('status', { type: 'turn-update', ...payload });
    });

    this.registry.on('change', (event: { type?: string; gameId?: string; disconnectedGameId?: string }) => {
      if (event.type === 'session-removed') this.ledger.markGameDisconnected(event.disconnectedGameId);
      else if (event.type === 'game-disconnected') this.ledger.markGameDisconnected(event.gameId);
      else if (event.type === 'capabilities-updated' && event.gameId) this.ledger.observeRoster(event.gameId, this.registry.getCapabilitiesForGame(event.gameId));
      else if (event.type === 'reports-updated' && event.gameId) this.ledger.recordReports(event.gameId, this.registry.getReportsForGame(event.gameId));
      // A restarted Control Plane keeps the human's selected Game: the first Stadium to
      // reconnect must not silently become the selection.
      if (event.type === 'selected-game-changed') {
        this.persistPreferredSelection(this.registry.getSelectedGameId());
      } else if ((event.type === 'session-registered' || event.type === 'game-connected')
        && this.preferredSelectedGameId && this.registry.getSelectedGameId() !== this.preferredSelectedGameId
        && this.registry.getAuthoritativeSessionForGame(this.preferredSelectedGameId).status === 'connected') {
        this.registry.setSelectedGameId(this.preferredSelectedGameId);
      }
      this.broadcast('status', { type: 'registry-change', ...event });
      this.broadcast('games', { games: this.registry.getGames() });
      this.checkIdleTimeout();
    });
  }

  get port(): number {
    return this.boundPort;
  }

  get isListening(): boolean {
    return Boolean(this.httpServer?.listening);
  }

  get registryInstance(): StadiumRegistry {
    return this.registry;
  }

  get routerInstance(): ControlPlaneRouter {
    return this.router;
  }

  async start(): Promise<ControlPlaneDiscoveryRecord> {
    if (this.isListening) {
      return this.getDiscoveryRecord();
    }

    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    this.initAuthToken();

    this.httpServer = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`HTTP request error: ${msg}`);
        if (!res.headersSent) {
          this.sendJson(res, 500, { success: false, message: msg });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    });

    this.wsServer = new WebSocketServer({ noServer: true });
    this.wsServer.on('connection', (socket: WebSocket, req: http.IncomingMessage) => {
      this.handleWsConnection(socket, req);
    });

    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.boundPort}`);
      if (url.pathname === '/stadium') {
        const token = url.searchParams.get('token') || req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (this.authToken && token !== this.authToken) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        this.wsServer?.handleUpgrade(req, socket, head, (ws) => {
          this.wsServer?.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    // Try binding starting from requestedPort
    let currentPort = this.requestedPort;
    const maxPort = currentPort + 20;

    while (currentPort <= maxPort) {
      try {
        await this.listenOnPort(currentPort);
        this.boundPort = currentPort;
        break;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'EADDRINUSE') {
          currentPort++;
        } else {
          throw err;
        }
      }
    }

    if (!this.boundPort) {
      throw new Error(`Could not bind Control Plane daemon to any port between ${this.requestedPort} and ${maxPort}.`);
    }

    const record = this.getDiscoveryRecord();
    this.writeDiscoveryRecord(record);
    this.setupExitHandlers();
    this.checkIdleTimeout();

    this.log(`Control Plane daemon started on port ${this.boundPort} (PID: ${process.pid})`);
    return record;
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }

    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();

    for (const session of this.registry.getAllSessions()) {
      try {
        session.socket.close();
      } catch {}
    }

    if (this.wsServer) {
      await new Promise<void>((resolve) => {
        this.wsServer?.close(() => resolve());
      });
      this.wsServer = undefined;
    }

    if (this.httpServer && this.httpServer.listening) {
      const server = this.httpServer;
      const closed = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      // Idle keep-alive and streaming (SSE) connections would otherwise keep close() pending.
      server.closeAllConnections?.();
      await closed;
      this.httpServer = undefined;
    }

    if (this.cleanExitHandler) {
      process.off('SIGINT', this.cleanExitHandler);
      process.off('SIGTERM', this.cleanExitHandler);
      this.cleanExitHandler = undefined;
    }

    this.removeDiscoveryRecord();
    this.log('Control Plane daemon stopped.');
  }

  private listenOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.httpServer!;
      const onError = (err: Error): void => {
        server.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  }

  private initAuthToken(): void {
    const tokenPath = path.join(this.dir, 'token');
    try {
      if (fs.existsSync(tokenPath)) {
        const existing = fs.readFileSync(tokenPath, 'utf8').trim();
        if (existing) {
          this.authToken = existing;
          return;
        }
      }
    } catch {}

    this.authToken = `sideline_sec_${crypto.randomBytes(24).toString('hex')}`;
    try {
      fs.writeFileSync(tokenPath, this.authToken, { encoding: 'utf8', mode: 0o600 });
    } catch {}
  }

  private getDiscoveryRecord(): ControlPlaneDiscoveryRecord {
    return {
      protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
      port: this.boundPort,
      pid: process.pid,
      startedAt: Date.now(),
      controlPlaneUrl: `http://127.0.0.1:${this.boundPort}`,
      service: CONTROL_PLANE_SERVICE,
      instanceId: this.instanceNonce,
      buildId: this.buildId,
      daemonScriptPath: this.daemonScriptPath,
      supersedes: this.supersedes
    };
  }

  /** Self-description for the Freshness Guard handshake. Structural only; no secrets. */
  private identity(): Record<string, unknown> {
    return {
      service: CONTROL_PLANE_SERVICE,
      pid: process.pid,
      instanceId: this.instanceNonce,
      buildId: this.buildId ?? null,
      daemonScriptPath: this.daemonScriptPath,
      supersedes: this.supersedes,
      replacementReason: this.replacementReason ?? null
    };
  }

  private writeDiscoveryRecord(record: ControlPlaneDiscoveryRecord): void {
    const discoveryPath = path.join(this.dir, 'control-plane.json');
    // Atomic: a Stadium must never read a half-written manifest.
    const temp = `${discoveryPath}.${this.instanceNonce}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(temp, discoveryPath);
  }

  private removeDiscoveryRecord(): void {
    try {
      const discoveryPath = path.join(this.dir, 'control-plane.json');
      if (fs.existsSync(discoveryPath)) {
        const content = fs.readFileSync(discoveryPath, 'utf8');
        const parsed = JSON.parse(content) as { pid?: number; instanceId?: string };
        // Only ever remove our OWN manifest — a replacement may already have written its own.
        if (parsed.pid === process.pid && (!parsed.instanceId || parsed.instanceId === this.instanceNonce)) {
          fs.unlinkSync(discoveryPath);
        }
      }
    } catch {}
  }

  private loadPreferredSelection(): string | undefined {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(this.dir, 'control-plane-state.json'), 'utf8')) as { selectedGameId?: unknown };
      return typeof parsed.selectedGameId === 'string' && parsed.selectedGameId ? parsed.selectedGameId : undefined;
    } catch {
      return undefined;
    }
  }

  private persistPreferredSelection(gameId: string): void {
    if (!gameId) return;
    this.preferredSelectedGameId = gameId;
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, 'control-plane-state.json');
      const temp = `${file}.${this.instanceNonce}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ selectedGameId: gameId }, null, 2), 'utf8');
      fs.renameSync(temp, file);
    } catch {}
  }

  private cleanExitHandler: (() => void) | undefined;

  private setupExitHandlers(): void {
    if (this.cleanExitHandler) return;
    this.cleanExitHandler = (): void => {
      this.removeDiscoveryRecord();
      process.exit(0);
    };
    process.once('SIGINT', this.cleanExitHandler);
    process.once('SIGTERM', this.cleanExitHandler);
  }

  private checkIdleTimeout(): void {
    const activeSessions = this.registry.getAllSessions().filter((s) => s.socket.readyState === WebSocket.OPEN);
    if (activeSessions.length === 0) {
      if (!this.idleTimer && this.idleTimeoutMs > 0) {
        this.log(`All Stadium sessions disconnected. Starting ${this.idleTimeoutMs}ms idle shutdown timer.`);
        this.idleTimer = setTimeout(() => {
          this.log('Idle timeout expired with 0 active Stadium clients. Exiting daemon cleanly.');
          void this.stop().then(() => process.exit(0));
        }, this.idleTimeoutMs);
        this.idleTimer.unref();
      }
    } else {
      if (this.idleTimer) {
        this.log('Stadium session connected. Idle shutdown timer cancelled.');
        clearTimeout(this.idleTimer);
        this.idleTimer = undefined;
      }
    }
  }

  private log(message: string): void {
    const line = `[${new Date().toISOString()}] [ControlPlane:${process.pid}] ${message}\n`;
    try {
      const logDir = path.join(this.dir, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(path.join(logDir, 'control-plane.log'), line, 'utf8');
    } catch {}
  }

  // --- WebSocket Connection & Handshake ---

  private handleWsConnection(socket: WebSocket, req: http.IncomingMessage): void {
    let sessionInstanceId = '';

    socket.on('message', (raw: string | Buffer) => {
      try {
        const text = raw.toString('utf8');
        const message = JSON.parse(text) as unknown;

        if (isJsonRpcRequest(message)) {
          this.handleWsRequest(socket, message, sessionInstanceId, (newId) => {
            sessionInstanceId = newId;
          });
        } else if (isJsonRpcNotification(message)) {
          this.handleWsNotification(socket, message, sessionInstanceId);
        } else if (isJsonRpcResponse(message) || isJsonRpcError(message)) {
          const pending = this.pendingRpcRequests.get(message.id as string | number);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRpcRequests.delete(message.id as string | number);
            if (isJsonRpcResponse(message)) {
              pending.resolve(message.result);
            } else {
              pending.reject(new Error(message.error.message));
            }
          }
        }
      } catch (err) {
        this.log(`WS frame parsing error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    socket.on('close', () => {
      if (sessionInstanceId) {
        this.log(`Stadium session disconnected: ${sessionInstanceId}`);
        this.registry.removeSession(sessionInstanceId);
      }
      this.checkIdleTimeout();
    });

    socket.on('error', (err) => {
      this.log(`WS socket error (${sessionInstanceId}): ${err.message}`);
    });
  }

  private handleWsRequest(
    socket: WebSocket,
    req: { id: string | number; method: string; params: unknown },
    currentInstanceId: string,
    setInstanceId: (id: string) => void
  ): void {
    if (req.method === 'stadium.hello') {
      const params = req.params as StadiumHelloParams;
      if (this.authToken && params.token !== this.authToken) {
        socket.send(JSON.stringify(buildRpcError(req.id, 401, 'Unauthorized: Invalid token.')));
        socket.close();
        return;
      }

      setInstanceId(params.instanceId);

      const session: StadiumSession = {
        instanceId: params.instanceId,
        stadiumId: params.stadiumId,
        name: params.name,
        platform: params.platform,
        socket,
        lastHeartbeat: Date.now(),
        game: params.game,
        rootFsPath: params.rootFsPath,
        roster: [],
        capabilities: [],
        reports: [],
        rosterSynchronized: false,
        rosterSyncedAt: 0,
        controlPlaneBuildId: typeof params.controlPlaneBuildId === 'string' ? params.controlPlaneBuildId : undefined,
        controlPlaneFreshness: params.controlPlaneFreshness
      };

      this.registry.registerSession(session);
      this.log(`Registered Stadium session: ${params.instanceId} (${params.name} on ${params.platform})`);

      socket.send(
        JSON.stringify(
          buildRpcResponse(req.id, {
            protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
            controlPlaneId: `cp_${process.pid}_${this.boundPort}`,
            heartbeatIntervalMs: 10000
          })
        )
      );
      this.checkIdleTimeout();
      return;
    }

    socket.send(JSON.stringify(buildRpcError(req.id, -32601, `Method '${req.method}' not found.`)));
  }

  private handleWsNotification(
    socket: WebSocket,
    notif: { method: string; params: unknown },
    sessionInstanceId: string
  ): void {
    const params = notif.params as Record<string, unknown>;

    switch (notif.method) {
      case 'stadium.heartbeat': {
        const p = params as unknown as StadiumHeartbeatParams;
        this.registry.updateHeartbeat(p.instanceId, p.timestamp);
        break;
      }
      case 'game.connected': {
        const p = params as unknown as GameConnectedParams;
        this.registry.setGame(p.instanceId, p.game, p.rootFsPath);
        this.log(`Stadium session ${p.instanceId} bound to Game: ${p.game.displayName} (${p.game.gameId})`);
        break;
      }
      case 'game.disconnected': {
        const p = params as unknown as GameDisconnectedParams;
        this.registry.removeGame(p.instanceId, p.gameId);
        break;
      }
      case 'roster.snapshot':
      case 'roster.changed': {
        const p = params as unknown as RosterSnapshotParams;
        this.registry.updateRoster(p.instanceId, p.roster);
        break;
      }
      case 'capability.snapshot':
      case 'capability.changed': {
        const p = params as unknown as CapabilitySnapshotParams;
        this.registry.updateCapabilities(p.instanceId, p.capabilities);
        break;
      }
      case 'player.discovery.snapshot':
      case 'player.discovery.changed': {
        const p = params as unknown as PlayerDiscoverySnapshotParams;
        const session = this.registry.getSession(sessionInstanceId);
        if (!session || p.instanceId !== sessionInstanceId || session.game?.gameId !== p.gameId) break;
        this.discoveryByGame.set(p.gameId, p.discovery);
        this.broadcastStatus();
        break;
      }
      case 'report.snapshot':
      case 'report.changed': {
        const p = params as unknown as ReportSnapshotParams;
        this.registry.updateReports(p.instanceId, p.reports);
        break;
      }
      case 'turn.changed': {
        const p = params as unknown as TurnChangedParams;
        const session = this.registry.getSession(sessionInstanceId);
        const gameId = session?.game?.gameId ?? p.gameId;
        if (gameId) this.ledger.recordTurn(gameId, (p.turn ?? {}) as TurnRecord);
        this.broadcast('turn', p.turn);
        break;
      }
      case 'dispatch.accepted': {
        const p = params as unknown as DispatchAcceptedParams;
        this.router.handleDispatchAccepted(p);
        break;
      }
      case 'dispatch.rejected': {
        const p = params as unknown as DispatchRejectedParams;
        this.router.handleDispatchRejected(p);
        break;
      }
      default:
        this.log(`Unknown WS notification method: ${notif.method}`);
        break;
    }
  }

  // --- HTTP Request Routing ---

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${this.boundPort}`);

    this.setCorsHeaders(res);

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check requires no token
    if (method === 'GET' && requestUrl.pathname === '/api/health') {
      this.sendJson(res, 200, {
        status: 'ok',
        pid: process.pid,
        uptime: process.uptime(),
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
        ...this.identity()
      });
      return;
    }

    // Freshness Guard: an authenticated replacement asks THIS exact instance to step down.
    if (method === 'POST' && requestUrl.pathname === '/api/control-plane/shutdown') {
      if (!this.isAuthorized(req, requestUrl)) {
        this.sendJson(res, 401, { success: false, message: 'Unauthorized' });
        return;
      }
      const body = (await this.readJsonBody(req)) as { instanceId?: unknown; reason?: unknown };
      if (body.instanceId !== this.instanceNonce) {
        this.sendJson(res, 409, { success: false, message: 'That shutdown request names a different Control Plane instance.' });
        return;
      }
      this.log(`Owner-verified shutdown requested (${typeof body.reason === 'string' ? body.reason : 'no reason'}).`);
      this.sendJson(res, 200, { success: true, instanceId: this.instanceNonce });
      setImmediate(() => {
        if (this.exitOnShutdown) {
          // A superseded daemon must actually leave: lingering keep-alive or SSE
          // sockets can hold a graceful close open indefinitely (seen live in P0.1).
          setTimeout(() => process.exit(0), 3_000).unref();
        }
        void this.stop().then(() => { if (this.exitOnShutdown) process.exit(0); });
      });
      return;
    }

    // UI serving
    if (method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
      await this.serveIndex(res);
      return;
    }

    if (!requestUrl.pathname.startsWith('/api/')) {
      this.sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    // Auth check
    if (!this.isAuthorized(req, requestUrl)) {
      this.sendJson(res, 401, { success: false, message: 'Unauthorized' });
      return;
    }

    // SSE Events
    if (method === 'GET' && requestUrl.pathname === '/api/events') {
      this.handleSseConnection(req, res);
      return;
    }

    // Status
    if (method === 'GET' && requestUrl.pathname === '/api/status') {
      this.sendJson(res, 200, this.buildStatus());
      return;
    }

    // Player-plumbing diagnostics. Bounded, structural facts only: no prompts,
    // no provider credentials, no report or conversation content. Exists so that
    // "terminal alive but browser shows 0 Players" can be localized in one snapshot.
    if (method === 'GET' && requestUrl.pathname === '/api/diagnostics') {
      this.sendJson(res, 200, this.buildDiagnostics());
      return;
    }

    // Games
    if (method === 'GET' && requestUrl.pathname === '/api/games') {
      const selectedGameId = this.registry.getSelectedGameId();
      const games = this.registry.getGames();
      this.sendJson(res, 200, {
        success: true,
        selectedGameId,
        games
      });
      return;
    }

    // Game select
    if (method === 'POST' && requestUrl.pathname === '/api/game/select') {
      const body = (await this.readJsonBody(req)) as { gameId?: string };
      const targetGameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!targetGameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId in request body.' });
        return;
      }
      const success = this.registry.setSelectedGameId(targetGameId);
      if (!success) {
        this.sendJson(res, 404, { success: false, message: `Game '${targetGameId}' is not found in registry.` });
        return;
      }
      this.broadcast('status', { type: 'game-select', gameId: targetGameId, at: Date.now() });
      this.sendJson(res, 200, { success: true, selectedGameId: targetGameId });
      return;
    }

    // Dispatch
    if (method === 'POST' && requestUrl.pathname === '/api/dispatch') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const result = await this.router.dispatch({
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        gameId: typeof body.gameId === 'string' ? body.gameId : undefined,
        stadiumId: typeof body.stadiumId === 'string' ? body.stadiumId : undefined,
        playerInstanceId: typeof body.playerInstanceId === 'string' ? body.playerInstanceId : undefined,
        terminalName: typeof body.terminalName === 'string' ? body.terminalName : undefined,
        routingMode: body.routingMode === 'manual' ? 'manual' : 'auto',
        model: typeof body.model === 'string' ? body.model : undefined,
        effort: typeof body.effort === 'string' ? body.effort : undefined,
        modelSwitch: typeof body.modelSwitch === 'string' ? body.modelSwitch : undefined
      });

      this.sendJson(res, result.statusCode, result);
      return;
    }

    // Reports list
    if (method === 'GET' && requestUrl.pathname === '/api/reports') {
      // A client may name its Game explicitly; reports are only ever read from that
      // Game's own authoritative Stadium, so a Game never sees another Game's reports.
      const gameId = requestUrl.searchParams.get('gameId') || this.registry.getSelectedGameId();
      const reports = this.registry.getReportsForGame(gameId);
      this.sendJson(res, 200, reports);
      return;
    }

    // Refresh Incoming — recovery only. Asks the Game's own Stadium for a canonical
    // rescan; normal reports arrive through the Stadium's report watcher.
    if (method === 'POST' && requestUrl.pathname === '/api/reports/rescan') {
      const body = (await this.readJsonBody(req)) as { gameId?: unknown };
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId();
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, message: auth.error || "That Game isn't connected, so Coach can't check its reports." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'report.rescan', {})) as { success?: boolean; count?: number; message?: string };
        if (!result?.success) {
          this.sendJson(res, 502, { success: false, message: result?.message || "Coach couldn't check this Game's reports." });
          return;
        }
        const count = typeof result.count === 'number' ? result.count : 0;
        this.sendJson(res, 200, { success: true, gameId, count, message: count ? `Incoming refreshed · ${count} report${count === 1 ? '' : 's'}` : 'Incoming refreshed · no reports found for this Game' });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach couldn't check this Game's reports. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // Single report
    if (method === 'GET' && requestUrl.pathname === '/api/report') {
      const reportPath = requestUrl.searchParams.get('path');
      const selectedGameId = this.registry.getSelectedGameId();
      const reports = this.registry.getReportsForGame(selectedGameId) as Array<{ path: string }>;
      const found = reports.find((r) => r.path === reportPath);
      if (!found) {
        this.sendJson(res, 404, { success: false, message: 'Report not found' });
        return;
      }
      this.sendJson(res, 200, found);
      return;
    }

    // Player action forwarders: /api/players/:playerId/field, /instances, /controlled-instances
    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/')) {
      const parts = requestUrl.pathname.split('/');
      // [' ', 'api', 'players', ':playerId', 'action']
      if (parts.length === 5) {
        const playerId = parts[3];
        const actionType = parts[4];
        let action: 'field' | 'instance' | 'controlled' | undefined;
        if (actionType === 'field') action = 'field';
        else if (actionType === 'instances') action = 'instance';
        else if (actionType === 'controlled-instances') action = 'controlled';

        if (action) {
          const selectedGameId = this.registry.getSelectedGameId();
          const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
          if (auth.status !== 'connected' || !auth.session) {
            this.sendJson(res, 400, { success: false, message: auth.error || 'Game is offline.' });
            return;
          }

          try {
            const result = (await this.sendRpcToStadium(auth.session, 'player.action', {
              action,
              playerId,
              gameId: selectedGameId
            })) as PlayerActionResult;
            this.sendJson(res, result.success ? 200 : 400, result);
            return;
          } catch (err) {
            this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
            return;
          }
        }
      }
    }

    // Routing mode / manual selection
    if (method === 'POST' && requestUrl.pathname === '/api/route') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      if (body.mode === 'auto' || body.mode === 'manual') {
        this.routingMode = body.mode;
      }
      if (body.playerInstanceId !== undefined || body.model !== undefined || body.effort !== undefined) {
        this.manualSelection = {
          playerInstanceId: typeof body.playerInstanceId === 'string' ? body.playerInstanceId : this.manualSelection?.playerInstanceId,
          model: typeof body.model === 'string' ? body.model : body.model === null ? undefined : this.manualSelection?.model,
          effort: typeof body.effort === 'string' ? body.effort : body.effort === null ? undefined : this.manualSelection?.effort
        };
      }
      this.broadcast('status', { type: 'routing-change', at: Date.now() });
      this.sendJson(res, 200, {
        success: true,
        routing: { mode: this.routingMode, manualSelection: this.manualSelection }
      });
      return;
    }

    // AUTO route preview for the prompt currently being typed
    if (method === 'POST' && requestUrl.pathname === '/api/route/preview') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const previewGameId = this.registry.getSelectedGameId();
      const previewGame = this.registry.getGames().find((g) => g.gameId === previewGameId);
      const previewAuth = this.registry.getAuthoritativeSessionForGame(previewGameId);
      const previewCapabilities = this.registry.getCapabilitiesForGame(previewGameId) as PlayerRoutingCapability[];
      const routing = this.buildRouting(
        previewGameId,
        previewGame?.displayName,
        previewAuth.status,
        this.registry.isRosterSynchronizedForGame(previewGameId),
        previewCapabilities,
        prompt
      );
      if (routing.activeDecision) {
        this.sendJson(res, 200, { success: true, decision: routing.activeDecision });
      } else {
        this.sendJson(res, 200, { success: false, error: routing.autoError });
      }
      return;
    }

    // Add Game — one human action, complete lifecycle.
    //
    // The Control Plane coordinates and decides; the Stadium executes the two
    // environment-specific mechanics (the native picker, and opening a window).
    // The browser only expresses intent, because it has no Stadium of its own
    // and cannot safely enumerate local paths.
    if (method === 'POST' && requestUrl.pathname === '/api/game/add') {
      await this.handleAddGame(res);
      return;
    }

    // Exit / Archive. A registry operation only: no repository is ever touched.
    if (method === 'POST' && requestUrl.pathname === '/api/game/archive') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId : this.registry.getSelectedGameId();
      const known = this.registry.getKnownGame(gameId);
      if (!known) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const archived = this.registry.archiveGame(gameId);
      this.broadcastStatus();
      this.sendJson(res, archived ? 200 : 400, {
        success: archived,
        message: archived
          ? `${known.displayName} was archived. Its repository was not changed.`
          : `${known.displayName} is already archived.`,
        selectedGameId: this.registry.getSelectedGameId()
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/game/restore') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId : '';
      const restored = this.registry.restoreGame(gameId);
      if (restored) this.broadcastStatus();
      this.sendJson(res, restored ? 200 : 404, {
        success: restored,
        message: restored ? 'Game restored to the active Sideline.' : 'That Game is not archived.'
      });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/archived') {
      this.sendJson(res, 200, { success: true, games: this.registry.getArchivedGames() });
      return;
    }

    // --- Player lifecycle -------------------------------------------------
    if (method === 'POST' && requestUrl.pathname === '/api/players/discover') {
      await this.forwardPlayerLifecycle(res, 'player.discover', {});
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/add') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const playerType = typeof body.playerType === 'string' ? body.playerType : '';
      if (playerType === 'terminal') {
        await this.forwardPlayerLifecycle(res, 'player.addTerminal', {});
        return;
      }
      // Provider Players keep their existing certified/direct entry points so
      // Q2.9 adds a surface without changing how a provider Player is started.
      const controlled = body.controlled !== false;
      const runningPlayers = this.getPreferences().runningPlayers;
      // "Ignore running Players" is the human saying duplicates are fine.
      const allowDuplicate = body.allowDuplicate === true || runningPlayers === 'ignore';
      await this.forwardPlayerAction(res, controlled ? 'controlled' : 'instance', playerType, { allowDuplicate });
      return;
    }

    // Running Players preference (and future Settings). Human-owned, never inferred.
    if (requestUrl.pathname === '/api/preferences') {
      if (method === 'GET') {
        this.sendJson(res, 200, { success: true, preferences: this.getPreferences() });
        return;
      }
      if (method === 'POST') {
        const body = (await this.readJsonBody(req)) as Record<string, unknown>;
        const runningPlayers = body.runningPlayers;
        if (!isRunningPlayersPreference(runningPlayers)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Ask me, Automatically add, or Ignore.' });
          return;
        }
        const preferences = this.savePreferences({ ...this.getPreferences(), runningPlayers });
        this.broadcastStatus();
        this.sendJson(res, 200, { success: true, preferences, message: RUNNING_PLAYERS_SAVED[runningPlayers] });
        return;
      }
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/adopt') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.adopt', { shellPid: Number(body.shellPid) });
      return;
    }

    // Deliberate adoption of one open human terminal as a Terminal Player (never automatic).
    if (method === 'POST' && requestUrl.pathname === '/api/players/adopt-terminal') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.adoptTerminal', { shellPid: Number(body.shellPid) });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/players/helper-terminal') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      await this.forwardPlayerLifecycle(res, 'player.helperTerminal', {
        playerType: typeof body.playerType === 'string' ? body.playerType : '',
        purpose: body.purpose === 'authenticate' ? 'authenticate' : 'install'
      });
      return;
    }

    // /api/players/instance/:instanceId/{field|bench|remove|send}
    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/instance/')) {
      const parts = requestUrl.pathname.split('/');
      if (parts.length === 6) {
        const instanceId = decodeURIComponent(parts[4]);
        const verb = parts[5];
        if (verb === 'field') {
          await this.forwardPlayerLifecycle(res, 'player.putOnField', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'bench') {
          await this.forwardPlayerLifecycle(res, 'player.takeOffField', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'remove') {
          await this.forwardPlayerLifecycle(res, 'player.remove', { playerInstanceId: instanceId });
          return;
        }
        if (verb === 'send') {
          const body = (await this.readJsonBody(req)) as Record<string, unknown>;
          await this.forwardPlayerLifecycle(res, 'player.terminalSend', {
            playerInstanceId: instanceId,
            text: typeof body.text === 'string' ? body.text : '',
            enter: body.enter !== false
          });
          return;
        }
      }
    }

    // Refresh capabilities
    if (method === 'POST' && requestUrl.pathname === '/api/capabilities/refresh') {
      const selectedGameId = this.registry.getSelectedGameId();
      const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 400, { success: false, message: auth.error || 'Game is offline.' });
        return;
      }

      try {
        const result = await this.sendRpcToStadium(auth.session, 'capability.refresh', {
          gameId: selectedGameId
        });
        this.sendJson(res, 200, { success: true, result });
        return;
      } catch (err) {
        this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
        return;
      }
    }

    this.sendJson(res, 404, { success: false, message: `Unknown endpoint: ${requestUrl.pathname}` });
  }

  /**
   * Pick a Stadium that can perform a UI-bearing mechanic for us.
   *
   * Preference order matters: the selected Game's own window first, so a picker
   * or a new window appears where the human is already looking.
   */
  private pickHostSession(): StadiumSession | undefined {
    const selected = this.registry.getAuthoritativeSessionForGame(this.registry.getSelectedGameId());
    if (selected.session) return selected.session;
    return this.registry.getAllSessions().find((candidate) => candidate.socket.readyState === 1);
  }

  private async handleAddGame(res: http.ServerResponse): Promise<void> {
    const host = this.pickHostSession();
    if (!host) {
      this.sendJson(res, 400, {
        success: false,
        message: 'No Game window is connected yet, so Coach has nowhere to show the repository picker. Open a Game first.'
      });
      return;
    }

    let picked: GamePickResult;
    try {
      picked = (await this.sendRpcToStadium(host, 'game.pick', {})) as GamePickResult;
    } catch (err) {
      this.sendJson(res, 500, {
        success: false,
        message: `Coach could not open the repository picker. ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    if (picked?.cancelled) {
      this.sendJson(res, 200, { success: true, status: 'cancelled', message: 'No repository chosen.' });
      return;
    }
    if (!picked?.success || !picked.game || !picked.folderPath) {
      this.sendJson(res, 400, {
        success: false,
        status: 'unresolved',
        message: picked?.message ?? 'Coach could not identify a Game in that folder.'
      });
      return;
    }

    // Register before deciding, so an Offline or Opening Game is a Game Coach knows.
    this.registry.recordKnownGameFromPicker(picked.game, picked.folderPath);

    const decision = decideAddGame({
      gameId: picked.game.gameId,
      folderPath: picked.folderPath,
      state: this.registry.getGameState(picked.game.gameId)
    });

    switch (decision.kind) {
      case 'select-existing': {
        this.registry.setSelectedGameId(decision.gameId);
        this.broadcastStatus();
        this.sendJson(res, 200, {
          success: true,
          status: 'connected',
          gameId: decision.gameId,
          message: `${picked.game.displayName} is already connected. Coach switched to it.`
        });
        return;
      }
      case 'already-opening': {
        this.sendJson(res, 200, {
          success: true,
          status: 'opening',
          gameId: decision.gameId,
          message: `${picked.game.displayName} is already opening…`
        });
        return;
      }
      case 'conflicted': {
        this.sendJson(res, 409, { success: false, status: 'conflicted', gameId: decision.gameId, message: decision.message });
        return;
      }
      case 'unresolved': {
        this.sendJson(res, 400, { success: false, status: 'unresolved', message: decision.message });
        return;
      }
      default:
        break;
    }

    this.registry.markOpening(decision.gameId);
    this.registry.setSelectedGameId(decision.gameId);
    this.broadcastStatus();

    let opened: GameOpenResult;
    try {
      opened = (await this.sendRpcToStadium(host, 'game.open', {
        gameId: decision.gameId,
        folderPath: decision.folderPath,
        displayName: picked.game.displayName
      })) as GameOpenResult;
    } catch (err) {
      this.registry.clearOpening(decision.gameId);
      this.broadcastStatus();
      this.sendJson(res, 500, {
        success: false,
        status: 'failed',
        message: `Coach could not open this Game. ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    if (!opened?.success) {
      this.registry.clearOpening(decision.gameId);
      this.broadcastStatus();
      this.sendJson(res, 400, {
        success: false,
        status: 'failed',
        gameId: decision.gameId,
        message: opened?.message ?? 'Coach could not open this Game.'
      });
      return;
    }

    this.log(`Add Game: opening ${picked.game.displayName} (${decision.gameId}) from ${decision.folderPath}`);
    this.sendJson(res, 200, {
      success: true,
      status: 'opening',
      gameId: decision.gameId,
      message: opened.message ?? `Opening ${picked.game.displayName}…`
    });
  }

  /** Forward a Player lifecycle RPC to the selected Game's authoritative window. */
  private readonly discoveryByGame = new Map<string, unknown>();
  private preferencesCache: CoachPreferences | undefined;

  private getPreferences(): CoachPreferences {
    if (!this.preferencesCache) this.preferencesCache = loadPreferences(path.join(this.dir, 'preferences.json'));
    return this.preferencesCache;
  }

  private savePreferences(next: CoachPreferences): CoachPreferences {
    savePreferences(path.join(this.dir, 'preferences.json'), next);
    this.preferencesCache = next;
    return next;
  }

  private async forwardPlayerLifecycle(
    res: http.ServerResponse,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const selectedGameId = this.registry.getSelectedGameId();
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 400, { success: false, message: auth.error || 'That Game is not connected.' });
      return;
    }

    try {
      // gameId travels with every action so a Player can never be created,
      // benched or removed in a Game other than the selected one.
      const result = (await this.sendRpcToStadium(auth.session, method, {
        ...params,
        gameId: selectedGameId
      })) as PlayerLifecycleResult;
      // Cached per Game: a Player installed on one Stadium says nothing about another.
      // Any lifecycle action that changed discovery truth (a scan, an adoption, the
      // removal of an adopted Player) returns the Stadium's reconciled discovery, so
      // Recruit and Roster converge in one broadcast instead of contradicting.
      if (result?.success && result.discovery) {
        this.discoveryByGame.set(selectedGameId, result.discovery);
      }

      // "Automatically add to my Roster": adopt every running Player found in this
      // Game. Adoption keeps ownership `adopted`, so removal never destroys the
      // human's own process. Players running elsewhere are never adopted.
      let finalResult = result;
      if (method === 'player.discover' && result?.success && this.getPreferences().runningPlayers === 'auto-add') {
        const candidates = (result.discovery as { externalCandidates?: Array<{ shellPid: number; displayName: string }> } | undefined)?.externalCandidates ?? [];
        const added: string[] = [];
        for (const candidate of candidates) {
          const adopted = (await this.sendRpcToStadium(auth.session, 'player.adopt', { shellPid: candidate.shellPid, gameId: selectedGameId })) as PlayerLifecycleResult;
          if (adopted?.success) {
            added.push(candidate.displayName);
            if (adopted.discovery) this.discoveryByGame.set(selectedGameId, adopted.discovery);
          }
        }
        if (added.length) {
          finalResult = {
            ...result,
            discovery: this.discoveryByGame.get(selectedGameId),
            autoAdded: added,
            message: `Added ${added.join(', ')} to your Roster from ${added.length === 1 ? 'its' : 'their'} running terminal${added.length === 1 ? '' : 's'}.`
          };
        }
      }

      if (finalResult?.success) this.broadcastStatus();
      this.sendJson(res, finalResult?.success === false ? 400 : 200, finalResult ?? { success: false, message: 'No result.' });
    } catch (err) {
      this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  private async forwardPlayerAction(
    res: http.ServerResponse,
    action: 'field' | 'instance' | 'controlled',
    playerId: string,
    options: { allowDuplicate?: boolean } = {}
  ): Promise<void> {
    const selectedGameId = this.registry.getSelectedGameId();
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 400, { success: false, message: auth.error || 'That Game is not connected.' });
      return;
    }
    try {
      let result = (await this.sendRpcToStadium(auth.session, 'player.action', {
        action,
        playerId,
        gameId: selectedGameId,
        allowDuplicate: options.allowDuplicate === true
      })) as PlayerActionResult;

      // The Stadium's duplicate guard scanned afresh; keep Recruit truthful either way.
      if (result?.discovery) this.discoveryByGame.set(selectedGameId, result.discovery);

      // Same process already running in this Game + "Automatically add": adopt it
      // rather than starting a second copy. Ownership stays `adopted`.
      const candidate = result?.candidate as { shellPid?: number } | undefined;
      if (result?.code === 'running-in-game' && candidate?.shellPid && this.getPreferences().runningPlayers === 'auto-add') {
        const adopted = (await this.sendRpcToStadium(auth.session, 'player.adopt', { shellPid: candidate.shellPid, gameId: selectedGameId })) as PlayerLifecycleResult;
        if (adopted?.discovery) this.discoveryByGame.set(selectedGameId, adopted.discovery);
        result = adopted as PlayerActionResult;
      }

      if (result?.success || result?.discovery) this.broadcastStatus();
      // A duplicate refusal is a conflict the human resolves, not a server fault.
      const duplicate = result?.code === 'running-in-game' || result?.code === 'running-elsewhere';
      this.sendJson(res, result.success ? 200 : duplicate ? 409 : 400, result);
    } catch (err) {
      this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Push a fresh status to every browser so no manual refresh is ever needed. */
  private broadcastStatus(): void {
    this.broadcast('status', this.buildStatus());
  }

  private sendRpcToStadium(session: StadiumSession, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRpcId++;
      const timer = setTimeout(() => {
        this.pendingRpcRequests.delete(id);
        reject(new Error(`RPC request '${method}' to Stadium timed out.`));
      }, 5000);

      this.pendingRpcRequests.set(id, { resolve, reject, timer });
      const req = buildRpcRequest(id, method, params);
      try {
        session.socket.send(JSON.stringify(req));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRpcRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleSseConnection(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.sseClients.add(res);

    // Initial sync. `hello` drives the browser's reconnect-convergence path.
    res.write(`event: hello\ndata: ${JSON.stringify({ connected: true, at: Date.now() })}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify(this.buildStatus())}\n\n`);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Projects Control Plane truth into the status contract the browser consumes.
   *
   * The field names here are load-bearing: `players` and `routing` are the
   * field-proven Q2.6 contract that src/public/index.html parses. Renaming them
   * silently blanks the roster and the Target Player list even while the
   * upstream Stadium roster is perfectly healthy, so they must not drift.
   */
  private buildStatus(): Record<string, unknown> {
    // A window that never activated must decay to Offline rather than spin forever.
    this.registry.expireStaleOpenings();
    const selectedGameId = this.registry.getSelectedGameId();
    const games = this.registry.getGames();
    const selectedGame = games.find((g) => g.gameId === selectedGameId);
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);

    const players = this.registry.getRosterForGame(selectedGameId);
    const discoveryCatalog = ((this.discoveryByGame.get(selectedGameId) as { catalog?: Array<{ playerType: string; controls?: ProviderControlProfile }> } | undefined)?.catalog) ?? [];
    // One control answer per EXACT instance, whatever the provider or transport:
    // live Controlled capability > provider discovery > Unknown (absent).
    const workLedger = this.ledger.forGame(selectedGameId);
    const capabilities = (this.registry.getCapabilitiesForGame(selectedGameId) as PlayerRoutingCapability[]).map((capability) => {
      const controls = projectInstanceControls(capability, discoveryCatalog.find((entry) => entry.playerType === capability.playerType)?.controls);
      // Activity of this EXACT instance, beside its eligibility. Unknown when unrecorded.
      const entry = workLedger.find((candidate) => candidate.playerInstanceId === capability.instanceId);
      const work = { workState: entry?.workState ?? 'unknown', currentPlay: entry?.currentPlay, lastPlay: entry?.recentPlays[0] };
      return { ...capability, ...(controls ? { controls } : {}), work };
    });
    const reports = this.registry.getReportsForGame(selectedGameId);
    const rosterSynchronized = this.registry.isRosterSynchronizedForGame(selectedGameId);

    const routing = this.buildRouting(selectedGameId, selectedGame?.displayName, auth.status, rosterSynchronized, capabilities, '');

    return {
      success: true,
      connected: auth.status === 'connected',
      connectionStatus: selectedGame?.connectionStatus || auth.status,
      selectedGameId,
      game: selectedGame
        ? {
            gameId: selectedGame.gameId,
            displayName: selectedGame.displayName,
            fingerprintSource: selectedGame.fingerprintSource,
            repoUri: selectedGame.repoUri
          }
        : { gameId: 'unknown', displayName: 'None', fingerprintSource: 'unknown' },
      activeProject: selectedGame?.displayName ?? 'No Game',
      workspaceRoots: auth.session?.rootFsPath ? [path.basename(auth.session.rootFsPath)] : [],
      stadium: auth.session
        ? {
            stadiumId: auth.session.stadiumId,
            name: auth.session.name,
            platform: auth.session.platform,
            stadiumType: 'vscode-desktop'
          }
        : {
            stadiumId: 'none',
            name: 'Local Control Plane',
            platform: process.platform,
            stadiumType: 'standalone'
          },
      games,
      players,
      roster: players,
      rosterSynchronized,
      capabilities,
      workLedger,
      routing,
      routingMode: this.routingMode,
      reports: reports.slice(0, 10),
      // Always present in the contract: null means "not checked yet", which is
      // different from an empty catalog and must not be collapsed into it.
      playerDiscovery: projectDiscovery(
        this.discoveryByGame.get(selectedGameId) as { externalCandidates?: unknown[]; runningElsewhere?: unknown[] } | undefined,
        this.getPreferences().runningPlayers
      ),
      preferences: this.getPreferences(),
      at: Date.now()
    };
  }

  /** Single source of AUTO-routing projection, shared by /api/status and /api/route/preview. */
  private buildRouting(
    selectedGameId: string,
    displayName: string | undefined,
    connectionStatus: string,
    rosterSynchronized: boolean,
    capabilities: readonly PlayerRoutingCapability[],
    prompt: string
  ): Record<string, unknown> {
    let activeDecision: RoutingDecision | undefined;
    let autoError: string | undefined;

    if (connectionStatus !== 'connected') {
      autoError = `Game '${displayName ?? selectedGameId}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`;
    } else if (!rosterSynchronized) {
      // Not-yet-synchronized is explicitly NOT an authoritative empty roster.
      autoError = 'Roster is still synchronizing with the Stadium…';
    } else {
      const result = computeAutoRoute(selectedGameId, prompt, capabilities, this.policies);
      if (result.decision) {
        activeDecision = result.decision;
      } else {
        autoError = result.error;
      }
    }

    return {
      mode: this.routingMode,
      activeDecision,
      autoError,
      capabilities,
      manualSelection: this.manualSelection
    };
  }

  /** Structural Player-plumbing facts for field triage. Never includes content or secrets. */
  private buildDiagnostics(): Record<string, unknown> {
    const selectedGameId = this.registry.getSelectedGameId();
    return {
      controlPlane: {
        pid: process.pid,
        port: this.boundPort,
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        routingMode: this.routingMode,
        // Freshness Guard (Advanced only; never in Dad Mode).
        buildId: this.buildId ?? 'unknown',
        instanceId: this.instanceNonce,
        supersedes: this.supersedes,
        replacementReason: this.replacementReason ?? null
      },
      selectedGameId,
      selectedGameRosterCount: countRosterInstances(this.registry.getRosterForGame(selectedGameId)),
      selectedGameCapabilityCount: this.registry.getCapabilitiesForGame(selectedGameId).length,
      selectedGameRosterSynchronized: this.registry.isRosterSynchronizedForGame(selectedGameId),
      sessions: this.registry.getAllSessions().map((session) => ({
        instanceId: session.instanceId,
        stadiumId: session.stadiumId,
        platform: session.platform,
        socketOpen: session.socket.readyState === 1,
        gameId: session.game?.gameId ?? null,
        rosterSynchronized: session.rosterSynchronized,
        rosterSyncedAt: session.rosterSyncedAt || null,
        rosterGroupCount: Array.isArray(session.roster) ? session.roster.length : 0,
        rosterInstanceCount: countRosterInstances(session.roster),
        rosterInstanceIds: rosterInstanceIds(session.roster),
        capabilityCount: Array.isArray(session.capabilities) ? session.capabilities.length : 0,
        capabilityInstanceIds: (Array.isArray(session.capabilities) ? session.capabilities : [])
          .map((entry) => (entry as { instanceId?: unknown }).instanceId)
          .filter((id): id is string => typeof id === 'string'),
        reportCount: Array.isArray(session.reports) ? session.reports.length : 0,
        lastHeartbeat: session.lastHeartbeat,
        expectedControlPlaneBuildId: session.controlPlaneBuildId ?? 'unknown',
        controlPlaneCompatibility: !session.controlPlaneBuildId || !this.buildId
          ? 'unknown'
          : session.controlPlaneBuildId === this.buildId ? 'current' : 'stadium-outdated',
        launcherFreshness: session.controlPlaneFreshness ?? null
      })),
      at: Date.now()
    };
  }

  private isAuthorized(req: http.IncomingMessage, url: URL): boolean {
    if (!this.authToken) return true;
    const token = url.searchParams.get('token') || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    return token === this.authToken;
  }

  private async serveIndex(res: http.ServerResponse): Promise<void> {
    const candidates = [
      path.resolve(__dirname, '..', 'public', 'index.html'),
      path.resolve(__dirname, '..', '..', 'src', 'public', 'index.html'),
      path.resolve(process.cwd(), 'src', 'public', 'index.html')
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
          return;
        } catch {}
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('index.html not found.');
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    if (res.headersSent) return;
    this.setCorsHeaders(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
        if (data.length > 1000000) {
          req.destroy();
          reject(new Error('Payload too large.'));
        }
      });
      req.on('end', () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }
}

function rosterInstanceIds(roster: unknown): string[] {
  if (!Array.isArray(roster)) return [];
  const ids: string[] = [];
  for (const group of roster) {
    const instances = (group as { instances?: unknown }).instances;
    if (!Array.isArray(instances)) continue;
    for (const instance of instances) {
      const id = (instance as { instanceId?: unknown }).instanceId;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

function countRosterInstances(roster: unknown): number {
  return rosterInstanceIds(roster).length;
}

// Allow direct execution: `node daemon.js`
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: DaemonOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[++i], 10);
    } else if (args[i] === '--dir' && args[i + 1]) {
      options.dir = args[++i];
    } else if (args[i] === '--idle-timeout-ms' && args[i + 1]) {
      options.idleTimeoutMs = parseInt(args[++i], 10);
    }
  }

  // A detached daemon exits after an owner-verified replacement shutdown.
  options.exitOnShutdown = true;
  const daemon = new ControlPlaneDaemon(options);
  daemon.start().catch((err: unknown) => {
    console.error('Failed to start Control Plane daemon:', err);
    process.exit(1);
  });
}
