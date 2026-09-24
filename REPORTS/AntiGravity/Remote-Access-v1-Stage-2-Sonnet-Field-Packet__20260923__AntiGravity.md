# Remote Access v1 · Stage 2 Reconciliation & Claude Sonnet Field Packet

**AGENT:** Anti-Gravity  
**ROLE:** A-Team Scout / Architecture Reconciler  
**DATE:** 2026-09-23  
**PRIMARY AUTHORITY:** `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md`  
**SCOUT FORMATION:** `C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage2-recon-20260923-160824\` (3/3 lanes complete)  
**STATUS:** COMPLETE · READ-ONLY PASS · NO RUNTIME CODE MODIFIED  

---

## A. VERDICT

### `READY FOR SONNET`

All eight architectural adjudication questions are resolved with zero ambiguity. The implementation boundary is strictly fenced to Stage 2 (host identity, pairing store, device registry, in-process remote dispatch adapter, fake transport acceptance tests, and Stage 1 security enforcement).

---

## B. RESOLVED DECISIONS

### 1. Pairing Create vs Pairing Exchange

* **The Problem:** Scout 1 proposed classifying both `/api/pairing/create` and `/api/pairing/attempt` as `local-only`. If exchange were `local-only`, a phone arriving via remote dispatch (or fake transport) would receive a `403 Forbidden`, making remote pairing impossible.
* **Adjudicated Decision:**
  * **Pairing Creation (`POST /api/pairing/create`):** Strictly `local-only`. Callable exclusively by `local-admin` (authenticated via loopback Bearer or `sl_local` cookie). Generates a random 128-bit secret and an 8-character fallback code, saves only their SHA-256 hashes in memory with a 5-minute TTL, and returns the raw secret and fallback code to the local desktop caller for QR / code display.
  * **Pairing Exchange (`POST /api/pairing/exchange`):** Classified as `public` (unauthenticated bootstrap), but **strictly secret-gated**. The incoming request (via remote dispatch or loopback) carries `{ secret: string, label?: string }` or `{ code: string, label?: string }` in the POST body. The daemon compares the hash using `timingSafeSecretEqual` against active pairing records.
    * If valid: single-use consumption burns the pairing record immediately, mints a new `deviceId` and 256-bit `deviceToken`, stores `tokenHash` in `DeviceRegistry`, sets `Set-Cookie: sl_dev=<deviceToken>; HttpOnly; Secure; SameSite=Lax; Path=/`, and returns `{ success: true, deviceId }`.
    * If invalid: increments the failed-attempt counter; if 5 failures are reached, the record is burned immediately; returns 401.
  * **Authenticated Remote Requests:** Any subsequent request arriving through the in-process remote dispatch adapter with `Cookie: sl_dev=<deviceToken>` is authenticated by the adapter against `DeviceRegistry`, which injects `Principal { kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin }`.

### 2. Pairing Persistence

* **Adjudicated Decision:** Pairing records are **MEMORY-ONLY** in `PairingStore`.
  * The 5-minute TTL is ephemeral. If the daemon restarts while a QR code is on-screen, the user is sitting right at the desktop and can click "Pair a phone" again.
  * Storing pairing records on disk would introduce unneeded I/O, garbage collection, and risk leaving secret hashes on disk.
  * Raw pairing secrets are NEVER persisted anywhere (in memory or disk). Only SHA-256 hashes exist in memory during the 5-minute window.

### 3. Fallback Code

* **Adjudicated Decision:**
  * **Alphabet:** Crockford Base32 subset avoiding ambiguous characters: `23456789ABCDEFGHJKMNPQRSTVWXYZ` (30 characters, omitting 0/O and 1/I/L).
  * **Length & Entropy:** Exactly 8 characters (e.g. `K9X2-7M4P`). $30^8 \approx 6.56 \times 10^{11}$ combinations. With a hard limit of 5 failed attempts within 5 minutes, brute-force probability is $< 8 \times 10^{-12}$.
  * **Derivation:** Generated independently using `crypto.randomBytes()`. It is **never derived from the QR secret**, ensuring compromise or inspection of the fallback code reveals 0 bits of the 128-bit QR secret.
  * **Storage:** Stored in `PairingStore` **only as a SHA-256 hash** of the normalized code (uppercase, hyphens removed).
  * **Burn Policy:** Any 5 failed attempts against a pairing record burns both the fallback code and the QR secret immediately.

### 4. Device Token Storage

* **Adjudicated Decision:** `DeviceRegistry` persists in `~/.sideline/remote/devices.json` (or `<dir>/remote/devices.json`).
  * **Stored Schema:**
    ```ts
    interface DeviceRecord {
      deviceId: string;       // random 16-byte hex (stable identifier)
      tokenHash: string;      // sha256(rawDeviceToken) in hex
      label: string;          // user-facing name (defaults to client UA summary, renameable)
      createdAt: number;      // epoch ms
      lastSeenAt: number;     // epoch ms (updated on every authenticated request)
    }
    ```
  * Raw 256-bit `deviceToken` (`crypto.randomBytes(32).toString('base64url')`) exists in memory only long enough to set `Set-Cookie: sl_dev=<deviceToken>` on the pairing exchange response. It is NEVER written to disk.
  * No speculative fields. Speculative origin, IP, or network topology fields are forbidden in `DeviceRecord`.

### 5. Expected Origin

* **Adjudicated Decision:**
  * In the ADR, the expected origin is the host's public origin: `https://h-<hostPublicId>.<relay-domain>`. It is an environment/host property, **not a per-device property**.
  * `DeviceRegistry` does NOT store `expectedOrigin`.
  * The in-process remote dispatch adapter (and in Stage 3, `RelayClient`) is configured with the expected host origin (e.g., passed in options or derived as `https://h-${hostPublicId}.${relayDomain}`).
  * In Stage 2 fake transport tests, the fake transport harness passes an explicit `expectedOrigin: 'https://h-test.sideline.live'` to the remote dispatch adapter. The adapter injects this `expectedOrigin` into `Principal { kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin }`.
  * Existing Stage 1 CSRF checking in `handleHttpRequest` (`requestOriginMatchesExpected(req.headers.origin, principal.expectedOrigin)`) operates seamlessly without baking Stage 3 domain deployment config into the storage schema.

### 6. Dispatch Entry Seam

* **Adjudicated Decision:** Add ONE narrow, strongly-typed public method to `ControlPlaneDaemon`:
  ```ts
  public async dispatchRemoteRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    principal: Extract<Principal, { kind: 'remote-device' }>
  ): Promise<void> {
    return this.handleHttpRequest(req, res, principal);
  }
  ```
  * **Rationale:**
    1. Keeps `handleHttpRequest` private so generic loopback callers cannot bypass authentication.
    2. Strongly enforces at the compiler level that external in-process dispatch can ONLY inject a `remote-device` principal.
    3. Provides an explicit, durable production seam for both Stage 2 fake transport tests and Stage 3 `RelayClient`.

### 7. Device Cookie Validation

* **Adjudicated Decision:** `sl_dev` validation belongs **EXCLUSIVELY in the in-process remote dispatch adapter before Principal injection**.
  * Loopback `resolvePrincipal()` in `daemon.ts` continues to validate ONLY local credentials (`Authorization: Bearer` and `sl_local` cookie).
  * **Core Invariant Preserved:** A normal loopback HTTP request to `http://127.0.0.1:3100` presenting `Cookie: sl_dev=...` will NEVER resolve to a `remote-device` principal (it returns 401).
  * The remote dispatch adapter extracts `sl_dev` from incoming frame headers, verifies the hash via `DeviceRegistry.authenticate(token)`, slides `lastSeenAt`, and injects the verified `remote-device` principal. If invalid, the adapter returns a 401 frame immediately without dispatching to the router.

### 8. Host Key Persistence

* **Adjudicated Decision:**
  * **Location:** `<dir>/remote/host-key.json` (where `<dir>` defaults to `~/.sideline` or `options.dir`).
  * **Generation:** `crypto.generateKeyPairSync('ed25519')`.
  * **Format:**
    ```ts
    interface StoredHostKey {
      version: 1;
      hostPublicId: string;   // 20-character lowercase RFC 4648 base32
      publicKeyHex: string;   // 32-byte raw public key hex
      privateKeyHex: string;  // 32-byte raw private key (or PKCS8 DER hex)
      createdAt: number;
    }
    ```
  * **`hostPublicId` Derivation:** `base32(sha256(rawPublicKey))[0..20]`. Lowercase RFC 4648 base32 (`[a-z2-7]`) because it serves as a DNS subdomain (`h-<hostPublicId>`).
  * **Safe Atomic Persistence:** Written to `host-key.json.<instanceNonce>.tmp` with mode `0o600`, followed by `fs.renameSync()`. Parent directory created with mode `0o700`.
  * **No Accidental Rotation:** If `host-key.json` exists, any read/parse error throws an explicit fatal exception (`Refusing to overwrite existing host key`). A new keypair is generated ONLY when the file does not exist.
  * **Platform Consistency:** Node's `mode: 0o600` is used consistently across Windows and POSIX, exactly matching Sideline's proven `initAuthToken` pattern.

---

## C. SLICE PLAN

Implement Stage 2 across four small, bounded slices.

```
┌────────────────────────────────┐
│ Slice 2A: Host Identity        │  (Ed25519, hostPublicId, base32, ~/.sideline/remote/host-key.json)
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ Slice 2B: Pairing & Registry   │  (PairingStore in-mem, DeviceRegistry on-disk, local-only CRUD routes)
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ Slice 2C: Remote Dispatch      │  (InProcessRemoteAdapter, FrameReq/Res shims, sl_dev validation seam)
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ Slice 2D: Fake Transport Gate  │  (End-to-end acceptance tests, full adjacent regression 51/51 + Stage 2)
└────────────────────────────────┘
```

---

### Slice 2A: Host Identity Foundation

* **Exact files to create/modify:**
  * `src/control-plane/host-identity.ts` (NEW)
* **Exact existing seams/helpers to reuse:**
  * `Node.js crypto`: `generateKeyPairSync('ed25519')`, `createHash('sha256')`
  * Sideline atomic write pattern from `daemon.ts` (`writeDiscoveryRecord` / `initAuthToken`)
* **Required behavior:**
  * Provide `HostIdentityManager`:
    * `ensureIdentity(remoteDir: string): HostIdentity`
    * Computes `hostPublicId = base32Lower(sha256(rawPublicKey)).slice(0, 20)`
    * Lowercase RFC 4648 base32 alphabet: `abcdefghijklmnopqrstuvwxyz234567`
    * Atomically writes `host-key.json` with mode `0o600` if not present
    * Refuses to regenerate/overwrite if file exists but fails reading (throws)
* **Explicit non-goals:**
  * No WSS handshake or challenge-signing in this slice (Stage 3).
  * No network sockets.
* **Focused tests:**
  * Generate new key -> verify `hostPublicId` length 20, valid base32 charset `[a-z2-7]`.
  * Reload existing key -> verify exact same `hostPublicId` is returned.
  * Corrupted file / unreadable file -> verify exception thrown, no silent overwrite.
* **Exact STOP condition:**
  * Unit test for host identity passes cleanly.
* **What the next slice may assume:**
  * A stable `hostPublicId` and durable keypair can be instantiated from any `dir`.

---

### Slice 2B: Pairing Store & Device Registry

* **Exact files to create/modify:**
  * `src/control-plane/pairing.ts` (NEW)
  * `src/control-plane/device-registry.ts` (NEW)
  * `src/control-plane/remote-routes.ts` (MODIFIED: add route policies)
  * `src/control-plane/daemon.ts` (MODIFIED: mount routes and instantiate registry)
* **Exact existing seams/helpers to reuse:**
  * `src/control-plane/request-security.ts`: `timingSafeSecretEqual`, `Principal`
  * `src/control-plane/remote-routes.ts`: `DAEMON_ROUTE_POLICIES`
* **Required behavior:**
  1. `PairingStore`:
     * In-memory store of active pairings.
     * `createPairing()`: returns `{ pairingId, secret, code, expiresAt }` (5-min TTL).
     * `code`: 8 characters from Crockford subset `23456789ABCDEFGHJKMNPQRSTVWXYZ`.
     * Store only `sha256(secret)` and `sha256(normalizedCode)`.
     * `exchange(candidateSecretOrCode)`: timing-safe check; burns on 5 wrong attempts; deletes record on success.
  2. `DeviceRegistry`:
     * Persisted to `<dir>/remote/devices.json` with atomic write and mode `0o600`.
     * `createDevice(label)`: mints 256-bit `deviceToken`, stores `tokenHash`, returns `{ deviceId, rawToken }`.
     * `authenticate(rawToken)`: timing-safe match against stored `tokenHash`. Verifies 30-day sliding expiry (`now - lastSeenAt <= 30 days`). On success, updates `lastSeenAt = now` and persists.
     * `list()`: returns all devices without `tokenHash`.
     * `rename(deviceId, label)`: updates label.
     * `revoke(deviceId)`: removes device.
     * `revokeAll()`: clears all devices.
  3. Routes in `daemon.ts`:
     * `POST /api/pairing/create`: `local-only` -> calls `pairingStore.createPairing()`.
     * `POST /api/pairing/exchange`: `public` (secret-gated) -> calls `pairingStore.exchange(...)`, creates device, sets `Set-Cookie: sl_dev=<rawToken>; HttpOnly; Secure; SameSite=Lax; Path=/`, returns `{ success: true, deviceId }`.
     * `GET /api/devices`: `local-only` -> calls `deviceRegistry.list()`.
     * `PATCH /api/devices/:id`: `local-only` -> calls `deviceRegistry.rename()`.
     * `DELETE /api/devices/:id`: `local-only` -> calls `deviceRegistry.revoke()`.
     * `DELETE /api/devices`: `local-only` -> calls `deviceRegistry.revokeAll()`.
* **Explicit non-goals:**
  * No remote dispatch framing yet (Slice 2C).
  * No Settings UI or QR rendering (Stage 5).
* **Focused tests:**
  * Pairing secret works once; reuse fails; expired secret fails; 5th wrong code burns pairing.
  * Device list, rename, revoke, revoke-all via local-admin requests.
  * Remote caller cannot access `local-only` device management routes (returns 403).
* **Exact STOP condition:**
  * Route coverage test (`RA1-3`) still passes with the 6 new routes classified.
* **What the next slice may assume:**
  * `DeviceRegistry` can authenticate tokens, slide `lastSeenAt`, and manage revocations.

---

### Slice 2C: In-Process Remote Dispatch Adapter

* **Exact files to create/modify:**
  * `src/control-plane/remote-dispatch.ts` (NEW)
  * `src/control-plane/daemon.ts` (MODIFIED: expose `dispatchRemoteRequest`)
* **Exact existing seams/helpers to reuse:**
  * `ControlPlaneDaemon.handleHttpRequest` via `dispatchRemoteRequest`
  * `src/control-plane/request-security.ts`: `parseCookies`
* **Required behavior:**
  1. Define Frame types matching ADR D3:
     ```ts
     export interface FrameReq {
       id: string;
       method: string;
       path: string;
       headers: Record<string, string>;
       body?: string;
     }
     export type FrameRes =
       | { t: 'head'; id: string; status: number; headers: Record<string, string> }
       | { t: 'data'; id: string; chunk: string }
       | { t: 'end'; id: string }
       | { t: 'error'; id: string; code: string };
     ```
  2. Implement `InProcessRemoteAdapter`:
     * Accepts `(frame: FrameReq, onFrame: (res: FrameRes) => void)`.
     * If route is `/api/pairing/exchange`: dispatches without `sl_dev` cookie (as public bootstrap).
     * For all other routes: extracts `sl_dev` from `frame.headers.cookie`. Validates with `deviceRegistry.authenticate(token)`.
       * If invalid or expired: emits `{ t: 'head', id, status: 401, ... }` and `{ t: 'end', id }`.
       * If valid: constructs `Principal { kind: 'remote-device', deviceId, authenticatedBy: 'in-process', expectedOrigin }`.
     * Strips/ignores incoming `Authorization` header and rejects `?token=` (daemon enforces 401 for `?token=`).
     * Instantiates minimal `http.IncomingMessage` and `http.ServerResponse` shims.
     * Invokes `daemon.dispatchRemoteRequest(shimReq, shimRes, principal)`.
     * Shims stream `writeHead` to `head` frame, `write` to `data` frames, `end` to `end` frame.
     * Implements `cancel(id)`: emits `'close'` on `shimReq`, triggering daemon SSE client cleanup.
* **Explicit non-goals:**
  * No WebSocket client, no network sockets.
  * No Stage 3 buffering or backpressure caps (queue cap at 1 MiB or `ws.bufferedAmount` pauses).
* **Focused tests:**
  * In-process dispatch translates JSON response to `head` + `data` + `end` frames.
  * In-process dispatch translates SSE events to multiple `data` frames.
  * Cancelling SSE in-flight emits `'close'` and terminates streaming.
* **Exact STOP condition:**
  * Dispatch adapter shims function without throwing unhandled exceptions.
* **What the next slice may assume:**
  * `InProcessRemoteAdapter` can drive the entire daemon pipeline end-to-end via frames.

---

### Slice 2D: Fake Transport Acceptance & Full Regression Gate

* **Exact files to create/modify:**
  * `test/remote-access-v1-stage2.test.mjs` (NEW)
* **Exact existing seams/helpers to reuse:**
  * Test daemon harness pattern from `test/remote-access-v1-stage1.test.mjs`
  * `redactForPrincipal` verification
* **Required behavior:**
  * Implement complete Stage 2 acceptance test suite verifying:
    1. Pairing succeeds once with valid secret -> returns `sl_dev` cookie.
    2. Reusing pairing secret fails (single-use).
    3. Expired pairing secret fails (5-minute TTL).
    4. 5 failed fallback code attempts burns the pairing record.
    5. Valid `sl_dev` cookie authorizes remote-read (`GET /api/status`).
    6. Local-only route (`POST /api/control-plane/shutdown`, `/stadium`) returns 403 for `remote-device`.
    7. Remote `Authorization: Bearer <adminToken>` is ignored and cannot elevate privileges.
    8. Remote `?token=` returns 401.
    9. Revoking a device -> subsequent request with that device's cookie gets 401.
    10. Revoke-all invalidates every device session.
    11. Remote redaction: synthetic API keys in report are redacted for `remote-device` and verbatim for `local-admin`.
    12. SSE streaming: `/api/events` streams `hello`, `status`, `ai-health`, `execution`, and `: hb` heartbeat frames.
    13. SSE cancellation: sending `cancel` closes the subscription cleanly.
    14. 30-day sliding expiry validation.
* **Explicit non-goals:**
  * Do not start RelayClient or WSS.
* **Focused tests:**
  * `node --test test/remote-access-v1-stage2.test.mjs`
* **Exact STOP condition:**
  * All Stage 2 acceptance criteria PASS.
  * Full adjacent regression gate PASSES (51/51 Stage 1 + Stage 2).

---

## D. TEST PLAN

### Focused Test Command (After Each Slice)

```powershell
# After Slice 2A (Host Identity):
npm run compile; node --test test/remote-access-v1-stage2.test.mjs

# After Slice 2B (Pairing & Registry):
npm run compile; node --test test/remote-access-v1-stage2.test.mjs

# After Slice 2C (Remote Dispatch Adapter):
npm run compile; node --test test/remote-access-v1-stage2.test.mjs

# After Slice 2D (Acceptance Gate):
npm run compile; node --test test/remote-access-v1-stage2.test.mjs
```

### Minimum Final Stage 2 Regression Command

Run the complete adjacent regression suite verifying zero breakage across Stage 1, Stage 2, Terminal, and Console:

```powershell
npm run compile; node --test test/remote-access-v1-stage1.test.mjs test/remote-access-v1-stage2.test.mjs test/live-player-terminal-v02-transport.test.mjs test/live-player-console-first-down.test.mjs
```

*(Expected result: 51 existing tests + ~15 Stage 2 tests = ~66 passing tests, 0 failures, 0 regressions).*

---

## E. DO-NOT-EXPLORE LIST

To conserve Claude Sonnet context and prevent rabbit holes, fence off the following:

1. **DO NOT explore or touch Relay / WebSocket client:**
   * No `ws` package connections or client sockets.
   * No `src/control-plane/relay-client.ts` (Stage 3).
   * No `relay/` directory (Stage 3 reference relay).
2. **DO NOT explore or touch UI code:**
   * `src/public/index.html` (Leave Stage 1/coexistence UI intact; Stage 5 will add pairing UI).
   * `src/extension.ts` (Do not add pairing commands or status bar items in Stage 2).
3. **DO NOT explore unrelated failing tests:**
   * `test/routing-intelligence.test.mjs` (known unrelated Settings card handle DOM mocks).
   * `test/q2-10c-work-ledger.test.mjs`, `test/q2-10f-2-*.test.mjs` (unrelated queue interval count assertions).
4. **DO NOT explore Stadium WebSocket internals:**
   * `src/control-plane/protocol.ts` and `/stadium` WS protocol (Stadium is local-only IPC).
5. **DO NOT explore GitHub authentication or OAuth:**
   * No Octokit, no OAuth apps, no account linking (D1/D5 deferred).

---

## F. STAGE 2 GO / NO-GO GATE

Before declaring Stage 2 complete, verify every item:

| Gate | Check | Verified By |
| :--- | :--- | :--- |
| **Host Key** | `host-key.json` stored with owner-only `0o600`; stable lowercase base32 `hostPublicId` | Slice 2A / Test |
| **Pairing Create** | `POST /api/pairing/create` is `local-only`; returns secret + 8-char Crockford code | Slice 2B / Test |
| **Pairing Exchange** | `POST /api/pairing/exchange` is secret-gated; burns on single-use; returns `sl_dev` cookie | Slice 2B / Test |
| **Pairing Expiry & Burn** | Expires after 5 min; burns on 5th failed code attempt | Slice 2B / Test |
| **Device Storage** | `devices.json` stores SHA-256 token hash only; raw token never persisted | Slice 2B / Test |
| **Device Management** | List, rename, revoke, revoke-all are `local-only` | Slice 2B / Test |
| **Remote Read** | `GET /api/status` with `sl_dev` cookie succeeds via in-process adapter | Slice 2C / Test |
| **Remote Deny** | Local-only routes return 403 for `remote-device` principal | Slice 2C / Test |
| **Auth Isolation** | Remote `Authorization: Bearer` cannot elevate; remote `?token=` returns 401 | Slice 2C / Test |
| **CSRF Enforcement** | Remote mutations require `X-Sideline-Action: 1` + matching `expectedOrigin` | Slice 2C / Test |
| **Redaction** | Remote reports redact synthetic API keys; local reports remain verbatim | Slice 2D / Test |
| **SSE Streaming** | In-process adapter streams chunks over fake transport; cancellation ends stream | Slice 2D / Test |
| **Sliding Expiry** | 30-day sliding window on device use | Slice 2B / Test |
| **Regressions** | 51/51 Stage 1 + terminal adjacent test suite remains completely GREEN | Final Gate |

---

## G. STOP LINE

> [!CAUTION]
> **STAGE 2 ENDS HERE.**  
> **DO NOT BEGIN `RelayClient`, `ws`, WSS handshake, reference relay, cloud networking, or Stage 3 work.**  
> Once the fake frame transport tests pass and the adjacent regression suite is green, STOP.

---

**Report file:**  
`file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/AntiGravity/Remote-Access-v1-Stage-2-Sonnet-Field-Packet__20260923__AntiGravity.md`
