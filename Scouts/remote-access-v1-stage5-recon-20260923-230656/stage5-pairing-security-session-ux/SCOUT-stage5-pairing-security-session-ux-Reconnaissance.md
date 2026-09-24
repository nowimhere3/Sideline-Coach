Now I have a comprehensive understanding of the current state. Let me compile the reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** remote-access-v1-stage5-recon-20260923-230656  
**Scout ID:** stage5-pairing-security-session-ux  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Status:** RECONNAISSANCE ONLY — NOT FINAL ARCHITECTURAL AUTHORITY  
**Date:** 2026-09-23

---

## RESULT

Stage 5 (Dad-facing "Send to Phone → QR → Scan → Paired" UX) is **designable today** over the existing Stage 2/3/4 pairing, device, and relay seams. No new protocol changes are required. The implementation surface is bounded to:
- Desktop UI: "Send to Phone" button, QR modal, pairing status
- Phone browser: fragment consumer at `/pair#<secret>` → POST `/api/pairing/exchange` → cookie → Sideline
- Zero infrastructure configuration exposed to Dad

Stage 4D/4E acceptance is still in progress (per Stage 4 Field Packet). Stage 5 implementation is **not authorized** until Stage 4 closes GREEN. This reconnaissance is preparatory only.

---

## KEY DISCOVERIES

### 1. Exact Current Pairing Implementation (FACT)

**File:** `src/control-plane/pairing.ts`

| Property | Value | Evidence |
|----------|-------|----------|
| TTL | 5 minutes (`PAIRING_TTL_MS = 5 * 60 * 1000`) | Line 4 |
| Max failed attempts | 5 (`PAIRING_MAX_FAILED_ATTEMPTS = 5`) | Line 5 |
| Secret | 128-bit, base64url (22 chars) | Line 63, test RA2D-1 |
| Fallback code | 8 chars from Crockford alphabet, formatted `XXXX-XXXX` | Lines 7, 37-47, 73 |
| Storage | Memory-only `Map<string, PairingRecord>` | Line 56 |
| Hashing | SHA-256 of secret and code only; raw never stored | Lines 31, 68-69, 95-98 |
| One-time use | `exchange()` deletes record on success | Line 92 |
| New pairing supersedes | `createPairing()` clears all records | Line 61 |
| Daemon restart | Drops all pairings (memory-only) | Line 51-52, test RA2D-2 |

**Endpoints (FACT):**
- `POST /api/pairing/create` — `local-only`, returns `{ pairingId, secret, code, expiresAt }` (daemon.ts:1276-1279)
- `POST /api/pairing/exchange` — `public`, accepts `{ secret }` or `{ code }`, optional `{ label }`, returns `{ success: true, deviceId }` + `Set-Cookie: sl_dev=<token>` (daemon.ts:1186-1197)

**PairingExchangeResult (FACT):**
```typescript
type PairingExchangeResult =
  | { ok: true; pairingId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'burned' };
```
Lines 19-21

### 2. Device Registry & sl_dev Cookie (FACT)

**File:** `src/control-plane/device-registry.ts`

| Property | Value | Evidence |
|----------|-------|----------|
| Token | 256-bit, base64url (43 chars) | Line 40, test RA2B-6 |
| Storage | `~/.sideline/remote/devices.json` (atomic write, 0o600) | Lines 35, 122-132 |
| Persisted | Only `tokenHash` (SHA-256), never raw token | Lines 27-28, 44, test RA2B-6 |
| Idle expiry | 30 days sliding (`DEVICE_IDLE_EXPIRY_MS`) | Line 6, 64-65 |
| Cookie | `sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` | remote-dispatch.ts:12-13, 78 |
| Cookie refresh | Slid on every authenticated remote request | remote-dispatch.ts:78, test RA2C-5 |
| Loopback protection | `sl_dev` from localhost never authenticates | remote-dispatch.ts:70, test RA2C-8 |

**Device management (local-only):**
- `GET /api/devices` — list (no hashes)
- `PATCH /api/devices/:id` — rename
- `DELETE /api/devices/:id` — revoke one
- `DELETE /api/devices` — revoke all

### 3. Expected Origin & Remote Principal (FACT)

**File:** `src/control-plane/remote-dispatch.ts`

- `expectedOrigin` = `https://h-${hostPublicId}.${relayDomain}` (Line 30, 85)
- Derived **only** by `RelayClient` at connect time from durable host identity + trusted config (relay-client.ts:85)
- **Never** from request `Host` or `Origin` headers (remote-dispatch.ts:66-67)
- `remote-device` principal minted **only** in `InProcessRemoteAdapter` (Lines 36, 66, 76)

**Route policy (FACT):** `remote-routes.ts:63` — `/api/pairing/exchange` is `public`; all device management is `local-only`.

### 4. Relay Architecture (FACT)

- Stage 4C production relay live at `wss://relay.remote.mysidelinecoach.com/tunnel/v1`
- Phone browser origin: `https://h-<hostPublicId>.remote.mysidelinecoach.com`
- Host connects outbound WSS to `relay.<RELAY_DOMAIN>` with `x-sideline-enrollment` header
- 7-header allowlist: `accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent`
- SSE streaming verified working through Fly edge with `Content-Encoding: none` (Stage 4C report)

---

## 3. QR URL Format Verification (FACT / INFERENCE)

**Proposed QR URL:** `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`

**Verification against current code:**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Host origin format | ✅ Matches | `expectedOrigin = https://h-${hostPublicId}.${relayDomain}` (relay-client.ts:85) |
| `/pair` path | ❌ **Does not exist** | No route for `/pair` in `DAEMON_ROUTE_POLICIES` or daemon.ts |
| Fragment `#<secret>` | ✅ Standard | Browser never sends fragment to server |
| Secret consumption | ✅ Works | `POST /api/pairing/exchange` accepts `{ secret }` (daemon.ts:1187-1188) |

**INFERENCE:** The `/pair` route **must be added** as a static page that reads `location.hash` and POSTs to `/api/pairing/exchange`. This is the missing browser-side code.

---

## 4. Missing Browser-Side Code (FACT)

**Current state:** No `/pair` route exists. No fragment consumer exists.

**Required minimal implementation:**
1. **Add route** `/pair` → serves static HTML (public access)
2. **Static page** at `/pair`:
   - Reads `location.hash` (e.g., `#<secret>`)
   - Strips `#`, POSTs `{ secret }` to `/api/pairing/exchange`
   - On success: navigates to `/` (Sideline loads with `sl_dev` cookie)
   - On failure: shows error UI (expired, used, invalid, burned, offline)

**Fragment secrecy (FACT):** Fragments are **never sent to server** (HTTP spec). They do not appear in:
- Relay logs (only pathname logged, Stage 4C report:464)
- HTTP request URLs
- Referrer headers (when navigating same-origin)
- Server access logs

---

## 5. Fragment Secrecy Verification (FACT)

| Vector | Leaks Secret? | Evidence |
|--------|---------------|----------|
| Relay logs | ❌ No | Only `path` (pathname) logged, query stripped (Stage 4C report:464, reference-relay.ts:555) |
| HTTP request URL | ❌ No | Fragment never transmitted |
| Referrer | ❌ No | Same-origin navigation from `/pair` to `/` keeps fragment off Referrer |
| Server access logs | ❌ No | Never reaches server |
| Browser history | ⚠️ Yes (local) | `location.hash` stays in history unless replaced |

**Mitigation:** On successful exchange, `history.replaceState(null, '', '/')` clears fragment from history.

---

## 6. Error States Dad May Encounter (FACT / INFERENCE)

| Error State | Trigger | HTTP Response | User-Facing Message |
|-------------|---------|---------------|---------------------|
| **Expired pairing** | `now() >= expiresAt` | 401 `{ success: false, message: 'Pairing could not be verified.' }` | "This QR code has expired. Tap 'Send to Phone' again." |
| **Used pairing** | Secret already exchanged | 401 (same body) | "This QR code was already used. Tap 'Send to Phone' again." |
| **Burned pairing** | 5 failed attempts | 401 (same body) | "Too many failed attempts. Tap 'Send to Phone' again." |
| **Relay offline** | No host connected | 503 `{ code: 'host_offline', message: 'Desktop host is offline' }` | "Desktop is offline. Make sure Sideline Coach is running on Dad's computer." |
| **Desktop offline** | Daemon not running | Connection refused / timeout | Same as relay offline |
| **Certificate/network failure** | TLS error, DNS fail | Browser error page | "Can't reach Sideline. Check internet connection." |
| **Invalid pairing** | Wrong secret/code format | 401 (same body) | "Invalid QR code. Please scan again." |
| **Device revoked** | After pairing, device revoked | 401 on subsequent requests | "This device was removed. Tap 'Send to Phone' to pair again." |
| **Already paired** | Phone already has valid `sl_dev` | N/A (cookie works) | Already in Sideline — no action needed |

**Critical invariant (FACT):** All failure responses return **identical generic body** — no oracle detail (test RA2D-2:569).

---

## 7. Retry/Recovery UX (INFERENCE)

| Scenario | Recovery Action |
|----------|-----------------|
| Expired/Used/Burned/Invalid | "Tap 'Send to Phone' again" → new pairing, new QR |
| Relay/Desktop offline | Auto-retry polling (e.g., every 5s) with "Retry" button; show desktop status |
| Network failure | "Check connection" toast; auto-retry when online event fires |
| Device revoked | Treat as expired → new pairing flow |
| Already paired | Detect `sl_dev` on load → skip QR, go straight to Sideline |

**Pairing modal behavior:** Should remain open with live countdown (5:00 → 0:00) and auto-refresh QR when expired. Close only on explicit "Cancel" or successful phone confirmation signal.

---

## 8. Ideal Click/Tap Count (INFERENCE)

| Step | Desktop (Dad) | Phone |
|------|---------------|-------|
| 1. Open Settings → Remote Access | 1 click | — |
| 2. Tap "Send to Phone" | 1 click | — |
| 3. QR modal opens (auto) | 0 | — |
| 4. Phone: Open camera / QR scanner | — | 1 tap |
| 5. Phone: Tap notification to open URL | — | 1 tap |
| 6. Phone: Pairing completes (auto) | — | 0 |
| 7. Phone: Sideline loads | — | 0 |
| **Total** | **2 clicks** | **2 taps** |

**Optimal:** Zero manual code entry. Fallback code `XXXX-XXXX` shown below QR for manual entry if camera fails.

---

## 9. Pairing Modal: Remain Open Until Phone Confirmation? (INFERENCE)

**Yes.** The modal should:
- Show live countdown (5 min)
- Poll `/api/pairing/exchange` status indirectly via SSE `execution` or dedicated status endpoint
- Show "Phone paired!" confirmation when device created
- Auto-close on success, or stay open with "Paired — opening Sideline..." message
- Provide "Cancel" to abort pairing (deletes pairing server-side)

**Signal for phone confirmation (INFERENCE):**
- SSE `/api/events` broadcasts `device-created` event (not yet implemented)
- OR: Modal polls `GET /api/devices` (local-only — needs new `public` read endpoint or SSE event)
- OR: Modal opens SSE connection and listens for `pairing-complete` frame

**Simplest:** New SSE event type `pairing-complete` with `{ deviceId, label }` broadcast from daemon after successful exchange.

---

## 10. Security Invariants Stage 5 UI MUST NOT Weaken (FACT)

| Invariant | Must Preserve |
|-----------|---------------|
| **Secret never logged/persisted** | QR secret only in memory, fragment, QR image; never in API URLs, logs, storage |
| **One-time use** | `exchange()` burns pairing; UI must not allow re-scan of same QR |
| **5-minute TTL** | UI must show countdown; auto-expire |
| **Max 5 failed attempts** | UI must not encourage brute force; show generic error |
| **Local-only pairing creation** | Only Dad (local-admin) can create pairing via UI |
| **Device token hash only** | UI must never display raw `sl_dev` token |
| **Expected origin enforcement** | Remote mutations require `Origin: https://h-<hostPublicId>.<RELAY_DOMAIN>` + `X-Sideline-Action: 1` |
| **No credential in QR URL query** | Fragment only (`#secret`), never `?secret=` |
| **Loopback protection** | `sl_dev` from localhost never works (test RA2C-8) |
| **Rate limiting** | Pairing exchange bucket (10/min/IP) enforced at relay (Stage 4A) |

---

## 11. Exact Implementation Files/Components (FACT)

| Layer | Files | Role |
|-------|-------|------|
| **Pairing protocol** | `src/control-plane/pairing.ts` | `PairingStore`, `createPairing()`, `exchange()` |
| **Device registry** | `src/control-plane/device-registry.ts` | `DeviceRegistry`, `createDevice()`, `authenticate()` |
| **Daemon endpoints** | `src/control-plane/daemon.ts:1186-1197, 1276-1279` | `POST /api/pairing/exchange`, `POST /api/pairing/create` |
| **Route policy** | `src/control-plane/remote-routes.ts:62-63` | Access classification |
| **Remote auth** | `src/control-plane/remote-dispatch.ts:64-79` | `sl_dev` verification, principal minting |
| **Relay client** | `src/control-plane/relay-client.ts:85` | `expectedOrigin` derivation |
| **Frontend (HTML)** | `src/public/index.html` | Settings UI, modal system, toast, API client |
| **Frontend (JS)** | `src/public/index.html:2038+` | `api()`, `showToast()`, `confirmAction()`, modal logic |
| **Tests** | `test/remote-access-v1-stage2.test.mjs` | Pairing/device contract verification |

---

## 12. Dependency on Unresolved Stage 4D/4E Findings (UNKNOWN / FACT)

| Dependency | Status | Impact on Stage 5 |
|------------|--------|-------------------|
| Real cellular SSE stability | 4D in progress | If SSE fails, pairing confirmation signal unreliable |
| Rate limiter tuning (coarse IP) | 4C finding #1 | Phone asset loads may hit 120/min limit; may need higher `RATE_HTTP_PER_MIN` |
| Enrollment key rotation | 4C finding #2 | New key needed for 4D; Stage 5 assumes stable relay |
| Fly log retention | 4C finding #5 | Debugging pairing issues may need live `fly logs --tail` |
| SSE drain on deploy | 4C finding #6 | 5s drain may interrupt pairing if deploy during flow |

**Stage 5 can proceed with design assuming Stage 4 green.** Implementation blocked until 4E signoff.

---

## 13. Acceptance Tests for Stage 5 (FACT / INFERENCE)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| **ST5-1** | QR correctness | QR encodes `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`; secret matches `POST /api/pairing/create` response |
| **ST5-2** | Fragment secrecy | Secret never appears in: relay logs, network tab URLs, Referrer, server access logs, `localStorage`/`sessionStorage` |
| **ST5-3** | Pairing expiry | After 5 min, QR scan → "expired" error; new "Send to Phone" works |
| **ST5-4** | One-time use | Scan same QR twice → 2nd scan fails with generic error; new QR works |
| **ST5-5** | Successful device creation | Scan → `sl_dev` cookie set → `/` loads Sideline → device listed in `GET /api/devices` |
| **ST5-6** | Sliding cookie | Authenticated request → `Set-Cookie` with `Max-Age=2592000`; `lastSeenAt` updated in registry |
| **ST5-7** | Revoked device | Revoke in Settings → phone gets 401 → "Device removed, pair again" |
| **ST5-8** | Offline host | Desktop stopped → QR scan → 503 `host_offline` → "Desktop offline" UI |
| **ST5-9** | Reconnect | Desktop restart → phone auto-reconnects (SSE) or manual refresh works |
| **ST5-10** | Two-device pairing | Pair phone A → pair phone B → both listed in devices, independent `sl_dev` |
| **ST5-11** | No credential leakage | Secret not in: QR image alt text, page source, console.log, network payloads (except exchange body), history after `replaceState` |

---

## 14. Recommended Bounded Implementation Slices (INFERENCE)

| Slice | Scope | Files Touched | Dependencies |
|-------|-------|---------------|--------------|
| **5A: Pairing Route & Fragment Consumer** | Add `GET /pair` static page; read `location.hash`; POST to `/api/pairing/exchange`; on success `replaceState('/')` | `daemon.ts` (new route), `index.html` (new `/pair` HTML + JS) | Stage 4E green |
| **5B: "Send to Phone" Desktop UI** | Settings card: "Remote Access" disclosure → "Send to Phone" button → QR modal with live countdown, fallback code, cancel | `index.html` (settings card + modal), JS (pairing creation, modal lifecycle) | 5A |
| **5C: Phone Pairing UX** | `/pair` page: loading spinner, success animation, error states (expired, used, offline, burned), "Open Sideline" button | `index.html` (`/pair` page JS) | 5A |
| **5D: Pairing Confirmation Signal** | SSE event `pairing-complete` broadcast from daemon after exchange; modal listens and shows "Phone paired!" | `daemon.ts` (broadcast), `remote-dispatch.ts`, `index.html` (SSE listener in modal) | 5B |
| **5E: Device Management UI** | Settings → "Paired Devices" list → rename/revoke/revoke-all; shows last seen | `index.html` (settings card), JS (device API calls) | 5B |
| **5F: Mobile Viewport Polish** | Ensure `/` and `/pair` work on phone: safe-area, touch targets, reader font sizes | `index.html` (CSS @media) | 5C |

**Total new code estimate:** ~400 lines (HTML/JS/CSS) + ~50 lines (daemon route + SSE event). Zero protocol changes.

---

## 15. Limitations & Gaps

| Gap | Type | Notes |
|-----|------|-------|
| No `/pair` route exists | FACT | Must be added in 5A |
| No SSE `pairing-complete` event | FACT | Must be added in 5D for modal confirmation |
| No `public` device list endpoint | FACT | Modal cannot poll devices; needs SSE or new route |
| QR code generation lib not in repo | UNKNOWN | Will need `qrcode` or similar (tiny, no deps preferred) |
| Stage 4D/4E not green | FACT | Implementation blocked per SOP |
| Rate limiter may affect phone asset loads | INFERENCE | 4C finding #1; may need `RATE_HTTP_PER_MIN=300` for beta |
| No automated QR visual test | UNKNOWN | Manual verification required |

---

## 16. Contradictions Found

| Claim | Reality | Source |
|-------|---------|--------|
| "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" | **False** — `/pair` route does not exist | `DAEMON_ROUTE_POLICIES`, `daemon.ts` |
| "Stage 4 complete" | **False** — 4D/4E in progress | Stage 4 Field Packet, 4C Report |

---

## IMPORTANT FILES / PATHS

```
src/control-plane/pairing.ts              # Pairing protocol (core)
src/control-plane/device-registry.ts      # Device credentials & persistence
src/control-plane/daemon.ts               # HTTP endpoints (pairing create/exchange)
src/control-plane/remote-dispatch.ts      # sl_dev auth, remote-device principal
src/control-plane/remote-routes.ts        # Route access classification
src/control-plane/relay-client.ts         # expectedOrigin derivation
src/public/index.html                     # All frontend (HTML + CSS + JS)
test/remote-access-v1-stage2.test.mjs     # Pairing/device contract tests
test/remote-access-v1-stage3.test.mjs     # Relay/adapter contract tests
test/remote-access-v1-stage4-hardening.test.mjs  # Production hardening tests
REPORTS/AntiGravity/Remote-Access-v1-Stage-4-Production-Field-Packet__20260923__AntiGravity.md
REPORTS/Claude/Remote-Access-v1-Stage-4C-Cloud-Deployment-Wildcard-TLS__20260923__Claude.md
```

---

## EPISTEMIC LABELS USED

- **FACT** — Directly observed in source code or test assertions
- **INFERENCE** — Reasoned from facts; not yet implemented
- **UNKNOWN** — Not observed; cannot confirm
- **CONTRADICTION** — Claim vs. reality mismatch identified
- **ARCHITECT DECISION REQUIRED** — None in this report (all bounded by existing seams)

---

**END OF RECONNAISSANCE**  
*This report is reconnaissance, not final architectural authority. The Stage 5 Architect owns design decisions.*
