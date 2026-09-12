import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { CodexAppServerFactory } from './player-control/codex-app-server';
import { PlayerControlHost } from './player-control/host';
import { PlayerRoster } from './player-roster';
import { CoachServer } from './server';
import { WorkspaceStateBindingStore } from './workspace-state-binding-store';
import { ensureControlPlaneRunning, type ControlPlaneDiscoveryRecord } from './control-plane/launcher';
import { StadiumClient } from './stadium-client';

import { registerGameInRegistry, resolveGameContextSync, setSelectedGameId } from './game-identity';

const TOKEN_SECRET_KEY = 'sidelineCoach.accessToken';

let server: CoachServer | undefined;
let stadiumClient: StadiumClient | undefined;
let controlPlaneRecord: ControlPlaneDiscoveryRecord | undefined;
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

  const refreshStatusBar = (): void => {
    if (!statusBar) {
      return;
    }

    if (stadiumClient?.isConnected) {
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
      const daemonScriptPath = context.asAbsolutePath('out/control-plane/daemon.js');
      controlPlaneRecord = await ensureControlPlaneRunning({ daemonScriptPath });

      if (!stadiumClient) {
        stadiumClient = new StadiumClient({
          port: controlPlaneRecord.port,
          gameContextGetter: () =>
            resolveGameContextSync({
              workspaceFolder: vscode.workspace.workspaceFolders?.[0],
              memento: context.globalState
            }),
          playerRoster: playerRoster!,
          playerControlHost: playerControlHost!,
          reportsGetter: async () => {
            if (server) {
              const reports = await (server as any).scanReports(10, true);
              return reports || [];
            }
            return [];
          },
          addGame: async () => {
            await vscode.commands.executeCommand('coach.addGame');
            return { success: true, message: 'Add Game dialog opened in VS Code.' };
          },
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
        });

        playerRoster!.onDidTurnChange((turn) => {
          stadiumClient?.sendTurnChanged(turn);
        });

        stadiumClient.on('connected', () => refreshStatusBar());
        stadiumClient.on('disconnected', () => refreshStatusBar());
      } else {
        stadiumClient.setPort(controlPlaneRecord.port);
      }

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
        const daemonScriptPath = context.asAbsolutePath('out/control-plane/daemon.js');
        controlPlaneRecord = await ensureControlPlaneRunning({ daemonScriptPath });
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
