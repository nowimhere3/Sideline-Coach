/**
 * Play Analyzer — foundation.
 *
 * Classifies a Play before dispatch so routing can later choose WHO, WHAT MODEL
 * and HOW HARD TO THINK. Internally richer than the Dadified label the human
 * sees ("Easy / Medium / Hard Play").
 *
 * Deliberately heuristic and local (no model call): it must be instant, free and
 * explainable. Q2.10 may add richer signals; the shape is the contract.
 */

import type { TaskClassification } from './capability-types';

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

export type PlayDifficulty = 'easy' | 'medium' | 'hard';
export type PlayRisk = 'normal' | 'high';

export interface PlayAnalysis {
  readonly taskType: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly risk: PlayRisk;
  /** Rough prompt size in characters — a proxy for context the Player must hold. */
  readonly size: number;
  /** Human wording, e.g. `Hard architecture Play`. */
  readonly label: string;
}

const HIGH_RISK = /\b(migrat\w*|delete|destroy|drop table|production|prod|security|secret|credential|auth\w*|permission|data loss|irreversible|force[- ]push|rewrite history)\b/i;

const TASK_WORD: Readonly<Record<TaskClassification, string>> = {
  architecture: 'architecture',
  implementation: 'implementation',
  quick: 'quick',
  default: ''
};

const DIFFICULTY_WORD: Readonly<Record<PlayDifficulty, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};

export function analyzePlay(prompt: string): PlayAnalysis {
  const text = typeof prompt === 'string' ? prompt : '';
  const size = text.trim().length;
  const taskType = classifyTask(text);
  const risk: PlayRisk = HIGH_RISK.test(text) ? 'high' : 'normal';

  let difficulty: PlayDifficulty;
  if (taskType === 'architecture' || size > 3000 || (risk === 'high' && size > 200)) {
    difficulty = 'hard';
  } else if (taskType === 'implementation' || risk === 'high' || size > 600) {
    difficulty = 'medium';
  } else {
    difficulty = 'easy';
  }

  const word = TASK_WORD[taskType];
  const label = size === 0
    ? 'Waiting for a Play'
    : `${DIFFICULTY_WORD[difficulty]}${word ? ` ${word}` : ''} Play`;

  return { taskType, difficulty, risk, size, label };
}

/**
 * A provider-setting recommendation for one analysed Play.
 *
 * `preference` is data, never architecture: the defaults below express one
 * reasonable Architect/Worker style and are meant to become Routing Settings.
 * A recommendation is *advice*; whether Coach may apply it is decided by the
 * provider control profile, not here.
 */
export interface ProviderSettingPreference {
  readonly model: Readonly<Record<PlayDifficulty, string>>;
  readonly effort: Readonly<Record<PlayDifficulty, string>>;
}

export const DEFAULT_CLAUDE_PREFERENCE: ProviderSettingPreference = {
  model: { hard: 'opus', medium: 'sonnet', easy: 'haiku' },
  effort: { hard: 'high', medium: 'medium', easy: 'low' }
};

export interface ProviderSettingRecommendation {
  readonly model?: string;
  readonly effort?: string;
}

/**
 * Recommend settings from a preference, keeping only options the provider
 * actually offers. Never invents an option the provider did not list.
 */
export function recommendProviderSettings(
  analysis: PlayAnalysis,
  offered: { readonly models: readonly string[]; readonly efforts: readonly string[] },
  preference: ProviderSettingPreference
): ProviderSettingRecommendation {
  const model = preference.model[analysis.difficulty];
  const effort = preference.effort[analysis.difficulty];
  return {
    model: offered.models.includes(model) ? model : undefined,
    effort: offered.efforts.includes(effort) ? effort : undefined
  };
}
