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
  type PlayerActivityParams,
  type DispatchAcceptedParams,
  type DispatchRejectedParams,
  type PlayerActionResult,
  type GamePickResult,
  type GameOpenResult,
  type PlayerLifecycleResult,
  type GameFilesBrowseResult,
  type GameFilesCheckResult,
  type GameFilesSearchResult,
  type GameFilesResolveAbsoluteResult,
  type GameFilesystemInspectResult,
  type GameFilesystemApplyResult,
  type GameFilesystemEnsureResult
} from './protocol';
import { decideAddGame } from '../game-lifecycle';
import { ACTIVITY_CATEGORIES, PlayerActivityStore, type ActivityCategory } from '../player-activity';
import { StadiumRegistry, type StadiumSession } from './stadium-registry';
import { ControlPlaneRouter } from './router';
import { computeAutoRoute, createRoutingPolicies, type ProviderRoutingPolicy } from '../routing-policy';
import { InstanceWorkLedger, type DispatchRecord, type TurnRecord } from './work-ledger';
import { projectExecution, type ExecutionView, type QueuedExecutionItem } from './execution-projection';
import { CONTROL_PLANE_SERVICE, computeControlPlaneBuild } from './freshness';
import { PlayQueue, fileQueueStore, type QueuedPlay } from './play-queue';
import { type GameReportRef } from './context-affinity';
import { friendlyInstanceNames, projectFriendlyRoster } from '../player-display-labels';
import type { RouteContext } from '../routing-policy';
import type { PlayerRoutingCapability, RoutingDecision, RoutingMode } from '../capability-types';
import { projectInstanceControls, type ProviderControlProfile } from '../provider-control';
import {
  RUNNING_PLAYERS_SAVED,
  isRunningPlayersPreference,
  advancedPlayerDiscoveryVisible,
  isTerminalRetention,
  isTimeFormatPreference,
  loadPreferences,
  projectDiscovery,
  savePreferences,
  type CoachPreferences
} from '../running-players';
import {
  CoachRoutineEngine,
  RoutineValidationError,
  fileCoachRoutineStore,
  type RoutineDelivery,
  type RoutineInput,
  type RoutinePatch,
  type RoutineSourceState
} from './coach-routines';
import { GameFilesystemCoordinator, fileGameFilesystemStore } from './game-filesystem-coordinator';
import {
  sanitizeGameFilesystemEvidence,
  CANONICAL_REPORTS_ROOT_NAME,
  isPlumbingReportsPath,
  type AttentionCode,
  type GameFilesystemContract,
  type PlumbingBootstrapPlan
} from '../game-filesystem-contract';
import { getPlayerAdapter } from '../player-adapters';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from '../scout-player-contract';
import {
  ScoutContinuationLedger,
  fileScoutContinuationStore,
  type ContinuationCandidateEvidence,
  type ScoutFormationOutcome
} from './scout-continuation';

export interface ManualRoutingSelection {
  playerInstanceId?: string;
  model?: string;
  effort?: string;
}

export interface DaemonOptions {
  port?: number;
  dir?: string;
  idleTimeoutMs?: number;
  /** Ordinary machine-to-machine RPC deadline. */
  rpcTimeoutMs?: number;
  /** Bounded deadline for UI RPCs that legitimately wait on a human. */
  humanInteractionRpcTimeoutMs?: number;
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
  /** Extension entrypoint whose closure defines the current Stadium build (default: ../extension.js beside this daemon). */
  extensionEntryPath?: string;
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
  /** Live Player Terminal: bounded, exact-Player, already-sanitized activity. In memory only. */
  private readonly playerActivity = new PlayerActivityStore();
  private readonly pendingRpcRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
      socket: StadiumSession['socket'];
      method: string;
    }
  >();
  private nextRpcId = 1;
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private boundPort = 0;
  private readonly dir: string;
  private readonly requestedPort: number;
  private readonly idleTimeoutMs: number;
  private readonly rpcTimeoutMs: number;
  private readonly humanInteractionRpcTimeoutMs: number;
  private addGameInProgress = false;
  private authToken = '';
  private routingMode: RoutingMode = 'auto';
  private manualSelection: ManualRoutingSelection | undefined;
  private readonly policies = createRoutingPolicies();
  private readonly ledger = new InstanceWorkLedger();
  private readonly playQueue: PlayQueue;
  private readonly scoutContinuations: ScoutContinuationLedger;
  private readonly routines: CoachRoutineEngine;
  /** S6: durable per-Game filesystem contract. Decisions here, filesystem truth in the Stadium. */
  private readonly gameFilesystem: GameFilesystemCoordinator;
  private readonly drainingQueues = new Set<string>();
  private ledgerSaveTimer: NodeJS.Timeout | undefined;
  private routineSaveTimer: NodeJS.Timeout | undefined;
  private readonly routineDispatches = new Map<string, {
    gameId: string;
    playerType?: string;
    queueItemId?: string;
    executionType: 'reasoning' | 'direct-shell';
  }>();
  private readonly pendingExecutionGames = new Set<string>();
  private executionBroadcastScheduled = false;
  private readonly daemonScriptPath: string;
  private readonly buildId: string | undefined;
  private readonly instanceNonce: string;
  private readonly supersedes: string[];
  private readonly replacementReason: string | undefined;
  private readonly exitOnShutdown: boolean;
  private readonly extensionEntryPath: string;
  /** The human's last selected Game, restored when it reconnects after a restart. */
  private preferredSelectedGameId: string | undefined;

  constructor(options: DaemonOptions = {}) {
    this.dir = options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    this.requestedPort = options.port ?? (process.env.SIDELINE_PORT ? parseInt(process.env.SIDELINE_PORT, 10) : 3100);
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 5_000;
    this.humanInteractionRpcTimeoutMs = options.humanInteractionRpcTimeoutMs ?? 15 * 60 * 1000;

    // Freshness Guard identity: what build this daemon IS, which instance, and why it exists.
    this.daemonScriptPath = path.resolve(options.daemonScriptPath ?? path.join(__dirname, 'daemon.js'));
    try { this.buildId = computeControlPlaneBuild(this.daemonScriptPath).buildId; }
    catch { this.buildId = undefined; }
    this.instanceNonce = options.instanceId ?? process.env.SIDELINE_DAEMON_INSTANCE ?? `cpi_${crypto.randomBytes(8).toString('hex')}`;
    this.supersedes = [...(options.supersedes ?? parseSupersedes(process.env.SIDELINE_SUPERSEDES))];
    this.replacementReason = options.replacementReason ?? process.env.SIDELINE_REPLACEMENT_REASON ?? undefined;
    this.exitOnShutdown = options.exitOnShutdown ?? false;
    this.extensionEntryPath = path.resolve(options.extensionEntryPath ?? path.join(path.dirname(this.daemonScriptPath), '..', 'extension.js'));
    this.preferredSelectedGameId = this.loadPreferredSelection();

    this.registry = new StadiumRegistry();
    this.router = new ControlPlaneRouter(this.registry);

    // Q2.10D: context history and queued Plays live beside the manifest, so an
    // automatic freshness replacement inherits them instead of silently losing them.
    this.playQueue = new PlayQueue(fileQueueStore(path.join(this.dir, 'play-queue.json')));
    this.scoutContinuations = new ScoutContinuationLedger(
      fileScoutContinuationStore(path.join(this.dir, 'scout-continuations.json'))
    );
    this.routines = new CoachRoutineEngine(fileCoachRoutineStore(
      path.join(this.dir, 'coach-routines.json'),
      (message) => this.log(message)
    ));
    // S6: the daemon may not share a Stadium's filesystem, so it only ever asks the
    // exact Game's authoritative Stadium for evidence and decides from that.
    this.gameFilesystem = new GameFilesystemCoordinator(
      fileGameFilesystemStore(path.join(this.dir, 'game-filesystem.json'), (message) => this.log(message)),
      {
        warn: (message) => this.log(message),
        evidenceProvider: async ({ gameId, checkPaths }) => {
          const auth = this.registry.getAuthoritativeSessionForGame(gameId);
          if (auth.status !== 'connected' || !auth.session) return undefined;
          if (!auth.session.features?.includes('game.filesystem.v1')) return undefined;
          const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.inspect', {
            gameId,
            checkPaths
          })) as GameFilesystemInspectResult;
          if (!result?.success || result.gameId !== gameId) return undefined;
          return sanitizeGameFilesystemEvidence(gameId, result.evidence);
        }
      }
    );
    this.gameFilesystem.onChange = (gameId) => {
      this.broadcastStatus();
      // Persist first, then converge the exact connected Stadium. Failure never
      // rolls back durable truth and reconnect retries the current revision.
      setImmediate(() => void this.applyGameFilesystemContract(this.gameFilesystem.get(gameId)).catch(() => undefined));
    };
    this.routines.onChange = (_gameId, urgency) => {
      if (urgency === 'immediate') this.flushRoutines();
      else this.scheduleRoutineSave();
      this.broadcastStatus();
    };
    try { this.ledger.restore(JSON.parse(fs.readFileSync(path.join(this.dir, 'work-ledger.json'), 'utf8'))); } catch { /* no history yet */ }
    this.ledger.onChange = (gameId) => {
      this.scheduleLedgerSave();
      this.scheduleExecutionBroadcast(gameId);
    };

    // Instance Work Ledger: only what Coach knows moves an instance's activity.
    this.router.on('play-dispatched', (record: DispatchRecord & { queueItemId?: string }) => {
      this.ledger.recordDispatch(record);
      this.routineDispatches.set(record.clientRef, {
        gameId: record.gameId,
        playerType: record.playerType,
        queueItemId: record.queueItemId,
        executionType: record.playerType === 'terminal' || record.transport === 'legacy' ? 'direct-shell' : 'reasoning'
      });
    });
    // AUTO dispatch reads the same per-instance activity the staged route showed.
    this.router.setCandidateEnricher((gameId, candidates) => candidates.map((candidate) => {
      const entry = this.ledger.get(gameId, candidate.instanceId);
      return entry ? { ...candidate, work: { workState: entry.workState } } : candidate;
    }));
    this.router.setPlayQueue(this.playQueue);
    this.router.setRouteContextProvider((gameId) => this.routeContextFor(gameId));
    // S9.0: PLAYER WRITES HERE == INCOMING WATCHES HERE. Resolved lazily; by
    // the time a Play actually dispatches, this.gameFilesystem is constructed.
    this.router.setReportDestinationResolver((gameId, playerType, sessionFeatures) =>
      this.resolveCanonicalReportDestination(gameId, playerType, sessionFeatures));
    this.router.on('scout-continuation-staged', (record: Parameters<ScoutContinuationLedger['stage']>[0]) => {
      this.scoutContinuations.stage(record);
    });
    this.router.on('scout-continuation-accepted', (event: { originalClientRef: string; turnRef: string }) => {
      this.scoutContinuations.acceptScout(event.originalClientRef, event.turnRef);
    });
    this.router.on('scout-continuation-delivery-failed', (event: { originalClientRef: string; state: 'failed' | 'unknown'; note: string }) => {
      this.scoutContinuations.failScoutDelivery(event.originalClientRef, event.note, event.state);
    });
    this.router.on('play-queued', (event: { gameId: string; playerInstanceId: string; playerType?: string; queueItemId: string }) => {
      this.ledger.recordQueueMutation(event.gameId, event.playerInstanceId);
      this.routines.observePlay({
        gameId: event.gameId,
        kind: 'queued',
        queueItemId: event.queueItemId,
        playerType: event.playerType
      });
      this.broadcastStatus();
      setImmediate(() => void this.drainQueue(event.gameId, event.playerInstanceId));
    });

    // Forward status updates to SSE clients
    this.router.on('status-update', (payload) => {
      if (typeof payload?.clientRef === 'string' && typeof payload?.state === 'string') {
        this.ledger.recordDelivery(payload.clientRef, payload.state, { turnRef: payload.turnRef, error: payload.error });
        const observed = this.routineDispatches.get(payload.clientRef);
        if (observed && (payload.state === 'received' || payload.state === 'unknown' || payload.state === 'failed')) {
          this.routines.observePlay({
            gameId: observed.gameId,
            kind: payload.state,
            clientRef: payload.clientRef,
            queueRelease: Boolean(observed.queueItemId),
            playerType: observed.playerType,
            executionType: observed.executionType
          });
          this.routineDispatches.delete(payload.clientRef);
        }
      }
      this.broadcast('turn', payload);
      this.broadcast('status', { type: 'turn-update', ...payload });
    });

    this.registry.on('change', (event: { type?: string; gameId?: string; disconnectedGameId?: string }) => {
      if (event.type === 'session-removed') this.ledger.markGameDisconnected(event.disconnectedGameId);
      else if (event.type === 'game-disconnected') this.ledger.markGameDisconnected(event.gameId);
      else if (event.type === 'capabilities-updated' && event.gameId) this.ledger.observeRoster(event.gameId, this.registry.getCapabilitiesForGame(event.gameId), this.rosterInstanceIds(event.gameId));
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
      // S6: a Game that just connected re-proves its filesystem contract. Read-only.
      if (event.type === 'game-connected' && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => void (async () => {
          const result = await this.gameFilesystem.reconcile(gameId);
          await this.applyGameFilesystemContract(result.contract);
          // S8.0: only after the contract is current does Sideline ever mutate a Game.
          await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
        })().catch((error) => this.log(`Game filesystem reconcile/apply failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`)));
      }
      // S8.0: a roster change may mean the current roster now needs a lane that
      // did not exist before. Never touches the root decision itself.
      if (event.type === 'roster-updated' && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => void this.runFilesystemEnsure(gameId).catch((error) =>
          this.log(`Filesystem lane ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`)
        ));
      }
      // Q2.10D: an exact instance that became free (or a Game that reconnected) may release its queue.
      if ((event.type === 'capabilities-updated' || event.type === 'game-connected') && event.gameId) {
        const gameId = event.gameId;
        setImmediate(() => { for (const instanceId of this.playQueue.instancesWithWork(gameId)) void this.drainQueue(gameId, instanceId); });
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

  get ledgerInstance(): InstanceWorkLedger {
    return this.ledger;
  }

  get routineEngineInstance(): CoachRoutineEngine {
    return this.routines;
  }

  get gameFilesystemInstance(): GameFilesystemCoordinator {
    return this.gameFilesystem;
  }

  get scoutContinuationLedgerInstance(): ScoutContinuationLedger {
    return this.scoutContinuations;
  }

  executionSnapshot(gameId = this.registry.getSelectedGameId()): { gameId: string; epoch: string; serverNow: number; byInstance: Record<string, ExecutionView> } {
    return this.buildExecution(gameId);
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
    if (this.routineSaveTimer) {
      clearTimeout(this.routineSaveTimer);
      this.routineSaveTimer = undefined;
      this.flushRoutines();
    }

    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();

    this.rejectPendingRpcRequests(() => true, 'Control Plane stopped before the Stadium replied.');

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
      this.flushRoutines();
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
      this.rejectPendingRpcRequests(
        (pending) => pending.socket === socket,
        'Stadium disconnected before the request completed.'
      );
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
        controlPlaneFreshness: params.controlPlaneFreshness,
        extensionBuildId: typeof params.extensionBuildId === 'string' ? params.extensionBuildId : undefined,
        features: Array.isArray(params.features)
          ? params.features.filter((feature): feature is string => typeof feature === 'string').slice(0, 50)
          : []
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
        if (gameId) {
          const turn = (p.turn ?? {}) as TurnRecord;
          this.ledger.recordTurn(gameId, turn);
          if (turn.instanceId && ['completed', 'partial', 'blocked', 'failed', 'interrupted', 'unknown'].includes(String(turn.state))) {
            const instanceId = turn.instanceId;
            setImmediate(() => void this.drainQueue(gameId, instanceId));
            if (instanceId === SCOUT_PLAYER_INSTANCE_ID) {
              setImmediate(() => void this.continueAfterScout(gameId, p.turn));
            } else if (typeof turn.turnRef === 'string') {
              this.scoutContinuations.recordContinuationOutcome(gameId, turn.turnRef, String(turn.state), turn.summary);
            }
          }
        }
        this.broadcast('turn', p.turn);
        break;
      }
      case 'player.activity': {
        // Live Player Terminal. Nothing is stored or broadcast unless BOTH Dev Mode and
        // View Player Terminal are on, so the feature costs nothing (and exposes nothing) when off.
        const p = params as unknown as PlayerActivityParams;
        if (!this.livePlayerTerminalEnabled()) break;
        const session = this.registry.getSession(sessionInstanceId);
        const gameId = session?.game?.gameId ?? p.gameId;
        const a = (p.activity ?? {}) as { instanceId?: unknown; sessionKey?: unknown; at?: unknown; category?: unknown; text?: unknown; streaming?: unknown };
        if (!gameId || typeof a.instanceId !== 'string' || !a.instanceId || typeof a.text !== 'string') break;
        if (!ACTIVITY_CATEGORIES.includes(a.category as ActivityCategory)) break;
        const sessionKey = typeof a.sessionKey === 'string' && /^[0-9a-f]{8}$/.test(a.sessionKey) ? a.sessionKey : undefined;
        // record() re-sanitizes: the browser boundary never trusts the sender's redaction.
        const entry = this.playerActivity.record(`${gameId}|${a.instanceId}`, {
          sessionKey,
          at: typeof a.at === 'number' ? a.at : Date.now(),
          category: a.category as ActivityCategory,
          text: a.text,
          streaming: a.streaming === true
        });
        if (entry) this.broadcast('activity', { gameId, instanceId: a.instanceId, epoch: this.ledger.epoch, sessionKey, entry });
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

    // Live Player Terminal backfill (reconnect / first Expand). Exact Player only.
    if (method === 'GET' && requestUrl.pathname === '/api/player-activity') {
      const gameId = requestUrl.searchParams.get('gameId') ?? '';
      const instanceId = requestUrl.searchParams.get('instanceId') ?? '';
      if (!gameId || !instanceId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId or instanceId.' });
        return;
      }
      const snapshot = this.livePlayerTerminalEnabled() ? this.playerActivity.snapshot(`${gameId}|${instanceId}`) : { sessionKey: undefined, entries: [] };
      this.sendJson(res, 200, { success: true, gameId, instanceId, epoch: this.ledger.epoch, sessionKey: snapshot.sessionKey, entries: snapshot.entries });
      return;
    }

    // Status
    if (method === 'GET' && requestUrl.pathname === '/api/status') {
      this.sendJson(res, 200, this.buildStatus());
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/files/browse') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      const dir = requestUrl.searchParams.get('dir')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.browse', { gameId, dir }, (raw) => {
        const result = raw as GameFilesBrowseResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not browse this Game.');
        return {
          success: true,
          gameId,
          dir: typeof result.dir === 'string' ? result.dir : '',
          entries: (Array.isArray(result.entries) ? result.entries : []).slice(0, 200).flatMap((entry) =>
            entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
              ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
              : []),
          truncated: result.truncated === true
        };
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/files/check') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const paths = body.paths;
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!Array.isArray(paths) || paths.length > 20 || paths.some((candidate) => typeof candidate !== 'string')) {
        this.sendJson(res, 400, { success: false, message: 'Provide at most 20 Game paths as strings.' });
        return;
      }
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.check', { gameId, paths }, (raw) => {
        const result = raw as GameFilesCheckResult;
        if (!result?.success || !Number.isFinite(result.checkedAt)) throw new Error(result?.message || 'Coach could not check paths for this Game.');
        return {
          success: true,
          gameId,
          checkedAt: result.checkedAt,
          checks: (Array.isArray(result.checks) ? result.checks : []).slice(0, 20).flatMap((check) =>
            check && typeof check.path === 'string' && ['file', 'folder', 'missing', 'blocked', 'unknown'].includes(check.state)
              ? [{ path: check.path, state: check.state }]
              : [])
        };
      });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games/files/search') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      const rawQuery = requestUrl.searchParams.get('q') ?? '';
      const rawLimit = requestUrl.searchParams.get('limit');
      const limit = rawLimit === null || rawLimit === '' ? undefined : Number(rawLimit);
      const allowSingleCharacter = requestUrl.searchParams.get('explicit') === '1';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (rawQuery.length > 120) {
        this.sendJson(res, 400, { success: false, message: 'Search query cannot exceed 120 characters.' });
        return;
      }
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
        this.sendJson(res, 400, { success: false, message: 'Search limit must be an integer from 1 to 100.' });
        return;
      }
      const query = rawQuery.trim().replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase();
      const searchId = crypto.randomUUID();
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.search', { gameId, query, limit, searchId, allowSingleCharacter }, (raw) => {
        const result = raw as GameFilesSearchResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not search this Game.');
        if (result.searchId !== searchId || result.query !== query) throw new Error('Stadium returned a mismatched search response.');
        const allowedReasons = ['entries', 'directories', 'depth', 'time'];
        const shapedResults = (Array.isArray(result.results) ? result.results : []).slice(0, limit ?? 50).flatMap((entry) =>
          entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
            ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
            : []);
        return {
          success: true,
          gameId,
          query: result.query,
          searchId,
          results: shapedResults,
          truncated: result.truncated === true,
          ...(typeof result.limitReason === 'string' && allowedReasons.includes(result.limitReason) ? { limitReason: result.limitReason } : {}),
          moreMatches: result.moreMatches === true,
          ...(result.superseded === true ? { superseded: true } : {})
        };
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/files/absolute-path') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const rawPath = typeof body.path === 'string' ? body.path : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!rawPath.trim() || rawPath.length > 240) {
        this.sendJson(res, 400, { success: false, message: 'Provide one Game-relative path no longer than 240 characters.' });
        return;
      }
      const requestedPath = rawPath.trim() === '.'
        ? '.'
        : rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
      await this.proxyExactGameRpc(res, gameId, 'game.files.v1', 'game.files.resolveAbsolute', { gameId, path: requestedPath }, (raw) => {
        const result = raw as GameFilesResolveAbsoluteResult;
        if (!result?.success) throw new Error(result?.message || 'Coach could not resolve that path.');
        if (result.path !== requestedPath) throw new Error('Stadium returned a mismatched absolute-path response.');
        if (result.available === true) {
          if (typeof result.absolutePath !== 'string' || !result.absolutePath ||
              !['windows', 'posix'].includes(String(result.pathStyle)) ||
              !['local', 'remote'].includes(String(result.environment))) {
            throw new Error('Stadium returned an invalid absolute-path response.');
          }
          const remoteLabels = ['WSL', 'SSH', 'Dev Container', 'Remote'];
          return {
            success: true, gameId, path: requestedPath, available: true,
            absolutePath: result.absolutePath,
            pathStyle: result.pathStyle,
            environment: result.environment,
            ...(result.environment === 'remote' && typeof result.remoteLabel === 'string' && remoteLabels.includes(result.remoteLabel)
              ? { remoteLabel: result.remoteLabel }
              : {})
          };
        }
        const reasons = ['missing', 'blocked', 'unknown', 'virtual-workspace'];
        if (!reasons.includes(String(result.reason))) throw new Error('Stadium returned an invalid absolute-path availability response.');
        return { success: true, gameId, path: requestedPath, available: false, reason: result.reason };
      });
      return;
    }

    // S6: read-only Game filesystem contract. No route in this slice mutates a Game.
    if (method === 'GET' && requestUrl.pathname === '/api/games/filesystem') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/reinspect') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, {
          success: false,
          status: 'offline',
          message: auth.error || "That Game's Stadium is not connected.",
          ...this.projectGameFilesystem(gameId)
        });
        return;
      }
      const result = await this.gameFilesystem.reconcile(gameId);
      if (result.inspected) {
        await this.applyGameFilesystemContract(result.contract);
        await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
      }
      this.sendJson(res, 200, { ...this.projectGameFilesystem(gameId), inspected: result.inspected, changed: result.changed });
      return;
    }

    /**
     * S10.0 — the human's explicit folder choice. Selects an EXISTING folder
     * only: verified live via `game.files.check` immediately before recording,
     * never created/moved/renamed. Recorded through the exact same
     * `GameFilesystemCoordinator.recordHumanChoice` authority S6 already
     * reserved for this — no second settings store, no new persistence
     * concept. `kind: 'reports'` also pushes the updated contract to the
     * Stadium so S7's apply/watch path converges on it immediately; `kind:
     * 'sop'` is a Coach-local decision only and is never applied remotely.
     */
    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/choose') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const kind = body.kind;
      const rawPath = typeof body.path === 'string' ? body.path : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (kind !== 'reports' && kind !== 'sop') {
        this.sendJson(res, 400, { success: false, message: 'kind must be "reports" or "sop".' });
        return;
      }
      if (!rawPath.trim() || rawPath.length > 240) {
        this.sendJson(res, 400, { success: false, message: "Can't use this location." });
        return;
      }
      // Exact Game-relative path preserved (spaces, casing, nesting) — only backslashes
      // are normalized and a trailing slash is stripped, matching the absolute-path route.
      const folderPath = rawPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
      if (!folderPath || folderPath === '.') {
        this.sendJson(res, 400, { success: false, message: "Can't use this location." });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      if (!auth.session.features?.includes('game.files.v1') || !auth.session.features?.includes('game.filesystem.v1')) {
        this.sendJson(res, 409, { success: false, status: 'unsupported', message: 'Reload or update this Game window to change this folder.' });
        return;
      }
      let checkResult: GameFilesCheckResult | undefined;
      try {
        checkResult = (await this.sendRpcToStadium(auth.session, 'game.files.check', { gameId, paths: [folderPath] })) as GameFilesCheckResult;
      } catch (error) {
        this.sendJson(res, 502, { success: false, message: `Could not verify that folder. ${error instanceof Error ? error.message : String(error)}` });
        return;
      }
      if (!checkResult?.success || checkResult.gameId !== gameId) {
        this.sendJson(res, 502, { success: false, message: 'Coach could not verify that folder.' });
        return;
      }
      const check = checkResult.checks?.find((entry) => entry.path === folderPath);
      if (!check || check.state !== 'folder') {
        this.sendJson(res, 409, { success: false, message: "Can't use this location." });
        return;
      }
      const updated = this.gameFilesystem.recordHumanChoice(gameId, kind, folderPath);
      if (kind === 'reports') await this.applyGameFilesystemContract(updated);
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    /**
     * S10.0 — "Restore detected folder": clears the human override
     * (`GameFilesystemCoordinator.clearChoice`, the same authority) and lets
     * automatic detection decide again, reusing S6's own reconcile pass.
     */
    if (method === 'POST' && requestUrl.pathname === '/api/games/filesystem/restore') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const kind = body.kind;
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (kind !== 'reports' && kind !== 'sop') {
        this.sendJson(res, 400, { success: false, message: 'kind must be "reports" or "sop".' });
        return;
      }
      if (!this.registry.getKnownGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.gameFilesystem.clearChoice(gameId, kind);
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status === 'connected' && auth.session) {
        const result = await this.gameFilesystem.reconcile(gameId);
        if (result.inspected) {
          await this.applyGameFilesystemContract(result.contract);
          await this.runFilesystemEnsure(gameId, result.bootstrapPlan, result.inspected);
        }
      }
      this.sendJson(res, 200, this.projectGameFilesystem(gameId));
      return;
    }

    // Coach Routines V0. Every request names its Game; browser selection is
    // never accepted as mutation authority.
    if (method === 'GET' && requestUrl.pathname === '/api/routines') {
      const gameId = requestUrl.searchParams.get('gameId')?.trim() ?? '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      this.sendJson(res, 200, {
        success: true,
        gameId,
        definitions: this.routines.forGame(gameId).routines,
        projection: this.projectRoutines(gameId)
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      try {
        const routine = this.routines.create(gameId, body as unknown as RoutineInput);
        this.sendJson(res, 201, { success: true, gameId, routine, projection: this.projectRoutines(gameId) });
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    if ((method === 'GET' || method === 'POST') && requestUrl.pathname === '/api/routines/sources/suggest') {
      const body = method === 'POST' ? (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown> : {};
      const gameId = (requestUrl.searchParams.get('gameId') ?? (typeof body.gameId === 'string' ? body.gameId : '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.suggest', { gameId })) as {
          success?: boolean;
          gameId?: string;
          suggestions?: Array<{ path: string; kind: 'file' | 'folder'; reason: string }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not suggest sources for this Game.' });
          return;
        }
        this.sendJson(res, 200, {
          success: true,
          gameId,
          suggestions: (Array.isArray(result.suggestions) ? result.suggestions : []).slice(0, 10).flatMap((suggestion) =>
            suggestion && typeof suggestion.path === 'string' && (suggestion.kind === 'file' || suggestion.kind === 'folder') && typeof suggestion.reason === 'string'
              ? [{ path: suggestion.path, kind: suggestion.kind, reason: suggestion.reason.slice(0, 160) }]
              : [])
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not suggest sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    if ((method === 'GET' || method === 'POST') && requestUrl.pathname === '/api/routines/sources/browse') {
      const body = method === 'POST' ? (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown> : {};
      const gameId = (requestUrl.searchParams.get('gameId') ?? (typeof body.gameId === 'string' ? body.gameId : '')).trim();
      const dir = (requestUrl.searchParams.get('dir') ?? (typeof body.dir === 'string' ? body.dir : '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.browse', { gameId, dir })) as {
          success?: boolean;
          gameId?: string;
          dir?: string;
          entries?: Array<{ name: string; path: string; kind: 'file' | 'folder' }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not browse sources for this Game.' });
          return;
        }
        this.sendJson(res, 200, {
          success: true,
          gameId,
          dir: typeof result.dir === 'string' ? result.dir : '',
          entries: (Array.isArray(result.entries) ? result.entries : []).slice(0, 200).flatMap((entry) =>
            entry && typeof entry.name === 'string' && typeof entry.path === 'string' && (entry.kind === 'file' || entry.kind === 'folder')
              ? [{ name: entry.name, path: entry.path, kind: entry.kind }]
              : [])
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not browse sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines/sources/check') {
      const body = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      const gameId = (typeof body.gameId === 'string' ? body.gameId : (requestUrl.searchParams.get('gameId') ?? '')).trim();
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const rawPaths = Array.isArray(body.paths)
        ? body.paths
        : (requestUrl.searchParams.has('path') ? requestUrl.searchParams.getAll('path') : null);
      if (!Array.isArray(rawPaths)) {
        this.sendJson(res, 400, { success: false, message: 'Paths must be an array of strings.' });
        return;
      }
      if (rawPaths.length > 20 || rawPaths.some((candidate) => typeof candidate !== 'string')) {
        this.sendJson(res, 400, { success: false, message: 'Provide at most 20 source paths as strings.' });
        return;
      }
      const paths = rawPaths as string[];
      const auth = this.registry.getAuthoritativeSessionForGame(gameId);
      if (auth.status !== 'connected' || !auth.session) {
        this.sendJson(res, 200, {
          success: true,
          gameId,
          checks: paths.map((path) => ({ path, state: 'unknown' as const })),
          offline: true
        });
        return;
      }
      try {
        const result = (await this.sendRpcToStadium(auth.session, 'routine.sources.check', { gameId, paths })) as {
          success?: boolean;
          gameId?: string;
          checkedAt?: number;
          checks?: Array<{ path: string; state: RoutineSourceState }>;
          message?: string;
        };
        if (!result?.success || result.gameId !== gameId || !Number.isFinite(result.checkedAt)) {
          this.sendJson(res, 502, { success: false, message: result?.message || 'Coach could not check sources for this Game.' });
          return;
        }
        const checks = (Array.isArray(result.checks) ? result.checks : []).slice(0, 20).flatMap((check) =>
          check && typeof check.path === 'string' && ['file', 'folder', 'missing', 'blocked', 'unknown'].includes(check.state)
            ? [{ path: check.path, state: check.state }]
            : []) as Array<{ path: string; state: RoutineSourceState }>;
        this.routines.recordSourceCheck(gameId, result.checkedAt!, checks);
        this.sendJson(res, 200, {
          success: true,
          gameId,
          checkedAt: result.checkedAt,
          checks,
          projection: this.projectRoutines(gameId)
        });
      } catch (err) {
        this.sendJson(res, 502, { success: false, message: `Coach could not check sources. ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // Human-entered per-Game repository coordinate for an AI Assistant Coach that cannot
    // reach local files. Matched before the generic routine-id mutation regex below so
    // this exact path is never mistaken for a routineId of "repository".
    if (method === 'PATCH' && requestUrl.pathname === '/api/routines/repository') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      try {
        const repositoryUrl = this.routines.setRepositoryUrl(gameId, typeof body.repositoryUrl === 'string' ? body.repositoryUrl : '');
        this.sendJson(res, 200, { success: true, gameId, repositoryUrl, projection: this.projectRoutines(gameId) });
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    const routineMutation = /^\/api\/routines\/([^/]+)(?:\/(due))?$/.exec(requestUrl.pathname);
    if (routineMutation && ((method === 'PATCH' && !routineMutation[2]) || (method === 'DELETE' && !routineMutation[2]) || (method === 'POST' && routineMutation[2] === 'due'))) {
      const routineId = decodeURIComponent(routineMutation[1]);
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      try {
        if (method === 'PATCH') {
          const routine = this.routines.update(gameId, routineId, body as RoutinePatch);
          this.sendJson(res, routine ? 200 : 404, routine
            ? { success: true, gameId, routine, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        } else if (method === 'DELETE') {
          const removed = this.routines.remove(gameId, routineId);
          this.sendJson(res, removed ? 200 : 404, removed
            ? { success: true, gameId, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        } else {
          const routine = this.routines.markDue(gameId, routineId);
          this.sendJson(res, routine ? 200 : 404, routine
            ? { success: true, gameId, routine, projection: this.projectRoutines(gameId) }
            : { success: false, message: 'That routine does not belong to this Game.' });
        }
      } catch (error) {
        this.sendRoutineValidationError(res, error);
      }
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/routines/delivered') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      const via = body.via === 'copy-report' || body.via === 'strategy-board-send' ? body.via : undefined;
      const deliveries = Array.isArray(body.deliveries)
        ? body.deliveries.filter((item): item is { routineId: string; cycle: string } => Boolean(item)
          && typeof (item as { routineId?: unknown }).routineId === 'string'
          && typeof (item as { cycle?: unknown }).cycle === 'string')
        : [];
      if (!gameId || !via || deliveries.length === 0 || deliveries.length > 20) {
        this.sendJson(res, 400, { success: false, message: 'Name the exact Game, due routine cycle, and delivery method.' });
        return;
      }
      if (!this.knowsRoutineGame(gameId)) {
        this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
        return;
      }
      const reportPath = typeof body.reportPath === 'string' && body.reportPath.length <= 500 ? body.reportPath : undefined;
      const result = this.routines.markDelivered(gameId, deliveries, via, reportPath);
      const statusCode = !result.found ? 404 : result.stale ? 409 : 200;
      this.sendJson(res, statusCode, {
        success: statusCode === 200,
        gameId,
        delivered: result.changed,
        alreadyDelivered: result.alreadyDelivered,
        stale: result.stale,
        ...(statusCode === 200 ? { projection: this.projectRoutines(gameId) }
          : { message: result.stale ? 'That routine cycle is no longer current.' : 'That routine does not belong to this Game.' })
      });
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
        modelSwitch: typeof body.modelSwitch === 'string' ? body.modelSwitch : undefined,
        incomingReportPath: typeof body.incomingReportPath === 'string' ? body.incomingReportPath : undefined,
        routeChoice: body.routeChoice === 'queue' || body.routeChoice === 'handoff' || body.routeChoice === 'dispatch' ? body.routeChoice : undefined,
        whenBusy: body.whenBusy === 'queue' ? 'queue' : undefined
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

    // Q2.10D: one Game's queue (never another Game's).
    if (method === 'GET' && requestUrl.pathname === '/api/queue') {
      const gameId = requestUrl.searchParams.get('gameId') || this.registry.getSelectedGameId();
      this.sendJson(res, 200, { success: true, gameId, queue: this.projectQueue(gameId) });
      return;
    }

    // Slice A: acknowledge existing canonical work/report truth. The browser will
    // call this in a later slice; no separate acknowledgement store is introduced.
    if (method === 'POST' && requestUrl.pathname === '/api/work/acknowledge') {
      const body = (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : '';
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const result = this.ledger.acknowledge({
        gameId,
        reportPath: typeof body.reportPath === 'string' ? body.reportPath : undefined,
        instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
        playRef: typeof body.playRef === 'string' ? body.playRef : undefined
      });
      this.sendJson(res, result.found ? 200 : 404, result.found
        ? { success: true, acknowledged: true, changed: result.changed, instanceId: result.instanceId }
        : { success: false, acknowledged: false, message: 'That work item is not linked to this Game and Player.' });
      return;
    }

    const queueAction = /^\/api\/queue\/([^/]+)\/(cancel|retry)$/.exec(requestUrl.pathname);
    if (method === 'POST' && queueAction) {
      const id = decodeURIComponent(queueAction[1]);
      const body = (await this.readJsonBody(req)) as { gameId?: unknown };
      const gameId = typeof body.gameId === 'string' && body.gameId ? body.gameId : this.registry.getSelectedGameId();
      if (queueAction[2] === 'cancel') {
        const cancelled = this.playQueue.cancel(id, gameId);
        if (cancelled) this.ledger.recordQueueMutation(cancelled.gameId, cancelled.playerInstanceId);
        this.broadcastStatus();
        this.sendJson(res, cancelled ? 200 : 404, cancelled
          ? { success: true, message: 'Queued Play cancelled. Nothing was sent.' }
          : { success: false, message: 'That queued Play is no longer waiting (it may already be starting).' });
        return;
      }
      const item = this.playQueue.get(id);
      const retried = item?.gameId === gameId && this.playQueue.retry(id, gameId);
      if (retried && item) this.ledger.recordQueueMutation(item.gameId, item.playerInstanceId);
      this.broadcastStatus();
      if (retried && item) setImmediate(() => void this.drainQueue(item.gameId, item.playerInstanceId));
      this.sendJson(res, retried ? 200 : 404, retried
        ? { success: true, message: 'Coach will send it when that Player is free.' }
        : { success: false, message: 'That queued Play does not need attention.' });
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
        prompt,
        {
          incomingReportPath: typeof body.incomingReportPath === 'string' ? body.incomingReportPath : undefined,
          routeChoice: body.routeChoice === 'queue' || body.routeChoice === 'handoff' || body.routeChoice === 'dispatch' ? body.routeChoice : undefined
        }
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

    if (requestUrl.pathname === '/api/scout/openrouter-credential') {
      let body: Record<string, unknown> = {};
      if (method === 'POST' || method === 'DELETE') {
        body = (await this.readJsonBody(req)) as Record<string, unknown>;
      }
      const gameId = method === 'GET'
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
      if (method === 'POST' && (!apiKey || !apiKey.trim() || apiKey.length > 4096)) {
        this.sendJson(res, 400, { success: false, message: 'Enter a valid OpenRouter API key.' });
        return;
      }
      const rpcMethod = method === 'GET'
        ? 'scout.openrouterCredential.status'
        : method === 'POST'
          ? 'scout.openrouterCredential.save'
          : method === 'DELETE'
            ? 'scout.openrouterCredential.disconnect'
            : undefined;
      if (!rpcMethod) {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.openrouter-credential.v1',
        rpcMethod,
        { gameId, ...(method === 'POST' ? { apiKey } : {}) },
        (raw) => {
          const result = raw as { success?: unknown; gameId?: unknown; configured?: unknown; available?: unknown; message?: unknown };
          return {
            success: result.success === true,
            gameId,
            configured: result.configured === true,
            available: result.available === true,
            ...(typeof result.message === 'string' ? { message: result.message } : {})
          };
        }
      );
      return;
    }

    // S31 Slice 4: in-product Scout bootstrap. A thin, human-action-only bridge to the Stadium's
    // extension-owned service. It carries no credential in either direction, and the response is
    // rebuilt field by field from an allowlist, so nothing else can reach the browser.
    if (requestUrl.pathname === '/api/scout/bootstrap') {
      if (method !== 'GET' && method !== 'POST') {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      const body = method === 'POST' ? (await this.readJsonBody(req)) as Record<string, unknown> : {};
      const gameId = method === 'GET'
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      const action = method === 'POST' ? body.action : 'status';
      const rpcMethod = action === 'status' ? 'scout.bootstrap.status'
        : action === 'authorize' ? 'scout.bootstrap.authorize'
          : action === 'decline' ? 'scout.bootstrap.decline'
            : action === 'refresh' ? 'scout.bootstrap.refresh'
              : undefined;
      if (!rpcMethod) {
        this.sendJson(res, 400, { success: false, message: 'Unknown Scout tryout action.' });
        return;
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.bootstrap.v1',
        rpcMethod,
        { gameId },
        (raw) => {
          const result = raw as { success?: unknown; code?: unknown; message?: unknown; status?: unknown };
          const status = shapeScoutBootstrapStatus(result.status);
          return {
            success: result.success === true,
            gameId,
            ...(typeof result.code === 'string' ? { code: result.code.slice(0, 40) } : {}),
            ...(typeof result.message === 'string' ? { message: result.message.slice(0, 300) } : {}),
            ...(status ? { status } : {})
          };
        }
      );
      return;
    }

    if (requestUrl.pathname === '/api/scout/formation-receivers' || requestUrl.pathname === '/api/scout/formation-run') {
      if (!this.getPreferences().devMode) {
        this.sendJson(res, 404, { success: false, message: 'Scout Formation operator is available only in Dev Mode.' });
        return;
      }
      const isList = requestUrl.pathname.endsWith('formation-receivers');
      if ((isList && method !== 'GET') || (!isList && method !== 'POST')) {
        this.sendJson(res, 405, { success: false, message: 'Method not allowed.' });
        return;
      }
      const body = isList ? {} : (await this.readJsonBody(req)) as Record<string, unknown>;
      const gameId = isList
        ? (requestUrl.searchParams.get('gameId') ?? '').trim()
        : (typeof body.gameId === 'string' ? body.gameId.trim() : '');
      if (!gameId) {
        this.sendJson(res, 400, { success: false, message: 'Missing gameId.' });
        return;
      }
      await this.proxyExactGameRpc(
        res,
        gameId,
        'scout.formation-operator.v1',
        isList ? 'scout.formation.receivers' : 'scout.formation.run',
        isList ? { gameId } : {
          gameId,
          receiverId: typeof body.receiverId === 'string' ? body.receiverId : '',
          objective: typeof body.objective === 'string' ? body.objective : ''
        },
        (raw) => {
          const result = raw as Record<string, unknown>;
          return {
            success: result.success === true,
            gameId,
            ...(Array.isArray(result.receivers) ? { receivers: result.receivers } : {}),
            ...(typeof result.receiverId === 'string' ? { receiverId: result.receiverId } : {}),
            ...(typeof result.clientRef === 'string' ? { clientRef: result.clientRef } : {}),
            ...(typeof result.message === 'string' ? { message: result.message } : {})
          };
        }
      );
      return;
    }

    // Human-owned preferences. Dev Mode reveals observability/configuration only;
    // it never changes how a Play runs.
    if (requestUrl.pathname === '/api/preferences') {
      if (method === 'GET') {
        this.sendJson(res, 200, { success: true, preferences: this.getPreferences() });
        return;
      }
      if (method === 'POST') {
        const body = (await this.readJsonBody(req)) as Record<string, unknown>;
        const hasRunningPlayers = Object.prototype.hasOwnProperty.call(body, 'runningPlayers');
        const hasDevMode = Object.prototype.hasOwnProperty.call(body, 'devMode');
        const hasLiveConsole = Object.prototype.hasOwnProperty.call(body, 'livePlayerConsole');
        const hasAdvancedDiscovery = Object.prototype.hasOwnProperty.call(body, 'advancedPlayerDiscovery');
        const hasTerminalRetention = Object.prototype.hasOwnProperty.call(body, 'terminalRetention');
        const hasTimeFormat = Object.prototype.hasOwnProperty.call(body, 'timeFormat');
        if (!hasRunningPlayers && !hasDevMode && !hasLiveConsole && !hasAdvancedDiscovery && !hasTerminalRetention && !hasTimeFormat) {
          this.sendJson(res, 400, { success: false, message: 'Choose a preference to update.' });
          return;
        }
        if (hasTimeFormat && !isTimeFormatPreference(body.timeFormat)) {
          this.sendJson(res, 400, { success: false, message: 'Choose 12-hour or 24-hour.' });
          return;
        }
        if (hasTerminalRetention && !isTerminalRetention(body.terminalRetention)) {
          this.sendJson(res, 400, { success: false, message: 'Choose 30 seconds, 5 minutes, 30 minutes, or Until Dismissed.' });
          return;
        }
        if (hasAdvancedDiscovery && typeof body.advancedPlayerDiscovery !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Advanced Player Discovery must be on or off.' });
          return;
        }
        if (hasLiveConsole && typeof body.livePlayerConsole !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Live Player Console must be on or off.' });
          return;
        }
        if (hasRunningPlayers && !isRunningPlayersPreference(body.runningPlayers)) {
          this.sendJson(res, 400, { success: false, message: 'Choose Ask me, Automatically add, or Ignore.' });
          return;
        }
        if (hasDevMode && typeof body.devMode !== 'boolean') {
          this.sendJson(res, 400, { success: false, message: 'Dev Mode must be on or off.' });
          return;
        }
        const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
        if (hasDevMode && !gameId) {
          this.sendJson(res, 400, { success: false, message: 'Missing gameId for Dev Mode.' });
          return;
        }
        if (hasDevMode && !this.knowsRoutineGame(gameId)) {
          this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
          return;
        }
        const previous = this.getPreferences();
        const preferences = this.savePreferences({
          ...previous,
          ...(hasRunningPlayers ? { runningPlayers: body.runningPlayers as CoachPreferences['runningPlayers'] } : {}),
          ...(hasDevMode ? { devMode: body.devMode as boolean } : {}),
          ...(hasLiveConsole ? { livePlayerConsole: body.livePlayerConsole as boolean } : {}),
          ...(hasAdvancedDiscovery ? { advancedPlayerDiscovery: body.advancedPlayerDiscovery as boolean } : {}),
          ...(hasTerminalRetention ? { terminalRetention: body.terminalRetention as CoachPreferences['terminalRetention'] } : {}),
          ...(hasTimeFormat ? { timeFormat: body.timeFormat as CoachPreferences['timeFormat'] } : {})
        });
        if (hasDevMode && !previous.devMode && preferences.devMode) this.routines.initializeDevModeDefaults(gameId);
        // Turning the feature (or its Dev Mode gate) off discards retained activity.
        if (!(preferences.devMode && preferences.livePlayerConsole)) this.playerActivity.clear();
        this.broadcastStatus();
        const message = hasDevMode
          ? (preferences.devMode ? 'Dev Mode is on. Coach Routines are available.' : 'Dev Mode is off. Coach Routines are paused.')
          : hasLiveConsole
            ? (preferences.livePlayerConsole ? 'Live Player Console is on.' : 'Live Player Console is off.')
            : hasAdvancedDiscovery
              ? (preferences.advancedPlayerDiscovery ? 'Advanced Player Discovery is on.' : 'Advanced Player Discovery is off.')
              : hasTerminalRetention
                ? 'Terminal Success Retention saved.'
                : hasTimeFormat
                  ? 'Time format saved.'
                  : RUNNING_PLAYERS_SAVED[preferences.runningPlayers];
        this.sendJson(res, 200, { success: true, preferences, message, routines: this.projectRoutines(gameId || this.registry.getSelectedGameId()) });
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
  /**
   * The Stadium that performs Add Game's mechanics (picker, adoption, window open).
   *
   * Those mechanics run in whatever code that Stadium LOADED, not what is on disk.
   * A Stadium reporting a build other than the current one is known-stale and may
   * lack launch or identity repairs (field evidence: Add Game served by a pre-fix
   * GS3 host stayed Opening while a current Stadium was connected). So the selected
   * Game's Stadium is used unless it is known-stale and a current one exists.
   * Unknown builds never cause a switch.
   */
  private pickHostSession(): { session: StadiumSession; freshness: 'current' | 'stale' | 'unknown' } | undefined {
    const expected = this.currentExtensionBuildId();
    const freshness = (s: StadiumSession): 'current' | 'stale' | 'unknown' =>
      !expected || !s.extensionBuildId || s.extensionBuildId === 'unknown' ? 'unknown' : s.extensionBuildId === expected ? 'current' : 'stale';
    const live = this.registry.getAllSessions().filter((candidate) => candidate.socket.readyState === 1);
    const selected = this.registry.getAuthoritativeSessionForGame(this.registry.getSelectedGameId()).session;
    const current = live.find((candidate) => freshness(candidate) === 'current');

    const session = selected && (freshness(selected) !== 'stale' || !current) ? selected : current ?? selected ?? live[0];
    return session ? { session, freshness: freshness(session) } : undefined;
  }

  private currentExtensionBuildId(): string | undefined {
    try { return computeControlPlaneBuild(this.extensionEntryPath).buildId; } catch { return undefined; }
  }

  private async handleAddGame(res: http.ServerResponse): Promise<void> {
    if (this.addGameInProgress) {
      this.sendJson(res, 409, {
        success: false,
        status: 'picker-open',
        message: 'The repository picker is already open. Finish or cancel it before trying Add Game again.'
      });
      return;
    }

    this.addGameInProgress = true;
    try {
      await this.runAddGame(res);
    } finally {
      this.addGameInProgress = false;
    }
  }

  private async runAddGame(res: http.ServerResponse): Promise<void> {
    const chosen = this.pickHostSession();
    if (!chosen) {
      this.sendJson(res, 400, {
        success: false,
        message: 'No Game window is connected yet, so Coach has nowhere to show the repository picker. Open a Game first.'
      });
      return;
    }
    const host = chosen.session;

    let picked: GamePickResult;
    const pickerStartedAt = Date.now();
    this.log(`Add Game: repository picker requested from ${host.instanceId} (serving build ${chosen.freshness})`);
    try {
      picked = (await this.sendRpcToStadium(
        host,
        'game.pick',
        {},
        this.humanInteractionRpcTimeoutMs
      )) as GamePickResult;
    } catch (err) {
      this.log(`Add Game: repository picker failed after ${Date.now() - pickerStartedAt}ms: ${err instanceof Error ? err.message : String(err)}`);
      this.sendJson(res, 500, {
        success: false,
        message: `Coach could not open the repository picker. ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    this.log(`Add Game: repository picker resolved after ${Date.now() - pickerStartedAt}ms (${picked?.cancelled ? 'cancelled' : picked?.success ? 'selected' : 'unresolved'})`);

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
    this.log(`Add Game: registered ${picked.game.displayName} (${picked.game.gameId}) from picker result`);

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
    this.log(`Add Game: published Opening status for ${picked.game.displayName} (${decision.gameId})`);

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

    this.log(`Add Game: opening ${picked.game.displayName} (${decision.gameId}) from ${decision.folderPath} via ${host.instanceId}`);
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

  private knowsRoutineGame(gameId: string): boolean {
    return Boolean(gameId && (this.registry.getKnownGame(gameId) || this.routines.hasGame(gameId)));
  }

  private async proxyExactGameRpc<T>(
    res: http.ServerResponse,
    gameId: string,
    requiredFeature: string,
    method: string,
    params: unknown,
    shape: (result: unknown) => T
  ): Promise<void> {
    if (!this.registry.getKnownGame(gameId)) {
      this.sendJson(res, 404, { success: false, message: 'Coach does not know that Game.' });
      return;
    }
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session) {
      this.sendJson(res, 409, { success: false, status: 'offline', message: auth.error || "That Game's Stadium is not connected." });
      return;
    }
    if (!auth.session.features?.includes(requiredFeature)) {
      this.sendJson(res, 409, {
        success: false,
        status: 'unsupported',
        message: `That Game's Stadium does not support ${requiredFeature}. Reload or update the Stadium.`
      });
      return;
    }
    try {
      const result = await this.sendRpcToStadium(auth.session, method, params) as { gameId?: unknown };
      if (result?.gameId !== gameId) {
        this.sendJson(res, 502, { success: false, message: 'Stadium returned data for a different Game.' });
        return;
      }
      this.sendJson(res, 200, shape(result));
    } catch (error) {
      this.sendJson(res, 502, { success: false, message: `${method} failed. ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /**
   * S6 projection. The Dad-facing view carries folder, provenance and attention only;
   * raw evidence stays behind Dev Mode.
   */
  private projectGameFilesystem(gameId: string): Record<string, unknown> {
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    const canChange = auth.status === 'connected' && Boolean(auth.session?.features?.includes('game.filesystem.v1'));
    const diagnostics = this.getPreferences().devMode ? this.gameFilesystem.diagnostics(gameId) : undefined;
    return {
      success: true,
      gameId,
      gameSetup: this.gameFilesystem.projection(gameId, canChange),
      ...(diagnostics ? { diagnostics } : {})
    };
  }

  private projectRoutines(gameId: string) {
    const game = this.registry.getKnownGame(gameId);
    const gameView = this.registry.getGames().find((candidate) => candidate.gameId === gameId);
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    return this.routines.project(gameId, this.getPreferences().devMode, {
      displayName: game?.displayName,
      repoUri: game?.repoUri,
      rootFsPath: auth.session?.rootFsPath ?? gameView?.rootFsPath
    });
  }

  private sendRoutineValidationError(res: http.ServerResponse, error: unknown): void {
    if (error instanceof RoutineValidationError) {
      this.sendJson(res, 400, { success: false, message: error.message });
      return;
    }
    this.log(`Coach Routine mutation failed: ${error instanceof Error ? error.message : String(error)}`);
    this.sendJson(res, 500, { success: false, message: 'Coach could not save that routine.' });
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
      // The cache keeps the truth; the response body gets the same Dad-safe view as status.
      const responseBody = finalResult?.discovery
        ? {
            ...finalResult,
            discovery: projectDiscovery(
              finalResult.discovery as { externalCandidates?: unknown[]; runningElsewhere?: unknown[]; adoptableTerminals?: unknown[] },
              'ask',
              advancedPlayerDiscoveryVisible(this.getPreferences())
            )
          }
        : finalResult;
      this.sendJson(res, finalResult?.success === false ? 400 : 200, responseBody ?? { success: false, message: 'No result.' });
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

  /** Coalesced canonical execution publication; elapsed clocks never create SSE. */
  private scheduleExecutionBroadcast(gameId: string): void {
    if (!gameId || this.disposed) return;
    this.pendingExecutionGames.add(gameId);
    if (this.executionBroadcastScheduled) return;
    this.executionBroadcastScheduled = true;
    setImmediate(() => {
      this.executionBroadcastScheduled = false;
      if (this.disposed) return;
      for (const pendingGameId of this.pendingExecutionGames) {
        const projection = this.buildExecution(pendingGameId);
        this.broadcast('execution', {
          gameId: projection.gameId,
          epoch: projection.epoch,
          serverNow: projection.serverNow,
          views: Object.values(projection.byInstance)
        });
      }
      this.pendingExecutionGames.clear();
    });
  }

  /** Project only the report-discovery coordinate to this Game's authoritative Stadium. */
  private async applyGameFilesystemContract(contract: GameFilesystemContract | undefined): Promise<boolean> {
    if (!contract) return false;
    const auth = this.registry.getAuthoritativeSessionForGame(contract.gameId);
    if (auth.status !== 'connected' || !auth.session) return false;
    if (!auth.session.features?.includes('game.filesystem.apply.v1')) {
      this.log(`Stadium for ${contract.gameId} does not support game.filesystem.apply; legacy report discovery remains active.`);
      return false;
    }
    try {
      const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.apply', {
        gameId: contract.gameId,
        revision: contract.revision,
        reports: { path: contract.reports.path, state: contract.reports.state },
        lanes: contract.reports.lanes ?? {}
      })) as GameFilesystemApplyResult;
      if (!result?.success || result.gameId !== contract.gameId || result.revision !== contract.revision) {
        this.log(`Filesystem contract apply was rejected for ${contract.gameId} revision ${contract.revision}.`);
        return false;
      }
      return true;
    } catch (error) {
      this.log(`Filesystem contract apply failed for ${contract.gameId} revision ${contract.revision}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * S8.0: the current roster's stable provider-type keys for exactly one Game
   * (e.g. `Codex`, `Claude`, `AntiGravity`) — never model, instance ID, seat,
   * or a human label. Terminal is excluded: it authors no reports. Multiple
   * instances of the same type collapse to one key, matching one lane.
   */
  private rosterProviderKeys(gameId: string): string[] {
    const roster = this.registry.getRosterForGame(gameId) as Array<{ id?: unknown; name?: unknown; instances?: unknown[] }>;
    const keys: string[] = [];
    for (const entry of roster) {
      if (entry?.id === 'terminal') continue;
      if (!Array.isArray(entry?.instances) || entry.instances.length === 0) continue;
      const key = typeof entry.name === 'string' && entry.name.trim() ? entry.name : undefined;
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  /**
   * S11.1: the bounded mutation pass. A fresh, safe bootstrap plan creates the
   * Plumbing parent and required Reports/SOP children through the existing S8
   * exact-Game Stadium seam after full preflight. Mature canonical roots only
   * receive missing roster-provider lanes. Never deletes, renames, migrates, or
   * touches an existing lane.
   */
  private async runFilesystemEnsure(
    gameId: string,
    bootstrapPlan?: PlumbingBootstrapPlan,
    freshEvidence = false
  ): Promise<void> {
    const contract = this.gameFilesystem.get(gameId);
    if (!contract) return;

    // A legacy pending value remains loadable, but only fresh evidence may
    // authorize re-creating an already-established legacy Sideline root. A
    // clean old pending value is handled by the fresh S11 bootstrapPlan.
    const legacyRootNeeded = freshEvidence
      && contract.pendingReportsAction === 'create-reports-slc'
      && contract.reports.provenance === 'created'
      && contract.reports.path === CANONICAL_REPORTS_ROOT_NAME
      && contract.reports.state === 'needs-attention'
      && contract.reports.attention?.code === 'missing';
    const rootReady = contract.reports.state === 'ready' && typeof contract.reports.path === 'string';
    if (!bootstrapPlan && !legacyRootNeeded && !rootReady) return;

    // A partial Plumbing workspace is one coherent bootstrap. Do not create
    // lanes beneath Reports while the approved SOP child is unresolved.
    if (!bootstrapPlan && rootReady && isPlumbingReportsPath(contract.reports.path) && contract.sop.state !== 'ready') return;

    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session) return;
    if (!auth.session.features?.includes('game.filesystem.ensure.v1')) return;

    const existingLanes = contract.reports.lanes ?? {};
    const missingLanes = this.rosterProviderKeys(gameId).filter((key) => !existingLanes[key]);
    if (!bootstrapPlan && !legacyRootNeeded && missingLanes.length === 0) return;

    const recordLaneResults = (lanes: NonNullable<GameFilesystemEnsureResult['lanes']>, now: string): void => {
      for (const [laneKey, outcome] of Object.entries(lanes ?? {})) {
        if (!outcome || (outcome.state !== 'ready' && outcome.state !== 'needs-attention')) continue;
        this.gameFilesystem.recordLaneEnsured(
          gameId,
          laneKey,
          outcome.folder || laneKey,
          { state: outcome.state, attention: outcome.state === 'needs-attention' ? sanitizeEnsureAttention(outcome.attention) : undefined },
          now
        );
      }
    };

    if (bootstrapPlan) {
      // The new workspace requires an explicit read-only preflight against the
      // same exact Stadium. Older Stadiums may keep mature roots working, but
      // cannot perform the S11 bootstrap until they advertise Game Files check.
      if (!auth.session.features?.includes('game.files.v1')) return;
      const lanePaths = missingLanes.map((lane) => `${bootstrapPlan.reportsPath}/${lane}`);
      const preflightPaths = [
        bootstrapPlan.parentPath,
        bootstrapPlan.reportsPath,
        bootstrapPlan.sopPath,
        ...lanePaths
      ];
      let preflight: GameFilesCheckResult | undefined;
      try {
        preflight = (await this.sendRpcToStadium(auth.session, 'game.files.check', { gameId, paths: preflightPaths })) as GameFilesCheckResult;
      } catch (error) {
        this.log(`Filesystem bootstrap preflight failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (!preflight?.success || preflight.gameId !== gameId) return;
      const returnedPaths = new Set((preflight.checks ?? []).map((check) => check.path));
      if (preflightPaths.some((requiredPath) => !returnedPaths.has(requiredPath))) {
        this.log(`Filesystem bootstrap preflight was incomplete for ${gameId}; no mutation authorized.`);
        return;
      }

      const invalid = (preflight.checks ?? []).filter((check) => check.state !== 'folder' && check.state !== 'missing');
      if (invalid.length > 0) {
        const now = new Date().toISOString();
        for (const check of invalid) {
          const attention = {
            code: check.state === 'file' ? 'name-collision' : check.state === 'blocked' ? 'blocked' : 'inaccessible',
            detail: check.path
          } satisfies { code: AttentionCode; detail?: string };
          if (check.path === bootstrapPlan.sopPath) this.gameFilesystem.recordSopRootAttention(gameId, attention, now);
          else if (check.path === bootstrapPlan.parentPath || check.path === bootstrapPlan.reportsPath) {
            this.gameFilesystem.recordReportsRootAttention(gameId, attention, now);
          } else {
            const laneKey = missingLanes.find((lane) => `${bootstrapPlan.reportsPath}/${lane}` === check.path);
            if (laneKey && rootReady) this.gameFilesystem.recordLaneEnsured(gameId, laneKey, laneKey, { state: 'needs-attention', attention }, now);
          }
        }
        const updated = this.gameFilesystem.get(gameId);
        if (updated) await this.applyGameFilesystemContract(updated);
        return;
      }

      const ensureOne = async (folderPath: string): Promise<NonNullable<GameFilesystemEnsureResult['root']> | undefined> => {
        const current = this.gameFilesystem.get(gameId) ?? contract;
        try {
          const result = (await this.sendRpcToStadium(auth.session!, 'game.filesystem.ensure', {
            gameId,
            revision: current.revision,
            root: { name: folderPath }
          })) as GameFilesystemEnsureResult;
          if (!result?.success || result.gameId !== gameId) return undefined;
          return result.root;
        } catch (error) {
          this.log(`Filesystem ensure failed for ${gameId} at ${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
          return undefined;
        }
      };

      const now = new Date().toISOString();
      if (bootstrapPlan.ensureParent) {
        const outcome = await ensureOne(bootstrapPlan.parentPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordReportsRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.parentPath },
            now
          );
          return;
        }
      }
      if (bootstrapPlan.ensureReports) {
        const outcome = await ensureOne(bootstrapPlan.reportsPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordReportsRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.reportsPath },
            now
          );
          return;
        }
        this.gameFilesystem.recordReportsRootCreated(gameId, bootstrapPlan.reportsPath, now);
      }
      if (bootstrapPlan.ensureSop) {
        const outcome = await ensureOne(bootstrapPlan.sopPath);
        if (!outcome || outcome.state !== 'ready') {
          this.gameFilesystem.recordSopRootAttention(
            gameId,
            sanitizeEnsureAttention(outcome?.attention) ?? { code: 'create-failed', detail: bootstrapPlan.sopPath },
            now
          );
          return;
        }
        this.gameFilesystem.recordSopRootCreated(gameId, bootstrapPlan.sopPath, now);
      }

      if (missingLanes.length > 0) {
        const current = this.gameFilesystem.get(gameId) ?? contract;
        try {
          const result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.ensure', {
            gameId,
            revision: current.revision,
            lanesRoot: bootstrapPlan.reportsPath,
            lanes: missingLanes
          })) as GameFilesystemEnsureResult;
          if (result?.success && result.gameId === gameId) recordLaneResults(result.lanes ?? {}, now);
        } catch (error) {
          this.log(`Filesystem lane ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const updated = this.gameFilesystem.get(gameId);
      if (updated) await this.applyGameFilesystemContract(updated);
      return;
    }

    const request = legacyRootNeeded
      ? { gameId, revision: contract.revision, root: { name: CANONICAL_REPORTS_ROOT_NAME }, lanesRoot: CANONICAL_REPORTS_ROOT_NAME, lanes: missingLanes }
      : { gameId, revision: contract.revision, lanesRoot: contract.reports.path, lanes: missingLanes };

    let result: GameFilesystemEnsureResult | undefined;
    try {
      result = (await this.sendRpcToStadium(auth.session, 'game.filesystem.ensure', request)) as GameFilesystemEnsureResult;
    } catch (error) {
      this.log(`Filesystem ensure failed for ${gameId}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!result?.success || result.gameId !== gameId) return;

    const now = new Date().toISOString();
    if (result.root) {
      if (result.root.state === 'ready') this.gameFilesystem.recordReportsRootCreated(gameId, result.root.name, now);
      else {
        const attention = sanitizeEnsureAttention(result.root.attention);
        if (attention) this.gameFilesystem.recordReportsRootAttention(gameId, attention, now);
      }
    }
    recordLaneResults(result.lanes ?? {}, now);

    const updated = this.gameFilesystem.get(gameId);
    if (updated) await this.applyGameFilesystemContract(updated);
  }

  /**
   * S9.0: the ONE canonical report-destination coordinate — never re-derived
   * from `coach.reportGlobs`, filesystem scanning, prompt text, Player cwd, or
   * the browser-selected Game. `undefined` means "never fabricate a
   * destination"; the Play still dispatches, with provenance only.
   *
   * Reuses the exact same durable `GameFilesystemContract` (`this.gameFilesystem`,
   * the sole owner since S6) and the exact same `game.filesystem.apply.v1`
   * feature-support truth S7's own `applyGameFilesystemContract` already
   * checks — a Stadium that cannot consume the canonical contract is never
   * told its Player write and Incoming's watch scope are aligned, because
   * they are not.
   */
  private resolveCanonicalReportDestination(gameId: string, playerType: string, sessionFeatures: readonly string[]): string | undefined {
    if (!sessionFeatures.includes('game.filesystem.apply.v1')) return undefined;
    const contract = this.gameFilesystem.get(gameId);
    if (!contract || contract.reports.state !== 'ready' || !contract.reports.path) return undefined;
    // Stable provider-type lane key (Codex/Claude/AntiGravity) — the exact same
    // vocabulary rosterProviderKeys()/S8 lane creation already uses. Never
    // model, effort, instance ID, terminal name, or a display label.
    const laneKey = getPlayerAdapter(playerType)?.name;
    if (!laneKey) return undefined;
    const lane = contract.reports.lanes?.[laneKey];
    if (!lane || lane.state !== 'ready') return undefined;
    return `${contract.reports.path}/${lane.folder}/`;
  }

  private sendRpcToStadium(
    session: StadiumSession,
    method: string,
    params: unknown,
    timeoutMs = this.rpcTimeoutMs
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRpcId++;
      const timer = setTimeout(() => {
        this.pendingRpcRequests.delete(id);
        reject(new Error(`RPC request '${method}' to Stadium timed out.`));
      }, timeoutMs);

      this.pendingRpcRequests.set(id, { resolve, reject, timer, socket: session.socket, method });
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

  private rejectPendingRpcRequests(
    predicate: (pending: { socket: StadiumSession['socket']; method: string }) => boolean,
    message: string
  ): void {
    for (const [id, pending] of this.pendingRpcRequests) {
      if (!predicate(pending)) continue;
      clearTimeout(pending.timer);
      this.pendingRpcRequests.delete(id);
      pending.reject(new Error(`${message} (${pending.method})`));
    }
  }

  /** Test seam to resolve or reject pending RPC requests from mock sessions. */
  handleWsResponseForTest(id: string | number, result: unknown, error?: Error): boolean {
    const pending = this.pendingRpcRequests.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingRpcRequests.delete(id);
    if (error) pending.reject(error);
    else pending.resolve(result);
    return true;
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
    const execution = this.buildExecution(this.registry.getSelectedGameId());
    res.write(`event: execution\ndata: ${JSON.stringify({
      gameId: execution.gameId,
      epoch: execution.epoch,
      serverNow: execution.serverNow,
      views: Object.values(execution.byInstance)
    })}\n\n`);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private livePlayerTerminalEnabled(): boolean {
    const preferences = this.getPreferences();
    return Boolean(preferences.devMode && preferences.livePlayerConsole);
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
    const serverNow = Date.now();

    // One exact-instance label projection for every Dad-mode surface. Stable seats
    // order siblings; current roster membership determines contiguous numbering.
    const players = projectFriendlyRoster(this.registry.getRosterForGame(selectedGameId));
    const discoveryCatalog = ((this.discoveryByGame.get(selectedGameId) as { catalog?: Array<{ playerType: string; controls?: ProviderControlProfile }> } | undefined)?.catalog) ?? [];
    // One control answer per EXACT instance, whatever the provider or transport:
    // live Controlled capability > provider discovery > Unknown (absent).
    const workLedger = this.ledger.forGame(selectedGameId);
    const capabilities = (this.registry.getCapabilitiesForGame(selectedGameId) as PlayerRoutingCapability[]).map((capability) => {
      const controls = projectInstanceControls(capability, discoveryCatalog.find((entry) => entry.playerType === capability.playerType)?.controls);
      // Activity of this EXACT instance, beside its eligibility. Unknown when unrecorded.
      const entry = workLedger.find((candidate) => candidate.playerInstanceId === capability.instanceId);
      const queued = this.playQueue.forInstance(selectedGameId, capability.instanceId);
      const needsAttention = queued.some((item) => item.state === 'needs-attention');
      const baseState = entry?.workState ?? 'unknown';
      // Queued is work state, distinct from On Field (eligibility): free-but-waiting instances show Queued.
      const workState = queued.length && baseState !== 'working' && baseState !== 'disconnected' ? 'queued' : baseState;
      const work = { workState, currentPlay: entry?.currentPlay, lastPlay: entry?.recentPlays[0], queuedCount: queued.length, needsAttention };
      return { ...capability, ...(controls ? { controls } : {}), work };
    });
    const reports = this.registry.getReportsForGame(selectedGameId);
    const rosterSynchronized = this.registry.isRosterSynchronizedForGame(selectedGameId);
    const execution = this.buildExecution(selectedGameId, serverNow);
    const preferences = this.getPreferences();
    const routines = this.routines.project(selectedGameId, preferences.devMode, {
      displayName: selectedGame?.displayName,
      repoUri: selectedGame?.repoUri,
      rootFsPath: auth.session?.rootFsPath ?? selectedGame?.rootFsPath
    });

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
      execution,
      queue: this.projectQueue(selectedGameId),
      // Lifecycle truth for a future aggregate Scout Player card. The original
      // prompt stays in the private durable ledger; normal status exposes only
      // bounded state, evidence, authority, candidates, and the chosen Player.
      scoutContinuations: this.scoutContinuations.forGame(selectedGameId).slice(-10).map((record) => ({
        id: record.id,
        state: record.state,
        originalPlayLabel: record.originalPlayLabel,
        authority: record.authority,
        formationId: record.formationId,
        formationOutcome: record.formationOutcome,
        scoutReportPath: record.scoutReportPath,
        candidates: record.continuationCandidates,
        selectedPlayerInstanceId: record.continuationDecision?.playerInstanceId,
        selectedPlayerName: record.continuationDecision?.playerName,
        selectedModel: record.continuationDecision?.model,
        selectedEffort: record.continuationDecision?.effort,
        note: record.note,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })),
      routing,
      routingMode: this.routingMode,
      reports: reports.slice(0, 10),
      // Always present in the contract: null means "not checked yet", which is
      // different from an empty catalog and must not be collapsed into it.
      playerDiscovery: projectDiscovery(
        this.discoveryByGame.get(selectedGameId) as { externalCandidates?: unknown[]; runningElsewhere?: unknown[]; adoptableTerminals?: unknown[] } | undefined,
        preferences.runningPlayers,
        advancedPlayerDiscoveryVisible(preferences)
      ),
      preferences,
      routines,
      // S6: where this Game's Reports/SOP coordinates are, and why Coach believes it.
      gameSetup: this.gameFilesystem.projection(
        selectedGameId,
        auth.status === 'connected' && Boolean(auth.session?.features?.includes('game.filesystem.v1'))
      ),
      at: serverNow
    };
  }

  /** One revisioned execution view for roster instances and logical capability-backed Players in one Game. */
  private buildExecution(gameId: string, serverNow = Date.now()): { gameId: string; epoch: string; serverNow: number; byInstance: Record<string, ExecutionView> } {
    const entries = new Map(this.ledger.forGame(gameId).map((entry) => [entry.playerInstanceId, entry]));
    const capabilities = new Map((this.registry.getCapabilitiesForGame(gameId) as PlayerRoutingCapability[])
      .map((capability) => [capability.instanceId, capability]));
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const byInstance: Record<string, ExecutionView> = {};
    for (const rawPlayer of this.registry.getRosterForGame(gameId)) {
      const player = rawPlayer as { instances?: Array<Record<string, unknown>> };
      for (const instance of player.instances ?? []) {
        const instanceId = typeof instance.instanceId === 'string' ? instance.instanceId : '';
        if (!instanceId) continue;
        const entry = entries.get(instanceId);
        const queuedItems: QueuedExecutionItem[] = this.playQueue.forInstance(gameId, instanceId).map((item) => ({
          state: item.state,
          attention: item.attention,
          reasonKind: entry?.currentPlay || item.context?.ownerInstanceId === instanceId ? 'own-current-play' : 'waiting-for-player',
          waitingOnName: names.get(instanceId)
        }));
        const capability = capabilities.get(instanceId);
        byInstance[instanceId] = projectExecution({
          instanceId,
          entry,
          pendingDispatch: this.ledger.hasPendingDispatch(gameId, instanceId),
          queued: queuedItems,
          controlState: typeof instance.controlState === 'string' ? instance.controlState : undefined,
          executionType: capability?.executionType === 'scout-formation' || instance.playerType === SCOUT_PLAYER_TYPE
            ? 'scout-formation'
            : capability?.executionType === 'direct-shell' || instance.playerType === 'terminal' ? 'direct-shell' : 'reasoning',
          now: serverNow
        });
      }
    }
    return { gameId, epoch: this.ledger.epoch, serverNow, byInstance };
  }

  /** Single source of AUTO-routing projection, shared by /api/status and /api/route/preview. */
  private buildRouting(
    selectedGameId: string,
    displayName: string | undefined,
    connectionStatus: string,
    rosterSynchronized: boolean,
    capabilities: readonly PlayerRoutingCapability[],
    prompt: string,
    extra: { incomingReportPath?: string; routeChoice?: 'queue' | 'handoff' | 'dispatch' } = {}
  ): Record<string, unknown> {
    let activeDecision: RoutingDecision | undefined;
    let autoError: string | undefined;

    if (connectionStatus !== 'connected') {
      autoError = `Game '${displayName ?? selectedGameId}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`;
    } else if (!rosterSynchronized) {
      // Not-yet-synchronized is explicitly NOT an authoritative empty roster.
      autoError = 'Roster is still synchronizing with the Stadium…';
    } else {
      // The same route the real dispatch will compute (context, queue, handoff).
      const result = this.router.computeRoute(selectedGameId, prompt, [...capabilities], extra);
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

  // --- Q2.10D: context, queue-for-owner -----------------------------------------

  /** Every instance on this Game's Team, benched included; undefined until the roster synchronizes. */
  private rosterInstanceIds(gameId: string): Set<string> | undefined {
    if (!this.registry.isRosterSynchronizedForGame(gameId)) return undefined;
    const ids = new Set<string>();
    for (const raw of this.registry.getRosterForGame(gameId)) {
      for (const instance of ((raw as { instances?: unknown[] }).instances ?? [])) {
        const id = (instance as { instanceId?: unknown }).instanceId;
        if (typeof id === 'string') ids.add(id);
      }
    }
    return ids;
  }

  /** The evidence context-aware AUTO may use — strictly ONE Game's Ledger, reports and queue. */
  /**
   * Return exactly one completed AUTO Scout detour to Coach. Coach re-runs the
   * ordinary AUTO router over the Team that exists now; Scout is excluded by
   * the router's continuation phase, and every other Formation outcome stops.
   */
  private async continueAfterScout(gameId: string, rawTurn: unknown): Promise<void> {
    const turn = (rawTurn ?? {}) as TurnRecord & {
      formationOutcome?: unknown;
      formationId?: unknown;
      reportPath?: unknown;
    };
    if (typeof turn.turnRef !== 'string') return;
    const outcome = typeof turn.formationOutcome === 'string'
      && ['COMPLETE', 'PARTIAL', 'BLOCKED', 'FAILED', 'UNKNOWN'].includes(turn.formationOutcome)
      ? turn.formationOutcome as ScoutFormationOutcome
      : undefined;
    if (!outcome) return;
    const record = this.scoutContinuations.recordScoutOutcome({
      gameId,
      turnRef: turn.turnRef,
      outcome,
      formationId: typeof turn.formationId === 'string' ? turn.formationId : undefined,
      reportPath: typeof turn.reportPath === 'string' ? turn.reportPath : undefined
    });
    if (!record || record.state !== 'awaiting-scout' || !record.scoutReportPath) return;

    const candidates = this.continuationCandidateEvidence(gameId);
    const begun = this.scoutContinuations.beginContinuation(record.id, candidates);
    if (!begun) return;
    if (!candidates.some((candidate) => candidate.eligible)) {
      this.scoutContinuations.stopContinuation(
        record.id,
        'Scout evidence is ready, but no eligible non-Scout Player can continue on the current Team.'
      );
      this.broadcastStatus();
      return;
    }

    const result = await this.router.dispatch({
      gameId,
      routingMode: 'auto',
      prompt: record.originalPrompt,
      incomingReportPath: record.scoutReportPath,
      scoutContinuation: {
        originalClientRef: record.originalClientRef,
        formationId: record.formationId,
        reportPath: record.scoutReportPath,
        authorityReason: record.authority.reason,
        originalContextPreamble: record.originalContextPreamble
      }
    });
    this.scoutContinuations.recordContinuationDispatch(record.id, {
      decision: result.decision,
      clientRef: result.clientRef,
      turnRef: result.turnRef,
      status: result.status,
      message: result.message,
      queueItemId: result.queueItemId
    });
    this.broadcastStatus();
  }

  private continuationCandidateEvidence(gameId: string): ContinuationCandidateEvidence[] {
    return (this.registry.getCapabilitiesForGame(gameId) as PlayerRoutingCapability[])
      .filter((candidate) => candidate.instanceId !== SCOUT_PLAYER_INSTANCE_ID)
      .map((candidate) => {
        let reason = 'Eligible in the current live Team projection.';
        let eligible = true;
        if (candidate.playerType === 'terminal' || candidate.executionType === 'direct-shell') {
          eligible = false;
          reason = 'Terminal runs exact commands and is not a natural-language AUTO continuation Player.';
        } else if (candidate.autoEligible === false) {
          eligible = false;
          reason = 'This capability is excluded from ordinary AUTO routing.';
        } else if (candidate.state !== 'ready') {
          eligible = false;
          reason = `Current Player state is ${candidate.state}, not ready.`;
        } else if (candidate.capability.freshness === 'unavailable') {
          eligible = false;
          reason = 'Live capability truth is unavailable.';
        } else if (candidate.transport === 'controlled' && candidate.capability.models.length === 0) {
          eligible = false;
          reason = 'No live model capability is available for this controlled Player.';
        }
        return {
          instanceId: candidate.instanceId,
          playerType: candidate.playerType,
          provider: candidate.capability.provider || candidate.playerType,
          state: candidate.state,
          eligible,
          reason
        };
      });
  }

  private routeContextFor(gameId: string): RouteContext {
    const reports = (this.registry.getReportsForGame(gameId) as Array<Record<string, unknown>>)
      .filter((report) => typeof report.path === 'string' && typeof report.mtime === 'number' && (!report.gameId || report.gameId === 'unknown' || report.gameId === gameId))
      .map((report): GameReportRef => ({
        path: report.path as string,
        filename: typeof report.filename === 'string' ? report.filename : undefined,
        mtime: report.mtime as number,
        gameId,
        provenance: report.provenance && typeof report.provenance === 'object' ? report.provenance as GameReportRef['provenance'] : undefined
      }));
    const queuedCounts = new Map<string, number>();
    for (const item of this.playQueue.forGame(gameId)) queuedCounts.set(item.playerInstanceId, (queuedCounts.get(item.playerInstanceId) ?? 0) + 1);
    return {
      ledger: this.ledger.forGame(gameId),
      reports,
      names: friendlyInstanceNames(this.registry.getRosterForGame(gameId)),
      rosterInstanceIds: this.rosterInstanceIds(gameId),
      queuedCounts
    };
  }

  private scheduleLedgerSave(): void {
    if (this.ledgerSaveTimer) return;
    this.ledgerSaveTimer = setTimeout(() => {
      this.ledgerSaveTimer = undefined;
      try {
        const file = path.join(this.dir, 'work-ledger.json');
        const temp = `${file}.${this.instanceNonce}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(this.ledger.serialize()), 'utf8');
        fs.renameSync(temp, file);
      } catch { /* history is best-effort; routing never depends on the write */ }
    }, 250);
    this.ledgerSaveTimer.unref();
  }

  private scheduleRoutineSave(): void {
    if (this.routineSaveTimer) return;
    this.routineSaveTimer = setTimeout(() => {
      this.routineSaveTimer = undefined;
      this.flushRoutines();
    }, 250);
    this.routineSaveTimer.unref();
  }

  private flushRoutines(): void {
    try { this.routines.flush(); }
    catch (error) { this.log(`Coach Routines state could not be saved: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /**
   * Release the next queued Play for ONE exact instance, after revalidating everything
   * that could have changed while it waited. Never a sibling; never a guess:
   * an unprovable situation becomes "needs attention" for the human.
   */
  private async drainQueue(gameId: string, playerInstanceId: string): Promise<void> {
    const key = `${gameId} ${playerInstanceId}`;
    if (this.drainingQueues.has(key) || this.disposed) return;
    const head = this.playQueue.head(gameId, playerInstanceId);
    if (!head || head.state !== 'queued') return;
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    if (auth.status !== 'connected' || !auth.session?.rosterSynchronized) return; // waits for the Game to reconnect
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const name = names.get(playerInstanceId) ?? 'The Player this Play was queued for';
    const roster = this.rosterInstanceIds(gameId);
    if (roster && !roster.has(playerInstanceId)) {
      this.playQueue.needsAttention(head.id, `${name} is no longer on your Team. Cancel this Play or send it to another Player.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    const capability = (auth.session.capabilities as PlayerRoutingCapability[]).find((entry) => entry.instanceId === playerInstanceId);
    if (!capability) {
      this.playQueue.needsAttention(head.id, `${name} is on the bench. Put it back on field and try again — or cancel this Play.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    if (capability.transport !== 'controlled' || capability.playerType === 'terminal') {
      this.playQueue.needsAttention(head.id, `${name} can't take queued Plays. Cancel this Play or send it yourself.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }
    if (capability.state === 'busy' || this.ledger.get(gameId, playerInstanceId)?.workState === 'working') return; // still working
    if (capability.state !== 'ready') {
      this.playQueue.needsAttention(head.id, `Queued Play needs attention: ${name} can't take Plays right now.`);
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      return;
    }

    this.drainingQueues.add(key);
    try {
      if (!this.playQueue.markDispatching(head.id)) return;
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
      this.broadcastStatus();
      const result = await this.router.dispatch({
        prompt: head.prompt,
        gameId,
        playerInstanceId,
        routingMode: 'manual',
        model: head.model,
        effort: head.effort,
        incomingReportPath: head.context?.reportPath,
        contextPreamble: head.context?.preamble,
        queueItemId: head.id
      });
      if (result.success) {
        this.playQueue.complete(head.id);
        // Q2.13: if this exact queue item was a Scout continuation waiting for a
        // busy instance, bind the real released turn back onto its audit record
        // so the terminal-turn handler above can close it truthfully instead of
        // leaving it stuck reading `queued` forever.
        if (result.turnRef) this.scoutContinuations.bindQueueRelease(head.id, result.turnRef);
      } else if (result.status === 'unknown') {
        this.playQueue.needsAttention(head.id, "Coach can't tell whether this queued Play started. Check the Player, then try again or cancel it.");
      } else if (/still working|already in flight|reconnecting/i.test(result.message ?? '')) {
        this.playQueue.requeue(head.id);
      } else {
        this.playQueue.needsAttention(head.id, `Queued Play needs attention: ${result.message ?? 'it could not be sent.'}`);
      }
      this.ledger.recordQueueMutation(gameId, playerInstanceId);
    } finally {
      this.drainingQueues.delete(key);
      this.broadcastStatus();
    }
  }

  /** Dad Mode projection of one Game's queue. No prompts beyond a short first line; no ids shown. */
  private projectQueue(gameId: string): Array<Record<string, unknown>> {
    const names = friendlyInstanceNames(this.registry.getRosterForGame(gameId));
    const auth = this.registry.getAuthoritativeSessionForGame(gameId);
    const positions = new Map<string, number>();
    return this.playQueue.forGame(gameId).map((item: QueuedPlay) => {
      const position = (positions.get(item.playerInstanceId) ?? 0) + 1;
      positions.set(item.playerInstanceId, position);
      const first = item.prompt.trim().split(/\r?\n/, 1)[0] ?? '';
      return {
        id: item.id,
        playerInstanceId: item.playerInstanceId,
        playerName: names.get(item.playerInstanceId) ?? 'Player',
        playLabel: item.playLabel,
        promptSummary: first.length > 80 ? `${first.slice(0, 79)}…` : first,
        reason: item.reason,
        state: item.state,
        attention: item.attention ?? (auth.status !== 'connected' && item.state === 'queued' ? 'Waiting for this Game to reconnect.' : undefined),
        position,
        queuedAt: item.queuedAt
      };
    });
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
        launcherFreshness: session.controlPlaneFreshness ?? null,
        // Q2.8H dev-harness proof (Advanced only; never in Dad Mode). The daemon does
        // not know the canonical value itself — it just passes through what this
        // Stadium reported so a dev tool running FROM the canonical repo can compare.
        extensionBuildId: session.extensionBuildId ?? 'unknown'
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

const ENSURE_ATTENTION_CODES: readonly AttentionCode[] = [
  'missing', 'not-a-folder', 'blocked', 'escapes-game', 'inaccessible', 'name-collision', 'create-failed', 'multiple-case-variants'
];

/** An ensure RPC result crosses a process boundary; a malformed code is never trusted. */
function sanitizeEnsureAttention(raw: unknown): { code: AttentionCode; detail?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { code?: unknown; detail?: unknown };
  if (typeof candidate.code !== 'string' || !ENSURE_ATTENTION_CODES.includes(candidate.code as AttentionCode)) return undefined;
  return { code: candidate.code as AttentionCode, ...(typeof candidate.detail === 'string' ? { detail: candidate.detail } : {}) };
}

const SCOUT_BOOTSTRAP_PHASES = new Set(['credential-required', 'ready-to-find', 'declined', 'holding-tryouts', 'scouts-ready', 'provider-limited', 'no-scouts-ready']);
const SCOUT_BOOTSTRAP_CONSENTS = new Set(['not-decided', 'authorized', 'declined']);

/**
 * Rebuild the bootstrap status from an allowlist. Unknown fields are dropped, and every kept
 * field is type-checked and bounded, so the browser only ever sees this shape.
 */
function shapeScoutBootstrapStatus(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.phase !== 'string' || !SCOUT_BOOTSTRAP_PHASES.has(value.phase)) return undefined;
  const count = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) ? Math.max(0, Math.min(1_000, Math.trunc(input))) : 0);
  const shaped: Record<string, unknown> = {
    phase: value.phase,
    consent: typeof value.consent === 'string' && SCOUT_BOOTSTRAP_CONSENTS.has(value.consent) ? value.consent : 'not-decided',
    credentialConfigured: value.credentialConfigured === true,
    readyCount: count(value.readyCount),
    providerLimitedCount: count(value.providerLimitedCount),
    holdingTryouts: value.holdingTryouts === true,
    canFind: value.canFind === true,
    canRefresh: value.canRefresh === true,
    maxTryouts: count(value.maxTryouts),
    staleDays: count(value.staleDays)
  };
  const last = value.lastRun as Record<string, unknown> | undefined;
  if (last && typeof last === 'object') {
    shaped.lastRun = {
      endedAt: typeof last.endedAt === 'string' ? last.endedAt.slice(0, 40) : '',
      tryoutsHeld: count(last.tryoutsHeld),
      completed: count(last.completed),
      blocked: count(last.blocked),
      failed: count(last.failed),
      ...(last.stopped === true ? { stopped: true } : {}),
      notes: Array.isArray(last.notes) ? last.notes.filter((note): note is string => typeof note === 'string').slice(0, 5).map((note) => note.slice(0, 200)) : []
    };
  }
  return shaped;
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
