/**
 * S7.1 — legacy report-glob compatibility hardening (R2 + R3).
 *
 * Field root cause (`REPORTS/Claude/Opus-Multi-Game-Report-Discovery-Regression-
 * Root-Cause.md`): a single configured `coach.reportGlobs` REPLACED the
 * recognized-root defaults for every Game on the machine (R2), and VS Code's own
 * glob include matching is case-sensitive even on Windows, so an on-disk
 * `REPORTS/` never matched a pattern spelled `Reports/` (R3).
 *
 * No vscode import: this exercises the pure policy directly.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recognizedReportRootGlobPatterns, buildReportGlobs } from '../out/report-glob-policy.js';
import { RECOGNIZED_REPORT_ROOT_NAMES } from '../out/game-filesystem-contract.js';

// --- R2: configured globs extend, never replace ---

test('S7.1-1 no configured coach.reportGlobs: recognized defaults remain available', () => {
  const globs = buildReportGlobs([]);
  assert.ok(globs.includes('**/Reports/**/*.{md,txt}'));
  assert.ok(globs.includes('**/Docs REPORT/**/*.{md,txt}'));
  assert.ok(globs.includes('**/Reports-SLC/**/*.{md,txt}'));
});

test('S7.1-2 a configured coach.reportGlobs EXTENDS the defaults instead of replacing them', () => {
  // This is the exact field defect: one user-scope pattern used to silence
  // every recognized default for every Game on the machine.
  const globs = buildReportGlobs(['**/Agent Output/**/*.{md,txt}']);
  assert.ok(globs.includes('**/Agent Output/**/*.{md,txt}'), 'the explicit custom glob is present');
  assert.ok(globs.includes('**/Reports/**/*.{md,txt}'), 'the recognized default is NOT replaced');
  assert.ok(globs.includes('**/Docs REPORT/**/*.{md,txt}'), 'every recognized default survives an explicit override');
});

test('S7.1-3 duplicate configured/default patterns are deterministically deduplicated', () => {
  const globs = buildReportGlobs(['**/Reports/**/*.{md,txt}', '**/Reports/**/*.{md,txt}', '**/Custom/**/*.{md,txt}']);
  const occurrences = globs.filter((glob) => glob === '**/Reports/**/*.{md,txt}').length;
  assert.equal(occurrences, 1, 'a configured pattern identical to a default is not duplicated');
  assert.equal(globs.filter((glob) => glob === '**/Custom/**/*.{md,txt}').length, 1);
  // Deterministic: rebuilding from the same input twice yields the identical array.
  assert.deepEqual(buildReportGlobs(['**/Reports/**/*.{md,txt}', '**/Reports/**/*.{md,txt}', '**/Custom/**/*.{md,txt}']), globs);
});

test('S7.1-4 explicit custom report globs remain supported', () => {
  const globs = buildReportGlobs(['**/Legacy Output/**/*.{md,txt}', '**/Another Custom Root/**/*.{md,txt}']);
  assert.ok(globs.includes('**/Legacy Output/**/*.{md,txt}'));
  assert.ok(globs.includes('**/Another Custom Root/**/*.{md,txt}'));
});

test('S7.1-5 blank/whitespace-only configured entries are ignored, not turned into a match-nothing or match-everything glob', () => {
  const globs = buildReportGlobs(['', '   ', '**/Reports/**/*.{md,txt}']);
  assert.ok(!globs.includes(''));
  assert.ok(!globs.some((glob) => glob.trim() === ''));
});

// --- R3: recognized-root casing cannot disappear ---

test('S7.1-6 on win32/darwin, each recognized root name gets exact/upper/lower case glob variants', () => {
  for (const platform of ['win32', 'darwin']) {
    const patterns = recognizedReportRootGlobPatterns(platform);
    for (const name of RECOGNIZED_REPORT_ROOT_NAMES) {
      assert.ok(patterns.includes(`**/${name}/**/*.{md,txt}`), `${platform}: exact case for ${name}`);
      assert.ok(patterns.includes(`**/${name.toUpperCase()}/**/*.{md,txt}`), `${platform}: upper case for ${name}`);
      assert.ok(patterns.includes(`**/${name.toLowerCase()}/**/*.{md,txt}`), `${platform}: lower case for ${name}`);
    }
    assert.equal(new Set(patterns).size, patterns.length, 'no duplicate pattern on a case-insensitive platform');
  }
});

test('S7.1-7 on linux, only the exact recognized casing is emitted (no invented case-insensitivity where the filesystem is case-sensitive)', () => {
  const patterns = recognizedReportRootGlobPatterns('linux');
  assert.equal(patterns.length, RECOGNIZED_REPORT_ROOT_NAMES.length);
  for (const name of RECOGNIZED_REPORT_ROOT_NAMES) {
    assert.ok(patterns.includes(`**/${name}/**/*.{md,txt}`));
  }
  assert.ok(!patterns.includes('**/REPORTS/**/*.{md,txt}'));
});

test('S7.1-8 recognized-root vocabulary is imported, not re-declared, so it cannot drift from the GameFilesystemContract vocabulary', () => {
  assert.deepEqual(RECOGNIZED_REPORT_ROOT_NAMES, ['Reports-SLC', 'Reports', 'Docs REPORT']);
  const patterns = recognizedReportRootGlobPatterns('win32');
  // Every default pattern's root segment resolves back to a recognized name (case-insensitively).
  for (const pattern of patterns) {
    const match = pattern.match(/^\*\*\/(.+)\/\*\*\/\*\.\{md,txt\}$/);
    assert.ok(match);
    assert.ok(RECOGNIZED_REPORT_ROOT_NAMES.some((name) => name.toLowerCase() === match[1].toLowerCase()));
  }
});

test('S7.1-9 an unrecognized custom root name (e.g. gallerytest\'s "Reports and Docs") never becomes a silent default', () => {
  const globs = buildReportGlobs([]);
  assert.ok(!globs.some((glob) => glob.toLowerCase().includes('reports and docs')));
});

// --- Real-filesystem fixture proof (regression lock) ---
// Node's own fs.globSync is case-sensitive on Windows, exactly like VS Code's
// glob engine (independently proven against VS Code's bundled ripgrep in the
// Opus diagnostic). This proves the GENERATED PATTERN STRINGS actually match
// real on-disk casing, not merely that they are well-formed.

function makeGameTree(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's7-1-glob-'));
  for (const relativePath of structure) {
    const target = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `# ${relativePath}`, 'utf8');
  }
  return root;
}

function matchAny(root, patterns) {
  const found = new Set();
  for (const pattern of patterns) {
    for (const hit of fs.globSync(pattern, { cwd: root })) found.add(hit.replace(/\\/g, '/'));
  }
  return found;
}

test('S7.1-10 fixture: Trend-shaped Game (Reports/) is discovered by the default patterns', () => {
  const root = makeGameTree(['Reports/Claude/a.md', 'Reports/Codex/b.md']);
  try {
    const hits = matchAny(root, buildReportGlobs([], 'win32'));
    assert.equal(hits.size, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S7.1-11 fixture: SidelineCoach-GameTest-shaped Game (REPORTS/, uppercase) is discovered on win32/darwin defaults', () => {
  const root = makeGameTree(['REPORTS/Claude/a.md', 'REPORTS/Codex/b.md', 'REPORTS/AntiGravity/c.md']);
  try {
    const winHits = matchAny(root, buildReportGlobs([], 'win32'));
    assert.equal(winHits.size, 3, 'case-variant defaults find the uppercase root on win32');

    const linuxHits = matchAny(root, buildReportGlobs([], 'linux'));
    assert.equal(linuxHits.size, 0, 'no invented case-insensitivity is applied on a case-sensitive-filesystem platform');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S7.1-12 fixture: gallerytest-shaped Game ("Reports and Docs/") is not discovered by defaults, but IS discovered once that exact glob is configured (R4 escape hatch, config-only)', () => {
  const root = makeGameTree(['Reports and Docs/Codex Reports/a.md']);
  try {
    const defaultHits = matchAny(root, buildReportGlobs([], 'win32'));
    assert.equal(defaultHits.size, 0, 'an unrecognized custom root is never silently adopted');

    const withCustomGlob = matchAny(root, buildReportGlobs(['**/Reports and Docs/**/*.{md,txt}'], 'win32'));
    assert.equal(withCustomGlob.size, 1, 'an explicit custom glob still works, and other defaults are preserved alongside it');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S7.1-13 fixture: empty Reports/ (Ai Usage - Real Time) matches the default pattern and correctly yields zero files', () => {
  const root = makeGameTree([]);
  fs.mkdirSync(path.join(root, 'Reports'), { recursive: true });
  try {
    const hits = matchAny(root, buildReportGlobs([], 'win32'));
    assert.equal(hits.size, 0, 'an empty recognized folder is watched correctly; it simply has nothing to find yet');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S7.1-14 fixture: a single user-scope custom glob no longer silences a differently-shaped sibling Game (the exact field regression)', () => {
  const trendRoot = makeGameTree(['Reports/Claude/a.md']);
  const gameTestRoot = makeGameTree(['REPORTS/Codex/b.md']);
  try {
    // The field defect: exactly one configured pattern, matching only Trend's casing.
    const configured = ['**/Reports/**/*.{md,txt}'];
    const globs = buildReportGlobs(configured, 'win32');

    assert.ok(matchAny(trendRoot, globs).size > 0, 'the known-good control Game remains discovered');
    assert.ok(matchAny(gameTestRoot, globs).size > 0, 'the previously-silenced sibling Game is now ALSO discovered, because the configured glob no longer replaced the recognized-root defaults');
  } finally {
    fs.rmSync(trendRoot, { recursive: true, force: true });
    fs.rmSync(gameTestRoot, { recursive: true, force: true });
  }
});
