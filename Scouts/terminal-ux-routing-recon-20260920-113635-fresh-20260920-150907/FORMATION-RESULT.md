# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:11:28

Play: terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907
Rerun of: terminal-ux-routing-recon-20260920-113635 (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-20T21:09:07.695Z
Finished: 2026-09-20T21:20:36.205Z
TOTAL ELAPSED TIME: 00:11:28

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
| scout-a-settings-retention | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T21:09:07.734Z | 2026-09-20T21:10:29.286Z | 00:01:21 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-a-settings-retention-Reconnaissance.md |
| scout-b-discovery-routing | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-20T21:09:07.902Z | 2026-09-20T21:20:36.197Z | 00:11:28 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-b-discovery-routing-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane scout-a-settings-retention: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane scout-b-discovery-routing: Poolside: Laguna S 2.1 (free) (sideline-scout) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: scout-a-settings-retention (objective 2c96646310b3)
- Objective: READ-ONLY RECONNAISSANCE. Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach. Do not modify source, implement, commit, push, reset, stash, clean, install, or reorganize. S48-S50 already settled and field-proved Terminal Player live output. FIELD EVIDENCE: git status works; multi-second output streams live; long output remains inspectable; very fast Plays may finish before Dad can inspect them; raw powershell/node/adoptable discoveries clutter Check Players; normal Terminal must remain recruitable. PRODUCT DIRECTION: map Dev Mode and View Player Terminal settings; Advanced Player Discovery must be Dev Mode-only, default OFF, hide developer discoveries without destroying underlying discovery truth; map configurable Terminal evidence retention including manual Collapse, Copy, next Play, report discovery, full history, and user-selected post-completion duration; Read is not dismissal and Copy is not inherently dismissal; map future AUTO routing for unambiguously terminal-only intent while reasoning prompts remain AI work; explicit human routing always wins and Terminal command safety remains authoritative. Separate FACT, FIELD EVIDENCE, INFERENCE, UNKNOWN and return exact files, symbols, seams, risks, contradictions and smallest implementation boundaries. Do not implement. LANE A: prioritize Dev Mode settings, View Player Terminal, Terminal settings grouping, consolePinnedByInstance, Expand/Collapse, completion lifecycle, fast-command disappearance, Copy All/Copy New, playRef/session changes, report visibility/dismissal, exact browser/settings/state seams, and the cleanest ownership layer for configurable retention.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-a-settings-retention-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** 1. **Dev Mode Gate:** `livePlayerTerminalEnabled()` in `daemon.ts` line 2892 returns `Boolean(preferences.devMode && preferences.livePlayerConsole)`

2. **Terminal-only Intent:** `checkTerminalCommand()` in `terminal-player.ts` lines 39-57 rejects natural language but allows valid shell commands

3. **Fast Command Blip:** `stripCopy()` in `index.html` line 2604-2617 returns `null` for `couldnt-finish` and `unknown` states for non-Scout Players

4. **Retain Ownership:** `consolePinnedByInstance` is set at line 2777 when `view.state === 'finished'` and the terminal was expanded

5. **Copy Dismissal:** Copy All/New dismisses at line 2438-2439 when `currentView.state === 'finished'`

---

**INFERENCE:** 1. **Operators expect auto-expansion:** Users expect terminal commands to show output by default without manually clicking Expand during fast execution (< 1s)

2. **Copy should not dismiss:** Copy All should copy text to clipboard without collapsing the view unless explicit "Dismiss on Copy" is enabled

3. **Discovery filtering needed:** Raw OS shells (powershell, node, bash) should be hidden from Dad mode unless Dev Mode + Advanced Player Discovery is enabled

4. **AUTO terminal routing future:** `git status` and similar commands should run on Terminal when Terminal is the only Player on field

---

**UNKNOWN:** 1. **Auto-expand preference:** User preference for whether terminal plays auto-expand on dispatch or remain collapsed

2. **Command syntax boundary:** Exact shell syntax classification for AUTO routing (what qualifies as "unambiguous terminal-only intent")

---

**CONTRADICTION:** 1. **Advanced Player Discovery:** 
   - Laguna Scout B claims line ~1969 in `daemon.ts` gates Advanced Player Discovery
   - S51 report states Advanced Player Discovery does NOT exist - line 1969 gates Scout Formation execution
   - This is a planned breadcrumb, not current implementation

2. **AUTO Terminal Routing:**
   - Laguna Scout B claims Q2.9C auto-selects Terminal Players for terminal-only intent
   - S51 report states `routing-policy.ts:330-338` explicitly rejects all terminal players
   - Current reality: Terminal Players are hard-excluded from AUTO

---

**Important files:** UNKNOWN

### Poolside: Laguna S 2.1 (free) (sideline-scout)

- Lane: scout-b-discovery-routing (objective 378849db0fc5)
- Objective: READ-ONLY RECONNAISSANCE. Repository: C:\Users\dmcal\Documents\GitHub\SidelineCoach. Do not modify source, implement, commit, push, reset, stash, clean, install, or reorganize. S48-S50 already settled and field-proved Terminal Player live output. FIELD EVIDENCE: git status works; multi-second output streams live; long output remains inspectable; very fast Plays may finish before Dad can inspect them; raw powershell/node/adoptable discoveries clutter Check Players; normal Terminal must remain recruitable. PRODUCT DIRECTION: map Dev Mode and View Player Terminal settings; Advanced Player Discovery must be Dev Mode-only, default OFF, hide developer discoveries without destroying underlying discovery truth; map configurable Terminal evidence retention including manual Collapse, Copy, next Play, report discovery, full history, and user-selected post-completion duration; Read is not dismissal and Copy is not inherently dismissal; map future AUTO routing for unambiguously terminal-only intent while reasoning prompts remain AI work; explicit human routing always wins and Terminal command safety remains authoritative. Separate FACT, FIELD EVIDENCE, INFERENCE, UNKNOWN and return exact files, symbols, seams, risks, contradictions and smallest implementation boundaries. Do not implement. LANE B: prioritize terminal discovery source, powershell/node/adoptable Player discovery, Check Players projection/filtering, adoption path, Dad-safe visibility gate, Advanced Player Discovery seam, AUTO dispatcher, explicit-route precedence, Player eligibility, Terminal manual-only policy, command-safety boundary, dispatch/refusal path, and the smallest future change for terminal-only AUTO routing.
- Model: openrouter/poolside/laguna-s-2.1:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-b-discovery-routing-Reconnaissance.md

**Key discoveries:** | # | Discovery | Key Evidence |
|---|---|---|
| 1 | Terminal Player is a first-class Player (`playerType: 'terminal'`, `executionType: 'direct-shell'`) but is **hard-excluded from AUTO**. | `src/routing-policy.ts:330-332`; test at `test/game-and-player-lifecycle.test.mjs:494` explicitly asserts the filter text. |
| 2 | **Advanced Player Discovery does not exist in the codebase.** No `advancedPlayerDiscovery` symbol anywhere in `src/` or the repo. | Grep across all `*.ts` returned zero matches. |
| 3 | Raw developer shells (`powershell`, `node`, `bash`) appear in "Check Players" because `projectDiscovery` passes `adoptableTerminals` through unconditionally — it only filters `externalCandidates` and `runningElsewhere`. | `src/running-players.ts:70-77` (projectDiscovery ignores adoptableTerminals); `src/public/index.html:3209-3229` (renders all adoptableTerminals). |
| 4 | Terminal evidence retention is **entirely browser-side** and currently keyed on `ExecutionView.state` — which decays. Fast failures (`couldnt-finish`) produce `stripCopy → null` and vanish immediately. Fast successes go unpinned if not expanded within 30s (`RICH_FINISHED_MS`). | `src/control-plane/execution-projection.ts:121-131`; `src/public/index.html:2604-2617` (stripCopy), `:2763-2766` (isTerminalEligible), `:2157` (RICH_FINISHED_MS=30s), `:2884-2885` (pin rescue). |
| 5 | Copy All / Copy New currently **dismiss** the terminal after Play completion, violating the product principle "Copy is not inherently 

**FACT:** 1. **Terminal Player is hard-excluded from AUTO.** The exact source code at `src/routing-policy.ts:330-332`:
   ```typescript
   const allCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal'
     && candidate.executionType !== 'direct-shell'
     && candidate.autoEligible !== false);
   ```
   The filter uses `playerType !== 'terminal'` and `executionType !== 'direct-shell'` — **not** `transport !== 'legacy'` as Scout B (Laguna) claimed. This is directly asserted by `test/game-and-player-lifecycle.test.mjs:494`: `assert.match(policy, /candidate\.playerType !== 'terminal' && candidate\.executionType !== 'direct-shell'/)`.

2. **`checkTerminalCommand` (src/terminal-player.ts:39-57) is a guard, not an intent classifier.** It rejects only text that starts with request openers (`please`, `can`, `why`, `how`, etc.) or ends with `?` without shell syntax. It returns `{ ok: true }` for vague sentences like `"check git status"` (no opener, no question mark). This means it is insufficient as a classifier for AUTO routing — a conservative closed-grammar classifier is needed.

3. **No `advancedPlayerDiscovery` symbol exists anywhere in the repository.** Grep across all `.ts` files and all paths in the repo returned zero matches. The preference is proposed in S53 but not implemented.

4. **No `terminalRetention` preference exists.** Grep in `src/public/index.html` and `src/` returned zero matches. Confirmed not implemented.

5. **No `src/terminal-intent.ts`

**INFERENCE:** 1. **The "Advanced Player Discovery" seam exists only as a product proposal, not in code.** Scout B's claim (line 121) that `daemon.ts:1969` is "the Advanced Player Discovery seam" misidentifies a Scout Formation execution gate. The product intent (S51 §4, S53 §Advanced Player Discovery) is to gate `adoptableTerminals` behind a `devMode && advancedPlayerDiscovery` preference — but that preference does not exist yet. The discovery truth (`PlayerRoster.adoptableTerminals()`, `player-roster.ts:826`) is live; only the projection gate is missing.

2. **AUTO Terminal routing requires two call-site changes, not one.** `computeAutoRoute` (the legacy path called from `server.ts:428,548,645`) and `computeContextAwareRoute` (the context-aware path called from `router.ts:120`) are the two dispatch entry points. `computeContextAwareRoute` excludes terminals at `routing-policy.ts:580` *before* reaching `computeAutoRoute` at line 844, so wiring only `computeAutoRoute` would be bypassed when `routeContextProvider` is active. S53 correctly identifies this dual-site requirement.

3. **Q2.9C's "single legacy" branch already provides a pattern for AUTO selecting a terminal-transport Player** — but only for AI providers (Claude/AntiGravity) where `transport === 'legacy'` and the provider capability is unavailable (`models: []`). A `playerType: 'terminal'` Player is excluded at line 330 before reaching line 360. The Q2.9C pattern returns `{ model: undefined, effort: undefined, modelDisplayName: 'P

**UNKNOWN:** 1. **Exact syntax boundary for shell-intent classification.** S53 proposes a closed-grammar classifier (`src/terminal-intent.ts`) but the exact allowlist (which commands, which flags, which subcommands qualify) is an architect decision (D1, D3 in S53). `checkTerminalCommand` (terminal-player.ts:39) is insufficient — it accepts `"check git status"` as an ok command.

2. **Default success-retention duration.** S53 §D1 recommends 5 minutes provisionally, but no human has ratified it. Choices are 30s/5m/30m/until-closed.

3. **Whether `sessionStorage` is available in all deployed page host contexts.** S53 notes a try/catch fallback is required (Play 2 STOP condition).

4. **Auto-expand on desktop — field-verified acceptable.** S53 says yes for `direct-shell` at ≥620px with no setting. No automated test can prove the UX is non-jarring on real desktop.

5. **Server start/stop commands in AUTO.** S53 D3 defers `npm start`, `kill`, `taskkill` etc. from AUTO — they are not in v1. This is a product decision, not a code gap.

6. **Console header exit-status visibility.** S50 Architecture Feedback #1 notes the Terminal console contains no `RESULT`/exit-status line — completion is visible only in the strip. On phone width, the expanded console (`position: fixed; inset: 0`) covers the strip, so the exit code is invisible while reading. S53 proposes putting outcome text in the console header (Play 2 fix).

7. **S53 references `Docs ANCHOR/TERMINAL-SCOUT-AI-HEALTH-BREADCRUMBS__2026-09-20.md`

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane scout-a-settings-retention: No headline section recognised — see the Player report.
- **Poolside: Laguna S 2.1 (free) (sideline-scout)** · lane scout-b-discovery-routing: **COMPLETE.** The bounded objective — mapping Terminal Player live output, Dev Mode/View Player Terminal settings, Player discovery source → routing capability, Check Players projection/filtering, Advanced Player Discovery Dev-Mode-only seam, terminal evidence retention, and AUTO routing for terminal-only intent — has been fully mapped against the current working tree. **S51.0 (AntiGravity, 2026-0

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- Cohere: North Mini Code (free) (sideline-scout-quick) · lane scout-a-settings-retention: 1. **Advanced Player Discovery:** - Laguna Scout B claims line ~1969 in `daemon.ts` gates Advanced Player Discovery - S51 report states Advanced Player Discovery does NOT exist - line 1969 gates Scout Formation execution - This is a planned breadcrumb, not current implementation 2. **AUTO Terminal Routing:** - Laguna Scout B claims Q2.9C auto-selects Terminal Players for terminal-only intent - S51 report states `routing-policy.ts:330-338` explicitly rejects all terminal players - Current reality: Terminal Players are hard-excluded from AUTO ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane scout-a-settings-retention · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-a-settings-retention-Reconnaissance.md
- Lane scout-b-discovery-routing · Poolside: Laguna S 2.1 (free) (sideline-scout): C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907\SCOUT-scout-b-discovery-routing-Reconnaissance.md

### Full report — lane scout-a-settings-retention (sideline-scout-quick)

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

### Full report — lane scout-b-discovery-routing (sideline-scout)

Now let me read the core source files to verify the claims and gather current evidence. I need to read the key source files and tests.
Let me read more source files and the remaining reports to verify claims and gather current evidence.
Now let me read the daemon.ts relevant sections, the index.html terminal-related code, and the test files to complete the evidence map.
Now let me read the browser UI code and test files to verify the key claims about retention, copy, and rendering behavior.
Let me now read the actual Scout B report (the Laguna report) and the q2-9c test file to verify the contradiction between them.
Let me verify a few more items — the router.ts terminal stripping line, the LPT tests, and check the `capability-types.ts` for the execution type description.
Let me verify a few more specific claims and check the breadcrumb files for context.
Let me verify the current state of the LPT test file and check for any `terminal-intent` module that may have been created since the reports.
Now I have comprehensive evidence. Let me verify one final item — the `routing-intelligence.test.mjs` that Scout B referenced at "line ~261" to check whether it tests terminal-backed selection.
I now have comprehensive evidence. Let me compile the final Scout Recon Report.
SCOUT REPORT — READ-ONLY RECONNAISSANCE

SCOUT AGENT: sideline-scout (Scout ID: scout-b-discovery-routing)
SCOUT MODEL: openrouter/poolside/laguna-s-2.1:free
ROLE: Read-Only Reconnaissance Scout
REPORT TYPE: SCOUT REPORT

**Scout limitation statement:** This report is reconnaissance, not final architectural authority. The trusted Runner, not this Scout, persists it. Conclusions should be spot-checked against the named source before architectural decisions are made.

---

# 1. RESULT

**COMPLETE.** The bounded objective — mapping Terminal Player live output, Dev Mode/View Player Terminal settings, Player discovery source → routing capability, Check Players projection/filtering, Advanced Player Discovery Dev-Mode-only seam, terminal evidence retention, and AUTO routing for terminal-only intent — has been fully mapped against the current working tree.

**S51.0 (AntiGravity, 2026-09-20 12:05 MDT) was read in full and audited against current source.** S51 corrects two material errors in Scout B's report (see CONTRADICTION). S51's own accuracy was verified line-by-line; one minor line-number inaccuracy is noted in FACT #14.

**S53.0 (Claude Code, 2026-09-20 12:50 MDT) was read in full.** It is an architecture/planning document for five future implementation Plays. No Play has been implemented. All proposed files (`src/terminal-intent.ts`, `computeTerminalAutoRoute`) and preferences (`advancedPlayerDiscovery`, `terminalRetention`) **do not exist in source** — this is all pre-implementation.

---

# 2. KEY DISCOVERIES

| # | Discovery | Key Evidence |
|---|---|---|
| 1 | Terminal Player is a first-class Player (`playerType: 'terminal'`, `executionType: 'direct-shell'`) but is **hard-excluded from AUTO**. | `src/routing-policy.ts:330-332`; test at `test/game-and-player-lifecycle.test.mjs:494` explicitly asserts the filter text. |
| 2 | **Advanced Player Discovery does not exist in the codebase.** No `advancedPlayerDiscovery` symbol anywhere in `src/` or the repo. | Grep across all `*.ts` returned zero matches. |
| 3 | Raw developer shells (`powershell`, `node`, `bash`) appear in "Check Players" because `projectDiscovery` passes `adoptableTerminals` through unconditionally — it only filters `externalCandidates` and `runningElsewhere`. | `src/running-players.ts:70-77` (projectDiscovery ignores adoptableTerminals); `src/public/index.html:3209-3229` (renders all adoptableTerminals). |
| 4 | Terminal evidence retention is **entirely browser-side** and currently keyed on `ExecutionView.state` — which decays. Fast failures (`couldnt-finish`) produce `stripCopy → null` and vanish immediately. Fast successes go unpinned if not expanded within 30s (`RICH_FINISHED_MS`). | `src/control-plane/execution-projection.ts:121-131`; `src/public/index.html:2604-2617` (stripCopy), `:2763-2766` (isTerminalEligible), `:2157` (RICH_FINISHED_MS=30s), `:2884-2885` (pin rescue). |
| 5 | Copy All / Copy New currently **dismiss** the terminal after Play completion, violating the product principle "Copy is not inherently dismissal." | `src/public/index.html:2436-2442` (copyConsole deletes pin + expansion on `finished` state). |
| 6 | Dev Mode → View Player Terminal mapping is a strict AND: both `devMode` and `livePlayerConsole` must be true. | `src/running-players.ts:28-31`; `src/control-plane/daemon.ts:2890-2892`; `src/public/index.html:2209`, `:5467-5477`. |
| 7 | Q2.9C's single-legacy branch (`routing-policy.ts:360`) selects the sole on-field Player reached through terminal transport — but **only for AI provider Players** (Claude, AntiGravity with `transport: 'legacy'`), never for `playerType: 'terminal'`. | `routing-policy.ts:330-332` excludes terminals before `:360`; tests at `test/q2-9c-auto-single-player.test.mjs:73-90` use `playerType: 'claude'`/`'antigravity'`, never `'terminal'`. |
| 8 | The `computeAutoRoute` function is called from **three** sites in `server.ts` plus the `computeContextAwareRoute` path — wiring Terminal-only AUTO at only one site is a bypass. | `src/server.ts:428, 548, 645`; `src/routing-policy.ts:844`; `src/control-plane/router.ts:113-125`. |

---

# 3. FACT

1. **Terminal Player is hard-excluded from AUTO.** The exact source code at `src/routing-policy.ts:330-332`:
   ```typescript
   const allCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal'
     && candidate.executionType !== 'direct-shell'
     && candidate.autoEligible !== false);
   ```
   The filter uses `playerType !== 'terminal'` and `executionType !== 'direct-shell'` — **not** `transport !== 'legacy'` as Scout B (Laguna) claimed. This is directly asserted by `test/game-and-player-lifecycle.test.mjs:494`: `assert.match(policy, /candidate\.playerType !== 'terminal' && candidate\.executionType !== 'direct-shell'/)`.

2. **`checkTerminalCommand` (src/terminal-player.ts:39-57) is a guard, not an intent classifier.** It rejects only text that starts with request openers (`please`, `can`, `why`, `how`, etc.) or ends with `?` without shell syntax. It returns `{ ok: true }` for vague sentences like `"check git status"` (no opener, no question mark). This means it is insufficient as a classifier for AUTO routing — a conservative closed-grammar classifier is needed.

3. **No `advancedPlayerDiscovery` symbol exists anywhere in the repository.** Grep across all `.ts` files and all paths in the repo returned zero matches. The preference is proposed in S53 but not implemented.

4. **No `terminalRetention` preference exists.** Grep in `src/public/index.html` and `src/` returned zero matches. Confirmed not implemented.

5. **No `src/terminal-intent.ts` file exists.** Glob pattern `**/terminal-intent*` returned no files. S53's Play 4 classifier module is proposed but not created.

6. **No `computeTerminalAutoRoute` function exists.** Grep returned zero matches in `src/`. Proposed in S53 but not created.

7. **`CoachPreferences` (`src/running-players.ts:18-29`) holds exactly three fields:** `runningPlayers`, `devMode`, `livePlayerConsole`. No `advancedPlayerDiscovery` field.

8. **`DEFAULT_PREFERENCES` (`src/running-players.ts:31`):** `{ runningPlayers: 'ask', devMode: false, livePlayerConsole: false }`.

9. **`projectDiscovery` (`src/running-players.ts:70-77`) filters only `externalCandidates` and `runningElsewhere`; it does NOT filter `adoptableTerminals`.** When preference is `'ignore'`, it returns `{ ...discovery, externalCandidates: [], runningElsewhere: [] }` — `adoptableTerminals` passes through unchanged.

10. **`daemon.ts:2013-2066` — `POST /api/preferences`** validates `runningPlayers`, `devMode`, and `livePlayerConsole` (three fields only). It does not accept `advancedPlayerDiscovery` or `terminalRetention`. When either `devMode` or `livePlayerConsole` is turned off, `this.playerActivity.clear()` is called (line 2057).

11. **`daemon.ts:2890-2892` — `livePlayerTerminalEnabled()`** returns `Boolean(preferences.devMode && preferences.livePlayerConsole)`. Both must be true.

12. **`daemon.ts:1968-1969` gates `/api/scout/formation-receivers` and `/api/scout/formation-run`** behind `devMode`. This is **Scout Formation execution**, NOT "Advanced Player Discovery." This is confirmed by the route handler names and the error message "Scout Formation operator is available only in Dev Mode."

13. **`daemon.ts:862` — `player.activity` handler** checks `if (!this.livePlayerTerminalEnabled()) break;` before recording activity. Activity is broadcast only when both Dev Mode and View Player Terminal are on.

14. **`daemon.ts:977`** — `GET /api/player-activity` returns empty entries when `livePlayerTerminalEnabled()` is false.

15. **`daemon.ts:3015-3018`** — `buildStatus()` projects `playerDiscovery` through `projectDiscovery(discovery, preferences.runningPlayers)`. The daemon passes the projection to the browser via `status.playerDiscovery`. The browser's `renderRecruit` consumes it directly without additional filtering.

16. **`router.ts:284-286`** — Terminal model/effort stripping:
    ```typescript
    if (targetCapability?.playerType === 'terminal') {
      targetModel = undefined;
      targetEffort = undefined;
    }
    ```
    **Note:** S51 states this is at `router.ts:258`, but the actual code is at lines 284-286. Line 258 in `router.ts` is inside the Scout error block (`'no eligible Formation receiver is currently proven READY.'`). S53 correctly cites `router.ts:284-287`. This is a minor line-number inaccuracy in S51.

17. **`router.ts:117-125`** — `computeRoute` is shared by staged preview and real dispatch. If `routeContextProvider` is absent, calls `computeAutoRoute` directly (line 119); otherwise calls `computeContextAwareRoute` (line 120). Both paths must be wired for Terminal-only AUTO.

18. **`routing-policy.ts:360`** — Q2.9C single-legacy branch: `if (candidates.length === 1 && candidates[0].transport === 'legacy')`. This only fires after terminals have been excluded from `allCandidates` at lines 330-332. The candidates at this point are only non-terminal Players (AI providers on legacy/terminal transport).

19. **`routing-policy.ts:580`** — `computeContextAwareRoute` excludes terminals: `const reasoningCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell')`. This is a **second** exclusion site that must also be wired.

20. **`routing-policy.ts:844`** — `computeContextAwareRoute` calls `computeAutoRoute` at the end for new work: `const base = computeAutoRoute(gameId, prompt, constraints ? candidates : everyCandidate, policies)`.

21. **`routing-policy.ts:610`** — `computeContextAwareRoute` calls `computeScoutAutoRoute` inside the `!constraints && !scoutOwnsCurrentContext` block.

22. **`player-roster.ts:712-721`** — `runTerminalCommand` enforces: terminal must be on field, not closed, not already running, then calls `checkTerminalCommand(text)` (line 720). Refusals return `{ kind: 'refused', message: ... }`.

23. **`player-roster.ts:727-741`** — With shell integration + single-line: `shell.executeCommand()` + `watchCommandOutput()` for live streaming. Without: `terminal.sendText()` + `TERMINAL_OUTPUT_UNAVAILABLE_SENT` notice. `observed: true` only when `read()` was attached.

24. **`player-roster.ts:826-835`** — `adoptableTerminals()`: iterates `vscode.window.terminals`, excludes Coach-owned/closed/rostered/claimed terminals, returns `{ terminalName, shellPid }` for each open human shell (e.g., `"powershell"`, `"node"`, `"bash"`).

25. **`player-roster.ts:934`** — `discoverPlayers()` attaches `adoptableTerminals: await this.adoptableTerminals(agentShells)` to the discovery payload.

26. **`player-roster.ts:936`** — `this.lastDiscovery = this.withVirtualCatalog(result)` caches the result including `adoptableTerminals`.

27. **`player-roster.ts:371-386`** — `withVirtualCatalog()` merges virtual Player catalog entries but does **not** touch `adoptableTerminals`. It only adds virtual entries to the `catalog` field.

28. **`player-roster.ts:1497-1510`** — Terminal capability builder in `getRoutingCapabilities()`: returns `transport: 'legacy'`, `executionType: 'direct-shell'`, `capability: this.capabilityService.createUnavailable('terminal')` (models: []), `state: 'ready' | 'busy'`. No `autoEligible` field is set (defaults to undefined, meaning it passes the `autoEligible !== false` check — but it is already excluded by `playerType !== 'terminal'`).

29. **`index.html:2416-2444`** — `copyConsole(instanceId, mode, button)`: Copies text to clipboard, advances cursor. **Lines 2436-2442:** If `currentView.state === 'finished'`, deletes `consolePinnedByInstance` and `consoleExpandedByInstance` and calls `renderPlayerStrips()`. This means Copy currently dismisses the terminal after completion.

30. **`index.html:2604-2617`** — `stripCopy` for `couldnt-finish` and `unknown`: returns a report-ready strip only for Scout (`scout && isReportReady(view)`), otherwise returns `null` for all Player types including Terminal. This causes fast failures to **vanish from the DOM immediately**.

31. **`index.html:2763-2766`** — `isTerminalEligible`: `liveConsoleEnabled() && view.executionType !== 'scout-formation' && record.typeName !== 'Scout' && (view.state === 'working' || view.state === 'starting' || view.state === 'finished')`. Does NOT accept `couldnt-finish` or `unknown`.

32. **`index.html:2746-2756`** — Backfill logic triggers on `view.playRef` change, re-backs the same Play. `consoleExpandedByInstance` triggers re-backfill.

33. **`index.html:2767-2781`** — Collapsed-first: if `!expanded`, renders a `[Expand]` button. Clicking it adds `instanceId` to `consoleExpandedByInstance`, and if `view.state === 'finished'`, also adds to `consolePinnedByInstance` (line 2777).

34. **`index.html:2801-2808`** — Collapse button handler: deletes both `consoleExpandedByInstance` and `consolePinnedByInstance`, sets `rec.key = ''`, calls `renderPlayerStrips()`.

35. **`index.html:2884-2885`** — Pin rescue in `renderPlayerStrips`: `if (view?.state === 'finished' && consoleExpandedByInstance.has(instanceId))` → `consolePinnedByInstance.add(instanceId)`. Pinning only attaches if the terminal was **already expanded** when it finished.

36. **`index.html:2886-2888`** — `consolePinnedByInstance.delete(instanceId)` on `starting`/`working` state transition (next play unpins old).

37. **`index.html:2157`** — `RICH_FINISHED_MS = 30_000` (30 seconds). This is the browser-side rich-window timer for finished plays.

38. **`index.html:2871-2878`** — `scheduleFinishedDecay`: schedules a one-shot `setTimeout(renderPlayerStrips, remaining + 20)` based on `view.finishedAt`. Idempotent per `(instanceId, playRef)`.

39. **`work-ledger.ts:23`** — `REPORT_GRACE_MS = 2 * 60_000` (2 minutes). This is the server-side grace window for report-less plays. Terminal Plays with no report project `finished` for only 2 minutes.

40. **`execution-projection.ts:121-131`** — Completed/failed turns: if `latest.outcome === 'completed'` and report is unacknowledged → `terminalView(..., 'finished', ...)`. If no report and `input.now <= latest.finishedAt + REPORT_GRACE_MS` → `finished` with `awaitingReport: true`. Otherwise → `idle`. For `failed`/`interrupted`/`not-sent`/`blocked` → `terminalView(..., 'couldnt-finish', ...)`.

41. **`execution-projection.ts:153-176`** — `terminalView()` sets `durationMs = finishedAt - executionStartedAt` when both are finite. For `not-sent` refusals, `executionStartedAt` is undefined → `durationMs` is undefined.

42. **`index.html:630-634`** — Phone-width CSS: `.play-console` is `position: fixed; inset: 0; z-index: 1000; width: 100vw; height: 100vh` at `max-width: 619px`. This is a fullscreen overlay on phones.

43. **`index.html:1123-1136`** — Settings UI: `#devModeCard` with `#devModeToggle` checkbox (line 1123), `#livePlayerConsoleCard` hidden by default (line 1128) with `#livePlayerConsoleToggle` labeled "View Player Terminal" (line 1134).

44. **`index.html:5466-5484`** — `syncLivePlayerConsoleSetting(status)`: hides `#livePlayerConsoleCard` unless `status.preferences.devMode`; sets toggle state; clears `consoleActivity` if either gate is off. Toggle click posts `{ livePlayerConsole: event.target.checked }` to `/api/preferences`.

45. **`index.html:2209`** — `liveConsoleEnabled()` client-side predicate: `Boolean(lastStatus?.preferences?.devMode && lastStatus?.preferences?.livePlayerConsole)`.

46. **Test at `test/p0-1-terminal-player.test.mjs:116-130`** — P0.1-T2 asserts: "A Coach-managed Terminal is a first-class exact-instance MANUAL target — and never an AUTO candidate." Uses `computeAutoRoute(GAME, 'git status', routing, ...)` and asserts `onlyTerminal.error` matches `/AUTO does not send it Plays/`.

47. **Test at `test/q2-9c-auto-single-player.test.mjs:73-84`** — Q2.9C-2 uses `playerType: 'claude'` with `transport: 'legacy'` (an AI provider reached through terminal transport, NOT `playerType: 'terminal'`). The test at line 77 asserts `result.decision.playerInstanceId` is `'claude-57355709'`.

48. **Test at `test/q2-9c-auto-single-player.test.mjs:108-112`** — Q2.9C-6 uses `[claude, antigravity]` (two `playerType`-distinct values) and asserts an error: "Claude and AntiGravity are on field. Choose who gets this Play in Manual."

49. **Test at `test/routing-intelligence.test.mjs:261-284`** — Test 23: "computeAutoRoute: the only terminal-backed Player on field is selected." The candidate has `playerType: 'codex'` and `transport: 'legacy'` — explicitly labeled in the comment as "Q2.9C: AUTO chooses WHO; transport decides HOW." NOT `playerType: 'terminal'`.

50. **Test at `test/game-and-player-lifecycle.test.mjs:485-495`** — R1 asserts: "A Terminal Player is a MANUAL shell target only: exact commands, never an AUTO Play target." Source-scans `player-roster.ts` and `routing-policy.ts` to assert the exact filter text.

51. **`terminal-player.ts:19-24`** — `TERMINAL_EXECUTION` sentinel: `{ executionType: 'direct-shell', model: 'not-applicable', reasoning: 'not-applicable', provider: 'none' }`.

52. **`player-adapters.ts:86-92`** — Terminal adapter: `id: 'terminal'`, `name: 'Terminal'`, `alwaysAvailable: true`. This is the curated Terminal recruit entry.

53. **`player-adapters.ts:95-101`** — `getPlayerAdapter(id)` and `isPlayerId(value)` — the Terminal adapter is always in the catalog for recruit.

54. **`server.ts:428, 548, 645`** — Three call sites to `computeAutoRoute` (not `computeContextAwareRoute`). S53 correctly identifies these as sites that would need wiring for Terminal-only AUTO.

55. **S50 report (`S50.0-Terminal-Player-V1-T2-Live-Output-Tap-And-Session-Identity.md`) — files changed:** Only `src/terminal-player.ts` (+167 lines) and `src/player-roster.ts` (~65 lines in terminal section). Explicitly NOT modified: `src/public/index.html`, `src/control-plane/work-ledger.ts`, `src/control-plane/execution-projection.ts`, `src/stadium-client.ts`, `src/control-plane/daemon.ts`.

56. **S50 report — `TERMINAL_EXECUTION` (line 19)**, `TERMINAL_OUTPUT_UNAVAILABLE_SENT` (line 76), `TERMINAL_OUTPUT_UNAVAILABLE_RUNNING` (line 77), `TERMINAL_OUTPUT_STOPPED_EARLY` (line 78) are all defined in `terminal-player.ts`.

57. **`player-activity.ts`** — `output` category added (S49). `ACTIVITY_CATEGORIES` includes `'output'`. `sanitizeActivityText` treats `output` with whitespace preservation (`text.trimEnd()`), not whitespace collapse.

58. **`index.html:2211`** — `CONSOLE_LABELS` includes `output: 'OUTPUT'`.

59. **`index.html:2280-2284`** — `consolePlaceholderText`: returns `'Waiting for live execution activity…'` for `direct-shell` players.

---

# 4. INFERENCE

1. **The "Advanced Player Discovery" seam exists only as a product proposal, not in code.** Scout B's claim (line 121) that `daemon.ts:1969` is "the Advanced Player Discovery seam" misidentifies a Scout Formation execution gate. The product intent (S51 §4, S53 §Advanced Player Discovery) is to gate `adoptableTerminals` behind a `devMode && advancedPlayerDiscovery` preference — but that preference does not exist yet. The discovery truth (`PlayerRoster.adoptableTerminals()`, `player-roster.ts:826`) is live; only the projection gate is missing.

2. **AUTO Terminal routing requires two call-site changes, not one.** `computeAutoRoute` (the legacy path called from `server.ts:428,548,645`) and `computeContextAwareRoute` (the context-aware path called from `router.ts:120`) are the two dispatch entry points. `computeContextAwareRoute` excludes terminals at `routing-policy.ts:580` *before* reaching `computeAutoRoute` at line 844, so wiring only `computeAutoRoute` would be bypassed when `routeContextProvider` is active. S53 correctly identifies this dual-site requirement.

3. **Q2.9C's "single legacy" branch already provides a pattern for AUTO selecting a terminal-transport Player** — but only for AI providers (Claude/AntiGravity) where `transport === 'legacy'` and the provider capability is unavailable (`models: []`). A `playerType: 'terminal'` Player is excluded at line 330 before reaching line 360. The Q2.9C pattern returns `{ model: undefined, effort: undefined, modelDisplayName: 'Provider managed' }` — the exact shape a future Terminal AUTO route would need.

4. **The fast-command blip has two distinct root causes:**
   - **Fast failure:** `stripCopy` returns `null` for `couldnt-finish`/`unknown` (non-Scout), immediately unmounting the card (`index.html:2604-2617`).
   - **Fast success without expansion:** `consolePinnedByInstance` only attaches at line 2884-2885 if the user already expanded (`consoleExpandedByInstance.has(instanceId)` is true when the view finished). If not expanded within 30s (`RICH_FINISHED_MS`), the strip unmounts at line 2902 (key change) and `renderPlayStrip` returns null from `stripCopy` at line 2628 (non-rich, non-report-ready → null).

5. **Retention keyed on `ExecutionView.state` is unreliable for Terminals.** The server projection of `finished` for a report-less Terminal Play lasts only 2 minutes (`REPORT_GRACE_MS` at `work-ledger.ts:23`; `execution-projection.ts:128-129`). After 2 minutes, the view projects `idle`, `stripCopy` returns `null`, and `isTerminalEligible` rejects `idle`. The browser's `scheduleFinishedDecay` (30s) and pin-rescue (`consolePinnedByInstance`) both depend on the server `finished` state. S53 correctly identifies this as a fundamental problem requiring a separate evidence record.

6. **Copy currently double-duty as dismissal for finished plays** (`index.html:2436-2442`). This is the exact behavior S51 flags as violating "Copy is not inherently dismissal" and S53 mandates decoupling.

7. **The curated Terminal recruit entry is visible in the catalog** at `player-adapters.ts:86-92` (`id: 'terminal'`, `alwaysAvailable: true`, no `probeCommand`). It appears in `discovery.catalog` as `{ playerType: 'terminal', displayName: 'Terminal', state: 'available', ... }`. This is the "Add to Team" entry Dad should see.

8. **Adopted terminals are separate from the curated Terminal.** `adoptableTerminals` (line 826) finds human-open shells (e.g., "powershell", "node", "bash") that are NOT Coach-managed. These render as "Adopt as Terminal" buttons in `renderRecruit` at `index.html:3209-3229`. This is what clutters "Check Players" in Dad mode.

---

# 5. UNKNOWN

1. **Exact syntax boundary for shell-intent classification.** S53 proposes a closed-grammar classifier (`src/terminal-intent.ts`) but the exact allowlist (which commands, which flags, which subcommands qualify) is an architect decision (D1, D3 in S53). `checkTerminalCommand` (terminal-player.ts:39) is insufficient — it accepts `"check git status"` as an ok command.

2. **Default success-retention duration.** S53 §D1 recommends 5 minutes provisionally, but no human has ratified it. Choices are 30s/5m/30m/until-closed.

3. **Whether `sessionStorage` is available in all deployed page host contexts.** S53 notes a try/catch fallback is required (Play 2 STOP condition).

4. **Auto-expand on desktop — field-verified acceptable.** S53 says yes for `direct-shell` at ≥620px with no setting. No automated test can prove the UX is non-jarring on real desktop.

5. **Server start/stop commands in AUTO.** S53 D3 defers `npm start`, `kill`, `taskkill` etc. from AUTO — they are not in v1. This is a product decision, not a code gap.

6. **Console header exit-status visibility.** S50 Architecture Feedback #1 notes the Terminal console contains no `RESULT`/exit-status line — completion is visible only in the strip. On phone width, the expanded console (`position: fixed; inset: 0`) covers the strip, so the exit code is invisible while reading. S53 proposes putting outcome text in the console header (Play 2 fix).

7. **S53 references `Docs ANCHOR/TERMINAL-SCOUT-AI-HEALTH-BREADCRUMBS__2026-09-20.md`** — confirmed NOT FOUND in the repository. S53 and S51 both record it as absent.

8. **The `@types/vscode` version this repo compiles against for `TerminalShellExecution.read()`.** S48 verified this is stable in the installed typings. S50 confirms `read(): AsyncIterable<string>` exists at the `@types/vscode` version used.

---

# 6. CONTRADICTION

### CONTRADICTION 1: Scout B claims "Advanced Player Discovery" exists at `daemon.ts:1969`

**Scout B's claim** (line 121 of the Laguna report):
> "FACT — `src/control-plane/daemon.ts` (line ~1969): Dev Mode gate for `formation-receivers` / `formation-run` returns 404 unless `devMode` is true. This is the 'Advanced Player Discovery' seam — hidden behind Dev Mode."

**Actual source (`daemon.ts:1968-1972`):**
```typescript
if (requestUrl.pathname === '/api/scout/formation-receivers' || requestUrl.pathname === '/api/scout/formation-run') {
  if (!this.getPreferences().devMode) {
    this.sendJson(res, 404, { success: false, message: 'Scout Formation operator is available only in Dev Mode.' });
    return;
  }
```

**Verdict: CONTRADICTED.** Line 1969 gates **Scout Formation execution endpoints**, explicitly returning "Scout Formation operator is available only in Dev Mode." It is not a Player discovery seam. Grep across all `src/` for `advancedPlayer` returned **zero matches** — Advanced Player Discovery does not exist in the codebase. Scout B conflated Scout Formation execution endpoints with Player discovery.

**S51 audit verdict:** CONFIRMED (S51 correctly identified this as a contradiction at S51 §5).

### CONTRADICTION 2: Scout B claims Q2.9C routes Terminal-only intent to the Terminal Player

**Scout B's claim** (lines 131-141 of the Laguna report):
> "`computeAutoRoute` excludes `direct-shell` and `terminal` transports from `allCandidates` by default" ... then quotes a filter `c.transport !== 'legacy'`. ... "Special case for Q2.9C: `if (candidates.length === 1 && candidates[0].transport === 'legacy')` — This allows a **single** terminal-backed Player to be selected by AUTO — the 'terminal-only intent' path."

**Actual source (`routing-policy.ts:330-332, 360`):**
```typescript
// Line 330-332 (the real filter):
const allCandidates = everyCandidate.filter((candidate) => candidate.playerType !== 'terminal'
  && candidate.executionType !== 'direct-shell'
  && candidate.autoEligible !== false);

// Line 360 (Q2.9C branch — operates on allCandidates, which has excluded terminals):
if (candidates.length === 1 && candidates[0].transport === 'legacy') {
```

**Sub-contradictions within this claim:**

- **2a. Scout B quoted a non-existent filter.** Scout B claims the filter is `c.transport !== 'legacy'`, but the actual source uses `candidate.playerType !== 'terminal' && candidate.executionType !== 'direct-shell' && candidate.autoEligible !== false`. The literal string `transport !== 'legacy'` does not appear in the exclusion filter.

- **2b. Terminals are excluded BEFORE the Q2.9C branch.** The `allCandidates` filter at lines 330-332 runs first. By line 360, no `playerType === 'terminal'` candidate remains in `candidates`. The Q2.9C single-legacy branch can only fire for AI provider Players (Claude, AntiGravity) that use `transport: 'legacy'`.

- **2c. Scout B's cited test is wrong.** Scout B references `test/q2-9c-auto-single-player.test.mjs` claiming it "verifies AUTO selects the sole terminal-backed Player." The actual tests (Q2.9C-2 at lines 73-84, Q2.9C-3 at lines 86-90, Q2.9C-7 at lines 114-140) all use `playerType: 'claude'` or `playerType: 'antigravity'` with `transport: 'legacy'` — AI providers, not `playerType: 'terminal'`. No Q2.9C test uses a Terminal Player.

- **2d. `routing-intelligence.test.mjs:261`** — Scout B references this test at "line ~261" claiming it tests terminal-backed Player selection. The actual test 23 (line 261-284) uses `playerType: 'codex'` with `transport: 'legacy'`. The comment explicitly says "Q2.9C: AUTO chooses WHO; transport decides HOW" — it is about Codex-on-terminal-transport, not the Terminal Player.

**Verdict: CONTRADICTED.** Q2.9C's single-legacy branch never sees a `playerType: 'terminal'` candidate because it is filtered out at `routing-policy.ts:330`. Terminal Player has zero AUTO routing support today. This is directly asserted by `test/p0-1-terminal-player.test.mjs:127-128` (`computeAutoRoute(GAME, 'git status', routing, ...)` → `onlyTerminal.error` matches `/AUTO does not send it Plays/`) and `test/game-and-player-lifecycle.test.mjs:494`.

**S51 audit verdict:** CONFIRMED (S51 correctly identified this as a contradiction at S51 §6).

### CONTRADICTION 3: Scout B claims "CONTRADICTION — NONE FOUND"

**Scout B's claim** (line 205):
> "CONTRADICTION — NONE FOUND."

**Verdict: CONTRADICTED.** Scout B itself contains two material contradictions (CONTRADICTION 1 and CONTRADICTION 2 above). Scout B's self-assessment of "none found" is false.

### Minor CONTRADICTION 4: Scout B's preference enum values

**Scout B's claim** (lines 107, 109):
> "`'ask'` (default): show external candidates ... `'auto'`: auto-adopt ... `'hide'`: suppress"

**Actual source (`running-players.ts:16,34`):**
```typescript
export type RunningPlayersPreference = 'ask' | 'auto-add' | 'ignore';
```

**Verdict: CONTRADICTION.** Scout B says `'auto'` and `'hide'` but the actual values are `'auto-add'` and `'ignore'`. S51 correctly identified this at S51 §4 (line 85).

### Minor CONTRADICTION 5: Scout B's `withVirtualCatalog` claim

**Scout B's claim** (line 98):
> "`withVirtualCatalog()` merges virtual Player entries (including `adoptableTerminals`) into a unified `playerCatalog`."

**Actual source (`player-roster.ts:371-386`):**
`withVirtualCatalog()` only adds virtual catalog entries to `discovery.catalog`. It does **not** touch `adoptableTerminals`. The claim that it merges `adoptableTerminals` is inaccurate — raw shells appear via the `discoverPlayers()` method at line 934 which attaches `adoptableTerminals: await this.adoptableTerminals(agentShells)` to the discovery payload independently of `withVirtualCatalog`.

### Minor CONTRADICTION 6: Scout B claims `PlayerRoster` constructor accepts `discoverPlayers: () => Promise<DiscoveredPlayer[]>`

**Scout B's claim** (line 94):
> "`PlayerRoster` constructor accepts `discoverPlayers: () => Promise<DiscoveredPlayer[]>` and `getLastDiscovery: () => DiscoveredPlayer[] | undefined`."

This appears to be an inaccurate description of the actual PlayerRoster API. The discovery is done via `PlayerDiscoveryService.discover()` (player-discovery.ts:426-471), not injected as a callback. Scout B appears to be describing an older or different architecture.

---

# 7. IMPORTANT FILES / PATHS

## Terminal Player substrate (settled, S48-S50, field-proved output)
| File | Key Symbols |
|---|---|
| `src/terminal-player.ts` | `TERMINAL_EXECUTION` (19-24), `checkTerminalCommand` (39-57), `describeTerminalExit` (60-65), `TerminalLineAssembler` (112-134), `projectTerminalLine` (141-148), `TerminalOutputBudget` (151-186), `pumpTerminalOutput` (199-229), `TERMINAL_OUTPUT_*` constants (76-84), `terminalSessionKey`/`terminalSessionRef` (89-96) |
| `src/player-roster.ts` | `runTerminalCommand` (690+), `checkTerminalCommand` call (720), `finishTerminalCommand` (793-799), `adoptableTerminals` (826-835), `adoptTerminal` (838-854), `observedShells` (908-917), `discoverPlayers` (920-935), `getRoutingCapabilities` (1490-1549), `sendToProviderTerminal` (811-819) |
| `src/player-adapters.ts` | `PLAYER_ADAPTERS` (includes Terminal at 86-92, `id: 'terminal'`, `alwaysAvailable: true`), `getPlayerAdapter` (95-97), `isPlayerId` (99-101) |
| `src/player-activity.ts` | `ACTIVITY_CATEGORIES` (includes `'output'` from S49), `sanitizeActivityText` (output whitespace trimming), `sessionKeyFor`, `PlayerActivityStore` |
| `src/stadium-client.ts` | `executeDispatch` (1045-1127), `deliverTerminalCommand` (1359-1367), dispatch routing switch (1055-1104) |
| `src/control-plane/daemon.ts` | `player.activity` handler (858-874, gated at 862), `GET /api/player-activity` (970-979, gated at 977), `livePlayerTerminalEnabled()` (2890-2892), `POST /api/preferences` (2013-2066), `/api/scout/formation-receivers`/`formation-run` gate (1968-1969), `buildStatus()` (3015-3018 projectDiscovery call), `POST /api/players/adopt-terminal` (2076-2079) |
| `src/control-plane/work-ledger.ts` | `REPORT_GRACE_MS = 2 * 60_000` (23), `recordTurn` (274-292, workState transitions), `acknowledge` (504-540) |
| `src/control-plane/execution-projection.ts` | `projectExecution` (57-133), `terminalView` (153-176), `couldnt-finish`/`finished`/`idle` state mapping (121-133) |
| `src/control-plane/router.ts` | `computeRoute` (117-125, shared by staged + real dispatch), Terminal model/effort stripping (284-286), dispatch options (138-176) |
| `src/routing-policy.ts` | `computeAutoRoute` (319-457, Terminal exclusion at 330-332, Q2.9C at 360), `computeContextAwareRoute` (570-893, terminal exclusion at 580, computeAutoRoute call at 844), `computeScoutAutoRoute` (269-317) |
| `src/running-players.ts` | `CoachPreferences` (18-29), `DEFAULT_PREFERENCES` (31), `loadPreferences` (44-55), `savePreferences` (58-63), `projectDiscovery` (70-77, does NOT filter adoptableTerminals) |
| `src/capability-types.ts` | `PlayerRoutingCapability.executionType` includes `'direct-shell'` (47-51), `autoEligible?: boolean` (53) |

## Browser UI (terminal evidence retention + copy + recruit)
| File | Key Symbols |
|---|---|
| `src/public/index.html` | Settings: `#devModeToggle` (1123), `#livePlayerConsoleCard` (1128), `#livePlayerConsoleToggle` (1134); `syncLivePlayerConsoleSetting` (5466-5477); `liveConsoleEnabled` (2209); `RICH_FINISHED_MS` (2157); `copyConsole` (2416-2444, dismissal at 2436-2442); `stripCopy` (2575-2646, null at 2604-2617); `renderPlayStrip` (2649-2846, pin rescue at 2884-2885); `isTerminalEligible` (2763-2766); `renderPlayerStrips` (2881-2910); `scheduleFinishedDecay` (2871-2878); `renderRecruit` (3109-3244, adoptableTerminals loop at 3209-3229); `CONSOLE_LABELS` (2211, includes `output: 'OUTPUT'`); `consolePlaceholderText` (2280-2284, "Waiting for live execution activity…" for direct-shell); CSS phone fullscreen (`.play-console` at 630-634, `max-width: 619px`); `consoleExpandedByInstance` (2207), `consolePinnedByInstance` (2208) |

## Tests
| File | Key Tests |
|---|---|
| `test/p0-1-terminal-player.test.mjs` | P0.1-T1 (command contract, line 96-110), P0.1-T2 (Terminal never AUTO candidate, line 116-130), P0.1-T3 (dispatch, 132-159), P0.1-T5 (NL refusal, 172-181), T2-1 through T2-11 (live output) |
| `test/q2-9c-auto-single-player.test.mjs` | Q2.9C-1 through Q2.9C-11 (uses `playerType: 'claude'`/`'antigravity'` on `transport: 'legacy'`, NOT `playerType: 'terminal'`) |
| `test/routing-intelligence.test.mjs` | Test 23 (line 261-284): "terminal-backed Player" uses `playerType: 'codex'`, `transport: 'legacy'` |
| `test/game-and-player-lifecycle.test.mjs` | R1 (line 485-495): asserts Terminal is MANUAL-only, never AUTO; R2 (497-505); Q2.9B-3 (637-674) |
| `test/live-player-console-first-down.test.mjs` | LPT-27 (636-656, Collapse releases), LPT-28 (658-684, Copy releases after completion — **must be amended**), LPT-29 (686-712, next play unpins) |
| `test/live-player-terminal-v02-transport.test.mjs` | LPT-T1 through T11 (V1 T2 transport tests, 10/10 pass) |

## Reports consumed
| File | Role |
|---|---|
| `REPORTS/Claude/S48.0-...` | Architecture decision: native VS Code Terminal, direct-shell, `TerminalShellExecution.read()` tap |
| `REPORTS/AntiGravity/S49.0-...` | T1: `output` activity category, whitespace preservation, CONSOLE_LABELS, consolePlaceholderText |
| `REPORTS/Claude/S50.0-...` | T2 implementation: line assembler, sessionKey, output budget, pump, tests T2-1..T2-11 |
| `REPORTS/AntiGravity/S51.0-...` | Reconnaissance + audit of Scout B's report; identifies two contradictions |
| `REPORTS/Claude/S53.0-...` | Architecture: five Play plan for retention, discovery, AUTO routing; proposed `terminal-intent.ts`, `advancedPlayerDiscovery`, `terminalRetention` (all unimplemented) |
| `Scouts/terminal-ux-routing-recon.../SCOUT-scout-b-discovery-routing-Reconnaissance.md` | Scout B (Laguna) raw report — contains the contradictions above |
| `Docs ANCHOR/TERMINAL-COMMAND-INTELLIGENT-ROUTING-BREADCRUMB.md` | Pre-existing breadcrumb: proposed TERMINAL_PLAY route class, risk taxonomy, "first proving slice" (NOT IMPLEMENTED) |

---

# 8. OWNERSHIP / SEAMS

**Dev Mode → View Player Terminal settings:**
- Data model: `src/running-players.ts:18-31` (CoachPreferences, DEFAULT_PREFERENCES)
- Validation/persistence: `src/control-plane/daemon.ts:2013-2066` (POST /api/preferences, 3 fields only)
- Gate helper: `src/control-plane/daemon.ts:2890-2892` (`livePlayerTerminalEnabled()`)
- Browser UI: `src/public/index.html:1123-1136` (toggles), `:5466-5484` (sync + toggle handler), `:2209` (liveConsoleEnabled predicate)

**Check Players projection/filtering:**
- `projectDiscovery`: `src/running-players.ts:70-77` — filters `externalCandidates` + `runningElsewhere` only; PASSES `adoptableTerminals` through unconditionally
- Daemon projection: `src/control-plane/daemon.ts:3015-3018` (calls `projectDiscovery`)
- Browser rendering: `src/public/index.html:3109-3229` (`renderRecruit`, adoptableTerminals loop at 3209-3229)

**Player discovery source → routing capability:**
- `PlayerDiscoveryService.discover()`: `src/player-discovery.ts:426-471` (catalog + externalCandidates + runningElsewhere)
- `PlayerRoster.adoptableTerminals()`: `src/player-roster.ts:826-835` (open human shells)
- `PlayerRoster.discoverPlayers()`: `src/player-roster.ts:920-935` (attaches adoptableTerminals to payload)
- `PlayerRoster.withVirtualCatalog()`: `src/player-roster.ts:371-386` (merges virtual catalog entries only; does NOT handle adoptableTerminals)
- `PlayerRoster.getRoutingCapabilities()`: `src/player-roster.ts:1490-1549` (Terminal capability at 1497-1510)
- Final AUTO input: `session.capabilities` (`router.ts:190`, `server.ts:427,540,644`)

**Terminal evidence retention (browser presentation only):**
- `stripCopy`: `src/public/index.html:2575-2646` (returns null for non-Scout couldnt-finish/unknown at 2604-2617)
- `renderPlayStrip`: `src/public/index.html:2649-2846` (pin rescue at 2884-2885)
- `isTerminalEligible`: `src/public/index.html:2763-2766`
- `renderPlayerStrips`: `src/public/index.html:2881-2910`
- `copyConsole`: `src/public/index.html:2416-2444` (dismissal at 2436-2442)
- `scheduleFinishedDecay`: `index.html:2871-2878` (30s timer via RICH_FINISHED_MS at 2157)
- Server-side grace: `work-ledger.ts:23` (REPORT_GRACE_MS = 2 min), `execution-projection.ts:128`

**AUTO routing for terminal-only intent:**
- Exclusion: `src/routing-policy.ts:330-332` (hard-excludes terminal/direct-shell)
- Q2.9C branch: `src/routing-policy.ts:360` (single-legacy, only sees non-terminals)
- Context-aware exclusion: `src/routing-policy.ts:580` (second exclusion site)
- Context-aware AUTO call: `src/routing-policy.ts:844` (calls computeAutoRoute for new work)
- Router entry: `src/control-plane/router.ts:117-125` (two paths: computeAutoRoute or computeContextAwareRoute)
- Server entry points: `src/server.ts:428` (route preview), `src/server.ts:548` (startup decision), `src/server.ts:645` (dispatch)

**Command safety boundary:**
- `checkTerminalCommand`: `src/terminal-player.ts:39-57` (guard, not classifier)
- Enforcement at execution: `src/player-roster.ts:720` (called in `runTerminalCommand`)

---

# 9. RISKS / BOUNDARIES

1. **False-positive shell execution risk.** If AUTO routes natural-language prompts to a shell, destructive commands could execute. The classifier must be conservative. `checkTerminalCommand` is insufficient (accepts `"check git status"`). A closed-grammar classifier (S53 Play 4) with `checkTerminalCommand` as a secondary guard is the proposed design.

2. **Execution-state falsification risk.** Retaining terminal evidence must NOT keep `view.state === 'working'`. The daemon and ledger truth must remain factual. Retention is presentation-only.

3. **Dual routing call-site risk.** `computeAutoRoute` is called from `server.ts:428,548,645` and indirectly via `computeContextAwareRoute` at `routing-policy.ts:844`. Wiring Terminal-only AUTO at only `computeAutoRoute` would be bypassed when `computeContextAwareRoute` is active (it filters terminals at line 580 before calling computeAutoRoute at line 844).

4. **Memory accumulation.** If retention is set to "until manual collapse" indefinitely and many commands are run, stale terminal bodies could accumulate in browser memory. `CONSOLE_MAX_ENTRIES = 300` (index.html:2210) bounds the daemon store, but the browser pin set is unbounded.

5. **Working-tree drift.** Both S51 and S53 note the working tree carries ~45 uncommitted files from unrelated work. Line numbers drift in several target files. Baseline-first approach (npm run compile, git diff hash) is recommended before any implementation.

6. **Grep tool limitation.** As S53 notes, the Grep tool silently skips `daemon.ts` and `work-ledger.ts` when they contain NUL bytes. This Scout used `grep` with the `include` filter and also direct `read` to work around this. Any future Scout should use `grep -a` equivalent or read directly.

---

# 10. WHAT DOES NOT NEED ARCHITECTURE

- **Terminal Player substrate (S48-S50)** is settled. Native VS Code Terminal, direct-shell, `TerminalShellExecution.read()` tap, `output` category, sessionKey derivation — all field-proved and covered by 60 passing tests across `p0-1-terminal-player`, `live-player-terminal-v02-transport`, and `live-player-console-first-down`.
- **Terminal as first-class Player** is settled (`playerType: 'terminal'`, `executionType: 'direct-shell'`, model/reasoning stripping at `router.ts:284-286`).
- **Dev Mode → View Player Terminal** gate is settled (`livePlayerTerminalEnabled()` at `daemon.ts:2890`, AND of devMode + livePlayerConsole).
- **Terminal is MANUAL-only** is settled and tested (P0.1-T2, R1 in game-and-player-lifecycle).
- **Report retention ≠ Terminal evidence retention** — they use separate lifecycles (file-based reports with acknowledgement vs. in-memory activity store with browser pin). Do not merge (S51 §7, S53 §Report Visibility).
- **Only Coach-dispatched commands are captured** (S50 #2, `player-roster.ts:793-798`, `terminal-player.ts:4`).
- **Coach-managed vs. adopted terminal ownership** is settled (`addTerminalPlayer` → coach-managed/disposable; `adoptTerminal` → adopted/detachable).
- **The Terminal is a persistent shell** — `cd`/env setters are state mutations (S53 §What Does Not Need Architecture, item 4).

---

# 11. ARCHITECT DECISIONS REQUIRED

1. **Default success-retention duration** (S53 D1): 30s / 5m / 30m / until-closed. Provisional recommendation: 5m, but not ratified.
2. **Failed/unknown-outcome evidence retention** (S53 D2): no timer (stays until dismissed or next Play). Proceed unless objected.
3. **Server lifecycle commands in AUTO** (S53 D3): `npm start`, `kill`, `taskkill` — not auto-routed in v1. Proceed unless objected.
4. **Auto-expand Terminal output** (S53 D4): desktop only (≥620px), no setting. Proceed unless objected.
5. **AUTO never types into adopted (human-owned) shells** (S53 D5): Coach-managed Terminals only. Proceed unless objected.
6. **Exact allowlist/syntax rules for `isUnambiguousShellCommand`** (S53 Play 4): the grammar table (inspect commands, project-commands, denylist) needs ratification.
7. **Terminal close-mid-command behavior** (S50 #3): pre-existing gap; `retireTerminal` does not clear `runningCommands` or emit an `unknown` turn. Decide whether retention depends on this being fixed.
8. **Output flood policy** (S50 #2/S53 risk #6): current policy keeps the head (first 500/s), losing a failing run's tail (e.g., test summary). Tail-preservation is a future product choice.
9. **`TERMINAL-SCOUT-AI-HEALTH-BREADCRUMBS__2026-09-20.md`** (S53, S51): referenced in two reports as potentially existing but NOT FOUND in the repository. Human should confirm whether it exists elsewhere or was never created.

---

# 12. ARCHITECTURAL SEAMS FOR FUTURE IMPLEMENTATION

Per S53, the work breaks into five bounded Plays:

| Play | Objective | Files (proposed) | Risk |
|---|---|---|---|
| 1 | Dad-Safe Advanced Player Discovery: add `advancedPlayerDiscovery` pref (Dev Mode only, default false), gate `adoptableTerminals` in `projectDiscovery` | `running-players.ts`, `daemon.ts`, `index.html` | Low |
| 2 | Terminal Evidence Retention Core: per-Player `terminalEvidence` record, fast-success/failure retention, failure card, Copy decoupling, sessionStorage | `index.html` only + tests | Medium |
| 3 | Retention Setting + Auto-Expand: add `terminalRetention` enum, auto-expand for `direct-shell` desktop only | `running-players.ts`, `daemon.ts`, `index.html` | Low-Medium |
| 4 | Shell-Intent Classifier: `src/terminal-intent.ts` (pure, unwired), closed-grammar classification | New `terminal-intent.ts` + test | Safety-critical |
| 5 | AUTO Terminal Wire-In: `computeTerminalAutoRoute` at both `computeAutoRoute` and `computeContextAwareRoute`, additive `ownership` on capability | `routing-policy.ts`, `capability-types.ts`, `player-roster.ts` | Medium |

**Protected files (must not be touched by any Play):** `src/player-activity.ts`, `src/terminal-player.ts` substrate, output pump in `src/player-roster.ts`, `src/stadium-client.ts`, `src/control-plane/work-ledger.ts`, `src/control-plane/execution-projection.ts`, `src/player-control/**`.

---

# 13. FINAL ASSESSMENT

The Terminal Player substrate (S48-S50) is settled and field-proved. The **product-direction gaps** identified in the objective are all **pre-implementation** — they exist as proposed Plays in S53 but have **no corresponding code** yet:

1. **Advanced Player Discovery** — does not exist. Raw shells leak via `projectDiscovery` (which ignores `adoptableTerminals`) and `renderRecruit` (which renders all of them at `index.html:3209-3229`).
2. **Configurable Terminal evidence retention** — does not exist. Retention is keyed on `ExecutionView.state` which decays after 30s (`RICH_FINISHED_MS`) / 2 min (`REPORT_GRACE_MS`), causing fast-failures to vanish (`stripCopy → null` at `index.html:2617`) and fast-successes to go unpinned if not expanded in time.
3. **Copy is not inherently dismissal** — currently violated at `index.html:2436-2442`.
4. **AUTO routing for terminal-only intent** — Terminal is hard-excluded from AUTO at `routing-policy.ts:330-332` and `:580`. No classifier exists.

Scout B's report (Laguna) contains **two material contradictions** plus three minor inaccuracies that an Architect must not propagate. S51.0 has already corrected these. The current source is consistent with S51/S53's assessment: Terminal is MANUAL-only, raw shells leak in Dad mode, retention is fragile, and AUTO cannot route to Terminal.

---

SCOUT AGENT: sideline-scout (Scout ID: scout-b-discovery-routing)
SCOUT MODEL: openrouter/poolside/laguna-s-2.1:free
REPORT TYPE: SCOUT REPORT
STATUS: COMPLETE — bounded reconnaissance finished. No source modified, no git mutated, no shell commands executed, no packages installed, no subagents launched.
LIMITATION: This is reconnaissance, not final architectural authority. Source files in the working tree carry uncommitted changes from unrelated work (S53 risk #11); line numbers are current as of the read time but may drift. The Grep tool silently skips files with NUL bytes in `daemon.ts` and `work-ledger.ts` (S53 §What Future Workers Must NOT Rediscover, item 6) — this Scout used direct `read` for those files.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907

