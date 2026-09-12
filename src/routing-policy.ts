import type {
  ModelDescriptor,
  PlayerRoutingCapability,
  ProviderCapabilitySnapshot,
  RoutingDecision,
  TaskClassification
} from './capability-types';

export function classifyTask(prompt: string): TaskClassification {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return 'default';
  }
  const lower = trimmed.toLowerCase();
  if (/\b(architect|architecture|design|scout|plan|rfc|blueprint|strategy)\b/.test(lower) || trimmed.length > 3000) {
    return 'architecture';
  }
  if (/\b(implement|code|build|refactor|test|fix|patch|feature|add|create|rewrite|compile)\b/.test(lower) || trimmed.includes('\n')) {
    return 'implementation';
  }
  if (/\b(doc|docs|readme|comment|typo|quick|check|inspect|status|version|verify)\b/.test(lower) || trimmed.length < 80) {
    return 'quick';
  }
  return 'default';
}

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

export function computeAutoRoute(
  activeGameId: string,
  prompt: string,
  candidates: readonly PlayerRoutingCapability[],
  policies: Map<string, ProviderRoutingPolicy>
): { decision?: RoutingDecision; error?: string } {
  const controlledCandidates = candidates.filter((c) => c.transport === 'controlled');
  if (controlledCandidates.length === 0) {
    return { error: 'No controlled Player on field — Put a controlled Codex on field or switch to Manual.' };
  }

  const readyCandidates = controlledCandidates.filter((c) => c.state === 'ready');
  if (readyCandidates.length === 0) {
    return { error: 'All controlled Players are currently working. Wait or switch to Manual.' };
  }

  const candidate = readyCandidates[0];
  const snapshot = candidate.capability;

  // Critical Amendment 1: AUTO stops safely if live capability truth is unavailable
  if (snapshot.freshness === 'unavailable' || snapshot.models.length === 0) {
    return { error: 'Live routing capabilities are unavailable. Refresh capabilities or switch to Manual.' };
  }

  const task = classifyTask(prompt);
  const policy = policies.get(candidate.capability.provider) ?? new CodexRoutingPolicy();
  const selection = policy.selectModel(task, snapshot);

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
    stagedAt: Date.now()
  };

  return { decision };
}
