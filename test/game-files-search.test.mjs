/** S2 — bounded, metadata-only Game file/folder search proof. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { searchGameFiles } from '../out/game-files.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-search-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-search-outside-'));
  fs.mkdirSync(path.join(root, 'src', 'server'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Reports'));
  fs.mkdirSync(path.join(root, 'Onboarding Docs'));
  fs.writeFileSync(path.join(root, 'server.ts'), 'contents must never be returned');
  fs.writeFileSync(path.join(root, 'src', 'server.ts'), 'export {};');
  fs.writeFileSync(path.join(root, 'src', 'server', 'index.ts'), 'export {};');
  fs.writeFileSync(path.join(root, 'Reports', 'north-star.md'), '# report');
  fs.writeFileSync(path.join(root, 'Onboarding Docs', 'NORTH STAR.md'), '# guide');
  for (const blocked of ['.git', 'node_modules', '.sideline', 'secrets', 'credentials-private']) {
    fs.mkdirSync(path.join(root, blocked));
    fs.writeFileSync(path.join(root, blocked, 'server-secret.txt'), 'secret');
  }
  for (const blocked of ['.env', '.env.local', 'cert.pem', 'server.key', 'bundle.pfx', 'id_rsa-test', 'token', '.token']) {
    fs.writeFileSync(path.join(root, blocked), 'secret');
  }
  fs.writeFileSync(path.join(outside, 'outside-server.ts'), 'outside');
  let linkCreated = false;
  try {
    fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    linkCreated = true;
  } catch {}
  return {
    root,
    linkCreated,
    cleanup() {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(outside, { recursive: true, force: true }); } catch {}
    }
  };
}

test('SE-1/2/3/4/5: finds files and folders by case-insensitive name, path, and AND tokens', async () => {
  const f = fixture();
  try {
    assert.deepEqual((await searchGameFiles(f.root, 'SERVER.TS')).results.map((entry) => entry.path), ['server.ts', 'src/server.ts']);
    const reports = await searchGameFiles(f.root, 'reports');
    assert.deepEqual(reports.results[0], { name: 'Reports', path: 'Reports', kind: 'folder' });
    assert.ok(reports.results.some((entry) => entry.path === 'Reports/north-star.md'));
    assert.deepEqual((await searchGameFiles(f.root, 'src/server')).results.map((entry) => entry.path), ['src/server', 'src/server.ts', 'src/server/index.ts']);
    assert.deepEqual((await searchGameFiles(f.root, 'north star')).results.map((entry) => entry.path), ['Onboarding Docs/NORTH STAR.md', 'Reports/north-star.md']);
    assert.deepEqual((await searchGameFiles(f.root, 'src\\server')).results.map((entry) => entry.path), ['src/server', 'src/server.ts', 'src/server/index.ts']);
  } finally { f.cleanup(); }
});

test('SE-6: ranking is deterministic: exact/stem, prefix, name contains, then path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-rank-'));
  try {
    fs.mkdirSync(path.join(root, 'report'));
    fs.mkdirSync(path.join(root, 'reports'));
    fs.mkdirSync(path.join(root, 'archive'));
    fs.writeFileSync(path.join(root, 'report.md'), 'x');
    fs.writeFileSync(path.join(root, 'reports-old.md'), 'x');
    fs.writeFileSync(path.join(root, 'my-report.txt'), 'x');
    fs.writeFileSync(path.join(root, 'archive', 'report-log.txt'), 'x');
    const result = await searchGameFiles(root, 'report');
    assert.deepEqual(result.results.map((entry) => entry.path), [
      'report', 'report.md', 'reports', 'reports-old.md', 'archive/report-log.txt', 'my-report.txt'
    ]);
    for (let run = 0; run < 3; run += 1) {
      assert.deepEqual((await searchGameFiles(root, 'report')).results, result.results);
    }
    assert.equal(result.truncated, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SE-7/8/9: empty, one-character, and unmatched queries do not enumerate or fabricate results', async () => {
  const f = fixture();
  try {
    for (const query of ['', '   ', 's', 'does-not-exist']) {
      const result = await searchGameFiles(f.root, query);
      assert.deepEqual(result.results, []);
      assert.equal(result.truncated, false);
      assert.equal(result.moreMatches, false);
    }
    assert.deepEqual(await searchGameFiles(path.join(f.root, 'missing-root'), 's'), {
      query: 's', results: [], truncated: false, moreMatches: false
    });
  } finally { f.cleanup(); }
});

test('SE-10: results are typed Game-relative metadata only', async () => {
  const f = fixture();
  try {
    const result = await searchGameFiles(f.root, 'server');
    assert.ok(result.results.some((entry) => entry.kind === 'file'));
    assert.ok(result.results.some((entry) => entry.kind === 'folder'));
    for (const entry of result.results) {
      assert.equal(path.isAbsolute(entry.path), false);
      assert.deepEqual(Object.keys(entry).sort(), ['kind', 'name', 'path']);
    }
  } finally { f.cleanup(); }
});

test('SE-11: blocked paths/files and escaped or stale links never surface', async (t) => {
  const f = fixture();
  try {
    assert.deepEqual((await searchGameFiles(f.root, 'secret')).results, []);
    assert.deepEqual((await searchGameFiles(f.root, 'env')).results, []);
    assert.deepEqual((await searchGameFiles(f.root, 'pem')).results, []);
    if (!f.linkCreated) return t.skip('OS did not permit test symlink/junction creation');
    assert.deepEqual((await searchGameFiles(f.root, 'outside')).results, []);
  } finally { f.cleanup(); }
});

test('SE-12: every terminating scan budget reports its truthful reason', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-bounds-'));
  try {
    fs.mkdirSync(path.join(root, 'one', 'two'), { recursive: true });
    fs.writeFileSync(path.join(root, 'one', 'first.txt'), 'x');
    fs.writeFileSync(path.join(root, 'one', 'two', 'second.txt'), 'x');
    fs.writeFileSync(path.join(root, 'third.txt'), 'x');

    const entries = await searchGameFiles(root, 'txt', { maxEntries: 1 });
    assert.equal(entries.truncated, true);
    assert.equal(entries.limitReason, 'entries');

    const directories = await searchGameFiles(root, 'txt', { maxDirectories: 1 });
    assert.equal(directories.truncated, true);
    assert.equal(directories.limitReason, 'directories');

    const depth = await searchGameFiles(root, 'txt', { maxDepth: 0 });
    assert.equal(depth.truncated, true);
    assert.equal(depth.limitReason, 'depth');

    let clock = 0;
    const timed = await searchGameFiles(root, 'txt', { deadlineMs: 1_500, now: () => (clock += 800) });
    assert.equal(timed.truncated, true);
    assert.equal(timed.limitReason, 'time');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SE-13: result cap is separate from scan truncation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-result-limit-'));
  try {
    for (let index = 0; index < 6; index += 1) fs.writeFileSync(path.join(root, `match-${index}.txt`), 'x');
    const result = await searchGameFiles(root, 'match', { limit: 2 });
    assert.equal(result.results.length, 2);
    assert.equal(result.moreMatches, true);
    assert.equal(result.truncated, false);
    assert.equal(result.limitReason, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SE-14: cooperative supersession stops an older bounded walk', async () => {
  const f = fixture();
  try {
    const result = await searchGameFiles(f.root, 'server', { yieldEvery: 1 }, () => true);
    assert.equal(result.superseded, true);
    assert.deepEqual(result.results, []);
  } finally { f.cleanup(); }
});
