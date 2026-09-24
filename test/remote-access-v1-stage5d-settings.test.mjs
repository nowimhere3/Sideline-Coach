import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const controllerStart = pageScript.indexOf('// Stage 5D — local Remote Access control room.');
const controllerEnd = pageScript.indexOf('// BREADCRUMB: Settings disclosure', controllerStart);
assert.ok(controllerStart >= 0 && controllerEnd > controllerStart, 'Stage 5D controller is extractable');
const controllerSource = `${pageScript.slice(controllerStart, controllerEnd)}\nwindow.Stage5DTest = { syncRemoteAccessSettings, loadPairedDevices };`;

function createHarness({ hostname = '127.0.0.1', enabled = false, devices = [] } = {}) {
  const calls = [];
  const confirmations = [];
  const elements = new Map();
  let pairAnotherCalls = 0;
  let currentDevices = devices.map((device) => ({ ...device }));

  const makeNode = (id = '', tagName = 'div') => {
    let inner = '';
    const node = {
      id, tagName, hidden: false, disabled: false, checked: false, value: '', textContent: '', className: '',
      children: [], attributes: {}, listeners: {}, dataset: {},
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      focus() {}
    };
    Object.defineProperty(node, 'innerHTML', {
      get: () => inner,
      set: (value) => { inner = String(value); node.children = []; }
    });
    return node;
  };
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  };
  const api = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method, body: options.body });
    if (url === '/api/preferences') return { success: true, preferences: { remoteAccess: { enabled: true } } };
    if (url === '/api/status') return { success: true, preferences: { remoteAccess: { enabled: true } }, remoteAccess: { state: 'connecting' } };
    if (url === '/api/devices' && method === 'GET') return { success: true, devices: currentDevices.map((device) => ({ ...device })) };
    if (url === '/api/devices' && method === 'DELETE') { currentDevices = []; return { success: true, revoked: devices.length }; }
    if (url.startsWith('/api/devices/') && method === 'PATCH') {
      const id = decodeURIComponent(url.slice('/api/devices/'.length));
      const label = JSON.parse(options.body).label;
      currentDevices = currentDevices.map((device) => device.deviceId === id ? { ...device, label } : device);
      return { success: true };
    }
    if (url.startsWith('/api/devices/') && method === 'DELETE') {
      const id = decodeURIComponent(url.slice('/api/devices/'.length));
      currentDevices = currentDevices.filter((device) => device.deviceId !== id);
      return { success: true };
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const context = {
    $, api, location: { hostname }, connectionState: 'connected',
    isRemoteDevicePresentation: () => {
      const host = String(hostname || '').toLowerCase();
      return !!host && host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]';
    },
    lastStatus: { preferences: { remoteAccess: { enabled } }, remoteAccess: { state: enabled ? 'online' : 'off' } },
    canMutateLiveState: () => true,
    showToast() {},
    confirmAction: async (options) => { confirmations.push(options); return true; },
    document: { createElement: (tagName) => makeNode('', tagName) },
    window: { SendToPhoneController: { open() { pairAnotherCalls += 1; } } },
    Date, Number, String, JSON, Object, Array, console
  };
  vm.createContext(context);
  vm.runInContext(controllerSource, context);
  const fire = async (id, type, event = {}) => {
    for (const listener of $(`${id}`).listeners[type] || []) await listener({ target: $(id), ...event });
  };
  return { $, calls, confirmations, controller: context.window.Stage5DTest, fire, pairAnotherCalls: () => pairAnotherCalls };
}

test('RA5D-1. local Settings contains the existing-preference switch, product status, pairing reuse, and device administration', () => {
  assert.match(pageSource, /id="remoteAccessSettingsCard"[\s\S]*?id="remoteAccessToggle"[\s\S]*?id="remoteAccessStatus"[\s\S]*?Pair Another[\s\S]*?Paired phones/);
  assert.match(pageSource, /Connect and manage your paired phones/);
  assert.doesNotMatch(pageSource.match(/id="remoteAccessSettingsCard"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || '', /Fly\.io|wss:\/\/|relay\.remote|enrollment/i);
});

test('RA5D-2/3. master switch updates only remoteAccess.enabled and Pair Another reuses SendToPhoneController.open', async () => {
  const h = createHarness();
  h.$('remoteAccessToggle').checked = true;
  await h.fire('remoteAccessToggle', 'change');
  const preference = h.calls.find((call) => call.url === '/api/preferences');
  assert.deepEqual(JSON.parse(preference.body), { remoteAccess: { enabled: true } });
  await h.fire('remoteAccessPairAnotherBtn', 'click');
  assert.equal(h.pairAnotherCalls(), 1);
  const stage5d = pageSource.slice(pageSource.indexOf('// Stage 5D —'), pageSource.indexOf('// BREADCRUMB: Settings disclosure'));
  assert.doesNotMatch(stage5d, /api\/pairing\/create|QRCode/);
});

test('RA5D-4. local device list supports rename, confirmed revoke one, and confirmed revoke all through existing routes', async () => {
  const h = createHarness({ enabled: true, devices: [
    { deviceId: 'phone-1', label: 'Dad Phone', createdAt: 1_800_000_000_000, lastSeenAt: 1_800_000_001_000 },
    { deviceId: 'phone-2', label: 'Tablet', createdAt: 1_800_000_002_000, lastSeenAt: 1_800_000_003_000 }
  ] });
  await h.controller.loadPairedDevices();
  assert.equal(h.$('remoteDevicesList').children.length, 2);
  const first = h.$('remoteDevicesList').children[0];
  const input = first.children[0].children[0];
  const [save, revoke] = first.children[1].children;
  input.value = 'Kitchen Phone';
  await save.listeners.click[0]();
  assert.ok(h.calls.some((call) => call.method === 'PATCH' && call.url === '/api/devices/phone-1' && JSON.parse(call.body).label === 'Kitchen Phone'));
  await revoke.listeners.click[0]();
  assert.ok(h.calls.some((call) => call.method === 'DELETE' && call.url === '/api/devices/phone-1'));
  assert.equal(h.confirmations[0].confirmLabel, 'Revoke Phone');
  await h.fire('remoteDevicesRevokeAllBtn', 'click');
  assert.ok(h.calls.some((call) => call.method === 'DELETE' && call.url === '/api/devices'));
  assert.equal(h.confirmations[1].confirmLabel, 'Revoke All Phones');
});

test('RA5D-5. paired remote presentation shows only the read-only Remote Session card and never loads admin devices', async () => {
  const h = createHarness({ hostname: 'h-example.remote.mysidelinecoach.com', enabled: true });
  h.controller.syncRemoteAccessSettings({ preferences: { remoteAccess: { enabled: true } }, remoteAccess: { state: 'online' } });
  assert.equal(h.$('remoteAccessSettingsCard').hidden, true);
  assert.equal(h.$('remoteSessionSettingsCard').hidden, false);
  await h.controller.loadPairedDevices();
  assert.equal(h.calls.length, 0);
  assert.match(pageSource, /id="remoteSessionSettingsCard"[\s\S]*?Remote Session[\s\S]*?Connected to Sideline Coach/);
});

test('RA5D-6/7. device routes stay local-only and frontend never reads or deletes the HttpOnly sl_dev cookie', () => {
  assert.match(pageSource, /Frontend context detection is PRESENTATION ONLY|Presentation only\. Backend Principal \+ route policy remains the authority/);
  assert.doesNotMatch(pageScript, /document\.cookie|Disconnect This Phone/);
  const routeSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'remote-routes.ts'), 'utf8');
  assert.match(routeSource, /methods: \['GET', 'DELETE'\], path: '\/api\/devices', access: 'local-only'/);
  assert.match(routeSource, /methods: \['PATCH', 'DELETE'\], path: \/\^\\\/api\\\/devices/);
});

test('RA5D status contract projects only a Dad-facing state and no relay infrastructure', () => {
  const daemonSource = fs.readFileSync(path.join(repoRoot, 'src', 'control-plane', 'daemon.ts'), 'utf8');
  assert.match(daemonSource, /remoteAccess: \{ state: this\.remoteAccessProductState\(\) \}/);
  assert.match(daemonSource, /private remoteAccessProductState\(\): 'off' \| 'connecting' \| 'online' \| 'reconnecting' \| 'unavailable'/);
  const statusProjection = daemonSource.match(/private buildStatus\([\s\S]*?\n  \}/)?.[0] || '';
  assert.doesNotMatch(statusProjection, /relayUrl|relayDomain|enrollmentKey/);
});
