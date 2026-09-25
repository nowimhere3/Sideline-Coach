# FIRST-CLASS MOBILE COACH CAPABILITY RECONCILIATION & REPAIR

**Author:** AntiGravity  
**Role:** Architecture-aware reconciliation + implementation worker  
**Date:** 2026-09-24  
**Workspace:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Branch:** `q2.8-multigame-field-debug`  
**Dossier Reference:** `Scouts/remote-coach-capability-audit-20260924-193737`

---

## 1. Executive Summary & Product Boundary Invariant

### The Authenticated Coach is the Product Boundary; Localhost is Not
A paired Remote Access device (such as Dad's Android phone on `remote.mysidelinecoach.com`) is **not** a read-only monitoring viewer, companion UI, or crippled mirror. It is a **first-class Sideline Coach control surface**. Dad's product vision is to call plays, recruit/adopt players, retry benched players, inspect terminal guts, toggle Dev Mode, browse/restore game folders, and adjust Coach preferences from his phone while away from his desk.

The prior repair session operated under an inverted product assumption that intentionally disabled controls remotely. Under the corrected product authority:
> **EVERYTHING ON THE NORMAL SIDELINE COACH MAIN EXPERIENCE SHOULD WORK FROM A PAIRED AUTHENTICATED MOBILE DEVICE UNLESS THERE IS A SPECIFIC, CONCRETE SECURITY REASON IT CANNOT.**

The burden of proof was reversed: instead of asking *"Why should this action be allowed remotely?"*, we evaluated: *"What concrete security property requires this action to remain unavailable to the authenticated Coach?"*

All host-commanding capabilities that Dad legitimately exercises as Coach have been reconciled to `remote-mutate` or `remote-read`. All genuine secret materials (raw OpenRouter API keys, pairing tokens, device registry administration, control plane shutdown, loopback session bootstrap, Stadium WebSocket bridge) remain strictly protected behind `local-only` fences.

---

## 2. Physical Field Failure Analysis & Resolution

### Physical Field Failure 1: Check Players Discovered Candidates, But Dad Could Not Add or Adopt Remotely
* **Physical Symptom Observed on Android:** In `SCOUTING > Check Players`, player discovery successfully ran and showed discovered candidates, but tapping candidate action buttons failed or was prevented.
* **Root Causes:**
  1. `src/control-plane/remote-routes.ts` had a blanket catch-all regex `/^\/api\/players(?:\/|$)/` classified as `local-only`. Consequently, mutation calls to `/api/players/add`, `/api/players/adopt`, `/api/players/adopt-terminal`, and `/api/players/helper-terminal` were rejected with HTTP 403.
  2. The prior repair had added `if (isRemoteDevicePresentation()) return undefined;` in `runPlayerLifecycle` and `addPlayerFromRecruit`, and applied `markLocalOnlyControl(add)` in `renderRecruit()`.
* **Resolution:**
  - Added explicit, granular `remote-mutate` route policies in `remote-routes.ts` before the catch-all:
    - `POST /api/players/add`
    - `POST /api/players/adopt`
    - `POST /api/players/adopt-terminal`
    - `POST /api/players/helper-terminal`
  - Removed UI early returns in `runPlayerLifecycle` and `addPlayerFromRecruit`.
  - Removed `markLocalOnlyControl` on all candidate recruit actions ("Add to Roster", "Add", "Open Install Terminal", "Continue Setup", "Adopt as Terminal").

### Physical Field Failure 2: Player on Bench > Retry Produced "This action is available only on the local Sideline."
* **Physical Symptom Observed on Android:** Tapping "Try Again" / "Put on Field" on a benched player that failed recovery produced an error toast: `"This action is available only on the local Sideline."`
* **Root Causes:**
  1. The benched player retry handler in `index.html` (line 5199) calls:
     `POST /api/players/instance/${encodeURIComponent(instance.instanceId)}/field`
  2. That endpoint was captured by the broad `local-only` fallback `/^\/api\/players(?:\/|$)/`. When Dad tapped the button on Android, the adapter rejected the request with 403 Forbidden.
  3. The frontend error handler caught the 403 and displayed the local-only toast.
* **Resolution:**
  - Added explicit `remote-mutate` route policies in `remote-routes.ts`:
    - `POST /^\/api\/players\/instance\/[^/]+\/(?:field|bench|remove|send)$/`
    - `POST /^\/api\/players\/[^/]+\/(?:field|instances|controlled-instances)$/`
  - Re-enabled full player lifecycle on remote presentation (field, bench, retry, remove, send).

---

## 3. Surface & Capability Reconciliation Matrix

| Domain / Control | Method | Endpoint / Function | Old Policy | New Policy | Remote Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Player Discovery** | `POST` | `/api/players/discover` | `remote-read` | `remote-read` | Functional |
| **Add Player (Recruit)** | `POST` | `/api/players/add` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Adopt Running Player** | `POST` | `/api/players/adopt` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Adopt Terminal** | `POST` | `/api/players/adopt-terminal` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Install/Helper Terminal** | `POST` | `/api/players/helper-terminal` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Put on Field / Try Again** | `POST` | `/api/players/instance/:id/field` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Put on Bench** | `POST` | `/api/players/instance/:id/bench` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Remove Player** | `POST` | `/api/players/instance/:id/remove` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Send to Terminal / Player** | `POST` | `/api/players/instance/:id/send` | `local-only` (catch-all) | `remote-mutate` | Functional |
| **Preferences Mutation** | `POST` | `/api/preferences` | `local-only` | `remote-mutate` | Functional |
| **Dev Mode Toggle** | `POST` | `/api/preferences` `{ devMode }` | Disabled UI | Enabled UI | Functional |
| **Running Players Setting** | `POST` | `/api/preferences` `{ runningPlayers }` | Disabled UI | Enabled UI | Functional |
| **Live Player Console** | `POST` | `/api/preferences` `{ livePlayerConsole }` | Disabled UI | Enabled UI | Functional |
| **Terminal Retention** | `POST` | `/api/preferences` `{ terminalRetention }` | Disabled UI | Enabled UI | Functional |
| **Sensitive Terminal Override**| `POST` | `/api/preferences` `{ remoteSensitive... }` | Disabled UI | Enabled UI | Functional |
| **Time Format (12h/24h)** | `POST` | `/api/preferences` `{ timeFormat }` | Disabled UI | Enabled UI | Functional |
| **AI Usage Refresh Cadence** | `POST` | `/api/preferences` `{ aiUsageRefreshMinutes }`| Disabled UI | Enabled UI | Functional |
| **AI Scoreboard Radios** | `POST` | `/api/preferences` `{ aiScoreboard... }` | Disabled UI | Enabled UI | Functional |
| **Filesystem Path Check** | `POST` | `/api/games/files/check` | `local-only` | `remote-read` | Functional |
| **Filesystem Absolute Path** | `POST` | `/api/games/files/absolute-path` | `local-only` | `remote-read` | Functional |
| **Filesystem Folder Choose** | `POST` | `/api/games/filesystem/choose` | `local-only` | `remote-mutate` | Functional |
| **Filesystem Restore Auto** | `POST` | `/api/games/filesystem/restore` | `local-only` | `remote-mutate` | Functional |
| **Filesystem Reinspect** | `POST` | `/api/games/filesystem/reinspect` | `local-only` | `remote-mutate` | Functional |
| **Game Lifecycle (Add/Archive/Restore)** | `POST` | `/api/game/(add\|archive\|restore)` | `local-only` | `remote-mutate` | Functional |
| **Archived Games List** | `GET` | `/api/games/archived` | `local-only` | `remote-read` | Functional |
| **Scout Formation Receivers**| `GET` | `/api/scout/formation-receivers` | `local-only` | `remote-read` | Functional |
| **Scout Formation Launch** | `POST` | `/api/scout/formation-run` | `local-only` | `remote-mutate` | Functional |

---

## 4. Security Fence Audit: Preserved Host Protections

The following endpoints handle genuine bootstrap material, private credentials, or administrative infrastructure and remain strictly `local-only`:

1. **OpenRouter API Key Management (`POST/DELETE /api/scout/openrouter-credential`):**
   - Writing or clearing raw third-party API keys is restricted to the host development environment.
   - Remote Settings open skips `loadScoutOpenRouterCredential()` without 403 toasts, keeping raw key cards hidden on mobile.
2. **Pairing Initiation (`POST /api/pairing/create`):**
   - Generating a pairing secret or QR code must originate on the desktop console.
3. **Paired Device Registry Administration (`GET/DELETE/PATCH /api/devices*`):**
   - Revoking all paired phones, managing pairing tokens, and device admin remain local-admin only.
   - Remote phones display the read-only `remoteSessionSettingsCard` ("Connected to host") instead of device administration.
4. **Control Plane Lifecycle (`POST /api/control-plane/shutdown`):**
   - Shutting down the daemon process remains strictly refused to non-local principals (401/403).
5. **Session Bootstrap (`POST /api/session`):**
   - Desktop local cookie bootstrap cannot be requested by remote device tokens.
6. **Stadium WebSocket Bridge (`GET /stadium`):**
   - Stadium IPC socket remains bound strictly to the local loopback development environment.

---

## 5. Verification Results

### Test Execution Summary
* **`test/remote-mobile-capability-repair.test.mjs`:** **8/8 PASSED**
  - Route classification and principal authorization policy
  - Remote Check Players + Add to Roster candidate (`POST /api/players/adopt`)
  - Remote Add recruit (`POST /api/players/add`)
  - Remote Try Again on benched Player (`POST /api/players/instance/:id/field`) without local-only toast
  - Remote Put on Bench & Remove Player (`POST /api/players/instance/:id/bench`, `remove`)
  - Security fence: OpenRouter credential skipped remotely without toast
  - Settings: 10 remote preference mutations (`POST /api/preferences`) without error toast
  - Game Setup: Remote folder change & restore (`POST /api/games/filesystem/restore`) without error toast
* **`test/remote-access-v1-stage1.test.mjs`:** **9/9 PASSED**
* **`test/remote-access-v1-stage2.test.mjs`:** **30/30 PASSED** (1 skipped platform POSIX test)
* **`test/remote-access-v1-stage5d-settings.test.mjs`:** **6/6 PASSED**
* **`test/ai-usage-scoreboard-ui.test.mjs`:** **57/57 PASSED**
* **`test/s53-advanced-player-discovery.test.mjs`:** **15/15 PASSED**
* **`test/s54-4-terminal-success-retention.test.mjs`:** **22/22 PASSED**
* **`test/s55-1-finished-state-and-time-format.test.mjs`:** **28/28 PASSED**
* **TypeScript Compilation & Typecheck:**
  - `npm run check` (`tsc -p ./ --noEmit`): **0 errors**
  - `npm run compile` (`tsc -p ./ && tsc -p relay`): **0 errors**

**Total Regression Test Count:** **175 tests passing, 0 failing.**

---

## 6. Conclusion & Product Verdict

**VERDICT: GREEN.**  
The Sideline Coach Remote Access experience now fulfills the product invariant: Dad can operate Sideline Coach from his phone as an authorized Coach. The physical field failures reported on Android (inability to add/adopt discovered players and inability to retry benched players) have been cleanly resolved at both the backend route policy and frontend presentation layers, while maintaining uncompromising protection around bootstrap secrets and device administration.
