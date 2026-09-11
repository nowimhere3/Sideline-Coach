import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexAppServerFactory } from '../out/player-control/codex-app-server.js';
import { PlayerControlHost } from '../out/player-control/host.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-control-contract-'));
after(async () => {
  await waitFor(async () => {
    const files = await readdir(scratch);
    const pids = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const environment = (await messages(join(scratch, file))).find((entry) => entry.fakeEvent === 'environment');
      if (environment?.pid) pids.push(environment.pid);
    }
    return pids.every((pid) => !processExists(pid));
  }, 'all contract-suite fake provider children to exit', 4_000);
  await rm(scratch, { recursive: true, force: true });
});

let sequence = 0;
const nextLog = (name) => join(scratch, `${++sequence}-${name}.jsonl`);
const request = (instanceId, gameRoot = repoRoot) => ({
  instanceId,
  playerType: 'codex',
  seat: 1,
  gameRoot,
  authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
});
const factory = (logPath, mode = 'normal', extra = {}) => new CodexAppServerFactory({
  command: process.execPath,
  args: [fixture],
  shell: false,
  closeGraceMs: 100,
  requestTimeoutMs: 1_000,
  retryDelayMs: 10,
  env: { FAKE_LOG_PATH: logPath, FAKE_MODE: mode, ...extra }
});

async function messages(logPath) {
  try {
    return (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function waitFor(predicate, description, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  assert.fail(`Timed out waiting for ${description}`);
}

async function waitUntilReady(control) {
  await waitFor(() => control.state === 'ready', 'turn completion');
}

function collectEvents(control) {
  const events = [];
  const stop = control.onEvent((event) => events.push(event));
  return { events, stop };
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

test('C1 exact target: two controlled instances remain isolated', async () => {
  const logA = nextLog('c1-a');
  const logB = nextLog('c1-b');
  const host = new PlayerControlHost();
  host.register('codex', { adapterId: 'codex-app-server', open: (openRequest) => factory(openRequest.instanceId.endsWith('-a') ? logA : logB).open(openRequest) });
  assert.equal((await host.open(request('codex-proof-a'))).kind, 'ready');
  assert.equal((await host.open(request('codex-proof-b'))).kind, 'ready');
  assert.equal((await host.deliver('codex-proof-b', 'only B')).kind, 'accepted');
  await waitFor(async () => (await messages(logB)).some((message) => message.fakeEvent === 'turn-started'), 'B turn');
  assert.equal((await messages(logA)).filter((message) => message.method === 'turn/start').length, 0);
  assert.equal((await messages(logB)).filter((message) => message.method === 'turn/start').length, 1);
  await host.dispose();
});

test('C2 payload fidelity: a >10,000 character mixed-newline Play is one unchanged text item', async () => {
  const log = nextLog('c2');
  const control = await factory(log).open(request('codex-proof-c2'));
  const play = `  leading\tcolumn\r\n\r\n/list\n!bang\n$money\n/model opus\nUnicode café — 中文 😀\n${'payload '.repeat(1_600)}\n`;
  assert.ok(play.length > 10_000);
  assert.equal((await control.deliver(play, 'c2-client')).kind, 'accepted');
  const sent = (await messages(log)).find((message) => message.method === 'turn/start');
  assert.equal(sent.params.input.length, 1);
  assert.deepEqual(sent.params.input[0], { type: 'text', text: play, text_elements: [] });
  await control.close();
});

test('C3 atomicity: SEND writes one turn/start JSON frame and no raw Play frame', async () => {
  const log = nextLog('c3');
  const control = await factory(log).open(request('codex-proof-c3'));
  await control.deliver('one\ntwo\nthree', 'c3-client');
  const all = await messages(log);
  assert.equal(all.filter((message) => message.method === 'turn/start').length, 1);
  assert.equal(all.filter((message) => Object.hasOwn(message, 'raw')).length, 0);
  await control.close();
});

test('C4 one turn: the fake starts exactly one provider turn per SEND', async () => {
  const log = nextLog('c4');
  const control = await factory(log).open(request('codex-proof-c4'));
  await control.deliver('start once', 'c4-client');
  await waitFor(async () => (await messages(log)).some((message) => message.fakeEvent === 'turn-started'), 'provider turn start');
  assert.equal((await messages(log)).filter((message) => message.fakeEvent === 'turn-started').length, 1);
  await control.close();
});

test('C5 continuity: a second Play reuses one thread and never starts another', async () => {
  const log = nextLog('c5');
  const control = await factory(log).open(request('codex-proof-c5'));
  await control.deliver('first', 'c5-client-1');
  await waitUntilReady(control);
  await control.deliver('second', 'c5-client-2');
  const all = await messages(log);
  const starts = all.filter((message) => message.method === 'thread/start');
  const turns = all.filter((message) => message.method === 'turn/start');
  assert.equal(starts.length, 1);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].params.threadId, turns[1].params.threadId);
  assert.equal(turns[0].params.threadId, control.providerSessionRef);
  assert.ok(turns[0].params.clientUserMessageId);
  assert.notEqual(turns[0].params.clientUserMessageId, turns[1].params.clientUserMessageId);
  await control.close();
});

test('C6 order and busy: completed Plays preserve order and active Players refuse', async () => {
  const orderedLog = nextLog('c6-order');
  const ordered = await factory(orderedLog).open(request('codex-proof-c6-order'));
  await ordered.deliver('first', 'c6-order-1');
  await waitUntilReady(ordered);
  await ordered.deliver('second', 'c6-order-2');
  assert.deepEqual((await messages(orderedLog)).filter((message) => message.method === 'turn/start').map((message) => message.params.input[0].text), ['first', 'second']);
  await ordered.close();

  const busyLog = nextLog('c6-busy');
  const busy = await factory(busyLog, 'hold').open(request('codex-proof-c6-busy'));
  assert.equal((await busy.deliver('active', 'c6-busy-1')).kind, 'accepted');
  assert.deepEqual(await busy.deliver('must refuse', 'c6-busy-2'), { kind: 'refused', reason: 'busy', message: 'That Player is still working.' });
  assert.equal((await messages(busyLog)).filter((message) => message.method === 'turn/start').length, 1);
  await busy.close();
});

test('C7 closed Player safety: closed binding refuses and never redirects to a sibling', async () => {
  const logA = nextLog('c7-a');
  const logB = nextLog('c7-b');
  const host = new PlayerControlHost();
  host.register('codex', { adapterId: 'codex-app-server', open: (openRequest) => factory(openRequest.instanceId.endsWith('-a') ? logA : logB).open(openRequest) });
  await host.open(request('codex-proof-c7-a'));
  await host.open(request('codex-proof-c7-b'));
  await host.close('codex-proof-c7-b');
  const outcome = await host.deliver('codex-proof-c7-b', 'do not redirect');
  assert.equal(outcome.kind, 'refused');
  assert.equal(outcome.reason, 'closed');
  assert.equal((await messages(logA)).filter((message) => message.method === 'turn/start').length, 0);
  await host.dispose();
});

test('C8 acknowledgement loss: post-ingress crash is Unknown with no resend', async () => {
  const log = nextLog('c8');
  const control = await factory(log, 'ack-loss').open(request('codex-proof-c8'));
  const outcome = await control.deliver('uncertain once', 'c8-client');
  assert.equal(outcome.kind, 'unknown');
  assert.equal((await messages(log)).filter((message) => message.method === 'turn/start').length, 1);
  await control.close();
});

test('C9 retry rule: only -32001 receives one bounded retry', async () => {
  const retryLog = nextLog('c9-retry');
  const retry = await factory(retryLog, 'ingress-once').open(request('codex-proof-c9-retry'));
  assert.equal((await retry.deliver('retry only proven rejection', 'c9-retry')).kind, 'accepted');
  const retriedRequests = (await messages(retryLog)).filter((message) => message.method === 'turn/start');
  assert.equal(retriedRequests.length, 2);
  assert.equal(retriedRequests[0].params.clientUserMessageId, retriedRequests[1].params.clientUserMessageId);
  await retry.close();

  const rejectLog = nextLog('c9-reject');
  const reject = await factory(rejectLog, 'rpc-error').open(request('codex-proof-c9-reject'));
  assert.equal((await reject.deliver('never retry other errors', 'c9-reject')).kind, 'refused');
  assert.equal((await messages(rejectLog)).filter((message) => message.method === 'turn/start').length, 1);
  await reject.close();
});

test('C10 process death mid-turn: lifecycle becomes Unknown and later Plays refuse', async () => {
  const log = nextLog('c10');
  const control = await factory(log, 'mid-turn').open(request('codex-proof-c10'));
  const observed = collectEvents(control);
  assert.equal((await control.deliver('die after acceptance', 'c10-first')).kind, 'accepted');
  await waitFor(() => observed.events.find((event) => event.kind === 'turn' && event.state === 'unknown'), 'Unknown lifecycle event');
  assert.equal(control.state, 'lost');
  const later = await control.deliver('must refuse', 'c10-later');
  assert.equal(later.kind, 'refused');
  assert.equal((await messages(log)).filter((message) => message.method === 'turn/start').length, 1);
  observed.stop();
  await control.close();
});

test('C11 Game cwd: exact root is sent and contradictory echo vetoes open', async () => {
  const log = nextLog('c11');
  await assert.rejects(factory(log, 'wrong-cwd').open(request('codex-proof-c11')), /unexpected Game cwd/);
  const start = (await messages(log)).find((message) => message.method === 'thread/start');
  assert.equal(start.params.cwd, repoRoot);
  assert.equal(start.params.approvalPolicy, 'never');
  assert.equal(start.params.sandbox, 'danger-full-access');
  assert.equal(Object.hasOwn(start.params, 'ephemeral'), false, 'provider-native session persistence is not Sideline binding persistence');
});

test('C12 unexpected approval: adapter declines, surfaces, and does not hang', async () => {
  const log = nextLog('c12');
  const control = await factory(log, 'approval').open(request('codex-proof-c12'));
  const observed = collectEvents(control);
  try {
    await waitFor(() => observed.events.some((event) => event.kind === 'request' && event.state === 'declined'), 'surfaced approval event');
    const response = await waitFor(async () => (await messages(log)).find((message) => message.id === 900 && message.result), 'approval decline response');
    assert.deepEqual(response.result, { decision: 'decline' });
  } finally {
    observed.stop();
    await control.close();
  }
});

test('C13 allowlist: no public surface can invoke arbitrary provider methods', async () => {
  const log = nextLog('c13');
  const guardedFactory = new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture],
    shell: false,
    closeGraceMs: 100,
    requestTimeoutMs: 1_000,
    env: { FAKE_LOG_PATH: log, FAKE_MODE: 'normal', CODEX_API_KEY: 'must-not-reach-child' }
  });
  const control = await guardedFactory.open(request('codex-proof-c13'));
  assert.equal(control.request, undefined);
  assert.equal(control.invoke, undefined);
  const all = await messages(log);
  assert.deepEqual(all.filter((message) => message.method).map((message) => message.method), ['initialize', 'initialized', 'account/read', 'thread/start']);
  assert.equal(all.find((message) => message.fakeEvent === 'environment').hasCodexApiKey, false);
  const initialize = all.find((message) => message.method === 'initialize');
  assert.deepEqual(initialize.params.capabilities, null);
  await control.close();

  const versionLog = nextLog('c13-version');
  const versionGuard = new CodexAppServerFactory({
    command: process.execPath,
    args: [fixture],
    shell: false,
    closeGraceMs: 100,
    requestTimeoutMs: 1_000,
    certifiedVersions: ['9.9.9'],
    env: { FAKE_LOG_PATH: versionLog, FAKE_MODE: 'normal' }
  });
  await assert.rejects(versionGuard.open(request('codex-proof-c13-version')), (error) => error?.outcome === 'needs-verification');
  assert.equal((await messages(versionLog)).filter((message) => message.method === 'thread/start').length, 0);
});

test('C14 VS Code-free: control host and adapter import no vscode module', async () => {
  const hostSource = await readFile(join(repoRoot, 'src', 'player-control', 'host.ts'), 'utf8');
  const adapterSource = await readFile(join(repoRoot, 'src', 'player-control', 'codex-app-server.ts'), 'utf8');
  assert.doesNotMatch(hostSource, /from ['"]vscode['"]|require\(['"]vscode['"]\)/);
  assert.doesNotMatch(adapterSource, /from ['"]vscode['"]|require\(['"]vscode['"]\)/);
});

test('C15 regression contract: legacy instance and name routes retain sendText transport', async () => {
  const serverSource = await readFile(join(repoRoot, 'src', 'server.ts'), 'utf8');
  const rosterSource = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  const pageSource = await readFile(join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  const presentationSource = await readFile(join(repoRoot, 'src', 'controlled-player-presentation.ts'), 'utf8');
  assert.match(serverSource, /const matches = vscode\.window\.terminals\.filter\(\(candidate\) => candidate\.name === terminalName\)/);
  assert.match(serverSource, /terminal\.sendText\(modelSwitch, true\);[\s\S]*?terminal\.sendText\(prompt\.replace\(\/\\u0000\/g, ''\), true\);/);
  assert.match(serverSource, /resolution\.transport === 'controlled'[\s\S]*?deliverControlled\(playerInstanceId, prompt\.replace/);
  assert.match(serverSource, /addControlledInstance\(playerId\)/);
  assert.match(rosterSource, /book\.allocate\(player\.id\)[\s\S]*?controlHost\.open\([\s\S]*?createControlledPresentation\(record\.instanceId/);
  assert.match(rosterSource, /createTerminal\(\{ name: `\$\{fieldLabel\} · Controlled`, pty: presentation, isTransient: true \}\)/);
  assert.match(pageSource, /Put Controlled on Field[\s\S]*?\/controlled-instances/);
  assert.match(presentationSource, /handleInput\(\): void \{[\s\S]*?Send Plays through Sideline Coach/);
  assert.doesNotMatch(presentationSource, /sendText|child_process/);
});
