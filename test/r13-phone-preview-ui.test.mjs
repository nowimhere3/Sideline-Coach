import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/public/index.html', import.meta.url), 'utf8');
const previewCode = source.slice(source.indexOf('// --- R12 Browser Preview'), source.indexOf("$('promptInput')?.addEventListener"));
const apiCode = source.slice(source.indexOf('const api = async'), source.indexOf('const showAuth ='));
const remote = {
  previewId: 'remote:test', gameId: 'g', source: 'static', primary: true, ownership: 'verified',
  remote: { frameUrl: 'https://preview.example/enter?t=opaque', openUrl: 'https://preview.example/index.html' },
  pages: [{ path: 'index.html', label: 'Home', remoteUrl: 'https://preview.example/index.html', primary: true },
    { path: 'settings.html', label: 'Settings', remoteUrl: 'https://preview.example/settings.html', primary: false }]
};

function harness(replies, { width = 1280, href = 'https://coach.example/?previewWork=g', status = null, visualViewport, layoutViewport } = {}) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, style: {}, dataset: {}, handlers: {}, children: [], clientWidth: 400, clientHeight: 800,
      classList: { add() {}, remove() {} }, setAttribute(key, value) { this[key] = value; }, append(child) { this.children.push(child); },
      addEventListener(name, fn) { this.handlers[name] = fn; } });
    return nodes.get(id);
  };
  const presets = ['desktop', 'tablet', 'phone'].map((preset) => { const n = node(preset); n.dataset.previewPreset = preset; return n; });
  const calls = []; const opened = [];
  const loadedViewports = [];
  Object.defineProperty(node('previewFrame'), 'src', {
    get() { return this.frameSrc; },
    set(value) { this.frameSrc = value; if (value !== 'about:blank') loadedViewports.push({ url: value, ...this.style }); }
  });
  const tabs = [];
  const window = { location: { href }, visualViewport,
    open(url, target) { opened.push(url); const tab = { target }; tabs.push(tab); return tab; }, addEventListener() {}, removeEventListener() {}, close() {} };
  const context = vm.createContext({ URL, Headers, JSON, console, window, location: { hostname: 'coach.example' },
    document: { documentElement: layoutViewport, querySelectorAll: () => presets, createElement: (tag) => node(`created-${nodes.size}-${tag}`) },
    $: node, currentGameId: 'g', lastStatus: status, selectedGameView: () => null, focusElement() {}, showToast() {}, showAuth() {},
    matchMedia(query) { return { matches: width <= Number(query.match(/max-width: (\d+)px/)[1]) }; },
    async fetch(url, options) {
      calls.push({ url, options });
      const reply = replies.shift();
      assert.ok(reply, `unexpected API call: ${url}`);
      return { ok: reply.ok !== false, status: reply.status || 200, json: async () => reply.data || reply };
    }
  });
  vm.runInContext(`${apiCode}\n${previewCode}\nglobalThis.ui = { preview, loadPreview, renderPreviewEndpoint, openPreview, syncPreview };`, context);
  context.ui.preview.open = true; context.ui.preview.gameId = 'g';
  return { ...context.ui, nodes, node, presets, calls, opened, window, tabs, loadedViewports, setWidth(value) { width = value; } };
}
const eligible = () => ({ gameId: 'g', available: false, reason: 'remote-viewer', remotePreview: true });
const projection = () => ({ gameId: 'g', available: true, endpoints: [remote] });

test('S6 eligible phone POSTs with mutation protection, embeds frameUrl, and only explicit link opens openUrl', async () => {
  const h = harness([eligible(), projection()]);
  await h.loadPreview();
  assert.equal(h.calls[1].url, '/api/games/preview/remote');
  assert.equal(h.calls[1].options.method, 'POST');
  assert.equal(h.calls[1].options.headers.get('X-Sideline-Action'), '1');
  assert.equal(h.calls[1].options.headers.get('Content-Type'), 'application/json');
  assert.equal(h.calls[1].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(h.calls[1].options.body), { gameId: 'g' });
  assert.equal(h.node('previewFrame').src, remote.remote.frameUrl);
  assert.equal(h.node('previewOpenTab').href, remote.remote.openUrl);
  assert.equal(h.node('previewMessage').hidden, true);
  assert.deepEqual(h.opened, []);
  assert.equal(h.window.location.href, 'https://coach.example/?previewWork=g');
  assert.equal(h.node('previewDevice').style.height, '');
  assert.equal(h.node('previewFrame').style.height, '100%');
  assert.ok(h.presets.every((p) => !p.hidden), 'remote transport does not suppress viewport choices');
});

test('S6 page selection uses remoteUrl while canonical home stays unchanged', async () => {
  const h = harness([eligible(), projection()]); await h.loadPreview();
  h.node('previewPageSelect').handlers.change({ target: { value: 'settings.html' } });
  assert.equal(h.node('previewFrame').src, remote.pages[1].remoteUrl);
  assert.equal(h.node('previewOpenTab').href, remote.pages[1].remoteUrl);
  assert.equal(h.preview.canonicalEndpoint.remote.openUrl, remote.remote.openUrl);
  assert.equal(h.calls.length, 2);
});

test('S6 unavailable, failed and stale projections remain recoverable without exposing server details', async () => {
  const unavailable = harness([{ gameId: 'g', reason: 'remote-viewer', remotePreview: false }]);
  await unavailable.loadPreview();
  assert.equal(unavailable.calls.length, 1, 'unavailable remote eligibility never attempts a mutation');
  assert.ok(unavailable.node('previewMessage').children.some((c) => c.textContent === 'Retry'));
  for (const reply of [{ gameId: 'g', reason: 'remote-viewer', remotePreview: false },
    { ok: false, status: 403, data: { message: 'SECRET port=1234 instance=x' } }]) {
    const h = harness([eligible(), reply]); await h.loadPreview();
    assert.equal(h.node('previewMessage').hidden, false);
    assert.ok(h.node('previewMessage').children.some((c) => c.textContent === 'Retry'));
    assert.ok(!JSON.stringify(h.node('previewMessage').children.map((c) => c.textContent)).includes('SECRET'));
  }
  const h = harness([eligible(), projection(), eligible(), projection()]);
  await h.loadPreview();
  h.node('previewRetryBtn').handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.filter((c) => c.options.method === 'POST').length, 2, 'Retry requests a fresh grant projection');
  h.node('previewFrame').handlers.error();
  assert.equal(h.node('previewMessage').hidden, false);
});

test('S6 static ambiguity chooser re-POSTs selected entrypoint', async () => {
  const h = harness([eligible(), { gameId: 'g', reason: 'static-choice-required', staticPages: [{ path: 'home.html', label: 'Home' }] }, eligible(), projection()]);
  await h.loadPreview();
  const choose = h.node('previewMessage').children.find((c) => c.textContent === 'Home');
  choose.handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.parse(h.calls.at(-1).options.body).staticEntrypoint, 'home.html');
});

test('S6 desktop keeps local iframe mapping, preset controls and separate viewer ownership', async () => {
  const local = { clientUrl: 'http://localhost:5173/', source: 'detected', primary: true, ownership: 'verified' };
  const h = harness([{ gameId: 'g', available: true, endpoints: [local] }]);
  await h.loadPreview();
  assert.equal(h.node('previewFrame').src, local.clientUrl);
  assert.equal(h.node('previewOpenTab').href, local.clientUrl);
  assert.equal(h.calls.length, 1);
  assert.ok(h.presets.every((p) => !p.hidden));
  h.openPreview();
  assert.equal(h.opened.length, 1);
  assert.equal(new URL(h.opened[0]).searchParams.get('previewWork'), 'g');
  assert.equal(h.window.location.href, 'https://coach.example/?previewWork=g');
});

test('S6 browser consumes projection without deriving origins or granting iframe navigation authority', () => {
  assert.doesNotMatch(previewCode, /derivePreviewTag|hostPublicId|stadiumId|instanceId|remote\.mysidelinecoach|`p-\$\{/);
  assert.match(source, /sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" referrerpolicy="no-referrer"/);
  assert.doesNotMatch(previewCode, /allow-top-navigation|postMessage/);
});

for (const [viewer, width, expected] of [
  ['Phone', 390, 'phone'], ['Phone breakpoint', 619, 'phone'],
  ['Tablet breakpoint', 620, 'tablet'], ['Tablet', 820, 'tablet'],
  ['Tablet upper breakpoint', 1023, 'tablet'], ['Desktop breakpoint', 1024, 'desktop'], ['Desktop', 1440, 'desktop']
]) {
  test(`S57.55A ${viewer} defaults to ${expected} before launch, independent of host`, () => {
    for (const hostname of ['localhost', 'coach.example']) {
      for (const platform of ['win32', 'linux', 'darwin']) {
        const href = `https://${hostname}/?existing=keep#bootstrap`;
        const h = harness([], { width, href, status: { stadium: { platform, name: 'Physical Game computer' } } });
        h.syncPreview({ selectedGameId: 'g' });
        assert.equal(h.node('previewTargetLabel').hidden, false);
        assert.equal(h.node('previewTargetSelect').value, expected);
        assert.equal(h.preview.preset, expected);
        assert.equal(h.calls.length, 0, 'viewport default needs no Game resolution');
        assert.equal(h.opened.length, 0, 'selection precedes launching');
        h.openPreview();
        const launched = new URL(h.opened[0]);
        assert.equal(launched.searchParams.get('previewTarget'), expected);
        assert.equal(launched.searchParams.get('previewWork'), 'g');
        assert.equal(launched.searchParams.get('existing'), 'keep');
        assert.equal(launched.hash, '');
        assert.equal(h.window.location.href, href, 'Tab 1 stays in the cockpit');
        assert.equal(h.node('previewBackdrop').hidden, false); // mock default, not changed by launch
        assert.equal(h.tabs[0].target, '_blank');
        assert.equal(h.tabs[0].opener, null);
        assert.equal(h.opened.length, 1, 'only Tab 2 opens; no raw Game');
      }
    }
  });
}

for (const [viewer, width, target] of [
  ['Phone', 390, 'desktop'], ['Phone', 390, 'tablet'], ['Desktop', 1440, 'phone'],
  ['Tablet', 820, 'phone'], ['Tablet', 820, 'desktop']
]) {
  for (const transport of ['remote', 'desktop']) {
    test(`S57.55A ${viewer} overrides to ${target}: handoff configures ${transport} iframe before navigation`, async () => {
      const cockpit = harness([], { width, href: 'https://coach.example/?existing=keep' });
      cockpit.node('previewBackdrop').hidden = true;
      cockpit.node('previewTargetSelect').value = target;
      cockpit.openPreview();
      assert.equal(cockpit.node('previewBackdrop').hidden, true, 'cockpit never embeds Preview');
      assert.equal(cockpit.calls.length, 0);
      assert.equal(cockpit.opened.length, 1);
      const local = { clientUrl: 'http://localhost:5173/', primary: true, ownership: 'verified' };
      const replies = transport === 'remote' ? [eligible(), projection()] : [{ gameId: 'g', available: true, endpoints: [local] }];
      // Different receiving-tab width proves the query wins over reclassification.
      const viewerTab = harness(replies, { width: width === 390 ? 1440 : 390, href: cockpit.opened[0] });
      assert.equal(viewerTab.preview.preset, target, 'selected target is initialized before resolution');
      await viewerTab.loadPreview();
      assert.equal(viewerTab.preview.preset, target, 'transport cannot replace the choice');
      const viewport = viewerTab.loadedViewports[0];
      assert.equal(viewport.width, target === 'phone' ? '390px' : target === 'tablet' ? '768px' : '100%');
      assert.equal(viewport.height, target === 'phone' ? '844px' : target === 'tablet' ? '1024px' : '100%');
      assert.equal(viewerTab.presets.find((p) => p.dataset.previewPreset === target)['aria-pressed'], 'true');
      assert.ok(viewerTab.presets.every((p) => !p.hidden));
      assert.equal(viewerTab.node('previewOpenTab').href, transport === 'remote' ? remote.remote.openUrl : local.clientUrl);
      assert.equal(viewerTab.opened.length, 0, 'Game stays embedded until explicit link');
      assert.equal(viewerTab.calls.filter((c) => c.options.method === 'POST').length, transport === 'remote' ? 1 : 0);
      if (transport === 'remote') assert.deepEqual(JSON.parse(viewerTab.calls[1].options.body), { gameId: 'g' }, 'viewport is not auth or transport state');
    });
  }
}

test('S57.55A invalid or cockpit-only handoff target falls back to viewer default', () => {
  for (const query of ['previewWork=g&previewTarget=toString', 'previewWork=g&previewTarget=invalid', 'previewTarget=desktop']) {
    const h = harness([], { width: 390, href: `https://coach.example/?${query}` });
    assert.equal(h.preview.preset, 'phone');
  }
  assert.match(source, /id="previewTargetSelect"[\s\S]*?<option value="phone">Phone<\/option>[\s\S]*?<option value="tablet">Tablet<\/option>[\s\S]*?<option value="desktop">Desktop<\/option>/);
});

const localPreview = { clientUrl: 'http://localhost:5173/', primary: true, ownership: 'verified' };
const previewReplies = (transport) => transport === 'remote' ? [eligible(), projection()]
  : [{ gameId: 'g', available: true, endpoints: [localPreview] }];

for (const [width, height, target, expectedWidth, expectedHeight, adaptive] of [
  [390, 780, 'phone', '390px', '780px', '390x780'],
  [412, 915, 'phone', '412px', '915px', '412x915'],
  [820, 1180, 'tablet', '820px', '1180px', '820x1180'],
  [1440, 900, 'desktop', '100%', '100%', 'fill'],
  [412, 915, 'tablet', '768px', '1024px', null],
  [412, 915, 'desktop', '100%', '100%', null],
  [1440, 900, 'phone', '390px', '844px', null],
  [1440, 900, 'tablet', '768px', '1024px', null]
]) {
  for (const transport of ['local', 'remote']) {
    test(`S57.55C ${width}x${height} → ${target} uses ${adaptive ? 'adaptive' : 'emulated'} sizing over ${transport}`, async () => {
      for (const platform of ['win32', 'linux', 'darwin']) {
        const href = 'https://coach.example/?existing=keep';
        const cockpit = harness([], { width, href, visualViewport: { width, height },
          layoutViewport: { clientWidth: width + 10, clientHeight: height + 20 },
          status: { stadium: { platform, name: 'Physical Game host' } } });
        cockpit.node('previewTargetSelect').value = target;
        cockpit.openPreview();
        const url = new URL(cockpit.opened[0]);
        assert.equal(url.searchParams.get('previewTarget'), target);
        assert.equal(url.searchParams.get('previewViewport'), adaptive);
        assert.equal(cockpit.window.location.href, href);
        assert.equal(cockpit.opened.length, 1);
        assert.equal(cockpit.calls.length, 0);
        // Receiver dimensions/class cannot change the launcher's selected semantics.
        const receiver = harness(previewReplies(transport), { width: 1280, href: url.href,
          visualViewport: { width: 1280, height: 720 } });
        await receiver.loadPreview();
        assert.equal(receiver.loadedViewports[0].width, expectedWidth, 'width applied before navigation');
        assert.equal(receiver.loadedViewports[0].height, expectedHeight, 'height applied before navigation');
        assert.equal(receiver.loadedViewports[0].url, transport === 'remote' ? remote.remote.frameUrl : localPreview.clientUrl);
        assert.equal(receiver.node('previewOpenTab').href, transport === 'remote' ? remote.remote.openUrl : localPreview.clientUrl);
        assert.equal(receiver.opened.length, 0, 'raw Game remains an explicit third-tab action');
        if (transport === 'remote') assert.deepEqual(JSON.parse(receiver.calls[1].options.body), { gameId: 'g' });
      }
    });
  }
}

test('S57.55C uses current launch measurements and class after orientation changes without an observer', async () => {
  const cockpit = harness([], { width: 390, href: 'https://coach.example/', visualViewport: { width: 390, height: 780 } });
  cockpit.window.visualViewport = { width: 412, height: 915 };
  cockpit.openPreview();
  assert.equal(new URL(cockpit.opened[0]).searchParams.get('previewViewport'), '412x915');
  cockpit.setWidth(915);
  cockpit.window.visualViewport = { width: 915, height: 412 };
  cockpit.node('previewTargetSelect').value = 'tablet'; // current responsive class in landscape
  cockpit.openPreview();
  const href = cockpit.opened[1];
  assert.equal(new URL(href).searchParams.get('previewViewport'), '915x412');
  const receiver = harness(previewReplies('remote'), { href });
  await receiver.loadPreview();
  assert.equal(receiver.loadedViewports[0].width, '915px');
  assert.equal(receiver.loadedViewports[0].height, '412px');
  // Retaining Phone after crossing the Tablet breakpoint is cross-device emulation.
  cockpit.node('previewTargetSelect').value = 'phone';
  cockpit.openPreview();
  assert.equal(new URL(cockpit.opened[2]).searchParams.get('previewViewport'), null);
  const landscape = harness([], { width: 915, href: 'https://coach.example/', visualViewport: { width: 915, height: 412 } });
  assert.equal(landscape.node('previewTargetSelect').value, 'tablet');
  landscape.openPreview();
  assert.equal(new URL(landscape.opened[0]).searchParams.get('previewViewport'), '915x412');
});

test('S57.55C viewport fallback validates both dimensions and retains CSS-pixel precision', () => {
  for (const visualViewport of [undefined, { width: 0, height: 900 }, { width: NaN, height: 900 },
    { width: 412, height: Infinity }, { width: 999999, height: 900 }, { width: '412', height: 900 }]) {
    const h = harness([], { width: 412, href: 'https://coach.example/', visualViewport,
      layoutViewport: { clientWidth: 412.5, clientHeight: 900.25 } });
    h.openPreview();
    assert.equal(new URL(h.opened[0]).searchParams.get('previewViewport'), '412.5x900.25');
  }
  for (const layoutViewport of [undefined, { clientWidth: 0, clientHeight: 900 },
    { clientWidth: 412, clientHeight: NaN }, { clientWidth: 412, clientHeight: -1 }]) {
    const h = harness([], { width: 412, href: 'https://coach.example/?previewViewport=412x915', layoutViewport });
    h.openPreview();
    assert.equal(new URL(h.opened[0]).searchParams.get('previewViewport'), null, 'invalid measurement clears stale handoff');
  }
});

test('S57.55C invalid or unavailable handoff dimensions safely preserve canonical emulation', async () => {
  for (const viewport of ['', 'fill', '0x915', '-412x915', '412x0', '412xNaN', 'Infinityx915',
    '999999x915', '412x999999', '412x915x1', '4e2x915', ' 412x915']) {
    const url = new URL('https://coach.example/?previewWork=g&previewTarget=phone');
    url.searchParams.set('previewViewport', viewport);
    const h = harness(previewReplies('local'), { width: 412, href: url.href, visualViewport: { width: 412, height: 915 } });
    await h.loadPreview();
    assert.equal(h.loadedViewports[0].width, '390px');
    assert.equal(h.loadedViewports[0].height, '844px');
  }
  const cockpit = harness([], { width: 412, href: 'https://coach.example/?previewViewport=999x777' });
  assert.equal(cockpit.preview.adaptive, null, 'handoff is consumed only by Preview Work');
});

test('S57.55C existing preset controls reuse adaptive sizing only for its matching target', async () => {
  const h = harness(previewReplies('remote'), { href: 'https://coach.example/?previewWork=g&previewTarget=phone&previewViewport=412.5x915.25' });
  await h.loadPreview();
  h.presets[1].handlers.click();
  assert.equal(h.node('previewFrame').style.width, '768px');
  assert.equal(h.node('previewFrame').style.height, '1024px');
  h.presets[2].handlers.click();
  assert.equal(h.node('previewFrame').style.width, '412.5px');
  assert.equal(h.node('previewFrame').style.height, '915.25px');
  h.node('previewRotateBtn').handlers.click();
  assert.equal(h.node('previewFrame').style.width, '915.25px');
  assert.equal(h.node('previewFrame').style.height, '412.5px');
  assert.equal(h.loadedViewports.length, 1, 'preset/rotate controls resize the existing frame');
});
