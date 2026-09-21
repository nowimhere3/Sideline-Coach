/**
 * PLAYER PROVENANCE — every receiver that takes the field says who it actually was.
 *
 * WAS: The master report named the receiver a lane was ORIGINALLY assigned; after a substitution
 * that would have credited evidence to the wrong Player.
 *
 * IS: Each attempt carries identity resolved from runtime/config truth at the moment it takes the
 * field: agent alias, provider, exact model, a human display name (from the Combine depth chart when
 * it knows one), reasoning effort, and role. Reasoning effort is read from the agent definition only
 * when that definition actually declares one; otherwise it is stated as UNKNOWN — never guessed.
 *
 * WHY: Evidence is only as trustworthy as its attribution. If Nemotron produced a finding, the report
 * must say Nemotron, not the receiver that was benched.
 *
 * WILL BE: The same identity block can be projected onto product Formation parents and any future
 * Scout surface; reasoning effort becomes known wherever a provider/harness starts exposing it.
 *
 * No `vscode` import.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { combineDisplayNameForModel } from './scout-substitution';

export const REASONING_EFFORT_UNKNOWN = 'UNKNOWN - not exposed by provider (provider-managed)';
export const SCOUT_ROLE = 'Scout - read-only reconnaissance receiver';

export interface ReceiverIdentity {
  readonly agent: string;
  readonly provider: string;
  readonly model: string;
  /** Human name for the model: the depth chart's display name when known, else the model id without its provider prefix. */
  readonly displayName: string;
  readonly reasoningEffort: string;
  readonly role: string;
}

const PROVIDERS: Readonly<Record<string, string>> = {
  openrouter: 'OpenRouter',
  opencode: 'OpenCode Zen',
  google: 'Google Gemini API',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  antigravity: 'AntiGravity'
};

export function providerFromModel(model: string): string {
  const prefix = model.split('/', 1)[0]?.toLowerCase() ?? '';
  return PROVIDERS[prefix] ?? (prefix || 'UNKNOWN');
}

/** Reasoning effort as DECLARED by an agent definition's frontmatter; undefined when it declares none. */
export function reasoningEffortFromDefinition(source: string): string | undefined {
  const frontmatter = source.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!frontmatter) return undefined;
  const declared = frontmatter.match(/^\s*(?:reasoning[_-]?effort|effort)\s*:\s*["']?([A-Za-z0-9_.-]+)["']?\s*$/im)?.[1];
  return declared ? declared : undefined;
}

export function describeReceiver(input: {
  readonly gameRoot: string;
  readonly scoutIntelligenceRoot: string;
  readonly agent: string;
  readonly model: string;
}): ReceiverIdentity {
  let declared: string | undefined;
  try { declared = reasoningEffortFromDefinition(fs.readFileSync(path.join(input.gameRoot, '.opencode', 'agents', `${input.agent}.md`), 'utf8')); }
  catch { declared = undefined; }
  let displayName: string | undefined;
  try { displayName = combineDisplayNameForModel(input.scoutIntelligenceRoot, input.model); } catch { displayName = undefined; }
  return {
    agent: input.agent,
    provider: providerFromModel(input.model),
    model: input.model,
    displayName: displayName ?? (input.model.split('/').slice(1).join('/') || input.model),
    reasoningEffort: declared ?? REASONING_EFFORT_UNKNOWN,
    role: SCOUT_ROLE
  };
}
