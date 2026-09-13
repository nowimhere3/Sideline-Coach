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
