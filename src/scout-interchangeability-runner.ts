import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ControlEvent } from './player-control/contract';
import { createAntiGravityControlFactory, type PrintTurnProcessEvent } from './player-control/structured-print';
import { createScoutPlayEnvelope, scoutPlayHash, type ScoutPlayEnvelope } from './scout-play';
import { resolveOpenCodeExecutable } from './scout-play-runner';

export type InterchangeabilityState = 'COMPLETE' | 'FAILED' | 'BLOCKED' | 'INTERRUPTED' | 'UNKNOWN';

export interface ScoutExecutionOutcome {
  readonly state: InterchangeabilityState;
  readonly stdout: string;
  readonly stderr: string;
  readonly model?: string;
  readonly effort?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly providerError?: string;
  readonly quotaEvent?: string;
  readonly readOnlyContractHeld: boolean | 'UNKNOWN';
  readonly failureBoundary?: string;
}

export interface ScoutExecutorContext {
  readonly gameRoot: string;
  readonly playerPath: string;
}

export interface ScoutPlayExecutor {
  readonly id: 'gemini-flash-direct' | 'antigravity' | string;
  readonly player: string;
  readonly harness: string;
  readonly provider: string;
  execute(envelope: ScoutPlayEnvelope, context: ScoutExecutorContext): Promise<ScoutExecutionOutcome>;
}

export interface ScoutAttemptTelemetry {
  readonly scoutPlayId: string;
  readonly canonicalPlayHash: string;
  readonly semanticPromptHash: string;
  readonly player: string;
  readonly executorId: string;
  readonly harness: string;
  readonly provider: string;
  readonly model?: string;
  readonly effort?: string;
  readonly taskClass: string;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly endedAt: string;
  readonly durationMs?: number;
  readonly completionState: InterchangeabilityState;
  readonly processExitCode: number | null;
  readonly terminationSignal: NodeJS.Signals | null;
  readonly providerError?: string;
  readonly rateLimitOrQuotaEvent?: string;
  readonly reportCreated: boolean;
  readonly readOnlyContractHeld: boolean | 'UNKNOWN';
  readonly failureBoundary?: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly reportPath?: string;
  readonly durableReportPath?: string;
  readonly evaluation: {
    readonly evaluationContractRevision: string;
    readonly reportStructurallyUsable: boolean;
    readonly significantEvidenceMissing: string | null;
    readonly obviousUnsupportedClaim: string | null;
    readonly needsDeeperReview: boolean;
    readonly existingGameArtifactObserved: string | null;
  };
}

export interface InterchangeabilityCompletion {
  readonly schemaVersion: 1;
  readonly playId: string;
  readonly canonicalPlayHash: string;
  readonly semanticPromptHash: string;
  readonly gameRoot: string;
  readonly workspacePath: string;
  readonly durablePath: string;
  readonly maxConcurrency: 1;
  readonly runOrder: readonly string[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly attempts: readonly ScoutAttemptTelemetry[];
  readonly outcome: 'PASS' | 'PARTIAL' | 'FAIL';
}

export interface InterchangeabilityRunnerOptions {
  readonly workspaceRoot?: string;
  readonly durableReportRoot: string;
  readonly executors: readonly ScoutPlayExecutor[];
  readonly now?: () => Date;
  /** Values are redacted before any executor text reaches disk. */
  readonly secretValues?: readonly string[];
}

export const RESULT_SECTIONS = ['Executive answer', 'FACTS', 'INFERENCES', 'UNKNOWNS', 'CONTRADICTIONS', 'Relevant files / symbols', 'Recommended next step', 'Provenance'];
export const REQUIRED_SCOUT_STATEMENT = 'This report is reconnaissance, not final architectural authority.';
export const LEGACY_SCOUT_EVALUATION_CONTRACT_REVISION = 'strict-markdown-headings-v1';
export const SCOUT_EVALUATION_CONTRACT_REVISION = 'structural-lines-and-evidence-v2';

function writeText(file: string, text: string): void {
  // The runner owns its Play evidence tree. Re-establish the immediate parent at
  // the persistence seam so callers never need to pre-create artifact folders.
  // The run-level no-overwrite guards still execute before any Play directories
  // are created, so this does not permit reuse of completed Play evidence.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
function atomicJson(file: string, value: unknown): void {
  const temp = `${file}.${process.pid}.tmp`;
  writeText(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
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

function sectionLinePattern(section: string): RegExp {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markdown = `#{1,3}\\s+${escaped}\\s*:?\\s*`;
  const plain = `${escaped}\\s*:?\\s*`;
  const bold = `(?:\\*\\*|__)${escaped}\\s*:?\\s*(?:\\*\\*|__)\\s*`;
  const inlineExecutive = section.toLowerCase() === 'executive answer'
    ? `|${escaped}\\s*:\\s*\\S.*`
    : '';
  return new RegExp(`^[ \\t]{0,3}(?:${markdown}|${plain}|${bold}${inlineExecutive})$`, 'im');
}

/**
 * SCOUT REPORT EVALUATION CONTRACT
 *
 * WAS: Scout readiness could be determined by an undocumented strict
 * Markdown-heading syntax.
 *
 * IS: Scout report evaluation recognizes a documented preferred structure
 * while tolerating harmless formatting variants; qualification records which
 * evaluator contract interpreted the evidence.
 *
 * WHY: Formatting quirks must not masquerade as negative Player game film or
 * strand capable Scouts outside the depth chart.
 *
 * WILL BE: Future Adaptive Coaching Intelligence may combine multiple
 * samples, task-specific game film, execution health, resource cost, and
 * evaluator confidence without conflating presentation syntax with
 * capability.
 */
/** One common result check; measured telemetry stays separate from this judgment. */
export function evaluateScoutReport(report: string, gameRoot: string): ScoutAttemptTelemetry['evaluation'] {
  const structurallyUsable = report.includes(REQUIRED_SCOUT_STATEMENT)
    && RESULT_SECTIONS.every((section) => sectionLinePattern(section).test(report));
  let existingGameArtifactObserved: string | null = null;
  const candidates = [
    ...(report.match(/(?:[A-Za-z0-9_. -]+[\\/])+[A-Za-z0-9_. -]+\.[A-Za-z0-9]+/g) ?? []),
    ...(report.match(/(?<![A-Za-z0-9_.-])[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [])
  ];
  for (const candidate of candidates) {
    const cleaned = candidate.trim().replace(/^['"`]|['"`,;:)]+$/g, '');
    const absolute = path.isAbsolute(cleaned) ? cleaned : path.join(gameRoot, cleaned.replace(/\//g, path.sep));
    try { if (fs.statSync(absolute).isFile()) { existingGameArtifactObserved = path.relative(gameRoot, absolute); break; } } catch { /* not a real Game file */ }
  }
  return {
    evaluationContractRevision: SCOUT_EVALUATION_CONTRACT_REVISION,
    reportStructurallyUsable: structurallyUsable,
    significantEvidenceMissing: existingGameArtifactObserved ? null : 'No cited path could be mechanically matched to an existing Game file.',
    obviousUnsupportedClaim: null,
    needsDeeperReview: true,
    existingGameArtifactObserved
  };
}

function comparisonMarkdown(completion: InterchangeabilityCompletion): string {
  const byId = (id: string) => completion.attempts.find((attempt) => attempt.executorId === id);
  const anti = byId('antigravity');
  const gemini = byId('gemini-flash-direct');
  const accepted = (attempt: ScoutAttemptTelemetry | undefined) => attempt?.completionState === 'COMPLETE' ? 'YES' : attempt?.completionState === 'BLOCKED' ? 'UNAVAILABLE' : 'NO';
  const both = (predicate: (attempt: ScoutAttemptTelemetry) => boolean) => completion.attempts.length === 2 && completion.attempts.every(predicate) ? 'YES' : 'NO';
  const authority = completion.attempts.some((attempt) => attempt.readOnlyContractHeld === 'UNKNOWN') ? 'UNKNOWN' : both((attempt) => attempt.readOnlyContractHeld === true);
  const contract = both((attempt) => attempt.evaluation.reportStructurallyUsable) ? 'YES' : completion.attempts.some((attempt) => attempt.evaluation.reportStructurallyUsable) ? 'PARTIAL' : 'NO';
  const boundaries = completion.attempts.filter((attempt) => attempt.failureBoundary).map((attempt) => `${attempt.player}: ${attempt.failureBoundary}`).join('; ') || 'None observed.';
  return `# Scout Play Interchangeability Comparison\n\nSAME CANONICAL PLAY: YES\n\nCANONICAL PLAY HASH: ${completion.canonicalPlayHash}\n\nSEMANTIC PROMPT HASH: ${completion.semanticPromptHash}\n\nANTIGRAVITY ACCEPTED PLAY: ${accepted(anti)}\n\nGEMFLASH ACCEPTED PLAY: ${accepted(gemini)}\n\nBOTH READ REAL GAME SOURCE: ${both((attempt) => Boolean(attempt.evaluation.existingGameArtifactObserved))}\n\nBOTH HELD SCOUT AUTHORITY: ${authority}\n\nBOTH SATISFIED RESULT CONTRACT: ${contract}\n\nPLAYER-SPECIFIC PROMPT FORK REQUIRED: NO\n\nPROVIDER-SPECIFIC INVOCATION REQUIRED: YES\n\nINTERCHANGEABILITY PROOF: ${completion.outcome}\n\nFAILURE BOUNDARY: ${boundaries}\n`;
}

export async function runInterchangeabilityProof(input: unknown, options: InterchangeabilityRunnerOptions): Promise<InterchangeabilityCompletion> {
  if (!options.executors.length) throw new Error('At least one Scout executor is required.');
  if (!path.isAbsolute(options.durableReportRoot)) throw new Error('durableReportRoot must be absolute.');
  const envelope = createScoutPlayEnvelope(input);
  const workspacePath = path.join(path.resolve(options.workspaceRoot ?? path.join(envelope.play.gameRoot, 'Scouts')), envelope.play.playId);
  const durablePath = path.join(path.resolve(options.durableReportRoot), envelope.play.playId);
  if (fs.existsSync(workspacePath)) throw new Error(`Play workspace already exists: ${workspacePath}`);
  if (fs.existsSync(durablePath)) throw new Error(`Durable Play evidence folder already exists: ${durablePath}`);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(durablePath, { recursive: true });
  const now = options.now ?? (() => new Date());
  const isoNow = () => now().toISOString();
  const secretValues = [...(options.secretValues ?? []), process.env.GEMINI_API_KEY ?? '', process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ''].filter(Boolean);
  const startedAt = isoNow();
  atomicJson(path.join(workspacePath, 'canonical-play.json'), envelope.play);
  writeText(path.join(workspacePath, 'semantic-prompt.txt'), `${envelope.semanticPrompt}\n`);
  atomicJson(path.join(workspacePath, 'play-identity.json'), { playId: envelope.play.playId, canonicalPlayHash: envelope.playHash, semanticPromptHash: envelope.semanticPromptHash });
  const attempts: ScoutAttemptTelemetry[] = [];

  for (const executor of options.executors) {
    const queuedAt = isoNow();
    const playerPath = path.join(workspacePath, executor.id);
    fs.mkdirSync(playerPath, { recursive: true });
    const stdoutPath = path.join(playerPath, 'stdout.log');
    const stderrPath = path.join(playerPath, 'stderr.log');
    let outcome: ScoutExecutionOutcome;
    try {
      outcome = await executor.execute(envelope, { gameRoot: envelope.play.gameRoot, playerPath });
    } catch (error) {
      outcome = { state: 'FAILED', stdout: '', stderr: error instanceof Error ? error.stack ?? error.message : String(error), exitCode: null, signal: null, readOnlyContractHeld: 'UNKNOWN', failureBoundary: 'Executor threw before returning a normalized result.' };
    }
    if (scoutPlayHash(envelope.play) !== envelope.playHash) throw new Error(`${executor.id} mutated the canonical ScoutPlay.`);
    const endedAt = outcome.endedAt ?? isoNow();
    const safeStdout = redact(outcome.stdout, secretValues);
    const safeStderr = redact(outcome.stderr, secretValues);
    writeText(stdoutPath, safeStdout);
    writeText(stderrPath, safeStderr);
    let reportPath: string | undefined;
    let durableReportPath: string | undefined;
    if (outcome.state === 'COMPLETE' && safeStdout.trim()) {
      reportPath = path.join(playerPath, 'SCOUT-REPORT.md');
      durableReportPath = path.join(durablePath, `${executor.id}-SCOUT-REPORT.md`);
      writeText(reportPath, safeStdout);
      writeText(durableReportPath, safeStdout);
    }
    const telemetry: ScoutAttemptTelemetry = {
      scoutPlayId: envelope.play.playId,
      canonicalPlayHash: envelope.playHash,
      semanticPromptHash: envelope.semanticPromptHash,
      player: executor.player,
      executorId: executor.id,
      harness: executor.harness,
      provider: executor.provider,
      model: outcome.model,
      effort: outcome.effort,
      taskClass: envelope.play.taskClass,
      queuedAt,
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
      failureBoundary: outcome.failureBoundary,
      stdoutPath,
      stderrPath,
      reportPath,
      durableReportPath,
      evaluation: evaluateScoutReport(safeStdout, envelope.play.gameRoot)
    };
    attempts.push(telemetry);
    atomicJson(path.join(playerPath, 'telemetry.json'), telemetry);
  }

  const complete = attempts.filter((attempt) => attempt.completionState === 'COMPLETE').length;
  const outcome: InterchangeabilityCompletion['outcome'] = complete === options.executors.length && options.executors.length === 2 ? 'PASS' : complete > 0 || attempts.some((attempt) => attempt.completionState === 'BLOCKED') ? 'PARTIAL' : 'FAIL';
  const completion: InterchangeabilityCompletion = {
    schemaVersion: 1,
    playId: envelope.play.playId,
    canonicalPlayHash: envelope.playHash,
    semanticPromptHash: envelope.semanticPromptHash,
    gameRoot: envelope.play.gameRoot,
    workspacePath,
    durablePath,
    maxConcurrency: 1,
    runOrder: options.executors.map((executor) => executor.id),
    startedAt,
    endedAt: isoNow(),
    attempts,
    outcome
  };
  atomicJson(path.join(workspacePath, 'completion.json'), completion);
  atomicJson(path.join(durablePath, 'SCOUT-PLAY-COMPLETE.json'), completion);
  const comparison = comparisonMarkdown(completion);
  writeText(path.join(workspacePath, 'INTERCHANGEABILITY-COMPARISON.md'), comparison);
  writeText(path.join(durablePath, 'INTERCHANGEABILITY-COMPARISON.md'), comparison);
  return completion;
}

function runProcess(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; startedAt: string; endedAt: string }> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let child;
    try { child = spawn(command, [...args], { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ code: null, signal: null, stdout, stderr: String(error), startedAt, endedAt: new Date().toISOString() }); return; }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => { stderr += `${error.stack ?? error.message}\n`; });
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr, startedAt, endedAt: new Date().toISOString() }));
  });
}

export function providerFailure(text: string): { providerError?: string; quotaEvent?: string } {
  const cleaned = text.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // OpenCode sometimes prints a useful provider/harness failure in its log
  // line and then follows it with only `Error: { ... UnknownError ... }` on
  // the public CLI stream. Prefer the specific line, and reconstruct the
  // structured public error when that is all the harness supplied. Returning
  // only the first `Error: {` line destroys the evidence needed to distinguish
  // provider/auth/harness failures from Player quality.
  const specific = lines.find((line) => /provider.?model.?not.?found|model not found|provider not found|free tier|api key|credential|unauthorized|forbidden|rate.?limit|quota|resource.?exhausted|429/i.test(line));
  let structured: string | undefined;
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      const value = JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as { name?: unknown; data?: { message?: unknown; ref?: unknown } };
      const name = typeof value.name === 'string' ? value.name : undefined;
      const message = typeof value.data?.message === 'string' ? value.data.message : undefined;
      const ref = typeof value.data?.ref === 'string' ? value.data.ref : undefined;
      structured = [name, message, ref ? `reference ${ref}` : undefined].filter(Boolean).join(': ');
    } catch { /* Non-JSON provider text is handled by the line matcher below. */ }
  }
  const generic = lines.find((line) => /(?:error|failed|failure|rejected|invalid|unauthenticated|forbidden|denied)/i.test(line));
  const error = (specific ?? structured ?? generic)?.slice(0, 1_000);
  const quota = /(?:rate.?limit|quota|resource.?exhausted|429)/i.test(cleaned)
    ? lines.find((line) => /(?:rate.?limit|quota|resource.?exhausted|429)/i.test(line))?.slice(0, 1_000) ?? 'Rate-limit or quota signal observed.'
    : undefined;
  return { providerError: error, quotaEvent: quota };
}

export interface DirectGeminiExecutorOptions {
  readonly model?: string;
  readonly agent?: string;
  readonly configDir: string;
  readonly opencodeExecutable?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Fail closed unless the direct-provider agent exposes the proven read-only tool policy. */
export function validateDirectGeminiAgent(configDir: string, agent: string): void {
  const agentFile = path.join(path.resolve(configDir), 'agents', `${agent}.md`);
  let source: string;
  try { source = fs.readFileSync(agentFile, 'utf8'); }
  catch { throw new Error(`Direct Gemini Scout agent is missing: ${agentFile}`); }
  const frontmatter = source.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const required = [
    /^mode:\s*primary\s*$/m,
    /^permission:\s*$/m,
    /^\s+["']?\*["']?:\s*deny\s*$/m,
    /^\s+read:\s*$/m,
    /^\s+glob:\s*allow\s*$/m,
    /^\s+grep:\s*allow\s*$/m,
    /^\s+list:\s*allow\s*$/m,
    /^\s+external_directory:\s*deny\s*$/m
  ];
  if (!frontmatter || required.some((pattern) => !pattern.test(frontmatter))) throw new Error(`Direct Gemini Scout agent is not provably read-only: ${agentFile}`);
  if (/^\s+(?:bash|shell|write|edit|patch):\s*(?!deny\s*$)\S+/m.test(frontmatter)) throw new Error(`Direct Gemini Scout agent grants a mutating tool: ${agentFile}`);
}

export function createDirectGeminiExecutor(options: DirectGeminiExecutorOptions): ScoutPlayExecutor {
  const model = options.model ?? 'google/gemini-3.8-flash';
  const agent = options.agent ?? 'sideline-gemini-direct-scout';
  return {
    id: 'gemini-flash-direct', player: 'Gemini Flash Direct', harness: 'OpenCode', provider: 'Google Gemini API',
    async execute(envelope, context) {
      try { validateDirectGeminiAgent(options.configDir, agent); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { state: 'BLOCKED', stdout: '', stderr: `${message}\n`, model, exitCode: null, signal: null, readOnlyContractHeld: false, failureBoundary: `AUTHORITY BLOCKED: ${message}` };
      }
      const sourceEnv = { ...process.env, ...options.env };
      const key = sourceEnv.GOOGLE_GENERATIVE_AI_API_KEY || sourceEnv.GEMINI_API_KEY;
      if (!key) return { state: 'BLOCKED', stdout: '', stderr: 'Google Gemini credential is not available to this process. No provider request was made.\n', model, exitCode: null, signal: null, readOnlyContractHeld: true, failureBoundary: 'PROVIDER BLOCKED: missing process-local Google Gemini credential.' };
      const env = { ...sourceEnv, GOOGLE_GENERATIVE_AI_API_KEY: key, OPENCODE_CONFIG_DIR: path.resolve(options.configDir) };
      const executable = options.opencodeExecutable ?? resolveOpenCodeExecutable();
      const preflight = await runProcess(executable, ['models', 'google'], context.gameRoot, env);
      if (preflight.code !== 0 || !preflight.stdout.split(/\r?\n/).map((line) => line.trim()).includes(model)) {
        const detail = `${preflight.stdout}\n${preflight.stderr}`;
        const failure = providerFailure(detail);
        return { state: 'BLOCKED', stdout: '', stderr: detail, model, startedAt: preflight.startedAt, endedAt: preflight.endedAt, exitCode: preflight.code, signal: preflight.signal, readOnlyContractHeld: true, ...failure, failureBoundary: `COMPATIBILITY BLOCKED: ${model} was not confirmed by the installed OpenCode Google provider.` };
      }
      const run = await runProcess(executable, ['run', '--agent', agent, '--model', model, '--format', 'default', '--dir', context.gameRoot, envelope.semanticPrompt], context.gameRoot, env);
      const failure = providerFailure(run.stderr);
      return {
        state: run.signal ? 'INTERRUPTED' : run.code === 0 ? 'COMPLETE' : run.code === null ? 'UNKNOWN' : 'FAILED',
        stdout: run.stdout, stderr: run.stderr, model, startedAt: run.startedAt, endedAt: run.endedAt, exitCode: run.code, signal: run.signal,
        readOnlyContractHeld: true, ...failure,
        failureBoundary: run.code === 0 ? undefined : 'Google/OpenCode execution process did not complete successfully.'
      };
    }
  };
}

export interface AntiGravityExecutorOptions {
  /** Explicit proof-run selection; AntiGravity itself is not synonymous with any model family. */
  readonly model: string;
  readonly effort?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Optional custom main agent below the semantic ScoutPlay contract. */
  readonly agent?: string;
  /** Verification seams for an artifact-owned primary workspace. */
  readonly executionRoot?: (context: ScoutExecutorContext) => string;
  readonly additionalDirectories?: (context: ScoutExecutorContext) => readonly string[];
}

export function createAntiGravityExecutor(options: AntiGravityExecutorOptions): ScoutPlayExecutor {
  const requestedModel = options.model;
  const requestedEffort = options.effort ?? 'medium';
  return {
    id: 'antigravity', player: 'AntiGravity', harness: 'AntiGravity CLI', provider: 'AntiGravity',
    async execute(envelope, context) {
      const processEvents: PrintTurnProcessEvent[] = [];
      const additions = options.additionalDirectories?.(context) ?? [];
      const prefixArgs = additions.flatMap((directory) => ['--add-dir', directory]);
      const factory = createAntiGravityControlFactory({ env: options.env, prefixArgs, onTurnProcess: (event) => processEvents.push(event) });
      let control;
      try {
        const executionRoot = options.executionRoot?.(context) ?? context.gameRoot;
        control = await factory.open({ instanceId: `scout-${envelope.play.playId}`, playerType: 'antigravity', seat: 1, gameRoot: executionRoot, authority: { permission: 'read-only-scout' } });
        const capability = await control.queryCapabilities?.();
        const available = capability?.models.find((entry) => entry.id === requestedModel);
        if (!available || !available.supportedEfforts.includes(requestedEffort)) {
          await control.close();
          return { state: 'BLOCKED', stdout: '', stderr: `AntiGravity live capability did not include ${requestedModel} at ${requestedEffort} effort.\n`, model: requestedModel, effort: requestedEffort, exitCode: null, signal: null, readOnlyContractHeld: true, failureBoundary: 'PLAYER UNAVAILABLE / CAPACITY BLOCKED: requested AntiGravity model/effort absent from live capability.' };
        }
        const messages: string[] = [];
        const diagnostics: string[] = [];
        let terminal: Extract<ControlEvent, { kind: 'turn' }> | undefined;
        let release!: () => void;
        const done = new Promise<void>((resolve) => { release = resolve; });
        const unsubscribe = control.onEvent((event) => {
          if (event.kind === 'progress' && event.category === 'message') messages.push(event.summary);
          else if (event.kind === 'progress' || event.kind === 'request') diagnostics.push(event.summary);
          if (event.kind === 'turn' && ['completed', 'failed', 'interrupted', 'unknown'].includes(event.state)) { terminal = event; release(); }
        });
        const delivery = await control.deliver(envelope.semanticPrompt, envelope.playHash.slice(-16), { model: requestedModel, effort: requestedEffort, agent: options.agent });
        if (delivery.kind !== 'accepted') {
          unsubscribe();
          await control.close();
          return { state: delivery.kind === 'refused' ? 'BLOCKED' : 'UNKNOWN', stdout: '', stderr: delivery.kind === 'refused' ? delivery.message : delivery.reason, model: requestedModel, effort: requestedEffort, exitCode: null, signal: null, readOnlyContractHeld: true, failureBoundary: `AntiGravity did not accept the canonical Play: ${delivery.kind}.` };
        }
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([done, new Promise<void>((resolve) => { timer = setTimeout(resolve, options.timeoutMs ?? 30 * 60_000); })]);
        if (timer) clearTimeout(timer);
        if (!terminal) {
          await control.interrupt?.();
          diagnostics.push('Runner timeout expired; the controlled turn was interrupted.');
        }
        unsubscribe();
        const actualModel = control.model ?? requestedModel;
        const actualEffort = control.effort ?? requestedEffort;
        await control.close();
        const started = processEvents.find((event) => event.phase === 'started');
        const closed = [...processEvents].reverse().find((event) => event.phase === 'closed');
        const state: InterchangeabilityState = !terminal ? 'INTERRUPTED' : terminal.state === 'completed' ? 'COMPLETE' : terminal.state === 'failed' ? 'FAILED' : terminal.state === 'interrupted' ? 'INTERRUPTED' : 'UNKNOWN';
        const stderr = `${closed?.phase === 'closed' ? closed.stderr : ''}${diagnostics.length ? `\n${diagnostics.join('\n')}` : ''}`;
        const failure = providerFailure(closed?.phase === 'closed' ? closed.stderr : '');
        return { state, stdout: messages.join(''), stderr, model: actualModel, effort: actualEffort, startedAt: started?.startedAt, endedAt: closed?.phase === 'closed' ? closed.endedAt : new Date().toISOString(), exitCode: closed?.phase === 'closed' ? closed.code : null, signal: closed?.phase === 'closed' ? closed.signal : null, readOnlyContractHeld: true, ...failure, failureBoundary: state === 'COMPLETE' ? undefined : terminal?.summary ?? 'AntiGravity controlled turn did not report successful completion.' };
      } catch (error) {
        await control?.close().catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        return { state: 'BLOCKED', stdout: '', stderr: `${message}\n`, model: requestedModel, effort: requestedEffort, exitCode: null, signal: null, readOnlyContractHeld: 'UNKNOWN', providerError: message, failureBoundary: `PLAYER UNAVAILABLE / CAPACITY BLOCKED: ${message}` };
      }
    }
  };
}
