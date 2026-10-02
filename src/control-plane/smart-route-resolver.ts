import type { PlayerRoutingCapability, RouteConstraints, RouteOption } from '../capability-types';
import type { InstanceLedgerEntry } from './work-ledger';
import { recognizeRouteConstraints } from './route-constraints';
import { normalizeEffortValue, normalizeRouteText } from './route-normalization';

/** S57.57: pure component intent; the single front door collects statements separately. */
export type CatalogueRouteIntent = Pick<RouteConstraints, 'playerType' | 'playerInstanceId' | 'model' | 'effort'>;
export type CatalogueRouteTuple = Required<Pick<RouteConstraints, 'playerType' | 'playerInstanceId' | 'model' | 'modelDisplayName'>>
  & Pick<RouteConstraints, 'effort'>;
type CatalogueDimension = 'player' | 'model' | 'effort';
type CatalogueOption = RouteOption;
export interface CatalogueRouteResolution {
  readonly state: 'resolved' | 'ambiguous' | 'unavailable';
  readonly candidates: readonly CatalogueRouteTuple[];
  readonly constraints: RouteConstraints;
}

/** Catalogue knowledge, not seat selection: busy/state/policy/defaults do not alter capability truth. */
export function catalogueRouteTuples(catalogue: readonly PlayerRoutingCapability[]): CatalogueRouteTuple[] {
  return catalogue.filter((seat) => seat.transport === 'controlled'
    && seat.executionType !== 'direct-shell' && seat.executionType !== 'scout-formation').flatMap((seat) =>
    seat.capability.models.flatMap((model) => (model.supportedEfforts.length ? model.supportedEfforts : [undefined]).map((effort) => ({
      playerType: seat.playerType, playerInstanceId: seat.instanceId,
      model: model.id, modelDisplayName: model.displayName, ...(effort === undefined ? {} : { effort })
    }))));
}

/** Resolve only supplied components by intersecting live tuples. Never parse prose or select a policy favourite. */
export function resolveCatalogueRoute(intent: CatalogueRouteIntent, catalogue: readonly PlayerRoutingCapability[]): CatalogueRouteResolution {
  const all = catalogueRouteTuples(catalogue);
  const same = (left: string, right: string): boolean => normalizeRouteText(left) === normalizeRouteText(right);
  const namedModel = intent.model !== undefined;
  const namedEffort = intent.effort !== undefined;
  const recognized: RouteConstraints['recognized'][number][] = [];
  const constraints: { -readonly [K in keyof Omit<RouteConstraints, 'unresolved'>]: RouteConstraints[K] } = { source: 'play', recognized };
  let rows = all;
  const stop = (dimension: CatalogueDimension, rawText: string, reason: 'unknown' | 'unsupported' | 'ambiguous', options?: readonly CatalogueOption[]): CatalogueRouteResolution => ({
    state: reason === 'ambiguous' ? 'ambiguous' : 'unavailable', candidates: reason === 'ambiguous' ? rows : [],
    constraints: { ...constraints, unresolved: [{ dimension, rawText, reason, ...(options ? { options } : {}) }] }
  });
  if (intent.playerType !== undefined) {
    const product = PLAYER_REGISTRY.find((entry) => entry.aliases.some((alias) => same(alias, intent.playerType!)));
    const player = product?.playerType ?? intent.playerType;
    rows = rows.filter((row) => same(row.playerType, player)
      || catalogue.some((seat) => seat.instanceId === row.playerInstanceId
        && [seat.capability.provider, seat.fieldLabel].some((alias) => same(alias, player))));
    const types = [...new Set(rows.map((row) => row.playerType))];
    if (types.length === 1) constraints.playerType = types[0];
    else if (!types.length) constraints.playerType = product?.playerType;
    recognized.push('player');
    if (!rows.length) return stop('player', intent.playerType, 'unknown');
  }
  if (intent.playerInstanceId !== undefined) {
    rows = rows.filter((row) => same(row.playerInstanceId, intent.playerInstanceId!));
    recognized.push('instance');
    if (!rows.length) return stop('player', intent.playerInstanceId, 'unknown');
    constraints.playerInstanceId = rows[0].playerInstanceId;
    constraints.playerType = rows[0].playerType;
  }

  let modelNamed = namedModel;
  if (namedModel) {
    const words = normalizeRouteText(intent.model!).split(' ').filter(Boolean);
    const aliases = (row: CatalogueRouteTuple): string[][] => [row.model, row.modelDisplayName].map((alias) => normalizeRouteText(alias).split(' '));
    const exact = rows.filter((row) => aliases(row).some((alias) => alias.join(' ') === words.join(' ')));
    // S57.70 family version decoration ("Sonnet 5.5" -> live "Sonnet"). Scoped to the rows already narrowed by Player,
    // never an alias table: an exact versioned model wins, and any live version-distinct candidate of the family means
    // the version is meaningful, so nothing is stripped or collapsed.
    let family = words.length;
    while (family > 0 && /^\d+$/.test(words[family - 1])) family -= 1;
    const stripped = family > 0 && family < words.length ? words.slice(0, family).join(' ') : undefined;
    const versioned = stripped !== undefined && rows.some((row) => aliases(row).some((alias) =>
      alias.some((token) => /\d/.test(token)) && ` ${alias.join(' ')} `.includes(` ${stripped} `)));
    const familyVersion = stripped !== undefined && !versioned ? rows.filter((row) => aliases(row).some((alias) =>
      alias.every((token) => !/\d/.test(token)) && alias.join(' ') === stripped)) : [];
    const run = words.length && !words.every((word) => /^\d+$/.test(word)) ? rows.filter((row) => aliases(row).some((alias) =>
      alias.some((_, start) => words.every((word, offset) => alias[start + offset] === word)))) : [];
    rows = rows.filter((row) => exact.includes(row) || familyVersion.includes(row) || run.includes(row));
    if (!rows.length) { recognized.push('model'); return stop('model', intent.model!, 'unknown'); }

    // A brand is catalogue-derived: one token shared by every model of one multi-model Player,
    // and absent from every other Player. An exact model identity takes precedence.
    if (!exact.length && words.length === 1) {
      const owners = [...new Set(all.filter((row) => aliases(row).some((alias) => alias.includes(words[0]))).map((row) => row.playerType))];
      if (owners.length === 1) {
        const owned = all.filter((row) => row.playerType === owners[0]);
        if (new Set(owned.map((row) => row.model)).size >= 2
          && owned.every((row) => aliases(row).some((alias) => alias.includes(words[0])))) {
          modelNamed = false;
          constraints.playerType = owners[0];
          if (!recognized.includes('player')) recognized.push('player');
        }
      }
    }
  }
  if (modelNamed) recognized.push('model');
  if (namedEffort) {
    recognized.push('effort');
    // Preserve a model/Player already known even when its requested effort is unsupported.
    if (modelNamed && new Set(rows.map((row) => JSON.stringify([row.playerType, row.model]))).size === 1) {
      constraints.playerType = rows[0].playerType;
      constraints.model = rows[0].model;
      constraints.modelDisplayName = rows[0].modelDisplayName;
    }
    // Existing lexical aliases (including med) plus exact live IDs; ultra is never mapped to max.
    const effort = normalizeEffortValue(intent.effort!) ?? normalizeRouteText(intent.effort!);
    rows = rows.filter((row) => row.effort !== undefined && same(row.effort, effort));
    if (!rows.length) return stop('effort', intent.effort!, 'unsupported');
    const efforts = [...new Set(rows.map((row) => row.effort!))];
    if (efforts.length === 1) constraints.effort = efforts[0];
  }
  const players = [...new Set(rows.map((row) => row.playerType))];
  const models = [...new Set(rows.map((row) => JSON.stringify([row.playerType, row.model])))];
  if (modelNamed) {
    if (players.length === 1) constraints.playerType = players[0];
    if (models.length === 1) {
      constraints.model = rows[0].model;
      constraints.modelDisplayName = rows[0].modelDisplayName;
    }
  }
  const ambiguous: CatalogueDimension | undefined = modelNamed && models.length > 1 ? 'model'
    : intent.playerType !== undefined && players.length > 1 ? 'player'
    : namedEffort && new Set(rows.map((row) => row.effort)).size > 1 ? 'effort' : undefined;
  if (ambiguous) {
    const options = new Map<string, CatalogueOption>();
    for (const row of rows) {
      const playerLabel = row.playerType === 'antigravity' ? 'AntiGravity' : row.playerType;
      const label = [playerLabel.replace(/^\w/, (letter) => letter.toUpperCase()), modelNamed ? row.modelDisplayName : undefined,
        namedEffort ? row.effort?.replace(/^\w/, (letter) => letter.toUpperCase()) : undefined].filter(Boolean).join(' · ');
      const option = { playerType: row.playerType, ...(modelNamed ? { model: row.model, modelDisplayName: row.modelDisplayName } : {}),
        ...(namedEffort ? { effort: row.effort } : {}), label };
      options.set(JSON.stringify([option.playerType, option.model, option.effort]), option);
    }
    return stop(ambiguous, ambiguous === 'model' ? intent.model! : ambiguous === 'player' ? intent.playerType! : intent.effort!,
      'ambiguous', options.size <= 4 ? [...options.values()] : undefined);
  }
  if (!rows.length) {
    return stop('player', intent.playerType ?? intent.playerInstanceId ?? '', 'unknown');
  }
  return { state: 'resolved', candidates: rows, constraints };
}

export interface PlayerRegistryEntry {
  readonly playerType: string;
  readonly aliases: readonly string[];
}

export const PLAYER_REGISTRY: readonly PlayerRegistryEntry[] = [
  { playerType: 'antigravity', aliases: ['antigravity', 'ag', 'agy', 'anti gravity'] },
  { playerType: 'claude', aliases: ['claude', 'anthropic'] },
  { playerType: 'codex', aliases: ['codex', 'openai'] },
  { playerType: 'scout', aliases: ['scout', 'scout formation'] },
  { playerType: 'terminal', aliases: ['terminal'] }
];

/** Bounded edit distance (Damerau-Levenshtein). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i += 1) matrix[i] = [i];
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
        if (i > 1 && j > 1 && b.charAt(i - 1) === a.charAt(j - 2) && b.charAt(i - 2) === a.charAt(j - 1)) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
    }
  }
  return matrix[b.length][a.length];
}

/** Check if a word matches any alias exactly, or with edit distance 1 for length >= 4. */
export function matchAliasWithTypo(word: string, knownAliases: readonly string[]): string | undefined {
  const normalizedWord = word.toLowerCase().trim();
  // Exact match
  if (knownAliases.includes(normalizedWord)) return normalizedWord;
  // Bounded typo tolerance only for words with length >= 4
  if (normalizedWord.length < 4) return undefined;
  const close = knownAliases.filter((alias) => {
    if (Math.abs(alias.length - normalizedWord.length) > 1) return false;
    return editDistance(normalizedWord, alias) === 1;
  });
  if (close.length === 1) return close[0];
  return undefined; // ambiguous if more than one, or none
}

/** One recognition front door. Collection, catalogue intersection and authority live together. */
export function resolveSmartRouteConstraints(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  return input.prompt?.trim() ? recognizeRouteConstraints(input) : undefined;
}
