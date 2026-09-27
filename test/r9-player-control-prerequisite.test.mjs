// R9 prerequisite — Player Control provider-limit interruption + session-identity precondition (S57.23).
//
// Part 1  a turn carries `blocker` ONLY from provider-emitted structured evidence scoped to that turn:
//         Codex  certified TurnError.codexErrorInfo (usageLimitExceeded | rateLimitExceeded)
//         Claude rate_limit_event in the Play's own run, own session, status rejected, no covering overage
//         Never failure text, never account-level scarcity, never AntiGravity.
// Part 2  the blocker (and the turn's session key) reach the Work Ledger through the existing turn path.
// Part 3  `expectedSessionKey` is proven by Player Control before anything is sent; a silently reopened
//         fresh conversation (`reopenFresh`) changes the key, so an old-key continuation is refused pre-send.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import Module from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() { return (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}
const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) {
      const terminal = { name: options?.name ?? 'terminal', pty: options?.pty, exitStatus: undefined, processId: Promise.resolve(undefined), show() {}, sendText() {}, dispose() {} };
      if (options?.pty) options.pty.open?.();
      return terminal;
    },
    onDidOpenTerminal: () => ({ dispose() {} }),
    onDidCloseTerminal: () => ({ dispose() {} })
  },
  workspace: { workspaceFolders: undefined }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.call(this, request, ...rest);
};

const { CodexAppServerFactory, CodexCompatibilityRegistry, codexProviderLimitBlocker } = await import('../out/player-control/codex-app-server.js');
const { REQUIRED_CONTRACT, checkSchemaContract } = await import('../out/player-control/codex-contract.js');
const { createAntiGravityControlFactory, createClaudeControlFactory, claudeLimitRejection } = await import('../out/player-control/structured-print.js');
const { parseProviderLimitBlocker, providerSessionKey } = await import('../out/player-control/contract.js');
const { PlayerControlHost } = await import('../out/player-control/host.js');
const { PlayerRoster } = await import('../out/player-roster.js');
const { sessionKeyFor } = await import('../out/player-activity.js');
const { InstanceWorkLedger } = await import('../out/control-plane/work-ledger.js');
const { ControlPlaneRouter } = await import('../out/control-plane/router.js');
const { StadiumRegistry } = await import('../out/control-plane/stadium-registry.js');
const { StadiumClient } = await import('../out/stadium-client.js');

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const codexFixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const printFixture = join(testDir, 'fixtures', 'fake-print-cli.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-r9-prereq-'));
after(async () => { await rm(scratch, { recursive: true, force: true }); });
let sequence = 0;

class MemoryStore {
  constructor(value = []) { this.value = structuredClone(value); }
  load() { return structuredClone(this.value); }
  async save(records) { this.value = structuredClone(records); }
}

async function until(predicate, label, ms = 8_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${label}`);
}

// ─────────────────────────────── Part 1: Codex (certified) ───────────────────────────────

test('R9P-1 Codex provider-limit shape is certified against the installed codex-cli 0.157.1 schema', () => {
  const fixture = JSON.parse(readFileSync(join(testDir, 'fixtures', 'codex-0.157.1-turn-error.schema.json'), 'utf8'));
  assert.match(fixture.source, /0\.157\.1/);
  assert.deepEqual(REQUIRED_CONTRACT.fields.TurnError, ['message', 'codexErrorInfo']);
  assert.ok(REQUIRED_CONTRACT.enums.some((e) => e.definition === 'CodexErrorInfo' && e.value === 'usageLimitExceeded'));
  assert.ok(REQUIRED_CONTRACT.enums.some((e) => e.definition === 'CodexErrorInfo' && e.value === 'rateLimitExceeded'));
  // The verbatim provider definitions satisfy every new contract item (everything else is simply absent here).
  const check = checkSchemaContract({ 'codex_app_server_protocol.v2.schemas.json': { definitions: fixture.definitions } });
  assert.equal(check.ok, false);
  const r9Items = check.missing.filter((item) => /TurnError|CodexErrorInfo/.test(item));
  assert.deepEqual(r9Items, [], 'TurnError.message/codexErrorInfo and both limit codes are present in the real schema');
  // Without them, the certification would report exactly these items missing.
  const withoutCodes = structuredClone(fixture.definitions);
  withoutCodes.CodexErrorInfo.oneOf[0].enum = withoutCodes.CodexErrorInfo.oneOf[0].enum.filter((v) => v !== 'usageLimitExceeded');
  delete withoutCodes.TurnError.properties.codexErrorInfo;
  const missing = checkSchemaContract({ 'codex_app_server_protocol.v2.schemas.json': { definitions: withoutCodes } }).missing;
  assert.ok(missing.includes('TurnError.codexErrorInfo'));
  assert.ok(missing.includes("CodexErrorInfo value 'usageLimitExceeded'"));
});

test('R9P-2 an uncertified Codex (limit code dropped from its schema) fails closed at open', async () => {
  const log = join(scratch, `${++sequence}-probe.jsonl`);
  const factory = new CodexAppServerFactory({
    command: process.execPath, args: [codexFixture, `--case=${sequence}`], shell: false, closeGraceMs: 100,
    requestTimeoutMs: 2_000, retryDelayMs: 5, resumeRetryDelaysMs: [5], probeTimeoutMs: 8_000,
    compatibility: new CodexCompatibilityRegistry(),
    env: { FAKE_LOG_PATH: log, FAKE_VERSION: '7.42.0', FAKE_SCHEMA_DROP: "CodexErrorInfo value 'rateLimitExceeded'" }
  });
  await assert.rejects(
    factory.open({ instanceId: 'codex-9a9a9a9a', playerType: 'codex', seat: 1, gameRoot: repoRoot, authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } }),
    (error) => error.outcome === 'needs-verification' && /rateLimitExceeded/.test(error.diagnostic ?? '')
  );
});

async function codexTurn(mode) {
  const log = join(scratch, `${++sequence}-codex.jsonl`);
  const factory = new CodexAppServerFactory({
    command: process.execPath, args: [codexFixture, `--case=${sequence}`], shell: false, closeGraceMs: 100,
    requestTimeoutMs: 2_000, retryDelayMs: 5, resumeRetryDelaysMs: [5], probeTimeoutMs: 8_000,
    compatibility: new CodexCompatibilityRegistry(),
    env: { FAKE_LOG_PATH: log, FAKE_MODE: mode }
  });
  const control = await factory.open({ instanceId: `codex-${String(sequence).padStart(8, '0')}`, playerType: 'codex', seat: 1, gameRoot: repoRoot, authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } });
  const events = [];
  control.onEvent((event) => events.push(event));
  const outcome = await control.deliver('Implement it', `client-${sequence}`);
  assert.equal(outcome.kind, 'accepted');
  const terminal = await until(() => events.find((e) => e.kind === 'turn' && ['completed', 'failed', 'interrupted', 'unknown'].includes(e.state)), `codex ${mode} terminal turn`);
  await control.close();
  return terminal;
}

test('R9P-3 Codex: only a certified usage/rate-limit TurnError produces a blocker', async () => {
  const usage = await codexTurn('limit-usage');
  assert.equal(usage.state, 'failed');
  assert.deepEqual(usage.blocker, { kind: 'provider-limit', pool: 'codex', evidence: 'codex-turn-error', providerCode: 'usageLimitExceeded' });
  assert.equal('window' in usage.blocker || 'resetsAt' in usage.blocker, false, 'the turn error names no window or reset, so none is claimed');

  const rate = await codexTurn('limit-rate');
  assert.equal(rate.blocker.providerCode, 'rateLimitExceeded');

  const completed = await codexTurn('normal');
  assert.equal(completed.state, 'completed');
  assert.equal(completed.blocker, undefined, 'ordinary completion → no blocker');

  for (const mode of ['fail-other', 'fail-text-only', 'fail-object-info']) {
    const failed = await codexTurn(mode);
    assert.equal(failed.state, 'failed', mode);
    assert.equal(failed.blocker, undefined, `${mode}: unrelated failure → no blocker, whatever the message says`);
    assert.match(failed.summary, /usage limit|Rate limit|limit/i, 'the text says "limit", and is still ignored');
  }

  const accountTelemetry = await codexTurn('health');
  assert.equal(accountTelemetry.blocker, undefined, 'account-level rate-limit updates never become a turn blocker');

  // The pure mapper ignores text and non-limit codes entirely.
  assert.equal(codexProviderLimitBlocker({ message: 'usage limit exceeded' }), undefined);
  assert.equal(codexProviderLimitBlocker({ message: 'x', codexErrorInfo: 'serverOverloaded' }), undefined);
  assert.equal(codexProviderLimitBlocker({ message: 'x', codexErrorInfo: 'contextWindowExceeded' }), undefined);
  assert.equal(codexProviderLimitBlocker(null), undefined);
});

// ─────────────────────────────── Part 1: Claude / AntiGravity ───────────────────────────────

async function printTurn(provider, mode) {
  const dir = join(scratch, `${++sequence}-${provider}`);
  await mkdir(dir, { recursive: true });
  const options = {
    command: process.execPath,
    prefixArgs: [printFixture, provider === 'claude' ? 'claude' : 'agy'],
    env: { FAKE_PRINT_STATE: join(dir, 'state'), FAKE_PRINT_LOG: join(dir, 'log.jsonl'), FAKE_PRINT_MODE: mode },
    initTimeoutMs: 5_000,
    probeTimeoutMs: 10_000
  };
  const factory = provider === 'claude' ? createClaudeControlFactory(options) : createAntiGravityControlFactory(options);
  const instanceId = `${provider === 'claude' ? 'claude' : 'antigravity'}-${String(sequence).padStart(8, '0')}`;
  const control = await factory.open({ instanceId, playerType: provider === 'claude' ? 'claude' : 'antigravity', seat: 1, gameRoot: repoRoot, gameId: 'g1', authority: { permission: 'full-autonomy' } });
  const events = [];
  control.onEvent((event) => events.push(event));
  const outcome = await control.deliver('Implement it', `client-${sequence}`);
  assert.equal(outcome.kind, 'accepted', `${provider} ${mode} accepted`);
  const terminal = await until(() => events.find((e) => e.kind === 'turn' && ['completed', 'failed', 'interrupted', 'unknown'].includes(e.state)), `${provider} ${mode} terminal turn`);
  await control.close();
  return terminal;
}

test('R9P-4 Claude: a rejected rate_limit_event in the Play\'s own run, own session, no overage → blocker', async () => {
  const rejected = await printTurn('claude', 'limit-rejected');
  assert.equal(rejected.state, 'failed');
  assert.deepEqual(rejected.blocker, {
    kind: 'provider-limit', pool: 'claude', window: 'five_hour', resetsAt: 1790500000, evidence: 'claude-rate-limit-event', providerCode: 'rejected'
  });
  const ms = await printTurn('claude', 'limit-rejected-ms');
  assert.equal(ms.blocker.resetsAt, 1790500000, 'a millisecond reset is normalized to Unix seconds');
  const noResult = await printTurn('claude', 'limit-no-result');
  assert.equal(noResult.state, 'unknown');
  assert.equal(noResult.blocker?.providerCode, 'rejected', 'an unfinished Play refused by the limiter still carries its proof');
});

test('R9P-5 Claude: everything short of turn-scoped proof leaves the blocker absent', async () => {
  const cases = {
    'limit-overage': 'overage covers the rejected limiter: nothing was cut off',
    'limit-other-session': 'a frame for another conversation says nothing about this Play',
    'limit-recovered': 'the latest verdict in this run is allowed',
    'limit-warning': 'allowed_warning is scarcity telemetry, not a refusal',
    'fail-text-limit': 'failure text "usage limit reached" is never parsed',
    'fail-result': 'an unrelated failure',
    'health-event': 'ordinary account telemetry on a completed Play'
  };
  for (const [mode, why] of Object.entries(cases)) {
    const turn = await printTurn('claude', mode);
    assert.equal(turn.blocker, undefined, `${mode}: ${why}`);
  }
  const success = await printTurn('claude', 'limit-then-success');
  assert.equal(success.state, 'completed');
  assert.equal(success.blocker, undefined, 'a completed Play was not blocked, whatever the limiter said');

  const agy = await printTurn('agy', 'fail-result');
  assert.equal(agy.state, 'failed');
  assert.match(agy.summary, /quota exceeded/);
  assert.equal(agy.blocker, undefined, 'AntiGravity has no structured proof: fail closed');

  assert.equal(claudeLimitRejection({ status: 'rejected', overageStatus: 'allowed_warning' }), undefined);
  assert.equal(claudeLimitRejection({ status: 'allowed' }), undefined);
  assert.equal(claudeLimitRejection(undefined), undefined);
  assert.deepEqual(claudeLimitRejection({ status: 'rejected', rateLimitType: 'Five Hour!!' }), { kind: 'provider-limit', pool: 'claude', evidence: 'claude-rate-limit-event', providerCode: 'rejected' }, 'an unrecognised window id is dropped, never guessed');
});

test('R9P-6 no text scraping or account-scarcity heuristic exists in the blocker path', async () => {
  const codex = (await readFile(join(repoRoot, 'src', 'player-control', 'codex-app-server.ts'), 'utf8')).replace(/\r\n/g, '\n');
  const print = (await readFile(join(repoRoot, 'src', 'player-control', 'structured-print.ts'), 'utf8')).replace(/\r\n/g, '\n');
  const codexFn = codex.slice(codex.indexOf('export function codexProviderLimitBlocker'), codex.indexOf('}', codex.indexOf('export function codexProviderLimitBlocker') + 200) + 1);
  const claudeFn = print.slice(print.indexOf('export function claudeLimitRejection'), print.indexOf('\n}\n', print.indexOf('export function claudeLimitRejection')));
  for (const fn of [codexFn, claudeFn]) {
    assert.doesNotMatch(fn, /\.message\b|\.result\b|summary|\.test\(\s*(?:error|message|text|summary)|includes\(|usedPercent|utilization|remaining|CRITICAL|LOW/, 'no text or scarcity inputs');
  }
  for (const file of ['codex-app-server.ts', 'structured-print.ts', 'contract.ts']) {
    const source = await readFile(join(repoRoot, 'src', 'player-control', file), 'utf8');
    assert.doesNotMatch(source, /health-authority|alarm-engine|routing-economics|resource-policy/, `${file} consults no account-level resource truth`);
  }
});

// ─────────────────────────────── Part 2: Work Ledger ───────────────────────────────

const BLOCKER = { kind: 'provider-limit', pool: 'claude', window: 'five_hour', resetsAt: 1790500000, evidence: 'claude-rate-limit-event', providerCode: 'rejected' };

test('R9P-7 the Work Ledger records the blocker and session key with the Play outcome (one source of truth)', () => {
  const ledger = new InstanceWorkLedger(() => 1_000);
  const turn = (ref, state, extra = {}) => ledger.recordTurn('g1', { instanceId: 'claude-11111111', state, turnRef: ref, summary: state, at: 1_000, ...extra });
  turn('t1', 'started');
  turn('t1', 'failed', { blocker: BLOCKER, sessionKey: 'abcdef01' });
  turn('t2', 'started');
  turn('t2', 'completed', { blocker: BLOCKER, sessionKey: 'abcdef01' });
  turn('t3', 'started');
  turn('t3', 'failed', { blocker: { ...BLOCKER, evidence: 'failure-text' }, sessionKey: 'not-a-key' });
  turn('t4', 'started');
  turn('t4', 'failed');
  const plays = Object.fromEntries(ledger.get('g1', 'claude-11111111').recentPlays.map((play) => [play.turnRef, play]));
  assert.deepEqual(plays.t1.blocker, BLOCKER);
  assert.equal(plays.t1.sessionKey, 'abcdef01');
  assert.equal(plays.t2.blocker, undefined, 'a completed Play never keeps a blocker');
  assert.equal(plays.t3.blocker, undefined, 'unrecognised evidence is dropped');
  assert.equal(plays.t3.sessionKey, undefined, 'a malformed key is dropped');
  assert.equal('blocker' in plays.t4, false, 'no proof → no field at all');

  // Persistence round-trip, legacy records, and malformed stored fields.
  const restored = new InstanceWorkLedger(() => 2_000);
  restored.restore(ledger.serialize());
  assert.deepEqual(restored.get('g1', 'claude-11111111').recentPlays.find((p) => p.turnRef === 't1').blocker, BLOCKER);
  const legacy = new InstanceWorkLedger(() => 2_000);
  legacy.restore({ version: 1, entries: [{ gameId: 'g1', playerInstanceId: 'codex-22222222', recentPlays: [
    { clientRef: 'old', outcome: 'failed', startedAt: 1, finishedAt: 2 },
    { clientRef: 'bad', outcome: 'failed', startedAt: 1, finishedAt: 2, blocker: { kind: 'provider-limit', pool: 'codex' }, sessionKey: 'ZZZ' }
  ], reports: [] }] });
  const [old, bad] = legacy.get('g1', 'codex-22222222').recentPlays;
  assert.equal(old.clientRef, 'old', 'historical records without the fields remain valid');
  assert.equal('blocker' in bad || 'sessionKey' in bad, false, 'malformed stored fields are dropped on restore');
  assert.equal(parseProviderLimitBlocker({ ...BLOCKER, resetsAt: -5 }), undefined);
});

// ─────────────────────────────── Part 3: session identity ───────────────────────────────

function fakeFactory(adapterId, calls) {
  let next = 0;
  const make = (instanceId, sessionRef) => {
    const listeners = new Set();
    const control = {
      instanceId, providerSessionRef: sessionRef, runtimeVersion: '1', state: 'ready',
      async deliver(play, clientRef) { calls.sent.push({ instanceId, sessionRef, play, clientRef }); return { kind: 'accepted', turnRef: `turn-${calls.sent.length}` }; },
      async close() {},
      onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      emit(event) { for (const listener of listeners) listener(event); }
    };
    calls.controls.push(control);
    return control;
  };
  return {
    adapterId,
    async open(request) { next += 1; calls.open += 1; return make(request.instanceId, `fresh-conversation-${next}`); },
    async restore(request, binding) {
      calls.restore += 1;
      if (calls.restoreFails) return { kind: 'needs-decision', message: "Coach couldn't reopen this Player's conversation." };
      return { kind: 'ready', control: make(request.instanceId, binding.sessionRef), reconciliation: { kind: 'none' }, openedFresh: false };
    }
  };
}

test('R9P-8 host: the precondition is proven before the write-ahead marker and before any provider send', async () => {
  const calls = { open: 0, restore: 0, sent: [], controls: [] };
  const store = new MemoryStore();
  const host = new PlayerControlHost(store);
  host.register('codex', fakeFactory('fake-codex', calls));
  const request = { instanceId: 'codex-33333333', playerType: 'codex', seat: 1, gameRoot: repoRoot, gameId: 'g1', authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } };
  assert.equal((await host.open(request)).kind, 'ready');
  const key = host.sessionKey('codex-33333333');
  assert.equal(key, providerSessionKey('fresh-conversation-1'));
  assert.equal(key, sessionKeyFor('fresh-conversation-1'), 'the activity key and the precondition key are one definition');
  assert.match(key, /^[0-9a-f]{8}$/);

  const matching = await host.deliver('codex-33333333', 'Continue the current task.', {}, { expectedSessionKey: key });
  assert.equal(matching.kind, 'accepted', 'matching expectedSessionKey → allowed');
  assert.equal(calls.sent.length, 1);

  const marker = structuredClone(store.value);
  const refused = await host.deliver('codex-33333333', 'Continue the current task.', {}, { expectedSessionKey: 'deadbeef' });
  assert.deepEqual({ kind: refused.kind, reason: refused.reason }, { kind: 'refused', reason: 'session-changed' });
  assert.equal(calls.sent.length, 1, 'refused before send');
  assert.deepEqual(store.value, marker, 'no write-ahead pendingPlay was recorded for a refused Play');

  const legacy = await host.deliver('codex-33333333', 'Ordinary Play');
  assert.equal(legacy.kind, 'accepted', 'no expectedSessionKey → unchanged behavior');
  assert.equal(calls.sent.length, 2);
  assert.equal((await host.deliver('codex-99999999', 'x', {}, { expectedSessionKey: key })).reason, 'closed');
  await host.dispose();
});

test('R9P-9 critical: reopenFresh gives the same instanceId a new key, and an old-key continuation never reaches it', async () => {
  const calls = { open: 0, restore: 0, sent: [], controls: [], restoreFails: false };
  const GAME = 'game_r9p';
  const INSTANCE = 'codex-a1b2c3d4';
  const store = new MemoryStore([{ instanceId: INSTANCE, playerType: 'codex', seat: 1, adapter: 'fake-codex', sessionRef: 'thread-original', historyExpected: true, pendingPlay: null, gameId: GAME }]);
  const host = new PlayerControlHost(store);
  host.register('codex', fakeFactory('fake-codex', calls));
  const memento = { data: new Map(), get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; }, async update(k, v) { this.data.set(k, structuredClone(v)); } };
  const gameContext = () => ({
    game: { gameId: GAME, displayName: 'R9P', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_r9p', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId: GAME, stadiumId: 'stadium_r9p', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  });
  const capabilityOf = (roster) => roster.getRoutingCapabilities(GAME).find((c) => c.instanceId === INSTANCE);

  // 1. Restored continuity: the same conversation keeps its key.
  const roster = new PlayerRoster(memento, host, gameContext);
  await until(() => host.sessionKey(INSTANCE), 'restored control');
  const original = host.sessionKey(INSTANCE);
  assert.equal(original, providerSessionKey('thread-original'));
  assert.equal(capabilityOf(roster)?.sessionKey, original, 'the key is projected before dispatch');
  const turns = [];
  roster.onDidTurnChange((event) => turns.push(event));
  calls.controls.at(-1).emit({ kind: 'turn', state: 'failed', turnRef: 'turn-x', summary: 'Failed', blocker: { ...BLOCKER, pool: 'codex', evidence: 'codex-turn-error', providerCode: 'usageLimitExceeded', window: undefined, resetsAt: undefined } });
  const projected = await until(() => turns.find((t) => t.turnRef === 'turn-x'), 'projected turn');
  assert.equal(projected.blocker.providerCode, 'usageLimitExceeded', 'the blocker travels on the roster turn event');
  assert.equal(projected.sessionKey, original, 'with the key of the conversation it ran in');

  // 2. The provider process is lost and its conversation can no longer be restored: the roster's real
  //    crash path restores, fails, and Player Control's self-healing opens a brand-new conversation.
  calls.restoreFails = true;
  calls.controls.at(-1).emit({ kind: 'channel', state: 'lost', summary: 'Provider exited' });
  await until(() => host.sessionKey(INSTANCE) && host.sessionKey(INSTANCE) !== original, 'fresh conversation');
  assert.ok(calls.restore >= 2 && calls.open >= 1, 'restore was attempted, then reopenFresh opened a new conversation');
  const fresh = host.sessionKey(INSTANCE);
  assert.notEqual(fresh, original, 'reopenFresh produces a changed identity');
  assert.equal(host.binding(INSTANCE).sessionRef.startsWith('fresh-conversation-'), true);
  assert.equal(capabilityOf(roster)?.sessionKey, fresh);
  assert.equal(capabilityOf(roster)?.instanceId, INSTANCE, 'same instanceId, same model — yet not the same conversation');

  // 3. The continuation armed against the original conversation is refused before send.
  const sentBefore = calls.sent.length;
  const outcome = await host.deliver(INSTANCE, 'Continue the current task from where you were interrupted.', {}, { expectedSessionKey: original });
  assert.equal(outcome.kind, 'refused');
  assert.equal(outcome.reason, 'session-changed');
  assert.equal(calls.sent.length, sentBefore, 'no continuation prompt reached the fresh conversation');
  assert.equal((await host.deliver(INSTANCE, 'Hello', {}, { expectedSessionKey: fresh })).kind, 'accepted');
  await host.dispose();
});

test('R9P-10 Stadium: the key is enforced in Player Control, and every non-controlled route fails closed', async () => {
  const calls = { open: 0, restore: 0, sent: [], controls: [] };
  const host = new PlayerControlHost(new MemoryStore());
  host.register('codex', fakeFactory('fake-codex', calls));
  await host.open({ instanceId: 'codex-44444444', playerType: 'codex', seat: 1, gameRoot: repoRoot, gameId: 'g1', authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' } });
  const key = host.sessionKey('codex-44444444');
  const resolutions = { 'codex-44444444': { state: 'live', transport: 'controlled' }, 'claude-55555555': { state: 'live', transport: 'legacy' }, 'codex-66666666': { state: 'pending' } };
  const client = new StadiumClient({
    dir: join(scratch, 'stadium'), port: 1, instanceId: 'window-1',
    gameContextGetter: () => ({ game: { gameId: 'g1' } }),
    playerControlHost: host,
    playerRoster: { resolve: (id) => resolutions[id] ?? { state: 'unknown' } }
  });
  const notices = [];
  client.sendNotification = (method, params) => notices.push({ method, params });
  const dispatch = (extra) => client.executeDispatch({ clientRef: `ref-${notices.length}`, stadiumId: 's', gameId: 'g1', prompt: 'Continue.', ...extra });

  await dispatch({ playerInstanceId: 'codex-44444444', expectedSessionKey: key });
  assert.equal(notices.at(-1).method, 'dispatch.accepted');
  await dispatch({ playerInstanceId: 'codex-44444444', expectedSessionKey: 'deadbeef' });
  assert.deepEqual([notices.at(-1).method, notices.at(-1).params.reason], ['dispatch.rejected', 'session-changed']);
  for (const target of [{ playerInstanceId: 'claude-55555555' }, { playerInstanceId: 'codex-66666666' }, { playerInstanceId: 'scout' }, { terminalName: 'Claude' }]) {
    await dispatch({ ...target, expectedSessionKey: key });
    assert.deepEqual([notices.at(-1).method, notices.at(-1).params.reason], ['dispatch.rejected', 'session-changed'], JSON.stringify(target));
  }
  assert.equal(calls.sent.length, 1, 'only the proven same-conversation Play was sent');
  await dispatch({ playerInstanceId: 'codex-44444444' });
  assert.equal(notices.at(-1).method, 'dispatch.accepted', 'no key → unchanged behavior');
  assert.equal(notices.at(-1).params.reason, undefined);
  await host.dispose();
});

test('R9P-11 router: a session-bound Play is MANUAL, exact, never queued; the refusal reason is structured', async () => {
  const frames = [];
  const seat = { instanceId: 'codex-77777777', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready', sessionKey: 'abcdef01',
    capability: { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', models: [{ id: 'm1', displayName: 'M1', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] } };
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-1', stadiumId: 'stadium-r9p', name: 'R9P', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
    lastHeartbeat: 1, game: { gameId: 'g-r', displayName: 'R', fingerprintSource: 'git' }, roster: [], capabilities: [seat], reports: [], rosterSynchronized: true, rosterSyncedAt: 1
  });
  const router = new ControlPlaneRouter(registry);
  const base = { gameId: 'g-r', prompt: 'Continue the current task.', routingMode: 'manual', playerInstanceId: seat.instanceId, model: 'm1', effort: 'high' };

  for (const [options, label] of [
    [{ ...base, expectedSessionKey: 'NOTHEX!!' }, 'malformed key'],
    [{ ...base, routingMode: 'auto', expectedSessionKey: 'abcdef01' }, 'AUTO could pick another Player'],
    [{ ...base, whenBusy: 'queue', expectedSessionKey: 'abcdef01' }, 'queue'],
    [{ ...base, playerInstanceId: 'scout', expectedSessionKey: 'abcdef01' }, 'Scout']
  ]) {
    const result = await router.dispatch(options);
    assert.equal(result.success, false, label);
    assert.equal(result.reason, 'session-bound-invalid', label);
  }
  assert.equal(frames.length, 0, 'nothing reached the Stadium');

  const pending = router.dispatch({ ...base, expectedSessionKey: 'abcdef01' });
  const frame = await until(() => frames.find((item) => item.method === 'dispatch.request'), 'dispatch frame');
  assert.equal(frame.params.expectedSessionKey, 'abcdef01');
  assert.equal(frame.params.playerInstanceId, seat.instanceId);
  router.handleDispatchRejected({ clientRef: frame.params.clientRef, stadiumId: 'stadium-r9p', gameId: 'g-r', playerInstanceId: seat.instanceId, error: { code: -32000, message: 'Nothing was sent.' }, reason: 'session-changed' });
  const result = await pending;
  assert.deepEqual([result.success, result.reason], [false, 'session-changed']);

  frames.length = 0;
  const plain = router.dispatch({ ...base });
  const plainFrame = await until(() => frames.find((item) => item.method === 'dispatch.request'), 'plain frame');
  assert.equal('expectedSessionKey' in plainFrame.params, false, 'no key → the frame is exactly as before');
  router.handleDispatchAccepted({ clientRef: plainFrame.params.clientRef, stadiumId: 'stadium-r9p', gameId: 'g-r', playerInstanceId: seat.instanceId, acceptedAt: Date.now() });
  assert.equal((await plain).success, true);
});

// S57.24 (R9 Part 2) intentionally wires DeferredPlay into the daemon; the daemon assertion moved to
// test/r9-deferred-play.test.mjs R9-12, which pins the surfaces that must stay untouched.
test('R9P-12 the prerequisite is additive: no routing, PlayQueue or R8 surface was touched', async () => {
  const read = (...parts) => readFile(join(repoRoot, ...parts), 'utf8');
  assert.doesNotMatch(await read('src', 'routing-policy.ts'), /expectedSessionKey|blocker|sessionKey/);
  assert.doesNotMatch(await read('src', 'control-plane', 'play-queue.ts'), /expectedSessionKey|blocker/);
  const recommend = await read('src', 'routing-intel', 'recommend.ts');
  assert.doesNotMatch(recommend, /expectedSessionKey|ProviderLimitBlocker/);
});
