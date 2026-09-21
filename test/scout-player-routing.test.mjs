import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ScoutPlayerAdapter, SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';

const GAME = 'game_scout_player';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-scout-player-'));
  const gameRoot = path.join(root, 'External Game');
  const extensionRoot = path.join(root, 'SidelineCoach');
  const durableReportRoot = path.join(extensionRoot, 'REPORTS', 'Scout Only');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(durableReportRoot, 'Combine', 'Scorecards'), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'proof.ts'), 'export const scoutProof = true;\n');
  return { root, gameRoot, extensionRoot, durableReportRoot, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report(id) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${id}\n# FACTS\nSee src/proof.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/proof.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
}

function candidate(id, state = 'COMPLETE') {
  return {
    id,
    player: `Dynamic ${id}`,
    provider: `Provider ${id}`,
    eligible() { return { eligible: true, reason: 'fixture READY evidence' }; },
    createExecutor() {
      return {
        id,
        player: `Dynamic ${id}`,
        harness: `harness-${id}`,
        provider: `Provider ${id}`,
        async execute() {
          return state === 'COMPLETE'
            ? { state, stdout: report(id), stderr: '', model: `dynamic-${id}`, startedAt: '2026-09-17T18:00:00.000Z', endedAt: '2026-09-17T18:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true }
            : { state, stdout: '', stderr: 'provider unavailable', exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'Provider boundary fixture.' };
        }
      };
    }
  };
}

function scoutCapability(overrides = {}) {
  return {
    instanceId: SCOUT_PLAYER_INSTANCE_ID,
    playerType: 'scout',
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: 'Scout',
    state: 'ready',
    capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
    executionType: 'scout-formation',
    autoEligible: false,
    supportsQueue: false,
    ...overrides
  };
}

function codexCapability() {
  return {
    instanceId: 'codex-11111111', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready',
    capability: { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', models: [
      { id: 'workhorse', displayName: 'Workhorse', isDefault: true, supportedEfforts: ['medium'], defaultEffort: 'medium' }
    ] }
  };
}

test('Scout capability is optional and derives availability from Formation eligibility rather than a second health store', () => {
  const l = layout();
  try {
    const disabled = new ScoutPlayerAdapter({ enabled: () => false, durableReportRoot: () => l.durableReportRoot, candidates: [candidate('receiver-x')] });
    assert.equal(disabled.capability(l.gameRoot), undefined);

    const unavailable = new ScoutPlayerAdapter({
      durableReportRoot: () => l.durableReportRoot,
      candidates: [{ ...candidate('receiver-y'), eligible: () => ({ eligible: false, reason: 'not READY' }) }]
    });
    assert.equal(unavailable.capability(l.gameRoot), undefined);

    const available = new ScoutPlayerAdapter({ durableReportRoot: () => l.durableReportRoot, candidates: [candidate('receiver-z')] }).capability(l.gameRoot);
    assert.equal(available.instanceId, SCOUT_PLAYER_INSTANCE_ID);
    assert.equal(available.executionType, 'scout-formation');
    assert.equal(available.autoEligible, false);
    assert.deepEqual(available.capability.models, [], 'the logical Player does not hardcode a receiver/model identity');
  } finally { l.cleanup(); }
});

test('external Games use extension-owned Scout evidence while the external Game remains the reconnaissance target', async () => {
  const l = layout();
  const perGameScoutRoot = path.join(l.gameRoot, 'REPORTS', 'Scout Only');
  fs.writeFileSync(path.join(l.durableReportRoot, 'Combine', 'Scorecards', 'canonical-ready.json'), JSON.stringify({
    schemaVersion: 1,
    candidateId: 'canonical-ready',
    provider: 'openrouter',
    model: 'openrouter/example/ready:free',
    displayName: 'Canonical Ready Receiver',
    harness: 'opencode',
    firstSeen: '2026-09-18T00:00:00.000Z',
    lastSeen: '2026-09-18T00:00:00.000Z',
    lastTryoutAt: '2026-09-18T00:00:00.000Z',
    currentStatus: 'READY',
    totals: { starts: 1, completions: 1, failures: 0, providerFailures: 0, rateLimitFailures: 0, authFailures: 0, blocked: 0 },
    routeAttempts: {},
    latestEvidencePaths: [],
    latestObservedRoute: 'openrouter/example/ready:free',
    notes: []
  }));

  let formationRequest;
  const adapter = new ScoutPlayerAdapter({
    durableReportRoot: () => l.durableReportRoot,
    runFormation: async (request) => {
      formationRequest = request;
      return {
        schemaVersion: 1, formationId: 'canonical-root-fixture', objective: request.objective,
        canonicalPlayHash: 'sha256:x', semanticPromptHash: 'sha256:y', gameRoot: request.gameRoot,
        workspacePath: path.join(request.gameRoot, 'Scouts', 'canonical-root-fixture'),
        durablePath: path.join(request.durableReportRoot, 'Formations', 'canonical-root-fixture'),
        maxConcurrency: 1, startedAt: '2026-09-18T00:00:00.000Z', endedAt: '2026-09-18T00:00:01.000Z',
        candidatesConsidered: [], scoutsRequested: 1, scoutsCompleted: 1, scoutsFailed: 0,
        scoutsBlocked: 0, scoutsInterrupted: 0, scoutsUnknown: 0, outcome: 'COMPLETE', attempts: [],
        synthesis: { consensus: '', uniqueFindings: [], contradictions: [], missingEvidence: [], failedScouts: [], recommendedNextStep: '' },
        resultPath: path.join(request.durableReportRoot, 'Formations', 'canonical-root-fixture', 'FORMATION-RESULT.md')
      };
    }
  });

  try {
    assert.equal(fs.existsSync(perGameScoutRoot), false, 'the external Game has no duplicated Scout evidence');
    const capability = adapter.capability(l.gameRoot);
    assert.equal(capability?.instanceId, SCOUT_PLAYER_INSTANCE_ID, 'canonical READY evidence makes Scout available to the external Game');

    const policies = createRoutingPolicies();
    const manualContext = {
      ledger: [], reports: [], names: new Map([[SCOUT_PLAYER_INSTANCE_ID, 'Scout']]),
      rosterInstanceIds: new Set([SCOUT_PLAYER_INSTANCE_ID]), queuedCounts: new Map()
    };
    const manual = computeContextAwareRoute(GAME, 'PLAYER: Scout\nInvestigate the active Game.', [capability], policies, manualContext);
    assert.equal(manual.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, 'MANUAL receives the live Scout capability');

    const auto = computeContextAwareRoute(
      GAME,
      'Investigate which subsystem owns this behavior. Compare current architecture seams before changing anything, and gather evidence first.',
      [codexCapability(), capability],
      policies,
      { ...manualContext, names: new Map([[SCOUT_PLAYER_INSTANCE_ID, 'Scout'], ['codex-11111111', 'Codex']]), rosterInstanceIds: new Set([SCOUT_PLAYER_INSTANCE_ID, 'codex-11111111']) }
    );
    assert.equal(auto.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, 'specialized AUTO receives the live Scout capability');

    await adapter.execute('Inspect the active external Game.', l.gameRoot);
    assert.equal(formationRequest.gameRoot, path.resolve(l.gameRoot), 'the active Game remains the reconnaissance target');
    assert.equal(formationRequest.durableReportRoot, path.resolve(l.durableReportRoot), 'qualification and Formation evidence remain canonical Sideline infrastructure');
    assert.equal(fs.existsSync(perGameScoutRoot), false, 'execution does not require or create per-Game Scout evidence');
  } finally { l.cleanup(); }
});

test('the extension explicitly owns the canonical Scout evidence root instead of deriving it from the active Game', () => {
  const source = fs.readFileSync(path.resolve('src/extension.ts'), 'utf8');
  assert.match(source, /resolveScoutIntelligenceRoot\(\{/);
  assert.match(source, /globalStorageFsPath: context\.globalStorageUri\.fsPath/);
  assert.match(source, /durableReportRoot: \(\) => scoutDurableReportRoot/);
});

test('the Scout adapter invokes the existing Formation engine, preserves PARTIAL, isolates a provider failure, and does not write Combine scorecards', async () => {
  const l = layout();
  const scorecard = path.join(l.durableReportRoot, 'Combine', 'Scorecards', 'authority.json');
  fs.writeFileSync(scorecard, '{"ownedBy":"Combine"}\n');
  try {
    const adapter = new ScoutPlayerAdapter({
      durableReportRoot: () => l.durableReportRoot,
      candidates: [candidate('receiver-a', 'FAILED'), candidate('receiver-b')],
      formationSize: 2
    });
    const result = await adapter.execute('Inspect src/proof.ts and return bounded evidence.', l.gameRoot);
    assert.equal(result.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
    assert.equal(result.outcome, 'PARTIAL');
    assert.equal(result.formation.scoutsCompleted, 1);
    assert.equal(result.formation.scoutsFailed, 1);
    assert.ok(fs.existsSync(result.formation.resultPath));
    assert.equal(fs.readFileSync(scorecard, 'utf8'), '{"ownedBy":"Combine"}\n');
  } finally { l.cleanup(); }
});

test('an explicit READY receiver stays on the existing Formation path and keeps the trusted credential resolver ephemeral', async () => {
  const l = layout();
  let request;
  let selected;
  let resolverCalls = 0;
  try {
    const adapter = new ScoutPlayerAdapter({
      durableReportRoot: () => l.durableReportRoot,
      candidates: [candidate('receiver-a'), candidate('receiver-b')],
      resolveOpenRouterApiKey: async () => { resolverCalls += 1; return 'ephemeral-test-secret'; },
      runFormation: async (value) => {
        request = value;
        value.onSelected?.({ count: value.players.length, candidateIds: value.players });
        assert.equal(await value.resolveOpenRouterApiKey(), 'ephemeral-test-secret');
        return {
          formationId: 'explicit-one', objective: value.objective, gameRoot: value.gameRoot,
          formationDir: l.durableReportRoot, resultPath: path.join(l.durableReportRoot, 'FORMATION-RESULT.md'),
          requestedPlayers: [...value.players], selectedPlayers: [...value.players], attempts: [],
          scoutsRequested: 1, scoutsCompleted: 1, scoutsFailed: 0, scoutsBlocked: 0,
          scoutsInterrupted: 0, scoutsUnknown: 0, outcome: 'COMPLETE',
          consensus: [], uniqueFindings: [], contradictions: [], missingEvidence: [], failedScouts: [],
          recommendedNextStep: 'Done.', startedAt: '2026-09-18T12:00:00.000Z', endedAt: '2026-09-18T12:00:01.000Z'
        };
      }
    });
    const result = await adapter.execute('Read only.', l.gameRoot, {
      players: ['receiver-b'],
      onSelected: (info) => { selected = info; }
    });
    assert.equal(result.outcome, 'COMPLETE');
    assert.deepEqual(request.players, ['receiver-b']);
    assert.deepEqual(selected, { count: 1, candidateIds: ['receiver-b'] });
    assert.equal(resolverCalls, 1);
    assert.equal(JSON.stringify(result).includes('ephemeral-test-secret'), false);
  } finally { l.cleanup(); }
});

test('unconstrained AUTO leaves existing routing unchanged while explicit PLAYER: Scout uses the one canonical Scout target', () => {
  const policies = createRoutingPolicies();
  const codex = codexCapability();
  const scout = scoutCapability();
  assert.equal(computeAutoRoute(GAME, 'Implement the fix.', [codex, scout], policies).decision.playerInstanceId, codex.instanceId);
  assert.match(computeAutoRoute(GAME, 'Investigate.', [scout], policies).error, /Choose Scout in Manual/);

  const context = { ledger: [], reports: [], names: new Map([[codex.instanceId, 'Codex'], [scout.instanceId, 'Scout']]), rosterInstanceIds: new Set([codex.instanceId, scout.instanceId]), queuedCounts: new Map() };
  const explicit = computeContextAwareRoute(GAME, 'PLAYER: Scout\nInvestigate current architecture evidence.', [codex, scout], policies, context);
  assert.equal(explicit.error, undefined);
  assert.equal(explicit.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(explicit.decision.provider, 'scout');
  assert.equal(explicit.decision.model, undefined);
  assert.match(explicit.decision.summary, /selected as you asked/i);

  const unavailable = computeContextAwareRoute(GAME, 'PLAYER: Scout\nInvestigate first.', [codex], policies, context);
  assert.equal(unavailable.decision, undefined);
  assert.match(unavailable.error, /Scout is currently unavailable/);

  const busy = computeContextAwareRoute(GAME, 'PLAYER: Scout\nInvestigate first.', [codex, scoutCapability({ state: 'busy' })], policies, context);
  assert.equal(busy.decision, undefined);
  assert.match(busy.error, /Scout is currently unavailable/);
});

test('an explicit MANUAL Scout dispatch produces a canonical manual decision and the normal dispatch.request frame', async () => {
  const frames = [];
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-session', stadiumId: 'stadium', name: 'Test', platform: 'win32',
    socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
    game: { gameId: GAME, displayName: 'Scout Game', fingerprintSource: 'test' }, rootFsPath: 'C:/ScoutGame',
    roster: [], capabilities: [scoutCapability()], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
  });
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, prompt: 'Gather bounded evidence.' });
  await new Promise((resolve) => setImmediate(resolve));
  const frame = frames.find((entry) => entry.method === 'dispatch.request');
  assert.equal(frame.params.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(frame.params.routingMode, 'manual');
  assert.equal(frame.params.model, undefined);
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME, playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, turnRef: 'scout-turn', acceptedAt: Date.now() });
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.decision.mode, 'manual');
  assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(result.decision.modelDisplayName, 'Scout Formation');
});

test('disabled/unavailable Scout cannot be manually dispatched and Formation outcomes remain distinct in Control Plane evidence', async () => {
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-session', stadiumId: 'stadium', name: 'Test', platform: 'win32',
    socket: { readyState: 1, send() { throw new Error('must not send'); } }, lastHeartbeat: Date.now(),
    game: { gameId: GAME, displayName: 'Scout Game', fingerprintSource: 'test' }, rootFsPath: 'C:/ScoutGame',
    roster: [], capabilities: [codexCapability()], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
  });
  const blocked = await new ControlPlaneRouter(registry).dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, prompt: 'Scout this.' });
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /Scout is unavailable/);

  const ledger = new InstanceWorkLedger(() => 100);
  ledger.recordTurn(GAME, { instanceId: SCOUT_PLAYER_INSTANCE_ID, turnRef: 'partial-turn', state: 'started' });
  ledger.recordTurn(GAME, { instanceId: SCOUT_PLAYER_INSTANCE_ID, turnRef: 'partial-turn', state: 'partial', summary: 'Scout Formation ended PARTIAL.' });
  assert.equal(ledger.forGame(GAME)[0].recentPlays[0].outcome, 'partial');
});

test('the browser manual selector consumes logical routing capabilities, and Scout\'s Team card is an ordinary roster instance (S31 Slice 5), never a synthetic card and never duplicated into the dispatch candidate list', () => {
  const html = fs.readFileSync(path.resolve('src/public/index.html'), 'utf8');
  assert.match(html, /const candidates = routingCapabilities\.length > 0 \? routingCapabilities : instances;/);
  assert.match(html, /const selectedExists = selectedRosterExists \|\| candidates\.some/);
  assert.match(html, /candidate\?\.executionType === 'scout-formation'/);
  // Scout is a roster-native Virtual Player: its Team card is the ordinary roster card for an instance the
  // roster reports, so nothing in the browser synthesizes it from capabilities any more.
  assert.doesNotMatch(html, /const scoutCapability = /, 'the synthetic Scout card block is gone');
  assert.doesNotMatch(html, /SCOUT_INSTANCE_ID/, 'and so is the constant that only it used');
  assert.doesNotMatch(html, /rawInstances[\s\S]{0,400}executionType === 'scout-formation'/, 'Scout is never special-cased while building the roster instance list');
  // The candidate list still comes from capabilities, so a member appears once (the roster card is separate).
  assert.match(html, /const candidates = routingCapabilities\.length > 0 \? routingCapabilities : instances;/);
  // A Virtual Player reports readiness (not a transport), is never offered a second copy, and has its own removal wording.
  assert.match(html, /if \(instance\.virtual\) return instance\.readinessLabel \|\| '';/);
  assert.match(html, /if \(!instance\.singleton && \(!nextInstance/);
  assert.match(html, /if \(instance\.virtual\) \{[\s\S]{0,260}leaves this Game's Team\. Your Scout tryouts, results and reports are kept/);
});
