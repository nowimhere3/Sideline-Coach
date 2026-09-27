/**
 * R3 comparability: how much one Film observation says about the Play being
 * scored (S57.1 §5.2) and which hierarchy level it pools from (S57.1 §5.3).
 * Shared by first-pass belief, burn and duration so every estimate weighs Film
 * the same way.
 */

import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';
import type { BeliefRole, FilmObservation } from './film-index';
import type { NormalizedTarget } from './lineage';

export const BELIEF_ENGINE_VERSION = 'r3-belief-1';

const DAY_MS = 86_400_000;

export const BELIEF_CONSTANTS = Object.freeze({
  /** S57.1 §6.2 prior age decay. */
  priorHalfLifeDays: 180,
  /** S57.1 §5.2 Film decay; halved for a node under suspected drift (§5.5). */
  filmHalfLifeDays: 90,
  driftHalfLifeDays: 45,
  /** S57.1 §7: beliefs fold only the last 365 days. */
  foldWindowDays: 365,
  /** S57.1 §5.3 pooling weights. */
  lambdaEffortSibling: 0.35,
  lambdaModelSibling: 0.15,
  lambdaLineageSibling: 0.05,
  /** S57.1 §5.3: pooled pseudo-reps from ancestors are capped in total. */
  pooledCap: 6,
  /** S57.1 §5.2 same-Game bonus. */
  gameBonus: 1.15,
  /** S57.1 §5.2 unknown observation profile (R2 records none): class treated as `default`, difficulty as adjacent. */
  unknownDifficultySimilarity: 0.6
});

export type PoolingLevel = 'own' | 'effort-sibling' | 'model-sibling' | 'lineage-sibling';

export interface QueryProfile {
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly role: BeliefRole;
  readonly gameId?: string;
}

/** S57.1 §5.2 sim(class). `quick↔default` takes the lower (quick) value. */
export function classSimilarity(a: TaskClassification, b: TaskClassification): number {
  if (a === b) return 1;
  if (a === 'quick' || b === 'quick') return 0.1;
  if (a === 'default' || b === 'default') return 0.3;
  return 0.25; // architecture ↔ implementation
}

const DIFFICULTY_ORDER: Readonly<Record<PlayDifficulty, number>> = { easy: 0, medium: 1, hard: 2 };

/** S57.1 §5.2 sim(diff): same 1.0 · adjacent 0.6 · easy↔hard 0.25. */
export function difficultySimilarity(a: PlayDifficulty, b: PlayDifficulty): number {
  const gap = Math.abs(DIFFICULTY_ORDER[a] - DIFFICULTY_ORDER[b]);
  return gap === 0 ? 1 : gap === 1 ? 0.6 : 0.25;
}

export function halfLifeDecay(ageMs: number, halfLifeDays: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY_MS));
}

export function ageDays(ms: number): number {
  return ms / DAY_MS;
}

/**
 * Which level of the target's hierarchy an observation belongs to, or null when
 * it must not inform the target at all (other role, other playerType, or an
 * unattributable provider-managed seat on either side of a non-own match).
 */
export function poolingLevel(target: NormalizedTarget, role: BeliefRole, observation: FilmObservation): PoolingLevel | null {
  if (observation.role !== role) return null;
  if (observation.target.key === target.key) return 'own';
  if (!target.attributable || !observation.target.attributable) return null;
  if (observation.target.playerType !== target.playerType) return null;
  if (observation.target.modelId === target.modelId) return 'effort-sibling';
  if (target.lineage && observation.target.lineage === target.lineage) return 'model-sibling';
  return 'lineage-sibling';
}

export function poolingLambda(level: PoolingLevel): number {
  switch (level) {
    case 'own': return 1;
    case 'effort-sibling': return BELIEF_CONSTANTS.lambdaEffortSibling;
    case 'model-sibling': return BELIEF_CONSTANTS.lambdaModelSibling;
    case 'lineage-sibling': return BELIEF_CONSTANTS.lambdaLineageSibling;
  }
}

/**
 * S57.1 §5.2 comparability weight WITHOUT attribution:
 * sim(class) · sim(diff) · decay(age) · gameBonus. Zero outside the fold window.
 */
export function comparabilityWeight(
  observation: FilmObservation,
  query: QueryProfile,
  now: number,
  halfLifeDays: number = BELIEF_CONSTANTS.filmHalfLifeDays
): number {
  const age = now - observation.at;
  if (age < 0 || ageDays(age) > BELIEF_CONSTANTS.foldWindowDays) return 0;
  const profile = observation.profile;
  const classSim = classSimilarity(profile?.taskClass ?? 'default', query.taskClass);
  const diffSim = profile ? difficultySimilarity(profile.difficulty, query.difficulty) : BELIEF_CONSTANTS.unknownDifficultySimilarity;
  const bonus = query.gameId !== undefined && observation.gameId === query.gameId ? BELIEF_CONSTANTS.gameBonus : 1;
  return classSim * diffSim * halfLifeDecay(age, halfLifeDays) * bonus;
}

/** Scale factor that keeps total pooled (non-own) mass within the S57.1 cap. */
export function pooledScale(pooledMass: number): number {
  return pooledMass > BELIEF_CONSTANTS.pooledCap ? BELIEF_CONSTANTS.pooledCap / pooledMass : 1;
}
