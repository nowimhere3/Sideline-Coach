/**
 * Local / test reference relay for Remote Access v1. Everything lives in memory: verified host
 * sockets, in-flight browser requests and pending challenges. It never validates `sl_dev`,
 * never persists anything, and logs metadata only.
 */
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { deriveHostPublicId } from '../src/control-plane/host-identity';
import type { HostHelloFrame, HostToRelayFrame, RelayReqFrame, RelayToHostFrame } from '../src/control-plane/relay-frames';

export const TUNNEL_PATH = '/tunnel/v1';
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
export const CHALLENGE_TTL_MS = 30_000;
export const PING_INTERVAL_MS = 20_000;
/** Bounded unflushed bytes per browser response; a stalled browser is cut off beyond this. */
export const MAX_RESPONSE_QUEUE_BYTES = 1024 * 1024;
export const ENROLLMENT_HEADER = 'x-sideline-enrollment';

/** In-memory beta limits (per client identity). The engine applies them only when `rateLimits` is supplied. */
export interface RateLimits {
  windowMs: number;
  handshakePerWindow: number;
  /** Consecutive invalid enrollment/handshake failures before a temporary block. */
  invalidBeforeBan: number;
  banMs: number;
  httpPerWindow: number;
  pairingPerWindow: number;
}
export const DEFAULT_RATE_LIMITS: RateLimits = {
  windowMs: 60_000,
  handshakePerWindow: 10,
  invalidBeforeBan: 5,
  banMs: 15 * 60_000,
  httpPerWindow: 120,
  pairingPerWindow: 10
};

/** Lifecycle / abuse events. Metadata only; the client identity is a short hash, never an address. */
export interface RelayEvent {
  ts: number;
  event: 'connect' | 'disconnect' | 'rate_limit' | 'enrollment_rejected' | 'handshake_failed' | 'shutdown';
  hostPublicId?: string;
  scope?: string;
  client?: string;
  code?: number;
  phase?: string;
}
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'cookie', 'origin', 'x-sideline-action', 'last-event-id', 'user-agent']);

/** Metadata only: never bodies, cookies, query strings, fragments or credentials. */
export interface RelayLogEntry {
  ts: number;
  hostPublicId: string;
  method: string;
  path: string;
  status: number;
  bytes: number;
  durationMs: number;
}

export interface ReferenceRelayOptions {
  /** Browser origins are `h-<hostPublicId>.<relayDomain>`; tests use `localhost`. */
  relayDomain: string;
  challengeTtlMs?: number;
  /** When set, host tunnel upgrades must present `x-sideline-enrollment: <key>`; unset disables the gate. */
  enrollmentKey?: string;
  /** Supplying this enables limiting (production entrypoint passes DEFAULT_RATE_LIMITS). */
  rateLimits?: Partial<RateLimits>;
  /**
   * Client identity for limiting is the socket peer address. Only with `trustProxy: true` is the
   * rightmost X-Forwarded-For entry (appended by the trusted edge) used instead.
   */
  trustProxy?: boolean;
  /**
   * Where limiter identity comes from. `socket` (default): the socket peer. `fly`: ONLY the validated
   * `Fly-Client-IP` header set by the Fly edge; missing/invalid falls back to the socket peer. Neither
   * X-Forwarded-For nor Fly-Client-IP is ever forwarded to a host or logged raw.
   */
  clientIpSource?: 'socket' | 'fly';
  /** Injectable clock for the limiter. */
  now?: () => number;
  onEvent?: (event: RelayEvent) => void;
  /** Heartbeat interval (default 20 s). A verified host with no pong for two intervals is closed 4008. */
  pingIntervalMs?: number;
  maxResponseQueueBytes?: number;
  log?: (entry: RelayLogEntry) => void;
}

interface Inflight {
  hostPublicId: string;
  ws: WebSocket;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  started: number;
  bytes: number;
  headSent: boolean;
  status: number;
}

const OFFLINE_JSON = '{"code":"host_offline","message":"Desktop host is offline"}';
const OFFLINE_HTML = '<!DOCTYPE html><html><head><title>Desktop Offline - Sideline Coach</title></head><body><h1>Desktop Offline</h1><p>The host machine is currently disconnected.</p></body></html>';

export class ReferenceRelay {
  private readonly server: http.Server;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly hosts = new Map<string, WebSocket>();
  private readonly pending = new Map<WebSocket, { nonce: string; expiresAt: number }>();
  private readonly inflight = new Map<string, Inflight>();
  private readonly hostPattern: RegExp;
  private readonly ttl: number;
  /** Host tunnel sockets accepted since start (observability for tests). */
  connectionCount = 0;
  private readonly lastPongAt = new Map<WebSocket, number>();
  private readonly pingIntervalMs: number;
  private readonly maxResponseQueue: number;
  private pingTimer: NodeJS.Timeout | undefined;
  private readonly startedAt = Date.now();
  private readonly limits: RateLimits | undefined;
  private readonly hits = new Map<string, number[]>();
  private readonly failures = new Map<string, number>();
  private readonly bans = new Map<string, number>();
  private readonly socketClient = new Map<WebSocket, string>();
  private draining = false;

  constructor(private readonly options: ReferenceRelayOptions) {
    this.ttl = options.challengeTtlMs ?? CHALLENGE_TTL_MS;
    this.limits = options.rateLimits ? { ...DEFAULT_RATE_LIMITS, ...options.rateLimits } : undefined;
    this.pingIntervalMs = options.pingIntervalMs ?? PING_INTERVAL_MS;
    this.maxResponseQueue = options.maxResponseQueueBytes ?? MAX_RESPONSE_QUEUE_BYTES;
    const domain = options.relayDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.hostPattern = new RegExp(`^h-([a-z2-7]{20})\\.${domain}(?::\\d+)?$`);
    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url ?? '/', 'http://relay.invalid').pathname;
      const reject = (status: string, extra = ''): void => {
        socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n${extra}\r\n`);
        socket.destroy();
      };
      if (pathname !== TUNNEL_PATH) return reject('404 Not Found');
      if (this.draining) return reject('503 Service Unavailable');
      // Everything below runs BEFORE any challenge exists: a refused upgrade creates no handshake state.
      const ip = this.clientIp(req);
      if (this.limits) {
        if (this.isBanned(ip)) return this.limited(reject, 'ban', ip, this.bans.get(ip));
        if (!this.allow('handshake', ip, this.limits.handshakePerWindow)) return this.limited(reject, 'handshake', ip);
      }
      if (!this.enrollmentOk(req.headers[ENROLLMENT_HEADER])) {
        this.recordFailure(ip);
        this.emit({ event: 'enrollment_rejected', client: this.clientKey(ip), code: 403 });
        return reject('403 Forbidden');
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onHostSocket(ws, ip));
    });
  }

  listen(port = 0, host = '127.0.0.1'): Promise<number> {
    this.pingTimer = setInterval(() => this.heartbeat(), this.pingIntervalMs);
    this.pingTimer.unref?.();
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => resolve((this.server.address() as AddressInfo).port));
    });
  }

  // ------------------------------------------------------- abuse controls

  private clock(): number {
    return this.options.now?.() ?? Date.now();
  }

  private emit(event: Omit<RelayEvent, 'ts'>): void {
    this.options.onEvent?.({ ts: Date.now(), ...event });
  }

  private clientKey(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
  }

  private clientIp(req: http.IncomingMessage): string {
    let ip = (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
    if (this.options.clientIpSource === 'fly') {
      const header = req.headers['fly-client-ip'];
      const candidate = typeof header === 'string' ? header.trim() : '';
      return isIP(candidate) ? candidate.replace(/^::ffff:/, '') : ip;
    }
    if (this.options.trustProxy) {
      const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((part) => part.trim()).filter(Boolean).pop();
      if (forwarded) ip = forwarded;
    }
    return ip;
  }

  private enrollmentOk(header: string | string[] | undefined): boolean {
    const key = this.options.enrollmentKey;
    if (!key) return true;
    if (typeof header !== 'string') return false;
    const digest = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();
    return crypto.timingSafeEqual(digest(header), digest(key));
  }

  private isBanned(ip: string): boolean {
    const until = this.bans.get(ip);
    if (until === undefined) return false;
    if (this.clock() >= until) {
      this.bans.delete(ip);
      return false;
    }
    return true;
  }

  /** Sliding window: true if this hit is within `limit` per window, and records it. */
  private allow(scope: string, ip: string, limit: number): boolean {
    if (!this.limits) return true;
    const now = this.clock();
    const key = `${scope}|${ip}`;
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.limits!.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private limited(reject: (status: string, extra?: string) => void, scope: string, ip: string, until?: number): void {
    const seconds = Math.max(1, Math.ceil(((until ?? this.clock() + (this.limits?.windowMs ?? 60_000)) - this.clock()) / 1000));
    this.emit({ event: 'rate_limit', scope, client: this.clientKey(ip), code: 429 });
    reject('429 Too Many Requests', `Retry-After: ${seconds}\r\n`);
  }

  private recordFailure(ip: string): void {
    if (!this.limits) return;
    const count = (this.failures.get(ip) ?? 0) + 1;
    if (count >= this.limits.invalidBeforeBan) {
      this.failures.delete(ip);
      this.bans.set(ip, this.clock() + this.limits.banMs);
      this.emit({ event: 'rate_limit', scope: 'ban_started', client: this.clientKey(ip) });
    } else {
      this.failures.set(ip, count);
    }
  }

  private sweepLimiter(): void {
    if (!this.limits) return;
    const now = this.clock();
    for (const [key, list] of this.hits) {
      const recent = list.filter((at) => now - at < this.limits!.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
    for (const [ip, until] of this.bans) if (now >= until) this.bans.delete(ip);
  }

  /** Heartbeat covers VERIFIED hosts only; unverified sockets are never pinged. */
  private heartbeat(): void {
    this.sweepLimiter();
    const now = Date.now();
    for (const ws of this.hosts.values()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (now - (this.lastPongAt.get(ws) ?? now) >= this.pingIntervalMs * 2) {
        ws.close(4008, 'Heartbeat timeout');
        setTimeout(() => ws.terminate(), 1000).unref?.();
        continue;
      }
      this.send(ws, { t: 'ping', ts: now });
    }
  }

  async close(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    for (const ws of this.wss.clients) ws.terminate();
    for (const id of [...this.inflight.keys()]) this.abortInflight(id);
    this.hosts.clear();
    this.pending.clear();
    this.lastPongAt.clear();
    this.socketClient.clear();
    this.hits.clear();
    this.failures.clear();
    this.bans.clear();
    await new Promise<void>((resolve) => { this.wss.close(() => resolve()); });
    this.server.closeAllConnections?.();
    await new Promise<void>((resolve) => { this.server.close(() => resolve()); });
  }

  isHostConnected(hostPublicId: string): boolean {
    return this.hosts.has(hostPublicId);
  }

  // ------------------------------------------------------------ host tunnel

  private send(ws: WebSocket, frame: RelayToHostFrame): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  }

  private onHostSocket(ws: WebSocket, ip: string): void {
    this.connectionCount += 1;
    this.socketClient.set(ws, ip);
    const nonce = crypto.randomBytes(32).toString('base64url');
    this.pending.set(ws, { nonce, expiresAt: Date.now() + this.ttl });
    this.send(ws, { t: 'challenge', nonce });
    ws.on('message', (data) => this.onHostMessage(ws, data.toString()));
    ws.on('close', () => this.onHostGone(ws));
    ws.on('error', () => this.onHostGone(ws));
  }

  private onHostGone(ws: WebSocket): void {
    this.pending.delete(ws);
    this.lastPongAt.delete(ws);
    this.socketClient.delete(ws);
    for (const [id, host] of this.hosts) {
      if (host !== ws) continue;
      this.hosts.delete(id);
      this.emit({ event: 'disconnect', hostPublicId: id });
    }
    for (const [id, entry] of [...this.inflight]) if (entry.ws === ws) this.abortInflight(id);
  }

  private onHostMessage(ws: WebSocket, raw: string): void {
    let frame: HostToRelayFrame;
    try {
      frame = JSON.parse(raw) as HostToRelayFrame;
    } catch {
      ws.close(1002, 'Protocol error');
      return;
    }
    if (!frame || typeof frame !== 'object' || typeof frame.t !== 'string') {
      ws.close(1002, 'Protocol error');
      return;
    }
    if (frame.t === 'hello') {
      this.onHello(ws, frame);
      return;
    }
    if (![...this.hosts.values()].includes(ws)) {
      ws.close(4401, 'Handshake required');
      return;
    }
    switch (frame.t) {
      case 'pong':
        if (typeof frame.ts === 'number') this.lastPongAt.set(ws, Date.now());
        return;
      case 'head': case 'data': case 'end': case 'error':
        if (typeof frame.id !== 'string') {
          ws.close(1002, 'Protocol error');
          return;
        }
        this.onResponseFrame(ws, frame);
        return;
      default:
        ws.close(1002, 'Protocol error');
    }
  }

  private onHello(ws: WebSocket, hello: HostHelloFrame): void {
    const challenge = this.pending.get(ws);
    this.pending.delete(ws); // single use: consumed by the first hello attempt, valid or not
    const fail = (code: number, reason: string): void => {
      const ip = this.socketClient.get(ws);
      if (ip) this.recordFailure(ip);
      this.emit({ event: 'handshake_failed', code, ...(ip ? { client: this.clientKey(ip) } : {}) });
      ws.close(code, reason);
    };
    if (!challenge || Date.now() > challenge.expiresAt) {
      fail(4401, 'Challenge missing or expired');
      return;
    }
    if (hello.v !== 1 || typeof hello.hostPublicId !== 'string' || typeof hello.publicKey !== 'string' || typeof hello.sig !== 'string' || !/^[0-9a-f]{64}$/.test(hello.publicKey)) {
      fail(4403, 'Invalid hello');
      return;
    }
    const rawKey = Buffer.from(hello.publicKey, 'hex');
    if (deriveHostPublicId(rawKey) !== hello.hostPublicId) {
      fail(4403, 'Host identity mismatch');
      return;
    }
    let valid = false;
    try {
      const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') }, format: 'jwk' });
      valid = crypto.verify(null, Buffer.from(challenge.nonce, 'base64url'), key, Buffer.from(hello.sig, 'base64url'));
    } catch {
      valid = false;
    }
    if (!valid) {
      fail(4403, 'Invalid signature');
      return;
    }
    const previous = this.hosts.get(hello.hostPublicId);
    this.hosts.set(hello.hostPublicId, ws);
    this.lastPongAt.set(ws, Date.now());
    const okIp = this.socketClient.get(ws);
    if (okIp) this.failures.delete(okIp);
    this.emit({ event: 'connect', hostPublicId: hello.hostPublicId });
    if (previous && previous !== ws) {
      this.send(previous, { t: 'goaway', reason: 'superseded' });
      for (const [id, entry] of [...this.inflight]) if (entry.ws === previous) this.abortInflight(id);
      previous.close(4000, 'Superseded');
    }
  }

  private onResponseFrame(ws: WebSocket, frame: Extract<HostToRelayFrame, { t: 'head' | 'data' | 'end' | 'error' }>): void {
    const entry = this.inflight.get(frame.id);
    // A host may only answer requests that were sent to it.
    if (!entry || entry.ws !== ws) return;
    const { res } = entry;
    switch (frame.t) {
      case 'head': {
        if (entry.headSent || !Number.isInteger(frame.status) || frame.status < 200 || frame.status > 599) return;
        entry.headSent = true;
        entry.status = frame.status;
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(frame.headers ?? {})) if (typeof value === 'string') headers[name.toLowerCase()] = value;
        res.writeHead(frame.status, headers);
        res.flushHeaders();
        return;
      }
      case 'data': {
        if (!entry.headSent) return;
        const chunk = frame.chunkB64 !== undefined ? Buffer.from(frame.chunkB64, 'base64') : Buffer.from(frame.chunk ?? '', 'utf8');
        entry.bytes += chunk.length;
        res.write(chunk);
        if (res.writableLength > this.maxResponseQueue) {
          // Slow browser: cut only this response and tell the host to stop producing it.
          this.inflight.delete(frame.id);
          this.send(ws, { t: 'cancel', id: frame.id });
          this.log(entry);
          res.destroy();
        }
        return;
      }
      case 'end':
        this.complete(frame.id, () => {
          if (!entry.headSent) {
            entry.status = 502;
            res.writeHead(502);
          }
          res.end();
        });
        return;
      case 'error':
        this.complete(frame.id, () => {
          if (entry.headSent) {
            res.destroy();
            return;
          }
          entry.status = 502;
          res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ code: String(frame.code).slice(0, 64) }));
        });
    }
  }

  private complete(id: string, finish: () => void): void {
    const entry = this.inflight.get(id);
    if (!entry) return;
    this.inflight.delete(id);
    finish();
    this.log(entry);
  }

  /** Host vanished / was superseded: unanswered requests get the offline contract, streams are cut. */
  private abortInflight(id: string): void {
    const entry = this.inflight.get(id);
    if (!entry) return;
    this.complete(id, () => {
      if (entry.headSent) {
        entry.res.destroy();
        return;
      }
      entry.status = 503;
      this.sendOffline(entry.res, entry.pathname);
    });
  }

  private log(entry: Inflight): void {
    this.options.log?.({ ts: Date.now(), hostPublicId: entry.hostPublicId, method: entry.method, path: entry.pathname, status: entry.status, bytes: entry.bytes, durationMs: Date.now() - entry.started });
  }

  // ---------------------------------------------------------- browser HTTP

  /** Public liveness only: no host ids, counts, memory or configuration. */
  private sendHealth(res: http.ServerResponse, method: string): void {
    if (method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json', 'cache-control': 'no-store', allow: 'GET' });
      res.end('{"status":"method_not_allowed"}');
      return;
    }
    res.writeHead(this.draining ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(this.draining ? '{"status":"draining"}' : JSON.stringify({ status: 'ok', uptime: Math.floor((Date.now() - this.startedAt) / 1000) }));
  }

  /**
   * Graceful drain: refuse new work, tell verified hosts `goaway: shutdown`, give in-flight requests up
   * to `drainMs` (max 5 s) to finish, then close everything that remains.
   */
  async shutdown(drainMs = 5000): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.emit({ event: 'shutdown', phase: 'draining' });
    this.server.close(); // stop accepting connections; existing ones finish below
    for (const ws of this.hosts.values()) this.send(ws, { t: 'goaway', reason: 'shutdown' });
    const deadline = Date.now() + Math.min(Math.max(0, drainMs), 5000);
    while (this.inflight.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    await this.close();
    this.emit({ event: 'shutdown', phase: 'closed' });
  }

  private sendOffline(res: http.ServerResponse, pathname: string, accept?: string): void {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (pathname.startsWith('/api/') || (accept ?? '').includes('application/json')) {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(OFFLINE_JSON);
    } else {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(OFFLINE_HTML);
    }
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const started = Date.now();
    let pathname: string;
    let target: URL;
    try {
      target = new URL(req.url ?? '/', 'http://relay.invalid');
      pathname = target.pathname;
    } catch {
      req.resume();
      res.writeHead(400, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('Bad request');
      return;
    }
    if (pathname === '/health' || pathname === '/healthz') {
      req.resume();
      this.sendHealth(res, (req.method ?? 'GET').toUpperCase());
      return;
    }
    const jsonReply = (status: number, body: string, extra: Record<string, string> = {}): void => {
      req.resume();
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra });
      res.end(body);
    };
    if (this.draining) {
      jsonReply(503, '{"code":"relay_shutting_down","message":"Relay is restarting"}', { connection: 'close' });
      return;
    }
    if (this.limits) {
      const ip = this.clientIp(req);
      const isPairing = (req.method ?? 'GET').toUpperCase() === 'POST' && pathname === '/api/pairing/exchange';
      const scope = isPairing && !this.allow('pairing', ip, this.limits.pairingPerWindow) ? 'pairing'
        : !this.allow('http', ip, this.limits.httpPerWindow) ? 'http' : undefined;
      if (scope) {
        this.emit({ event: 'rate_limit', scope, client: this.clientKey(ip), code: 429 });
        jsonReply(429, '{"code":"rate_limited","message":"Too many requests"}', { 'retry-after': String(Math.ceil(this.limits.windowMs / 1000)) });
        return;
      }
    }
    // Host identity comes only from the subdomain shape, never from any header the browser could forge past it.
    const match = this.hostPattern.exec(String(req.headers.host ?? '').toLowerCase());
    if (!match) {
      req.resume();
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('Not found');
      return;
    }
    const hostPublicId = match[1];
    const method = (req.method ?? 'GET').toUpperCase();
    const accept = typeof req.headers.accept === 'string' ? req.headers.accept : undefined;
    const quickLog = (status: number): void => this.options.log?.({ ts: Date.now(), hostPublicId, method, path: pathname, status, bytes: 0, durationMs: Date.now() - started });

    const initial = this.hosts.get(hostPublicId);
    if (!initial || initial.readyState !== WebSocket.OPEN) {
      req.resume();
      this.sendOffline(res, pathname, accept);
      quickLog(503);
      return;
    }

    const tooLarge = (): void => {
      if (res.headersSent) return;
      res.writeHead(413, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
      res.end('{"code":"payload_too_large","message":"Payload Too Large"}');
      quickLog(413);
    };
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
      req.resume();
      tooLarge();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        tooLarge();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      const current = this.hosts.get(hostPublicId);
      if (!current || current.readyState !== WebSocket.OPEN) {
        this.sendOffline(res, pathname, accept);
        quickLog(503);
        return;
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        const lower = name.toLowerCase();
        if (ALLOWED_REQUEST_HEADERS.has(lower) && typeof value === 'string') headers[lower] = value;
      }
      const id = crypto.randomUUID();
      const frame: RelayReqFrame = { t: 'req', id, method, path: `${target.pathname}${target.search}`, headers };
      if (size > 0) {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        if (Buffer.from(text, 'utf8').equals(buf)) frame.body = text;
        else frame.bodyB64 = buf.toString('base64');
      }
      this.inflight.set(id, { hostPublicId, ws: current, res, method, pathname, started, bytes: 0, headSent: false, status: 0 });
      // Browser went away: tell the exact host socket to cancel, then forget the request.
      res.on('close', () => {
        const entry = this.inflight.get(id);
        if (!entry) return; // finished, errored, already cancelled or aborted: no-op
        this.inflight.delete(id);
        this.send(entry.ws, { t: 'cancel', id });
        this.log(entry);
      });
      this.send(current, frame);
    });
  }
}
