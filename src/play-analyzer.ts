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

export interface ScoutNeedAnalysis {
  readonly reconnaissancePrimary: boolean;
  readonly materialEvidenceGap: boolean;
  readonly actionBlockedByUncertainty: boolean;
  readonly boundedParallelReconUseful: boolean;
  readonly implementationRequested: boolean;
  readonly scoutOriginated: boolean;
  readonly shouldUseScout: boolean;
  readonly reason: string;
}

export interface ScoutContinuationAuthority {
  readonly authorized: boolean;
  readonly implementationRequested: boolean;
  readonly synthesisRequested: boolean;
  readonly reconnaissanceOnly: boolean;
  readonly reason: string;
}

const SCOUT_ORIGIN_MARKER = /(?:^|\n)(?:SCOUT FORMATION RESULT|This report is reconnaissance, not final architectural authority\.)/i;
const STRONG_RECON_DIRECTIVE = /\b(?:scout\s+(?:this|the|current)|reconnaissance|gather\s+(?:the\s+)?evidence(?:\s+first)?|audit\s+(?:this|the|current)|inspect\s+(?:the\s+)?current\s+(?:repo(?:sitory)?|implementation|architecture)|investigate\s+(?:which|where|whether|why|the\s+current)|find\s+(?:the\s+)?contradiction|identify\s+where\s+.+\s+(?:lives|is\s+implemented))\b/i;
const NEGATED_RECON_DIRECTIVE = /\b(?:do\s+not|don't|never)\s+(?:scout|investigate|audit|perform\s+reconnaissance|gather\s+evidence)\b/i;
const EVIDENCE_GAP = /\b(?:ownership\s+(?:is\s+)?(?:unknown|unclear|unresolved)|which\s+(?:implementation|subsystem|module|component|path)\s+(?:owns|implements|controls)|where\s+(?:this|the\s+behavior|it)\s+(?:actually\s+)?(?:lives|is\s+implemented)|authoritative\s+(?:seam|source|path|implementation)|current\s+(?:repo(?:sitory)?|source|implementation)\s+truth|what\s+(?:currently\s+)?exists|contradict(?:ion|ions|ory)|disagree(?:s|ment)?|competing\s+(?:reports|implementations|code\s+paths)|unclear\s+(?:owner|implementation|source\s+of\s+truth))\b/i;
const BEFORE_ACTION = /\b(?:before\s+(?:changing|implementing|implementation|coding|modifying|choosing|selecting|we\s+change|we\s+implement)|evidence\s+first|investigate\s+first|establish\s+(?:current\s+)?truth\s+first|determine\s+what\s+exists\s+before|without\s+(?:changing|modifying|implementing)|read[- ]only\s+reconnaissance|do\s+not\s+(?:change|modify|implement))\b/i;
const PARALLEL_RECON = /\b(?:compare|across|multiple|several|competing)\b[\s\S]{0,120}\b(?:systems?|subsystems?|implementations?|architecture\s+seams?|providers?|code\s+paths?|reports?|modules?|components?)\b|\b(?:systems?|subsystems?|implementations?|architecture\s+seams?|providers?|code\s+paths?|reports?|modules?|components?)\b[\s\S]{0,120}\b(?:compare|across|multiple|several|competing)\b/i;
const IMPLEMENTATION_ACTION = /\b(?:implement|build|fix|patch|refactor|rename|update|modify|migrate|create|add|delete|rewrite)\b/i;
const NEGATED_IMPLEMENTATION_ACTION = /\b(?:do\s+not|don't|never|without)\s+(?:implement(?:ing)?|build(?:ing)?|fix(?:ing)?|patch(?:ing)?|refactor(?:ing)?|rename|update|modify(?:ing)?|migrate|create|add|delete|rewrite)\b/i;
const RECON_THEN_ACTION = /\b(?:scout|investigate|audit|inspect|gather\s+evidence)\b[\s\S]{0,240}\b(?:and\s+then|then|before|and)\s+(?:implement|build|fix|patch|refactor|update|modify|migrate|create|add|rewrite)\b/i;
const SYNTHESIS_ACTION = /\b(?:recommend|propose|design|choose|decide|draft|produce)\b(?:[\s\S]{0,80}\b(?:architecture|approach|plan|change|fix|next\s+step|implementation))?/i;
const RECON_ONLY_DELIVERABLE = /\b(?:tell\s+me\s+what\s+you\s+find|report\s+(?:back|the\s+findings)|summari[sz]e\s+(?:the\s+)?findings|findings\s+only|reconnaissance\s+only)\b/i;

/**
 * A deliberately small, explainable reconnaissance-first classifier. It looks
 * for intent plus evidence/action context; a hard/long/architectural Play or a
 * lone generic "find"/"investigate" is never enough.
 */
export function analyzeScoutNeed(prompt: string): ScoutNeedAnalysis {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  const scoutOriginated = SCOUT_ORIGIN_MARKER.test(text);
  const reconnaissancePrimary = STRONG_RECON_DIRECTIVE.test(text) && !NEGATED_RECON_DIRECTIVE.test(text);
  const materialEvidenceGap = EVIDENCE_GAP.test(text);
  const actionBlockedByUncertainty = BEFORE_ACTION.test(text) || RECON_THEN_ACTION.test(text);
  const boundedParallelReconUseful = PARALLEL_RECON.test(text);
  const implementationRequested = IMPLEMENTATION_ACTION.test(text) && !NEGATED_IMPLEMENTATION_ACTION.test(text);
  const supportedRecon = materialEvidenceGap || actionBlockedByUncertainty || boundedParallelReconUseful;
  const mutationSafelyDeferred = !implementationRequested || actionBlockedByUncertainty;
  const shouldUseScout = !scoutOriginated && reconnaissancePrimary && supportedRecon && mutationSafelyDeferred;

  let reason = 'Reconnaissance is not clearly the primary first action.';
  if (scoutOriginated) reason = 'Scout-originated evidence cannot recursively route to Scout.';
  else if (shouldUseScout && boundedParallelReconUseful && materialEvidenceGap) {
    reason = 'This Play requires bounded comparison across current seams to resolve material evidence uncertainty before action.';
  } else if (shouldUseScout && materialEvidenceGap && actionBlockedByUncertainty) {
    reason = 'Current implementation ownership is unresolved, and the Play explicitly requires evidence before action.';
  } else if (shouldUseScout) {
    reason = 'Reconnaissance is the primary task, and bounded evidence gathering is explicitly required before action.';
  } else if (reconnaissancePrimary && implementationRequested && !actionBlockedByUncertainty) {
    reason = 'The Play requests implementation now rather than a separate reconnaissance-first step.';
  } else if (reconnaissancePrimary && !supportedRecon) {
    reason = 'Reconnaissance wording alone does not establish a material evidence gap or a before-action boundary.';
  }

  return {
    reconnaissancePrimary,
    materialEvidenceGap,
    actionBlockedByUncertainty,
    boundedParallelReconUseful,
    implementationRequested,
    scoutOriginated,
    shouldUseScout,
    reason
  };
}

/**
 * Authority for exactly one post-Scout continuation. Reconnaissance requested
 * as the deliverable stops at the report; an explicit implementation or
 * synthesis deliverable authorizes Coach to resume the original objective.
 */
export function analyzeScoutContinuationAuthority(prompt: string): ScoutContinuationAuthority {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  const implementationRequested = IMPLEMENTATION_ACTION.test(text) && !NEGATED_IMPLEMENTATION_ACTION.test(text);
  const synthesisRequested = SYNTHESIS_ACTION.test(text);
  const reconnaissanceOnly = RECON_ONLY_DELIVERABLE.test(text)
    && !implementationRequested
    && !synthesisRequested;
  const authorized = !reconnaissanceOnly && (implementationRequested || synthesisRequested);
  const reason = authorized
    ? implementationRequested
      ? 'The original human Play explicitly includes implementation/change work after reconnaissance.'
      : 'The original human Play explicitly requests synthesis or an architecture recommendation after reconnaissance.'
    : reconnaissanceOnly
      ? 'The human requested reconnaissance as the deliverable, so Coach stops after the Scout report.'
      : 'The original Play does not clearly authorize work beyond the Scout evidence report.';
  return { authorized, implementationRequested, synthesisRequested, reconnaissanceOnly, reason };
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

const REPORT_CONTRACT_MARKER = /\b(?:REPORT\s+CONTRACT|REPORT\s+FILE\s*:|REPORT\s+NAME\s*:|REPORT\s+NUMBER\s*:|REPORT\s+TYPE\s*:|EXPECTED\s+REPORT\s+ROOT\s*:)\b/i;
const REPORT_REQUEST_DIRECTIVE = /\b(?:write|produce|create|generate|make|submit|file|provide|give\s+me|send)\s+(?:(?:a|an|the|our|your|full|formal|final|status|investigation|forensic|reconnaissance|scout|summary|markdown|md)\s+)*report\b/i;
const REPORT_BACK_DIRECTIVE = /\breport\s+(?:back|findings|results)\b/i;
const REPORT_DESTINATION_DIRECTIVE = /\b(?:save|write|put)\s+(?:the\s+|a\s+)?report\s+(?:to|in|into|under)\b/i;
const NEGATED_REPORT = /\b(?:do\s+not|don't|no|never|without)\s+(?:write|produce|create|generate|make|file|provide|send)\s+(?:a\s+|an\s+|any\s+)?report\b/i;

/**
 * Pure heuristic to determine whether a Play requested a report deliverable.
 * Authoritative per-Play truth: used so Finished plays only claim "Report on its way"
 * when a report was genuinely requested for this exact Play.
 */
export function isReportRequested(prompt: unknown): boolean {
  if (typeof prompt !== 'string') return false;
  const text = prompt.trim();
  if (!text) return false;
  if (REPORT_CONTRACT_MARKER.test(text)) return true;
  if (NEGATED_REPORT.test(text)) return false;
  return REPORT_REQUEST_DIRECTIVE.test(text) || REPORT_BACK_DIRECTIVE.test(text) || REPORT_DESTINATION_DIRECTIVE.test(text);
}

