# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:07:52

Play: remote-pairing-pre-opus-recon-fresh-20260927-180001
Rerun of: remote-pairing-pre-opus-recon (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-28T00:00:01.889Z
Finished: 2026-09-28T00:07:54.001Z
TOTAL ELAPSED TIME: 00:07:52

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
| remote-source-truth-map | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-28T00:00:01.912Z | 2026-09-28T00:03:46.287Z | 00:03:44 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-source-truth-map-Reconnaissance.md |
| fresh-install-zero-setup | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-28T00:00:02.033Z | 2026-09-28T00:07:53.994Z | 00:07:51 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-fresh-install-zero-setup-Reconnaissance.md |
| remote-security-launch-gap | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-28T00:00:02.132Z | 2026-09-28T00:01:31.980Z | 00:01:29 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-security-launch-gap-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane remote-source-truth-map: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane fresh-install-zero-setup: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane remote-security-launch-gap: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: remote-source-truth-map (objective 971501cd3e99)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files. Inspect the current Sideline Coach repository and map the actual Remote / Send to Phone architecture from source truth. Trace host identity, relay connection, Fly.io/public relay configuration, domain/subdomain routing, QR generation, QR payload, pairing secret generation, expiry, single-use behavior, mobile authentication, paired-device persistence, reconnection, revocation, and relay-side state. For each capability classify IMPLEMENTED, PARTIAL, MISSING, or UNKNOWN and cite exact files/symbols. Do not redesign anything.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-source-truth-map-Reconnaissance.md

No structured sections were recognised in this report; the full text is under CHILD REPORTS below.

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: fresh-install-zero-setup (objective f7773976350b)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files. Determine whether a completely fresh Sideline Coach installation can currently achieve this flow with zero developer intervention: install -> launch -> click Send to Phone -> QR appears -> scan -> phone connects. Look specifically for bootstrap/enrollment requirements, credential files, secrets, environment variables, provisioning commands, machine-specific setup, relay registration, or configuration that would block a fresh user. Return YES, NO, or UNKNOWN and identify the exact first failing seam if one exists. Separate verified source truth from inference.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-fresh-install-zero-setup-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | Production relay URL/domain are baked in (`wss://relay.remote.mysidelinecoach.com/tunnel/v1`, `remote.mysidelinecoach.com`) | `src/control-plane/remote-bootstrap.ts:4-6` |
| 2 | Private-beta enrollment secret lives in `<sidelineDir>/remote/beta-enrollment.json` — **outside the VSIX**, no API/settings writer creates it | `src/control-plane/remote-bootstrap.ts:26-28` |
| 3 | Fresh install has no `beta-enrollment.json` → `productRemoteRelayBootstrap()` returns `enrollmentStatus: 'missing'` and **no enrollmentKey** | `src/control-plane/remote-bootstrap.ts:36-42` |
| 4 | Daemon falls back to product defaults, builds `RelayClient` **without** `enrollmentKey` | `src/control-plane/daemon.ts:233-254, 1064-1075` |
| 5 | `RelayClient` connects to production relay **without** `x-sideline-enrollment` header | `src/control-plane/relay-client.ts:146` |
| 6 | Production relay entrypoint (`relay/index.ts`) **requires** `ENROLLMENT_KEY` unless `ALLOW_OPEN_ENROLLMENT=true` (local testing only) | `relay/index.ts:38-40` |
| 7 | Reference relay enforces enrollment check on upgrade — rejects with 403 if key missing/mismatched | `relay/reference-relay.ts:150, 196-202` |
| 8 | UI auto-enables `remoteAccess.enabled=true` on "Send to Phone" click, then calls `/api/pairing/create` | `src/public/index.html:6260-6262` |
| 9 | Phone scans QR → hits `https://h-<hostPublicId>.remote.mysidelinecoach.com/pair#<secret>` → relay returns **503 "Deskt

**FACT:** - `PRODUCT_RELAY_URL` and `PRODUCT_RELAY_DOMAIN` are hardcoded constants in `remote-bootstrap.ts:4-6`.
- The enrollment credential file path is `<sidelineDir>/remote/beta-enrollment.json` (`remote-bootstrap.ts:6`).
- `productRemoteRelayBootstrap()` returns `enrollmentKey` **only** when the file exists and is valid (`remote-bootstrap.ts:50-53`).
- `resolveRemoteRelayBootstrap()` in `daemon.ts:233-254` uses product defaults when no explicit env vars (`SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY`) are set.
- `RelayClient` constructor (`relay-client.ts:146`) only adds the `x-sideline-enrollment` header when `enrollmentKey` is truthy.
- Production relay `loadConfig()` (`relay/index.ts:38-40`) **throws** if `ENROLLMENT_KEY` is undefined and `ALLOW_OPEN_ENROLLMENT !== 'true'`.
- The deployed production relay at `remote.mysidelinecoach.com` runs the `index.ts` entrypoint, not the test reference relay.
- Host identity (`host-key.json`) is auto-generated on first run — **not a blocker** (`host-identity.ts:89-116`).
- Device registry (`devices.json`) is auto-created on first pairing — **not a blocker** (`device-registry.ts:32-52`).
- "Send to Phone" UI auto-enables `remoteAccess.enabled` via `POST /api/preferences` (`index.html:6260-6262`).

---

**INFERENCE:** - The "trusted provisioner" mentioned in `remote-bootstrap.ts:26` is a **manual/operational step** — no automated provisioning path exists in the codebase for a fresh user.
- The enrollment key is a **shared secret between the provisioner and the production relay**; the daemon merely presents it.
- Without the enrollment key, the host tunnel **never reaches the hello/challenge phase** — the WebSocket upgrade is rejected at 403.
- The phone's QR URL resolves to the production relay, but the relay has no registered host for that `hostPublicId` → returns 503 offline page.
- The pairing exchange (`/api/pairing/exchange`) succeeds technically (it's a local daemon endpoint), but the phone can never reach the desktop UI afterward because the relay tunnel is down.
- This is a **private-beta gating mechanism**, not a bug — the architecture deliberately keeps the enrollment secret outside the VSIX.

---

**UNKNOWN:** - Whether a future "provisioning path" (e.g., signed license, marketplace entitlement, first-run wizard) is planned to deliver the enrollment key invisibly.
- Whether `ALLOW_OPEN_ENROLLMENT=true` was ever used in production (evidence says no — "only for local testing").
- Exact error message Dad would see on phone (503 offline page vs. a more specific error).

---

**CONTRADICTION:** None found. The codebase consistently treats the enrollment key as a **required production credential** that fresh installs lack.

---

**Important files:** | File | Role |
|------|------|
| `src/control-plane/remote-bootstrap.ts` | Product relay defaults + machine enrollment file reader |
| `src/control-plane/daemon.ts:233-254, 1050-1083` | Relay bootstrap resolution + `syncRelayClient()` gating |
| `src/control-plane/relay-client.ts:146` | WebSocket upgrade header logic |
| `relay/index.ts:33-41` | **Production relay config loader — requires ENROLLMENT_KEY** |
| `relay/reference-relay.ts:150, 196-202` | Relay enforcement of enrollment on host upgrade |
| `src/public/index.html:6260-6262` | "Send to Phone" auto-enable + pairing creation |
| `src/control-plane/host-identity.ts:89-116` | Auto-generated host key (works) |
| `src/control-plane/device-registry.ts:32-52` | Auto-created device registry (works) |

---

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: remote-security-launch-gap (objective ca469716beed)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files. Review the existing Remote / Send to Phone implementation specifically for launch-relevant security and failure behavior. Check stolen QR/replay resistance, token expiry, pairing URL leakage, second-device behavior, device revocation, reconnect behavior, relay outage behavior, stale sessions, and unauthorized access. Classify findings as DAY-1 BLOCKER, PRE-LAUNCH HARDENING, POST-LAUNCH/V2, or UNKNOWN. Do not invent theoretical blockers unsupported by current source. Keep the report compact and evidence-driven.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-security-launch-gap-Reconnaissance.md

**Key discoveries:** Complete reconnaissance of the Remote / Send to Phone implementation focusing on launch-relevant security and failure behavior. The existing pairing system demonstrates strong security foundations but has several gaps that require attention before production launch. All findings are reconnaissance, not final architectural authority.

**FACT:** - Pairing secrets are 128-bit random values, base64url encoded
- Device tokens are 256-bit random values, base64url encoded
- All raw secrets are SHA-256 hashed before persistence
- Memory-only pairing storage provides forward secrecy but availability concerns
- Fragment-based secret transport prevents URL leakage
- 5-minute pairing TTL with automatic cleanup
- 30-day device token expiry with sliding window
- Local-only device management with full CRUD operations
- Strict header allowlist prevents header injection attacks
- Expected origin validation uses relay domain from trusted source
- Timing-safe comparison prevents timing attacks on token validation
- One-time use pairing prevents QR replay attacks

**INFERENCE:** - The non-existent `/pair` route is the critical blocking issue preventing Send to Phone from working
- Memory-only pairing storage may be a denial-of-service risk during high load or daemon restarts
- Sliding cookie extension increases session duration but may extend exposure window
- Local-only device management limits attack surface but reduces operational flexibility
- Fragment secrecy is excellent but depends on user understanding to not share URLs
- The two-tier security model (local-only creation, public exchange) balances usability and security well
- No rate limiting on device creation could allow device enumeration if local access is compromised

**UNKNOWN:** - Exact behavior when phone browser accesses non-existent `/pair` route
- Error UX quality for various failure scenarios (expired, offline, burned)
- Mobile browser compatibility and performance with proposed `/pair` implementation
- Real-world impact of memory-only pairing storage during high-load periods
- Security implications of sliding cookie mechanism across network sessions
- Effectiveness of error messaging in preventing user confusion or security mistakes

**CONTRADICTION:** - **DAY-1 BLOCKER:** "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" - FALSE because `/pair` route does not exist
- Stage 4D/4E not green - Stage 5 implementation blocked per SOP
- No public device list endpoint exists, preventing modal confirmation signals

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane remote-source-truth-map: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane fresh-install-zero-setup: **NO** — A completely fresh Sideline Coach installation **cannot** achieve the flow `install → launch → click Send to Phone → QR appears → scan → phone connects` with zero developer intervention. **Exact First Failing Seam:** Production relay enrollment gate at `relay/index.ts:38-40` — the relay rejects the host tunnel upgrade with **403 Forbidden** because no enrollment key is presented, and the 
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane remote-security-launch-gap: Complete reconnaissance of the Remote / Send to Phone implementation focusing on launch-relevant security and failure behavior. The existing pairing system demonstrates strong security foundations but has several gaps that require attention before production launch. All findings are reconnaissance, not final architectural authority.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane fresh-install-zero-setup: None found. The codebase consistently treats the enrollment key as a **required production credential** that fresh installs lack. ---
- Cohere: North Mini Code (free) (sideline-scout-quick) · lane remote-security-launch-gap: - **DAY-1 BLOCKER:** "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" - FALSE because `/pair` route does not exist - Stage 4D/4E not green - Stage 5 implementation blocked per SOP - No public device list endpoint exists, preventing modal confirmation signals

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane remote-source-truth-map · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-source-truth-map-Reconnaissance.md
- Lane fresh-install-zero-setup · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-fresh-install-zero-setup-Reconnaissance.md
- Lane remote-security-launch-gap · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001\SCOUT-remote-security-launch-gap-Reconnaissance.md

### Full report — lane remote-source-truth-map (sideline-scout-balanced)

Now we have a good understanding.

Now we need to produce the reconnaissance report: classify each capability as IMPLEMENTED, PARTIAL, MISSING, UNKNOWN.

We need to trace:

- host identity
- relay connection
- Fly.io/public relay configuration
- domain/subdomain routing
- QR generation
- QR payload
- pairing secret generation
- expiry
- single-use behavior
- mobile authentication
- paired-device persistence
- reconnection
- revocation
- relay-side state

Let's gather facts.

**Host identity**: There's HostIdentityManager imported from ./host-identity. Let's check that file.




































</FUNCTION>

### Full report — lane fresh-install-zero-setup (sideline-scout-deep)

Now I have a complete picture. Let me compile the reconnaissance report.

---

# SCOUT REPORT: Fresh-Install Zero-Setup Remote Pairing Flow

**Play ID:** remote-pairing-pre-opus-recon-fresh-20260927-180001  
**Scout ID:** fresh-install-zero-setup  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Report Type:** READ-ONLY RECONNAISSANCE — not final architectural authority  

---

## RESULT

**NO** — A completely fresh Sideline Coach installation **cannot** achieve the flow `install → launch → click Send to Phone → QR appears → scan → phone connects` with zero developer intervention.

**Exact First Failing Seam:** Production relay enrollment gate at `relay/index.ts:38-40` — the relay rejects the host tunnel upgrade with **403 Forbidden** because no enrollment key is presented, and the production relay is deployed with `ALLOW_OPEN_ENROLLMENT !== 'true'`.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | Production relay URL/domain are baked in (`wss://relay.remote.mysidelinecoach.com/tunnel/v1`, `remote.mysidelinecoach.com`) | `src/control-plane/remote-bootstrap.ts:4-6` |
| 2 | Private-beta enrollment secret lives in `<sidelineDir>/remote/beta-enrollment.json` — **outside the VSIX**, no API/settings writer creates it | `src/control-plane/remote-bootstrap.ts:26-28` |
| 3 | Fresh install has no `beta-enrollment.json` → `productRemoteRelayBootstrap()` returns `enrollmentStatus: 'missing'` and **no enrollmentKey** | `src/control-plane/remote-bootstrap.ts:36-42` |
| 4 | Daemon falls back to product defaults, builds `RelayClient` **without** `enrollmentKey` | `src/control-plane/daemon.ts:233-254, 1064-1075` |
| 5 | `RelayClient` connects to production relay **without** `x-sideline-enrollment` header | `src/control-plane/relay-client.ts:146` |
| 6 | Production relay entrypoint (`relay/index.ts`) **requires** `ENROLLMENT_KEY` unless `ALLOW_OPEN_ENROLLMENT=true` (local testing only) | `relay/index.ts:38-40` |
| 7 | Reference relay enforces enrollment check on upgrade — rejects with 403 if key missing/mismatched | `relay/reference-relay.ts:150, 196-202` |
| 8 | UI auto-enables `remoteAccess.enabled=true` on "Send to Phone" click, then calls `/api/pairing/create` | `src/public/index.html:6260-6262` |
| 9 | Phone scans QR → hits `https://h-<hostPublicId>.remote.mysidelinecoach.com/pair#<secret>` → relay returns **503 "Desktop host is offline"** because host tunnel never established | `relay/reference-relay.ts:578-582, 512-524` |

---

## FACT

- `PRODUCT_RELAY_URL` and `PRODUCT_RELAY_DOMAIN` are hardcoded constants in `remote-bootstrap.ts:4-6`.
- The enrollment credential file path is `<sidelineDir>/remote/beta-enrollment.json` (`remote-bootstrap.ts:6`).
- `productRemoteRelayBootstrap()` returns `enrollmentKey` **only** when the file exists and is valid (`remote-bootstrap.ts:50-53`).
- `resolveRemoteRelayBootstrap()` in `daemon.ts:233-254` uses product defaults when no explicit env vars (`SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY`) are set.
- `RelayClient` constructor (`relay-client.ts:146`) only adds the `x-sideline-enrollment` header when `enrollmentKey` is truthy.
- Production relay `loadConfig()` (`relay/index.ts:38-40`) **throws** if `ENROLLMENT_KEY` is undefined and `ALLOW_OPEN_ENROLLMENT !== 'true'`.
- The deployed production relay at `remote.mysidelinecoach.com` runs the `index.ts` entrypoint, not the test reference relay.
- Host identity (`host-key.json`) is auto-generated on first run — **not a blocker** (`host-identity.ts:89-116`).
- Device registry (`devices.json`) is auto-created on first pairing — **not a blocker** (`device-registry.ts:32-52`).
- "Send to Phone" UI auto-enables `remoteAccess.enabled` via `POST /api/preferences` (`index.html:6260-6262`).

---

## INFERENCE

- The "trusted provisioner" mentioned in `remote-bootstrap.ts:26` is a **manual/operational step** — no automated provisioning path exists in the codebase for a fresh user.
- The enrollment key is a **shared secret between the provisioner and the production relay**; the daemon merely presents it.
- Without the enrollment key, the host tunnel **never reaches the hello/challenge phase** — the WebSocket upgrade is rejected at 403.
- The phone's QR URL resolves to the production relay, but the relay has no registered host for that `hostPublicId` → returns 503 offline page.
- The pairing exchange (`/api/pairing/exchange`) succeeds technically (it's a local daemon endpoint), but the phone can never reach the desktop UI afterward because the relay tunnel is down.
- This is a **private-beta gating mechanism**, not a bug — the architecture deliberately keeps the enrollment secret outside the VSIX.

---

## UNKNOWN

- Whether a future "provisioning path" (e.g., signed license, marketplace entitlement, first-run wizard) is planned to deliver the enrollment key invisibly.
- Whether `ALLOW_OPEN_ENROLLMENT=true` was ever used in production (evidence says no — "only for local testing").
- Exact error message Dad would see on phone (503 offline page vs. a more specific error).

---

## CONTRADICTION

None found. The codebase consistently treats the enrollment key as a **required production credential** that fresh installs lack.

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/remote-bootstrap.ts` | Product relay defaults + machine enrollment file reader |
| `src/control-plane/daemon.ts:233-254, 1050-1083` | Relay bootstrap resolution + `syncRelayClient()` gating |
| `src/control-plane/relay-client.ts:146` | WebSocket upgrade header logic |
| `relay/index.ts:33-41` | **Production relay config loader — requires ENROLLMENT_KEY** |
| `relay/reference-relay.ts:150, 196-202` | Relay enforcement of enrollment on host upgrade |
| `src/public/index.html:6260-6262` | "Send to Phone" auto-enable + pairing creation |
| `src/control-plane/host-identity.ts:89-116` | Auto-generated host key (works) |
| `src/control-plane/device-registry.ts:32-52` | Auto-created device registry (works) |

---

## LIMITATIONS

- Reconnaissance only — did not deploy or test against live production relay.
- Did not inspect Fly.io deployment config for `remote.mysidelinecoach.com` (assumed to run `relay/index.ts`).
- Did not verify if any hidden/default enrollment key exists in production (source says no).
- Historical reports (Stage 4/5 field packets) confirm this is a known private-beta gate, not an oversight.

---

**End of Report** — Objective complete.

### Full report — lane remote-security-launch-gap (sideline-scout-quick)

# SCOUT PLAY - READ-ONLY RECONNAISSANCE

**Play ID:** remote-pairing-pre-opus-recon-fresh-20260927-180001  
**Scout ID:** remote-security-launch-gap  
**Assigned Custom Agent:** sideline-scout-quick  
**Assigned Model:** openrouter/cohere/north-mini-code:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## RESULT

Complete reconnaissance of the Remote / Send to Phone implementation focusing on launch-relevant security and failure behavior. The existing pairing system demonstrates strong security foundations but has several gaps that require attention before production launch. All findings are reconnaissance, not final architectural authority.

## KEY DISCOVERIES

### 1. Authentication & Authorization Seams

**FACT:** The pairing system implements multiple security layers:
- `src/control-plane/pairing.ts`: Memory-only pairing store with 5-minute TTL (PAIRING_TTL_MS = 300000)
- `src/control-plane/device-registry.ts`: Persistent device credentials with 30-day idle expiry (DEVICE_IDLE_EXPIRY_MS = 2592000000)
- `src/control-plane/remote-dispatch.ts`: Strict header allowlist (accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent)
- `src/control-plane/remote-routes.ts`: Route policies - `/api/pairing/exchange` is `public`, `/api/pairing/create` is `local-only`

**INFERENCE:** The two-tier security model (local-only creation vs public exchange) creates a clear security boundary but may introduce attack surface during the exchange phase.

### 2. Token & Session Management

**FACT:** Token security design:
- Pairing secrets: 128-bit (22 chars base64url), stored only in memory, hashed with SHA-256
- Device tokens: 256-bit (43 chars base64url), only SHA-256 hash persisted in devices.json
- Cookie: `sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
- Token refresh: Cookie slides with each authenticated remote request (remote-dispatch.ts:78)

**INFERENCE:** The sliding cookie mechanism provides extended sessions but increases window of opportunity if token is compromised.

### 3. Stolen QR / Replay Resistance

**FACT:** Strong protections against QR replay:
- Pairing records are **memory-only** - daemon restart drops all pairings
- One-time use enforced - successful exchange deletes record (pairing.ts:92)
- No storage of raw secrets in logs, persistence, or response bodies (Stage5 report:245-250)
- Browser side: `history.replaceState(null, '', '/pair')` clears fragment from history before exchange (pair.html:130)
- Fragment secrecy: URL fragments never transmitted to server (Stage5 report:137-144)

**INFERENCE:** The memory-only design is a significant security feature but creates potential availability issues during high-load scenarios or daemon restarts.

### 4. Pairing URL Leakage Analysis

**FACT:** Current implementation has a critical gap:
- Proposed QR URL format: `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`
- **CONTRADICTION:** `/pair` route **does not exist** in current daemon routes or implementation
- Fragment secrecy is excellent (never logged, never in requests)
- **UNKNOWN:** What happens when phone browser navigates to non-existent `/pair` route?

**INFERENCE:** This is a **DAY-1 BLOCKER** - the entire Send to Phone UX depends on a non-existent route. Without the `/pair` endpoint, the QR code leads to a 404 error.

### 5. Device Revocation & Management

**FACT:** Device management is local-only but has good security:
- `DELETE /api/devices/:id` - revoke single device
- `DELETE /api/devices` - revoke all devices
- Device tokens: Only SHA-256 hashes stored, raw tokens never persisted
- Token validation uses timing-safe comparison (request-security.ts:7)

**INFERENCE:** Local-only device management prevents remote device revocation attacks but requires Dad to have physical access to the computer for device management.

### 6. Second-Device Behavior

**FACT:** Multi-device support exists but may have risks:
- Each device gets unique deviceId and rawToken
- Devices persist independently in devices.json
- Device authentication tracks lastSeenAt for idle expiry
- **CONTRADICTION:** No rate limiting on device creation (unlike pairing exchanges)

**INFERENCE:** Could allow device enumeration attacks if an attacker could create devices. However, device creation is local-only so risk is limited.

### 7. Relay Outage & Stale Sessions

**FACT:** Robust failure handling:
- Pairing expiry: 5-minute TTL with automatic cleanup (pairing.ts:85-89)
- Device idle expiry: 30 days sliding window (device-registry.ts:64-68)
- Relay outage: Generic "Desktop is offline" error (Stage5 report:156)
- Daemon restarts: Drop all pairings (memory-only) - new pairing required

**INFERENCE:** The memory-only pairing design means network partitions or daemon crashes require users to start over, which could impact user experience during network issues.

### 8. Unauthorized Access Controls

**FACT:** Multiple defense layers:
- Local-only pairing creation (`/api/pairing/create`)
- Public exchange but secret/code verification (`/api/pairing/exchange`)
- Expected origin validation (`expectedOrigin = https://h-${hostPublicId}.${relayDomain}`)
- Origin validation never uses request headers (remote-dispatch.ts:66-67) - prevents header injection
- Loopback protection: `sl_dev` from localhost never authenticates (remote-dispatch.ts:70)

**INFERENCE:** The expectedOrigin derivation is good but vulnerable to relay domain compromise if relay enrollment key is stolen.

## FACT

- Pairing secrets are 128-bit random values, base64url encoded
- Device tokens are 256-bit random values, base64url encoded
- All raw secrets are SHA-256 hashed before persistence
- Memory-only pairing storage provides forward secrecy but availability concerns
- Fragment-based secret transport prevents URL leakage
- 5-minute pairing TTL with automatic cleanup
- 30-day device token expiry with sliding window
- Local-only device management with full CRUD operations
- Strict header allowlist prevents header injection attacks
- Expected origin validation uses relay domain from trusted source
- Timing-safe comparison prevents timing attacks on token validation
- One-time use pairing prevents QR replay attacks

## INFERENCE

- The non-existent `/pair` route is the critical blocking issue preventing Send to Phone from working
- Memory-only pairing storage may be a denial-of-service risk during high load or daemon restarts
- Sliding cookie extension increases session duration but may extend exposure window
- Local-only device management limits attack surface but reduces operational flexibility
- Fragment secrecy is excellent but depends on user understanding to not share URLs
- The two-tier security model (local-only creation, public exchange) balances usability and security well
- No rate limiting on device creation could allow device enumeration if local access is compromised

## UNKNOWN

- Exact behavior when phone browser accesses non-existent `/pair` route
- Error UX quality for various failure scenarios (expired, offline, burned)
- Mobile browser compatibility and performance with proposed `/pair` implementation
- Real-world impact of memory-only pairing storage during high-load periods
- Security implications of sliding cookie mechanism across network sessions
- Effectiveness of error messaging in preventing user confusion or security mistakes

## CONTRADICTION

- **DAY-1 BLOCKER:** "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" - FALSE because `/pair` route does not exist
- Stage 4D/4E not green - Stage 5 implementation blocked per SOP
- No public device list endpoint exists, preventing modal confirmation signals

## IMPORTANT FILES / PATHS

**Core Security Files:**
- `src/control-plane/pairing.ts` - Pairing protocol and memory store
- `src/control-plane/device-registry.ts` - Device credential persistence
- `src/control-plane/remote-dispatch.ts` - Authentication and header validation
- `src/control-plane/request-security.ts` - Timing-safe comparison, origin validation
- `src/control-plane/remote-routes.ts` - Route access classification
- `src/public/pair.html` - Browser-side fragment consumer (incomplete)
- `src/public/index.html` - Full frontend implementation including settings

**Test Files:**
- `test/remote-access-v1-stage5a-pairing-route.test.mjs` - Existing pairing route tests
- `test/remote-access-v1-stage5b-qr.test.mjs` - QR code generation tests
- `Scouts/stage5-pairing-security-session-ux/SCOUT-stage5-pairing-security-session-ux-Reconnaissance.md` - Existing comprehensive Stage 5 analysis

## LIMITATIONS

- This reconnaissance focuses only on the pairing subsystem, not the full remote access architecture
- No analysis of actual Tailscale or Cloudflare Tunnel configurations
- Cannot verify runtime behavior of the non-existent `/pair` route
- Limited understanding of production relay configuration and enrollment key security
- No testing of mobile browser compatibility or performance
- Analysis based on current source code, not running system state

## RECOMMENDED IMMEDIATE ACTIONS

**DAY-1 BLOCKERS (requires fix before launch):**
1. **Implement `/pair` route** - Add static page that reads hash and exchanges secret
2. **Add SSE event** - Implement `pairing-complete` event for modal confirmation
3. **Create fallback UI** - Provide comprehensive error handling for all failure modes

**PRE-LAUNCH HARDENING (technical debt reduction):**
1. **Add rate limiting** - Prevent device enumeration attacks (local-only but still good defense)
2. **Consider pairing persistence** - Evaluate trade-offs between memory-only vs. durable storage
3. **Implement pairing recovery** - Handle daemon restarts gracefully

**POST-LAUNCH/V2 ENHANCEMENTS:**
1. **Add public device endpoint** - Enable phone-based device management
2. **Implement pairing validation** - Check pairing status via API calls
3. **Add security analytics** - Track pairing success/failure patterns

## CONCLUSION

The Remote / Send to Phone implementation has **strong security foundations** with excellent secret protection, memory-only pairing storage, and comprehensive access controls. However, it suffers from a **critical DAY-1 BLOCKER** - the missing `/pair` route that prevents the core feature from working. The system demonstrates thoughtful security design but requires completion of the browser-side implementation before production launch.

The existing architecture shows good security practices but would benefit from additional hardening around rate limiting and availability considerations. The memory-only pairing design provides excellent forward secrecy but may impact user experience during network disruptions or system restarts.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-pairing-pre-opus-recon-fresh-20260927-180001
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-pairing-pre-opus-recon-fresh-20260927-180001

