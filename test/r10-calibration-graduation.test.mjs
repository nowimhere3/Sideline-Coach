// R10 — calibration graduation (S57.1 §12.3 as adjudicated by S57.27 Option 1).
//
//   gate      per task class: N ≥ 30 frozen-prediction / binary-outcome pairs on chosen routes;
//             Brier strictly beats the pooled in-sample base rate; 3 equal-width bins, n ≥ 5 supported
//             and within ±10 pp; sparse bins neither pass nor fail; no 2-bin rule; no 25 pp veto
//   display   Model A: the primary's own posterior mean, only in a supported bin of a graduated class;
//             Dad rounds at presentation, 1–99%, words when UNKNOWN
//   weekly    derived from the Film at the weekly instant; later failure un-graduates
//   R8        stays dormant; ordering and the Film digest are untouched
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALIBRATION_GATE,
  TASK_CLASSES,
  buildCalibrationReport,
  calibratedFirstPassFor,
  calibrationBinIndex,
  calibrationSamples,
  calibrationWeekStart,
  evaluateCalibration,
  evaluateTaskClass,
  withCalibration
} from '../out/routing-intel/calibration.js';
import { SHADOW_MIN_N, buildRoutingIntelligenceView } from '../out/routing-intel/dev-views.js';
import { dadAdvisoryView, dadCalibratedPercent, dadPercent, DAD_LINE_MAX } from '../out/routing-intel/dad-advisory.js';
import { recommendationDigest } from '../out/routing-intel/recommend.js';
import { R8_ADVISORY_STAGE_GATE, advisoryStageOpen } from '../out/routing-intel/advisory-stage.js';
import { loadShippedPriorPack } from '../out/routing-intel/prior-pack.js';
import { PROVIDER_PREFERENCE } from '../out/routing-policy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const pack = loadShippedPriorPack([path.join(root, 'src', 'routing-intel', 'priors.json')]);

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
// A weekly instant (Monday 00:00 UTC) with a full week of resolved Film before it.
const EVAL = calibrationWeekStart(Date.parse('2026-09-24T12:00:00Z'));
const T0 = EVAL - 6 * DAY - 12 * H; // plays finish ≥ 72 h before EVAL when spaced ≤ 1 h apart for ≤ 60 plays
const GAME = 'game-r10';

// ── Pure-math fixtures ──────────────────────────────────────────────────────────────────────────
const s = (p, y, i = 0) => ({ clientRef: `s${i}`, taskClass: 'implementation', p, y });
/** k successes out of n at predicted p. */
const group = (n, p, k, offset = 0) => Array.from({ length: n }, (_, i) => s(p, i < k ? 1 : 0, offset + i));
/** A discriminating low group that keeps Brier well under the base rate. */
const low = (n = 20) => group(n, 0.1, n / 10, 1000);

// ── Film fixtures (real event shapes) ──────────────────────────────────────────────────────────────
const receipt = (at) => ({ pool: 'codex', evidence: 'unknown', capturedAt: new Date(at).toISOString(), windows: [] });
let seq = 0;
function play(ref, { p, y = 1, at = T0 + (++seq % 60) * H, taskClass = 'implementation', role = 'player', outcome, failureClass, model = 'gpt-5.6-sol', recommend = true } = {}) {
  const chosen = { playerInstanceId: 'codex-1', playerType: 'codex', transport: 'controlled', model, effort: 'high', resourcePool: 'codex' };
  const option = { kind: 'send', playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'high', playerInstanceId: 'codex-1', resourcePool: 'codex', utility: 0.5, firstPass: p, cost: 0.1, reasons: ['BEST_FIT'] };
  const end = at + 10 * 60_000;
  const ledgerOutcome = outcome ?? (y === 1 ? 'completed' : 'failed');
  return [
    {
      schemaVersion: 1, kind: 'decision', at, clientRef: ref, gameId: GAME, baseline: chosen, chosen, decidedBy: 'auto-baseline',
      routeAction: 'dispatch', receiptBefore: receipt(at), profile: { taskClass, difficulty: 'medium', role },
      ...(recommend ? {
        recommendation: {
          v: 1, id: `rec_${ref}`, engineVersion: 'e', weightsVersion: 'w', priorPackVersion: 'p', computedAt: at, posture: 'balanced',
          authority: { mode: 'auto', advisoryOnly: false, lockedBy: [] }, capabilities: {}, primary: option,
          strength: { recommendation: 'lean', evidence: 'thin' }, baselineAgreement: 'agree', scoutVerdict: 'no-scout', unknowns: []
        }
      } : {})
    },
    {
      schemaVersion: 1, kind: 'outcome', at: end, clientRef: ref, gameId: GAME, ledgerOutcome, startedAt: at, finishedAt: end,
      durationMs: 10 * 60_000, reportProduced: false, retries: 0, receiptAfter: receipt(end),
      ...(ledgerOutcome === 'failed' ? { failureClass: failureClass ?? 'player' } : failureClass ? { failureClass } : {}),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: 'none', isolationReason: 'fixture', burn: []
    }
  ];
}
/** A Film that graduates `implementation`: 10 at p=0.9 (9 clean), 20 at p=0.1 (2 clean). */
function graduatingFilm(prefix = 'G', at) {
  const events = [];
  for (let i = 0; i < 10; i += 1) events.push(...play(`${prefix}H${i}`, { p: 0.9, y: i < 9 ? 1 : 0, ...(at ? { at: at + i * H } : {}) }));
  for (let i = 0; i < 20; i += 1) events.push(...play(`${prefix}L${i}`, { p: 0.1, y: i < 2 ? 1 : 0, ...(at ? { at: at + (10 + i) * H } : {}) }));
  return events;
}

// ── Synthetic recommendation (RoutingRecommendation shape) ─────────────────────────────────────────
function rec({ mean = 0.912345, kind = 'send', taskClass = 'implementation', role = 'player', reasons = ['BEST_FIT'], windows = [] } = {}) {
  const primary = {
    kind, target: { playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'high' }, route: { playerInstanceId: 'codex-1', model: 'gpt-5.6-sol', effort: 'high' },
    resourcePool: 'codex', reasons,
    scores: { utility: 0.5, firstPass: { mean, lo: mean - 0.05, hi: Math.min(1, mean + 0.03) }, q: mean, cost: { units: 0.1, neutral: false, pricedBurn: 0.1, reacquisition: 0, effective: 0.1, windows }, possession: { tier: 'none', value: 0 }, delayMin: 0, risk: 0, interrupt: 0, sigmaU: 0.1 }
  };
  const baseline = { ...primary, target: { playerType: 'claude', modelId: 'opus', effort: 'high' }, route: { playerInstanceId: 'claude-1' }, reasons: ['BEST_FIT'] };
  return {
    id: 'rec_fixture', engineVersion: 'e', weightsVersion: 'w', priorPackVersion: 'p', computedAt: EVAL, gameId: GAME,
    profile: { taskClass, difficulty: 'medium', role, urgency: 'normal', followUp: 'new-work', touchesCount: 0 },
    posture: { value: 'balanced', source: 'coach-default' },
    authority: { mode: 'auto', lockedBy: [], advisoryOnly: false }, capabilities: {},
    baseline, primary, candidates: [primary, baseline],
    strength: { recommendation: 'clear', evidence: 'established' }, baselineAgreement: 'disagree',
    possession: { max: 0, seats: [] }, scout: { considered: false, verdict: 'not-considered' }, unknowns: []
  };
}
const graduated = (supportedBins = [2]) => ({ classes: [{ taskClass: 'implementation', graduated: true, supportedBins }] });

// ═══════════════════════════════════════ GATE MATH ═══════════════════════════════════════

test('R10-1 N = 29 is insufficient; the same calibrated evidence at N = 30 graduates', () => {
  const thirty = [...group(10, 0.9, 9), ...low(20)];
  const r30 = evaluateTaskClass('implementation', thirty);
  assert.equal(r30.n, 30);
  assert.equal(r30.graduated, true);
  assert.deepEqual(r30.failures, []);
  const r29 = evaluateTaskClass('implementation', thirty.slice(1));
  assert.equal(r29.n, 29);
  assert.equal(r29.graduated, false);
  assert.deepEqual(r29.failures, ['insufficient-evidence']);
  assert.deepEqual(r29.supportedBins, [], 'nothing may speak before graduation');
  assert.equal(CALIBRATION_GATE.minResolved, 30);
});

test('R10-2 Brier strictly beats the pooled base rate: pass, exact tie fails, worse fails', () => {
  const pass = evaluateTaskClass('implementation', [...group(10, 0.9, 9), ...low(20)]);
  assert.equal(pass.baseRate, 11 / 30);
  assert.ok(pass.brierModel < pass.brierBaseRate && pass.brierBeatsBaseRate);

  // Constant prediction equal to the class rate: Brier == base rate exactly → a tie, and a tie fails.
  const tie = evaluateTaskClass('implementation', group(30, 0.5, 15));
  assert.equal(tie.brierModel, 0.25);
  assert.equal(tie.brierBaseRate, 0.25);
  assert.equal(tie.reliabilityMet, true, 'the bin itself is perfectly calibrated…');
  assert.deepEqual([tie.graduated, tie.failures], [false, ['brier-not-better']], '…but a tie is not "beats"');

  // Overconfident constant: 0.9 predicted, 0.8 observed → Brier 0.17 vs base 0.16.
  const worse = evaluateTaskClass('implementation', group(30, 0.9, 24));
  assert.ok(worse.brierModel > worse.brierBaseRate);
  assert.equal(worse.reliabilityMet, true, 'within ±10 pp, so only Brier rejects it');
  assert.deepEqual([worse.graduated, worse.failures], [false, ['brier-not-better']]);

  // All outcomes equal: base rate Brier is 0; nothing can beat it (fail-closed until outcomes are mixed).
  assert.equal(evaluateTaskClass('implementation', group(30, 0.95, 30)).graduated, false);
});

test('R10-3 exact 3-bin boundaries (equal width; p = 1 in the top bin)', () => {
  assert.deepEqual(
    [0, 0.333333, 1 / 3, 0.333334, 0.5, 0.666666, 2 / 3, 0.666667, 0.999999, 1].map(calibrationBinIndex),
    [0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
  );
  const report = evaluateTaskClass('implementation', [s(0, 0), s(1 / 3, 0), s(2 / 3, 1), s(1, 1)]);
  assert.deepEqual(report.bins.map((bin) => [bin.lo, bin.hi, bin.n]), [[0, 1 / 3, 1], [1 / 3, 2 / 3, 1], [2 / 3, 1, 2]]);
});

test('R10-4 n = 4 is sparse (no vote), n = 5 is supported; sparse bins never block; no 25 pp veto', () => {
  // A 4-observation middle bin that is off by 60 pp: sparse, so it neither passes nor fails.
  const sparse = evaluateTaskClass('implementation', [...group(10, 0.9, 9), ...low(20), ...group(4, 0.6, 0, 500)]);
  const middle = sparse.bins[1];
  assert.deepEqual([middle.n, middle.supported, middle.passes], [4, false, null]);
  assert.ok(middle.error > 0.25, 'far beyond 25 pp…');
  assert.equal(sparse.graduated, true, '…and still no veto: a sparse bin carries no vote');
  assert.deepEqual(sparse.supportedBins, [0, 2], 'the sparse bin never authorizes a percent');

  // The same miscalibration with a 5th observation is supported, tested, and blocks.
  const supported = evaluateTaskClass('implementation', [...group(10, 0.9, 9), ...low(20), ...group(5, 0.6, 0, 500)]);
  assert.deepEqual([supported.bins[1].n, supported.bins[1].supported, supported.bins[1].passes], [5, true, false]);
  assert.deepEqual([supported.graduated, supported.failures], [false, ['bin-outside-tolerance']]);
  assert.equal(CALIBRATION_GATE.supportedBinMin, SHADOW_MIN_N.calibrationBin, 'the existing R7 constant, not a new number');
});

test('R10-5 no two-bin requirement: one supported bin with real discrimination graduates', () => {
  // All 30 predictions in the top bin: 15 at 0.95 (all clean), 15 at 0.7 (9 clean).
  const oneBin = evaluateTaskClass('implementation', [...group(15, 0.95, 15), ...group(15, 0.7, 9, 100)]);
  assert.deepEqual(oneBin.bins.map((bin) => bin.n), [0, 0, 30]);
  assert.equal(oneBin.brierBeatsBaseRate, true);
  assert.equal(oneBin.graduated, true);
  assert.deepEqual(oneBin.supportedBins, [2], 'it may speak only where it proved itself');
});

test('R10-6 exactly ±10 pp passes (float-safe); beyond it fails', () => {
  assert.equal(Math.abs(0.7 - 0.8) > 0.1, true, 'the float trap the tolerance epsilon exists for');
  const exact = evaluateTaskClass('implementation', [...group(10, 0.8, 7), ...low(20)]);
  assert.deepEqual([exact.bins[2].supported, exact.bins[2].passes, exact.graduated], [true, true, true]);
  const over = evaluateTaskClass('implementation', [...group(10, 0.81, 7), ...low(20)]);
  assert.ok(over.bins[2].error > 0.1 + 1e-6);
  assert.deepEqual([over.bins[2].passes, over.graduated, over.failures], [false, false, ['bin-outside-tolerance']]);
});

// ═══════════════════════════════════════ FILM SAMPLE ═══════════════════════════════════════

test('R10-7 samples: frozen recommendation-time probabilities, binary outcomes, chosen routes only', () => {
  const events = [
    ...play('A', { p: 0.123456, y: 1 }),
    ...play('B', { p: 0.876543, y: 0 }),
    ...play('MAN', { p: 0.5, model: 'gpt-6-astra' }), // chosen outside every recorded option
    ...play('OLD', { p: 0.5, recommend: false }) // R2-era line with no digest
  ];
  const { samples, withoutPrediction } = calibrationSamples(events, pack, EVAL);
  assert.deepEqual(samples.map((x) => [x.clientRef, x.p, x.y]), [['A', 0.123456, 1], ['B', 0.876543, 0]], 'exactly the frozen digest values; never today\'s belief');
  assert.equal(withoutPrediction.implementation, 2, 'MAN and OLD resolved without a recorded prediction: reported, never counted');
  assert.doesNotMatch(read('src', 'routing-intel', 'calibration.ts'), /computeBelief|recommendRoute\(/, 'R10 never re-derives a prediction');
});

test('R10-8 pending, excluded, environment, never-skill, Scout-role and post-instant evidence is omitted', () => {
  const events = [
    ...play('OK', { p: 0.9, y: 1 }),
    ...play('ENV', { p: 0.9, y: 0, failureClass: 'quota' }),
    ...play('PROV', { p: 0.9, y: 0, failureClass: 'provider' }),
    ...play('INT', { p: 0.9, outcome: 'interrupted' }),
    ...play('UNK', { p: 0.9, outcome: 'unknown' }),
    ...play('SCOUT', { p: 0.9, role: 'scout' }),
    ...play('PEND', { p: 0.9, at: EVAL - 24 * H }), // its 72 h window is still open at the instant
    ...play('LATE', { p: 0.9, at: EVAL + H }) // after the weekly instant
  ];
  const { samples } = calibrationSamples(events, pack, EVAL);
  assert.deepEqual(samples.map((x) => x.clientRef), ['OK']);
});

// ═══════════════════════════════════════ EXPOSURE ═══════════════════════════════════════

test('R10-9 graduated + supported bin → the primary\'s own unrounded mean; unsupported bin / kind → words', () => {
  assert.equal(calibratedFirstPassFor(rec({ mean: 0.912345 }), graduated([2])), 0.912345, 'Model A, no rounding, no transform');
  const exposed = withCalibration(rec({ mean: 0.912345 }), graduated([2]));
  assert.equal(exposed.strength.calibratedFirstPass, 0.912345);

  const unsupported = withCalibration(rec({ mean: 0.45 }), graduated([0, 2]));
  assert.equal('calibratedFirstPass' in unsupported.strength, false, 'a range never proven stays in words');
  for (const kind of ['scout-first', 'wait-for-reset']) {
    assert.equal(calibratedFirstPassFor(rec({ kind }), graduated([2])), undefined, `${kind} is not a binned prediction`);
  }
  assert.equal(calibratedFirstPassFor(rec({ taskClass: 'architecture' }), graduated([2])), undefined, 'another class\'s graduation never lends a percent');
  assert.equal(calibratedFirstPassFor(rec({ role: 'scout' }), graduated([2])), undefined);
  assert.equal(calibratedFirstPassFor(rec(), { classes: [{ taskClass: 'implementation', graduated: false, supportedBins: [] }] }), undefined);
});

test('R10-10 Dad: percent only when earned, rounded at presentation, never 0% or 100%, words when UNKNOWN', () => {
  assert.deepEqual([dadPercent(0.999), dadPercent(0.995), dadPercent(0.001), dadPercent(0), dadPercent(1), dadPercent(0.914), dadPercent(0.5)], [99, 99, 1, 1, 99, 91, 50]);

  const words = dadAdvisoryView(rec());
  assert.equal(words.line, 'Suggest Codex · Strong pick', 'pre-graduation: words');
  const pct = dadAdvisoryView(withCalibration(rec({ mean: 0.912345 }), graduated([2])));
  assert.equal(pct.line, 'Suggest Codex · 91%');
  assert.ok(pct.line.length <= DAD_LINE_MAX);
  assert.equal(dadAdvisoryView(withCalibration(rec({ mean: 0.99999 }), graduated([2]))).line, 'Suggest Codex · 99%');

  const unknown = withCalibration(rec({ reasons: ['RESOURCE_UNKNOWN'] }), graduated([2]));
  assert.equal(unknown.strength.calibratedFirstPass, 0.912345);
  assert.equal(dadCalibratedPercent(unknown), undefined, '§18.2: never a percentage for UNKNOWN');
  assert.equal(dadAdvisoryView(unknown).line, 'Suggest Codex · Strong pick');
  const unknownWindow = withCalibration(rec({ windows: [{ pool: 'codex', window: 'five_hour', price: 'unknown' }] }), graduated([2]));
  assert.equal(dadAdvisoryView(unknownWindow).line, 'Suggest Codex · Strong pick');
});

// ═══════════════════════════════════════ WEEKLY / UN-GRADUATION ═══════════════════════════════════════

test('R10-11 weekly instants, evidence counts only from the next instant, and un-graduation removes the percent', () => {
  assert.equal(new Date(EVAL).getUTCDay(), 1, 'Monday');
  assert.equal(new Date(EVAL).toISOString().slice(11), '00:00:00.000Z');
  assert.equal(calibrationWeekStart(EVAL + WEEK - 1), EVAL);
  assert.equal(calibrationWeekStart(EVAL + WEEK), EVAL + WEEK);

  // Week 1: 30 calibrated Plays resolve before the instant → graduated at EVAL.
  const film = graduatingFilm('W1', EVAL - 6 * DAY);
  const week1 = buildCalibrationReport(film, pack, EVAL + DAY);
  const impl1 = week1.classes.find((c) => c.taskClass === 'implementation');
  assert.deepEqual([impl1.status, impl1.graduated, impl1.supportedBins], ['graduated', true, [0, 2]]);
  assert.equal(withCalibration(rec({ mean: 0.9 }), evaluateCalibration(film, pack, EVAL)).strength.calibratedFirstPass, 0.9);

  // Mid-week, 40 overconfident failures arrive. They do not count until the next weekly instant.
  const bad = [];
  for (let i = 0; i < 40; i += 1) bad.push(...play(`BAD${i}`, { p: 0.9, y: 0, at: EVAL + DAY + i * H }));
  const midweek = buildCalibrationReport([...film, ...bad], pack, EVAL + 3 * DAY);
  assert.equal(midweek.classes.find((c) => c.taskClass === 'implementation').status, 'graduated', 'recomputed weekly, not per Play');

  // Next instant: the class fails and UN-graduates back to words.
  const week2 = buildCalibrationReport([...film, ...bad], pack, EVAL + WEEK + H);
  const impl2 = week2.classes.find((c) => c.taskClass === 'implementation');
  assert.deepEqual([impl2.status, impl2.graduated, impl2.previouslyGraduated, impl2.supportedBins], ['un-graduated', false, true, []]);
  const after = withCalibration(rec({ mean: 0.9 }), evaluateCalibration([...film, ...bad], pack, EVAL + WEEK));
  assert.equal('calibratedFirstPass' in after.strength, false, 'the percent is revoked');
  assert.equal(dadAdvisoryView(after).line, 'Suggest Codex · Strong pick');
});

test('R10-12 cold start: an empty Film is words-only for every class; Dev shows the gate separately from §19.4', () => {
  const report = buildCalibrationReport([], pack, EVAL);
  assert.deepEqual(report.classes.map((c) => [c.taskClass, c.status, c.n, c.graduated]), TASK_CLASSES.map((cls) => [cls, 'insufficient-evidence', 0, false]));
  assert.ok(report.classes.every((c) => c.brierModel === null && c.bins.every((bin) => bin.n === 0 && bin.passes === null)));
  assert.equal(withCalibration(rec(), evaluateCalibration([], pack, EVAL)).strength.calibratedFirstPass, undefined);

  const view = buildRoutingIntelligenceView(graduatingFilm('DV'), pack, EVAL + DAY, PROVIDER_PREFERENCE);
  assert.equal(view.calibration.version, 'r10-calibration-1');
  assert.equal(view.calibration.classes.find((c) => c.taskClass === 'implementation').status, 'graduated');
  assert.deepEqual(
    [view.shadow.graduation.status, view.shadow.graduation.playsRequired, view.shadow.graduation.calibratedPercent],
    ['shadow', 50, 'not-granted'],
    'the §19.4 advisory-chip block is untouched: R10 neither satisfies nor relabels it'
  );
  const html = read('src', 'public', 'index.html');
  assert.match(html, /Calibration graduation · per task class/);
});

// ═══════════════════════════════════════ BOUNDARIES ═══════════════════════════════════════

test('R10-13 R8 stays dormant and untouched', () => {
  assert.equal(R8_ADVISORY_STAGE_GATE.open, false);
  assert.equal(advisoryStageOpen(R8_ADVISORY_STAGE_GATE), false);
  assert.doesNotMatch(read('src', 'routing-intel', 'advisory-stage.ts'), /calibrat|graduat(?!ion)/i);
  assert.doesNotMatch(read('src', 'routing-intel', 'calibration.ts'), /advisory-stage|R8_ADVISORY_STAGE_GATE|graduationPlays/);
});

test('R10-14 exposure never reorders: only strength.calibratedFirstPass is added; the Film digest is byte-identical', () => {
  const base = rec({ mean: 0.912345 });
  const exposed = withCalibration(base, graduated([2]));
  const { strength: s1, ...rest1 } = base;
  const { strength: s2, ...rest2 } = exposed;
  assert.deepEqual(rest2, rest1, 'primary, candidates, baseline, id and everything else are identical');
  assert.deepEqual(s2, { ...s1, calibratedFirstPass: 0.912345 });
  assert.equal(JSON.stringify(recommendationDigest(exposed)), JSON.stringify(recommendationDigest(base)), 'the exposure is not a Film fact');
  assert.equal(withCalibration(base, graduated([0])), base, 'not earned → the very same object');

  const recommend = read('src', 'routing-intel', 'recommend.ts');
  const body = recommend.slice(recommend.indexOf('export function recommendRoute('), recommend.indexOf('// --- Scoring'));
  assert.doesNotMatch(body, /calibrat/i, 'ranking never reads calibration');
  assert.doesNotMatch(read('src', 'routing-intel', 'calibration.ts'), /ROUTING_WEIGHTS|computeBelief/);
  const daemon = read('src', 'control-plane', 'daemon.ts');
  assert.match(daemon, /return withCalibration\(recommendation, this\.calibrationEvaluation\(events, priorPack, input\.now\)\);/);
});
