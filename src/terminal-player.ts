/**
 * Terminal as a first-class Player (P0.1).
 *
 *   Player type      Terminal
 *   execution type   direct shell (the exact text is the command)
 *   model/reasoning  not applicable — no provider, no quota
 *
 * Terminal is on the Team, but it is not a reasoning Player. Coach never turns a
 * sentence into shell code: what the human approves is what the shell receives,
 * byte for byte (NUL bytes excepted). This module only refuses text that is
 * plainly a request for a reasoning Player, so a vague sentence can never be run
 * as a command by accident. It is a guard, not a parser — Unknown stays allowed.
 *
 * No `vscode` import: shared by the Stadium, tests and (mirrored) the page.
 */

import { sanitizeActivityText, sessionKeyFor } from './player-activity';

export const TERMINAL_EXECUTION = Object.freeze({
  executionType: 'direct-shell',
  model: 'not-applicable',
  reasoning: 'not-applicable',
  provider: 'none'
} as const);

export type TerminalCommandCheck =
  | { ok: true; command: string }
  | { ok: false; reason: 'empty' | 'natural-language'; message: string };

/** Openers of a request to a person or an AI — never a shell verb in this contract. */
const REQUEST_OPENERS = new Set([
  'please', 'can', 'could', 'would', 'should', 'why', 'how', 'what', 'when', 'where', 'who',
  'figure', 'explain', 'investigate', 'tell', 'hey', 'hi', 'i', "i'm", 'we', 'let\'s', 'lets'
]);

/** Characters that make text unmistakably shell syntax. */
const SHELL_SYNTAX = /[|<>;&$=`\\/]|(^|\s)--?[a-z]/i;

export function checkTerminalCommand(text: string): TerminalCommandCheck {
  const command = text.replace(/\u0000/g, '');
  if (!command.trim()) {
    return { ok: false, reason: 'empty', message: 'Type the exact command Terminal should run.' };
  }
  const firstLine = command.trim().split(/\r?\n/, 1)[0];
  const words = firstLine.split(/\s+/).filter(Boolean);
  const opener = words[0]?.toLowerCase().replace(/[,.!?:]+$/, '') ?? '';
  const readsAsRequest = words.length >= 3 && REQUEST_OPENERS.has(opener) && !SHELL_SYNTAX.test(firstLine);
  const endsAsQuestion = words.length >= 3 && /\?\s*$/.test(firstLine) && !SHELL_SYNTAX.test(firstLine);
  if (readsAsRequest || endsAsQuestion) {
    return {
      ok: false,
      reason: 'natural-language',
      message: 'Terminal runs exact commands, and that reads like a request. Send it to Claude, Codex or AntiGravity — or type the command itself.'
    };
  }
  return { ok: true, command };
}

/** Human outcome for a finished shell command. Unknown when the shell did not report an exit code. */
export function describeTerminalExit(exitCode: number | undefined): { state: 'completed' | 'failed' | 'unknown'; summary: string } {
  if (exitCode === undefined) return { state: 'unknown', summary: 'Finished — exit code not reported' };
  return exitCode === 0
    ? { state: 'completed', summary: 'Completed · exit code 0' }
    : { state: 'failed', summary: `Failed · exit code ${exitCode}` };
}

// ---------------------------------------------------------------------------
// Live output (V1 T2)
//
// A terminal session is not a provider conversation. Its identity derives from
// `shellPid:shellStartedAt`; only the opaque digest ever leaves the host. A new
// shell means a new activity transcript.
// ---------------------------------------------------------------------------

/** The Dad-facing words when a command's output cannot be watched. No plumbing vocabulary. */
export const TERMINAL_OUTPUT_UNAVAILABLE_SENT = 'Command sent · live output unavailable';
export const TERMINAL_OUTPUT_UNAVAILABLE_RUNNING = 'Command running · live output unavailable';
export const TERMINAL_OUTPUT_STOPPED_EARLY = 'Live output stopped early';

/** Bounds on what one command may push onto the activity rail. The daemon still keeps only its own 300. */
export const TERMINAL_OUTPUT_MAX_LINES_PER_SECOND = 500;
export const TERMINAL_OUTPUT_MAX_LINES_PER_COMMAND = 2_000;
/** A line with no newline for this long is emitted anyway, so a runaway line cannot grow without bound. */
export const TERMINAL_PENDING_LINE_MAX = 8_000;

export interface TerminalSessionFacts { shellPid: number; shellStartedAt: string }

/** Host-local semantic reference for one running shell. Never sent anywhere as-is. */
export function terminalSessionRef(shell: TerminalSessionFacts | undefined): string | undefined {
  return shell ? `${shell.shellPid}:${shell.shellStartedAt}` : undefined;
}

/** Opaque activity session key (same digest rule as provider sessions); undefined until provenance exists. */
export function terminalSessionKey(shell: TerminalSessionFacts | undefined): string | undefined {
  return sessionKeyFor(terminalSessionRef(shell));
}

/** Keep what a terminal would finally show for a run of `\r` repaints; a trailing `\r` is preserved for the next chunk. */
function collapseCarriageReturns(text: string): string {
  const segments = text.split('\r');
  let visible = '';
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i]) { visible = segments[i]; break; }
  }
  return text.endsWith('\r') ? `${visible}\r` : visible;
}

/**
 * `execution.read()` yields raw chunks whose boundaries are not line boundaries. This holds the
 * incomplete tail until the next chunk (or `flush`) and only ever hands back whole lines.
 */
export class TerminalLineAssembler {
  private pending = '';

  push(chunk: string): string[] {
    const parts = (this.pending + chunk).split('\n');
    this.pending = parts.pop() ?? '';
    if (this.pending.length > TERMINAL_PENDING_LINE_MAX) {
      // Progress bars repaint one line with `\r` forever; only the last repaint can matter.
      this.pending = collapseCarriageReturns(this.pending);
      while (this.pending.length > TERMINAL_PENDING_LINE_MAX) {
        parts.push(this.pending.slice(0, TERMINAL_PENDING_LINE_MAX));
        this.pending = this.pending.slice(TERMINAL_PENDING_LINE_MAX);
      }
    }
    return parts;
  }

  flush(): string[] {
    const rest = this.pending;
    this.pending = '';
    return rest ? [rest] : [];
  }
}

/**
 * One assembled raw line → the single line a human should read, or undefined when nothing visible
 * remains. `\r` repaints collapse to their last visible segment; ANSI/control stripping, secret
 * redaction and the length cap are owned by the shared activity boundary, not repeated here.
 */
export function projectTerminalLine(rawLine: string): string | undefined {
  const segments = rawLine.split('\r');
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const text = sanitizeActivityText(segments[i], 'output');
    if (text.trim()) return text;
  }
  return undefined;
}

/** Simple bounded output budget for one command. Overflow is counted, never silently forgotten. */
export class TerminalOutputBudget {
  private windowStartedAt = Number.NEGATIVE_INFINITY;
  private inWindow = 0;
  private admitted = 0;
  private droppedLines = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly perSecond = TERMINAL_OUTPUT_MAX_LINES_PER_SECOND,
    private readonly perCommand = TERMINAL_OUTPUT_MAX_LINES_PER_COMMAND
  ) {}

  admit(): boolean {
    const at = this.now();
    if (at - this.windowStartedAt >= 1_000) {
      this.windowStartedAt = at;
      this.inWindow = 0;
    }
    if (this.admitted >= this.perCommand || this.inWindow >= this.perSecond) {
      this.droppedLines += 1;
      return false;
    }
    this.inWindow += 1;
    this.admitted += 1;
    return true;
  }

  get dropped(): number { return this.droppedLines; }

  /** The one truthful line to publish when output was trimmed. */
  trimNotice(): string | undefined {
    return this.droppedLines > 0
      ? `Output trimmed — ${this.droppedLines} line${this.droppedLines === 1 ? '' : 's'} not shown`
      : undefined;
  }
}

/** Where the pump sends what it produces. Implementations must not throw, but the pump does not rely on it. */
export interface TerminalOutputSink {
  output(text: string): void;
  notice(text: string): void;
  closed(): boolean;
}

/**
 * Drain one command's output stream into the sink. Observability only: this never rejects, never
 * touches the command, and any failure (reading, parsing, publishing) ends only the watching.
 */
export async function pumpTerminalOutput(iterator: AsyncIterator<string>, sink: TerminalOutputSink, budget: TerminalOutputBudget = new TerminalOutputBudget()): Promise<void> {
  const assembler = new TerminalLineAssembler();
  const attempt = (action: () => void): void => { try { action(); } catch { /* observability must never disturb a Play */ } };
  const show = (lines: string[]): void => {
    for (const raw of lines) {
      let text: string | undefined;
      try { text = projectTerminalLine(raw); } catch { continue; }
      if (!text) continue;
      if (budget.admit()) attempt(() => sink.output(text as string));
    }
  };

  let stoppedEarly = false;
  try {
    for (;;) {
      if (sink.closed()) break;
      const step = await iterator.next();
      if (step.done) break;
      show(assembler.push(String(step.value)));
    }
    show(assembler.flush());
  } catch {
    stoppedEarly = true;
    attempt(() => show(assembler.flush()));
  } finally {
    try { await iterator.return?.(); } catch { /* the stream is already gone */ }
  }

  const trimmed = budget.trimNotice();
  if (trimmed) attempt(() => sink.notice(trimmed));
  if (stoppedEarly) attempt(() => sink.notice(TERMINAL_OUTPUT_STOPPED_EARLY));
}
