I'll begin by scouting the repository structure and locating the Scout SOP/ROASTER, as well as understanding the existing architecture around Stadiums and preview capabilities.
Let me read the Scout SOP/ROASTER and the related prompt files for this specific play, plus look at existing related scout reports.
Now let me explore the source code structure and look for the existing related scout reports.
Let me check the existing reports from the sub-scouts and read the key source files for the preview/server plumbing.
Let me read the existing sub-scout report, and continue reading key source files.
Let me now examine the extension entry point, the control plane daemon, and search for key plumbing patterns.
Now let me search for key patterns across the codebase and examine the control plane daemon and launcher.
Let me read the control plane daemon, the launcher, package.json, and the public browser UI.
Let me read the daemon HTTP handler, the remote routes, the pairing system, and the public browser UI.
Let me search for the daemon's HTTP handler and the remote relay/pairing mechanics, plus the public browser UI.
Let me now read the daemon's HTTP handler, the relay client, the request security, and the protocol definitions.
Let me read the protocol definitions, the package.json configuration, and the relay client for remote access.
Let me continue reading the daemon's HTTP handler, the relay client, and search for any "preview" or "dev server" concepts.
Let me read the daemon's `serveIndex` and `resolvePrincipal` methods, plus the remote-dispatch adapter and existing remote-access scout reports.
Let me find the daemon's serveIndex and resolvePrincipal methods, and read the remote-access Stage 5 mobile report.
Let me find the correct scout report filenames and the daemon's serve/resolve methods.
Let me find the exact line numbers for serveIndex and resolvePrincipal in the daemon.
Let me search the browser client for authentication patterns and read the Stage 5 reports.
Let me find the SSE handler and buildStatus in the daemon, and check what remote-access reports exist.
Let me find the SSE handler and buildStatus in the daemon, and read the mobile-responsive scout's partial output.
## Objective
- Reconnaissance (read-only) for a future "Preview in Browser" feature for browser-based Games in Sideline Coach
- Thesis: Browser Preview should be an environment-aware adapter over existing Game preview/server capabilities, NOT a new application architecture
- Must support one running app, multiple viewport-sized views (Desktop / Tablet / Phone), across Stadiums: local Windows VS Code, VS Code remote, GitHub Codespaces, cloud/browser

## Important Details
- Play ID: `browser-preview-plumbing-recon-fresh-20260926-173646`
- Scout ID: `preview-environment-product-fit`
- Assigned custom agent: `sideline-scout`
- Assigned model: `openrouter/poolside/laguna-s-2.1:free`
- Game root: `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
- Three sub-scouts already ran: `local-preview-port-plumbing`, `remote-mobile-qr-plumbing`, `preview-environment-product-fit`
- READ-ONLY: no file modifications, no shell commands, no git mutations, no package installs
- Existing report exists: `Scouts/browser-preview-plumbing-recon-fresh-20260926-173646/local-preview-port-plumbing/SCOUT-local-preview-port-plumbing-Reconnaissance.md`
- Must cite exact files/functions, classify FACT / INFERENCE / UNKNOWN / CONTRADICTION

## Work State
### Completed
- Read Scout SOP / ROASTER: `Project SOP/Scout SOP and ROASTER/Sideline-Coach-Free-Scout-Selection-and-Invocation-SOP.md`
- Read sub-scout prompts for all three lanes
- Read existing `local-preview-port-plumbing` reconnaissance report
- Examined `src/server.ts` — CoachServer class, port 49152, `serveIndex`, `setCommonHeaders` with CSP `frame-ancestors 'none'` and `X-Frame-Options: 'DENY'`
- Examined `src/control-plane/daemon.ts` — Control Plane daemon (~5000+ lines), port 3100, WebSocket server `/stadium`, relay-client integration, SSE broadcasting, pairing/QR, HTTP handler dispatching
- Examined `src/control-plane/launcher.ts` — `ensureControlPlaneRunning`, port discovery, `LauncherOptions.requestedPort`, `ControlPlaneDiscoveryRecord`
- Examined `src/game-identity.ts` — `StadiumType = 'vscode-desktop' | 'vscode-web' | 'standalone'`, `getStadiumIdentity()` always returns `vscode-desktop` (hardcoded)
- Examined `src/game-window-opener.ts` — `chooseOpenStrategy`, `vscode.openFolder` for game window opening (no browser preview)
- Examined `src/extension.ts` — `copyMobileUrl` command (copies `http://127.0.0.1:${port}/#token=...` to clipboard), no `openExternal`/`WebViewPanel`/`SimpleBrowser` usage
- Examined `src/control-plane/remote-routes.ts` — DAEMON_ROUTE_POLICIES, `principalMayAccess`, route-level default-deny
- Examined `src/control-plane/pairing.ts` — PAIRING_CODE, QR pairing, device registry
- Examined `src/control-plane/remote-bootstrap.ts` — ProductRelayBootstrap, `PRODUCT_RELAY_URL`, `PRODUCT_RELAY_DOMAIN`
- Examined `src/control-plane/remote-dispatch.ts` — `InProcessRemoteAdapter`, `UNPAIRED_HTML`
- Examined `src/control-plane/request-security.ts` — Principal types (`local-admin`, `remote-device`), `timingSafeSecretEqual`, `requestOriginMatchesHost`
- Examined `src/public/index.html` — Mobile browser UI, EventSource `/api/events`, token fragment auth, responsive design with viewport meta
- Read protocol.ts, remote-routes.ts, pairing.ts, relay-client.ts, host-identity.ts
- Reviewed existing related scout reports: remote-access-v1-recon, remote-access-v1-stage5-recon

### Active
- (Scout report generation — not yet written; investigation is ongoing to compile final verdict)

### Blocked
- Remote/mobile QR plumbing sub-scout report not yet located (may not have completed; need to check `Scouts/browser-preview-plumbing-recon-fresh-20260926-173646/remote-mobile-qr-plumbing/`)

## Next Move
1. Check if `remote-mobile-qr-plumbing` sub-scout produced a report at `Scouts/browser-preview-plumbing-recon-fresh-20260926-173646/remote-mobile-qr-plumbing/`
2. Read any remaining daemon.ts portions needed (e.g., `handleSseConnection`, `resolvePrincipal`, `buildStatus`, `serveIndex`)
3. Compile findings into required return format: VERIFIED EXISTING PLUMBING, THESIS VERDICT, MINIMUM MISSING PIECES, REUSE MAP, RISKS/BLOCKERS, RECOMMENDED NEXT PLAY

## Relevant Files
- `Scouts/browser-preview-plumbing-recon-fresh-20260926-173646/play.json` — Play definition with three sub-scouts
- `Scouts/browser-preview-plumbing-recon-fresh-20260926-173646/local-preview-port-plumbing/SCOUT-local-preview-port-plumbing-Reconnaissance.md` — Existing local plumbing report
- `src/server.ts` — CoachServer (HTTP port 49152), `serveIndex`, `setCommonHeaders` (CSP: `frame-ancestors 'none'`, `X-Frame-Options: DENY`)
- `src/control-plane/daemon.ts` — Control Plane daemon (WS port 3100), HTTP routing, SSE, serving browser UI, relay integration
- `src/control-plane/launcher.ts` — `ensureControlPlaneRunning`, `LauncherOptions`, `ControlPlaneDiscoveryRecord`
- `src/control-plane/protocol.ts` — JSON-RPC protocol types including `ControlPlaneDiscoveryRecord`
- `src/control-plane/remote-routes.ts` — `DAEMON_ROUTE_POLICIES`, `principalMayAccess`
- `src/control-plane/pairing.ts` — PairingStore, pairing codes, QR secrets
- `src/control-plane/remote-bootstrap.ts` — `ProductRemoteRelayBootstrap`, `PRODUCT_RELAY_URL`, `PRODUCT_RELAY_DOMAIN`
- `src/control-plane/remote-dispatch.ts` — `InProcessRemoteAdapter`, `UNPAIRED_HTML`
- `src/control-plane/request-security.ts` — Principal types, security checks
- `src/game-identity.ts` — `StadiumType`, `getStadiumIdentity()`, `getDurableStadiumId()`, `StadiumIdentity`
- `src/game-window-opener.ts` — `chooseOpenStrategy`, `vscode.openFolder`
- `src/extension.ts` — `copyMobileUrl`, `coach.copyMobileUrl` command, no `openExternal`/`WebView`/`SimpleBrowser`
- `src/stadium-client.ts` — StadiumClient, WebSocket connection to daemon
- `src/public/index.html` — Mobile browser UI, EventSource `/api/events`, token fragment auth
- `src/public/pair.html` — Pairing UI
- `src/public/sw.js` — Service worker for push notifications
- `package.json` — Extension config, `coach.copyMobileUrl` activation event, `coach.publicUrl` config setting (line 355)
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
Now let me find the `handleSseConnection` and `buildStatus` implementations, and also check the `resolvePrincipal` method.
Now let me look at the `setCommonHeaders` in `server.ts` to compare the framing security headers between the two servers:
Let me look at the `copyMobileUrl` implementation and the `index.html` browser UI:
Let me look at the `index.html` browser client and the existing local-preview report:
Now let me check the remote-dispatch.ts for the InProcessRemoteAdapter and UNPAIRED_HTML:
Let me check the StadiumSession type and how stadium type is determined:
Now let me read the remote-routes.ts to understand the route access policies, and the launcher.ts for daemon discovery:
I now have a comprehensive picture. Let me check one more thing - the `index.html` JavaScript to understand how the browser client authenticates:
Now I have all the evidence needed. Let me verify the `remote-dispatch.ts` lifecycle and check for any existing preview-related code:
I now have all the evidence needed. Let me compile the final report:

---

# SCOUT REPORT — READ-ONLY RECONNAISSANCE

**Play ID:** `browser-preview-plumbing-recon-fresh-20260926-173646`  
**Scout ID:** `preview-environment-product-fit`  
**Assigned custom agent:** `sideline-scout`  
**Assigned model:** `openrouter/poolside/laguna-s-2.1:free`  
**Game root:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

This report is reconnaissance, not final architectural authority. Findings distinguish **FACT** / **INFERENCE** / **UNKNOWN** / **CONTRADICTION** based on static source analysis of the current codebase.

---

## VERIFIED EXISTING PLUMBING

### 1. The Control Plane daemon already serves a browser UI without framing restrictions

**FACT:** `ControlPlaneDaemon.serveIndex` (`src/control-plane/daemon.ts`, lines 5121–5141) serves `src/public/index.html` with **only** a `Content-Type: text/html; charset=utf-8` header. It sets **no** `Content-Security-Policy`, **no** `X-Frame-Options`, and **no** `frame-ancestors` directive.

```
// daemon.ts line 5131-5133
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
res.end(content);
```

This is the exact opposite of the legacy `CoachServer.setCommonHeaders` (`src/server.ts`, lines 949–957), which explicitly blocks framing:

```
// server.ts line 952-956
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('Content-Security-Policy', "...frame-ancestors 'none';...");
```

**FACT:** The daemon's `serveIndex` serves from three candidate paths: `__dirname/../public/index.html`, `__dirname/../../src/public/index.html`, and `process.cwd()/src/public/index.html`. This is the same `index.html` used by the mobile browser interface.

**FACT:** The route policy for `/` and `/index.html` is `public` access in `remote-routes.ts` (line 16–17):
```typescript
{ methods: ['GET'], path: '/', access: 'public' },
{ methods: ['GET'], path: '/index.html', access: 'public' },
```

### 2. The daemon has full browser authentication infrastructure

**FACT:** `resolvePrincipal` (`src/control-plane/daemon.ts`, lines 5105–5119) resolves the HTTP principal from two sources:
- **Bearer token** → `{ kind: 'local-admin', authenticatedBy: 'bearer' }`
- **`sl_local` cookie** → `{ kind: 'local-admin', authenticatedBy: 'cookie' }`

**FACT:** The `/api/session` endpoint (`daemon.ts`, lines 1653–1668) exchanges a Bearer token for an `sl_local` cookie:
```typescript
const sessionToken = crypto.randomBytes(32).toString('base64url');
this.localSessions.set(this.hashSessionToken(sessionToken), Date.now() + 30 * 24 * 60 * 60 * 1000);
res.setHeader('Set-Cookie', `sl_local=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
```

**FACT:** The browser client (`src/public/index.html`, lines 2521–2522) extracts the token from the URL hash fragment and exchanges it for a cookie:
```javascript
const fragment = new URLSearchParams((location.hash || '').replace(/^#/, ''));
const bootstrapToken = fragment.get('token') || '';
// ...
const exchangeSession = async (adminToken) => {
  const response = await fetch('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
```

**FACT:** `copyMobileUrl` (`src/extension.ts`, lines 353–377) generates the URL `http://127.0.0.1:${port}/#token=${encodeURIComponent(token)}`, where `port` is the Control Plane daemon port (3100 by default). This is the existing "preview URL" mechanism.

### 3. The daemon has comprehensive SSE for real-time browser updates

**FACT:** `handleSseConnection` (`src/control-plane/daemon.ts`, lines 4117–4154) serves `/api/events` with:
- `hello` event: `{ connected: true, at: Date.now() }`
- `status` event: `redactForPrincipal(this.buildStatus(), principal)` (line 4136)
- `ai-health` event (line 4137)
- `execution` event (line 4144)
- `ai-alarm` events for local-admin only (lines 4138–4142)

**FACT:** `broadcast` (`daemon.ts`, line 4168) and `broadcastStatus` (`daemon.ts`, line 3772) push status updates to all connected SSE clients. The `sseClients` map tracks `{ principal, heartbeat }` per client (`daemon.ts`, line 362).

### 4. The daemon's `buildStatus` already returns stadium type info

**FACT:** `buildStatus` (`src/control-plane/daemon.ts`, lines 4224–4342) returns a comprehensive status object including:
```typescript
stadium: auth.session
  ? {
      stadiumId: auth.session.stadiumId,
      name: auth.session.name,
      platform: auth.session.platform,
      stadiumType: 'vscode-desktop'  // HARD-CODED
    }
  : {
      stadiumId: 'none',
      name: 'Local Control Plane',
      platform: process.platform,
      stadiumType: 'standalone'
    },
```

### 5. The daemon already has Codespaces/remote awareness

**FACT:** `extension.ts` line 199–200 passes `workspaceScheme` and `remoteName` to `StadiumClient`:
```typescript
workspaceScheme: vscode.workspace.workspaceFolders?.[0]?.uri.scheme,
remoteName: vscode.env.remoteName,
```

**FACT:** `game-files.ts` line 405 uses `environment.workspaceScheme` to distinguish local (`file:`) from remote/browser schemes:
```typescript
if ((environment.workspaceScheme ?? 'file') !== 'file') {
```

### 6. The browser UI is already responsive for multiple viewports

**FACT:** `src/public/index.html` line 5 includes a viewport meta tag:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

**FACT:** The HTML uses `clamp()` for responsive font sizes (line 80): `font-size: clamp(1.45rem, 7vw, 2rem)`

### 7. The `InProcessRemoteAdapter` already handles remote-device authentication

**FACT:** `InProcessRemoteAdapter` (`src/control-plane/remote-dispatch.ts`, lines 50–185) converts incoming relay frames into HTTP requests with a `remote-device` principal by verifying the `sl_dev` cookie against the `DeviceRegistry`.

**FACT:** `allowRefresh` for non-GET cookie/remote-device requests requires `Origin` header verification (`daemon.ts`, lines 1766–1773):
```typescript
const originMatches = principal.kind === 'remote-device'
  ? requestOriginMatchesExpected(req.headers.origin, principal.expectedOrigin)
  : requestOriginMatchesHost(req.headers.host, req.headers.host);
```

---

## THESIS VERDICT: **SUPPORTED WITH SMALL SEAM**

The thesis that "Browser Preview should be an environment-aware adapter over existing Game preview/server capabilities, not a new application architecture" is **strongly supported** by existing source. The Control Plane daemon already:

1. **Serves HTML without framing restrictions** — the `serveIndex` method has no CSP `frame-ancestors` or `X-Frame-Options`, making iframe embedding possible with zero changes.
2. **Has full browser auth** — Bearer token → session cookie exchange via `/api/session`.
3. **Has SSE real-time updates** — `handleSseConnection` pushes `status`, `execution`, `ai-health`, `ai-alarm` events.
4. **Has comprehensive game/stadium state** — `buildStatus` returns game identity, stadium info, players, capabilities, routing, reports, queue, etc.
5. **Has route policies** — default-deny with `public`/`local-only`/`remote-read`/`remote-mutate` access levels, easily extensible for a new preview route.
6. **Has Codespaces awareness** — `workspaceScheme` and `remoteName` are already collected.
7. **Has responsive design** — `index.html` already supports mobile/tablet/desktop viewports.

The **minimum missing seam** is:
1. A new daemon endpoint (e.g., `GET /preview/:gameId` or a query-parameter variant of `/`) that serves a **minimal viewport-constrained HTML page** (not the full mobile UI) suitable for embedding in an iframe, with `name` attributes on iframes to target specific viewport sizes.
2. A **stadiumType field in `StadiumHelloParams`** so the daemon can distinguish `vscode-web` (Codespaces browser VS Code) from `vscode-desktop`.
3. A **Game preview port registry** — a mechanism for the extension to register a Game's preview URL with the daemon.

---

## MINIMUM MISSING PIECES

### 1. StadiumType not transmitted over WebSocket protocol

**FACT:** `StadiumHelloParams` (`src/control-plane/protocol.ts`, lines 48–71) does NOT include a `stadiumType` field. The WebSocket handshake only transmits `protocolVersion`, `stadiumId`, `instanceId`, `name`, `platform`, `token`, `game`, `rootFsPath`, `controlPlaneBuildId`, `controlPlaneFreshness`, `extensionBuildId`, and `features`.

**INFERENCE:** Without `stadiumType` in the protocol, the daemon cannot distinguish a browser-hosted Stadium (Codespaces `vscode-web`) from a native VS Code Stadium (`vscode-desktop`). The `StadiumType` type exists in `game-identity.ts` (line 19) and `StadiumIdentity` interface (line 25) but is never used in the WebSocket handshake or `StadiumSession` (`stadium-registry.ts` lines 6–32).

**CONTRADICTION:** The `StadiumType` union `'vscode-web'` exists as a type (`game-identity.ts` line 19) and is referenced in the `StadiumIdentity` interface (line 25), but `getStadiumIdentity()` (`game-identity.ts`, lines 231–241) **always returns `stadiumType: 'vscode-desktop'`** — the `'vscode-web'` variant is defined as a type but never produced. The daemon's `buildStatus` (`daemon.ts`, line 4284) also hardcodes `stadiumType: 'vscode-desktop'`.

### 2. No Game preview port URL / registry

**FACT:** No existing code registers or discovers a Game's preview port or URL. The extension has no command to report a Game's localhost port to the daemon. The daemon has no `/api/game/:gameId/preview` route or similar.

**INFERENCE:** The daemon only proxies RPC to Stadiums via WebSocket (`sendRpcToStadium`, `daemon.ts` line 4069). There is no HTTP proxy to Game-specific localhost ports.

### 3. No minimal viewport-constrained preview page

**FACT:** `src/public/index.html` is a full 10,868-line browser application (mobile UI with report browsing, player roster, dispatch, health, etc.). There is no minimal HTML page suitable for a simple iframe preview.

**INFERENCE:** A new minimal preview page would need to be created — either a new `src/public/preview.html` or a parameterized variant of the existing `index.html` that strips the full UI and renders just the Game's URL in an `<iframe>`.

### 4. No multiple-view mechanism

**FACT:** There is no mechanism to open multiple viewport-sized windows (Desktop/Tablet/Phone) that all point at the same running Game. VS Code's `SimpleBrowser` / `WebViewPanel` APIs are not used anywhere (`extension.ts` grep for `openExternal|SimpleBrowser|WebViewPanel` returned 0 matches for `WebViewPanel`/`SimpleBrowser`).

**INFERENCE:** The multiple-view capability would need to be implemented either:
- In-browser via JavaScript that opens multiple `<iframe>` elements with viewport constraints
- Via VS Code's `vscode.env.openExternal` (not currently used, but available)

---

## REUSE MAP

| Existing Capability | Source | Reusable For Browser Preview? |
|---|---|---|
| **Daemon HTTP server** | `src/control-plane/daemon.ts`, line 1642 (`handleHttpRequest`) | ✅ Core entry point — serves HTML at `/` without framing restrictions |
| **Daemon `serveIndex`** | `daemon.ts`, line 5121 | ✅ Serves `index.html` without CSP — can be extended for a preview page variant |
| **Daemon `resolvePrincipal`** | `daemon.ts`, line 5105 | ✅ Bearer token + cookie auth — can be reused for preview access control |
| **`/api/session` cookie exchange** | `daemon.ts`, line 1653 | ✅ Exchange hash-fragment token for session cookie |
| **SSE `handleSseConnection`** | `daemon.ts`, line 4117 | ✅ Real-time status updates for preview |
| **`buildStatus`** | `daemon.ts`, line 4224 | ✅ Returns game/stadium info — can be extended with preview port |
| **`broadcast` / `broadcastStatus`** | `daemon.ts`, lines 4168, 3772 | ✅ Push status changes to preview windows |
| **Route policies** | `src/control-plane/remote-routes.ts` | ✅ Default-deny with `public`/`local-only`/`remote-read`/`remote-mutate` — new routes can be added here |
| **`copyMobileUrl`** | `src/extension.ts`, line 353 | ✅ Generates `http://127.0.0.1:${port}/#token=...` — can be extended for preview URLs |
| **`controlPlaneRecord`** | `launcher.ts` discovery | ✅ Provides daemon port for URL construction |
| **Browser responsive design** | `src/public/index.html`, line 5 | ✅ Existing viewport meta + `clamp()` for responsive layout |
| **Remote relay bootstrap** | `remote-bootstrap.ts` | ✅ Codespaces/remote port forwarding |
| **`InProcessRemoteAdapter`** | `remote-dispatch.ts` | ⚠️ Handles remote-device auth — preview would likely use `local-admin` principal instead |
| **CoachServer `setCommonHeaders`** | `server.ts`, line 949 | ❌ BLOCKS framing (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) — cannot be used for iframe-based preview |
| **`StadiumHelloParams`** | `protocol.ts`, line 48 | ⚠️ Missing `stadiumType` field — needs extension |
| **`StadiumSession`** | `stadium-registry.ts`, line 6 | ⚠️ Missing `stadiumType` field — needs extension |

---

## RISKS / BLOCKERS

### 1. StadiumType is not propagated through the protocol

**CONTRADICTION:** The `StadiumType` type includes `'vscode-web'` (for Codespaces browser VS Code), but:
- `getStadiumIdentity()` always returns `'vscode-desktop'` (`game-identity.ts` line 239)
- `StadiumHelloParams` does not include `stadiumType` (`protocol.ts` line 48)
- `StadiumSession` does not include `stadiumType` (`stadium-registry.ts` line 6)
- `buildStatus` hardcodes `stadiumType: 'vscode-desktop'` (`daemon.ts` line 4284)

**Impact:** Without knowing the Stadium type, the daemon cannot determine whether a Game is running in browser (Codespaces) or on native desktop, which affects what preview URL to construct.

### 2. CoachServer blocks framing while daemon does not

**FACT:** `CoachServer.setCommonHeaders` (`server.ts` line 949-957) sets `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`, making the CoachServer (port 49152) unsuitable for iframe-based preview. The daemon (port 3100) does NOT set these headers, making it suitable.

**INFERENCE:** Browser preview must use the daemon's HTTP server (port 3100), not the CoachServer (port 49152). This is actually beneficial since the daemon has more capabilities.

### 3. No Game preview port discovery

**UNKNOWN:** There is no mechanism for the extension to communicate a Game's preview port to the daemon. The extension knows the Game's workspace folder and could discover the preview port from `package.json` dev scripts or Vite/CRACO config, but no such integration exists.

### 4. Hash-fragment token in URL

**FACT:** `copyMobileUrl` puts the token in the URL hash fragment (`#token=...`) (`extension.ts` line 367). The browser client reads it client-side and exchanges it via `/api/session` (`index.html` line 2521-2522). This works for direct browser access but is unusual for programmatic iframe embedding.

**INFERENCE:** For iframe-based preview, the token would need to be passed differently (e.g., as a `?token=` query parameter or via a server-side session). The daemon's `handleHttpRequest` rejects URL token authentication (`daemon.ts` line 1648-1650):
```typescript
if (requestUrl.searchParams.has('token')) {
  this.sendJson(res, 401, { success: false, message: 'URL token authentication is not supported.' });
```

### 5. Remote device authentication requires pairing

**FACT:** Remote devices (phones accessing via relay) require pairing via QR code (`pairing.ts`) and device cookie (`sl_dev`) authentication. The `InProcessRemoteAdapter` (`remote-dispatch.ts` line 79) mints `remote-device` principals only for paired devices.

**INFERENCE:** For remote browser preview (e.g., accessing from a different machine via relay), the same pairing/authentication infrastructure would need to be reused. The `copyMobileUrl` token-based approach only works for local access.

---

## RECOMMENDED NEXT PLAY

### Phase 1: StadiumType propagation (smallest change, highest confidence)

1. **Add `stadiumType` to `StadiumHelloParams`** in `src/control-plane/protocol.ts` (line 48) — add optional `stadiumType?: StadiumType`
2. **Add `stadiumType` to `StadiumSession`** in `src/control-plane/stadium-registry.ts` (line 6) — add optional `stadiumType?: StadiumType`
3. **Send `stadiumType` from the Stadium client** in `src/stadium-client.ts` (line 510) — include `stadiumType` in the hello payload, derived from `process.env.TERM_PROGRAM` or `vscode.env.remoteName` detection
4. **Use `stadiumType` in `buildStatus`** in `src/control-plane/daemon.ts` (line 4284) — read from session instead of hardcoding `'vscode-desktop'`
5. **Fix `getStadiumIdentity()`** in `src/game-identity.ts` (line 239) — derive actual type instead of hardcoding

### Phase 2: Preview page and route (medium change)

1. **Create a minimal preview HTML page** — either a new `src/public/preview.html` or a parameterized variant served by a new daemon route (e.g., `GET /preview?gameId=...&viewport=desktop|tablet|phone`)
2. **Add route policy** in `src/control-plane/remote-routes.ts` — classify the preview route as `remote-read` (accessible from remote devices)
3. **Register the route** in `handleHttpRequest` (`daemon.ts`) — serve the preview page, reusing `serveIndex`'s path resolution logic

### Phase 3: Game preview port registry (larger change)

1. **Add a new daemon method** to register/retrieve a Game's preview URL/port — stored in `StadiumSession` or a new registry
2. **Add an extension-side registration** — when a Game is opened, the extension reports the preview port to the daemon via WebSocket RPC or HTTP API
3. **Add a proxy route** — `GET /api/games/:gameId/preview/*` that proxies HTTP requests to the Game's preview server

---

## IMPORTANT FILES / PATHS

| File | Lines | Relevance |
|---|---|---|
| `src/control-plane/daemon.ts` | 5121–5141 | `serveIndex` — serves HTML **without** framing restrictions (the key enabler) |
| `src/control-plane/daemon.ts` | 5105–5119 | `resolvePrincipal` — Bearer token + `sl_local` cookie auth |
| `src/control-plane/daemon.ts` | 1653–1668 | `/api/session` — token→cookie exchange |
| `src/control-plane/daemon.ts` | 4117–4154 | `handleSseConnection` — SSE at `/api/events` |
| `src/control-plane/daemon.ts` | 4224–4342 | `buildStatus` — returns game/stadium/routing state; hardcodes `stadiumType: 'vscode-desktop'` |
| `src/control-plane/daemon.ts` | 4168–4185 | `broadcast` — SSE event broadcast |
| `src/control-plane/daemon.ts` | 4197–4197 | `sendJson` — JSON response helper |
| `src/control-plane/remote-routes.ts` | 15–83 | `DAEMON_ROUTE_POLICIES` — default-deny route access levels |
| `src/control-plane/protocol.ts` | 48–71 | `StadiumHelloParams` — **missing `stadiumType`** |
| `src/control-plane/stadium-registry.ts` | 6–32 | `StadiumSession` — **missing `stadiumType`** |
| `src/control-plane/remote-dispatch.ts` | 50–185 | `InProcessRemoteAdapter` — remote-device auth |
| `src/game-identity.ts` | 19, 231–241 | `StadiumType` type exists; `getStadiumIdentity()` **always returns `'vscode-desktop'`** |
| `src/game-window-opener.ts` | 26–30 | `chooseOpenStrategy` — VS Code folder/window opening (no browser preview) |
| `src/extension.ts` | 353–377 | `copyMobileUrl` — generates `http://127.0.0.1:${port}/#token=...` |
| `src/extension.ts` | 199–200 | Passes `workspaceScheme` and `remoteName` to StadiumClient |
| `src/server.ts` | 949–957 | `setCommonHeaders` — **blocks framing** (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) |
| `src/server.ts` | 454–468 | `CoachServer.serveIndex` — serves `index.html` (port 49152, NOT used for preview) |
| `src/public/index.html` | 5, 2518–2525, 2976–2985 | Browser UI: viewport meta, hash-fragment token extraction, `/api/session` exchange |
| `src/stadium-client.ts` | 510–523 | WebSocket `stadium.hello` — **no `stadiumType`** field sent |
| `src/control-plane/launcher.ts` | 1–120 | `ensureControlPlaneRunning`, port discovery, `ControlPlaneDiscoveryRecord` |

---

## SCOUT LIMITATIONS

**UNKNOWN:** Whether the existing `copyMobileUrl` Bearer-token approach can be extended to support iframe-based preview with multiple viewport windows, or whether the token-in-hash-fragment pattern needs redesign for programmatic embedding.

**UNKNOWN:** Whether a Game's dev server preview URL can be discovered from within the extension (e.g., by reading `package.json` scripts), since no such integration currently exists.

**INFERENCE:** The CoachServer (port 49152) and ControlPlaneDaemon (port 3100) are separate HTTP servers with different security postures. Only the daemon is suitable for iframe-based preview. Whether the CoachServer should be deprecated in favor of the daemon for all browser access is an architectural decision beyond this scout's scope.

---

*Scout Agent: `sideline-scout` | Model: `openrouter/poolside/laguna-s-2.1:free` | Reconnaissance, not final architectural authority.*
