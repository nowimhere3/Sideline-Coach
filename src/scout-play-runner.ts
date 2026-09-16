import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
}

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
}

export interface ScoutPlayCompletion {
  schemaVersion: 1;
  playId: string;
  gameRoot: string;
  workspacePath: string;
  durableReportPath: string;
  startedAt: string;
  endedAt: string;
  maxConcurrency: number;
  scoutsRequested: number;
  scoutsCompleted: number;
  scoutsFailed: number;
  scoutsInterrupted: number;
  scoutsUnknown: number;
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

export interface ScoutRunnerOptions {
  workspaceRoot?: string;
  durableReportRoot: string;
  opencodeExecutable?: string;
  commandForScout?: (scout: ScoutDefinition, prompt: string, gameRoot: string) => ScoutCommand;
  now?: () => Date;
  signal?: AbortSignal;
  onStateChange?: (result: Readonly<ScoutResult>) => void;
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
  return { playId: play.playId, gameRoot: path.resolve(play.gameRoot), maxConcurrency: play.maxConcurrency as number, scouts };
}

export function buildScoutPrompt(play: ScoutPlayDefinition, scout: ScoutDefinition): string {
  return `SCOUT PLAY - READ-ONLY RECONNAISSANCE\n\nPlay ID: ${play.playId}\nScout ID: ${scout.id}\nAssigned custom agent: ${scout.agent}\nAssigned model: ${SCOUT_ROSTER[scout.agent]}\nGame root: ${play.gameRoot}\n\nBOUNDED OBJECTIVE\n${scout.objective}\n\nREAD-ONLY CONTRACT\nYou are a temporary Sideline Coach reconnaissance Scout. Investigate only the bounded objective above. Follow the Game's current Scout SOP / ROASTER. Do not edit, create, delete, or rename Game files; do not execute shell commands; do not mutate git; do not install packages; do not implement fixes; do not launch subagents; and do not change configuration or runtime state. Return the complete report in this response. The trusted Runner, not you, will persist it.\n\nYour report must identify the Scout agent and exact model, state that it is reconnaissance rather than final architectural authority, distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION where relevant, cite exact evidence, include limitations, and stop when this objective is complete.`;
}

/** Fail closed if the Game does not expose the proven read-only custom agent. */
export function validateScoutAgentContract(gameRoot: string, scout: ScoutDefinition): void {
  const agentFile = path.join(gameRoot, '.opencode', 'agents', `${scout.agent}.md`);
  let source: string;
  try { source = fs.readFileSync(agentFile, 'utf8'); }
  catch { throw new Error(`Read-only Scout agent definition is missing: ${agentFile}`); }
  const frontmatter = source.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
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

function playOutcome(results: ScoutResult[]): ScoutPlayCompletion['outcome'] {
  if (results.every((result) => result.state === 'COMPLETE')) return 'COMPLETE';
  if (results.some((result) => result.state === 'COMPLETE')) return 'PARTIAL';
  if (results.some((result) => result.state === 'INTERRUPTED')) return 'INTERRUPTED';
  if (results.some((result) => result.state === 'UNKNOWN')) return 'UNKNOWN';
  return 'FAILED';
}

/**
 * Runs one explicitly assigned Scout formation. The runner is the only writer:
 * child processes receive the Game as cwd while their custom agents deny all
 * mutating tools. Output is captured from process pipes, never a terminal.
 */
export async function runScoutPlay(input: unknown, options: ScoutRunnerOptions): Promise<ScoutPlayCompletion> {
  const play = validateScoutPlay(input);
  if (!options?.durableReportRoot || !path.isAbsolute(options.durableReportRoot)) throw new Error('durableReportRoot must be an absolute path.');
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.join(play.gameRoot, 'Scouts'));
  const workspacePath = path.join(workspaceRoot, play.playId);
  const durablePath = path.join(path.resolve(options.durableReportRoot), play.playId);
  play.scouts.forEach((scout) => validateScoutAgentContract(play.gameRoot, scout));
  if (fs.existsSync(workspacePath)) throw new Error(`Play workspace already exists: ${workspacePath}`);
  if (fs.existsSync(durablePath)) throw new Error(`Durable Play report folder already exists: ${durablePath}`);

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(durablePath, { recursive: true });
  const now = options.now ?? (() => new Date());
  const isoNow = () => now().toISOString();
  const startedAt = isoNow();
  const active = new Set<child_process.ChildProcess>();
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
      stderrPath: path.join(scoutPath, 'stderr.log')
    };
    writeText(path.join(scoutPath, 'objective.txt'), `${scout.objective}\n`);
    writeText(path.join(scoutPath, 'prompt.txt'), `${buildScoutPrompt(play, scout)}\n`);
    writeText(result.stdoutPath, '');
    writeText(result.stderrPath, '');
    return result;
  });
  atomicJson(path.join(workspacePath, 'play.json'), { ...play, startedAt });
  const publish = (result: ScoutResult) => {
    atomicJson(path.join(workspacePath, result.id, 'lifecycle.json'), result);
    options.onStateChange?.({ ...result });
  };
  results.forEach(publish);

  let abortRequested = options.signal?.aborted ?? false;
  const abort = () => {
    abortRequested = true;
    for (const child of active) if (!child.killed) child.kill();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  const execute = (result: ScoutResult): Promise<void> => new Promise((resolve) => {
    if (abortRequested) {
      result.state = 'INTERRUPTED';
      result.endedAt = isoNow();
      publish(result);
      resolve();
      return;
    }
    const scout = play.scouts.find((item) => item.id === result.id)!;
    const prompt = buildScoutPrompt(play, scout);
    const command = options.commandForScout?.(scout, prompt, play.gameRoot)
      ?? defaultCommand(options.opencodeExecutable ?? resolveOpenCodeExecutable(), scout, prompt, play.gameRoot);
    result.state = 'RUNNING';
    result.startedAt = isoNow();
    publish(result);
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(command.command, command.args, {
        cwd: play.gameRoot,
        env: process.env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      fs.appendFileSync(result.stderrPath, `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      result.state = 'FAILED';
      result.endedAt = isoNow();
      publish(result);
      resolve();
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
      result.state = abortRequested || signal ? 'INTERRUPTED' : spawnError || (typeof code === 'number' && code !== 0) ? 'FAILED' : code === 0 ? 'COMPLETE' : 'UNKNOWN';
      if (result.state === 'COMPLETE') {
        const report = path.join(workspacePath, result.id, artifactName(result.id));
        fs.copyFileSync(result.stdoutPath, report);
        result.reportPath = report;
        const durableReport = path.join(durablePath, artifactName(result.id));
        fs.copyFileSync(report, durableReport);
        result.durableReportPath = durableReport;
      }
      publish(result);
      resolve();
    });
  });

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

  const completion: ScoutPlayCompletion = {
    schemaVersion: 1,
    playId: play.playId,
    gameRoot: play.gameRoot,
    workspacePath,
    durableReportPath: durablePath,
    startedAt,
    endedAt: isoNow(),
    maxConcurrency: play.maxConcurrency,
    scoutsRequested: results.length,
    scoutsCompleted: results.filter((result) => result.state === 'COMPLETE').length,
    scoutsFailed: results.filter((result) => result.state === 'FAILED').length,
    scoutsInterrupted: results.filter((result) => result.state === 'INTERRUPTED').length,
    scoutsUnknown: results.filter((result) => result.state === 'UNKNOWN').length,
    outcome: playOutcome(results),
    scouts: results
  };
  atomicJson(path.join(workspacePath, 'completion.json'), completion);
  atomicJson(path.join(durablePath, 'SCOUT-PLAY-COMPLETE.json'), completion);
  return completion;
}
