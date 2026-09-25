import type {
  ModelDescriptor,
  PlayerRoutingCapability,
  ProviderCapabilitySnapshot,
  RouteConstraints,
  RoutingDecision,
  TaskClassification
} from './capability-types';

import { analyzePlay, analyzeScoutNeed, classifyTask } from './play-analyzer';
import {
  buildHandoffPreamble,
  detectCollision,
  detectFollowUp,
  playModifiesGame,
  resolveContextOwner,
  type GameReportRef
} from './control-plane/context-affinity';
import type { InstanceLedgerEntry } from './control-plane/work-ledger';
import { recognizeRouteConstraints } from './control-plane/route-constraints';
import { resolveSmartRouteConstraints } from './control-plane/smart-route-resolver';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from './scout-player-contract';
import { classifyShellIntent } from './terminal-intent';

// The classifier lives with the Play Analyzer; re-exported for existing callers.
export { classifyTask, resolveSmartRouteConstraints };

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
    // AntiGravity is an execution provider, not a model: its catalog may carry Gemini,
    // Claude, GPT-OSS or future families, so the rationale names the model actually chosen.
    const pick = (model: ModelDescriptor | undefined, efforts: readonly string[], play: string): PolicySelection => {
      const chosen = model ?? models[0];
      return { modelId: chosen.id, modelDisplayName: chosen.displayName, effort: pickEffort(chosen, efforts), rationale: `${play} · ${chosen.displayName} via AntiGravity` };
    };
    if (task === 'architecture') return pick(pro ?? flash, ['high'], 'Hard architecture Play');
    if (task === 'implementation') return pick(flash, ['medium'], 'Implementation Play');
    if (task === 'quick') return pick(flash, ['low'], 'Quick Play');
    return pick(flash, ['medium'], 'Standard Play');
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
/**
 * BREADCRUMB — variable Teams and adaptive Team intelligence.
 *
 * WAS: Early routing used useful general provider/model assumptions and the
 * owner's Team (Claude, Codex, AntiGravity, later Scout). Examples could look
 * like those identities were permanent role assignments.
 *
 * IS: A Team is installation- and Game-specific. Routing, including post-Scout
 * continuation, considers only the actual live eligible candidates supplied
 * for this Game. Architect, Worker, Reviewer, and Scout are job needs, not
 * aliases for provider names. The table below is a cold-start preference among
 * candidates that really exist, never a dependency that invents a missing one.
 *
 * WHY: Sideline is a general Coach, not orchestration around one developer's
 * subscriptions. Human choice remains authoritative, and a Team missing any
 * familiar provider must still get the strongest truthful route it can field.
 * Observation is distinct from policy: provider/auth/quota/harness failure is
 * not Player skill evidence, sparse samples prove little, and UNKNOWN is valid.
 *
 * WILL BE: Future dynamic Team Depth Chart / Player Scorecards may keep general
 * priors separate from local real-game film, with per-Player, provider/model,
 * task/role, and Game identity. Understandable evidence may include starts,
 * outcomes by cause, duration, intervention, reports, downstream acceptance,
 * rediscovery, context, readiness, scarcity/capacity, cost, CONSERVE, and human
 * preferences. It must learn gradually from normal Plays, not a magic universal
 * score, artificial benchmarks, one-off promotion/cuts, or cross-user pooling.
 * Human routing always wins. Product principle: build a depth chart from real
 * games, not a fantasy ranking from model names; Coach learns the Team it has.
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

/**
 * BREADCRUMB — conservative AUTO Scout decision.
 *
 * WAS: Scout existed as a first-class MANUAL routing target while
 * unconstrained AUTO intentionally excluded it; the human had to decide that
 * reconnaissance should happen first.
 *
 * IS: AUTO may conservatively choose the existing Scout Player when the Play
 * makes reconnaissance primary, identifies material/before-action evidence
 * need, and the canonical Scout capability is truthfully ready. MANUAL and
 * AUTO converge on `scout` and the same Stadium adapter/Formation engine.
 *
 * WHY: Coach should recognize obvious reconnaissance-first work that can
 * reduce important uncertainty before premium architecture/implementation,
 * without imposing Scout ceremony on ordinary hard work.
 *
 * WILL BE: richer task/evidence state, prior reports, context ownership,
 * real-game performance, provider capacity, CONSERVE, Player-requested Scout
 * escalation, and automatic Scout-to-Architect continuation are future policy
 * layers. V0.1 remains local, conservative, and explainable.
 */
function computeScoutAutoRoute(
  gameId: string,
  prompt: string,
  candidates: readonly PlayerRoutingCapability[]
): { decision?: RoutingDecision; need: ReturnType<typeof analyzeScoutNeed> } {
  const need = analyzeScoutNeed(prompt);
  if (!need.shouldUseScout) return { need };
  const scout = candidates.find((candidate) => candidate.instanceId === SCOUT_PLAYER_INSTANCE_ID
    && candidate.playerType === SCOUT_PLAYER_TYPE
    && candidate.executionType === 'scout-formation'
    && candidate.transport === 'controlled'
    && candidate.state === 'ready'
    && candidate.capability.freshness !== 'unavailable');
  if (!scout) return { need };

  const reason = `${need.reason} Scout is available and is the best first Player.`;
  return {
    need,
    decision: {
      mode: 'auto',
      gameId,
      playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
      playerLabel: 'Scout',
      playerName: 'Scout',
      provider: SCOUT_PLAYER_TYPE,
      modelDisplayName: 'Scout Formation',
      reason,
      stagedAt: Date.now(),
      transport: 'controlled',
      playLabel: analyzePlay(prompt).label,
      action: 'dispatch',
      rationale: {
        player: need.reason,
        instance: 'The canonical Scout capability is ready for this Game.',
        model: 'Formation will select receivers from current verification and Combine evidence.',
        effort: 'Formation owns bounded subordinate Scout execution.'
      },
      summary: 'Scout · Reconnaissance should happen before implementation or architecture work.',
      scoutNeed: {
        reconnaissancePrimary: need.reconnaissancePrimary,
        materialEvidenceGap: need.materialEvidenceGap,
        actionBlockedByUncertainty: need.actionBlockedByUncertainty,
        boundedParallelReconUseful: need.boundedParallelReconUseful,
        scoutAvailable: true,
        reason: need.reason
      }
    }
  };
}

/**
 * S56.1 SCOUT-DIRECTIVE-INTERCEPT: the Play itself commanded Scout ("Scout this play"). Explicit human routing, not the
 * AUTO reconnaissance heuristic above: no need analysis, no continuation, and an unavailable Scout is a truthful stop
 * (never a Claude/Codex substitution).
 */
function computeScoutDirectiveRoute(
  gameId: string,
  prompt: string,
  candidates: readonly PlayerRoutingCapability[],
  constraints: RouteConstraints
): { decision?: RoutingDecision; error?: string } {
  const scout = candidates.find((candidate) => candidate.instanceId === SCOUT_PLAYER_INSTANCE_ID
    && candidate.playerType === SCOUT_PLAYER_TYPE
    && candidate.executionType === 'scout-formation'
    && candidate.transport === 'controlled'
    && candidate.state === 'ready'
    && candidate.capability.freshness !== 'unavailable');
  if (!scout) {
    return { error: 'Scout is currently unavailable. Coach did not choose another Player because you asked for Scout.' };
  }
  return {
    decision: {
      mode: 'auto',
      gameId,
      playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
      playerLabel: 'Scout',
      playerName: 'Scout',
      provider: SCOUT_PLAYER_TYPE,
      modelDisplayName: 'Scout Formation',
      reason: 'Scout selected as you asked.',
      stagedAt: Date.now(),
      transport: 'controlled',
      playLabel: analyzePlay(prompt).label,
      action: 'dispatch',
      rationale: {
        player: 'The Play opened with an explicit Scout directive.',
        instance: 'The canonical Scout capability is ready for this Game.',
        model: 'Formation will select receivers from current verification and Combine evidence.',
        effort: 'Formation owns bounded subordinate Scout execution.'
      },
      summary: 'Scout selected as you asked.',
      constraints
    }
  };
}

/** One exact, ready, Coach-owned Terminal may receive one exact classified command. */
function computeTerminalAutoRoute(
  gameId: string,
  prompt: string,
  everyCandidate: readonly PlayerRoutingCapability[]
): RoutingDecision | undefined {
  const verdict = classifyShellIntent(prompt);
  if (verdict.kind !== 'shell') return undefined;
  const eligible = everyCandidate.filter((candidate) => candidate.playerType === 'terminal'
    && candidate.executionType === 'direct-shell'
    && candidate.transport === 'legacy'
    && candidate.ownership === 'coach-managed'
    && candidate.state === 'ready'
    && candidate.autoEligible !== false);
  if (eligible.length !== 1) return undefined;
  const terminal = eligible[0];
  const name = terminal.fieldLabel.replace(/\s*·\s*Terminal.*$/i, '').trim() || 'Terminal';
  return {
    mode: 'auto',
    gameId,
    playerInstanceId: terminal.instanceId,
    playerLabel: terminal.fieldLabel,
    playerName: name,
    provider: 'terminal',
    modelDisplayName: 'Not applicable',
    reason: `The complete Play is an exact ${verdict.rule} shell command and one Coach-managed Terminal is ready.`,
    summary: `${name} · Exact shell command.`,
    stagedAt: Date.now(),
    transport: 'legacy',
    playLabel: 'Exact shell command',
    action: 'dispatch',
    terminalCommand: verdict.command,
    rationale: {
      player: 'The complete Play passed the conservative shell-intent boundary.',
      instance: 'Exactly one ready Coach-managed Terminal is eligible in this Game.',
      model: 'Terminal executes directly; no model applies.',
      effort: 'Terminal executes directly; no reasoning effort applies.'
    }
  };
}

/**
 * S56.0 CANONICAL-PLAY-ROUTING-ENVELOPE: an explicit structured routing field that
 * could not be resolved is a needs-attention stop. It must never reach provider or
 * model fallback inference, which would silently replace what the Head Coach asked for.
 */
function unresolvedRouteError(constraints: RouteConstraints | undefined, playerLabel?: string): string | undefined {
  const unresolved = constraints?.unresolved;
  if (!unresolved?.length) return undefined;
  const label = playerLabel
    ?? (constraints!.playerType ? constraints!.playerType.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : undefined);
  const noun = { player: 'Player', model: 'model', effort: 'reasoning level' } as const;
  return unresolved
    .map((item) => `Unrecognized ${noun[item.dimension]} '${item.rawText}' requested${item.dimension !== 'player' && label ? ` for ${label}` : ''}. `
      + `Coach did not choose another ${noun[item.dimension]} because this Play explicitly constrained the ${noun[item.dimension]}.`)
    .join(' ');
}

export function computeAutoRoute(
  activeGameId: string,
  prompt: string,
  everyCandidate: readonly PlayerRoutingCapability[],
  policies: Map<string, ProviderRoutingPolicy>
): { decision?: RoutingDecision; error?: string } {
  // Explicit Play-level routing intent is higher authority than shell intent.
  // The context-aware path repeats this with richer names and ledger evidence.
  const constraints = resolveSmartRouteConstraints({ prompt, candidates: everyCandidate });
  const unresolvedError = unresolvedRouteError(constraints);
  if (unresolvedError) return { error: unresolvedError };
  // An explicit Scout directive is control-plane routing: it never falls through to task classification.
  if (constraints?.directive?.kind === 'scout') return computeScoutDirectiveRoute(activeGameId, prompt, everyCandidate, constraints);
  if (!constraints) {
    const terminalRoute = computeTerminalAutoRoute(activeGameId, prompt, everyCandidate);
    if (terminalRoute) return { decision: terminalRoute };
  }
  const scoutRoute = computeScoutAutoRoute(activeGameId, prompt, everyCandidate);
  if (scoutRoute.decision) return { decision: scoutRoute.decision };
  // Reasoning AUTO never treats a direct shell as a provider candidate.
  const allCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal'
    && candidate.executionType !== 'direct-shell'
    && candidate.autoEligible !== false);
  if (allCandidates.length === 0 && everyCandidate.length > 0) {
    const onlyTerminals = everyCandidate.every((candidate) => candidate.playerType === 'terminal' || candidate.executionType === 'direct-shell');
    return { error: onlyTerminals
      ? 'Terminal runs exact commands, so AUTO does not send it Plays. Choose Terminal in Manual, or put a reasoning Player on field.'
      : 'No Player is eligible for unconstrained AUTO right now. Choose Scout in Manual, or put an AUTO-eligible Player on field.' };
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
  const selection = constrainedSelection(candidate, task, policy, constraints) ?? policy.selectModel(task, snapshot);
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

// ---------------------------------------------------------------------------
// Q2.10D — context-aware AUTO
// ---------------------------------------------------------------------------

export type RouteChoice = 'recommended' | 'queue' | 'handoff' | 'dispatch';

/** Everything context-aware AUTO may know — all of it already scoped to ONE Game. */
export interface RouteContext {
  readonly ledger: readonly InstanceLedgerEntry[];
  readonly reports: readonly GameReportRef[];
  /** The report the human is looking at in Incoming. */
  readonly incomingReportPath?: string;
  /** Human-facing contiguous names by exact instance id. */
  readonly names?: ReadonlyMap<string, string>;
  /** Every instance on the Team, benched included (capabilities list only on-field ones). */
  readonly rosterInstanceIds?: ReadonlySet<string>;
  /** Queued Plays already waiting per exact instance. */
  readonly queuedCounts?: ReadonlyMap<string, number>;
  /** The human picked the offered alternative. */
  readonly choice?: RouteChoice;
}

function isOperableControlled(candidate: PlayerRoutingCapability | undefined): candidate is PlayerRoutingCapability {
  return Boolean(candidate)
    && candidate!.transport === 'controlled'
    && candidate!.playerType !== 'terminal'
    && candidate!.capability.freshness !== 'unavailable'
    && (candidate!.executionType === 'scout-formation' || candidate!.capability.models.length > 0);
}

function constrainedCandidates(
  candidates: readonly PlayerRoutingCapability[],
  constraints: RouteConstraints | undefined
): PlayerRoutingCapability[] {
  if (!constraints) return [...candidates];
  return candidates
    .filter((candidate) => !constraints.playerInstanceId || candidate.instanceId === constraints.playerInstanceId)
    .filter((candidate) => !constraints.playerType || candidate.playerType === constraints.playerType)
    .map((candidate) => {
      if (candidate.executionType === 'scout-formation') return candidate;
      const excluded = new Set(constraints.excludedModels ?? []);
      const models = candidate.capability.models.filter((model) => !excluded.has(model.id))
        .filter((model) => !constraints.model || model.id === constraints.model)
        .filter((model) => !constraints.effort || model.supportedEfforts.includes(constraints.effort));
      return { ...candidate, capability: { ...candidate.capability, models } };
    })
    .filter((candidate) => {
      if (candidate.executionType === 'scout-formation') {
        return !constraints.model && !constraints.effort && !(constraints.excludedModels?.length);
      }
      if (candidate.transport !== 'controlled') return !constraints.model && !constraints.effort && !(constraints.excludedModels?.length);
      return candidate.capability.models.length > 0;
    });
}

function constrainedSelection(
  candidate: PlayerRoutingCapability,
  task: TaskClassification,
  policy: ProviderRoutingPolicy,
  constraints: RouteConstraints | undefined
): PolicySelection | undefined {
  if (candidate.transport !== 'controlled' || candidate.executionType === 'scout-formation') return undefined;
  const selection = policy.selectModel(task, candidate.capability);
  const chosen = constraints?.model
    ? candidate.capability.models.find((model) => model.id === constraints.model)
    : candidate.capability.models.find((model) => model.id === selection.modelId);
  if (!chosen) return selection;
  const effort = constraints?.effort
    ?? (selection.effort && chosen.supportedEfforts.includes(selection.effort) ? selection.effort : chosen.defaultEffort);
  return {
    modelId: chosen.id,
    modelDisplayName: chosen.displayName,
    effort,
    rationale: constraints?.model
      ? `${chosen.displayName} selected as requested`
      : selection.rationale
  };
}

function requestedRouteReason(constraints: RouteConstraints, playerName: string, executionType?: PlayerRoutingCapability['executionType']): string {
  const asked: string[] = [];
  if (constraints.playerType || constraints.playerInstanceId) asked.push(playerName);
  if (constraints.model) asked.push(constraints.modelDisplayName ?? constraints.model);
  if (constraints.effort) asked.push(constraints.effort.charAt(0).toUpperCase() + constraints.effort.slice(1));
  let sentence = asked.length > 1
    ? `${asked.slice(0, -1).join(', ')} and ${asked[asked.length - 1]} selected as you asked.`
    : asked.length === 1
      ? `${asked[0]} selected as you asked.`
      : 'Coach honored your routing request.';
  const fills: string[] = [];
  if (executionType !== 'scout-formation') {
    if (!constraints.model) fills.push('model');
    if (!constraints.effort) fills.push('reasoning');
  }
  if (fills.length) sentence += ` Coach chose the ${fills.join(' and ')}.`;
  if (constraints.excludedModels?.length) sentence += ' Coach avoided the excluded model as you asked.';
  return sentence;
}

/**
 * The route for a Play, with explicit human intent first:
 *
 *   Game → explicit constraints → context owner / handoff evidence → exact instance
 *   → work state / queue decision → provider → model → effort → transport
 *
 * Human constraints narrow the valid candidates; lower-priority inference fills
 * only the unspecified dimensions. Relevant context can outweigh immediate idleness
 * inside that set, while a different explicitly requested Player receives the
 * authoritative context package as a handoff. New work with no evidence keeps the
 * Q2.10C AUTO behaviour. Exact shell intent may select one Coach-managed Terminal
 * before this reasoning policy, but never when a human constraint is present.
 */
export function computeContextAwareRoute(
  gameId: string,
  prompt: string,
  everyCandidate: readonly PlayerRoutingCapability[],
  policies: Map<string, ProviderRoutingPolicy>,
  context: RouteContext
): { decision?: RoutingDecision; error?: string } {
  const scopedLedger = context.ledger.filter((entry) => entry.gameId === gameId);
  const scopedReports = context.reports.filter((report) => !report.gameId || report.gameId === gameId);
  const constraints = resolveSmartRouteConstraints({ prompt, candidates: everyCandidate, ledger: scopedLedger, names: context.names });
  const unresolvedError = unresolvedRouteError(
    constraints,
    constraints?.playerInstanceId ? context.names?.get(constraints.playerInstanceId) : undefined
  );
  if (unresolvedError) return { error: unresolvedError };
  // Human constraints and an explicitly chosen route alternative outrank Terminal.
  // No unique eligible Terminal simply falls through to ordinary reasoning AUTO.
  if (!constraints && (context.choice === undefined || context.choice === 'recommended')) {
    const terminalRoute = computeTerminalAutoRoute(gameId, prompt, everyCandidate);
    if (terminalRoute) return { decision: terminalRoute };
  }
  const reasoningCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell');
  const candidates = constrainedCandidates(reasoningCandidates, constraints);
  const nameOf = (instanceId: string, fallback?: PlayerRoutingCapability): string =>
    context.names?.get(instanceId) ?? (fallback ? playerName(fallback) : 'That Player');
  const task = classifyTask(prompt);
  const choice = context.choice ?? 'recommended';

  const followUp = detectFollowUp(prompt, { incomingReportPath: context.incomingReportPath, reports: scopedReports });
  const ownership = resolveContextOwner(followUp, gameId, scopedLedger, scopedReports);

  if (constraints && candidates.length === 0) {
    const requestedName = constraints.playerInstanceId
      ? context.names?.get(constraints.playerInstanceId)
      : constraints.playerType
        ? constraints.playerType.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
        : undefined;
    const terminalRequested = constraints.playerType === 'terminal';
    return {
      error: terminalRequested
        ? 'Terminal runs exact commands in Manual. Coach did not substitute another Player.'
        : `${requestedName ?? 'The route you requested'} is currently unavailable. Coach did not choose another Player because you explicitly constrained this Play.`
    };
  }

  // Explicit human constraints above always win. Only an unconstrained Play may
  // enter the conservative reconnaissance-first policy; unavailable Scout falls
  // through to the existing context/provider route without side effects.
  const scoutOwnsCurrentContext = ownership.state === 'owner'
    && ownership.ownerInstanceId === SCOUT_PLAYER_INSTANCE_ID;
  if (!constraints && !scoutOwnsCurrentContext) {
    const scoutRoute = computeScoutAutoRoute(gameId, prompt, everyCandidate);
    if (scoutRoute.decision) {
      if (ownership.state === 'owner') {
        const ownerName = context.names?.get(ownership.ownerInstanceId) ?? 'the Player that owns this context';
        const reportName = ownership.report?.filename ?? ownership.report?.path.split('/').pop();
        return {
          decision: {
            ...scoutRoute.decision,
            action: 'handoff',
            context: {
              state: 'owner',
              ownerInstanceId: ownership.ownerInstanceId,
              ownerName,
              evidence: ownership.evidence,
              reportPath: ownership.report?.path,
              reportFilename: reportName
            },
            contextPreamble: buildHandoffPreamble({
              ownerName,
              report: ownership.report,
              previousPlaySummary: ownership.previousPlaySummary,
              reason: 'explicit-route'
            })
          }
        };
      }
      if (ownership.state === 'unknown') {
        return {
          decision: {
            ...scoutRoute.decision,
            context: {
              state: 'unknown',
              note: ownership.reason,
              reportPath: ownership.report?.path,
              reportFilename: ownership.report?.filename ?? ownership.report?.path.split('/').pop()
            },
            ...(ownership.report ? {
              contextPreamble: buildHandoffPreamble({ report: ownership.report, reason: 'owner-unknown' })
            } : {})
          }
        };
      }
      return { decision: { ...scoutRoute.decision, context: { state: 'none' } } };
    }
  }

  const routeTo = (
    candidate: PlayerRoutingCapability,
    action: 'dispatch' | 'queue' | 'handoff',
    reason: string,
    extra: Partial<RoutingDecision> = {}
  ): RoutingDecision => {
    const policy = policies.get(candidate.capability.provider) ?? new CodexRoutingPolicy();
    const selection = constrainedSelection(candidate, task, policy, constraints);
    const name = nameOf(candidate.instanceId, candidate);
    const effectiveReason = constraints ? `${requestedRouteReason(constraints, name, candidate.executionType)} ${reason}`.trim() : reason;
    const summary = action === 'queue' ? `Queued for ${name} · ${effectiveReason}` : constraints ? effectiveReason : `${name} · ${effectiveReason}`;
    return {
      mode: 'auto',
      gameId,
      playerInstanceId: candidate.instanceId,
      playerLabel: candidate.fieldLabel,
      playerName: name,
      provider: candidate.capability?.provider ?? candidate.playerType,
      model: selection?.modelId,
      modelDisplayName: selection?.modelDisplayName ?? 'Provider managed',
      effort: selection?.effort,
      reason: `${effectiveReason}${selection && !constraints?.model ? ` ${selection.rationale}.` : ''}`,
      stagedAt: Date.now(),
      transport: candidate.transport,
      playLabel: analyzePlay(prompt).label,
      action,
      rationale: {
        player: effectiveReason,
        instance: constraints
          ? `${candidate.instanceId} (${name}) chosen within the human constraints: ${effectiveReason}`
          : `${candidate.instanceId} (${name}) chosen by context: ${effectiveReason}`,
        model: selection?.rationale ?? (candidate.executionType === 'scout-formation' ? 'Formation selects eligible receivers from current Scout evidence.' : 'Terminal session keeps its own model.'),
        effort: selection?.effort ? `${selection.effort} for a ${task} Play.` : (candidate.executionType === 'scout-formation' ? 'Formation owns subordinate Scout execution.' : 'Provider default effort.')
      },
      summary,
      ...(constraints ? { constraints } : {}),
      ...(action === 'queue' ? { queuePosition: (context.queuedCounts?.get(candidate.instanceId) ?? 0) + 1 } : {}),
      ...extra
    };
  };

  /** An idle, operable sibling able to take over — same Player type first, then by Play type. */
  const handoffTarget = (excluding: string, preferType?: string): PlayerRoutingCapability | undefined => {
    const free = candidates.filter((c) => c.instanceId !== excluding && c.state === 'ready' && isOperableControlled(c)
      && !(context.queuedCounts?.get(c.instanceId)));
    const preference = PROVIDER_PREFERENCE[task];
    return free.find((c) => c.playerType === preferType && isKnownIdle(c))
      ?? free.find((c) => c.playerType === preferType)
      ?? [...free].sort((a, b) => rank(preference, a.playerType) - rank(preference, b.playerType))[0];
  };

  // An explicit Player constraint outranks a different context owner. The report
  // remains evidence and becomes a handoff package; only execution moves.
  const explicitlyChoosesPlayer = Boolean(constraints?.playerType || constraints?.playerInstanceId);
  // A Scout-owned context is evidence, not a Player to continue with (see the owner branch below), so an explicit
  // Scout request must still take the explicit path here rather than dead-end as "the owner is on the bench".
  const compatibleOwner = ownership.state === 'owner' && ownership.ownerInstanceId !== SCOUT_PLAYER_INSTANCE_ID
    ? candidates.find((candidate) => candidate.instanceId === ownership.ownerInstanceId)
    : undefined;
  if (constraints && explicitlyChoosesPlayer && !compatibleOwner) {
    const ready = candidates.filter((candidate) => candidate.state === 'ready'
      && (candidate.transport === 'legacy' || isOperableControlled(candidate))
      && !(context.queuedCounts?.get(candidate.instanceId)));
    const busy = candidates.filter((candidate) => candidate.state === 'busy' && candidate.supportsQueue !== false && isOperableControlled(candidate));
    const target = ready.find(isKnownIdle) ?? ready[0] ?? busy[0];
    if (!target) {
      const requestedName = constraints.playerInstanceId
        ? context.names?.get(constraints.playerInstanceId) ?? 'That Player'
        : constraints.playerType!.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
      return { error: `${requestedName} is currently unavailable. Coach did not choose another Player because you asked for ${requestedName}.` };
    }

    const ownerName = ownership.state === 'owner'
      ? context.names?.get(ownership.ownerInstanceId) ?? 'the Player that owns this context'
      : undefined;
    const ownerDiffers = ownership.state === 'owner' && ownership.ownerInstanceId !== target.instanceId;
    const reportName = ownership.state === 'owner'
      ? ownership.report?.filename ?? ownership.report?.path.split('/').pop()
      : undefined;
    const contextProjection = ownership.state === 'owner' ? {
      state: 'owner' as const,
      ownerInstanceId: ownership.ownerInstanceId,
      ownerName,
      evidence: ownership.evidence,
      reportPath: ownership.report?.path,
      reportFilename: reportName
    } : ownership.state === 'unknown' ? {
      state: 'unknown' as const,
      note: ownership.reason,
      reportPath: ownership.report?.path,
      reportFilename: ownership.report?.filename ?? ownership.report?.path.split('/').pop()
    } : { state: 'none' as const };
    const preamble = ownerDiffers
      ? buildHandoffPreamble({ ownerName, report: ownership.report, previousPlaySummary: ownership.previousPlaySummary, reason: 'explicit-route' })
      : ownership.state === 'unknown' && ownership.report
        ? buildHandoffPreamble({ report: ownership.report, reason: 'owner-unknown' })
        : undefined;
    const contextReason = ownerDiffers
      ? `Using ${ownerName}'s ${reportName ? 'report' : 'work'} as context.`
      : ownership.state === 'unknown'
        ? `${ownership.reason}${ownership.report ? ' The selected report stays attached as context.' : ''}`
        : 'Ready to run this Play.';
    const action = target.state === 'busy' ? 'queue' : preamble ? 'handoff' : 'dispatch';
    return {
      decision: routeTo(target, action, contextReason, {
        context: contextProjection,
        ...(preamble ? { contextPreamble: preamble } : {})
      })
    };
  }

  if (ownership.state === 'owner') {
    // A Scout result is evidence for the next Player, never a reason to launch a
    // second Formation. Treat Scout-owned context as a handoff source here.
    const owner = ownership.ownerInstanceId === SCOUT_PLAYER_INSTANCE_ID
      ? undefined
      : candidates.find((c) => c.instanceId === ownership.ownerInstanceId);
    const ownerName = context.names?.get(ownership.ownerInstanceId) ?? (owner ? playerName(owner) : 'the Player that owns this context');
    const baseContext = {
      state: 'owner' as const,
      ownerInstanceId: ownership.ownerInstanceId,
      ownerName,
      evidence: ownership.evidence,
      reportPath: ownership.report?.path,
      reportFilename: ownership.report?.filename ?? ownership.report?.path.split('/').pop()
    };
    const withReport = ownership.report ? 'the latest report' : 'its previous Play';
    const preambleFor = (reason: 'owner-busy' | 'owner-unavailable') =>
      buildHandoffPreamble({ ownerName, report: ownership.report, previousPlaySummary: ownership.previousPlaySummary, reason });

    const ownerQueued = context.queuedCounts?.get(ownership.ownerInstanceId) ?? 0;
    const ownerReady = owner?.state === 'ready' && ownerQueued === 0;
    const ownerCanQueue = isOperableControlled(owner) && owner!.supportsQueue !== false && (owner!.state === 'ready' || owner!.state === 'busy');

    if (owner && ownerReady && (owner.transport === 'legacy' || isOperableControlled(owner))) {
      return { decision: routeTo(owner, 'dispatch', 'owns the context and is idle.', { context: baseContext }) };
    }

    if (owner && ownerCanQueue) {
      // The owner is working (or already has Plays waiting). Queue, or hand off safely?
      const sibling = handoffTarget(owner.instanceId, owner.playerType);
      const modifies = playModifiesGame(prompt);
      const packageable = Boolean(ownership.report);
      const safeHandoff = Boolean(sibling) && packageable && !modifies;
      const wantsHandoff = choice === 'handoff' ? Boolean(sibling) : choice === 'queue' ? false : safeHandoff;
      const queueReason = modifies
        ? `owns the current ${task === 'architecture' ? 'architecture' : 'implementation'} context and is Working.`
        : `owns the context and is Working.`;
      if (wantsHandoff && sibling) {
        const siblingName = nameOf(sibling.instanceId, sibling);
        return {
          decision: routeTo(sibling, 'handoff', `${ownerName} owns the context but is busy; ${withReport} is enough for a safe handoff.`, {
            context: baseContext,
            contextPreamble: preambleFor('owner-busy'),
            alternative: { choice: 'queue', playerInstanceId: owner.instanceId, playerName: ownerName, label: `Queue for ${ownerName}` },
            playerName: siblingName
          })
        };
      }
      return {
        decision: routeTo(owner, 'queue', queueReason, {
          context: baseContext,
          ...(sibling ? { alternative: { choice: 'handoff' as const, playerInstanceId: sibling.instanceId, playerName: nameOf(sibling.instanceId, sibling), label: `Use ${nameOf(sibling.instanceId, sibling)} with ${ownership.report ? 'latest report' : 'context'}` } } : {})
        })
      };
    }

    // The owner cannot take this Play at all. Never a silent reroute: say so in the route.
    const onTeam = context.rosterInstanceIds?.has(ownership.ownerInstanceId) ?? Boolean(owner);
    const ownerIsShell = everyCandidate.some((c) => c.instanceId === ownership.ownerInstanceId && (c.playerType === 'terminal' || c.executionType === 'direct-shell'))
      || scopedLedger.some((e) => e.playerInstanceId === ownership.ownerInstanceId && e.playerType === 'terminal');
    const named = context.names?.has(ownership.ownerInstanceId) || Boolean(owner);
    const note = ownerIsShell
      ? 'Terminal ran that work, and Terminal only runs exact commands.'
      : onTeam && !owner && named
        ? `${ownerName} owns this context but is on the bench.`
        : 'The Player that owns this context is no longer available.';
    const sibling = handoffTarget(ownership.ownerInstanceId, scopedLedger.find((e) => e.playerInstanceId === ownership.ownerInstanceId)?.playerType);
    if (sibling && (ownership.report || ownership.previousPlaySummary)) {
      return {
        decision: routeTo(sibling, 'handoff', `${note} Continuing with ${withReport} as context.`, {
          context: { ...baseContext, note },
          contextPreamble: preambleFor('owner-unavailable')
        })
      };
    }
    return { error: `${note} Choose who continues in Manual.` };
  }

  // No provable owner, or genuinely new work: the Q2.10C AUTO route.
  // Terminal intent was decided once above, with full constraint/choice authority.
  // The ordinary fallback receives reasoning candidates only, so it cannot re-open
  // the shell path after an explicit choice suppressed it.
  const base = computeAutoRoute(gameId, prompt, candidates, policies);
  if (!base.decision) return base;
  const chosen = candidates.find((c) => c.instanceId === base.decision!.playerInstanceId);
  const chosenName = nameOf(base.decision.playerInstanceId, chosen);
  // Human sentences use contiguous names ("AntiGravity"), never the seat label ("AntiGravity 2").
  const friendlySummary = chosen && base.decision.summary ? base.decision.summary.split(playerName(chosen)).join(chosenName) : base.decision.summary;

  if (ownership.state === 'unknown') {
    const preamble = ownership.report
      ? buildHandoffPreamble({ report: ownership.report, reason: 'owner-unknown' })
      : undefined;
    return {
      decision: {
        ...base.decision,
        playerName: chosenName,
        action: 'dispatch',
        context: { state: 'unknown', note: ownership.reason, reportPath: ownership.report?.path, reportFilename: ownership.report?.filename },
        ...(preamble ? { contextPreamble: preamble } : {}),
        ...(constraints ? { constraints } : {}),
        summary: `${constraints ? `${requestedRouteReason(constraints, chosenName, chosen?.executionType)} ` : ''}${friendlySummary ?? chosenName} ${ownership.reason}`
      }
    };
  }

  // New work: conservative collision awareness. Two free Players are not better than
  // one when the new Play names a file another instance is changing right now.
  const working = scopedLedger.filter((entry) => entry.workState === 'working');
  const collision = detectCollision(prompt, working);
  const collider = collision ? candidates.find((c) => c.instanceId === collision.instanceId) : undefined;
  if (collision && collider && isOperableControlled(collider) && choice !== 'dispatch') {
    const colliderName = nameOf(collider.instanceId, collider);
    return {
      decision: routeTo(collider, 'queue', `is changing ${collision.touch} right now; queued so the edits don't overlap.`, {
        context: { state: 'none', collisionWith: collider.instanceId },
        alternative: { choice: 'dispatch', playerInstanceId: base.decision.playerInstanceId, playerName: chosenName, label: `Run now on ${chosenName}` },
        playerName: colliderName
      })
    };
  }
  return {
    decision: {
      ...base.decision,
      summary: constraints ? `${requestedRouteReason(constraints, chosenName)} ${friendlySummary ?? ''}`.trim() : friendlySummary,
      playerName: chosenName,
      action: 'dispatch',
      context: { state: 'none' },
      ...(constraints ? { constraints } : {})
    }
  };
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
