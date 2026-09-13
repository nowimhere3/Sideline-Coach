import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as child_process from 'node:child_process';
import * as vscode from 'vscode';
import { CodexAppServerFactory } from './player-control/codex-app-server';
import { PlayerControlHost } from './player-control/host';
import { createAntiGravityControlFactory, createClaudeControlFactory } from './player-control/structured-print';
import { PlayerRoster } from './player-roster';
import { CoachServer } from './server';
import { WorkspaceStateBindingStore } from './workspace-state-binding-store';
import { ensureControlPlaneRunning, type EnsuredControlPlane } from './control-plane/launcher';
import { computeControlPlaneBuild } from './control-plane/freshness';
import { StadiumClient } from './stadium-client';
import { ReportPublisher } from './report-publisher';

import { registerGameInRegistry, resolveGameContextSync, setSelectedGameId } from './game-identity';
import {
  buildDevelopmentInstancePlan,
  chooseOpenStrategy,
  describeOpenFailure
} from './game-window-opener';
import type { GameOpenParams, GameOpenResult, GamePickResult, PlayerLifecycleResult } from './control-plane/protocol';

const TOKEN_SECRET_KEY = 'sidelineCoach.accessToken';

let server: CoachServer | undefined;
let stadiumClient: StadiumClient | undefined;
let controlPlaneRecord: EnsuredControlPlane | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let playerRoster: PlayerRoster | undefined;
let playerControlHost: PlayerControlHost | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const resolved = resolveGameContextSync({ workspaceFolder, memento: context.globalState });
    if (resolved.game.gameId !== 'unknown') {
      registerGameInRegistry(context.globalState, resolved.game, workspaceFolder.uri.fsPath);
    }
  }

  playerControlHost = new PlayerControlHost(new WorkspaceStateBindingStore(context.workspaceState));
  playerControlHost.register('codex', new CodexAppServerFactory());
  playerControlHost.register('claude', createClaudeControlFactory());
  playerControlHost.register('antigravity', createAntiGravityControlFactory());
  playerRoster = new PlayerRoster(
    context.workspaceState,
    playerControlHost,
    () => resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState })
  );
  context.subscriptions.push(playerRoster);

  // Maintain local CoachServer instance for report scanning and backward compatibility
  server = new CoachServer(context, getAccessToken, playerRoster);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  statusBar.command = 'coach.copyMobileUrl';
  statusBar.tooltip = 'Sideline Coach. Click to copy the mobile URL.';
  context.subscriptions.push(statusBar);

  async function getAccessToken(): Promise<string> {
    const sidelineDir = process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline');
    const tokenFile = path.join(sidelineDir, 'token');
    try {
      if (fs.existsSync(tokenFile)) {
        const stored = fs.readFileSync(tokenFile, 'utf8').trim();
        if (stored) return stored;
      }
    } catch {}

    const existing = await context.secrets.get(TOKEN_SECRET_KEY);
    if (existing) {
      return existing;
    }

    const generated = crypto.randomBytes(24).toString('base64url');
    await context.secrets.store(TOKEN_SECRET_KEY, generated);
    return generated;
  }

  // Freshness Guard: the Control Plane build THIS window loaded. Computed once at
  // activation, so a later compile on disk can never masquerade as what we run.
  const daemonScriptPath = context.asAbsolutePath('out/control-plane/daemon.js');
  let expectedControlPlaneBuild: string | undefined;
  try { expectedControlPlaneBuild = computeControlPlaneBuild(daemonScriptPath).buildId; } catch { expectedControlPlaneBuild = undefined; }
  let controlPlaneUpdating = false;
  const resolveControlPlane = (): Promise<EnsuredControlPlane> => ensureControlPlaneRunning({
    daemonScriptPath,
    expectedBuildId: expectedControlPlaneBuild,
    diskBuildId: () => computeControlPlaneBuild(daemonScriptPath).buildId
  });

  const refreshStatusBar = (): void => {
    if (!statusBar) {
      return;
    }

    if (controlPlaneUpdating && !stadiumClient?.isConnected) {
      // Dad Mode: no PIDs or build hashes, just what is happening.
      statusBar.text = '$(sync~spin) Coach: Updating…';
      statusBar.backgroundColor = undefined;
    } else if (stadiumClient?.isConnected) {
      statusBar.text = `$(radio-tower) Coach: Connected (:${controlPlaneRecord?.port ?? 3100})`;
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = '$(circle-slash) Coach: Disconnected';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBar.show();
  };

  const startServer = async (): Promise<void> => {
    if (stadiumClient?.isConnected) {
      vscode.window.showInformationMessage(`Sideline Coach is already connected to Control Plane on port ${controlPlaneRecord?.port}.`);
      refreshStatusBar();
      return;
    }

    try {
      controlPlaneUpdating = true;
      refreshStatusBar();
      controlPlaneRecord = await resolveControlPlane();
      controlPlaneUpdating = false;

      if (!stadiumClient) {
        stadiumClient = new StadiumClient({
          port: controlPlaneRecord.port,
          controlPlaneBuildId: expectedControlPlaneBuild,
          resolveControlPlane: async () => {
            controlPlaneUpdating = true;
            refreshStatusBar();
            try {
              controlPlaneRecord = await resolveControlPlane();
              return { port: controlPlaneRecord.port, freshness: controlPlaneRecord.freshness };
            } finally {
              controlPlaneUpdating = false;
              refreshStatusBar();
            }
          },
          gameContextGetter: () =>
            resolveGameContextSync({
              workspaceFolder: vscode.workspace.workspaceFolders?.[0],
              memento: context.globalState
            }),
          playerRoster: playerRoster!,
          playerControlHost: playerControlHost!,
          // Always THIS Stadium's Game. Never the legacy server's persisted selection,
          // which globalState shares across windows (P0 Incoming regression).
          reportsGetter: async () => {
            if (!server) return [];
            const gameId = resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState }).game.gameId;
            return server.scanReportsForGame(gameId, 10);
          },
          addGame: async () => {
            await vscode.commands.executeCommand('coach.addGame');
            return { success: true, message: 'Add Game dialog opened in VS Code.' };
          },
          pickGame: () => pickGameFolder(),
          openGame: (params) => openGameWindow(params),
          playerLifecycle: (method, params) => handlePlayerLifecycle(method, params),
          sendTerminalText: (terminalName, text) => {
            const matches = vscode.window.terminals.filter((candidate) => candidate.name === terminalName);
            if (matches.length > 0) {
              matches[0].sendText(text.replace(/\u0000/g, ''), true);
              return true;
            }
            return false;
          }
        });

        playerRoster!.onDidChange(() => {
          void stadiumClient?.sendRosterChanged();
          stadiumClient?.sendCapabilitySnapshot();
          stadiumClient?.sendDiscoveryChanged();
        });

        playerRoster!.onDidTurnChange((turn) => {
          stadiumClient?.sendTurnChanged(turn);
        });

        // The report return loop: a report landing in this Game reaches Incoming
        // without a reload or refresh. Changing coach.reportGlobs rebuilds watchers.
        const reportPublisher = new ReportPublisher({
          getGlobs: () => server?.reportGlobs() ?? [],
          createWatcher: (glob, onEvent) => {
            const watcher = vscode.workspace.createFileSystemWatcher(glob);
            watcher.onDidCreate(onEvent);
            watcher.onDidChange(onEvent);
            watcher.onDidDelete(onEvent);
            return watcher;
          },
          onReportConfigurationChanged: (listener) => vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('coach.reportGlobs') || event.affectsConfiguration('coach.maxReportBytes')) listener();
          })
        }, () => stadiumClient?.publishReportsChanged());
        reportPublisher.start();
        context.subscriptions.push(reportPublisher);

        stadiumClient.on('connected', () => refreshStatusBar());
        stadiumClient.on('disconnected', () => refreshStatusBar());
      } else {
        stadiumClient.setPort(controlPlaneRecord.port);
        stadiumClient.setToken('');
      }

      stadiumClient.setControlPlaneFreshness(controlPlaneRecord.freshness);
      const connected = await stadiumClient.connect();
      refreshStatusBar();
      if (connected) {
        vscode.window.showInformationMessage(`Sideline Coach connected to Control Plane on 127.0.0.1:${controlPlaneRecord.port}.`);
      } else {
        vscode.window.showWarningMessage(`Sideline Coach spawned Control Plane; connecting...`);
      }
    } catch (error) {
      refreshStatusBar();
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Sideline Coach failed to connect to Control Plane: ${message}`);
    }
  };

  const stopServer = async (): Promise<void> => {
    if (!stadiumClient?.isConnected) {
      refreshStatusBar();
      return;
    }
    stadiumClient.disconnect();
    refreshStatusBar();
    vscode.window.showInformationMessage('Sideline Coach disconnected from Control Plane.');
  };

  const copyLatestReport = async (): Promise<void> => {
    const worker = server ?? new CoachServer(context, getAccessToken, playerRoster!);
    const latest = await worker.getLatestReport();
    if (!latest) {
      vscode.window.showWarningMessage('Sideline Coach could not find any reports matching coach.reportGlobs.');
      return;
    }
    await vscode.env.clipboard.writeText(latest.content);
    vscode.window.showInformationMessage(`Copied latest report: ${latest.filename}`);
  };

  const copyMobileUrl = async (): Promise<void> => {
    const config = vscode.workspace.getConfiguration('coach');
    const configuredPublicUrl = config.get<string>('publicUrl', '').trim();
    let port = controlPlaneRecord?.port;
    if (!port) {
      try {
        controlPlaneRecord = await resolveControlPlane();
        port = controlPlaneRecord.port;
      } catch {
        port = 3100;
      }
    }
    const base = (configuredPublicUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '');
    const token = await getAccessToken();
    const url = `${base}/?token=${encodeURIComponent(token)}`;
    await vscode.env.clipboard.writeText(url);

    if (configuredPublicUrl) {
      vscode.window.showInformationMessage('Sideline Coach mobile URL copied to clipboard.');
    } else {
      vscode.window.showInformationMessage(
        'Local Coach URL copied. Set coach.publicUrl to your Tailscale Serve or Cloudflare HTTPS URL for a phone-ready link.'
      );
    }
  };

  /**
   * The native repository picker. A browser cannot safely enumerate local paths,
   * and the Control Plane has no UI, so the Stadium owns this step: the browser
   * expresses intent, VS Code shows its own folder dialog, and only a resolved
   * path and Game identity travel back.
   */
  const pickGameFolder = async (): Promise<GamePickResult> => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Add Game',
      title: 'Choose a repository to coach'
    });
    if (!uris || uris.length === 0) {
      return { success: false, cancelled: true, message: 'No repository chosen.' };
    }

    const selectedUri = uris[0];
    const folderName = path.basename(selectedUri.fsPath) || 'Game';
    const resolved = resolveGameContextSync({
      workspaceFolder: { uri: selectedUri, name: folderName },
      memento: context.globalState
    });

    if (resolved.game.gameId === 'unknown') {
      return {
        success: false,
        folderPath: selectedUri.fsPath,
        message: 'Coach could not identify a Game in that folder. Choose a git repository, or add a .sideline/game.json marker.'
      };
    }

    registerGameInRegistry(context.globalState, resolved.game, selectedUri.fsPath);
    return { success: true, folderPath: selectedUri.fsPath, game: resolved.game };
  };

  /**
   * Open a VS Code window for a Game.
   *
   * Product path: `vscode.openFolder` uses the human's own VS Code, profile and
   * installed extensions, so Coach activates in the new window by itself. VS Code
   * focuses an already-open folder instead of duplicating it, which is exactly
   * the already-open behaviour Add Game wants.
   *
   * Development path: under an Extension Development Host the extension is not
   * installed, so a plain window would contain no Coach at all. Q2.8G proved a
   * second host needs its own VS Code instance; that shape is reused here purely
   * so the lifecycle can be field-tested before packaging.
   */
  const openGameWindow = async (params: GameOpenParams): Promise<GameOpenResult> => {
    if (!params.folderPath || !fs.existsSync(params.folderPath)) {
      return { success: false, outcome: 'failed', message: describeOpenFailure('no-folder') };
    }

    const strategy = chooseOpenStrategy(context.extensionMode);

    if (strategy === 'vscode-open-folder') {
      try {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(params.folderPath), {
          forceNewWindow: true
        });
        return { success: true, outcome: 'opened', message: `Opening ${params.displayName ?? 'Game'}…` };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { success: false, outcome: 'failed', message: describeOpenFailure('unknown', detail) };
      }
    }

    const executable = resolveDevelopmentVSCode();
    if (!executable) {
      return { success: false, outcome: 'failed', message: describeOpenFailure('no-vscode') };
    }

    const plan = buildDevelopmentInstancePlan({
      extensionSourcePath: context.extensionPath,
      folderPath: params.folderPath,
      gameId: params.gameId,
      devHostsDir: path.join(process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline'), 'dev-hosts')
    });

    try {
      fs.mkdirSync(plan.userDataDir, { recursive: true });
      fs.mkdirSync(plan.extensionsDir, { recursive: true });
      const child = child_process.spawn(executable, plan.args, { detached: true, stdio: 'ignore' });
      child.unref();
      return {
        success: true,
        outcome: 'opened',
        message: `Opening ${params.displayName ?? 'Game'} in a development host…`
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { success: false, outcome: 'failed', message: describeOpenFailure('unknown', detail) };
    }
  };

  /** Development-only VS Code discovery; never used on the product path. */
  const resolveDevelopmentVSCode = (): string | undefined => {
    const override = (process.env.SIDELINE_DEV_VSCODE ?? '').trim();
    if (override) return override;
    if (process.platform === 'win32') {
      for (const base of [process.env.LOCALAPPDATA, process.env.PROGRAMFILES]) {
        if (!base) continue;
        const candidate = path.join(base, 'Programs', 'Microsoft VS Code', 'Code.exe');
        if (fs.existsSync(candidate)) return candidate;
        const direct = path.join(base, 'Microsoft VS Code', 'Code.exe');
        if (fs.existsSync(direct)) return direct;
      }
      return undefined;
    }
    return process.platform === 'darwin'
      ? '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
      : 'code';
  };

  /** One dispatch point for Q2.9 Player lifecycle RPCs from the Control Plane. */
  const handlePlayerLifecycle = async (
    method: string,
    params: Record<string, unknown>
  ): Promise<PlayerLifecycleResult> => {
    if (!playerRoster) return { success: false, message: 'No roster is available in this Stadium.' };

    switch (method) {
      case 'player.discover': {
        const discovery = await playerRoster.discoverPlayers();
        return { success: true, discovery: discovery as unknown };
      }
      case 'player.addTerminal':
        return playerRoster.addTerminalPlayer();
      case 'player.takeOffField':
        return playerRoster.takeOffField(String(params.playerInstanceId ?? params.instanceId ?? params.playerId ?? ''));
      case 'player.putOnField':
        return playerRoster.putInstanceOnField(String(params.playerInstanceId ?? params.instanceId ?? params.playerId ?? ''));
      case 'player.remove':
        return playerRoster.removePlayer(String(params.playerInstanceId ?? params.instanceId ?? params.playerId ?? ''));
      case 'player.adopt':
        return playerRoster.adoptExternalPlayer(Number(params.shellPid));
      case 'player.adoptTerminal':
        return playerRoster.adoptTerminal(Number(params.shellPid));
      case 'player.helperTerminal':
        return playerRoster.openHelperTerminal(
          String(params.playerType ?? ''),
          params.purpose === 'authenticate' ? 'authenticate' : 'install'
        );
      case 'player.terminalSend':
        return playerRoster.sendToTerminalPlayer(
          String(params.playerInstanceId ?? ''),
          String(params.text ?? ''),
          params.enter !== false
        );
      default:
        return { success: false, message: `Unsupported Player lifecycle action: ${method}` };
    }
  };

  const addGame = async (): Promise<void> => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select Game Repository Folder'
    });
    if (!uris || uris.length === 0) return;
    const selectedUri = uris[0];
    const folderName = path.basename(selectedUri.fsPath) || 'Game';
    const fakeFolder = { uri: selectedUri, name: folderName };
    const resolved = resolveGameContextSync({ workspaceFolder: fakeFolder, memento: context.globalState });
    if (resolved.game.gameId !== 'unknown') {
      registerGameInRegistry(context.globalState, resolved.game, selectedUri.fsPath);
      setSelectedGameId(context.globalState, resolved.game.gameId);
      if (server) {
        await server.selectGame(resolved.game.gameId);
      }
      vscode.window.showInformationMessage(`Added Game: ${resolved.game.displayName}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('coach.startServer', startServer),
    vscode.commands.registerCommand('coach.stopServer', stopServer),
    vscode.commands.registerCommand('coach.copyLatestReport', copyLatestReport),
    vscode.commands.registerCommand('coach.copyMobileUrl', copyMobileUrl),
    vscode.commands.registerCommand('coach.addGame', addGame)
  );

  refreshStatusBar();

  if (vscode.workspace.getConfiguration('coach').get<boolean>('autoStart', true)) {
    await startServer();
  }
}

export async function deactivate(): Promise<void> {
  stadiumClient?.dispose();
  stadiumClient = undefined;
  await playerControlHost?.dispose();
  playerControlHost = undefined;
  playerRoster = undefined;
}
