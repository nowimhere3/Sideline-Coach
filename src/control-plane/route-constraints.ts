/**
 * Q2.10E-B — conservative, catalog-validated Play-level route constraints.
 *
 * This is deliberately not general NLP. Only an unmistakable opening imperative
 * or a small structured routing field can narrow AUTO, and every recognized name
 * must already exist in this Game's Player/model/effort truth.
 */

import type { PlayerRoutingCapability, RouteConstraints } from '../capability-types';
import type { InstanceLedgerEntry } from './work-ledger';

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

function exactAlias<T>(text: string, aliases: readonly Alias<T>[]): Alias<T> | undefined {
  const source = normalized(text);
  return aliases.find((alias) => source === normalized(alias.text));
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

function playerAliases(
  candidates: readonly PlayerRoutingCapability[],
  ledger: readonly InstanceLedgerEntry[],
  names: ReadonlyMap<string, string> | undefined
): Alias<{ playerType: string; playerInstanceId?: string }>[] {
  const aliases: Alias<{ playerType: string; playerInstanceId?: string }>[] = [];
  const typeNames = new Map<string, string>();
  for (const candidate of candidates) {
    const display = candidate.fieldLabel.replace(/\s*(?:Â·|·).*$/, '').replace(/\s+\d+$/, '').trim() || title(candidate.playerType);
    typeNames.set(candidate.playerType, display);
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
  return uniqueAliases(aliases);
}

function modelAliases(candidates: readonly PlayerRoutingCapability[]): Alias<{ id: string; displayName: string }>[] {
  const aliases: Alias<{ id: string; displayName: string }>[] = [];
  for (const candidate of candidates) {
    for (const model of candidate.capability.models) {
      aliases.push({ text: model.id, value: { id: model.id, displayName: model.displayName } });
      aliases.push({ text: model.displayName, value: { id: model.id, displayName: model.displayName } });
    }
  }
  return uniqueAliases(aliases);
}

/** Recognize only explicit, known route intent. No match means ordinary AUTO. */
export function recognizeRouteConstraints(input: {
  prompt: string;
  candidates: readonly PlayerRoutingCapability[];
  ledger?: readonly InstanceLedgerEntry[];
  names?: ReadonlyMap<string, string>;
}): RouteConstraints | undefined {
  const ledger = input.ledger ?? [];
  const lines = routeLines(input.prompt);
  const allPlayerAliases = playerAliases(input.candidates, ledger, input.names);
  let player: { playerType: string; playerInstanceId?: string } | undefined;
  let body = '';
  for (const line of lines) {
    const field = structuredRouteField(line);
    const directive = directiveBody(line);
    if (!directive) continue;
    const matched = field?.dimension === 'player'
      ? exactAlias(directive, allPlayerAliases)
      : aliasesAtStart(directive, allPlayerAliases);
    if (!matched) continue;
    player = matched.value;
    body = directive;
    break;
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
  if (modelText) {
    const aliases = modelAliases(relevantCandidates);
    model = (structuredModel ? exactAlias(modelText, aliases) : aliasesAtStart(modelText, aliases))?.value;
  }
  const supported = new Set((model
    ? relevantCandidates.flatMap((candidate) => candidate.capability.models.filter((item) => item.id === model!.id).flatMap((item) => item.supportedEfforts))
    : relevantCandidates.flatMap((candidate) => candidate.capability.models.flatMap((item) => item.supportedEfforts))).map((item) => item.toLowerCase()));
  const effortText = structuredValue(lines, 'effort');
  const effortMatch = effortText
    ? /^(low|medium|high|xhigh|max)$/i.exec(normalized(effortText))
    : player ? /(?:,\s*|\bwith\s+|\bat\s+)(low|medium|high|xhigh|max)\b/i.exec(body) : undefined;
  if (effortMatch && supported.has(effortMatch[1].toLowerCase())) effort = effortMatch[1].toLowerCase();

  const excluded = new Set<string>();
  const exclusions = modelAliases(input.candidates);
  for (const line of lines) {
    const denied = /\b(?:don't|do not|never)\s+use\s+(.+)$/i.exec(line);
    if (!denied) continue;
    const match = aliasesAtStart(denied[1], exclusions);
    if (match) excluded.add(match.value.id);
  }

  if (!player && !model && !effort && excluded.size === 0) return undefined;
  const recognized: RouteConstraints['recognized'][number][] = [];
  if (player?.playerInstanceId) recognized.push('instance');
  else if (player) recognized.push('player');
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
    recognized
  };
}
