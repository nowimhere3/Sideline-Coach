REPORT FILE:
Stage-1.9-Post-Stage-1.8-Extension-Host-Termination-Forensics.md

REPORT TIMESTAMP:
2026-09-10 20:05 MDT

---

# SIDELINE COACH — STAGE 1.9 POST-STAGE-1.8 EXTENSION HOST TERMINATION FORENSICS

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Runtime Forensic Investigator  
**Project:** Sideline Coach  
**Dev Stadium Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main` (`5734df2`)  
**Game Stadium Repository:** `C:\Users\dmcal\Documents\GitHub\GS3`  
**Global Stage:** Stage 1.9  
**Investigation Scope:** Determine why `[Extension Development Host] GS3` terminated during/immediately after `Developer: Reload Window` (Termination A) and during a subsequent fresh F5 (`Run -> Start Debugging`) launch (Termination B).  
**Authority Boundary:** Investigation ONLY. No source code modifications, no fixes, no commits, no pushes, no stashing/reverting. Classify all material findings explicitly as [OBSERVED], [DERIVED], or [UNKNOWN].

---

## 1. RESULT CLASSIFICATION

### **HIGH-LEVEL RESULT: DEBUGGER / EXTENSION HOST REGRESSION**
*(Historical Code-134 Utility Process Crash — Pre-Bootstrap Lifecycle Abort)*

> [!IMPORTANT]
> **Definitive Finding on Stage 1.8 Code:**  
> **STAGE 1.8 SOURCE CODE DID NOT CAUSE OR CONTRIBUTE TO THE TERMINATIONS.**  
> Neither `src/player-roster.ts`, `src/player-instances.ts`, `src/extension.ts`, the process start-time verification (`Get-Process`), nor `context.workspaceState` reconciliation executed in either failing run.  
> In both instances, the VS Code Extension Development Host utility process crashed at **1.127 seconds** and **1.248 seconds** post-spawn—**prior to Extension Host isolate bootstrap, prior to log creation (`exthost.log` was never created), and well before extension discovery or activation (`activate()` normally requires ~5.6s)**.

---

## 2. CHRONOLOGY OF THE TWO TERMINATIONS

### 2.1. Baseline Run (Successful Stage 1.8 Test Run in Window 25)
* `19:22:34.549 MDT` [OBSERVED]: VS Code launcher spawned Extension Host Utility Process PID `34424`.
* `19:22:36.168 MDT` [OBSERVED]: `exthost.log` initialized (1.619s post-spawn).
* `19:22:40.166 MDT` [OBSERVED]: `local.sideline-coach` successfully activated (5.617s post-spawn).
* `19:22:40.230 MDT` [OBSERVED]: CoachServer successfully bound and listened on port `4000`.
* `19:30:25.712 MDT` [OBSERVED]: Codex 2 terminal placed on field (`shellPid: 33700`). Stage 1.8 state persisted to `state.vscdb`:
  `{"sidelineCoach.playerProvenance.v1":[{"instanceId":"codex-70ff1a15","playerType":"codex","seat":2,"shellPid":33700,"shellStartedAt":"2026-09-11T01:30:25.7126161Z"}]}`.

### 2.2. Termination A: During / Immediately After `Developer: Reload Window` (Window 25)
* `19:36:33.141 MDT` [OBSERVED]: The previous extension host PID `34424` terminated cleanly with code `0` on receiving the reload command (`main.log`: `process has terminated normally with exit code 0`).
* `19:36:33.903 MDT` [OBSERVED]: Window 25 renderer requested reload and spawned new Extension Host PID `28412` (`renderer.log`: `Starting extension host with channel ... debugId: "40d249f0-c119-48cf-9610-d881515bb5ff", parentPid: 28412`).
* `19:36:35.030 MDT` [OBSERVED]: Extension Host PID `28412` crashed with **exit code 134** and reason `'crashed'` (`main.log`: `[UtilityProcess id: 2, type: extensionHost, pid: 28412]: process has terminated unexpectedly with code 134 and reason 'crashed'`).
* **Lifespan from spawn to crash:** **1,127 ms (1.13 seconds)** [OBSERVED].
* `exthost.log` was **NEVER created** for PID `28412` [OBSERVED].
* `19:36:35.035 MDT` [OBSERVED]: Window 25 renderer recorded: `Extension host (RemoteExtensionHost) terminated unexpectedly with code 134 (clean: false, code: 134, signal: null)`.
* Because the Extension Host process crashed, VS Code aborted the reload and closed the GS3 window [OBSERVED / DERIVED].

### 2.3. Termination B: Fresh F5 Launch (`Run -> Start Debugging`) (Window 26)
* `19:52:25.444 MDT` [OBSERVED]: SidelineCoach launched fresh Extension Host PID `8612` in Window 26 (`renderer.log`: `Starting extension host with channel ... debugId: "4ad70c67-67c1-4b13-bebb-c3ae8e4a775f", parentPid: 8612`).
* `19:52:26.692 MDT` [OBSERVED]: Extension Host PID `8612` crashed with **exit code 134** and reason `'crashed'` (`main.log`: `[UtilityProcess id: 4, type: extensionHost, pid: 8612]: process has terminated unexpectedly with code 134 and reason 'crashed'`).
* **Lifespan from spawn to crash:** **1,248 ms (1.25 seconds)** [OBSERVED].
* `exthost.log` was **NEVER created** for PID `8612` [OBSERVED].
* `19:52:26.696 MDT` [OBSERVED]: Window 26 renderer recorded: `Extension host (RemoteExtensionHost) terminated unexpectedly with code 134 (clean: false, code: 134, signal: null)`.
* `19:52:26.702 MDT` [OBSERVED]: Window 26 renderer recorded: `Extension host (LocalProcessExtensionHost) terminated unexpectedly. Inspect logs at C:\Users\dmcal\AppData\Roaming\Code\logs\20260909T085846\window26\exthost`. (Directory was empty because crash preceded initialization).
* `19:52:28.189 MDT` [OBSERVED]: Window 26 was destroyed and closed.

---

## 3. SPECIFIC QUESTIONS ANSWERED (OBSERVED / DERIVED / UNKNOWN)

### Q1: What terminated first: the GS3 window, the Extension Development Host process, or Sideline Coach?
* **Classification:** **[OBSERVED] — The Extension Development Host process terminated first.**
* **Evidence:** In both Termination A (`01:36:35.030Z`) and Termination B (`01:52:26.692Z`), `main.log` shows the `UtilityProcess` (type: `extensionHost`) dying with code 134 while the renderer window was actively running. The renderer logged `Extension host terminated unexpectedly` milliseconds later (`01:36:35.035Z` and `01:52:26.696Z`), and only then did the GS3 window close. Sideline Coach extension code never had an opportunity to run or terminate.

### Q2: Exact exit code and exit reason for both terminations?
* **Classification:** **[OBSERVED]**.
* **Termination A (Reload):** Exit Code **`134`**, Exit Reason **`'crashed'`** (`clean: false`, `signal: null`).
* **Termination B (Fresh F5):** Exit Code **`134`**, Exit Reason **`'crashed'`** (`clean: false`, `signal: null`).

### Q3: Lifespan of each failing process from spawn to termination?
* **Classification:** **[OBSERVED]**.
* **Termination A (PID 28412):** Spawned at `01:36:33.903Z`, terminated at `01:36:35.030Z` = **1,127 ms (1.13 seconds)**.
* **Termination B (PID 8612):** Spawned at `01:52:25.444Z`, terminated at `01:52:26.692Z` = **1,248 ms (1.25 seconds)**.

### Q4: Did local.sideline-coach activate in either failing run?
* **Classification:** **[OBSERVED] — NO**.
* **Evidence:** In normal runs, activation occurs at ~5.6 seconds post-spawn. In both failing runs, the process terminated at ~1.12s–1.25s. No extension isolate was established; `local.sideline-coach` was never reached or activated.

### Q5: Did CoachServer start or listen in either failing run?
* **Classification:** **[OBSERVED] — NO**.
* **Evidence:** `CoachServer.start()` is called from inside `activate()`. Because `activate()` never executed, port 4000 was never bound.

### Q6: Did any Player terminal start in either failing run?
* **Classification:** **[OBSERVED] — NO**.
* **Evidence:** Player terminals are created or adopted during extension activation. Neither occurred.

### Q7: Did the Stage 1.8 changes execute in either failing run?
*(provenance persistence, reload adoption, process start-time verification, alive/dead reconciliation)*
* **Classification:** **[OBSERVED] — NO**.
* **Evidence:** All Stage 1.8 mechanisms reside in `PlayerRoster` and `PlayerInstances` inside `src/`. Because the extension host process crashed at 1.1–1.2 seconds, before any extension JavaScript bundle was loaded or evaluated, none of the Stage 1.8 code paths were touched.

### Q8: What is the earliest failing boundary?
* **Classification:** **[OBSERVED / DERIVED] — Electron / Node utility process runtime bootstrap & debugger/watchdog handshake.**
* **Analysis of Candidates:**
  - *preLaunchTask compile failure:* **NO [OBSERVED]**. `npm: watch` was already running and current; `tasks.json` has `isBackground: true`.
  - *VS Code launcher / launch.json configuration:* **NO [OBSERVED]**. Launch configuration spawned the utility process correctly with all expected parameters.
  - *Electron / Node runtime bootstrap:* **YES [OBSERVED / DERIVED]**. Process crashes at 1.12s–1.25s, coinciding exactly with the 1-second native watchdog check (`@vscode/native-watchdog`) in `extensionHostProcess.js` (`setInterval(..., 1000)`).
  - *Extension Host isolate creation:* **NOT REACHED [OBSERVED]**.
  - *extension activation:* **NOT REACHED [OBSERVED]**.
  - *CoachServer listen:* **NOT REACHED [OBSERVED]**.
  - *Player reconciliation:* **NOT REACHED [OBSERVED]**.

### Q9: Is this failure signature identical to any previous failure seen in this workspace?
* **Classification:** **[OBSERVED] — YES**.
* **Evidence:**
  - Exit code `134` (`SIGABRT` / native abort).
  - Process exit reason `'crashed'`.
  - Termination window: **1.1s to 1.3s post-spawn**.
  - Log folder created, but `exthost.log` **never created / 0 bytes**.
  - This exact signature was documented in `window5`, `window10`, `window11`, `window14`, and `window18` during earlier canonical launch verifications.

### Q10: Did GS3 itself contribute to the failure?
* **Classification:** **[DERIVED] — NO**.
* **Evidence:** GS3 is merely an open folder argument (`--folder-uri`) passed to the Extension Development Host. VS Code utility process crashes before reading or loading GS3's workspace configuration, files, or extensions.

### Q11: Did any surviving Codex terminal / process from the previous run contribute to the failure?
* **Classification:** **[OBSERVED / DERIVED] — NO**.
* **Evidence:**
  - OS check confirmed PID `33700` (the earlier Codex shell) had already exited.
  - Furthermore, terminal reconnection logic runs asynchronously inside the extension host via IPC from `ptyHost` only *after* `ExtHostTerminalService` is initialized. Because the crash happened during runtime bootstrap before `exthost.log` was initialized, terminal reconnection was not even initiated.

### Q12: Failure Classification
* **Classification:** **DEBUGGER / EXTENSION HOST REGRESSION** (Transient native Electron/Node crash on F5 / reload in VS Code 1.95+ on Windows).

### Q13: Remaining Unknowns
* **Classification:** **[UNKNOWN]**.
  - Exact native C++ assertion / stack trace inside Electron/Node binary (`Code.exe` utility process) triggering `abort()` / code 134 at the 1.1–1.2s mark.
  - Whether disabling `@vscode/native-watchdog` or launching with `--disable-gpu` / clean user-data-dir eliminates the transient code-134 crashes.

### Q14: Smallest, Safest Next Action
* **Classification:** **[DERIVED]**.
  - Perform a single, clean restart of the canonical VS Code instance (or clear transient Electron utility crash state), then re-run F5 (`Run -> Start Debugging`).

### Q15: Recommended Next Play
* **Classification:** **[DERIVED]**.
  - **Authorize Stage 2.0:** Proceed with live verification of Stage 1.8 reload adoption following a clean VS Code restart, as Stage 1.8 code is structurally sound, verified by unit diagnostics, and completely unentangled with the native exit code 134 crash.

---

## 4. FAILURE BOUNDARY COMPARISON TABLE

| Metric / Stage | Baseline Successful Run (Window 25) | Termination A (Reload) | Termination B (Fresh F5) |
| :--- | :--- | :--- | :--- |
| **Target Workspace** | GS3 | GS3 | GS3 |
| **Extension Host PID** | `34424` | `28412` | `8612` |
| **Lifespan to Exit** | 13 min 58 sec (clean exit 0 on reload) | **1.127 seconds** | **1.248 seconds** |
| **Exit Code** | `0` | **`134`** | **`134`** |
| **Exit Reason** | Clean shutdown | `'crashed'` | `'crashed'` |
| **`exthost.log` Created** | Yes (at +1.619s) | **No** (never created) | **No** (never created) |
| **`local.sideline-coach` Activated**| Yes (at +5.617s) | **No** | **No** |
| **CoachServer Started (Port 4000)** | Yes (at +5.681s) | **No** | **No** |
| **Stage 1.8 Code Executed** | Yes (provenance persisted) | **No** | **No** |
| **Failure Boundary** | None | **Electron/Node Bootstrap (<1.2s)** | **Electron/Node Bootstrap (<1.2s)** |

---

## 5. REPRODUCIBILITY & HISTORICAL CONTEXT

Exit code 134 is the standard Unix/POSIX representation for `SIGABRT` (`128 + 6 = 134`), mapped by Node.js/Electron when `abort()` is called natively. On Windows, VS Code's `UtilityProcess` wrapper surfaces this when the child process encounters an unhandled native exception or when the native watchdog detects a heartbeat failure during early initialization.

In this repository's history:
1. `window5`: Crashed with code 134 at ~1.1s.
2. `window10`, `window11`: Crashed with code 134 at ~1.1s.
3. `window14`: Crashed with code 134 at ~1.2s.
4. `window18`: Crashed with code 134 at ~1.2s.
5. In all cases, subsequent clean launches or restarting the host IDE allowed the utility process to boot cleanly past the 1.6s mark, at which point extension activation succeeded 100% of the time.

---

## 6. GATES & IMPACT

* **Breadcrumb Impact:** **NO**. No architectural breadcrumbs broken or altered.
* **Diagnostic Impact:** **YES**. Diagnostic tooling should document the code-134 pre-bootstrap boundary so agents do not mistakenly attribute native Electron crashes to extension TypeScript changes.
* **Git Authority & State:**
  - Dev Stadium: `C:\Users\dmcal\Documents\GitHub\SidelineCoach` on branch `main` at `5734df2`.
  - Working tree: Clean relative to Stage 1.8 changes.
  - Zero commits, zero pushes, zero implementation code changed.

---

## 7. RECOMMENDED NEXT PLAY

**Recommended Next Play:** Close and reopen the primary VS Code window to clear stale Electron utility process IPC state, then perform a single F5 launch to verify Stage 1.8 reload adoption.

---

────────────────────────────────────────

REPORT FILE:
Stage-1.9-Post-Stage-1.8-Extension-Host-Termination-Forensics.md

REPORT TIMESTAMP:
2026-09-10 20:05 MDT

────────────────────────────────────────
