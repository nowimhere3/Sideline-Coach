import { CAPABILITY_CATALOGUE, CAPABILITY_IDS, capabilityDefinition, type CapabilityId, type CapabilityUnit } from './capabilities';
import type { CapabilityGrant } from './grants';
import type { LicenseSource, LicenseState, LicenseStatus } from './license';
import { effectiveGrants, emptyUsageState, usageFor } from './meters';
import { systemLocalOffset, type LocalOffset } from './periods';
import { builtInProfile, DEFAULT_PROFILE, type BuiltInProfileId, type EntitlementProfile } from './profiles';
import type { UsageReader } from './usage-store';

/**
 * S57.2 §3/§4/§12 — the single local entitlement authority.
 *
 *   signed license (C6: verified, bound to this install, unexpired)
 *     otherwise → built-in profile (DEFAULT_PROFILE = unlimited)
 *   → grants → EntitlementSnapshot
 *
 * Read-only: it projects the snapshot from the active profile, the clock and (when a
 * usage store is attached) recorded usage. No network, backend or account.
 */

export interface CapabilityState {
  readonly entitled: boolean;
  readonly unlimited: boolean;
  readonly limit?: number;
  readonly used?: number;
  readonly remaining?: number;
  /** Next period boundary, when the allowance has one. */
  readonly resetsAt?: number;
  readonly unit?: CapabilityUnit;
  /** Defined for packaging only; no product code gates on it yet. */
  readonly reserved?: true;
}

/**
 * valid             built-in profile, or a license before its refresh point
 * grace             license past refreshAfter (or clock rollback suspected), still in force
 * expired-fallback  license expired → built-in profile
 * invalid-fallback  license present but untrusted → built-in profile
 */
export type EntitlementValidity = 'valid' | 'grace' | 'expired-fallback' | 'invalid-fallback';

export interface EntitlementSnapshot {
  readonly v: 1;
  /** Display only, e.g. "Full access". Never branched on. */
  readonly profileLabel: string;
  readonly authority: 'built-in' | 'signed-license';
  readonly validity: EntitlementValidity;
  /** Symbolic license state only: never ids, keys, signatures or grants. */
  readonly license: { readonly state: LicenseState; readonly reason?: string; readonly rollbackSuspected?: true };
  readonly computedAt: number;
  readonly capabilities: Readonly<Record<CapabilityId, CapabilityState>>;
}

export interface EntitlementAuthorityOptions {
  /** Built-in fallback profile (production: DEFAULT_PROFILE). */
  readonly profile?: BuiltInProfileId | EntitlementProfile;
  /** C6: signed license source. Absent = built-in only. */
  readonly license?: LicenseSource;
  readonly usage?: UsageReader;
  readonly now?: () => number;
  readonly localOffset?: LocalOffset;
}

export interface ActiveEntitlement {
  readonly profile: EntitlementProfile;
  readonly authority: EntitlementSnapshot['authority'];
  readonly validity: EntitlementValidity;
  readonly license: LicenseStatus;
}

export class EntitlementAuthority {
  /** The built-in profile used whenever no license is in force. */
  readonly fallbackProfile: EntitlementProfile;
  private readonly license: LicenseSource | undefined;
  private readonly usage: UsageReader | undefined;
  private readonly now: () => number;
  private readonly localOffset: LocalOffset;

  constructor(options: EntitlementAuthorityOptions = {}) {
    const profile = options.profile ?? DEFAULT_PROFILE;
    this.fallbackProfile = typeof profile === 'string' ? builtInProfile(profile) : profile;
    this.license = options.license;
    this.usage = options.usage;
    this.now = options.now ?? Date.now;
    this.localOffset = options.localOffset ?? systemLocalOffset;
  }

  get clock(): () => number {
    return this.now;
  }

  get offset(): LocalOffset {
    return this.localOffset;
  }

  /** Which grants are in force at `now`, and why. */
  active(now = this.now()): ActiveEntitlement {
    const evaluation = this.license?.current(now) ?? { status: { state: 'none' as const } };
    const license = evaluation.status;
    if (evaluation.profile) {
      return { profile: evaluation.profile, authority: 'signed-license', validity: license.state === 'valid' ? 'valid' : 'grace', license };
    }
    const validity: EntitlementValidity = license.state === 'expired' ? 'expired-fallback' : license.state === 'invalid' ? 'invalid-fallback' : 'valid';
    return { profile: this.fallbackProfile, authority: 'built-in', validity, license };
  }

  /**
   * Grants in effect for a capability at `now`: its own active, meter-compatible grants,
   * or — for a facet with none of its own — its parent's.
   */
  grantsFor(capability: CapabilityId, now = this.now(), profile: EntitlementProfile = this.active(now).profile): CapabilityGrant[] {
    const own = effectiveGrants(profile.grants.filter((grant) => grant.capability === capability), now);
    if (own.length > 0) return own;
    const parent = capabilityDefinition(capability).parent;
    return parent ? this.grantsFor(parent, now, profile) : [];
  }

  capabilityState(capability: CapabilityId, now = this.now(), profile: EntitlementProfile = this.active(now).profile): CapabilityState {
    const definition = capabilityDefinition(capability);
    const grants = this.grantsFor(capability, now, profile);
    // A facet that inherits its parent's grant also shares the parent's meter standing.
    const owner = grants[0]?.capability ?? capability;
    const meter = capabilityDefinition(owner).meter;
    const standing = usageFor(this.usage?.state ?? emptyUsageState(), owner, meter, grants, now, this.localOffset);
    return {
      entitled: standing.entitled,
      unlimited: standing.unlimited,
      ...(standing.limit !== undefined ? { limit: standing.limit } : {}),
      ...(standing.used !== undefined ? { used: standing.used } : {}),
      ...(standing.remaining !== undefined ? { remaining: standing.remaining } : {}),
      ...(standing.resetsAt !== undefined ? { resetsAt: standing.resetsAt } : {}),
      ...(definition.unit ? { unit: definition.unit } : {}),
      ...(definition.reserved ? { reserved: true as const } : {})
    };
  }

  /** Largest grace (minutes) declared by any in-force grant of a capability, if any. */
  graceMinutes(capability: CapabilityId, now = this.now()): number | undefined {
    const values = this.grantsFor(capability, now).map((grant) => grant.graceMinutes).filter((value): value is number => value !== undefined);
    return values.length ? Math.max(...values) : undefined;
  }

  snapshot(now = this.now()): EntitlementSnapshot {
    const active = this.active(now);
    const capabilities = {} as Record<CapabilityId, CapabilityState>;
    for (const id of CAPABILITY_IDS) capabilities[id] = this.capabilityState(id, now, active.profile);
    return {
      v: 1,
      profileLabel: active.profile.label,
      authority: active.authority,
      validity: active.validity,
      license: {
        state: active.license.state,
        ...(active.license.reason ? { reason: active.license.reason } : {}),
        ...(active.license.rollbackSuspected ? { rollbackSuspected: true as const } : {})
      },
      computedAt: now,
      capabilities
    };
  }
}

/** Test guard helper: capabilities a profile leaves without any grant. */
export function capabilitiesWithoutGrant(profile: EntitlementProfile): CapabilityId[] {
  const granted = new Set(profile.grants.map((grant) => grant.capability));
  return [...CAPABILITY_CATALOGUE.keys()].filter((id) => !granted.has(id));
}
