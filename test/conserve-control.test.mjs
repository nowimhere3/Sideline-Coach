// CONSERVE control — the Coach's routing posture actuator (S57.29 Option A, approved design PNG).
//
//   state      daemon-owned in memory, like routingMode: default balanced; POST /api/route { posture };
//              status carries it; every change broadcasts the existing routing-change
//   engine     the existing recommendRoute() posture seam receives { value, source: 'coach-default' };
//              no weight, belief or scoring change — differences come only from ROUTING_WEIGHTS.postures
//   authority  AUTO and MANUAL routes are the existing router's; MANUAL stays human-authoritative
//   Scarcity   ResourcePolicy / AlarmEngine are never touched by the actuator
//   UI         A1 AUTO · A2 MANUAL · A3 spacer · A4 actuator (lamp only) · A5 CONSERVE + ⓘ · + PATH
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTING_WEIGHTS, recommendRoute } from '../out/routing-intel/recommend.js';
import { priorPackSourceFromJson } from '../out/routing-intel/prior-pack.js';
import { buildAttributedFilmIndex } from '../out/routing-intel/attribution.js';
import { eligibleSeats, PROVIDER_PREFERENCE } from '../out/routing-policy.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { DEFAULT_PREFERENCES, savePreferences } from '../out/running-players.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const html = read('src', 'public', 'index.html');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-conserve-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

// ── Daemon harness (the R6/R7 pattern: real daemon, real HTTP, in-memory Film journal) ──────────────
const GAME = 'game-conserve';
const CX = { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['medium', 'high'], defaultEffort: 'medium' }] };
const CL = { provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'opus',
  models: [{ id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['medium', 'high'], defaultEffort: 'high' }] };
const session = (frames) => ({
  instanceId: 'stadium-1', stadiumId: 'stadium-conserve', name: 'Conserve', platform: 'win32',
  socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
  lastHeartbeat: 1, game: { gameId: GAME, displayName: 'Conserve', fingerprintSource: 'git' },
  roster: [], reports: [], rosterSynchronized: true, rosterSyncedAt: 1,
  capabilities: [
    { instanceId: 'codex-aaaa', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready', capability: CX },
    { instanceId: 'claude-bbbb', playerType: 'claude', transport: 'controlled', fieldLabel: 'Claude', state: 'ready', capability: CL }
  ]
});
let nextPort = 39861;
async function withDaemon(name, run) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, devMode: true });
  const events = [];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => events.push(event) };
  const port = nextPort++;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000, routingFilm: { journal } });
  const call = (method, route, body) => new Promise((resolve, reject) => {
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: {
      Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
  try {
    await daemon.start();
    const frames = [];
    daemon.registry.registerSession(session(frames));
    await run({ daemon, call, frames, events });
  } finally {
    await daemon.stop();
  }
}
async function dispatchThrough(router, frames, options) {
  const pending = router.dispatch({ gameId: GAME, ...options });
  const frame = frames.filter((item) => item.method === 'dispatch.request').at(-1);
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-conserve', gameId: GAME, playerInstanceId: frame.params.playerInstanceId, acceptedAt: Date.now() });
  return { result: await pending, frame };
}
const PROMPT = 'Implement the bounded parser helper in src/parse.ts';

// ═══════════════════════════════════════ STATE / API ═══════════════════════════════════════

test('CONSERVE-1 daemon posture: default balanced; POST conserve / balanced; status and broadcast follow; junk ignored', async () => {
  await withDaemon('state', async ({ daemon, call }) => {
    const broadcasts = [];
    const original = daemon.broadcast.bind(daemon);
    daemon.broadcast = (event, payload) => { broadcasts.push([event, payload?.type]); return original(event, payload); };

    const initial = await call('GET', '/api/status');
    assert.equal(initial.body.routingPosture, 'balanced', 'default is balanced (actuator unlit)');
    assert.equal(initial.body.routing.posture, 'balanced');

    const on = await call('POST', '/api/route', { posture: 'conserve' });
    assert.equal(on.status, 200);
    assert.equal(on.body.routing.posture, 'conserve');
    assert.equal(on.body.routing.mode, 'auto', 'posture never touches routing mode');
    assert.deepEqual(broadcasts.at(-1), ['status', 'routing-change'], 'all clients resynchronize through the existing routing-change');
    // A browser refresh re-reads status: the lamp restores from daemon truth.
    const refreshed = await call('GET', '/api/status');
    assert.deepEqual([refreshed.body.routingPosture, refreshed.body.routing.posture], ['conserve', 'conserve']);

    for (const junk of ['fast', 'sure', 'CONSERVE', true, 1, null]) {
      const ignored = await call('POST', '/api/route', { posture: junk });
      assert.equal(ignored.status, 200);
      assert.equal(ignored.body.routing.posture, 'conserve', `${JSON.stringify(junk)} is ignored; the true state is echoed`);
    }
    const modeOnly = await call('POST', '/api/route', { mode: 'manual' });
    assert.deepEqual([modeOnly.body.routing.mode, modeOnly.body.routing.posture], ['manual', 'conserve'], 'mode changes keep posture');

    const off = await call('POST', '/api/route', { posture: 'balanced' });
    assert.equal(off.body.routing.posture, 'balanced');
    assert.equal((await call('GET', '/api/status')).body.routingPosture, 'balanced');
  });
});

// ═══════════════════════════════════════ ENGINE ═══════════════════════════════════════

test('CONSERVE-2 the posture reaches the existing recommendRoute seam (Dev preview and Film digest)', async () => {
  await withDaemon('engine', async ({ daemon, call, frames, events }) => {
    const off = await call('POST', '/api/route/preview', { prompt: PROMPT });
    assert.deepEqual(off.body.recommendation.posture, { value: 'balanced', source: 'coach-default' });

    await call('POST', '/api/route', { posture: 'conserve' });
    const on = await call('POST', '/api/route/preview', { prompt: PROMPT });
    assert.deepEqual(on.body.recommendation.posture, { value: 'conserve', source: 'coach-default' });
    const { stagedAt: _a, ...onDecision } = on.body.decision;
    const { stagedAt: _b, ...offDecision } = off.body.decision;
    assert.deepEqual(onDecision, offDecision, 'the staged AUTO route is the existing router\'s, identical either way');

    const { result } = await dispatchThrough(daemon.routerInstance, frames, { routingMode: 'auto', prompt: PROMPT });
    assert.equal(result.success, true);
    const decision = events.find((event) => event.kind === 'decision');
    assert.equal(decision.recommendation.posture, 'conserve', 'the Film records which posture advised this Play');
  });
});

// Pure engine: identical inputs except posture. Every utility is the SAME formula with the posture's frozen weights.
const PACK = priorPackSourceFromJson({
  schemaVersion: 1, packVersion: 'conserve-synth-1',
  semantics: { wildcardExcludes: { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] } },
  lineages: [
    { playerType: 'codex', lineage: 'cx-main', match: '^cx-', researched: true },
    { playerType: 'claude', lineage: 'cl-main', match: '^cl-', researched: true }
  ],
  priors: ['codex', 'claude'].map((playerType) => ({
    playerType, lineage: playerType === 'codex' ? 'cx-main' : 'cl-main', modelId: playerType === 'codex' ? 'cx-1' : 'cl-1',
    effort: 'high', taskClass: 'implementation', difficulty: '*', firstPass: playerType === 'claude' ? 0.8 : 0.72, strength: 4,
    researchQuality: 'cross-checked', researchedAt: '2026-09-26', burn: null, durationMin: null
  }))
}, 'synthetic');
const NOW = Date.parse('2026-09-26T12:00:00Z');
const W = (id, lengthMin, R, T) => {
  const pi = (T / lengthMin) / Math.max(R, 0.01);
  return { id, lengthMin, remainingFraction: R, resetsAt: Math.floor(NOW / 1000) + Math.round(T * 60), timeToResetMin: T, pacePressure: pi,
    price: Math.min(10, Math.max(0.05, pi)), stale: false, policyLag: false };
};
const cap = (instanceId, playerType, model) => ({ instanceId, playerType, transport: 'controlled', fieldLabel: playerType, state: 'ready',
  capability: { provider: playerType, authenticated: true, observedAt: 1, freshness: 'live', models: [{ id: model, displayName: model, isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] } });
function filmPlay(i, playerType, model, poolId) {
  const at = NOW - 4 * 86_400_000 + i * 60_000;
  const target = { playerInstanceId: `${playerType}-film`, playerType, transport: 'controlled', model, effort: 'high', resourcePool: poolId };
  const receipt = (when) => ({ pool: poolId, evidence: 'unknown', capturedAt: new Date(when).toISOString(), windows: [] });
  return [
    { schemaVersion: 1, kind: 'decision', at, clientRef: `f-${playerType}-${i}`, gameId: 'g', baseline: target, chosen: target, decidedBy: 'auto-baseline',
      routeAction: 'dispatch', receiptBefore: receipt(at), profile: { taskClass: 'implementation', difficulty: 'medium', role: 'player' } },
    { schemaVersion: 1, kind: 'outcome', at: at + 30 * 60_000, clientRef: `f-${playerType}-${i}`, gameId: 'g', ledgerOutcome: 'completed', startedAt: at,
      finishedAt: at + 30 * 60_000, durationMs: 30 * 60_000, reportProduced: false, retries: 0, receiptAfter: receipt(at + 30 * 60_000),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: 'high', isolationReason: 'fixture',
      burn: [['five_hour', 12], ['weekly', 3]].map(([window, delta]) => ({ pool: poolId, window, windowLengthMin: window === 'weekly' ? 10_080 : 300, isolation: 'high', reason: 'fixture', remainingPercentDelta: delta })) }
  ];
}
const FILM = [...Array.from({ length: 15 }, (_, i) => filmPlay(i, 'codex', 'cx-1', 'codex')).flat(), ...Array.from({ length: 15 }, (_, i) => filmPlay(i, 'claude', 'cl-1', 'claude')).flat()];
const CLAUDE_R5 = 0.7;
const CLAUDE_RW = 0.6;
const engineInput = (posture, mode = 'auto') => ({
  now: NOW, gameId: 'g', profile: {
    taskClass: 'implementation', difficulty: 'medium', role: 'player', urgency: 'normal',
    scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, followUp: 'new-work', touchKeys: [], postScoutContinuation: false
  },
  authority: { mode },
  baseline: { playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1', effort: 'high', action: 'dispatch' },
  seats: eligibleSeats([cap('codex-1', 'codex', 'cx-1'), cap('claude-1', 'claude', 'cl-1')], { authority: 'auto', availability: 'taking-plays' }),
  economics: { projectedAt: new Date(NOW).toISOString(), pools: {
    codex: { pool: 'codex', evidence: 'known', windows: [W('five_hour', 300, 0.9, 200), W('weekly', 10_080, 0.8, 3 * 1440)] },
    claude: { pool: 'claude', evidence: 'known', windows: [W('five_hour', 300, CLAUDE_R5, 200), W('weekly', 10_080, CLAUDE_RW, 4 * 1440)] }
  } },
  priorPack: PACK, filmIndex: buildAttributedFilmIndex(FILM, PACK, NOW), baselinePreference: PROVIDER_PREFERENCE,
  possession: { ledger: [], playTouchKeys: [], filmTouchKeys: new Map() },
  scout: { seatReady: false, scoutPriceCost: 0, intel: [], contradictedReportKeys: [], pRightEvidence: { successes: 0, failures: 0 } },
  ...(posture ? { posture: { value: posture, source: 'coach-default' } } : {})
});

test('CONSERVE-3 ordering changes come only from the existing posture weights (no math changed)', () => {
  const balanced = recommendRoute(engineInput('balanced'));
  const conserve = recommendRoute(engineInput('conserve'));
  assert.deepEqual(recommendRoute(engineInput(undefined)).candidates, balanced.candidates, 'OFF = the engine default it always had');
  assert.equal(conserve.posture.value, 'conserve');
  const key = (option) => `${option.route.playerInstanceId}|${option.route.model}|${option.route.effort}`;
  const byKey = new Map(balanced.candidates.map((option) => [key(option), option]));
  assert.ok(conserve.candidates.length >= 2);
  for (const option of conserve.candidates) {
    const other = byKey.get(key(option));
    assert.ok(other, 'the same candidate set under both postures');
    // Every posture-independent input is identical …
    assert.deepEqual([option.scores.q, option.scores.cost.effective, option.scores.delayMin, option.scores.risk],
      [other.scores.q, other.scores.cost.effective, other.scores.delayMin, other.scores.risk]);
    // … and each utility is exactly U = q − λc·C − λd·urgency·D − λr·Risk with that posture's frozen weights.
    for (const [rec, posture] of [[option, 'conserve'], [other, 'balanced']]) {
      const w = ROUTING_WEIGHTS.postures[posture];
      const expected = rec.scores.q - w.lambdaC * rec.scores.cost.effective - w.lambdaD * 1 * (rec.scores.delayMin / 60) - w.lambdaR * rec.scores.risk;
      assert.ok(Math.abs(rec.scores.utility - expected) < 1e-5, `${posture} ${key(rec)}: ${rec.scores.utility} vs ${expected}`);
    }
  }
  assert.deepEqual(ROUTING_WEIGHTS.postures.conserve, { lambdaC: 2.5, lambdaD: 0.01, lambdaR: 0.5, q: 'mean', weeklyWait: true }, 'CONSERVE weights untouched');
  assert.deepEqual(ROUTING_WEIGHTS.postures.balanced, { lambdaC: 1.0, lambdaD: 0.05, lambdaR: 0.5, q: 'mean', weeklyWait: false });
  // Same inputs: BALANCED keeps the (dearer, slightly stronger) Claude baseline; CONSERVE's heavier cost weight moves to Codex.
  assert.equal(balanced.primary.route.playerInstanceId, 'claude-1');
  assert.equal(conserve.primary.route.playerInstanceId, 'codex-1');
});

// ═══════════════════════════════════════ AUTHORITY ═══════════════════════════════════════

test('CONSERVE-4 MANUAL stays human-authoritative; the shadow recommendation may reflect the posture', async () => {
  await withDaemon('manual', async ({ daemon, call, frames, events }) => {
    await call('POST', '/api/route', { posture: 'conserve', mode: 'manual' });
    const manual = { routingMode: 'manual', prompt: PROMPT, playerInstanceId: 'claude-bbbb', model: 'opus', effort: 'high' };
    const { result, frame } = await dispatchThrough(daemon.routerInstance, frames, manual);
    assert.equal(result.success, true);
    assert.deepEqual([frame.params.playerInstanceId, frame.params.model, frame.params.effort], ['claude-bbbb', 'opus', 'high'], 'exactly the human\'s Player/model/effort');
    const decision = events.find((event) => event.kind === 'decision');
    assert.equal(decision.chosen.playerInstanceId, 'claude-bbbb');
    assert.equal(decision.recommendation.posture, 'conserve', 'the background recommendation used CONSERVE');
    assert.equal(decision.recommendation.authority.advisoryOnly, true, '…and is advisory only: it never changes the human route');
  });
  const pure = recommendRoute(engineInput('conserve', 'manual'));
  assert.equal(pure.authority.advisoryOnly, true);
});

test('CONSERVE-5 Scarcity is untouched: no ResourcePolicy / AlarmEngine / R8 / R10 / commercial surface changed', () => {
  const daemon = read('src', 'control-plane', 'daemon.ts');
  const setter = daemon.slice(daemon.indexOf('private setRoutingPosture('), daemon.indexOf('private setRoutingPosture(') + 400);
  assert.match(setter, /this\.routingPosture = posture;/);
  assert.doesNotMatch(setter, /resourcePolic|alarm|isConserveActive|conserveLevel/i, 'the human posture never writes Scarcity');
  const routeHandler = daemon.slice(daemon.indexOf("requestUrl.pathname === '/api/route')"), daemon.indexOf('// AUTO route preview'));
  assert.doesNotMatch(routeHandler, /resourcePolic|alarmEngine|isConserveActive|conserveLevel/i);
  assert.doesNotMatch(read('src', 'control-plane', 'resource-policy.ts'), /routingPosture/);
  assert.doesNotMatch(read('src', 'control-plane', 'alarm-engine.ts'), /routingPosture/);
  assert.doesNotMatch(read('src', 'routing-intel', 'advisory-stage.ts'), /posture/i);
  assert.match(daemon, /posture: \{ value: this\.routingPosture, source: 'coach-default' \}/, 'one canonical seam into the engine');
});

// ═══════════════════════════════════════ UI ═══════════════════════════════════════

const bar = html.match(/<div class="routing-mode-bar">[\s\S]*?<div id="autoRoutingCard"/)?.[0] ?? '';
const actuator = bar.match(/<button id="conserveToggleBtn"[\s\S]*?<\/button>/)?.[0] ?? '';

test('CONSERVE-6 A1–A5 structure: separate actuator and label/info cells, + PATH its own utility', () => {
  const order = ['id="modeAutoBtn"', 'id="modeManualBtn"', 'class="routing-bar-spacer"', 'id="conserveToggleBtn"', 'id="conserveLabel"', 'id="conserveInfoBtn"', 'id="insertPathBtn"'].map((needle) => bar.indexOf(needle));
  assert.ok(order.every((index) => index > 0), 'every cell is present in the routing band');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'A1 · A2 · A3 · A4 · A5 · + PATH, in that order');
  assert.match(bar, /<span class="routing-bar-spacer" aria-hidden="true"><\/span>/, 'A3 is an intentional, invisible spacer');
  assert.match(actuator, /aria-pressed="false"/);
  assert.match(actuator, /aria-label="Conserve"/);
  assert.match(actuator, /<span class="conserve-lamp" aria-hidden="true"><\/span><\/button>$/, 'A4 holds only the lamp');
  assert.doesNotMatch(actuator.replace(/<[^>]+>/g, ''), /\S/, 'no text inside the actuator');
  assert.doesNotMatch(actuator, /conserveLabel|conserveInfoBtn/, 'label and info are not inside the actuator');
  assert.match(bar, /<div class="conserve-caption">\s*<span id="conserveLabel" class="conserve-label">CONSERVE<\/span>\s*<button id="conserveInfoBtn"/, 'A5 = CONSERVE + ⓘ together');
  assert.match(bar, /<\/div>\s*<button id="insertPathBtn"/, '+ PATH stays its own utility after the Conserve cells');
  assert.doesNotMatch(bar, /type="checkbox"|role="switch"|class="[^"]*(slider|switch-track|pill|status-dot)/, 'no slider, switch track, pill or status dot');
});

test('CONSERVE-7 lamp state, fixed label weight, accessible info, approved copy', () => {
  const css = (selector) => html.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(css('.conserve-lamp'), /background: linear-gradient\(180deg, #9aa1ab/, 'OFF: an unlit lamp (still a live control)');
  assert.match(css('.conserve-actuator[aria-pressed="true"] .conserve-lamp'), /#2ee2d4[\s\S]*box-shadow:[^;]*rgba\(46, 226, 212/, 'ON: the lamp lights cyan with a restrained glow');
  assert.doesNotMatch(html, /\.conserve-actuator:disabled|\.conserve-actuator\[aria-pressed="false"\][^{]*\{[^}]*opacity/, 'OFF never looks disabled');
  assert.match(css('.conserve-label'), /font-weight: 500;/, 'CONSERVE is not bold');
  assert.doesNotMatch(html, /aria-pressed="true"\][^{]*\.conserve-label|\.conserve-label[^{]*aria-pressed/, 'the label weight never changes with state');
  assert.match(html, /@container \(max-width: 560px\) \{ \.routing-bar-spacer \{ display: none; \} \}/, 'A3 collapses responsively');
  assert.match(css('.conserve-control'), /grid-template-columns: auto auto/, 'A4 and A5 stay distinct cells that wrap together');

  const info = bar.match(/<button id="conserveInfoBtn"[^>]*>/)?.[0] ?? '';
  const hover = 'Uses Intelligent Routing to protect scarce Player capacity when a capable alternative is available.';
  assert.match(info, /aria-label="About Conserve"/);
  assert.match(info, /aria-expanded="false"/);
  assert.match(info, /aria-controls="conserveExplainer"/);
  assert.ok(info.includes(`title="${hover}"`));
  assert.match(info, /class="quiet info-btn conserve-info-btn"/, 'reuses the existing ⓘ button styling');
  const explainer = bar.match(/<div id="conserveExplainer"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(explainer, /hidden>/);
  for (const line of [
    'Conserve · Intelligent Routing',
    "Conserve uses Sideline's Intelligent Routing to weigh Player capability, task difficulty, confidence, expected usage, remaining capacity, reset timing, and available alternatives.",
    'When another Player can handle the Play well, Sideline can preserve scarce premium capacity for work that needs it more. When the strongest Player is genuinely worth using, Conserve can still choose them.',
    'Intelligent Routing continues learning in the background whether Conserve is on or off. Turning Conserve on tells Sideline to make resource protection an active part of its routing decisions.'
  ]) assert.ok(explainer.includes(line), line.slice(0, 40));
  assert.doesNotMatch(explainer, /Brier|calibration|bin|Film|threshold|weight|λ/i, 'no internals in Dad copy');
});

test('CONSERVE-8 browser wiring: posts the canonical posture, restores from status, lamp follows daemon truth', () => {
  assert.match(html, /let currentRoutingPosture = 'balanced';/);
  assert.match(html, /api\('\/api\/route', \{ method: 'POST', body: JSON\.stringify\(\{ posture \}\) \}\)/);
  assert.match(html, /void setRoutingPosture\(currentRoutingPosture === 'conserve' \? 'balanced' : 'conserve'\)/);
  assert.match(html, /const statusPosture = status\.routing\?\.posture;\s*if \(!posturePending && \(statusPosture === 'balanced' \|\| statusPosture === 'conserve'\)\) \{\s*currentRoutingPosture = statusPosture;/);
  assert.match(html, /actuator\.setAttribute\('aria-pressed', String\(currentRoutingPosture === 'conserve'\)\)/);
  assert.doesNotMatch(html, /localStorage[^\n]*[Pp]osture/, 'no second browser-owned truth');
});
