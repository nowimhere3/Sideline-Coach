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
