// S54.5/S54.7 - the pure Terminal shell-intent classifier and its canonical routing ownership.
//
// The classifier answers one question: is this input UNAMBIGUOUSLY a shell command? When in doubt: NO.
// False negatives are acceptable; a false positive is unintended shell execution. So the proof is
// adversarial: a large natural-language corpus that must never classify as shell, a superset property
// against the real explicit-Terminal boundary (checkTerminalCommand), seeded fuzzing, mutation properties
// over every accepted command, purity, and proof that nothing imports the module yet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { classifyShellIntent, SHELL_INTENT_RULES } = await import('../out/terminal-intent.js');
const { checkTerminalCommand } = await import('../out/terminal-player.js');

const isShell = (input) => classifyShellIntent(input).kind === 'shell';
const reasonOf = (input) => { const v = classifyShellIntent(input); return v.kind === 'reasoning' ? v.reason : `SHELL(${v.rule})`; };

/** Every command the grammar is meant to accept, with its expected rule and class. */
const ACCEPTED = [
  ['git status', 'git.status', 'inspect'], ['git status -s', 'git.status', 'inspect'], ['git status --short --branch', 'git.status', 'inspect'], ['git status --porcelain', 'git.status', 'inspect'],
  ['git branch --show-current', 'git.branch.show-current', 'inspect'],
  ['node --version', 'node.version', 'inspect'], ['node -v', 'node.version', 'inspect'], ['npm -v', 'npm.version', 'inspect'], ['npm --version', 'npm.version', 'inspect'], ['git --version', 'git.version', 'inspect'],
  ['python --version', 'python.version', 'inspect'], ['python -V', 'python.version', 'inspect'], ['dotnet --version', 'dotnet.version', 'inspect'], ['cargo --version', 'cargo.version', 'inspect'],
  ['pnpm -v', 'pnpm.version', 'inspect'], ['yarn --version', 'yarn.version', 'inspect'],
  ['pwd', 'bare.pwd', 'inspect'], ['dir', 'bare.dir', 'inspect'], ['ls', 'bare.ls', 'inspect'], ['whoami', 'bare.whoami', 'inspect'], ['hostname', 'bare.hostname', 'inspect'],
  ['Get-Location', 'bare.get-location', 'inspect'], ['Get-ChildItem', 'bare.get-childitem', 'inspect'],
  ['npm test', 'npm.test', 'project-command'], ['npm run test', 'npm.run.test', 'project-command'], ['npm run compile', 'npm.run.compile', 'project-command'], ['npm run check', 'npm.run.check', 'project-command'],
  ['npm run build', 'npm.run.build', 'project-command'], ['npm run lint', 'npm.run.lint', 'project-command'], ['npm run typecheck', 'npm.run.typecheck', 'project-command'],
  ['pnpm test', 'pnpm.test', 'project-command'], ['pnpm run build', 'pnpm.run.build', 'project-command'], ['yarn test', 'yarn.test', 'project-command'], ['yarn run lint', 'yarn.run.lint', 'project-command']
];

// ---------------------------------------------------------------------------
// TI-1 accept
// ---------------------------------------------------------------------------

test('TI-1. Known simple shell commands (all inside the explicit safety boundary) classify as Terminal intent, byte for byte', () => {
  for (const [input, rule, intentClass] of ACCEPTED) {
    const verdict = classifyShellIntent(input);
    assert.equal(verdict.kind, 'shell', `${input} -> ${reasonOf(input)}`);
    assert.equal(verdict.command, input, 'command is the input, unmodified');
    assert.equal(verdict.rule, rule, input);
    assert.equal(verdict.intentClass, intentClass, input);
  }
  // Only ASCII whitespace around the command is dropped, and nothing inside is rewritten.
  assert.deepEqual(classifyShellIntent('  git status \n'), { kind: 'shell', command: 'git status', intentClass: 'inspect', rule: 'git.status' });
  assert.deepEqual(classifyShellIntent('\tnpm test\r\n'), { kind: 'shell', command: 'npm test', intentClass: 'project-command', rule: 'npm.test' });
  assert.ok(SHELL_INTENT_RULES.length > 20 && SHELL_INTENT_RULES.includes('git.status'));
  for (const [, rule] of ACCEPTED) assert.ok(SHELL_INTENT_RULES.includes(rule), `${rule} is a declared rule`);
});

// ---------------------------------------------------------------------------
// TI-2..5 natural language is never Terminal intent
// ---------------------------------------------------------------------------

const QUESTIONS = [
  'Can you run git status and tell me what changed?', 'Why did npm test fail?', 'Why is npm test failing', 'What does git status do', 'what does git diff show me',
  'How do I run npm test', 'how do i see git status?', 'Is git status the right command?', 'Which command shows git log?', 'When should I run npm run build?',
  'Where does npm test put its output?', 'Who broke npm run check?', 'Do I need to run npm run compile first?', 'Did npm test pass?', 'Should I run npm install?',
  'Could you run git diff for me?', 'Would git status help here?', 'Will npm run build work?', 'Can I run npm test now', 'git status?', 'npm test?', 'is git diff safe?',
  'git status is failing', 'npm test is failing again', 'git diff shows nothing', 'my git status is weird', 'npm run check keeps failing on CI', 'dir is not working',
  'pwd returns the wrong folder', 'the output of git log is huge', 'node --version says 12 but I installed 20'
];
const EXPLAIN = [
  'Please explain git diff.', 'explain git status', 'Explain git log', 'explain npm test', 'Tell me what git status does', 'describe git diff', 'walk me through npm run build',
  'what is the difference between git diff and git show', 'summarize git log', 'teach me git branch', 'help me understand git status', 'clarify what npm test runs',
  'git diff explained', 'git status meaning', 'git log tutorial', 'explain what pwd does'
];
const GENERATE = [
  'Write me a PowerShell command that finds large files.', 'write a git command to undo my last commit', 'generate a shell script that runs npm test', 'give me a command to list files',
  'make a script that runs git status every minute', 'suggest a command for git diff', 'what command lists the branches', 'show me a command to see npm version',
  'create a bash one liner for git log', 'draft a command that prints the current directory', 'write a Get-ChildItem command that sorts by size', 'come up with a git alias for status'
];
const REQUESTS = [
  'please run git status', 'run git status', 'run git status for me', 'please run npm test', 'can you run npm test', 'could you run git diff', 'check git status', 'check npm test',
  'figure out why git status is failing', 'fix npm install', 'fix npm run build', 'I need to see git status', 'I want to run npm test', 'let me see git diff', "let's run npm test",
  'git status please', 'npm test please', 'git status thanks', 'hey git status', 'ok git status', 'yes git status', 'now git status', 'then npm test', 'first git status', 'also git diff',
  'show me git status', 'show git diff', 'see git log', 'try npm test', 'go run npm test', 'execute git status', 'do git status', 'use git status', 'look at git diff', 'find git status',
  'investigate why npm test fails', 'tell me about git log', 'run the tests', 'run the build', 'list my files', 'show me the files here', 'what changed', 'git', 'npm', 'git status and npm test',
  'git status then git diff', 'git status or git diff', 'git diff for the last commit', 'git log for last week', 'git diff main vs my branch', 'git diff between main and dev',
  'hostname of this machine', 'ls me the files', 'dir the folder', 'pwd for me', 'whoami please', 'status', 'diff', 'test', 'build'
];
const PROSE_WITH_CODE = [
  'Run this:\n```\ngit status\n```', 'Here is what I ran:\n$ git status\nOn branch main', '```git status```', '`git status`', '"git status"', "'git status'", '(git status)',
  'I ran `npm test` and it failed', 'The command git status shows the tree.', 'Use `git diff` to see changes.', 'PS C:\\repo> git status', '$ git status', '> git status', '# git status', '% git status',
  'git status\nwhat does this mean?', 'git status\nplease also run npm test', 'npm test\nnpm install', 'git status\r\nrm -rf .', '\ngit status\nls',
  'Step 1: git status', '1. git status', '- git status', '* git status', 'Note: git status', 'TODO run git status', 'e.g. git status', 'i.e. npm test'
];

for (const [id, label, corpus] of [
  ['TI-2', 'questions containing commands', QUESTIONS],
  ['TI-3', 'requests to explain commands', EXPLAIN],
  ['TI-4', 'requests to write or generate a command', GENERATE],
  ['TI-5', 'imperative / polite prose that mentions commands', REQUESTS],
  ['TI-5b', 'prose with code embedded, fenced, prompt-marked or multi-line', PROSE_WITH_CODE]
]) {
  test(`${id}. ${label}: none is Terminal intent (${corpus.length} inputs)`, () => {
    for (const input of corpus) assert.equal(classifyShellIntent(input).kind, 'reasoning', `false positive: ${JSON.stringify(input)} -> ${reasonOf(input)}`);
  });
}

test('TI-5c. Specific gates give the expected reasons for the headline prose examples', () => {
  assert.equal(reasonOf('Can you run git status and tell me what changed?'), 'metacharacter');
  assert.equal(reasonOf('Please explain git diff.'), 'request-language');
  assert.equal(reasonOf('git status please'), 'request-language');
  assert.equal(reasonOf('Write me a PowerShell command that finds large files.'), 'denylisted');
  assert.equal(reasonOf('check git status'), 'unknown-executable');
  assert.equal(reasonOf('Run this:\n```\ngit status\n```'), 'not-single-line');
  assert.equal(reasonOf('```git status```'), 'fenced');
});

// ---------------------------------------------------------------------------
// TI-6 / TI-7 empty, malformed, unsupported
// ---------------------------------------------------------------------------

test('TI-6. Empty, whitespace and non-string input are never Terminal intent', () => {
  for (const input of ['', ' ', '   ', '\n', '\t', ' \r\n ', undefined, null, 0, 1, true, false, {}, [], ['git status'], { toString: () => 'git status' }, Symbol.iterator.description, () => 'git status', 12n]) {
    assert.equal(classifyShellIntent(input).kind, 'reasoning', String(typeof input));
  }
  assert.equal(reasonOf(''), 'empty');
  assert.equal(reasonOf(undefined), 'not-a-string');
});

const UNSUPPORTED = {
  'pager-capable Git output': ['git diff', 'git diff --stat', 'git diff --name-only', 'git diff --cached', 'git diff src/a.ts', 'git diff HEAD', 'git log', 'git log --oneline', 'git log -5', 'git show', 'git show HEAD', 'git show --stat HEAD', 'git branch', 'git branch -a', 'git branch --all', 'git branch -r', 'git branch --remotes', 'git branch -v', 'git branch --verbose'],
  'chaining, pipes, redirects, subshells, variables, globs': ['git status && rm -rf .', 'git status; npm install', 'git status || dir', 'git log | head', 'dir > out.txt', 'git diff >> a.txt', 'git status $(whoami)', 'git status `id`', 'dir *.md', 'dir ?', 'echo %PATH%', 'git status &', 'npm test ; ls', 'git diff < a', '$env:X=1', 'git status ${HOME}', 'dir ~', 'git log HEAD~1', 'git diff HEAD^', 'git stash@{0}', 'git diff a:b'],
  'quoting': ['git diff "src/a b.ts"', "git diff 'a.ts'", 'git log --grep="x"', 'git commit -m "x"', 'npm test "x"'],
  'multiline / fenced / prompt marks / spacing': ['git status\nls', 'git status\r\nls', 'git\nstatus', '```\ngit status\n```', '~~~git status~~~', '$ git status', '> git status', 'PS C:\\> git status', '# git status', '% git status', 'git  status', 'git status  -s', 'git\tstatus'],
  'non-ASCII, zero-width, homoglyph, control': ['git\u200b status', 'git status\u200b', '\u200bgit status', 'g\u0456t status', '\u0261it status', 'git st\u0430tus', 'git\u00a0status', '\u00a0git status', '\ufeffgit status', 'git status\u0000', 'git status\u0007', 'git status \u202e', 'git status \ud83d\ude00', 'g\u0131t status', 'npm t\u0435st'],
  'mutations and deletion': ['git reset --hard', 'git checkout .', 'git clean -fd', 'git clean -n', 'git add .', 'git commit', 'git push', 'git pull', 'git fetch', 'git merge main', 'git rebase main', 'git stash', 'git branch -D main', 'git branch feature', 'git branch -d x', 'git tag v1', 'rm -rf x', 'rm x', 'del x.txt', 'rmdir x', 'Remove-Item x', 'mv a b', 'cp a b', 'mkdir x', 'touch x', 'npm install', 'npm install left-pad', 'npm i', 'npm ci', 'npm uninstall x', 'npm publish', 'npm update', 'npm audit fix', 'pnpm install', 'yarn add x', 'yarn', 'format c:', 'git status --force', 'git diff -f', 'git log -y'],
  'server lifecycle': ['npm start', 'npm run dev', 'npm run serve', 'npm run start', 'npm run watch', 'yarn start', 'node server.js', 'kill 123', 'kill -9 1', 'taskkill /F /PID 1', 'Stop-Process -Name x'],
  'persistent-shell state': ['cd ..', 'cd', 'cd src', 'Set-Location src', 'pushd x', 'popd', 'export X=1', 'set X=1', 'setx X 1', '$env:PATH', 'unset X', 'alias ll=ls', 'Set-Alias a b'],
  'interpreters, shells, remote and network': ['node -e 1', 'node -p 1', 'node server.js', 'node', 'python -c 1', 'python x.py', 'python', 'python -v', 'py x.py', 'powershell', 'powershell -c dir', 'pwsh -c dir', 'cmd', 'cmd /c dir', 'bash', 'sh -c ls', 'wsl ls', 'ssh host', 'scp a b', 'curl http://x', 'wget x', 'Invoke-WebRequest x', 'iex x', 'Invoke-Expression x', 'eval x', 'sudo ls', 'runas x', 'start x', 'ftp x', 'nc x 1', 'reg query x', 'net user', 'sc query', 'schtasks', 'shutdown /s', 'git clone x', 'git remote -v', 'git remote', 'git config --list', 'git config user.name', 'git submodule update', 'git -c core.pager=x status', 'git -C .. status'],
  'file-reading verbs and secret-shaped paths': ['cat README.md', 'type README.md', 'Get-Content README.md', 'more README.md', 'cat .env', 'type id_rsa', 'Get-Content secrets.json', 'git diff .env', 'git diff src/.env.local', 'git diff id_rsa', 'git show credentials.json', 'git log secrets/a.txt', 'git diff key.pem', 'git diff token.txt', 'git diff .npmrc', 'git diff .git/config', 'git show .git/config', 'git diff config/passwords.yml', 'git diff .ssh/config', 'env', 'printenv', 'set', 'Get-ChildItem env:'],
  'homographs (English words that are also commands) used bare': ['find', 'date', 'type', 'cat', 'echo', 'echo hi', 'time', 'history', 'which git', 'where git', 'more', 'sort', 'start', 'call', 'test', 'true', 'clear', 'cls', 'help', 'man git', 'top', 'ps', 'ping x', 'watch x', 'yes'],
  'exact-case: the grammar is case-sensitive': ['Git status', 'GIT STATUS', 'git Status', 'git STATUS', 'NPM test', 'Npm test', 'npm Test', 'npm run Test', 'Dir', 'DIR', 'PWD', 'Pwd', 'LS', 'get-childitem', 'GET-CHILDITEM', 'get-location', 'Get-childitem', 'NODE -v', 'node -V', 'python -v', 'git --Version'],
  'unknown or over-long grammar tails': ['git status foo', 'git status -x', 'git status --verbose', 'git status ..', 'git status src', 'git diff --output=x', 'git diff --ext-diff', 'git diff --no-index a b', 'git diff a b c', 'git diff foo', 'git diff -- a.ts', 'git diff a..b', 'git diff origin..main', 'git log -n', 'git log -n 0', 'git log -n 101', 'git log -0', 'git log -101', 'git log -n abc', 'git log -n 05', 'git log -n 5 6', 'git log a b', 'git log --all', 'git log -p', 'git show a b', 'git show foo', 'git branch -a foo', 'git branch --list', 'git branch -m x', 'npm test -- --grep x', 'npm test x', 'npm run', 'npm run test x', 'npm run dev x', 'npm run foo', 'npm run build --silent', 'npm test --watch', 'npm run test:unit', 'npm run Build', 'npm --help', 'npm -h', 'node --help', 'node -v x', 'go version', 'go build', 'go test ./...', 'cargo build', 'dotnet build', 'dir /s', 'dir src', 'ls -la', 'ls src', 'pwd x', 'whoami /all', 'hostname x', 'Get-ChildItem -Recurse', 'Get-ChildItem src', 'Get-Process', 'tasklist', 'Test-Path x', 'git', 'npm', 'node', 'yarn', 'pnpm'],
  'path shapes': ['git diff /etc/passwd', 'git diff \\Windows', 'git diff ../a.ts', 'git diff a/../b', 'git diff C:\\a.ts', 'git diff a//b.ts', 'git diff a/', 'git diff etc.', 'git diff a.', 'git diff -', 'git diff --', 'git diff src/ a.ts', 'git diff ...', 'git diff src/a.ts.', 'git diff README.md.', 'git diff src/.', 'git diff a.ts,']
};

for (const [label, corpus] of Object.entries(UNSUPPORTED)) {
  test(`TI-7. Not Terminal intent: ${label} (${corpus.length})`, () => {
    for (const input of corpus) assert.equal(classifyShellIntent(input).kind, 'reasoning', `false positive: ${JSON.stringify(input)} -> ${reasonOf(input)}`);
  });
}

test('TI-7b. Length and fenced limits', () => {
  assert.equal(classifyShellIntent(`git status ${'a'.repeat(200)}`).kind, 'reasoning');
  assert.equal(reasonOf(`git status ${'a'.repeat(200)}`), 'too-long');
  assert.equal(classifyShellIntent('git branch --show-current').kind, 'shell', 'bounded branch form remains eligible');
});

// ---------------------------------------------------------------------------
// TI-8 the classifier is strictly narrower than the explicit Terminal boundary
// ---------------------------------------------------------------------------

/** Deterministic PRNG so the fuzz is reproducible. */
function mulberry32(seed) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const VOCAB = {
  execs: ['git', 'npm', 'node', 'pnpm', 'yarn', 'python', 'dir', 'ls', 'pwd', 'whoami', 'hostname', 'Get-ChildItem', 'Get-Location', 'go', 'cargo', 'dotnet', 'cat', 'rm', 'cd', 'powershell', 'curl', 'echo'],
  subs: ['status', 'diff', 'log', 'show', 'branch', 'test', 'run', 'build', 'check', 'compile', 'lint', 'typecheck', 'install', 'ci', 'start', 'dev', 'push', 'reset', 'clean', 'version', 'add', 'commit'],
  flags: ['-s', '--short', '-b', '--branch', '--porcelain', '--stat', '--name-only', '--no-color', '--cached', '--staged', '--oneline', '--graph', '--decorate', '-n', '-5', '5', '-a', '-r', '-v', '--version', '-V', '--force', '-f', '--hard', '-rf', '--', '-', '-c', '-e', '--output=x'],
  args: ['HEAD', 'main', 'src/a.ts', 'README.md', '.', 'a.ts', 'src\\a.ts', '.env', 'id_rsa', 'foo', '..', '../a', '/etc/passwd', '.git/config', 'x'],
  junk: ['&&', '||', ';', '|', '>', '<', '`id`', '$(id)', '$HOME', '"x"', "'x'", '*', '?', '~', '%PATH%', '{a}', '(a)', '\n', 'ls', 'rm'],
  prose: ['please', 'why', 'how', 'what', 'can', 'could', 'you', 'run', 'check', 'explain', 'the', 'my', 'is', 'fail', 'help', 'me', 'tell', 'fix', 'figure', 'out', 'for', 'to', 'and', 'if', 'this', 'it', 'I', 'we', 'show', 'see']
};
/** An independent list of prose that must veto, kept separate from the implementation's own set. */
const PROSE_VETO = new Set(['please', 'why', 'how', 'what', 'can', 'could', 'you', 'explain', 'the', 'my', 'is', 'fail', 'help', 'me', 'tell', 'fix', 'figure', 'out', 'for', 'to', 'and', 'if', 'this', 'it', 'i', 'we']);
const ALLOWED_TOKENS = new Set([...VOCAB.execs, ...VOCAB.subs, ...VOCAB.flags, ...VOCAB.args, 'HEAD'].filter((t) => !['rm', 'cat', 'cd', 'powershell', 'curl', 'echo', 'install', 'ci', 'start', 'dev', 'push', 'reset', 'clean', 'add', 'commit', '--force', '-f', '--hard', '-rf', '-c', '-e', '--output=x', '..', '../a', '/etc/passwd', '.env', 'id_rsa', '.git/config', 'foo', 'x', '-', '--'].includes(t)));

function fuzzInputs(count, seed) {
  const random = mulberry32(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const tokens = [];
    const length = 1 + Math.floor(random() * 6);
    // Bias toward plausible commands so positives are actually exercised.
    if (random() < 0.7) tokens.push(pick(VOCAB.execs), ...(random() < 0.8 ? [pick(VOCAB.subs)] : []));
    while (tokens.length < length) tokens.push(pick(random() < 0.4 ? VOCAB.flags : random() < 0.5 ? VOCAB.args : random() < 0.6 ? VOCAB.prose : random() < 0.5 ? VOCAB.junk : VOCAB.subs));
    out.push(tokens.join(random() < 0.05 ? '  ' : ' '));
  }
  return out;
}

test('TI-8. Whatever the classifier accepts, the explicit Terminal command-safety boundary also accepts (curated + exhaustive + 60k seeded fuzz)', () => {
  const exhaustive = [];
  const subsets = (flags, max) => { const sets = [[]]; for (const f of flags) for (const s of [...sets]) if (s.length < max) sets.push([...s, f]); return sets; };
  const positionals = ['', 'HEAD', 'main', 'src/a.ts', 'README.md', '.', 'src\\a.ts'];
  for (const flags of subsets(['-s', '--short', '-b', '--branch', '--porcelain'], 3)) exhaustive.push(['git', 'status', ...flags].join(' '));
  exhaustive.push('git branch --show-current');
  let shellCount = 0;
  let onlyGuardAccepts = 0;
  const inputs = [...ACCEPTED.map(([c]) => c), ...exhaustive, ...QUESTIONS, ...EXPLAIN, ...GENERATE, ...REQUESTS, ...PROSE_WITH_CODE, ...Object.values(UNSUPPORTED).flat(), ...fuzzInputs(60_000, 0x54_05)];
  for (const input of inputs) {
    const verdict = classifyShellIntent(input);
    const guard = checkTerminalCommand(input);
    if (verdict.kind === 'shell') {
      shellCount += 1;
      assert.equal(guard.ok, true, `classifier accepted what the Terminal boundary refuses: ${JSON.stringify(input)}`);
      assert.equal(guard.command, verdict.command, 'the boundary would send exactly the classified command');
      assert.equal(verdict.command, input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''), 'command === input trimmed of ASCII whitespace');
      const tokens = verdict.command.split(' ');
      assert.ok(tokens.length <= 7 && verdict.command.length <= 160);
      assert.ok(/^[\x20-\x7e]+$/.test(verdict.command) && !/[|&;<>`$(){}%*?!~"':=]/.test(verdict.command), 'no shell metacharacter can survive');
      for (const token of tokens) assert.ok(!PROSE_VETO.has(token.toLowerCase()), `prose token in shell verdict: ${token}`);
    } else if (guard.ok) {
      onlyGuardAccepts += 1;
    }
  }
  assert.ok(shellCount > 50, `the property must actually exercise positives (saw ${shellCount})`);
  assert.ok(onlyGuardAccepts > 10_000, `narrower, not equal: the boundary accepts far more (saw ${onlyGuardAccepts})`);
  for (const input of ['check git status', 'git branch feature', 'rm -rf x', 'npm install', 'git status && ls', 'cd ..', 'cat .env']) {
    assert.equal(checkTerminalCommand(input).ok, true, `${input} is acceptable to explicit Terminal...`);
    assert.equal(classifyShellIntent(input).kind, 'reasoning', `...but is NOT AUTO Terminal intent`);
  }
});

test('TI-8b. Mutating any accepted command with prose, junk, quoting, case or a second line flips it to NOT terminal', () => {
  const appended = ['please', 'now', 'thanks', 'for', 'me', 'and', 'why', 'what', 'x', '&&', '|', ';', '>', '<', '&', '`id`', '$(id)', '$X', '"x"', "'x'", '*', '?', '!', '~', '%', '--force', '-f', '--hard', '-rf', '-y', '.env', 'id_rsa', 'foo bar', '..', '../x', '/etc/hosts'];
  const prefixes = ['please', 'can you run', 'why does', 'what does', 'explain', 'hey', 'ok', 'run', 'check', 'show me', 'I ran', 'the', '$', '>', '#', '%', 'PS>', 'PS C:\\>', '-', 'sudo', 'echo'];
  const wrappers = [(c) => `"${c}"`, (c) => `'${c}'`, (c) => `\`${c}\``, (c) => `(${c})`, (c) => `{${c}}`, (c) => `${c}?`, (c) => `${c}.`, (c) => `${c}!`, (c) => `${c},`, (c) => `${c}:`, (c) => `$(${c})`, (c) => `\`\`\`${c}\`\`\``, (c) => `\`\`\`\n${c}\n\`\`\``,
    (c) => `${c}\nls`, (c) => `ls\n${c}`, (c) => `${c}\r\nrm -rf .`, (c) => `${c}\n\nwhy did that fail?`, (c) => `${c}\u200b`, (c) => `\u200b${c}`, (c) => `${c}\u0000`, (c) => `${c}\u00a0`, (c) => c.replace(' ', '\u00a0'), (c) => c.replace(' ', '  '), (c) => c.replace(' ', '\t'),
    (c) => c.toUpperCase(), (c) => c[0].toUpperCase() + c.slice(1)];
  for (const [command] of ACCEPTED) {
    for (const word of appended) assert.equal(classifyShellIntent(`${command} ${word}`).kind, 'reasoning', `${command} + ${word}`);
    for (const word of prefixes) assert.equal(classifyShellIntent(`${word} ${command}`).kind, 'reasoning', `${word} + ${command}`);
    for (const wrap of wrappers) {
      const mutated = wrap(command);
      if (mutated === command || mutated.trim() === command) continue; // a no-op mutation (e.g. uppercasing a single-word symbol) proves nothing
      assert.equal(classifyShellIntent(mutated).kind, 'reasoning', JSON.stringify(mutated));
    }
  }
});

test('TI-8c. Ordinary conversational English never classifies as Terminal intent (seeded generator, 40k sentences)', () => {
  const random = mulberry32(0x9e3779b1);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const lead = ['', 'please ', 'can you ', 'could you ', 'why does ', 'what does ', 'how do I ', 'I want to ', 'I need you to ', "let's ", 'hey, ', 'ok so ', 'quick question: ', 'before we start, ', 'tell me ', 'explain ', 'figure out why ', 'do you know if ', 'show me '];
  const cmd = ['git status', 'git diff', 'git log', 'npm test', 'npm run check', 'npm run compile', 'node --version', 'pwd', 'dir', 'ls', 'whoami', 'hostname', 'git branch', 'npm run build', 'git show'];
  const tail = ['', ' please', ' for me', ' and tell me what changed', ' is failing', ' does nothing', ' works', ' on this repo', ' now', ' again?', '?', '.', '!', ' and then npm install', ', thanks', ' - what does it mean', ' to see the changes', ' output', ' first'];
  for (let i = 0; i < 40_000; i += 1) {
    const sentence = pick(lead) + pick(cmd) + pick(tail);
    if (sentence === pick(cmd) || cmd.includes(sentence)) continue; // the bare command itself is a command, not conversation
    assert.equal(classifyShellIntent(sentence).kind, 'reasoning', `false positive: ${JSON.stringify(sentence)}`);
  }
});

test('TI-8d. Second review, exhaustive: no 1-3 token sentence starting with a real executable becomes Terminal intent unless every word is grammar or an explicit path', () => {
  const english = ('a about after again all also am an and any are as at be because been before but by call can cannot change changed changes check checked command could data day did do does doing done '
    + 'dont down error errors explain fail failed failing fails file files find first fix for from get give go going good got had has have he hello help her here hey him his how i if in into is issue it its just '
    + 'know let like list look make many me more most my need new next no not now of ok on one only or other our out over please problem project questions quick read really repo result results right run running '
    + 'same say see set she should show so some something status still sure take tell test tests than thanks that the their them then there these they thing this those to today too try up us use using very want was '
    + 'we well were what when where which while who why will with without work works would write yes you your etc. e.g. i.e. a.m. p.m. vs. mr. mrs. dr. inc. ok. no. yes. done. thanks. please. status. diff. log. build. '
    + 'ls dir pwd git npm node yarn pnpm python cargo dotnet go cat type echo find date time more history start stop clear help open close save load send print').split(/\s+/).filter(Boolean);
  const grammarTokens = new Set(['git', 'npm', 'node', 'pnpm', 'yarn', 'python', 'cargo', 'dotnet', 'dir', 'ls', 'pwd', 'whoami', 'hostname', 'Get-Location', 'Get-ChildItem',
    'status', 'diff', 'log', 'show', 'branch', 'test', 'run', 'build', 'lint', 'check', 'compile', 'typecheck', '-s', '--short', '-b', '--branch', '--porcelain', '--stat', '--name-only', '--name-status', '--no-color', '--cached', '--staged',
    '--oneline', '--graph', '--decorate', '-n', '-a', '--all', '-r', '--remotes', '-v', '--verbose', '--show-current', '-V', '--version', 'HEAD', 'main', 'master', 'develop']);
  const pathTokens = ['README.md', 'src/a.ts', 'a.ts', 'package.json', 'src\a.ts', '.', 'file.txt', 'notes.md'];
  const first = ['git', 'npm', 'node', 'pnpm', 'yarn', 'python', 'cargo', 'dotnet', 'dir', 'ls', 'pwd', 'whoami', 'hostname', 'Get-Location', 'Get-ChildItem'];
  const second = [...new Set([...english, ...grammarTokens, ...pathTokens, '5', '-5', '100', '101', '0', 'x', '-', '--'])];
  const surprising = [];
  let checked = 0;
  let accepted = 0;
  for (const a of first) {
    for (const b of ['', ...second]) {
      for (const c of ['', ...second]) {
        if (b === '' && c !== '') continue;
        const input = [a, b, c].filter(Boolean).join(' ');
        checked += 1;
        const verdict = classifyShellIntent(input);
        if (verdict.kind !== 'shell') continue;
        accepted += 1;
        const tokens = input.split(' ');
        // every token: grammar vocabulary, a path-shaped token we chose, or a bounded number after -n
        const ok = tokens.every((t, i) => grammarTokens.has(t) || pathTokens.includes(t) || (/^[1-9][0-9]?$|^100$/.test(t) && tokens[i - 1] === '-n') || /^-[1-9][0-9]?$|^-100$/.test(t));
        if (!ok) surprising.push(input);
        // and the explicit boundary agrees
        assert.equal(checkTerminalCommand(input).ok, true, input);
      }
    }
  }
  assert.deepEqual(surprising, [], 'English or unknown words never ride into an accepted command');
  assert.ok(checked > 100_000 && accepted > 20, `exhaustive sweep exercised both outcomes (checked ${checked}, accepted ${accepted})`);
});

// ---------------------------------------------------------------------------
// TI-9 deterministic, TI-10 pure
// ---------------------------------------------------------------------------

test('TI-9. Deterministic: same input, same verdict, in any order, with no shared state', () => {
  const inputs = [...ACCEPTED.map(([c]) => c), ...QUESTIONS, ...Object.values(UNSUPPORTED).flat()];
  const first = inputs.map((input) => classifyShellIntent(input));
  for (const input of [...inputs].reverse()) classifyShellIntent(input);
  const second = inputs.map((input) => classifyShellIntent(input));
  assert.deepEqual(second, first);
  const a = classifyShellIntent('git status'); a.command = 'mutated';
  assert.equal(classifyShellIntent('git status').command, 'git status', 'returned objects are fresh; callers cannot poison later calls');
  for (const seed of [1, 2, 3]) assert.deepEqual(fuzzInputs(200, seed).map(reasonOf), fuzzInputs(200, seed).map(reasonOf));
});

test('TI-10. No process, filesystem, network, environment, clock or randomness: static surface and runtime under booby-trapped globals', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'terminal-intent.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const imports = [...code.matchAll(/^\s*import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./terminal-player'], 'its only dependency is the explicit Terminal boundary it must stay narrower than');
  // API-usage patterns, not bare words: the deny list legitimately contains strings like 'stop-process' and 'net'.
  for (const forbidden of [/\bprocess\s*[.[]/, /child_process/, /\bfs\s*[.(]/, /node:/, /\brequire\s*\(/, /\bfetch\s*\(/, /XMLHttpRequest/, /https?:\/\//, /\bnew Date\b|Date\.now/, /Math\.random/, /\bglobalThis\b/, /\bwindow\s*\./, /\bdocument\s*\./, /vscode/, /\bawait\b/, /\basync\b/, /\bPromise\b/, /setTimeout\s*\(/, /console\s*\./]) {
    assert.ok(!forbidden.test(code), `terminal-intent.ts must not reference ${forbidden}`);
  }
  const compiled = fs.readFileSync(path.join(repoRoot, 'out', 'terminal-intent.js'), 'utf8');
  assert.deepEqual([...compiled.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]), ['./terminal-player']);

  // Runtime: any touch of fs / child_process / net / fetch / clock / randomness would throw.
  const trap = (object, names) => names.map((name) => { const original = object[name]; if (typeof original !== 'function') return () => {}; object[name] = () => { throw new Error(`classifier touched ${name}`); }; return () => { object[name] = original; }; });
  const restores = [
    ...trap(require('node:fs'), ['readFileSync', 'writeFileSync', 'existsSync', 'statSync', 'readdirSync', 'openSync', 'appendFileSync']),
    ...trap(require('node:child_process'), ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']),
    ...trap(require('node:net'), ['connect', 'createConnection']),
    ...trap(require('node:http'), ['request', 'get']),
    ...trap(globalThis, ['fetch', 'setTimeout', 'setInterval']),
    ...trap(Date, ['now']),
    ...trap(Math, ['random'])
  ];
  try {
    for (const input of [...ACCEPTED.map(([c]) => c), ...QUESTIONS, ...Object.values(UNSUPPORTED).flat(), ...fuzzInputs(2_000, 7)]) classifyShellIntent(input);
  } finally { for (const restore of restores) restore(); }
});

// ---------------------------------------------------------------------------
// TI-11 unwired, TI-12/13 neighbours, TI-14/15 breadcrumbs
// ---------------------------------------------------------------------------

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out); else if (predicate(full)) out.push(full);
  }
  return out;
}

test('TI-11. Only canonical routing-policy imports the classifier; browser, daemon, dispatcher and Terminal execution do not duplicate it', () => {
  const importers = [];
  for (const root of ['src', 'out', 'tools']) {
    for (const file of walk(path.join(repoRoot, root), (f) => /\.(ts|js|mjs|cjs|html)$/.test(f) && !f.endsWith('.map'))) {
      if (/[\\/]terminal-intent\.(ts|js|d\.ts)$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/terminal-intent|classifyShellIntent|SHELL_INTENT_RULES/.test(text)) importers.push(path.relative(repoRoot, file));
    }
  }
  assert.deepEqual(importers.sort(), [path.normalize('src/routing-policy.ts'), path.normalize('out/routing-policy.js')].sort(), 'one canonical routing policy source and its build output own classification');
  for (const file of ['src/control-plane/route-constraints.ts', 'src/control-plane/router.ts', 'src/control-plane/daemon.ts', 'src/control-plane/work-ledger.ts', 'src/player-roster.ts', 'src/terminal-player.ts', 'src/stadium-client.ts', 'src/extension.ts']) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'latin1');
    assert.ok(!/terminal-intent|classifyShellIntent|ShellIntent/.test(text), `${file} is not wired to the classifier`);
  }
});

test('TI-12/13. Existing Terminal execution and S54.2-S54.4 behaviour are intact: their suites are present and are exercised by the full run', () => {
  for (const file of ['p0-1-terminal-player.test.mjs', 'live-player-terminal-v02-transport.test.mjs', 'live-player-console-first-down.test.mjs', 's53-advanced-player-discovery.test.mjs', 'terminal-evidence-retention.test.mjs', 's54-4-terminal-success-retention.test.mjs']) {
    assert.ok(fs.existsSync(path.join(repoRoot, 'test', file)), `${file} still exists`);
  }
  // The explicit boundary this classifier sits inside is unchanged in behaviour.
  assert.equal(checkTerminalCommand('git status').ok, true);
  assert.equal(checkTerminalCommand('   ').ok, false);
  assert.equal(checkTerminalCommand('please figure out why the build is failing').ok, false);
  assert.equal(checkTerminalCommand('Why is git status failing?').ok, false);
});

test('TI-14. The classifier safety breadcrumb lives beside the exported function', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'terminal-intent.ts'), 'utf8');
  const at = source.indexOf('export function classifyShellIntent');
  const block = source.slice(source.lastIndexOf('/**', at), at);
  assert.match(block, /BREADCRUMB: TERMINAL-INTENT-BOUNDARY/);
  assert.match(block, /conservative AUTO Terminal intent boundary/);
  assert.match(block, /NARROWER than the explicit Terminal boundary/);
  assert.match(block, /every doubt, is `reasoning`/);
  assert.match(block, /CURRENT OWNER/);
  assert.match(block, /DO NOT broaden this grammar casually/);
  assert.doesNotMatch(block, /UNWIRED|Until it lands|Remove this UNWIRED note/);
  assert.equal((source.match(/BREADCRUMB: TERMINAL-INTENT-BOUNDARY/g) || []).length, 1, 'one searchable copy');
});

test('TI-15. The FINAL-SETTINGS-UX-PASS breadcrumb is graduated into SETTINGS-UX-HIERARCHY and child cards are nested', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  // Graduated: no unresolved FINAL-SETTINGS-UX-PASS comment remains
  assert.equal(html.includes('BREADCRUMB: FINAL-SETTINGS-UX-PASS'), false, 'unresolved breadcrumb graduated');
  const comments = [...html.matchAll(/<!--([\s\S]*?)-->/g)].filter((m) => m[1].includes('BREADCRUMB: SETTINGS-UX-HIERARCHY'));
  assert.equal(comments.length, 1, 'graduated code-local invariant');
  const [full] = comments;
  for (const phrase of ['Developer settings preserve feature ownership visually', 'Dev Mode gates developer-only presentation', 'View Player Terminal', 'Terminal Success Retention', 'Advanced Player Discovery']) {
    assert.ok(full[1].includes(phrase), `graduated breadcrumb states: ${phrase}`);
  }
  // Nested structure: terminalRetentionCard and advancedPlayerDiscoveryCard are nested inside livePlayerConsoleCard
  const parentStart = html.indexOf('<div id="livePlayerConsoleCard"');
  const parentClose = html.indexOf('</div>\n\n      <div id="scoutOpenRouterCard"');
  const parentSlice = html.slice(parentStart, parentClose);
  assert.ok(parentSlice.includes('id="terminalRetentionCard"'), 'Terminal Success Retention is nested inside View Player Terminal');
  assert.ok(parentSlice.includes('id="advancedPlayerDiscoveryCard"'), 'Advanced Player Discovery is nested inside View Player Terminal');
  assert.ok(parentSlice.indexOf('id="terminalRetentionCard"') < parentSlice.indexOf('id="advancedPlayerDiscoveryCard"'), 'retention before discovery');
});
