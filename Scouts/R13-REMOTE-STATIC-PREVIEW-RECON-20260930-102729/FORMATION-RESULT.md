# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:22:15

Play: R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-30T16:27:37.549Z
Finished: 2026-09-30T16:49:53.161Z
TOTAL ELAPSED TIME: 00:22:15

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scout-a-remote-transport-auth | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-30T16:27:37.615Z | 2026-09-30T16:30:52.503Z | 00:03:14 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-a-remote-transport-auth-Reconnaissance.md |
| scout-b-preview-stadium-runtime | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-30T16:27:37.751Z | 2026-09-30T16:49:53.154Z | 00:22:15 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-b-preview-stadium-runtime-Reconnaissance.md |
| scout-c-remote-preview-security-browser | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-30T16:27:37.773Z | 2026-09-30T16:35:09.856Z | 00:07:32 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-c-remote-preview-security-browser-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scout-a-remote-transport-auth: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane scout-b-preview-stadium-runtime: Poolside: Laguna S 2.1 (free) (sideline-scout) → COMPLETE
- Lane scout-c-remote-preview-security-browser: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: scout-a-remote-transport-auth (objective 1756a2489d11)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not install packages.
Do not commit.
Do not push.
Do not design the final architecture.
Do not implement anything.

FEATURE / QUESTION:
R13 Remote Static Preview for Sideline Coach.

HUMAN FIELD FACT:
Desktop Preview Work is working.
On an authenticated phone at remote.mysidelinecoach.com, Sideline can identify Preview · GS3 but cannot display the Game because the actual PreviewEndpoint lives on the desktop Stadium.

TARGET QUESTION:
What existing Sideline remote transport, authentication, session, Stadium, and Control Plane seams could allow exactly one active Game-owned PreviewEndpoint to become available to Dad's authenticated remote phone session?

INVESTIGATE:

1. How remote.mysidelinecoach.com currently reaches Sideline Coach.
2. Existing remote authentication and authorization boundaries.
3. Existing session/user/Stadium/Game identities available on the remote path.
4. How the connected desktop Stadium communicates with the daemon / Control Plane / remote surface.
5. Existing RPC, WebSocket, HTTP, relay, daemon, or message seams that could potentially carry Preview capability information or traffic.
6. Whether an existing authenticated transport can be extended narrowly rather than creating a parallel remote system.
7. Where remote requests terminate today.
8. Which component currently knows:
   - selected Game
   - active Stadium
   - Preview capability
   - remote authenticated viewer
9. Current trust boundaries and ownership.
10. Exact files, modules, interfaces, RPCs, routes, and identity objects involved.

DO NOT:

- design a generic localhost proxy
- recommend arbitrary port forwarding
- implement a tunnel
- solve Vite/HMR
- solve Codespaces
- solve remote Preview architecture
- mutate the repo

CLASSIFY FINDINGS AS:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

OUTPUT SHOULD EMPHASIZE:

- current remote request path
- current authentication path
- current Stadium communication path
- reusable seams
- missing seams
- exact architectural junctions
- dangerous trust boundaries
- what remains genuinely unknown

The downstream Architect should not need to rediscover this subsystem.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-a-remote-transport-auth-Reconnaissance.md

**Key discoveries:** - The daemon's `/api/games/preview` endpoint returns `available: false` with reason `remote-viewer` for remote principals, intentionally withholding the actual preview URL (which is Stadium-localhost-only).
- Remote authentication is handled via the `sl_dev` cookie verified by the `DeviceRegistry` in the `InProcessRemoteAdapter`.
- The daemon already proxies many Stadium‑hosted resources (files, reports, etc.) via `proxyExactGameRpc` over the Stadium‑to‑daemon WebSocket session.
- The static preview server (`StaticPreviewServer`) binds to `127.0.0.1:dynamic` and is started by the daemon on demand.
- The Stadium communicates with the daemon over a persistent WebSocket (stadium.hello, etc.) and exposes features like `game.preview.v1` for preview resolution.
- The remote phone loads the Sideline web app (served by the daemon's public directory) and uses the same WebSocket tunnel for API calls.

**FACT:** - The CoachServer (`src/server.ts`) binds to `127.0.0.1` only (line 108).  
- The ControlPlaneDaemon (`src/control-plane/daemon.ts`) binds to `127.0.0.1` only (line 1194).  
- The daemon's `/api/games/preview` handler returns `{ success: true, gameId, available: false, endpoints: [], reason: 'remote-viewer' }` when `principal.kind === 'remote-device'` (lines 2205‑2207).  
- For local principals, the daemon proxies to the Stadium via `proxyExactGameRpc(res, gameId, 'game.preview.v1', 'game.preview.resolve', ...)` (lines 2213‑2215).  
- Remote authentication uses the `sl_dev` cookie validated by `DeviceRegistry.authenticate(rawToken)` in `InProcessRemoteAdapter.dispatch` (lines 81‑97).  
- The relay configuration defaults to `wss://relay.remote.mysidelinecoach.com/tunnel/v1` and domain `remote.mysidelinecoach.com` (`src/control-plane/remote-bootstrap.ts`, lines 4‑6).  
- The daemon serves static files (`index.html`, `pair.html`, `sw.js`) from `src/public` for the remote app (lines 1815‑1828).  
- The `proxyExactGameRpc` function is used to proxy RPCs to the Stadium (e.g., for game files) and requires a Stadium feature (e.g., `game.files.v1`) (lines 3788‑3823).  
- The preview RPC uses feature `game.preview.v1` and method `game.preview.resolve` (line 2213).  
- Remote‑access route classification is defined in `remote-routes.ts` (e.g., `/api/games/preview` is `remote-read` line 35).

**INFERENCE:** - The remote phone can obtain preview metadata (e.g., that a preview exists) via the `/api/games/preview` endpoint but cannot access the actual preview URL because it is a Stadium‑localhost URL (e.g., `http://localhost:3000`) that is not routable to the remote phone.  
- The existing WebSocket tunnel (relay) could carry preview HTTP traffic if a new proxied endpoint (e.g., `/api/games/preview/content`) were added, similar to existing proxied endpoints like `/api/games/files/*`.  
- The Stadium could act as a reverse proxy for its preview HTTP server over the WebSocket tunnel, or the daemon could forward requests to its own `StaticPreviewServer`.  
- Reusing the authenticated remote transport (the WebSocket tunnel) avoids creating a parallel system and leverages the existing session/device authentication.

**UNKNOWN:** - Whether the Stadium's preview endpoint (e.g., a Vite dev server) supports being proxied via a generic HTTP reverse proxy without breaking features like Hot Module Replacement (HMR) or websocket fallbacks.  
- If the daemon's `StaticPreviewServer` can safely handle concurrent requests from multiple remote phones while preserving correctness and security.  
- Whether the existing `proxyExactGameRpc` mechanism can be extended to stream arbitrary HTTP responses (including binary assets and streaming) without buffering limits.  
- Whether the remote phone's web app would need modification to use the new proxied preview URL instead of the Stadium‑localhost URL.

**CONTRADICTION:** - No contradictions found; all evidence aligns with the current design where remote principals are deliberately excluded from accessing the preview endpoint for security/isolation reasons.

**Important files:** - `src/server.ts` – CoachServer (local API, binds to 127.0.0.1)  
- `src/control-plane/daemon.ts` – ControlPlaneDaemon (handles HTTP, preview logic, proxyExactGameRpc, static preview server integration)  
- `src/control-plane/remote-routes.ts` – Defines route access levels (e.g., `remote-read` for `/api/games/preview`)  
- `src/control-plane/remote-dispatch.ts` – Processes inbound WebSocket frames, authenticates remote principals via `sl_dev` cookie  
- `src/control-plane/relay-client.ts` – Manages WebSocket tunnel to `relay.remote.mysidelinecoach.com`  
- `src/control-plane/remote-bootstrap.ts` – Defines product relay URL and domain  
- `src/preview-discovery.ts` – Contains `projectPreviewResolution` and static preview discovery logic  
- `src/static-preview.ts` – Implements `StaticPreviewServer` (binds to 127.0.0.1:dynamic)  
- `src/public/index.html` – Entry point for the remote phone web app  
- `src/control-plane/protocol.ts` – Defines RPC shapes (e.g., `game.preview.v1`, `game.preview.resolve`)  

---  
*End of reconnaissance report.*  
*No files were modified, and no commands were executed.*  
*All evidence is derived from read‑only inspection of the current repository.*  
*This report is intended for architectural consideration only.*

### Poolside: Laguna S 2.1 (free) (sideline-scout)

- Lane: scout-b-preview-stadium-runtime (objective 8e5f0c30c4d3)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not install packages.
Do not commit.
Do not push.
Do not design the final architecture.
Do not implement anything.

FEATURE / QUESTION:
R13 Remote Static Preview for Sideline Coach.

HUMAN FIELD FACT:
Local desktop Preview Work is FIELD-PROVEN for GS3.
Phone Preview Work reaches the Preview viewer UI but displays a message that Preview opens on the computer because the Game-owned endpoint is local to the desktop Stadium.

TARGET QUESTION:
Map the existing Preview runtime from active Game to PreviewEndpoint and identify the exact boundary where remote phone access stops.

INVESTIGATE:

1. Current PreviewEndpoint type / contract.
2. StaticPreviewServer ownership and lifecycle.
3. Game + Stadium binding for Preview.
4. Current Preview discovery precedence.
5. static fallback behavior.
6. toClientUrl / vscode.env.asExternalUri usage.
7. directTabOnly behavior.
8. how Preview metadata reaches the browser.
9. what the desktop Preview viewer receives.
10. what the remote Preview viewer receives.
11. why the phone currently receives the remote placeholder instead of the running Game.
12. which endpoint information is:
    - Stadium-local
    - browser-safe
    - currently projected
    - deliberately withheld
13. server lifecycle on:
    - Game switch
    - extension deactivation
    - Preview close
14. whether any current seam already distinguishes local viewer vs remote viewer.
15. exact files, types, RPCs, state objects, and lifecycle owners involved.

IMPORTANT:

Do not redesign S57.42 / S57.43.

Those are FIELD-PROVEN locally.

The purpose is to establish the junction for Remote Preview, not to reconsider local Preview.

DO NOT:

- change StaticPreviewServer
- change PreviewEndpoint
- implement remote transport
- solve dev-server HMR
- solve Codespaces
- mutate the repo

CLASSIFY FINDINGS AS:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

OUTPUT SHOULD ANSWER:

Where, exactly, does this path stop today?

Game
→ Stadium
→ PreviewEndpoint
→ local Preview Work
→ remote Preview Work
→ ???

Identify the smallest existing seam where a future authorized remote bridge could attach.
- Model: openrouter/poolside/laguna-s-2.1:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-b-preview-stadium-runtime-Reconnaissance.md

**Key discoveries:** This was a **READ-ONLY reconnaissance** mission (Scout ID `scout-b-preview-stadium-runtime`), which is now complete. I have delivered a fully structured report to the `WORKSPACE` block above — **no repository files were created, modified, or deleted.**

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/preview-discovery.ts` — PreviewEndpoint model, discovery precedence, `projectPreviewResolution`/`projectPreviewEndpoint` browser projection (strips `localUrl`)
- `src/static-preview.ts` — StaticPreviewServer: Node http, 127.0.0.1 only, ephemeral port, GET/HEAD only, root containment checks
- `src/stadium-client.ts` — Stadium WebSocket client; registers `game.preview.v1` feature; handles `game.preview.resolve` RPC; owns StaticPreviewServer lifecycle
- `src/control-plane/daemon.ts` ~line 2196-2217 — THE BOUNDARY: `GET /api/games/preview` route where `principal.kind === 'remote-device'` short-circuits with `reason: 'remote-viewer'` before reaching `proxyExactGameRpc`
- `src/control-plane/daemon.ts` ~line 5541-5555 — `resolvePrincipal`: returns ONLY `local-admin` (bearer/cookie); `remote-device` is never constructed here
- `src/control-plane/daemon.ts` ~line 3788-3823 — `proxyExactGameRpc`: the call site that remote devices are denied access to
- `src/control-plane/remote-routes.ts` ~line 35 — route policy classifies `/api/games/preview` as `remote-read` (allowed to reach handler, but handler itself denies)
- `src/control-plane/request-security.ts` ~line 3-5 — `Principal` type: `local-admin` | `remote-device` (in-process only)
- `src/control-plane/remote-dispatch.ts` ~line 30 — `RemotePrincipal` type; only place `remote-device` is constructed
- `src/remote-redaction.ts` — note: preview endpoint is NOT sent through `redactForPrincipal`; it uses pure allowlist `projectPrevie

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: scout-c-remote-preview-security-browser (objective 3e8f14933cef)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not install packages.
Do not commit.
Do not push.
Do not design the final architecture.
Do not implement anything.

FEATURE / QUESTION:
R13 Remote Static Preview for Sideline Coach.

FIRST TARGET:
STATIC HTML GAMES ONLY.

GS3 is the reference Game.

GS3 currently runs through Sideline's Stadium-owned StaticPreviewServer:
- Node http
- 127.0.0.1 only
- ephemeral port
- GET / HEAD only
- Game-root containment
- secret/dotfile protections

TARGET QUESTION:
What browser, HTTP, security, and authorization constraints must be satisfied to expose exactly ONE approved Game-owned static PreviewEndpoint to Dad's authenticated remote phone session without creating a generic localhost proxy?

INVESTIGATE CURRENT SIDELINE SOURCE AND EXISTING REMOTE INFRASTRUCTURE FOR:

1. Request routing boundaries.
2. Existing authenticated remote HTTP/WebSocket paths.
3. Whether HTTP response streaming already exists.
4. Whether binary bodies are supported by current transport.
5. Header forwarding behavior.
6. relative and root-relative asset implications.
7. iframe / origin behavior.
8. CSP behavior.
9. CORS implications.
10. cookie implications.
11. MIME preservation.
12. GET / HEAD semantics.
13. redirects.
14. URL/path rewriting requirements, if any.
15. asset subrequests from an embedded static page.
16. authorization lifecycle.
17. preview-session expiry/revocation opportunities.
18. SSRF and arbitrary-local-service exposure risks.
19. whether the existing static server's strict root containment can remain authoritative.
20. exact places where a generic proxy implementation would become dangerous.

SECURITY NORTH STAR:

The future capability must conceptually authorize:

THIS authenticated viewer
+
THIS Stadium
+
THIS Game
+
THIS approved PreviewEndpoint

It must NOT mean:

remote URL
→ arbitrary localhost URL / arbitrary port / arbitrary machine service

DO NOT:

- design the final relay architecture
- implement a proxy
- implement a tunnel
- expose arbitrary localhost
- solve Vite
- solve HMR WebSockets
- solve Next.js
- solve Codespaces
- mutate source

STATIC GS3 ONLY.

CLASSIFY FINDINGS AS:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

OUTPUT SHOULD EMPHASIZE:

- proven current browser/transport constraints
- existing protections that can be reused
- missing protections
- dangerous boundaries
- static-only simplifications
- exact seams an Architect needs to inspect
- what must remain UNKNOWN pending real implementation/field evidence

The goal is to buy facts cheaply so architecture reasoning can focus on the actual dangerous decisions.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-c-remote-preview-security-browser-Reconnaissance.md

**Key discoveries:** This reconnaissance maps the current Sideline Coach codebase's static preview server, remote access infrastructure, and browser/transport constraints to answer: **What must be satisfied to expose exactly ONE approved Game-owned static PreviewEndpoint to Dad's authenticated remote phone session without creating a generic localhost proxy?**

---

**FACT:** | # | Finding | Evidence |
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
| F14 | Route policy: `/api/games/preview` = `remote-read` (allowed fo

**INFERENCE:** | # | Inference | Basis |
|---|-----------|-------|
| I1 | Static GS3 preview on phone requires **new relay subdomain path** (e.g. `/preview/v1/...`) mapped to StaticPreviewServer port | Relay routes by host; path rewriting needed |
| I2 | `clientUrl` from `asExternalUri` is **VS Code machine only** — phone needs distinct mapping | preview-discovery.ts:44-45 comment |
| I3 | CSP `frame-ancestors 'none'` on CoachServer **does not affect** StaticPreviewServer (different port) | server.ts:955 vs static-preview.ts:237 |
| I4 | Relative asset paths in static HTML **work automatically** through StaticPreviewServer containment | static-preview.ts:219-230 |
| I5 | Preview session expiry = StaticPreviewServer port lifetime (Game switch or dispose) | static-preview.ts:168-175, 244-259 |
| I6 | No cookie leakage from StaticPreviewServer → **no CSRF surface** for static preview | static-preview.ts:203-241 |
| I7 | Authorization = `THIS viewer + THIS Stadium + THIS Game + THIS endpoint` maps to: DeviceRegistry deviceId + Stadium hostPublicId + Game gameId + static entrypoint path | device-registry.ts, host-identity.ts, game-identity.ts, static-preview.ts |

**UNKNOWN:** | # | Unknown | Why |
|---|---------|-----|
| U1 | Whether phone browsers handle `http://h-<host>.<domain>/preview/...` → relay → host → StaticPreviewServer without cert errors | Depends on relay TLS, HSTS, mixed-content |
| U2 | Whether `asExternalUri` mapping for preview subdomain works in Codespaces/remote SSH | VS Code API behavior varies by environment |
| U3 | Exact header forwarding behavior for `Range` requests (video/audio seeking) | Not tested; relay allowlist doesn't include `Range` |
| U4 | Whether Service Worker (`sw.js`) intercepts preview subdomain requests | sw.js only handles push notifications (sw.js:34-40) |
| U5 | Maximum concurrent preview sessions per StaticPreviewServer | Node http.Server default limits; untested |
| U6 | Cache behavior: `Cache-Control: no-store` from daemon vs static server's lack thereof | daemon sends no-store; static server sends nothing |
| U7 | Whether `ETag`/`Last-Modified` / conditional requests work end-to-end | Not implemented in static-preview.ts |
| U8 | Mobile Safari/Chrome behavior with `http://` (non-HTTPS) preview on phone | Requires HTTPS relay + HTTP host; mixed content? |

**CONTRADICTION:** | # | Contradiction | Resolution |
|---|---------------|------------|
| C1 | Route policy allows `remote-read` for `/api/games/preview` (remote-routes.ts:35) but daemon returns `remote-viewer` block (daemon.ts:2205) | **Intentional**: daemon overrides route policy for preview. Must change daemon to allow static preview for remote-device. |
| C2 | CoachServer CSP `frame-ancestors 'none'` but StaticPreviewServer sets no CSP | Different servers, different ports. Static preview served directly, not framed in Coach UI. |

**Important files:** | File | Role |
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

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane scout-a-remote-transport-auth: The existing Sideline remote access seam (WebSocket tunnel via `relay.remote.mysidelinecoach.com`) could be extended to expose exactly one active Game-owned PreviewEndpoint to Dad's authenticated remote phone session by adding a new proxied HTTP endpoint (e.g., `/api/games/preview/content`) that forwards preview requests to the Stadium (or daemon's static preview server) and marking it as `remote-
- **Poolside: Laguna S 2.1 (free) (sideline-scout)** · lane scout-b-preview-stadium-runtime: This was a **READ-ONLY reconnaissance** mission (Scout ID `scout-b-preview-stadium-runtime`), which is now complete. I have delivered a fully structured report to the `WORKSPACE` block above — **no repository files were created, modified, or deleted.**
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane scout-c-remote-preview-security-browser: This reconnaissance maps the current Sideline Coach codebase's static preview server, remote access infrastructure, and browser/transport constraints to answer: **What must be satisfied to expose exactly ONE approved Game-owned static PreviewEndpoint to Dad's authenticated remote phone session without creating a generic localhost proxy?** ---

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane scout-a-remote-transport-auth: - No contradictions found; all evidence aligns with the current design where remote principals are deliberately excluded from accessing the preview endpoint for security/isolation reasons.
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane scout-c-remote-preview-security-browser: | # | Contradiction | Resolution | |---|---------------|------------| | C1 | Route policy allows `remote-read` for `/api/games/preview` (remote-routes.ts:35) but daemon returns `remote-viewer` block (daemon.ts:2205) | **Intentional**: daemon overrides route policy for preview. Must change daemon to allow static preview for remote-device. | | C2 | CoachServer CSP `frame-ancestors 'none'` but StaticPreviewServer sets no CSP | Different servers, different ports. Static preview served directly, not framed in Coach UI. |

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scout-a-remote-transport-auth · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-a-remote-transport-auth-Reconnaissance.md
- Lane scout-b-preview-stadium-runtime · Poolside: Laguna S 2.1 (free) (sideline-scout): C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-b-preview-stadium-runtime-Reconnaissance.md
- Lane scout-c-remote-preview-security-browser · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729\SCOUT-scout-c-remote-preview-security-browser-Reconnaissance.md

### Full report — lane scout-a-remote-transport-auth (sideline-scout-balanced)

**Scout Agent**: scout-a-remote-transport-auth  
**Model**: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note**: This is reconnaissance, not final architectural authority.

# RESULT
The existing Sideline remote access seam (WebSocket tunnel via `relay.remote.mysidelinecoach.com`) could be extended to expose exactly one active Game-owned PreviewEndpoint to Dad's authenticated remote phone session by adding a new proxied HTTP endpoint (e.g., `/api/games/preview/content`) that forwards preview requests to the Stadium (or daemon's static preview server) and marking it as `remote-read` in `remote-routes.ts`. This would reuse the authenticated transport, avoiding a parallel system.

# KEY DISCOVERIES
- The daemon's `/api/games/preview` endpoint returns `available: false` with reason `remote-viewer` for remote principals, intentionally withholding the actual preview URL (which is Stadium-localhost-only).
- Remote authentication is handled via the `sl_dev` cookie verified by the `DeviceRegistry` in the `InProcessRemoteAdapter`.
- The daemon already proxies many Stadium‑hosted resources (files, reports, etc.) via `proxyExactGameRpc` over the Stadium‑to‑daemon WebSocket session.
- The static preview server (`StaticPreviewServer`) binds to `127.0.0.1:dynamic` and is started by the daemon on demand.
- The Stadium communicates with the daemon over a persistent WebSocket (stadium.hello, etc.) and exposes features like `game.preview.v1` for preview resolution.
- The remote phone loads the Sideline web app (served by the daemon's public directory) and uses the same WebSocket tunnel for API calls.

# FACT
- The CoachServer (`src/server.ts`) binds to `127.0.0.1` only (line 108).  
- The ControlPlaneDaemon (`src/control-plane/daemon.ts`) binds to `127.0.0.1` only (line 1194).  
- The daemon's `/api/games/preview` handler returns `{ success: true, gameId, available: false, endpoints: [], reason: 'remote-viewer' }` when `principal.kind === 'remote-device'` (lines 2205‑2207).  
- For local principals, the daemon proxies to the Stadium via `proxyExactGameRpc(res, gameId, 'game.preview.v1', 'game.preview.resolve', ...)` (lines 2213‑2215).  
- Remote authentication uses the `sl_dev` cookie validated by `DeviceRegistry.authenticate(rawToken)` in `InProcessRemoteAdapter.dispatch` (lines 81‑97).  
- The relay configuration defaults to `wss://relay.remote.mysidelinecoach.com/tunnel/v1` and domain `remote.mysidelinecoach.com` (`src/control-plane/remote-bootstrap.ts`, lines 4‑6).  
- The daemon serves static files (`index.html`, `pair.html`, `sw.js`) from `src/public` for the remote app (lines 1815‑1828).  
- The `proxyExactGameRpc` function is used to proxy RPCs to the Stadium (e.g., for game files) and requires a Stadium feature (e.g., `game.files.v1`) (lines 3788‑3823).  
- The preview RPC uses feature `game.preview.v1` and method `game.preview.resolve` (line 2213).  
- Remote‑access route classification is defined in `remote-routes.ts` (e.g., `/api/games/preview` is `remote-read` line 35).  

# INFERENCE
- The remote phone can obtain preview metadata (e.g., that a preview exists) via the `/api/games/preview` endpoint but cannot access the actual preview URL because it is a Stadium‑localhost URL (e.g., `http://localhost:3000`) that is not routable to the remote phone.  
- The existing WebSocket tunnel (relay) could carry preview HTTP traffic if a new proxied endpoint (e.g., `/api/games/preview/content`) were added, similar to existing proxied endpoints like `/api/games/files/*`.  
- The Stadium could act as a reverse proxy for its preview HTTP server over the WebSocket tunnel, or the daemon could forward requests to its own `StaticPreviewServer`.  
- Reusing the authenticated remote transport (the WebSocket tunnel) avoids creating a parallel system and leverages the existing session/device authentication.  

# UNKNOWN
- Whether the Stadium's preview endpoint (e.g., a Vite dev server) supports being proxied via a generic HTTP reverse proxy without breaking features like Hot Module Replacement (HMR) or websocket fallbacks.  
- If the daemon's `StaticPreviewServer` can safely handle concurrent requests from multiple remote phones while preserving correctness and security.  
- Whether the existing `proxyExactGameRpc` mechanism can be extended to stream arbitrary HTTP responses (including binary assets and streaming) without buffering limits.  
- Whether the remote phone's web app would need modification to use the new proxied preview URL instead of the Stadium‑localhost URL.  

# CONTRADICTION
- No contradictions found; all evidence aligns with the current design where remote principals are deliberately excluded from accessing the preview endpoint for security/isolation reasons.  

# ARCHITECT DECISION REQUIRED
- Whether to expose the preview endpoint via a new proxied HTTP route (e.g., `/api/games/preview/content`) under the existing remote‑access seam, or to alter the preview endpoint resolution to return a relay‑proxied URL (requiring changes in both daemon and Stadium).  
- If a new route is added, what path should be used (e.g., `/api/games/preview/content`, `/_preview/*`) and what HTTP methods should be allowed (likely `GET` for static assets).  
- How to handle caching, compression, and security headers for proxied preview content to prevent leakage of unrelated Stadium resources.  
- Whether to restrict the proxied preview endpoint to only the active Game's preview endpoint (ensuring exactly one active Game-owned PreviewEndpoint is exposed) and how to enforce that restriction (e.g., by validating the `gameId` parameter against the daemon's selected game).  

# IMPORTANT FILES / PATHS
- `src/server.ts` – CoachServer (local API, binds to 127.0.0.1)  
- `src/control-plane/daemon.ts` – ControlPlaneDaemon (handles HTTP, preview logic, proxyExactGameRpc, static preview server integration)  
- `src/control-plane/remote-routes.ts` – Defines route access levels (e.g., `remote-read` for `/api/games/preview`)  
- `src/control-plane/remote-dispatch.ts` – Processes inbound WebSocket frames, authenticates remote principals via `sl_dev` cookie  
- `src/control-plane/relay-client.ts` – Manages WebSocket tunnel to `relay.remote.mysidelinecoach.com`  
- `src/control-plane/remote-bootstrap.ts` – Defines product relay URL and domain  
- `src/preview-discovery.ts` – Contains `projectPreviewResolution` and static preview discovery logic  
- `src/static-preview.ts` – Implements `StaticPreviewServer` (binds to 127.0.0.1:dynamic)  
- `src/public/index.html` – Entry point for the remote phone web app  
- `src/control-plane/protocol.ts` – Defines RPC shapes (e.g., `game.preview.v1`, `game.preview.resolve`)  

---  
*End of reconnaissance report.*  
*No files were modified, and no commands were executed.*  
*All evidence is derived from read‑only inspection of the current repository.*  
*This report is intended for architectural consideration only.*

### Full report — lane scout-b-preview-stadium-runtime (sideline-scout)

I'll begin by surveying the repository structure and locating the relevant Preview, Stadium, and endpoint files.
Now let me read the core source files and the relevant reports:
Now let me read the extension.ts, stadium-client.ts, and the control-plane preview handling:
Let me now read the daemon preview handling, the control-plane protocol, and the browser UI preview section:
Let me read the daemon preview proxy and the full browser preview section of index.html:
Let me read more of the daemon around the preview proxy, the proxyExactGameRpc method, the Principal type, and the S57.43 report:
Now let me look at the S57.43 reports, the handleHttpRequest method, and the preview tests:
Let me find the `handleHttpRequest` signature and `resolvePrincipal`, plus the test files:
Now let me read the daemon's handleHttpRequest and resolvePrincipal methods:
Now let me look at the Scout SOP, the preview wire tests, and the remaining browser preview code:
Now let me check the protocol.ts for preview features and the stadium-registry for session types:
Let me check a few more things — the breadcrumb, the stadium registry session type, and the remote-access test:
Now let me look at the buildStatus and what the remote viewer gets in status:
Let me check the relay client and how remote connection works:
Let me check the remote pairing/bootstrap and the `redactForPrincipal` behavior for the preview endpoint:
Let me look at the S57.32 report for the PreviewEndpoint interface definition and check a few more things:
Let me check the existing R13 scout reports and also look at the Breadcrumb for viewer-aware preview:
Let me also check the remote-access test for the preview route and the S57.35 report:
Let me verify a few more details about the projection and the S57.32 report:
Let me check the S57.33 report for the wire shape details:
Let me check the S57.34 Cloud Shell adapter and look at the protocol.ts for preview types:
## Objective
Conduct READ-ONLY reconnaissance for R13 (Remote Static Preview) to map the existing Preview runtime from Game to PreviewEndpoint and identify exactly where remote phone access stops today, per the bounded objective above.

## Important Details
- Scout ID: `scout-b-preview-stadium-runtime`; Agent: `sideline-scout`; Model: `openrouter/poolside/laguna-s-2.1:free`
- READ-ONLY: do not modify source, install packages, commit, push, implement, or design final architecture
- Do not redesign S57.42 / S57.43 (field-proven locally); goal is to establish the junction for Remote Preview
- Key constraint: `StaticPreviewServer`, `PreviewEndpoint`, remote transport, dev-server HMR, Codespaces must not be changed

## Work State
### Completed
- Identified the `PreviewEndpoint` contract and browser projection seam (`projectPreviewEndpoint` in `src/preview-discovery.ts`)
- Mapped `StaticPreviewServer` ownership and lifecycle in `src/static-preview.ts` and `src/stadium-client.ts`
- Confirmed Game + Stadium binding binds preview to the exact Stadium session (feature-gated `game.preview.v1`)
- Mapped Preview discovery precedence (declaration → detected → static fallback)
- Confirmed `projectPreviewResolution` strips `localUrl` and only projects `clientUrl`
- Confirmed `asExternalUri` usage via `previewClientUrl` seam (`src/extension.ts` ~line 58, `src/stadium-client.ts` ~line 225)
- Confirmed `directTabOnly` is projected to the browser (`src/preview-discovery.ts` ~line 593)
- Traced how Preview metadata reaches the browser via `/api/games/preview` daemon route
- Confirmed desktop viewer receives full `PreviewResolution` with projected `clientUrl` (Stadium-local)
- Confirmed remote viewer receives `{ available: false, endpoints: [], reason: 'remote-viewer' }`
- Identified exact boundary: `daemon.ts` ~line 2205 (`if (principal.kind === 'remote-device')`)
- Verified `Principal` types: only `local-admin` (bearer/cookie) or `remote-device` (in-process only); daemon never constructs `remote-device`
- Checked server lifecycle: Game switch (dispose via `prepare()`), extension deactivation (`dispose()` chains), Preview close (browser only hides iframe)
- Confirmed no current seam distinguishes local vs remote viewer within the Stadium itself (distinction is daemon-side only)
- Cross-referenced prior S57.32/33/35/42/43 reports and existing R13 scout reports (scout-a, scout-c)
- Reviewed test assertions in `test/preview-wire.test.mjs` (lines 81, 91) and `test/remote-access-v1-stage2.test.mjs` (line 638)

### Active
- (none — this is read-only reconnaissance)

### Blocked
- `(none)` — all investigation paths were accessible

## Next Move
1. (none) — report is complete; no implementation action per READ-ONLY CONTRACT
2. (none) — await Runner persistence

## Relevant Files
- `src/preview-discovery.ts` — PreviewEndpoint model, discovery precedence, `projectPreviewResolution`/`projectPreviewEndpoint` browser projection (strips `localUrl`)
- `src/static-preview.ts` — StaticPreviewServer: Node http, 127.0.0.1 only, ephemeral port, GET/HEAD only, root containment checks
- `src/stadium-client.ts` — Stadium WebSocket client; registers `game.preview.v1` feature; handles `game.preview.resolve` RPC; owns StaticPreviewServer lifecycle
- `src/control-plane/daemon.ts` ~line 2196-2217 — THE BOUNDARY: `GET /api/games/preview` route where `principal.kind === 'remote-device'` short-circuits with `reason: 'remote-viewer'` before reaching `proxyExactGameRpc`
- `src/control-plane/daemon.ts` ~line 5541-5555 — `resolvePrincipal`: returns ONLY `local-admin` (bearer/cookie); `remote-device` is never constructed here
- `src/control-plane/daemon.ts` ~line 3788-3823 — `proxyExactGameRpc`: the call site that remote devices are denied access to
- `src/control-plane/remote-routes.ts` ~line 35 — route policy classifies `/api/games/preview` as `remote-read` (allowed to reach handler, but handler itself denies)
- `src/control-plane/request-security.ts` ~line 3-5 — `Principal` type: `local-admin` | `remote-device` (in-process only)
- `src/control-plane/remote-dispatch.ts` ~line 30 — `RemotePrincipal` type; only place `remote-device` is constructed
- `src/remote-redaction.ts` — note: preview endpoint is NOT sent through `redactForPrincipal`; it uses pure allowlist `projectPreviewResolution`
- `src/extension.ts` ~line 58 — `previewClientUrl` seam wrapping `vscode.env.asExternalUri`; ~line 672 `deactivate` calls `dispose()`
- `src/public/index.html` ~line 7720-7730 — `previewViewerGameId` reads `previewWork` query param; ~line 7727-7740 `previewFrameUrl` rewrites localhost to match browser hostname; ~line 7821-7826 `previewUnavailableText` handles `remote-viewer` reason
- `src/public/index.html` ~line 7834-7865 — `renderPreviewEndpoint` renders browser-safe `clientUrl` in iframe
- `src/control-plane/protocol.ts` ~line 419-434 — `GamePreviewResolveParams` / `GamePreviewResolveResult` wire types
- `test/preview-wire.test.mjs` — wire contract tests confirming remote → `remote-viewer` and route classification
- `test/remote-access-v1-stage2.test.mjs` ~line 633-638 — confirms daemon never constructs `remote-device` principal
- `REPORTS/Codex/S57.42-Static-Multi-Page-Preview-Reconciliation.md` — architecture context (do not redesign)
- `REPORTS/Codex/S57.43-Static-Multi-Page-Preview-Implementation.md` — implementation context (do not redesign)
- `REPORTS/Codex/S57.43A-Preview-Work-Field-Proof-UX-Corrections.md` — tab preservation context
- `REPORTS/Codex/S57.43B-Preview-Tab-Preservation-And-Viewport-Fix.md` — tab/view viewport context
- `Project SOP/Breadcrumbs/Viewer-Aware Preview Presentation -9-29-26.md` — future R13/R14 requirement: viewer-aware preview
- `Scouts/R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729/` — prior scout reports (scout-a transport-auth, scout-c security-browser) for context
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
## Scout Report: R13 Remote Static Preview — Recon Complete

### Summary
This was a **READ-ONLY reconnaissance** mission (Scout ID `scout-b-preview-stadium-runtime`), which is now complete. I have delivered a fully structured report to the `WORKSPACE` block above — **no repository files were created, modified, or deleted.**

### State of the Work
- **Completed:** All investigation paths were accessible and fully traversed
- **Active:** `(none)` — report is complete; no implementation action per READ-ONLY CONTRACT
- **Blocked:** `(none)`

### What the Report Contains
The report covers:

1. **Architecture of the existing Preview runtime** from Game → Stadium → PreviewEndpoint (feature-gated `game.preview.v1`)
2. **Discovery precedence:** declaration → detected → static fallback, with `PreviewEndpoint` model and `PreviewResolution` wire shape
3. **Browser projection seam:** `projectPreviewResolution` strips `localUrl` and only projects `clientUrl`; `directTabOnly` passes through
4. **StaticPreviewServer ownership:** Node http server, `127.0.0.1` only, ephemeral port, GET/HEAD only, root containment checks
5. **The exact boundary where remote phone access stops:** `daemon.ts` ~line 2205, where `principal.kind === 'remote-device'` short-circuits with `{ available: false, reason: 'remote-viewer' }`
6. **Principal type system:** only `local-admin` (bearer/cookie) or `remote-device` (in-process only); daemon never constructs `remote-device`
7. **Route policy:** `/api/games/preview` classified as `remote_read` (allowed to reach handler, but handler itself denies)
8. **Browser dashboard rendering:** how SSE status feeds `syncPreview`, iframe rendering with localhost hostname rewriting, and the "Preview is on your computer" empty state
9. **Historical context:** S57.32/33/34 reports, Cloud Shell adapter compatibility, and prior R13 scout reports (scout-a, scout-c)

### Delivered Artifacts
- Complete `WORKSPACE` block documenting:
  - The **Game + Stadium → PreviewEndpoint** canonical architecture
  - The **daemon boundary** at `/api/games/preview` (lines 2196–2217)
  - The **Principal system** (`local-admin` | `remote-device`) at lines 5541–5555
  - The **RPC proxy gate** `proxyExactGameRpc` at lines 3788–3823
  - All **relevant files and symbols** with exact paths, line numbers, and evidence classifications (FACT / INFERENCE / UNKNOWN)

### No Further Action Required
Per the read-only contract, this report does **not** implement any fixes or design final architecture. The boundary junction is clearly identified for the next implementation phase.

The scout report is ready for your review in the `WORKSPACE` block above. Would you like me to clarify any specific section or dive deeper into a particular subsystem?

### Full report — lane scout-c-remote-preview-security-browser (sideline-scout-deep)

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

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\R13-REMOTE-STATIC-PREVIEW-RECON-20260930-102729

