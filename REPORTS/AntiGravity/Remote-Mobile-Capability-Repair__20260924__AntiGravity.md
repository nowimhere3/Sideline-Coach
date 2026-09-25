# SIDELINE COACH — REMOTE MOBILE CAPABILITY REPAIR

**Author:** AntiGravity  
**Date:** 2026-09-24  
**Play Name:** Remote Mobile Capability Repair  
**Target Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Target Branch:** `q2.8-multigame-field-debug`  
**Status:** COMPLETE / GREEN

---

## 1. Executive Summary

When using paired Android Remote Access (`remote.mysidelinecoach.com`), users encountered misleading and intrusive toasts stating:
```
This action is available only on the local Sideline.
```
This failure occurred under routine, non-administrative user workflows:
1. Tapping **SCOUTING > Check Players** produced a 403 error toast despite player discovery being a fundamentally read-only operation.
2. Opening **Settings** instantly triggered the error toast because the view unconditionally loaded the local-only OpenRouter credential state (`GET /api/scout/openrouter-credential`).
3. Interacting with local-only settings controls (such as Dev Mode, View Player Terminal, Terminal Retention, Remote Sensitive Output, Advanced Player Discovery, Running Players preferences, Time Format, AI Scoreboard display preferences, and Game Setup folder browse/restore) attempted mutations against `POST /api/preferences` or local-only endpoints, triggering 403 rejections and error toasts.

### The Product Invariant Restored
> **IF A CONTROL IS VISIBLE AND ENABLED ON THE REMOTE SIDELINE, TAPPING IT MUST NOT END IN:**
> `This action is available only on the local Sideline.`
>
> A remote control must instead be one of:
> 1. Browser-local presentation behavior;
> 2. Explicitly supported `remote-read`;
> 3. Explicitly supported `remote-mutate`;
> 4. Genuinely local-only, in which case it must be deliberately hidden or visibly disabled on remote presentation.

### Security Boundary Integrity
At no point was authorization weakened:
- `principalMayAccess` remains strict.
- `POST /api/preferences` remains strictly `local-only`.
- Player recruiting, adoption, and helper-terminal launches remain strictly `local-only`.
- OpenRouter credentials remain strictly `local-only` and are never exposed across the remote boundary.
- Daemon route policies strictly deny unauthenticated and unauthorized remote access.

---

## 2. Slice Analysis & Repair Architectures

### Slice A — Check Players (Discovery vs. Recruitment Boundary)

#### Root Cause
In `src/control-plane/remote-routes.ts`, line 56 defined:
```ts
{ methods: ['POST'], path: /^\/api\/players(?:\/|$)/, access: 'local-only' },
```
Because `POST /api/players/discover` was matched by this broad regular expression, any remote request from a `remote-device` principal was rejected with HTTP 403.
However, `discoverPlayers()` in `src/player-roster.ts` is purely a catalog discovery read operation. It inspects local binaries/terminals and returns catalog metadata and running candidate information. It performs zero mutations.

#### Architecture & Implementation
1. In `src/control-plane/remote-routes.ts`, inserted an explicit policy before the regex catch-all:
   ```ts
   { methods: ['POST'], path: '/api/players/discover', access: 'remote-read' },
   ```
2. In `src/public/index.html`:
   - Created `markLocalOnlyControl(el)` to disable elements on remote presentation and set `title = 'Available only on the local Sideline.'`.
   - In `renderRecruit()`, marked all candidate and recruit action buttons as local-only:
     - "Add to Roster" (candidate adoption)
     - "Add" (roster addition)
     - "Open Install Terminal" (helper-terminal)
     - "Continue Setup" (helper-terminal)
     - "Adopt as Terminal" (terminal adoption)
   - In `runPlayerLifecycle()` and `addPlayerFromRecruit()`, added hard client-side guards:
     ```js
     if (isRemoteDevicePresentation()) return;
     ```
3. **Result:** Remote users can tap "Check Players" to run discovery, view catalog availability and running candidates, with zero toasts and zero 403 errors. All mutation buttons are clearly disabled with informative tooltips.

---

### Slice B — Settings Open (OpenRouter Credential Isolation)

#### Root Cause
In `src/public/index.html`, `openSettings()` unconditionally called:
```js
void loadScoutOpenRouterCredential();
```
`loadScoutOpenRouterCredential()` made a request to:
```
GET /api/scout/openrouter-credential?gameId=<id>
```
Because `/api/scout/openrouter-credential` is classified as `local-only` in `remote-routes.ts`, any remote device principal opening Settings received HTTP 403, and the client displayed the `"This action is available only on the local Sideline."` toast before Settings even rendered.

#### Architecture & Implementation
1. In `openSettings()`, guarded the credential check:
   ```js
   if (!isRemoteDevicePresentation()) {
     void loadScoutOpenRouterCredential();
   } else {
     scoutOpenRouterAvailable = false;
     scoutOpenRouterConfigured = false;
     renderScoutOpenRouterCredential();
   }
   ```
2. In `loadScoutOpenRouterCredential()` and `loadScoutFormationReceivers()`, guarded against execution when `isRemoteDevicePresentation()` is true.
3. Because `scoutOpenRouterAvailable` is forced to `false` on remote surfaces, `scoutOpenRouterCard` remains hidden (`card.hidden = !scoutOpenRouterAvailable`). Credential status, inputs, and tryouts remain invisible and untriggerable on remote devices.
4. **Result:** Remote devices open Settings instantly and cleanly without any network call to the credential endpoint and without error toasts.

---

### Slice C — Remote Settings Capability Hygiene

#### Root Cause
The Settings view contained several preference toggles and radios that persisted their state via `POST /api/preferences`. Because `POST /api/preferences` is strictly `local-only`, tapping any enabled control sent a mutation request that failed with HTTP 403 and showed the authorization error toast. Additionally, the Game Setup card contained browse and restore buttons that invoked local directory pickers and file system checks (`POST /api/games/files/check` and `POST /api/games/files/absolute-path`), which are local-only operations.

#### Architecture & Implementation
Each control in Settings was reconciled according to the capability invariant:

1. **Dev Mode (`devModeToggle`):**
   - Synced via `syncCoachRoutinesSettings`: `markLocalOnlyControl($('devModeToggle'))`.
   - Event listener guarded: `if (isRemoteDevicePresentation() || !canMutateLiveState()) { event.target.checked = !event.target.checked; return; }`.
2. **View Player Terminal (`livePlayerConsoleToggle`):**
   - Synced via `syncLivePlayerConsoleSetting`: `markLocalOnlyControl(toggle)`.
   - Event listener guarded against remote invocation.
3. **Terminal Success Retention (`terminalRetention` radios: 30s, 5m, 30m, until-dismissed):**
   - Synced via `syncTerminalRetentionSetting`: `markLocalOnlyControl($(id))`.
   - Change listener guarded against remote invocation.
4. **Remote Sensitive Terminal Output (`remoteSensitiveTerminalOutputToggle`):**
   - Synced via `syncRemoteSensitiveTerminalOutputSetting`: `markLocalOnlyControl(toggle)`.
   - Event listener guarded against remote invocation.
5. **Advanced Player Discovery (`advancedPlayerDiscoveryToggle`):**
   - Synced via `syncAdvancedPlayerDiscoverySetting`: `markLocalOnlyControl(toggle)`.
   - Event listener guarded against remote invocation.
6. **Running Players Preferences (`runningPrefAsk`, `runningPrefAutoAdd`, `runningPrefIgnore`):**
   - Synced via `syncRunningPlayersPreference`: `markLocalOnlyControl($(id))`.
   - Change listener guarded against remote invocation.
7. **Time Format (`timeFormat12`, `timeFormat24`):**
   - Synced via `syncTimeFormatSetting`: `markLocalOnlyControl($(id))`.
   - Change listener guarded against remote invocation.
8. **AI Usage Scoreboard Radios (Placement, Default State, Compact Percentage, Reset Mode, Density, Reset Marker):**
   - Synced via `wireAiScoreboardRadioSetting`: `markLocalOnlyControl($(id))` applied during sync across all 6 radio groups (14 inputs total).
   - Change listener guarded: `if (isRemoteDevicePresentation() || !canMutateLiveState()) return;`.
9. **AI Usage Scoreboard Mobile Live Terminal Toggle (`aiScoreboardShowOnMobileLiveTerminal`):**
   - Synced via `syncAiScoreboardMobileLiveTerminalSetting`: `markLocalOnlyControl(toggle)`.
   - Change listener guarded against remote invocation.
10. **AI Usage Refresh Cadence Radios (`aiUsageRefresh3`, `5`, `10`, `15`):**
    - Synced via `syncAiUsageRefreshSetting`: `markLocalOnlyControl($(id))`.
    - Change listener guarded against remote invocation.
11. **Game Setup Folder Browse / Restore (`gameSetupReportsChangeBtn`, `gameSetupReportsRestoreBtn`, `gameSetupSopChangeBtn`, `gameSetupSopRestoreBtn`):**
    - Synced via `syncGameSetupSettings`: `changeBtn.disabled = ... || isRemoteDevicePresentation()`, `restoreBtn.disabled = ... || isRemoteDevicePresentation()`, tooltips updated to `'Available only on the local Sideline.'`.
    - Click handlers guarded: `if (!isRemoteDevicePresentation()) openGameBrowser(...)` and `restoreGameSetupFolder(...)` early returns on remote presentation.

---

## 3. Capability Classification Table

| Control ID / Name | View / Location | Remote Classification | Visual State Remotely | Interactive Behavior Remotely |
| :--- | :--- | :--- | :--- | :--- |
| `checkPlayersBtn` | Scouting | `remote-read` | Visible, Enabled | Performs `POST /api/players/discover`, renders catalog, no toast |
| Recruit Action Buttons (`Add`, `Add to Roster`, `Terminal`, `Setup`) | Scouting Catalog | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; early return, no mutation request |
| `settingsBtn` / `settingsBackBtn` / `settingsDoneBtn` | Header / Settings | Browser-Local Presentation | Visible, Enabled | Toggles `#settingsView` / `#mainWorkflow` visibility |
| `scoutOpenRouterCard` | Settings | `local-only` | Hidden | Entire card hidden, zero network requests |
| `devModeToggle` | Settings (Mode) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; reverts check and aborts, no mutation request |
| `livePlayerConsoleToggle` | Settings (Player Terminal) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; reverts check and aborts, no mutation request |
| `terminalRetention` radios (30s, 5m, 30m, until-dismissed) | Settings (Player Terminal) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `remoteSensitiveTerminalOutputToggle` | Settings (Player Terminal) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; reverts check and aborts, no mutation request |
| `advancedPlayerDiscoveryToggle` | Settings (Player Terminal) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; reverts check and aborts, no mutation request |
| `runningPrefAsk`, `auto-add`, `ignore` | Settings (Players & Providers) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `timeFormat12`, `timeFormat24` | Settings (Time Format) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardPlacement` (top/bottom) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardDefaultExpanded` (collapsed/expanded) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardShowOnMobileLiveTerminal` | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; reverts check and aborts, no mutation request |
| `aiScoreboardPercentMode` (left/used/both) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardResetMode` (absolute/countdown/both) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardDensity` (standard/tight) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiScoreboardResetMarker` (separator/icon) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `aiUsageRefresh` (3/5/10/15 min) | Settings (AI Scoreboard) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no mutation request |
| `gameSetupReportsChangeBtn` / `RestoreBtn` | Settings (Game Setup) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no filesystem request |
| `gameSetupSopChangeBtn` / `RestoreBtn` | Settings (Game Setup) | `local-only` | Visible, Disabled (`title = 'Available only on the local Sideline.'`) | No-op; returns early, no filesystem request |
| `coachRepoUrlInput` | Settings (Coach Routines) | `remote-mutate` | Visible, Enabled | Persists repository URL via `PATCH /api/routines/repository` |
| `aiScoreboardPositionBtn` | Scoreboard Header (Mobile) | Browser-Local Presentation | Visible, Enabled | Swaps Scorecard placement in browser DOM without backend mutation |

---

## 4. Verification Evidence

### Automated Test Suite Execution

A dedicated end-to-end test suite was created in [`test/remote-mobile-capability-repair.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/remote-mobile-capability-repair.test.mjs) covering:
1. Route policy classification and security authorization guards.
2. Slice A: Remote Check Players discovery and candidate mutation protection.
3. Slice B: Remote Settings open without OpenRouter credential leakage or toasts.
4. Slice C: Remote Settings hygiene across all 11 categories of local-only controls.
5. Local Parity: Full mutation and preference persistence on local presentation.

#### Test Output:
```
node --test test/remote-mobile-capability-repair.test.mjs
✔ REMOTE-SEC-1: POST /api/players/discover is remote-read; mutations remain local-only (0.8212ms)
✔ SLICE-A-1: Remote user tapping Check Players executes discovery without 403 or toast (166.6181ms)
✔ SLICE-A-2: Local user tapping Check Players leaves candidate actions enabled (61.2393ms)
✔ SLICE-B-1: Opening Settings remotely does NOT fetch OpenRouter credential and shows no toast (79.5493ms)
✔ SLICE-B-2: Opening Settings locally fetches OpenRouter credential normally (77.6191ms)
✔ SLICE-C-1: Local-only controls in Settings are disabled and guarded on remote presentation (1191.9173ms)
✔ SLICE-C-2: Local controls in Settings remain enabled and can save preferences (116.1558ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
```

#### Regression Test Run (120 Tests Across All Impacted Suites):
```
node --test test/remote-mobile-capability-repair.test.mjs test/remote-access-v1-stage5d-settings.test.mjs test/ai-usage-scoreboard-ui.test.mjs test/s55-0-settings-hierarchy.test.mjs test/coach-routines-v0-slice-d-settings.test.mjs test/ai-scoreboard-settings-daemon.test.mjs
ℹ tests 120
ℹ suites 0
ℹ pass 120
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7220.7078
```

#### TypeScript Typecheck & Compilation:
- `npm run check` (`tsc -p ./ --noEmit`): **Exited with code 0 (Clean)**.
- `npm run compile` (`tsc -p ./ && tsc -p relay`): **Exited with code 0 (Clean)**.

---

## 5. Verdict

**FINAL VERDICT: GREEN / GO**

- The product invariant is completely enforced: No visible, enabled remote control ends in `"This action is available only on the local Sideline."`.
- Check Players is 100% functional remotely without exposing recruitment mutations.
- Settings opens cleanly on remote devices without leaking or querying credentials.
- All genuinely local-only controls are visibly disabled with clear explanatory tooltips.
- Daemon route authorization and security boundaries remain strict and uncompromised.
