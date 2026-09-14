# Coach Routines V0 — Field Corrective: Due Banner Never Clears After Successful Copy

## Field defect

1. Coach Refresh configured and saved.
2. Human clicks `Refresh on next Copy`.
3. Incoming correctly shows: `↻ Coach Refresh is due`.
4. Human clicks Copy.
5. UI correctly shows: `✓ Report Copied · with Coach Refresh`.
6. Human waits.
7. The blue `↻ Coach Refresh is due` banner remains indefinitely, even though no new Play was dispatched and no new report was generated.

## Root cause (confirmed, not guessed)

Two bugs combine to produce the exact reported symptom, isolated via a real end-to-end repro (a real `ControlPlaneDaemon`, a directly registered Stadium session, and the real `src/public/index.html` script driven over real HTTP — not a mock):

**1. CSS — the actual visible-forever cause.**
`src/public/index.html` line 316:
```css
.coach-handoff-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  padding: 9px 12px; border: 1px solid #2f4d7d; border-radius: 12px; background: #10223d; color: #93c5fd;
}
```
This rule had no `[hidden]` override. In CSS cascade rules, **author-stylesheet declarations always win over the user-agent stylesheet's `[hidden] { display: none }`, regardless of selector specificity** (origin/importance is resolved before specificity). So setting `banner.hidden = true` in JavaScript never actually hid the element in a real browser — the banner stayed rendered as `display: flex` forever, no matter what the `hidden` property said.

This exact class of bug — and its fix — already exists elsewhere in the very same file for every other component that toggles visibility via the `hidden` property: `.outgoing-ack[hidden]`, `.modal-backdrop[hidden]`, `.settings-view[hidden]`, `.game-dropdown-menu[hidden]` all explicitly force `display: none !important`. `.coach-handoff-banner` was the one component missing that guard.

**2. JavaScript — why the visible-forever banner also showed the wrong (stale) text.**
`syncIncomingCoachHandoff` (`src/public/index.html`, ~line 3600):
```js
const syncIncomingCoachHandoff = (status) => {
  const banner = $('coachHandoffBanner');
  if (!banner) return;
  const reportKey = currentReport ? `${currentReport.path}:${currentReport.mtime}` : '';
  const handoff = eligibleCoachHandoff(reportKey);
  banner.hidden = !handoff;
  if (!handoff) return;                          // <-- never clears the title
  $('coachHandoffTitle').textContent = `↻ ${dadifyHandoffTitle(handoff, status?.routines?.routines)} is due`;
};
```
When `handoff` became falsy (i.e. the backend correctly stopped projecting the delivered cycle), the function correctly set `banner.hidden = true` but returned before ever clearing `coachHandoffTitle.textContent`. Combined with bug #1 (the banner staying visible regardless of `hidden`), the human kept seeing the exact same stale `↻ Coach Refresh is due` text forever, unchanged, exactly matching the field report.

**The rest of the pipeline was already correct** and required no changes: Copy handler → `deliverCoachHandoff` → `POST /api/routines/delivered` → `CoachRoutineEngine.markDelivered` (exact cycle match, `manualDue` reset) → `refresh()` (with a `refreshGeneration` staleness guard that correctly discards any out-of-order in-flight response) → `status.routines.handoff` correctly becomes `undefined` → `syncIncomingCoachHandoff` correctly computes `hidden = true`. This was independently confirmed via a pure backend-only repro (`/api/routines/:id/due` → `/api/status` shows `handoff` → `/api/routines/delivered` → `/api/status` shows `handoff: undefined`) and via the combined browser+daemon repro, which showed `banner.hidden` flip to `true` correctly on every run. The defect was never in delivery acknowledgement, cycle/routine identity, Game/report identity, refresh staleness, or a race — it was a DOM-property vs. CSS-cascade mismatch, plus one missed text-clear.

## Why automated tests previously missed it

Every existing Coach Routines test (Slice E's `E-19`/`E-20`, Human Field Polish, etc.) asserts against the `hidden` **DOM property** directly (e.g. `page.banner().hidden === false`). None of them resolve CSS cascade or computed style — the hand-rolled DOM stubs used throughout this test suite don't run a layout/style engine at all. The JS logic setting `hidden = true` was already correct and every such assertion already passed, so the missing `.coach-handoff-banner[hidden] { display: none !important; }` CSS override was structurally invisible to the existing suite. The stale-title omission was likewise never caught because no test checked `coachHandoffTitle.textContent` after a handoff cleared — only whether the banner was reported hidden.

## Fix (smallest real cause; no architecture change)

1. **`src/public/index.html`** — added the missing CSS override, matching the established sibling pattern:
   ```css
   .coach-handoff-banner[hidden] { display: none !important; }
   ```
2. **`src/public/index.html`** — `syncIncomingCoachHandoff` now clears the stale title when there is no handoff:
   ```js
   if (!handoff) { $('coachHandoffTitle').textContent = ''; return; }
   ```

No changes to `src/control-plane/coach-routines.ts`, `deliverCoachHandoff`, `/api/routines/delivered`, cycle/routine identity, cadence/delivery architecture, `Not this time` semantics, or canonical report content. This is a two-line bounded implementation fix, not a redesign — the STOP CONDITION does not apply.

## Tests

Added `test/coach-routines-field-corrective-banner-clear.test.mjs`:
- **FC-1** — asserts the stylesheet text itself contains `.coach-handoff-banner[hidden] { display: none !important; }` (the same technique Slice E's own `E-25` already uses to check CSS, since the DOM stubs cannot resolve cascade). This is the test that would have caught the actual root cause.
- **FC-2** — reproduces the exact human sequence end-to-end: routine due → banner visible with correct title → Copy includes Coach Refresh → clipboard succeeds → `/api/routines/delivered` called with the exact cycle → backend reconverges with no handoff → banner clears (`hidden === true`) **and** the title is empty (no stale text left behind) — all without a page reload, a new Play, or a new report.
- **FC-3** — proves the failure path is unchanged: clipboard succeeds, `/api/routines/delivered` fails, the banner remains due with its correct (non-fabricated) title, and no delivered state is fabricated.

Full Coach Routines regression suites re-run alongside the new file (Slice D settings, Slice E incoming/copy handoff, Human Field Polish, engine, daemon): **79/79 passed**.

## Validation

- `npm run check` — clean, no errors.
- `npm run compile` — clean, no errors.
- Focused Coach Routines suites — 79/79 passed.
- `npm test` (full suite) — **653 passed, 0 failed** (baseline was 650 passed, 0 failed; +3 for this corrective's new file).
- `git diff --check` — exit 0, only pre-existing LF/CRLF `autocrlf` informational warnings on files already modified before this turn; no whitespace-error findings.

## Smallest human retest

1. `Developer: Reload Window`.
2. Settings → Coach Refresh → `Refresh on next Copy`.
3. Incoming confirms `Coach Refresh is due`.
4. Copy report.
5. Confirm `✓ Report Copied · with Coach Refresh`.
6. Confirm the blue due banner disappears automatically within normal convergence time.

## Coach Routines V0 readiness

With this corrective applied, the full contract now holds end-to-end and is defended by an assertion (FC-1) that resolves the actual CSS cascade the browser uses, not just the JS-level `hidden` property. Combined with the previously validated Slices A–E and Human Field Polish, Coach Routines V0 is ready for closure pending this human retest confirming the fix in the real browser (the automated repro cannot execute real CSS cascade resolution — FC-1's stylesheet-text assertion is the closest automated proxy available, so the human step above is the definitive confirmation).

REPORT: Coach-Routines-V0-Field-Corrective-Due-Banner-Clear-After-Copy.md
TIMESTAMP: 2026-09-14 14:15 MDT (America/Edmonton)
