// Android Push Notifications: self-hosted Web Push as an AlarmEngine event consumer.
//
// Proof for:
// - RFC 8291 payload encryption (byte-exact Appendix A vector + browser-side decrypt)
// - VAPID (RFC 8292) authorization; only the public key reaches any browser
// - device subscription lifecycle: register, persist, dead-subscription pruning, revoke
// - LOW / CRITICAL / reset delivery through the canonical AlarmEngine events, gated by preferences
// - one push per device per canonical event id
// - the service worker shows the notification and a tap focuses or opens Sideline
// - the page registers this device, keeps one delivery path per device, and keeps its fallback
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  encryptPushPayload,
  parsePushSubscription,
  validatePushEndpoint,
  vapidAuthorization,
  loadOrCreateVapidKeys,
  WebPushNotifier,
  MAX_PUSH_SUBSCRIPTIONS
} from '../out/control-plane/web-push.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { classifyDaemonRoute } from '../out/control-plane/remote-routes.js';
import { getDurableStadiumId } from '../out/game-identity.js';
import { DEFAULT_ALARM_PREFERENCES, DEFAULT_PREFERENCES, savePreferences } from '../out/running-players.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const pageSource = read('src', 'public', 'index.html');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const workerSource = read('src', 'public', 'sw.js');
const webPushSource = read('src', 'control-plane', 'web-push.ts');
const daemonSource = read('src', 'control-plane', 'daemon.ts');

const tempDir = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `sideline-push-${label}-`));
/** Normalizes objects created inside a vm realm for structural comparison. */
const plain = (value) => JSON.parse(JSON.stringify(value));
const FCM = 'https://fcm.googleapis.com/fcm/send/';

/** Acts as the browser: a real P-256 key pair and auth secret, and the matching decryptor. */
function browserSubscription(endpoint = `${FCM}${crypto.randomBytes(12).toString('base64url')}`) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const subscription = { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  const decrypt = (body) => {
    const salt = body.subarray(0, 16);
    const idLength = body.readUInt8(20);
    const serverPublic = body.subarray(21, 21 + idLength);
    const ciphertext = body.subarray(21 + idLength);
    const hkdf = (s, ikm, info, length) => {
      const prk = crypto.createHmac('sha256', s).update(ikm).digest();
      return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length);
    };
    const secret = ecdh.computeSecret(serverPublic);
    const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), serverPublic]), 32);
    const key = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
    assert.equal(plain.at(-1), 0x02, 'single final record delimiter');
    return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
  };
  return { subscription, decrypt };
}

function fakeTransport(statusFor = () => 201) {
  const sent = [];
  const transport = async (request) => {
    sent.push(request);
    const status = statusFor(request);
    if (status instanceof Error) throw status;
    return { status };
  };
  return { sent, transport };
}

const alarmEvent = (type, overrides = {}) => ({
  id: `alarm_${crypto.createHash('sha256').update(type + JSON.stringify(overrides)).digest('hex').slice(0, 20)}`,
  type,
  provider: 'claude',
  window: 'five_hour',
  windowLabel: '5H',
  previousState: 'NORMAL',
  currentState: type === 'alarm:threshold_escalated' ? 'CRITICAL' : type === 'alarm:threshold_entered' ? 'LOW' : 'NORMAL',
  severity: type === 'alarm:threshold_escalated' ? 'critical' : type === 'alarm:threshold_entered' ? 'warning' : 'info',
  timestamp: new Date().toISOString(),
  message: type === 'alarm:reset_boundary_reached' ? 'Claude 5H window has reset.'
    : type === 'alarm:threshold_escalated' ? 'Claude 5H critical · 4% remaining · resets in 1h' : 'Claude 5H quota low · 19% remaining · resets in 2h',
  ...overrides
});
const browserOn = { ...DEFAULT_ALARM_PREFERENCES, channels: { vscode: false, browser: true } };

test('PUSH-1. aes128gcm encryption matches the RFC 8291 Appendix A vector byte for byte', () => {
  const body = encryptPushPayload(
    Buffer.from('When I grow up, I want to be a watermelon'),
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'), serverPrivateKey: Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url') }
  );
  assert.equal(body.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');

  const browser = browserSubscription();
  const fresh = encryptPushPayload(Buffer.from('{"ok":true}'), browser.subscription.keys.p256dh, browser.subscription.keys.auth);
  assert.deepEqual(browser.decrypt(fresh), { ok: true }, 'a real browser key pair decrypts a production-mode message');
});

test('PUSH-2. VAPID signs for the push origin and only the public key is ever exposed', () => {
  const dir = tempDir('vapid');
  try {
    const keys = loadOrCreateVapidKeys(dir);
    const again = loadOrCreateVapidKeys(dir);
    assert.equal(again.publicKey, keys.publicKey, 'the key pair persists across daemon restarts');
    const header = vapidAuthorization(`${FCM}abc`, keys, Date.UTC(2026, 8, 26));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    assert.equal(k, keys.publicKey);
    const [h, p, s] = token.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
    assert.equal(claims.aud, 'https://fcm.googleapis.com');
    assert.ok(claims.exp - Date.UTC(2026, 8, 26) / 1000 <= 24 * 3600, 'RFC 8292 caps exp at 24h');
    assert.match(claims.sub, /^https:\/\//);
    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));

    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'vapid.json'), 'utf8'));
    assert.ok(!pageSource.includes(stored.privateKey) && !workerSource.includes(stored.privateKey));
    assert.doesNotMatch(pageScript, /privateKey|vapid\.json/, 'browser code never names private VAPID material');
    assert.doesNotMatch(workerSource, /privateKey|vapid/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PUSH-3. only browser-vendor push services are accepted as endpoints (no daemon-side SSRF)', () => {
  for (const ok of [`${FCM}x`, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-by3p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/x']) {
    assert.ok(validatePushEndpoint(ok), ok);
  }
  for (const bad of ['http://fcm.googleapis.com/fcm/send/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://fcm.googleapis.com.evil.test/x',
    'https://evil.test/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'https://user:pw@fcm.googleapis.com/x', `${FCM}${'x'.repeat(3000)}`, 42]) {
    assert.equal(validatePushEndpoint(bad), undefined, String(bad).slice(0, 60));
  }
  const { subscription } = browserSubscription();
  assert.ok(parsePushSubscription(subscription));
  assert.equal(parsePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'short' } }), undefined);
  assert.equal(parsePushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65, 3).toString('base64url') } }), undefined);
});

test('PUSH-4. LOW, CRITICAL and reset alarms push once per device with a bounded, content-free payload', async () => {
  const dir = tempDir('notifier');
  try {
    const { sent, transport } = fakeTransport();
    const notifier = new WebPushNotifier({ dir, transport });
    const phone = browserSubscription();
    const laptop = browserSubscription();
    notifier.register(parsePushSubscription(phone.subscription), 'device:phone-1', 'Android · Chrome');
    notifier.register(parsePushSubscription(laptop.subscription), 'local', 'Windows · Chrome');

    for (const type of ['alarm:threshold_entered', 'alarm:threshold_escalated', 'alarm:reset_boundary_reached']) {
      const event = alarmEvent(type);
      const results = await notifier.deliverAlarm(event, browserOn);
      assert.equal(results.length, 2, `${type}: one push per registered device`);
      assert.ok(results.every((result) => result.outcome === 'delivered'));
      const toPhone = sent.filter((request) => request.endpoint === phone.subscription.endpoint).at(-1);
      const payload = phone.decrypt(toPhone.body);
      assert.deepEqual(Object.keys(payload).sort(), ['body', 'kind', 'tag', 'title', 'url', 'v']);
      assert.equal(payload.kind, 'alarm');
      assert.equal(payload.title, 'Sideline Coach · AI Usage');
      assert.equal(payload.body, event.message, 'the AlarmEngine message is the whole notification body');
      assert.equal(payload.tag, `sideline-ai-alarm-${event.id}`, 'same tag as the page-side fallback');
      assert.equal(payload.url, '/');
      assert.match(toPhone.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
      assert.equal(toPhone.headers['Content-Encoding'], 'aes128gcm');
      assert.equal(toPhone.headers.Urgency, 'high');
      assert.match(toPhone.headers.Topic, /^[\w-]{1,32}$/);
      assert.ok(Number(toPhone.headers.TTL) > 0);
    }
    assert.equal(sent.length, 6);

    const repeat = alarmEvent('alarm:threshold_entered');
    assert.deepEqual(await notifier.deliverAlarm(repeat, browserOn), [], 'a replayed canonical event id is never pushed twice');
    assert.equal(sent.length, 6);

    const long = alarmEvent('alarm:threshold_entered', { id: 'alarm_long', message: `Claude ${'x'.repeat(500)}` });
    await notifier.deliverAlarm(long, browserOn);
    const longToPhone = sent.filter((request) => request.endpoint === phone.subscription.endpoint).at(-1);
    assert.ok(phone.decrypt(longToPhone.body).body.length <= 180, 'notification copy is bounded');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PUSH-5. alarm preference gates stay authoritative and push never evaluates thresholds', async () => {
  const dir = tempDir('gates');
  try {
    const { sent, transport } = fakeTransport();
    const notifier = new WebPushNotifier({ dir, transport });
    notifier.register(parsePushSubscription(browserSubscription().subscription), 'local', 'Desktop');
    const low = (id) => alarmEvent('alarm:threshold_entered', { id });
    const reset = (id) => alarmEvent('alarm:reset_boundary_reached', { id });

    await notifier.deliverAlarm(low('a1'), { ...browserOn, enabled: false });
    await notifier.deliverAlarm(low('a2'), { ...browserOn, channels: { vscode: true, browser: false } });
    await notifier.deliverAlarm(low('a3'), { ...browserOn, notifyOnThreshold: false });
    await notifier.deliverAlarm(reset('a4'), { ...browserOn, notifyOnReset: false });
    assert.equal(sent.length, 0);
    await notifier.deliverAlarm(reset('a5'), { ...browserOn, notifyOnThreshold: false });
    await notifier.deliverAlarm(low('a6'), { ...browserOn, notifyOnReset: false });
    assert.equal(sent.length, 2, 'each class obeys only its own switch');

    assert.doesNotMatch(webPushSource, /health-authority|evaluateAlarmState|normalizeAlarmFacts|thresholds|remainingPercent/,
      'the push layer reads no health telemetry and no threshold values');
    const consumers = [...daemonSource.matchAll(/this\.webPush\.deliverAlarm\(/g)];
    assert.equal(consumers.length, 1, 'push is fed from one place');
    const deliverAlarmEvent = daemonSource.slice(daemonSource.indexOf('private deliverAlarmEvent('), daemonSource.indexOf('private enqueuePendingAlarm('));
    assert.match(deliverAlarmEvent, /this\.webPush\.deliverAlarm\(event, this\.getPreferences\(\)\.alarms\)/, 'the consumer sits on the canonical domain-event seam');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PUSH-6. subscriptions persist per device; dead ones are pruned, transient failures are kept', async () => {
  const dir = tempDir('lifecycle');
  try {
    const gone = browserSubscription();
    const expired = browserSubscription();
    const wrongKey = browserSubscription();
    const flaky = browserSubscription();
    const offline = browserSubscription();
    const statuses = new Map([[gone.subscription.endpoint, 410], [expired.subscription.endpoint, 404], [wrongKey.subscription.endpoint, 403], [flaky.subscription.endpoint, 503]]);
    const { transport } = fakeTransport((request) => request.endpoint === offline.subscription.endpoint ? new Error('ENOTFOUND') : statuses.get(request.endpoint) ?? 201);
    const notifier = new WebPushNotifier({ dir, transport });
    for (const [index, browser] of [gone, expired, wrongKey, flaky, offline].entries()) {
      notifier.register(parsePushSubscription(browser.subscription), `device:d${index}`, `Phone ${index}`);
    }
    notifier.register(parsePushSubscription(gone.subscription), 'device:d0', 'Phone 0 renamed');
    assert.equal(notifier.list().length, 5, 're-registering an endpoint updates it in place');

    const results = await notifier.deliverAlarm(alarmEvent('alarm:threshold_escalated', { id: 'lifecycle' }), browserOn);
    assert.deepEqual(results.map((result) => result.outcome).sort(), ['failed', 'failed', 'removed', 'removed', 'removed']);

    const reloaded = new WebPushNotifier({ dir, transport });
    assert.deepEqual(reloaded.list().map((entry) => entry.endpoint).sort(), [flaky.subscription.endpoint, offline.subscription.endpoint].sort());
    assert.equal(reloaded.list().find((entry) => entry.endpoint === flaky.subscription.endpoint).lastFailure, 'status 503');
    const stored = fs.readFileSync(path.join(dir, 'subscriptions.json'), 'utf8');
    assert.doesNotMatch(stored, /privateKey/, 'subscriptions and VAPID material are separate files');

    assert.equal(reloaded.removeOwner('device:d3'), 1, 'revoking a paired device removes its subscription');
    assert.equal(reloaded.unregister(offline.subscription.endpoint), true);
    assert.equal(reloaded.list().length, 0);

    for (let index = 0; index < MAX_PUSH_SUBSCRIPTIONS + 3; index += 1) {
      reloaded.register(parsePushSubscription(browserSubscription().subscription), 'local', `B${index}`);
    }
    assert.equal(reloaded.list().length, MAX_PUSH_SUBSCRIPTIONS, 'the store is bounded');
    assert.match(daemonSource, /this\.webPush\.removeOwner\(`device:\$\{deviceId\}`\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PUSH-7. Test Notification sends a real push only to a registered device, with a cooldown', async () => {
  const dir = tempDir('test-push');
  try {
    let now = 1_000_000;
    const { sent, transport } = fakeTransport();
    const notifier = new WebPushNotifier({ dir, transport, now: () => now });
    const phone = browserSubscription();
    assert.equal((await notifier.sendTest(phone.subscription.endpoint)).ok, false, 'unregistered devices are refused');
    notifier.register(parsePushSubscription(phone.subscription), 'device:p', 'Android · Chrome');
    const result = await notifier.sendTest(phone.subscription.endpoint);
    assert.equal(result.ok, true);
    const payload = phone.decrypt(sent[0].body);
    assert.equal(payload.kind, 'test');
    assert.doesNotMatch(payload.body, /LOW|CRITICAL|quota|reset/i, 'the test is transport proof, not a fake alarm');
    assert.equal((await notifier.sendTest(phone.subscription.endpoint)).ok, false, 'rapid repeats are throttled');
    now += 5_000;
    assert.equal((await notifier.sendTest(phone.subscription.endpoint)).ok, true);
    assert.equal(sent.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PUSH-8. daemon: register over HTTP, then real LOW → CRITICAL → reset alarms and a test reach the push transport', async () => {
  const dir = tempDir('daemon');
  const port = 39761;
  savePreferences(path.join(dir, 'preferences.json'), { ...DEFAULT_PREFERENCES, alarms: browserOn });
  const { sent, transport } = fakeTransport();
  const daemon = new ControlPlaneDaemon({ dir, port, idleTimeoutMs: 60_000, webPush: { transport } });
  const call = (route, { method = 'GET', body, token } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(payload);
  });
  const waitForSends = async (count) => {
    const end = Date.now() + 3000;
    while (sent.length < count && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sent.length, count);
  };
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();

    const worker = await call('/sw.js');
    assert.equal(worker.status, 200);
    assert.match(worker.headers['content-type'], /javascript/);
    assert.match(worker.text, /addEventListener\('push'/);
    assert.equal(classifyDaemonRoute('GET', '/sw.js'), 'public');
    assert.equal(classifyDaemonRoute('GET', '/api/push/config'), 'remote-read');
    for (const route of ['/api/push/subscriptions', '/api/push/unsubscribe', '/api/push/test']) assert.equal(classifyDaemonRoute('POST', route), 'remote-mutate');

    assert.equal((await call('/api/push/config')).status, 401, 'push config needs an authenticated principal');
    const config = JSON.parse((await call('/api/push/config', { token })).text);
    assert.match(config.publicKey, /^[\w-]{87}$/);
    assert.deepEqual(Object.keys(config).sort(), ['publicKey', 'success']);
    const vapid = JSON.parse(fs.readFileSync(path.join(dir, 'push', 'vapid.json'), 'utf8'));
    assert.equal(vapid.publicKey, config.publicKey);

    const phone = browserSubscription();
    assert.equal((await call('/api/push/subscriptions', { method: 'POST', token, body: { subscription: { endpoint: 'https://evil.test/x', keys: phone.subscription.keys } } })).status, 400);
    const registered = await call('/api/push/subscriptions', { method: 'POST', token, body: { subscription: phone.subscription, label: 'Android · Chrome' } });
    assert.equal(registered.status, 200);
    assert.equal(JSON.parse(registered.text).registered, true);
    assert.equal(daemon.webPushInstance.list()[0].owner, 'local');

    const stadiumId = getDurableStadiumId(dir);
    const resetsAt = Math.floor(Date.now() / 1000) + 7200;
    const evidence = (utilization) => ({
      stadiumId, instanceId: 'push-window', gameId: 'game-push', playerInstanceId: 'claude-health',
      evidence: { provider: 'claude', type: 'rate_limit_event', rate_limit_info: { rateLimitType: 'five_hour', utilization, resetsAt } }
    });
    daemon.healthAuthorityInstance.ingest(evidence(0.70));
    daemon.healthAuthorityInstance.ingest(evidence(0.81));
    await waitForSends(1);
    assert.equal(phone.decrypt(sent[0].body).body, 'Claude 5H quota low · 19% remaining · resets in 2h');

    daemon.healthAuthorityInstance.ingest(evidence(0.82));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sent.length, 1, 'staying LOW is not a new canonical event, so no new push');

    daemon.healthAuthorityInstance.ingest(evidence(0.97));
    await waitForSends(2);
    assert.match(phone.decrypt(sent[1].body).body, /^Claude 5H critical · 3% remaining/);

    daemon.alarmEngineInstance.reconcileClockHorizons(new Date((resetsAt + 60) * 1000));
    await waitForSends(3);
    assert.equal(phone.decrypt(sent[2].body).body, 'Claude 5H window has reset.');

    const tested = await call('/api/push/test', { method: 'POST', token, body: { endpoint: phone.subscription.endpoint } });
    assert.equal(tested.status, 200);
    await waitForSends(4);
    assert.equal(phone.decrypt(sent[3].body).kind, 'test');

    const removed = await call('/api/push/unsubscribe', { method: 'POST', token, body: { endpoint: phone.subscription.endpoint } });
    assert.equal(JSON.parse(removed.text).removed, true);
    assert.equal((await call('/api/push/test', { method: 'POST', token, body: { endpoint: phone.subscription.endpoint } })).status, 409);
  } finally {
    await daemon.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function loadWorker({ clients = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    location: { origin: 'https://h-abc.remote.mysidelinecoach.com' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => undefined,
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: {
      claim: async () => undefined,
      matchAll: async () => clients,
      openWindow: async (url) => { opened.push(url); return {}; }
    }
  };
  vm.runInNewContext(workerSource, { self, URL, console });
  const dispatch = async (type, event) => {
    let pending;
    listeners[type]({ ...event, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  return { listeners, shown, opened, dispatch };
}

test('PUSH-9. the service worker shows pushed notifications and a tap returns to Sideline', async () => {
  const worker = loadWorker();
  assert.ok(worker.listeners.push && worker.listeners.notificationclick);
  assert.equal(worker.listeners.fetch, undefined, 'the worker intercepts no requests');

  await worker.dispatch('push', { data: { json: () => ({ v: 1, kind: 'alarm', title: 'Sideline Coach · AI Usage', body: 'Claude 5H critical · 4% remaining', tag: 'sideline-ai-alarm-alarm_1', url: '/' }) } });
  assert.deepEqual(plain(worker.shown[0]), { title: 'Sideline Coach · AI Usage', options: { body: 'Claude 5H critical · 4% remaining', tag: 'sideline-ai-alarm-alarm_1', renotify: false, data: { url: '/' } } });

  await worker.dispatch('push', { data: { json: () => { throw new SyntaxError('bad'); } } });
  assert.equal(worker.shown[1].title, 'Sideline Coach', 'an unreadable push still shows a notification (Chrome requires one)');
  await worker.dispatch('push', { data: { json: () => ({ title: 'x'.repeat(200), body: 'y'.repeat(400), tag: '<script>', url: 'https://evil.test' }) } });
  assert.ok(worker.shown[2].title.length <= 60 && worker.shown[2].options.body.length <= 180);
  assert.equal(worker.shown[2].options.tag, 'sideline');
  assert.deepEqual(plain(worker.shown[2].options.data), { url: '/' }, 'the tap target is never taken from the payload');

  let closed = false;
  await worker.dispatch('notificationclick', { notification: { close: () => { closed = true; } } });
  assert.equal(closed, true);
  assert.deepEqual(worker.opened, ['/'], 'no open Sideline window: open one');

  let focused = 0;
  const open = loadWorker({ clients: [
    { url: 'https://other.test/', focus: async () => { focused += 10; } },
    { url: 'https://h-abc.remote.mysidelinecoach.com/', focus: async () => { focused += 1; } }
  ] });
  await open.dispatch('notificationclick', { notification: { close: () => undefined } });
  assert.equal(focused, 1, 'an open Sideline window is focused');
  assert.deepEqual(open.opened, []);
});

function loadPagePush({ secure = true, serviceWorker = true, permission = 'granted', browserChannel = true, existingKey } = {}) {
  const start = pageScript.indexOf('const browserNotificationApi = ');
  const end = pageScript.indexOf('let syncedAlarmPreferences = alarmPreferencesFromStatus(null);');
  assert.ok(start > 0 && end > start);
  const elements = new Map(['alarmBrowserDeviceStatus', 'alarmBrowserTestBtn'].map((id) => [id, { id, hidden: true, disabled: false, textContent: '' }]));
  const calls = [];
  const constructed = [];
  const workerShown = [];
  const serverKey = crypto.createECDH('prime256v1');
  serverKey.generateKeys();
  const phone = browserSubscription();
  let subscribeOptions;
  let active;
  const makeSubscription = (key) => ({
    endpoint: phone.subscription.endpoint,
    options: { applicationServerKey: key },
    toJSON: () => phone.subscription,
    unsubscribe: async () => { active = undefined; return true; }
  });
  if (existingKey) active = makeSubscription(existingKey);
  const registration = {
    pushManager: {
      getSubscription: async () => active ?? null,
      subscribe: async (options) => { subscribeOptions = options; active = makeSubscription(options.applicationServerKey.buffer); return active; }
    },
    showNotification: async (title, options) => { workerShown.push({ title, options }); }
  };
  class NotificationStub {
    static permission = permission;
    constructor(title, options) { constructed.push({ title, options }); }
  }
  const context = {
    Notification: NotificationStub,
    PushManager: serviceWorker ? function PushManager() {} : undefined,
    isSecureContext: secure,
    navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      ...(serviceWorker ? { serviceWorker: {
        register: async (url, options) => { calls.push({ route: 'register', url, options }); return registration; },
        ready: Promise.resolve(registration),
        getRegistration: async () => registration
      } } : {})
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array,
    console: { error: () => undefined },
    $: (id) => elements.get(id),
    api: async (route, options = {}) => {
      calls.push({ route, body: options.body ? JSON.parse(options.body) : undefined });
      if (route === '/api/push/config') return { success: true, publicKey: serverKey.getPublicKey().toString('base64url') };
      return { success: true, registered: true };
    }
  };
  context.globalThis = context;
  vm.runInNewContext(`${pageScript.slice(start, end)}
    let syncedAlarmPreferences = { enabled: true, notifyOnThreshold: true, notifyOnReset: true, channels: { vscode: true, browser: ${browserChannel} } };
    globalThis.page = { ensurePushRegistration, removePushRegistration, deliverBrowserAlarm, pushDevice, renderPushDeviceState };`, context);
  return { page: context.page, elements, calls, constructed, workerShown, serverKey, phone, subscribeOptions: () => subscribeOptions };
}

test('PUSH-10. the page registers this device with the daemon and states the result separately from permission', async () => {
  const harness = loadPagePush();
  assert.equal(await harness.page.ensurePushRegistration(), true);
  assert.deepEqual(harness.calls.map((call) => call.route), ['/api/push/config', 'register', '/api/push/subscriptions']);
  assert.deepEqual(plain(harness.calls[1]), { route: 'register', url: '/sw.js', options: { scope: '/' } });
  assert.equal(harness.subscribeOptions().userVisibleOnly, true);
  assert.deepEqual(Buffer.from(harness.subscribeOptions().applicationServerKey), harness.serverKey.getPublicKey());
  assert.deepEqual(plain(harness.calls[2].body), { subscription: harness.phone.subscription, label: 'Android · Chrome' });
  assert.equal(harness.page.pushDevice.state, 'registered');
  assert.match(harness.elements.get('alarmBrowserDeviceStatus').textContent, /notification tray, even when Sideline is closed/);
  assert.equal(harness.elements.get('alarmBrowserTestBtn').hidden, false);

  const rotated = loadPagePush({ existingKey: Buffer.alloc(65, 4).buffer });
  await rotated.page.ensurePushRegistration();
  assert.ok(rotated.subscribeOptions(), 'a subscription made for an old daemon key is replaced');

  const insecure = loadPagePush({ secure: false });
  assert.equal(await insecure.page.ensurePushRegistration(), false);
  assert.equal(insecure.calls.length, 0);
  assert.match(insecure.elements.get('alarmBrowserDeviceStatus').textContent, /only while Sideline is open, because this page is not on a secure/);
  assert.equal(insecure.elements.get('alarmBrowserTestBtn').hidden, true);

  const unpermitted = loadPagePush({ permission: 'default' });
  assert.equal(await unpermitted.page.ensurePushRegistration(), false, 'permission alone is required first; nothing is registered without it');
  assert.equal(unpermitted.calls.length, 0);

  await harness.page.removePushRegistration();
  assert.deepEqual(plain(harness.calls.at(-1)), { route: '/api/push/unsubscribe', body: { endpoint: harness.phone.subscription.endpoint } });
  assert.equal(harness.page.pushDevice.state, 'idle');
});

test('PUSH-11. one delivery path per device: push when registered, worker fallback on Android, constructor on desktop', async () => {
  const alarm = { id: 'alarm_page_1', type: 'alarm:threshold_entered', message: 'Claude 5H quota low · 19% remaining' };
  const registered = loadPagePush();
  await registered.page.ensurePushRegistration();
  registered.page.deliverBrowserAlarm(alarm);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(registered.workerShown.length + registered.constructed.length, 0, 'the service worker push owns this device');

  const unregistered = loadPagePush();
  unregistered.page.deliverBrowserAlarm(alarm);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(plain(unregistered.workerShown), [{ title: 'Sideline Coach · AI Usage', options: { body: alarm.message, tag: 'sideline-ai-alarm-alarm_page_1', renotify: false } }]);
  assert.equal(unregistered.constructed.length, 0, 'Android Chrome path uses the worker registration, not the constructor');

  const desktop = loadPagePush({ serviceWorker: false });
  desktop.page.deliverBrowserAlarm(alarm);
  assert.equal(desktop.constructed.length, 1, 'browsers without a worker keep the synchronous constructor path');

  const off = loadPagePush({ browserChannel: false });
  off.page.deliverBrowserAlarm(alarm);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(off.workerShown.length + off.constructed.length, 0);

  assert.match(pageSource, /id="alarmBrowserTestBtn"[^>]*>Test Notification</);
  assert.match(pageScript, /api\('\/api\/push\/test'/);
  assert.match(read('package.json'), /"src\/public\/sw\.js"/, 'the worker ships in the VSIX');
});
