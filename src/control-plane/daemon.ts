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
  type ReportSnapshotParams,
  type TurnChangedParams,
  type DispatchAcceptedParams,
  type DispatchRejectedParams,
  type PlayerActionResult
} from './protocol';
import { StadiumRegistry, type StadiumSession } from './stadium-registry';
import { ControlPlaneRouter } from './router';
import { computeAutoRoute, CodexRoutingPolicy, type ProviderRoutingPolicy } from '../routing-policy';
import type { PlayerRoutingCapability, RoutingDecision, RoutingMode } from '../capability-types';

export interface ManualRoutingSelection {
  playerInstanceId?: string;
  model?: string;
  effort?: string;
}

export interface DaemonOptions {
  port?: number;
  dir?: string;
  idleTimeoutMs?: number;
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
  private readonly policies = new Map<string, ProviderRoutingPolicy>([['codex', new CodexRoutingPolicy()]]);

  constructor(options: DaemonOptions = {}) {
    this.dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    this.requestedPort = options.port ?? (process.env.SIDELINE_PORT ? parseInt(process.env.SIDELINE_PORT, 10) : 3100);
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;

    this.registry = new StadiumRegistry();
    this.router = new ControlPlaneRouter(this.registry);

    // Forward status updates to SSE clients
    this.router.on('status-update', (payload) => {
      this.broadcast('turn', payload);
      this.broadcast('status', { type: 'turn-update', ...payload });
    });

    this.registry.on('change', (event) => {
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
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
      });
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
      controlPlaneUrl: `http://127.0.0.1:${this.boundPort}`
    };
  }

  private writeDiscoveryRecord(record: ControlPlaneDiscoveryRecord): void {
    const discoveryPath = path.join(this.dir, 'control-plane.json');
    fs.writeFileSync(discoveryPath, JSON.stringify(record, null, 2), 'utf8');
  }

  private removeDiscoveryRecord(): void {
    try {
      const discoveryPath = path.join(this.dir, 'control-plane.json');
      if (fs.existsSync(discoveryPath)) {
        const content = fs.readFileSync(discoveryPath, 'utf8');
        const parsed = JSON.parse(content) as { pid?: number };
        if (parsed.pid === process.pid) {
          fs.unlinkSync(discoveryPath);
        }
      }
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
        rosterSyncedAt: 0
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
      case 'report.snapshot':
      case 'report.changed': {
        const p = params as unknown as ReportSnapshotParams;
        this.registry.updateReports(p.instanceId, p.reports);
        break;
      }
      case 'turn.changed': {
        const p = params as unknown as TurnChangedParams;
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
        protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION
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
      const selectedGameId = this.registry.getSelectedGameId();
      const reports = this.registry.getReportsForGame(selectedGameId);
      this.sendJson(res, 200, reports);
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

    // Add Game. The Stadium owns the folder picker; the Control Plane only forwards.
    if (method === 'POST' && requestUrl.pathname === '/api/game/add') {
      const addAuth = this.registry.getAuthoritativeSessionForGame(this.registry.getSelectedGameId());
      const target = addAuth.session ?? this.registry.getAllSessions().find((candidate) => candidate.socket.readyState === 1);
      if (!target) {
        this.sendJson(res, 400, { success: false, message: 'No Stadium is connected to open the Add Game dialog.' });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(target, 'game.add', {})) as PlayerActionResult;
        this.sendJson(res, result.success === false ? 400 : 200, {
          success: result.success !== false,
          message: result.message ?? 'Add Game dialog triggered.'
        });
      } catch (err) {
        this.sendJson(res, 500, { success: false, message: err instanceof Error ? err.message : String(err) });
      }
      return;
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
    const selectedGameId = this.registry.getSelectedGameId();
    const games = this.registry.getGames();
    const selectedGame = games.find((g) => g.gameId === selectedGameId);
    const auth = this.registry.getAuthoritativeSessionForGame(selectedGameId);

    const players = this.registry.getRosterForGame(selectedGameId);
    const capabilities = this.registry.getCapabilitiesForGame(selectedGameId) as PlayerRoutingCapability[];
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
      routing,
      routingMode: this.routingMode,
      reports: reports.slice(0, 10),
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
        routingMode: this.routingMode
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
        lastHeartbeat: session.lastHeartbeat
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

  const daemon = new ControlPlaneDaemon(options);
  daemon.start().catch((err: unknown) => {
    console.error('Failed to start Control Plane daemon:', err);
    process.exit(1);
  });
}
