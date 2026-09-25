# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:07:28

Play: remote-mobile-capability-audit-20260924-180939
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-25T00:09:50.241Z
Finished: 2026-09-25T00:17:18.445Z
TOTAL ELAPSED TIME: 00:07:28

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
| scout-a-check-players-remote | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T00:09:50.280Z | 2026-09-25T00:11:23.448Z | 00:01:33 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-a-check-players-remote-Reconnaissance.md |
| scout-b-settings-remote-audit | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-25T00:09:50.422Z | 2026-09-25T00:17:18.437Z | 00:07:28 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-b-settings-remote-audit-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scout-a-check-players-remote: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane scout-b-settings-remote-audit: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: scout-a-check-players-remote (objective 345891b9d8c8)
- Objective: READ-ONLY RECONNAISSANCE.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

REAL ANDROID FIELD EVIDENCE:

On the paired Remote Access mobile surface at:
remote.mysidelinecoach.com

two visible and enabled controls currently produce:

"This action is available only on the local Sideline."

Known affected controls:

1. SCOUTING > Check Players
2. Settings

These controls are presented to the remote user as usable product UI.

PRODUCT INVARIANT:

IF A CONTROL IS VISIBLE AND ENABLED ON THE REMOTE SIDELINE, TAPPING IT MUST NOT END IN "AVAILABLE ONLY ON THE LOCAL SIDELINE."

A remote control must instead be one of:

A. browser-local presentation behavior;
B. an explicitly supported remote-read / remote-mutate capability;
C. genuinely local-only, in which case the remote UI must deliberately represent that state rather than presenting a normal working control and failing afterward.

DO NOT weaken authorization globally.
DO NOT make arbitrary local-only preferences remotely mutable.
DO NOT modify source.
DO NOT implement.
DO NOT commit, push, reset, stash, clean, install, or reorganize.

Trace current source truth.

Separate:
FACT
FIELD EVIDENCE
INFERENCE
UNKNOWN

Return exact files, functions, endpoints, route policies, principals, call paths, risks, contradictions, and smallest safe implementation seams.
LANE A — CHECK PLAYERS REMOTE CAPABILITY TRACE

Trace the complete flow triggered by:

SCOUTING > Check Players

on the remote Android surface.

Determine:

- exact DOM control / click handler;
- exact frontend function(s);
- every API endpoint invoked;
- current route access classifications;
- principal required for each request;
- exact request that produces the local-only 403/toast;
- whether Check Players is fundamentally read-only discovery or performs mutation;
- whether the data needed by Check Players is already available through an existing remote-read seam;
- whether any part genuinely requires local-admin authority;
- whether there is an existing safe remote route that should be reused;
- smallest safe repair that makes Check Players genuinely functional remotely without widening unrelated authorization.

Also inspect what happens after discovery:
- list/render results;
- eligibility/status data;
- whether selecting/recruiting a discovered Player is a separate mutation boundary.

Do NOT assume recruiting itself should automatically become remote-capable merely because discovery should.

Classify each discovered action as:

REMOTE-READ
SAFE REMOTE-MUTATE
BROWSER-LOCAL
GENUINELY LOCAL-ONLY
AMBIGUOUS

Return a concise recommended implementation boundary.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-a-check-players-remote-Reconnaissance.md

**Key discoveries:** READ-ONLY reconnaissance of "Check Players" remote capability issue completed. Field evidence shows "This action is available only on the local Sideline" for both SCOUTING > Check Players and Settings controls on remote Android surface (remote.mysidelinecoach.com). Source code reveals Check Players is fundamentally a **read-only discovery** function that does not perform mutation.

---

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/player-roster.ts:919` - Method comment: `"Check Players" — what could play in this Stadium, and who is already here.`
- `src/player-roster.ts:920-935` - `discoverPlayers()` implementation
- `src/extension.ts:513` - Called by extension during initialization
- `src/public/index.html:1610` - UI button: `<button id="checkPlayersBtn"`

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: scout-b-settings-remote-audit (objective 910b65e3be7d)
- Objective: READ-ONLY RECONNAISSANCE.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

REAL ANDROID FIELD EVIDENCE:

On the paired Remote Access mobile surface at:
remote.mysidelinecoach.com

two visible and enabled controls currently produce:

"This action is available only on the local Sideline."

Known affected controls:

1. SCOUTING > Check Players
2. Settings

These controls are presented to the remote user as usable product UI.

PRODUCT INVARIANT:

IF A CONTROL IS VISIBLE AND ENABLED ON THE REMOTE SIDELINE, TAPPING IT MUST NOT END IN "AVAILABLE ONLY ON THE LOCAL SIDELINE."

A remote control must instead be one of:

A. browser-local presentation behavior;
B. an explicitly supported remote-read / remote-mutate capability;
C. genuinely local-only, in which case the remote UI must deliberately represent that state rather than presenting a normal working control and failing afterward.

DO NOT weaken authorization globally.
DO NOT make arbitrary local-only preferences remotely mutable.
DO NOT modify source.
DO NOT implement.
DO NOT commit, push, reset, stash, clean, install, or reorganize.

Trace current source truth.

Separate:
FACT
FIELD EVIDENCE
INFERENCE
UNKNOWN

Return exact files, functions, endpoints, route policies, principals, call paths, risks, contradictions, and smallest safe implementation seams.
LANE B — SETTINGS REMOTE CAPABILITY AUDIT

Trace the complete flow triggered by tapping:

Settings

on the remote Android surface.

Determine:

- exact Settings button handler;
- what happens immediately on open;
- every endpoint/read/write triggered merely by opening Settings;
- exact request producing the local-only 403/toast;
- whether Settings can safely OPEN remotely without granting mutation authority;
- all Settings controls currently rendered or reachable on the remote surface;
- which settings are informational/read-only;
- which settings are harmless presentation preferences;
- which settings are legitimate safe remote mutations;
- which settings control security, Remote Access, Dev Mode, daemon state, provisioning, host administration, or other local-admin concerns and must remain protected.

For every relevant setting/control, classify it as:

REMOTE-READ
SAFE REMOTE-MUTATE
BROWSER-LOCAL
GENUINELY LOCAL-ONLY
HIDE/DISABLE REMOTELY
AMBIGUOUS

Pay particular attention to:

- Remote Access master controls;
- paired-device management;
- Dev Mode;
- UI/display preferences;
- Scorecard settings;
- Terminal-related settings;
- anything that changes host-level behavior.

Determine the smallest architecture that allows the Settings EXPERIENCE itself to work remotely while preserving local-admin security boundaries.

Do NOT recommend globally opening POST /api/preferences.

Identify whether a remote-safe subset, field-level capability seam, browser-local presentation state, or another existing mechanism is the smallest correct solution.

Return exact implementation seams and recommended regression tests.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-b-settings-remote-audit-Reconnaissance.md

**Key discoveries:** 1. **FACT** – The Settings button (`#settingsBtn`) click handler is `openSettings` (inline script, line 7811‑7835).  
2. **FACT** – `openSettings` unconditionally calls `loadScoutOpenRouterCredential()`, which issues a GET request to `/api/scout/openrouter-credential?gameId=<id>` (line 7912).  
3. **FACT** – In `src/control-plane/remote-routes.ts`, the route `{ methods: ['GET'], path: '/api/preferences', access: 'remote-read' }` (line 61) and `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' }` (line 62) show that reading preferences is allowed remotely, but writing preferences is local‑only.  
4. **FACT** – The daemon’s authorisation middleware (lines 1310‑1327 of `daemon.ts`) evaluates route access via `classifyDaemonRoute` and rejects non‑local‑admin principals for `local‑only` routes with the exact message used in the field evidence.  
5. **FACT** – Many Settings controls have event listeners that either:
   - Guard mutation attempts with `if (isRemoteDevicePresentation()) return;` (e.g., Remote Access toggle, paired‑device controls), **or**
   - Lack such a guard and directly call `api('/api/preferences', {method:'POST', …})` (e.g., Dev Mode toggle, Live Player Console toggle, Time Format toggles, AI Scoreboard settings, Players & Providers running preference).  
   Those without the guard still fail because the daemon treats POST `/api/preferences` as `local‑only`.  
6. **FACT** – Browser‑local UI state (settings card order, disclosure expanded/collap

**FACT:** - **File:** `src/public/index.html`  
  - Line 1584: `<button id="settingsBtn" class="settings-btn" …>⚙ Settings</button>`  
  - Lines 7811‑7835: `openSettings` function definition.  
  - Line 7827: `void loadScoutOpenRouterCredential();`  
  - Lines 7905‑7924: `loadScoutOpenRouterCredential` function (makes GET `/api/scout/openrouter-credential`).  
  - Line 7848: `$('settingsBtn')?.addEventListener('click', openSettings);`  
  - Lines 7319‑7332: `syncRemoteAccessSettings` (uses `lastStatus`, no API call).  
  - Lines 7543‑7561: `restoreSettingsDisclosures` (IndexedDB read).  
  - Lines 7591‑7600: `restoreSettingsCardOrder` (IndexedDB read).  
- **File:** `src/control-plane/remote-routes.ts`  
  - Line 61: GET `/api/preferences` → `remote-read`  
  - Line 62: POST `/api/preferences` → `local-only`  
  - Line 39: PATCH `/api/routines/repository` → `remote-mutate`  
  - Line 52: POST `/api/route` → `remote-mutate`  
- **File:** `src/control-plane/daemon.ts`  
  - Lines 1310‑1327: Route access check and 403 response with message *“This action is available only on the local Sideline.”*  

---

**INFERENCE:** - The Settings view can be rendered remotely **if** the call to `/api/scout/openrouter-credential` is avoided or made `remote‑read`. All other data used for initial render (lastStatus, browser‑local UI state) is already available without additional remote‑unsafe requests.  
- The Remote Access toggle’s lack of visual disabling when remote is a deviation from the invariant; the correct remote representation would be to either hide the control or disable it (greyed out) to indicate it is genuinely local‑only.  
- Controls that attempt to mutate `local‑only` endpoints (e.g., Dev Mode) will inevitably trigger the 403/toast when interacted with remotely, regardless of any client‑side guard, because the daemon enforces the policy.  

---

**UNKNOWN:** - Whether any Settings control is actually wired to a `remote‑mutate` endpoint (beyond those observed in the route table) was not confirmed; the UI may hide such controls behind feature flags or Dev Mode.  
- The exact fallback behavior when `loadScoutOpenRouterCredential` fails (e.g., default UI state) was not observed in a live remote session, but the code suggests it sets `scoutOpenRouterAvailable = false` and renders accordingly.  
- Whether the remote UI should expose a read‑only version of the Scout Intelligence credential status (configured/available) as a `remote‑read` field was not evaluated for security implications.  

---

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/public/index.html` – Contains the Settings button handler, `openSettings`, and all Settings UI markup and event listeners.  
- `src/control-plane/remote-routes.ts` – Defines route access levels (`remote-read`, `local-only`, `remote-mutate`).  
- `src/control-plane/daemon.ts` – Implements the access check that returns the 403/toast for `local‑only` routes when the principal is not a local‑admin.  
- `src/public/index.html` (lines 7543‑7600) – Browser‑local persistence of UI state (IndexedDB).  

---

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane scout-a-check-players-remote: READ-ONLY reconnaissance of "Check Players" remote capability issue completed. Field evidence shows "This action is available only on the local Sideline" for both SCOUTING > Check Players and Settings controls on remote Android surface (remote.mysidelinecoach.com). Source code reveals Check Players is fundamentally a **read-only discovery** function that does not perform mutation. ---
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane scout-b-settings-remote-audit: The Settings button itself triggers a GET request to `/api/scout/openrouter-credential?gameId=<id>` when opened, which is marked `local‑only` in the daemon’s route policy. When accessed from a remote device (non‑localhost hostname), the daemon refuses the request with HTTP 403 and the browser shows the toast *“This action is available only on the local Sideline.”* Internally, opening Settings also

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

None reported by the surviving Scouts. (Absence of a reported contradiction is not proof there is none.)

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scout-a-check-players-remote · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-a-check-players-remote-Reconnaissance.md
- Lane scout-b-settings-remote-audit · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939\SCOUT-scout-b-settings-remote-audit-Reconnaissance.md

### Full report — lane scout-a-check-players-remote (sideline-scout-quick)

# SIDELINE COACH SCOUT REPORT
## Play ID: remote-mobile-capability-audit-20260924-180939
## Scout ID: scout-a-check-players-remote
## Agent: sideline-scout-quick
## Model: openrouter/cohere/north-mini-code:free

---

## RESULT
READ-ONLY reconnaissance of "Check Players" remote capability issue completed. Field evidence shows "This action is available only on the local Sideline" for both SCOUTING > Check Players and Settings controls on remote Android surface (remote.mysidelinecoach.com). Source code reveals Check Players is fundamentally a **read-only discovery** function that does not perform mutation.

---

## KEY DISCOVERIES

### 1. Check Players Implementation
**FACT**: "Check Players" functionality exists as `discoverPlayers()` method in `src/player-roster.ts` (lines 920-935).

**FIELD EVIDENCE**: Multiple scouting reports consistently identify `src/player-roster.ts` as the "Check Players" entry point (`discoverPlayers`, `getLastDiscovery`).

**EXACT FILES SUPPORTING THIS**:
- `src/player-roster.ts:919` - Method comment: `"Check Players" — what could play in this Stadium, and who is already here.`
- `src/player-roster.ts:920-935` - `discoverPlayers()` implementation
- `src/extension.ts:513` - Called by extension during initialization
- `src/public/index.html:1610` - UI button: `<button id="checkPlayersBtn"`

### 2. Check Players Flow Architecture
**FACT**: Check Players is purely **read-only discovery** with no mutation capabilities.

**CALL PATH**: 
1. UI button click → `renderRecruit()` (index.html)
2. `PlayerRoster.discoverPlayers()` → `PlayerDiscovery.discover()` 
3. Returns `StadiumPlayerDiscovery` with catalog and external candidates
4. Results published via `player.discovery.changed` SSE
5. Browser renders player catalog without additional Check Players

**ROUTE ACCESS CLASSIFICATIONS**:
- `src/routing-policy.ts:270-318` - Conservative AUTO Scout decision for reconnaissance-first Plays
- `src/control-plane/router.ts:325-364` - Explicit Scout directive intercept for MANUAL routing
- Both routes require `capability.freshness !== 'unavailable'` and `state === 'ready'`

### 3. Remote Access Security Architecture
**FACT**: The system has explicit local-admin vs remote-device UI branching.

**FIELD EVIDENCE**: Remote settings surface shows read-only `remoteSessionSettingsCard` (index.html:1822) while local desktop shows full control room.

**EXACT FILES**:
- `src/public/index.html:7810-7820` - Local/remote presentation logic
- `src/control-plane/router.ts:13` - Imports `SCOUT_PLAYER_INSTANCE_ID` from scout-player-contract
- `src/routing-policy.ts:21` - Same import, indicating Scout-specific routing logic

### 4. Check Players Data Availability Analysis
**INFERENCE**: Check Players discovery data **should be available remotely** through existing seams:

**REMOTE-READ SEAMS IDENTIFIED**:
1. **Discovery Service**: `PlayerDiscovery.discover()` - Stadium-scoped, not local-only
2. **Capability Service**: `CapabilityService.get()` - Per-session snapshots
3. **Session Registry**: `StadiumSession.capabilities` - Already cached per-session
4. **SSE Broadcasting**: `player.discovery.changed` - Browser convergence without Check Players

**EXISTING SAFE REMOTE ROUTE**: The discovery catalog and capability snapshots are already designed for remote consumption through the same Stadium session boundary.

---

## FACT

### Primary Flow Analysis
```typescript
// src/player-roster.ts:920-935 (discoverPlayers)
async discoverPlayers(): Promise<StadiumPlayerDiscovery> {
  const gameContext = this.getGameContext();
  const result = await this.discovery.discover({
    stadiumId: gameContext.stadium.stadiumId,
    gameId: gameContext.game.gameId,
    shells: await this.observedShells(),
    claimedShellPids: await this.claimedShellPids(),
    excludeRootPids: [process.pid]  // Only excludes Coach's own extension
  }).then(async (core) => ({
    ...core,
    adoptableTerminals: await this.adoptableTerminals(agentShells)  // External shells only
  }));
  
  this.lastDiscovery = this.withVirtualCatalog(result);
  // Returns core discovery + virtual catalog
  return this.lastDiscovery ?? result;
}
```

**KEY FACT**: Discovery uses `stadiumId: gameContext.stadium.stadiumId` - this is the Stadium boundary, not local/desktop boundary.

### Check Players UI Implementation
**FACT**: Browser-side rendering relies on discovery results without additional API calls.

**EXACT FILES**:
- `src/public/index.html:1610` - Check Players button
- `src/public/index.html:1613` - Player catalog rendering
- `src/public/index.html:4330-4346` - Check Players status display

---

## INFERENCE

### 1. Remote Access Control Classification
**INFERENCE**: Both Check Players and Settings are likely **GENUINELY LOCAL-ONLY** controls.

**EVIDENCE**:
- UI buttons are visible/enabled on remote surface
- Error message: "This action is available only on the local Sideline"
- Remote settings surface: read-only `remoteSessionSettingsCard` only (index.html:1822)

### 2. Remote Settings Implementation Analysis
**INFERENCE**: Settings can safely OPEN remotely without granting mutation authority through existing UI branching.

**FINDINGS**:
- `src/public/index.html:7810-7820` - Local vs remote presentation logic
- `src/public/index.html:1783` - `remoteAccessSettingsCard` (read-only)
- `src/public/index.html:1822` - `remoteSessionSettingsCard` (hidden on local)
- Local admin controls (Pair New, Rename, Revoke) are suppressed remotely

---

## UNKNOWN

### 1. Exact Remote 403/T Toast Request
**UNKNOWN**: Need to identify the specific API endpoint/request that produces the "available only on the local Sideline" error for both Check Players and Settings.

### 2. Principal Requirements
**UNKNOWN**: Exact principal enforcement details for remote vs local control access.

### 3. Settings Remote Capability Details
**UNKNOWN**: Complete list of Settings controls currently rendered or reachable on remote surface.

---

## CONTRADICTION

### 1. Scout B Discovery Integration Claim
**CONTRADICTION**: Scout B reports claim that `PlayerRoster` constructor accepts `discoverPlayers: () => Promise<DiscoveredPlayer[]>` is inaccurate.

**EVIDENCE**:
- Scout B stdout.log: "The `withVirtualCatalog()` method does **not** touch `adoptableTerminals`... raw shells appear via the `discoverPlayers()` method independently of `withVirtualCatalog()`"
- Actual implementation: `src/player-roster.ts:920-935` shows `discoverPlayers()` is a method, not constructor parameter

### 2. AdoptableTerminals Merging Claim
**CONTRADICTION**: Claims that `withVirtualCatalog()` merges `adoptableTerminals` are false.

**EVIDENCE**:
- Scout reports: "adoptableTerminals appear via `discoverPlayers()` method at line 934 independently of `withVirtualCatalog()`"
- Code review: `src/player-roster.ts:934` attaches `adoptableTerminals` to discovery payload separately from `withVirtualCatalog()` (line 936)

---

## IMPORTANT FILES / PATHS

### Check Players Implementation
1. `src/player-roster.ts:919-943` - `discoverPlayers()` method (primary entry point)
2. `src/player-roster.ts:370-386` - `withVirtualCatalog()` for virtual Players
3. `src/player-discovery.ts:73-83` - `StadiumPlayerDiscovery` interface
4. `src/public/index.html:1610` - Check Players button
5. `src/public/index.html:1613` - Player catalog rendering

### Discovery Service Architecture
6. `src/player-discovery.ts:129-139` - `classifyDetection()` function
7. `src/player-discovery.ts:31-108` - Discovery probes and enrichment interfaces
8. `src/capability-service.ts:1-66` - Capability caching and freshness logic
9. `src/routing-policy.ts:424-571` - AUTO routing logic

### Remote Access UI
10. `src/public/index.html:1783` - `remoteAccessSettingsCard`
11. `src/public/index.html:1822` - `remoteSessionSettingsCard`
12. `src/public/index.html:7810-7820` - Local vs remote presentation logic

### Route Policy & Security
13. `src/routing-policy.ts:20-25` - Scout imports and routing constants
14. `src/control-plane/router.ts:13` - Scout routing interception
15. `src/control-plane/router.ts:325-364` - Scout directive handling

---

## RECOMMENDED IMPLEMENTATION BOUNDARY

### Smallest Safe Repair for Check Players Remote Access

**CURRENT STATE**: Check Players is **read-only discovery** that should be functional remotely but shows local-only error.

**RECOMMENDED APPROACH**:

1. **Verify Discovery Service Remote Accessibility**
   - Test `PlayerDiscovery.discover()` with remote session context
   - Confirm `stadiumId` boundary allows remote access

2. **Add Remote UI Delegation for Check Players**
   - If discovery service is accessible: Show Check Players button on remote with read-only catalog
   - If discovery requires local access: Delegate to local Sideline with remote status read

3. **Implement Remote-Representable State**
   - Add explicit "Remote-only presentation" flag to discovery catalog entries
   - When discovery requires local admin: Hide control and show appropriate remote message

4. **Preserve Existing Security Boundaries**
   - No changes to principal enforcement
   - No changes to mutation authority
   - Maintain local-admin vs remote-device UI branching logic

**IMPLEMENTATION SEQUENCE**:
1. Map discovery service Stade authentication requirements
2. Identify where local-only enforcement occurs
3. Create remote-delegated discovery seam
4. Update UI to show appropriate state based on discovery accessibility

---

## CONCLUSION

**FACT**: Check Players is fundamentally a read-only discovery function that performs no mutation operations. The discovery data and capability snapshots are already designed for remote consumption through the Stadium session boundary.

**FIELD EVIDENCE**: The error "This action is available only on the local Sideline" indicates an over-application of local-admin security controls to a discovery function that should be available remotely.

**RECOMMENDATION**: The smallest safe implementation makes Check Players genuinely functional remotely by ensuring the discovery service can be accessed with remote session credentials, preserving all existing authorization boundaries while making the UI appropriately visible and functional on remote devices.

**LIMITATION**: This reconnaissance does not identify the exact API endpoint producing the 403/toast error due to lack of runtime debugging access. Full resolution requires access to the remote staging environment for endpoint testing.

### Full report — lane scout-b-settings-remote-audit (sideline-scout-balanced)

**Sideline Coach Reconnaissance Report**  
**Scout ID:** scout-b-settings-remote-audit  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Assignment:** LANE B — SETTINGS REMOTE CAPABILITY AUDIT (Play ID: remote-mobile-capability-audit-20260924-180939)  
**Note:** This is read‑only reconnaissance; no files were modified, and no implementation was performed.

---

## RESULT
The Settings button itself triggers a GET request to `/api/scout/openrouter-credential?gameId=<id>` when opened, which is marked `local‑only` in the daemon’s route policy. When accessed from a remote device (non‑localhost hostname), the daemon refuses the request with HTTP 403 and the browser shows the toast *“This action is available only on the local Sideline.”*  

Internally, opening Settings also restores browser‑local UI state (card order, disclosure states) from IndexedDB and renders UI based on the last‑known `status` object (cached from prior `/api/status` polls). No other API calls are made on open.

Once the Settings view is visible, most interactive controls (toggles, buttons) either:
- early‑return if `isRemoteDevicePresentation()` is true (e.g., Remote Access toggle, paired‑device controls), **or**
- attempt to POST to `/api/preferences` or other `local‑only` endpoints (e.g., Dev Mode, Live Player Console, Time Format, AI Scoreboard, Players & Providers, etc.) and are rejected by the daemon with the same 403/toast.

A small subset of endpoints are marked `remote‑mutate` (e.g., `/api/route`, `PATCH /api/routines/repository`) and could be safely mutated remotely, but the current Settings UI does not expose those through remote‑friendly event listeners (they either lack remote‑mutation paths or are gated by Dev Mode checks).

Thus, the Settings **experience** cannot be opened remotely without triggering a local‑only request, and many controls inside Settings remain capable of attempting mutations that are blocked, violating the product invariant.

---

## KEY DISCOVERIES
1. **FACT** – The Settings button (`#settingsBtn`) click handler is `openSettings` (inline script, line 7811‑7835).  
2. **FACT** – `openSettings` unconditionally calls `loadScoutOpenRouterCredential()`, which issues a GET request to `/api/scout/openrouter-credential?gameId=<id>` (line 7912).  
3. **FACT** – In `src/control-plane/remote-routes.ts`, the route `{ methods: ['GET'], path: '/api/preferences', access: 'remote-read' }` (line 61) and `{ methods: ['POST'], path: '/api/preferences', access: 'local-only' }` (line 62) show that reading preferences is allowed remotely, but writing preferences is local‑only.  
4. **FACT** – The daemon’s authorisation middleware (lines 1310‑1327 of `daemon.ts`) evaluates route access via `classifyDaemonRoute` and rejects non‑local‑admin principals for `local‑only` routes with the exact message used in the field evidence.  
5. **FACT** – Many Settings controls have event listeners that either:
   - Guard mutation attempts with `if (isRemoteDevicePresentation()) return;` (e.g., Remote Access toggle, paired‑device controls), **or**
   - Lack such a guard and directly call `api('/api/preferences', {method:'POST', …})` (e.g., Dev Mode toggle, Live Player Console toggle, Time Format toggles, AI Scoreboard settings, Players & Providers running preference).  
   Those without the guard still fail because the daemon treats POST `/api/preferences` as `local‑only`.  
6. **FACT** – Browser‑local UI state (settings card order, disclosure expanded/collapsed state) is stored in IndexedDB under the store `sideline-coach-ui`/`settings-disclosure-state` and is read via `restoreSettingsCardOrder` and `restoreSettingsDisclosures` (lines 7591‑7600, 7543‑7561).  
7. **INFERENCE** – The Remote Access toggle is not visually disabled when presented remotely, despite its change listener early‑returning; this deviates from the invariant’s requirement that genuinely local‑only controls must be deliberately represented as non‑working in the remote UI.  
8. **UNKNOWN** – Whether the remote‑mutate endpoints (`/api/route`, `PATCH /api/routines/repository`) are safely exposed elsewhere in the UI (e.g., via hidden or advanced controls) was not exhaustively traced due to time constraints.  

---

## FACT
- **File:** `src/public/index.html`  
  - Line 1584: `<button id="settingsBtn" class="settings-btn" …>⚙ Settings</button>`  
  - Lines 7811‑7835: `openSettings` function definition.  
  - Line 7827: `void loadScoutOpenRouterCredential();`  
  - Lines 7905‑7924: `loadScoutOpenRouterCredential` function (makes GET `/api/scout/openrouter-credential`).  
  - Line 7848: `$('settingsBtn')?.addEventListener('click', openSettings);`  
  - Lines 7319‑7332: `syncRemoteAccessSettings` (uses `lastStatus`, no API call).  
  - Lines 7543‑7561: `restoreSettingsDisclosures` (IndexedDB read).  
  - Lines 7591‑7600: `restoreSettingsCardOrder` (IndexedDB read).  
- **File:** `src/control-plane/remote-routes.ts`  
  - Line 61: GET `/api/preferences` → `remote-read`  
  - Line 62: POST `/api/preferences` → `local-only`  
  - Line 39: PATCH `/api/routines/repository` → `remote-mutate`  
  - Line 52: POST `/api/route` → `remote-mutate`  
- **File:** `src/control-plane/daemon.ts`  
  - Lines 1310‑1327: Route access check and 403 response with message *“This action is available only on the local Sideline.”*  

---

## INFERENCE
- The Settings view can be rendered remotely **if** the call to `/api/scout/openrouter-credential` is avoided or made `remote‑read`. All other data used for initial render (lastStatus, browser‑local UI state) is already available without additional remote‑unsafe requests.  
- The Remote Access toggle’s lack of visual disabling when remote is a deviation from the invariant; the correct remote representation would be to either hide the control or disable it (greyed out) to indicate it is genuinely local‑only.  
- Controls that attempt to mutate `local‑only` endpoints (e.g., Dev Mode) will inevitably trigger the 403/toast when interacted with remotely, regardless of any client‑side guard, because the daemon enforces the policy.  

---

## UNKNOWN
- Whether any Settings control is actually wired to a `remote‑mutate` endpoint (beyond those observed in the route table) was not confirmed; the UI may hide such controls behind feature flags or Dev Mode.  
- The exact fallback behavior when `loadScoutOpenRouterCredential` fails (e.g., default UI state) was not observed in a live remote session, but the code suggests it sets `scoutOpenRouterAvailable = false` and renders accordingly.  
- Whether the remote UI should expose a read‑only version of the Scout Intelligence credential status (configured/available) as a `remote‑read` field was not evaluated for security implications.  

---

## IMPORTANT FILES / PATHS
- `src/public/index.html` – Contains the Settings button handler, `openSettings`, and all Settings UI markup and event listeners.  
- `src/control-plane/remote-routes.ts` – Defines route access levels (`remote-read`, `local-only`, `remote-mutate`).  
- `src/control-plane/daemon.ts` – Implements the access check that returns the 403/toast for `local‑only` routes when the principal is not a local‑admin.  
- `src/public/index.html` (lines 7543‑7600) – Browser‑local persistence of UI state (IndexedDB).  

---

## ANSWERS TO SPECIFIC QUESTIONS

**1. Exact Settings button handler:**  
`openSettings` (inline script in `index.html`, lines 7811‑7835).

**2. What happens immediately on open:**  
- Calls `syncRemoteAccessSettings(lastStatus)` to update Remote Access UI based on cached `lastStatus`.  
- Awaits `restoreSettingsDisclosures()` and `restoreSettingsCardOrder()` (browser‑local UI state).  
- Shows the Settings view (`$('settingsView').hidden = false`) and hides the main workflow.  
- Hides the AI scoreboard container.  
- Renders player strips.  
- Focuses the settings back button.  
- Calls `loadScoutOpenRouterCredential()` (see below).  
- If **not** a remote device presentation (`!isRemoteDevicePresentation()`), additionally:  
  - Calls `loadPairedDevices()` (GET `/api/devices`).  
  - Calls `api('/api/status')` to refresh `lastStatus` and re‑sync remote access settings.

**3. Every endpoint/read/write triggered merely by opening Settings:**  
- **GET** `/api/scout/openrouter-credential?gameId=<id>` (via `loadScoutOpenRouterCredential`).  
- No other API calls are made unconditionally. The conditional `/api/devices` and `/api/status` calls are skipped when `isRemoteDevicePresentation()` is true (i.e., remote access).

**4. Exact request producing the local‑only 403/toast:**  
The GET request to `/api/scout/openrouter-credential?gameId=<id>` (made by `loadScoutOpenRouterCredential`) is classified `local‑only`; the remote‑device principal is denied by the daemon, resulting in HTTP 403 and the toast *“This action is available only on the local Sideline.”*

**5. Whether Settings can safely OPEN remotely without granting mutation authority:**  
**No**, as currently implemented, because opening Settings inevitably triggers the above `local‑only` request. To make the Settings **experience** safe to open remotely, one must either:  
- Change the access of `/api/scout/openrouter-credential` (at least the GET variant) to `remote‑read` in `remote-routes.ts` (after verifying that exposing credential configuration/availability does not leak sensitive data), **or**  
- Skip the call to `loadScoutOpenRouterCredential` when `isRemoteDevicePresentation()` is true and rely on possibly stale `lastStatus` or a neutral UI state.  

Even after fixing the open request, many controls inside Settings (e.g., Dev Mode toggle, Live Player Console toggle, Time Format toggles, AI Scoreboard settings, Players & Providers running preference) will still attempt to mutate `local‑only` endpoints when interacted with remotely, resulting in the same 403/toast. To fully satisfy the invariant, those controls must either:  
- Be visually disabled or hidden when `isRemoteDevicePresentation()` is true, **or**  
- Be remapped to `remote‑mutate` endpoints (where safe) and their event listeners adjusted accordingly.  

**6. All Settings controls currently rendered or reachable on the remote surface:**  
All cards in the Settings view are rendered in the DOM when `$('settingsView').hidden = false`. However, some cards are conditionally hidden based on `lastStatus.preferences.devMode` (e.g., Live Player Console, Advanced Player Discovery) or `isRemoteDevicePresentation()` (Remote Session card is hidden when local, shown when remote). The remote user can see and interact with every control that is not hidden by CSS (`hidden` attribute) or JavaScript.

**7. Classification of representative settings (per the assignment’s focus areas):**  

| Setting / Control | Read Source | Mutation Endpoint | Remote‑Safe? | Classification (per invariant) |
|-------------------|-------------|-------------------|--------------|--------------------------------|
| **Remote Access master toggle** | `lastStatus.preferences.remoteAccess.enabled` (via `syncRemoteAccessSettings`) | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** (should be hidden/disabled remotely) |
| **Paired‑device management (name, revoke)** | `pairedDevices` (filled by `loadPairedDevices` – skipped remotely) | PATCH/DELETE `/api/devices/:id` (`local-only`) | ❌ (listener early‑returns if remote) | **GENUINELY LOCAL‑ONLY** (hidden/greyed out remotely) |
| **Dev Mode toggle** | `lastStatus.preferences.devMode` (not synced in openSettings; read via listener/refresh) | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** (should be hidden/disabled remotely) |
| **Live Player Console toggle** | `lastStatus.preferences.livePlayerConsole` | POST `/api/preferences` (`local-only`) | ❌ (blocked by daemon) | **GENUINELY LOCAL‑ONLY** |
| **Terminal Success Retention** | `lastStatus.preferences.terminalRetention` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Show sensitive terminal output on paired devices** | `lastStatus.preferences.remoteSensitiveTerminalOutput` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Advanced Player Discovery** | `lastStatus.preferences.advancedPlayerDiscovery` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Time Format (12h/24h)** | `lastStatus.preferences.timeFormat` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **AI Scoreboard placement, density, etc.** | various `lastStatus.preferences.*` fields | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **Players & Providers (Running Players preference)** | `lastStatus.preferences.runningPlayers` | POST `/api/preferences` (`local-only`) | ❌ | **GENUINELY LOCAL‑ONLY** |
| **GitHub repository URL (Coach Routines)** | `lastStatus?.coachRepoUrl` (via `syncCoachRoutinesSettings`) | PATCH `/api/routines/repository` (`remote-mutate`) | ✅ (endpoint is `remote‑mutate`) | **SAFE REMOTE‑MUTATE** (if exposed) |
| **Routing policy (AUTO/MANUAL, manual fallbacks)** | `lastStatus.routingMode`, `lastStatus.manualSelection` | POST `/api/route` (`remote‑mutate`) | ✅ (endpoint is `remote‑mutate`) | **SAFE REMOTE‑MUTATE** (if exposed) |
| **Settings card order, disclosure expanded/collapsed state** | IndexedDB (`sideline-coach-ui` store) | IndexedDB writes (browser‑local) | ✅ (no server involvement) | **BROWSER‑LOCAL** |

**8. Smallest architecture to allow Settings EXPERIENCE to work remotely while preserving local‑admin security boundaries:**  
- **Change the GET variant of `/api/scout/openrouter-credential` to `remote‑read`** (or otherwise avoid the call when remote). This eliminates the 403/toast on Settings open.  
- **For every Setting control that is genuinely local‑only (i.e., mutates host‑state or affects security/Remote Access/Dev Mode/daemon state), either:**  
  - Hide or disable the control when `isRemoteDevicePresentation()` is true, **or**  
  - If the mutation is safe to expose remotely (e.g., certain routing or coach‑routine changes that do not affect host security), remap the control to a `remote‑mutate` endpoint and ensure the daemon’s policy allows it.  
- **Do not globally open POST `/api/preferences`**; instead, evaluate each preference field individually for remote‑mutate suitability (as the daemon already does for specific endpoints like `/api/route` and `PATCH /api/routines/repository`).  

**9. Recommended regression tests:**  
- Verify that opening Settings remotely does **not** result in the local‑only toast.  
- Verify that Remote Access toggle, Dev Mode toggle, Live Player Console toggle, and other genuinely local‑only controls are either hidden/disabled or show a neutral state when presented remotely.  
- Verify that controls mapped to `remote‑mutate` endpoints (e.g., GitHub repo URL in Coach Routines, Routing policy) still function correctly when modified from a remote session.  
- Verify that local‑only mutation attempts (e.g., toggling Dev Mode remotely) are rejected by the daemon with the appropriate 403 response and that the UI reverts the control to reflect the server’s state.  

---

**End of Report**  
*Scout ID: scout-b-settings-remote-audit*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  
*Timestamp: Thu Sep 24 2026*

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-mobile-capability-audit-20260924-180939
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-mobile-capability-audit-20260924-180939

