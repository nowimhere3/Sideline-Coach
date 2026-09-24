# SIDELINE COACH — REMOTE ACCESS V1 · STAGE 5 PRODUCT FIELD PACKET

**COMPLETED:** 2026-09-23 11:58 PM MDT  
**TIMEZONE:** America/Edmonton · Calgary, Alberta  
**AGENT:** Anti-Gravity  
**MODEL:** Gemini 3.8 Flash (High)  
**ROLE:** A-Team Product / Architecture Reconciler  
**MODE:** READ-ONLY DELTA (No source modifications, no deploy, no commit, no push)  
**REPO:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  

---

# SECTION A. PACKET VERDICT

```
READY FOR STAGE 5 IMPLEMENTATION
```

### Formal Stage 4E Status Verification & Closure
- Report read: `file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/Claude/Remote-Access-v1-Stage-4E-Final-Acceptance__20260923__Claude.md`
- Formal verdict in report: **`STAGE 4 GO`**
- Milestone closure: **`STAGE 4 ENDS HERE.`**
- **Stage 5 implementation is officially UNBLOCKED and no longer waiting on Stage 4 transport acceptance.**

### Final Stage 4E Truths Incorporated into Stage 5
1. **Daemon Liveness Lease:** `remoteAccess.enabled === true` acts as an authoritative daemon liveness lease (`remoteAccessHoldsDaemon()` in `src/control-plane/daemon.ts`). The idle countdown starts only when there is no active Stadium session AND Remote Access is OFF. When Remote Access is ON, the desktop daemon stays alive indefinitely for Dad's remote return without requiring keep-alive traffic.
2. **Idle Policy Preserved:** When Remote Access is disabled, the standard idle shutdown policy is fully preserved (daemon terminates after 30 minutes of local inactivity when unowned).
3. **Production Rollback / Roll-Forward Proven:** Fly Machine image rollback and roll-forward cycles (releases v5 through v8) proved zero downtime data loss, fast recovery (2–3 s), and graceful draining (5 s) under live SSE streaming.
4. **Local Sideline Survives Relay Failures:** 167/167 local `/api/status` samples succeeded with zero failures during relay deploy/rollback cycles. Local preferences, tokens, and host keys remained byte-identical.
5. **Credentials Survive Relay Interruption:** Paired-device credentials survived relay redeploy/rollback without re-pairing; the identical `sl_dev` cookie returned `200 OK` after tunnel recovery via fresh Ed25519 challenge/hello.
6. **Transport & Security Accepted:** Stage 5 treats production transport (wildcard DNS, Let's Encrypt TLS 1.3, outbound WSS, 15s heartbeats, cellular routing, Fly client-IP rate limiting, 7-header allowlist) as proven and accepted infrastructure.

### Productization Boundaries & Gaps Assigned to Slices
1. **Zero-Setup Provisioning Gap:** Relay URL, domain, and private-beta enrollment key must reach the daemon automatically without Dad configuring environment variables. Owned by new **Slice 5P**.
2. **Daemon Autostart Boundary:** The Stage 4E lease keeps a *running* daemon alive indefinitely. For V1, launching VS Code starts the extension, which launches the daemon and engages the lease. Operating system login/boot autostart (outside VS Code) is a bounded post-V1 breadcrumb.
3. **Native Android End-User Pairing:** Explicitly owned and verified in final **Slice 5F**.
4. **Shared Enrollment Secret:** Private-beta infrastructure only. Broad distribution per-installation enrollment is out of scope for V1.

---

# SECTION B. SCOUT RECONCILIATION

Scout Formation Evaluated: `remote-access-v1-stage5-recon-20260923-230656`  
Path: `C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\`

| Scout Claim / Subject | Scout Finding | AGY Adjudication | Authoritative Architecture Correction |
|---|---|---|---|
| **1. Protocol Changes** | "No new protocol changes are required." | **MODIFY** | Core relay wire framing and cryptographic handshake (Stage 3/4) need zero changes. However, daemon requires: (a) new public route `GET /pair`, (b) `POST /api/pairing/create` returning `url` and `qrSvg`, (c) SSE event `pairing-complete` on `/api/events`, and (d) friendly HTML 401 landing page on unauthenticated `GET /`. |
| **2. Proposed URL** | `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>` | **ACCEPT** | Validated. `/pair` does not exist today and will be created as a dedicated lightweight landing page. Fragment `#<secret>` preserves zero-log secrecy. |
| **3. Pairing Store Persistence** | Scout 3: "memory-only (survives daemon restart)" | **REJECT / CORRECT** | **False statement by Scout 3 corrected.** In `src/control-plane/pairing.ts`, `PairingStore` is strictly memory-only (`Map<string, PairingRecord>`). A daemon restart drops all active pairings. This is intentional and preserved. |
| **4. Pairing Success Signal** | Polling vs SSE | **MODIFY** | Primary signal is `pairing-complete` SSE event carrying `{ pairingId, deviceId, label }`. No continuous polling loop. Exact fallback: if desktop SSE disconnects/reconnects while modal is active, modal performs exactly ONE local-only check against baseline device IDs. |
| **5. Device Management Boundary** | Local-only | **ACCEPT** | Preserved 100%. Device management (`/api/devices`, `/api/devices/:id`) remains strictly `local-only`. Remote devices receive 403 Forbidden. Shared UI conditionally renders read-only state on remote devices. |
| **6. Remote Access Default** | Defaults to `false` | **ACCEPT** | `remoteAccess.enabled` remains `false` on fresh install. |
| **7. "Send to Phone" Trigger** | Auto-enables vs asks Dad | **ACCEPT** | Dad clicking "Send to Phone" is affirmative intent. It MUST automatically enable Remote Access (`remoteAccess.enabled = true`), initialize the relay connection, and open the QR modal. Zero configuration dialogs. |
| **8. Normal Workflow Toggle** | Should Dad see a toggle? | **REJECT** | Dad should NEVER need to manually find or flip a switch in daily workflow. "Send to Phone" handles activation. The toggle exists only in Settings as an administrative control room shutoff. |
| **9. QR Generation Mechanism** | Needs external lib / research | **ADJUDICATE** | **Locally bundled mature `qrcode` npm package**. Do not hand-roll Reed-Solomon math or QR matrices. Generates clean SVG directly in Node daemon via `QRCode.toString(targetUrl, { type: 'svg' })`. Zero external API calls, zero CDN, works 100% offline, packaging audit compliant. |
| **10. Fallback Pairing Code** | Include in UI? | **ACCEPT** | Display Crockford code (`XXXX-XXXX`) below QR. Provide fallback entry on `/pair` for phone camera failure. |
| **11. Modal Infrastructure** | Reuse `#confirmModal`? | **MODIFY** | Reuse existing modal CSS primitives (`.modal-backdrop`, `.modal`, `--radius`), but create a dedicated `#pairingModal` component to avoid polluting confirmation dialog logic. |
| **12. Serving Architecture for `/pair`** | Dedicated page vs `index.html` | **ADJUDICATE** | **Dedicated static HTML page `src/public/pair.html` served at `GET /pair`**. Avoids loading 482 KB `index.html` over high-latency cellular before authentication. Fast (<100ms), isolated, and clean. |
| **13. Browser History Scrub** | `history.replaceState` | **ACCEPT** | `/pair` extracts `window.location.hash`, then immediately calls `history.replaceState(null, '', '/pair')` before dispatching exchange request. |
| **14. Mobile Reconnect Behavior** | Transport recovers, browser stalls | **ADJUDICATE** | Add active browser reconnect manager in `src/public/index.html`: `online` / `visibilitychange` listeners, exponential backoff (1s–15s), heartbeat watchdog (45s), and auto-resync after `hello`. |
| **15. Remote Phone Settings** | Render local-only buttons? | **ADJUDICATE** | Remote phone Settings renders a read-only "Remote Session: Connected" card. Local admin controls (Pair New, Rename, Revoke, Revoke All) are hidden/suppressed on remote devices. |
| **16. Pairing vs Device Persistence** | Scout claimed redesign needed | **REJECT** | Conflation corrected: Ephemeral pairing records (in-memory, 5-min TTL, drops on restart) are distinct from durable Paired Device records (`~/.sideline/remote/devices.json`, 30-day sliding TTL, atomic file persistence). Device registry is already persistent and rock-solid. |
| **17. Send to Phone Visual Placement** | Scout inferred `.header-actions` | **REJECT** | Scout inference rejected as authority. Final visual placement is reserved for Design Council / Coach decision. Placement-neutral contract `SendToPhoneAction` created. |

### Reconciliation of Failed Scout Lane 4 (`stage5-mobile-responsive-experience`)
Scout Lane 4 failed due to provider rate limiting on `openrouter/meta/llama-3.1-405b` / `laguna-s-2.1`.  
**AGY Bounded Source Inspection:** AGY performed direct inspection of `src/public/index.html` (lines 1–760, 1400–1500, 2050–2130, 5830–5895).  
**Findings:**
1. Breakpoint architecture is already established: 620px (`min-width: 620px` / `max-width: 619px`) and 460px (`max-width: 460px`).
2. Main viewport `#gameScrollRegion` is responsive: `width: min(100%, 760px); margin: 0 auto; padding: calc(18px + env(safe-area-inset-top)) 14px calc(32px + env(safe-area-inset-bottom));`.
3. AI Usage Scoreboard and Live Player Terminal already have proven mobile viewport adaptations (`cqw` container queries, fixed 100dvh overlay mode on `< 619px`).
4. Touch targets globally enforce `min-height: 48px; touch-action: manipulation;`.
5. Missing mobile items are bounded strictly to: header wrap on `< 380px`, code block horizontal scroll, browser SSE reconnect on cellular wake, and dedicated `/pair` mobile layout.
6. **No missing Scout lane remains open.**

---

# SECTION C. VERIFIED CURRENT CONTRACT

1. **Host Identity & Public Origin:**
   - Identity stored in `~/.sideline/remote/host-key.json` (Ed25519 keypair).
   - `hostPublicId`: 20-character lowercase base32 derived from SHA-256 of host public key.
   - Public Origin: `https://h-<hostPublicId>.<relayDomain>`.
   - Trusted derivation: Origin is computed strictly by `RelayClient` at connect time; never taken from untrusted request headers (`remote-dispatch.ts:30-31`).

2. **Daemon Idle-Liveness Lease Contract (Stage 4E):**
   - Active lease condition: `preferences.remoteAccess?.enabled === true`.
   - While enabled, idle shutdown timer is cancelled and disabled. The desktop daemon stays alive indefinitely for remote phone access without requiring keep-alive traffic or Stadium connections.
   - When disabled, standard 30-minute idle countdown policy is re-engaged.

3. **Pairing Store Contract (`src/control-plane/pairing.ts`):**
   - TTL: 5 minutes (`PAIRING_TTL_MS = 300,000`).
   - Max failed attempts: 5 (`PAIRING_MAX_FAILED_ATTEMPTS = 5`).
   - Secret: 128-bit cryptographically secure base64url string (22 characters).
   - Fallback code: 8 characters Crockford subset (`23456789ABCDEFGHJKMNPQRSTVWXYZ`), formatted as `XXXX-XXXX`.
   - Storage: In-memory `Map<string, PairingRecord>`.
   - Hashing: Only SHA-256 hex hashes of secret and fallback code are stored. Raw secrets are never stored.
   - One-time use: `exchange()` deletes record on successful match.
   - Superseding: `createPairing()` clears all previous pairing records.

4. **Device Registry Contract (`src/control-plane/device-registry.ts`):**
   - Device token: 256-bit cryptographically secure base64url string (43 characters).
   - Storage: File persistence at `~/.sideline/remote/devices.json` via atomic temp-write and replace.
   - Hashing: Only SHA-256 hex hash (`tokenHash`) is stored. Raw tokens are never persisted.
   - Sliding TTL: 30 days (`DEVICE_IDLE_EXPIRY_MS = 2,592,000,000`). Slid on every authenticated remote request.
   - Cookie: `sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
   - Loopback protection: Localhost requests with `sl_dev` are explicitly refused from authenticating as remote devices (`remote-dispatch.ts:70`).

5. **Route Policies (`src/control-plane/remote-routes.ts`):**
   - Default-deny architecture with strict `Principal` enforcement (`local-admin` vs `remote-device`).
   - `POST /api/pairing/create`: `local-only` (Bearer/local token required).
   - `POST /api/pairing/exchange`: `public` (secret-gated bootstrap).
   - `GET /api/devices`, `PATCH /api/devices/:id`, `DELETE /api/devices/:id`, `DELETE /api/devices`: `local-only`.
   - Remote mutations require trusted `Origin: https://h-<hostPublicId>.<relayDomain>` + `X-Sideline-Action: 1`.

6. **Frontend Context vs Authorization:**
   - Hostname/context checking in `src/public/index.html` (`isRemoteDevice`) is **strictly for presentation layout** (suppressing administrative buttons that would return 403 Forbidden).
   - It is **NEVER** an authorization boundary.
   - The Control Plane `Principal` + route policy is authoritative. Even if frontend detection is bypassed or spoofed, all administrative endpoints enforce local-only access.

---

# SECTION D. FINAL STAGE 5 ARCHITECTURE

```
                                      STAGE 5 END-TO-END DAD FLOW
                                      
  +---------------------------------------------------------------------------------------------------------+
  | LOCAL DESKTOP (Dad's Mac/PC)                                                                            |
  |                                                                                                         |
  |  [ Send to Phone ] (Council placement)                                                                  |
  |          |                                                                                              |
  |          v                                                                                              |
  |  1. Ensure remoteAccess.enabled = true                                                                  |
  |  2. POST /api/pairing/create  ------------------------>  ControlPlaneDaemon                             |
  |                                                                |                                        |
  |                                                                v                                        |
  |                                                          PairingStore.createPairing()                   |
  |                                                          QRCode.toString(targetUrl, { type: 'svg' })    |
  |                                                                |                                        |
  |  3. Display #pairingModal <------------------------------------+                                        |
  |     - High-contrast QR SVG                                                                              |
  |     - 5:00 Live countdown                                                                               |
  |     - Fallback code: XXXX-XXXX                                                                          |
  |     - Captured baseline device IDs                                                                      |
  |     - Listening on SSE /api/events for 'pairing-complete'                                               |
  +---------------------------------------------------------------------------------------------------------+
                                         |
                                         | Camera Scan
                                         v
  +---------------------------------------------------------------------------------------------------------+
  | REMOTE ANDROID PHONE (Cellular / Chrome)                                                                 |
  |                                                                                                         |
  |  4. Browser navigates to: https://h-<id>.<domain>/pair#<secret>                                         |
  |     (Relay edge & logs receive only "GET /pair"; fragment #<secret> never crosses the wire)             |
  |          |                                                                                              |
  |          v                                                                                              |
  |  5. src/public/pair.html loads (< 100ms)                                                                |
  |     - history.replaceState(null, '', '/pair')   <-- Fragment scrubbed from URL & history immediately    |
  |     - POST /api/pairing/exchange { secret }     <-- Dispatched to Daemon via Relay Tunnel               |
  +---------------------------------------------------------------------------------------------------------+
                                         |
                                         | WSS Tunnel (RelayClient)
                                         v
  +---------------------------------------------------------------------------------------------------------+
  | CONTROL PLANE DAEMON                                                                                    |
  |                                                                                                         |
  |  6. PairingStore.exchange({ secret })                                                                   |
  |     - Verifies SHA-256 hash match                                                                       |
  |     - Burns pairing record (one-time use)                                                               |
  |  7. DeviceRegistry.createDevice('Phone')                                                                |
  |     - Generates 256-bit token; persists tokenHash to devices.json                                       |
  |  8. Broadcast SSE event 'pairing-complete' { pairingId, deviceId, label }                                |
  |  9. Returns 200 OK + Set-Cookie: sl_dev=<rawToken>; HttpOnly; Secure; SameSite=Lax                      |
  +---------------------------------------------------------------------------------------------------------+
         |                                                                    |
         | SSE 'pairing-complete'                                             | 200 OK + Set-Cookie
         v                                                                    v
  +---------------------------------------+               +-----------------------------------------+
  | DESKTOP MODAL                         |               | PHONE BROWSER                           |
  |                                       |               |                                         |
  |  10. Matches pairingId;               |               |  11. window.location.replace('/')       |
  |      Transitions to "Phone Connected!"|               |      Browser loads full Sideline Coach  |
  |      Green checkmark animation        |               |      with authenticated sl_dev cookie   |
  |      Auto-closes in 2.5s              |               |      BOOM. Sideline follows Dad.        |
  |      BOOM. Ready.                     |               |                                         |
  +---------------------------------------+               +-----------------------------------------+
```

---

# SECTION E. UI STATE MACHINE

### 1. Placement-Neutral Controller: `SendToPhoneAction`

```
                                  +-----------------------+
                                  |      UNAVAILABLE      | (Daemon stopped / local issue)
                                  +-----------------------+
                                              |
                                              v
                                  +-----------------------+
                +---------------->|       DISABLED        |<----------------+
                |                 +-----------------------+                 |
                |                             |                             |
                | User disables               | Dad clicks "Send to Phone"  |
                | in Settings                 | (Auto-enables)              |
                |                             v                             |
                |                 +-----------------------+                 |
                |                 |      GENERATING       |                 |
                |                 | (POST /api/pairing/   |                 |
                |                 |        create)        |                 |
                |                 +-----------------------+                 |
                |                             |                             |
                |                             v                             |
                |                 +-----------------------+                 |
                |  Cancel click   |     WAITING / READY   |                 |
                +-----------------|  (Modal open, QR SVG, |                 |
                |                 |   countdown 5:00,     |                 |
                |                 |   baseline captured)  |                 |
                |                 +-----------------------+                 |
                |                             |                             |
                |             +---------------+---------------+             |
                |             |                               |             |
                |             v (TTL expires)                 v (Exchange   |
                |  +--------------------+             +------------------+  |
                |  |      EXPIRED       |             |      PAIRED      |  |
                |  | ("Get New Code")   |             | (SSE received or |  |
                |  +--------------------+             |  recovery check, |  |
                |             |                       |  auto-close)     |  |
                |             | Click "Get New Code"  +------------------+  |
                |             v                               |             |
                +-------------+                               v             |
                                                      +------------------+  |
                                                      |   DEVICE ACTIVE  |--+
                                                      | (In paired list; |
                                                      |  remote access   |
                                                      |  listening)      |
                                                      +------------------+
```

### 2. Exact Pairing Success & Recovery Fallback Specification
- **Primary Signal:** Listen for SSE `pairing-complete` event.
  - Event payload: `{ pairingId: string, deviceId: string, label: string }`.
  - Verification: Modal confirms `event.pairingId === activePairing.pairingId`.
  - Immediate transition: Shows green checkmark "Phone Connected!" and auto-closes after 2.5s.
- **Exact Recovery Fallback (No Periodic Polling Loop):**
  1. When `#pairingModal` opens, it calls `GET /api/devices` once locally to record `baselineDeviceIds = new Set(devices.map(d => d.deviceId))`.
  2. If and **only if** the desktop's own SSE connection disconnects and reconnects while the modal is still open (e.g. `eventSource` receives `hello` after an error):
     - Modal executes **exactly ONE local reconciliation request** to `GET /api/devices`.
     - Compares current devices against `baselineDeviceIds`.
     - If a new device is present that was created after `pairingStartTime`, modal treats pairing as verified and transitions to `PAIRED`.
  3. Otherwise, modal continues waiting until countdown reaches `0:00`.
- **Invariants:**
  - ZERO periodic 3-second background polling.
  - ZERO public exposure of `/api/devices`.
  - ZERO auto-regeneration loops when expired. Dad explicitly clicks `Get New Code`.

---

# SECTION F. MOBILE MUST-HAVE / FUTURE POLISH

### STAGE 5 MUST-HAVE (Required for V1 Acceptance)

1. **Dedicated Pairing Page (`src/public/pair.html`):**
   - High-contrast, mobile-first, centered card layout.
   - Instant hash fragment capture + immediate `history.replaceState` history scrub.
   - Automatic background exchange with loading indicator ("Connecting to Dad's computer...").
   - Friendly error display for expired, used, burned, or offline pairings with a clear "Try Again" button.
   - Clean fallback code entry form when visited without a URL hash.
   - iOS/Android viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
   - Input font sizes `>= 16px` to prevent mobile OS auto-zoom on input focus.

2. **Mobile Layout Boundary Protections in `src/public/index.html`:**
   - Header wrap protection on narrow screens (< 380px): Brand title, connection badge, and Settings button must flex-wrap cleanly without clipping or horizontal overflow.
   - Reader pre/code overflow protection: Ensure reports with wide code blocks or terminal traces enforce `overflow-x: auto` so the page container never scrolls horizontally.
   - Safe-area inset enforcement on modal sheets and sticky bars (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).

3. **Active Browser Reconnect Manager:**
   - Handle mobile browser backgrounding and cellular sleep.
   - Auto-reconnect SSE stream on `online` and `visibilitychange` events.
   - Bounded exponential backoff: 1s, 2s, 4s, 8s, max 15s.
   - Auto-resync: Trigger `refresh()` on SSE `hello` frame to immediately catch up missed status/report events.

4. **Friendly Unauthenticated Landing:**
   - Unauthenticated browser visiting `GET /` receives a clean, friendly HTML card ("Device Not Paired — Scan the QR code on Dad's computer to connect") instead of raw JSON `{"success":false,"message":"Unauthorized"}`.

### FUTURE MOBILE POLISH (Deferred to V2 — Out of Scope for Stage 5)
- Native mobile bottom navigation bar (Tabs: Game / Reports / Players / Settings).
- Native swipe gestures between reports or terminal traces.
- Web Push / PWA background push notifications.
- Offline IndexedDB caching of past reports.
- Biometric device unlock (WebAuthn / FaceID).
- Custom audio recording or native voice visualizer waveforms.

---

# SECTION G. SETTINGS CONTRACT

The Sideline Coach frontend (`src/public/index.html`) is served to both the local desktop and the remote phone. Security boundaries are strictly maintained through context-aware UI rendering:

### Context Detection (Presentation Only)
```javascript
const isRemoteDevice = window.location.hostname !== 'localhost' 
                    && window.location.hostname !== '127.0.0.1' 
                    && window.location.hostname !== '[::1]';
```

### Local Desktop Control Room vs Remote Phone Presentation

| Settings Surface / Control | Local Desktop (`local-admin`) | Remote Phone (`remote-device`) | Security / Architecture Rationale |
|---|---|---|---|
| **Remote Access Master Switch** | **Visible & Toggleable** (Checkmark / Switch) | **Hidden** | Remote devices cannot mutate daemon preferences (`POST /api/preferences` is `local-only`). |
| **Connection Status Badge** | **Visible** ("Online & Listening") | **Visible** ("Connected via Relay") | Remote device needs reassurance that tunnel is healthy. |
| **"Send to Phone" / Pair Another** | **Visible** (Opens QR Modal) | **Hidden** | `POST /api/pairing/create` is `local-only`. Remote devices cannot mint new pairing credentials. |
| **Paired Devices List** | **Visible** (Full device summaries: labels, createdAt, lastSeenAt) | **Hidden** | `GET /api/devices` is `local-only`. Phone does not need to inspect other devices. |
| **Device Rename (Inline)** | **Visible** (`PATCH /api/devices/:id`) | **Hidden** | `PATCH /api/devices/:id` is `local-only`. |
| **Device Revoke (Single)** | **Visible** (`DELETE /api/devices/:id`) | **Hidden** | `DELETE /api/devices/:id` is `local-only`. |
| **Revoke All Devices** | **Visible** (`DELETE /api/devices`) | **Hidden** | `DELETE /api/devices` is `local-only`. |
| **Remote Session Info Card** | **Hidden** | **Visible** (Read-only: "Paired with Dad's Sideline Coach. Administrative device management is local-only.") | Explains state clearly without generating 403 errors. |
| **Disconnect This Phone** | **N/A** | **Visible** (Clears local cookie and reloads to unauthenticated landing) | Client-side self-session termination. Does not require server mutation authority. |

---

# SECTION H. SECURITY CONTRACT

Workers implementing Stage 5 MUST NOT weaken any of the following invariants:

1. **Local-Only Creation:** `POST /api/pairing/create` is strictly `local-only`. No remote request can ever create a pairing.
2. **High-Entropy Ephemeral Secrets:** Pairing secrets MUST be 128-bit cryptographically secure random base64url strings (`crypto.randomBytes(16)`).
3. **Strict 5-Minute TTL:** Pairing records expire in 300,000 ms. Expired records are deleted on read.
4. **5-Attempt Burn Policy:** Maximum 5 failed attempts per active pairing before record is permanently burned.
5. **No Secret Persistence:** Pairing secrets and fallback codes are NEVER written to disk, databases, or logs. Only SHA-256 hashes are held in memory. Daemon restart wipes all active pairings.
6. **Fragment-Only URLs:** The pairing secret MUST travel exclusively in the URL fragment (`#<secret>`). It MUST NEVER appear in query parameters (`?secret=`), request paths, or HTTP headers.
7. **Early History Scrubbing:** The client-side `/pair` landing page MUST execute `history.replaceState(null, '', '/pair')` immediately upon capturing the hash, before dispatching any network request.
8. **Durable Device Credentials:** Device tokens MUST be 256-bit base64url strings (`crypto.randomBytes(32)`). Only SHA-256 hashes (`tokenHash`) are persisted in `~/.sideline/remote/devices.json` (mode 0o600).
9. **HttpOnly Cookie Flagging:** The device credential MUST be delivered exclusively via `Set-Cookie: sl_dev=<rawToken>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. JavaScript must never access raw tokens.
10. **Loopback Immunity:** Localhost requests presenting `sl_dev` MUST NEVER authenticate as a `remote-device` (`remote-dispatch.ts:70`).
11. **Trusted Origin Verification:** Remote mutations require strict verification of `expectedOrigin` (`https://h-<hostPublicId>.<relayDomain>`) and `X-Sideline-Action: 1`. Origin is never inferred from untrusted request headers.
12. **Zero Oracle Disclosures:** All pairing exchange failures (invalid, expired, burned) MUST return identical generic 401 bodies: `{"success":false,"message":"Pairing could not be verified."}`.

---

# SECTION I. DESIGN COUNCIL DEPENDENCY

### Status
The visual host for the primary desktop `Send to Phone` action is under active review by the Design Council. Candidates include:
- Persistent Global AI / Status Bar (`#aiScoreboardContainer`)
- Visual Header Actions (`.header-actions`)
- Another global layout surface

### Architectural Seam & Handoff Contract
Implementation Workers MUST NOT hard-code `Send to Phone` into `.header-actions` or redesign the persistent AI Scoreboard.  
Workers must implement the placement-neutral controller:

```javascript
window.SendToPhoneController = {
  // Opens modal, ensures remoteAccess is enabled, triggers QR generation
  open: async () => { ... },
  
  // Returns current state for any rendering host
  getState: () => ({
    enabled: preferences.remoteAccess?.enabled ?? false,
    relayStatus: connectionState,
    pairedCount: pairedDevices.length
  }),

  // Standard markup generator for any visual host container
  renderButton: (targetElement, options = { compact: false }) => { ... }
};
```

**Implementation Seam:**
- Slices 5A, 5B, 5P, 5C, 5D, and 5E are **100% UNBLOCKED**.
- Slice 5C will mount `SendToPhoneController.renderButton()` into Settings and a temporary development container until the Design Council issues its final visual placement verdict.
- Once the Council decides, mounting the button into the chosen host is a 5-minute single-line change.

---

# SECTION J. FINAL SLICE PLAN

```
+----------------------------------------------------------------------------------------------------+
| STAGE 5 SLICE SEQUENCE                                                                             |
|                                                                                                    |
|  [5A: Pairing Route & Landing]                                                                     |
|        |                                                                                           |
|        v                                                                                           |
|  [5B: Mature QR Generator & Daemon Events]                                                         |
|        |                                                                                           |
|        v                                                                                           |
|  [5P: Desktop Product Bootstrap / Zero-Setup Provisioning]                                         |
|        |                                                                                           |
|        v                                                                                           |
|  [5C: Placement-Neutral SendToPhone & Pairing Modal]                                               |
|        |                                                                                           |
|        v                                                                                           |
|  [5D: Local Remote Access Settings Card & Remote Safe Guards]                                      |
|        |                                                                                           |
|        v                                                                                           |
|  [5E: Mobile Responsive Protections & Browser SSE Reconnect Watchdog]                              |
|        |                                                                                           |
|        v                                                                                           |
|  [5F: Real Android Public Cellular Acceptance]                                                     |
+----------------------------------------------------------------------------------------------------+
```

### Slice 5A: Pairing Route & Landing Page
- **Role:** Control Plane & Public Landing
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Medium
- **Exact Files Touched:**
  - `src/control-plane/remote-routes.ts` (register `GET /pair` and `GET /pair.html` as `public`)
  - `src/control-plane/remote-dispatch.ts` (allow unauthenticated `GET /pair`, return friendly 401 HTML for browser `GET /`)
  - `src/control-plane/daemon.ts` (serve `pair.html` on `GET /pair`)
  - `src/public/pair.html` (new standalone landing page: hash capture, history scrub, exchange POST, error cards, fallback code form)
  - `test/remote-access-v1-stage5a-pairing-route.test.mjs`
- **Decisions Implemented:** Standalone lightweight HTML page; early history replaceState; friendly HTML 401 on browser root.
- **Productization Boundary Handled:** Seamless, zero-jargon public landing; zero credential leaks.
- **Stop Line:** Unit tests pass; `GET /pair` serves static landing; unauthenticated `GET /` returns friendly HTML.

### Slice 5B: Mature Local QR Generator & Daemon Events
- **Role:** QR Integration & Control Plane Seams
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Low-Medium
- **Exact Files Touched:**
  - `package.json` (add `qrcode` to `dependencies`, `@types/qrcode` to `devDependencies`, `"node_modules/qrcode/**"` to `files`)
  - `tools/dev/audit-vsix.mjs` (permit `extension/node_modules/qrcode/**` in packaging audit)
  - `src/control-plane/daemon.ts` (generate QR SVG via `QRCode.toString(targetUrl, { type: 'svg' })`; return `url` and `qrSvg` in `POST /api/pairing/create`; emit `pairing-complete` on SSE after exchange)
  - `test/remote-access-v1-stage5b-qr.test.mjs`
- **Decisions Implemented:** Use mature `qrcode` npm package (no hand-rolled QR math); daemon returns SVG string; emits `pairing-complete` SSE event with `{ pairingId, deviceId, label }`.
- **Stop Line:** `npm run compile` clean; `audit-vsix.mjs` passes; unit tests verify parseable SVG output and SSE event broadcast.

### Slice 5P: Desktop Product Bootstrap / Zero-Setup Provisioning
- **Role:** Product Packaging & Runtime Configuration
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Medium
- **Exact Files Touched:**
  - `src/control-plane/daemon.ts` (define default production relay config: `wss://relay.remote.mysidelinecoach.com/tunnel/v1` and `remote.mysidelinecoach.com`; support internal beta enrollment key store)
  - `src/extension.ts` (or daemon launch seam: supply runtime Remote Access configuration to daemon process without manual environment variables)
  - `test/remote-access-v1-stage5p-bootstrap.test.mjs`
- **Decisions Implemented:**
  - Default production relay URL and domain embedded in daemon runtime configuration (process.env retained only as developer override).
  - Private-beta enrollment secret provisioned via secured internal config (`~/.sideline/remote/beta-enrollment.json` 0o600 or packaged extension asset), never exposed to Dad, never in preferences, never in logs.
  - Windows autostart boundary: Extension-open launch is authoritative for V1; OS login autostart is marked as a post-V1 breadcrumb.
- **Stop Line:** Daemon initializes and connects to production relay with zero operator environment variables set; regression tests pass.

### Slice 5C: Placement-Neutral SendToPhone & Pairing Modal
- **Role:** Desktop Product UX
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Medium
- **Exact Files Touched:**
  - `src/public/index.html` (add `#pairingModal` component, 5:00 countdown timer, copy-code button, `SendToPhoneController` logic, auto-enable `remoteAccess.enabled`, SSE `pairing-complete` listener, baseline device capture and single recovery fallback)
  - `test/remote-access-v1-stage5c-pairing-modal.test.mjs`
- **Decisions Implemented:** Placement-neutral controller; dedicated modal markup using existing CSS; 2.5s auto-close on success; exact SSE recovery fallback (no periodic polling loop).
- **Stop Line:** Clicking `Send to Phone` opens modal with live QR SVG, countdown ticks down, simulated SSE event transitions modal to paired state and closes.

### Slice 5D: Local Remote Access Settings Card & Remote Safe Guards
- **Role:** Settings Control Room
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Medium
- **Exact Files Touched:**
  - `src/public/index.html` (add Remote Access settings disclosure card: On/Off switch, connection badge, paired devices list, inline rename, revoke single, revoke all; context check to suppress local-admin controls on remote phone)
  - `test/remote-access-v1-stage5d-settings.test.mjs`
- **Decisions Implemented:** Settings is the administrative control room; local-admin vs remote-device UI branching.
- **Stop Line:** Device list refreshes; rename and revoke succeed locally; remote device view shows read-only session card.

### Slice 5E: Mobile Responsive Protections & Browser SSE Reconnect Watchdog
- **Role:** Mobile Resilience & Styling
- **Recommended Model:** Claude Sonnet 5
- **Reasoning Effort:** Medium
- **Exact Files Touched:**
  - `src/public/index.html` (reconnect watchdog: `online` and `visibilitychange` listeners, exponential backoff, header badge states, narrow viewport header wrap fixes, code block scroll fixes)
  - `test/remote-access-v1-stage5e-mobile-reconnect.test.mjs`
- **Decisions Implemented:** Browser reconnection watchdog; 16px input font scaling; narrow viewport overflow protection.
- **Stop Line:** Disconnecting network triggers "Reconnecting..."; reconnecting network restores SSE and re-syncs state immediately.

### Slice 5F: Real Android Public Cellular Acceptance
- **Role:** Field Verification & Dad Acceptance
- **Recommended Model:** Operator / Dad Field Test with Claude Sonnet 5
- **Reasoning Effort:** High (End-to-end physical verification)
- **Exact Files Touched:**
  - `REPORTS/Claude/Remote-Access-v1-Stage-5-Field-Acceptance__20260923__Claude.md` (new final report)
- **Decisions Implemented:** Real Android phone over public LTE/5G; end-to-end QR scan and Play execution without manual setup.
- **Stop Line:** Complete Dad Zero-Setup checklist PASS. Stage 5 formally marked GREEN.

---

# SECTION K. TEST MATRIX

| Test Suite / ID | Layer | Scope / Assertion | Target File |
|---|---|---|---|
| **RA5A-1** | Route Policy | `GET /pair` and `GET /pair.html` classified as `public` | `test/remote-access-v1-stage5a-pairing-route.test.mjs` |
| **RA5A-2** | Remote Dispatch | Unauthenticated `GET /pair` allowed through adapter with `unpaired` principal | `test/remote-access-v1-stage5a-pairing-route.test.mjs` |
| **RA5A-3** | Browser Root 401 | Unauthenticated browser `GET /` (Accept: text/html) returns 401 with friendly HTML, not JSON | `test/remote-access-v1-stage5a-pairing-route.test.mjs` |
| **RA5A-4** | API Root 401 | Unauthenticated API `GET /api/status` returns 401 JSON `{"success":false,"message":"Unauthorized"}` | `test/remote-access-v1-stage5a-pairing-route.test.mjs` |
| **RA5B-1** | QR Generation | `qrcode` produces valid, parseable SVG containing expected pairing URL | `test/remote-access-v1-stage5b-qr.test.mjs` |
| **RA5B-2** | Pairing Create Seam | `POST /api/pairing/create` returns `url`, `qrSvg`, `code`, `expiresAt` | `test/remote-access-v1-stage5b-qr.test.mjs` |
| **RA5B-3** | SSE Broadcast | Successful exchange triggers `pairing-complete` event with `{ pairingId, deviceId, label }` | `test/remote-access-v1-stage5b-qr.test.mjs` |
| **RA5P-1** | Zero-Setup Defaults | Daemon starts and resolves default production relay URL/domain without env vars | `test/remote-access-v1-stage5p-bootstrap.test.mjs` |
| **RA5P-2** | Beta Enrollment | Internal credential store provisions key to RelayClient without leaking to preferences or logs | `test/remote-access-v1-stage5p-bootstrap.test.mjs` |
| **RA5C-1** | Auto-Enable | Triggering `SendToPhoneAction` automatically enables `remoteAccess.enabled` | `test/remote-access-v1-stage5c-pairing-modal.test.mjs` |
| **RA5C-2** | Modal Lifecycle | Modal opens, renders QR, ticks countdown, handles cancel, and handles expiration | `test/remote-access-v1-stage5c-pairing-modal.test.mjs` |
| **RA5C-3** | Exact Fallback | SSE reconnect triggers exactly ONE device reconciliation; no continuous polling | `test/remote-access-v1-stage5c-pairing-modal.test.mjs` |
| **RA5D-1** | Device List API | Local desktop can list devices, rename label, revoke single, and revoke all | `test/remote-access-v1-stage5d-settings.test.mjs` |
| **RA5D-2** | Remote 403 Safety | Remote device attempts to call `/api/devices` return 403 Forbidden | `test/remote-access-v1-stage5d-settings.test.mjs` |
| **RA5E-1** | SSE Reconnect | EventSource onerror triggers backoff; `online` event immediately forces reconnect | `test/remote-access-v1-stage5e-mobile-reconnect.test.mjs` |
| **RA5F-FIELD** | Physical Android | Real Android phone scans QR, pairs over LTE, receives live execution, survives network drop | Physical Device Acceptance |

### QA Clarification on Fragment Testing
- **Server-Side Tests:** Assert that `GET /pair` returns `200 OK` and static HTML. The HTTP request path MUST NOT include `#<secret>` (fragments are client-side only and never cross the wire).
- **Browser/E2E Tests:** Execute in browser environment (e.g. Playwright): navigate to `https://<origin>/pair#<secret>`, assert JavaScript captures fragment, executes `history.replaceState(null, '', '/pair')`, issues `POST /api/pairing/exchange`, and transitions to `/`.

---

# SECTION L. DAD ZERO-SETUP CHECKLIST

The Stage 5 implementation MUST pass this checklist with 100% compliance:

- [ ] **1. Zero Infrastructure Jargon:** Dad never sees words like Fly.io, DNS, TLS, WSS, certificates, relay domain, enrollment key, port, Docker, or environment variables.
- [ ] **2. Single Affirmative Click:** Dad clicks `Send to Phone`. Sideline Coach handles enabling Remote Access and launching the relay connection automatically.
- [ ] **3. Instant Scannable QR:** High-contrast QR code appears immediately on desktop with a clear 5-minute countdown.
- [ ] **4. Zero DevTools / Zero JavaScript Injection:** No DevTools console, no `javascript:` bookmarks, no curl commands, and no manual token copying.
- [ ] **5. Native Camera Scan:** Dad points phone camera at desktop screen and taps the browser notification.
- [ ] **6. Automatic Authentication:** Phone browser lands on `/pair#<secret>`, scrubs the secret from address history, completes exchange, and transitions into Sideline Coach automatically.
- [ ] **7. Coordinated Feedback:** Desktop modal automatically acknowledges the pairing with "Phone Connected!" and closes.
- [ ] **8. Mobile-Ready Sideline:** Game status, latest report, and play dispatcher render clearly on the phone viewport with thumb-friendly controls.
- [ ] **9. Resilient Cellular Connection:** Dad can walk away from Wi-Fi. The phone seamlessly switches to cellular LTE/5G and maintains live updates.
- [ ] **10. Seamless Return:** Dad can close phone browser, return hours later, and immediately resume without re-pairing or touching the desktop.

---

# SECTION M. STAGE 5 GO / NO-GO CHECKLIST

Remote Access v1 is **PRODUCT-COMPLETE** when and only when:

| # | Acceptance Requirement | Required State | Verification Evidence |
|---|---|---|---|
| 1 | Stage 4E Closed | **GREEN** | Confirmed: `STAGE 4 GO` recorded in 4E report. |
| 2 | Slices 5A–5P–5E Implemented | **GREEN** | All unit/integration tests pass (`npm test`). |
| 3 | TypeScript Build | **CLEAN** | `npm run compile` completes with 0 errors across `./` and `relay`. |
| 4 | Packaging Audit | **CLEAN** | `npm run package` succeeds; `tools/dev/audit-vsix.mjs` passes with `qrcode`. |
| 5 | Fragment Secrecy | **PROVEN** | Relay and server access logs show 0 occurrences of the pairing secret. |
| 6 | Browser History Scrub | **PROVEN** | Inspecting phone browser history shows `/pair`, never `#<secret>`. |
| 7 | Fallback Code Flow | **PROVEN** | Manual entry of `XXXX-XXXX` on `/pair` pairs device without camera scan. |
| 8 | Device Management | **PROVEN** | Desktop can rename and revoke paired phones. Revoked phone receives 401. |
| 9 | Reconnection Watchdog | **PROVEN** | Toggling phone airplane mode for 30s recovers live SSE stream automatically. |
| 10| Real Android Acceptance | **PROVEN** | Field acceptance on real Android device passing all Dad Zero-Setup criteria. |

---

# SECTION N. CORRECTION DELTA APPLIED

1. **Product Bootstrap Slice (5P) Added:** Created `Slice 5P — Desktop Product Bootstrap / Zero-Setup Provisioning` positioned between 5B and 5C. Owns invisible relay defaults and internal private-beta enrollment provisioning so Dad never touches environment variables. Defined V1 Windows startup boundary (extension-open engages daemon lease; OS login autostart deferred as post-V1 breadcrumb).
2. **Mature Local QR Implementation Adopted:** Rejected hand-rolling Reed-Solomon math. Selected standard, battle-tested `qrcode` npm package generating SVG in Node daemon. Updated `package.json` files list and `tools/dev/audit-vsix.mjs` packaging assertions.
3. **Exact Pairing-Success Fallback Specified:** Replaced vague 3-second polling with exact deterministic policy: baseline device capture on modal open, primary SSE `pairing-complete` event with correlation `{ pairingId, deviceId, label }`, and exactly ONE local reconciliation call only if desktop SSE drops and reconnects while modal is active.
4. **Fragment Testing Clarification:** Formally separated server HTTP assertions (`GET /pair` serves static landing) from browser E2E assertions (`/pair#secret` executes client-side hash capture, history scrubbing, and exchange).
5. **Frontend Context Is Presentation, Not Authorization:** Explicitly clarified that `isRemoteDevice` in `index.html` is presentation-only logic. Backend `Principal` and `DAEMON_ROUTE_POLICIES` remain the sole authoritative security boundary.
6. **Updated Slice Sequence:** Authoritative sequence is now: `5A` → `5B` → `5P` → `5C` → `5D` → `5E` → `5F`.
7. **Verdict Maintained:** None of the corrections revealed blockers. Verdict remains:  
   **`READY FOR STAGE 5 IMPLEMENTATION`**.

---

# RESOURCE DIRECTIVE FOR IMPLEMENTATION PLAYERS

**KNOWN CONTEXT MUST NOT BE REPURCHASED AT PREMIUM COST.**

Workers receiving Stage 5 implementation tasks MUST NOT:
- Re-read Scout history or debate discarded Scout proposals.
- Debate QR libraries (`qrcode` npm package generating SVG in Node is final).
- Invent hand-rolled QR encoding math.
- Change the pairing route format (`/pair#<secret>` decision is final).
- Alter device registry persistence or security invariants.
- Add continuous polling loops to the pairing modal.
- Invent bottom navigation tabs or native Android apps.
- Implement voice subsystems.
- Hard-code `Send to Phone` visual placement until the Design Council issues its final surface verdict.

Workers receive:
**FILES + DECISIONS + INVARIANTS + ACCEPTANCE**

---

**COMPLETED:** 2026-09-23 11:58 PM MDT  
**TIMEZONE:** America/Edmonton  

file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/AntiGravity/Remote-Access-v1-Stage-5-Product-Field-Packet__20260923__AntiGravity.md
