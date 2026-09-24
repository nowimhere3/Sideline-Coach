# SIDELINE COACH — REMOTE SCORECARD POSITION FALSE-TOAST FIX

**AGENT:** AntiGravity  
**ROLE:** Implementation Worker  
**DATE:** 2026-09-24  
**TARGET BRANCH:** `q2.8-multigame-field-debug`  
**REPOSITORY:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**PLAY:** Remote Scorecard Position False-Toast Fix  
**STATUS:** GREEN / VERIFIED  

---

## 1. Executive Summary

On the paired Android Remote Access surface, tapping the AI Usage Scorecard position-switch control successfully moved the Scorecard visually (Top <-> Bottom), but immediately produced a false-positive warning toast:

> *"This action is available only on the local Sideline."*

The toast obscured the newly moved mobile Scorecard.

We reconciled the Scout formation reconnaissance (`mobile-scorecard-swap-toast-recon-20260924-160436`), identified the exact client/server discrepancy, and applied a surgical repair in [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html):
- On remote-device presentation surfaces (identified via the existing [`isRemoteDevicePresentation()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2937) predicate), top/bottom Scorecard positioning is treated strictly as **browser-local presentation state**.
- The remote toggle visually repositions the Scorecard and updates button metadata without issuing a `POST /api/preferences` call to the daemon.
- Subsequent server status poll/SSE events do not revert the remote user's chosen positioning.
- On local desktop Sideline, the existing preference mutation and persistence flow remains byte-for-byte intact.
- The daemon security boundary (`POST /api/preferences` = `local-only`, HTTP 403 for `remote-device` principals) remains completely unmodified and authoritative.

---

## 2. Scout Reconnaissance Reconciliation

From Scout Formation `mobile-scorecard-swap-toast-recon-20260924-160436`:
- **Toast Origin:** [`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L1324-L1326) lines 1324–1326:
  ```typescript
  this.sendJson(res, 403, { success: false, message: 'This action is available only on the local Sideline.' });
  ```
- **Policy Invariant:** In [`src/control-plane/remote-routes.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/remote-routes.ts#L62), `POST /api/preferences` is classified as `access: 'local-only'`.
- **Client Behavior:** In [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L6095), `aiScoreboardTogglePlacement()` optimistically applied the visual placement change immediately, but then unconditionally called `api('/api/preferences', { method: 'POST', body: JSON.stringify({ aiScoreboardPlacement: next }) })`.
- **Failure Chain:** The remote principal request was rejected with HTTP 403. The client catch block caught the error and called `showToast(error.message, true)`, rendering the local-only error toast despite the visual layout having already moved.

---

## 3. Architectural Boundary Decisions

1. **Maintain Backend Security Boundary**:
   - Do **NOT** broaden `principalMayAccess`.
   - Do **NOT** make `POST /api/preferences` remotely accessible.
   - Do **NOT** weaken the daemon's local-only authorization guard.
   - Do **NOT** suppress the generic authorization toast globally.
   - Do **NOT** create remote exceptions for arbitrary preference fields.
2. **Treat Remote Placement as Browser-Local Presentation State**:
   - The phone/mobile layout preference belongs to the active presentation surface.
   - The remote UI toggles and retains the positioning in local UI memory (`remoteAiScoreboardPlacement`).
   - Remote toggle skips network persistence (`POST /api/preferences`), eliminating the 403 response and false toast.
   - Genuine attempts by remote clients to mutate local-only preferences continue to fail closed with HTTP 403 and display the authoritative toast.

---

## 4. Production Code Changes

### File: [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html)

#### A. Declare Local Presentation State & Update Preference Reader
```javascript
      // Remote presentation state: top/bottom positioning on remote surfaces is
      // browser-local presentation state so remote users can position their card
      // without mutating or violating the local-only backend preference boundary.
      let remoteAiScoreboardPlacement = null;

      // Reads the human's Compact display preferences (percentage/reset mode,
      // reset marker). Defaults match the prior fixed behavior exactly, so an
      // unconfigured install renders identically to before this setting existed.
      const aiScoreboardPrefs = () => {
        const p = lastStatus?.preferences || {};
        const percentMode = ['left', 'used', 'both'].includes(p.aiScoreboardPercentMode) ? p.aiScoreboardPercentMode : 'left';
        const resetMode = ['absolute', 'countdown', 'both'].includes(p.aiScoreboardResetMode) ? p.aiScoreboardResetMode : 'absolute';
        const resetMarker = p.aiScoreboardResetMarker === 'icon' ? 'icon' : 'separator';
        const density = p.aiScoreboardDensity === 'tight' ? 'tight' : 'standard';
        const rawPlacement = isRemoteDevicePresentation() && remoteAiScoreboardPlacement !== null
          ? remoteAiScoreboardPlacement
          : p.aiScoreboardPlacement;
        const placement = rawPlacement === 'top' ? 'top' : 'bottom';
        const defaultExpanded = p.aiScoreboardDefaultExpanded === true;
        return { percentMode, resetMode, resetMarker, density, placement, defaultExpanded };
      };
```

#### B. Guard Toggle Placement Against Remote Persistence
```javascript
      // Instant Top <-> Bottom: applies to the live card immediately (optimistic),
      // then persists via the existing aiScoreboardPlacement preference — no
      // reload, no daemon restart, no Settings visit required.
      const aiScoreboardTogglePlacement = async () => {
        if (!canMutateLiveState()) return;
        const next = aiScoreboardPrefs().placement === 'top' ? 'bottom' : 'top';
        if (isRemoteDevicePresentation()) {
          remoteAiScoreboardPlacement = next;
        }
        if (lastStatus) lastStatus = { ...lastStatus, preferences: { ...lastStatus.preferences, aiScoreboardPlacement: next } };
        applyAiScoreboardPlacement();
        if (isRemoteDevicePresentation()) return;
        try {
          await api('/api/preferences', { method: 'POST', body: JSON.stringify({ aiScoreboardPlacement: next }) });
        } catch (error) {
          showToast(error.message || 'Could not move the AI Usage Scoreboard', true);
        }
      };
```

---

## 5. Test Changes & Regression Coverage

### File: [`test/ai-usage-scoreboard-ui.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/ai-usage-scoreboard-ui.test.mjs)

1. **Harness Extensions in `createPage()`:**
   - Supported `hostname = ''` parameter in test harness options.
   - Injected `hostname` into `ctx.location.hostname`.
   - In simulated `fetch`: when `hostname` represents a remote device, returned `403` with `{ success: false, message: 'This action is available only on the local Sideline.' }` on `POST /api/preferences`, matching live daemon behavior.
   - Added `trigger(node, eventName, eventObj)` helper on `page` to fire DOM events like `change`.
2. **New Dedicated Regression Test `SB-29b`:**
   - Verifies remote switch visually moves to Top.
   - Verifies remote switch issues `0` calls to `POST /api/preferences`.
   - Verifies remote switch shows no error toast (`toast.classList.contains('show') === false`).
   - Verifies remote placement survives subsequent status updates/refreshes.
   - Verifies remote switch toggles back to Bottom with `0` posts and no toast.
   - Verifies unrelated preference mutations from remote still reject with 403 and display `"This action is available only on the local Sideline."`.

---

## 6. Verification & Test Evidence

### Commands Executed

1. **Type Checking:**
   ```bash
   npm run check
   ```
   **Result:** 0 errors.

2. **TypeScript Compilation:**
   ```bash
   npm run compile
   ```
   **Result:** Clean build (`tsc -p ./ && tsc -p relay`).

3. **UI Test Suite Execution:**
   ```bash
   node --test test/ai-usage-scoreboard-ui.test.mjs
   ```
   **Result:**
   - 57 / 57 tests passed (0 failed, 0 skipped).
   - Includes `SB-29` (local persistence) and `SB-29b` (remote presentation-only).

4. **Remote Access Security Test Execution:**
   ```bash
   node --test test/remote-access-v1-stage1.test.mjs test/remote-access-v1-stage2.test.mjs
   ```
   **Result:**
   - 39 passed, 1 skipped (`RA2A-4` POSIX mode on Windows).
   - `RA2D-7` confirms `"POST /api/preferences (local-only)": 403`.

5. **Daemon Settings & Hierarchy Test Execution:**
   ```bash
   node --test test/ai-scoreboard-settings-daemon.test.mjs test/s55-1-finished-state-and-time-format.test.mjs test/remote-access-v1-stage5d-settings.test.mjs
   ```
   **Result:**
   - 37 / 37 passed.

---

## 7. Acceptance Criteria Verification Matrix

| # | Acceptance Requirement | Result | Verified By |
|---|---|---|---|
| 1 | Remote Scorecard position switch still visually works | **PASS** | `SB-29b` steps 1 & 5 |
| 2 | Remote Scorecard switch does NOT POST `/api/preferences` | **PASS** | `SB-29b` step 2 (`apiCalls.filter(...) === 0`) |
| 3 | Remote Scorecard switch produces NO `local Sideline` toast | **PASS** | `SB-29b` step 3 (`toast.show === false`) |
| 4 | Local desktop Scorecard switch still persists normally | **PASS** | `SB-29` (`posts.length === 1`) |
| 5 | Unrelated remote attempts against genuinely local-only preferences remain forbidden | **PASS** | `SB-29b` step 6 (403 + local-only toast) |
| 6 | Generic authorization behavior remains intact | **PASS** | `RA2D-7`, `RA1-4`, daemon route tables |
| 7 | No Remote Access security policy is widened | **PASS** | Zero backend policy modifications |

---

## Final Status: **GREEN**
