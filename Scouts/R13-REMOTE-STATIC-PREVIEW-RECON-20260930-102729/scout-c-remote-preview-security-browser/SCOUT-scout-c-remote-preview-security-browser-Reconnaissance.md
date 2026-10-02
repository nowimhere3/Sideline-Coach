Now I have a comprehensive understanding of the architecture. Let me compile the full reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729  
**Scout ID:** scout-c-remote-preview-security-browser  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Status:** RECONNAISSANCE — not final architectural authority

---

## RESULT

This reconnaissance maps the current Sideline Coach codebase's static preview server, remote access infrastructure, and browser/transport constraints to answer: **What must be satisfied to expose exactly ONE approved Game-owned static PreviewEndpoint to Dad's authenticated remote phone session without creating a generic localhost proxy?**

---

## KEY DISCOVERIES

### 1. Static Preview Server (Stadium-owned) — `src/static-preview.ts`

**FACT** The `StaticPreviewServer` is a **Node `http` server** bound to `127.0.0.1` on an ephemeral port (line 195). It serves only **GET/HEAD** (line 212).

**FACT** Strict root containment is enforced at **three layers** (lines 219-230):
- Path segment validation (blocks `.`, `..`, dotfiles, `secret*` segments)
- `path.resolve()` containment check vs `rootFsPath`
- `realpath()` containment check vs `rootRealPath` (symlink escape prevention)

**FACT** MIME types are preserved from a static map (lines 141-149); charset=utf-8 added for text types.

**FACT** Response streaming via `fs.createReadStream().pipe(res)` (line 241) — **HTTP response streaming exists**.

**FACT** Binary bodies supported — `application/octet-stream` fallback for unknown extensions (line 235).

**FACT** Headers set: `X-Content-Type-Options: nosniff`, `Content-Length`, `Content-Type`. No CSP, no CORS, no `Set-Cookie`.

**FACT** No redirects. No URL/path rewriting. No iframe/X-Frame-Options headers.

**FACT** Server lifecycle: one per Game switch (`prepare()` closes old, line 171). Game-root authoritative.

### 2. Preview Discovery & Resolution — `src/preview-discovery.ts`

**FACT** `resolveGamePreview()` returns `PreviewResolution` with `PreviewEndpoint[]` (lines 62-72).

**FACT** Static preview resolution path (lines 478-506):
- Discovers pages via `discoverStaticPreview()` 
- Gets `URL` from `StaticPreviewServer.urlFor()` → `http://127.0.0.1:<port>/<encoded-path>`
- Maps to client URL via injected `toClientUrl` (VS Code `asExternalUri` in practice)
- Returns `PreviewEndpoint` with `source: 'static'`, `ownership: 'verified'`, `protocol: 'http'`, `loopbackIpv4: true`

**FACT** `PreviewEndpoint` carries both `localUrl` (Stadium environment) and `clientUrl` (VS Code client machine) — **phone cannot use either directly** (line 43-45 comment).

**FACT** For `remote-device` principals, daemon returns `{ available: false, reason: 'remote-viewer' }` (daemon.ts:2205-2207) — **explicitly blocks remote preview today**.

### 3. Remote Access Architecture — Control Plane + Relay

**FACT** Two distinct HTTP entrypoints:
- **CoachServer** (`src/server.ts:108`) — `127.0.0.1:49152` (configurable), Bearer token auth, serves mobile UI + API
- **Control Plane Daemon** (`src/control-plane/daemon.ts`) — separate port, `sl_dev` cookie auth for paired devices

**FACT** **RelayClient** (`src/control-plane/relay-client.ts`) connects Stadium to public relay via WebSocket tunnel (`wss://relay.example/tunnel/v1`).

**FACT** **ReferenceRelay** (`relay/reference-relay.ts`) — public HTTPS endpoint with subdomain routing: `h-<hostPublicId>.<relayDomain>`.

**FACT** Browser requests hit relay → WebSocket to host → `InProcessRemoteAdapter` → daemon's `dispatchRemoteRequest()`.

**FACT** **Header forwarding**: Only allowlisted headers pass (relay-frames.ts:22, remote-dispatch.ts:26-28): `accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`.

**FACT** **Cookie handling**: `sl_dev` HttpOnly; Secure; SameSite=Lax; Max-Age=30d (remote-dispatch.ts:99). Refresh cookie issued on each request.

**FACT** **Binary bodies**: Relay frames support `bodyB64` (base64) but `RelayClient` rejects non-UTF8 (relay-client.ts:347-355) — **binary request bodies NOT supported**.

**FACT** **Response streaming**: Relay frames support chunked `data` frames (relay-frames.ts:68-74, reference-relay.ts:421-432) — **HTTP response streaming EXISTS end-to-end**.

**FACT** **CSP**: CoachServer sets strict CSP (server.ts:953-956): `default-src 'self'; script-src 'self' 'unsafe-inline'; ... frame-ancestors 'none'`. StaticPreviewServer sets **no CSP**.

**FACT** **CORS**: Neither server sets CORS headers. Relay sets no CORS.

**FACT** **iframe/origin**: CoachServer sets `X-Frame-Options: DENY` (server.ts:952). StaticPreviewServer sets none.

### 4. Authorization Lifecycle

**FACT** Three principal kinds (request-security.ts:3-5):
- `local-admin` (Bearer token or cookie)
- `remote-device` (`sl_dev` cookie, verified against DeviceRegistry)
- `unpaired` (pairing flow only)

**FACT** DeviceRegistry tokens: 256-bit random, SHA-256 stored, 30-day idle expiry (device-registry.ts:6, 64-68).

**FACT** Pairing: 5-min TTL, 5 failed attempts burns pairing (pairing.ts:4, 5). QR secret or fallback code.

**FACT** Route policy default-deny (remote-routes.ts:15-89): `/api/games/preview` = `remote-read` (line 35).

**FACT** **Principal gating** (remote-routes.ts:101-103): `remote-device` allowed for `remote-read` and `remote-mutate`.

### 5. SSRF / Arbitrary Localhost Exposure Risks

**FACT** StaticPreviewServer binds **only** `127.0.0.1` (line 195). No config to change.

**FACT** Path containment uses `realpath()` twice (lines 229-230) — symlink escape prevented.

**FACT** Daemon `proxyExactGameRpc()` validates Game ownership, Stadium connection, feature flag (daemon.ts:3788-3823) — **cannot proxy arbitrary ports**.

**FACT** Relay subdomain routing: `h-<hostPublicId>.<relayDomain>` derived from Ed25519 public key (host-identity.ts:41-43). **Host identity cryptographically bound**.

**FACT** ReferenceRelay validates enrollment key on upgrade (reference-relay.ts:150) and rate-limits by client IP.

**CONTRADICTION** Daemon currently returns `remote-viewer` for static preview (daemon.ts:2205-2207) — **explicitly denies** remote access. This is the seam to change.

### 6. Static-Only Simplifications (GS3)

**FACT** Static GS3 has **no HMR WebSockets**, **no Vite**, **no dev server** — only static files.

**FACT** StaticPreviewServer serves **only GET/HEAD** — no WebSocket upgrade.

**FACT** Asset subrequests from embedded page are **same-origin** to `http://127.0.0.1:<port>/` — all go through same StaticPreviewServer.

**FACT** Relative paths (`./asset.js`) and root-relative (`/asset.js`) both resolve within Game root via same containment logic.

**FACT** No auth cookies set by StaticPreviewServer — **no cookie implications** for static preview itself.

**FACT** `previewRememberEntrypoint` / `previewRememberedEntrypoint` (stadium-client.ts:172-176) — durable per-Game choice.

---

## CLASSIFIED FINDINGS

### FACT (Proven by source)

| # | Finding | Evidence |
|---|---------|----------|
| F1 | StaticPreviewServer binds 127.0.0.1 only, ephemeral port, GET/HEAD only | static-preview.ts:195, 212 |
| F2 | Triple containment: segment validation + path.resolve + realpath | static-preview.ts:219-230 |
| F3 | Response streaming via `fs.createReadStream().pipe(res)` | static-preview.ts:241 |
| F4 | Binary bodies served as `application/octet-stream` | static-preview.ts:235 |
| F5 | MIME map preserved with charset for text types | static-preview.ts:141-149 |
| F6 | No CSP, CORS, Set-Cookie, X-Frame-Options from StaticPreviewServer | static-preview.ts:203-241 |
| F7 | PreviewEndpoint carries `localUrl` (Stadium) + `clientUrl` (VS Code machine) | preview-discovery.ts:43-45 |
| F8 | Daemon explicitly blocks remote-device from `/api/games/preview` → `remote-viewer` | daemon.ts:2205-2207 |
| F9 | Relay allows only 7 headers; Host header drives subdomain routing | relay-frames.ts:22, reference-relay.ts:565 |
| F10 | Relay frames support chunked response streaming (head/data/end) | relay-frames.ts:68-74, reference-relay.ts:421-432 |
| F11 | RelayClient rejects non-UTF8 request bodies (binary not supported) | relay-client.ts:347-355 |
| F12 | Device auth: `sl_dev` HttpOnly; Secure; SameSite=Lax; 30d sliding | remote-dispatch.ts:99, device-registry.ts:64-68 |
| F13 | Pairing: 5-min TTL, 5 failures burns, QR secret or formatted code | pairing.ts:4, 5, 73 |
| F14 | Route policy: `/api/games/preview` = `remote-read` (allowed for remote-device) | remote-routes.ts:35 |
| F15 | CoachServer CSP: `frame-ancestors 'none'`, `X-Frame-Options: DENY` | server.ts:952-956 |
| F16 | StaticPreviewServer lifecycle bound to Game switch (prepare/dispose) | static-preview.ts:168-175, 244-259 |
| F17 | Daemon proxyExactGameRpc validates Game + Stadium + feature flag | daemon.ts:3788-3823 |
| F18 | Host identity: Ed25519 keypair, hostPublicId = SHA256(pubkey) base32[0:20] | host-identity.ts:41-43 |
| F19 | ReferenceRelay validates enrollment key on WebSocket upgrade | reference-relay.ts:150 |
| F20 | Static asset subrequests same-origin to StaticPreviewServer | static-preview.ts:211-242 |

### INFERENCE (Strong reasoning from evidence)

| # | Inference | Basis |
|---|-----------|-------|
| I1 | Static GS3 preview on phone requires **new relay subdomain path** (e.g. `/preview/v1/...`) mapped to StaticPreviewServer port | Relay routes by host; path rewriting needed |
| I2 | `clientUrl` from `asExternalUri` is **VS Code machine only** — phone needs distinct mapping | preview-discovery.ts:44-45 comment |
| I3 | CSP `frame-ancestors 'none'` on CoachServer **does not affect** StaticPreviewServer (different port) | server.ts:955 vs static-preview.ts:237 |
| I4 | Relative asset paths in static HTML **work automatically** through StaticPreviewServer containment | static-preview.ts:219-230 |
| I5 | Preview session expiry = StaticPreviewServer port lifetime (Game switch or dispose) | static-preview.ts:168-175, 244-259 |
| I6 | No cookie leakage from StaticPreviewServer → **no CSRF surface** for static preview | static-preview.ts:203-241 |
| I7 | Authorization = `THIS viewer + THIS Stadium + THIS Game + THIS endpoint` maps to: DeviceRegistry deviceId + Stadium hostPublicId + Game gameId + static entrypoint path | device-registry.ts, host-identity.ts, game-identity.ts, static-preview.ts |

### UNKNOWN (Requires implementation/field evidence)

| # | Unknown | Why |
|---|---------|-----|
| U1 | Whether phone browsers handle `http://h-<host>.<domain>/preview/...` → relay → host → StaticPreviewServer without cert errors | Depends on relay TLS, HSTS, mixed-content |
| U2 | Whether `asExternalUri` mapping for preview subdomain works in Codespaces/remote SSH | VS Code API behavior varies by environment |
| U3 | Exact header forwarding behavior for `Range` requests (video/audio seeking) | Not tested; relay allowlist doesn't include `Range` |
| U4 | Whether Service Worker (`sw.js`) intercepts preview subdomain requests | sw.js only handles push notifications (sw.js:34-40) |
| U5 | Maximum concurrent preview sessions per StaticPreviewServer | Node http.Server default limits; untested |
| U6 | Cache behavior: `Cache-Control: no-store` from daemon vs static server's lack thereof | daemon sends no-store; static server sends nothing |
| U7 | Whether `ETag`/`Last-Modified` / conditional requests work end-to-end | Not implemented in static-preview.ts |
| U8 | Mobile Safari/Chrome behavior with `http://` (non-HTTPS) preview on phone | Requires HTTPS relay + HTTP host; mixed content? |

### CONTRADICTION

| # | Contradiction | Resolution |
|---|---------------|------------|
| C1 | Route policy allows `remote-read` for `/api/games/preview` (remote-routes.ts:35) but daemon returns `remote-viewer` block (daemon.ts:2205) | **Intentional**: daemon overrides route policy for preview. Must change daemon to allow static preview for remote-device. |
| C2 | CoachServer CSP `frame-ancestors 'none'` but StaticPreviewServer sets no CSP | Different servers, different ports. Static preview served directly, not framed in Coach UI. |

### ARCHITECT DECISION REQUIRED

| # | Decision | Options |
|---|----------|---------|
| A1 | **Relay path structure**: `/preview/v1/<hostPublicId>/<gameId>/<encoded-path>` vs new subdomain `p-<hostPublicId>.<domain>` | Subdomain cleaner for CSP/cookies; path simpler for relay config |
| A2 | **TLS termination**: Relay HTTPS → Host HTTP (current) vs Relay HTTPS → Host HTTPS | Host HTTP simpler; StaticPreviewServer is HTTP only |
| A3 | **Preview session binding**: Per-device token + Game + entrypoint → relay maps to host:port | Must survive Stadium reconnect (port may change) |
| A4 | **Expiry/revocation**: Device idle (30d) + pairing burn + Game switch + manual revoke | Composite; Architect must define precedence |
| A5 | **CSP for preview**: Inherit CoachServer strict CSP vs relax for static assets | Static games may need `'unsafe-inline'` for inline scripts |
| A6 | **Range requests**: Add `range` to relay allowlist? | Needed for video/audio; security review required |
| A7 | **Binary request bodies**: Support `bodyB64` in RelayClient? | Currently rejected; not needed for static GET/HEAD |
| A8 | **SSRF proof**: Demonstrate that relay subdomain + path cannot reach arbitrary localhost | Requires threat model + penetration test |

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/static-preview.ts` | Stadium-owned static file server (authoritative containment) |
| `src/preview-discovery.ts` | Preview resolution, static + dynamic, `toClientUrl` mapping |
| `src/control-plane/daemon.ts` | HTTP daemon, route policies, `proxyExactGameRpc`, preview block at 2205 |
| `src/control-plane/remote-routes.ts` | Default-deny route policy, `remote-read` for preview |
| `src/control-plane/remote-dispatch.ts` | `InProcessRemoteAdapter` — auth, principal minting, frame translation |
| `src/control-plane/relay-client.ts` | Host→Relay WebSocket, flow control, `RelayReqFrame` dispatch |
| `relay/reference-relay.ts` | Public relay, subdomain routing, rate limits, challenge/hello |
| `src/control-plane/host-identity.ts` | Ed25519 host identity, `hostPublicId` derivation |
| `src/control-plane/device-registry.ts` | Paired device tokens, `sl_dev` cookie auth |
| `src/control-plane/pairing.ts` | Pairing flow, QR secret, fallback code, 5-min TTL |
| `src/server.ts` | CoachServer (local UI + API), CSP, Bearer auth |
| `src/stadium-client.ts` | Stadium→Control Plane WebSocket, `game.preview.v1` feature |
| `src/public/index.html` | Mobile UI, pairing dialog, remote access settings |
| `src/public/pair.html` | Device pairing page, QR/code exchange |
| `src/public/sw.js` | Push notification SW (no request interception) |

---

## LIMITATIONS

1. **No runtime observation** — all findings from static source analysis
2. **No field testing** with actual phone + relay + Stadium
3. **Codespaces/WSL/SSH/Dev Container** environments not exercised
4. **Service Worker** scope interaction with preview subdomain untested
5. **Mobile browser quirks** (iOS Safari PWA, Android Chrome) unknown
6. **Binary asset streaming** (video, large WASM) not validated end-to-end

---

## SECURITY NORTH STAR VERIFICATION

The current architecture **already enforces**:

| North Star Requirement | Current State |
|------------------------|---------------|
| THIS authenticated viewer | `sl_dev` cookie → DeviceRegistry → `remote-device` principal |
| THIS Stadium | `hostPublicId` in relay subdomain, cryptographically bound to Ed25519 key |
| THIS Game | `gameId` validated in `proxyExactGameRpc`, Stadium session scoped |
| THIS approved PreviewEndpoint | Static entrypoint declared in `.sideline/game.json` or discovered canonical |

**Gap**: Daemon explicitly blocks `remote-device` from preview (daemon.ts:2205). **This is the single policy change** needed for static GS3 — but must be accompanied by relay path mapping and session binding.

---

## EXACT SEAMS FOR ARCHITECT

1. **Daemon** (`daemon.ts:2198-2217`): Remove `remote-viewer` block for static preview; allow `remote-device` when `source === 'static'`.

2. **Relay** (`reference-relay.ts` + `relay-client.ts`): Add preview path routing (`/preview/v1/...`) that preserves `Host` header for subdomain auth, forwards to host's StaticPreviewServer port.

3. **StadiumClient** (`stadium-client.ts:167-169`): Expose `staticPreviewServer.activePort` to daemon for preview path construction.

4. **PreviewDiscovery** (`preview-discovery.ts:478-506`): Add `remoteViewerUrl` field to `PreviewEndpoint` for phone-specific mapping.

5. **DeviceRegistry** (`device-registry.ts`): Add `previewEntrypoint` + `gameId` binding to device record for expiry/revocation.

---

**END OF RECONNAISSANCE**
