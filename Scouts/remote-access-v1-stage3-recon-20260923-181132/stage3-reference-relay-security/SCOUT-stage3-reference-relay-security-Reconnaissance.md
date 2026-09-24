# Sideline Coach Reconnaissance Report  
**Scout ID:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Type:** Read‑only reconnaissance (not final architectural authority)  
**Objective:** Remote Access v1 — Stage 3 RECON — Lane 2: Reference Relay + Security Boundaries  
**Repository:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Date:** Wed Sep 23 2026  

---

## RESULT  
The accepted Stage 3 architecture consists of a stateless reference relay (plain Node + `ws`) and a RelayClient in the ControlPlaneDaemon. The relay provides subdomain‑based routing to verified host connections, enforces a header allowlist, strips dangerous headers, forwards cookies and origin for CSRF, isolates tenants by hostPublicId, implements Ed25519 challenge‑response authentication, enforces per‑response 1 MiB queues, and logs metadata only. No user/account database exists in v1. All state is transient; nothing is persisted to disk. The Stage 3 acceptance gate is satisfied by an end‑to‑end test on localhost using the in‑repo reference relay.

## KEY DISCOVERIES  
- The `ws` package is already a dependency (package.json line 150) and `@types/ws` a devDependency, satisfying the transport requirement for both the reference relay and the RelayClient.  
- No `relay/` directory or RelayClient implementation exists yet (Stage 2 acceptance confirms Stage 3 was not started).  
- The ADR provides exhaustive specifications for the relay protocol, frame formats, security boundaries, and test expectations.  

## FACT  
- The reference relay is a plain Node.js server using the `ws` package, implementing subdomain → host routing, header allowlist, immediate chunk flush, per‑response 1 MiB cap, and an offline page for host‑offline scenarios (ADR lines 298‑303).  
- The RelayClient in the daemon handles WSS connection, challenge/hello signature verification, frames per D3, heartbeat/backoff/jitter/cancel, and bufferedAmount backpressure (ADR lines 298‑302).  
- The relay routes by subdomain → verified `hostPublicId` → live host socket (ADR line 38).  
- Host identity is proven via Ed25519 challenge‑response: relay sends `{t: 'challenge', nonce}`, host replies with `{t: 'hello', v:1, hostPublicId, publicKey, sig, client}` where `sig = Ed25519(nonce)` (ADR lines 104, 109, 131).  
- The relay binds `hostPublicId → socket` only after signature verification, preventing squatting (ADR line 131).  
- Request frames from browser to host: `{t: 'req', id, method, path, headers, body?, bodyB64?}` with `body ≤ 1 MiB` (ADR line 105).  
- Response frames from host to browser: `{t: 'head', id, status, headers}`, `{t: 'data', id, chunk}` (or `chunkB64`), `{t: 'end', id}`, `{t: 'error', id, code}` (ADR lines 110‑113).  
- The relay writes each chunk immediately (no compression of `text/event-stream`) and does not buffer streaming (ADR line 116).  
- Heartbeat: `ping` every 20 s; two missed `pong`s close the WSS. Host SSE adds `: hb` comment every 15 s (ADR line 117).  
- Host uses backoff 1/2/5/10/30 s with ±20% jitter on reconnect (ADR line 118).  
- Browser disconnect → `cancel(id)` frame → host aborts handler (ADR lines 106, 119).  
- Forwarded headers are an allowlist: `accept`, `content-type`, `cookie`, `origin`, `x‑sideline‑action`, `last‑event‑id`, `user‑agent` (ADR line 121).  
- The relay strips `authorization` (and by inference `proxy‑authorization`) (ADR line 122).  
- The host ignores `?token=` and `Authorization` from remote principals (ADR line 123).  
- Cookie (`sl_dev`) is forwarded unchanged; host validates via DeviceRegistry (ADR line 121, DeviceRegistry usage in Stage 2).  
- Origin header is forwarded; host uses it for CSRF: cookie‑authenticated non‑GET requires `X‑Sideline‑Action: 1` and `Origin` equal to serving origin (ADR line 123, line 203).  
- Tenant isolation: one origin per host (subdomain); relay routes strictly by verified `hostPublicId`; host validates device token itself (ADR line 205).  
- Per‑response queue cap: 1 MiB; host pauses writes while `ws.bufferedAmount > 4 MiB` (ADR line 120).  
- Request body limit: 1 MiB (413 if exceeded) (ADR line 105).  
- Host offline → static "Desktop offline" page or `503 {code:'host_offline'}` (ADR line 41, line 151).  
- Relay logs metadata only: `ts`, `hostPublicId`, method, route *template*, status, bytes, duration. Never bodies, cookies, auth headers, query strings, or fragments (ADR line 206, line 42).  
- Stage 3 acceptance gate: end‑to‑end on localhost (browser‑shaped HTTP client → reference relay → RelayClient → daemon) verifies transport (REST/SSE), failure handling (host offline → 503, 2 MiB body → 413, stalled browser does not stall other requests), and host identity (forged `hostPublicId` without valid signature rejected) (ADR lines 307‑317).  

## INFERENCE  
- The reference relay will likely be a single file (e.g., `relay/index.js`) that creates a `ws` WebSocket server, extracts `hostPublicId` from the `Host` header/subdomain, maintains a map of verified `hostPublicId` to live sockets, assigns unique request IDs (e.g., UUID or incrementing counter) for each browser request, and enforces the header allowlist and 1 MiB queues.  
- The RelayClient will be a new class (e.g., `src/control-plane/relay-client.ts`) that wraps a `ws` WebSocket connection, implements the host‑side of the frame protocol (sending hello with signature, handling req/cancel frames, streaming head/data/end/error), manages heartbeat/ping‑pong, implements exponential backoff with jitter, and respects `bufferedAmount` for backpressure.  
- Nonce generation for the challenge is likely a cryptographically random byte array (e.g., 32 bytes) encoded as base64 or hex for JSON transport; the relay does not retain nonces beyond the handshake.  
- Request IDs are likely unique per connection (e.g., UUID) to avoid collisions and enable correct routing of concurrent requests.  
- Malformed frames (invalid JSON, missing required fields) will cause the relay to close the WSS connection (perhaps with a `goaway` frame) to prevent protocol desynchronization.  
- The offline page served when the host is disconnected is a static HTML file (content unspecified in ADR) and the 503 JSON for API requests is `{code: 'host_offline'}` (consistent with ADR line 151).  
- No persistent configuration files are required for Stage 3; the reference relay in tests can be configured via environment variables or command‑line arguments (e.g., relay domain, host‑to‑socket map).  

## UNKNOWN  
- Exact file structure and naming of the reference relay (e.g., `relay/server.js` vs `relay/index.js`).  
- Precise format of the nonce (string length, encoding) and request ID generation algorithm.  
- Detailed behavior for malformed frames (specific close code or frame type).  
- Exact content of the offline HTML page and the 503 JSON schema (though implied by ADR line 151 and line 41).  
- Whether the relay enforces any rate limits or connection limits in Stage 3 (not specified; likely left to test harness).  

## CONTRADICTION  
None observed. The ADR is internally consistent on the Stage 3 relay/security seam.  

## IMPORTANT FILES / PATHS  
- **Package manifest:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (shows `ws` dependency and `@types/ws` devDependency).  
- **Architecture Decision Record (primary authority):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md` (contains all Stage 3 specifications).  
- **Stage 2 Acceptance (confirms Stage 3 not started):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md`.  
- **Control‑Plane Daemon (existing WebSocket imports for local stadium):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\daemon.ts` (shows `ws` already imported and used for `/stadium` WS, proving transport familiarity).  
- **Stage 2 In‑Process Adapter (reference for frame types and remote‑dispatch pattern):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\remote-dispatch.ts` (defines `FrameReq`, `FrameRes`, and stripping logic).  

---  
**Limitations:** This reconnaissance is based solely on the current repository state and the accepted ADR. No actual Stage 3 relay or RelayClient code exists yet; all details about files, packages, and configuration are inferred from the ADR and existing patterns. The Scout may not execute code, install packages, or modify the repository.  
**End of Report**
