# SCOTT RECONNAISSANCE REPORT
## SCOTT AGENT: sideline-scout-quick
## MODEL: openrouter/cohere/north-mini-code:free

## BOUNDED OBJECTIVE
REMOTE ACCESS V1 — REQUIRED FIX 1 RECON ONLY.

## GAME ROOT
C:\Users\dmcal\Documents\GitHub\SidelineCoach

## REPORT ID
remote-access-stage1-required-fixes-recon-20260923-150015

## KEY DISCOVERIES

### FACT 1: Current CSRF/Origin Protection is Incomplete
**Evidence:** In `src/control-plane/daemon.ts` lines 1151-1156:
```typescript
if (principal.authenticatedBy === 'cookie' && method !== 'GET' && method !== 'HEAD') {
  if (req.headers['x-sideline-action'] !== '1' || !requestOriginMatchesHost(req.headers.origin, req.headers.host)) {
    this.sendJson(res, 403, { success: false, message: 'Request origin could not be verified.' });
    return;
  }
}
```

**Analysis:** This check only protects cookie-authenticated principals (`authenticatedBy: 'cookie'`). Remote-device principals (`authenticatedBy: 'in-process'`) completely bypass this CSRF/Origin verification.

### FACT 2: Remote-Device Principals Cannot Be Resolved
**Evidence:** In `src/control-plane/daemon.ts` lines 3833-3847, the `resolvePrincipal` method:
```typescript
private resolvePrincipal(req: http.IncomingMessage): Principal | undefined {
  if (!this.authToken) return { kind: 'local-admin', authenticatedBy: 'bearer' };
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (timingSafeSecretEqual(bearer, this.authToken)) return { kind: 'local-admin', authenticatedBy: 'bearer' };
  const sessionToken = parseCookies(req.headers.cookie).get('sl_local');
  if (!sessionToken) return undefined;
  const key = this.hashSessionToken(sessionToken);
  const expiresAt = this.localSessions.get(key);
  if (!expiresAt || expiresAt <= Date.now()) {
    this.localSessions.delete(key);
    return undefined;
  }
  this.localSessions.set(key, Date.now() + 30 * 24 * 60 * 60 * 1000);
  return { kind: 'local-admin', authenticatedBy: 'cookie' };
}
```

**Analysis:** The `resolvePrincipal` method only creates `local-admin` principals. Remote-device principals must be injected in-process, which aligns with the Opus finding that "remote-device principals are injected in-process."

### FACT 3: CSRF/Origin Protection Seams
**Evidence:** In `src/control-plane/daemon.ts` line 1142:
```typescript
const principal = injectedPrincipal ?? this.resolvePrincipal(req);
```

**Analysis:** Principals come from either:
1. `injectedPrincipal` parameter (for remote-device principals from Stage 2)
2. `this.resolvePrincipal(req)` (for local-admin principals)

Only the cookie-authenticated path has CSRF protection.

### FACT 4: Remote-Device Principal Definition
**Evidence:** In `src/control-plane/request-security.ts` line 5:
```typescript
| { kind: 'remote-device'; deviceId: string; authenticatedBy: 'in-process' };
```

**Analysis:** Remote-device principals are defined with `authenticatedBy: 'in-process'`, confirming they must be injected and cannot be forged from HTTP headers.

## ARCHITECTURAL ANALYSIS

### Current Control Flow (lines 1140-1156 in daemon.ts):
1. `const principal = injectedPrincipal ?? this.resolvePrincipal(req);` (line 1142)
2. **Route classification** - `principalMayAccess(principal, access)` (line 1147)
3. **CSRF check** - only for `principal.authenticatedBy === 'cookie'` (lines 1151-1156)
4. Route handling (SSE, AI-health, file operations, etc.)

### Security Gap:
- **Lines 1151-1156**: CSRF/Origin protection only for cookie-authenticated principals
- **Missing**: No equivalent protection for remote-device principals (`authenticatedBy: 'in-process'`)

## SURGEON PATCH MAP FOR CODEX

### 1. Exact Functions/Branches/Line Neighborhoods Involved
**Primary location:** `src/control-plane/daemon.ts` lines 1151-1156
**Secondary location:** `src/control-plane/request-security.ts` - principal type definition
**Test verification:** `test/remote-access-v1-stage1.test.mjs` line 129-134 (existing cookie CSRF tests)

### 2. Current Control Flow Analysis
**FACT:** The flow from request → principal → CSRF check → route dispatch:
1. HTTP request arrives → `handleHttpRequest` (line 1057)
2. Principal resolution: `injectedPrincipal ?? this.resolvePrincipal(req)` (line 1142)
3. Route classification: `principalMayAccess(principal, access)` (line 1147)
4. **CONDITIONAL CSRF check**: Only for `principal.authenticatedBy === 'cookie'` (line 1151)
5. Route execution

### 3. Safest Minimal Condition for CSRF Protection to Remote-Device
**INFERENCE:** Based on the established pattern for cookie-authenticated principals, the condition should be:
```typescript
if (principal.kind === 'remote-device' && method !== 'GET' && method !== 'HEAD') {
  // Apply CSRF/Origin protection for remote-device principals
}
```

### 4. Expected Remote Public Origin Supply/Derivation
**FACT:** Remote-device principals are "accepted only as an in-process injected principal for the later relay stage; it cannot be forged from HTTP headers, cookies, or query parameters" (Codex report line 59).

**INFERENCE:** The expected remote origin must be:
1. **Trusted and non-forgeable** - established through in-process injection mechanisms
2. **Derivable without request headers** - cannot rely on forwarded Host for Origin comparison as noted in Opus finding
3. **Consistent with Stage 2 design** - must be provided by the in-process injection system that creates remote-device principals

**RECOMMENDATION:** The safest approach is to require the in-process injection system to provide the expected remote origin, and the CSRF check should use this trusted origin instead of request headers.

### 5. Stage 2 Dependencies That Do Not Need Implementation Yet
**FACT:** According to Codex report lines 147-150:
- "The Stage 2 remote frame transport does not exist yet, by design"
- "The in-process `remote-device` entry seam and route/redaction policy are implemented, but full relay/pairing end-to-end enforcement cannot be exercised until that transport is built"

**INFERENCE:** We don't need to:
- Implement remote relay/pairing transport
- Build the full end-to-end Stage 2 system
- Create actual remote-device injection logic
- Implement remote frame transport

**BUT WE DO NEED TO:** 
- Add CSRF protection for when remote-device principals are eventually injected
- Provide a mechanism for the in-process injection system to supply trusted remote origin

### 6. Exact Focused Tests to Add
**INFERENCE:** Based on existing test `test/remote-access-v1-stage1.test.mjs` lines 129-134:
- Existing tests verify cookie CSRF protection
- We need analogous tests for remote-device principal CSRF protection when they exist
- Tests should verify that remote-device principals require X-Sideline-Action and Origin verification

**RECOMMENDATION:** Add tests that would verify the fix once remote-device injection is implemented:
```javascript
// Pseudocode for test
test('RA1-9. remote-device principals enforce X-Sideline-Action and Origin when injected', () => {
  // When remote-device principals are injected via in-process mechanism
  const remotePrincipal = { kind: 'remote-device', deviceId: 'test-device', authenticatedBy: 'in-process' };
  // Verify that remote principal requires X-Sideline-Action: 1 and same-origin Origin header
});
```

### 7. Regressions/Hazards to Avoid
**INFERENCE:**
1. **Overly broad CSRF protection:** Don't apply CSRF protection to bearer-authenticated principals (they already have different trust model)
2. **Double protection:** Don't apply CSRF protection to local-admin cookie principals if they're already covered
3. **Wrong origin verification:** Don't use request headers for origin verification for remote-device principals (must use trusted in-process origin)
4. **Missing method coverage:** Ensure GET/HEAD requests are properly exempted

### 8. Incomplete or Subtle Issues in Opus's Proposed Fix
**CONTRADICTION:** The Opus finding states "remote-device principals are injected in-process, but the current CSRF/Origin guard in daemon.ts only runs for cookie-authenticated principals." This is **incomplete** because it doesn't address:

1. **Missing origin verification mechanism:** The finding doesn't specify HOW the remote origin should be established without trusting forgeable request headers
2. **Incomplete fix scope:** The finding focuses only on daemon.ts but doesn't mention the corresponding changes needed in request-security.ts or remote-routes.ts
3. **Trust boundary gaps:** The finding doesn't address the trust transition from in-process injection to runtime CSRF checks

**ARCHITECT DECISION REQUIRED:** 
1. **How to establish trusted remote origin:** Must be provided by the in-process injection system
2. **Where to store/validate remote origin:** Likely needs to be part of the Principal type or passed via injection mechanism
3. **Which methods need CSRF protection:** Should mirror cookie-authenticated principal protection

## SUMMARY

**FACT:** The security gap is confirmed - remote-device principals bypass CSRF/Origin protection that cookie-authenticated principals receive.

**INFERENCE:** This creates a security vulnerability where Stage 2 remote-device principals could bypass X-Sideline-Action and Origin protection during phone mutations.

**RECOMMENDATION:** Apply CSRF/Origin protection to remote-device principals using the same pattern as cookie-authenticated principals, but using a trusted remote origin provided by the in-process injection system rather than request headers.

The fix requires changes to `src/control-plane/daemon.ts` to add CSRF protection for remote-device principals, while maintaining compatibility with the existing in-process injection architecture that Stage 2 will implement.
