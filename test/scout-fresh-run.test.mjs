/**
 * S54.1 — runner-owned fresh runs. Dad runs the Play; the runner owns Play identity.
 * `--fresh` derives a new unique playId, never touches the manifest or any earlier evidence.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deriveFreshPlayId, parseScoutManifest, runScoutPlay, SCOUT_ROSTER } from '../out/scout-play-runner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repoRoot, 'tools', 'scouts', 'run-scout-play.mjs');

/** A Game whose `run.js` stands in for `opencode run …` (node is launched as `node run --agent …` in the Game root). */
function lab() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));
  const gameRoot = path.join(root, 'Game With Spaces');
  fs.mkdirSync(path.join(gameRoot, '.opencode', 'agents'), { recursive: true });
  for (const [agent, model] of Object.entries(SCOUT_ROSTER)) {
    fs.writeFileSync(path.join(gameRoot, '.opencode', 'agents', `${agent}.md`), `---\nmode: primary\nmodel: ${model}\npermission:\n  "*": deny\n  read:\n    "*": allow\n  glob: allow\n  grep: allow\n  list: allow\n  external_directory: deny\n---\nRead only.\n`);
  }
  fs.writeFileSync(path.join(gameRoot, 'run.js'), 'process.stdout.write("# RESULT\\nScout answer.\\n# FACT\\nA fact.\\n");\n');
  return { root, gameRoot, workspaceRoot: path.join(root, 'Work'), reportsRoot: path.join(root, 'Scout Intelligence'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const OBJECTIVES = { 'scout-a-settings': 'READ-ONLY. Map settings, "quotes" and — unicode. LANE A.', 'scout-b-routing': 'READ-ONLY. Map routing.\nSecond line of LANE B.' };
const manifestFor = (l, playId) => ({ playId, gameRoot: l.gameRoot, maxConcurrency: 2, scouts: [
  { id: 'scout-a-settings', agent: 'sideline-scout-quick', objective: OBJECTIVES['scout-a-settings'] },
  { id: 'scout-b-routing', agent: 'sideline-scout', objective: OBJECTIVES['scout-b-routing'] }
] });

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
/** Every file under a folder -> content hash. Detects any change, addition or removal. */
function snapshot(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full); else out[path.relative(dir, full)] = sha(fs.readFileSync(full));
    }
  };
  walk(dir);
  return out;
}

function runCli(l, manifest, extra = []) {
  return spawnSync(process.execPath, [CLI, '--manifest', manifest, '--workspace-root', l.workspaceRoot, '--reports-root', l.reportsRoot, '--opencode', process.execPath, ...extra], { encoding: 'utf8', timeout: 60_000 });
}
const outLines = (run) => run.stdout.split(/\r?\n/).filter((line) => line.length);
const finalPath = (run) => outLines(run).at(-1);

test('FRESH-A..G. Reuse of a playId still refuses; --fresh derives a new id and runs the same lanes; the manifest and all old evidence stay byte-identical; the handoff is one final clickable path', { timeout: 180_000 }, () => {
  const l = lab();
  try {
    const manifest = path.join(l.root, 'terminal-ux-routing-recon.json');
    fs.writeFileSync(manifest, `${JSON.stringify(manifestFor(l, 'recon-20260920-113635'), null, 2)}\n`);
    const manifestBytes = sha(fs.readFileSync(manifest));

    // First run under the manifest's own id.
    const first = runCli(l, manifest);
    assert.equal(first.status, 0, first.stderr);
    const originalReport = path.join(l.reportsRoot, 'recon-20260920-113635', 'FORMATION-RESULT.md');
    assert.equal(finalPath(first), `${originalReport}:1`);
    const oldWorkspace = snapshot(path.join(l.workspaceRoot, 'recon-20260920-113635'));
    const oldEvidence = snapshot(path.join(l.reportsRoot, 'recon-20260920-113635'));

    // A. Normal invocation with an existing playId still refuses to overwrite — and says how to proceed.
    const refused = runCli(l, manifest);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Play workspace already exists/);
    assert.match(refused.stderr, /Nothing was overwritten/);
    assert.match(refused.stderr, /--fresh/);
    assert.doesNotMatch(refused.stderr, /\n\s+at /, 'a plain message, not a stack trace');
    assert.equal(refused.stdout.trim(), '', 'no false handoff on a refusal');
    assert.deepEqual(snapshot(path.join(l.workspaceRoot, 'recon-20260920-113635')), oldWorkspace, 'refusal touched nothing');

    // B. The same manifest with --fresh: derived id, runs.
    const fresh = runCli(l, manifest, ['--fresh']);
    assert.equal(fresh.status, 0, fresh.stderr);
    const derived = /FRESH RUN: playId (\S+) \(a new run of recon-20260920-113635; earlier evidence is untouched\)/.exec(fresh.stderr)?.[1];
    assert.match(derived ?? '', /^recon-20260920-113635-fresh-\d{8}-\d{6}(-\d+)?$/, 'the human is told the actual derived playId');

    // G. Exactly one clickable master-report path, and it is the final line.
    const derivedReport = path.join(l.reportsRoot, derived, 'FORMATION-RESULT.md');
    assert.equal(finalPath(fresh), `${derivedReport}:1`);
    assert.notEqual(derivedReport, originalReport);
    assert.equal(outLines(fresh).filter((line) => /FORMATION-RESULT\.md/.test(line)).length, 1);
    assert.match(outLines(fresh)[0], /^FORMATION COMPLETE · 2\/2 lanes completed/);
    assert.equal(fs.existsSync(derivedReport), true);
    assert.match(fs.readFileSync(derivedReport, 'utf8'), /Rerun of: recon-20260920-113635 \(earlier evidence untouched\)/);

    // C. The source manifest is unchanged, byte for byte.
    assert.equal(sha(fs.readFileSync(manifest)), manifestBytes);
    // D. The old workspace and old evidence are unchanged, byte for byte (none added, none altered).
    assert.deepEqual(snapshot(path.join(l.workspaceRoot, 'recon-20260920-113635')), oldWorkspace);
    assert.deepEqual(snapshot(path.join(l.reportsRoot, 'recon-20260920-113635')), oldEvidence);

    // E. Identical lanes: objectives (byte-exact, incl. quotes/unicode/newline), agents, Game, concurrency.
    const play = JSON.parse(fs.readFileSync(path.join(l.workspaceRoot, derived, 'play.json'), 'utf8'));
    assert.equal(play.playId, derived);
    assert.equal(play.rerunOf, 'recon-20260920-113635');
    assert.equal(play.maxConcurrency, 2);
    assert.equal(play.gameRoot, l.gameRoot);
    assert.deepEqual(play.scouts.map((s) => [s.id, s.agent]), [['scout-a-settings', 'sideline-scout-quick'], ['scout-b-routing', 'sideline-scout']]);
    for (const [id, objective] of Object.entries(OBJECTIVES)) {
      assert.equal(fs.readFileSync(path.join(l.workspaceRoot, derived, id, 'objective.txt'), 'utf8'), `${objective}\n`);
    }
    const completion = JSON.parse(fs.readFileSync(path.join(l.reportsRoot, derived, 'SCOUT-PLAY-COMPLETE.json'), 'utf8'));
    assert.equal(completion.rerunOf, 'recon-20260920-113635');
    assert.equal(completion.scoutsCompleted, 2);

    // Repeating --fresh right away yields yet another distinct, non-colliding id.
    const again = runCli(l, manifest, ['--fresh']);
    assert.equal(again.status, 0, again.stderr);
    const derivedAgain = /FRESH RUN: playId (\S+)/.exec(again.stderr)[1];
    assert.notEqual(derivedAgain, derived);
    assert.notEqual(derivedAgain, 'recon-20260920-113635');
    assert.equal(sha(fs.readFileSync(manifest)), manifestBytes);
    assert.deepEqual(snapshot(path.join(l.workspaceRoot, 'recon-20260920-113635')), oldWorkspace, 'the original workspace survived two fresh runs');
    assert.deepEqual(snapshot(path.join(l.reportsRoot, 'recon-20260920-113635')), oldEvidence, 'the original evidence survived two fresh runs');
    assert.equal(fs.readdirSync(l.reportsRoot).filter((name) => name.startsWith('recon-')).length, 3, 'three separate evidence folders; none replaced');
  } finally { l.cleanup(); }
});

test('FRESH-F. A UTF-8 BOM manifest (as PowerShell writes) parses; genuine JSON errors name the file', { timeout: 90_000 }, () => {
  const l = lab();
  try {
    const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(JSON.stringify(manifestFor(l, 'bom-play')))]);
    const manifest = path.join(l.root, 'bom.json');
    fs.writeFileSync(manifest, bom);
    assert.deepEqual([...fs.readFileSync(manifest).subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'the fixture really has a BOM');
    const run = runCli(l, manifest, ['--fresh']);
    assert.equal(run.status, 0, run.stderr);
    assert.match(finalPath(run), /FORMATION-RESULT\.md:1$/);
    assert.deepEqual([...fs.readFileSync(manifest).subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'still untouched');

    assert.deepEqual(parseScoutManifest(`\uFEFF{"a":1}`), { a: 1 });
    assert.deepEqual(parseScoutManifest('{"a":1}'), { a: 1 });
    assert.throws(() => parseScoutManifest('{ not json', 'C:\\x\\play.json'), /Could not read C:\\x\\play\.json as JSON/);

    const bad = path.join(l.root, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    const failed = runCli(l, bad);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Could not read .*bad\.json as JSON/);
    assert.doesNotMatch(failed.stderr, /\n\s+at /);
  } finally { l.cleanup(); }
});

test('FRESH-B. deriveFreshPlayId: Calgary-stamped, unique against BOTH workspace and evidence, never stacks suffixes, always a valid id', () => {
  const now = new Date('2026-09-20T20:00:00.000Z'); // 14:00:00 MDT
  const taken = new Set();
  const derive = (playId) => deriveFreshPlayId({ playId, now, taken: (id) => taken.has(id) });
  const first = derive('recon-1');
  assert.equal(first, 'recon-1-fresh-20260920-140000');
  taken.add(first);
  assert.equal(derive('recon-1'), 'recon-1-fresh-20260920-140000-2');
  taken.add('recon-1-fresh-20260920-140000-2');
  assert.equal(derive('recon-1'), 'recon-1-fresh-20260920-140000-3');
  assert.equal(derive('recon-1-fresh-20260101-000000-4'), 'recon-1-fresh-20260920-140000-3', 'a previous fresh suffix is replaced, not stacked');
  const long = derive('x'.repeat(80));
  assert.ok(long.length <= 80 && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(long), `valid and bounded: ${long.length}`);
});

test('FRESH-B2. runScoutPlay({ fresh }) uses the injected clock, reports the derivation, and an occupied evidence folder alone forces a new id', async () => {
  const l = lab();
  try {
    const notes = [];
    const options = { workspaceRoot: l.workspaceRoot, durableReportRoot: l.reportsRoot, now: () => new Date('2026-09-20T20:00:00.000Z'), commandForScout: () => ({ command: process.execPath, args: ['-e', 'process.stdout.write("# RESULT\\nok\\n")'] }), onNote: (m) => notes.push(m), substituteEligibility: () => ({ eligible: false, reason: 'n/a' }) };
    // Occupy only the durable side of the first candidate id.
    fs.mkdirSync(path.join(l.reportsRoot, 'p-fresh-20260920-140000'), { recursive: true });
    const completion = await runScoutPlay(manifestFor(l, 'p'), { ...options, fresh: true });
    assert.equal(completion.playId, 'p-fresh-20260920-140000-2');
    assert.equal(completion.rerunOf, 'p');
    assert.match(notes[0], /FRESH RUN: playId p-fresh-20260920-140000-2 \(a new run of p; /);
    // Without fresh, the same id is refused with guidance, and nothing was created.
    await assert.rejects(() => runScoutPlay(manifestFor(l, 'p-fresh-20260920-140000-2'), options), /already exists[\s\S]*--fresh/);
  } finally { l.cleanup(); }
});
