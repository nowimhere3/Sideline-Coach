import { WebSocket } from 'ws';
import type { ControlPlaneDaemon } from './daemon';
import type { DeviceRegistry } from './device-registry';
import type { HostIdentity } from './host-identity';
import { InProcessRemoteAdapter, type FrameRes } from './remote-dispatch';
import type { HostHelloFrame, HostToRelayFrame, RelayReqFrame } from './relay-frames';
import * as crypto from 'node:crypto';

export interface RelayClientOptions {
  /** Full tunnel URL, e.g. `wss://relay.example/tunnel/v1` (tests: `ws://127.0.0.1:<port>/tunnel/v1`). */
  relayUrl: string;
  /** Trusted configuration; browser origins are `https://h-<hostPublicId>.<relayDomain>`. */
  relayDomain: string;
  identity: HostIdentity;
  daemon: ControlPlaneDaemon;
  deviceRegistry: DeviceRegistry;
  /** Beta enrollment secret, presented as `x-sideline-enrollment` on the upgrade. Never logged or persisted here. */
  enrollmentKey?: string;
  /** Test seams. Production leaves everything below at its default. */
  watchdogMs?: number;
  backoffScheduleMs?: readonly number[];
  random?: () => number;
  /** Only the reconnect timer goes through this seam so backoff delays are observable without waiting. */
  timers?: { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void };
  createSocket?: (url: string) => WebSocket;
  flow?: { highWaterBytes?: number; lowWaterBytes?: number; maxQueueBytes?: number; pollMs?: number };
}

const CLIENT_NAME = 'sideline/1.0';
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const BACKOFF_SCHEDULE_MS: readonly number[] = [1000, 2000, 5000, 10000, 30000];
export const HOST_WATCHDOG_MS = 60_000;
export const HIGH_WATER_BYTES = 4 * 1024 * 1024;
export const LOW_WATER_BYTES = 2 * 1024 * 1024;
export const MAX_QUEUE_BYTES = 8 * 1024 * 1024;

/** Base delay for the n-th consecutive failed attempt (0-based), with uniform ±20% jitter. */
export function computeBackoffMs(attempt: number, random: () => number = Math.random, schedule: readonly number[] = BACKOFF_SCHEDULE_MS): number {
  const base = schedule[Math.min(Math.max(0, attempt), schedule.length - 1)];
  return base * (0.8 + 0.4 * random());
}

interface Conn {
  ws: WebSocket;
  helloSent: boolean;
  healthy: boolean;
  dead: boolean;
  paused: boolean;
  queue: Array<{ id: string; json: string; bytes: number }>;
  queuedBytes: number;
  watchdog?: NodeJS.Timeout;
  pump?: NodeJS.Timeout;
}

/**
 * Host side of the Stage 3 tunnel. It signs the relay challenge with the durable host key and
 * forwards each `req` frame into the existing InProcessRemoteAdapter, which stays the sole
 * authority for `sl_dev` authentication and `remote-device` principals.
 *
 * Resilience: the relay drives ping/pong; a host watchdog closes silent connections; unexpected
 * disconnects reconnect with 1/2/5/10/30 s backoff (±20%). The attempt counter resets only once the
 * relay's first post-hello frame proves the verified connection was retained (the wire has no ack).
 * Outbound response frames are flow-controlled: above 4 MiB `bufferedAmount` they queue in order and
 * resume at <= 2 MiB; a queue beyond 8 MiB fails the connection closed instead of growing.
 */
export class RelayClient {
  readonly expectedOrigin: string;
  readonly adapter: InProcessRemoteAdapter;
  private conn: Conn | undefined;
  private started = false;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer: unknown;
  private readonly active = new Set<string>();
  private readonly watchdogMs: number;
  private readonly schedule: readonly number[];
  private readonly random: () => number;
  private readonly timers: NonNullable<RelayClientOptions['timers']>;
  private readonly high: number;
  private readonly low: number;
  private readonly maxQueue: number;
  private readonly pollMs: number;

  constructor(private readonly options: RelayClientOptions) {
    this.expectedOrigin = `https://h-${options.identity.hostPublicId}.${options.relayDomain}`;
    this.adapter = new InProcessRemoteAdapter({ daemon: options.daemon, deviceRegistry: options.deviceRegistry, expectedOrigin: this.expectedOrigin });
    this.watchdogMs = options.watchdogMs ?? HOST_WATCHDOG_MS;
    this.schedule = options.backoffScheduleMs ?? BACKOFF_SCHEDULE_MS;
    this.random = options.random ?? Math.random;
    this.timers = options.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) };
    this.high = options.flow?.highWaterBytes ?? HIGH_WATER_BYTES;
    this.low = options.flow?.lowWaterBytes ?? LOW_WATER_BYTES;
    this.maxQueue = options.flow?.maxQueueBytes ?? MAX_QUEUE_BYTES;
    this.pollMs = options.flow?.pollMs ?? 25;
  }

  /** Observable internals for cleanup assertions. */
  get stats(): { connected: boolean; healthy: boolean; attempt: number; reconnectPending: boolean; watchdogArmed: boolean; pumpArmed: boolean; active: number; queuedBytes: number; stopped: boolean } {
    const conn = this.conn;
    return {
      connected: !!conn && !conn.dead && conn.ws.readyState === WebSocket.OPEN,
      healthy: !!conn && !conn.dead && conn.healthy,
      attempt: this.attempt,
      reconnectPending: this.reconnectTimer !== undefined,
      watchdogArmed: !!conn?.watchdog,
      pumpArmed: !!conn?.pump,
      active: this.active.size,
      queuedBytes: conn?.queuedBytes ?? 0,
      stopped: this.stopped
    };
  }

  /**
   * Begins the tunnel and resolves once the first connection attempt has settled (open or failed).
   * A failed attempt is not an error: it is retried with backoff like any other disconnect.
   */
  start(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('RelayClient is stopped'));
    if (this.started) return Promise.reject(new Error('RelayClient already started'));
    this.started = true;
    return this.connect();
  }

  /** Closes the tunnel intentionally: no reconnect, in-flight requests cancelled, permanently unusable. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) {
      this.timers.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const conn = this.conn;
    if (!conn) return;
    this.teardown(conn);
    const ws = conn.ws;
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
      else ws.close(1000, 'stopped');
    });
  }

  // ------------------------------------------------------------ connection

  private connect(): Promise<void> {
    const ws = this.options.createSocket ? this.options.createSocket(this.options.relayUrl) : new WebSocket(this.options.relayUrl, this.options.enrollmentKey ? { headers: { 'x-sideline-enrollment': this.options.enrollmentKey } } : undefined);
    const conn: Conn = { ws, helloSent: false, healthy: false, dead: false, paused: false, queue: [], queuedBytes: 0 };
    this.conn = conn;
    ws.on('message', (data) => this.onMessage(conn, data.toString()));
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => { /* a close event always follows */ });
    return new Promise((resolve) => {
      ws.once('open', () => resolve());
      ws.once('close', () => resolve());
    });
  }

  /** Releases everything bound to one connection. Idempotent. */
  private teardown(conn: Conn): void {
    conn.dead = true;
    if (conn.watchdog) clearTimeout(conn.watchdog);
    if (conn.pump) clearTimeout(conn.pump);
    conn.watchdog = undefined;
    conn.pump = undefined;
    conn.queue = [];
    conn.queuedBytes = 0;
    for (const id of [...this.active]) this.adapter.cancel(id);
    this.active.clear();
  }

  private onClose(conn: Conn): void {
    this.teardown(conn);
    if (conn !== this.conn || this.stopped) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    const delay = computeBackoffMs(this.attempt, this.random, this.schedule);
    this.attempt += 1;
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.stopped) void this.connect();
    }, delay);
  }

  private armWatchdog(conn: Conn): void {
    if (conn.watchdog) clearTimeout(conn.watchdog);
    conn.watchdog = setTimeout(() => {
      // Silent relay: drop the socket; the close handler reconnects.
      if (!conn.dead) conn.ws.terminate();
    }, this.watchdogMs);
    conn.watchdog.unref?.();
  }

  /** A valid post-hello relay frame proves the relay retained the verified connection. */
  private markAlive(conn: Conn): void {
    if (!conn.healthy) {
      conn.healthy = true;
      this.attempt = 0;
    }
    this.armWatchdog(conn);
  }

  // ------------------------------------------------------------ outbound

  /** Control frames (hello/pong) bypass the response queue so they are never delayed by backpressure. */
  private sendControl(conn: Conn, frame: HostToRelayFrame): void {
    if (!conn.dead && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(frame));
  }

  private enqueue(conn: Conn, frame: FrameRes): void {
    if (conn.dead) return;
    const json = JSON.stringify(frame);
    const bytes = Buffer.byteLength(json);
    conn.queue.push({ id: frame.id, json, bytes });
    conn.queuedBytes += bytes;
    this.flush(conn);
    if (!conn.dead && conn.queuedBytes > this.maxQueue) {
      // Hard bound: never grow past the cap. Fail the whole tunnel closed; the close handler
      // cancels in-flight work and reconnects. Nothing is dropped silently.
      conn.ws.terminate();
    }
  }

  private flush(conn: Conn): void {
    if (conn.dead || conn.ws.readyState !== WebSocket.OPEN) return;
    while (conn.queue.length > 0) {
      const buffered = conn.ws.bufferedAmount;
      if (conn.paused) {
        if (buffered > this.low) break;
        conn.paused = false;
      } else if (buffered > this.high) {
        conn.paused = true;
        break;
      }
      const item = conn.queue.shift()!;
      conn.queuedBytes -= item.bytes;
      // The completion callback is one of the resume triggers; the poll below is the other.
      conn.ws.send(item.json, () => { if (conn.paused || conn.queue.length > 0) this.flush(conn); });
    }
    if (conn.queue.length > 0 && !conn.pump) {
      conn.pump = setTimeout(() => {
        conn.pump = undefined;
        this.flush(conn);
      }, this.pollMs);
      conn.pump.unref?.();
    }
  }

  // ------------------------------------------------------------ inbound

  private onMessage(conn: Conn, raw: string): void {
    if (this.stopped || conn.dead) return;
    const ws = conn.ws;
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      ws.close(1002, 'Protocol error');
      return;
    }
    const f = frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : undefined;
    const t = f?.t;
    if (t === 'challenge') {
      this.onChallenge(conn, f as { nonce?: unknown });
      return;
    }
    if (!f || !conn.helloSent) {
      ws.close(1002, 'Protocol error');
      return;
    }
    if (t === 'req') {
      const req = this.parseReq(f);
      if (!req) {
        ws.close(1002, 'Protocol error');
        return;
      }
      this.markAlive(conn);
      this.onReq(conn, req);
    } else if (t === 'cancel' && typeof f.id === 'string') {
      this.markAlive(conn);
      this.cancel(conn, f.id);
    } else if (t === 'ping' && typeof f.ts === 'number') {
      this.markAlive(conn);
      this.sendControl(conn, { t: 'pong', ts: f.ts });
    } else if (t === 'goaway' && typeof f.reason === 'string') {
      this.markAlive(conn);
      if (f.reason === 'superseded') void this.stop(); // another instance is authoritative: never reconnect
      else ws.close(1000, 'goaway'); // shutdown/restart: normal reconnect via the close handler
    } else {
      ws.close(1002, 'Protocol error');
    }
  }

  private cancel(conn: Conn, id: string): void {
    // Queued-but-unsent frames of a cancelled request are pointless; the adapter still emits its own `end`.
    if (conn.queue.some((item) => item.id === id)) {
      conn.queue = conn.queue.filter((item) => item.id !== id);
      conn.queuedBytes = conn.queue.reduce((sum, item) => sum + item.bytes, 0);
    }
    this.adapter.cancel(id);
    this.active.delete(id);
  }

  private onChallenge(conn: Conn, frame: { nonce?: unknown }): void {
    const nonce = frame.nonce;
    if (conn.helloSent || typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) {
      conn.ws.close(1002, 'Protocol error');
      return;
    }
    const rawNonce = Buffer.from(nonce, 'base64url');
    if (rawNonce.length !== 32) {
      conn.ws.close(1002, 'Protocol error');
      return;
    }
    const jwk = this.options.identity.publicKey.export({ format: 'jwk' });
    const hello: HostHelloFrame = {
      t: 'hello',
      v: 1,
      hostPublicId: this.options.identity.hostPublicId,
      publicKey: Buffer.from(String(jwk.x), 'base64url').toString('hex'),
      sig: crypto.sign(null, rawNonce, this.options.identity.privateKey).toString('base64url'),
      client: CLIENT_NAME
    };
    conn.helloSent = true;
    this.sendControl(conn, hello);
    this.armWatchdog(conn);
  }

  private parseReq(frame: Record<string, unknown>): RelayReqFrame | undefined {
    const { id, method, path, headers, body, bodyB64 } = frame;
    if (typeof id !== 'string' || !id || typeof method !== 'string' || typeof path !== 'string' || !path.startsWith('/')) return undefined;
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return undefined;
    if (!Object.values(headers).every((value) => typeof value === 'string')) return undefined;
    if (body !== undefined && typeof body !== 'string') return undefined;
    if (bodyB64 !== undefined && typeof bodyB64 !== 'string') return undefined;
    return { t: 'req', id, method, path, headers: headers as Record<string, string>, ...(body !== undefined ? { body } : {}), ...(bodyB64 !== undefined ? { bodyB64 } : {}) };
  }

  private onReq(conn: Conn, req: RelayReqFrame): void {
    if (this.active.has(req.id)) {
      this.sendControl(conn, { t: 'error', id: req.id, code: 'duplicate_id' });
      return;
    }
    let body = req.body;
    if (req.bodyB64 !== undefined) {
      // The adapter carries UTF-8 text bodies; binary request bodies are not supported yet.
      const buf = Buffer.from(req.bodyB64, 'base64');
      const text = buf.toString('utf8');
      if (body !== undefined || !Buffer.from(text, 'utf8').equals(buf)) {
        this.sendControl(conn, { t: 'error', id: req.id, code: 'unsupported_body' });
        return;
      }
      body = text;
    }
    this.active.add(req.id);
    const onFrame = (res: FrameRes): void => {
      if (conn.dead) return;
      if (res.t === 'end' || res.t === 'error') this.active.delete(res.id);
      this.enqueue(conn, res);
    };
    this.adapter.dispatch({ t: 'req', id: req.id, method: req.method, path: req.path, headers: req.headers, ...(body !== undefined ? { body } : {}) }, onFrame).catch(() => {
      if (this.active.delete(req.id)) this.enqueue(conn, { t: 'error', id: req.id, code: 'dispatch_failed' });
    });
  }
}
