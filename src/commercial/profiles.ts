import { CAPABILITY_IDS, type CapabilityId } from './capabilities';
import type { Allowance, CapabilityGrant } from './grants';

/**
 * S57.2 §11 — built-in entitlement profiles. A profile is only a named set of grants.
 *
 * `unlimited` — every capability, no limits. The runtime default: developer builds, Dad,
 *   internal testing and launch customers all resolve here. It is data, not a bypass:
 *   feature code never asks "is this the unlimited/Dad/developer/Founder build?".
 *
 * `core` — an ARCHITECTURE profile for tests and the S57.2 design test "every premium
 *   capability off, Sideline still works". It is NOT a packaging decision: which
 *   capabilities a future free offering includes, and the Game limit, are open
 *   (S57.2 §21 Q2). Here Games and Coach Routines stay usable with no limit because they
 *   are existing everyday behavior; every other capability is absent.
 */

export type BuiltInProfileId = 'unlimited' | 'core';

export const DEFAULT_PROFILE: BuiltInProfileId = 'unlimited';

export interface EntitlementProfile {
  readonly id: string;
  /** Display only (Settings). Never branched on. */
  readonly label: string;
  readonly grants: readonly CapabilityGrant[];
}

function grant(profileId: string, capability: CapabilityId, allowance: Allowance): CapabilityGrant {
  return Object.freeze({ grantId: `builtin:${profileId}:${capability}`, capability, allowance, source: 'profile' as const });
}

const UNLIMITED_PROFILE: EntitlementProfile = Object.freeze({
  id: 'unlimited',
  label: 'Full access',
  grants: Object.freeze(CAPABILITY_IDS.map((capability) => grant('unlimited', capability, { kind: 'unlimited' })))
});

/** Capabilities the `core` architecture profile keeps (see header: not a packaging decision). */
export const CORE_PROFILE_CAPABILITIES: readonly CapabilityId[] = Object.freeze(['games.active', 'routines'] as CapabilityId[]);

const CORE_PROFILE: EntitlementProfile = Object.freeze({
  id: 'core',
  label: 'Core',
  grants: Object.freeze(CORE_PROFILE_CAPABILITIES.map((capability) => grant('core', capability, { kind: 'unlimited' })))
});

export const BUILT_IN_PROFILES: Readonly<Record<BuiltInProfileId, EntitlementProfile>> = Object.freeze({
  unlimited: UNLIMITED_PROFILE,
  core: CORE_PROFILE
});

export function builtInProfile(id: BuiltInProfileId): EntitlementProfile {
  return BUILT_IN_PROFILES[id];
}
