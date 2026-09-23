/**
 * S56.1 — SCOUT-DIRECTIVE-INTERCEPT + control/play separation.
 *
 * "Scout this play" is a control-plane routing command, not task content. Descriptive references to Scout/Scouts stay
 * Play content. Recognition is bounded to the first non-blank line, deterministic, and conservative.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recognizeRouteConstraints, recognizeScoutDirective } from '../out/control-plane/route-constraints.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';

const GAME = 'game_s56_1';
const CLAUDE = 'claude-11111111';
const CODEX = 'codex-11111111';
const policies = createRoutingPolicies();

const claudeSnapshot = {
  provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'opus',
  models: [
    { id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    { id: 'sonnet', displayName: 'Sonnet', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ]
};
const codexSnapshot = {
  provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
};
const claude = (overrides = {}) => ({ instanceId: CLAUDE, playerType: 'claude', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Claude', state: 'ready', capability: claudeSnapshot, ...overrides });
const codex = (overrides = {}) => ({ instanceId: CODEX, playerType: 'codex', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Codex', state: 'ready', capability: codexSnapshot, ...overrides });
const scout = (overrides = {}) => ({
  instanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Scout', state: 'ready',
  capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
  executionType: 'scout-formation', autoEligible: false, supportsQueue: false, ...overrides
});
const names = new Map([[CLAUDE, 'Claude'], [CODEX, 'Codex'], [SCOUT_PLAYER_INSTANCE_ID, 'Scout']]);
const context = (extra = {}) => ({
  ledger: [], reports: [], names, rosterInstanceIds: new Set([CLAUDE, CODEX, SCOUT_PLAYER_INSTANCE_ID]), queuedCounts: new Map(), ...extra
});
const route = (prompt, candidates = [claude(), scout()], extra = {}) => computeContextAwareRoute(GAME, prompt, candidates, policies, context(extra));
const routesToScout = (prompt, candidates) => {
  const result = route(prompt, candidates);
  return result.decision?.playerInstanceId === SCOUT_PLAYER_INSTANCE_ID;
};

// A long architecture/implementation-flavoured objective: the ordinary classifier would love to send this to Claude Opus.
const OBJECTIVE = 'investigate whether the routing envelope has regression risks before we implement the new parser architecture';

// ---------------------------------------------------------------------------------------------------------------------
// Positive: opening directives route to Scout

test('S56.1-P1..P5 the required opening directives route to Scout, not Claude task classification', () => {
  const cases = [
    'Scout this play\nInvestigate the routing parser.',
    'Scout this play, investigate the routing parser.',
    'Scout needed: investigate the routing parser.',
    'Scout, investigate the routing parser.',
    'Scout this before Claude implements it.'
  ];
  for (const prompt of cases) {
    const result = route(prompt);
    assert.equal(result.error, undefined, prompt);
    assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
    assert.equal(result.decision.provider, 'scout', prompt);
    assert.equal(result.decision.model, undefined, prompt);
    assert.equal(result.decision.effort, undefined, prompt);
    assert.match(result.decision.summary, /Scout selected as you asked/i, prompt);
    assert.equal(result.decision.constraints.directive.kind, 'scout', prompt);
  }
});

test('S56.1-P6 a structured AGENT: Scout route still works exactly as before and carries no directive', () => {
  for (const prompt of ['AGENT: Scout\n\nInvestigate the routing parser.', 'PLAYER: Scout\nInvestigate the routing parser.']) {
    const result = route(prompt);
    assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
    assert.equal(result.decision.constraints.directive, undefined, prompt);
  }
});

test('S56.1-P7 the field failure: a directive over architecture prose is not staged as Claude Opus High', () => {
  const prompt = `Scout this play, ${OBJECTIVE}.`;
  const result = route(prompt);
  assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.notEqual(result.decision.provider, 'claude');
  assert.equal(result.decision.effort, undefined);
  // Without the directive the same sentence IS ordinary task classification (proves the intercept is what changed it).
  const ordinary = route('Design the new parser architecture and implement it, weighing the regression risks.');
  assert.equal(ordinary.decision.playerInstanceId, CLAUDE);
  assert.notEqual(ordinary.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
});

test('S56.1-P8 case and presentation tolerance', () => {
  for (const prompt of [
    'SCOUT THIS PLAY\nInvestigate it.',
    'Scout this play\nInvestigate it.',
    '**Scout this play**\nInvestigate it.',
    '**Scout this play:** investigate it.',
    '**Scout needed**: investigate it.',
    '* Scout this play\nInvestigate it.',
    '- Scout this play\nInvestigate it.',
    '# Scout this play\nInvestigate it.',
    '`Scout this play`\nInvestigate it.',
    '_Scout needed_\nInvestigate it.',
    'Scout needed\nInvestigate it.',
    'SCOUT NEEDED:\nInvestigate it.',
    'scout this play - investigate it.',
    '  \n\n  Scout this play  \nInvestigate it.',
    'Scout\nInvestigate it.',
    'Scout this\nInvestigate it.',
    'Scout this play.\nInvestigate it.',
    'Scout this play before we implement it\nInvestigate it.'
  ]) {
    assert.equal(routesToScout(prompt), true, JSON.stringify(prompt));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Negative: descriptive language is Play content

test('S56.1-N1..N8 descriptive references to Scout/Scouts never become routing commands', () => {
  const negatives = [
    'Scouts found this bug. Review their result.',
    'The Scout report says this architecture is unsafe.',
    'Review what Scout found.',
    'Implement the "Scout this play" command.',
    'We added Scout this play support yesterday.',
    'The scouts found three regressions.',
    "Scout's previous report is attached.",
    'This architecture was reviewed by Scout.',
    'Scout found this yesterday.',
    "Scout's report found this.",
    'The Scout report says...',
    'Implement the "Scout this play" feature.',
    'The Scouts found this architecture risky.',
    'Scout this play support was added yesterday.',
    'Scout Player architecture notes',
    'Scout the parser for bugs.'
  ];
  for (const prompt of negatives) {
    assert.equal(recognizeScoutDirective(prompt), undefined, prompt);
    const result = route(prompt);
    assert.notEqual(result.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
    assert.equal(result.decision?.constraints?.directive, undefined, prompt);
  }
});

test('S56.1-N9 only the opening line counts: a directive later in the Play, in a fence, or in a quote is content', () => {
  for (const prompt of [
    'Implement the parser.\nScout this play\nThen test it.',
    '```\nScout this play\n```\nInvestigate it.',
    '> Scout this play\nInvestigate it.',
    'Title line\n\nScout this play, investigate it.',
    '"Scout this play"\nInvestigate it.'
  ]) {
    assert.equal(recognizeScoutDirective(prompt), undefined, JSON.stringify(prompt));
  }
});

test('S56.1-N10 no fuzzy spelling', () => {
  for (const prompt of ['Scuot this play\nInvestigate it.', 'Scot this play, investigate it.', 'Scoutt needed: investigate it.', 'Skout this play\nInvestigate it.']) {
    assert.equal(recognizeScoutDirective(prompt), undefined, prompt);
    assert.equal(routesToScout(prompt), false, prompt);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Control / play separation

test('S56.1-S1 the executionPrompt keeps the useful objective and drops only the control language', () => {
  const at = (prompt) => recognizeScoutDirective(prompt);
  assert.deepEqual(at('Scout this play, investigate whether X is safe.'), { matched: 'Scout this play,', executionPrompt: 'Investigate whether X is safe.' });
  assert.equal(at('Scout this play\nInvestigate the routing parser.').executionPrompt, 'Investigate the routing parser.');
  assert.equal(at('Scout needed: investigate the routing parser.').executionPrompt, 'Investigate the routing parser.');
  assert.equal(at('Scout, investigate the routing parser.').executionPrompt, 'Investigate the routing parser.');
  assert.equal(at('**Scout this play:** investigate it.').executionPrompt, 'Investigate it.');
  assert.equal(at('SCOUT NEEDED:\n\nLine one.\nLine two.').executionPrompt, 'Line one.\nLine two.');
  // Later lines are preserved verbatim, including formatting and code.
  assert.equal(at('Scout this play\nCheck `src/a.ts`:\n\n- one\n- two').executionPrompt, 'Check `src/a.ts`:\n\n- one\n- two');
});

test('S56.1-S2 a bare directive has no objective of its own and never fabricates one', () => {
  for (const prompt of ['Scout this play', 'Scout needed', 'Scout', 'SCOUT NEEDED:', 'Scout this before Claude implements it.', 'Scout this play before we implement it']) {
    const directive = recognizeScoutDirective(prompt);
    assert.ok(directive, prompt);
    assert.equal(directive.executionPrompt, undefined, prompt);
  }
});

function dispatchHarness(capabilities, { provider = true } = {}) {
  const frames = [];
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-session', stadiumId: 'stadium', name: 'Test', platform: 'win32',
    socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
    game: { gameId: GAME, displayName: 'S56.1 Game', fingerprintSource: 'test' }, rootFsPath: 'C:/S561Game',
    roster: [], capabilities, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: []
  });
  const router = new ControlPlaneRouter(registry);
  if (provider) router.setRouteContextProvider(() => context());
  return { router, frames };
}

async function dispatch(prompt, capabilities, options = {}) {
  const { router, frames } = dispatchHarness(capabilities, options);
  const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt });
  await new Promise((resolve) => setImmediate(resolve));
  const frame = frames.find((entry) => entry.method === 'dispatch.request');
  if (!frame) return { result: await pending, frame: undefined };
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME, playerInstanceId: frame.params.playerInstanceId, turnRef: 'turn', acceptedAt: Date.now() });
  return { result: await pending, frame };
}

test('S56.1-S3 the dispatch frame carries the execution prompt to Scout (context-aware and legacy AUTO paths)', async () => {
  for (const provider of [true, false]) {
    const { result, frame } = await dispatch('Scout this play, investigate whether X is safe.', [claude(), scout()], { provider });
    assert.equal(result.success, true, `provider=${provider}`);
    assert.equal(frame.params.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
    assert.equal(frame.params.prompt, 'Investigate whether X is safe.');
    assert.equal(frame.params.model, undefined);
    assert.equal(frame.params.effort, undefined);
    assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  }
});

test('S56.1-S4 with no objective of its own the original Play is delivered unchanged', async () => {
  for (const prompt of ['Scout this play', 'Scout needed', 'Scout this before Claude implements it.']) {
    const { frame } = await dispatch(prompt, [claude(), scout()]);
    assert.equal(frame.params.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
    assert.equal(frame.params.prompt, prompt);
  }
});

test('S56.1-S5 ordinary and structured Plays are delivered exactly as before', async () => {
  const structured = 'AGENT: Scout\n\nInvestigate the routing parser.';
  const { frame: scoutFrame } = await dispatch(structured, [claude(), scout()]);
  assert.equal(scoutFrame.params.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(scoutFrame.params.prompt, structured);
  const descriptive = 'Scouts found this bug. Review their result.';
  const { frame: ordinary } = await dispatch(descriptive, [claude(), scout()]);
  assert.equal(ordinary.params.playerInstanceId, CLAUDE);
  assert.ok(ordinary.params.prompt.startsWith(descriptive));
});

// ---------------------------------------------------------------------------------------------------------------------
// Safety: truthful availability, precedence, no substitution

test('S56.1-A1 Scout unavailable / busy / not on field stops truthfully and never substitutes Claude or Codex', async () => {
  const unavailable = [
    [claude(), codex()],                               // Scout not on field / not eligible
    [claude(), codex(), scout({ state: 'busy' })],     // already working
    [claude(), scout({ state: 'needs-attention' })],
    [claude(), scout({ capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'unavailable' } })]
  ];
  for (const candidates of unavailable) {
    const result = route('Scout this play, investigate the routing parser.', candidates);
    assert.equal(result.decision, undefined);
    assert.match(result.error, /Scout is currently unavailable\. Coach did not choose another Player/);
    // The legacy AUTO path is just as strict.
    const legacy = computeAutoRoute(GAME, 'Scout this play, investigate the routing parser.', candidates, policies);
    assert.equal(legacy.decision, undefined);
    assert.match(legacy.error, /Scout is currently unavailable/);
  }
  const { result, frame } = await dispatch('Scout this play, investigate the routing parser.', [claude(), codex()]);
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 400);
  assert.equal(frame, undefined, 'nothing was dispatched to any Player');
});

test('S56.1-A2 authority order: structured envelope and explicit Use-X outrank the directive; the directive outranks AUTO heuristics', () => {
  // 1. A structured Player field in the header wins (the directive is then ordinary Play text).
  const structured = route('Scout this play\nAGENT: Codex\nInvestigate it.', [claude(), codex(), scout()]);
  assert.equal(structured.decision.playerInstanceId, CODEX);
  assert.equal(structured.decision.constraints.directive, undefined);
  // 2. An unresolved structured Player still stops visibly rather than falling into the directive.
  const unresolved = route('Scout this play\nAGENT: Imaginary\nInvestigate it.', [claude(), scout()]);
  assert.match(unresolved.error, /Unrecognized Player 'Imaginary'/);
  // 3. Existing AUTO Scout recommendation is unchanged: no directive, reconnaissance-first prose still recommends Scout
  //    and carries scoutNeed (continuation state), which a directive never does.
  const autoNeed = route('Before we implement anything, first investigate the current architecture and gather evidence. Do not change any code yet.', [claude(), scout()]);
  if (autoNeed.decision?.playerInstanceId === SCOUT_PLAYER_INSTANCE_ID) {
    assert.ok(autoNeed.decision.scoutNeed);
    assert.equal(autoNeed.decision.constraints, undefined);
  }
  const directive = route('Scout this play, investigate the routing parser.', [claude(), scout()]);
  assert.equal(directive.decision.scoutNeed, undefined, 'an explicit command is not an AUTO recommendation');
});

test('S56.1-A3 an exact shell command beats nothing, but a Scout directive is never mistaken for one', () => {
  const terminal = { instanceId: 'terminal-11111111', playerType: 'terminal', transport: 'legacy', fieldLabel: 'Terminal · Terminal', state: 'ready', ownership: 'coach-managed', executionType: 'direct-shell', capability: { provider: 'terminal', authenticated: true, models: [], observedAt: 1, freshness: 'live' } };
  const result = route('Scout this play, investigate the routing parser.', [claude(), scout(), terminal]);
  assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  const plain = route('git status', [claude(), scout(), terminal]);
  assert.equal(plain.decision.provider, 'terminal');
});

test('S56.1-A4 MANUAL routing is untouched: the human already chose the Player, the opening words stay Play text', async () => {
  const { router, frames } = dispatchHarness([claude(), scout()]);
  const prompt = 'Scout this play, investigate the routing parser.';
  const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: CLAUDE, model: 'sonnet', effort: 'medium', prompt });
  await new Promise((resolve) => setImmediate(resolve));
  const frame = frames.find((entry) => entry.method === 'dispatch.request');
  assert.equal(frame.params.playerInstanceId, CLAUDE);
  assert.ok(frame.params.prompt.startsWith(prompt));
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME, playerInstanceId: CLAUDE, turnRef: 't', acceptedAt: Date.now() });
  await pending;
});

test('S56.1-A5 a directive coexisting with model/effort headers behaves like AGENT: Scout (Scout has no model catalog)', () => {
  const result = route('Scout this play\nMODEL: Opus\nInvestigate it.', [claude(), scout()]);
  assert.equal(result.decision, undefined);
  assert.match(result.error, /Unrecognized model 'Opus' requested for Scout/);
});

test('S56.1-A6 a Scout directive on a Play that continues Scout-owned context still goes to Scout, never a substitute', () => {
  const ledger = [{
    gameId: GAME, playerInstanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', state: 'idle', stateSince: 1,
    currentPlay: undefined,
    recentPlays: [{ clientRef: 'r1', playLabel: 'Reconnaissance', promptSummary: 'Investigate the parser', outcome: 'completed', startedAt: 10, finishedAt: 20, touches: [] }]
  }];
  const result = route('Scout this play, continue the investigation into the parser.', [claude(), scout()], { ledger });
  assert.equal(result.error, undefined);
  assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(result.decision.constraints.directive.kind, 'scout');
});

test('S56.1 recognizeRouteConstraints reports the directive as explicit Player routing and adds nothing for ordinary Plays', () => {
  const constraints = recognizeRouteConstraints({ prompt: 'Scout needed: investigate the parser.', candidates: [claude(), scout()] });
  assert.equal(constraints.playerType, 'scout');
  assert.deepEqual(constraints.recognized, ['player', 'scout-directive']);
  assert.equal(constraints.directive.executionPrompt, 'Investigate the parser.');
  assert.equal(recognizeRouteConstraints({ prompt: 'Review what Scout found.', candidates: [claude(), scout()] }), undefined);
});
