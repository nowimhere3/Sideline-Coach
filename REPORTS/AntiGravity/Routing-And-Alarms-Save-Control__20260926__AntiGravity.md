# Routing & Alarms — Save Control UX Implementation Report

**Date:** 2026-09-26  
**Agent:** AntiGravity  
**Role:** Implementation Worker  
**Target:** Routing & Alarms Card Save Control UX  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Branch:** `q2.8-multigame-field-debug`

---

## 1. Executive Summary

We enhanced the user experience of the **Routing & Alarms** card in Settings (`#routingSettingsCard`) by introducing a unified 3-path save system with a dedicated, multi-state Save button and save-status indicator.

1. **Existing autosave on blur is fully preserved:** Editing any alarm threshold input and clicking away / tabbing away continues to autosave.
2. **Two new save paths added:**
   - **Enter key:** Pressing **Enter** in any threshold input field (`.alarm-threshold-input`) prevents default, commits focus, saves immediately, and reflects status on the Save button.
   - **Save button:** A dedicated button (`#routingAlarmsSaveBtn`) positioned at the **bottom-right of the Routing & Alarms card** saves all current values and serves as the visual status indicator.
3. **One unified persistence pipeline:** All three paths route through the existing `saveAlarmPreferences()` pipeline (`POST /api/preferences` with body `{ alarms: ... }`), avoiding separate or divergent implementations.
4. **Currently focused / typed input capture:** When Dad clicks the Save button without blurring or pressing Enter, `readAlarmPreferencesFromDom()` reads the active DOM input values synchronously, ensuring unblurred values are never dropped.
5. **Universal status coverage:** The Save button reflects immediate saving/saved/failed states for all Routing & Alarms controls, including the master switch (`Alarms Enabled`), trigger switches (`Notify when quota is low/critical`, `Notify when usage window resets`), delivery channel switches (`VS Code Popups`, `Browser Notifications`), and all 8 quota threshold inputs (`Claude` and `Codex` 5-Hour and Weekly Low & Critical).

---

## 2. Architecture & Design

### 2.1 DOM Structure & Placement

The Save button is placed inside the `.alarm-settings` container right below the `.alarm-threshold-section`, anchored to the bottom-right via flexbox:

```html
<div class="alarm-actions">
  <button id="routingAlarmsSaveBtn" class="btn quiet alarm-save-btn" type="button" aria-live="polite">Save</button>
</div>
```

### 2.2 Visual Presentation & Responsive Layout

The styling ensures the button is visually subordinate yet obvious, matching Sideline Coach design tokens and adapting to mobile viewports:

- **Resting:** Rounded pill button (`border-radius: 999px; min-height: 36px; padding: 7px 16px; font-size: .84rem; background: #202634; border: 1px solid #343b47; color: var(--text)`).
- **Responsive:** Placed in `.alarm-actions { display: flex; justify-content: flex-end; align-items: center; padding-top: 10px; margin-top: 2px; border-top: 1px solid var(--line); }`, ensuring it remains right-aligned and within viewport bounds even on 320px screens.

### 2.3 Four Save Button States

The Save button doubles as the save-status indicator with 4 distinct states:

| State | Label | Visual Styling | Interaction Behavior |
|---|---|---|---|
| **RESTING** | `Save` | Neutral background `#202634`, border `#343b47` | Actionable; clicking triggers immediate save |
| **SAVING** | `Saving…` | Accent border `#3b82f6`, text `#93c5fd`, opacity `0.8`, cursor `wait` | Disabled (`disabled = true`, `aria-busy="true"`) to prevent duplicate in-flight spam |
| **SUCCESS** | `Saved ✓` | Positive green background `#12351f`, border `#2f8f4e`, text `#86efac` | Enabled; automatically returns to `Save` after 2200ms delay so Dad can clearly register it |
| **FAILURE** | `Save failed · Retry` | Error red background `#3f1218`, border `#a83644`, text `#fecaca` | Actionable (`disabled = false`); clicking retries the save immediately |

### 2.4 In-Flight & Concurrency Protection

When Dad edits an input and presses Enter or clicks Save, browser event cascades can trigger both `blur` (which fires `change`) and `click`/`keydown` in rapid succession. To guarantee consistency:
1. `saveAlarmPreferences()` calculates `targetPayload` from DOM state.
2. If a save is already in-flight with an identical payload (`inFlightAlarmPayload === targetPayload`), the in-flight Promise is returned without emitting a duplicate HTTP request.
3. If user edits another field while a save is in-flight, `queuedAlarmSave` queues the update, which executes automatically when the active save resolves.

---

## 3. Implementation Details

### File: `src/public/index.html`

1. **CSS Styles Added (lines ~381-404):**
   - `.alarm-actions`: flex container aligned to flex-end.
   - `.alarm-save-btn`: rounded pill styling with hover and focus-visible states.
   - `.alarm-save-btn.is-saving, .alarm-save-btn.saving`: waiting/busy state.
   - `.alarm-save-btn.is-success, .alarm-save-btn.saved, .alarm-save-btn.success`: positive green feedback.
   - `.alarm-save-btn.is-failure, .alarm-save-btn.failed, .alarm-save-btn.error`: retryable error feedback.

2. **Markup Added (lines ~2235-2237):**
   - Added `.alarm-actions` with `#routingAlarmsSaveBtn` inside `.alarm-settings`.

3. **JavaScript Logic Added (lines ~8911-8986):**
   - `readAlarmPreferencesFromDom()`: Synchronously gathers current DOM input states from `ALARM_TOGGLES`, `alarmVsCodeToggle`, `alarmBrowserToggle`, and `ALARM_THRESHOLD_INPUTS`.
   - `setAlarmSaveButtonState(state)`: Manages CSS classes, text content, accessibility attributes, and 2.2-second reset timer.
   - `saveAlarmPreferences(mutate)`: Unified entry point supporting mutators (from toggles) and unblurred DOM reading (from button click or Enter key), with concurrency serialization.
   - Enter key listener on threshold inputs: `preventDefault()`, `blur()`, `saveAlarmPreferences()`.
   - Save button click listener: `saveAlarmPreferences()`.

---

## 4. Verification & Automated Test Coverage

### Dedicated Test Suite: `test/routing-alarms-save-control.test.mjs`

An automated test suite was constructed covering all functional requirements:
- `SAVE-1`: Save button renders at bottom-right of Routing & Alarms card with resting text `Save`.
- `SAVE-2`: Blur on threshold input persists value and transitions button states (`Saving…` -> `Saved ✓`).
- `SAVE-3`: Pressing Enter in threshold input prevents default, saves immediately, and reflects status on button.
- `SAVE-4`: Clicking Save button persists current DOM/unblurred input values and reflects status.
- `SAVE-5`: All three paths use the same canonical `POST /api/preferences` contract and payload shape.
- `SAVE-6`: Toggle switches in Routing & Alarms (`alarmsEnabledToggle`, `alarmResetToggle`, `alarmVsCodeToggle`) update Save button status.
- `SAVE-7`: Failure transition shows `Save failed · Retry` and remains actionable for retry.
- `SAVE-8`: `Saved ✓` reverts to `Save` after timeout.

### Regression Test Suite Results

```
✔ SAVE-1 through SAVE-8: 8/8 pass (test/routing-alarms-save-control.test.mjs)
✔ Settings Hierarchy: 34/34 pass (test/s55-0-settings-hierarchy.test.mjs)
✔ Alarm Delivery: 16/16 pass (test/ai-usage-alarm-delivery.test.mjs)
✔ Terminal Player Regression: 102/102 pass (test/terminal-*.test.mjs, test/s54-4-*.test.mjs, test/p0-1-*.test.mjs)
✔ npm run check: 0 errors
✔ npm run compile: 0 errors
```

All existing untracked files and working branch modifications remain preserved. No git resets, cleanups, commits, or pushes were performed.
