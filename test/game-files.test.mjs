/** S1 — neutral Game Files service safety and compatibility proof. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { browseGameDirectory, checkGamePaths, resolveAbsoluteGamePath } from '../out/game-files.js';
import { browseSources, checkSources } from '../out/routine-sources.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-s1-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-outside-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'z.txt'), 'body must not cross');
  fs.writeFileSync(path.join(root, 'a.md'), '# body');
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {};');
  for (const blocked of ['.git', 'node_modules', '.sideline', 'secrets', 'credentials-private']) {
    fs.mkdirSync(path.join(root, blocked));
    fs.writeFileSync(path.join(root, blocked, 'hidden.txt'), 'secret');
  }
  for (const blocked of ['.env', '.env.local', 'cert.pem', 'server.key', 'bundle.pfx', 'id_rsa', 'token']) {
    fs.writeFileSync(path.join(root, blocked), 'secret');
  }
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
  let linkCreated = false;
  try {
    fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    linkCreated = true;
  } catch {}
  return {
    root, outside, linkCreated,
    cleanup() {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(outside, { recursive: true, force: true }); } catch {}
    }
  };
}

test('FS-1/4/7: neutral browse is folders-first, blocked, relative, and metadata-only', async () => {
  const f = fixture();
  try {
    const result = await browseGameDirectory(f.root);
    assert.equal(result.dir, '');
    assert.equal(result.entries[0].kind, 'folder');
    assert.deepEqual(result.entries.map((entry) => entry.name), ['src', 'a.md', 'z.txt']);
    for (const entry of result.entries) {
      assert.equal(path.isAbsolute(entry.path), false);
      assert.equal(entry.content, undefined);
      assert.equal(entry.body, undefined);
      assert.equal(entry.text, undefined);
    }
  } finally { f.cleanup(); }
});

test('FS-2: traversal, absolute, drive, and UNC browse requests are rejected', async () => {
  const f = fixture();
  try {
    for (const dir of ['..', 'src/..', '/etc', 'C:\\Windows', '\\\\server\\share']) {
      await assert.rejects(() => browseGameDirectory(f.root, dir), /invalid|absolute|drive|UNC|traversal|leave/i);
    }
  } finally { f.cleanup(); }
});

test('FS-3: symlink or junction escapes are omitted, blocked by check, and cannot be browsed', async (t) => {
  const f = fixture();
  try {
    if (!f.linkCreated) return t.skip('OS did not permit test symlink/junction creation');
    const root = await browseGameDirectory(f.root);
    assert.equal(root.entries.some((entry) => entry.name === 'escape'), false);
    assert.deepEqual(await checkGamePaths(f.root, ['escape', 'escape/outside.txt']), [
      { path: 'escape', state: 'blocked' },
      { path: 'escape/outside.txt', state: 'blocked' }
    ]);
    await assert.rejects(() => browseGameDirectory(f.root, 'escape'), /escapes Game root/i);
  } finally { f.cleanup(); }
});

test('FS-5: missing/inaccessible evidence stays truthful and stale entries are skipped', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await checkGamePaths(f.root, ['missing.txt']), [{ path: 'missing.txt', state: 'missing' }]);
    fs.symlinkSync(path.join(f.root, 'gone'), path.join(f.root, 'broken-link'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await browseGameDirectory(f.root);
    assert.equal(result.entries.some((entry) => entry.name === 'broken-link'), false);
  } catch (error) {
    if (!String(error).match(/privilege|operation not permitted/i)) throw error;
  } finally { f.cleanup(); }
});

test('FS-6: result and raw scan limits report truncation truthfully', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-files-limit-'));
  try {
    for (let index = 0; index < 5; index += 1) fs.writeFileSync(path.join(root, `f-${index}.txt`), 'x');
    const resultLimited = await browseGameDirectory(root, '', { maxEntries: 2 });
    assert.equal(resultLimited.entries.length, 2);
    assert.equal(resultLimited.truncated, true);

    for (let index = 5; index < 1_005; index += 1) fs.writeFileSync(path.join(root, `f-${index}.txt`), 'x');
    const scanLimited = await browseGameDirectory(root);
    assert.equal(scanLimited.entries.length, 200);
    assert.equal(scanLimited.truncated, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('FS-8: Coach Routines wrappers preserve browse/check behavior', async () => {
  const f = fixture();
  try {
    const neutralBrowse = await browseGameDirectory(f.root);
    assert.deepEqual(await browseSources(f.root), { dir: neutralBrowse.dir, entries: neutralBrowse.entries });
    assert.deepEqual(await checkSources(f.root, ['a.md', 'src', '../outside']), await checkGamePaths(f.root, ['a.md', 'src', '../outside']));
  } finally { f.cleanup(); }
});

test('S5-FS-1: files, folders, normalized paths, and Game root resolve to authoritative native lexical paths', async () => {
  const f = fixture();
  try {
    const file = await resolveAbsoluteGamePath(f.root, '.\\src\\index.ts');
    assert.deepEqual(file, {
      path: 'src/index.ts', available: true, absolutePath: path.resolve(f.root, 'src', 'index.ts'),
      pathStyle: process.platform === 'win32' ? 'windows' : 'posix', environment: 'local'
    });
    const folder = await resolveAbsoluteGamePath(f.root, 'src/');
    assert.equal(folder.available, true);
    assert.equal(folder.path, 'src');
    assert.equal(folder.absolutePath, path.resolve(f.root, 'src'));
    const root = await resolveAbsoluteGamePath(f.root, '.');
    assert.equal(root.available, true);
    assert.equal(root.path, '.');
    assert.equal(root.absolutePath, path.resolve(f.root));
    assert.deepEqual(Object.keys(file).sort(), ['absolutePath', 'available', 'environment', 'path', 'pathStyle']);

    const remote = await resolveAbsoluteGamePath(f.root, 'a.md', { remoteName: 'ssh-remote', workspaceScheme: 'file' });
    assert.equal(remote.available, true);
    assert.equal(remote.environment, 'remote');
    assert.equal(remote.remoteLabel, 'SSH');
  } finally { f.cleanup(); }
});

test('S5-FS-2: traversal, absolute, drive, UNC, blocked, missing, inaccessible, escaped, and virtual paths never disclose absolute coordinates', async (t) => {
  const f = fixture();
  try {
    for (const candidate of ['../outside', '/etc/passwd', 'C:\\Windows', '\\\\server\\share', '.git/config', '.env', 'bad\u0000path']) {
      const result = await resolveAbsoluteGamePath(f.root, candidate);
      assert.equal(result.available, false, candidate);
      assert.equal(result.reason, 'blocked', candidate);
      assert.equal(result.absolutePath, undefined, candidate);
    }
    const missing = await resolveAbsoluteGamePath(f.root, 'missing.txt');
    assert.deepEqual(missing, { path: 'missing.txt', available: false, reason: 'missing' });
    const inaccessibleChild = await resolveAbsoluteGamePath(f.root, 'a.md/child');
    assert.equal(inaccessibleChild.available, false);
    assert.equal(inaccessibleChild.reason, 'missing');
    assert.equal(inaccessibleChild.absolutePath, undefined);
    const invalidRoot = await resolveAbsoluteGamePath(path.join(f.root, 'a.md'), '.');
    assert.equal(invalidRoot.available, false);
    assert.equal(invalidRoot.reason, 'blocked');
    assert.equal(invalidRoot.absolutePath, undefined);
    const virtual = await resolveAbsoluteGamePath(f.root, 'src', { workspaceScheme: 'vscode-vfs' });
    assert.deepEqual(virtual, { path: 'src', available: false, reason: 'virtual-workspace' });
    if (f.linkCreated) {
      const escaped = await resolveAbsoluteGamePath(f.root, 'escape/outside.txt');
      assert.equal(escaped.available, false);
      assert.equal(escaped.reason, 'blocked');
      assert.equal(escaped.absolutePath, undefined);
    } else {
      t.diagnostic('OS did not permit symlink/junction escape fixture; shared FS-3 still covers the guard.');
    }
  } finally { f.cleanup(); }
});
