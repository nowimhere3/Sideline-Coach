import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { ControlledPlayerPresentation } from './controlled-player-presentation';
import { PLAYER_ADAPTERS, getPlayerAdapter, type PlayerId } from './player-adapters';
import type { HostedControlEvent } from './player-control/host';
import { PlayerControlHost } from './player-control/host';
import type { DeliveryOutcome } from './player-control/contract';
import type { RestorePlan } from './player-control/bindings';
import { decidePendingMatch, isPlayerProvenance, PlayerInstanceBook, type PlayerInstanceProjection, type PlayerProvenance, type ProcessIdentity } from './player-instances';

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
  private readonly retired = new Set<string>();
  private readonly evaluating = new WeakSet<vscode.Terminal>();
  private readonly closed = new WeakSet<vscode.Terminal>();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly openListener: vscode.Disposable;
  private readonly closeListener: vscode.Disposable;
  private readonly stopControlEvents: () => void;
  private provenance: PlayerProvenance[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private disposed = false;
  readonly onDidChange = this.changed.event;

  constructor(private readonly workspaceState: vscode.Memento, private readonly controlHost: PlayerControlHost) {
    this.loadProvenance();
    this.stopControlEvents = controlHost.onEvent((event) => this.handleControlEvent(event));
    this.adoptControlledRestores(controlHost.planRestores());
    this.openListener = vscode.window.onDidOpenTerminal((terminal) => { void this.evaluate(terminal); });
    this.closeListener = vscode.window.onDidCloseTerminal((terminal) => this.retireTerminal(terminal));
    for (const terminal of vscode.window.terminals) void this.evaluate(terminal);
    void this.reconcilePending();
  }

  dispose(): void {
    this.disposed = true;
    this.openListener.dispose();
    this.closeListener.dispose();
    this.stopControlEvents();
    for (const binding of this.controlledByInstance.values()) {
      binding.stopEvents();
      binding.presentation.dispose();
    }
    this.controlledByInstance.clear();
    this.controlledInstanceByTerminal.clear();
    void this.controlHost.dispose();
    this.changed.dispose();
  }
  instances(): PlayerInstanceProjection[] { return this.book.projections(); }
  terminalFor(instanceId: string): vscode.Terminal | undefined { return this.terminalByInstance.get(instanceId); }
  isRetired(instanceId: string): boolean { return this.retired.has(instanceId); }
  deliverControlled(instanceId: string, play: string): Promise<DeliveryOutcome> { return this.controlHost.deliver(instanceId, play); }
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

  async status() {
    await this.refreshAvailability();
    return PLAYER_ADAPTERS.map((player) => {
      const instances = this.book.byType(player.id).map((record) => {
        const projection = this.book.project(record);
        return this.controlledByInstance.has(record.instanceId)
          ? { ...this.controlledProjection(projection, this.controlledByInstance.get(record.instanceId)), controlMode: 'controlled' as const, controlState: this.controlledByInstance.get(record.instanceId)?.state, stateMessage: this.controlledByInstance.get(record.instanceId)?.stateMessage }
          : projection;
      });
      const available = this.availability.get(player.id) === true;
      return { id: player.id, name: player.name, availability: available ? 'available' as const : 'not-available' as const, fieldState: instances.length ? 'on-field' as const : available ? 'ready-on-bench' as const : 'not-available' as const, instances };
    });
  }

  async putOnField(id: string): Promise<{ success: boolean; message: string }> {
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    const existing = this.book.byType(player.id)[0];
    if (existing) {
      this.terminalByInstance.get(existing.instanceId)?.show(true);
      this.controlledByInstance.get(existing.instanceId)?.terminal.show(true);
      return { success: true, message: `${this.book.project(existing).fieldLabel} is already on field.` };
    }
    return this.addInstance(id);
  }

  async addInstance(id: string): Promise<{ success: boolean; message: string }> {
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    await this.refreshAvailability(true);
    if (!this.availability.get(player.id)) return { success: false, message: `${player.name} is not available on this Stadium.` };
    const record = this.book.allocate(player.id);
    const terminal = vscode.window.createTerminal({ name: this.book.project(record).fieldLabel, env: { [ID_MARKER]: record.instanceId, [SEAT_MARKER]: String(record.seat) } });
    this.register(record.instanceId, terminal);
    terminal.show(true);
    terminal.sendText(player.command, true);
    void this.recordProvenance(record, terminal);
    this.changed.fire();
    return { success: true, message: `${this.book.project(record).fieldLabel} is on field.` };
  }

  async addControlledInstance(id: string): Promise<{ success: boolean; message: string }> {
    const player = getPlayerAdapter(id);
    if (!player) return { success: false, message: 'Unknown Player.' };
    if (!this.controlHost.supports(player.id)) return { success: false, message: `${player.name} has no controlled adapter in this proof.` };
    await this.refreshAvailability(true);
    if (!this.availability.get(player.id)) return { success: false, message: `${player.name} is not available on this Stadium.` };
    const gameRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!gameRoot) return { success: false, message: 'Open a Game workspace before starting a controlled Player.' };

    const record = this.book.allocate(player.id);
    const projection = this.controlledProjection(this.book.project(record));
    const opened = await this.controlHost.open({
      instanceId: record.instanceId,
      playerType: record.playerType,
      seat: record.seat,
      gameRoot,
      authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
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

    const binding = this.createControlledPresentation(record.instanceId, projection.fieldLabel, 'ready', 'Ready');
    binding.stopEvents = opened.control.onEvent((event) => binding.presentation.show(event));
    binding.presentation.ready(opened.control, false);
    binding.terminal.show(true);
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
      binding?.stopEvents();
      binding?.presentation.dispose();
      void this.leaveControlled(controlledId);
      return;
    }
    const instanceId = this.instanceByTerminal.get(terminal);
    if (!instanceId) return;
    this.instanceByTerminal.delete(terminal);
    this.terminalByInstance.delete(instanceId);
    this.book.retire(instanceId);
    this.removeProvenance([instanceId]);
    this.retired.add(instanceId);
    this.changed.fire();
  }

  private handleControlEvent(hosted: HostedControlEvent): void {
    if (this.disposed) return;
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
    return { ...projection, fieldLabel: `${projection.fieldLabel} · Controlled${suffix}` };
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
    const gameRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!binding || !record || !gameRoot) return;
    const outcome = await this.controlHost.restore({
      instanceId,
      playerType: record.playerType,
      seat: record.seat,
      gameRoot,
      authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
    });
    if (this.disposed) return;
    if (outcome.kind === 'ready') {
      binding.state = 'ready';
      binding.stateMessage = 'Ready';
      binding.stopEvents = outcome.control.onEvent((event) => binding.presentation.show(event));
      binding.presentation.ready(outcome.control, true);
      if (outcome.openedFresh) binding.presentation.notice(`No Plays had been sent yet. Coach opened a new conversation for ${this.book.project(record).fieldLabel}.`);
      if (outcome.reconciliation.kind !== 'none') binding.presentation.previousOutcome(outcome.reconciliation.summary);
    } else {
      binding.state = outcome.kind;
      binding.stateMessage = afterCrash ? `Automatic resume stopped. ${outcome.message}` : outcome.message;
      binding.presentation.unavailable(binding.stateMessage);
    }
    this.changed.fire();
  }

  private async leaveControlled(instanceId: string): Promise<void> {
    try { await this.controlHost.leave(instanceId); }
    finally {
      this.book.retire(instanceId);
      this.retired.add(instanceId);
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
    this.availability = new Map(await Promise.all(PLAYER_ADAPTERS.map(async (player) => [player.id, await this.commandAvailable(player.command.split(/\s+/, 1)[0])] as const)));
    this.checkedAt = Date.now();
  }
  private async commandAvailable(command: string): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try { const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-Command', `if (Get-Command -Name '${command}' -ErrorAction SilentlyContinue) { 'available' }`], { timeout: 3_000, windowsHide: true }); return stdout.trim() === 'available'; } catch { return false; }
  }
}
