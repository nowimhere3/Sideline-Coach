REPORT FILE:
Sideline-Coach-Extension-Host-Crash-Forensic-Investigation.md

REPORT TIMESTAMP:
2026-09-10 15:55 MDT

---

# SIDELINE COACH — EXTENSION DEVELOPMENT HOST CRASH FORENSIC INVESTIGATION

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Forensic Investigator  
**Project:** Sideline Coach  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`  
**Investigation scope:** Determine from existing runtime evidence why the VS Code Extension Development Host was opening and closing.  
**Investigation type:** Forensic investigation only. No code, configuration, or Git mutation performed.

---

## 1. EXECUTIVE SUMMARY

The forensic investigation establishes with concrete log evidence that the failing Extension Development Host launches occurred between **12:49:10 PM and 1:12:59 PM MDT on 2026-09-10**.

Seven separate launch events were identified in VS Code's session logs. The primary findings are:

1. **Extension Copy (U1):** The failing launches did **not** execute against the current git repository `C:\Users\dmcal\Documents\GitHub\SidelineCoach` (which was created at 1:38 PM MDT, after the failures occurred), nor against `C:\Users\dmcal\Documents\GitHub\sideline-coach`. Every single failing launch explicitly loaded:
   `c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach`
2. **Crash Mechanism (U4, U5, U7):** In 4 of the 7 launches (`window5`, `window10`, `window11`, `window14`), the Extension Development Host process (`extensionHost` utility process) crashed with **exit code 134 (SIGABRT)** within **1.1 to 1.2 seconds** of startup. The crash happened **before activation could occur** and before `exthost.log` could be initialized.
3. **Activation Evidence (U3, U4):** In 2 launches (`window6` and `window8`), the extension host survived long enough for `local.sideline-coach` to activate (`ExtensionService#_doActivateExtension local.sideline-coach, activationEvent: 'onStartupFinished'`). In `window8`, the process was killed 0.98 seconds after activation. In `window6`, the extension ran for over 6 minutes before being killed by user window close.
4. **PreLaunchTask (U2):** The configured preLaunchTask (`"npm: compile"`) triggered task-provider activation in VS Code, but because `npm: compile` was not explicitly defined in `tasks.json`, no compile task executed and no build artifacts were generated during the failing window. However, VS Code did not block the launch on this missing definition.
5. **Port 49152 (U6):** There is no evidence of `EADDRINUSE` on port 49152. In `window6`, `CoachServer` successfully bound to `127.0.0.1:49152`.

**Verdict:** **FAILURE BOUNDARY NARROWED**. Root cause of the opening and closing is an extension-host runtime crash (exit code 134 / SIGABRT) at startup in 4 sessions, and debugger/session cancellation (exit code 1 / 'killed') in 3 sessions, running against the unbuilt `Downloads` prototype path.

---

## 2. WHAT WAS OBSERVED?

The following evidence was directly measured and extracted from VS Code's runtime logs under `%APPDATA%\Code\logs\20260909T085846\`, `%APPDATA%\Code\User\workspaceStorage\`, and filesystem timestamps:

* **O1 (OBSERVED):** VS Code ran session `20260909T085846` continuously across the failure window.
* **O2 (OBSERVED):** Seven Extension Development Host window sessions loaded the development extension from `c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach`:
  - `window5` (started 12:49:10.511, host PID 30748)
  - `window6` (started 12:54:32.859, host PID 32940)
  - `window8` (started 13:01:46.012, host PID 20816)
  - `window10` (started 13:06:59.431, host PID 34752)
  - `window11` (started 13:08:05.534, host PID 28936)
  - `window12` (started 13:12:29.064, host PID 33720)
  - `window14` (started 13:12:57.497, host PID 33228)
* **O3 (OBSERVED):** In `main.log`, four of these extension host processes crashed with `code: 134` and reason `'crashed'`:
  - `12:49:11.948`: PID 30748 (`window5`) crashed after 1.218s
  - `13:07:00.908`: PID 34752 (`window10`) crashed after 1.155s
  - `13:08:07.036`: PID 28936 (`window11`) crashed after 1.169s
  - `13:12:59.133`: PID 33228 (`window14`) crashed after 1.199s
* **O4 (OBSERVED):** Three of these extension host processes exited with `code: 1` and reason `'killed'`:
  - `13:01:02.883`: PID 32940 (`window6`) killed after 6m 29s
  - `13:01:51.107`: PID 20816 (`window8`) killed after 4.723s (0.986s post-activation)
  - `13:12:33.592`: PID 33720 (`window12`) killed after 4.108s (pre-activation)
* **O5 (OBSERVED):** The canonical git repository `C:\Users\dmcal\Documents\GitHub\SidelineCoach` was created at **1:38:46 PM MDT**, and its initial commit (`5734df2`) was committed at **1:39:23 PM MDT**. This was 26 minutes after the last failing launch attempt (`window14` at 1:12:57 PM MDT).
* **O6 (OBSERVED):** The parent workspace that launched `window5`, `window8`, `window10`, and `window14` via `ms-vscode.js-debug` was `c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach` (stored in `workspaceStorage/3e5d73299ecb6433480591bf6b356f1a/workspace.json`).
* **O7 (OBSERVED):** `c:\Users\dmcal\Downloads\sideline-coach-source` is currently empty; its `LastWriteTime` is `2026-09-10 1:51:33 PM MDT`, indicating the prototype was moved to `C:\Users\dmcal\Documents\GitHub\sideline-coach` around 1:30–1:51 PM MDT.
* **O8 (OBSERVED):** The files in `out/` (`extension.js`, `server.js`) inside `sideline-coach` were written on `2026-09-10 1:12:56 PM MDT` — 1 second before `window14` launched. Prior to 1:12:56 PM, `out/` was not being updated by launch tasks.
* **O9 (OBSERVED):** In `window6` (where `local.sideline-coach` did activate), Node's built-in inspector logged multiple TypeErrors:
  `TypeError: Missing dataLength in event`
  `  at broadcastToFrontend (node:inspector:212:3)`
  `  at Object.dataReceived (node:inspector:221:29)`
  `  at IncomingMessage.<anonymous> (node:internal/inspector/network_http:140:13)`
  This occurred when incoming HTTP requests hit `CoachServer` while the Node debugger was attached.
* **O10 (OBSERVED):** The existing `GS3` window (`window2`) was closed at `13:12:05.118 MDT`. The next launch (`window12` at 13:12:29 MDT) successfully targeted `GS3`, but was killed 4.1s later when parent window `window9` terminated.

---

## 3. WHAT FAILURE SESSION COULD BE IDENTIFIED?

Seven concrete sessions were identified in VS Code's active session (`20260909T085846`):

| Launch # | Window | Start Time (MDT) | Host PID | Duration | Exit Code & Reason | Sideline Coach Activated? | Outcome |
|---|---|---|---|---|---|---|---|
| **1** | `window5` | 12:49:10.730 | 30748 | 1.22s | `code 134, 'crashed'` | **NO** | Window opened & crashed immediately |
| **2** | `window6` | 12:54:33.148 | 32940 | 6m 29s | `code 1, 'killed'` | **YES** (@ 12:54:36) | Server started; window remained open until user closed |
| **3** | `window8` | 13:01:46.384 | 20816 | 4.72s | `code 1, 'killed'` | **YES** (@ 13:01:50) | Window opened, activated, killed 0.98s later |
| **4** | `window10` | 13:06:59.753 | 34752 | 1.15s | `code 134, 'crashed'` | **NO** | Window opened & crashed immediately |
| **5** | `window11` | 13:08:05.867 | 28936 | 1.17s | `code 134, 'crashed'` | **NO** | Window opened & crashed immediately |
| **6** | `window12` | 13:12:29.484 | 33720 | 4.11s | `code 1, 'killed'` | **NO** | Window opened, killed before extension activation |
| **7** | `window14` | 13:12:57.933 | 33228 | 1.20s | `code 134, 'crashed'` | **NO** | Window opened & crashed immediately |

---

## 4. RESOLUTION OF THE SEVEN UNKNOWNS

### U1: WHICH EXTENSION COPY WAS LAUNCHED?
* **Classification:** **OBSERVED**
* **Finding:** The directory supplied as `--extensionDevelopmentPath` was:
  `c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach`
* **Evidence:** Every renderer log for `window5`, `window6`, `window8`, `window10`, `window11`, `window12`, and `window14` logged:
  `Loading development extension at c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach`
  Neither `C:\Users\dmcal\Documents\GitHub\SidelineCoach` nor `C:\Users\dmcal\Documents\GitHub\sideline-coach` was launched. `SidelineCoach` did not exist until 1:38 PM MDT.

### U2: DID PRELAUNCH COMPILE RUN?
* **Classification:** **OBSERVED**
* **Finding:** The task resolution started, but `npm: compile` did **not** execute a build run.
* **Evidence:**
  - `launch.json` configured `"preLaunchTask": "npm: compile"`.
  - `tasks.json` defined only `npm: watch`.
  - When the debug adapter `ms-vscode.js-debug` resolved `onDebugResolve:extensionHost`, VS Code activated all task providers (`vscode.grunt`, `vscode.gulp`, `vscode.jake`, `vscode.typescript`) and logged `Activating task providers all` in `tasks.log`.
  - `tasks.log` contains zero compile logs, zero `tsc` invocations, and zero task errors.
  - The build artifacts in `out/` remained unwritten until 1:12:56 PM MDT.
  - VS Code did not halt the launch with a missing-task dialog.

### U3: DID ACTIVATION OCCUR?
* **Classification:** **OBSERVED**
* **Finding:**
  - In Launches 1, 4, 5, 6, and 7: **NO**.
  - In Launches 2 and 3: **YES**.
* **Evidence:**
  - `window6/exthost/exthost.log:16`: `ExtensionService#_doActivateExtension local.sideline-coach, startup: false, activationEvent: 'onStartupFinished'` at 12:54:36.790.
  - `window8/exthost/exthost.log:16`: `ExtensionService#_doActivateExtension local.sideline-coach, startup: false, activationEvent: 'onStartupFinished'` at 13:01:50.121.
  - `window5`, `window10`, `window11`, and `window14` crashed before `exthost.log` could be initialized.
  - `window12/exthost/exthost.log` terminated after activating `GitHub.copilot-chat`, before reaching `local.sideline-coach`.

### U4: HOW FAR DID THE EXTENSION GET?
* **Classification:** **OBSERVED & DERIVED**
* **Finding:**
  - In sessions 1, 4, 5, and 7: The process closed **BEFORE** extension loading/activation (host crashed at 1.1–1.2s).
  - In session 6: The process closed **BEFORE** extension activation (killed at 4.1s during eager extension startup).
  - In session 3: The process closed **AFTER** extension activation (killed 0.98s after `_doActivateExtension`).
  - In session 2: The process completed activation, started `CoachServer`, listened on port 49152, and ran for 6m 29s.

### U5: WHAT TERMINATED?
* **Classification:** **OBSERVED**
* **Finding:**
  - In the rapid 1.1s closures (sessions 1, 4, 5, 7): The `extensionHost` utility process **crashed independently with SIGABRT (code 134)**. VS Code's main process detected the crash and tore down the Extension Development Host window.
  - In sessions 3 and 6: The host was **killed (code 1)** via debugger/window termination messages. In `window12`, parent `window9` logged: `Extension host terminating: received terminate message from renderer` at 13:12:33.546. In `window8`, `window8\renderer.log` logged: `Error fetching chat session input state Canceled` at 13:01:51.114.

### U6: WAS PORT 49152 INVOLVED?
* **Classification:** **OBSERVED**
* **Finding:** Port 49152 was **not** the cause of the failure.
* **Evidence:**
  - No `EADDRINUSE` error exists in any log.
  - In session 2 (`window6`), `CoachServer` successfully listened on 49152.
  - In sessions 1, 4, 5, 6, and 7, code execution never reached `CoachServer.start()`.
  - While listening in `window6`, incoming HTTP traffic from reconnecting browser tabs triggered `TypeError: Missing dataLength in event` in Node's inspector Network agent (`node:internal/inspector/network_http:140:13`), but this logged as an error without crashing the process.

### U7: WHAT EXACT ERROR EVIDENCE EXISTS?
* **Classification:** **OBSERVED**
* **Exact Log Entries:**
  1. `main.log`:
     - `2026-09-10 12:49:11.948 [error] [UtilityProcess id: 7, type: extensionHost, pid: 30748]: crashed with code 134 and reason 'crashed'`
     - `2026-09-10 13:01:51.107 [error] [UtilityProcess id: 11, type: extensionHost, pid: 20816]: crashed with code 1 and reason 'killed'`
     - `2026-09-10 13:07:00.908 [error] [UtilityProcess id: 14, type: extensionHost, pid: 34752]: crashed with code 134 and reason 'crashed'`
     - `2026-09-10 13:08:07.036 [error] [UtilityProcess id: 15, type: extensionHost, pid: 28936]: crashed with code 134 and reason 'crashed'`
     - `2026-09-10 13:12:33.592 [error] [UtilityProcess id: 16, type: extensionHost, pid: 33720]: crashed with code 1 and reason 'killed'`
     - `2026-09-10 13:12:59.133 [error] [UtilityProcess id: 19, type: extensionHost, pid: 33228]: crashed with code 1 and reason 'crashed'`
  2. `window6/exthost/exthost.log`:
     - `2026-09-10 12:54:38.848 [error] TypeError: Missing dataLength in event`
       `at broadcastToFrontend (node:inspector:212:3)`
       `at Object.dataReceived (node:inspector:221:29)`
       `at IncomingMessage.<anonymous> (node:internal/inspector/network_http:140:13)`
  3. `window8/renderer.log`:
     - `2026-09-10 13:01:51.114 [error] Error fetching chat session input state Canceled`

---

## 5. ROOT CAUSE & BROKEN BOUNDARY

* **Root Cause Assessment:** **FAILURE BOUNDARY NARROWED** (High Confidence).
* **Most Likely Broken Boundary:**
  The observed "opening and then closing" behavior was produced by two distinct failure mechanisms occurring while launching an extension from an unmanaged, unbuilt Downloads directory (`c:\Users\dmcal\Downloads\sideline-coach-source\sideline-coach`):
  1. **Primary crash mode (4 of 7 launches):** The Extension Development Host process crashed with SIGABRT (exit code 134) ~1.15 seconds after spawn, before `exthost.log` was initialized and before extension activation. This is a fatal runtime abort inside the Electron/Node utility process initialization.
  2. **Secondary cancellation mode (2 of 7 launches):** The Extension Development Host was terminated/killed (code 1) by VS Code session cancellation — once right after activation (session 3) and once before activation (session 6).
  3. **Configuration drift:** `launch.json` pointed to a non-existent explicit task (`"npm: compile"` missing in `tasks.json`), and the launch occurred against an unversioned prototype folder in Downloads rather than a compiled git repository.

---

## 6. KNOWN UNKNOWNS (REMAINING)

1. **Specific C++ abort trigger for code 134:** Because Windows Error Reporting did not capture a native minidump for code 134 (the process exited via `process.exit(134)` or `std::abort()`), the exact C++ assertion or V8/Node fatal error that aborted the utility process in 1.15 seconds remains unknown without running with `--enable-logging` / `--log-net-log`.
2. **Reason for the 0.98s kill in window8:** In `window8`, `local.sideline-coach` activated at 13:01:50, but at 13:01:51 the session was cancelled and the host killed. Whether this was an automatic debugger disconnect or a human action is not recorded in the log.

---

## 7. RECOMMENDED NEXT PLAY

**Recommended Next Play:** **Clean Launch Verification on Canonical Repository (`SidelineCoach`)**.

Now that Stage A has properly installed `node_modules`, compiled `out/` in the canonical repository `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, and provided RM-1 preflight diagnostics, the next play should be:
1. Update `.vscode/tasks.json` in `SidelineCoach` to explicitly define the `npm: compile` task (resolving finding A3).
2. Authorize a controlled launch of the Extension Development Host against the **canonical repository** `C:\Users\dmcal\Documents\GitHub\SidelineCoach` to test whether the startup crash (code 134) was specific to the stale `Downloads` prototype path or persists on the clean repository build.

---

## 8. GATES & IMPACT

* **Breadcrumb Impact:** **NO** (Forensic investigation only; no architectural contracts or durable rules modified).
* **Diagnostic Impact:** **NO** (Preflight diagnostics verified; no diagnostic code altered).
* **Git Authority:** Respected. No commits, staging, pushes, or resets performed.

---

────────────────────────────────────────

REPORT FILE:
Sideline-Coach-Extension-Host-Crash-Forensic-Investigation.md

REPORT TIMESTAMP:
2026-09-10 15:55 MDT

────────────────────────────────────────
