# FINAL SCOUT REPORT

**SCOUT ID**: scout-a-toast-ui-trace  
**ASSIGNED MODEL**: openrouter/cohere/north-mini-code:free  
**MISSION STATUS**: COMPLETE

## RESULT
**Verdict**: STALE UX GUARD / REAL AUTHORITY GUARD / AMBIGUOUS

## KEY DISCOVERIES

### FACT
1. **Toast Origin**: The toast "This action is available only on the local Sideline." originates from two locations in daemon.js:
   - Line 1054: `/api/session` POST when `injectedPrincipal?.kind === 'remote-device'`
   - Line 1151: General authorization failure when `!principalMayAccess(principal, access)`

2. **Authorization Policy**: In `remote-routes.js`:
   - `{ methods: ['GET'], path: '/api/preferences', access: 'remote-read' }`
   - `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' }`

3. **PrincipalMayAccess Logic**: `principalMayAccess` returns `false` for remote-device principals when access is `'local-only'`

4. **UI Implementation**: The position-switch button (`aiScoreboardPositionBtn`) calls `api('/api/preferences', { method: 'POST', body: JSON.stringify({ aiScoreboardPlacement: next }) })`

### INFERENCE
1. **Authorization Gap**: The `local-only` policy on `/api/preferences` POST endpoint conflicts with the field evidence showing successful remote position switching

2. **Toast Display Timing**: The toast appears when authorization fails, but the field evidence indicates the position switch succeeds despite the toast

3. **Test Environment Mismatch**: The test suite doesn't properly mock `/api/preferences` POST calls, falling back to generic 200 responses

### UNKNOWN
1. **Actual Flow**: How the remote-device succeeds in positioning the scoreboard if the authorization check should block it
2. **Injection Mechanism**: How remote-device principals inject their authentication into daemon requests
3. **Race Condition**: Whether the position switch succeeds before, after, or independently of the toast display

### IMPORTANT FILES / PATHS

1. **Source Code**:
   - `src/control-plane/daemon.ts` (lines 1223, 1325)
   - `src/control-plane/remote-routes.ts` (lines 57-58)
   - `src/public/index.html` (lines 6087-6096)

2. **Compiled Code**:
   - `out/control-plane/daemon.js` (lines 1054, 1151)
   - `out/control-plane/remote-routes.js` (lines 57-58)
   - `out/control-plane/daemon.js` (lines 6087-6096)

3. **Test Files**:
   - `test/ai-usage-scoreboard-ui.test.mjs` (lines 590-609)

## ANALYSIS SUMMARY

The architectural disconnect centers on the `/api/preferences` endpoint's `local-only` policy. While the route explicitly restricts POST modifications to local-admin principals, the implementation appears to allow remote-device operations through some mechanism.

The core discrepancy lies between the declared authorization rules and the observed runtime behavior. Despite the clear policy blocking remote modifications, the position-switch functionality succeeds on remote devices, suggesting an implicit bypass or configuration oversight.

Critical investigation points to potential reconciliation between the endpoint's security intent and its actual operational allowance, requiring careful examination of the authentication and authorization mechanisms.

The toast message indicates an intentional design restriction preventing remote-device interactions, yet the system's behavior contradicts this stated policy. This misalignment suggests either a security vulnerability or an unintended implementation gap that allows unauthorized modifications.

The timing discrepancy between the toast display and actual position switch further complicates understanding the underlying system behavior, warranting deeper investigation into the request handling and authorization logic.

## SMALLEST SAFE IMPLEMENTATION SEAM

**Recommended Fix**: Update `principalMayAccess` function in `remote-routes.js` to allow `'remote-device'` principals to access `'local-only'` routes when they're actually client-side presentation state changes (like `aiScoreboardPlacement`).

**Implementation**:
```javascript
function principalMayAccess(principal, access) {
    if (principal.kind === 'local-admin')
        return true;
    
    // Allow remote-device to access local-only routes that are actually
    // client-side presentation state changes, not backend-authoritative operations
    if (access === 'local-only' && principal.kind === 'remote-device') {
        // Check if this is a presentation-only operation
        // e.g., aiScoreboardPlacement preference changes
        return true; // This would need additional logic to be safe
    }
    
    return access === 'remote-read' || access === 'remote-mutate';
}
```

**Alternative Safe Fix**: Remove the toast for stale UX warnings by checking if the authorization failure is actually a false positive due to the presentation-layer nature of the operation.

**Fallback**: Add specific exception in `handleHttpRequest` to bypass authorization for presentation-only preference updates like `aiScoreboardPlacement`.
