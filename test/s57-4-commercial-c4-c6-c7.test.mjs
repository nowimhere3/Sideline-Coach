/**
 * S57.4 Premium Commercial Batch — C4 + C6 + C7.
 *
 *   C4  Remote Minute metering, exhaustion and grace (observes the daemon's remote seams only)
 *   C6  signed entitlement, file-based (Ed25519, pinned keys, fallback to built-in default)
 *   C7  closed ProductEvent schema, privacy validator, bounded outbox, NO-OP transport
 *
 * Deterministic: injected clock and checkpoint timers, test-only Ed25519 keys.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EntitlementAuthority,
  FeatureGate,
  UsageStore,
  LicenseFileSource,
  RemoteMinuteMeter,
  PINNED_ENTITLEMENT_KEYS,
  CLOCK_ROLLBACK_TOLERANCE_MS,
  DEFAULT_REMOTE_GRACE_MINUTES,
  canonicalEntitlementPayload,
  verifySignedEntitlement,
  LICENSE_FILE,
  CLOCK_FILE,
  CAPABILITY_IDS
} from '../out/commercial/index.js';
import {
  buildProductEvent,
  validateProductEvent,
  TelemetryOutbox,
  NOOP_TRANSPORT,
  DEFAULT_TELEMETRY_CONSENT,
  TELEMETRY_OUTBOX_FILE,
  telemetryBatchId
} from '../out/telemetry/index.js';
import { ControlPlaneDaemon } from '../out/control-plane/daemon.js';
import { InProcessRemoteAdapter } from '../out/control-plane/remote-dispatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => fs.readFileSync(path.join(here, '..', 'src', ...parts), 'utf8');
const scratch = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `sideline-s57-4-${label}-`));
const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
const at = (iso) => Date.parse(iso);
const MINUTE = 60_000;
let nextPort = 39_860;
const port = () => { nextPort += 3; return nextPort; };

// ═════════════════════════════════════════════════════════════════════════════
// C4 — REMOTE MINUTE METERING
// ═════════════════════════════════════════════════════════════════════════════

const ANCHOR = at('2026-10-01T00:00:00Z'); // anchored (UTC) cycles keep month math zone-independent
const remoteQuota = (limit, extra = {}) => ({
  id: 'remote-test', label: 'Remote test',
  grants: [
    { grantId: 'remote-minutes', capability: 'remote.access', allowance: { kind: 'quota', limit, period: { kind: 'monthly', anchor: ANCHOR } }, source: 'override', ...extra },
    { grantId: 'games', capability: 'games.active', allowance: { kind: 'unlimited' }, source: 'override' }
  ]
});

async function remoteRig({ profile, start = at('2026-10-15T18:00:05Z'), dir = scratch('c4') } = {}) {
  let now = start;
  let timerCallback;
  const daemon = new ControlPlaneDaemon({
    dir, port: port(), idleTimeoutMs: 120_000,
    entitlements: {
      ...(profile ? { profile } : {}),
      now: () => now,
      meterTimers: { setInterval: (callback) => { timerCallback = callback; return 1; }, clearInterval: () => { timerCallback = undefined; } }
    }
  });
  await daemon.start();
  const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const adapter = new InProcessRemoteAdapter({ daemon, deviceRegistry: daemon.deviceRegistry, expectedOrigin: 'https://h-test.localhost' });
  let seq = 0;
  const phone = (label = 'Phone') => daemon.deviceRegistry.createDevice(label).rawToken;
  const request = async (device, pathname = '/api/status', headers = {}) => {
    const frames = [];
    await adapter.dispatch({ id: `r${++seq}`, method: 'GET', path: pathname, headers: { cookie: `sl_dev=${device}`, accept: 'application/json', ...headers } }, (frame) => frames.push(frame));
    const head = frames.find((frame) => frame.t === 'head');
    return { status: head?.status, body: frames.filter((frame) => frame.t === 'data').map((frame) => frame.chunk ?? '').join('') };
  };
  const stream = async (device) => {
    const id = `s${++seq}`;
    const frames = [];
    await adapter.dispatch({ id, method: 'GET', path: '/api/events', headers: { cookie: `sl_dev=${device}`, accept: 'text/event-stream' } }, (frame) => frames.push(frame));
    return {
      frames,
      text: () => frames.filter((frame) => frame.t === 'data').map((frame) => frame.chunk ?? '').join(''),
      ended: () => frames.some((frame) => frame.t === 'end'),
      close: () => adapter.cancel(id)
    };
  };
  const used = () => daemon.getEntitlementSnapshot().capabilities['remote.access'].used;
  const minutes = () => daemon.usageStore.state.minuteSets['remote.access'] ?? [];
  const local = async (pathname) => (await fetch(`http://127.0.0.1:${daemon.port}${pathname}`, { headers: { Authorization: `Bearer ${token}` } })).status;
  return {
    daemon, dir, phone, request, stream, used, minutes, local,
    set: (value) => { now = typeof value === 'string' ? at(value) : value; },
    advance: (ms) => { now += ms; },
    now: () => now,
    tick: () => timerCallback?.(),
    hasTimer: () => timerCallback !== undefined,
    stop: async ({ keepDir = false } = {}) => { await daemon.stop(); if (!keepDir) rm(dir); }
  };
}

const minuteOf = (ms) => Math.floor(ms / MINUTE);

test('C4-1. one phone = one minute, however many requests and stream events land inside it', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const phone = rig.phone();
    const s = await rig.stream(phone);
    for (let index = 0; index < 5; index++) assert.equal((await rig.request(phone)).status, 200);
    rig.advance(40_000);
    s.close();
    assert.equal(rig.used(), 1);
    assert.deepEqual(rig.minutes(), [[minuteOf(rig.now()), minuteOf(rig.now())]]);
  } finally { await rig.stop(); }
});

test('C4-2. two phones and several tabs in the same minute still consume one minute (once per install)', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const first = rig.phone('Phone A');
    const second = rig.phone('Phone B');
    const tabs = [await rig.stream(first), await rig.stream(first), await rig.stream(second)];
    await rig.request(second);
    rig.advance(20_000);
    for (const tab of tabs) tab.close();
    assert.equal(rig.used(), 1);
    assert.equal(rig.daemon.remoteMeter.openStreams, 0);
  } finally { await rig.stop(); }
});

test('C4-3. a reconnect storm inside one minute charges exactly one minute and journals it once', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const phone = rig.phone();
    for (let index = 0; index < 20; index++) {
      const s = await rig.stream(phone);
      rig.advance(2_000);
      s.close();
    }
    assert.equal(rig.used(), 1);
    assert.equal(rig.daemon.usageStore.journal().filter((receipt) => receipt.capability === 'remote.access').length, 1);
    assert.equal(rig.hasTimer(), false, 'the checkpoint timer stops with the last stream');
  } finally { await rig.stop(); }
});

test('C4-4. request-only Remote use marks just the minutes it happened in', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const phone = rig.phone();
    const first = minuteOf(rig.now());
    await rig.request(phone);
    rig.advance(2 * MINUTE);
    await rig.request(phone);
    assert.equal(rig.used(), 2, 'the minute between the two requests is not counted');
    assert.deepEqual(rig.minutes(), [[first, first], [first + 2, first + 2]]);
    // Public bootstrap paths never count.
    rig.advance(5 * MINUTE);
    await rig.request(phone, '/api/health');
    assert.equal(rig.used(), 2);
  } finally { await rig.stop(); }
});

test('C4-5. an open stream is presence: idle watching counts every minute through 60 s checkpoints', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const phone = rig.phone();
    const s = await rig.stream(phone);
    assert.equal(rig.hasTimer(), true, 'checkpoint armed while a remote stream is open');
    for (let index = 0; index < 5; index++) { rig.advance(MINUTE); rig.tick(); }
    assert.equal(rig.used(), 6, 'minutes 0..5');
    rig.advance(30_000);
    s.close();
    assert.equal(rig.used(), 6, 'closing inside minute 5 adds nothing new');
  } finally { await rig.stop(); }
});

test('C4-6. a suspended process never manufactures minutes: long gaps charge only the minute evidenced now', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  try {
    const s = await rig.stream(rig.phone());
    rig.advance(10 * MINUTE); // laptop asleep: no checkpoints ran
    rig.tick();
    assert.equal(rig.used(), 2, 'minute 0 and minute 10 only');
    s.close();
  } finally { await rig.stop(); }
});

test('C4-7. crash/restart never over-counts; under-count is bounded by the last checkpoint', async () => {
  const dir = scratch('c4-crash');
  const start = at('2026-10-15T18:00:00Z');
  const first = await remoteRig({ profile: remoteQuota(100), start, dir });
  try {
    await first.stream(first.phone());
    for (let index = 0; index < 3; index++) { first.advance(MINUTE); first.tick(); }
    assert.equal(first.used(), 4, 'minutes 0..3 charged and durable');
    first.advance(MINUTE + 30_000); // crash at 4:30 — minute 4 had presence but no checkpoint yet
    const reopened = new UsageStore({ dir: path.join(dir, 'entitlement') });
    const persisted = reopened.state.buckets['remote.access']['remote-minutes'];
    const total = Object.values(persisted).reduce((sum, bucket) => sum + bucket.used, 0);
    assert.equal(total, 4, 'actual presence was 5 minutes: under-count of exactly one, never over');

    // A replacement daemon on the SAME home sees exactly the durable minutes and adds only new evidence.
    const replacement = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 60_000, entitlements: { profile: remoteQuota(100), now: () => start + 20 * MINUTE } });
    await replacement.start();
    try {
      assert.equal(replacement.getEntitlementSnapshot().capabilities['remote.access'].used, 4);
    } finally { await replacement.stop(); }
  } finally { await first.stop({ keepDir: true }); rm(dir); }
});

test('C4-8. unlimited never exhausts, never starts grace, and still records usage for packaging', async () => {
  const rig = await remoteRig();
  try {
    const phone = rig.phone();
    const s = await rig.stream(phone);
    for (let index = 0; index < 120; index++) { rig.advance(MINUTE); rig.tick(); }
    assert.equal((await rig.request(phone)).status, 200);
    const state = rig.daemon.getEntitlementSnapshot().capabilities['remote.access'];
    assert.equal(state.unlimited, true);
    assert.equal(rig.daemon.remoteMeter.admission().state, 'allow');
    assert.equal(rig.daemon.remoteMeter.graceEpisode, undefined);
    assert.equal(fs.existsSync(path.join(rig.dir, 'entitlement', 'remote-meter.json')), false);
    assert.equal(rig.daemon.usageStore.state.buckets['remote.access']['builtin:unlimited:remote.access'].lifetime.used, 121);
    assert.equal(s.text().includes('remote-allowance'), false, 'no notice under unlimited');
    s.close();
  } finally { await rig.stop(); }
});

test('C4-9. a finite grant exhausts, grace is deterministic, then Remote pauses while the desktop is untouched', async () => {
  const rig = await remoteRig({ profile: remoteQuota(3, { graceMinutes: 2 }), start: at('2026-10-15T18:00:00Z') });
  try {
    const phone = rig.phone();
    const s = await rig.stream(phone);
    rig.advance(MINUTE); rig.tick();
    rig.advance(MINUTE); rig.tick(); // minute 2: the third and last minute
    const episode = rig.daemon.remoteMeter.graceEpisode;
    assert.ok(episode, 'grace began the moment the allowance reached zero');
    assert.equal(episode.graceUntil - episode.graceStartedAt, 2 * MINUTE, 'grant.graceMinutes is data');
    assert.equal((s.text().match(/event: remote-allowance/g) ?? []).length, 1, 'one concise notice');
    assert.match(s.text(), /"state":"grace"/);

    rig.advance(MINUTE); rig.tick();
    assert.equal((await rig.request(phone)).status, 200, 'grace keeps Remote working');
    assert.equal((s.text().match(/event: remote-allowance/g) ?? []).length, 1, 'still one notice');
    assert.equal(rig.used(), 3, 'grace minutes are not charged');

    rig.advance(MINUTE + 1_000); rig.tick(); // past graceUntil
    assert.equal(s.ended(), true, 'remote stream closed after grace');
    assert.match(s.text(), /"state":"exhausted"/);
    const refused = await rig.request(phone);
    assert.equal(refused.status, 403);
    assert.deepEqual(
      (({ code, capability }) => ({ code, capability }))(JSON.parse(refused.body)),
      { code: 'remote-allowance-exhausted', capability: 'remote.access' }
    );
    assert.match(JSON.parse(refused.body).message, /^Mobile Remote: allowance used up until /);
    const shell = await rig.request(phone, '/', { accept: 'text/html' });
    assert.equal(shell.status, 403);
    assert.match(shell.body, /Mobile Remote paused/);

    // Desktop and pairing are untouched.
    assert.equal(await rig.local('/api/status'), 200);
    assert.equal(rig.daemon.deviceRegistry.list().length, 1, 'the phone stays paired');

    // Access resumes by itself at the next billing cycle.
    rig.set('2026-11-01T00:00:30Z');
    assert.equal((await rig.request(phone)).status, 200);
    assert.equal(rig.daemon.remoteMeter.graceEpisode, undefined);
    assert.equal(fs.existsSync(path.join(rig.dir, 'entitlement', 'remote-meter.json')), false);
  } finally { await rig.stop(); }
});

test('C4-10. a restart during exhaustion never grants a fresh grace (the episode is durable)', async () => {
  const dir = scratch('c4-regrace');
  const start = at('2026-10-15T18:00:00Z');
  const rig = await remoteRig({ profile: remoteQuota(1, { graceMinutes: 1 }), start, dir });
  try {
    const phone = rig.phone();
    await rig.request(phone); // the only minute → exhausted → grace until +1 min
    assert.ok(rig.daemon.remoteMeter.graceEpisode);
  } finally { await rig.stop({ keepDir: true }); }
  const again = await remoteRig({ profile: remoteQuota(1, { graceMinutes: 1 }), start: start + 5 * MINUTE, dir });
  try {
    const phone = again.phone();
    assert.equal((await again.request(phone)).status, 403, 'the old episode already ended');
  } finally { await again.stop(); }
});

test('C4-11. grace defaults to S57.2 five minutes when no grant declares one', () => {
  const dir = scratch('c4-default-grace');
  try {
    let now = at('2026-10-15T18:00:00Z');
    const store = new UsageStore({ dir, now: () => now });
    const authority = new EntitlementAuthority({ profile: remoteQuota(1), usage: store, now: () => now });
    const gate = new FeatureGate(authority, { usage: store });
    const meter = new RemoteMinuteMeter({ gate, graceMinutes: () => authority.graceMinutes('remote.access'), dir, now: () => now, timers: { setInterval: () => 1, clearInterval: () => undefined } });
    meter.touch();
    assert.equal(DEFAULT_REMOTE_GRACE_MINUTES, 5);
    assert.equal(meter.graceEpisode.graceUntil - meter.graceEpisode.graceStartedAt, 5 * MINUTE);
    now += 4 * MINUTE;
    assert.equal(meter.admission().state, 'grace');
    now += MINUTE;
    assert.equal(meter.admission().state, 'exhausted');
  } finally { rm(dir); }
});

test('C4-12. not entitled is refused as before and never metered', async () => {
  const rig = await remoteRig({ profile: 'core' });
  try {
    const refused = await rig.request(rig.phone());
    assert.equal(refused.status, 403);
    assert.equal(JSON.parse(refused.body).code, 'capability-unavailable');
    assert.deepEqual(rig.minutes(), []);
  } finally { await rig.stop(); }
});

test('C4-13. local desktop streams and requests are never Remote minutes', async () => {
  const rig = await remoteRig({ profile: remoteQuota(100) });
  const controller = new AbortController();
  try {
    const token = fs.readFileSync(path.join(rig.dir, 'token'), 'utf8').trim();
    const response = await fetch(`http://127.0.0.1:${rig.daemon.port}/api/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.equal(await rig.local('/api/status'), 200);
    rig.advance(3 * MINUTE);
    rig.tick();
    assert.deepEqual(rig.minutes(), []);
    assert.equal(rig.hasTimer(), false);
  } finally {
    controller.abort();
    await rig.stop();
  }
});

test('C4-14. Mobile client, relay protocol and tunnel sources carry no commercial knowledge', () => {
  for (const file of [['control-plane', 'relay-client.ts'], ['control-plane', 'relay-frames.ts'], ['control-plane', 'remote-dispatch.ts'], ['public', 'pair.html']]) {
    assert.doesNotMatch(src(...file), /commercial|remoteMeter|entitlement|allowance/i, file.join('/'));
  }
  for (const file of fs.readdirSync(path.join(here, '..', 'relay')).filter((name) => name.endsWith('.ts'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(here, '..', 'relay', file), 'utf8'), /commercial|remoteMeter|allowance/i, `relay/${file}`);
  }
  // C9 renders the remote-allowance notice; the page still never decides access itself.
  assert.doesNotMatch(src('public', 'index.html'), /remoteMeter|chargeMinutes|\/api\/entitlement/, 'the Mobile UI holds no metering logic');
});

// ═════════════════════════════════════════════════════════════════════════════
// C6 — SIGNED ENTITLEMENT (FILE-BASED)
// ═════════════════════════════════════════════════════════════════════════════

const INSTALL = 'abcdefghijklmnopqrstuvwxyz';
const OTHER_INSTALL = 'zzzzzzzzzzzzzzzzzzzzzzzzzz';
function testKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const hex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return { hex, privateKey };
}
const K1 = testKey();
const K2 = testKey();
const T0 = at('2026-10-01T00:00:00Z');
const DAY = 86_400_000;

function license({ key = K1, keyId = 'k1', installId = INSTALL, grants, ...overrides } = {}) {
  const unsigned = {
    v: 1, licenseId: 'lic_test_001', installId, profileLabel: 'Test license',
    grants: grants ?? [{ grantId: 'lic-scout', capability: 'scout.play', allowance: { kind: 'quota', limit: 3, period: { kind: 'lifetime' } }, source: 'license' }],
    issuedAt: T0, refreshAfter: T0 + 7 * DAY, expiresAt: T0 + 30 * DAY, keyId, ...overrides
  };
  const sig = crypto.sign(null, canonicalEntitlementPayload(unsigned), key.privateKey).toString('base64url');
  return { ...unsigned, sig };
}

function licenseRig(document, { keys = { k1: K1.hex }, installId = INSTALL, text } = {}) {
  const dir = scratch('c6');
  const file = path.join(dir, LICENSE_FILE);
  if (text !== undefined) fs.writeFileSync(file, text);
  else if (document) fs.writeFileSync(file, JSON.stringify(document));
  let now = T0 + DAY;
  const source = new LicenseFileSource({ file, clockFile: path.join(dir, CLOCK_FILE), keys, installId: () => installId });
  const status = source.reload();
  const authority = new EntitlementAuthority({ license: source, now: () => now });
  return { dir, source, status, authority, set: (value) => { now = value; }, cleanup: () => rm(dir) };
}

test('C6-1. a valid signed license is in force: its grants replace the built-in profile', () => {
  const rig = licenseRig(license());
  try {
    assert.deepEqual(rig.status, { state: 'valid' });
    const snapshot = rig.authority.snapshot();
    assert.equal(snapshot.authority, 'signed-license');
    assert.equal(snapshot.validity, 'valid');
    assert.equal(snapshot.profileLabel, 'Test license');
    assert.equal(snapshot.capabilities['scout.play'].limit, 3);
    assert.equal(snapshot.capabilities['remote.access'].entitled, false, 'only licensed grants apply');
  } finally { rig.cleanup(); }
});

test('C6-2. invalid signatures, tampering, wrong install, unknown keys and malformed files never grant access', () => {
  const tampered = license();
  tampered.grants[0].allowance.limit = 9999;
  const cases = [
    ['signed by another key', license({ key: K2 }), 'bad-signature'],
    ['tampered payload', tampered, 'bad-signature'],
    ['tampered label', { ...license(), profileLabel: 'Free money' }, 'bad-signature'],
    ['wrong installId', license({ installId: OTHER_INSTALL }), 'install-mismatch'],
    ['unknown keyId', license({ keyId: 'k9' }), 'unknown-key'],
    ['extra field', { ...license(), bonus: true }, 'malformed'],
    ['unknown capability', license({ grants: [{ grantId: 'x', capability: 'teleport', allowance: { kind: 'unlimited' }, source: 'license' }] }), 'malformed'],
    ['refresh after expiry', license({ refreshAfter: T0 + 40 * DAY }), 'malformed']
  ];
  for (const [label, document, reason] of cases) {
    const rig = licenseRig(document);
    try {
      assert.deepEqual(rig.status, { state: 'invalid', reason }, label);
      const snapshot = rig.authority.snapshot();
      assert.equal(snapshot.authority, 'built-in', label);
      assert.equal(snapshot.validity, 'invalid-fallback', label);
      assert.equal(snapshot.profileLabel, 'Full access', `${label}: built-in unlimited still applies`);
      for (const id of CAPABILITY_IDS) assert.equal(snapshot.capabilities[id].unlimited, true, `${label}:${id}`);
    } finally { rig.cleanup(); }
  }
  for (const [label, text] of [['not json', '{nope'], ['empty', ''], ['array', '[]'], ['huge', 'x'.repeat(70 * 1024)]]) {
    const rig = licenseRig(undefined, { text });
    try {
      assert.equal(rig.status.state, 'invalid', label);
      assert.equal(rig.authority.snapshot().profileLabel, 'Full access', label);
    } finally { rig.cleanup(); }
  }
});

test('C6-3. a missing license is simply "none": built-in default, no files created', () => {
  const rig = licenseRig(undefined);
  try {
    assert.deepEqual(rig.status, { state: 'none' });
    const snapshot = rig.authority.snapshot();
    assert.deepEqual([snapshot.authority, snapshot.validity, snapshot.license.state], ['built-in', 'valid', 'none']);
    assert.deepEqual(fs.readdirSync(rig.dir), []);
  } finally { rig.cleanup(); }
});

test('C6-4. refresh-needed keeps grants in force; expiry falls back to the built-in default', () => {
  const rig = licenseRig(license());
  try {
    rig.set(T0 + 8 * DAY);
    let snapshot = rig.authority.snapshot();
    assert.deepEqual([snapshot.authority, snapshot.validity, snapshot.license.state], ['signed-license', 'grace', 'refresh-needed']);
    assert.equal(snapshot.capabilities['scout.play'].limit, 3);
    rig.set(T0 + 30 * DAY);
    snapshot = rig.authority.snapshot();
    assert.deepEqual([snapshot.authority, snapshot.validity, snapshot.license.state], ['built-in', 'expired-fallback', 'expired']);
    assert.equal(snapshot.profileLabel, 'Full access');
  } finally { rig.cleanup(); }
});

test('C6-5. keyId rotation: any pinned key verifies its own licenses; a keyId never borrows another key', () => {
  const keys = { k1: K1.hex, k2: K2.hex };
  assert.equal(verifySignedEntitlement(license({ key: K2, keyId: 'k2' }), { keys, installId: INSTALL }).ok, true);
  assert.equal(verifySignedEntitlement(license({ key: K1, keyId: 'k1' }), { keys, installId: INSTALL }).ok, true);
  assert.deepEqual(verifySignedEntitlement(license({ key: K2, keyId: 'k1' }), { keys, installId: INSTALL }), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(verifySignedEntitlement(license({ key: K2, keyId: 'k2' }), { keys: { k1: K1.hex }, installId: INSTALL }), { ok: false, reason: 'unknown-key' }, 'a retired key stops verifying');
  assert.deepEqual(verifySignedEntitlement(license(), { keys, installId: undefined }), { ok: false, reason: 'install-unavailable' });
  const first = verifySignedEntitlement(license(), { keys, installId: INSTALL });
  const document = license();
  assert.deepEqual(verifySignedEntitlement(document, { keys, installId: INSTALL }), verifySignedEntitlement(document, { keys, installId: INSTALL }), 'deterministic');
  assert.equal(first.ok, true);
  // Canonical bytes are independent of key order.
  const reordered = Object.fromEntries(Object.entries(document).reverse());
  assert.equal(verifySignedEntitlement(reordered, { keys, installId: INSTALL }).ok, true);
});

test('C6-6. clock rollback never extends a license and never locks anyone out', () => {
  const rig = licenseRig(license());
  try {
    // The clock reaches day 40 (past expiry) once, then is wound back to day 5.
    rig.set(T0 + 40 * DAY);
    assert.equal(rig.authority.snapshot().license.state, 'expired');
    const clock = JSON.parse(fs.readFileSync(path.join(rig.dir, CLOCK_FILE), 'utf8'));
    assert.equal(clock.highWater, T0 + 40 * DAY, 'high-water mark persisted');
    rig.set(T0 + 5 * DAY);
    let snapshot = rig.authority.snapshot();
    assert.equal(snapshot.license.state, 'expired', 'rollback cannot resurrect an expired license');
    assert.equal(snapshot.license.rollbackSuspected, true);
    assert.equal(snapshot.profileLabel, 'Full access', 'the built-in default still applies (no lockout)');

    // A reload (restart) reads the persisted mark: still expired.
    rig.source.reload();
    assert.equal(rig.authority.snapshot().license.state, 'expired');
  } finally { rig.cleanup(); }

  const within = licenseRig(license());
  try {
    within.set(T0 + 6 * DAY);
    within.authority.snapshot();
    within.set(T0 + 6 * DAY - CLOCK_ROLLBACK_TOLERANCE_MS + 60_000); // small skew: tolerated
    assert.equal(within.authority.snapshot().license.state, 'valid');
    within.set(T0 + 2 * DAY); // big rollback inside validity
    const snapshot = within.authority.snapshot();
    assert.deepEqual([snapshot.license.state, snapshot.validity, snapshot.license.rollbackSuspected], ['refresh-needed', 'grace', true]);
    assert.equal(snapshot.capabilities['scout.play'].limit, 3, 'grants stay in force: no lockout');
  } finally { within.cleanup(); }
});

test('C6-7. production pins no key: a license a test key signed is ignored and unlimited stays in force', async () => {
  assert.deepEqual(Object.keys(PINNED_ENTITLEMENT_KEYS), []);
  const dir = scratch('c6-daemon');
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 60_000 });
  try {
    await daemon.start();
    const installId = daemon.getInstallIdentity().installId;
    fs.mkdirSync(path.join(dir, 'entitlement'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'entitlement', LICENSE_FILE), JSON.stringify(license({ installId })));
    daemon.licenseSource.reload();
    const snapshot = daemon.getEntitlementSnapshot();
    assert.deepEqual([snapshot.authority, snapshot.validity, snapshot.license.state, snapshot.license.reason], ['built-in', 'invalid-fallback', 'invalid', 'unknown-key']);
    for (const id of CAPABILITY_IDS) assert.equal(snapshot.capabilities[id].unlimited, true, id);
  } finally { await daemon.stop(); rm(dir); }
});

test('C6-8. with a trusted key the daemon applies the license; status exposes only symbolic state', async () => {
  const dir = scratch('c6-trusted');
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 60_000, entitlements: { trustedKeys: { k1: K1.hex }, now: () => T0 + DAY } });
  try {
    await daemon.start();
    const installId = daemon.getInstallIdentity().installId;
    const document = license({ installId });
    fs.mkdirSync(path.join(dir, 'entitlement'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'entitlement', LICENSE_FILE), JSON.stringify(document));
    daemon.licenseSource.reload();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    const status = await (await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(status.entitlements.authority, 'signed-license');
    assert.equal(status.entitlements.capabilities['remote.access'].entitled, false);
    const text = JSON.stringify(status.entitlements);
    for (const secret of [document.licenseId, document.sig, document.keyId, installId, 'lic-scout']) assert.equal(text.includes(secret), false, secret);
    // The explicit Remote pairing choke point now follows the license, not a special case.
    const pairing = await fetch(`http://127.0.0.1:${daemon.port}/api/pairing/create`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
    assert.equal(pairing.status, 403);
  } finally { await daemon.stop(); rm(dir); }
});

test('C6-9. feature code never sees crypto or license structures; no private key material ships', () => {
  for (const file of [['commercial', 'gate.ts'], ['control-plane', 'router.ts'], ['commercial', 'remote-minute-meter.ts']]) {
    assert.doesNotMatch(src(...file), /from '\.\/license'|from '\.\.\/commercial\/license'|SignedEntitlement|verifySignedEntitlement/, file.join('/'));
  }
  for (const file of fs.readdirSync(path.join(here, '..', 'src', 'commercial'))) {
    const text = src('commercial', file);
    assert.doesNotMatch(text, /PRIVATE KEY|privateKey|generateKeyPair/, file);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// C7 — TELEMETRY OUTBOX
// ═════════════════════════════════════════════════════════════════════════════

const CONTEXT = { installId: INSTALL, appVersion: '0.1.0', platform: 'win32', now: () => at('2026-10-15T18:03:27Z') };
const good = (overrides = {}) => {
  const result = buildProductEvent({ name: 'scout.play_finished', surface: 'desktop', capability: 'scout.play', outcome: 'ok', durationSec: 184, counts: { receivers: 3 }, dims: { playerType: 'scout' }, ...overrides }, CONTEXT);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.event;
};

test('C7-1. valid events are built minute-rounded and duration-rounded, and validate', () => {
  const event = good();
  assert.equal(event.at, at('2026-10-15T18:03:00Z'));
  assert.equal(event.durationSec, 180);
  assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(validateProductEvent(event).ok, true);
});

test('C7-2. unknown fields, free-form strings and prohibited identifiers cannot enter the schema', () => {
  const base = good();
  const rejects = [
    ['unknown field', { ...base, prompt: 'Refactor the auth module' }],
    ['unknown field: path', { ...base, reportPath: 'REPORTS/Claude/S1.md' }],
    ['free text in name', { ...base, name: 'user typed something' }],
    ['path in playerType', { ...base, dims: { playerType: 'C:\\repos\\secret' } }],
    ['gameId as dimension', { ...base, dims: { gameId: 'game_git_abc123' } }],
    ['repo in dimension value', { ...base, dims: { taskClass: 'github.com/acme/secret' } }],
    ['command as outcome', { ...base, outcome: 'rm -rf /' }],
    ['hostPublicId as installId', { ...base, installId: 'abcdefghijklmnopqrst' }],
    ['deviceId as installId', { ...base, installId: '0123456789abcdef0123456789abcdef' }],
    ['email as appVersion', { ...base, appVersion: 'dad@example.com' }],
    ['prerelease tag', { ...base, appVersion: '1.2.3-my-branch' }],
    ['prompt hash as eventId', { ...base, eventId: crypto.createHash('sha256').update('prompt').digest('hex') }],
    ['report filename as capability', { ...base, capability: 'S57.2-Report.md' }],
    ['count with foreign key', { ...base, counts: { gameId: 3 } }],
    ['huge count', { ...base, counts: { receivers: 1e9 } }],
    ['fractional count', { ...base, counts: { receivers: 1.5 } }],
    ['nested object in dims', { ...base, dims: { playerType: { value: 'claude' } } }],
    ['array in dims', { ...base, dims: ['claude'] }],
    ['unrounded time', { ...base, at: base.at + 1_234 }],
    ['unrounded duration', { ...base, durationSec: 183 }],
    ['wrong version', { ...base, v: 2 }],
    ['class instance', Object.assign(new (class Event {})(), base)],
    ['string', 'scout.play_finished'],
    ['null', null]
  ];
  for (const [label, candidate] of rejects) assert.equal(validateProductEvent(candidate).ok, false, label);
  assert.equal(buildProductEvent({ name: 'play.dispatched', surface: 'desktop', dims: { playerType: 'Claude Opus on /home/dad' } }, CONTEXT).ok, false);
});

function outboxRig({ consent = 'on', ...options } = {}) {
  const dir = path.join(scratch('c7'), 'telemetry');
  let now = at('2026-10-15T18:10:00Z');
  const warnings = [];
  const outbox = new TelemetryOutbox({ dir, consent: () => consent, now: () => now, warn: (message) => warnings.push(message), ...options });
  return { dir, outbox, warnings, set: (value) => { now = value; }, cleanup: () => rm(path.dirname(dir)) };
}

test('C7-3. consent off (the default) writes nothing at all', async () => {
  assert.equal(DEFAULT_TELEMETRY_CONSENT, 'off');
  const rig = outboxRig({ consent: 'off' });
  try {
    assert.deepEqual(rig.outbox.emit(good()), { accepted: false, reason: 'consent-off' });
    await rig.outbox.whenIdle();
    assert.equal(fs.existsSync(rig.dir), false);
    assert.deepEqual(await rig.outbox.flush(), { attempted: 0, delivered: 0 });
  } finally { rig.cleanup(); }
});

test('C7-4. the emitter never throws into its caller, whatever it is handed or whatever the disk does', async () => {
  const rig = outboxRig();
  try {
    const hostile = { get name() { throw new Error('boom'); } };
    const circular = { ...good() }; circular.self = circular;
    for (const candidate of [hostile, circular, new Proxy({}, { ownKeys() { throw new Error('trap'); } }), undefined, 42]) {
      assert.doesNotThrow(() => rig.outbox.emit(candidate));
      assert.equal(rig.outbox.emit(candidate).accepted, false);
    }
    const throwingConsent = new TelemetryOutbox({ dir: rig.dir, consent: () => { throw new Error('prefs unavailable'); } });
    assert.deepEqual(throwingConsent.emit(good()), { accepted: false, reason: 'consent-off' }, 'a broken consent source means off');

    // Disk failure: the outbox directory path is occupied by a file.
    fs.mkdirSync(path.dirname(rig.dir), { recursive: true });
    fs.writeFileSync(rig.dir, 'not a directory');
    const blocked = new TelemetryOutbox({ dir: rig.dir, consent: () => 'on', warn: (message) => rig.warnings.push(message) });
    assert.equal(blocked.emit(good()).accepted, true, 'accepted in memory');
    await blocked.whenIdle();
    assert.ok(rig.warnings.some((message) => /write failed/.test(message)), 'failure is warned, never thrown');
  } finally { rig.cleanup(); }
});

test('C7-5. the outbox is bounded: drop-oldest by count and by bytes', async () => {
  const rig = outboxRig({ maxEvents: 5 });
  try {
    const events = Array.from({ length: 8 }, () => good());
    for (const event of events) assert.equal(rig.outbox.emit(event).accepted, true);
    await rig.outbox.whenIdle();
    assert.deepEqual(rig.outbox.pending().map((event) => event.eventId), events.slice(3).map((event) => event.eventId));
    const lines = fs.readFileSync(path.join(rig.dir, TELEMETRY_OUTBOX_FILE), 'utf8').trim().split('\n');
    assert.equal(lines.length, 5);
    assert.equal(rig.outbox.emit(events[7]).accepted, false, 'duplicate eventId');
  } finally { rig.cleanup(); }
  const bytes = outboxRig({ maxBytes: 1_500 });
  try {
    for (let index = 0; index < 20; index++) bytes.outbox.emit(good());
    await bytes.outbox.whenIdle();
    assert.ok(fs.statSync(path.join(bytes.dir, TELEMETRY_OUTBOX_FILE)).size <= 1_500);
    assert.ok(bytes.outbox.pending().length < 20);
  } finally { bytes.cleanup(); }
});

test('C7-6. stale events expire, and torn or malformed lines are skipped and cleaned', async () => {
  const rig = outboxRig();
  try {
    fs.mkdirSync(rig.dir, { recursive: true });
    const stale = good({ at: at('2026-10-01T00:00:00Z') });
    const fresh = good();
    fs.writeFileSync(path.join(rig.dir, TELEMETRY_OUTBOX_FILE), [
      JSON.stringify({ event: stale, attempts: 0 }),
      JSON.stringify({ event: fresh, attempts: 2, nextAttemptAt: 1 }),
      '{"event": {"v":1,"name":"torn',
      JSON.stringify({ event: { ...fresh, eventId: crypto.randomUUID(), prompt: 'leak' }, attempts: 0 }),
      'garbage'
    ].join('\n'));
    const reopened = new TelemetryOutbox({ dir: rig.dir, consent: () => 'on', now: () => at('2026-10-15T18:10:00Z') });
    assert.deepEqual(reopened.pending().map((event) => event.eventId), [fresh.eventId]);
    await reopened.whenIdle();
    const lines = fs.readFileSync(path.join(rig.dir, TELEMETRY_OUTBOX_FILE), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1, 'file rewritten with only the valid, fresh record');
  } finally { rig.cleanup(); }
});

test('C7-7. the NO-OP transport sends nothing; batches are deterministic and back off', async () => {
  const rig = outboxRig();
  try {
    const events = [good(), good()];
    for (const event of events) rig.outbox.emit(event);
    const result = await rig.outbox.flush();
    assert.equal(rig.outbox.transportKind, 'none');
    assert.equal(result.attempted, 2);
    assert.equal(result.delivered, 0);
    assert.equal(result.batchId, telemetryBatchId(events));
    assert.equal(telemetryBatchId(events), telemetryBatchId([...events]), 'deterministic');
    assert.equal(rig.outbox.pending().length, 2, 'undelivered events stay (bounded)');
    assert.deepEqual(await rig.outbox.flush(), { attempted: 0, delivered: 0 }, 'backoff: not retried immediately');
    assert.equal(await NOOP_TRANSPORT.send({ batchId: 'x', events: [] }), 'retry');
  } finally { rig.cleanup(); }
  for (const file of fs.readdirSync(path.join(here, '..', 'src', 'telemetry'))) {
    const text = src('telemetry', file);
    assert.doesNotMatch(text, /from 'node:(http|https|net|tls|dgram)'|require\('(http|https|net)'\)|\bfetch\(|WebSocket/, `${file}: no network code`);
  }
});

test('C7-8. the daemon ships telemetry off: no directory, product flows unaffected, preview is local Dev-only', async () => {
  const rig = await remoteRig();
  try {
    const phone = rig.phone();
    assert.equal((await rig.request(phone)).status, 200);
    assert.equal(await rig.local('/api/status'), 200);
    assert.equal(fs.existsSync(path.join(rig.dir, 'telemetry')), false, 'nothing written with consent off');
    assert.equal(await rig.local('/api/telemetry/preview'), 404, 'Dev Mode only');
    assert.equal((await rig.request(phone, '/api/telemetry/preview')).status, 403, 'never reachable from a phone');
  } finally { await rig.stop(); }
});

test('C7-9. analytics and entitlement are separate failure domains', async () => {
  const dir = scratch('c7-isolation');
  fs.writeFileSync(path.join(dir, 'telemetry'), 'blocked'); // telemetry cannot write at all
  const daemon = new ControlPlaneDaemon({ dir, port: port(), idleTimeoutMs: 60_000, telemetry: { consent: () => 'on' } });
  try {
    await daemon.start();
    const token = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
    assert.equal((await fetch(`http://127.0.0.1:${daemon.port}/api/status`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal(daemon.getEntitlementSnapshot().capabilities['remote.access'].unlimited, true);
    assert.equal(daemon.telemetryOutbox.emit(good({ at: Date.now() })).accepted, true);
    await daemon.telemetryOutbox.whenIdle();
  } finally { await daemon.stop(); rm(dir); }
  for (const file of fs.readdirSync(path.join(here, '..', 'src', 'telemetry'))) {
    assert.doesNotMatch(src('telemetry', file), /usage-store|authority|FeatureGate|license/, `${file} does not reach into entitlement`);
  }
  for (const file of fs.readdirSync(path.join(here, '..', 'src', 'commercial'))) {
    assert.doesNotMatch(src('commercial', file), /telemetry/i, `${file} does not reach into telemetry`);
  }
});
