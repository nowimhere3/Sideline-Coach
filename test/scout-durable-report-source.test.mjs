import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatReportProvenance,
  isTrustedPlayerInstanceId,
  parseReportProvenance
} from '../out/report-provenance.js';
import { runScoutFormation } from '../out/scout-formation.js';
import {
  ScoutIntelligenceReportSource,
  mergeSidelineOwnedParents,
  isTrustedScoutParentFor
} from '../out/scout-intelligence-report-source.js';
import { StadiumClient } from '../out/stadium-client.js';
import { InstanceWorkLedger } from '../out/control-plane/work-ledger.js';
import { projectExecution } from '../out/control-plane/execution-projection.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const GAME = 'game_durable_a';
const OTHER_GAME = 'game_durable_b';
const PARENT = 'FORMATION-RESULT.md';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sideline-durable-source-'));
  const gameRoot = path.join(root, 'Game');
  const scoutRoot = path.join(root, 'Scout Intelligence');
  fs.mkdirSync(path.join(gameRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(scoutRoot, 'Formations'), { recursive: true });
  fs.writeFileSync(path.join(gameRoot, 'src', 'example.ts'), 'export const evidence = true;\n');
  return { root, gameRoot, scoutRoot, formations: path.join(scoutRoot, 'Formations'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function report(label) {
  return `This report is reconnaissance, not final architectural authority.\n# Executive answer\n${label}\n# FACTS\nSee src/example.ts.\n# INFERENCES\nNone.\n# UNKNOWNS\nNone.\n# CONTRADICTIONS\nNone.\n# Relevant files / symbols\nsrc/example.ts\n# Recommended next step\nReview.\n# Provenance\nCurrent source.\n`;
}

function fakeCandidate(id, state = 'COMPLETE') {
  return {
    id, player: `Player-${id}`, provider: `Provider-${id}`,
    eligible: () => ({ eligible: true, reason: 'fixture' }),
    createExecutor: () => ({
      id, player: `Player-${id}`, harness: `harness-${id}`, provider: `Provider-${id}`,
      async execute() {
        return state === 'COMPLETE'
          ? { state, stdout: report(id), stderr: '', model: `model-${id}`, startedAt: '2026-09-19T13:00:00.000Z', endedAt: '2026-09-19T13:00:01.000Z', exitCode: 0, signal: null, readOnlyContractHeld: true }
          : { state, stdout: '', stderr: 'blocked', model: `model-${id}`, exitCode: 1, signal: null, readOnlyContractHeld: true, failureBoundary: 'RATE LIMITED: fixture' };
      }
    })
  };
}

async function formation(l, { at, attribution, candidates = [fakeCandidate('one'), fakeCandidate('two')] }) {
  return runScoutFormation({
    objective: 'Investigate the bounded fixture surface.',
    gameRoot: l.gameRoot,
    durableReportRoot: l.scoutRoot,
    candidates,
    formationSize: candidates.length,
    now: () => new Date(at),
    reportAttribution: attribution
  });
}

const touch = (file, iso) => { const t = new Date(iso); fs.utimesSync(file, t, t); };

// --- Provenance trust boundary ---------------------------------------------------

test('Durable-1. Provenance admits minted seats and exactly the approved logical Scout id, and nothing looser', () => {
  for (const ok of ['scout', 'claude-1a2b3c4d', 'codex-00000000', 'antigravity-deadbeef', 'terminal-1a2b3c4d']) {
    assert.equal(isTrustedPlayerInstanceId(ok), true, ok);
  }
  for (const bad of ['Scout', 'SCOUT', ' scout', 'scout ', 'scout\n', 'scouts', 'scout-', 'scout-1', 'scout-zzzzzzzz', 'sco ut', '',
    '../scout', 'scout/../x', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'claude-1A2B3C4D', 'claude-1a2b3c4', undefined, null, 42, {}]) {
    assert.equal(isTrustedPlayerInstanceId(bad), false, JSON.stringify(bad));
  }
});

test('Durable-2. Through the real parser, `scout` is retained and every look-alike is dropped to Unknown (other facts preserved)', () => {
  const marker = (id) => `<!-- sideline-provenance: ${JSON.stringify({ gameId: GAME, clientRef: 'ref_1', playerInstanceId: id, playerType: 'scout', provider: 'scout-formation', at: '2026-09-19T13:00:00.000Z' })} -->\n# body`;
  assert.equal(parseReportProvenance(marker('scout')).playerInstanceId, 'scout');
  assert.equal(parseReportProvenance(marker('claude-1a2b3c4d')).playerInstanceId, 'claude-1a2b3c4d');
  for (const bad of ['Scout', 'scouts', 'scout-1', '../scout', '__proto__', 'x'.repeat(300)]) {
    const parsed = parseReportProvenance(marker(bad));
    assert.equal(parsed.playerInstanceId, undefined, `look-alike ${bad.slice(0, 12)} is not admitted`);
    assert.equal(parsed.gameId, GAME, 'the rest of an otherwise-valid marker is not discarded');
  }
});

test('Durable-2b. A trusted Scout parent requires this Game, the Scout Player, the Scout Formation provider, and a Play', () => {
  const good = { gameId: GAME, clientRef: 'ref_1', playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation' };
  assert.equal(isTrustedScoutParentFor(good, GAME), true);
  assert.equal(isTrustedScoutParentFor(good, OTHER_GAME), false);
  assert.equal(isTrustedScoutParentFor(undefined, GAME), false);
  for (const patch of [{ playerInstanceId: undefined }, { playerInstanceId: 'claude-1a2b3c4d' }, { playerType: 'claude' }, { provider: 'claude' }, { clientRef: undefined }, { clientRef: '' }, { gameId: undefined }]) {
    assert.equal(isTrustedScoutParentFor({ ...good, ...patch }, GAME), false, JSON.stringify(patch));
  }
});

// --- Self-describing parent + children ---------------------------------------------

test('Durable-3. A Formation started with a Game and Play writes the existing provenance marker into its parent, and no model or effort', async () => {
  const l = layout();
  try {
    const completion = await formation(l, { at: '2026-09-19T13:00:00.000Z', attribution: { gameId: GAME, clientRef: 'play_alpha' } });
    const text = fs.readFileSync(completion.resultPath, 'utf8');
    assert.ok(text.startsWith('<!-- sideline-provenance: '), 'the marker is the first line, inside the parser\'s head window');
    assert.match(text, /\nSCOUT FORMATION RESULT\n/, 'the human-readable parent is otherwise unchanged');
    assert.equal(text.match(/sideline-provenance/g).length, 1, 'exactly one marker');
    const provenance = parseReportProvenance(text);
    assert.deepEqual(JSON.parse(JSON.stringify(provenance)), {
      gameId: GAME, clientRef: 'play_alpha', playerInstanceId: 'scout', playerType: 'scout',
      provider: 'scout-formation', at: completion.endedAt
    });
    assert.equal(provenance.model, undefined, 'one parent spans N receivers, so no model is claimed');
    assert.equal(provenance.effort, undefined);
    assert.equal(fs.readFileSync(path.join(completion.workspacePath, PARENT), 'utf8'), text, 'workspace copy matches the durable parent');
  } finally { l.cleanup(); }
});

test('Durable-3b. A Formation with no known Game/Play (CLI) is not given invented attribution', async () => {
  const l = layout();
  try {
    const completion = await formation(l, { at: '2026-09-19T13:00:00.000Z' });
    const text = fs.readFileSync(completion.resultPath, 'utf8');
    assert.equal(parseReportProvenance(text), undefined);
    assert.ok(text.startsWith('SCOUT FORMATION RESULT'));
    let minute = 5;
    for (const partial of [{ gameId: GAME, clientRef: '' }, { gameId: '', clientRef: 'p' }]) {
      const again = await formation(l, { at: `2026-09-19T13:0${minute++}:00.000Z`, attribution: partial });
      assert.equal(parseReportProvenance(fs.readFileSync(again.resultPath, 'utf8')), undefined, 'a half-known attribution is not stamped');
    }
  } finally { l.cleanup(); }
});

test('Durable-4. Children are relative to the Formation folder, only for receivers that produced a report, and are never absolute', async () => {
  const l = layout();
  try {
    const completion = await formation(l, {
      at: '2026-09-19T13:00:00.000Z',
      attribution: { gameId: GAME, clientRef: 'play_alpha' },
      candidates: [fakeCandidate('one'), fakeCandidate('two', 'BLOCKED'), fakeCandidate('three')]
    });
    assert.deepEqual(completion.children, ['one-SCOUT-REPORT.md', 'three-SCOUT-REPORT.md']);
    for (const child of completion.children) {
      assert.equal(path.isAbsolute(child), false);
      assert.ok(!child.includes('\\'), 'forward slashes');
      assert.ok(fs.existsSync(path.join(path.dirname(completion.resultPath), child)), 'each reference resolves inside the Formation folder');
    }
    const onDisk = JSON.parse(fs.readFileSync(path.join(path.dirname(completion.resultPath), 'FORMATION-COMPLETE.json'), 'utf8'));
    assert.deepEqual(onDisk.children, completion.children, 'the durable metadata carries the same references');
  } finally { l.cleanup(); }
});

// --- Source discovery ----------------------------------------------------------------

test('Durable-5. The source discovers only this Game\'s trusted parents: never children, other Games, unattributed or malformed artifacts', async () => {
  const l = layout();
  try {
    const mine = await formation(l, { at: '2026-09-19T13:00:00.000Z', attribution: { gameId: GAME, clientRef: 'play_mine' } });
    const theirs = await formation(l, { at: '2026-09-19T13:10:00.000Z', attribution: { gameId: OTHER_GAME, clientRef: 'play_theirs' } });
    const legacy = await formation(l, { at: '2026-09-19T13:20:00.000Z' }); // no marker: predates self-description

    const hostile = (name, body) => {
      const dir = path.join(l.formations, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, PARENT), body);
    };
    hostile('Scout-Formation__malformed', `<!-- sideline-provenance: {not json -->\n# x`);
    hostile('Scout-Formation__wrong-player', `${formatReportProvenance({ gameId: GAME, clientRef: 'p', playerInstanceId: 'claude-1a2b3c4d', playerType: 'claude', provider: 'claude', at: 'x' })}\n# x`);
    hostile('Scout-Formation__no-play', `${formatReportProvenance({ gameId: GAME, playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation', at: 'x' })}\n# x`);
    hostile('Scout-Formation__lookalike', `${formatReportProvenance({ gameId: GAME, clientRef: 'p', playerInstanceId: 'Scout', playerType: 'scout', provider: 'scout-formation', at: 'x' })}\n# x`);
    fs.mkdirSync(path.join(l.formations, 'not a valid id!'), { recursive: true });
    fs.writeFileSync(path.join(l.formations, 'not a valid id!', PARENT), `${formatReportProvenance({ gameId: GAME, clientRef: 'p', playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation', at: 'x' })}\n# x`);
    fs.writeFileSync(path.join(l.formations, 'stray-file.md'), 'not a formation');

    const source = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot });
    const found = await source.list(GAME, { project: 'Durable Game' });
    assert.equal(found.length, 1, 'exactly one trusted parent for this Game');
    const [parent] = found;
    assert.equal(parent.path, mine.resultPath, 'exact path');
    assert.equal(parent.filename, PARENT);
    assert.equal(parent.agent, 'Scout');
    assert.equal(parent.gameId, GAME);
    assert.equal(parent.project, 'Durable Game');
    assert.equal(parent.provenance.playerInstanceId, 'scout', 'logical Scout ownership');
    assert.equal(parent.provenance.clientRef, 'play_mine');
    assert.equal(parent.content, fs.readFileSync(mine.resultPath, 'utf8'));
    assert.ok(!found.some((item) => item.path.endsWith('-SCOUT-REPORT.md')), 'receiver child reports are never enumerated');
    assert.ok(mine.children.length === 2 && fs.existsSync(path.join(path.dirname(mine.resultPath), mine.children[0])), 'the children exist on disk but are not published');

    const other = await source.list(OTHER_GAME);
    assert.deepEqual(other.map((item) => item.path), [theirs.resultPath]);
    assert.ok(!(await source.list(GAME)).some((item) => item.path === legacy.resultPath), 'an unattributed parent is not guessed into a Game');
    assert.deepEqual(await source.list('unknown'), []);
    assert.deepEqual(await source.list(''), []);
  } finally { l.cleanup(); }
});

test('Durable-6. Listing is deterministic, newest first, and bounded', async () => {
  const l = layout();
  try {
    const made = [];
    for (let i = 0; i < 14; i += 1) {
      const c = await formation(l, { at: `2026-09-19T13:${String(i).padStart(2, '0')}:00.000Z`, attribution: { gameId: GAME, clientRef: `play_${i}` }, candidates: [fakeCandidate('one')] });
      touch(c.resultPath, `2026-09-19T14:${String(i).padStart(2, '0')}:00.000Z`);
      made.push(c);
    }
    const source = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot });
    const first = await source.list(GAME);
    assert.equal(first.length, 10, 'bounded');
    assert.deepEqual(first.map((item) => item.provenance.clientRef), ['play_13', 'play_12', 'play_11', 'play_10', 'play_9', 'play_8', 'play_7', 'play_6', 'play_5', 'play_4'], 'newest first');
    assert.deepEqual((await source.list(GAME)).map((item) => item.path), first.map((item) => item.path), 'deterministic across calls');
    assert.equal((await source.list(GAME, { limit: 3 })).length, 3);
    assert.equal((await source.list(GAME, { limit: 999 })).length, 10, 'a caller cannot exceed the bound');
  } finally { l.cleanup(); }
});

test('Durable-7. A missing or empty Scout Intelligence root is simply no reports, not an error', async () => {
  const l = layout();
  try {
    assert.deepEqual(await new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot }).list(GAME), []);
    assert.deepEqual(await new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: path.join(l.root, 'does-not-exist') }).list(GAME), []);
    assert.throws(() => new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: 'relative/root' }), /absolute/);
  } finally { l.cleanup(); }
});

test('Durable-7b. A linked Formation folder cannot redirect the source outside its root', async (t) => {
  const l = layout();
  try {
    const outside = path.join(l.root, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, PARENT), `${formatReportProvenance({ gameId: GAME, clientRef: 'p', playerInstanceId: 'scout', playerType: 'scout', provider: 'scout-formation', at: 'x' })}\n# escaped`);
    try { fs.symlinkSync(outside, path.join(l.formations, 'Scout-Formation__linked'), 'junction'); }
    catch { t.skip('this environment cannot create directory links'); return; }
    assert.deepEqual(await new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot }).list(GAME), []);
  } finally { l.cleanup(); }
});

test('Durable-8. The watch contract covers parent artifacts only, under the Formations folder only', () => {
  const l = layout();
  try {
    const source = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot });
    assert.deepEqual(source.roots(), [l.formations]);
    assert.equal(source.parentGlob, '**/FORMATION-RESULT.md');
    assert.ok(!source.roots().some((root) => root === l.scoutRoot), 'never the whole Scout Intelligence tree');
    const extension = fs.readFileSync(path.join(repoRoot, 'src', 'extension.ts'), 'utf8');
    assert.match(extension, /new ScoutIntelligenceReportSource\(\{ scoutIntelligenceRoot: scoutDurableReportRoot \}\)/);
    assert.match(extension, /scoutReportSource\.roots\(\)\.map\(\(root\) => new vscode\.RelativePattern\(vscode\.Uri\.file\(root\), scoutReportSource\.parentGlob\)\)/);
    assert.match(extension, /scoutPlayer,\s*scoutAvailable,\s*scoutReportSource,/, 'handed to the Stadium');
    assert.ok(!/reportGlobs[^\n]*scout/i.test(extension), 'no Game coach.reportGlobs configuration is involved');
  } finally { l.cleanup(); }
});

// --- Merge semantics -------------------------------------------------------------------

test('Durable-9. The same path is one report: disk wins, a registration only adds what disk did not return', () => {
  const item = (p, mtime, content) => ({ gameId: GAME, project: 'G', agent: 'Scout', filename: PARENT, path: p, mtime, content });
  const dir = path.join(os.tmpdir(), 'merge-fixture');
  const a = path.join(dir, 'A', PARENT);
  const b = path.join(dir, 'B', PARENT);
  const c = path.join(dir, 'C', PARENT);
  const merged = mergeSidelineOwnedParents(
    [item(a, 300, 'disk-A'), item(c, 100, 'disk-C')],
    [item(a, 300, 'memory-A'), item(b, 200, 'memory-B')]
  );
  assert.deepEqual(merged.map((entry) => [path.basename(path.dirname(entry.path)), entry.content]), [['A', 'disk-A'], ['B', 'memory-B'], ['C', 'disk-C']]);
  assert.equal(mergeSidelineOwnedParents([], []).length, 0);
  assert.equal(mergeSidelineOwnedParents([item(a, 1, 'x'), item(b, 2, 'y'), item(c, 3, 'z')], [], 2).length, 2, 'bounded');
  const tie = mergeSidelineOwnedParents([item(a, 5, 'x'), item(b, 5, 'y')], []);
  assert.deepEqual(tie.map((entry) => entry.path), mergeSidelineOwnedParents([item(b, 5, 'y'), item(a, 5, 'x')], []).map((entry) => entry.path), 'ties do not depend on input order');
});

// --- Restart durability: the central proof -----------------------------------------------

function stadium(l, extra = {}) {
  const frames = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: GAME, displayName: 'Durable Game', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: GAME, stadiumId: 'stadium', rootFsPath: l.gameRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    ...extra
  });
  client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
  client.connected = true;
  return { client, frames };
}
const lastReports = (frames) => frames.filter((f) => f.method === 'report.changed' || f.method === 'report.snapshot').at(-1).params.reports;

test('Durable-10. RESTART: a parent surfaced by in-memory registration is rediscovered from disk by a brand-new Stadium with no memory', async () => {
  const l = layout();
  try {
    const source = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot });
    const ordinary = { gameId: GAME, project: 'Durable Game', agent: 'Claude', filename: 'ordinary.md', path: 'Reports/Claude/ordinary.md', mtime: 1, content: 'ordinary' };
    let produced;
    const scoutPlayer = {
      capability: () => ({ state: 'ready' }),
      async execute(objective, gameRoot, options) {
        options.onSelected({ count: 2, candidateIds: ['one', 'two'] });
        produced = await runScoutFormation({
          objective, gameRoot, durableReportRoot: l.scoutRoot, candidates: [fakeCandidate('one'), fakeCandidate('two')], formationSize: 2,
          now: () => new Date('2026-09-19T13:00:00.000Z'), reportAttribution: options.reportAttribution
        });
        return { outcome: produced.outcome, formation: produced };
      }
    };

    // Runtime #1: the fast path registers the parent AND the source can see it — one report, not two.
    const first = stadium(l, { scoutPlayer, scoutReportSource: source, reportsGetter: async () => [ordinary] });
    await first.client.deliverScout({ clientRef: 'play_restart', stadiumId: first.client.stadiumId, gameId: GAME, playerInstanceId: 'scout', prompt: 'Investigate the bounded fixture surface.' });
    const before = lastReports(first.frames);
    const parents = before.filter((r) => r.path === produced.resultPath);
    assert.equal(parents.length, 1, 'transient registration and durable source are deduplicated by exact path');
    assert.equal(before[0].path, produced.resultPath, 'Scout parent merges ahead of ordinary Game reports');
    assert.ok(before.some((r) => r.path === 'Reports/Claude/ordinary.md'), 'ordinary Game reports are unchanged');
    assert.equal(parseReportProvenance(before[0].content).clientRef, 'play_restart', 'the artifact itself names the Play');

    // Runtime #1 is gone: no Map, no client, no source instance.
    first.client.scoutFormationReports.clear();
    const second = stadium(l, {
      scoutReportSource: new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot }),
      reportsGetter: async () => [ordinary]
    });
    assert.equal(second.client.scoutFormationReports.size, 0, 'the new runtime starts with no registration state');
    await second.client.sendReportSnapshot();
    const after = lastReports(second.frames);

    assert.equal(after[0].path, produced.resultPath, 'same exact path');
    assert.equal(after[0].filename, PARENT);
    assert.equal(after[0].gameId, GAME, 'exact Game attribution');
    assert.equal(after[0].agent, 'Scout');
    assert.equal(after[0].provenance.playerInstanceId, 'scout', 'logical Scout ownership');
    assert.equal(after[0].provenance.clientRef, 'play_restart', 'the exact Play, from the artifact alone');
    assert.deepEqual(after[0].provenance, before[0].provenance, 'identical provenance before and after the restart');
    assert.ok(!after.some((r) => r.path.endsWith('-SCOUT-REPORT.md')), 'receiver children are not published');
    assert.equal(after.filter((r) => r.path === produced.resultPath).length, 1);
    assert.ok(after.some((r) => r.path === 'Reports/Claude/ordinary.md'));
  } finally { l.cleanup(); }
});

test('Durable-11. RESTART: another Game\'s Stadium does not receive this Game\'s parent, and a source failure never takes ordinary reports down', async () => {
  const l = layout();
  try {
    await formation(l, { at: '2026-09-19T13:00:00.000Z', attribution: { gameId: GAME, clientRef: 'play_mine' } });
    const ordinary = { gameId: OTHER_GAME, project: 'Other', agent: 'Claude', filename: 'o.md', path: 'Reports/Claude/o.md', mtime: 1, content: 'o' };
    const { client, frames } = stadium(l, {
      scoutReportSource: new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot }),
      reportsGetter: async () => [ordinary]
    });
    client.options.gameContextGetter = () => ({
      game: { gameId: OTHER_GAME, displayName: 'Other', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium', name: 'Test', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: OTHER_GAME, stadiumId: 'stadium', rootFsPath: l.gameRoot, boundAt: Date.now(), isPrimary: true, status: 'bound' }
    });
    await client.sendReportSnapshot();
    assert.deepEqual(lastReports(frames).map((r) => r.path), ['Reports/Claude/o.md'], 'cross-Game exclusion');

    const broken = stadium(l, {
      scoutReportSource: { id: 'x', agentLabel: 'Scout', roots: () => [], parentGlob: '', list: async () => { throw new Error('disk on fire'); } },
      reportsGetter: async () => [{ ...ordinary, gameId: GAME }]
    });
    await broken.client.sendReportSnapshot();
    assert.deepEqual(lastReports(broken.frames).map((r) => r.path), ['Reports/Claude/o.md'], 'ordinary reports survive a failing source');
  } finally { l.cleanup(); }
});

// --- Acknowledgement is not disturbed ------------------------------------------------------

test('Durable-12. Rediscovery links the parent to the exact Play but never acknowledges it, and never resurrects an acknowledged one', async () => {
  const l = layout();
  try {
    const completion = await formation(l, { at: '2026-09-19T13:00:00.000Z', attribution: { gameId: GAME, clientRef: 'play_ack' } });
    const source = new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot });
    let now = 1_000;
    const ledger = new InstanceWorkLedger(() => now++);
    ledger.recordDispatch({ gameId: GAME, playerInstanceId: 'scout', playerType: 'scout', clientRef: 'play_ack', promptSummary: 'Investigate' });
    ledger.recordTurn(GAME, { instanceId: 'scout', turnRef: 't1', state: 'accepted', at: 1 });
    ledger.recordTurn(GAME, { instanceId: 'scout', turnRef: 't1', state: 'started', at: 2 });
    ledger.recordTurn(GAME, { instanceId: 'scout', turnRef: 't1', state: 'completed', summary: 'Formation complete · 2 Scouts', at: 3 });
    const view = () => projectExecution({ instanceId: 'scout', entry: ledger.get(GAME, 'scout'), executionType: 'scout-formation', now: 5_000_000 });

    // Discovery, repeated watcher events, polls and re-publishes: never an acknowledgement.
    for (let i = 0; i < 3; i += 1) ledger.recordReports(GAME, await source.list(GAME));
    let v = view();
    assert.equal(v.state, 'finished');
    assert.equal(v.report.path, completion.resultPath, 'the rediscovered artifact is linked to the exact Play through its own provenance');
    assert.equal(v.report.acknowledged, false, 'discovery/watch/poll does not acknowledge');
    assert.equal(ledger.get(GAME, 'scout').reports[0].attribution, 'explicit-provenance');

    // Intentional open -> existing acknowledgement -> a later rediscovery (restart) does not bring it back.
    assert.equal(ledger.acknowledge({ gameId: GAME, instanceId: 'scout', playRef: 'play_ack', reportPath: completion.resultPath }).changed, true);
    assert.equal(view().state, 'idle');
    ledger.recordReports(GAME, await new ScoutIntelligenceReportSource({ scoutIntelligenceRoot: l.scoutRoot }).list(GAME));
    assert.equal(view().state, 'idle', 'rediscovery after acknowledgement leaves the card cleared');
  } finally { l.cleanup(); }
});
