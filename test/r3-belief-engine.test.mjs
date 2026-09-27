import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PriorPackError,
  emptyPriorPackSource,
  loadShippedPriorPack,
  priorPackSourceFromJson
} from '../out/routing-intel/prior-pack.js';
import { normalizeTarget, UNRANKED_PRIOR_MEAN, UNRANKED_PRIOR_STRENGTH } from '../out/routing-intel/lineage.js';
import { buildFilmIndex } from '../out/routing-intel/film-index.js';
import { BELIEF_CONSTANTS, betaQuantile, computeBelief } from '../out/routing-intel/belief.js';
import { RoutingFilmStore } from '../out/routing-intel/routing-film.js';
import { PROVIDER_PREFERENCE } from '../out/routing-policy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r3-belief-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-26'); // the shipped pack's researchedAt
const options = { baselinePreference: PROVIDER_PREFERENCE };
const shipped = loadShippedPriorPack([path.join(root, 'src', 'routing-intel', 'priors.json')]);
const noFilm = { observations: [], diagnostics: [] };

// ── synthetic pack: a non-roster Player type proves nothing assumes today's Team ──
const synthPack = (overrides = {}) => priorPackSourceFromJson({
  schemaVersion: 1,
  packVersion: 'synth-1',
  semantics: { wildcardExcludes: { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] } },
  lineages: [{ playerType: 'fooai', lineage: 'foo-main', match: '^foo-', researched: true }],
  priors: [
    { playerType: 'fooai', lineage: 'foo-main', modelId: 'foo-a', effort: 'high', taskClass: 'implementation', difficulty: '*',
      firstPass: 0.6, strength: 5, researchQuality: 'cross-checked', researchedAt: '2026-09-26', burn: null, durationMin: null, ...overrides },
    { playerType: 'fooai', lineage: 'foo-main', modelId: '*', effort: '*', taskClass: 'implementation', difficulty: '*',
      firstPass: 0.5, strength: 2, researchQuality: 'extrapolated', researchedAt: '2026-09-26', burn: null, durationMin: null }
  ]
}, 'synthetic');
const FOO = { playerType: 'fooai', modelId: 'foo-a', effort: 'high' };
const IMPL = { taskClass: 'implementation', difficulty: 'medium' };

// ── Film fixtures in the real R2 event shape ──
const receipt = (pool, at) => ({ pool, evidence: 'unknown', capturedAt: new Date(at).toISOString(), windows: [] });
let seq = 0;
function play({
  at = NOW, playerType = 'fooai', model = 'foo-a', effort = 'high', pool = 'foo', gameId = 'g-film',
  outcome = 'completed', durationMs = 10 * 60_000, burn = [], ref = `ref-${String(++seq).padStart(4, '0')}`
} = {}) {
  const target = { playerInstanceId: `${playerType}-1`, playerType, transport: 'controlled', model, effort, resourcePool: pool };
  return {
    ref,
    events: [
      { schemaVersion: 1, kind: 'decision', at, clientRef: ref, gameId, baseline: target, chosen: target,
        decidedBy: 'auto-baseline', routeAction: 'dispatch', receiptBefore: receipt(pool, at) },
      { schemaVersion: 1, kind: 'outcome', at: at + durationMs, clientRef: ref, gameId, ledgerOutcome: outcome,
        startedAt: at, finishedAt: at + durationMs, durationMs, reportProduced: false, retries: 0,
        receiptAfter: receipt(pool, at + durationMs), concurrency: { samePool: [], otherPool: [], unknownPool: [] },
        isolation: burn.length ? burn[0].isolation : 'none', isolationReason: 'fixture', burn }
    ]
  };
}
/** Build a Film from play specs; `resolve`/`profile` fill the R5 and profile joins. */
function film(pack, specs, { resolve = 'clean', profile = IMPL } = {}) {
  const events = [];
  const resolutions = {};
  const profiles = {};
  for (const spec of specs) {
    const p = play(spec);
    events.push(...p.events);
    const resolution = spec.resolution ?? resolve;
    if (resolution) resolutions[p.ref] = typeof resolution === 'string' ? { state: resolution, source: 'outcome' } : resolution;
    const prof = spec.profile === undefined ? profile : spec.profile;
    if (prof) profiles[p.ref] = prof;
  }
  return { events, resolutions, profiles, index: buildFilmIndex(events, pack, { resolutions, profiles }) };
}
const reps = (n, spec = {}) => Array.from({ length: n }, () => ({ ...spec }));

// ─────────────────────────────────────────────────────────────────────────────
test('R3-1 PriorPackSource segments the shipped pack by playerType with versions', () => {
  assert.equal(shipped.packVersion, '2026.09-r1');
  assert.deepEqual(shipped.diagnostics, []);
  assert.equal(shipped.segments.reduce((n, s) => n + s.priors.length, 0), 114);
  for (const segment of shipped.segments) {
    assert.equal(segment.segmentVersion, `2026.09-r1/${segment.playerType}`);
    assert.ok(segment.priors.every((p) => p.playerType === segment.playerType));
    assert.ok(segment.lineages.every((l) => l.playerType === segment.playerType));
  }
  assert.deepEqual(shipped.wildcardExcludes, { modelId: ['provider-default'], effort: ['ultra', 'provider-managed'] });
  assert.equal(shipped.segment('fooai'), undefined);
  assert.throws(() => priorPackSourceFromJson({ schemaVersion: 2 }), PriorPackError);
  const capped = priorPackSourceFromJson({ schemaVersion: 1, packVersion: 'x', lineages: [], priors: [
    { playerType: 'z', lineage: 'l', modelId: 'm', effort: 'high', taskClass: 'quick', difficulty: '*', firstPass: 0.7,
      strength: 3, researchQuality: 'extrapolated', researchedAt: '2026-09-26' }] });
  assert.equal(capped.segments.length, 0, 'a node above its S57.1 strength cap is refused, never loaded');
  assert.match(capped.diagnostics[0], /strength outside S57\.1 cap/);
});

test('R3-2 zero-rep belief equals the researched prior (Beta mean and 20/80 percentiles)', () => {
  const belief = computeBelief({ playerType: 'claude', modelId: 'opus', effort: 'high' }, { taskClass: 'implementation', difficulty: 'hard' }, shipped, noFilm, NOW, options);
  assert.equal(belief.source, 'researched');
  assert.equal(belief.priorNode, 'claude/claude-opus/opus/high');
  assert.equal(belief.segmentVersion, '2026.09-r1/claude');
  assert.equal(belief.firstPass.mean, 0.72);
  assert.equal(belief.nPrior, 4);
  assert.equal(belief.nLocalEff, 0);
  assert.equal(belief.evidence, 'prior-only');
  assert.equal(belief.firstPass.lo, Math.round(betaQuantile(0.2, 2.88, 1.12) * 1e6) / 1e6);
  assert.equal(belief.firstPass.hi, Math.round(betaQuantile(0.8, 2.88, 1.12) * 1e6) / 1e6);
  assert.ok(belief.firstPass.lo < 0.72 && belief.firstPass.hi > 0.72);
  assert.deepEqual(belief.burn, { pool: 'unknown', confidence: 'unknown', windows: [] });
  assert.deepEqual(belief.durationMin, { confidence: 'unknown' });
});

test('R3-3 prior age decay halves strength every 180 days and keeps the mean', () => {
  const at = (days) => computeBelief({ playerType: 'claude', modelId: 'opus', effort: 'high' }, { taskClass: 'implementation', difficulty: 'hard' }, shipped, noFilm, NOW + days * DAY, options);
  assert.equal(at(180).nPrior, 2);
  assert.equal(at(360).nPrior, 1);
  assert.equal(at(360).firstPass.mean, 0.72);
});

test('R3-4 local takeover matches S57.1 §6.2 (n0 = 5: half at ~5 reps, 80% at ~20)', () => {
  const pack = synthPack();
  const share = (n) => {
    const { index } = film(pack, reps(n));
    const b = computeBelief(FOO, IMPL, pack, index, NOW, options);
    return { share: b.nLocalEff / (b.nLocalEff + b.nPrior), b };
  };
  assert.equal(share(0).b.firstPass.mean, 0.6);
  assert.equal(share(5).share, 0.5);
  assert.equal(share(5).b.firstPass.mean, 0.8); // (0.6·5 + 5) / 10
  assert.equal(share(20).share, 0.8);
  assert.equal(share(20).b.evidence, 'established');
});

test('R3-5 wildcard, inheritance, exclusion and alias rules resolve the documented prior', () => {
  const impl = { taskClass: 'implementation', difficulty: 'medium' };
  const arch = { taskClass: 'architecture', difficulty: 'hard' };
  const b = (target, profile = impl) => computeBelief(target, profile, shipped, noFilm, NOW, options);

  const sonnetArch = b({ playerType: 'claude', modelId: 'sonnet', effort: 'high' }, arch);
  assert.deepEqual([sonnetArch.source, sonnetArch.priorNode, sonnetArch.priorMean, sonnetArch.nPrior], ['researched', 'claude/claude-sonnet/sonnet/*', 0.6, 2]);

  const unseen = b({ playerType: 'codex', modelId: 'gpt-6.1-sol', effort: 'medium' });
  assert.deepEqual([unseen.source, unseen.inheritedFrom, unseen.priorMean, unseen.nPrior, unseen.priorNote],
    ['inherited', 'codex/codex-sol/*/*', 0.6, 1, 'NEW_MODEL_INHERITED']);

  const olderSibling = b({ playerType: 'antigravity', modelId: 'gemini-3.7-flash', effort: 'high' });
  assert.deepEqual([olderSibling.source, olderSibling.inheritedFrom, olderSibling.nPrior], ['inherited', 'antigravity/ag-gemini-flash/*/*', 1]);

  const variant = b({ playerType: 'antigravity', modelId: 'gemini-3.8-flash-medium', effort: 'medium' });
  assert.equal(variant.key, 'antigravity/ag-gemini-flash/gemini-3.8-flash/medium');
  assert.equal(variant.priorMean, 0.66);

  const ultra = b({ playerType: 'codex', modelId: 'gpt-6-astra', effort: 'ultra' }, arch);
  assert.deepEqual([ultra.source, ultra.priorMean, ultra.nPrior], ['baseline-preference', 0.62, 2], 'ultra never matches a wildcard');

  const unknownModel = b({ playerType: 'codex', modelId: 'gpt-7-nova', effort: 'high' });
  assert.equal(unknownModel.key, 'codex/?/gpt-7-nova/high');
  assert.equal(unknownModel.source, 'baseline-preference');
  assert.equal(unknownModel.priorMean, 0.7); // codex is implementation rank 1

  const legacy = b({ playerType: 'claude' }, arch);
  assert.deepEqual([legacy.key, legacy.source, legacy.priorMean], ['claude/?/provider-default/provider-managed', 'baseline-preference', 0.7]);

  const drifted = b({ playerType: 'claude', modelId: 'opus', effort: 'high', resolvedModelId: 'claude-opus-6' });
  assert.deepEqual([drifted.source, drifted.priorNote, drifted.nPrior], ['inherited', 'ALIAS_DRIFT_INHERITED', 2]);
  const sameAlias = b({ playerType: 'claude', modelId: 'opus', effort: 'high', resolvedModelId: 'claude-opus-5-5' });
  assert.equal(sameAlias.source, 'researched');
});

test('R3-6 a future unranked Player type starts at m0 0.55 / strength 2', () => {
  for (const pack of [shipped, emptyPriorPackSource(), synthPack()]) {
    const belief = computeBelief({ playerType: 'nova-agent', modelId: 'nova-1', effort: 'high' }, IMPL, pack, noFilm, NOW, options);
    assert.deepEqual([belief.source, belief.priorMean, belief.nPrior, belief.priorNote],
      ['baseline-preference', UNRANKED_PRIOR_MEAN, UNRANKED_PRIOR_STRENGTH, 'UNRANKED_PLAYER_TYPE']);
  }
  // fooai is unranked in PROVIDER_PREFERENCE but researched in the synthetic pack: research wins.
  assert.equal(computeBelief(FOO, IMPL, synthPack(), noFilm, NOW, options).source, 'researched');
});

test('R3-7 R3/R5 boundary: an unresolved completed outcome is not first-pass evidence', () => {
  const pack = synthPack();
  const { index } = film(pack, reps(10), { resolve: null });
  const belief = computeBelief(FOO, IMPL, pack, index, NOW, options);
  assert.equal(belief.nLocalEff, 0);
  assert.equal(belief.firstPass.mean, 0.6);
  assert.equal(belief.durationMin.samples, 10, 'unresolved Plays still carry duration evidence');

  const excluded = film(pack, [
    { outcome: 'interrupted' }, { outcome: 'not-sent' }, { outcome: 'unknown' },
    { resolution: 'pending' }, { resolution: 'excluded' }, { outcome: 'failed', resolution: 'clean' }
  ]);
  assert.equal(computeBelief(FOO, IMPL, pack, excluded.index, NOW, options).nLocalEff, 0);
  assert.deepEqual(excluded.index.diagnostics.map((d) => d.reason), ['resolution-inconsistent']);
});

test('R3-8 attribution weights: coach/outcome 1.0, rule-high 0.6, rule-low 0.3', () => {
  const pack = synthPack();
  const failures = (resolution) => computeBelief(FOO, IMPL, pack, film(pack, [{ resolution }]).index, NOW, options).nLocalEff;
  assert.equal(failures({ state: 'player-defect', source: 'coach', confidence: 'high' }), 1);
  assert.equal(failures({ state: 'player-defect', source: 'rule', confidence: 'high' }), 0.6);
  assert.equal(failures({ state: 'player-defect', source: 'rule', confidence: 'low' }), 0.3);
});

test('R3-9 comparable weighting: class, difficulty, Film decay, fold window, same-Game bonus, unknown profile', () => {
  const pack = synthPack();
  const n = (specs, query = IMPL) => computeBelief(FOO, query, pack, film(pack, specs).index, NOW, options).nLocalEff;
  assert.equal(n([{ profile: { taskClass: 'architecture', difficulty: 'medium' } }]), 0.25);
  assert.equal(n([{ profile: { taskClass: 'quick', difficulty: 'medium' } }]), 0.1);
  assert.equal(n([{ profile: { taskClass: 'default', difficulty: 'medium' } }]), 0.3);
  assert.equal(n([{ profile: { taskClass: 'implementation', difficulty: 'hard' } }]), 0.6);
  assert.equal(n([{ profile: { taskClass: 'implementation', difficulty: 'easy' } }], { taskClass: 'implementation', difficulty: 'hard' }), 0.25);
  assert.equal(n([{ at: NOW - 90 * DAY }]), 0.5);
  assert.equal(n([{ at: NOW - 400 * DAY }]), 0, 'outside the 365-day fold');
  assert.equal(n([{ at: NOW + DAY }]), 0, 'future Film is not evidence at an earlier clock');
  assert.equal(n([{ gameId: 'g-here' }], { ...IMPL, gameId: 'g-here' }), 1.15);
  assert.equal(n([{ profile: null }]), 0.18, 'R2 records no profile: class → default (0.3), difficulty → adjacent (0.6)');
});

test('R3-10 hierarchical pooling uses S57.1 λ and caps pooled pseudo-reps at 6', () => {
  const pack = synthPack();
  const belief = (specs) => computeBelief(FOO, IMPL, pack, film(pack, specs).index, NOW, options);
  assert.equal(belief(reps(4, { effort: 'low' })).pooled, 1.4);            // effort sibling λ 0.35
  assert.equal(belief(reps(4, { model: 'foo-b' })).pooled, 0.6);           // model sibling λ 0.15
  const busy = belief(reps(100, { effort: 'low' }));
  assert.equal(busy.pooled, BELIEF_CONSTANTS.pooledCap);
  assert.equal(busy.nLocalEff, 0, 'pooled reps never count as the node\'s own film');
  assert.equal(belief(reps(50, { playerType: 'other', model: 'foo-a', effort: 'high' })).pooled, 0, 'no cross-playerType pooling');
});

test('R3-11 Scout-role and Player-role observations never mix', () => {
  const pack = synthPack();
  const { index } = film(pack, [
    ...reps(5, { profile: { ...IMPL, role: 'scout' } }),
    ...reps(3, { playerType: 'scout', model: null, effort: null, pool: 'unknown' })
  ]);
  assert.equal(computeBelief(FOO, IMPL, pack, index, NOW, options).nLocalEff, 0);
  assert.equal(computeBelief(FOO, { ...IMPL, role: 'scout' }, pack, index, NOW, options).nLocalEff, 5);
});

test('R3-12 drift is suspected on a sustained break and clears when the newest five return', () => {
  const pack = synthPack();
  const t = (i) => NOW - (40 - i) * 60_000;
  const history = Array.from({ length: 20 }, (_, i) => ({ at: t(i) }));
  const slump = Array.from({ length: 5 }, (_, i) => ({ at: t(20 + i), resolution: { state: 'player-defect', source: 'coach' } }));
  const recovery = Array.from({ length: 5 }, (_, i) => ({ at: t(25 + i) }));

  assert.equal(computeBelief(FOO, IMPL, pack, film(pack, history).index, NOW, options).drift, undefined);
  const slumped = computeBelief(FOO, IMPL, pack, film(pack, [...history, ...slump]).index, NOW, options);
  assert.equal(slumped.drift, 'suspected');
  assert.equal(computeBelief(FOO, IMPL, pack, film(pack, [...history, ...slump, ...recovery]).index, NOW, options).drift, undefined);

  // While suspected, the node's Film decays on a 45-day half-life instead of 90.
  // Exactly 90 days old; same instant, so order falls to the (sequential) clientRef.
  const aged = [...history, ...slump].map((spec) => ({ ...spec, at: NOW - 90 * DAY }));
  const b = computeBelief(FOO, IMPL, pack, film(pack, aged).index, NOW, options);
  assert.equal(b.drift, 'suspected');
  assert.equal(b.nLocalEff, 25 * 0.25);
});

const burnObs = (delta, { isolation = 'high', pool = 'foo', window = 'five_hour' } = {}) => ({
  pool, window, windowLengthMin: window === 'weekly' ? 10080 : 300, isolation, reason: 'fixture',
  remainingPercentDelta: delta, ...(delta === 0 ? { censoredAtMostPercent: 1 } : {})
});

test('R3-13 BurnEstimate uses only isolated same-pool evidence', () => {
  const pack = synthPack();
  const estimate = (specs, pool = 'foo') => computeBelief(FOO, IMPL, pack, film(pack, specs, { resolve: null }).index, NOW, { ...options, resourcePool: pool }).burn;

  const deltas = [8, 9, 10, 11, 12, 10];
  const clean = estimate(deltas.map((d) => ({ burn: [burnObs(d)] })));
  assert.equal(clean.windows.length, 1);
  const w = clean.windows[0];
  assert.deepEqual([w.window, w.windowLengthMin, w.samples, w.weight, w.confidence, w.basis], ['five_hour', 300, 6, 6, 'medium', 'comparable-film']);
  const geo = Math.exp(deltas.reduce((s, d) => s + Math.log(d / 100), 0) / deltas.length);
  assert.equal(w.p50, Math.round(geo * 1e6) / 1e6);
  assert.ok(w.p25 <= w.p50 && w.p50 <= w.p75);

  const noisy = estimate([
    ...deltas.map((d) => ({ burn: [burnObs(d)] })),
    { burn: [burnObs(40, { isolation: 'low' })] },
    { burn: [burnObs(40, { isolation: 'none' })] },
    { burn: [burnObs(40, { pool: 'other' })] },
    { burn: [burnObs(0)] },
    { burn: [burnObs(90)] }
  ]);
  assert.equal(noisy.windows[0].samples, 6, 'low/none/other-pool excluded; censored and outlier not samples');
  assert.equal(noisy.windows[0].censoredSmall, 1);
  assert.equal(noisy.windows[0].outliersDropped, 1, 'Δ above 3× the comparable p75 is dropped');
  assert.equal(noisy.windows[0].p50, w.p50);

  assert.deepEqual(estimate(deltas.map((d) => ({ burn: [burnObs(d)] })), 'unknown'), { pool: 'unknown', confidence: 'unknown', windows: [] });
  assert.equal(estimate([{ burn: [burnObs(10, { isolation: 'low' })] }]).confidence, 'unknown');
  const thin = estimate([{ burn: [burnObs(10)] }]).windows[0];
  assert.equal(thin.confidence, 'low');
  assert.ok(thin.p25 < thin.p50 && thin.p75 > thin.p50, 'a single sample is never an exact range');
  const high = estimate(reps(16, { burn: [burnObs(10)] })).windows[0];
  assert.equal(high.confidence, 'high');
  const windows = estimate([{ burn: [burnObs(10), burnObs(2, { window: 'weekly' })] }]).windows.map((x) => x.window);
  assert.deepEqual(windows, ['five_hour', 'weekly'], 'open window ids from Film, not an enum');
});

test('R3-14 prior burn/duration ranges shrink on the log scale when a pack supplies them', () => {
  const pack = synthPack({ burn: { five_hour: [0.05, 0.1, 0.2] }, durationMin: [10, 20, 40] });
  const b = computeBelief(FOO, IMPL, pack, noFilm, NOW, { ...options, resourcePool: 'foo' });
  assert.deepEqual([b.burn.windows[0].basis, b.burn.windows[0].p50], ['prior', 0.1]);
  assert.equal(b.durationMin.p50, 20);
  const blended = computeBelief(FOO, IMPL, pack, film(pack, reps(5, { burn: [burnObs(20)] }), { resolve: null }).index, NOW, { ...options, resourcePool: 'foo' });
  const mu = (5 * Math.log(0.1) + 5 * Math.log(0.2)) / 10;
  assert.equal(blended.burn.windows[0].basis, 'blended');
  assert.equal(blended.burn.windows[0].p50, Math.round(Math.exp(mu) * 1e6) / 1e6);
});

test('R3-15 duration comes from completed comparable Plays only', () => {
  const pack = synthPack();
  const { index } = film(pack, [10, 20, 30].map((m) => ({ durationMs: m * 60_000 })).concat([{ outcome: 'failed', durationMs: 99 * 60_000 }]), { resolve: null });
  const d = computeBelief(FOO, IMPL, pack, index, NOW, options).durationMin;
  assert.equal(d.samples, 3);
  assert.equal(d.p50, Math.round(Math.cbrt(10 * 20 * 30) * 1e6) / 1e6);
  assert.equal(d.confidence, 'low');
});

test('R3-16 fixture Film replay through the real R2 store is byte-identical', () => {
  const pack = synthPack();
  const specs = [
    ...Array.from({ length: 12 }, (_, i) => ({ at: NOW - i * DAY, burn: [burnObs(5 + i)], durationMs: (5 + i) * 60_000 })),
    ...Array.from({ length: 6 }, (_, i) => ({ at: NOW - i * 3 * DAY, effort: 'low', resolution: i % 2 ? 'clean' : { state: 'player-defect', source: 'rule', confidence: 'low' } })),
    ...Array.from({ length: 4 }, (_, i) => ({ at: NOW - i * 7 * DAY, model: 'foo-b', gameId: 'g-here' })),
    { at: NOW - 2 * DAY, outcome: 'interrupted' }
  ];
  const { events, resolutions, profiles } = film(pack, specs);

  const dir = path.join(scratch, 'replay');
  const store = new RoutingFilmStore({ dir });
  for (const event of events) store.append(event);
  const readBack = store.read();
  assert.deepEqual(readBack.diagnostics, []);
  assert.equal(readBack.events.length, events.length);

  const targets = [FOO, { ...FOO, effort: 'low' }, { ...FOO, modelId: 'foo-b' }, { playerType: 'fooai', modelId: 'foo-z', effort: 'high' }];
  const replay = (evts) => {
    const index = buildFilmIndex(evts, pack, { resolutions, profiles });
    return JSON.stringify(targets.map((t) => computeBelief(t, { ...IMPL, gameId: 'g-here' }, pack, index, NOW, { ...options, resourcePool: 'foo' })));
  };
  const reference = replay(events);
  const shuffled = [...events].reverse();
  assert.equal(replay(readBack.events), reference, 'journal round-trip');
  assert.equal(replay(shuffled), reference, 'journal order does not matter');
  assert.equal(replay(events), reference, 'repeat run');
  assert.match(reference, /"engineVersion":"r3-belief-1"/);
});

test('R3-17 R3 source names no Player type and routing does not consume belief', () => {
  const dir = path.join(root, 'src', 'routing-intel');
  for (const file of ['belief.ts', 'burn.ts', 'lineage.ts', 'film-index.ts', 'comparability.ts', 'prior-pack.ts']) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(text, /['"`](claude|codex|antigravity|gemini|openai|anthropic)['"`]/i, `${file} hard-codes a Player type`);
  }
  for (const file of ['src/routing-policy.ts', 'src/control-plane/router.ts']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /routing-intel\/(belief|burn|lineage|film-index|prior-pack|comparability)/, `${file} consumes R3`);
  }
  assert.deepEqual(PROVIDER_PREFERENCE, {
    architecture: ['claude', 'codex', 'antigravity'],
    implementation: ['codex', 'claude', 'antigravity'],
    quick: ['antigravity', 'claude', 'codex'],
    default: ['codex', 'claude', 'antigravity']
  }, 'the exported depth chart is unchanged');
});

test('R3-18 normalized keys follow playerType → lineage → modelId → effort', () => {
  assert.equal(normalizeTarget(shipped, { playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'medium' }).key, 'codex/codex-sol/gpt-5.6-sol/medium');
  assert.equal(normalizeTarget(shipped, { playerType: 'claude', modelId: 'default', effort: 'auto' }).key, 'claude/?/provider-default/provider-managed');
  assert.equal(normalizeTarget(shipped, { playerType: 'antigravity', modelId: 'claude-opus-4-6-thinking' }).lineage, 'ag-claude');
});
