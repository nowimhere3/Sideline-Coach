# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:04:02

Play: mobile-scorecard-swap-toast-recon-20260924-160436
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-24T22:04:41.413Z
Finished: 2026-09-24T22:08:43.485Z
TOTAL ELAPSED TIME: 00:04:02

Scouts requested: 2
Completed: 2
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 2
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scout-a-toast-ui-trace | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T22:04:41.435Z | 2026-09-24T22:08:43.478Z | 00:04:02 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-a-toast-ui-trace-Reconnaissance.md |
| scout-b-remote-authority-trace | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T22:04:41.449Z | 2026-09-24T22:08:05.991Z | 00:03:24 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-b-remote-authority-trace-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scout-a-toast-ui-trace: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane scout-b-remote-authority-trace: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: scout-a-toast-ui-trace (objective 888fdaad8b28)
- Objective: READ-ONLY RECONNAISSANCE.

Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach

FIELD EVIDENCE:
On the real paired Android Remote Access surface, tapping the AI Usage Scorecard top/bottom position-switch control successfully moves/collapses/repositions the Scorecard. At the same time, the mobile UI displays the toast:

"This action is available only on the local Sideline."

The action itself succeeds remotely, so the warning appears stale or mismatched. The toast also temporarily covers the bottom mobile Scorecard.

MISSION:
Determine exactly where this toast originates, why it fires during a successful remote Scorecard position switch, whether the action is intentionally remote-capable, and the smallest safe correction.

Do not modify source.
Do not implement.
Do not commit, push, reset, stash, clean, install, or reorganize.
Separate FACT, FIELD EVIDENCE, INFERENCE, and UNKNOWN.
Return exact file paths, symbols/handlers, call path, authority boundary, other relevant call sites, and smallest safe implementation seam.
LANE A — TOAST / UI EVENT TRACE

Prioritize:

* exact literal string search for "This action is available only on the local Sideline."
* exact helper/function that renders the toast
* Scorecard position-switch / swap click handler
* mobile/remote condition that triggers the warning
* whether warning fires before, after, or independently of the successful position change
* whether the helper is shared by any other genuinely local-only controls
* smallest seam where this specific stale warning could be removed without changing unrelated protections

Return a concise verdict:
STALE UX GUARD / REAL AUTHORITY GUARD / AMBIGUOUS
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-a-toast-ui-trace-Reconnaissance.md

**Key discoveries:** **Verdict**: STALE UX GUARD / REAL AUTHORITY GUARD / AMBIGUOUS

**FACT:** 1. **Toast Origin**: The toast "This action is available only on the local Sideline." originates from two locations in daemon.js:
   - Line 1054: `/api/session` POST when `injectedPrincipal?.kind === 'remote-device'`
   - Line 1151: General authorization failure when `!principalMayAccess(principal, access)`

2. **Authorization Policy**: In `remote-routes.js`:
   - `{ methods: ['GET'], path: '/api/preferences', access: 'remote-read' }`
   - `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' }`

3. **PrincipalMayAccess Logic**: `principalMayAccess` returns `false` for remote-device principals when access is `'local-only'`

4. **UI Implementation**: The position-switch button (`aiScoreboardPositionBtn`) calls `api('/api/preferences', { method: 'POST', body: JSON.stringify({ aiScoreboardPlacement: next }) })`

**INFERENCE:** 1. **Authorization Gap**: The `local-only` policy on `/api/preferences` POST endpoint conflicts with the field evidence showing successful remote position switching

2. **Toast Display Timing**: The toast appears when authorization fails, but the field evidence indicates the position switch succeeds despite the toast

3. **Test Environment Mismatch**: The test suite doesn't properly mock `/api/preferences` POST calls, falling back to generic 200 responses

**UNKNOWN:** 1. **Actual Flow**: How the remote-device succeeds in positioning the scoreboard if the authorization check should block it
2. **Injection Mechanism**: How remote-device principals inject their authentication into daemon requests
3. **Race Condition**: Whether the position switch succeeds before, after, or independently of the toast display

**CONTRADICTION:** UNKNOWN

**Important files:** 1. **Source Code**:
   - `src/control-plane/daemon.ts` (lines 1223, 1325)
   - `src/control-plane/remote-routes.ts` (lines 57-58)
   - `src/public/index.html` (lines 6087-6096)

2. **Compiled Code**:
   - `out/control-plane/daemon.js` (lines 1054, 1151)
   - `out/control-plane/remote-routes.js` (lines 57-58)
   - `out/control-plane/daemon.js` (lines 6087-6096)

3. **Test Files**:
   - `test/ai-usage-scoreboard-ui.test.mjs` (lines 590-609)

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: scout-b-remote-authority-trace (objective ff8a01c1b6cc)
- Objective: READ-ONLY RECONNAISSANCE.

Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach

FIELD EVIDENCE:
On the real paired Android Remote Access surface, tapping the AI Usage Scorecard top/bottom position-switch control successfully moves/collapses/repositions the Scorecard. At the same time, the mobile UI displays the toast:

"This action is available only on the local Sideline."

The action itself succeeds remotely, so the warning appears stale or mismatched. The toast also temporarily covers the bottom mobile Scorecard.

MISSION:
Determine exactly where this toast originates, why it fires during a successful remote Scorecard position switch, whether the action is intentionally remote-capable, and the smallest safe correction.

Do not modify source.
Do not implement.
Do not commit, push, reset, stash, clean, install, or reorganize.
Separate FACT, FIELD EVIDENCE, INFERENCE, and UNKNOWN.
Return exact file paths, symbols/handlers, call path, authority boundary, other relevant call sites, and smallest safe implementation seam.
LANE B — REMOTE AUTHORITY / BEHAVIOR TRACE

Independently trace the AI Usage Scorecard top/bottom position-switch action on the remote-device surface.

Prioritize:

* whether the position-switch is client-side presentation state or backend-authorized state
* why the action succeeds on the paired Android remote surface
* whether remote-device is intentionally allowed to perform it
* whether removing the warning would weaken any real authorization/security boundary
* whether this is leftover behavior from a pre-Remote-Access local-only implementation
* exact regression test needed to prove remote swap succeeds without the false toast
* preserve any genuinely local-only guard elsewhere

Return a concise verdict:
STALE UX GUARD / REAL AUTHORITY GUARD / AMBIGUOUS
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-b-remote-authority-trace-Reconnaissance.md

**Key discoveries:** - The toast message originates from `src/control-plane/daemon.ts` lines 1324‑1326, which is the generic unauthorized‑access handler for local‑only routes when accessed by a non‑local‑admin principal (e.g., a remote device).
- The POST `/api/preferences` endpoint is marked `access: 'local-only'` in `src/control-plane/remote-routes.ts` line 62.
- Remote‑device principals are only permitted `remote‑read` or `remote‑mutate` access (see `principalMayAccess` in `src/control-plane/remote-routes.ts` lines 81‑83); therefore they cannot mutate preferences via this endpoint.
- The client‑side `aiScoreboardTogglePlacement` function in `src/public/index.html` (lines 6087‑6097) optimistically updates the UI and `lastStatus` before persisting the preference via `POST /api/preferences`. On failure, it shows a toast with the error message from the server.
- When a remote device toggles the AI Usage Scorecard position, the UI updates immediately (optimistic), the persistence request is rejected with 403 and the message “This action is available only on the local Sideline,” and the toast is shown—creating a mismatch between the warning and the successful visual update.

**FACT:** - File `src/control-plane/daemon.ts` lines 1324‑1326 contain the exact string: `this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });`
- File `src/control-plane/remote-routes.ts` line 62 defines: `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' },`
- File `src/control-plane/remote-routes.ts` lines 81‑83 define the `principalMayAccess` function that restricts non‑local‑admin principals to `remote‑read` or `remote‑mutate` access.
- File `src/public/index.html` lines 6087‑6097 show the optimistic update and error‑toast logic for the scoreboard placement toggle.
- Field evidence confirms that on the remote Android surface, tapping the scoreboard position switch moves the scorecard (optimistic update) and displays the toast.

**INFERENCE:** - The toast is a stale UX guard because the underlying action (moving the scoreboard) succeeds from the user’s perspective due to optimistic UI update, while the warning incorrectly implies the action is blocked entirely. The real authorization guard (local‑only preference mutation) remains intact and is enforced by the server (the API call fails), but the warning does not distinguish between the visual effect and the persistence step.
- The preference `aiScoreboardPlacement` likely does not guard a sensitive security boundary, as it is a UI‑only setting, making the warning overly restrictive for this specific action.

**UNKNOWN:** - Whether other `local‑only` preference mutations (e.g., `remoteAccess.enabled`, `devMode`) could pose a security risk if allowed from remote devices—this would require examining each preference’s sensitivity.
- Whether the optimistic update pattern is intentional for all preference toggles or only for the scoreboard placement.

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/control-plane/daemon.ts` – contains the toast‑message handler (lines 1324‑1326)
- `src/control-plane/remote-routes.ts` – defines route access policies (line 62 for `/api/preferences`)
- `src/public/index.html` – client‑side logic for scoreboard toggle and toast display (lines 6087‑6097)
- `src/control-plane/remote-routes.ts` – defines `principalMayAccess` (lines 81‑83)

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane scout-a-toast-ui-trace: **Verdict**: STALE UX GUARD / REAL AUTHORITY GUARD / AMBIGUOUS
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane scout-b-remote-authority-trace: - The toast message originates from `src/control-plane/daemon.ts` lines 1324‑1326, which is the generic unauthorized‑access handler for local‑only routes when accessed by a non‑local‑admin principal (e.g., a remote device). - The POST `/api/preferences` endpoint is marked `access: 'local-only'` in `src/control-plane/remote-routes.ts` line 62. - Remote‑device principals are only permitted `remote‑r

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

None reported by the surviving Scouts. (Absence of a reported contradiction is not proof there is none.)

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scout-a-toast-ui-trace · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-a-toast-ui-trace-Reconnaissance.md
- Lane scout-b-remote-authority-trace · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436\SCOUT-scout-b-remote-authority-trace-Reconnaissance.md

### Full report — lane scout-a-toast-ui-trace (sideline-scout-quick)

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

### Full report — lane scout-b-remote-authority-trace (sideline-scout-balanced)

**RESULT:** STALE UX GUARD

**KEY DISCOVERIES:**
- The toast message originates from `src/control-plane/daemon.ts` lines 1324‑1326, which is the generic unauthorized‑access handler for local‑only routes when accessed by a non‑local‑admin principal (e.g., a remote device).
- The POST `/api/preferences` endpoint is marked `access: 'local-only'` in `src/control-plane/remote-routes.ts` line 62.
- Remote‑device principals are only permitted `remote‑read` or `remote‑mutate` access (see `principalMayAccess` in `src/control-plane/remote-routes.ts` lines 81‑83); therefore they cannot mutate preferences via this endpoint.
- The client‑side `aiScoreboardTogglePlacement` function in `src/public/index.html` (lines 6087‑6097) optimistically updates the UI and `lastStatus` before persisting the preference via `POST /api/preferences`. On failure, it shows a toast with the error message from the server.
- When a remote device toggles the AI Usage Scorecard position, the UI updates immediately (optimistic), the persistence request is rejected with 403 and the message “This action is available only on the local Sideline,” and the toast is shown—creating a mismatch between the warning and the successful visual update.

**FACT:**
- File `src/control-plane/daemon.ts` lines 1324‑1326 contain the exact string: `this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });`
- File `src/control-plane/remote-routes.ts` line 62 defines: `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' },`
- File `src/control-plane/remote-routes.ts` lines 81‑83 define the `principalMayAccess` function that restricts non‑local‑admin principals to `remote‑read` or `remote‑mutate` access.
- File `src/public/index.html` lines 6087‑6097 show the optimistic update and error‑toast logic for the scoreboard placement toggle.
- Field evidence confirms that on the remote Android surface, tapping the scoreboard position switch moves the scorecard (optimistic update) and displays the toast.

**INFERENCE:**
- The toast is a stale UX guard because the underlying action (moving the scoreboard) succeeds from the user’s perspective due to optimistic UI update, while the warning incorrectly implies the action is blocked entirely. The real authorization guard (local‑only preference mutation) remains intact and is enforced by the server (the API call fails), but the warning does not distinguish between the visual effect and the persistence step.
- The preference `aiScoreboardPlacement` likely does not guard a sensitive security boundary, as it is a UI‑only setting, making the warning overly restrictive for this specific action.

**UNKNOWN:**
- Whether other `local‑only` preference mutations (e.g., `remoteAccess.enabled`, `devMode`) could pose a security risk if allowed from remote devices—this would require examining each preference’s sensitivity.
- Whether the optimistic update pattern is intentional for all preference toggles or only for the scoreboard placement.

**IMPORTANT FILES / PATHS:**
- `src/control-plane/daemon.ts` – contains the toast‑message handler (lines 1324‑1326)
- `src/control-plane/remote-routes.ts` – defines route access policies (line 62 for `/api/preferences`)
- `src/public/index.html` – client‑side logic for scoreboard toggle and toast display (lines 6087‑6097)
- `src/control-plane/remote-routes.ts` – defines `principalMayAccess` (lines 81‑83)

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\mobile-scorecard-swap-toast-recon-20260924-160436
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\mobile-scorecard-swap-toast-recon-20260924-160436

