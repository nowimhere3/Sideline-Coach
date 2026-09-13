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
  readonly fieldLabel: string;
  readonly state: 'ready' | 'busy' | 'unavailable' | 'needs-verification';
  readonly capability: ProviderCapabilitySnapshot;
  readonly activeModel?: string;
  readonly activeEffort?: string;
  /**
   * How a Play is executed. `direct-shell` (Terminal) runs the exact text as a
   * command: no model, no reasoning, never an AUTO candidate. Absent = reasoning Player.
   */
  readonly executionType?: 'reasoning' | 'direct-shell';
}

export type TaskClassification = 'architecture' | 'implementation' | 'quick' | 'default';

export type RoutingMode = 'auto' | 'manual';

export interface RoutingDecision {
  readonly mode: RoutingMode;
  readonly gameId: string;
  readonly playerInstanceId: string;
  readonly playerLabel: string;
  readonly provider: string;
  readonly model?: string;              // undefined = Provider Default
  readonly modelDisplayName: string;
  readonly effort?: string;             // undefined = Provider Default
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
}
