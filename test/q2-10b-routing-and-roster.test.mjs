/**
 * Q2.10B — unified provider control, instance-aware routing, multi-instance Roster.
 *
 *   Recruit once. Multiply instances.   Player Type ≠ Player Instance.
 *   AUTO chooses WHO, WHICH INSTANCE, WHAT MODEL and HOW HARD TO THINK.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  antigravityControlProfile,
  claudeControlProfile,
  parseAntiGravityModels,
  parseClaudeEffortLevels,
  parseClaudeModelStatus,
  projectInstanceControls
} from '../out/provider-control.js';
import { computeAutoRoute, resolveCoachAuto, CodexRoutingPolicy } from '../out/routing-policy.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { PlayerInstanceBook } from '../out/player-instances.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Verbatim `agy models` rows from AntiGravity 1.2.2 during Q2.10B.
const AGY_MODELS = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\ngemini-3.7-flash-high\tGemini 3.7 Flash (High)\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\ngemini-3.1-pro-low\tGemini 3.1 Pro (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n';

const codexSnapshot = {
  provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live',
  models: [
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    { id: 'gpt-6-astra', displayName: 'GPT-6-Astra', isDefault: false, supportedEfforts: ['medium', 'high', 'ultra'], defaultEffort: 'high' }
  ]
};
const codex1 = { instanceId: 'codex-0a6eab81', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready', capability: codexSnapshot, activeModel: 'gpt-5.6-sol', activeEffort: 'medium' };
const policies = new Map([['codex', new CodexRoutingPolicy()]]);

// ---------------------------------------------------------------------------
// Unified provider control
// ---------------------------------------------------------------------------

test('Q2.10B-5. AntiGravity model discovery parses real `agy models` rows into families and efforts', () => {
  const models = parseAntiGravityModels(AGY_MODELS);
  assert.equal(models.length, 7);
  assert.deepEqual(models[0], { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', family: 'gemini-3.8-flash', familyLabel: 'Gemini 3.8 Flash', effort: 'high' });
  const profile = antigravityControlProfile(models, 'agy models');
  assert.deepEqual(profile.model.options.map((o) => o.label), ['Gemini 3.8 Flash', 'Gemini 3.7 Flash', 'Gemini 3.1 Pro', 'Claude Sonnet 4.6 (Thinking)']);
  assert.deepEqual(profile.effort.options.map((o) => o.label), ['Low', 'Medium', 'High']);
  assert.equal(profile.promptDelivery, 'terminal-text', 'terminal transport');
  assert.equal(profile.model.state, 'requires-proof', 'a live terminal session is never silently reconfigured');
  assert.equal(profile.sessionScopedControl.proven, true, 'a Controlled AntiGravity CAN switch per Play — proven by settings hash');
  assert.equal(parseAntiGravityModels('Fetching available models...\n'), undefined, 'no rows → Unknown');
  assert.equal(antigravityControlProfile(undefined, 'x').model.state, 'unknown');
});

test('Q2.10B-6. Claude records the proven session-scoped mechanism while its terminal session stays unoperated', () => {
  const profile = claudeControlProfile(
    parseClaudeModelStatus('Current model: `Opus 5` (effort: high)\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, default, or a full model ID.'),
    parseClaudeEffortLevels('Usage: /effort <low|medium|high|xhigh|max|auto>'),
    'claude-cli 2.1.270'
  );
  assert.equal(profile.sessionScopedControl.proven, true);
  assert.match(profile.sessionScopedControl.evidence, /settings\.json hash unchanged/);
  assert.equal(profile.model.state, 'requires-proof');
});

test('Q2.10B-7. Exact-instance projection: live Controlled capability wins; terminal uses provider discovery; neither → Unknown', () => {
  const codexControls = projectInstanceControls(codex1, undefined);
  assert.equal(codexControls.model.state, 'available');
  assert.equal(codexControls.promptDelivery, 'semantic');
  assert.deepEqual(codexControls.model.options.map((o) => o.id), ['gpt-5.6-sol', 'gpt-6-astra']);
  assert.deepEqual(codexControls.effort.options.map((o) => o.id), ['low', 'medium', 'high', 'ultra']);
  assert.equal(codexControls.model.currentLabel, 'GPT-5.6-Sol');

  const agyControls = antigravityControlProfile(parseAntiGravityModels(AGY_MODELS), 'agy models');
  const agy1 = { instanceId: 'antigravity-e360619b', playerType: 'antigravity', transport: 'legacy', capability: { provider: 'antigravity', freshness: 'unavailable', models: [] } };
  assert.equal(projectInstanceControls(agy1, agyControls), agyControls, 'terminal transport still exposes provider controls');

  const unavailableCodex = { ...codex1, capability: { ...codexSnapshot, freshness: 'unavailable', models: [] } };
  assert.equal(projectInstanceControls(unavailableCodex, undefined), undefined, 'no invented generic default');
  assert.equal(projectInstanceControls(agy1, claudeControlProfile(undefined, undefined, 'x')), undefined, "another type's controls never leak onto this instance");
});

test('Q2.10B-8. MANUAL Player + Coach Auto model/effort resolves for the exact instance; Provider Default is never overridden', () => {
  const auto = resolveCoachAuto(codex1, 'Architect the routing layer', { model: 'auto', effort: 'auto' }, policies);
  assert.ok(auto.model && auto.model !== 'auto', 'Coach picked a real model');
  assert.ok(codexSnapshot.models.find((m) => m.id === auto.model).supportedEfforts.includes(auto.effort), 'Auto effort is valid for the chosen model');

  const partial = resolveCoachAuto(codex1, 'Implement it', { model: 'gpt-6-astra', effort: 'auto' }, policies);
  assert.equal(partial.model, 'gpt-6-astra', 'the human override is kept');
  assert.ok(['medium', 'high', 'ultra'].includes(partial.effort));

  assert.deepEqual(resolveCoachAuto(codex1, 'x', { model: 'default', effort: 'default' }, policies), { model: 'default', effort: 'default' }, 'Provider Default stays Provider Default');

  const terminal = { instanceId: 'claude-5269841e', playerType: 'claude', transport: 'legacy', fieldLabel: 'Claude', state: 'ready', capability: { provider: 'claude', freshness: 'unavailable', models: [] } };
  assert.deepEqual(resolveCoachAuto(terminal, 'x', { model: 'auto', effort: 'auto' }, policies), { model: undefined, effort: undefined }, 'Auto never fakes a control Coach cannot operate');
});

test("Q2.10B-9. The router resolves MANUAL Auto into the exact instance's dispatch frame and never picks a sibling", () => {
  const frames = [];
  const registry = new EventEmitter();
  const codex2 = { ...codex1, instanceId: 'codex-22222222', fieldLabel: 'Codex 2' };
  const session = { instanceId: 'inst_gt', stadiumId: 's1', rosterSynchronized: true, capabilities: [codex1, codex2], socket: { send: (raw) => frames.push(JSON.parse(raw)) } };
  registry.getSelectedGameId = () => 'g1';
  registry.getAuthoritativeSessionForGame = () => ({ status: 'connected', session });
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ prompt: 'Design the architecture', routingMode: 'manual', playerInstanceId: 'codex-22222222', model: 'auto', effort: 'auto', gameId: 'g1' });
  assert.equal(frames[0].params.playerInstanceId, 'codex-22222222', 'exact instance, never codex-0a6eab81');
  assert.ok(frames[0].params.model && frames[0].params.model !== 'auto');
  assert.ok(frames[0].params.effort && frames[0].params.effort !== 'auto');
  registry.emit('change', { type: 'session-removed', instanceId: 'inst_gt' });
  return pending;
});

test('Q2.10B-10. AUTO names the exact instance and records why, preferring a free sibling over a busy one', () => {
  const busy = { ...codex1, state: 'busy' };
  const free = { ...codex1, instanceId: 'codex-22222222', fieldLabel: 'Codex 2', state: 'ready' };
  const { decision } = computeAutoRoute('g1', 'Implement the preferences endpoint', [busy, free], policies);
  assert.equal(decision.playerInstanceId, 'codex-22222222');
  assert.equal(decision.transport, 'controlled');
  assert.ok(decision.model && decision.effort, 'model + effort attached to the exact instance');
  assert.match(decision.rationale.instance, /codex-22222222 chosen: free while codex-0a6eab81 is working/);
  assert.equal(decision.summary, 'Codex 2 is free and can run this Play now.');
  assert.ok(decision.rationale.model && decision.rationale.effort);
});

test('Q2.10B-15. A Player that needs attention never stalls AUTO for ready teammates and is never called "working"', () => {
  // Live field evidence: an unavailable Codex made AUTO say "All controlled Players are currently working"
  // while Claude and AntiGravity were ready on field.
  const stalledCodex = { ...codex1, state: 'unavailable' };
  const claude = { instanceId: 'claude-5269841e', playerType: 'claude', transport: 'legacy', fieldLabel: 'Claude', state: 'ready', capability: { provider: 'claude', freshness: 'unavailable', models: [] } };
  const agy = { instanceId: 'antigravity-e360619b', playerType: 'antigravity', transport: 'legacy', fieldLabel: 'AntiGravity', state: 'ready', capability: { provider: 'antigravity', freshness: 'unavailable', models: [] } };

  const team = computeAutoRoute('g1', 'Help', [stalledCodex, claude, agy], policies);
  assert.doesNotMatch(team.error, /working/);
  assert.match(team.error, /Claude and AntiGravity are on field/);

  const onlyClaudeReady = computeAutoRoute('g1', 'Help', [stalledCodex, claude], policies);
  assert.equal(onlyClaudeReady.decision.playerInstanceId, 'claude-5269841e', 'the stalled Codex does not block the only ready Player');

  const allStalled = computeAutoRoute('g1', 'Help', [stalledCodex], policies);
  assert.equal(allStalled.error, "Codex can't take Plays right now. Check the Roster for what needs attention.");

  const busy = computeAutoRoute('g1', 'Help', [{ ...codex1, state: 'busy' }], policies);
  assert.match(busy.error, /currently working/, 'a genuinely busy Player is still described as working');
});

// ---------------------------------------------------------------------------
// Multi-instance Roster
// ---------------------------------------------------------------------------

test('Q2.10B-11. Several same-type instances coexist with distinct identities; bench and remove touch only the exact instance', () => {
  const book = new PlayerInstanceBook();
  const claude1 = book.allocate('claude', 'coach-managed');
  const claude2 = book.allocate('claude', 'coach-managed');
  const claude3 = book.allocate('claude', 'adopted');
  assert.equal(new Set([claude1.instanceId, claude2.instanceId, claude3.instanceId]).size, 3);
  assert.deepEqual([claude1.seat, claude2.seat, claude3.seat], [1, 2, 3]);

  book.setOnField(claude1.instanceId, false);
  assert.equal(book.get(claude1.instanceId).onField, false);
  assert.equal(book.get(claude2.instanceId).onField, true, 'sibling untouched by bench');

  book.retire(claude3.instanceId);
  assert.equal(book.get(claude3.instanceId), undefined);
  assert.ok(book.get(claude1.instanceId) && book.get(claude2.instanceId), 'siblings untouched by removal');
  assert.equal(book.get(claude2.instanceId).ownership, 'coach-managed');
});

function renderPage(status, postLog = []) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
    classList: {
      classes: new Set(),
      add(...t) { for (const x of t) this.classes.add(x); },
      remove(...t) { for (const x of t) this.classes.delete(x); },
      toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); },
    append(...kids) { this.children.push(...kids); }
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
    document: { getElementById: getEl, querySelectorAll: (s) => (s === '[data-live-action]' ? [getEl('dispatchBtn')] : []), createElement: () => makeNode('') },
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
    start: async (code) => {
      vm.createContext(context);
      vm.runInContext(code, context);
      source.emit('hello');
      const end = Date.now() + 2000;
      while (Date.now() < end && !getEl('roster').children.length) await new Promise((r) => setTimeout(r, 5));
    }
  };
}

const teamStatus = () => {
  const claude1 = { instanceId: 'claude-5269841e', playerType: 'claude', seat: 1, fieldLabel: 'Claude', ownership: 'coach-managed', onField: true, transport: 'Terminal' };
  const claude2 = { instanceId: 'claude-99999999', playerType: 'claude', seat: 2, fieldLabel: 'Claude 2', ownership: 'coach-managed', onField: true, transport: 'Terminal' };
  const codexInstance = { instanceId: 'codex-0a6eab81', playerType: 'codex', seat: 1, fieldLabel: 'Codex · Controlled', ownership: 'coach-managed', onField: true, transport: 'Controlled', controlMode: 'controlled' };
  // Shapes match PlayerRoster.getRoutingCapabilities(), which always sets transportLabel.
  const legacy = (i) => ({ instanceId: i.instanceId, playerType: 'claude', transport: 'legacy', transportLabel: 'Terminal', fieldLabel: i.fieldLabel, state: 'ready', capability: { provider: 'claude', freshness: 'unavailable', models: [] } });
  const caps = [{ ...codex1, transportLabel: 'Controlled', controls: projectInstanceControls(codex1, undefined) }, legacy(claude1), legacy(claude2)];
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: 'g1',
    game: { gameId: 'g1', displayName: 'SidelineCoach-GameTest', fingerprintSource: 'git-remote' },
    games: [{ gameId: 'g1', displayName: 'SidelineCoach-GameTest', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [
      { id: 'codex', name: 'Codex', availability: 'available', fieldState: 'on-field', instances: [codexInstance] },
      { id: 'claude', name: 'Claude', availability: 'available', fieldState: 'on-field', instances: [claude1, claude2] }
    ],
    capabilities: caps,
    routing: { mode: 'manual', capabilities: caps },
    playerDiscovery: null,
    preferences: { runningPlayers: 'ask' },
    reports: []
  };
};
const pageScript = async () => (await readFile(join(repoRoot, 'src', 'public', 'index.html'), 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];

test('Q2.10B-12. Roster names exact instances "Claude 1" / "Claude 2" and offers "+ Add another" per recruited type', async () => {
  const posts = [];
  const page = renderPage(teamStatus(), posts);
  await page.start(await pageScript());
  const rows = page.getEl('roster').children;
  const cards = rows.filter((r) => r.className === 'player');
  const names = cards.map((card) => card.children[1].children[0].textContent);
  assert.deepEqual(names, ['Codex', 'Claude 1', 'Claude 2']);
  const addRows = rows.filter((r) => r.className === 'player-add-another');
  assert.deepEqual(addRows.map((r) => r.children[0].textContent), ['+ Add another Codex', '+ Add another Claude']);

  const addClaude = addRows[1].children[0];
  for (const fn of addClaude.listeners.click || []) fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(posts.find((p) => p.url === '/api/players/add').body, { playerType: 'claude', controlled: false, allowDuplicate: true }, 'intentional multiplication bypasses the accidental-duplicate warning');
});

test('Q2.10B-13. MANUAL target list shows exact instances, and Controlled Codex exposes Auto, Provider Default and its REAL models/efforts', async () => {
  const page = renderPage(teamStatus());
  await page.start(await pageScript());
  const targets = page.getEl('terminalSelect').children.map((o) => o.textContent);
  assert.ok(targets.includes('Claude 1 · Terminal') && targets.includes('Claude 2 · Terminal'), JSON.stringify(targets));

  const select = page.getEl('terminalSelect');
  select.value = 'codex-0a6eab81';
  for (const fn of select.listeners.change || []) fn({ target: select });
  const distinct = (el) => [...new Set(el.children.map((o) => `${o.value}=${o.textContent}`))];
  // The fake DOM keeps earlier renders' children (innerHTML = '' does not clear), so assert presence, not position.
  const models = distinct(page.getEl('modelSelect'));
  assert.ok(models.includes('auto=Auto'), JSON.stringify(models));
  assert.ok(models.includes('default=Provider Default'), 'Auto and Provider Default are different values');
  assert.ok(models.some((m) => m.startsWith('gpt-6-astra=')), 'real discovered models, not "Provider Default" only');
  const efforts = distinct(page.getEl('effortSelect')).map((e) => e.split('=')[0]);
  assert.ok(efforts.includes('auto') && efforts.includes('default') && efforts.includes('high'));
  assert.equal(page.getEl('modelSelect').value, 'auto', 'MANUAL Player, AUTO model by default');
  assert.notEqual(page.getEl('manualRouteWarning').textContent, 'Live discovery unavailable · using Provider Default');
});

test('Q2.10B-14. AntiGravity enrichment is registered beside Claude and stays out of core discovery', async () => {
  const roster = await readFile(join(repoRoot, 'src', 'player-roster.ts'), 'utf8');
  assert.match(roster, /\[CLAUDE_CONTROL_ENRICHER, ANTIGRAVITY_CONTROL_ENRICHER\]/);
  const probe = roster.slice(roster.indexOf('async function probeAntiGravityControls'), roster.indexOf('const ANTIGRAVITY_CONTROL_ENRICHER'));
  assert.match(probe, /cwd: os\.tmpdir\(\)/);
  assert.match(probe, /child\.stdin\?\.end\(\)/);
  assert.match(probe, /timeout: 7_500/);
  const discovery = await readFile(join(repoRoot, 'src', 'player-discovery.ts'), 'utf8');
  const discover = discovery.slice(discovery.indexOf('async discover('), discovery.indexOf('enrich(discovery: StadiumPlayerDiscovery)'));
  assert.ok(discover.length > 0);
  assert.doesNotMatch(discover, /probeControls|enricher\.probe/, 'Q2.10A.1 invariant: optional enrichment never blocks scouting');
});
