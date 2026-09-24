import type * as http from 'node:http';
import { Readable } from 'node:stream';
import type { ControlPlaneDaemon } from './daemon';
import type { DeviceRegistry } from './device-registry';
import type { HostDataFrame, HostEndFrame, HostErrorFrame, HostHeadFrame, RelayReqFrame } from './relay-frames';
import { parseCookies, type Principal } from './request-security';

/** Stage 2 names kept as aliases of the canonical wire frames in relay-frames.ts. */
export type FrameReq = RelayReqFrame;
export type FrameRes = HostHeadFrame | HostDataFrame | HostEndFrame | HostErrorFrame;

/** Browser-facing (HTML) reply for an unpaired device opening the app root. API callers still get JSON 401. */
export const UNPAIRED_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<meta name="robots" content="noindex, nofollow"><title>Device Not Paired - Sideline Coach</title>'
  + '<style>html,body{margin:0;min-height:100%;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6f8;color:#14202b}'
  + 'body{display:flex;align-items:center;justify-content:center;padding:16px;min-height:100vh}'
  + 'main{max-width:420px;background:#fff;border:1px solid #d5dde5;border-radius:16px;padding:24px 20px}'
  + 'h1{font-size:1.25rem;margin:0 0 8px}p{margin:0;color:#5b6b7a}'
  + '@media (prefers-color-scheme:dark){html,body{background:#0e141a;color:#e8eef4}main{background:#16202a;border-color:#2a3846}p{color:#9fb0c0}}</style></head>'
  + '<body><main><h1>Device Not Paired</h1><p>Use Send to Phone on your Sideline Coach computer to connect this device.</p></main></body></html>';

const DEVICE_COOKIE = 'sl_dev';
const DEVICE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
/** The only request headers a remote peer may present; everything else is discarded (host is authoritative). */
export const ALLOWED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'accept', 'content-type', 'cookie', 'origin', 'x-sideline-action', 'last-event-id', 'user-agent'
]);

type RemotePrincipal = Extract<Principal, { kind: 'remote-device' }>;

interface Inflight {
  req: Readable;
  ended: boolean;
  finish: () => void;
}

export interface InProcessRemoteAdapterOptions {
  daemon: ControlPlaneDaemon;
  deviceRegistry: DeviceRegistry;
  /** Trusted host origin (e.g. https://h-<hostPublicId>.<relay-domain>). Never taken from the request. */
  expectedOrigin: string;
}

/**
 * Stage 2 in-process stand-in for the future relay transport. It is the ONLY place a
 * `remote-device` Principal is minted: `sl_dev` is verified against the DeviceRegistry, then
 * the request is dispatched through the daemon's single typed remote seam.
 */
export class InProcessRemoteAdapter {
  private readonly inflight = new Map<string, Inflight>();

  constructor(private readonly options: InProcessRemoteAdapterOptions) {}

  async dispatch(frame: FrameReq, onFrame: (res: FrameRes) => void): Promise<void> {
    const id = frame.id;
    let target: URL;
    try {
      target = new URL(frame.path, 'http://remote.invalid');
    } catch {
      onFrame({ t: 'error', id, code: 'bad_path' });
      return;
    }
    const method = String(frame.method || 'GET').toUpperCase();
    const allowed: Record<string, string> = {};
    for (const [name, value] of Object.entries(frame.headers ?? {})) {
      const lower = name.toLowerCase();
      if (typeof value === 'string' && ALLOWED_REQUEST_HEADERS.has(lower)) allowed[lower] = value;
    }
    // The device cookie is consumed here for authentication and never reaches daemon handlers.
    const { cookie: cookieHeader, ...headers } = allowed;

    let principal: RemotePrincipal;
    let refreshCookie: string | undefined;
    const isPairPage = method === 'GET' && (target.pathname === '/pair' || target.pathname === '/pair.html');
    if ((method === 'POST' && target.pathname === '/api/pairing/exchange') || isPairPage) {
      // Public bootstrap: the exchange is secret-gated and the pair page is static; the daemon answers both
      // before it reads the principal, so no device identity is granted here.
      principal = { kind: 'remote-device', deviceId: 'unpaired', authenticatedBy: 'in-process', expectedOrigin: this.options.expectedOrigin };
    } else {
      const rawToken = parseCookies(cookieHeader).get(DEVICE_COOKIE);
      const device = this.options.deviceRegistry.authenticate(rawToken);
      if (!rawToken || !device) {
        const wantsHtml = method === 'GET' && (target.pathname === '/' || target.pathname === '/index.html')
          && String(headers.accept ?? '').toLowerCase().includes('text/html');
        if (wantsHtml) {
          onFrame({ t: 'head', id, status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
          onFrame({ t: 'data', id, chunk: UNPAIRED_HTML });
          onFrame({ t: 'end', id });
          return;
        }
        onFrame({ t: 'head', id, status: 401, headers: { 'content-type': 'application/json' } });
        onFrame({ t: 'data', id, chunk: JSON.stringify({ success: false, message: 'Unauthorized' }) });
        onFrame({ t: 'end', id });
        return;
      }
      principal = { kind: 'remote-device', deviceId: device.deviceId, authenticatedBy: 'in-process', expectedOrigin: this.options.expectedOrigin };
      // Re-issue the same token so the browser cookie slides with the host-side idle window.
      refreshCookie = `${DEVICE_COOKIE}=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_S}`;
    }

    const req = new Readable({ read() { /* body is pushed up front */ }, autoDestroy: false, emitClose: false }) as Readable & Record<string, unknown>;
    Object.assign(req, {
      method,
      url: `${target.pathname}${target.search}`,
      headers,
      httpVersion: '1.1',
      socket: { remoteAddress: '127.0.0.1' },
      destroy: () => req,
    });
    if (frame.body) req.push(Buffer.from(frame.body, 'utf8'));
    req.push(null);

    let ended = false;
    let headSent = false;
    const pending: Record<string, string> = {};
    let statusCode = 200;
    const emit = (frameRes: FrameRes): void => { if (!ended) onFrame(frameRes); };
    const finish = (): void => {
      if (ended) return;
      ended = true;
      onFrame({ t: 'end', id });
      this.inflight.delete(id);
    };
    const sendHead = (status: number, extra?: http.OutgoingHttpHeaders): void => {
      if (headSent) return;
      headSent = true;
      const merged: Record<string, string> = { ...pending };
      for (const [name, value] of Object.entries(extra ?? {})) {
        if (value !== undefined) merged[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      }
      if (refreshCookie && !merged['set-cookie']) merged['set-cookie'] = refreshCookie;
      emit({ t: 'head', id, status, headers: merged });
    };
    const res = {
      get headersSent() { return headSent; },
      get statusCode() { return statusCode; },
      set statusCode(value: number) { statusCode = value; },
      setHeader(name: string, value: unknown) { pending[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value); return this; },
      getHeader(name: string) { return pending[name.toLowerCase()]; },
      removeHeader(name: string) { delete pending[name.toLowerCase()]; },
      writeHead(status: number, second?: unknown, third?: unknown) {
        statusCode = status;
        const headerBag = (typeof second === 'object' && second !== null ? second : third) as http.OutgoingHttpHeaders | undefined;
        sendHead(status, headerBag);
        return this;
      },
      write(chunk: unknown) {
        sendHead(statusCode);
        emit({ t: 'data', id, chunk: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) });
        return true;
      },
      end(chunk?: unknown) {
        sendHead(statusCode);
        if (chunk !== undefined && chunk !== null && chunk !== '') emit({ t: 'data', id, chunk: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) });
        finish();
        return this;
      },
      on() { return this; },
      once() { return this; },
      off() { return this; },
      removeListener() { return this; },
      flushHeaders() { sendHead(statusCode); },
    };

    this.inflight.set(id, { req, get ended() { return ended; }, finish } as Inflight);
    try {
      await this.options.daemon.dispatchRemoteRequest(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, principal);
    } catch {
      if (!ended) {
        emit({ t: 'error', id, code: 'dispatch_failed' });
        ended = true;
        this.inflight.delete(id);
      }
    }
  }

  /** Aborts an in-flight request (e.g. an SSE subscription): the daemon sees `close` and cleans up. */
  cancel(id: string): void {
    const entry = this.inflight.get(id);
    if (!entry) return;
    entry.req.emit('close');
    entry.finish();
  }
}
