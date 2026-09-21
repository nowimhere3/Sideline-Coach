import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CONTENTION_SIGNATURE,
  classifyReceiverFailure,
  combineReadinessForModel,
  laneAttemptCeiling,
  looksLikeProviderIssue,
  selectSubstitute,
  type ReceiverFailureClass,
  type SubstitutionRecord
} from './scout-substitution';
import { formatElapsed, masterReportHeadline, renderMasterReport, type MasterLane } from './scout-master-report';
import { describeReceiver } from './scout-receiver-identity';

export type ScoutLifecycleState = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'INTERRUPTED' | 'UNKNOWN';

export interface ScoutDefinition {
  id: string;
  agent: keyof typeof SCOUT_ROSTER;
  objective: string;
}

export interface ScoutPlayDefinition {
  playId: string;
  gameRoot: string;
  maxConcurrency: number;
  scouts: ScoutDefinition[];
  /**
   * `auto` (default): an infrastructure/availability/execution failure may be replaced by the next current
   * eligible receiver. `off`: never substitute. Ignored for anything that is not positively an
   * inability to execute — see scout-substitution.ts.
   */
  substitution?: 'auto' | 'off';
}

/** One receiver's try at one lane. Failed attempts are kept as game film, never overwritten. */
export interface ScoutAttempt {
  n: number;
  agent: keyof typeof SCOUT_ROSTER;
  model: string;
  /** Player provenance, resolved from runtime/config truth when this attempt took the field. */
  provider: string;
  displayName: string;
  reasoningEffort: string;
  role: string;
  state: ScoutLifecycleState;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutPath: string;
  stderrPath: string;
  /** Hash of the canonical lane objective this attempt was given. Identical across every attempt of a lane. */
  objectiveHash: string;
  /** `per-attempt`: its own OpenCode database (no shared-lock stampede). `inherited`: the caller's OPENCODE_DB. */
  dbIsolation: 'per-attempt' | 'inherited';
  failureClass?: ReceiverFailureClass;
  failureLabel?: string;
  failureSummary?: string;
  /** Alias of the receiver this attempt took the lane over from. */
  substituteFor?: keyof typeof SCOUT_ROSTER;
  /** The receiver that took this lane over after this attempt, when it was substituted. */
  replacedBy?: keyof typeof SCOUT_ROSTER;
  /** Durable report path when this attempt completed. */
  reportPath?: string;
}

/** One reconnaissance LANE. `agent`/`model` describe the receiver currently (finally) holding it. */
export interface ScoutResult extends ScoutDefinition {
  model: string;
  state: ScoutLifecycleState;
  queuedAt: string;
  startedAt?: string;
  endedAt?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutPath: string;
  stderrPath: string;
  reportPath?: string;
  durableReportPath?: string;
  /** Who was originally assigned; differs from `agent` only after a substitution. */
  originalAgent: keyof typeof SCOUT_ROSTER;
  /** Identity of the canonical objective; a substitute never changes it. */
  objectiveHash: string;
  attempts: ScoutAttempt[];
}

export interface ScoutPlayCompletion {
  schemaVersion: 1;
  playId: string;
  gameRoot: string;
  workspacePath: string;
  durableReportPath: string;
  /** The ONE Dad-facing artifact: the master Formation report (absolute path). */
  masterReportPath: string;
  /** Set when this was a `--fresh` run: the manifest's own playId it was derived from. */
  rerunOf?: string;
  startedAt: string;
  endedAt: string;
  /** Total Formation elapsed time, from the same clock that stamps every attempt. */
  elapsedMs: number;
  maxConcurrency: number;
  scoutsRequested: number;
  scoutsCompleted: number;
  scoutsFailed: number;
  scoutsInterrupted: number;
  scoutsUnknown: number;
  scoutsSubstituted: number;
  totalAttempts: number;
  substitutions: SubstitutionRecord[];
  outcome: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'INTERRUPTED' | 'UNKNOWN';
  scouts: ScoutResult[];
}

export const SCOUT_ROSTER = Object.freeze({
  'sideline-scout-quick': 'openrouter/cohere/north-mini-code:free',
  'sideline-scout': 'openrouter/poolside/laguna-s-2.1:free',
  'sideline-scout-balanced': 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
  'sideline-scout-deep': 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free'
} as const);

export interface ScoutCommand {
  command: string;
  args: string[];
}

export interface SubstituteEligibilityContext {
  gameRoot: string;
  /** The Scout Intelligence root (holds `Combine/Scorecards`, the current depth chart). */
  scoutIntelligenceRoot: string;
}

/** Structured runner events. The terminal view (and, later, any UI) renders these; nothing parses text. */
export type ScoutRunEvent =
  | { type: 'formation-start'; playId: string; lanes: number }
  | { type: 'lane-queued'; lane: string; receiver: string; displayName: string }
  | { type: 'attempt-start'; lane: string; attempt: number; receiver: string; displayName: string; model: string }
  | { type: 'attempt-end'; lane: string; attempt: number; receiver: string; displayName: string; state: ScoutLifecycleState; label: string; failureClass?: ReceiverFailureClass; reason?: string; durationMs: number }
  | { type: 'substitute'; lane: string; from: string; fromName: string; to: string; toName: string; label: string; reason: string }
  | { type: 'no-substitute'; lane: string; receiver: string; receiverName: string; label: string }
  | { type: 'lane-complete'; lane: string; receiver: string; displayName: string }
  | { type: 'formation-end'; outcome: ScoutPlayCompletion['outcome']; elapsedMs: number };

export interface ScoutRunnerOptions {
  workspaceRoot?: string;
  durableReportRoot: string;
  opencodeExecutable?: string;
  commandForScout?: (scout: ScoutDefinition, prompt: string, gameRoot: string) => ScoutCommand;
  /** Injectable clock: stamps every attempt and the Formation. */
  now?: () => Date;
  signal?: AbortSignal;
  onStateChange?: (result: Readonly<ScoutResult>) => void;
  /** Human-readable notes (substitutions). Nothing depends on them. */
  onNote?: (message: string) => void;
  onEvent?: (event: ScoutRunEvent) => void;
  /**
   * CURRENT eligibility of a bench receiver, asked before EVERY substitution decision. Default: its
   * read-only agent contract validates in this Game AND its Combine scorecard is READY right now.
   * Historical success is not readiness.
   */
  substituteEligibility?: (agent: keyof typeof SCOUT_ROSTER, context: SubstituteEligibilityContext) => { eligible: boolean; reason: string };
  /** Pause before fielding a substitute after LOCAL contention (default 1500 ms). Tests use 0. */
  contentionBackoffMs?: number;
  /**
   * OPENCODE DB CONTENTION DECISION. `per-attempt` (default): every receiver attempt starts against its own
   * OpenCode database, so concurrent starts can never contend and a substitute can never walk into the
   * lock that hurt its predecessor. `inherit`: use the caller's OPENCODE_DB as-is (legacy behaviour).
   */
  dbIsolation?: 'per-attempt' | 'inherit';
  /**
   * FRESH RUN. The runner derives a new, unique playId from the manifest's own (never touching the
   * manifest or any earlier workspace/evidence) and runs the same lanes under it. Without this, reusing
   * an existing playId is refused, which is what keeps old game film safe.
   */
  fresh?: boolean;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function validateScoutPlay(input: unknown): ScoutPlayDefinition {
  if (!input || typeof input !== 'object') throw new Error('Scout Play must be a JSON object.');
  const play = input as Partial<ScoutPlayDefinition>;
  if (typeof play.playId !== 'string' || !SAFE_ID.test(play.playId)) throw new Error('playId must be 1-80 safe filename characters.');
  if (typeof play.gameRoot !== 'string' || !path.isAbsolute(play.gameRoot)) throw new Error('gameRoot must be an absolute path.');
  let stat: fs.Stats;
  try { stat = fs.statSync(play.gameRoot); } catch { throw new Error(`Game root does not exist: ${play.gameRoot}`); }
  if (!stat.isDirectory()) throw new Error(`Game root is not a directory: ${play.gameRoot}`);
  if (!Number.isSafeInteger(play.maxConcurrency) || (play.maxConcurrency as number) < 1 || (play.maxConcurrency as number) > 32) {
    throw new Error('maxConcurrency must be an integer from 1 through 32.');
  }
  if (!Array.isArray(play.scouts) || play.scouts.length === 0) throw new Error('scouts must contain at least one Scout definition.');
  if (play.substitution !== undefined && play.substitution !== 'auto' && play.substitution !== 'off') throw new Error("substitution must be 'auto' or 'off'.");
  const ids = new Set<string>();
  const scouts = play.scouts.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`scouts[${index}] must be an object.`);
    const scout = value as Partial<ScoutDefinition>;
    if (typeof scout.id !== 'string' || !SAFE_ID.test(scout.id)) throw new Error(`scouts[${index}].id is invalid.`);
    if (ids.has(scout.id)) throw new Error(`Duplicate Scout id: ${scout.id}`);
    ids.add(scout.id);
    if (typeof scout.agent !== 'string' || !(scout.agent in SCOUT_ROSTER)) throw new Error(`scouts[${index}].agent is not an approved read-only Scout agent.`);
    if (typeof scout.objective !== 'string' || !scout.objective.trim() || scout.objective.length > 20_000) {
      throw new Error(`scouts[${index}].objective must contain 1-20000 characters.`);
    }
    return { id: scout.id, agent: scout.agent as ScoutDefinition['agent'], objective: scout.objective.trim() };
  });
  return { playId: play.playId, gameRoot: path.resolve(play.gameRoot), maxConcurrency: play.maxConcurrency as number, scouts, substitution: play.substitution ?? 'auto' };
}

/** Parse a Play manifest. A UTF-8 byte-order mark (PowerShell writes one) is tolerated; nothing else is. */
export function parseScoutManifest(text: string, source = 'manifest'): unknown {
  try { return JSON.parse(text.replace(/^﻿/, '')); }
  catch (error) { throw new Error(`Could not read ${source} as JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

const FRESH_SUFFIX = /-fresh-\d{8}-\d{6}(?:-\d+)?$/;

function edmontonStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}${value('month')}${value('day')}-${value('hour')}${value('minute')}${value('second')}`;
}

/**
 * The runner-owned identity of a fresh run: `<base>-fresh-<Calgary time>` (`-2`, `-3` … when that exact id is
 * already taken). A previous fresh suffix is replaced, not stacked, so reruns of reruns stay readable.
 * `taken` must consult BOTH the workspace and the durable evidence, so old game film can never be reused.
 */
export function deriveFreshPlayId(input: { playId: string; now: Date; taken: (playId: string) => boolean }): string {
  const suffix = `-fresh-${edmontonStamp(input.now)}`;
  const base = input.playId.replace(FRESH_SUFFIX, '').slice(0, 80 - suffix.length - 5);
  for (let n = 1; n < 1_000; n += 1) {
    const candidate = `${base}${suffix}${n === 1 ? '' : `-${n}`}`;
    if (!input.taken(candidate)) return candidate;
  }
  throw new Error('Could not derive a fresh Play id.');
}

/** Identity of a canonical lane objective. Substitution must never change it. */
export function hashObjective(objective: string): string {
  return crypto.createHash('sha256').update(objective).digest('hex').slice(0, 12);
}

/**
 * What a substitute is told about the lane's history. Deterministic and factual only: who went down, why,
 * and any output that receiver actually left. Never hidden reasoning. The objective itself is unchanged.
 */
export interface ScoutContinuation {
  previousReceiver: string;
  previousModel: string;
  failureLabel: string;
  failureReason: string;
  /** Output the failed receiver left, when it is more than an error message. Unverified. */
  partialOutput?: string;
}

export function buildScoutPrompt(play: ScoutPlayDefinition, scout: ScoutDefinition, continuation?: ScoutContinuation): string {
  const packet = continuation
    ? `\n\nSAME LANE — PRIOR ATTEMPT (informational only; the objective above is unchanged)\nThe previous receiver on this lane (${continuation.previousReceiver}, ${continuation.previousModel}) did not finish it: ${continuation.failureLabel} — ${continuation.failureReason}\n${continuation.partialOutput ? `It left this partial output. Treat it as UNVERIFIED and confirm anything you rely on against the Game:\n<<<PARTIAL OUTPUT\n${continuation.partialOutput}\nPARTIAL OUTPUT>>>\n` : 'It left no usable partial output; start from the objective.\n'}`
    : '';
  return `SCOUT PLAY - READ-ONLY RECONNAISSANCE\n\nPlay ID: ${play.playId}\nScout ID: ${scout.id}\nAssigned custom agent: ${scout.agent}\nAssigned model: ${SCOUT_ROSTER[scout.agent]}\nGame root: ${play.gameRoot}\n\nBOUNDED OBJECTIVE\n${scout.objective}${packet}\n\nREAD-ONLY CONTRACT\nYou are a temporary Sideline Coach reconnaissance Scout. Investigate only the bounded objective above. Follow the Game's current Scout SOP / ROASTER. Do not edit, create, delete, or rename Game files; do not execute shell commands; do not mutate git; do not install packages; do not implement fixes; do not launch subagents; and do not change configuration or runtime state. Return the complete report in this response. The trusted Runner, not you, will persist it.\n\nYour report must identify the Scout agent and exact model, state that it is reconnaissance rather than final architectural authority, distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION where relevant, cite exact evidence, include limitations, and stop when this objective is complete.\n\nFor reliable compilation, use these headings where they apply: RESULT, KEY DISCOVERIES, FACT, INFERENCE, UNKNOWN, CONTRADICTION, IMPORTANT FILES / PATHS. Missing headings are tolerated; never invent content to fill one.`;
}

/** Fail closed if the Game does not expose the proven read-only custom agent. */
export function validateScoutAgentContract(gameRoot: string, scout: ScoutDefinition): void {
  const agentFile = path.join(gameRoot, '.opencode', 'agents', `${scout.agent}.md`);
  let source: string;
  try { source = fs.readFileSync(agentFile, 'utf8'); }
  catch { throw new Error(`Read-only Scout agent definition is missing: ${agentFile}`); }
  const frontmatter = source.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const required = [
    /^mode:\s*primary\s*$/m,
    new RegExp(`^model:\\s*${SCOUT_ROSTER[scout.agent].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'),
    /^permission:\s*$/m,
    /^\s+["']?\*["']?:\s*deny\s*$/m,
    /^\s+read:\s*$/m,
    /^\s+glob:\s*allow\s*$/m,
    /^\s+grep:\s*allow\s*$/m,
    /^\s+list:\s*allow\s*$/m,
    /^\s+external_directory:\s*deny\s*$/m
  ];
  if (!frontmatter || required.some((pattern) => !pattern.test(frontmatter))) {
    throw new Error(`Scout agent '${scout.agent}' is not provably the expected read-only primary agent: ${agentFile}`);
  }
  if (/^\s+(?:bash|shell|write|edit|patch):\s*(?!deny\s*$)\S+/m.test(frontmatter)) {
    throw new Error(`Scout agent '${scout.agent}' grants a mutating tool and cannot be launched.`);
  }
}

export function resolveOpenCodeExecutable(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    const executable = path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
    if (fs.existsSync(executable)) return executable;
  }
  return 'opencode';
}

function defaultCommand(executable: string, scout: ScoutDefinition, prompt: string, gameRoot: string): ScoutCommand {
  return { command: executable, args: ['run', '--agent', scout.agent, '--format', 'default', '--dir', gameRoot, prompt] };
}

function atomicJson(file: string, value: unknown): void {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function writeText(file: string, value: string): void {
  fs.writeFileSync(file, value, 'utf8');
}

function artifactName(id: string): string {
  return `SCOUT-${id}-Reconnaissance.md`;
}

/** The canonical Dad-facing name, shared with the product Formation parent. */
export const MASTER_REPORT_NAME = 'FORMATION-RESULT.md';

function playOutcome(results: ScoutResult[]): ScoutPlayCompletion['outcome'] {
  if (results.every((result) => result.state === 'COMPLETE')) return 'COMPLETE';
  if (results.some((result) => result.state === 'COMPLETE')) return 'PARTIAL';
  if (results.some((result) => result.state === 'INTERRUPTED')) return 'INTERRUPTED';
  if (results.some((result) => result.state === 'UNKNOWN')) return 'UNKNOWN';
  return 'FAILED';
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const PARTIAL_OUTPUT_LIMIT = 4_000;
const PARTIAL_OUTPUT_MINIMUM = 200;

function readBounded(file: string, limit: number): string {
  try { return fs.readFileSync(file, 'utf8').slice(0, limit).replace(ANSI, ''); } catch { return ''; }
}

/** Failure evidence for classification and the report: stderr first, then the head of stdout. */
function failureEvidence(attempt: Pick<ScoutAttempt, 'stderrPath' | 'stdoutPath'>): { text: string; summary?: string; partial?: string } {
  const stderr = readBounded(attempt.stderrPath, 8_000);
  const stdout = readBounded(attempt.stdoutPath, PARTIAL_OUTPUT_LIMIT);
  const first = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 300);
  const stdoutIsErrorText = looksLikeProviderIssue(stdout) || CONTENTION_SIGNATURE.test(stdout);
  const partial = stdout.trim().length >= PARTIAL_OUTPUT_MINIMUM && !stdoutIsErrorText ? stdout.trim() : undefined;
  return { text: `${stderr}\n${stdout}`, summary: first(stderr) ?? first(stdout), partial };
}

const BENCH: readonly (keyof typeof SCOUT_ROSTER)[] = Object.keys(SCOUT_ROSTER) as (keyof typeof SCOUT_ROSTER)[];

/**
 * Runs one explicitly assigned Scout formation. The runner is the only writer:
 * child processes receive the Game as cwd while their custom agents deny all
 * mutating tools. Output is captured from process pipes, never a terminal.
 *
 * Each Scout is a reconnaissance LANE. If a lane's receiver cannot complete it for an
 * infrastructure/availability/execution reason (see scout-substitution.ts) the runner fields the next
 * CURRENT eligible receiver in that same lane, with the same canonical objective — never touching
 * surviving lanes, never using a receiver twice for the lane, and preserving every failed attempt.
 * Finally it writes ONE master report (FORMATION-RESULT.md) for whatever the outcome was.
 */
export async function runScoutPlay(input: unknown, options: ScoutRunnerOptions): Promise<ScoutPlayCompletion> {
  const play = validateScoutPlay(input);
  if (!options?.durableReportRoot || !path.isAbsolute(options.durableReportRoot)) throw new Error('durableReportRoot must be an absolute path.');
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.join(play.gameRoot, 'Scouts'));
  const durableRoot = path.resolve(options.durableReportRoot);
  play.scouts.forEach((scout) => validateScoutAgentContract(play.gameRoot, scout));
  // FRESH RUN: identity is the runner's job, not Dad's. Earlier evidence is never touched or reused.
  const rerunOf = options.fresh ? play.playId : undefined;
  if (rerunOf) {
    play.playId = deriveFreshPlayId({ playId: rerunOf, now: (options.now ?? (() => new Date()))(), taken: (id) => fs.existsSync(path.join(workspaceRoot, id)) || fs.existsSync(path.join(durableRoot, id)) });
    options.onNote?.(`FRESH RUN: playId ${play.playId} (a new run of ${rerunOf}; earlier evidence is untouched)`);
  }
  const workspacePath = path.join(workspaceRoot, play.playId);
  const durablePath = path.join(durableRoot, play.playId);
  if (fs.existsSync(workspacePath)) throw new Error(`Play workspace already exists: ${workspacePath}. Nothing was overwritten. Add --fresh to run this Play again under a new id.`);
  if (fs.existsSync(durablePath)) throw new Error(`Durable Play report folder already exists: ${durablePath}. Nothing was overwritten. Add --fresh to run this Play again under a new id.`);

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(durablePath, { recursive: true });
  const now = options.now ?? (() => new Date());
  const isoNow = () => now().toISOString();
  const startedMs = now().getTime();
  const startedAt = new Date(startedMs).toISOString();
  const emit = (event: ScoutRunEvent) => { try { options.onEvent?.(event); } catch { /* a display failure never disturbs a Play */ } };
  const active = new Set<child_process.ChildProcess>();
  const eligibilityContext: SubstituteEligibilityContext = { gameRoot: play.gameRoot, scoutIntelligenceRoot: path.resolve(options.durableReportRoot) };
  const eligibility = options.substituteEligibility ?? ((agent, context) => {
    try { validateScoutAgentContract(context.gameRoot, { id: 'bench', agent, objective: 'eligibility' }); }
    catch (error) { return { eligible: false, reason: error instanceof Error ? error.message : String(error) }; }
    return combineReadinessForModel(context.scoutIntelligenceRoot, SCOUT_ROSTER[agent]);
  });
  const isolateDb = (options.dbIsolation ?? 'per-attempt') === 'per-attempt';
  const identityOf = (agent: keyof typeof SCOUT_ROSTER) => describeReceiver({ gameRoot: play.gameRoot, scoutIntelligenceRoot: eligibilityContext.scoutIntelligenceRoot, agent, model: SCOUT_ROSTER[agent] });

  const results: ScoutResult[] = play.scouts.map((scout) => {
    const scoutPath = path.join(workspacePath, scout.id);
    fs.mkdirSync(scoutPath);
    const result: ScoutResult = {
      ...scout,
      model: SCOUT_ROSTER[scout.agent],
      state: 'QUEUED',
      queuedAt: isoNow(),
      exitCode: null,
      signal: null,
      stdoutPath: path.join(scoutPath, 'stdout.log'),
      stderrPath: path.join(scoutPath, 'stderr.log'),
      originalAgent: scout.agent,
      objectiveHash: hashObjective(scout.objective),
      attempts: []
    };
    writeText(path.join(scoutPath, 'objective.txt'), `${scout.objective}\n`);
    writeText(path.join(scoutPath, 'prompt.txt'), `${buildScoutPrompt(play, scout)}\n`);
    writeText(result.stdoutPath, '');
    writeText(result.stderrPath, '');
    return result;
  });
  atomicJson(path.join(workspacePath, 'play.json'), { ...play, ...(rerunOf ? { rerunOf } : {}), startedAt });
  const publish = (result: ScoutResult) => {
    atomicJson(path.join(workspacePath, result.id, 'lifecycle.json'), result);
    options.onStateChange?.(structuredClone(result));
  };
  emit({ type: 'formation-start', playId: play.playId, lanes: results.length });
  results.forEach((result) => {
    publish(result);
    emit({ type: 'lane-queued', lane: result.id, receiver: result.agent, displayName: identityOf(result.agent).displayName });
  });

  let abortRequested = options.signal?.aborted ?? false;
  const abort = () => {
    abortRequested = true;
    for (const child of active) if (!child.killed) child.kill();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  const substitutions: SubstitutionRecord[] = [];
  /** Receivers that were injured in THIS Play: out for the whole attempt, not just the lane. */
  const injured = new Set<string>();

  /** One receiver's try at one lane. Resolves with the evidence classification needs. */
  const runAttempt = (result: ScoutResult, continuation: ScoutContinuation | undefined, substituteFor: keyof typeof SCOUT_ROSTER | undefined): Promise<{ couldNotStart: boolean; emptyReport: boolean }> => new Promise((resolve) => {
    const n = result.attempts.length + 1;
    if (n > 1) {
      // The first attempt uses the lane's original log files; later attempts never overwrite earlier film.
      result.stdoutPath = path.join(workspacePath, result.id, `stdout.attempt-${n}.log`);
      result.stderrPath = path.join(workspacePath, result.id, `stderr.attempt-${n}.log`);
      writeText(result.stdoutPath, '');
      writeText(result.stderrPath, '');
    }
    const identity = identityOf(result.agent);
    const attempt: ScoutAttempt = {
      n, agent: result.agent, model: result.model, provider: identity.provider, displayName: identity.displayName,
      reasoningEffort: identity.reasoningEffort, role: identity.role, state: 'QUEUED', exitCode: null, signal: null,
      stdoutPath: result.stdoutPath, stderrPath: result.stderrPath, objectiveHash: result.objectiveHash,
      dbIsolation: isolateDb ? 'per-attempt' : 'inherited', substituteFor
    };
    result.attempts.push(attempt);
    const dbDir = path.join(workspacePath, result.id, `opencode-db-attempt-${n}`);
    const settle = (couldNotStart: boolean, emptyReport: boolean) => {
      attempt.state = result.state;
      attempt.startedAt = result.startedAt;
      attempt.endedAt = result.endedAt;
      attempt.exitCode = result.exitCode;
      attempt.signal = result.signal;
      attempt.durationMs = attempt.startedAt && attempt.endedAt ? Math.max(0, Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt)) : undefined;
      if (isolateDb) { try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch { /* disposable scaffolding */ } }
      publish(result);
      resolve({ couldNotStart, emptyReport });
    };
    if (abortRequested) {
      result.state = 'INTERRUPTED';
      result.endedAt = isoNow();
      settle(false, false);
      return;
    }
    const scout: ScoutDefinition = { id: result.id, agent: result.agent, objective: result.objective };
    const prompt = buildScoutPrompt(play, scout, continuation);
    const command = options.commandForScout?.(scout, prompt, play.gameRoot)
      ?? defaultCommand(options.opencodeExecutable ?? resolveOpenCodeExecutable(), scout, prompt, play.gameRoot);
    result.state = 'RUNNING';
    result.startedAt = isoNow();
    publish(result);
    emit({ type: 'attempt-start', lane: result.id, attempt: n, receiver: result.agent, displayName: identity.displayName, model: result.model });
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (isolateDb) {
      fs.mkdirSync(dbDir, { recursive: true });
      env.OPENCODE_DB = path.join(dbDir, 'opencode.db');
    }
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(command.command, command.args, {
        cwd: play.gameRoot,
        env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      fs.appendFileSync(result.stderrPath, `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      result.state = 'FAILED';
      result.endedAt = isoNow();
      settle(true, false);
      return;
    }
    active.add(child);
    child.stdout?.on('data', (chunk) => fs.appendFileSync(result.stdoutPath, chunk));
    child.stderr?.on('data', (chunk) => fs.appendFileSync(result.stderrPath, chunk));
    let spawnError = false;
    child.on('error', (error) => {
      spawnError = true;
      fs.appendFileSync(result.stderrPath, `${error.stack ?? error.message}\n`);
    });
    child.on('close', (code, signal) => {
      active.delete(child);
      result.exitCode = code;
      result.signal = signal;
      result.endedAt = isoNow();
      // INTERRUPTED means the human asked. A signal the human did not request is an abnormal death (FAILED).
      let emptyReport = false;
      if (abortRequested) result.state = 'INTERRUPTED';
      else if (signal) result.state = 'FAILED';
      else if (spawnError || (typeof code === 'number' && code !== 0)) result.state = 'FAILED';
      else if (code === 0) {
        // A valid completed report is required: a clean exit with nothing to show is not a completed Scout.
        if (fs.readFileSync(result.stdoutPath, 'utf8').trim()) result.state = 'COMPLETE';
        else {
          result.state = 'FAILED';
          emptyReport = true;
          fs.appendFileSync(result.stderrPath, 'Scout exited normally but returned no report.\n');
        }
      } else result.state = 'UNKNOWN';
      if (result.state === 'COMPLETE') {
        const report = path.join(workspacePath, result.id, artifactName(result.id));
        fs.copyFileSync(result.stdoutPath, report);
        result.reportPath = report;
        const durableReport = path.join(durablePath, artifactName(result.id));
        fs.copyFileSync(report, durableReport);
        result.durableReportPath = durableReport;
        attempt.reportPath = durableReport;
      }
      settle(spawnError, emptyReport);
    });
  });

  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const nameOf = (agent: keyof typeof SCOUT_ROSTER) => identityOf(agent).displayName;

  /** Run one lane to its end, fielding each currently-eligible bench receiver at most once. */
  const execute = async (result: ScoutResult): Promise<void> => {
    const attemptedHere = new Set<string>();
    const ceiling = laneAttemptCeiling(BENCH.length);
    let continuation: ScoutContinuation | undefined;
    let substituteFor: keyof typeof SCOUT_ROSTER | undefined;
    for (;;) {
      attemptedHere.add(result.agent);
      const { couldNotStart, emptyReport } = await runAttempt(result, continuation, substituteFor);
      const attempt = result.attempts[result.attempts.length - 1];
      const evidence = result.state === 'COMPLETE' ? undefined : failureEvidence(attempt);
      const verdict = classifyReceiverFailure({
        state: result.state === 'RUNNING' || result.state === 'QUEUED' ? 'UNKNOWN' : result.state,
        text: evidence?.text ?? '',
        couldNotStart,
        humanAbort: abortRequested,
        killedBySignal: abortRequested ? null : result.signal,
        exitCode: result.exitCode,
        emptyReport
      });
      attempt.failureClass = result.state === 'COMPLETE' ? undefined : verdict.failureClass;
      attempt.failureLabel = result.state === 'COMPLETE' ? undefined : verdict.label;
      attempt.failureSummary = result.state === 'COMPLETE' ? undefined : (evidence?.summary ? `${verdict.reason} (${evidence.summary})` : verdict.reason);
      emit({
        type: 'attempt-end', lane: result.id, attempt: attempt.n, receiver: attempt.agent, displayName: attempt.displayName, state: result.state,
        label: result.state === 'COMPLETE' ? 'COMPLETE' : verdict.label, failureClass: attempt.failureClass, reason: attempt.failureSummary, durationMs: attempt.durationMs ?? 0
      });
      if (result.state === 'COMPLETE') { emit({ type: 'lane-complete', lane: result.id, receiver: attempt.agent, displayName: attempt.displayName }); return; }
      if (abortRequested || !verdict.substitutable || play.substitution === 'off') { publish(result); return; }
      injured.add(result.agent);

      // Depth chart re-read for THIS decision: eligibility is asked now, for every candidate, every time.
      const claimed = new Set<string>([...injured, ...results.filter((other) => other !== result).map((other) => other.agent)]);
      // Hard bound, independent of the "never twice" rule: counts ATTEMPTS, so it holds even if selection were ever wrong.
      const choice = result.attempts.length >= ceiling
        ? { pick: undefined, skipped: [{ id: '*', reason: 'Attempt ceiling reached (every bench receiver already tried on this lane).' }] }
        : selectSubstitute({ bench: BENCH.map((id) => ({ id })), attempted: attemptedHere, claimed, isEligible: (candidate) => eligibility(candidate.id as keyof typeof SCOUT_ROSTER, eligibilityContext) });
      const record: SubstitutionRecord = {
        lane: result.id,
        failedReceiver: result.agent,
        failureClass: verdict.failureClass,
        failureLabel: verdict.label,
        failureReason: attempt.failureSummary ?? verdict.reason,
        replacement: choice.pick?.id ?? null,
        skipped: choice.skipped,
        at: isoNow()
      };
      substitutions.push(record);
      if (!choice.pick) {
        options.onNote?.(`[NO SUBSTITUTE] ${result.id}: ${result.agent} could not field (${verdict.label}); no eligible receiver remains.`);
        emit({ type: 'no-substitute', lane: result.id, receiver: result.agent, receiverName: attempt.displayName, label: verdict.label });
        publish(result);
        return;
      }
      const replacement = choice.pick.id as keyof typeof SCOUT_ROSTER;
      options.onNote?.(`[SUBSTITUTE] ${result.id}: ${result.agent} → ${replacement} (${verdict.label}: ${evidence?.summary ?? verdict.reason})`);
      emit({ type: 'substitute', lane: result.id, from: result.agent, fromName: attempt.displayName, to: replacement, toName: nameOf(replacement), label: verdict.label, reason: verdict.reason });
      attempt.replacedBy = replacement;
      continuation = { previousReceiver: attempt.agent, previousModel: attempt.model, failureLabel: verdict.label, failureReason: verdict.reason, partialOutput: evidence?.partial?.slice(0, PARTIAL_OUTPUT_LIMIT) };
      substituteFor = attempt.agent;
      if (verdict.failureClass === 'contention') await pause(options.contentionBackoffMs ?? 1_500);
      if (abortRequested) return;
      result.agent = replacement;
      result.model = SCOUT_ROSTER[replacement];
      result.state = 'QUEUED';
      result.exitCode = null;
      result.signal = null;
      result.startedAt = undefined;
      result.endedAt = undefined;
      publish(result);
    }
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < results.length) {
      const index = cursor++;
      await execute(results[index]);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(play.maxConcurrency, results.length) }, worker));
  } finally {
    options.signal?.removeEventListener('abort', abort);
    for (const child of active) if (!child.killed) child.kill();
  }

  // The master report: ONE Dad-facing artifact for every terminal outcome that left evidence.
  const endedMs = now().getTime();
  const endedAt = new Date(endedMs).toISOString();
  const elapsedMs = Math.max(0, endedMs - startedMs);
  const outcome = playOutcome(results);
  const masterLanes: MasterLane[] = results.map((result) => ({
    id: result.id,
    objective: result.objective,
    objectiveHash: result.objectiveHash,
    finalState: result.state,
    finalReceiver: result.agent,
    model: result.model,
    reportPath: result.durableReportPath,
    reportText: result.durableReportPath ? (() => { try { return fs.readFileSync(result.durableReportPath as string, 'utf8'); } catch { return undefined; } })() : undefined,
    attempts: result.attempts.map((attempt) => ({
      n: attempt.n,
      receiver: attempt.agent,
      displayName: attempt.displayName,
      provider: attempt.provider,
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort,
      role: attempt.role,
      state: attempt.state,
      failureClass: attempt.failureClass,
      failureLabel: attempt.failureLabel,
      reason: attempt.failureSummary,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      durationMs: attempt.durationMs,
      substituteFor: attempt.substituteFor,
      replacedBy: attempt.replacedBy,
      stdoutPath: attempt.stdoutPath,
      stderrPath: attempt.stderrPath,
      reportPath: attempt.reportPath
    }))
  }));
  const masterMarkdown = renderMasterReport({
    playId: play.playId, rerunOf, gameRoot: play.gameRoot, startedAt, endedAt, elapsedMs, outcome, lanes: masterLanes, substitutions, durablePath, workspacePath
  });
  const masterReportPath = path.join(durablePath, MASTER_REPORT_NAME);
  writeText(path.join(workspacePath, MASTER_REPORT_NAME), masterMarkdown);
  writeText(masterReportPath, masterMarkdown);

  const completion: ScoutPlayCompletion = {
    schemaVersion: 1,
    playId: play.playId,
    gameRoot: play.gameRoot,
    workspacePath,
    durableReportPath: durablePath,
    masterReportPath,
    ...(rerunOf ? { rerunOf } : {}),
    startedAt,
    endedAt,
    elapsedMs,
    maxConcurrency: play.maxConcurrency,
    scoutsRequested: results.length,
    scoutsCompleted: results.filter((result) => result.state === 'COMPLETE').length,
    scoutsFailed: results.filter((result) => result.state === 'FAILED').length,
    scoutsInterrupted: results.filter((result) => result.state === 'INTERRUPTED').length,
    scoutsUnknown: results.filter((result) => result.state === 'UNKNOWN').length,
    scoutsSubstituted: substitutions.filter((record) => record.replacement).length,
    totalAttempts: results.reduce((sum, result) => sum + result.attempts.length, 0),
    substitutions,
    outcome,
    scouts: results
  };
  atomicJson(path.join(workspacePath, 'completion.json'), completion);
  atomicJson(path.join(durablePath, 'SCOUT-PLAY-COMPLETE.json'), completion);
  emit({ type: 'formation-end', outcome, elapsedMs });
  return completion;
}

/**
 * The terminal ending Dad sees: one compact headline, then ONLY the clickable absolute path as the
 * final line. Applies to every outcome that produced a master report.
 */
export function formatScoutPlayHandoff(completion: ScoutPlayCompletion): string[] {
  return [
    masterReportHeadline({ outcome: completion.outcome, completed: completion.scoutsCompleted, requested: completion.scoutsRequested, substitutions: completion.scoutsSubstituted, elapsedMs: completion.elapsedMs }),
    '',
    'MASTER SCOUT REPORT:',
    `${completion.masterReportPath}:1`
  ];
}

export { formatElapsed };
