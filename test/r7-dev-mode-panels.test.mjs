// R7 — Dev Mode routing intelligence panels. S57.1 §8.4, §8.5, §17, §18, §19.
//
// Read-only observability over R3/R5/R6 plus one explicit write: a Coach attribution correction.
// Proofs: Dev gating (server and browser), rationale reads R6's object, scorecards read canonical
// belief/Film, the shadow report is counterfactually honest, UNKNOWN stays UNKNOWN, corrections append
// (never mutate) a Coach/high event, and nothing in routing depends on any of it.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REASON_NARRATIVE,
  SHADOW_MIN_N,
  attributionLabel,
  buildRoutingIntelligenceView,
  buildScorecards,
  buildShadowReport,
  listFollowUpAttributions,
  reasonNarrative,
  recommendationNarrative,
  unknownNarrative
} from '../out/routing-intel/dev-views.js';
import { REASON_CODES } from '../out/routing-intel/reasons.js';
import { ROUTING_WEIGHTS } from '../out/routing-intel/recommend.js';
import { coachAttributionEvent, buildAttributedFilmIndex, effectiveAttributions } from '../out/routing-intel/attribution.js';
import { computeBelief } from '../out/routing-intel/belief.js';
import { loadShippedPriorPack } from '../out/routing-intel/prior-pack.js';
import { evidenceKey } from '../out/control-plane/follow-up-evidence.js';
import { PROVIDER_PREFERENCE } from '../out/routing-policy.js';
import { DEFAULT_PREFERENCES, savePreferences } from '../out/running-players.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-r7-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const H = 3_600_000;
const T = Date.parse('2026-09-01T12:00:00.000Z');
const NOW = T + 800 * H; // every window closed
const AT = (n) => T + n * H;
const GAME = 'game-r7';
const pack = loadShippedPriorPack([path.join(root, 'src', 'routing-intel', 'priors.json')]);
const IMPL = { taskClass: 'implementation', difficulty: 'medium', role: 'player' };
const html = fs.readFileSync(path.join(root, 'src', 'public', 'index.html'), 'utf8');

// ── Film fixtures (real event shapes) ─────────────────────────────────────────────────────────────
const receipt = (at) => ({ pool: 'codex', evidence: 'unknown', capturedAt: new Date(at).toISOString(), windows: [] });
let seq = 0;
function play(ref, {
  at = T + (++seq) * H, instance = 'codex-1', playerType = 'codex', model = 'gpt-5.6-sol', effort = 'high', profile = IMPL,
  outcome = 'completed', burn = [], recommendation, scoutReportKey, touches = []
} = {}) {
  const chosen = { playerInstanceId: instance, playerType, transport: 'controlled', model, effort, resourcePool: 'codex' };
  const end = at + 10 * 60_000;
  return [
    {
      schemaVersion: 1, kind: 'decision', at, clientRef: ref, gameId: GAME, baseline: chosen, chosen, decidedBy: 'auto-baseline',
      routeAction: 'dispatch', receiptBefore: receipt(at),
      ...(profile ? { profile } : {}), ...(recommendation ? { recommendation } : {}),
      ...(scoutReportKey ? { scoutReportKey } : {}), ...(touches.length ? { touchKeys: touches.map(evidenceKey) } : {})
    },
    {
      schemaVersion: 1, kind: 'outcome', at: end, clientRef: ref, gameId: GAME, ledgerOutcome: outcome, startedAt: at, finishedAt: end,
      durationMs: 10 * 60_000, reportProduced: false, retries: 0, receiptAfter: receipt(end),
      concurrency: { samePool: [], otherPool: [], unknownPool: [] }, isolation: 'none', isolationReason: 'fixture', burn
    }
  ];
}
const linkEv = (ref, parent, at) => ({ schemaVersion: 1, kind: 'link', at, clientRef: ref, gameId: GAME, parentClientRef: parent, linkEvidence: 'latest-play' });
const attrEv = (ref, parent, at, cause, source = 'rule', confidence = 'low', ruleId) => ({
  schemaVersion: 1, kind: 'attribution', at, clientRef: ref, gameId: GAME, parentClientRef: parent, cause, source, confidence, ...(ruleId ? { ruleId } : {})
});
const option = (over = {}) => ({
  kind: 'send', playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'high', playerInstanceId: 'codex-1', resourcePool: 'codex',
  utility: 0.7, firstPass: 0.7, cost: 0.1, reasons: ['BEST_FIT'], ...over
});
const digest = (primary, extra = {}) => ({
  v: 1, id: 'rec_x', engineVersion: 'e', weightsVersion: 'w', priorPackVersion: 'p', computedAt: T, posture: 'balanced',
  authority: { mode: 'auto', advisoryOnly: false, lockedBy: [] }, capabilities: {}, primary,
  strength: { recommendation: 'lean', evidence: 'thin' }, baselineAgreement: 'agree', scoutVerdict: 'no-scout', unknowns: [], ...extra
});

// ── 1. Rationale narrative: stable reason codes, R6's own object ──────────────────────────────────────

test('R7-1 narrative derives only from stable reason codes; weights and versions are R6 verbatim', () => {
  for (const code of REASON_CODES) assert.ok(REASON_NARRATIVE[code], `${code} has fixed text`);
  assert.deepEqual(reasonNarrative(['BEST_FIT', 'RESOURCE_UNKNOWN']).map((l) => l.code), ['BEST_FIT', 'RESOURCE_UNKNOWN']);
  assert.match(reasonNarrative(['MADE_UP'])[0].text, /Reason code MADE_UP/, 'unknown codes are never invented into prose');
  assert.match(unknownNarrative({ kind: 'burn', subject: 'codex' }), /UNKNOWN/);

  const rec = {
    posture: { value: 'balanced' },
    baseline: { reasons: ['TOSS_UP_KEPT_BASELINE'] }, primary: { reasons: ['BEST_FIT'] },
    candidates: [{ reasons: ['BEST_FIT'] }, { reasons: ['RESOURCE_UNKNOWN', 'PRIOR_ONLY'] }],
    unknowns: [{ kind: 'session-continuity', subject: 'codex-1' }]
  };
  const narrative = recommendationNarrative(rec);
  assert.deepEqual(narrative.weights, ROUTING_WEIGHTS.postures.balanced);
  assert.equal(narrative.candidates.length, 2);
  assert.equal(narrative.candidates[1][1].code, 'PRIOR_ONLY');
  assert.match(narrative.unknowns[0], /session continuity is UNKNOWN/i);
  assert.deepEqual(narrative.scoutOption, []);
});

// ── 2. Scorecards ──────────────────────────────────────────────────────────────────────────────────────

function scorecardFilm() {
  return [
    ...play('A1', { at: AT(1) }), ...play('A2', { at: AT(2) }), ...play('A3', { at: AT(3) }),
    ...play('B1', { at: AT(4), playerType: 'claude', instance: 'claude-1', model: 'opus', effort: 'high', profile: { taskClass: 'architecture', difficulty: 'hard', role: 'player' } }),
    ...play('OLD', { at: AT(5), profile: null }),
    // A2 needed a fix: a rule-attributed defect (low). A3 was continued vaguely (unattributed).
    ...play('F1', { at: AT(6) }).slice(0, 1), linkEv('F1', 'A2', AT(6)), attrEv('F1', 'A2', AT(6), 'player-defect', 'rule', 'low', 'R5-7'),
    ...play('F2', { at: AT(7) }).slice(0, 1), linkEv('F2', 'A3', AT(7)), attrEv('F2', 'A3', AT(7), 'unattributed', 'rule', 'low')
  ];
}

test('R7-2 scorecards read canonical R3/R5 truth per node × task class, with cause counts and unattributedRate', () => {
  const events = scorecardFilm();
  const view = buildScorecards(events, pack, NOW, PROVIDER_PREFERENCE);
  const codex = view.rows.find((row) => row.key.startsWith('codex/') && row.taskClass === 'implementation');
  assert.equal(codex.n, 3);
  assert.deepEqual(codex.outcomes, { completed: 3 });
  assert.deepEqual(codex.resolutions, { clean: 1, repaired: 1, excluded: 1 }, 'A1 clean, A2 repaired, A3 withheld (unattributed)');
  assert.equal(codex.resolved, 2, 'only clean + player-defect become first-pass evidence; unattributed does not');
  assert.deepEqual(codex.causes, { 'player-defect': 1, unattributed: 1 });
  assert.equal(codex.unattributedRate, 0.5);

  // belief is exactly R3's, over the exact R5 index — nothing recomputed
  const index = buildAttributedFilmIndex(events, pack, NOW);
  const belief = computeBelief(
    { playerType: 'codex', modelId: codex.modelId, effort: codex.effort },
    { taskClass: 'implementation', difficulty: 'medium', role: 'player' }, pack, index, NOW,
    { baselinePreference: PROVIDER_PREFERENCE, resourcePool: 'codex' }
  );
  assert.deepEqual([codex.belief.mean, codex.belief.lo, codex.belief.hi, codex.belief.nLocalEff], [belief.firstPass.mean, belief.firstPass.lo, belief.firstPass.hi, belief.nLocalEff]);

  assert.ok(view.rows.some((row) => row.playerType === 'claude' && row.taskClass === 'architecture' && row.unattributedRate === null), 'no follow-ups → null, not 0');
  const unknown = view.rows.find((row) => row.taskClass === 'unknown');
  assert.ok(unknown, 'Film without the R5 profile join is shown as an UNKNOWN class, not guessed');
  assert.match(view.note, /not a Player penalty/);
});

test('R7-3 a high unattributedRate is diagnostic only: it never becomes Player failure evidence', () => {
  const events = [...play('P', { at: AT(1) })];
  for (let i = 0; i < 6; i += 1) events.push(...play(`F${i}`, { at: AT(2 + i) }).slice(0, 1), linkEv(`F${i}`, 'P', AT(2 + i)), attrEv(`F${i}`, 'P', AT(2 + i), 'unattributed'));
  const row = buildScorecards(events, pack, NOW, PROVIDER_PREFERENCE).rows.find((r) => r.taskClass === 'implementation');
  assert.equal(row.unattributedRate, 1);
  assert.equal(row.resolved, 0, 'no first-pass evidence, so no failure');
  const index = buildAttributedFilmIndex(events, pack, NOW);
  assert.equal(index.observations.find((o) => o.clientRef === 'P').firstPass, undefined);
});

// ── 3. Follow-up attribution rows ─────────────────────────────────────────────────────────────────────

test('R7-4 follow-up rows show the effective cause compactly; Coach outranks the rule; default is labelled', () => {
  assert.equal(attributionLabel('player-defect', 'rule', 'low', 'R5-7'), 'Cause: player-defect · rule 7 · low');
  assert.equal(attributionLabel('prompt-change', 'coach', 'high'), 'Cause: prompt-change · coach · high');
  const events = [
    ...play('P', { at: AT(1) }), ...play('F1', { at: AT(50) }).slice(0, 1), ...play('F2', { at: AT(51) }).slice(0, 1),
    linkEv('F1', 'P', T + 50 * H), attrEv('F1', 'P', T + 50 * H, 'player-defect', 'rule', 'low', 'R5-7'),
    coachAttributionEvent({ clientRef: 'F1', parentClientRef: 'P', gameId: GAME, cause: 'prompt-change', at: T + 60 * H }),
    linkEv('F2', 'P', T + 51 * H)
  ];
  const rows = listFollowUpAttributions(events);
  const f1 = rows.find((row) => row.clientRef === 'F1');
  assert.deepEqual([f1.cause, f1.source, f1.confidence, f1.label, f1.implicit], ['prompt-change', 'coach', 'high', 'Cause: prompt-change · coach · high', false]);
  const f2 = rows.find((row) => row.clientRef === 'F2');
  assert.deepEqual([f2.cause, f2.implicit], ['unattributed', true], 'a linked follow-up with no event is the implicit unattributed default');
});

// ── 4. Shadow report: honest metrics ───────────────────────────────────────────────────────────────────

function shadowFilm() {
  const events = [];
  const agreeRec = digest(option({ firstPass: 0.7 }));
  const disagreeRec = digest(option({ playerType: 'claude', modelId: 'opus', playerInstanceId: 'claude-1', firstPass: 0.9 }), { baseline: option({ firstPass: 0.5 }) });
  // 8 agreed Plays: 6 clean, 2 repaired (Coach-confirmed defect)
  for (let i = 0; i < 8; i += 1) {
    const ref = `AG${i}`;
    events.push(...play(ref, { at: AT(1 + i), recommendation: agreeRec }));
    if (i < 2) events.push(...play(`AF${i}`, { at: AT(1 + i) + 30 * 60_000 }).slice(0, 1), linkEv(`AF${i}`, ref, AT(1 + i) + 30 * 60_000),
      coachAttributionEvent({ clientRef: `AF${i}`, parentClientRef: ref, gameId: GAME, cause: 'player-defect', at: AT(410 + i) }));
  }
  // 4 disagreed Plays (chosen codex, recommended claude): 2 clean, 2 repaired
  for (let i = 0; i < 4; i += 1) {
    const ref = `DG${i}`;
    events.push(...play(ref, { at: AT(20 + i), recommendation: disagreeRec }));
    if (i < 2) events.push(...play(`DF${i}`, { at: AT(20 + i) + 30 * 60_000 }).slice(0, 1), linkEv(`DF${i}`, ref, AT(20 + i) + 30 * 60_000),
      coachAttributionEvent({ clientRef: `DF${i}`, parentClientRef: ref, gameId: GAME, cause: 'player-defect', at: AT(430 + i) }));
  }
  // a MANUAL choice outside every recorded option: resolved, but no prediction was recorded for it
  events.push(...play('MAN', { at: AT(30), model: 'gpt-6-astra', recommendation: agreeRec }));
  return events;
}

test('R7-5 shadow report: agreement, disagreement outcome with n, and chosen-only calibration', () => {
  const report = buildShadowReport(shadowFilm(), pack, NOW);
  assert.equal(report.recommendedPlays, 13);
  assert.deepEqual([report.agreement.n, report.agreement.successes, report.agreement.disagreements, report.agreement.rate, report.agreement.sufficient], [13, 8, 5, 0.615385, true]);
  assert.deepEqual(report.disagreementOutcome.whenAgreed, { n: 8, successes: 6, rate: 0.75, sufficient: true });
  assert.deepEqual(report.disagreementOutcome.whenDisagreed, { n: 5, successes: 3, rate: 0.6, sufficient: true });
  assert.match(report.disagreementOutcome.caveat, /Selection-biased/);

  // calibration is over chosen routes only: 8 agreed at predicted 0.7, 4 disagreed at the chosen baseline's 0.5, MAN has none
  assert.equal(report.calibration.n, 12);
  assert.equal(report.calibration.withoutPrediction, 1);
  assert.equal(report.calibration.n + report.calibration.withoutPrediction, report.disagreementOutcome.whenAgreed.n + report.disagreementOutcome.whenDisagreed.n);
  const bins = report.calibration.bins;
  assert.deepEqual([bins[3].n, bins[3].meanPredicted, bins[3].observedRate, bins[3].sufficient], [8, 0.7, 0.75, true]);
  assert.deepEqual([bins[2].n, bins[2].meanPredicted, bins[2].observedRate, bins[2].sufficient], [4, 0.5, 0.5, false]);
});

test('R7-6 counterfactual honesty: unchosen options never get outcomes, and no claim about them is made', () => {
  const report = buildShadowReport(shadowFilm(), pack, NOW);
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /would have|would succeed|would've/i);
  assert.match(report.counterfactual, /Unchosen options have no outcome/);
  // outcomes are counted per Play (its chosen route) — never once per recommended alternative
  const resolved = report.disagreementOutcome.whenAgreed.n + report.disagreementOutcome.whenDisagreed.n;
  assert.equal(resolved, 13);
  // the recommended-but-unchosen Claude option produced no evidence of its own
  const claudeRows = buildScorecards(shadowFilm(), pack, NOW, PROVIDER_PREFERENCE).rows.filter((row) => row.playerType === 'claude');
  assert.deepEqual(claudeRows, [], 'no Claude row exists: it was never chosen');
});

test('R7-7 insufficient evidence is stated; burn is not-evaluable, never invented; graduation never granted', () => {
  const empty = buildShadowReport([], pack, NOW);
  assert.equal(empty.recommendedPlays, 0);
  assert.deepEqual([empty.agreement.n, empty.agreement.rate, empty.agreement.sufficient], [0, null, false]);
  assert.equal(empty.disagreementOutcome.whenAgreed.rate, null);
  assert.ok(empty.calibration.bins.every((bin) => bin.n === 0 && bin.observedRate === null));
  assert.equal(empty.burnPrediction.status, 'not-evaluable');
  assert.match(empty.burnPrediction.reason, /frozen burn prediction/);

  const few = buildShadowReport(shadowFilm().slice(0, 12), pack, NOW);
  assert.equal(few.agreement.sufficient, few.agreement.n >= SHADOW_MIN_N.agreement);

  // 60 recommended Plays meets only the volume criterion; the report still grants nothing
  const many = [];
  for (let i = 0; i < 60; i += 1) many.push(...play(`M${i}`, { recommendation: digest(option()) }));
  const graduation = buildShadowReport(many, pack, NOW).graduation;
  assert.deepEqual(
    [graduation.status, graduation.playsCriterionMet, graduation.burnErrorCriterion, graduation.invariantTests, graduation.calibratedPercent],
    ['shadow', true, 'not-evaluable', 'not-evaluated-here', 'not-granted']
  );
});

test('R7-8 Scout ROI check is labelled observational/confounded and needs n on both sides', () => {
  const burn = (delta) => [{ pool: 'claude', window: 'five_hour', windowLengthMin: 300, isolation: 'high', reason: 'fixture', remainingPercentDelta: delta }];
  const events = [];
  for (let i = 0; i < 5; i += 1) events.push(...play(`S${i}`, { scoutReportKey: 'k', burn: burn(4) }), ...play(`U${i}`, { burn: burn(10) }));
  const roi = buildShadowReport(events, pack, NOW).scoutRoi;
  assert.equal(roi.label, 'observational, confounded');
  assert.deepEqual(roi.comparisons, [{
    pool: 'claude', window: 'five_hour', scouted: { n: 5, meanBurnPercent: 4 }, unscouted: { n: 5, meanBurnPercent: 10 }, sufficient: true
  }]);
  const thin = buildShadowReport([...play('S', { scoutReportKey: 'k', burn: burn(4) }), ...play('U', { burn: burn(10) })], pack, NOW).scoutRoi;
  assert.equal(thin.comparisons[0].sufficient, false);
});

test('R7-9 the views are pure reads: events are not mutated and nothing is written', () => {
  const events = [...shadowFilm(), ...scorecardFilm()];
  const before = JSON.stringify(events);
  const view = buildRoutingIntelligenceView(events, pack, NOW, PROVIDER_PREFERENCE);
  assert.equal(JSON.stringify(events), before);
  assert.equal(view.filmEvents, events.length);
  assert.equal(view.causes.length, 8);
  assert.equal(JSON.stringify(buildRoutingIntelligenceView(events, pack, NOW, PROVIDER_PREFERENCE)), JSON.stringify(view), 'deterministic');
  for (const file of ['src/routing-intel/dev-views.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /node:fs|appendFile|writeFile|recordAttribution|recordDecision|recordLink/, `${file} is read-only`);
  }
});

// ── 5. Daemon: Dev gating and the one write ─────────────────────────────────────────────────────────────

test('R7-10 endpoints are Dev-only; a correction appends one Coach/high event and history is untouched', async () => {
  const dir = path.join(scratch, 'daemon');
  fs.mkdirSync(dir, { recursive: true });
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, devMode: false });
  const events = [...play('P', { at: AT(1) }), ...play('F', { at: AT(50) }).slice(0, 1), linkEv('F', 'P', AT(50)), attrEv('F', 'P', AT(50), 'player-defect', 'rule', 'low', 'R5-7')];
  const appended = [];
  const journal = { read: () => ({ events: [...events], diagnostics: [] }), append: (event) => { appended.push(event); events.push(event); } };
  const port = 39791;
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000, routingFilm: { journal } });
  const call = (method, route, token, body) => new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
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
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    daemon.registry.registerSession({
      instanceId: 'stadium-1', stadiumId: 'stadium-r7', name: 'R7', platform: 'win32', socket: { readyState: 1, send: () => undefined },
      lastHeartbeat: 1, game: { gameId: GAME, displayName: 'R7', fingerprintSource: 'git' },
      roster: [], capabilities: [], reports: [], rosterSynchronized: true, rosterSyncedAt: 1
    });
    const history = JSON.stringify(events);

    // Dev Mode OFF: absent, and nothing can be written
    assert.equal((await call('GET', '/api/routing/intelligence', token)).status, 404);
    assert.equal((await call('POST', '/api/routing/attribution', token, { clientRef: 'F', cause: 'prompt-change' })).status, 404);
    assert.equal(appended.length, 0);

    assert.equal((await call('POST', '/api/preferences', token, { devMode: true, gameId: GAME })).status, 200);
    const view = await call('GET', '/api/routing/intelligence', token);
    assert.equal(view.status, 200, JSON.stringify(view.body));
    assert.equal(view.body.followUps[0].label, 'Cause: player-defect · rule 7 · low');
    assert.equal(appended.length, 0, 'reading writes nothing');

    // validation
    assert.equal((await call('POST', '/api/routing/attribution', token, { clientRef: 'F', cause: 'nonsense' })).status, 400);
    assert.equal((await call('POST', '/api/routing/attribution', token, { clientRef: 'NOPE', cause: 'prompt-change' })).status, 404, 'no link, nothing to attribute');
    assert.equal(appended.length, 0);

    // the correction: one appended Coach/high event
    const fixed = await call('POST', '/api/routing/attribution', token, { clientRef: 'F', cause: 'prompt-change' });
    assert.equal(fixed.status, 200);
    const coach = appended.filter((event) => event.kind === 'attribution');
    assert.equal(coach.length, 1);
    assert.deepEqual([coach[0].source, coach[0].confidence, coach[0].cause, coach[0].clientRef, coach[0].parentClientRef], ['coach', 'high', 'prompt-change', 'F', 'P']);
    assert.equal(JSON.stringify(events.slice(0, JSON.parse(history).length)), history, 'earlier Film lines are byte-identical');
    assert.equal(effectiveAttributions(events).get('F').cause, 'prompt-change');

    // repeating the same correction is a no-op; a different one appends again (last wins)
    assert.equal((await call('POST', '/api/routing/attribution', token, { clientRef: 'F', cause: 'prompt-change' })).body.unchanged, true);
    assert.equal(appended.filter((event) => event.kind === 'attribution').length, 1);
    await call('POST', '/api/routing/attribution', token, { clientRef: 'F', cause: 'player-defect' });
    assert.equal(effectiveAttributions(events).get('F').cause, 'player-defect');
    assert.equal((await call('GET', '/api/routing/intelligence', token)).body.followUps[0].label, 'Cause: player-defect · coach · high');
  } finally {
    await daemon.stop();
  }
});

// ── 6. Browser: Dev gating and rendering, executed against the real page script ────────────────────────

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.hidden = false; this.attrs = {}; this.handlers = {}; this._text = ''; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
  find(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.find(predicate, out); return out; }
}

function pageHarness() {
  const ids = {};
  for (const id of ['devRoutingRationale', 'devRoutingRationaleBody', 'routingIntelligenceCard', 'routingIntelligenceBody', 'routingIntelligenceStatus',
    'routingIntelligenceDisclosureButton', 'routingIntelligenceRefreshBtn']) ids[id] = new FakeNode('div');
  ids.devRoutingRationale.hidden = true;
  ids.routingIntelligenceCard.hidden = true;
  ids.routingIntelligenceDisclosureButton.attrs['aria-expanded'] = 'true';
  const start = html.indexOf('// ── R7 Routing Intelligence (Dev Mode only)');
  const end = html.indexOf('      const syncCoachRoutinesSettings = (status) => {');
  assert.ok(start > 0 && end > start, 'R7 block is present');
  const calls = [];
  const factory = new Function('$', 'document', 'Node', 'api', 'setTimeout', `
    let lastStatus = { preferences: { devMode: true } };
    ${html.slice(start, end)}
    return { renderDevRationale, renderRoutingIntelligence, refreshRoutingIntelligence, syncRoutingIntelligence, setStatus: (s) => { lastStatus = s; } };
  `);
  const api = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/routing/intelligence') return harness.view;
    return { success: true };
  };
  const harness = {
    ids, calls, view: null,
    api: factory((id) => ids[id] || null, { createElement: (tag) => new FakeNode(tag) }, FakeNode, api, (fn) => fn())
  };
  return harness;
}

const sampleRec = () => ({
  engineVersion: 'r6-recommend-1', weightsVersion: 'r6-weights-1', priorPackVersion: '2026.09-r1',
  posture: { value: 'balanced', source: 'coach-default' }, strength: { recommendation: 'toss-up', evidence: 'prior-only' },
  baselineAgreement: 'agree', authority: { mode: 'manual', advisoryOnly: true, lockedBy: ['player'] },
  candidates: [{
    kind: 'send', target: { playerType: 'codex', modelId: 'gpt-5.6-sol', effort: 'high' }, route: { playerInstanceId: 'codex-1' }, resourcePool: 'codex',
    scores: {
      utility: 0.7, firstPass: { mean: 0.72, lo: 0.6, hi: 0.8 }, q: 0.72,
      cost: { units: 0.1, neutral: true, pricedBurn: 0.1, reacquisition: 0, effective: 0.1, windows: [{ pool: 'codex', window: 'five_hour', price: 'unknown' }] },
      possession: { tier: 'none', value: 0 }, delayMin: 0, risk: 0.1, interrupt: 0, sigmaU: 0.1
    },
    belief: { evidence: 'prior-only', source: 'researched', nPrior: 4, nLocalEff: 0, pooled: 0, burnConfidence: 'unknown' },
    reasons: ['PRIOR_ONLY', 'RESOURCE_UNKNOWN']
  }],
  possession: { max: 0, seats: [{ seat: 'codex-1', tier: 'none', ageMin: 0, continuity: 0.7, continuityState: 'unknown', value: 0 }] },
  scout: { verdict: 'no-scout', pRuns: 0.9, blockedBy: 'field-possessed' },
  scarcity: { codex: { isConserveActive: false, conserveLevel: 'NONE', evidenceState: 'UNKNOWN', rationale: 'no evidence' } },
  unknowns: [{ kind: 'burn', subject: 'codex' }]
});

test('R7-11 rationale renders R6\'s object verbatim, keeps UNKNOWN visible, and is empty when Dev Mode is off', () => {
  const page = pageHarness();
  const rec = sampleRec();
  rec.baseline = rec.primary = rec.candidates[0];
  page.api.renderDevRationale({ recommendation: rec, recommendationNarrative: recommendationNarrative(rec) });
  assert.equal(page.ids.devRoutingRationale.hidden, false);
  const text = page.ids.devRoutingRationaleBody.textContent;
  for (const expected of ['r6-recommend-1', 'r6-weights-1', '2026.09-r1', 'advisory only', 'gpt-5.6-sol', 'Researched prior only', 'not a measured Formation reliability', 'field-possessed']) {
    assert.ok(text.includes(expected), `shows ${expected}`);
  }
  const unknown = page.ids.devRoutingRationaleBody.find((node) => node.className === 'ri-unknown').map((node) => node.textContent).join('|');
  assert.match(unknown, /UNKNOWN/);
  assert.match(unknown, /neutral \(burn UNKNOWN\)/);
  assert.doesNotMatch(text, /would have|would succeed/i);

  page.api.renderDevRationale(null);
  assert.equal(page.ids.devRoutingRationale.hidden, true);
  assert.equal(page.ids.devRoutingRationaleBody.textContent, '');
});

test('R7-12 browser Dev gate: off ⇒ card hidden and emptied, no fetch; on ⇒ one read', async () => {
  const page = pageHarness();
  page.view = buildRoutingIntelligenceView(scorecardFilm(), pack, NOW, PROVIDER_PREFERENCE);
  page.api.setStatus({ preferences: { devMode: false } });
  page.api.syncRoutingIntelligence(false);
  assert.equal(page.ids.routingIntelligenceCard.hidden, true);
  await page.api.refreshRoutingIntelligence(true);
  assert.equal(page.calls.length, 0, 'Dad Mode never touches the endpoint');

  page.api.setStatus({ preferences: { devMode: true } });
  page.api.syncRoutingIntelligence(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.ids.routingIntelligenceCard.hidden, false);
  assert.deepEqual(page.calls.map((call) => call.url), ['/api/routing/intelligence']);
  assert.ok(page.ids.routingIntelligenceBody.textContent.includes('Scorecards'));

  page.api.setStatus({ preferences: { devMode: false } });
  page.api.syncRoutingIntelligence(false);
  assert.equal(page.ids.routingIntelligenceCard.hidden, true);
  assert.equal(page.ids.routingIntelligenceBody.textContent, '', 'turning Dev Mode off empties every R7 surface');
});

test('R7-13 attribution chips: one per FixCause, and a tap POSTs the Coach correction', async () => {
  const page = pageHarness();
  page.view = buildRoutingIntelligenceView(scorecardFilm(), pack, NOW, PROVIDER_PREFERENCE);
  await page.api.refreshRoutingIntelligence(true);
  const body = page.ids.routingIntelligenceBody;
  assert.ok(body.textContent.includes('Cause: player-defect · rule 7 · low'));
  assert.ok(body.textContent.includes('withholds credit; it does not blame the Player'));
  const chips = body.find((node) => node.tag === 'button');
  assert.equal(chips.length, 8 * 2, 'eight causes for each of the two linked follow-ups');
  const chip = chips.find((node) => node.textContent === 'prompt-change');
  page.calls.length = 0;
  await chip.handlers.click();
  const post = page.calls.find((call) => call.url === '/api/routing/attribution');
  assert.equal(post.options.method, 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { clientRef: JSON.parse(post.options.body).clientRef, cause: 'prompt-change' });
});

// ── 7. Source contracts: no second brain, Dad Mode and routing untouched ────────────────────────────────────

test('R7-14 no second routing brain, no innerHTML, gated wiring; routing never imports the Dev views', () => {
  const start = html.indexOf('// ── R7 Routing Intelligence (Dev Mode only)');
  const end = html.indexOf('      const syncCoachRoutinesSettings = (status) => {');
  const block = html.slice(start, end);
  assert.doesNotMatch(block, /innerHTML|insertAdjacentHTML/, 'all R7 text goes through textContent');
  assert.doesNotMatch(block, /lambda[CDR]\s*[*+-]|Math\.exp|Math\.pow|\.sort\(/, 'the browser recomputes and re-ranks nothing');
  assert.match(html, /<div id="routingIntelligenceCard"[^>]*\bhidden>/, 'the card is hidden by default');
  assert.match(html, /<details id="devRoutingRationale"[^>]*\bhidden>/, 'the rationale is hidden by default');
  assert.match(html, /syncRoutingIntelligence\(devMode\);/, 'gated by the same devMode truth as the other Dev cards');
  assert.match(html, /renderDevRationale\(lastStatus\?\.preferences\?\.devMode \? res : null\)/);
  for (const file of ['src/routing-policy.ts', 'src/control-plane/router.ts', 'src/routing-candidates.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /dev-views/, `${file} does not consume the Dev views`);
  }
  const daemon = fs.readFileSync(path.join(root, 'src/control-plane/daemon.ts'), 'latin1');
  assert.match(daemon, /pathname === '\/api\/routing\/intelligence'[\s\S]{0,200}devMode/);
  assert.match(daemon, /pathname === '\/api\/routing\/attribution'[\s\S]{0,200}devMode/);
});
