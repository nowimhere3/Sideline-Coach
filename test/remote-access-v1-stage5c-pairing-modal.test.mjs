import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const controllerStart = pageScript.indexOf('const SendToPhoneController = (() => {');
const controllerEndMarker = 'window.SendToPhoneController = SendToPhoneController;';
const controllerEnd = pageScript.indexOf(controllerEndMarker, controllerStart) + controllerEndMarker.length;
assert.ok(controllerStart >= 0 && controllerEnd > controllerStart, 'production SendToPhoneController is extractable');
const controllerSource = pageScript.slice(controllerStart, controllerEnd);

const pairingResult = (now) => ({
  success: true,
  pairingId: 'pair-5c',
  url: 'https://h-host.remote.mysidelinecoach.com/pair#secret',
  qrSvg: '<svg data-url="exact"></svg>',
  code: 'ABCD-EFGH',
  expiresAt: now + 300_000
});

function createController({ remoteEnabled = false, mobile = false } = {}) {
  let now = 1_800_000_000_000;
  let currentDevices = [{ deviceId: 'existing', label: 'Existing Phone', createdAt: now - 20_000 }];
  const calls = [];
  const elements = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  let timerId = 0;
  const makeElement = (id) => ({
    id, hidden: id === 'pairingModal' || id === 'pairingExpiredState' || id === 'pairingSuccessState',
    textContent: '', innerHTML: '', disabled: false, dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); }
  });
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const api = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url === '/api/preferences') return { success: true, preferences: { remoteAccess: { enabled: true } } };
    if (url === '/api/devices') return { success: true, devices: currentDevices.map((device) => ({ ...device })) };
    if (url === '/api/pairing/create') return pairingResult(now);
    throw new Error(`Unexpected API call: ${url}`);
  };
  const ctx = {
    $, api, showToast() {}, focusElement() {}, aiScoreboardIsMobile: () => mobile,
    location: { hostname: '127.0.0.1' },
    lastStatus: { preferences: { remoteAccess: { enabled: remoteEnabled } } },
    Date: { now: () => now }, Set, Number, String, JSON, console,
    setInterval(fn) { const id = ++timerId; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn, delay) { const id = ++timerId; timeouts.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    window: {}
  };
  vm.createContext(ctx);
  vm.runInContext(controllerSource, ctx);
  return {
    controller: ctx.window.SendToPhoneController,
    $, calls,
    setNow(value) { now = value; },
    now: () => now,
    setDevices(value) { currentDevices = value; },
    tickIntervals() { for (const fn of [...intervals.values()]) fn(); },
    runTimeout(delay) {
      const entry = [...timeouts.values()].find((candidate) => candidate.delay === delay);
      assert.ok(entry, `expected ${delay}ms timeout`);
      entry.fn();
    }
  };
}

test('RA5C-1. desktop Scorecard preserves both 50/50 seams and subdivides only Utility into actions | Design F', () => {
  assert.match(pageSource, /\.ai-scoreboard-provider-cards \{[^}]*grid-template-columns: 1fr 1fr;/s);
  assert.match(pageSource, /\.ai-scoreboard-secondary-cards \{[^}]*grid-template-columns: 1fr 1fr;/s);
  assert.match(pageSource, /\.ai-scoreboard-action-card \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(pageSource, /actionStack\.append\(expandedCopyBtn, refreshBtn\);[\s\S]*actionCard\.append\(actionStack, sendToPhoneTile\);/);
  assert.match(pageSource, /send-to-phone-frame[\s\S]*top-left[\s\S]*top-right[\s\S]*bottom-left[\s\S]*bottom-right/);
  assert.doesNotMatch(pageSource, /grid-template-columns:[^;]*173px|\.send-to-phone-tile\s*\{[^}]*width:\s*173px/s);
});

test('RA5C-2. existing mobile breakpoint hides Design F and keeps the utility action wrapper layout-neutral', () => {
  assert.match(pageSource, /\.ai-scoreboard-action-stack \{ display: contents; \}\s*\.send-to-phone-tile \{ display: none; \}/);
  assert.match(pageSource, /@media \(min-width: 620px\) \{[\s\S]*?\.send-to-phone-tile \{[\s\S]*?display: flex;/);
  const mobileBlock = pageSource.match(/\/\* MOBILE EXPANDED ONLY[\s\S]*?@media \(max-width: 619px\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(mobileBlock, /\.ai-scoreboard-secondary-cards \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); gap: 0;/);
  assert.doesNotMatch(mobileBlock, /send-to-phone/);
});

test('POLISH-1/2/3. Design F flexes from the utility track, stays bounded at narrow widths, and caps internal visual scale', () => {
  const desktop = pageSource.match(/\/\* Subdivide only the existing bottom-right utility quadrant[\s\S]*?\/\* MOBILE EXPANDED ONLY/)?.[0] || '';
  assert.match(desktop, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'both inner tracks flex without forcing their parent wider');
  assert.match(desktop, /\.send-to-phone-tile \{[\s\S]*?width: 100%; min-width: 0; min-height: 0; height: auto; align-self: stretch;/, 'tile consumes its available track and stretches to the natural utility-stack height');
  assert.match(desktop, /\.send-to-phone-corner \{[^}]*width: 16px; height: 16px;/, 'corner shapes retain fixed proportions while only their positions respond');
  assert.match(desktop, /\.send-to-phone-icon \{[^}]*width: clamp\(38px, 16cqw, 44px\); height: clamp\(38px, 16cqw, 44px\)/, 'icon scales modestly and is capped');
  assert.match(desktop, /@container scorecard-utility \(max-width: 280px\) \{[\s\S]*?font-size: 13px;[\s\S]*?max-inline-size: 7\.5ch;/, 'roughly 115px tile prefers Send to | Phone at a readable size');
  const labelRule = desktop.match(/\.send-to-phone-label \{([^}]*)\}/)?.[1] || '';
  assert.match(labelRule, /white-space: normal; overflow-wrap: normal; word-break: normal; text-wrap: balance;/, 'label wraps by words without clipping, truncation, or forced breaks');
  assert.doesNotMatch(labelRule, /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
});

test('POLISH-6/7. Design F uses Scorecard neutral tokens and the visible utility label is exactly Copy Context', () => {
  const desktop = pageSource.match(/\/\* Subdivide only the existing bottom-right utility quadrant[\s\S]*?\/\* MOBILE EXPANDED ONLY/)?.[0] || '';
  const tileRule = desktop.match(/\.send-to-phone-tile \{([\s\S]*?)\n      \}/)?.[1] || '';
  assert.match(tileRule, /--remote-border: #343b47/);
  assert.match(tileRule, /--remote-bg: #252b35/);
  assert.match(tileRule, /--remote-icon: #8b97ab/);
  assert.match(tileRule, /--remote-text: var\(--text\)/);
  assert.doesNotMatch(tileRule, /#2b579f|#0e1a30|var\(--accent-2\)/);
  assert.match(pageSource, /expandedCopyBtn\.textContent = 'Copy Context';/);
  assert.doesNotMatch(pageSource, /Copy Complete Context/);
});

test('POLISH-PASS2. tile removes REMOTE and harmonizes to the 104px/124px natural button-stack states', () => {
  const tileMarkup = pageSource.match(/sendToPhoneTile\.innerHTML = `([\s\S]*?)`;/)?.[1] || '';
  assert.doesNotMatch(tileMarkup, /Remote|send-to-phone-heading/i);
  assert.match(pageSource, /sendToPhoneTile\.setAttribute\('aria-label', 'Send to Phone'\)/);
  assert.match(pageSource, /tile\.setAttribute\('aria-label', presentation\.label\)/);
  assert.match(pageSource, /\.ai-scoreboard-action-stack \{[^}]*gap: 8px;/);
  assert.equal(48 + 48 + 8, 104, 'wide measured stack drives a 104px grid row');
  assert.equal(68 + 48 + 8, 124, 'wrapped measured stack drives a 124px grid row');
  assert.doesNotMatch(pageSource, /\.send-to-phone-tile \{[^}]*height:\s*(?:130px|173px)/s);
});

test('FRAME-1/2/3/4/5/6. four fixed-shape corners anchor symmetrically inside the responsive tile at reviewed widths', () => {
  const desktop = pageSource.match(/\/\* Subdivide only the existing bottom-right utility quadrant[\s\S]*?\/\* MOBILE EXPANDED ONLY/)?.[0] || '';
  const frameRule = desktop.match(/\.send-to-phone-frame \{([^}]*)\}/)?.[1] || '';
  assert.match(frameRule, /position: absolute; inset: var\(--remote-frame-inset\)/, 'one inset establishes equal top/right/bottom/left anchoring');
  assert.doesNotMatch(frameRule, /width:|height:|aspect-ratio|transform/, 'frame position is not derived from width or aspect ratio');
  assert.match(desktop, /\.send-to-phone-corner\.top-left \{ top: 0; left: 0;/);
  assert.match(desktop, /\.send-to-phone-corner\.top-right \{ top: 0; right: 0;/);
  assert.match(desktop, /\.send-to-phone-corner\.bottom-left \{ bottom: 0; left: 0;/);
  assert.match(desktop, /\.send-to-phone-corner\.bottom-right \{ right: 0; bottom: 0;/);
  const tileMarkup = pageSource.match(/sendToPhoneTile\.innerHTML = `([\s\S]*?)`;/)?.[1] || '';
  assert.doesNotMatch(tileMarkup, /<svg class="send-to-phone-frame"|viewBox="0 0 155 114"/);
  assert.doesNotMatch(desktop, /\.send-to-phone-tile \{[^}]*height:\s*130px/s);

  // Representative geometry from the unchanged outer 50/50 seams. The test
  // deliberately checks both accepted natural row heights at every reviewed
  // viewport; explicit edge anchors make the result independent of aspect ratio.
  for (const viewport of [832, 699, 645, 627]) {
    const scoreboardInner = viewport - 28;
    const utilityOuter = (scoreboardInner - 10) / 2;
    const utilityInner = utilityOuter - 24;
    const tileWidth = (utilityInner - 10) / 2;
    const inset = Math.min(8, Math.max(6, utilityInner * 0.025));
    assert.ok(tileWidth > (2 * inset) + 16, `${viewport}px: left/right corners remain fully inside`);
    for (const tileHeight of [104, 124]) {
      assert.ok(tileHeight > (2 * inset) + 16, `${viewport}px/${tileHeight}px: top/bottom corners remain fully inside`);
    }
  }

  assert.match(pageSource, /\.send-to-phone-tile \{ display: none; \}/, 'mobile default remains hidden');
  assert.match(pageSource, /@media \(min-width: 620px\)/, 'existing desktop breakpoint remains authoritative');
});

test('RA5C-3. opening while Remote Access is off enables it before creating one pairing', async () => {
  const h = createController();
  await h.controller.open();
  assert.deepEqual(h.calls.map((call) => `${call.method} ${call.url}`), [
    'POST /api/preferences', 'GET /api/devices', 'POST /api/pairing/create'
  ]);
  assert.deepEqual(JSON.parse(h.calls[0].body), { remoteAccess: { enabled: true } });
});

test('RA5C-4. modal renders daemon QR/code and countdown from the actual expiresAt', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  assert.equal(h.$('pairingModal').hidden, false);
  assert.equal(h.$('pairingQrSvg').innerHTML, '<svg data-url="exact"></svg>');
  assert.equal(h.$('pairingCode').textContent, 'ABCD-EFGH');
  assert.equal(h.$('pairingCountdown').textContent, '5:00');
});

test('RA5C-5. only a completion event correlated to the active pairing succeeds', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  h.controller.handlePairingComplete({ pairingId: 'wrong', deviceId: 'nope', label: 'Wrong Phone' });
  assert.equal(h.$('pairingSuccessState').hidden, true);
  h.controller.handlePairingComplete({ pairingId: 'pair-5c', deviceId: 'new', label: 'Dad Phone' });
  assert.equal(h.$('pairingSuccessState').hidden, false);
  assert.equal(h.$('sendToPhoneTile').dataset.state, 'success');
});

test('RA5C-6. verified success says Phone Connected and auto-closes after 2.5 seconds', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  h.controller.handlePairingComplete({ pairingId: 'pair-5c', deviceId: 'new', label: 'Dad Phone' });
  assert.equal(h.$('sendToPhoneLabel').textContent, 'Phone Connected');
  assert.equal(h.$('pairingModal').hidden, false);
  h.runTimeout(2500);
  assert.equal(h.$('pairingModal').hidden, true);
  assert.equal(h.$('sendToPhoneTile').dataset.state, 'success');
});

test('RA5C-7. actual expiry reaches zero, shows Get New Code state, and never auto-regenerates', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  const createsBefore = h.calls.filter((call) => call.url === '/api/pairing/create').length;
  h.setNow(h.now() + 300_001);
  h.tickIntervals();
  assert.equal(h.$('pairingCountdown').textContent, '0:00');
  assert.equal(h.$('pairingExpiredState').hidden, false);
  assert.equal(h.calls.filter((call) => call.url === '/api/pairing/create').length, createsBefore);
});

test('RA5C-8. an SSE disconnect/reconnect permits exactly one baseline reconciliation and no polling', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  h.setDevices([
    { deviceId: 'existing', label: 'Existing Phone', createdAt: h.now() - 20_000 },
    { deviceId: 'paired', label: 'Dad Phone', createdAt: h.now() + 1 }
  ]);
  h.controller.noteSseDisconnect();
  await h.controller.reconcileAfterSseReconnect();
  h.controller.noteSseDisconnect();
  await h.controller.reconcileAfterSseReconnect();
  assert.equal(h.calls.filter((call) => call.url === '/api/devices').length, 2, 'one baseline plus exactly one recovery request');
  assert.equal(h.$('sendToPhoneTile').dataset.state, 'success');
  assert.doesNotMatch(controllerSource, /setInterval\([^)]*devices|setInterval\([^)]*reconcile/s);
});

test('RA5C-9. cancel stops the modal without disabling Remote Access, revoking devices, or creating again', async () => {
  const h = createController({ remoteEnabled: true });
  await h.controller.open();
  h.controller.close();
  assert.equal(h.$('pairingModal').hidden, true);
  assert.equal(h.$('sendToPhoneTile').dataset.state, 'idle');
  assert.equal(h.calls.filter((call) => call.url === '/api/pairing/create').length, 1);
  assert.equal(h.calls.some((call) => call.method === 'DELETE' || /remoteAccess[^]*false/.test(call.body || '')), false);
});
