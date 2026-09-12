import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planControlledRestores } from '../out/player-control/bindings.js';
import { CodexAppServerFactory } from '../out/player-control/codex-app-server.js';
import { PlayerControlHost } from '../out/player-control/host.js';
import { PlayerInstanceBook } from '../out/player-instances.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-control-persistence-'));
let sequence = 0;

class MemoryStore {
  constructor(value = []) { this.value = structuredClone(value); this.snapshots = []; this.saveCount = 0; this.failOn = 0; }
  load() { return structuredClone(this.value); }
  async save(records) {
    this.saveCount += 1;
    if (this.failOn === this.saveCount) throw new Error('fake persistence failure');
    this.value = structuredClone(records);
    this.snapshots.push(structuredClone(records));
  }
}

const nextLog = (name) => join(scratch, `${++sequence}-${name}.jsonl`);
const openRequest = (instanceId, seat = 1) => ({
  instanceId,
  playerType: 'codex',
  seat,
  gameRoot: repoRoot,
  authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
});
const binding = (instanceId, seat = 1, extra = {}) => ({
  instanceId,
  playerType: 'codex',
  seat,
  adapter: 'codex-app-server',
  sessionRef: `session-${instanceId}`,
  historyExpected: true,
  pendingPlay: null,
  ...extra
});
const factory = (logPath, mode = 'normal', extraEnv = {}, extraOptions = {}) => new CodexAppServerFactory({
  command: process.execPath,
  args: [fixture],
  shell: false,
  closeGraceMs: 100,
  requestTimeoutMs: 1_000,
  retryDelayMs: 5,
  resumeRetryDelaysMs: [5, 5, 5],
  env: { FAKE_LOG_PATH: logPath, FAKE_MODE: mode, ...extraEnv },
  ...extraOptions
});
const messages = async (logPath) => {
  try { return (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
};
const methods = async (logPath) => (await messages(logPath)).filter((entry) => entry.method).map((entry) => entry.method);
const waitFor = async (predicate, description, timeout = 2_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  assert.fail(`Timed out waiting for ${description}`);
};

test('P1-P3 open persists one minimal binding; leave removes it; channel disposal preserves it', async () => {
  const store = new MemoryStore();
  const host = new PlayerControlHost(store);
  host.register('codex', factory(nextLog('p1-open')));
  const outcome = await host.open(openRequest('codex-11111111', 2));
  assert.equal(outcome.kind, 'ready');
  assert.equal(store.value.length, 1);
  assert.deepEqual(Object.keys(store.value[0]).sort(), ['adapter', 'historyExpected', 'instanceId', 'pendingPlay', 'playerType', 'seat', 'sessionRef'].sort());
  assert.deepEqual({ ...store.value[0], sessionRef: '<provider>' }, {
    instanceId: 'codex-11111111', playerType: 'codex', seat: 2, adapter: 'codex-app-server', sessionRef: '<provider>', historyExpected: false, pendingPlay: null
  });
  await host.dispose();
  assert.equal(store.value.length, 1, 'deactivation/channel disposal preserves the binding');

  const restoredHost = new PlayerControlHost(store);
  restoredHost.register('codex', factory(nextLog('p2-leave'), 'resume-ok'));
  restoredHost.planRestores();
  await restoredHost.leave('codex-11111111');
  assert.deepEqual(store.value, [], 'explicit Leave Field removes the binding');

  const rosterSource = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  assert.match(rosterSource, /exitStatus\?\.reason !== vscode\.TerminalExitReason\.User\) return/);
});

test('P4-P7 restore keeps exact Sideline identity/session and resumes without starting a thread or Play', async () => {
  const record = binding('codex-22222222', 3);
  const store = new MemoryStore([record]);
  const log = nextLog('p4-restore');
  const host = new PlayerControlHost(store);
  host.register('codex', factory(log, 'resume-ok'));
  assert.deepEqual(host.planRestores().map((plan) => [plan.kind, plan.record.instanceId, plan.record.seat]), [['restore', record.instanceId, 3]]);
  const outcome = await host.restore(openRequest(record.instanceId, 3));
  assert.equal(outcome.kind, 'ready');
  assert.equal(outcome.control.providerSessionRef, record.sessionRef);
  const all = await messages(log);
  assert.equal(all.find((entry) => entry.method === 'thread/read').params.threadId, record.sessionRef);
  assert.equal(all.find((entry) => entry.method === 'thread/resume').params.threadId, record.sessionRef);
  assert.equal(all.filter((entry) => entry.method === 'thread/start').length, 0);
  assert.equal(all.filter((entry) => entry.method === 'turn/start').length, 0);
  await host.dispose();
});

test('P3/P28 disposal waits for an in-flight restore, preserves its binding, and leaves no late-bound child', async () => {
  const record = binding('codex-22222223', 4);
  const store = new MemoryStore([record]);
  const log = nextLog('p3-inflight-dispose');
  const host = new PlayerControlHost(store);
  host.register('codex', factory(log, 'resume-ok', { FAKE_RESUME_DELAY_MS: '100' }));
  host.planRestores();
  const restoring = host.restore(openRequest(record.instanceId, 4));
  await waitFor(async () => (await messages(log)).some((entry) => entry.method === 'thread/resume'), 'in-flight resume request');
  await host.dispose();
  assert.equal((await restoring).kind, 'needs-decision');
  assert.equal(store.value[0].instanceId, record.instanceId);
  assert.equal(host.resolve(record.instanceId), undefined);
});

test('P8 contradictions veto restore and send zero Plays', async () => {
  for (const [mode, suffix] of [['resume-wrong-cwd', '31'], ['resume-authority-default', '32']]) {
    const record = binding(`codex-333333${suffix}`);
    const log = nextLog(`p8-${mode}`);
    const host = new PlayerControlHost(new MemoryStore([record]));
    host.register('codex', factory(log, mode));
    host.planRestores();
    assert.equal((await host.restore(openRequest(record.instanceId))).kind, 'needs-decision');
    assert.equal((await messages(log)).filter((entry) => entry.method === 'turn/start').length, 0);
    await host.dispose();
  }
});

test('P9 missing conversations branch only opens fresh when no history was expected', async () => {
  const emptyRecord = binding('codex-44444441', 1, { historyExpected: false });
  const emptyStore = new MemoryStore([emptyRecord]);
  const emptyLog = nextLog('p9-empty');
  const emptyHost = new PlayerControlHost(emptyStore);
  emptyHost.register('codex', factory(emptyLog, 'resume-missing'));
  emptyHost.planRestores();
  const fresh = await emptyHost.restore(openRequest(emptyRecord.instanceId));
  assert.equal(fresh.kind, 'ready');
  assert.equal(fresh.openedFresh, true);
  assert.notEqual(emptyStore.value[0].sessionRef, emptyRecord.sessionRef);
  assert.equal((await messages(emptyLog)).filter((entry) => entry.method === 'thread/start').length, 1);
  await emptyHost.dispose();

  const historyRecord = binding('codex-44444442');
  const historyStore = new MemoryStore([historyRecord]);
  const historyLog = nextLog('p9-history');
  const historyHost = new PlayerControlHost(historyStore);
  historyHost.register('codex', factory(historyLog, 'resume-missing'));
  historyHost.planRestores();
  assert.equal((await historyHost.restore(openRequest(historyRecord.instanceId))).kind, 'needs-decision');
  assert.equal(historyStore.value[0].sessionRef, historyRecord.sessionRef);
  assert.equal((await messages(historyLog)).filter((entry) => entry.method === 'thread/start').length, 0);
  await historyHost.dispose();
});

test('P10 duplicate instance or provider-session ownership quarantines every claimant before contact', () => {
  const duplicateId = binding('codex-55555551');
  const duplicateSessionA = binding('codex-55555552', 2, { sessionRef: 'shared-session' });
  const duplicateSessionB = binding('codex-55555553', 3, { sessionRef: 'shared-session' });
  const plans = planControlledRestores([duplicateId, { ...duplicateId, seat: 4 }, duplicateSessionA, duplicateSessionB], new Set(['codex-app-server']));
  assert.equal(plans.length, 4);
  assert.ok(plans.every((plan) => plan.kind === 'needs-decision'));
});

test('P11-P12 three restores are isolated and one failure cannot poison siblings', async () => {
  const records = [binding('codex-66666661', 1), binding('codex-66666662', 2), binding('codex-66666663', 3)];
  const logs = new Map(records.map((record) => [record.instanceId, nextLog(`p11-${record.seat}`)]));
  const delegates = new Map(records.map((record) => [record.instanceId, factory(logs.get(record.instanceId), record.seat === 2 ? 'resume-wrong-cwd' : 'resume-ok')]));
  const multiplex = {
    adapterId: 'codex-app-server',
    open: (request) => delegates.get(request.instanceId).open(request),
    restore: (request, stored) => delegates.get(request.instanceId).restore(request, stored)
  };
  const host = new PlayerControlHost(new MemoryStore(records));
  host.register('codex', multiplex);
  host.planRestores();
  const outcomes = await Promise.all(records.map((record) => host.restore(openRequest(record.instanceId, record.seat))));
  assert.deepEqual(outcomes.map((outcome) => outcome.kind), ['ready', 'needs-decision', 'ready']);
  assert.equal(host.resolve(records[0].instanceId)?.providerSessionRef, records[0].sessionRef);
  assert.equal(host.resolve(records[2].instanceId)?.providerSessionRef, records[2].sessionRef);
  assert.equal(host.resolve(records[1].instanceId), undefined);
  await host.dispose();
});

test('P13-P14 stored seats restore deterministically and high-water allocation remains monotonic', () => {
  const book = new PlayerInstanceBook();
  assert.equal(book.adoptControlled('codex-77777771', 'codex', 1).seat, 1);
  assert.equal(book.adoptControlled('codex-77777772', 'codex', 1).seat, 2, 'later collision moves only the later record');
  assert.equal(book.adoptControlled('codex-77777773', 'codex', 3).seat, 3);
  assert.equal(book.allocate('codex').seat, 4);

  const sparse = new PlayerInstanceBook();
  sparse.adoptControlled('codex-77777774', 'codex', 1);
  sparse.adoptControlled('codex-77777775', 'codex', 3);
  assert.equal(sparse.allocate('codex').seat, 4);
});

test('P15-P17 restoring/unavailable routing is 409 and restore lifecycle reaches Ready with zero turns', async () => {
  const serverSource = await readFile(join(repoRoot, 'src', 'server.ts'), 'utf8');
  const rosterSource = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  const extensionSource = await readFile(join(repoRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(serverSource, /resolution\.state === 'pending'[\s\S]*?this\.json\(res, 409/);
  assert.match(serverSource, /resolution\.state === 'unavailable'[\s\S]*?this\.json\(res, 409/);
  assert.match(rosterSource, /controlled\.state === 'restoring'[\s\S]*?state: 'pending'/);
  assert.match(rosterSource, /handleControlEvent[\s\S]*?crashRestoreAttempted = true[\s\S]*?state = 'restoring'[\s\S]*?restoreControlled\(hosted\.instanceId, true\)/);
  assert.match(extensionSource, /new PlayerControlHost\(new WorkspaceStateBindingStore\(context\.workspaceState\)\)[\s\S]*?register\('codex'[\s\S]*?new PlayerRoster/);
  const record = binding('codex-88888881');
  const log = nextLog('p16-events');
  const host = new PlayerControlHost(new MemoryStore([record]));
  host.register('codex', factory(log));
  host.planRestores();
  const events = [];
  host.onEvent((event) => events.push(event));
  assert.equal((await host.restore(openRequest(record.instanceId))).kind, 'ready');
  assert.ok(events.some((event) => event.event.kind === 'channel' && event.event.state === 'ready'));
  assert.equal((await messages(log)).filter((entry) => entry.method === 'turn/start').length, 0);
  await host.dispose();
});

test('P18-P19 uncertain work remains Unknown; reconciliation uses exact turnRef/clientRef only', async () => {
  const pending = { clientRef: 'pending-client', turnRef: 'pending-turn' };
  const unknownRecord = binding('codex-99999991', 1, { pendingPlay: pending });
  const unknownLog = nextLog('p18-unknown');
  const unknownHost = new PlayerControlHost(new MemoryStore([unknownRecord]));
  unknownHost.register('codex', factory(unknownLog, 'history-interrupted-no-items', { FAKE_HISTORY_TURN_REF: 'different-turn' }));
  unknownHost.planRestores();
  const unknown = await unknownHost.restore(openRequest(unknownRecord.instanceId));
  assert.equal(unknown.kind, 'ready');
  assert.equal(unknown.reconciliation.kind, 'unknown');
  assert.equal((await messages(unknownLog)).filter((entry) => entry.method === 'turn/start').length, 0);
  await unknownHost.dispose();

  const exactRecord = binding('codex-99999992', 2, { pendingPlay: pending });
  const exactStore = new MemoryStore([exactRecord]);
  const exactHost = new PlayerControlHost(exactStore);
  exactHost.register('codex', factory(nextLog('p19-exact'), 'history-completed', { FAKE_HISTORY_TURN_REF: pending.turnRef, FAKE_HISTORY_CLIENT_REF: 'wrong-client' }));
  exactHost.planRestores();
  const exact = await exactHost.restore(openRequest(exactRecord.instanceId, 2));
  assert.equal(exact.kind, 'ready');
  assert.equal(exact.reconciliation.kind, 'completed');
  assert.equal(exactStore.value[0].pendingPlay, null);
  await exactHost.dispose();

  const clientRecord = binding('codex-99999993', 3, { pendingPlay: { clientRef: 'exact-client' } });
  const clientHost = new PlayerControlHost(new MemoryStore([clientRecord]));
  clientHost.register('codex', factory(nextLog('p19-client'), 'history-failed', { FAKE_HISTORY_CLIENT_REF: 'exact-client' }));
  clientHost.planRestores();
  const clientExact = await clientHost.restore(openRequest(clientRecord.instanceId, 3));
  assert.equal(clientExact.kind, 'ready');
  assert.equal(clientExact.reconciliation.kind, 'failed');
  await clientHost.dispose();

  const lossStore = new MemoryStore();
  const lossLog = nextLog('p18-ack-loss');
  const lossHost = new PlayerControlHost(lossStore);
  lossHost.register('codex', factory(lossLog, 'ack-loss'));
  await lossHost.open(openRequest('codex-99999994', 4));
  assert.equal((await lossHost.deliver('codex-99999994', 'uncertain once')).kind, 'unknown');
  assert.ok(lossStore.value[0].pendingPlay?.clientRef);
  assert.equal((await messages(lossLog)).filter((entry) => entry.method === 'turn/start').length, 1);
  await lossHost.dispose();
});

test('P20-P21 delivery writes clientRef before turn/start, records turnRef, and failed write-ahead sends nothing', async () => {
  const store = new MemoryStore();
  const log = nextLog('p20-write-ahead');
  const host = new PlayerControlHost(store);
  host.register('codex', factory(log, 'hold'));
  await host.open(openRequest('codex-aaaaaaa1'));
  const outcome = await host.deliver('codex-aaaaaaa1', 'one safely recorded Play');
  assert.equal(outcome.kind, 'accepted');
  const pendingSnapshots = store.snapshots.map((snapshot) => snapshot[0]?.pendingPlay).filter(Boolean);
  assert.ok(pendingSnapshots.some((value) => value.clientRef && value.turnRef === undefined));
  assert.ok(pendingSnapshots.some((value) => value.clientRef && value.turnRef === outcome.turnRef));
  const sent = (await messages(log)).find((entry) => entry.method === 'turn/start');
  assert.equal(sent.params.clientUserMessageId, pendingSnapshots[0].clientRef);
  await host.dispose();

  const failedStore = new MemoryStore();
  const failedLog = nextLog('p21-failed-write');
  const failedHost = new PlayerControlHost(failedStore);
  failedHost.register('codex', factory(failedLog, 'hold'));
  await failedHost.open(openRequest('codex-aaaaaaa2'));
  failedStore.failOn = failedStore.saveCount + 1;
  const refused = await failedHost.deliver('codex-aaaaaaa2', 'must never cross provider boundary');
  assert.deepEqual(refused, { kind: 'refused', reason: 'unavailable', message: `Coach couldn't record this Play safely.` });
  assert.equal((await messages(failedLog)).filter((entry) => entry.method === 'turn/start').length, 0);
  await failedHost.dispose();

  const completedStore = new MemoryStore();
  const completedHost = new PlayerControlHost(completedStore);
  completedHost.register('codex', factory(nextLog('p20-completed')));
  await completedHost.open(openRequest('codex-aaaaaaa3'));
  assert.equal((await completedHost.deliver('codex-aaaaaaa3', 'complete normally')).kind, 'accepted');
  await waitFor(() => completedStore.value[0]?.historyExpected === true && completedStore.value[0]?.pendingPlay === null, 'definite completion persistence');
  await completedHost.dispose();
});

test('P22 writer lock retries are bounded and stop in Needs decision', async () => {
  const record = binding('codex-bbbbbbb1');
  const log = nextLog('p22-writer');
  const host = new PlayerControlHost(new MemoryStore([record]));
  host.register('codex', factory(log, 'resume-writer-busy-99'));
  host.planRestores();
  assert.equal((await host.restore(openRequest(record.instanceId))).kind, 'needs-decision');
  assert.equal((await messages(log)).filter((entry) => entry.method === 'thread/resume').length, 4);
  await host.dispose();
});

test('P23-P24 version and ChatGPT auth gates stop before thread calls on open and restore', async () => {
  for (const [mode, expected] of [['version-other', 'needs-verification'], ['account-apikey', 'needs-decision'], ['account-none', 'needs-sign-in']]) {
    const instanceId = `codex-ccccccc${mode === 'version-other' ? '1' : mode === 'account-apikey' ? '2' : '3'}`;
    const openLog = nextLog(`p24-open-${mode}`);
    const openHost = new PlayerControlHost(new MemoryStore());
    openHost.register('codex', factory(openLog, mode));
    assert.equal((await openHost.open(openRequest(instanceId))).kind, expected);
    assert.equal((await messages(openLog)).filter((entry) => entry.method?.startsWith('thread/')).length, 0);
    await openHost.dispose();

    const restoreLog = nextLog(`p24-restore-${mode}`);
    const restoreHost = new PlayerControlHost(new MemoryStore([binding(instanceId)]));
    restoreHost.register('codex', factory(restoreLog, mode));
    restoreHost.planRestores();
    assert.equal((await restoreHost.restore(openRequest(instanceId))).kind, expected);
    assert.equal((await messages(restoreLog)).filter((entry) => entry.method?.startsWith('thread/')).length, 0);
    await restoreHost.dispose();
  }
});

test('P25 malformed records are isolated and healthy siblings remain restorable', async () => {
  const healthy = binding('codex-ddddddd1');
  const stored = [{ bad: true }, healthy, { ...healthy, instanceId: 'codex-nothex00' }];
  const plans = planControlledRestores(stored, new Set(['codex-app-server']));
  assert.deepEqual(plans.map((plan) => plan.record.instanceId), [healthy.instanceId]);
  assert.equal(plans[0].kind, 'restore');
  assert.deepEqual(planControlledRestores({ not: 'an array' }, new Set(['codex-app-server'])), []);
  const store = new MemoryStore(stored);
  const host = new PlayerControlHost(store);
  host.register('codex', factory(nextLog('p25-clean')));
  host.planRestores();
  await waitFor(() => store.value.length === 1, 'per-record corruption cleanup');
  assert.equal(store.value[0].instanceId, healthy.instanceId);
  await host.dispose();
});

test('P26-P27 provider allowlist is exact and control core remains VS Code-free', async () => {
  const adapterSource = await readFile(join(repoRoot, 'src', 'player-control', 'codex-app-server.ts'), 'utf8');
  const hostSource = await readFile(join(repoRoot, 'src', 'player-control', 'host.ts'), 'utf8');
  const bindingsSource = await readFile(join(repoRoot, 'src', 'player-control', 'bindings.ts'), 'utf8');
  assert.match(adapterSource, /new Set\(\['initialize', 'thread\/start', 'turn\/start', 'account\/read', 'thread\/read', 'thread\/resume', 'thread\/turns\/list', 'model\/list'\]\)/);
  assert.doesNotMatch(adapterSource, /rpc\.request\('(thread\/delete|fs\/|command\/exec)/);
  for (const source of [adapterSource, hostSource, bindingsSource]) assert.doesNotMatch(source, /from ['"]vscode['"]|require\(['"]vscode['"]\)/);
});

test('P28 every fake provider child owned by the persistence suite exits', async () => {
  await waitFor(async () => {
    const files = await readdir(scratch);
    const pids = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const environment = (await messages(join(scratch, file))).find((entry) => entry.fakeEvent === 'environment');
      if (environment?.pid) pids.push(environment.pid);
    }
    return pids.every((pid) => !processExists(pid));
  }, 'all persistence-suite fake provider children to exit', 4_000);
});

after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}
