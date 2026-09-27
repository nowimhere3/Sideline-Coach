/**
 * R3 capability identity: `playerType → lineage → modelId → effort` (S57.1 §2),
 * and the prior each identity starts from (S57.1 §6.2, S57.9 amendment).
 *
 * Nothing here knows which Player types exist. Lineages come from the pack's
 * segment for the target's own playerType; ranking comes from the injected
 * baseline preference table.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import type { PriorNode, PriorPackSegment, PriorPackSource, ResearchQuality } from './prior-pack';

export const PROVIDER_DEFAULT_MODEL = 'provider-default';
export const PROVIDER_MANAGED_EFFORT = 'provider-managed';
/** Key segment used when no lineage pattern matches the modelId. */
export const UNKNOWN_LINEAGE = '?';

/** S57.1 §6.2: rank 1 / 2 / 3 of today's depth chart, strength 2. */
export const BASELINE_PRIOR_BY_RANK: readonly number[] = Object.freeze([0.70, 0.62, 0.55]);
export const BASELINE_PRIOR_STRENGTH = 2;
/** S57.9 amendment: a supported playerType absent from the ranking. */
export const UNRANKED_PRIOR_MEAN = 0.55;
export const UNRANKED_PRIOR_STRENGTH = 2;
/** S57.1 §6.2: an unseen modelId inherits its lineage node at half strength. */
export const INHERITED_STRENGTH_FACTOR = 0.5;

export type BaselinePreference = Readonly<Partial<Record<TaskClassification, readonly string[]>>>;

/** What would run a Play. Instance identity is deliberately absent (S57.1 §2). */
export interface BeliefTarget {
  readonly playerType: string;
  /** Catalog id Sideline routes (alias or slug). Absent = provider-managed. */
  readonly modelId?: string;
  /** Absent = provider-managed. */
  readonly effort?: string;
  /** Concrete model the provider reported for an alias, when observable. */
  readonly resolvedModelId?: string;
}

export interface NormalizedTarget {
  readonly playerType: string;
  /** Undefined when no lineage pattern of this playerType matches. */
  readonly lineage?: string;
  readonly modelId: string;
  readonly effort: string;
  /** `playerType/lineage/modelId/effort`; the belief key (S57.1 §2). */
  readonly key: string;
  /** False for provider-managed seats: their capability cannot be attributed to a model. */
  readonly attributable: boolean;
  readonly resolvedModelId?: string;
}

export function normalizeTarget(source: PriorPackSource, target: BeliefTarget): NormalizedTarget {
  const segment = source.segment(target.playerType);
  const effort = concrete(target.effort) ?? PROVIDER_MANAGED_EFFORT;
  let modelId = concrete(target.modelId) ?? PROVIDER_DEFAULT_MODEL;
  // Some catalogs encode effort in a variant id (`family-medium`). Collapse it only
  // when the family itself is a researched modelId of this playerType.
  const suffix = `-${effort}`;
  if (segment && effort !== PROVIDER_MANAGED_EFFORT && modelId.endsWith(suffix)) {
    const family = modelId.slice(0, -suffix.length);
    if (segment.priors.some((p) => p.modelId === family)) modelId = family;
  }
  const attributable = modelId !== PROVIDER_DEFAULT_MODEL;
  const lineage = attributable ? resolveLineage(segment, modelId) : undefined;
  return {
    playerType: target.playerType,
    ...(lineage ? { lineage } : {}),
    modelId,
    effort,
    key: `${target.playerType}/${lineage ?? UNKNOWN_LINEAGE}/${modelId}/${effort}`,
    attributable,
    ...(target.resolvedModelId ? { resolvedModelId: target.resolvedModelId } : {})
  };
}

export function resolveLineage(segment: PriorPackSegment | undefined, modelId: string): string | undefined {
  return segment?.lineages.find((rule) => rule.match.test(modelId))?.lineage;
}

export type PriorOrigin = 'researched' | 'inherited' | 'baseline-preference';

export interface ResolvedPrior {
  readonly mean: number;
  /** Strength before age decay (inheritance already applied). */
  readonly strength: number;
  readonly source: PriorOrigin;
  readonly researchedAt?: string;
  readonly researchQuality?: ResearchQuality;
  readonly priorNode?: string;
  readonly inheritedFrom?: string;
  readonly segmentVersion?: string;
  readonly node?: PriorNode;
  /** Why the prior is not an exact researched node, in reason-code form. */
  readonly note?: 'NEW_MODEL_INHERITED' | 'ALIAS_DRIFT_INHERITED' | 'PRIOR_ONLY_BASELINE' | 'UNRANKED_PLAYER_TYPE';
}

/**
 * Most specific node wins: exact → effort wildcard (same model) → lineage node
 * with modelId and effort wildcards (inherited, n0 × 0.5) → playerType node
 * (inherited) → baseline preference.
 * `*` never matches the pack's wildcard exclusions (e.g. `ultra`, provider-managed).
 */
export function resolvePrior(
  source: PriorPackSource,
  target: NormalizedTarget,
  taskClass: TaskClassification,
  difficulty: PlayDifficulty,
  baseline: BaselinePreference
): ResolvedPrior {
  const segment = source.segment(target.playerType);
  const excludedEffort = source.wildcardExcludes.effort.includes(target.effort);
  const excludedModel = source.wildcardExcludes.modelId.includes(target.modelId);
  const candidates = (segment?.priors ?? []).filter((p) => p.taskClass === taskClass
    && (p.difficulty === '*' || p.difficulty === difficulty));
  const pick = (predicate: (p: PriorNode) => boolean): PriorNode | undefined => candidates
    .filter(predicate)
    .sort((a, b) => Number(b.difficulty !== '*') - Number(a.difficulty !== '*'))[0];

  if (target.attributable && target.lineage && segment) {
    const effortOk = (p: PriorNode) => p.effort === target.effort || (p.effort === '*' && !excludedEffort);
    const exact = pick((p) => p.lineage === target.lineage && p.modelId === target.modelId && p.effort === target.effort)
      ?? pick((p) => p.lineage === target.lineage && p.modelId === target.modelId && p.effort === '*' && !excludedEffort);
    if (exact) {
      const alias = segment.aliases.find((a) => a.modelId === target.modelId);
      if (alias && target.resolvedModelId && target.resolvedModelId !== alias.resolvesTo) {
        return fromNode(exact, segment, 'inherited', 'ALIAS_DRIFT_INHERITED');
      }
      return fromNode(exact, segment, 'researched');
    }
    const lineageNode = excludedModel ? undefined
      : pick((p) => p.lineage === target.lineage && p.modelId === '*' && effortOk(p));
    if (lineageNode) return fromNode(lineageNode, segment, 'inherited', 'NEW_MODEL_INHERITED');
  }
  if (target.attributable && segment && !excludedModel) {
    const typeNode = pick((p) => p.lineage === '*' && p.modelId === '*'
      && (p.effort === target.effort || (p.effort === '*' && !excludedEffort)));
    if (typeNode) return fromNode(typeNode, segment, 'inherited', 'NEW_MODEL_INHERITED');
  }
  return baselinePrior(target.playerType, taskClass, baseline);
}

export function baselinePrior(playerType: string, taskClass: TaskClassification, baseline: BaselinePreference): ResolvedPrior {
  const rank = (baseline[taskClass] ?? []).indexOf(playerType);
  if (rank < 0) {
    return { mean: UNRANKED_PRIOR_MEAN, strength: UNRANKED_PRIOR_STRENGTH, source: 'baseline-preference', note: 'UNRANKED_PLAYER_TYPE' };
  }
  const mean = BASELINE_PRIOR_BY_RANK[Math.min(rank, BASELINE_PRIOR_BY_RANK.length - 1)];
  return { mean, strength: BASELINE_PRIOR_STRENGTH, source: 'baseline-preference', note: 'PRIOR_ONLY_BASELINE' };
}

function fromNode(
  node: PriorNode,
  segment: PriorPackSegment,
  source: 'researched' | 'inherited',
  note?: ResolvedPrior['note']
): ResolvedPrior {
  return {
    mean: node.firstPass,
    strength: source === 'inherited' ? node.strength * INHERITED_STRENGTH_FACTOR : node.strength,
    source,
    researchedAt: node.researchedAt,
    researchQuality: node.researchQuality,
    priorNode: node.node,
    ...(source === 'inherited' ? { inheritedFrom: node.node } : {}),
    segmentVersion: segment.segmentVersion,
    node,
    ...(note ? { note } : {})
  };
}

function concrete(value: string | undefined): string | undefined {
  return value && value !== 'default' && value !== 'auto' ? value : undefined;
}
