/**
 * Virtual / Orchestrated Players (S31 Slice 5).
 *
 * BREADCRUMB — Virtual Player membership seam.
 *
 * WAS: Scout existed only when current capability/readiness existed. It was injected into
 * the capability snapshot and drawn as a synthetic Team card, so a temporary provider limit
 * or an empty depth chart could erase the logical Player from the Team, and any
 * unacknowledged report with it. Membership and readiness were one boolean.
 *
 * IS: Scout is a roster-native Virtual Player. Human membership (recruited, On Field or
 * Bench, removed) is durable and Game-specific, kept in the workspace's own state. Readiness
 * is derived from the shared Scout depth chart on every snapshot and is never persisted.
 * A member that cannot run right now stays on the Team as "unavailable"; only the human can
 * bench or remove it.
 *
 * WHY: belonging to the Team is a human decision. Temporary provider availability is not
 * authority to remove a Player.
 *
 * WILL BE: future orchestrated, API-backed or service Players reuse this membership/readiness
 * separation by implementing `VirtualPlayer`, and Adaptive Coaching can reason about
 * availability without ever rewriting a human roster choice.
 *
 * Three concepts, kept apart on purpose:
 *   ENTITLEMENT  is the Player offered at all?           -> `entitled()`, e.g. coach.scout.enabled
 *   MEMBERSHIP   did the human recruit it to THIS Game?  -> `VirtualMembershipStore`, persisted
 *   READINESS    can it execute a Play right now?        -> `readiness()`, derived, never stored
 *
 * Virtual Players deliberately have no terminal, PID, executable path or controlled-process
 * binding, so they never enter `PlayerInstanceBook` (which owns process seat guarantees).
 *
 * No `vscode` import: the memento is injected so the contract is unit-testable.
 */
import type { PlayerRoutingCapability } from './capability-types';

/** Player types that are orchestrated rather than process-backed. Not part of `PlayerId`. */
export type VirtualPlayerType = 'scout';

export interface VirtualPlayerReadiness {
  readonly state: 'ready' | 'busy' | 'unavailable';
  /** Short human phrase shown beside the Player, e.g. "Ready" or "No Scouts ready yet". */
  readonly label: string;
}

export interface VirtualTurnResult {
  readonly outcome: 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNKNOWN';
}

/** The smallest earned contract. `ScoutPlayerAdapter` already implements it. */
export interface VirtualPlayer {
  readonly instanceId: string;
  readonly playerType: VirtualPlayerType;
  readonly displayName: string;
  readonly executionType: NonNullable<PlayerRoutingCapability['executionType']>;
  /** Is this Player offered at all (product entitlement)? Independent of membership. */
  entitled(): boolean;
  /** Current readiness for one Game. Recomputed on every call; never persisted. */
  readiness(gameRoot: string): VirtualPlayerReadiness;
  /** The executable routing capability, or `undefined` when it cannot run a Play right now. */
  capability(gameRoot: string): PlayerRoutingCapability | undefined;
  /** Runs one logical turn. May fan out to N workers internally. */
  execute(objective: string, gameRoot: string, options?: object): Promise<VirtualTurnResult>;
}

/**
 * What routing sees for a MEMBER that is On Field but cannot run. It is present, so the Player
 * stays visible and truthful, but it is `unavailable` in every dimension routing checks
 * (state, freshness, AUTO eligibility), so nothing can be dispatched into a dead route.
 */
export function unavailableVirtualCapability(player: VirtualPlayer, readiness: VirtualPlayerReadiness, now = Date.now()): PlayerRoutingCapability {
  return {
    instanceId: player.instanceId,
    playerType: player.playerType,
    transport: 'controlled',
    // Shown in MANUAL's Player list next to the name, so Dad reads why it cannot run.
    transportLabel: readiness.label,
    fieldLabel: player.displayName,
    state: 'unavailable',
    capability: { provider: player.playerType, authenticated: true, models: [], observedAt: now, freshness: 'unavailable' },
    executionType: player.executionType,
    autoEligible: false,
    supportsQueue: false
  };
}

// --- Membership -----------------------------------------------------------------------------------

export const VIRTUAL_MEMBERSHIP_KEY = 'sidelineCoach.virtualMembership.v1';

/** The subset of `vscode.Memento` this needs. `workspaceState` is per Game, so membership is too. */
export interface MembershipMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface VirtualMember {
  readonly playerType: VirtualPlayerType;
  readonly onField: boolean;
  readonly recruitedAt: string;
}

interface StoredMembership {
  readonly version: 1;
  /** True once the one-time compatibility check has run for this Game. */
  readonly compatibilityChecked: boolean;
  readonly members: Readonly<Record<string, VirtualMember>>;
}

const EMPTY: StoredMembership = { version: 1, compatibilityChecked: false, members: {} };

/**
 * The one durable owner of virtual membership for a Game. It stores WHO is on the Team and
 * whether they are On Field. It never stores readiness, provider health, depth-chart
 * selection or receiver availability: those are recomputed.
 */
export class VirtualMembershipStore {
  constructor(private readonly memento: MembershipMemento, private readonly now: () => Date = () => new Date()) {}

  private read(): StoredMembership {
    const raw = this.memento.get<StoredMembership>(VIRTUAL_MEMBERSHIP_KEY);
    if (!raw || raw.version !== 1 || typeof raw.members !== 'object' || raw.members === null) return EMPTY;
    const members: Record<string, VirtualMember> = {};
    for (const [id, member] of Object.entries(raw.members)) {
      if (member && member.playerType === 'scout' && typeof member.onField === 'boolean' && typeof member.recruitedAt === 'string') {
        members[id] = { playerType: member.playerType, onField: member.onField, recruitedAt: member.recruitedAt };
      }
    }
    return { version: 1, compatibilityChecked: raw.compatibilityChecked === true, members };
  }

  private async write(next: StoredMembership): Promise<void> {
    await this.memento.update(VIRTUAL_MEMBERSHIP_KEY, next);
  }

  get(instanceId: string): VirtualMember | undefined { return this.read().members[instanceId]; }
  list(): readonly (VirtualMember & { readonly instanceId: string })[] {
    return Object.entries(this.read().members).map(([instanceId, member]) => ({ instanceId, ...member }));
  }
  compatibilityChecked(): boolean { return this.read().compatibilityChecked; }

  async recruit(instanceId: string, playerType: VirtualPlayerType): Promise<void> {
    const current = this.read();
    await this.write({ ...current, members: { ...current.members, [instanceId]: { playerType, onField: true, recruitedAt: this.now().toISOString() } } });
  }

  async setOnField(instanceId: string, onField: boolean): Promise<boolean> {
    const current = this.read();
    const member = current.members[instanceId];
    if (!member) return false;
    await this.write({ ...current, members: { ...current.members, [instanceId]: { ...member, onField } } });
    return true;
  }

  /** Removes membership and nothing else. */
  async remove(instanceId: string): Promise<boolean> {
    const current = this.read();
    if (!current.members[instanceId]) return false;
    const { [instanceId]: _removed, ...rest } = current.members;
    await this.write({ ...current, members: rest });
    return true;
  }

  async markCompatibilityChecked(): Promise<void> {
    const current = this.read();
    await this.write({ ...current, compatibilityChecked: true });
  }
}
