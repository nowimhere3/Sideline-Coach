/**
 * AUTO Terminal shell-intent classifier (S53 Plays 4–5 / S54.5–S54.7) — pure and canonically wired.
 *
 * Answers exactly one question: "is this input UNAMBIGUOUSLY a shell command?"
 * It never executes anything, never routes anything, and knows nothing about
 * Players, providers, the daemon, the filesystem, the network or the UI. No `vscode`.
 * Routing consumes only the returned normalized command; this module has no routing or execution side effects.
 */

import { checkTerminalCommand } from './terminal-player';

export type ShellIntentClass = 'inspect' | 'project-command';

export type ShellIntentReason =
  | 'not-a-string'
  | 'empty'
  | 'too-long'
  | 'not-single-line'
  | 'fenced'
  | 'non-ascii-or-control'
  | 'prompt-mark'
  | 'spacing'
  | 'metacharacter'
  | 'denylisted'
  | 'secret-path'
  | 'request-language'
  | 'unknown-executable'
  | 'unknown-subcommand'
  | 'unknown-flag'
  | 'bad-argument'
  | 'refused-by-command-check';

export type ShellIntentVerdict =
  | { readonly kind: 'shell'; readonly command: string; readonly intentClass: ShellIntentClass; readonly rule: string }
  | { readonly kind: 'reasoning'; readonly reason: ShellIntentReason };

const MAX_LENGTH = 160;

/** The ONLY characters a token may contain. No quotes, `=`, `$`, `%`, `~`, `*`, `?`, `:`, brackets, pipes, redirects, chaining, backticks. */
const TOKEN = /^[A-Za-z0-9_./\\-]+$/;

/** Executables (basename, lower-case, `.exe` stripped) that are refused outright, whatever the grammar says. Belt and braces. */
const DENY_EXECUTABLES: ReadonlySet<string> = new Set([
  'rm', 'del', 'erase', 'rmdir', 'rd', 'format', 'diskpart', 'kill', 'killall', 'taskkill', 'stop-process', 'remove-item', 'move-item', 'copy-item',
  'mv', 'move', 'cp', 'copy', 'xcopy', 'robocopy', 'ren', 'rename', 'chmod', 'chown', 'sudo', 'su', 'runas', 'curl', 'wget', 'iwr', 'irm', 'iex',
  'invoke-expression', 'invoke-webrequest', 'invoke-restmethod', 'invoke-command', 'start-process', 'start', 'powershell', 'pwsh', 'cmd', 'bash', 'sh', 'zsh',
  'wsl', 'ssh', 'scp', 'sftp', 'ftp', 'telnet', 'nc', 'reg', 'regedit', 'net', 'netsh', 'sc', 'schtasks', 'shutdown', 'restart-computer', 'stop-computer',
  'eval', 'exec', 'source', 'set-content', 'add-content', 'out-file', 'new-item', 'tee', 'dd', 'mkfs'
]);

/** Flags that mean force / destroy / skip a check, refused wherever they appear. */
const DENY_FLAGS: ReadonlySet<string> = new Set([
  '-f', '--force', '--force-with-lease', '-rf', '-fr', '--recursive', '--hard', '-y', '--yes', '--no-verify', '-fd', '-fdx', '-x', '--exec', '-c', '-e', '-command', '--eval'
]);

/** Secret-shaped names anywhere in a token: `.env*`, keys, certs, credentials, tokens, ssh material. */
const SECRET_SHAPED = /(^|[\\/._-])(env|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|passwords?|passwd|apikey|api_key|private|npmrc|netrc|pem|key|keys|pfx|p12|keystore|kube|ssh|gnupg|gpg)($|[\\/._-])/i;

/**
 * Request / prose vocabulary. Any of these anywhere in the input is a VETO, not a lower score.
 * The grammar is already closed, so this is deliberate redundancy for the failure mode that matters.
 * Grammar words (run, show, check, test, build, lint, status, diff, log, branch ...) are NOT here.
 */
const REQUEST_LANGUAGE: ReadonlySet<string> = new Set([
  'please', 'pls', 'plz', 'thanks', 'thank', 'thx', 'hey', 'hi', 'hello', 'ok', 'okay', 'yes', 'no', 'sure',
  'why', 'how', 'what', 'when', 'where', 'who', 'whom', 'whose', 'which',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'done', 'has', 'have', 'had', 'having',
  'the', 'a', 'an', 'my', 'me', 'you', 'your', 'yours', 'i', 'im', 'ive', 'we', 'us', 'our', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'they', 'them',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'cant', 'dont', 'wont', 'lets', 'let',
  'and', 'or', 'but', 'if', 'then', 'so', 'also', 'just', 'now', 'again', 'first', 'next', 'after', 'before', 'while', 'because', 'about', 'for', 'to', 'of', 'on', 'in', 'at', 'with', 'without', 'from', 'into', 'as', 'not',
  'fix', 'figure', 'out', 'explain', 'help', 'tell', 'need', 'want', 'wants', 'try', 'trying', 'look', 'see', 'seeing', 'find', 'write', 'make', 'give', 'get', 'go', 'going', 'use', 'using', 'use', 'call',
  'fail', 'fails', 'failed', 'failing', 'failure', 'error', 'errors', 'broken', 'break', 'wrong', 'issue', 'issues', 'problem', 'bug', 'stuck', 'slow', 'works', 'work', 'working',
  'command', 'commands', 'terminal', 'shell', 'output', 'result', 'results', 'changes', 'changed', 'change', 'anything', 'everything', 'something', 'nothing', 'all', 'any', 'some',
  'execute', 'executing', 'running', 'runs', 'ran', 'checks', 'checking', 'checked', 'tell', 'says', 'said', 'means', 'mean', 'does', 'doesnt', 'didnt', 'isnt', 'arent', 'wasnt'
]);

interface GrammarRow {
  readonly rule: string;
  readonly intentClass: ShellIntentClass;
  /** Exact, case-sensitive leading tokens (executable, subcommand and any fixed flag). */
  readonly words: readonly string[];
  /** Closed set of accepted flags after `words`. */
  readonly flags?: readonly string[];
  /** Accepts `-n <1..100>` and `-<1..100>` (bounded log length). */
  readonly count?: boolean;
  /** Path-or-ref positionals accepted after the flags. Default 0. */
  readonly maxPositionals?: number;
}

const inspect = (rule: string, words: readonly string[], extra: Partial<GrammarRow> = {}): GrammarRow => ({ rule, intentClass: 'inspect', words, ...extra });
const project = (rule: string, words: readonly string[]): GrammarRow => ({ rule, intentClass: 'project-command', words });

const VERSION_PROBES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['git', ['--version']], ['node', ['-v', '--version']], ['npm', ['-v', '--version']], ['pnpm', ['-v', '--version']], ['yarn', ['-v', '--version']],
  ['python', ['--version', '-V']], ['dotnet', ['--version']], ['cargo', ['--version', '-V']]
];
const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const;
const PROJECT_SCRIPTS = ['test', 'build', 'lint', 'check', 'compile', 'typecheck'] as const;
const BARE_INSPECTORS = ['dir', 'ls', 'pwd', 'whoami', 'hostname', 'Get-Location', 'Get-ChildItem'] as const;

/**
 * THE closed grammar. Anything not matched here is NOT terminal intent.
 * Widening it requires an explicit human ratification, not a convenience edit.
 * Deliberately excluded: English-word executables (`go`, `find`, `type`, `date`, ...), quoting, pipes/redirects/chaining, multiline, `cd`/env setters (the Terminal is a
 * persistent shell), every git mutation, `npm install|ci` and `npm run <anything else>`, file-reading verbs
 * (cat/type/Get-Content), `git remote` (URLs can embed credentials), interpreters and shells, servers.
 */
const GRAMMAR: readonly GrammarRow[] = [
  inspect('git.status', ['git', 'status'], { flags: ['-s', '--short', '-b', '--branch', '--porcelain'] }),
  inspect('git.branch.show-current', ['git', 'branch', '--show-current']),
  ...VERSION_PROBES.flatMap(([tool, flags]) => flags.map((flag) => inspect(`${tool}.version`, [tool, flag]))),
  ...BARE_INSPECTORS.map((name) => inspect(`bare.${name.toLowerCase()}`, [name])),
  ...PACKAGE_MANAGERS.flatMap((tool) => [
    project(`${tool}.test`, [tool, 'test']),
    ...PROJECT_SCRIPTS.map((script) => project(`${tool}.run.${script}`, [tool, 'run', script]))
  ])
];

/** Rule ids the grammar can produce (for tests and the future wiring's telemetry-free docs). */
export const SHELL_INTENT_RULES: readonly string[] = Array.from(new Set(GRAMMAR.map((row) => row.rule)));

/** Ref names accepted as a bare positional. Everything else must be path-shaped. */
const BARE_REFS: ReadonlySet<string> = new Set(['HEAD', 'main', 'master', 'develop']);

function isPathShaped(token: string): boolean {
  if (token.startsWith('/') || token.startsWith('\\')) return false; // relative only
  if (token.includes('..')) return false; // no traversal, no ranges
  if (token === '.') return true;
  if (token.endsWith('.')) return false; // a sentence-ending period is prose, not a path
  if (/[\\/]/.test(token)) {
    // `.git/...` can hold remote URLs with embedded credentials: never a positional.
    return token.split(/[\\/]/).every((segment) => segment.length > 0 && segment.toLowerCase() !== '.git' && /^[A-Za-z0-9_.-]+$/.test(segment));
  }
  return /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,8}$/.test(token); // `README.md`, not `etc.`
}

const isPositional = (token: string): boolean => BARE_REFS.has(token) || isPathShaped(token);
const reasoning = (reason: ShellIntentReason): ShellIntentVerdict => ({ kind: 'reasoning', reason });
const basenameOf = (token: string): string => token.split(/[\\/]/).pop() ?? token;

/**
 * BREADCRUMB: TERMINAL-INTENT-BOUNDARY   (durable safety boundary; keep this comment with the code)
 *
 * WHAT: the conservative AUTO Terminal intent boundary. `shell` means the COMPLETE input is one exact, closed-grammar
 *   command; everything else, including every doubt, is `reasoning` (NOT terminal).
 * WHY:  a false negative costs one AI turn; a false positive can run a shell command Dad never asked for. Ordinary
 *   English ("Can you run git status?", "Why did npm test fail?", "Explain git diff", "Write me a PowerShell command ...")
 *   must never be read as permission to execute. There is no score, no similarity and no "ask" outcome: closed rules only.
 * MUST REMAIN: strictly NARROWER than the explicit Terminal boundary. `checkTerminalCommand` is the last gate below
 *   and is a rejection guard, not an intent classifier ("check git status" passes it), so it is necessary, never sufficient.
 *   The classifier never rewrites text: `command` is the input trimmed of ASCII whitespace, byte for byte.
 * DO NOT broaden this grammar casually. Every widening needs an explicit human decision plus corpus + property proof
 *   (test/s54-5-terminal-intent.test.mjs) and an independent adversarial review.
 * CURRENT OWNER: the canonical AUTO route consumes this verdict only after explicit human routing constraints, and
 *   only for one eligible Coach-managed Terminal in the exact Game. It executes `verdict.command`, never the raw
 *   prompt. No eligible unambiguous Terminal means ordinary reasoning routing; uncertainty never executes.
 */
export function classifyShellIntent(prompt: unknown): ShellIntentVerdict {
  if (typeof prompt !== 'string') return reasoning('not-a-string');

  // G0 - shape. Only ASCII whitespace is trimmed, so exotic leading/trailing characters are refused, never silently dropped.
  const text = prompt.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (!text) return reasoning('empty');
  if (/[\r\n]/.test(text)) return reasoning('not-single-line');
  if (text.includes('```') || text.includes('~~~')) return reasoning('fenced');
  if (text.length > MAX_LENGTH) return reasoning('too-long');
  if (!/^[\x20-\x7e]+$/.test(text)) return reasoning('non-ascii-or-control');
  if (/^([$>#%]|PS\b.*>)/i.test(text)) return reasoning('prompt-mark');
  if (text.includes('  ')) return reasoning('spacing');

  // G2 - every token uses the tiny allowed alphabet.
  const tokens = text.split(' ');
  if (tokens.some((token) => !TOKEN.test(token))) return reasoning('metacharacter');

  // G6 - deny overlay, independent of the grammar.
  for (const token of tokens) {
    const base = basenameOf(token).toLowerCase().replace(/\.exe$/, '');
    if (DENY_EXECUTABLES.has(base) || DENY_FLAGS.has(token.toLowerCase())) return reasoning('denylisted');
  }
  if (tokens.some((token) => SECRET_SHAPED.test(token))) return reasoning('secret-path');

  // G7 - request/prose veto.
  if (tokens.some((token) => REQUEST_LANGUAGE.has(token.toLowerCase()))) return reasoning('request-language');

  // G3 / G5 - closed grammar. Exact case; no `.exe`, no path-prefixed executables.
  const candidates = GRAMMAR.filter((row) => row.words[0] === tokens[0]);
  if (!candidates.length) return reasoning('unknown-executable');
  const row = candidates
    .filter((candidate) => candidate.words.every((word, index) => tokens[index] === word))
    .sort((a, b) => b.words.length - a.words.length)[0];
  if (!row) return reasoning('unknown-subcommand');

  const flags = new Set(row.flags ?? []);
  const rest = tokens.slice(row.words.length);
  let positionals = 0;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith('-')) {
      if (row.count && token === '-n') {
        const amount = rest[index + 1];
        if (amount === undefined || !/^[1-9][0-9]{0,2}$/.test(amount) || Number(amount) > 100) return reasoning('bad-argument');
        index += 1;
        continue;
      }
      if (row.count && /^-[1-9][0-9]{0,2}$/.test(token) && Number(token.slice(1)) <= 100) continue;
      if (!flags.has(token)) return reasoning('unknown-flag');
      continue;
    }
    positionals += 1;
    if (positionals > (row.maxPositionals ?? 0) || !isPositional(token)) return reasoning('bad-argument');
  }

  // G1 - the explicit Terminal boundary must ALSO accept it (strict subset by construction).
  const guard = checkTerminalCommand(text);
  if (!guard.ok || guard.command !== text) return reasoning('refused-by-command-check');

  return { kind: 'shell', command: text, intentClass: row.intentClass, rule: row.rule };
}
