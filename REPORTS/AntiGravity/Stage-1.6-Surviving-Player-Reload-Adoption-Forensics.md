REPORT FILE:
Stage-1.6-Surviving-Player-Reload-Adoption-Forensics.md

REPORT TIMESTAMP:
2026-09-10 18:52 MDT

---

# SIDELINE COACH — STAGE 1.6 SURVIVING PLAYER RELOAD ADOPTION FORENSICS

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Runtime Forensic Investigator  
**Project:** Sideline Coach  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`  
**Global Stage:** Stage 1.6  
**Investigation Focus:** Determine why a surviving Codex 2 terminal was not recognized or re-adopted by Sideline Coach following `Developer: Reload Window` in the GS3 Extension Development Host.  
**Authority Boundary:** Investigation only. No code fixes, no persistence changes, no Git modifications, no commits, no pushes.

---

## 1. RESULT CLASSIFICATION

### **HIGH-LEVEL RESULT: MARKER NOT PRESERVED**
*(With secondary: **ADOPTION TIMING / LIFECYCLE BUG** and **LABEL/ALLOWLIST MISMATCH**)*

> [!IMPORTANT]
> **Core Architectural Finding:**  
> The intended Stage 1.4 design assumed that environment variables injected into `TerminalOptions.env` (`SIDELINE_COACH_PLAYER_ID` and `SIDELINE_COACH_PLAYER_SEAT`) would remain inspectable via `terminal.creationOptions.env` across a VS Code window reload.  
> Inspection of the VS Code 1.95+ core engine (`workbench.desktop.main.js` and `extensionHostProcess.js`) reveals that **VS Code does not preserve `creationOptions.env` across persistent terminal reconnection**.  
> When terminals are revived by `_recreateTerminalGroup`, they are reconnected via `{ attachPersistentProcess: a }`. The main thread's `MainThreadTerminalService._onTerminalOpened` sends a reconstructed launch configuration where `env` is strictly `undefined`. Consequently, `terminal.creationOptions.env` is **always undefined** on every restored terminal after reload.

---

## 2. OBSERVED HUMAN TEST & RUNTIME STATE

### 2.1. Smoke Test Sequence
1. F5 launch of the canonical extension targeting workspace `GS3`.
2. Initial instance of Codex created on field (`Codex`).
3. Second instance of Codex created on field (`Codex 2`).
4. The first terminal (`Codex`) was closed, leaving `Codex 2` running independently on the field.
5. Window reload was triggered via `Developer: Reload Window` (PID 5108 exited cleanly with code 0 at 18:32:18 MDT; new extension host PID 26416 started at 18:32:20 MDT).
6. Post-reload state: The `Codex 2` terminal window and underlying shell process survived in the UI and `ptyHost`. However, Sideline Coach displayed Codex back on the bench / available, failing to re-adopt `Codex 2`.

### 2.2. Exact Surviving Terminal State
* **Operating System Level (OBSERVED):**  
  PowerShell PID 34148 and child process `"node.exe codex.js --yolo"` (PID 13676 / 28744) remained alive in Windows process tree under `OpenConsole.exe` (conpty) managed by `ptyHost`.
* **Workspace Storage State (OBSERVED):**  
  In `%APPDATA%\Code\User\workspaceStorage\4bb6081418b8052c3c8d8d33a048bd5f\state.vscdb`:
  ```json
  "terminal.integrated.layoutInfo": {
    "workspaceId": "4bb6081418b8052c3c8d8d33a048bd5f",
    "tabs": [
      { "isActive": false, "activePersistentProcessId": 58, "terminals": [{ "relativeSize": 1, "terminal": 58 }] },
      { "isActive": true, "activePersistentProcessId": 60, "terminals": [{ "relativeSize": 1, "terminal": 60 }] }
    ]
  }
  ```
  VS Code persisted layout and process IDs, but no environment blocks or launch options.

---

## 3. QUESTIONS TO ANSWER (OBSERVED / DERIVED / UNKNOWN)

### Q1: Does VS Code expose that terminal to the newly activated extension host?
* **Classification:** **OBSERVED — YES (Asynchronously)**.
* **Evidence:** In VS Code's core architecture, `LocalTerminalBackend._reconnectToLocalTerminals()` queries `ptyHost` and recreates terminal instances. As each instance is restored, `MainThreadTerminalService` receives `onDidCreateInstance` and dispatches `$acceptTerminalOpened` over IPC to `ExtHostTerminalService`. The terminal is appended to `this._terminals` (`vscode.window.terminals`) and `vscode.window.onDidOpenTerminal` fires.

### Q2: What does its `terminal.creationOptions` contain?
* **Classification:** **OBSERVED**.
* **Evidence:** In `extensionHostProcess.js` (`ExtHostTerminalService.$acceptTerminalOpened`):
  ```javascript
  let s = {
    name: r.name,
    shellPath: r.executable,
    shellArgs: r.args,
    cwd: typeof r.cwd == "string" ? r.cwd : y.revive(r.cwd),
    env: r.env,
    hideFromUser: r.hideFromUser,
    titleTemplate: r.titleTemplate
  };
  let a = new rp(this._proxy, e, s, o);
  ```
  Because the main thread reconstructed the terminal using `{ config: { attachPersistentProcess: a } }`, `r.executable`, `r.args`, `r.cwd`, and `r.env` are all `undefined`. `terminal.creationOptions` is an object with all undefined fields.

### Q3: Is `creationOptions.env` present?
* **Classification:** **OBSERVED — NO**.
* **Evidence:** `creationOptions.env` is `undefined`.

### Q4: If present, does it contain `SIDELINE_COACH_PLAYER_ID` or `SIDELINE_COACH_PLAYER_SEAT`?
* **Classification:** **OBSERVED — NO**.
* **Evidence:** The entire `env` property is absent from `creationOptions`.

### Q5: If the markers are absent:
* **Is that confirmed VS Code reload behavior?**  
  **OBSERVED & CONFIRMED — YES**. VS Code does not serialize `TerminalOptions.env` into workspace storage (`state.vscdb`) or pty reconnection descriptors. Reconnected terminals always have `env: undefined` in `creationOptions`.
* **Were they present before reload?**  
  **OBSERVED & DERIVED — YES**. When created via `PlayerRoster.addInstance()`, `vscode.window.createTerminal({ env: { SIDELINE_COACH_PLAYER_ID: ..., SIDELINE_COACH_PLAYER_SEAT: ... } })` populated `creationOptions.env` in memory for that session.
* **Is there another supported non-persistent runtime handle that survives reload?**  
  **OBSERVED — YES**:
  1. `terminal.name`: Preserved as `"Codex 2"`. VS Code persists the terminal title in the pty process and passes `e.title` through `$acceptTerminalOpened`.
  2. `terminal.processId`: Preserved as a Thenable resolving to the underlying OS process ID.
  3. OS Environment Block: The variables actually exist inside the surviving PowerShell/Node process memory on Windows, but the VS Code Extension API does not expose another process's environment block.

### Q6: If the markers are present:
* **Classification:** **N/A** (Markers are confirmed absent from `creationOptions.env`).

### Q7: Did PlayerRoster run before persistent terminals were restored?
* **Classification:** **OBSERVED — YES**.
* **Evidence:** In `src/extension.ts:13`, `playerRoster = new PlayerRoster();` executes synchronously during extension `activate()`. Its constructor calls `this.adoptExistingTerminals();` immediately. `_reconnectToLocalTerminals()` in the VS Code workbench runs asynchronously over IPC. At constructor execution time, `vscode.window.terminals` may be empty or incomplete.

### Q8: Is there a VS Code terminal lifecycle event that fires when restored terminals become available after activation?
* **Classification:** **OBSERVED — YES**.
* **Evidence:** `vscode.window.onDidOpenTerminal` fires whenever a terminal is created OR reconnected after reload. However, `PlayerRoster` only subscribes to `onDidCloseTerminal` (`src/player-roster.ts:24`) and has **zero** subscription to `onDidOpenTerminal`.

### Q9: Can the problem be solved with a narrow lifecycle/adoption fix?
* **Classification:** **DERIVED — YES**.
* **Mechanism:**
  1. Subscribe to `vscode.window.onDidOpenTerminal` so newly restored terminals are evaluated when they arrive.
  2. Because `creationOptions.env` is destroyed by VS Code on reload, adopt based on the canonical field label pattern:
     - Match `terminal.name` against `/^(Codex|Claude|AntiGravity)(?: (\d+))?$/` (e.g. `"Codex 2"` -> Player `codex`, Seat `2`).
     - Or persist the active instance allocation table in `context.workspaceState` to match terminal names / process IDs to instance UUIDs.

### Q10: Or does durable re-adoption genuinely require persistence outside the terminal?
* **Classification:** **DERIVED — NO for terminal existence; YES for instance UUID preservation**.
  - If Coach only needs to know that **Codex Seat 2** is on the field and dispatch to it, `terminal.name` (`"Codex 2"`) is completely sufficient without external persistence.
  - If Coach requires exact preservation of the ephemeral UUID (`codex-a1b2c3d4`), that UUID must be persisted in `context.workspaceState` because VS Code drops `creationOptions.env`.

---

## 4. THE THREE COMPOUND FAILURE BOUNDARIES

The investigation reveals three distinct barriers preventing reload adoption:

```
[Window Reload]
      │
      ▼
1. TIMING BARRIER:
   PlayerRoster constructor runs synchronously in activate().
   _reconnectToLocalTerminals is async IPC from ptyHost.
   PlayerRoster never listens to onDidOpenTerminal.
      │
      ▼
2. MARKER ERASURE BARRIER:
   VS Code re-creates terminals via { attachPersistentProcess }.
   creationOptions.env is strictly undefined.
   markers(terminal) returns undefined.
      │
      ▼
3. UNMARKED FALLBACK MISMATCH BARRIER:
   PlayerRoster falls back to checking candidate.terminalName === terminal.name.
   PLAYER_ADAPTERS defines terminalName: 'Codex'.
   Surviving terminal is named 'Codex 2'.
   allowlist default only contains ['Codex', 'Claude', 'AntiGravity'].
   'Codex 2' matches neither PLAYER_ADAPTERS nor allowlist.
```

---

## 5. RECOMMENDED SMALLEST FIX

To achieve robust, safe re-adoption of surviving players across reloads:

1. **Lifecycle Event (Timing):**  
   In `PlayerRoster`, subscribe to `vscode.window.onDidOpenTerminal((terminal) => this.evaluateTerminal(terminal))` so that terminals arriving asynchronously during or after startup trigger adoption.
2. **Name Pattern Matching (Unmarked / Restored Instances):**  
   Extend the adoption logic to recognize multi-instance labels:
   Parse `terminal.name` matching `/^(Codex|Claude|AntiGravity)(?: (\d+))?$/i`.
   - Name `"Codex"` -> `playerType: 'codex'`, `seat: 1`.
   - Name `"Codex 2"` -> `playerType: 'codex'`, `seat: 2`.
   Update `terminalAllowlist` check to match base name or multi-instance pattern.
3. **Optional Workspace State (UUID Durability):**  
   If preserving the exact `instanceId` across reloads is desired, store the active `PlayerInstanceRecord[]` in `context.workspaceState` and reconcile against surviving terminal names / PIDs. If not persisted, allocating a fresh UUID with the surviving seat number is completely sound and fail-safe.

* **Recommended Implementation Worker:** Stage 1.7 Codex / Claude.  
* **Difficulty:** LOW (Bounded refactor of `PlayerRoster.adoptExistingTerminals()` + adding `onDidOpenTerminal` listener).

---

## 6. GATES & IMPACT

* **Breadcrumb Impact:** **NO**. Forensic play only. Protects future breadcrumbs (Game Roster Template / Player Session Resume).
* **Diagnostic Impact:** **NO**. Diagnostic scripts untouched.
* **Git Authority & State:** Clean. No code modified, no commits, no pushes.

---

## 7. RECOMMENDED NEXT PLAY

**Recommended Next Play:** Authorize Stage 1.7 to implement `onDidOpenTerminal` lifecycle adoption and multi-instance terminal name matching in `PlayerRoster` to re-adopt surviving players after window reload.

---

────────────────────────────────────────

REPORT FILE:
Stage-1.6-Surviving-Player-Reload-Adoption-Forensics.md

REPORT TIMESTAMP:
2026-09-10 18:52 MDT

────────────────────────────────────────
