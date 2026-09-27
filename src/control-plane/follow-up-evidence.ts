/**
 * R5 follow-up evidence: the dispatch-time facts Fix Attribution (S57.1 §8) needs from
 * a Play, extracted ONCE at the moment the Play is committed, then reduced to
 * derived values so no prompt or report text ever reaches the Film.
 *
 * Reuses the existing follow-up authorities (detectFollowUp / resolveContextOwner /
 * extractTouches / analyzePlay); it detects nothing new about "is this a follow-up".
 * Pure: no I/O, no clock, no Film.
 */

import * as crypto from 'node:crypto';
import type { TaskClassification } from '../capability-types';
import { analyzePlay, type PlayDifficulty } from '../play-analyzer';
import {
  detectFollowUp,
  extractTouches,
  resolveContextOwner,
  type ContextEvidence,
  type GameReportRef
} from './context-affinity';
import type { InstanceLedgerEntry } from './work-ledger';

/** S57.1 §8.1. */
export const FIX_CAUSES = [
  'player-defect',
  'prompt-change',
  'planned-continuation',
  'environment-drift',
  'bad-scout-evidence',
  'missing-context',
  'upstream-change',
  'unattributed'
] as const;
export type FixCause = typeof FIX_CAUSES[number];

/** Normalize a `FIX CAUSE:` envelope value to a canonical cause, or undefined. */
export function normalizeFixCause(raw: string): FixCause | undefined {
  const token = raw.trim().replace(/^[`"'*_]+|[`"'*_.\s]+$/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (FIX_CAUSES as readonly string[]).includes(token) ? token as FixCause : undefined;
}

export type FollowUpLinkEvidence =
  | 'named-report'
  | 'incoming-report'
  | 'latest-play'
  | 'touch-overlap'
  | 'scout-continuation';

/** Boolean wording facts. Derived; the wording itself is never kept. */
export interface FollowUpSignals {
  readonly defect: boolean;
  readonly change: boolean;
  /** Correction wording ("wrong", "stale", "doesn't exist"). */
  readonly correction: boolean;
  /** Names a stage/step of a plan ("Stage 2", "next Play", "R3"). */
  readonly planStage: boolean;
  /** Refers to Scout evidence in words ("the Scout report"). */
  readonly scoutEvidence: boolean;
}

export const NO_FOLLOW_UP_SIGNALS: FollowUpSignals = {
  defect: false, change: false, correction: false, planStage: false, scoutEvidence: false
};

const DEFECT = /\b(?:fix(?:es|ed|ing)?|bugs?|broken|regress(?:ion|ions|ed)?|(?:doesn'?t|does not|won'?t|will not) compile|tests?\s+(?:fail\w*|are\s+failing)|you\s+missed|not\s+working|(?:doesn'?t|does not)\s+work|still\s+(?:fails?|failing|broken))\b/i;
const CHANGE = /\b(?:instead|actually|change\s+of\s+plan|also\s+add|new\s+requirements?|scope|rather\s+than|on\s+second\s+thought|changed\s+my\s+mind)\b/i;
const CORRECTION = /\b(?:wrong|stale|incorrect|inaccurate|outdated|misleading|(?:doesn'?t|does not|no longer)\s+exists?)\b/i;
const PLAN_STAGE = /\b(?:stage\s*\d+|step\s*\d+|phase\s*\d+|next\s+(?:play|stage|step|phase)|R\d{1,2})\b/i;
const SCOUT_EVIDENCE = /\bscout(?:'s|s)?\s+(?:report|findings?|evidence|recon\w*|intel\w*)\b/i;
/** The structured header line itself must never count as wording ("FIX CAUSE:" contains "fix"). */
const FIX_CAUSE_LINE = /^[\s>#*_`\-+\d.)]*fix[\s_-]*cause\s*\**\s*:.*$/gim;
const SCAN_LIMIT = 8000;

/** Wording in the human's own text: fenced code and block quotes carry pasted material, not instruction. */
function humanWording(prompt: string): string {
  const kept: string[] = [];
  let fenced = false;
  for (const raw of prompt.slice(0, SCAN_LIMIT * 2).split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
    if (fenced || /^\s*>/.test(raw)) continue;
    kept.push(raw);
  }
  return kept.join('\n').replace(FIX_CAUSE_LINE, '').slice(0, SCAN_LIMIT);
}

export function extractFollowUpSignals(prompt: string): FollowUpSignals {
  const text = humanWording(typeof prompt === 'string' ? prompt : '');
  return {
    defect: DEFECT.test(text),
    change: CHANGE.test(text),
    correction: CORRECTION.test(text),
    planStage: PLAN_STAGE.test(text),
    scoutEvidence: SCOUT_EVIDENCE.test(text)
  };
}

/** Stable short key. Lets Film compare paths without storing them. */
export function evidenceKey(value: string): string {
  return crypto.createHash('sha256').update(value.replace(/\\/g, '/').trim().toLowerCase()).digest('hex').slice(0, 12);
}

export interface FollowUpEvidence {
  /** Existing detectFollowUp verdict. */
  readonly detected: 'new-work' | 'continuation';
  /** Existing resolveContextOwner verdict, when it named someone. Transient: `reportPath` is never persisted. */
  readonly owner?: {
    readonly instanceId: string;
    readonly evidence: ContextEvidence;
    readonly reportPath?: string;
    /** The Play that wrote that report, when the report's own provenance says so. */
    readonly reportClientRef?: string;
  };
  /** Set when this Play is the one post-Scout continuation; the parent is the Formation Play. */
  readonly scoutParentClientRef?: string;
  /** The Play names one of this Game's reports. */
  readonly namedReportKey?: string;
  readonly signals: FollowUpSignals;
  /** A structured `FIX CAUSE:` envelope value. */
  readonly fixCause?: FixCause;
}

export interface DispatchProfile {
  readonly taskClass: TaskClassification;
  readonly difficulty: PlayDifficulty;
  readonly role: 'player' | 'scout';
}

/** Everything R5 needs from one committed Play. No prompt text, no paths. */
export interface DispatchEvidence {
  readonly profile: DispatchProfile;
  /** Hashed file-like references the Play named (bounded by extractTouches). */
  readonly touchKeys: readonly string[];
  /** The route's context state, and the report it carried (hashed). */
  readonly context?: { readonly state: 'owner' | 'unknown' | 'none'; readonly reportKey?: string };
  /** Present only for a post-Scout continuation: the Scout report it acted on (hashed). */
  readonly scoutReportKey?: string;
  readonly followUp: FollowUpEvidence;
}

export interface DispatchEvidenceInput {
  readonly prompt: string;
  readonly gameId: string;
  readonly role: 'player' | 'scout';
  readonly ledger: readonly InstanceLedgerEntry[];
  readonly reports: readonly GameReportRef[];
  readonly incomingReportPath?: string;
  readonly decisionContext?: { readonly state: 'owner' | 'unknown' | 'none'; readonly reportPath?: string };
  readonly scoutContinuation?: { readonly originalClientRef: string; readonly reportPath: string };
  readonly fixCause?: FixCause;
}

export function buildDispatchEvidence(input: DispatchEvidenceInput): DispatchEvidence {
  const analysis = analyzePlay(input.prompt);
  const touchKeys = [...new Set(extractTouches(input.prompt).map(evidenceKey))].sort();
  const followUp = detectFollowUp(input.prompt, { incomingReportPath: input.incomingReportPath, reports: input.reports });
  const ownership = resolveContextOwner(followUp, input.gameId, input.ledger, input.reports);
  const named = followUp.kind === 'continuation' && followUp.source === 'named-report' ? followUp.reportPath : undefined;
  // A post-Scout continuation replays the ORIGINAL Play; its wording is not a follow-up's wording.
  const signals = input.scoutContinuation ? NO_FOLLOW_UP_SIGNALS : extractFollowUpSignals(input.prompt);
  const contextReport = input.decisionContext?.reportPath ?? (ownership.state !== 'none' ? ownership.report?.path : undefined);
  return {
    profile: { taskClass: analysis.taskType, difficulty: analysis.difficulty, role: input.role },
    touchKeys,
    ...(input.decisionContext
      ? { context: { state: input.decisionContext.state, ...(contextReport ? { reportKey: evidenceKey(contextReport) } : {}) } }
      : {}),
    ...(input.scoutContinuation ? { scoutReportKey: evidenceKey(input.scoutContinuation.reportPath) } : {}),
    followUp: {
      detected: followUp.kind,
      ...(ownership.state === 'owner'
        ? {
            owner: {
              instanceId: ownership.ownerInstanceId,
              evidence: ownership.evidence,
              ...(ownership.report?.path ? { reportPath: ownership.report.path } : {}),
              ...(ownership.report?.provenance?.clientRef ? { reportClientRef: ownership.report.provenance.clientRef } : {})
            }
          }
        : {}),
      ...(input.scoutContinuation ? { scoutParentClientRef: input.scoutContinuation.originalClientRef } : {}),
      ...(named ? { namedReportKey: evidenceKey(named) } : {}),
      signals,
      ...(input.fixCause ? { fixCause: input.fixCause } : {})
    }
  };
}
