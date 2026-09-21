import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseReportProvenance } from '../out/report-provenance.js';
import { runScoutFormation } from '../out/scout-formation.js';
import { ScoutPlayerAdapter } from '../out/scout-player.js';
import {
  SCOUT_WORK_LANE,
  ensureScoutIntelligenceRoot,
  resolveDevelopmentScoutIntelligenceRoot,
  resolveScoutIntelligenceRoot,
  resolveScoutWorkRoot
} from '../out/scout-intelligence-root.js';
import { StadiumClient } from '../out/stadium-client.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-work-root-'));
  const scoutRoot = path.join(root, 'Scout Intelligence');
  ensureScoutIntelligenceRoot(scoutRoot);
  const makeGame = (name) => {
    const gameRoot = path.join(root, name);
    fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), `export const game = '${name}';\n`);
    fs.writeFileSync(path.join(gameRoot, 'package.json'), `{"name":"${name}"}\n`);
    return gameRoot;
  };
  return { root, scoutRoot, makeGame, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Every file under `dir` with its content hash — proves not one byte of a Game changed. */
function snapshot(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { out[`${path.relative(dir, full)}/`] = 'dir'; walk(full); }
      else out[path.relative(dir, full)] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

const inside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

function report(label) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee src/example.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/example.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
}

/** Behaves like a provider harness: reads the Game as its target and writes its temp material into its own playerPath. */
function fakeCandidate(id, seen) {
  return {
    id, player: `Player-${id}`, provider: `Provider-${id}`,
    eligible: () => ({ eligible: true, reason: 'fixture' }),
    createExecutor: () => ({
      id, player: `Player-${id}`, harness: `harness-${id}`, provider: `Provider-${id}`,
      async execute(envelope, context) {
        seen?.push({ id, gameRoot: context.gameRoot, playerPath: context.playerPath, playGameRoot: envelope.play.gameRoot });
        fs.readFileSync(path.join(context.gameRoot, 'src', 'example.ts'), 'utf8'); // read-only use of the target
        fs.mkdirSync(path.join(context.playerPath, '.opencode-combine-data'), { recursive: true });
        fs.writeFileSync(path.join(context.playerPath, '.opencode-combine-data', 'provider-temp.db'), 'provider temp state');
        if (seen) seen[seen.length - 1].wroteTempStateUnder = path.join(context.playerPath, '.opencode-combine-data', 'provider-temp.db');
        return { state: 'COMPLETE', stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-19T13:00:00.000Z', endedAt: '2026-09-19T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true };
      }
    })
  };
}

const run = (l, gameRoot, at, extra = {}) => runScoutFormation({
  objective: 'Investigate the bounded fixture surface.',
  gameRoot,
  durableReportRoot: l.scoutRoot,
  candidates: [fakeCandidate('one', extra.seen), fakeCandidate('two', extra.seen)],
  formationSize: 2,
  now: () => new Date(at),
  ...extra.request
});

// --- The default: Work lane, derived from the Scout root, never from the Game --------------

test('Work-1. The Work root is derived only from the Scout Intelligence root', () => {
  assert.equal(SCOUT_WORK_LANE, 'Work');
  const root = path.join(os.tmpdir(), 'x', 'Scout Intelligence');
  assert.equal(resolveScoutWorkRoot(root), path.join(path.resolve(root), 'Work'));
  assert.equal(resolveScoutWorkRoot(`${root}${path.sep}.${path.sep}`), path.join(path.resolve(root), 'Work'), 'normalized');
  assert.equal(resolveScoutWorkRoot.length, 1, 'takes no Game argument, so it cannot depend on one');
});

test('Work-2. Normal Formation execution puts ALL working state under Work, and the Game stays the target', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    const before = snapshot(game);
    const seen = [];
    const completion = await run(l, game, '2026-09-19T13:00:00.000Z', { seen });
    const work = path.join(l.scoutRoot, 'Work', completion.formationId);

    assert.equal(completion.workspacePath, work, 'the canonical Work/<formationId> workspace');
    assert.equal(inside(completion.workspacePath, game), false, 'the workspace is outside the Game');
    for (const file of ['canonical-play.json', 'semantic-prompt.txt', 'candidates-considered.json', 'FORMATION-COMPLETE.json', 'FORMATION-RESULT.md']) {
      assert.ok(fs.existsSync(path.join(work, file)), `${file} is under Work`);
    }
    for (const id of ['one', 'two']) {
      for (const file of ['stdout.log', 'stderr.log', 'telemetry.json', 'SCOUT-REPORT.md']) {
        assert.ok(fs.existsSync(path.join(work, id, file)), `${id}/${file} (logs, telemetry, report) is under Work`);
      }
    }
    // The fake provider wrote temp state into its assigned folder (asserted below to be under Work).
    // Since S37 a COMPLETED receiver's disposable data folder is removed once its durable outputs exist,
    // so the end state is evidence-only; the retention tests own that rule.
    for (const id of ['one', 'two']) {
      assert.equal(fs.existsSync(path.join(work, id, '.opencode-combine-data')), false, `${id}: completed receiver's disposable provider data is gone`);
    }

    // The Game is still each receiver's target: scope/cwd, and the Play's declared gameRoot.
    assert.equal(seen.length, 2);
    for (const entry of seen) {
      assert.equal(entry.gameRoot, path.resolve(game), 'reconnaissance target is unchanged');
      assert.equal(entry.playGameRoot, path.resolve(game));
      assert.equal(inside(entry.playerPath, game), false, 'each receiver\'s private working folder is outside the Game');
      assert.equal(inside(entry.playerPath, path.join(l.scoutRoot, 'Work')), true);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'canonical-play.json'), 'utf8')).gameRoot, path.resolve(game), 'Game identity is recorded as the target');
    assert.equal(completion.gameRoot, path.resolve(game));

    // Nothing was written into the Game — not a folder, not a byte.
    assert.equal(fs.existsSync(path.join(game, 'Scouts')), false, 'no <Game>/Scouts workspace is created');
    assert.deepEqual(snapshot(game), before, 'no Game file was added, changed, or removed');
  } finally { l.cleanup(); }
});

test('Work-3. Durable evidence is unchanged: parent and children stay under Formations, separate from Work, and S35 provenance holds', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    const completion = await runScoutFormationFor(l, game, 'game_work_a', 'play_work');
    const durable = path.join(l.scoutRoot, 'Formations', completion.formationId);

    assert.equal(completion.durablePath, durable);
    assert.equal(completion.resultPath, path.join(durable, 'FORMATION-RESULT.md'));
    assert.notEqual(completion.workspacePath, completion.durablePath, 'Work and Formations are not merged');
    assert.equal(inside(completion.durablePath, path.join(l.scoutRoot, 'Work')), false);

    const parent = fs.readFileSync(completion.resultPath, 'utf8');
    assert.deepEqual(JSON.parse(JSON.stringify(parseReportProvenance(parent))), {
      gameId: 'game_work_a', clientRef: 'play_work', playerInstanceId: 'scout', playerType: 'scout',
      provider: 'scout-formation', at: completion.endedAt
    }, 'S35 self-describing provenance is unchanged');
    assert.deepEqual(completion.children, ['one-SCOUT-REPORT.md', 'two-SCOUT-REPORT.md']);
    for (const child of completion.children) {
      assert.ok(fs.existsSync(path.join(durable, child)), 'child references still resolve inside the durable Formation folder');
    }
    assert.equal(fs.readFileSync(path.join(completion.workspacePath, 'FORMATION-RESULT.md'), 'utf8'), parent, 'existing workspace copy behavior is preserved');
    assert.equal(fs.existsSync(path.join(game, 'Scouts')), false);
  } finally { l.cleanup(); }
});

function runScoutFormationFor(l, game, gameId, clientRef) {
  return run(l, game, '2026-09-19T13:30:00.000Z', { request: { reportAttribution: { gameId, clientRef } } });
}

// --- Explicit override is still honored ------------------------------------------------------

test('Work-4. An explicit workspaceRoot override still wins, and durable evidence is unaffected by it', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    const custom = path.join(l.root, 'Diagnostic Workspaces');
    const completion = await run(l, game, '2026-09-19T13:00:00.000Z', { request: { workspaceRoot: custom } });
    assert.equal(completion.workspacePath, path.join(custom, completion.formationId));
    assert.equal(fs.existsSync(path.join(l.scoutRoot, 'Work', completion.formationId)), false, 'the default lane is not also used');
    assert.equal(completion.durablePath, path.join(l.scoutRoot, 'Formations', completion.formationId));
    assert.equal(fs.existsSync(path.join(game, 'Scouts')), false);
  } finally { l.cleanup(); }
});

// --- Two Games sharing one Scout department --------------------------------------------------

test('Work-5. Two Games share one Work root without sharing a workspace, and neither Game is touched', async () => {
  const l = layout();
  try {
    const gameA = l.makeGame('GameA');
    const gameB = l.makeGame('GameB');
    const [beforeA, beforeB] = [snapshot(gameA), snapshot(gameB)];
    const a = await run(l, gameA, '2026-09-19T13:00:00.000Z');
    const b = await run(l, gameB, '2026-09-19T13:00:00.001Z');

    assert.notEqual(a.formationId, b.formationId);
    assert.notEqual(a.workspacePath, b.workspacePath);
    assert.equal(path.dirname(a.workspacePath), path.dirname(b.workspacePath), 'one shared Work root');
    assert.equal(path.dirname(a.workspacePath), path.join(l.scoutRoot, 'Work'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(a.workspacePath, 'canonical-play.json'), 'utf8')).gameRoot, path.resolve(gameA));
    assert.equal(JSON.parse(fs.readFileSync(path.join(b.workspacePath, 'canonical-play.json'), 'utf8')).gameRoot, path.resolve(gameB));
    assert.deepEqual([snapshot(gameA), snapshot(gameB)], [beforeA, beforeB]);
    assert.equal(fs.existsSync(path.join(gameA, 'Scouts')) || fs.existsSync(path.join(gameB, 'Scouts')), false);
  } finally { l.cleanup(); }
});

test('Work-5b. If two Games ever produce the SAME Formation id, the second fails closed and the first Game\'s working state is untouched', async () => {
  const l = layout();
  try {
    const gameA = l.makeGame('GameA');
    const gameB = l.makeGame('GameB');
    const at = '2026-09-19T13:00:00.000Z';
    const a = await run(l, gameA, at);
    const workBefore = snapshot(a.workspacePath);
    const durableBefore = snapshot(a.durablePath);
    await assert.rejects(() => run(l, gameB, at), /Formation workspace already exists/);
    assert.deepEqual(snapshot(a.workspacePath), workBefore, 'Game A\'s working state is intact');
    assert.deepEqual(snapshot(a.durablePath), durableBefore, 'Game A\'s durable evidence is intact');
    assert.equal(JSON.parse(fs.readFileSync(path.join(a.workspacePath, 'canonical-play.json'), 'utf8')).gameRoot, path.resolve(gameA));
    assert.equal(fs.existsSync(path.join(gameB, 'Scouts')), false, 'and Game B is not used as a fallback');
  } finally { l.cleanup(); }
});

// --- Historical Game-local folders are left alone --------------------------------------------

test('Work-6. A historical <Game>/Scouts folder is neither migrated, modified, nor added to', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    fs.mkdirSync(path.join(game, 'Scouts', 'Scout-Formation__2026-09-01_000000_000_MDT'), { recursive: true });
    fs.writeFileSync(path.join(game, 'Scouts', 'Scout-Formation__2026-09-01_000000_000_MDT', 'telemetry.json'), '{"historical":true}');
    const before = snapshot(game);
    await run(l, game, '2026-09-19T13:00:00.000Z');
    assert.deepEqual(snapshot(game), before, 'existing evidence is preserved exactly and nothing new appears beside it');
  } finally { l.cleanup(); }
});

// --- The real product wiring ------------------------------------------------------------------

test('Work-7. Product path: the Scout adapter with only the canonical root uses Work, for MANUAL/AUTO and the Dev Mode one-receiver operator alike', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    const before = snapshot(game);
    const adapter = new ScoutPlayerAdapter({
      durableReportRoot: () => l.scoutRoot, // exactly what extension.ts supplies; NO workspaceRoot
      candidates: [fakeCandidate('one'), fakeCandidate('two')],
      now: () => 1
    });
    const normal = await adapter.execute('Investigate the bounded fixture surface.', game);
    assert.equal(path.dirname(normal.formation.workspacePath), path.join(l.scoutRoot, 'Work'));
    assert.equal(inside(normal.formation.workspacePath, game), false);

    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct Formation id
    const operator = await adapter.execute('Investigate the bounded fixture surface.', game, { players: ['one'] });
    assert.equal(operator.formation.scoutsRequested, 1, 'the Dev Mode explicit single-receiver path');
    assert.equal(path.dirname(operator.formation.workspacePath), path.join(l.scoutRoot, 'Work'));

    assert.deepEqual(snapshot(game), before);
    assert.equal(fs.existsSync(path.join(game, 'Scouts')), false);
  } finally { l.cleanup(); }
});

test('Work-8. Stadium dispatch with the real adapter: working state under Work, self-describing parent under Formations, Game untouched', async () => {
  const l = layout();
  try {
    const game = l.makeGame('GameA');
    const before = snapshot(game);
    const frames = [];
    const client = new StadiumClient({
      autoReconnect: false,
      gameContextGetter: () => ({
        game: { gameId: 'game_work_a', displayName: 'Work Game', fingerprintSource: 'test' },
        stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
        binding: { gameId: 'game_work_a', stadiumId: 'stadium', rootFsPath: game, boundAt: Date.now(), isPrimary: true, status: 'bound' }
      }),
      scoutPlayer: new ScoutPlayerAdapter({ durableReportRoot: () => l.scoutRoot, candidates: [fakeCandidate('one'), fakeCandidate('two')] })
    });
    client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
    client.connected = true;
    await client.deliverScout({ clientRef: 'play_stadium', stadiumId: client.stadiumId, gameId: 'game_work_a', playerInstanceId: 'scout', prompt: 'Investigate the bounded fixture surface.' });

    const terminal = frames.filter((f) => f.method === 'turn.changed').map((f) => f.params.turn).find((turn) => turn.formationId);
    assert.ok(terminal, 'the Formation completed through the Stadium');
    const parentPath = terminal.reportPath;
    assert.equal(parentPath, path.join(l.scoutRoot, 'Formations', terminal.formationId, 'FORMATION-RESULT.md'));
    assert.ok(fs.existsSync(path.join(l.scoutRoot, 'Work', terminal.formationId, 'canonical-play.json')));
    assert.equal(parseReportProvenance(fs.readFileSync(parentPath, 'utf8')).clientRef, 'play_stadium');
    const published = frames.filter((f) => f.method === 'report.changed').at(-1).params.reports;
    assert.equal(published.filter((r) => r.path === parentPath).length, 1, 'still exactly one Dad-facing parent');
    assert.deepEqual(snapshot(game), before);
  } finally { l.cleanup(); }
});

// --- Wiring guards: no Game-derived default can creep back -------------------------------------

test('Work-9. Source contract: no Formation default is derived from the Game, and the product and CLI omit the override', () => {
  const formation = fs.readFileSync(path.join(repoRoot, 'src', 'scout-formation.ts'), 'utf8');
  assert.match(formation, /request\.workspaceRoot \?\? resolveScoutWorkRoot\(request\.durableReportRoot\)/);
  assert.ok(!/path\.join\(envelope\.play\.gameRoot, 'Scouts'\)/.test(formation), 'the Game-local fallback is gone from Formation');

  const extension = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
  assert.match(extension, /durableReportRoot: \(\) => scoutDurableReportRoot/);
  assert.ok(!/workspaceRoot:/.test(extension.slice(extension.indexOf('new ScoutPlayerAdapter'), extension.indexOf('new ScoutPlayerAdapter') + 400)), 'the product does not override the working root');

  const cli = fs.readFileSync(path.join(repoRoot, 'tools', 'scouts', 'run-scout-formation.mjs'), 'utf8');
  assert.match(cli, /resolveDevelopmentScoutIntelligenceRoot\(\)/);
  assert.match(cli, /runScoutFormation\(\{ objective, gameRoot, durableReportRoot, players, formationSize \}\)/, 'no game-derived workspaceRoot is passed');
});

test('Work-10. Development resolves one shared Work root; installed product resolves under global storage, both outside any Game', () => {
  const dev = resolveDevelopmentScoutIntelligenceRoot({ env: {}, homeDir: path.join(os.tmpdir(), 'home') });
  assert.equal(resolveScoutWorkRoot(dev), path.join(os.tmpdir(), 'home', '.sideline', 'Scout Intelligence', 'Work'));
  const override = path.join(os.tmpdir(), 'shared-dev-root');
  assert.equal(resolveScoutWorkRoot(resolveDevelopmentScoutIntelligenceRoot({ env: { SIDELINE_SCOUT_INTELLIGENCE_ROOT: override } })), path.join(override, 'Work'), 'the harness override is honored');
  // Installed product: under the extension's global storage, independent of every Game and of the dev override.
  const storage = path.join(os.tmpdir(), 'globalStorage', 'local.sideline-coach');
  const product = resolveScoutIntelligenceRoot({ extensionMode: 1, globalStorageFsPath: storage, env: { SIDELINE_SCOUT_INTELLIGENCE_ROOT: override } });
  assert.equal(resolveScoutWorkRoot(product), path.join(storage, 'Scout Intelligence', 'Work'));
  assert.equal(inside(resolveScoutWorkRoot(product), path.join(os.tmpdir(), 'SomeGame')), false);
});
