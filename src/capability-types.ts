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
  readonly fieldLabel: string;
  readonly state: 'ready' | 'busy' | 'unavailable' | 'needs-verification';
  readonly capability: ProviderCapabilitySnapshot;
  readonly activeModel?: string;
  readonly activeEffort?: string;
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
}
