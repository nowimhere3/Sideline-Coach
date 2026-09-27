// R6 amendment — shadow burn-prediction receipt. S57.1 §19.3 (burn prediction error).
//
// The predicted p50 burn is frozen into the existing R6 recommendation digest at recommendation time,
// then compared by the R7 shadow report with the isolated burn actually observed. Old Film has no receipt
// and stays valid; predictions are never reconstructed from current belief.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recommendRoute, recommendationDigest } from '../out/routing-intel/recommend.js';
import { priorPackSourceFromJson } from '../out/routing-intel/prior-pack.js';
import { buildAttributedFilmIndex } from '../out/routing-intel/attribution.js';
import { RoutingFilmStore } from '../out/routing-intel/routing-film.js';
import { buildShadowReport, SHADOW_MIN_N } from '../out/routing-intel/dev-views.js';
import { eligibleSeats, PROVIDER_PREFERENCE } from '../out/routing-policy.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r6-burn-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.parse('2026-09-26T12:00:00Z');
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} not within ${tolerance} of ${expected}`);

const PACK = priorPackSourceFromJson({
  schemaVersion: 1, packVersion: 'r6-burn-synth', semantics: { wildcardExcludes: { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] } },
  lineages: [{ playerType: 'codex', lineage: 'cx-main', match: '^cx-', researched: true }],
  priors: [{ playerType: 'codex', lineage: 'cx-main', modelId: 'cx-1', effort: 'high', taskClass: 'implementation', difficulty: '*',
    firstPass: 0.7, strength: 4, researchQuality: 'cross-checked', researchedAt: '2026-09-26', burn: null, durationMin: null }]
}, 'synthetic');
const CODEX = {
  instanceId: 'codex-1', playerType: 'codex', transport: 'controlled', fieldLabel: 'codex', state: 'ready',
  capability: { provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live',
    models: [{ id: 'cx-1', displayName: 'cx-1', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] }
};
const W = (id, lengthMin, R, T) => {
  const pi = (T / lengthMin) / Math.max(R, 0.01);
  return { id, lengthMin, remainingFraction: R, resetsAt: Math.floor(NOW / 1000) + Math.round(T * 60), timeToResetMin: T, pacePressure: pi,
    price: Math.min(10, Math.max(0.05, pi)), stale: false, policyLag: false };
};
const economics = (remaining) => ({
  projectedAt: new Date(NOW).toISOString(),
  pools: { codex: { pool: 'codex', evidence: 'known', windows: [W('five_hour', 300, remaining, 240), W('weekly', 10_080, 0.6, 2 * 1440)] } }
});
const IMPL = { taskClass: 'implementation', difficulty: 'medium', role: 'player' };
let seq = 0;
function filmPlay({ at = NOW - 4 * DAY, burns = [], ref, recommendation, model = 'cx-1' } = {}) {
  const clientRef = ref ?? `b-${String(++seq).padStart(4, '0')}`;
  const target = { playerInstanceId: 'codex-film', playerType: 'codex', transport: 'controlled', model, effort: 'high', resourcePool: 'codex' };
  const finish = at + 30 * MIN;
  const receipt = (when) => ({ pool: 'codex', evidence: 'unknown', capturedAt: new Date(when).toISOString(), windows: [] });
  return [
    { schemaVersion: 1, kind: 'decision', at, clientRef, gameId: 'g', baseline: target, chosen: target, decidedBy: 'auto-baseline',
      routeAction: 'dispatch', receiptBefore: receipt(at), profile: IMPL, ...(recommendation ? { recommendation } : {}) },
    { schemaVersion: 1, kind: 'outcome', at: finish, clientRef, gameId: 'g', ledgerOutcome: 'completed', startedAt: at, finishedAt: finish,
      durationMs: 30 * MIN, reportProduced: false, retries: 0, receiptAfter: receipt(finish),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: 'high', isolationReason: 'fixture',
      burn: burns.map(([window, delta, isolation = 'high', censored]) => ({
        pool: 'codex', window, windowLengthMin: window === 'weekly' ? 10_080 : 300, isolation, reason: 'fixture', remainingPercentDelta: delta,
        ...(censored ? { censoredAtMostPercent: 1 } : {}) })) }
  ];
}
const history = () => Array.from({ length: 20 }, () => filmPlay({ burns: [['five_hour', 12], ['weekly', 3]] })).flat();
const recommend = (film, remaining = 0.95) => recommendRoute({
  now: NOW, gameId: 'g-1', authority: { mode: 'auto' },
  profile: { taskClass: 'implementation', difficulty: 'medium', role: 'player', urgency: 'normal',
    scoutNeed: { reconnaissancePrimary: false, materialEvidenceGap: false }, followUp: 'new-work', touchKeys: [], postScoutContinuation: false },
  baseline: { playerInstanceId: 'codex-1', playerType: 'codex', model: 'cx-1', effort: 'high', action: 'dispatch' },
  seats: eligibleSeats([CODEX], { authority: 'auto', availability: 'taking-plays' }),
  economics: economics(remaining), priorPack: PACK, filmIndex: buildAttributedFilmIndex(film, PACK, NOW),
  baselinePreference: PROVIDER_PREFERENCE,
  possession: { ledger: [], playTouchKeys: [], filmTouchKeys: new Map() },
  scout: { seatReady: false, scoutPriceCost: 0, intel: [], contradictedReportKeys: [], pRightEvidence: { successes: 0, failures: 0 } }
});

test('R6B-1 the digest freezes the predicted p50 burn per pool/window that R6 already scored', () => {
  const rec = recommend(history());
  const digest = recommendationDigest(rec);
  const chosen = digest.baseline;
  assert.deepEqual(chosen.burn.map((b) => [b.pool, b.window]), [['codex', 'five_hour'], ['codex', 'weekly']]);
  near(chosen.burn[0].p50, 0.12, 0.005, 'five-hour p50 (fraction of the window)');
  near(chosen.burn[1].p50, 0.03, 0.002, 'weekly p50');
  // it is the number the recommendation itself carried — nothing was recomputed
  const scored = rec.baseline.scores.cost.windows;
  assert.deepEqual(chosen.burn.map((b) => b.p50), scored.map((w) => w.burnP50));
  assert.deepEqual(digest.primary.burn, chosen.burn);
});

test('R6B-2 the receipt is frozen: later belief/resource changes cannot alter it, and it round-trips the real journal', () => {
  const rec = recommend(history());
  const digest = recommendationDigest(rec);
  const frozen = JSON.stringify(digest);

  // the world moves on: more Film, a different burn history, different resource state
  const later = recommend([...history(), ...Array.from({ length: 40 }, () => filmPlay({ burns: [['five_hour', 40]] })).flat()], 0.2);
  assert.notDeepEqual(recommendationDigest(later).baseline.burn, digest.baseline.burn, 'a new recommendation predicts differently');
  assert.equal(JSON.stringify(digest), frozen, 'the earlier digest is a plain frozen value');

  const dir = path.join(scratch, 'journal');
  const store = new RoutingFilmStore({ dir });
  for (const event of filmPlay({ ref: 'r', recommendation: digest })) store.append(event);
  const read = store.read();
  assert.equal(read.diagnostics.length, 0);
  assert.equal(JSON.stringify(read.events[0].recommendation), frozen, 'byte-identical after the journal');
});

test('R6B-3 unknown burn writes no receipt; recommending does not mutate the recommendation', () => {
  const rec = recommend([]); // no isolated Film, no prior burn: UNKNOWN
  const before = JSON.stringify(rec);
  const digest = recommendationDigest(rec);
  assert.equal(JSON.stringify(rec), before);
  assert.equal(Object.hasOwn(digest.baseline, 'burn'), false, 'UNKNOWN is absent, never a fabricated zero');
});

// ── R7 join ───────────────────────────────────────────────────────────────────────────────────────

const predicted = (p50 = 0.10, window = 'five_hour') => ({
  v: 1, id: 'rec_x', engineVersion: 'e', weightsVersion: 'w', priorPackVersion: 'p', computedAt: NOW, posture: 'balanced',
  authority: { mode: 'auto', advisoryOnly: false, lockedBy: [] }, capabilities: {},
  primary: { kind: 'send', playerType: 'codex', modelId: 'cx-1', effort: 'high', playerInstanceId: 'codex-film', resourcePool: 'codex',
    firstPass: 0.7, burn: [{ pool: 'codex', window, p50 }], reasons: [] },
  strength: { recommendation: 'lean', evidence: 'thin' }, baselineAgreement: 'agree', scoutVerdict: 'no-scout', unknowns: []
});
const report = (events) => buildShadowReport(events, PACK, NOW).burnPrediction;
let at = NOW - 20 * DAY;
const step = () => (at += 2 * DAY);

test('R6B-4 old Film without a receipt reads correctly and is not-evaluable — never reconstructed', () => {
  const dir = path.join(scratch, 'legacy');
  const store = new RoutingFilmStore({ dir });
  const legacy = filmPlay({ ref: 'old', at: step(), burns: [['five_hour', 12]], recommendation: (({ primary: { burn: _drop, ...p }, ...rest }) => ({ ...rest, primary: p }))(predicted()) });
  for (const event of legacy) store.append(event);
  assert.equal(store.read().diagnostics.length, 0);
  const burn = report(store.read().events);
  assert.equal(burn.status, 'not-evaluable');
  assert.deepEqual([burn.n, burn.medianRelativeError, burn.sufficient], [0, null, false]);
  assert.equal(burn.isolatedObservations, 1);
  assert.equal(burn.withoutPrediction, 1, 'an isolated observation exists but no prediction was frozen for it');
  // even with a rich burn history a prediction could now be made — the report still refuses to invent one
  assert.equal(report([...history(), ...legacy]).status, 'not-evaluable');
  assert.match(burn.limitation, /never reconstructed/);
  assert.equal(report([]).status, 'not-evaluable');
});

test('R6B-5 isolated observation + frozen prediction gives a deterministic median error, per window', () => {
  const deltas = [5, 8, 8, 10, 20];
  const events = deltas.flatMap((delta) => filmPlay({ at: step(), burns: [['five_hour', delta]], recommendation: predicted(0.10) }));
  const burn = report(events);
  // predicted 10%: errors (10-obs)/obs = 1, .25, .25, 0, -.5 → median .25; absolute 0,.25,.25,.5,1 → median .25
  assert.equal(burn.status, 'evaluated');
  assert.deepEqual([burn.n, burn.medianRelativeError, burn.medianAbsRelativeError, burn.sufficient], [5, 0.25, 0.25, true]);
  assert.deepEqual(burn.byWindow, [{ pool: 'codex', window: 'five_hour', n: 5, medianRelativeError: 0.25 }]);
  assert.equal(burn.withoutPrediction, 0);
  const graduation = buildShadowReport(events, PACK, NOW).graduation;
  assert.equal(graduation.burnErrorCriterion, 'within-50-percent');
  assert.equal(graduation.status, 'shadow');
  assert.equal(graduation.calibratedPercent, 'not-granted');

  // fewer than the minimum n is shown, but flagged insufficient and does not satisfy the criterion
  const thin = buildShadowReport(events.slice(0, 2 * (SHADOW_MIN_N.burn - 2)), PACK, NOW);
  assert.equal(thin.burnPrediction.sufficient, false);
  assert.equal(thin.graduation.burnErrorCriterion, 'not-evaluable');
});

test('R6B-6 non-isolated, censored and mismatched observations never contaminate the metric', () => {
  const base = [5, 8, 8, 10, 20].flatMap((delta) => filmPlay({ at: step(), burns: [['five_hour', delta]], recommendation: predicted(0.10) }));
  const clean = report(base);
  const noisy = [
    ...base,
    ...filmPlay({ at: step(), burns: [['five_hour', 90, 'low']], recommendation: predicted(0.10) }),
    ...filmPlay({ at: step(), burns: [['five_hour', 90, 'none']], recommendation: predicted(0.10) }),
    ...filmPlay({ at: step(), burns: [['five_hour', 0, 'high', true]], recommendation: predicted(0.10) }),
    ...filmPlay({ at: step(), burns: [['weekly', 60]], recommendation: predicted(0.10, 'five_hour') }) // no weekly prediction was frozen
  ];
  const dirty = report(noisy);
  assert.deepEqual([dirty.n, dirty.medianRelativeError, dirty.medianAbsRelativeError], [clean.n, clean.medianRelativeError, clean.medianAbsRelativeError]);
  assert.equal(dirty.isolatedObservations, clean.isolatedObservations + 1, 'only the high/medium, uncensored weekly Δ counts as isolated');
  assert.equal(dirty.withoutPrediction, 1, 'and it has no frozen weekly prediction, so it is unpaired');
});

test('R6B-7 only the chosen route is compared; an unchosen option\'s forecast is never scored', () => {
  const claudeOnly = { ...predicted(0.10), primary: { ...predicted(0.10).primary, playerType: 'claude', modelId: 'cl-1' } };
  const events = [5, 8, 8, 10, 20].flatMap((delta) => filmPlay({ at: step(), burns: [['five_hour', delta]], recommendation: claudeOnly }));
  const burn = report(events);
  assert.equal(burn.status, 'not-evaluable', 'the chosen codex route had no forecast; the recommended claude forecast is not borrowed');
  assert.equal(burn.withoutPrediction, 5);
  assert.doesNotMatch(JSON.stringify(buildShadowReport(events, PACK, NOW)), /would have|would succeed/i);
});

test('R6B-8 the amendment is additive measurement: routing modules are untouched and the receipt only reads scored values', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
  const source = fs.readFileSync(path.join(root, 'src/routing-intel/recommend.ts'), 'utf8');
  const fn = source.slice(source.indexOf('function burnReceipt'), source.indexOf('function optionDigest'));
  assert.match(fn, /option\.scores\?\.cost\.windows/);
  assert.doesNotMatch(fn, /computeBelief|estimateBurn|ROUTING_WEIGHTS|Date\.now/, 'no estimation, no clock');
  for (const file of ['src/routing-policy.ts', 'src/control-plane/router.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /burnReceipt|routing-intel\/(recommend|dev-views)/);
  }
  // scoring output is identical with the receipt code path exercised
  const rec = recommend(history());
  const before = JSON.stringify(rec);
  recommendationDigest(rec);
  assert.equal(JSON.stringify(rec), before);
});
