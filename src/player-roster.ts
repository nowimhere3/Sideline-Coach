import { execFile } from 'node:child_process';
import * as os from 'node:os';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { ControlledPlayerPresentation } from './controlled-player-presentation';
import { PLAYER_ADAPTERS, getPlayerAdapter, rosterFieldState, transportLabel, type PlayerId, type PlayerOwnership } from './player-adapters';
import {
  PlayerDiscoveryService,
  listWindowsProcesses,
  windowsCommandAvailable,
  withRestoredCandidate,
  withoutClaimedCandidates,
  type ExternalPlayerCandidate,
  type ObservedShell,
  type PlayerDiscoveryEnricher,
  type StadiumPlayerDiscovery
} from './player-discovery';
import type { HostedControlEvent } from './player-control/host';
import { PlayerControlHost } from './player-control/host';
import type { DeliveryOutcome, DeliverOptions } from './player-control/contract';
import type { RestorePlan } from './player-control/bindings';
import { decidePendingMatch, isPlayerProvenance, PlayerInstanceBook, type PlayerInstanceProjection, type PlayerProvenance, type ProcessIdentity } from './player-instances';
import {
  antigravityControlProfile,
  claudeControlProfile,
  parseAntiGravityModels,
  parseClaudeEffortLevels,
  parseClaudeModelStatus,
  type ProviderControlProfile
} from './provider-control';
import type { PlayerAdapter } from './player-adapters';
import { authorityForPlayer, permissionSettingForPlayer } from './player-authority';
import * as crypto from 'node:crypto';
import { checkTerminalCommand, describeTerminalExit } from './terminal-player';

/**
 * Read Claude's own model/effort answers. Both are LOCAL CLI commands (no model
 * call). They run through PowerShell so a leading `/` is never rewritten
 * into a path, and from a neutral temp folder so no project's hooks or settings
 * execute without that project's trust decision. Unparseable output → unknown.
 */
async function probeClaudeControls(adapter: PlayerAdapter, signal: AbortSignal): Promise<ProviderControlProfile | undefined> {
  if (adapter.id !== 'claude' || process.platform !== 'win32') return undefined;
  const run = async (script: string): Promise<string | undefined> => {
    try {
      return await new Promise<string>((resolve, reject) => {
        const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script], {
          cwd: os.tmpdir(),
          timeout: 7_500,
          windowsHide: true,
          encoding: 'utf8',
          signal
        }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
        // `claude -p` otherwise waits for the inherited stdin pipe before it
        // answers local slash commands. EOF removes that ~3 second delay.
        child.stdin?.end();
      });
    } catch {
      return undefined;
    }
  };
  const [modelText, effortText, versionText] = await Promise.all([
    run("& claude -p '/model' --no-session-persistence"),
    run("& claude -p '/effort' --no-session-persistence"),
    run('& claude --version')
  ]);
  const modelStatus = modelText ? parseClaudeModelStatus(modelText) : undefined;
  const effortLevels = effortText ? parseClaudeEffortLevels(effortText) : undefined;
  if (!modelStatus && !effortLevels) return undefined;
  const version = versionText?.trim().split(/\r?\n/, 1)[0] || 'unknown version';
  return claudeControlProfile(modelStatus, effortLevels, `claude-cli ${version}`);
}

const CLAUDE_CONTROL_ENRICHER: PlayerDiscoveryEnricher = {
  playerType: 'claude',
  probe: probeClaudeControls,
  timeoutMs: 8_000,
  unknown: () => claudeControlProfile(undefined, undefined, 'claude-cli capability probe unavailable')
};

/**
 * AntiGravity's model list via its own `agy models` subcommand (lists models; no
 * inference). Same safety as Claude: PowerShell, neutral temp folder, stdin EOF,
 * bounded, and unparseable output becomes Unknown.
 */
async function probeAntiGravityControls(adapter: PlayerAdapter, signal: AbortSignal): Promise<ProviderControlProfile | undefined> {
  if (adapter.id !== 'antigravity' || process.platform !== 'win32') return undefined;
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '& agy models'], {
        cwd: os.tmpdir(),
        timeout: 7_500,
        windowsHide: true,
        encoding: 'utf8',
        signal
      }, (error, out) => (error ? reject(error) : resolve(out)));
      child.stdin?.end();
    });
    const models = parseAntiGravityModels(stdout);
    return models ? antigravityControlProfile(models, 'agy models') : undefined;
  } catch {
    return undefined;
  }
}

const ANTIGRAVITY_CONTROL_ENRICHER: PlayerDiscoveryEnricher = {
  playerType: 'antigravity',
  probe: probeAntiGravityControls,
  timeoutMs: 8_000,
  unknown: () => antigravityControlProfile(undefined, 'agy models probe unavailable')
};

export interface AddPlayerOptions {
  /** The human explicitly chose to start another copy despite one already running. */
  readonly allowDuplicate?: boolean;
}
import { resolveGameContextSync, type ResolvedGameContext } from './game-identity';
import { CapabilityService } from './capability-service';
import type { PlayerRoutingCapability } from './capability-types';

const execFileAsync = promisify(execFile);
const PROVENANCE_KEY = 'sidelineCoach.playerProvenance.v1';
const ID_MARKER = 'SIDELINE_COACH_PLAYER_ID';
const SEAT_MARKER = 'SIDELINE_COACH_PLAYER_SEAT';

export type PlayerResolution =
  | { state: 'live'; transport: 'legacy'; terminal: vscode.Terminal; instance: PlayerInstanceProjection }
  | { state: 'live'; transport: 'controlled'; instance: PlayerInstanceProjection }
  | { state: 'pending' }
  | { state: 'unavailable'; message: string }
  | { state: 'unknown' };

export type TurnLifecycleState = 'idle' | 'accepted' | 'started' | 'completed' | 'failed' | 'interrupted' | 'unknown';

export interface PlayerTurnEvent {
  instanceId: string;
  state: TurnLifecycleState;
  turnRef?: string;
  summary: string;
  at: number;
}

type ControlledState = 'restoring' | 'ready' | 'needs-verification' | 'needs-sign-in' | 'needs-decision';

interface ControlledPresentation {
  terminal: vscode.Terminal;
  presentation: ControlledPlayerPresentation;
  stopEvents: () => void;
  state: ControlledState;
  stateMessage: string;
  leaving: boolean;
  crashRestoreAttempted: boolean;
}

export class PlayerRoster implements vscode.Disposable {
  private availability = new Map<PlayerId, boolean>();
  private checkedAt = 0;
  private readonly book = new PlayerInstanceBook();
  private readonly terminalByInstance = new Map<string, vscode.Terminal>();
  private readonly instanceByTerminal = new Map<vscode.Terminal, string>();
  private readonly controlledByInstance = new Map<string, ControlledPresentation>();
  private readonly controlledInstanceByTerminal = new Map<vscode.Terminal, string>();
  private readonly turnStateByInstance = new Map<string, PlayerTurnEvent>();
  private readonly retired = new Set<string>();
  /** Terminals Coach created for a Terminal Player, plus install/auth helpers. */
  private readonly ownedHelperTerminals = new Set<vscode.Terminal>();
  private readonly discovery: PlayerDiscoveryService;
  private lastDiscovery: StadiumPlayerDiscovery | undefined;
  private discoveryGeneration = 0;
  /** The discovery candidate each adopted instance came from, so removal can offer it again. */
  private readonly adoptedCandidates = new Map<string, ExternalPlayerCandidate>();
  private readonly evaluating = new WeakSet<vscode.Terminal>();
  private readonly closed = new WeakSet<vscode.Terminal>();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly turnChanged = new vscode.EventEmitter<PlayerTurnEvent>();
  private readonly openListener: vscode.Disposable;
  private readonly closeListener: vscode.Disposable;
  private readonly shellExecutionListener: vscode.Disposable | undefined;
  /** Terminal Player commands whose end Coach can observe, by shell execution. */
  private readonly runningCommands = new Map<vscode.TerminalShellExecution, { instanceId: string; turnRef: string }>();
  private readonly stopControlEvents: () => void;
  private provenance: PlayerProvenance[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private disposed = false;
  readonly onDidChange = this.changed.event;
  readonly onDidTurnChange = this.turnChanged.event;

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly controlHost: PlayerControlHost,
    private readonly getGameContext: () => ResolvedGameContext = () => resolveGameContextSync({ workspaceFolder: vscode.workspace.workspaceFolders?.[0] }),
    private readonly capabilityService: CapabilityService = new CapabilityService()
  ) {
    this.loadProvenance();
    this.discovery = new PlayerDiscoveryService({
      commandAvailable: (command) => (process.platform === 'win32' ? windowsCommandAvailable(command) : Promise.resolve(false)),
      listProcesses: process.platform === 'win32' ? listWindowsProcesses : undefined
    }, [CLAUDE_CONTROL_ENRICHER, ANTIGRAVITY_CONTROL_ENRICHER]);
    this.stopControlEvents = controlHost.onEvent((event) => this.handleControlEvent(event));
    const activeGameId = this.getGameContext().game.gameId;
    this.adoptControlledRestores(controlHost.planRestores(activeGameId));
    this.openListener = vscode.window.onDidOpenTerminal((terminal) => { void this.evaluate(terminal); });
    this.closeListener = vscode.window.onDidCloseTerminal((terminal) => this.retireTerminal(terminal));
    // Terminal Player command lifecycle: only VS Code shell integration can prove a
    // command finished. Without it the outcome stays Unknown — never Completed.
    this.shellExecutionListener = typeof vscode.window.onDidEndTerminalShellExecution === 'function'
      ? vscode.window.onDidEndTerminalShellExecution((event) => this.finishTerminalCommand(event.execution, event.exitCode))
      : undefined;
    for (const terminal of vscode.window.terminals) void this.evaluate(terminal);
    void this.reconcilePending();
  }

  dispose(): void {
    this.disposed = true;
    this.discoveryGeneration += 1;
    this.openListener.dispose();
    this.closeListener.dispose();
    this.shellExecutionListener?.dispose();
    this.runningCommands.clear();
    this.stopControlEvents();
    for (const binding of this.controlledByInstance.values()) {
      binding.stopEvents();
      binding.presentation.dispose();
    }
    this.controlledByInstance.clear();
    this.controlledInstanceByTerminal.clear();
    this.turnStateByInstance.clear();
    void this.controlHost.dispose();
    this.changed.dispose();
    this.turnChanged.dispose();
  }
  instances(): PlayerInstanceProjection[] { return this.book.projections(); }
  terminalFor(instanceId: string): vscode.Terminal | undefined { return this.terminalByInstance.get(instanceId); }
  isRetired(instanceId: string): boolean { return this.retired.has(instanceId); }
  getCapabilityService(): CapabilityService { return this.capabilityService; }
  async deliverControlled(instanceId: string, play: string, options?: DeliverOptions): Promise<DeliveryOutcome> {
    const outcome = await this.controlHost.deliver(instanceId, play, options);
    if (outcome.kind === 'accepted') {
      const event: PlayerTurnEvent = {
        instanceId,
        state: 'accepted',
        turnRef: outcome.turnRef,
        summary: 'Received',
        at: Date.now()
      };
      this.turnStateByInstance.set(instanceId, event);
      this.turnChanged.fire(event);
    } else if (outcome.kind === 'unknown') {
      const event: PlayerTurnEvent = {
        instanceId,
        state: 'unknown',
        summary: outcome.reason,
        at: Date.now()
      };
      this.turnStateByInstance.set(instanceId, event);
      this.turnChanged.fire(event);
    } else if (outcome.kind === 'refused') {
      const event: PlayerTurnEvent = {
        instanceId,
        state: 'failed',
        summary: outcome.message,
        at: Date.now()
      };
      this.turnStateByInstance.set(instanceId, event);
      this.turnChanged.fire(event);
    }
    return outcome;
  }
  resolve(instanceId: string): PlayerResolution {
    const terminal = this.terminalByInstance.get(instanceId);
    const instance = this.book.get(instanceId);
    if (terminal && instance) return { state: 'live', transport: 'legacy', terminal, instance: this.book.project(instance) };
    const controlled = this.controlledByInstance.get(instanceId);
    if (controlled && instance) {
      if (controlled.state === 'restoring') return { state: 'pending' };
      if (controlled.state !== 'ready') return { state: 'unavailable', message: controlled.stateMessage };
      if (this.controlHost.resolve(instanceId)) return { state: 'live', transport: 'controlled', instance: this.controlledProjection(this.book.project(instance), controlled) };
      return { state: 'unavailable', message: 'That controlled Player is unavailable.' };
    }
    return this.book.pendingRecord(instanceId) ? { state: 'pending' } : { state: 'unknown' };
  }

  async status(activeGameId?: string) {
    const connectedGameId = this.getGameContext().game.gameId;
    const isSelectedConnected = !activeGameId || activeGameId === connectedGameId;
    await this.refreshAvailability();
    return PLAYER_ADAPTERS.map((player) => {
      if (!isSelectedConnected) {
        return {
          id: player.id,
          name: player.name,
          availability: 'not-available' as const,
          fieldState: rosterFieldState(0, 0),
          instances: []
        };
      }
      const instances = this.book.byType(player.id).map((record) => {
        const projection = this.book.project(record);
        const controlled = this.controlledByInstance.has(record.instanceId);
        // Human-facing vocabulary only: "Legacy" is an implementation generation,
        // never something a Coach user should have to learn.
        const transport = transportLabel({ controlled, playerType: record.playerType, ownership: record.ownership });

        if (controlled) {
          const binding = this.controlledByInstance.get(record.instanceId);
          const turnState = this.turnStateByInstance.get(record.instanceId) ?? {
            instanceId: record.instanceId,
            state: 'idle' as const,
            summary: 'Ready',
            at: 0
          };
          return {
            ...this.controlledProjection(projection, binding),
            controlMode: 'controlled' as const,
            permissionSetting: permissionSettingForPlayer(record.playerType),
            transport,
            controlState: binding?.state,
            stateMessage: binding?.stateMessage,
            turnState
          };
        }
        return { ...projection, transport };
      });
      const available = player.alwaysAvailable === true || this.availability.get(player.id) === true;
      const onFieldCount = this.book.onFieldCount(player.id);
      return {
        id: player.id,
        name: player.name,
        availability: available ? 'available' as const : 'not-available' as const,
        fieldState: rosterFieldState(onFieldCount, instances.length),
        instances
      };
    });
  }

  /** Return one specific benched instance to the field. Never picks a sibling. */
  async putInstanceOnField(instanceId: string): Promise<{ success: boolean; message: string }> {
    let record = this.book.get(instanceId);
    if (!record) {
      const candidates = this.book.byType(instanceId as PlayerId);
      if (candidates.length > 0) {
        record = candidates[0];
        instanceId = record.instanceId;
      }
    }
    if (!record) return { success: false, message: 'That Player is not in this Game.' };
    const label = this.book.project(record).fieldLabel;
    this.book.setOnField(instanceId, true);
    this.terminalByInstance.get(instanceId)?.show(true);
    this.controlledByInstance.get(instanceId)?.terminal.show(true);
    this.changed.fire();
    return { success: true, message: `${label} is on field.` };
  }

  async putOnField(id: string): Promise<{ success: boolean; message: string }> {
    if (this.book.get(id)) {
      return this.putInstanceOnField(id);
    }
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    const existing = this.book.byType(player.id)[0];
    if (existing) {
      // A benched Player returns to the field; it was never removed.
      return this.putInstanceOnField(existing.instanceId);
    }
    if (player.id === 'terminal') return this.addTerminalPlayer();
    return this.addInstance(id);
  }

  /**
   * Bench a Player. The instance, its seat, and its transport survive — this is
   * an execution-lifecycle change, never a removal. Coach deliberately does not
   * destroy the process here: Take Off Field must stay reversible.
   */
  async takeOffField(instanceId: string): Promise<{ success: boolean; message: string }> {
    let record = this.book.get(instanceId);
    if (!record) {
      const candidates = this.book.byType(instanceId as PlayerId);
      if (candidates.length > 0) {
        record = candidates[0];
        instanceId = record.instanceId;
      }
    }
    if (!record) return { success: false, message: 'That Player is not in this Game.' };
    if (!record.onField) return { success: true, message: `${this.book.project(record).fieldLabel} is already on the bench.` };
    this.book.setOnField(instanceId, false);
    this.changed.fire();
    return { success: true, message: `${this.book.project(record).fieldLabel} is on the bench.` };
  }

  /**
   * End a Player instance's relationship with this Game.
   *
   * Ownership decides what may be destroyed:
   *   coach-managed  Coach created it        -> dispose it
   *   adopted        pre-existing, adopted   -> detach, leave the process alone
   *   external       observed only           -> detach, never destroy
   *
   * Coach must never kill a process it did not create just because the Player
   * carries a provider's name.
   */
  async removePlayer(instanceId: string): Promise<{ success: boolean; message: string; ownership?: PlayerOwnership; discovery?: StadiumPlayerDiscovery }> {
    const record = this.book.get(instanceId);
    if (!record) return { success: false, message: 'That Player is not in this Game.' };
    const label = this.book.project(record).fieldLabel;
    const ownership = record.ownership;

    if (this.controlledByInstance.has(instanceId)) {
      const binding = this.controlledByInstance.get(instanceId);
      if (binding) binding.leaving = true;
      this.controlledByInstance.delete(instanceId);
      this.controlledInstanceByTerminal.delete(binding!.terminal);
      binding?.stopEvents();
      binding?.presentation.dispose();
      await this.leaveControlled(instanceId);
      return { success: true, message: `${label} was removed from this Game.`, ownership };
    }

    const terminal = this.terminalByInstance.get(instanceId);
    if (terminal) {
      this.terminalByInstance.delete(instanceId);
      this.instanceByTerminal.delete(terminal);
      if (ownership === 'coach-managed') {
        this.ownedHelperTerminals.delete(terminal);
        try { terminal.dispose(); } catch {}
      }
    }

    // A Player Coach did not start keeps running after removal, so it is
    // recruitable again — offered back from the candidate it was adopted from.
    const adoptedFrom = this.adoptedCandidates.get(instanceId);
    this.adoptedCandidates.delete(instanceId);
    let discovery: StadiumPlayerDiscovery | undefined;
    if (adoptedFrom && ownership !== 'coach-managed' && terminal && !this.closed.has(terminal) && this.lastDiscovery) {
      this.lastDiscovery = withRestoredCandidate(this.lastDiscovery, adoptedFrom);
      discovery = this.lastDiscovery;
    }

    this.turnStateByInstance.delete(instanceId);
    this.book.retire(instanceId);
    this.removeProvenance([instanceId]);
    this.retired.add(instanceId);
    this.changed.fire();

    const detail = ownership === 'coach-managed'
      ? 'Its terminal was closed.'
      : 'Coach detached from it and left the terminal running.';
    return { success: true, message: `${label} was removed from this Game. ${detail}`, ownership, ...(discovery ? { discovery } : {}) };
  }

  // --- Terminal Player -----------------------------------------------------

  /**
   * Terminal is its own Player type and its own transport. It is never a
   * disguise for a provider Player, and it is the bootstrap path that lets
   * Coach reach an environment before any agent is installed there.
   */
  async addTerminalPlayer(): Promise<{ success: boolean; message: string; instanceId?: string }> {
    const gameContext = this.getGameContext();
    const cwd = gameContext.binding.rootFsPath;
    if (gameContext.game.gameId === 'unknown' || !cwd) {
      return { success: false, message: 'Open a valid Game workspace before adding a Terminal Player.' };
    }

    const record = this.book.allocate('terminal', 'coach-managed');
    const label = this.book.project(record).fieldLabel;
    // cwd is pinned to the Game root so a command can never run in another Game.
    const terminal = vscode.window.createTerminal({
      name: label,
      cwd,
      env: { [ID_MARKER]: record.instanceId, [SEAT_MARKER]: String(record.seat) }
    });
    this.register(record.instanceId, terminal);
    this.ownedHelperTerminals.add(terminal);
    terminal.show(true);
    void this.recordProvenance(record, terminal);
    this.changed.fire();
    return { success: true, message: `${label} is ready.`, instanceId: record.instanceId };
  }

  /** Minimal Terminal Player control: send text, optionally submit it. */
  async sendToTerminalPlayer(instanceId: string, text: string, enter = true): Promise<{ success: boolean; message: string }> {
    const record = this.book.get(instanceId);
    const terminal = this.terminalByInstance.get(instanceId);
    if (!record || !terminal) return { success: false, message: 'That Terminal Player is not available.' };
    if (this.closed.has(terminal)) return { success: false, message: 'That terminal has closed.' };
    terminal.sendText(text.replace(/\u0000/g, ''), enter);
    terminal.show(true);
    return { success: true, message: 'Sent.' };
  }

  /**
   * Run one exact command in one exact Terminal Player (MANUAL dispatch).
   *
   * The command text is sent exactly as approved. Exact instance only: a benched,
   * removed or closed Terminal refuses — a sibling is never substituted. With VS Code
   * shell integration Coach observes the command's end and exit code; without it the
   * command is sent and its outcome stays Unknown.
   */
  runTerminalCommand(instanceId: string, text: string):
    | { kind: 'accepted'; turnRef: string; observed: boolean }
    | { kind: 'refused'; message: string } {
    const record = this.book.get(instanceId);
    const terminal = this.terminalByInstance.get(instanceId);
    if (!record || record.playerType !== 'terminal' || !terminal || this.retired.has(instanceId)) {
      return { kind: 'refused', message: 'That Terminal is no longer on your Team. Nothing was run.' };
    }
    if (this.closed.has(terminal)) return { kind: 'refused', message: 'That Terminal has closed. Nothing was run.' };
    if (!record.onField) return { kind: 'refused', message: `${this.book.project(record).fieldLabel} is on the bench. Put it on the field first. Nothing was run.` };
    if (this.activeCommandFor(instanceId)) return { kind: 'refused', message: 'That Terminal is still running a command. Nothing was run.' };
    const check = checkTerminalCommand(text);
    if (!check.ok) return { kind: 'refused', message: check.message };

    const turnRef = `cmd-${crypto.randomUUID()}`;
    const shell = terminal.shellIntegration;
    const singleLine = !/\r|\n/.test(check.command.trim());
    const summary = `Running: ${check.command.trim().split(/\r?\n/, 1)[0].slice(0, 120)}`;
    if (shell && singleLine) {
      const execution = shell.executeCommand(check.command.trim());
      this.runningCommands.set(execution, { instanceId, turnRef });
      this.emitTurn({ instanceId, state: 'accepted', turnRef, summary, at: Date.now() });
      this.emitTurn({ instanceId, state: 'started', turnRef, summary, at: Date.now() });
      terminal.show(true);
      return { kind: 'accepted', turnRef, observed: true };
    }
    // No completion evidence available: send exactly, claim nothing about the outcome.
    terminal.sendText(check.command, true);
    terminal.show(true);
    return { kind: 'accepted', turnRef, observed: false };
  }

  private activeCommandFor(instanceId: string): boolean {
    for (const entry of this.runningCommands.values()) if (entry.instanceId === instanceId) return true;
    return false;
  }

  private finishTerminalCommand(execution: vscode.TerminalShellExecution, exitCode: number | undefined): void {
    const running = this.runningCommands.get(execution);
    if (!running) return; // The human's own commands are never recorded as Plays.
    this.runningCommands.delete(execution);
    const outcome = describeTerminalExit(exitCode);
    this.emitTurn({ instanceId: running.instanceId, state: outcome.state, turnRef: running.turnRef, summary: outcome.summary, at: Date.now() });
  }

  private emitTurn(event: PlayerTurnEvent): void {
    this.turnStateByInstance.set(event.instanceId, event);
    this.turnChanged.fire(event);
    this.changed.fire();
  }

  /**
   * Deliver a Play to a terminal-backed PROVIDER Player through its exact terminal
   * object — never by visible terminal name, which siblings can share.
   */
  sendToProviderTerminal(instanceId: string, text: string, modelSwitch?: string): { success: boolean; message: string } {
    const terminal = this.terminalByInstance.get(instanceId);
    const record = this.book.get(instanceId);
    if (!record || !terminal || this.closed.has(terminal) || this.retired.has(instanceId)) return { success: false, message: 'That Player has left the field.' };
    if (!record.onField) return { success: false, message: `${this.book.project(record).fieldLabel} is on the bench.` };
    if (modelSwitch) terminal.sendText(modelSwitch, true);
    terminal.sendText(text.replace(/\u0000/g, ''), true);
    return { success: true, message: 'Sent.' };
  }

  /**
   * Terminals open in this Game that the human could deliberately adopt as a
   * Terminal Player. Never automatic: a random shell is not a Play target until the
   * human says so. Coach's own terminals and already-rostered ones are excluded.
   */
  private async adoptableTerminals(excludeShellPids: ReadonlySet<number>): Promise<Array<{ terminalName: string; shellPid: number }>> {
    const list: Array<{ terminalName: string; shellPid: number }> = [];
    for (const terminal of vscode.window.terminals) {
      if (this.closed.has(terminal) || this.instanceByTerminal.has(terminal) || this.controlledInstanceByTerminal.has(terminal) || this.ownedHelperTerminals.has(terminal)) continue;
      const pid = await this.terminalPid(terminal);
      if (!pid || excludeShellPids.has(pid)) continue;
      list.push({ terminalName: terminal.name, shellPid: pid });
    }
    return list;
  }

  /** Explicitly adopt one human-owned terminal as a Terminal Player. Removal detaches; it never closes it. */
  async adoptTerminal(shellPid: number): Promise<{ success: boolean; message: string; instanceId?: string }> {
    let target: vscode.Terminal | undefined;
    for (const terminal of vscode.window.terminals) {
      if (this.closed.has(terminal) || this.instanceByTerminal.has(terminal) || this.controlledInstanceByTerminal.has(terminal)) continue;
      if ((await this.terminalPid(terminal)) === shellPid) { target = terminal; break; }
    }
    if (!target) return { success: false, message: 'That terminal is no longer open. Check Players again.' };
    const record = this.book.allocate('terminal', 'adopted');
    this.register(record.instanceId, target);
    void this.recordProvenance(record, target);
    if (this.lastDiscovery) {
      const remaining = ((this.lastDiscovery as StadiumPlayerDiscovery & { adoptableTerminals?: Array<{ shellPid: number }> }).adoptableTerminals ?? []).filter((entry) => entry.shellPid !== shellPid);
      this.lastDiscovery = { ...this.lastDiscovery, adoptableTerminals: remaining } as StadiumPlayerDiscovery;
    }
    this.changed.fire();
    return { success: true, message: `"${target.name}" joined your Team as a Terminal. Coach will not close it.`, instanceId: record.instanceId };
  }

  /** Is the Terminal Player's shell still alive? */
  async isTerminalPlayerAlive(instanceId: string): Promise<boolean> {
    const terminal = this.terminalByInstance.get(instanceId);
    if (!terminal || this.closed.has(terminal)) return false;
    const pid = await this.terminalPid(terminal);
    if (!pid) return false;
    return (await this.probeProcessIdentity(pid)).exists;
  }

  /**
   * Open a Game-scoped terminal pre-loaded with a provider's install or sign-in
   * command. Coach types the command but never runs it: installation and
   * authentication stay the human's explicit act in Q2.9.
   */
  async openHelperTerminal(playerType: string, purpose: 'install' | 'authenticate'): Promise<{ success: boolean; message: string }> {
    const adapter = getPlayerAdapter(playerType);
    if (!adapter) return { success: false, message: 'Unknown Player.' };
    const gameContext = this.getGameContext();
    const cwd = gameContext.binding.rootFsPath;
    if (gameContext.game.gameId === 'unknown' || !cwd) {
      return { success: false, message: 'Open a valid Game workspace first.' };
    }

    const title = purpose === 'install' ? `Install ${adapter.name}` : `Sign in to ${adapter.name}`;
    const terminal = vscode.window.createTerminal({ name: `${title} · ${gameContext.game.displayName}`, cwd });
    this.ownedHelperTerminals.add(terminal);
    terminal.show(true);

    const command = purpose === 'install' ? adapter.installGuidance?.command : adapter.command;
    if (command) {
      // Typed, not submitted: the human presses Enter.
      terminal.sendText(command, false);
    }

    const hint = command
      ? `Coach opened a terminal in ${gameContext.game.displayName} and typed the command. Press Enter to run it, then choose Check Players.`
      : `Coach opened a terminal in ${gameContext.game.displayName}. Run the ${adapter.name} command there, then choose Check Players.`;
    return { success: true, message: hint };
  }

  // --- Discovery and adoption ---------------------------------------------

  /** Shells Coach already owns, so discovery never re-offers its own Players. */
  private async claimedShellPids(): Promise<Set<number>> {
    const pids = new Set<number>();
    for (const terminal of this.terminalByInstance.values()) {
      const pid = await this.terminalPid(terminal);
      if (pid) pids.add(pid);
    }
    return pids;
  }

  private async observedShells(): Promise<ObservedShell[]> {
    const shells: ObservedShell[] = [];
    for (const terminal of vscode.window.terminals) {
      if (this.closed.has(terminal)) continue;
      if (this.controlledInstanceByTerminal.has(terminal)) continue; // Coach-owned pseudoterminal
      const pid = await this.terminalPid(terminal);
      if (pid) shells.push({ terminalName: terminal.name, shellPid: pid });
    }
    return shells;
  }

  /** "Check Players" — what could play in this Stadium, and who is already here. */
  async discoverPlayers(): Promise<StadiumPlayerDiscovery> {
    const generation = ++this.discoveryGeneration;
    const gameContext = this.getGameContext();
    const result = await this.discovery.discover({
      stadiumId: gameContext.stadium.stadiumId,
      gameId: gameContext.game.gameId,
      shells: await this.observedShells(),
      claimedShellPids: await this.claimedShellPids(),
      // Coach's own extension host owns controlled Players; they are never "elsewhere".
      excludeRootPids: [process.pid]
    }).then(async (core) => {
      // Plain shells the human could deliberately adopt as a Terminal Player. A shell
      // already running a recognised agent is offered as that agent instead.
      const agentShells = new Set(core.externalCandidates.map((candidate) => candidate.shellPid));
      return { ...core, adoptableTerminals: await this.adoptableTerminals(agentShells) } as StadiumPlayerDiscovery;
    });
    this.lastDiscovery = result;
    this.checkedAt = 0; // force the next availability refresh to re-probe
    this.changed.fire();
    // Return core discovery to the RPC caller first. Provider CLI inspection is
    // optional enrichment and publishes through the same canonical change path.
    setImmediate(() => { void this.enrichDiscovery(result, generation); });
    return result;
  }

  private async enrichDiscovery(core: StadiumPlayerDiscovery, generation: number): Promise<void> {
    const enriched = await this.discovery.enrich(core);
    if (this.disposed || generation !== this.discoveryGeneration) return;
    const current = this.lastDiscovery;
    if (!current || current.stadiumId !== core.stadiumId || current.gameId !== core.gameId || current.at !== core.at) return;

    const controlsByType = new Map(enriched.catalog
      .filter((entry) => entry.controls)
      .map((entry) => [entry.playerType, entry.controls] as const));
    if (!controlsByType.size) return;

    // Preserve newer candidate reconciliation (for example an adoption that
    // completed while probing) and merge only the enrichment dimension.
    this.lastDiscovery = {
      ...current,
      catalog: current.catalog.map((entry) => {
        const controls = controlsByType.get(entry.playerType);
        return controls ? { ...entry, controls } : entry;
      })
    };
    this.changed.fire();
  }

  /**
   * Refuse to start a provider Player when the same provider is already running,
   * unless the human explicitly chose to start another. Scans afresh every time:
   * a Player started after the last Check Players must never be duplicated by a
   * stale snapshot. Terminal Players are shells and are never guarded.
   *
   * running-in-game   → the human should Add to Roster (adopt) instead.
   * running-elsewhere → another window's session; Coach cannot use it here, so
   *                     it asks before starting a new one for this Game.
   * An unsupported scan never blocks: unknown is not evidence of a duplicate.
   */
  private async guardAgainstDuplicate(player: PlayerAdapter, options: AddPlayerOptions | undefined): Promise<
    | undefined
    | { success: false; code: 'running-in-game' | 'running-elsewhere'; message: string; candidate?: ExternalPlayerCandidate; discovery?: StadiumPlayerDiscovery }
  > {
    if (options?.allowDuplicate || player.alwaysAvailable) return undefined;
    const scan = await this.discovery.scanRunning({
      shells: await this.observedShells(),
      claimedShellPids: await this.claimedShellPids(),
      excludeRootPids: [process.pid]
    });
    if (!scan.supported) return undefined;

    if (this.lastDiscovery) {
      this.lastDiscovery = { ...this.lastDiscovery, externalCandidates: scan.externalCandidates, runningElsewhere: scan.runningElsewhere };
    }
    const gameName = this.getGameContext().game.displayName;
    const candidate = scan.externalCandidates.find((entry) => entry.playerType === player.id);
    if (candidate) {
      return {
        success: false,
        code: 'running-in-game',
        message: `${player.name} is already running in "${candidate.terminalName}" in ${gameName}. Add that one to your Roster instead of starting another.`,
        candidate,
        discovery: this.lastDiscovery
      };
    }
    const elsewhere = scan.runningElsewhere.find((entry) => entry.playerType === player.id);
    if (elsewhere) {
      return {
        success: false,
        code: 'running-elsewhere',
        message: `${player.name} is already running outside ${gameName} on this computer. Coach can only use Players inside ${gameName}, so adding one here starts a new ${player.name}.`,
        discovery: this.lastDiscovery
      };
    }
    return undefined;
  }

  getLastDiscovery(): StadiumPlayerDiscovery | undefined {
    return this.lastDiscovery;
  }

  /**
   * Adopt an agent that was already running in this Game.
   *
   * This is the direct repair for the observed AntiGravity failure: the human
   * should never have to close a running agent and relaunch it through Coach
   * merely so Coach notices it. Adoption is explicit, records `adopted`
   * ownership, and never takes destructive authority over the process.
   */
  async adoptExternalPlayer(shellPid: number): Promise<{ success: boolean; message: string; instanceId?: string; discovery?: StadiumPlayerDiscovery }> {
    const discovery = this.lastDiscovery;
    const candidate = discovery?.externalCandidates.find((entry) => entry.shellPid === shellPid);
    if (!candidate) {
      return { success: false, message: 'Coach no longer sees that Player. Run Check Players again.' };
    }

    let target: vscode.Terminal | undefined;
    for (const terminal of vscode.window.terminals) {
      if (this.closed.has(terminal) || this.instanceByTerminal.has(terminal)) continue;
      if ((await this.terminalPid(terminal)) === shellPid) {
        target = terminal;
        break;
      }
    }
    if (!target) {
      return { success: false, message: 'That terminal is no longer open. Run Check Players again.' };
    }

    const record = this.book.allocate(candidate.playerType, 'adopted');
    this.register(record.instanceId, target);
    void this.recordProvenance(record, target);
    // Reconcile discovery in the same step: this process is on the roster now,
    // so it must stop being offered for recruitment.
    this.adoptedCandidates.set(record.instanceId, candidate);
    this.lastDiscovery = withoutClaimedCandidates(discovery!, new Set([shellPid]));
    this.changed.fire();

    const label = this.book.project(record).fieldLabel;
    return {
      success: true,
      message: `${label} was added to your roster from its running terminal. Coach will not close it.`,
      instanceId: record.instanceId,
      discovery: this.lastDiscovery
    };
  }

  async addInstance(id: string, options?: AddPlayerOptions): Promise<{ success: boolean; message: string; [key: string]: unknown }> {
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    await this.refreshAvailability(true);
    if (!this.availability.get(player.id)) return { success: false, message: `${player.name} is not available on this Stadium.` };
    const duplicate = await this.guardAgainstDuplicate(player, options);
    if (duplicate) return duplicate;
    const record = this.book.allocate(player.id);
    const terminal = vscode.window.createTerminal({ name: this.book.project(record).fieldLabel, env: { [ID_MARKER]: record.instanceId, [SEAT_MARKER]: String(record.seat) } });
    this.register(record.instanceId, terminal);
    terminal.show(true);
    terminal.sendText(player.command, true);
    void this.recordProvenance(record, terminal);
    this.changed.fire();
    return { success: true, message: `${this.book.project(record).fieldLabel} is on field.` };
  }

  async addControlledInstance(id: string, options?: AddPlayerOptions): Promise<{ success: boolean; message: string; [key: string]: unknown }> {
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    if (!this.controlHost.supports(player.id)) return { success: false, message: `${player.name} has no controlled adapter in this proof.` };
    await this.refreshAvailability(true);
    if (!this.availability.get(player.id)) return { success: false, message: `${player.name} is not available on this Stadium.` };
    const duplicate = await this.guardAgainstDuplicate(player, options);
    if (duplicate) return duplicate;
    const gameContext = this.getGameContext();
    const gameRoot = gameContext.binding.rootFsPath;
    if (gameContext.game.gameId === 'unknown' || !gameRoot) return { success: false, message: 'Open a valid Game workspace before starting a controlled Player.' };

    // Explicit Coach-managed authority. Adopted/external Players never enter this path.
    const authority = authorityForPlayer(player.id);
    if (!authority) return { success: false, message: `Needs attention: Coach could not start ${player.name} with your selected permission setting.` };

    const record = this.book.allocate(player.id);
    const projection = this.controlledProjection(this.book.project(record));
    const opened = await this.controlHost.open({
      instanceId: record.instanceId,
      playerType: record.playerType,
      seat: record.seat,
      gameRoot,
      gameId: gameContext.game.gameId,
      authority
    });
    if (opened.kind !== 'ready') {
      this.book.retire(record.instanceId);
      return { success: false, message: opened.message };
    }
    if (opened.control.state !== 'ready') {
      await this.controlHost.closeChannel(record.instanceId);
      this.book.retire(record.instanceId);
      return { success: false, message: 'The controlled Player became unavailable while opening.' };
    }

    const binding = this.createControlledPresentation(record.instanceId, this.book.project(record).fieldLabel, 'ready', 'Ready');
    binding.stopEvents = opened.control.onEvent((event) => binding.presentation.show(event));
    binding.presentation.ready(opened.control, false);
    binding.terminal.show(true);
    void this.queryPlayerCapabilities(record.instanceId);
    this.changed.fire();
    return { success: true, message: `${projection.fieldLabel} is on field.` };
  }

  private register(instanceId: string, terminal: vscode.Terminal): void {
    if (this.terminalByInstance.has(instanceId) || this.instanceByTerminal.has(terminal)) return;
    this.terminalByInstance.set(instanceId, terminal);
    this.instanceByTerminal.set(terminal, instanceId);
  }

  private async evaluate(terminal: vscode.Terminal): Promise<void> {
    if (this.closed.has(terminal) || this.instanceByTerminal.has(terminal) || this.evaluating.has(terminal)) return;
    this.evaluating.add(terminal);
    try {
      const pid = await this.terminalPid(terminal);
      if (this.closed.has(terminal) || !Number.isSafeInteger(pid) || !pid) return;
      const decision = decidePendingMatch(this.book.pendingRecords(), pid, await this.probeProcessIdentity(pid));
      if (decision.kind === 'adopt') {
        const record = this.book.adopt(decision.record.instanceId, decision.record.playerType, decision.record.seat);
        if (record) {
          this.register(record.instanceId, terminal);
          this.changed.fire();
        }
      } else if (decision.kind === 'dead' || decision.kind === 'contradiction') {
        this.removeProvenance(decision.records.map((record) => record.instanceId));
        this.changed.fire();
      }
    } finally {
      this.evaluating.delete(terminal);
    }
  }

  private retireTerminal(terminal: vscode.Terminal): void {
    this.closed.add(terminal);
    const controlledId = this.controlledInstanceByTerminal.get(terminal);
    if (controlledId) {
      if (terminal.exitStatus?.reason !== vscode.TerminalExitReason.User) return;
      this.controlledInstanceByTerminal.delete(terminal);
      const binding = this.controlledByInstance.get(controlledId);
      if (binding?.leaving) return;
      if (binding) binding.leaving = true;
      this.controlledByInstance.delete(controlledId);
      this.turnStateByInstance.delete(controlledId);
      binding?.stopEvents();
      binding?.presentation.dispose();
      void this.leaveControlled(controlledId);
      return;
    }
    const instanceId = this.instanceByTerminal.get(terminal);
    if (!instanceId) return;
    this.adoptedCandidates.delete(instanceId);
    this.instanceByTerminal.delete(terminal);
    this.terminalByInstance.delete(instanceId);
    this.turnStateByInstance.delete(instanceId);
    this.book.retire(instanceId);
    this.removeProvenance([instanceId]);
    this.retired.add(instanceId);
    this.changed.fire();
  }

  private handleControlEvent(hosted: HostedControlEvent): void {
    if (this.disposed) return;
    if (hosted.event.kind === 'turn') {
      const turnEvent: PlayerTurnEvent = {
        instanceId: hosted.instanceId,
        state: hosted.event.state,
        turnRef: hosted.event.turnRef,
        summary: hosted.event.summary,
        at: Date.now()
      };
      this.turnStateByInstance.set(hosted.instanceId, turnEvent);
      this.turnChanged.fire(turnEvent);
      this.changed.fire();
      return;
    }
    const binding = this.controlledByInstance.get(hosted.instanceId);
    if (hosted.event.kind !== 'channel' || (hosted.event.state !== 'lost' && hosted.event.state !== 'exited')) return;
    if (!binding) return;
    if (binding.leaving || binding.crashRestoreAttempted) return;
    binding.crashRestoreAttempted = true;
    binding.stopEvents();
    binding.stopEvents = () => undefined;
    binding.state = 'restoring';
    binding.stateMessage = 'Stopped unexpectedly. Resuming the same conversation…';
    binding.presentation.restoring(binding.stateMessage);
    this.changed.fire();
    void this.restoreControlled(hosted.instanceId, true);
  }

  private controlledProjection(projection: PlayerInstanceProjection, binding?: ControlledPresentation): PlayerInstanceProjection {
    const suffix = binding?.state === 'restoring' ? ' · Resuming…'
      : binding?.state === 'needs-verification' ? ' · Needs verification'
      : binding?.state === 'needs-sign-in' ? ' · Needs sign-in'
      : binding?.state === 'needs-decision' ? ' · Needs decision'
      : '';
    const base = projection.fieldLabel.replace(/\s*·\s*controlled.*$/i, '').trim();
    return { ...projection, fieldLabel: `${base} · Controlled${suffix}` };
  }

  private adoptControlledRestores(plans: readonly RestorePlan[]): void {
    for (const plan of plans) {
      const player = getPlayerAdapter(plan.record.playerType);
      if (!player) continue;
      const record = this.book.adoptControlled(plan.record.instanceId, player.id, plan.record.seat);
      if (!record) continue;
      if (record.seat !== plan.record.seat) void this.controlHost.updateSeat(record.instanceId, record.seat);
      const initialState: ControlledState = plan.kind === 'restore' ? 'restoring' : plan.kind;
      const initialMessage = plan.kind === 'restore' ? 'Resuming the same conversation…' : plan.message;
      const binding = this.createControlledPresentation(record.instanceId, this.book.project(record).fieldLabel, initialState, initialMessage);
      binding.presentation.restoring(initialMessage);
      if (plan.kind === 'restore') void this.restoreControlled(record.instanceId, false);
    }
    if (plans.length) this.changed.fire();
  }

  private createControlledPresentation(instanceId: string, fieldLabel: string, state: ControlledState, stateMessage: string): ControlledPresentation {
    fieldLabel = fieldLabel.replace(/\s*·\s*controlled.*$/i, '').trim();
    const presentation = new ControlledPlayerPresentation();
    const terminal = vscode.window.createTerminal({ name: `${fieldLabel} · Controlled`, pty: presentation, isTransient: true });
    const binding: ControlledPresentation = {
      terminal,
      presentation,
      stopEvents: () => undefined,
      state,
      stateMessage,
      leaving: false,
      crashRestoreAttempted: false
    };
    this.controlledByInstance.set(instanceId, binding);
    this.controlledInstanceByTerminal.set(terminal, instanceId);
    presentation.identity(fieldLabel);
    return binding;
  }

  private async restoreControlled(instanceId: string, afterCrash: boolean): Promise<void> {
    const binding = this.controlledByInstance.get(instanceId);
    const record = this.book.get(instanceId);
    const gameContext = this.getGameContext();
    const gameRoot = gameContext.binding.rootFsPath;
    if (!binding || !record || !gameRoot || gameContext.game.gameId === 'unknown') return;
    const authority = authorityForPlayer(record.playerType);
    if (!authority) {
      binding.state = 'needs-decision';
      binding.stateMessage = 'Needs attention: Coach could not start this Player with your selected permission setting.';
      binding.presentation.unavailable(binding.stateMessage);
      this.changed.fire();
      return;
    }
    const outcome = await this.controlHost.restore({
      instanceId,
      playerType: record.playerType,
      seat: record.seat,
      gameRoot,
      gameId: gameContext.game.gameId,
      authority
    });
    if (this.disposed) return;
    if (outcome.kind === 'ready') {
      binding.state = 'ready';
      binding.stateMessage = 'Ready';
      binding.stopEvents = outcome.control.onEvent((event) => binding.presentation.show(event));
      binding.presentation.ready(outcome.control, true);
      if (outcome.openedFresh) binding.presentation.notice(`No Plays had been sent yet. Coach opened a new conversation for ${this.book.project(record).fieldLabel}.`);
      if (outcome.reconciliation.kind !== 'none') binding.presentation.previousOutcome(outcome.reconciliation.summary);
      void this.queryPlayerCapabilities(instanceId);
    } else {
      binding.state = outcome.kind;
      binding.stateMessage = afterCrash ? `Automatic resume stopped. ${outcome.message}` : outcome.message;
      binding.presentation.unavailable(binding.stateMessage);
      // A conversation that could not be reopened does not un-know the provider's
      // models: keep exact provider truth observed from that same process.
      if (outcome.capabilities) this.capabilityService.record(outcome.capabilities);
    }
    this.changed.fire();
  }

  private async leaveControlled(instanceId: string): Promise<void> {
    try { await this.controlHost.leave(instanceId); }
    finally {
      this.book.retire(instanceId);
      this.retired.add(instanceId);
      this.turnStateByInstance.delete(instanceId);
      this.changed.fire();
    }
  }

  private async recordProvenance(record: { instanceId: string; playerType: PlayerId; seat: number }, terminal: vscode.Terminal): Promise<void> {
    const pid = await this.terminalPid(terminal);
    if (this.closed.has(terminal) || this.terminalByInstance.get(record.instanceId) !== terminal || !Number.isSafeInteger(pid) || !pid) return;
    const identity = await this.probeProcessIdentity(pid);
    if (this.closed.has(terminal) || this.terminalByInstance.get(record.instanceId) !== terminal || !identity.exists || !identity.startedAt) return;
    const provenance: PlayerProvenance = { ...record, shellPid: pid, shellStartedAt: identity.startedAt };
    this.provenance = [...this.provenance.filter((candidate) => candidate.instanceId !== record.instanceId), provenance];
    this.persistProvenance();
  }

  private async reconcilePending(): Promise<void> {
    for (const record of this.book.pendingRecords()) {
      const decision = decidePendingMatch(this.book.pendingRecords(), record.shellPid, await this.probeProcessIdentity(record.shellPid));
      if (decision.kind === 'dead' || decision.kind === 'contradiction') this.removeProvenance(decision.records.map((candidate) => candidate.instanceId));
    }
  }

  private loadProvenance(): void {
    const stored = this.workspaceState.get<unknown>(PROVENANCE_KEY);
    if (stored === undefined) return;
    if (!Array.isArray(stored) || !stored.every(isPlayerProvenance)) {
      this.provenance = [];
      this.persistProvenance();
      return;
    }
    const accepted: PlayerProvenance[] = [];
    for (const record of stored) {
      if (this.book.reservePending(record)) accepted.push(record);
    }
    this.provenance = accepted;
    if (accepted.length !== stored.length) this.persistProvenance();
  }

  private removeProvenance(instanceIds: readonly string[]): void {
    for (const instanceId of instanceIds) this.book.removePending(instanceId);
    this.provenance = this.provenance.filter((record) => !instanceIds.includes(record.instanceId));
    this.persistProvenance();
  }

  private persistProvenance(): void {
    const snapshot = this.provenance.map(({ instanceId, playerType, seat, shellPid, shellStartedAt }) => ({ instanceId, playerType, seat, shellPid, shellStartedAt }));
    this.writeChain = this.writeChain.then(async () => { await this.workspaceState.update(PROVENANCE_KEY, snapshot); }).catch(() => undefined);
  }

  private async probeProcessIdentity(pid: number): Promise<ProcessIdentity> {
    if (process.platform !== 'win32') return { exists: true };
    try {
      const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $p) { 'missing' } else { try { $p.StartTime.ToUniversalTime().ToString('o') } catch { 'unknown' } }`;
      const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', script], { timeout: 3_000, windowsHide: true });
      const value = stdout.trim();
      if (value === 'missing') return { exists: false };
      if (value === 'unknown' || Number.isNaN(Date.parse(value))) return { exists: true };
      return { exists: true, startedAt: value };
    } catch {
      return { exists: true };
    }
  }

  private async terminalPid(terminal: vscode.Terminal): Promise<number | undefined> {
    try { return await terminal.processId; } catch { return undefined; }
  }

  private async refreshAvailability(force = false): Promise<void> {
    if (!force && Date.now() - this.checkedAt < 5_000) return;
    this.availability = new Map(
      await Promise.all(
        PLAYER_ADAPTERS.map(async (player) => {
          // Terminal needs no installation, so probing for a binary would be wrong.
          if (player.alwaysAvailable) return [player.id, true] as const;
          return [player.id, await this.commandAvailable(player.probeCommand ?? player.command.split(/\s+/, 1)[0])] as const;
        })
      )
    );
    this.checkedAt = Date.now();
  }
  private async commandAvailable(command: string): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try { const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-Command', `if (Get-Command -Name '${command}' -ErrorAction SilentlyContinue) { 'available' }`], { timeout: 3_000, windowsHide: true }); return stdout.trim() === 'available'; } catch { return false; }
  }

  getRoutingCapabilities(activeGameId?: string): PlayerRoutingCapability[] {
    const connectedGameId = this.getGameContext().game.gameId;
    if (activeGameId && activeGameId !== connectedGameId) {
      return [];
    }
    const list: PlayerRoutingCapability[] = [];
    for (const projection of this.book.projections()) {
      // A benched Player is retained and returnable, but must not receive Plays.
      if (!projection.onField) continue;
      const instanceId = projection.instanceId;
      // Terminal (P0.1): a first-class MANUAL target that runs exact commands. It is
      // a shell, not a reasoning provider: no model, no reasoning, never AUTO.
      if (projection.playerType === 'terminal') {
        const terminal = this.terminalByInstance.get(instanceId);
        if (!terminal || this.retired.has(instanceId) || this.closed.has(terminal)) continue;
        list.push({
          instanceId,
          playerType: 'terminal',
          transport: 'legacy',
          transportLabel: transportLabel({ controlled: false, playerType: projection.playerType, ownership: projection.ownership }),
          fieldLabel: projection.fieldLabel,
          state: this.activeCommandFor(instanceId) ? 'busy' : 'ready',
          capability: this.capabilityService.createUnavailable('terminal'),
          executionType: 'direct-shell'
        });
        continue;
      }
      const controlled = this.controlledByInstance.get(instanceId);
      if (controlled) {
        const control = this.controlHost.resolve(instanceId);
        const turnState = this.turnStateByInstance.get(instanceId);
        let state: 'ready' | 'busy' | 'unavailable' | 'needs-verification' = 'ready';
        if (controlled.state !== 'ready') {
          state = controlled.state === 'needs-verification' ? 'needs-verification' : 'unavailable';
        } else if (turnState?.state === 'accepted' || turnState?.state === 'started' || control?.state === 'active') {
          state = 'busy';
        }
        list.push({
          instanceId,
          playerType: projection.playerType,
          transport: 'controlled',
          transportLabel: transportLabel({ controlled: true, playerType: projection.playerType, ownership: projection.ownership }),
          fieldLabel: projection.fieldLabel,
          state,
          capability: this.capabilityService.get(projection.playerType),
          activeModel: control?.model,
          activeEffort: control?.effort
        });
      } else {
        const terminal = this.terminalByInstance.get(instanceId);
        if (terminal && !this.retired.has(instanceId)) {
          list.push({
            instanceId,
            playerType: projection.playerType,
            transport: 'legacy',
            transportLabel: transportLabel({ controlled: false, playerType: projection.playerType, ownership: projection.ownership }),
            fieldLabel: projection.fieldLabel,
            state: 'ready',
            capability: this.capabilityService.createUnavailable(projection.playerType)
          });
        }
      }
    }
    return list;
  }

  async refreshCapabilities(provider?: string): Promise<void> {
    const targets = Array.from(this.controlledByInstance.entries())
      .filter(([instanceId, binding]) => {
        if (binding.state !== 'ready') return false;
        const record = this.book.get(instanceId);
        if (!record) return false;
        return !provider || record.playerType === provider;
      });

    if (targets.length === 0) {
      this.capabilityService.invalidate(provider);
      this.changed.fire();
      return;
    }

    for (const [instanceId] of targets) {
      await this.queryPlayerCapabilities(instanceId);
    }
  }

  private async queryPlayerCapabilities(instanceId: string): Promise<void> {
    try {
      const snapshot = await this.controlHost.queryCapabilities(instanceId);
      if (snapshot) {
        this.capabilityService.record(snapshot);
        this.changed.fire();
      }
    } catch {
      // Capability query failure leaves service in existing state
    }
  }
}
