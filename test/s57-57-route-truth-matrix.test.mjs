/** S57.57 / S57.58 Slice 0: future truth, not today's parser behavior.
 * Change a row's active flag (or activeLevels) only in the slice that proves it.
 * All catalogue facts below are synthetic test inputs, never production truth.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { resolveSmartRouteConstraints } from '../out/control-plane/smart-route-resolver.js';
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
  noCodex: () => baseCatalogue().filter((s) => s.playerType !== 'codex')
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
    if (expected.options) {
      const options = actual.unresolved.find((u) => u.reason === expected.stop && u.options)?.options;
      assert.ok(options, `${label}: bounded choices required`);
      assert.ok(options.length <= 4);
      assert.deepEqual(options.map((o) => o.label), expected.options, `${label}: exact catalogue-order labels`);
    }
    return;
  }
  assert.equal(actual.unresolved, undefined, `${label}: resolved constraints cannot carry a stop`);
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
  const chosenModel = candidate.capability.models.find((m) => m.id === decision.model);
  assert.ok(chosenModel, `${label}: model belongs to chosen Player`);
  assert.ok(chosenModel.supportedEfforts.includes(decision.effort), `${label}: effort supported by chosen model`);
}

function assertMatrixRow(row, enabled = levels) {
  const team = catalogues[row.catalogue || 'base']();
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

const bodies = {
  architecture: 'Design the architecture and system boundaries. Review tradeoffs, invariants, schema migration and security risks.',
  implementation: 'Implement the function and add unit tests. Fix the bug in the code and refactor the component.',
  quick: 'Quick small task: rename a typo in a comment.'
};
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
  const positions = seed.shorthand && !seed.prompt.startsWith('Send ') ? [1, 2, 3, 10, 11] : [1];
  for (const [caseName, transform] of Object.entries(cases)) {
    for (const position of positions) {
      for (const [bodyName, body] of Object.entries(bodies)) {
        let expect = seed.expect;
        if (seed.shorthand && (position === 11 || (seed.singleDimension && position !== 1))) expect = 'auto';
        // ALL-CAPS is structure: preserve the title marker while crossing field-value case.
        const casedPrompt = seed.controlTitle ? seed.prompt.split('\n').map((line, i) => i === 0 ? line : transform(line)).join('\n') : transform(seed.prompt);
        matrix.push({ ...seed, expect, id: `${seed.group} / ${seed.id} / ${caseName} / line ${position} / ${bodyName}`,
          prompt: `${atMeaningfulLine(casedPrompt, position)}\n\n${body}`,
          active: Boolean(seed.active && position === 1) });
      }
    }
  }
}

const enabledLevels = (row) => row.active ? levels : row.activeLevels || [];
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
console.log(`S57.57 MATRIX: ${seeds.length} seeds; ${matrix.length} rows; ${matrix.filter((r) => enabledLevels(r).length).length} active; ${matrix.filter((r) => !enabledLevels(r).length).length} todo; levels=${levels.join(',')}`);
