import type {
  ModelDescriptor,
  PlayerRoutingCapability,
  ProviderCapabilitySnapshot,
  RoutingDecision,
  TaskClassification
} from './capability-types';

import { analyzePlay, classifyTask } from './play-analyzer';

// The classifier lives with the Play Analyzer; re-exported for existing callers.
export { classifyTask };

export interface ProviderRoutingPolicy {
  readonly provider: string;
  selectModel(task: TaskClassification, snapshot: ProviderCapabilitySnapshot): {
    modelId?: string;
    modelDisplayName: string;
    effort?: string;
    rationale: string;
  };
}

export class CodexRoutingPolicy implements ProviderRoutingPolicy {
  readonly provider = 'codex';

  selectModel(task: TaskClassification, snapshot: ProviderCapabilitySnapshot): {
    modelId?: string;
    modelDisplayName: string;
    effort?: string;
    rationale: string;
  } {
    const models = snapshot.models;
    if (models.length === 0) {
      return {
        modelId: undefined,
        modelDisplayName: 'Provider Default',
        effort: undefined,
        rationale: 'Standard Play · provider default'
      };
    }

    let matched: ModelDescriptor | undefined;
    let desiredEffort: string | undefined;
    let rationale = 'Standard Play · provider default model';

    if (task === 'architecture') {
      matched = models.find((m) => m.supportedEfforts.includes('ultra') || m.supportedEfforts.includes('max'))
        ?? models.find((m) => /astra|gpt-6|o3/i.test(m.id) || /astra|gpt-6|o3/i.test(m.displayName))
        ?? models[0];
      desiredEffort = matched.supportedEfforts.includes('ultra')
        ? 'ultra'
        : matched.supportedEfforts.includes('high')
          ? 'high'
          : matched.defaultEffort;
      rationale = 'High-complexity Play · strongest available reasoning model';
    } else if (task === 'implementation') {
      matched = models.find((m) => /sol|terra/i.test(m.id) || /sol|terra/i.test(m.displayName))
        ?? models.find((m) => m.isDefault)
        ?? models[0];
      desiredEffort = matched.supportedEfforts.includes('medium')
        ? 'medium'
        : matched.defaultEffort;
      rationale = 'Implementation Play · workhorse coding model';
    } else if (task === 'quick') {
      matched = models.find((m) => /luna|mini|flash/i.test(m.id) || /luna|mini|flash/i.test(m.displayName))
        ?? models[models.length - 1];
      desiredEffort = matched.supportedEfforts.includes('low')
        ? 'low'
        : matched.defaultEffort;
      rationale = 'Quick/bounded Play · fast responsive model';
    } else {
      matched = models.find((m) => m.isDefault) ?? models[0];
      desiredEffort = matched.defaultEffort;
      rationale = 'Standard Play · provider default model';
    }

    // Safety validation against live discovered catalog
    if (!models.some((m) => m.id === matched?.id)) {
      const defaultModel = models.find((m) => m.isDefault) ?? models[0];
      return {
        modelId: defaultModel?.id,
        modelDisplayName: defaultModel?.displayName ?? 'Provider Default',
        effort: defaultModel?.defaultEffort,
        rationale: 'Standard Play · provider default model'
      };
    }

    return {
      modelId: matched.id,
      modelDisplayName: matched.displayName,
      effort: desiredEffort,
      rationale
    };
  }
}

type PolicySelection = ReturnType<ProviderRoutingPolicy['selectModel']>;

function pickEffort(model: ModelDescriptor, preferred: readonly string[]): string | undefined {
  return preferred.find((effort) => model.supportedEfforts.includes(effort)) ?? model.defaultEffort;
}

function defaultSelection(models: readonly ModelDescriptor[], rationale: string): PolicySelection {
  const model = models.find((m) => m.isDefault) ?? models[0];
  return { modelId: model?.id, modelDisplayName: model?.displayName ?? 'Provider Default', effort: model?.defaultEffort, rationale };
}

/**
 * Controlled Claude (Q2.10C). Aliases come from Claude's own `/model` answer, so
 * every choice here is a model Claude listed; plan entitlement stays Claude's call.
 */
export class ClaudeRoutingPolicy implements ProviderRoutingPolicy {
  readonly provider = 'claude';

  selectModel(task: TaskClassification, snapshot: ProviderCapabilitySnapshot): PolicySelection {
    const models = snapshot.models;
    if (models.length === 0) return { modelId: undefined, modelDisplayName: 'Provider Default', effort: undefined, rationale: 'Standard Play · provider default' };
    const byId = (id: string) => models.find((m) => m.id === id);
    const choose = (ids: readonly string[], efforts: readonly string[], rationale: string): PolicySelection => {
      const model = ids.map(byId).find(Boolean);
      if (!model) return defaultSelection(models, 'Standard Play · Claude default model');
      return { modelId: model.id, modelDisplayName: model.displayName, effort: pickEffort(model, efforts), rationale };
    };
    if (task === 'architecture') return choose(['opus', 'sonnet'], ['high'], 'Hard architecture Play · Opus for depth');
    if (task === 'implementation') return choose(['sonnet', 'opus'], ['medium'], 'Implementation Play · Sonnet as the workhorse');
    if (task === 'quick') return choose(['haiku', 'sonnet'], ['low'], 'Quick Play · Haiku for speed');
    return defaultSelection(models, 'Standard Play · Claude default model');
  }
}

/** Controlled AntiGravity (Q2.10C). Models are families; reasoning is chosen separately. */
export class AntiGravityRoutingPolicy implements ProviderRoutingPolicy {
  readonly provider = 'antigravity';

  selectModel(task: TaskClassification, snapshot: ProviderCapabilitySnapshot): PolicySelection {
    const models = snapshot.models;
    if (models.length === 0) return { modelId: undefined, modelDisplayName: 'Provider Default', effort: undefined, rationale: 'Standard Play · provider default' };
    // `agy models` lists newest families first.
    const flash = models.find((m) => /flash/i.test(m.id) && m.supportedEfforts.length > 0);
    const pro = models.find((m) => /pro/i.test(m.id) && m.supportedEfforts.length > 0);
    const pick = (model: ModelDescriptor | undefined, efforts: readonly string[], rationale: string): PolicySelection =>
      model
        ? { modelId: model.id, modelDisplayName: model.displayName, effort: pickEffort(model, efforts), rationale }
        : { modelId: models[0].id, modelDisplayName: models[0].displayName, effort: pickEffort(models[0], efforts), rationale };
    if (task === 'architecture') return pick(pro ?? flash, ['high'], 'Hard architecture Play · strongest Gemini reasoning');
    if (task === 'implementation') return pick(flash, ['medium'], 'Implementation Play · newest Gemini Flash');
    if (task === 'quick') return pick(flash, ['low'], 'Quick Play · Gemini Flash at low reasoning');
    return pick(flash, ['medium'], 'Standard Play · newest Gemini Flash');
  }
}

/** The routing policy table every Control Plane component shares. */
export function createRoutingPolicies(): Map<string, ProviderRoutingPolicy> {
  return new Map<string, ProviderRoutingPolicy>([
    ['codex', new CodexRoutingPolicy()],
    ['claude', new ClaudeRoutingPolicy()],
    ['antigravity', new AntiGravityRoutingPolicy()]
  ]);
}

/**
 * Which provider AUTO prefers for a kind of Play when several are ready. A small,
 * explicit table — not hidden intelligence — until Routing Settings let the human
 * shape it (Architect + Workers / Custom).
 */
const PROVIDER_PREFERENCE: Readonly<Record<TaskClassification, readonly string[]>> = {
  architecture: ['claude', 'codex', 'antigravity'],
  implementation: ['codex', 'claude', 'antigravity'],
  quick: ['antigravity', 'claude', 'codex'],
  default: ['codex', 'claude', 'antigravity']
};

const PLAY_WORDS: Readonly<Record<TaskClassification, string>> = {
  architecture: 'architecture',
  implementation: 'implementation',
  quick: 'quick',
  default: 'standard'
};

/** Instance work memory AUTO can read. Absent means Unknown, never idle. */
export type InstanceWorkState = 'idle' | 'working' | 'waiting' | 'queued' | 'completed' | 'unknown' | 'disconnected';

function isKnownIdle(candidate: PlayerRoutingCapability): boolean {
  const work = (candidate as { work?: { workState?: InstanceWorkState } }).work?.workState;
  return work === 'idle' || work === 'completed';
}

/** Human Player name: the field label without any transport suffix. */
function playerName(candidate: PlayerRoutingCapability): string {
  return candidate.fieldLabel.split(' · ')[0];
}

function rank(order: readonly string[], playerType: string): number {
  const index = order.indexOf(playerType);
  return index < 0 ? order.length : index;
}

/** "Claude", "Claude and AntiGravity", "Claude, AntiGravity and Codex 2". */
function humanList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function computeAutoRoute(
  activeGameId: string,
  prompt: string,
  everyCandidate: readonly PlayerRoutingCapability[],
  policies: Map<string, ProviderRoutingPolicy>
): { decision?: RoutingDecision; error?: string } {
  // Terminal runs exact shell commands; AUTO never routes a natural-language Play to a
  // raw shell. Terminal stays a MANUAL target (future: zero-token executor for
  // explicit commands when policy allows).
  const allCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell');
  if (allCandidates.length === 0 && everyCandidate.length > 0) {
    return { error: 'Terminal runs exact commands, so AUTO does not send it Plays. Choose Terminal in Manual, or put a reasoning Player on field.' };
  }
  if (allCandidates.length === 0) {
    return { error: 'No Player is on field. Add a Player or put one on field to continue.' };
  }

  // Only Players that can take a Play are routing candidates. A Player that needs
  // attention (unavailable / needs verification) must not stall AUTO for the rest
  // of the team — and must never be described as "working". Field evidence Q2.10B:
  // an unavailable Codex made AUTO say "currently working" while Claude and
  // AntiGravity were ready on field.
  const takingPlays = allCandidates.filter((c) => c.state === 'ready' || c.state === 'busy');
  if (takingPlays.length === 0) {
    const names = humanList(allCandidates.map(playerName));
    return { error: `${names} can't take Plays right now. Check the Roster for what needs attention.` };
  }
  const candidates = takingPlays;

  // AUTO chooses WHO; the Player's transport decides HOW. With exactly one
  // Player on field there is no routing choice to make, so AUTO selects it even
  // when it is reached through its terminal. Candidates are already only
  // on-field, dispatchable agents (never a bare Terminal Player), and a terminal
  // Player's model and effort stay provider-managed rather than being faked.
  if (candidates.length === 1 && candidates[0].transport === 'legacy') {
    const only = candidates[0];
    const name = playerName(only);
    return {
      decision: {
        mode: 'auto',
        gameId: activeGameId,
        playerInstanceId: only.instanceId,
        playerLabel: name,
        provider: only.capability?.provider ?? only.playerType,
        model: undefined,
        modelDisplayName: 'Provider managed',
        effort: undefined,
        reason: 'AUTO selected the only Player on field.',
        stagedAt: Date.now(),
        transport: 'legacy',
        playLabel: analyzePlay(prompt).label,
        rationale: {
          player: 'Only Player on field.',
          instance: `${only.instanceId} is the only instance on field.`,
          model: 'Terminal session keeps its own model; Coach does not change it.',
          effort: 'Terminal session keeps its own effort; Coach does not change it.'
        },
        summary: `${name} is the only Player on field.`
      }
    };
  }

  const controlledCandidates = candidates.filter((c) => c.transport === 'controlled');
  if (controlledCandidates.length === 0) {
    // Choosing between several terminal Players needs the Q2.10 Play Analyzer.
    // Until then, say plainly who is on field and let the human pick.
    const names = humanList(candidates.map(playerName));
    return { error: `${names} are on field. Choose who gets this Play in Manual — AUTO will pick between several Players in a later update.` };
  }

  const readyCandidates = controlledCandidates.filter((c) => c.state === 'ready');
  if (readyCandidates.length === 0) {
    return { error: 'All controlled Players are currently working. Wait or switch to Manual.' };
  }

  // Critical Amendment 1: AUTO never routes on missing live capability truth.
  const operable = readyCandidates.filter((c) => c.capability.freshness !== 'unavailable' && c.capability.models.length > 0);
  if (operable.length === 0) {
    return { error: 'Live routing capabilities are unavailable. Refresh capabilities or switch to Manual.' };
  }

  const task = classifyTask(prompt);

  // WHO: the preferred provider for this kind of Play that has a Player ready.
  const readyProviders = [...new Set(operable.map((c) => c.playerType))];
  const preference = PROVIDER_PREFERENCE[task];
  const chosenType = [...readyProviders].sort((a, b) => rank(preference, a) - rank(preference, b))[0];

  // WHICH INSTANCE: a sibling the Instance Work Ledger knows is idle beats one whose
  // work state is unknown; otherwise the first free instance, deterministically.
  // Context affinity (a busy owner of the right context) is a later Play.
  const ofType = operable.filter((c) => c.playerType === chosenType);
  const candidate = ofType.find(isKnownIdle) ?? ofType[0];
  const siblings = controlledCandidates.filter((c) => c.playerType === candidate.playerType);
  const busySiblings = siblings.filter((c) => c.instanceId !== candidate.instanceId && c.state === 'busy');
  const snapshot = candidate.capability;

  const policy = policies.get(candidate.capability.provider) ?? new CodexRoutingPolicy();
  const selection = policy.selectModel(task, snapshot);
  const name = playerName(candidate);
  const idleNote = isKnownIdle(candidate) && siblings.length > 1 ? 'idle' : 'free';

  const decision: RoutingDecision = {
    mode: 'auto',
    gameId: activeGameId,
    playerInstanceId: candidate.instanceId,
    playerLabel: candidate.fieldLabel,
    provider: candidate.capability.provider,
    model: selection.modelId,
    modelDisplayName: selection.modelDisplayName,
    effort: selection.effort,
    reason: `${selection.rationale} (${candidate.fieldLabel})`,
    stagedAt: Date.now(),
    transport: 'controlled',
    playLabel: analyzePlay(prompt).label,
    rationale: {
      player: readyProviders.length > 1
        ? `${name} selected as the preferred Player for ${/^[aeiou]/.test(PLAY_WORDS[task]) ? 'an' : 'a'} ${PLAY_WORDS[task]} Play.`
        : `${candidate.capability.provider} is the controlled Player able to take this Play.`,
      instance: siblings.length > 1
        ? `${candidate.instanceId} chosen: ${idleNote}${busySiblings.length ? ` while ${busySiblings.map((c) => c.instanceId).join(', ')} ${busySiblings.length === 1 ? 'is' : 'are'} working` : ''}.`
        : `${candidate.instanceId} is the only instance of its type on field.`,
      model: selection.rationale,
      effort: selection.effort ? `${selection.effort} for a ${task} Play.` : 'Provider default effort.'
    },
    summary: busySiblings.length
      ? `${name} is free and can run this Play now.`
      : `${name} can run this Play now.`
  };

  return { decision };
}

/**
 * Resolve Coach "Auto" for a MANUAL Play whose Player the human picked.
 *
 *   Auto              → Coach chooses the model/effort for this Play.
 *   Provider Default  → '' / 'default' → never overridden (handled by the adapter).
 *
 * Coach only resolves Auto where it can actually operate the control (a Controlled
 * Player with live capability). Elsewhere Auto resolves to "don't override",
 * which is truthful: the Player keeps its own settings.
 */
export function resolveCoachAuto(
  candidate: PlayerRoutingCapability | undefined,
  prompt: string,
  requested: { model?: string; effort?: string },
  policies: Map<string, ProviderRoutingPolicy>
): { model?: string; effort?: string } {
  const wantsAuto = requested.model === 'auto' || requested.effort === 'auto';
  if (!wantsAuto) return requested;
  const operable = candidate?.transport === 'controlled'
    && candidate.capability.freshness !== 'unavailable'
    && candidate.capability.models.length > 0;
  if (!operable) {
    return {
      model: requested.model === 'auto' ? undefined : requested.model,
      effort: requested.effort === 'auto' ? undefined : requested.effort
    };
  }
  const policy = policies.get(candidate!.capability.provider) ?? new CodexRoutingPolicy();
  const snapshot = candidate!.capability;
  const selection = policy.selectModel(classifyTask(prompt), snapshot);
  const model = requested.model === 'auto' ? selection.modelId : requested.model;
  let effort = requested.effort === 'auto' ? selection.effort : requested.effort;
  // An Auto effort must be one the chosen model supports; otherwise leave the default.
  const chosen = snapshot.models.find((entry) => entry.id === model);
  if (requested.effort === 'auto' && effort && chosen && !chosen.supportedEfforts.includes(effort)) effort = chosen.defaultEffort;
  return { model, effort };
}
