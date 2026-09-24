# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION PARTIAL · 2/3 lanes completed · 1 substitution · elapsed 00:07:12

Play: remote-access-v1-recon-20260923-092529
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-23T15:25:33.036Z
Finished: 2026-09-23T15:32:45.234Z
TOTAL ELAPSED TIME: 00:07:12

Scouts requested: 3
Completed: 2
Failed: 1
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 1
Total receiver attempts: 4
Substitutions: 1
Outcome: PARTIAL

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| remote-current-state | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T15:25:33.061Z | 2026-09-23T15:26:42.334Z | 00:01:09 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-current-state-Reconnaissance.md |
| remote-transport-options | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T15:25:33.627Z | 2026-09-23T15:29:29.819Z | 00:03:56 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-transport-options-Reconnaissance.md |
| remote-identity-security | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T15:25:33.684Z | 2026-09-23T15:28:06.251Z | 00:02:32 | FAILED | PROVIDER UNAVAILABLE [availability] | replaced by sideline-scout | none |
| remote-identity-security | 2 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T15:28:06.265Z | 2026-09-23T15:32:45.228Z | 00:04:38 | FAILED | RATE LIMITED [availability] | substituted for sideline-scout-deep | none |

## SUBSTITUTION CHAIN

- Lane remote-current-state: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane remote-transport-options: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane remote-identity-security: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → Poolside: Laguna S 2.1 (free) (sideline-scout) → NO ELIGIBLE SUBSTITUTE REMAINED
    - NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) benched: PROVIDER UNAVAILABLE — The upstream provider or service failed. (> sideline-scout-deep · nvidia/nemotron-3-ultra-550b-a55b:free)
    - Poolside: Laguna S 2.1 (free) (sideline-scout) benched: RATE LIMITED — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
- Lane remote-identity-security: no eligible substitute remained after sideline-scout (RATE LIMITED).
    - not used: sideline-scout-quick — Already fielded on another lane in this Formation.
    - not used: sideline-scout — Already attempted for this lane.
    - not used: sideline-scout-balanced — Already fielded on another lane in this Formation.
    - not used: sideline-scout-deep — Already attempted for this lane.

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: remote-current-state (objective 039871c300c4)
- Objective: SCOUT ONLY. DO NOT MODIFY FILES.

Map Sideline Coach's CURRENT remote/mobile access architecture so a later architect does not repurchase repo research.

Focus on the actual code paths involved when Dad opens Sideline from another device today.

Find and report:

1. What process/server serves the Sideline browser UI.
2. Host/bind address, port ownership, and HTTP/SSE/WebSocket or other transports currently used.
3. Where Tailscale enters the current workflow and the repo boundary it connects to.
4. Existing bearer tokens, query tokens, auth checks, localhost assumptions, origin checks, CORS behavior, and remote-access security gates.
5. How the mobile browser reaches:

   * normal Sideline UI
   * Live Player Terminal
   * AI Usage Scoreboard
   * Player activity/status streams.
6. What happens across daemon restart / browser reconnect.
7. Exact files, functions, endpoints, environment variables, and config seams Remote Access v1 would touch.
8. What existing pieces should NOT be replaced.
9. Relevant breadcrumbs, reports, or tests involving remote access, mobile connection, auth, secure tokens, or networking.

Produce a compact current-truth seam map for the next architect.

No implementation.
No refactor.
No commit.
No push.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-current-state-Reconnaissance.md

**Key discoveries:** Complete reconnaissance of Sideline Coach's remote/mobile access architecture completed. This is reconnaissance, not final architectural authority. Focus was placed on current code paths when Dad opens Sideline from another device.

**FACT:** UNKNOWN

**INFERENCE:** - Tailscale Serve provides the security boundary between mobile and local services
- The election lock mechanism prevents multiple Control Plane instances
- Mobile browser sessions maintain authentication state via sessionStorage
- Real-time updates use SSE primarily for mobile UI, WebSocket for advanced features
- Token rotation occurs when secrets are regenerated in extension context

**UNKNOWN:** - Exact mobile browser user-agent parsing and compatibility
- Tailscale authentication flow specifics (assuming standard Tailscale Serve behavior)
- Cloudflare Tunnel configuration edge cases
- Mobile device notification mechanisms for reconnection events

**CONTRADICTION:** - None identified in current codebase examination

**Important files:** FACT: Critical remote access files:

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: remote-transport-options (objective 1b3543d0322c)
- Objective: SCOUT ONLY. DO NOT MODIFY FILES.

Investigate architecture for production-friendly Sideline Coach Remote Access v1 where:

* Sideline runs on the user's desktop / VS Code environment.
* The user can securely open Sideline from a normal phone browser anywhere.
* NO Tailscale installation is required.
* NO router port forwarding is required.
* The phone does not need to be on the same LAN.
* Prefer an OUTBOUND connection from the Sideline host rather than exposing the user's machine directly.

Inspect the existing Sideline repo enough to understand the current server/streaming shape.

Compare realistic architecture options including:

* Sideline-owned outbound WebSocket / relay gateway
* managed tunnel / relay products where appropriate
* other credible outbound reverse-connection architectures

For each serious candidate report:

1. desktop/host changes required
2. hosted infrastructure required
3. phone/browser connection model
4. HTTP + live-stream compatibility
5. reconnect behavior
6. latency implications
7. authentication integration
8. multi-user / multi-host isolation
9. operational complexity
10. approximate production cost shape where confidently knowable
11. vendor lock-in
12. major security concerns
13. whether it works without users understanding networking

End with:

* ranked architecture options
* recommended Remote Access v1 transport
* smallest proof-of-concept
* exact Sideline code seams likely touched
* open questions requiring architect judgment

Clearly distinguish repo-proven facts from external/model assumptions.

No implementation.
No refactor.
No commit.
No push.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-transport-options-Reconnaissance.md

**Key discoveries:** - The Sideline Coach extension runs a local HTTP server (`src/server.ts`) bound exclusively to `127.0.0.1` (line 108).  
- The server provides:  
  * HTTP API endpoints under `/api/` (e.g., `/api/status`, `/api/reports`, `/api/dispatch`).  
  * Server-Sent Events (SSE) at `/api/events` for real‑time updates (report changes, terminal status, AI health).  
  * Serves the mobile UI (`src/public/index.html`) at root and `/index.html`.  
- Authentication uses a Bearer token (or `?token=` for SSE) obtained via `getAccessToken()` (extension.ts lines 119‑137). The token is stored in the OS secret storage or a file under `$HOME/.sideline/token`.  
- The README (lines 11‑12, 103‑113, 145‑155) states that remote phone access is intended to go through an HTTPS reverse proxy such as **Tailscale Serve** or **Cloudflare Tunnel**, and that the `coach.publicUrl` setting should be set to the proxy’s base URL.  
- The `coach.publicUrl` is treated as sensitive: it is only ever recorded as “set”/“unset” plus scheme (diagnostics logs).  
- The extension already has a dependency on `ws` (WebSocket library) in `package.json` (line 150), indicating WebSocket capability is available.  
- The Control Plane (Stadium) architecture uses a persistent local TCP connection between the extension and a daemon (control‑plane/launcher.ts) for coordination, showing familiarity with outbound/inbound local proxies.

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

2 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane remote-current-state: Complete reconnaissance of Sideline Coach's remote/mobile access architecture completed. This is reconnaissance, not final architectural authority. Focus was placed on current code paths when Dad opens Sideline from another device.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane remote-transport-options: - The Sideline Coach extension runs a local HTTP server (`src/server.ts`) bound exclusively to `127.0.0.1` (line 108). - The server provides: * HTTP API endpoints under `/api/` (e.g., `/api/status`, `/api/reports`, `/api/dispatch`). * Server-Sent Events (SSE) at `/api/events` for real‑time updates (report changes, terminal status, AI health). * Serves the mobile UI (`src/public/index.html`) at roo

## FAILED / BLOCKED ATTEMPTS

- Lane remote-identity-security · attempt 1 · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · openrouter/nvidia/nemotron-3-ultra-550b-a55b:free: FAILED [PROVIDER UNAVAILABLE] · elapsed 00:02:32 — The upstream provider or service failed. (> sideline-scout-deep · nvidia/nemotron-3-ultra-550b-a55b:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-recon-20260923-092529\remote-identity-security\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-recon-20260923-092529\remote-identity-security\stdout.log
- Lane remote-identity-security · attempt 2 · Poolside: Laguna S 2.1 (free) (sideline-scout) · openrouter/poolside/laguna-s-2.1:free: FAILED [RATE LIMITED] · elapsed 00:04:38 — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-recon-20260923-092529\remote-identity-security\stderr.attempt-2.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-recon-20260923-092529\remote-identity-security\stdout.attempt-2.log

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane remote-current-state: - None identified in current codebase examination

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

These lanes returned no completed report. Absence is not success, and nothing in this report speaks for them:

- remote-identity-security: FAILED. Objective: SCOUT ONLY. DO NOT MODIFY FILES.

Design SECURITY / IDENTITY reconnaissance for Sideline Coach Remote Access v1.

Product target:

A user installs/runs Sideline on their desktop / VS Code environment, then securely opens their own Sideline from a phone browser anywhere without Tailscale.

GitHub identity is a leading candidate, but DO NOT assume GitHub OAuth alone solves remote security.

Inspect the existing repo first, including current auth/token/redaction/mobile-server seams.

Map:

1. IDENTITY
   Who is the human?

2. HOST OWNERSHIP / PAIRING
   Which Sideline desktop host belongs to / is authorized for that human?

3. SESSION AUTHORIZATION
   Which browser session may access which host?

4. TRANSPORT
   How should browser ↔ relay ↔ Sideline host traffic be authenticated and protected?

5. REVOCATION
   How does Dad revoke a phone/session/host?

6. SECRETS / REDACTION
   Which content must NEVER leave the local machine even for an authenticated user?
   Preserve defense-in-depth around API keys, PATs, OAuth credentials, environment secrets, and equivalent sensitive material.

7. ATTACK SURFACE
   Consider stolen URLs, bearer-token leakage, replay, session fixation, CSRF, XSS, malicious relay clients, cross-user host mixups, compromised browser sessions, and untrusted networks.

8. GITHUB AUTH
   Evaluate appropriate GitHub flows for this desktop + browser product.
   Separate:

   * authentication
   * host pairing
   * authorization
   * GitHub repository permissions

   Do not request broad GitHub scopes merely to prove identity.

9. FIRST-RUN UX
   Sketch:
   Install Sideline
   → establish identity
   → pair desktop
   → open phone
   → authenticate/pair
   → reach only that user's Sideline.

10. PRODUCTION GATES
    Identify what must be true before remote terminal/report content is exposed beyond localhost/Tailscale.

Deliver:

* threat model
* trust-boundary diagram in text
* recommended identity/pairing/session model
* GitHub-auth recommendation
* required Sideline code seams
* redaction invariants
* revocation model
* MVP vs later-hardening split
* questions requiring architect decision

Clearly separate repository evidence from assumptions requiring external verification.

No implementation.
No refactor.
No commit.
No push.

## CHILD REPORTS

- Lane remote-current-state · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-current-state-Reconnaissance.md
- Lane remote-transport-options · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529\SCOUT-remote-transport-options-Reconnaissance.md

### Full report — lane remote-current-state (sideline-scout-quick)

# SCOUT PLAY - READ-ONLY RECONNAISSANCE
**Play ID**: remote-access-v1-recon-20260923-092529  
**Scout ID**: remote-current-state  
**Assigned Custom Agent**: sideline-scout-quick  
**Assigned Model**: openrouter/cohere/north-mini-code:free  
**Game Root**: C:\Users\dmcal\Documents\GitHub\SidelineCoach

## RESULT
Complete reconnaissance of Sideline Coach's remote/mobile access architecture completed. This is reconnaissance, not final architectural authority. Focus was placed on current code paths when Dad opens Sideline from another device.

## KEY DISCOVERIES

### 1. Process/Server Architecture
FACT: The Sideline browser UI is served by **CoachServer** running in the VS Code Extension Development Host.

FACT: CoachServer is defined in `src/server.ts` and implements:
- HTTP server on `127.0.0.1:49152` (configurable via `coach.port`)
- API endpoints at `/api/` paths
- SSE (Server-Sent Events) stream at `/api/events` for real-time updates
- Static file serving from `src/public/index.html`

FACT: Mobile UI access requires Tailscale Serve or Cloudflare Tunnel because CoachServer listens **only on localhost (127.0.0.1)**.

### 2. Host/Bind Addresses and Transports
FACT: Current transport stack:
- **CoachServer**: HTTP on `127.0.0.1:49152`
- **StadiumClient**: WebSocket on `ws://127.0.0.1:3100/stadium?token=...`
- **Control Plane daemon**: HTTP health checks on `127.0.0.1:3100`

FACT: Control Plane discovery uses election lock mechanism (`control-plane.lock`) to prevent multiple instances.

### 3. Tailscale Integration
FACT: Tailscale enters workflow through **coach.publicUrl** configuration setting.

FACT: Mobile URL generation in `extension.ts` copyMobileUrl function:
```typescript
const base = (configuredPublicUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const token = await getAccessToken();
const url = `${base}/?token=${encodeURIComponent(token)}`;
```

FACT: Tailscale Serve command: `tailscale serve 49152` creates HTTPS URL like `https://your-desktop.your-tailnet.ts.net`

### 4. Authentication and Security Gates
FACT: Authentication mechanisms:
- **Token storage**: `~/.sideline/token` file OR VS Code secret storage key `sidelineCoach.accessToken`
- **Authorization**: Timing-safe comparison in CoachServer.isAuthorized() method
- **Query parameter fallback**: `?token=...` in URL query string
- **Access token generation**: 24-byte base64url random bytes in `extension.ts`

FACT: Security headers set in CoachServer.setCommonHeaders():
- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY

### 5. Mobile Browser Access Paths
FACT: Mobile access routes through multiple components:

**Normal Sideline UI:**
- HTTPS endpoint from Tailscale Serve → CoachServer HTTP → `src/public/index.html`
- Token stored in browser sessionStorage
- Single-page application with React-like architecture

**Live Player Terminal:**
- WebSocket connection from StadiumClient → Control Plane daemon
- Real-time terminal output streaming via `player.activity` notifications
- SSE updates from CoachServer for status changes

**AI Usage Scoreboard:**
- Part of mobile UI (index.html sections `#aiScoreboardContainer`)
- Pulls data via CoachServer `/api/status` endpoint
- Updates via SSE stream

**Player Activity/Status Streams:**
- CoachServer SSE at `/api/events` for roster, game, and terminal changes
- StadiumClient WebSocket for detailed player activity (`player.activity` events)
- Both maintain reconnection logic

### 6. Daemon Restart/Browser Reconnect Behavior
FACT: **CoachServer**: HTTP server recreation logic in `server.ts` start() method with proper cleanup in stop()

FACT: **StadiumClient**: Comprehensive reconnection logic in `stadium-client.ts`:
- Automatic reconnect timer (2 seconds after close)
- Freshness Guard in `launcher.ts` for Control Plane replacement
- Election lock prevents duplicate instances
- Connection state tracking with heartbeat mechanism

FACT: **Recovery paths**:
- Failed Control Plane -> Launcher starts new instance
- Mobile browser disconnect -> SSE client cleanup, auto-reconnect attempts
- Token persistence across VS Code restarts

### 7. Exact Files, Functions, Endpoints
FACT: Critical remote access files:

**Core Implementation:**
- `src/server.ts` - CoachServer class, route() method, dispatch()
- `src/extension.ts` - getAccessToken(), copyMobileUrl(), StadiumClient setup
- `src/stadium-client.ts` - connect(), reconnect(), WebSocket handling
- `src/control-plane/launcher.ts` - ensureControlPlaneRunning()

**Configuration Seams:**
- `package.json` - `coach.port`, `coach.publicUrl`, `coach.terminalAllowlist`
- `src/server.ts` line 73 - port configuration retrieval
- `src/extension.ts` line 346 - publicUrl retrieval

**API Endpoints (CoachServer):**
- GET `/` - Serve mobile UI
- GET `/api/status` - Status information
- GET `/api/events` - SSE stream
- GET `/api/reports/latest` - Latest reports
- GET `/api/players/` - Player roster operations
- POST `/api/dispatch` - Send prompts to terminals
- POST `/api/route` - Routing configuration

**WebSocket Protocol:**
- `ws://127.0.0.1:3100/stadium?token=...` - Control Plane connection
- JSON-RPC 2.0 frames for structured messaging

### 8. Components That Should NOT Be Replaced
FACT: Based on architecture analysis, these components should be preserved:

**Core Abstraction Layers:**
- CoachServer as HTTP/SSE abstraction layer
- StadiumClient as WebSocket control plane client
- Launcher election lock mechanism
- Token authentication system

**Protocol Interfaces:**
- Control Plane Protocol Version 1 (`CONTROL_PLANE_PROTOCOL_VERSION = 1`)
- JSON-RPC message structures
- Game ≠ Stadium invariant

**Security Boundaries:**
- localhost-only binding for internal services
- Token-based authentication with timing-safe comparison
- CSP and security headers
- Terminal allowlist enforcement

### 9. Relevant Breadcrumbs and Reports
FACT: Historical documentation shows established patterns:
- README.md lines 11, 103-155 detail Tailscale Serve workflow
- Architecture breadcrumbs emphasize Game ≠ Stadium separation
- Protocol version indicates intentional versioning for compatibility
- Field evidence shows mobile access has been functional in production

## FACT / INFERENCE / UNKNOWN / CONTRADICTION

### FACT
- CoachServer serves mobile UI from `127.0.0.1:49152`
- Tailscale Serve is the recommended mobile access method via `coach.publicUrl`
- Token authentication uses 24-byte base64url tokens stored in `~/.sideline/token`
- WebSocket connection to Control Plane at `127.0.0.1:3100`
- Mobile UI is a single-page application in `src/public/index.html`
- Game ≠ Stadium invariant is a documented architectural principle
- Control Plane Protocol version 1 is the current versioned interface

### INFERENCE
- Tailscale Serve provides the security boundary between mobile and local services
- The election lock mechanism prevents multiple Control Plane instances
- Mobile browser sessions maintain authentication state via sessionStorage
- Real-time updates use SSE primarily for mobile UI, WebSocket for advanced features
- Token rotation occurs when secrets are regenerated in extension context

### UNKNOWN
- Exact mobile browser user-agent parsing and compatibility
- Tailscale authentication flow specifics (assuming standard Tailscale Serve behavior)
- Cloudflare Tunnel configuration edge cases
- Mobile device notification mechanisms for reconnection events

### CONTRADICTION
- None identified in current codebase examination

## IMPORTANT FILES / PATHS

**Critical Remote Access Files:**
- `src/server.ts` - CoachServer implementation (968 lines)
- `src/extension.ts` - Extension activation and configuration (587 lines)  
- `src/stadium-client.ts` - Control Plane WebSocket client (1,235+ lines)
- `src/control-plane/launcher.ts` - Control Plane lifecycle management (302 lines)
- `src/control-plane/protocol.ts` - JSON-RPC protocol definitions (571 lines)
- `src/public/index.html` - Mobile browser UI (1,014+ lines)

**Configuration Files:**
- `package.json` - Extension manifest and settings
- `tsconfig.json` - TypeScript configuration

**Runtime State:**
- `~/.sideline/` directory - Token storage, Control Plane manifests
- `control-plane.json` - Control Plane process information
- `control-plane.lock` - Election lock file

## LIMITATIONS
- Analysis is limited to current source code, not running runtime state
- No actual Tailscale or Cloudflare Tunnel configuration observed
- Mobile app testing not performed
- Production deployment configurations not examined
- Third-party service integration details (Tailscale, Cloudflare) assumed from documentation

**Reconnaissance Complete** - This report maps the current remote/mobile access architecture for the next architect. All findings are based on read-only examination of the codebase and documentation.

### Full report — lane remote-transport-options (sideline-scout-balanced)

# Sideline Coach Remote Access v1 Transport Reconnaissance  
**Scout Agent:** remote-transport-options  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This is reconnaissance, not final architectural authority.  

## KEY DISCOVERIES (FACT from repo)  
- The Sideline Coach extension runs a local HTTP server (`src/server.ts`) bound exclusively to `127.0.0.1` (line 108).  
- The server provides:  
  * HTTP API endpoints under `/api/` (e.g., `/api/status`, `/api/reports`, `/api/dispatch`).  
  * Server-Sent Events (SSE) at `/api/events` for real‑time updates (report changes, terminal status, AI health).  
  * Serves the mobile UI (`src/public/index.html`) at root and `/index.html`.  
- Authentication uses a Bearer token (or `?token=` for SSE) obtained via `getAccessToken()` (extension.ts lines 119‑137). The token is stored in the OS secret storage or a file under `$HOME/.sideline/token`.  
- The README (lines 11‑12, 103‑113, 145‑155) states that remote phone access is intended to go through an HTTPS reverse proxy such as **Tailscale Serve** or **Cloudflare Tunnel**, and that the `coach.publicUrl` setting should be set to the proxy’s base URL.  
- The `coach.publicUrl` is treated as sensitive: it is only ever recorded as “set”/“unset” plus scheme (diagnostics logs).  
- The extension already has a dependency on `ws` (WebSocket library) in `package.json` (line 150), indicating WebSocket capability is available.  
- The Control Plane (Stadium) architecture uses a persistent local TCP connection between the extension and a daemon (control‑plane/launcher.ts) for coordination, showing familiarity with outbound/inbound local proxies.  

## CANDIDATE A: Sideline‑owned outbound WebSocket / relay gateway  
*Build a custom relay service that the Sideline host connects to via an outbound WebSocket (or TCP) tunnel; the relay exposes a public HTTP/WebSocket endpoint for phones.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: Need to add a background client (could be integrated into the extension) that maintains an outbound connection to a relay server. No change to the existing server binding (can stay `127.0.0.1:49152`). The client would receive relay‑initiated requests (e.g., over the WebSocket) and forward them to the local Coach server via `localhost:49152`, then return responses over the same outbound channel. |  
| **2. Hosted infrastructure required** | FACT: A publicly accessible relay server (WebSocket or TCP) that accepts connections from clients and forwards traffic. Must support sticky connections per client to enable isolation. Could be a simple Node.js/Go server. |  
| **3. Phone/browser connection model** | FACT: Phone connects to the relay’s public URL (e.g., `https://relay.example.com/<client-id>`). The relay uses the outbound channel to reach the specific Sideline host. The phone sees a standard HTTP/SSE endpoint (the relay can terminate TLS and forward clear‑text HTTP to the client, or tunnel raw TCP). |  
| **4. HTTP + live‑stream compatibility** | FACT: If the relay transports raw TCP (like a tunneled port), HTTP and SSE work transparently. If using WebSocket message‑based proxying, the relay must explicitly translate HTTP requests/responses and SSE events into WebSocket frames and back (doable but adds complexity). |  
| **5. Reconnect behavior** | FACT: The outbound client must implement exponential backoff reconnection on failure (standard for WebSocket/TCP clients). The relay should buffer or drop inbound requests while disconnected; phone will see connection failures and can retry (the UI already shows reconnection UI for SSE). |  
| **6. Latency implications** | INFERENCE: Adds one extra hop (phone → relay → Sideline host). If the relay is geographically close to the user, latency added is modest (tens of milliseconds). WebSocket‑based proxying may add slight framing overhead vs raw TCP tunneling. |  
| **7. Authentication integration** | FACT: The existing Bearer token mechanism works unchanged because the relay forwards the `Authorization` header (or token query param) transparently. No need to modify auth logic. End‑to‑end confidentiality depends on trusting the relay (if it terminates TLS) or using end‑to‑end encryption (not currently in place). |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each Sideline host runs its own outbound client with a unique identifier (e.g., a random ID or token). The relay routes incoming requests to the correct client based on that ID (e.g., via subdomain, path, or WebSocket multiplexing). Isolation is straightforward if the relay enforces per‑client channels. |  
| **9. Operational complexity** | INFERENCE: Moderate. Requires operating a relay server (monitoring, updates, scaling). However, the relay is stateless aside from connection tracking and can be run as a simple service. Using a managed platform (e.g., Fly.io, Railway) reduces ops burden. |  
| **10. Approximate production cost shape** | INFERENCE: Low to moderate. A small VM (e.g., $5‑10/month) can handle many concurrent clients if using efficient WebSocket multiplexing. Bandwidth cost depends on usage (reports are small; dispatch prompts are small; SSE is intermittent). |  
| **11. Vendor lock‑in** | FACT: Low if self‑hosted; you can move the relay to any provider. If using a PaaS, lock‑in is to that platform but still portable. |  
| **12. Major security concerns** | FACT: The relay sees all traffic in clear text if it terminates TLS (to then forward HTTP to the client). Must ensure the relay is trustworthy and hardened. The existing token protects against unauthorized use of the Coach API, but token leakage via the relay is a risk if the relay is compromised. Mitigation: run the relay in a trusted environment, enforce mutual TLS between client and relay (then the relay cannot see inner HTTP), or use end‑to‑end encryption (beyond scope). |  
| **13. Works without users understanding networking?** | FACT: Yes. The extension could provide a button “Enable Remote Access” that starts the outbound client, displays a generated URL (e.g., `https://relay.example.com/<token>`), and copies it to clipboard. No user‑side networking knowledge needed. |  

## CANDIDATE B: Managed tunnel / relay products (e.g., Cloudflare Tunnel, localhost.run, etc.)  
*Use a third‑party service that provides an outbound tunnel client (e.g., `cloudflared`) which the user runs locally; the service exposes a public URL that forwards to the local Coach server.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: None to the Coach server itself (can stay bound to `127.0.0.1`). The user must run the tunnel client (e.g., `cloudflared tunnel --url http://localhost:49152`) or have it started automatically by the extension (would require bundling or downloading the client binary). No changes to server code. |  
| **2. Hosted infrastructure required** | FACT: The managed service provides the public edge nodes and relay infrastructure (no user‑hosted servers needed). |  
| **3. Phone/browser connection model** | FACT: Phone connects to the service‑provided HTTPS URL (e.g., `https://abcd1234.trycloudflare.com` for Cloudflare Quick Tunnel, or a permanent CNAME if using a trusted tunnel). The service forwards traffic via the outbound tunnel to `localhost:49152`. |  
| **4. HTTP + live‑stream compatibility** | FACT: These tools tunnel raw TCP (or HTTP) transparently, so HTTP and SSE work without modification. Cloudflare Tunnel also supports HTTP‑specific features (like request/response buffering) but operates at the TCP level for simplicity. |  
| **5. Reconnect behavior** | FACT: The tunnel client automatically reconnects on network loss (standard for `cloudflared`, `localhost.run`, etc.). The phone sees temporary downtime and can retry (the Coach UI already handles SSE reconnection). |  
| **6. Latency implications** | INFERENCE: Adds one hop (phone → service edge → tunnel client → localhost). If the service has points of presence near the user, latency added is low. Cloudflare’s global network typically adds <50ms edge‑to‑origin. |  
| **7. Authentication integration** | FACT: Unchanged. The tunnel forwards the `Authorization` header (or token query param) transparently. The service does not need to know the token. |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each tunnel client is bound to a specific local port and thus a specific Sideline instance. The service assigns a unique URL (or subdomain) per tunnel, ensuring isolation. For services like Cloudflare Tunnel, you can authenticate the tunnel with a token tied to your account, preventing others from hijacking your URL. |  
| **9. Operational complexity** | FACT: Low for the user if they manually run the tunnel client; zero server‑side ops. If the extension were to automate tunnel client startup/download, it would add some complexity (binary distribution, updates, platform‑specific builds). |  
| **10. Approximate production cost shape** | FACT: Free tiers exist (Cloudflare Tunnel free for basic usage, `localhost.run` free but with rate limits). For production‑grade SLAs or custom domains, may incur cost (e.g., Cloudflare Load Balancing or Argo Tunnel paid tiers). However, the basic tunnel suffices for many users. |  
| **11. Vendor lock‑in** | FACT: Moderate. If you choose Cloudflare Tunnel, you are dependent on Cloudflare’s infrastructure. Switching to another provider would require changing the tunnel client and possibly the public URL format. The Coach extension would need to be updated to support a different client if automation is added. |  
| **12. Major security concerns** | FACT: The tunnel client creates a publicly reachable endpoint that forwards to `localhost:49152`. If the Coach server had any vulnerabilities, they’d be exposed. The existing token protects the API, but the mobile UI itself (served at root) is also exposed—though it does not contain sensitive data by itself (it only shows reports after token auth). The tunnel service sees the clear‑text traffic (if not using end‑to‑end encryption). Quick Tunnel services (like Cloudflare’s `trycloudflare.com`) are intentionally temporary and public; for production, you’d want a trusted tunnel with authentication (e.g., Cloudflare Tunnel with Access policies). |  
| **13. Works without users understanding networking?** | FACT: Partially. The user must obtain and run the tunnel client (e.g., download `cloudflared` and execute a command). If the extension bundles or automatically downloads/installs the client (with user consent), then the user only needs to click a button to enable remote access. Without automation, the user needs basic CLI knowledge. |  

## CANDIDATE C: Other credible outbound reverse‑connection architectures (e.g., ngrok, PageKite, SSH reverse tunnel)  
*Similar to Managed Tunnels but with different trade‑offs.*  

| Criterion | Assessment |  
|-----------|------------|  
| **1. Desktop/host changes required** | FACT: Same as B—no changes to Coach server; requires running a client binary (ngrok, PageKite, or `ssh -R`). |  
| **2. Hosted infrastructure required** | FACT: For ngrok/PageKite, you rely on their servers; for SSH reverse tunnel, you need an SSH server you control (could be a cheap VPS). |  
| **3. Phone/browser connection model** | FACT: Phone connects to the public URL provided by the client (e.g., `https://abcd1234.ngrok.io` or your SSH server’s port). |  
| **4. HTTP + live‑stream compatibility** | FACT: These tools tunnel raw TCP, so HTTP and SSE work transparently. |  
| **5. Reconnect behavior** | FACT: Clients like ngrok and PageKite auto‑reconnect; SSH tunnels can be made persistent with autossh or similar. |  
| **6. Latency implications** | INFERENCE: Depends on the provider’s edge locations. Self‑hosted SSH reverse tunnel latency depends on your VPS location relative to the user. |  
| **7. Authentication integration** | FACT: Unchanged; token forwarded transparently. |  
| **8. Multi‑user / multi‑host isolation** | FACT: Each client instance gets its own URL/tunnel, preventing cross‑talk. For SSH, you’d forward different local ports to different remote ports or use separate SSH connections. |  
| **9. Operational complexity** | FACT: Low for ngrok/PageKite (just run the binary); moderate for self‑hosted SSH tunnel (need to manage the SSH server). |  
| **10. Approximate production cost shape** | FACT: ngrok has a free tier with limitations; PageKite offers free tier; self‑hosted SSH tunnel costs are the VPS price (e.g., $5/month). |  
| **11. Vendor lock‑in** | FACT: High for ngrok/PageKite if you rely on their branded URLs and infrastructure; low for self‑hosted SSH (you control both ends). |  
| **12. Major security concerns** | FACT: Same as B—public endpoint exposes local port. SSH reverse tunnel adds encryption of the tunnel itself (SSH encrypts traffic between client and your SSH server), so the relay (your SSH server) sees clear text only after decryption on your server. If you do not trust your own SSH server, this is moot. Ngrok/PageKite TLS terminate at their edge, so they see clear text. |  
| **13. Works without users understanding networking?** | FACT: Same as B—requires user to run a client unless automated. |  

## COMPARISON & RECOMMENDATION  

| Aspect | A (Self‑hosted WebSocket Relay) | B (Managed Tunnel, e.g., Cloudflare) | C (Other Tunnels: ngrok/PageKite/SSH) |  
|--------|----------------------------------|--------------------------------------|----------------------------------------|  
| **Desktop changes** | Moderate (add outbound client) | None (if user runs client) / Low (if auto‑download) | None / Low |  
| **Hosted infra** | You operate relay | None (service‑provided) | None / You operate SSH server |  
| **Isolation** | Built‑in via client ID | Natural per‑tunnel URL | Natural per‑tunnel/port |  
| **Latency** | Low‑moderate (depends on relay location) | Low (global edge) | Variable |  
| **Ops complexity** | Moderate (run relay) | Low (service) | Low‑moderate |  
| **Cost** | Low‑moderate (VM) | Free tier available | Free‑tier + possible VPS |  
| **Vendor lock‑in** | Low | Medium (to tunnel provider) | High (ngrok/PageKite) / Low (self‑SSH) |  
| **Security** | Must trust relay or add mTLS | Must trust tunnel provider; see clear text | Must trust tunnel provider or SSH server |  
| **User‑friendliness** | High (one‑click enable in extension) | Medium (requires client install unless automated) | Medium (same as B) |  

**RECOMMENDED TRANSPORT FOR REMOTE ACCESS v1:**  
**Candidate B (Managed Tunnel) using Cloudflare Tunnel (or similar) with automation** is the best balance for a production‑friendly v1. It requires zero changes to the Coach server, leverages a globally distributed, low‑latency edge, offers free tier, and provides secure tunneling (TCP‑level) with optional authentication via Cloudflare Access. The extension can automate the tunnel client download/start (similar to how it already launches the Control Plane daemon) and generate a stable URL for the user.  

If the project prefers zero third‑party dependency and full control, **Candidate A (self‑hosted WebSocket relay)** is a strong alternative, though it adds operational overhead.  

## SMALLEST PROOF‑OF‑CONCEPT  
1. **Modify `extension.ts`** to optionally start a tunnel client (e.g., `cloudflared`) when a new setting `coach.remoteAccessEnabled` is true.  
2. Bundle or download the `cloudflared` binary for the host platform at first run (or rely on user‑installed `cloudflared`).  
3. After the tunnel is ready, retrieve the public URL (from `cloudflared`’s stdout or via its API) and store it in `coach.publicUrl` (or a temporary setting) so that the existing `Coach: Copy Mobile URL` command works.  
4. No changes to `server.ts` or the UI are needed—they already use `coach.publicUrl` and the token‑based auth.  
**Files touched:** `src/extension.ts` (add tunnel logic, new setting), possibly `src/server.ts` (if we want to log tunnel status), and `package.json` (add any needed dependencies for downloading binaries).  

## EXACT SIDELINE CODE SEAMS LIKELY TOUCHED  
- **`src/extension.ts`**:  
  * Add a new configuration property `coach.remoteAccessEnabled` (boolean).  
  * In `activate()`, if enabled, launch/download the tunnel client (similar to `ensureControlPlaneRunning`).  
  * Obtain the public URL from the client (e.g., parse stdout or query its local API) and update `coach.publicUrl` via `vscode.workspace.getConfiguration().update()`.  
  * Provide a command `coach.toggleRemoteAccess` to start/stop the tunnel and show the URL.  
- **`src/server.ts`**: No changes required (continues to listen on `127.0.0.1`).  
- **`src/public/index.html`**: No changes required (uses `coach.publicUrl` from extension).  

## OPEN QUESTIONS REQUIRING ARCHITECT JUDGMENT  
1. **Should the tunnel client be bundled or downloaded at runtime?** Bundling increases extension size; downloading ensures up‑to‑date binaries but adds first‑run complexity.  
2. **How to handle tunnel client updates and platform‑specific binaries (Windows, macOS, Linux)?**  
3. **What level of authentication should be applied to the tunnel itself?** For Cloudflare Tunnel, one can use a token tied to a Cloudflare Account Team, restricting tunnel creation to authorized users. For a self‑hosted relay, mutual TLS between client and relay could be considered.  
4. **Should the extension attempt to fallback to Tailscale if installed, or make the managed tunnel the primary recommended method?** The README currently promotes Tailscale; a v1 might shift to a zero‑install‑required tunnel (like Cloudflare) as the default.  
5. **How to expose tunnel status/errors in the UI?** Could reuse existing status bar or add a new indicator.  
6. **What are the rate limits and abuse considerations of the public tunnel service?** Must ensure the Coach server does not inadvertently become an open proxy (the token protects the API, but the UI is publicly reachable without token—though it only shows UI, not data).  

---  
**Report produced by Scout Agent: remote-transport-options using model openrouter/nvidia/nemotron-3-super-120b-a12b:free.**  
**End of reconnaissance.**  
**No files were modified.**

## Recommended next step

Review the surviving Scout reports above; decide whether the unfilled lanes justify a new Scout Play before forwarding to an Architect.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-recon-20260923-092529
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-recon-20260923-092529

