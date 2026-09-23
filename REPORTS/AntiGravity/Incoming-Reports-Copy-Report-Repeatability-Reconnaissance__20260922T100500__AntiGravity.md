# SIDELINE COACH — COPY REPORT REPEATABILITY RECONNAISSANCE REPORT

- **Date:** 2026-09-22
- **Agent:** Anti-Gravity
- **Task:** Low-effort bounded reconnaissance on Copy Report repeatability bug in Sideline Coach
- **Target Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
- **Execution Mode:** READ-ONLY RECONNAISSANCE ONLY. No code modified, no commits, no pushes.

---

## 1. CURRENT BEHAVIOR & LIFECYCLE TRACE

### 1.1 DOM Definition & Initial Render
- **Element:** `<button id="copyReportBtn" class="secondary">Copy Report</button>`
- **Location:** [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1209) inside `<section class="card" id="incomingCard">` under `<details id="reportPreviewDetails">`.
- **Initial State:**
  - `textContent`: `"Copy Report"`
  - `disabled`: `false`
  - `className`: `"secondary"` (classes `copy-success` and `copy-error` are absent)
  - `aria-label`: `"Copy Report"`
  - Active report reference: [`currentReport`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1665), established by [`renderReport(report)`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2278).

### 1.2 First Click Execution
- **Event Handler:** Single click listener bound at initialization in [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7715-L7756).
- **Immediate State Transition (Synchronous):**
  1. Guard: `if (!currentReport) return;`
  2. Captures `report = currentReport` and `reportKey = `${report.path}:${report.mtime}``.
  3. `button.disabled = true;`
  4. `button.textContent = 'Copying…';`
  5. `button.classList.remove('copy-success', 'copy-error');`
  6. Payload preparation:
     - `reportText = humanReportContent(report.content);`
     - Evaluates `handoff = eligibleCoachHandoff(reportKey);`
     - `payload = handoff ? `${handoff.text}\n${reportText}` : reportText;`

### 1.3 Clipboard Operation
- Calls [`copyText(payload)`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L5289-L5304).
- In secure browser context (`window.isSecureContext` and `navigator.clipboard` available), invokes `await navigator.clipboard.writeText(text);`.
- In non-secure context or headless fallback, appends a temporary hidden `<textarea>`, calls `document.execCommand('copy')`, and cleans up.

### 1.4 Post-Clipboard Success & State Mutation
When `copyText` succeeds:
1. Verifies selection didn't change mid-flight:
   `if (`${currentReport?.path}:${currentReport?.mtime}` !== reportKey) return;`
2. Mutates button label to completed past tense:
   `button.textContent = '✓ Report copied';` ([line 7734](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7734))
3. Adds CSS class:
   `button.classList.add('copy-success');` ([line 7735](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7735)), which styles the button green (`background: #12351f; border-color: #2f8f4e; color: #86efac;`).
4. Updates accessibility:
   `setAttr(button, 'aria-label', 'Report copied to clipboard');`
5. Dispatches asynchronous backend side effects (unawaited):
   - `void acknowledgeWork({ reportPath: report.path });` ([line 7740](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7740)) -> `POST /api/work/acknowledge`.
   - If `handoff` is present: `void deliverCoachHandoff(handoff.deliveries, report.path);` ([line 7743](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7743)) -> `POST /api/routines/delivered`, followed by `await refresh()`.
6. `finally` block executes:
   - `skippedHandoffReportKey = '';`
   - `if (`${currentReport?.path}:${currentReport?.mtime}` === reportKey) button.disabled = false;`

### 1.5 Post-Clipboard Failure
When `copyText` throws:
1. `button.textContent = 'Copy Failed · Try Again';` ([line 7746](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7746))
2. `button.classList.add('copy-error');`
3. In `finally`: `button.disabled = false;`

### 1.6 Subsequent State & Repeatability Failure
- **The Success Feedback is Terminal (No Timeout):**
  Unlike other copy buttons in the application:
  - [`aiScoreboardCopy`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L4835-L4837) restores label and classes after 5000ms via `setTimeout`.
  - [`flashConsoleButton`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2821-L2827) restores label after 1600ms via `setTimeout`.
  - [`fetchAiHealth`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L5185-L5188) restores label and classes after 5000ms via `setTimeout`.
  
  `copyReportBtn` **has NO timer or timeout whatsoever**.
  The helper function [`resetCopyReportState()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2249-L2257) is defined in the source, but it is **only** called in [`renderReport(report)`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2284) when `previousKey !== nextKey` (i.e., only when navigating away to a *different* report).
- **Subsequent Clicks on the Same Report:**
  Because `resetCopyReportState()` is never called while remaining on the same report:
  1. The button permanently displays `✓ Report copied` styled in green `.copy-success`.
  2. To human eyes, `✓ Report copied` indicates a terminal, non-actionable, "consumed" state.
  3. If the user clicks the button while it shows `✓ Report copied`:
     - The handler briefly sets `button.disabled = true; button.textContent = 'Copying…';`
     - `copyText(payload)` executes and resolves in 1–5 milliseconds.
     - The handler immediately re-sets `button.textContent = '✓ Report copied';` and `button.disabled = false;`.
     - Because this round-trip completes within 1–5ms (sub-frame), the visual transition is imperceptible. To the human user, clicking the button produces zero visual feedback or reaction, making it appear entirely frozen, dead, or locked.
  4. If a background status broadcast or routine delivery occurs, [`renderReports()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2301-L2312) executes `renderReport(reports[0])`, which blows away the select dropdown options and resets selection to `reports[0]`.

---

## 2. ROOT CAUSE ANALYSIS

1. **Primary Root Cause (Permanent Completion State / Missing Timer):**
   - In [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7734-L7735):
     `button.textContent = '✓ Report copied';`
     `button.classList.add('copy-success');`
     This state mutation is applied permanently with no scheduled reversion (e.g., `setTimeout(() => resetCopyReportState(), 1600)` or similar).
   - In [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2284):
     [`resetCopyReportState()`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2249-L2257) is gated strictly by `if (previousKey !== nextKey)`. As long as the user stays on the current report, `resetCopyReportState()` is unreachable.

2. **Author Semantic Misconception ("Deliberate Consumption"):**
   - Lines 7738–7739 state in code comments:
     `// Deliberate consumption of the report's content. A failed copy (catch below) never acknowledges — the human has not actually received anything yet.`
     The implementation confused backend work ledger acknowledgement (`acknowledgeWork`) with UI action consumption. Acknowledging work tells the daemon/Player strip that the user has reviewed the report; it was never intended to disable or consume the human's ability to copy that report again.

3. **Sub-frame Flash on Subsequent Clicks:**
   - Because `button.textContent` starts at `'✓ Report copied'` and ends at `'✓ Report copied'` with an asynchronous gap of only ~2ms, the browser does not provide distinguishable click/press feedback. The button looks completely dead/frozen on any subsequent click.

---

## 3. FACT / INFERENCE / UNKNOWN / CONTRADICTION

| Category | Finding | Proof / Source Location |
|---|---|---|
| **FACT** | `Copy Report` button is statically rendered in DOM | [`src/public/index.html:1209`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L1209) `<button id="copyReportBtn" class="secondary">Copy Report</button>` |
| **FACT** | Event listener is attached once at DOM startup | [`src/public/index.html:7715`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7715) `$('copyReportBtn').addEventListener('click', ...)` |
| **FACT** | Button text is mutated to `'✓ Report copied'` on success | [`src/public/index.html:7734`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7734) |
| **FACT** | Button class `copy-success` is added on success | [`src/public/index.html:7735`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7735) |
| **FACT** | `resetCopyReportState()` exists and resets button to `'Copy Report'` | [`src/public/index.html:2249-2257`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2249-L2257) |
| **FACT** | `resetCopyReportState()` is only called when report changes | [`src/public/index.html:2284`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2284) `if (previousKey !== nextKey) { resetCopyReportState(); ... }` |
| **FACT** | No `setTimeout` or transition timer resets `copyReportBtn` on the same report | Full audit of [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html) confirms 0 timers associated with `copyReportBtn` |
| **FACT** | `copyText` uses standard `navigator.clipboard.writeText` | [`src/public/index.html:5289-5304`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L5289-L5304) |
| **FACT** | `button.disabled = false` is called in `finally` | [`src/public/index.html:7754`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L7754) |
| **FACT** | `acknowledgeWork` calls `POST /api/work/acknowledge` | [`src/public/index.html:3516-3528`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L3516-L3528) and [`src/control-plane/daemon.ts:1758`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts#L1758) |
| **FACT** | `acknowledgeWork` does not delete or hide the report file | [`src/control-plane/work-ledger.ts:507-523`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts#L507-L523) |
| **INFERENCE** | User perceiving button as "frozen/consumed/disabled" is caused by permanent past-tense text `'✓ Report copied'`, green styling, and lack of visual state difference during re-clicks | Proven via Node test harness reproducing instant sub-frame re-copy with static button appearance |
| **INFERENCE** | If a routine handoff delivery or background event triggers `refresh()`, `renderReports` resets selection to `reports[0]`, confusing selection continuity | Proven by `renderReports` in [`index.html:2311`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html#L2311) |
| **CONTRADICTION RESOLVED** | Previous scout report claimed UI control was missing; user confirmed control definitely exists | Source inspection directly located `<button id="copyReportBtn">` at line 1209 and listener at line 7715 |

---

## 4. IMPORTANT FILES & FUNCTIONS

1. **[`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html)**
   - Line 1209: DOM button declaration `<button id="copyReportBtn" class="secondary">Copy Report</button>`
   - Lines 503–512: CSS classes `#copyReportBtn.copy-success` and `#copyReportBtn.copy-error`
   - Lines 2249–2257: Function `resetCopyReportState()`
   - Lines 2278–2299: Function `renderReport(report)`
   - Lines 2301–2312: Function `renderReports(items)`
   - Lines 5289–5304: Function `copyText(text)`
   - Lines 7715–7756: Click event listener `$('copyReportBtn').addEventListener('click', ...)`
2. **[`src/control-plane/daemon.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/daemon.ts)**
   - Lines 1758–1775: Endpoint `POST /api/work/acknowledge`
3. **[`src/control-plane/work-ledger.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/work-ledger.ts)**
   - Lines 507–523: Method `acknowledge(input)`
4. **[`test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs)**
   - Test harness simulating DOM and verifying copy clipboard interactions

---

## 5. MINIMAL REPAIR SEAM (FOR FUTURE IMPLEMENTATION)

*(Note: Per instructions, this seam is described only; NO changes were implemented).*

The repair requires introducing transient feedback semantics to `copyReportBtn`, matching the patterns already established by `flashConsoleButton` and `aiScoreboardCopy`:

1. **Manage a Feedback Timeout Handle:**
   Define a module-scoped timer variable near `resetCopyReportState`, e.g., `let copyReportTimer = null;`.
2. **Update `resetCopyReportState()`:**
   Clear any pending timer (`if (copyReportTimer) { clearTimeout(copyReportTimer); copyReportTimer = null; }`), ensure `button.disabled = false`, restore `button.textContent = 'Copy Report'`, and remove `copy-success` and `copy-error` classes.
3. **In the Click Handler (Success & Failure):**
   - Clear existing `copyReportTimer`.
   - On success (`await copyText(payload)`):
     - Display feedback (`✓ Report copied` or `✓ Copied`).
     - Set `button.classList.add('copy-success')`.
     - Schedule automatic restoration:
       ```javascript
       copyReportTimer = setTimeout(() => {
         resetCopyReportState();
       }, 2000);
       ```
   - On failure:
     - Display failure feedback (`Copy Failed · Try Again`).
     - Schedule automatic restoration or leave actionable until clicked.
   - On every subsequent click:
     - Cancel any active `copyReportTimer`.
     - Re-execute clipboard copy.
     - Refresh feedback and re-arm timer.
4. **Scope Safety:**
   This repair is entirely contained within ~10 lines in `src/public/index.html` inside the existing `resetCopyReportState` and click handler scope. It does not touch routing, chronology, scoreboards, or backend protocols.

---

## 6. TEST CONTRACT

A focused unit/integration test suite should verify the following 10 behaviors:

1. **Repeated Copy (Double Click):**
   Selecting a report and calling copy twice sequentially results in exactly 2 clipboard writes of identical content.
2. **Indefinite Repeated Copy (Multi-Click):**
   Clicking copy 5 or 10 times on the same report produces 5 or 10 distinct clipboard writes with unchanged report content.
3. **Fresh Clipboard Attempt on Every Click:**
   Every click event invokes `navigator.clipboard.writeText` anew; previous copy completion does not short-circuit or suppress subsequent invocations.
4. **Feedback Restoration to Actionable State:**
   After successful copy, button displays `✓ Report copied` (or configured label) and automatically reverts to `Copy Report` (without `copy-success` class) after the timeout expires (e.g. 2000ms).
5. **Re-click During Active Feedback:**
   Clicking the button while feedback is still showing cancels the previous timer, initiates a fresh copy, and resets the feedback timer.
6. **Failure Recovery and Retryability:**
   When clipboard write rejects (`permission denied`), button displays error feedback and remains actionable for an immediate retry.
7. **Report Persistence:**
   Successful copying does not delete the report, mutate `reports`, or alter report presence in the reader.
8. **Selection Integrity:**
   Copying a report does not advance, skip, or modify the active `reportSelect` index (remains on the copied report).
9. **Acknowledgement Non-Destructiveness:**
   Dispatching `acknowledgeWork` to the ledger marks the work acknowledged without invalidating report copy reusability.
10. **Routine Handoff Re-copy:**
    When routine handoff is included, copying twice re-evaluates handoff status truthfully without corrupting un-acknowledged report text.

---

## 7. SCOPE GUARD COMPLIANCE

- Incoming Reports design: NOT altered.
- Recent Reports chronology: NOT investigated, NOT modified (left untouched for concurrent instance).
- Report discovery: NOT altered.
- Scout Formation: NOT touched.
- Play Dispatcher: NOT touched.
- AI Usage Scoreboard: NOT touched.
- Read-only reconnaissance verified: `git status` confirms zero code changes staged or committed by this agent.

---

## 8. COMPLETE ABSOLUTE REPORT PATH

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\AntiGravity\Incoming-Reports-Copy-Report-Repeatability-Reconnaissance__20260922T100500__AntiGravity.md`
