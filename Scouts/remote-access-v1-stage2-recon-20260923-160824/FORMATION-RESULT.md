# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:09:21

Play: remote-access-v1-stage2-recon-20260923-160824
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-23T22:08:35.759Z
Finished: 2026-09-23T22:17:57.335Z
TOTAL ELAPSED TIME: 00:09:21

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
| stage2-pairing-device-registry | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T22:08:35.780Z | 2026-09-23T22:12:39.738Z | 00:04:03 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-pairing-device-registry-Reconnaissance.md |
| stage2-remote-dispatch-fake-transport | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T22:08:35.796Z | 2026-09-23T22:17:57.329Z | 00:09:21 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-remote-dispatch-fake-transport-Reconnaissance.md |
| stage2-regression-acceptance-map | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T22:08:35.809Z | 2026-09-23T22:09:46.071Z | 00:01:10 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-regression-acceptance-map-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane stage2-pairing-device-registry: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane stage2-remote-dispatch-fake-transport: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane stage2-regression-acceptance-map: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: stage2-pairing-device-registry (objective 0c548ec32381)
- Objective: REMOTE ACCESS V1 — STAGE 2 RECON
LANE 1: HOST IDENTITY + DEVICE REGISTRY + PAIRING SECURITY

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY AUTHORITY:
REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md

Stage 1 is GREEN:

* principal model implemented
* route default-deny implemented
* remote redaction implemented
* remote CSRF expectedOrigin seam implemented
* adjacent regression gate 51/51

Scout ONLY the Stage 2 host-identity / pairing / device-registry seam.

Accepted architecture:

HOST IDENTITY

* daemon-generated Ed25519 keypair
* stored under ~/.sideline/remote/host-key.json
* owner-only permissions
* hostPublicId = base32(sha256(publicKey))[0..20]
* stadiumId remains separate/local

PAIRING

* local principal only may create pairing
* 128-bit random pairing secret
* hash stored, never raw secret
* single use
* 5-minute TTL
* QR eventually uses fragment secret
* typed fallback code: 8 characters
* maximum 5 failed attempts, then pairing burned

DEVICE SESSION

* successful pairing creates deviceId + 256-bit deviceToken
* store ONLY SHA-256 device-token hash
* label, createdAt, lastSeenAt
* 30-day sliding idle expiry
* future browser cookie: sl_dev
* validation belongs on HOST, never relay

DEVICE MANAGEMENT

* list
* rename
* revoke
* revoke-all
* management local-principal only

Inspect current repo seams necessary to implement this safely.

Deliver a SURGICAL IMPLEMENTATION MAP:

1. exact existing files/classes/helpers to reuse;
2. recommended new files only where genuinely needed;
3. host-key persistence design using existing Sideline filesystem conventions;
4. owner-only permission handling on Windows and POSIX without inventing unnecessary machinery;
5. DeviceRegistry data shape;
6. safe atomic persistence strategy;
7. pairing record/state shape;
8. expiry / failed-attempt / single-use behavior;
9. timing-safe hash comparisons;
10. exact local-only daemon routes required;
11. route-classification implications;
12. tests required;
13. likely migration / restart / corrupt-file edge cases;
14. anything in the ADR that requires clarification before implementation.

DO NOT:

* build relay/WSS;
* build Stage 3;
* build QR UI;
* build Send to Phone UI;
* build Settings UI;
* implement GitHub/account identity;
* modify files;
* commit or push.

Goal:
Give the implementation Player exact coordinates for Stage 2A without broad repository exploration.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-pairing-device-registry-Reconnaissance.md

**Key discoveries:** - **Existing route security** (`src/control-plane/request-security.ts`) provides `timingSafeSecretEqual` and `Principal` type (including `{ kind: 'remote-device' }`).  
- **Route classification** (`src/control-plane/remote-routes.ts`) uses a default‑deny table; `principalMayAccess` grants remote‑device access to `remote-read`/`remote-mutate`.  
- **File‑persistence pattern** (see `initAuthToken` in `daemon.ts`) writes owner‑only files (mode `0o600`) under `~/.sideline/`.  
- **Device token validation** is missing from `resolvePrincipal`; it currently only handles `sl_local` cookie and Bearer token.  
- No existing host‑key, pairing, or device‑registry storage exists.  
- The daemon already injects `remote-device` principal in‑process for Stage 2 tests (see `handleHttpRequest` lines 1099, 1142).  

---

**FACT:** - The daemon binds to `127.0.0.1` only (verified seam, ADR §0).  
- `resolvePrincipal` (daemon.ts:3836‑3850) returns `Principal` for local‑admin via Bearer (`Authorization`) or `sl_local` cookie.  
- `timingSafeSecretEqual` is used for admin token comparison (request-security.ts:7‑16).  
- Owner‑only file writes are done with `fs.writeFileSyncSync(path, data, { encoding: 'utf8', mode: 0o600 })` (e.g., `initAuthToken`).  
- `classifyDaemonRoute` and `principalMayAccess` enforce route access (remote‑routes.ts:65‑78).  
- The ADR Stage 2 scope includes host key, pairing, device registry, remote dispatch, and enforcement via existing allowlist/redaction (ADR §2.4).  

---

**INFERENCE:** - Host‑key persistence should follow the same owner‑only pattern as the token file (`~/.sideline/token`).  
- Pairing and device registry can be stored as JSON files under `~/.sideline/remote/` with mode `0o600`.  
- Base32 encoding for `hostPublicId` must be added; no existing implementation found.  
- Device‑token validation will be added to `resolvePrincipal` by checking the `sl_dev` cookie against stored SHA‑256 hashes.  
- Pairing endpoint must be `local-only` because the RelayClient (in‑process) will forward the request as `remote-device` principal after verifying host identity via Ed25519 challenge‑response (ADR §2.4, Stage 2 description).  
- Device‑management endpoints (list, rename, revoke, revoke‑all) must be `local-only` (ADR §2.4).  
- Sliding 30‑day expiry is implemented by updating `lastSeenAt` on each authenticated request and rejecting if `now - lastSeenAt > 30 days`.  

---

**UNKNOWN:** - Exact format of the 8‑character fallback pairing code (e.g., alphanumeric, numeric, derived from secret).  
- Whether pairing records should survive daemon restarts (TTL is 5 minutes, so persistence is optional but simplifies cleanup).  
- Whether the relay subdomain (`h-<id>.<relay>`) will be available in Stage 2 (it is not; Stage 2 uses in‑process transport).  
- Whether the device token should be returned in the pairing‑attempt response body or only set as a cookie (ADR says `Set‑Cookie: sl_dev=<token>`).  

---

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/control-plane/daemon.ts` – main HTTP handler, `resolvePrincipal`, route handling.  
- `src/control-plane/request-security.ts` – `timingSafeSecretEqual`, `Principal` type.  
- `src/control-plane/remote-routes.ts` – route classification table.  
- `src/game-identity.ts` – existing stadium‑id persistence pattern (reference).  
- `src/running-players.ts` – `CoachPreferences` (already has `remoteSensitiveTerminalOutput`).  

---

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: stage2-remote-dispatch-fake-transport (objective 5246d466e8e6)
- Objective: REMOTE ACCESS V1 — STAGE 2 RECON
LANE 2: IN-PROCESS REMOTE PRINCIPAL DISPATCH + FAKE FRAME TRANSPORT

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY AUTHORITY:
REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md

Stage 1 security is GREEN and already provides:

* Principal remote-device type
* expectedOrigin seam
* default-deny route classification
* remote redaction
* remote CSRF enforcement
* SSE heartbeat
* local Bearer/cookie behavior

Stage 2 DOES NOT build the real relay.

Scout ONLY the accepted in-process transport seam:

dispatchRemote(frameReq) → response frames

Architecture requirement:

* create IncomingMessage/ServerResponse-compatible shims or the smallest equivalent adapter
* invoke the EXISTING daemon/router in-process
* inject explicit Principal:
  { kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin }
* never loop back through HTTP
* never use a forgeable header to mark a caller remote
* validate device token on host before dispatch
* ignore remote Authorization admin token
* ignore remote ?token=
* enforce existing remote-read / remote-mutate / local-only policies
* enforce existing redaction
* support streaming response chunks
* support cancellation closing an SSE subscription
* fake transport ONLY in Stage 2 tests

Inspect the smallest relevant seams.

Deliver:

1. exact daemon entry point to reuse;
2. current request/response assumptions that an adapter must satisfy;
3. smallest safe frame request shape needed for Stage 2 tests;
4. where device-token validation occurs before injected Principal creation;
5. how expectedOrigin reaches the Principal;
6. which remote headers may be accepted in Stage 2 tests;
7. how Authorization and query-token attempts are discarded/ignored;
8. response head/data/end model sufficient for tests;
9. SSE streaming mechanics through the fake transport;
10. cancellation / teardown mechanics;
11. backpressure or buffering concerns that belong ONLY to Stage 3 and should NOT be implemented now;
12. exact tests proving:

    * remote-read works;
    * local-only is denied;
    * remote-mutate honors CSRF;
    * admin Bearer cannot elevate remote principal;
    * query token cannot elevate remote principal;
    * report secrets redact remotely;
    * local report remains verbatim;
    * SSE streams;
    * cancel closes stream;
13. exact source files likely touched;
14. hidden hazards / contradictions.

DO NOT:

* build WebSocket relay;
* build RelayClient;
* connect to any cloud service;
* build QR/UI;
* redesign router;
* implement Stage 3;
* modify files;
* commit or push.

Goal:
Give the implementation Player an exact Stage 2B patch map without making them rediscover the daemon/router architecture.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-remote-dispatch-fake-transport-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Exact daemon entry point**: `ControlPlaneDaemon.handleHttpRequest(req, res, injectedPrincipal?)` at `daemon.ts:1057` | FACT |
| 2 | **Request/response contract**: Native `http.IncomingMessage` / `http.ServerResponse`; `injectedPrincipal` bypasses `resolvePrincipal` | FACT |
| 3 | **Principal type**: `{ kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin? }` in `request-security.ts:3-6` | FACT |
| 4 | **Route classification**: `classifyDaemonRoute(method, pathname)` → `'public' | 'local-only' | 'remote-read' | 'remote-mutate'` in `remote-routes.ts:65-69` | FACT |
| 5 | **CSRF enforcement**: Lines 1151-1159 in `daemon.ts` check `X-Sideline-Action: 1` + Origin match for `remote-device` | FACT |
| 6 | **Redaction**: `redactForPrincipal(value, principal, { terminalActivity?, allowSensitiveTerminalOutput? })` in `remote-redaction.ts:45-59` | FACT |
| 7 | **SSE streaming**: `handleSseConnection` writes `event: hello`, `event: status`, `event: ai-health`, `event: execution`, then `broadcast()` pushes chunks; `req.on('close')` triggers `removeSseClient` | FACT |
| 8 | **Device token validation**: **NOT YET IMPLEMENTED** — Stage 2 must add `DeviceRegistry` with hashed tokens, pairing, expiry, revocation | FACT |
| 9 | **`expectedOrigin` flow**: Supplied by fake transport at dispatch time → stored in Principal → used by `requestOriginMatchesExpected` at `request-security.ts:40-47` | FACT |
| 10 

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** **Evidence:** ADR D4 lines 129–130: `~/.sideline/remote/host-key.json`, `hostPublicId`. Device tokens stored hashed.
**Gap:** No schema defined for `devices.json`. Stage 2 must define:
```ts
interface StoredDevice {
  deviceId: string;
  tokenHash: string;        // SHA-256(deviceToken)
  label: string;
  createdAt: number;
  lastSeenAt: number;
  expectedOrigin: string;   // phone's origin for CSRF
}
```

**CONTRADICTION:** **Evidence:** `daemon.ts:1057` declares `private async handleHttpRequest(...)`
**Impact:** In-process dispatch cannot call it directly from outside the class.
**Resolution:** Either (a) make it `public` (minimal, safe), (b) add a public `dispatchInProcess(req, res, principal)` wrapper, or (c) test seam calls private method via `daemon['handleHttpRequest']` (TypeScript allows with `@ts-ignore`). **Recommendation: (a) or (b).**

**Important files:** ```
src/control-plane/daemon.ts                    // Main daemon, handleHttpRequest, SSE
src/control-plane/request-security.ts          // Principal type, timingSafeEqual, origin matching
src/control-plane/remote-routes.ts             // DAEMON_ROUTE_POLICIES, classifyDaemonRoute, principalMayAccess
src/control-plane/router.ts                    // Dispatch logic, routed by Principal-aware routes
src/control-plane/remote-redaction.ts          // redactForPrincipal, REDACTION_RULES
src/control-plane/protocol.ts                  // JSON-RPC frame types (Stadium WS, not remote)
src/remote-redaction.ts                        // Re-export of redaction helper
test/remote-access-v1-stage1.test.mjs          // Stage 1 acceptance tests (reference patterns)
```

---

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: stage2-regression-acceptance-map (objective 709a8ce08952)
- Objective: REMOTE ACCESS V1 — STAGE 2 RECON
LANE 3: ACCEPTANCE / REGRESSION / SLICE PLAN

READ-ONLY.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

PRIMARY AUTHORITY:
REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md

Stage 1 security remediation is complete and adjacent regression gate is 51/51.

Scout Stage 2 strictly as an acceptance and regression problem.

Accepted Stage 2 scope:

* host key + hostPublicId
* pairing creation/exchange
* DeviceRegistry
* hashed device tokens
* list / rename / revoke / revoke-all
* 30-day sliding expiry
* in-process remote-device dispatch
* fake frame transport tests
* existing allowlist / redaction enforcement

Accepted Stage 2 gate:

PAIRING

* succeeds once
* reused secret fails
* expired secret fails
* 6th wrong typed-code attempt fails/burns pairing
* paired device authorizes remote-read
* local-only route denied

AUTH ISOLATION

* remote admin Bearer cannot elevate
* remote ?token cannot elevate

REVOCATION

* revoke → next request unauthorized
* revoke-all works

REDACTION

* synthetic API key redacted remotely
* same content verbatim locally

STREAMING

* SSE streams via fake transport
* cancel closes subscription

Deliver:

1. recommended implementation slices in the safest order;
2. dependency graph between those slices;
3. minimum focused tests after each slice;
4. minimum adjacent regression suite after Stage 2;
5. behavioral contracts Stage 2 must not change;
6. existing tests likely affected;
7. tests known unrelated that premium Player should NOT investigate;
8. persistence/restart acceptance tests;
9. expiry/revocation acceptance tests;
10. security-abuse cases worth testing;
11. explicit Stage 2 GO/NO-GO checklist;
12. exact STOP line separating Stage 2 from Stage 3;
13. recommended implementation Player/effort AFTER Scout + Anti-Gravity compression.

IMPORTANT PRODUCT BOUNDARY:

The future Dad-facing UX is:

SEND TO PHONE
→ QR modal
→ scan
→ paired

with full Remote Access management under Settings.

That UX is Stage 5.

Stage 2 should create clean backend seams for it, but MUST NOT implement the UI now.

DO NOT:

* modify files;
* implement;
* build Stage 3 relay;
* build Stage 5 UI;
* commit or push.

Goal:
Prevent the premium implementation Player from spending scarce context rediscovering tests, sequencing, or Stage boundaries.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-regression-acceptance-map-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane stage2-pairing-device-registry: This reconnaissance maps the exact changes needed to implement Stage 2 (host identity, pairing, device registry) while reusing existing patterns and avoiding unnecessary new machinery. All proposals are read-only analysis; no files are modified. ---
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane stage2-remote-dispatch-fake-transport: Stage 2 **in-process remote principal dispatch with fake frame transport** is architecturally viable using the existing `ControlPlaneDaemon.handleHttpRequest` entry point with its `injectedPrincipal` parameter. The daemon already: - Accepts an explicit `Principal` injected by the caller (bypassing `resolvePrincipal`) - Classifies every route via default-deny `DAEMON_ROUTE_POLICIES` - Enforces CSRF
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane stage2-regression-acceptance-map: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane stage2-remote-dispatch-fake-transport: **Evidence:** `daemon.ts:1057` declares `private async handleHttpRequest(...)` **Impact:** In-process dispatch cannot call it directly from outside the class. **Resolution:** Either (a) make it `public` (minimal, safe), (b) add a public `dispatchInProcess(req, res, principal)` wrapper, or (c) test seam calls private method via `daemon['handleHttpRequest']` (TypeScript allows with `@ts-ignore`). **Recommendation: (a) or (b).**

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane stage2-pairing-device-registry · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-pairing-device-registry-Reconnaissance.md
- Lane stage2-remote-dispatch-fake-transport · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-remote-dispatch-fake-transport-Reconnaissance.md
- Lane stage2-regression-acceptance-map · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\SCOUT-stage2-regression-acceptance-map-Reconnaissance.md

### Full report — lane stage2-pairing-device-registry (sideline-scout-balanced)

**Sideline Coach Read-Only Reconnaissance Report**  
Play ID: remote-access-v1-stage2-recon-20260923-160824  
Scout ID: stage2-pairing-device-registry  
Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free  

---

## RESULT  
This reconnaissance maps the exact changes needed to implement Stage 2 (host identity, pairing, device registry) while reusing existing patterns and avoiding unnecessary new machinery. All proposals are read-only analysis; no files are modified.

---

## KEY DISCOVERIES  
- **Existing route security** (`src/control-plane/request-security.ts`) provides `timingSafeSecretEqual` and `Principal` type (including `{ kind: 'remote-device' }`).  
- **Route classification** (`src/control-plane/remote-routes.ts`) uses a default‑deny table; `principalMayAccess` grants remote‑device access to `remote-read`/`remote-mutate`.  
- **File‑persistence pattern** (see `initAuthToken` in `daemon.ts`) writes owner‑only files (mode `0o600`) under `~/.sideline/`.  
- **Device token validation** is missing from `resolvePrincipal`; it currently only handles `sl_local` cookie and Bearer token.  
- No existing host‑key, pairing, or device‑registry storage exists.  
- The daemon already injects `remote-device` principal in‑process for Stage 2 tests (see `handleHttpRequest` lines 1099, 1142).  

---

## FACT  
- The daemon binds to `127.0.0.1` only (verified seam, ADR §0).  
- `resolvePrincipal` (daemon.ts:3836‑3850) returns `Principal` for local‑admin via Bearer (`Authorization`) or `sl_local` cookie.  
- `timingSafeSecretEqual` is used for admin token comparison (request-security.ts:7‑16).  
- Owner‑only file writes are done with `fs.writeFileSyncSync(path, data, { encoding: 'utf8', mode: 0o600 })` (e.g., `initAuthToken`).  
- `classifyDaemonRoute` and `principalMayAccess` enforce route access (remote‑routes.ts:65‑78).  
- The ADR Stage 2 scope includes host key, pairing, device registry, remote dispatch, and enforcement via existing allowlist/redaction (ADR §2.4).  

---

## INFERENCE  
- Host‑key persistence should follow the same owner‑only pattern as the token file (`~/.sideline/token`).  
- Pairing and device registry can be stored as JSON files under `~/.sideline/remote/` with mode `0o600`.  
- Base32 encoding for `hostPublicId` must be added; no existing implementation found.  
- Device‑token validation will be added to `resolvePrincipal` by checking the `sl_dev` cookie against stored SHA‑256 hashes.  
- Pairing endpoint must be `local-only` because the RelayClient (in‑process) will forward the request as `remote-device` principal after verifying host identity via Ed25519 challenge‑response (ADR §2.4, Stage 2 description).  
- Device‑management endpoints (list, rename, revoke, revoke‑all) must be `local-only` (ADR §2.4).  
- Sliding 30‑day expiry is implemented by updating `lastSeenAt` on each authenticated request and rejecting if `now - lastSeenAt > 30 days`.  

---

## UNKNOWN  
- Exact format of the 8‑character fallback pairing code (e.g., alphanumeric, numeric, derived from secret).  
- Whether pairing records should survive daemon restarts (TTL is 5 minutes, so persistence is optional but simplifies cleanup).  
- Whether the relay subdomain (`h-<id>.<relay>`) will be available in Stage 2 (it is not; Stage 2 uses in‑process transport).  
- Whether the device token should be returned in the pairing‑attempt response body or only set as a cookie (ADR says `Set‑Cookie: sl_dev=<token>`).  

---

## IMPORTANT FILES / PATHS  
- `src/control-plane/daemon.ts` – main HTTP handler, `resolvePrincipal`, route handling.  
- `src/control-plane/request-security.ts` – `timingSafeSecretEqual`, `Principal` type.  
- `src/control-plane/remote-routes.ts` – route classification table.  
- `src/game-identity.ts` – existing stadium‑id persistence pattern (reference).  
- `src/running-players.ts` – `CoachPreferences` (already has `remoteSensitiveTerminalOutput`).  

---

## SURGICAL IMPLEMENTATION MAP  

### 1. Exact Existing Files/Helpers to Reuse  
| File / Helper | Purpose | Reuse Detail |
|---------------|---------|--------------|
| `src/control-plane/request-security.ts` | `timingSafeSecretEqual`, `Principal` type | Use for hash comparisons; extend `resolvePrincipal` to validate device tokens. |
| `src/control-plane/remote-routes.ts` | `RouteAccess`, `classifyDaemonRoute`, `principalMayAccess` | Add new routes with `local-only` access. |
| `src/control-plane/daemon.ts` | `initAuthToken` (owner‑only file write), `resolvePrincipal`, HTTP routing | Follow same persistence pattern; extend `resolvePrincipal`; add new route handlers. |
| `src/game-identity.ts` | `getDurableStadiumId` (writes `~/.sideline/stadium-id`) | Reference for directory creation and file writing (though it omits mode; we will use mode `0o600`). |
| `crypto` (Node.js) | Random bytes, Ed25519 key generation, SHA‑256 | Generate host key, pairing secret, device token. |
| `fs` (Node.js) | File system operations | Write/read JSON files with owner‑only modes. |
| `src/remote-redaction.ts` | `redactForPrincipal` | Ensures secrets (e.g., pairing secret) are not leaked in remote responses (though we store only hashes). |

### 2. Recommended New Files (Only Where Genuinely Needed)  
- **`src/control-plane/remote-access.ts`** – New module encapsulating:  
  - `HostKeyManager`: load/generate Ed25519 keypair, compute `hostPublicId` (base32‑encoded SHA‑256 of public key, truncated to 20 chars).  
  - `PairingStore`: create pairing (random 128‑bit secret, store SHA‑256 hash, 5‑minute TTL, attempt counter), validate attempt (timing‑safe hash compare, increment attempts, burn after 5 failures, delete on success).  
  - `DeviceRegistry`: store array of `{ deviceId, label, tokenHash (SHA‑256), createdAt, lastSeenAt }`; provide list, rename, revoke, revoke‑all; validate token on request (update `lastSeenAt`).  
  - Helper: base32 encoder (RFC 4648) for `hostPublicId`.  
  *Rationale*: Keeps concerns isolated, follows existing singleton‑style usage (like `healthAuthority`), and avoids cluttering `daemon.ts`.  

### 3. Host‑Key Persistence Design  
- Directory: `~/.sideline/remote/` (created with mode `0o700` if missing).  
- File: `host-key.json` (mode `0o600`).  
- Content: `{ privateKey: hex, publicKey: hex }` (or just private key; public key derived when needed).  
- On load: if file missing or corrupt (invalid JSON, missing fields), generate a new Ed25519 keypair (`crypto.generateKeyPairSync('ed25519')`).  
- `hostPublicId = base32_encode(sha256(publicKey)).slice(0,20)`.  
- **Owner‑only handling**: Use `fs.writeFileSync(path, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })` on Windows and POSIX (matches existing `initAuthToken`).  

### 4. Owner‑Only Permission Handling  
- Reuse the exact pattern from `initAuthToken` (daemon.ts:687‑703):  
  ```ts
  fs.writeFileSync(tokenPath, this.authToken, { encoding: 'utf8', mode: 0o600 });
  ```  
- Apply same mode to all new files under `~/.sideline/remote/`.  
- No extra machinery needed; the OS enforces the mode.  

### 5. DeviceRegistry Data Shape  
- File: `~/.sideline/remote/devices.json` (mode `0o600`).  
- Content: JSON array of device objects:  
  ```ts
  interface DeviceRecord {
    deviceId: string; // e.g., random 16‑byte hex
    label: string; // user‑settable, defaults to UA‑derived string
    tokenHash: string; // SHA‑256 of device token (hex)
    createdAt: number; // epoch ms
    lastSeenAt: number; // epoch ms (updated on each successful use)
  }
  ```  
- On load: parse JSON; if corrupt, start with empty array (log warning).  
- Validation: when presented with `sl_dev` cookie, hash the token with SHA‑256 and compare (timing‑safe) against each `tokenHash`; if match and `now - lastSeenAt <= 30·24·60·60·1000`, update `lastSeenAt` to now and persist.  

### 6. Safe Atomic Persistence Strategy  
- Follow the atomic‑write pattern used elsewhere in the codebase (e.g., `writeDiscoveryRecord` in `daemon.ts`):  
  1. Write to a temporary file (`<path>.<instanceNonce>.tmp`).  
  2. `fs.renameSync(temp, path)` to replace atomically.  
- Apply to: `host-key.json`, `devices.json`, `pairings.json`.  
- Reads are non‑atomic but safe; corrupt files are treated as empty/missing and regenerated.  

### 7. Pairing Record/State Shape  
- File: `~/.sideline/remote/pairings.json` (mode `0o600`).  
- Content: JSON array of pairing objects:  
  ```ts
  interface PairingRecord {
    pairingId: string; // random 16‑byte hex (used to look up)
    secretHash: string; // SHA‑256 of the 128‑bit secret (hex)
    expiresAt: number; // epoch ms (now + 5 minutes)
    attempts: number; // starts at 0, max 5
  }
  ```  
- On load: parse JSON; discard any expired entries (`now > expiresAt`).  
- Creation:  
  - Generate random 128‑bit secret (`crypto.randomBytes(16)`).  
  - Compute `secretHash = sha256(secret)`.  
  - Generate random `pairingId` (`crypto.randomBytes(16).toString('hex')`).  
  - Store `{ pairingId, secretHash, expiresAt: Date.now() + 300_000, attempts: 0 }`.  
- Attempt validation:  
  - Find record by `pairingId`.  
  - If not found or expired → invalid.  
  - If `attempts >= 5` → burn (delete record).  
  - Otherwise, compare submitted secret hash with stored `secretHash` using `timingSafeSecretEqual`.  
  - On match: delete record (single use), generate device token (256‑bit random), store its SHA‑256 hash in `DeviceRegistry`, return success and set `sl_dev` cookie.  
  - On mismatch: increment `attempts`; if reaches 5, delete record (burn).  

### 8. Expiry / Failed‑Attempt / Single‑Use Behavior  
- **Pairing TTL**: 5 minutes (`expiresAt = now + 300_000`).  
- **Failed attempts**: increment on each mismatch; delete (burn) when `attempts >= 5`.  
- **Single use**: on successful validation, delete the pairing record immediately.  
- **Device idle expiry**: sliding 30 days; on each authenticated request (via `sl_dev` cookie), if valid, update `lastSeenAt = now` and persist `devices.json`.  
- **Cleanup**: on each pairing creation/attempt, remove expired pairings from the array before persisting.  

### 9. Timing‑Safe Hash Comparisons  
- Use existing `timingSafeSecretEqual` from `request-security.ts` for:  
  - Comparing submitted pairing secret hash with stored hash.  
  - Comparing submitted device token hash (from cookie) with stored device token hash.  
- Ensure both inputs are strings and converted to `Uint8Array`/`Buffer` as the helper expects.  

### 10. Exact Local‑Only Daemon Routes Required  
Add the following `if` branches in `daemon.ts.handleHttpRequest` (after existing checks, before route classification):  
```ts
// Pairing creation (local‑only)
if (method === 'POST' && requestUrl.pathname === '/api/pairing/create') {
  // ... handler using HostKeyManager and PairingStore
  return;
}
// Pairing attempt (local‑only)
if (method === 'POST' && requestUrl.pathname === '/api/pairing/attempt') {
  // ... handler using PairingStore and DeviceRegistry
  return;
}
// Device list (local‑only)
if (method === 'GET' && requestUrl.pathname === '/api/devices') {
  // ... handler using DeviceRegistry
  return;
}
// Device rename (local‑only)
if (method === 'PATCH' && requestUrl.pathname.startsWith('/api/devices/')) {
  // ... handler using DeviceRegistry
  return;
}
// Device revoke (single) (local‑only)
if (method === 'DELETE' && requestUrl.pathname.startsWith('/api/devices/')) {
  // ... handler using DeviceRegistry
  return;
}
// Device revoke‑all (local‑only)
if (method === 'DELETE' && requestUrl.pathname === '/api/devices') {
  // ... handler using DeviceRegistry
  return;
}
```  
All handlers must verify `principal?.kind === 'local-admin'` (or use `principalMayAccess` with `local-only`).  

### 11. Route‑Classification Implications  
Update `src/control-plane/remote-routes.ts.DAEMON_ROUTE_POLICIES`:  
```ts
{ methods: ['POST'], path: '/api/pairing/create', access: 'local-only' },
{ methods: ['POST'], path: '/api/pairing/attempt', access: 'local-only' },
{ methods: ['GET'],  path: '/api/devices',               access: 'local-only' },
{ methods: ['PATCH'], path: /^\/api\/devices\/[^/]+$/, access: 'local-only' },
{ methods: ['DELETE'], path: /^\/api\/devices\/[^/]+$/, access: 'local-only' },
{ methods: ['DELETE'], path: '/api/devices',            access: 'local-only' },
```  
No new `remote-read`/`remote-mutate` routes are added for Stage 2; the device token cookie will allow remote‑device principal to access existing `remote-read`/`remote-mutate` routes (already classified).  

### 12. Tests Required  
Create `test/remote-access-v1-stage2.test.mjs` (or similar) to verify:  
- Host key generation and persistence (owner‑only mode, base32 hostPublicId).  
- Pairing flow: create → attempt (success/failure/expired/burned after 5 attempts/single use).  
- Device token issuance, validation, and cookie setting.  
- Device list, rename, revoke, revoke‑all.  
- Route classification: new routes are `local-only`; remote‑device cannot access them.  
- Timing‑safe comparisons used for secret and token validation.  
- File permission checks (skip on Windows if unavoidable, but assert mode where possible).  
- Edge cases: corrupt JSON files, missing directory, clock skew.  

### 13. Likely Migration / Restart / Corrupt‑File Edge Cases  
- **Host key missing/corrupt**: generate new keypair (warn).  
- **Pairings file missing/corrupt**: start with empty array (warn).  
- **Devices file missing/corrupt**: start with empty array (warn).  
- **Expired pairings**: removed on load and before each persistence operation.  
- **Expired devices**: treated as invalid; optionally removed on load or during validation (sliding window means old devices naturally fall out).  
- **Directory missing**: created with mode `0o700` on first use.  
- **Clock changes**: reliance on `Date.now()`; no monotonic clock required.  

### 14. Anything in the ADR Requiring Clarification  
- **8‑character fallback code**: ADR mentions “typed fallback code: 8 characters” but does not specify alphabet or derivation. Proposed implementation: generate a second 8‑character numeric code (0‑9) from the same 128‑bit secret (e.g., first 8 bytes of secret converted to decimal and modulo 10) or use a base32 slice; clarify with product.  
- **QR code vs. fallback**: In Stage 2, the QR code is not built (relay not available), but the endpoint must still return the secret so the extension/UI can build the URL for testing.  
- **Relay subdomain**: Not needed for Stage 2 (in‑process transport).  
- **Device token in response**: ADR specifies `Set‑Cookie: sl_dev=<token>`; the pairing‑attempt handler should set this cookie and optionally return a minimal JSON body (e.g., `{ success: true }`).  

---

## LIMITATIONS  
- This reconnaissance is limited to the current commit of the repository; future changes may alter the exact file locations or helper functions.  
- The analysis assumes the existing test harness and build tooling remain compatible with new files.  
- Owner‑permission behavior on Windows is inferred to match the existing `initAuthToken` pattern (mode `0o600`).  

---  
**End of Report**  
*Scout does not claim final architectural authority; this is reconnaissance only.*

### Full report — lane stage2-remote-dispatch-fake-transport (sideline-scout-deep)

Now I have a thorough understanding of the codebase. Let me compile the reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** remote-access-v1-stage2-recon-20260923-160824  
**Scout ID:** stage2-remote-dispatch-fake-transport  
**Assigned Agent:** sideline-scout-deep  
**Assigned Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Repository:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Primary Authority:** REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md  
**Status:** RECONNAISSANCE COMPLETE — READ-ONLY  

> **Epistemic Notice:** This report is *reconnaissance*, not final architectural authority. All claims are labeled FACT (directly observed in source), INFERENCE (reasoned from evidence), UNKNOWN (not discoverable in current source), or CONTRADICTION (conflicting evidence).

---

## RESULT

Stage 2 **in-process remote principal dispatch with fake frame transport** is architecturally viable using the existing `ControlPlaneDaemon.handleHttpRequest` entry point with its `injectedPrincipal` parameter. The daemon already:
- Accepts an explicit `Principal` injected by the caller (bypassing `resolvePrincipal`)
- Classifies every route via default-deny `DAEMON_ROUTE_POLICIES`
- Enforces CSRF for cookie/remote principals via `X-Sideline-Action` + Origin check
- Applies `redactForPrincipal` on report/file/terminal responses
- Streams SSE via `handleSseConnection` with heartbeat and `req.on('close')` teardown
- Rejects `?token=` at the top of `handleHttpRequest` and ignores `Authorization` for remote principals

**No WebSocket relay, RelayClient, QR/UI, or cloud service is required for Stage 2.** The fake transport exists only in tests.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | **Exact daemon entry point**: `ControlPlaneDaemon.handleHttpRequest(req, res, injectedPrincipal?)` at `daemon.ts:1057` | FACT |
| 2 | **Request/response contract**: Native `http.IncomingMessage` / `http.ServerResponse`; `injectedPrincipal` bypasses `resolvePrincipal` | FACT |
| 3 | **Principal type**: `{ kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin? }` in `request-security.ts:3-6` | FACT |
| 4 | **Route classification**: `classifyDaemonRoute(method, pathname)` → `'public' | 'local-only' | 'remote-read' | 'remote-mutate'` in `remote-routes.ts:65-69` | FACT |
| 5 | **CSRF enforcement**: Lines 1151-1159 in `daemon.ts` check `X-Sideline-Action: 1` + Origin match for `remote-device` | FACT |
| 6 | **Redaction**: `redactForPrincipal(value, principal, { terminalActivity?, allowSensitiveTerminalOutput? })` in `remote-redaction.ts:45-59` | FACT |
| 7 | **SSE streaming**: `handleSseConnection` writes `event: hello`, `event: status`, `event: ai-health`, `event: execution`, then `broadcast()` pushes chunks; `req.on('close')` triggers `removeSseClient` | FACT |
| 8 | **Device token validation**: **NOT YET IMPLEMENTED** — Stage 2 must add `DeviceRegistry` with hashed tokens, pairing, expiry, revocation | FACT |
| 9 | **`expectedOrigin` flow**: Supplied by fake transport at dispatch time → stored in Principal → used by `requestOriginMatchesExpected` at `request-security.ts:40-47` | FACT |
| 10 | **Auth isolation**: `?token=` rejected at `daemon.ts:1063-1066`; `Authorization` Bearer only yields `local-admin` via `resolvePrincipal` at `daemon.ts:3836-3850` | FACT |

---

## 1. EXACT DAEMON ENTRY POINT TO REUSE

**FACT** — `ControlPlaneDaemon.handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, injectedPrincipal?: Principal)` at `src/control-plane/daemon.ts:1057`.

- The method is **private** but accessible for in-process invocation.
- It accepts an optional third parameter `injectedPrincipal` which, when provided, **skips `resolvePrincipal(req)` entirely** (line 1142).
- All route classification, CSRF, redaction, and SSE logic runs identically whether the request came from HTTP or in-process.

**IMPORTANT FILE:** `src/control-plane/daemon.ts` (lines 1057–2518)

---

## 2. CURRENT REQUEST/RESPONSE ASSUMPTIONS AN ADAPTER MUST SATISFY

**FACT** — The adapter must supply a minimal `http.IncomingMessage`-compatible object and a minimal `http.ServerResponse`-compatible object.

### Minimal `IncomingMessage` shim
```ts
{
  method: string,                    // 'GET' | 'POST' | etc.
  url: string,                       // '/api/status?gameId=abc'
  headers: Record<string, string | string[] | undefined>, // lower-case keys
  // Readable stream interface for body:
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}
```

### Minimal `ServerResponse` shim
```ts
{
  headersSent: boolean,
  writeHead(statusCode: number, headers?: Record<string, string | number | string[]>): this,
  write(chunk: string | Buffer, encoding?: string): boolean,
  end(data?: string | Buffer): this,
  // EventEmitter-like for 'close' / 'error' if needed by SSE
  on(event: 'close', listener: () => void): this,
}
```

**Observed usage in `handleHttpRequest`:**
- `req.method`, `req.url`, `req.headers` (lines 1058–1059, 1063, 1073, 1152–1154)
- `req.on('data')`, `req.on('end')` via `readJsonBody` (lines 3880–3903)
- `res.writeHead`, `res.write`, `res.end` via `sendJson` (lines 3874–3878)
- `res.headersSent` check (line 3875)
- SSE uses `res.writeHead` with specific headers, then repeated `res.write` (lines 3251–3275)
- `req.on('close')` triggers SSE teardown (line 3277)

**No other `http.IncomingMessage`/`ServerResponse` members are accessed.**

---

## 3. SMALLEST SAFE FRAME REQUEST SHAPE FOR STAGE 2 TESTS

**INFERENCE** — Based on the ADR frame spec (D3) and the daemon's HTTP route structure, the fake transport test frame needs only:

```ts
interface FrameReq {
  id: string;                    // request ID for correlation
  method: string;                // HTTP method
  path: string;                  // pathname + query, e.g. '/api/status?gameId=abc'
  headers: Record<string, string>; // lower-case keys; cookie, origin, x-sideline-action
  body?: string;                 // JSON string or empty
}
```

**Only these headers are read by the daemon for remote flows:**
| Header | Purpose |
|--------|---------|
| `cookie` | `sl_dev=<device-token>` (validated by DeviceRegistry before dispatch) |
| `origin` | CSRF check via `requestOriginMatchesExpected` |
| `x-sideline-action` | Required `'1'` for non-GET remote mutations |
| `accept` | Passed through but not validated |
| `content-type` | Expected `'application/json'` for POST bodies |
| `last-event-id` | SSE resume (read but not acted on yet) |

**Headers explicitly IGNORED/STRIPPED for remote:**
- `authorization` — never reaches Principal creation (ADR D3 line 122)
- Any `x-forwarded-*` or custom "remote" header — **forbidden by architecture** (ADR D7 line 219)

---

## 4. WHERE DEVICE-TOKEN VALIDATION OCCURS BEFORE INJECTED PRINCIPAL CREATION

**FACT** — **Does not exist yet.** Stage 2 must implement it.

**Required flow (to be built):**
```
fake transport receives frame
  → extract deviceToken from frame.headers.cookie (sl_dev=...)
  → DeviceRegistry.validate(deviceToken) → { deviceId, expectedOrigin } | null
  → if null: return 401 frame { t: 'head', id, status: 401, ... }
  → else: create Principal { kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin }
  → call daemon.handleHttpRequest(shimReq, shimRes, principal)
```

**Location for new code:** New file `src/control-plane/remote-dispatch.ts` (or similar) exporting `dispatchRemote(frameReq): AsyncIterable<FrameRes>`.

**No existing code validates device tokens.** The `localSessions` map (line 210, 3832–3849) is for *local* `sl_local` cookies only.

---

## 5. HOW `expectedOrigin` REACHES THE PRINCIPAL

**FACT** — The `expectedOrigin` is a field on the `remote-device` Principal type (`request-security.ts:5-6`). It is **supplied by the caller of `handleHttpRequest`** (the fake transport adapter) at dispatch time.

**Current flow in `handleHttpRequest` (line 1152–1154):**
```ts
const originMatches = principal.kind === 'remote-device'
  ? requestOriginMatchesExpected(req.headers.origin, principal.expectedOrigin)
  : requestOriginMatchesHost(req.headers.origin, req.headers.host);
```

**Stage 2 requirement:** The DeviceRegistry must store `expectedOrigin` (the phone's origin, e.g. `https://h-<hostPublicId>.<relay>`) at pairing time, and return it during token validation so the adapter can inject it.

**No other code path sets or reads `expectedOrigin`.**

---

## 6. WHICH REMOTE HEADERS MAY BE ACCEPTED IN STAGE 2 TESTS

**FACT** — Only the allowlisted headers from ADR D3 line 121 are meaningful. The daemon currently reads:

| Header | Read By | Notes |
|--------|---------|-------|
| `cookie` | `parseCookies` → `sl_dev` | Device token validation happens **before** `handleHttpRequest` |
| `origin` | `requestOriginMatchesExpected` | CSRF for remote mutations |
| `x-sideline-action` | Equality check `'1'` | Required for remote non-GET |
| `content-type` | Implicit via `readJsonBody` | Must be `application/json` |
| `accept` | Not validated | Passed through |
| `last-event-id` | Not acted on | SSE resume — Stage 3+ |
| `user-agent` | Not read | Logging only |

**All other headers are ignored.** The fake transport should send only the above.

---

## 7. HOW `Authorization` AND `?token=` ATTEMPTS ARE DISCARDED/IGNORED

**FACT** — Two independent guards:

1. **`?token=` rejected unconditionally** at top of `handleHttpRequest` (lines 1063–1066):
   ```ts
   if (requestUrl.searchParams.has('token')) {
     this.sendJson(res, 401, { success: false, message: 'URL token authentication is not supported.' });
     return;
   }
   ```
   This runs **before** Principal resolution, so it applies to *all* callers including in-process (if the shim includes `?token=` in `req.url`).

2. **`Authorization: Bearer` only yields `local-admin`** via `resolvePrincipal` (lines 3836–3839):
   ```ts
   const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
   if (timingSafeSecretEqual(bearer, this.authToken)) return { kind: 'local-admin', authenticatedBy: 'bearer' };
   ```
   Since `injectedPrincipal` **bypasses `resolvePrincipal` entirely** (line 1142), a remote caller sending `Authorization` gets whatever Principal the adapter injects (or 401 if adapter validates device token first). The Bearer header is **never** consulted for remote principals.

**Test proof:** Stage 1 test `RA1-5` asserts `?token=` → 401; `RA1-5b` drives `handleHttpRequest` directly with a `remote-device` Principal and no Bearer check occurs.

---

## 8. RESPONSE HEAD/DATA/END MODEL SUFFICIENT FOR TESTS

**FACT** — The daemon uses three response patterns:

### A. JSON (single-shot)
```ts
sendJson(res, status, data)  // → writeHead(status, { 'Content-Type': 'application/json' }); end(JSON.stringify(data))
```
Used for all non-SSE routes.

### B. SSE (streaming)
```ts
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no'
});
res.write(`event: hello\ndata: ${JSON.stringify({ connected: true, at: Date.now() })}\n\n`);
res.write(`event: status\ndata: ${JSON.stringify(redactForPrincipal(status, principal))}\n\n`);
// ... later via broadcast():
client.write(`event: ${event}\ndata: ${JSON.stringify(projected)}\n\n`);
// heartbeat:
res.write(`: hb ${Date.now()}\n\n`);
```

### C. Error responses
Same as JSON pattern with appropriate status codes (401, 403, 404, 405, 500, 502, 504).

**For fake transport tests, the adapter must capture:**
- `head` frame: `{ t: 'head', id, status, headers }`
- `data` frames: `{ t: 'data', id, chunk }` where `chunk` is the raw SSE line(s) (`event: ...\ndata: ...\n\n`)
- `end` frame: `{ t: 'end', id }` (on `res.end` or client close)
- `error` frame: `{ t: 'error', id, code }` (on error)

**No binary / `bodyB64` needed for Stage 2** (all daemon responses are UTF-8 JSON or SSE text).

---

## 9. SSE STREAMING MECHANICS THROUGH THE FAKE TRANSPORT

**FACT** — The daemon's SSE is a long-lived HTTP response that never calls `res.end()` until the client disconnects.

### Daemon-side (already implemented):
1. `handleSseConnection` (lines 3250–3280):
   - Writes headers + initial `hello`, `status`, `ai-health`, `execution` events
   - Starts 15s heartbeat interval writing `: hb <timestamp>\n\n`
   - Registers `req.on('close')` → `removeSseClient(res)` which clears heartbeat and deletes from `sseClients` map
2. `broadcast(event, data)` (lines 3293–3309):
   - Iterates `sseClients` map
   - Applies `redactForPrincipal` per-client based on their Principal
   - `client.write(sseLine)` — **immediate flush**, no buffering
   - On write error → `removeSseClient(client)`

### Fake transport adapter must:
- Keep the shim `res` object alive after `writeHead`
- Capture each `res.write(chunk)` as a `data` frame
- On shim `res.end()` or `req` 'close' event → emit `end` frame
- Simulate browser disconnect by calling the shim `req.emit('close')` to test teardown

**No backpressure handling in Stage 2** (ADR D3 line 120: relay caps at 1 MiB; host pauses on `ws.bufferedAmount > 4 MiB` — both are Stage 3).

---

## 10. CANCELLATION / TEARDOWN MECHANICS

**FACT** — Two cancellation paths exist:

### A. Browser disconnects (SSE)
- `req.on('close')` fires → `removeSseClient(res)` (line 3277–3279)
- Heartbeat interval cleared, client removed from `sseClients`
- No further `broadcast` writes to that client
- **No server-side abort of in-flight handlers** — the handler already returned; SSE is a separate subscription

### B. In-flight request cancellation (not yet implemented for remote)
- ADR D3 line 119: "Cancellation: browser disconnect → `cancel` → the host aborts the handler or closes the SSE subscription"
- **Stage 2 fake transport test** should simulate this by:
  1. Starting an SSE connection
  2. Sending a `cancel` frame for that request ID
  3. Adapter calls `req.emit('close')` on the SSE shim
  4. Verify `end` frame emitted and no further `data` frames

### C. Long-running handler cancellation (e.g., `/api/dispatch`)
- Router uses 15s timeout (line 454) and `activePlayerDispatches` guard (line 353–360)
- Stadium WebSocket disconnect → `handleSessionDisconnected` → resolves pending as `'unknown'` (lines 631–662)
- **Stage 2 does not need to implement handler abort** — the fake transport only tests SSE cancellation

---

## 11. BACKPRESSURE / BUFFERING CONCERNS THAT BELONG ONLY TO STAGE 3

**FACT** — The following are **explicitly deferred to Stage 3** (ADR D3 lines 118–120, Stage 3 scope lines 298–315):

| Concern | Stage 3 Implementation | Stage 2 MUST NOT |
|---------|------------------------|------------------|
| Relay per-response queue cap (1 MiB) | Relay implementation | Implement any queue cap |
| Host `ws.bufferedAmount` backpressure | `RelayClient` pauses writes | Pause/resume logic |
| Relay immediate chunk flush | Reference relay `ws.send()` per chunk | Buffering logic |
| Browser reconnection + `hello` resync | Relay + daemon `hello` handling | Reconnection logic |
| `last-event-id` SSE resume | Relay + daemon | Resume logic |
| Heartbeat `ping`/`pong` over WSS | `RelayClient` + relay | WSS heartbeat |
| Ed25519 challenge/hello | `RelayClient` + relay | Crypto handshake |

**Stage 2 fake transport** has **no backpressure** — it is an in-process synchronous/async iterable with unbounded test buffers.

---

## 12. EXACT TESTS PROVING STAGE 2 ACCEPTANCE CRITERIA

**INFERENCE** — Based on ADR Stage 2 acceptance gate (lines 285–293) and Stage 1 test patterns, the following tests are required. Each maps to a specific gate.

| Gate | Test Name | Key Assertions |
|------|-----------|----------------|
| **Pairing** | `RA2-1. pairing succeeds once, fails when reused/expired/6th wrong code` | `POST /api/pair` with secret → 201 + `sl_dev` cookie; repeat → 409; expired secret → 409; 6 wrong codes → 409 + pairing burned |
| | `RA2-2. device cookie authorizes remote-read routes` | `GET /api/status` with `sl_dev` cookie → 200; `GET /api/reports` → 200 |
| | `RA2-3. local-only route denied for remote` | `POST /api/control-plane/shutdown` with `sl_dev` → 403; `GET /stadium` → 403 |
| **Auth Isolation** | `RA2-4. remote admin Bearer cannot elevate` | `POST /api/preferences` with `sl_dev` + `Authorization: Bearer <admin>` → 403 (not 200) |
| | `RA2-5. remote ?token= cannot elevate` | `GET /api/status?token=<admin>` with `sl_dev` cookie → 401 |
| **Revocation** | `RA2-6. revoke → next request 401` | DeviceRegistry.revoke(deviceId) → subsequent `sl_dev` request → 401 |
| | `RA2-7. revoke-all works` | DeviceRegistry.revokeAll() → all devices 401 |
| **Redaction** | `RA2-8. report secrets redacted remotely, verbatim locally` | `GET /api/report?path=...` with `remote-device` → `[redacted]`; with `local-admin` → verbatim |
| **Streaming** | `RA2-9. SSE streams chunks over fake transport` | `GET /api/events` → `hello` → `status` → `ai-health` → `execution` → heartbeat `: hb` |
| **Cancel** | `RA2-10. cancel closes SSE subscription` | Start SSE → send cancel frame → `end` frame received; no further `data` frames |

**Additional implied tests:**
- `RA2-11. remote-mutate honors CSRF` — `POST /api/queue/xxx/cancel` without `X-Sideline-Action: 1` + matching Origin → 403
- `RA2-12. 30-day sliding expiry` — DeviceRegistry validates `lastSeenAt`; expired → 401
- `RA2-13. fake transport only in tests` — No production code imports the fake transport

---

## 13. EXACT SOURCE FILES LIKELY TOUCHED

**FACT** — New files (Stage 2 implementation):
| File | Purpose |
|------|---------|
| `src/control-plane/remote-dispatch.ts` | `dispatchRemote(frameReq)` adapter; shims; fake transport test helper |
| `src/control-plane/device-registry.ts` | `DeviceRegistry` class: create/validate/revoke/list devices; hashed tokens; pairing secrets; 30-day expiry |
| `src/control-plane/host-identity.ts` | Ed25519 host keypair; `hostPublicId`; persistence in `~/.sideline/remote/` |
| `src/control-plane/pairing.ts` | Pairing secret creation (local-only), exchange, typed-code fallback |
| `test/remote-access-v1-stage2.test.mjs` | All acceptance tests above |

**Existing files modified (minimal):**
| File | Change |
|------|--------|
| `src/control-plane/daemon.ts` | Export `handleHttpRequest` as `public` (or add test seam); wire DeviceRegistry into daemon construction |
| `src/control-plane/request-security.ts` | No change — Principal type already supports `expectedOrigin` |
| `src/control-plane/remote-routes.ts` | No change — table complete |
| `src/remote-redaction.ts` | No change — helper complete |
| `src/control-plane/protocol.ts` | No change — frame types are for Stadium WS, not remote frames |

**Test-only files (fake transport):**
| File | Purpose |
|------|---------|
| `test/fake-frame-transport.ts` | `IncomingMessage`/`ServerResponse` shims; `FrameReq`/`FrameRes` codec; cancellation simulation |

---

## 14. HIDDEN HAZARDS / CONTRADICTIONS

### CONTRADICTION: `handleHttpRequest` is `private`
**Evidence:** `daemon.ts:1057` declares `private async handleHttpRequest(...)`
**Impact:** In-process dispatch cannot call it directly from outside the class.
**Resolution:** Either (a) make it `public` (minimal, safe), (b) add a public `dispatchInProcess(req, res, principal)` wrapper, or (c) test seam calls private method via `daemon['handleHttpRequest']` (TypeScript allows with `@ts-ignore`). **Recommendation: (a) or (b).**

### CONTRADICTION: `expectedOrigin` validation uses `req.headers.origin` but SSE has no Origin header after initial handshake
**Evidence:** `requestOriginMatchesExpected` compares `origin` header to `expectedOrigin`. SSE connections send `Origin` on the initial GET only.
**Impact:** If a remote device's origin changes (unlikely — subdomain is fixed), CSRF would break. Not a Stage 2 blocker.
**Note:** ADR assumes one origin per host (subdomain), so this is stable.

### HAZARD: `localSessions` map is in-memory; daemon restart loses local cookies
**Evidence:** `localSessions` at line 210 is a `Map<string, number>` with no persistence.
**Impact:** Local `sl_local` cookies become invalid on daemon restart. Remote `sl_dev` cookies **must persist** via DeviceRegistry (to be implemented with file storage).
**Resolution:** DeviceRegistry must use durable storage (`~/.sideline/remote/devices.json`).

### HAZARD: `sseClients` map uses `http.ServerResponse` as key
**Evidence:** Line 170: `private readonly sseClients = new Map<http.ServerResponse, ...>()`
**Impact:** Fake transport shim must use the **exact same object** for `res` across `writeHead`, `write`, and `close` events. Using a new object per call breaks teardown.
**Resolution:** Shim must maintain object identity.

### HAZARD: `readJsonBody` enforces 1 MB limit (line 3885)
**Evidence:** `if (data.length > 1000000) { req.destroy(); reject(new Error('Payload too large.')); }`
**Impact:** Fake transport must respect this for POST bodies. ADR D3 line 105 says "body ≤ 1 MiB (413 above)".
**Resolution:** Test frames with >1MB bodies should expect 413.

### HAZARD: `broadcast` redacts per-client Principal but `buildStatus` is called once per broadcast
**Evidence:** `broadcast` (line 3293) calls `redactForPrincipal(data, state.principal, ...)` per client, but `buildStatus()` (line 306) has no Principal argument.
**Impact:** Status payload is built once, then redacted per-client. This is correct — redaction is a projection, not a mutation.
**Verification:** Stage 1 test `RA1-7` confirms this works.

### UNKNOWN: DeviceRegistry persistence format and location
**Evidence:** ADR D4 lines 129–130: `~/.sideline/remote/host-key.json`, `hostPublicId`. Device tokens stored hashed.
**Gap:** No schema defined for `devices.json`. Stage 2 must define:
```ts
interface StoredDevice {
  deviceId: string;
  tokenHash: string;        // SHA-256(deviceToken)
  label: string;
  createdAt: number;
  lastSeenAt: number;
  expectedOrigin: string;   // phone's origin for CSRF
}
```

### UNKNOWN: Pairing secret storage and TTL enforcement
**Evidence:** ADR D4 lines 133–138: 128-bit random, single-use, 5-min TTL, stored hashed.
**Gap:** No current code for pairing secrets. Must add to DeviceRegistry or separate `PairingStore`.

### CONTRADICTION: ADR says "validate device token on host before dispatch" but daemon has no DeviceRegistry
**Evidence:** ADR D7 line 203: "Validation happens on the host, not the relay."
**Reality:** Validation code does not exist. This is the **primary Stage 2 implementation task**.

---

## LIMITATIONS

1. **No existing tests for remote-device Principal** — Stage 1 tests drive `handleHttpRequest` with a manually constructed `remote-device` Principal but do not test device-token validation (because it doesn't exist).
2. **No DeviceRegistry, Pairing, or Host Identity code** — All are greenfield for Stage 2.
3. **No integration test harness for fake frame transport** — Must be built from scratch in test file.
4. **SSE `last-event-id` resume** — Daemon reads but ignores; Stage 3 feature.
5. **`user-agent` and `accept` headers** — Passed through but not validated; could be used for fingerprinting in Stage 3+.

---

## IMPORTANT FILES / PATHS

```
src/control-plane/daemon.ts                    // Main daemon, handleHttpRequest, SSE
src/control-plane/request-security.ts          // Principal type, timingSafeEqual, origin matching
src/control-plane/remote-routes.ts             // DAEMON_ROUTE_POLICIES, classifyDaemonRoute, principalMayAccess
src/control-plane/router.ts                    // Dispatch logic, routed by Principal-aware routes
src/control-plane/remote-redaction.ts          // redactForPrincipal, REDACTION_RULES
src/control-plane/protocol.ts                  // JSON-RPC frame types (Stadium WS, not remote)
src/remote-redaction.ts                        // Re-export of redaction helper
test/remote-access-v1-stage1.test.mjs          // Stage 1 acceptance tests (reference patterns)
```

---

## STAGE 2B PATCH MAP FOR IMPLEMENTATION PLAYER

| Slice | File(s) | Description |
|-------|---------|-------------|
| **2A** | `device-registry.ts`, `host-identity.ts` | Ed25519 host key, `hostPublicId`, `DeviceRegistry` with hashed tokens, pairing secrets, 30-day expiry, revocation |
| **2B** | `pairing.ts` | Local-only pairing creation; secret exchange → device cookie; typed-code fallback |
| **2C** | `remote-dispatch.ts` | `dispatchRemote(frameReq)` adapter; IncomingMessage/ServerResponse shims; device-token validation → Principal injection → `handleHttpRequest` |
| **2D** | `daemon.ts` (minimal) | Wire DeviceRegistry into daemon; expose `handleHttpRequest` publicly or via test seam |
| **2E** | `fake-frame-transport.ts` (test-only) | Shim classes; frame codec; cancellation simulation |
| **2F** | `remote-access-v1-stage2.test.mjs` | All 13 acceptance tests from §12 |

**STOP LINE:** Stage 2 ends when all 13 tests pass. **Stage 3 begins** with `RelayClient` (WebSocket), reference relay, and real network integration.

---

**END OF RECONNAISSANCE REPORT**

### Full report — lane stage2-regression-acceptance-map (sideline-scout-quick)

# SCOUT STAGE 2 RECONNAISSANCE REPORT
## Play: remote-access-v1-stage2-recon-20260923-160824
## Scout: stage2-regression-acceptance-map
## Model: openrouter/cohere/north-mini-code:free

**SCout is reconnaissance, not final architectural authority.**

---

## KEY DISCOVERIES

### Current State Analysis
**FACT:** Stage 1 security is GREEN with 51/51 regression gate passed. The existing `remote-access-v1-stage1.test.mjs` demonstrates comprehensive Stage 1 testing including:
- Principal model implementation
- Route default-deny classification  
- Remote redaction
- Remote CSRF expectedOrigin seam
- SSE heartbeat and cookie auth

**FACT:** The ADR (Architecture Decision Record) provides complete Stage 2 specification with accepted scope:
- Host key + hostPublicId generation/storage
- Pairing creation/exchange with local-principal-only restrictions
- DeviceRegistry with hashed device tokens
- List/rename/revoke/revoke-all device management
- 30-day sliding expiry
- In-process remote-device dispatch
- Fake frame transport tests
- Existing allowlist/redaction enforcement

**INFERENCE:** Stage 2 implementation requires creating new functionality across multiple domains, with significant dependencies on existing Stage 1 infrastructure.

---

## 1. IMPLEMENTATION SLICES IN SAFEST ORDER

### Slice 1: Host Identity Infrastructure
**Scope:** Generate/Store host keypair, compute hostPublicId
**Dependencies:** None (independent filesystem setup)
**Risk:** LOW - purely local storage, no security boundaries

### Slice 2: Pairing Secret Management  
**Scope:** Local-principal pairing secret creation, hashing, validation
**Dependencies:** Slice 1 (needs host identity)
**Risk:** MEDIUM - security-critical secret handling

### Slice 3: DeviceRegistry Core
**Scope:** Device data structure, persistence, CRUD operations
**Dependencies:** Slice 2 (pairing creates devices)
**Risk:** MEDIUM - state management complexity

### Slice 4: Remote-Device Principal Dispatch
**Scope:** In-process frame transport adapter, Principal injection
**Dependencies:** Slices 1-3 (needs device validation)
**Risk:** HIGH - protocol adapter complexity

### Slice 5: Fake Frame Transport Tests
**Scope:** Test infrastructure for Stage 2 acceptance gates
**Dependencies:** Slice 4 (tested functionality)
**Risk:** LOW - test infrastructure

---

## 2. DEPENDENCY GRAPH

```
┌─────────────────┐    ┌─────────────────┐
│   File System   │    │   Host Identity │
│   Conventions   │───▶│  (host-key.json)│
└─────────────────┘    └─────────────────┘
                               │
                               ▼
┌─────────────────┐    ┌─────────────────┐
│  Pairing Logic  │───▶│ DeviceRegistry  │
│ (local-only)    │    │ (CRUD operations)│
└─────────────────┘    └─────────────────┘
                               │
                               ▼
┌─────────────────┐    ┌─────────────────┐
│ Remote-Redaction │───▶│ Dispatch Adapter│
│ (Stage 1 ready) │    │ (remote-device)  │
└─────────────────┘    └─────────────────┘
```

---

## 3. MINIMUM FOCUSED TESTS AFTER EACH SLICE

### After Slice 1:
```javascript
// Host key generation/persistence test
test('host key stored with owner-only permissions', async () => {
  // Verify ~/.sideline/remote/host-key.json exists
  // Verify hostPublicId format (base32(sha256(publicKey))[0..20])
  // Verify permissions are 0o600
});
```

### After Slice 2:
```javascript
// Pairing secret lifecycle test
test('pairing secret single-use 5-minute TTL', async () => {
  // Local-principal creates pairing
  // Secret hashed, never stored raw  
  // Successful exchange → device cookie
  // Reuse attempt → failure
  // 5th wrong code → pairing burned
});
```

### After Slice 3:
```javascript
// DeviceRegistry operations test
test('device list/rename/revoke/revoke-all', async () => {
  // List devices endpoint
  // Rename device label
  // Revoke individual device
  // Revoke all devices
});
```

### After Slice 4:
```javascript
// Remote dispatch adapter test
test('remote-device principal injection', async () => {
  // Paired device authorizes remote-read
  // Local-only routes denied for remote
  // Remote admin Bearer ignored
  // Remote ?token ignored
});
```

### After Slice 5:
```javascript
// Stage 2 acceptance gates test
test('pairing + auth isolation + revocation + redaction + streaming', async () => {
  // Full Stage 2 acceptance criteria from ADR
});
```

---

## 4. MINIMUM ADJACENT REGRESSION SUITE AFTER STAGE 2

**Existing tests to preserve:**
- All 51 Stage 1 regression tests (51/51)
- All Scout test suites (scout-formation, scout-continuation, etc.)
- All player routing and dispatch tests

**New regression tests:**
- Stage 2 acceptance gate tests (minimum 35 tests covering all gates)
- Integration tests verifying Stage 1 + Stage 2 compatibility

---

## 5. BEHAVIORAL CONTRACTS STAGE 2 MUST NOT CHANGE

**From ADR §2.5, Stage 1:**
- `POST /api/session` exchanges fragment for httpOnly cookie
- Browser uses cookie, never puts credentials in URLs
- CORS: same-origin only
- CSRF: `X-Sideline-Action: 1` + matching Origin
- SSE: 15s heartbeat, `no-transform`, immediate flush
- Timing-safe comparison for secrets
- Route classification: default-deny table

**Additional Stage 2 contracts:**
- Host key stored at `~/.sideline/remote/host-key.json` with 0o600
- Pairing secret: 128-bit random, hashed, single-use, 5min TTL
- Device token: 256-bit, store SHA-256 hash only
- 30-day sliding idle expiry
- Device management: local-principal only
- Remote-device: `in-process` authenticatedBy, never `bearer` or `cookie`

---

## 6. EXISTING TESTS LIKELY AFFECTED

**MODIFIED:**
- `remote-access-v1-stage1.test.mjs` - may need updated expectations for Stage 2 behavior

**NEWLY REQUIRED:**
- `remote-access-v1-stage2.test.mjs` - comprehensive Stage 2 tests

**UNAFFECTED:**
- All Scout formation/continuance tests
- All player discovery/routing tests
- All game lifecycle tests

---

## 7. TESTS KNOWN UNRELATED THAT PREMIUM PLAYER SHOULD NOT INVESTIGATE

**Stage 1 regression tests (preserve existing):**
- `scout-formation.test.mjs`
- `scout-continuation.test.mjs`
- `player-discovery.test.mjs`
- `game-foundation.test.mjs`
- `live-player-terminal-v02-transport.test.mjs`

**Stage 2 integration tests (let premium Player handle):**
- Pairing endpoint tests
- DeviceRegistry CRUD tests
- Remote dispatch adapter tests
- Acceptance gate tests

---

## 8. PERSISTENCE/RESTART ACCEPTANCE TESTS

### Host Key Persistence
```javascript
test('host key survives daemon restart', async () => {
  const dir = makeTempDir();
  const daemon1 = new ControlPlaneDaemon({ dir, port: 41700 });
  await daemon1.start();
  const hostKey1 = readHostKey(dir);
  
  await daemon1.stop();
  
  const daemon2 = new ControlPlaneDaemon({ dir, port: 41701 });
  await daemon2.start();
  const hostKey2 = readHostKey(dir);
  
  assert.deepEqual(hostKey1, hostKey2, 'host key persisted across restarts');
});
```

### DeviceRegistry Persistence
```javascript
test('device registry survives daemon restart', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41702 });
  await daemon.start();
  
  // Create device via pairing flow
  await createDeviceViaPairing(daemon.port);
  
  await daemon.stop();
  
  const daemon2 = new ControlPlaneDaemon({ dir, port: 41703 });
  await daemon2.start();
  
  // Device should still be accessible
  assert.ok(deviceExists(daemon2.port), 'devices persisted across restarts');
});
```

---

## 9. EXPIRY/REVOCATION ACCEPTANCE TESTS

### Pairing Secret Expiry
```javascript
test('pairing secret expires after 5 minutes', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41704 });
  await daemon.start();
  
  const secret = generatePairingSecret();
  storeSecretHashed(dir, secret);
  
  // Should succeed immediately
  await exchangeSecret(daemon.port, secret);
  
  // Wait 5 minutes + 1 second
  await wait(5 * 60 * 1000 + 1000);
  
  // Should now fail
  assert.equal(exchangeSecret(daemon.port, secret).status, 401);
});
```

### Device Revocation
```javascript
test('revoke device → next request unauthorized', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41705 });
  await daemon.start();
  
  // Create and pair device
  const deviceId = await createDeviceViaPairing(daemon.port);
  
  // Revoke device (local-principal only)
  await revokeDevice(daemon.port, deviceId);
  
  // Next request should be unauthorized
  const status = await statusRequestWithDeviceCookie(daemon.port, deviceId);
  assert.equal(status, 401, 'revoked device receives 401');
});
```

---

## 10. SECURITY-ABUSE CASES WORTH TESTING

### Host Key Security
```javascript
test('host key file permissions prevent unauthorized access', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41706 });
  await daemon.start();
  
  // Verify file permissions are 0o600
  const keyPath = path.join(dir, 'host-key.json');
  const stats = fs.statSync(keyPath);
  assert.equal(stats.mode & 0o777, 0o600, 'host key has owner-only permissions');
});
```

### Pairing Security
```javascript
test('pairing secret never exposed in logs or network', async () => {
  // Verify secret is hashed before storage
  // Verify no logs contain raw secret
  // Verify fragment secret cleared after exchange
  // Verify typed code burns after 5 failures
});
```

### Device Token Security
```javascript
test('device token hash never exposed', async () => {
  // Verify only SHA-256 hash stored
  // Verify raw token never logged
  // Verify cookie transport is httpOnly, Secure, SameSite=Lax
});
```

---

## 11. EXPLICIT STAGE 2 GO/NO-GO CHECKLIST

### GO Conditions:
- [ ] Host key generated and stored with proper permissions
- [ ] Pairing secret creation works (local-principal only)
- [ ] DeviceRegistry can store/revoke/list/rename devices  
- [ ] 30-day sliding expiry implemented and tested
- [ ] Remote-device principal injection works
- [ ] All Stage 2 acceptance gates pass
- [ ] Integration with Stage 1 is seamless
- [ ] No regression in existing Stage 1 functionality

### NO-GO Triggers:
- [ ] Host key file permissions incorrect
- [ ] Pairing secret exposed in any form
- [ ] Device management operations fail
- [ ] Remote-device cannot bypass local-only routes
- [ ] Any Stage 2 acceptance gate fails
- [ ] Security vulnerability discovered

---

## 12. EXACT STOP LINE SEPARATING STAGE 2 FROM STAGE 3

**Stage 2 STOP Line:** After the fake frame transport tests pass and all Stage 2 acceptance gates are GREEN.

**Implementation boundary:**
```typescript
// Stage 2 dispatch adapter (src/control-plane/dispatch-adapter.ts)
export class DispatchAdapter {
  // In-process adapter for Stage 2 only
  // Never builds real relay
  // Only used in tests via fake transport
}

// Stage 3 RelayClient (src/control-plane/relay-client.ts)  
export class RelayClient {
  // Real WebSocket client for relay/v1
  // Stage 3 implementation
}
```

**Transition point:** When fake frame transport is removed and real RelayClient is implemented.

---

## 13. RECOMMENDED IMPLEMENTATION PLAYER/EFFORT

### Player Assignment (Following SOP):
- **Architecture design:** Claude Opus (high reasoning)
- **Core implementation:** Codex (implementation worker)
- **Test implementation:** Codex (test writer)
- **Security review:** Opus (security validation)

### Effort Estimation:
- **Slice 1:** 2-3 person-days (filesystem ops)
- **Slice 2:** 4-5 person-days (security-critical pairing)  
- **Slice 3:** 3-4 person-days (state management)
- **Slice 4:** 6-8 person-days (complex adapter)
- **Slice 5:** 2-3 person-days (test infrastructure)
- **Total:** 17-23 person-days

### Anti-Gravity Compression Opportunities:
- Reuse existing daemon.ts HTTP request/response patterns
- Leverage existing Principal type from request-security.ts
- Utilize existing route classification from remote-routes.ts
- Adopt existing redaction patterns from remote-redaction.ts

---

## IMPORTANT FILES / PATHS

**Source Files to Create:**
- `src/control-plane/host-identity.ts` - Host key generation/storage
- `src/control-plane/pairing.ts` - Pairing secret management
- `src/control-plane/device-registry.ts` - Device CRUD operations
- `src/control-plane/dispatch-adapter.ts` - Remote-device adapter
- `src/control-plane/fake-transport.ts` - Test infrastructure

**Source Files to Modify:**
- `src/control-plane/daemon.ts` - Add host key initialization
- `src/control-plane/remote-routes.ts` - Add pairing/device routes
- `src/control-plane/router.ts` - Add remote-device routing
- `src/public/index.html` - Add pairing UI (Stage 5 deferred)

**Test Files to Create:**
- `test/remote-access-v1-stage2.test.mjs` - Comprehensive Stage 2 tests
- `test/remote-access-v1-stage2-acceptance.test.mjs` - Acceptance gate tests

---

## LIMITATIONS

**Known Unknowns:**
1. Exact Windows vs POSIX permission implementation
2. Performance characteristics of DeviceRegistry operations  
3. Concurrency handling for pairing flows
4. Integration points with existing Scout formation

**Required Architectural Decisions:**
1. DeviceRegistry data shape (fields, ordering, indexing)
2. Pairing secret entropy and format
3. Device token cookie naming and scope
4. ExpectedOrigin validation timing and error handling

---

## CONCLUSION

**Stage 2 Implementation Path:** Safe to proceed with Slice 1→5 in order defined. Each slice builds on previous ones with increasing complexity.

**Risk Assessment:** Medium overall, primarily concentrated in Slice 4 (dispatch adapter) and security aspects of pairing.

**Recommended Timeline:** 2-3 weeks for full implementation with 2 premium Players.

**Next Scout Action:** Focus on exact implementation coordinates and seam identification for each slice. Premium Player can begin with Slice 1 while Scout maps remaining unknowns.

---

*REPORT FILE: SCOUT-remote-access-v1-stage2-regression-acceptance-map.md*
*REPORT TIMESTAMP: 2026-09-23 16:08 MDT*

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-stage2-recon-20260923-160824

