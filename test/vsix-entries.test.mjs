import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { listZipEntries } from '../tools/dev/zip-entries.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A minimal, valid ZIP writer (stored entries) so the reader is tested without any external tool. */
function makeZip(names, { comment = '' } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = name.endsWith('/') ? Buffer.alloc(0) : Buffer.from(`content of ${name}`, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const commentBytes = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  return Buffer.concat([...locals, directory, end, commentBytes]);
}

test('Zip-1. Lists every entry name exactly, in order: spaces, brackets, directories and unicode included', () => {
  const names = ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/', 'extension/out/', 'extension/out/extension.js', 'extension/src/public/index.html', 'extension/Project SOP/note.md', 'extension/out/naïve-é.js'];
  assert.deepEqual(listZipEntries(makeZip(names)), names);
  assert.deepEqual(listZipEntries(makeZip([])), []);
});

test('Zip-2. An archive comment after the end record does not hide the entries', () => {
  const names = ['a.txt', 'dir/b.txt'];
  assert.deepEqual(listZipEntries(makeZip(names, { comment: 'built by vsce '.repeat(200) })), names);
});

test('Zip-3. Not-a-ZIP, truncated and ZIP64 inputs fail loudly instead of returning a wrong list', () => {
  assert.throws(() => listZipEntries(Buffer.from('this is definitely not a zip archive at all, sorry')), /Not a ZIP archive/);
  assert.throws(() => listZipEntries(Buffer.alloc(0)), /Not a ZIP archive/);
  const good = makeZip(['a.txt', 'b.txt']);
  assert.throws(() => listZipEntries(good.subarray(good.length - 30)), /Not a ZIP archive|Corrupt ZIP/);

  const zip64 = Buffer.from(good);
  zip64.writeUInt16LE(0xffff, zip64.length - 22 + 10);
  assert.throws(() => listZipEntries(zip64), /ZIP64/);

  const corrupt = Buffer.from(good);
  const directoryStart = corrupt.readUInt32LE(corrupt.length - 22 + 16);
  corrupt.writeUInt32LE(0, directoryStart); // smash the first central-directory signature
  assert.throws(() => listZipEntries(corrupt), /Corrupt ZIP/);
});

test('Zip-4. The audit lists entries in-process: no child process, no `tar`, so no dependence on the shell', () => {
  const audit = fs.readFileSync(path.join(repoRoot, 'tools', 'dev', 'audit-vsix.mjs'), 'utf8');
  assert.match(audit, /import \{ listZipEntries \} from '\.\/zip-entries\.mjs'/);
  assert.match(audit, /listZipEntries\(fs\.readFileSync\(vsixPath\)\)/);
  assert.ok(!/child_process|execFileSync|spawn|['"]tar['"]/.test(audit), 'the audit does not shell out');
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(manifest.scripts.package, /vsce package && node tools\/dev\/audit-vsix\.mjs/, 'the supported package command still runs the audit');
});

test('Zip-5. Cross-check on the REAL package: the in-process listing equals bsdtar\'s listing of the same archive', (t) => {
  const vsix = path.join(repoRoot, 'sideline-coach-0.1.0.vsix');
  if (!fs.existsSync(vsix)) { t.skip('no VSIX has been built in this checkout (run npm run package)'); return; }
  // Use the Windows system tar explicitly when present: it is bsdtar, and it does not depend on the launching shell.
  const candidates = [process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32', 'tar.exe'), 'tar'].filter(Boolean);
  let bsdtar;
  for (const candidate of candidates) {
    try { if (/bsdtar/i.test(execFileSync(candidate, ['--version'], { encoding: 'utf8' }))) { bsdtar = candidate; break; } } catch { /* try next */ }
  }
  if (!bsdtar) { t.skip('bsdtar is not available to cross-check against'); return; }
  const expected = execFileSync(bsdtar, ['-tf', path.basename(vsix)], { encoding: 'utf8', cwd: repoRoot }).split(/\r?\n/).map((e) => e.trim()).filter(Boolean);
  const actual = listZipEntries(fs.readFileSync(vsix)).map((e) => e.trim()).filter(Boolean);
  assert.ok(actual.length > 50, 'a real VSIX has many entries');
  assert.deepEqual([...actual].sort(), [...expected].sort());
});
