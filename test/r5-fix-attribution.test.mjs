import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attributeFollowUp,
  buildAttributedFilmIndex,
  coachAttributionEvent,
  effectiveAttributions,
  indexFilmPlays,
  joinFilmProfiles,
  linkFollowUp,
  projectFirstPassResolutions,
  recordDispatchAttribution,
  settleResolutions
} from '../out/routing-intel/attribution.js';
import { attributionWeight, buildFilmIndex } from '../out/routing-intel/film-index.js';
import { computeBelief } from '../out/routing-intel/belief.js';
import { loadShippedPriorPack } from '../out/routing-intel/prior-pack.js';
import { RoutingFilmRecorder, RoutingFilmStore } from '../out/routing-intel/routing-film.js';
import {
  NO_FOLLOW_UP_SIGNALS,
  buildDispatchEvidence,
  evidenceKey,
  extractFollowUpSignals,
  normalizeFixCause
} from '../out/control-plane/follow-up-evidence.js';
import { recognizeFixCause, recognizeRouteConstraints } from '../out/control-plane/route-constraints.js';
import { PROVIDER_PREFERENCE } from '../out/routing-policy.js';
import { StadiumRegistry } from '../out/control-plane/stadium-registry.js';
import { ControlPlaneRouter } from '../out/control-plane/router.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r5-attribution-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const H = 3_600_000;
const T = Date.parse('2026-09-26T12:00:00.000Z');
const GAME = 'game-r5';
const shipped = loadShippedPriorPack([path.join(root, 'src', 'routing-intel', 'priors.json')]);
const key = evidenceKey;

// ── Film fixtures in the real R2 event shape (+ the optional R5 profile join) ──
const receipt = (at) => ({ pool: 'codex', evidence: 'unknown', capturedAt: new Date(at).toISOString(), windows: [] });
const IMPL = { taskClass: 'implementation', difficulty: 'medium', role: 'player' };

/** One Play: a decision and (unless `open`) an outcome. `finished` defaults to 10 minutes after dispatch. */
function play(ref, {
  at = T, finished, instance = 'codex-1', touches = [], gameId = GAME, outcome = 'completed', failureClass, open = false,
  routeAction = 'dispatch', context, scoutReportKey, profile = IMPL, model = 'gpt-5.6-sol', effort = 'high'
} = {}) {
  const chosen = { playerInstanceId: instance, playerType: 'codex', transport: 'controlled', model, effort, resourcePool: 'codex' };
  const end = finished ?? at + 10 * 60_000;
  const events = [{
    schemaVersion: 1, kind: 'decision', at, clientRef: ref, gameId, baseline: chosen, chosen,
    decidedBy: 'auto-baseline', routeAction, receiptBefore: receipt(at),
    ...(profile ? { profile } : {}),
    ...(touches.length ? { touchKeys: touches.map(key) } : {}),
    ...(context ? { context } : {}),
    ...(scoutReportKey ? { scoutReportKey } : {})
  }];
  if (!open) {
    events.push({
      schemaVersion: 1, kind: 'outcome', at: end, clientRef: ref, gameId, ledgerOutcome: outcome, startedAt: at, finishedAt: end,
      durationMs: end - at, reportProduced: false, retries: 0, receiptAfter: receipt(end),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: 'none', isolationReason: 'fixture', burn: [],
      ...(failureClass ? { failureClass } : {})
    });
  }
  return events;
}
const link = (ref, parent, at, linkEvidence = 'latest-play') => ({
  schemaVersion: 1, kind: 'link', at, clientRef: ref, gameId: GAME, parentClientRef: parent, linkEvidence
});
const attribution = (ref, parent, at, cause, source = 'rule', confidence = 'low', ruleId) => ({
  schemaVersion: 1, kind: 'attribution', at, clientRef: ref, gameId: GAME, parentClientRef: parent, cause, source, confidence,
  ...(ruleId ? { ruleId } : {})
});

const followUp = (over = {}) => ({
  detected: 'continuation',
  signals: { ...NO_FOLLOW_UP_SIGNALS, ...(over.signals ?? {}) },
  ...(over.namedReportKey ? { namedReportKey: over.namedReportKey } : {}),
  ...(over.owner ? { owner: over.owner } : {}),
  ...(over.scoutParentClientRef ? { scoutParentClientRef: over.scoutParentClientRef } : {}),
  ...(over.fixCause ? { fixCause: over.fixCause } : {})
});

/** Run the pure ordered attribution for follow-up F against parent P inside a Film built from `films`. */
function rule({ parent = {}, follow = {}, touches = ['src/a.ts'], others = [], at = T + 2 * H } = {}) {
  const events = [
    ...play('P', { touches: ['src/a.ts'], ...parent }),
    ...others.flat(),
    ...play('F', { at, open: true, touches })
  ];
  const plays = indexFilmPlays(events);
  return attributeFollowUp({
    follow: { clientRef: 'F', touchKeys: touches.map(key), followUp: followUp(follow) },
    parent: plays.get('P'), plays, at
  });
}

// ── §8.3 ordered rules: positive and negative fixtures ──────────────────────────────────

test('R5-1 rule 1: a parent provider/auth/quota/harness/interrupted failure is environment-drift (high); a clean parent is not', () => {
  for (const failureClass of ['provider', 'auth', 'quota', 'harness', 'interrupted']) {
    const got = rule({ parent: { outcome: 'failed', failureClass }, follow: { signals: { defect: true } } });
    assert.deepEqual([got.cause, got.confidence, got.ruleId], ['environment-drift', 'high', 'R5-1'], failureClass);
  }
  assert.equal(rule({ parent: { outcome: 'interrupted' }, follow: { signals: { defect: true } } }).cause, 'environment-drift');
  assert.equal(rule({ parent: { outcome: 'not-sent' }, follow: { signals: { defect: true } } }).cause, 'environment-drift');
  assert.equal(rule({ parent: { outcome: 'completed' }, follow: { signals: { defect: true } } }).cause, 'player-defect');
  assert.notEqual(rule({ parent: { outcome: 'failed' }, follow: { signals: { defect: true } } }).ruleId, 'R5-1',
    'a failed outcome with no proven environmental class is not assumed to be one');
});

test('R5-2 rule 2: another instance completing overlapping work between parent and follow-up is upstream-change (medium)', () => {
  const other = (over = {}) => play('O', { at: T + 30 * 60_000, finished: T + H, instance: 'claude-1', touches: ['src/a.ts'], ...over });
  const attributed = (others, extra = {}) => rule({ others: [others], follow: { signals: { defect: true } }, ...extra });
  const got = attributed(other());
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['upstream-change', 'medium', 'R5-2']);
  // negatives: same instance, failed, after the follow-up, before the parent finished, other files, other Game
  assert.equal(attributed(other({ instance: 'codex-1' })).cause, 'player-defect');
  assert.equal(attributed(other({ outcome: 'failed' })).cause, 'player-defect');
  assert.equal(attributed(other({ at: T + 3 * H, finished: T + 4 * H })).cause, 'player-defect');
  assert.equal(attributed(other({ at: T - H, finished: T + 60_000 })).cause, 'player-defect');
  assert.equal(attributed(other({ touches: ['src/zzz.ts'] })).cause, 'player-defect');
  assert.equal(attributed(other({ gameId: 'other-game' })).cause, 'player-defect');
});

test('R5-3 rule 3: post-Scout continuation + Scout report + correction language is bad-scout-evidence (medium)', () => {
  const scoutKey = key('Reports/Scout/recon.md');
  const parent = { scoutReportKey: scoutKey };
  const got = rule({ parent, follow: { namedReportKey: scoutKey, signals: { correction: true } } });
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['bad-scout-evidence', 'medium', 'R5-3']);
  assert.equal(rule({ parent, follow: { signals: { correction: true, scoutEvidence: true } } }).cause, 'bad-scout-evidence');
  // negatives: no correction wording, parent was not post-Scout, a different report, no Scout reference
  assert.notEqual(rule({ parent, follow: { namedReportKey: scoutKey } }).cause, 'bad-scout-evidence');
  assert.notEqual(rule({ follow: { namedReportKey: scoutKey, signals: { correction: true } } }).cause, 'bad-scout-evidence');
  assert.notEqual(rule({ parent, follow: { namedReportKey: key('other.md'), signals: { correction: true } } }).cause, 'bad-scout-evidence');
});

test('R5-4 rule 4: change language with no defect language is prompt-change (medium)', () => {
  const got = rule({ follow: { signals: { change: true } } });
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['prompt-change', 'medium', 'R5-4']);
  const withDefect = rule({ follow: { signals: { change: true, defect: true } } });
  assert.equal(withDefect.cause, 'player-defect', 'change language with defect language falls through to rule 7');
  assert.equal(rule({ follow: {} }).cause, 'unattributed');
});

test('R5-5 rule 5: naming the next stage of a plan is planned-continuation (high), not a defect', () => {
  const got = rule({ follow: { signals: { planStage: true, defect: true } } });
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['planned-continuation', 'high', 'R5-5']);
  assert.notEqual(got.cause, 'player-defect');
  assert.notEqual(rule({ follow: { signals: { defect: true } } }).cause, 'planned-continuation');
});

test('R5-6 rule 6: parent context unknown/handoff + follow-up supplies a report or file it lacked is missing-context (low)', () => {
  const unknown = { context: { state: 'unknown' } };
  const got = rule({ parent: unknown, follow: { namedReportKey: key('Reports/new.md') }, touches: ['src/a.ts'] });
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['missing-context', 'low', 'R5-6']);
  assert.equal(rule({ parent: { routeAction: 'handoff' }, follow: {}, touches: ['src/a.ts', 'src/new.ts'] }).cause, 'missing-context');
  // negatives: parent had its context; nothing new supplied; the parent already carried that very report
  assert.notEqual(rule({ parent: { context: { state: 'owner' } }, follow: { namedReportKey: key('Reports/new.md') } }).cause, 'missing-context');
  assert.notEqual(rule({ parent: unknown, follow: {}, touches: ['src/a.ts'] }).cause, 'missing-context');
  assert.notEqual(rule({
    parent: { context: { state: 'unknown', reportKey: key('Reports/new.md') } },
    follow: { namedReportKey: key('Reports/new.md') }, touches: ['src/a.ts']
  }).cause, 'missing-context');
});

test('R5-7 rule 7: defect language + same touches (and nothing higher) is player-defect at LOW confidence only', () => {
  const got = rule({ follow: { signals: { defect: true } }, touches: ['src/a.ts'] });
  assert.deepEqual([got.cause, got.confidence, got.ruleId], ['player-defect', 'low', 'R5-7']);
  assert.deepEqual(rule({ follow: { signals: { defect: true } }, touches: ['src/elsewhere.ts'] }), { cause: 'unattributed', confidence: 'low' });
  assert.deepEqual(rule({ follow: { signals: { defect: true } }, touches: [] }), { cause: 'unattributed', confidence: 'low' });
  assert.deepEqual(rule({ follow: {}, touches: ['src/a.ts'] }), { cause: 'unattributed', confidence: 'low' });
});

test('R5-8 ordering: the first matching rule wins and unattributed is the default', () => {
  const everything = { defect: true, change: true, correction: true, planStage: true, scoutEvidence: true };
  const overlappingOther = play('O', { at: T + 30 * 60_000, finished: T + H, instance: 'claude-1', touches: ['src/a.ts'] });
  const parent = { scoutReportKey: key('scout.md'), context: { state: 'unknown' } };
  // R1 beats everything
  assert.equal(rule({ parent: { ...parent, outcome: 'failed', failureClass: 'quota' }, others: [overlappingOther], follow: { signals: everything } }).ruleId, 'R5-1');
  // R2 beats R3..R7
  assert.equal(rule({ parent, others: [overlappingOther], follow: { signals: everything } }).ruleId, 'R5-2');
  // R3 beats R4..R7
  assert.equal(rule({ parent, follow: { signals: everything } }).ruleId, 'R5-3');
  // R4 beats R5..R7 (no defect wording)
  assert.equal(rule({ parent, follow: { signals: { change: true, planStage: true } } }).ruleId, 'R5-4');
  // R5 beats R6 and R7
  assert.equal(rule({ parent, follow: { signals: { defect: true, planStage: true }, namedReportKey: key('x.md') } }).ruleId, 'R5-5');
  // R6 beats R7
  assert.equal(rule({ parent: { context: { state: 'unknown' } }, follow: { signals: { defect: true }, namedReportKey: key('x.md') } }).ruleId, 'R5-6');
  // nothing → the safe default
  assert.deepEqual(rule({ follow: {} }), { cause: 'unattributed', confidence: 'low' });
});

// ── Linking ───────────────────────────────────────────────────────────────────────────────

const ledgerFor = (entries) => entries.map((entry) => ({ gameId: GAME, workState: 'idle', recentPlays: [], reports: [], updatedAt: 1, ...entry }));
const dispatchOf = (ref, evidence, at = T + H) => ({ clientRef: ref, gameId: GAME, at, playerInstanceId: 'codex-2', evidence });
const evidenceOf = (over = {}, followOver = {}) => ({
  profile: IMPL, touchKeys: (over.touches ?? []).map(key), followUp: followUp(followOver)
});

test('R5-9 linking reuses existing authorities: Scout continuation, report/latest-play owner, then 72 h touch overlap', () => {
  const plays = indexFilmPlays([
    ...play('FORM', { instance: 'scout-1' }),
    ...play('ARCH', { at: T - 2 * H, instance: 'claude-1' }),
    ...play('LATEST', { at: T - H, instance: 'claude-1', touches: ['src/late.ts'] }),
    ...play('EDIT', { at: T, touches: ['src/edit.ts'] })
  ]);
  const ledger = ledgerFor([{
    playerInstanceId: 'claude-1',
    recentPlays: [
      { clientRef: 'LATEST', outcome: 'completed', startedAt: T - H, finishedAt: T - H + 60_000 },
      { clientRef: 'ARCH', outcome: 'completed', startedAt: T - 2 * H, finishedAt: T - 2 * H + 60_000 }
    ],
    reports: [{ path: 'Reports/arch.md', mtime: 1, attribution: 'single-active-play', clientRef: 'ARCH' }]
  }]);
  const go = (dispatch) => linkFollowUp(dispatch, plays, ledger);
  assert.deepEqual(go(dispatchOf('F', evidenceOf({}, { scoutParentClientRef: 'FORM' }))), { parentClientRef: 'FORM', linkEvidence: 'scout-continuation' });
  assert.deepEqual(
    go(dispatchOf('F', evidenceOf({}, { owner: { instanceId: 'claude-1', evidence: 'named-report', reportPath: 'Reports/arch.md' } }))),
    { parentClientRef: 'ARCH', linkEvidence: 'named-report' }
  );
  assert.deepEqual(
    go(dispatchOf('F', evidenceOf({}, { owner: { instanceId: 'claude-1', evidence: 'incoming-report', reportPath: 'r.md', reportClientRef: 'ARCH' } }))),
    { parentClientRef: 'ARCH', linkEvidence: 'incoming-report' }
  );
  assert.deepEqual(
    go(dispatchOf('F', evidenceOf({}, { owner: { instanceId: 'claude-1', evidence: 'latest-play' } }))),
    { parentClientRef: 'LATEST', linkEvidence: 'latest-play' }
  );
  // wording-only report reference is not proof
  assert.equal(go(dispatchOf('F', evidenceOf({}, { owner: { instanceId: 'claude-1', evidence: 'latest-report', reportPath: 'Reports/arch.md' } }))), undefined);
  // touch overlap within 72 h; the most recent finished overlapping Play wins
  assert.deepEqual(go(dispatchOf('F', evidenceOf({ touches: ['src/edit.ts'] }))), { parentClientRef: 'EDIT', linkEvidence: 'touch-overlap' });
  assert.equal(go(dispatchOf('F', evidenceOf({ touches: ['src/edit.ts'] }), T + 72 * H + 11 * 60_000 + 1)), undefined, 'older than 72 h after completion');
  assert.deepEqual(
    go(dispatchOf('F', evidenceOf({ touches: ['src/edit.ts'] }), T + 72 * H + 10 * 60_000)),
    { parentClientRef: 'EDIT', linkEvidence: 'touch-overlap' }, 'exactly 72 h is inside'
  );
});

test('R5-10 no link means nothing to attribute: nothing is written', () => {
  const written = [];
  const recorder = new RoutingFilmRecorder({ read: () => ({ events: play('P', { touches: ['src/a.ts'] }), diagnostics: [] }), append: (e) => written.push(e) });
  const before = recorder.events().length;
  const dispatch = dispatchOf('F', evidenceOf({ touches: ['src/unrelated.ts'] }, { signals: { defect: true } }));
  assert.deepEqual(recordDispatchAttribution(recorder, dispatch, []), {});
  assert.equal(written.length, 0);
  assert.equal(recorder.events().length, before);
  // a parent Film never witnessed cannot be linked
  const orphan = dispatchOf('F2', evidenceOf({}, { scoutParentClientRef: 'NEVER-SEEN' }));
  assert.deepEqual(recordDispatchAttribution(recorder, orphan, []), {});
  assert.equal(written.length, 0);
  // and an attribution for an unlinked pair is void
  const events = [...play('P'), attribution('F', 'P', T + H, 'player-defect', 'coach', 'high')];
  assert.equal(effectiveAttributions(events).size, 0);
});

test('R5-11 dispatch records link + rule attribution once, envelope FIX CAUSE wins, and the default is unattributed', () => {
  const written = [];
  const recorder = new RoutingFilmRecorder({ read: () => ({ events: play('P', { touches: ['src/a.ts'] }), diagnostics: [] }), append: (e) => written.push(e) });
  const vague = dispatchOf('F1', evidenceOf({ touches: ['src/a.ts'] }, { signals: {} }), T + H);
  const first = recordDispatchAttribution(recorder, vague, []);
  assert.equal(first.link.linkEvidence, 'touch-overlap');
  assert.deepEqual([first.attribution.cause, first.attribution.source], ['unattributed', 'rule']);
  recordDispatchAttribution(recorder, vague, []);
  assert.deepEqual(written.map((e) => e.kind), ['link', 'attribution'], 'one link and one attribution per follow-up');

  const envelope = dispatchOf('F2', evidenceOf({ touches: ['src/a.ts'] }, { signals: { planStage: true }, fixCause: 'player-defect' }), T + 2 * H);
  const second = recordDispatchAttribution(recorder, envelope, []);
  assert.deepEqual([second.attribution.cause, second.attribution.source, second.attribution.confidence], ['player-defect', 'envelope', 'high']);
  const stored = written.filter((e) => e.kind === 'attribution' && e.clientRef === 'F2');
  assert.deepEqual(stored.map((e) => [e.source, e.cause, e.confidence]), [['envelope', 'player-defect', 'high']]);
  assert.doesNotMatch(JSON.stringify(written), /src\/a\.ts/, 'touches persist only as hashes');
});

// ── Coach / envelope authority ───────────────────────────────────────────────────────────────

test('R5-12 Coach and envelope attribution override rules; the last valid authoritative event wins', () => {
  const base = [...play('P'), ...play('F', { at: T + H, open: true }), link('F', 'P', T + H)];
  const ruleLow = attribution('F', 'P', T + H, 'player-defect', 'rule', 'low', 'R5-7');
  const cause = (events) => effectiveAttributions(events).get('F');

  assert.equal(cause([...base, ruleLow]).source, 'rule');
  // Coach overrides the rule
  const coached = cause([...base, ruleLow, coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'prompt-change', at: T + 2 * H })]);
  assert.deepEqual([coached.cause, coached.source, coached.confidence], ['prompt-change', 'coach', 'high']);
  // envelope overrides the rule, even when the rule event is later in the journal
  const enveloped = cause([...base, attribution('F', 'P', T + H, 'planned-continuation', 'envelope', 'high'),
    attribution('F', 'P', T + 3 * H, 'player-defect', 'rule', 'low', 'R5-7')]);
  assert.deepEqual([enveloped.cause, enveloped.source], ['planned-continuation', 'envelope']);
  // last valid authoritative event wins
  const latest = cause([...base, ruleLow,
    coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'prompt-change', at: T + 2 * H }),
    coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'player-defect', at: T + 4 * H })]);
  assert.deepEqual([latest.cause, latest.source], ['player-defect', 'coach']);
  // an invalid event never displaces a valid one; an event for a different parent is void
  const invalid = cause([...base, ruleLow,
    coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'prompt-change', at: T + 2 * H }),
    { ...coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'nonsense', at: T + 5 * H }) },
    coachAttributionEvent({ clientRef: 'F', parentClientRef: 'OTHER', gameId: GAME, cause: 'player-defect', at: T + 6 * H })]);
  assert.equal(invalid.cause, 'prompt-change');
});

// ── Resolution ────────────────────────────────────────────────────────────────────────────────

function resolveAt(events, now, ref = 'P') {
  const projection = projectFirstPassResolutions(events, now);
  return { resolution: projection.resolutions[ref], detail: projection.details.find((d) => d.clientRef === ref) };
}
const FINISH = T + 10 * 60_000;

test('R5-13 the 72-hour boundary: pending until it closes, clean at exactly 72 h', () => {
  const events = play('P', { touches: ['src/a.ts'] });
  assert.deepEqual(resolveAt(events, FINISH + 72 * H - 1).resolution, { state: 'pending' });
  const closed = resolveAt(events, FINISH + 72 * H);
  assert.deepEqual(closed.resolution, { state: 'clean' });
  assert.equal(closed.detail.closedBy, 'window-72h');
});

test('R5-14 the 3-later-touching-Plays boundary closes the window early; other files and Games do not count', () => {
  const later = (n, over = {}) => play(`L${n}`, { at: FINISH + n * H, touches: ['src/a.ts'], open: true, ...over });
  const events = [...play('P', { touches: ['src/a.ts'] }), ...later(1), ...later(2)];
  assert.equal(resolveAt(events, FINISH + 30 * H).resolution.state, 'pending', 'two later Plays are not enough');
  const three = [...events, ...later(3)];
  assert.equal(resolveAt(three, FINISH + 3 * H - 1).resolution.state, 'pending');
  const closed = resolveAt(three, FINISH + 3 * H);
  assert.equal(closed.resolution.state, 'clean');
  assert.equal(closed.detail.closedBy, 'three-later-plays');
  // other-file / other-Game Plays never close it
  const noise = [...events, ...later(3, { touches: ['src/b.ts'] }), ...later(4, { gameId: 'other-game' })];
  assert.equal(resolveAt(noise, FINISH + 30 * H).resolution.state, 'pending');
  // a Play with no touches can only close by time
  const untouched = [...play('P'), ...later(1), ...later(2), ...later(3)];
  assert.equal(resolveAt(untouched, FINISH + 30 * H).resolution.state, 'pending');
});

test('R5-15 completed alone is not clean; pending and unfinished Plays give R3 nothing', () => {
  const events = [...play('P', { touches: ['src/a.ts'] }), ...play('OPEN', { at: T, open: true })];
  const open = buildAttributedFilmIndex(events, shipped, FINISH + 71 * H);
  assert.equal(open.observations.find((o) => o.clientRef === 'P').firstPass, undefined, 'completed but window open → no first-pass evidence');
  assert.equal(open.observations.some((o) => o.clientRef === 'OPEN'), false);
  const closed = buildAttributedFilmIndex(events, shipped, FINISH + 72 * H);
  assert.deepEqual(closed.observations.find((o) => o.clientRef === 'P').firstPass, { y: 1, attribution: 1 });
  // an unfinished parent has no resolution at all
  assert.equal(projectFirstPassResolutions(events, FINISH + 100 * H).resolutions.OPEN, undefined);
});

test('R5-16 only proven Player defects become failure evidence; every other cause withholds credit without blame', () => {
  const NOW = FINISH + 100 * H;
  const withFollowUp = (cause, source = 'rule', confidence = 'low', parentOver = {}) => [
    ...play('P', parentOver), ...play('F', { at: T + H, open: true }),
    link('F', 'P', T + H), attribution('F', 'P', T + H, cause, source, confidence)
  ];
  const state = (events) => resolveAt(events, NOW).resolution;
  // player-defect: failure evidence at the source's confidence
  assert.deepEqual(state(withFollowUp('player-defect')), { state: 'player-defect', source: 'rule', confidence: 'low' });
  assert.deepEqual(state(withFollowUp('player-defect', 'coach', 'high')), { state: 'player-defect', source: 'coach', confidence: 'high' });
  // everything else is excluded: never a Player failure and never a clean pass
  for (const cause of ['prompt-change', 'planned-continuation', 'environment-drift', 'bad-scout-evidence', 'missing-context', 'upstream-change', 'unattributed']) {
    assert.deepEqual(state(withFollowUp(cause, 'rule', 'high')), { state: 'excluded' }, cause);
  }
  // a linked follow-up with no attribution event is unattributed, not defective
  const unrecorded = [...play('P'), ...play('F', { at: T + H, open: true }), link('F', 'P', T + H)];
  assert.deepEqual(state(unrecorded), { state: 'excluded' });
  // a follow-up dispatched after the window closed is not a repair of this Play
  const late = [...play('P'), ...play('F', { at: FINISH + 80 * H, open: true }), link('F', 'P', FINISH + 80 * H),
    attribution('F', 'P', FINISH + 80 * H, 'player-defect', 'coach', 'high')];
  assert.deepEqual(state(late), { state: 'clean' });
});

test('R5-17 provider/auth/quota/harness/interrupted/not-sent outcomes are never Player skill, even with a Coach defect', () => {
  const NOW = FINISH + 100 * H;
  const coachDefect = [...play('F', { at: T + H, open: true }), link('F', 'P', T + H),
    attribution('F', 'P', T + H, 'player-defect', 'coach', 'high')];
  for (const failureClass of ['provider', 'auth', 'quota', 'harness', 'interrupted']) {
    const events = [...play('P', { outcome: 'failed', failureClass }), ...coachDefect];
    assert.deepEqual(resolveAt(events, NOW).resolution, { state: 'excluded' }, failureClass);
  }
  for (const outcome of ['interrupted', 'not-sent', 'unknown']) {
    assert.deepEqual(resolveAt([...play('P', { outcome }), ...coachDefect], NOW).resolution, { state: 'excluded' }, outcome);
  }
  // failed/partial/blocked: failure evidence only when proven Player-caused
  for (const outcome of ['failed', 'partial', 'blocked']) {
    assert.deepEqual(resolveAt(play('P', { outcome }), NOW).resolution, { state: 'excluded' }, `${outcome} with no proven cause`);
    assert.deepEqual(resolveAt(play('P', { outcome, failureClass: 'player' }), NOW).resolution,
      { state: 'player-defect', source: 'outcome', confidence: 'high' }, `${outcome} proven player`);
    assert.equal(resolveAt([...play('P', { outcome }), ...coachDefect], NOW).resolution.state, 'player-defect', `${outcome} + Coach defect`);
  }
});

test('R5-18 confidence weights are the ratified R3 constants: 1.0 / rule-high 0.6 / rule-medium 0.3 / rule-low 0.3', () => {
  const w = (source, confidence) => attributionWeight({ state: 'player-defect', source, confidence });
  assert.equal(w('coach', 'high'), 1);
  assert.equal(w('envelope', 'high'), 1);
  assert.equal(w('outcome', 'high'), 1);
  assert.equal(w('rule', 'high'), 0.6);
  assert.equal(w('rule', 'medium'), 0.3);
  assert.equal(w('rule', 'low'), 0.3);
  // and they reach the R3 observation: a vague rule-7 defect is a 0.3 failure, a Coach-confirmed one a full failure
  const NOW = FINISH + 100 * H;
  const build = (source, confidence) => buildAttributedFilmIndex([
    ...play('P'), ...play('F', { at: T + H, open: true }), link('F', 'P', T + H),
    attribution('F', 'P', T + H, 'player-defect', source, confidence)
  ], shipped, NOW).observations.find((o) => o.clientRef === 'P').firstPass;
  assert.deepEqual(build('rule', 'low'), { y: 0, attribution: 0.3 });
  assert.deepEqual(build('rule', 'medium'), { y: 0, attribution: 0.3 });
  assert.deepEqual(build('rule', 'high'), { y: 0, attribution: 0.6 });
  assert.deepEqual(build('coach', 'high'), { y: 0, attribution: 1 });
});

test('R5-19 inconsistent FirstPassResolution is refused with a diagnostic and R5 never produces one', () => {
  const events = play('P', { outcome: 'failed' });
  const refused = buildFilmIndex(events, shipped, { profiles: joinFilmProfiles(events), resolutions: { P: { state: 'clean' } } });
  assert.deepEqual(refused.diagnostics.map((d) => d.reason), ['resolution-inconsistent']);
  assert.equal(refused.observations[0].firstPass, undefined);
  const never = buildFilmIndex(play('P', { outcome: 'interrupted' }), shipped, { resolutions: { P: { state: 'player-defect', source: 'coach', confidence: 'high' } } });
  assert.equal(never.observations[0].firstPass, undefined, 'interrupted is never skill evidence');

  const corpus = [
    ...play('A'), ...play('B', { outcome: 'failed', failureClass: 'player' }), ...play('C', { outcome: 'interrupted' }),
    ...play('D', { outcome: 'partial' }), ...play('E', { outcome: 'not-sent' }),
    ...play('F', { at: T + H, open: true }), link('F', 'A', T + H), attribution('F', 'A', T + H, 'player-defect', 'rule', 'low', 'R5-7')
  ];
  const index = buildAttributedFilmIndex(corpus, shipped, FINISH + 200 * H);
  assert.equal(index.diagnostics.filter((d) => d.reason === 'resolution-inconsistent').length, 0);
});

// ── Profile join, compatibility, replay ────────────────────────────────────────────────────────

test('R5-20 the profile join supplies taskClass/difficulty/role/Game to R3, and profiled Film outweighs unprofiled', () => {
  const events = [
    ...play('A', { profile: { taskClass: 'architecture', difficulty: 'hard', role: 'player' } }),
    ...play('S', { profile: { taskClass: 'quick', difficulty: 'easy', role: 'scout' } })
  ];
  assert.deepEqual(joinFilmProfiles(events), {
    A: { taskClass: 'architecture', difficulty: 'hard', role: 'player' },
    S: { taskClass: 'quick', difficulty: 'easy', role: 'scout' }
  });
  const index = buildAttributedFilmIndex(events, shipped, FINISH + 100 * H);
  const a = index.observations.find((o) => o.clientRef === 'A');
  assert.deepEqual([a.profile.taskClass, a.profile.difficulty, a.gameId], ['architecture', 'hard', GAME]);
  assert.equal(index.observations.find((o) => o.clientRef === 'S').role, 'scout');

  // through R3: same Film, with and without the join, differs in local evidence
  const NOW = FINISH + 100 * H;
  const target = { playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'high' };
  const profile = { taskClass: 'implementation', difficulty: 'medium' };
  const many = Array.from({ length: 8 }, (_, i) => play(`M${i}`, { at: T + i * H })).flat();
  const joined = computeBelief(target, profile, shipped, buildAttributedFilmIndex(many, shipped, NOW), NOW, { baselinePreference: PROVIDER_PREFERENCE });
  const legacy = many.map((event) => { const { profile: _drop, ...rest } = event; return rest; });
  const unjoined = computeBelief(target, profile, shipped, buildAttributedFilmIndex(legacy, shipped, NOW), NOW, { baselinePreference: PROVIDER_PREFERENCE });
  assert.ok(joined.nLocalEff > unjoined.nLocalEff * 3, `join lifts local weight (${joined.nLocalEff} vs ${unjoined.nLocalEff})`);
});

test('R5-21 historical R2 Film without profile or R5 events stays readable, and R5 events round-trip the journal', () => {
  const dir = path.join(scratch, 'legacy');
  const store = new RoutingFilmStore({ dir });
  const legacy = play('OLD', { profile: null });
  for (const event of legacy) store.append(event);
  const recorder = new RoutingFilmRecorder(store);
  recorder.recordDecision(play('NEW', { at: T + H, touches: ['src/a.ts'] })[0]);
  recorder.recordLink(link('NEW', 'OLD', T + H, 'touch-overlap'));
  recorder.recordAttribution(attribution('NEW', 'OLD', T + H, 'unattributed'));
  recorder.recordResolution({ schemaVersion: 1, kind: 'resolution', at: T + 100 * H, clientRef: 'OLD', gameId: GAME, state: 'excluded', closedBy: 'window-72h' });
  const reread = store.read();
  assert.equal(reread.diagnostics.length, 0);
  assert.deepEqual(reread.events.map((e) => e.kind), ['decision', 'outcome', 'decision', 'link', 'attribution', 'resolution']);
  const index = buildAttributedFilmIndex(reread.events, shipped, T + 200 * H);
  const old = index.observations.find((o) => o.clientRef === 'OLD');
  assert.equal(old.profile, undefined, 'no profile invented for old Film');
  // an invalid R5 line is skipped, never fatal
  fs.appendFileSync(path.join(dir, 'routing-film.jsonl'), `${JSON.stringify({ ...link('X', 'X', T), parentClientRef: 'X' })}\n`);
  const tolerant = store.read();
  assert.deepEqual(tolerant.diagnostics.map((d) => d.reason), ['invalid-event']);
  assert.equal(tolerant.events.length, 6);
});

test('R5-22 replay is deterministic: order-independent decisions/outcomes, byte-identical projections', () => {
  const corpus = [
    ...play('P1', { touches: ['src/a.ts'] }), ...play('P2', { at: T + 2 * H, touches: ['src/b.ts'], outcome: 'partial' }),
    ...play('F1', { at: T + H, open: true, touches: ['src/a.ts'] }),
    link('F1', 'P1', T + H, 'touch-overlap'), attribution('F1', 'P1', T + H, 'player-defect', 'rule', 'low', 'R5-7'),
    coachAttributionEvent({ clientRef: 'F1', parentClientRef: 'P1', gameId: GAME, cause: 'prompt-change', at: T + 5 * H })
  ];
  const NOW = T + 200 * H;
  const render = (events) => JSON.stringify({
    resolutions: projectFirstPassResolutions(events, NOW),
    index: buildAttributedFilmIndex(events, shipped, NOW),
    attributions: [...effectiveAttributions(events)]
  });
  const first = render(corpus);
  assert.equal(render(corpus), first);
  assert.equal(render([...corpus].reverse()), first, 'journal order does not change the projection');
  assert.equal(render(JSON.parse(JSON.stringify(corpus))), first);
});

// ── Envelope field ────────────────────────────────────────────────────────────────────────────────

test('R5-23 FIX CAUSE envelope field: recognized with the existing envelope rules, never touches routing', () => {
  assert.equal(normalizeFixCause('Player defect'), 'player-defect');
  assert.equal(normalizeFixCause('planned_continuation'), 'planned-continuation');
  assert.equal(normalizeFixCause('banana'), undefined);
  assert.deepEqual(recognizeFixCause('FIX CAUSE: player-defect\nDo the work.'), { cause: 'player-defect' });
  assert.deepEqual(recognizeFixCause('# Play\n**FIX CAUSE:** Prompt change\nDo the work.'), { cause: 'prompt-change' });
  assert.deepEqual(recognizeFixCause('- Fix-Cause: PLANNED CONTINUATION'), { cause: 'planned-continuation' });
  assert.deepEqual(recognizeFixCause('FIX CAUSE: banana'), { unresolvedText: 'banana' });
  assert.equal(recognizeFixCause('Do the work.\nWe should fix cause later.'), undefined);
  assert.equal(recognizeFixCause('```\nFIX CAUSE: player-defect\n```\nDo it.'), undefined, 'fenced examples are not instructions');
  assert.equal(recognizeFixCause(`${'filler line\n'.repeat(20)}FIX CAUSE: player-defect`), undefined, 'only the opening block');

  const capability = (instanceId, playerType, provider) => ({
    instanceId, playerType, transport: 'controlled', fieldLabel: provider, state: 'ready',
    capability: { provider, authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'm', models: [{ id: 'm', displayName: 'M', isDefault: true, supportedEfforts: ['high'], defaultEffort: 'high' }] }
  });
  const candidates = [capability('codex-1', 'codex', 'codex'), capability('claude-1', 'claude', 'claude')];
  const plain = recognizeRouteConstraints({ prompt: 'Use Codex.\nImplement the thing.', candidates });
  const withCause = recognizeRouteConstraints({ prompt: 'Use Codex.\nFIX CAUSE: player-defect\nImplement the thing.', candidates });
  assert.deepEqual(withCause, plain, 'the FIX CAUSE line does not alter route constraints');
  assert.equal(recognizeRouteConstraints({ prompt: 'FIX CAUSE: player-defect\nImplement the thing.', candidates }), undefined,
    'and is not itself a routing field');
});

test('R5-24 dispatch evidence carries derived facts only: signals, hashed touches, the canonical profile, no text', () => {
  const prompt = 'Fix the bug in src/secret-module.ts — tests fail after Stage 2.\nFIX CAUSE: prompt-change';
  const evidence = buildDispatchEvidence({ prompt, gameId: GAME, role: 'player', ledger: [], reports: [], fixCause: 'prompt-change' });
  assert.equal(evidence.followUp.signals.defect, true);
  assert.equal(evidence.followUp.signals.planStage, true);
  assert.equal(evidence.followUp.signals.change, false, 'the FIX CAUSE header itself is not wording');
  assert.deepEqual(evidence.touchKeys, [key('src/secret-module.ts'), key('secret-module.ts')].sort());
  assert.deepEqual(evidence.profile, { taskClass: 'implementation', difficulty: 'medium', role: 'player' });
  assert.doesNotMatch(JSON.stringify(evidence), /secret-module|Stage 2|bug|tests fail/i);

  assert.deepEqual(extractFollowUpSignals('FIX CAUSE: player-defect\nBuild it.'), NO_FOLLOW_UP_SIGNALS, 'header only → no wording signals');
  assert.equal(extractFollowUpSignals('> the old report said it was wrong\nBuild it.').correction, false, 'quoted material is not the human\'s wording');
  assert.equal(extractFollowUpSignals('```\nfix this bug\n```\nBuild it.').defect, false);
  assert.equal(extractFollowUpSignals('Actually, add a filter instead.').change, true);
  assert.equal(extractFollowUpSignals('The Scout report is wrong and stale.').scoutEvidence, true);
  assert.equal(extractFollowUpSignals('Prefix the label and suffix the name.').defect, false);
});

// ── Seams: router, daemon, preview ──────────────────────────────────────────────────────────────────

const codexSnapshot = {
  provider: 'codex', authenticated: true, observedAt: 1, freshness: 'live', defaultModelId: 'gpt-5.6-sol',
  models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
};
const codexSeat = () => ({
  instanceId: 'codex-11111111', playerType: 'codex', transport: 'controlled', transportLabel: 'Controlled',
  fieldLabel: 'Codex', state: 'ready', capability: codexSnapshot
});

test('R5-25 router: the real dispatch emits prompt-free evidence; preview emits and writes nothing', async () => {
  const seat = codexSeat();
  const frames = [];
  const registry = new StadiumRegistry();
  registry.registerSession({
    instanceId: 'stadium-1', stadiumId: 'stadium-r5', name: 'R5', platform: 'win32', socket: { readyState: 1, send: (raw) => frames.push(JSON.parse(raw)) },
    lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R5', fingerprintSource: 'git' },
    roster: [], capabilities: [seat], reports: [], rosterSynchronized: true, rosterSyncedAt: 1
  });
  const router = new ControlPlaneRouter(registry);
  router.setRouteContextProvider(() => ({ ledger: [], reports: [], names: new Map(), rosterInstanceIds: new Set([seat.instanceId]), queuedCounts: new Map() }));
  const emitted = [];
  router.on('play-dispatched', (record) => emitted.push(record));

  const prompt = 'Fix the regression in src/private-file.ts that you missed.\nFIX CAUSE: player-defect';
  router.computeRoute(GAME, prompt, [seat]);
  assert.equal(emitted.length, 0, 'preview never reaches the dispatch seam');

  const pending = router.dispatch({ gameId: GAME, routingMode: 'auto', prompt });
  const frame = frames.find((item) => item.method === 'dispatch.request');
  router.handleDispatchAccepted({ clientRef: frame.params.clientRef, stadiumId: 'stadium-r5', gameId: GAME, playerInstanceId: seat.instanceId, acceptedAt: Date.now() });
  assert.equal((await pending).success, true);
  assert.equal(emitted.length, 1);
  const { evidence } = emitted[0];
  assert.deepEqual(evidence.profile, { taskClass: 'implementation', difficulty: 'medium', role: 'player' });
  assert.equal(evidence.followUp.signals.defect, true);
  assert.equal(evidence.followUp.fixCause, 'player-defect');
  assert.deepEqual(evidence.touchKeys, [key('src/private-file.ts'), key('private-file.ts')].sort());
  assert.doesNotMatch(JSON.stringify(evidence), /private-file|regression|you missed/);
});

test('R5-26 daemon: a follow-up dispatch links + attributes through the existing Film; old parents settle; preview writes zero', () => {
  const parent = play('P', { at: T - 200 * H, touches: ['src/a.ts'] });
  const oldParent = play('OLD', { at: T - 300 * H, touches: ['src/z.ts'] });
  const events = [...oldParent, ...parent];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => events.push(event) };
  const daemon = new ControlPlaneDaemon({ dir: path.join(scratch, 'daemon'), port: 0, idleTimeoutMs: 60_000, routingFilm: { journal } });
  const capability = {
    instanceId: 'codex-seat-1', playerType: 'codex', transport: 'controlled', fieldLabel: 'Codex', state: 'ready',
    capability: { provider: 'codex', authenticated: true, models: [], observedAt: T, freshness: 'live' }
  };
  daemon.registry.getCapabilitiesForGame = () => [capability];
  daemon.registry.getGames = () => [{ gameId: GAME }];
  daemon.registry.getSession = () => ({ game: { gameId: GAME } });

  const before = events.length;
  daemon.routerInstance.computeRoute(GAME, 'Fix the bug in src/a.ts', [capability]);
  assert.equal(events.length, before, 'preview writes zero');

  const evidence = buildDispatchEvidence({ prompt: 'Fix the bug in src/a.ts you missed', gameId: GAME, role: 'player', ledger: [], reports: [] });
  // the parent finished 200 h earlier, so touch-overlap (72 h) cannot link it: nothing to attribute
  const record = {
    gameId: GAME, playerInstanceId: 'codex-seat-1', playerType: 'codex', clientRef: 'F-late', model: 'gpt-5.6-sol', effort: 'high',
    transport: 'controlled', at: T, routingMode: 'auto', routeAction: 'dispatch', evidence
  };
  daemon.routerInstance.emit('play-dispatched', record);
  const decision = events.find((e) => e.kind === 'decision' && e.clientRef === 'F-late');
  assert.deepEqual(decision.profile, { taskClass: 'implementation', difficulty: 'medium', role: 'player' });
  assert.deepEqual(decision.touchKeys, evidence.touchKeys);
  assert.equal(events.some((e) => e.kind === 'link'), false);
  const resolutions = events.filter((e) => e.kind === 'resolution');
  assert.deepEqual(resolutions.map((e) => [e.clientRef, e.state, e.closedBy]).sort(), [['OLD', 'clean', 'window-72h'], ['P', 'clean', 'window-72h']]);

  // a follow-up inside the window links, attributes once, and duplicates write nothing more
  const [p2Decision, p2Outcome] = play('P2', { at: T - H, touches: ['src/fresh.ts'] });
  daemon.routingFilm.recordDecision(p2Decision);
  daemon.routingFilm.recordOutcome(p2Outcome);
  const fresh = buildDispatchEvidence({ prompt: 'Fix the regression in src/fresh.ts', gameId: GAME, role: 'player', ledger: [], reports: [] });
  const followRecord = { ...record, clientRef: 'F-fresh', evidence: fresh };
  daemon.routerInstance.emit('play-dispatched', followRecord);
  daemon.routerInstance.emit('play-dispatched', followRecord);
  const linked = events.filter((e) => e.kind === 'link');
  assert.deepEqual(linked.map((e) => [e.clientRef, e.parentClientRef, e.linkEvidence]), [['F-fresh', 'P2', 'touch-overlap']]);
  const attributed = events.filter((e) => e.kind === 'attribution');
  assert.deepEqual(attributed.map((e) => [e.cause, e.source, e.confidence, e.ruleId]), [['player-defect', 'rule', 'low', 'R5-7']]);
  assert.doesNotMatch(JSON.stringify(events), /regression|you missed|fresh\.ts/, 'no prompt text or path reaches Film');
});

test('R5-27 settleResolutions is idempotent, uses only the injected clock, and never touches pending Plays', () => {
  const written = [];
  const recorder = new RoutingFilmRecorder({ read: () => ({ events: play('P'), diagnostics: [] }), append: (e) => written.push(e) });
  assert.equal(settleResolutions(recorder, FINISH + 71 * H), 0);
  assert.equal(settleResolutions(recorder, FINISH + 72 * H), 1);
  assert.equal(settleResolutions(recorder, FINISH + 90 * H), 0, 'same settled state is not rewritten');
  assert.deepEqual(written.map((e) => [e.kind, e.state]), [['resolution', 'clean']]);
  // a later Coach correction changes the settled state, and the new state is recorded
  recorder.recordLink(link('F', 'P', T + H));
  recorder.recordAttribution(coachAttributionEvent({ clientRef: 'F', parentClientRef: 'P', gameId: GAME, cause: 'player-defect', at: T + 200 * H }));
  assert.equal(settleResolutions(recorder, T + 300 * H), 1);
  assert.equal(written.at(-1).state, 'repaired');
});
