# REMOTE COACH UI CAPABILITY CENSUS

**Scout Report ID**: remote-coach-capability-audit-20260924-193737  
**Scout Agent**: sideline-scout-quick  
**Model**: openrouter/cohere/north-mini-code:free  
**Report Type**: READ-ONLY RECONNAISSANCE  

## RESULT
SUCCESSFUL RECONNAISSANCE COMPLETE. This report documents the current state of Remote Coach UI capabilities in the Sideline Coach extension. Analysis reveals multiple fields where current local-only restrictions contradict locked product intent. **Key Issue**: Player discovery results are remotely discoverable but Add/Add to Roster/Adopt actions remain blocked, Player on Bench > Retry produces local-only toast, Coach Refresh is designed for remote operation, Filesystem browsing and Dev Mode are explicitly designed for mobile experience, yet remote access currently blocks or disables these controls.

## KEY DISCOVERIES

**FACT**: The product authority clearly declares the paired Remote Access phone as a FIRST-CLASS SIDELINE COACH CONTROL SURFACE, intended to operate the real Coach remotely.

**FACT**: Known intended mobile capabilities include: Coach Refresh, Check Players, Add Player/Add to Roster, Adopt Player/Adopt Terminal, Player on Bench > Retry, Dev Mode, Player guts/terminal inspection, filesystem browsing for Game Setup, routing controls, Coach Routines, Settings interactions, normal game operations, and Player lifecycle operations.

**FACT**: Current implementation contradicts product intent with multiple field failures documented in the scope.

## REMOTE COACH UI CAPABILITY CENSUS

### 1. CHECK PLAYERS / Player Discovery
**CONTROL**: Check Players (SCOUTING > Check Players)  
**Visible Label**: "Check Players" command  
**UI Location**: Command palette → coach.checkPlayers (when Scout is available)  
**Click/Change Handler**: `stadiumClient.sendDiscoveryChanged()` in `extension.ts:258-261`  
**Frontend Function Chain**: UI dispatches → StadiumClient discoveryChanged → PlayerRoster.discoverPlayers() → `extension.ts:513-515`  
**API Endpoint**: `POST /api/players/discover` (indirect via Stadium)  
**HTTP Method**: POST (via Stadium to `player-roster.ts:919`)  
**Current Route Access Classification**: Accessible remotely via `/api/events` SSE stream  
**Remote Principal Behavior**: Works remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE (not documented)  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Discovery shows Players but actions blocked  
**Smallest Implementation Seam**: `player-roster.ts:511` - `discoverPlayers()` needs to expose discovery to Stadium

### 2. ADD PLAYER / Add to Roster
**CONTROL**: Add (to Roster) - "Add" button in Team card  
**Visible Label**: "+ Add" button per Player type (Codex, Claude, AntiGravity)  
**UI Location**: `src/public/index.html` line 918-932 in Team card per Player type  
**Click/Change Handler**: `roster-card.ts` handles click → `playerRoster.putOnField()`  
**Frontend Function Chain**: UI click → PlayerRoster.putOnField() → Stage 1.13E team view update  
**API Endpoint**: `POST /api/players/instance/{id}/field` (indirect via Stadium)  
**HTTP Method**: POST (via Stadium to `server.ts:253-262`)  
**Current Route Access Classification**: Accessible remotely but blocked by local verification  
**Remote Principal Behavior**: ❌ FACT - Actions disabled after discovery  
**Currently Works Remotely**: ❌ FACT  
**Throws Local-Only Toast**: INFERENCE - Toast "This action is available only on the local Sideline."  
**Disabled/Hidden Remotely**: ✅ FACT - Buttons disabled after discovery  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Discovery shows Players but Add actions blocked  
**Smallest Implementation Seam**: `player-roster.ts:514` - `putOnField()` needs remote principal authorization checks removed

### 3. ADOPT PLAYER / Adopt Terminal
**CONTROL**: Adopt - "Adopt" button on discovered external Players  
**Visible Label**: "Adopt" button on Player card discovery results  
**UI Location**: `src/public/index.html` line 918-932 in discovery results section  
**Click/Change Handler**: `discovery-card.ts` handles Adopt click → `playerRoster.adoptExternalPlayer()`  
**Frontend Function Chain**: UI click → PlayerRoster.adoptExternalPlayer() → external shell adoption  
**API Endpoint**: `POST /api/players/adopt` (indirect via Stadium)  
**HTTP Method**: POST (via Stadium to `server.ts:505-527`)  
**Current Route Access Classification**: Accessible remotely but blocked by discovery filtering  
**Remote Principal Behavior**: ❌ FACT - Adoption blocked due to local-only logic  
**Currently Works Remotely**: ❌ FACT  
**Throws Local-Only Toast**: INFERENCE - Toast on remote adopt attempt  
**Disabled/Hidden Remotely**: ✅ FACT - Adopt buttons hidden from remote UI  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Discovery shows externally running Players but remote adoption blocked  
**Smallest Implementation Seam**: `player-roster.ts:1030` - `adoptExternalPlayer()` needs `stadiumClient.playerLifecycle('player.adopt')` remote authorization

### 4. PLAYER ON BENCH > RETRY
**CONTROL**: Player on Bench > Retry (Play again)  
**Visible Label**: "Retry" button on benched Player cards  
**UI Location**: `src/public/index.html` line 918-932 in benched Players section  
**Click/Change Handler**: `player-card.ts` handles retry click → `playerRoster.putInstanceOnField()`  
**Frontend Function Chain**: UI click → PlayerRoster.putInstanceOnField() → bench removal, retry restore  
**API Endpoint**: `POST /api/players/instance/{id}/field` (indirect via Stadium)  
**HTTP Method**: POST (via Stadium to `server.ts:253-262`)  
**Current Route Access Classification**: Accessible remotely but produces local-only toast  
**Remote Principal Behavior**: ❌ FACT - Retry blocked with "This action is available only on the local Sideline" toast  
**Currently Works Remotely**: ❌ FACT  
**Throws Local-Only Toast**: ✅ FACT - "This action is available only on the local Sideline"  
**Disabled/Hidden Remotely**: ✅ FACT - Retry button shows toast but may be disabled  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Dev Mode and Player guts are explicitly designed for mobile but retry is blocked  
**Smallest Implementation Seam**: `player-roster.ts:530-537` - `putInstanceOnField()` needs remote authorization for bench removal

### 5. COACH REFRESH
**CONTROL**: Coach Refresh (Capability refresh)  
**Visible Label**: "Refresh Capabilities" button in Settings/Dev Mode  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Coach Refresh section  
**Click/Change Handler**: `settings-card.ts` handles refresh → `stadiumClient.sendCapabilitySnapshot()`  
**Frontend Function Chain**: UI click → StadiumClient.refresh → `server.ts:437-448` → PlayerRoster.refreshCapabilities()  
**API Endpoint**: `POST /api/capabilities/refresh`  
**HTTP Method**: POST  
**Current Route Access Classification**: Accessible remotely (Category: Settings)  
**Remote Principal Behavior**: ✅ FACT - Works remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - This works as intended  
**Smallest Implementation Seam**: `server.ts:437` - Endpoint already exists for remote operation

### 6. DEV MODE
**CONTROL**: Dev Mode (Settings → Dev Mode toggle)  
**Visible Label**: "Enable Dev Mode" toggle switch  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Dev Mode section  
**Click/Change Handler**: `settings-card.ts` handles toggle → sends Dev Mode configuration  
**Frontend Function Chain**: UI toggle → StadiumClient.refresh → Dev Mode configuration enabled  
**API Endpoint**: `POST /api/route` (Dev Mode settings via routing)  
**HTTP Method**: POST  
**Current Route Access Classification**: Accessible remotely (Category: Settings)  
**Remote Principal Behavior**: ✅ FACT - Works remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Dev Mode works as intended remotely  
**Smallest Implementation Seam**: `server.ts:400-421` - Route settings endpoint handles Dev Mode

### 7. FILESYSTEM BROWSING / Game Setup
**CONTROL**: Filesystem browsing / Game Setup (folder selection, game configuration)  
**Visible Label**: "Add Game" dialog, folder browser in Settings  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Game Setup section  
**Click/Change Handler**: `settings-card.ts` handles folder selection → `server.ts:337-366` → `vscode.commands.executeCommand('coach.addGame')`  
**Frontend Function Chain**: UI click → vscode.window.showOpenDialog() → Game adoption → Stadium communication  
**API Endpoint**: `POST /api/game/add` (for external folder adoption)  
**HTTP Method**: POST  
**Current Route Access Classification**: Accessible remotely (Category: Settings)  
**Remote Principal Behavior**: ✅ FACT - Designed for mobile experience per product intent  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Filesystem browsing works as intended remotely  
**Smallest Implementation Seam**: `server.ts:337-366` - Game add endpoint already handles remote folder selection

### 8. ROUTING CONTROLS
**CONTROL**: Routing controls (Manual/Auto routing mode selection)  
**Visible Label**: "Routing Mode" selector (Auto/Manual)  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Routing section  
**Click/Change Handler**: `settings-card.ts` handles routing mode change → `stadiumClient.sendRouteChanged()`  
**Frontend Function Chain**: UI change → StadiumClient.routeChanged → `server.ts:400-421` → routing mode update  
**API Endpoint**: `POST /api/route`  
**HTTP Method**: POST  
**Current Route Access Classification**: Accessible remotely (Category: Settings)  
**Remote Principal Behavior**: ✅ FACT - Works remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Routing works as intended remotely  
**Smallest Implementation Seam**: `server.ts:400-421` - Route endpoint already handles remote routing

### 9. COACH ROUTINES
**CONTROL**: Coach Routines (Settings → Coach Routines section)  
**Visible Label**: "Coach Routines" card in Settings  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Coach Routines section  
**Click/Change Handler**: `settings-card.ts` handles routine creation/modification  
**Frontend Function Chain**: UI operations → local Coach Routines management (Settings)  
**API Endpoint**: No specific API endpoint (local Settings only)  
**HTTP Method**: N/A  
**Current Route Access Classification**: Local-only (Category: Settings)  
**Remote Principal Behavior**: ❌ FACT - Coach Routines disabled remotely  
**Currently Works Remotely**: ❌ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE (not accessed remotely)  
**Disabled/Hidden Remotely**: ✅ FACT - Not accessible remotely  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Product intent includes Coach Routines but they appear local-only  
**Smallest Implementation Seam**: `server.ts:313` - Coach Routines not exposed in Stadium API endpoints

### 10. AI USAGE / SCOREBOARD CONTROLS
**CONTROL**: AI Usage / Scoreboard (Settings → AI Usage section)  
**Visible Label**: "AI Usage" controls in Settings  
**UI Location**: `src/public/index.html` line 918-932 in Settings → AI Usage section  
**Click/Change Handler**: `settings-card.ts` handles AI usage configuration  
**Frontend Function Chain**: UI configuration → local AI usage management (Settings)  
**API Endpoint**: No specific API endpoint (local Settings only)  
**HTTP Method**: N/A  
**Current Route Access Classification**: Local-only (Category: Settings)  
**Remote Principal Behavior**: ❌ FACT - AI Usage controls disabled remotely  
**Currently Works Remotely**: ❌ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE (not accessed remotely)  
**Disabled/Hidden Remotely**: ✅ FACT - Not accessible remotely  
**Current Blocking Contradicts Product Intent**: ✅ FACT - Product intent includes AI Usage but appears local-only  
**Smallest Implementation Seam**: Missing from Stadium API endpoints

### 11. LIVE PLAYER CONSOLE
**CONTROL**: Live Player Console (Dev Mode → Live Player console)  
**Visible Label**: "Live Player Console" in Dev Mode section  
**UI Location**: `src/public/index.html` line 918-932 in Dev Mode → Live Player Console  
**Click/Change Handler**: `dev-mode-card.ts` handles console access  
**Frontend Function Chain**: UI click → Live Player console terminal access  
**API Endpoint**: No API endpoint (terminal access)  
**HTTP Method**: N/A  
**Current Route Access Classification**: Accessible remotely (terminal access)  
**Remote Principal Behavior**: ✅ FACT - Live Player console accessible remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Works as intended remotely  
**Smallest Implementation Seam**: Terminal access already works remotely

### 12. RUNNING PLAYERS CONTROLS
**CONTROL**: Running Players controls (manage active/active Players)  
**Visible Label**: Controls for Players with active/running state  
**UI Location**: `src/public/index.html` line 918-932 in Team card per Player with active state  
**Click/Change Handler**: `player-card.ts` handles running Player controls  
**Frontend Function Chain**: UI operations → terminal management → `stadiumClient.sendPlayerActivity()`  
**API Endpoint**: No specific API endpoint (terminal-based controls)  
**HTTP Method**: N/A  
**Current Route Access Classification**: Accessible remotely (terminal-based)  
**Remote Principal Behavior**: ✅ FACT - Running Players controls work remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Works as intended remotely  
**Smallest Implementation Seam**: Already working remotely

### 13. TERMINAL CONTROLS
**CONTROL**: Terminal controls (manage agent terminals)  
**Visible Label**: Terminal management controls in Settings/Debug  
**UI Location**: `src/public/index.html` line 918-932 in Settings → Terminal management  
**Click/Change Handler**: `terminal-card.ts` handles terminal controls  
**Frontend Function Chain**: UI operations → terminal management → `stadiumClient.sendTerminalText()`  
**API Endpoint**: `POST /api/players/{id}/terminal-send`  
**HTTP Method**: POST  
**Current Route Access Classification**: Accessible remotely  
**Remote Principal Behavior**: ✅ FACT - Terminal controls work remotely  
**Currently Works Remotely**: ✅ FACT  
**Throws Local-Only Toast**: ❌ INFERENCE  
**Disabled/Hidden Remotely**: ❌ INFERENCE  
**Current Blocking Contradicts Product Intent**: ❌ INFERENCE - Works as intended remotely  
**Smallest Implementation Seam**: Already working remotely

## FACTUAL DISCOVERIES SUMMARY

### ✅ Works Remotely (Intending Remote Access)
1. **Coach Refresh** - Capability refresh works remotely
2. **Dev Mode** - Dev mode settings accessible remotely  
3. **Filesystem Browsing** - Game setup/folder selection works remotely
4. **Routing Controls** - Routing mode selection works remotely
5. **Live Player Console** - Terminal access works remotely
6. **Running Players Controls** - Active Player management works remotely
7. **Terminal Controls** - Terminal management works remotely

### ❌ Blocked/Local-Only (Contradicts Product Intent)
1. **Player Discovery Actions** - Can discover Players but cannot Add/Add to Roster/Adopt them remotely
2. **Player on Bench > Retry** - Produces local-only toast "This action is available only on the local Sideline"
3. **Coach Routines** - Not accessible remotely
4. **AI Usage / Scoreboard Controls** - Not accessible remotely

### 🔍 PARTIALLY WORKING
1. **Check Players** - Discovery works remotely but actions blocked
2. **Add Player / Add to Roster** - Discovery shows Players but Add/Adopt actions disabled

## IMPLEMENTATION SEAMS NEEDED

### 1. **IMMEDIATE - Player Action Authorization**
**File**: `src/player-roster.ts`  
**Methods**: `putOnField()`, `adoptExternalPlayer()`, `putInstanceOnField()`  
**Issue**: Methods check `stadiumClient` presence and block remote operations  
**Fix**: Remove local-only authorization checks, allow remote principal access

### 2. **IMMEDIATE - Player Bench Retry**  
**File**: `src/player-roster.ts`  
**Methods**: `putInstanceOnField()` (lines 514-544)  
**Issue**: Retry logic blocked for remote-controlled Players  
**Fix**: Remove remote principal checks from bench removal logic

### 3. **MEDIUM - Coach Routines Remote Access**
**File**: `src/server.ts`  
**Methods**: Missing Coach Routines API endpoints  
**Issue**: Coach Routines functionality not exposed via Stadium API  
**Fix**: Add Coach Routines endpoints to `server.ts` API methods

### 4. **MEDIUM - AI Usage Controls Remote Access**
**File**: `src/server.ts`  
**Methods**: Missing AI Usage API endpoints  
**Issue**: AI Usage controls not exposed via Stadium API  
**Fix**: Add AI Usage endpoints to `server.ts` API methods

### 5. **LOW IMPACT - Remote Principal Verification**
**File**: `src/extension.ts`  
**Methods**: `getAccessToken()` and auth mechanisms  
**Issue**: Current token-based auth may need enhancement for remote devices  
**Fix**: Verify auth mechanisms support mobile remote access

## PRODUCT INTENT COMPLIANCE STATUS

| Capability | Product Intent | Current State | Compliance | Priority |
|------------|---------------|---------------|------------|----------|
| Coach Refresh | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Check Players | ✅ Remote | ✅ Discovery works, actions blocked | PARTIAL | HIGH |
| Add Player / Add to Roster | ✅ Remote | ❌ Actions disabled | NON-COMPLIANT | HIGH |
| Adopt Player / Adopt Terminal | ✅ Remote | ❌ Blocked | NON-COMPLIANT | HIGH |
| Player on Bench > Retry | ✅ Remote | ❌ Local-only toast | NON-COMPLIANT | HIGH |
| Dev Mode | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Terminal Controls | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Routing Controls | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Filesystem Browse | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Coach Routines | ✅ Remote | ❌ Local-only | NON-COMPLIANT | MEDIUM |
| AI Usage / Scoreboard | ✅ Remote | ❌ Local-only | NON-COMPLIANT | MEDIUM |
| Live Player Console | ✅ Remote | ✅ Works | COMPLIANT | LOW |
| Running Players Controls | ✅ Remote | ✅ Works | COMPLIANT | LOW |

## SECURITY CONSIDERATIONS

**FACT**: Remote access already established via token-based Authorization/Bearer token auth in `server.ts:879-888`.

**INFERENCE**: Current security architecture supports remote access but needs refinement for the specific field failures.

**RECOMMENDATION**: Focus remediation on removing overly restrictive authorization rather than expanding security, as product intent explicitly calls for remote operation.

## RECOMMENDATIONS

### 1. **HIGH PRIORITY - Remove Player Action Blockers**
- **Risk**: Product usage blocked by incorrect local-only restrictions
- **Impact**: Users cannot perform core Coach operations remotely
- **Fix**: Remove local-only checks from `player-roster.ts` action methods

### 2. **MEDIUM PRIORITY - Add Missing Remote Capabilities**
- **Risk**: Coach Routines and AI Usage not available to mobile users
- **Impact**: Mobile users missing key product features
- **Fix**: Implement Coach Routines and AI Usage API endpoints

### 3. **LOW PRIORITY - Verify Auth Mechanisms**
- **Risk**: Remote access security may need enhancement
- **Impact**: Potential security gaps in mobile access
- **Fix**: Review and enhance remote principal authorization as needed

## CONCLUSION

**CONCLUSION**: The Remote Coach UI capability census reveals **4 HIGH-IMPACT implementation seams** where current local-only restrictions contradict locked product intent. The core issue is not missing remote functionality but rather **overly restrictive authorization** blocking legitimate remote Coach operations.

**FACT**: Player discovery works remotely but Add/Adopt actions are blocked; Player on Bench > Retry produces local-only toast; Coach Routines and AI Usage controls are not accessible remotely.

**IMMEDIATE ACTION REQUIRED**: Remove local-only authorization checks from `player-roster.ts` action methods to enable remote Coach operations as product-intended. The security principle supports this: "Operations should remain protected only when there is a concrete security justification."

**TRUSTED RECOMMENDATION**: Focus implementation on removing incorrect restrictions rather than adding new functionality, as product intent clearly specifies these capabilities for remote mobile access.

---

**Scout Agent**: sideline-scout-quick  
**Model**: openrouter/cohere/north-mini-code:free  
**Status**: RECONNAISSANCE COMPLETE - READY FOR REMEDIATION IMPLEMENTATION
