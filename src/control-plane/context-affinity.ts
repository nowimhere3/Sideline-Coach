/**
 * Q2.10D — Context affinity.
 *
 *   "Given this new Play, who already knows the most useful context, what are they
 *    doing now, and what is the least-wasteful safe way to continue?"
 *
 * Evidence only. Structured evidence (a report the human is looking at, a report
 * named in the Play, explicit report provenance) always outranks prompt wording,
 * and prompt wording only ever *activates* a lookup of recorded evidence — it never
 * creates an owner by itself. Two prompts sharing generic words prove nothing.
 * Unknown is a valid, first-class answer.
 *
 * Pure: no I/O, no `vscode`. Everything is scoped to ONE Game by the caller.
 */

import type { InstanceLedgerEntry } from './work-ledger';
import type { ReportProvenance } from '../report-provenance';
export { friendlyInstanceNames } from '../player-display-labels';

export type ContextEvidence =
  | 'incoming-report'   // the human followed up on the report shown in Incoming
  | 'named-report'      // the Play names a report of this Game
  | 'latest-report'     // "that report / the recommendation" → newest report of this Game
  | 'latest-play';      // "continue / what you just built" → most recent Play in this Game

export interface GameReportRef {
  readonly path: string;
  readonly filename?: string;
  readonly mtime: number;
  readonly gameId?: string;
  /** Explicit provenance the report carries about itself (see report-provenance.ts). */
  readonly provenance?: ReportProvenance;
}

export type FollowUp =
  | { readonly kind: 'new-work' }
  | {
      readonly kind: 'continuation';
      readonly refersToReport: boolean;
      readonly reportPath?: string;
      /** Where the report reference came from: named in the Play, the Incoming report, or wording only. */
      readonly source: 'named-report' | 'incoming-report' | 'wording';
    };

export type ContextOwnership =
  | { readonly state: 'none' }
  | {
      readonly state: 'owner';
      readonly ownerInstanceId: string;
      readonly evidence: ContextEvidence;
      readonly confidence: 'strong' | 'medium';
      readonly report?: GameReportRef;
      readonly previousPlaySummary?: string;
    }
  | { readonly state: 'unknown'; readonly reason: string; readonly report?: GameReportRef };

const REPORT_NOUNS = '(?:report|reports|recommendation|recommendations|amendment|amendments|findings?|write-?up|analysis|assessment|review)';
const WORK_NOUNS = '(?:implementation|plan|proposal|fix|issue|change|changes|work|refactor|migration|branch|draft)';
/** Referring determiners — deliberately not a bare "the", which new work uses constantly. */
const REFERRING = '(?:that|this|those|these|your|the latest|the last|the previous|the same|latest|last|previous|above)';

const REPORT_REFERENCE = [
  new RegExp(`\\b${REFERRING}\\s+${REPORT_NOUNS}\\b`, 'i'),
  // A bare "the" only for nouns that name a report's content ("the review screen" is new work).
  /\bthe\s+(?:report|recommendations?|amendments?|findings)\b/i,
  new RegExp(`\\b(?:in|from|per)\\s+(?:the\\s+)?report\\b`, 'i')
];

const CONTINUATION = [
  new RegExp(`\\b${REFERRING}\\s+${WORK_NOUNS}\\b`, 'i'),
  /\b(?:continue|keep going|carry on|pick up where|follow[- ]?up|as (?:we )?discussed|we discussed)\b/i,
  /\byou(?:'ve| have)?\s+(?:just\s+)?(?:found|wrote|written|built|made|did|done|proposed|recommended|suggested|implemented|started|reported|flagged)\b/i,
  /\bwhat you (?:just )?(?:built|wrote|found|did|made|implemented|changed)\b/i,
  /^\s*(?:now|next|then|also)\s*,?\s+(?:test|verify|run|review|commit|push|fix|apply|finish|implement)\b/i
];

/** Conservative follow-up detection. Anything not clearly a continuation is new work. */
export function detectFollowUp(prompt: string, options: { incomingReportPath?: string; reports: readonly GameReportRef[] }): FollowUp {
  const text = prompt.trim();
  if (!text) return { kind: 'new-work' };
  const lower = text.toLowerCase();

  // Strongest: the Play names one of THIS Game's reports.
  const named = options.reports.find((report) => {
    const file = (report.filename ?? report.path.split('/').pop() ?? '').toLowerCase();
    const stem = file.replace(/\.[a-z0-9]+$/, '');
    return (file && lower.includes(file)) || (stem.length >= 8 && lower.includes(stem)) || lower.includes(report.path.toLowerCase());
  });
  if (named) return { kind: 'continuation', refersToReport: true, reportPath: named.path, source: 'named-report' };

  const refersToReport = REPORT_REFERENCE.some((pattern) => pattern.test(text));
  const continues = refersToReport || CONTINUATION.some((pattern) => pattern.test(text));
  if (!continues) return { kind: 'new-work' };

  const incoming = options.incomingReportPath && options.reports.some((report) => report.path === options.incomingReportPath)
    ? options.incomingReportPath
    : undefined;
  return refersToReport && incoming
    ? { kind: 'continuation', refersToReport: true, reportPath: incoming, source: 'incoming-report' }
    : { kind: 'continuation', refersToReport, source: 'wording' };
}

/**
 * Who owns the context a continuation refers to — from recorded evidence of THIS Game
 * only. Reports are attributed by explicit provenance first, then by the Ledger's
 * conservative single-active-play attribution. No attribution → Unknown.
 */
export function resolveContextOwner(
  followUp: FollowUp,
  gameId: string,
  ledger: readonly InstanceLedgerEntry[],
  reports: readonly GameReportRef[]
): ContextOwnership {
  if (followUp.kind === 'new-work') return { state: 'none' };
  const gameLedger = ledger.filter((entry) => entry.gameId === gameId);
  const gameReports = reports.filter((report) => !report.gameId || report.gameId === gameId);

  if (followUp.refersToReport) {
    const report = followUp.reportPath
      ? gameReports.find((candidate) => candidate.path === followUp.reportPath)
      : [...gameReports].sort((a, b) => b.mtime - a.mtime)[0];
    if (!report) return { state: 'unknown', reason: "Coach can't find the report this Play refers to." };
    const owner = ownerOfReport(report, gameId, gameLedger);
    if (!owner) return { state: 'unknown', reason: "Coach can't prove which Player owns this context.", report };
    const evidence: ContextEvidence = followUp.source === 'wording' ? 'latest-report' : followUp.source;
    return {
      state: 'owner',
      ownerInstanceId: owner.playerInstanceId,
      evidence,
      confidence: evidence === 'latest-report' ? 'medium' : 'strong',
      report,
      previousPlaySummary: previousPlay(owner, report)
    };
  }

  // "Continue / now test what you built": the most recent Play recorded in this Game.
  let latest: { entry: InstanceLedgerEntry; at: number; summary?: string } | undefined;
  for (const entry of gameLedger) {
    const current = entry.currentPlay ? { at: entry.currentPlay.startedAt, summary: entry.currentPlay.promptSummary } : undefined;
    const last = entry.recentPlays.find((play) => play.outcome !== 'not-sent');
    const lastAt = last ? { at: last.finishedAt, summary: last.promptSummary } : undefined;
    for (const candidate of [current, lastAt]) {
      if (candidate && (!latest || candidate.at > latest.at)) latest = { entry, at: candidate.at, summary: candidate.summary };
    }
  }
  if (!latest) return { state: 'unknown', reason: "Coach can't prove which Player owns this context." };
  return {
    state: 'owner',
    ownerInstanceId: latest.entry.playerInstanceId,
    evidence: 'latest-play',
    confidence: 'medium',
    previousPlaySummary: latest.summary ?? latest.entry.recentPlays[0]?.playLabel
  };
}


function ownerOfReport(report: GameReportRef, gameId: string, ledger: readonly InstanceLedgerEntry[]): InstanceLedgerEntry | undefined {
  const explicit = report.provenance?.playerInstanceId;
  if (explicit && (!report.provenance?.gameId || report.provenance.gameId === gameId)) {
    const match = ledger.find((entry) => entry.playerInstanceId === explicit);
    if (match) return match;
  }
  return ledger.find((entry) => entry.reports.some((link) => link.path === report.path));
}

function previousPlay(owner: InstanceLedgerEntry, report: GameReportRef): string | undefined {
  const link = owner.reports.find((candidate) => candidate.path === report.path);
  const play = link?.clientRef
    ? owner.recentPlays.find((candidate) => candidate.clientRef === link.clientRef) ?? (owner.currentPlay?.clientRef === link.clientRef ? owner.currentPlay : undefined)
    : undefined;
  return (play as { promptSummary?: string; playLabel?: string } | undefined)?.promptSummary ?? play?.playLabel;
}

// --- Intent of the Play ------------------------------------------------------

const MODIFIES = /\b(?:fix|apply|implement|amend|change|update|refactor|edit|rewrite|add|remove|delete|rename|migrat\w*|commit|push|merge|continue|finish|build|create|patch|write)\b/i;
const READ_ONLY = /\b(?:review|summari[sz]e|explain|analy[sz]e|assess|audit|check|compare|critique|evaluate|read|investigate|verify|inspect|look at|what does|why does)\b/i;

/** Does this Play change the Game (as opposed to reading or judging it)? Unknown leans to "changes". */
export function playModifiesGame(prompt: string): boolean {
  if (MODIFIES.test(prompt)) return true;
  return !READ_ONLY.test(prompt);
}

// --- Collision awareness -----------------------------------------------------

const PATH_TOKEN = /(?:[\w.-]+[\\/])+[\w.-]+\.[a-z0-9]{1,6}\b|\b[\w-]+\.(?:ts|tsx|js|mjs|cjs|jsx|py|cs|java|go|rs|md|json|ya?ml|sql|css|scss|html|sh|ps1)\b/gi;

/** File-like references a Play names. Bounded; lower-case, forward slashes, basename kept. */
export function extractTouches(prompt: string): string[] {
  const found = new Set<string>();
  for (const match of prompt.matchAll(PATH_TOKEN)) {
    const normalized = match[0].replace(/\\/g, '/').toLowerCase();
    found.add(normalized);
    found.add(normalized.split('/').pop()!);
    if (found.size >= 24) break;
  }
  return [...found];
}

/**
 * Conservative overlap: the new Play names a file the working instance's current Play
 * also names. No shared file reference → no claimed collision (Unknown, not "safe").
 */
export function detectCollision(prompt: string, working: readonly InstanceLedgerEntry[]): { instanceId: string; touch: string } | undefined {
  const touches = new Set(extractTouches(prompt));
  if (!touches.size) return undefined;
  for (const entry of working) {
    const theirs = (entry.currentPlay as { touches?: readonly string[] } | undefined)?.touches ?? [];
    const shared = theirs.find((touch) => touches.has(touch) && touch.includes('.'));
    if (shared) return { instanceId: entry.playerInstanceId, touch: shared };
  }
  return undefined;
}

// --- Handoff package -----------------------------------------------------------

/**
 * The minimum context a different instance needs, as a short provider-neutral preamble.
 * References authoritative artifacts; never pastes histories or report bodies.
 */
export function buildHandoffPreamble(input: {
  ownerName?: string;
  report?: GameReportRef;
  previousPlaySummary?: string;
  reason: 'owner-busy' | 'owner-unavailable' | 'owner-unknown' | 'explicit-route';
}): string {
  const lines = ['[Sideline Coach handoff]'];
  if (input.ownerName) lines.push(`You are continuing work previously handled by ${input.ownerName} in this Game.`);
  else lines.push('You are continuing earlier work in this Game.');
  if (input.report) lines.push(`Read this report before proceeding: ${input.report.path}`);
  if (input.previousPlaySummary) lines.push(`Previous Play: "${input.previousPlaySummary}"`);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

// --- Friendly names ------------------------------------------------------------

/**
 * Human names by contiguous position in stable seat order — the same presentation
 * the page uses ("Claude 1", "Claude 2"). Machine identity stays the instance id.
 */
