import { capabilityDefinition, isCapabilityId, type CapabilityId } from './capabilities';
import type { CapabilityState, EntitlementAuthority } from './authority';
import {
  ceilingEverUsed,
  isMember,
  planAdmit,
  planGrandfather,
  planCountCharge,
  planCountRelease,
  planMinuteCharge,
  planRemoveMember,
  type PendingReceipt
} from './meters';
import type { UsageStore } from './usage-store';

/**
 * S57.2 §5 — the one way feature code asks "may I execute this capability now?".
 *
 * Feature code sees only GateDecisions: never grants, profiles, plans, prices, billing,
 * or who the user is. Once allowed, the feature runs exactly as it always did.
 *
 * ENTITLED ≠ AVAILABLE ≠ RECOMMENDED. The gate answers only entitlement (and allowance).
 * Runtime readiness stays with each feature's own owner; recommendation stays with routing.
 */

export type GateReason =
  | 'entitled'
  | 'unlimited'
  | 'not-entitled'
  | 'allowance-exhausted'
  | 'ceiling-reached'
  | 'grace'
  | 'reserved'
  | 'unknown-capability';

export interface GateDecision {
  readonly capability: CapabilityId;
  readonly allowed: boolean;
  readonly reason: GateReason;
  readonly state: CapabilityState;
  /** One sentence, capability-named, never plan-named. Present when denied. */
  readonly dadMessage?: string;
}

/** The read-only surface choke points depend on. */
export interface FeatureGateReader {
  check(capability: CapabilityId, options?: { readonly units?: number; readonly member?: string }): GateDecision;
}

export interface FeatureGateOptions {
  /** Absent: charge/release decide but record nothing (C1/C2: read-only). */
  readonly usage?: UsageStore;
  /** Tests: 'throw'. Production: 'allow' with a warning, so a catalogue bug never breaks Core. */
  readonly onUnknownCapability?: 'throw' | 'allow';
  readonly warn?: (message: string) => void;
}

export interface MinuteChargeResult {
  readonly decision: GateDecision;
  readonly charged: number;
  readonly duplicate: number;
  readonly exhausted: number;
}

const UNKNOWN_STATE: CapabilityState = { entitled: true, unlimited: true };

export class FeatureGate implements FeatureGateReader {
  private readonly usage: UsageStore | undefined;
  private readonly onUnknown: 'throw' | 'allow';
  private readonly warn: (message: string) => void;

  constructor(private readonly authority: EntitlementAuthority, options: FeatureGateOptions = {}) {
    this.usage = options.usage;
    this.onUnknown = options.onUnknownCapability ?? 'allow';
    this.warn = options.warn ?? (() => undefined);
  }

  /** Pure read. No side effects. */
  check(capability: CapabilityId, options: { readonly units?: number; readonly member?: string } = {}): GateDecision {
    if (!isCapabilityId(capability)) return this.unknown(capability);
    const definition = capabilityDefinition(capability);
    const state = this.authority.capabilityState(capability);
    if (definition.reserved) return { capability, allowed: true, reason: 'reserved', state };
    if (!state.entitled) return deny(capability, 'not-entitled', state);
    if (state.unlimited) return { capability, allowed: true, reason: 'unlimited', state };
    switch (definition.meter) {
      case 'flag':
        return { capability, allowed: true, reason: 'entitled', state };
      case 'ceiling': {
        const owner = this.owner(capability);
        if (options.member !== undefined && this.usage && isMember(this.usage.state, owner, options.member)) {
          return { capability, allowed: true, reason: 'entitled', state };
        }
        return (state.remaining ?? 0) >= 1 ? { capability, allowed: true, reason: 'entitled', state } : deny(capability, 'ceiling-reached', state);
      }
      case 'count':
      case 'minutes':
        return (state.remaining ?? 0) >= (options.units ?? 1)
          ? { capability, allowed: true, reason: 'entitled', state }
          : deny(capability, 'allowance-exhausted', state);
    }
  }

  /**
   * Count meters: check and record one idempotent consumption keyed by `idempotencyKey`.
   * Ceiling meters: admit `idempotencyKey` as a member (idempotent). Flags: same as check.
   * Without a usage store this only decides.
   */
  charge(capability: CapabilityId, idempotencyKey: string, units = 1): GateDecision {
    if (!isCapabilityId(capability)) return this.unknown(capability);
    const definition = capabilityDefinition(capability);
    if (definition.meter === 'minutes') throw new Error('Minutes are charged by minute range: use chargeMinutes().');
    if (definition.reserved || definition.meter === 'flag' || !this.usage) {
      return this.check(capability, definition.meter === 'ceiling' ? { member: idempotencyKey } : { units });
    }
    const now = this.authority.clock();
    const owner = this.owner(capability);
    const grants = this.authority.grantsFor(capability, now);
    if (definition.meter === 'ceiling') {
      const plan = planAdmit(this.usage.state, owner, idempotencyKey, grants, now);
      this.record(plan.receipts);
      const state = this.authority.capabilityState(capability, now);
      if (plan.outcome === 'not-entitled') return deny(capability, 'not-entitled', state);
      if (plan.outcome === 'ceiling-reached') return deny(capability, 'ceiling-reached', state);
      return { capability, allowed: true, reason: state.unlimited ? 'unlimited' : 'entitled', state };
    }
    const plan = planCountCharge(this.usage.state, owner, idempotencyKey, units, grants, now, this.authority.offset);
    this.record(plan.receipts);
    const state = this.authority.capabilityState(capability, now);
    if (plan.outcome === 'not-entitled') return deny(capability, 'not-entitled', state);
    if (plan.outcome === 'exhausted') return deny(capability, 'allowance-exhausted', state);
    return { capability, allowed: true, reason: state.unlimited ? 'unlimited' : 'entitled', state };
  }

  /** Refunds a count consumption or removes a ceiling member. Idempotent; no-op without a store. */
  release(capability: CapabilityId, idempotencyKey: string): void {
    if (!isCapabilityId(capability) || !this.usage) return;
    const definition = capabilityDefinition(capability);
    const now = this.authority.clock();
    const owner = this.owner(capability);
    if (definition.meter === 'count') this.record(planCountRelease(this.usage.state, owner, idempotencyKey, now));
    else if (definition.meter === 'ceiling') this.record(planRemoveMember(this.usage.state, owner, idempotencyKey, now));
  }

  /** Ceiling meters: is `member` currently admitted? False without a usage store. */
  hasMember(capability: CapabilityId, member: string): boolean {
    if (!isCapabilityId(capability) || !this.usage) return false;
    return isMember(this.usage.state, this.owner(capability), member);
  }

  /**
   * S57.2 §8.3 (C5): one-time grandfathering seed for a ceiling meter. Runs only while the
   * meter has never been used, records every member regardless of the ceiling, and returns
   * how many were seeded. A no-op without a usage store or once the meter has any history.
   */
  grandfather(capability: CapabilityId, members: readonly string[]): number {
    if (!isCapabilityId(capability) || !this.usage) return 0;
    if (capabilityDefinition(capability).meter !== 'ceiling') throw new Error(`${capability} is not a ceiling meter.`);
    const owner = this.owner(capability);
    if (ceilingEverUsed(this.usage.state, owner)) return 0;
    const receipts = planGrandfather(this.usage.state, owner, members, this.authority.clock());
    this.record(receipts);
    return receipts.length;
  }

  /**
   * Duration meters (Mobile Remote from C4): charges each not-yet-charged minute index in
   * [firstMinute, lastMinute]. Re-charging the same minutes is a no-op.
   */
  chargeMinutes(capability: CapabilityId, firstMinute: number, lastMinute: number): MinuteChargeResult {
    if (!isCapabilityId(capability)) return { decision: this.unknown(capability), charged: 0, duplicate: 0, exhausted: 0 };
    if (capabilityDefinition(capability).meter !== 'minutes') throw new Error(`${capability} is not a minutes meter.`);
    if (!this.usage) return { decision: this.check(capability), charged: 0, duplicate: 0, exhausted: 0 };
    const now = this.authority.clock();
    const plan = planMinuteCharge(this.usage.state, this.owner(capability), firstMinute, lastMinute, this.authority.grantsFor(capability, now), now, this.authority.offset);
    this.record(plan.receipts);
    return { decision: this.check(capability), charged: plan.charged, duplicate: plan.duplicate, exhausted: plan.exhausted };
  }

  /** The capability whose meter a (possibly inheriting) facet actually consumes. */
  private owner(capability: CapabilityId): CapabilityId {
    return this.authority.grantsFor(capability)[0]?.capability ?? capability;
  }

  private record(receipts: readonly PendingReceipt[]): void {
    if (!this.usage || receipts.length === 0) return;
    try {
      this.usage.commit(receipts);
    } catch (error) {
      // Never block the feature on bookkeeping: an unrecorded use under-counts.
      this.warn(`Usage could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private unknown(capability: unknown): GateDecision {
    if (this.onUnknown === 'throw') throw new Error(`Unknown capability: ${String(capability)}`);
    this.warn(`Unknown capability checked: ${String(capability)}`);
    return { capability: capability as CapabilityId, allowed: true, reason: 'unknown-capability', state: UNKNOWN_STATE };
  }
}

function deny(capability: CapabilityId, reason: 'not-entitled' | 'allowance-exhausted' | 'ceiling-reached', state: CapabilityState): GateDecision {
  return { capability, allowed: false, reason, state, dadMessage: denialMessage(capability, reason, state) };
}

export function denialMessage(capability: CapabilityId, reason: 'not-entitled' | 'allowance-exhausted' | 'ceiling-reached', state: CapabilityState): string {
  const name = capabilityDefinition(capability).dadName;
  if (reason === 'not-entitled') return `${name}: not included in this Sideline.`;
  if (reason === 'ceiling-reached') {
    // Q5 copy: capability-named, never plan-named.
    if (capability === 'games.active') return `You're using all ${state.limit ?? 0} active Game slots. Archive a Game to make room.`;
    return `${name}: all ${state.limit ?? 0} slots are in use.`;
  }
  if (state.resetsAt === undefined) return `${name}: allowance used up.`;
  const date = new Date(state.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${name}: allowance used up until ${date}.`;
}
