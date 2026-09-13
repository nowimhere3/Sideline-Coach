/**
 * Q2.9C — AUTO single-Player routing contract.
 *
 *   AUTO chooses WHO.  Transport decides HOW.
 *
 * With exactly one dispatchable Player on field there is no routing choice to
 * make, so AUTO selects that Player whether it is Controlled or reached through
 * its terminal. A terminal Player's model and reasoning stay provider-managed:
 * Coach never fabricates a capability it does not have, and never labels a
 * working provider capability "Off".
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAutoRoute, CodexRoutingPolicy } from '../out/routing-policy.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { PlayerInstanceBook } from '../out/player-instances.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policies = new Map([['codex', new CodexRoutingPolicy()]]);

const unavailableSnapshot = (provider) => ({ provider, freshness: 'unavailable', models: [] });

const claude = {
  instanceId: 'claude-57355709',
  playerType: 'claude',
  transport: 'legacy',
  transportLabel: 'Adopted',
  fieldLabel: 'Claude',
  state: 'ready',
  capability: unavailableSnapshot('claude')
};

const antigravity = {
  instanceId: 'antigravity-1a2b3c4d',
  playerType: 'antigravity',
  transport: 'legacy',
  transportLabel: 'Terminal',
  fieldLabel: 'AntiGravity',
  state: 'ready',
  capability: unavailableSnapshot('antigravity')
};

const codex = {
  instanceId: 'codex-0a6eab81',
  playerType: 'codex',
  transport: 'controlled',
  transportLabel: 'Controlled',
  fieldLabel: 'Codex',
  state: 'ready',
  capability: {
    provider: 'codex',
    freshness: 'live',
    models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
  }
};

// ---------------------------------------------------------------------------
// Pure routing contract
// ---------------------------------------------------------------------------

test('Q2.9C-1. Zero Players on field: no route, plain-language guidance', () => {
  const result = computeAutoRoute('g1', 'Review git status', [], policies);
  assert.equal(result.decision, undefined);
  assert.equal(result.error, 'No Player is on field. Add a Player or put one on field to continue.');
});

test('Q2.9C-2. Only Claude on field through its terminal: AUTO selects Claude', () => {
  const result = computeAutoRoute('g1', 'Review git status and reply with a one-sentence summary.', [claude], policies);
  assert.equal(result.error, undefined, 'one Player on field is the choice — no warning');
  assert.equal(result.decision.mode, 'auto');
  assert.equal(result.decision.playerInstanceId, 'claude-57355709');
  assert.equal(result.decision.playerLabel, 'Claude');
  assert.equal(result.decision.transport, 'legacy', 'transport decides HOW');
  assert.equal(result.decision.model, undefined, 'Coach never fabricates a model for a terminal Player');
  assert.equal(result.decision.effort, undefined, 'Coach never fabricates an effort for a terminal Player');
  assert.equal(result.decision.modelDisplayName, 'Provider managed');
  assert.equal(result.decision.reason, 'AUTO selected the only Player on field.');
});

test('Q2.9C-3. Only AntiGravity on field through its terminal: AUTO selects AntiGravity', () => {
  const result = computeAutoRoute('g1', 'Implement the fix', [antigravity], policies);
  assert.equal(result.decision.playerInstanceId, 'antigravity-1a2b3c4d');
  assert.equal(result.decision.transport, 'legacy');
});

test('Q2.9C-4. Only Codex on field Controlled: AUTO selects Codex with capability-backed routing', () => {
  const result = computeAutoRoute('g1', 'Implement the database layer', [codex], policies);
  assert.equal(result.decision.playerInstanceId, 'codex-0a6eab81');
  assert.equal(result.decision.transport, 'controlled');
  assert.equal(result.decision.model, 'gpt-5.6-sol');
});

test('Q2.9C-5. The superseded Controlled-only warning can never return', () => {
  for (const candidates of [[claude], [antigravity], [codex], [claude, antigravity], []]) {
    const text = JSON.stringify(computeAutoRoute('g1', 'Help', candidates, policies));
    assert.doesNotMatch(text, /No controlled Player on field/);
    assert.doesNotMatch(text, /only available with Codex/);
    assert.doesNotMatch(text, /add Codex for AUTO/i);
  }
});

test('Q2.9C-6. Several terminal Players: AUTO names them and never guesses (Q2.10 Play Analyzer boundary)', () => {
  const result = computeAutoRoute('g1', 'Help', [claude, antigravity], policies);
  assert.equal(result.decision, undefined);
  assert.equal(result.error, 'Claude and AntiGravity are on field. Choose who gets this Play in Manual — AUTO will pick between several Players in a later update.');
});

test('Q2.9C-7. The Control Plane router delivers an AUTO Play to the only terminal Player with no model or effort', () => {
  const frames = [];
  const registry = new EventEmitter();
  const session = {
    instanceId: 'inst_gs3',
    stadiumId: 'stadium_win32_test',
    rosterSynchronized: true,
    capabilities: [claude],
    socket: { send: (raw) => frames.push(JSON.parse(raw)) }
  };
  registry.getSelectedGameId = () => 'game_git_042782b8';
  registry.getAuthoritativeSessionForGame = () => ({ status: 'connected', session });

  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ prompt: 'Review git status and reply with a one-sentence summary. Do not modify anything.', routingMode: 'auto', gameId: 'game_git_042782b8' });

  assert.equal(frames.length, 1, 'AUTO produced a real dispatch.request instead of a warning');
  assert.equal(frames[0].method, 'dispatch.request');
  assert.equal(frames[0].params.playerInstanceId, 'claude-57355709');
  assert.equal(frames[0].params.routingMode, 'auto');
  assert.equal(frames[0].params.model, undefined);
  assert.equal(frames[0].params.effort, undefined);

  // Release the in-flight dispatch without waiting for its ingress timeout.
  registry.emit('change', { type: 'session-removed', instanceId: 'inst_gs3' });
  return pending;
});

// ---------------------------------------------------------------------------
// Browser projection
// ---------------------------------------------------------------------------

function renderPage(status) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '',
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
    fetch: async (url) => {
      if (url.startsWith('/api/status')) return { ok: true, status: 200, json: async () => status };
      if (url.startsWith('/api/reports')) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };
  return { getEl, context, start: async (scriptCode) => {
    vm.createContext(context);
    vm.runInContext(scriptCode, context);
    source.emit('hello');
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !getEl('autoRoutePlayer').textContent) await new Promise((r) => setTimeout(r, 5));
  } };
}

const claudeOnlyStatus = () => {
  const decision = computeAutoRoute('game_git_042782b8', '', [claude], policies).decision;
  return {
    success: true,
    connected: true,
    connectionStatus: 'connected',
    selectedGameId: 'game_git_042782b8',
    game: { gameId: 'game_git_042782b8', displayName: 'GS3', fingerprintSource: 'git-remote' },
    games: [{ gameId: 'game_git_042782b8', displayName: 'GS3', connectionStatus: 'connected' }],
    stadium: { stadiumId: 'stadium_win32_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{
      id: 'claude', name: 'Claude', availability: 'available', fieldState: 'on-field',
      instances: [{ instanceId: 'claude-57355709', playerType: 'claude', seat: 1, fieldLabel: 'Claude', ownership: 'adopted', onField: true, transport: 'Adopted' }]
    }],
    capabilities: [claude],
    routing: { mode: 'auto', activeDecision: decision, autoError: undefined, capabilities: [claude] },
    playerDiscovery: null,
    reports: []
  };
};

test('Q2.9C-8. AUTO staged route reads "Claude · Provider managed" with no warning and no fake effort', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  const page = renderPage(claudeOnlyStatus());
  await page.start(html.match(/<script>([\s\S]*?)<\/script>/)[1]);

  assert.equal(page.getEl('autoRoutePlayer').textContent, 'Claude');
  assert.equal(page.getEl('autoRouteModel').textContent, 'Provider managed');
  assert.equal(page.getEl('autoRouteEffortPart').hidden, true, 'effort is not shown as a separate fake setting');
  assert.equal(page.getEl('autoRouteReason').textContent, 'AUTO selected the only Player on field.');
  assert.notEqual(page.getEl('autoRouteWarning').hidden, false, 'no warning is shown');
});

test('Q2.9C-9. MANUAL Claude shows Model and Reasoning as Provider managed — never "Off" — and stays dispatchable', async () => {
  const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
  assert.doesNotMatch(html, />Off</, 'no control labels a working provider capability as Off');

  const status = claudeOnlyStatus();
  status.routing.mode = 'manual';
  const page = renderPage(status);
  await page.start(html.match(/<script>([\s\S]*?)<\/script>/)[1]);

  const select = page.getEl('terminalSelect');
  select.value = 'claude-57355709';
  for (const fn of select.listeners.change || []) fn({ target: select });

  // Options are built with textContent (provider CLI text is never injected as HTML).
  const optionText = (select) => select.children.map((option) => option.textContent).join(' | ');
  assert.match(optionText(page.getEl('modelSelect')), /Provider managed/);
  assert.match(optionText(page.getEl('effortSelect')), /Provider managed/);
  assert.equal(page.getEl('modelSelect').title, 'This Player manages its own model and reasoning settings.');
  assert.equal(page.getEl('modelSelect').disabled, true, 'Coach does not pretend it can set a terminal Player model');
});

// ---------------------------------------------------------------------------
// Bench lifecycle identity
// ---------------------------------------------------------------------------

test('Q2.9C-10. Bench and return keep the exact instance, seat, transport-relevant ownership, and no replacement', () => {
  const book = new PlayerInstanceBook();
  const record = book.allocate('antigravity', 'adopted');
  const before = book.project(record);

  book.setOnField(record.instanceId, false);
  book.setOnField(record.instanceId, true);
  const after = book.project(book.get(record.instanceId));

  assert.equal(after.instanceId, before.instanceId);
  assert.equal(after.seat, before.seat);
  assert.equal(after.ownership, before.ownership);
  assert.equal(after.onField, true);
  assert.equal(book.byType('antigravity').length, 1, 'no replacement instance');
});

test('Q2.9C-11. Bench and return never retire or dispose — the Control Plane routes the exact instance', async () => {
  const roster = await readFile(resolve(repoRoot, 'src/player-roster.ts'), 'utf8');
  const benchBody = roster.slice(roster.indexOf('async takeOffField('), roster.indexOf('async removePlayer('));
  const fieldBody = roster.slice(roster.indexOf('async putInstanceOnField('), roster.indexOf('async putOnField('));
  for (const body of [benchBody, fieldBody]) {
    assert.ok(body.length > 0);
    assert.doesNotMatch(body, /\.retire\(|\.dispose\(\)|removeProvenance/, 'bench is an availability decision, not a destruction decision');
  }
  const daemon = await readFile(resolve(repoRoot, 'src/control-plane/daemon.ts'), 'utf8');
  assert.match(daemon, /verb === 'field'\) \{\s*await this\.forwardPlayerLifecycle\(res, 'player\.putOnField', \{ playerInstanceId: instanceId \}\)/);
  assert.match(daemon, /verb === 'bench'\) \{\s*await this\.forwardPlayerLifecycle\(res, 'player\.takeOffField', \{ playerInstanceId: instanceId \}\)/);
});
