import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { RemoteAdmission } from '../commercial/remote-minute-meter';
import type { StadiumSession } from './stadium-registry';
import { parseCookies } from './request-security';

/**
 * R13 S5 — daemon-owned RemotePreviewGateway (S57.45 §B2, §D5, §D6, §E, §F).
 *
 * Serves a running static Game to a paired phone from the dedicated `p-<host>-<gameTag>` origin.
 * The only forwarding target is `127.0.0.1:<port>` where the port came from the Game's own Stadium
 * (`game.preview.remoteTarget`); nothing in a browser request can choose a host, port or path
 * prefix. Every request is re-authorized against a memory-only, instance-bound grant. This class
 * never starts a Preview, never persists a secret, and never reads the device cookie.
 */

export const PREVIEW_COOKIE = '__Host-sl_pv';
export const PREVIEW_CAP = 'preview.v1';
export const STADIUM_REMOTE_PREVIEW_FEATURE = 'game.preview.remote.v1';
export const PREVIEW_INSTANCE_HEADER = 'x-sideline-preview-instance';
export const PREVIEW_ENTER_PATH = '/__sideline/preview/enter';
export const MAX_PREVIEW_ASSET_BYTES = 8 * 1024 * 1024;
export const PREVIEW_TICKET_TTL_MS = 60_000;
export const PREVIEW_GRANT_IDLE_MS = 30 * 60_000;
export const PREVIEW_GRANT_ABSOLUTE_MS = 8 * 60 * 60_000;
export const PREVIEW_GRANT_CAP = 32;
export const PREVIEW_TARGET_TTL_MS = 5_000;
const MAX_PATH_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 15_000;
const PASSTHROUGH_STATUSES = new Set([200, 400, 403, 404]);

export interface PreviewOrigin { hostPublicId: string; relayDomain: string }

/** S57.45 I plus S57.51 O3: retain distinct owner-observed refusal reasons. */
export type PreviewDenialCode = 'method' | 'service-worker' | 'no-grant' | 'grant-expired' | 'tag-mismatch'
  | 'device-revoked' | 'allowance' | 'game-unknown' | 'stadium-offline' | 'stadium-changed'
  | 'feature-missing' | 'static-stopped' | 'static-changed' | 'instance-mismatch'
  | 'too-large' | 'upstream-error' | 'ticket-invalid' | 'bad-ticket' | 'game-gone'
  | 'bad-path' | 'reserved' | 'target-error' | 'upstream-status' | 'upstream-timeout'
  | 'no-length' | 'grant-revoked' | 'upstream-incomplete';

export interface RemotePreviewDiagnostics {
  advertised: boolean;
  grants: Array<{ gameId: string; deviceTag: string; ageS: number; idleS: number;
    stadiumMatch: boolean; staticMatch: boolean | 'unknown' }>;
  counters: { entered: number; served: number; bytes: number; denied: Partial<Record<PreviewDenialCode, number>> };
  lastDenial?: { code: PreviewDenialCode; at: number };
}

export interface RemotePreviewDeps {
  /** Trusted relay identity; undefined when Remote Access is off. */
  origin(): PreviewOrigin | undefined;
  /** True while the tunnel is connected (used only for eligibility, never for revocation). */
  tunnelConnected(): boolean;
  /** Owner observation: Preview capability was included in hello on the live tunnel. */
  previewAdvertised?: () => boolean;
  deviceLive(deviceId: string): boolean;
  admission(): RemoteAdmission;
  touch(): void;
  knownGame(gameId: string): boolean;
  session(gameId: string): { status: string; session?: StadiumSession };
  rpc(session: StadiumSession, method: string, params: unknown): Promise<unknown>;
  now?: () => number;
  /** Test seam; production uses node:http against loopback. */
  httpRequest?: typeof http.request;
  /** Test seam; production retains the bounded loopback inactivity timeout. */
  upstreamTimeoutMs?: number;
}

export interface PreviewRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface PreviewResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown;
  write(chunk: unknown): boolean;
  end(chunk?: unknown): unknown;
  destroy(): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
}

interface Grant {
  grantId: string;
  secretHash?: string;
  deviceId: string;
  gameId: string;
  previewTag: string;
  stadiumInstanceId: string;
  staticInstanceId: string;
  createdAt: number;
  lastUsedAt: number;
}

interface Ticket { grantId: string; path: string; expiresAt: number }
interface Target { port: number; staticInstanceId: string; fetchedAt: number }

export type MintResult =
  | { ok: true; expiresAt: number; frameUrl: string; openUrl: string; pageUrl: (pagePath: string) => string }
  | { ok: false };

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32lower(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** S57.45 D2: an address, not a secret. Each Game gets its own browser origin. */
export function derivePreviewTag(hostPublicId: string, gameId: string): string {
  return base32lower(crypto.createHash('sha256').update(`sideline.preview.origin.v1\0${hostPublicId}\0${gameId}`).digest()).slice(0, 10);
}

/** Reduces a validated page path to a safe absolute path: every segment encoded, no dot segments, never protocol-relative. */
function safePagePath(raw: string): string {
  const segments = raw.replace(/\\/g, '/').split('/').filter((segment) => segment && segment !== '.' && segment !== '..');
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

type PathCheck = { kind: 'ok'; pathname: string } | { kind: 'bad' } | { kind: 'reserved' };

function checkPath(pathname: string): PathCheck {
  // Visible ASCII only (the relay path is already percent-encoded) and always origin-form: no scheme, no authority.
  if (pathname.length > MAX_PATH_LENGTH || !pathname.startsWith('/') || !/^[\x21-\x7e]+$/.test(pathname) || /%00/i.test(pathname)) return { kind: 'bad' };
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return { kind: 'bad' }; }
  if (decoded.includes('\0')) return { kind: 'bad' };
  const segments = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) return { kind: 'bad' };
  if (segments[0] !== undefined && segments[0].toLowerCase() === '__sideline') return { kind: 'reserved' };
  return { kind: 'ok', pathname };
}

const ENDED_MESSAGES: Record<number, string> = {
  401: 'This preview has ended. Go back to Sideline and tap Preview Work again.',
  403: 'Mobile Remote is not available right now. Go back to Sideline for details.',
  410: 'This preview has ended. Go back to Sideline and tap Preview Work again.',
  413: 'That file is too large to show on your phone.',
  502: 'The preview could not be reached. Go back to Sideline and tap Preview Work again.',
  503: 'The computer running this Game is offline. Try again when it is back.'
};

export class RemotePreviewGateway {
  private readonly grants = new Map<string, Grant>();
  private readonly bySecret = new Map<string, string>();
  private readonly byDeviceGame = new Map<string, string>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly targets = new Map<string, Target>();
  private readonly denials: Partial<Record<PreviewDenialCode, number>> = {};
  private readonly counters = { entered: 0, served: 0, bytes: 0 };
  private lastDenial: { code: PreviewDenialCode; at: number } | undefined;
  private readonly now: () => number;
  private readonly httpRequest: typeof http.request;
  private readonly inflight = new Set<() => void>();

  constructor(private readonly deps: RemotePreviewDeps) {
    this.now = deps.now ?? Date.now;
    this.httpRequest = deps.httpRequest ?? http.request;
  }

  get stats(): { grants: number; tickets: number; denials: Readonly<Record<string, number>>; inflight: number } {
    return { grants: this.grants.size, tickets: this.tickets.size, denials: { ...this.denials }, inflight: this.inflight.size };
  }

  /** Reported by this existing owner, process lifetime only. No purge, RPC, device read, or repair. */
  diagnosticsSnapshot(): RemotePreviewDiagnostics {
    const at = this.now();
    return {
      advertised: this.deps.previewAdvertised?.() === true,
      grants: [...this.grants.values()].slice(0, PREVIEW_GRANT_CAP).map((grant) => {
        const current = this.deps.session(grant.gameId);
        const target = this.targets.get(grant.stadiumInstanceId);
        return {
          gameId: grant.gameId,
          deviceTag: sha256(grant.deviceId).slice(0, 6),
          ageS: Math.max(0, Math.floor((at - grant.createdAt) / 1000)),
          idleS: Math.max(0, Math.floor((at - grant.lastUsedAt) / 1000)),
          stadiumMatch: current.status === 'connected' && current.session?.instanceId === grant.stadiumInstanceId,
          staticMatch: target ? target.staticInstanceId === grant.staticInstanceId : 'unknown'
        };
      }),
      counters: { ...this.counters, denied: { ...this.denials } },
      ...(this.lastDenial ? { lastDenial: { ...this.lastDenial } } : {})
    };
  }

  private recordDenial(code: PreviewDenialCode): void {
    this.denials[code] = (this.denials[code] ?? 0) + 1;
    this.lastDenial = { code, at: this.now() };
  }

  /** Cheap, synchronous and side-effect free: may this Game offer a remote Preview right now? */
  isAvailable(gameId: string): boolean {
    if (!this.deps.origin() || !this.deps.tunnelConnected()) return false;
    const auth = this.deps.session(gameId);
    return auth.status === 'connected' && !!auth.session?.features?.includes(STADIUM_REMOTE_PREVIEW_FEATURE);
  }

  revokeAll(): void {
    this.grants.clear();
    this.bySecret.clear();
    this.byDeviceGame.clear();
    this.tickets.clear();
    this.targets.clear();
    for (const abort of [...this.inflight]) abort();
  }

  /** Mints a grant plus single-use entry ticket. Never starts a Preview; asks the Stadium only for its current static target. */
  async mint(input: { deviceId: string; gameId: string; pagePath: string }): Promise<MintResult> {
    const origin = this.deps.origin();
    if (!origin || !this.deps.tunnelConnected() || !this.deps.deviceLive(input.deviceId)) return { ok: false };
    const auth = this.deps.session(input.gameId);
    const session = auth.session;
    if (auth.status !== 'connected' || !session || !session.features?.includes(STADIUM_REMOTE_PREVIEW_FEATURE)) return { ok: false };
    const target = await this.fetchTarget(session, input.gameId);
    if (!target) return { ok: false };
    // The session may have changed while the RPC was in flight.
    const again = this.deps.session(input.gameId);
    if (again.status !== 'connected' || again.session?.instanceId !== session.instanceId) return { ok: false };

    const at = this.now();
    this.purge(at);
    const previewTag = derivePreviewTag(origin.hostPublicId, input.gameId);
    this.revokeDeviceGame(input.deviceId, input.gameId);
    while (this.grants.size >= PREVIEW_GRANT_CAP) {
      const oldest = [...this.grants.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
      if (!oldest) break;
      this.dropGrant(oldest);
    }
    const grant: Grant = {
      grantId: crypto.randomBytes(16).toString('base64url'),
      deviceId: input.deviceId,
      gameId: input.gameId,
      previewTag,
      stadiumInstanceId: session.instanceId,
      staticInstanceId: target.staticInstanceId,
      createdAt: at,
      lastUsedAt: at
    };
    this.grants.set(grant.grantId, grant);
    this.byDeviceGame.set(`${grant.deviceId}\0${grant.gameId}`, grant.grantId);

    const path = safePagePath(input.pagePath);
    const rawTicket = crypto.randomBytes(32).toString('base64url');
    const expiresAt = at + PREVIEW_TICKET_TTL_MS;
    this.tickets.set(sha256(rawTicket), { grantId: grant.grantId, path, expiresAt });
    const base = `https://p-${origin.hostPublicId}-${previewTag}.${origin.relayDomain}`;
    return {
      ok: true,
      expiresAt,
      frameUrl: `${base}${PREVIEW_ENTER_PATH}?t=${rawTicket}`,
      openUrl: `${base}${path}`,
      pageUrl: (pagePath: string) => `${base}${safePagePath(pagePath)}`
    };
  }

  /** Entry point for every preview-surface request (called by the adapter, never by the daemon router). */
  async handle(req: PreviewRequestLike, res: PreviewResponseLike, ctx: { previewTag: string; cookie?: string }): Promise<void> {
    const method = String(req.method ?? 'GET').toUpperCase();
    const head = method === 'HEAD';
    if (method !== 'GET' && method !== 'HEAD') return this.deny(res, 405, head, 'method', { allow: 'GET, HEAD' });
    if (String(req.headers['service-worker'] ?? '').toLowerCase() === 'script') return this.deny(res, 403, head, 'service-worker');

    // Parsed by hand, never against a base URL: "//host/x" or "http://host/x" must not change what is forwarded.
    const [rawPath, ...rawRest] = String(req.url ?? '/').split('#', 1)[0].split('?');
    if (rawPath === PREVIEW_ENTER_PATH && method === 'GET') return this.enter(res, new URLSearchParams(rawRest.join('?')), ctx.previewTag);
    const checked = checkPath(rawPath);
    if (checked.kind !== 'ok') return this.deny(res, 404, head, checked.kind === 'bad' ? 'bad-path' : 'reserved', { plain: true });

    // F2 step 2-4: grant, tag, device.
    const secret = ctx.cookie ? parseCookies(ctx.cookie).get(PREVIEW_COOKIE) : undefined;
    const grantId = secret ? this.bySecret.get(sha256(secret)) : undefined;
    const grant = grantId ? this.grants.get(grantId) : undefined;
    if (!grant) return this.deny(res, 401, head, 'no-grant');
    const at = this.now();
    if (at - grant.lastUsedAt > PREVIEW_GRANT_IDLE_MS || at - grant.createdAt > PREVIEW_GRANT_ABSOLUTE_MS) {
      this.dropGrant(grant);
      return this.deny(res, 401, head, 'grant-expired');
    }
    if (ctx.previewTag !== grant.previewTag) return this.deny(res, 401, head, 'tag-mismatch');
    if (!this.deps.deviceLive(grant.deviceId)) {
      this.dropGrant(grant);
      return this.deny(res, 401, head, 'device-revoked');
    }
    // Step 5: commercial admission (grant kept when refused).
    const admission = this.deps.admission();
    if (admission.state === 'not-entitled' || admission.state === 'exhausted') return this.deny(res, 403, head, 'allowance');
    this.deps.touch();
    // Step 6: game and Stadium session.
    if (!this.deps.knownGame(grant.gameId)) {
      this.dropGrant(grant);
      return this.deny(res, 410, head, 'game-gone');
    }
    const auth = this.deps.session(grant.gameId);
    if (auth.status !== 'connected' || !auth.session) return this.deny(res, 503, head, 'stadium-offline');
    if (auth.session.instanceId !== grant.stadiumInstanceId || !auth.session.features?.includes(STADIUM_REMOTE_PREVIEW_FEATURE)) {
      this.dropGrant(grant);
      return this.deny(res, 410, head, 'stadium-changed');
    }
    // Step 7: authoritative target, bound to the static instance minted into the grant.
    const target = await this.cachedTarget(auth.session, grant.gameId);
    if (target === 'error') return this.deny(res, 502, head, 'target-error');
    if (!target || target.staticInstanceId !== grant.staticInstanceId) {
      this.targets.delete(grant.stadiumInstanceId);
      this.dropGrant(grant);
      return this.deny(res, 410, head, 'static-changed');
    }
    // A request that awaited the RPC may have lost its grant in the meantime.
    if (!this.grants.has(grant.grantId)) return this.deny(res, 410, head, 'grant-revoked');
    grant.lastUsedAt = this.now();
    await this.forward(res, head, grant, target, checked.pathname);
  }

  // --- enter ---------------------------------------------------------------------------------

  private enter(res: PreviewResponseLike, params: URLSearchParams, previewTag: string): void {
    const raw = params.get('t') ?? '';
    const key = raw && raw.length <= 128 ? sha256(raw) : '';
    const ticket = key ? this.tickets.get(key) : undefined;
    if (key) this.tickets.delete(key); // single use, even when it turns out to be unusable
    const at = this.now();
    const grant = ticket ? this.grants.get(ticket.grantId) : undefined;
    if (!ticket || !grant || ticket.expiresAt <= at || grant.previewTag !== previewTag || grant.secretHash
      || !this.deps.deviceLive(grant.deviceId)) {
      return this.deny(res, 401, false, 'bad-ticket');
    }
    const secret = crypto.randomBytes(32).toString('base64url');
    grant.secretHash = sha256(secret);
    grant.lastUsedAt = at;
    this.bySecret.set(grant.secretHash, grant.grantId);
    this.counters.entered++;
    res.writeHead(303, {
      ...this.fixedHeaders(),
      location: ticket.path,
      'content-length': '0',
      'set-cookie': `${PREVIEW_COOKIE}=${secret}; HttpOnly; Secure; SameSite=Lax; Path=/`
    });
    res.end();
  }

  // --- forwarding ------------------------------------------------------------------------------

  private forward(res: PreviewResponseLike, head: boolean, grant: Grant, target: Target, pathname: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      let headSent = false;
      let paused = false;
      let bytes = 0;
      let upstreamRes: http.IncomingMessage | undefined;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        this.inflight.delete(abort);
        resolve();
      };
      const abort = (): void => {
        if (settled) return;
        finish();
        upstream.destroy();
        upstreamRes?.destroy();
        if (headSent) res.destroy();
      };
      const fail = (status: number, reason: PreviewDenialCode): void => {
        if (settled) return;
        if (!headSent) this.deny(res, status, head, reason);
        else this.recordDenial(reason);
        abort();
      };
      const upstream = this.httpRequest({
        host: '127.0.0.1',
        port: target.port,
        method: head ? 'HEAD' : 'GET',
        path: pathname,
        agent: false,
        timeout: this.deps.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS,
        headers: { host: `127.0.0.1:${target.port}`, accept: '*/*', [PREVIEW_INSTANCE_HEADER]: grant.staticInstanceId }
      });
      this.inflight.add(abort);
      // The downstream (phone/relay/tunnel) went away: stop the upstream work immediately.
      res.on('close', abort);
      upstream.on('timeout', () => {
        if (paused || settled) return;
        this.targets.delete(grant.stadiumInstanceId);
        fail(502, 'upstream-timeout');
      });
      upstream.on('error', () => { this.targets.delete(grant.stadiumInstanceId); fail(502, 'upstream-error'); });
      upstream.on('response', (ures) => {
        upstreamRes = ures;
        if (settled) { ures.destroy(); return; }
        // Step 8: the server must prove it is the instance the grant was minted for, before any byte moves.
        if (ures.headers[PREVIEW_INSTANCE_HEADER] !== grant.staticInstanceId) {
          this.targets.delete(grant.stadiumInstanceId);
          ures.resume();
          return fail(502, 'instance-mismatch');
        }
        const status = ures.statusCode ?? 502;
        if (!PASSTHROUGH_STATUSES.has(status)) { ures.resume(); return fail(502, 'upstream-status'); }
        const lengthHeader = ures.headers['content-length'];
        const length = typeof lengthHeader === 'string' && /^\d{1,15}$/.test(lengthHeader) ? Number(lengthHeader) : undefined;
        if (length !== undefined && length > MAX_PREVIEW_ASSET_BYTES) { ures.resume(); return fail(413, 'too-large'); }
        if (length === undefined && status === 200 && !head) { ures.resume(); return fail(502, 'no-length'); }
        const contentType = typeof ures.headers['content-type'] === 'string'
          && /^[\w.+-]+\/[\w.+-]+(\s*;\s*charset=[\w-]+)?$/i.test(ures.headers['content-type'])
          ? ures.headers['content-type'] : 'application/octet-stream';
        headSent = true;
        res.writeHead(status, {
          ...this.fixedHeaders(),
          'content-type': contentType,
          ...(length !== undefined ? { 'content-length': String(length) } : {})
        });
        if (head) { ures.resume(); this.counters.served++; finish(); res.end(); return; }
        ures.on('data', (chunk: Buffer) => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > MAX_PREVIEW_ASSET_BYTES) return fail(413, 'too-large');
          this.counters.bytes += chunk.length;
          if (!res.write(chunk) && !paused) {
            paused = true;
            upstream.setTimeout(0);
            ures.pause();
            res.once('drain', () => {
              if (settled) return;
              paused = false;
              upstream.setTimeout(this.deps.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS);
              ures.resume();
            });
          }
        });
        ures.on('end', () => {
          if (settled) return;
          if (!ures.complete || (length !== undefined && bytes !== length)) return fail(502, 'upstream-incomplete');
          this.counters.served++;
          finish();
          res.end();
        });
        ures.on('error', () => fail(502, 'upstream-error'));
        ures.on('close', () => { if (!settled && !ures.complete) fail(502, 'upstream-incomplete'); });
      });
      upstream.end();
    });
  }

  // --- helpers ---------------------------------------------------------------------------------

  private async cachedTarget(session: StadiumSession, gameId: string): Promise<Target | undefined | 'error'> {
    const cached = this.targets.get(session.instanceId);
    if (cached && this.now() - cached.fetchedAt <= PREVIEW_TARGET_TTL_MS) return cached;
    try {
      return await this.fetchTarget(session, gameId);
    } catch {
      return 'error';
    }
  }

  private async fetchTarget(session: StadiumSession, gameId: string): Promise<Target | undefined> {
    let raw: any;
    try { raw = await this.deps.rpc(session, 'game.preview.remoteTarget', { gameId }); } catch (error) {
      this.targets.delete(session.instanceId);
      throw error;
    }
    if (!raw || raw.success !== true || raw.gameId !== gameId || raw.available !== true
      || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535
      || typeof raw.instanceId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(raw.instanceId)) {
      this.targets.delete(session.instanceId);
      return undefined;
    }
    const target: Target = { port: raw.port, staticInstanceId: raw.instanceId, fetchedAt: this.now() };
    this.targets.set(session.instanceId, target);
    return target;
  }

  private revokeDeviceGame(deviceId: string, gameId: string): void {
    const existing = this.byDeviceGame.get(`${deviceId}\0${gameId}`);
    const grant = existing ? this.grants.get(existing) : undefined;
    if (grant) this.dropGrant(grant);
  }

  private dropGrant(grant: Grant): void {
    this.grants.delete(grant.grantId);
    if (grant.secretHash) this.bySecret.delete(grant.secretHash);
    const key = `${grant.deviceId}\0${grant.gameId}`;
    if (this.byDeviceGame.get(key) === grant.grantId) this.byDeviceGame.delete(key);
    for (const [hash, ticket] of this.tickets) if (ticket.grantId === grant.grantId) this.tickets.delete(hash);
  }

  private purge(at: number): void {
    for (const [hash, ticket] of this.tickets) if (ticket.expiresAt <= at) this.tickets.delete(hash);
  }

  private fixedHeaders(): Record<string, string> {
    const origin = this.deps.origin();
    const ancestors = origin ? `'self' https://h-${origin.hostPublicId}.${origin.relayDomain}` : "'none'";
    return {
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': `frame-ancestors ${ancestors}`,
      'x-robots-tag': 'noindex, nofollow'
    };
  }

  private deny(res: PreviewResponseLike, status: number, head: boolean, reason: PreviewDenialCode, opts: { allow?: string; plain?: boolean } = {}): void {
    this.recordDenial(reason);
    const message = opts.plain ? (status === 405 ? 'Method Not Allowed' : 'Not found') : (ENDED_MESSAGES[status] ?? ENDED_MESSAGES[410]);
    const body = opts.plain || status === 405
      ? message
      : '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<meta name="robots" content="noindex, nofollow"><title>Preview ended</title>'
        + '<style>html,body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4f6f8;color:#14202b}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;text-align:center}'
        + '@media (prefers-color-scheme:dark){html,body{background:#0e141a;color:#e8eef4}}</style></head>'
        + `<body><p>${message}</p></body></html>`;
    const buf = Buffer.from(body, 'utf8');
    res.writeHead(status, {
      ...this.fixedHeaders(),
      'content-type': opts.plain || status === 405 ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'content-length': String(buf.length),
      ...(opts.allow ? { allow: opts.allow } : {})
    });
    if (head) res.end(); else res.end(buf);
  }
}
