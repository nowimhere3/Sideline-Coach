import * as http from 'node:http';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { PlayerRoster } from './player-roster';

export interface CoachReport {
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
};

export class CoachServer implements vscode.Disposable {
  private httpServer: http.Server | undefined;
  private readonly sseClients = new Set<http.ServerResponse>();
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getAccessToken: () => Promise<string>,
    private readonly playerRoster: PlayerRoster
  ) {}

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

  async getLatestReport(): Promise<CoachReport | undefined> {
    const reports = await this.scanReports(1, true);
    return reports[0];
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

    if (method === 'GET' && requestUrl.pathname === '/api/reports/latest') {
      const latest = await this.getLatestReport();
      if (!latest) {
        this.json(res, 404, { success: false, message: 'No matching reports found.' });
        return;
      }
      this.json(res, 200, latest);
      return;
    }

    if (method === 'GET' && requestUrl.pathname === '/api/reports') {
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

  private async buildStatus(): Promise<object> {
    const workspaceFolders = vscode.workspace.workspaceFolders?.map((folder) => folder.name) ?? [];
    const allowlist = new Set(this.getTerminalAllowlist());
    const terminals = vscode.window.terminals
      .map((terminal) => terminal.name)
      .filter((name) => allowlist.has(name));

    return {
      success: true,
      server: 'Sideline Coach',
      port: this.port,
      activeProject: vscode.workspace.workspaceFile
        ? path.basename(vscode.workspace.workspaceFile.fsPath)
        : workspaceFolders[0] ?? 'No workspace',
      workspaceRoots: workspaceFolders,
      terminals,
      modelSwitches: this.getModelSwitches(),
      players: await this.playerRoster.status()
    };
  }

  private async dispatch(body: DispatchBody, res: http.ServerResponse): Promise<void> {
    const playerInstanceId = typeof body.playerInstanceId === 'string' ? body.playerInstanceId.trim() : '';
    const terminalName = typeof body.terminalName === 'string' ? body.terminalName.trim() : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const modelSwitch = typeof body.modelSwitch === 'string' ? body.modelSwitch : '';

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
        const outcome = await this.playerRoster.deliverControlled(playerInstanceId, prompt.replace(/\u0000/g, ''));
        if (outcome.kind === 'accepted') {
          this.json(res, 200, { success: true, outcome: 'accepted', playerInstanceId, turnRef: outcome.turnRef, message: `Accepted by ${targetLabel}` });
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

  private async scanReports(limit: number, includeContent: boolean): Promise<CoachReport[]> {
    const globs = this.getReportGlobs();
    const maxReportBytes = vscode.workspace.getConfiguration('coach').get<number>('maxReportBytes', 2_097_152);
    const byUri = new Map<string, vscode.Uri>();

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

    for (const candidate of selected) {
      if (candidate.size > maxReportBytes) {
        continue;
      }
      const report = this.describeReport(candidate.uri, candidate.mtime);
      if (includeContent) {
        try {
          const bytes = await vscode.workspace.fs.readFile(candidate.uri);
          report.content = new TextDecoder('utf-8').decode(bytes);
        } catch {
          continue;
        }
      }
      reports.push(report);
    }

    return reports;
  }

  private describeReport(uri: vscode.Uri, mtime: number): CoachReport {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const project = folder?.name ?? 'Workspace';
    let relativePath = folder ? this.relativeUriPath(folder.uri, uri) : vscode.workspace.asRelativePath(uri, false);
    relativePath = relativePath.replace(/\\/g, '/');
    const segments = relativePath.split('/').filter(Boolean);
    const docsIndex = segments.findIndex((part) => part.toLowerCase() === 'docs report');
    const agent = docsIndex >= 0 && segments[docsIndex + 1] ? segments[docsIndex + 1] : 'Unknown Agent';

    return {
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

  private async readJsonBody(req: http.IncomingMessage): Promise<DispatchBody> {
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
      return {};
    }

    try {
      return JSON.parse(text) as DispatchBody;
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
