import type { PlayerRoutingCapability } from './capability-types';
import { resourcePoolForSeat, type ResourcePoolId } from './control-plane/routing-economics';

/**
 * A concrete on-field routing candidate with the resource identity owned by its
 * seat/transport. The pool is deliberately projected from R1's canonical seam;
 * model names and lineages never participate in this identity.
 */
export interface RouteSeat extends PlayerRoutingCapability {
  readonly resourcePool: ResourcePoolId | 'unknown';
}

/** Attach R1's canonical seat-owned resource identity without changing roster truth. */
export function routeSeat(candidate: PlayerRoutingCapability): RouteSeat {
  return {
    ...candidate,
    resourcePool: resourcePoolForSeat(candidate)
  };
}
