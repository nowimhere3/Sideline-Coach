/**
 * Provider control capability — what Coach can do *to a provider's settings*,
 * kept deliberately separate from transport (how bytes reach the Player).
 *
 *   Player ≠ Transport ≠ Provider controls ≠ Routing eligibility
 *
 * A terminal-backed Claude can still expose model and reasoning controls through
 * its own CLI. Whether Coach may *use* a control is a separate, evidence-backed
 * state. This module imports no `vscode` API; probes are injected by the Stadium.
 */

import type { PlayerId } from './player-adapters';

/**
 * available       Coach can change this setting safely and see the result.
 * requires-proof  The provider exposes a control, but Coach has not proven it is
 *                 safe to operate (for example it may change the human's own
 *                 defaults). Shown truthfully; never operated.
 * unavailable     The provider exposes no control Coach can reach.
 * unknown         Coach could not determine it. Never guessed.
 */
export type ProviderControlState = 'available' | 'requires-proof' | 'unavailable' | 'unknown';

/** How a control would be operated. Provider-specific mechanics stay in adapters. */
export type ProviderControlMechanism = 'semantic' | 'launch-flag' | 'session-command' | 'none';

export type ProviderOptionAvailability = 'available' | 'unavailable' | 'requires-credits' | 'unknown';

export interface ProviderSettingOption {
  /** Provider-native id Coach would pass to the provider, e.g. `opus`, `xhigh`. */
  readonly id: string;
  /** Human wording, e.g. `Opus`, `Extra High`. */
  readonly label: string;
  readonly availability: ProviderOptionAvailability;
}

export interface ProviderSettingControl {
  readonly state: ProviderControlState;
  readonly mechanism: ProviderControlMechanism;
  readonly options: readonly ProviderSettingOption[];
  /**
   * The provider's own *default* as it reports it (for Claude, its configured
   * default for new sessions). Not a claim about a live session the human may
   * have changed by hand.
   */
  readonly currentLabel?: string;
  /** One plain sentence for the human when the control cannot be used yet. */
  readonly note?: string;
}

/**
 * Proof that a provider supports per-Play model/effort WITHOUT touching the
 * human's global settings, through a Coach-owned structured session.
 *
 * Q2.10B evidence (settings files SHA-256-identical before and after):
 *   Claude 2.1.270 — `claude -p --output-format json --model haiku --effort low`, then
 *     `--resume <session> --model sonnet --input-format stream-json` → same session,
 *     model switched to claude-sonnet-5, `~/.claude/settings.json` unchanged.
 *   AntiGravity 1.2.2 — `agy -p --output-format json --model gemini-3.6-flash-low`, then
 *     `--conversation <id> --model gemini-3.7-flash-low` → same conversation (num_turns 2),
 *     `~/.gemini/antigravity-cli/settings.json` unchanged.
 * This applies to a Controlled Player Coach launches, never to a human's
 * interactive terminal session.
 */
export interface SessionScopedControlProof {
  readonly mechanism: 'structured-print';
  readonly proven: boolean;
  readonly evidence: string;
}

export interface ProviderControlProfile {
  readonly playerType: PlayerId;
  /** Can Coach send a Play at all, and how. */
  readonly promptDelivery: 'semantic' | 'terminal-text';
  /** Does Coach get structured turn lifecycle events (received / working / done)? */
  readonly semanticTurns: boolean;
  readonly model: ProviderSettingControl;
  readonly effort: ProviderSettingControl;
  /** Whether a Coach-owned session can switch model/effort per Play safely. */
  readonly sessionScopedControl?: SessionScopedControlProof;
  readonly observedAt: number;
  /** Where the facts came from, for Advanced diagnostics only. */
  readonly source: string;
}

// --- Claude CLI parsing ----------------------------------------------------

export interface ClaudeModelStatus {
  /** e.g. `Opus 5` */
  readonly currentModelLabel?: string;
  /** e.g. `high` */
  readonly currentEffort?: string;
  /** Aliases the CLI lists as available, e.g. `sonnet`, `opus`, `default`. */
  readonly aliases: readonly string[];
}

/**
 * Parse `claude -p '/model'`, a local command that reports without an API call:
 *
 *   Current model: `Opus 5` (effort: high)
 *   Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, …, default, or a full model ID.
 *
 * Strict on purpose: if the CLI ever answers differently (for example a future
 * version routes it to the model), the result is `undefined` → control `unknown`.
 */
export function parseClaudeModelStatus(text: string): ClaudeModelStatus | undefined {
  const current = /Current model:\s*`?([^`\n(]+?)`?\s*(?:\(effort:\s*([a-z-]+)\))?\s*$/im.exec(text);
  const available = /Available:\s*([^\n]+?)(?:,?\s*or a full model ID)?\.?\s*$/im.exec(text);
  if (!current && !available) return undefined;

  const aliases = available
    ? available[1].split(',').map((entry) => entry.trim()).filter((entry) => /^[a-z][a-z0-9\-\[\]]*$/i.test(entry))
    : [];

  return {
    currentModelLabel: current?.[1]?.trim() || undefined,
    currentEffort: current?.[2]?.trim().toLowerCase() || undefined,
    aliases
  };
}

/** Parse `claude -p '/effort'` → `Usage: /effort <low|medium|high|xhigh|max|auto>`. */
export function parseClaudeEffortLevels(text: string): string[] | undefined {
  const usage = /\/effort\s*<([a-z|]+)>/i.exec(text);
  if (!usage) return undefined;
  return usage[1].split('|').map((level) => level.trim().toLowerCase()).filter(Boolean);
}

/** Primary Claude model aliases shown to a human; long-context and plan variants stay advanced. */
const CLAUDE_PRIMARY_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'fable', label: 'Fable' },
  { id: 'default', label: 'Provider Default' }
];

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max'
};

export function effortLabel(level: string | undefined): string | undefined {
  if (!level) return undefined;
  return EFFORT_LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Why Claude's live controls are `requires-proof` rather than `available`.
 * Evidence (Claude Code 2.1.270): selecting a model inside a running session can
 * be persisted to the human's user settings, changing their default for every
 * future Claude session. Coach must not silently rewrite a human's configuration
 * per Play, so the control is shown but not operated until that is proven safe.
 */
export const CLAUDE_LIVE_CONTROL_NOTE =
  "Coach can see this terminal Claude's settings but doesn't change them — changing Claude's model from a running session can also change your Claude default. Claude Players Coach starts can switch per Play.";

/**
 * Build Claude's control profile from its own CLI answers. Absent or unparseable
 * answers produce `unknown`, never a guessed list.
 */
export function claudeControlProfile(
  modelStatus: ClaudeModelStatus | undefined,
  effortLevels: readonly string[] | undefined,
  source: string,
  observedAt = Date.now()
): ProviderControlProfile {
  const model: ProviderSettingControl = modelStatus
    ? {
        state: 'requires-proof',
        mechanism: 'session-command',
        options: CLAUDE_PRIMARY_MODELS
          .filter((entry) => modelStatus.aliases.length === 0 || modelStatus.aliases.includes(entry.id))
          // The CLI lists aliases, not plan entitlement, so availability stays honest.
          .map((entry) => ({ id: entry.id, label: entry.label, availability: 'unknown' as const })),
        currentLabel: modelStatus.currentModelLabel,
        note: CLAUDE_LIVE_CONTROL_NOTE
      }
    : { state: 'unknown', mechanism: 'none', options: [] };

  const levels = (effortLevels ?? []).filter((level) => level !== 'auto');
  const effort: ProviderSettingControl = effortLevels
    ? {
        state: 'requires-proof',
        mechanism: 'session-command',
        options: levels.map((level) => ({ id: level, label: effortLabel(level) ?? level, availability: 'unknown' as const })),
        currentLabel: effortLabel(modelStatus?.currentEffort),
        note: CLAUDE_LIVE_CONTROL_NOTE
      }
    : { state: 'unknown', mechanism: 'none', options: [] };

  return {
    playerType: 'claude',
    promptDelivery: 'terminal-text',
    semanticTurns: false,
    model,
    effort,
    sessionScopedControl: CLAUDE_SESSION_SCOPED_PROOF,
    observedAt,
    source
  };
}

export const CLAUDE_SESSION_SCOPED_PROOF: SessionScopedControlProof = {
  mechanism: 'structured-print',
  proven: true,
  evidence: 'Q2.10B: claude -p --resume <session> switched haiku → sonnet in one session; ~/.claude/settings.json hash unchanged.'
};

export const ANTIGRAVITY_SESSION_SCOPED_PROOF: SessionScopedControlProof = {
  mechanism: 'structured-print',
  proven: true,
  evidence: 'Q2.10B: agy -p --conversation <id> switched gemini-3.6-flash-low → gemini-3.7-flash-low in one conversation; antigravity-cli settings hash unchanged.'
};

// --- AntiGravity CLI parsing ------------------------------------------------

export interface AntiGravityModel {
  /** Provider-native id, e.g. `gemini-3.8-flash-high`. */
  readonly id: string;
  /** e.g. `Gemini 3.8 Flash (High)` */
  readonly label: string;
  /** Model family without the effort variant, e.g. `gemini-3.8-flash`. */
  readonly family: string;
  /** e.g. `Gemini 3.8 Flash` */
  readonly familyLabel: string;
  /** Effort encoded in the id variant, when present. */
  readonly effort?: 'low' | 'medium' | 'high';
}

/**
 * Parse `agy models` (AntiGravity 1.2.2): one `id<TAB>Display Name` per line,
 * after a "Fetching available models..." banner. Effort variants are encoded in
 * the id suffix (`-low|-medium|-high`). Strict: no rows → undefined → Unknown.
 */
export function parseAntiGravityModels(text: string): AntiGravityModel[] | undefined {
  const models: AntiGravityModel[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z0-9][a-z0-9.\-]*)\t+(.+?)\s*$/i.exec(line.trim().length ? line : '');
    if (!match) continue;
    const id = match[1];
    const label = match[2];
    const variant = /-(low|medium|high)$/.exec(id);
    const family = variant ? id.slice(0, -variant[0].length) : id;
    const familyLabel = label.replace(/\s*\((low|medium|high)\)\s*$/i, '').trim() || label;
    models.push({ id, label, family, familyLabel, effort: variant ? (variant[1] as 'low' | 'medium' | 'high') : undefined });
  }
  return models.length ? models : undefined;
}

export const ANTIGRAVITY_LIVE_CONTROL_NOTE =
  "Coach can see AntiGravity's models but doesn't change this terminal session's settings — a Controlled AntiGravity can switch them per Play safely.";

/** AntiGravity's control profile for a terminal session, from `agy models`. */
export function antigravityControlProfile(models: readonly AntiGravityModel[] | undefined, source: string, observedAt = Date.now()): ProviderControlProfile {
  if (!models) {
    return {
      playerType: 'antigravity', promptDelivery: 'terminal-text', semanticTurns: false,
      model: { state: 'unknown', mechanism: 'none', options: [] },
      effort: { state: 'unknown', mechanism: 'none', options: [] },
      sessionScopedControl: ANTIGRAVITY_SESSION_SCOPED_PROOF, observedAt, source
    };
  }
  const families = new Map<string, string>();
  const efforts = new Set<string>();
  for (const model of models) {
    if (!families.has(model.family)) families.set(model.family, model.familyLabel);
    if (model.effort) efforts.add(model.effort);
  }
  const order = ['low', 'medium', 'high'];
  return {
    playerType: 'antigravity',
    promptDelivery: 'terminal-text',
    semanticTurns: false,
    model: {
      state: 'requires-proof',
      mechanism: 'session-command',
      options: [...families.entries()].map(([id, label]) => ({ id, label, availability: 'available' as const })),
      note: ANTIGRAVITY_LIVE_CONTROL_NOTE
    },
    effort: {
      state: 'requires-proof',
      mechanism: 'session-command',
      options: order.filter((level) => efforts.has(level)).map((level) => ({ id: level, label: effortLabel(level) ?? level, availability: 'available' as const })),
      note: ANTIGRAVITY_LIVE_CONTROL_NOTE
    },
    sessionScopedControl: ANTIGRAVITY_SESSION_SCOPED_PROOF,
    observedAt,
    source
  };
}

// --- Controlled Claude / AntiGravity capability snapshots (Q2.10C) -----------

interface SnapshotModel {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string;
  readonly isDefault: boolean;
  readonly supportedEfforts: readonly string[];
  readonly defaultEffort?: string;
}

export interface PrintProviderSnapshot {
  readonly provider: string;
  readonly authenticated: boolean;
  readonly models: readonly SnapshotModel[];
  readonly defaultModelId?: string;
  readonly observedAt: number;
  readonly freshness: 'live' | 'unavailable';
}

/**
 * A Controlled Claude's live capability, from its own local `/model` and
 * `/effort` answers. Claude lists aliases, not plan entitlement, so a model such
 * as Fable is offered as the provider lists it and the provider answers the Play.
 * `authenticated` is not observable from these local answers and stays false.
 */
export function claudeCapabilitySnapshot(
  modelStatus: ClaudeModelStatus | undefined,
  effortLevels: readonly string[] | undefined,
  observedAt = Date.now()
): PrintProviderSnapshot {
  if (!modelStatus) return { provider: 'claude', authenticated: false, models: [], observedAt: 0, freshness: 'unavailable' };
  const efforts = (effortLevels ?? []).filter((level) => level !== 'auto');
  const current = modelStatus.currentModelLabel?.toLowerCase() ?? '';
  const models = CLAUDE_PRIMARY_MODELS
    .filter((entry) => entry.id !== 'default')
    .filter((entry) => modelStatus.aliases.length === 0 || modelStatus.aliases.includes(entry.id))
    .map((entry) => ({
      id: entry.id,
      displayName: entry.label,
      description: 'Plan availability is decided by Claude when the Play runs.',
      isDefault: current.startsWith(entry.label.toLowerCase()),
      supportedEfforts: efforts,
      defaultEffort: modelStatus.currentEffort
    }));
  return {
    provider: 'claude',
    authenticated: false,
    models,
    defaultModelId: models.find((model) => model.isDefault)?.id,
    observedAt,
    freshness: models.length ? 'live' : 'unavailable'
  };
}

/**
 * AntiGravity's native model family + reasoning variants, as one model per family.
 * `gemini-3.8-flash-low|medium|high` → Gemini 3.8 Flash with Low / Medium / High.
 * Medium is AntiGravity's own default variant for a family (1.2.2 changelog).
 */
export function antigravityCapabilitySnapshot(models: readonly AntiGravityModel[] | undefined, observedAt = Date.now()): PrintProviderSnapshot {
  if (!models?.length) return { provider: 'antigravity', authenticated: false, models: [], observedAt: 0, freshness: 'unavailable' };
  const order = ['low', 'medium', 'high'];
  const families = new Map<string, { label: string; efforts: Set<string> }>();
  for (const model of models) {
    const entry = families.get(model.family) ?? { label: model.familyLabel, efforts: new Set<string>() };
    if (model.effort) entry.efforts.add(model.effort);
    families.set(model.family, entry);
  }
  return {
    provider: 'antigravity',
    authenticated: false,
    models: [...families.entries()].map(([id, entry]) => {
      const efforts = order.filter((level) => entry.efforts.has(level));
      return {
        id,
        displayName: entry.label,
        isDefault: false,
        supportedEfforts: efforts,
        defaultEffort: efforts.includes('medium') ? 'medium' : efforts[0]
      };
    }),
    observedAt,
    freshness: 'live'
  };
}

/**
 * Translate a human choice (family + reasoning) into AntiGravity's own flags.
 * Provider syntax stays here. Proven on 1.2.2: a family with variants requires
 * an effort; a variant id already carries one; a model without variants rejects
 * `--effort`. `default` means Coach does not override that dimension.
 */
export function antigravityModelArgs(
  catalog: readonly AntiGravityModel[] | undefined,
  model: string | undefined,
  effort: string | undefined
): string[] {
  const chosenModel = model && model !== 'default' && model !== 'auto' ? model : undefined;
  const chosenEffort = effort && effort !== 'default' && effort !== 'auto' ? effort : undefined;
  if (!chosenModel) return chosenEffort ? ['--effort', chosenEffort] : [];
  if (!catalog?.length) return chosenEffort ? ['--model', chosenModel, '--effort', chosenEffort] : ['--model', chosenModel];
  const exact = catalog.find((entry) => entry.id === chosenModel);
  if (exact) return ['--model', exact.id];
  const variants = catalog.filter((entry) => entry.family === chosenModel && entry.effort);
  if (!variants.length) return ['--model', chosenModel];
  const variant = variants.find((entry) => entry.effort === chosenEffort)
    ?? variants.find((entry) => entry.effort === 'medium')
    ?? variants[0];
  return ['--model', variant.id];
}

// --- Codex (controlled) and the exact-instance projection -------------------

interface CapabilityLike {
  readonly provider: string;
  readonly freshness: 'live' | 'cached' | 'stale' | 'unavailable';
  readonly models: ReadonlyArray<{ readonly id: string; readonly displayName: string; readonly supportedEfforts: readonly string[]; readonly isDefault?: boolean }>;
}

/** A Controlled Player's live provider capability, as a control profile Coach can operate. */
export function controlledControlProfile(
  playerType: PlayerId,
  capability: CapabilityLike,
  active: { readonly model?: string; readonly effort?: string } = {},
  observedAt = Date.now()
): ProviderControlProfile {
  const efforts = new Set<string>();
  for (const model of capability.models) for (const effort of model.supportedEfforts) efforts.add(effort);
  const activeModel = capability.models.find((model) => model.id === active.model);
  return {
    playerType,
    promptDelivery: 'semantic',
    semanticTurns: true,
    model: {
      state: 'available',
      mechanism: 'semantic',
      options: capability.models.map((model) => ({ id: model.id, label: model.displayName, availability: 'available' as const })),
      currentLabel: activeModel?.displayName ?? active.model
    },
    effort: {
      state: efforts.size ? 'available' : 'unavailable',
      mechanism: efforts.size ? 'semantic' : 'none',
      options: [...efforts].map((level) => ({ id: level, label: effortLabel(level) ?? level, availability: 'available' as const })),
      currentLabel: effortLabel(active.effort)
    },
    observedAt,
    source: `${capability.provider} controlled capability (${capability.freshness})`
  };
}

/**
 * The ONE answer the Dispatcher reads for an exact Player instance.
 *
 * Source priority (Q2.10B):
 *   exact live Controlled capability > provider-specific safe discovery > Unknown.
 * Never replaces an exact instance's live capability with a generic Player-type
 * default, and never invents controls when neither source knows.
 */
export function projectInstanceControls(
  instance: {
    readonly playerType: string;
    readonly transport: 'controlled' | 'legacy';
    readonly capability?: CapabilityLike;
    readonly activeModel?: string;
    readonly activeEffort?: string;
  },
  discoveryControls: ProviderControlProfile | undefined
): ProviderControlProfile | undefined {
  const capability = instance.capability;
  if (instance.transport === 'controlled' && capability && capability.freshness !== 'unavailable' && capability.models.length > 0) {
    return controlledControlProfile(instance.playerType as PlayerId, capability, { model: instance.activeModel, effort: instance.activeEffort });
  }
  if (instance.transport === 'legacy' && discoveryControls && discoveryControls.playerType === instance.playerType) {
    return discoveryControls;
  }
  return undefined;
}
