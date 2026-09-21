/**
 * Scout Combine (V0.3) — automated Scout tryouts, game film, and scorecards.
 *
 * WAS: OpenCode/OpenRouter free-model prospects were discovered and evaluated
 * manually or through one-off formations. Availability changes required human
 * rediscovery, and the roster (SCOUT_ROSTER in scout-play-runner.ts) fossilized
 * whichever model names were current when someone last edited the file.
 * IS: Sideline can dynamically discover suitable Scout prospects (see
 * scout-combine-discovery.ts), run a bounded automated read-only tryout funnel,
 * classify failures truthfully (provider/auth/rate-limit vs a genuine hard
 * failure), preserve game film, and maintain durable machine-readable Scout
 * scorecards (REPORTS/Scout Only/Combine/Scorecards/<candidateId>.json).
 * WHY: the coaching staff should maintain the receiving corps. Humans should
 * not spend attention or premium tokens repeatedly discovering which cheap
 * Scout routes currently work.
 *
 * Coach Refresh reuses this module's selection and tryout machinery through
 * the `refresh-due` selection policy; Combine remains the only scorecard
 * writer. A Dev Mode depth-chart UI, CONSERVE-aware routing, and health-aware
 * Formation selection remain future consumers of this evidence.
 *
 * FUTURE PRODUCT BOUNDARY: whether Scouts ship as an always-on capability, a
 * Dev Mode toggle, or a future paid/edition-gated module is intentionally
 * undecided. OpenRouter credentials belong to the user. Sideline may retrieve
 * the user's securely stored credential just in time for execution, but the
 * key is never durable Combine state; standalone tools retain the explicit
 * process-environment fallback.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createScoutExecutionEnvironment } from './scout-openrouter-credential';
import { resolveScoutWorkRoot } from './scout-intelligence-root';
import { releaseReceiverScaffolding, summarizeWorkHygiene, type ReceiverWorkHygiene, type WorkHygieneSummary } from './scout-work-hygiene';
import { createScoutPlayEnvelope, type ScoutPlayEnvelope } from './scout-play';
import {
  evaluateScoutReport,
  LEGACY_SCOUT_EVALUATION_CONTRACT_REVISION,
  providerFailure,
  REQUIRED_SCOUT_STATEMENT,
  RESULT_SECTIONS,
  SCOUT_EVALUATION_CONTRACT_REVISION,
  validateDirectGeminiAgent,
  type InterchangeabilityState,
  type ScoutAttemptTelemetry,
  type ScoutExecutionOutcome,
  type ScoutExecutorContext,
  type ScoutPlayExecutor
} from './scout-interchangeability-runner';
import { resolveOpenCodeExecutable } from './scout-play-runner';
import { looksLikeProviderIssue as isProviderIssueText } from './scout-substitution';
import {
  discoverCombineProspects,
  type CombineDiscoveryOptions,
  type CombineDiscoveryReport,
  type CombineProspect,
  type CombineProviderFamily
} from './scout-combine-discovery';

// --- Tryout routes ------------------------------------------------------------

export type TryoutRouteId = 'A' | 'B' | 'C';

export interface TryoutRoute {
  readonly id: TryoutRouteId;
  readonly name: string;
  readonly objective: string;
}

/**
 * Route A/B are defined now so a future Combine can offer a second, earned
 * snap without inventing new plumbing; V0.3's funnel dispatches Route C only
 * (see runScoutCombine) — one inexpensive, generic snap per prospect.
 */
export const TRYOUT_ROUTES: Readonly<Record<TryoutRouteId, TryoutRoute>> = Object.freeze({
  A: {
    id: 'A',
    name: 'Repository Archaeology',
    objective: 'Find this Game’s own top-level project manifest file (for example package.json, pyproject.toml, or an equivalent). Identify the exact file, its declared project name, and one script or entry point it defines. Cite the exact file path.'
  },
  B: {
    id: 'B',
    name: 'Contradiction Hunt',
    objective: 'Examine this Game’s top-level project manifest and its README (or nearest equivalent introductory document) if one exists. Identify one proven contradiction between what the manifest declares and what the README claims, or truthfully report that none exists.'
  },
  C: {
    id: 'C',
    name: 'Bounded Evidence Answer',
    objective: 'Identify this Game’s own top-level project manifest file (for example package.json, pyproject.toml, or an equivalent). State its declared project name and cite one real dependency, script, or configuration entry it defines. If no such manifest exists, truthfully report UNKNOWN and describe what evidence you found instead.'
  }
});

// --- Scorecards -----------------------------------------------------------

export type CombineStatus = 'READY' | 'ROTATION' | 'LIMITED' | 'PROVIDER UNSTABLE' | 'RATE LIMITED' | 'AUTH ISSUE' | 'UNAVAILABLE' | 'CALL BACK LATER' | 'UNKNOWN';

export interface CombineScorecardTotals {
  readonly starts: number;
  readonly completions: number;
  readonly failures: number;
  readonly providerFailures: number;
  readonly rateLimitFailures: number;
  readonly authFailures: number;
  readonly blocked: number;
}

export interface CombineScorecard {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly provider: CombineProviderFamily;
  readonly model: string;
  readonly displayName: string;
  readonly harness: 'opencode';
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly lastTryoutAt?: string;
  readonly currentStatus: CombineStatus;
  readonly totals: CombineScorecardTotals;
  readonly routeAttempts: Readonly<Record<string, { readonly attempts: number; readonly completions: number }>>;
  readonly latestEvidencePaths: readonly string[];
  readonly latestObservedRoute: string;
  readonly notes: readonly string[];
  /** Infrastructure availability observation; never a Player-quality score. */
  readonly availabilityEvidence?: { readonly state: 'CATALOG_ABSENT' | 'FIELD_BLOCKED'; readonly observedAt: string };
  /** The provider/harness execution contract under which the latest tryout was observed. */
  readonly qualificationEvidence?: { readonly scope: string; readonly revision: string; readonly observedAt: string };
  /** The separate evaluator contract that interpreted the preserved report evidence. */
  readonly evaluationEvidence?: {
    readonly revision: string;
    readonly observedAt: string;
    readonly sourceReportPath: string;
    readonly priorRevision?: string;
    readonly priorStatus?: CombineStatus;
  };
}

export const OPENROUTER_OPENCODE_QUALIFICATION = Object.freeze({
  scope: 'openrouter/opencode',
  revision: 'authenticated-isolated-opencode-v1'
});

interface ActiveQualification {
  readonly scope: string;
  readonly revision: string;
}

const ZERO_TOTALS: CombineScorecardTotals = { starts: 0, completions: 0, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 };

/**
 * Measured telemetry (completionState, exit code) stays separate from this
 * status: a provider/auth/rate-limit condition never becomes a model-quality
 * verdict, and a hard FAILED tryout earns CALL BACK LATER, never a permanent
 * cut — only an explicit human Remove/roster decision (outside this module)
 * ever retires a Player.
 */
export function deriveCombineStatus(attempt: Pick<ScoutAttemptTelemetry, 'completionState' | 'failureBoundary' | 'providerError' | 'evaluation'> & Partial<Pick<ScoutAttemptTelemetry, 'reportCreated' | 'readOnlyContractHeld'>>): CombineStatus {
  if (attempt.completionState === 'COMPLETE') {
    const evidenceReady = attempt.reportCreated === true
      && attempt.readOnlyContractHeld === true
      && attempt.evaluation.reportStructurallyUsable
      && attempt.evaluation.significantEvidenceMissing === null
      && attempt.evaluation.obviousUnsupportedClaim === null;
    return evidenceReady ? 'READY' : 'LIMITED';
  }
  const text = `${attempt.failureBoundary ?? ''} ${attempt.providerError ?? ''}`;
  if (attempt.completionState === 'BLOCKED') {
    if (/auth issue|sign.?in|unauthorized|forbidden|api[_ -]?key|credential|provider not found|not configured|not connected/i.test(text)) return 'AUTH ISSUE';
    if (/rate.?limit|quota|429|resource.?exhausted/i.test(text)) return 'RATE LIMITED';
    if (/provider.?model.?not.?found|model not found|no such model|unsupported model|free tier can only be used/i.test(text)) return 'UNAVAILABLE';
    return 'PROVIDER UNSTABLE';
  }
  if (attempt.completionState === 'FAILED') return 'CALL BACK LATER';
  return 'UNKNOWN'; // INTERRUPTED | UNKNOWN
}

function mergeScorecard(existing: CombineScorecard | undefined, prospect: CombineProspect, attempt: ScoutAttemptTelemetry, route: TryoutRouteId, status: CombineStatus, now: string, qualification: ActiveQualification | undefined): CombineScorecard {
  const totals = existing?.totals ?? ZERO_TOTALS;
  const isCompletion = attempt.completionState === 'COMPLETE';
  const isBlocked = attempt.completionState === 'BLOCKED';
  const isHardFailure = !isCompletion && !isBlocked;
  const nextTotals: CombineScorecardTotals = {
    starts: totals.starts + 1,
    completions: totals.completions + (isCompletion ? 1 : 0),
    failures: totals.failures + (isHardFailure ? 1 : 0),
    providerFailures: totals.providerFailures + (status === 'PROVIDER UNSTABLE' || status === 'AUTH ISSUE' || status === 'RATE LIMITED' || status === 'UNAVAILABLE' ? 1 : 0),
    rateLimitFailures: totals.rateLimitFailures + (status === 'RATE LIMITED' ? 1 : 0),
    authFailures: totals.authFailures + (status === 'AUTH ISSUE' ? 1 : 0),
    blocked: totals.blocked + (isBlocked ? 1 : 0)
  };
  const routeAttempts: Record<string, { attempts: number; completions: number }> = { ...existing?.routeAttempts };
  const prior = routeAttempts[route] ?? { attempts: 0, completions: 0 };
  routeAttempts[route] = { attempts: prior.attempts + 1, completions: prior.completions + (isCompletion ? 1 : 0) };
  const evidence = attempt.durableReportPath ? [attempt.durableReportPath, ...(existing?.latestEvidencePaths ?? [])] : [...(existing?.latestEvidencePaths ?? [])];
  const notes = attempt.failureBoundary ? [`${now}: ${attempt.failureBoundary}`, ...(existing?.notes ?? [])] : [...(existing?.notes ?? [])];
  return {
    schemaVersion: 1,
    candidateId: prospect.candidateId,
    provider: prospect.provider,
    model: prospect.model,
    displayName: prospect.displayName,
    harness: 'opencode',
    firstSeen: existing?.firstSeen ?? prospect.discoveredAt,
    lastSeen: now,
    lastTryoutAt: now,
    currentStatus: status,
    totals: nextTotals,
    routeAttempts,
    latestEvidencePaths: evidence.slice(0, 10),
    latestObservedRoute: prospect.model,
    notes: notes.slice(0, 20),
    evaluationEvidence: attempt.durableReportPath
      ? { revision: attempt.evaluation.evaluationContractRevision, observedAt: now, sourceReportPath: attempt.durableReportPath }
      : existing?.evaluationEvidence,
    qualificationEvidence: qualification
      ? { ...qualification, observedAt: now }
      : prospect.provider === 'openrouter' ? undefined : existing?.qualificationEvidence
  };
}

function scorecardsDir(durableReportRoot: string): string {
  return path.join(path.resolve(durableReportRoot), 'Combine', 'Scorecards');
}

function readScorecard(dir: string, candidateId: string): CombineScorecard | undefined {
  try { return JSON.parse(fs.readFileSync(path.join(dir, `${candidateId}.json`), 'utf8')) as CombineScorecard; }
  catch { return undefined; }
}

function writeScorecard(dir: string, scorecard: CombineScorecard): void {
  atomicJson(path.join(dir, `${scorecard.candidateId}.json`), scorecard);
}

export interface CombineEvidenceReevaluation {
  readonly candidateId: string;
  readonly priorStatus?: CombineStatus;
  readonly priorEvaluationRevision?: string;
  readonly status?: CombineStatus;
  readonly evaluationRevision: typeof SCOUT_EVALUATION_CONTRACT_REVISION;
  readonly changed: boolean;
  readonly reportPath?: string;
  readonly reason: string;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Reinterprets preserved COMPLETE Combine evidence under the current report
 * evaluator. It never executes a provider, rewrites a report/run artifact,
 * changes tryout counters, or overloads execution qualification metadata.
 */
export function reevaluateCombineEvidence(input: {
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  readonly candidateIds: readonly string[];
  readonly now?: () => Date;
}): readonly CombineEvidenceReevaluation[] {
  const durableRoot = path.resolve(input.durableReportRoot);
  const dir = scorecardsDir(durableRoot);
  const observedAt = (input.now?.() ?? new Date()).toISOString();
  return input.candidateIds.map((candidateId): CombineEvidenceReevaluation => {
    const card = readScorecard(dir, candidateId);
    const base = {
      candidateId,
      priorStatus: card?.currentStatus,
      priorEvaluationRevision: card?.evaluationEvidence?.revision ?? (card ? LEGACY_SCOUT_EVALUATION_CONTRACT_REVISION : undefined),
      evaluationRevision: SCOUT_EVALUATION_CONTRACT_REVISION,
      changed: false
    } as const;
    if (!card) return { ...base, reason: 'No scorecard exists.' };
    if (card.evaluationEvidence?.revision === SCOUT_EVALUATION_CONTRACT_REVISION) {
      return { ...base, status: card.currentStatus, reportPath: card.evaluationEvidence.sourceReportPath, reason: 'The scorecard already uses the current evaluator contract.' };
    }
    if (card.currentStatus !== 'LIMITED') {
      return { ...base, status: card.currentStatus, reason: `Only LIMITED evidence is eligible for evaluator-only re-evaluation; current status is ${card.currentStatus}.` };
    }
    const reportPath = card.latestEvidencePaths.find((candidate) => isWithin(durableRoot, candidate) && fs.existsSync(candidate));
    if (!reportPath) return { ...base, status: card.currentStatus, reason: 'No preserved durable report inside the canonical Scout evidence root was found.' };
    let completion: CombineCompletion;
    try { completion = JSON.parse(fs.readFileSync(path.join(path.dirname(reportPath), 'COMBINE-COMPLETE.json'), 'utf8')) as CombineCompletion; }
    catch { return { ...base, status: card.currentStatus, reportPath, reason: 'The preserved report has no readable Combine completion telemetry.' }; }
    const historicalAttempt = completion.attempts.find((attempt) => attempt.executorId === candidateId
      && attempt.completionState === 'COMPLETE'
      && attempt.reportCreated === true
      && attempt.readOnlyContractHeld === true
      && attempt.durableReportPath !== undefined
      && path.resolve(attempt.durableReportPath) === path.resolve(reportPath));
    if (!historicalAttempt) return { ...base, status: card.currentStatus, reportPath, reason: 'The preserved report is not backed by matching COMPLETE, read-only Combine telemetry.' };

    const report = fs.readFileSync(reportPath, 'utf8');
    const evaluation = evaluateScoutReport(report, path.resolve(input.gameRoot));
    const status = deriveCombineStatus({ completionState: 'COMPLETE', reportCreated: true, readOnlyContractHeld: true, evaluation });
    const priorRevision = base.priorEvaluationRevision;
    const note = `${observedAt}: Evaluator-only re-evaluation interpreted the unchanged durable report under ${SCOUT_EVALUATION_CONTRACT_REVISION}; canonical status ${card.currentStatus} -> ${status}. Prior evaluator: ${priorRevision}. No provider execution occurred, tryout counters are unchanged, and the original Combine evidence retains the earlier ${card.currentStatus} observation.`;
    writeScorecard(dir, {
      ...card,
      currentStatus: status,
      notes: [note, ...card.notes].slice(0, 20),
      evaluationEvidence: {
        revision: SCOUT_EVALUATION_CONTRACT_REVISION,
        observedAt,
        sourceReportPath: reportPath,
        priorRevision,
        priorStatus: card.currentStatus
      }
    });
    return { ...base, status, changed: status !== card.currentStatus || priorRevision !== SCOUT_EVALUATION_CONTRACT_REVISION, reportPath, reason: note };
  });
}

/**
 * Combine remains the canonical scorecard authority, but a real Formation is
 * stronger fieldability evidence than an older tryout. A definitive BLOCKED
 * infrastructure observation suspends a READY receiver without incrementing
 * Player-quality starts/failures or rewriting the prior tryout evidence. A
 * later bounded Combine tryout is the only path back to READY.
 */
export function recordFormationInfrastructureBlock(input: {
  readonly durableReportRoot: string;
  readonly candidateId: string;
  readonly attempt: Pick<ScoutAttemptTelemetry, 'completionState' | 'failureBoundary' | 'providerError' | 'evaluation'>;
  readonly observedAt: string;
}): CombineScorecardUpdate | undefined {
  if (input.attempt.completionState !== 'BLOCKED') return undefined;
  const dir = scorecardsDir(input.durableReportRoot);
  const card = readScorecard(dir, input.candidateId);
  if (!card) return undefined;
  const status = deriveCombineStatus(input.attempt);
  if (status === 'READY' || status === 'ROTATION' || status === 'LIMITED' || status === 'CALL BACK LATER' || status === 'UNKNOWN') return undefined;
  const firstSuspension = card.currentStatus === 'READY';
  const evidenceBackfill = card.currentStatus === status && card.availabilityEvidence?.state !== 'FIELD_BLOCKED';
  if (!firstSuspension && !evidenceBackfill) return undefined;
  const boundary = input.attempt.failureBoundary ?? input.attempt.providerError ?? 'Formation observed a blocked execution boundary.';
  const note = `${input.observedAt}: Real Formation execution was BLOCKED (${boundary}). READY is suspended as ${status}; counters and prior Player-quality film are unchanged because this is execution-layer infrastructure evidence.`;
  writeScorecard(dir, { ...card, currentStatus: status, availabilityEvidence: { state: 'FIELD_BLOCKED', observedAt: input.observedAt }, notes: firstSuspension ? [note, ...card.notes].slice(0, 20) : card.notes });
  return { candidateId: card.candidateId, status };
}

// --- Bounded tryout budget and callback-aware selection --------------------

export interface CombineBudget {
  /** Total prospects actually tried this run. Default 5 — a smoke funnel, never a full-catalog sweep. */
  readonly maxTryouts?: number;
  readonly maxConcurrency?: number;
}

const DEFAULT_BUDGET: Required<CombineBudget> = { maxTryouts: 5, maxConcurrency: 2 };
export const COMBINE_STALE_MS = 7 * 24 * 60 * 60 * 1_000;
const CALLBACK_STATUSES: ReadonlySet<CombineStatus> = new Set(['AUTH ISSUE', 'RATE LIMITED', 'PROVIDER UNSTABLE', 'CALL BACK LATER', 'UNKNOWN', 'LIMITED', 'UNAVAILABLE']);

export type CombineSelectionPolicy = 'ranked' | 'refresh-due';

export interface CombineCandidateConsideration {
  readonly candidateId: string;
  readonly priorStatus: CombineStatus | 'NEW';
  readonly lastTryoutAt?: string;
  readonly due: boolean;
  readonly reason: string;
}

/**
 * WAS: Scout scorecard refresh was primarily age/retry-window driven.
 * IS: A materially changed execution environment may make an older
 * qualification non-representative and therefore due for bounded
 * requalification without changing Player-quality history.
 * WHY: Shared infrastructure defects must not strand capable Players on the
 * bench or poison Sideline's future depth chart.
 * WILL BE: Future Adaptive Coaching Intelligence may use execution health,
 * task-specific game film, resource cost, sample size, and current
 * qualification together while observation, inference, and policy remain
 * separate.
 */
function isInvalidatedOpenRouterQualification(scorecard: CombineScorecard, activeQualification: ActiveQualification | undefined): boolean {
  if (!activeQualification
    || activeQualification.scope !== OPENROUTER_OPENCODE_QUALIFICATION.scope
    || scorecard.provider !== 'openrouter'
    || scorecard.harness !== 'opencode'
    || scorecard.availabilityEvidence?.state === 'FIELD_BLOCKED') return false;
  if (scorecard.qualificationEvidence?.scope === activeQualification.scope
    && scorecard.qualificationEvidence.revision === activeQualification.revision) return false;
  if (!new Set<CombineStatus>(['AUTH ISSUE', 'PROVIDER UNSTABLE', 'CALL BACK LATER', 'UNKNOWN']).has(scorecard.currentStatus)) return false;
  const recordedBoundary = scorecard.notes.join('\n');
  return /OPENROUTER_API_KEY is not available|provider(?:\s+model)?\s+not\s+found|openrouter.*not (?:configured|connected)|^.*Error:\s*\{\s*$/im.test(recordedBoundary);
}

function refreshConsideration(prospect: CombineProspect, scorecard: CombineScorecard | undefined, nowMs: number, activeQualification: ActiveQualification | undefined): CombineCandidateConsideration {
  if (!scorecard) {
    return { candidateId: prospect.candidateId, priorStatus: 'NEW', due: true, reason: 'No Combine scorecard exists; the newly discovered prospect is due for its first bounded tryout.' };
  }
  const returnedAfterCatalogAbsence = scorecard.currentStatus === 'UNAVAILABLE'
    && (scorecard.availabilityEvidence?.state === 'CATALOG_ABSENT'
      || scorecard.notes.some((note) => /discovery succeeded .* no longer returned this candidate/i.test(note)));
  if (returnedAfterCatalogAbsence) {
    return { candidateId: prospect.candidateId, priorStatus: scorecard.currentStatus, lastTryoutAt: scorecard.lastTryoutAt, due: true, reason: 'The prospect has reappeared after being absent from a successful provider catalog; a fresh fieldability tryout is required before READY can return.' };
  }
  if (isInvalidatedOpenRouterQualification(scorecard, activeQualification)) {
    return { candidateId: prospect.candidateId, priorStatus: scorecard.currentStatus, lastTryoutAt: scorecard.lastTryoutAt, due: true, reason: 'The previous qualification used the pre-repair OpenRouter/OpenCode execution environment and is not representative of the current authenticated execution contract; bounded infrastructure requalification is due.' };
  }
  const lastTryoutMs = scorecard.lastTryoutAt ? Date.parse(scorecard.lastTryoutAt) : Number.NaN;
  if (!Number.isFinite(lastTryoutMs)) {
    return { candidateId: prospect.candidateId, priorStatus: scorecard.currentStatus, lastTryoutAt: scorecard.lastTryoutAt, due: true, reason: 'The scorecard has no valid lastTryoutAt; its tryout evidence is treated as stale.' };
  }
  if (nowMs - lastTryoutMs > COMBINE_STALE_MS) {
    return { candidateId: prospect.candidateId, priorStatus: scorecard.currentStatus, lastTryoutAt: scorecard.lastTryoutAt, due: true, reason: `The last Combine tryout is older than the existing ${COMBINE_STALE_MS / 86_400_000}-day staleness window.` };
  }
  return { candidateId: prospect.candidateId, priorStatus: scorecard.currentStatus, lastTryoutAt: scorecard.lastTryoutAt, due: false, reason: `The last Combine tryout is still inside the existing ${COMBINE_STALE_MS / 86_400_000}-day staleness window; do not retry immediately.` };
}

/** 0 = newly discovered, 1 = stale evidence, 2 = previous callback, 3 = recently proven (lowest priority). */
function priorityRank(scorecard: CombineScorecard | undefined, nowMs: number): 0 | 1 | 2 | 3 {
  if (!scorecard) return 0;
  if (!scorecard.lastTryoutAt || nowMs - Date.parse(scorecard.lastTryoutAt) > COMBINE_STALE_MS) return 1;
  if (CALLBACK_STATUSES.has(scorecard.currentStatus)) return 2;
  return 3;
}

interface Selection {
  readonly selected: readonly CombineProspect[];
  readonly scorecards: ReadonlyMap<string, CombineScorecard | undefined>;
  readonly considerations: readonly CombineCandidateConsideration[];
}

function selectForTryout(prospects: readonly CombineProspect[], dir: string, budget: Required<CombineBudget>, nowMs: number, policy: CombineSelectionPolicy, activeQualification: ActiveQualification | undefined): Selection {
  const scorecards = new Map<string, CombineScorecard | undefined>();
  for (const prospect of prospects) scorecards.set(prospect.candidateId, readScorecard(dir, prospect.candidateId));
  const ordered = [...prospects].sort((a, b) => {
    const diff = priorityRank(scorecards.get(a.candidateId), nowMs) - priorityRank(scorecards.get(b.candidateId), nowMs);
    return diff !== 0 ? diff : a.candidateId.localeCompare(b.candidateId);
  });
  const considerations = ordered.map((prospect) => refreshConsideration(prospect, scorecards.get(prospect.candidateId), nowMs, activeQualification));
  const dueIds = new Set(considerations.filter((entry) => entry.due).map((entry) => entry.candidateId));
  const eligible = policy === 'refresh-due' ? ordered.filter((prospect) => dueIds.has(prospect.candidateId)) : ordered;
  return { selected: eligible.slice(0, budget.maxTryouts), scorecards, considerations };
}

// --- Executor: OpenCode CLI, any discovered route, shared read-only agent ---

const COMBINE_AGENT = 'sideline-combine-scout';

function combineAgentDefinition(): string {
  return '---\ndescription: Sideline Scout Combine read-only reconnaissance\nmode: primary\npermission:\n  "*": deny\n  read:\n    "*": allow\n    "*.env": deny\n    "*.env.*": deny\n  glob: allow\n  grep: allow\n  list: allow\n  external_directory: deny\n---\n\nYou are a Sideline Coach Read-Only Reconnaissance Scout undergoing a bounded Combine tryout.\n\nFollow the complete semantic Scout Play in the user message exactly. Do not edit or create files, execute shell commands, mutate git, install packages, change configuration, implement fixes, or launch subagents. Stop when the bounded reconnaissance is complete.\n';
}

interface ProcessResult { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; startedAt: string; endedAt: string; timedOut: boolean }

function runProcess(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let child;
    try { child = spawn(command, [...args], { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ code: null, signal: null, stdout, stderr: error instanceof Error ? error.message : String(error), startedAt, endedAt: new Date().toISOString(), timedOut: false }); return; }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { /* already gone */ } }, timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => { stderr += `${error.stack ?? error.message}\n`; });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, startedAt, endedAt: new Date().toISOString(), timedOut }); });
  });
}

export interface CombineExecutorOptions {
  readonly opencodeExecutable?: string;
  /** Test seam: arguments placed before `run` (e.g. a fixture script path). */
  readonly prefixArgs?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

/**
 * One ScoutPlayExecutor per discovered prospect, all sharing the SAME
 * read-only agent contract (reused verbatim: validateDirectGeminiAgent is
 * provider-agnostic despite its name — this is the one existing Scout
 * read-only enforcement, not a second permission system). Only the
 * `--model` route selector differs per prospect. Each attempt runs against
 * its own isolated OPENCODE_CONFIG_DIR/XDG_DATA_HOME under the attempt's own
 * evidence folder, so a Combine run never depends on, or can be corrupted
 * by, the human's real OpenCode installation state.
 */
export function createCombineExecutor(prospect: CombineProspect, routeLabel: string, options: CombineExecutorOptions = {}): ScoutPlayExecutor {
  return {
    id: prospect.candidateId,
    player: prospect.displayName,
    harness: 'OpenCode',
    provider: prospect.provider === 'openrouter' ? 'OpenRouter' : 'OpenCode Zen',
    async execute(envelope: ScoutPlayEnvelope, context: ScoutExecutorContext): Promise<ScoutExecutionOutcome> {
      const configDir = path.join(context.playerPath, '.opencode-combine');
      const dataDir = path.join(context.playerPath, '.opencode-combine-data');
      fs.mkdirSync(path.join(configDir, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(configDir, 'agents', `${COMBINE_AGENT}.md`), combineAgentDefinition(), 'utf8');
      try { validateDirectGeminiAgent(configDir, COMBINE_AGENT); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { state: 'BLOCKED', stdout: '', stderr: `${message}\n`, model: prospect.model, exitCode: null, signal: null, readOnlyContractHeld: false, failureBoundary: `AUTHORITY BLOCKED: ${message}` };
      }
      const executable = options.opencodeExecutable ?? resolveOpenCodeExecutable();
      const env: NodeJS.ProcessEnv = { ...process.env, ...options.env, OPENCODE_CONFIG_DIR: configDir, XDG_DATA_HOME: dataDir };
      if (prospect.provider === 'openrouter' && !env.OPENROUTER_API_KEY) {
        const message = 'OPENROUTER_API_KEY is not available to the isolated OpenCode Scout process. OpenRouter execution was not attempted.';
        return { state: 'BLOCKED', stdout: '', stderr: `${message}\n`, model: prospect.model, exitCode: null, signal: null, readOnlyContractHeld: true, providerError: message, failureBoundary: `AUTH ISSUE: ${message}` };
      }
      const run = await runProcess(
        executable,
        [...(options.prefixArgs ?? []), '--print-logs', '--log-level', 'ERROR', 'run', '--agent', COMBINE_AGENT, '--model', prospect.model, '--format', 'default', '--dir', context.gameRoot, envelope.semanticPrompt],
        context.gameRoot,
        env,
        options.timeoutMs ?? 5 * 60_000
      );
      const failure = providerFailure(`${run.stdout}\n${run.stderr}`);
      // A non-zero exit that looks like a provider/auth/quota condition is
      // BLOCKED (recoverable, provider-side), never a hard model-quality FAILED
      // — the same distinction the AntiGravity and Gemini Direct executors
      // already make, applied here to any discovered OpenCode-routed model.
      const looksLikeProviderIssue = run.code !== 0 && run.code !== null && !run.signal && !run.timedOut
        && isProviderIssueText(`${run.stdout} ${run.stderr}`);
      const state: InterchangeabilityState = run.timedOut ? 'INTERRUPTED'
        : run.signal ? 'INTERRUPTED'
        : run.code === 0 ? 'COMPLETE'
        : run.code === null ? 'UNKNOWN'
        : looksLikeProviderIssue ? 'BLOCKED'
        : 'FAILED';
      return {
        state,
        stdout: run.stdout,
        stderr: run.stderr,
        model: prospect.model,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        exitCode: run.code,
        signal: run.signal,
        readOnlyContractHeld: true,
        ...failure,
        failureBoundary: state === 'COMPLETE' ? undefined : (failure.providerError ?? `${routeLabel} did not complete successfully.`)
      };
    }
  };
}

// --- Combine run --------------------------------------------------------------

export interface CombineRequest {
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  /**
   * Explicit diagnostic/test override for where working state goes. Omit it in
   * every Sideline-owned execution: the default is `<Scout Intelligence>/Work`,
   * never a folder inside `gameRoot`. Durable scorecards and run evidence are
   * separate and stay under `Combine/` in the Scout Intelligence root.
   */
  readonly workspaceRoot?: string;
  /** Test seam: replaces the filesystem delete used for disposable scaffolding (see scout-work-hygiene.ts). */
  readonly removeWorkPath?: (target: string) => void | PromiseLike<void>;
  readonly budget?: CombineBudget;
  /** `refresh-due` excludes recently tried candidates instead of merely ranking them last. */
  readonly selectionPolicy?: CombineSelectionPolicy;
  readonly route?: TryoutRouteId;
  readonly now?: () => Date;
  /** Test/production seam: pre-computed discovery, bypassing live network/process calls. */
  readonly discovery?: CombineDiscoveryReport;
  readonly discoveryOptions?: CombineDiscoveryOptions;
  /** Test seam: a fixed executor per prospect, bypassing the real OpenCode CLI. */
  readonly executorFactory?: (prospect: CombineProspect, route: TryoutRoute) => ScoutPlayExecutor;
  readonly opencodeExecutable?: string;
  /** Test seam paired with opencodeExecutable (for a Node-based fake CLI). */
  readonly opencodePrefixArgs?: readonly string[];
  /** Trusted runtime resolver (VS Code SecretStorage in product); CLI omits it. */
  readonly resolveOpenRouterApiKey?: () => PromiseLike<string | undefined>;
  /** Test seam for deterministic CLI-environment credential fallback behavior. */
  readonly processEnvironment?: NodeJS.ProcessEnv;
  readonly secretValues?: readonly string[];
}

export interface CombineScorecardUpdate {
  readonly candidateId: string;
  readonly status: CombineStatus;
}

export interface CombineCompletion {
  readonly schemaVersion: 1;
  readonly combineId: string;
  readonly gameRoot: string;
  readonly workspacePath: string;
  readonly durablePath: string;
  readonly scorecardsPath: string;
  readonly route: TryoutRouteId;
  readonly selectionPolicy: CombineSelectionPolicy;
  readonly maxTryouts: number;
  readonly maxConcurrency: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly discovery: CombineDiscoveryReport;
  readonly prospectsDiscovered: number;
  readonly prospectsDue: number;
  readonly prospectsSelected: number;
  readonly candidatesConsidered: readonly CombineCandidateConsideration[];
  readonly tryoutsCompleted: number;
  readonly tryoutsFailed: number;
  readonly tryoutsBlocked: number;
  readonly tryoutsInterrupted: number;
  readonly tryoutsUnknown: number;
  readonly attempts: readonly ScoutAttemptTelemetry[];
  readonly scorecardUpdates: readonly CombineScorecardUpdate[];
  readonly readyDepthChartBefore: readonly string[];
  readonly readyDepthChartAfter: readonly string[];
  readonly readyDepthChartChanged: boolean;
  readonly resultPath: string;
  /**
   * Housekeeping outcome for this run's working folder. Reported separately from
   * every attempt and scorecard: a cleanup error is a filesystem fact, never
   * Player quality.
   */
  readonly workspaceHygiene: WorkHygieneSummary;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function timestampParts(date: Date): { stamp: string; zone: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const zone = value('timeZoneName').replace(/[^A-Za-z0-9+-]/g, '') || 'America-Edmonton';
  return { stamp: `${value('year')}-${value('month')}-${value('day')}_${value('hour')}${value('minute')}${value('second')}_${String(date.getMilliseconds()).padStart(3, '0')}`, zone };
}

export function freshCombineId(date = new Date()): string {
  const { stamp, zone } = timestampParts(date);
  return `Combine__${stamp}_${zone}`;
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}
function writeText(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
function redact(text: string, values: readonly string[]): string {
  let safe = text;
  for (const value of values) if (value && value.length >= 4) safe = safe.split(value).join('[REDACTED]');
  return safe;
}
function elapsed(startedAt: string | undefined, endedAt: string): number | undefined {
  if (!startedAt) return undefined;
  const value = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readyScorecardIds(dir: string): string[] {
  let entries: string[];
  try { entries = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')); }
  catch { return []; }
  const ready: string[] = [];
  for (const entry of entries) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as CombineScorecard;
      if (card.currentStatus === 'READY' && card.candidateId) ready.push(card.candidateId);
    } catch { /* One malformed scorecard cannot hide the rest of the depth chart. */ }
  }
  return ready.sort((a, b) => a.localeCompare(b));
}

/**
 * A successfully queried provider catalog is current provider truth. If it no
 * longer returns a previously scored prospect, Combine (the scorecard owner)
 * suspends that receiver from READY without inventing negative Player film.
 * A failed/unavailable catalog never changes scorecards, and rediscovery makes
 * the prospect immediately due for a fresh bounded tryout.
 */
function reconcileUnavailableScorecards(dir: string, discovery: CombineDiscoveryReport, observedAt: string): CombineScorecardUpdate[] {
  const availableSources = new Set(discovery.sources.filter((source) => source.available).map((source) => source.id));
  const discovered = new Set(discovery.prospects.map((prospect) => prospect.candidateId));
  let entries: string[];
  try { entries = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')); }
  catch { return []; }
  const updates: CombineScorecardUpdate[] = [];
  for (const entry of entries) {
    let card: CombineScorecard;
    try { card = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as CombineScorecard; }
    catch { continue; }
    if (!availableSources.has(card.provider) || discovered.has(card.candidateId) || card.currentStatus === 'UNAVAILABLE') continue;
    const source = discovery.sources.find((candidate) => candidate.id === card.provider);
    const note = `${observedAt}: ${card.provider} discovery succeeded (${source?.count ?? 0} prospects) but no longer returned this candidate. Field eligibility is suspended as UNAVAILABLE until rediscovery and a fresh Combine tryout; this is provider/catalog evidence, not negative Player-quality film.`;
    writeScorecard(dir, { ...card, currentStatus: 'UNAVAILABLE', availabilityEvidence: { state: 'CATALOG_ABSENT', observedAt }, notes: [note, ...card.notes].slice(0, 20) });
    updates.push({ candidateId: card.candidateId, status: 'UNAVAILABLE' });
  }
  return updates;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resultMarkdown(completion: Omit<CombineCompletion, 'resultPath' | 'workspaceHygiene'>, prospects: readonly CombineProspect[]): string {
  const lines: string[] = [];
  lines.push('SCOUT COMBINE RESULT', '', `Combine: ${completion.combineId}`, `Route: ${TRYOUT_ROUTES[completion.route].name} (${completion.route})`, '');
  lines.push(`Discovery sources: ${completion.discovery.sources.map((source) => `${source.id}=${source.available ? `${source.count} found` : `unavailable (${source.error ?? 'unknown reason'})`}`).join('; ')}`);
  lines.push(`Selection policy: ${completion.selectionPolicy}`, `Refresh needed: ${completion.prospectsDue > 0 ? 'yes' : 'no'}`, `Prospects discovered: ${completion.prospectsDiscovered}`, `Prospects due: ${completion.prospectsDue}`, `Selected for tryout: ${completion.prospectsSelected}`, `Budget: ${completion.maxTryouts} tryout limit / ${completion.maxConcurrency} concurrent`, `Completed: ${completion.tryoutsCompleted}`, `Failed: ${completion.tryoutsFailed}`, `Blocked: ${completion.tryoutsBlocked}`, `Interrupted: ${completion.tryoutsInterrupted}`, `Unknown: ${completion.tryoutsUnknown}`, '');
  lines.push('Candidates considered:');
  for (const candidate of completion.candidatesConsidered) lines.push(`- ${candidate.candidateId}: ${candidate.due ? 'DUE' : 'NOT DUE'}; prior=${candidate.priorStatus}; ${candidate.reason}`);
  lines.push('');
  for (const attempt of completion.attempts) {
    const prospect = prospects.find((candidate) => candidate.candidateId === attempt.executorId);
    lines.push(`${attempt.player} (${prospect?.model ?? attempt.executorId}):`, attempt.completionState, `report: ${attempt.durableReportPath ?? 'none'}`);
    if (attempt.failureBoundary) lines.push(`failure boundary: ${attempt.failureBoundary}`);
    lines.push('');
  }
  lines.push('Scorecard updates:');
  for (const update of completion.scorecardUpdates) lines.push(`- ${update.candidateId}: ${update.status}`);
  if (completion.scorecardUpdates.length === 0) lines.push('- none (clean no-op)');
  lines.push('', `READY depth chart before: ${completion.readyDepthChartBefore.join(', ') || 'none'}`, `READY depth chart after: ${completion.readyDepthChartAfter.join(', ') || 'none'}`, `READY depth chart changed: ${completion.readyDepthChartChanged ? 'yes' : 'no'}`, '', `Scorecards: ${completion.scorecardsPath}`, `Evidence: ${completion.durablePath}`, '');
  return `${lines.join('\n')}\n`;
}

function defaultScoutPlayInput(gameRoot: string, playId: string, route: TryoutRoute): unknown {
  return {
    playId,
    gameRoot,
    taskClass: 'scout-combine-tryout',
    objective: route.objective,
    scope: ['Investigate exactly the objective stated above within this Game root.', 'This is a bounded eligibility tryout, not open-ended reconnaissance.'],
    nonGoals: ['Do not modify, create, delete, or rename any Game file.', 'Do not execute shell commands or mutate git.', 'Do not implement a fix or redesign architecture.', 'Do not launch subagents or use network/browser/MCP tools beyond approved read-only reconnaissance.'],
    authority: {
      mode: 'read-only-reconnaissance',
      allowed: ['Read and search inside the supplied Game workspace.', 'Reason over current repository evidence.', 'Return the report to the trusted Combine runner.'],
      denied: ['Write, edit, create, delete, or rename Game files.', 'Execute commands or mutate git.', 'Broaden the bounded objective without new authorization.', 'Use network, MCP, browser, or subagent tools beyond the approved Scout tool set.']
    },
    evidenceContract: ['Cite exact Game-relative paths where applicable.', 'Distinguish FACT, INFERENCE, UNKNOWN, and CONTRADICTION.', 'Do not claim runtime behavior that static evidence cannot prove.'],
    reportContract: { requiredStatement: REQUIRED_SCOUT_STATEMENT, sections: RESULT_SECTIONS }
  };
}

/**
 * Discovers current Scout prospects, runs a small bounded read-only tryout
 * funnel prioritizing new/stale/callback candidates, preserves independent
 * game film per prospect, and updates durable machine-readable scorecards.
 * One prospect's failure is isolated and never corrupts another's evidence
 * or the scorecards of prospects not selected this run.
 */
export async function runScoutCombine(request: CombineRequest): Promise<CombineCompletion> {
  if (!path.isAbsolute(request.gameRoot)) throw new Error('gameRoot must be absolute.');
  if (!path.isAbsolute(request.durableReportRoot)) throw new Error('durableReportRoot must be absolute.');
  const now = request.now ?? (() => new Date());
  const isoNow = () => now().toISOString();
  const combineId = freshCombineId(now());
  if (!SAFE_ID.test(combineId)) throw new Error('Generated Combine id contains unsafe filename characters.');
  const routeId = request.route ?? 'C';
  const route = TRYOUT_ROUTES[routeId];
  const selectionPolicy = request.selectionPolicy ?? 'ranked';
  // A caller (e.g. a CLI that only sometimes receives --max-tryouts) may pass
  // { maxTryouts: undefined } explicitly. A plain object spread would let that
  // undefined silently overwrite the default and turn an unbounded budget into
  // an unbounded sweep of every discovered prospect — exactly the retry-storm
  // shape this module exists to prevent. Every field falls back individually.
  const budget: Required<CombineBudget> = {
    maxTryouts: request.budget?.maxTryouts ?? DEFAULT_BUDGET.maxTryouts,
    maxConcurrency: request.budget?.maxConcurrency ?? DEFAULT_BUDGET.maxConcurrency
  };
  if (!Number.isSafeInteger(budget.maxTryouts) || budget.maxTryouts < 1) throw new Error('maxTryouts must be a positive integer.');
  if (!Number.isSafeInteger(budget.maxConcurrency) || budget.maxConcurrency < 1) throw new Error('maxConcurrency must be a positive integer.');
  const gameRoot = path.resolve(request.gameRoot);

  const discovery = request.discovery ?? await discoverCombineProspects(request.discoveryOptions);

  // WAS/IS/WHY/WILL BE for this ownership boundary: see the breadcrumb in
  // scout-work-hygiene.ts and the matching one in scout-formation.ts. The default
  // derives from the Scout Intelligence root only, so it can never land in a Game.
  const workspacePath = path.join(path.resolve(request.workspaceRoot ?? resolveScoutWorkRoot(request.durableReportRoot)), combineId);
  const durableRunRoot = path.join(path.resolve(request.durableReportRoot), 'Combine', 'Runs');
  const durablePath = path.join(durableRunRoot, combineId);
  const scdDir = scorecardsDir(request.durableReportRoot);
  if (fs.existsSync(workspacePath)) throw new Error(`Combine workspace already exists: ${workspacePath}`);
  if (fs.existsSync(durablePath)) throw new Error(`Durable Combine evidence folder already exists: ${durablePath}`);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(durablePath, { recursive: true });
  fs.mkdirSync(scdDir, { recursive: true });
  const readyDepthChartBefore = readyScorecardIds(scdDir);

  const startedAt = isoNow();
  atomicJson(path.join(workspacePath, 'discovery.json'), discovery);
  atomicJson(path.join(durablePath, 'DISCOVERY.json'), discovery);

  const discoveryScorecardUpdates = reconcileUnavailableScorecards(scdDir, discovery, startedAt);

  const hasOpenRouterProspects = discovery.prospects.some((prospect) => prospect.provider === 'openrouter');
  const runtimeOpenRouterApiKey = hasOpenRouterProspects
    ? await request.resolveOpenRouterApiKey?.()
    : undefined;
  const execution = createScoutExecutionEnvironment(runtimeOpenRouterApiKey, request.processEnvironment ?? process.env);
  const activeOpenRouterQualification: ActiveQualification | undefined = execution.openRouterCredentialConfigured
    ? OPENROUTER_OPENCODE_QUALIFICATION
    : undefined;
  const { selected, scorecards, considerations } = selectForTryout(discovery.prospects, scdDir, budget, now().getTime(), selectionPolicy, activeOpenRouterQualification);

  const secretValues = [...(request.secretValues ?? []), ...execution.secretValues].filter(Boolean);
  const executorFactory = request.executorFactory ?? ((prospect: CombineProspect, r: TryoutRoute) => createCombineExecutor(prospect, `${r.name} tryout`, {
    opencodeExecutable: request.opencodeExecutable,
    prefixArgs: request.opencodePrefixArgs,
    env: execution.env
  }));
  const attempts: ScoutAttemptTelemetry[] = new Array(selected.length);
  const hygiene: (ReceiverWorkHygiene | undefined)[] = new Array(selected.length);
  const tryoutScorecardUpdates: CombineScorecardUpdate[] = new Array(selected.length);
  const queuedAt = selected.map(() => isoNow());

  const runOne = async (index: number): Promise<void> => {
    const prospect = selected[index];
    const executor = executorFactory(prospect, route);
    const playId = `${combineId}-${prospect.candidateId}`.slice(0, 120);
    const envelope = createScoutPlayEnvelope(defaultScoutPlayInput(gameRoot, playId, route));
    const playerPath = path.join(workspacePath, prospect.candidateId);
    fs.mkdirSync(playerPath, { recursive: true });
    let outcome: ScoutExecutionOutcome;
    try { outcome = await executor.execute(envelope, { gameRoot, playerPath }); }
    catch (error) { outcome = { state: 'FAILED', stdout: '', stderr: error instanceof Error ? error.stack ?? error.message : String(error), exitCode: null, signal: null, readOnlyContractHeld: 'UNKNOWN', failureBoundary: 'Executor threw before returning a normalized result.' }; }
    const endedAt = outcome.endedAt ?? isoNow();
    const safeStdout = redact(outcome.stdout, secretValues);
    const safeStderr = redact(outcome.stderr, secretValues);
    writeText(path.join(playerPath, 'stdout.log'), safeStdout);
    writeText(path.join(playerPath, 'stderr.log'), safeStderr);
    let reportPath: string | undefined;
    let durableReportPath: string | undefined;
    if (outcome.state === 'COMPLETE' && safeStdout.trim()) {
      reportPath = path.join(playerPath, 'SCOUT-REPORT.md');
      durableReportPath = path.join(durablePath, `${prospect.candidateId}-SCOUT-REPORT.md`);
      writeText(reportPath, safeStdout);
      writeText(durableReportPath, safeStdout);
    }
    const telemetry: ScoutAttemptTelemetry = {
      scoutPlayId: envelope.play.playId,
      canonicalPlayHash: envelope.playHash,
      semanticPromptHash: envelope.semanticPromptHash,
      player: prospect.displayName,
      executorId: prospect.candidateId,
      harness: executor.harness,
      provider: executor.provider,
      model: outcome.model,
      effort: outcome.effort,
      taskClass: envelope.play.taskClass,
      queuedAt: queuedAt[index],
      startedAt: outcome.startedAt,
      endedAt,
      durationMs: elapsed(outcome.startedAt, endedAt),
      completionState: outcome.state,
      processExitCode: outcome.exitCode,
      terminationSignal: outcome.signal,
      providerError: outcome.providerError ? redact(outcome.providerError, secretValues) : undefined,
      rateLimitOrQuotaEvent: outcome.quotaEvent ? redact(outcome.quotaEvent, secretValues) : undefined,
      reportCreated: Boolean(reportPath),
      readOnlyContractHeld: outcome.readOnlyContractHeld,
      failureBoundary: outcome.failureBoundary ? redact(outcome.failureBoundary, secretValues) : undefined,
      stdoutPath: path.join(playerPath, 'stdout.log'),
      stderrPath: path.join(playerPath, 'stderr.log'),
      reportPath,
      durableReportPath,
      evaluation: evaluateScoutReport(safeStdout, gameRoot)
    };
    attempts[index] = telemetry;
    atomicJson(path.join(playerPath, 'telemetry.json'), telemetry);

    const status = deriveCombineStatus(telemetry);
    const qualification = prospect.provider === 'openrouter' ? activeOpenRouterQualification : undefined;
    const merged = mergeScorecard(scorecards.get(prospect.candidateId), prospect, telemetry, routeId, status, endedAt, qualification);
    writeScorecard(scdDir, merged);
    tryoutScorecardUpdates[index] = { candidateId: prospect.candidateId, status };
    // Last, and only now: the outcome, telemetry, durable report and scorecard are
    // final, so removing regenerable scaffolding cannot change any of them.
    hygiene[index] = await releaseReceiverScaffolding(playerPath, {
      complete: telemetry.completionState === 'COMPLETE' && Boolean(durableReportPath),
      remove: request.removeWorkPath
    });
  };

  const maxConcurrency = Math.max(1, Math.min(selected.length, budget.maxConcurrency));
  let cursor = 0;
  const worker = async () => { while (cursor < selected.length) { const index = cursor++; await runOne(index); } };
  await Promise.all(Array.from({ length: maxConcurrency || 1 }, worker));

  const endedAt = isoNow();
  const readyDepthChartAfter = readyScorecardIds(scdDir);
  const scorecardUpdates = [...discoveryScorecardUpdates, ...tryoutScorecardUpdates];
  const completionWithoutResultPath: Omit<CombineCompletion, 'resultPath' | 'workspaceHygiene'> = {
    schemaVersion: 1,
    combineId,
    gameRoot,
    workspacePath,
    durablePath,
    scorecardsPath: scdDir,
    route: routeId,
    selectionPolicy,
    maxTryouts: budget.maxTryouts,
    maxConcurrency,
    startedAt,
    endedAt,
    discovery,
    prospectsDiscovered: discovery.prospects.length,
    prospectsDue: considerations.filter((candidate) => candidate.due).length,
    prospectsSelected: selected.length,
    candidatesConsidered: considerations,
    tryoutsCompleted: attempts.filter((attempt) => attempt.completionState === 'COMPLETE').length,
    tryoutsFailed: attempts.filter((attempt) => attempt.completionState === 'FAILED').length,
    tryoutsBlocked: attempts.filter((attempt) => attempt.completionState === 'BLOCKED').length,
    tryoutsInterrupted: attempts.filter((attempt) => attempt.completionState === 'INTERRUPTED').length,
    tryoutsUnknown: attempts.filter((attempt) => attempt.completionState === 'UNKNOWN').length,
    attempts,
    scorecardUpdates,
    readyDepthChartBefore,
    readyDepthChartAfter,
    readyDepthChartChanged: !sameStrings(readyDepthChartBefore, readyDepthChartAfter)
  };
  const resultPath = path.join(durablePath, 'COMBINE-RESULT.md');
  const markdown = resultMarkdown(completionWithoutResultPath, selected);
  writeText(path.join(workspacePath, 'COMBINE-RESULT.md'), markdown);
  writeText(resultPath, markdown);
  const workspaceHygiene = summarizeWorkHygiene(selected.map((prospect, index) => ({ receiver: prospect.candidateId, result: hygiene[index] })));
  const completion: CombineCompletion = { ...completionWithoutResultPath, resultPath, workspaceHygiene };
  atomicJson(path.join(workspacePath, 'COMBINE-COMPLETE.json'), completion);
  atomicJson(path.join(durablePath, 'COMBINE-COMPLETE.json'), completion);
  return completion;
}
