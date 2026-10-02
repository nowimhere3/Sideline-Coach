/** S57.57 Slice 6 (S57.71): the Coach clarification seam. Synthetic catalogues only; capability truth stays live. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter as Router } from '../out/control-plane/router.js';
import { computeAutoRoute, computeContextAwareRoute, createRoutingPolicies, parseRouteClarification, routeQuestion } from '../out/routing-policy.js';
import { resolveSmartRouteConstraints } from '../out/control-plane/smart-route-resolver.js';

const GAME = 's57-71-fixture';
const model = (id, displayName, supportedEfforts) => ({ id, displayName, supportedEfforts, defaultEffort: supportedEfforts[0], isDefault: false });
const seat = (playerType, fieldLabel, models) => ({
  instanceId: `${playerType}-1`, playerType, fieldLabel, transport: 'controlled', transportLabel: 'Controlled', state: 'ready',
  capability: { provider: playerType, authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: models[0].id,
    models: models.map((m, index) => ({ ...m, isDefault: index === 0 })) }
});
const efforts = ['low', 'medium', 'high'];
const team = (extraSols = []) => [
  seat('claude', 'Claude', [model('opus', 'Opus', efforts), model('sonnet', 'Sonnet', efforts)]),
  seat('codex', 'Codex', [model('gpt-6.1-sol', 'GPT-6.1 Sol', efforts), model('gpt-6-astra', 'GPT-6 Astra', efforts), model('gpt-5.6-sol', 'GPT-5.6 Sol', efforts),
    ...extraSols.map((version) => model(`gpt-${version}-sol`, `GPT-${version} Sol`, efforts))]),
  seat('antigravity', 'AntiGravity', [model('gemini-3.8-flash', 'Gemini 3.8 Flash', efforts), model('gemini-3.1-pro', 'Gemini 3.1 Pro', efforts)])
];
const contextFor = (candidates) => ({ ledger: [], reports: [], queuedCounts: new Map(),
  names: new Map(candidates.map((s) => [s.instanceId, s.fieldLabel])), rosterInstanceIds: new Set(candidates.map((s) => s.instanceId)) });
const BODY = '\n\nDesign the architecture and system boundaries. Review tradeoffs.';
const routerFor = (candidates, withContext = true) => {
  const router = new Router(new EventEmitter());
  if (withContext) router.setRouteContextProvider(() => contextFor(candidates));
  return router;
};
const ask = (prompt, candidates = team(), extra = {}) => routerFor(candidates).computeRoute(GAME, prompt, candidates, extra);

test('1/12/13: ambiguity asks; resolved, unknown and unsupported stops show no fake choices', () => {
  const ambiguous = ask('Sol Medium' + BODY);
  assert.equal(ambiguous.decision, undefined);
  assert.equal(ambiguous.question.options.length, 2);
  assert.deepEqual(ambiguous.question.options.map((o) => o.label), ['Codex \u00b7 GPT-6.1 Sol \u00b7 Medium', 'Codex \u00b7 GPT-5.6 Sol \u00b7 Medium']);
  assert.match(ambiguous.question.fingerprint, /^[0-9a-f]{16}$/);
  for (const prompt of ['Sonnet Medium' + BODY, 'Review the parser.' + BODY]) {
    const result = ask(prompt);
    assert.ok(result.decision, prompt);
    assert.equal(result.question, undefined, `${prompt}: a resolved route has no question`);
  }
  for (const prompt of ['Luna Medium' + BODY, '5.6 Sol Ultra' + BODY, 'Codex Luna High' + BODY]) {
    const result = ask(prompt);
    assert.equal(result.decision, undefined);
    assert.ok(result.error, prompt);
    assert.equal(result.question, undefined, `${prompt}: unknown/unsupported has no selectable alternatives`);
  }
});

test('2: a contradiction with bounded options asks', () => {
  const result = ask('Sonnet Medium\nAGENT: Codex' + BODY);
  assert.equal(result.decision, undefined);
  assert.equal(result.question.reason, 'contradictory');
  assert.deepEqual(result.question.options.map((o) => o.label), ['Claude \u00b7 Sonnet \u00b7 Medium', 'Codex']);
});

test('3: at most four options; five is not a question', () => {
  const four = ask('Sol Medium' + BODY, team(['6.2', '7']));
  assert.equal(four.question.options.length, 4);
  const five = ask('Sol Medium' + BODY, team(['6.2', '7', '8']));
  assert.equal(five.question, undefined, 'over the bound there is no choice UI, only the stop');
  assert.ok(five.error);
});

test('4/5/6/7: selection resolves the staged route, and dispatch uses exactly that clarification, leaving the Play untouched', async () => {
  const candidates = team();
  const prompt = 'Sol Medium' + BODY;
  for (const [option, expectedModel] of [[1, 'gpt-6.1-sol'], [2, 'gpt-5.6-sol']]) {
    const frames = [];
    const registry = new StadiumRegistry();
    registry.registerSession({ instanceId: 's', stadiumId: 'stadium', name: 'S', platform: 'win32',
      socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
      game: { gameId: GAME, displayName: 'G', fingerprintSource: 'test' }, rootFsPath: 'C:/G', roster: [], capabilities: candidates,
      reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: [] });
    const router = new Router(registry);
    router.setRouteContextProvider(() => contextFor(candidates));
    const question = router.computeRoute(GAME, prompt, candidates).question;
    const routeClarification = { fingerprint: question.fingerprint, option };
    const staged = router.computeRoute(GAME, prompt, candidates, { routeClarification });
    assert.equal(staged.error, undefined);
    assert.equal(staged.decision.model, expectedModel);
    assert.equal(staged.decision.effort, 'medium');
    const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt, routeClarification });
    await new Promise((resolve) => setImmediate(resolve));
    const frame = frames.find((entry) => entry.method === 'dispatch.request');
    assert.ok(frame, 'dispatch reached the Player');
    router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium', gameId: GAME,
      playerInstanceId: frame.params.playerInstanceId, turnRef: 't', acceptedAt: Date.now() });
    const result = await pending;
    assert.equal(result.success, true, result.message);
    assert.deepEqual([frame.params.playerInstanceId, frame.params.model, frame.params.effort],
      [staged.decision.playerInstanceId, staged.decision.model, staged.decision.effort], 'dispatched = staged');
    assert.equal(frame.params.prompt.slice(0, prompt.length), prompt, 'the original Play is byte-for-byte unchanged');
    assert.ok(!frame.params.prompt.includes(question.fingerprint), 'clarification never enters the Play text');
  }
});

test('legacy (no context provider) and direct paths honour the same clarification', () => {
  const candidates = team();
  const prompt = 'Sol Medium' + BODY;
  const question = ask(prompt, candidates).question;
  const routeClarification = { fingerprint: question.fingerprint, option: 2 };
  for (const result of [
    routerFor(candidates, false).computeRoute(GAME, prompt, candidates, { routeClarification }),
    computeAutoRoute(GAME, prompt, candidates, createRoutingPolicies(), routeClarification),
    computeContextAwareRoute(GAME, prompt, candidates, createRoutingPolicies(), { ...contextFor(candidates), clarification: routeClarification })
  ]) assert.equal(result.decision.model, 'gpt-5.6-sol');
});

test('8/9/10: a changed Play or a changed option set voids the answer and re-asks; nothing silently dispatches', async () => {
  const candidates = team();
  const prompt = 'Sol Medium' + BODY;
  const answer = { fingerprint: ask(prompt, candidates).question.fingerprint, option: 1 };
  for (const [label, changedPrompt, changedTeam] of [
    ['changed effort', 'Sol High' + BODY, candidates],
    ['changed exclusion', "Sol Medium\nDon't use Opus" + BODY, candidates],
    ['changed option set', prompt, team(['6.2'])]
  ]) {
    const result = ask(changedPrompt, changedTeam, { routeClarification: answer });
    assert.equal(result.decision, undefined, `${label}: stale answer cannot select`);
    assert.match(result.error, /choose again/i, label);
    assert.ok(result.question?.options.length, `${label}: the new question is shown again`);
    assert.notEqual(result.question.fingerprint, answer.fingerprint);
  }
  // Dispatch with the stale answer is refused, nothing sent, and carries the re-asked question.
  const frames = [];
  const registry = new StadiumRegistry();
  const changed = team(['6.2']);
  registry.registerSession({ instanceId: 's', stadiumId: 'stadium', name: 'S', platform: 'win32',
    socket: { readyState: 1, send(value) { frames.push(JSON.parse(value)); } }, lastHeartbeat: Date.now(),
    game: { gameId: GAME, displayName: 'G', fingerprintSource: 'test' }, rootFsPath: 'C:/G', roster: [], capabilities: changed,
    reports: [], rosterSynchronized: true, rosterSyncedAt: Date.now(), features: [] });
  const router = new Router(registry);
  router.setRouteContextProvider(() => contextFor(changed));
  const refused = await router.dispatch({ gameId: GAME, routingMode: 'auto', prompt, routeClarification: answer });
  assert.equal(refused.success, false);
  assert.match(refused.message, /choose again/i);
  assert.ok(refused.question);
  assert.equal(frames.filter((entry) => entry.method === 'dispatch.request').length, 0);
});

test('11: an unanswered question never falls through to AUTO, in any path', async () => {
  const candidates = team();
  const prompt = 'Sol Medium' + BODY;
  for (const result of [
    ask(prompt, candidates),
    routerFor(candidates, false).computeRoute(GAME, prompt, candidates),
    computeAutoRoute(GAME, prompt, candidates, createRoutingPolicies()),
    computeContextAwareRoute(GAME, prompt, candidates, createRoutingPolicies(), contextFor(candidates))
  ]) {
    assert.equal(result.decision, undefined);
    assert.match(result.error, /Sideline is unsure what route you intended/);
  }
});

test('14: an answer is only ever one of the derived options and must validate live; malformed answers are rejected', () => {
  const candidates = team();
  const prompt = 'Sol Medium' + BODY;
  const { fingerprint } = ask(prompt, candidates).question;
  for (const option of [3, 4]) {
    const result = ask(prompt, candidates, { routeClarification: { fingerprint, option } });
    assert.equal(result.decision, undefined, `option ${option} is not among the two derived options`);
    assert.match(result.error, /choose again/i);
  }
  for (const bad of [undefined, null, 'x', {}, { fingerprint: 'zz', option: 1 }, { fingerprint, option: 0 }, { fingerprint, option: 1.5 }, { fingerprint, option: 5 }, { fingerprint, option: '1' }])
    assert.equal(parseRouteClarification(bad), undefined, JSON.stringify(bad));
  assert.deepEqual(parseRouteClarification({ fingerprint, option: 2 }), { fingerprint, option: 2 });
  // An answer for a model that left the live catalogue cannot select it: the question no longer contains it.
  const withoutLatest = team();
  withoutLatest[1].capability.models = withoutLatest[1].capability.models.filter((m) => m.id !== 'gpt-6.1-sol');
  const afterRemoval = ask(prompt, withoutLatest, { routeClarification: { fingerprint, option: 1 } });
  assert.equal(afterRemoval.decision?.model, 'gpt-5.6-sol', 'a lone surviving Sol now resolves without a question');
  assert.equal(afterRemoval.question, undefined);
});

test('exclusions and explicit constraints survive a clarified route', () => {
  const candidates = team();
  const prompt = "Sol Medium\nDon't use Opus" + BODY;
  const first = ask(prompt, candidates);
  assert.ok(first.question);
  const result = ask(prompt, candidates, { routeClarification: { fingerprint: first.question.fingerprint, option: 1 } });
  assert.equal(result.decision.model, 'gpt-6.1-sol');
  assert.deepEqual(result.decision.constraints.excludedModels, ['opus']);
});

test('the question is derived purely from recognition (single unresolved item with 2..4 options)', () => {
  const candidates = team();
  const constraints = resolveSmartRouteConstraints({ prompt: 'Sol Medium', candidates });
  assert.equal(routeQuestion(constraints).options.length, constraints.unresolved[0].options.length);
  assert.equal(routeQuestion(resolveSmartRouteConstraints({ prompt: 'Luna Medium', candidates })), undefined);
  assert.equal(routeQuestion(undefined), undefined);
});

test('Staged Route UI and daemon carry the answer beside, never inside, the Play', () => {
  const html = readFileSync(new URL('../src/public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('Sideline is unsure what route you intended.'));
  assert.ok(html.includes('currentRouteQuestion.options.slice(0, 4)'), 'at most four choices');
  assert.match(html, /routeClarification: currentRouteClarification[\s\S]{0,200}recommendationId/, 'preview request carries the answer');
  assert.ok((html.match(/routeClarification: currentRouteClarification/g) ?? []).length >= 2, 'preview and dispatch both carry it');
  assert.ok(!/promptInput'\)\.value\s*=[^;]*fingerprint/.test(html), 'the prompt box is never written from the question');
  const daemon = readFileSync(new URL('../src/control-plane/daemon.ts', import.meta.url), 'latin1');
  assert.ok((daemon.match(/parseRouteClarification\(body\.routeClarification\)/g) ?? []).length === 2, 'preview and dispatch parse the same field');
});
