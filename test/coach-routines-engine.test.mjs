/** Coach Routines V0 Slices A+B — pure domain, persistence and cadence proof. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CoachRoutineEngine,
  DAY_MS,
  RoutineValidationError,
  buildStrategyBoardEnvelope,
  fileCoachRoutineStore,
  normalizeRoutineSourcePath
} from '../out/control-plane/coach-routines.js';

const GAME_A = 'game_routines_a';
const GAME_B = 'game_routines_b';
const source = { path: 'Project SOP/NORTH-STAR.md', kind: 'file' };
const canonical = (overrides = {}) => ({
  name: 'Canonical Refresh',
  template: 'canonical-refresh',
  enabled: true,
  cadence: { kind: 'plays', every: 5 },
  targets: { strategyBoard: true, players: false },
  sources: [source],
  includeLocalRoot: true,
  ...overrides
});
const memoryStore = (initial) => {
  let value = initial;
  return { load: () => value, save: (next) => { value = structuredClone(next); }, read: () => structuredClone(value) };
};
const confirmCanonicalSource = (engine, gameId, checkedAt = Date.now()) => engine.recordSourceCheck(gameId, checkedAt, [
  { path: source.path, state: 'file' }
]);

test('Coach Routines A1: every-N cadence is baseline-relative, stays due, and resets only on delivery', () => {
  let now = 1_000;
  const engine = new CoachRoutineEngine(memoryStore(), () => now);
  const routine = engine.create(GAME_A, canonical());
  confirmCanonicalSource(engine, GAME_A);
  for (let n = 1; n < 5; n++) {
    assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: `p${n}` }), true);
    assert.equal(engine.project(GAME_A, true).routines[0].due, false);
  }
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p5' });
  const due = engine.project(GAME_A, true);
  assert.equal(due.routines[0].due, true);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p6' });
  assert.equal(engine.project(GAME_A, true).routines[0].due, true, 'due persists past the boundary');
  now++;
  assert.deepEqual(engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: engine.project(GAME_A, true).routines[0].cycle }], 'copy-report'), {
    found: true, changed: true, alreadyDelivered: false, stale: false
  });
  assert.equal(engine.project(GAME_A, true).routines[0].due, false);
  assert.match(engine.project(GAME_A, true).routines[0].nextLabel, /in 5 Plays/);
});

test('Coach Routines A2: N=1 and cadence edits re-evaluate from the original/current baseline', () => {
  const engine = new CoachRoutineEngine();
  const one = engine.create(GAME_A, canonical({ cadence: { kind: 'plays', every: 1 } }));
  confirmCanonicalSource(engine, GAME_A);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'one' });
  assert.equal(engine.project(GAME_A, true).routines.find((view) => view.id === one.id).due, true);
  const five = engine.create(GAME_A, canonical({ name: 'Changed cadence', cadence: { kind: 'plays', every: 5 } }));
  confirmCanonicalSource(engine, GAME_A, Date.now() + 1);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'two' });
  assert.equal(engine.project(GAME_A, true).routines.find((view) => view.id === five.id).due, false);
  engine.update(GAME_A, five.id, { cadence: { kind: 'plays', every: 1 } });
  assert.equal(engine.project(GAME_A, true).routines.find((view) => view.id === five.id).due, true);
});

test('Coach Routines A3: received, unknown and queued count once; failure, release, retry and direct shell do not', () => {
  const engine = new CoachRoutineEngine();
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'received' }), true);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'unknown', clientRef: 'unknown' }), true);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'queued', queueItemId: 'q1' }), true);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'failed', clientRef: 'failed' }), false);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'released', queueRelease: true }), false);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'queued', queueItemId: 'q1' }), false, 'queue retry/deduplication');
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'shell', executionType: 'direct-shell' }), false);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'terminal', playerType: 'terminal' }), false);
  assert.equal(engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'received' }), false);
  assert.equal(engine.forGame(GAME_A).playCount, 3);
});

test('Coach Routines A4: counted refs are bounded while the lifetime count remains monotonic', () => {
  const engine = new CoachRoutineEngine();
  for (let i = 0; i < 225; i++) engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: `p${i}` });
  const game = engine.forGame(GAME_A);
  assert.equal(game.playCount, 225);
  assert.equal(game.countedRefs.length, 200);
  assert.equal(game.countedRefs[0], 'play:p25');
});

test('Coach Routines A5: independent routines, disabled state and Dev Mode pause preserve earned counters', () => {
  const engine = new CoachRoutineEngine();
  const fast = engine.create(GAME_A, canonical({ name: 'Fast', cadence: { kind: 'plays', every: 2 } }));
  const slow = engine.create(GAME_A, canonical({ name: 'Slow', cadence: { kind: 'plays', every: 3 } }));
  confirmCanonicalSource(engine, GAME_A);
  engine.update(GAME_A, slow.id, { enabled: false });
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p1' });
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p2' });
  assert.equal(engine.project(GAME_A, false).handoff, undefined);
  assert.equal(engine.project(GAME_A, false).routines.find((view) => view.id === fast.id).due, false);
  assert.equal(engine.project(GAME_A, true).routines.find((view) => view.id === fast.id).due, true);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p3' });
  assert.equal(engine.project(GAME_A, true).routines.find((view) => view.id === slow.id).due, false, 'disabled stays quiet');
});

test('Coach Routines A6: first Dev Mode enable creates one truthful amended default and deletion is durable intent', () => {
  const engine = new CoachRoutineEngine();
  const created = engine.initializeDevModeDefaults(GAME_A);
  assert.ok(created);
  assert.deepEqual({
    name: created.name, enabled: created.enabled, cadence: created.cadence, targets: created.targets, sources: created.sources
  }, {
    name: 'Canonical Refresh', enabled: true, cadence: { kind: 'plays', every: 5 },
    targets: { strategyBoard: true, players: false }, sources: []
  });
  const projected = engine.project(GAME_A, true);
  assert.equal(projected.routines[0].needs, 'sources');
  assert.equal(projected.routines[0].due, false);
  assert.equal(projected.handoff, undefined, 'missing sources never become a false directive');
  assert.equal(engine.initializeDevModeDefaults(GAME_A), undefined);
  assert.equal(engine.remove(GAME_A, created.id), true);
  assert.equal(engine.initializeDevModeDefaults(GAME_A), undefined, 'toggle cannot resurrect a deleted default');
  assert.equal(engine.forGame(GAME_A).routines.length, 0);
});

test('Coach Routines A7: an existing routine makes first-enable initialization a marker, not duplication', () => {
  const engine = new CoachRoutineEngine();
  engine.create(GAME_A, canonical({ name: 'Human routine' }));
  assert.equal(engine.initializeDevModeDefaults(GAME_A), undefined);
  assert.deepEqual(engine.forGame(GAME_A).routines.map((routine) => routine.name), ['Human routine']);
  assert.equal(engine.forGame(GAME_A).defaultsInitialized, true);
});

test('Coach Routines A8: manual Due is explicit, persists until delivered, and clears only on delivery', () => {
  const engine = new CoachRoutineEngine();
  const routine = engine.create(GAME_A, canonical());
  confirmCanonicalSource(engine, GAME_A);
  engine.markDue(GAME_A, routine.id);
  const due = engine.project(GAME_A, true).routines[0];
  assert.equal(due.due, true);
  engine.project(GAME_A, true);
  assert.equal(engine.project(GAME_A, true).routines[0].due, true, 'projection never consumes');
  engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: due.cycle }], 'strategy-board-send');
  assert.equal(engine.project(GAME_A, true).routines[0].due, false);
});

test('Coach Routines A9: lazy day cadence uses Control Plane time and creates no scheduler', () => {
  let now = 10_000;
  const engine = new CoachRoutineEngine(memoryStore(), () => now);
  engine.create(GAME_A, canonical({ cadence: { kind: 'time', everyMs: 2 * DAY_MS } }));
  confirmCanonicalSource(engine, GAME_A);
  now += 2 * DAY_MS - 1;
  assert.equal(engine.project(GAME_A, true).routines[0].due, false);
  now += 1;
  assert.equal(engine.project(GAME_A, true).routines[0].due, true);
  const moduleText = fs.readFileSync(path.resolve('src/control-plane/coach-routines.ts'), 'utf8');
  assert.doesNotMatch(moduleText, /setInterval|setTimeout/, 'domain uses lazy evaluation only');
});

test('Coach Routines A10: cycle delivery is idempotent and a stale cycle cannot consume newer due truth', () => {
  let now = 1;
  const engine = new CoachRoutineEngine(memoryStore(), () => now);
  const routine = engine.create(GAME_A, canonical({ cadence: { kind: 'plays', every: 1 } }));
  confirmCanonicalSource(engine, GAME_A);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p1' });
  const cycle1 = engine.project(GAME_A, true).routines[0].cycle;
  now++;
  assert.equal(engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: cycle1 }], 'copy-report').changed, true);
  assert.equal(engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: cycle1 }], 'copy-report').alreadyDelivered, true);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'p2' });
  assert.equal(engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: 'wrong-cycle' }], 'copy-report').stale, true);
  assert.equal(engine.project(GAME_A, true).routines[0].due, true);
});

test('Coach Routines A11: all counters, definitions and deliveries are isolated by exact Game', () => {
  const engine = new CoachRoutineEngine();
  const a = engine.create(GAME_A, canonical({ cadence: { kind: 'plays', every: 1 } }));
  const b = engine.create(GAME_B, canonical({ name: 'Game B', cadence: { kind: 'plays', every: 1 } }));
  confirmCanonicalSource(engine, GAME_A);
  confirmCanonicalSource(engine, GAME_B);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'same-ref' });
  assert.equal(engine.project(GAME_A, true).routines[0].due, true);
  assert.equal(engine.project(GAME_B, true).routines[0].due, false);
  const wrong = engine.markDelivered(GAME_B, [{ routineId: a.id, cycle: engine.project(GAME_A, true).routines[0].cycle }], 'copy-report');
  assert.equal(wrong.found, false);
  engine.observePlay({ gameId: GAME_B, kind: 'received', clientRef: 'same-ref' });
  assert.equal(engine.project(GAME_B, true).routines.find((view) => view.id === b.id).due, true);
});

test('Coach Routines A12: source syntax is forgiving about separators and strict about boundaries/secrets', () => {
  assert.equal(normalizeRoutineSourcePath('.\\Project SOP\\NORTH-STAR.md'), 'Project SOP/NORTH-STAR.md');
  for (const invalid of ['', '../outside.md', 'C:\\secret.md', '\\\\server\\share', '/absolute', '.git/config', 'node_modules/x', '.env', 'certs/key.pem']) {
    assert.throws(() => normalizeRoutineSourcePath(invalid), RoutineValidationError, invalid);
  }
  assert.throws(() => new CoachRoutineEngine().create(GAME_A, canonical({ cadence: { kind: 'plays', every: 101 } })), RoutineValidationError);
  assert.throws(() => new CoachRoutineEngine().create(GAME_A, canonical({ sources: [source, source] })), RoutineValidationError);
});

test('Coach Routines A13: envelope is plain, bounded, source-deduped and never embeds source contents or machine ids', () => {
  const engine = new CoachRoutineEngine();
  engine.create(GAME_A, canonical({ cadence: { kind: 'plays', every: 1 }, instruction: 'Reconcile architecture.' }));
  engine.create(GAME_A, canonical({ name: 'Map', template: 'map-check', cadence: { kind: 'plays', every: 1 } }));
  confirmCanonicalSource(engine, GAME_A);
  engine.observePlay({ gameId: GAME_A, kind: 'received', clientRef: 'private-ref' });
  const projection = engine.project(GAME_A, true, {
    displayName: 'Sideline Coach', repoUri: 'git@github.com:owner/SidelineCoach.git', branch: 'work', rootFsPath: 'C:/repo'
  });
  assert.ok(projection.handoff);
  assert.equal((projection.handoff.text.match(/Project SOP\/NORTH-STAR\.md/g) ?? []).length, 1);
  assert.match(projection.handoff.text, /Game: Sideline Coach/);
  assert.match(projection.handoff.text, /github\.com\/owner\/SidelineCoach/);
  assert.doesNotMatch(projection.handoff.text, /private-ref|rt_[a-f0-9]+|source file contents/i);
  assert.ok(projection.handoff.text.length <= 12_000);
  assert.equal(buildStrategyBoardEnvelope(engine.project(GAME_A, true).routines.filter((view) => view.due), {} ).includes('Repository:'), false);
});

test('Coach Routines A14: atomic store survives restart and preserves the future exact-Player seam', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-store-'));
  const file = path.join(dir, 'coach-routines.json');
  const first = new CoachRoutineEngine(fileCoachRoutineStore(file));
  const routine = first.create(GAME_A, canonical({ playersScope: { mode: 'selected', instanceIds: ['claude-exact'], onFirstPlay: true } }));
  first.observePlay({ gameId: GAME_A, kind: 'unknown', clientRef: 'persisted' });
  first.flush();
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.readdirSync(dir).some((name) => name.endsWith('.tmp')), false);
  const restored = new CoachRoutineEngine(fileCoachRoutineStore(file));
  assert.equal(restored.forGame(GAME_A).playCount, 1);
  assert.deepEqual(restored.forGame(GAME_A).routines.find((item) => item.id === routine.id).playersScope, {
    mode: 'selected', instanceIds: ['claude-exact'], onFirstPlay: true
  });
});

test('Coach Routines A15: corrupt and unsupported stores are retained for diagnostics and never crash Coach', () => {
  for (const [name, contents] of [['corrupt', '{nope'], ['unsupported', JSON.stringify({ version: 99, games: {} })]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `coach-routines-${name}-`));
    const file = path.join(dir, 'coach-routines.json');
    fs.writeFileSync(file, contents);
    const warnings = [];
    const engine = new CoachRoutineEngine(fileCoachRoutineStore(file, (message) => warnings.push(message)));
    assert.equal(engine.forGame(GAME_A).playCount, 0);
    assert.equal(fs.existsSync(`${file}.bak`), true);
    assert.ok(warnings.length > 0);
  }
});

test('Coach Routines A16: routine mutation never edits a Player report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-routines-report-'));
  const report = path.join(dir, 'Report.md');
  fs.writeFileSync(report, '# Player report\n\nUntouched.\n');
  const before = fs.readFileSync(report);
  const engine = new CoachRoutineEngine(fileCoachRoutineStore(path.join(dir, 'coach-routines.json')));
  const routine = engine.create(GAME_A, canonical());
  engine.markDue(GAME_A, routine.id);
  const due = engine.project(GAME_A, true).routines[0];
  engine.markDelivered(GAME_A, [{ routineId: routine.id, cycle: due.cycle }], 'copy-report', 'Reports/Player/Report.md');
  engine.flush();
  assert.deepEqual(fs.readFileSync(report), before);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'coach-routines.json'), 'utf8'), /Player report|Untouched/);
});
