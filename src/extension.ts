import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { CodexAppServerFactory } from './player-control/codex-app-server';
import { PlayerControlHost } from './player-control/host';
import { PlayerRoster } from './player-roster';
import { CoachServer } from './server';
import { WorkspaceStateBindingStore } from './workspace-state-binding-store';

import { resolveGameContextSync } from './game-identity';

const TOKEN_SECRET_KEY = 'sidelineCoach.accessToken';

let server: CoachServer | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let playerRoster: PlayerRoster | undefined;
let playerControlHost: PlayerControlHost | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  playerControlHost = new PlayerControlHost(new WorkspaceStateBindingStore(context.workspaceState));
  playerControlHost.register('codex', new CodexAppServerFactory());
  playerRoster = new PlayerRoster(
    context.workspaceState,
    playerControlHost,
    () => resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState })
  );
  context.subscriptions.push(playerRoster);
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  statusBar.command = 'coach.copyMobileUrl';
  statusBar.tooltip = 'Sideline Coach. Click to copy the mobile URL.';
  context.subscriptions.push(statusBar);

  const getAccessToken = async (): Promise<string> => {
    const existing = await context.secrets.get(TOKEN_SECRET_KEY);
    if (existing) {
      return existing;
    }

    const generated = crypto.randomBytes(24).toString('base64url');
    await context.secrets.store(TOKEN_SECRET_KEY, generated);
    return generated;
  };

  const refreshStatusBar = (): void => {
    if (!statusBar) {
      return;
    }

    if (server?.isRunning) {
      statusBar.text = `$(radio-tower) Coach: Active on :${server.port}`;
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = '$(circle-slash) Coach: Stopped';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBar.show();
  };

  const startServer = async (): Promise<void> => {
    if (server?.isRunning) {
      vscode.window.showInformationMessage(`Sideline Coach is already running on port ${server.port}.`);
      refreshStatusBar();
      return;
    }

    server?.dispose();
    server = new CoachServer(context, getAccessToken, playerRoster!);

    try {
      await server.start();
      context.subscriptions.push(server);
      refreshStatusBar();
      vscode.window.showInformationMessage(`Sideline Coach started on 127.0.0.1:${server.port}.`);
    } catch (error) {
      server.dispose();
      server = undefined;
      refreshStatusBar();
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Sideline Coach failed to start: ${message}`);
    }
  };

  const stopServer = async (): Promise<void> => {
    if (!server?.isRunning) {
      refreshStatusBar();
      return;
    }
    await server.stop();
    refreshStatusBar();
    vscode.window.showInformationMessage('Sideline Coach stopped.');
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
    const port = server?.port ?? config.get<number>('port', 49152);
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

  context.subscriptions.push(
    vscode.commands.registerCommand('coach.startServer', startServer),
    vscode.commands.registerCommand('coach.stopServer', stopServer),
    vscode.commands.registerCommand('coach.copyLatestReport', copyLatestReport),
    vscode.commands.registerCommand('coach.copyMobileUrl', copyMobileUrl)
  );

  refreshStatusBar();

  if (vscode.workspace.getConfiguration('coach').get<boolean>('autoStart', true)) {
    await startServer();
  }
}

export async function deactivate(): Promise<void> {
  await server?.stop();
  server?.dispose();
  server = undefined;
  await playerControlHost?.dispose();
  playerControlHost = undefined;
  playerRoster = undefined;
}
