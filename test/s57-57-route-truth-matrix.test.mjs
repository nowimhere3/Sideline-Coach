/** S57.57 / S57.58 Slice 0: future truth, not today's parser behavior.
 * Change a row's active flag (or activeLevels) only in the slice that proves it.
 * All catalogue facts below are synthetic test inputs, never production truth.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { resolveSmartRouteConstraints, resolveCatalogueRoute, catalogueRouteTuples } from '../out/control-plane/smart-route-resolver.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies, classifyTask } from '../out/routing-policy.js';
import { ControlPlaneRouter as Router } from '../out/control-plane/router.js';

const GAME = 's57-57-route-truth-fixture';
const model = (id, displayName, supportedEfforts, defaultEffort = supportedEfforts[0]) =>
  ({ id, displayName, supportedEfforts, defaultEffort, isDefault: false });
const seat = (playerType, fieldLabel, models, instanceId = `${playerType}-matrix-1`) => ({
  instanceId, playerType, fieldLabel, transport: 'controlled', transportLabel: 'Controlled', state: 'ready',
  capability: { provider: playerType, authenticated: true, observedAt: 1, freshness: 'live',
    defaultModelId: models[0].id, models: models.map((m, index) => ({ ...m, isDefault: index === 0 })) }
});
const baseCatalogue = () => [
  seat('claude', 'Claude', [
    model('opus', 'Opus', ['low', 'medium', 'high', 'max'], 'high'),
    model('sonnet', 'Sonnet', ['low', 'medium', 'high'], 'medium'),
    model('fable', 'Fable', ['low', 'medium', 'high'], 'high')
  ]),
  seat('codex', 'Codex', [
    model('gpt-6.1-sol', 'GPT-6.1 Sol', ['low', 'medium', 'high', 'ultra'], 'high'),
    model('gpt-6-astra', 'GPT-6 Astra', ['medium', 'high', 'ultra'], 'high'),
    model('gpt-5.6-sol', 'GPT-5.6 Sol', ['low', 'medium', 'high', 'xhigh'], 'medium')
  ]),
  seat('antigravity', 'AntiGravity', [
    model('gemini-3.8-flash', 'Gemini 3.8 Flash', ['low', 'medium', 'high']),
    model('gemini-3.1-pro', 'Gemini 3.1 Pro', ['low', 'high'])
  ])
];
const catalogues = {
  base: baseCatalogue,
  future: () => {
    const team = baseCatalogue();
    team[1].capability.models.push(model('gpt-7-luna', 'Luna', ['low', 'medium', 'high', 'minimal']));
    return team;
  },
  manyFlash: () => {
    const team = baseCatalogue();
    for (const version of ['3.7', '3.6']) team[2].capability.models.push(
      model(`gemini-${version}-flash`, `Gemini ${version} Flash`, ['low', 'medium', 'high']));
    return team;
  },
  sharedSonnet: () => {
    const team = baseCatalogue();
    team[2].capability.models.push(model('claude-sonnet', 'Claude Sonnet', ['low', 'medium', 'high']));
    return team;
  },
  twoCodex: () => {
    const team = baseCatalogue();
    team.push({ ...structuredClone(team[1]), instanceId: 'codex-matrix-2', fieldLabel: 'Codex 2' });
    return team;
  },
  singleSolEffort: () => {
    const team = baseCatalogue();
    // Keep a non-Sol model so Sol remains a family, not a universal brand.
    for (const model of team[1].capability.models) model.supportedEfforts = ['low'];
    return team;
  },
  noCodex: () => baseCatalogue().filter((s) => s.playerType !== 'codex'),
  // S57.70 Slice 5 synthetic catalogues (test inputs only).
  typoTwin: () => {
    const team = baseCatalogue();
    team[0].capability.models.push(model('sonnex', 'Sonnex', ['low', 'medium', 'high']));
    return team;
  },
  agVersionedClaude: () => {
    const team = baseCatalogue();
    team[2].capability.models.push(model('claude-sonnet-5.5', 'Claude Sonnet 5.5', ['low', 'medium', 'high']));
    return team;
  },
  sonnetVersions: () => {
    const team = baseCatalogue();
    team[0].capability.models.push(model('sonnet-5.5', 'Sonnet 5.5', ['low', 'medium', 'high']));
    return team;
  },
  onlyVersionedSonnets: () => {
    const team = baseCatalogue();
    team[0].capability.models = [model('sonnet-5.5', 'Sonnet 5.5', ['low', 'medium', 'high']), model('sonnet-6.0', 'Sonnet 6.0', ['low', 'medium', 'high'])];
    return team;
  },
  futureVersion: () => {
    const team = baseCatalogue();
    team[1].capability.models.push(model('gpt-7.2-orion', 'GPT-7.2 Orion', ['low', 'medium', 'high']));
    return team;
  }
};
const contextFor = (team) => ({ ledger: [], reports: [], queuedCounts: new Map(),
  names: new Map(team.map((s) => [s.instanceId, s.fieldLabel])), rosterInstanceIds: new Set(team.map((s) => s.instanceId)) });
const levels = ['resolver', 'context', 'router-context', 'router-legacy'];
const tuple = (player, model, effort) => ({ player, ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
const sonnet = tuple('claude', 'sonnet', 'medium');
const sol56 = tuple('codex', 'gpt-5.6-sol', 'medium');
const solOptions = ['Codex · GPT-6.1 Sol · Medium', 'Codex · GPT-5.6 Sol · Medium'];

function assertConstraints(actual, expected, label) {
  if (expected === 'auto') {
    assert.equal(actual, undefined, `${label}: ordinary AUTO has no explicit constraints`);
    return;
  }
  assert.ok(actual, `${label}: explicit intent must not disappear`);
  if (expected.stop) {
    assert.ok(actual.unresolved?.length, `${label}: stop must be represented as unresolved intent`);
    // S57.57 explicitly defines a missing reason as unknown for legacy structured errors.
    assert.ok(actual.unresolved.some((u) => (u.reason ?? 'unknown') === expected.stop), `${label}: ${expected.stop}`);
    if (expected.noOptions) assert.equal(actual.unresolved.find((u) => u.reason === expected.stop)?.options, undefined, `${label}: choices exceed the four-option bound`);
    if (expected.options) {
      const options = actual.unresolved.find((u) => u.reason === expected.stop && u.options)?.options;
      assert.ok(options, `${label}: bounded choices required`);
      assert.ok(options.length <= 4);
      assert.deepEqual(options.map((o) => o.label), expected.options, `${label}: exact catalogue-order labels`);
    }
    return;
  }
  assert.equal(actual.unresolved, undefined, `${label}: resolved constraints cannot carry a stop`);
  if (expected.excludedModels) assert.deepEqual(actual.excludedModels, expected.excludedModels, `${label}: explicit model exclusions`);
  // Check ABSENT dimensions too: recognition cannot manufacture a policy default.
  for (const [key, dimension] of [['player', 'playerType'], ['instance', 'playerInstanceId'], ['model', 'model'], ['effort', 'effort']]) {
    assert.equal(actual[dimension], expected[key], `${label}: constraint ${key}`);
  }
}

function assertDecision(result, expected, team, label, row) {
  if (expected.stop || row.unavailable || row.clarification === 'stale') {
    assert.equal(result.decision, undefined, `${label}: a stop must never silently choose a route`);
    assert.ok(result.error, `${label}: truthful stop message required`);
    if (row.unavailable) assert.match(result.error, /currently unavailable[\s\S]*did not choose another Player/i);
    if (row.clarification === 'stale') assert.match(result.error, /choose again/i);
    if (row.clarification !== 'stale') for (const option of expected.options || [])
      assert.ok(result.error.includes(option), `${label}: stop offers exact option ${option}`);
    for (const text of row.errorIncludes || []) assert.ok(result.error.toLowerCase().includes(text.toLowerCase()), `${label}: message includes ${text}`);
    return;
  }
  assert.equal(result.error, undefined, `${label}: unexpected error`);
  assert.ok(result.decision, `${label}: AUTO decision required`);
  const decision = result.decision;
  assert.equal(decision.gameId, GAME);
  assert.equal(decision.mode, 'auto');
  const candidate = team.find((s) => s.instanceId === decision.playerInstanceId);
  assert.ok(candidate, `${label}: chosen Player exists in fixture`);
  if (expected !== 'auto') {
    if (expected.player) assert.equal(candidate.playerType, expected.player, `${label}: Player`);
    if (expected.instance) assert.equal(decision.playerInstanceId, expected.instance, `${label}: instance`);
    if (expected.model) assert.equal(decision.model, expected.model, `${label}: model`);
    if (expected.effort) assert.equal(decision.effort, expected.effort, `${label}: effort`);
    assertConstraints(decision.constraints, expected, `${label}: carried intent`);
  }
  assert.ok(!decision.constraints?.excludedModels?.includes(decision.model), `${label}: selected model respects exclusions`);
  const chosenModel = candidate.capability.models.find((m) => m.id === decision.model);
  assert.ok(chosenModel, `${label}: model belongs to chosen Player`);
  assert.ok(chosenModel.supportedEfforts.includes(decision.effort), `${label}: effort supported by chosen model`);
}

function assertMatrixRow(row, enabled = levels) {
  const team = catalogues[row.catalogue || 'base']();
  if (enabled.includes('catalogue')) {
    const result = resolveCatalogueRoute(row.catalogueIntent, team);
    assert.equal(result.state, row.expect.stop === 'ambiguous' ? 'ambiguous' : row.expect.stop ? 'unavailable' : 'resolved');
    assertConstraints(result.constraints, row.expect, 'pure catalogue resolver');
    if (result.state !== 'unavailable') assert.ok(result.candidates.length);
    if (enabled.length === 1) return; // No prompt scanning or AUTO wiring is claimed in Slice 1.
  }
  const context = contextFor(team);
  const policies = createRoutingPolicies();
  const constraints = resolveSmartRouteConstraints({ prompt: row.prompt, candidates: team, ...context });
  if (enabled.includes('resolver')) assertConstraints(constraints, row.recognitionExpect || row.expect, 'resolver');
  let extra = {};
  if (row.clarification) {
    // Slice 6 seam: the shared computeRoute question supplies its own fingerprint.
    const router = new Router(new EventEmitter());
    router.setRouteContextProvider(() => context);
    const initial = router.computeRoute(GAME, row.prompt, team);
    assert.ok(initial.question?.fingerprint, 'clarification exposes the live question fingerprint');
    assert.ok(initial.question.options?.length <= 4);
    const clarification = { fingerprint: row.clarification === 'stale' ? 'stale-fixture-fingerprint' : initial.question.fingerprint, option: 1 };
    context.clarification = clarification;
    extra = { routeClarification: clarification };
  }
  if (enabled.includes('context')) assertDecision(
    computeContextAwareRoute(GAME, row.prompt, team, policies, context), row.expect, team, 'context', row);
  for (const withContext of [true, false]) {
    const label = withContext ? 'router-context' : 'router-legacy';
    if (!enabled.includes(label)) continue;
    const router = new Router(new EventEmitter());
    if (withContext) router.setRouteContextProvider(() => context);
    const preview = router.computeRoute(GAME, row.prompt, team, extra);
    const dispatch = router.computeRoute(GAME, row.prompt, team, extra);
    assertDecision(preview, row.expect, team, label, row);
    // Compare stable shared-computation truth, excluding stagedAt/wall-clock fields.
    const stable = (r) => ({ error: r.error, instance: r.decision?.playerInstanceId, model: r.decision?.model, effort: r.decision?.effort });
    assert.deepEqual(stable(preview), stable(dispatch), `${label}: preview = dispatch computation`);
  }
  if (row.legacyDirect) assertDecision(computeAutoRoute(GAME, row.prompt, team, policies), row.expect, team, 'direct legacy AUTO', row);
}

const seeds = [];
function add(id, group, prompt, expect, extra = {}) { seeds.push({ id: id.replace(/\n/g, ' ↵ '), group, prompt, expect, ...extra }); }
function shorthand(id, group, prompt, expect, extra = {}) { add(id, group, prompt, expect, { shorthand: true, ...extra }); }

add('FIELD FAILURE A — CODEX 5.6 sol Medium + AGENT Codex', 'permanent field', 'CODEX 5.6 sol Medium\n\nAGENT: Codex', sol56);
add('FIELD FAILURE B — Sonnet Medium + AGENT Claude', 'permanent field', 'Sonnet Medium\n\nAGENT: Claude', sonnet);
for (const [word, effort] of [['med', 'medium'], ['medium', 'medium'], ['low', 'low'], ['high', 'high']])
  shorthand(`Sonnet ${word}`, 'effort aliases', `Sonnet ${word}`, tuple('claude', 'sonnet', effort));
for (const word of ['extra high', 'xhigh', 'x-high', 'x high'])
  shorthand(`Sol 5.6 ${word}`, 'effort aliases', `Codex 5.6 Sol ${word}`, tuple('codex', 'gpt-5.6-sol', 'xhigh'));
shorthand('Sol 6.1 Ultra distinct from Max', 'effort aliases', 'Codex 6.1 Sol Ultra', tuple('codex', 'gpt-6.1-sol', 'ultra'));
for (const word of ['Max', 'Maximum']) shorthand(`Opus ${word}`, 'effort aliases', `Opus ${word}`, tuple('claude', 'opus', 'max'));
add('Sol 5.6 cannot Ultra', 'unsupported effort', '5.6 Sol Ultra', { stop: 'unsupported' }, { errorIncludes: ['low', 'medium', 'high', 'xhigh'] });
add('Pro cannot Medium', 'unsupported effort', 'Gemini 3.1 Pro Medium', { stop: 'unsupported' }, { errorIncludes: ['low', 'high'] });
for (const [prompt, expect] of [
  ['Opus High', tuple('claude', 'opus', 'high')], ['Fable High', tuple('claude', 'fable', 'high')],
  ['Astra High', tuple('codex', 'gpt-6-astra', 'high')], ['6.1 Sol Low', tuple('codex', 'gpt-6.1-sol', 'low')],
  ['5.6 Sol Medium', sol56], ['3.8 Flash Medium', tuple('antigravity', 'gemini-3.8-flash', 'medium')],
  ['Gemini 3.1 Pro High', tuple('antigravity', 'gemini-3.1-pro', 'high')]
]) shorthand(prompt, 'model-first shorthand', prompt, expect);
shorthand('synthetic future Luna', 'future catalogue', 'Luna Med', tuple('codex', 'gpt-7-luna', 'medium'), { catalogue: 'future' });
shorthand('synthetic live effort minimal', 'future catalogue', 'Luna minimal', tuple('codex', 'gpt-7-luna', 'minimal'), { catalogue: 'future' });
for (const prompt of ['Luna Med', 'Codex Luna High', '5.9 Sol Medium']) add(prompt, 'unknown model', prompt, { stop: 'unknown' });
for (const [prompt, expect] of [['Gemini', { player: 'antigravity' }], ['Gemini Medium', { player: 'antigravity', effort: 'medium' }], ['GPT High', { player: 'codex', effort: 'high' }]])
  add(prompt, 'provider/brand shorthand', prompt, expect);
for (const [prompt, expect] of [
  ['Send this to Sonnet Medium', sonnet], ['Route this to Codex 5.6 Sol Medium', sol56],
  ['Please run this on Claude Sonnet Med', sonnet], ['I would like this to go to Codex 6.1 Sol Low', tuple('codex', 'gpt-6.1-sol', 'low')],
  ['Use Sonnet Medium to fix the parser', sonnet], ['Fix it. Send this to Opus High.', tuple('claude', 'opus', 'high')]
]) add(prompt, 'carrier sentences', prompt, expect);
for (const prompt of ['Send this to Sonnet Medium, no rush', 'Send this to Sonnet Medium and report back']) add(prompt, 'carrier sentence tail safety', prompt, sonnet);
for (const [prompt, expect] of [
  ['five point six sol medium', sol56], ['five dot six sol medium', sol56], ['five six sol medium', sol56],
  ['codex six point one sol low', tuple('codex', 'gpt-6.1-sol', 'low')],
  ['three point eight flash medium', tuple('antigravity', 'gemini-3.8-flash', 'medium')],
  ['six one sol', tuple('codex', 'gpt-6.1-sol')]
]) shorthand(prompt, 'speech-to-text version forms', prompt, expect, { singleDimension: prompt === 'six one sol' });
add('spoken instance is not a version', 'speech safety', 'Codex one high', 'auto');
add('unknown spoken version', 'speech safety', 'five point nine sol medium', { stop: 'unknown' });
for (const [prompt, expect] of [
  ['Codex', 'auto'], ['Send this to Codex', { player: 'codex' }], ['Opus', tuple('claude', 'opus')],
  ['Medium', { effort: 'medium' }], ['Codex 5.6 Sol', tuple('codex', 'gpt-5.6-sol')],
  ['Codex Medium', { player: 'codex', effort: 'medium' }], ['Sonnet Medium', sonnet],
  ['Claude Sonnet Medium', sonnet]
]) shorthand(`partial ${prompt}`, 'partial constraints', prompt, expect, { singleDimension: ['Opus', 'Medium'].includes(prompt) });
for (const [prompt, expect, extra] of [
  ['Codex 5.6 Sol Medium\n\nAGENT: Codex', sol56, {}], ['Sonnet Medium\nAGENT: Claude', sonnet, {}],
  ['Codex Medium\nAGENT: Codex 2', { player: 'codex', instance: 'codex-matrix-2', effort: 'medium' }, { catalogue: 'twoCodex' }],
  ['Sol Medium\nMODEL: GPT-6.1 Sol', tuple('codex', 'gpt-6.1-sol', 'medium'), {}]
]) add(prompt, 'compatible structured + natural merge', prompt, expect, extra);
add('different Player statements', 'conflicting structured + natural merge', 'Sonnet Medium\nAGENT: Codex',
  { stop: 'contradictory', options: ['Claude · Sonnet · Medium', 'Codex'] });
add('different effort statements', 'conflicting structured + natural merge', 'Sonnet Medium\nREASONING: High', { stop: 'contradictory', options: ['Claude · Sonnet · Medium', 'High'] });
// This historical title's ALL-CAPS shape must remain intact across case crosses.
add('control title versus field', 'conflicting structured + natural merge', 'CLAUDE SONNET — REVIEW\nAGENT: Codex', { stop: 'contradictory' }, { controlTitle: true });
add('Sol ambiguity', 'ambiguity', 'Sol Medium', { stop: 'ambiguous', options: solOptions });
add('three Flash ambiguity', 'ambiguity', 'Flash Medium', { stop: 'ambiguous', options: ['AntiGravity · Gemini 3.8 Flash · Medium', 'AntiGravity · Gemini 3.7 Flash · Medium', 'AntiGravity · Gemini 3.6 Flash · Medium'] }, { catalogue: 'manyFlash' });
add('model on two Players', 'ambiguity', 'Sonnet Medium', { stop: 'ambiguous', options: ['Claude · Sonnet · Medium', 'AntiGravity · Claude Sonnet · Medium'] }, { catalogue: 'sharedSonnet' });
for (const prompt of ['Claude or Codex', 'Sonnet and Opus', 'Send this to Sonnet / Opus']) add(prompt, 'explicit choice / contradiction', prompt, { stop: 'contradictory' });

for (const prompt of [
  'This architecture supports Claude and Codex.', 'Compare Sonnet with Opus.', 'Sonnet vs Opus',
  'Documentation for GPT-5.6 Sol is below.', 'Coach wrote `Sonnet Medium`',
  'Review this.\nKeep the result concise.\nPreserve behavior.\n"Sonnet Medium"',
  'Not Opus', 'Claude Sonnet, not Opus', 'Examples:\n- Sonnet Medium\n- Opus High',
  'Priority: High', 'Example: Sonnet Medium', 'Priority High', 'Claude Sonnet — Adapter Problems',
  'Review this.\nKeep it concise.\nPreserve behavior.\nAvoid changes.\nOpus',
  Array.from({ length: 10 }, (_, i) => `Context paragraph ${i + 1}.`).join('\n') + '\nSonnet Medium',
  'Review this.\n```text\nSonnet Medium\nAGENT: Claude\n```',
  'Review this.\n| Model | Effort |\n| --- | --- |\n| Sonnet | Medium |',
  'Claude Sonnet Opus', 'Codex 5', 'Claude 3 Sonnet'
]) add(prompt, 'false positives', prompt, 'auto', { active: ['This architecture supports Claude and Codex.', 'Compare Sonnet with Opus.', 'Documentation for GPT-5.6 Sol is below.', 'Priority: High'].includes(prompt) });
add('explicit-effort title relaxation', 'carrier sentences', 'Sonnet Medium — Fix parser', sonnet);
add('Codex off field', 'unavailable Player', 'Codex Medium', { player: 'codex', effort: 'medium' }, { catalogue: 'noCodex', unavailable: true });
add('constraint-blind legacy AUTO guard', 'legacy AUTO entry guard', 'Sonnet Medium', sonnet, { legacyDirect: true });
add('clarification option 1 shared by staged and dispatch', 'future clarification seam', 'Sol Medium', tuple('codex', 'gpt-6.1-sol', 'medium'),
  { clarification: 'selected', recognitionExpect: { stop: 'ambiguous', options: solOptions } });
add('stale clarification must re-ask', 'future clarification seam', 'Sol Medium', { stop: 'ambiguous', options: solOptions }, { clarification: 'stale' });
add('structured tuple must survive legacy entry', 'structured control', 'AGENT: Claude\nMODEL: Sonnet\nREASONING: Medium', sonnet);
add('already supported unknown structured model', 'active structured control', 'AGENT: Claude\nMODEL: NonexistentFixtureModel', { stop: 'unknown' }, { active: true });

// Slice 2 statement/guard fixtures, using the retained opening and structured syntax.
for (const [id, prompt, expect, extra] of [
  ['structured model + natural effort', 'Medium\nMODEL: Sonnet', sonnet, {}],
  ['duplicate compatible statements', 'Sonnet Medium\nAGENT: Claude\nMODEL: Sonnet\nMODEL: Sonnet\nREASONING: Medium', sonnet, {}],
  ['contradictory Players', 'AGENT: Claude\nAGENT: Codex', { stop: 'contradictory' }, {}],
  ['contradictory models', 'AGENT: Claude\nMODEL: Sonnet\nMODEL: Opus', { stop: 'contradictory' }, {}],
  ['contradictory envelope has one option', 'Sonnet Medium\nAGENT: Codex\nMODEL: GPT-5.6 Sol\nREASONING: Medium', { stop: 'contradictory', options: ['Claude \u00b7 Sonnet \u00b7 Medium', 'Codex \u00b7 GPT-5.6 Sol \u00b7 Medium'] }, {}],
  ['contradictory efforts', 'Sonnet Medium\nREASONING: High', { stop: 'contradictory' }, {}],
  ['partial convergence', 'Codex Medium\nMODEL: GPT-5.6 Sol', sol56, {}],
  ['unknown explicit model persists', 'Codex MissingFixtureModel High\nAGENT: Codex', { stop: 'unknown' }, {}],
  ['model-first owning Player', '5.6 Sol Medium\nAGENT: Codex', sol56, {}],
  ['known off-field Player remains unavailable', 'Codex Medium', { player: 'codex', effort: 'medium' }, { catalogue: 'noCodex', unavailable: true }]
]) add(id, 'slice 2 statement proof', prompt, expect, extra);

// Slice 3 uses the existing case/classification matrix, not another harness.
for (const [id, prompt, expect] of [
  ['comment presentation at opening', '<!-- note --><!-- another -->Sonnet Medium', sonnet],
  ['single-column separator does not count', atNaturalPosition(10, '| --- |\nSonnet Medium'), sonnet],
  ['leading blanks', '\n'.repeat(20) + 'Sonnet Medium', sonnet],
  ['ignored opening structure', '<!-- comment\nSonnet High\n-->\n```text\nOpus High\n```\n> Opus High\n---\nSonnet Medium', sonnet],
  ['interior structured intersection', 'AGENT: Claude\nTask: X\nSonnet Medium', sonnet],
  ['interior contradiction', 'Review this.\nSonnet Medium\nOpus High', { stop: 'contradictory' }],
  ['interior duplicate', 'Review this.\nSonnet Medium\nSonnet Medium', sonnet],
  ['interior unknown', 'Review this.\nCodex MissingFixtureModel High', { stop: 'unknown' }],
  ['later emphasis', '# HEADING\n**Sonnet Medium**', sonnet],
  ['later list', 'Review this.\n1. Sonnet Medium', 'auto'],
  ['later backticks', 'Review this.\n`Sonnet Medium`', 'auto'],
  ['fence comment does not escape', 'Review this.\n```text\n<!--\nSonnet Medium\n```\nOpus High', tuple('claude', 'opus', 'high')],
  ['later prose mentions', 'Review this.\nWe need to compare how Claude and Codex handle this system.\nThe Sonnet implementation had medium complexity.', 'auto'],
  ['later title', 'Review this.\nCLAUDE SONNET \u2014 REVIEW', 'auto'],
  ['foreign field', 'Review this.\nExample: Use Claude on Sonnet', 'auto'],
  ['excluded model outside window', Array(10).fill('Context.').join('\n') + '\nNever use Opus', 'auto'],
  ['imperative position ten', atNaturalPosition(10, 'Use Claude to fix the parser.'), { player: 'claude' }],
  ['imperative position eleven', atNaturalPosition(11, 'Use Claude to fix the parser.'), 'auto'],
  ['structured depth unchanged', atNaturalPosition(15, 'AGENT: Claude'), { player: 'claude' }],
  ['weak effort below opening', 'Review this.\nMedium', 'auto']
]) add(id, 'slice 3 safety', prompt, expect);
add('Scout after ignored structure', 'slice 3 safety', '<!-- comment -->\nScout this play.', { player: 'scout' }, { unavailable: true });
function atNaturalPosition(position, text) { return [...Array(position - 1).fill('Context.'), text].join('\n'); }

// Slice 4: use the same position/case/classification and four-level assertions.
shorthand('scoped choice positions', 'slice 4 carriers', 'Use Sonnet Medium or Opus High', { stop: 'contradictory' });
shorthand('negative alternative positions', 'slice 4 carriers', 'Use Claude, not Opus', { player: 'claude', excludedModels: ['opus'] });
shorthand('negative only positions', 'slice 4 carriers', "Don't use Opus", { excludedModels: ['opus'] });

for (const text of ['Use Sonnet Medium', 'Please use Sonnet Medium', 'Route this to Claude Sonnet Medium',
  'Have Codex 5.6 Sol Medium handle this', 'Run this with Claude Sonnet Medium',
  'Could you route this to Claude Sonnet Medium?', 'Please use Sonnet Medium for this.',
  'Dispatch this off to Sonnet Medium', 'Kindly assign this play to Sonnet Medium',
  'Hand this off to Sonnet Medium', 'Pass this to Sonnet Medium', 'I want this to run on Sonnet Medium',
  'Use Sonnet Medium to compare Opus', 'Use Sonnet Medium, then report back', 'Use Medium'])
  shorthand(text, 'slice 4 carriers', text, text.startsWith('Have ') ? sol56 : text === 'Use Medium' ? { effort: 'medium' } : sonnet);
for (const [id, text, expect, extra] of [
  ['compatible carrier envelope', 'AGENT: Claude\nPlease use Sonnet Medium', sonnet, {}],
  ['contradictory carrier envelope', 'AGENT: Codex\nPlease use Sonnet Medium', { stop: 'contradictory' }, {}],
  ['positive model with negative alternative', 'Use Sonnet Medium, not Opus High.', { ...sonnet, excludedModels: ['opus'] }, {}],
  ['positive effort with negative alternative', 'Use Sonnet Medium, not High.', sonnet, {}],
  ['partial Player excludes model', 'Use Claude, not Opus.', { player: 'claude', excludedModels: ['opus'] }, {}],
  ['negative only', "Don't use Opus.", { excludedModels: ['opus'] }, {}],
  ['positive and its own exclusion', 'Use Sonnet Medium, not Sonnet High.', { stop: 'contradictory' }, {}],
  ['same-line positive contradiction', 'Use Sonnet. Use Opus.', { stop: 'contradictory' }, {}],
  ['unresolved carrier alternatives', 'Use Sonnet Medium or Opus High.', { stop: 'contradictory', options: ['Claude \u00b7 Sonnet \u00b7 Medium', 'Claude \u00b7 Opus \u00b7 High'] }, {}],
  ['ambiguous family carrier', 'Use Sol Medium', { stop: 'ambiguous', options: solOptions }, {}],
  ['unknown carrier catalogue', 'Use Luna Medium', { stop: 'unknown' }, {}],
  ['future carrier catalogue', 'Use Luna Medium', tuple('codex', 'gpt-7-luna', 'medium'), { catalogue: 'future' }],
  ['choice unknown alternative', 'Use Sonnet Medium or Luna Medium', { stop: 'unknown' }, {}],
  ['negative effort conflict', 'Use Sonnet Medium, not Medium', { stop: 'contradictory' }, {}],
  ['negative effort partial remains truthful', 'Use Sonnet, not High', { stop: 'ambiguous' }, {}],
  ['negative only effort remains truthful', "Don't use High", { stop: 'ambiguous' }, {}],
  ['negated alternative cannot override field', 'Use Sonnet Medium, not Opus High\nMODEL: Opus', { stop: 'contradictory' }, {}],
  ['single surviving effort preserves model ambiguity', 'Use Sol, not High', { stop: 'ambiguous' }, { catalogue: 'singleSolEffort' }],
  ['choice options bounded', 'Use Sonnet or Opus or Fable or Astra or 6.1 Sol', { stop: 'contradictory', noOptions: true }, {}],
  ['opening quoted carrier presentation', '"Use Sonnet Medium"', sonnet, {}],
  ['carrier in fence', 'Review this.\n```text\nPlease use Sonnet Medium\n```', 'auto', {}],
  ['carrier in quote', 'Review this.\n"Please use Sonnet Medium"', 'auto', {}],
  ['carrier in later list', 'Review this.\n- Please use Sonnet Medium', 'auto', {}],
  ['title explicit effort mixed case', 'CODEX 5.6 sol Medium \u2014 Architecture', sol56, {}],
  ['title effort without owner', 'Sonnet Medium \u2014 Fix parser', sonnet, {}],
  ['title effort later is ineligible', 'Review this.\nSonnet Medium \u2014 Fix parser', 'auto', {}]
]) add(id, 'slice 4 authority', text, expect, extra);
for (const text of ['We should use the Sonnet implementation as a reference.', 'I used Claude Medium yesterday.',
  "Let's compare Codex and Sonnet.", 'The team may use Medium complexity for this component.',
  'This is not an Opus-level architecture task.', 'MEDIUM PRIORITY', 'HIGH LEVEL ARCHITECTURE',
  'LOW RISK IMPLEMENTATION', 'MEDIUM \u2014 PRIORITY', 'High \u2014 Level architecture', 'Use the Sonnet implementation as a reference.', 'Review this.\nExample: Please use Sonnet Medium'])
  add(text, 'slice 4 prose safety', text, 'auto');

// Slice 5: speech, the unified line-1 typo rule and Claude family version decoration.
for (const [prompt, expect, extra] of [
  ['Sonnett med', sonnet, {}], ['Gemeni med', { player: 'antigravity', effort: 'medium' }, {}],
  ['Fabel High', tuple('claude', 'fable', 'high'), {}]
]) shorthand(prompt, 'slice 5 typos', prompt, expect, { lineOneOnly: true, ...extra });
add('Player typo on line 1', 'slice 5 typos', 'Cluade Sonnet Medium', sonnet);
shorthand('ambiguous fuzzy match does not guess', 'slice 5 typo safety', 'Sonnez Medium', 'auto', { catalogue: 'typoTwin' });
for (const prompt of ['Opuss med', 'Fabl High', 'Sonnet medum', 'Claude Sonnet Hihg']) add(prompt, 'slice 5 typo safety', prompt, 'auto');
for (const prompt of ['Codex 5.7 Sol Medium', 'Gemini 3.9 Flash Medium']) add(prompt, 'slice 5 typo safety', prompt, { stop: 'unknown' });
add('typo does not reach structured MODEL', 'slice 5 typo safety', 'AGENT: Claude\nMODEL: Sonett\nREASONING: Medium', { stop: 'unknown' });
add('typo is not a Scout directive', 'slice 5 typo safety', 'SCUOT FORMATION — OPUS SCOPE PACK', 'auto');

shorthand('spoken inside approved carrier', 'slice 5 speech', 'Please use five point six sol medium', sol56);
shorthand('spoken Player and version', 'slice 5 speech', 'Codex six point one sol low', tuple('codex', 'gpt-6.1-sol', 'low'));
add('structured spoken MODEL', 'slice 5 speech', 'MODEL: GPT five point six sol\nREASONING: Medium', sol56);
add('structured spoken MODEL with Player', 'slice 5 speech', 'AGENT: Codex\nMODEL: GPT six point one sol\nREASONING: Low', tuple('codex', 'gpt-6.1-sol', 'low'));
add('unsupported spoken version in carrier', 'slice 5 speech', 'Use nine point nine sol medium', { stop: 'unknown' });
add('unsupported structured spoken MODEL', 'slice 5 speech', 'AGENT: Codex\nMODEL: GPT nine point nine sol', { stop: 'unknown' });
shorthand('future catalogue spoken version', 'slice 5 speech', 'seven point two orion high', tuple('codex', 'gpt-7.2-orion', 'high'), { catalogue: 'futureVersion' });
for (const prompt of ['Discuss version five point six of the specification.', 'We measured five point six percent growth.',
  'Please point to the file.', 'Review this.\n1. Do step one, then step two.', 'Version five point six is documented.'])
  add(prompt, 'slice 5 prose safety', prompt, 'auto');

for (const [id, prompt, expect, extra] of [
  ['Field A: CLAUDE SONNET 5.5 - MEDIUM', 'CLAUDE SONNET 5.5 - MEDIUM', sonnet, {}],
  ['Field A: em dash', 'CLAUDE SONNET 5.5 — MEDIUM', sonnet, {}],
  ['Field B: model-first + AGENT Claude', 'SONNET 5.5 MEDIUM\nAGENT: Claude', sonnet, {}],
  ['future version decoration 7.2', 'CLAUDE SONNET 7.2 MEDIUM', sonnet, {}],
  ['exact live versioned model wins', 'CLAUDE SONNET 5.5 MEDIUM', tuple('claude', 'sonnet-5.5', 'medium'), { catalogue: 'sonnetVersions' }],
  ['version-distinct candidates are not collapsed', 'CLAUDE SONNET 7.2 MEDIUM', { stop: 'unknown' }, { catalogue: 'sonnetVersions' }],
  ['only versioned models, unlisted version', 'CLAUDE SONNET 7.2 MEDIUM', { stop: 'unknown' }, { catalogue: 'onlyVersionedSonnets' }],
  ['Player scope: Claude catalogue has only Sonnet', 'CLAUDE SONNET 5.5 MEDIUM', sonnet, { catalogue: 'agVersionedClaude' }],
  ['Player scope: AntiGravity exact version', 'AGENT: AntiGravity\nSONNET 5.5 MEDIUM', tuple('antigravity', 'claude-sonnet-5.5', 'medium'), { catalogue: 'agVersionedClaude' }],
  ['Player scope: exact live versioned model unscoped', 'SONNET 5.5 MEDIUM', tuple('antigravity', 'claude-sonnet-5.5', 'medium'), { catalogue: 'agVersionedClaude' }],
  // S57.72: an explicit Player scopes a Player-less model/version statement; intersection and contradictions are unchanged.
  ['S57.72 AGENT Claude scopes SONNET 5.5 away from AntiGravity exact model', 'SONNET 5.5 MEDIUM\nAGENT: Claude', sonnet, { catalogue: 'agVersionedClaude' }],
  ['S57.72 exact versioned model inside the scoped Player wins', 'SONNET 5.5 MEDIUM\nAGENT: Claude', tuple('claude', 'sonnet-5.5', 'medium'), { catalogue: 'sonnetVersions' }],
  ['S57.72 scoped to a Player lacking the model still contradicts', 'SONNET 5.5 MEDIUM\nAGENT: Codex', { stop: 'contradictory' }, { catalogue: 'agVersionedClaude' }],
  ['S57.72 scoped ambiguity stays ambiguity', 'Sol Medium\nAGENT: Codex', { stop: 'ambiguous', options: solOptions }, {}]
]) add(id, 'slice 5 decoration', prompt, expect, extra);

const bodies = {
  architecture: 'Design the architecture and system boundaries. Review tradeoffs, invariants, schema migration and security risks.',
  implementation: 'Implement the function and add unit tests. Fix the bug in the code and refactor the component.',
  quick: 'Quick small task: rename a typo in a comment.'
};
// Explicit components are fixture data, not a natural-language parser. Later slices
// must still prove the existing front-door/context/Router levels from the prompt.
const componentCases = new Map([
  ...['med', 'medium', 'low', 'high'].map((effort) => [`Sonnet ${effort}`, { model: 'Sonnet', effort }]),
  ...['extra high', 'xhigh', 'x-high', 'x high'].map((effort) => [`Codex 5.6 Sol ${effort}`, { playerType: 'Codex', model: '5.6 Sol', effort }]),
  ['Codex 6.1 Sol Ultra', { playerType: 'Codex', model: '6.1 Sol', effort: 'Ultra' }],
  ...['Max', 'Maximum'].map((effort) => [`Opus ${effort}`, { model: 'Opus', effort }]),
  ['5.6 Sol Ultra', { model: '5.6 Sol', effort: 'Ultra' }],
  ['Gemini 3.1 Pro Medium', { model: 'Gemini 3.1 Pro', effort: 'Medium' }],
  ...[
    ['Opus', 'High'], ['Fable', 'High'], ['Astra', 'High'], ['6.1 Sol', 'Low'],
    ['5.6 Sol', 'Medium'], ['3.8 Flash', 'Medium'], ['Gemini 3.1 Pro', 'High'],
    ['Luna', 'Med'], ['Luna', 'minimal'], ['5.9 Sol', 'Medium'], ['Sol', 'Medium'], ['Flash', 'Medium'], ['Sonnet', 'Medium']
  ].map(([model, effort]) => [`${model} ${effort}`, { model, effort }]),
  ['Codex Luna High', { playerType: 'Codex', model: 'Luna', effort: 'High' }],
  ['Gemini', { model: 'Gemini' }], ['Gemini Medium', { model: 'Gemini', effort: 'Medium' }], ['GPT High', { model: 'GPT', effort: 'High' }],
  ['Opus', { model: 'Opus' }], ['Medium', { effort: 'Medium' }],
  ['Codex 5.6 Sol', { playerType: 'Codex', model: '5.6 Sol' }],
  ['Codex Medium', { playerType: 'Codex', effort: 'Medium' }],
  ['Claude Sonnet Medium', { playerType: 'Claude', model: 'Sonnet', effort: 'Medium' }]
]);
const catalogueGroups = new Set(['effort aliases', 'unsupported effort', 'model-first shorthand', 'future catalogue',
  'unknown model', 'provider/brand shorthand', 'partial constraints', 'ambiguity']);
const cases = {
  original: (s) => s,
  lower: (s) => s.toLowerCase(),
  title: (s) => s.replace(/[a-z]+/gi, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  upper: (s) => s.toUpperCase(),
  mixed: (s) => { let i = 0; return s.replace(/[a-z]/gi, (c) => i++ % 2 ? c.toUpperCase() : c.toLowerCase()); }
};
function atMeaningfulLine(prompt, line) {
  if (line === 1) return prompt;
  if (line === 2) return `# HEADING\n\n${prompt}`;
  if (line === 3) return `Task: X\nDate: Y\n\n${prompt}`;
  const filler = Array.from({ length: line - 1 }, (_, i) => `Context paragraph ${i + 1}.`);
  // Fence/quote/comment/rule/table-separator material must not consume natural lines.
  filler.splice(4, 0, '', '```text\nMODEL: NotRoutingContent\n```', '> quoted example', '<!-- comment -->', '---', '| --- | --- |', '');
  return [...filler, prompt].join('\n');
}

const matrix = [];
for (const seed of seeds) {
  const positions = seed.shorthand && (!seed.prompt.startsWith('Send ') || seed.group === 'slice 4 carriers') ? [1, 2, 3, 10, 11] : [1];
  for (const [caseName, transform] of Object.entries(cases)) {
    for (const position of positions) {
      for (const [bodyName, body] of Object.entries(bodies)) {
        let expect = seed.expect;
        // Uppercasing this descriptive heading changes it into an already-valid
        // ALL-CAPS control title. Preserve both contracts rather than pretending
        // this presentation-sensitive grammar is case-independent.
        if (seed.prompt === 'Claude Sonnet \u2014 Adapter Problems' && caseName === 'upper') expect = tuple('claude', 'sonnet');
        if (seed.shorthand && (position === 11 || (seed.singleDimension && position !== 1))) expect = 'auto';
        // The unified typo rule is natural line 1 only; later lines never fuzzy match.
        if (seed.lineOneOnly && position !== 1) expect = 'auto';
        // ALL-CAPS is structure: preserve the title marker while crossing field-value case.
        const casedPrompt = seed.controlTitle ? seed.prompt.split('\n').map((line, i) => i === 0 ? line : transform(line)).join('\n') : transform(seed.prompt);
        const components = catalogueGroups.has(seed.group) ? componentCases.get(seed.prompt) : undefined;
        matrix.push({ ...seed, expect, position, naturalComponents: Boolean(seed.shorthand && !/^Send /i.test(seed.prompt)),
          ...(components ? { catalogueIntent: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, transform(value)])) } : {}),
          id: `${seed.group} / ${seed.id} / ${caseName} / line ${position} / ${bodyName}`,
          prompt: `${atMeaningfulLine(casedPrompt, position)}\n\n${body}`,
          active: Boolean(seed.active && position === 1) });
      }
    }
  }
}

const slice2Groups = new Set(['permanent field', 'compatible structured + natural merge', 'conflicting structured + natural merge', 'legacy AUTO entry guard', 'structured control', 'slice 2 statement proof']);
const slice3PositionGroups = new Set(['effort aliases', 'model-first shorthand', 'future catalogue', 'partial constraints']);
const enabledLevels = (row) => row.active || row.group === 'false positives' || row.group === 'slice 3 safety'
  || (row.naturalComponents && slice3PositionGroups.has(row.group))
  || ['carrier sentences', 'carrier sentence tail safety', 'explicit choice / contradiction', 'slice 4 carriers', 'slice 4 authority', 'slice 4 prose safety',
    'speech-to-text version forms', 'speech safety', 'slice 5 typos', 'slice 5 typo safety', 'slice 5 speech', 'slice 5 prose safety', 'slice 5 decoration', 'future clarification seam', 'unavailable Player'].includes(row.group)
  || row.id.includes('partial Send this to Codex')
  || (row.position === 1 && (row.catalogueIntent || slice2Groups.has(row.group))) ? levels : row.activeLevels || [];
for (const row of matrix) {
  // Explicit allowlist, never runtime auto-detection of whether future truth passes.
  // Later slices can activate resolver alone before wiring downstream recognition.
  const enabled = enabledLevels(row);
  if (!enabled.length) test.todo(`S57.57 ${row.id}`);
  else test(`S57.57 ${row.id}`, () => assertMatrixRow(row, enabled));
}
test('S57.57 harness: generated bodies really exercise three task classifications', () => {
  for (const [expected, body] of Object.entries(bodies)) assert.equal(classifyTask(body), expected);
});

test('S57.66 pure: every fixture model/effort tuple resolves independently of component order and case', () => {
  for (const row of catalogueRouteTuples(catalogues.future())) {
    const playerFirst = resolveCatalogueRoute({ playerType: row.playerType.toUpperCase(), model: row.model.toUpperCase(), effort: row.effort.toUpperCase() }, catalogues.future());
    const modelFirst = resolveCatalogueRoute({ model: row.model, effort: row.effort, playerType: row.playerType }, catalogues.future());
    assert.equal(playerFirst.state, 'resolved');
    assert.deepEqual(playerFirst.constraints, modelFirst.constraints);
    assertConstraints(playerFirst.constraints, tuple(row.playerType, row.model, row.effort), 'fixture tuple');
  }
});
test('S57.66 pure: partial intent preserves unnamed dimensions and all compatible candidates', () => {
  for (const [intent, expected] of [
    [{ playerType: 'Codex' }, { player: 'codex' }],
    [{ model: 'Opus' }, tuple('claude', 'opus')],
    [{ effort: 'Med' }, { effort: 'medium' }],
    [{ playerType: 'Codex', effort: 'Medium' }, { player: 'codex', effort: 'medium' }],
    [{ playerType: 'Codex', model: '5.6 Sol' }, tuple('codex', 'gpt-5.6-sol')]
  ]) {
    const result = resolveCatalogueRoute(intent, baseCatalogue());
    assert.equal(result.state, 'resolved');
    assert.ok(result.candidates.length > 1, 'unnamed dimensions are not silently collapsed');
    assertConstraints(result.constraints, expected, 'partial intent');
  }
});
test('S57.66 pure: unavailable and incompatible components fail without substituting another route', () => {
  for (const [intent, dimension] of [
    [{ model: 'AbsentFixtureModel' }, 'model'],
    [{ model: 'Sonnet', effort: 'absent-effort' }, 'effort'],
    [{ playerType: 'Codex', model: 'Sonnet' }, 'model'],
    [{ playerType: 'Codex', playerInstanceId: 'missing-seat' }, 'player']
  ]) {
    const result = resolveCatalogueRoute(intent, baseCatalogue());
    assert.equal(result.state, 'unavailable');
    assert.deepEqual(result.candidates, []);
    assert.equal(result.constraints.unresolved[0].dimension, dimension);
  }
  const absentPlayer = resolveCatalogueRoute({ playerType: 'Codex' }, catalogues.noCodex());
  assert.equal(absentPlayer.state, 'unavailable');
  assert.equal(absentPlayer.constraints.playerType, 'codex');
});
test('S57.66 pure: ultra and max remain distinct even when one model offers both', () => {
  const team = baseCatalogue();
  team[1].capability.models[0].supportedEfforts.push('max');
  for (const effort of ['ultra', 'max']) {
    const result = resolveCatalogueRoute({ model: '6.1 Sol', effort }, team);
    assert.equal(result.state, 'resolved');
    assert.equal(result.constraints.effort, effort);
    assert.ok(result.candidates.every((row) => row.effort === effort));
  }
});
test('S57.66 pure: an explicit effort narrows an ambiguous family and duplicate seats remain unspecified', () => {
  const ambiguous = resolveCatalogueRoute({ model: 'Sol', effort: 'Medium' }, baseCatalogue());
  assert.equal(ambiguous.state, 'ambiguous');
  const narrowed = resolveCatalogueRoute({ model: 'Sol', effort: 'Ultra' }, catalogues.twoCodex());
  assert.equal(narrowed.state, 'resolved');
  assertConstraints(narrowed.constraints, tuple('codex', 'gpt-6.1-sol', 'ultra'), 'effort intersection');
  assert.equal(narrowed.candidates.length, 2, 'AUTO still owns unnamed seat choice');
  const exactSeat = resolveCatalogueRoute({ model: 'Sol', effort: 'Ultra', playerInstanceId: 'codex-matrix-2' }, catalogues.twoCodex());
  assert.equal(exactSeat.candidates.length, 1);
  assert.equal(exactSeat.constraints.playerInstanceId, 'codex-matrix-2');
});
test('S57.66 pure: brand ownership is dynamic and single-model identities remain models', () => {
  const team = baseCatalogue();
  assertConstraints(resolveCatalogueRoute({ model: 'Gemini' }, team).constraints, { player: 'antigravity' }, 'dynamic brand');
  team[2].capability.models.push(model('future-novel', 'Novel', ['medium']));
  assert.equal(resolveCatalogueRoute({ model: 'Gemini' }, team).state, 'ambiguous', 'brand stops being universal when catalogue changes');
  team[2].capability.models = [team[2].capability.models[0]];
  assertConstraints(resolveCatalogueRoute({ model: 'Gemini' }, team).constraints, tuple('antigravity', 'gemini-3.8-flash'), 'single model');
});
test('S57.66 pure: catalogue order affects option display order, never candidate truth or resolution', () => {
  const team = catalogues.future();
  const reversed = structuredClone(team).reverse();
  for (const seat of reversed) { seat.capability.models.reverse(); for (const model of seat.capability.models) model.supportedEfforts.reverse(); }
  const stable = (result) => ({ state: result.state,
    candidates: result.candidates.map((row) => JSON.stringify(row)).sort(),
    dimensions: Object.fromEntries(['playerType', 'playerInstanceId', 'model', 'effort'].map((key) => [key, result.constraints[key]])) });
  for (const intent of [{ model: 'Luna', effort: 'minimal' }, { model: 'Sol', effort: 'Med' }, { playerType: 'Codex' }, { effort: 'High' }])
    assert.deepEqual(stable(resolveCatalogueRoute(intent, team)), stable(resolveCatalogueRoute(intent, reversed)));
  const before = structuredClone(team);
  resolveCatalogueRoute({ model: 'Luna', effort: 'Medium' }, team);
  assert.deepEqual(team, before, 'resolution does not mutate the supplied catalogue');
});
test('S57.66 pure: capability tuples omit non-reasoning transports and never synthesize default efforts', () => {
  const team = baseCatalogue();
  team[0].transport = 'legacy';
  team[1].executionType = 'direct-shell';
  assert.ok(catalogueRouteTuples(team).every((row) => row.playerType === 'antigravity'));
  team[2].capability.models[0].supportedEfforts = [];
  const result = resolveCatalogueRoute({ model: '3.8 Flash' }, team);
  assert.equal(result.state, 'resolved');
  assert.equal(result.constraints.effort, undefined);
  assert.equal(result.candidates[0].effort, undefined);
});
test('S57.67 downstream: a policy cannot escape explicit effort through an invalid model selection', () => {
  const team = baseCatalogue();
  const policies = createRoutingPolicies();
  const invalid = { selectModel: () => ({ modelId: 'missing-policy-model', modelDisplayName: 'Invalid', effort: 'high', rationale: 'test fallback' }) };
  for (const seat of team) policies.set(seat.capability.provider, invalid);
  for (const context of [undefined, contextFor(team)]) {
    const result = context ? computeContextAwareRoute(GAME, 'Medium', team, policies, context) : computeAutoRoute(GAME, 'Medium', team, policies);
    assert.equal(result.decision, undefined);
    assert.match(result.error, /currently unavailable.*did not choose another route/i);
  }
});

test('S57.67 merge: candidate intersection and resolved dimensions do not depend on catalogue order', () => {
  const team = baseCatalogue();
  for (const prompt of ['Sonnet Medium\nAGENT: Claude', 'Sol Medium\nMODEL: GPT-6.1 Sol', 'Codex Medium\nMODEL: GPT-5.6 Sol']) {
    const original = resolveSmartRouteConstraints({ prompt, candidates: team });
    const reversed = resolveSmartRouteConstraints({ prompt, candidates: structuredClone(team).reverse() });
    assert.deepEqual(original, reversed);
  }
});

test('S57.67 merge: a shared structured Player alias stays ambiguous until another named dimension settles it', () => {
  const team = baseCatalogue();
  team[0].fieldLabel = team[1].fieldLabel = 'Helper';
  const ambiguous = resolveSmartRouteConstraints({ prompt: 'AGENT: Helper Agent', candidates: team });
  assert.equal(ambiguous.unresolved[0].reason, 'ambiguous');
  assertConstraints(resolveSmartRouteConstraints({ prompt: 'Sonnet Medium\nAGENT: Helper Agent', candidates: team }), sonnet, 'model settles shared alias');
});

test('S57.67 boundary: body/fenced field presence cannot select a competing recognizer', () => {
  const team = baseCatalogue();
  for (const suffix of ['\n```text\nAGENT: Codex\n```', '\n' + Array.from({ length: 16 }, () => 'Context prose.').join('\n') + '\nAGENT: Codex']) {
    assertConstraints(resolveSmartRouteConstraints({ prompt: 'Sonnet Medium' + suffix, candidates: team }), sonnet, 'opening owns locality');
  }
  assertConstraints(resolveSmartRouteConstraints({ prompt: 'Review this.\nSonnet Medium', candidates: team }), sonnet, 'Slice 3 eligible interior shorthand');
});

for (const [field, prompt, expected] of [
  ['A', 'CODEX 5.6 sol Medium\n\nAGENT: Codex', sol56],
  ['B', 'Sonnet Medium\n\nAGENT: Claude', sonnet]
]) test(`S57.67 FIELD FAILURE ${field}: actual dispatch frame equals staged tuple, with and without context`, async () => {
  for (const withContext of [true, false]) {
    const team = baseCatalogue();
    const frames = [];
    const registry = new StadiumRegistry();
    registry.registerSession({ instanceId: 'matrix-stadium-session', stadiumId: 'matrix-stadium', name: 'Matrix', platform: 'win32',
      socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
      game: { gameId: GAME, displayName: 'Matrix Game', fingerprintSource: 'test' }, rootFsPath: 'C:/MatrixGame',
      roster: [], capabilities: team, reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: [] });
    const router = new Router(registry);
    if (withContext) router.setRouteContextProvider(() => contextFor(team));
    const payload = `${prompt}\n\n${bodies.architecture}`;
    const staged = router.computeRoute(GAME, payload, team);
    assertDecision(staged, expected, team, 'stage', {});
    const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt: payload });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = frames.find((entry) => entry.method === 'dispatch.request');
    if (frame) router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'matrix-stadium', gameId: GAME,
      playerInstanceId: frame.params.playerInstanceId, turnRef: 'matrix-turn', acceptedAt: Date.now() });
    const dispatched = await pending;
    assert.equal(dispatched.success, true, dispatched.message);
    assert.ok(frame);
    assert.deepEqual([frame.params.playerInstanceId, frame.params.model, frame.params.effort],
      [staged.decision.playerInstanceId, expected.model, expected.effort]);
    assert.equal(frame.params.prompt.slice(0, payload.length), payload, 'original Play remains intact before existing provenance suffix');
  }
});
console.log(`S57.57 MATRIX: ${seeds.length} seeds; ${matrix.length} rows; ${matrix.filter((r) => enabledLevels(r).length).length} active; ${matrix.filter((r) => !enabledLevels(r).length).length} todo; catalogue-only=${matrix.filter((r) => enabledLevels(r)[0] === 'catalogue').length}; front-door levels=${levels.join(',')}`);
