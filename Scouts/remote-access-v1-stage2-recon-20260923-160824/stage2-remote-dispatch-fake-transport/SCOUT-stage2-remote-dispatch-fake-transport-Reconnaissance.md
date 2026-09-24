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
