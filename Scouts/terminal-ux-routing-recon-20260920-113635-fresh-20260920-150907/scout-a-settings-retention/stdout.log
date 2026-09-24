# SCOUT REPORT — READ-ONLY RECONNAISSANCE

**REPORT TYPE:** SCOUT REPORT  
**SCOUT AGENT:** Cohere North Mini Code Free  
**SCOUT MODEL:** cohere/north-mini-code:free  
**SCOUT ROLE:** Read-Only Reconnaissance Scout  
**SCOUT SCOPE:** Terminal UX, retention, settings, Dev Mode gating, AUTO routing, and evidence retention configuration as described in the bounded objective  
**RECONNAISSANCE DEPTH:** Standard  
**SCOUT DATE/TIMESTAMP:** 2026-09-20

This report is reconnaissance, not final architectural authority.

---

## EXECUTIVE MAP

Investigating the Terminal Play bounded objective focusing on:
- Dev Mode and View Player Terminal settings architecture
- consolePinnedByInstance and Expand/Collapse lifecycle
- Configurable evidence retention (manual Collapse, Copy, next Play, report discovery, full history, post-completion duration)
- Advanced Player Discovery Dev Mode-only gating
- AUTO routing for terminal-only intent
- Clean ownership boundaries for retention configuration

---

## QUESTION INVESTIGATED

Map Dev Mode and View Player Terminal settings; Advanced Player Discovery must be Dev Mode-only, default OFF, hide developer discoveries without destroying underlying discovery truth; map configurable Terminal evidence retention including manual Collapse, Copy, next Play, report discovery, full history, and user-selected post-completion duration; Read is not dismissal and Copy is not inherently dismissal; map future AUTO routing for unambiguously terminal-only intent while reasoning prompts remain AI work; explicit human routing always wins and Terminal command safety remains authoritative.

---

## CURRENT TRUTH

**FACT 1:** The repository contains a comprehensive Scout SOP (`Sideline-Coach-Free-Scout-Selection-and-Invocation-SOP.md`) that provides the operating manual for reconnaissance tasks.

**FACT 2:** Dev Mode settings exist in `src/running-players.ts`:
- `CoachPreferences` interface with `devMode: boolean` and `livePlayerConsole: boolean`
- Default preferences: `{ runningPlayers: 'ask', devMode: false, livePlayerConsole: false }`
- Load/save functions for persistent preferences

**FACT 3:** Terminal settings are implemented in `src/player-roster.ts`:
- `adoptableTerminals()` method scans for unmanaged VS Code terminals
- `adoptTerminal()` explicitly adopts human-owned terminals
- `sendToProviderTerminal()` handles provider Player communication

**FACT 4:** AUTO routing in `src/routing-policy.ts` explicitly excludes Terminal Players:
- Lines 330-332: `candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell'`
- Lines 334-337: Special handling for terminal-only intent with explicit error message

**FACT 5:** consolePinnedByInstance exists in `src/public/index.html` (line 2208) as part of post-play retention logic.

**FACT 6:** Advanced Player Discovery does NOT currently exist:
- S51 report contradicts earlier Scout findings about a line ~1969 in `daemon.ts`
- The discovery is planned but not implemented; `devMode` and `livePlayerConsole` are the current gates

---

## EVIDENCE MAP

### Dev Mode Settings
**File:** `src/running-players.ts`
- Line 18-29: `CoachPreferences` interface definition
- Line 31: `DEFAULT_PREFERENCES` with both `devMode` and `livePlayerConsole` default `false`
- Line 44-55: `loadPreferences()` and `savePreferences()` functions
- Line 70-77: `projectDiscovery()` filters external candidates when preference is `'ignore'`

**FACT 7:** Dev Mode is a boolean flag; Live Player Console is a separate boolean flag that requires Dev Mode to be enabled.

### Advanced Player Discovery
**File:** `src/control-plane/daemon.ts` line 1969
- Currently gates Scout Formation execution behind `!this.getPreferences().devMode`
- S51 report states Advanced Player Discovery does NOT exist - this is a planned breadcrumb

**FACT 8:** Advanced Player Discovery is not implemented; the current gates are `devMode && livePlayerConsole` in `daemon.ts` line 2892.

### Terminal Settings
**File:** `src/player-roster.ts` line 826-834
```typescript
async adoptableTerminals(excludeShellPids: ReadonlySet<number>): Promise<Array<{ terminalName: string; shellPid: number }>> {
  const list: Array<{ terminalName: string; shellPid: number }> = []
  for (const terminal of vscode.window.terminals) {
    if (this.closed.has(terminal) || this.instanceByTerminal.has(terminal) || ... ) continue
    const pid = await this.terminalPid(terminal)
    if (!pid || excludeShellPids.has(pid)) continue
    list.push({ terminalName: terminal.name, shellPid: pid })
  }
  return list
}
```
**FACT 9:** `adoptableTerminals` scans all VS Code terminals for human-owned shells and injects them into recruit catalog unless explicitly filtered.

### Retention Lifecycle
**File:** `src/public/index.html` line 2207-2208
```typescript
const consoleExpandedByInstance = new Set(); // exact instanceIds only
const consolePinnedByInstance = new Set(); // post-play retained instanceIds
```
**FACT 10:** Both `consoleExpandedByInstance` and `consolePinnedByInstance` track terminal states for retention.

### Copy Behavior
**File:** `src/public/index.html` line 2416-2444
```typescript
const copyConsole = async (instanceId, mode, button) => {
  // ... copy logic ...
  if (currentView && currentView.state === 'finished') {
    consolePinnedByInstance.delete(instanceId);
    consoleExpandedByInstance.delete(instanceId);
    // ... additional cleanup
  }
};
```
**FACT 11:** Copy All/New currently deletes both `consolePinnedByInstance` and `consoleExpandedByInstance` when the play is finished, which acts as dismissal.

---

## RELEVANT FILES / SYMBOLS / OWNERSHIP SEAMS

### Primary Files to Investigate
1. **`src/running-players.ts`** - Preferences data model and discovery filtering
2. **`src/control-plane/daemon.ts`** - Daemon preferences endpoint and gating logic  
3. **`src/public/index.html`** - Browser UI settings, copy logic, strip render, expand/pin state, recruit rendering
4. **`src/player-roster.ts`** - Terminal completion event, open shell discovery, terminal adoption
5. **`src/terminal-player.ts`** - Command validation guard, exit code mapping, sentinel definition
6. **`src/routing-policy.ts`** - AUTO routing policy and Terminal exclusion logic
7. **`test/p0-1-terminal-player.test.mjs`** - Proof that Terminal Player is excluded from AUTO

### Key Seams
- **Preference Seam:** `CoachPreferences` in `running-players.ts`
- **Discovery Seam:** `adoptableTerminals` and `projectDiscovery` in `player-roster.ts`
- **Retention Seam:** `consolePinnedByInstance` and `copyConsole` in `index.html`
- **Routing Seam:** `computeAutoRoute` in `routing-policy.ts`

---

## EXECUTION / DATA FLOW

1. **Preference Load/Save:** `loadPreferences()` → JSON file at `<userDataDir>/preferences.json`
2. **Discovery:** `discoverPlayers()` → `StadiumPlayerDiscovery` with `adoptableTerminals`
3. **UI Projection:** `projectDiscovery()` → filtered based on `RunningPlayersPreference`
4. **Copy/Release:** `copyConsole()` → deletes pins and collapses on completion
5. **AUTO Routing:** `computeAutoRoute()` → excludes terminal players explicitly

---

## FACTS

1. **Dev Mode Gate:** `livePlayerTerminalEnabled()` in `daemon.ts` line 2892 returns `Boolean(preferences.devMode && preferences.livePlayerConsole)`

2. **Terminal-only Intent:** `checkTerminalCommand()` in `terminal-player.ts` lines 39-57 rejects natural language but allows valid shell commands

3. **Fast Command Blip:** `stripCopy()` in `index.html` line 2604-2617 returns `null` for `couldnt-finish` and `unknown` states for non-Scout Players

4. **Retain Ownership:** `consolePinnedByInstance` is set at line 2777 when `view.state === 'finished'` and the terminal was expanded

5. **Copy Dismissal:** Copy All/New dismisses at line 2438-2439 when `currentView.state === 'finished'`

---

## INFERENCES

1. **Operators expect auto-expansion:** Users expect terminal commands to show output by default without manually clicking Expand during fast execution (< 1s)

2. **Copy should not dismiss:** Copy All should copy text to clipboard without collapsing the view unless explicit "Dismiss on Copy" is enabled

3. **Discovery filtering needed:** Raw OS shells (powershell, node, bash) should be hidden from Dad mode unless Dev Mode + Advanced Player Discovery is enabled

4. **AUTO terminal routing future:** `git status` and similar commands should run on Terminal when Terminal is the only Player on field

---

## UNKNOWNS

1. **Auto-expand preference:** User preference for whether terminal plays auto-expand on dispatch or remain collapsed

2. **Command syntax boundary:** Exact shell syntax classification for AUTO routing (what qualifies as "unambiguous terminal-only intent")

---

## CONTRADICTIONS

1. **Advanced Player Discovery:** 
   - Laguna Scout B claims line ~1969 in `daemon.ts` gates Advanced Player Discovery
   - S51 report states Advanced Player Discovery does NOT exist - line 1969 gates Scout Formation execution
   - This is a planned breadcrumb, not current implementation

2. **AUTO Terminal Routing:**
   - Laguna Scout B claims Q2.9C auto-selects Terminal Players for terminal-only intent
   - S51 report states `routing-policy.ts:330-338` explicitly rejects all terminal players
   - Current reality: Terminal Players are hard-excluded from AUTO

---

## ARCHITECTURE DECISIONS STILL REQUIRED

1. **Advanced Player Discovery:** Add `advancedPlayerDiscovery: boolean` to `CoachPreferences` (Dev Mode-only, default `false`)

2. **Retention Policy:** Implement `terminalRetentionPolicy` enum with options (Manual Collapse, Next Play, Duration Timer, Successful Copy, Full History)

3. **AUTO Intent Classification:** Implement `isUnambiguousShellCommand()` classifier for terminal-only intent detection

4. **Auto-expansion Preference:** Optional auto-expand behavior when Terminal Player is dispatched

---

## WHAT DOES NOT NEED ARCHITECTURE

1. **Current Dev Mode Gates:** `devMode && livePlayerConsole` already serve as the presentation gate
2. **Existing Retention Logic:** `consolePinnedByInstance` and `consoleExpandedByInstance` already provide post-play retention
3. **Current AUTO Exclusion:** Terminal Players are already excluded from AUTO routing

---

## RISKS / BOUNDARIES

1. **Command Injection Risk:** AUTO routing classifier must be conservative to avoid executing natural language as shell commands

2. **State Falsification Risk:** Retention logic must not keep `view.state === 'working'` for completed commands

3. **Memory Leaks:** "Until manual collapse" retention could accumulate stale terminal bodies

4. **Boundary Ownership:** Retention policy belongs in browser (`index.html`), execution truth in daemon (`daemon.ts`)

---

## RECOMMENDED NEXT AGENT / MODEL / EFFORT

**Play 1:** Dad-Safe Discovery (Smallest, zero-risk, cleans up recruit catalog)
- Add `advancedPlayerDiscovery` to `CoachPreferences`
- Gate `adoptableTerminals` behind `devMode && advancedPlayerDiscovery`
- Update recruit UI to hide raw developer shells

**Play 2:** Terminal Evidence Retention & Blip Fix (Solves primary usability defect)
- Ensure `couldnt-finish` for Terminal Player displays human-readable failure
- Decouple `copyConsole` from automatic dismissal
- Fix fast-command blip with proper pinning logic

**Play 3:** AUTO Terminal-Only Routing (Expands routing capability with high safety bar)
- Implement `isUnambiguousShellCommand()` classifier
- Update `computeAutoRoute` to allow eligible Terminal Players
- Maintain fallback to reasoning models

---

## WHAT THE FUTURE ARCHITECT SHOULD VERIFY

1. **Preference Integration:** Verify `advancedPlayerDiscovery` is Dev Mode-gated and defaults to `false`

2. **Discovery Truth:** Confirm `adoptableTerminals` continues to run; only client projection is gated

3. **Retention Implementation:** Verify new policies work with existing `consolePinnedByInstance` logic

4. **Copy Behavior:** Ensure Copy All/New no longer automatically dismisses terminal view

---

## WHAT THE FUTURE ARCHITECT SHOULD NOT NEED TO REDISCOVER

1. **Current Dev Mode Gates:** `devMode && livePlayerConsole` already provide presentation control

2. **Existing Retention Infrastructure:** `consolePinnedByInstance` and `consoleExpandedByInstance` already handle post-play retention

3. **Current AUTO Exclusion:** Terminal Players are already excluded from AUTO routing

4. **Command Safety:** `checkTerminalCommand()` already provides shell command validation

---

## WAS / IS / WILL BE

### Terminal Evidence Retention
- **WAS:** No configurable retention policy; manual Collapse only
- **IS:** Fixed 30-second rich execution window + auto-pinning for expanded terminals
- **WILL BE:** Configurable policies (Manual Collapse, Next Play, Duration Timer, Successful Copy, Full History)

### Copy Behavior
- **WAS:** Copy All/New copies text but also dismisses terminal view
- **IS:** Copy All/New copies text and dismisses on finished plays
- **WILL BE:** Copy All/New copies text only; dismissal requires explicit preference

### Advanced Player Discovery  
- **WAS:** No Advanced Player Discovery
- **IS:** No Advanced Player Discovery (planned breadcrumb at line ~1969 in `daemon.ts`)
- **WILL BE:** Dev Mode-only `advancedPlayerDiscovery` preference to hide raw developer shells

### AUTO Terminal Routing
- **WAS:** Terminal Players hard-excluded from AUTO
- **IS:** Terminal Players hard-excluded from AUTO (lines 330-332, 334-337 in `routing-policy.ts`)
- **WILL BE:** AUTO may route unambiguous shell commands to eligible Terminal Players

---

## SCOUT LIMITATIONS

1. **Report Encoding Issue:** Previous Scout reports used UTF-16LE terminal captures instead of clean UTF-8 Markdown (S51 report)

2. **API Absence Claims:** Quick Scouts (North Mini Code) may report "this API does not exist" without verifying type definitions

3. **Capability Absences:** Must verify "this capability is impossible" claims against actual type definitions before accepting

---

**SCOUT CONCLUSION:** The bounded objective reveals a clear architecture path:
1. Add `advancedPlayerDiscovery` preference for controlled shell visibility
2. Fix retention policies to respect user intent (Copy should not dismiss)
3. Implement conservative AUTO terminal routing classifier
4. Preserve existing ownership boundaries (preferences in browser, execution truth in daemon)

The work is split into 4 cleanly separable implementation plays with minimal dependencies and clear boundaries.
