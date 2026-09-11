REPORT FILE:
Sideline-Coach-Fresh-Canonical-Launch-Forensics.md

REPORT TIMESTAMP:
2026-09-10 16:38 MDT

---

# SIDELINE COACH — FRESH CANONICAL LAUNCH FORENSIC INSPECTION

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Forensic Investigator  
**Project:** Sideline Coach  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`  
**Play type:** Fresh Canonical Launch Forensic Inspection  
**Scope:** Inspect fresh VS Code runtime logs from the human-initiated F5 / Start Debugging smoke test against the canonical repository, determine whether the rapid startup crash reproduced, compare against historical sessions, and narrow the failure boundary.  
**Authority boundary:** Forensic inspection only. No code fixes, no configuration modification, no dependency changes, no git commits, no git push.

---

## 1. RESULT CLASSIFICATION

### **HIGH-LEVEL RESULT: CANONICAL CRASH REPRODUCED**

* **Historical Crash Signature Comparison:** **MATCHES** (Exact match to historical rapid code-134 / SIGABRT sessions).
* **Summary:** The human-initiated F5 smoke test executed from the canonical `SidelineCoach` VS Code window crashed in **1.133 seconds** with **exit code 134 and reason 'crashed'**, exactly replicating the historical failure signature of sessions `window5`, `window10`, `window11`, and `window14`.

---

## 2. FRESH LAUNCH IDENTITY & CONFIGURATION CONFIRMATION

| Property | Observed / Derived Value | Evidence |
| :--- | :--- | :--- |
| **Launch Window ID** | `window18` | `%APPDATA%\Code\logs\20260909T085846\window18\` |
| **Parent Debug Session** | `window15` (`SidelineCoach`) | `window15\exthost\exthost.log:40-41` |
| **Launch Initiation Timestamp** | `2026-09-10 16:33:01.365 MDT` | Debug adapter activation in `window15` |
| **Renderer Spawn Timestamp** | `2026-09-10 16:33:04.471 MDT` | `window18\renderer.log:1` |
| **Extension Host Spawn** | `2026-09-10 16:33:04.932 MDT` | `window18\renderer.log:4` (PID 32996) |
| **Extension Host Crash** | `2026-09-10 16:33:06.065 MDT` | `main.log:79-80` |
| **Canonical Path Confirmed** | **YES** (`C:\Users\dmcal\Documents\GitHub\SidelineCoach`) | `window18\renderer.log:6` |
| **GS3 Target Confirmed** | **YES** (`C:\Users\dmcal\Documents\GitHub\GS3`) | `launch.json:10` & `window15` debug resolve |

### 2.1. Canonical Extension Development Path
From `window18\renderer.log` line 6:
```text
2026-09-10 16:33:05.114 [info] Loading development extension at c:\Users\dmcal\Documents\GitHub\SidelineCoach
```
Confirmed **OBSERVED**: The fresh launch loaded from the canonical repository `C:\Users\dmcal\Documents\GitHub\SidelineCoach`.

### 2.2. GS3 Target Workspace Confirmation
From `window15\exthost\exthost.log` lines 40-41:
```text
2026-09-10 16:33:01.365 [info] ExtensionService#_doActivateExtension vscode.debug-server-ready, startup: false, activationEvent: 'onDebugResolve'
2026-09-10 16:33:01.369 [info] ExtensionService#_doActivateExtension ms-vscode.js-debug, startup: false, activationEvent: 'onDebugResolve:extensionHost'
```
The active launch configuration in `window15` [`.vscode/launch.json`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/.vscode/launch.json) explicitly defines:
```json
"args": [
  "--extensionDevelopmentPath=${workspaceFolder}",
  "C:\\Users\\dmcal\\Documents\\GitHub\\GS3"
]
```
Confirmed **DERIVED**: The launch targeted workspace `C:\Users\dmcal\Documents\GitHub\GS3`.

---

## 3. LIFECYCLE & CRASH EVIDENCE

### 3.1. Authoritative Main Process Crash Log
From `%APPDATA%\Code\logs\20260909T085846\main.log` lines 79-80:
```text
2026-09-10 16:33:06.065 [info] Extension host with pid 32996 exited with code: 134, signal: unknown.
2026-09-10 16:33:06.066 [error] [UtilityProcess id: 24, type: extensionHost, pid: 32996]: crashed with code 134 and reason 'crashed'
```

### 3.2. Timing Calculation
* **Process Spawn:** `16:33:04.932 MDT` (`window18\renderer.log:4`)
* **Process Crash:** `16:33:06.065 MDT` (`main.log:79`)
* **Elapsed Lifespan:** **1.133 seconds** (1,133 ms).

### 3.3. Activation & Server Execution
* **Did `local.sideline-coach` activate?** **NO** (OBSERVED). The process crashed before `exthost.log` could be initialized. The directory `window18\exthost` was never created.
* **Did CoachServer start?** **NO** (OBSERVED). Code execution never reached extension entry or server creation.
* **Did it reach the listen/bind step?** **NO** (OBSERVED). Port 49152 was never touched.

---

## 4. COMPARISON TO HISTORICAL SESSIONS

| Session | Launched By | Target Path | Lifespan | Exit Code | Reason | `exthost.log` Created? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `window5` | VS Code F5 (`ms-vscode.js-debug`) | Downloads prototype | 1.218s | **134** | `'crashed'` | NO |
| `window10` | VS Code F5 (`ms-vscode.js-debug`) | Downloads prototype | 1.155s | **134** | `'crashed'` | NO |
| `window11` | VS Code F5 (`ms-vscode.js-debug`) | Downloads prototype | 1.169s | **134** | `'crashed'` | NO |
| `window14` | VS Code F5 (`ms-vscode.js-debug`) | Downloads prototype | 1.199s | **134** | `'crashed'` | NO |
| `window17` | **CLI (`code --extensionDevelopmentPath=...`)** | **Canonical repo** | **Alive** | **0 (on user close)** | **Normal** | **YES (Activated, port bound)** |
| **`window18`** | **VS Code F5 (`ms-vscode.js-debug`)** | **Canonical repo** | **1.133s** | **134** | **'crashed'** | **NO** |

---

## 5. STRONGEST CURRENT FAILURE BOUNDARY

The comparison between `window17` and `window18` isolates the root cause variable with high precision:

1. **Not Code / Build Defect:** When launched via the VS Code CLI without debugger attachment (`window17`), the canonical extension loaded `out/extension.js`, activated cleanly, started `CoachServer`, bound port 49152, responded to HTTP probes, and ran stably for minutes without any abort.
2. **Not Path / Folder Location:** The crash reproduced in `window18` while loading strictly from the canonical path `C:\Users\dmcal\Documents\GitHub\SidelineCoach`. The Downloads folder was not involved.
3. **Debugger / Extension Host Attach Boundary:** The crash occurs exclusively when the Extension Development Host is launched under the VS Code debugger adapter (`ms-vscode.js-debug`) via `type: "extensionHost"`. During the initial debugger handshake (1.13 to 1.21 seconds post-spawn), the Electron/Node utility process crashes with `std::abort()` / `SIGABRT` (exit code 134).
4. **PreLaunchTask Anomaly:** `launch.json` specifies `"preLaunchTask": "npm: compile"`, but `.vscode/tasks.json` defines only `"npm: watch"`. When F5 is pressed, VS Code activates all task providers (`vscode.grunt`, `vscode.gulp`, `vscode.jake`, `vscode.typescript-language-features`) attempting to resolve the missing task before launching the debug session.

---

## 6. REMAINING UNKNOWNS

1. **Exact C++ Assertion in Node/V8 Utility Process:** Whether the abort is triggered by an inspector socket collision, a V8 break-on-start IPC failure, or an uncaught exception during debug adapter handshake cannot be seen without `--enable-logging` / `--log-net-log` on the host process.
2. **Task Resolution Coupling:** Whether the missing `npm: compile` task definition in `tasks.json` leaves the debug adapter in an invalid state during launch handshake.

---

## 7. GATES & IMPACT

* **Breadcrumb Impact:** **NO**. Forensic investigation only; no architectural rules or durable breadcrumbs altered.
* **Diagnostic Impact:** **NO**. Diagnostics scripts untouched.
* **Git State:** Unmutated. Working tree remains clean relative to the Stage A baseline. Zero commits, zero pushes.

---

## 8. RECOMMENDED NEXT PLAY

**Recommended Next Play:** Add the explicit `npm: compile` task to [`.vscode/tasks.json`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/.vscode/tasks.json) to resolve Finding A3, then run the launch under debug logging (`--enable-logging`) to capture the exact abort message during the `ms-vscode.js-debug` handshake.

---

────────────────────────────────────────

REPORT FILE:
Sideline-Coach-Fresh-Canonical-Launch-Forensics.md

REPORT TIMESTAMP:
2026-09-10 16:38 MDT

────────────────────────────────────────
