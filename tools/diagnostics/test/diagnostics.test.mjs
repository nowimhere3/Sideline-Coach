import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectPreflight } from '../collect-preflight.mjs';
import { evaluateAssertions, failingAssertions } from '../assertions.mjs';
import { renderSnapshot, fixedHeadings, MAX_BYTES } from '../render-snapshot.mjs';

const fixtures = [];
test.after(() => fixtures.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function fixture({ out = false, launch = true, tasks = true, host = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-coach-diagnostics-'));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'extension.ts'), 'export const version = 1;');
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', '.bin', 'tsc'), '');
  const hostPath = path.join(root, 'host'); if (host) fs.mkdirSync(hostPath);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sideline-coach', version: '1.0.0', scripts: { compile: 'tsc -p .'}, contributes: { configuration: { properties: { 'coach.port': { default: 45000 }, 'coach.autoStart': { default: true }, 'coach.reportGlobs': { default: ['**/Docs REPORT/**/*.{md,txt}'] }, 'coach.terminalAllowlist': { default: ['Codex'] }, 'coach.publicUrl': { default: '' } } } } }));
  if (out) { fs.mkdirSync(path.join(root, 'out')); fs.writeFileSync(path.join(root, 'out', 'extension.js'), 'compiled'); }
  if (launch) { fs.mkdirSync(path.join(root, '.vscode')); fs.writeFileSync(path.join(root, '.vscode', 'launch.json'), JSON.stringify({ configurations: [{ name: 'test', type: 'extensionHost', args: ['--extensionDevelopmentPath=${workspaceFolder}', hostPath], preLaunchTask: 'npm: compile' }] })); }
  if (tasks) { fs.mkdirSync(path.join(root, '.vscode'), { recursive: true }); fs.writeFileSync(path.join(root, '.vscode', 'tasks.json'), JSON.stringify({ tasks: [{ label: 'npm: compile' }] })); }
  fs.mkdirSync(path.join(root, 'host', 'Docs REPORT', 'Codex'), { recursive: true }); fs.writeFileSync(path.join(root, 'host', 'Docs REPORT', 'Codex', 'report.md'), 'normal report');
  return root;
}

function snapshotFor(root, generatedAt = '2026-09-10T12:00:00.000-06:00') {
  return collectPreflight({ root, logRoot: path.join(root, 'missing-logs'), generatedAt });
}

function treeHash(root) {
  const hash = createHash('sha256');
  const visit = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
    const full = path.join(dir, entry.name); if (entry.isDirectory()) visit(full); else { hash.update(path.relative(root, full)); hash.update(fs.readFileSync(full)); }
  });
  visit(root); return hash.digest('hex');
}

test('T1 schema uses exactly the fixed headings in order', () => {
  const root = fixture(); const markdown = renderSnapshot(snapshotFor(root));
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings, fixedHeadings);
});

test('T2 producer redaction removes adversarial secrets and tokenizes paths', () => {
  const root = fixture();
  const snapshot = snapshotFor(root);
  snapshot.identity.extensionDevelopmentPath = 'C:\\Users\\dmcal\\Packages\\visible';
  snapshot.server.publicUrl = { state: 'set', scheme: 'https' };
  snapshot.reports.newestFile = 'report-ghp_abcdefghijklmnopqrst.md';
  const markdown = renderSnapshot(snapshot);
  assert.doesNotMatch(markdown, /ghp_abcdefghijklmnopqrst|eyJ[a-zA-Z0-9_-]+|https:\/\/private-host/);
  assert.match(markdown, /C:\\Users\\<user>\\Packages\\visible/);
  assert.match(markdown, /Packages/);
});

test('T3 absent out renders a literal unknown instead of a false value', () => {
  const root = fixture({ out: false }); const snapshot = snapshotFor(root);
  assert.equal(snapshot.identity.builtHash, 'unknown (out/ absent)');
  assert.match(renderSnapshot(snapshot), /unknown \(out\/ absent\)/);
});

test('T4 missing optional inputs produce a complete artifact without throwing', () => {
  const root = fixture({ launch: false, tasks: false, host: false });
  assert.doesNotThrow(() => renderSnapshot(snapshotFor(root)));
  const markdown = renderSnapshot(snapshotFor(root));
  assert.match(markdown, /## LAUNCH/); assert.match(markdown, /unknown/);
});

test('T5 freshness uses an explicit offset and renders stale after ten minutes', () => {
  const root = fixture(); const generatedAt = '2026-09-10T12:00:00.000-06:00';
  const markdown = renderSnapshot(snapshotFor(root, generatedAt), { now: new Date('2026-09-10T12:11:00.000-06:00') });
  assert.match(markdown, /generatedAt: 2026-09-10T12:00:00.000-06:00 · STALE/);
});

test('T6 A1-A8 are deterministic, ordered, and each can pass or fail', () => {
  const root = fixture({ out: true }); const passing = snapshotFor(root);
  passing.identity.buildVerdict = 'built-current'; passing.identity.copyCount = 1; passing.server.portInOsEphemeralRange = false;
  passing.launch.preLaunchTaskDefinedInTasksJson = true; passing.launch.hostFolderExists = true; passing.reports.matchedCount = 1;
  const results = evaluateAssertions(passing);
  assert.equal(results.length, 8); assert.equal(failingAssertions(passing).length, 0);
  const extensionPassing = structuredClone(passing);
  extensionPassing.collector = 'extension'; extensionPassing.extension = { activationCompleted: true, listenerMatchesAutoStart: true };
  assert.deepEqual(evaluateAssertions(extensionPassing).find((entry) => entry.id === 'A7'), { id: 'A7', severity: 'ERROR', passed: true, applicable: true, detail: 'activation or listener state does not match autoStart intent' });
  const failing = structuredClone(passing);
  failing.identity.buildVerdict = 'not-built'; failing.identity.dependenciesInstalled = false; failing.launch.compileFeasible = false; failing.launch.preLaunchTaskDefinedInTasksJson = false; failing.launch.hostFolderExists = false; failing.identity.copyCount = 2; failing.server.portInOsEphemeralRange = true; failing.collector = 'extension'; failing.extension = { activationCompleted: false, listenerMatchesAutoStart: false }; failing.reports.matchedCount = 0;
  assert.deepEqual(failingAssertions(failing).map((entry) => entry.id), ['A1', 'A2', 'A4', 'A6', 'A7', 'A3', 'A5', 'A8']);
});

test('T7 collection does not mutate a fixture tree and writes nowhere outside local projection', () => {
  const root = fixture(); const before = treeHash(root); collectPreflight({ root, logRoot: path.join(root, 'none') });
  assert.equal(treeHash(root), before); assert.equal(fs.existsSync(path.join(root, 'Diagnostics', 'local')), false);
});

test('T8 rendering stays within the hard budget and labels truncation with a path', () => {
  const root = fixture(); const snapshot = snapshotFor(root);
  snapshot.players.terminalAllowlist = ['hello world '.repeat(10000)];
  const markdown = renderSnapshot(snapshot);
  assert.ok(Buffer.byteLength(markdown, 'utf8') <= MAX_BYTES);
  assert.match(markdown, /truncated; see Diagnostics\/local\/CURRENT\.md/);
});
