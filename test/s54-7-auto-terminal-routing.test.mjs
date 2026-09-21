/** S54.7 — pager-safe AUTO Terminal routing through the canonical shared seam. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyShellIntent } from '../out/terminal-intent.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = 'game_git_s547';
const OTHER_GAME = 'game_git_other';
const TERMINAL1 = 'terminal-11111111';
const TERMINAL2 = 'terminal-22222222';
const CODEX = 'codex-11111111';
const policies = createRoutingPolicies();

const terminalSnapshot = { provider: 'terminal', authenticated: true, observedAt: 1, freshness: 'unavailable', models: [] };
const codexSnapshot = {
  provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['medium', 'high'], defaultEffort: 'medium' }]
};

function terminal(instanceId = TERMINAL1, overrides = {}) {
  return {
    instanceId, playerType: 'terminal', transport: 'legacy', transportLabel: 'Terminal', ownership: 'coach-managed',
    fieldLabel: instanceId === TERMINAL1 ? 'Terminal' : 'Terminal 2', state: 'ready', capability: terminalSnapshot,
    executionType: 'direct-shell', ...overrides
  };
}

function codex(overrides = {}) {
  return {
    instanceId: CODEX, playerType: 'codex', transport: 'controlled', transportLabel: 'Controlled', ownership: 'coach-managed',
    fieldLabel: 'Codex', state: 'ready', capability: codexSnapshot, executionType: 'reasoning', ...overrides
  };
}

function context(overrides = {}) {
  return {
    ledger: [], reports: [], names: new Map([[TERMINAL1, 'Terminal'], [TERMINAL2, 'Terminal 2'], [CODEX, 'Codex']]),
    rosterInstanceIds: new Set([TERMINAL1, TERMINAL2, CODEX]), queuedCounts: new Map(), ...overrides
  };
}

function route(prompt, candidates, overrides = {}) {
  return computeContextAwareRoute(GAME, prompt, candidates, policies, context(overrides));
}

function routedRegistry(candidates) {
  const frames = [];
  const socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) };
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-s547', stadiumId: 'stadium-s547', name: 'S54.7', platform: 'win32', socket,
    lastHeartbeat: 1, game: { gameId: GAME, displayName: 'S54.7', fingerprintSource: 'git' },
    roster: [], capabilities: candidates, reports: [], rosterSynchronized: true, rosterSyncedAt: 1
  });
  return { registry, frames };
}

function accept(router, frame, playerInstanceId = frame.params.playerInstanceId) {
  router.handleDispatchAccepted({
    clientRef: frame.params.clientRef, stadiumId: 'stadium-s547', gameId: GAME,
    playerInstanceId, turnRef: 'turn-s547', acceptedAt: Date.now()
  });
}

test('AUTO-T1..T7/T28. Pager-capable Git forms are reasoning; bounded branch/status remain shell intent', () => {
  for (const input of [
    'git diff', 'git diff --stat', 'git diff README.md',
    'git log', 'git log -5', 'git log --oneline',
    'git show', 'git show HEAD',
    'git branch', 'git branch -a', 'git branch --all', 'git branch -r', 'git branch --remotes', 'git branch -v', 'git branch --verbose'
  ]) assert.equal(classifyShellIntent(input).kind, 'reasoning', input);
  assert.deepEqual(classifyShellIntent('git branch --show-current'), {
    kind: 'shell', command: 'git branch --show-current', intentClass: 'inspect', rule: 'git.branch.show-current'
  });
  assert.equal(classifyShellIntent('git status').kind, 'shell');
});

test('AUTO-T12..T14. Conversation, ambiguity, and unsupported exact commands stay with reasoning', () => {
  for (const prompt of ['Can you run git status and explain what changed?', 'git status please', 'git diff', 'npm install']) {
    const result = route(prompt, [terminal(), codex()]);
    assert.equal(result.error, undefined, prompt);
    assert.equal(result.decision.playerInstanceId, CODEX, prompt);
    assert.equal(result.decision.terminalCommand, undefined, prompt);
  }
});

test('AUTO-T15/T20. One eligible exact-Game Coach Terminal receives shell intent; absence falls through to reasoning', () => {
  const exact = route('git status', [terminal(), codex()]).decision;
  assert.equal(exact.playerInstanceId, TERMINAL1);
  assert.equal(exact.terminalCommand, 'git status');
  assert.equal(exact.provider, 'terminal');

  const fallback = route('git status', [codex()]).decision;
  assert.equal(fallback.playerInstanceId, CODEX);
  assert.equal(fallback.terminalCommand, undefined);
});

test('AUTO-T16..T21. Ownership, ready state, bench absence, and unique identity are fail-closed', () => {
  for (const ownership of ['adopted', 'external', undefined]) {
    const result = route('git status', [terminal(TERMINAL1, { ownership }), codex()]);
    assert.equal(result.decision.playerInstanceId, CODEX, String(ownership));
  }
  const busy = route('git status', [terminal(TERMINAL1, { state: 'busy' }), codex()]).decision;
  assert.equal(busy.playerInstanceId, CODEX, 'busy Terminal cannot receive a second command');
  const benchedAbsent = route('git status', [codex()]).decision;
  assert.equal(benchedAbsent.playerInstanceId, CODEX, 'benched Terminal is absent from routing capabilities');
  const ambiguous = route('git status', [terminal(), terminal(TERMINAL2), codex()]).decision;
  assert.equal(ambiguous.playerInstanceId, CODEX, 'two eligible Terminals are never guessed between');
  const noSafeTarget = route('git status', [terminal(TERMINAL1, { state: 'busy' })]);
  assert.equal(noSafeTarget.decision, undefined);
  assert.match(noSafeTarget.error, /Terminal runs exact commands|No Player is eligible|No Player is on field/);
});

test('AUTO-T10/T11/T23. MANUAL and explicit AUTO route choices outrank shell classification', async () => {
  const constrained = route('Use Codex. git status', [terminal(), codex()]).decision;
  assert.equal(constrained.playerInstanceId, CODEX);
  assert.deepEqual(constrained.constraints.recognized, ['player']);

  const routeChoice = route('git status', [terminal(), codex()], { choice: 'dispatch' }).decision;
  assert.equal(routeChoice.playerInstanceId, CODEX, 'an explicit AUTO alternative choice is not stolen by Terminal');

  const { registry, frames } = routedRegistry([terminal(), codex()]);
  const router = new ControlPlaneRouter(registry);
  const pending = router.dispatch({ gameId: GAME, routingMode: 'manual', playerInstanceId: CODEX, prompt: 'git status', model: 'gpt-5.6-sol', effort: 'high' });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.equal(frame.params.playerInstanceId, CODEX);
  assert.equal(frame.params.model, 'gpt-5.6-sol');
  accept(router, frame, CODEX);
  assert.equal((await pending).success, true);
});

test('AUTO-T8/T9/T22. Preview and dispatch share one decision and only verdict.command crosses the Terminal boundary', async () => {
  const candidates = [terminal(), codex()];
  const { registry, frames } = routedRegistry(candidates);
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => context());
  const rawPrompt = ' \tgit status\r\n';
  const preview = router.computeRoute(GAME, rawPrompt, candidates).decision;
  assert.equal(preview.playerInstanceId, TERMINAL1);
  assert.equal(preview.terminalCommand, 'git status');

  const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt: rawPrompt });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  assert.ok(frame);
  assert.equal(frame.params.playerInstanceId, preview.playerInstanceId);
  assert.equal(frame.params.prompt, preview.terminalCommand);
  assert.notEqual(frame.params.prompt, rawPrompt);
  assert.equal(frame.params.model, undefined);
  assert.equal(frame.params.effort, undefined);
  accept(router, frame);
  const actual = await pending;
  assert.equal(actual.success, true);
  assert.deepEqual(
    { player: actual.decision.playerInstanceId, command: actual.decision.terminalCommand, action: actual.decision.action, summary: actual.decision.summary },
    { player: preview.playerInstanceId, command: preview.terminalCommand, action: preview.action, summary: preview.summary }
  );
});

test('AUTO-T19. Another Game cannot borrow this Game\'s Terminal capability or dispatch frame', async () => {
  const { registry, frames } = routedRegistry([terminal(), codex()]);
  const router = new ControlPlaneRouter(registry);
  const result = await router.dispatch({ gameId: OTHER_GAME, routingMode: 'auto', prompt: 'git status' });
  assert.equal(result.success, false);
  assert.match(result.message, /offline/);
  assert.equal(frames.some((item) => item.method === 'dispatch.request'), false);
});

test('AUTO package intent remains exact without claiming project scripts are intrinsically safe', () => {
  for (const command of ['npm test', 'npm run build', 'npm run lint', 'npm run check', 'npm run compile', 'npm run typecheck']) {
    const decision = route(command, [terminal(), codex()]).decision;
    assert.equal(decision.playerInstanceId, TERMINAL1, command);
    assert.equal(decision.terminalCommand, command, command);
    assert.doesNotMatch(decision.reason + decision.summary, /safe script/i);
  }
});

test('AUTO-T27/T29/T30. Purity, graduated Terminal breadcrumb, and graduated Settings breadcrumb remain code-local', () => {
  const terminalSource = fs.readFileSync(path.join(repoRoot, 'src', 'terminal-intent.ts'), 'utf8');
  const policySource = fs.readFileSync(path.join(repoRoot, 'src', 'routing-policy.ts'), 'utf8');
  const routerSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'router.ts'), 'utf8');
  const html = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
  assert.match(policySource, /classifyShellIntent/);
  assert.match(routerSource, /decision!\.terminalCommand/);
  assert.doesNotMatch(terminalSource, /pure and UNWIRED|Until it lands|Remove this UNWIRED note/);
  assert.match(terminalSource, /CURRENT OWNER/);
  assert.match(terminalSource, /never the raw/);
  assert.equal((terminalSource.match(/BREADCRUMB: TERMINAL-INTENT-BOUNDARY/g) || []).length, 1);
  assert.equal((html.match(/BREADCRUMB: FINAL-SETTINGS-UX-PASS/g) || []).length, 0, 'unresolved breadcrumb graduated in S55.0');
  assert.equal((html.match(/BREADCRUMB: SETTINGS-UX-HIERARCHY/g) || []).length, 1, 'graduated code-local invariant present');
});
