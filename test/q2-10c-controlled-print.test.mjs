/**
 * Q2.10C — Controlled Claude + Controlled AntiGravity.
 *
 * Every test drives the real adapter runtime against a fake print-mode CLI whose
 * frames mirror what Claude Code 2.1.270 and AntiGravity 1.2.2 emitted in the
 * Q2.10C provider proofs. No provider quota is spent.
 */

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAntiGravityControlFactory,
  createClaudeControlFactory,
  CLAUDE_AUTHORITY_ARGS,
  ANTIGRAVITY_AUTHORITY_ARGS,
  CLAUDE_FULL_AUTONOMY_ARGS,
  ANTIGRAVITY_FULL_AUTONOMY_ARGS
} from '../out/player-control/structured-print.js';
import { PlayerControlHost } from '../out/player-control/host.js';
import { authorityForPlayer, normalizePlayerAuthorityPolicy, permissionSettingForPlayer, PLAYER_PERMISSION_CHOICES } from '../out/player-authority.js';
import { antigravityModelArgs, parseAntiGravityModels, projectInstanceControls } from '../out/provider-control.js';
import { ClaudeRoutingPolicy, AntiGravityRoutingPolicy, resolveCoachAuto, createRoutingPolicies } from '../out/routing-policy.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-print-cli.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-q210c-'));
after(async () => { await rm(scratch, { recursive: true, force: true }); });
let sequence = 0;

class MemoryStore {
  constructor(value = []) { this.value = structuredClone(value); }
  load() { return structuredClone(this.value); }
  async save(records) { this.value = structuredClone(records); }
}

const FULL_AUTONOMY = { permission: 'full-autonomy' };
const CODEX_AUTHORITY = { approvalPolicy: 'never', sandbox: 'danger-full-access' };

async function lab(provider, mode = 'normal') {
  const dir = join(scratch, `${++sequence}-${provider}`);
  await mkdir(dir, { recursive: true });
  const log = join(dir, 'invocations.jsonl');
  const options = {
    command: process.execPath,
    prefixArgs: [fixture, provider === 'claude' ? 'claude' : 'agy'],
    env: { FAKE_PRINT_STATE: join(dir, 'state'), FAKE_PRINT_LOG: log, FAKE_PRINT_MODE: mode },
    initTimeoutMs: 5_000,
    probeTimeoutMs: 10_000
  };
  const factory = provider === 'claude' ? createClaudeControlFactory(options) : createAntiGravityControlFactory(options);
  const invocations = async () => {
    try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  };
  return { dir, factory, invocations, options };
}

const request = (instanceId, playerType, authority = FULL_AUTONOMY, seat = 1, gameRoot = repoRoot) => ({ instanceId, playerType, seat, gameRoot, gameId: 'g1', authority });

function collect(control) {
  const events = [];
  control.onEvent((event) => events.push(event));
  return {
    events,
    until: async (predicate, ms = 8_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = events.find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`event not seen; got ${JSON.stringify(events.map((e) => `${e.kind}:${e.state ?? e.category ?? ''}`))}`);
    }
  };
}

const turnsOf = async (invocations) => (await invocations()).filter((entry) => entry.kind === 'turn' && entry.prompt);

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

test('Q2.10C.1-1. Human authority decision: Coach-managed Controlled Players default to Full Autonomy', () => {
  assert.deepEqual(authorityForPlayer('claude'), FULL_AUTONOMY);
  assert.deepEqual(authorityForPlayer('antigravity'), FULL_AUTONOMY);
  assert.deepEqual(authorityForPlayer('codex'), CODEX_AUTHORITY, 'Codex keeps its certified authority');
  assert.equal(authorityForPlayer('terminal'), undefined);
  assert.deepEqual(normalizePlayerAuthorityPolicy({ claude: 'accept-edits', antigravity: 'ask-every-time' }), {
    codex: 'full-autonomy', claude: 'ask-for-risky-actions', antigravity: 'ask-every-time'
  }, 'the old stored value migrates without changing other explicit choices');
  assert.equal(permissionSettingForPlayer('claude'), 'full-autonomy', 'selected authority is projectable truthfully');
  assert.deepEqual(PLAYER_PERMISSION_CHOICES.map(({ id, label }) => `${id}:${label}`), [
    'full-autonomy:Full Autonomy',
    'ask-for-risky-actions:Ask for risky actions',
    'ask-every-time:Ask every time'
  ]);
  assert.deepEqual([...CLAUDE_AUTHORITY_ARGS], ['--dangerously-skip-permissions']);
  assert.deepEqual([...ANTIGRAVITY_AUTHORITY_ARGS], ['--dangerously-skip-permissions']);
  assert.deepEqual([...CLAUDE_FULL_AUTONOMY_ARGS], ['--dangerously-skip-permissions']);
  assert.deepEqual([...ANTIGRAVITY_FULL_AUTONOMY_ARGS], ['--dangerously-skip-permissions']);
});

test('Q2.10C-2. An adapter refuses to run under any other authority, and a CLI missing the authority flags fails closed', async () => {
  const claude = await lab('claude');
  await assert.rejects(claude.factory.open(request('claude-11111111', 'claude', CODEX_AUTHORITY)), (error) => error.outcome === 'needs-decision');
  assert.equal((await claude.invocations()).length, 0, 'nothing launched');

  for (const provider of ['claude', 'antigravity']) {
    const broken = await lab(provider, 'missing-authority-flag');
    await assert.rejects(broken.factory.open(request(`${provider}-22222222`, provider)), (error) => error.outcome === 'needs-verification' && /selected Full Autonomy permission setting/.test(error.message) && /won't silently use different permissions/.test(error.message));
    assert.equal((await turnsOf(broken.invocations)).length, 0, `${provider}: no Play and no conversation under unverified authority`);
  }
});

// ---------------------------------------------------------------------------
// Controlled Claude
// ---------------------------------------------------------------------------

test('Q2.10C-3. Controlled Claude: each instance owns its session; per-Play settings and Full Autonomy reach every invocation', async () => {
  const claude = await lab('claude');
  const store = new MemoryStore();
  const host = new PlayerControlHost(store);
  host.register('claude', claude.factory);
  const one = await host.open(request('claude-aaaaaaaa', 'claude', FULL_AUTONOMY, 1));
  const two = await host.open(request('claude-bbbbbbbb', 'claude', FULL_AUTONOMY, 2));
  assert.equal(one.kind, 'ready');
  assert.equal(two.kind, 'ready');
  assert.notEqual(one.control.providerSessionRef, two.control.providerSessionRef, 'Claude 1 and Claude 2 never share a conversation');
  assert.deepEqual(store.value.map((r) => r.adapter), ['claude-print-stream', 'claude-print-stream']);

  const watch1 = collect(one.control);
  const first = await host.deliver('claude-aaaaaaaa', 'Reply exactly: CLAUDE CONTROLLED OK', { model: 'sonnet', effort: 'medium' });
  assert.equal(first.kind, 'accepted');
  const done = await watch1.until((e) => e.kind === 'turn' && e.state === 'completed');
  assert.doesNotMatch(done.summary, /approval|skipped/i, 'Full Autonomy does not report a headless approval skip');
  assert.ok(!watch1.events.some((e) => e.kind === 'request' && e.state === 'declined'));
  assert.ok(watch1.events.some((e) => e.kind === 'progress' && e.category === 'command' && e.summary === 'git init'));

  const second = await host.deliver('claude-aaaaaaaa', 'Second Play', { model: 'default', effort: 'default' });
  assert.equal(second.kind, 'accepted');
  await watch1.until((e) => e.kind === 'turn' && e.state === 'completed' && e.turnRef === second.turnRef);

  const watch2 = collect(two.control);
  assert.equal((await host.deliver('claude-bbbbbbbb', 'Claude 2 Play', { model: 'haiku', effort: 'low' })).kind, 'accepted');
  await watch2.until((e) => e.kind === 'turn' && e.state === 'completed');

  const turns = await turnsOf(claude.invocations);
  assert.equal(turns.length, 3);
  const [p1, p2, p3] = turns;
  for (const turn of turns) {
    assert.ok(turn.args.includes('--dangerously-skip-permissions'), 'Full Autonomy authority applies independently to every Player and Play');
    assert.ok(!turn.args.includes('--permission-mode') && !turn.args.includes('--mode'), 'no restrictive fallback is mixed in');
    assert.equal(turn.cwd.toLowerCase(), repoRoot.toLowerCase(), 'runs inside the Game');
  }
  assert.deepEqual(p1.args.slice(p1.args.indexOf('--session-id'), p1.args.indexOf('--session-id') + 2), ['--session-id', one.control.providerSessionRef], 'first Play names the session');
  assert.ok(p1.args.join(' ').includes('--model sonnet --effort medium'), 'per-Play model + effort as invocation flags');
  assert.deepEqual(p2.args.slice(p2.args.indexOf('--resume'), p2.args.indexOf('--resume') + 2), ['--resume', one.control.providerSessionRef], 'resume continues the SAME session');
  assert.ok(!p2.args.includes('--model') && !p2.args.includes('--effort'), 'Provider Default never overrides');
  assert.equal(p3.sessionId, two.control.providerSessionRef, "Claude 2's Play ran in Claude 2's session only");
  assert.notEqual(p3.sessionId, p1.sessionId);
  assert.ok(p3.args.join(' ').includes('--model haiku --effort low'));
  assert.ok(!turns.some((t) => t.args.includes('/model') || t.args.includes('/effort')), 'no slash commands: nothing touches global settings');
  await host.dispose();
});

test('Q2.10C-4. Controlled Claude restore: history present → same session; history lost → needs decision with real models; nothing run yet → no process at all', async () => {
  const claude = await lab('claude');
  const opener = new PlayerControlHost(new MemoryStore());
  opener.register('claude', claude.factory);
  const opened = await opener.open(request('claude-cccccccc', 'claude'));
  const watch = collect(opened.control);
  await opener.deliver('claude-cccccccc', 'Make history');
  await watch.until((e) => e.kind === 'turn' && e.state === 'completed');
  const stored = structuredClone(opener.binding('claude-cccccccc'));
  assert.equal(stored.historyExpected, true);
  await opener.dispose();

  const restorer = new PlayerControlHost(new MemoryStore([stored]));
  restorer.register('claude', claude.factory);
  restorer.planRestores('g1');
  const restored = await restorer.restore(request('claude-cccccccc', 'claude'));
  assert.equal(restored.kind, 'ready');
  assert.equal(restored.openedFresh, false);
  assert.equal(restored.control.providerSessionRef, stored.sessionRef, 'same conversation after restart');
  const afterRestore = collect(restored.control);
  await restorer.deliver('claude-cccccccc', 'After restart');
  await afterRestore.until((e) => e.kind === 'turn' && e.state === 'completed');
  const last = (await turnsOf(claude.invocations)).at(-1);
  assert.ok(last.args.includes('--resume') && last.args.includes(stored.sessionRef));
  await restorer.dispose();

  const lost = { ...stored, instanceId: 'claude-dddddddd', sessionRef: '00000000-0000-4000-8000-000000000000' };
  const lostHost = new PlayerControlHost(new MemoryStore([lost]));
  lostHost.register('claude', claude.factory);
  lostHost.planRestores('g1');
  const outcome = await lostHost.restore(request('claude-dddddddd', 'claude'));
  assert.equal(outcome.kind, 'needs-decision', 'never silently starts fresh when history was expected');
  assert.match(outcome.message, /conversation is no longer available/);
  assert.deepEqual(outcome.capabilities.models.map((m) => m.id), ['opus', 'sonnet', 'haiku', 'fable']);
  await lostHost.dispose();

  const fresh = { ...stored, instanceId: 'claude-eeeeeeee', sessionRef: '11111111-1111-4111-8111-111111111111', historyExpected: false };
  const before = (await claude.invocations()).length;
  const freshHost = new PlayerControlHost(new MemoryStore([fresh]));
  freshHost.register('claude', claude.factory);
  freshHost.planRestores('g1');
  const freshOutcome = await freshHost.restore(request('claude-eeeeeeee', 'claude'));
  assert.equal(freshOutcome.kind, 'ready');
  assert.equal(freshOutcome.control.providerSessionRef, fresh.sessionRef);
  const probes = (await claude.invocations()).slice(before).filter((e) => e.kind === 'turn');
  assert.equal(probes.length, 0, 'a session with no Plays is not probed');
  await freshHost.dispose();
});

test('Q2.10C-5. Claude failure is truthful: no result → Unknown (never Completed); provider error → Failed', async () => {
  for (const [mode, expected] of [['no-result', 'unknown'], ['fail-result', 'failed']]) {
    const claude = await lab('claude', mode);
    const control = await claude.factory.open(request('claude-ffffffff', 'claude'));
    const watch = collect(control);
    const outcome = await control.deliver('Play', 'client-1', {});
    assert.equal(outcome.kind, 'accepted');
    const end = await watch.until((e) => e.kind === 'turn' && ['completed', 'failed', 'unknown', 'interrupted'].includes(e.state));
    assert.equal(end.state, expected, mode);
    assert.ok(!watch.events.some((e) => e.kind === 'turn' && e.state === 'completed'), `${mode}: never fabricates completion`);
    assert.equal(control.state, 'ready');
    await control.close();
  }
});

test('Q2.10C-6. Controlled Claude capabilities come from its own local answers: real aliases, efforts without "auto", Claude default marked', async () => {
  const claude = await lab('claude');
  const control = await claude.factory.open(request('claude-12121212', 'claude'));
  const snapshot = await control.queryCapabilities();
  assert.equal(snapshot.provider, 'claude');
  assert.equal(snapshot.freshness, 'live');
  assert.deepEqual(snapshot.models.map((m) => `${m.id}=${m.displayName}`), ['opus=Opus', 'sonnet=Sonnet', 'haiku=Haiku', 'fable=Fable']);
  assert.equal(snapshot.defaultModelId, 'opus');
  assert.deepEqual([...snapshot.models[0].supportedEfforts], ['low', 'medium', 'high', 'xhigh', 'max']);
  const controls = projectInstanceControls({ playerType: 'claude', transport: 'controlled', capability: snapshot }, undefined);
  assert.equal(controls.model.state, 'available', 'Controlled Claude model control is available, not requires-proof');
  assert.equal(controls.effort.state, 'available');
  await control.close();
});

// ---------------------------------------------------------------------------
// Controlled AntiGravity
// ---------------------------------------------------------------------------

test('Q2.10C-7. Controlled AntiGravity: each instance owns a conversation; model controls and Full Autonomy reach every invocation', async () => {
  const agy = await lab('antigravity');
  const host = new PlayerControlHost(new MemoryStore());
  host.register('antigravity', agy.factory);
  const one = await host.open(request('antigravity-aaaaaaaa', 'antigravity', FULL_AUTONOMY, 1));
  const two = await host.open(request('antigravity-bbbbbbbb', 'antigravity', FULL_AUTONOMY, 2));
  assert.equal(one.kind, 'ready');
  assert.notEqual(one.control.providerSessionRef, two.control.providerSessionRef);
  await one.control.queryCapabilities(); // teaches the adapter AntiGravity's real variant ids

  const watch = collect(one.control);
  assert.equal((await host.deliver('antigravity-aaaaaaaa', 'Reply exactly: ANTIGRAVITY CONTROLLED OK', { model: 'gemini-3.8-flash', effort: 'high' })).kind, 'accepted');
  const done = await watch.until((e) => e.kind === 'turn' && e.state === 'completed');
  assert.doesNotMatch(done.summary, /approval|skipped/i);
  assert.ok(!watch.events.some((e) => e.kind === 'request' && e.state === 'declined'));
  const watch2 = collect(two.control);
  assert.equal((await host.deliver('antigravity-bbbbbbbb', 'AntiGravity 2 Play', { model: 'default', effort: 'default' })).kind, 'accepted');
  await watch2.until((e) => e.kind === 'turn' && e.state === 'completed');

  const [p1, p2] = await turnsOf(agy.invocations);
  assert.equal(p1.conversation, one.control.providerSessionRef, 'continued the exact conversation');
  assert.equal(p1.requested, one.control.providerSessionRef);
  assert.ok(p1.args.includes('--dangerously-skip-permissions'));
  assert.ok(p1.args.join(' ').includes('--model gemini-3.8-flash-high'), 'Gemini 3.8 Flash + High → provider variant id');
  assert.ok(!p1.args.includes('--mode'), 'does not silently fall back to accept-edits');
  assert.ok(p2.args.includes('--dangerously-skip-permissions'), 'a sibling receives the policy independently');
  assert.equal(p2.conversation, two.control.providerSessionRef, "AntiGravity 2's Play stayed in its own conversation");
  assert.ok(!p2.args.includes('--model') && !p2.args.includes('--effort'), 'Provider Default never overrides');
  await host.dispose();
});

test('Q2.10C.1-8. Coach-managed Claude and AntiGravity execute a shell-capable Play without an approval skip', async () => {
  for (const provider of ['claude', 'antigravity']) {
    const environment = await lab(provider);
    const control = await environment.factory.open(request(`${provider}-51515151`, provider, FULL_AUTONOMY, 1, environment.dir));
    const watch = collect(control);
    const outcome = await control.deliver('FULL_AUTONOMY_SHELL_PROOF: execute the harmless scratch command', 'proof-1', {});
    assert.equal(outcome.kind, 'accepted');
    const done = await watch.until((event) => event.kind === 'turn' && event.state === 'completed');
    assert.doesNotMatch(done.summary, /approval|skipped/i);
    assert.equal(
      await readFile(join(environment.dir, `${provider}-shell-proof.txt`), 'utf8'),
      provider === 'claude' ? 'CLAUDE_FULL_AUTONOMY_OK' : 'ANTIGRAVITY_FULL_AUTONOMY_OK'
    );
    const [turn] = await turnsOf(environment.invocations);
    assert.equal(turn.shellExecuted, true);
    assert.ok(turn.args.includes('--dangerously-skip-permissions'));
    await control.close();
  }
});

test('Q2.10C-8. AntiGravity never runs a Play in a conversation it silently replaced: the Play is refused BEFORE it is sent', async () => {
  const agy = await lab('antigravity');
  const control = await agy.factory.open(request('antigravity-cccccccc', 'antigravity'));
  // The conversation disappears (deleted in AntiGravity); `--conversation` would now start a NEW one.
  await writeFile(join(agy.dir, 'state', 'agy-sessions.json'), '[]');
  const watch = collect(control);
  const outcome = await control.deliver('Must not run elsewhere', 'client-x', {});
  assert.equal(outcome.kind, 'refused');
  assert.equal(outcome.reason, 'closed');
  assert.match(outcome.message, /Nothing was sent/);
  assert.equal((await turnsOf(agy.invocations)).length, 0, 'the prompt never reached the replacement conversation');
  assert.equal(control.state, 'lost');
  assert.ok(watch.events.some((e) => e.kind === 'channel' && e.state === 'lost'), 'roster is told, so restore decides truthfully');
  await control.close();
});

test('Q2.10C-9. AntiGravity restore: present → same conversation; missing with history → needs decision; missing with no Plays → one fresh conversation', async () => {
  const agy = await lab('antigravity');
  const opened = await agy.factory.open(request('antigravity-dddddddd', 'antigravity'));
  const ref = opened.providerSessionRef;
  await opened.close();
  const binding = { instanceId: 'antigravity-dddddddd', playerType: 'antigravity', seat: 1, adapter: 'antigravity-print-stream', sessionRef: ref, historyExpected: true, pendingPlay: null, gameId: 'g1' };

  const present = await agy.factory.restore(request('antigravity-dddddddd', 'antigravity'), binding);
  assert.equal(present.kind, 'ready');
  assert.equal(present.control.providerSessionRef, ref);
  await present.control.close();

  const missingBinding = { ...binding, sessionRef: '99999999-9999-4999-8999-999999999999' };
  const missing = await agy.factory.restore(request('antigravity-dddddddd', 'antigravity'), missingBinding);
  assert.equal(missing.kind, 'needs-decision');
  assert.ok(missing.capabilities.models.some((m) => m.id === 'gemini-3.8-flash'), 'real models survive a lost conversation');

  const empty = await agy.factory.restore(request('antigravity-dddddddd', 'antigravity'), { ...missingBinding, historyExpected: false });
  assert.equal(empty.kind, 'ready');
  assert.equal(empty.openedFresh, true);
  assert.notEqual(empty.control.providerSessionRef, missingBinding.sessionRef);
  await empty.control.close();

  const pending = await agy.factory.restore(request('antigravity-dddddddd', 'antigravity'), { ...binding, pendingPlay: { clientRef: 'c1' } });
  assert.equal(pending.reconciliation.kind, 'unknown', 'a Play lost across restart is Unknown, never assumed complete');
  await pending.control.close();
});

test('Q2.10C-10. AntiGravity model normalisation: families + reasoning, provider syntax kept inside the adapter', () => {
  const catalog = parseAntiGravityModels('gemini-3.8-flash-high\tGemini 3.8 Flash (High)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\ngemini-3.1-pro-low\tGemini 3.1 Pro (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n');
  assert.deepEqual(antigravityModelArgs(catalog, 'gemini-3.8-flash', 'low'), ['--model', 'gemini-3.8-flash-low']);
  assert.deepEqual(antigravityModelArgs(catalog, 'gemini-3.8-flash', 'default'), ['--model', 'gemini-3.8-flash-medium'], "family without reasoning → AntiGravity's own default variant");
  assert.deepEqual(antigravityModelArgs(catalog, 'gemini-3.1-pro', 'medium'), ['--model', 'gemini-3.1-pro-high'], 'unsupported reasoning never invents a variant');
  assert.deepEqual(antigravityModelArgs(catalog, 'claude-sonnet-4-6', 'high'), ['--model', 'claude-sonnet-4-6'], 'a model without variants rejects --effort');
  assert.ok(catalog.some((model) => model.id === 'claude-opus-4-6-thinking'));
  assert.ok(catalog.some((model) => model.id === 'gpt-oss-120b-medium'), 'AntiGravity is projected from its live catalog, not assumed to be Gemini-only');
  assert.deepEqual(antigravityModelArgs(catalog, 'default', 'high'), ['--effort', 'high']);
  assert.deepEqual(antigravityModelArgs(catalog, undefined, undefined), []);
});

// ---------------------------------------------------------------------------
// Dispatcher integration + settings safety
// ---------------------------------------------------------------------------

test('Q2.10C-11. MANUAL Coach Auto resolves real Claude/AntiGravity values BEFORE the provider is invoked; Provider Default passes through', async () => {
  const claude = await lab('claude');
  const control = await claude.factory.open(request('claude-13131313', 'claude'));
  const claudeSnapshot = await control.queryCapabilities();
  await control.close();
  const agy = await lab('antigravity');
  const agyControl = await agy.factory.open(request('antigravity-13131313', 'antigravity'));
  const agySnapshot = await agyControl.queryCapabilities();
  await agyControl.close();

  const policies = createRoutingPolicies();
  assert.ok(policies.get('claude') instanceof ClaudeRoutingPolicy);
  assert.ok(policies.get('antigravity') instanceof AntiGravityRoutingPolicy);
  const claudeCandidate = { instanceId: 'claude-13131313', playerType: 'claude', transport: 'controlled', fieldLabel: 'Claude', state: 'ready', capability: claudeSnapshot };
  assert.deepEqual(resolveCoachAuto(claudeCandidate, 'Design the architecture for the ledger', { model: 'auto', effort: 'auto' }, policies), { model: 'opus', effort: 'high' });
  assert.deepEqual(resolveCoachAuto(claudeCandidate, 'Design the architecture for the ledger', { model: 'auto', effort: 'low' }, policies), { model: 'opus', effort: 'low' }, 'partial override keeps the human effort');
  assert.deepEqual(resolveCoachAuto(claudeCandidate, 'x', { model: 'default', effort: 'default' }, policies), { model: 'default', effort: 'default' });

  const agyCandidate = { instanceId: 'antigravity-13131313', playerType: 'antigravity', transport: 'controlled', fieldLabel: 'AntiGravity', state: 'ready', capability: agySnapshot };
  const resolved = resolveCoachAuto(agyCandidate, 'Fix typo in README', { model: 'gemini-3.8-flash', effort: 'auto' }, policies);
  assert.equal(resolved.model, 'gemini-3.8-flash');
  assert.ok(['low', 'medium', 'high'].includes(resolved.effort), 'Auto effort is one the chosen family really supports');
});

test("Q2.10C-12. Per-Play settings never touch the human's global provider settings", async () => {
  // The adapter is given a fake home with real-looking settings files; they must be byte-identical afterwards.
  const home = join(scratch, 'fake-home');
  await mkdir(join(home, '.claude'), { recursive: true });
  await mkdir(join(home, '.gemini', 'antigravity-cli'), { recursive: true });
  const files = [join(home, '.claude', 'settings.json'), join(home, '.gemini', 'antigravity-cli', 'settings.json')];
  for (const file of files) await writeFile(file, '{ "model": "opus" }\n');
  const hash = async () => Promise.all(files.map(async (f) => createHash('sha256').update(await readFile(f)).digest('hex')));
  const before = await hash();

  for (const provider of ['claude', 'antigravity']) {
    const env = await lab(provider);
    env.options.env.HOME = home;
    env.options.env.USERPROFILE = home;
    const factory = provider === 'claude' ? createClaudeControlFactory(env.options) : createAntiGravityControlFactory(env.options);
    const control = await factory.open(request(`${provider}-14141414`, provider));
    const watch = collect(control);
    await control.deliver('Switch models for this Play only', 'c1', { model: provider === 'claude' ? 'sonnet' : 'gemini-3.8-flash', effort: 'high' });
    await watch.until((e) => e.kind === 'turn' && e.state === 'completed');
    await control.close();
  }
  assert.deepEqual(await hash(), before);

  const source = await readFile(join(repoRoot, 'src', 'player-control', 'structured-print.ts'), 'utf8');
  assert.doesNotMatch(source, /writeFile|settings\.json|'\/model',\s*'[a-z]/, 'the adapter writes no provider settings and never issues /model <name>');
  assert.match(source, /CLAUDE_FULL_AUTONOMY_ARGS = \['--dangerously-skip-permissions'\]/);
  assert.match(source, /ANTIGRAVITY_FULL_AUTONOMY_ARGS = \['--dangerously-skip-permissions'\]/);
});

test('Q2.10C-13. Coach-launched Claude and AntiGravity are Controlled by default; adopted terminals are never converted', async () => {
  const adapters = await readFile(join(repoRoot, 'src', 'player-adapters.ts'), 'utf8');
  for (const id of ['claude', 'antigravity']) {
    const block = adapters.slice(adapters.indexOf(`id: '${id}'`), adapters.indexOf('}', adapters.indexOf(`id: '${id}'`)));
    assert.match(block, /hasControlledAdapter: true/, `${id} is recruited as a Controlled Player`);
  }
  const extension = await readFile(join(repoRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(extension, /register\('claude', createClaudeControlFactory\(\)\)/);
  assert.match(extension, /register\('antigravity', createAntiGravityControlFactory\(\)\)/);

  const roster = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  const adopt = roster.slice(roster.indexOf('async adoptExternalPlayer'), roster.indexOf('async addInstance('));
  assert.doesNotMatch(adopt, /controlHost|addControlledInstance/, 'adoption keeps the human-owned terminal as-is');
  assert.doesNotMatch(adopt, /authorityForPlayer|permissionSettingForPlayer/, 'adopted authority is never rewritten');
  assert.match(roster, /const authority = authorityForPlayer\(player\.id\);/);
  assert.match(roster, /permissionSetting: permissionSettingForPlayer\(record\.playerType\)/, 'controlled status represents the selected authority truthfully');
  assert.doesNotMatch(roster, /authority: \{ approvalPolicy: 'never', sandbox: 'danger-full-access' \}/, 'no hardcoded Codex authority for other Players');
});
