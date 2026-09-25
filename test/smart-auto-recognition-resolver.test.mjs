/**
 * SMART AUTO RECOGNITION RESOLVER ACCEPTANCE & REGRESSION SUITE
 *
 * Validates natural language AUTO mode routing:
 * PLAYER / MODEL / REASONING
 *
 * Tests the complete acceptance test matrix:
 * 1. Base ("Gemini")
 * 2. Reasoning variations ("Gemini Medium", "Gemini med", "Gemini Med", "Gemini MED")
 * 3. Live transitions ("Gemini" -> "Gemini med" -> "Gemini Medium" -> "Gemini High")
 * 4. Claude families ("Sonnet Medium", "Sonnet med", "Sonnett Medium", "Sonnett med", "Opus", "Opus med", "Opus High")
 * 5. Explicit player ("AntiGravity Gemini Medium", "Claude Sonnet med")
 * 6. Reasoning only ("Medium", "med")
 * 7. Typo tolerance ("Gemeni med", "AGY Gemini Medium")
 * 8. False positive safety (ordinary task prose does not hijack routing)
 * 9. Structured authority (AGENT:, MODEL:, REASONING: override natural recognition)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveSmartRouteConstraints } from '../out/control-plane/smart-route-resolver.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { SCOUT_PLAYER_INSTANCE_ID } from '../out/scout-player-contract.js';

const GAME = 'game_smart_auto';
const policies = createRoutingPolicies();

const antigravitySnapshot = {
  provider: 'antigravity',
  authenticated: true,
  observedAt: 1,
  freshness: 'live',
  defaultModelId: 'gemini-3.1-pro',
  models: [
    { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro', isDefault: false, supportedEfforts: ['low', 'high'], defaultEffort: 'low' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'low' }
  ]
};

const claudeSnapshot = {
  provider: 'claude',
  authenticated: true,
  observedAt: 1,
  freshness: 'live',
  defaultModelId: 'opus',
  models: [
    { id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    { id: 'sonnet', displayName: 'Sonnet', isDefault: false, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }
  ]
};

const codexSnapshot = {
  provider: 'codex',
  authenticated: true,
  observedAt: 1,
  freshness: 'live',
  defaultModelId: 'gpt-5.6-sol',
  models: [
    { id: 'gpt-6-astra', displayName: 'GPT-6 Astra', isDefault: false, supportedEfforts: ['medium', 'high', 'ultra'], defaultEffort: 'high' },
    { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' }
  ]
};

const cap = (instanceId, playerType, fieldLabel, snapshot, extra = {}) => ({
  instanceId,
  playerType,
  transport: 'controlled',
  transportLabel: 'Controlled',
  fieldLabel,
  state: 'ready',
  capability: snapshot,
  ...extra
});

const AG = 'antigravity-11111111';
const CLAUDE = 'claude-11111111';
const CODEX = 'codex-11111111';

const antigravity = (extra = {}) => cap(AG, 'antigravity', 'AntiGravity', antigravitySnapshot, extra);
const claude = (extra = {}) => cap(CLAUDE, 'claude', 'Claude', claudeSnapshot, extra);
const codex = (extra = {}) => cap(CODEX, 'codex', 'Codex', codexSnapshot, extra);
const scout = (overrides = {}) => ({
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
});

const team = () => [claude(), codex(), antigravity(), scout()];
const names = new Map([
  [AG, 'AntiGravity'],
  [CLAUDE, 'Claude'],
  [CODEX, 'Codex'],
  [SCOUT_PLAYER_INSTANCE_ID, 'Scout']
]);

const context = () => ({ ledger: [], reports: [], names, rosterInstanceIds: new Set(names.keys()), queuedCounts: new Map() });
const routeAuto = (prompt, candidates = team()) => computeAutoRoute(GAME, prompt, candidates, policies);
const routeContext = (prompt, candidates = team()) => computeContextAwareRoute(GAME, prompt, candidates, policies, context());
const shape = (constraints) => [constraints?.playerType, constraints?.model, constraints?.effort];

// ---------------------------------------------------------------------------------------------------------------------
// 1. BASE: "Gemini"
// ---------------------------------------------------------------------------------------------------------------------
test('BASE: "Gemini" resolves to AntiGravity with Gemini model and default reasoning', () => {
  const constraints = resolveSmartRouteConstraints({ prompt: 'Gemini', candidates: team() });
  assert.equal(constraints?.playerType, 'antigravity');
  assert.equal(constraints?.model, 'gemini-3.8-flash');
  assert.equal(constraints?.effort, undefined);

  const decisionAuto = routeAuto('Gemini');
  assert.equal(decisionAuto.error, undefined);
  assert.equal(decisionAuto.decision.playerLabel, 'AntiGravity');
  assert.equal(decisionAuto.decision.model, 'gemini-3.8-flash');
  assert.equal(decisionAuto.decision.effort, 'low');

  const decisionContext = routeContext('Gemini');
  assert.equal(decisionContext.error, undefined);
  assert.equal(decisionContext.decision.playerLabel, 'AntiGravity');
  assert.equal(decisionContext.decision.model, 'gemini-3.8-flash');
  assert.equal(decisionContext.decision.effort, 'low');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. REASONING: "Gemini Medium", "Gemini medium", "Gemini med", "Gemini Med", "Gemini MED"
// ---------------------------------------------------------------------------------------------------------------------
test('REASONING: "Gemini Medium" case and alias variants all resolve reasoning to medium', () => {
  const prompts = [
    'Gemini Medium',
    'Gemini medium',
    'Gemini med',
    'Gemini Med',
    'Gemini MED'
  ];

  for (const prompt of prompts) {
    const constraints = resolveSmartRouteConstraints({ prompt, candidates: team() });
    assert.deepEqual(
      shape(constraints),
      ['antigravity', 'gemini-3.8-flash', 'medium'],
      `Constraints failed for prompt: ${prompt}`
    );

    const routed = routeContext(prompt);
    assert.equal(routed.error, undefined, `Route error for prompt: ${prompt}`);
    assert.equal(routed.decision.playerLabel, 'AntiGravity');
    assert.equal(routed.decision.model, 'gemini-3.8-flash');
    assert.equal(routed.decision.effort, 'medium', `Expected medium effort for prompt: ${prompt}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. TRANSITION: Live sequence Gemini -> Gemini med -> Gemini Medium -> Gemini High
// ---------------------------------------------------------------------------------------------------------------------
test('TRANSITION: Live update sequence Gemini -> Gemini med -> Gemini Medium -> Gemini High', () => {
  const step1 = routeContext('Gemini');
  assert.equal(step1.decision.playerLabel, 'AntiGravity');
  assert.equal(step1.decision.model, 'gemini-3.8-flash');
  assert.equal(step1.decision.effort, 'low');

  const step2 = routeContext('Gemini med');
  assert.equal(step2.decision.playerLabel, 'AntiGravity');
  assert.equal(step2.decision.model, 'gemini-3.8-flash');
  assert.equal(step2.decision.effort, 'medium');

  const step3 = routeContext('Gemini Medium');
  assert.equal(step3.decision.playerLabel, 'AntiGravity');
  assert.equal(step3.decision.model, 'gemini-3.8-flash');
  assert.equal(step3.decision.effort, 'medium');

  const step4 = routeContext('Gemini High');
  assert.equal(step4.decision.playerLabel, 'AntiGravity');
  assert.equal(step4.decision.model, 'gemini-3.8-flash');
  assert.equal(step4.decision.effort, 'high');
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. CLAUDE FAMILIES: Sonnet & Opus variants
// ---------------------------------------------------------------------------------------------------------------------
test('CLAUDE FAMILIES: Sonnet and Sonnett (typo) with medium aliases resolve consistently', () => {
  const sonnetPrompts = [
    'Sonnet Medium',
    'Sonnet med',
    'Sonnett Medium',
    'Sonnett med'
  ];

  for (const prompt of sonnetPrompts) {
    const constraints = resolveSmartRouteConstraints({ prompt, candidates: team() });
    assert.deepEqual(
      shape(constraints),
      ['claude', 'sonnet', 'medium'],
      `Sonnet constraints failed for prompt: ${prompt}`
    );

    const routed = routeContext(prompt);
    assert.equal(routed.error, undefined);
    assert.equal(routed.decision.playerLabel, 'Claude');
    assert.equal(routed.decision.model, 'sonnet');
    assert.equal(routed.decision.effort, 'medium');
  }
});

test('CLAUDE FAMILIES: Opus variants resolve to Claude Opus', () => {
  const opusDefault = routeContext('Opus');
  assert.equal(opusDefault.decision.playerLabel, 'Claude');
  assert.equal(opusDefault.decision.model, 'opus');

  const opusMed = routeContext('Opus med');
  assert.equal(opusMed.decision.playerLabel, 'Claude');
  assert.equal(opusMed.decision.model, 'opus');
  assert.equal(opusMed.decision.effort, 'medium');

  const opusHigh = routeContext('Opus High');
  assert.equal(opusHigh.decision.playerLabel, 'Claude');
  assert.equal(opusHigh.decision.model, 'opus');
  assert.equal(opusHigh.decision.effort, 'high');
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. EXPLICIT PLAYER: Complete canonical tuples
// ---------------------------------------------------------------------------------------------------------------------
test('EXPLICIT PLAYER: AntiGravity Gemini Medium and Claude Sonnet med resolve complete tuples', () => {
  const agGeminiMed = routeContext('AntiGravity Gemini Medium');
  assert.equal(agGeminiMed.decision.playerLabel, 'AntiGravity');
  assert.equal(agGeminiMed.decision.model, 'gemini-3.8-flash');
  assert.equal(agGeminiMed.decision.effort, 'medium');

  const claudeSonnetMed = routeContext('Claude Sonnet med');
  assert.equal(claudeSonnetMed.decision.playerLabel, 'Claude');
  assert.equal(claudeSonnetMed.decision.model, 'sonnet');
  assert.equal(claudeSonnetMed.decision.effort, 'medium');

  const codexMed = routeContext('Codex Medium');
  assert.equal(codexMed.decision.playerLabel, 'Codex');
  assert.equal(codexMed.decision.effort, 'medium');
});

// ---------------------------------------------------------------------------------------------------------------------
// 6. REASONING ONLY: "Medium" and "med"
// ---------------------------------------------------------------------------------------------------------------------
test('REASONING ONLY: "Medium" or "med" updates only reasoning, letting AUTO fill player/model', () => {
  const medConstraints = resolveSmartRouteConstraints({ prompt: 'med', candidates: team() });
  assert.equal(medConstraints?.playerType, undefined);
  assert.equal(medConstraints?.model, undefined);
  assert.equal(medConstraints?.effort, 'medium');

  const mediumConstraints = resolveSmartRouteConstraints({ prompt: 'Medium', candidates: team() });
  assert.equal(mediumConstraints?.playerType, undefined);
  assert.equal(mediumConstraints?.model, undefined);
  assert.equal(mediumConstraints?.effort, 'medium');

  const routedMed = routeContext('med');
  assert.equal(routedMed.error, undefined);
  assert.equal(routedMed.decision.effort, 'medium');

  const routedMedium = routeContext('Medium');
  assert.equal(routedMedium.error, undefined);
  assert.equal(routedMedium.decision.effort, 'medium');
});

// ---------------------------------------------------------------------------------------------------------------------
// 7. TYPO: Gemeni med & AGY aliases
// ---------------------------------------------------------------------------------------------------------------------
test('TYPO: "Gemeni med" and "AGY Gemini Medium" resolve to Gemini Medium', () => {
  const gemeniMed = routeContext('Gemeni med');
  assert.equal(gemeniMed.decision.playerLabel, 'AntiGravity');
  assert.equal(gemeniMed.decision.model, 'gemini-3.8-flash');
  assert.equal(gemeniMed.decision.effort, 'medium');

  const agyMed = routeContext('AGY Gemini Medium');
  assert.equal(agyMed.decision.playerLabel, 'AntiGravity');
  assert.equal(agyMed.decision.model, 'gemini-3.8-flash');
  assert.equal(agyMed.decision.effort, 'medium');
});

// ---------------------------------------------------------------------------------------------------------------------
// 8. FALSE POSITIVES: Task prose must not hijack routing
// ---------------------------------------------------------------------------------------------------------------------
test('FALSE POSITIVES: Task prose mentioning models or players does not become a route command', () => {
  const prose1 = 'Build a parser that compares Gemini output to Sonnet output.';
  const constraints1 = resolveSmartRouteConstraints({ prompt: prose1, candidates: team() });
  assert.equal(constraints1, undefined, 'Prose with multiple models should not match natural route');

  const prose2 = 'Compare Claude Sonnet with Opus.';
  const constraints2 = resolveSmartRouteConstraints({ prompt: prose2, candidates: team() });
  assert.equal(constraints2, undefined);

  const prose3 = 'Claude Sonnet Adapter Problems';
  const constraints3 = resolveSmartRouteConstraints({ prompt: prose3, candidates: team() });
  assert.equal(constraints3, undefined);

  // Multi-line: first line is natural command, subsequent task prose mentions other models
  const multiline = 'Gemini med\nBuild a test comparing Gemini to Sonnet and Codex.';
  const multiConstraints = resolveSmartRouteConstraints({ prompt: multiline, candidates: team() });
  assert.deepEqual(shape(multiConstraints), ['antigravity', 'gemini-3.8-flash', 'medium']);

  const routedMulti = routeContext(multiline);
  assert.equal(routedMulti.decision.playerLabel, 'AntiGravity');
  assert.equal(routedMulti.decision.model, 'gemini-3.8-flash');
  assert.equal(routedMulti.decision.effort, 'medium');
});

// ---------------------------------------------------------------------------------------------------------------------
// 9. STRUCTURED AUTHORITY: Structured fields outrank natural first-line text
// ---------------------------------------------------------------------------------------------------------------------
test('STRUCTURED AUTHORITY: Explicit AGENT and MODEL fields override natural first line', () => {
  const prompt = [
    'AGENT: Codex',
    'MODEL: GPT-5.6 Sol',
    'REASONING: High',
    '',
    'Gemini Medium'
  ].join('\n');

  const constraints = resolveSmartRouteConstraints({ prompt, candidates: team() });
  assert.equal(constraints?.playerType, 'codex');
  assert.equal(constraints?.model, 'gpt-5.6-sol');
  assert.equal(constraints?.effort, 'high');

  const routed = routeContext(prompt);
  assert.equal(routed.decision.playerLabel, 'Codex');
  assert.equal(routed.decision.model, 'gpt-5.6-sol');
  assert.equal(routed.decision.effort, 'high');
});

// ---------------------------------------------------------------------------------------------------------------------
// 10. SCOUT DIRECTIVE AUTHORITY: Scout directive owns its opening
// ---------------------------------------------------------------------------------------------------------------------
test('SCOUT DIRECTIVE AUTHORITY: Natural Scout command takes precedence over general smart routing', () => {
  const prompt = 'Scout this play: check Gemini and Sonnet implementations.';
  const constraints = resolveSmartRouteConstraints({ prompt, candidates: team() });
  assert.equal(constraints?.playerType, 'scout');
  assert.equal(constraints?.directive?.kind, 'scout');

  const routed = routeContext(prompt);
  assert.equal(routed.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID);
});

// ---------------------------------------------------------------------------------------------------------------------
// 11. PRESENTATION FLEXIBILITY: Markdown prefixes on natural first-line commands
// ---------------------------------------------------------------------------------------------------------------------
test('PRESENTATION: Heading, bold, and list prefixes on natural route commands', () => {
  const variations = [
    '# Gemini Medium',
    '## Gemini Medium',
    '**Gemini Medium**',
    '- Gemini Medium',
    '* Gemini Medium',
    '`Gemini Medium`',
    'Gemini Medium.'
  ];

  for (const prompt of variations) {
    const constraints = resolveSmartRouteConstraints({ prompt, candidates: team() });
    assert.deepEqual(
      shape(constraints),
      ['antigravity', 'gemini-3.8-flash', 'medium'],
      `Failed on presentation variation: ${prompt}`
    );
  }
});
