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
