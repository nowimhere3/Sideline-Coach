import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8');

test('Coach watches configured report locations after startup and announces every report filesystem transition', () => {
  assert.match(server, /this\.installWatchers\(\);[\s\S]*?this\.httpServer = http\.createServer/);
  assert.match(server, /const globs = this\.getReportGlobs\(\);[\s\S]*?vscode\.workspace\.createFileSystemWatcher\(glob\)/);
  assert.match(server, /watcher\.onDidCreate\(announce,[\s\S]*?watcher\.onDidChange\(announce,[\s\S]*?watcher\.onDidDelete\(announce,/);
  assert.match(server, /const announce = \(uri: vscode\.Uri\): void => \{[\s\S]*?this\.broadcast\('reports', \{[\s\S]*?type: 'report-change'/);
});

test('current report discovery is URI-deduplicated, mtime ordered, and retains recent history', () => {
  assert.match(server, /const byUri = new Map<string, vscode\.Uri>\(\);/);
  assert.match(server, /byUri\.set\(uri\.toString\(\), uri\);/);
  assert.match(server, /candidates\.sort\(\(a, b\) => b\.mtime - a\.mtime\);/);
  assert.match(server, /const selected = candidates\.slice\(0, limit\);/);
  assert.match(server, /this\.json\(res, 200, await this\.scanReports\(5, true\)\);/);
  assert.match(server, /const reports = await this\.scanReports\(1, true\);[\s\S]*?return reports\[0\];/);
});

test('latest requested canonical refresh wins, so an older report scan cannot overwrite Incoming', () => {
  assert.match(page, /let refreshGeneration = 0;/);
  assert.match(page, /const refresh = async \(\) => \{[\s\S]*?const generation = \+\+refreshGeneration;[\s\S]*?if \(generation !== refreshGeneration\) return false;[\s\S]*?renderReports\(reportItems\);/);
  assert.match(page, /eventSource\.addEventListener\('reports', \(\) => void refresh\(\)\)/);
  assert.match(page, /const renderReports = \(items\) => \{[\s\S]*?reports = items \|\| \[\];[\s\S]*?renderReport\(reports\[0\] \|\| null\);/);
  assert.match(page, /if \(connectionState === 'reconnecting'\) setConnectionState\('connected'\);/);
});
