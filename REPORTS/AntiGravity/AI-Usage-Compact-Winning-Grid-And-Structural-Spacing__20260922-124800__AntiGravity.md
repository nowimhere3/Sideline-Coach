# AI Usage Compact Winning Grid and Structural Spacing Report

**Agent:** Anti-Gravity  
**Timestamp:** 2026-09-22T12:48:00-06:00  
**Target:** Sideline Coach Development Host  
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Status:** ALL 4 TASKS COMPLETE & VERIFIED (44/44 AI SCOREBOARD TESTS PASSING, 12/12 COPY REPEATABILITY TESTS PASSING, TSC CLEAN)

---

## 1. Executive Summary

This slice executes the 4-task layout and telemetry contract upgrade for the Sideline Coach AI Usage Scoreboard:
1. **Task 1 — Rebuilt Compact as the Winning Telemetry Grid**: Replaced inline text strings with an invisible CSS grid/flex-column system where `CLAUDE` and `CODEX` share identical semantic column slots (`PROVIDER | WINDOW | VALUE | % | DOT | TIME | MERIDIEM | DIVIDER | WINDOW | VALUE | % | DOT | TIME | MERIDIEM`). Values and times right-align with tabular numerals; `%` and dynamic values share provider accents (amber for Claude, cyan for Codex); meridiem (`AM`/`PM`) sits in a dedicated suffix slot; telemetry spans available width evenly rather than clustering left.
2. **Task 2 — Bottom Outer Breathing Room**: Maintained the Scoreboard as a hard structural dam (flex sibling to `#gameScrollRegion`), with game content stopping cleanly at the top edge of `#aiScoreboardContainer`. Added `padding-bottom: calc(6px + env(safe-area-inset-bottom))` on the viewport-facing outer edge with zero top padding on the bottom container.
3. **Task 3 — Structural Top Placement Spacing**: Maintained structural ordering (`order: 0` before `#gameScrollRegion`). Added ~6px viewport-facing outer padding (`padding-top: calc(6px + env(safe-area-inset-top))`) and `margin-bottom: 6px` content separation between the Scoreboard card and `#gameScrollRegion`. No overlay or absolute positioning introduced.
4. **Task 4 — Claude 5H Partial-Unknown Display**: Refined `aiScoreboardNormalize` to preserve valid utilization (e.g. 100% available) when `resetsAt` is undefined/missing, rendering `5H 100% · UNKNOWN` in standard grid columns without collapsing to `is-unknown`, while keeping genuine lack of utilization as `5H UNKNOWN`.

---

## 2. Architectural Implementation Details

### 2.1 Compact Telemetry Grid (Task 1)

#### CSS Architecture (`src/public/index.html`):
- `.ai-scoreboard-row`:
  ```css
  display: grid;
  grid-template-columns: 62px 1fr;
  align-items: center;
  gap: 10px;
  font-size: .88rem;
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
  ```
- `.ai-scoreboard-windows`:
  ```css
  display: grid;
  grid-template-columns: 1fr 14px 1fr;
  align-items: center;
  gap: 6px;
  ```
- `.ai-scoreboard-metric`:
  ```css
  display: grid;
  grid-template-columns: 24px 28px 14px 14px 1fr 24px;
  align-items: baseline;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  ```
- Semantic Slots inside each metric:
  1. `cell-window` (24px, muted font, e.g. `5H`, `WK`)
  2. `cell-val` (28px, right-aligned, provider color: `--claude-accent` / `--codex-accent`)
  3. `cell-unit` (14px, left-aligned, provider color)
  4. `cell-dot` (14px, centered, muted separator `·` or `↻`)
  5. `cell-time` (1fr, right-aligned, tabular nums)
  6. `cell-meridiem` (24px, left-aligned, muted suffix `AM` / `PM`)

#### DOM Generation and Cell Updating:
- In `buildAiScoreboardDom`: `makeMetricCells()` constructs 6 dedicated spans inside each metric (`#aiScoreboardClaudeRowFiveHour`, `#aiScoreboardClaudeRowWeekly`, `#aiScoreboardCodexRowFiveHour`, `#aiScoreboardCodexRowWeekly`).
- In `renderAiScoreboard`: `setCompact()` invokes `aiScoreboardUpdateMetric()`, which formats the data according to active preferences and populates individual cell text content without destroying DOM nodes.
- When unknown: `.ai-scoreboard-metric.is-unknown` collapses the metric to `24px 1fr` without displacing the central divider `│`.

### 2.2 Structural Spacing (Tasks 2 & 3)

- **Bottom Placement (Default)**:
  ```css
  #aiScoreboardContainer {
    order: 2;
    flex: 0 0 auto;
    padding-bottom: calc(6px + env(safe-area-inset-bottom));
  }
  ```
  Game content stops at the top boundary of `#aiScoreboardContainer`. The outer breathing room faces the viewport bottom.
- **Top Placement**:
  ```css
  body.ai-scoreboard-top #aiScoreboardContainer {
    order: 0;
    padding-top: calc(6px + env(safe-area-inset-top));
    padding-bottom: 0;
    margin-bottom: 6px;
  }
  ```
  Outer breathing room faces the viewport top, and `margin-bottom: 6px` provides clean separation from `#gameScrollRegion`.

### 2.3 Partial-Unknown Normalization (Task 4)

- In `aiScoreboardNormalize`:
  ```javascript
  const aiScoreboardNormalize = (win, usedField, { checkExpiry = false } = {}) => {
    if (!win) return undefined;
    const raw = usedField === 'utilization' ? win.utilization * 100 : win[usedField];
    if (!Number.isFinite(raw)) return undefined;
    const resetsAt = aiScoreboardEpochMs(win.resetsAt);
    const hasReset = Number.isFinite(resetsAt);
    if (checkExpiry && hasReset && resetsAt <= Date.now()) return undefined;
    const used = Math.max(0, Math.min(100, Math.round(raw)));
    return { used, left: 100 - used, resetsAt: hasReset ? resetsAt : undefined };
  };
  ```
- When `utilization` is known (e.g. `0` for 100% available) but `resetsAt` is undefined/null:
  - `aiScoreboardCompactReset(undefined)` returns `'UNKNOWN'`.
  - `aiScoreboardUpdateMetric` populates `cell-val` as `100`, `cell-unit` as `%`, `cell-dot` as `·`, `cell-time` as `UNKNOWN` (with `.is-unknown-time`), and `cell-meridiem` as `""`.
  - The metric element does NOT receive `.is-unknown`, ensuring it renders in normal grid columns.

---

## 3. Automated Test Verification

Test Suite: `test/ai-usage-scoreboard-ui.test.mjs`
- **Total Tests:** 44
- **Passed:** 44
- **Failed:** 0
- **Duration:** ~6.7s

Key Tests Verifying Contract Requirements:
- `SB-18`: Rebuilt Compact telemetry grid CSS properties (`1fr 14px 1fr`, 6-slot subgrid, alignments).
- `SB-38`: Semantic 6-cell slot structure shared across Claude and Codex.
- `SB-39`: Alignment contract verification (stable slots, provider colors on `%` and values, right-aligned numbers and times).
- `SB-40`: Task 2 bottom outer breathing room on viewport-facing side only.
- `SB-41`: Task 3 structural top placement spacing (outer top padding and content separation margin).
- `SB-42`: Task 4 Claude 5H partial-unknown display (`5H 100% · UNKNOWN` in normal grid columns).
- `SB-43`: Task 4 genuinely unknown Claude (`5H UNKNOWN` with `.is-unknown`) and expired window defense-in-depth.

Regression Test Suite: `test/incoming-reports-copy-repeatability.test.mjs`
- **Total Tests:** 12
- **Passed:** 12
- **Failed:** 0

TypeScript Type Check: `npm run check`
- **Output:** Clean exit code 0 (`tsc -p ./ --noEmit`).

---

## 4. Preserved Non-Negotiables

- **Expanded Scoreboard**: Intact with full provider cards, local time card, actions, and key handlers.
- **Backend Acquisition & Polling**: No changes to `HealthAuthority`, acquisition semantics, or OAuth polling policy.
- **Copy Complete Context**: Deterministic clipboard output remains unaffected by Compact preference choices.
- **Top / Bottom Placement Persistence**: Persisted via `/api/preferences` and driven by CSS flex sibling `order`.
- **Structural Sibling Layout**: `#gameScrollRegion` remains the sole scroll owner (`overflow-y: auto`), with no overlay or reserved-space hacks.
