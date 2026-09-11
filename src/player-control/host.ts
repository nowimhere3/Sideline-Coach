import * as crypto from 'node:crypto';
import { cloneRecord, planControlledRestores, type BindingStore, type ControlledBindingRecord, type RestorePlan } from './bindings';
import { ControlOpenError, type ControlEvent, type ControlOpenOutcome, type ControlOpenRequest, type ControlRestoreOutcome, type DeliveryOutcome, type PlayerControl, type PlayerControlFactory } from './contract';

export interface HostedControlEvent { instanceId: string; event: ControlEvent; }

const EMPTY_STORE: BindingStore = { load: () => [], save: async () => undefined };

/** Owns provider controls, the per-Game binding table, and transport/restore truth. */
export class PlayerControlHost {
  private readonly factoriesByType = new Map<string, PlayerControlFactory>();
  private readonly factoriesByAdapter = new Map<string, PlayerControlFactory>();
  private readonly controls = new Map<string, PlayerControl>();
  private readonly unsubscribe = new Map<string, () => void>();
  private readonly listeners = new Set<(event: HostedControlEvent) => void>();
  private readonly deferredOutcomes = new Map<string, ControlEvent>();
  private readonly delivering = new Set<string>();
  private records: ControlledBindingRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private restoreSlots = 0;
  private activeRestoreOperations = 0;
  private readonly restoreWaiters: Array<() => void> = [];
  private readonly restoreIdleWaiters: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly store: BindingStore = EMPTY_STORE, private readonly maxConcurrentRestores = 3) {}

  register(playerType: string, factory: PlayerControlFactory): void {
    if (this.factoriesByType.has(playerType)) throw new Error(`A control adapter is already registered for '${playerType}'.`);
    if (this.factoriesByAdapter.has(factory.adapterId)) throw new Error(`A control adapter is already registered as '${factory.adapterId}'.`);
    this.factoriesByType.set(playerType, factory);
    this.factoriesByAdapter.set(factory.adapterId, factory);
  }

  supports(playerType: string): boolean { return this.factoriesByType.has(playerType); }
  resolve(instanceId: string): PlayerControl | undefined { return this.controls.get(instanceId); }
  binding(instanceId: string): ControlledBindingRecord | undefined { return this.records.find((record) => record.instanceId === instanceId); }

  planRestores(): RestorePlan[] {
    const stored = this.store.load();
    const plans = planControlledRestores(stored, new Set(this.factoriesByAdapter.keys())).map((plan): RestorePlan => {
      if (plan.kind !== 'restore') return plan;
      return this.factoriesByType.get(plan.record.playerType)?.adapterId === plan.record.adapter
        ? plan
        : { kind: 'needs-verification', record: plan.record, message: `Controlled adapter '${plan.record.adapter}' is not registered for ${plan.record.playerType}.` };
    });
    this.records = plans.map((plan) => cloneRecord(plan.record));
    if (!Array.isArray(stored) || stored.length !== this.records.length) void this.persist();
    return plans;
  }

  async open(request: ControlOpenRequest): Promise<ControlOpenOutcome> {
    if (this.disposed) return { kind: 'failed', message: 'Player Control Host is shutting down.' };
    if (this.controls.has(request.instanceId) || this.binding(request.instanceId)) return { kind: 'failed', message: 'That Player already has a control binding.' };
    const factory = this.factoriesByType.get(request.playerType);
    if (!factory) return { kind: 'failed', message: 'No certified control adapter is registered for that Player.' };
    try {
      const control = await factory.open(request);
      const record: ControlledBindingRecord = {
        instanceId: request.instanceId,
        playerType: request.playerType,
        seat: request.seat,
        adapter: factory.adapterId,
        sessionRef: control.providerSessionRef,
        historyExpected: false,
        pendingPlay: null
      };
      this.records.push(record);
      try { await this.persist(); }
      catch (error) {
        this.records = this.records.filter((candidate) => candidate !== record);
        await control.close();
        return { kind: 'failed', message: `Coach couldn't record this controlled Player safely: ${messageOf(error)}` };
      }
      this.bind(control);
      return { kind: 'ready', control };
    } catch (error) {
      if (error instanceof ControlOpenError) return { kind: error.outcome, message: error.message };
      return { kind: 'failed', message: messageOf(error) };
    }
  }

  async restore(request: ControlOpenRequest): Promise<ControlRestoreOutcome> {
    if (this.disposed) return { kind: 'needs-decision', message: 'Player Control Host is shutting down.' };
    const record = this.binding(request.instanceId);
    if (!record) return { kind: 'needs-decision', message: 'The controlled Player binding is unavailable.' };
    const factory = this.factoriesByAdapter.get(record.adapter);
    if (!factory) return { kind: 'needs-verification', message: `Controlled adapter '${record.adapter}' is not registered.` };
    if (this.controls.has(request.instanceId)) await this.detach(request.instanceId);
    this.activeRestoreOperations += 1;
    await this.acquireRestoreSlot();
    let restoredControl: PlayerControl | undefined;
    try {
      if (this.disposed) return { kind: 'needs-decision', message: 'Player Control Host is shutting down.' };
      const outcome = await factory.restore(request, cloneRecord(record));
      if (outcome.kind !== 'ready') return outcome;
      restoredControl = outcome.control;
      if (this.disposed) {
        await restoredControl.close();
        restoredControl = undefined;
        return { kind: 'needs-decision', message: 'Player Control Host shut down during restore.' };
      }
      if (this.records.some((candidate) => candidate !== record && candidate.adapter === record.adapter && candidate.sessionRef === outcome.control.providerSessionRef)) {
        await outcome.control.close();
        return { kind: 'needs-decision', message: 'That provider conversation is already bound to another controlled Player.' };
      }
      if (outcome.openedFresh) {
        record.sessionRef = outcome.control.providerSessionRef;
        record.historyExpected = false;
        record.pendingPlay = null;
        await this.persist();
      } else if (outcome.reconciliation.kind !== 'none' && outcome.reconciliation.kind !== 'unknown') {
        record.pendingPlay = null;
        await this.persist();
      }
      this.bind(outcome.control);
      restoredControl = undefined;
      return outcome;
    } catch (error) {
      await restoredControl?.close();
      return { kind: 'needs-decision', message: messageOf(error) };
    } finally {
      this.releaseRestoreSlot();
      this.activeRestoreOperations -= 1;
      if (this.activeRestoreOperations === 0) {
        for (const resolve of this.restoreIdleWaiters.splice(0)) resolve();
      }
    }
  }

  async updateSeat(instanceId: string, seat: number): Promise<void> {
    const record = this.binding(instanceId);
    if (!record || record.seat === seat) return;
    record.seat = seat;
    await this.persist();
  }

  async deliver(instanceId: string, play: string): Promise<DeliveryOutcome> {
    const control = this.controls.get(instanceId);
    const record = this.binding(instanceId);
    if (!control || !record) return { kind: 'refused', reason: 'closed', message: 'That controlled Player has left the field.' };
    if (control.state === 'active') return { kind: 'refused', reason: 'busy', message: 'That Player is still working.' };

    const previousHistoryExpected = record.historyExpected;
    const clientRef = crypto.randomUUID();
    record.historyExpected = true;
    record.pendingPlay = { clientRef };
    try { await this.persist(); }
    catch {
      record.historyExpected = previousHistoryExpected;
      record.pendingPlay = null;
      return { kind: 'refused', reason: 'unavailable', message: `Coach couldn't record this Play safely.` };
    }

    this.delivering.add(instanceId);
    let outcome: DeliveryOutcome;
    try { outcome = await control.deliver(play, clientRef); }
    catch (error) { outcome = { kind: 'unknown', reason: `Controlled delivery ended without authoritative acknowledgement: ${messageOf(error)}` }; }
    if (outcome.kind === 'accepted') {
      record.pendingPlay = { clientRef, turnRef: outcome.turnRef };
      try { await this.persist(); } catch { /* clientRef remains sufficient for later reconciliation. */ }
    } else if (outcome.kind === 'refused') {
      record.historyExpected = previousHistoryExpected;
      record.pendingPlay = null;
      try { await this.persist(); } catch { /* The refusal proves no provider turn ran. */ }
    }
    this.delivering.delete(instanceId);
    const deferred = this.deferredOutcomes.get(instanceId);
    if (deferred) {
      this.deferredOutcomes.delete(instanceId);
      await this.recordDefiniteOutcome(instanceId, deferred);
    }
    return outcome;
  }

  async leave(instanceId: string): Promise<void> {
    await this.detach(instanceId);
    const index = this.records.findIndex((record) => record.instanceId === instanceId);
    if (index >= 0) this.records.splice(index, 1);
    await this.persist();
  }

  async closeChannel(instanceId: string): Promise<void> { await this.detach(instanceId); }

  /** Stage 1.17 compatibility: closing a fielded control is an explicit leave. */
  async close(instanceId: string): Promise<void> { await this.leave(instanceId); }

  onEvent(listener: (event: HostedControlEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.controls.keys()].map((id) => this.detach(id)));
    if (this.activeRestoreOperations > 0) await new Promise<void>((resolve) => this.restoreIdleWaiters.push(resolve));
    await Promise.all([...this.controls.keys()].map((id) => this.detach(id)));
    await this.writeChain.catch(() => undefined);
    this.listeners.clear();
  }

  private bind(control: PlayerControl): void {
    this.controls.set(control.instanceId, control);
    this.unsubscribe.set(control.instanceId, control.onEvent((event) => {
      if (event.kind === 'turn' && (event.state === 'completed' || event.state === 'failed' || event.state === 'interrupted')) {
        if (this.delivering.has(control.instanceId)) this.deferredOutcomes.set(control.instanceId, event);
        else void this.recordDefiniteOutcome(control.instanceId, event);
      }
      this.emit({ instanceId: control.instanceId, event });
    }));
  }

  private async recordDefiniteOutcome(instanceId: string, event: ControlEvent): Promise<void> {
    if (event.kind !== 'turn') return;
    const record = this.binding(instanceId);
    if (!record?.pendingPlay) return;
    if (event.turnRef && record.pendingPlay.turnRef && event.turnRef !== record.pendingPlay.turnRef) return;
    record.pendingPlay = null;
    try { await this.persist(); } catch { /* Retaining a stale durable marker is safer than pretending clearance. */ }
  }

  private async detach(instanceId: string): Promise<void> {
    const control = this.controls.get(instanceId);
    this.controls.delete(instanceId);
    this.unsubscribe.get(instanceId)?.();
    this.unsubscribe.delete(instanceId);
    if (control) await control.close();
  }

  private persist(): Promise<void> {
    const snapshot = this.records.map(cloneRecord);
    const write = this.writeChain.then(() => this.store.save(snapshot));
    this.writeChain = write.catch(() => undefined);
    return write;
  }

  private async acquireRestoreSlot(): Promise<void> {
    if (this.restoreSlots < this.maxConcurrentRestores) { this.restoreSlots += 1; return; }
    await new Promise<void>((resolve) => this.restoreWaiters.push(resolve));
    this.restoreSlots += 1;
  }

  private releaseRestoreSlot(): void {
    this.restoreSlots -= 1;
    this.restoreWaiters.shift()?.();
  }

  private emit(event: HostedControlEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
