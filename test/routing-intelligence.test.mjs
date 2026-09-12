import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTask, CodexRoutingPolicy, computeAutoRoute } from '../out/routing-policy.js';
import { CapabilityService, LIVE_TTL_MS, CACHED_TTL_MS } from '../out/capability-service.js';
import { CodexAppServerFactory } from '../out/player-control/codex-app-server.js';
import { PlayerControlHost } from '../out/player-control/host.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');
const fixture = join(testDir, 'fixtures', 'fake-codex-app-server.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'sideline-routing-intelligence-'));

after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

let sequence = 0;
const nextLog = (name) => join(scratch, `${++sequence}-${name}.jsonl`);
const request = (instanceId, gameRoot = repoRoot) => ({
  instanceId,
  playerType: 'codex',
  seat: 1,
  gameRoot,
  gameId: 'game_git_test',
  authority: { approvalPolicy: 'never', sandbox: 'danger-full-access' }
});
const factory = (logPath, mode = 'normal', extra = {}) => new CodexAppServerFactory({
  command: process.execPath,
  args: [fixture],
  shell: false,
  certifiedVersions: ['0.154.0'],
  env: {
    ...process.env,
    FAKE_LOG_PATH: logPath,
    FAKE_MODE: mode,
    ...extra
  }
});

const sampleCatalog = [
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT-5.6-Sol',
    description: 'Workhorse coding model',
    isDefault: true,
    supportedEfforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium'
  },
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6-Astra',
    description: 'Advanced reasoning model',
    isDefault: false,
    supportedEfforts: ['high', 'ultra'],
    defaultEffort: 'ultra'
  },
  {
    id: 'gpt-5-luna',
    displayName: 'GPT-5-Luna',
    description: 'Fast responsive model',
    isDefault: false,
    supportedEfforts: ['low'],
    defaultEffort: 'low'
  }
];

const sampleSnapshot = {
  provider: 'codex',
  authenticated: true,
  accountEmail: 'test@example.com',
  planType: 'plus',
  models: sampleCatalog,
  defaultModelId: 'gpt-5.6-sol',
  observedAt: Date.now(),
  freshness: 'live'
};

// ==========================================
// 1. Task Classification (classifyTask)
// ==========================================

test('1. classifyTask: architecture keywords produce architecture classification', () => {
  assert.equal(classifyTask('Please architect a new routing layer'), 'architecture');
  assert.equal(classifyTask('Design the state machine for multi-agent coordination'), 'architecture');
  assert.equal(classifyTask('Scout the capabilities of locally installed CLI tools'), 'architecture');
  assert.equal(classifyTask('Draft an RFC and plan the roadmap'), 'architecture');
});

test('2. classifyTask: prompt exceeding 3000 chars classifies as architecture', () => {
  const longPrompt = 'X'.repeat(3001);
  assert.equal(classifyTask(longPrompt), 'architecture');
});

test('3. classifyTask: implementation keywords produce implementation classification', () => {
  assert.equal(classifyTask('Implement the capability cache service and unit tests'), 'implementation');
  assert.equal(classifyTask('Refactor the dispatch route in server.ts to accept options'), 'implementation');
  assert.equal(classifyTask('Fix the bug in child process exit handling'), 'implementation');
  assert.equal(classifyTask('Compile the TypeScript source files'), 'implementation');
});

test('4. classifyTask: multiline prompt classifies as implementation', () => {
  assert.equal(classifyTask('Step 1\nStep 2'), 'implementation');
});

test('5. classifyTask: quick keywords produce quick classification', () => {
  assert.equal(classifyTask('Check status of background task'), 'quick');
  assert.equal(classifyTask('Update typo in docs readme comments'), 'quick');
  assert.equal(classifyTask('Verify installed version of codex'), 'quick');
});

test('6. classifyTask: prompt under 80 chars without stronger keywords classifies as quick', () => {
  assert.equal(classifyTask('What is the current time?'), 'quick');
});

test('7. classifyTask: empty prompt or whitespace falls back to default', () => {
  assert.equal(classifyTask(''), 'default');
  assert.equal(classifyTask('   '), 'default');
});

test('8. classifyTask: standard prompt without matching keywords falls back to default', () => {
  const standard = 'Please summarize the conversation history for our records without modifying any files or behavior.';
  assert.equal(classifyTask(standard), 'default');
});

// ==========================================
// 2. CapabilityService
// ==========================================

test('9. CapabilityService: freshness is live within 60s', () => {
  const service = new CapabilityService();
  assert.equal(service.getFreshness(Date.now() - 10_000), 'live');
});

test('10. CapabilityService: freshness is cached between 60s and 600s', () => {
  const service = new CapabilityService();
  assert.equal(service.getFreshness(Date.now() - 120_000), 'cached');
});

test('11. CapabilityService: freshness is stale after 600s', () => {
  const service = new CapabilityService();
  assert.equal(service.getFreshness(Date.now() - 700_000), 'stale');
});

test('12. CapabilityService: freshness is unavailable when observedAt <= 0 or explicit', () => {
  const service = new CapabilityService();
  assert.equal(service.getFreshness(0), 'unavailable');
  assert.equal(service.getFreshness(Date.now(), true), 'unavailable');
});

test('13. CapabilityService: record and get preserves snapshot and dynamically refreshes freshness', () => {
  const service = new CapabilityService();
  service.record(sampleSnapshot);
  const retrieved = service.get('codex');
  assert.equal(retrieved.provider, 'codex');
  assert.equal(retrieved.models.length, 3);
  assert.equal(retrieved.freshness, 'live');
});

test('14. CapabilityService: get on unknown provider returns unavailable snapshot', () => {
  const service = new CapabilityService();
  const missing = service.get('unknown-provider');
  assert.equal(missing.freshness, 'unavailable');
  assert.equal(missing.models.length, 0);
  assert.equal(missing.authenticated, false);
});

test('15. CapabilityService: invalidate removes specific provider or all providers', () => {
  const service = new CapabilityService();
  service.record(sampleSnapshot);
  assert.equal(service.get('codex').models.length, 3);
  service.invalidate('codex');
  assert.equal(service.get('codex').freshness, 'unavailable');

  service.record(sampleSnapshot);
  service.invalidate();
  assert.equal(service.get('codex').freshness, 'unavailable');
});

// ==========================================
// 3. CodexRoutingPolicy
// ==========================================

test('16. CodexRoutingPolicy: architecture task selects ultra/max reasoning model', () => {
  const policy = new CodexRoutingPolicy();
  const selection = policy.selectModel('architecture', sampleSnapshot);
  assert.equal(selection.modelId, 'gpt-6-astra');
  assert.equal(selection.effort, 'ultra');
  assert.match(selection.rationale, /reasoning/i);
});

test('17. CodexRoutingPolicy: implementation task selects workhorse coding model', () => {
  const policy = new CodexRoutingPolicy();
  const selection = policy.selectModel('implementation', sampleSnapshot);
  assert.equal(selection.modelId, 'gpt-5.6-sol');
  assert.equal(selection.effort, 'medium');
  assert.match(selection.rationale, /coding|workhorse/i);
});

test('18. CodexRoutingPolicy: quick task selects fast responsive model', () => {
  const policy = new CodexRoutingPolicy();
  const selection = policy.selectModel('quick', sampleSnapshot);
  assert.equal(selection.modelId, 'gpt-5-luna');
  assert.equal(selection.effort, 'low');
  assert.match(selection.rationale, /fast|responsive/i);
});

test('19. CodexRoutingPolicy: default task selects default model', () => {
  const policy = new CodexRoutingPolicy();
  const selection = policy.selectModel('default', sampleSnapshot);
  assert.equal(selection.modelId, 'gpt-5.6-sol');
  assert.equal(selection.effort, 'medium');
});

test('20. CodexRoutingPolicy: empty models snapshot falls back to Provider Default', () => {
  const policy = new CodexRoutingPolicy();
  const emptySnapshot = { ...sampleSnapshot, models: [] };
  const selection = policy.selectModel('architecture', emptySnapshot);
  assert.equal(selection.modelId, undefined);
  assert.equal(selection.modelDisplayName, 'Provider Default');
  assert.equal(selection.effort, undefined);
});

test('21. CodexRoutingPolicy: safety validation validates against live discovered catalog', () => {
  const policy = new CodexRoutingPolicy();
  // Catalog without astra
  const solOnlyCatalog = [sampleCatalog[0]];
  const solOnlySnapshot = { ...sampleSnapshot, models: solOnlyCatalog };
  const selection = policy.selectModel('architecture', solOnlySnapshot);
  assert.equal(selection.modelId, 'gpt-5.6-sol');
});

// ==========================================
// 4. computeAutoRoute()
// ==========================================

const controlledReadyCandidate = {
  instanceId: 'codex-inst-1',
  playerType: 'codex',
  transport: 'controlled',
  fieldLabel: 'Codex 1 · Controlled',
  state: 'ready',
  capability: sampleSnapshot
};

test('22. computeAutoRoute: selects candidate and model matching classified task', () => {
  const policies = new Map([['codex', new CodexRoutingPolicy()]]);
  const result = computeAutoRoute('game_git_test', 'Implement the database layer', [controlledReadyCandidate], policies);
  assert.ok(result.decision);
  assert.equal(result.decision.playerInstanceId, 'codex-inst-1');
  assert.equal(result.decision.model, 'gpt-5.6-sol');
  assert.equal(result.decision.effort, 'medium');
  assert.equal(result.decision.mode, 'auto');
});

test('23. computeAutoRoute: fails safe when no controlled player is on field', () => {
  const legacyCandidate = {
    instanceId: 'codex-inst-legacy',
    playerType: 'codex',
    transport: 'legacy',
    fieldLabel: 'Codex Legacy',
    state: 'ready',
    capability: { ...sampleSnapshot, freshness: 'unavailable', models: [] }
  };
  const policies = new Map([['codex', new CodexRoutingPolicy()]]);
  const result = computeAutoRoute('game_git_test', 'Implement feature', [legacyCandidate], policies);
  assert.equal(result.decision, undefined);
  assert.match(result.error, /No controlled Player on field/);
});

test('24. computeAutoRoute: fails safe when all controlled players are busy', () => {
  const busyCandidate = { ...controlledReadyCandidate, state: 'busy' };
  const policies = new Map([['codex', new CodexRoutingPolicy()]]);
  const result = computeAutoRoute('game_git_test', 'Implement feature', [busyCandidate], policies);
  assert.equal(result.decision, undefined);
  assert.match(result.error, /All controlled Players are currently working/);
});

test('25. computeAutoRoute: Critical Amendment 1 fail-safe stops safely when capabilities unavailable', () => {
  const unavailableCandidate = {
    ...controlledReadyCandidate,
    capability: { ...sampleSnapshot, freshness: 'unavailable', models: [] }
  };
  const policies = new Map([['codex', new CodexRoutingPolicy()]]);
  const result = computeAutoRoute('game_git_test', 'Implement feature', [unavailableCandidate], policies);
  assert.equal(result.decision, undefined);
  assert.equal(result.error, 'Live routing capabilities are unavailable. Refresh capabilities or switch to Manual.');
});

// ==========================================
// 5. Provider RPC Capability Discovery & Options Pass-Through
// ==========================================

test('26. CodexAppServerControl.queryCapabilities: queries account/read and model/list over JSON-RPC', async () => {
  const log = nextLog('capabilities-query');
  const host = new PlayerControlHost();
  host.register('codex', factory(log));
  const openResult = await host.open(request('codex-cap-1'));
  assert.equal(openResult.kind, 'ready');

  const snapshot = await host.queryCapabilities('codex-cap-1');
  assert.ok(snapshot);
  assert.equal(snapshot.provider, 'codex');
  assert.equal(snapshot.authenticated, true);
  assert.equal(snapshot.planType, 'plus');
  assert.equal(snapshot.accountEmail, 'fake@example.test');
  assert.equal(snapshot.models.length, 3);
  assert.equal(snapshot.models[0].id, 'gpt-5.6-sol');
  assert.equal(snapshot.models[0].isDefault, true);
  assert.deepEqual(snapshot.models[0].supportedEfforts, ['low', 'medium', 'high']);
  assert.equal(snapshot.models[0].defaultEffort, 'medium');

  await host.dispose();
});

test('27. PlayerControlHost.deliver passes model and effort in turn/start RPC params', async () => {
  const log = nextLog('deliver-options');
  const host = new PlayerControlHost();
  host.register('codex', factory(log));
  await host.open(request('codex-opt-1'));

  const outcome = await host.deliver('codex-opt-1', 'Build the routing layer', {
    model: 'gpt-5.6-sol',
    effort: 'high'
  });
  assert.equal(outcome.kind, 'accepted');

  const lines = (await readFile(log, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  const turnStartRequest = lines.find((l) => l.method === 'turn/start');
  assert.ok(turnStartRequest);
  assert.equal(turnStartRequest.params?.model, 'gpt-5.6-sol');
  assert.equal(turnStartRequest.params?.effort, 'high');

  const turnStartedEvent = lines.find((l) => l.fakeEvent === 'turn-started');
  assert.equal(turnStartedEvent?.model, 'gpt-5.6-sol');
  assert.equal(turnStartedEvent?.effort, 'high');

  await host.dispose();
});

test('28. PlayerControlHost.deliver without options omits model and effort in RPC params', async () => {
  const log = nextLog('deliver-default');
  const host = new PlayerControlHost();
  host.register('codex', factory(log));
  await host.open(request('codex-opt-2'));

  const outcome = await host.deliver('codex-opt-2', 'Standard play');
  assert.equal(outcome.kind, 'accepted');

  const lines = (await readFile(log, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  const turnStartRequest = lines.find((l) => l.method === 'turn/start');
  assert.ok(turnStartRequest);
  assert.equal(turnStartRequest.params?.model, undefined);
  assert.equal(turnStartRequest.params?.effort, undefined);

  await host.dispose();
});

// ==========================================
// BROWSER UI & HARNESS TESTS (Tests 29 - 33)
// ==========================================

const html = await readFile(resolve(repoRoot, 'src/public/index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script found in index.html');
const scriptCode = scriptMatch[1];

function createBrowserHarness(initialStatus = null) {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: id === 'dispatchBtn' ? 'Dispatch Play' : '',
        value: '',
        disabled: false,
        hidden: false,
        title: '',
        dataset: id === 'dispatchBtn' ? { liveAction: '' } : {},
        style: { display: '', opacity: '' },
        classList: {
          classes: new Set(),
          add(...tokens) { for (const t of tokens) this.classes.add(t); },
          remove(...tokens) { for (const t of tokens) this.classes.delete(t); },
          toggle(c, force) {
            if (force === undefined) force = !this.classes.has(c);
            if (force) this.classes.add(c); else this.classes.delete(c);
            return force;
          },
          contains(c) { return this.classes.has(c); }
        },
        listeners: {},
        addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; },
        appendChild(child) { this.children = this.children || []; this.children.push(child); },
        append(...children) { this.children = this.children || []; this.children.push(...children); },
        children: []
      });
    }
    return elements.get(id);
  };

  const document = {
    getElementById: getEl,
    querySelectorAll: (selector) => {
      if (selector === '[data-live-action]') return [getEl('dispatchBtn')];
      return [];
    },
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      value: '',
      textContent: '',
      disabled: false,
      selected: false,
      style: { display: '', opacity: '' },
      classList: {
        classes: new Set(),
        add(...tokens) { for (const t of tokens) this.classes.add(t); },
        remove(...tokens) { for (const t of tokens) this.classes.delete(t); }
      },
      appendChild(child) { this.children = this.children || []; this.children.push(child); },
      append(...children) { this.children = this.children || []; this.children.push(...children); },
      addEventListener() {},
      children: []
    })
  };

  const sessionStorageData = new Map([['sidelineCoachToken', 'test-token']]);
  const sessionStorage = {
    getItem: (k) => sessionStorageData.get(k) || null,
    setItem: (k, v) => sessionStorageData.set(k, v),
    removeItem: (k) => sessionStorageData.delete(k)
  };

  let eventSourceInstance = null;
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      eventSourceInstance = this;
    }
    addEventListener(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
    emit(event, data) {
      for (const fn of this.listeners[event] || []) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
    close() {}
  }

  const defaultStatus = initialStatus || {
    game: { gameId: 'game_git_test', displayName: 'GS3', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    workspaceRoots: ['/repo'],
    modelSwitches: { Default: '' },
    routing: {
      mode: 'auto',
      activeDecision: {
        playerInstanceId: 'codex-inst-1',
        playerLabel: 'Codex 1 · Controlled',
        model: 'gpt-5.6-sol',
        modelDisplayName: 'GPT-5.6-Sol',
        effort: 'medium',
        reason: 'Implementation task · Standard coding model'
      },
      capabilities: [
        {
          instanceId: 'codex-inst-1',
          playerType: 'codex',
          seat: 1,
          fieldLabel: 'Codex 1 · Controlled',
          transport: 'controlled',
          state: 'ready',
          capability: {
            provider: 'codex',
            authenticated: true,
            observedAt: Date.now(),
            freshness: 'live',
            accountEmail: 'coach@example.com',
            accountPlan: 'pro',
            models: [
              { id: 'gpt-6-astra', displayName: 'GPT-6-Astra', isDefault: false, supportedEfforts: ['low', 'medium', 'high', 'extra-high', 'max', 'ultra'], defaultEffort: 'high' },
              { id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
            ]
          }
        }
      ]
    },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [
        {
          instanceId: 'codex-inst-1',
          playerType: 'codex',
          seat: 1,
          fieldLabel: 'Codex 1 · Controlled',
          controlMode: 'controlled',
          turnState: { instanceId: 'codex-inst-1', state: 'idle', summary: 'Ready', at: 0 }
        }
      ]
    }]
  };

  let currentStatus = defaultStatus;
  const postedCalls = [];

  const fetchHandler = async (url, options = {}) => {
    if (url === '/api/status') {
      return { ok: true, status: 200, json: async () => currentStatus };
    }
    if (url === '/api/reports') {
      return { ok: true, status: 200, json: async () => [] };
    }
    if (url.startsWith('/api/')) {
      const body = options.body ? JSON.parse(options.body) : {};
      postedCalls.push({ url, body });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const context = {
    document,
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage,
    Headers: globalThis.Headers,
    URLSearchParams: globalThis.URLSearchParams,
    EventSource: FakeEventSource,
    fetch: fetchHandler,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  vm.createContext(context);
  vm.runInContext(scriptCode, context);

  return {
    getEl,
    getEventSource: () => eventSourceInstance,
    postedCalls,
    setStatus: (s) => { currentStatus = s; }
  };
}

async function initConnectedHarness(initialStatus = null) {
  const harness = createBrowserHarness(initialStatus);
  harness.getEventSource().emit('hello');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (harness.getEl('connectionText').textContent === 'Connected') return harness;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Harness failed to establish Connected state');
}

test('29. Browser UI renders AUTO mode as default with chip and rationale', async () => {
  const harness = await initConnectedHarness();
  const autoBtn = harness.getEl('modeAutoBtn');
  const manualBtn = harness.getEl('modeManualBtn');
  const autoControls = harness.getEl('autoRoutingCard');
  const manualControls = harness.getEl('manualRoutingCard');
  const autoPlayer = harness.getEl('autoRoutePlayer');
  const autoModel = harness.getEl('autoRouteModel');
  const autoReason = harness.getEl('autoRouteReason');

  assert.ok(autoBtn.classList.contains('active'));
  assert.ok(!manualBtn.classList.contains('active'));
  assert.equal(autoControls.hidden, false);
  assert.equal(manualControls.hidden, true);
  assert.ok(autoPlayer.textContent.includes('Codex 1 · Controlled'));
  assert.ok(autoModel.textContent.includes('GPT-5.6-Sol'));
  assert.ok(autoReason.textContent.includes('Implementation task'));
});

test('30. Switching between AUTO and MANUAL toggles UI controls and updates mode', async () => {
  const harness = await initConnectedHarness();
  const autoBtn = harness.getEl('modeAutoBtn');
  const manualBtn = harness.getEl('modeManualBtn');
  const autoControls = harness.getEl('autoRoutingCard');
  const manualControls = harness.getEl('manualRoutingCard');

  // Click Manual
  for (const fn of manualBtn.listeners['click'] || []) fn();

  assert.ok(!autoBtn.classList.contains('active'));
  assert.ok(manualBtn.classList.contains('active'));
  assert.equal(autoControls.hidden, true);
  assert.equal(manualControls.hidden, false);

  const routePost = harness.postedCalls.find((c) => c.url === '/api/route');
  assert.ok(routePost);
  assert.equal(routePost.body.mode, 'manual');

  // Click Auto
  for (const fn of autoBtn.listeners['click'] || []) fn();
  assert.ok(autoBtn.classList.contains('active'));
  assert.ok(!manualBtn.classList.contains('active'));
  assert.equal(autoControls.hidden, false);
  assert.equal(manualControls.hidden, true);
});

test('31. MANUAL dropdown cascades: selecting player loads models, selecting model loads efforts', async () => {
  const harness = await initConnectedHarness();
  const manualBtn = harness.getEl('modeManualBtn');
  for (const fn of manualBtn.listeners['click'] || []) fn();

  const playerSelect = harness.getEl('terminalSelect');
  const modelSelect = harness.getEl('modelSelect');
  const effortSelect = harness.getEl('effortSelect');

  // Trigger change on playerSelect for codex-inst-1
  playerSelect.value = 'codex-inst-1';
  for (const fn of playerSelect.listeners['change'] || []) fn({ target: { value: 'codex-inst-1' } });

  // Model select options populated
  assert.ok(modelSelect.children.length >= 2);
  const modelTexts = modelSelect.children.map((c) => c.textContent);
  assert.ok(modelTexts.some((t) => t.includes('GPT-6-Astra')));
  assert.ok(modelTexts.some((t) => t.includes('GPT-5.6-Sol')));

  // Select GPT-6-Astra
  modelSelect.value = 'gpt-6-astra';
  for (const fn of modelSelect.listeners['change'] || []) fn({ target: { value: 'gpt-6-astra' } });

  // Effort select populated with Astra's efforts
  assert.ok(effortSelect.children.length >= 4);
  const effortValues = effortSelect.children.map((c) => c.value);
  assert.ok(effortValues.includes('low'));
  assert.ok(effortValues.includes('medium'));
  assert.ok(effortValues.includes('high'));
  assert.ok(effortValues.includes('ultra'));
});

test('32. AUTO mode displays warning banner when capabilities are unavailable', async () => {
  const statusWithUnavailable = {
    game: { gameId: 'game_git_test', displayName: 'GS3', fingerprintSource: 'git-remote' },
    stadium: { stadiumId: 'stadium_win_123', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    workspaceRoots: ['/repo'],
    modelSwitches: { Default: '' },
    routing: {
      mode: 'auto',
      autoError: 'Live routing capabilities are unavailable. Refresh capabilities or switch to Manual.',
      capabilities: []
    },
    players: [{
      id: 'codex',
      name: 'Codex',
      availability: 'available',
      fieldState: 'on-field',
      instances: [{
        instanceId: 'codex-inst-1',
        playerType: 'codex',
        seat: 1,
        fieldLabel: 'Codex 1 · Controlled',
        controlMode: 'controlled',
        turnState: { instanceId: 'codex-inst-1', state: 'idle', summary: 'Ready', at: 0 }
      }]
    }]
  };

  const harness = await initConnectedHarness(statusWithUnavailable);
  const autoWarning = harness.getEl('autoRouteWarning');

  assert.equal(autoWarning.hidden, false);
  assert.ok(autoWarning.textContent.includes('Live routing capabilities are unavailable'));
});

test('33. Refresh capabilities button fires POST /api/capabilities/refresh', async () => {
  const harness = await initConnectedHarness();
  const refreshBtn = harness.getEl('refreshCapsBtn');

  for (const fn of refreshBtn.listeners['click'] || []) await fn();

  const refreshCall = harness.postedCalls.find((c) => c.url === '/api/capabilities/refresh');
  assert.ok(refreshCall);
});

