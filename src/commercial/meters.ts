import type { CapabilityId } from './capabilities';
import { isGrantActive, isGrantCompatible, type CapabilityGrant } from './grants';
import { countedKeys, periodEnd, periodKey, systemLocalOffset, type LocalOffset } from './periods';

/**
 * S57.2 §6 — pure usage accounting.
 *
 * Usage state is a deterministic FOLD of UsageReceipts: the persisted state is only a
 * fast path, and replaying the journal rebuilds it exactly. Every operation here is pure:
 * it reads a state, and returns the receipts it would append. The store assigns sequence
 * numbers, journals them and folds them in.
 *
 * Meters:
 *   count    idempotency key per consumption (e.g. `scout.play:<clientRef>`); release refunds it
 *   minutes  a set of minute indices per capability; a minute is charged at most once, ever
 *   ceiling  a set of member ids (e.g. admitted gameIds); used = set size
 *
 * Multiple grants: `unlimited` dominates; otherwise consumption draws from the grant whose
 * capacity expires soonest (validUntil or period end), ties broken by grantId.
 */

export const USAGE_STATE_VERSION = 1;
/** Recent count idempotency keys retained per capability (S57.2 §6.1). */
export const MAX_IDEMPOTENCY_KEYS = 500;
/** Longest minute range one call may charge (a day). */
export const MAX_MINUTE_RANGE = 24 * 60;
const MINUTE_MS = 60_000;
const UNLIMITED_PERIOD = 'lifetime';

export type ReceiptMeter = 'count' | 'minutes' | 'ceiling';

export interface UsageReceipt {
  readonly seq: number;
  /** Idempotency key: count key, `m<first>-<last>` for minutes, member id for ceilings. */
  readonly id: string;
  readonly capability: CapabilityId;
  readonly meter: ReceiptMeter;
  /** Grant charged ('' for ceilings, whose limit is shared across grants). */
  readonly grantId: string;
  readonly periodKey: string;
  /** +n consume, −n release/refund. */
  readonly units: number;
  readonly at: number;
  /** Minutes meter: inclusive minute-index range. */
  readonly minutes?: readonly [number, number];
}

export type PendingReceipt = Omit<UsageReceipt, 'seq'>;

interface Allocation { readonly grantId: string; readonly periodKey: string; readonly units: number }

interface KeyEntry { allocations: Allocation[]; at: number; released?: true }

interface Bucket { used: number; lastAt: number }

export interface UsageState {
  v: typeof USAGE_STATE_VERSION;
  /** Sequence number of the last receipt folded in. */
  seq: number;
  /** capability → grantId → periodKey → bucket */
  buckets: Record<string, Record<string, Record<string, Bucket>>>;
  /** capability → 'k:'+key → entry (bounded, insertion ordered) */
  keys: Record<string, Record<string, KeyEntry>>;
  /** capability → sorted, merged, inclusive minute-index intervals */
  minuteSets: Record<string, Array<[number, number]>>;
  /** capability → 'm:'+member → admittedAt */
  members: Record<string, Record<string, number>>;
}

export function emptyUsageState(): UsageState {
  return { v: USAGE_STATE_VERSION, seq: 0, buckets: {}, keys: {}, minuteSets: {}, members: {} };
}

const keySlot = (key: string): string => `k:${key}`;
const memberSlot = (member: string): string => `m:${member}`;

// ── Fold ────────────────────────────────────────────────────────────────────

/** Applies one receipt in place. Receipts at or below `state.seq` are ignored (replay safety). */
export function applyReceipt(state: UsageState, receipt: UsageReceipt): void {
  if (!Number.isInteger(receipt.seq) || receipt.seq <= state.seq) return;
  state.seq = receipt.seq;
  const cap = receipt.capability;

  if (receipt.meter === 'ceiling') {
    const members = (state.members[cap] ??= {});
    if (receipt.units > 0) members[memberSlot(receipt.id)] = receipt.at;
    else delete members[memberSlot(receipt.id)];
    return;
  }

  const byGrant = ((state.buckets[cap] ??= {})[receipt.grantId] ??= {});
  const bucket = (byGrant[receipt.periodKey] ??= { used: 0, lastAt: receipt.at });
  bucket.used = Math.max(0, bucket.used + receipt.units);
  bucket.lastAt = Math.max(bucket.lastAt, receipt.at);

  if (receipt.meter === 'minutes') {
    if (receipt.minutes && receipt.units > 0) addMinuteRange(state, cap, receipt.minutes[0], receipt.minutes[1]);
    return;
  }

  const keys = (state.keys[cap] ??= {});
  const slot = keySlot(receipt.id);
  let entry = keys[slot];
  if (receipt.units > 0) {
    if (!entry || entry.released) {
      if (entry) delete keys[slot];
      entry = { allocations: [], at: receipt.at };
      keys[slot] = entry;
      trimKeys(keys);
    }
    entry.allocations.push({ grantId: receipt.grantId, periodKey: receipt.periodKey, units: receipt.units });
  } else if (entry) {
    entry.released = true;
  }
}

export function foldReceipts(receipts: Iterable<UsageReceipt>, initial: UsageState = emptyUsageState()): UsageState {
  const state = cloneUsageState(initial);
  for (const receipt of [...receipts].sort((a, b) => a.seq - b.seq)) applyReceipt(state, receipt);
  return state;
}

export function cloneUsageState(state: UsageState): UsageState {
  return JSON.parse(JSON.stringify(state)) as UsageState;
}

function trimKeys(keys: Record<string, KeyEntry>): void {
  const slots = Object.keys(keys);
  for (let index = 0; index < slots.length - MAX_IDEMPOTENCY_KEYS; index++) delete keys[slots[index]];
}

function addMinuteRange(state: UsageState, cap: string, first: number, last: number): void {
  const intervals = [...(state.minuteSets[cap] ?? []), [first, last] as [number, number]].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1] + 1) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  state.minuteSets[cap] = merged;
}

export function minuteCharged(state: UsageState, cap: CapabilityId, minute: number): boolean {
  return (state.minuteSets[cap] ?? []).some(([start, end]) => minute >= start && minute <= end);
}

/** Drops buckets, minute intervals and released keys untouched for `retainMs` (default 400 days). */
export function pruneUsageState(state: UsageState, now: number, retainMs = 400 * 86_400_000): void {
  const cutoff = now - retainMs;
  for (const byGrant of Object.values(state.buckets)) {
    for (const [grantId, byPeriod] of Object.entries(byGrant)) {
      for (const [key, bucket] of Object.entries(byPeriod)) if (key !== UNLIMITED_PERIOD && bucket.lastAt < cutoff) delete byPeriod[key];
      if (Object.keys(byPeriod).length === 0) delete byGrant[grantId];
    }
  }
  const cutoffMinute = Math.floor(cutoff / MINUTE_MS);
  for (const [cap, intervals] of Object.entries(state.minuteSets)) state.minuteSets[cap] = intervals.filter(([, end]) => end >= cutoffMinute);
}

// ── Grants in effect ────────────────────────────────────────────────────────

interface QuotaStanding {
  readonly grant: CapabilityGrant;
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly chargeKey: string;
  readonly expiresAt: number;
  readonly resetsAt?: number;
}

/** Only active, meter-compatible grants participate. */
export function effectiveGrants(grants: readonly CapabilityGrant[], now: number): CapabilityGrant[] {
  return grants.filter((grant) => isGrantActive(grant, now) && isGrantCompatible(grant));
}

function bucketUsed(state: UsageState, cap: string, grantId: string, keys: readonly string[]): number {
  const byPeriod = state.buckets[cap]?.[grantId] ?? {};
  return keys.reduce((sum, key) => sum + (byPeriod[key]?.used ?? 0), 0);
}

/** Quota grants ordered expiring-first, with their standing at `now`. */
function quotaStandings(state: UsageState, cap: CapabilityId, grants: readonly CapabilityGrant[], now: number, offset: LocalOffset): QuotaStanding[] {
  const standings: QuotaStanding[] = [];
  for (const grant of grants) {
    if (grant.allowance.kind !== 'quota') continue;
    const period = grant.allowance.period;
    const used = bucketUsed(state, cap, grant.grantId, countedKeys(period, now, offset));
    const resetsAt = periodEnd(period, now, offset);
    const expiresAt = Math.min(grant.validUntil ?? Number.POSITIVE_INFINITY, resetsAt ?? Number.POSITIVE_INFINITY);
    standings.push({
      grant,
      limit: grant.allowance.limit,
      used,
      remaining: Math.max(0, grant.allowance.limit - used),
      chargeKey: periodKey(period, now, offset),
      expiresAt,
      ...(resetsAt !== undefined ? { resetsAt } : {})
    });
  }
  return standings.sort((a, b) => a.expiresAt - b.expiresAt || (a.grant.grantId < b.grant.grantId ? -1 : a.grant.grantId > b.grant.grantId ? 1 : 0));
}

function firstUnlimited(grants: readonly CapabilityGrant[]): CapabilityGrant | undefined {
  return [...grants].sort((a, b) => (a.grantId < b.grantId ? -1 : 1)).find((grant) => grant.allowance.kind === 'unlimited');
}

// ── Standing (read) ─────────────────────────────────────────────────────────

export interface CapabilityUsage {
  readonly entitled: boolean;
  readonly unlimited: boolean;
  readonly limit?: number;
  readonly used?: number;
  readonly remaining?: number;
  readonly resetsAt?: number;
}

/** Aggregated standing across all effective grants for one capability. */
export function usageFor(
  state: UsageState,
  cap: CapabilityId,
  meter: 'flag' | ReceiptMeter,
  grants: readonly CapabilityGrant[],
  now: number,
  offset: LocalOffset = systemLocalOffset
): CapabilityUsage {
  const effective = effectiveGrants(grants, now);
  if (effective.length === 0) return { entitled: false, unlimited: false };
  if (firstUnlimited(effective)) return { entitled: true, unlimited: true };
  if (meter === 'flag') return { entitled: true, unlimited: false };
  if (meter === 'ceiling') {
    const limit = effective.reduce((sum, grant) => sum + (grant.allowance.kind === 'ceiling' ? grant.allowance.limit : 0), 0);
    const used = Object.keys(state.members[cap] ?? {}).length;
    return { entitled: true, unlimited: false, limit, used, remaining: Math.max(0, limit - used) };
  }
  const standings = quotaStandings(state, cap, effective, now, offset);
  const resets = standings.map((standing) => standing.resetsAt).filter((value): value is number => value !== undefined);
  return {
    entitled: true,
    unlimited: false,
    limit: standings.reduce((sum, standing) => sum + standing.limit, 0),
    used: standings.reduce((sum, standing) => sum + standing.used, 0),
    remaining: standings.reduce((sum, standing) => sum + standing.remaining, 0),
    ...(resets.length ? { resetsAt: Math.min(...resets) } : {})
  };
}

export function isMember(state: UsageState, cap: CapabilityId, member: string): boolean {
  return Object.prototype.hasOwnProperty.call(state.members[cap] ?? {}, memberSlot(member));
}

// ── Operations (return receipts; never mutate) ─────────────────────────────

export type ChargeOutcome = 'charged' | 'duplicate' | 'exhausted' | 'not-entitled';

export interface ChargePlan {
  readonly outcome: ChargeOutcome;
  readonly receipts: readonly PendingReceipt[];
}

export function planCountCharge(
  state: UsageState,
  cap: CapabilityId,
  key: string,
  units: number,
  grants: readonly CapabilityGrant[],
  now: number,
  offset: LocalOffset = systemLocalOffset
): ChargePlan {
  if (!Number.isInteger(units) || units < 1) throw new Error('Usage units must be a positive integer.');
  const existing = state.keys[cap]?.[keySlot(key)];
  if (existing && !existing.released) return { outcome: 'duplicate', receipts: [] };
  const effective = effectiveGrants(grants, now);
  if (effective.length === 0) return { outcome: 'not-entitled', receipts: [] };
  const unlimited = firstUnlimited(effective);
  if (unlimited) {
    // Recorded even when unlimited: real usage is what later packaging is built from.
    return { outcome: 'charged', receipts: [{ id: key, capability: cap, meter: 'count', grantId: unlimited.grantId, periodKey: UNLIMITED_PERIOD, units, at: now }] };
  }
  const standings = quotaStandings(state, cap, effective, now, offset);
  if (standings.reduce((sum, standing) => sum + standing.remaining, 0) < units) return { outcome: 'exhausted', receipts: [] };
  const receipts: PendingReceipt[] = [];
  let needed = units;
  for (const standing of standings) {
    if (needed === 0) break;
    const take = Math.min(needed, standing.remaining);
    if (take === 0) continue;
    receipts.push({ id: key, capability: cap, meter: 'count', grantId: standing.grant.grantId, periodKey: standing.chargeKey, units: take, at: now });
    needed -= take;
  }
  return { outcome: 'charged', receipts };
}

export function planCountRelease(state: UsageState, cap: CapabilityId, key: string, now: number): readonly PendingReceipt[] {
  const entry = state.keys[cap]?.[keySlot(key)];
  if (!entry || entry.released) return [];
  return entry.allocations.map((allocation) => ({
    id: key, capability: cap, meter: 'count' as const, grantId: allocation.grantId, periodKey: allocation.periodKey, units: -allocation.units, at: now
  }));
}

export interface MinutePlan {
  readonly charged: number;
  readonly duplicate: number;
  readonly exhausted: number;
  readonly receipts: readonly PendingReceipt[];
}

/** Charges each not-yet-charged minute in [firstMinute, lastMinute] (minute = floor(ms / 60 000)). */
export function planMinuteCharge(
  state: UsageState,
  cap: CapabilityId,
  firstMinute: number,
  lastMinute: number,
  grants: readonly CapabilityGrant[],
  now: number,
  offset: LocalOffset = systemLocalOffset
): MinutePlan {
  if (!Number.isInteger(firstMinute) || !Number.isInteger(lastMinute) || lastMinute < firstMinute) throw new Error('Invalid minute range.');
  if (lastMinute - firstMinute + 1 > MAX_MINUTE_RANGE) throw new Error('Minute range is too long.');
  const tally = new Map<string, number>();
  const assignments: Array<{ minute: number; grantId: string; periodKey: string }> = [];
  let duplicate = 0;
  let exhausted = 0;
  for (let minute = firstMinute; minute <= lastMinute; minute++) {
    if (minuteCharged(state, cap, minute)) { duplicate++; continue; }
    const at = minute * MINUTE_MS;
    const effective = effectiveGrants(grants, at);
    const unlimited = firstUnlimited(effective);
    if (unlimited) { assignments.push({ minute, grantId: unlimited.grantId, periodKey: UNLIMITED_PERIOD }); continue; }
    const standing = quotaStandings(state, cap, effective, at, offset).find((candidate) => {
      const extra = countedKeys(candidate.grant.allowance.kind === 'quota' ? candidate.grant.allowance.period : { kind: 'lifetime' }, at, offset)
        .reduce((sum, key) => sum + (tally.get(`${candidate.grant.grantId}|${key}`) ?? 0), 0);
      return candidate.remaining - extra > 0;
    });
    if (!standing) { exhausted++; continue; }
    const tallyKey = `${standing.grant.grantId}|${standing.chargeKey}`;
    tally.set(tallyKey, (tally.get(tallyKey) ?? 0) + 1);
    assignments.push({ minute, grantId: standing.grant.grantId, periodKey: standing.chargeKey });
  }
  // One receipt per contiguous run charged to the same grant and period.
  const receipts: PendingReceipt[] = [];
  for (const assignment of assignments) {
    const previous = receipts[receipts.length - 1] as (PendingReceipt & { minutes: [number, number] }) | undefined;
    if (previous && previous.grantId === assignment.grantId && previous.periodKey === assignment.periodKey && previous.minutes[1] === assignment.minute - 1) {
      receipts[receipts.length - 1] = { ...previous, id: `m${previous.minutes[0]}-${assignment.minute}`, units: previous.units + 1, minutes: [previous.minutes[0], assignment.minute] };
    } else {
      receipts.push({ id: `m${assignment.minute}-${assignment.minute}`, capability: cap, meter: 'minutes', grantId: assignment.grantId, periodKey: assignment.periodKey, units: 1, at: now, minutes: [assignment.minute, assignment.minute] });
    }
  }
  return { charged: assignments.length, duplicate, exhausted, receipts };
}

export type AdmitOutcome = 'member' | 'admitted' | 'ceiling-reached' | 'not-entitled';

export function planAdmit(
  state: UsageState,
  cap: CapabilityId,
  member: string,
  grants: readonly CapabilityGrant[],
  now: number
): { readonly outcome: AdmitOutcome; readonly receipts: readonly PendingReceipt[] } {
  if (isMember(state, cap, member)) return { outcome: 'member', receipts: [] };
  const standing = usageFor(state, cap, 'ceiling', grants, now);
  if (!standing.entitled) return { outcome: 'not-entitled', receipts: [] };
  if (!standing.unlimited && (standing.remaining ?? 0) < 1) return { outcome: 'ceiling-reached', receipts: [] };
  return { outcome: 'admitted', receipts: [{ id: member, capability: cap, meter: 'ceiling', grantId: '', periodKey: UNLIMITED_PERIOD, units: 1, at: now }] };
}

/**
 * S57.2 §8.3 grandfathering: records existing members regardless of the ceiling (a downgrade
 * never locks an already-used Game). Idempotent; members already present are skipped.
 */
export function planGrandfather(state: UsageState, cap: CapabilityId, members: readonly string[], now: number): readonly PendingReceipt[] {
  const unique = [...new Set(members)].filter((member) => !isMember(state, cap, member));
  return unique.map((member) => ({ id: member, capability: cap, meter: 'ceiling' as const, grantId: '', periodKey: UNLIMITED_PERIOD, units: 1, at: now }));
}

/** True once any ceiling receipt was ever folded for this capability (a first-activation marker). */
export function ceilingEverUsed(state: UsageState, cap: CapabilityId): boolean {
  return Object.prototype.hasOwnProperty.call(state.members, cap);
}

export function planRemoveMember(state: UsageState, cap: CapabilityId, member: string, now: number): readonly PendingReceipt[] {
  if (!isMember(state, cap, member)) return [];
  return [{ id: member, capability: cap, meter: 'ceiling', grantId: '', periodKey: UNLIMITED_PERIOD, units: -1, at: now }];
}
