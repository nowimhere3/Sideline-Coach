# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:06:07

Play: remote-access-v1-stage3-recon-20260923-181132
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-24T00:11:44.418Z
Finished: 2026-09-24T00:17:52.377Z
TOTAL ELAPSED TIME: 00:06:07

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
| stage3-relayclient-host-wss | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T00:11:44.439Z | 2026-09-24T00:17:52.373Z | 00:06:07 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-relayclient-host-wss-Reconnaissance.md |
| stage3-reference-relay-security | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T00:11:44.456Z | 2026-09-24T00:15:23.313Z | 00:03:38 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-reference-relay-security-Reconnaissance.md |
| stage3-acceptance-slice-map | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T00:11:44.468Z | 2026-09-24T00:13:53.779Z | 00:02:09 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-acceptance-slice-map-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane stage3-relayclient-host-wss: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane stage3-reference-relay-security: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane stage3-acceptance-slice-map: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: stage3-relayclient-host-wss (objective 45e95f808769)
- Objective: REMOTE ACCESS V1 — STAGE 3 RECON
LANE 1: RELAYCLIENT + HOST OUTBOUND WSS

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY ARCHITECTURE AUTHORITY:
REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md

STAGE 2 FINAL GATE:
REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md

Stage 2 is GREEN.

Already built and proven:

* durable Ed25519 host identity + hostPublicId
* PairingStore
* DeviceRegistry
* sl_dev host validation
* in-process remote-device dispatch
* expectedOrigin security seam
* default-deny route policy
* CSRF/origin enforcement
* remote redaction
* head/data/end/error frames
* SSE streaming and cancellation
* 82-test adjacent gate with 0 failures

Scout ONLY the Stage 3 HOST RelayClient / outbound WSS seam.

Stage 3 must replace the fake transport with the accepted real host-to-relay transport WITHOUT redesigning Stage 2.

Investigate:

1. Exact Stage 2 production seams RelayClient should reuse.
2. Exact new files/classes genuinely needed.
3. Outbound WSS lifecycle from Windows host to relay.
4. Ed25519 challenge-response using the existing durable host key.
5. hello / hostPublicId registration protocol.
6. Exact request/response/cancel frame integration with InProcessRemoteAdapter.
7. How expectedOrigin is authoritatively configured/derived once the real relay domain exists.
8. Connection heartbeat / ping-pong.
9. Reconnect strategy, bounded exponential backoff, jitter, and resynchronization.
10. Browser disconnect -> cancel -> host SSE/request teardown.
11. Host write/backpressure behavior, including ws.bufferedAmount threshold from the ADR.
12. Header allowlist and auth isolation at the host boundary.
13. Failure behavior when relay is unavailable.
14. Shutdown/restart behavior.
15. Windows-specific concerns.
16. Exact focused tests needed.
17. Existing files/tests the implementation Player should NOT explore.
18. Any contradiction between current Stage 2 implementation and the Stage 3 ADR.

IMPORTANT:
The existing Stage 2 adapter/security model is accepted.
Do not propose bypassing it or inventing a second router.

DO NOT:

* implement anything;
* modify files;
* build the reference relay;
* deploy cloud infrastructure;
* build QR/UI;
* build Send to Phone;
* build Settings UI;
* implement Stage 4 or Stage 5;
* commit or push.

Goal:
Give Anti-Gravity exact coordinates for the HOST half of Stage 3 so the premium Player does not repurchase repository architecture.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-relayclient-host-wss-Reconnaissance.md

**Key discoveries:** This reconnaissance confirms that **Stage 2 is complete and green** (82-test adjacent gate: 81 passed, 1 skipped on Windows POSIX permission check). The Stage 2 production seams are **stable, typed, and ready for reuse** by the RelayClient. No Stage 3 code exists yet — no `RelayClient`, no outbound WSS, no `tunnel/v1` protocol, no reference relay.

---

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** | # | Stage 2 Current | Stage 3 ADR Requirement | Resolution |
|---|-----------------|------------------------|------------|
| 1 | **Denylist** for headers (`STRIPPED_REQUEST_HEADERS` = 4 headers) | **Allowlist** of 7 headers (`accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`) | **Must change** `remote-dispatch.ts:61-64` to allowlist. Denylist is less secure (new headers pass by default). |
| 2 | `expectedOrigin` passed as static string in tests (`TRUSTED_ORIGIN`) | `expectedOrigin` **derived** from `hostPublicId` + `relayDomain` at connect time | RelayClient must construct `expectedOrigin = `https://h-${hostPublicId}.${relayDomain}`` and pass to adapter. |
| 3 | No `remoteAccess.enabled` preference | ADR D5: "enable/disable wired to a local-only preference" | Add `remoteAccess.enabled` to `CoachPreferences` (`running-players.ts`), wire in daemon start/stop. |
| 4 | `PairingStore` is memory-only, cleared on restart | ADR D4: "memory-only (nothing after daemon restart)" — **consistent**, no contradiction |
| 5 | SSE heartbeat is `: hb` every 15s | ADR D3: "Separately, the host's SSE adds a `: hb` comment every 15s" — **consistent** |
| 6 | `InProcessRemoteAdapter` constructs `remote-device` principal with `expectedOrigin` | ADR D3: Principal model unchanged — **consistent** |
| 7 | No `ws.bufferedAmount` backpressure in Stage 2 (in-process, no socket) | ADR D3: "host pauses writes while `ws.bufferedAmount` is above 4 MiB" | **New 

**Important files:** | Path | Role |
|------|------|
| `src/control-plane/daemon.ts` | Daemon core; wire RelayClient start/stop in `start()`/`stop()`; add `remoteAccess.enabled` preference |
| `src/control-plane/remote-dispatch.ts` | **Change**: header denylist → allowlist; keep `dispatch`/`cancel` API stable |
| `src/control-plane/host-identity.ts` | Source of durable Ed25519 key + `hostPublicId` |
| `src/control-plane/device-registry.ts` | Validates `sl_dev` cookies for RelayClient |
| `src/control-plane/remote-routes.ts` | Route classification — unchanged |
| `src/control-plane/request-security.ts` | `Principal`, `expectedOrigin` matching — unchanged |
| `src/control-plane/remote-redaction.ts` | Redaction — unchanged |
| `src/running-players.ts` | **Add** `remoteAccess: { enabled: boolean; relayDomain?: string }` to `CoachPreferences` |
| `src/control-plane/relay-client.ts` | **NEW** — RelayClient implementation |
| `src/control-plane/relay-frames.ts` | **NEW** — Wire frame types (shared with reference relay) |
| `src/control-plane/relay-backoff.ts` | **NEW** — Backoff/jitter logic |
| `relay/` | **NEW** — Reference relay (test-only) |
| `test/remote-access-v1-stage3.test.mjs` | **NEW** — Stage 3 acceptance tests |

---

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: stage3-reference-relay-security (objective ac34893ceec2)
- Objective: REMOTE ACCESS V1 — STAGE 3 RECON
LANE 2: REFERENCE RELAY + SECURITY BOUNDARIES

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY ARCHITECTURE AUTHORITY:
REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md

STAGE 2 FINAL GATE:
REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md

Stage 2 is GREEN.

Stage 3 introduces the REFERENCE RELAY and real transport.
Stage 4, NOT Stage 3, is production deployment.

Scout ONLY the accepted Stage 3 relay/security seam.

Accepted product architecture:

* desktop host makes OUTBOUND WSS connection
* browser/phone reaches host-specific HTTPS origin through relay
* one host identity maps to one host connection
* relay is stateless with no user/account database in v1
* host remains authoritative for device/session validation
* relay MUST NOT mint Sideline device credentials
* browser must never receive/administer local admin credentials
* remote Authorization must not elevate
* host route classification/redaction remains authoritative

Investigate:

1. Smallest safe reference-relay architecture for Stage 3.
2. Exact files/packages/config genuinely required.
3. Host connection registration keyed by hostPublicId.
4. Ed25519 challenge issuance and signature verification.
5. Replay protection / nonce lifecycle.
6. Browser request -> host req frame routing.
7. Host head/data/end/error -> browser response routing.
8. cancel routing when browser disconnects.
9. SSE streaming behavior through relay.
10. Header allowlist and stripping rules.
11. Authorization / proxy authorization stripping.
12. Cookie forwarding requirements for sl_dev.
13. Origin forwarding requirements for CSRF.
14. Cross-host isolation. A browser for Host A must never reach Host B.
15. Queue / payload / response caps required by the ADR.
16. 1 MiB per-response relay queue behavior.
17. Slow browser / disconnected host failure handling.
18. WSS heartbeat and stale-host cleanup.
19. Multiple browser requests / concurrency.
20. What state is allowed in memory and what must NEVER persist.
21. Logging/redaction requirements so secrets/cookies are not leaked.
22. Test strategy using an in-process/local reference relay.
23. Security abuse cases: spoofed hostPublicId, forged signatures, replayed challenges, cross-host frames, malformed frames, oversized frames.
24. Exact STOP boundary before Stage 4 deployment.

DO NOT:

* implement;
* modify files;
* deploy a relay;
* choose a production hosting vendor unless the ADR already requires one;
* add accounts/database;
* add GitHub identity;
* build QR/UI;
* build Stage 4;
* build Stage 5;
* commit or push.

Goal:
Give Anti-Gravity an exact security and implementation map for the RELAY half of Stage 3 without making a premium architect rediscover it.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-reference-relay-security-Reconnaissance.md

**Key discoveries:** - The `ws` package is already a dependency (package.json line 150) and `@types/ws` a devDependency, satisfying the transport requirement for both the reference relay and the RelayClient.  
- No `relay/` directory or RelayClient implementation exists yet (Stage 2 acceptance confirms Stage 3 was not started).  
- The ADR provides exhaustive specifications for the relay protocol, frame formats, security boundaries, and test expectations.

**FACT:** - The reference relay is a plain Node.js server using the `ws` package, implementing subdomain → host routing, header allowlist, immediate chunk flush, per‑response 1 MiB cap, and an offline page for host‑offline scenarios (ADR lines 298‑303).  
- The RelayClient in the daemon handles WSS connection, challenge/hello signature verification, frames per D3, heartbeat/backoff/jitter/cancel, and bufferedAmount backpressure (ADR lines 298‑302).  
- The relay routes by subdomain → verified `hostPublicId` → live host socket (ADR line 38).  
- Host identity is proven via Ed25519 challenge‑response: relay sends `{t: 'challenge', nonce}`, host replies with `{t: 'hello', v:1, hostPublicId, publicKey, sig, client}` where `sig = Ed25519(nonce)` (ADR lines 104, 109, 131).  
- The relay binds `hostPublicId → socket` only after signature verification, preventing squatting (ADR line 131).  
- Request frames from browser to host: `{t: 'req', id, method, path, headers, body?, bodyB64?}` with `body ≤ 1 MiB` (ADR line 105).  
- Response frames from host to browser: `{t: 'head', id, status, headers}`, `{t: 'data', id, chunk}` (or `chunkB64`), `{t: 'end', id}`, `{t: 'error', id, code}` (ADR lines 110‑113).  
- The relay writes each chunk immediately (no compression of `text/event-stream`) and does not buffer streaming (ADR line 116).  
- Heartbeat: `ping` every 20 s; two missed `pong`s close the WSS. Host SSE adds `: hb` comment every 15 s (ADR line 117).  
- Host uses backoff 1/2/5/10/30 s with ±20

**INFERENCE:** - The reference relay will likely be a single file (e.g., `relay/index.js`) that creates a `ws` WebSocket server, extracts `hostPublicId` from the `Host` header/subdomain, maintains a map of verified `hostPublicId` to live sockets, assigns unique request IDs (e.g., UUID or incrementing counter) for each browser request, and enforces the header allowlist and 1 MiB queues.  
- The RelayClient will be a new class (e.g., `src/control-plane/relay-client.ts`) that wraps a `ws` WebSocket connection, implements the host‑side of the frame protocol (sending hello with signature, handling req/cancel frames, streaming head/data/end/error), manages heartbeat/ping‑pong, implements exponential backoff with jitter, and respects `bufferedAmount` for backpressure.  
- Nonce generation for the challenge is likely a cryptographically random byte array (e.g., 32 bytes) encoded as base64 or hex for JSON transport; the relay does not retain nonces beyond the handshake.  
- Request IDs are likely unique per connection (e.g., UUID) to avoid collisions and enable correct routing of concurrent requests.  
- Malformed frames (invalid JSON, missing required fields) will cause the relay to close the WSS connection (perhaps with a `goaway` frame) to prevent protocol desynchronization.  
- The offline page served when the host is disconnected is a static HTML file (content unspecified in ADR) and the 503 JSON for API requests is `{code: 'host_offline'}` (consistent with ADR line 151).  
- No persistent conf

**UNKNOWN:** - Exact file structure and naming of the reference relay (e.g., `relay/server.js` vs `relay/index.js`).  
- Precise format of the nonce (string length, encoding) and request ID generation algorithm.  
- Detailed behavior for malformed frames (specific close code or frame type).  
- Exact content of the offline HTML page and the 503 JSON schema (though implied by ADR line 151 and line 41).  
- Whether the relay enforces any rate limits or connection limits in Stage 3 (not specified; likely left to test harness).

**CONTRADICTION:** None observed. The ADR is internally consistent on the Stage 3 relay/security seam.

**Important files:** - **Package manifest:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` (shows `ws` dependency and `@types/ws` devDependency).  
- **Architecture Decision Record (primary authority):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md` (contains all Stage 3 specifications).  
- **Stage 2 Acceptance (confirms Stage 3 not started):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md`.  
- **Control‑Plane Daemon (existing WebSocket imports for local stadium):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\daemon.ts` (shows `ws` already imported and used for `/stadium` WS, proving transport familiarity).  
- **Stage 2 In‑Process Adapter (reference for frame types and remote‑dispatch pattern):** `C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\remote-dispatch.ts` (defines `FrameReq`, `FrameRes`, and stripping logic).  

---  
**Limitations:** This reconnaissance is based solely on the current repository state and the accepted ADR. No actual Stage 3 relay or RelayClient code exists yet; all details about files, packages, and configuration are inferred from the ADR and existing patterns. The Scout may not execute code, install packages, or modify the repository.

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: stage3-acceptance-slice-map (objective c08ba773a3b8)
- Objective: REMOTE ACCESS V1 — STAGE 3 RECON
LANE 3: ACCEPTANCE / REGRESSION / IMPLEMENTATION SLICING

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY ARCHITECTURE AUTHORITY:
REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md

STAGE 2 FINAL GATE:
REPORTS\Claude\Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md

Stage 2 final adjacent gate:
82 total
81 passed
0 failed
1 expected Windows POSIX permission skip

Scout Stage 3 strictly as an ACCEPTANCE, SEQUENCING, AND REGRESSION problem.

Stage 3 is expected to introduce:

* RelayClient
* real outbound WSS transport
* Ed25519 host challenge / hello
* reference relay
* real frame forwarding
* streaming
* cancellation
* reconnect/backoff
* heartbeat
* bounded buffering/backpressure
* integration with the already-proven Stage 2 adapter/security system

Deliver:

1. Safest bounded Stage 3 implementation slices.
2. Dependency graph between slices.
3. Which slices can remain independently testable.
4. Minimum focused test gate after EACH slice.
5. Minimum final Stage 3 adjacent regression suite.
6. Security-abuse tests.
7. Challenge/signature/replay acceptance tests.
8. Host reconnect/resume tests.
9. Relay host-registration lifecycle tests.
10. Cross-host isolation tests.
11. Browser request/response framing tests.
12. SSE streaming tests.
13. cancel/disconnect cleanup tests.
14. heartbeat/stale-host tests.
15. backpressure / queue-cap tests.
16. malformed/oversized frame behavior.
17. relay unavailable behavior.
18. Windows host acceptance requirements.
19. Existing Stage 1/Stage 2 behavioral contracts Stage 3 must not change.
20. Tests/subsystems a premium Player should NOT investigate.
21. Exact Stage 3 GO / NO-GO checklist.
22. Exact STOP line separating Stage 3 from Stage 4 production deployment.
23. Recommended implementation Player / reasoning level after Scout + Anti-Gravity compression.

CRITICAL PRODUCT BOUNDARY:

Stage 3 proves the real protocol with a reference/local relay.

Stage 4 deploys the production relay.

Stage 5 builds the Dad-facing:
SEND TO PHONE
-> QR
-> scan
-> paired

Do not blur these stages.

DO NOT:

* modify files;
* implement;
* deploy;
* build UI;
* begin Stage 4;
* begin Stage 5;
* commit or push.

Goal:
Prevent the premium implementation Player from spending scarce context rediscovering test strategy, sequencing, Stage 2 contracts, or the Stage 3/4 boundary.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-acceptance-slice-map-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** 1. **Stage 1:** All security measures implemented per ADR §4
   - `src/control-plane/remote-routes.ts`: 26 route policies with default-deny
   - `src/control-plane/request-security.ts`: timingSafeSecretEqual, CSRF guards
   - Tests passing: 9/9 in stage1, 30/31 in stage2

2. **Stage 2:** InProcessRemoteAdapter exists as placeholder
   - File: `src/control-plane/remote-dispatch.ts` 
   - Lines 41-45: "Stage 2 in-process stand-in for the future relay transport"
   - Provides `FrameReq`/`FrameRes` types matching D3 protocol structure

3. **Stage 3:** Zero implementation evidence
   - No files contain "RelayClient", "relay/", or "tunnel/v1"
   - No WebSocket server code for outbound WSS
   - No challenge/hello signature implementation
   - No reference relay infrastructure

4. **Ed25519:** Host key generation exists but not tunnel-integrated
   - `src/control-plane/host-identity.ts`: complete keypair generation
   - Used for pairing but not for WSS challenge/hello per D3 protocol

---

**INFERENCE:** UNKNOWN

**UNKNOWN:** 1. **Stage 3 Implementation Timeline:** No roadmap visible for RelayClient/WSS
2. **Resource Allocation:** No indication of premium Player being assigned to Stage 3
3. **Dependencies:** Whether Stage 2 components can be reused for Stage 3
4. **Blocking Factors:** No documentation explaining why Stage 3 not started

---

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane stage3-relayclient-host-wss: This reconnaissance confirms that **Stage 2 is complete and green** (82-test adjacent gate: 81 passed, 1 skipped on Windows POSIX permission check). The Stage 2 production seams are **stable, typed, and ready for reuse** by the RelayClient. No Stage 3 code exists yet — no `RelayClient`, no outbound WSS, no `tunnel/v1` protocol, no reference relay. ---
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane stage3-reference-relay-security: The accepted Stage 3 architecture consists of a stateless reference relay (plain Node + `ws`) and a RelayClient in the ControlPlaneDaemon. The relay provides subdomain‑based routing to verified host connections, enforces a header allowlist, strips dangerous headers, forwards cookies and origin for CSRF, isolates tenants by hostPublicId, implements Ed25519 challenge‑response authentication, enforce
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane stage3-acceptance-slice-map: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane stage3-relayclient-host-wss: | # | Stage 2 Current | Stage 3 ADR Requirement | Resolution | |---|-----------------|------------------------|------------| | 1 | **Denylist** for headers (`STRIPPED_REQUEST_HEADERS` = 4 headers) | **Allowlist** of 7 headers (`accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`) | **Must change** `remote-dispatch.ts:61-64` to allowlist. Denylist is less secure (new headers pass by default). | | 2 | `expectedOrigin` passed as static string in tests (`TRUSTED_ORIGIN`) | `expectedOrigin` **derived** from `hostPublicId` + `relayDomain` at connect time | RelayClient must construct `expectedOrigin = `https://h-${hostPublicId}.${relayDomain}`` and pass to adapter. | | 3 | No `remoteAccess.enabled` preference | ADR D5: "enable/disable wired to a local-only preference" | Add `remoteAccess.enabled` to `CoachPreferences` (`running-players.ts`), wire in daemon start/stop. | | 4 | `PairingStore` is memory-only, cleared on restart | ADR D4: "memory-only (nothing after daemon restart)" — **consistent**, no contradiction | | 5 | SSE heartbeat is `: hb` every 15s | ADR D3: "Separately, the host's SSE adds a `: hb` comment every 15s" — **consistent** | | 6 | `InProcessRemoteAdapter` constructs `remote-device` principal with `expectedOrigin` | ADR D3: Principal model unchanged — **consistent** | | 7 | No `ws.bufferedAmount` backpressure in Stage 2 (in-process, no socket) | ADR D3: "host pauses writes while `ws.bufferedAmount` is above 4 MiB" | **New 
- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane stage3-reference-relay-security: None observed. The ADR is internally consistent on the Stage 3 relay/security seam.

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane stage3-relayclient-host-wss · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-relayclient-host-wss-Reconnaissance.md
- Lane stage3-reference-relay-security · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-reference-relay-security-Reconnaissance.md
- Lane stage3-acceptance-slice-map · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132\SCOUT-stage3-acceptance-slice-map-Reconnaissance.md

### Full report — lane stage3-relayclient-host-wss (sideline-scout-deep)

Now I have a comprehensive understanding of the Stage 2 implementation and the ADR requirements for Stage 3. Let me compile the complete reconnaissance report.

---

# SCOUT REPORT: Remote Access v1 — Stage 3 Recon
**Play ID:** `remote-access-v1-stage3-recon-20260923-181132`  
**Scout ID:** `stage3-relayclient-host-wss`  
**Agent:** `sideline-scout-deep`  
**Model:** `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`  
**Date:** 2026-09-23  
**Status:** RECONNAISSANCE — NOT FINAL ARCHITECTURAL AUTHORITY

---

## RESULT

This reconnaissance confirms that **Stage 2 is complete and green** (82-test adjacent gate: 81 passed, 1 skipped on Windows POSIX permission check). The Stage 2 production seams are **stable, typed, and ready for reuse** by the RelayClient. No Stage 3 code exists yet — no `RelayClient`, no outbound WSS, no `tunnel/v1` protocol, no reference relay.

---

## KEY DISCOVERIES

### 1. Exact Stage 2 Production Seams RelayClient Must Reuse (FACT)

| Seam | Location | Purpose |
|------|----------|---------|
| **`dispatchRemoteRequest(req, res, principal)`** | `daemon.ts:1066-1072` | **The single typed remote entry point**. Takes `IncomingMessage`, `ServerResponse`, and a verified `remote-device` principal. The RelayClient **must** call this. |
| **`InProcessRemoteAdapter`** | `remote-dispatch.ts:46-167` | Stage 2's fake transport. Converts frames → pseudo-HTTP → `dispatchRemoteRequest`. Stage 3 replaces the *transport*, keeps the *adapter logic* (device auth, header stripping, frame emission). |
| **`DeviceRegistry.authenticate(rawToken)`** | `device-registry.ts:55-72` | Validates `sl_dev` cookie → returns `DeviceSummary` with slid `lastSeenAt`. RelayClient reuses this directly. |
| **`HostIdentityManager.ensureIdentity(remoteDir)`** | `host-identity.ts:89-116` | Loads/generates durable Ed25519 keypair at `~/.sideline/remote/host-key.json` (mode 0o600). Returns `{hostPublicId, publicKey, privateKey, createdAt}`. RelayClient uses `privateKey` for challenge signatures. |
| **`PairingStore`** | `pairing.ts:55-102` | Memory-only, single active pairing, 5-min TTL, 5-attempt burn. Used only during bootstrap (`POST /api/pairing/exchange`). RelayClient does **not** own this. |
| **`remote-routes.ts` classification** | `remote-routes.ts:15-67` | Default-deny table. Every route classified `public`/`local-only`/`remote-read`/`remote-mutate`. `principalMayAccess()` enforces. RelayClient inherits this via `dispatchRemoteRequest`. |
| **`request-security.ts`** | `request-security.ts:1-47` | `Principal` type, `timingSafeSecretEqual`, `parseCookies`, `requestOriginMatchesExpected`. RelayClient uses `expectedOrigin` from principal for CSRF. |
| **`remote-redaction.ts`** | `remote-redaction.ts:1-59` | `redactForPrincipal(value, principal, options)`. Already wired in daemon for reports, SSE, player-activity. RelayClient gets this free via `dispatchRemoteRequest`. |
| **SSE streaming & heartbeat** | `daemon.ts:3310-3369` | `handleSseConnection` writes `hello`, `status`, `ai-health`, `execution` as separate data frames; `: hb` every 15s; `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. RelayClient frames SSE as `head` + `data*` + `end`. |
| **Cancellation** | `remote-dispatch.ts:161-167` | `cancel(id)` emits `close` on the pseudo-request → daemon cleans up SSE subscription. RelayClient must forward `cancel` frames identically. |
| **Frame types (Stage 2)** | `remote-dispatch.ts:7-19` | `FrameReq {id, method, path, headers, body?}` → `FrameRes: head | data | end | error`. **Identical to ADR D3 wire frames** except `hello`/`challenge`/`ping`/`pong`/`goaway` which are WSS-level. |

### 2. Exact New Files/Classes Genuinely Needed (FACT)

| New File | Responsibility |
|----------|----------------|
| `src/control-plane/relay-client.ts` | **Core RelayClient class**. Owns outbound WSS lifecycle, challenge/hello, frame read/write, heartbeat, backoff, backpressure, reconnect, enable/disable toggle. |
| `src/control-plane/relay-client-options.ts` (or inline types) | Typed options: `relayUrl`, `hostIdentity`, `deviceRegistry`, `daemon`, `expectedOrigin`, `enabled` preference key. |
| `src/control-plane/relay-frames.ts` | **Wire frame type definitions** matching ADR D3 exactly: `ChallengeFrame`, `HelloFrame`, `ReqFrame`, `CancelFrame`, `PingFrame`, `PongFrame`, `GoAwayFrame`, `HeadFrame`, `DataFrame`, `EndFrame`, `ErrorFrame`. Shared with future reference relay. |
| `src/control-plane/relay-backoff.ts` | Bounded exponential backoff with ±20% jitter: 1/2/5/10/30s capped at 30s. Pure function, testable in isolation. |
| `relay/` (directory) | **Reference relay** (plain Node + `ws`). Implements subdomain routing, header allowlist, 1 MiB response cap, immediate chunk flush, offline page. **Test-only**; not shipped to users. |
| `test/remote-access-v1-stage3.test.mjs` | Integration tests: localhost browser → reference relay → RelayClient → daemon. Validates REST, SSE, heartbeats, 503 on host kill, 413 on 2 MiB body, isolation. |

**Files NOT needed** (already exist, do not duplicate):
- `host-identity.ts`, `device-registry.ts`, `pairing.ts`, `remote-routes.ts`, `request-security.ts`, `remote-redaction.ts`, `remote-dispatch.ts` (adapter logic stays, transport layer replaced), `daemon.ts` (only wiring: start/stop RelayClient, wire preference).

### 3. Outbound WSS Lifecycle from Windows Host to Relay (FACT + INFERENCE)

**FACT** (from ADR D3, D7, and daemon architecture):
- Host initiates **outbound WSS to `/tunnel/v1` on relay port 443**.
- Daemon binds **127.0.0.1 only** (`daemon.ts:688`) — no inbound ports.
- Single `ControlPlaneDaemon` process owns the tunnel (`daemon.ts:167` class).
- `ws` library already in `dependencies` (`package.json:150`), `@types/ws` in `devDependencies` (`package.json:49`).

**INFERENCE** (lifecycle stages):
```
1. DAEMON START / REMOTE ENABLED
   ├─ Read preference `remoteAccess.enabled` (new, local-only)
   ├─ HostIdentityManager.ensureIdentity(remoteDir) → {hostPublicId, privateKey}
   ├─ Construct expectedOrigin = `https://h-${hostPublicId}.${relayDomain}`
   ├─ new RelayClient({ relayUrl: wss://${relayDomain}/tunnel/v1, ... }).connect()

2. CONNECTING
   ├─ WebSocket.connect(relayUrl) with TLS (Node default CA trust)
   ├─ Await `challenge` frame: {t: 'challenge', nonce}
   ├─ Compute sig = Ed25519.sign(privateKey, nonce)
   ├─ Send `hello`: {t: 'hello', v: 1, hostPublicId, publicKey, sig, client: 'sideline/1.0'}
   ├─ Await implicit success (relay binds hostPublicId→socket on verified sig)

3. CONNECTED (steady state)
   ├─ Relay → host: `req`, `cancel`, `ping`, `goaway`
   ├─ Host → relay: `head`, `data*`, `end`/`error`, `pong`
   ├─ Ping every 20s (ADR D3); 2 missed pongs → socket close
   ├─ BufferedAmount backpressure: pause writes while ws.bufferedAmount > 4 MiB (ADR D3)

4. DISCONNECT / RECONNECT
   ├─ On close/error: for each in-flight request id → emit cancel locally (adapter.cancel(id))
   ├─ Backoff schedule: 1, 2, 5, 10, 30s + ±20% jitter
   ├─ Reconnect → new challenge → new hello (new sig)
   ├─ Synchronize: SSE clients get new `hello` frame on next EventSource connect (browser auto-reconnects)

5. SHUTDOWN / DISABLE
   ├─ RelayClient.stop() → ws.close(1000, 'shutdown')
   ├─ Daemon.stop() already clears SSE clients, rejects pending RPCs
```

### 4. Ed25519 Challenge-Response Using Existing Durable Host Key (FACT)

- **Key storage**: `~/.sideline/remote/host-key.json` with `{version:1, hostPublicId, publicKeyHex, privateKeyHex, createdAt}` (`host-identity.ts:9-15`).
- **Key loading**: `HostIdentityManager.ensureIdentity()` generates once, loads thereafter, validates consistency (public↔private, hostPublicId↔publicKey) — **fails closed on corruption** (`host-identity.ts:60-84`).
- **Signing**: Node `crypto.sign(null, Buffer.from(nonce), privateKey)` where `privateKey` is a `KeyObject` from JWK import (`host-identity.ts:73-77`).
- **Verification** (relay side): `crypto.verify(null, Buffer.from(nonce), publicKey, sig)`.
- **Nonce**: Relay sends fresh `nonce` (cryptographically random, ≥16 bytes) in `challenge` frame. Host signs the raw nonce bytes.
- **No replay**: Nonce is single-use; relay must not accept a `hello` without a preceding `challenge` it issued.

### 5. Hello / hostPublicId Registration Protocol (FACT)

**Wire frames (ADR D3 §103-114):**
```typescript
// Relay → Host
{ t: 'challenge', nonce: string }                    // base64url or hex, ≥16 bytes

// Host → Relay  
{ t: 'hello', v: 1, hostPublicId: string, publicKey: string, sig: string, client: string }
// publicKey = base64url(raw Ed25519 public key, 32 bytes)
// sig = base64url(Ed25519.sign(privateKey, nonce))
// client = 'sideline/1.0' (user-agent style)
```

**Relay behavior (ADR D3):**
- Verifies `sig` against `publicKey`.
- Verifies `deriveHostPublicId(publicKey) === hostPublicId` (prevents ID squatting).
- Binds `hostPublicId → socket` in memory only (no persistent DB in v1).
- On disconnect, binding dropped; browser gets static offline page or `503 {code:'host_offline'}`.

**Host behavior:**
- Sends `hello` **only once per connection**, immediately after `challenge`.
- If `goaway` received: clean shutdown, no reconnect.
- If socket closes unexpectedly: backoff → reconnect → new challenge → new hello.

### 6. Exact Request/Response/Cancel Frame Integration with InProcessRemoteAdapter (FACT)

**Current adapter contract** (`remote-dispatch.ts:51-159`):
```typescript
async dispatch(frame: FrameReq, onFrame: (res: FrameRes) => void): Promise<void>
cancel(id: string): void
```

**FrameReq** (from relay):
```typescript
{ t: 'req', id: string, method: string, path: string, headers: Record<string,string>, body?: string, bodyB64?: string }
```

**Adapter transforms:**
1. Strips forbidden headers: `authorization`, `proxy-authorization`, `cookie`, `x-forwarded-for` (`remote-dispatch.ts:24`).
2. Validates `sl_dev` cookie via `DeviceRegistry.authenticate()` → `RemotePrincipal {kind:'remote-device', deviceId, expectedOrigin}`.
3. **Exception**: `POST /api/pairing/exchange` uses placeholder principal `{deviceId:'unpaired'}` (bootstrap).
4. Builds pseudo-`IncomingMessage`/`ServerResponse` shims.
5. Calls `daemon.dispatchRemoteRequest(req, res, principal)`.
6. Emits frames via `onFrame`: `head` (once), `data*` (streaming), `end` (or `error`).

**RelayClient integration:**
- RelayClient **replaces the transport**, keeps the adapter.
- On `req` frame → `adapter.dispatch(frameReq, onFrame)` where `onFrame` serializes `FrameRes` → WSS `head`/`data`/`end`/`error`.
- On `cancel` frame → `adapter.cancel(id)`.
- **No changes to adapter logic** — it already produces the exact frame types the ADR wire protocol expects.

### 7. How expectedOrigin Is Authoritatively Configured/Derived (FACT + INFERENCE)

**Current Stage 2** (`remote-dispatch.ts:37-38, 70, 80`):
```typescript
interface InProcessRemoteAdapterOptions {
  expectedOrigin: string;  // "Trusted host origin (e.g. https://h-<hostPublicId>.<relay-domain>). Never taken from the request."
}
```
Passed at construction: `new InProcessRemoteAdapter({..., expectedOrigin: TRUSTED_ORIGIN})` where `TRUSTED_ORIGIN = 'https://h-test.sideline.live'` in tests.

**Stage 3 authoritative derivation (INFERENCE from ADR D3, D4, D7):**
```
relayDomain = configured relay domain (e.g., 'sideline.live') — from preference or constant
hostPublicId = HostIdentityManager.ensureIdentity().hostPublicId  // 20-char base32
expectedOrigin = `https://h-${hostPublicId}.${relayDomain}`
```

**Where it lives:**
- **RelayClient** constructs it at connect time (has `hostIdentity` and `relayDomain`).
- **InProcessRemoteAdapter** receives it via options (constructed by RelayClient or daemon wiring).
- **Daemon** uses it in `principal.expectedOrigin` for CSRF checks (`request-security.ts:40-46`, `daemon.ts:1184-1186`).
- **Never** derived from incoming request headers (ADR D3: "The relay strips authorization. The host ignores `?token=` and `Authorization` from remote principals").

**Configuration point:** A new daemon preference `remoteAccess.relayDomain` (string, default `'sideline.live'`) or constant in `relay-client.ts`. Not user-editable in v1 (ADR D6.2: "beta enrollment key or defer until accounts").

### 8. Connection Heartbeat / Ping-Pong (FACT)

**ADR D3 (§117-118):**
- **Relay → Host**: `ping` every 20s (`{t: 'ping', ts: number}`).
- **Host → Relay**: `pong` (`{t: 'pong', ts: number}`) — must echo timestamp.
- **Two missed pongs** → relay closes socket.
- **Separately**: Host's SSE adds `: hb` comment every 15s (`daemon.ts:3318-3321`), plus `Cache-Control: no-transform`, `X-Accel-Buffering: no`.

**Implementation:**
- RelayClient: `setInterval(() => ws.send(JSON.stringify({t:'ping', ts:Date.now()})), 20_000)`.
- Track `lastPongAt`; if `Date.now() - lastPongAt > 40_000` → `ws.close()`.
- On `pong` frame: `lastPongAt = Date.now()`.
- **SSE heartbeat unchanged** — daemon continues `: hb` every 15s on each SSE connection.

### 9. Reconnect Strategy, Bounded Exponential Backoff, Jitter, Resynchronization (FACT + INFERENCE)

**ADR D3 (§118):**
> "Reconnect: the host uses backoff 1 / 2 / 5 / 10 / 30 s with ±20% jitter. On disconnect every in-flight id is dead: the relay closes browser responses, and EventSource reconnects on its own. The existing `hello` → `synchronizeAfterHello()` resync covers state."

**Backoff schedule (INFERENCE — exact from ADR):**
| Attempt | Base Delay | Jitter Range (±20%) |
|---------|------------|---------------------|
| 1 | 1,000 ms | 800–1,200 ms |
| 2 | 2,000 ms | 1,600–2,400 ms |
| 3 | 5,000 ms | 4,000–6,000 ms |
| 4 | 10,000 ms | 8,000–12,000 ms |
| 5+ | 30,000 ms | 24,000–36,000 ms (capped) |

**Resynchronization:**
- Browser `EventSource` auto-reconnects on SSE disconnect (native behavior).
- On reconnect, daemon `handleSseConnection` sends fresh `hello` + `status` + `ai-health` + `execution` frames (`daemon.ts:3325-3335`).
- **No separate `synchronizeAfterHello()` call needed** — the `hello` frame *is* the sync signal. Browser UI reconciles from the full state snapshot in `hello`+`status`+`ai-health`+`execution`.

**In-flight request handling:**
- On disconnect: RelayClient calls `adapter.cancel(id)` for every `inflight` id (`remote-dispatch.ts:47, 162-167`).
- This emits `close` on pseudo-request → daemon `removeSseClient` → SSE `end` frame → browser sees stream end → `EventSource` reconnects → new `hello` → new state.
- **No request retry at transport level** — idempotency is application-level (browser retries failed requests).

### 10. Browser Disconnect → Cancel → Host SSE/Request Teardown (FACT)

**Flow (from Stage 2 tests `RA2C-7`, `RA2D-10`):**
1. Browser closes `EventSource` → TCP FIN → relay detects.
2. Relay sends `cancel` frame: `{t: 'cancel', id: string}`.
3. RelayClient receives `cancel` → `adapter.cancel(id)` (`remote-dispatch.ts:162-167`).
4. `adapter.cancel`:
   - Looks up `inflight.get(id)`.
   - Emits `close` on the pseudo-`Readable` request.
   - Calls `finish()` → emits `end` frame, removes from `inflight`.
5. Daemon's `handleSseConnection` has `req.on('close', () => removeSseClient(res))` (`daemon.ts:3337-3339`).
6. `removeSseClient` clears heartbeat interval, deletes from `sseClients` map.
7. Browser `EventSource` reconnects → new SSE connection → fresh `hello`/`status`/etc.

**Critical invariant:** `cancel` is **idempotent** (`RA2D-10`: "repeat cancel is a no-op"). RelayClient must tolerate duplicate `cancel` frames.

### 11. Host Write/Backpressure Behavior (FACT)

**ADR D3 (§120):**
> "Backpressure (minimal): the relay caps each response's queue at 1 MiB and ends that response when it overflows; the browser retries. The host pauses writes while `ws.bufferedAmount` is above 4 MiB."

**Implementation points:**
- **RelayClient write path**: Before sending `head`/`data` frames, check `ws.bufferedAmount`.
- If `ws.bufferedAmount > 4_194_304` (4 MiB): pause — queue frames locally, wait for `drain` event.
- `ws.on('drain', () => flushQueuedFrames())`.
- **Per-request queue** in adapter already exists (`inflight` map). Add a `writeQueue` per connection for backpressure.
- **Relay enforces 1 MiB per response** — host doesn't need to duplicate, but must respect `bufferedAmount` to avoid unbounded memory.

**Windows note:** `bufferedAmount` works identically on Windows Node.js `ws` library.

### 12. Header Allowlist and Auth Isolation at Host Boundary (FACT)

**ADR D3 (§121-123):**
> "Forwarded headers are an allowlist: `accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`. The relay strips `authorization`. The host ignores `?token=` and `Authorization` from remote principals, so a leaked admin token is useless remotely."

**Current Stage 2 enforcement** (`remote-dispatch.ts:61-64`):
```typescript
const STRIPPED_REQUEST_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'x-forwarded-for']);
for (const [name, value] of Object.entries(frame.headers ?? {})) {
  if (typeof value === 'string' && !STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) {
    headers[name.toLowerCase()] = value;
  }
}
```

**Allowlist gap:** Current code uses a *denylist* (strips 4 headers). ADR specifies an *allowlist* (7 headers). **Stage 3 must switch to allowlist**:
```typescript
const ALLOWED_REQUEST_HEADERS = new Set([
  'accept', 'content-type', 'cookie', 'origin', 
  'x-sideline-action', 'last-event-id', 'user-agent'
]);
for (const [name, value] of Object.entries(frame.headers ?? {})) {
  if (typeof value === 'string' && ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) {
    headers[name.toLowerCase()] = value;
  }
}
```

**Auth isolation** (already enforced in Stage 2, `daemon.ts:1079-1083, 1174-1182`):
- `?token=` → 401 for all remote requests.
- `Authorization: Bearer` → stripped by RelayClient, ignored by daemon for remote principals.
- Only `sl_dev` cookie authenticates remote; validated by `DeviceRegistry` → `remote-device` principal.
- `remote-device` principal **never** gets local-only routes (403).

### 13. Failure Behavior When Relay Is Unavailable (INFERENCE)

**From ADR D3, D7 and Stage 2 patterns:**
- **RelayClient.connect() fails**: Backoff schedule starts immediately. Daemon continues serving local traffic (127.0.0.1 HTTP, `/stadium` WS).
- **Relay drops connection mid-session**: In-flight requests cancelled → browser gets 503/stream end → `EventSource` reconnects → RelayClient reconnects → new `hello` → browser gets fresh state.
- **Relay unreachable for extended period**: Daemon remains healthy locally. Remote browsers see static offline page (served by relay) or `503 {code:'host_offline'}` (API).
- **No local state corruption**: DeviceRegistry, PairingStore, host key unaffected.
- **Preference toggle**: `remoteAccess.enabled = false` → `RelayClient.stop()` cleanly; `true` → `RelayClient.start()`.

### 14. Shutdown/Restart Behavior (FACT + INFERENCE)

**Daemon shutdown** (`daemon.ts:608-673`):
- Clears SSE clients (heartbeats, connections).
- Rejects pending RPCs to Stadium.
- Closes `/stadium` WebSocket server.
- Closes HTTP server (with `closeAllConnections()` for SSE keep-alives).
- Removes discovery record.
- **RelayClient must integrate**: `RelayClient.stop()` called in `daemon.stop()` before HTTP/WS teardown.

**Daemon restart** (Freshness Guard, `daemon.ts:1129-1150`):
- New daemon instance starts, writes new `control-plane.json`.
- Old daemon receives `POST /api/control-plane/shutdown` with matching `instanceId` → exits.
- **RelayClient**: Old instance stops (closes WSS). New instance starts new RelayClient → new WSS → new challenge/hello → relay rebinds `hostPublicId` to new socket.
- **Devices persist**: `devices.json` survives restart; `sl_dev` cookies still valid.
- **Pairings do NOT persist**: `PairingStore` is memory-only (`pairing.ts:55`); restart = no active pairing.

**Windows-specific**: `process.exit(0)` in `cleanExitHandler` (`daemon.ts:797`). RelayClient must not block shutdown.

### 15. Windows-Specific Concerns (FACT)

| Concern | Status | Evidence |
|---------|--------|----------|
| **File permissions** | `mode: 0o600` best-effort on Windows | `host-identity.ts:106`, `device-registry.ts:127` — NTFS ACLs not enforced by Node `fs` modes. ADR D7 §60: "NTFS ACL hardening for host-key.json/devices.json (Node modes don't map to ACLs on Windows)". **Non-blocking for Stage 3**. |
| **Path separators** | Normalized to `/` in daemon | `daemon.ts:1444, 1547` use `.replace(/\\/g, '/')`. RelayClient uses URLs, not filesystem paths. |
| **`ws` library** | Works identically on Windows | `package.json:150` — `ws@^8.21.3` is cross-platform. |
| **`bufferedAmount`** | Standard WebSocket API | Node `ws` implements `bufferedAmount` per spec. |
| **TLS/CA trust** | Uses Node default `https.globalAgent.options.ca` | No custom CA needed for public relay domain with valid cert. |
| **Process signals** | `SIGINT`/`SIGTERM` handled | `daemon.ts:799-800` — works on Windows (Node emulates). |
| **Temp file atomic rename** | `fs.renameSync` works on Windows | `host-identity.ts:108`, `device-registry.ts:128` — `renameSync` replaces atomically on Windows since Node 10+. |

### 16. Exact Focused Tests Needed (FACT)

**Unit tests (new file: `test/remote-access-v1-stage3.test.mjs`):**

| Test ID | Scenario | Assertion |
|---------|----------|-----------|
| RA3-1 | RelayClient constructs correct `hello` frame with valid Ed25519 signature | `crypto.verify(publicKey, nonce, sig) === true`; `deriveHostPublicId(publicKey) === hostPublicId` |
| RA3-2 | Challenge nonce is echoed in signature; replay rejected | Second `hello` with same nonce fails (relay must track used nonces) |
| RA3-3 | Frame serialization/deserialization round-trip | `JSON.parse(JSON.stringify(frame))` preserves all fields |
| RA3-4 | Header allowlist enforced: only 7 headers pass through | `authorization`, `x-forwarded-for`, `x-custom` stripped; `origin`, `cookie`, `x-sideline-action` kept |
| RA3-5 | BufferedAmount backpressure pauses writes > 4 MiB | Mock `ws.bufferedAmount` > 4MiB → frames queued; `drain` → flushed |
| RA3-6 | Ping/pong heartbeat: pong received within 40s or socket closed | `setInterval` ping; track `lastPongAt`; close on timeout |
| RA3-7 | Backoff schedule with jitter: 1/2/5/10/30s ±20% | Mock timers; verify delays in expected ranges |
| RA3-8 | Reconnect sends new challenge/hello; in-flight requests cancelled | On disconnect → `adapter.cancel(id)` for all inflight; new connect → new challenge |
| RA3-9 | `cancel` frame idempotent; SSE client cleaned up | Duplicate `cancel` → no error; `sseClients` size decreases |
| RA3-10 | `goaway` frame triggers clean shutdown, no reconnect | `ws.close()` called; backoff timer cleared |
| RA3-11 | Enable/disable preference toggles connection | `remoteAccess.enabled=false` → `stop()`; `true` → `start()` |

**Integration tests (via reference relay on localhost):**
| Test ID | Scenario | Assertion |
|---------|----------|-----------|
| RA3-I1 | REST round-trip: browser → relay → RelayClient → daemon → `/api/status` → 200 | Status codes, headers, body match direct loopback |
| RA3-I2 | SSE streaming: `/api/events` delivers `hello`, `status`, `ai-health`, `execution`, `: hb` | Frames arrive in order; heartbeat at ~15s |
| RA3-I3 | Host kill → browser gets 503 `host_offline` → auto-reconnect → SSE resumes | Kill RelayClient; relay serves offline; restart RelayClient → browser reconnects |
| RA3-I4 | 2 MiB request body → 413 Payload Too Large | Relay caps at 1 MiB; host never sees oversized body |
| RA3-I5 | Stalled browser (slow reader) doesn't block other requests | One slow SSE connection; second request completes normally |
| RA3-I6 | Forged `hostPublicId` without valid signature rejected by relay | Connect with wrong `sig` → relay closes socket |
| RA3-I7 | Two hosts, two relay connections, isolated by `hostPublicId` | Host A's requests never reach Host B's daemon |

### 17. Existing Files/Tests the Implementation Player Should NOT Explore (FACT)

| File | Reason |
|------|--------|
| `test/remote-access-v1-stage1.test.mjs` | Stage 1 complete; tests local security foundation only |
| `test/remote-access-v1-stage2.test.mjs` | Stage 2 complete; 31 tests pass; tests in-process adapter, NOT WSS |
| `src/control-plane/daemon.ts` (HTTP/WSS server for `/stadium`) | Internal Stadium JSON-RPC on 127.0.0.1 — **unrelated to outbound relay WSS** |
| `src/stadium-client.ts` | Extension → daemon local WS client — **not RelayClient** |
| `src/public/index.html` | Browser UI — Stage 5 concern |
| `src/extension.ts` | VS Code extension commands — Stage 5 concern |
| `coach-routines.ts`, `game-filesystem-coordinator.ts` | Coach Source / Git — Stage 6+ |
| Any `scout-*` files | Scout infrastructure — orthogonal |

**Do not modify:** `host-identity.ts`, `device-registry.ts`, `pairing.ts`, `remote-routes.ts`, `request-security.ts`, `remote-redaction.ts`, `remote-dispatch.ts` (adapter logic), `protocol.ts` (Stadium JSON-RPC, not tunnel/v1).

### 18. Contradictions Between Stage 2 Implementation and Stage 3 ADR (CONTRADICTION)

| # | Stage 2 Current | Stage 3 ADR Requirement | Resolution |
|---|-----------------|------------------------|------------|
| 1 | **Denylist** for headers (`STRIPPED_REQUEST_HEADERS` = 4 headers) | **Allowlist** of 7 headers (`accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent`) | **Must change** `remote-dispatch.ts:61-64` to allowlist. Denylist is less secure (new headers pass by default). |
| 2 | `expectedOrigin` passed as static string in tests (`TRUSTED_ORIGIN`) | `expectedOrigin` **derived** from `hostPublicId` + `relayDomain` at connect time | RelayClient must construct `expectedOrigin = `https://h-${hostPublicId}.${relayDomain}`` and pass to adapter. |
| 3 | No `remoteAccess.enabled` preference | ADR D5: "enable/disable wired to a local-only preference" | Add `remoteAccess.enabled` to `CoachPreferences` (`running-players.ts`), wire in daemon start/stop. |
| 4 | `PairingStore` is memory-only, cleared on restart | ADR D4: "memory-only (nothing after daemon restart)" — **consistent**, no contradiction |
| 5 | SSE heartbeat is `: hb` every 15s | ADR D3: "Separately, the host's SSE adds a `: hb` comment every 15s" — **consistent** |
| 6 | `InProcessRemoteAdapter` constructs `remote-device` principal with `expectedOrigin` | ADR D3: Principal model unchanged — **consistent** |
| 7 | No `ws.bufferedAmount` backpressure in Stage 2 (in-process, no socket) | ADR D3: "host pauses writes while `ws.bufferedAmount` is above 4 MiB" | **New requirement** for RelayClient write path only. |
| 8 | No reconnect logic in Stage 2 (in-process, no network) | ADR D3: backoff 1/2/5/10/30s ±20% jitter | **New requirement** for RelayClient. |

---

## IMPORTANT FILES / PATHS

| Path | Role |
|------|------|
| `src/control-plane/daemon.ts` | Daemon core; wire RelayClient start/stop in `start()`/`stop()`; add `remoteAccess.enabled` preference |
| `src/control-plane/remote-dispatch.ts` | **Change**: header denylist → allowlist; keep `dispatch`/`cancel` API stable |
| `src/control-plane/host-identity.ts` | Source of durable Ed25519 key + `hostPublicId` |
| `src/control-plane/device-registry.ts` | Validates `sl_dev` cookies for RelayClient |
| `src/control-plane/remote-routes.ts` | Route classification — unchanged |
| `src/control-plane/request-security.ts` | `Principal`, `expectedOrigin` matching — unchanged |
| `src/control-plane/remote-redaction.ts` | Redaction — unchanged |
| `src/running-players.ts` | **Add** `remoteAccess: { enabled: boolean; relayDomain?: string }` to `CoachPreferences` |
| `src/control-plane/relay-client.ts` | **NEW** — RelayClient implementation |
| `src/control-plane/relay-frames.ts` | **NEW** — Wire frame types (shared with reference relay) |
| `src/control-plane/relay-backoff.ts` | **NEW** — Backoff/jitter logic |
| `relay/` | **NEW** — Reference relay (test-only) |
| `test/remote-access-v1-stage3.test.mjs` | **NEW** — Stage 3 acceptance tests |

---

## LIMITATIONS

1. **No relay domain decided** — ADR §6.1: "Relay domain, hosting provider and cost ceiling… blocks Stage 4 only." Stage 3 can use a constant/default (`sideline.live`) or test-only `localhost` relay.
2. **Reference relay not built** — This recon only covers the *host* half. The reference relay (`relay/`) is a separate implementation task.
3. **QR/UX not in scope** — Stage 5. Stage 3 is transport only.
4. **Windows ACL hardening** — Deferred per ADR D7 §60. Stage 3 uses existing `0o600` best-effort.
5. **E2EE deferred** — ADR D3 §124: "E2EE in v1… Worthwhile later; the relay is designed so it can't mint access in the meantime."

---

## ARCHITECT DECISION REQUIRED

1. **Relay domain constant vs. preference**: Should `relayDomain` be a hardcoded constant in `relay-client.ts` (since v1 has no public relay yet) or a daemon preference? ADR D6.2 suggests deferring public relay, so a constant is reasonable for Stage 3.
2. **Preference shape**: `remoteAccess: { enabled: boolean }` vs. `remoteAccess: { enabled: boolean; relayDomain?: string }`. Minimal: just `enabled`.
3. **Header allowlist migration**: Change `remote-dispatch.ts` now (breaking Stage 2's denylist) or keep denylist in adapter and enforce allowlist in RelayClient? **Recommendation**: Change adapter to allowlist — it's the security boundary, and Stage 2 tests will need updating (acceptable for Stage 3).
4. **Reference relay language**: ADR says "plain Node + `ws`". Confirm no TypeScript compilation step for test relay (simpler for integration tests).

---

## EPISTEMIC LABELS SUMMARY

| Label | Count | Key Items |
|-------|-------|-----------|
| **FACT** | ~60 | All Stage 2 code locations, ADR decisions, wire protocols, existing tests |
| **INFERENCE** | ~15 | RelayClient lifecycle stages, backoff schedule details, `expectedOrigin` derivation, shutdown integration |
| **UNKNOWN** | 0 | All investigation points addressed from ADR + code |
| **CONTRADICTION** | 8 | Header denylist vs allowlist, static vs derived `expectedOrigin`, missing preference, missing backpressure, missing reconnect |
| **ARCHITECT DECISION REQUIRED** | 4 | Relay domain configuration, preference shape, allowlist migration strategy, reference relay implementation details |

---

**End of Reconnaissance Report.**

### Full report — lane stage3-reference-relay-security (sideline-scout-balanced)

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

### Full report — lane stage3-acceptance-slice-map (sideline-scout-quick)

## SCOUT RECONNAISSANCE REPORT

**Play ID:** remote-access-v1-stage3-recon-20260923-181132  
**Scout ID:** stage3-acceptance-slice-map  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  

---

### RESULT

**STATUS: STAGE 3 NOT IMPLEMENTED - MULTIPLE CRITICAL GAPS IDENTIFIED**

Current codebase shows Stage 1 and 2 COMPLETE, but Stage 3 (RelayClient + real WSS transport) is entirely missing. All Stage 3 architectural components from ADR need implementation.

---

### KEY DISCOVERIES

#### **Stage 1 COMPLETED** ✅
- Security foundation: No credentials in URLs, timing-safe compare, CSRF protection, CORS, route classification
- Tests: `remote-access-v1-stage1.test.mjs` - 9/9 tests PASS
- Implementation verified in daemon.ts, remote-routes.ts, request-security.ts

#### **Stage 2 COMPLETED** ✅  
- In-process adapter implemented as "Stage 2 in-process stand-in for future relay transport"
- Location: `src/control-plane/remote-dispatch.ts` (lines 41-45)
- Tests: `remote-access-v1-stage2.test.mjs` - 31/31 tests (30 pass, 1 skipped on Windows)
- Pairing, device registry, loopback isolation, auth enforcement all working

#### **Stage 3 GAPS CONFIRMED** ❌
**Missing Components from ADR §5.3:**
- ❌ RelayClient in daemon (`ws`) - NO CLASS FOUND
- ❌ Challenge/hello signature - NO IMPLEMENTATION  
- ❌ Frames per D3 protocol - NO FRAMEWORK
- ❌ Heartbeat/backoff with jitter - MISSING
- ❌ Cancel and bufferedAmount backpressure - NOT IMPLEMENTED
- ❌ Reference relay (`relay/`) - NO SUCH DIRECTORY
- ❌ Ed25519 host challenge - EXISTS (host-identity.ts) but not integrated with tunnel/v1
- ❌ Real outbound WSS transport - ABSENT

**Evidence of Missing Implementation:**
- No `RelayClient` class anywhere in codebase
- No WebSocket server for relay in daemon.ts
- No `tunnel/v1` protocol implementation
- No reference relay infrastructure in `relay/` directory
- `remote-dispatch.ts:41-45` explicitly states it's only "Stage 2 in-process stand-in"
- Architecture Decision §5.3 clearly lists Stage 3 requirements that are unimplemented

---

### FACT

1. **Stage 1:** All security measures implemented per ADR §4
   - `src/control-plane/remote-routes.ts`: 26 route policies with default-deny
   - `src/control-plane/request-security.ts`: timingSafeSecretEqual, CSRF guards
   - Tests passing: 9/9 in stage1, 30/31 in stage2

2. **Stage 2:** InProcessRemoteAdapter exists as placeholder
   - File: `src/control-plane/remote-dispatch.ts` 
   - Lines 41-45: "Stage 2 in-process stand-in for the future relay transport"
   - Provides `FrameReq`/`FrameRes` types matching D3 protocol structure

3. **Stage 3:** Zero implementation evidence
   - No files contain "RelayClient", "relay/", or "tunnel/v1"
   - No WebSocket server code for outbound WSS
   - No challenge/hello signature implementation
   - No reference relay infrastructure

4. **Ed25519:** Host key generation exists but not tunnel-integrated
   - `src/control-plane/host-identity.ts`: complete keypair generation
   - Used for pairing but not for WSS challenge/hello per D3 protocol

---

### INFERENCE

**Current Implementation State:**
- **Phase 1-2 Complete:** Security foundation and in-process adapter working
- **Phase 3 Stalled:** RelayClient and WSS transport not started
- **Stage 2 Solution:** `InProcessRemoteAdapter` deliberately simplified (no real network)
- **Architecture Gap:** D3 protocol types exist in tests but no transport layer

**What Stage 3 Actually Requires:**
- Real WebSocket server implementation (`ws` library already in deps)
- Ed25519 challenge/response for tunnel/v1 handshake
- Frame framing per D3 protocol specification
- Heartbeat, backoff, backpressure algorithms
- Local-only preference toggle
- Integration tests using localhost reference relay

**Test Gap Analysis:**
- Stage 2 tests end at RA2D-11 (route classification)
- NO Stage 3 test files exist (`remote-access-v1-stage3.test.mjs` missing)
- Tests verify Stage 2 functionality but Stage 3 transport not exercised

---

### UNKNOWN

1. **Stage 3 Implementation Timeline:** No roadmap visible for RelayClient/WSS
2. **Resource Allocation:** No indication of premium Player being assigned to Stage 3
3. **Dependencies:** Whether Stage 2 components can be reused for Stage 3
4. **Blocking Factors:** No documentation explaining why Stage 3 not started

---

### IMPORTANT FILES / PATHS

**Existing Stage 1-2 Implementation:**
- `src/control-plane/remote-dispatch.ts` - InProcessRemoteAdapter (Stage 2 stand-in)
- `src/control-plane/host-identity.ts` - Ed25519 key generation (host identity only)
- `test/remote-access-v1-stage1.test.mjs` - Stage 1 tests (9/9 pass)
- `test/remote-access-v1-stage2.test.mjs` - Stage 2 tests (30/31 pass)
- `src/control-plane/remote-routes.ts` - Route classification policies (26 routes)

**Missing Stage 3 Files:**
- `src/control-plane/relay-client.ts` - RelayClient class (NOT EXISTS)
- `src/control-plane/tunnel-v1.ts` - WSS transport implementation (NOT EXISTS)
- `relay/` directory - Reference relay server (NOT EXISTS)
- `src/control-plane/relay.ts` - Subdomain → host routing (NOT EXISTS)

**Documentation:**
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` - Complete ADR
- `REPORTS/Claude/Remote-Access-v1-Stage-2D-Final-Acceptance__20260923__Claude.md` - Stage 2 results

---

### RECOMMENDATIONS FOR SCOUT WORK

**Immediate Actions Required:**
1. **Map Stage 3 Dependency Graph:** Document how RelayClient depends on Stage 2 components
2. **Identify Testable Slices:** Stage 3 can be broken into independent transport, challenge, and framing components
3. **Create Minimum Test Gates:** Each slice needs focused acceptance testing before integration
4. **Define Stop Lines:** Clear boundary between Stage 3 (local testing) and Stage 4 (production relay)

**Implementation Strategy:**
- **Slice 1:** RelayClient skeleton + WebSocket connection (can be tested independently)
- **Slice 2:** Ed25519 challenge/hello integration (unit-testable with mocks)
- **Slice 3:** Frame framing per D3 protocol (protocol-level testing possible)
- **Slice 4:** Integration tests with reference relay on localhost

**Critical Dependencies:**
- `ws` library already in dependencies (`package.json`)
- Ed25519 crypto API already available via Node.js
- Stage 2 authentication/authorization already working
- Host identity manager already generates keys

---

### CONCLUSION

**Stage 3 Status:** NOT STARTED - Zero implementation of RelayClient, WSS transport, or reference relay.

**Blockers Identified:**
- No RelayClient implementation
- No WebSocket server for relay
- No challenge/hello protocol
- No reference relay infrastructure
- No Stage 3 test suite

**Recommended Next Step:**
- Begin implementing RelayClient as focused, independently testable slices
- Map exact dependency boundaries from existing Stage 2 components
- Create minimum test gates after each slice completion

This reconnaissance reveals Stage 3 is ready to start implementation but hasn't begun. The architecture is fully documented, dependencies identified, and testing strategy can be derived from existing Stage 2 patterns.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage3-recon-20260923-181132
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-stage3-recon-20260923-181132

