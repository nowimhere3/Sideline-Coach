/**
 * P0.1 — Terminal as a first-class Player.
 *
 * Terminal is on the Team but is not a reasoning provider: it runs the exact command
 * the human approved, in one exact instance, with truthful ownership and work state.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Minimal VS Code host (same approach as control-plane-roster-projection) ---

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() { return (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}
const endExecution = new StubEventEmitter();
let nextPid = 40_000;
const makeTerminal = ({ name = 'terminal', shellIntegration = true, pid } = {}) => {
  const terminal = {
    name,
    exitStatus: undefined,
    processId: Promise.resolve(pid),
    sent: [],
    executed: [],
    disposed: false,
    show() {},
    sendText(text, enter) { terminal.sent.push({ text, enter }); },
    dispose() { terminal.disposed = true; },
    shellIntegration: shellIntegration ? { executeCommand(commandLine) { const execution = { commandLine }; terminal.executed.push(execution); return execution; } } : undefined
  };
  return terminal;
};
let nextTerminalOptions = {};
const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) {
      const terminal = makeTerminal({ name: options?.name, ...nextTerminalOptions });
      vscodeStub.window.terminals.push(terminal);
      return terminal;
    },
    onDidOpenTerminal: () => ({ dispose() {} }),
    onDidCloseTerminal: () => ({ dispose() {} }),
    onDidEndTerminalShellExecution: endExecution.event
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
const { checkTerminalCommand, describeTerminalExit, TERMINAL_EXECUTION } = await import('../out/terminal-player.js');
const { computeAutoRoute, createRoutingPolicies } = await import('../out/routing-policy.js');
const { ControlPlaneRouter } = await import('../out/control-plane/router.js');
const { StadiumClient } = await import('../out/stadium-client.js');

class MemoryMemento { constructor() { this.data = new Map(); } get(k, f) { return this.data.has(k) ? structuredClone(this.data.get(k)) : f; } async update(k, v) { this.data.set(k, structuredClone(v)); } }
const GAME = 'game_git_trend';
const context = () => ({
  game: { gameId: GAME, displayName: 'Trend and Tap Assist', fingerprintSource: 'git-remote' },
  stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
  binding: { gameId: GAME, stadiumId: 'stadium_test', rootFsPath: repoRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
});
function freshRoster() {
  vscodeStub.window.terminals.length = 0;
  nextTerminalOptions = {};
  const roster = new PlayerRoster(new MemoryMemento(), new PlayerControlHost(), context);
  const turns = [];
  roster.onDidTurnChange((turn) => turns.push(turn));
  return { roster, turns };
}
const terminalOf = (roster, instanceId) => roster.terminalFor(instanceId);

// ---------------------------------------------------------------------------
// Command contract
// ---------------------------------------------------------------------------

test('P0.1-T1. Terminal commands are exact: what the human approves is what the shell receives', () => {
  assert.deepEqual(TERMINAL_EXECUTION, { executionType: 'direct-shell', model: 'not-applicable', reasoning: 'not-applicable', provider: 'none' });
  for (const command of ['git status --short', 'npm test', 'git push', 'npm run compile && npm test', 'echo "why does this fail?"', 'ls', 'Get-ChildItem -Recurse', 'python scripts/check.py\npython scripts/report.py']) {
    assert.deepEqual(checkTerminalCommand(command), { ok: true, command }, command);
  }
  const vague = checkTerminalCommand('please figure out why my tests fail');
  assert.equal(vague.ok, false);
  assert.equal(vague.reason, 'natural-language');
  assert.match(vague.message, /Terminal runs exact commands/);
  assert.equal(checkTerminalCommand('why do my tests keep failing?').ok, false);
  assert.equal(checkTerminalCommand('   ').reason, 'empty');
  assert.deepEqual(describeTerminalExit(0), { state: 'completed', summary: 'Completed · exit code 0' });
  assert.deepEqual(describeTerminalExit(1), { state: 'failed', summary: 'Failed · exit code 1' });
  assert.equal(describeTerminalExit(undefined).state, 'unknown', 'no exit code → Unknown, never Completed');
});

// ---------------------------------------------------------------------------
// Real roster
// ---------------------------------------------------------------------------

test('P0.1-T2. A Coach-managed Terminal is a first-class exact-instance MANUAL target — and never an AUTO candidate', async () => {
  const { roster } = freshRoster();
  const added = await roster.addTerminalPlayer();
  assert.equal(added.success, true);
  const routing = roster.getRoutingCapabilities(GAME);
  assert.equal(routing.length, 1);
  assert.deepEqual({ instanceId: routing[0].instanceId, playerType: routing[0].playerType, executionType: routing[0].executionType, state: routing[0].state, transportLabel: routing[0].transportLabel },
    { instanceId: added.instanceId, playerType: 'terminal', executionType: 'direct-shell', state: 'ready', transportLabel: 'Terminal' });
  assert.equal(roster.instances()[0].ownership, 'coach-managed');
  assert.deepEqual(roster.getRoutingCapabilities('game_git_other'), [], 'no cross-Game target');

  const onlyTerminal = computeAutoRoute(GAME, 'git status', routing, createRoutingPolicies());
  assert.match(onlyTerminal.error, /AUTO does not send it Plays/, 'AUTO never routes to a raw shell');
  roster.dispose();
});

test('P0.1-T3. Dispatch runs the exact command in the exact Terminal; the sibling receives nothing; shell integration proves completion', async () => {
  const { roster, turns } = freshRoster();
  const one = await roster.addTerminalPlayer();
  const two = await roster.addTerminalPlayer();
  const outcome = roster.runTerminalCommand(two.instanceId, 'git status --short');
  assert.equal(outcome.kind, 'accepted');
  assert.equal(outcome.observed, true);
  const target = terminalOf(roster, two.instanceId);
  const sibling = terminalOf(roster, one.instanceId);
  assert.deepEqual(target.executed.map((e) => e.commandLine), ['git status --short'], 'byte-for-byte command');
  assert.equal(sibling.executed.length + sibling.sent.length, 0, 'no sibling fallback');
  assert.deepEqual(turns.map((t) => `${t.instanceId}:${t.state}`), [`${two.instanceId}:accepted`, `${two.instanceId}:started`]);
  assert.equal(roster.getRoutingCapabilities(GAME).find((c) => c.instanceId === two.instanceId).state, 'busy', 'On Field + Working');
  assert.equal(roster.runTerminalCommand(two.instanceId, 'npm test').kind, 'refused', 'one command at a time per Terminal');

  endExecution.fire({ execution: { commandLine: 'human typed this' }, exitCode: 0 });
  assert.equal(turns.length, 2, "the human's own commands are never recorded as Plays");
  endExecution.fire({ execution: target.executed[0], exitCode: 0 });
  assert.equal(turns.at(-1).state, 'completed');
  assert.equal(turns.at(-1).turnRef, outcome.turnRef);
  assert.equal(roster.getRoutingCapabilities(GAME).find((c) => c.instanceId === two.instanceId).state, 'ready');

  assert.equal(roster.runTerminalCommand(two.instanceId, 'npm test').kind, 'accepted');
  endExecution.fire({ execution: target.executed[1], exitCode: 1 });
  assert.equal(turns.at(-1).state, 'failed');
  assert.match(turns.at(-1).summary, /exit code 1/);
  roster.dispose();
});

test('P0.1-T4. Without shell integration the command is sent exactly and its outcome stays Unknown — never Completed', async () => {
  const { roster, turns } = freshRoster();
  nextTerminalOptions = { shellIntegration: false };
  const added = await roster.addTerminalPlayer();
  const outcome = roster.runTerminalCommand(added.instanceId, 'npm test');
  assert.deepEqual({ kind: outcome.kind, observed: outcome.observed }, { kind: 'accepted', observed: false });
  assert.deepEqual(terminalOf(roster, added.instanceId).sent, [{ text: 'npm test', enter: true }]);
  assert.equal(turns.length, 0, 'text written to a terminal is not evidence of completion');
  roster.dispose();
});

test('P0.1-T5. Natural language is refused before anything reaches the shell', async () => {
  const { roster } = freshRoster();
  const added = await roster.addTerminalPlayer();
  const outcome = roster.runTerminalCommand(added.instanceId, 'please figure out why my tests fail');
  assert.equal(outcome.kind, 'refused');
  assert.match(outcome.message, /Terminal runs exact commands/);
  const terminal = terminalOf(roster, added.instanceId);
  assert.equal(terminal.executed.length + terminal.sent.length, 0);
  roster.dispose();
});

test('P0.1-T6. Bench keeps the Terminal alive but ineligible; Put on Field restores it; Remove closes only the exact Coach-owned terminal', async () => {
  const { roster } = freshRoster();
  const keep = await roster.addTerminalPlayer();
  const target = await roster.addTerminalPlayer();
  await roster.takeOffField(target.instanceId);
  const benched = roster.runTerminalCommand(target.instanceId, 'git status --short');
  assert.equal(benched.kind, 'refused');
  assert.match(benched.message, /bench/);
  assert.equal(terminalOf(roster, target.instanceId).disposed, false, 'bench never closes the terminal');
  assert.ok(!roster.getRoutingCapabilities(GAME).some((c) => c.instanceId === target.instanceId), 'benched → not a target');

  await roster.putInstanceOnField(target.instanceId);
  assert.equal(roster.runTerminalCommand(target.instanceId, 'npm test').kind, 'accepted');

  const targetTerminal = terminalOf(roster, target.instanceId);
  const keepTerminal = terminalOf(roster, keep.instanceId);
  const removed = await roster.removePlayer(target.instanceId);
  assert.equal(removed.ownership, 'coach-managed');
  assert.equal(targetTerminal.disposed, true, 'Coach-owned terminal closes');
  assert.equal(keepTerminal.disposed, false, 'sibling untouched');
  const after = roster.runTerminalCommand(target.instanceId, 'git status --short');
  assert.equal(after.kind, 'refused', 'a removed Terminal refuses — never substituted');
  assert.equal(keepTerminal.executed.length + keepTerminal.sent.length, 0);
  roster.dispose();
});

test('P0.1-T7. A human terminal joins only by explicit adoption, and Remove detaches without closing it', async () => {
  const { roster } = freshRoster();
  const human = makeTerminal({ name: 'pwsh (mine)', pid: 4321 });
  vscodeStub.window.terminals.push(human);
  assert.equal(roster.getRoutingCapabilities(GAME).length, 0, 'an open shell is never automatically a target');
  const adopted = await roster.adoptTerminal(4321);
  assert.equal(adopted.success, true);
  assert.equal(roster.instances().find((i) => i.instanceId === adopted.instanceId).ownership, 'adopted');
  assert.equal(roster.runTerminalCommand(adopted.instanceId, 'git status --short').kind, 'accepted');
  assert.deepEqual(human.executed.map((e) => e.commandLine), ['git status --short']);
  const removed = await roster.removePlayer(adopted.instanceId);
  assert.equal(removed.ownership, 'adopted');
  assert.equal(human.disposed, false, "the human's terminal stays open");
  assert.equal((await roster.adoptTerminal(9999)).success, false);
  roster.dispose();
});

// ---------------------------------------------------------------------------
// Router + Stadium dispatch
// ---------------------------------------------------------------------------

test('P0.1-T8. MANUAL dispatch to Terminal 2 targets that exact instance with no model or reasoning', async () => {
  const frames = [];
  const registry = new EventEmitter();
  const terminal = (instanceId, fieldLabel) => ({ instanceId, playerType: 'terminal', transport: 'legacy', transportLabel: 'Terminal', executionType: 'direct-shell', fieldLabel, state: 'ready', capability: { provider: 'terminal', freshness: 'unavailable', models: [] } });
  const session = { instanceId: 'inst', stadiumId: 's1', rosterSynchronized: true, capabilities: [terminal('terminal-11111111', 'Terminal'), terminal('terminal-22222222', 'Terminal 2')], socket: { send: (raw) => frames.push(JSON.parse(raw)) } };
  registry.getSelectedGameId = () => GAME;
  registry.getAuthoritativeSessionForGame = () => ({ status: 'connected', session });
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ prompt: 'git status --short', routingMode: 'manual', playerInstanceId: 'terminal-22222222', model: 'auto', effort: 'high', gameId: GAME });
  assert.equal(frames[0].params.playerInstanceId, 'terminal-22222222');
  assert.equal(frames[0].params.prompt, 'git status --short');
  assert.equal(frames[0].params.model, undefined, 'model not applicable');
  assert.equal(frames[0].params.effort, undefined, 'reasoning not applicable');
  registry.emit('change', { type: 'session-removed', instanceId: 'inst' });
  await pending;
});

test('P0.1-T9. The Stadium runs Terminal Plays through the exact instance and reports refusals truthfully', async () => {
  const calls = [];
  const notifications = [];
  const roster = {
    resolve: (id) => ({ state: 'live', transport: 'legacy', terminal: { name: 'Terminal' }, instance: { instanceId: id, playerType: 'terminal', onField: true } }),
    runTerminalCommand: (id, text) => { calls.push({ id, text }); return text === 'bad' ? { kind: 'refused', message: 'Terminal runs exact commands. Nothing was run.' } : { kind: 'accepted', turnRef: 'cmd-1', observed: true }; }
  };
  const client = new StadiumClient({ gameContextGetter: () => ({ stadium: { stadiumId: 's1' }, game: { gameId: GAME }, binding: {} }), playerRoster: roster, sendTerminalText: () => { throw new Error('never by name'); } });
  client.sendNotification = (method, params) => notifications.push({ method, params });
  await client.executeDispatch({ clientRef: 'r1', stadiumId: 's1', gameId: GAME, playerInstanceId: 'terminal-22222222', prompt: 'git status --short' });
  await client.executeDispatch({ clientRef: 'r2', stadiumId: 's1', gameId: GAME, playerInstanceId: 'terminal-22222222', prompt: 'bad' });
  assert.deepEqual(calls, [{ id: 'terminal-22222222', text: 'git status --short' }, { id: 'terminal-22222222', text: 'bad' }]);
  assert.equal(notifications[0].method, 'dispatch.accepted');
  assert.equal(notifications[0].params.turnRef, 'cmd-1');
  assert.equal(notifications[1].method, 'dispatch.rejected');
  assert.match(notifications[1].params.error.message, /Nothing was run/);
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function renderPage(status, posts = []) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
    classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; }, getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { this.children.push(c); }, append(...k) { this.children.push(...k); }, focus() {}
  });
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
  let source;
  class FakeEventSource { constructor() { this.listeners = {}; source = this; } addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); } emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); } close() {} }
  const session = new Map([['sidelineCoachToken', 'test-token']]);
  const ctx = {
    document: { getElementById: getEl, querySelectorAll: (s) => (s === '[data-live-action]' ? [getEl('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {} },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      if (url.startsWith('/api/status')) return { ok: true, status: 200, json: async () => status };
      if (url.startsWith('/api/reports')) return { ok: true, status: 200, json: async () => [] };
      posts.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      return { ok: true, status: 200, json: async () => ({ success: true, message: 'ok' }) };
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, console,
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  return {
    getEl,
    start: async (code) => {
      vm.createContext(ctx);
      vm.runInContext(code, ctx);
      source.emit('hello');
      const end = Date.now() + 2000;
      while (Date.now() < end && !getEl('roster').children.length) await new Promise((r) => setTimeout(r, 5));
    }
  };
}

const terminalStatus = () => {
  const t1 = { instanceId: 'terminal-11111111', playerType: 'terminal', seat: 1, fieldLabel: 'Terminal', ownership: 'coach-managed', onField: true, transport: 'Terminal' };
  const t3 = { instanceId: 'terminal-33333333', playerType: 'terminal', seat: 3, fieldLabel: 'Terminal 3', ownership: 'adopted', onField: true, transport: 'Adopted' };
  const cap = (i, label) => ({ instanceId: i.instanceId, playerType: 'terminal', transport: 'legacy', transportLabel: label, executionType: 'direct-shell', fieldLabel: i.fieldLabel, state: 'ready', capability: { provider: 'terminal', freshness: 'unavailable', models: [] }, work: { workState: 'idle' } });
  const caps = [cap(t1, 'Terminal'), cap(t3, 'Adopted')];
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Trend and Tap Assist', fingerprintSource: 'git-remote' },
    games: [{ gameId: GAME, displayName: 'Trend and Tap Assist', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{ id: 'terminal', name: 'Terminal', availability: 'available', fieldState: 'on-field', instances: [t1, t3] }],
    capabilities: caps,
    routing: { mode: 'manual', capabilities: caps },
    playerDiscovery: { catalog: [{ playerType: 'terminal', displayName: 'Terminal', state: 'available', summary: 'Available', canAddNow: true, controlled: false }], externalCandidates: [], runningElsewhere: [], adoptableTerminals: [{ terminalName: 'pwsh (mine)', shellPid: 4321 }], externalScanSupported: true },
    preferences: { runningPlayers: 'ask' },
    reports: []
  };
};
const pageScript = async () => (await readFile(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];

test('P0.1-T10. Roster numbers Terminals by position (Terminal 1, Terminal 2 — not seat 3); MANUAL shows Command with model/reasoning Not applicable', async () => {
  const page = renderPage(terminalStatus());
  await page.start(await pageScript());
  const cards = page.getEl('roster').children.filter((r) => r.className === 'player');
  assert.deepEqual(cards.map((c) => c.children[1].children[0].textContent), ['Terminal 1', 'Terminal 2'], 'human numbering is presentation only');

  const select = page.getEl('terminalSelect');
  select.value = 'terminal-33333333';
  for (const fn of select.listeners.change || []) fn({ target: select });
  assert.equal(page.getEl('payloadLabel').textContent, 'Command');
  assert.match(page.getEl('promptInput').placeholder, /git status --short/);
  assert.equal(page.getEl('modelSelect').disabled, true);
  assert.equal(page.getEl('modelSelect').children.at(-1).textContent, 'Not applicable');
  assert.equal(page.getEl('effortSelect').children.at(-1).textContent, 'Not applicable');
  assert.match(page.getEl('legacyNotice').textContent, /exactly the command you type/);
});

test('P0.1-T11. Recruit offers "Adopt as Terminal" for an open human terminal and posts only that exact shell', async () => {
  const posts = [];
  const page = renderPage(terminalStatus(), posts);
  await page.start(await pageScript());
  const rows = page.getEl('playerCatalog').children;
  const adoptRow = rows.find((row) => row.dataset.recruitState === 'adoptable-terminal');
  assert.ok(adoptRow, 'adoptable terminal is listed, never auto-added');
  const button = adoptRow.children.find((c) => c.className === 'player-actions').children[0];
  assert.equal(button.textContent, 'Adopt as Terminal');
  for (const fn of button.listeners.click || []) await fn();
  assert.deepEqual(posts.find((p) => p.url === '/api/players/adopt-terminal')?.body, { shellPid: 4321 });
});

test('P0.1-T12. Work Ledger: a Terminal command is Working only with shell-integration evidence, Unknown without it', async () => {
  const { InstanceWorkLedger } = await import('../out/control-plane/work-ledger.js');
  let now = 1;
  const book = new InstanceWorkLedger(() => ++now);
  const dispatch = (instanceId, clientRef) => ({ gameId: GAME, playerInstanceId: instanceId, playerType: 'terminal', clientRef, playLabel: 'Command', transport: 'legacy', at: now });

  book.recordDispatch(dispatch('terminal-11111111', 'ref_a'));
  book.recordTurn(GAME, { instanceId: 'terminal-11111111', state: 'started', turnRef: 'cmd-a' });
  book.recordDelivery('ref_a', 'received', { turnRef: 'cmd-a' });
  assert.equal(book.get(GAME, 'terminal-11111111').workState, 'working', 'shell integration proved the command started');
  book.recordTurn(GAME, { instanceId: 'terminal-11111111', state: 'completed', turnRef: 'cmd-a' });
  assert.equal(book.get(GAME, 'terminal-11111111').workState, 'completed');

  book.recordDispatch(dispatch('terminal-22222222', 'ref_b'));
  book.recordDelivery('ref_b', 'received');
  assert.equal(book.get(GAME, 'terminal-22222222').workState, 'unknown', 'text sent without evidence is never Working or Completed');
});
