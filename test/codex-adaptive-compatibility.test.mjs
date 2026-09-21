/**
 * S54.9 — Codex adaptive compatibility.
 *
 * VERSION IS EVIDENCE, NOT AUTHORITY. PROVEN REQUIRED BEHAVIOUR IS AUTHORITY.
 * An unfamiliar Codex version is refused only when the required protocol contract cannot be proven; the per-open
 * runtime authority checks (account, cwd, approval, sandbox, session identity) still run after compatibility passes.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { copyFile, appendFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-codex-adaptive-'));

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
      vscodeStub.window.terminals.push(terminal);
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

const { CodexAppServerFactory, CodexCompatibilityRegistry } = await import('../out/player-control/codex-app-server.js');
const { REQUIRED_CONTRACT, checkSchemaContract } = await import('../out/player-control/codex-contract.js');
const { containsTechnicalPlumbing } = await import('../out/player-control/contract.js');
const { PlayerControlHost } = await import('../out/player-control/host.js');
const { PlayerRoster } = await import('../out/player-roster.js');

let sequence = 0;
const nextLog = (name) => join(scratch, `${++sequence}-${name}.jsonl`);
const request = (instanceId, extra = {}) => ({
  instanceId,
  playerType: 'codex',
  seat: 1,
  gameRoot: repoRoot,
  authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' },
  ...extra
});
const binding = (instanceId, extra = {}) => ({
  instanceId, playerType: 'codex', seat: 1, adapter: 'codex-app-server', sessionRef: `session-${instanceId}`, historyExpected: false, pendingPlay: null, ...extra
});

/** A factory over the fake provider. Every call gets a unique launch (`--case=N`) and its own proof registry. */
function make({ env = {}, options = {}, log = nextLog('case') } = {}) {
  const registry = options.compatibility ?? new CodexCompatibilityRegistry();
  const factory = new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture, `--case=${++sequence}`],
    shell: false,
    closeGraceMs: 100,
    requestTimeoutMs: 2_000,
    retryDelayMs: 5,
    resumeRetryDelaysMs: [5],
    probeTimeoutMs: 8_000,
    compatibility: registry,
    ...options,
    env: { FAKE_LOG_PATH: log, ...env }
  });
  return { factory, registry, log, env: factory.options.env };
}

async function messages(logPath) {
  try { return (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
}
const probes = async (log) => (await messages(log)).filter((entry) => entry.fakeEvent === 'schema-probe');
const rpcMethods = async (log) => (await messages(log)).filter((entry) => entry.method).map((entry) => entry.method);
const openError = async (factory, id = 'codex-cc000001') => {
  try { await factory.open(request(id)); } catch (error) { return error; }
  assert.fail('open() unexpectedly succeeded');
};
async function waitFor(predicate, description, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.fail(`Timed out waiting for ${description}`);
}
function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}
const NEW_VERSION = { FAKE_VERSION: '7.42.0' };

after(async () => {
  await waitFor(async () => {
    const pids = [];
    for (const file of await readdir(scratch)) {
      if (!file.endsWith('.jsonl')) continue;
      const environment = (await messages(join(scratch, file))).filter((entry) => entry.fakeEvent === 'environment');
      for (const entry of environment) if (entry.pid) pids.push(entry.pid);
    }
    return pids.every((pid) => !processExists(pid));
  }, 'all fake provider and probe children to exit', 5_000).catch(() => undefined);
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Supported versions

test('CC-1 0.154.0 remains supported without re-running the schema probe', async () => {
  const { factory, log } = make();
  const control = await factory.open(request('codex-cc000010'));
  assert.equal(control.state, 'ready');
  assert.equal(control.runtimeVersion, '0.154.0');
  assert.equal((await probes(log)).length, 0);
  await control.close();
});

test('CC-2 0.155.1 is supported through the adaptive contract, not a one-off special case', async () => {
  const seeded = make({ env: { FAKE_VERSION: '0.155.1' } });
  const control = await seeded.factory.open(request('codex-cc000020'));
  assert.equal(control.runtimeVersion, '0.155.1');
  assert.equal((await probes(seeded.log)).length, 0, 'seeded as an already-proven version');
  await control.close();

  // The same version, with no seed at all, is accepted purely because the contract passes.
  const adaptive = make({ env: { FAKE_VERSION: '0.155.1' }, options: { certifiedVersions: [] } });
  const proven = await adaptive.factory.open(request('codex-cc000021'));
  assert.equal(proven.state, 'ready');
  assert.equal((await probes(adaptive.log)).length, 1);
  await proven.close();

  // ...and the same version is refused when its contract is drifted: the version is not what admits it.
  const drifted = make({ env: { FAKE_VERSION: '0.155.1', FAKE_SCHEMA_DROP: 'TurnStartParams.clientUserMessageId' }, options: { certifiedVersions: [] } });
  const error = await openError(drifted.factory, 'codex-cc000022');
  assert.equal(error.outcome, 'needs-verification');
});

test('CC-3 an unfamiliar future version with a compatible schema reaches Ready and its probe is read-only', async () => {
  const { factory, log } = make({ env: NEW_VERSION });
  const control = await factory.open(request('codex-cc000030'));
  assert.equal(control.state, 'ready');
  assert.equal(control.runtimeVersion, '7.42.0');
  const [probe] = await probes(log);
  assert.deepEqual(probe.schemaMode, 'ok');
  assert.equal(probe.out, '.');
  assert.notEqual(probe.cwd.toLowerCase(), repoRoot.toLowerCase(), 'the probe never runs in the Game folder');
  assert.equal(probe.hasCodexApiKey, false);
  assert.equal(existsSync(probe.cwd), false, 'the probe temp directory is removed');
  await control.close();
});

// ---------------------------------------------------------------------------------------------------------------------
// Missing contract

function contractLabels() {
  const C = REQUIRED_CONTRACT;
  return [
    ...C.clientMethods.map((method) => `client method ${method}`),
    ...C.serverNotifications.map((method) => `server notification ${method}`),
    ...C.serverRequests.map((method) => `server request ${method}`),
    ...Object.entries(C.fields).flatMap(([definition, fields]) => fields.map((field) => `${definition}.${field}`)),
    ...C.enums.map(({ definition, value }) => `${definition} value '${value}'`),
    ...C.variants.flatMap(({ definition, tag, fields }) => [`${definition} variant '${tag}'`, ...fields.map((field) => `${definition}(${tag}).${field}`)])
  ];
}

test('CC-4/CC-5/CC-6 every missing required item becomes needs-verification, is named in the diagnostic, and never leaks to Dad', async () => {
  const labels = contractLabels();
  assert.ok(labels.length >= 90, `the contract covers the full required surface (${labels.length} items)`);
  const failures = [];
  for (let offset = 0; offset < labels.length; offset += 12) {
    await Promise.all(labels.slice(offset, offset + 12).map(async (label) => {
      const { factory, log } = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_DROP: label } });
      const error = await openError(factory, 'codex-cc000040');
      const methods = await rpcMethods(log);
      const problems = [];
      if (error.outcome !== 'needs-verification') problems.push(`outcome ${error.outcome}`);
      if (!error.diagnostic?.includes(label)) problems.push(`diagnostic does not name it: ${error.diagnostic}`);
      if (methods.some((method) => method.startsWith('thread/') || method === 'turn/start' || method === 'account/read')) problems.push(`provider was called: ${methods}`);
      if (/7\.42|version|certif|provider|schema|contract/i.test(error.message) || containsTechnicalPlumbing(error.message)) problems.push(`Dad message leaks plumbing: ${error.message}`);
      if (problems.length) failures.push(`${label}: ${problems.join('; ')}`);
    }));
  }
  assert.deepEqual(failures, []);
});

test('CC-5/CC-6 the diagnostic carries version, compatibility and reason while the Dad message stays simple', async () => {
  const { factory } = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_DROP: 'TurnStartParams.clientUserMessageId' } });
  const error = await openError(factory);
  assert.equal(error.message, 'Codex needs attention. Try again.');
  assert.match(error.diagnostic, /^Installed version: 7\.42\.0 · Compatibility: incompatible · Reason: required contract missing: TurnStartParams\.clientUserMessageId$/);

  const restore = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_DROP: 'client method thread/resume' } });
  const outcome = await restore.factory.restore(request('codex-cc000050'), binding('codex-cc000050'));
  assert.equal(outcome.kind, 'needs-verification');
  assert.equal(outcome.message, 'Codex needs attention. Try again.');
  assert.match(outcome.diagnostic, /Installed version: 7\.42\.0 · Compatibility: incompatible · Reason: .*client method thread\/resume/);

  // The host carries the same split through open().
  const host = new PlayerControlHost();
  host.register('codex', make({ env: { ...NEW_VERSION, FAKE_SCHEMA_DROP: 'Thread.cwd' } }).factory);
  const hosted = await host.open(request('codex-cc000051'));
  assert.equal(hosted.kind, 'needs-verification');
  assert.equal(hosted.message, 'Codex needs attention. Try again.');
  assert.match(hosted.diagnostic, /Thread\.cwd/);
  await host.dispose();
});

// ---------------------------------------------------------------------------------------------------------------------
// Probe cannot prove compatibility

test('CC-7/CC-18/CC-19 a failing probe is unproven, fails closed, and touches no thread or turn', async () => {
  const { factory, log } = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_MODE: 'fail' } });
  const error = await openError(factory);
  assert.equal(error.outcome, 'needs-verification');
  assert.match(error.diagnostic, /Compatibility: unknown · Reason: compatibility could not be proven \(schema generation exited with code 3\)/);
  assert.deepEqual(await rpcMethods(log), ['initialize', 'initialized'], 'no thread/start, no turn/start, not even account/read');
});

test('CC-8 a probe that hangs times out, fails closed, is killed, and leaves no temp directory', async () => {
  const { factory, log } = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_MODE: 'hang' }, options: { probeTimeoutMs: 400 } });
  const started = Date.now();
  const error = await openError(factory);
  assert.ok(Date.now() - started < 6_000);
  assert.equal(error.outcome, 'needs-verification');
  assert.match(error.diagnostic, /Compatibility: unknown .*timed out after 400 ms/);
  const [probe] = await probes(log);
  assert.equal(existsSync(probe.cwd), false, 'temp directory removed after a timeout');
  await waitFor(async () => (await messages(log)).filter((entry) => entry.fakeEvent === 'environment').every((entry) => !processExists(entry.pid)), 'probe and app-server children to exit');
  assert.deepEqual(await rpcMethods(log), ['initialize', 'initialized']);
});

test('CC-9 garbage, empty and non-object schema output all fail closed', async () => {
  for (const schemaMode of ['garbage', 'empty', 'not-object']) {
    const { factory, log } = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_MODE: schemaMode } });
    const error = await openError(factory);
    assert.equal(error.outcome, 'needs-verification', schemaMode);
    assert.match(error.diagnostic, /Compatibility: (unknown|incompatible)/, schemaMode);
    assert.deepEqual(await rpcMethods(log), ['initialize', 'initialized'], schemaMode);
  }
  assert.deepEqual(checkSchemaContract({}), { ok: false, missing: ['schema definitions (no protocol definitions found)'] });
  assert.equal(checkSchemaContract({ 'ClientRequest.json': 'x', 'codex_app_server_protocol.v2.schemas.json': [] }).ok, false);
});

// ---------------------------------------------------------------------------------------------------------------------
// Version string handling, known-bad, cache

test('CC-10 an unparsable version string is not a failure by itself; the probe decides', async () => {
  for (const userAgent of ['sideline_coach/weird-build (fake)', 'no-slash-at-all', 'sideline_coach/0.999.0-alpha.1 (fake)']) {
    const good = make({ env: { FAKE_USER_AGENT: userAgent } });
    const control = await good.factory.open(request('codex-cc000100'));
    assert.equal(control.state, 'ready', userAgent);
    assert.equal((await probes(good.log)).length, 1, userAgent);
    await control.close();

    const bad = make({ env: { FAKE_USER_AGENT: userAgent, FAKE_SCHEMA_DROP: 'client method turn/start' } });
    assert.equal((await openError(bad.factory)).outcome, 'needs-verification', userAgent);
  }
});

test('CC-11 a known-bad version blocks even when its schema is compatible and even if seeded', async () => {
  const { factory, log } = make({ env: NEW_VERSION, options: { knownBadVersions: ['7.42.0'], certifiedVersions: ['7.42.0'] } });
  const error = await openError(factory);
  assert.equal(error.outcome, 'needs-verification');
  assert.match(error.diagnostic, /Installed version: 7\.42\.0 · Compatibility: incompatible · Reason: version is on the known-bad list/);
  assert.equal((await probes(log)).length, 0);
  assert.deepEqual(await rpcMethods(log), ['initialize', 'initialized']);

  const restored = make({ env: NEW_VERSION, options: { knownBadVersions: ['7.42.0'] } });
  assert.equal((await restored.factory.restore(request('codex-cc000110'), binding('codex-cc000110'))).kind, 'needs-verification');
});

test('CC-12 a cache hit skips the probe, and concurrent opens of one binary share one probe', async () => {
  const sequential = make({ env: NEW_VERSION });
  const first = await sequential.factory.open(request('codex-cc000120'));
  const second = await sequential.factory.open(request('codex-cc000121'));
  assert.equal((await probes(sequential.log)).length, 1);
  await Promise.all([first.close(), second.close()]);

  const concurrent = make({ env: NEW_VERSION });
  const controls = await Promise.all([1, 2, 3].map((n) => concurrent.factory.open(request(`codex-cc00012${n + 1}`))));
  assert.equal((await probes(concurrent.log)).length, 1);
  await Promise.all(controls.map((control) => control.close()));

  // A failed verdict is never cached: the next attempt probes again.
  const failing = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_MODE: 'fail' } });
  await openError(failing.factory);
  await openError(failing.factory);
  assert.equal((await probes(failing.log)).length, 2);
});

test('CC-13 proof is bound to the exact binary and version and is never inherited', async () => {
  const shared = new CodexCompatibilityRegistry();
  const log = nextLog('cc13');
  // Binary A proves version 7.42.0.
  const a = make({ env: NEW_VERSION, log, options: { compatibility: shared } });
  await (await a.factory.open(request('codex-cc000130'))).close();
  assert.equal((await probes(log)).length, 1);

  // Binary B (a different launch) reporting the SAME version, but drifted, must not inherit A's proof.
  const b = make({ env: { ...NEW_VERSION, FAKE_SCHEMA_DROP: 'client method turn/start' }, log, options: { compatibility: shared } });
  assert.equal((await openError(b.factory)).outcome, 'needs-verification');
  assert.equal((await probes(log)).length, 2);

  // The very same launch reporting a different version re-probes.
  a.env.FAKE_VERSION = '7.43.0';
  await (await a.factory.open(request('codex-cc000131'))).close();
  assert.equal((await probes(log)).length, 3);
  await (await a.factory.open(request('codex-cc000135'))).close();
  assert.equal((await probes(log)).length, 3, 'and is then cached under that version');

  // Replacing the file behind an identical command line changes its size/mtime and forfeits the proof.
  const swapDir = await mkdtemp(join(scratch, 'swap-'));
  const swapped = join(swapDir, 'codex-fixture.mjs');
  await copyFile(fixture, swapped);
  const swapLog = nextLog('cc13-swap');
  const swapRegistry = new CodexCompatibilityRegistry();
  const swapOptions = { command: process.execPath, args: [swapped], shell: false, closeGraceMs: 100, requestTimeoutMs: 2_000, compatibility: swapRegistry, env: { FAKE_LOG_PATH: swapLog, FAKE_CONTRACT_PATH: join(repoRoot, 'out', 'player-control', 'codex-contract.js'), ...NEW_VERSION } };
  const before = new CodexAppServerFactory(swapOptions);
  await (await before.open(request('codex-cc000132'))).close();
  await (await before.open(request('codex-cc000133'))).close();
  assert.equal((await probes(swapLog)).length, 1);
  await appendFile(swapped, '\n// replaced binary\n');
  await (await before.open(request('codex-cc000134'))).close();
  assert.equal((await probes(swapLog)).length, 2, 'a changed executable re-proves the contract');
});

// ---------------------------------------------------------------------------------------------------------------------
// Runtime authority is not weakened

test('CC-14 cwd, approval and sandbox authority checks still run after compatibility passes', async () => {
  const wrongCwd = make({ env: { ...NEW_VERSION, FAKE_MODE: 'wrong-cwd' } });
  const cwdError = await openError(wrongCwd.factory);
  assert.equal(cwdError.outcome, 'failed');
  assert.equal((await probes(wrongCwd.log)).length, 1, 'compatibility passed');
  assert.ok((await rpcMethods(wrongCwd.log)).includes('thread/start'));
  assert.match(cwdError.message, /Game cwd/);

  const defaultAuthority = make({ env: { ...NEW_VERSION, FAKE_MODE: 'resume-authority-default' } });
  const outcome = await defaultAuthority.factory.restore(request('codex-cc000140'), binding('codex-cc000140'));
  assert.equal(outcome.kind, 'needs-decision');
  assert.match(outcome.diagnostic, /contradicted the requested approval policy/);
  assert.equal((await probes(defaultAuthority.log)).length, 1);

  const wrongCwdResume = make({ env: { ...NEW_VERSION, FAKE_MODE: 'resume-wrong-cwd' } });
  const cwdOutcome = await wrongCwdResume.factory.restore(request('codex-cc000141'), binding('codex-cc000141'));
  assert.equal(cwdOutcome.kind, 'needs-decision');
  assert.match(cwdOutcome.diagnostic, /different Game cwd/);
});

test('CC-15 account verification still runs and still gates a compatible new version', async () => {
  for (const [mode, expected] of [['account-none', 'needs-sign-in'], ['account-apikey', 'needs-decision']]) {
    const opened = make({ env: { ...NEW_VERSION, FAKE_MODE: mode } });
    assert.equal((await openError(opened.factory)).outcome, expected);
    assert.deepEqual((await rpcMethods(opened.log)).filter((method) => method.startsWith('thread/')), []);
    assert.ok((await rpcMethods(opened.log)).includes('account/read'));

    const restored = make({ env: { ...NEW_VERSION, FAKE_MODE: mode } });
    assert.equal((await restored.factory.restore(request('codex-cc000150'), binding('codex-cc000150'))).kind, expected);
  }
});

test('CC-16 capability discovery works after compatibility proof', async () => {
  const { factory } = make({ env: NEW_VERSION });
  const control = await factory.open(request('codex-cc000160'));
  const capabilities = await control.queryCapabilities();
  assert.equal(capabilities.authenticated, true);
  assert.equal(capabilities.freshness, 'live');
  assert.equal(capabilities.models.length, 3);
  await control.close();

  const restored = make({ env: { ...NEW_VERSION, FAKE_MODE: 'resume-missing' } });
  const outcome = await restored.factory.restore(request('codex-cc000161'), binding('codex-cc000161', { historyExpected: true }));
  assert.equal(outcome.kind, 'needs-decision');
  assert.equal(outcome.capabilities?.models.length, 3, 'capability truth survives a failed conversation restore');
});

test('CC-17 missing-conversation restore behaviour is unchanged on a newly proven version', async () => {
  const noHistory = make({ env: { ...NEW_VERSION, FAKE_MODE: 'resume-not-loaded-missing' } });
  const fresh = await noHistory.factory.restore(request('codex-cc000170'), binding('codex-cc000170', { historyExpected: false }));
  assert.equal(fresh.kind, 'ready');
  assert.equal(fresh.openedFresh, true);
  await fresh.control.close();

  const expected = make({ env: { ...NEW_VERSION, FAKE_MODE: 'resume-not-loaded-missing' } });
  const lost = await expected.factory.restore(request('codex-cc000171'), binding('codex-cc000171', { historyExpected: true }));
  assert.equal(lost.kind, 'needs-decision');
  assert.match(lost.message, /conversation is no longer available/);
});

test('CC-18 verification consumes no model turn: only the real Play sends turn/start', async () => {
  const { factory, log } = make({ env: NEW_VERSION });
  const control = await factory.open(request('codex-cc000180'));
  assert.equal((await rpcMethods(log)).filter((method) => method === 'turn/start').length, 0);
  assert.equal((await control.deliver('one bounded Play', 'cc18')).kind, 'accepted');
  assert.equal((await rpcMethods(log)).filter((method) => method === 'turn/start').length, 1);
  await waitFor(() => control.state === 'ready', 'turn completion');
  await control.close();
});

// ---------------------------------------------------------------------------------------------------------------------
// First-turn tripwire

test('CC-20 a first-turn contradiction on a newly proven version latches incompatibility and stops dispatching', async () => {
  const shared = new CodexCompatibilityRegistry();
  const opened = make({ env: { ...NEW_VERSION, FAKE_MODE: 'ack-no-turn-id' }, options: { compatibility: shared } });
  const control = await opened.factory.open(request('codex-cc000200'));
  const outcome = await control.deliver('first Play', 'cc20-a');
  assert.equal(outcome.kind, 'unknown');
  assert.equal(control.state, 'needs-verification');
  const refused = await control.deliver('second Play', 'cc20-b');
  assert.deepEqual([refused.kind, refused.reason], ['refused', 'needs-verification']);
  assert.equal((await rpcMethods(opened.log)).filter((method) => method === 'turn/start').length, 1, 'nothing kept dispatching');
  await control.close();
  // The same binary+version stays failed for the process: reopening fails closed, without another probe.
  const again = await openError(opened.factory, 'codex-cc000201');
  assert.equal(again.outcome, 'needs-verification');
  assert.match(again.diagnostic, /Compatibility: incompatible · Reason: runtime behaviour contradicted the contract earlier in this session \(turn\/start acknowledgement omitted the turn reference\)/);
  assert.equal((await probes(opened.log)).length, 1);

  // An impossible completion status latches too.
  const badStatus = make({ env: { ...NEW_VERSION, FAKE_MODE: 'complete-bad-status' } });
  const second = await badStatus.factory.open(request('codex-cc000202'));
  const events = [];
  second.onEvent((event) => events.push(event));
  assert.equal((await second.deliver('a Play', 'cc20-c')).kind, 'accepted');
  await waitFor(() => second.state === 'needs-verification', 'tripwire on completion status');
  assert.ok(!events.some((event) => event.kind === 'turn' && event.state === 'completed'), 'an unrecognised status is not reported as completed');
  assert.equal((await openError(badStatus.factory, 'codex-cc000203')).outcome, 'needs-verification');
  await second.close();

  // A seeded but not yet turn-proven version (0.155.1) keeps the tripwire armed.
  const seeded = make({ env: { FAKE_VERSION: '0.155.1', FAKE_MODE: 'ack-no-turn-id' } });
  const seededControl = await seeded.factory.open(request('codex-cc000204'));
  await seededControl.deliver('a Play', 'cc20-d');
  assert.equal(seededControl.state, 'needs-verification');
  await seededControl.close();

  // The field-proved version keeps its earlier behaviour (Unknown/lost, no latch).
  const proven = make({ env: { FAKE_MODE: 'ack-no-turn-id' } });
  const provenControl = await proven.factory.open(request('codex-cc000205'));
  assert.equal((await provenControl.deliver('a Play', 'cc20-e')).kind, 'unknown');
  assert.equal(provenControl.state, 'lost');
  await provenControl.close();
});

test('CC-20 a clean first turn proves the lifecycle and normal Plays keep flowing', async () => {
  const { factory, log } = make({ env: NEW_VERSION });
  const control = await factory.open(request('codex-cc000210'));
  for (const n of [1, 2]) {
    assert.equal((await control.deliver(`Play ${n}`, `cc20-clean-${n}`)).kind, 'accepted');
    await waitFor(() => control.state === 'ready', `turn ${n} completion`);
  }
  assert.equal((await rpcMethods(log)).filter((method) => method === 'turn/start').length, 2);
  await control.close();
});

// ---------------------------------------------------------------------------------------------------------------------
// Drift, Try Again, breadcrumb

test('CC-21 REQUEST_ALLOWLIST and every adapter call stay covered by REQUIRED_CONTRACT', async () => {
  const source = await readFile(join(repoRoot, 'src', 'player-control', 'codex-app-server.ts'), 'utf8');
  assert.match(source, /const REQUEST_ALLOWLIST = new Set<string>\(REQUIRED_CONTRACT\.clientMethods\)/);
  const called = new Set([...source.matchAll(/\brpc\.request\('([^']+)'/g)].map((match) => match[1]));
  assert.ok(called.size >= 8, `found adapter RPC calls (${[...called]})`);
  assert.deepEqual([...called].filter((method) => !REQUIRED_CONTRACT.clientMethods.includes(method)), [], 'an adapter RPC missing from the contract');
  assert.deepEqual(REQUIRED_CONTRACT.clientMethods.filter((method) => !called.has(method)), [], 'a contract method the adapter never calls');

  const notificationBody = source.slice(source.indexOf('private notification('), source.indexOf('private tripwireArmed('));
  const notifications = new Set([...notificationBody.matchAll(/method === '([^']+)'/g)].map((match) => match[1]));
  assert.deepEqual([...notifications].filter((method) => !REQUIRED_CONTRACT.serverNotifications.includes(method)), [], 'a consumed notification missing from the contract');
  assert.deepEqual(REQUIRED_CONTRACT.serverNotifications.filter((method) => !notifications.has(method)), []);

  const answerBody = source.slice(source.indexOf('private static answerServerRequest('), source.indexOf('export class CodexAppServerFactory'));
  const approvals = source.match(/const APPROVAL_METHODS = new Set\(\[([^\]]+)\]/)[1];
  const answered = new Set([...`${approvals}${answerBody}`.matchAll(/'((?:item|mcpServer)\/[^']+)'/g)].map((match) => match[1]));
  assert.deepEqual([...answered].filter((method) => !REQUIRED_CONTRACT.serverRequests.includes(method)), [], 'an answered server request missing from the contract');
  assert.deepEqual(REQUIRED_CONTRACT.serverRequests.filter((method) => !answered.has(method)), []);
});

// ---- roster-level: Try Again and the double-open cleanup ----

const GAME_ID = 'game_git_s549';
const gameContext = () => ({
  game: { gameId: GAME_ID, displayName: 'S54.9', fingerprintSource: 'git-remote' },
  stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: GAME_ID, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});
class MemoryMemento { constructor() { this.data = new Map(); } get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; } async update(k, v) { this.data.set(k, structuredClone(v)); } }
class MemoryBindingStore { constructor(records) { this.records = structuredClone(records); } load() { return structuredClone(this.records); } async save(records) { this.records = structuredClone(records); } }
const ROSTER_INSTANCE = 'codex-a1b2c3d4';

function fakeControl() {
  const listeners = new Set();
  return {
    instanceId: ROSTER_INSTANCE, providerSessionRef: 'thread-1', runtimeVersion: '7.42.0', state: 'ready',
    async deliver() { return { kind: 'accepted', turnRef: 'turn-1' }; },
    async close() {},
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async queryCapabilities() { return { provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: ['low'], defaultEffort: 'low' }] }; }
  };
}

async function instanceOf(roster) {
  return (await roster.status()).find((player) => player.id === 'codex')?.instances?.[0];
}
async function untilControlState(roster, state) {
  return waitFor(async () => { const instance = await instanceOf(roster); return instance?.controlState === state ? instance : undefined; }, `controlState ${state}`, 4_000);
}

test('CC-22/CC-23 Try Again genuinely recovers a compatible update, and needs-verification does not double-open', async () => {
  let compatible = false;
  const calls = { restore: 0, open: 0 };
  const control = fakeControl();
  const host = new PlayerControlHost(new MemoryBindingStore([{ instanceId: ROSTER_INSTANCE, playerType: 'codex', seat: 1, adapter: 'fake-codex', sessionRef: 'thread-1', historyExpected: false, pendingPlay: null, gameId: GAME_ID }]));
  host.register('codex', {
    adapterId: 'fake-codex',
    async open() { calls.open += 1; throw new Error('a needs-verification restore must not be followed by a fresh open'); },
    async restore() {
      calls.restore += 1;
      if (!compatible) return { kind: 'needs-verification', message: 'Codex needs attention. Try again.', diagnostic: 'Installed version: 7.42.0 · Compatibility: incompatible · Reason: required contract missing: Thread.cwd' };
      return { kind: 'ready', control, reconciliation: { kind: 'none' }, openedFresh: false };
    }
  });
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);

  const benched = await untilControlState(roster, 'needs-verification');
  assert.equal(benched.stateMessage, 'Needs attention: Codex needs attention. Try again.');
  assert.doesNotMatch(benched.stateMessage, /7\.42|version|certified|contract/i, 'Dad-facing state carries no version plumbing');
  assert.equal(calls.restore, 1);
  assert.equal(calls.open, 0, 'no pointless deterministic second open');

  compatible = true; // Codex was updated to a compatible version.
  assert.equal((await roster.putInstanceOnField(ROSTER_INSTANCE)).success, true);
  await untilControlState(roster, 'ready');
  assert.equal(calls.restore, 2);
  assert.equal(calls.open, 0);
  await host.dispose();
});

test('CC-23 a non-verification restore failure still gets its one bounded fresh-open attempt', async () => {
  const calls = { open: 0 };
  const control = fakeControl();
  const host = new PlayerControlHost(new MemoryBindingStore([{ instanceId: ROSTER_INSTANCE, playerType: 'codex', seat: 1, adapter: 'fake-codex', sessionRef: 'thread-1', historyExpected: false, pendingPlay: null, gameId: GAME_ID }]));
  host.register('codex', {
    adapterId: 'fake-codex',
    async open() { calls.open += 1; return control; },
    async restore() { return { kind: 'needs-decision', message: "Coach couldn't reopen this Player's conversation." }; }
  });
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);
  await untilControlState(roster, 'ready');
  assert.equal(calls.open, 1);
  await host.dispose();
});

test('CC-28 the CODEX-COMPATIBILITY-CONTRACT breadcrumb is graduated to current truth and mirrored', async () => {
  const source = await readFile(join(repoRoot, 'src', 'player-control', 'codex-app-server.ts'), 'utf8');
  const start = source.indexOf('BREADCRUMB: CODEX-COMPATIBILITY-CONTRACT');
  assert.ok(start >= 0);
  const block = source.slice(start, source.indexOf('*/', start));
  assert.doesNotMatch(block, /UNRESOLVED|not implemented|nothing here implements|next Codex-compatibility Play|STATE TODAY|WHEN RESOLVED/i);
  for (const phrase of [/EVIDENCE, not authority/i, /PROVEN REQUIRED BEHAVIOUR is authority/, /fails? closed/i, /known-bad/i, /RUNTIME AUTHORITY IS NEVER REPLACED/, /FUTURE WIDENING/]) assert.match(block, phrase);
  assert.doesNotMatch(source, /const CERTIFIED_VERSION\b|certified\.includes\(/, 'the exact-version hard gate is gone');
  const mirror = await readFile(join(repoRoot, 'Docs ANCHOR', 'ARCHITECTURE-BREADCRUMBS.md'), 'utf8');
  const from = mirror.indexOf('### Codex compatibility contract');
  assert.ok(from >= 0);
  const rest = mirror.slice(from + 5);
  const next = rest.indexOf('\n### ');
  const entry = next < 0 ? rest : rest.slice(0, next);
  assert.doesNotMatch(entry, /UNRESOLVED|Nothing is implemented yet|A small adaptive slice replaces/);
  assert.match(entry, /\*\*IS:\*\*[^\n]*generate-json-schema/);
});

test('the contract module is pure: no filesystem, process, network or VS Code imports', async () => {
  const source = await readFile(join(repoRoot, 'src', 'player-control', 'codex-contract.ts'), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b|\brequire\(|from ['"]node:|child_process|['"]vscode['"]/m);
});
