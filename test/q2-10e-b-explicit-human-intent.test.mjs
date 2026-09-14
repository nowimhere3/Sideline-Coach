/** Q2.10E-B — explicit human intent constrains AUTO. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recognizeRouteConstraints } from '../out/control-plane/route-constraints.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { PlayQueue, fileQueueStore } from '../out/control-plane/play-queue.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { formatReportProvenance, parseReportProvenance } from '../out/report-provenance.js';

const GAME = 'game_git_trend';
const OTHER_GAME = 'game_git_gs3';
const CODEX1 = 'codex-11111111';
const CODEX2 = 'codex-22222222';
const CLAUDE1 = 'claude-11111111';
const TERMINAL1 = 'terminal-11111111';
const policies = createRoutingPolicies();

const codexSnapshot = {
  provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [
    { id: 'gpt-6-astra', displayName: 'GPT-6 Astra', isDefault: false, supportedEfforts: ['medium', 'high', 'ultra'], defaultEffort: 'high' },
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ]
};
const claudeSnapshot = {
  provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'opus',
  models: [
    { id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    { id: 'sonnet', displayName: 'Sonnet', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ]
};

function cap(instanceId, playerType, snapshot, overrides = {}) {
  return {
    instanceId, playerType, transport: 'controlled', transportLabel: 'Controlled',
    fieldLabel: playerType === 'codex' ? 'Codex' : 'Claude', state: 'ready', capability: snapshot,
    ...overrides
  };
}
const codex1 = (overrides = {}) => cap(CODEX1, 'codex', codexSnapshot, overrides);
const codex2 = (overrides = {}) => cap(CODEX2, 'codex', codexSnapshot, overrides);
const claude1 = (overrides = {}) => cap(CLAUDE1, 'claude', claudeSnapshot, overrides);
const names = new Map([[CODEX1, 'Codex 1'], [CODEX2, 'Codex 2'], [CLAUDE1, 'Claude']]);

const reportProvenance = parseReportProvenance(`${formatReportProvenance({
  gameId: GAME, clientRef: 'ref_arch', playerInstanceId: CLAUDE1, playerType: 'claude',
  provider: 'claude', model: 'opus', effort: 'high', at: '2026-09-13T16:00:00.000Z'
})}\n# Architecture`);
const report = {
  gameId: GAME, path: 'Reports/Claude/Architecture.md', filename: 'Architecture.md', mtime: 2_000,
  provenance: reportProvenance
};

function ledger(ownerState = 'idle') {
  return [
    {
      gameId: GAME, playerInstanceId: CLAUDE1, playerType: 'claude', workState: ownerState,
      currentPlay: ownerState === 'working' ? { clientRef: 'ref_busy', promptSummary: 'Continue architecture', startedAt: 3_000 } : undefined,
      recentPlays: [{ clientRef: 'ref_arch', promptSummary: 'Write the architecture', outcome: 'completed', startedAt: 1_000, finishedAt: 1_900 }],
      reports: [{ path: report.path, filename: report.filename, mtime: report.mtime, attribution: 'explicit-provenance', clientRef: 'ref_arch', provenance: reportProvenance }],
      updatedAt: 2_000
    },
    ...[CODEX1, CODEX2].map((playerInstanceId) => ({ gameId: GAME, playerInstanceId, playerType: 'codex', workState: 'idle', recentPlays: [], reports: [], updatedAt: 1 }))
  ];
}

function route(prompt, candidates = [claude1(), codex1()], overrides = {}) {
  return computeContextAwareRoute(GAME, prompt, candidates, policies, {
    ledger: ledger(), reports: [report], names,
    rosterInstanceIds: new Set([CLAUDE1, CODEX1, CODEX2]), queuedCounts: new Map(),
    incomingReportPath: report.path,
    ...overrides
  });
}

test('Q2.10E-B-1. Explicit Use Codex beats the selected Claude report owner and keeps the report as a handoff', () => {
  const prompt = 'For Stage 1.2, use Codex. Apply the recommendation from that report.';
  const { decision, error } = route(prompt);
  assert.equal(error, undefined);
  assert.equal(decision.playerInstanceId, CODEX1);
  assert.equal(decision.provider, 'codex');
  assert.equal(decision.context.ownerInstanceId, CLAUDE1);
  assert.equal(decision.context.reportPath, report.path);
  assert.equal(decision.action, 'handoff');
  assert.match(decision.contextPreamble, /previously handled by Claude/);
  assert.match(decision.contextPreamble, /Reports\/Claude\/Architecture\.md/);
  assert.match(decision.summary, /selected as you asked/i);
});

test('Q2.10E-B-2. Partial constraints preserve Player, model, and effort independently while AUTO fills omissions', () => {
  const playerOnly = route('Use Codex. Implement the approved architecture.').decision;
  assert.equal(playerOnly.playerInstanceId, CODEX1);
  assert.ok(playerOnly.model, 'AUTO fills the unspecified model');
  assert.ok(playerOnly.effort, 'AUTO fills the unspecified effort');
  assert.deepEqual(playerOnly.constraints.recognized, ['player']);
  assert.match(playerOnly.summary, /Coach chose the model and reasoning/);

  const playerModel = route('Use Codex on GPT-5.6 Sol. Implement the approved architecture.').decision;
  assert.equal(playerModel.playerInstanceId, CODEX1);
  assert.equal(playerModel.model, 'gpt-5.6-sol');
  assert.ok(playerModel.effort, 'AUTO fills the effort within the requested model');
  assert.deepEqual(playerModel.constraints.recognized, ['player', 'model']);
  assert.match(playerModel.summary, /Coach chose the reasoning/);

  const allThree = route('Use Codex on GPT-5.6 Sol, High. Implement the approved architecture.').decision;
  assert.equal(allThree.playerInstanceId, CODEX1);
  assert.equal(allThree.model, 'gpt-5.6-sol');
  assert.equal(allThree.effort, 'high');
  assert.deepEqual(allThree.constraints.recognized, ['player', 'model', 'effort']);
  assert.doesNotMatch(allThree.summary, /Coach chose/);
});

test('Q2.10E-B-3. Recognition is bounded and catalog-backed: ambiguity and nonexistent names never fabricate constraints', () => {
  const candidates = [claude1(), codex1()];
  assert.equal(recognizeRouteConstraints({
    prompt: 'Review how the Codex adapter maps GPT-5.6 Sol identifiers in technical prose.', candidates, ledger: ledger(), names
  }), undefined);
  assert.equal(recognizeRouteConstraints({ prompt: 'Use Unicorn on Imaginary 9.', candidates, ledger: ledger(), names }), undefined);
  const knownPlayerUnknownModel = recognizeRouteConstraints({ prompt: 'Use Codex on Imaginary 9.', candidates, ledger: ledger(), names });
  assert.equal(knownPlayerUnknownModel.playerType, 'codex');
  assert.equal(knownPlayerUnknownModel.model, undefined);
});

test('Q2.10E-B-4. A safe explicit model exclusion narrows AUTO without becoming a provider guess', () => {
  const { decision, error } = route("Whoever you think is best, but don't use Opus.", [claude1()]);
  assert.equal(error, undefined);
  assert.equal(decision.provider, 'claude');
  assert.equal(decision.model, 'sonnet');
  assert.deepEqual(decision.constraints.excludedModels, ['opus']);
  assert.match(decision.summary, /avoided the excluded model as you asked/i);
});

test('Q2.10E-B-5. With no explicit route, exact context ownership still wins normally', () => {
  const { decision } = route('Apply the recommendation from that report.');
  assert.equal(decision.playerInstanceId, CLAUDE1);
  assert.equal(decision.context.ownerInstanceId, CLAUDE1);
  assert.equal(decision.constraints, undefined);
});

test('Q2.10E-B-6. Exact friendly instance intent narrows sibling selection but machine identity stays canonical', () => {
  const constraints = recognizeRouteConstraints({
    prompt: 'Use Codex 2. Implement the fix.', candidates: [codex1(), codex2()], ledger: ledger(), names
  });
  assert.equal(constraints.playerInstanceId, CODEX2);
  const { decision } = route('Use Codex 2. Implement the fix.', [codex1(), codex2()], { incomingReportPath: undefined, reports: [] });
  assert.equal(decision.playerInstanceId, CODEX2);
  assert.equal(decision.playerName, 'Codex 2');
});

test('Q2.10E-B-7. A constrained unavailable Player never silently jumps to an unrelated ready Player', () => {
  const { decision, error } = route('Use Codex. Implement the fix.', [codex1({ state: 'unavailable' }), claude1()]);
  assert.equal(decision, undefined);
  assert.match(error, /Codex is currently unavailable/);
  assert.match(error, /did not choose another Player/);
});

test('Q2.10E-B-8. Terminal remains MANUAL-only even when named explicitly in an AUTO Play', () => {
  const terminal = cap(TERMINAL1, 'terminal', { provider: 'terminal', authenticated: true, observedAt: 0, freshness: 'unavailable', models: [] }, {
    fieldLabel: 'Terminal', transport: 'legacy', executionType: 'direct-shell'
  });
  const result = computeContextAwareRoute(GAME, 'Use Terminal. Run the tests.', [terminal, claude1()], policies, {
    ledger: [...ledger(), { gameId: GAME, playerInstanceId: TERMINAL1, playerType: 'terminal', workState: 'idle', recentPlays: [], reports: [], updatedAt: 1 }],
    reports: [], names: new Map([...names, [TERMINAL1, 'Terminal']]), rosterInstanceIds: new Set([TERMINAL1, CLAUDE1]), queuedCounts: new Map()
  });
  assert.equal(result.decision, undefined);
  assert.match(result.error, /Terminal runs exact commands in Manual/);
});

function routedRegistry(candidates) {
  const frames = [];
  const socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) };
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-1', stadiumId: 'stadium-trend', name: 'Trend', platform: 'win32', socket,
    lastHeartbeat: 1, game: { gameId: GAME, displayName: 'Trend', fingerprintSource: 'git' },
    roster: [], capabilities: candidates, reports: [report], rosterSynchronized: true, rosterSyncedAt: 1
  });
  return { registry, frames };
}

test('Q2.10E-B-9. Staged preview and actual dispatch use one constrained route and deliver the Claude handoff to Codex', async () => {
  const candidates = [claude1(), codex1()];
  const { registry, frames } = routedRegistry(candidates);
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => ({
    ledger: ledger(), reports: [report], names, incomingReportPath: report.path,
    rosterInstanceIds: new Set([CLAUDE1, CODEX1]), queuedCounts: new Map()
  }));
  const prompt = 'For Stage 1.2, use Codex on GPT-5.6 Sol. Apply the recommendation from that report.';
  const preview = router.computeRoute(GAME, prompt, candidates, { incomingReportPath: report.path }).decision;
  const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt, incomingReportPath: report.path });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.ok(frame);
  router.handleDispatchAccepted({
    clientRef: frame.params.clientRef, stadiumId: 'stadium-trend', gameId: GAME,
    playerInstanceId: frame.params.playerInstanceId, turnRef: 'turn-1', acceptedAt: Date.now()
  });
  const actual = (await pending).decision;
  assert.deepEqual(
    { player: actual.playerInstanceId, provider: actual.provider, model: actual.model, effort: actual.effort, action: actual.action, reason: actual.summary },
    { player: preview.playerInstanceId, provider: preview.provider, model: preview.model, effort: preview.effort, action: preview.action, reason: preview.summary }
  );
  assert.equal(frame.params.playerInstanceId, CODEX1);
  assert.equal(frame.params.model, 'gpt-5.6-sol');
  assert.match(frame.params.prompt, /previously handled by Claude/);
  assert.match(frame.params.prompt, /Read this report before proceeding: Reports\/Claude\/Architecture\.md/);
  assert.equal(parseReportProvenance(frame.params.prompt).playerInstanceId, CODEX1, 'Q2.10E-A source provenance remains intact');
});

test('Q2.10E-B-10. Explicit MANUAL target outranks Play wording and is never reparsed as AUTO intent', async () => {
  const { registry, frames } = routedRegistry([claude1(), codex1()]);
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({
    gameId: GAME, routingMode: 'manual', playerInstanceId: CLAUDE1,
    prompt: 'Use Codex on GPT-5.6 Sol. Review this manually on Claude.', model: 'opus', effort: 'high'
  });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.equal(frame.params.playerInstanceId, CLAUDE1);
  assert.equal(frame.params.model, 'opus');
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-trend', gameId: GAME, playerInstanceId: CLAUDE1, acceptedAt: Date.now() });
  assert.equal((await pending).success, true);
});

test('Q2.10E-B-11. Busy constrained target queues durably with exact intent and report handoff; another Game sees none', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-q210eb-'));
  const store = fileQueueStore(path.join(dir, 'play-queue.json'));
  const candidates = [claude1(), codex1({ state: 'busy', work: { workState: 'working' } })];
  const { registry } = routedRegistry(candidates);
  const router = new ControlPlaneRouter(registry);
  const queue = new PlayQueue(store);
  router.setPlayQueue(queue);
  router.setRouteContextProvider(() => ({
    ledger: ledger(), reports: [report], names, incomingReportPath: report.path,
    rosterInstanceIds: new Set([CLAUDE1, CODEX1]), queuedCounts: new Map()
  }));
  const result = await router.dispatch({
    gameId: GAME, routingMode: 'auto', incomingReportPath: report.path,
    prompt: 'Use Codex on GPT-5.6 Sol, High. Apply the recommendation from that report.'
  });
  assert.equal(result.status, 'queued');
  assert.deepEqual({ instance: result.playerInstanceId, name: result.playerName }, { instance: CODEX1, name: 'Codex 1' }, 'AUTO queue acknowledgement names its exact target');
  const item = queue.forGame(GAME)[0];
  assert.equal(item.playerInstanceId, CODEX1);
  assert.equal(item.model, 'gpt-5.6-sol');
  assert.equal(item.effort, 'high');
  assert.deepEqual(item.constraints.recognized, ['player', 'model', 'effort']);
  assert.match(item.context.preamble, /previously handled by Claude/);
  assert.deepEqual(queue.forGame(OTHER_GAME), []);
  const restored = new PlayQueue(store).forGame(GAME)[0];
  assert.deepEqual(restored.constraints, JSON.parse(JSON.stringify(item.constraints)));
  assert.equal(restored.context.preamble, item.context.preamble);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Q2.10E-B.1-1. AGENT / MODEL / THINKING-EFFORT Strategy Board headers normalize into one constraint', () => {
  const constraints = recognizeRouteConstraints({
    prompt: 'ROUTING / CONTEXT\nAGENT: Codex\nMODEL: GPT-5.6 Sol\nTHINKING / EFFORT: Medium\n\nImplement the Play.',
    candidates: [claude1(), codex1()], ledger: ledger(), names
  });
  assert.equal(constraints.playerType, 'codex');
  assert.equal(constraints.model, 'gpt-5.6-sol');
  assert.equal(constraints.effort, 'medium');
  assert.deepEqual(constraints.recognized, ['player', 'model', 'effort']);
});

test('Q2.10E-B.1-2. PLAYER / MODEL / REASONING and Player-field dialects share the same catalog validation', () => {
  const playerReasoning = recognizeRouteConstraints({
    prompt: 'PLAYER: Codex\nTARGET MODEL: GPT-5.6 Sol\nREASONING: High',
    candidates: [claude1(), codex1()], ledger: ledger(), names
  });
  assert.equal(playerReasoning.playerType, 'codex');
  assert.equal(playerReasoning.model, 'gpt-5.6-sol');
  assert.equal(playerReasoning.effort, 'high');

  for (const field of ['WORKER', 'IMPLEMENTATION AGENT', 'TARGET PLAYER', 'ROUTE TO', 'SEND TO']) {
    const constraints = recognizeRouteConstraints({
      prompt: `${field}: Codex\nEFFORT: Medium`, candidates: [claude1(), codex1()], ledger: ledger(), names
    });
    assert.equal(constraints.playerType, 'codex', `${field} identifies the known Player`);
    assert.equal(constraints.effort, 'medium');
  }
});

test('Q2.10E-B.1-3. Then-send clauses constrain the executor without confusing preceding source attribution', () => {
  const plain = recognizeRouteConstraints({
    prompt: 'Then send to Codex.', candidates: [claude1(), codex1()], ledger: ledger(), names
  });
  assert.equal(plain.playerType, 'codex');

  const withSource = route('Created by Claude. Then send this to Codex on GPT-5.6 Sol. Apply the recommendation from that report.').decision;
  assert.equal(withSource.playerInstanceId, CODEX1);
  assert.equal(withSource.model, 'gpt-5.6-sol');
  assert.equal(withSource.context.ownerInstanceId, CLAUDE1);
  assert.match(withSource.contextPreamble, /previously handled by Claude/);

  assert.equal(recognizeRouteConstraints({
    prompt: 'Created by Claude. Architecture produced by Claude.', candidates: [claude1(), codex1()], ledger: ledger(), names
  }), undefined);
});

test('Q2.10E-B.1-4. Report recommendations remain advice, and fenced/incidental examples remain unconstrained', () => {
  const selectedAdvice = route('Build a new export feature.', [claude1(), codex1()], {
    reports: [{ ...report, suggestedNextMove: 'Codex' }], incomingReportPath: report.path
  }).decision;
  assert.equal(selectedAdvice.constraints, undefined, 'selected report metadata cannot become a hard route constraint');
  assert.equal(recognizeRouteConstraints({
    prompt: 'Suggested next move: Codex\nRecommended next Player: Claude', candidates: [claude1(), codex1()], ledger: ledger(), names
  }), undefined);
  assert.equal(recognizeRouteConstraints({
    prompt: 'Discuss how AGENT and MODEL headers should work in ordinary prose.\n```\nAGENT: Codex\nMODEL: GPT-5.6 Sol\n```',
    candidates: [claude1(), codex1()], ledger: ledger(), names
  }), undefined);
});

test('Q2.10E-B.1-5. Structured and natural dialects normalize to equivalent typed RouteConstraints', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  const structured = recognizeRouteConstraints({
    ...input, prompt: 'AGENT: Codex\nMODEL: GPT-5.6 Sol\nTHINKING: Medium'
  });
  const natural = recognizeRouteConstraints({
    ...input, prompt: 'Use Codex on GPT-5.6 Sol, Medium.'
  });
  assert.deepEqual(structured, natural);
});

test('Q2.10E-B.2-1. Harmless Markdown, list, case, and whitespace variations normalize the Player label', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  for (const prompt of [
    'AGENT: Codex',
    '**AGENT:** Codex',
    '### **AGENT:** Codex',
    '- AGENT: Codex',
    '* Agent : Codex',
    '** Agent ** : Codex',
    'aGeNt   :   Codex'
  ]) {
    const constraints = recognizeRouteConstraints({ ...input, prompt });
    assert.equal(constraints?.playerType, 'codex', `${prompt} resolves the known Player`);
    assert.deepEqual(constraints?.recognized, ['player']);
  }
});

test('Q2.10E-B.2-2. Unmistakable field aliases normalize into the existing typed dimensions', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  for (const field of ['TARGET AGENT', 'ASSIGNED AGENT', 'EXECUTOR']) {
    const constraints = recognizeRouteConstraints({ ...input, prompt: `${field}: Codex` });
    assert.equal(constraints?.playerType, 'codex', `${field} is a Player constraint`);
  }
  const constraints = recognizeRouteConstraints({
    ...input,
    prompt: 'PLAYER: Codex\nMODEL TO USE: GPT-5.6 Sol\nTHINKING / REASONING EFFORT: Low'
  });
  assert.equal(constraints?.playerType, 'codex');
  assert.equal(constraints?.model, 'gpt-5.6-sol');
  assert.equal(constraints?.effort, 'low');
  assert.deepEqual(constraints?.recognized, ['player', 'model', 'effort']);

  for (const field of ['THINKING EFFORT', 'REASONING LEVEL', 'THINKING LEVEL']) {
    const effort = recognizeRouteConstraints({ ...input, prompt: `AGENT: Codex\n${field}: Medium` });
    assert.equal(effort?.effort, 'medium', `${field} is the same effort dimension`);
  }
});

test('Q2.10E-B.2-3. The real Markdown Strategy Board header resolves Codex, Sol, and Low only', () => {
  const constraints = recognizeRouteConstraints({
    prompt: [
      '# AGENT ASSIGNMENT',
      '',
      '**AGENT:** Codex',
      '**MODEL:** GPT-5.6 Sol',
      '**THINKING / REASONING EFFORT:** Low',
      '**ROLE:** Worker / Implementation Agent',
      '**TASK DIFFICULTY:** Moderate',
      '**STAGE:** Stage 1.2 — Reliable Skool Full/Recent Conversation Capture'
    ].join('\n'),
    candidates: [claude1(), codex1()], ledger: ledger(), names
  });
  assert.equal(constraints?.playerType, 'codex');
  assert.equal(constraints?.model, 'gpt-5.6-sol');
  assert.equal(constraints?.modelDisplayName, 'GPT-5.6 Sol');
  assert.equal(constraints?.effort, 'low');
  assert.deepEqual(constraints?.recognized, ['player', 'model', 'effort']);
});

test('Q2.10E-B.2-4. Opening metadata may follow a short title, but late implementation examples are not authority', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  const withinWindow = recognizeRouteConstraints({
    ...input,
    prompt: [
      '# Stage 1.2', 'Implementation assignment', 'Keep the current architecture.', 'Preserve tests.',
      'This is the next bounded Play.', '## Routing', '**AGENT:** Codex', '**MODEL:** GPT-5.6 Sol'
    ].join('\n')
  });
  assert.equal(withinWindow?.playerType, 'codex');
  assert.equal(withinWindow?.model, 'gpt-5.6-sol');

  const lateExample = recognizeRouteConstraints({
    ...input,
    prompt: [...Array.from({ length: 15 }, (_, index) => `Implementation requirement ${index + 1}`), 'AGENT: Codex'].join('\n')
  });
  assert.equal(lateExample, undefined, 'routing-looking prose after the bounded opening is not promoted to authority');
});

test('Q2.10E-B.2-5. Source, advice, quoted examples, and fenced examples stay outside execution authority', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  for (const prompt of [
    '**Created by:** Claude',
    '**Previous Agent:** Claude',
    '**Report Author:** Claude',
    '**Suggested Agent:** Codex',
    '**Recommended Model:** Opus',
    '> **AGENT:** Codex\n> **MODEL:** GPT-5.6 Sol',
    '`AGENT: Codex`',
    '"AGENT: Codex"',
    '```text\n**AGENT:** Codex\n**MODEL:** GPT-5.6 Sol\n```',
    'Explain why **AGENT:** and **MODEL:** are normalized by the routing parser.'
  ]) {
    assert.equal(recognizeRouteConstraints({ ...input, prompt }), undefined, `${prompt} remains context, advice, or documentation`);
  }
});

test('Q2.10E-B.2-6. Tiny typo tolerance is label-only; Player, model, and effort values remain strict', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  const labelTypos = recognizeRouteConstraints({
    ...input,
    prompt: 'AGNET: Codex\nMODEL: GPT-5.6 Sol\nTHNIKING: Low'
  });
  assert.equal(labelTypos?.playerType, 'codex');
  assert.equal(labelTypos?.model, 'gpt-5.6-sol');
  assert.equal(labelTypos?.effort, 'low');

  const reasoningTypo = recognizeRouteConstraints({ ...input, prompt: 'AGENT: Codex\nRESONING: Medium' });
  assert.equal(reasoningTypo?.effort, 'medium');

  const invalidValues = recognizeRouteConstraints({
    ...input,
    prompt: 'AGENT: Cdoex\nMODEL: GPT-5.6 Soil\nEFFORT: Middium'
  });
  assert.equal(invalidValues, undefined, 'values are never fuzzy-matched');

  const validPlayerInvalidModel = recognizeRouteConstraints({
    ...input,
    prompt: 'AGENT: Codex\nMODEL: GPT-5.6 Soil'
  });
  assert.equal(validPlayerInvalidModel?.playerType, 'codex');
  assert.equal(validPlayerInvalidModel?.model, undefined);
  assert.deepEqual(validPlayerInvalidModel?.recognized, ['player']);
});

test('Q2.10E-B.2-7. Markdown-header preview and dispatch agree while the selected Claude report remains a Codex handoff', async () => {
  const candidates = [claude1(), codex1()];
  const { registry, frames } = routedRegistry(candidates);
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => ({
    ledger: ledger(), reports: [report], names, incomingReportPath: report.path,
    rosterInstanceIds: new Set([CLAUDE1, CODEX1]), queuedCounts: new Map()
  }));
  const prompt = [
    '# AGENT ASSIGNMENT',
    '**AGENT:** Codex',
    '**MODEL:** GPT-5.6 Sol',
    '**THINKING / REASONING EFFORT:** Low',
    '**ROLE:** Worker / Implementation Agent',
    'Apply the recommendation from the selected report.'
  ].join('\n');
  const preview = router.computeRoute(GAME, prompt, candidates, { incomingReportPath: report.path }).decision;
  assert.equal(preview.playerInstanceId, CODEX1);
  assert.equal(preview.model, 'gpt-5.6-sol');
  assert.equal(preview.effort, 'low');
  assert.equal(preview.context.ownerInstanceId, CLAUDE1);
  assert.equal(preview.context.reportPath, report.path);
  assert.match(preview.contextPreamble, /previously handled by Claude/);

  const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt, incomingReportPath: report.path });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.ok(frame);
  router.handleDispatchAccepted({
    clientRef: frame.params.clientRef, stadiumId: 'stadium-trend', gameId: GAME,
    playerInstanceId: frame.params.playerInstanceId, turnRef: 'turn-b2', acceptedAt: Date.now()
  });
  const actual = (await pending).decision;
  assert.deepEqual(
    { player: actual.playerInstanceId, model: actual.model, effort: actual.effort, reason: actual.summary },
    { player: preview.playerInstanceId, model: preview.model, effort: preview.effort, reason: preview.summary }
  );
  assert.equal(frame.params.playerInstanceId, CODEX1);
  assert.equal(frame.params.model, 'gpt-5.6-sol');
  assert.equal(frame.params.effort, 'low');
  assert.match(frame.params.prompt, /Read this report before proceeding: Reports\/Claude\/Architecture\.md/);
});

test('Q2.10E-B.2-8. B.1 natural-language directives remain equivalent to normalized structured input', () => {
  const input = { candidates: [claude1(), codex1()], ledger: ledger(), names };
  const structured = recognizeRouteConstraints({
    ...input, prompt: '**AGENT:** Codex\n**MODEL:** GPT-5.6 Sol\n**REASONING LEVEL:** Medium'
  });
  for (const prompt of [
    'Use Codex on GPT-5.6 Sol, Medium.',
    'Give this to Codex on GPT-5.6 Sol, Medium.',
    'Send this to Codex on GPT-5.6 Sol, Medium.',
    'Route this to Codex on GPT-5.6 Sol, Medium.',
    'Then send this to Codex on GPT-5.6 Sol, Medium.',
    'For Stage 1.2, use Codex on GPT-5.6 Sol, Medium.'
  ]) {
    assert.deepEqual(recognizeRouteConstraints({ ...input, prompt }), structured, `${prompt} keeps B.1 behavior`);
  }
});
