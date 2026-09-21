/**
 * Scout Formation Dispatcher (V0.2).
 *
 * WAS: Scout infrastructure could execute individual/concurrent Scout jobs, but
 * the human still had to orchestrate Play IDs, Players, launches, and evidence.
 * IS: Sideline can form and execute a small bounded Scout Formation from one
 * human reconnaissance objective, gather independent evidence, isolate
 * failures, and return one Formation result.
 * WHY: Scouting should reduce human work and premium-token archaeology. The
 * machine should orchestrate receivers; the human should ask the
 * reconnaissance question.
 *
 * Future: depth-chart, CONSERVE, health-aware, quota-aware, and
 * performance-aware routing remain intentionally outside V0.2. The
 * FormationCandidate registry below is the seam a future selection policy
 * plugs into; it is not built here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createScoutPlayEnvelope, type ScoutPlayEnvelope } from './scout-play';
import { combineDerivedFormationCandidates } from './scout-combine-formation-bridge';
import { recordFormationInfrastructureBlock } from './scout-combine';
import { createScoutExecutionEnvironment } from './scout-openrouter-credential';
import { formatReportProvenance } from './report-provenance';
import { resolveScoutWorkRoot } from './scout-intelligence-root';
import { releaseReceiverScaffolding, summarizeWorkHygiene, type ReceiverWorkHygiene, type WorkHygieneSummary } from './scout-work-hygiene';
import { SCOUT_PLAYER_INSTANCE_ID, SCOUT_PLAYER_TYPE } from './scout-player-contract';
import { classifyReceiverFailure, selectSubstitute, type SubstitutionRecord } from './scout-substitution';
import {
  createAntiGravityExecutor,
  createDirectGeminiExecutor,
  evaluateScoutReport,
  REQUIRED_SCOUT_STATEMENT,
  RESULT_SECTIONS,
  validateDirectGeminiAgent,
  type ScoutAttemptTelemetry,
  type ScoutExecutionOutcome,
  type ScoutPlayExecutor
} from './scout-interchangeability-runner';

export interface FormationContext {
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface FormationEligibility {
  readonly eligible: boolean;
  readonly reason: string;
}

export interface FormationCandidate {
  readonly id: string;
  readonly player: string;
  readonly provider: string;
  eligible(context: FormationContext): FormationEligibility;
  createExecutor(context: FormationContext): ScoutPlayExecutor;
}

/** Last known persisted field truth from npm run scout:verify. Not a live health probe. */
function lastKnownVerification(context: FormationContext, playerId: string): { state?: string } {
  const file = path.join(path.resolve(context.durableReportRoot), 'Player Verification', `${playerId}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

/**
 * Field-proven at REPORTS/Scout Only/Player Verification: AntiGravity's default
 * headless agent reaches for a "read_file" tool that headless mode auto-denies
 * (no prompt surface), producing a COMPLETE lifecycle with an empty report. The
 * fix, proven by scout-player-verification.ts, is a custom minimal-tool agent
 * plus a scoped execution root instead of the bare gameRoot.
 */
const FORMATION_ANTIGRAVITY_AGENT = 'sideline-formation-scout';

function formationAntigravityAgentDefinition(): string {
  return `---\nname: ${FORMATION_ANTIGRAVITY_AGENT}\ndescription: Sideline Scout Formation read-only reconnaissance\nmainAgent: true\nsubagent: false\ntools:\n  - view_file\n  - grep_search\n  - code_search\n---\n\nYou are a temporary Sideline Coach read-only reconnaissance Scout.\nUse only the tools declared above. Never write files, execute commands, browse the web, invoke MCP, launch subagents, or broaden the supplied ScoutPlay. Return the exact report contract requested by the semantic Play and stop.\n`;
}

const ANTIGRAVITY_CANDIDATE: FormationCandidate = {
  id: 'antigravity',
  player: 'AntiGravity',
  provider: 'AntiGravity',
  eligible(context) {
    const verification = lastKnownVerification(context, 'antigravity');
    if (verification.state === 'READY') return { eligible: true, reason: 'Last known Player Verification state is READY.' };
    if (verification.state) return { eligible: false, reason: `Last known Player Verification state is ${verification.state}, not READY.` };
    return { eligible: false, reason: 'No Player Verification evidence found. Run npm run scout:verify -- --player antigravity first.' };
  },
  createExecutor() {
    const base = createAntiGravityExecutor({
      model: 'gemini-3.8-flash',
      effort: 'medium',
      agent: FORMATION_ANTIGRAVITY_AGENT,
      executionRoot: (executorContext) => executorContext.playerPath,
      additionalDirectories: (executorContext) => [executorContext.gameRoot]
    });
    return {
      ...base,
      async execute(envelope, executorContext) {
        const agentDir = path.join(executorContext.playerPath, '.agents', 'agents', FORMATION_ANTIGRAVITY_AGENT);
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(path.join(agentDir, 'agent.md'), formationAntigravityAgentDefinition(), 'utf8');
        return base.execute(envelope, executorContext);
      }
    };
  }
};

const GEMFLASH_DIRECT_CONFIG_DIR = path.resolve(__dirname, '..', 'tools', 'scouts', 'opencode-interchangeability');
const GEMFLASH_DIRECT_AGENT = 'sideline-gemini-direct-scout';

const GEMINI_FLASH_DIRECT_CANDIDATE: FormationCandidate = {
  id: 'gemini-flash-direct',
  player: 'Gemini Flash Direct',
  provider: 'Google Gemini API',
  eligible(context) {
    try { validateDirectGeminiAgent(GEMFLASH_DIRECT_CONFIG_DIR, GEMFLASH_DIRECT_AGENT); }
    catch (error) { return { eligible: false, reason: error instanceof Error ? error.message : String(error) }; }
    const key = context.env.GOOGLE_GENERATIVE_AI_API_KEY || context.env.GEMINI_API_KEY;
    if (!key) return { eligible: false, reason: 'No Google Gemini credential is present in this process environment.' };
    return { eligible: true, reason: 'Direct Gemini agent contract is read-only and a credential is present.' };
  },
  createExecutor() {
    return createDirectGeminiExecutor({ configDir: GEMFLASH_DIRECT_CONFIG_DIR, agent: GEMFLASH_DIRECT_AGENT });
  }
};

/** V0.2 roster. OpenCode/OpenRouter free-model Scouts remain reachable via npm run scout:play for Games that expose .opencode/agents; adding them here is a future seam, not built now. */
export const DEFAULT_FORMATION_CANDIDATES: readonly FormationCandidate[] = Object.freeze([ANTIGRAVITY_CANDIDATE, GEMINI_FLASH_DIRECT_CANDIDATE]);

export interface FormationCandidateEvaluation {
  readonly id: string;
  readonly player: string;
  readonly provider: string;
  readonly eligible: boolean;
  readonly reason: string;
}

export interface FormationRequest {
  readonly objective: string;
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  /**
   * Explicit diagnostic/test override for where working state goes. Omit it in
   * every Sideline-owned execution: the default is `<Scout Intelligence>/Work`,
   * never a folder inside `gameRoot`.
   */
  readonly workspaceRoot?: string;
  /** Test seam: replaces the filesystem delete used for disposable scaffolding (see scout-work-hygiene.ts). */
  readonly removeWorkPath?: (target: string) => void | PromiseLike<void>;
  readonly taskClass?: string;
  readonly scope?: readonly string[];
  readonly nonGoals?: readonly string[];
  /** Explicit human Player selection. Outranks automatic eligibility, never outranks input safety. */
  readonly players?: readonly string[];
  /** 1-3. Defaults to min(2, eligible candidates). */
  readonly formationSize?: number;
  readonly candidates?: readonly FormationCandidate[];
  readonly now?: () => Date;
  /**
   * The Game and Play this Formation answers. Supplied only by a caller that
   * genuinely knows them (the Stadium's Scout dispatch); it is what lets the
   * parent report describe itself. A standalone/CLI Formation has no Game or
   * Play to claim, so it omits this and its parent carries no provenance —
   * Sideline never invents attribution.
   */
  readonly reportAttribution?: { readonly gameId: string; readonly clientRef: string };
  /** Trusted runtime resolver (VS Code SecretStorage in product); CLI omits it. */
  readonly resolveOpenRouterApiKey?: () => PromiseLike<string | undefined>;
  readonly secretValues?: readonly string[];
  /**
   * Fires once, synchronously after selection and before any receiver actually
   * runs — the same real count the Formation is about to dispatch, never a
   * guess. Lets a caller (the Scout Player adapter) surface a truthful "N
   * Scouts running" without a second orchestration path or polling.
   */
  readonly onSelected?: (info: { readonly count: number; readonly candidateIds: readonly string[] }) => void;
  /**
   * `auto` (default): a lane whose receiver hits an infrastructure/availability failure (state BLOCKED)
   * may be taken over by the next CURRENT eligible receiver; see scout-substitution.ts. `off` never
   * substitutes. A receiver that answered, or failed for an unidentified reason, is never replaced.
   */
  readonly substitution?: 'auto' | 'off';
}

export interface FormationSynthesis {
  readonly consensus: string;
  readonly uniqueFindings: readonly { readonly executorId: string; readonly player: string; readonly excerpt: string }[];
  readonly contradictions: readonly { readonly executorId: string; readonly player: string; readonly excerpt: string }[];
  readonly missingEvidence: readonly { readonly executorId: string; readonly player: string; readonly note: string }[];
  readonly failedScouts: readonly { readonly executorId: string; readonly player: string; readonly reason: string }[];
  readonly recommendedNextStep: string;
}

export type FormationOutcome = 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'UNKNOWN';

/**
 * BREADCRUMB — Scout as a first-class Player.
 *
 * WAS: Scout Formation activity was envisioned as a persistent bottom-level
 * Sideline status/timer. Its lifecycle model was right—one aggregate timer,
 * subordinate attempts hidden beneath it, and Scouting -> report synthesis ->
 * report ready—but that UI location is explicitly superseded.
 *
 * IS: Scout is one logical first-class routing target on the Sideline Team.
 * MANUAL selection and conservative AUTO reconnaissance-first selection enter
 * the same Scout Player adapter, which expands one routed Play into this
 * Formation engine. A future
 * persistent Scout Player card will represent the whole capability, even when
 * one Scout Play internally fields a Formation of 1-3 receivers. Idle means
 * ready/available without timer noise. During a Play, the same card becomes the
 * truthful aggregate lifecycle surface: "Scout · Scouting · 3 Scouts running
 * · 02:41", then "Scout · Drafting report…", then "Scout · Report ready ✓".
 * Formation attempts remain internal machinery and game film. Exact UX remains
 * future work.
 *
 * WHY: Scouting is a Team capability and routing destination, not background
 * telemetry. The familiar Player abstraction keeps the human model small:
 * one Scout Player can hide an entire receiving corps underneath.
 *
 * WILL BE / FUTURE: AUTO detection may use richer evidence, but must keep this
 * same canonical target and dispatch path. A working Player may eventually
 * request bounded Scout assistance and then continue with returned evidence.
 * Scout capability must remain cleanly enableable/disableable; whether
 * unavailable editions hide or lock the card is unresolved. Licensing,
 * packaging, the Player card, automatic continuation, and Player-requested
 * assistance are not implemented here.
 */
export interface FormationCompletion {
  readonly schemaVersion: 1;
  readonly formationId: string;
  readonly objective: string;
  readonly canonicalPlayHash: string;
  readonly semanticPromptHash: string;
  readonly gameRoot: string;
  readonly workspacePath: string;
  readonly durablePath: string;
  readonly maxConcurrency: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly candidatesConsidered: readonly FormationCandidateEvaluation[];
  readonly scoutsRequested: number;
  readonly scoutsCompleted: number;
  readonly scoutsFailed: number;
  readonly scoutsBlocked: number;
  readonly scoutsInterrupted: number;
  readonly scoutsUnknown: number;
  readonly outcome: FormationOutcome;
  readonly attempts: readonly ScoutAttemptTelemetry[];
  readonly synthesis: FormationSynthesis;
  readonly resultPath: string;
  /**
   * Subordinate receiver reports, as paths RELATIVE to this Formation's own
   * folder (forward slashes). The folder is the evidence container: there is no
   * global child registry and children are never published to Incoming. Older
   * Formations predate this field, so readers must tolerate its absence.
   */
  readonly children: readonly string[];
  /**
   * Housekeeping outcome for this run's working folder. Reported separately from
   * every attempt: a cleanup error is a filesystem fact, never Player quality.
   */
  readonly workspaceHygiene: WorkHygieneSummary;
  /**
   * Every substitution decision, including lanes that needed a replacement and found none. `attempts`
   * stays ONE FINAL attempt per lane; the receivers that were replaced are preserved as game film in
   * `preservedAttempts`. Older Formations predate both fields, so readers must tolerate their absence.
   */
  readonly substitutions?: readonly SubstitutionRecord[];
  readonly preservedAttempts?: readonly ScoutAttemptTelemetry[];
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

export function freshFormationId(date = new Date()): string {
  const { stamp, zone } = timestampParts(date);
  return `Scout-Formation__${stamp}_${zone}`;
}

function defaultScoutPlayInput(request: FormationRequest, playId: string): unknown {
  return {
    playId,
    gameRoot: request.gameRoot,
    taskClass: request.taskClass ?? 'formation-reconnaissance',
    objective: request.objective,
    scope: request.scope ?? [
      'Investigate exactly the objective stated above within this Game root.',
      'Do not expand beyond the objective without new human authorization.'
    ],
    nonGoals: request.nonGoals ?? [
      'Do not modify, create, delete, or rename any Game file.',
      'Do not execute shell commands or mutate git.',
      'Do not implement a fix or redesign architecture during this reconnaissance.',
      'Do not launch subagents or use network/browser/MCP tools beyond approved read-only reconnaissance.'
    ],
    authority: {
      mode: 'read-only-reconnaissance',
      allowed: ['Read and search inside the supplied Game workspace.', 'Reason over current repository evidence.', 'Return the report to the trusted Formation Dispatcher.'],
      denied: ['Write, edit, create, delete, or rename Game files.', 'Execute commands or mutate git.', 'Broaden the bounded objective without new authorization.', 'Use network, MCP, browser, or subagent tools beyond the approved Scout tool set.']
    },
    evidenceContract: ['Cite exact Game-relative paths and exact function/symbol names where applicable.', 'Distinguish FACT, INFERENCE, UNKNOWN, and CONTRADICTION.', 'Do not claim runtime behavior that static evidence cannot prove.'],
    reportContract: { requiredStatement: REQUIRED_SCOUT_STATEMENT, sections: RESULT_SECTIONS }
  };
}

interface Selection {
  readonly considered: readonly FormationCandidateEvaluation[];
  readonly selected: readonly FormationCandidate[];
}

/**
 * WAS: only a small number of Scout receivers have meaningful real-game
 * proof so far — most of `candidates` here is discovered, not proven.
 * IS: Combine (scorecards + tryouts), Coach Refresh, and this very
 * selection step already give Sideline the machinery to discover and
 * evaluate more receivers; a large discovered roster is not the same thing
 * as a proven depth chart, and `eligible()` below is deliberately a bare
 * READY/not-READY gate, not a ranking.
 * WHY: recruiting quantity over proof would let an untested receiver sit
 * next to a field-proven one with no way to tell them apart at selection
 * time.
 * WILL BE: Sideline should gradually grow its Scout receiving corps through
 * truthful tryouts and, especially, real-game film — receivers moving up
 * or down this selection by task-specific evidence, reliability, observable
 * cost/capacity, and sample size, with real work outranking benchmark
 * theater. No ranking/scoring, adaptive routing, or mass tryout campaign is
 * built here; this comment preserves the seam only.
 */
function selectFormation(candidates: readonly FormationCandidate[], context: FormationContext, request: FormationRequest): Selection {
  const considered: FormationCandidateEvaluation[] = candidates.map((candidate) => {
    const evaluation = candidate.eligible(context);
    return { id: candidate.id, player: candidate.player, provider: candidate.provider, eligible: evaluation.eligible, reason: evaluation.reason };
  });

  if (request.players?.length) {
    if (request.players.length > 3) throw new Error('Explicit Scout selection exceeds the V0.2 bound of 3.');
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selected = request.players.map((id) => {
      const candidate = byId.get(id);
      if (!candidate) throw new Error(`Unknown Scout candidate id: ${id}`);
      return candidate;
    });
    return { considered, selected };
  }

  const eligible = candidates.filter((candidate) => considered.find((entry) => entry.id === candidate.id)?.eligible);
  if (eligible.length === 0) throw new Error('No eligible Scout candidates were discovered for this Game root. Run npm run scout:verify to establish Player readiness, or pass explicit players.');
  const requestedSize = request.formationSize;
  if (requestedSize !== undefined && (!Number.isSafeInteger(requestedSize) || requestedSize < 1 || requestedSize > 3)) {
    throw new Error('formationSize must be an integer from 1 through 3.');
  }
  const size = Math.min(requestedSize ?? Math.min(2, eligible.length), eligible.length);
  return { considered, selected: eligible.slice(0, size) };
}

export interface FormationAvailability {
  readonly considered: readonly FormationCandidateEvaluation[];
  readonly eligibleIds: readonly string[];
}

/**
 * The Scout Player's availability seam. It deliberately uses the very same
 * candidate universe and eligibility predicates as a real Formation; it does
 * not create a second Scout-health view or cache Combine truth.
 */
export function inspectScoutFormationAvailability(input: {
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  readonly candidates?: readonly FormationCandidate[];
  readonly env?: NodeJS.ProcessEnv;
}): FormationAvailability {
  const context: FormationContext = {
    gameRoot: path.resolve(input.gameRoot),
    durableReportRoot: path.resolve(input.durableReportRoot),
    env: input.env ?? process.env
  };
  const candidates = input.candidates ?? [
    ...DEFAULT_FORMATION_CANDIDATES,
    ...combineDerivedFormationCandidates(context.durableReportRoot)
  ];
  const considered = candidates.map((candidate) => {
    const evaluation = candidate.eligible(context);
    return {
      id: candidate.id,
      player: candidate.player,
      provider: candidate.provider,
      eligible: evaluation.eligible,
      reason: evaluation.reason
    };
  });
  return {
    considered,
    eligibleIds: considered.filter((candidate) => candidate.eligible).map((candidate) => candidate.id)
  };
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

function extractSection(report: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = report.match(new RegExp(`(?:^|\\n)#{1,3}\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n#{1,3}\\s+\\S|$)`, 'i'));
  return match ? match[1].trim().slice(0, 800) : '';
}
function isEmptyContradiction(text: string): boolean {
  return !text || /^(none|n\/a|no contradictions?)\.?$/i.test(text.trim());
}

function formationOutcome(attempts: readonly ScoutAttemptTelemetry[]): FormationOutcome {
  const complete = attempts.filter((attempt) => attempt.completionState === 'COMPLETE').length;
  if (complete === attempts.length) return 'COMPLETE';
  if (complete > 0) return 'PARTIAL';
  if (attempts.some((attempt) => attempt.completionState === 'BLOCKED')) return 'BLOCKED';
  if (attempts.some((attempt) => attempt.completionState === 'FAILED')) return 'FAILED';
  return 'UNKNOWN';
}

function buildSynthesis(attempts: readonly ScoutAttemptTelemetry[], reports: ReadonlyMap<string, string>): FormationSynthesis {
  const complete = attempts.filter((attempt) => attempt.completionState === 'COMPLETE');
  const uniqueFindings = complete
    .map((attempt) => ({ executorId: attempt.executorId, player: attempt.player, excerpt: extractSection(reports.get(attempt.executorId) ?? '', 'Executive answer') }))
    .filter((entry) => entry.excerpt);
  const contradictions = complete
    .map((attempt) => ({ executorId: attempt.executorId, player: attempt.player, excerpt: extractSection(reports.get(attempt.executorId) ?? '', 'CONTRADICTIONS') }))
    .filter((entry) => !isEmptyContradiction(entry.excerpt));
  const missingEvidence = attempts
    .filter((attempt) => attempt.evaluation.significantEvidenceMissing)
    .map((attempt) => ({ executorId: attempt.executorId, player: attempt.player, note: attempt.evaluation.significantEvidenceMissing as string }));
  const failedScouts = attempts
    .filter((attempt) => attempt.completionState !== 'COMPLETE')
    .map((attempt) => ({ executorId: attempt.executorId, player: attempt.player, reason: attempt.failureBoundary ?? attempt.providerError ?? `Player ended ${attempt.completionState}.` }));
  const consensus = attempts.length === 0
    ? 'No Scout attempted this Formation.'
    : `${complete.length} of ${attempts.length} Scouts completed with a structurally usable report. Independent findings and any self-reported contradictions are preserved below; cross-Scout synthesis beyond this mechanical index requires human or Architect review.`;
  const recommendedNextStep = complete.length > 0
    ? 'Review the preserved independent Formation reports; forward to an Architect if a repair decision is warranted.'
    : attempts.every((attempt) => attempt.completionState === 'BLOCKED')
      ? 'Repair the blocked Player/provider boundary reported above, then retry the Formation.'
      : 'Investigate the failure boundaries reported above before retrying the Formation.';
  return { consensus, uniqueFindings, contradictions, missingEvidence, failedScouts, recommendedNextStep };
}

/**
 * FORMATION PARENT SELF-DESCRIPTION
 *
 * WAS: which Game, Play and Player a Scout parent report belonged to lived only
 * in transient runtime registration inside the Stadium.
 *
 * IS: a Formation started with a known Game and Play writes the existing
 * `sideline-provenance` marker as the first line of its Dad-facing parent
 * (FORMATION-RESULT.md). Only facts that are actually true of a logical Scout
 * parent are stamped: no model and no effort, because one parent spans N
 * receivers.
 *
 * WHY: the parent lives outside every Game's report root, so nothing can
 * re-derive its owner from its location. The artifact must explain itself after
 * every runtime object is gone.
 *
 * WILL BE: any future Sideline-owned report producer can follow the same rule —
 * write the marker at the point of writing, from facts already in hand.
 */
function formationParentProvenance(request: FormationRequest, at: string): string | undefined {
  const attribution = request.reportAttribution;
  if (!attribution?.gameId || !attribution.clientRef) return undefined;
  return formatReportProvenance({
    gameId: attribution.gameId,
    clientRef: attribution.clientRef,
    playerInstanceId: SCOUT_PLAYER_INSTANCE_ID,
    playerType: SCOUT_PLAYER_TYPE,
    provider: 'scout-formation',
    at
  });
}

function resultMarkdown(completion: Omit<FormationCompletion, 'resultPath' | 'children' | 'workspaceHygiene'>): string {
  const lines: string[] = [];
  lines.push('SCOUT FORMATION RESULT', '', `Play: ${completion.formationId}`, '', `Objective:\n${completion.objective}`, '');
  lines.push(`Scouts requested: ${completion.scoutsRequested}`, `Completed: ${completion.scoutsCompleted}`, `Failed: ${completion.scoutsFailed}`, `Blocked: ${completion.scoutsBlocked}`, `Interrupted: ${completion.scoutsInterrupted}`, `Unknown: ${completion.scoutsUnknown}`, `Outcome: ${completion.outcome}`, '');
  for (const attempt of completion.attempts) {
    lines.push(`${attempt.player}:`, attempt.completionState, `model: ${attempt.model ?? 'UNKNOWN'}`, `report: ${attempt.durableReportPath ?? 'none'}`);
    if (attempt.failureBoundary) lines.push(`failure boundary: ${attempt.failureBoundary}`);
    lines.push('');
  }
  if (completion.substitutions?.length) {
    lines.push('Substitutions (injured list):');
    for (const item of completion.substitutions) {
      lines.push(item.replacement
        ? `- Lane ${item.lane}: ${item.failedReceiver} → ${item.replacement} — ${item.failureReason} (${item.failureClass})`
        : `- Lane ${item.lane}: ${item.failedReceiver} could not field and NO eligible substitute remained — ${item.failureReason} (${item.failureClass})`);
    }
    lines.push('');
  }
  lines.push('Combined findings:', completion.synthesis.consensus, '');
  if (completion.synthesis.uniqueFindings.length) {
    lines.push('Unique findings:');
    for (const finding of completion.synthesis.uniqueFindings) lines.push(`- ${finding.player}: ${finding.excerpt}`);
    lines.push('');
  }
  if (completion.synthesis.contradictions.length) {
    lines.push('Contradictions (self-reported, not averaged into consensus):');
    for (const item of completion.synthesis.contradictions) lines.push(`- ${item.player}: ${item.excerpt}`);
    lines.push('');
  }
  if (completion.synthesis.failedScouts.length) {
    lines.push('Failed / blocked Scouts:');
    for (const item of completion.synthesis.failedScouts) lines.push(`- ${item.player}: ${item.reason}`);
    lines.push('');
  }
  lines.push(`Recommended next step: ${completion.synthesis.recommendedNextStep}`, '', `Evidence: ${completion.durablePath}`, '');
  return `${lines.join('\n')}\n`;
}

/**
 * Forms and runs a small bounded Scout Formation from one human reconnaissance
 * objective. Each selected Scout receives the identical canonical ScoutPlay
 * (same envelope, same hash) and runs concurrently, bounded to the selected
 * Formation size. One Scout's failure is isolated and never corrupts another
 * Scout's evidence or collapses the Formation result.
 */
export async function runScoutFormation(request: FormationRequest): Promise<FormationCompletion> {
  if (!request.objective || !request.objective.trim()) throw new Error('A Scout Formation objective is required.');
  if (!path.isAbsolute(request.gameRoot)) throw new Error('gameRoot must be absolute.');
  if (!path.isAbsolute(request.durableReportRoot)) throw new Error('durableReportRoot must be absolute.');
  const now = request.now ?? (() => new Date());
  const isoNow = () => now().toISOString();
  const formationId = freshFormationId(now());
  if (!SAFE_ID.test(formationId)) throw new Error('Generated Formation id contains unsafe filename characters.');

  const envelope: ScoutPlayEnvelope = createScoutPlayEnvelope(defaultScoutPlayInput(request, formationId));
  // Combine-derived candidates are read fresh from durable scorecards on every
  // call — never cached at module load — so a Combine run's newly-earned
  // READY status reaches the very next Formation with no restart and no
  // hardcoded candidate list. See scout-combine-formation-bridge.ts.
  const candidates = request.candidates ?? [...DEFAULT_FORMATION_CANDIDATES, ...combineDerivedFormationCandidates(request.durableReportRoot)];
  const runtimeOpenRouterApiKey = candidates.some((candidate) => candidate.provider === 'OpenRouter')
    ? await request.resolveOpenRouterApiKey?.()
    : undefined;
  const execution = createScoutExecutionEnvironment(runtimeOpenRouterApiKey);
  const context: FormationContext = { gameRoot: envelope.play.gameRoot, durableReportRoot: request.durableReportRoot, env: execution.env };
  const { considered, selected } = selectFormation(candidates, context, request);
  request.onSelected?.({ count: selected.length, candidateIds: selected.map((candidate) => candidate.id) });

  /**
   * SCOUT WORKING ROOT OWNERSHIP
   *
   * WAS: Formation working state defaulted into `<Game>/Scouts/<formationId>`,
   * so a read-only reconnaissance Play still mutated the repository it was
   * inspecting (prompts, logs, telemetry, isolated OpenCode config/data).
   *
   * IS: working state lives under the canonical Sideline-owned
   * `Scout Intelligence/Work/<formationId>`, derived from `durableReportRoot`
   * (which is that Scout Intelligence root). The Game is only the
   * reconnaissance target — `gameRoot` is still each receiver's scope and
   * cwd, and nothing Sideline generates is written into it. Durable Dad-facing
   * evidence stays separate under `Formations/<formationId>`.
   *
   * WHY: read-only Scout authority must mean no Sideline-generated prompts,
   * logs, configs, telemetry or temporary provider state are written into the
   * Game. Deriving the default from the Scout root (not the Game) also means an
   * omitted `workspaceRoot` can never silently fall back into a repository.
   *
   * WILL BE: future Scout bootstrap and Virtual Player lifecycle reuse this
   * ownership boundary without Dad ever knowing or configuring internal Scout
   * paths.
   */
  const workspacePath = path.join(path.resolve(request.workspaceRoot ?? resolveScoutWorkRoot(request.durableReportRoot)), formationId);
  // durableReportRoot is the canonical Scout Only root — the SAME root
  // ANTIGRAVITY_CANDIDATE and combineDerivedFormationCandidates read sibling
  // evidence from (Player Verification/, Combine/Scorecards/). Formation's
  // own run evidence gets its bounded namespace here, internally, the same
  // way Combine computes Combine/Runs/<id> internally — never by requiring
  // the caller to pre-modify durableReportRoot (that silently broke both
  // eligibility lookups above until this fix; see the V0.4 report).
  const durablePath = path.join(path.resolve(request.durableReportRoot), 'Formations', formationId);
  if (fs.existsSync(workspacePath)) throw new Error(`Formation workspace already exists: ${workspacePath}`);
  if (fs.existsSync(durablePath)) throw new Error(`Durable Formation evidence folder already exists: ${durablePath}`);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(durablePath, { recursive: true });

  const startedAt = isoNow();
  atomicJson(path.join(workspacePath, 'canonical-play.json'), envelope.play);
  writeText(path.join(workspacePath, 'semantic-prompt.txt'), `${envelope.semanticPrompt}\n`);
  atomicJson(path.join(workspacePath, 'candidates-considered.json'), considered);

  const secretValues = [...(request.secretValues ?? []), ...execution.secretValues, execution.env.GEMINI_API_KEY ?? '', execution.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ''].filter(Boolean);
  const executors = selected.map((candidate) => ({ candidate, executor: candidate.createExecutor(context) }));
  const attempts: ScoutAttemptTelemetry[] = new Array(executors.length);
  const hygieneEntries: { receiver: string; result: ReceiverWorkHygiene | undefined }[] = [];
  const substitutions: SubstitutionRecord[] = [];
  const preservedAttempts: ScoutAttemptTelemetry[] = [];
  /** Receivers fielded on any lane, plus any injured in this Formation: never doubled up, never re-selected. */
  const claimed = new Set<string>(selected.map((candidate) => candidate.id));
  const reports = new Map<string, string>();
  const queuedAt = executors.map(() => isoNow());

  const runAttempt = async (candidate: FormationCandidate, executor: ScoutPlayExecutor, index: number): Promise<ScoutAttemptTelemetry> => {
    const playerPath = path.join(workspacePath, executor.id);
    fs.mkdirSync(playerPath, { recursive: true });
    let outcome: ScoutExecutionOutcome;
    try {
      outcome = await executor.execute(envelope, { gameRoot: envelope.play.gameRoot, playerPath });
    } catch (error) {
      outcome = { state: 'FAILED', stdout: '', stderr: error instanceof Error ? error.stack ?? error.message : String(error), exitCode: null, signal: null, readOnlyContractHeld: 'UNKNOWN', failureBoundary: 'Executor threw before returning a normalized result.' };
    }
    const endedAt = outcome.endedAt ?? isoNow();
    const safeStdout = redact(outcome.stdout, secretValues);
    const safeStderr = redact(outcome.stderr, secretValues);
    const stdoutPath = path.join(playerPath, 'stdout.log');
    const stderrPath = path.join(playerPath, 'stderr.log');
    writeText(stdoutPath, safeStdout);
    writeText(stderrPath, safeStderr);
    let reportPath: string | undefined;
    let durableReportPath: string | undefined;
    if (outcome.state === 'COMPLETE' && safeStdout.trim()) {
      reportPath = path.join(playerPath, 'SCOUT-REPORT.md');
      durableReportPath = path.join(durablePath, `${executor.id}-SCOUT-REPORT.md`);
      writeText(reportPath, safeStdout);
      writeText(durableReportPath, safeStdout);
      reports.set(executor.id, safeStdout);
    }
    const telemetry: ScoutAttemptTelemetry = {
      scoutPlayId: envelope.play.playId,
      canonicalPlayHash: envelope.playHash,
      semanticPromptHash: envelope.semanticPromptHash,
      player: candidate.player,
      executorId: executor.id,
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
      stdoutPath,
      stderrPath,
      reportPath,
      durableReportPath,
      evaluation: evaluateScoutReport(safeStdout, envelope.play.gameRoot)
    };
    atomicJson(path.join(playerPath, 'telemetry.json'), telemetry);
    recordFormationInfrastructureBlock({
      durableReportRoot: request.durableReportRoot,
      candidateId: candidate.id,
      attempt: telemetry,
      observedAt: endedAt
    });
    // Last, and only now: the outcome, telemetry and durable report are final, so
    // removing this receiver's regenerable scaffolding cannot change any of them.
    hygieneEntries.push({
      receiver: executor.id,
      result: await releaseReceiverScaffolding(playerPath, {
        complete: telemetry.completionState === 'COMPLETE' && Boolean(durableReportPath),
        remove: request.removeWorkPath
      })
    });
    return telemetry;
  };

  /**
   * RECEIVER SUBSTITUTION / INJURED LIST — one lane, bounded.
   * A lane whose receiver is BLOCKED by infrastructure/availability may be taken over by the next
   * receiver that is eligible RIGHT NOW (fresh Combine scorecard read), never one already used on this
   * lane or fielded on another. The failed attempt is preserved; other lanes are never touched.
   */
  const runLane = async (index: number): Promise<void> => {
    let { candidate, executor } = executors[index];
    const attemptedHere = new Set<string>();
    for (;;) {
      attemptedHere.add(candidate.id);
      const telemetry = await runAttempt(candidate, executor, index);
      const verdict = classifyReceiverFailure({ state: telemetry.completionState, text: `${telemetry.failureBoundary ?? ''} ${telemetry.providerError ?? ''}` });
      if (telemetry.completionState === 'COMPLETE' || !verdict.substitutable || request.substitution === 'off') { attempts[index] = telemetry; return; }
      claimed.add(candidate.id);
      // The bound is the finite bench: each distinct candidate at most once per lane, eligibility re-read now.
      const choice = selectSubstitute({ bench: candidates, attempted: attemptedHere, claimed, isEligible: (bench) => bench.eligible(context) });
      substitutions.push({
        lane: executor.id,
        failedReceiver: candidate.id,
        failureClass: verdict.failureClass,
        failureLabel: verdict.label,
        failureReason: telemetry.failureBoundary ?? telemetry.providerError ?? verdict.reason,
        replacement: choice.pick?.id ?? null,
        skipped: choice.skipped,
        at: isoNow()
      });
      if (!choice.pick) { attempts[index] = telemetry; return; }
      preservedAttempts.push(telemetry);
      claimed.add(choice.pick.id);
      candidate = choice.pick;
      executor = choice.pick.createExecutor(context);
    }
  };

  const maxConcurrency = Math.min(executors.length, 3) || 1;
  let cursor = 0;
  const worker = async () => {
    while (cursor < executors.length) {
      const index = cursor++;
      await runLane(index);
    }
  };
  await Promise.all(Array.from({ length: maxConcurrency }, worker));

  const endedAt = isoNow();
  const synthesis = buildSynthesis(attempts, reports);
  const completionWithoutResultPath: Omit<FormationCompletion, 'resultPath' | 'children' | 'workspaceHygiene'> = {
    schemaVersion: 1,
    formationId,
    objective: envelope.play.objective,
    canonicalPlayHash: envelope.playHash,
    semanticPromptHash: envelope.semanticPromptHash,
    gameRoot: envelope.play.gameRoot,
    workspacePath,
    durablePath,
    maxConcurrency,
    startedAt,
    endedAt,
    candidatesConsidered: considered,
    scoutsRequested: attempts.length,
    scoutsCompleted: attempts.filter((attempt) => attempt.completionState === 'COMPLETE').length,
    scoutsFailed: attempts.filter((attempt) => attempt.completionState === 'FAILED').length,
    scoutsBlocked: attempts.filter((attempt) => attempt.completionState === 'BLOCKED').length,
    scoutsInterrupted: attempts.filter((attempt) => attempt.completionState === 'INTERRUPTED').length,
    scoutsUnknown: attempts.filter((attempt) => attempt.completionState === 'UNKNOWN').length,
    outcome: formationOutcome(attempts),
    attempts,
    synthesis,
    ...(substitutions.length ? { substitutions, preservedAttempts } : {})
  };
  const resultPath = path.join(durablePath, 'FORMATION-RESULT.md');
  const provenance = formationParentProvenance(request, endedAt);
  const markdown = `${provenance ? `${provenance}\n` : ''}${resultMarkdown(completionWithoutResultPath)}`;
  writeText(path.join(workspacePath, 'FORMATION-RESULT.md'), markdown);
  writeText(resultPath, markdown);
  const children = attempts
    .map((attempt) => attempt.durableReportPath)
    .filter((child): child is string => Boolean(child))
    .map((child) => path.relative(durablePath, child).split(path.sep).join('/'));
  const workspaceHygiene = summarizeWorkHygiene(hygieneEntries);
  const completion: FormationCompletion = { ...completionWithoutResultPath, resultPath, children, workspaceHygiene };
  atomicJson(path.join(workspacePath, 'FORMATION-COMPLETE.json'), completion);
  atomicJson(path.join(durablePath, 'FORMATION-COMPLETE.json'), completion);
  return completion;
}
