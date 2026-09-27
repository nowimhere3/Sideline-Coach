import { capabilityDefinition, type CapabilityId, type MeterKind } from './capabilities';

/**
 * S57.2 §3 — grants are DATA. A plan, a trial, a promotion and a manual override all
 * arrive as CapabilityGrant[]; feature code never sees them, only gate decisions.
 */

export type Period =
  | { readonly kind: 'lifetime' }
  | { readonly kind: 'daily' }
  /** `calendar` = local calendar month; a number = billing-cycle anchor (epoch ms, cycles in UTC). */
  | { readonly kind: 'monthly'; readonly anchor: 'calendar' | number }
  | { readonly kind: 'rolling'; readonly days: number };

export type Allowance =
  | { readonly kind: 'unlimited' }
  | { readonly kind: 'quota'; readonly limit: number; readonly period: Period }
  | { readonly kind: 'ceiling'; readonly limit: number }
  | { readonly kind: 'enabled' };

export type GrantSource = 'profile' | 'license' | 'promo' | 'override';

export interface CapabilityGrant {
  /** Stable; usage buckets are keyed by it. */
  readonly grantId: string;
  readonly capability: CapabilityId;
  readonly allowance: Allowance;
  readonly validFrom?: number;
  readonly validUntil?: number;
  /** Duration meters only: soft stop after exhaustion (used from C4). */
  readonly graceMinutes?: number;
  readonly source: GrantSource;
}

/** Which allowance kinds make sense for each meter kind. Anything else is ignored as invalid. */
const COMPATIBLE: Readonly<Record<MeterKind, readonly Allowance['kind'][]>> = {
  flag: ['unlimited', 'enabled'],
  count: ['unlimited', 'quota'],
  minutes: ['unlimited', 'quota'],
  ceiling: ['unlimited', 'ceiling']
};

export function isGrantCompatible(grant: CapabilityGrant): boolean {
  const meter = capabilityDefinition(grant.capability).meter;
  if (!COMPATIBLE[meter].includes(grant.allowance.kind)) return false;
  const allowance = grant.allowance;
  if (allowance.kind === 'quota' || allowance.kind === 'ceiling') {
    if (!Number.isInteger(allowance.limit) || allowance.limit < 0) return false;
  }
  if (allowance.kind === 'quota' && allowance.period.kind === 'rolling') {
    if (!Number.isInteger(allowance.period.days) || allowance.period.days < 1 || allowance.period.days > 366) return false;
  }
  if (allowance.kind === 'quota' && allowance.period.kind === 'monthly' && allowance.period.anchor !== 'calendar') {
    if (!Number.isFinite(allowance.period.anchor)) return false;
  }
  return true;
}

export function isGrantActive(grant: CapabilityGrant, now: number): boolean {
  if (grant.validFrom !== undefined && now < grant.validFrom) return false;
  if (grant.validUntil !== undefined && now >= grant.validUntil) return false;
  return true;
}
