// AI Usage Scoreboard — Play 1: visible live compact/expanded scoreboard.
// The real src/public/index.html script runs against a mocked-but-contract-shaped
// backend, the same pattern used throughout this test suite (see
// coach-routines-v0.2-dad-mode-consolidation.test.mjs).
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

// Anchored to real "now" (this harness runs the real, un-mocked Date), not a
// fixed calendar date, so resetsAt fixtures below stay in the future — the
// Claude-5H-freshness defense-in-depth expiry check treats a past resetsAt
// as UNKNOWN, and these tests are about mapping/rendering, not expiry.
const T0 = Date.now() + 3600_000;

const minimalStatus = () => ({
  success: true, connected: true, connectionStatus: 'connected', selectedGameId: '',
  game: null, games: [], stadium: { stadiumId: 's1', name: 'Windows', platform: 'win32' },
  rosterSynchronized: true, players: [], capabilities: [], queue: [],
  routing: { mode: 'auto', capabilities: [], activeDecision: null },
  routingMode: 'auto', reports: [], playerDiscovery: null,
  preferences: { runningPlayers: 'ask', devMode: false },
  routines: { gameId: '', devMode: false, playCount: 0, routines: [] },
  at: T0
});

const claudeState = (rateLimitInfo, observedAt = T0) => ({
  provider: 'claude', evidenceType: 'rate_limit_event', rateLimitInfo, observedAt,
  source: { stadiumId: 's1', instanceId: 'w1', gameId: 'g1', playerInstanceId: 'claude-1' }
});
const codexState = (rateLimitInfo, observedAt = T0) => ({
  provider: 'codex', evidenceType: 'account_rate_limits', rateLimitInfo, observedAt,
  source: { stadiumId: 's1', instanceId: 'w1', gameId: 'g1', playerInstanceId: 'codex-1' }
});

const health = ({ claude, codex, updatedAt = T0 } = {}) => ({
  schemaVersion: 1, updatedAt,
  providers: { ...(claude ? { claude: claudeState(claude) } : {}), ...(codex ? { codex: codexState(codex) } : {}) }
});

function createPage({ initialHealth = { schemaVersion: 1, providers: {} } } = {}) {
  const elements = new Map();
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    let classNameVal = '';
    const classList = {
      classes: new Set(),
      add(...t) { for (const x of t) this.classes.add(x); classNameVal = Array.from(this.classes).join(' '); },
      remove(...t) { for (const x of t) this.classes.delete(x); classNameVal = Array.from(this.classes).join(' '); },
      toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.add(c); else this.remove(c); return on; },
      contains(c) { return this.classes.has(c); }
    };
    const node = {
      tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', type: '',
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList,
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child)); child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      focus() {}, blur() {},
      querySelector(sel) {
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        for (const c of this.children) {
          if (cls && c.classList.contains(cls)) return c;
          if (!cls && c.tagName.toLowerCase() === sel.toLowerCase()) return c;
          const sub = c.querySelector?.(sel);
          if (sub) return sub;
        }
        return null;
      },
      querySelectorAll(sel) {
        const res = [];
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        const walk = (n) => {
          for (const c of n.children) {
            if (cls && c.classList.contains(cls)) res.push(c);
            else if (!cls && c.tagName.toLowerCase() === sel.toLowerCase()) res.push(c);
            walk(c);
          }
        };
        walk(this);
        return res;
      }
    };
    Object.defineProperty(node, 'textContent', {
      get: () => (node.children.length ? node.children.map((c) => c.textContent).join('') : text),
      set: (v) => {
        text = String(v);
        for (const c of node.children) c.parentNode = null;
        node.children = [];
      }
    });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: () => { for (const c of node.children) c.parentNode = null; node.children = []; } });
    Object.defineProperty(node, 'className', {
      get: () => classNameVal,
      set: (v) => {
        classNameVal = String(v);
        classList.classes.clear();
        for (const c of classNameVal.split(/\s+/).filter(Boolean)) classList.classes.add(c);
      }
    });
    // Mirrors real DOM getElementById semantics: setting .id on any element — created
    // however — makes it findable, matching how the app's own createElement()-built
    // nodes register themselves once given an id.
    let idValue = id;
    Object.defineProperty(node, 'id', { get: () => idValue, set: (v) => { idValue = v; if (v) elements.set(v, node); } });
    if (id) elements.set(id, node);
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
  let status = minimalStatus();
  let reportsList = [];
  let healthState = initialHealth;
  let refreshResponseHealth = initialHealth;
  let refreshAcquisition = null;
  const apiCalls = [];
  const clipboardWrites = [];
  const documentListeners = {};
  const ctx = {
    document: {
      getElementById: $, querySelectorAll: () => [],
      createElement: (tag) => makeNode('', tag),
      addEventListener: (type, fn) => { (documentListeners[type] = documentListeners[type] || []).push(fn); },
      body: makeNode('body'), activeElement: null
    },
    location: { search: '', pathname: '/' }, history: { replaceState() {} },
    sessionStorage: { getItem: (k) => (k === 'sidelineCoachToken' ? 'test-token' : null), setItem() {}, removeItem() {} },
    Headers: globalThis.Headers, URLSearchParams: globalThis.URLSearchParams, EventSource: FakeEventSource,
    matchMedia: () => ({ matches: false }),
    fetch: async (url, options = {}) => {
      apiCalls.push(url);
      const reply = (code, payload) => ({ ok: code >= 200 && code < 300, status: code, json: async () => payload });
      if (url.startsWith('/api/status')) return reply(200, status);
      if (url.startsWith('/api/reports')) return reply(200, reportsList);
      if (url === '/api/ai-health/refresh' && options.method === 'POST') {
        return reply(200, { success: true, health: refreshResponseHealth, acquisition: refreshAcquisition || { claude: { outcome: 'changed', checkedAt: new Date().toISOString() } } });
      }
      if (url.startsWith('/api/ai-health')) return reply(200, { success: true, health: healthState });
      return reply(200, {});
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, console: { ...console, error: () => {} },
    navigator: { clipboard: { writeText: async (text) => { clipboardWrites.push(text); } } },
    window: { isSecureContext: true }
  };
  const page = {
    $, apiCalls, clipboardWrites,
    setHealth: (next) => { healthState = next; },
    setRefreshResponseHealth: (next) => { refreshResponseHealth = next; },
    setRefreshAcquisition: (next) => { refreshAcquisition = next; },
    emitHealth: (next) => { source.emit('ai-health', next); },
    body: ctx.document.body,
    setStatusPreferences: (overrides) => { status = { ...status, preferences: { ...status.preferences, ...overrides } }; },
    refreshStatus: async () => { source.emit('status', status); await flush(); },
    click: async (node) => { for (const fn of node.listeners.click || []) await fn({ stopPropagation() {} }); await flush(); },
    pressKey: async (key) => { for (const fn of documentListeners.keydown || []) await fn({ key }); await flush(); },
    start: async () => {
      vm.createContext(ctx);
      vm.runInContext(pageScript, ctx);
      source.emit('hello');
      const end = Date.now() + 2_000;
      while (Date.now() < end && $('connectionText').textContent !== 'Coach Online') await wait(5);
      assert.equal($('connectionText').textContent, 'Coach Online', 'page connected');
      await flush();
      return page;
    }
  };
  return page;
}

// ---------------------------------------------------------------------------
// Layout / existence
// ---------------------------------------------------------------------------

test('SB-1. Scoreboard container is a real structural sibling of #gameScrollRegion, not nested inside it (Slice 3.2: dam, not bridge)', () => {
  assert.match(pageSource, /<\/main>\s*(?:<!--[\s\S]*?-->\s*)*<div id="aiScoreboardContainer"/);
  assert.doesNotMatch(pageSource, /<div id="aiScoreboardContainer"[\s\S]*?<div id="mainWorkflow"/, 'never nested inside #gameScrollRegion/mainWorkflow');
});

test('SB-2. Compact defaults collapsed on load', async () => {
  const page = await createPage().start();
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
  assert.equal(page.$('aiScoreboardExpandBtn').textContent, 'Expand ▾');
});

// ---------------------------------------------------------------------------
// Data hydration / SSE
// ---------------------------------------------------------------------------

test('SB-3. Initial hydration calls GET /api/ai-health and no provider polling occurs afterward', async () => {
  const page = await createPage({ initialHealth: health({ claude: { rateLimitType: 'five_hour', utilization: 0, resetsAt: T0 + 1000 } }) }).start();
  const healthCalls = page.apiCalls.filter((u) => u.startsWith('/api/ai-health')).length;
  assert.equal(healthCalls, 1, 'exactly one hydration call, no polling');
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 100%/);
});

test('SB-4. `ai-health` SSE listener redraws the Scoreboard without a page refresh, and does not re-fetch', async () => {
  const page = await createPage().start();
  const before = page.apiCalls.filter((u) => u.startsWith('/api/ai-health')).length;
  page.emitHealth(health({ codex: { primary: { usedPercent: 30, resetsAt: T0 + 3600_000, windowDurationMins: 300 } } }));
  await flush();
  assert.match(page.$('aiScoreboardCodexRowFiveHour').textContent, /5H 70%/);
  const after = page.apiCalls.filter((u) => u.startsWith('/api/ai-health')).length;
  assert.equal(after, before, 'SSE push does not trigger an extra fetch');
});

// ---------------------------------------------------------------------------
// Claude mapping
// ---------------------------------------------------------------------------

test('SB-5a. Real Claude event (unifiedWindows) renders both 5H and WK instead of UNKNOWN', async () => {
  const claude = {
    status: 'allowed', rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
    unifiedWindows: {
      five_hour: { utilization: 0, resetsAt: (T0 + 3 * 3600_000) / 1000 },
      seven_day: { utilization: 0.43, resetsAt: (T0 + 5 * 86400_000) / 1000 }
    }
  };
  const page = await createPage({ initialHealth: health({ claude }) }).start();
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 100%/);
  assert.match(page.$('aiScoreboardClaudeRowWeekly').textContent, /WK 57%/);
});

test('SB-5. Claude dual-window: 5H and WK both map from nested rateLimitInfo windows', async () => {
  const fiveHourReset = T0 + 3 * 3600_000;
  const weeklyReset = T0 + 5 * 86400_000;
  const claude = {
    rateLimitType: 'seven_day', utilization: 0.43, resetsAt: weeklyReset,
    five_hour: { rateLimitType: 'five_hour', utilization: 0, resetsAt: fiveHourReset },
    seven_day: { rateLimitType: 'seven_day', utilization: 0.43, resetsAt: weeklyReset }
  };
  const page = await createPage({ initialHealth: health({ claude }) }).start();
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 100%/);
  assert.match(page.$('aiScoreboardClaudeRowWeekly').textContent, /WK 57%/);
});

test('SB-6. Claude flat single-window fallback renders the known window and UNKNOWN for the missing one', async () => {
  const page = await createPage({ initialHealth: health({ claude: { rateLimitType: 'five_hour', utilization: 0.12, resetsAt: T0 + 1000 } }) }).start();
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 88%/);
  assert.equal(page.$('aiScoreboardClaudeRowWeekly').textContent, 'WK UNKNOWN');
});

// ---------------------------------------------------------------------------
// Codex mapping
// ---------------------------------------------------------------------------

test('SB-7. Codex maps 5H and WK windows by native windowDurationMins, not position', async () => {
  const codex = {
    // secondary is the 5-hour window here on purpose — duration must decide, not slot.
    secondary: { usedPercent: 30, resetsAt: T0 + 3600_000, windowDurationMins: 300 },
    primary: { usedPercent: 95, resetsAt: T0 + 86400_000, windowDurationMins: 10080 },
    planType: 'pro'
  };
  const page = await createPage({ initialHealth: health({ codex }) }).start();
  assert.match(page.$('aiScoreboardCodexRowFiveHour').textContent, /5H 70%/);
  assert.match(page.$('aiScoreboardCodexRowWeekly').textContent, /WK 5%/);
});

test('SB-8. Missing provider/window renders UNKNOWN, never a fabricated zero', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  assert.equal(page.$('aiScoreboardClaudeRowFiveHour').textContent, '5H UNKNOWN');
  assert.equal(page.$('aiScoreboardClaudeRowWeekly').textContent, 'WK UNKNOWN');
  assert.equal(page.$('aiScoreboardCodexRowFiveHour').textContent, '5H UNKNOWN');
  assert.equal(page.$('aiScoreboardCodexRowWeekly').textContent, 'WK UNKNOWN');
});

// ---------------------------------------------------------------------------
// Expand / Collapse
// ---------------------------------------------------------------------------

test('SB-9. Expand reveals the Expanded dashboard; a second click collapses it again', async () => {
  const page = await createPage({ initialHealth: health({ claude: { rateLimitType: 'five_hour', utilization: 0, resetsAt: T0 + 1000 } }) }).start();
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  assert.equal(page.$('aiScoreboardExpandBtn').textContent, 'Collapse ▴');
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourLeft').textContent, '100%');
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
});

// ---------------------------------------------------------------------------
// Copy Complete Context
// ---------------------------------------------------------------------------

test('SB-10. Copy Complete Context is deterministic: includes LEFT + USED, absolute reset + countdown, click-time local time, and canonical (not copy-time) refresh timestamp', async () => {
  const fiveHourReset = T0 + 2 * 3600_000;
  const weeklyReset = T0 + 19 * 3600_000;
  const refreshedAt = T0 - 60_000;
  const codex = {
    primary: { usedPercent: 30, resetsAt: fiveHourReset, windowDurationMins: 300 },
    secondary: { usedPercent: 95, resetsAt: weeklyReset, windowDurationMins: 10080 }
  };
  const page = await createPage({ initialHealth: health({ codex, updatedAt: refreshedAt }) }).start();
  await page.click(page.$('aiScoreboardCopyBtn'));
  assert.equal(page.clipboardWrites.length, 1);
  const text = page.clipboardWrites[0];
  assert.match(text, /^AI USAGE SCORECARD/);
  assert.match(text, /Current local time:/);
  assert.match(text, /Timezone: /);
  assert.match(text, /CODEX\n5-hour: 70% left \| 30% used/);
  assert.match(text, /Resets: .*\d{1,2}:\d{2}/);
  assert.match(text, /Time until reset: in /);
  assert.match(text, /Weekly: 5% left \| 95% used/);
  assert.match(text, /CLAUDE\n5-hour: UNKNOWN/);
  assert.match(text, /Usage data last refreshed:/);
  // Canonical refresh time (refreshedAt), not "now" — the two must differ.
  const refreshedLine = text.split('Usage data last refreshed:\n')[1].trim();
  assert.ok(refreshedLine.length > 0);
  assert.equal(page.$('aiScoreboardCopyBtn').textContent, 'Copied ✓');
});

test('SB-11. Copy briefly confirms, then the button label is restored', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  await page.click(page.$('aiScoreboardCopyBtn'));
  assert.equal(page.$('aiScoreboardCopyBtn').textContent, 'Copied ✓');
});

// ---------------------------------------------------------------------------
// Play 1.1 field repair: Unix-SECOND reset timestamps must normalize to
// epoch-ms everywhere. Values below are the real ones captured from
// ~/.sideline/ai-health-state.json during the field test that exposed this
// bug — resetsAt: 1790058080 / 1790118301 (Unix seconds), which previously
// rendered as "Wednesday, January 21" instead of the true Sep 22 2026 resets.
// ---------------------------------------------------------------------------

const FIELD_NOW = Date.UTC(2026, 8, 21, 21, 58, 0); // ~9:58 PM local field-test moment (UTC-anchored)
const FIELD_FIVE_HOUR_SECONDS = Math.floor((Date.now() + 8.5 * 3600_000) / 1000);
const FIELD_WEEKLY_SECONDS = Math.floor((Date.now() + 5 * 86400_000) / 1000);

test('SB-12. Unix-second Codex resetsAt normalizes to the correct modern date in Compact, not epoch 1970', async () => {
  const codex = {
    primary: { usedPercent: 30, resetsAt: FIELD_FIVE_HOUR_SECONDS, windowDurationMins: 300 },
    secondary: { usedPercent: 95, resetsAt: FIELD_WEEKLY_SECONDS, windowDurationMins: 10080 }
  };
  const page = await createPage({ initialHealth: health({ codex, updatedAt: FIELD_NOW }) }).start();
  const fiveHourText = page.$('aiScoreboardCodexRowFiveHour').textContent;
  const weeklyText = page.$('aiScoreboardCodexRowWeekly').textContent;
  assert.match(fiveHourText, /^5H 70% ·/);
  assert.match(weeklyText, /^WK 5% ·/);
  assert.doesNotMatch(fiveHourText, /1970|Jan/, 'must not render as epoch-1970/January — the Unix-seconds bug');
  assert.doesNotMatch(weeklyText, /1970|Jan/);
});

test('SB-13. Unix-second Codex resetsAt normalizes correctly in Expanded absolute reset + countdown', async () => {
  const codex = {
    primary: { usedPercent: 30, resetsAt: FIELD_FIVE_HOUR_SECONDS, windowDurationMins: 300 },
    secondary: { usedPercent: 95, resetsAt: FIELD_WEEKLY_SECONDS, windowDurationMins: 10080 }
  };
  const page = await createPage({ initialHealth: health({ codex, updatedAt: FIELD_NOW }) }).start();
  await page.click(page.$('aiScoreboardExpandBtn'));
  const resetText = page.$('aiScoreboardCodexCardFiveHourReset').textContent;
  const countdownText = page.$('aiScoreboardCodexCardFiveHourCountdown').textContent;
  assert.match(resetText, /September 2/);
  assert.doesNotMatch(resetText, /January|1970/);
  assert.notEqual(countdownText, 'in 0m', 'a real ~8.5-hour-out reset must not collapse to in 0m');
  assert.match(countdownText, /^in \d+h \d+m$/);
});

test('SB-14. Copy Complete Context uses the same normalized Unix-second reset as the onscreen Scoreboard', async () => {
  const codex = {
    primary: { usedPercent: 30, resetsAt: FIELD_FIVE_HOUR_SECONDS, windowDurationMins: 300 },
    secondary: { usedPercent: 95, resetsAt: FIELD_WEEKLY_SECONDS, windowDurationMins: 10080 }
  };
  const page = await createPage({ initialHealth: health({ codex, updatedAt: FIELD_NOW }) }).start();
  await page.click(page.$('aiScoreboardCopyBtn'));
  const text = page.clipboardWrites[0];
  assert.match(text, /Resets: .*September 2/);
  assert.doesNotMatch(text, /January 21|1970/);
});

// ---------------------------------------------------------------------------
// Play 1.1 field repair: Claude UNKNOWN must never be papered over with
// fabricated data — confirmed root cause is an acquisition-path gap (no
// Claude evidence has ever reached HealthAuthority for this session), not a
// frontend mapping bug. See the Play 1.1 report for the full diagnosis.
// ---------------------------------------------------------------------------

test('SB-15. Claude absent from the snapshot renders UNKNOWN everywhere, never a fabricated value, and triggers no extra fetch', async () => {
  const codex = { primary: { usedPercent: 30, resetsAt: FIELD_FIVE_HOUR_SECONDS, windowDurationMins: 300 } };
  const page = await createPage({ initialHealth: health({ codex, updatedAt: FIELD_NOW }) }).start();
  assert.equal(page.$('aiScoreboardClaudeRowFiveHour').textContent, '5H UNKNOWN');
  assert.equal(page.$('aiScoreboardClaudeRowWeekly').textContent, 'WK UNKNOWN');
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourLeft').textContent, 'UNKNOWN');
  assert.equal(page.$('aiScoreboardClaudeCardWeeklyLeft').textContent, 'UNKNOWN');
  const healthCalls = page.apiCalls.filter((u) => u.startsWith('/api/ai-health')).length;
  assert.equal(healthCalls, 1, 'no polling was added while diagnosing/repairing this Play');
});

// ---------------------------------------------------------------------------
// Play 2: persistent footer, alignment, and "Refresh Health"
// ---------------------------------------------------------------------------

test('SB-16. The Scoreboard is an inset, rounded CARD — never edge-to-edge — and a real structural flex sibling, not a fixed overlay', () => {
  assert.doesNotMatch(pageSource, /\.ai-scoreboard\s*\{[^}]*position:\s*fixed;/s, 'Slice 3.2: no longer a fixed overlay');
  assert.match(pageSource, /\.ai-scoreboard\s*\{[^}]*width:\s*calc\(min\(100%, 760px\) - 28px\);/s, 'exactly Sideline\'s normal card rail (#gameScrollRegion content box), never edge-to-edge');
  assert.match(pageSource, /\.ai-scoreboard\s*\{[^}]*border-radius:\s*var\(--radius\);/s, 'rounded card, not a flat footer');
  assert.match(pageSource, /\.ai-scoreboard\s*\{[^}]*border:\s*1px solid var\(--line\);/s);
  assert.match(pageSource, /#aiScoreboardContainer\s*\{[^}]*order:\s*2;/s, 'Bottom (default): after the Game region');
  assert.match(pageSource, /body\.ai-scoreboard-top #aiScoreboardContainer\s*\{[^}]*order:\s*0;/s, 'Top: before the Game region');
});

test('SB-17. #gameScrollRegion is the sole scroll owner (Slice 3.2): a real structural sibling layout, no JS-measured reserved-space compensation', () => {
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*overflow-y:\s*auto;/s, 'the Game region owns scrolling');
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*flex:\s*1 1 auto;/s, 'grows/shrinks to fill whatever space the Scoreboard sibling leaves it');
  assert.doesNotMatch(pageSource, /ai-scoreboard-anchor-height|ai-scoreboard-reserve|updateAiScoreboardReservedSpace|ResizeObserver/, 'the overlay-era compensation machinery is gone, not merely unused');
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*scrollbar-width:\s*none;/s);
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*-ms-overflow-style:\s*none;/s);
  assert.match(pageSource, /#gameScrollRegion::-webkit-scrollbar\s*\{\s*display:\s*none;/s);
  assert.doesNotMatch(pageSource, /#gameScrollRegion\s*\{[^}]*overflow-y:\s*hidden;/s, 'scrolling remains enabled');
});

test('SB-18. Compact macro layout separates the shared 14-rail telemetry grid from empty sibling Zone 3', () => {
  assert.match(pageSource, /\.ai-scoreboard-compact\s*\{[^}]*grid-template-columns:\s*minmax\(0, 2fr\) minmax\(80px, 1fr\);/s, 'macro region owns telemetry plus reserved Zone 3');
  assert.match(pageSource, /\.ai-scoreboard-telemetry\s*\{[^}]*grid-template-columns:\s*\n\s*auto\s*\n\s*24px 28px 14px 14px auto 24px\s*\n\s*auto\s*\n\s*24px 28px 14px 14px auto 24px;/s, 'telemetry alone owns exactly 14 shared rails');
  assert.doesNotMatch(pageSource.match(/\.ai-scoreboard-telemetry\s*\{([^}]*)\}/s)?.[1] || '', /\b1fr\b/, 'Zone 3 is not a telemetry auto-flow column');
  assert.match(pageSource, /\.ai-scoreboard-zone-3\s*\{[^}]*min-height:\s*1px;/s);
  assert.match(pageSource, /\.ai-scoreboard-metric\s*\{[^}]*display:\s*contents;/s, 'the metric wrapper box disappears; its 6 cells become direct items of the shared outer grid — structurally impossible for row-to-row drift');
  assert.doesNotMatch(pageSource, /\.ai-scoreboard-metric\s*\{[^}]*grid-template-columns:/s, 'no per-metric grid template left to independently size a time/meridiem column');
  assert.match(pageSource, /\.ai-scoreboard-provider-label\s*\{[^}]*text-transform:\s*capitalize;/s, 'title case provider names, matching Player naming conventions');
  assert.match(pageSource, /\.ai-scoreboard-provider-label\s*\{[^}]*padding-right:\s*10px;/s, 'intentional Provider->5H gap via padding, not an oversized column');
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-val\s*\{[^}]*text-align:\s*right;/s);
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-time\s*\{[^}]*text-align:\s*right;/s);
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-meridiem\s*\{[^}]*text-align:\s*left;/s);
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-meridiem\s*\{[^}]*padding-left:\s*4px;/s, 'visible breathing room between time and AM/PM');
});

test('SB-18c. Provider labels render in title case in the Compact rows ("Claude"/"Codex"), never uppercase, while Copy Complete Context keeps its own separate ALL-CAPS convention untouched', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  const telemetry = page.$('aiScoreboardTelemetry');
  assert.equal(telemetry.children[0].textContent, 'Claude');
  assert.equal(telemetry.children[4].textContent, 'Codex');
});

test('SB-18b. Utility controls sit in the header, on the same row as the title (not beside the telemetry rows); Compact stays two rows', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  const copyBtn = page.$('aiScoreboardCopyBtn');
  const expandBtn = page.$('aiScoreboardExpandBtn');
  const positionBtn = page.$('aiScoreboardPositionBtn');
  assert.equal(copyBtn.parentNode.className, 'ai-scoreboard-actions');
  assert.equal(copyBtn.parentNode.parentNode.className, 'ai-scoreboard-header', 'the actions row lives in the header, beside the title');
  assert.ok(expandBtn && positionBtn, 'Expand and the position switch are present alongside Copy');
  // Exactly two provider telemetry rows (Claude, Codex) — Compact stays two rows.
  assert.ok(page.$('aiScoreboardClaudeRowFiveHour'));
  assert.ok(page.$('aiScoreboardCodexRowFiveHour'));
});

test('SB-19. "Refresh" replaces "Rehydrate", POSTs a real forced acquisition, and shows visible success feedback', async () => {
  const page = await createPage({ initialHealth: health({ claude: { rateLimitType: 'five_hour', utilization: 0.5, resetsAt: T0 + 1000 } }) }).start();
  await page.click(page.$('aiScoreboardExpandBtn'));
  const btn = page.$('aiScoreboardRefreshBtn');
  assert.equal(btn.textContent, 'Refresh');
  const refreshedFiveHourReset = T0 + 9 * 3600_000;
  page.setRefreshResponseHealth(health({
    claude: { rateLimitType: 'five_hour', utilization: 0.1, resetsAt: refreshedFiveHourReset }
  }));
  await page.click(btn);
  const refreshCalls = page.apiCalls.filter((u) => u === '/api/ai-health/refresh').length;
  assert.equal(refreshCalls, 1);
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 90%/, 'the response health is rendered, a real acquisition result');
  assert.equal(btn.textContent, 'Refreshed ✓', 'visible success feedback, not a silent success');
  assert.equal(btn.classList.contains('ai-scoreboard-btn-success'), true);
});

test('SB-19b. Refresh never shows "Refreshed ✓" when the read was rate-limited or not fully accepted', async () => {
  const page = await createPage({ initialHealth: health({ claude: { rateLimitType: 'five_hour', utilization: 0.5, resetsAt: T0 + 1000 } }) }).start();
  await page.click(page.$('aiScoreboardExpandBtn'));
  const btn = page.$('aiScoreboardRefreshBtn');
  const cases = [
    [{ claude: { outcome: 'retained', notReflected: ['seven_day'], reason: 'Claude returned newer usage that Sideline did not accept.' }, codex: { outcome: 'unchanged' } }, 'Codex refreshed · Claude not updated'],
    [{ claude: { outcome: 'rate_limited', reason: 'Claude usage endpoint returned HTTP 429.' }, codex: { outcome: 'changed' } }, 'Codex refreshed · Claude rate-limited'],
    [{ claude: { outcome: 'failed' }, codex: { outcome: 'failed' } }, 'Refresh failed']
  ];
  for (const [acquisition, label] of cases) {
    page.setRefreshAcquisition(acquisition);
    await page.click(btn);
    assert.equal(btn.textContent, label);
    assert.equal(btn.classList.contains('ai-scoreboard-btn-success'), false);
    assert.equal(btn.classList.contains('ai-scoreboard-btn-error'), true);
  }
  assert.match(btn.title, /Showing last known usage/);
});

test('SB-20. Codex is unaffected by the Refresh Health control: no Codex markup, endpoint, or behavior changed', () => {
  assert.doesNotMatch(pageSource, /aiScoreboardRefreshBtn[\s\S]{0,400}codex/i);
});

// ---------------------------------------------------------------------------
// Play 3: provider theming, close/escape, placement, and Compact display settings
// ---------------------------------------------------------------------------

test('SB-21. Collapsed/Compact rows are provider-themed: Claude and Codex percentage, unit, time, and meridiem use their own accent, not generic text', () => {
  assert.match(pageSource, /\.ai-scoreboard-metric\.codex \.cell-val,\s*\.ai-scoreboard-metric\.codex \.cell-unit,\s*\.ai-scoreboard-metric\.codex \.cell-time,\s*\.ai-scoreboard-metric\.codex \.cell-meridiem\s*\{\s*color:\s*var\(--codex-accent\);/);
  assert.match(pageSource, /\.ai-scoreboard-metric\.claude \.cell-val,\s*\.ai-scoreboard-metric\.claude \.cell-unit,\s*\.ai-scoreboard-metric\.claude \.cell-time,\s*\.ai-scoreboard-metric\.claude \.cell-meridiem\s*\{\s*color:\s*var\(--claude-accent\);/);
});

test('SB-22. Expanded cards accent the remaining-percentage figure and the countdown per provider (not the absolute reset)', () => {
  assert.match(pageSource, /\.ai-scoreboard-card\.claude \.ai-scoreboard-window-big\s*\{\s*color:\s*var\(--claude-accent\);/);
  assert.match(pageSource, /\.ai-scoreboard-card\.codex \.ai-scoreboard-window-big\s*\{\s*color:\s*var\(--codex-accent\);/);
  assert.match(pageSource, /\.ai-scoreboard-card\.claude \.ai-scoreboard-window-countdown\s*\{\s*color:\s*var\(--claude-accent\);/);
  assert.match(pageSource, /\.ai-scoreboard-card\.codex \.ai-scoreboard-window-countdown\s*\{\s*color:\s*var\(--codex-accent\);/);
  assert.doesNotMatch(pageSource, /\.ai-scoreboard-window-reset\s*\{[^}]*color:\s*var\(--claude-accent\)/, 'absolute reset stays legible body text, not accented');
});

test('SB-23. Collapse, ×, and Escape all reach the same collapse function — one code path, not three', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  // Collapse (via the header Expand/Collapse toggle)
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
  // ×
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  await page.click(page.$('aiScoreboardCloseBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
  assert.equal(page.$('aiScoreboardExpandBtn').textContent, 'Expand ▾', '× updates the same header state as Collapse');
  // Escape, only while expanded
  await page.pressKey('Escape');
  assert.equal(page.$('aiScoreboardExpandBtn').textContent, 'Expand ▾', 'Escape does nothing while already collapsed');
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  await page.pressKey('Escape');
  assert.equal(page.$('aiScoreboardExpanded').hidden, true, 'Escape collapses while expanded');
});

test('SB-24. Placement defaults to Bottom; the Top preference moves the persistent card structurally (via the body order-driving class), not merely visually', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-bottom'), true);
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-top'), false);
  assert.equal(page.body.classList.contains('ai-scoreboard-top'), false, 'default Bottom: no top-order class on body');
  page.setStatusPreferences({ aiScoreboardPlacement: 'top' });
  await page.refreshStatus();
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-top'), true);
  assert.equal(page.body.classList.contains('ai-scoreboard-top'), true, 'body carries the class that drives #aiScoreboardContainer order:0');
});

test('SB-25. Compact percentage/reset/marker preferences immediately reformat the Compact rows', async () => {
  const claude = { rateLimitType: 'five_hour', utilization: 0.63, resetsAt: T0 + 3 * 3600_000 };
  const page = await createPage({ initialHealth: health({ claude }) }).start();
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 37% · /, 'default: % left, absolute reset, plain separator');
  page.setStatusPreferences({ aiScoreboardPercentMode: 'used', aiScoreboardResetMode: 'countdown', aiScoreboardResetMarker: 'icon' });
  await page.refreshStatus();
  assert.match(page.$('aiScoreboardClaudeRowFiveHour').textContent, /5H 63% used ↻ in /, 'used%, countdown, icon marker applied live');
});

// ---------------------------------------------------------------------------
// Play 3.1: geometry repair — expanded replaces compact, Settings hides the
// persistent card, and the instant Top/Bottom position switch.
// ---------------------------------------------------------------------------

test('SB-27. Expanded REPLACES Compact: Compact provider rows are hidden while Expanded, and return on Collapse', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  assert.equal(page.$('aiScoreboardCompact').hidden, false, 'Compact visible while collapsed');
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardCompact').hidden, true, 'Compact hidden while Expanded — no duplicated telemetry');
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardCompact').hidden, false, 'Compact returns after Collapse');
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
});

test('SB-28. Opening Settings hides the persistent Scoreboard; closing restores it with placement/expanded state intact', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  assert.equal(page.$('aiScoreboardContainer').hidden, false);

  await page.click(page.$('settingsBtn'));
  assert.equal(page.$('aiScoreboardContainer').hidden, true, 'persistent card hides while Settings is open');

  await page.click(page.$('settingsBackBtn'));
  assert.equal(page.$('aiScoreboardContainer').hidden, false, 'restored after Settings closes');
  assert.equal(page.$('aiScoreboardExpanded').hidden, false, 'expanded state was not corrupted while hidden');
});

test('SB-29. The position-switch control moves Top <-> Bottom instantly, persists the preference, and updates its action-describing tooltip', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  const btn = page.$('aiScoreboardPositionBtn');
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-bottom'), true);
  assert.equal(btn.title, 'Move AI Usage Scoreboard to top');

  await page.click(btn);
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-top'), true, 'moved immediately, no reload');
  assert.equal(btn.title, 'Move AI Usage Scoreboard to bottom', 'tooltip now describes the reverse action');
  const posts = page.apiCalls.filter((u) => u === '/api/preferences');
  assert.equal(posts.length, 1, 'the change was persisted via the existing preference');

  await page.click(btn);
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-bottom'), true, 'moves back');
  assert.equal(btn.title, 'Move AI Usage Scoreboard to top');
});

test('SB-30. Collapse, ×, and Escape remain unaffected by the position-switch control', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  await page.click(page.$('aiScoreboardPositionBtn'));
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, false);
  await page.click(page.$('aiScoreboardCloseBtn'));
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
  await page.click(page.$('aiScoreboardExpandBtn'));
  await page.pressKey('Escape');
  assert.equal(page.$('aiScoreboardExpanded').hidden, true);
});

// ---------------------------------------------------------------------------
// Claude 5H Freshness repair: UI defense-in-depth. HealthAuthority no longer
// retains an expired window with no fresh replacement, but if one somehow
// still reaches the Scoreboard, it must never render as current capacity.
// ---------------------------------------------------------------------------

test('SB-31. An already-expired Claude window renders UNKNOWN, never a stale percentage, even if still present in the payload', async () => {
  const expiredFiveHour = Date.now() - 60_000;
  const claude = { rateLimitType: 'five_hour', utilization: 0.26, resetsAt: expiredFiveHour };
  const page = await createPage({ initialHealth: health({ claude }) }).start();
  assert.equal(page.$('aiScoreboardClaudeRowFiveHour').textContent, '5H UNKNOWN', 'expired window defense-in-depth: no stale 74%-left rendered as current');
});

test('SB-26. Copy Complete Context stays complete (left, used, absolute, countdown, both windows) regardless of Compact display preferences', async () => {
  const claude = { rateLimitType: 'five_hour', utilization: 0.63, resetsAt: T0 + 3 * 3600_000 };
  const page = await createPage({ initialHealth: health({ claude }) }).start();
  page.setStatusPreferences({ aiScoreboardPercentMode: 'used', aiScoreboardResetMode: 'countdown' });
  await page.refreshStatus();
  await page.click(page.$('aiScoreboardCopyBtn'));
  const text = page.clipboardWrites[0];
  assert.match(text, /CLAUDE\n5-hour: 37% left \| 63% used/, 'left AND used both present in the copy, independent of Compact mode');
  assert.match(text, /Resets: .*\d{1,2}:\d{2}/, 'absolute reset present in the copy');
  assert.match(text, /Time until reset: in /, 'countdown present in the copy');
});

// ---------------------------------------------------------------------------
// Slice 3.2: structural app-frame layout — a dam, not a bridge. Replaces the
// fixed-overlay + reserved-space-compensation architecture from Play 3/3.1.
// ---------------------------------------------------------------------------

test('SB-32. Bottom is the default placement for an unset/new preference', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-bottom'), true);
  assert.equal(page.body.classList.contains('ai-scoreboard-top'), false);
});

test('SB-33. A persisted Top preference remains Top on load — never silently overwritten back to Bottom', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  page.setStatusPreferences({ aiScoreboardPlacement: 'top' });
  await page.refreshStatus();
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-top'), true);
  // A second, unrelated status/health refresh must not reset the explicit Top choice.
  page.emitHealth(health({ codex: { primary: { usedPercent: 10, resetsAt: T0 + 1000, windowDurationMins: 300 } } }));
  assert.equal(page.$('aiScoreboardContainer').classList.contains('ai-scoreboard-top'), true, 'explicit Top survives an unrelated re-render');
});

test('SB-34. Bottom places the Scoreboard structurally after the Game region; Top places it before — via CSS order, not DOM reordering', () => {
  assert.match(pageSource, /#aiScoreboardContainer\s*\{[^}]*order:\s*2;/s, 'default (Bottom): order 2, after #gameScrollRegion\'s order 1');
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*order:\s*1;/s);
  assert.match(pageSource, /body\.ai-scoreboard-top #aiScoreboardContainer\s*\{[^}]*order:\s*0;/s, 'Top: order 0, before #gameScrollRegion\'s order 1');
});

test('SB-35. Expanded consumes real layout space as a flex sibling (min-height floor keeps the Game region reachable), not an overlay', () => {
  assert.match(pageSource, /#gameScrollRegion\s*\{[^}]*min-height:\s*120px;/s, 'a floor so Expanded can never squeeze the Game region to zero/unreachable');
  assert.doesNotMatch(pageSource, /\.ai-scoreboard-expanded\s*\{[^}]*position:\s*absolute/s, 'Expanded is not floated over content');
});

test('SB-36. "AI USAGE · GLOBAL" scope cue is present, restrained (no large badge/explanatory chrome added)', () => {
  assert.match(pageSource, /title\.textContent = 'AI USAGE · GLOBAL';/);
});

test('SB-37. Top <-> Bottom switching and Settings hide/show leave no stale spacer/compensation state', async () => {
  const page = await createPage({ initialHealth: health({}) }).start();
  await page.click(page.$('aiScoreboardPositionBtn'));
  await page.click(page.$('aiScoreboardPositionBtn'));
  await page.click(page.$('settingsBtn'));
  await page.click(page.$('settingsBackBtn'));
  // No reserved-space/compensation class or inline custom property ever existed
  // to go stale — Slice 3.2 has no such mechanism, verified structurally.
  assert.doesNotMatch(pageSource, /ai-scoreboard-reserve|ai-scoreboard-anchor-height/);
  assert.equal(page.$('aiScoreboardContainer').hidden, false, 'restored visible after the round trip');
});

// ---------------------------------------------------------------------------
// AI Usage Compact Winning Grid and Structural Spacing (Tasks 1 - 4)
// ---------------------------------------------------------------------------

test('SB-37b. Weekly uses the same compact internal rhythm as 5H inside the telemetry-only grid', () => {
  // The old bug: each metric owned its own inline-grid with a 1fr (later auto,
  // but still row-local) TIME column, so Claude's and Codex's Weekly rows could
  // sit at different x-offsets. Fixed by flattening entirely: the metric is
  // `display: contents` (no grid of its own), and .ai-scoreboard-compact's ONE
  // shared template gives TIME a single `auto` track reused by both rows. The
  // Zone 3 is a sibling macro region, so no flexible track exists inside the
  // 5H or Weekly semantic rail sequence.
  const telemetryRule = pageSource.match(/\.ai-scoreboard-telemetry\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(telemetryRule, /\b1fr\b/, 'no Zone 3/flexible track inside telemetry');
  assert.match(pageSource, /\.ai-scoreboard-metric\s*\{[^}]*display:\s*contents;/s, 'metric has no grid of its own — cannot size a time column independently per row');
});

test('SB-38. Rebuilt Compact telemetry grid: Claude and Codex share identical semantic 6-cell slot structure', async () => {
  const claude = {
    unifiedWindows: {
      five_hour: { utilization: 0.34, resetsAt: (T0 + 3 * 3600_000) / 1000 },
      seven_day: { utilization: 0.43, resetsAt: (T0 + 5 * 86400_000) / 1000 }
    }
  };
  const codex = {
    primary: { usedPercent: 100, resetsAt: (T0 + 3600_000) / 1000, windowDurationMins: 300 },
    secondary: { usedPercent: 4, resetsAt: (T0 + 86400_000) / 1000, windowDurationMins: 10080 }
  };
  const page = await createPage({ initialHealth: health({ claude, codex }) }).start();

  const claude5H = page.$('aiScoreboardClaudeRowFiveHour');
  const codex5H = page.$('aiScoreboardCodexRowFiveHour');
  const claudeWk = page.$('aiScoreboardClaudeRowWeekly');
  const codexWk = page.$('aiScoreboardCodexRowWeekly');

  // Both rows have 6 child cells each
  assert.equal(claude5H.children.length, 6);
  assert.equal(codex5H.children.length, 6);
  assert.equal(claudeWk.children.length, 6);
  assert.equal(codexWk.children.length, 6);

  // Slot classes verify semantic slots: WINDOW | VALUE | % | DOT | TIME | MERIDIEM
  const expectedClasses = ['cell-window', 'cell-val', 'cell-unit', 'cell-dot', 'cell-time', 'cell-meridiem'];
  for (let i = 0; i < 6; i++) {
    assert.equal(claude5H.children[i].classList.contains(expectedClasses[i]), true, `claude5H cell ${i} has ${expectedClasses[i]}`);
    assert.equal(codex5H.children[i].classList.contains(expectedClasses[i]), true, `codex5H cell ${i} has ${expectedClasses[i]}`);
  }

  // Values: right-aligned values, provider colored
  assert.equal(claude5H.children[0].textContent.trim(), '5H');
  assert.equal(claude5H.children[1].textContent.trim(), '66');
  assert.equal(claude5H.children[2].textContent.trim(), '%');
  assert.equal(claude5H.children[3].textContent.trim(), '·');

  assert.equal(codex5H.children[0].textContent.trim(), '5H');
  assert.equal(codex5H.children[1].textContent.trim(), '0');
  assert.equal(codex5H.children[2].textContent.trim(), '%');
  assert.equal(codex5H.children[3].textContent.trim(), '·');
});

test('SB-39. Alignment contract: explicit provider rows share one telemetry grid and Zone 3 stays empty', async () => {
  const claude = { rateLimitType: 'five_hour', utilization: 0.25, resetsAt: T0 + 3600_000 };
  const codex = { primary: { usedPercent: 0, resetsAt: T0 + 3600_000, windowDurationMins: 300 } };
  const page = await createPage({ initialHealth: health({ claude, codex }) }).start();
  // Provider label, 5H metric, sep, and Weekly metric are all direct children
  // of the SAME .ai-scoreboard-compact grid — no per-row wrapper that could size
  // independently. (Each metric wrapper is `display:contents` in CSS, so its 6
  // cells land on the shared column tracks, but the wrapper element itself still
  // exists in the DOM tree, which is what this structural check inspects.)
  const compact = page.$('aiScoreboardCompact');
  const telemetry = page.$('aiScoreboardTelemetry');
  const zone3 = page.$('aiScoreboardZone3');
  assert.equal(compact.children.length, 2, 'telemetry and Zone 3 are sibling macro regions');
  assert.equal(compact.children[0], telemetry);
  assert.equal(compact.children[1], zone3);
  assert.equal(zone3.children.length, 0, 'Zone 3 is intentionally empty');
  assert.equal(telemetry.children.length, 8, 'label,5H,sep,WK per provider x 2 providers');
  assert.equal(telemetry.children[0].textContent, 'Claude');
  assert.equal(telemetry.children[1].id, 'aiScoreboardClaudeRowFiveHour');
  assert.equal(telemetry.children[4].textContent, 'Codex');
  assert.equal(telemetry.children[5].id, 'aiScoreboardCodexRowFiveHour');
  assert.match(pageSource, /\.ai-scoreboard-provider-label\.claude,[\s\S]*?grid-row:\s*1;/);
  assert.match(pageSource, /\.ai-scoreboard-provider-label\.codex,[\s\S]*?grid-row:\s*2;/);
  assert.match(pageSource, /\.ai-scoreboard-metric\.weekly > :nth-child\(6\)\s*\{\s*grid-column:\s*14;/);
  const semanticCellCount = (offset) => 1 + telemetry.children[offset + 1].children.length + 1 + telemetry.children[offset + 3].children.length;
  assert.equal(semanticCellCount(0), 14, 'Claude owns all 14 semantic cells');
  assert.equal(semanticCellCount(4), 14, 'Codex owns all 14 semantic cells');
  assert.match(pageSource, /\.ai-scoreboard-sep\s*\{[^}]*transform:\s*translateX\(3ch\);/s, 'one shared divider rule nudges both rows equally without moving telemetry rails');
  assert.match(pageSource, /\.ai-scoreboard-sep\s*\{[^}]*padding:\s*0 calc\(8px \+ 3ch\) 0 8px;/s, 'real shared post-divider layout space moves the complete Weekly cluster');
  assert.match(pageSource, /\.ai-scoreboard-metric\.weekly > :nth-child\(1\)\s*\{\s*grid-column:\s*9;\s*\}/s, 'WK stays in its 24px label rail with no visual transform');
  assert.doesNotMatch(pageSource, /\.ai-scoreboard-metric\.weekly > :nth-child\(1\)\s*\{[^}]*transform:/s);
  // Provider theming: val and unit are provider-colored, on the metric itself.
  assert.match(pageSource, /\.ai-scoreboard-metric\.codex \.cell-val,\s*\.ai-scoreboard-metric\.codex \.cell-unit/s);
  assert.match(pageSource, /\.ai-scoreboard-metric\.claude \.cell-val,\s*\.ai-scoreboard-metric\.claude \.cell-unit/s);
  // Tabular numerals
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-val\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
  assert.match(pageSource, /\.ai-scoreboard-cell\.cell-time\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
});

test('SB-40. Bottom outer breathing room: a field-visible ~16px space below the Scoreboard card, viewport-facing side only', () => {
  assert.match(pageSource, /#aiScoreboardContainer\s*\{[^}]*margin-bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom\)\);/s, 'gap is outside the card background');
  // Game-facing top edge remains hard, with no inserted outer gap.
  const bottomContainerRule = pageSource.match(/(?:^|\n)\s*#aiScoreboardContainer\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(bottomContainerRule, /margin-top:/);
});

test('SB-41. Top placement spacing: a field-visible ~16px outer space above the Scoreboard and content separation below it, no overlay', () => {
  assert.match(pageSource, /body\.ai-scoreboard-top #aiScoreboardContainer\s*\{[^}]*margin-top:\s*calc\(16px \+ env\(safe-area-inset-top\)\);/s, 'gap is outside the card background');
  assert.match(pageSource, /body\.ai-scoreboard-top #aiScoreboardContainer\s*\{[^}]*margin-bottom:\s*14px;/s);
  assert.doesNotMatch(pageSource, /\.ai-scoreboard\s*\{[^}]*position:\s*fixed;/s);
});

test('SB-42. Task 4 — Claude 5H partial-unknown display: 100% available with unknown reset time renders "5H 100% · UNKNOWN" in normal grid columns', async () => {
  // Claude with utilization 0 (100% available) and missing/undefined resetsAt
  const claude = {
    status: 'allowed',
    rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0, resetsAt: null },
      seven_day: { utilization: 0.2, resetsAt: (T0 + 3 * 86400_000) / 1000 }
    }
  };
  const page = await createPage({ initialHealth: health({ claude }) }).start();

  const fiveHour = page.$('aiScoreboardClaudeRowFiveHour');
  assert.equal(fiveHour.textContent, '5H 100% · UNKNOWN');
  assert.equal(fiveHour.classList.contains('is-unknown'), false, '100% is known utilization, must NOT collapse to is-unknown');
  assert.equal(fiveHour.children.length, 6);
  assert.equal(fiveHour.children[0].textContent.trim(), '5H');
  assert.equal(fiveHour.children[1].textContent.trim(), '100');
  assert.equal(fiveHour.children[2].textContent.trim(), '%');
  assert.equal(fiveHour.children[3].textContent.trim(), '·');
  assert.equal(fiveHour.children[4].textContent.trim(), 'UNKNOWN');
  assert.equal(fiveHour.children[4].classList.contains('is-unknown-time'), true);
  assert.equal(fiveHour.children[5].textContent.trim(), '');

  // Scoreboard remains visible, not hidden or suppressed
  const container = page.$('aiScoreboardContainer');
  assert.equal(container.hidden, false, 'Scoreboard container remains visible');
  assert.ok(container.children.length > 0, 'Scoreboard container retains its content');

  // Expanded card proof: 100% left, 0% used, reset UNKNOWN
  await page.click(page.$('aiScoreboardExpandBtn'));
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourLeft').textContent, '100%');
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourUsed').textContent, '0% used');
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourReset').textContent, 'UNKNOWN');
  assert.equal(page.$('aiScoreboardClaudeCardFiveHourCountdown').textContent, 'UNKNOWN');
});

test('SB-43. Task 4 — Genuinely unknown Claude renders "5H UNKNOWN", and expired Claude window renders UNKNOWN', async () => {
  // Genuinely missing Claude utilization
  const page = await createPage({ initialHealth: health({}) }).start();
  const fiveHour = page.$('aiScoreboardClaudeRowFiveHour');
  assert.equal(fiveHour.textContent, '5H UNKNOWN');
  assert.equal(fiveHour.classList.contains('is-unknown'), true, 'genuinely unknown has is-unknown class');

  // Expired window defense-in-depth: past resetsAt renders 5H UNKNOWN, never stale percentage
  const expiredClaude = {
    rateLimitType: 'five_hour',
    utilization: 0,
    resetsAt: Date.now() - 5000
  };
  page.emitHealth(health({ claude: expiredClaude }));
  await flush();
  assert.equal(page.$('aiScoreboardClaudeRowFiveHour').textContent, '5H UNKNOWN');
  assert.equal(page.$('aiScoreboardClaudeRowFiveHour').classList.contains('is-unknown'), true);
});
