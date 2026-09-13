/**
 * Q2.10C — Instance Work Ledger, AUTO for Controlled Claude/AntiGravity, and the
 * Roster surfaces that make them first-class.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstanceWorkLedger, RECENT_PLAY_LIMIT } from '../out/control-plane/work-ledger.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { computeAutoRoute, createRoutingPolicies } from '../out/routing-policy.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policies = createRoutingPolicies();

let clock = 1_000;
const tick = (ms = 10) => (clock += ms);
const ledger = () => new InstanceWorkLedger(() => clock);
const dispatch = (overrides = {}) => ({ gameId: 'g1', playerInstanceId: 'claude-11111111', playerType: 'claude', clientRef: `ref_${tick()}`, playLabel: 'Hard architecture Play', promptSummary: 'Design the ledger', model: 'opus', effort: 'high', transport: 'controlled', at: clock, ...overrides });

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

test('Q2.10C-L1. Dispatching to an exact instance records the real Play: label, resolved model/effort, start — sibling untouched', () => {
  const book = ledger();
  book.observeRoster('g1', [
    { instanceId: 'claude-11111111', playerType: 'claude', transport: 'controlled', state: 'ready' },
    { instanceId: 'claude-22222222', playerType: 'claude', transport: 'controlled', state: 'ready' }
  ]);
  assert.equal(book.get('g1', 'claude-22222222').workState, 'idle', 'a Controlled Player reporting ready is known idle');
  const play = dispatch();
  book.recordDispatch(play);
  assert.equal(book.get('g1', 'claude-11111111').workState, 'idle', 'nothing is claimed before the Stadium confirms');
  // Stadium order: turn events first, then dispatch.accepted.
  book.recordTurn('g1', { instanceId: 'claude-11111111', state: 'accepted', turnRef: 'turn-a' });
  book.recordDelivery(play.clientRef, 'received', { turnRef: 'turn-a' });
  const entry = book.get('g1', 'claude-11111111');
  assert.equal(entry.workState, 'working');
  assert.deepEqual(
    { clientRef: entry.currentPlay.clientRef, playLabel: entry.currentPlay.playLabel, model: entry.currentPlay.model, effort: entry.currentPlay.effort, turnRef: entry.currentPlay.turnRef },
    { clientRef: play.clientRef, playLabel: 'Hard architecture Play', model: 'opus', effort: 'high', turnRef: 'turn-a' }
  );
  assert.equal(book.get('g1', 'claude-22222222').workState, 'idle', 'sibling ledger untouched');
  assert.equal(book.get('g1', 'claude-22222222').currentPlay, undefined);
});

test('Q2.10C-L2. Semantic completion closes the exact Play into bounded history; failure and interruption are recorded as such', () => {
  const book = ledger();
  for (let i = 0; i < RECENT_PLAY_LIMIT + 3; i += 1) {
    const play = dispatch();
    book.recordDispatch(play);
    book.recordTurn('g1', { instanceId: play.playerInstanceId, state: 'started', turnRef: `t${i}` });
    book.recordDelivery(play.clientRef, 'received', { turnRef: `t${i}` });
    tick();
    book.recordTurn('g1', { instanceId: play.playerInstanceId, state: i === 0 ? 'failed' : 'completed', turnRef: `t${i}`, summary: 'Completed' });
  }
  const entry = book.get('g1', 'claude-11111111');
  assert.equal(entry.workState, 'completed');
  assert.equal(entry.currentPlay, undefined);
  assert.equal(entry.recentPlays.length, RECENT_PLAY_LIMIT, 'history is bounded — an orchestration aid, not an archive');
  assert.equal(entry.recentPlays[0].outcome, 'completed');
  assert.ok(entry.recentPlays[0].finishedAt >= entry.recentPlays[0].startedAt);

  // A Play that finishes before the router hears "received" is never resurrected as working.
  const fast = dispatch({ playerInstanceId: 'claude-33333333' });
  book.recordDispatch(fast);
  book.recordTurn('g1', { instanceId: 'claude-33333333', state: 'accepted', turnRef: 'fast' });
  book.recordTurn('g1', { instanceId: 'claude-33333333', state: 'completed', turnRef: 'fast' });
  book.recordDelivery(fast.clientRef, 'received', { turnRef: 'fast' });
  assert.equal(book.get('g1', 'claude-33333333').workState, 'completed');
  assert.equal(book.get('g1', 'claude-33333333').recentPlays[0].clientRef, fast.clientRef);
});

test('Q2.10C-L3. Disconnect never fabricates completion; Unknown stays possible; Terminal Players are Unknown, not Working', () => {
  const book = ledger();
  const play = dispatch();
  book.recordDispatch(play);
  book.recordTurn('g1', { instanceId: play.playerInstanceId, state: 'started', turnRef: 't' });
  book.recordDelivery(play.clientRef, 'received', { turnRef: 't' });
  book.markGameDisconnected('g1');
  let entry = book.get('g1', 'claude-11111111');
  assert.equal(entry.workState, 'disconnected');
  assert.equal(entry.currentPlay.clientRef, play.clientRef, 'the Play is still open — not completed');
  assert.equal(entry.recentPlays.length, 0);

  book.observeRoster('g1', [{ instanceId: 'claude-11111111', playerType: 'claude', transport: 'controlled', state: 'ready' }]);
  entry = book.get('g1', 'claude-11111111');
  assert.equal(entry.workState, 'unknown', 'Coach lost sight of the Play, so its outcome is Unknown');
  assert.equal(entry.recentPlays[0].outcome, 'unknown');

  const terminal = dispatch({ playerInstanceId: 'claude-44444444', transport: 'legacy' });
  book.recordDispatch(terminal);
  book.recordDelivery(terminal.clientRef, 'received');
  assert.equal(book.get('g1', 'claude-44444444').workState, 'unknown', 'no completion signal → never claimed Working or Idle');

  const rejected = dispatch({ playerInstanceId: 'claude-55555555' });
  book.recordDispatch(rejected);
  book.recordDelivery(rejected.clientRef, 'failed', { error: 'That Player is still working.' });
  assert.equal(book.get('g1', 'claude-55555555').recentPlays[0].outcome, 'not-sent');
  assert.equal(book.get('g1', 'claude-55555555').currentPlay, undefined);

  book.observeRoster('g1', [{ instanceId: 'claude-11111111', playerType: 'claude', transport: 'controlled', state: 'ready' }]);
  assert.equal(book.get('g1', 'claude-44444444'), undefined, 'a removed instance leaves the ledger');
});

test('Q2.10C-L4. Report provenance: linked to the exact instance only when one Play was running; ambiguity stays unattributed', () => {
  const book = ledger();
  book.recordReports('g1', [{ path: 'REPORTS/Claude/old.md', mtime: clock }]);
  const play = dispatch();
  book.recordDispatch(play);
  book.recordTurn('g1', { instanceId: play.playerInstanceId, state: 'started', turnRef: 't' });
  book.recordDelivery(play.clientRef, 'received', { turnRef: 't' });
  tick(1_000);
  book.recordReports('g1', [{ path: 'REPORTS/Claude/old.md', mtime: 1 }, { path: 'REPORTS/Claude/Q2.10C.md', filename: 'Q2.10C.md', mtime: clock }]);
  const reports = book.get('g1', 'claude-11111111').reports;
  assert.equal(reports.length, 1);
  assert.deepEqual({ path: reports[0].path, attribution: reports[0].attribution, clientRef: reports[0].clientRef }, { path: 'REPORTS/Claude/Q2.10C.md', attribution: 'single-active-play', clientRef: play.clientRef });

  const other = dispatch({ playerInstanceId: 'codex-11111111', playerType: 'codex' });
  book.recordDispatch(other);
  book.recordTurn('g1', { instanceId: 'codex-11111111', state: 'started', turnRef: 'c' });
  tick(1_000);
  book.recordReports('g1', [{ path: 'REPORTS/Codex/ambiguous.md', mtime: clock }]);
  assert.equal(book.get('g1', 'codex-11111111').reports.length, 0, 'two Plays running → no guessed author');
  assert.equal(book.get('g1', 'claude-11111111').reports.length, 1);
});

// ---------------------------------------------------------------------------
// AUTO
// ---------------------------------------------------------------------------

const claudeSnapshot = {
  provider: 'claude', authenticated: false, observedAt: Date.now(), freshness: 'live', defaultModelId: 'opus',
  models: ['opus', 'sonnet', 'haiku', 'fable'].map((id) => ({ id, displayName: id[0].toUpperCase() + id.slice(1), isDefault: id === 'opus', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' }))
};
const agySnapshot = {
  provider: 'antigravity', authenticated: false, observedAt: Date.now(), freshness: 'live',
  models: [
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', isDefault: false, supportedEfforts: ['low', 'high'], defaultEffort: 'low' }
  ]
};
const codexSnapshot = { provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', models: [{ id: 'gpt-6-sol', displayName: 'GPT-6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }] };
const claudeInstance = (instanceId, fieldLabel, extra = {}) => ({ instanceId, playerType: 'claude', transport: 'controlled', transportLabel: 'Controlled', fieldLabel, state: 'ready', capability: claudeSnapshot, ...extra });

test('Q2.10C-A1. AUTO stages a REAL route for Controlled Claude: exact instance, real model and effort', () => {
  const { decision } = computeAutoRoute('g1', 'Design the architecture for the Instance Work Ledger', [claudeInstance('claude-11111111', 'Claude')], policies);
  assert.equal(decision.playerInstanceId, 'claude-11111111');
  assert.equal(decision.transport, 'controlled');
  assert.equal(decision.model, 'opus');
  assert.equal(decision.effort, 'high');
  assert.notEqual(decision.modelDisplayName, 'Provider managed', 'not merely the provider\'s own settings');
});

test('Q2.10C-A2. AUTO prefers an idle sibling over one whose work is unknown, and says so; a working sibling is never chosen', () => {
  const unknownOne = claudeInstance('claude-11111111', 'Claude 1', { work: { workState: 'unknown' } });
  const idleTwo = claudeInstance('claude-22222222', 'Claude 2', { work: { workState: 'idle' } });
  const { decision } = computeAutoRoute('g1', 'Design the architecture', [unknownOne, idleTwo], policies);
  assert.equal(decision.playerInstanceId, 'claude-22222222');
  assert.match(decision.rationale.instance, /claude-22222222 chosen: idle/);

  const working = claudeInstance('claude-11111111', 'Claude 1', { state: 'busy', work: { workState: 'working' } });
  const free = claudeInstance('claude-22222222', 'Claude 2', { work: { workState: 'completed' } });
  const second = computeAutoRoute('g1', 'Design the architecture', [working, free], policies).decision;
  assert.equal(second.playerInstanceId, 'claude-22222222');
  assert.equal(second.summary, 'Claude 2 is free and can run this Play now.');
});

test('Q2.10C-A3. With several Controlled Players ready, AUTO picks WHO for the kind of Play and records why', () => {
  const team = [
    { instanceId: 'codex-11111111', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready', capability: codexSnapshot },
    claudeInstance('claude-11111111', 'Claude'),
    { instanceId: 'antigravity-11111111', playerType: 'antigravity', transport: 'controlled', fieldLabel: 'AntiGravity', state: 'ready', capability: agySnapshot }
  ];
  const architecture = computeAutoRoute('g1', 'Design the architecture for multi-agent routing', team, policies).decision;
  assert.equal(architecture.playerInstanceId, 'claude-11111111');
  assert.equal(architecture.rationale.player, 'Claude selected as the preferred Player for an architecture Play.');
  const quick = computeAutoRoute('g1', 'Check the version string', team, policies).decision;
  assert.equal(quick.playerInstanceId, 'antigravity-11111111');
  assert.equal(quick.model, 'gemini-3.8-flash');
  assert.equal(quick.effort, 'low');
  // A preferred Player that is busy never blocks the Play: the next ready one takes it.
  const busyClaude = team.map((c) => (c.playerType === 'claude' ? { ...c, state: 'busy' } : c));
  assert.notEqual(computeAutoRoute('g1', 'Design the architecture for multi-agent routing', busyClaude, policies).decision.playerInstanceId, 'claude-11111111');
});

test('Q2.10C-A4. The router dispatches AUTO with Ledger activity and emits the Ledger record for the exact instance', async () => {
  const frames = [];
  const dispatched = [];
  const registry = new EventEmitter();
  const one = claudeInstance('claude-11111111', 'Claude 1');
  const two = claudeInstance('claude-22222222', 'Claude 2');
  const session = { instanceId: 'inst', stadiumId: 's1', rosterSynchronized: true, capabilities: [one, two], socket: { send: (raw) => frames.push(JSON.parse(raw)) } };
  registry.getSelectedGameId = () => 'g1';
  registry.getAuthoritativeSessionForGame = () => ({ status: 'connected', session });
  const router = new ControlPlaneRouter(registry);
  router.on('play-dispatched', (record) => dispatched.push(record));
  router.setCandidateEnricher((gameId, candidates) => candidates.map((c) => ({ ...c, work: { workState: c.instanceId === 'claude-22222222' ? 'idle' : 'unknown' } })));
  const pending = router.dispatch({ prompt: 'Design the architecture for reports', routingMode: 'auto', gameId: 'g1' });
  assert.equal(frames[0].params.playerInstanceId, 'claude-22222222', 'staged preference and real dispatch agree');
  assert.equal(frames[0].params.model, 'opus');
  assert.equal(dispatched[0].playerInstanceId, 'claude-22222222');
  assert.equal(dispatched[0].model, 'opus');
  assert.equal(dispatched[0].transport, 'controlled');
  assert.ok(dispatched[0].promptSummary.length <= 80);
  registry.emit('change', { type: 'session-removed', instanceId: 'inst' });
  await pending;
});

test('Q2.10C-A5. The Control Plane wires the Ledger into dispatch, turns, disconnects, reports and status', async () => {
  const daemon = await readFile(join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'utf8');
  assert.match(daemon, /on\('play-dispatched', \(record: DispatchRecord\) => this\.ledger\.recordDispatch\(record\)\)/);
  assert.match(daemon, /this\.ledger\.recordDelivery\(payload\.clientRef, payload\.state/);
  assert.match(daemon, /this\.ledger\.recordTurn\(gameId/);
  assert.match(daemon, /session-removed'\) this\.ledger\.markGameDisconnected/);
  assert.match(daemon, /this\.ledger\.recordReports\(/);
  assert.match(daemon, /workLedger,/);
  assert.match(daemon, /work = \{ workState: entry\?\.workState \?\? 'unknown'/, 'unrecorded activity is Unknown, never idle');
});

// ---------------------------------------------------------------------------
// Roster surfaces
// ---------------------------------------------------------------------------

function renderPage(status, postLog = [], confirmYes = true) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
    classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); },
    append(...kids) { this.children.push(...kids); },
    focus() {}
  });
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
  let source = null;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
    emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); }
    close() {}
  }
  const session = new Map([['sidelineCoachToken', 'test-token']]);
  const context = {
    document: { getElementById: getEl, querySelectorAll: (s) => (s === '[data-live-action]' ? [getEl('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {} },
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      if (url.startsWith('/api/status')) return { ok: true, status: 200, json: async () => status };
      if (url.startsWith('/api/reports')) return { ok: true, status: 200, json: async () => [] };
      postLog.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      return { ok: true, status: 200, json: async () => ({ success: true, message: 'ok' }) };
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };
  return {
    getEl,
    confirm: () => { for (const fn of getEl(confirmYes ? 'confirmOkBtn' : 'confirmCancelBtn').listeners.click || []) fn(); },
    start: async (code) => {
      vm.createContext(context);
      vm.runInContext(code, context);
      source.emit('hello');
      const end = Date.now() + 2000;
      while (Date.now() < end && !getEl('roster').children.length) await new Promise((r) => setTimeout(r, 5));
    }
  };
}

const pageScript = async () => (await readFile(join(repoRoot, 'src', 'public', 'index.html'), 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];

const q210cStatus = () => {
  const controlled1 = { instanceId: 'claude-11111111', playerType: 'claude', seat: 1, fieldLabel: 'Claude · Controlled', ownership: 'coach-managed', onField: true, transport: 'Controlled', controlMode: 'controlled' };
  const controlled2 = { instanceId: 'claude-22222222', playerType: 'claude', seat: 2, fieldLabel: 'Claude 2 · Controlled', ownership: 'coach-managed', onField: true, transport: 'Controlled', controlMode: 'controlled' };
  const oldTerminal = { instanceId: 'antigravity-e360619b', playerType: 'antigravity', seat: 1, fieldLabel: 'AntiGravity', ownership: 'coach-managed', onField: true, transport: 'Terminal' };
  const adopted = { instanceId: 'codex-33333333', playerType: 'codex', seat: 1, fieldLabel: 'Codex', ownership: 'adopted', onField: true, transport: 'Adopted' };
  const caps = [
    { ...claudeInstance('claude-11111111', 'Claude · Controlled'), state: 'busy', work: { workState: 'working' } },
    { ...claudeInstance('claude-22222222', 'Claude 2 · Controlled'), work: { workState: 'idle' } },
    { instanceId: 'antigravity-e360619b', playerType: 'antigravity', transport: 'legacy', transportLabel: 'Terminal', fieldLabel: 'AntiGravity', state: 'ready', capability: { provider: 'antigravity', freshness: 'unavailable', models: [] }, work: { workState: 'unknown' } }
  ];
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: 'g1',
    game: { gameId: 'g1', displayName: 'GameTest', fingerprintSource: 'git-remote' },
    games: [{ gameId: 'g1', displayName: 'GameTest', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [
      { id: 'codex', name: 'Codex', availability: 'available', fieldState: 'on-field', instances: [adopted] },
      { id: 'claude', name: 'Claude', availability: 'available', fieldState: 'on-field', instances: [controlled1, controlled2] },
      { id: 'antigravity', name: 'AntiGravity', availability: 'available', fieldState: 'on-field', instances: [oldTerminal] }
    ],
    capabilities: caps,
    routing: { mode: 'manual', capabilities: caps },
    playerDiscovery: { catalog: [
      { playerType: 'claude', displayName: 'Claude', state: 'ready', controlled: true },
      { playerType: 'antigravity', displayName: 'AntiGravity', state: 'ready', controlled: true },
      { playerType: 'codex', displayName: 'Codex', state: 'ready', controlled: true }
    ], externalCandidates: [], runningElsewhere: [] },
    preferences: { runningPlayers: 'ask' },
    reports: []
  };
};

const cardsOf = (page) => page.getEl('roster').children.filter((r) => r.className === 'player');
const stateText = (card) => card.children[1].children[1].children.map((c) => c.textContent).join('');
const buttonsOf = (card) => card.children.find((c) => c.className === 'player-actions').children;

test('Q2.10C-U1. Roster shows Controlled Claude copies with what each is doing — On Field + Working is valid', async () => {
  const page = renderPage(q210cStatus());
  await page.start(await pageScript());
  const cards = cardsOf(page);
  const byId = Object.fromEntries(cards.map((card) => [card.dataset.instanceId, card]));
  assert.equal(stateText(byId['claude-11111111']), 'On Field · Controlled · Working');
  assert.equal(stateText(byId['claude-22222222']), 'On Field · Controlled · Idle');
  assert.equal(stateText(byId['antigravity-e360619b']), 'On Field · Terminal', 'Unknown activity is left unsaid, never guessed');
});

test('Q2.10C-U2. "+ Add another" launches a Controlled copy whenever Coach can control that Player — the human never picks a transport', async () => {
  const posts = [];
  const page = renderPage(q210cStatus(), posts);
  await page.start(await pageScript());
  const addRows = page.getEl('roster').children.filter((r) => r.className === 'player-add-another');
  const addAgy = addRows.find((row) => row.children[0].textContent === '+ Add another AntiGravity').children[0];
  for (const fn of addAgy.listeners.click || []) fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(posts.find((p) => p.url === '/api/players/add').body, { playerType: 'antigravity', controlled: true, allowDuplicate: true }, 'even beside an old Terminal copy, a new copy is Controlled');
});

test('Q2.10C-U3. An old Coach-started terminal Player can be restarted with Coach controls — only after confirming; adopted Players are never offered it', async () => {
  const posts = [];
  const page = renderPage(q210cStatus(), posts);
  await page.start(await pageScript());
  const cards = cardsOf(page);
  const byId = Object.fromEntries(cards.map((card) => [card.dataset.instanceId, card]));
  const labels = (id) => buttonsOf(byId[id]).map((b) => b.textContent);
  assert.ok(labels('antigravity-e360619b').includes('Restart with Coach controls'));
  assert.ok(!labels('codex-33333333').includes('Restart with Coach controls'), 'adopted human processes stay human-owned');
  assert.ok(!labels('claude-11111111').includes('Restart with Coach controls'), 'already Controlled');

  const upgrade = buttonsOf(byId['antigravity-e360619b']).find((b) => b.textContent === 'Restart with Coach controls');
  const clicked = Promise.all((upgrade.listeners.click || []).map((fn) => fn()));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(posts.length, 0, 'nothing happens before the human confirms');
  assert.match(page.getEl('confirmBody').textContent, /the new Player starts fresh/);
  page.confirm();
  await clicked;
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(posts.map((p) => p.url), ['/api/players/add', '/api/players/instance/antigravity-e360619b/remove'], 'Controlled Player starts first; the old terminal leaves only after');
  assert.deepEqual(posts[0].body, { playerType: 'antigravity', controlled: true, allowDuplicate: true });
});
