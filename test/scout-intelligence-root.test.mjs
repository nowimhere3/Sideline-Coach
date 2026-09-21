import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEVELOPMENT_EXTENSION_MODE,
  SCOUT_INTELLIGENCE_ROOT_ENV,
  ensureScoutIntelligenceRoot,
  migrateLegacyScoutIntelligence,
  resolveDevelopmentScoutIntelligenceRoot,
  resolveScoutIntelligenceRoot
} from '../out/scout-intelligence-root.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-scout-intelligence-'));
  return {
    root,
    legacy: path.join(root, 'extension', 'REPORTS', 'Scout Only'),
    destination: path.join(root, 'sideline-data', 'Scout Intelligence'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

test('installed extension roots Scout Intelligence under extension global storage and ignores development overrides', () => {
  const globalStorage = path.resolve('C:/profiles/default/User/globalStorage/local.sideline-coach');
  const resolved = resolveScoutIntelligenceRoot({
    extensionMode: 1,
    globalStorageFsPath: globalStorage,
    env: { [SCOUT_INTELLIGENCE_ROOT_ENV]: 'C:/should-not-win', SIDELINE_DIR: 'C:/also-not-product' }
  });
  assert.equal(resolved, path.join(globalStorage, 'Scout Intelligence'));
});

test('isolated Development Hosts resolve one explicit Sideline-owned root independent of profile and Game', () => {
  const shared = path.resolve('C:/Users/dev/.sideline/Scout Intelligence');
  const env = { [SCOUT_INTELLIGENCE_ROOT_ENV]: shared };
  const gs3 = resolveScoutIntelligenceRoot({
    extensionMode: DEVELOPMENT_EXTENSION_MODE,
    globalStorageFsPath: path.resolve('C:/profiles/gs3/User/globalStorage/local.sideline-coach'),
    env
  });
  const trend = resolveScoutIntelligenceRoot({
    extensionMode: DEVELOPMENT_EXTENSION_MODE,
    globalStorageFsPath: path.resolve('C:/profiles/trend/User/globalStorage/local.sideline-coach'),
    env
  });
  assert.equal(gs3, shared);
  assert.equal(trend, shared);
  assert.equal(gs3.includes('Games'), false);
});

test('developer CLIs and direct development launches share the existing SIDELINE_DIR convention', () => {
  const resolved = resolveDevelopmentScoutIntelligenceRoot({ env: { SIDELINE_DIR: path.resolve('C:/sideline-runtime') } });
  assert.equal(resolved, path.resolve('C:/sideline-runtime/Scout Intelligence'));
});

test('root creation is recursive and idempotent without creating a Game-owned lane', () => {
  const l = layout();
  try {
    ensureScoutIntelligenceRoot(l.destination);
    ensureScoutIntelligenceRoot(l.destination);
    for (const lane of ['Combine/Scorecards', 'Combine/Runs', 'Formations', 'Player Verification', 'Work']) {
      assert.equal(fs.statSync(path.join(l.destination, lane)).isDirectory(), true, lane);
    }
    assert.equal(fs.existsSync(path.join(l.root, 'Game', 'Scout Intelligence')), false);
  } finally { l.cleanup(); }
});

test('empty destination receives only approved durable legacy evidence and source bytes remain unchanged', () => {
  const l = layout();
  try {
    const approved = [
      ['Combine/Scorecards/ready.json', Buffer.from([0, 1, 2, 253, 254, 255])],
      ['Player Verification/antigravity.json', Buffer.from('{"state":"READY"}\n')],
      ['Formations/formation-1/FORMATION-RESULT.md', Buffer.from('# Exact parent\n')]
    ];
    for (const [relative, content] of approved) {
      const target = path.join(l.legacy, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    fs.mkdirSync(path.join(l.legacy, 'Combine', 'Runs', 'old-run'), { recursive: true });
    fs.writeFileSync(path.join(l.legacy, 'Combine', 'Runs', 'old-run', 'runtime.log'), 'not in approved migration');

    assert.equal(migrateLegacyScoutIntelligence({ legacyRoot: l.legacy, destinationRoot: l.destination }), 'migrated');
    for (const [relative, content] of approved) {
      assert.deepEqual(fs.readFileSync(path.join(l.destination, relative)), content);
      assert.deepEqual(fs.readFileSync(path.join(l.legacy, relative)), content, `legacy retained: ${relative}`);
    }
    assert.equal(fs.existsSync(path.join(l.destination, 'Combine', 'Runs', 'old-run')), false);
    assert.equal(fs.existsSync(l.legacy), true);
  } finally { l.cleanup(); }
});

test('non-empty destination is a no-op and never merges or deletes legacy truth', () => {
  const l = layout();
  try {
    fs.mkdirSync(path.join(l.legacy, 'Combine', 'Scorecards'), { recursive: true });
    fs.writeFileSync(path.join(l.legacy, 'Combine', 'Scorecards', 'legacy.json'), 'legacy');
    fs.mkdirSync(path.join(l.destination, 'Combine', 'Scorecards'), { recursive: true });
    fs.writeFileSync(path.join(l.destination, 'Combine', 'Scorecards', 'canonical.json'), 'canonical');

    assert.equal(migrateLegacyScoutIntelligence({ legacyRoot: l.legacy, destinationRoot: l.destination }), 'destination-non-empty');
    assert.equal(fs.readFileSync(path.join(l.destination, 'Combine', 'Scorecards', 'canonical.json'), 'utf8'), 'canonical');
    assert.equal(fs.existsSync(path.join(l.destination, 'Combine', 'Scorecards', 'legacy.json')), false);
    assert.equal(fs.readFileSync(path.join(l.legacy, 'Combine', 'Scorecards', 'legacy.json'), 'utf8'), 'legacy');
  } finally { l.cleanup(); }
});

test('supported Scout developer CLIs resolve the shared development root instead of the repository legacy tree', () => {
  const tools = [
    'run-scout-combine.mjs',
    'run-coach-refresh.mjs',
    'run-scout-formation.mjs',
    'run-scout-play.mjs',
    'run-interchangeability-proof.mjs',
    'verify-scout-player.mjs'
  ];
  for (const tool of tools) {
    const source = fs.readFileSync(path.resolve('tools', 'scouts', tool), 'utf8');
    assert.match(source, /resolveDevelopmentScoutIntelligenceRoot/);
    assert.doesNotMatch(source, /path\.join\([^\n]+['"]REPORTS['"][^\n]+['"]Scout Only['"]/);
  }
});

test('package uses one narrow allowlist and excludes development evidence', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.deepEqual(manifest.files, ['out/**/*.js', 'src/public/index.html', 'node_modules/ws/**', 'README.md', 'LICENSE']);
  assert.match(manifest.scripts.package, /vsce package && node tools\/dev\/audit-vsix\.mjs/);
  assert.equal(fs.existsSync(path.resolve('.vscodeignore')), false, 'VSCE cannot combine files[] with .vscodeignore');
  for (const prohibited of ['REPORTS', 'Scouts', 'test', 'tools', 'Diagnostics', '.claude']) {
    assert.equal(manifest.files.some((entry) => entry === prohibited || entry.startsWith(`${prohibited}/`)), false, prohibited);
  }
});
