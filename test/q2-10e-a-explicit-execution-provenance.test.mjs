/** Q2.10E-A — source-side execution provenance for Controlled reports. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import {
  buildReportProvenanceInstruction,
  createControlledExecutionProvenance,
  formatReportProvenance,
  parseReportProvenance
} from '../out/report-provenance.js';

const GAME = 'game_git_trend';
const OTHER_GAME = 'game_git_gs3';
const AG1 = 'antigravity-11111111';
const AG2 = 'antigravity-22222222';
const TERM = 'terminal-11111111';

const antiSnapshot = {
  provider: 'antigravity', authenticated: true, observedAt: Date.now(), freshness: 'live',
  defaultModelId: 'gemini-3.8-flash',
  models: [
    { id: 'claude-opus-4.6-thinking', displayName: 'Claude Opus 4.6 Thinking', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ]
};

function capability(instanceId, overrides = {}) {
  return {
    instanceId,
    playerType: instanceId.split('-')[0],
    transport: 'controlled',
    transportLabel: 'Controlled',
    fieldLabel: 'AntiGravity',
    state: 'ready',
    capability: antiSnapshot,
    ...overrides
  };
}

async function dispatchAndCapture(candidate, options) {
  const frames = [];
  const socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) };
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-1', stadiumId: 'stadium-trend', name: 'Trend', platform: 'win32', socket,
    lastHeartbeat: Date.now(), game: { gameId: GAME, displayName: 'Trend', fingerprintSource: 'git' },
    roster: [], capabilities: [candidate], reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now()
  });
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: candidate.instanceId, ...options });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.ok(frame, 'dispatch frame was sent');
  router.handleDispatchAccepted({
    clientRef: frame.params.clientRef,
    stadiumId: 'stadium-trend', gameId: GAME, playerInstanceId: candidate.instanceId,
    turnRef: `turn-${frame.params.clientRef}`, acceptedAt: Date.now()
  });
  const result = await pending;
  assert.equal(result.success, true);
  return frame;
}

test('Q2.10E-A-1. Controlled dispatch supplies exact Game, Play, instance, provider, model, effort, and timestamp', async () => {
  const frame = await dispatchAndCapture(capability(AG1), {
    prompt: 'Write the implementation report.',
    model: 'claude-opus-4.6-thinking',
    effort: 'high'
  });
  const provenance = parseReportProvenance(frame.params.prompt);
  assert.deepEqual(
    {
      gameId: provenance.gameId,
      clientRef: provenance.clientRef,
      playerInstanceId: provenance.playerInstanceId,
      playerType: provenance.playerType,
      provider: provenance.provider,
      model: provenance.model,
      effort: provenance.effort
    },
    {
      gameId: GAME,
      clientRef: frame.params.clientRef,
      playerInstanceId: AG1,
      playerType: 'antigravity',
      provider: 'antigravity',
      model: 'claude-opus-4.6-thinking',
      effort: 'high'
    }
  );
  assert.equal(Number.isNaN(Date.parse(provenance.at)), false, 'execution timestamp is ISO-8601');
  assert.match(frame.params.prompt, /place the following exact HTML comment near the top/);
  assert.notEqual(provenance.provider, provenance.model, 'execution provider and underlying model stay separate');
});

test('Q2.10E-A-2. Provider Default and unknown effort stay truthful instead of inventing execution facts', async () => {
  const frame = await dispatchAndCapture(capability(AG1), {
    prompt: 'Write a report using provider defaults.', model: 'default', effort: 'default'
  });
  const provenance = parseReportProvenance(frame.params.prompt);
  assert.equal(provenance.model, 'provider-default');
  assert.equal(provenance.effort, undefined);

  const built = createControlledExecutionProvenance({
    gameId: GAME, clientRef: 'ref_default', playerInstanceId: AG1,
    playerType: 'antigravity', provider: 'antigravity', model: undefined, effort: undefined, at: 0
  });
  assert.equal(built.model, 'provider-default');
  assert.equal(built.effort, undefined);
  assert.equal(parseReportProvenance(buildReportProvenanceInstruction(built)).model, 'provider-default');
});

test('Q2.10E-A-3. Terminal remains an exact-command Player and receives no report-provenance prompt plumbing', async () => {
  const terminal = capability(TERM, {
    playerType: 'terminal', transport: 'legacy', transportLabel: 'Terminal', fieldLabel: 'Terminal',
    executionType: 'direct-shell', capability: { provider: 'terminal', authenticated: true, observedAt: 0, freshness: 'unavailable', models: [] }
  });
  const prompt = 'git status --short';
  const frame = await dispatchAndCapture(terminal, { prompt, model: 'should-not-survive', effort: 'high' });
  assert.equal(frame.params.prompt, prompt);
  assert.equal(frame.params.model, undefined);
  assert.equal(frame.params.effort, undefined);
  assert.equal(parseReportProvenance(frame.params.prompt), undefined);
});

test('Q2.10E-A-4. Explicit provenance replaces timing attribution, retains execution facts, and never crosses Games', () => {
  let now = 100;
  const ledger = new InstanceWorkLedger(() => now);
  ledger.observeRoster(GAME, [capability(AG1), capability(AG2)]);
  ledger.recordReports(GAME, []);
  ledger.recordDispatch({ gameId: GAME, playerInstanceId: AG1, playerType: 'antigravity', clientRef: 'ref_timing', at: 100, transport: 'controlled' });
  ledger.recordDelivery('ref_timing', 'received');
  ledger.recordReports(GAME, [{ path: 'Reports/AntiGravity/result.md', filename: 'result.md', mtime: 110 }]);
  assert.equal(ledger.get(GAME, AG1).reports[0].attribution, 'single-active-play');

  const explicit = {
    gameId: GAME, clientRef: 'ref_explicit', playerInstanceId: AG2, playerType: 'antigravity',
    provider: 'antigravity', model: 'claude-opus-4.6-thinking', effort: 'high', at: '2026-09-13T16:00:00.000Z'
  };
  now = 120;
  ledger.recordReports(GAME, [{ path: 'Reports/AntiGravity/result.md', filename: 'result.md', mtime: 110, provenance: explicit }]);
  assert.equal(ledger.get(GAME, AG1).reports.length, 0, 'obsolete timing owner is removed');
  assert.deepEqual(ledger.get(GAME, AG2).reports[0], {
    path: 'Reports/AntiGravity/result.md', filename: 'result.md', mtime: 110,
    attribution: 'explicit-provenance', clientRef: 'ref_explicit', provenance: explicit
  });

  ledger.recordReports(GAME, [{
    path: 'Reports/AntiGravity/foreign.md', filename: 'foreign.md', mtime: 130,
    provenance: { ...explicit, gameId: OTHER_GAME }
  }]);
  assert.equal(ledger.forGame(GAME).some((entry) => entry.reports.some((report) => report.path.endsWith('foreign.md'))), false);
  assert.equal(parseReportProvenance('<!-- sideline-provenance: {malformed} -->'), undefined);
});

test('Q2.10E-A-5. A stamped AntiGravity report gives staged AUTO its exact instance owner without forcing its previous model', () => {
  const provenance = parseReportProvenance(`${formatReportProvenance({
    gameId: GAME, clientRef: 'ref_report', playerInstanceId: AG1, playerType: 'antigravity',
    provider: 'antigravity', model: 'claude-opus-4.6-thinking', effort: 'high', at: '2026-09-13T16:00:00.000Z'
  })}\n# Report`);
  const report = { gameId: GAME, path: 'Reports/AntiGravity/result.md', filename: 'result.md', mtime: 200, provenance };
  const ledger = new InstanceWorkLedger(() => 250);
  ledger.observeRoster(GAME, [capability(AG1), capability(AG2)]);
  ledger.recordReports(GAME, [report]);

  const candidates = [capability(AG2, { work: { workState: 'idle' } }), capability(AG1, { work: { workState: 'idle' } })];
  const { decision, error } = computeContextAwareRoute(
    GAME,
    'Apply the recommendation from that report.',
    candidates,
    createRoutingPolicies(),
    {
      ledger: ledger.forGame(GAME), reports: [report], incomingReportPath: report.path,
      names: new Map([[AG1, 'AntiGravity 1'], [AG2, 'AntiGravity 2']]),
      rosterInstanceIds: new Set([AG1, AG2]), queuedCounts: new Map()
    }
  );
  assert.equal(error, undefined);
  assert.equal(decision.playerInstanceId, AG1);
  assert.equal(decision.context.ownerInstanceId, AG1);
  assert.equal(decision.provider, 'antigravity');
  assert.equal(report.provenance.model, 'claude-opus-4.6-thinking', 'previous model remains context evidence');
  assert.equal(decision.model, 'gemini-3.8-flash', 'current routing policy may choose a different model');
});

test('Q2.10F.4.1. An edited report is instructed to replace old provenance so the current Play can own the same path', () => {
  const current = createControlledExecutionProvenance({
    gameId: GAME, clientRef: 'ref_current', playerInstanceId: AG2,
    playerType: 'antigravity', provider: 'antigravity',
    model: 'claude-opus-4.6-thinking', effort: 'high', at: 300
  });
  const instruction = buildReportProvenanceInstruction(current);
  assert.match(instruction, /creates or updates a Markdown report/i);
  assert.match(instruction, /replace the old comment/i);
  assert.match(instruction, /never retain or add a second marker/i);

  const ledger = new InstanceWorkLedger(() => 400);
  ledger.observeRoster(GAME, [capability(AG1), capability(AG2)]);
  ledger.recordReports(GAME, []);
  ledger.recordDispatch({ gameId: GAME, playerInstanceId: AG2, playerType: 'antigravity', clientRef: 'ref_current', at: 300, transport: 'controlled' });
  ledger.recordDelivery('ref_current', 'received');
  ledger.recordTurn(GAME, { instanceId: AG2, turnRef: 'turn-current', state: 'started', at: 310 });
  ledger.recordTurn(GAME, { instanceId: AG2, turnRef: 'turn-current', state: 'completed', at: 350 });
  ledger.recordReports(GAME, [{
    path: 'REPORTS/Codex/existing.md', filename: 'existing.md', mtime: 360,
    provenance: parseReportProvenance(`${formatReportProvenance(current)}\n# Updated report`)
  }]);
  const entry = ledger.get(GAME, AG2);
  assert.equal(entry.reports[0].path, 'REPORTS/Codex/existing.md');
  assert.equal(entry.reports[0].clientRef, 'ref_current');
  assert.equal(entry.reports[0].attribution, 'explicit-provenance');
});
