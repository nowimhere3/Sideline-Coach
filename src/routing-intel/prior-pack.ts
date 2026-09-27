/**
 * R3 PriorPackSource: the only way belief reads researched capability priors.
 *
 * V1 ships one repo-local `priors.json` (R0, S57.7). This module exposes it as
 * per-`playerType` segments with their own version stamp (S57.9 §5), so a later
 * Pack Manager can deliver segments without touching the belief engine. No
 * network, signature, refresh or telemetry lives here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskClassification } from '../capability-types';
import type { PlayDifficulty } from '../play-analyzer';

export const PRIOR_PACK_SCHEMA_VERSION = 1 as const;
export const PRIOR_PACK_FILE = 'priors.json';

export type ResearchQuality = 'cross-checked' | 'single-source' | 'extrapolated';

/** S57.1 §6.2 hard caps on researched strength. */
export const PRIOR_STRENGTH_CAP: Readonly<Record<ResearchQuality, number>> = Object.freeze({
  'cross-checked': 6,
  'single-source': 4,
  'extrapolated': 2
});

const TASK_CLASSES: readonly TaskClassification[] = ['architecture', 'implementation', 'quick', 'default'];
const DIFFICULTIES: readonly (PlayDifficulty | '*')[] = ['easy', 'medium', 'hard', '*'];

export interface PriorNode {
  readonly node: string;
  readonly priorClass: string;
  readonly playerType: string;
  readonly lineage: string;
  readonly modelId: string;
  readonly effort: string;
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty | '*';
  /** m0. */
  readonly firstPass: number;
  /** n0. */
  readonly strength: number;
  readonly researchQuality: ResearchQuality;
  readonly researchedAt: string;
  /** Open window id → [p25, p50, p75] fraction of the window; null = UNKNOWN. */
  readonly burn: Readonly<Record<string, readonly [number, number, number]>> | null;
  /** [p25, p50, p75] minutes; null = UNKNOWN. */
  readonly durationMin: readonly [number, number, number] | null;
}

export interface PriorLineageRule {
  readonly playerType: string;
  readonly lineage: string;
  readonly match: RegExp;
  readonly researched: boolean;
}

export interface PriorAliasResolution {
  readonly playerType: string;
  readonly modelId: string;
  readonly resolvesTo: string;
}

export interface PriorPackSegment {
  readonly playerType: string;
  readonly packVersion: string;
  /** Stamped on every belief that used this segment. */
  readonly segmentVersion: string;
  readonly lineages: readonly PriorLineageRule[];
  readonly priors: readonly PriorNode[];
  readonly aliases: readonly PriorAliasResolution[];
}

export interface PriorPackSource {
  readonly schemaVersion: typeof PRIOR_PACK_SCHEMA_VERSION;
  readonly packVersion: string;
  /** Where the pack came from (file path or `inline`), for diagnostics only. */
  readonly origin: string;
  readonly segments: readonly PriorPackSegment[];
  /** Values that a `*` wildcard never matches (pack `semantics.wildcardExcludes`). */
  readonly wildcardExcludes: { readonly modelId: readonly string[]; readonly effort: readonly string[] };
  /** Records skipped while loading. A skipped record never becomes a prior. */
  readonly diagnostics: readonly string[];
  segment(playerType: string): PriorPackSegment | undefined;
}

export class PriorPackError extends Error {}

/** A pack with no segments: every target falls to the baseline-preference prior. */
export function emptyPriorPackSource(origin = 'empty'): PriorPackSource {
  return buildSource('none', origin, [], { modelId: [], effort: [] }, []);
}

/** Pure: validate and segment an already-parsed pack. */
export function priorPackSourceFromJson(raw: unknown, origin = 'inline'): PriorPackSource {
  if (!isObject(raw)) throw new PriorPackError('Prior pack is not an object.');
  if (raw.schemaVersion !== PRIOR_PACK_SCHEMA_VERSION) {
    throw new PriorPackError(`Unsupported prior pack schemaVersion ${String(raw.schemaVersion)}.`);
  }
  if (typeof raw.packVersion !== 'string' || !raw.packVersion) throw new PriorPackError('Prior pack has no packVersion.');
  if (!Array.isArray(raw.priors) || !Array.isArray(raw.lineages)) throw new PriorPackError('Prior pack lacks priors/lineages arrays.');

  const diagnostics: string[] = [];
  const lineages: PriorLineageRule[] = [];
  raw.lineages.forEach((entry, index) => {
    if (!isObject(entry) || !nonEmpty(entry.playerType) || !nonEmpty(entry.lineage) || !nonEmpty(entry.match)) {
      diagnostics.push(`lineages[${index}] invalid`);
      return;
    }
    let match: RegExp;
    try { match = new RegExp(entry.match); } catch {
      diagnostics.push(`lineages[${index}] invalid pattern`);
      return;
    }
    lineages.push({ playerType: entry.playerType, lineage: entry.lineage, match, researched: entry.researched === true });
  });

  const priors: PriorNode[] = [];
  raw.priors.forEach((entry, index) => {
    const node = toPriorNode(entry);
    if (typeof node === 'string') diagnostics.push(`priors[${index}] ${node}`);
    else priors.push(node);
  });

  const aliases: PriorAliasResolution[] = [];
  if (Array.isArray(raw.aliasResolution)) {
    for (const entry of raw.aliasResolution) {
      if (isObject(entry) && nonEmpty(entry.playerType) && nonEmpty(entry.modelId) && nonEmpty(entry.resolvesTo)) {
        aliases.push({ playerType: entry.playerType, modelId: entry.modelId, resolvesTo: entry.resolvesTo });
      }
    }
  }

  const semantics = isObject(raw.semantics) ? raw.semantics : {};
  const excludes = isObject(semantics.wildcardExcludes) ? semantics.wildcardExcludes : {};
  const wildcardExcludes = {
    modelId: stringList(excludes.modelId),
    effort: stringList(excludes.effort)
  };
  return buildSource(raw.packVersion, origin, priors, wildcardExcludes, diagnostics, lineages, aliases);
}

/**
 * Load the shipped pack. Candidate paths follow the daemon's asset pattern:
 * compiled `out/` first, then the repo `src/` copy.
 */
export function loadShippedPriorPack(candidates: readonly string[] = defaultPriorPackPaths()): PriorPackSource {
  for (const file of candidates) {
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    return priorPackSourceFromJson(JSON.parse(text), file);
  }
  throw new PriorPackError(`No prior pack found (${candidates.join(', ')}).`);
}

export function defaultPriorPackPaths(): string[] {
  return [
    path.resolve(__dirname, PRIOR_PACK_FILE),
    path.resolve(__dirname, '..', '..', 'src', 'routing-intel', PRIOR_PACK_FILE),
    path.resolve(process.cwd(), 'src', 'routing-intel', PRIOR_PACK_FILE)
  ];
}

function buildSource(
  packVersion: string,
  origin: string,
  priors: readonly PriorNode[],
  wildcardExcludes: PriorPackSource['wildcardExcludes'],
  diagnostics: readonly string[],
  lineages: readonly PriorLineageRule[] = [],
  aliases: readonly PriorAliasResolution[] = []
): PriorPackSource {
  const playerTypes = [...new Set([...priors.map((p) => p.playerType), ...lineages.map((l) => l.playerType)])].sort();
  const segments: PriorPackSegment[] = playerTypes.map((playerType) => ({
    playerType,
    packVersion,
    segmentVersion: `${packVersion}/${playerType}`,
    lineages: lineages.filter((l) => l.playerType === playerType),
    priors: priors.filter((p) => p.playerType === playerType),
    aliases: aliases.filter((a) => a.playerType === playerType)
  }));
  const byType = new Map(segments.map((segment) => [segment.playerType, segment]));
  return {
    schemaVersion: PRIOR_PACK_SCHEMA_VERSION,
    packVersion,
    origin,
    segments,
    wildcardExcludes,
    diagnostics,
    segment: (playerType: string) => byType.get(playerType)
  };
}

function toPriorNode(entry: unknown): PriorNode | string {
  if (!isObject(entry)) return 'not an object';
  const { playerType, lineage, modelId, effort, taskClass, difficulty, firstPass, strength, researchQuality, researchedAt } = entry;
  if (![playerType, lineage, modelId, effort].every(nonEmpty)) return 'missing node identity';
  if (!TASK_CLASSES.includes(taskClass as TaskClassification)) return 'invalid taskClass';
  if (!DIFFICULTIES.includes(difficulty as PlayDifficulty | '*')) return 'invalid difficulty';
  if (typeof firstPass !== 'number' || !(firstPass > 0 && firstPass < 1)) return 'firstPass outside (0,1)';
  if (researchQuality !== 'cross-checked' && researchQuality !== 'single-source' && researchQuality !== 'extrapolated') return 'invalid researchQuality';
  if (typeof strength !== 'number' || !(strength > 0) || strength > PRIOR_STRENGTH_CAP[researchQuality]) return 'strength outside S57.1 cap';
  if (!nonEmpty(researchedAt) || !Number.isFinite(Date.parse(researchedAt))) return 'invalid researchedAt';
  const node = `${playerType}/${lineage}/${modelId}/${effort}`;
  if (entry.node !== undefined && entry.node !== node) return 'node does not match its fields';
  return {
    node,
    priorClass: typeof entry.priorClass === 'string' ? entry.priorClass : 'active',
    playerType: playerType as string,
    lineage: lineage as string,
    modelId: modelId as string,
    effort: effort as string,
    taskClass: taskClass as TaskClassification,
    difficulty: difficulty as PlayDifficulty | '*',
    firstPass,
    strength,
    researchQuality,
    researchedAt: researchedAt as string,
    burn: toBurnPrior(entry.burn),
    durationMin: toTriple(entry.durationMin)
  };
}

/** Accepts only an open `{ windowId: [p25, p50, p75] }` map; anything else stays UNKNOWN. */
function toBurnPrior(value: unknown): PriorNode['burn'] {
  if (!isObject(value)) return null;
  const out: Record<string, readonly [number, number, number]> = {};
  for (const [windowId, range] of Object.entries(value)) {
    const triple = toTriple(range);
    if (triple && triple[0] > 0 && triple[2] <= 1) out[windowId] = triple;
  }
  return Object.keys(out).length ? out : null;
}

function toTriple(value: unknown): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) return null;
  const [a, b, c] = value as number[];
  return a <= b && b <= c ? [a, b, c] : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
