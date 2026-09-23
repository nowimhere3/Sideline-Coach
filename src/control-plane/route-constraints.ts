/**
 * Q2.10E-B — conservative, catalog-validated Play-level route constraints.
 *
 * This is deliberately not general NLP. Only an unmistakable opening imperative
 * or a small structured routing field can narrow AUTO, and every recognized name
 * must already exist in this Game's Player/model/effort truth.
 */

import type { PlayerRoutingCapability, RouteConstraints } from '../capability-types';
import type { InstanceLedgerEntry } from './work-ledger';
import {
  identityTokens, isChoiceOrNegation, leadingIdentity, normalizeEffortValue, resolveRouteIdentity, routeTokenList,
  type IdentityAlias
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

function structuredValue(lines: readonly string[], dimension: RouteFieldDimension): string | undefined {
  for (const line of lines) {
    const field = structuredRouteField(line);
    if (field?.dimension === dimension) return field.value;
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
  text: string,
  candidates: readonly PlayerRoutingCapability[]
): { id: string; displayName: string } | undefined {
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
 * BREADCRUMB SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING — S56.3 HUMAN SHORTHAND + CONTROL-TITLE INTERCEPT
 * WAS:  Only structured fields ("AGENT: Claude") and a natural "Scout ..." / "Use X" opening were recognized. A bare
 *       "Claude Sonnet" fell through to task classification (staged as AntiGravity · Gemini 3.8 Flash · Low) and a
 *       control-shaped title such as "SCOUT FORMATION — OPUS SCOPE PACK" was outvoted by the word "Opus" in its own
 *       title (staged as Claude · Opus · High).
 * IS:   The canonical ingestion seam also intercepts, BEFORE ordinary task classification, two unmistakable
 *       opening-line route calls (the order is structured routing -> natural Scout directive -> human shorthand ->
 *       control-shaped title -> canonical route -> AUTO fills only genuinely absent dimensions):
 *       1. HUMAN SHORTHAND — the FIRST non-blank line is, in its ENTIRETY, a route call: PLAYER [MODEL] [EFFORT]
 *          ("Claude Sonnet", "Claude Opus High", "Codex GPT-5.6 Sol High"). Every token must be accounted for, in that
 *          order, by roster/catalog truth; a shorthand needs a model or an effort beyond the bare Player name.
 *       2. CONTROL-SHAPED TITLE — the first line is `<ROUTE REGION> <dash> <title>` where the region is ALL CAPS and is
 *          itself a complete route call (a bare Player is enough): "SCOUT FORMATION — OPUS SCOPE PACK" -> Scout,
 *          "CLAUDE SONNET — ARCHITECTURE REVIEW" -> Claude · Sonnet. The title's own words and the objective can never
 *          outvote the route: natural "Use X" sentences in the body are ignored once an opening route is established
 *          (a structured AGENT/PLAYER field still wins, as always).
 *       No fuzzy spelling, no whole-prompt scan. A choice ("Claude or Codex", "CLAUDE / CODEX — REVIEW"), a negation, a
 *       descriptive sentence or heading, an unconsumed word ("Claude Sonnet Adapter Problems"), a second model ("Claude
 *       Sonnet Opus") or a typo simply is not a route call and stays ordinary AUTO. A model word that names several
 *       catalog models ("AntiGravity Flash" when three Flash versions exist) keeps the Player and stops truthfully as an
 *       unresolved model — it never silently picks one.
 * WHY:  Route intent must survive being typed the way humans type it, and a title's identity must not be re-decided by
 *       whatever model name its objective mentions.
 * WILL BE: The same interception extends toward the full Play Compiler (originalPrompt / routeDirective / canonicalRoute /
 *       executionPrompt). Today only a Scout route strips its control text into an executionPrompt; other Players still
 *       receive the Play as written. Intelligent AUTO (scorecards, AI Health, CONSERVE) stays a separate policy layer.
 */
interface OpeningRoute {
  readonly kind: 'shorthand' | 'control-title';
  readonly player: PlayerValue;
  readonly model?: { id: string; displayName: string };
  /** The model words named several (or no catalog-resolvable) models: keep the Player, stop truthfully on the model. */
  readonly modelUnresolved?: string;
  readonly effort?: string;
  readonly effortText?: string;
  /** The recognized control text (the whole shorthand line, or the title region plus its dash). */
  readonly matched: string;
  /** Only a Scout route uses this today: the Play without its control text. */
  readonly executionPrompt?: string;
}

type ModelValue = { id: string; displayName: string };

const MAX_ROUTE_CALL_TOKENS = 8;
const DIGITS_ONLY = /^\d+$/;

function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

/**
 * The model named by exactly these words, against the resolved Player's own catalog: an exact model id / display name
 * ("GPT-5.6 Sol"), a digit-free family with one version number ("Sonnet 5"), or words that occur as one contiguous run
 * in exactly ONE model ("Sol", "Flash" when only one Flash exists). Several models -> ambiguous; none -> undefined.
 */
function matchModelWords(words: readonly string[], candidates: readonly PlayerRoutingCapability[]): { model?: ModelValue; ambiguous?: true } | undefined {
  const aliases = rawModelAliases(candidates).map((alias) => ({ tokens: routeTokenList(alias.text), value: alias.value }));
  const ids = (matches: readonly { value: ModelValue }[]): Map<string, ModelValue> => new Map(matches.map((match) => [match.value.id, match.value]));
  const decide = (found: Map<string, ModelValue>): { model?: ModelValue; ambiguous?: true } | undefined =>
    found.size === 1 ? { model: [...found.values()][0] } : found.size > 1 ? { ambiguous: true } : undefined;

  const exact = decide(ids(aliases.filter((alias) => alias.tokens.join(' ') === words.join(' '))));
  if (exact) return exact;
  const last = words[words.length - 1];
  if (words.length >= 2 && DIGITS_ONLY.test(last)) {
    const family = words.slice(0, -1).join(' ');
    const versioned = decide(ids(aliases.filter((alias) => alias.tokens.join(' ') === family && !alias.tokens.some((token) => /\d/.test(token)))));
    if (versioned) return versioned;
  }
  if (words.every((word) => DIGITS_ONLY.test(word))) return undefined; // a bare number is not a model
  return decide(ids(aliases.filter((alias) => containsRun(alias.tokens, words))));
}

/**
 * ONE canonical route call: PLAYER [MODEL] [EFFORT], consuming every word. Pure roster/catalog truth: the Player is the
 * leading roster identity, the model is resolved against THAT Player's catalog, the tail must be the supported effort
 * vocabulary. Anything left over, any choice/negation, any unknown or misspelled word means "not a route call".
 */
function parseRouteCall(
  text: string,
  candidates: readonly PlayerRoutingCapability[],
  playerAliasList: readonly IdentityAlias<PlayerValue>[],
  allowBarePlayer: boolean
): Omit<OpeningRoute, 'kind' | 'matched' | 'executionPrompt'> | undefined {
  if (isChoiceOrNegation(text)) return undefined;
  const tokens = routeTokenList(text);
  if (!tokens.length || tokens.length > MAX_ROUTE_CALL_TOKENS) return undefined;
  const lead = leadingIdentity(tokens, playerAliasList, true);
  if (!lead) return undefined;
  const types = new Set(lead.aliases.map((alias) => alias.value.playerType));
  const instances = new Set(lead.aliases.map((alias) => alias.value.playerInstanceId).filter((id): id is string => Boolean(id)));
  if (types.size !== 1 || instances.size > 1) return undefined; // several Players / instances answer to these words: never guess
  const playerType = [...types][0];
  const [playerInstanceId] = instances;
  const player: PlayerValue = playerInstanceId ? { playerType, playerInstanceId } : { playerType };
  const rest = tokens.slice(lead.length);
  const relevant = candidates.filter((candidate) => candidate.playerType === playerType && (!playerInstanceId || candidate.instanceId === playerInstanceId));

  // Longest model phrase first, then no model at all; each split must leave nothing but an effort word.
  for (let length = Math.min(rest.length, 5); length >= 0; length -= 1) {
    const modelWords = rest.slice(0, length);
    const tail = rest.slice(length);
    const effortText = tail.join(' ');
    const effort = tail.length ? normalizeEffortValue(effortText) : undefined;
    if (tail.length && !effort) continue;
    let model: { model?: ModelValue; ambiguous?: true } | undefined;
    if (length > 0) {
      model = matchModelWords(modelWords, relevant);
      if (!model) continue;
    }
    if (!allowBarePlayer && !model && !effort) return undefined; // a bare Player name is not enough for a shorthand
    return {
      player,
      ...(model?.model ? { model: model.model } : {}),
      ...(model?.ambiguous ? { modelUnresolved: modelWords.join(' ') } : {}),
      ...(effort ? { effort, effortText } : {})
    };
  }
  return undefined;
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * S56.3: the opening-line route call (shorthand, then control-shaped title). First non-blank line only; a fenced or
 * quoted first line is never a route call. Deterministic; nothing beyond the first line is ever read for identity.
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

  const shorthand = parseRouteCall(line, candidates, playerAliasList, false);
  if (shorthand) {
    const body = rest.join('\n').trim();
    return { kind: 'shorthand', ...shorthand, matched: line, ...(body ? { executionPrompt: capitalizeFirst(body) } : {}) };
  }

  const separator = /\s+[-–—]\s+/.exec(line);
  if (!separator) return undefined;
  const region = line.slice(0, separator.index);
  // Control-shaped means ALL CAPS: "Claude Sonnet — Adapter Problems" is an ordinary descriptive heading.
  if (!/[A-Za-z]/.test(region) || /[a-z]/.test(region)) return undefined;
  const title = parseRouteCall(region, candidates, playerAliasList, true);
  if (!title) return undefined;
  const tail = line.slice(separator.index + separator[0].length).replace(/^(?:\*\*|__|\*|_|`)+/, '');
  const body = [tail, ...rest].join('\n').trim();
  return {
    kind: 'control-title',
    ...title,
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

const SCOUT_HEAD = /^(\*\*|__|\*|_|`)?scout(?:\s+(this(?:\s+play)?|needed))?(?![A-Za-z0-9'’])/i;

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
  const head = SCOUT_HEAD.exec(line);
  if (!head) return undefined;
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
    return undefined;
  }
  const body = [objective, ...lines.slice(index + 1)].join('\n').trim();
  const executionPrompt = body ? body.charAt(0).toUpperCase() + body.slice(1) : undefined;
  return { matched: line.slice(0, position).trim(), ...(executionPrompt ? { executionPrompt } : {}) };
}

/**
 * BREADCRUMB CANONICAL-PLAY-ROUTING-ENVELOPE (S56.0)
 * WAS:  AUTO could detect explicit Player/model/reasoning fields, but unresolved
 *       explicit values could collapse into "missing" and be silently replaced by
 *       inference (MODEL: Claude Sonnet 5 became Opus).
 * IS:   AUTO treats Assistant Coach routing metadata as authoritative product data.
 *       Explicit routing is resolved deterministically from a bounded opening
 *       envelope. Explicit unresolved values are preserved in `unresolved` and never
 *       silently become inferred replacements. Only ABSENT fields may be filled by AUTO.
 * WHY:  A commercial routing product cannot "hopefully" interpret routing
 *       instructions; the recommendation must arrive exactly as intended or fail visibly.
 * WILL BE: Future Intelligent AUTO may separately choose Players/models from
 *       scorecards, AI Health, role, availability, reset timing, scarcity, CONSERVE.
 *       That policy must stay distinct from literal Assistant Coach routing.
 *
 * Three states per dimension: absent (AUTO fills) / explicit+resolved (wins) /
 * explicit+unresolved (routing-policy stops). Only structured fields (AGENT:, MODEL:,
 * REASONING: ...) can be unresolved; natural "Use X on Y" stays catalog-validated advice.
 *
 * S56.1 extends this envelope with SCOUT-DIRECTIVE-INTERCEPT (above): envelope + directive intercept are the early
 * proof of the future control-plane normalization layer (originalPrompt / routeDirective / executionPrompt).
 * S56.2 adds CANONICAL-ROUTING-ALIAS-NORMALIZATION (route-normalization.ts): structured AGENT/MODEL/REASONING values
 * resolve by canonical identity extraction ("Claude Code" -> Claude, "Claude Sonnet 5" -> sonnet) before they can be
 * declared unresolved.
 *
 * Recognize only explicit route intent. No field and no known name means ordinary AUTO.
 */
export function recognizeRouteConstraints(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  const ledger = input.ledger ?? [];
  const lines = routeLines(input.prompt);
  const allPlayerAliases = playerAliases(input.candidates, ledger, input.names);
  const everyPlayerAlias = rawPlayerAliases(input.candidates, ledger, input.names);
  let player: { playerType: string; playerInstanceId?: string } | undefined;
  let body = '';
  const unresolved: { dimension: RouteFieldDimension; rawText: string }[] = [];
  // S56.3: an unmistakable opening route call (human shorthand / control-shaped title) is evaluated up front, but only
  // when the natural Scout directive (S56.1) does not already own the opening line.
  const opening = recognizeScoutDirective(input.prompt)
    ? undefined
    : recognizeOpeningRoute(input.prompt, input.candidates, everyPlayerAlias);
  for (const line of lines) {
    const field = structuredRouteField(line);
    // Once an opening route is established, natural "Use X" sentences in the objective cannot outvote it. A structured
    // AGENT/PLAYER field still can: structured routing always outranks (S56.0).
    if (opening && field?.dimension !== 'player') continue;
    const directive = directiveBody(line);
    if (!directive) continue;
    // A structured Player field already says "this names a Player": extract the one canonical identity it contains
    // (S56.2). Natural-language imperatives keep their conservative start-of-phrase matching.
    const structuredPlayer = field?.dimension === 'player' ? resolveStructuredPlayer(directive, everyPlayerAlias) : undefined;
    const matched = field?.dimension === 'player'
      ? (structuredPlayer ? { text: directive, value: structuredPlayer } : undefined)
      : aliasesAtStart(directive, allPlayerAliases);
    if (!matched) {
      // An explicit structured Player field that names nobody we know is intent,
      // not absence (S56.0). Natural-language imperatives stay advisory.
      if (field?.dimension === 'player' && !unresolved.some((item) => item.dimension === 'player')) {
        unresolved.push({ dimension: 'player', rawText: field.value });
      }
      continue;
    }
    player = matched.value;
    body = directive;
    break;
  }

  // S56.1 SCOUT-DIRECTIVE-INTERCEPT: an unmistakable opening "Scout ..." command is control-plane routing. Any Player
  // already named by the structured envelope or an explicit "Use X" imperative outranks it.
  let scoutDirective: RouteConstraints['directive'];
  if (!player && !unresolved.some((item) => item.dimension === 'player')) {
    const scout = recognizeScoutDirective(input.prompt);
    if (scout) {
      player = { playerType: 'scout' };
      scoutDirective = { kind: 'scout', ...scout };
    }
  }

  // S56.3: human shorthand / control-shaped title, after structured routing and the natural Scout directive.
  let intercept: OpeningRoute | undefined;
  if (!player && !scoutDirective && opening && !unresolved.some((item) => item.dimension === 'player')) {
    intercept = opening;
    player = opening.player;
    if (opening.player.playerType === 'scout') {
      scoutDirective = { kind: 'scout', matched: opening.matched, ...(opening.executionPrompt ? { executionPrompt: opening.executionPrompt } : {}) };
    }
  }

  const relevantCandidates = player
    ? input.candidates.filter((candidate) => candidate.playerType === player!.playerType
      && (!player!.playerInstanceId || candidate.instanceId === player!.playerInstanceId))
    : input.candidates;
  let model: { id: string; displayName: string } | undefined;
  let effort: string | undefined;
  const on = player ? /\bon\s+(.+)$/i.exec(body) : undefined;
  const structuredModel = structuredValue(lines, 'model');
  const modelText = structuredModel ?? on?.[1];
  // A resolved Player with nothing on field has no catalog to judge model/effort
  // against; the existing "Player unavailable" error is the truthful one then.
  const judgeable = relevantCandidates.length > 0;
  if (modelText) {
    if (structuredModel) {
      model = resolveExplicitModel(modelText, relevantCandidates);
      if (!model && judgeable) unresolved.push({ dimension: 'model', rawText: structuredModel });
    } else {
      model = aliasesAtStart(modelText, modelAliases(relevantCandidates))?.value;
    }
  } else if (intercept?.model) {
    model = intercept.model;
  } else if (intercept?.modelUnresolved && judgeable) {
    unresolved.push({ dimension: 'model', rawText: intercept.modelUnresolved });
  }
  const supported = new Set((model
    ? relevantCandidates.flatMap((candidate) => candidate.capability.models.filter((item) => item.id === model!.id).flatMap((item) => item.supportedEfforts))
    : relevantCandidates.flatMap((candidate) => candidate.capability.models.flatMap((item) => item.supportedEfforts))).map((item) => item.toLowerCase()));
  const effortText = structuredValue(lines, 'effort');
  const effortValue = effortText
    ? normalizeEffortValue(effortText)
    : intercept?.effort ?? (player ? /(?:,\s*|\bwith\s+|\bat\s+)(low|medium|high|xhigh|max)\b/i.exec(body)?.[1].toLowerCase() : undefined);
  const effortWords = effortText ?? intercept?.effortText;
  if (effortValue && supported.has(effortValue)) effort = effortValue;
  else if (effortWords && judgeable) unresolved.push({ dimension: 'effort', rawText: effortWords });

  const excluded = new Set<string>();
  const exclusions = modelAliases(input.candidates);
  for (const line of lines) {
    const denied = /\b(?:don't|do not|never)\s+use\s+(.+)$/i.exec(line);
    if (!denied) continue;
    const match = aliasesAtStart(denied[1], exclusions);
    if (match) excluded.add(match.value.id);
  }

  if (!player && !model && !effort && excluded.size === 0 && unresolved.length === 0) return undefined;
  const recognized: RouteConstraints['recognized'][number][] = [];
  if (player?.playerInstanceId) recognized.push('instance');
  else if (player) recognized.push('player');
  if (scoutDirective) recognized.push('scout-directive');
  if (intercept) recognized.push(intercept.kind === 'shorthand' ? 'route-shorthand' : 'control-title');
  if (model) recognized.push('model');
  if (effort) recognized.push('effort');
  if (excluded.size) recognized.push('model-exclusion');
  return {
    source: 'play',
    playerType: player?.playerType,
    playerInstanceId: player?.playerInstanceId,
    model: model?.id,
    modelDisplayName: model?.displayName,
    effort,
    excludedModels: excluded.size ? [...excluded] : undefined,
    ...(unresolved.length ? { unresolved } : {}),
    ...(scoutDirective ? { directive: scoutDirective } : {}),
    recognized
  };
}
