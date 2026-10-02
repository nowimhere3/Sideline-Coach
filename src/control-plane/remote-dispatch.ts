import type * as http from 'node:http';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { ControlPlaneDaemon } from './daemon';
import type { DeviceRegistry } from './device-registry';
import type { HostDataFrame, HostEndFrame, HostErrorFrame, HostHeadFrame, RelayReqFrame } from './relay-frames';
import { parseCookies, requestOriginMatchesExpected, type Principal } from './request-security';

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

/** Canonical device cookie: the `__Host-` prefix makes a sibling Game origin unable to shadow it (no Domain, Secure, Path=/). */
export const DEVICE_COOKIE = '__Host-sl_dev';
/** Pre-R13 cookie. Accepted only when no canonical cookie is present, then migrated and expired. */
export const LEGACY_DEVICE_COOKIE = 'sl_dev';
export const DEVICE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
export const deviceCookieHeader = (rawToken: string): string =>
  `${DEVICE_COOKIE}=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_S}`;
export const LEGACY_DEVICE_COOKIE_EXPIRY = `${LEGACY_DEVICE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
/** The only request headers a remote peer may present; everything else is discarded (host is authoritative). */
export const ALLOWED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'accept', 'content-type', 'cookie', 'origin', 'x-sideline-action', 'last-event-id', 'user-agent'
]);
/** Preview-surface allowlist (S57.45 D1): no origin, action, content-type or SSE headers. */
export const ALLOWED_PREVIEW_REQUEST_HEADERS: ReadonlySet<string> = new Set(['accept', 'cookie', 'user-agent', 'service-worker']);

type RemotePrincipal = Extract<Principal, { kind: 'remote-device' }>;

interface Inflight {
  req: Readable;
  ended: boolean;
  finish: () => void;
  cancel: () => void;
}

export interface ResponseFlow {
  /** Subscribe to the tunnel queue's low-water transition; return subscription cleanup. */
  onDrain(listener: () => void): () => void;
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

  async dispatch(frame: FrameReq, onFrame: (res: FrameRes) => boolean | void, flow?: ResponseFlow): Promise<void> {
    const id = frame.id;
    let target: URL;
    try {
      target = new URL(frame.path, 'http://remote.invalid');
    } catch {
      onFrame({ t: 'error', id, code: 'bad_path' });
      return;
    }
    const method = String(frame.method || 'GET').toUpperCase();
    const previewSurface = frame.surface === 'preview';
    const allowed: Record<string, string> = {};
    for (const [name, value] of Object.entries(frame.headers ?? {})) {
      const lower = name.toLowerCase();
      if (typeof value === 'string' && (previewSurface ? ALLOWED_PREVIEW_REQUEST_HEADERS : ALLOWED_REQUEST_HEADERS).has(lower)) allowed[lower] = value;
    }
    // The device cookie is consumed here for authentication and never reaches daemon handlers.
    const { cookie: cookieHeader, ...headers } = allowed;
    if (previewSurface && frame.previewTag === undefined) {
      onFrame({ t: 'error', id, code: 'bad_frame' });
      return;
    }

    // App-surface Origin refusal (R13 D8): a browser-supplied Origin that is not this host's own (for example a
    // sibling Game origin) is refused for every method. No Origin header preserves prior behavior.
    if (!previewSurface && headers.origin !== undefined && !requestOriginMatchesExpected(headers.origin, this.options.expectedOrigin)) {
      onFrame({ t: 'head', id, status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      onFrame({ t: 'data', id, chunk: JSON.stringify({ success: false, message: 'Request origin could not be verified.' }) });
      onFrame({ t: 'end', id });
      return;
    }

    let principal: RemotePrincipal;
    let refreshCookie: string | undefined;
    const isPairPage = !previewSurface && method === 'GET' && (target.pathname === '/pair' || target.pathname === '/pair.html');
    if (previewSurface) {
      // Grant authentication belongs to the RemotePreviewGateway; the device cookie is never read here.
      principal = { kind: 'remote-device', deviceId: 'preview', authenticatedBy: 'in-process', expectedOrigin: this.options.expectedOrigin };
    } else if ((method === 'POST' && target.pathname === '/api/pairing/exchange') || isPairPage) {
      // Public bootstrap: the exchange is secret-gated and the pair page is static; the daemon answers both
      // before it reads the principal, so no device identity is granted here.
      principal = { kind: 'remote-device', deviceId: 'unpaired', authenticatedBy: 'in-process', expectedOrigin: this.options.expectedOrigin };
    } else {
      // Canonical cookie wins outright; a legacy cookie is only consulted when no canonical one is present,
      // so junk or attacker-planted `sl_dev` can never shadow or break a valid `__Host-sl_dev`.
      const cookies = parseCookies(cookieHeader);
      const canonicalToken = cookies.get(DEVICE_COOKIE);
      const legacyToken = cookies.get(LEGACY_DEVICE_COOKIE);
      const usingLegacy = canonicalToken === undefined;
      const rawToken = usingLegacy ? legacyToken : canonicalToken;
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
      // Re-issue the same token (as the canonical cookie) so the browser cookie slides with the host-side idle
      // window. A frame carries one string per header, so migration is two-step with no re-pair: a legacy-only
      // request is answered with the canonical cookie; the next request carries both and is answered with the
      // legacy expiry (canonical wins auth in between). The canonical refresh resumes on the following request.
      refreshCookie = !usingLegacy && legacyToken !== undefined ? LEGACY_DEVICE_COOKIE_EXPIRY : deviceCookieHeader(rawToken);
    }

    const req = new Readable({ read() { /* body is pushed up front */ }, autoDestroy: false, emitClose: false }) as Readable & Record<string, unknown>;
    Object.assign(req, {
      method,
      url: `${target.pathname}${target.search}`,
      headers,
      httpVersion: '1.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    if (frame.body) req.push(Buffer.from(frame.body, 'utf8'));
    req.push(null);

    let ended = false;
    let headSent = false;
    const pending: Record<string, string> = {};
    let statusCode = 200;
    let needDrain = false;
    let closed = false;
    const events = new EventEmitter();
    const unsubscribe = flow?.onDrain(() => {
      if (!ended && needDrain) {
        needDrain = false;
        events.emit('drain');
      }
    });
    const emit = (frameRes: FrameRes): void => { if (!ended) onFrame(frameRes); };
    const sendChunk = (chunk: unknown): boolean => {
      if (ended) return false;
      const data: HostDataFrame = chunk instanceof Uint8Array
        ? { t: 'data', id, chunkB64: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('base64') }
        : { t: 'data', id, chunk: String(chunk) };
      const accepted = onFrame(data) !== false;
      if (!accepted) needDrain = true;
      return accepted;
    };
    const finish = (): void => {
      if (ended) return;
      ended = true;
      unsubscribe?.();
      onFrame({ t: 'end', id });
      this.inflight.delete(id);
      events.emit('finish');
    };
    const cancel = (sendEnd = true): void => {
      if (closed || ended) return;
      closed = true;
      ended = true;
      unsubscribe?.();
      this.inflight.delete(id);
      req.destroy();
      req.emit('close');
      events.emit('close');
      if (sendEnd) onFrame({ t: 'end', id });
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
    const res = Object.defineProperties(events, Object.getOwnPropertyDescriptors({
      get destroyed() { return closed; },
      get writableEnded() { return ended; },
      get writableFinished() { return ended && !closed; },
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
        if (ended) return false;
        sendHead(statusCode);
        return sendChunk(chunk);
      },
      end(chunk?: unknown) {
        sendHead(statusCode);
        if (chunk !== undefined && chunk !== null && chunk !== '') sendChunk(chunk);
        finish();
        return this;
      },
      destroy() {
        if (previewSurface && headSent && !ended) {
          emit({ t: 'error', id, code: 'aborted' });
          cancel(false);
        } else cancel();
        return this;
      },
      flushHeaders() { sendHead(statusCode); },
    }));

    this.inflight.set(id, { req, get ended() { return ended; }, finish, cancel } as Inflight);
    try {
      if (previewSurface) {
        // R13: the preview surface never reaches the daemon router and never sees a device credential.
        await this.options.daemon.dispatchRemotePreview(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, {
          previewTag: frame.previewTag as string,
          ...(cookieHeader !== undefined ? { cookie: cookieHeader } : {})
        });
        return;
      }
      await this.options.daemon.dispatchRemoteRequest(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, principal);
    } catch {
      if (!ended) {
        emit({ t: 'error', id, code: 'dispatch_failed' });
        cancel(false);
      }
    }
  }

  /** Aborts an in-flight request (e.g. an SSE subscription): the daemon sees `close` and cleans up. */
  cancel(id: string): void {
    const entry = this.inflight.get(id);
    if (!entry) return;
    entry.cancel();
  }
}
