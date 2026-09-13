import * as crypto from 'node:crypto';
import { getPlayerAdapter, type PlayerId, type PlayerOwnership } from './player-adapters';

export interface PlayerRoutingLabel { model?: string; effort?: string; }
export interface PlayerInstanceProjection {
  instanceId: string;
  playerType: PlayerId;
  seat: number;
  fieldLabel: string;
  /** Governs what Coach is allowed to destroy. Never inferred from a name. */
  ownership: PlayerOwnership;
  /** False means benched: the instance is retained and returnable, not removed. */
  onField: boolean;
}
export interface PlayerInstanceRecord {
  instanceId: string;
  playerType: PlayerId;
  seat: number;
  routing?: PlayerRoutingLabel;
  ownership: PlayerOwnership;
  onField: boolean;
}
export interface PlayerProvenance { instanceId: string; playerType: PlayerId; seat: number; shellPid: number; shellStartedAt: string; }
export interface ProcessIdentity { exists: boolean; startedAt?: string; }

export function fieldLabel(baseName: string, seat: number, routing?: PlayerRoutingLabel): string {
  const label = seat === 1 ? baseName : `${baseName} ${seat}`;
  const details = [routing?.model, routing?.effort].filter((value): value is string => Boolean(value));
  return details.length ? `${label} · ${details.join(' · ')}` : label;
}

export function isPlayerProvenance(value: unknown): value is PlayerProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 5
    && typeof record.instanceId === 'string'
    && /^(claude|codex|antigravity|terminal)-[0-9a-f]{8}$/.test(record.instanceId)
    && record.playerType === record.instanceId.slice(0, record.instanceId.indexOf('-'))
    && Number.isSafeInteger(record.seat) && (record.seat as number) > 0
    && Number.isSafeInteger(record.shellPid) && (record.shellPid as number) > 0
    && typeof record.shellStartedAt === 'string' && !Number.isNaN(Date.parse(record.shellStartedAt));
}

export type PendingDecision =
  | { kind: 'adopt'; record: PlayerProvenance }
  | { kind: 'pending' }
  | { kind: 'dead'; records: PlayerProvenance[] }
  | { kind: 'contradiction'; records: PlayerProvenance[] }
  | { kind: 'none' };

/** Pure proof rule: names and terminal markers are intentionally absent. */
export function decidePendingMatch(records: readonly PlayerProvenance[], pid: number | undefined, identity: ProcessIdentity | undefined): PendingDecision {
  if (!pid) return { kind: 'none' };
  const claims = records.filter((record) => record.shellPid === pid);
  if (!claims.length) return { kind: 'none' };
  if (claims.length > 1) return { kind: 'contradiction', records: claims };
  if (!identity || !identity.exists) return { kind: 'dead', records: claims };
  if (!identity.startedAt) return { kind: 'pending' };
  return identity.startedAt === claims[0].shellStartedAt
    ? { kind: 'adopt', record: claims[0] }
    : { kind: 'dead', records: claims };
}

/** Pure instance/seat state. PlayerRoster owns live terminal correlation and persistence. */
export class PlayerInstanceBook {
  private readonly records = new Map<string, PlayerInstanceRecord>();
  private readonly pending = new Map<string, PlayerProvenance>();
  private readonly highWater = new Map<PlayerId, number>();

  allocate(playerType: PlayerId, ownership: PlayerOwnership = 'coach-managed'): PlayerInstanceRecord {
    const seat = this.nextSeat(playerType);
    const record: PlayerInstanceRecord = { instanceId: this.mintId(playerType), playerType, seat, ownership, onField: true };
    this.records.set(record.instanceId, record);
    this.highWater.set(playerType, seat);
    return record;
  }

  adopt(instanceId: string, playerType: PlayerId, seat: number, ownership: PlayerOwnership = 'coach-managed'): PlayerInstanceRecord | undefined {
    const pending = this.pending.get(instanceId);
    const ownPendingSeat = pending?.playerType === playerType && pending.seat === seat;
    if (this.records.has(instanceId) || !Number.isSafeInteger(seat) || seat < 1 || (this.hasSeat(playerType, seat) && !ownPendingSeat)) return undefined;
    const record: PlayerInstanceRecord = { instanceId, playerType, seat, ownership, onField: true };
    this.pending.delete(instanceId);
    this.records.set(instanceId, record);
    this.highWater.set(playerType, Math.max(this.highWater.get(playerType) ?? 0, seat));
    return record;
  }

  /** Controlled identity is Sideline-owned and does not require terminal provenance. */
  adoptControlled(instanceId: string, playerType: PlayerId, preferredSeat: number): PlayerInstanceRecord | undefined {
    if (this.records.has(instanceId) || !Number.isSafeInteger(preferredSeat) || preferredSeat < 1) return undefined;
    const seat = this.hasSeat(playerType, preferredSeat) ? this.nextSeat(playerType) : preferredSeat;
    const record: PlayerInstanceRecord = { instanceId, playerType, seat, ownership: 'coach-managed', onField: true };
    this.records.set(instanceId, record);
    this.highWater.set(playerType, Math.max(this.highWater.get(playerType) ?? 0, seat));
    return record;
  }

  reservePending(record: PlayerProvenance): boolean {
    if (!isPlayerProvenance(record) || this.records.has(record.instanceId) || this.pending.has(record.instanceId) || this.hasSeat(record.playerType, record.seat)) return false;
    this.pending.set(record.instanceId, record);
    this.highWater.set(record.playerType, Math.max(this.highWater.get(record.playerType) ?? 0, record.seat));
    return true;
  }

  retire(instanceId: string): PlayerInstanceRecord | undefined {
    const record = this.records.get(instanceId);
    if (!record) return undefined;
    this.records.delete(instanceId);
    this.maybeResetHighWater(record.playerType);
    return record;
  }

  removePending(instanceId: string): PlayerProvenance | undefined {
    const record = this.pending.get(instanceId);
    if (!record) return undefined;
    this.pending.delete(instanceId);
    this.maybeResetHighWater(record.playerType);
    return record;
  }

  get(instanceId: string): PlayerInstanceRecord | undefined { return this.records.get(instanceId); }
  pendingRecord(instanceId: string): PlayerProvenance | undefined { return this.pending.get(instanceId); }
  pendingRecords(): PlayerProvenance[] { return [...this.pending.values()]; }
  byType(playerType: PlayerId): PlayerInstanceRecord[] { return [...this.records.values()].filter((record) => record.playerType === playerType).sort((a, b) => a.seat - b.seat); }
  projections(): PlayerInstanceProjection[] { return [...this.records.values()].sort((a, b) => a.playerType.localeCompare(b.playerType) || a.seat - b.seat).map((record) => this.project(record)); }
  project(record: PlayerInstanceRecord): PlayerInstanceProjection {
    return {
      instanceId: record.instanceId,
      playerType: record.playerType,
      seat: record.seat,
      fieldLabel: fieldLabel(getPlayerAdapter(record.playerType)!.name, record.seat, record.routing),
      ownership: record.ownership,
      onField: record.onField
    };
  }

  /** Bench a Player without ending its instance. Returns false when unknown. */
  setOnField(instanceId: string, onField: boolean): boolean {
    const record = this.records.get(instanceId);
    if (!record) return false;
    record.onField = onField;
    return true;
  }

  onFieldCount(playerType: PlayerId): number {
    return this.byType(playerType).filter((record) => record.onField).length;
  }

  private nextSeat(playerType: PlayerId): number {
    if (!this.hasAny(playerType)) return 1;
    return (this.highWater.get(playerType) ?? this.highestSeat(playerType)) + 1;
  }
  private hasAny(playerType: PlayerId): boolean { return this.byType(playerType).length > 0 || this.pendingRecords().some((record) => record.playerType === playerType); }
  private highestSeat(playerType: PlayerId): number { return Math.max(0, ...this.byType(playerType).map((record) => record.seat), ...this.pendingRecords().filter((record) => record.playerType === playerType).map((record) => record.seat)); }
  private hasSeat(playerType: PlayerId, seat: number): boolean { return this.byType(playerType).some((record) => record.seat === seat) || this.pendingRecords().some((record) => record.playerType === playerType && record.seat === seat); }
  private maybeResetHighWater(playerType: PlayerId): void { if (!this.hasAny(playerType)) this.highWater.delete(playerType); }
  private mintId(playerType: PlayerId): string { let id = ''; do { id = `${playerType}-${crypto.randomBytes(4).toString('hex')}`; } while (this.records.has(id) || this.pending.has(id)); return id; }
}
