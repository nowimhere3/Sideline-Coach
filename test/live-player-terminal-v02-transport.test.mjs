// Live Player Terminal V0.2 — sanitized exact-Player activity transport (backend).
//
//   ControlEvent -> PlayerRoster (allow-list + redact) -> `player.activity` notification
//   -> daemon (gate + re-sanitize + bounded store) -> SSE `activity` / GET /api/player-activity
//
// Browser rendering + Copy semantics are covered in live-player-console-first-down.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const { PlayerRoster } = await import('../out/player-roster.js');
const { PlayerControlHost } = await import('../out/player-control/host.js');
const { ControlPlaneDaemon } = await import('../out/control-plane/daemon.js');
const activity = await import('../out/player-activity.js');
const { ACTIVITY_CATEGORIES, redactSecrets, sanitizeActivityText, projectControlEvent, sessionKeyFor, PlayerActivityStore } = activity;

// ---------------------------------------------------------------------------
// Redaction + allow-list
// ---------------------------------------------------------------------------

test('LPT-1. Secret-shaped values are redacted; ordinary developer text survives', () => {
  const secrets = {
    bearer: 'curl -H "Authorization: Bearer abcDEF1234567890xyz" https://api.example.com',
    authHeader: 'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    openai: 'using sk-proj-AbCdEf1234567890AbCdEf12 for the call',
    anthropic: 'key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv here',
    openrouter: 'OPENROUTER sk-or-v1-0123456789abcdef0123456789abcdef',
    github: 'push with ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    githubPat: 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz',
    aws: 'AKIAIOSFODNN7EXAMPLE was found',
    google: 'AIzaSyA-1234567890abcdefghijklmnopqrstuv',
    slack: 'xoxb-1234567890-abcdefghij',
    jwt: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    urlCreds: 'git clone https://alice:hunter2pass@github.com/org/repo.git',
    query: 'GET https://x.test/a?access_token=ZZZsecretZZZ&page=2',
    envAssign: '$env:OPENAI_API_KEY = "hunter2-value"',
    envExport: 'export GITHUB_TOKEN=hunter2value',
    flag: 'tool --api-key hunter2value --verbose',
    flagEq: 'tool --password=hunter2value',
    json: '{"password": "hunter2value", "name": "ok"}',
    pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    opaque: 'blob 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928 done'
  };
  const needles = ['abcDEF1234567890xyz', 'dXNlcjpwYXNzd29yZA', 'AbCdEf1234567890AbCdEf12', 'AbCdEfGhIjKlMnOpQrStUv', '0123456789abcdef0123456789abcdef',
    'abcdefghijklmnopqrstuvwxyz0123456789', '11ABCDEFG0abcdef', 'AKIAIOSFODNN7EXAMPLE', '1234567890abcdefghijklmnopqrstuv', '1234567890-abcdefghij',
    'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'hunter2pass', 'ZZZsecretZZZ', 'hunter2-value', 'hunter2value', 'MIIEowIBAAKCAQEA', '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928'];
  const out = Object.values(secrets).map((text) => redactSecrets(text)).join('\n');
  for (const needle of needles) assert.ok(!out.includes(needle), `leaked ${needle}`);
  assert.match(out, /\[redacted\]/);

  for (const ok of ['git status', 'Read src/player-roster.ts', 'npm test -- --grep "terminal"', 'C:\\Users\\dmcal\\Documents\\GitHub\\SidelineCoach\\src\\a.ts', 'Edited 3 files']) {
    assert.equal(redactSecrets(ok), ok, `over-redacted: ${ok}`);
  }
  // Idempotent: the daemon re-applying the boundary never changes an already-clean line.
  for (const text of Object.values(secrets)) assert.equal(redactSecrets(redactSecrets(text)), redactSecrets(text));
});

test('LPT-2. sanitizeActivityText bounds length, strips ANSI/control characters, keeps one line except messages', () => {
  assert.equal(sanitizeActivityText('\u001b[31mred\u001b[0m\u0007 text\u0000', 'command'), 'red text');
  assert.equal(sanitizeActivityText('a\n  b\t c', 'command'), 'a b c');
  assert.ok(sanitizeActivityText('x'.repeat(5_000), 'command').length <= 240);
  assert.ok(sanitizeActivityText('y'.repeat(5_000), 'message').length <= 1200);
  assert.equal(sanitizeActivityText('one\r\n\r\n\r\n\r\ntwo', 'message'), 'one\n\ntwo');
  assert.equal(sanitizeActivityText(' spaced ', 'message', true), ' spaced ', 'streaming fragments keep spacing for concatenation');
});

test('LPT-3. projectControlEvent is an allow-list: only category/text(/streaming), never other event fields', () => {
  const dirty = projectControlEvent({
    kind: 'progress', category: 'tool', summary: 'Read a.ts',
    env: { OPENAI_API_KEY: 'sk-proj-AbCdEf1234567890AbCdEf12' }, headers: { authorization: 'Bearer zzzzzzzzzzzz' }, raw: { secret: 'x' }
  });
  assert.deepEqual(Object.keys(dirty).sort(), ['category', 'text']);
  assert.equal(JSON.stringify(dirty).includes('sk-proj'), false);
  assert.deepEqual(projectControlEvent({ kind: 'progress', category: 'command', summary: 'git status' }), { category: 'command', text: 'git status' });
  assert.deepEqual(projectControlEvent({ kind: 'progress', category: 'message', summary: 'Hel', streaming: true }), { category: 'message', text: 'Hel', streaming: true });
  assert.equal(projectControlEvent({ kind: 'turn', state: 'started', summary: 'Working…' }).category, 'working');
  assert.equal(projectControlEvent({ kind: 'turn', state: 'accepted', summary: 'Play received · 10 chars · 1 lines' }).category, 'working');
  assert.equal(projectControlEvent({ kind: 'turn', state: 'failed', summary: 'Failed: token=abc12345secret' }).text.includes('abc12345secret'), false);
  assert.equal(projectControlEvent({ kind: 'turn', state: 'completed', summary: 'Completed' }).category, 'result');
  assert.equal(projectControlEvent({ kind: 'request', state: 'declined', summary: 'Needed approval' }).category, 'declined');
  assert.equal(projectControlEvent({ kind: 'channel', state: 'lost', summary: 'Connection lost' }).category, 'channel');
  assert.equal(projectControlEvent({ kind: 'channel', state: 'ready', summary: 'READY' }), undefined);
  assert.equal(projectControlEvent({ kind: 'settings', model: 'm', runtimeVersion: '1' }), undefined);
  assert.equal(projectControlEvent({ kind: 'progress', category: 'message', summary: '   ' }), undefined);
});

test('LPT-4. sessionKey is an opaque digest, stable per session, never the provider ref', () => {
  const ref = '6f0c2b1e-aaaa-bbbb-cccc-123456789abc';
  const key = sessionKeyFor(ref);
  assert.match(key, /^[0-9a-f]{8}$/);
  assert.equal(key, sessionKeyFor(ref));
  assert.notEqual(key, sessionKeyFor('another-session'));
  assert.equal(ref.includes(key), false);
  assert.equal(sessionKeyFor(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Bounded ordered per-Player store
// ---------------------------------------------------------------------------

test('LPT-5. Store: ordered monotonic seq, exact-key separation, hard cap, duplicate command suppression', () => {
  const store = new PlayerActivityStore(5, 2);
  const say = (key, text, category = 'command', extra = {}) => store.record(key, { at: 1, category, text, ...extra });
  assert.deepEqual([say('g|claude-1', 'a').seq, say('g|claude-1', 'b').seq], [1, 2]);
  assert.equal(say('g|claude-1', 'b'), undefined, 'consecutive identical command shown once');
  assert.equal(say('g|claude-1', 'b', 'message').seq, 3, 'message with the same text is not suppressed');
  say('g|claude-2', 'other');
  assert.deepEqual(store.snapshot('g|claude-2').entries.map((e) => e.text), ['other'], 'Claude 2 sees only its own lines');
  assert.deepEqual(store.snapshot('g|claude-1').entries.map((e) => e.text), ['a', 'b', 'b']);
  for (let i = 0; i < 20; i += 1) say('g|claude-1', `line ${i}`);
  const kept = store.snapshot('g|claude-1').entries;
  assert.equal(kept.length, 5, 'bounded');
  assert.deepEqual(kept.map((e) => e.seq), [...kept.map((e) => e.seq)].sort((a, b) => a - b), 'ordered');
  assert.equal(kept[kept.length - 1].text, 'line 19');
  say('g|claude-3', 'third player');
  assert.equal(store.snapshot('g|claude-1').entries.length, 0, 'oldest Player evicted past the Player cap');
  assert.equal(store.record('g|x', { at: 1, category: 'bogus', text: 'x' }), undefined);
});

test('LPT-6. Store re-sanitizes (never trusts the sender), coalesces streaming fragments under one seq, resets on a new session', () => {
  const store = new PlayerActivityStore();
  const direct = store.record('g|p', { at: 1, category: 'command', text: 'echo sk-proj-AbCdEf1234567890AbCdEf12' });
  assert.equal(direct.text.includes('sk-proj'), false);

  const a = store.record('g|m', { at: 1, category: 'message', text: 'Hello ', streaming: true });
  const b = store.record('g|m', { at: 2, category: 'message', text: 'wor', streaming: true });
  const c = store.record('g|m', { at: 3, category: 'message', text: 'ld', streaming: true });
  assert.deepEqual([a.seq, b.seq, c.seq], [1, 1, 1], 'fragments extend one line');
  assert.equal(c.text, 'Hello world');
  assert.equal(store.snapshot('g|m').entries.length, 1);
  store.record('g|m', { at: 4, category: 'command', text: 'ls' });
  const d = store.record('g|m', { at: 5, category: 'message', text: 'again', streaming: true });
  assert.equal(d.seq, 3, 'a non-message line closes the streaming message');

  // A secret split across two fragments is caught once the fragments are joined.
  store.record('g|s', { at: 1, category: 'message', text: 'key sk-proj-AbCdEf12', streaming: true });
  const joined = store.record('g|s', { at: 2, category: 'message', text: '34567890AbCdEf12 end', streaming: true });
  assert.equal(joined.text.includes('AbCdEf1234567890'), false);

  store.record('g|q', { at: 1, category: 'command', text: 'old', sessionKey: 'aaaaaaaa' });
  const fresh = store.record('g|q', { at: 2, category: 'command', text: 'new', sessionKey: 'bbbbbbbb' });
  assert.deepEqual(store.snapshot('g|q').entries.map((e) => e.text), ['new'], 'a new provider session is a new transcript');
  assert.equal(store.snapshot('g|q').sessionKey, 'bbbbbbbb');
  assert.equal(fresh.seq, 2, 'seq keeps counting up across sessions');
});

// ---------------------------------------------------------------------------
// PlayerRoster: exact-instance projection
// ---------------------------------------------------------------------------

class MemoryMemento { constructor() { this.data = new Map(); } get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; } async update(k, v) { this.data.set(k, structuredClone(v)); } }
class MemoryBindingStore { constructor(records) { this.records = structuredClone(records); } load() { return structuredClone(this.records); } async save(records) { this.records = structuredClone(records); } }

const GAME_ID = 'game_git_lpt';
const CL1 = 'claude-cccc1111';
const CL2 = 'claude-cccc2222';
const gameContext = () => ({
  game: { gameId: GAME_ID, displayName: 'LPT', fingerprintSource: 'git-remote' },
  stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: GAME_ID, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});
const CAPABILITY = { provider: 'claude', authenticated: true, observedAt: Date.now(), freshness: 'live', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: [] }] };

function fakeControl(instanceId, providerSessionRef) {
  const listeners = new Set();
  return {
    instanceId, providerSessionRef, runtimeVersion: '1.0.0', model: undefined, effort: undefined, state: 'ready',
    async deliver() { return { kind: 'accepted', turnRef: 'turn-1' }; },
    async close() {},
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async queryCapabilities() { return CAPABILITY; },
    emit(event) { for (const listener of [...listeners]) listener(event); }
  };
}

test('LPT-7. Two controlled Claude Players: each Player\'s activity carries only its own exact instanceId + session digest', async () => {
  const controls = new Map([[CL1, fakeControl(CL1, 'session-one')], [CL2, fakeControl(CL2, 'session-two')]]);
  const factory = { adapterId: 'fake-claude', async open() { throw new Error('unused'); }, async restore(request) { return { kind: 'ready', control: controls.get(request.instanceId), reconciliation: { kind: 'none' }, openedFresh: false }; } };
  const bindings = [CL1, CL2].map((instanceId, i) => ({ instanceId, playerType: 'claude', seat: i + 1, adapter: 'fake-claude', sessionRef: instanceId === CL1 ? 'session-one' : 'session-two', historyExpected: false, pendingPlay: null, gameId: GAME_ID }));
  const host = new PlayerControlHost(new MemoryBindingStore(bindings));
  host.register('claude', factory);
  const roster = new PlayerRoster(new MemoryMemento(), host, gameContext);
  for (let i = 0; i < 100; i += 1) {
    const claude = (await roster.status()).find((p) => p.id === 'claude');
    if (claude?.instances?.length === 2 && claude.instances.every((instance) => instance.controlState === 'ready')) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const seen = [];
  roster.onDidActivity((notice) => seen.push(notice));

  controls.get(CL1).emit({ kind: 'progress', category: 'command', summary: 'git status' });
  controls.get(CL2).emit({ kind: 'progress', category: 'tool', summary: 'Read src/a.ts', env: { OPENAI_API_KEY: 'sk-proj-AbCdEf1234567890AbCdEf12' }, headers: { authorization: 'Bearer abcdefghijklmn' } });
  controls.get(CL1).emit({ kind: 'progress', category: 'message', summary: 'Using token=hunter2value now' });
  controls.get(CL1).emit({ kind: 'settings', model: 'm', runtimeVersion: '1' });
  controls.get(CL2).emit({ kind: 'turn', state: 'started', turnRef: 't', summary: 'Working…' });

  assert.deepEqual(seen.map((n) => [n.instanceId, n.category]), [[CL1, 'command'], [CL2, 'tool'], [CL1, 'message'], [CL2, 'working']], 'exact ids, in order; settings is not activity');
  for (const notice of seen) assert.deepEqual(Object.keys(notice).filter((k) => !['instanceId', 'sessionKey', 'at', 'category', 'text', 'streaming'].includes(k)), [], 'allow-listed fields only');
  assert.equal(JSON.stringify(seen).includes('sk-proj'), false);
  assert.equal(JSON.stringify(seen).includes('hunter2value'), false);
  assert.equal(JSON.stringify(seen).includes('abcdefghijklmn'), false);
  assert.equal(seen[0].sessionKey, sessionKeyFor('session-one'));
  assert.equal(seen[1].sessionKey, sessionKeyFor('session-two'));
  assert.notEqual(seen[0].sessionKey, seen[1].sessionKey);
  assert.equal(JSON.stringify(seen).includes('session-one'), false, 'raw provider session ref never leaves');
  await host.dispose();
});

// ---------------------------------------------------------------------------
// Daemon: gate, ingest, backfill, SSE
// ---------------------------------------------------------------------------

const DGAME = 'game_lpt_daemon';
const D1 = 'claude-dddd1111';
const D2 = 'claude-dddd2222';
const DAG = 'antigravity-dddd3333';

async function daemonHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40700 + Math.floor(Math.random() * 200), idleTimeoutMs: 60_000 });
  await daemon.start();
  const instances = [[D1, 'claude'], [D2, 'claude'], [DAG, 'antigravity']];
  const roster = [{ id: 'team', name: 'Players', instances: instances.map(([instanceId, playerType]) => ({ instanceId, playerType, seat: 1, fieldLabel: playerType, onField: true, controlState: 'ready' })) }];
  const caps = instances.map(([instanceId, playerType]) => ({ instanceId, playerType, transport: 'controlled', transportLabel: 'Controlled', fieldLabel: playerType, state: 'ready', executionType: 'reasoning', capability: { provider: playerType, authenticated: true, observedAt: Date.now(), freshness: 'live', models: [] } }));
  daemon.registryInstance.registerSession({
    instanceId: 'session-lpt', stadiumId: 'stadium-lpt', name: 'LPT', platform: 'win32', socket: { readyState: 1, send() {}, close() {} },
    lastHeartbeat: Date.now(), game: { gameId: DGAME, displayName: 'LPT Game', fingerprintSource: 'test', repoUri: 'https://example.test/lpt.git' },
    rootFsPath: 'C:\\Games\\LPT', roster, capabilities: caps, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  daemon.registryInstance.updateRoster('session-lpt', roster);
  daemon.registryInstance.updateCapabilities('session-lpt', caps);
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const api = async (url, init = {}) => {
    const response = await fetch(`http://127.0.0.1:${daemon.port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    return { status: response.status, body: await response.json() };
  };
  const broadcasts = [];
  const original = daemon.broadcast.bind(daemon);
  daemon.broadcast = (event, data) => { broadcasts.push({ event, data }); original(event, data); };
  const notify = (activityPayload) => daemon.handleWsNotification({}, { method: 'player.activity', params: { stadiumId: 'stadium-lpt', instanceId: 'session-lpt', gameId: DGAME, activity: activityPayload } }, 'session-lpt');
  const activityEvents = () => broadcasts.filter((b) => b.event === 'activity').map((b) => b.data);
  const backfill = (instanceId) => api(`/api/player-activity?gameId=${DGAME}&instanceId=${instanceId}`);
  const stop = async () => { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { daemon, api, notify, activityEvents, backfill, stop };
}

test('LPT-8. Daemon: nothing is stored or broadcast unless BOTH Dev Mode and View Player Terminal are on', async () => {
  const h = await daemonHarness();
  try {
    const line = { instanceId: D1, sessionKey: 'aaaaaaaa', at: 1, category: 'command', text: 'git status' };
    h.notify(line);
    assert.equal(h.activityEvents().length, 0, 'default OFF');
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ livePlayerConsole: true }) });
    h.notify(line);
    assert.equal(h.activityEvents().length, 0, 'terminal setting alone (Dev Mode off) is not enough');
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: DGAME }) });
    h.notify(line);
    assert.equal(h.activityEvents().length, 1, 'both on');
    assert.deepEqual((await h.backfill(D1)).body.entries.map((e) => e.text), ['git status']);
    // Turning the feature off discards retained content and stops the flow.
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ livePlayerConsole: false }) });
    assert.deepEqual((await h.backfill(D1)).body.entries, [], 'retained activity discarded');
    h.notify({ ...line, text: 'again' });
    assert.equal(h.activityEvents().length, 1, 'no further broadcasts');
  } finally { await h.stop(); }
});

test('LPT-9. Daemon: exact-instance routing, order, secret redaction, bounded retention, coalescing, validation', async () => {
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: DGAME }) });
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ livePlayerConsole: true }) });

    h.notify({ instanceId: D1, sessionKey: 'aaaaaaaa', at: 10, category: 'command', text: 'npm test' });
    h.notify({ instanceId: D2, sessionKey: 'bbbbbbbb', at: 11, category: 'command', text: 'git diff' });
    h.notify({ instanceId: DAG, sessionKey: 'cccccccc', at: 12, category: 'tool', text: 'view_file src/x.ts' });
    h.notify({ instanceId: D1, sessionKey: 'aaaaaaaa', at: 13, category: 'message', text: 'Header: Authorization: Bearer abcdefghijklmnop ok' });

    const events = h.activityEvents();
    assert.deepEqual(events.map((e) => [e.instanceId, e.entry.seq]), [[D1, 1], [D2, 1], [DAG, 1], [D1, 2]], 'per-Player seq, arrival order');
    assert.equal(JSON.stringify(events).includes('abcdefghijklmnop'), false, 'secrets never reach the SSE payload');
    for (const e of events) assert.equal(e.gameId, DGAME);
    const epoch = h.daemon.ledgerInstance.epoch;
    assert.ok(epoch);
    for (const e of events) assert.equal(e.epoch, epoch, 'every activity event carries the daemon epoch');
    assert.equal((await h.backfill(D1)).body.epoch, epoch);
    assert.deepEqual((await h.backfill(D1)).body.entries.map((e) => e.text), ['npm test', 'Header: Authorization: [redacted] ok']);
    assert.deepEqual((await h.backfill(D2)).body.entries.map((e) => e.text), ['git diff'], 'Claude 2 never sees Claude 1');
    assert.deepEqual((await h.backfill(DAG)).body.entries.map((e) => e.text), ['view_file src/x.ts']);
    assert.equal((await h.backfill(D1)).body.sessionKey, 'aaaaaaaa');

    const before = h.activityEvents().length;
    h.notify({ instanceId: D1, category: 'bogus', text: 'x' });
    h.notify({ instanceId: D1, category: 'command', text: 42 });
    h.notify({ category: 'command', text: 'no id' });
    h.notify(undefined);
    assert.equal(h.activityEvents().length, before, 'malformed notices are dropped');
    h.notify({ instanceId: D2, sessionKey: '../../etc/passwd', at: 1, category: 'command', text: 'weird key' });
    assert.equal(h.activityEvents().at(-1).sessionKey, undefined, 'a non-digest sessionKey is not trusted');

    // Streaming fragments extend one line and re-broadcast the SAME seq.
    h.notify({ instanceId: DAG, sessionKey: 'cccccccc', at: 20, category: 'message', text: 'Hel', streaming: true });
    h.notify({ instanceId: DAG, sessionKey: 'cccccccc', at: 21, category: 'message', text: 'lo', streaming: true });
    const tail = h.activityEvents().slice(-2);
    assert.equal(tail[0].entry.seq, tail[1].entry.seq);
    assert.equal(tail[1].entry.text, 'Hello');

    for (let i = 0; i < 350; i += 1) h.notify({ instanceId: D1, sessionKey: 'aaaaaaaa', at: 100 + i, category: 'command', text: `step ${i}` });
    const kept = (await h.backfill(D1)).body.entries;
    assert.equal(kept.length, 300, 'bounded retention');
    assert.equal(kept.at(-1).text, 'step 349');
    assert.deepEqual(kept.map((e) => e.seq), [...kept.map((e) => e.seq)].sort((a, b) => a - b), 'ordered');

    assert.equal((await h.api('/api/player-activity?gameId=x')).status, 400);
  } finally { await h.stop(); }
});

test('LPT-T1. Output category: whitespace preservation, duplicate retention, sanitization, redaction, browser label', async () => {
  // 1. Accepted category
  assert.ok(ACTIVITY_CATEGORIES.includes('output'), 'output is an accepted category');

  // 2. Leading/internal whitespace survives
  const line1 = '  modified-file.txt';
  const line2 = '    nested detail';
  const line3 = 'two  spaces  internal';
  assert.equal(sanitizeActivityText(line1, 'output'), line1, 'leading whitespace preserved');
  assert.equal(sanitizeActivityText(line2, 'output'), line2, 'leading indentation preserved');
  assert.equal(sanitizeActivityText(line3, 'output'), line3, 'internal whitespace preserved');

  // Contrast with command category (which collapses whitespace)
  assert.equal(sanitizeActivityText(line1, 'command'), 'modified-file.txt');
  assert.equal(sanitizeActivityText(line3, 'command'), 'two spaces internal');

  // 3. Trailing whitespace is removed appropriately
  assert.equal(sanitizeActivityText('    nested detail   ', 'output'), '    nested detail', 'trailing spaces trimmed');
  assert.equal(sanitizeActivityText('trailing tabs\t\t', 'output'), 'trailing tabs', 'trailing tabs trimmed');

  // 4. Two identical consecutive output lines are BOTH retained
  const store = new PlayerActivityStore();
  const e1 = store.record('g|t1', { at: 1, category: 'output', text: '  identical line' });
  const e2 = store.record('g|t1', { at: 2, category: 'output', text: '  identical line' });
  assert.ok(e1 && e2, 'both identical output lines recorded');
  assert.equal(e1.seq, 1);
  assert.equal(e2.seq, 2);
  assert.equal(e1.text, '  identical line');
  assert.equal(e2.text, '  identical line');
  assert.equal(store.snapshot('g|t1').entries.length, 2, 'both preserved in snapshot');

  // 5. ANSI escape sequences are stripped
  assert.equal(sanitizeActivityText('\u001b[32mPASS\u001b[0m test\u0007', 'output'), 'PASS test', 'ANSI stripped');

  // 6. Existing secret redaction still applies
  assert.equal(sanitizeActivityText('push with ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'output'), 'push with [redacted]', 'secret redacted');
  assert.equal(sanitizeActivityText('Bearer abcdef1234567890', 'output'), 'Bearer [redacted]', 'secret redacted');

  // 7. Over-length output is truncated according to the existing line cap (240)
  const longLine = 'a'.repeat(300);
  const truncated = sanitizeActivityText(longLine, 'output');
  assert.equal(truncated.length, 240, 'truncated to ACTIVITY_LINE_MAX');
  assert.ok(truncated.endsWith('…'), 'ends with ellipsis');

  // 8. Unknown categories are still rejected
  assert.equal(ACTIVITY_CATEGORIES.includes('unknown_category'), false);
  assert.equal(store.record('g|t1', { at: 3, category: 'unknown_category', text: 'bad' }), undefined, 'unknown category rejected');

  // 9. Existing message/command/tool behaviour remains unchanged
  assert.equal(sanitizeActivityText('a\n  b\t c', 'command'), 'a b c', 'command collapses whitespace');
  assert.equal(sanitizeActivityText('one\r\n\r\n\r\n\r\ntwo', 'message'), 'one\n\ntwo', 'message collapses newlines');
  assert.equal(sanitizeActivityText(' spaced ', 'message', true), ' spaced ', 'streaming message keeps spacing');
  const c1 = store.record('g|t1', { at: 4, category: 'command', text: 'git status' });
  const c2 = store.record('g|t1', { at: 5, category: 'command', text: 'git status' });
  assert.ok(c1);
  assert.equal(c2, undefined, 'consecutive command duplicate suppressed');

  // output never coalesces as streaming
  const o1 = store.record('g|t1', { at: 6, category: 'output', text: 'first chunk', streaming: true });
  const o2 = store.record('g|t1', { at: 7, category: 'output', text: 'second chunk', streaming: true });
  assert.ok(o1 && o2);
  assert.notEqual(o1.seq, o2.seq, 'output ignores streaming flag and gets separate seq');

  // 10. Browser knows the OUTPUT label
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  const labelsMatch = html.match(/const CONSOLE_LABELS = (\{[^}]+\});/);
  assert.ok(labelsMatch, 'CONSOLE_LABELS found in index.html');
  const labels = eval(`(${labelsMatch[1]})`);
  assert.equal(labels.output, 'OUTPUT', 'output registered as OUTPUT');

  // 11. Direct-shell eligibility is not accidentally narrowed (S54.3 only widens it: retained Terminal evidence is also eligible)
  assert.match(html, /const isTerminalEligible = liveConsoleEnabled\(\)\s*&& view\.executionType !== 'scout-formation'\s*&& record\.typeName !== 'Scout'\s*&& \(Boolean\(evidence\) \|\| view\.state === 'working' \|\| view\.state === 'starting' \|\| view\.state === 'finished'\);/);
  const placeholderMatch = html.match(/const consolePlaceholderText = (\([^)]+\)\s*=>\s*\{[\s\S]*?\n {6}\});/);
  assert.ok(placeholderMatch, 'consolePlaceholderText found in index.html');
  const placeholderFn = eval(`(${placeholderMatch[1]})`);
  assert.equal(placeholderFn({ executionType: 'direct-shell' }, { transport: 'legacy' }), 'Waiting for live execution activity…');

  // Daemon integration: output notices flow through daemon, preserve whitespace, and store repeated lines
  const h = await daemonHarness();
  try {
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ devMode: true, gameId: DGAME }) });
    await h.api('/api/preferences', { method: 'POST', body: JSON.stringify({ livePlayerConsole: true }) });

    h.notify({ instanceId: D1, sessionKey: 'aaaaaaaa', at: 50, category: 'output', text: '  modified-file.txt   ' });
    h.notify({ instanceId: D1, sessionKey: 'aaaaaaaa', at: 51, category: 'output', text: '  modified-file.txt   ' });

    const entries = (await h.backfill(D1)).body.entries;
    assert.equal(entries.length, 2, 'daemon retains both identical consecutive output lines');
    assert.equal(entries[0].text, '  modified-file.txt', 'leading whitespace preserved, trailing trimmed');
    assert.equal(entries[1].text, '  modified-file.txt', 'repeated line preserved');
    assert.equal(entries[0].category, 'output');
    assert.equal(entries[1].category, 'output');
  } finally {
    await h.stop();
  }
});
