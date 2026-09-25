/**
 * SMART AUTO RECOGNITION RESOLVER
 *
 * First-class natural language recognition for AUTO mode:
 * PLAYER / MODEL / REASONING
 *
 * The first line of Prompt Payload is a high-authority intent surface.
 * Understands human inputs like:
 *   Gemini
 *   Gemini Medium / Gemini med / Gemini MED
 *   Sonnet Medium / Sonnett med
 *   Opus High / Opus med
 *   AntiGravity Gemini Medium
 *   Claude Sonnet med
 *   Codex Medium
 *   Gemeni med
 *
 * Precedence:
 * 1. Structured fields (AGENT:, MODEL:, REASONING:) - highest authority
 * 2. Confident first-line natural intent
 * 3. Existing explicit directives / natural imperatives (Scout directive, Use X...)
 * 4. Existing semantic AUTO routing fallback
 */

import type { PlayerRoutingCapability, RouteConstraints, ModelDescriptor } from '../capability-types';
import type { InstanceLedgerEntry } from './work-ledger';
import { recognizeRouteConstraints, recognizeScoutDirective } from './route-constraints';
import { normalizeEffortValue, isChoiceOrNegation } from './route-normalization';

export interface PlayerRegistryEntry {
  readonly playerType: string;
  readonly aliases: readonly string[];
  readonly defaultFamily?: string;
}

export interface ModelFamilyRegistryEntry {
  readonly family: string;
  readonly playerType: string;
  readonly aliases: readonly string[];
  readonly defaultModelMatch?: RegExp;
}

export const PLAYER_REGISTRY: readonly PlayerRegistryEntry[] = [
  { playerType: 'antigravity', aliases: ['antigravity', 'ag', 'agy', 'anti gravity'], defaultFamily: 'gemini' },
  { playerType: 'claude', aliases: ['claude', 'anthropic'], defaultFamily: 'sonnet' },
  { playerType: 'codex', aliases: ['codex', 'openai'], defaultFamily: 'gpt' },
  { playerType: 'scout', aliases: ['scout', 'scout formation'] },
  { playerType: 'terminal', aliases: ['terminal'] }
];

export const MODEL_FAMILY_REGISTRY: readonly ModelFamilyRegistryEntry[] = [
  { family: 'gemini', playerType: 'antigravity', aliases: ['gemini', 'gemeni'], defaultModelMatch: /flash/i },
  { family: 'flash', playerType: 'antigravity', aliases: ['flash'], defaultModelMatch: /flash/i },
  { family: 'pro', playerType: 'antigravity', aliases: ['pro'], defaultModelMatch: /pro/i },
  { family: 'sonnet', playerType: 'claude', aliases: ['sonnet', 'sonnett'], defaultModelMatch: /sonnet/i },
  { family: 'opus', playerType: 'claude', aliases: ['opus'], defaultModelMatch: /opus/i },
  { family: 'haiku', playerType: 'claude', aliases: ['haiku'], defaultModelMatch: /haiku/i },
  { family: 'gpt', playerType: 'codex', aliases: ['gpt', 'sol', 'astra'], defaultModelMatch: /sol/i },
  { family: 'sol', playerType: 'codex', aliases: ['sol'], defaultModelMatch: /sol/i },
  { family: 'astra', playerType: 'codex', aliases: ['astra'], defaultModelMatch: /astra/i }
];

export const REASONING_ALIASES: Readonly<Record<string, readonly string[]>> = {
  low: ['low'],
  medium: ['medium', 'med'],
  high: ['high'],
  xhigh: ['xhigh', 'extra high', 'x-high'],
  max: ['max', 'maximum', 'ultra']
};

export const ROUTING_CONNECTORS = new Set([
  'with', 'at', 'on', 'using', 'use', 'level', 'effort', 'reasoning',
  'thinking', 'model', 'player', 'agent', 'mode', 'setting', 'please', 'for', 'in'
]);

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

function extractFirstLine(prompt: string): string | undefined {
  const lines = prompt.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index >= lines.length) return undefined;
  const first = lines[index].trim();
  if (/^```/.test(first) || /^>/.test(first)) return undefined;
  let line = first;
  line = line.replace(/^#{1,6}\s+/, '');
  line = line.replace(/^(?:[-+*]|\d+[.)])\s+/, '');
  line = line.replace(/^(\*{1,2}|_{1,2}|`)(.*)\1$/, '$2');
  line = line.replace(/[,.]\s*$/, '').trim();
  return line;
}

function hasStructuredFields(prompt: string): boolean {
  const lines = prompt.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(?:`[^`]+`|["“][^"”]+["”]|'[^']+')$/.test(line)) continue;
    const colon = line.indexOf(':');
    if (colon > 0) {
      const label = line.slice(0, colon).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      if (['agent', 'player', 'model', 'effort', 'reasoning', 'thinking'].some((k) => label === k || label.startsWith(`${k} `) || label.endsWith(` ${k}`))) {
        return true;
      }
    }
  }
  return false;
}

interface ParsedFirstLine {
  readonly playerType?: string;
  readonly playerInstanceId?: string;
  readonly modelId?: string;
  readonly modelDisplayName?: string;
  readonly effort?: string;
}

/**
 * Tries to parse the first line as a natural route command.
 * Returns undefined if the line contains non-routing words, choices, negations,
 * or lacks confident routing intent.
 */
export function trySmartNaturalRoute(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  const firstLine = extractFirstLine(input.prompt);
  if (!firstLine || !firstLine.trim()) return undefined;

  // Never fuzzy-route choices ("Claude or Codex") or negations ("Not Claude")
  if (isChoiceOrNegation(firstLine)) return undefined;

  // Normalize separators like dashes, dots, commas, colons
  const cleaned = firstLine
    .replace(/\s*[-—–:]\s*/g, ' ')
    .replace(/[()[\]{},;]/g, ' ');
  let tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;

  // Collapse known adjacent multi-word pairs
  const collapsed: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (i + 1 < tokens.length) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      if (pair === 'anti gravity') {
        collapsed.push('antigravity');
        i += 2;
        continue;
      }
      if (pair === 'scout formation') {
        collapsed.push('scout');
        i += 2;
        continue;
      }
      if (pair === 'extra high' || pair === 'x high') {
        collapsed.push('xhigh');
        i += 2;
        continue;
      }
    }
    collapsed.push(tokens[i]);
    i += 1;
  }
  tokens = collapsed;

  let matchedPlayerType: string | undefined;
  let matchedPlayerInstanceId: string | undefined;
  let matchedFamily: string | undefined;
  let matchedModelId: string | undefined;
  let matchedModelDisplayName: string | undefined;
  let matchedEffort: string | undefined;

  const unconsumed: string[] = [];

  // Check candidate displays & names for instance resolution (e.g. "Claude 1", "Codex 2")
  const instanceAliases: { text: string; playerType: string; instanceId: string }[] = [];
  for (const [instanceId, display] of input.names ?? []) {
    const candidate = input.candidates.find((c) => c.instanceId === instanceId)
      ?? input.ledger?.find((e) => e.playerInstanceId === instanceId);
    if (candidate?.playerType) {
      instanceAliases.push({ text: display.toLowerCase(), playerType: candidate.playerType, instanceId });
    }
  }

  let matchedVersionNumber: string | undefined;

  // Scan tokens
  let tokenIndex = 0;
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex];

    // 1. Is it a routing connector / filler word?
    if (ROUTING_CONNECTORS.has(token)) {
      tokenIndex += 1;
      continue;
    }

    // 2. Check for effort
    const effortCandidate = normalizeEffortValue(token)
      ?? (token === 'med' ? 'medium' : undefined);
    if (effortCandidate) {
      if (matchedEffort && matchedEffort !== effortCandidate) return undefined; // multiple conflicting efforts
      matchedEffort = effortCandidate;
      tokenIndex += 1;
      continue;
    }

    // 3. Check for multi-word instance name match (e.g. "claude 1")
    if (tokenIndex + 1 < tokens.length) {
      const twoTokens = `${token} ${tokens[tokenIndex + 1]}`;
      const matchedInstance = instanceAliases.find((inst) => inst.text === twoTokens);
      if (matchedInstance) {
        matchedPlayerType = matchedInstance.playerType;
        matchedPlayerInstanceId = matchedInstance.instanceId;
        tokenIndex += 2;
        continue;
      }
    }

    // 4. Check for player match in PLAYER_REGISTRY
    let playerFound = false;
    for (const playerEntry of PLAYER_REGISTRY) {
      const match = matchAliasWithTypo(token, playerEntry.aliases);
      if (match) {
        if (matchedPlayerType && matchedPlayerType !== playerEntry.playerType) return undefined; // conflicting players
        matchedPlayerType = playerEntry.playerType;
        playerFound = true;
        break;
      }
    }
    if (playerFound) {
      // Check if following token is an instance number (e.g. "Claude 1")
      if (tokenIndex + 1 < tokens.length && /^\d+$/.test(tokens[tokenIndex + 1])) {
        const nextNum = tokens[tokenIndex + 1];
        const inst = instanceAliases.find((item) => item.playerType === matchedPlayerType && item.text.endsWith(` ${nextNum}`));
        if (inst) {
          matchedPlayerInstanceId = inst.instanceId;
          tokenIndex += 2;
          continue;
        }
      }
      tokenIndex += 1;
      continue;
    }

    // 5. Check for model family match in MODEL_FAMILY_REGISTRY
    let familyFound = false;
    for (const familyEntry of MODEL_FAMILY_REGISTRY) {
      const match = matchAliasWithTypo(token, familyEntry.aliases);
      if (match) {
        if (matchedFamily && matchedFamily !== familyEntry.family) {
          // Both "gemini" and "flash" or "gpt" and "sol" are compatible sub-families
          if (familyEntry.playerType === 'antigravity' && (matchedFamily === 'gemini' || matchedFamily === 'flash' || matchedFamily === 'pro')) {
            matchedFamily = familyEntry.family; // e.g. flash/pro refines gemini
          } else if (familyEntry.playerType === 'codex' && (matchedFamily === 'gpt' || matchedFamily === 'sol' || matchedFamily === 'astra')) {
            matchedFamily = familyEntry.family;
          } else {
            return undefined; // conflicting families
          }
        } else {
          matchedFamily = familyEntry.family;
        }
        if (!matchedPlayerType) {
          matchedPlayerType = familyEntry.playerType;
        }
        familyFound = true;
        break;
      }
    }
    if (familyFound) {
      tokenIndex += 1;
      continue;
    }

    // 6. Check for exact model IDs or display names from candidates
    let candidateModelFound = false;
    for (const candidate of input.candidates) {
      for (const model of candidate.capability.models) {
        const modelTokens = `${model.id} ${model.displayName}`.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(/\s+/);
        if (modelTokens.includes(token)) {
          if (!matchedModelId) {
            matchedModelId = model.id;
            matchedModelDisplayName = model.displayName;
          }
          if (!matchedPlayerType) {
            matchedPlayerType = candidate.playerType;
          }
          candidateModelFound = true;
          break;
        }
      }
      if (candidateModelFound) break;
    }
    if (candidateModelFound) {
      tokenIndex += 1;
      continue;
    }

    // 7. Is it a version number (e.g. "3.8", "3.1", "5", "6")?
    if (/^\d+(\.\d+)?$/.test(token)) {
      matchedVersionNumber = token;
      tokenIndex += 1;
      continue;
    }

    // Unrecognized word -> descriptive prose
    unconsumed.push(token);
    tokenIndex += 1;
  }

  // If ANY token was unconsumed, this line is descriptive prose or ordinary task content
  if (unconsumed.length > 0) {
    return undefined;
  }

  // If nothing was recognized at all, return undefined
  if (!matchedPlayerType && !matchedFamily && !matchedModelId && !matchedEffort) {
    return undefined;
  }

  // If only reasoning was specified (e.g. "Medium", "med"):
  // Partial disclosure: update only reasoning, allow AUTO routing to fill player/model
  if (!matchedPlayerType && !matchedFamily && !matchedModelId && matchedEffort) {
    return {
      source: 'play',
      effort: matchedEffort,
      recognized: ['effort', 'route-shorthand']
    };
  }

  // Infer player from family if not set
  if (!matchedPlayerType && matchedFamily) {
    const familyEntry = MODEL_FAMILY_REGISTRY.find((e) => e.family === matchedFamily);
    if (familyEntry) matchedPlayerType = familyEntry.playerType;
  }

  let unresolved: { dimension: 'player' | 'model' | 'effort'; rawText: string }[] | undefined;

  // Candidate model refinement
  if (matchedPlayerType) {
    const candidate = input.candidates.find((c) => c.playerType === matchedPlayerType
      && (!matchedPlayerInstanceId || c.instanceId === matchedPlayerInstanceId));
    if (candidate && candidate.capability.models.length > 0) {
      const models = candidate.capability.models;

      if (!matchedModelId && matchedFamily) {
        // Find models matching this family or word
        let matchingFamily = models.filter((m) => {
          const text = `${m.id} ${m.displayName}`.toLowerCase();
          return text.includes(matchedFamily!);
        });
        if (matchingFamily.length === 0) {
          // Try family default regex
          const familyEntry = MODEL_FAMILY_REGISTRY.find((e) => e.family === matchedFamily);
          if (familyEntry?.defaultModelMatch) {
            matchingFamily = models.filter((m) => familyEntry.defaultModelMatch!.test(`${m.id} ${m.displayName}`));
          }
        }
        if (matchingFamily.length === 0) {
          matchingFamily = [...models];
        }

        // If a specific sub-family/model word was specified (like "flash", "pro", "sol", "astra")
        // and several catalog models match without a version number, do not guess: stop as unresolved.
        if (matchedFamily !== 'gemini' && matchedFamily !== 'gpt') {
          if (matchedVersionNumber) {
            matchingFamily = matchingFamily.filter((m) => `${m.id} ${m.displayName}`.includes(matchedVersionNumber!));
          }
          if (matchingFamily.length > 1) {
            unresolved = [{ dimension: 'model', rawText: matchedFamily }];
          } else if (matchingFamily.length === 1) {
            matchedModelId = matchingFamily[0].id;
            matchedModelDisplayName = matchingFamily[0].displayName;
          }
        } else {
          // Broad family like "gemini": pick the currently appropriate/default model
          if (matchedVersionNumber) {
            const versionMatched = matchingFamily.filter((m) => `${m.id} ${m.displayName}`.includes(matchedVersionNumber!));
            if (versionMatched.length > 0) matchingFamily = versionMatched;
          }
          // If effort is specified, prioritize models supporting that effort
          let effortMatched = matchingFamily;
          if (matchedEffort) {
            const withEffort = matchingFamily.filter((m) =>
              m.supportedEfforts.map((e) => e.toLowerCase()).includes(matchedEffort!)
            );
            if (withEffort.length > 0) {
              effortMatched = withEffort;
            }
          }

          // Pick preferred: isDefault, or flash for antigravity, or first
          const chosen = effortMatched.find((m) => m.isDefault)
            ?? effortMatched.find((m) => /flash/i.test(m.id))
            ?? effortMatched[0];
          if (chosen) {
            matchedModelId = chosen.id;
            matchedModelDisplayName = chosen.displayName;
          }
        }
      } else if (!matchedModelId && matchedEffort) {
        // Player + Effort specified (e.g. "Codex Medium"): pick model supporting effort
        const withEffort = models.filter((m) =>
          m.supportedEfforts.map((e) => e.toLowerCase()).includes(matchedEffort!)
        );
        const chosen = withEffort.find((m) => m.isDefault) ?? withEffort[0];
        if (chosen) {
          matchedModelId = chosen.id;
          matchedModelDisplayName = chosen.displayName;
        }
      } else if (!matchedModelId && !matchedEffort) {
        // Player only (e.g. "Gemini" as AntiGravity default)
        const chosen = models.find((m) => m.isDefault)
          ?? models.find((m) => /flash/i.test(m.id))
          ?? models[0];
        if (chosen) {
          matchedModelId = chosen.id;
          matchedModelDisplayName = chosen.displayName;
        }
      }
    }
  }

  const recognized: RouteConstraints['recognized'][number][] = ['route-shorthand'];
  if (matchedPlayerInstanceId) recognized.push('instance');
  else if (matchedPlayerType) recognized.push('player');
  if (matchedModelId) recognized.push('model');
  if (matchedEffort) recognized.push('effort');

  return {
    source: 'play',
    playerType: matchedPlayerType,
    playerInstanceId: matchedPlayerInstanceId,
    model: matchedModelId,
    modelDisplayName: matchedModelDisplayName,
    effort: matchedEffort,
    ...(unresolved?.length ? { unresolved } : {}),
    recognized
  };
}

/**
 * Precedence-aware smart route constraints resolver:
 * 1. Structured fields (AGENT:, MODEL:, REASONING:) have highest authority.
 * 2. Scout directive intercept has explicit directive authority.
 * 3. Smart First-Line Natural Intent (Gemini Medium, Sonnett med, Opus High...).
 * 4. Existing catalog-validated route constraints fallback.
 */
export function resolveSmartRouteConstraints(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  const { prompt } = input;
  if (!prompt || !prompt.trim()) return undefined;

  // 1. Structured fields have highest authority (Rule 1)
  if (hasStructuredFields(prompt)) {
    return recognizeRouteConstraints(input);
  }

  // 2. Scout directive intercept has explicit directive authority (Rule 3)
  if (recognizeScoutDirective(prompt)) {
    return recognizeRouteConstraints(input);
  }

  // 3. Confident First-Line Natural Intent (Rule 2)
  const smart = trySmartNaturalRoute(input);
  if (smart) {
    return smart;
  }

  // 4. Fall back to existing catalog-validated route constraints & natural imperatives (Rule 3 & 4)
  return recognizeRouteConstraints(input);
}
