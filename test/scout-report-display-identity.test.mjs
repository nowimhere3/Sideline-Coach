// BREADCRUMB: SCOUT-REPORT-DISPLAY-IDENTITY
//
// Proofs for:
// 1. Scout FORMATION-RESULT gets objective-based human label.
// 2. 12h renders AM/PM.
// 3. 24h renders 24-hour time.
// 4. missing/unusable Objective falls back to Formation Result.
// 5. ordinary Claude/Codex/AntiGravity report labels remain byte-equivalent to current behavior.
// 6. underlying Scout path/filename stays FORMATION-RESULT.md.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => wait(15);

const GAME = 'game_scout_test';
// 2026-09-21T05:49:00 in America/Edmonton (UTC-6) -> 2026-09-21T11:49:00Z
const FIXED_TIME = new Date('2026-09-21T11:49:00Z').getTime();

function createTestHarness({ timeFormat = '12h', initialReports = [] } = {}) {
  const elements = new Map();
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '',
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: {
        classes: new Set(),
        add(...t) { for (const x of t) this.classes.add(x); },
        remove(...t) { for (const x of t) this.classes.delete(x); },
        toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
        contains(c) { return this.classes.has(c); }
      },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child));
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    Object.defineProperty(node, 'innerHTML', {
      get: () => '',
      set: () => { for (const c of node.children) c.parentNode = null; node.children = []; }
    });
    return node;
  };

  const $ = (id) => { if (!elements.has(id)) elements.set(id, makeNode(id)); return elements.get(id); };

  let source;
  class FakeEventSource {
    constructor() { this.listeners = {}; source = this; }
    addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); }
    emit(e, d = {}) { for (const fn of this.listeners[e] || []) fn({ data: JSON.stringify(d) }); }
    close() {}
  }

  let currentReports = [...initialReports];
  const status = {
    success: true, connected: true, connectionStatus: 'connected', selectedGameId: GAME,
    game: { gameId: GAME, displayName: 'Scout Test Game' },
    games: [{ gameId: GAME, displayName: 'Scout Test Game', connectionStatus: 'connected' }],
    stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
    rosterSynchronized: true, players: [], capabilities: [], queue: [],
    routing: { mode: 'auto', capabilities: [], activeDecision: null },
    routingMode: 'auto', reports: currentReports,
    preferences: { runningPlayers: 'ask', devMode: false, timeFormat }
  };

  const ctx = {
    document: {
      getElementById: $,
      querySelectorAll: () => [],
      createElement: (tag) => makeNode('', tag),
      addEventListener() {},
      body: makeNode('body'),
      activeElement: null
    },
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: async (url) => {
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, currentReports);
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) super(FIXED_TIME);
        else super(...args);
      }
      static now() { return FIXED_TIME; }
    },
    console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { isSecureContext: true }
  };

  vm.createContext(ctx);
  vm.runInContext(pageScript, ctx);

  return {
    $,
    ctx,
    harness: ctx.__sidelineCoach,
    setReports: (reports) => {
      currentReports = reports;
      status.reports = reports;
      source.emit('status', status);
    },
    start: async () => {
      source.emit('hello');
      const end = Date.now() + 2_000;
      while (Date.now() < end && $('connectionText').textContent !== 'Coach Online') await wait(5);
      assert.equal($('connectionText').textContent, 'Coach Online', 'page connected');
      source.emit('status', status);
      await flush();
    }
  };
}

test('1. Scout FORMATION-RESULT gets objective-based human label', async () => {
  const formationReport = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: 'C:\\Project\\.sideline\\Formations\\formation-1\\FORMATION-RESULT.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `<!-- sideline-provenance: {"schemaVersion":1} -->
SCOUT FORMATION RESULT

Play: 20260921-0549

Objective:
SCOUT PLAY
— AI HEALTH / CAPACITY SELF-IDENTIFICATION

Scouts requested: 3
Completed: 3
Failed: 0
Outcome: COMPLETE`
  };

  const { $, start } = createTestHarness({ timeFormat: '12h', initialReports: [formationReport] });
  await start();

  const select = $('reportSelect');
  assert.equal(select.children.length, 1);

  // Desired display in dropdown option text:
  const expectedLabel = 'Scout • AI Health / Capacity Self-Identification • September 21, 2026 · 5:49 AM';
  assert.equal(select.children[0].textContent, expectedLabel);

  // Desired display in selected report header:
  assert.equal($('reportFilename').textContent, expectedLabel);
});

test('2. 12h renders AM/PM', async () => {
  const formationReport = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: 'C:\\Project\\.sideline\\Formations\\formation-1\\FORMATION-RESULT.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `SCOUT FORMATION RESULT

Play: 20260921-0549

Objective:
SCOUT PLAY
— AI HEALTH / CAPACITY SELF-IDENTIFICATION

Scouts requested: 2`
  };

  const { $, start } = createTestHarness({ timeFormat: '12h', initialReports: [formationReport] });
  await start();

  assert.match($('reportFilename').textContent, /September 21, 2026 · 5:49 AM$/);
  assert.match($('reportSelect').children[0].textContent, /September 21, 2026 · 5:49 AM$/);
});

test('3. 24h renders 24-hour time', async () => {
  const formationReport = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: 'C:\\Project\\.sideline\\Formations\\formation-1\\FORMATION-RESULT.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `SCOUT FORMATION RESULT

Play: 20260921-0549

Objective:
SCOUT PLAY
— AI HEALTH / CAPACITY SELF-IDENTIFICATION

Scouts requested: 2`
  };

  const { $, start } = createTestHarness({ timeFormat: '24h', initialReports: [formationReport] });
  await start();

  const expected24 = 'Scout • AI Health / Capacity Self-Identification • September 21, 2026 · 05:49';
  assert.equal($('reportFilename').textContent, expected24);
  assert.equal($('reportSelect').children[0].textContent, expected24);
});

test('4. missing/unusable Objective falls back to Formation Result', async () => {
  // Case 4a: Report content has no Objective section
  const reportNoObj = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: 'C:\\Project\\.sideline\\Formations\\f-no-obj\\FORMATION-RESULT.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `SCOUT FORMATION RESULT

Play: 20260921-0549

Scouts requested: 2`
  };

  const { $, start, setReports } = createTestHarness({ timeFormat: '12h', initialReports: [reportNoObj] });
  await start();

  const expectedFallback = 'Scout • Formation Result • September 21, 2026 · 5:49 AM';
  assert.equal($('reportFilename').textContent, expectedFallback);
  assert.equal($('reportSelect').children[0].textContent, expectedFallback);

  // Case 4b: Objective has only boilerplate and dashes
  const reportBlankObj = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: 'C:\\Project\\.sideline\\Formations\\f-blank-obj\\FORMATION-RESULT.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `SCOUT FORMATION RESULT

Play: 20260921-0549

Objective:
SCOUT PLAY
—

Scouts requested: 2`
  };

  setReports([reportBlankObj]);
  await flush();

  assert.equal($('reportFilename').textContent, expectedFallback);
  assert.equal($('reportSelect').children[0].textContent, expectedFallback);
});

test('5. ordinary Claude/Codex/AntiGravity report labels remain byte-equivalent to current behavior', async () => {
  const claudeReport = {
    agent: 'Claude',
    filename: '2026-09-21-claude-analysis.md',
    path: 'C:\\Project\\REPORTS\\Claude\\2026-09-21-claude-analysis.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: '# Claude Report\nAll clear.'
  };

  const codexReport = {
    agent: 'Codex',
    filename: '2026-09-21-codex-fix.md',
    path: 'C:\\Project\\REPORTS\\Codex\\2026-09-21-codex-fix.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: '# Codex Report\nTests pass.'
  };

  const agReport = {
    agent: 'AntiGravity',
    filename: '2026-09-21-antigravity-plan.md',
    path: 'C:\\Project\\REPORTS\\AntiGravity\\2026-09-21-antigravity-plan.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: '# AntiGravity Report\nPlan approved.'
  };

  const scoutChildReport = {
    agent: 'Scout',
    filename: 'Scout-1-recon.md',
    path: 'C:\\Project\\.sideline\\Formations\\formation-1\\Scout-1-recon.md',
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: 'Child report.'
  };

  const reports = [claudeReport, codexReport, agReport, scoutChildReport];
  const { $, start } = createTestHarness({ timeFormat: '12h', initialReports: reports });
  await start();

  const select = $('reportSelect');
  assert.equal(select.children.length, 4);

  // Dropdown options must match current `${report.agent} • ${report.filename}` byte-for-byte
  assert.equal(select.children[0].textContent, 'Claude • 2026-09-21-claude-analysis.md');
  assert.equal(select.children[1].textContent, 'Codex • 2026-09-21-codex-fix.md');
  assert.equal(select.children[2].textContent, 'AntiGravity • 2026-09-21-antigravity-plan.md');
  assert.equal(select.children[3].textContent, 'Scout • Scout-1-recon.md');

  // Selected report header for first report (Claude) must match current report.filename byte-for-byte
  assert.equal($('reportFilename').textContent, '2026-09-21-claude-analysis.md');
});

test('6. underlying Scout path/filename stays FORMATION-RESULT.md', async () => {
  const originalPath = 'C:\\Project\\.sideline\\Formations\\formation-1\\FORMATION-RESULT.md';
  const formationReport = {
    agent: 'Scout',
    filename: 'FORMATION-RESULT.md',
    path: originalPath,
    mtime: FIXED_TIME,
    project: 'Scout Test Game',
    content: `SCOUT FORMATION RESULT

Play: 20260921-0549

Objective:
SCOUT PLAY
— AI HEALTH / CAPACITY SELF-IDENTIFICATION

Scouts requested: 3`
  };

  const { $, start } = createTestHarness({ timeFormat: '12h', initialReports: [formationReport] });
  await start();

  // The underlying report object properties remain unmodified:
  assert.equal(formationReport.filename, 'FORMATION-RESULT.md');
  assert.equal(formationReport.path, originalPath);

  // reportMeta display retains truthful path:
  assert.match($('reportMeta').textContent, /FORMATION-RESULT\.md/);
});
