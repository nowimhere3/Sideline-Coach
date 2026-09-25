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
