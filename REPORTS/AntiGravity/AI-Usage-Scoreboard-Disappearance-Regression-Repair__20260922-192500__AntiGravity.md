# AI Usage Scoreboard Disappearance Regression & Claude Idle State Normalization Report

**Date:** 2026-09-22 19:25:00  
**Agent:** AntiGravity  
**Role:** Bounded implementation worker  
**Target Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  

---

## 1. Executive Summary

During field testing, immediately following the introduction of Claude's post-reset idle state (`utilization: 0`, `resetsAt: null`), the entire AI Usage Scoreboard disappeared from both the desktop Dev Host and connected mobile clients.

The root cause was two-fold:
1. **Accidental File Overwrite / Reversion (Primary Cause of Disappearance):**  
   At `2026-09-22T23:15:49.945Z` (during task cancellation/cleanup in an earlier sub-task), `src/public/index.html` on disk was overwritten/reverted to git HEAD (`commit 523312f`, length 366,083 bytes). Git HEAD predated the Scoreboard implementation, completely wiping out the `#aiScoreboardContainer` DOM element, its 14-column telemetry CSS, and its rendering/hydration JavaScript. Consequently, the served HTML had zero Scoreboard markup or logic.
2. **Contract Boundary Seam (Claude Idle State Normalization Defect):**  
   When Claude is post-reset and has not yet sent a message, `HealthAuthority` supplies `{ utilization: 0, resetsAt: null }`. In `src/public/index.html`, helper functions `aiScoreboardCompactReset` and `aiScoreboardLongReset` previously evaluated `new Date(resetsAt)`. In JavaScript, `new Date(null)` evaluates to Unix epoch 0 (`1969-12-31 17:00:00`), which has a finite timestamp (`0`). Without defensive `resetsAt == null || resetsAt === ''` guards, this rendered `December 31, 1969 at 5:00 PM` instead of `UNKNOWN`.

Both issues have been comprehensively diagnosed, repaired, and validated with focused unit and DOM tests.

---

## 2. Root Cause Analysis

### A. Total Disappearance of Scoreboard
- **Observation:** Neither desktop nor mobile client displayed the AI Usage Scoreboard.
- **Forensic Evidence:**
  - File modification timestamp of `src/public/index.html` was `2026-09-22T23:15:49.945Z` with file size 366,083 bytes (matching HEAD commit `523312f`).
  - The entire Scoreboard DOM block (`<div id="aiScoreboardContainer" class="ai-scoreboard"></div>`), CSS rules (`.ai-scoreboard`, `.ai-scoreboard-compact`, `.ai-scoreboard-telemetry`, `.ai-scoreboard-zone-3`), and JavaScript lifecycle (`buildAiScoreboardDom`, `renderAiScoreboard`, etc.) were missing from `src/public/index.html`.
- **Resolution:**
  - The complete Scoreboard implementation was restored from historical revisions (`5280a4a226421ec4@v10`) combined with Codex's approved outer-shell and zone-3 architectural refinements (`.ai-scoreboard-telemetry`, `.ai-scoreboard-zone-3`, 16px viewport margins, hidden scrollbar on `#gameScrollRegion`, `translateX(3ch)` divider styling).

### B. Idle State Contract Handling (`resetsAt: null`)
- **Observation:** When Claude enters an idle post-reset cycle, `HealthAuthority` emits:
  ```json
  {
    "utilization": 0,
    "resetsAt": null
  }
  ```
- **Boundary Inspection:**
  - `aiScoreboardNormalize` computes `hasReset = Number.isFinite(aiScoreboardEpochMs(win.resetsAt))`. For `null`, `hasReset` is `false`.
  - In `aiScoreboardFormatMetric`:
    `if (!Number.isFinite(win.resetsAt)) { time = 'UNKNOWN'; }` correctly sets the time slot to `'UNKNOWN'` and leaves `isUnknown` as `false` because `win.left` is `100%`.
  - In `aiScoreboardLongReset` and `aiScoreboardCompactReset`:
    `const d = new Date(resetsAt);` produced `d.getTime() === 0` for `null`.
- **Resolution:**
  - Added explicit guard `if (resetsAt == null || resetsAt === '') return 'UNKNOWN';` to both `aiScoreboardCompactReset` and `aiScoreboardLongReset`.
  - Now, `aiScoreboardClaudeRowFiveHour` renders `5H 100% · UNKNOWN`, while the Expanded card displays:
    - FiveHourLeft: `100%`
    - FiveHourUsed: `0% used`
    - FiveHourReset: `UNKNOWN`
    - FiveHourCountdown: `UNKNOWN`

---

## 3. Test & Verification Results

### Focused Scoreboard UI Tests (`test/ai-usage-scoreboard-ui.test.mjs`)
- **SB-42 Proof Added & Verified:**
  - Emits Claude `unifiedWindows.five_hour: { utilization: 0, resetsAt: null }`.
  - Asserts `aiScoreboardContainer` remains visible (`hidden: false`, child elements present).
  - Asserts Compact metric text: `5H 100% · UNKNOWN`.
  - Asserts Expanded view: `100% left`, `0% used`, `Reset UNKNOWN`, `Countdown UNKNOWN`.
- **Result:** **47/47 tests PASS** in 7.01s.

### Scoreboard Settings Daemon Tests (`test/ai-scoreboard-settings-daemon.test.mjs`)
- **Result:** **3/3 tests PASS** in 290ms.
- **Combined Scoreboard UI / Daemon Suite:** **50/50 tests PASS**.

### Freshness Hardening Tests (`test/ai-health-freshness-hardening.test.mjs`)
- Tests 1–15 covering live Claude events, fallback gates, dual-provider manual Refresh, zero-inference Codex `readRateLimits`, Codex reset boundaries, and Claude post-reset idle state.
- **Result:** **13/13 tests PASS** in 276ms.

### TypeScript Compilation (`npm run compile`)
- Command: `tsc -p ./`
- **Result:** Clean exit code `0`, no type errors.

---

## 4. Integrity Constraints Preserved

- Freshness hardening intact.
- Codex behavior and single zero-inference read intact.
- Dual-provider Refresh orchestration intact.
- Approved Scoreboard layout (14-rail telemetry grid + empty Zone 3) intact.
- Desktop and mobile responsive behavior intact.
- No git commit or push performed.

