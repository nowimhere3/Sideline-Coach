/**
 * Q2.10E-B — conservative, catalog-validated Play-level route constraints.
 *
 * This is deliberately not general NLP. Only an unmistakable opening imperative
 * or a small structured routing field can narrow AUTO, and every recognized name
 * must already exist in this Game's Player/model/effort truth.
 */

import type { PlayerRoutingCapability, RouteConstraints, RouteOption } from '../capability-types';
import { resolveCatalogueRoute, PLAYER_REGISTRY, matchAliasWithTypo, editDistance, type CatalogueRouteIntent, type CatalogueRouteResolution } from './smart-route-resolver';
import type { InstanceLedgerEntry } from './work-ledger';
import { normalizeFixCause, type FixCause } from './follow-up-evidence';
import {
  ROUTE_CHOICE, ROUTE_COMPARISON, identityTokens, isChoiceOrNegation, isNumberToken, leadingIdentity, liveVersionRuns, normalizeEffortValue,
  normalizeSpokenVersions, resolveRouteIdentity, routeTokenList, type IdentityAlias
} from './route-normalization';

interface Alias<T> { readonly text: string; readonly value: T }

type RouteFieldDimension = 'player' | 'model' | 'effort';

interface RouteFieldAlias {
  readonly text: string;
  readonly dimension: RouteFieldDimension;
}

interface StructuredRouteField {
  readonly dimension: RouteFieldDimension;
  readonly value: string;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function title(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\s+/g, ' ').trim();
}

function aliasesAtStart<T>(text: string, aliases: readonly Alias<T>[]): Alias<T> | undefined {
  const source = normalized(text);
  return [...aliases]
    .filter((alias) => source === normalized(alias.text) || source.startsWith(`${normalized(alias.text)} `))
    .sort((left, right) => normalized(right.text).length - normalized(left.text).length)[0];
}

function uniqueAliases<T>(aliases: readonly Alias<T>[]): Alias<T>[] {
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    const key = normalized(alias.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ROUTE_FIELD_ALIASES: readonly RouteFieldAlias[] = [
  ...[
    'agent', 'player', 'worker', 'implementation agent', 'target player', 'target agent',
    'assigned agent', 'executor', 'route to', 'send to'
  ].map((text) => ({ text, dimension: 'player' as const })),
  ...['model', 'target model', 'model to use'].map((text) => ({ text, dimension: 'model' as const })),
  ...[
    'effort', 'reasoning', 'reasoning effort', 'thinking', 'thinking effort',
    'thinking / effort', 'thinking / reasoning effort', 'reasoning level', 'thinking level'
  ].map((text) => ({ text, dimension: 'effort' as const }))
];

const NORMALIZED_ROUTE_FIELD_ALIASES = uniqueAliases(
  ROUTE_FIELD_ALIASES.map((alias) => ({ text: alias.text, value: alias }))
).map((alias) => ({ text: normalized(alias.text), dimension: alias.value.dimension }));

/**
 * A single label edit includes an insertion, deletion, replacement, or adjacent
 * transposition. It is intentionally not used for Player/model/effort values.
 */
function oneLabelEditApart(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    return differences.length === 2
      && differences[1] === differences[0] + 1
      && left[differences[0]] === right[differences[1]]
      && left[differences[1]] === right[differences[0]];
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      longIndex += 1;
    }
  }
  return true;
}

function resolveFieldLabel(rawLabel: string): RouteFieldDimension | undefined {
  const label = normalized(rawLabel);
  const exact = NORMALIZED_ROUTE_FIELD_ALIASES.find((alias) => alias.text === label);
  if (exact) return exact.dimension;
  const nearby = NORMALIZED_ROUTE_FIELD_ALIASES.filter((alias) => oneLabelEditApart(label, alias.text));
  if (nearby.length !== 1) return undefined;
  return nearby[0].dimension;
}

function withoutPresentationPrefix(raw: string): string {
  let line = raw.trim();
  // Heading and list syntax describe presentation, not routing semantics.
  line = line.replace(/^#{1,6}\s+/, '');
  line = line.replace(/^(?:[-+*]|\d+[.)])\s+/, '');
  return line.trim();
}

function structuredRouteField(raw: string): StructuredRouteField | undefined {
  const line = withoutPresentationPrefix(raw);
  if (/^(?:`[^`]+`|["“][^"”]+["”]|'[^']+')$/.test(line)) return undefined;
  const colon = line.indexOf(':');
  if (colon <= 0) return undefined;
  const rawLabel = line.slice(0, colon).trim();
  let value = line.slice(colon + 1).trim();
  const openingEmphasis = /^(\*{1,2}|_{1,2})/.exec(rawLabel)?.[1];
  // In **AGENT:** Codex the marker immediately after the colon closes the label.
  if (openingEmphasis && value.startsWith(openingEmphasis)) value = value.slice(openingEmphasis.length).trim();
  const dimension = resolveFieldLabel(rawLabel);
  return dimension && value ? { dimension, value } : undefined;
}

function unfencedLines(prompt: string): string[] {
  let fenced = false;
  const lines: string[] = [];
  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    // Markdown block quotes commonly contain documentation/examples, not an
    // instruction from the Head Coach in the current Play.
    if (!fenced && line && !/^>/.test(line)) lines.push(line);
  }
  return lines;
}

interface NaturalLine { readonly text: string; readonly index: number }

/** S57.57 Slice 3: only the first ten meaningful lines are natural authority.
 * Metadata and ordinary table rows consume the budget; examples/comments do not.
 * Stop collecting at ten, independently of the fifteen-line structured envelope.
 */
function naturalLines(prompt: string): NaturalLine[] {
  const result: NaturalLine[] = [];
  let fenced = false;
  let comment = false;
  for (const match of prompt.matchAll(/[^\r\n]*(?:\r?\n|$)/g)) {
    let text = match[0].trim();
    if (fenced) { if (/^```/.test(text)) fenced = false; continue; }
    if (comment) {
      const end = text.indexOf('-->');
      if (end < 0) continue;
      text = text.slice(end + 3).trim();
      comment = false;
    }
    text = text.replace(/<!--.*?-->/g, '').trim();
    const start = text.indexOf('<!--');
    if (start >= 0) { comment = true; text = text.slice(0, start).trim(); }
    if (/^```/.test(text)) { fenced = !fenced; continue; }
    if (fenced || !text || /^>/.test(text)
      || /^(?:-{3,}|\*{3,}|_{3,})$/.test(text)
      || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/.test(text)) continue;
    result.push({ text, index: match.index! });
    if (result.length === 10) break;
  }
  return result;
}

/** Presentation that is safe only at the opening, never in later examples. */
function naturalEligible(line: string, position: number): boolean {
  if (structuredRouteField(line) || /^\|/.test(line) || /\|$/.test(line)) return false;
  const bare = withoutPresentationPrefix(line);
  if (bare.includes(':') && !carrierBody(bare)) return false; // Foreign metadata cannot become shorthand or an imperative.
  return position === 1 || !(/^(?:[-+*]|\d+[.)])\s+/.test(line)
    || /^(?:`|["'\u201c\u2018])/.test(bare));
}

function routeLines(prompt: string): string[] {
  const lines = unfencedLines(prompt);
  // Titles, headings, and a short introduction may precede Strategy Board
  // metadata. Fifteen meaningful lines is deliberately large enough for that
  // opening block and small enough not to reinterpret an implementation prompt's
  // later documentation as Head Coach authority.
  return lines.slice(0, 15);
}

function directiveBody(line: string): string | undefined {
  const clauses = line.split(/(?<=[.!?])\s+/);
  for (const clause of clauses) {
    const imperative = /^(?:[-*]\s*)?(?:for\b[^,]{0,120},\s*)?(?:please\s+)?(?:then\s+)?(?:use\s+|give\s+(?:this|it|the play)\s+to\s+|route\s+(?:this|it|the play)\s+to\s+|send\s+(?:(?:this|it|the play)\s+)?to\s+)(.+)$/i.exec(clause);
    if (imperative) return imperative[1].trim();
  }
  const field = structuredRouteField(line);
  return field?.dimension === 'player' ? field.value : undefined;
}

/**
 * R5: the optional `FIX CAUSE:` structured header field (S57.1 §8.4). Read with the same opening-block,
 * fence/quote and presentation-prefix rules as every other envelope field, but it never narrows routing:
 * recognizeRouteConstraints does not see it, so AUTO is unchanged by its presence.
 * `cause` is a canonical S57.1 cause; an unrecognizable value is reported, never guessed.
 */
export function recognizeFixCause(prompt: string): { readonly cause?: FixCause; readonly unresolvedText?: string } | undefined {
  for (const raw of routeLines(prompt)) {
    const line = withoutPresentationPrefix(raw);
    const colon = line.indexOf(':');
    if (colon <= 0 || normalized(line.slice(0, colon).replace(/[*_`]/g, '')) !== 'fix cause') continue;
    const value = line.slice(colon + 1).replace(/^[*_`\s]+/, '').trim();
    if (!value) continue;
    const cause = normalizeFixCause(value);
    return cause ? { cause } : { unresolvedText: value.slice(0, 80) };
  }
  return undefined;
}

type PlayerValue = { playerType: string; playerInstanceId?: string };

/**
 * Every roster/provider-backed name a Player answers to, NOT de-duplicated: a name that belongs to two Player types must
 * stay visibly ambiguous for structured resolution (S56.2) instead of silently keeping whichever came first.
 */
function rawPlayerAliases(
  candidates: readonly PlayerRoutingCapability[],
  ledger: readonly InstanceLedgerEntry[],
  names: ReadonlyMap<string, string> | undefined
): Alias<PlayerValue>[] {
  // Scout remains a known logical routing destination even when disabled or
  // when no Formation receiver is currently eligible. That lets an explicit
  // `PLAYER: Scout` fail truthfully instead of silently falling back to AUTO.
  const aliases: Alias<PlayerValue>[] = [
    { text: 'scout', value: { playerType: 'scout' } },
    // "Scout Formation" is the same logical destination (S56.3 title "SCOUT FORMATION — ...").
    { text: 'scout formation', value: { playerType: 'scout' } }
  ];
  const typeNames = new Map<string, string>();
  for (const candidate of candidates) {
    typeNames.set(candidate.playerType, candidateDisplay(candidate));
    // Provider identity is roster truth too: a Player type can be reached under its provider's name.
    if (/\s+\d+$/.test(candidate.fieldLabel)) aliases.push({ text: candidate.fieldLabel, value: { playerType: candidate.playerType, playerInstanceId: candidate.instanceId } });
    const provider = candidate.capability?.provider;
    if (provider) aliases.push({ text: provider, value: { playerType: candidate.playerType } });
  }
  for (const entry of ledger) if (entry.playerType && !typeNames.has(entry.playerType)) typeNames.set(entry.playerType, title(entry.playerType));
  for (const [playerType, display] of typeNames) {
    aliases.push({ text: playerType, value: { playerType } }, { text: display, value: { playerType } });
  }
  for (const [instanceId, display] of names ?? []) {
    const playerType = candidates.find((candidate) => candidate.instanceId === instanceId)?.playerType
      ?? ledger.find((entry) => entry.playerInstanceId === instanceId)?.playerType;
    // "Use Codex" constrains the type; only an explicit numbered friendly name
    // constrains an exact sibling.
    if (playerType && /\s+\d+$/.test(display)) aliases.push({ text: display, value: { playerType, playerInstanceId: instanceId } });
  }
  return aliases;
}

function playerAliases(
  candidates: readonly PlayerRoutingCapability[],
  ledger: readonly InstanceLedgerEntry[],
  names: ReadonlyMap<string, string> | undefined
): Alias<PlayerValue>[] {
  return uniqueAliases(rawPlayerAliases(candidates, ledger, names));
}

/**
 * S56.2: a structured AGENT/PLAYER value names a Player, so find the one canonical roster/provider identity contained
 * in it. "Claude Code", "Claude Development Stadium" and "OpenAI Codex" resolve; "Claude and Codex", "Not Claude" and a
 * misspelling do not. An instance is chosen only by an exact numbered name; otherwise the Player type.
 */
function resolveStructuredPlayer(value: string, aliases: readonly IdentityAlias<PlayerValue>[]): PlayerValue | undefined {
  const resolution = resolveRouteIdentity(value, aliases, {
    identityKey: (candidate) => candidate.playerType,
    compact: true,
    adjacentNumberIsInstance: true,
    knownTokens: identityTokens(aliases)
  });
  if (!resolution.ok) return undefined;
  const instances = new Set(resolution.matches.map((alias) => alias.value.playerInstanceId).filter((id): id is string => Boolean(id)));
  if (instances.size > 1) return undefined;
  const [playerInstanceId] = instances;
  const playerType = resolution.matches[0].value.playerType;
  return playerInstanceId ? { playerType, playerInstanceId } : { playerType };
}

function rawModelAliases(candidates: readonly PlayerRoutingCapability[]): Alias<{ id: string; displayName: string }>[] {
  const aliases: Alias<{ id: string; displayName: string }>[] = [];
  for (const candidate of candidates) {
    for (const model of candidate.capability.models) {
      aliases.push({ text: model.id, value: { id: model.id, displayName: model.displayName } });
      aliases.push({ text: model.displayName, value: { id: model.id, displayName: model.displayName } });
    }
  }
  return aliases;
}

function modelAliases(candidates: readonly PlayerRoutingCapability[]): Alias<{ id: string; displayName: string }>[] {
  return uniqueAliases(rawModelAliases(candidates));
}

function liveModelVersionRuns(candidates: readonly PlayerRoutingCapability[]): Set<string> {
  return liveVersionRuns(rawModelAliases(candidates).map((alias) => alias.text));
}

/** S57.70: a structured MODEL value spoken as "five point six sol" reads as "5.6 sol" when that version run is live. */
function spokenModelValue(value: string, candidates: readonly PlayerRoutingCapability[]): string {
  if (isChoiceOrNegation(value)) return value;
  const tokens = routeTokenList(value);
  const spoken = normalizeSpokenVersions(tokens, liveModelVersionRuns(candidates));
  return spoken.length === tokens.length && spoken.every((token, index) => token === tokens[index]) ? value : spoken.join(' ');
}

/**
 * S57.70 unified typo rule: Damerau distance 1, a UNIQUE live token, natural line 1 only, both tokens >= 5 chars.
 * Digits, effort words and any word that already is a known live word are never corrected; ambiguity never guesses.
 */
function correctLineOneTypos(
  tokens: readonly string[], candidates: readonly PlayerRoutingCapability[], aliases: readonly IdentityAlias<PlayerValue>[]
): string[] {
  const live = new Set<string>();
  const vocabulary = new Set<string>();
  for (const token of identityTokens(rawModelAliases(candidates))) { live.add(token); vocabulary.add(token); }
  for (const alias of aliases) {
    // Logical destinations (Scout, Terminal) are not catalogue truth and never typo-correct.
    const logical = alias.value.playerType === 'scout' || alias.value.playerType === 'terminal';
    for (const token of routeTokenList(alias.text)) { live.add(token); if (!logical) vocabulary.add(token); }
  }
  return tokens.map((token) => {
    if (token.length < 5 || /\d/.test(token) || live.has(token) || normalizeEffortValue(token) || token === 'ultra') return token;
    const close = [...vocabulary].filter((word) => word.length >= 5 && !/\d/.test(word) && Math.abs(word.length - token.length) <= 1
      && !normalizeEffortValue(word) && editDistance(token, word) === 1);
    return close.length === 1 ? close[0] : token;
  });
}

function candidateDisplay(candidate: PlayerRoutingCapability): string {
  return candidate.fieldLabel.replace(/\s*(?:Â·|·).*$/, '').replace(/\s+\d+$/, '').trim() || title(candidate.playerType);
}

/**
 * S56.0 + S56.2: resolve an EXPLICIT structured MODEL value against the resolved Player's actual catalog. The field
 * already says "this is a model", so the value is scanned for the one catalog model/family identity it contains:
 *   - redundant Player/provider/product words are tolerated ("Claude Sonnet", "Claude Code Sonnet 5", "Sonnet Model");
 *   - version decoration is tolerated ONLY around a digit-free family alias (Sonnet 5 -> sonnet); a digit-bearing id
 *     ("GPT-5.6 Sol") never accepts a stray number ("GPT-5.6 Sol 2");
 *   - none, several ("Sonnet or Opus", "Claude Opus Sonnet"), a negation, or a leftover word one typo from another
 *     known identity is unresolved. No spelling is ever corrected ("Sonet 5", "GPT-5.6 Soil").
 */
function resolveExplicitModel(
  rawText: string,
  candidates: readonly PlayerRoutingCapability[]
): { id: string; displayName: string } | undefined {
  const text = spokenModelValue(rawText, candidates);
  const aliases = rawModelAliases(candidates);
  const known = identityTokens(aliases);
  for (const candidate of candidates) {
    for (const name of [candidate.playerType, candidate.capability.provider, candidateDisplay(candidate)]) {
      for (const token of normalized(name ?? '').split(' ')) if (token) known.add(token);
    }
  }
  const resolution = resolveRouteIdentity(text, aliases, { identityKey: (model) => model.id, versionDecoration: true, knownTokens: known });
  return resolution.ok ? resolution.matches[0].value : undefined;
}

/**
 * S56.3 opening shorthand/control-title grammar is retained. S57.57 Slice 2
 * replaces source precedence with live-catalogue statement intersection.
 * Natural components use the bounded meaningful-line window. Carrier grammar
 * and the unified typo rule remain later slices.
 */
interface OpeningRoute {
  readonly kind: 'shorthand' | 'control-title';
  readonly intent: CatalogueRouteIntent;
  readonly matched: string;
  readonly executionPrompt?: string;
}

const MAX_ROUTE_CALL_TOKENS = 8;
const LABEL_NOUNS = new Set(['priority', 'severity', 'risk', 'impact', 'urgency', 'confidence', 'complexity', 'status', 'importance', 'level']);

function lexicalEffort(text: string, candidates: readonly PlayerRoutingCapability[]): string | undefined {
  const value = normalizeEffortValue(text);
  if (value) return value;
  const word = normalized(text);
  return word === 'ultra' || candidates.some((seat) => seat.capability.models.some((model) =>
    model.supportedEfforts.some((effort) => normalized(effort) === word))) ? word : undefined;
}

/** Complete component statements only. No carrier or speech expansion. */
function parseRouteCall(
  text: string,
  candidates: readonly PlayerRoutingCapability[],
  aliases: readonly IdentityAlias<PlayerValue>[],
  allowBarePlayer: boolean,
  lineOneTypos = false
): CatalogueRouteIntent | undefined {
  if (isChoiceOrNegation(text)) return undefined;
  let tokens = routeTokenList(text);
  if (!tokens.length || tokens.length > MAX_ROUTE_CALL_TOKENS) return undefined;
  // Speech first (live-gated complete version runs), then the line-1-only typo rule. Distinct mechanisms.
  tokens = normalizeSpokenVersions(tokens, liveModelVersionRuns(candidates));
  if (lineOneTypos) tokens = correctLineOneTypos(tokens, candidates, aliases);
  const lead = leadingIdentity(tokens, aliases, true);
  let player: PlayerValue | undefined;
  if (lead) {
    const types = new Set(lead.aliases.map((alias) => alias.value.playerType));
    const instances = new Set(lead.aliases.map((alias) => alias.value.playerInstanceId).filter(Boolean));
    if (types.size !== 1 || instances.size > 1) return undefined;
    player = lead.aliases[0].value;
  }
  let rest = tokens.slice(lead?.length ?? 0);
  if (['on', 'with', 'at', 'using'].includes(rest[0])) rest = rest.slice(1);
  if (!rest.length) return allowBarePlayer && player ? player : undefined;
  if (player?.playerType === 'scout' || player?.playerType === 'terminal') return undefined;
  let unknown: CatalogueRouteIntent | undefined;
  for (let length = Math.min(rest.length, 5); length >= 0; length -= 1) {
    const words = rest.slice(0, length);
    const tail = rest.slice(length).join(' ');
    const effort = tail ? lexicalEffort(tail, candidates) : undefined;
    if (tail && !effort) continue;
    if (!words.length) return effort ? { ...player, effort } : undefined;
    const model = words.join(' ');
    const result = resolveCatalogueRoute({ ...player, model, ...(effort ? { effort } : {}) }, candidates);
    if (!result.constraints.unresolved?.some((problem) => problem.reason === 'unknown')) return { ...player, model, ...(effort ? { effort } : {}) };
    // No tuple when a known Player is off field: preserve its explicit components
    // so availability, rather than an invented replacement, owns the stop.
    if (player && !candidates.some((seat) => seat.playerType === player!.playerType)) {
      if (words.length === 1 && !words.some(isNumberToken)) unknown = { ...player, model, ...(effort ? { effort } : {}) };
    }
    const known = identityTokens(rawModelAliases(candidates));
    const nearMiss = words.some((word) => word.length >= 4 && [...known].some((alias) => matchAliasWithTypo(word, [alias]) && word !== alias));
    const severalModels = words.filter((word) => known.has(word) && !/^\d+$/.test(word)).length > 1
      && !words.some(isNumberToken);
    if (!nearMiss && !severalModels && !LABEL_NOUNS.has(words[0])
      && words.length <= 2 && !words.every(isNumberToken)
      && (effort || (player && words.length === 1))) unknown = { ...player, model, ...(effort ? { effort } : {}) };
    // Known model token with an unmatched version is route-shaped, never prose.
    if (!nearMiss && effort && words.some(isNumberToken) && words.some((word) => known.has(word) && !/^\d+$/.test(word)))
      unknown = { ...player, model, effort };
  }
  return unknown;
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Opening shorthand/control-title grammar, supplied the first meaningful line.
 * Later eligible component statements are collected separately, without title or typo expansion.
 */
function recognizeOpeningRoute(
  prompt: string,
  candidates: readonly PlayerRoutingCapability[],
  playerAliasList: readonly IdentityAlias<PlayerValue>[]
): OpeningRoute | undefined {
  const lines = prompt.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index >= lines.length) return undefined;
  const first = lines[index].trim();
  if (/^```/.test(first) || /^>/.test(first)) return undefined;
  const line = withoutPresentationPrefix(first);
  const rest = lines.slice(index + 1);

  if (carrierBody(line)) return undefined;
  const shorthand = parseRouteCall(line, candidates, playerAliasList, false, true);
  if (shorthand) {
    const body = rest.join('\n').trim();
    return { kind: 'shorthand', intent: shorthand, matched: line, ...(body ? { executionPrompt: capitalizeFirst(body) } : {}) };
  }

  const separator = /\s+[-–—]\s+/.exec(line);
  if (!separator) return undefined;
  const region = line.slice(0, separator.index);
  // Control-shaped means ALL CAPS or a complete route with explicit effort.
  // "Claude Sonnet — Adapter Problems" is an ordinary descriptive heading.
  const title = parseRouteCall(region, candidates, playerAliasList, true, true);
  if (!title || !(title.model || title.playerType) || (!/[A-Za-z]/.test(region) || /[a-z]/.test(region)) && !(title.effort && (title.model || title.playerType))) return undefined;
  const tail = line.slice(separator.index + separator[0].length).replace(/^(?:\*\*|__|\*|_|`)+/, '');
  const body = [tail, ...rest].join('\n').trim();
  return {
    kind: 'control-title',
    intent: title,
    matched: line.slice(0, separator.index + separator[0].length).trim(),
    ...(body ? { executionPrompt: capitalizeFirst(body) } : {})
  };
}

export interface ScoutDirective {
  /** The recognized control text, e.g. "Scout this play,". Never sent to Scout as objective. */
  readonly matched: string;
  /** The remaining objective, when the Play has one. Absent means "use the original Play as-is". */
  readonly executionPrompt?: string;
}

/**
 * S57.73: the same logical destination named in other bounded human shapes. Case and plurality (Scout/Scouts) are
 * lexical decoration. The control title is ALL CAPS and limited to a closed noun set, so a heading such as
 * "SCOUT REPORT SUMMARY" or prose such as "Review the Scout report" stays ordinary content.
 */
const SCOUT_TITLE = /^(\*\*|__|\*|_|`)?(SCOUTS?\s+(?:RECON|RECONNAISSANCE|MISSION|SWEEP))(?![A-Za-z0-9'’])/;
const SCOUT_CARRIER = /^()((?:(?:please|kindly)\s+)?(?:(?:send|route|give|hand|pass|dispatch|assign)\s+(?:(?:this play|the play|this one|this|it)\s+)?(?:off\s+)?to\s+(?:the\s+)?scouts?|(?:i would like|i'd like|id like|i want)\s+to\s+send\s+(?:(?:this play|the play|this one|this|it)\s+to\s+(?:the\s+)?scouts?|(?:some\s+|the\s+)?scouts?)|run\s+(?:the\s+)?scouts?\s+(?:on|over|against)\s+(?:this play|the play|this one|this|it)))(?![A-Za-z0-9'’])/i;
const SCOUT_HEAD = /^(\*\*|__|\*|_|`)?scouts?(?:\s+(this(?:\s+play)?|needed))?(?![A-Za-z0-9'’])/i;

/**
 * BREADCRUMB SCOUT-DIRECTIVE-INTERCEPT (S56.1)
 * WAS:  Scout could be recommended by AUTO intelligence and selected through structured routing, but natural
 *       opening commands such as "Scout this play" could remain ordinary prose and fall through into
 *       Claude/Codex task classification (staged as e.g. Claude · Opus · High).
 * IS:   An unmistakable opening Scout directive is a control-plane command. It becomes an explicit `scout` Player
 *       constraint before ordinary task classification, so the existing explicit-route path owns availability
 *       (Scout unavailable/busy is a truthful stop, never a substitution) and precedence (explicit human routing beats
 *       Terminal, AUTO Scout recommendation and task/provider routing). Descriptive references to Scout/Scouts stay
 *       Play content.
 * GRAMMAR (deterministic, no NLP, no fuzzy spelling): the FIRST non-blank line of the Play only (a fenced or quoted
 *       first line is never a directive; heading/list markers and bold/italic/backtick emphasis around the phrase
 *       are presentation), case-insensitive, then
 *         HEAD = `scout` | `scout this` | `scout this play` | `scout needed`
 *         [ `before <clause>` up to . ! ? : ; or end of line  -- only after `this` / `this play` ]
 *         then end of line, or a separator: `:` `,` `;` ` - `/` — `, or `.` `!` (not after bare `scout`).
 *       No separator means no directive ("Scout this play support was added" stays prose; so do `Scouts ...`,
 *       `Scout's ...`, `Scout found ...`). A structured Player field or a natural "Use X" imperative already in the
 *       header outranks it.
 * WHY:  A mass-adoption product cannot rely on every Dad/User knowing exact machine syntax. Natural, obvious coaching
 *       language must translate reliably into canonical routing without becoming fuzzy whole-prompt NLP.
 * WILL BE: The same control/play separation generalizes into a canonical ingestion layer
 *       (originalPrompt / routeDirective / executionPrompt) so "Use Claude Sonnet 5 Medium to implement this" or
 *       "Scout this play before implementation" normalize into routing control plus clean execution content. Today
 *       only the Scout directive produces an executionPrompt. Future Intelligent AUTO, AI Health, Player Scorecards,
 *       CONSERVE, task-fit routing and scheduling remain separate policy layers.
 * CANONICAL ROUTING ENVELOPE (S56.0) + SCOUT DIRECTIVE INTERCEPT (S56.1) = early proof of that normalization layer.
 */
export function recognizeScoutDirective(prompt: string): ScoutDirective | undefined {
  const lines = prompt.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (index >= lines.length) return undefined;
  const first = lines[index].trim();
  if (/^```/.test(first) || /^>/.test(first)) return undefined;
  const line = withoutPresentationPrefix(first);
  // Each shape is tried in turn: a plain "SCOUT" head that fails on its tail must not mask the ALL-CAPS title.
  for (const pattern of [SCOUT_HEAD, SCOUT_TITLE, SCOUT_CARRIER]) {
    const head = pattern.exec(line);
    if (!head) continue;
    const marker = head[1];
    const phrase = head[2]?.toLowerCase();
    let position = head[0].length;
    if (phrase?.startsWith('this')) {
      const before = /^\s+before\b[^.!?:;\n]*/i.exec(line.slice(position));
      if (before) position += before[0].length;
    }
    let tail = line.slice(position);
    if (marker && tail.startsWith(marker)) {
      tail = tail.slice(marker.length);
      position += marker.length;
    }
    let objective: string;
    const separator = /^\s*[:,;]\s*/.exec(tail)
      ?? (phrase ? /^\s*[.!]\s*/.exec(tail) : undefined)
      ?? /^\s+[-–—]\s+/.exec(tail);
    if (separator) {
      objective = tail.slice(separator[0].length);
      position += separator[0].length;
      if (marker && objective.startsWith(marker)) objective = objective.slice(marker.length);
    } else if (tail.trim() === '') {
      objective = '';
    } else {
      continue;
    }
    const body = [objective, ...lines.slice(index + 1)].join('\n').trim();
    const executionPrompt = body ? body.charAt(0).toUpperCase() + body.slice(1) : undefined;
    return { matched: line.slice(0, position).trim(), ...(executionPrompt ? { executionPrompt } : {}) };
  }
  return undefined;
}

/** S56.0/S56.2 structured values remain explicit: unknown is a stop, never absence. */
interface RouteStatement {
  readonly intent: CatalogueRouteIntent;
  readonly source: string;
  readonly unresolved?: RouteConstraints['unresolved'];
  readonly rawEffort?: string;
  readonly rawPlayer?: string;
}

// Closed lexical grammar. Models, versions, owners and supported efforts remain live.
const COURTESY = /^(?:(?:please|kindly|can you|could you|then)\s+|for\b[^,]{0,120},\s*)/i;
const CARRIER = /^(?:(?:send|route|give|dispatch|assign|hand|pass)\s+(?:(?:this play|the play|this one|this|it)\s+)?(?:off\s+)?to\s+|run\s+(?:(?:this play|the play|this one|this|it)\s+)?(?:on|with|using|through|at)\s+|use\s+|(?:i would like|i'd like|id like|i want)\s+(?:this play|the play|this one|this|it)\s+(?:to go to|to run on|to be sent to|to be routed to|to be handled by|on|to)\s+)/i;

function carrierBody(raw: string): string | undefined {
  const line = raw.trim().replace(/^(?:\*{1,2}|_{1,2}|`|["'\u201c\u2018])+|(?:\*{1,2}|_{1,2}|`|["'\u201d\u2019])+$/g, '').replace(COURTESY, '');
  const head = CARRIER.exec(line);
  if (head) return line.slice(head[0].length).trim();
  // Approved bounded delegation: the ending is mandatory, not arbitrary prose.
  return /^have\s+(.+?)\s+handle\s+(?:this play|the play|this|it)[.!?]?$/i.exec(line)?.[1];
}

interface NaturalStatement {
  readonly statements: readonly RouteStatement[];
  readonly negatives?: readonly CatalogueRouteIntent[];
  readonly advisoryTail?: boolean;
}

function parseNaturalStatement(
  raw: string, candidates: readonly PlayerRoutingCapability[], aliases: readonly IdentityAlias<PlayerValue>[], carrier = false, typo = false
): NaturalStatement | undefined {
  const text = raw.trim().replace(/[.!?]+$/, '').replace(/\s+(?:please|thanks|thank you|for this play|for this one|for this)$/i, '');
  if (!carrier && ROUTE_COMPARISON.test(text)) return undefined;
  if (carrier && !/,\s*not\s+/i.test(text)) {
    const complete = parseRouteCall(text, candidates, aliases, true, typo);
    if (complete) return { statements: [{ intent: complete, source: 'carrier' }] };
    const boundary = /\s+(?:to|for|so|because)\s+|\s*[,;:]\s*|\s+[-\u2013\u2014]\s+/i.exec(text);
    if (boundary) {
      const prefix = parseNaturalStatement(text.slice(0, boundary.index), candidates, aliases, true, typo);
      if (prefix) return { ...prefix, advisoryTail: true };
    }
  }
  // Choice is judged only on a complete route span; comparison and task tails
  // never become alternatives. Bare choices also require complete sides.
  const choice = ROUTE_CHOICE.exec(text);
  if (choice) {
    const parts = text.replace(/^(?:either|both)\s+/i, '').split(/\b(?:and|or|either|both|plus)\b|[&+|/]/i).map((part) => part.trim());
    const intents = parts.map((part) => parseRouteCall(part, candidates, aliases, true, typo));
    if (intents.length >= 2 && intents.every((intent) => intent)) {
      const resolved = intents.map((intent) => resolveCatalogueRoute(intent!, candidates));
      const failure = resolved.find((result) => result.state === 'unavailable');
      const options = resolved.map((result) => statementOption(result.constraints, 'route choice'));
      return { statements: [{ intent: {}, source: 'route choice', unresolved: failure?.constraints.unresolved ?? [{
        dimension: 'player', rawText: text, reason: 'contradictory',
        ...(resolved.every((result) => result.state === 'resolved') && options.length <= 4 ? { options } : {})
      }] }] };
    }
    if (!carrier || !/^and$/i.test(choice[0])) return undefined;
    // "and report back" is a tail, whereas "and Opus" is an alternative.
    const right = text.slice(choice.index + choice[0].length).trim();
    const known = new Set([...identityTokens(rawModelAliases(candidates)), ...identityTokens(aliases)]);
    if (known.has(routeTokenList(right)[0]) || lexicalEffort(right, candidates)) return undefined;
    const positive = parseRouteCall(text.slice(0, choice.index), candidates, aliases, true, typo);
    return positive ? { statements: [{ intent: positive, source: 'carrier' }], advisoryTail: true } : undefined;
  }
  if (!carrier) return undefined;
  const negative = /,\s*not\s+(.+)$/i.exec(text);
  const selected = negative ? text.slice(0, negative.index) : text;
  const rejected = negative ? parseRouteCall(negative[1], candidates, aliases, true, typo) : undefined;
  if (negative && !rejected) return undefined;
  let positive = parseRouteCall(selected, candidates, aliases, true, typo);
  let advisoryTail = false;
  if (!positive) {
    const boundary = /\s+(?:to|for|so|because)\s+|\s*[,;:]\s*|\s+[-\u2013\u2014]\s+/i.exec(selected);
    if (boundary) { positive = parseRouteCall(selected.slice(0, boundary.index), candidates, aliases, true, typo); advisoryTail = true; }
  }
  return positive ? { statements: [{ intent: positive, source: 'carrier' }], ...(rejected ? { negatives: [rejected] } : {}), advisoryTail } : undefined;
}

function statementOption(constraints: RouteConstraints, source: string): RouteOption {
  const player = constraints.playerType === 'antigravity' ? 'AntiGravity' : title(constraints.playerType ?? '');
  return { playerType: constraints.playerType ?? '', playerInstanceId: constraints.playerInstanceId,
    model: constraints.model, modelDisplayName: constraints.modelDisplayName, effort: constraints.effort, source,
    label: [player || undefined, constraints.modelDisplayName, constraints.effort ? title(constraints.effort) : undefined].filter(Boolean).join(' \u00b7 ') };
}

/** S57.57 Slice 2: one bounded collector; no source outranks another. */
export function recognizeRouteConstraints(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  const lines = routeLines(input.prompt);
  const aliases = rawPlayerAliases(input.candidates, input.ledger ?? [], input.names);
  // Product identity is durable, but provider aliases still come from the roster.
  for (const product of PLAYER_REGISTRY) for (const text of product.aliases) {
    // Preserve the S56.2 contained-identity contract: provider-only structured
    // aliases are accepted only when actually supplied by the roster.
    if (normalized(text) === product.playerType || ['ag', 'agy', 'anti gravity', 'scout formation'].includes(text))
      aliases.push({ text, value: { playerType: product.playerType } });
  }
  const statements: RouteStatement[] = [];
  const fields = lines.map(structuredRouteField).filter((field): field is StructuredRouteField => Boolean(field));
  const playerFields = fields.filter((field) => field.dimension === 'player');
  let structuredPlayer: PlayerValue | undefined;
  for (const field of playerFields) {
    const player = resolveStructuredPlayer(field.value, aliases);
    structuredPlayer ??= player;
    const identity = resolveRouteIdentity(field.value, aliases, { identityKey: (value) => value.playerType, compact: true, adjacentNumberIsInstance: true, knownTokens: identityTokens(aliases) });
    const sharedAlias = !identity.ok && identity.reason === 'ambiguous' ? aliases.find((alias) =>
      new Set(aliases.filter((other) => normalized(other.text) === normalized(alias.text)).map((other) => other.value.playerType)).size > 1 && resolveRouteIdentity(field.value, [alias], { identityKey: (value) => value.playerType, compact: true, adjacentNumberIsInstance: true, knownTokens: identityTokens(aliases) }).ok) : undefined;
    statements.push({ intent: player ?? (sharedAlias ? { playerType: sharedAlias.text } : {}), source: 'AGENT field', rawPlayer: field.value, ...(!player && !sharedAlias ? { unresolved: [{ dimension: 'player', rawText: field.value }] } : {}) });
  }
  const natural = naturalLines(input.prompt);
  const first = natural[0];
  const openingPrompt = first ? first.text + input.prompt.slice(first.index).replace(/^[^\r\n]*/, '') : '';
  const scout = first ? recognizeScoutDirective(openingPrompt) : undefined;
  if (!structuredPlayer && scout && !playerFields.length) structuredPlayer = { playerType: 'scout' };
  const relevant = structuredPlayer ? input.candidates.filter((seat) => seat.playerType === structuredPlayer!.playerType
    && (!structuredPlayer!.playerInstanceId || seat.instanceId === structuredPlayer!.playerInstanceId)) : input.candidates;
  const structuredModel = fields.find((field) => field.dimension === 'model');
  const envelopeModel = structuredModel ? resolveExplicitModel(structuredModel.value, relevant) : undefined;
  for (const field of fields.filter((field) => field.dimension !== 'player')) {
    if (field.dimension === 'model') {
      // Keep the accepted structured descriptive wrapping and strict typo guard.
      const model = resolveExplicitModel(field.value, relevant);
      const identity = resolveRouteIdentity(spokenModelValue(field.value, relevant), rawModelAliases(relevant), { identityKey: (model) => model.id, versionDecoration: true, knownTokens: identityTokens(rawModelAliases(relevant)) });
      const ambiguous = !identity.ok && identity.reason === 'ambiguous' && !isChoiceOrNegation(field.value);
      statements.push({ intent: { ...structuredPlayer, ...(model ? { model: model.id } : ambiguous ? { model: spokenModelValue(field.value, relevant) } : {}) }, source: 'MODEL field',
        ...(!model && !ambiguous && relevant.length ? { unresolved: [{ dimension: 'model', rawText: field.value }] } : {}) });
    } else {
      const effort = lexicalEffort(field.value, input.candidates);
      statements.push({ intent: { ...structuredPlayer, ...(envelopeModel ? { model: envelopeModel.id } : {}), effort: effort ?? field.value }, source: 'REASONING field', rawEffort: field.value });
    }
  }
  const opening = scout || !first || !naturalEligible(first.text, 1) ? undefined
    : recognizeOpeningRoute(openingPrompt, input.candidates, aliases);
  let directive: RouteConstraints['directive'];
  const markers: RouteConstraints['recognized'][number][] = [];
  if (scout) {
    statements.unshift({ intent: { playerType: 'scout' }, source: 'Scout directive' });
    directive = { kind: 'scout', ...scout };
    markers.push('scout-directive');
  } else if (opening) {
    statements.unshift({ intent: opening.intent, source: 'route line 1' });
    markers.push(opening.kind === 'shorthand' ? 'route-shorthand' : 'control-title');
    if (opening.intent.playerType === 'scout') {
      directive = { kind: 'scout', matched: opening.matched, ...(opening.executionPrompt ? { executionPrompt: opening.executionPrompt } : {}) };
      markers.push('scout-directive');
    }
  }
  // Later bare components require two explicitly named dimensions, rather than
  // counting the Player inferred by model ownership. Collect every eligible line.
  for (let index = 1; index < natural.length; index += 1) {
    const line = natural[index].text;
    if (!naturalEligible(line, index + 1)) continue;
    if (carrierBody(withoutPresentationPrefix(line))) continue;
    const intent = parseRouteCall(withoutPresentationPrefix(line), input.candidates, aliases, false);
    if (!intent) continue;
    const dimensions = Number(Boolean(intent.playerType)) + Number(Boolean(intent.model)) + Number(Boolean(intent.effort));
    if (dimensions < 2) continue;
    statements.push({ intent, source: `route line ${index + 1}` });
    markers.push('route-shorthand');
  }
  const excluded = new Set<string>();
  const excludedEfforts = new Set<string>();
  const negativeStatements: RouteStatement[] = [];
  const addNegative = (intent: CatalogueRouteIntent) => {
    const resolution = resolveCatalogueRoute(intent, input.candidates);
    if (resolution.state === 'unavailable') { negativeStatements.push({ intent: {}, source: 'route exclusion', unresolved: resolution.constraints.unresolved }); return; }
    if (intent.model) for (const row of resolution.candidates) excluded.add(row.model);
    else if (intent.effort) excludedEfforts.add(resolution.constraints.effort!);
    else if (intent.playerType) for (const row of resolution.candidates) excluded.add(row.model);
  };
  for (const [index, entry] of natural.entries()) {
    if (!naturalEligible(entry.text, index + 1)) continue;
    let line = withoutPresentationPrefix(entry.text).replace(/^(?:\*\*|__|\*|_|`)+|(?:\*\*|__|\*|_|`)+$/g, '');
    // Opening control-title choices have the same title geography and CAPS gate.
    if (index === 0) {
      const separator = /\s+[-\u2013\u2014]\s+/.exec(line);
      if (separator && !/[a-z]/.test(line.slice(0, separator.index))) line = line.slice(0, separator.index);
    }
    for (const clause of line.split(/(?<=[.!?])\s+/)) {
      const denied = /(?:^|,\s*(?:but\s+)?)(?:please\s+)?(?:don't|do not|never)\s+use\s+(.+)$/i.exec(clause);
      if (denied) {
        const intent = parseRouteCall(denied[1], input.candidates, aliases, true, index === 0);
        if (intent) addNegative(intent);
        else {
          // Retain the existing advisory model-prefix exclusion, but only after
          // an anchored routing-negation command, never incidental negative prose.
          const model = aliasesAtStart(denied[1], modelAliases(input.candidates))?.value;
          if (model) excluded.add(model.id);
        }
        continue;
      }
      const body = carrierBody(clause);
      const parsed = parseNaturalStatement(body ?? clause, input.candidates, aliases, body !== undefined, index === 0);
      if (parsed) {
        // Retain the established objective/advisory shield under a control route;
        // complete stand-alone carriers and explicit effort still merge normally.
        if ((opening || scout) && parsed.advisoryTail && !parsed.statements.some((statement) => statement.intent.effort)) continue;
        statements.push(...parsed.statements);
        for (const intent of parsed.negatives ?? []) addNegative(intent);
        continue;
      }
      // Preserve the exact legacy advisory prefix grammar, without extending it
      // to unsupported choice/negation or conversation. Unknown complete carriers stop.
      if (opening || scout || ROUTE_CHOICE.test(body ?? '') || isChoiceOrNegation(body ?? '')) continue;
      const legacy = directiveBody(clause);
      if (!legacy) continue;
      const player = aliasesAtStart(legacy, playerAliases(input.candidates, input.ledger ?? [], input.names));
      if (!player) continue;
      const on = /\bon\s+(.+)$/i.exec(legacy);
      const model = on ? aliasesAtStart(on[1], modelAliases(input.candidates.filter((seat) => seat.playerType === player.value.playerType)))?.value : undefined;
      const effort = /(?:,\s*|\bwith\s+|\bat\s+)(low|medium|high|xhigh|max|ultra)\b/i.exec(legacy)?.[1].toLowerCase();
      statements.push({ intent: { ...player.value, ...(model ? { model: model.id } : {}), ...(effort ? { effort } : {}) }, source: 'legacy imperative' });
    }
  }
  statements.push(...negativeStatements);
  if (excludedEfforts.size && !statements.length) statements.push({ intent: {}, source: 'effort exclusion' });
  if (!statements.length && !excluded.size && !excludedEfforts.size) return undefined;
  if (excluded.size) markers.push('model-exclusion');
  const results = statements.map((statement): CatalogueRouteResolution => {
    let result = resolveCatalogueRoute(statement.intent, input.candidates);
    // S57.72: an explicit, uniquely resolved Player scopes the catalogue used to read an otherwise Player-less natural
    // model statement ("SONNET 5.5 MEDIUM" + AGENT: Claude reads Claude's catalogue, not another Player's exact
    // "Claude Sonnet 5.5"). Scope only interprets: if the scoped catalogue cannot, the unscoped result stands and the
    // ordinary intersection still stops contradictions. Not source precedence.
    if (structuredPlayer && statement.intent.model && !statement.intent.playerType && !statement.intent.playerInstanceId
      && (statement.source === 'carrier' || statement.source.startsWith('route line')) && relevant.length) {
      const scoped = resolveCatalogueRoute(statement.intent, relevant);
      if (scoped.state !== 'unavailable') result = scoped;
    }
    if (statement.rawEffort && result.constraints.unresolved?.some((problem) => problem.dimension === 'effort'))
      result = { ...result, constraints: { ...result.constraints, unresolved: result.constraints.unresolved.map((problem) =>
        problem.dimension === 'effort' ? { ...problem, rawText: statement.rawEffort! } : problem) } };
    if (statement.unresolved) return { ...result, state: 'unavailable', candidates: [], constraints: { ...result.constraints, unresolved: statement.unresolved } };
    const player = statement.intent.playerType;
    // Logical destinations and known off-field Players have no reasoning tuple.
    // Availability remains the downstream contract; do not fabricate a model.
    if ((player === 'scout' || player === 'terminal') && statement.intent.effort && input.candidates.some((seat) => seat.playerType === player))
      return { ...result, state: 'unavailable', constraints: { source: 'play', playerType: player, recognized: ['player'], unresolved: [{ dimension: 'effort', rawText: statement.intent.effort, reason: 'unsupported' }] } };
    if (player && PLAYER_REGISTRY.some((product) => product.playerType === player) && (player === 'scout' || player === 'terminal' || !input.candidates.some((seat) => seat.playerType === player && seat.transport === 'controlled' && seat.capability.models.length))) {
      return { state: 'resolved', candidates: [], constraints: { source: 'play', ...statement.intent,
        recognized: ['player', ...(statement.intent.effort ? ['effort' as const] : [])] } };
    }
    return result;
  });
  const common = { source: 'play' as const, ...(directive ? { directive } : {}), ...(excluded.size ? { excludedModels: [...excluded] } : {}) };
  const recognized = [...new Set([...results.flatMap((result) => result.constraints.recognized), ...markers])];
  const failure = results.find((result) => result.state === 'unavailable');
  if (failure) {
    const known: Partial<RouteConstraints> = {};
    for (const dimension of ['playerType', 'playerInstanceId', 'model', 'modelDisplayName', 'effort'] as const) {
      const values = [...new Set(results.map((result) => result.constraints[dimension]).filter((value): value is string => value !== undefined))];
      if (values.length === 1) Object.assign(known, { [dimension]: values[0] });
    }
    const unresolved = results.flatMap((result) => result.state === 'unavailable' ? result.constraints.unresolved ?? [] : []);
    for (const problem of unresolved) {
      if (problem.dimension === 'player') { delete (known as { playerType?: string }).playerType; delete (known as { playerInstanceId?: string }).playerInstanceId; }
      if (problem.dimension === 'model') { delete (known as { model?: string }).model; delete (known as { modelDisplayName?: string }).modelDisplayName; }
      if (problem.dimension === 'effort') delete (known as { effort?: string }).effort;
    }
    return { ...common, ...known, recognized, unresolved };
  }
  const symbolic = results.filter((result) => !result.candidates.length);
  let surviving = results.find((result) => result.candidates.length)?.candidates ?? [];
  for (const result of results.filter((item) => item.candidates.length)) {
    const keys = new Set(result.candidates.map((row) => JSON.stringify([row.playerInstanceId, row.model, row.effort])));
    surviving = surviving.filter((row) => keys.has(JSON.stringify([row.playerInstanceId, row.model, row.effort])));
  }
  surviving = surviving.filter((row) => !excluded.has(row.model) && !excludedEfforts.has(row.effort ?? ''));
  const contradictory = symbolic.length
    ? results.some((result) => result.constraints.playerType && result.constraints.playerType !== symbolic[0].constraints.playerType)
      || (surviving.length > 0 && surviving.some((row) => row.playerType !== symbolic[0].constraints.playerType))
    : results.length > 0 && !surviving.length;
  if (contradictory) {
    const fieldIndices = statements.flatMap((statement, index) => statement.source.endsWith('field') ? [index] : []);
    let options = results.map((result, index) => statementOption(result.constraints, statements[index].source));
    if (fieldIndices.length > 1 && ['playerType', 'playerInstanceId', 'model', 'effort'].every((dimension) =>
      new Set(fieldIndices.map((index) => results[index].constraints[dimension as keyof RouteConstraints]).filter(Boolean)).size <= 1)) {
      const envelope = statementOption(Object.assign({ source: 'play', recognized: [] }, ...fieldIndices.map((index) => results[index].constraints)), 'structured envelope');
      options = options.filter((_, index) => !fieldIndices.includes(index));
      options.push(envelope);
    }
    return { ...common, recognized, unresolved: [{ dimension: 'player', rawText: statements.map((statement) => statement.source).join(' + '),
      reason: 'contradictory', ...(options.length <= 4 && options.every((option) => option.label) ? { options } : {}) }] };
  }
  if (symbolic.length) {
    const dimensions = ['playerType', 'playerInstanceId', 'model', 'effort'] as const;
    const conflict = dimensions.find((dimension) => new Set(symbolic.map((result) => result.constraints[dimension]).filter(Boolean)).size > 1);
    if (conflict) return { ...common, recognized, unresolved: [{ dimension: conflict === 'effort' ? 'effort' : conflict === 'model' ? 'model' : 'player', rawText: conflict, reason: 'contradictory' }] };
    return { ...common, ...Object.assign({}, ...symbolic.map((result) => result.constraints)), recognized };
  }
  if (!results.length) return { ...common, recognized };
  // Project the intersection onto dimensions named BEFORE filtering. Rebuilding
  // a smaller catalogue here would incorrectly turn an ambiguous family into a brand.
  const namedModel = results.some((result) => result.constraints.recognized.includes('model'));
  const namedEffort = statements.some((statement) => statement.intent.effort !== undefined);
  const players = [...new Set(surviving.map((row) => row.playerType))];
  const models = [...new Set(surviving.map((row) => JSON.stringify([row.playerType, row.model])))];
  const instances = statements.some((statement) => statement.intent.playerInstanceId !== undefined);
  let projection: RouteConstraints = { ...common, recognized,
    ...(players.length === 1 && (namedModel || results.some((result) => result.constraints.playerType)) ? { playerType: players[0] } : {}),
    ...(instances ? { playerInstanceId: surviving[0].playerInstanceId } : {}),
    ...(namedModel && models.length === 1 ? { model: surviving[0].model, modelDisplayName: surviving[0].modelDisplayName } : {}),
    ...(namedEffort ? { effort: surviving[0].effort } : {}) };
  const remainingEfforts = [...new Set(surviving.map((row) => row.effort))];
  if (excludedEfforts.size && !namedEffort) {
    // The existing contract cannot carry a negative effort to policy. Resolve
    // a uniquely remaining effort, otherwise stop with the live surviving choices.
    if (remainingEfforts.length === 1) projection = { ...projection, effort: remainingEfforts[0] };
    else {
      const options = remainingEfforts.map((effort) => statementOption({ ...projection, effort }, 'effort exclusion'));
      return { ...projection, unresolved: [{ dimension: 'effort', rawText: [...excludedEfforts].join(', '), reason: 'ambiguous', ...(options.length <= 4 ? { options } : {}) }] };
    }
  }
  const ambiguousDimension = namedModel && models.length > 1 ? 'model' : statements.some((statement) => statement.intent.playerType) && players.length > 1 ? 'player' : undefined;
  if (ambiguousDimension) {
    const options = new Map<string, RouteOption>();
    for (const row of surviving) {
      const option = statementOption({ source: 'play', recognized: [], playerType: row.playerType,
        ...(namedModel ? { model: row.model, modelDisplayName: row.modelDisplayName } : {}), ...(namedEffort || excludedEfforts.size ? { effort: row.effort } : {}) }, 'catalogue');
      options.set(JSON.stringify([row.playerType, namedModel ? row.model : undefined, namedEffort || excludedEfforts.size ? row.effort : undefined]), option);
    }
    return { ...projection, unresolved: [{ dimension: ambiguousDimension, rawText: ambiguousDimension === 'model' ? statements.find((statement, index) =>
      results[index].constraints.recognized.includes('model'))!.intent.model! : (statements.find((statement) => statement.intent.playerType)!.rawPlayer ?? statements.find((statement) => statement.intent.playerType)!.intent.playerType!), reason: 'ambiguous',
      ...(options.size <= 4 ? { options: [...options.values()] } : {}) }] };
  }
  return projection;
}
