#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listZipEntries } from './zip-entries.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const vsixPath = path.join(repoRoot, `${manifest.name}-${manifest.version}.vsix`);

if (!fs.existsSync(vsixPath)) throw new Error(`VSIX was not created: ${vsixPath}`);

// Entries come from the archive's own central directory, read in-process. This audit
// deliberately does not shell out to `tar`: GNU tar (Git Bash, most Linux) cannot read a
// ZIP at all and misreads a Windows "C:\..." path as a remote host, so a `tar`-based audit
// silently depended on which shell npm was launched from. See zip-entries.mjs.
const entries = listZipEntries(fs.readFileSync(vsixPath))
  .map((entry) => entry.trim())
  .filter(Boolean);

/**
 * VSIX PACKAGING OWNERSHIP
 *
 * WAS: VSIX packaging had two mutually exclusive inclusion strategies and
 * could not produce a package; broad candidate enumeration included
 * developer/runtime Scout evidence.
 *
 * IS: One intentional allowlist includes runtime product assets, and this
 * post-package audit rejects developer evidence in the actual archive.
 *
 * WHY: A customer's extension package must contain product code, not the
 * developer's game film or temporary working directories.
 *
 * WILL BE: Future V1 packaging/fresh-install proof uses this same clean
 * package boundary.
 */
const required = [
  'extension/package.json',
  'extension/out/extension.js',
  'extension/out/control-plane/daemon.js',
  'extension/out/scout-intelligence-root.js',
  'extension/src/public/index.html',
  'extension/node_modules/ws/package.json',
  'extension/node_modules/ws/index.js'
];

const prohibitedPrefixes = [
  'extension/REPORTS/',
  'extension/Scouts/',
  'extension/test/',
  'extension/tools/',
  'extension/Diagnostics/',
  'extension/Project SOP/',
  'extension/Docs ANCHOR/',
  'extension/.claude/'
];

const missing = required.filter((entry) => !entries.includes(entry));
const prohibited = entries.filter((entry) => prohibitedPrefixes.some((prefix) => entry.startsWith(prefix)));
const transcripts = entries.filter((entry) => /(^|\/)(?:[^/]*(?:terminal|session)[^/]*)\.(?:md|txt)$/i.test(entry));

if (missing.length > 0 || prohibited.length > 0 || transcripts.length > 0) {
  const details = [
    missing.length > 0 ? `Missing runtime assets: ${missing.join(', ')}` : '',
    prohibited.length > 0 ? `Prohibited development paths: ${prohibited.join(', ')}` : '',
    transcripts.length > 0 ? `Terminal/session transcripts: ${transcripts.join(', ')}` : ''
  ].filter(Boolean).join('\n');
  throw new Error(`VSIX content audit failed.\n${details}`);
}

console.log(`VSIX content audit PASS: ${entries.length} archive entries; required runtime assets present; developer evidence absent.`);
