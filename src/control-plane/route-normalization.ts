/**
 * BREADCRUMB CANONICAL-ROUTING-ALIAS-NORMALIZATION (S56.2)
 * WAS:  Canonical routing recognized explicit structured fields but relied too heavily on literal Player/model aliases.
 *       Common product-language values such as "Claude Code" could be detected as explicit routing data yet still fail
 *       resolution ("Unrecognized Player 'Claude Code' requested.").
 * IS:   Structured routing values pass through deterministic, roster/catalog-backed canonical normalization. The field
 *       already says what the value names (AGENT/PLAYER -> a Player, MODEL -> a model of the resolved Player, REASONING
 *       -> the supported effort vocabulary), so exactly ONE canonical identity contained in the value resolves and
 *       harmless descriptive wrapping is tolerated. None, several, a negation/choice ("Not Claude", "Claude or Codex")
 *       or a leftover word one typo from another known identity stays explicit-unresolved (S56.0) and never triggers
 *       silent substitution. No spelling is ever corrected. No finite synonym list exists: "Claude Development Stadium"
 *       resolves for the same reason "Claude Code" does.
 * WHY:  Mass adoption cannot depend on every Assistant Coach or human emitting one exact internal identifier. Be
 *       permissive about harmless descriptive wrapping, strict about canonical identity, conservative about ambiguity,
 *       and never silently invent identity.
 * WILL BE: This is an early production slice of a canonical Play-ingestion / interception layer:
 *         originalPrompt -> bounded control-region detection -> routeDirective extraction -> field/dimension recognition
 *         -> canonical value normalization -> roster/catalog-backed entity resolution -> ambiguity / contradiction
 *         validation -> canonicalRoute -> executionPrompt
 *       so "AGENT: Claude Development Stadium / MODEL: Claude Sonnet 5 / REASONING: High" normalizes internally to
 *       { playerType: claude, model: sonnet, effort: high } while the original wording stays as originalPrompt /
 *       routeDirective evidence and downstream routing never needs to understand stylistic phrasing. S56.0 (envelope) +
 *       S56.1 (Scout directive) + S56.2 (value normalization) are its first three slices. Intelligent AUTO (scorecards,
 *       AI Health, availability, CONSERVE) stays a separate policy layer; explicit Assistant Coach routing stays
 *       authoritative.
 *
 * S56.2 — the one home for turning a structured routing VALUE into a canonical identity. Pure: no roster, filesystem,
 * VS Code or routing-policy knowledge; callers pass the roster/catalog-backed aliases they already trust.
 *
 * The structured field already says what KIND of thing the value names (AGENT/PLAYER → a Player, MODEL → a model), so
 * this never needs a finite synonym list. It finds the canonical identity CONTAINED in the value:
 *
 *   raw structured value
 *     → presentation normalization (case, punctuation, hyphens)
 *     → canonical identity extraction (longest, non-overlapping spans of roster/catalog aliases)
 *     → ambiguity / contradiction validation
 *     → resolved (exactly one identity) | unresolved (none, several, or contradicted)
 *
 * Harmless descriptive wrapping ("Claude Code", "Claude Development Stadium", "Claude Sonnet 5 Model") is not the
 * identity and is tolerated. Nothing here corrects spelling: an unknown or misspelled name simply contains no identity.
 */

export interface IdentityAlias<T> {
  readonly text: string;
  readonly value: T;
}

export type IdentityFailure = 'none' | 'ambiguous' | 'contradictory' | 'near-miss' | 'instance';

export type IdentityResolution<T> =
  | { readonly ok: true; readonly matches: readonly IdentityAlias<T>[] }
  | { readonly ok: false; readonly reason: IdentityFailure };

/** Presentation normalization shared by every routing value. */
export function normalizeRouteText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function routeTokens(value: string): string[] {
  return normalizeRouteText(value).split(' ').filter(Boolean);
}

/** Words that turn a value into "not X", "anything but X", "X instead of Y". Never positively resolve. */
const NEGATION = new Set([
  'not', 'no', 'never', 'without', 'except', 'excluding', 'exclude', 'instead', 'rather', 'avoid', 'neither', 'nor',
  'dont', 'don', 'isnt', 'isn', 'doesnt', 'doesn', 'anything', 'anyone', 'other', 'else'
]);
/** Words that make a value a list or a choice ("Claude or Codex", "Sonnet and Opus"). Never guess among them. */
const CONNECTIVE = new Set(['and', 'or', 'vs', 'versus', 'either', 'both', 'plus', 'then', 'also']);

const IS_NUMBER = /^\d+$/;

/**
 * "Claude / Codex", "Claude & Codex", "Sonnet | Opus", "Not Claude", "Claude or Codex": a choice, a list or a negation,
 * however it is punctuated. Shared by structured value resolution (S56.2) and opening-line route calls (S56.3).
 */
export function isChoiceOrNegation(raw: string): boolean {
  return /[&+|/]/.test(raw) || routeTokens(raw).some((token) => NEGATION.has(token) || CONNECTIVE.has(token));
}

/** The tokens every routing comparison uses (case, punctuation and hyphens are presentation). */
export function routeTokenList(value: string): string[] {
  return routeTokens(value);
}

/** Same-length values one substitution or one adjacent swap apart. Used only to BLOCK, never to correct. */
function sameLengthNearMiss(left: string, right: string): boolean {
  if (left === right || left.length !== right.length) return false;
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

interface Span<T> {
  readonly start: number;
  readonly end: number;
  readonly aliases: IdentityAlias<T>[];
}

const COMPACT_MIN_TOKEN = 3;
const COMPACT_MAX_SPAN = 3;

function scanIdentities<T>(tokens: readonly string[], aliases: readonly IdentityAlias<T>[], compact: boolean): Span<T>[] {
  const exact = new Map<string, IdentityAlias<T>[]>();
  const joined = new Map<string, IdentityAlias<T>[]>();
  let longest = 1;
  const add = (map: Map<string, IdentityAlias<T>[]>, key: string, alias: IdentityAlias<T>): void => {
    const list = map.get(key);
    if (!list) map.set(key, [alias]);
    else if (!list.includes(alias)) list.push(alias);
  };
  for (const alias of aliases) {
    const parts = routeTokens(alias.text);
    if (!parts.length) continue;
    longest = Math.max(longest, parts.length);
    add(exact, parts.join(' '), alias);
    if (compact) add(joined, parts.join(''), alias);
  }
  const spans: Span<T>[] = [];
  let index = 0;
  while (index < tokens.length) {
    let taken = false;
    for (let length = Math.min(compact ? Math.max(longest, COMPACT_MAX_SPAN) : longest, tokens.length - index); length >= 1; length -= 1) {
      const slice = tokens.slice(index, index + length);
      let found = exact.get(slice.join(' '));
      // "Anti Gravity" is the one canonical name AntiGravity. Only a run of real words may be joined, so
      // "Code X" never becomes "Codex".
      if (!found && compact && length >= 2 && length <= COMPACT_MAX_SPAN && slice.every((token) => token.length >= COMPACT_MIN_TOKEN)) {
        found = joined.get(slice.join(''));
      }
      if (found) {
        spans.push({ start: index, end: index + length, aliases: found });
        index += length;
        taken = true;
        break;
      }
    }
    if (!taken) index += 1;
  }
  return spans;
}

export interface LeadingIdentity<T> {
  /** How many tokens the identity consumed from the start. */
  readonly length: number;
  readonly aliases: readonly IdentityAlias<T>[];
}

/**
 * S56.3: the canonical identity that occupies the VERY START of `tokens` (longest alias wins). Nothing later is looked at,
 * so an opening route call cannot be outvoted by, or borrow, words further along.
 */
export function leadingIdentity<T>(tokens: readonly string[], aliases: readonly IdentityAlias<T>[], compact = false): LeadingIdentity<T> | undefined {
  const first = scanIdentities(tokens, aliases, compact)[0];
  return first && first.start === 0 ? { length: first.end, aliases: first.aliases } : undefined;
}

interface ResolveOptions<T> {
  /** Aliases sharing a key are the same identity; different keys are ambiguous. */
  readonly identityKey: (value: T) => string;
  /** Join adjacent words into one alias ("Anti Gravity" = "AntiGravity"). Players only. */
  readonly compact?: boolean;
  /** A number next to a Player name means an instance ("Claude 3"), which must match an instance alias exactly. */
  readonly adjacentNumberIsInstance?: boolean;
  /** Version decoration ("Sonnet 5") is tolerated only around a digit-free family alias. */
  readonly versionDecoration?: boolean;
  /** Other identity words on the roster/catalog, so a near-miss of one blocks instead of being silently ignored. */
  readonly knownTokens?: ReadonlySet<string>;
}

/**
 * Exactly one canonical identity contained in `raw` resolves. None, several, a negation/choice, or a leftover word one
 * typo away from another known identity does not. The caller decides what "unresolved" means for its dimension.
 */
export function resolveRouteIdentity<T>(raw: string, aliases: readonly IdentityAlias<T>[], options: ResolveOptions<T>): IdentityResolution<T> {
  const tokens = routeTokens(raw);
  if (!tokens.length) return { ok: false, reason: 'none' };
  if (isChoiceOrNegation(raw)) return { ok: false, reason: 'contradictory' };

  const spans = scanIdentities(tokens, aliases, options.compact === true);
  if (!spans.length) return { ok: false, reason: 'none' };
  const keys = new Set<string>();
  for (const span of spans) for (const alias of span.aliases) keys.add(options.identityKey(alias.value));
  if (keys.size > 1) return { ok: false, reason: 'ambiguous' };

  const covered = new Set<number>();
  for (const span of spans) for (let index = span.start; index < span.end; index += 1) covered.add(index);
  const matches = spans.flatMap((span) => span.aliases);

  if (options.adjacentNumberIsInstance) {
    for (const span of spans) {
      const before = span.start > 0 && !covered.has(span.start - 1) ? tokens[span.start - 1] : undefined;
      const after = span.end < tokens.length && !covered.has(span.end) ? tokens[span.end] : undefined;
      if ((before && IS_NUMBER.test(before)) || (after && IS_NUMBER.test(after))) return { ok: false, reason: 'instance' };
    }
  }
  if (options.versionDecoration) {
    const versioned = matches.some((alias) => routeTokens(alias.text).some((token) => /\d/.test(token)));
    const strayNumber = tokens.some((token, index) => !covered.has(index) && IS_NUMBER.test(token));
    // "GPT-5.6 Sol 2" has a digit-bearing identity, so a trailing number contradicts it instead of decorating it.
    if (versioned && strayNumber) return { ok: false, reason: 'contradictory' };
  }
  if (options.knownTokens) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (covered.has(index) || token.length < 4 || IS_NUMBER.test(token)) continue;
      for (const known of options.knownTokens) {
        if (known.length >= 4 && sameLengthNearMiss(token, known)) return { ok: false, reason: 'near-miss' };
      }
    }
  }
  return { ok: true, matches };
}

/** Every token of every alias, for the near-miss guard. */
export function identityTokens(aliases: readonly IdentityAlias<unknown>[]): Set<string> {
  const tokens = new Set<string>();
  for (const alias of aliases) for (const token of routeTokens(alias.text)) tokens.add(token);
  return tokens;
}

const EFFORT_FILLER = new Set(['reasoning', 'effort', 'level', 'thinking', 'mode', 'setting']);
const EFFORT_WORDS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * The supported effort vocabulary, presentation-normalized: "High", "**high**", "High reasoning", "Extra High",
 * "X-High", "Maximum". Anything else — including a choice ("high or low") — is not an effort.
 */
export function normalizeEffortValue(raw: string): string | undefined {
  const tokens = routeTokens(raw).filter((token) => !EFFORT_FILLER.has(token));
  if (tokens.length === 1) {
    if (EFFORT_WORDS.has(tokens[0])) return tokens[0];
    if (tokens[0] === 'maximum') return 'max';
    if (tokens[0] === 'med') return 'medium';
    return undefined;
  }
  if (tokens.length === 2 && (tokens[0] === 'extra' || tokens[0] === 'x') && tokens[1] === 'high') return 'xhigh';
  return undefined;
}
