/**
 * Q2.10A — Claude terminal control + smart routing foundation.
 *
 *   Player ≠ Transport ≠ Provider controls ≠ Routing eligibility
 *
 * Evidence-driven: Claude Code 2.1.270 reports its model and effort through
 * LOCAL commands (`claude -p '/model'`, `claude -p '/effort'`), and selecting a
 * model inside a live session can persist to the human's user settings. So Coach
 * reads Claude's controls truthfully and does not operate them yet.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLAUDE_LIVE_CONTROL_NOTE,
  claudeControlProfile,
  effortLabel,
  parseClaudeEffortLevels,
  parseClaudeModelStatus
} from '../out/provider-control.js';
import { analyzePlay, DEFAULT_CLAUDE_PREFERENCE, recommendProviderSettings } from '../out/play-analyzer.js';
import { computeAutoRoute, CodexRoutingPolicy, classifyTask } from '../out/routing-policy.js';
import { findExternalCandidates, findRunningElsewhere, PlayerDiscoveryService } from '../out/player-discovery.js';
import { loadPreferences, projectDiscovery, savePreferences, isRunningPlayersPreference } from '../out/running-players.js';
import { PlayerInstanceBook } from '../out/player-instances.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Verbatim output captured from the installed Claude Code 2.1.270 during Q2.10A.
const REAL_MODEL_OUTPUT = 'Current model: `Opus 5` (effort: high)\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.\n';
const REAL_EFFORT_OUTPUT = 'Usage: /effort <low|medium|high|xhigh|max|auto>\n';

// ---------------------------------------------------------------------------
// Provider control capability layer
// ---------------------------------------------------------------------------

test('Q2.10A-1. Claude CLI model answer parses into current model, effort and aliases', () => {
  const parsed = parseClaudeModelStatus(REAL_MODEL_OUTPUT);
  assert.equal(parsed.currentModelLabel, 'Opus 5');
  assert.equal(parsed.currentEffort, 'high');
  for (const alias of ['sonnet', 'opus', 'haiku', 'fable', 'default']) assert.ok(parsed.aliases.includes(alias), alias);
});

test('Q2.10A-2. Claude CLI effort answer parses into supported levels, with Extra High wording', () => {
  assert.deepEqual(parseClaudeEffortLevels(REAL_EFFORT_OUTPUT), ['low', 'medium', 'high', 'xhigh', 'max', 'auto']);
  assert.equal(effortLabel('xhigh'), 'Extra High');
});

test('Q2.10A-3. Unrecognised CLI output never becomes a guessed control list', () => {
  const chatty = 'It looks like you meant to type /model, but Git Bash turned it into a Windows path.';
  assert.equal(parseClaudeModelStatus(chatty), undefined);
  assert.equal(parseClaudeEffortLevels(chatty), undefined);
  const profile = claudeControlProfile(undefined, undefined, 'claude-cli test');
  assert.equal(profile.model.state, 'unknown');
  assert.equal(profile.effort.state, 'unknown');
  assert.equal(profile.model.options.length, 0);
});

test('Q2.10A-4. Terminal transport can still expose provider controls — transport and control are separate dimensions', () => {
  const profile = claudeControlProfile(parseClaudeModelStatus(REAL_MODEL_OUTPUT), parseClaudeEffortLevels(REAL_EFFORT_OUTPUT), 'claude-cli 2.1.270');
  assert.equal(profile.promptDelivery, 'terminal-text', 'reached through its terminal');
  assert.equal(profile.semanticTurns, false);
  assert.notEqual(profile.model.state, 'unavailable', 'a terminal Player is not an uncontrollable Player');
  assert.deepEqual(profile.model.options.map((o) => o.id), ['opus', 'sonnet', 'haiku', 'fable', 'default']);
  assert.deepEqual(profile.effort.options.map((o) => o.label), ['Low', 'Medium', 'High', 'Extra High', 'Max']);
  assert.ok(!profile.effort.options.some((o) => o.id === 'auto'), 'provider "auto" is not Coach Auto');
  assert.equal(profile.model.currentLabel, 'Opus 5');
  assert.equal(profile.effort.currentLabel, 'High');
});

test('Q2.10A-5. Live Claude controls are shown but NOT operated: requires-proof with a plain reason, availability honest', () => {
  const profile = claudeControlProfile(parseClaudeModelStatus(REAL_MODEL_OUTPUT), parseClaudeEffortLevels(REAL_EFFORT_OUTPUT), 'claude-cli 2.1.270');
  assert.equal(profile.model.state, 'requires-proof');
  assert.equal(profile.effort.state, 'requires-proof');
  assert.equal(profile.model.note, CLAUDE_LIVE_CONTROL_NOTE);
  assert.match(CLAUDE_LIVE_CONTROL_NOTE, /change your Claude default/);
  assert.ok(profile.model.options.every((o) => o.availability === 'unknown'), 'plan entitlement is not discoverable, so never claimed');
});

// ---------------------------------------------------------------------------
// Play Analyzer + routing foundation
// ---------------------------------------------------------------------------

test('Q2.10A-6. Play Analyzer produces a Dadified difficulty label from a richer classification', () => {
  const hard = analyzePlay('Architect the resource routing layer and plan the migration strategy');
  assert.equal(hard.taskType, 'architecture');
  assert.equal(hard.difficulty, 'hard');
  assert.equal(hard.label, 'Hard architecture Play');

  const medium = analyzePlay('Implement the preferences endpoint and add tests');
  assert.equal(medium.difficulty, 'medium');

  const easy = analyzePlay('Check git status');
  assert.equal(easy.difficulty, 'easy');

  assert.equal(analyzePlay('').label, 'Waiting for a Play');
  assert.equal(analyzePlay('Delete the production database credentials table').risk, 'high');
});

test('Q2.10A-7. The classifier moved into the Analyzer without changing its answers', () => {
  assert.equal(classifyTask('Architect a distributed control plane'), 'architecture');
  assert.equal(classifyTask('Implement the router dispatch function'), 'implementation');
  assert.equal(classifyTask('check status'), 'quick');
  assert.equal(classifyTask(''), 'default');
});

test('Q2.10A-8. Recommendations come from preference data and never invent a model the provider did not offer', () => {
  const offered = { models: ['opus', 'sonnet', 'haiku'], efforts: ['low', 'medium', 'high'] };
  const hard = recommendProviderSettings(analyzePlay('Design the architecture for quota routing'), offered, DEFAULT_CLAUDE_PREFERENCE);
  assert.deepEqual(hard, { model: 'opus', effort: 'high' });
  const none = recommendProviderSettings(analyzePlay('Design the architecture'), { models: ['sonnet'], efforts: [] }, DEFAULT_CLAUDE_PREFERENCE);
  assert.equal(none.model, undefined);
  assert.equal(none.effort, undefined);
});

test('Q2.10A-9. AUTO single-Claude carries the Play label and still emits no fake model or effort', () => {
  const claude = { instanceId: 'claude-1', playerType: 'claude', transport: 'legacy', fieldLabel: 'Claude', state: 'ready', capability: { provider: 'claude', freshness: 'unavailable', models: [] } };
  const { decision } = computeAutoRoute('g1', 'Architect the Q2.10 routing layer', [claude], new Map([['codex', new CodexRoutingPolicy()]]));
  assert.equal(decision.playerInstanceId, 'claude-1');
  assert.equal(decision.playLabel, 'Hard architecture Play');
  assert.equal(decision.model, undefined);
  assert.equal(decision.effort, undefined);
});

// ---------------------------------------------------------------------------
// Running Players: detection, duplicate prevention, adoption preference
// ---------------------------------------------------------------------------

const processes = [
  { pid: 100, parentPid: 1, name: 'Code.exe' },
  { pid: 200, parentPid: 100, name: 'powershell.exe' },          // GS3 terminal "Claude Code"
  { pid: 201, parentPid: 200, name: 'claude.exe' },
  { pid: 300, parentPid: 1, name: 'Code.exe' },                 // another VS Code window
  { pid: 310, parentPid: 300, name: 'powershell.exe' },
  { pid: 311, parentPid: 310, name: 'claude.exe' },
  { pid: 312, parentPid: 311, name: 'claude.exe' },              // nested helper of the same agent
  { pid: 400, parentPid: 100, name: 'node.exe' },                // this extension host
  { pid: 401, parentPid: 400, name: 'codex.exe', commandLine: 'codex app-server' }
];
const gs3Shells = [{ terminalName: 'Claude Code', shellPid: 200 }];

test('Q2.10A-10. A Claude running in this Game is detected as running and offered for adoption', () => {
  const candidates = findExternalCandidates(gs3Shells, processes);
  assert.deepEqual(candidates.map((c) => [c.playerType, c.shellPid, c.terminalName]), [['claude', 200, 'Claude Code']]);
});

test('Q2.10A-11. A Claude in another window is reported once as elsewhere, never offered, and Coach\'s own controlled Player is excluded', () => {
  const elsewhere = findRunningElsewhere(gs3Shells, processes, [400]);
  assert.deepEqual(elsewhere, [{ playerType: 'claude', displayName: 'Claude', count: 1 }]);
  assert.ok(!elsewhere.some((entry) => entry.playerType === 'codex'), 'Coach-owned controlled Codex is not "elsewhere"');
});

test('Q2.10A-12. A fresh scan finds a Player started after the last Check Players', async () => {
  let live = processes.filter((p) => p.pid !== 201);
  const service = new PlayerDiscoveryService({ commandAvailable: async () => true, listProcesses: async () => live });
  const before = await service.scanRunning({ shells: gs3Shells, excludeRootPids: [400] });
  assert.equal(before.externalCandidates.length, 0);
  live = processes; // the human starts Claude in GS3
  const after = await service.scanRunning({ shells: gs3Shells, excludeRootPids: [400] });
  assert.equal(after.externalCandidates[0].shellPid, 200, 'Add scans afresh, so this is caught before a duplicate starts');
});

test('Q2.10A-13. The Stadium refuses an accidental duplicate Add and lets an explicit choice through', async () => {
  const roster = await readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8');
  for (const method of ['async addInstance(', 'async addControlledInstance(']) {
    const body = roster.slice(roster.indexOf(method), roster.indexOf('\n  }\n', roster.indexOf(method)));
    assert.match(body, /guardAgainstDuplicate\(player, options\)/, `${method} must guard before launching`);
    assert.ok(body.indexOf('guardAgainstDuplicate') < Math.max(body.indexOf('createTerminal'), body.indexOf('controlHost.open')), 'guard runs before any launch');
  }
  const guard = roster.slice(roster.indexOf('private async guardAgainstDuplicate'), roster.indexOf('async addInstance('));
  assert.match(guard, /options\?\.allowDuplicate/);
  assert.match(guard, /code: 'running-in-game'/);
  assert.match(guard, /code: 'running-elsewhere'/);
  assert.match(guard, /if \(!scan\.supported\) return undefined;/, 'unknown is never treated as a duplicate');
});

test('Q2.10A-14. Running Players preference: safe default, strict validation, atomic persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coach-prefs-'));
  const file = join(dir, 'preferences.json');
  assert.deepEqual(loadPreferences(file), { runningPlayers: 'ask' }, 'missing file → Ask me');
  writeFileSync(file, '{not json');
  assert.deepEqual(loadPreferences(file), { runningPlayers: 'ask' }, 'malformed file → Ask me');
  savePreferences(file, { runningPlayers: 'auto-add' });
  assert.deepEqual(loadPreferences(file), { runningPlayers: 'auto-add' });
  assert.ok(!existsSync(`${file}.${process.pid}.tmp`), 'no temp file left behind');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).runningPlayers, 'auto-add');
  assert.equal(isRunningPlayersPreference('seize'), false);
});

test('Q2.10A-15. "Ignore running Players" hides them from the view without losing the cached truth', () => {
  const discovery = { catalog: [], externalCandidates: [{ shellPid: 200 }], runningElsewhere: [{ playerType: 'claude', count: 1 }] };
  assert.deepEqual(projectDiscovery(discovery, 'ignore').externalCandidates, []);
  assert.deepEqual(projectDiscovery(discovery, 'ignore').runningElsewhere, []);
  assert.equal(discovery.externalCandidates.length, 1, 'cache untouched');
  assert.equal(projectDiscovery(discovery, 'ask'), discovery);
  assert.equal(projectDiscovery(undefined, 'ask'), null, 'not checked stays null');
});

test('Q2.10A-16. Automatic adoption uses the existing adopt path, so ownership stays adopted and nothing is launched', async () => {
  const daemon = await readFile(resolve(repoRoot, 'src/control-plane/daemon.ts'), 'utf8');
  const autoAdds = daemon.match(/runningPlayers === 'auto-add'[\s\S]{0,700}?'player\.adopt'/g) ?? [];
  assert.equal(autoAdds.length, 2, 'both Check Players and Add adopt through player.adopt');
  assert.doesNotMatch(daemon, /auto-add'[\s\S]{0,400}?player\.action/, 'auto-add never starts a new process');

  const book = new PlayerInstanceBook();
  const adopted = book.allocate('claude', 'adopted');
  assert.equal(adopted.ownership, 'adopted', 'adopted ownership means removal detaches and never closes the terminal');
});

// ---------------------------------------------------------------------------
// Browser projection
// ---------------------------------------------------------------------------

function renderPage(status, postLog = []) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
    classList: {
      classes: new Set(),
      add(...t) { for (const x of t) this.classes.add(x); },
      remove(...t) { for (const x of t) this.classes.delete(x); },
      toggle(c, force) { const on = force === undefined ? !this.classes.has(c) : force; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); },
    append(...kids) { this.children.push(...kids); }
  });
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  };
  let source = null;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data = {}) { for (const fn of this.listeners[event] || []) fn({ data: JSON.stringify(data) }); }
    close() {}
  }
  const session = new Map([['sidelineCoachToken', 'test-token']]);
  const context = {
    document: {
      getElementById: getEl,
      querySelectorAll: (selector) => (selector === '[data-live-action]' ? [getEl('dispatchBtn')] : []),
      createElement: () => makeNode('')
    },
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
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };
  return {
    getEl,
    start: async (scriptCode) => {
      vm.createContext(context);
      vm.runInContext(scriptCode, context);
      source.emit('hello');
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && !getEl('autoRoutePlayer').textContent) await new Promise((r) => setTimeout(r, 5));
    }
  };
}

const claudeControls = claudeControlProfile(parseClaudeModelStatus(REAL_MODEL_OUTPUT), parseClaudeEffortLevels(REAL_EFFORT_OUTPUT), 'claude-cli 2.1.270');

const statusWithClaude = (overrides = {}) => {
  const candidate = { instanceId: 'claude-57355709', playerType: 'claude', transport: 'legacy', fieldLabel: 'Claude', state: 'ready', capability: { provider: 'claude', freshness: 'unavailable', models: [] } };
  const decision = computeAutoRoute('game_gs3', 'Architect the Q2.10 routing layer', [candidate], new Map()).decision;
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: 'game_gs3',
    game: { gameId: 'game_gs3', displayName: 'GS3', fingerprintSource: 'git-remote' },
    games: [{ gameId: 'game_gs3', displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{ id: 'claude', name: 'Claude', availability: 'available', fieldState: 'on-field',
      instances: [{ instanceId: 'claude-57355709', playerType: 'claude', seat: 1, fieldLabel: 'Claude', ownership: 'adopted', onField: true, transport: 'Adopted' }] }],
    capabilities: [candidate],
    routing: { mode: 'auto', activeDecision: decision, capabilities: [candidate] },
    playerDiscovery: {
      stadiumId: 's1', gameId: 'game_gs3', at: Date.now(), externalScanSupported: true, externalCandidates: [], runningElsewhere: [],
      catalog: [
        { playerType: 'claude', displayName: 'Claude', state: 'ready', summary: 'Ready', canAddNow: true, controlled: false, controls: claudeControls },
        { playerType: 'codex', displayName: 'Codex', state: 'ready', summary: 'Ready', canAddNow: true, controlled: true }
      ]
    },
    preferences: { runningPlayers: 'ask' },
    reports: [],
    ...overrides
  };
};

const script = async () => (await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];

test('Q2.10A-17. AUTO shows the analysed Play and Claude\'s real current settings, labelled as Claude\'s own', async () => {
  const page = renderPage(statusWithClaude());
  await page.start(await script());
  assert.equal(page.getEl('autoRoutePlayer').textContent, 'Claude');
  assert.equal(page.getEl('autoRouteModel').textContent, 'Opus 5');
  assert.equal(page.getEl('autoRouteEffort').textContent, 'High');
  assert.match(page.getEl('autoRouteReason').textContent, /^Hard architecture Play · AUTO selected the only Player on field\. Uses Claude's own settings\.$/);
  assert.equal(page.getEl('autoRouteDecisionChip').title, CLAUDE_LIVE_CONTROL_NOTE);
});

test('Q2.10A-18. MANUAL Claude shows its own defaults truthfully and does not offer controls Coach cannot safely operate', async () => {
  const status = statusWithClaude();
  status.routing.mode = 'manual';
  const page = renderPage(status);
  await page.start(await script());
  const select = page.getEl('terminalSelect');
  select.value = 'claude-57355709';
  for (const fn of select.listeners.change || []) fn({ target: select });
  // The fake DOM's innerHTML = '' does not clear children, so compare distinct option text.
  const text = (el) => [...new Set(el.children.map((o) => o.textContent))].join(' | ');
  assert.equal(text(page.getEl('modelSelect')), 'Claude default · Opus 5');
  assert.equal(text(page.getEl('effortSelect')), 'Claude default · High');
  assert.equal(page.getEl('modelSelect').disabled, true);
  assert.match(page.getEl('legacyNotice').textContent, /change your Claude default/);
});

test('Q2.10A-19. Recruit tells the truth about a Claude running in another window, and Add sends the duplicate-guarded request', async () => {
  const status = statusWithClaude({ players: [], capabilities: [], routing: { mode: 'auto', capabilities: [] } });
  status.playerDiscovery.runningElsewhere = [{ playerType: 'claude', displayName: 'Claude', count: 1 }];
  const posts = [];
  const page = renderPage(status, posts);
  await page.start(await script());
  const card = page.getEl('playerCatalog').children.find((row) => row.dataset?.playerType === 'claude');
  const texts = JSON.stringify(card.children.map((c) => (c.children || []).map((n) => n.textContent)));
  assert.match(texts, /Also running outside this Game/);
  const actions = card.children.find((c) => c.className === 'player-actions');
  const add = actions.children.find((b) => b.textContent === 'Add');
  for (const fn of add.listeners.click || []) fn();
  await new Promise((r) => setTimeout(r, 20));
  const request = posts.find((p) => p.url === '/api/players/add');
  assert.deepEqual(request.body, { playerType: 'claude', controlled: false, allowDuplicate: false }, 'first Add never forces a duplicate');
});

test('Q2.10A-20. Settings offers the Running Players choice with a safe default', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  assert.match(html, /Running Players/);
  assert.match(html, /Ask me before adding/);
  assert.match(html, /Automatically add to my Roster/);
  assert.match(html, /Ignore running Players/);
  assert.match(html, /Coach never closes a Player it did not start\./);
  const page = renderPage(statusWithClaude());
  await page.start(await script());
  assert.equal(page.getEl('runningPrefAsk').checked, true);
  assert.equal(page.getEl('runningPrefAutoAdd').checked, false);
});
