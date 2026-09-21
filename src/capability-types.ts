export type CapabilityFreshness = 'live' | 'cached' | 'stale' | 'unavailable';

export interface ModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string;
  readonly isDefault: boolean;
  readonly supportedEfforts: readonly string[];
  readonly defaultEffort?: string;
}

export interface ProviderCapabilitySnapshot {
  readonly provider: string;            // 'codex' | 'claude' | 'agy'
  readonly authenticated: boolean;
  readonly accountEmail?: string;
  readonly planType?: string;
  readonly models: readonly ModelDescriptor[];
  readonly defaultModelId?: string;
  readonly observedAt: number;
  readonly freshness: CapabilityFreshness;
}

export interface PlayerRoutingCapability {
  readonly instanceId: string;
  readonly playerType: string;
  readonly transport: 'controlled' | 'legacy';
  /**
   * Human-facing wording for the same fact. `transport` stays as it was for
   * routing policy and persisted contracts; this is what a person reads.
   */
  readonly transportLabel?: string;
  /** Process/terminal authority is explicit evidence; names and transport never imply Coach ownership. */
  readonly ownership?: import('./player-adapters').PlayerOwnership;
  readonly fieldLabel: string;
  readonly state: 'ready' | 'busy' | 'unavailable' | 'needs-verification';
  readonly capability: ProviderCapabilitySnapshot;
  readonly activeModel?: string;
  readonly activeEffort?: string;
  /**
   * Exact Stadium-local evidence used only to re-teach a replaced Control Plane
   * which Controlled turn is still active. `busy` alone must never manufacture
   * this identity or timestamp.
   */
  readonly activeTurn?: {
    readonly turnRef: string;
    readonly state: 'accepted' | 'started';
    readonly startedAt: number;
  };
  /**
   * How a Play is executed. `direct-shell` (Terminal) runs the exact text as a
   * command: no model or reasoning. AUTO may choose it only through the conservative shell-intent boundary.
   */
  readonly executionType?: 'reasoning' | 'direct-shell' | 'scout-formation';
  /** False excludes this Player from ordinary provider ranking; specialized explainable policy may still choose it. */
  readonly autoEligible?: boolean;
  /** False for logical Players whose execution engine does not support Coach's queue. */
  readonly supportsQueue?: boolean;
}

export type TaskClassification = 'architecture' | 'implementation' | 'quick' | 'default';

export type RoutingMode = 'auto' | 'manual';

/**
 * Q2.10E-B: explicit human intent narrows AUTO. Missing dimensions remain AUTO's
 * job; these dimensions are never collapsed into a provider or display label.
 */
export interface RouteConstraints {
  readonly source: 'play';
  readonly playerType?: string;
  readonly playerInstanceId?: string;
  readonly model?: string;
  readonly modelDisplayName?: string;
  readonly effort?: string;
  readonly excludedModels?: readonly string[];
  readonly recognized: readonly ('player' | 'instance' | 'model' | 'effort' | 'model-exclusion')[];
}

export interface RoutingDecision {
  readonly mode: RoutingMode;
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerLabel: string;
  readonly provider: string;
  readonly model?: string;              // undefined = Provider Default
  readonly modelDisplayName: string;
  readonly effort?: string;             // undefined = Provider Default
  /** Exact classifier-normalized command for an AUTO direct-shell route. Raw prompt must never substitute for it. */
  readonly terminalCommand?: string;
  readonly reason: string;
  readonly stagedAt: number;
  /**
   * How the chosen Player will be reached. AUTO chooses WHO; transport decides
   * HOW. `legacy` (terminal) means Coach cannot set model or effort, so both are
   * managed by the provider rather than switched off.
   */
  readonly transport?: PlayerRoutingCapability['transport'];
  /** Play Analyzer wording for this prompt, e.g. `Hard architecture Play`. */
  readonly playLabel?: string;
  /**
   * Why AUTO chose this exact route, dimension by dimension. Internal truth for
   * debugging AUTO; the human normally sees only `summary`.
   */
  readonly rationale?: {
    readonly player: string;
    readonly instance: string;
    readonly model: string;
    readonly effort: string;
  };
  /** One Dadified sentence, e.g. `Codex 2 is free and can run this Play now.` */
  readonly summary?: string;
  /**
   * Q2.10D. What Coach will do with the Play:
   *   dispatch  send now to `playerInstanceId`
   *   queue     wait for `playerInstanceId` (the context owner, or a Player changing the same files)
   *   handoff   send now to `playerInstanceId`, with a compact context package from the owner's work
   * Absent means dispatch (pre-Q2.10D decisions).
   */
  readonly action?: 'dispatch' | 'queue' | 'handoff';
  /** Evidence-backed context ownership behind this route. Unknown is stated, never guessed. */
  readonly context?: {
    readonly state: 'owner' | 'unknown' | 'none';
    readonly ownerInstanceId?: string;
    readonly ownerName?: string;
    readonly evidence?: 'incoming-report' | 'named-report' | 'latest-report' | 'latest-play';
    readonly reportPath?: string;
    readonly reportFilename?: string;
    readonly note?: string;
    readonly collisionWith?: string;
  };
  /** Human-facing name of the chosen exact instance (contiguous numbering). */
  readonly playerName?: string;
  /** The smallest meaningful other choice, when the tradeoff matters to the human. */
  readonly alternative?: {
    readonly choice: 'queue' | 'handoff' | 'dispatch';
    readonly playerInstanceId: string;
    readonly playerName: string;
    readonly label: string;
  };
  /** Compact provider-neutral context package prepended to the Play (handoff, or Unknown owner with a report). */
  readonly contextPreamble?: string;
  /** Position this Play would take in the exact instance's queue (1 = next). */
  readonly queuePosition?: number;
  /** Explicit Play-level constraints that this decision honored. Hidden plumbing; Dad sees the summary. */
  readonly constraints?: RouteConstraints;
  /** Explainable, boolean Scout-need evidence. Present only when AUTO chose Scout. */
  readonly scoutNeed?: {
    readonly reconnaissancePrimary: boolean;
    readonly materialEvidenceGap: boolean;
    readonly actionBlockedByUncertainty: boolean;
    readonly boundedParallelReconUseful: boolean;
    readonly scoutAvailable: boolean;
    readonly reason: string;
  };
  /** One bounded post-Formation return to Coach; the referenced report is evidence, not authority. */
  readonly scoutContinuation?: {
    readonly phase: 'post-scout';
    readonly originalClientRef: string;
    readonly formationId?: string;
    readonly reportPath: string;
    readonly authorityReason: string;
  };
}
