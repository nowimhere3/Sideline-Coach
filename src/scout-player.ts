import * as path from 'node:path';
import type { PlayerRoutingCapability } from './capability-types';
import {
  inspectScoutFormationAvailability,
  runScoutFormation,
  type FormationCandidate,
  type FormationCompletion,
  type FormationOutcome,
  type FormationRequest
} from './scout-formation';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from './scout-player-contract';
import { countInfrastructureLimited } from './scout-bootstrap';
import type { VirtualPlayer, VirtualPlayerReadiness } from './virtual-player';
export { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from './scout-player-contract';

/**
 * BREADCRUMB — provider/account capacity is not Scout/model quality.
 *
 * WAS: Early Scout work proved provider interchangeability, free-model
 * discovery, Combine tryouts, and Formation execution in the owner's configured
 * environment. Provider failures were correctly reversible infrastructure
 * evidence, but ordinary users may have materially different account limits.
 *
 * IS: Prospects can be OpenRouter-backed or OpenCode-hosted. OpenCode can also
 * be the execution harness, so harness and underlying provider/account capacity
 * are distinct. On 2026-09-17 OpenRouter publicly documented roughly 50 free-
 * model requests/day for a free account, 1,000/day after at least $10 of credits
 * were added, and 20 requests/minute. Those figures are time-sensitive provider
 * policy, not Sideline invariants, and are deliberately not encoded below.
 *
 * WHY: Non-completion can mean model behavior, provider outage, upstream rate
 * limit, authentication, daily quota exhaustion, harness failure, timeout, or
 * other infrastructure. Capacity exhaustion must not become a poor Scout
 * score, and automatic maintenance/routing must not create retry storms or
 * silently consume a user's limited allowance.
 *
 * WILL BE: Capacity truth may eventually be represented separately as READY,
 * LIMITED, RATE LIMITED, DAILY CAPACITY EXHAUSTED, AUTH ISSUE, PROVIDER
 * UNSTABLE, or UNKNOWN (exact policy remains open). Routing, Coach Refresh, and
 * CONSERVE may consider known headroom; UNKNOWN remains honest when headroom
 * cannot be observed. Aggregate UI may hide provider plumbing. This Play adds
 * no counters, billing inspection, rate prediction, or automatic refresh.
 */

export interface ScoutPlayerExecution {
  readonly playerInstanceId: typeof SCOUT_PLAYER_INSTANCE_ID;
  readonly outcome: FormationOutcome;
  readonly formation: FormationCompletion;
}

export interface ScoutPlayerAdapterOptions {
  readonly enabled?: () => boolean;
  /** Trusted extension-runtime lookup; the returned secret is never Player state. */
  readonly resolveOpenRouterApiKey?: () => PromiseLike<string | undefined>;
  readonly durableReportRoot?: (gameRoot: string) => string;
  readonly workspaceRoot?: (gameRoot: string) => string;
  readonly candidates?: readonly FormationCandidate[];
  readonly formationSize?: number;
  readonly runFormation?: (request: FormationRequest) => Promise<FormationCompletion>;
  readonly now?: () => number;
}

/**
 * One logical Scout Player over the existing Formation engine. This adapter
 * owns routing/execution translation only: Combine still writes scorecards,
 * Formation still selects and runs eligible receivers, and no health truth is
 * persisted here.
 */
export class ScoutPlayerAdapter implements VirtualPlayer {
  private active = false;

  /** VirtualPlayer identity. Scout is one logical Player; its receivers are never roster Players. */
  readonly instanceId = SCOUT_PLAYER_INSTANCE_ID;
  readonly playerType = SCOUT_PLAYER_TYPE;
  readonly displayName = 'Scout';
  readonly executionType = 'scout-formation' as const;

  constructor(private readonly options: ScoutPlayerAdapterOptions = {}) {}

  /** ENTITLEMENT: is Scout offered at all? Independent of membership and of readiness. */
  entitled(): boolean {
    return this.options.enabled?.() !== false;
  }

  /**
   * READINESS: can Scout run a Play right now? Derived from the shared depth chart on every call and
   * never persisted. A Player that cannot run is `unavailable`, which is not the same as gone.
   */
  readiness(gameRoot: string): VirtualPlayerReadiness {
    if (this.active) return { state: 'busy', label: 'Scouting' };
    if (!this.entitled()) return { state: 'unavailable', label: 'Scout is turned off' };
    if (this.availability(gameRoot).eligibleIds.length > 0) return { state: 'ready', label: 'Ready' };
    return {
      state: 'unavailable',
      label: countInfrastructureLimited(this.durableRoot(gameRoot)) > 0 ? 'Provider limited' : 'No Scouts ready yet'
    };
  }

  private durableRoot(gameRoot: string): string {
    return path.resolve(this.options.durableReportRoot?.(gameRoot)
      ?? path.join(gameRoot, 'REPORTS', 'Scout Only'));
  }

  /**
   * WAS: Scout began as internal Formation plumbing with no routing identity
   * at all; this method is what made it a first-class dispatch target.
   * IS: the returned capability (or `undefined`) is pure capability truth —
   * enabled AND at least one eligible receiver, mirrored as-is into both
   * AUTO/MANUAL routing and the Q2.14 Team card. Developer/owner
   * environments may simply have `enabled()` default to true.
   * WHY: a future distribution may offer Scout as an optional/premium
   * feature. Capability (can it run), runtime availability (is a receiver
   * proven READY right now), and commercial entitlement (is this user
   * allowed to use it) are three separate concepts that must not collapse
   * into this one boolean-ish return.
   * WILL BE: a future entitlement layer may gate this return on account
   * entitlement — Scout staying visible-but-locked on the Team card with an
   * "Unlock Scout" action rather than disappearing outright, the same
   * pattern future gated features (e.g. CONSERVE) would reuse. None of that
   * — licensing, billing, locked-card UX, API-key onboarding — is built
   * here; this comment preserves the seam only.
   */
  /**
   * CREDENTIAL OWNERSHIP / PRODUCT GATE
   *
   * WAS: Scout/OpenRouter authentication depended on inherited process env.
   * IS: the extension owns Dad Mode credential storage and supplies the key
   * ephemerally at execution; capability/Settings visibility remains a
   * separate product decision through enabled().
   * WHY: users should not manage shell inheritance, and secret material must
   * never become ordinary Sideline state or Player game film.
   * WILL BE: future Scout entitlement may gate this capability and its
   * Settings card without changing the secure storage/execution contract.
   */
  capability(gameRoot: string): PlayerRoutingCapability | undefined {
    if (this.options.enabled?.() === false) return undefined;
    const availability = this.availability(gameRoot);
    // A Formation already in flight stays visible as working even if its last READY receiver was
    // suspended by that very run (S31 F6): the Player is busy, not gone.
    if (availability.eligibleIds.length === 0 && !this.active) return undefined;
    const observedAt = this.options.now?.() ?? Date.now();
    return {
      instanceId: SCOUT_PLAYER_INSTANCE_ID,
      playerType: SCOUT_PLAYER_TYPE,
      transport: 'controlled',
      transportLabel: 'Controlled',
      fieldLabel: 'Scout',
      state: this.active ? 'busy' : 'ready',
      capability: {
        provider: SCOUT_PLAYER_TYPE,
        authenticated: true,
        models: [],
        observedAt,
        freshness: 'live'
      },
      executionType: 'scout-formation',
      autoEligible: false,
      supportsQueue: false
    };
  }

  availability(gameRoot: string) {
    return inspectScoutFormationAvailability({
      gameRoot,
      durableReportRoot: this.durableRoot(gameRoot),
      candidates: this.options.candidates
    });
  }

  async execute(objective: string, gameRoot: string, options: {
    readonly players?: readonly string[];
    readonly reportAttribution?: FormationRequest['reportAttribution'];
    readonly onSelected?: (info: { readonly count: number; readonly candidateIds: readonly string[] }) => void;
  } = {}): Promise<ScoutPlayerExecution> {
    if (this.active) throw new Error('Scout is already running a Formation.');
    const capability = this.capability(gameRoot);
    if (!capability) {
      throw new Error('Scout is unavailable: no eligible Formation receiver is currently proven READY, or Scout is disabled.');
    }
    this.active = true;
    try {
      const formation = await (this.options.runFormation ?? runScoutFormation)({
        objective,
        gameRoot: path.resolve(gameRoot),
        durableReportRoot: this.durableRoot(gameRoot),
        workspaceRoot: this.options.workspaceRoot?.(gameRoot),
        candidates: this.options.candidates,
        players: options.players,
        reportAttribution: options.reportAttribution,
        formationSize: this.options.formationSize,
        resolveOpenRouterApiKey: this.options.resolveOpenRouterApiKey,
        onSelected: options.onSelected
      });
      return { playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, outcome: formation.outcome, formation };
    } finally {
      this.active = false;
    }
  }
}
