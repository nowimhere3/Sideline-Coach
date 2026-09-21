import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { analyzeScoutNeed } from '../out/play-analyzer.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';

const GAME = 'game_auto_scout';
const policies = createRoutingPolicies();

function model(provider, id = `${provider}-model`) {
  return { provider, authenticated: true, observedAt: 1, freshness: 'live', models: [
    { id, displayName: id, isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ] };
}

function player(instanceId, playerType, overrides = {}) {
  return {
    instanceId,
    playerType,
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: playerType === 'antigravity' ? 'AntiGravity' : playerType[0].toUpperCase() + playerType.slice(1),
    state: 'ready',
    capability: model(playerType),
    ...overrides
  };
}

const codex = () => player('codex-11111111', 'codex');
const claude = () => player('claude-11111111', 'claude');
const antigravity = () => player('antigravity-11111111', 'antigravity');
const scout = (overrides = {}) => player('scout', 'scout', {
  fieldLabel: 'Scout',
  capability: { provider: 'scout', authenticated: true, observedAt: 1, freshness: 'live', models: [] },
  executionType: 'scout-formation',
  autoEligible: false,
  supportsQueue: false,
  ...overrides
});

function context(candidates) {
  return {
    ledger: [], reports: [],
    names: new Map(candidates.map((candidate) => [candidate.instanceId, candidate.fieldLabel])),
    rosterInstanceIds: new Set(candidates.map((candidate) => candidate.instanceId)),
    queuedCounts: new Map()
  };
}

function route(prompt, candidates = [codex(), claude(), antigravity(), scout()]) {
  return computeContextAwareRoute(GAME, prompt, candidates, policies, context(candidates));
}

const RECON_PLAY = 'Investigate which subsystem owns Scout report acknowledgement. Compare multiple current architecture seams before changing anything, and gather evidence first.';

test('AUTO selects the canonical Scout target for an explicit bounded reconnaissance-first Play', () => {
  const result = route(RECON_PLAY);
  assert.equal(result.error, undefined);
  assert.equal(result.decision.playerInstanceId, 'scout');
  assert.equal(result.decision.playerLabel, 'Scout');
  assert.equal(result.decision.provider, 'scout');
  assert.equal(result.decision.model, undefined);
  assert.equal(result.decision.modelDisplayName, 'Scout Formation');
  assert.equal(result.decision.mode, 'auto');
  assert.equal(result.decision.scoutNeed.scoutAvailable, true);
  assert.equal(result.decision.scoutNeed.reconnaissancePrimary, true);
  assert.equal(result.decision.scoutNeed.materialEvidenceGap, true);
  assert.equal(result.decision.scoutNeed.actionBlockedByUncertainty, true);
  assert.equal(result.decision.scoutNeed.boundedParallelReconUseful, true);
  assert.match(result.decision.reason, /best first Player/);
  assert.match(result.decision.summary, /Reconnaissance should happen before/);
});

test('the classifier is explainable: material uncertainty and before-action evidence contribute without a magic score', () => {
  const analysis = analyzeScoutNeed('Inspect current repo truth to determine which implementation owns dispatch before modifying it.');
  assert.deepEqual({
    reconnaissancePrimary: analysis.reconnaissancePrimary,
    materialEvidenceGap: analysis.materialEvidenceGap,
    actionBlockedByUncertainty: analysis.actionBlockedByUncertainty,
    shouldUseScout: analysis.shouldUseScout
  }, {
    reconnaissancePrimary: true,
    materialEvidenceGap: true,
    actionBlockedByUncertainty: true,
    shouldUseScout: true
  });
  assert.match(analysis.reason, /ownership is unresolved|requires evidence before action/i);
  assert.equal('score' in analysis, false);
});

test('normal implementation and known hard architecture work are not diverted to Scout', () => {
  const normal = route('Implement the known adapter in src/example.ts and update its focused tests.').decision;
  assert.equal(normal.playerInstanceId, 'codex-11111111');

  const hard = route('Implement the approved architecture for the work ledger migration. Preserve all invariants, update the daemon, and run the full regression suite.').decision;
  assert.notEqual(hard.playerInstanceId, 'scout');
  assert.equal(hard.playerInstanceId, 'claude-11111111', 'existing hard-architecture preference remains unchanged');

  assert.equal(analyzeScoutNeed('Find and fix the known typo in the Player label.').shouldUseScout, false);
  assert.equal(analyzeScoutNeed('Design a difficult architecture for the next release.').shouldUseScout, false);
  assert.equal(analyzeScoutNeed('Do not scout this. Implement the approved change before modifying tests.').shouldUseScout, false);
});

test('explicit human Player intent outranks Scout detection, including explicit Scout using the same target', () => {
  for (const [name, id] of [['Claude', 'claude-11111111'], ['Codex', 'codex-11111111'], ['AntiGravity', 'antigravity-11111111']]) {
    const decision = route(`PLAYER: ${name}\n${RECON_PLAY}`).decision;
    assert.equal(decision.playerInstanceId, id);
    assert.deepEqual(decision.constraints.recognized, ['player']);
  }
  const explicitScout = route(`PLAYER: Scout\n${RECON_PLAY}`).decision;
  assert.equal(explicitScout.playerInstanceId, 'scout');
  assert.equal(explicitScout.provider, 'scout');
  assert.deepEqual(explicitScout.constraints.recognized, ['player']);
});

test('unavailable, disabled, busy, or receiver-less Scout falls through to existing AUTO without refresh or substitution claims', () => {
  const baselines = [
    [codex(), claude()],
    [codex(), claude(), scout({ state: 'busy' })],
    [codex(), claude(), scout({ state: 'unavailable' })],
    [codex(), claude(), scout({ capability: { ...scout().capability, freshness: 'unavailable' } })]
  ];
  for (const candidates of baselines) {
    const result = route(RECON_PLAY, candidates);
    assert.equal(result.error, undefined);
    assert.equal(result.decision.playerInstanceId, 'claude-11111111');
    assert.notEqual(result.decision.provider, 'scout');
  }
});

test('non-Scout AUTO behavior is byte-for-byte stable in target/model/effort when Scout is present', () => {
  for (const prompt of [
    'Implement the bounded feature and tests.',
    'Design the approved architecture for the migration.',
    'Check the current version.'
  ]) {
    const without = computeAutoRoute(GAME, prompt, [codex(), claude(), antigravity()], policies).decision;
    const withScout = computeAutoRoute(GAME, prompt, [codex(), claude(), antigravity(), scout()], policies).decision;
    assert.deepEqual(
      { id: withScout.playerInstanceId, provider: withScout.provider, model: withScout.model, effort: withScout.effort },
      { id: without.playerInstanceId, provider: without.provider, model: without.model, effort: without.effort }
    );
  }
});

test('AUTO and MANUAL dispatch both emit the same canonical Scout target through the ordinary dispatch frame', async () => {
  const frames = [];
  const candidates = [codex(), scout()];
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-session', stadiumId: 'stadium', name: 'Test', platform: 'win32',
    socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
    game: { gameId: GAME, displayName: 'Scout Game', fingerprintSource: 'test' }, rootFsPath: 'C:/ScoutGame',
    roster: [], capabilities: candidates, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
  });
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => context(candidates));

  async function dispatch(options) {
    const pending = router.dispatch({ gameId: GAME, ...options });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = frames.at(-1);
    router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME, playerInstanceId: 'scout', turnRef: `turn-${frames.length}`, acceptedAt: Date.now() });
    return { frame, result: await pending };
  }

  const auto = await dispatch({ routingMode: 'auto', prompt: RECON_PLAY });
  const manual = await dispatch({ routingMode: 'manual', playerInstanceId: 'scout', prompt: RECON_PLAY });
  assert.equal(auto.frame.method, 'dispatch.request');
  assert.equal(auto.frame.params.playerInstanceId, 'scout');
  assert.equal(manual.frame.params.playerInstanceId, 'scout');
  assert.equal(auto.result.decision.mode, 'auto');
  assert.equal(manual.result.decision.mode, 'manual');
});

test('Scout-originated evidence cannot recurse and the decision layer imports no execution/refresh engine', () => {
  const report = `SCOUT FORMATION RESULT\n\n${RECON_PLAY}\n\nThis report is reconnaissance, not final architectural authority.`;
  const analysis = analyzeScoutNeed(report);
  assert.equal(analysis.scoutOriginated, true);
  assert.equal(analysis.shouldUseScout, false);
  assert.notEqual(route(report).decision.playerInstanceId, 'scout');

  const policySource = fs.readFileSync(path.resolve('src/routing-policy.ts'), 'utf8');
  const analyzerSource = fs.readFileSync(path.resolve('src/play-analyzer.ts'), 'utf8');
  for (const source of [policySource, analyzerSource]) {
    assert.doesNotMatch(source, /runScoutFormation|runCoachRefresh|runScoutCombine|combineDerivedFormationCandidates/);
  }
});

test('context-aware Scout routing preserves selected report evidence and cannot recurse from Scout-owned context', () => {
  const report = { path: 'REPORTS/Codex/Current-Architecture.md', filename: 'Current-Architecture.md', mtime: 20, gameId: GAME };
  const incomingContext = {
    ...context([codex(), scout()]),
    incomingReportPath: report.path,
    reports: [report]
  };
  const prompted = `Investigate which implementation owns the contradiction in this report before changing anything: ${report.filename}`;
  const handoff = computeContextAwareRoute(GAME, prompted, [codex(), scout()], policies, incomingContext).decision;
  assert.equal(handoff.playerInstanceId, 'scout');
  assert.equal(handoff.context.state, 'unknown');
  assert.equal(handoff.context.reportPath, report.path);
  assert.match(handoff.contextPreamble, /Read this report before proceeding: REPORTS\/Codex\/Current-Architecture\.md/);

  const scoutReport = {
    path: 'REPORTS/Scout Only/Formations/example/FORMATION-RESULT.md',
    filename: 'FORMATION-RESULT.md',
    mtime: 30,
    gameId: GAME,
    provenance: { playerInstanceId: 'scout', gameId: GAME }
  };
  const scoutLedger = {
    gameId: GAME,
    playerInstanceId: 'scout',
    playerType: 'scout',
    workState: 'ready',
    reports: [{ path: scoutReport.path }],
    recentPlays: []
  };
  const recursiveContext = {
    ...context([codex(), scout()]),
    incomingReportPath: scoutReport.path,
    reports: [scoutReport],
    ledger: [scoutLedger]
  };
  const next = computeContextAwareRoute(
    GAME,
    `Investigate which implementation owns the contradiction in this report before changing anything: ${scoutReport.filename}`,
    [codex(), scout()],
    policies,
    recursiveContext
  ).decision;
  assert.notEqual(next.playerInstanceId, 'scout');
});
