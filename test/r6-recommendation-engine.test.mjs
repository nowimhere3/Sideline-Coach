// R6 — Recommendation engine (shadow mode). S57.1 §4, §5.4, §9–§13, §15.5, §19; S57.2 §10; S57.9 A2.
//
// Golden proofs run through the real R3 belief and R5 attributed Film index (never hand-fed beliefs):
//   §11.3 economics — the economically cheaper Player wins despite its lower remaining percentage
//   §10.5 Scout ROI — normal premium price → NO SCOUT, scarce premium price → SCOUT FIRST
// plus the invariant set: shadow-only, deterministic, advisory for human routes, capability envelope,
// open Player types, seat-owned resource identity, UNKNOWN, possession, counterfactual honesty,
// zero preview writes, Film digest round-trip, and the shipped prior pack.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  FULL_ROUTING_CAPABILITIES,
  RECOMMENDATION_ENGINE_VERSION,
  ROUTING_WEIGHTS,
  recommendRoute,
  recommendationDigest
} from '../out/routing-intel/recommend.js';
import { POSSESSION_CONSTANTS, ownerConfidence, projectPossession, reacquisitionCost } from '../out/routing-intel/possession.js';
import {
  SCOUT_ROI_CONSTANTS,
  assessScoutIntel,
  reconFraction,
  scoutFilmEvidence,
  scoutNetValue,
  scoutPRight
} from '../out/routing-intel/scout-roi.js';
import { REASON_CODES } from '../out/routing-intel/reasons.js';
import { defaultPriorPackPaths, loadShippedPriorPack, priorPackSourceFromJson } from '../out/routing-intel/prior-pack.js';
import { buildAttributedFilmIndex } from '../out/routing-intel/attribution.js';
import { RoutingFilmStore } from '../out/routing-intel/routing-film.js';
import { eligibleSeats, PROVIDER_PREFERENCE } from '../out/routing-policy.js';
import { buildDispatchEvidence, evidenceKey } from '../out/control-plane/follow-up-evidence.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { DEFAULT_PREFERENCES, savePreferences } from '../out/running-players.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r6-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.parse('2026-09-26T12:00:00Z');
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} not within ${tolerance} of ${expected}`);
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── Synthetic, equal-prior pack: economics, possession and Scout decide, not model reputation ──
const pack = (priors = {}) => priorPackSourceFromJson({
  schemaVersion: 1,
  packVersion: 'r6-synth-1',
  semantics: { wildcardExcludes: { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] } },
  lineages: [
    { playerType: 'codex', lineage: 'cx-main', match: '^cx-', researched: true },
    { playerType: 'claude', lineage: 'cl-main', match: '^cl-', researched: true }
  ],
  priors: ['codex', 'claude'].flatMap((playerType) => ['implementation', 'architecture'].map((taskClass) => ({
    playerType,
    lineage: playerType === 'codex' ? 'cx-main' : 'cl-main',
    modelId: playerType === 'codex' ? 'cx-1' : 'cl-1',
    effort: 'high', taskClass, difficulty: '*',
    firstPass: priors[playerType] ?? 0.7, strength: 4,
    researchQuality: 'cross-checked', researchedAt: '2026-09-26', burn: null, durationMin: null
  })))
}, 'synthetic');
const PACK = pack();

// ── Seats through the real R4 seam ──
const capability = (instanceId, playerType, provider, models, state = 'ready', extra = {}) => ({
  instanceId, playerType, transport: 'controlled', fieldLabel: playerType, state,
  capability: {
    provider, authenticated: true, observedAt: 1, freshness: 'live',
    models: models.map((id) => ({ id, displayName: id, isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }))
  },
  ...extra
});
const CODEX = capability('codex-1', 'codex', 'codex', ['cx-1']);
const CLAUDE = capability('claude-1', 'claude', 'claude', ['cl-1']);
const SCOUT = { instanceId: 'scout', playerType: 'scout', transport: 'controlled', fieldLabel: 'Scout', state: 'ready', executionType: 'scout-formation', autoEligible: false,
  capability: { provider: 'scout', authenticated: true, observedAt: 1, freshness: 'live', models: [] } };
const seats = (...caps) => eligibleSeats(caps, { authority: 'auto', availability: 'taking-plays' });

// ── Current economics (R1 shape), built exactly as R1 prices a window ──
const W = (id, lengthMin, R, T, floor) => {
  const pi = (T / lengthMin) / Math.max(R, 0.01);
  return { id, lengthMin, remainingFraction: R, resetsAt: Math.floor(NOW / 1000) + Math.round(T * 60), timeToResetMin: T, pacePressure: pi,
    price: Math.min(10, Math.max(0.05, pi)), ...(floor ? { floor } : {}), stale: false, policyLag: false };
};
const pool = (name, windows) => ({ pool: name, evidence: 'known', windows });
const unknownPool = (name) => ({ pool: name, evidence: 'unknown', windows: [
  { id: 'five_hour', lengthMin: 300, price: 'unknown', stale: true, policyLag: false },
  { id: 'weekly', lengthMin: 10_080, price: 'unknown', stale: true, policyLag: false }
] });
const economics = (pools) => ({ projectedAt: new Date(NOW).toISOString(), pools });
// S57.1 §11.3: A = Codex (5H 95%, T 240 min; Weekly 15%, T 4 d, Dad's LOW), B = Claude (5H 25%, T 10 min; Weekly 60%, T 2 d).
const ECON_113 = economics({
  codex: pool('codex', [W('five_hour', 300, 0.95, 240), W('weekly', 10_080, 0.15, 4 * 1440, 1.5)]),
  claude: pool('claude', [W('five_hour', 300, 0.25, 10), W('weekly', 10_080, 0.60, 2 * 1440)])
});

// ── Film fixtures in the real R2/R5 event shape; resolved by R5's own projection ──
const IMPL = { taskClass: 'implementation', difficulty: 'medium', role: 'player' };
const ARCH_HARD = { taskClass: 'architecture', difficulty: 'hard', role: 'player' };
let seq = 0;
function filmPlay({ playerType, model, pool: poolId, at = NOW - 4 * DAY, burns = [], durationMin = 30, profile = IMPL, outcome = 'completed', scoutReportKey, ref }) {
  const clientRef = ref ?? `r6-${String(++seq).padStart(4, '0')}`;
  const target = { playerInstanceId: `${playerType}-film`, playerType, transport: 'controlled', model, effort: 'high', resourcePool: poolId };
  const finish = at + durationMin * MIN;
  const receipt = (when) => ({ pool: poolId, evidence: 'unknown', capturedAt: new Date(when).toISOString(), windows: [] });
  return [
    { schemaVersion: 1, kind: 'decision', at, clientRef, gameId: 'g-film', baseline: target, chosen: target, decidedBy: 'auto-baseline',
      routeAction: 'dispatch', receiptBefore: receipt(at), profile, ...(scoutReportKey ? { scoutReportKey } : {}) },
    { schemaVersion: 1, kind: 'outcome', at: finish, clientRef, gameId: 'g-film', ledgerOutcome: outcome, startedAt: at, finishedAt: finish,
      durationMs: durationMin * MIN, reportProduced: false, retries: 0, receiptAfter: receipt(finish),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: burns.length ? 'high' : 'none', isolationReason: 'fixture',
      burn: burns.map(([window, delta]) => ({ pool: poolId, window, windowLengthMin: window === 'weekly' ? 10_080 : 300, isolation: 'high', reason: 'fixture', remainingPercentDelta: delta })) }
  ];
}
const plays = (n, spec) => Array.from({ length: n }, () => filmPlay(spec)).flat();
const FILM_113 = [
  ...plays(20, { playerType: 'codex', model: 'cx-1', pool: 'codex', burns: [['five_hour', 12], ['weekly', 3]] }),
  ...plays(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 12], ['weekly', 3]] })
];
const INDEX_113 = buildAttributedFilmIndex(FILM_113, PACK, NOW);

const NO_SCOUT = { seatReady: false, scoutPriceCost: 0, intel: [], contradictedReportKeys: [], pRightEvidence: { successes: 0, failures: 0 } };
const profile = (over = {}) => ({
  taskClass: 'implementation', difficulty: 'medium', role: 'player', urgency: 'normal',
  scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, followUp: 'new-work', touchKeys: [], postScoutContinuation: false,
  ...over
});
const input = (over = {}) => ({
  now: NOW,
  gameId: 'g-1',
  profile: profile(),
  authority: { mode: 'auto' },
  seats: seats(CODEX, CLAUDE),
  economics: ECON_113,
  priorPack: PACK,
  filmIndex: INDEX_113,
  baselinePreference: PROVIDER_PREFERENCE,
  possession: { ledger: [], playTouchKeys: [], filmTouchKeys: new Map() },
  scout: NO_SCOUT,
  ...over
});
const AUTO_BASELINE = { playerInstanceId: 'codex-1', playerType: 'codex', model: 'cx-1', effort: 'high', action: 'dispatch' };
const option = (rec, instanceId) => rec.candidates.find((candidate) => candidate.route.playerInstanceId === instanceId);

// ═════════════════════════════════════════ GOLDEN PROOFS ═════════════════════════════════════════

test('R6-1 §11.3 economics: the cheaper Player wins scoring although its 5H gauge reads 25% vs 95%', () => {
  const rec = recommendRoute(input({ baseline: AUTO_BASELINE }));
  const codex = option(rec, 'codex-1');
  const claude = option(rec, 'claude-1');
  // Burn is the R3 estimate from isolated Film (12% 5H, 3% Weekly), not a hand-fed number.
  assert.deepEqual(
    [codex.belief.burnConfidence, claude.belief.burnConfidence, codex.belief.durationP50Min, claude.belief.durationP50Min],
    ['high', 'high', 30, 30]
  );
  near(codex.scores.cost.pricedBurn, 0.215, 0.002, 'A (Codex) §11.3 cost');
  near(claude.scores.cost.pricedBurn, 0.099, 0.002, 'B (Claude) §11.3 cost');
  assert.ok(claude.scores.cost.pricedBurn < codex.scores.cost.pricedBurn / 2, 'B is less than half the economic cost of A');
  assert.deepEqual(codex.scores.firstPass, claude.scores.firstPass, 'identical capability belief: economics decides');
  assert.ok(claude.scores.utility > codex.scores.utility);
  assert.equal(rec.primary.route.playerInstanceId, 'claude-1', '"highest percentage wins" would have picked Codex');
  assert.notEqual(rec.strength.recommendation, 'toss-up');
  assert.equal(rec.baselineAgreement, 'disagree');
  assert.equal(rec.baseline.route.playerInstanceId, 'codex-1', 'the existing AUTO decision is carried as a fact');
  assert.ok(rec.primary.reasons.includes('EXPIRING_5H') && rec.primary.reasons.includes('RESET_SOON'));
  assert.equal(rec.nextBest.route.playerInstanceId, 'codex-1', 'next best differs in playerType');
  assert.equal(rec.waitOption, undefined, 'waiting for a reset would only raise B\'s cost');
});

test('R6-2 §10.5 Scout ROI: normal premium price → NO SCOUT; scarce premium price → SCOUT FIRST', () => {
  const film = buildAttributedFilmIndex(plays(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 20]], profile: ARCH_HARD }), PACK, NOW);
  const run = (fiveHour) => recommendRoute(input({
    profile: profile({ taskClass: 'architecture', difficulty: 'hard' }),
    seats: seats(CLAUDE),
    filmIndex: film,
    economics: economics({ claude: pool('claude', [fiveHour, W('weekly', 10_080, 0.9, 5000)]) }),
    scout: { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 }
  }));

  const normal = run(W('five_hour', 300, 0.5, 150));               // π = 1.0
  near(option(normal, 'claude-1').scores.cost.pricedBurn, 0.20, 1e-6, 'Opus 5H burn 20% at price 1.0');
  assert.equal(normal.scout.pRight, 0.5);
  assert.equal(normal.scout.value.pUseful, 0.45);
  near(normal.scout.value.net, 0.012, 0.002, '§10.5 net at price 1.0');
  assert.ok(normal.scout.value.net > 0 && normal.scout.value.net < SCOUT_ROI_CONSTANTS.netMargin, 'positive but below the 0.02 margin');
  assert.equal(normal.scout.verdict, 'no-scout');
  assert.equal(normal.primary.kind, 'send');
  assert.equal(normal.scoutOption.kind, 'scout-first', 'still visible to Dev and Film as the Scout option');

  const scarce = run(W('five_hour', 300, 1 / 3, 300));            // π = 3.0
  near(scarce.scout.value.net, 0.034, 0.004, '§10.5 net at price 3.0');
  assert.ok(scarce.scout.value.net > SCOUT_ROI_CONSTANTS.netMargin);
  assert.equal(scarce.scout.verdict, 'scout-first');
  assert.equal(scarce.primary.kind, 'scout-first');
  assert.equal(scarce.primary.scout.tier, 'cheap-formation');
  assert.equal(scarce.primary.reasons.includes('SCOUT_SAVES_PREMIUM'), true);
  assert.equal(scarce.primary.route.playerInstanceId, 'claude-1', 'Scout first, then the same premium Player');
  assert.ok(scarce.primary.scores.delayMin >= 10);

  // Monotonic in premium scarcity, one flip.
  const nets = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map((price) => run(W('five_hour', 300, 1 / price, 300)));
  for (let i = 1; i < nets.length; i += 1) assert.ok(nets[i].scout.value.net >= nets[i - 1].scout.value.net, 'net never falls as scarcity rises');
  const verdicts = nets.map((rec) => rec.scout.verdict);
  assert.equal(verdicts.findIndex((v) => v === 'scout-first') > 0, true);
  assert.ok(verdicts.slice(verdicts.indexOf('scout-first')).every((v) => v === 'scout-first'), 'flips once from no-scout to scout-first');

  // The formula itself, with the architecture's numbers.
  const direct = scoutNetValue({ pRuns: 0.9, pRight: 0.5, reconFraction: reconFraction({ taskClass: 'architecture', materialEvidenceGap: false, maxPossession: 0, freshIntel: false }),
    primaryPricedBurn: 0.2, primaryPlayCost: 0.2, taskClass: 'architecture', difficulty: 'hard', lambdaC: 1, lambdaD: 0.05, urgencyMult: 1, delayMin: 10, scoutPriceCost: 0 });
  assert.deepEqual([direct.savedCost, direct.gain], [0.027, 0.036]);
});

test('R6-3 S57.7 §531 cold start: UNKNOWN burn is a neutral equal cost and Scout ROI cannot fire from it', () => {
  const shipped = loadShippedPriorPack([path.join(root, 'src', 'routing-intel', 'priors.json')]);
  const codex = capability('codex-1', 'codex', 'codex', ['gpt-5.6-sol']);
  const claude = capability('claude-1', 'claude', 'claude', ['opus']);
  const scarce = economics({
    claude: pool('claude', [W('five_hour', 300, 0.1, 300, 4), W('weekly', 10_080, 0.9, 5000)]),
    codex: pool('codex', [W('five_hour', 300, 0.9, 30), W('weekly', 10_080, 0.9, 5000)])
  });
  const rec = recommendRoute(input({
    profile: profile({ taskClass: 'architecture', difficulty: 'hard' }),
    seats: seats(codex, claude), priorPack: shipped, filmIndex: { observations: [], diagnostics: [] }, economics: scarce,
    scout: { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 }
  }));
  const costs = rec.candidates.map((candidate) => candidate.scores.cost);
  assert.ok(costs.every((cost) => cost.neutral && cost.pricedBurn === ROUTING_WEIGHTS.unknownBurnNeutralCost), 'equal neutral cost, labeled');
  assert.ok(rec.candidates.every((candidate) => candidate.belief.burnConfidence === 'unknown'));
  assert.ok(rec.unknowns.some((fact) => fact.kind === 'burn'));
  assert.equal(rec.scout.verdict, 'no-scout');
  assert.ok(rec.scout.value.savedCost === 0 && rec.scout.value.net <= SCOUT_ROI_CONSTANTS.netMargin, 'no saved burn from fiction');
  assert.equal(recommendationDigest(rec).primary.cost, 'unknown', 'Film never records a neutral cost as a number');
  const best = [...rec.candidates].sort((a, b) => b.scores.q - a.scores.q)[0];
  assert.equal(rec.primary.target.playerType, best.target.playerType, 'q decides when cost is neutral');
});

// ═════════════════════════════════════════ INVARIANTS ════════════════════════════════════════════

test('R6-4 deterministic: identical inputs (any seat order) give byte-identical recommendations and digests', () => {
  const a = recommendRoute(input({ baseline: AUTO_BASELINE }));
  const b = recommendRoute(input({ baseline: AUTO_BASELINE }));
  const c = recommendRoute(input({ baseline: AUTO_BASELINE, seats: seats(CLAUDE, CODEX) }));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(a), JSON.stringify(c));
  assert.match(a.id, /^rec_[0-9a-f]{20}$/);
  assert.deepEqual([a.engineVersion, a.weightsVersion, a.priorPackVersion], [RECOMMENDATION_ENGINE_VERSION, ROUTING_WEIGHTS.version, 'r6-synth-1']);
  assert.equal(JSON.stringify(recommendationDigest(a)), JSON.stringify(recommendationDigest(c)));
  assert.doesNotMatch(read('src', 'routing-intel', 'recommend.ts'), /Math\.random\(|Date\.now\(\)|new Date\(\)/, 'no hidden clock or randomness');
});

test('R6-5 explicit human routes are advisory only; nothing about the lock is re-ranked away', () => {
  const manual = recommendRoute(input({ authority: { mode: 'manual' }, baseline: AUTO_BASELINE }));
  assert.deepEqual(manual.authority, { mode: 'manual', lockedBy: ['manual'], advisoryOnly: true });
  assert.equal(manual.primary.reasons[0], 'COACH_LOCKED', 'headline: the Coach decided');

  const envelope = recommendRoute(input({
    authority: { mode: 'auto', constraints: { source: 'play', playerType: 'codex', recognized: ['player'] } },
    seats: eligibleSeats([CODEX, CLAUDE], { authority: 'auto', availability: 'taking-plays', constraints: { source: 'play', playerType: 'codex', recognized: ['player'] } }),
    baseline: AUTO_BASELINE
  }));
  assert.equal(envelope.authority.advisoryOnly, true);
  assert.ok(envelope.candidates.every((candidate) => candidate.target.playerType === 'codex'), 'a locked dimension is never re-ranked');

  const titleOnly = recommendRoute(input({ authority: { mode: 'auto', constraints: { source: 'play', recognized: ['control-title'] } } }));
  assert.equal(titleOnly.authority.advisoryOnly, false, 'a control title is not a route lock');
  assert.equal(recommendRoute(input()).authority.advisoryOnly, false);
});

test('R6-6 capability envelope (S57.2 §10.3): one brain, capability facts only', () => {
  const caps = (over) => ({ ...FULL_ROUTING_CAPABILITIES, ...over });
  assert.deepEqual(recommendRoute(input()).capabilities, FULL_ROUTING_CAPABILITIES, 'default is full (developer / unlimited)');

  const basic = recommendRoute(input({ baseline: AUTO_BASELINE, capabilities: caps({ intelligent: false }) }));
  assert.equal(basic.primary.route.playerInstanceId, 'codex-1', 'basic profile: primary = the baseline');
  assert.deepEqual(basic.candidates.map((candidate) => candidate.route.playerInstanceId), ['codex-1']);
  assert.ok(basic.primary.reasons.includes('BASELINE_ONLY'));
  assert.equal(basic.nextBest ?? basic.waitOption ?? basic.scoutOption, undefined);

  const noEconomics = recommendRoute(input({ baseline: AUTO_BASELINE, capabilities: caps({ economics: false }) }));
  const windows = noEconomics.candidates.flatMap((candidate) => candidate.scores.cost.windows);
  assert.ok(windows.length && windows.every((window) => window.price === 'not-entitled'), 'not-entitled, distinct from unknown');
  assert.ok(noEconomics.candidates.every((candidate) => !candidate.reasons.some((reason) => /SCARC|EXPIRING|RESET_SOON|RESOURCE_UNKNOWN/.test(reason))));
  near(option(noEconomics, 'codex-1').scores.cost.pricedBurn, 0.15, 1e-6, 'neutral 1.0 prices');
  assert.equal(noEconomics.primary.route.playerInstanceId, 'codex-1', 'equal neutral prices → toss-up → baseline kept');
  assert.ok(noEconomics.primary.reasons.includes('TOSS_UP_KEPT_BASELINE'));

  const noScout = recommendRoute(input({ scout: { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 }, capabilities: caps({ scoutExecutionAllowed: false }) }));
  assert.equal(noScout.scout.blockedBy, 'not-entitled');
  assert.equal(noScout.scoutOption, undefined);
  // existing intel stays valued even without Scout execution
  const intel = [{ reportKey: 'k1', at: NOW - 60 * MIN, coversPlay: true }];
  const held = recommendRoute(input({ scout: { ...NO_SCOUT, intel }, capabilities: caps({ scoutExecutionAllowed: false }) }));
  assert.equal(held.scout.verdict, 'no-scout');
  assert.ok(held.primary.reasons.includes('NO_SCOUT_FIELD_POSSESSED'));

  const src = read('src', 'routing-intel', 'recommend.ts');
  assert.doesNotMatch(src, /\b(sku|plan(Name|Id)?|billing|payment|license|price(d)?Tier|subscriptionTier)\b/i, 'no commercial packaging vocabulary');
  assert.doesNotMatch(src, /commercial\//, 'the brain imports nothing from the commercial module');
});

test('R6-7 open Player types; resource identity is the seat pool, never the model lineage; UNKNOWN stays eligible', () => {
  const nova = capability('nova-1', 'nova-agent', 'nova', ['nv-1']);
  const agy = capability('agy-1', 'antigravity', 'agy', ['claude-opus-5.5']);
  const rec = recommendRoute(input({ seats: seats(CODEX, CLAUDE, nova, agy), baseline: AUTO_BASELINE }));
  const novaOption = option(rec, 'nova-1');
  const agyOption = option(rec, 'agy-1');
  assert.ok(novaOption && agyOption, 'a future Player type and an unmetered seat are both ranked');
  assert.equal(novaOption.resourcePool, 'unknown');
  assert.equal(agyOption.resourcePool, 'unknown', 'a Claude-branded model on AntiGravity is not Claude\'s pool');
  assert.deepEqual(agyOption.scores.cost.windows, [], 'no Claude scarcity or windows borrowed');
  assert.ok(agyOption.reasons.includes('RESOURCE_UNKNOWN') && novaOption.reasons.includes('RESOURCE_UNKNOWN'));
  assert.equal(novaOption.belief.source, 'baseline-preference', 'unranked Player type → S57.9 0.55 / 2 prior');
  assert.equal(novaOption.scores.firstPass.mean, 0.55);
  assert.ok(rec.unknowns.some((fact) => fact.kind === 'resource-price' && fact.subject === 'unknown'));
  for (const file of ['recommend.ts', 'possession.ts', 'scout-roi.ts', 'reasons.ts']) {
    assert.doesNotMatch(read('src', 'routing-intel', file), /'(claude|codex|antigravity)'/, `${file} names no Player type`);
  }
});

test('R6-8 current resource truth comes only from R1; Film receipts are never read as current state', () => {
  const lyingFilm = plays(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 12]] }).map((event) => event.kind === 'decision'
    ? { ...event, receiptBefore: { pool: 'claude', evidence: 'known', capturedAt: new Date(NOW - DAY).toISOString(),
        windows: [{ pool: 'claude', window: 'five_hour', windowLengthMin: 300, remainingPercent: 1, resetsAt: Math.floor(NOW / 1000) + 9000, stale: false }] } }
    : event);
  const rec = recommendRoute(input({
    seats: seats(CLAUDE),
    filmIndex: buildAttributedFilmIndex(lyingFilm, PACK, NOW),
    economics: economics({ claude: unknownPool('claude') })
  }));
  const claude = option(rec, 'claude-1');
  assert.ok(claude.scores.cost.windows.every((window) => window.price === 'unknown'), 'stale R1 truth stays UNKNOWN');
  assert.ok(claude.reasons.includes('RESOURCE_UNKNOWN'));
  assert.ok(!claude.reasons.some((reason) => /SCARCITY|SCARCE/.test(reason)), 'a 1% Film receipt never becomes scarcity');
  assert.ok(claude.scores.risk >= ROUTING_WEIGHTS.unknownRisk, 'UNKNOWN adds risk, never exclusion');
  assert.equal(rec.primary.route.playerInstanceId, 'claude-1', 'an UNKNOWN pool remains eligible');
  assert.doesNotMatch(read('src', 'routing-intel', 'recommend.ts'), /receiptBefore|receiptAfter/);
});

test('R6-9 possession lowers reacquisition cost but never forces the route', () => {
  const ledger = [{
    gameId: 'g-1', playerInstanceId: 'claude-1', playerType: 'claude', revision: 1, workState: 'idle',
    recentPlays: [{ clientRef: 'p-owner', outcome: 'completed', startedAt: NOW - 60 * MIN, finishedAt: NOW - 30 * MIN }],
    reports: [], updatedAt: NOW
  }];
  const owned = projectPossession({ gameId: 'g-1', now: NOW, ledger, owner: { instanceId: 'claude-1', evidence: 'named-report' }, playTouchKeys: [], filmTouchKeys: new Map() }, ['claude-1', 'codex-1']);
  const claude = owned.get('claude-1');
  assert.equal(claude.tier, 'owner-strong');
  near(claude.value, 0.85 * Math.pow(0.5, 30 / 240) * 0.7, 1e-6, 'base · decay · UNKNOWN continuity');
  assert.equal(claude.continuityState, 'unknown', 'session continuity is not canonically observable');
  assert.equal(owned.get('codex-1').tier, 'none');

  // Monotonic: more possession never costs more.
  let previous = Infinity;
  for (const value of [0, 0.1, 0.3, 0.5, 0.7]) {
    const cost = reacquisitionCost(0.7, value, 'implementation', 0.2, false);
    assert.ok(cost <= previous);
    previous = cost;
  }
  assert.ok(reacquisitionCost(0.7, 0, 'implementation', 0.2, true) < reacquisitionCost(0.7, 0, 'implementation', 0.2, false), 'fresh Scout intel is shared possession');

  // A much stronger non-owner still wins; the owner is only cheaper.
  const strongCodex = pack({ codex: 0.95, claude: 0.4 });
  const rec = recommendRoute(input({
    priorPack: strongCodex,
    filmIndex: { observations: [], diagnostics: [] },
    economics: economics({ codex: pool('codex', [W('five_hour', 300, 0.5, 150)]), claude: pool('claude', [W('five_hour', 300, 0.5, 150)]) }),
    possession: { ledger, owner: { instanceId: 'claude-1', evidence: 'named-report' }, playTouchKeys: [], filmTouchKeys: new Map() }
  }));
  const ownerOption = option(rec, 'claude-1');
  const other = option(rec, 'codex-1');
  assert.equal(ownerOption.scores.cost.reacquisition, 0, 'the owner reacquires nothing');
  assert.ok(other.scores.cost.reacquisition > 0, 'a non-owner pays to reacquire context');
  assert.equal(rec.primary.route.playerInstanceId, 'codex-1', 'possession never forces a route');
  assert.equal(rec.primary.kind, 'handoff', 'a non-owner takes it with the context package');

  // Owner confidence mirrors resolveContextOwner exactly.
  const affinity = read('src', 'control-plane', 'context-affinity.ts');
  assert.match(affinity, /confidence: evidence === 'latest-report' \? 'medium' : 'strong'/);
  assert.match(affinity, /evidence: 'latest-play',\s*confidence: 'medium'/);
  assert.deepEqual(['named-report', 'incoming-report', 'latest-report', 'latest-play'].map(ownerConfidence), ['strong', 'strong', 'medium', 'medium']);
});

test('R6-10 Scout: readiness, correctness, existing intel and possession stay separate', () => {
  const ready = { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 };
  assert.equal(recommendRoute(input({ scout: { ...ready, seatReady: false } })).scout.blockedBy, 'not-ready');
  assert.equal(recommendRoute(input({ scout: { ...ready, delayMin: undefined } })).scout.blockedBy, 'delay-unknown', 'unknown Scout delay is never assumed');
  assert.equal(recommendRoute(input({ profile: profile({ scoutNeed: { reconnaissancePrimary: true, materialEvidenceGap: true } }), scout: ready })).scout.blockedBy, 'reconnaissance-play');
  assert.equal(recommendRoute(input({ profile: profile({ postScoutContinuation: true }), scout: ready })).scout.blockedBy, 'post-scout-continuation');

  // A ready Scout is not a correct one: bad-scout-evidence lowers P_right and the net value.
  assert.equal(scoutPRight('cheap-formation', { successes: 0, failures: 0 }), 0.5);
  assert.ok(scoutPRight('cheap-formation', { successes: 0, failures: 3 }) < 0.5);
  assert.ok(scoutPRight('cheap-formation', { successes: 6, failures: 0 }) > 0.5);
  const net = (pRight) => scoutNetValue({ pRuns: 0.9, pRight, reconFraction: 0.3, primaryPricedBurn: 0.6, primaryPlayCost: 0.6,
    taskClass: 'architecture', difficulty: 'hard', lambdaC: 1, lambdaD: 0.05, urgencyMult: 1, delayMin: 10, scoutPriceCost: 0 }).net;
  assert.ok(net(0.2) < net(0.5) && net(0.5) < net(0.8));

  // Fresh existing intel covering the topic: no Scout to buy. Contradicted or stale intel is not existing intel.
  const intel = [{ reportKey: 'k-scout', at: NOW - 2 * 60 * MIN, coversPlay: true }];
  assert.equal(assessScoutIntel(intel, new Set(), NOW).state, 'fresh');
  assert.equal(assessScoutIntel(intel, new Set(['k-scout']), NOW).state, 'contradicted');
  assert.equal(assessScoutIntel([{ ...intel[0], at: NOW - 30 * 60 * MIN }], new Set(), NOW).state, 'stale');
  assert.equal(assessScoutIntel([{ ...intel[0], coversPlay: false }], new Set(), NOW), undefined);
  const fresh = recommendRoute(input({ scout: { ...ready, intel } }));
  assert.equal(fresh.scout.verdict, 'no-scout');
  assert.ok(fresh.primary.reasons.includes('NO_SCOUT_FIELD_POSSESSED'));
  const contradicted = recommendRoute(input({ scout: { ...ready, intel, contradictedReportKeys: ['k-scout'] } }));
  assert.equal(contradicted.scout.intel.state, 'contradicted');
  assert.ok(!contradicted.primary.reasons.includes('NO_SCOUT_FIELD_POSSESSED'));

  // R5 Film is the correctness source.
  const continuation = filmPlay({ playerType: 'claude', model: 'cl-1', pool: 'claude', at: NOW - 5 * DAY, scoutReportKey: 'k-bad', ref: 'C1' });
  const cleanContinuation = filmPlay({ playerType: 'claude', model: 'cl-1', pool: 'claude', at: NOW - 5 * DAY, scoutReportKey: 'k-good', ref: 'C2' });
  const followUp = filmPlay({ playerType: 'claude', model: 'cl-1', pool: 'claude', at: NOW - 5 * DAY + 60 * MIN, ref: 'F1' });
  const events = [...continuation, ...cleanContinuation, ...followUp,
    { schemaVersion: 1, kind: 'link', at: NOW - 5 * DAY + 60 * MIN, clientRef: 'F1', gameId: 'g-film', parentClientRef: 'C1', linkEvidence: 'scout-continuation' },
    { schemaVersion: 1, kind: 'attribution', at: NOW - 5 * DAY + 60 * MIN, clientRef: 'F1', gameId: 'g-film', parentClientRef: 'C1', cause: 'bad-scout-evidence', source: 'rule', confidence: 'medium', ruleId: 'R5-3' }];
  const evidence = scoutFilmEvidence(events, NOW);
  assert.deepEqual(evidence.contradictedReportKeys, ['k-bad']);
  assert.deepEqual(evidence.pRightEvidence, { successes: 1, failures: 0.3 });
  assert.equal(read('src', 'routing-intel', 'priors.json').includes('"playerType": "scout"'), false, 'no Scout node in the Player prior pack');
});

test('R6-11 wait-for-reset only against a known horizon, and only with the schedule capability', () => {
  const film = buildAttributedFilmIndex(plays(20, { playerType: 'claude', model: 'cl-1', pool: 'claude', burns: [['five_hour', 12]] }), PACK, NOW);
  const run = (fiveHour, capabilities) => recommendRoute(input({
    seats: seats(CLAUDE), filmIndex: film, economics: economics({ claude: pool('claude', [fiveHour, W('weekly', 10_080, 0.9, 5000)]) }),
    ...(capabilities ? { capabilities } : {})
  }));
  const tight = W('five_hour', 300, 0.05, 30);                     // 12% burn > 5% left: interrupt, reset in 30 min
  const rec = run(tight);
  assert.equal(option(rec, 'claude-1').scores.interrupt, 0.9);
  assert.ok(rec.primary.reasons.includes('INTERRUPT_RISK'));
  assert.equal(rec.waitOption.kind, 'wait-for-reset');
  assert.deepEqual(rec.waitOption.wait, { pool: 'claude', window: 'five_hour', resetsAt: tight.resetsAt, cycleToken: tight.resetsAt });
  assert.equal(rec.waitOption.scores.interrupt, 0);
  assert.equal(rec.primary.kind, 'send', 'R6 never schedules: wait is an option, not the dispatch');
  assert.equal(run({ ...tight, resetsAt: undefined, timeToResetMin: undefined, price: 'unknown', stale: true }).waitOption, undefined, 'never against an UNKNOWN horizon');
  assert.equal(run(tight, { ...FULL_ROUTING_CAPABILITIES, schedule: false }).waitOption, undefined);
  assert.equal(run(W('five_hour', 300, 0.05, 200)).waitOption, undefined, '5H waits only within 90 minutes of the reset');
});

test('R6-12 toss-up stability keeps the existing AUTO choice; reason codes are closed and ordered', () => {
  const equal = economics({ codex: pool('codex', [W('five_hour', 300, 0.5, 150)]), claude: pool('claude', [W('five_hour', 300, 0.5, 150)]) });
  const rec = recommendRoute(input({ economics: equal, baseline: AUTO_BASELINE }));
  assert.equal(rec.strength.recommendation, 'toss-up');
  assert.equal(rec.primary.route.playerInstanceId, 'codex-1');
  assert.ok(rec.primary.reasons.includes('TOSS_UP_KEPT_BASELINE'));
  assert.equal(rec.baselineAgreement, 'agree');
  const again = recommendRoute(input({ economics: equal, baseline: { ...AUTO_BASELINE, playerInstanceId: 'claude-1', playerType: 'claude', model: 'cl-1' } }));
  assert.equal(again.primary.route.playerInstanceId, 'claude-1', 'no flicker: whichever the baseline is, it stays');
  for (const rec2 of [rec, again]) {
    for (const entry of [rec2.primary, ...rec2.candidates]) assert.ok(entry.reasons.every((code) => REASON_CODES.includes(code)));
  }
  const s57 = read('REPORTS', 'Claude', 'S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md');
  for (const code of REASON_CODES.filter((code) => !['SPECIALIZED_ROUTE_KEPT', 'BASELINE_ONLY'].includes(code))) assert.ok(s57.includes(`'${code}'`), `${code} is an S57.1 code`);
});

test('R6-13 recommendations never become outcome evidence for unchosen candidates', () => {
  const rec = recommendRoute(input({ baseline: AUTO_BASELINE }));
  assert.equal(rec.primary.route.playerInstanceId, 'claude-1');
  const [decision, outcome] = filmPlay({ playerType: 'codex', model: 'cx-1', pool: 'codex', ref: 'chosen-codex' });
  const events = [{ ...decision, recommendation: recommendationDigest(rec) }, outcome];
  const index = buildAttributedFilmIndex(events, PACK, NOW);
  assert.deepEqual(index.observations.map((observation) => observation.target.playerType), ['codex'], 'only the chosen route is observed');
  assert.equal(index.observations[0].clientRef, 'chosen-codex');
  const digest = recommendationDigest(rec);
  assert.ok(!('outcome' in digest.primary) && !('firstPassObserved' in digest.primary), 'the digest names options, never results');
});

test('R6-14 Film digest round-trips byte-identically through the real journal', () => {
  const rec = recommendRoute(input({ baseline: AUTO_BASELINE, scout: { ...NO_SCOUT, seatReady: true, pRuns: 0.9, delayMin: 10 } }));
  const store = new RoutingFilmStore({ dir: path.join(scratch, 'digest') });
  const [decision] = filmPlay({ playerType: 'codex', model: 'cx-1', pool: 'codex', ref: 'digest-1' });
  const written = { ...decision, recommendation: recommendationDigest(rec), possession: { tier: 'none', value: 0 } };
  store.append(written);
  const { events, diagnostics } = store.read();
  assert.deepEqual(diagnostics, []);
  assert.equal(JSON.stringify(events[0]), JSON.stringify(written));
  assert.equal(JSON.stringify(recommendationDigest(rec)), JSON.stringify(events[0].recommendation));
  assert.equal(events[0].recommendation.engineVersion, RECOMMENDATION_ENGINE_VERSION);
});

// ═════════════════════════════════════════ PACKAGING ═════════════════════════════════════════════

test('R6-15 priors.json ships and loads from the packaged extension layout (no source-tree fallback)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('src/routing-intel/priors.json'), 'package.json files ships the prior pack');
  assert.match(read('tools', 'dev', 'audit-vsix.mjs'), /'extension\/src\/routing-intel\/priors\.json'/, 'the VSIX audit requires it');

  // Simulate the installed extension: out/routing-intel/*.js beside src/routing-intel/priors.json, cwd elsewhere.
  const ext = path.join(scratch, 'extension');
  fs.mkdirSync(path.join(ext, 'out', 'routing-intel'), { recursive: true });
  fs.mkdirSync(path.join(ext, 'src', 'routing-intel'), { recursive: true });
  fs.copyFileSync(path.join(root, 'out', 'routing-intel', 'prior-pack.js'), path.join(ext, 'out', 'routing-intel', 'prior-pack.js'));
  fs.copyFileSync(path.join(root, 'src', 'routing-intel', 'priors.json'), path.join(ext, 'src', 'routing-intel', 'priors.json'));
  const packaged = createRequire(import.meta.url)(path.join(ext, 'out', 'routing-intel', 'prior-pack.js'));
  const packagedPaths = packaged.defaultPriorPackPaths().slice(0, 2);          // drop the cwd candidate
  assert.equal(packagedPaths[1], path.join(ext, 'src', 'routing-intel', 'priors.json'));
  const source = packaged.loadShippedPriorPack(packagedPaths);
  assert.equal(source.packVersion, '2026.09-r1');
  assert.equal(source.origin, path.join(ext, 'src', 'routing-intel', 'priors.json'));
  fs.rmSync(path.join(ext, 'src', 'routing-intel', 'priors.json'));
  assert.throws(() => packaged.loadShippedPriorPack(packagedPaths), /No prior pack found/, 'missing packaged data is an error, not a silent fallback');
  assert.equal(defaultPriorPackPaths()[1], path.join(root, 'src', 'routing-intel', 'priors.json'));
});

// ═════════════════════════════════════════ SEAMS ═════════════════════════════════════════════════

const GAME = 'game-r6';
const CX_SNAPSHOT = { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['medium', 'high'], defaultEffort: 'medium' }] };
const CL_SNAPSHOT = { provider: 'claude', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'opus',
  models: [{ id: 'opus', displayName: 'Opus', isDefault: true, supportedEfforts: ['medium', 'high'], defaultEffort: 'high' }] };
const liveCodex = () => ({ instanceId: 'codex-aaaa', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready', capability: CX_SNAPSHOT });
const liveClaude = () => ({ instanceId: 'claude-bbbb', playerType: 'claude', transport: 'controlled', fieldLabel: 'Claude', state: 'ready', capability: CL_SNAPSHOT });
const session = (frames) => ({
  instanceId: 'stadium-1', stadiumId: 'stadium-r6', name: 'R6', platform: 'win32',
  socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
  lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R6', fingerprintSource: 'git' },
  roster: [], capabilities: [liveCodex(), liveClaude()], reports: [], rosterSynchronized: true, rosterSyncedAt: 1
});
const contextProvider = () => ({ ledger: [], reports: [], names: new Map(), rosterInstanceIds: new Set(['codex-aaaa', 'claude-bbbb']), queuedCounts: new Map() });

async function dispatchThrough(router, frames, options) {
  const pending = router.dispatch({ gameId: GAME, ...options });
  const frame = frames.filter((item) => item.method === 'dispatch.request').at(-1);
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-r6', gameId: GAME, playerInstanceId: frame.params.playerInstanceId, acceptedAt: Date.now() });
  return { result: await pending, frame };
}
const comparable = (frame) => {
  const { clientRef, ...params } = frame.params;
  return { ...params, prompt: String(params.prompt).replaceAll(clientRef, '<ref>').replace(/\b\d{13}\b/g, '<t>').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<iso>') };
};

test('R6-16 the existing router decision is unchanged by the shadow seam (AUTO and MANUAL)', async () => {
  const run = async (withShadow, options) => {
    const frames = [];
    const registry = new StadiumRegistry();
    registry.registerSession(session(frames));
    const router = new ControlPlaneRouter(registry);
    router.setRouteContextProvider(contextProvider);
    if (!withShadow) router.shadowRouting = () => undefined;
    const emitted = [];
    router.on('play-dispatched', (record) => emitted.push(record));
    const { result, frame } = await dispatchThrough(router, frames, options);
    return { result, frame, record: emitted[0] };
  };
  const auto = { routingMode: 'auto', prompt: 'Implement the bounded parser helper in src/parse.ts' };
  const [a0, a1] = [await run(false, auto), await run(true, auto)];
  assert.deepEqual(comparable(a1.frame), comparable(a0.frame), 'AUTO dispatch frame identical with and without shadow');
  const strip = ({ stagedAt, ...decision }) => decision;
  assert.deepEqual(strip(a1.result.decision), strip(a0.result.decision));
  assert.equal(a1.record.shadow.baseline, a1.record.shadow.decision, 'AUTO baseline is the actual decision object');
  assert.deepEqual(Object.keys(a1.record).filter((key) => key !== 'shadow').sort(), Object.keys(a0.record).filter((key) => key !== 'shadow').sort());

  const manual = { routingMode: 'manual', playerInstanceId: 'claude-bbbb', model: 'opus', effort: 'high', prompt: 'Implement the bounded parser helper in src/parse.ts' };
  const [m0, m1] = [await run(false, manual), await run(true, manual)];
  assert.deepEqual(comparable(m1.frame), comparable(m0.frame), 'MANUAL dispatch frame identical');
  assert.equal(m1.frame.params.playerInstanceId, 'claude-bbbb', 'the human route cannot be overridden');
  assert.equal(m1.record.shadow.baseline.playerInstanceId, 'codex-aaaa', 'shadow baseline = what static AUTO would have sent');
  assert.equal(m1.record.shadow.decision, undefined);

  for (const file of ['router.ts']) assert.doesNotMatch(read('src', 'control-plane', file), /routing-intel/, `${file} never consults the recommendation`);
  assert.doesNotMatch(read('src', 'routing-policy.ts'), /routing-intel/, 'AUTO policy imports no recommendation');
});

function daemonWithJournal(name, extra = {}) {
  const events = [];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => events.push(event) };
  const daemon = new ControlPlaneDaemon({ dir: path.join(scratch, name), port: 0, idleTimeoutMs: 60_000, routingFilm: { journal }, ...extra });
  return { daemon, events };
}
const shadowFor = (decision, candidates) => ({
  ...(decision ? { decision, baseline: decision } : {}),
  candidates,
  scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false },
  postScoutContinuation: false
});

test('R6-17 daemon: every real dispatch records the digest next to the unchanged decision; failures are isolated', () => {
  const { daemon, events } = daemonWithJournal('daemon-digest');
  const candidates = [liveCodex(), liveClaude()];
  daemon.registry.getCapabilitiesForGame = () => candidates;
  const decision = { mode: 'auto', gameId: GAME, playerInstanceId: 'codex-aaaa', playerLabel: 'Codex', provider: 'codex', model: 'gpt-5.6-sol', modelDisplayName: 'GPT-5.6 Sol', effort: 'medium', reason: 'r', stagedAt: 1, action: 'dispatch' };
  const frozen = structuredClone(decision);
  const evidence = buildDispatchEvidence({ prompt: 'Implement the parser in src/parse.ts', gameId: GAME, role: 'player', ledger: [], reports: [] });
  const base = { gameId: GAME, playerInstanceId: 'codex-aaaa', playerType: 'codex', transport: 'controlled', model: 'gpt-5.6-sol', effort: 'medium', at: NOW, routingMode: 'auto', routeAction: 'dispatch', evidence };

  daemon.routerInstance.emit('play-dispatched', { ...base, clientRef: 'r6-auto', shadow: shadowFor(decision, candidates) });
  const auto = events.find((event) => event.kind === 'decision' && event.clientRef === 'r6-auto');
  assert.deepEqual(auto.chosen, auto.baseline, 'R2 baseline/chosen semantics are untouched');
  assert.equal(auto.chosen.playerInstanceId, 'codex-aaaa');
  assert.equal(auto.recommendation.v, 1);
  assert.equal(auto.recommendation.engineVersion, RECOMMENDATION_ENGINE_VERSION);
  assert.equal(auto.recommendation.baseline.playerInstanceId, 'codex-aaaa');
  assert.deepEqual(auto.recommendation.authority, { mode: 'auto', advisoryOnly: false, lockedBy: [] });
  assert.deepEqual(auto.possession, { tier: 'none', value: 0 });
  assert.deepEqual(decision, frozen, 'the router decision object is never mutated');
  assert.doesNotMatch(JSON.stringify(auto), /parse\.ts|Implement the parser/, 'no prompt text or path in Film');

  daemon.routerInstance.emit('play-dispatched', { ...base, clientRef: 'r6-manual', routingMode: 'manual', shadow: shadowFor(decision, candidates) });
  const manual = events.find((event) => event.kind === 'decision' && event.clientRef === 'r6-manual');
  assert.equal(manual.decidedBy, 'coach-manual');
  assert.equal(manual.recommendation.authority.advisoryOnly, true);
  assert.equal(manual.recommendation.primary.reasons[0], 'COACH_LOCKED');

  daemon.routerInstance.emit('play-dispatched', { ...base, clientRef: 'r6-no-facts' });
  const noFacts = events.find((event) => event.kind === 'decision' && event.clientRef === 'r6-no-facts');
  assert.equal(Object.hasOwn(noFacts, 'recommendation'), false, 'no router facts → nothing fabricated (R2 shape)');

  daemon.routerInstance.emit('play-dispatched', { ...base, clientRef: 'r6-broken', shadow: { ...shadowFor(decision, candidates), candidates: [null] } });
  const broken = events.find((event) => event.kind === 'decision' && event.clientRef === 'r6-broken');
  assert.ok(broken && !broken.recommendation, 'a recommendation failure never blocks the decision capture');
  assert.equal(daemon.ledger.hasPendingDispatch(GAME, 'codex-aaaa'), true, 'dispatch accounting unaffected');

  const caps = daemon.routingCapabilities();
  assert.deepEqual(caps, { intelligent: true, economics: true, nextBest: true, schedule: true, scoutExecutionAllowed: true, autonomous: true });
  const core = daemonWithJournal('daemon-core', { entitlements: { profile: 'core' } }).daemon.routingCapabilities();
  assert.equal(core.scoutExecutionAllowed, false, 'core profile: scout.play not entitled');
  assert.equal(core.intelligent, true, 'routing capabilities are S57.2 reserved: never gated yet');
});

test('R6-18 real chain: router dispatch → daemon Film digest; Dev preview exposes it and writes nothing', async () => {
  const dir = path.join(scratch, 'daemon-preview');
  fs.mkdirSync(dir, { recursive: true });
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, devMode: false });
  const events = [];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => events.push(event) };
  const port = 39783;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000, routingFilm: { journal } });
  const post = (route, token, body) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve(JSON.parse(text)));
    });
    req.on('error', reject);
    req.end(payload);
  });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const frames = [];
    daemon.registry.registerSession(session(frames));
    const prompt = 'Implement the bounded parser helper in src/parse.ts';

    const off = await post('/api/route/preview', token, { prompt });
    assert.equal(off.success, true);
    assert.equal(off.recommendation, undefined, 'Dev-only: nothing when Dev Mode is off');

    const devOn = await post('/api/preferences', token, { devMode: true, gameId: GAME });
    assert.equal(devOn.success, true, devOn.message);
    const on = await post('/api/route/preview', token, { prompt });
    assert.equal(on.recommendation.engineVersion, RECOMMENDATION_ENGINE_VERSION);
    assert.equal(on.recommendation.baseline.route.playerInstanceId, on.decision.playerInstanceId);
    const { stagedAt: _on, ...onDecision } = on.decision;
    const { stagedAt: _off, ...offDecision } = off.decision;
    assert.deepEqual(onDecision, offDecision, 'the staged decision is identical with the Dev field present');
    assert.equal(events.length, 0, 'preview writes no Film');

    const { result } = await dispatchThrough(daemon.routerInstance, frames, { routingMode: 'auto', prompt });
    assert.equal(result.success, true);
    const decisions = events.filter((event) => event.kind === 'decision');
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].chosen.playerInstanceId, result.decision.playerInstanceId);
    assert.equal(decisions[0].recommendation.baseline.playerInstanceId, result.decision.playerInstanceId);
    assert.equal(decisions[0].recommendation.priorPackVersion, '2026.09-r1', 'the shipped pack is the runtime prior');
    assert.equal(decisions[0].profile.taskClass, 'implementation');
  } finally {
    await daemon.stop();
  }
});
