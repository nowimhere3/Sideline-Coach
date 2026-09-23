/**
 * S56.2 — CANONICAL-ROUTING-ALIAS-NORMALIZATION.
 *
 * A structured AGENT/PLAYER value names a Player; a structured MODEL value names a model. The one canonical roster /
 * catalog identity CONTAINED in the value resolves, harmless descriptive wrapping is tolerated, and none / several /
 * negated / misspelled values stay explicit-unresolved (S56.0). Nothing is ever spelling-corrected.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recognizeRouteConstraints } from '../out/control-plane/route-constraints.js';
import { normalizeEffortValue, resolveRouteIdentity } from '../out/control-plane/route-normalization.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';

const GAME = 'game_s56_2';
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
const antigravitySnapshot = {
  provider: 'antigravity', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gemini-pro',
  models: [{ id: 'gemini-pro', displayName: 'Gemini Pro', isDefault: true, supportedEfforts: ['low', 'high'], defaultEffort: 'low' }]
};

const cap = (instanceId, playerType, fieldLabel, snapshot, extra = {}) => ({
  instanceId, playerType, transport: 'controlled', transportLabel: 'Controlled', fieldLabel, state: 'ready', capability: snapshot, ...extra
});
const CLAUDE = 'claude-11111111';
const CODEX = 'codex-11111111';
const AG = 'antigravity-11111111';
const claude = (extra) => cap(CLAUDE, 'claude', 'Claude', claudeSnapshot, extra);
const codex = (extra) => cap(CODEX, 'codex', 'Codex', codexSnapshot, extra);
const antigravity = (extra) => cap(AG, 'antigravity', 'AntiGravity', antigravitySnapshot, extra);
const team = () => [claude(), codex(), antigravity()];
const recognize = (prompt, candidates = team(), extra = {}) => recognizeRouteConstraints({ prompt, candidates, ...extra });
const unresolvedOf = (constraints) => (constraints?.unresolved ?? []).map((item) => `${item.dimension}:${item.rawText}`);

// ---------------------------------------------------------------------------------------------------------------------
// The field failure

test('S56.2-1 the exact field header (title lines above the fields) resolves to Claude / Sonnet / High', () => {
  const prompt = [
    '# AGENT / MODEL',
    '',
    'AGENT: Claude Code',
    'MODEL: Claude Sonnet 5',
    'REASONING: High',
    'DIFFICULTY: High / Cross-Repository Architecture',
    '',
    'Implement the parser change described below and prove it end to end.'
  ].join('\n');
  const constraints = recognize(prompt);
  assert.equal(constraints.unresolved, undefined);
  assert.equal(constraints.playerType, 'claude');
  assert.equal(constraints.model, 'sonnet');
  assert.equal(constraints.effort, 'high');
  // ...and end to end through the router policy: Claude · Sonnet · High, not Opus.
  const context = { ledger: [], reports: [], names: new Map([[CLAUDE, 'Claude'], [CODEX, 'Codex']]), rosterInstanceIds: new Set([CLAUDE, CODEX]), queuedCounts: new Map() };
  const routed = computeContextAwareRoute(GAME, prompt, [claude(), codex()], policies, context);
  assert.equal(routed.error, undefined);
  assert.equal(routed.decision.playerInstanceId, CLAUDE);
  assert.equal(routed.decision.model, 'sonnet');
  assert.equal(routed.decision.effort, 'high');
});

test('S56.2-1b the same fields survive titles, subtitles, blank lines, separators and short presentation material', () => {
  const prompt = ['# Big Plan', '_subtitle_', '', '---', '', '## Routing', '', '**AGENT:** Claude Code', '**MODEL:** Claude Sonnet 5', '**REASONING:** High', '', 'Body.'].join('\n');
  const constraints = recognize(prompt);
  assert.deepEqual([constraints.playerType, constraints.model, constraints.effort, constraints.unresolved], ['claude', 'sonnet', 'high', undefined]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Player: canonical identity extraction (not a synonym list)

test('S56.2-2 any descriptive wrapping around a unique canonical Player identity resolves to that Player', () => {
  const claudeValues = [
    'Claude', 'Claude Code', 'Claude-Code', 'claude_code', 'CLAUDE CODE', 'Claude CLI', 'Claude Agent', 'Claude Player',
    'Claude Stadium', 'Claude Instance', 'Claude Worker', 'Claude Code Agent', 'My Claude Player', 'Claude Development Stadium',
    '**Claude Code**', '`Claude`', 'Claude (Sonnet 5)', 'Claude, please', 'The Claude Code CLI Agent Stadium'
  ];
  for (const value of claudeValues) {
    const constraints = recognize(`AGENT: ${value}\nDo the work.`);
    assert.equal(constraints?.playerType, 'claude', value);
    assert.equal(constraints?.unresolved, undefined, value);
  }
  const codexValues = ['Codex', 'Codex CLI', 'OpenAI Codex', 'Codex Agent', 'OpenAI Codex Player', 'Codex Stadium', 'Codex Code Agent'];
  for (const value of codexValues) assert.equal(recognize(`AGENT: ${value}\nDo the work.`)?.playerType, 'codex', value);
  const agValues = ['AntiGravity', 'Anti Gravity', 'Anti-Gravity', 'antigravity', 'AntiGravity CLI', 'AntiGravity Agent', 'Anti Gravity Player'];
  for (const value of agValues) assert.equal(recognize(`AGENT: ${value}\nDo the work.`)?.playerType, 'antigravity', value);
  // Every structured Player label behaves the same.
  for (const label of ['PLAYER', 'Worker', 'Target Player', 'Assigned Agent', 'Executor']) {
    assert.equal(recognize(`${label}: Claude Code\nDo the work.`)?.playerType, 'claude', label);
  }
});

test('S56.2-3 the Play names the Player; the Player scopes the model: AGENT + MODEL combinations', () => {
  const cases = [
    ['AGENT: Claude Code\nMODEL: Claude Sonnet 5\nREASONING: High', 'claude', 'sonnet', 'high'],
    ['AGENT: Claude\nMODEL: Claude Sonnet 5\nREASONING: Medium', 'claude', 'sonnet', 'medium'],
    ['AGENT: Claude-Code\nMODEL: Sonnet 5', 'claude', 'sonnet', undefined],
    ['AGENT: Claude CLI\nMODEL: Sonnet', 'claude', 'sonnet', undefined],
    ['AGENT: Claude\nMODEL: Sonnet', 'claude', 'sonnet', undefined],
    ['AGENT: Claude Code\nMODEL: Claude Sonnet', 'claude', 'sonnet', undefined],
    ['AGENT: Claude Development Stadium\nMODEL: Claude Sonnet 5\nREASONING: High', 'claude', 'sonnet', 'high'],
    ['AGENT: Codex CLI\nMODEL: GPT-5.6 Sol', 'codex', 'gpt-5.6-sol', undefined],
    ['AGENT: OpenAI Codex\nMODEL: Sol', 'codex', undefined, undefined]
  ];
  for (const [prompt, playerType, model, effort] of cases) {
    const constraints = recognize(prompt);
    if (model === undefined && playerType === 'codex' && prompt.includes('MODEL: Sol')) {
      // "Sol" alone is not a catalog alias (the catalog says "GPT-5.6 Sol"): unresolved, never guessed.
      assert.deepEqual(unresolvedOf(constraints), ['model:Sol'], prompt);
      continue;
    }
    assert.equal(constraints.playerType, playerType, prompt);
    assert.equal(constraints.model, model, prompt);
    assert.equal(constraints.effort, effort, prompt);
    assert.equal(constraints.unresolved, undefined, prompt);
  }
});

test('S56.2-4 model values tolerate redundant Player/product words and safe version decoration', () => {
  for (const value of ['Sonnet', 'Sonnet 5', 'sonnet-5', 'Sonnet 4.5', 'Claude Sonnet', 'Claude Sonnet 5', 'Claude Code Sonnet 5', 'Sonnet Model', 'Claude Sonnet Model', '**Sonnet**']) {
    const constraints = recognize(`AGENT: Claude\nMODEL: ${value}`);
    assert.equal(constraints.model, 'sonnet', value);
    assert.equal(constraints.unresolved, undefined, value);
  }
  assert.equal(recognize('AGENT: Claude\nMODEL: Claude Opus 4').model, 'opus');
  // A digit-bearing catalog id never accepts a stray number: "GPT-5.6 Sol" is exact, "GPT-5.6 Sol 2" is not it.
  assert.equal(recognize('AGENT: Codex\nMODEL: GPT-5.6 Sol').model, 'gpt-5.6-sol');
  assert.deepEqual(unresolvedOf(recognize('AGENT: Codex\nMODEL: GPT-5.6 Sol 2')), ['model:GPT-5.6 Sol 2']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Explicit-unresolved stays explicit-unresolved

test('S56.2-5 no fuzzy correction: misspelled Players stay explicit-unresolved', () => {
  for (const value of ['Cdoex', 'Cluade', 'Cluade Code', 'Claud', 'Codx CLI', 'Anti Gravty', 'Scuot', 'Imaginary Agent', 'OpenAI', 'Sonnet']) {
    const constraints = recognize(`AGENT: ${value}\nDo the work.`);
    assert.equal(constraints.playerType, undefined, value);
    assert.deepEqual(unresolvedOf(constraints), [`player:${value}`], value);
  }
});

test('S56.2-6 no fuzzy correction: misspelled or unknown models stay explicit-unresolved', () => {
  for (const [agent, value] of [['Codex', 'GPT-5.6 Soil'], ['Claude', 'Sonet'], ['Claude', 'Sonet 5'], ['Claude', 'Claude Sonet 5'], ['Claude', 'Opuss'], ['Claude', 'Imaginary 9'], ['Claude', 'Claude']]) {
    const constraints = recognize(`AGENT: ${agent}\nMODEL: ${value}`);
    assert.equal(constraints.model, undefined, `${agent}/${value}`);
    assert.deepEqual(unresolvedOf(constraints), [`model:${value}`], `${agent}/${value}`);
  }
  // GPT-5.6 Soil never becomes Sol, with or without an AGENT header.
  const bare = recognize('MODEL: GPT-5.6 Soil\nDo the work.');
  assert.equal(bare.model, undefined);
  assert.deepEqual(unresolvedOf(bare), ['model:GPT-5.6 Soil']);
});

test('S56.2-7 ambiguity, choice and negation never guess (Player)', () => {
  for (const value of ['Claude and Codex', 'Claude or Codex', 'Claude / Codex', 'Claude & Codex', 'Claude Codex', 'Claude, Codex', 'Either Claude or Codex', 'Not Claude', 'Anything but Claude', 'Claude instead of Codex', 'No Claude', 'Never Claude']) {
    const constraints = recognize(`AGENT: ${value}\nDo the work.`);
    assert.equal(constraints.playerType, undefined, value);
    assert.deepEqual(unresolvedOf(constraints), [`player:${value}`], value);
  }
  // A misspelling next to a real identity is a near-miss of ANOTHER identity, so it blocks instead of being ignored.
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude Cdoex Agent\nDo the work.')), ['player:Claude Cdoex Agent']);
  // A number beside a Player name is an instance reference that no instance answers to.
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude 3\nDo the work.')), ['player:Claude 3']);
});

test('S56.2-8 ambiguity, choice and negation never guess (model)', () => {
  for (const value of ['Sonnet or Opus', 'Sonnet and Opus', 'Claude Opus Sonnet', 'Opus / Sonnet', 'Not Sonnet', 'Sonnet Opsu', 'Sonnet, Opus']) {
    const constraints = recognize(`AGENT: Claude\nMODEL: ${value}`);
    assert.equal(constraints.model, undefined, value);
    assert.deepEqual(unresolvedOf(constraints), [`model:${value}`], value);
  }
});

test('S56.2-9 a name that belongs to two Player types is ambiguous and is never guessed', () => {
  // The roster itself is ambiguous: two different Player types both answer to "Helper".
  const alpha = cap('alpha-11111111', 'alpha', 'Helper', claudeSnapshot);
  const beta = cap('beta-11111111', 'beta', 'Helper', codexSnapshot);
  const constraints = recognize('AGENT: Helper Agent\nDo the work.', [alpha, beta]);
  assert.equal(constraints.playerType, undefined);
  assert.deepEqual(unresolvedOf(constraints), ['player:Helper Agent']);
  // Their unambiguous type names still resolve.
  assert.equal(recognize('AGENT: Alpha\nDo the work.', [alpha, beta]).playerType, 'alpha');
  assert.equal(recognize('AGENT: Beta CLI\nDo the work.', [alpha, beta]).playerType, 'beta');
  // A model alias shared by two models is ambiguous too.
  const twin = cap(CLAUDE, 'claude', 'Claude', { ...claudeSnapshot, models: [
    { id: 'sonnet-a', displayName: 'Sonnet', isDefault: false, supportedEfforts: ['high'], defaultEffort: 'high' },
    { id: 'sonnet-b', displayName: 'Sonnet', isDefault: false, supportedEfforts: ['high'], defaultEffort: 'high' }
  ] });
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude\nMODEL: Sonnet', [twin])), ['model:Sonnet']);
});

test('S56.2-10 instances: only an exact numbered name selects a sibling; otherwise the Player type', () => {
  const one = cap('claude-aaaaaaa1', 'claude', 'Claude 1', claudeSnapshot);
  const two = cap('claude-aaaaaaa2', 'claude', 'Claude 2', claudeSnapshot);
  const names = new Map([[one.instanceId, 'Claude 1'], [two.instanceId, 'Claude 2']]);
  const exact = recognize('AGENT: Claude 2\nDo the work.', [one, two], { names });
  assert.deepEqual([exact.playerType, exact.playerInstanceId], ['claude', two.instanceId]);
  const wrapped = recognize('AGENT: Claude 2 Agent\nDo the work.', [one, two], { names });
  assert.equal(wrapped.playerInstanceId, two.instanceId);
  const typeOnly = recognize('AGENT: Claude Code\nDo the work.', [one, two], { names });
  assert.deepEqual([typeOnly.playerType, typeOnly.playerInstanceId], ['claude', undefined]);
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude 1 and Claude 2\nDo the work.', [one, two], { names })), ['player:Claude 1 and Claude 2']);
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude 3\nDo the work.', [one, two], { names })), ['player:Claude 3']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Reasoning / effort

test('S56.2-11 the supported effort vocabulary is presentation-normalized; anything else stays explicit-unresolved', () => {
  for (const [value, expected] of [['High', 'high'], ['**medium**', 'medium'], ['LOW', 'low'], ['High reasoning', 'high'], ['Medium effort', 'medium'], ['Extra High', 'xhigh'], ['X-High', 'xhigh'], ['xhigh', 'xhigh'], ['Max', 'max']]) {
    assert.equal(normalizeEffortValue(value), expected, value);
  }
  for (const value of ['high or low', 'Middium', 'ultra high', 'very high', 'Not high', 'Cross-Repository', '']) assert.equal(normalizeEffortValue(value), undefined, value);
  // Truthful provider support is still enforced: ultra is not offered by Claude.
  assert.deepEqual(unresolvedOf(recognize('AGENT: Claude\nREASONING: xhigh')), ['effort:xhigh']);
  assert.equal(recognize('AGENT: Codex\nREASONING: Extra High').effort, 'xhigh');
  assert.equal(recognize('AGENT: Claude\nREASONING: Medium reasoning').effort, 'medium');
  // DIFFICULTY is not a routing field at all.
  assert.equal(recognize('DIFFICULTY: High / Cross-Repository Architecture\nDo the work.'), undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Preserved contracts

test('S56.2-12 S56.0 contract intact: absent -> AUTO fills, explicit+resolved wins, explicit+unresolved stops visibly', () => {
  const context = { ledger: [], reports: [], names: new Map([[CLAUDE, 'Claude'], [CODEX, 'Codex']]), rosterInstanceIds: new Set([CLAUDE, CODEX]), queuedCounts: new Map() };
  const route = (prompt) => computeContextAwareRoute(GAME, prompt, [claude(), codex()], policies, context);
  // absent model: AUTO fills it for the explicit Claude
  const absent = route('AGENT: Claude Code\nREASONING: Medium\nDesign the architecture for the new parser and implement it.');
  assert.equal(absent.decision.playerInstanceId, CLAUDE);
  assert.equal(absent.decision.effort, 'medium');
  assert.ok(absent.decision.model);
  // explicit + resolved wins over the architecture preference for Opus
  assert.equal(route('AGENT: Claude Code\nMODEL: Claude Sonnet 5\nDesign the architecture for the new parser.').decision.model, 'sonnet');
  // explicit + unresolved stops with the existing message and dispatches nothing
  const stopped = route('AGENT: Cdoex\nMODEL: GPT-5.6 Soil\nDo the work.');
  assert.equal(stopped.decision, undefined);
  assert.match(stopped.error, /Unrecognized Player 'Cdoex'/);
  const badModel = route('AGENT: Claude Code\nMODEL: Imaginary 9\nDo the work.');
  assert.equal(badModel.decision, undefined);
  assert.match(badModel.error, /Unrecognized model 'Imaginary 9' requested for Claude/);
});

test('S56.2-13 S56.1 Scout routing is unchanged: the directive and "AGENT: Scout Player" still reach Scout', () => {
  const scout = { instanceId: SCOUT_PLAYER_INSTANCE_ID, playerType: 'scout', transport: 'controlled', transportLabel: 'Controlled', fieldLabel: 'Scout', state: 'ready', capability: { provider: 'scout', authenticated: true, models: [], observedAt: 1, freshness: 'live' }, executionType: 'scout-formation', autoEligible: false, supportsQueue: false };
  const context = { ledger: [], reports: [], names: new Map([[CLAUDE, 'Claude'], [SCOUT_PLAYER_INSTANCE_ID, 'Scout']]), rosterInstanceIds: new Set([CLAUDE, SCOUT_PLAYER_INSTANCE_ID]), queuedCounts: new Map() };
  for (const prompt of ['Scout this play, investigate the parser.', 'AGENT: Scout\nInvestigate the parser.', 'AGENT: Scout Player\nInvestigate the parser.', 'AGENT: Scout Agent\nInvestigate the parser.']) {
    const routed = computeContextAwareRoute(GAME, prompt, [claude(), scout], policies, context);
    assert.equal(routed.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
  }
  assert.equal(recognize('Scout this play, investigate the parser.', [claude(), scout]).directive.kind, 'scout');
});

test('S56.2-14 natural-language "Use X" remains conservative advice and is not turned into an unresolved stop', () => {
  assert.equal(recognize('Use Claude Code on Sonnet for this.\nDo the work.')?.playerType, 'claude');
  assert.equal(recognize('Use Imaginary Agent for this.\nDo the work.'), undefined);
  assert.equal(recognize('Review what Claude Code found.'), undefined);
});

test('S56.2-15 the normalization seam is pure and generic', () => {
  const aliases = [{ text: 'Widget', value: 'w' }, { text: 'Gadget Pro', value: 'g' }];
  const resolve = (value) => resolveRouteIdentity(value, aliases, { identityKey: (v) => v });
  assert.equal(resolve('my widget thing').ok, true);
  assert.equal(resolve('the Gadget-Pro unit').ok, true);
  assert.deepEqual(resolve('widget gadget pro'), { ok: false, reason: 'ambiguous' });
  assert.deepEqual(resolve('gadget'), { ok: false, reason: 'none' });
  assert.deepEqual(resolve('widget or gadget pro'), { ok: false, reason: 'contradictory' });
  assert.deepEqual(resolve(''), { ok: false, reason: 'none' });
});
