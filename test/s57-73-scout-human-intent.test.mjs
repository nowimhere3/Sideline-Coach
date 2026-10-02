/** S57.73: Scout human intent normalization (case, plurality, bounded carriers and the SCOUT RECON title). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recognizeRouteConstraints, recognizeScoutDirective } from '../out/control-plane/route-constraints.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
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

const BODY = '\n\nDesign the architecture and system boundaries. Review tradeoffs, invariants and security risks.';
const toScout = (prompt, candidates) => route(prompt, candidates).decision?.playerInstanceId === SCOUT_PLAYER_INSTANCE_ID;

test('S57.73 FIELD A/B: SCOUT RECON and "I would like to send some SCOUTS" reach Scout, never an ordinary Player', () => {
  for (const prompt of ['SCOUT RECON', 'I would like to send some SCOUTS']) {
    for (const body of ['', BODY]) {
      const result = route(prompt + body);
      assert.equal(result.error, undefined, prompt);
      assert.equal(result.decision.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
      assert.equal(result.decision.provider, 'scout', prompt);
      assert.equal(result.decision.constraints.directive.kind, 'scout', prompt);
    }
  }
});

test('S57.73 required normalization forms all reach the same Scout destination, in every case', () => {
  const forms = ['SCOUT THIS PLAY', 'Scout this play', 'scout this play', 'SCOUTS THIS PLAY', 'Send this to Scout', 'Send this to Scouts',
    'Please send this to Scout', 'I would like to send this to Scout', 'I would like to send some SCOUTS', 'Run Scout on this',
    'Run Scouts on this', 'sCoUtS tHiS pLaY', 'SeNd ThIs To ScOuTs', 'Route this to the scouts'];
  for (const form of forms) for (const variant of [form, form.toUpperCase(), form.toLowerCase()]) {
    for (const body of ['', BODY]) {
      // ALL-CAPS title nouns are the one deliberately case-sensitive shape; its lower/mixed spellings are prose.
      const result = route(variant + body);
      assert.equal(result.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, JSON.stringify(variant + body));
      assert.equal(result.decision.model, undefined);
      assert.equal(result.decision.constraints.directive.kind, 'scout');
    }
  }
  // Singular and plural are one destination: identical recognition outside the surface word.
  assert.deepEqual(recognizeRouteConstraints({ prompt: 'Send this to Scouts', candidates: [claude(), scout()] })?.playerType, 'scout');
  assert.deepEqual(recognizeRouteConstraints({ prompt: 'Send this to Scout', candidates: [claude(), scout()] })?.playerType, 'scout');
});

test('S57.73 the objective after a Scout carrier or title is preserved and the human wording is not persisted', () => {
  const directive = recognizeScoutDirective('I would like to send some SCOUTS: investigate the parser.\nAlso check the router.');
  assert.equal(directive.executionPrompt, 'Investigate the parser.\nAlso check the router.');
  assert.equal(recognizeScoutDirective('SCOUT RECON - map the routing seams').executionPrompt, 'Map the routing seams');
  assert.equal(recognizeScoutDirective('SCOUT RECON').executionPrompt, undefined);
});

test('S57.73 unavailable Scout stops truthfully and never substitutes a normal Player', () => {
  for (const prompt of ['SCOUT RECON', 'I would like to send some SCOUTS']) {
    const result = route(prompt + BODY, [claude(), codex(), scout({ state: 'busy' })]);
    assert.equal(result.decision, undefined, prompt);
    assert.ok(result.error, prompt);
    const gone = route(prompt + BODY, [claude(), codex()]);
    assert.equal(gone.decision?.playerInstanceId === CLAUDE || gone.decision?.playerInstanceId === CODEX, false, prompt);
  }
});

test('S57.73 false positives: discussion, headings, deep, fenced and quoted mentions stay ordinary', () => {
  const prose = ['Review the Scout report', 'Compare Scout results with Claude', 'The scouts found three issues',
    'Use the Scout findings in the implementation', 'The Scout run failed yesterday', 'Summarize what the Scouts discovered',
    'SCOUT REPORT SUMMARY', 'Scout recon notes', 'Scouts recon findings', 
    'I would like to send some scouts reports to Claude', 'Run Scout on this parser bug and fix it',
    'Review this.\nSCOUT RECON',
    Array.from({ length: 12 }, (_, i) => `Context paragraph ${i + 1}.`).join('\n') + '\nI would like to send some SCOUTS',
    '```text\nSCOUT RECON\n```\nReview this parser.', '> Send this to Scouts\nReview this parser.', '"I would like to send some SCOUTS"\nReview this parser.'];
  for (const prompt of prose) {
    assert.equal(recognizeScoutDirective(prompt), undefined, prompt);
    const result = route(prompt + BODY);
    assert.notEqual(result.decision?.playerInstanceId, SCOUT_PLAYER_INSTANCE_ID, prompt);
    assert.equal(result.decision?.constraints?.directive, undefined, prompt);
  }
});

test('S57.73 existing Scout grammar and structured Scout routing are unchanged', () => {
  for (const prompt of ['Scout this play\nInvestigate it.', 'Scout needed: investigate it.', 'Scout, investigate it.', 'AGENT: Scout\nInvestigate it.']) {
    assert.equal(toScout(prompt), true, prompt);
  }
  assert.equal(recognizeScoutDirective('Scouts found this bug. Review their result.'), undefined);
  assert.equal(recognizeScoutDirective('Scout the parser for bugs.'), undefined);
  assert.equal(recognizeScoutDirective("Scout's previous report is attached."), undefined);
});

test('S57.73 the control title is ALL CAPS by design (SCOUT / SCOUTS RECON); other spellings are prose', () => {
  for (const title of ['SCOUT RECON', 'SCOUTS RECON', 'SCOUT MISSION', '**SCOUT RECON**']) assert.equal(toScout(title + BODY), true, title);
  for (const prose of ['Scout Recon', 'scout recon', 'SCOUT RECON FINDINGS']) assert.equal(toScout(prose + BODY), false, prose);
});
