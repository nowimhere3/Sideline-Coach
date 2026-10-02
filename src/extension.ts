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
import { deliverVsCodeAlarm } from './alarm-notification';
import type { AiAlarmEvent } from './control-plane/alarm-engine';
import { ReportPublisher } from './report-publisher';
import { StadiumFilesystemContractCache } from './stadium-filesystem-contract';
import { ScoutPlayerAdapter } from './scout-player';
import { ScoutIntelligenceReportSource } from './scout-intelligence-report-source';
import { ScoutBootstrapConsentStore, ScoutBootstrapService } from './scout-bootstrap';
import { ScoutOpenRouterCredentialStore } from './scout-openrouter-credential';
import {
  ensureScoutIntelligenceRoot,
  migrateLegacyScoutIntelligence,
  resolveScoutIntelligenceRoot
} from './scout-intelligence-root';

import { registerGameInRegistry, resolveGameContextSync, setSelectedGameId } from './game-identity';
import { adoptGameFolder } from './game-adoption';
import { resolveGamePreview, type ClientUrlMapping, type PreviewResolution } from './preview-discovery';
import { StaticPreviewServer } from './static-preview';
import {
  buildDevelopmentInstancePlan,
  chooseOpenStrategy,
  describeOpenFailure,
  launchDevelopmentInstance
} from './game-window-opener';
import type { GameOpenParams, GameOpenResult, GamePickResult, PlayerLifecycleResult } from './control-plane/protocol';

const TOKEN_SECRET_KEY = 'sidelineCoach.accessToken';

let server: CoachServer | undefined;
let stadiumClient: StadiumClient | undefined;
let controlPlaneRecord: EnsuredControlPlane | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let playerRoster: PlayerRoster | undefined;
let playerControlHost: PlayerControlHost | undefined;
let commandStaticPreviewServer: StaticPreviewServer | undefined;
const staticPreviewChoiceKey = (gameId: string) => `sideline.preview.staticEntrypoint.${gameId}`;

/**
 * R12 environmental bridge. Runs in this Stadium's extension host, so on WSL/SSH it sets up a
 * forward (possibly to a different local port) and on Codespaces returns the authenticated
 * forwarded HTTPS URL. The result is valid only on the VS Code client machine.
 */
const previewClientUrl = async (localUrl: string): Promise<ClientUrlMapping> => {
  const external = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl, true));
  return { url: external.toString(true) };
};

const previewUnavailableMessage = (resolution: PreviewResolution): string => {
  if (resolution.reason === 'invalid-declaration') return 'The preview address in .sideline/game.json isn\'t a valid http(s) address.';
  if (resolution.reason === 'invalid-static-declaration') return 'The static entrypoint in .sideline/game.json isn\'t a safe HTML file in this Game.';
  if (resolution.reason === 'no-web-app') return 'Sideline couldn\'t find a browser preview for this Game.';
  const app = resolution.framework ? `Your ${resolution.framework} app` : 'Your app';
  const start = resolution.devScript ? ` Start it with "npm run ${resolution.devScript}" (or ask a Player to), then try again.` : ' Start it, then try again.';
  return `${app} isn't running yet.${start}`;
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  commandStaticPreviewServer ??= new StaticPreviewServer();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const resolved = resolveGameContextSync({ workspaceFolder, memento: context.globalState });
    if (resolved.game.gameId !== 'unknown') {
      registerGameInRegistry(context.globalState, resolved.game, workspaceFolder.uri.fsPath);
    }
  }

  playerControlHost = new PlayerControlHost(new WorkspaceStateBindingStore(context.workspaceState));
  playerControlHost.register('codex', new CodexAppServerFactory({
    onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
  }));
  playerControlHost.register('claude', createClaudeControlFactory({
    onHealthFrame: (instanceId, evidence) => stadiumClient?.sendHealthEvidence(instanceId, evidence)
  }));
  playerControlHost.register('antigravity', createAntiGravityControlFactory());
  playerRoster = new PlayerRoster(
    context.workspaceState,
    playerControlHost,
    () => resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState })
  );
  context.subscriptions.push(playerRoster);
  const scoutOpenRouterCredential = new ScoutOpenRouterCredentialStore(context.secrets);
  const scoutAvailable = () => vscode.workspace.getConfiguration('coach').get<boolean>('scout.enabled', true);
  const legacyScoutReportRoot = context.asAbsolutePath(path.join('REPORTS', 'Scout Only'));
  const scoutDurableReportRoot = resolveScoutIntelligenceRoot({
    extensionMode: context.extensionMode,
    globalStorageFsPath: context.globalStorageUri.fsPath
  });
  migrateLegacyScoutIntelligence({ legacyRoot: legacyScoutReportRoot, destinationRoot: scoutDurableReportRoot });
  ensureScoutIntelligenceRoot(scoutDurableReportRoot);
  console.info(`[Sideline Coach] Scout Intelligence root: ${scoutDurableReportRoot}`);
  // Dad-facing Scout Formation parents, rediscovered from the canonical root itself
  // (no Game folder or coach.reportGlobs configuration). See the source's breadcrumb.
  const scoutReportSource = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: scoutDurableReportRoot });
  // S31 Slice 4. The human's tryout decision lives in the extension's own durable state
  // (never a Game, scorecard, browser storage or SecretStorage). Only an explicit Settings
  // action can start a session: there is deliberately no timer, scheduler or activation hook.
  const scoutBootstrap = new ScoutBootstrapService({
    scoutIntelligenceRoot: scoutDurableReportRoot,
    consent: new ScoutBootstrapConsentStore(context.globalState),
    credentialConfigured: async () => (await scoutOpenRouterCredential.status()).configured,
    resolveOpenRouterApiKey: () => scoutOpenRouterCredential.resolveForExecution(),
    enabled: scoutAvailable,
    // Readiness is recomputed from the depth chart on every snapshot, so a roster change event is all it
    // takes for the Team card, the Recruit label and the routing capability to reflect newly READY receivers.
    // Ending a session never recruits Scout: membership stays the human's decision.
    onFinished: () => playerRoster?.notifyVirtualReadinessChanged(),
    log: (message) => console.warn(message)
  });
  const scoutPlayer = new ScoutPlayerAdapter({
    enabled: scoutAvailable,
    durableReportRoot: () => scoutDurableReportRoot,
    resolveOpenRouterApiKey: () => scoutOpenRouterCredential.resolveForExecution()
  });

  // S31 Slice 5: Scout is a roster-native Virtual Player. Registering makes it RECRUITABLE in this Game;
  // it joins the Team only when the human recruits it (plus one explicit compatibility adoption for a Scout
  // that was already visible before membership existed; see PlayerRoster.adoptExistingVirtualPlayer).
  playerRoster.registerVirtualPlayer(scoutPlayer);

  // S7: one memory-only projection shared by scanning, labeling, and watching.
  const filesystemContract = new StadiumFilesystemContractCache();
  // Maintain local CoachServer instance for report scanning and backward compatibility.
  server = new CoachServer(context, getAccessToken, playerRoster, filesystemContract);

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

  // Q2.8H dev-harness proof: the SAME content-hash identity, over THIS Extension
  // Development Host's own entrypoint. Proves which extension SOURCE TREE is
  // actually running — a Game workspace's own contents (even an old copy of this
  // repo, e.g. a stale regression fixture) never determine this; only the real
  // --extensionDevelopmentPath this window was launched with does.
  let extensionBuild: string | undefined;
  try { extensionBuild = computeControlPlaneBuild(context.asAbsolutePath('out/extension.js')).buildId; } catch { extensionBuild = undefined; }
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
        let reportPublisher: ReportPublisher | undefined;
        stadiumClient = new StadiumClient({
          port: controlPlaneRecord.port,
          controlPlaneBuildId: expectedControlPlaneBuild,
          extensionBuildId: extensionBuild,
          workspaceScheme: vscode.workspace.workspaceFolders?.[0]?.uri.scheme,
          remoteName: vscode.env.remoteName,
          previewClientUrl,
          previewStaticServer: commandStaticPreviewServer,
          previewRememberedEntrypoint: (gameId) => context.workspaceState.get<string>(staticPreviewChoiceKey(gameId)),
          previewRememberEntrypoint: async (gameId, relativePath) => { await context.workspaceState.update(staticPreviewChoiceKey(gameId), relativePath); },
          previewActiveHtmlPath: (rootFsPath) => {
            const active = vscode.window.activeTextEditor?.document.uri.fsPath;
            if (!active || !/\.html?$/i.test(active)) return undefined;
            const relative = path.relative(rootFsPath, active);
            return relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative.replace(/\\/g, '/') : undefined;
          },
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
          scoutPlayer,
          scoutAvailable,
          scoutReportSource,
          scoutBootstrap,
          scoutOpenRouterCredential: {
            status: () => scoutOpenRouterCredential.status(),
            save: (apiKey) => scoutOpenRouterCredential.save(apiKey),
            disconnect: () => scoutOpenRouterCredential.disconnect()
          },
          // Always THIS Stadium's Game. Never the legacy server's persisted selection,
          // which globalState shares across windows (P0 Incoming regression).
          reportsGetter: async () => {
            if (!server) return [];
            const gameId = resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState }).game.gameId;
            return server.scanReportsForGame(gameId, 10);
          },
          // S6: bootstrap evidence reuses the Game's own discovered report coordinates.
          reportPathsGetter: async (gameId) => (server ? server.reportPathsForGame(gameId, 200) : []),
          // S7 acknowledgement is sent only after the new watcher set has rescanned.
          filesystemContractApplier: async (params) => {
            const result = filesystemContract.apply(params);
            if (result.reportsChanged) await reportPublisher?.rebuildAndPublish('report-root-changed');
            return result;
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

        // Live Player Terminal: already-sanitized, exact-instance activity only.
        playerRoster!.onDidActivity((activity) => {
          stadiumClient?.sendPlayerActivity(activity);
        });

        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
          if (event.affectsConfiguration('coach.scout.enabled')) stadiumClient?.sendCapabilitySnapshot();
        }));

        // The report return loop: a report landing in this Game reaches Incoming
        // without a reload or refresh. Changing coach.reportGlobs rebuilds watchers.
        reportPublisher = new ReportPublisher({
          // Game report patterns, plus ONLY the Scout parents' own glob under the
          // Formations folder — never the whole Scout Intelligence tree, never receiver reports.
          getPatterns: () => [
            ...(server?.reportPatterns() ?? []),
            ...scoutReportSource.roots().map((root) => new vscode.RelativePattern(vscode.Uri.file(root), scoutReportSource.parentGlob))
          ],
          getGlobs: () => server?.reportGlobs() ?? [],
          createWatcher: (pattern, onEvent) => {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern as vscode.GlobPattern);
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
        const deliveredAlarmIds = new Set<string>();
        stadiumClient.on('ai-alarm', (event: AiAlarmEvent) => {
          if (deliveredAlarmIds.has(event.id)) return;
          deliveredAlarmIds.add(event.id);
          if (deliveredAlarmIds.size > 100) deliveredAlarmIds.delete(deliveredAlarmIds.values().next().value!);
          deliverVsCodeAlarm(vscode.window, event);
        });
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
    const url = `${base}/#token=${encodeURIComponent(token)}`;
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

    // Choosing a folder in Add Game is the human's authority to make it a Game.
    // Reuse strong identity (marker / git remote); otherwise establish a marker so
    // the Stadium Coach launches for this Game resolves the very same gameId.
    const adoption = adoptGameFolder(selectedUri.fsPath);
    if (adoption.kind === 'refused') {
      return { success: false, folderPath: selectedUri.fsPath, message: adoption.message };
    }

    const resolved = resolveGameContextSync({
      workspaceFolder: { uri: selectedUri, name: folderName }
    });

    if (resolved.game.fingerprintSource !== 'marker' && resolved.game.fingerprintSource !== 'git-remote') {
      return {
        success: false,
        folderPath: selectedUri.fsPath,
        message: 'Coach could not identify a Game in that folder. Try choosing it again.'
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { success: false, outcome: 'failed', message: describeOpenFailure('unknown', detail) };
    }

    // This extension host runs with ELECTRON_RUN_AS_NODE=1; the launcher scrubs
    // it so Code.exe boots as VS Code, and confirms the child did not die on boot.
    const launched = await launchDevelopmentInstance({
      spawn: child_process.spawn,
      executable,
      plan,
      parentEnv: process.env
    });
    if (launched.kind === 'failed') {
      return { success: false, outcome: 'failed', message: launched.message };
    }
    return {
      success: true,
      outcome: 'opened',
      message: `Opening ${params.displayName ?? 'Game'} in a development host…`
    };
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

  // R12: open this window's Game app in the system browser. Same resolution the dashboard uses.
  const previewInBrowser = async (): Promise<void> => {
    const ctx = resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0], memento: context.globalState });
    if (ctx.game.gameId === 'unknown' || !ctx.binding.rootFsPath) {
      vscode.window.showInformationMessage('Open a Game folder first, then preview it.');
      return;
    }
    commandStaticPreviewServer ??= new StaticPreviewServer();
    const resolve = (selectedStaticEntrypoint?: string) => resolveGamePreview({
      gameId: ctx.game.gameId,
      stadiumId: stadiumClient?.stadiumId ?? ctx.stadium.stadiumId,
      rootFsPath: ctx.binding.rootFsPath,
      toClientUrl: previewClientUrl,
      staticServer: commandStaticPreviewServer,
      rememberedStaticEntrypoint: context.workspaceState.get<string>(staticPreviewChoiceKey(ctx.game.gameId)),
      selectedStaticEntrypoint,
      activeHtmlPath: (() => {
        const active = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!active || !/\.html?$/i.test(active)) return undefined;
        const relative = path.relative(ctx.binding.rootFsPath, active);
        return relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative.replace(/\\/g, '/') : undefined;
      })()
    });
    let resolution = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Looking for a browser preview…' },
      () => resolve()
    );
    if (resolution.reason === 'static-choice-required' && resolution.staticPages?.length) {
      const choice = await vscode.window.showQuickPick(
        resolution.staticPages.map((page) => ({ label: page.label, description: page.path, page })),
        { title: 'Choose the home page for this Game', placeHolder: 'Sideline will remember this choice.' }
      );
      if (!choice) return;
      resolution = await resolve(choice.page.path);
      if (resolution.available) await context.workspaceState.update(staticPreviewChoiceKey(ctx.game.gameId), choice.page.path);
    }
    const endpoint = resolution.endpoints.find((candidate) => candidate.primary) ?? resolution.endpoints[0];
    if (!endpoint) {
      vscode.window.showInformationMessage(previewUnavailableMessage(resolution));
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(endpoint.clientUrl, true));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('coach.previewInBrowser', previewInBrowser),
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
  await commandStaticPreviewServer?.dispose();
  commandStaticPreviewServer = undefined;
  await playerControlHost?.dispose();
  playerControlHost = undefined;
  playerRoster = undefined;
}
