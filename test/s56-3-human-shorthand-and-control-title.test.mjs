/**
 * S56.3 — HUMAN SHORTHAND + CONTROL-SHAPED TITLE INTERCEPT (SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING).
 *
 * Two field failures:
 *   1. "Claude Sonnet"                            staged AntiGravity · Gemini 3.8 Flash · Low   (expected Claude · Sonnet)
 *   2. "SCOUT FORMATION — OPUS SCOPE PACK ..."    staged Claude · Opus · High                   (expected Scout)
 *
 * The opening line is a bounded, deterministic, roster/catalog-backed route call. Descriptive prose, headings, choices,
 * negations, extra words and typos are never routes, and nothing is ever spelling-corrected.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recognizeRouteConstraints } from '../out/control-plane/route-constraints.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';

const GAME = 'game_s56_3';
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
  models: [
    { id: 'gpt-6-astra', displayName: 'GPT-6 Astra', isDefault: false, supportedEfforts: ['medium', 'high', 'ultra'], defaultEffort: 'high' },
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' }
  ]
};
// One Flash: "Flash" names exactly one catalog model.
const antigravitySnapshot = {
  provider: 'antigravity', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gemini-3.1-pro',
  models: [
    { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', isDefault: true, supportedEfforts: ['low', 'high'], defaultEffort: 'low' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'low' }
  ]
};
// The real catalog shape: three Flash generations, so "Flash" alone is ambiguous.
const antigravityManyFlash = {
  ...antigravitySnapshot,
  models: [
    ...antigravitySnapshot.models,
    { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'low' },
    { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'low' }
  ]
};

const cap = (instanceId, playerType, fieldLabel, snapshot, extra = {}) => ({
  instanceId, playerType, transport: 'controlled', transportLabel: 'Controlled', fieldLabel, state: 'ready', capability: snapshot, ...extra
});
const CLAUDE = 'claude-11111111';
const CODEX = 'codex-11111111';
const AG = 'antigravity-11111111';
const claude = (extra) => cap(CLAUDE, 'claude', 'Claude', claudeSnapshot, extra);
const codex = (extra) => cap(CODEX, 'codex', 'Codex', codexSnapshot, extra);
const antigravity = (extra, snapshot = antigravitySnapshot) => cap(AG, 'antigravity', 'AntiGravity', snapshot, extra);
const scout = (overrides = {}) => ({
  instanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Scout', state: 'ready',
  capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' },
  executionType: 'scout-formation', autoEligible: false, supportsQueue: false, ...overrides
});
const team = () => [claude(), codex(), antigravity(), scout()];
const recognize = (prompt, candidates = team()) => recognizeRouteConstraints({ prompt, candidates });
const names = new Map([[CLAUDE, 'Claude'], [CODEX, 'Codex'], [AG, 'AntiGravity'], [SCOUT_PLAYER_INSTANCE_ID, 'Scout']]);
const context = () => ({ ledger: [], reports: [], names, rosterInstanceIds: new Set(names.keys()), queuedCounts: new Map() });
const route = (prompt, candidates = team()) => computeContextAwareRoute(GAME, prompt, candidates, policies, context());
const shape = (constraints) => [constraints?.playerType, constraints?.model, constraints?.effort];
const unresolvedOf = (constraints) => (constraints?.unresolved ?? []).map((item) => `${item.dimension}:${item.rawText}`);

// ---------------------------------------------------------------------------------------------------------------------
// Human shorthand — positive

test('S56.3-1 "Claude Sonnet" -> Claude / Sonnet, effort absent (field failure 1)', () => {
  const constraints = recognize('Claude Sonnet');
  assert.deepEqual(shape(constraints), ['claude', 'sonnet', undefined]);
  assert.equal(constraints.unresolved, undefined);
  assert.ok(constraints.recognized.includes('route-shorthand'));
  assert.equal(constraints.directive, undefined, 'a non-Scout shorthand carries no directive');
  // End to end through the router policy: Claude · Sonnet, never AntiGravity · Gemini Flash.
  const routed = route('Claude Sonnet');
  assert.equal(routed.error, undefined);
  assert.equal(routed.decision.playerInstanceId, CLAUDE);
  assert.equal(routed.decision.model, 'sonnet');
});

test('S56.3-2 "Claude Sonnet Medium" -> Claude / Sonnet / Medium', () => {
  assert.deepEqual(shape(recognize('Claude Sonnet Medium')), ['claude', 'sonnet', 'medium']);
  const routed = route('Claude Sonnet Medium');
  assert.deepEqual([routed.decision.playerInstanceId, routed.decision.model, routed.decision.effort], [CLAUDE, 'sonnet', 'medium']);
});

test('S56.3-3 "Claude Opus High" -> Claude / Opus / High', () => {
  assert.deepEqual(shape(recognize('Claude Opus High')), ['claude', 'opus', 'high']);
});

test('S56.3-4 "Codex GPT-5.6 Sol High" -> Codex / gpt-5.6-sol / High (catalog id, not a synonym list)', () => {
  assert.deepEqual(shape(recognize('Codex GPT-5.6 Sol High')), ['codex', 'gpt-5.6-sol', 'high']);
  assert.deepEqual(shape(recognize('Codex Sol High')), ['codex', 'gpt-5.6-sol', 'high'], 'one catalog model contains "Sol"');
  assert.deepEqual(shape(recognize('Codex GPT-6 Astra')), ['codex', 'gpt-6-astra', undefined]);
});

test('S56.3-4b shorthand tolerates presentation only: case, emphasis, heading marker, trailing period, a version number', () => {
  for (const prompt of ['claude sonnet', '**Claude Sonnet**', '# Claude Sonnet', 'Claude Sonnet.', 'Claude, Sonnet', '- Claude Sonnet']) {
    assert.deepEqual(shape(recognize(prompt)), ['claude', 'sonnet', undefined], prompt);
  }
  assert.deepEqual(shape(recognize('Claude Sonnet 5 Medium')), ['claude', 'sonnet', 'medium']);
  assert.deepEqual(shape(recognize('Claude High')), ['claude', undefined, 'high'], 'Player + effort is enough');
});

test('S56.3-4c the rest of the Play is the objective: a shorthand line followed by a body routes and never re-decides', () => {
  const constraints = recognize('Claude Sonnet\n\nImplement the parser. Use Codex only for the benchmarks.');
  assert.deepEqual(shape(constraints), ['claude', 'sonnet', undefined]);
  assert.equal(constraints.directive, undefined);
});

test('S56.3-4d AntiGravity: a model word naming exactly one catalog model resolves; several stop truthfully', () => {
  assert.deepEqual(shape(recognize('AntiGravity Flash')), ['antigravity', 'gemini-3.8-flash', undefined]);
  assert.deepEqual(shape(recognize('Anti Gravity Flash Medium')), ['antigravity', 'gemini-3.8-flash', 'medium']);
  const many = [claude(), antigravity(undefined, antigravityManyFlash), scout()];
  const ambiguous = recognize('AntiGravity Flash', many);
  assert.equal(ambiguous.playerType, 'antigravity', 'the Player intent is unmistakable and kept');
  assert.equal(ambiguous.model, undefined, 'but a model is never guessed among three Flash versions');
  assert.deepEqual(unresolvedOf(ambiguous), ['model:flash']);
  const routed = route('AntiGravity Flash', many);
  assert.equal(routed.decision, undefined);
  assert.match(routed.error, /Unrecognized model 'flash'/i);
  assert.deepEqual(shape(recognize('AntiGravity Gemini 3.8 Flash', many)), ['antigravity', 'gemini-3.8-flash', undefined]);
});

test('S56.3-4e an effort the model does not support is an explicit unresolved effort, never a silent substitution', () => {
  const constraints = recognize('Claude Sonnet Max');
  assert.equal(constraints.model, 'sonnet');
  assert.equal(constraints.effort, undefined);
  assert.deepEqual(unresolvedOf(constraints), ['effort:max']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Control-shaped titles — positive

test('S56.3-5 "SCOUT FORMATION — OPUS SCOPE PACK" routes to Scout, not Claude Opus (field failure 2)', () => {
  const prompt = 'SCOUT FORMATION — OPUS SCOPE PACK\n\nMap the exact files Claude Opus should inspect.';
  const constraints = recognize(prompt);
  assert.equal(constraints.playerType, 'scout');
  assert.equal(constraints.model, undefined);
  assert.equal(constraints.directive.kind, 'scout');
  assert.ok(constraints.recognized.includes('control-title') && constraints.recognized.includes('scout-directive'));
  // control/play separation: the control text is not the objective, the title topic and the body are.
  assert.equal(constraints.directive.matched, 'SCOUT FORMATION —');
  assert.equal(constraints.directive.executionPrompt, 'OPUS SCOPE PACK\n\nMap the exact files Claude Opus should inspect.');
  const routed = route(prompt, [claude(), codex(), scout()]);
  assert.equal(routed.error, undefined);
  assert.equal(routed.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
  assert.equal(routed.decision.provider, 'scout');
  assert.notEqual(routed.decision.playerInstanceId, CLAUDE);
});

test('S56.3-6 a Scout title routes to Scout even when the objective repeats "Use Claude Opus" (words never outvote the title)', () => {
  const prompt = [
    'SCOUT FORMATION — OPUS SCOPE PACK',
    '',
    'Map the exact files Claude Opus should inspect.',
    'Use Claude Opus to judge the design and send this to Codex GPT-5.6 Sol High afterwards.'
  ].join('\n');
  const constraints = recognize(prompt);
  assert.equal(constraints.playerType, 'scout');
  assert.equal(constraints.model, undefined);
  assert.equal(constraints.effort, undefined);
  assert.equal(route(prompt, [claude(), codex(), scout()]).decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
});

test('S56.3-7 "CLAUDE SONNET — ARCHITECTURE REVIEW" -> Claude / Sonnet; other control titles resolve the same way', () => {
  assert.deepEqual(shape(recognize('CLAUDE SONNET — ARCHITECTURE REVIEW')), ['claude', 'sonnet', undefined]);
  assert.deepEqual(shape(recognize('CODEX — IMPLEMENTATION PASS')), ['codex', undefined, undefined]);
  assert.deepEqual(shape(recognize('ANTIGRAVITY FLASH — QUICK RECON')), ['antigravity', 'gemini-3.8-flash', undefined]);
  assert.deepEqual(shape(recognize('CLAUDE OPUS HIGH - DEEP REVIEW')), ['claude', 'opus', 'high'], 'a plain spaced hyphen is a separator too');
  assert.ok(recognize('CODEX — IMPLEMENTATION PASS').recognized.includes('control-title'));
  const routed = route('CLAUDE SONNET — ARCHITECTURE REVIEW\n\nUse Codex to implement the fixes.');
  assert.deepEqual([routed.decision.playerInstanceId, routed.decision.model], [CLAUDE, 'sonnet'], 'the title outranks a natural "Use X" in the body');
});

test('S56.3-7b a structured AGENT field still outranks a control-shaped title; the Scout directive still owns its own opening', () => {
  const structured = recognize('CLAUDE SONNET — ARCHITECTURE REVIEW\nAGENT: Codex\nDo it.');
  assert.equal(structured.playerType, 'codex');
  assert.equal(structured.recognized.includes('control-title'), false);
  const scoutFirst = recognize('Scout this play: review Claude Sonnet output.');
  assert.equal(scoutFirst.playerType, 'scout');
  assert.equal(scoutFirst.recognized.includes('control-title'), false);
  const badStructured = recognize('CLAUDE SONNET — REVIEW\nAGENT: Imaginary');
  assert.deepEqual(unresolvedOf(badStructured), ['player:Imaginary'], 'an unresolved structured Player stays a truthful stop');
  assert.equal(badStructured.playerType, undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Negative / safety

test('S56.3-8 descriptive prose does not route', () => {
  for (const prompt of [
    'Claude Sonnet produced this report yesterday.',
    'Compare Claude Sonnet with Opus.',
    'I think Claude Sonnet might be better here.',
    'Codex High was slower than expected today.',
    'Claude Sonnet Adapter Problems',
    'Claude Sonnet — Adapter Problems',
    'Claude Sonnet — Architecture Review'
  ]) {
    assert.equal(recognize(prompt), undefined, prompt);
  }
});

test('S56.3-9 descriptive headings do not route', () => {
  for (const prompt of [
    'What Scout Formation Found Yesterday',
    'Why Claude Sonnet Failed This Test',
    'Comparing Claude Sonnet and Opus',
    'Results From Codex',
    '# Results From Codex',
    '## Scout Formation Findings',
    'Scout Formation Results — Yesterday'
  ]) {
    assert.equal(recognize(prompt), undefined, prompt);
  }
});

test('S56.3-10 ambiguity does not guess', () => {
  for (const prompt of [
    'Claude or Codex', 'Claude and Codex', 'Claude Sonnet Opus', 'Sonnet or Opus', 'SONNET VS OPUS',
    'CLAUDE / CODEX — REVIEW', 'CLAUDE OR CODEX — REVIEW', 'Claude / Codex', 'Claude & Codex High', 'Claude Sonnet | Opus'
  ]) {
    assert.equal(recognize(prompt), undefined, prompt);
  }
  // A bare Player name with no model/effort and no control-shaped title is not a route call either.
  // (a bare "Scout" is the pre-existing S56.1 Scout directive, so it is deliberately not in this list)
  for (const prompt of ['Claude', 'Codex', 'Codex 5', 'Claude 3 Sonnet']) assert.equal(recognize(prompt), undefined, prompt);
});

test('S56.3-11 negation does not become positive routing', () => {
  for (const prompt of [
    'Not Claude Sonnet', 'Claude Sonnet, not Opus', 'Never Codex High', 'Anything but Claude Sonnet',
    'Claude Sonnet instead of Opus', 'NOT CLAUDE SONNET — REVIEW', 'CLAUDE SONNET NOT OPUS — REVIEW'
  ]) {
    const constraints = recognize(prompt);
    assert.equal(constraints?.playerType, undefined, prompt);
    assert.equal(constraints?.model, undefined, prompt);
  }
});

test('S56.3-12 typos do not fuzzy-route (a leftover word is never corrected)', () => {
  for (const prompt of [
    'Cluade Sonnet', 'Claude Sonet', 'Cdoex Sol', 'Scuot this play', 'GPT-5.6 Soil', 'Claude Sonnet Medum',
    'Codex GPT-5.6 Soil High', 'CLAUDE SONET — ARCHITECTURE REVIEW', 'CLUADE SONNET — ARCHITECTURE REVIEW', 'SCUOT FORMATION — OPUS SCOPE PACK',
    'Codex GPT-5.6 Sol 2'
  ]) {
    assert.equal(recognize(prompt), undefined, prompt);
  }
});

test('S56.3-12b the boundary is the opening line: nothing later in the Play can create a route, and fenced/quoted openings never do', () => {
  assert.equal(recognize('Please review this.\nClaude Sonnet\nAnd report back.'), undefined);
  assert.equal(recognize('Implement the parser.\n\nSCOUT FORMATION — OPUS SCOPE PACK'), undefined);
  assert.equal(recognize('```\nClaude Sonnet\n```\nDo the thing.'), undefined);
  assert.equal(recognize('> Claude Sonnet\nDo the thing.'), undefined);
  assert.deepEqual(shape(recognize('\n\nClaude Sonnet Medium')), ['claude', 'sonnet', 'medium']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Existing S56 behavior is unchanged

test('S56.3-13 S56.0 structured routing still wins and still fails visibly', () => {
  const header = ['# AGENT / MODEL', '', 'AGENT: Claude Code', 'MODEL: Claude Sonnet 5', 'REASONING: High', '', 'Implement the parser change.'].join('\n');
  const constraints = recognize(header);
  assert.deepEqual([...shape(constraints), constraints.unresolved], ['claude', 'sonnet', 'high', undefined]);
  assert.equal(constraints.recognized.includes('route-shorthand'), false);
  const bad = recognize('AGENT: Claude\nMODEL: Sonnet or Opus\nBody.');
  assert.deepEqual(unresolvedOf(bad), ['model:Sonnet or Opus']);
  assert.deepEqual(unresolvedOf(recognize('AGENT: Imaginary\nBody.')), ['player:Imaginary']);
});

test('S56.3-14 S56.1 Scout directives still route to Scout', () => {
  for (const prompt of ['Scout this play', 'Scout this play: investigate whether X is safe.', 'SCOUT NEEDED:\nInvestigate it.', 'scout this play - investigate it.']) {
    assert.equal(recognize(prompt)?.playerType, 'scout', prompt);
    assert.equal(route(prompt, [claude(), scout()]).decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
  }
  assert.equal(recognize('Scout this play, investigate X.').directive.executionPrompt, 'Investigate X.');
  assert.equal(recognize('The scouts found three regressions.'), undefined);
  assert.equal(recognize('Scout support was added.'), undefined);
});

test('S56.3-15 S56.2 alias normalization still resolves structured values', () => {
  const constraints = recognize('AGENT: Claude Development Stadium\nMODEL: Claude Sonnet 5 Model\nREASONING: High reasoning\nBody.');
  assert.deepEqual([...shape(constraints), constraints.unresolved], ['claude', 'sonnet', 'high', undefined]);
  assert.equal(recognize('AGENT: Claude Code\nBody.').playerType, 'claude');
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude or Codex\nBody.')), ['player:Claude or Codex']);
  assert.deepEqual(unresolvedOf(recognize('AGENT: Cluade\nBody.')), ['player:Cluade']);
  // "Use X" natural imperatives keep working when no opening route exists.
  assert.equal(recognize('Use Codex to implement this.').playerType, 'codex');
  assert.equal(recognize('Please implement the parser.'), undefined);
});
