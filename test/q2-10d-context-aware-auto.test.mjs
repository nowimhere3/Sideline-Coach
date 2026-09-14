/**
 * Q2.10D — Context-aware AUTO, queue-for-owner, intelligent handoffs.
 *
 * "Given this new Play, who already knows the most useful context, what are they
 *  doing now, and what is the least-wasteful safe way to continue?"
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  detectFollowUp,
  resolveContextOwner,
  detectCollision,
  extractTouches,
  playModifiesGame,
  buildHandoffPreamble,
  friendlyInstanceNames
} from '../out/control-plane/context-affinity.js';
import { computeContextAwareRoute, createRoutingPolicies } from '../out/routing-policy.js';
import { PlayQueue, fileQueueStore } from '../out/control-plane/play-queue.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { parseReportProvenance, formatReportProvenance } from '../out/report-provenance.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { StadiumClient } from '../out/stadium-client.js';
import { getDurableStadiumId } from '../out/game-identity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policies = createRoutingPolicies();
const TREND = 'game_git_trend';
const GS3 = 'game_git_gs3';
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, ms = 8_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return true; await wait(25); }
  return false;
}

const claudeSnapshot = {
  provider: 'claude', authenticated: false, observedAt: Date.now(), freshness: 'live', defaultModelId: 'opus',
  models: ['opus', 'sonnet', 'haiku'].map((id) => ({ id, displayName: id[0].toUpperCase() + id.slice(1), isDefault: id === 'opus', supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'high' }))
};
const codexSnapshot = { provider: 'codex', authenticated: true, observedAt: Date.now(), freshness: 'live', models: [{ id: 'gpt-6-sol', displayName: 'GPT-6 Sol', isDefault: true, supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }] };
const cap = (instanceId, extra = {}) => ({
  instanceId, playerType: instanceId.split('-')[0], transport: 'controlled', transportLabel: 'Controlled',
  fieldLabel: instanceId.startsWith('claude') ? 'Claude' : 'Codex', state: 'ready',
  capability: instanceId.startsWith('claude') ? claudeSnapshot : codexSnapshot, ...extra
});
const C1 = 'claude-11111111';
const C2 = 'claude-22222222';
const names = new Map([[C1, 'Claude 1'], [C2, 'Claude 2'], ['codex-11111111', 'Codex']]);
const REPORT = { path: 'Reports/Claude/Architecture-Amendment.md', filename: 'Architecture-Amendment.md', mtime: 5_000, gameId: TREND };
const ledgerEntry = (playerInstanceId, extra = {}) => ({
  gameId: TREND, playerInstanceId, playerType: playerInstanceId.split('-')[0], workState: 'idle', recentPlays: [], reports: [], updatedAt: 1, ...extra
});
const ownerLedger = (ownerState = 'idle') => [
  ledgerEntry(C1, {
    workState: ownerState,
    recentPlays: [{ clientRef: 'ref_arch', playLabel: 'Hard architecture Play', promptSummary: 'Design the ledger architecture', outcome: 'completed', startedAt: 1_000, finishedAt: 4_000 }],
    reports: [{ path: REPORT.path, filename: REPORT.filename, mtime: REPORT.mtime, attribution: 'single-active-play', clientRef: 'ref_arch' }],
    ...(ownerState === 'working' ? { currentPlay: { clientRef: 'ref_now', promptSummary: 'Refactor src/control-plane/router.ts', startedAt: 6_000, touches: ['src/control-plane/router.ts', 'router.ts'] } } : {})
  }),
  ledgerEntry(C2)
];
const routeContext = (overrides = {}) => ({
  ledger: ownerLedger(), reports: [REPORT], names, rosterInstanceIds: new Set([C1, C2]), queuedCounts: new Map(), ...overrides
});

// ---------------------------------------------------------------------------
// Follow-up detection and context ownership
// ---------------------------------------------------------------------------

test('Q2.10D-1. Follow-up detection is conservative: clear continuations are recognised, new work is not attached', () => {
  const reports = [REPORT];
  for (const prompt of ['Build a new export feature.', 'Add tests for the feature flags module', 'Build the review screen for mobile', 'Refactor the settings page', 'Design an onboarding flow']) {
    assert.equal(detectFollowUp(prompt, { reports }).kind, 'new-work', prompt);
  }
  for (const prompt of ['Fix the issue you found in that report.', 'Continue with the implementation.', 'Apply the recommendation from the latest report.', 'Now test what you just built.', 'Make the amendment we discussed.']) {
    assert.equal(detectFollowUp(prompt, { reports }).kind, 'continuation', prompt);
  }
  assert.deepEqual(detectFollowUp('Implement Architecture-Amendment.md', { reports }), { kind: 'continuation', refersToReport: true, reportPath: REPORT.path, source: 'named-report' });
  assert.equal(detectFollowUp('Apply the recommendation from that report', { reports, incomingReportPath: REPORT.path }).source, 'incoming-report', 'the report the human is looking at is explicit evidence');
  assert.equal(detectFollowUp('Continue with the implementation', { reports, incomingReportPath: REPORT.path }).source, 'wording', 'an open report does not hijack a non-report continuation');
  assert.equal(detectFollowUp('Apply that report', { reports, incomingReportPath: 'Reports/GS3/other.md' }).source, 'wording', "another Game's report path is never evidence");
});

test('Q2.10D-2. Context ownership is evidence-based; Unknown stays Unknown; other Games never contribute', () => {
  const follow = detectFollowUp('Apply the recommendation from that report', { reports: [REPORT], incomingReportPath: REPORT.path });
  const owner = resolveContextOwner(follow, TREND, ownerLedger(), [REPORT]);
  assert.equal(owner.state, 'owner');
  assert.equal(owner.ownerInstanceId, C1);
  assert.equal(owner.evidence, 'incoming-report');
  assert.equal(owner.confidence, 'strong');
  assert.equal(owner.previousPlaySummary, 'Design the ledger architecture');

  const unattributed = resolveContextOwner(follow, TREND, [ledgerEntry(C1), ledgerEntry(C2)], [REPORT]);
  assert.deepEqual({ state: unattributed.state, reason: unattributed.reason }, { state: 'unknown', reason: "Coach can't prove which Player owns this context." });

  const newWork = resolveContextOwner(detectFollowUp('Build a new export feature', { reports: [REPORT] }), TREND, ownerLedger(), [REPORT]);
  assert.equal(newWork.state, 'none', 'generic words never create an owner');

  const gs3Ledger = ownerLedger().map((entry) => ({ ...entry, gameId: GS3 }));
  assert.equal(resolveContextOwner(follow, TREND, gs3Ledger, [REPORT]).state, 'unknown', "GS3 history never owns Trend's context");

  const latestPlay = resolveContextOwner(detectFollowUp('Now test what you just built', { reports: [] }), TREND, ownerLedger(), []);
  assert.deepEqual({ state: latestPlay.state, owner: latestPlay.ownerInstanceId, evidence: latestPlay.evidence }, { state: 'owner', owner: C1, evidence: 'latest-play' });

  const explicit = { ...REPORT, provenance: { playerInstanceId: C2, gameId: TREND } };
  assert.equal(resolveContextOwner(follow, TREND, [ledgerEntry(C1), ledgerEntry(C2)], [explicit]).ownerInstanceId, C2, 'explicit provenance names the owner');
  const foreign = { ...REPORT, provenance: { playerInstanceId: C2, gameId: GS3 } };
  assert.equal(resolveContextOwner(follow, TREND, [ledgerEntry(C1), ledgerEntry(C2)], [foreign]).state, 'unknown', 'provenance from another Game is ignored');
});

// ---------------------------------------------------------------------------
// Routing policy
// ---------------------------------------------------------------------------

test('Q2.10D-3. The idle context owner wins over an idle sibling — relevant context outweighs "idle sibling first"', () => {
  const candidates = [cap(C2, { work: { workState: 'idle' } }), cap(C1, { work: { workState: 'idle' } })];
  const { decision } = computeContextAwareRoute(TREND, 'Implement the amendment from that report', candidates, policies, routeContext({ incomingReportPath: REPORT.path }));
  assert.equal(decision.playerInstanceId, C1, 'Claude 1 wrote the report, so Claude 1 continues');
  assert.equal(decision.action, 'dispatch');
  assert.equal(decision.playerName, 'Claude 1');
  assert.equal(decision.rationale.player, 'owns the context and is idle.');
  assert.deepEqual({ state: decision.context.state, owner: decision.context.ownerInstanceId, evidence: decision.context.evidence, report: decision.context.reportFilename }, { state: 'owner', owner: C1, evidence: 'incoming-report', report: 'Architecture-Amendment.md' });
  assert.ok(decision.model && decision.effort, 'provider → model → effort still resolved for the exact instance');
  assert.equal(decision.contextPreamble, undefined, 'the owner needs no handoff package');
});

test('Q2.10D-4. Unrelated new work does not attach to the previous owner, and Unknown context is said out loud', () => {
  const candidates = [cap(C1, { work: { workState: 'idle' } }), cap(C2, { work: { workState: 'idle' } })];
  const fresh = computeContextAwareRoute(TREND, 'Build a new export feature', candidates, policies, routeContext()).decision;
  assert.equal(fresh.context.state, 'none');
  assert.equal(fresh.action, 'dispatch');

  const unknown = computeContextAwareRoute(TREND, 'Apply the recommendation from that report', candidates, policies, routeContext({ ledger: [ledgerEntry(C1), ledgerEntry(C2)], incomingReportPath: REPORT.path })).decision;
  assert.equal(unknown.context.state, 'unknown');
  const seatLabelled = computeContextAwareRoute(TREND, 'Build a new export feature', [cap(C2, { fieldLabel: 'Claude 4', work: { workState: 'idle' } })], policies, routeContext()).decision;
  assert.equal(seatLabelled.summary, 'Claude 2 can run this Play now.', 'summaries use contiguous names, never the seat label');
  assert.match(unknown.summary, /Coach can't prove which Player owns this context\./);
  assert.match(unknown.contextPreamble, /Read this report before proceeding: Reports\/Claude\/Architecture-Amendment\.md/, 'the report still travels as context');
  assert.doesNotMatch(unknown.contextPreamble, /previously handled by/, 'no invented owner');
});

test('Q2.10D-5. Busy context owner + a Play that changes the Game → Queue for the owner, with a handoff offered', () => {
  const candidates = [cap(C1, { state: 'busy', work: { workState: 'working' } }), cap(C2, { work: { workState: 'idle' } })];
  const { decision } = computeContextAwareRoute(TREND, 'Implement the amendment from that report', candidates, policies, routeContext({ ledger: ownerLedger('working'), incomingReportPath: REPORT.path }));
  assert.equal(decision.action, 'queue');
  assert.equal(decision.playerInstanceId, C1);
  assert.equal(decision.queuePosition, 1);
  assert.equal(decision.summary, 'Queued for Claude 1 · owns the current implementation context and is Working.');
  assert.deepEqual(decision.alternative, { choice: 'handoff', playerInstanceId: C2, playerName: 'Claude 2', label: 'Use Claude 2 with latest report' });
});

test('Q2.10D-6. Busy owner + an independent read-only Play with a report → safe handoff to the idle sibling, with the context package', () => {
  const candidates = [cap(C1, { state: 'busy', work: { workState: 'working' } }), cap(C2, { work: { workState: 'idle' } })];
  const { decision } = computeContextAwareRoute(TREND, 'Review the findings in that report', candidates, policies, routeContext({ ledger: ownerLedger('working'), incomingReportPath: REPORT.path }));
  assert.equal(decision.action, 'handoff');
  assert.equal(decision.playerInstanceId, C2);
  assert.equal(decision.rationale.player, 'Claude 1 owns the context but is busy; the latest report is enough for a safe handoff.');
  assert.equal(decision.contextPreamble, '[Sideline Coach handoff]\nYou are continuing work previously handled by Claude 1 in this Game.\nRead this report before proceeding: Reports/Claude/Architecture-Amendment.md\nPrevious Play: "Design the ledger architecture"\n---\n');
  assert.deepEqual(decision.alternative, { choice: 'queue', playerInstanceId: C1, playerName: 'Claude 1', label: 'Queue for Claude 1' });

  // The human's pick of the alternative is honoured — in both directions.
  const queued = computeContextAwareRoute(TREND, 'Review the findings in that report', candidates, policies, routeContext({ ledger: ownerLedger('working'), incomingReportPath: REPORT.path, choice: 'queue' })).decision;
  assert.equal(queued.action, 'queue');
  const handed = computeContextAwareRoute(TREND, 'Implement the amendment from that report', candidates, policies, routeContext({ ledger: ownerLedger('working'), incomingReportPath: REPORT.path, choice: 'handoff' })).decision;
  assert.equal(handed.action, 'handoff');
  assert.equal(handed.playerInstanceId, C2);
});

test('Q2.10D-7. An owner with Plays already waiting queues behind them (FIFO), even when momentarily free', () => {
  const candidates = [cap(C1), cap(C2)];
  const { decision } = computeContextAwareRoute(TREND, 'Implement the amendment from that report', candidates, policies, routeContext({ incomingReportPath: REPORT.path, queuedCounts: new Map([[C1, 1]]) }));
  assert.equal(decision.action, 'queue');
  assert.equal(decision.queuePosition, 2);
});

test('Q2.10D-8. Owner benched, removed or unavailable: never a silent reroute — the route says so, or the human decides', () => {
  const benched = computeContextAwareRoute(TREND, 'Apply the recommendation from that report', [cap(C2)], policies, routeContext({ incomingReportPath: REPORT.path })).decision;
  assert.equal(benched.action, 'handoff');
  assert.match(benched.rationale.player, /^Claude 1 owns this context but is on the bench\./);
  assert.match(benched.contextPreamble, /previously handled by Claude 1/);

  const removed = computeContextAwareRoute(TREND, 'Apply the recommendation from that report', [cap(C2)], policies, routeContext({ incomingReportPath: REPORT.path, rosterInstanceIds: new Set([C2]) })).decision;
  assert.match(removed.rationale.player, /^The Player that owns this context is no longer available\./);

  const unavailable = computeContextAwareRoute(TREND, 'Apply the recommendation from that report', [cap(C1, { state: 'unavailable' })], policies, routeContext({ incomingReportPath: REPORT.path }));
  assert.equal(unavailable.decision, undefined, 'no sibling to continue → no guessed route');
  assert.equal(unavailable.error, 'The Player that owns this context is no longer available. Choose who continues in Manual.');
});

test('Q2.10D-9. Collision awareness: new work naming a file another Player is changing prefers queueing; no shared file → no claimed collision', () => {
  const codexWorking = cap('codex-11111111', { state: 'busy', work: { workState: 'working' } });
  const ledger = [
    ledgerEntry('codex-11111111', { playerType: 'codex', workState: 'working', currentPlay: { clientRef: 'ref_c', promptSummary: 'Refactor src/control-plane/router.ts', startedAt: 1, touches: extractTouches('Refactor src/control-plane/router.ts') } }),
    ledgerEntry(C2)
  ];
  const context = routeContext({ ledger, rosterInstanceIds: new Set(['codex-11111111', C2]) });
  const overlap = computeContextAwareRoute(TREND, 'Add logging to src/control-plane/router.ts', [codexWorking, cap(C2)], policies, context).decision;
  assert.equal(overlap.action, 'queue');
  assert.equal(overlap.playerInstanceId, 'codex-11111111');
  assert.match(overlap.summary, /is changing src\/control-plane\/router\.ts right now/);
  assert.equal(overlap.alternative.choice, 'dispatch');

  const parallel = computeContextAwareRoute(TREND, 'Add logging to src/public/index.html', [codexWorking, cap(C2)], policies, context).decision;
  assert.equal(parallel.action, 'dispatch', 'independent work may run in parallel');
  assert.equal(parallel.playerInstanceId, C2);
  assert.equal(detectCollision('Write docs for the product', ledger), undefined);
  assert.equal(computeContextAwareRoute(TREND, 'Add logging to src/control-plane/router.ts', [codexWorking, cap(C2)], policies, { ...context, choice: 'dispatch' }).decision.playerInstanceId, C2, '"Run now" is honoured');
  assert.equal(playModifiesGame('Review the findings'), false);
  assert.equal(playModifiesGame('Implement the amendment'), true);
});

test('Q2.10D-10. Terminal never receives natural-language AUTO work, even when it "owns" context; Games never mix', () => {
  const terminal = { instanceId: 'terminal-11111111', playerType: 'terminal', transport: 'legacy', executionType: 'direct-shell', fieldLabel: 'Terminal', state: 'ready', capability: { provider: 'terminal', freshness: 'unavailable', models: [] } };
  const ledger = [ledgerEntry('terminal-11111111', { playerType: 'terminal', recentPlays: [{ clientRef: 'x', outcome: 'completed', startedAt: 1, finishedAt: 9_999, promptSummary: 'npm test' }] })];
  const result = computeContextAwareRoute(TREND, 'Now fix what you just built', [terminal], policies, routeContext({ ledger, rosterInstanceIds: new Set(['terminal-11111111']) }));
  assert.equal(result.decision, undefined);
  assert.match(result.error, /^Terminal ran that work, and Terminal only runs exact commands\. Choose who continues in Manual\.$/);

  const gs3 = computeContextAwareRoute(GS3, 'Apply the recommendation from that report', [cap(C1), cap(C2)], policies, routeContext({ incomingReportPath: REPORT.path })).decision;
  assert.notEqual(gs3.context.state, 'owner', "Trend's report and history never route GS3 work");
});

// ---------------------------------------------------------------------------
// Queue, provenance, persistence
// ---------------------------------------------------------------------------

test('Q2.10D-11. The queue is per Game + exact instance, FIFO, cancellable, and survives a restart truthfully', () => {
  const dir = tmp('sideline-q210d-queue-');
  const file = path.join(dir, 'play-queue.json');
  const queue = new PlayQueue(fileQueueStore(file));
  const base = { playerType: 'claude', model: 'opus', effort: 'high', reason: 'Queued for Claude 1' };
  const a = queue.enqueue({ ...base, gameId: TREND, playerInstanceId: C1, prompt: 'first' });
  const b = queue.enqueue({ ...base, gameId: TREND, playerInstanceId: C1, prompt: 'second' });
  queue.enqueue({ ...base, gameId: TREND, playerInstanceId: C2, prompt: 'sibling' });
  queue.enqueue({ ...base, gameId: GS3, playerInstanceId: C1, prompt: 'other game' });
  assert.deepEqual(queue.forInstance(TREND, C1).map((i) => i.prompt), ['first', 'second']);
  assert.equal(queue.head(TREND, C1).id, a.id);
  assert.deepEqual(queue.forGame(GS3).map((i) => i.prompt), ['other game'], 'another Game sees only its own queue');
  assert.equal(queue.cancel(a.id, GS3), undefined, 'a Game cannot cancel another Game\'s Play');
  assert.ok(queue.markDispatching(b.id));
  assert.equal(queue.cancel(b.id), undefined, 'a Play being sent cannot be cancelled');

  const reloaded = new PlayQueue(fileQueueStore(file));
  assert.equal(reloaded.forGame(TREND).length, 3, 'accepted queued Plays survive a Control Plane replacement');
  const interrupted = reloaded.get(b.id);
  assert.equal(interrupted.state, 'needs-attention', 'a send interrupted by the restart is never resent on its own');
  assert.match(interrupted.attention, /can't tell whether this queued Play started/);
  assert.ok(reloaded.retry(b.id, TREND));
  assert.equal(reloaded.get(b.id).state, 'queued');
  assert.equal(reloaded.cancel(a.id, TREND).prompt, 'first');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Q2.10D-12. Explicit report provenance: invisible one-line header, strict parsing, authoritative only within its Game', () => {
  const line = formatReportProvenance({ gameId: TREND, clientRef: 'ref_1', playerInstanceId: C2, playerType: 'claude', provider: 'claude', model: 'opus', effort: 'high' });
  assert.match(line, /^<!-- sideline-provenance: \{.*\} -->$/);
  const report = `${line}\n# Architecture Amendment\n\nHuman-readable body.`;
  assert.deepEqual(parseReportProvenance(report), { gameId: TREND, clientRef: 'ref_1', playerInstanceId: C2, playerType: 'claude', provider: 'claude', model: 'opus', effort: 'high', at: undefined });
  assert.equal(parseReportProvenance('# Plain report'), undefined);
  assert.equal(parseReportProvenance('<!-- sideline-provenance: {not json} -->'), undefined);
  assert.equal(parseReportProvenance('<!-- sideline-provenance: {"playerInstanceId":"rm -rf /"} -->'), undefined, 'malformed identities are dropped');

  const book = new InstanceWorkLedger(() => 10);
  book.observeRoster(TREND, [cap(C1), cap(C2)]);
  book.recordReports(TREND, [{ path: 'Reports/a.md', mtime: 1, provenance: { playerInstanceId: C2, gameId: TREND, clientRef: 'ref_1' } }, { path: 'Reports/b.md', mtime: 1, provenance: { playerInstanceId: C1, gameId: GS3 } }]);
  assert.deepEqual(book.get(TREND, C2).reports.map((r) => `${r.path}:${r.attribution}`), ['Reports/a.md:explicit-provenance']);
  assert.equal(book.get(TREND, C1).reports.length, 0, 'provenance naming another Game is ignored');

  const restored = new InstanceWorkLedger();
  restored.restore(book.serialize());
  assert.equal(restored.get(TREND, C2).reports[0].path, 'Reports/a.md', 'context ownership survives a Control Plane replacement');
  assert.equal(restored.get(TREND, C2).workState, 'unknown', 'activity is re-learned, never assumed');

  book.observeRoster(TREND, [cap(C1)], new Set([C1, C2]));
  assert.ok(book.get(TREND, C2), 'a benched instance keeps its context history');
  book.observeRoster(TREND, [cap(C1)], new Set([C1]));
  assert.equal(book.get(TREND, C2), undefined, 'an instance that left the Team leaves the Ledger');
});

test('Q2.10D-13. Handoff preamble is compact and provider-neutral; friendly names are contiguous presentation only', () => {
  const preamble = buildHandoffPreamble({ ownerName: 'Claude 1', report: REPORT, previousPlaySummary: 'Design the ledger architecture', reason: 'owner-busy' });
  assert.ok(preamble.length < 400);
  assert.doesNotMatch(preamble, /claude-11111111|ref_/, 'no machine ids in what a Player reads');
  const roster = [{ name: 'Claude', instances: [{ instanceId: 'claude-aaaaaaaa', seat: 3 }, { instanceId: 'claude-bbbbbbbb', seat: 1 }] }, { name: 'Codex', instances: [{ instanceId: 'codex-cccccccc', seat: 2 }] }];
  assert.deepEqual([...friendlyInstanceNames(roster)], [['claude-bbbbbbbb', 'Claude 1'], ['claude-aaaaaaaa', 'Claude 2'], ['codex-cccccccc', 'Codex']]);
});

// ---------------------------------------------------------------------------
// Real Control Plane + simulated Stadium
// ---------------------------------------------------------------------------

function fakeStadium({ dir, port, gameId, displayName, instances, reports }) {
  const stadiumId = getDurableStadiumId(dir);
  const state = new Map(instances.map((id) => [id, { onField: true, state: 'ready' }]));
  const delivered = [];
  const roster = {
    resolve: (id) => state.has(id) && state.get(id).onField
      ? { state: 'live', transport: 'controlled', instance: { instanceId: id, playerType: id.split('-')[0], onField: true } }
      : { state: 'unknown' },
    status: async () => [{ id: 'claude', name: 'Claude', instances: instances.filter((id) => state.has(id)).map((id, index) => ({ instanceId: id, playerType: 'claude', seat: index + 1, fieldLabel: `Claude${index ? ` ${index + 1}` : ''}`, onField: state.get(id).onField })) }],
    getRoutingCapabilities: () => instances.filter((id) => state.has(id) && state.get(id).onField).map((id, index) => cap(id, { fieldLabel: `Claude${index ? ` ${index + 1}` : ''}`, state: state.get(id).state })),
    getLastDiscovery: () => undefined
  };
  const host = { deliver: async (instanceId, prompt, options) => { delivered.push({ instanceId, prompt, options }); return { kind: 'accepted', turnRef: `turn-${delivered.length}` }; } };
  const client = new StadiumClient({
    port, dir, instanceId: `inst_${stadiumId}_${gameId}`,
    gameContextGetter: () => ({
      game: { gameId, displayName, fingerprintSource: 'git-remote', repoUri: `https://example.com/${gameId}.git` },
      stadium: { stadiumId, name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId, stadiumId, rootFsPath: `C:\\Games\\${displayName}`, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    playerRoster: roster, playerControlHost: host, reportsGetter: async () => [...reports],
    resolveControlPlane: async () => ({ port: client.__port ?? port })
  });
  const publish = async () => { await client.sendRosterChanged(); client.sendCapabilitySnapshot(); };
  return {
    client, delivered, state, reports,
    async setState(id, next) { Object.assign(state.get(id), next); await publish(); },
    async turn(id, turnState) { client.sendTurnChanged({ instanceId: id, state: turnState, turnRef: 't', summary: turnState, at: Date.now() }); },
    publish
  };
}

async function api(port, dir, url, init = {}) {
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return { status: response.status, body: await response.json() };
}

test('Q2.10D-14. Live Control Plane: owner owns the report, busy owner → staged Queue equals actual Queue, completion auto-starts it on the exact instance, GS3 untouched', async () => {
  const dir = tmp('sideline-q210d-live-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39310, idleTimeoutMs: 60_000 });
  await daemon.start();
  const port = daemon.port;
  const reportFile = { gameId: TREND, project: 'Trend', agent: 'Claude', filename: 'Architecture-Amendment.md', path: 'Reports/Claude/Architecture-Amendment.md', mtime: 0, content: '# Amendment' };
  const trend = fakeStadium({ dir, port, gameId: TREND, displayName: 'Trend and Tap Assist', instances: [C1, C2], reports: [] });
  const gs3 = fakeStadium({ dir, port, gameId: GS3, displayName: 'GS3', instances: ['claude-33333333'], reports: [] });
  try {
    assert.ok(await trend.client.connect());
    assert.ok(await gs3.client.connect());
    await api(port, dir, '/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: TREND }) });
    await trend.publish();
    assert.ok(await until(async () => (await api(port, dir, '/api/status')).body.capabilities?.length === 2));

    // 1. Claude 1 works a Play that produces the report (single active Play → attributed).
    const first = await api(port, dir, '/api/dispatch', { method: 'POST', body: JSON.stringify({ prompt: 'Design the ledger architecture', routingMode: 'manual', playerInstanceId: C1, gameId: TREND }) });
    assert.equal(first.body.status, 'received');
    await trend.turn(C1, 'started');
    await trend.setState(C1, { state: 'busy' });
    await wait(50);
    trend.reports.push({ ...reportFile, mtime: Date.now() + 10 });
    await trend.client.publishReportsChanged();
    assert.ok(await until(async () => ((await api(port, dir, '/api/status')).body.workLedger || []).some((e) => e.playerInstanceId === C1 && e.reports.length === 1)), 'report attributed to Claude 1');

    // 2. While Claude 1 is still Working, a follow-up that changes the Game.
    const prompt = 'Implement the amendment from that report';
    const preview = await api(port, dir, '/api/route/preview', { method: 'POST', body: JSON.stringify({ prompt, incomingReportPath: reportFile.path }) });
    assert.equal(preview.body.decision.action, 'queue');
    assert.equal(preview.body.decision.playerInstanceId, C1);
    assert.equal(preview.body.decision.playerName, 'Claude 1');
    assert.equal(preview.body.decision.alternative.label, 'Use Claude 2 with latest report');
    const queued = await api(port, dir, '/api/dispatch', { method: 'POST', body: JSON.stringify({ prompt, routingMode: 'auto', incomingReportPath: reportFile.path, gameId: TREND }) });
    assert.equal(queued.status, 202);
    assert.equal(queued.body.status, 'queued');
    assert.deepEqual({ action: queued.body.decision.action, player: queued.body.decision.playerInstanceId, reason: queued.body.decision.summary }, { action: preview.body.decision.action, player: preview.body.decision.playerInstanceId, reason: preview.body.decision.summary }, 'staged route equals actual route');
    const status = (await api(port, dir, '/api/status')).body;
    assert.equal(status.queue.length, 1);
    assert.equal(status.queue[0].playerName, 'Claude 1');
    assert.equal(status.capabilities.find((c) => c.instanceId === C1).work.queuedCount, 1);
    assert.equal(trend.delivered.length, 1, 'nothing sent while the owner is working');

    // 3. GS3 sees none of it.
    const gs3Queue = (await api(port, dir, `/api/queue?gameId=${GS3}`)).body.queue;
    assert.deepEqual(gs3Queue, []);

    // 4. Claude 1 completes → the queued Play starts on Claude 1 (never Claude 2).
    await trend.turn(C1, 'completed');
    await trend.setState(C1, { state: 'ready' });
    assert.ok(await until(() => trend.delivered.length === 2), 'queued Play released on completion');
    assert.equal(trend.delivered[1].instanceId, C1);
    assert.ok(trend.delivered[1].prompt.startsWith(prompt), 'the queued human Play is preserved');
    assert.equal(parseReportProvenance(trend.delivered[1].prompt)?.playerInstanceId, C1, 'Controlled queue release adds exact source provenance');
    assert.ok(await until(async () => (await api(port, dir, '/api/status')).body.queue.length === 0));
    assert.equal(gs3.delivered.length, 0);
  } finally {
    trend.client.dispose();
    gs3.client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Q2.10D-15. A queued Play survives an automatic Control Plane replacement and is still delivered only to its exact instance', async () => {
  const dir = tmp('sideline-q210d-replace-');
  let daemon = new ControlPlaneDaemon({ dir, port: 39320, idleTimeoutMs: 60_000 });
  await daemon.start();
  let port = daemon.port;
  const trend = fakeStadium({ dir, port, gameId: TREND, displayName: 'Trend and Tap Assist', instances: [C1, C2], reports: [] });
  try {
    assert.ok(await trend.client.connect());
    await trend.setState(C1, { state: 'busy' });
    assert.ok(await until(async () => (await api(port, dir, '/api/status')).body.capabilities?.length === 2));
    const queued = await api(port, dir, '/api/dispatch', { method: 'POST', body: JSON.stringify({ prompt: 'Run the migration after the refactor', routingMode: 'manual', playerInstanceId: C1, whenBusy: 'queue', gameId: TREND }) });
    assert.equal(queued.body.status, 'queued', 'MANUAL queue-when-busy');

    await daemon.stop();
    daemon = new ControlPlaneDaemon({ dir, port: 39330, idleTimeoutMs: 60_000 });
    await daemon.start();
    trend.client.__port = daemon.port;
    port = daemon.port;
    assert.ok(await until(() => trend.client.isConnected, 10_000), 'Stadium reconnected to the replacement');
    await api(port, dir, '/api/game/select', { method: 'POST', body: JSON.stringify({ gameId: TREND }) });
    const survived = await until(async () => (await api(port, dir, '/api/status')).body.queue?.length === 1);
    assert.ok(survived, 'the accepted queued Play is still there');
    assert.equal(trend.delivered.length, 0);

    await trend.setState(C1, { state: 'ready' });
    assert.ok(await until(() => trend.delivered.length === 1), 'released after the replacement');
    assert.equal(trend.delivered[0].instanceId, C1);
  } finally {
    trend.client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Q2.10D-16. Revalidation before release: benched, removed or unavailable targets need attention — never a sibling', async () => {
  const dir = tmp('sideline-q210d-reval-');
  const daemon = new ControlPlaneDaemon({ dir, port: 39340, idleTimeoutMs: 60_000 });
  await daemon.start();
  const port = daemon.port;
  const trend = fakeStadium({ dir, port, gameId: TREND, displayName: 'Trend and Tap Assist', instances: [C1, C2], reports: [] });
  const queueFor = async (prompt) => (await api(port, dir, '/api/dispatch', { method: 'POST', body: JSON.stringify({ prompt, routingMode: 'manual', playerInstanceId: C1, whenBusy: 'queue', gameId: TREND }) })).body;
  try {
    assert.ok(await trend.client.connect());
    await trend.setState(C1, { state: 'busy' });
    assert.ok(await until(async () => (await api(port, dir, '/api/status')).body.capabilities?.length === 2));
    const item = await queueFor('Continue the refactor');
    assert.equal(item.status, 'queued');

    await trend.setState(C1, { onField: false, state: 'ready' }); // benched
    assert.ok(await until(async () => (await api(port, dir, '/api/status')).body.queue?.[0]?.state === 'needs-attention'));
    let queue = (await api(port, dir, '/api/status')).body.queue;
    assert.match(queue[0].attention, /Claude 1 is on the bench/);
    assert.equal(trend.delivered.length, 0, 'not sent to Claude 2 instead');

    await trend.setState(C1, { onField: true, state: 'unavailable' });
    const retry = await api(port, dir, `/api/queue/${queue[0].id}/retry`, { method: 'POST', body: JSON.stringify({ gameId: TREND }) });
    assert.equal(retry.status, 200);
    assert.ok(await until(async () => /can't take Plays right now/.test((await api(port, dir, '/api/status')).body.queue?.[0]?.attention ?? '')));

    trend.state.delete(C1); // removed from the Team
    await trend.publish();
    await api(port, dir, `/api/queue/${queue[0].id}/retry`, { method: 'POST', body: JSON.stringify({ gameId: TREND }) });
    assert.ok(await until(async () => /no longer on your Team/.test((await api(port, dir, '/api/status')).body.queue?.[0]?.attention ?? '')));
    assert.equal(trend.delivered.length, 0);

    queue = (await api(port, dir, '/api/status')).body.queue;
    const cancelled = await api(port, dir, `/api/queue/${queue[0].id}/cancel`, { method: 'POST', body: JSON.stringify({ gameId: TREND }) });
    assert.equal(cancelled.status, 200);
    assert.equal((await api(port, dir, '/api/status')).body.queue.length, 0);
  } finally {
    trend.client.dispose();
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Phone UI
// ---------------------------------------------------------------------------

function renderPage(status, posts = [], previewDecision) {
  const elements = new Map();
  const makeNode = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
    dataset: {}, style: { display: '', opacity: '' }, attributes: {}, children: [], listeners: {},
    classList: { classes: new Set(), add(...t) { for (const x of t) this.classes.add(x); }, remove(...t) { for (const x of t) this.classes.delete(x); }, toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; }, contains(c) { return this.classes.has(c); } },
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; this[k] = v; }, getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { this.children.push(c); }, append(...k) { this.children.push(...k); }, focus() {}
  });
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };
  let source;
  class FakeEventSource { constructor() { this.listeners = {}; source = this; } addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); } emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); } close() {} }
  const session = new Map([['sidelineCoachToken', 'test-token']]);
  const ctx = {
    document: { getElementById: getEl, querySelectorAll: (s) => (s === '[data-live-action]' ? [getEl('dispatchBtn')] : []), createElement: () => makeNode(''), addEventListener() {} },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    fetch: async (url, options = {}) => {
      if (url.startsWith('/api/status')) return { ok: true, status: 200, json: async () => status };
      if (url.startsWith('/api/reports')) return { ok: true, status: 200, json: async () => status.reports };
      const body = options.body ? JSON.parse(options.body) : undefined;
      posts.push({ url, body });
      if (url === '/api/route/preview') return { ok: true, status: 200, json: async () => ({ success: true, decision: previewDecision(body) }) };
      return { ok: true, status: 202, json: async () => ({ success: true, status: 'queued', message: 'Queued for Claude 1 · owns the context and is Working.' }) };
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, console,
    navigator: { clipboard: { writeText: async () => {} } }, window: { isSecureContext: true }
  };
  return {
    getEl,
    start: async (code) => {
      vm.createContext(ctx);
      vm.runInContext(code, ctx);
      source.emit('hello');
      const end = Date.now() + 2000;
      while (Date.now() < end && !getEl('roster').children.length) await new Promise((r) => setTimeout(r, 5));
    }
  };
}

const phoneStatus = () => {
  const i1 = { instanceId: C1, playerType: 'claude', seat: 1, fieldLabel: 'Claude · Controlled', displayName: 'Claude 1', ownership: 'coach-managed', onField: true, transport: 'Controlled', controlMode: 'controlled' };
  const i2 = { instanceId: C2, playerType: 'claude', seat: 4, fieldLabel: 'Claude 4 · Controlled', displayName: 'Claude 2', ownership: 'coach-managed', onField: true, transport: 'Controlled', controlMode: 'controlled' };
  const caps = [cap(C1, { fieldLabel: 'Claude', state: 'busy', work: { workState: 'working', queuedCount: 1 } }), cap(C2, { fieldLabel: 'Claude 4', work: { workState: 'idle', queuedCount: 0 } })];
  return {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: TREND,
    game: { gameId: TREND, displayName: 'Trend and Tap Assist', fingerprintSource: 'git-remote' },
    games: [{ gameId: TREND, displayName: 'Trend and Tap Assist', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32', stadiumType: 'vscode-desktop' },
    rosterSynchronized: true,
    players: [{ id: 'claude', name: 'Claude', availability: 'available', fieldState: 'on-field', instances: [i1, i2] }],
    capabilities: caps,
    routing: { mode: 'auto', capabilities: caps, activeDecision: null },
    queue: [{ id: 'queue_abc', playerInstanceId: C1, playerName: 'Claude 1', playLabel: 'Implementation Play', promptSummary: 'Implement the amendment from that report', reason: 'Queued for Claude 1', state: 'queued', position: 1, queuedAt: 1 }],
    playerDiscovery: null,
    preferences: { runningPlayers: 'ask' },
    reports: [{ gameId: TREND, project: 'Trend', agent: 'Claude', filename: 'Architecture-Amendment.md', path: REPORT.path, mtime: Date.now(), content: '# Amendment' }]
  };
};
const pageScript = async () => fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

test('Q2.10D-17. Phone: staged route says "Queue for Claude 1" with a plain reason and one alternative; dispatch carries the same context; Roster shows the queued Play with Cancel', async () => {
  const posts = [];
  const queueDecision = (body) => body.routeChoice === 'handoff'
    ? { mode: 'auto', action: 'handoff', playerInstanceId: C2, playerName: 'Claude 2', playerLabel: 'Claude 4', modelDisplayName: 'Sonnet', effort: 'medium', transport: 'controlled', rationale: { player: 'Claude 1 owns the context but is busy; the latest report is enough for a safe handoff.' }, context: { state: 'owner', reportFilename: 'Architecture-Amendment.md' }, alternative: { choice: 'queue', playerInstanceId: C1, playerName: 'Claude 1', label: 'Queue for Claude 1' } }
    : { mode: 'auto', action: 'queue', playerInstanceId: C1, playerName: 'Claude 1', playerLabel: 'Claude', modelDisplayName: 'Opus', effort: 'high', transport: 'controlled', rationale: { player: 'owns the current implementation context and is Working.' }, context: { state: 'owner', ownerInstanceId: C1 }, alternative: { choice: 'handoff', playerInstanceId: C2, playerName: 'Claude 2', label: 'Use Claude 2 with latest report' } };
  const page = renderPage(phoneStatus(), posts, queueDecision);
  await page.start(await pageScript());

  // Roster: friendly contiguous names, queued line with Cancel. (Q2.10F.2-C: the old
  // "Working · 1 queued" card word is retired; execution belongs to the canonical strip.)
  const cards = page.getEl('roster').children.filter((row) => row.className === 'player');
  assert.deepEqual(cards.map((card) => card.children[1].children[0].textContent), ['Claude 1', 'Claude 2'], 'seat 4 is shown as Claude 2');
  const ownerCard = cards.find((card) => card.dataset.instanceId === C1);
  assert.doesNotMatch(ownerCard.children[1].children[1].children.map((c) => c.textContent).join(''), /Working|queued/);
  const queueLine = ownerCard.children.find((child) => child.dataset?.queueId === 'queue_abc');
  assert.match(queueLine.children[0].textContent, /^Queued #1 · Implement the amendment from that report/);
  assert.doesNotMatch(queueLine.children[0].textContent, /queue_abc|claude-11111111/, 'no machine ids in Dad Mode');
  const cancel = queueLine.children.find((child) => child.textContent === 'Cancel');
  for (const fn of cancel.listeners.click || []) await fn();
  assert.deepEqual(posts.find((p) => p.url === '/api/queue/queue_abc/cancel')?.body, { gameId: TREND });

  // Staged route.
  page.getEl('promptInput').value = 'Implement the amendment from that report';
  for (const fn of page.getEl('promptInput').listeners.input || []) fn();
  await wait(400);
  assert.equal(page.getEl('autoRoutePlayer').textContent, 'Queue for Claude 1');
  assert.equal(page.getEl('autoRouteReason').textContent, 'Reason: owns the current implementation context and is Working.');
  assert.equal(page.getEl('autoRouteAlternativeBtn').hidden, false);
  assert.equal(page.getEl('autoRouteAlternativeBtn').textContent, 'Use Claude 2 with latest report');
  assert.equal(page.getEl('dispatchBtn').textContent, 'Queue for Claude 1', 'a busy owner never locks Dispatch in AUTO');
  const preview = posts.find((p) => p.url === '/api/route/preview');
  assert.equal(preview.body.incomingReportPath, REPORT.path, 'the report being viewed is sent as context');

  // The one alternative.
  for (const fn of page.getEl('autoRouteAlternativeBtn').listeners.click || []) fn();
  await wait(50);
  assert.equal(page.getEl('autoRoutePlayer').textContent, 'Claude 2');
  assert.match(page.getEl('autoRouteReason').textContent, /^Reason: Claude 1 owns the context but is busy; the latest report is enough for a safe handoff\. Sends Architecture-Amendment\.md as context\.$/);

  // Dispatch carries exactly the staged context and choice.
  for (const fn of page.getEl('dispatchBtn').listeners.click || []) await fn();
  const dispatched = posts.find((p) => p.url === '/api/dispatch');
  assert.deepEqual({ mode: dispatched.body.routingMode, report: dispatched.body.incomingReportPath, choice: dispatched.body.routeChoice }, { mode: 'auto', report: REPORT.path, choice: 'handoff' });
});
