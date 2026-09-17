import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createAntiGravityExecutor,
  runInterchangeabilityProof,
  type ScoutAttemptTelemetry,
  type ScoutPlayExecutor
} from './scout-interchangeability-runner';

/**
 * WAS: Player readiness required manual capability probes, hand-authored Play
 * ids, manual Scout launches and human interpretation of telemetry folders.
 * IS: one verification action creates and runs a real provider-neutral Play,
 * evaluates field evidence and persists READY / NEEDS ATTENTION / UNKNOWN.
 * WHY: reusable readiness truth belongs above Player adapters. Future routing
 * and a Provider Connection Doctor may consume it, but neither is built here.
 */

export type ScoutVerificationState = 'READY' | 'NEEDS ATTENTION' | 'UNKNOWN';
export type ScoutVerificationPlayer = 'antigravity' | 'gemini-flash-direct';

export interface ScoutPlayerVerification {
  readonly schemaVersion: 1;
  readonly playerId: ScoutVerificationPlayer;
  readonly player: string;
  readonly state: ScoutVerificationState;
  readonly reason?: string;
  readonly nextAction?: string;
  readonly lastVerifiedAt: string;
  readonly provider: string;
  readonly model?: string;
  readonly effort?: string;
  readonly scoutAuthority: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  readonly realGameRead: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  readonly lastReception: 'PASS' | 'FAIL' | 'UNKNOWN';
  readonly lifecycle: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  readonly reportContract: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  readonly playId: string;
  readonly canonicalPlayHash: string;
  readonly evidencePath: string;
  readonly reportPath?: string;
  readonly failureBoundary?: string;
}

export interface VerifyScoutPlayerOptions {
  readonly player: ScoutVerificationPlayer;
  readonly gameRoot: string;
  readonly durableReportRoot: string;
  readonly workspaceRoot?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly now?: () => Date;
  /** Automated-test seam; production resolves the existing Player adapter. */
  readonly executor?: ScoutPlayExecutor;
}

const ANTI_AGENT = 'sideline-read-only-verification-scout';
const REQUIRED_SECTIONS = ['Executive answer', 'FACTS', 'INFERENCES', 'UNKNOWNS', 'CONTRADICTIONS', 'Relevant files / symbols', 'Recommended next step', 'Provenance'];

function timestampParts(date: Date): { stamp: string; zone: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const zone = value('timeZoneName').replace(/[^A-Za-z0-9+-]/g, '') || 'America-Edmonton';
  return { stamp: `${value('year')}-${value('month')}-${value('day')}_${value('hour')}${value('minute')}${value('second')}_${String(date.getMilliseconds()).padStart(3, '0')}`, zone };
}

export function freshVerificationPlayId(player: ScoutVerificationPlayer, date = new Date()): string {
  const { stamp, zone } = timestampParts(date);
  const label = player === 'antigravity' ? 'AntiGravity' : 'GemFlash-Direct';
  return `TTA-Scout-Verify-${label}__${stamp}_${zone}`;
}

export function verificationScoutPlay(playId: string, gameRoot: string): object {
  return {
    playId,
    gameRoot,
    taskClass: 'player-readiness-verification',
    objective: 'Inspect the current file "FILE examples/Skool Chat Test.txt". Identify the exact function that computes message identity, state its inputs and return mechanism, and name one evidence-backed limitation visible in that function. Keep the answer bounded to this function and its immediate evidence.',
    scope: ['FILE examples/Skool Chat Test.txt.', 'Only the message-identity function and its immediate evidence.'],
    nonGoals: ['Do not trace the full sync architecture.', 'Do not inspect historical reports.', 'Do not design or implement a fix.', 'Do not modify files, run commands, use web tools, or launch subagents.'],
    authority: {
      mode: 'read-only-reconnaissance',
      allowed: ['Read and search inside the supplied Game workspace.', 'Reason over the one bounded current source example.', 'Return report text to the trusted Runner.'],
      denied: ['Write, edit, create, delete, or rename Game files.', 'Execute commands or mutate git.', 'Use network, MCP, browser, or subagent tools.', 'Broaden the bounded objective.']
    },
    evidenceContract: ['Cite the exact Game-relative path and exact function name.', 'Distinguish FACT, INFERENCE, UNKNOWN, and CONTRADICTION.', 'Do not claim runtime behavior that static evidence cannot prove.'],
    reportContract: {
      requiredStatement: 'This report is reconnaissance, not final architectural authority.',
      sections: REQUIRED_SECTIONS
    }
  };
}

function agentDefinition(): string {
  return `---\nname: ${ANTI_AGENT}\ndescription: Sideline read-only Scout Player verification\nmainAgent: true\nsubagent: false\ntools:\n  - view_file\n  - grep_search\n  - code_search\n---\n\nYou are a temporary Sideline Coach read-only reconnaissance Scout.\nUse only the tools declared above. Never write files, execute commands, browse the web, invoke MCP, launch subagents, or broaden the supplied ScoutPlay. Return the exact report contract requested by the semantic Play and stop.\n`;
}

function withArtifactAgent(executor: ScoutPlayExecutor): ScoutPlayExecutor {
  return {
    ...executor,
    async execute(envelope, context) {
      const agentPath = path.join(context.playerPath, '.agents', 'agents', ANTI_AGENT);
      fs.mkdirSync(agentPath, { recursive: true });
      fs.writeFileSync(path.join(agentPath, 'agent.md'), agentDefinition(), 'utf8');
      return executor.execute(envelope, context);
    }
  };
}

export function evaluateReadiness(attempt: ScoutAttemptTelemetry): Omit<ScoutPlayerVerification, 'schemaVersion' | 'playerId' | 'lastVerifiedAt' | 'playId' | 'canonicalPlayHash' | 'evidencePath'> {
  const scoutAuthority = attempt.readOnlyContractHeld === true ? 'VERIFIED' : attempt.readOnlyContractHeld === false ? 'FAILED' : 'UNKNOWN';
  const realGameRead = attempt.evaluation.existingGameArtifactObserved ? 'VERIFIED' : attempt.completionState === 'COMPLETE' ? 'UNKNOWN' : 'FAILED';
  const lifecycle = attempt.completionState === 'COMPLETE' && attempt.processExitCode === 0 && attempt.terminationSignal === null
    ? 'VERIFIED' : attempt.completionState === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED';
  const reportContract = attempt.reportCreated && attempt.evaluation.reportStructurallyUsable ? 'VERIFIED'
    : attempt.completionState === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED';
  const ready = Boolean(attempt.model) && scoutAuthority === 'VERIFIED' && realGameRead === 'VERIFIED' && lifecycle === 'VERIFIED' && reportContract === 'VERIFIED';
  let state: ScoutVerificationState = ready ? 'READY' : 'NEEDS ATTENTION';
  let reason: string | undefined;
  let nextAction: string | undefined;
  if (!ready) {
    if (attempt.completionState === 'UNKNOWN' || scoutAuthority === 'UNKNOWN' || lifecycle === 'UNKNOWN') {
      state = 'UNKNOWN';
      reason = attempt.failureBoundary ?? 'Sideline could not prove the Player lifecycle or Scout authority.';
      nextAction = 'Inspect the preserved provider diagnostics; do not assume readiness.';
    } else if (!attempt.model) {
      state = 'UNKNOWN';
      reason = 'Sideline could not identify the executed model.';
      nextAction = 'Verify provider capability/launch observability.';
    } else if (attempt.completionState !== 'COMPLETE') {
      reason = attempt.failureBoundary ?? attempt.providerError ?? `Player ended ${attempt.completionState}.`;
      nextAction = 'Fix the reported Player/provider boundary, then verify once.';
    } else if (scoutAuthority !== 'VERIFIED') {
      reason = 'The read-only Scout authority was not proven.';
      nextAction = 'Repair the Player authority adapter before another reception.';
    } else if (reportContract !== 'VERIFIED') {
      reason = 'The reception did not satisfy the common Scout report contract.';
      nextAction = 'Inspect the preserved report and provider diagnostics.';
    } else {
      state = 'UNKNOWN';
      reason = 'The report did not contain a mechanically verifiable citation to a real Game file.';
      nextAction = 'Inspect why the Scout could not cite current Game evidence.';
    }
  }
  return {
    player: attempt.player,
    state,
    reason,
    nextAction,
    provider: attempt.provider,
    model: attempt.model,
    effort: attempt.effort,
    scoutAuthority,
    realGameRead,
    lastReception: ready ? 'PASS' : state === 'UNKNOWN' ? 'UNKNOWN' : 'FAIL',
    lifecycle,
    reportContract,
    reportPath: attempt.durableReportPath,
    failureBoundary: attempt.failureBoundary
  };
}

function atomicJson(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

export async function verifyScoutPlayer(options: VerifyScoutPlayerOptions): Promise<ScoutPlayerVerification> {
  if (options.player !== 'antigravity') throw new Error(`${options.player} verification is not implemented in V0.2.`);
  const now = options.now ?? (() => new Date());
  const playId = freshVerificationPlayId(options.player, now());
  const baseExecutor = options.executor ?? createAntiGravityExecutor({
    model: options.model ?? 'gemini-3.8-flash',
    effort: options.effort ?? 'medium',
    agent: ANTI_AGENT,
    executionRoot: (context) => context.playerPath,
    additionalDirectories: (context) => [context.gameRoot]
  });
  const executor = options.executor ? baseExecutor : withArtifactAgent(baseExecutor);
  const completion = await runInterchangeabilityProof(verificationScoutPlay(playId, options.gameRoot), {
    workspaceRoot: options.workspaceRoot,
    durableReportRoot: options.durableReportRoot,
    executors: [executor],
    now
  });
  const attempt = completion.attempts[0];
  const evaluated = evaluateReadiness(attempt);
  const verification: ScoutPlayerVerification = {
    schemaVersion: 1,
    playerId: options.player,
    ...evaluated,
    lastVerifiedAt: completion.endedAt,
    playId,
    canonicalPlayHash: completion.canonicalPlayHash,
    evidencePath: completion.durablePath
  };
  atomicJson(path.join(completion.workspacePath, 'PLAYER-VERIFICATION.json'), verification);
  atomicJson(path.join(completion.durablePath, 'PLAYER-VERIFICATION.json'), verification);
  const indexRoot = path.join(path.resolve(options.durableReportRoot), 'Player Verification');
  fs.mkdirSync(indexRoot, { recursive: true });
  atomicJson(path.join(indexRoot, `${options.player}.json`), verification);
  return verification;
}
