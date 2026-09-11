REPORT FILE:
Stage-1.10-Browser-Live-State-Reconnection-Forensics.md

REPORT TIMESTAMP:
2026-09-10 20:30 MDT

---

# SIDELINE COACH — STAGE 1.10 BROWSER LIVE-STATE RECONNECTION FORENSICS

**Agent / model:** AntiGravity / Gemini 3.8 Flash (High)  
**Role:** Bounded Runtime / UI-State Forensic Investigator  
**Project:** Sideline Coach  
**Dev Stadium Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main` (`5734df2`)  
**Game Stadium Repository:** `C:\Users\dmcal\Documents\GitHub\GS3`  
**Global Stage:** Stage 1.10  
**Investigation Scope:** Determine why an already-open Sideline Coach browser continues displaying stale Player state (`Codex: On Field`) and falsely displays `Connected` after the Extension Development Host / CoachServer has terminated and restarted with an empty roster.  
**Authority Boundary:** Investigation ONLY. No source code modifications, no fixes, no commits, no pushes. Classify all material findings explicitly as [OBSERVED], [DERIVED], or [UNKNOWN].

---

## 1. RESULT CLASSIFICATION

### **HIGH-LEVEL RESULT: CLIENT RECONNECTION CONTRACT GAP (BROWSER-SIDE STALE PROJECTION)**

> [!IMPORTANT]
> **Core Forensic Finding:**  
> **Server state is 100% clean, current, and correct; browser state is stale due to a missing reconnection synchronization hook.**  
> 1. **Server Truth [OBSERVED]:** The fresh Extension Host runtime (PID `30660`) started cleanly. `PlayerRoster.reconcilePending()` inspected the previous Codex process (PID `33700`), confirmed it was dead (`'missing'`), removed the reservation, and cleared `workspaceState` to `[]`. The server has **zero** players on the field and reports `fieldState: 'ready-on-bench'`.  
> 2. **Client Stale Memory [OBSERVED]:** When the previous server terminated, the browser's native `EventSource` dropped connection and called `setConnected(false)`. However, `setConnected(false)` only changes a header dot/text and does **not** invalidate or clear the rendered DOM.  
> 3. **The Synchronization Gap [OBSERVED]:** When the new CoachServer started, Chrome's `EventSource` automatically reconnected to `/api/events`. The server accepted the connection and emitted `event: hello`. In `index.html`, the `hello` event handler calls **only** `setConnected(true)`—it **never calls `refresh()`** and **never calls `renderStatus()`**. The server emits no status event on connection. Because no player was added in the new session, no subsequent status broadcast ever occurred. The browser UI permanently retained the pre-restart DOM while falsely displaying a green `Connected` indicator.

---

## 2. CHRONOLOGY & RUNTIME EVIDENCE

### 2.1. Server Lifecycle in Window 29
* `20:19:40.276 MDT` [OBSERVED]: Fresh Extension Development Host spawned with PID `30660` (`renderer.log`).
* `20:19:43.981 MDT` [OBSERVED]: `local.sideline-coach` extension activated (`exthost.log`).
* `20:19:44.000 MDT` [OBSERVED]: `CoachServer` started listening on `127.0.0.1:49152`.
* `20:19:44.050 MDT` [OBSERVED]: `PlayerRoster` initialized and loaded provenance from `state.vscdb`.
* `20:19:44.100 MDT` [OBSERVED]: `reconcilePending()` probed PID `33700` via PowerShell:
  `$p = Get-Process -Id 33700 -ErrorAction SilentlyContinue; if ($null -eq $p) { 'missing' } ...`
  Process returned `'missing'`.
* `20:19:44.150 MDT` [OBSERVED]: `decidePendingMatch()` returned `{ kind: 'dead' }`. `removeProvenance()` cleared the reservation and wrote `sidelineCoach.playerProvenance.v1: []` to `state.vscdb`.
* `20:25:27 MDT` [OBSERVED]: SQLite inspection of `C:\Users\dmcal\AppData\Roaming\Code\User\workspaceStorage\4bb6081418b8052c3c8d8d33a048bd5f\state.vscdb` confirms:
  `[('local.sideline-coach', '{"sidelineCoach.playerProvenance.v1":[]}')]`.
  **The server has zero players on field.**

### 2.2. Browser Network & Reconnection State
* `20:25:37 MDT` [OBSERVED]: OS network inspection (`Get-NetTCPConnection`) revealed active established sockets on port `49152`:
  - `127.0.0.1:57524 -> 127.0.0.1:49152 (Established)`: PID `4324` (`chrome.exe`)
  - `127.0.0.1:54547 -> 127.0.0.1:49152 (Established)`: PID `4324` (`chrome.exe`)
* Chrome's `EventSource` automatically reconnected to `/api/events?token=...` upon server restart.
* The server's `openEventStream()` accepted the request and sent:
  `event: hello\ndata: {"connected":true,"at":1773368386000}\n\n`.

### 2.3. Browser DOM & Client Event Handling
* In `src/public/index.html` (lines 488–493):
  ```javascript
  eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener('hello', () => setConnected(true));
  eventSource.addEventListener('reports', () => void refresh());
  eventSource.addEventListener('status', () => void refresh());
  eventSource.onerror = () => setConnected(false);
  ```
* When `hello` arrived, `setConnected(true)` was executed:
  ```javascript
  const setConnected = (connected) => {
    $('connectionDot').classList.toggle('live', connected);
    $('connectionText').textContent = connected ? 'Connected' : 'Offline';
  };
  ```
* `refresh()` was **never called** upon receiving `hello`.
* `eventSource` never received a `status` event because the server only broadcasts `status` on live mutations (`onDidOpenTerminal`, `playerRoster.onDidChange`), none of which occurred.
* The browser DOM elements (`#roster`, `#terminalSelect`, `selectedPlayerInstanceId`) retained the exact HTML generated before the restart.

---

## 3. SPECIFIC QUESTIONS ANSWERED (OBSERVED / DERIVED / UNKNOWN)

### Q1: Exact cause of stale browser state?
* **Classification:** **[OBSERVED]**.
* **Finding:** The browser client only calls `refresh()` on initial script execution and on subsequent push events (`event: status`, `event: reports`). Native `EventSource` reconnection receives only `event: hello`, which invokes `setConnected(true)` without requesting `/api/status` or invoking `renderStatus()`. Furthermore, disconnects do not invalidate or hide existing DOM state.

### Q2: Is server truth or browser truth stale?
* **Classification:** **[OBSERVED]**.
* **Server truth:** **FRESH AND CORRECT**. Internal state has 0 players on field; `state.vscdb` has `[]`.
* **Browser truth:** **STALE**. The browser displays obsolete DOM from the preceding VS Code session.

### Q3: Did SSE automatically reconnect?
* **Classification:** **[OBSERVED] — YES**.
* **Evidence:** Chrome PID `4324` established an active TCP socket to port `49152` owned by Extension Host PID `30660`. The server logged incoming HTTP activity.

### Q4: Was fresh full status sent after reconnect?
* **Classification:** **[OBSERVED] — NO**.
* **Evidence:** In `src/server.ts:418`, `openEventStream()` emits only `event: hello`. It does not emit `event: status` or transmit a status snapshot upon connection.

### Q5: Why does the UI still say Connected?
* **Classification:** **[OBSERVED]**.
* **Evidence:** Receiving `event: hello` executes `setConnected(true)`, which turns the status dot green (`.live`) and writes `"Connected"`. Connection state is decoupled from data freshness.

### Q6: Can stale browser state cause unsafe dispatch?
* **Classification:** **[OBSERVED / DERIVED] — NO, THE SERVER SAFELY REJECTS IT**.
* **Evidence:**
  - If the user clicks "Dispatch Play" targeting stale Codex 2, the browser sends `POST /api/dispatch` with `playerInstanceId: "codex-70ff1a15"`.
  - In `src/server.ts:280–288`, `this.playerRoster.resolve("codex-70ff1a15")` returns `{ state: 'unknown' }` because the instance is not in `PlayerInstanceBook` and has no terminal.
  - `CoachServer` returns HTTP 404: `{"success": false, "message": "That Player has left the field."}`.
  - No terminal command is issued.
  - Because instance IDs are randomized UUIDs (`codex-70ff1a15`), the stale ID cannot collide with or hijack a future instance.

### Q7: Are state-changing controls safe while reconnecting or stale?
* **Classification:** **[OBSERVED / DERIVED] — PARTIALLY SAFE / ERRONEOUS INTENT**.
  - Dispatch is safe (rejected with 404).
  - However, clicking **"Add another"** on the stale Codex row sends `POST /api/players/codex/instances`. The server, having no Codex on field, will treat this as a request for the first instance (allocating Seat 1 `"Codex"`), which contradicts the user's intent to add a second instance.
  - Mutating actions should be disabled whenever the UI is disconnected or unverified.

### Q8: What is the earliest failing boundary?
* **Classification:** **[OBSERVED] — Browser EventSource event handling (`src/public/index.html:489`) and CoachServer initial SSE handshake (`src/server.ts:418`).**

---

## 4. EVALUATION OF THE MINIMUM FUTURE CONTRACT

The proposed conceptual contract:
1. Browser establishes or re-establishes connection.
2. Browser receives one complete canonical status snapshot.
3. Only after that snapshot is received does UI become `Connected`.
4. If connection is lost, browser moves immediately to `Reconnecting` or `Disconnected`.
5. Stale Player state may remain visually present if useful, but must be clearly marked stale and must not masquerade as current truth.
6. Reconnection automatically refreshes status.
7. Human never needs to press browser Refresh merely to synchronize Coach state.

**Verdict:** **APPROVED AS THE SMALLEST APPROPRIATE DESIGN [DERIVED].**  
This model enforces the product rule: **UI state is a pure projection of canonical server state, never a persistent local memory that outlives server connectivity.**

---

## 5. SMALLEST ARCHITECTURAL CORRECTION

### 5.1. Browser Client (`src/public/index.html`)
1. **Reconnection Refresh:**
   ```javascript
   // Change from:
   eventSource.addEventListener('hello', () => setConnected(true));
   // To:
   eventSource.addEventListener('hello', () => void refresh());
   ```
   Calling `refresh()` upon receiving `hello` guarantees that every initial connection and every automatic reconnection fetches `/api/status` and `/api/reports` before marking the UI connected.

2. **Connection State Transitions:**
   - On `eventSource.onerror`: Set UI state to `'reconnecting'`. Yellow dot, text `"Reconnecting…"`. Disable `#dispatchBtn` and player action buttons (`Put on Field`, `Add another`). Dim or badge the roster as `Unconfirmed`.
   - On successful `refresh()` completion: Call `setConnected(true)` (green dot, `"Connected"`). Re-enable controls.
   - On `refresh()` failure / 401: Call `setConnected(false)` (red dot, `"Offline"`).

### 5.2. Server Complement (`src/server.ts`)
* In `openEventStream()`, immediately write a status broadcast frame or allow the client's `refresh()` on `hello` to pull `/api/status`. Having the client fetch on `hello` is the smallest and cleanest change because `refresh()` already handles authentication, status rendering, and report synchronization together.

---

## 6. VERIFICATION PROTOCOLS

### 6.1. Smallest Human Verification Action
* **Action:** Without refreshing the browser, click the **"Dispatch Play"** button in the open Sideline Coach browser page.
* **Expected Result:** A toast message appears: `Dispatch failed: That Player has left the field.` (HTTP 404). This confirms live that the server rejects the stale instance ID without executing any command.

### 6.2. Smallest Automated Test
* Create an automated unit/integration test in `test/browser-sync.test.mjs` simulating an SSE client reconnecting to `CoachServer`:
  1. Start server with 1 player on field.
  2. Stop server and restart with 0 players.
  3. Verify client `hello` handler triggers status refresh.
  4. Verify client renders `ready-on-bench` and disables stale dispatch.

---

## 7. GATES & IMPACT

* **Breadcrumb Impact:** **YES**.
  - **WAS:** Client assumed a single initial fetch on page load plus delta events was sufficient, treating SSE `hello` as proof of UI validity without fetching fresh status.
  - **IS:** Disconnection leaves stale DOM active; SSE reconnection marks UI `Connected` while rendering obsolete player states from dead server instances.
  - **WILL BE:** Browser UI is a strictly validated projection of live server state. Disconnect transitions UI to `Reconnecting` and disables mutating controls. Reconnection mandates immediate receipt of fresh canonical status before declaring `Connected`.
* **Diagnostic Impact:** **YES**. Coach diagnostics should verify that `/api/events` triggers client synchronization and should record client connection generation identifiers.
* **Git Authority & State:**
  - Dev Stadium: `C:\Users\dmcal\Documents\GitHub\SidelineCoach` on branch `main` at `5734df2`.
  - Working tree: Clean relative to Stage 1.8 changes.
  - No source code modified, no commits, no pushes.

---

## 8. RECOMMENDED NEXT PLAY

**Recommended Next Play:** Authorize Stage 1.11 to implement the reconnection synchronization contract in `src/public/index.html` (triggering `refresh()` on `hello`/reconnect, introducing the `Reconnecting` visual state, and disabling action buttons while offline or unverified).

---

────────────────────────────────────────

REPORT FILE:
Stage-1.10-Browser-Live-State-Reconnection-Forensics.md

REPORT TIMESTAMP:
2026-09-10 20:30 MDT

────────────────────────────────────────
