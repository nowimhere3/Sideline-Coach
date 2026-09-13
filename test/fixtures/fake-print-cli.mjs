#!/usr/bin/env node
/**
 * Fake structured-print CLI for Controlled Claude / AntiGravity tests (Q2.10C).
 * Shapes mirror what Claude Code 2.1.270 and AntiGravity 1.2.2 emitted in the
 * Q2.10C provider proofs. No network, no model calls.
 *
 *   argv[2]            'claude' | 'agy'
 *   FAKE_PRINT_STATE   directory holding persisted sessions
 *   FAKE_PRINT_LOG     JSONL file: one record per invocation (args, cwd, prompt)
 *   FAKE_PRINT_MODE    normal | no-result | fail-result | missing-authority-flag | slow-init
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const [provider, ...args] = process.argv.slice(2);
const mode = process.env.FAKE_PRINT_MODE || 'normal';
const stateDir = process.env.FAKE_PRINT_STATE || join(process.cwd(), '.fake-print-state');
mkdirSync(stateDir, { recursive: true });
const sessionsFile = join(stateDir, `${provider}-sessions.json`);
const sessions = new Set(existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile, 'utf8')) : []);
const saveSessions = () => writeFileSync(sessionsFile, JSON.stringify([...sessions]));
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);
const log = (extra) => { if (process.env.FAKE_PRINT_LOG) appendFileSync(process.env.FAKE_PRINT_LOG, `${JSON.stringify({ provider, args, cwd: process.cwd(), ...extra })}\n`); };
const readStdin = () => new Promise((resolve) => { let text = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => (text += c)); process.stdin.on('end', () => resolve(text)); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (provider === 'claude') await claude();
else await agy();

async function claude() {
  if (args[0] === '--help') {
    const authority = mode === 'missing-authority-flag' ? '"auto", "manual"' : '"acceptEdits", "auto", "bypassPermissions", "manual"';
    const full = mode === 'missing-authority-flag' ? '' : '  --dangerously-skip-permissions   Bypass all permission checks\n';
    process.stdout.write(`Usage: claude [options]\n${full}  --effort <level>\n  --input-format <format> "stream-json"\n  --model <model>\n  --permission-mode <mode> (choices: ${authority})\n  --permission-prompts <target>\n  -r, --resume [value]\n  --session-id <uuid>\n`);
    return log({ kind: 'help' });
  }
  if (args[0] === '--version') { process.stdout.write('2.1.270 (Claude Code)\n'); return log({ kind: 'version' }); }
  if (args[0] === '-p' && args[1] === '/model') { process.stdout.write('Current model: `Opus 5` (effort: high)\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, default, or a full model ID.\n'); return log({ kind: 'probe-model' }); }
  if (args[0] === '-p' && args[1] === '/effort') { process.stdout.write('Usage: /effort <low|medium|high|xhigh|max|auto>\n'); return log({ kind: 'probe-effort' }); }

  const resume = flag('--resume');
  const named = flag('--session-id');
  const sessionId = resume ?? named;
  if (resume && !sessions.has(resume)) {
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: randomUUID() });
    process.stderr.write(`No conversation found with session ID: ${resume}\n`);
    log({ kind: 'turn', refused: 'missing' });
    process.exit(1);
  }
  if (named && sessions.has(named)) {
    process.stderr.write(`Error: Session ID ${named} is already in use.\n`);
    log({ kind: 'turn', refused: 'in-use' });
    process.exit(1);
  }
  const input = await readStdin();
  const lines = input.split('\n').filter(Boolean);
  if (!lines.length) { log({ kind: 'turn', empty: true }); return; }
  const frame = JSON.parse(lines[0]);
  const prompt = frame?.message?.content;
  if (frame.type !== 'user' || typeof prompt !== 'string') { process.stderr.write('bad stream input\n'); process.exit(2); }
  if (named) { sessions.add(named); saveSessions(); }
  const fullAutonomy = args.includes('--dangerously-skip-permissions');
  const shellExecuted = fullAutonomy && prompt.includes('FULL_AUTONOMY_SHELL_PROOF');
  if (shellExecuted) writeFileSync(join(process.cwd(), 'claude-shell-proof.txt'), 'CLAUDE_FULL_AUTONOMY_OK');
  log({ kind: 'turn', prompt, sessionId, shellExecuted });
  if (mode === 'slow-init') await sleep(400);
  const model = flag('--model') === 'sonnet' ? 'claude-sonnet-5' : flag('--model') === 'haiku' ? 'claude-haiku-4-5' : 'claude-opus-5';
  out({ type: 'system', subtype: 'init', cwd: process.cwd(), session_id: sessionId, model, permissionMode: flag('--permission-mode') });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: `OK ${prompt.slice(0, 40)}` }] }, session_id: sessionId });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: join(process.cwd(), 'proof.txt') } }] }, session_id: sessionId });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git init' } }] }, session_id: sessionId });
  if (!fullAutonomy) out({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', session_id: sessionId });
  if (mode === 'no-result') process.exit(0);
  if (mode === 'fail-result') {
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'model overloaded', session_id: sessionId, permission_denials: [] });
    return;
  }
  await sleep(20);
  out({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: sessionId, permission_denials: fullAutonomy ? [] : [{ tool_name: 'Bash' }] });
}

async function agy() {
  if (args[0] === '--help') {
    const modeLine = mode === 'missing-authority-flag' ? '  --mode   Set the agent execution mode (plan)' : '  --mode   Set the agent execution mode for this session (accept-edits, plan)';
    const full = mode === 'missing-authority-flag' ? '' : '  --dangerously-skip-permissions   Auto-approve all tool permission requests without prompting\n';
    process.stderr.write(`Usage of agy.exe:\n  --conversation   Resume a previous conversation by ID\n${full}  --effort   (low|medium|high)\n  --input-format   (text, stream-json)\n${modeLine}\n  --model   Model for the current CLI session\n`);
    log({ kind: 'help' });
    process.exit(2);
  }
  if (args[0] === '--version') { process.stdout.write('1.2.2\n'); return log({ kind: 'version' }); }
  if (args[0] === 'models') {
    process.stdout.write('Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\ngemini-3.1-pro-low\tGemini 3.1 Pro (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n');
    return log({ kind: 'models' });
  }
  const requested = flag('--conversation');
  let conversation = requested;
  if (!requested || !sessions.has(requested)) {
    if (requested) process.stderr.write(`warning: conversation "${requested}" not found\n`);
    conversation = randomUUID();
    sessions.add(conversation);
    saveSessions();
  }
  if (mode === 'slow-init') await sleep(400);
  // Real AntiGravity emits init BEFORE reading stdin.
  out({ event: 'init', conversation_id: conversation, init: { model: flag('--model'), permission_mode: 'request-review' } });
  const input = await readStdin();
  const lines = input.split('\n').filter(Boolean);
  if (!lines.length) { log({ kind: 'turn', empty: true, conversation, requested }); return; }
  const frame = JSON.parse(lines[0]);
  const prompt = frame?.message?.content;
  if (frame.event !== 'user' || typeof prompt !== 'string') {
    out({ event: 'result', result: { conversation_id: conversation, status: 'ERROR', error: 'stream input message is missing the "event" field' } });
    process.exit(1);
  }
  const fullAutonomy = args.includes('--dangerously-skip-permissions');
  const shellExecuted = fullAutonomy && prompt.includes('FULL_AUTONOMY_SHELL_PROOF');
  if (shellExecuted) writeFileSync(join(process.cwd(), 'antigravity-shell-proof.txt'), 'ANTIGRAVITY_FULL_AUTONOMY_OK');
  log({ kind: 'turn', prompt, conversation, requested, shellExecuted });
  out({ event: 'step_update', step_update: { conversation_id: conversation, step_type: 'agent_response', state: 'ACTIVE', text_delta: `OK ${prompt.slice(0, 40)}` } });
  out({ event: 'step_update', step_update: { conversation_id: conversation, step_type: 'tool', state: 'ACTIVE', tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'git init' } } } });
  if (mode === 'no-result') process.exit(0);
  const ok = mode !== 'fail-result';
  out({ event: 'result', result: { conversation_id: conversation, status: ok ? 'SUCCESS' : 'ERROR', error: ok ? undefined : 'quota exceeded', num_turns: 1, denied_actions: ok && !fullAutonomy ? [{ action: 'command', display_name: 'RunCommand' }] : [] } });
}
