import * as http from 'node:http';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { PlayerRoster } from './player-roster';
import {
  resolveGameContext,
  resolveGameContextSync,
  getStadiumIdentity,
  loadGameRegistry,
  getSelectedGameId,
  setSelectedGameId,
  registerGameInRegistry,
  type ResolvedGameContext,
  type GameRecord,
  type GameRegistryState
} from './game-identity';
import type { RoutingMode, RoutingDecision, PlayerRoutingCapability } from './capability-types';
import { computeAutoRoute, createRoutingPolicies, type ProviderRoutingPolicy } from './routing-policy';

export interface CoachReport {
  gameId?: string;
  project: string;
  agent: string;
  filename: string;
  path: string;
  mtime: number;
  content: string;
}

type ModelSwitchMap = Record<string, string>;

type DispatchBody = {
  playerInstanceId?: unknown;
  terminalName?: unknown;
  prompt?: unknown;
  modelSwitch?: unknown;
  gameId?: unknown;
  routingMode?: unknown;
  model?: unknown;
  effort?: unknown;
};

export class CoachServer implements vscode.Disposable {
  private httpServer: http.Server | undefined;
  private readonly sseClients = new Set<http.ServerResponse>();
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;
  private selectedGameId = '';
  private routingMode: RoutingMode = 'auto';
  private manualSelection?: { playerInstanceId?: string; model?: string; effort?: string };
  private readonly policies = createRoutingPolicies();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getAccessToken: () => Promise<string>,
    private readonly playerRoster: PlayerRoster
  ) {
    this.initSelectedGame();
  }

  get isRunning(): boolean {
    return Boolean(this.httpServer?.listening);
  }

  get port(): number {
    return vscode.workspace.getConfiguration('coach').get<number>('port', 49152);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.disposed = false;
    this.installWatchers();

    this.httpServer = http.createServer((req, res) => {
      void this.route(req, res).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Sideline Coach] request failed:', error);
        if (!res.headersSent) {
          this.json(res, 500, { success: false, message });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      const srv = this.httpServer!;
      const onError = (error: Error): void => {
        srv.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        srv.off('error', onError);
        resolve();
      };
      srv.once('error', onError);
      srv.once('listening', onListening);
      srv.listen(this.port, '127.0.0.1');
    });
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        // Ignore shutdown races.
      }
    }
    this.sseClients.clear();

    if (!this.httpServer) {
      return;
    }

    const srv = this.httpServer;
    this.httpServer = undefined;
    if (!srv.listening) {
      return;
    }

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    void this.stop();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  async getLatestReport(targetGameId?: string): Promise<CoachReport | undefined> {
    if (targetGameId) {
      const reports = await this.scanReports(1, true, targetGameId);
      return reports[0];
    }
    const reports = await this.scanReports(1, true);
    return reports[0];
  }

  private initSelectedGame(): void {
    const connected = this.getConnectedGameContextSync();
    if (connected.game.gameId !== 'unknown') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      registerGameInRegistry(this.context.globalState, connected.game, workspaceFolder?.uri.fsPath);
    }
    const persisted = getSelectedGameId(this.context.globalState);
    if (persisted) {
      const registry = loadGameRegistry(this.context.globalState);
      if (registry.games[persisted]) {
        this.selectedGameId = persisted;
        return;
      }
    }
    this.selectedGameId = connected.game.gameId !== 'unknown' ? connected.game.gameId : '';
    if (this.selectedGameId) {
      setSelectedGameId(this.context.globalState, this.selectedGameId);
    }
  }

  async selectGame(gameId: string): Promise<boolean> {
    const registry = loadGameRegistry(this.context.globalState);
    const connected = this.getConnectedGameContextSync();
    if (!registry.games[gameId] && gameId !== connected.game.gameId) {
      return false;
    }
    this.selectedGameId = gameId;
    this.manualSelection = undefined;
    setSelectedGameId(this.context.globalState, gameId);
    this.broadcast('status', { type: 'game-select', gameId, at: Date.now() });
    return true;
  }

  private installWatchers(): void {
    if (this.disposables.length > 0) {
      return;
    }

    const globs = this.getReportGlobs();
    for (const glob of globs) {
      const watcher = vscode.workspace.createFileSystemWatcher(glob);
      const announce = (uri: vscode.Uri): void => {
        this.broadcast('reports', {
          type: 'report-change',
          path: vscode.workspace.asRelativePath(uri, false),
          at: Date.now()
        });
      };
      watcher.onDidCreate(announce, undefined, this.disposables);
      watcher.onDidChange(announce, undefined, this.disposables);
      watcher.onDidDelete(announce, undefined, this.disposables);
      this.disposables.push(watcher);
    }

    const markerWatcher = vscode.workspace.createFileSystemWatcher('**/.sideline/game.json');
    const announceMarker = (): void => {
      this.broadcast('status', { type: 'game-change', at: Date.now() });
    };
    markerWatcher.onDidCreate(announceMarker, undefined, this.disposables);
    markerWatcher.onDidChange(announceMarker, undefined, this.disposables);
    markerWatcher.onDidDelete(announceMarker, undefined, this.disposables);
    this.disposables.push(markerWatcher);

    this.disposables.push(
      vscode.window.onDidOpenTerminal(() => this.broadcast('status', { type: 'terminal-change', at: Date.now() })),
      vscode.window.onDidChangeActiveTerminal(() => this.broadcast('status', { type: 'terminal-change', at: Date.now() })),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.broadcast('status', { type: 'workspace-change', at: Date.now() })),
      this.playerRoster.onDidChange(() => this.broadcast('status', { type: 'player-roster-change', at: Date.now() })),
      this.playerRoster.onDidTurnChange((turn) => this.broadcast('turn', turn))
    );
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);

    this.setCommonHeaders(res);

    if (method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
      await this.serveIndex(res);
      return;
    }

    if (!requestUrl.pathname.startsWith('/api/')) {
      this.json(res, 404, { success: false, message: 'Not found' });
      return;
    }

    if (!(await this.isAuthorized(req, requestUrl))) {
      this.json(res, 401, { success: false, message: 'Unauthorized' });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/status') {
      this.json(res, 200, await this.buildStatus());
      return;
    }

    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/instance/')) {
      const parts = requestUrl.pathname.split('/');
      if (parts.length === 6) {
        const instanceId = decodeURIComponent(parts[4]);
        const verb = parts[5];
        if (verb === 'field') {
          const result = await this.playerRoster.putInstanceOnField(instanceId);
          this.json(res, result.success ? 200 : 400, result);
          return;
        }
        if (verb === 'bench') {
          const result = await this.playerRoster.takeOffField(instanceId);
          this.json(res, result.success ? 200 : 400, result);
          return;
        }
        if (verb === 'remove') {
          const result = await this.playerRoster.removePlayer(instanceId);
          this.json(res, result.success ? 200 : 400, result);
          return;
        }
      }
    }

    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/') && requestUrl.pathname.endsWith('/field')) {
      const playerId = requestUrl.pathname.slice('/api/players/'.length, -'/field'.length);
      const result = await this.playerRoster.putOnField(playerId);
      this.json(res, result.success ? 200 : 400, result);
      return;
    }

    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/') && requestUrl.pathname.endsWith('/instances')) {
      const playerId = requestUrl.pathname.slice('/api/players/'.length, -'/instances'.length);
      const result = await this.playerRoster.addInstance(playerId);
      this.json(res, result.success ? 200 : 400, result);
      return;
    }

    if (method === 'POST' && requestUrl.pathname.startsWith('/api/players/') && requestUrl.pathname.endsWith('/controlled-instances')) {
      const playerId = requestUrl.pathname.slice('/api/players/'.length, -'/controlled-instances'.length);
      const result = await this.playerRoster.addControlledInstance(playerId);
      this.json(res, result.success ? 200 : 400, result);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/games') {
      const connectedContext = this.getConnectedGameContextSync();
      const registryState = loadGameRegistry(this.context.globalState);
      const connectedGameId = connectedContext.game.gameId;
      const games = Object.values(registryState.games)
        .filter((g) => !g.isArchived)
        .map((g) => ({
          ...g,
          connectionStatus: (g.gameId === connectedGameId ? 'connected' : 'offline') as 'connected' | 'offline',
          isSelected: g.gameId === this.selectedGameId
        }));
      this.json(res, 200, {
        success: true,
        selectedGameId: this.selectedGameId,
        connectedGameId,
        games
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/game/select') {
      const body = await this.readJsonBody(req);
      const targetGameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
      if (!targetGameId) {
        this.json(res, 400, { success: false, message: 'Missing gameId in request body.' });
        return;
      }
      const success = await this.selectGame(targetGameId);
      if (!success) {
        this.json(res, 404, { success: false, message: `Game '${targetGameId}' is not found in registry.` });
        return;
      }
      this.json(res, 200, {
        success: true,
        selectedGameId: this.selectedGameId,
        status: await this.buildStatus()
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/game/add') {
      let body: Record<string, unknown> = {};
      try {
        body = await this.readJsonBody(req);
      } catch {
        // empty body allowed
      }
      const folderPath = typeof body.path === 'string' ? body.path.trim() : '';
      if (folderPath) {
        const fakeFolder = { uri: vscode.Uri.file(folderPath), name: path.basename(folderPath) || 'Game' };
        const resolved = resolveGameContextSync({ workspaceFolder: fakeFolder, memento: this.context.globalState });
        if (resolved.game.gameId === 'unknown') {
          this.json(res, 400, { success: false, message: 'Could not resolve Game identity for provided path.' });
          return;
        }
        const { record } = registerGameInRegistry(this.context.globalState, resolved.game, folderPath);
        await this.selectGame(record.gameId);
        this.json(res, 200, {
          success: true,
          game: record,
          selectedGameId: this.selectedGameId,
          status: await this.buildStatus()
        });
        return;
      }

      void vscode.commands.executeCommand('coach.addGame');
      this.json(res, 200, { success: true, message: 'Add Game dialog triggered.' });
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/reports/latest') {
      const filterGameId = requestUrl.searchParams.get('gameId') || undefined;
      const latest = await this.getLatestReport(filterGameId);
      if (!latest) {
        this.json(res, 404, { success: false, message: 'No matching reports found.' });
        return;
      }
      this.json(res, 200, latest);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/reports') {
      const filterGameId = requestUrl.searchParams.get('gameId');
      if (filterGameId) {
        this.json(res, 200, await this.scanReports(5, true, filterGameId));
        return;
      }
      this.json(res, 200, await this.scanReports(5, true));
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/events') {
      this.openEventStream(req, res);
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/dispatch') {
      const body = await this.readJsonBody(req);
      await this.dispatch(body, res);
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/route') {
      const body = await this.readJsonBody(req);
      if (body.mode === 'auto' || body.mode === 'manual') {
        this.routingMode = body.mode;
      }
      if (body.playerInstanceId !== undefined || body.model !== undefined || body.effort !== undefined) {
        this.manualSelection = {
          playerInstanceId: typeof body.playerInstanceId === 'string' ? body.playerInstanceId : this.manualSelection?.playerInstanceId,
          model: typeof body.model === 'string' ? body.model : (body.model === null ? undefined : this.manualSelection?.model),
          effort: typeof body.effort === 'string' ? body.effort : (body.effort === null ? undefined : this.manualSelection?.effort)
        };
      }
      this.broadcast('status', { type: 'routing-change', at: Date.now() });
      this.json(res, 200, {
        success: true,
        routing: {
          mode: this.routingMode,
          manualSelection: this.manualSelection
        }
      });
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/route/preview') {
      const body = await this.readJsonBody(req);
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const gameContext = await this.getResolvedGameContext();
      const capabilities = this.playerRoster.getRoutingCapabilities(gameContext.game.gameId);
      const result = computeAutoRoute(gameContext.game.gameId, prompt, capabilities, this.policies);
      if (result.decision) {
        this.json(res, 200, { success: true, decision: result.decision });
      } else {
        this.json(res, 200, { success: false, error: result.error });
      }
      return;
    }

    if (method === 'POST' && requestUrl.pathname === '/api/capabilities/refresh') {
      let provider: string | undefined;
      try {
        const body = await this.readJsonBody(req);
        if (typeof body.provider === 'string') provider = body.provider;
      } catch {
        // empty body allowed
      }
      await this.playerRoster.refreshCapabilities(provider);
      this.broadcast('status', { type: 'capabilities-refresh', at: Date.now() });
      this.json(res, 200, { success: true, message: 'Capabilities refreshed.' });
      return;
    }

    this.json(res, 404, { success: false, message: 'API route not found' });
  }

  private async serveIndex(res: http.ServerResponse): Promise<void> {
    const fileUri = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'public', 'index.html');
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': bytes.byteLength
      });
      res.end(Buffer.from(bytes));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.json(res, 500, { success: false, message: `Could not load mobile UI: ${message}` });
    }
  }

  private getConnectedGameContextSync(): ResolvedGameContext {
    return resolveGameContextSync({
      workspaceFolder: vscode.workspace.workspaceFolders?.[0],
      memento: this.context.globalState
    });
  }

  private async getSelectedGameContext(): Promise<ResolvedGameContext> {
    const connected = await resolveGameContext({
      workspaceFolder: vscode.workspace.workspaceFolders?.[0],
      memento: this.context.globalState
    });

    if (!this.selectedGameId || this.selectedGameId === connected.game.gameId) {
      return connected;
    }

    const registry = loadGameRegistry(this.context.globalState);
    const record = registry.games[this.selectedGameId];
    if (record) {
      const stadium = getStadiumIdentity();
      return {
        game: {
          gameId: record.gameId,
          displayName: record.displayName,
          fingerprintSource: record.fingerprintSource,
          repoUri: record.repoUri
        },
        stadium,
        binding: {
          gameId: record.gameId,
          stadiumId: stadium.stadiumId,
          rootFsPath: record.knownRootFsPaths[0] || '',
          boundAt: record.addedAt,
          isPrimary: false,
          status: 'unbound'
        }
      };
    }

    return connected;
  }

  private async getResolvedGameContext(): Promise<ResolvedGameContext> {
    return this.getSelectedGameContext();
  }

  private async buildStatus(): Promise<object> {
    const workspaceFolders = vscode.workspace.workspaceFolders?.map((folder) => folder.name) ?? [];
    const allowlist = new Set(this.getTerminalAllowlist());
    const terminals = vscode.window.terminals
      .map((terminal) => terminal.name)
      .filter((name) => allowlist.has(name));

    const connectedContext = this.getConnectedGameContextSync();
    const selectedContext = await this.getSelectedGameContext();
    const registryState = loadGameRegistry(this.context.globalState);

    const connectedGameId = connectedContext.game.gameId;
    const isConnected = selectedContext.game.gameId !== 'unknown' && (selectedContext.game.gameId === connectedGameId);
    const connectionStatus: 'connected' | 'offline' = isConnected ? 'connected' : 'offline';

    const games = Object.values(registryState.games)
      .filter((g) => !g.isArchived)
      .map((g) => ({
        ...g,
        connectionStatus: (g.gameId === connectedGameId ? 'connected' : 'offline') as 'connected' | 'offline',
        isSelected: g.gameId === this.selectedGameId
      }));

    const capabilities = this.playerRoster.getRoutingCapabilities(this.selectedGameId);

    let autoDecision: RoutingDecision | undefined;
    let autoError: string | undefined;

    if (!isConnected) {
      autoError = `Game '${selectedContext.game.displayName}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`;
    } else if (selectedContext.game.gameId !== 'unknown') {
      const autoResult = computeAutoRoute(selectedContext.game.gameId, '', capabilities, this.policies);
      if (autoResult.decision) {
        autoDecision = autoResult.decision;
      } else {
        autoError = autoResult.error;
      }
    }

    const players = await this.playerRoster.status(this.selectedGameId);

    return {
      success: true,
      server: 'Sideline Coach',
      port: this.port,
      game: selectedContext.game,
      stadium: selectedContext.stadium,
      selectedGameId: this.selectedGameId,
      connectedGameId,
      connectionStatus,
      games,
      activeProject: selectedContext.game.gameId === 'unknown'
        ? 'No workspace'
        : selectedContext.game.displayName,
      workspaceRoots: workspaceFolders,
      terminals,
      modelSwitches: this.getModelSwitches(),
      players,
      routing: {
        mode: this.routingMode,
        activeDecision: autoDecision,
        autoError,
        capabilities,
        manualSelection: this.manualSelection
      }
    };
  }

  private async dispatch(body: DispatchBody, res: http.ServerResponse): Promise<void> {
    const requestedPlayerInstanceId = typeof body.playerInstanceId === 'string' ? body.playerInstanceId.trim() : '';
    const terminalName = typeof body.terminalName === 'string' ? body.terminalName.trim() : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const modelSwitch = typeof body.modelSwitch === 'string' ? body.modelSwitch : '';
    const clientGameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
    const requestedRoutingMode = typeof body.routingMode === 'string' && (body.routingMode === 'auto' || body.routingMode === 'manual')
      ? body.routingMode as RoutingMode
      : undefined;
    const requestedModel = typeof body.model === 'string' ? body.model.trim() : undefined;
    const requestedEffort = typeof body.effort === 'string' ? body.effort.trim() : undefined;

    const maxPromptChars = vscode.workspace.getConfiguration('coach').get<number>('maxPromptChars', 100000);
    const allowedModelCommands = new Set(Object.values(this.getModelSwitches()));

    if (!prompt.trim()) {
      this.json(res, 400, { success: false, message: 'Prompt cannot be empty.' });
      return;
    }
    if (prompt.length > maxPromptChars) {
      this.json(res, 413, { success: false, message: `Prompt exceeds ${maxPromptChars} characters.` });
      return;
    }
    if (!allowedModelCommands.has(modelSwitch)) {
      this.json(res, 400, { success: false, message: 'Model switch command is not allowlisted.' });
      return;
    }

    const connectedContext = this.getConnectedGameContextSync();
    const activeConnectedGameId = connectedContext.game.gameId;
    const selectedContext = await this.getSelectedGameContext();
    const activeGameId = selectedContext.game.gameId;

    if (activeConnectedGameId === 'unknown') {
      this.json(res, 400, { success: false, message: 'No Game workspace is currently active. Open a workspace in VS Code to dispatch Plays.' });
      return;
    }
    if (activeGameId !== activeConnectedGameId) {
      this.json(res, 400, {
        success: false,
        message: `Game '${selectedContext.game.displayName}' is offline. Connect its Stadium or open in VS Code to dispatch Plays.`
      });
      return;
    }
    if (clientGameId && (clientGameId !== activeGameId || clientGameId !== activeConnectedGameId)) {
      this.json(res, 409, {
        success: false,
        message: `Play targeted Game '${clientGameId}', but active Game is '${activeConnectedGameId}'.`
      });
      return;
    }

    const effectiveRoutingMode = requestedRoutingMode ?? (requestedPlayerInstanceId ? 'manual' : this.routingMode);

    let playerInstanceId = requestedPlayerInstanceId;
    let targetModel = requestedModel;
    let targetEffort = requestedEffort;

    if (effectiveRoutingMode === 'auto') {
      const capabilities = this.playerRoster.getRoutingCapabilities(activeGameId);
      const autoResult = computeAutoRoute(activeGameId, prompt, capabilities, this.policies);
      if (!autoResult.decision) {
        this.json(res, 400, { success: false, message: autoResult.error ?? 'Automatic routing failed.' });
        return;
      }
      playerInstanceId = autoResult.decision.playerInstanceId;
      targetModel = autoResult.decision.model;
      targetEffort = autoResult.decision.effort;
    }

    let terminal: vscode.Terminal | undefined;
    let targetLabel = terminalName;
    if (playerInstanceId) {
      const resolution = this.playerRoster.resolve(playerInstanceId);
      if (resolution.state === 'pending') {
        this.json(res, 409, { success: false, message: 'That Player is reconnecting — try again in a moment.' });
        return;
      }
      if (resolution.state === 'unavailable') {
        this.json(res, 409, { success: false, message: resolution.message });
        return;
      }
      if (resolution.state !== 'live') {
        this.json(res, 404, { success: false, message: 'That Player has left the field.' });
        return;
      }
      targetLabel = resolution.instance.fieldLabel;
      if (resolution.transport === 'controlled') {
        if (modelSwitch) {
          this.json(res, 400, { success: false, message: 'Legacy model-switch commands are not valid for a controlled Player.' });
          return;
        }
        const outcome = await this.playerRoster.deliverControlled(playerInstanceId, prompt.replace(/\u0000/g, ''), { model: targetModel || undefined, effort: targetEffort || undefined });
        if (outcome.kind === 'accepted') {
          this.json(res, 200, {
            success: true,
            outcome: 'accepted',
            playerInstanceId,
            turnRef: outcome.turnRef,
            routing: {
              mode: effectiveRoutingMode,
              model: targetModel,
              effort: targetEffort
            },
            message: `Accepted by ${targetLabel}`
          });
          return;
        }
        if (outcome.kind === 'unknown') {
          this.json(res, 202, { success: false, outcome: 'unknown', playerInstanceId, message: `Delivery to ${targetLabel} is Unknown: ${outcome.reason}` });
          return;
        }
        const status = outcome.reason === 'closed' ? 404 : outcome.reason === 'busy' ? 409 : outcome.reason === 'invalid' ? 400 : 503;
        this.json(res, status, { success: false, outcome: 'refused', playerInstanceId, reason: outcome.reason, message: outcome.message });
        return;
      }
      terminal = resolution.terminal;
    } else {
      const allowedNames = new Set(this.getTerminalAllowlist());
      if (!terminalName || !allowedNames.has(terminalName)) {
        this.json(res, 400, { success: false, message: 'Target terminal is not in coach.terminalAllowlist.' });
        return;
      }
      const matches = vscode.window.terminals.filter((candidate) => candidate.name === terminalName);
      if (matches.length === 0) { this.json(res, 404, { success: false, message: `Terminal '${terminalName}' is not currently open.` }); return; }
      if (matches.length > 1) { this.json(res, 409, { success: false, message: `More than one terminal is named '${terminalName}'. Rename them so the target is unique.` }); return; }
      terminal = matches[0];
    }
    if (modelSwitch) {
      terminal.sendText(modelSwitch, true);
    }
    terminal.sendText(prompt.replace(/\u0000/g, ''), true);

    this.json(res, 200, { success: true, outcome: 'sent-to-terminal', playerInstanceId: playerInstanceId || undefined, message: `Dispatched to ${targetLabel}` });
  }

  /**
   * Reports belonging to ONE Game — the Stadium's own. The detached Stadium must
   * never filter by the legacy local server's persisted selection: that value is
   * shared across windows through globalState, so one Game selected anywhere made
   * every other Stadium publish zero reports (P0 Incoming regression).
   */
  async scanReportsForGame(gameId: string, limit = 10): Promise<CoachReport[]> {
    if (!gameId || gameId === 'unknown') return [];
    return this.scanReports(limit, true, gameId);
  }

  /** The Game's configured report contract. */
  reportGlobs(): string[] {
    return this.getReportGlobs();
  }

  private async scanReports(limit: number, includeContent: boolean, targetGameId?: string): Promise<CoachReport[]> {
    const globs = this.getReportGlobs();
    const maxReportBytes = vscode.workspace.getConfiguration('coach').get<number>('maxReportBytes', 2_097_152);
    const byUri = new Map<string, vscode.Uri>();
    const effectiveGameId = targetGameId || this.selectedGameId;

    for (const glob of globs) {
      const found = await vscode.workspace.findFiles(glob, '**/{.git,node_modules}/**', 500);
      for (const uri of found) {
        byUri.set(uri.toString(), uri);
      }
    }

    const candidates: Array<{ uri: vscode.Uri; mtime: number; size: number }> = [];
    for (const uri of byUri.values()) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if ((stat.type & vscode.FileType.File) !== 0) {
          candidates.push({ uri, mtime: stat.mtime, size: stat.size });
        }
      } catch {
        // A report may disappear between search and stat. Skip it.
      }
    }

    candidates.sort((a, b) => b.mtime - a.mtime);
    const selected = candidates.slice(0, limit);
    const reports: CoachReport[] = [];

    for (const candidate of candidates) {
      if (candidate.size > maxReportBytes) {
        continue;
      }
      const report = this.describeReport(candidate.uri, candidate.mtime);
      if (effectiveGameId && report.gameId && report.gameId !== 'unknown' && report.gameId !== effectiveGameId) {
        continue;
      }
      if (includeContent) {
        try {
          const bytes = await vscode.workspace.fs.readFile(candidate.uri);
          report.content = new TextDecoder('utf-8').decode(bytes);
        } catch {
          continue;
        }
      }
      reports.push(report);
      if (reports.length >= limit) {
        break;
      }
    }

    return reports;
  }

  private describeReport(uri: vscode.Uri, mtime: number): CoachReport {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    let gameId = 'unknown';
    let project = folder?.name ?? 'External';
    if (folder) {
      const folderContext = resolveGameContextSync({ workspaceFolder: folder, memento: this.context.globalState });
      gameId = folderContext.game.gameId;
      project = folderContext.game.displayName;
    }
    let relativePath = folder ? this.relativeUriPath(folder.uri, uri) : vscode.workspace.asRelativePath(uri, false);
    relativePath = relativePath.replace(/\\/g, '/');
    const segments = relativePath.split('/').filter(Boolean);
    const docsIndex = segments.findIndex((part) => part.toLowerCase() === 'docs report' || part.toLowerCase() === 'reports');
    // The agent is the folder under the report root, never the filename itself.
    const agent = docsIndex >= 0 && docsIndex + 1 < segments.length - 1 ? segments[docsIndex + 1] : 'Unknown Agent';

    return {
      gameId,
      project,
      agent,
      filename: segments.at(-1) ?? path.basename(uri.fsPath),
      path: relativePath,
      mtime,
      content: ''
    };
  }

  private relativeUriPath(root: vscode.Uri, child: vscode.Uri): string {
    if (root.scheme === 'file' && child.scheme === 'file') {
      return path.relative(root.fsPath, child.fsPath);
    }
    const rootPath = root.path.endsWith('/') ? root.path : `${root.path}/`;
    return child.path.startsWith(rootPath) ? child.path.slice(rootPath.length) : child.path;
  }

  private getReportGlobs(): string[] {
    const configured = vscode.workspace.getConfiguration('coach').get<string[]>('reportGlobs', []);
    return configured.length > 0 ? configured : ['**/Docs REPORT/**/*.{md,txt}'];
  }

  private getTerminalAllowlist(): string[] {
    return vscode.workspace.getConfiguration('coach').get<string[]>('terminalAllowlist', ['Codex', 'Claude', 'AntiGravity']);
  }

  private getModelSwitches(): ModelSwitchMap {
    const configured = vscode.workspace.getConfiguration('coach').get<ModelSwitchMap>('modelSwitches');
    return configured && Object.keys(configured).length > 0
      ? configured
      : { Default: '', Opus: '/model opus', Sonnet: '/model sonnet' };
  }

  private async isAuthorized(req: http.IncomingMessage, requestUrl: URL): Promise<boolean> {
    const expected = await this.getAccessToken();
    const auth = req.headers.authorization ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const supplied = bearer || requestUrl.searchParams.get('token') || '';

    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
  }

  private openEventStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ connected: true, at: Date.now() })}\n\n`);
    this.sseClients.add(res);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
    });
  }

  private broadcast(event: string, payload: object): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of [...this.sseClients]) {
      if (client.writableEnded) {
        this.sseClients.delete(client);
        continue;
      }
      client.write(frame);
    }
  }

  private async readJsonBody<T = Record<string, unknown>>(req: http.IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const hardLimit = 1_500_000;

    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > hardLimit) {
        throw new Error('Request body is too large.');
      }
      chunks.push(buffer);
    }

    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Request body must be valid JSON.');
    }
  }

  private setCommonHeaders(res: http.ServerResponse): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
  }

  private json(res: http.ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
  }
}
