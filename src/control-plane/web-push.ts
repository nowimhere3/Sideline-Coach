import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import type { AlarmPreferences } from '../running-players';
import type { AiAlarmEvent } from './alarm-engine';
import { sanitizeDeviceLabel } from './device-registry';

/**
 * Self-hosted Web Push delivery: a consumer of canonical AlarmEngine events, never an evaluator.
 *
 * Standards used as-is: VAPID (RFC 8292) authenticates this daemon to the browser's push service,
 * and aes128gcm message encryption (RFC 8291 / RFC 8188) keeps the payload opaque to that service.
 * The VAPID private key and every subscription live only under `<sidelineDir>/push`; the browser
 * receives the VAPID public key and nothing else.
 */

export const WEB_PUSH_DIR = 'push';
export const MAX_PUSH_SUBSCRIPTIONS = 20;
export const PUSH_ALARM_TITLE = 'Sideline Coach · AI Usage';
export const PUSH_TEST_TAG = 'sideline-push-test';
const PUSH_TTL_SECONDS = 6 * 60 * 60;
const MAX_BODY_CHARS = 180;
const MAX_ENDPOINT_LENGTH = 2048;
const TEST_COOLDOWN_MS = 3_000;
const DELIVERED_ID_LIMIT = 200;
const VAPID_SUBJECT = 'https://mysidelinecoach.com';
const RECORD_SIZE = 4096;

/**
 * Only the browser vendors' push services are valid destinations. A paired device supplies the
 * endpoint URL, so this allowlist is what keeps registration from becoming a daemon-side SSRF.
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/
];

export interface PushSubscriptionInput {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** `local` for the desktop admin session, `device:<id>` for a paired phone. Never a Game or Player. */
  owner: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailure?: string;
}

export interface PushPayload {
  readonly v: 1;
  readonly kind: 'alarm' | 'test';
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: '/';
}

export interface PushTransportRequest {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
  readonly body: Buffer;
}

/** Returns the push service's HTTP status; rejects only for network-level failure. */
export type PushTransport = (request: PushTransportRequest) => Promise<{ status: number }>;

export type PushSendOutcome = 'delivered' | 'removed' | 'failed';

export interface PushSendResult {
  readonly subscriptionId: string;
  readonly outcome: PushSendOutcome;
  readonly status?: number;
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url: the browser's `applicationServerKey`. */
  readonly publicKey: string;
  readonly privateKey: crypto.KeyObject;
}

// --- Validation -----------------------------------------------------------------------------

export function validatePushEndpoint(endpoint: unknown): string | undefined {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return undefined;
  let url: URL;
  try { url = new URL(endpoint); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return undefined;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(host)) ? url.toString() : undefined;
}

export function parsePushSubscription(value: unknown): PushSubscriptionInput | undefined {
  if (!isObject(value) || !isObject(value.keys)) return undefined;
  const endpoint = validatePushEndpoint(value.endpoint);
  const p256dh = decodeKey(value.keys.p256dh);
  const auth = decodeKey(value.keys.auth);
  if (!endpoint || !p256dh || !auth || p256dh.length !== 65 || p256dh[0] !== 0x04 || auth.length !== 16) return undefined;
  return { endpoint, keys: { p256dh: p256dh.toString('base64url'), auth: auth.toString('base64url') } };
}

function decodeKey(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length > 200) return undefined;
  return Buffer.from(value.replace(/=+$/, ''), 'base64url');
}

// --- RFC 8291 message encryption ---------------------------------------------------------------

export interface EncryptOptions {
  /** Test seam for the RFC 8291 Appendix A vector; production always uses fresh random values. */
  readonly salt?: Buffer;
  readonly serverPrivateKey?: Buffer;
}

export function encryptPushPayload(plaintext: Buffer, p256dh: string, auth: string, options: EncryptOptions = {}): Buffer {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const authSecret = Buffer.from(auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  if (options.serverPrivateKey) ecdh.setPrivateKey(options.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = options.salt ?? crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  // One record: plaintext followed by the 0x02 last-record delimiter and no padding.
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  if (record.length + 16 > RECORD_SIZE) throw new Error('Push payload is too large for one record.');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

/** HKDF-SHA256 with a single expand block (every length used here is <= 32). */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([0x01])])).digest().subarray(0, length);
}

// --- VAPID ------------------------------------------------------------------------------------

export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs: number): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT
  })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned, 'utf8'), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}

interface StoredVapid {
  version: 1;
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

/** Loads or creates the install's VAPID key pair. The private half never leaves this file and process. */
export function loadOrCreateVapidKeys(dir: string, warn: (message: string) => void = () => undefined): VapidKeys {
  const file = path.join(dir, 'vapid.json');
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredVapid>;
    if (stored.version === 1 && typeof stored.publicKey === 'string' && typeof stored.privateKey === 'string') {
      return vapidFromStored(stored.publicKey, stored.privateKey);
    }
    throw new Error('unexpected schema');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      warn(`Web Push key was unusable (${messageOf(error)}); a new key will be created and devices will re-register.`);
      quarantine(file);
    }
  }
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const stored: StoredVapid = {
    version: 1,
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    createdAt: Date.now()
  };
  writePrivateJson(file, stored);
  return vapidFromStored(stored.publicKey, stored.privateKey);
}

function vapidFromStored(publicKey: string, privateKey: string): VapidKeys {
  const point = Buffer.from(publicKey, 'base64url');
  const d = Buffer.from(privateKey, 'base64url');
  if (point.length !== 65 || point[0] !== 0x04 || d.length !== 32) throw new Error('invalid key material');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: d.toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
    format: 'jwk'
  });
  return { publicKey: point.toString('base64url'), privateKey: key };
}

// --- Transport --------------------------------------------------------------------------------

export const httpsPushTransport: PushTransport = (request) => new Promise((resolve, reject) => {
  const req = https.request(request.endpoint, {
    method: 'POST',
    headers: { ...request.headers, 'Content-Length': String(request.body.length) },
    timeout: 10_000
  }, (res) => {
    res.resume();
    res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
  });
  req.on('timeout', () => req.destroy(new Error('push service timed out')));
  req.on('error', reject);
  req.end(request.body);
});

// --- Notifier ---------------------------------------------------------------------------------

export interface WebPushNotifierOptions {
  /** `<sidelineDir>/push`. */
  readonly dir: string;
  readonly transport?: PushTransport;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}

/**
 * Device-scoped push delivery. Holds subscriptions, sends alarm and test pushes, and prunes
 * subscriptions a push service reports as gone. It reads alarm preferences only as channel
 * gates; LOW / CRITICAL / reset decisions arrive already made inside the AlarmEngine event.
 */
export class WebPushNotifier {
  private subscriptions: StoredPushSubscription[];
  private keys: VapidKeys | undefined;
  private readonly transport: PushTransport;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly file: string;
  private readonly deliveredEventIds = new Set<string>();
  private readonly lastTestAt = new Map<string, number>();

  constructor(private readonly options: WebPushNotifierOptions) {
    this.transport = options.transport ?? httpsPushTransport;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => undefined);
    this.file = path.join(options.dir, 'subscriptions.json');
    this.subscriptions = this.load();
  }

  /** The only VAPID material any browser ever receives. */
  publicKey(): string {
    return this.vapid().publicKey;
  }

  list(): readonly StoredPushSubscription[] {
    return this.subscriptions.map((entry) => ({ ...entry }));
  }

  register(input: PushSubscriptionInput, owner: string, label: unknown): StoredPushSubscription {
    const at = this.now();
    const id = subscriptionId(input.endpoint);
    const existing = this.subscriptions.find((entry) => entry.id === id);
    const record: StoredPushSubscription = {
      ...(existing ?? {}),
      id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      owner,
      label: sanitizeDeviceLabel(label, existing?.label ?? 'Browser'),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at
    };
    this.subscriptions = [...this.subscriptions.filter((entry) => entry.id !== id), record];
    if (this.subscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
      this.subscriptions = [...this.subscriptions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PUSH_SUBSCRIPTIONS);
    }
    this.persist();
    return { ...record };
  }

  unregister(endpoint: unknown): boolean {
    const valid = validatePushEndpoint(endpoint);
    if (!valid) return false;
    return this.removeWhere((entry) => entry.id === subscriptionId(valid));
  }

  /** A revoked paired device loses its push subscriptions with its credential. */
  removeOwner(owner: string | ((owner: string) => boolean)): number {
    const matches = typeof owner === 'string' ? (candidate: string) => candidate === owner : owner;
    const before = this.subscriptions.length;
    this.removeWhere((entry) => matches(entry.owner));
    return before - this.subscriptions.length;
  }

  isRegistered(endpoint: unknown): boolean {
    const valid = validatePushEndpoint(endpoint);
    return Boolean(valid && this.subscriptions.some((entry) => entry.id === subscriptionId(valid)));
  }

  /** Channel gates only: `enabled`, `channels.browser`, and the class switch the event belongs to. */
  static alarmAllowed(event: AiAlarmEvent, preferences: AlarmPreferences): boolean {
    if (!preferences.enabled || !preferences.channels.browser) return false;
    return event.type === 'alarm:reset_boundary_reached' ? preferences.notifyOnReset : preferences.notifyOnThreshold;
  }

  static alarmPayload(event: AiAlarmEvent): PushPayload {
    return {
      v: 1,
      kind: 'alarm',
      title: PUSH_ALARM_TITLE,
      body: bounded(event.message),
      tag: `sideline-ai-alarm-${event.id}`,
      url: '/'
    };
  }

  /** One push per registered device per canonical alarm event id. */
  async deliverAlarm(event: AiAlarmEvent, preferences: AlarmPreferences): Promise<PushSendResult[]> {
    if (!WebPushNotifier.alarmAllowed(event, preferences) || this.subscriptions.length === 0) return [];
    if (this.deliveredEventIds.has(event.id)) return [];
    this.deliveredEventIds.add(event.id);
    if (this.deliveredEventIds.size > DELIVERED_ID_LIMIT) {
      this.deliveredEventIds.delete(this.deliveredEventIds.values().next().value as string);
    }
    const payload = WebPushNotifier.alarmPayload(event);
    const results = await Promise.all(this.subscriptions.map((entry) => this.send(entry, payload, event.id)));
    this.persist();
    const delivered = results.filter((result) => result.outcome === 'delivered').length;
    this.log(`AI alarm push: ${delivered}/${results.length} device(s) accepted.`);
    return results;
  }

  async sendTest(endpoint: unknown): Promise<{ ok: boolean; status?: number; message: string }> {
    const valid = validatePushEndpoint(endpoint);
    const entry = valid ? this.subscriptions.find((candidate) => candidate.id === subscriptionId(valid)) : undefined;
    if (!entry) return { ok: false, message: 'This device is not registered for notifications yet.' };
    const at = this.now();
    const last = this.lastTestAt.get(entry.id);
    if (last !== undefined && at - last < TEST_COOLDOWN_MS) return { ok: false, message: 'A test was just sent. Wait a moment and try again.' };
    this.lastTestAt.set(entry.id, at);
    const result = await this.send(entry, {
      v: 1,
      kind: 'test',
      title: 'Sideline Coach',
      body: 'Test notification: Sideline can reach this device.',
      tag: PUSH_TEST_TAG,
      url: '/'
    }, `test-${at}`);
    this.persist();
    if (result.outcome === 'delivered') return { ok: true, status: result.status, message: 'Test sent. Check this device\'s notification tray.' };
    if (result.outcome === 'removed') return { ok: false, status: result.status, message: 'The browser\'s push service no longer recognizes this device. Turn Browser Notifications off and on again.' };
    return { ok: false, ...(result.status !== undefined ? { status: result.status } : {}), message: 'The push service did not accept the test. Check the computer\'s internet connection and try again.' };
  }

  private async send(entry: StoredPushSubscription, payload: PushPayload, topicSource: string): Promise<PushSendResult> {
    const at = this.now();
    let body: Buffer;
    let authorization: string;
    try {
      body = encryptPushPayload(Buffer.from(JSON.stringify(payload), 'utf8'), entry.p256dh, entry.auth);
      authorization = vapidAuthorization(entry.endpoint, this.vapid(), at);
    } catch (error) {
      // An undecodable browser key can never succeed: drop it so the device re-registers cleanly.
      this.log(`Push subscription ${entry.id} removed: ${messageOf(error)}`);
      this.removeWhere((candidate) => candidate.id === entry.id);
      return { subscriptionId: entry.id, outcome: 'removed' };
    }
    try {
      const { status } = await this.transport({
        endpoint: entry.endpoint,
        headers: {
          Authorization: authorization,
          TTL: String(PUSH_TTL_SECONDS),
          Urgency: 'high',
          Topic: pushTopic(topicSource),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream'
        },
        body
      });
      if (status >= 200 && status < 300) {
        entry.lastSuccessAt = at;
        delete entry.lastFailure;
        return { subscriptionId: entry.id, outcome: 'delivered', status };
      }
      // 404/410: the subscription is gone. 403: it belongs to a different VAPID key. All permanent.
      if (status === 404 || status === 410 || status === 403) {
        this.log(`Push subscription ${entry.id} removed after push service status ${status}.`);
        this.removeWhere((candidate) => candidate.id === entry.id);
        return { subscriptionId: entry.id, outcome: 'removed', status };
      }
      entry.lastFailureAt = at;
      entry.lastFailure = `status ${status}`;
      return { subscriptionId: entry.id, outcome: 'failed', status };
    } catch (error) {
      entry.lastFailureAt = at;
      entry.lastFailure = 'network';
      this.log(`Push to subscription ${entry.id} failed: ${messageOf(error)}`);
      return { subscriptionId: entry.id, outcome: 'failed' };
    }
  }

  private vapid(): VapidKeys {
    this.keys ??= loadOrCreateVapidKeys(this.options.dir, this.log);
    return this.keys;
  }

  private removeWhere(predicate: (entry: StoredPushSubscription) => boolean): boolean {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((entry) => !predicate(entry));
    if (this.subscriptions.length === before) return false;
    this.persist();
    return true;
  }

  private load(): StoredPushSubscription[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { version?: unknown; subscriptions?: unknown };
      if (parsed.version !== 1 || !Array.isArray(parsed.subscriptions)) return [];
      return parsed.subscriptions.flatMap((raw): StoredPushSubscription[] => {
        if (!isObject(raw) || typeof raw.owner !== 'string' || typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') return [];
        const input = parsePushSubscription({ endpoint: raw.endpoint, keys: { p256dh: raw.p256dh, auth: raw.auth } });
        if (!input) return [];
        return [{
          id: subscriptionId(input.endpoint),
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          owner: raw.owner,
          label: sanitizeDeviceLabel(raw.label, 'Browser'),
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          ...(typeof raw.lastSuccessAt === 'number' ? { lastSuccessAt: raw.lastSuccessAt } : {}),
          ...(typeof raw.lastFailureAt === 'number' ? { lastFailureAt: raw.lastFailureAt } : {}),
          ...(typeof raw.lastFailure === 'string' ? { lastFailure: raw.lastFailure.slice(0, 40) } : {})
        }];
      }).slice(0, MAX_PUSH_SUBSCRIPTIONS);
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      writePrivateJson(this.file, { version: 1, subscriptions: this.subscriptions });
    } catch (error) {
      this.log(`Push subscriptions could not be saved: ${messageOf(error)}`);
    }
  }
}

function subscriptionId(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

/** The push service collapses queued messages that share a Topic (<= 32 base64url chars). */
function pushTopic(source: string): string {
  return crypto.createHash('sha256').update(source).digest('base64url').slice(0, 32);
}

function bounded(text: string): string {
  const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return clean.length > MAX_BODY_CHARS ? `${clean.slice(0, MAX_BODY_CHARS - 1)}…` : clean;
}

/** Same pattern as the paired-device registry: 0700 directory, 0600 temp file, atomic rename. */
function writePrivateJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* renamed or already gone */ }
  }
}

function quarantine(file: string): void {
  try { fs.renameSync(file, `${file}.${Date.now()}.bak`); } catch { /* best effort */ }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
