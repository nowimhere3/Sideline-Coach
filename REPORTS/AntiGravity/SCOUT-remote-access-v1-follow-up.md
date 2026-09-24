# SIDELINE COACH — REMOTE ACCESS V1 RECONNAISSANCE REPORT
## ARCHITECTURAL RECONNAISSANCE: SIDELINE-OWNED OUTBOUND PRODUCTION RELAY

**Scout Agent:** Anti-Gravity  
**Game Root:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Mode:** Scout / Read-Only Reconnaissance  
**Target:** Remote Access v1 (Sideline-Owned Outbound Relay Gateway & Security/Identity Model)  
**Date:** 2026-09-23  

---

# EXECUTIVE FINDING

1. **Strategic Architecture Baseline:**  
   * **Development / Temporary Bridge:** Local `ControlPlaneDaemon` (`127.0.0.1:3100`) → Cloudflare Tunnel → Phone. Useful for rapid manual verification of HTTP/SSE compatibility and prototype mobile UI testing.
   * **Target Production Architecture:** Sideline Desktop / VS Code Host → Outbound Secure Authenticated WebSocket Tunnel → **Sideline-Owned Relay / Gateway** → Public HTTPS/WSS Edge → Normal Phone Browser.
   * **Local Invariant:** Local Sideline services (`ControlPlaneDaemon` on 3100 and legacy `CoachServer` on 49152) **remain bound exclusively to loopback (`127.0.0.1`)**. No inbound open ports, no router NAT forwarding, and no local network exposure.
   * **Identity Separation:** GitHub / Sideline human identity is an authentication and host-pairing layer, completely decoupled from the transport mechanics.

2. **Core Reconnaissance Discovery:**  
   Building a **Sideline-Owned Outbound Relay** is dramatically simpler, more reliable, and lower-friction than managing third-party tunnels like Cloudflare in production:
   * **Zero External Binaries:** The repository already depends on `"ws": "^8.18.0"` (`package.json` line 150) and has rich WebSocket connection, backoff, and JSON-RPC infrastructure (`src/stadium-client.ts`). No 50MB `cloudflared` executable to download, supervise, or trigger OS antivirus warnings.
   * **Native SSE Streaming:** Cloudflare Quick Tunnels buffer responses and break Server-Sent Events (SSE). A Sideline-owned relay handles standard chunked HTTP/SSE streams natively across an outbound WebSocket connection without buffering or edge timeouts.
   * **Zero Networking Expertise for Dad:** Dad clicks "Enable Remote Access" in VS Code. The extension opens an outbound TLS connection to `wss://relay.sideline.live`. The phone visits `https://coach.sideline.live`, logs in with GitHub, and immediately reaches his active host. No domain purchases, no DNS configurations, no Cloudflare dashboard accounts.

---

# PROVEN CURRENT LOCAL TOPOLOGY

Against the actual repository source code, the distinction between the internal process architecture and the mobile-facing path is concrete:

```
[ PHONE BROWSER (Safari / Chrome) ]
      │
      │ 1. Public HTTPS (HTTP REST + Server-Sent Events /api/events)
      ▼
┌─────────────────────────────────────────────────────────────┐
│             Sideline-Owned Relay / Gateway                  │
│       (Public Edge: relay.sideline.live on Port 443)        │
│                                                             │
│  • Edge TLS Termination & GitHub OAuth Authentication       │
│  • Tenant Routing: Maps User ID & Host ID to Active Socket   │
│  • Protocol Multiplexing: HTTP/SSE <--> WebSocket Frames    │
└──────────────────────────────▲──────────────────────────────┘
                               │
                               │ 2. Outbound Secure WebSocket (WSS)
                               │    (Initiated FROM host to relay; NAT-traversing)
                               │
┌──────────────────────────────┴──────────────────────────────┐
│           Sideline Host (Desktop / VS Code)                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Remote Relay Client (Outbound Bridge)                 │  │
│  │  • Dispatches multiplexed frames to 127.0.0.1:3100    │  │
│  │  • Streams SSE event frames back to Relay             │  │
│  │  • Enforces route allowlist & timing-safe auth checks │  │
│  └───────────────────────────▲───────────────────────────┘  │
│                              │ Local Loopback HTTP          │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ControlPlaneDaemon (src/control-plane/daemon.ts)     │  │
│  │  • Bound exclusively to 127.0.0.1:3100                │  │
│  │  • Serves static UI: src/public/index.html            │  │
│  │  • Serves SSE: /api/events (activity, status, health) │  │
│  │  • Serves API: /api/dispatch, /api/reports, etc.      │  │
│  │  • Internal WS /stadium (JSON-RPC for StadiumClient)  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Seam Breakdown
1. **The Active Mobile Server is `ControlPlaneDaemon` (Port 3100):**  
   In `src/extension.ts` lines 347–358, `copyMobileUrl` resolves `controlPlaneRecord.port` (default 3100). `daemon.ts` lines 524–678 binds an HTTP server to `127.0.0.1:3100` that handles `GET /` (`serveIndex`), `GET /api/events` (`handleSseConnection`), and all REST endpoints.
2. **The Browser Uses Zero WebSockets:**  
   In `src/public/index.html`, there are **zero** WebSocket connections. All live streams (Live Player Terminal, AI Health, execution views) are delivered via Server-Sent Events (`EventSource('/api/events')`).
3. **The Internal Control Plane Seam (`/stadium`):**  
   `StadiumClient` (`src/stadium-client.ts`) connects to `ws://127.0.0.1:3100/stadium?token=...` solely for local extension-to-daemon JSON-RPC coordination. This is an internal seam that remote browsers must never touch.

---

# SIDELINE-OWNED OUTBOUND PRODUCTION RELAY

This section details the concrete architecture required for the Sideline-owned relay.

## 1. Persistent Host Connection & Multiplexing
* **Transport:** Outbound WebSocket over TLS (`wss://relay.sideline.live/tunnel/v1`).
* **Connection Initiator:** The Sideline Host (either within the VS Code Extension Host or the background `ControlPlaneDaemon`) initiates the connection outbound to the Relay. Because traffic is outbound over standard HTTPS port 443, it effortlessly traverses symmetric NATs, residential firewalls, and cellular networks without opening any local inbound ports.
* **Request/Response Multiplexing:** Over the single persistent WebSocket connection, individual HTTP transactions and streaming SSE connections are multiplexed using lightweight binary or JSON frames:
  ```typescript
  // Frame Types between Host and Relay:
  type RelayFrame =
    | { type: 'http-req'; reqId: string; method: string; path: string; headers: Record<string, string>; body?: string }
    | { type: 'http-res'; reqId: string; status: number; headers: Record<string, string>; body?: string }
    | { type: 'stream-open'; streamId: string; path: string; headers: Record<string, string> }
    | { type: 'stream-chunk'; streamId: string; chunk: string }
    | { type: 'stream-close'; streamId: string }
    | { type: 'heartbeat'; timestamp: number };
  ```
* **Host Dispatch:** When the host receives an `http-req` frame from the relay, it invokes the local endpoint on `http://127.0.0.1:3100` via loopback HTTP `fetch` (or directly calls the router), and sends the response back in an `http-res` frame.

## 2. SSE & Live-Stream Transport Across the Relay
* **The SSE Challenge:** Server-Sent Events are long-lived, unidirectional HTTP streaming connections. If proxied naively through intermediate buffers, chunks are held until buffers fill, destroying real-time terminal output.
* **Relay Streaming Behavior:**
  1. Phone browser requests `GET /api/events` against Relay.
  2. Relay establishes the HTTP response with headers:
     ```http
     HTTP/1.1 200 OK
     Content-Type: text/event-stream; charset=utf-8
     Cache-Control: no-cache, no-transform
     Connection: keep-alive
     X-Accel-Buffering: no
     ```
  3. Relay sends `{ type: 'stream-open', streamId: 's_1', path: '/api/events' }` over the host's WebSocket.
  4. Host connects to local `127.0.0.1:3100/api/events`. As chunks arrive from `daemon.ts`, host emits `{ type: 'stream-chunk', streamId: 's_1', chunk }`.
  5. Relay immediately flushes each chunk to the phone's HTTP response (`res.write(chunk)`).
* **Heartbeat & Keep-Alive:** The Relay or Host emits an SSE comment line (`: heartbeat\n\n`) every 15 seconds. This guarantees that mobile cellular carriers and cloud load balancers do not terminate the idle TCP connection.

## 3. Reconnect & Resilience Model
* **Host Loss & Backoff:** If the desktop host loses Wi-Fi or sleeps:
  * Outbound WS connection drops.
  * Host client initiates exponential backoff reconnects (1s, 2s, 5s, 10s, max 30s).
  * Relay detects socket closure, marks host state as `offline`, and immediately terminates any active SSE streams to the phone.
  * When the phone makes REST requests while the host is disconnected, the Relay returns `503 Service Unavailable` with a structured payload: `{ success: false, code: 'host_offline', message: 'Sideline host is currently sleeping or disconnected.' }`.
* **Phone Reconnect:** Native browser `EventSource` automatically reconnects when an SSE connection drops. Once the host reconnects to the relay, the phone's next `EventSource` retry succeeds, receiving the `hello` event and triggering `synchronizeAfterHello()` in `src/public/index.html`.

## 4. Multi-Tenant Relay Routing & Host Scoping
* **Relay State Architecture:** The relay is stateless regarding persistent disk storage, but maintains an in-memory routing table:
  ```
  RoutingTable: Map<UserId, Map<StadiumId, HostSocket>>
  ```
* **Clean Mobile URLs:** 
  * Avoid ugly URLs containing tokens or host UUIDs in the address bar.
  * When Dad visits `https://coach.sideline.live`:
    1. If unauthenticated, redirect to GitHub OAuth login.
    2. Once authenticated, Relay reads Dad's `githubUserId` from his session cookie.
    3. Relay looks up registered hosts for `githubUserId`.
    4. If Dad has exactly **one** active host: Relay binds the session to that host and serves the app.
    5. If Dad has **multiple** active hosts (e.g., "Work PC" and "Home Mac"): Relay serves a clean host picker screen ("Select Host") before routing.

---

# SECURITY & IDENTITY ARCHITECTURE

```
┌───────────────────┐                              ┌──────────────────────────┐
│   Phone Browser   │                              │  Desktop VS Code Host    │
└─────────┬─────────┘                              └────────────┬─────────────┘
          │                                                     │
          │ 1. GitHub OAuth Web Flow                            │ 1. VS Code Native GitHub Auth
          │    Identity: GitHub User #12345                     │    Identity: GitHub User #12345
          │                                                     │
          │                                                     │ 2. Outbound WSS Connect
          │                                                     │    Register: stadium_win32_xyz
          │                                                     │    Owner: GitHub User #12345
          │                  ┌───────────────────┐              │
          │                  │  Sideline Relay   │◄─────────────┘
          │                  │  (relay.sideline) │
          │                  └─────────┬─────────┘
          │                            │
          │ 3. Issues Secure Cookie    │ 4. Multiplexed Request/Response
          │    sideline_session=...    │    over Outbound Tunnel
          │    (Host-Scoped)           │
          ▼                            ▼
    [ Phone UI ] ────────────────► [ Local ControlPlaneDaemon (127.0.0.1:3100) ]
```

### 1. Human Identity: GitHub OAuth
* **Desktop Side:** Uses VS Code's native authentication API:
  `vscode.authentication.getSession('github', ['read:user'], { createIfNone: true })`.
  * Returns `session.account.id` (immutable numeric GitHub ID) and `session.account.label` (username).
  * Handled natively by VS Code's OS keychain integration; requires **zero client secrets** on the user's machine.
* **Phone Side:** Standard GitHub OAuth 2.0 Web Flow handled by the Relay (`/auth/github/login` → GitHub → `/auth/github/callback`).
* **Scope Discipline:** Request solely `read:user` (or empty scope `""`). Identity is established without requesting repository access (`repo`), org administration, or write permissions.

### 2. Host Identity & Ownership Binding
* **Host Identity:** Durable Stadium ID (`stadiumId`), already generated and stored at `~/.sideline/stadium-id` (`src/game-identity.ts` lines 189–217), format `stadium_<platform>_<uuid>`.
* **Ownership Binding:**
  * When the desktop connects to the relay, it sends a signed registration payload containing `{ stadiumId, ownerUserId: session.account.id, hostName: os.hostname() }`.
  * The Relay validates the host's identity and records that `stadiumId` is owned by `ownerUserId`.

### 3. Pairing & Session Authorization
* **Separation of Concerns:** Being authenticated as GitHub user `#12345` does not authorize access to any arbitrary host. The browser session must be paired to a specific `stadiumId`.
* **Pairing Experience (MVP):**
  * *Option A (Zero-Typing QR Code):* Desktop displays a QR code containing an ephemeral single-use pairing token: `https://coach.sideline.live/pair?t=xyz`. Dad scans it with his phone camera; the phone logs into GitHub once, and is paired to that desktop instantly.
  * *Option B (Account Lookup):* Dad opens `https://coach.sideline.live`, logs in with GitHub; the relay displays his registered online host ("David's Desktop") and allows him to pair.
* **Session Storage:** **Eliminate URL tokens and `sessionStorage`.** The relay sets an `httpOnly`, `Secure`, `SameSite=Lax` session cookie (`sideline_session`). 
* **URL Credentials:** URLs must never contain credentials. Query parameters are leaked across clipboard managers, browser histories, and server access logs. Ambient session cookies authenticate all requests, including SSE (`EventSource`).

### 4. Revocation Model (MVP)
* **Revoke One Device:** Desktop extension displays connected mobile sessions; Dad clicks "Disconnect Phone". The host instructs the relay to invalidate that session ID.
* **Revoke All Devices:** Desktop rotates its local `hostSessionSecret` or increments its `sessionEpoch`. All outstanding browser cookies immediately fail validation.
* **Emergency Kill Switch:** Dad clicks "Disable Remote Access" in VS Code. The desktop immediately drops the outbound WebSocket tunnel. The relay severs all browser connections within milliseconds.

### 5. Secrets & Redaction Boundaries
* **Strictly Forbidden from Remote Transport:**
  * OpenRouter API key stored in VS Code SecretStorage (`SCOUT_OPENROUTER_SECRET_KEY` in `src/scout-openrouter-credential.ts`).
  * Claude / Codex session cookies or token credentials.
  * Workspace `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*` files (strictly blocked by `isBlockedFile` in `src/game-files.ts`).
  * Control Plane shutdown endpoint (`POST /api/control-plane/shutdown` must be rejected from remote callers).
  * Direct OS process execution or arbitrary terminal spawning outside `coach.terminalAllowlist`.
* **Existing Boundaries to Preserve:**
  * `PlayerActivityNotice` structural allowlist and regex redaction (`src/player-activity.ts` lines 58–60).
  * Game Files exclusion rules (`src/game-files.ts` lines 92–115).
  * Boolean-only status responses for credentials (`src/scout-openrouter-credential.ts` line 23).
* **Identified Invariant Gap in Current Source:**
  * In `src/server.ts` line 803 and `src/control-plane/daemon.ts` line 1950, `/api/reports` returns raw markdown file content directly from disk. Reports currently do not pass through regex redaction. If an agent writes an API key into a report file, it is exposed over the API.

---

# THREAT MODEL FOR SIDELINE-OWNED RELAY

| Threat | Impact | Required MVP Mitigation |
| :--- | :--- | :--- |
| **Stolen Relay URL / Link Sharing** | Attacker accesses user's Sideline | No credentials in URLs. Visiting the public link without an authenticated GitHub session and valid paired cookie results in `401 Unauthorized`. |
| **Cross-User Host Routing Mistake** | User A routed to User B's desktop | Strict tenant isolation in relay memory: host sockets indexed by composite key `(userId, stadiumId)`. Request dispatch strictly validates cookie user ID matches host owner user ID. |
| **Compromised Relay Server** | Relay operator or attacker inspects traffic | Relay runs as minimal, stateless, ephemeral proxy; zero persistent logging of request/response bodies or report text; TLS termination with modern ciphers. |
| **Malicious Host Impersonation** | Rogue host claims another user's `stadiumId` | Relay validates host registration against authenticated GitHub OAuth token; users cannot bind hosts belonging to other GitHub IDs. |
| **Cross-Site Request Forgery (CSRF)** | Malicious website triggers `/api/dispatch` | Cookies set to `SameSite=Lax`; require custom application header (`X-Sideline-Action: 1`) on all mutating endpoints (`/api/dispatch`, `/api/route`). |
| **Cross-Site Scripting (XSS)** | Injected script in reports steals session | Session credentials stored in `httpOnly` cookies inaccessible to JavaScript; strict CSP header (`script-src 'self'`). |
| **Brute-Force Pairing Codes** | Attacker guesses 6-digit pairing code | Ephemeral pairing codes expire in 5 minutes and allow maximum 5 failed attempts per IP before lock-out. |
| **Dangling / Stale Host Connections** | Unattended desktop remains exposed | Inactivity timeout; closing VS Code or sleeping machine drops the outbound WebSocket tunnel immediately. |

---

# COMPARISON: PRODUCTION RELAY VS CLOUDFLARE BRIDGE

| Architectural Criterion | Dev Bridge: Cloudflare Tunnel | Target Production: Sideline-Owned Relay |
| :--- | :--- | :--- |
| **Primary Purpose** | Fast temporary developer testing & prototyping | Production end-user product architecture |
| **User Setup Friction** | High (Requires custom domain, Cloudflare Zero Trust account, CLI setup) | **Zero (One-click "Enable Remote Access" in VS Code; scan QR on phone)** |
| **Binary Footprint on Host** | Requires downloading & supervising 50MB `cloudflared` executable | **Zero (Uses pure Node.js and existing `ws` dependency in extension host)** |
| **SSE / Live Stream Support** | Broken on Quick Tunnels (buffered); requires custom DNS rules on Named Tunnels | **Native & transparent chunked streaming over multiplexed WebSocket** |
| **Local Host Binding** | Binds to loopback (`127.0.0.1`) | **Binds to loopback (`127.0.0.1`) via outbound-only connection** |
| **Tenant Routing & Pairing** | Tied to Cloudflare Access policies & email rules | **Native Sideline host picker, QR pairing, and GitHub identity pairing** |
| **Operational Burden** | Dependent on third-party vendor APIs, ingress rules, and quotas | **Simple, self-contained, lightweight Node.js/Go relay hosted on Fly.io/VPS** |

---

# SMALLEST CREDIBLE PRODUCTION MVP

The absolute smallest production-grade implementation consists of two compact components:

### 1. Sideline Host Bridge Client (`src/remote/relay-client.ts` ~180 lines)
* Placed inside the VS Code extension or `daemon.ts`.
* On activation (when `coach.remoteAccessEnabled` is true):
  1. Retrieves GitHub identity via `vscode.authentication.getSession('github', ['read:user'])`.
  2. Opens outbound WebSocket to `wss://relay.sideline.live/tunnel/host`.
  3. Registers: `{ stadiumId, ownerUserId: session.account.id }`.
  4. Listens for incoming `http-req` and `stream-open` frames.
  5. Dispatches requests to local `http://127.0.0.1:3100` and streams responses back over the WebSocket.
  6. Handles auto-reconnect with exponential backoff.

### 2. Sideline Relay Gateway Service (~350 lines of Node.js/TypeScript)
* Hosted on a minimal cloud container (e.g., Fly.io or Railway) with a public domain (`relay.sideline.live`).
* Implements:
  1. `GET /auth/github/*`: Standard GitHub OAuth login & callback.
  2. `WSS /tunnel/host`: Authenticated endpoint for outbound host connections.
  3. `GET /api/events`: Translates incoming browser SSE requests into `stream-open` frames, flushes incoming `stream-chunk` frames immediately, and sends `: heartbeat\n\n` comments every 15s.
  4. `ALL /*`: Translates browser HTTP fetch requests into `http-req` frames, awaits `http-res`, and returns response to phone.
  5. Issues `httpOnly`, `Secure` session cookies.

---

# PRODUCTION GATES

Before exposing remote access to production users, the following gates **MUST** be verified:

1. **Query-Token Elimination:** Remove `?token=` from URLs and SSE connections; replace with `httpOnly`, `Secure` session cookies.
2. **Timing-Safe Auth in Daemon:** Update `src/control-plane/daemon.ts` line 3758 to use `crypto.timingSafeEqual`.
3. **SSE Buffering & Heartbeats:** 
   * Ensure `X-Accel-Buffering: no` is set on all SSE streams.
   * Emit comment heartbeats (`: heartbeat\n\n`) every 15 seconds to prevent mobile edge drops.
4. **Strict Remote Route Blocking:** Explicitly forbid `/api/control-plane/shutdown` from being invoked across the relay.
5. **Mutation CSRF Headers:** Require an explicit custom header (e.g., `X-Sideline-Action: 1`) on all state-mutating requests (`/api/dispatch`, `/api/route`).
6. **Report Content Sanitization:** Verify that `GET /api/reports` does not return sensitive environment credentials or secrets written to disk.

---

# MVP VS LATER

### MUST HAVE FOR V1 (MVP)
* **Outbound Relay Gateway:** Simple Node.js relay server on Fly.io/Railway.
* **Native Host Client:** Lightweight outbound WebSocket client in Sideline using `ws`.
* **GitHub Identity Integration:** VS Code native session on desktop (`vscode.authentication`) + mobile OAuth web flow.
* **Host-Scoped Authorization:** Browser sessions tied strictly to Dad's GitHub ID and specific `stadiumId`.
* **Cookie-Based Auth:** Replace `?token=` with `httpOnly`, `Secure` cookies for both REST and SSE.
* **One-Click Revocation:** Desktop button to sever the tunnel and invalidate active sessions immediately.
* **SSE Robustness:** Non-buffering chunk transport with 15s keep-alive heartbeats.

### HARDEN LATER
* **End-to-End Encryption (E2EE):** WebCrypto browser-to-desktop encryption so the relay cannot inspect payloads.
* **Multi-Host Management UI:** Rich switcher for users running 5+ concurrent desktop machines.
* **Passkeys / WebAuthn:** Direct passkey authentication bypassing GitHub OAuth.
* **Read-Only Remote Mode:** Ability to lock phone sessions to report inspection only, preventing Play dispatch.

---

# ARCHITECT QUESTIONS (FOR OPUS)

1. **Host Client Process Placement:**  
   *Should the outbound relay client run inside the VS Code Extension Host process (`src/stadium-client.ts`), or inside the detached `ControlPlaneDaemon` process (`src/control-plane/daemon.ts`)?*  
   *(Tradeoff: In `daemon.ts`, phone access survives VS Code window reloads and crashes; in Extension Host, it has direct access to `vscode.authentication` and secret storage).*
2. **First-Run Pairing Paradigm:**  
   *Should the primary pairing flow rely on a scanned QR code with a 5-minute single-use pairing token, or a pure GitHub account match (where logging in on the phone automatically displays all online hosts owned by that GitHub ID)?*
3. **Relay Multiplexing Protocol:**  
   *Should the outbound WebSocket protocol use simple JSON message envelopes with Base64 payloads for binary data, or lightweight binary framing (e.g., MessagePack or custom binary header prefix)?*
4. **Report Redaction Policy:**  
   *Should report content returned by `GET /api/reports` pass through the same regex secret redaction currently applied to terminal streaming in `src/player-activity.ts`, or remain verbatim?*

---

# SOURCE DISCIPLINE & EVIDENCE CITATIONS

| Major Conclusion | Classification | Source / Citation |
| :--- | :--- | :--- |
| `ControlPlaneDaemon` serves `index.html`, `/api/events`, and API on port 3100 | **REPO FACT** | `src/control-plane/daemon.ts` lines 524, 678, 1101, 1118; `src/extension.ts` lines 347–358 |
| Phone browser never connects to a WebSocket | **REPO FACT** | `src/public/index.html` (0 occurrences of WebSocket; uses `EventSource` on line 5826) |
| Repo has direct dependency on `ws` | **REPO FACT** | `package.json` line 150 (`"ws": "^8.18.0"`) |
| `stadiumId` is durable host identifier stored at `~/.sideline/stadium-id` | **REPO FACT** | `src/game-identity.ts` lines 189–217 |
| Cloudflare Quick Tunnels buffer responses and do NOT support SSE | **OFFICIAL EXTERNAL FACT** | [Cloudflare Tunnel Documentation - Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) |
| VS Code provides zero-config GitHub identity without client secrets | **OFFICIAL EXTERNAL FACT** | [VS Code API: `vscode.authentication.getSession`](https://code.visualstudio.com/api/references/vscode-api#authentication) |
| Daemon SSE endpoint lacks `X-Accel-Buffering` and comment heartbeats | **REPO FACT** | `src/control-plane/daemon.ts` lines 3192–3215 |
| Outbound Relay is superior to Cloudflare for Sideline MVP | **INFERENCE** | Synthesized from zero-binary dependency, native SSE support, and zero-domain requirement. |
| Placement of relay client (Extension Host vs Daemon) | **ARCHITECT DECISION REQUIRED** | Architecture decision for Opus based on lifecycle and secret access tradeoffs. |
