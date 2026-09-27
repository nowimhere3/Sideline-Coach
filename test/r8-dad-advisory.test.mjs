// R8 — Dad Mode advisory routing: implemented, DORMANT behind a closed stage gate. S57.1 §13, §16, §19.4, §20 R8.
//
// Proofs: the gate is closed by default and cannot be opened from any product surface; while closed nothing
// new reaches Dad and dispatch is unchanged; when a TEST opens the gate, the bounded chip appears only on AUTO
// disagreement, and `[USE]` runs the exact R6 route through the existing route-choice and router path with a
// truthful `decidedBy`; dismiss does nothing to routing; Scout maps onto the existing Scout decision shape;
// wait/SCHEDULE is not actionable; optionToDecision is pure and never re-ranks.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { R8_ADVISORY_STAGE_GATE, advisoryStageOpen } from '../out/routing-intel/advisory-stage.js';
import { optionToDecision, isAdvisedChoice } from '../out/routing-intel/option-to-decision.js';
import { dadAdvisoryView, DAD_LINE_MAX, DAD_SUBLINE_MAX } from '../out/routing-intel/dad-advisory.js';
import { recommendRoute } from '../out/routing-intel/recommend.js';
import { priorPackSourceFromJson } from '../out/routing-intel/prior-pack.js';
import { buildAttributedFilmIndex } from '../out/routing-intel/attribution.js';
import { RoutingFilmStore } from '../out/routing-intel/routing-film.js';
import { eligibleSeats, PROVIDER_PREFERENCE } from '../out/routing-policy.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { DEFAULT_PREFERENCES, savePreferences } from '../out/running-players.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'src', 'public', 'index.html'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r8-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.now();
const GAME = 'game-r8';
const PROMPT = 'Implement the bounded parser helper in src/parse.ts';

// ── R6 fixtures (S57.1 §11.3 / §10.5 shapes), through the real R3/R5/R6 pipeline ───────────────────────────
const PACK = priorPackSourceFromJson({
  schemaVersion: 1, packVersion: 'r8-synth', semantics: { wildcardExcludes: { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] } },
  lineages: [
    { playerType: 'codex', lineage: 'cx-main', match: '^cx-', researched: true },
    { playerType: 'claude', lineage: 'cl-main', match: '^cl-', researched: true }
  ],
  priors: ['codex', 'claude'].flatMap((playerType) => ['implementation', 'architecture'].map((taskClass) => ({
    playerType, lineage: playerType === 'codex' ? 'cx-main' : 'cl-main', modelId: playerType === 'codex' ? 'cx-1' : 'cl-1',
    effort: 'high', taskClass, difficulty: '*', firstPass: 0.7, strength: 4, researchQuality: 'cross-checked',
    researchedAt: '2026-09-26', burn: null, durationMin: null
  })))
}, 'synthetic');
const capability = (instanceId, playerType, models, state = 'ready') => ({
  instanceId, playerType, transport: 'controlled', fieldLabel: playerType, state,
  capability: { provider: playerType, authenticated: true, observedAt: 1, freshness: 'live',
    models: models.map((id) => ({ id, displayName: id, isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' })) }
});
const CODEX = capability('codex-1', 'codex', ['cx-1']);
const CLAUDE = capability('claude-1', 'claude', ['cl-1']);
const SCOUT = { instanceId: 'scout', playerType: 'scout', transport: 'controlled', fieldLabel: 'Scout', state: 'ready', executionType: 'scout-formation', autoEligible: false,
  capability: { provider: 'scout', authenticated: true, observedAt: 1, freshness: 'live', models: [] } };
const seats = (...caps) => eligibleSeats(caps, { authority: 'auto', availability: 'taking-plays' });
const W = (id, lengthMin, R, T, floor) => {
  const pi = (T / lengthMin) / Math.max(R, 0.01);
  return { id, lengthMin, remainingFraction: R, resetsAt: Math.floor(NOW / 1000) + Math.round(T * 60), timeToResetMin: T, pacePressure: pi,
    price: Math.min(10, Math.max(0.05, pi)), ...(floor ? { floor } : {}), stale: false, policyLag: false };
};
const economics = (pools) => ({ projectedAt: new Date(NOW).toISOString(), pools });
const ECON = economics({
  codex: { pool: 'codex', evidence: 'known', windows: [W('five_hour', 300, 0.95, 240), W('weekly', 10_080, 0.15, 4 * 1440, 1.5)] },
  claude: { pool: 'claude', evidence: 'known', windows: [W('five_hour', 300, 0.25, 10), W('weekly', 10_080, 0.6, 2 * 1440)] }
});
const IMPL = { taskClass: 'implementation', difficulty: 'medium', role: 'player' };
const ARCH = { taskClass: 'architecture', difficulty: 'hard', role: 'player' };
let seq = 0;
function filmPlay({ playerType, model, pool, burns, profile = IMPL }) {
  const clientRef = `r8-${++seq}`;
  const at = NOW - 4 * DAY;
  const target = { playerInstanceId: `${playerType}-film`, playerType, transport: 'controlled', model, effort: 'high', resourcePool: pool };
  const receipt = (when) => ({ pool, evidence: 'unknown', capturedAt: new Date(when).toISOString(), windows: [] });
  return [
    { schemaVersion: 1, kind: 'decision', at, clientRef, gameId: 'g-film', baseline: target, chosen: target, decidedBy: 'auto-baseline', routeAction: 'dispatch', receiptBefore: receipt(at), profile },
    { schemaVersion: 1, kind: 'outcome', at: at + 30 * MIN, clientRef, gameId: 'g-film', ledgerOutcome: 'completed', startedAt: at, finishedAt: at + 30 * MIN,
      durationMs: 30 * MIN, reportProduced: false, retries: 0, receiptAfter: receipt(at + 30 * MIN), concurrency: { samePool: [], otherPool: [], unknownPool: [] },
      isolation: 'high', isolationReason: 'fixture',
      burn: burns.map(([window, delta]) => ({ pool, window, windowLengthMin: window === 'weekly' ? 10_080 : 300, isolation: 'high', reason: 'fixture', remainingPercentDelta: delta })) }
  ];
}
const many = (n, spec) => Array.from({ length: n }, () => filmPlay(spec)).flat();
const FILM = [
  ...many(20, { playerType: 'codex', model: 'cx-1', pool: 'codex', burns: [['five_hour', 12], ['weekly', 3]] }),
  ...many(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 12], ['weekly', 3]] })
];
const profile = (over = {}) => ({
  taskClass: 'implementation', difficulty: 'medium', role: 'player', urgency: 'normal',
  scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, followUp: 'new-work', touchKeys: [], postScoutContinuation: false, ...over
});
const NO_SCOUT = { seatReady: false, scoutPriceCost: 0, intel: [], contradictedReportKeys: [], pRightEvidence: { successes: 0, failures: 0 } };
const recommend = (over = {}) => recommendRoute({
  now: NOW, gameId: GAME, authority: { mode: 'auto' }, profile: profile(), seats: seats(CODEX, CLAUDE), economics: ECON, priorPack: PACK,
  filmIndex: buildAttributedFilmIndex(FILM, PACK, NOW), baselinePreference: PROVIDER_PREFERENCE,
  possession: { ledger: [], playTouchKeys: [], filmTouchKeys: new Map() }, scout: NO_SCOUT,
  baseline: { playerInstanceId: 'codex-1', playerType: 'codex', model: 'cx-1', effort: 'high', action: 'dispatch' }, ...over
});
const names = new Map([['codex-1', 'Codex'], ['claude-1', 'Claude']]);
const BASE = { mode: 'auto', gameId: GAME, playerInstanceId: 'codex-1', playerLabel: 'codex', provider: 'codex', model: 'cx-1', modelDisplayName: 'cx-1',
  effort: 'high', reason: 'AUTO', stagedAt: NOW, playLabel: 'Medium implementation Play', action: 'dispatch' };
const ctx = (over = {}) => ({ choice: 'recommended-primary', base: BASE, candidates: [CODEX, CLAUDE, SCOUT], names, scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, now: NOW, ...over });

const REC = recommend();

// ── Gate ────────────────────────────────────────────────────────────────────────────────────────────────────

test('R8-1 the stage gate defaults CLOSED, fails closed, and is not reachable from any product surface', () => {
  assert.equal(R8_ADVISORY_STAGE_GATE.open, false);
  assert.equal(advisoryStageOpen(), false);
  assert.equal(advisoryStageOpen(R8_ADVISORY_STAGE_GATE), false);
  for (const junk of [undefined, null, {}, { open: 1 }, { open: 'true' }, { open: undefined }]) assert.equal(advisoryStageOpen(junk), false);
  assert.equal(Object.isFrozen(R8_ADVISORY_STAGE_GATE), true);
  assert.equal(advisoryStageOpen({ open: true, reason: 'test seam' }), true, 'only a literal open === true opens it');

  const stage = fs.readFileSync(path.join(root, 'src/routing-intel/advisory-stage.ts'), 'utf8');
  assert.match(stage, /open: false,/);
  assert.doesNotMatch(stage, /process\.env|readFile|preferences|localStorage/, 'no runtime source can open it');
  // only the daemon default and the constructor test seam mention it; no preference or HTTP field
  const users = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (/\.(ts|html)$/.test(entry.name) && /R8_ADVISORY_STAGE_GATE|routingAdvisoryStage/.test(fs.readFileSync(full, 'latin1'))) users.push(path.relative(root, full).replaceAll('\\', '/'));
  } };
  walk(path.join(root, 'src'));
  assert.deepEqual(users.sort(), ['src/control-plane/daemon.ts', 'src/routing-intel/advisory-stage.ts']);
  assert.doesNotMatch(html, /advisoryStage|R8_ADVISORY|advisory-stage/, 'no Dad-facing switch');
});

// ── optionToDecision: pure bridge ──────────────────────────────────────────────────────────────────────────────

test('R8-2 optionToDecision maps the exact R6 route: instance, model, effort, action; deterministic and pure', () => {
  assert.equal(REC.baselineAgreement, 'disagree');
  assert.equal(REC.primary.route.playerInstanceId, 'claude-1');
  const before = JSON.stringify(REC);
  const result = optionToDecision(REC, REC.primary, ctx());
  assert.equal(result.ok, true);
  const d = result.decision;
  assert.deepEqual(
    [d.mode, d.playerInstanceId, d.provider, d.model, d.effort, d.action, d.gameId, d.playLabel, result.decidedBy],
    ['auto', 'claude-1', 'claude', 'cl-1', 'high', 'dispatch', GAME, 'Medium implementation Play', 'coach-accepted-primary']
  );
  assert.equal(d.playerName, 'Claude');
  assert.deepEqual(optionToDecision(REC, REC.primary, ctx()), result, 'deterministic');
  assert.equal(JSON.stringify(REC), before, 'the recommendation is not mutated and not re-ranked');

  const nextBest = optionToDecision(REC, REC.nextBest, ctx({ choice: 'recommended-next-best' }));
  assert.equal(nextBest.ok, true);
  assert.equal(nextBest.decision.playerInstanceId, 'codex-1');
  assert.equal(nextBest.decidedBy, 'coach-accepted-next-best');

  const src = fs.readFileSync(path.join(root, 'src/routing-intel/option-to-decision.ts'), 'utf8');
  assert.doesNotMatch(src, /recommendRoute\(|computeBelief|eligibleSeats|\.sort\(|Math\.random|Date\.now|node:fs|writeFile/, 'no second brain, no eligibility, no clock, no store');
});

test('R8-3 stale routes are refused, never rerouted; wait/SCHEDULE is not actionable; locks and MANUAL cannot be replaced', () => {
  const refusal = (rec, option, over) => {
    const r = optionToDecision(rec, option, ctx(over));
    assert.equal(r.ok, false);
    return r.reason;
  };
  assert.equal(refusal(REC, REC.primary, { candidates: [CODEX] }), 'seat-unavailable', 'the seat vanished');
  assert.equal(refusal(REC, REC.primary, { candidates: [CODEX, { ...CLAUDE, state: 'busy' }] }), 'seat-unavailable', 'the seat is no longer ready');
  const noModel = { ...CLAUDE, capability: { ...CLAUDE.capability, models: [] } };
  assert.equal(refusal(REC, REC.primary, { candidates: [CODEX, noModel] }), 'route-stale');
  assert.equal(refusal(REC, undefined, {}), 'no-option');
  assert.equal(refusal(REC, REC.nextBest, {}), 'choice-mismatch', 'the option must be the one the choice names');

  const wait = { ...REC.primary, kind: 'wait-for-reset', wait: { pool: 'claude', window: 'five_hour', resetsAt: 1, cycleToken: 1 } };
  assert.equal(refusal({ ...REC, primary: wait, waitOption: wait }, wait, {}), 'wait-not-actionable');
  assert.equal(dadAdvisoryView({ ...REC, primary: wait }), undefined, 'and Dad is never offered a wait');

  const locked = { ...REC, authority: { ...REC.authority, advisoryOnly: true, lockedBy: ['player'] } };
  assert.equal(refusal(locked, locked.primary, {}), 'advisory-only');
  const manual = { ...REC, authority: { ...REC.authority, mode: 'manual', advisoryOnly: true } };
  assert.equal(refusal(manual, manual.primary, {}), 'advisory-only');
  const agree = recommend({ baseline: { playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1', effort: 'high', action: 'dispatch' } });
  assert.equal(agree.baselineAgreement, 'agree');
  assert.equal(refusal(agree, agree.primary, {}), 'not-a-disagreement');
  assert.equal(isAdvisedChoice('recommended-wait'), false);
  assert.equal(isAdvisedChoice('recommended-primary'), true);
});

test('R8-4 Scout-first maps onto the existing Scout decision shape (Formation seat + scoutNeed), no new mechanics', () => {
  const claudeFilm = buildAttributedFilmIndex(many(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 20]], profile: ARCH }), PACK, NOW);
  const scarce = recommend({
    profile: profile({ taskClass: 'architecture', difficulty: 'hard' }), seats: seats(CLAUDE), filmIndex: claudeFilm,
    economics: economics({ claude: { pool: 'claude', evidence: 'known', windows: [W('five_hour', 300, 1 / 3, 300), W('weekly', 10_080, 0.9, 5000)] } }),
    scout: { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 },
    baseline: { playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1', effort: 'high', action: 'dispatch' }
  });
  assert.equal(scarce.primary.kind, 'scout-first');
  const accepted = optionToDecision(scarce, scarce.primary, ctx({ candidates: [CLAUDE, SCOUT], scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: true } }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.decidedBy, 'coach-accepted-primary');
  const d = accepted.decision;
  assert.deepEqual([d.playerInstanceId, d.provider, d.action, d.modelDisplayName], ['scout', 'scout', 'dispatch', 'Scout Formation']);
  assert.equal(d.scoutNeed.scoutAvailable, true);
  assert.equal(d.scoutNeed.materialEvidenceGap, true);
  assert.equal(optionToDecision(scarce, scarce.primary, ctx({ candidates: [CLAUDE, { ...SCOUT, state: 'unavailable' }] })).reason, 'seat-unavailable');
  const explicit = optionToDecision(scarce, scarce.scoutOption, ctx({ choice: 'recommended-scout', candidates: [CLAUDE, SCOUT] }));
  assert.equal(explicit.ok, true);
  assert.equal(explicit.decidedBy, 'coach-accepted-scout');

  // the existing router stages the one bounded continuation for exactly this decision shape
  const frames = [];
  const registry = new StadiumRegistry();
  registry.registerSession({ instanceId: 'stadium-1', stadiumId: 'stadium-r8', name: 'R8', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
    lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R8', fingerprintSource: 'git' }, roster: [], capabilities: [CLAUDE, SCOUT], reports: [], rosterSynchronized: true, rosterSyncedAt: 1 });
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => ({ ledger: [], reports: [], names: new Map(), rosterInstanceIds: new Set(['claude-1']), queuedCounts: new Map() }));
  const staged = [];
  const dispatched = [];
  router.on('scout-continuation-staged', (event) => staged.push(event));
  router.on('play-dispatched', (record) => dispatched.push(record));
  router.dispatch({ gameId: GAME, routingMode: 'auto', prompt: 'Design the parser architecture', advised: { decision: d, decidedBy: accepted.decidedBy } });
  const frame = frames.find((f) => f.method === 'dispatch.request');
  assert.equal(frame.params.playerInstanceId, 'scout');
  assert.equal(staged.length, 1, 'the existing Scout continuation machinery was engaged');
  assert.equal(dispatched[0].decidedBy, 'coach-accepted-primary');
});

// ── Dad view ─────────────────────────────────────────────────────────────────────────────────────────────────

test('R8-5 the Dad view is bounded (one line, one subline, two actions), template-only, and has no numbers', () => {
  const view = dadAdvisoryView(REC, { names });
  assert.ok(view);
  assert.deepEqual(Object.keys(view).sort(), ['choice', 'dismissAction', 'line', 'primaryAction', 'recommendationId', 'subline']);
  assert.deepEqual([view.primaryAction, view.dismissAction, view.choice], ['USE', 'DISMISS', 'recommended-primary']);
  assert.ok(view.line.length <= DAD_LINE_MAX && view.subline.length <= DAD_SUBLINE_MAX);
  assert.match(view.line, /^Suggest Claude · (Strong|Good) pick$/);
  assert.equal(view.subline, 'Uses Claude 5H before it resets', 'fixed template for the headline reason code EXPIRING_5H');
  assert.doesNotMatch(JSON.stringify(view), /%|\d+\.\d|utility|posterior|weight|price|possession/i, 'no percentages before R10, no Dev internals');
  // a reason code with no template gets no subline: nothing is generated
  const bestFit = { ...REC, primary: { ...REC.primary, reasons: ['BEST_FIT'] } };
  assert.equal(dadAdvisoryView(bestFit, { names }).subline, undefined);
  // a long name shortens rather than overflowing
  const long = dadAdvisoryView(REC, { names: new Map([['claude-1', 'A Very Long Player Name Indeed']]) });
  assert.ok(long.line.length <= DAD_LINE_MAX);
});

test('R8-6 visibility: agreement, MANUAL, locks and toss-ups show nothing; disagreement under AUTO shows the chip', () => {
  const agree = recommend({ baseline: { playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1', effort: 'high', action: 'dispatch' } });
  assert.equal(dadAdvisoryView(agree, { names }), undefined);
  assert.equal(dadAdvisoryView({ ...REC, authority: { ...REC.authority, mode: 'manual', advisoryOnly: true } }), undefined, 'MANUAL never shows R8');
  assert.equal(dadAdvisoryView({ ...REC, authority: { ...REC.authority, advisoryOnly: true, lockedBy: ['model'] } }), undefined, 'explicit lock');
  assert.equal(dadAdvisoryView({ ...REC, strength: { ...REC.strength, recommendation: 'toss-up' } }), undefined);
  assert.equal(dadAdvisoryView({ ...REC, baselineAgreement: 'no-baseline' }), undefined);
  assert.ok(dadAdvisoryView(REC, { names }));
});

// ── Daemon: closed by default, open only through the test seam ───────────────────────────────────────────────────

const session = (frames) => ({
  instanceId: 'stadium-1', stadiumId: 'stadium-r8', name: 'R8', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
  lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R8', fingerprintSource: 'git' },
  roster: [], capabilities: [CODEX, CLAUDE], reports: [], rosterSynchronized: true, rosterSyncedAt: 1
});
let port = 39820;
async function withDaemon(stage, run) {
  const dir = path.join(scratch, `daemon-${port}`);
  fs.mkdirSync(dir, { recursive: true });
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, devMode: false });
  const events = [];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => events.push(event) };
  const myPort = port++;
  const daemon = new ControlPlaneDaemon({ dir, port: myPort, idleTimeoutMs: 60_000, routingFilm: { journal }, ...(stage ? { routingAdvisoryStage: stage } : {}) });
  const post = (route, body) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port: myPort, path: route, method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
  let token = '';
  const frames = [];
  try {
    await daemon.start();
    token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    daemon.registry.registerSession(session(frames));
    // dispatch over HTTP, accepting the Stadium ingress like a real Stadium
    const dispatch = async (body) => {
      const before = frames.filter((f) => f.method === 'dispatch.request').length;
      const pending = post('/api/dispatch', body);
      for (let i = 0; i < 200 && frames.filter((f) => f.method === 'dispatch.request').length === before; i += 1) await new Promise((r) => setTimeout(r, 5));
      const frame = frames.filter((f) => f.method === 'dispatch.request').at(-1);
      if (frames.filter((f) => f.method === 'dispatch.request').length > before) {
        daemon.routerInstance.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-r8', gameId: GAME, playerInstanceId: frame.params.playerInstanceId, acceptedAt: Date.now() });
      }
      return { reply: await pending, frame: frames.filter((f) => f.method === 'dispatch.request').length > before ? frame : undefined };
    };
    await run({ daemon, post, dispatch, frames, events });
  } finally {
    await daemon.stop();
  }
}
const comparable = (frame) => {
  const { clientRef, ...params } = frame.params;
  return { ...params, prompt: String(params.prompt).replaceAll(clientRef, '<ref>').replace(/\b\d{13}\b/g, '<t>').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<iso>') };
};

test('R8-7 CLOSED (production default): no advisory, no [USE] path, no route change, decidedBy stays auto-baseline', async () => {
  await withDaemon(undefined, async ({ daemon, post, dispatch, frames, events }) => {
    assert.equal(advisoryStageOpen(daemon.advisoryStage), false);
    // even with a perfect offer in hand and Dev Mode on, nothing reaches Dad
    assert.equal((await post('/api/preferences', { devMode: true, gameId: GAME })).status, 200);
    const preview = await post('/api/route/preview', { prompt: PROMPT });
    assert.equal(preview.status, 200);
    assert.deepEqual(Object.keys(preview.body).sort(), ['decision', 'recommendation', 'recommendationNarrative', 'success'], 'the R7 Dev shape only: no advisory key');
    assert.equal(Object.hasOwn(preview.body, 'advisory'), false);

    // a click path cannot exist: both the staged-route request and the dispatch are refused before the router
    daemon.advisoryOffers.set(REC.id, { rec: REC, gameId: GAME, at: Date.now(), promptHash: 'x', scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, base: BASE });
    const staged = await post('/api/route/preview', { prompt: PROMPT, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(staged.status, 409);
    const { reply, frame } = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(reply.status, 409);
    assert.equal(frame, undefined, 'nothing was sent to any Player');
    assert.equal(events.filter((e) => e.kind === 'decision').length, 0, 'and nothing was recorded');

    // ordinary dispatch is unaffected and truthful
    const auto = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME });
    assert.equal(auto.reply.body.success, true);
    assert.equal(events.find((e) => e.kind === 'decision').decidedBy, 'auto-baseline');
  });
});

test('R8-8 CLOSED vs OPEN-but-unclicked: identical AUTO and MANUAL dispatch frames and Film provenance', async () => {
  const run = async (stage) => {
    const out = {};
    await withDaemon(stage, async ({ dispatch, events, daemon }) => {
      const auto = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME });
      const manual = await dispatch({ prompt: 'Review the helper', routingMode: 'manual', gameId: GAME, playerInstanceId: 'claude-1', model: 'cl-1', effort: 'high' });
      Object.assign(out, {
        auto: comparable(auto.frame), manual: comparable(manual.frame),
        decidedBy: events.filter((e) => e.kind === 'decision').map((e) => e.decidedBy),
        chosen: events.filter((e) => e.kind === 'decision').map((e) => [e.chosen.playerInstanceId, e.chosen.model, e.chosen.effort])
      });
    });
    return out;
  };
  const closed = await run(undefined);
  const open = await run({ open: true, reason: 'test seam' });
  assert.deepEqual(open, closed, 'unless Dad clicks USE, nothing changes even when the stage is open');
  assert.deepEqual(closed.decidedBy, ['auto-baseline', 'coach-manual']);
  assert.equal(closed.manual.playerInstanceId, 'claude-1');
});

test('R8-9 OPEN (test seam): AUTO disagreement offers the chip; USE goes through route-choice and the router with truthful decidedBy', async () => {
  await withDaemon({ open: true, reason: 'test seam' }, async ({ daemon, post, dispatch, events }) => {
    // MANUAL / agreement never produce an offer; the offer is what a shown chip would have created
    const staged = daemon.router.computeRoute(GAME, PROMPT, [CODEX, CLAUDE]).decision;
    const view = daemon.offerAdvisory(GAME, PROMPT, staged, REC);
    assert.ok(view && view.recommendationId === REC.id);
    assert.equal(daemon.offerAdvisory(GAME, PROMPT, staged, recommend({ baseline: { playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1', effort: 'high', action: 'dispatch' } })), undefined, 'agreement offers nothing');

    // the staged-route request (same path the alternatives use) shows exactly what will run
    const preview = await post('/api/route/preview', { prompt: PROMPT, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(preview.status, 200);
    assert.deepEqual([preview.body.decision.playerInstanceId, preview.body.decision.model, preview.body.decision.effort, preview.body.advised],
      ['claude-1', 'cl-1', 'high', true], 'the exact R6 route, instance/model/effort');

    // USE with a changed Play is stale: refused, nothing sent
    const stale = await dispatch({ prompt: `${PROMPT} plus something else`, routingMode: 'auto', gameId: GAME, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(stale.reply.status, 409);
    assert.equal(stale.frame, undefined);
    // an unknown / never-shown suggestion is refused
    const unseen = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME, routeChoice: 'recommended-primary', recommendationId: 'rec_never_shown' });
    assert.equal(unseen.reply.status, 409);
    // MANUAL can never carry a suggestion
    const manual = await dispatch({ prompt: PROMPT, routingMode: 'manual', gameId: GAME, playerInstanceId: 'codex-1', routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(manual.reply.status, 409);
    assert.equal(events.filter((e) => e.kind === 'decision').length, 0);

    const used = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(used.reply.body.success, true);
    assert.deepEqual([used.frame.params.playerInstanceId, used.frame.params.model, used.frame.params.effort], ['claude-1', 'cl-1', 'high']);
    const film = events.filter((e) => e.kind === 'decision');
    assert.equal(film.length, 1);
    assert.equal(film[0].decidedBy, 'coach-accepted-primary');
    assert.equal(film[0].chosen.playerInstanceId, 'claude-1');
    // the shadow baseline is still the static AUTO pick, so Film can tell advice from baseline
    assert.equal(film[0].recommendation.baseline.playerInstanceId, staged.playerInstanceId);
    // one shown suggestion, one acceptance
    const again = await dispatch({ prompt: PROMPT, routingMode: 'auto', gameId: GAME, routeChoice: 'recommended-primary', recommendationId: REC.id });
    assert.equal(again.reply.status, 409);
  });
});

test('R8-10 Film reads the new decidedBy values and old lines unchanged; there is no dismiss endpoint or event', () => {
  const dir = path.join(scratch, 'film');
  const store = new RoutingFilmStore({ dir });
  const target = { playerInstanceId: 'claude-1', playerType: 'claude', resourcePool: 'claude' };
  const base = { schemaVersion: 1, kind: 'decision', at: NOW, gameId: GAME, baseline: target, chosen: target, routeAction: 'dispatch',
    receiptBefore: { pool: 'claude', evidence: 'unknown', capturedAt: new Date(NOW).toISOString(), windows: [] } };
  const who = ['auto-baseline', 'coach-manual', 'coach-envelope', 'coach-accepted-primary', 'coach-accepted-next-best', 'coach-accepted-scout'];
  who.forEach((decidedBy, i) => store.append({ ...base, clientRef: `c${i}`, decidedBy }));
  fs.appendFileSync(path.join(dir, 'routing-film.jsonl'), `${JSON.stringify({ ...base, clientRef: 'bad', decidedBy: 'coach-accepted-wait' })}\n`);
  const read = store.read();
  assert.deepEqual(read.events.map((e) => e.decidedBy), who);
  assert.deepEqual(read.diagnostics.map((d) => d.reason), ['invalid-event'], 'wait acceptance is not a thing until R9');
  const daemonSource = fs.readFileSync(path.join(root, 'src/control-plane/daemon.ts'), 'latin1');
  assert.doesNotMatch(daemonSource, /advisory\/dismiss|advisory-dismiss|dismissAdvisory|coach-dismissed/);
});

// ── Browser: dormant markup, chip behavior, dismiss ───────────────────────────────────────────────────────────────

class FakeNode {
  constructor() { this.hidden = false; this.text = ''; this.handlers = {}; }
  set textContent(v) { this.text = String(v); }
  get textContent() { return this.text; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
}
function chipHarness() {
  const ids = {};
  for (const id of ['dadAdvisory', 'dadAdvisoryLine', 'dadAdvisorySubline', 'dadAdvisoryUse', 'dadAdvisoryDismiss']) ids[id] = new FakeNode();
  ids.dadAdvisory.hidden = true;
  const start = html.indexOf('// ── R8 Dad advisory chip');
  const end = html.indexOf('// ── end R8');
  assert.ok(start > 0 && end > start);
  const calls = [];
  const factory = new Function('$', 'requestRoutePreview', `
    let currentRouteChoice = '';
    let currentRoutingMode = 'auto';
    ${html.slice(start, end)}
    return { renderDadAdvisory, get choice() { return currentRouteChoice; }, set mode(v) { currentRoutingMode = v; }, get id() { return currentRecommendationId; } };
  `);
  return { ids, calls, page: factory((id) => ids[id] || null, () => { calls.push('preview'); }) };
}

test('R8-11 browser chip: hidden by default and when nothing is offered; renders only the offered line/subline; dismiss sends nothing', () => {
  assert.match(html, /<div id="dadAdvisory" class="advisory-chip" hidden>/, 'dormant markup is hidden');
  assert.match(html, /renderDadAdvisory\(res\.advisory \|\| null\)/, 'the only source of the chip is the daemon\'s advisory');
  const { ids, calls, page } = chipHarness();
  page.renderDadAdvisory(null);
  assert.equal(ids.dadAdvisory.hidden, true, 'nothing offered → nothing shown (the CLOSED state)');
  page.renderDadAdvisory({ recommendationId: 'rec_1', line: 'Suggest Claude · Good pick', subline: 'Uses Claude 5H before it resets' });
  assert.equal(ids.dadAdvisory.hidden, false);
  assert.equal(ids.dadAdvisoryLine.textContent, 'Suggest Claude · Good pick');
  assert.equal(ids.dadAdvisorySubline.textContent, 'Uses Claude 5H before it resets');
  page.renderDadAdvisory({ recommendationId: 'rec_2', line: 'Suggest Scout · Good pick' });
  assert.equal(ids.dadAdvisorySubline.hidden, true, 'no subline when none is offered');

  // Dismiss: presentation only
  ids.dadAdvisoryDismiss.handlers.click();
  assert.equal(ids.dadAdvisory.hidden, true);
  assert.equal(page.choice, '', 'no route choice was made');
  assert.deepEqual(calls, [], 'no request of any kind');
  page.renderDadAdvisory({ recommendationId: 'rec_2', line: 'Suggest Scout · Good pick' });
  assert.equal(ids.dadAdvisory.hidden, true, 'a dismissed suggestion stays quiet for this session');
  page.renderDadAdvisory({ recommendationId: 'rec_3', line: 'Suggest Codex · Strong pick' });
  assert.equal(ids.dadAdvisory.hidden, false, 'a different suggestion is still shown');

  // USE: stages through the existing route choice and requests the staged route again
  ids.dadAdvisoryUse.handlers.click();
  assert.equal(page.choice, 'recommended-primary');
  assert.deepEqual(calls, ['preview']);
  assert.equal(ids.dadAdvisory.hidden, true, 'the chip gives way to the staged route');
  page.renderDadAdvisory({ recommendationId: 'rec_4', line: 'x' });
  assert.equal(ids.dadAdvisory.hidden, true, 'and does not reappear while the suggestion is accepted');
});

test('R8-12 MANUAL hides the chip; the block holds no innerHTML, numbers or Dev vocabulary; send carries the id only for an accepted choice', () => {
  const { ids, page } = chipHarness();
  page.mode = 'manual';
  page.renderDadAdvisory({ recommendationId: 'rec_1', line: 'Suggest Claude · Good pick' });
  assert.equal(ids.dadAdvisory.hidden, true);
  const block = html.slice(html.indexOf('// ── R8 Dad advisory chip'), html.indexOf('// ── end R8'));
  assert.doesNotMatch(block, /innerHTML|utility|posterior|possession|calibrat|%|SCHEDULE|wait-for-reset/i);
  assert.match(html, /String\(currentRouteChoice \|\| ''\)\.startsWith\('recommended-'\) \? \{ recommendationId: currentRecommendationId \}/);
});

// ── Structure: one brain, one router, no new store ────────────────────────────────────────────────────────────────

test('R8-13 no second routing brain or store: routing policy and router stay recommendation-free; R8 modules hold no persistence', () => {
  for (const file of ['src/routing-policy.ts', 'src/control-plane/router.ts', 'src/routing-candidates.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /routing-intel\/|recommendRoute|optionToDecision|dad-advisory|advisory-stage/, `${file} does not consume R6/R8`);
  }
  for (const file of ['advisory-stage.ts', 'option-to-decision.ts', 'dad-advisory.ts']) {
    const source = fs.readFileSync(path.join(root, 'src/routing-intel', file), 'utf8');
    assert.doesNotMatch(source, /node:fs|writeFile|appendFile|localStorage|indexedDB/, `${file} persists nothing`);
  }
  const daemonSource = fs.readFileSync(path.join(root, 'src/control-plane/daemon.ts'), 'latin1');
  assert.match(daemonSource, /private readonly advisoryOffers = new Map/, 'offers are an in-memory, bounded map');
  // the wait/SCHEDULE option is not surfaced anywhere in the Dad layer
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/routing-intel/dad-advisory.ts'), 'utf8'), /SCHEDULE|DeferredPlay|waitOption/);
});
