/**
 * S31 Slice 5 — Scout as a roster-native Virtual Player.
 *
 * The model under test: ENTITLEMENT (is Scout offered?) is not MEMBERSHIP (did Dad recruit it to THIS
 * Game?), and neither is READINESS (can it run right now?). Membership is durable and per Game; readiness is
 * derived from the shared depth chart on every snapshot and is never stored.
 *
 * These drive the REAL PlayerRoster (with a minimal vscode stub), the real ScoutPlayerAdapter over a temp
 * Scout Intelligence root with real scorecard files, and the real router, routing policy, daemon and Stadium
 * client. Nothing here touches the real Scout root or spends provider quota.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The built-in Gemini receiver becomes eligible when these exist. Keep "no Scouts yet" about the depth chart.
const savedEnv = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
test.after(() => { for (const [k, v] of Object.entries(savedEnv)) if (v !== undefined) process.env[k] = v; });

// --- Minimal VS Code host (same approach as p0-1-terminal-player) ---------------------------------------------------

class StubEventEmitter {
  constructor() { this.listeners = new Set(); }
  get event() { return (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; }
  fire(value) { for (const listener of [...this.listeners]) listener(value); }
  dispose() { this.listeners.clear(); }
}
const endExecution = new StubEventEmitter();
const makeTerminal = (name) => ({
  name, exitStatus: undefined, processId: Promise.resolve(41_000), sent: [], executed: [], disposed: false,
  show() {}, sendText(text, enter) { this.sent.push({ text, enter }); }, dispose() { this.disposed = true; },
  shellIntegration: { executeCommand(commandLine) { const execution = { commandLine }; return execution; } }
});
const vscodeStub = {
  EventEmitter: StubEventEmitter,
  Disposable: class { constructor(fn) { this.dispose = fn ?? (() => {}); } },
  TerminalExitReason: { Unknown: 0, Shutdown: 1, Process: 2, User: 3, Extension: 4 },
  window: {
    terminals: [],
    createTerminal(options) { const terminal = makeTerminal(options?.name); vscodeStub.window.terminals.push(terminal); return terminal; },
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
const { PLAYER_ADAPTERS, getPlayerAdapter } = await import('../out/player-adapters.js');
const { ScoutPlayerAdapter } = await import('../out/scout-player.js');
const { ensureScoutIntelligenceRoot } = await import('../out/scout-intelligence-root.js');
const { StadiumClient } = await import('../out/stadium-client.js');
const { StadiumRegistry } = await import('../out/control-plane/stadium-registry.js');
const { ControlPlaneRouter } = await import('../out/control-plane/router.js');
const { ControlPlaneDaemon } = await import('../out/control-plane/daemon.js');
const { InstanceWorkLedger } = await import('../out/control-plane/work-ledger.js');
const { computeContextAwareRoute, createRoutingPolicies } = await import('../out/routing-policy.js');
const { VIRTUAL_MEMBERSHIP_KEY, VirtualMembershipStore, unavailableVirtualCapability } = await import('../out/virtual-player.js');

// --- fixtures ---------------------------------------------------------------------------------------------------------------

const GAME_A = 'game_git_trend';
const GAME_B = 'game_local_gpt_reader';
const CONSENT_KEY = 'sidelineCoach.scout.bootstrapConsent';
const policies = createRoutingPolicies();

class MemoryMemento {
  constructor(entries = []) { this.data = new Map(entries); }
  get(key, fallback) { return this.data.has(key) ? JSON.parse(this.data.get(key)) : fallback; }
  async update(key, value) { this.data.set(key, JSON.stringify(value)); }
  snapshot() { return [...this.data.entries()]; }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

function scoutWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-virtual-'));
  const scoutRoot = path.join(root, 'Scout Intelligence');
  ensureScoutIntelligenceRoot(scoutRoot);
  const gameRoot = path.join(root, 'Game');
  fs.mkdirSync(gameRoot, { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'package.json'), '{"name":"virtual-fixture"}\n');
  const flags = { entitled: true };
  const cardsDir = path.join(scoutRoot, 'Combine', 'Scorecards');
  const card = (id, status) => ({
    schemaVersion: 1, candidateId: id, provider: 'openrouter', model: `openrouter/${id}`, displayName: `Receiver ${id}`, harness: 'opencode',
    firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), lastTryoutAt: new Date().toISOString(), currentStatus: status,
    totals: { starts: 1, completions: status === 'READY' ? 1 : 0, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
    routeAttempts: {}, notes: [], latestEvidencePaths: []
  });
  const world = {
    root, scoutRoot, gameRoot, flags,
    setCard: (id, status = 'READY') => fs.writeFileSync(path.join(cardsDir, `${id}.json`), JSON.stringify(card(id, status), null, 2)),
    clearCards: () => { for (const name of fs.readdirSync(cardsDir)) fs.rmSync(path.join(cardsDir, name)); },
    adapter: (extra = {}) => new ScoutPlayerAdapter({ durableReportRoot: () => scoutRoot, enabled: () => flags.entitled, ...extra }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
  return world;
}

function context(gameId, gameRoot) {
  return () => ({
    game: { gameId, displayName: gameId, fingerprintSource: 'test' },
    stadium: { stadiumId: 'stadium_test', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    binding: { gameId, stadiumId: 'stadium_test', rootFsPath: gameRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
  });
}

/** A real PlayerRoster for one Game (its own workspaceState), with Scout registered as a recruitable Virtual Player. */
async function rosterFor(world, { gameId = GAME_A, memento = new MemoryMemento(), adapter = world.adapter(), register = true } = {}) {
  vscodeStub.window.terminals.length = 0;
  const roster = new PlayerRoster(memento, new PlayerControlHost(), context(gameId, world.gameRoot));
  roster.checkedAt = Number.MAX_SAFE_INTEGER; // never probe PowerShell for provider CLIs in a unit test
  roster.discovery = {
    discover: async ({ stadiumId, gameId: id }) => ({
      stadiumId, gameId: id, at: Date.now(),
      catalog: [{ playerType: 'terminal', displayName: 'Terminal', state: 'available', summary: 'Available', canAddNow: true, controlled: false }],
      externalCandidates: [], runningElsewhere: [], externalScanSupported: true
    }),
    enrich: async (discovery) => discovery
  };
  if (register) roster.registerVirtualPlayer(adapter);
  await settle();
  return { roster, memento, adapter, gameId };
}

const scoutGroup = async (roster, gameId = GAME_A) => (await roster.status(gameId)).find((group) => group.id === 'scout');
const scoutCapability = (roster, gameId = GAME_A) => roster.getRoutingCapabilities(gameId).find((c) => c.instanceId === 'scout');

function tree(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { out[`${path.relative(dir, full)}/`] = 'dir'; walk(full); }
      else out[path.relative(dir, full)] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

// --- 1-2: entitlement is not membership; a READY Scout can be recruited -------------------------------------------------------

test('Virtual-1. ENTITLEMENT != MEMBERSHIP: an entitled, READY Scout is offered in Recruit but is not on the Team until Dad recruits it', async () => {
  const w = scoutWorld();
  try {
    w.setCard('alpha');
    const { roster } = await rosterFor(w, { adapter: w.adapter() });
    // Fresh workspace with a READY Scout at first registration is the one-time compatibility case; use a
    // Game where the check already ran without adopting, to observe the pure recruit-first model.
    const w2 = scoutWorld();
    try {
      const fresh = await rosterFor(w2); // no receivers: nothing to adopt, the compatibility check is recorded
      w2.setCard('alpha');               // Scout becomes READY afterwards, exactly like finishing tryouts
      assert.equal(await scoutGroup(fresh.roster), undefined, 'READY does not recruit');
      assert.equal(scoutCapability(fresh.roster), undefined, 'and a non-member has no routing capability');
      const discovery = await fresh.roster.discoverPlayers();
      const entry = discovery.catalog.find((e) => e.playerType === 'scout');
      assert.ok(entry, 'entitlement puts Scout in the Recruit catalog');
      assert.deepEqual([entry.displayName, entry.summary, entry.canAddNow, entry.controlled, entry.state], ['Scout', 'Ready', true, false, 'available']);
      fresh.roster.dispose();
    } finally { w2.cleanup(); }
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-2. A READY Scout can be recruited, and appears On Field with a ready routing capability', async () => {
  const w = scoutWorld();
  try {
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    const result = await roster.addInstance('scout');
    assert.deepEqual([result.success, result.message], [true, 'Scout is on field.']);
    const group = await scoutGroup(roster);
    assert.equal(group.fieldState, 'on-field');
    assert.equal(group.instances.length, 1);
    assert.deepEqual([group.instances[0].instanceId, group.instances[0].playerType, group.instances[0].onField], ['scout', 'scout', true]);
    assert.deepEqual([group.instances[0].readinessState, group.instances[0].readinessLabel], ['ready', 'Ready']);
    const capability = scoutCapability(roster);
    assert.deepEqual([capability.state, capability.executionType, capability.autoEligible], ['ready', 'scout-formation', false]);
    // Recruiting again is harmless, and the catalog flips to "On Roster" through the ordinary roster.
    assert.equal((await roster.addInstance('scout')).message, 'Scout is already on field.');
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-2b. Not entitled: not offered, and a recruit attempt is refused; an existing member stays visible as "turned off"', async () => {
  const w = scoutWorld();
  try {
    w.flags.entitled = false;
    const { roster } = await rosterFor(w);
    const discovery = await roster.discoverPlayers();
    assert.equal(discovery.catalog.some((e) => e.playerType === 'scout'), false, 'the product concept is not offered');
    assert.deepEqual([(await roster.addInstance('scout')).success, (await roster.addInstance('scout')).message], [false, 'Scout is not available.']);
    assert.equal(await scoutGroup(roster), undefined);

    // Membership outranks a later entitlement change: the Player is not silently removed.
    w.flags.entitled = true;
    await roster.addInstance('scout');
    w.flags.entitled = false;
    const group = await scoutGroup(roster);
    assert.ok(group, 'still on the Team');
    assert.deepEqual([group.instances[0].readinessState, group.instances[0].readinessLabel], ['unavailable', 'Scout is turned off']);
    assert.equal(scoutCapability(roster).state, 'unavailable');
    roster.dispose();
  } finally { w.cleanup(); }
});

// --- 3-4, 19: persistence and Game-specific membership -----------------------------------------------------------------------------

test('Virtual-3. Membership persists across runtime recreation, and readiness is NOT what was persisted', async () => {
  const w = scoutWorld();
  try {
    const memento = new MemoryMemento();
    w.setCard('alpha');
    const first = await rosterFor(w, { memento });
    await first.roster.addInstance('scout');
    first.roster.dispose();

    const stored = JSON.parse(memento.data.get(VIRTUAL_MEMBERSHIP_KEY));
    assert.deepEqual(Object.keys(stored).sort(), ['compatibilityChecked', 'members', 'version']);
    assert.deepEqual(Object.keys(stored.members.scout).sort(), ['onField', 'playerType', 'recruitedAt'], 'who and where, nothing else');
    const raw = JSON.stringify(stored);
    for (const forbidden of ['READY', 'ready', 'RATE', 'provider', 'receiver', 'alpha', 'scorecard', 'health']) {
      assert.ok(!raw.includes(forbidden), `readiness/provider/depth-chart truth (${forbidden}) is never stored`);
    }

    // "Restart": a brand-new roster, adapter and memento rebuilt from the persisted bytes ALONE.
    const restarted = await rosterFor(w, { memento: new MemoryMemento(memento.snapshot()) });
    const group = await scoutGroup(restarted.roster);
    assert.equal(group.fieldState, 'on-field', "the human's recruit survived");
    assert.equal(scoutCapability(restarted.roster).state, 'ready');
    restarted.roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-4. Membership is Game-specific: recruiting Scout in Game A does not put it on Game B\'s Team', async () => {
  const w = scoutWorld();
  try {
    w.setCard('alpha');
    const a = await rosterFor(w, { gameId: GAME_A });
    const b = await rosterFor(w, { gameId: GAME_B }); // its own workspace state, the same shared Scout department
    // Both windows share ONE depth chart, so compatibility adoption gave each its own membership independently.
    a.roster.dispose(); b.roster.dispose();

    const w2 = scoutWorld();
    try {
      const a2 = await rosterFor(w2, { gameId: GAME_A });
      const b2 = await rosterFor(w2, { gameId: GAME_B });
      w2.setCard('alpha');
      await a2.roster.addInstance('scout');
      assert.equal((await scoutGroup(a2.roster, GAME_A)).fieldState, 'on-field');
      assert.equal(await scoutGroup(b2.roster, GAME_B), undefined, 'Game B never sees it');
      assert.equal(scoutCapability(b2.roster, GAME_B), undefined);
      assert.equal(b2.memento.data.has(VIRTUAL_MEMBERSHIP_KEY) ? JSON.parse(b2.memento.data.get(VIRTUAL_MEMBERSHIP_KEY)).members.scout : undefined, undefined);
      // The reverse, and independence of every verb.
      await b2.roster.addInstance('scout');
      await a2.roster.takeOffField('scout');
      assert.equal((await scoutGroup(a2.roster, GAME_A)).fieldState, 'on-bench');
      assert.equal((await scoutGroup(b2.roster, GAME_B)).fieldState, 'on-field', 'benching in A never benches B');
      await a2.roster.removePlayer('scout');
      assert.ok(await scoutGroup(b2.roster, GAME_B), 'removing in A never removes B');
      a2.roster.dispose(); b2.roster.dispose();
    } finally { w2.cleanup(); }
  } finally { w.cleanup(); }
});

// --- 5-7: an empty or limited depth chart never removes a member, and never creates a false route --------------------------------

test('Virtual-5. Zero READY receivers does NOT remove a recruited Scout: it stays on the Team as unavailable', async () => {
  const w = scoutWorld();
  try {
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    await roster.addInstance('scout');
    assert.equal(scoutCapability(roster).state, 'ready');

    w.clearCards(); // the last READY receiver disappears
    const group = await scoutGroup(roster);
    assert.ok(group, 'S31 F6: membership and readiness are no longer one boolean');
    assert.equal(group.fieldState, 'on-field', 'not silently benched');
    assert.deepEqual([group.instances[0].readinessState, group.instances[0].readinessLabel], ['unavailable', 'No Scouts ready yet']);
    const capability = scoutCapability(roster);
    assert.ok(capability, 'routing still sees Scout, truthfully');
    assert.deepEqual([capability.state, capability.capability.freshness, capability.autoEligible, capability.transportLabel], ['unavailable', 'unavailable', false, 'No Scouts ready yet']);

    w.setCard('beta'); // and readiness returning needs no recruit
    assert.equal(scoutCapability(roster).state, 'ready');
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-6. A provider RATE LIMIT does not remove a recruited Scout, and reads "Provider limited"', async () => {
  const w = scoutWorld();
  try {
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    await roster.addInstance('scout');
    w.setCard('alpha', 'RATE LIMITED'); // infrastructure evidence, exactly what a real limited tryout writes
    const group = await scoutGroup(roster);
    assert.ok(group);
    assert.deepEqual([group.instances[0].readinessState, group.instances[0].readinessLabel], ['unavailable', 'Provider limited']);
    assert.equal(scoutCapability(roster).state, 'unavailable');
    w.setCard('alpha', 'AUTH ISSUE');
    assert.equal((await scoutGroup(roster)).instances[0].readinessLabel, 'Provider limited');
    w.setCard('alpha', 'LIMITED'); // a QUALITY result is not a provider problem
    assert.equal((await scoutGroup(roster)).instances[0].readinessLabel, 'No Scouts ready yet');
    roster.dispose();
  } finally { w.cleanup(); }
});

const RECON = 'Investigate which subsystem owns Scout report acknowledgement. Compare multiple current architecture seams before changing anything, and gather evidence first.';
const claudeCap = { instanceId: 'claude-11111111', playerType: 'claude', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Claude', state: 'ready',
  capability: { provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', models: [{ id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }], defaultModelId: 'opus' } };
const routeContext = (candidates) => ({ ledger: [], reports: [], names: new Map(candidates.map((c) => [c.instanceId, c.fieldLabel])), rosterInstanceIds: new Set(candidates.map((c) => c.instanceId)), queuedCounts: new Map() });

test('Virtual-7. An unavailable Scout can never receive AUTO execution, and an explicit request for it is refused truthfully', async () => {
  const w = scoutWorld();
  try {
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    await roster.addInstance('scout');

    // Control: while READY, this Play IS the kind AUTO sends to Scout.
    const ready = [claudeCap, scoutCapability(roster)];
    assert.equal(computeContextAwareRoute(GAME_A, RECON, ready, policies, routeContext(ready)).decision.playerInstanceId, 'scout');

    w.clearCards();
    const dead = [claudeCap, scoutCapability(roster)];
    assert.equal(dead[1].state, 'unavailable');
    const auto = computeContextAwareRoute(GAME_A, RECON, dead, policies, routeContext(dead));
    assert.equal(auto.decision.playerInstanceId, 'claude-11111111', 'AUTO falls through to a Player that can actually run');
    const onlyScout = computeContextAwareRoute(GAME_A, RECON, [dead[1]], policies, routeContext([dead[1]]));
    assert.equal(onlyScout.decision, undefined, 'and with nobody else there is no route, never a route into a dead Scout');

    const explicit = computeContextAwareRoute(GAME_A, `PLAYER: Scout\n${RECON}`, dead, policies, routeContext(dead));
    assert.equal(explicit.decision, undefined);
    assert.match(explicit.error, /Scout is currently unavailable\. Coach did not choose another Player/);
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-7b. MANUAL selection of an unavailable Scout is refused by the real router with a truthful reason, and sends nothing', async () => {
  const w = scoutWorld();
  try {
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    await roster.addInstance('scout');
    w.clearCards();
    const frames = [];
    const registry = new StadiumRegistry();
    registry.registerSession({
      instanceId: 'stadium-1', stadiumId: 'stadium-trend', name: 'Trend', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
      lastHeartbeat: Date.now(), game: { gameId: GAME_A, displayName: 'Trend', fingerprintSource: 'git' },
      roster: [], capabilities: roster.getRoutingCapabilities(GAME_A), reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
    });
    const result = await new ControlPlaneRouter(registry).dispatch({ gameId: GAME_A, routingMode: 'manual', playerInstanceId: 'scout', prompt: RECON });
    assert.equal(result.success, false);
    assert.match(result.message, /Scout is unavailable/);
    assert.equal(frames.filter((f) => f.method === 'dispatch.request').length, 0, 'nothing reached the Stadium');
    roster.dispose();
  } finally { w.cleanup(); }
});

// --- 9-10: Bench is a human choice, independent of readiness -------------------------------------------------------------------------

test('Virtual-9. Bench persists independently of readiness, and returning readiness does NOT unbench Scout', async () => {
  const w = scoutWorld();
  try {
    const memento = new MemoryMemento();
    const { roster } = await rosterFor(w, { memento });
    w.setCard('alpha');
    await roster.addInstance('scout');
    assert.deepEqual([(await roster.takeOffField('scout')).message, (await roster.takeOffField('scout')).message], ['Scout is on the bench.', 'Scout is already on the bench.']);
    let group = await scoutGroup(roster);
    assert.deepEqual([group.fieldState, group.instances[0].onField], ['on-bench', false]);
    assert.equal(scoutCapability(roster), undefined, 'a benched Player is never routable');
    assert.equal(roster.isVirtualOnField('scout'), false);

    w.clearCards();
    assert.equal((await scoutGroup(roster)).fieldState, 'on-bench', 'losing readiness does not change the bench');
    w.setCard('beta');
    assert.equal((await scoutGroup(roster)).fieldState, 'on-bench', 'returning readiness does not unbench (10)');
    assert.equal(scoutCapability(roster), undefined);
    roster.dispose();

    const restarted = await rosterFor(w, { memento: new MemoryMemento(memento.snapshot()) });
    assert.equal((await scoutGroup(restarted.roster)).fieldState, 'on-bench', 'the bench survives a restart');
    assert.equal((await restarted.roster.putInstanceOnField('scout')).message, 'Scout is on field.');
    assert.equal(scoutCapability(restarted.roster).state, 'ready');
    restarted.roster.dispose();
  } finally { w.cleanup(); }
});

// --- 11-12: Remove ends membership and nothing else -----------------------------------------------------------------------------------

test('Virtual-11. Remove ends MEMBERSHIP only: Scout Intelligence, evidence, credentials and consent are untouched; Scout can be recruited again', async () => {
  const w = scoutWorld();
  try {
    const memento = new MemoryMemento();
    await memento.update(CONSENT_KEY, { state: 'authorized', decidedAt: '2026-09-19T12:00:00.000Z' });
    const secrets = new Map([['sidelineCoach.scout.openrouterApiKey', 'sk-or-do-not-touch']]);
    w.setCard('alpha');
    fs.mkdirSync(path.join(w.scoutRoot, 'Formations', 'Scout-Formation__x'), { recursive: true });
    fs.writeFileSync(path.join(w.scoutRoot, 'Formations', 'Scout-Formation__x', 'FORMATION-RESULT.md'), '# a parent report\n');
    const { roster } = await rosterFor(w, { memento });
    await roster.addInstance('scout');

    const before = { scout: tree(w.scoutRoot), game: tree(w.gameRoot), consent: memento.data.get(CONSENT_KEY), secret: secrets.get('sidelineCoach.scout.openrouterApiKey') };
    const removed = await roster.removePlayer('scout');
    assert.deepEqual([removed.success, removed.message], [true, 'Scout was removed from this Game.']);
    assert.equal(await scoutGroup(roster), undefined, 'off the Team');
    assert.equal(scoutCapability(roster), undefined);
    assert.deepEqual(tree(w.scoutRoot), before.scout, 'scorecards, run evidence and Formation reports are byte-identical');
    assert.deepEqual(tree(w.gameRoot), before.game);
    assert.equal(memento.data.get(CONSENT_KEY), before.consent, 'bootstrap consent untouched');
    assert.equal(secrets.get('sidelineCoach.scout.openrouterApiKey'), before.secret, 'the credential is not this seam\'s to touch');
    assert.deepEqual([...memento.data.keys()].filter((k) => !k.includes('irtualMembership') && k !== CONSENT_KEY), [], 'the only state that moved is membership');
    assert.equal((await roster.removePlayer('scout')).success, false, 'removing a non-member is a truthful no-op');

    // Recruit again (12): the human's choice, with nothing lost.
    assert.equal((await roster.addInstance('scout')).success, true);
    assert.equal((await scoutGroup(roster)).fieldState, 'on-field');
    assert.equal(scoutCapability(roster).state, 'ready');
    roster.dispose();
  } finally { w.cleanup(); }
});

// --- compatibility adoption --------------------------------------------------------------------------------------------------------------

test('Virtual-12. COMPATIBILITY: a Scout that was already visible is adopted once; a fresh install is never auto-recruited; a removed Scout stays removed', async () => {
  const w = scoutWorld();
  try {
    // (a) An existing user: READY receivers at first registration -> recruited On Field, once.
    w.setCard('alpha');
    const memento = new MemoryMemento();
    const existing = await rosterFor(w, { memento });
    assert.equal((await scoutGroup(existing.roster)).fieldState, 'on-field', 'a currently visible Scout is not silently dropped');
    assert.equal(JSON.parse(memento.data.get(VIRTUAL_MEMBERSHIP_KEY)).compatibilityChecked, true);

    // (c) The human removes it. It must never come back on its own, even after a restart with READY receivers.
    await existing.roster.removePlayer('scout');
    existing.roster.dispose();
    const restarted = await rosterFor(w, { memento: new MemoryMemento(memento.snapshot()) });
    assert.equal(await scoutGroup(restarted.roster), undefined, 'human removal is respected');
    restarted.roster.dispose();

    // (b) A fresh install: nothing READY at first registration, so nothing is adopted; finishing tryouts later does not recruit.
    const w2 = scoutWorld();
    try {
      const freshMemento = new MemoryMemento();
      const fresh = await rosterFor(w2, { memento: freshMemento });
      assert.equal(await scoutGroup(fresh.roster), undefined);
      assert.equal(JSON.parse(freshMemento.data.get(VIRTUAL_MEMBERSHIP_KEY)).compatibilityChecked, true, 'the one-time check is recorded');
      w2.setCard('alpha'); // Slice 4's tryouts finish
      fresh.roster.notifyVirtualReadinessChanged();
      assert.equal(await scoutGroup(fresh.roster), undefined, 'finishing tryouts never recruits Scout');
      fresh.roster.dispose();
      const relaunched = await rosterFor(w2, { memento: new MemoryMemento(freshMemento.snapshot()) });
      assert.equal(await scoutGroup(relaunched.roster), undefined, 'and neither does the next activation');
      relaunched.roster.dispose();
    } finally { w2.cleanup(); }

    // (d) Not entitled at first registration: the check waits for a later activation.
    const w3 = scoutWorld();
    try {
      w3.flags.entitled = false; w3.setCard('alpha');
      const m3 = new MemoryMemento();
      const off = await rosterFor(w3, { memento: m3 });
      assert.equal(m3.data.has(VIRTUAL_MEMBERSHIP_KEY), false, 'nothing recorded while Scout is turned off');
      off.roster.dispose();
    } finally { w3.cleanup(); }
  } finally { w.cleanup(); }
});

test('Virtual-12b. The membership store rejects malformed persisted values instead of trusting them', () => {
  const store = (value) => new VirtualMembershipStore({ get: () => value, update: async () => {} });
  assert.deepEqual(store(undefined).list(), []);
  assert.deepEqual(store({ version: 2, members: { scout: { playerType: 'scout', onField: true, recruitedAt: 'x' } } }).list(), []);
  assert.deepEqual(store({ version: 1, members: null }).list(), []);
  assert.deepEqual(store({ version: 1, compatibilityChecked: 'yes', members: { scout: { playerType: 'scout', onField: 'true', recruitedAt: 'x' }, claude: { playerType: 'claude', onField: true, recruitedAt: 'x' } } }).list(), [], 'wrong types and unknown virtual types are dropped');
  assert.equal(store({ version: 1, compatibilityChecked: 'yes', members: {} }).compatibilityChecked(), false, 'only a real `true` counts as checked');
});

// --- 13: an unacknowledged report survives readiness loss ---------------------------------------------------------------------------------

test('Virtual-13. An unacknowledged Scout report survives readiness loss: the member and its Report-ready stay through the real Control Plane', async () => {
  const w = scoutWorld();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-virtual-daemon-'));
  const daemon = new ControlPlaneDaemon({ dir, port: 40800 + Math.floor(Math.random() * 400), idleTimeoutMs: 60_000 });
  try {
    await daemon.start();
    const { roster } = await rosterFor(w);
    w.setCard('alpha');
    await roster.addInstance('scout');
    const socket = { readyState: 1, send() {}, close() {} };
    daemon.registryInstance.registerSession({
      instanceId: 'session-a', stadiumId: 'stadium-a', name: 'Windows', platform: 'win32', socket, lastHeartbeat: Date.now(),
      game: { gameId: GAME_A, displayName: 'Trend', fingerprintSource: 'test' }, rootFsPath: w.gameRoot,
      roster: await roster.status(GAME_A), capabilities: roster.getRoutingCapabilities(GAME_A), reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
    });

    // A finished Formation with an unacknowledged parent report, linked to the Play by explicit provenance.
    const reportPath = path.join(w.scoutRoot, 'Formations', 'Scout-Formation__x', 'FORMATION-RESULT.md');
    const ledger = daemon.ledgerInstance;
    ledger.recordDispatch({ gameId: GAME_A, playerInstanceId: 'scout', playerType: 'scout', clientRef: 'play_1', at: 1 });
    ledger.recordDelivery('play_1', 'received', { turnRef: 't1' });
    ledger.recordTurn(GAME_A, { instanceId: 'scout', turnRef: 't1', state: 'started' });
    ledger.recordTurn(GAME_A, { instanceId: 'scout', turnRef: 't1', state: 'completed' });
    ledger.recordReports(GAME_A, [{ path: reportPath, filename: 'FORMATION-RESULT.md', mtime: Date.now(), provenance: { gameId: GAME_A, clientRef: 'play_1', playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation' } }]);

    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const statusNow = async () => (await (await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json());
    const before = (await statusNow()).execution.byInstance.scout;
    assert.deepEqual([before.state, before.executionType, before.report?.acknowledged], ['finished', 'scout-formation', false]);

    // Readiness is lost: the depth chart empties and the Stadium republishes its roster and capabilities.
    w.clearCards();
    daemon.registryInstance.updateRoster('session-a', await roster.status(GAME_A));
    daemon.registryInstance.updateCapabilities('session-a', roster.getRoutingCapabilities(GAME_A));
    await settle();
    const status = await statusNow();
    const after = status.execution.byInstance.scout;
    assert.deepEqual([after.state, after.report?.path, after.report?.acknowledged], ['finished', reportPath, false], 'Report ready is still there');
    assert.ok(ledger.get(GAME_A, 'scout'), 'the Ledger entry was not garbage-collected');
    const card = status.players.find((p) => p.id === 'scout');
    assert.equal(card.instances[0].readinessLabel, 'No Scouts ready yet', 'and the card says why Scout cannot run');
    assert.equal(status.routing.capabilities.find((c) => c.instanceId === 'scout').state, 'unavailable');

    // A capability WITHOUT membership no longer conjures a card or an execution view (the synthetic path is gone).
    daemon.registryInstance.updateRoster('session-a', []);
    await settle();
    assert.equal((await statusNow()).execution.byInstance.scout, undefined);
    roster.dispose();
  } finally { await daemon.stop(); fs.rmSync(dir, { recursive: true, force: true }); w.cleanup(); }
});

// --- 14-15: execution is unchanged ---------------------------------------------------------------------------------------------------------

function readyReport(label) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee package.json.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\npackage.json\n# Recommended next step\nNone.\n# Provenance\npackage.json\n`;
}
const fakeReceiver = (id) => ({
  id, player: `Player-${id}`, provider: `Provider-${id}`, eligible: () => ({ eligible: true, reason: 'fixture' }),
  createExecutor: () => ({ id, player: `Player-${id}`, harness: 'fixture', provider: `Provider-${id}`,
    async execute() { return { state: 'COMPLETE', stdout: readyReport(id), stderr: '', model: `m-${id}`, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), exitCode: 0, signal: null, readOnlyContractHeld: true }; } })
});

test('Virtual-14. Scout execution still runs through the existing adapter and Formation path, with the Game only as the target', async () => {
  const w = scoutWorld();
  try {
    const seen = [];
    const adapter = w.adapter({
      candidates: [fakeReceiver('one')],
      runFormation: async (request) => { seen.push(request); return { outcome: 'COMPLETE', formationId: 'F1', resultPath: 'x', scoutsRequested: 1, scoutsCompleted: 1, endedAt: new Date().toISOString() }; }
    });
    const { roster } = await rosterFor(w, { adapter });
    await roster.addInstance('scout');
    const result = await adapter.execute('Investigate the fixture.', w.gameRoot, { reportAttribution: { gameId: GAME_A, clientRef: 'play_x' } });
    assert.equal(result.outcome, 'COMPLETE');
    assert.equal(seen.length, 1, 'one call into the existing Formation engine');
    assert.equal(seen[0].gameRoot, path.resolve(w.gameRoot), 'the Game is the reconnaissance target');
    assert.equal(seen[0].durableReportRoot, w.scoutRoot, 'the canonical Scout Intelligence root');
    assert.ok(!('workspaceRoot' in seen[0]) || seen[0].workspaceRoot === undefined, 'no Game-derived workspace');
    assert.deepEqual(seen[0].reportAttribution, { gameId: GAME_A, clientRef: 'play_x' });
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-15. END TO END: a member Scout runs a real Formation through the Stadium and publishes exactly ONE Dad-facing parent report', async () => {
  const w = scoutWorld();
  try {
    const adapter = w.adapter({ candidates: [fakeReceiver('one'), fakeReceiver('two')] });
    const { roster } = await rosterFor(w, { adapter });
    await roster.addInstance('scout');
    const frames = [];
    const client = new StadiumClient({
      autoReconnect: false, gameContextGetter: context(GAME_A, w.gameRoot), scoutPlayer: adapter, playerRoster: roster,
      reportsGetter: async () => []
    });
    client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
    client.connected = true;
    await client.deliverScout({ clientRef: 'play_e2e', stadiumId: client.stadiumId, gameId: GAME_A, playerInstanceId: 'scout', prompt: 'Investigate the bounded fixture surface.' });

    const terminal = frames.filter((f) => f.method === 'turn.changed').map((f) => f.params.turn).find((t) => t.formationId);
    assert.ok(terminal, 'the Formation completed');
    const published = frames.filter((f) => f.method === 'report.changed').at(-1).params.reports;
    const parents = published.filter((r) => r.filename === 'FORMATION-RESULT.md');
    assert.equal(parents.length, 1, 'one Dad-facing parent');
    assert.equal(published.filter((r) => r.path.endsWith('-SCOUT-REPORT.md')).length, 0, 'receiver reports stay supporting evidence');
    assert.equal(parents[0].provenance.playerInstanceId, 'scout');
    assert.equal(fs.existsSync(path.join(w.gameRoot, 'Scouts')), false, 'and nothing was written into the Game');
    // The roster card is refreshed when a Formation starts and ends.
    await settle();
    assert.ok(frames.filter((f) => f.method === 'roster.changed' || f.method === 'roster.snapshot').length >= 2);
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-15b. A routed dispatch to a Scout that is not On Field in THIS Game is refused at the Stadium; the Dev Mode operator is not', async () => {
  const w = scoutWorld();
  try {
    w.setCard('alpha');
    const adapter = w.adapter({ candidates: [fakeReceiver('one')] });
    const { roster } = await rosterFor(w, { adapter });
    await roster.takeOffField('scout');
    const frames = [];
    const client = new StadiumClient({ autoReconnect: false, gameContextGetter: context(GAME_A, w.gameRoot), scoutPlayer: adapter, playerRoster: roster, reportsGetter: async () => [] });
    client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
    client.connected = true;
    await client.deliverScout({ clientRef: 'benched', stadiumId: client.stadiumId, gameId: GAME_A, playerInstanceId: 'scout', prompt: 'Investigate.' });
    const rejected = frames.find((f) => f.method === 'dispatch.rejected');
    assert.ok(rejected, 'refused');
    assert.match(rejected.params.error.message, /not on this Game.s field/);
    assert.equal(frames.some((f) => f.method === 'dispatch.accepted'), false);

    frames.length = 0;
    await client.deliverScout({ clientRef: 'operator', stadiumId: client.stadiumId, gameId: GAME_A, playerInstanceId: 'scout', prompt: 'Diagnostic.' }, { direct: true });
    assert.ok(frames.some((f) => f.method === 'dispatch.accepted'), 'the diagnostic operator seam is unchanged');
    roster.dispose();
  } finally { w.cleanup(); }
});

// --- 16-18: nothing process-shaped, nothing receiver-shaped ---------------------------------------------------------------------------------

test('Virtual-16. Receiver names never become roster Players, and there is one Scout however many receivers are READY', async () => {
  const w = scoutWorld();
  try {
    for (const id of ['openrouter-qwen', 'openrouter-laguna', 'openrouter-inkling']) w.setCard(id);
    const { roster } = await rosterFor(w);
    await roster.addInstance('scout');
    const groups = await roster.status(GAME_A);
    const virtualGroups = groups.filter((g) => g.virtual);
    assert.equal(virtualGroups.length, 1);
    assert.equal(virtualGroups[0].instances.length, 1);
    const everything = JSON.stringify([groups, roster.getRoutingCapabilities(GAME_A), roster.instances()]);
    for (const receiver of ['qwen', 'laguna', 'inkling', 'openrouter']) assert.ok(!everything.includes(receiver), `${receiver} is internal to Scout`);
    assert.deepEqual(roster.getRoutingCapabilities(GAME_A).map((c) => c.instanceId), ['scout']);
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-17. Ordinary Player lifecycle is unchanged, and independent of Scout membership', async () => {
  const w = scoutWorld();
  try {
    w.setCard('alpha');
    const { roster } = await rosterFor(w);
    const terminal = await roster.addTerminalPlayer();
    assert.equal(terminal.success, true);
    const id = terminal.instanceId;
    assert.match(id, /^terminal-[0-9a-f]{8}$/);
    assert.equal(roster.terminalFor(id)?.name, 'Terminal');

    // Every verb on a process-backed Player behaves exactly as before, whatever Scout is doing.
    await roster.takeOffField('scout'); // Scout benched
    assert.equal((await roster.takeOffField(id)).message, 'Terminal is on the bench.');
    assert.equal((await roster.putInstanceOnField(id)).message, 'Terminal is on field.');
    const terminals = (await roster.status(GAME_A)).find((g) => g.id === 'terminal');
    assert.equal(terminals.instances.length, 1);
    assert.equal(terminals.instances[0].instanceId, id);
    const caps = roster.getRoutingCapabilities(GAME_A);
    assert.ok(caps.some((c) => c.instanceId === id && c.executionType === 'direct-shell'));
    assert.ok(!caps.some((c) => c.instanceId === 'scout'), 'a benched Scout has no capability');
    assert.equal((await roster.removePlayer(id)).success, true);
    assert.equal(roster.terminalFor(id), undefined);
    assert.ok(await scoutGroup(roster), 'and removing Terminal never touches Scout');
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-18. NO fake terminal, PID, executable or process identity is created for Scout', async () => {
  const w = scoutWorld();
  try {
    w.setCard('alpha');
    const { roster } = await rosterFor(w);
    await roster.addInstance('scout');
    assert.equal(vscodeStub.window.terminals.length, 0, 'no terminal was created');
    assert.deepEqual(roster.instances(), [], 'the process-seat book (PlayerInstanceBook) holds nothing for Scout');
    assert.equal(roster.terminalFor('scout'), undefined);
    assert.equal(getPlayerAdapter('scout'), undefined, 'no process-backed adapter entry was invented');
    assert.ok(!PLAYER_ADAPTERS.some((a) => a.id === 'scout' || /scout/i.test(a.command)));
    const instance = (await scoutGroup(roster)).instances[0];
    for (const forbidden of ['ownership', 'controlState', 'controlMode', 'shellPid', 'processId', 'terminalName', 'command', 'stateMessage']) {
      assert.ok(!(forbidden in instance), `${forbidden} does not exist for a virtual Player`);
    }
    assert.equal(instance.virtual, true);
    const provenance = [...(roster.workspaceState?.data?.keys?.() ?? [])].filter((k) => k.includes('playerProvenance'));
    assert.equal(provenance.length, 0, 'no shell provenance record');
    roster.dispose();
  } finally { w.cleanup(); }
});

test('Virtual-18b. The unavailable capability is unavailable in EVERY dimension routing checks', () => {
  const player = { instanceId: 'scout', playerType: 'scout', displayName: 'Scout', executionType: 'scout-formation' };
  const capability = unavailableVirtualCapability(player, { state: 'unavailable', label: 'No Scouts ready yet' }, 42);
  assert.deepEqual(
    [capability.state, capability.capability.freshness, capability.autoEligible, capability.supportsQueue, capability.capability.models.length, capability.transportLabel, capability.capability.observedAt],
    ['unavailable', 'unavailable', false, false, 0, 'No Scouts ready yet', 42]
  );
});

// --- S31 F6: an in-flight Formation is never erased by its own suspension ---------------------------------------------------------------------

test('Virtual-19. A Formation in flight stays "busy" even if its last READY receiver is suspended mid-run', async () => {
  const w = scoutWorld();
  try {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    w.setCard('alpha');
    const adapter = w.adapter({
      runFormation: async () => { w.clearCards(); await gate; return { outcome: 'COMPLETE', formationId: 'F', resultPath: 'x', scoutsRequested: 1, scoutsCompleted: 1, endedAt: new Date().toISOString() }; }
    });
    const running = adapter.execute('Investigate.', w.gameRoot);
    await settle();
    assert.equal(adapter.availability(w.gameRoot).eligibleIds.length, 0, 'the run itself suspended the only READY receiver');
    assert.equal(adapter.capability(w.gameRoot)?.state, 'busy', 'F6: Scout does not vanish mid-run');
    assert.deepEqual(adapter.readiness(w.gameRoot), { state: 'busy', label: 'Scouting' });
    release();
    await running;
    assert.equal(adapter.capability(w.gameRoot), undefined, 'afterwards the empty depth chart is the truth, and the roster keeps Scout as unavailable');
    assert.equal(adapter.readiness(w.gameRoot).label, 'No Scouts ready yet');
  } finally { w.cleanup(); }
});

// --- 20: the browser no longer infers membership ---------------------------------------------------------------------------------------------------

test('Virtual-20. Source contract: the synthetic Scout card is gone, the Stadium injects nothing, and every seam names the model', () => {
  const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
  const html = read('src', 'public', 'index.html');
  assert.doesNotMatch(html, /const scoutCapability = /);
  assert.doesNotMatch(html, /SCOUT_INSTANCE_ID/);
  const stadium = read('src', 'stadium-client.ts');
  assert.doesNotMatch(stadium, /scoutPlayer\?\.capability\(ctx\.binding\.rootFsPath\);\s*\n\s*if \(scout\) capabilities\.push/, 'the capability-snapshot injection is removed');
  const daemon = read('src', 'control-plane', 'daemon.ts');
  assert.doesNotMatch(daemon, /Scout is intentionally not roster-native yet/);
  assert.doesNotMatch(daemon, /Logical Players such as Scout are deliberately absent/);
  const player = read('src', 'virtual-player.ts');
  assert.match(player, /BREADCRUMB — Virtual Player membership seam\./);
  for (const marker of ['WAS:', 'IS:', 'WHY:', 'WILL BE:']) assert.ok(player.includes(marker), marker);
  const roster = read('src', 'player-roster.ts');
  assert.match(roster, /ONE-TIME COMPATIBILITY ADOPTION/);
  // Process-seat machinery is untouched: the book and adapter list know nothing about Scout.
  assert.doesNotMatch(read('src', 'player-instances.ts'), /scout/i);
  assert.doesNotMatch(read('src', 'player-adapters.ts').replace(/\/\*[\s\S]*?\*\//g, ''), /id: 'scout'/);
  // Nothing outside the roster's own seam decides membership: bootstrap and Formation never recruit.
  for (const file of ['scout-bootstrap.ts', 'scout-formation.ts', 'scout-combine.ts', 'scout-coach-refresh.ts']) {
    assert.doesNotMatch(read('src', file), /registerVirtualPlayer|VirtualMembershipStore|virtualMembership/i, `${file} never touches membership`);
  }
});
