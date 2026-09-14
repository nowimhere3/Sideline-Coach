REPORT FILE:
Coach-Routines-V0-Human-Field-Polish-Dadified-Settings-UX.md

REPORT TIMESTAMP:
2026-09-14 13:41:52 -06:00 (America/Edmonton)

# Executive Result

**Coach Routines V0 Human Field Polish is complete.** The first real human field test proved the Slice D/E plumbing works end to end, but rated the Settings UX itself *"Really cool feature, horrible UI."* Every specific confusion the human named was fixed as a presentation-only redesign over the exact same Slice D/E truth model — no new persistence path, no second draft state, and (with one small, safe, additive exception for Hours cadence) no server architecture reopened.

Fixed: the duplicate "+ Add files" / "Browse folder" entry points collapsed into one `+ Add references`; the reference browser now makes CHECK (select) and OPEN (navigate) two obviously distinct, separately tappable controls, with a folder selectable directly from wherever it's listed (removing the old, hidden "Use entire folder" extra step); suggestions load automatically and explain themselves; a real `Saved ✓ / Done` confidence affordance now exists, backed only by real mutation results; the Send-to-Coach explanation no longer mentions Players and its ⓘ toggle actually works (the old "Got it" button visibly did nothing); the manual trigger is now honestly named `Refresh on next Copy`; the "Last sent … Needs files …" concatenation is gone; and cadence gained **Hours** alongside Plays and Days.

None of the six stop conditions applied. The one genuinely required server change — widening the `time` cadence validator's minimum from 1 day to 1 hour so Hours is real, not a browser lie — was a tiny, safe, additive extension of an existing validator, not an architecture change (confirmed by inspecting `src/control-plane/coach-routines.ts` directly before touching it).

# Field Evidence Received

Direct quotes and observations supplied in the assignment, treated as authoritative UX evidence:

- *"Really cool feature, horrible UI."*
- *"I checked Onboarding Docs. Now how the fuck do I explore it?"* — navigation wasn't discoverable from inside a checked folder.
- `Add selected` stayed disabled after selecting a folder (see "Real Defect vs. Stale EDH" below).
- Two buttons ("+ Add files" / "Browse folder") that appeared to lead to the same place, with no explanation of why both existed.
- `Show suggestions` gave no indication of what would happen.
- Clicking `Got it` did nothing visible.
- `Refresh now` did not actually cause an immediate reread — the wording implied a mental model the real behavior doesn't have.
- `Last sent: never · Needs files — add what to reread` read as one cryptic, concatenated sentence.
- No signal that configuration was safely saved and the human was free to leave — compared explicitly to Scouting's `Done` affordance.
- A request, independently clarified before implementation, that `Saved ✓ / Done` is a **closure/confidence affordance**, not a request for manual-save semantics — autosave must be preserved exactly.

# What Was Real Defect vs. Stale EDH

**Stale Extension Development Host — not a code defect.** The human's first symptom (`Add selected` staying disabled after checking a folder) was traced during the same field session to a stale compiled build in the Extension Development Host; `Developer: Reload Window` plus restarting the relevant dev hosts resolved it, and the intended Slice D selection behavior worked once the current build was actually loaded. No production code was changed for this — it is recorded as a development-process breadcrumb only (see Breadcrumbs below), per explicit instruction not to broaden it into a Freshness Guard redesign.

**Real defects fixed in this Play** (verified by direct code inspection and, in one case, a fresh minimal repro, not assumed):
1. The reference browser's checkbox-vs-navigate ambiguity, and the redundant "Use entire folder" step, were genuine information-architecture defects — confirmed by re-reading the Slice D code, which really did require opening a folder before offering to select it as a whole, with no way to select a folder from its own parent listing.
2. The Send-to-Coach explainer's `Got it` button really did just toggle a paragraph hidden inside the same `<label>` as the checkbox — in a real browser, clicking anywhere inside a `<label>` also fires a synthetic click on its associated control, so the risk (and plausible field-observed symptom) was the info button *also* flipping Send to Coach. Fixed by moving the info toggle and its paragraph outside the `<label>` entirely.
3. **A genuine memoization bug found while implementing the polish**, independent of any field report: the render-memoization key for the browse panel serialized `routineBrowse` (which holds a `Map` for `.selected`) via `JSON.stringify`, which silently produces `{}` for a `Map`. Checking or unchecking an item inside the browser therefore could never actually change the memoized key, so `Add N selected`'s live count could freeze mid-interaction. Fixed by flattening `.selected` to a plain, sorted array before serializing it into the memo key.

# Final Human Mental Model

```
Coach Refresh                                     ON

Send every
[ 5 ] [ Plays ▾ ]                                 (Plays / Hours / Days)

Where should this refresh go?

☑ Send to Coach                                   ⓘ
Your Coach AI will be reminded what to reread
before helping with the next Play.

☐ Send to Players                    Coming soon

What should Coach reread?

Current references
✓ NORTH-STAR.md              Remove
✓ Docs ANCHOR/                Remove

Suggested references
Sideline found project docs that may be useful for Coach Refresh.
Operating Manual.md                              [ Add ]
Project SOP                                       ✓ Added

[ + Add references ]

Last refresh: Never

[ Refresh on next Copy ]

Saved ✓                                      [ Done ]

Delete routine
```

# Reference-Browser Redesign

- **One entry point.** `+ Add files` and `Browse folder` are both gone; a single `+ Add references` opens the same reference browser, starting at the Game root.
- **CHECK selects, OPEN navigates — never both, never inferred from one another.** Every listed entry (file or folder, at any level, including the Game-root listing itself) carries its own checkbox — checking a folder's checkbox *is* "use this whole folder as a reference," available the instant it's listed, with no need to open it first. A folder additionally carries a separate `Open ›` button that only descends into it; clicking `Open ›` never touches the checkbox.
- **Selections persist while exploring.** The `selected` `Map` is keyed by exact routine id and survives navigating in and out of folders within the same browse session (`Polish-15` proves checking a top-level file, then opening a subfolder, still shows `Add 1 selected`). This directly answers the field complaint about not being able to explore after checking something.
- **`Add N selected`** reflects the live count as items are checked/unchecked, and reads `Add selected` (disabled) when nothing is chosen.
- **`‹ Back`** replaces the old bottom-row `↑ Up one level`, placed at the top beside the current folder name, matching the requested "Back, then children" flow.
- Mobile: the checkbox is 22px and the `Open ›` button is a bordered, `min-height: 36px` control with its own visible boundary — two separate, unambiguous tap targets, never a text label doubling as a button.

# Suggestions UX

- Suggestions now load automatically in the background the first time a routine's card renders for a Game (cached per Game; never refetched needlessly) — no click required to discover they exist.
- Rendered as a labelled section, `Suggested references`, with one sentence of context (`Sideline found project docs that may be useful for Coach Refresh.`), then a plain list: one row per suggestion, an unambiguous `Add` button, or `✓ Added` once it's truthfully already in the routine's configured sources.
- A background fetch failure fails quiet (the section simply doesn't appear) rather than surfacing an unrequested error toast for something the human never clicked.
- Nothing is added without an explicit `Add` click — proven directly (`SliceD-10`).

# Completion / Saved / Done UX

- **Not a new persistence path.** Every mutation still saves immediately, exactly as Slice D/E already did; `runRoutineMutation` is a thin presentation wrapper around the existing `patchRoutine`/`addRoutineSources`/`removeRoutineSource` calls, which are unchanged in *what* they persist.
- **State machine, per routine, presentation-only:** `saving` → `saved` (or `error`), set only from that mutation's *real* resolved result (after `patchRoutine`'s own internal `await refresh()` has already reconverged from a fresh status fetch) — never optimistic.
- **Never shown until the routine has actually been touched this session** — no presumed `Saved ✓` on first paint (`Polish-8/9/10` proves the row is entirely absent before any interaction).
- **`Done` is disabled while a save is in flight**, so it can never imply completion before persistence is confirmed (`Polish-8/9/10`).
- **A failed mutation never shows `Saved ✓`** — it shows `Couldn't save that change` inline, alongside the existing toast with the real Dadified error (`Polish-11`).
- **`Done`'s job is closure only**: it closes the open browse panel (if any) and collapses the Send-to-Coach info line, then clears the save-state row itself — it never touches, deletes, or resets the persisted routine configuration (`Polish-12` explicitly proves a configured reference is still present after `Done`).

# Cadence, Including Hours

Inspected `src/control-plane/coach-routines.ts`'s `validateCadence` and the lazy `cadenceEarned` evaluation (`now − last ≥ everyMs`) before touching anything: the evaluation path is already unit-agnostic — it only ever compares raw milliseconds. Hours therefore needed only:

- A new `HOUR_MS = 3_600_000` constant.
- `validateCadence`'s `time` branch minimum changed from `DAY_MS` to `HOUR_MS`, and its "must be a whole multiple" check changed from `% DAY_MS` to `% HOUR_MS` (a day is already an exact multiple of an hour, so every previously valid Days cadence remains valid). The upper bound, 30 days, is unchanged.
- `cadenceLabel`, `lastSentLabel`, and `nextLabel` (server-computed Dadified strings) made hour-aware so a sub-day cadence never displays as `"Every 0.125 days"` or `"0 days ago"`.

No scheduler, no cron, no new evaluation method, no duplicated timing state — confirmed structurally (`Polish-7`: exactly the existing single `setInterval(tickElapsedClocks, 1_000)` remains; no `cron` string anywhere in the page script).

**Browser UI:** the unit `<select>` now offers Plays / Hours / Days; switching units re-bounds the number input (1–100 / 1–72 / 1–30 respectively) so a value valid in one unit is clamped, never silently carried over invalid into another (`Polish-6`). All three units round-trip to the exact backend `RoutineInput.cadence` shape (`Polish-3/4/5`), and the real validator genuinely rejects a sub-hour or non-hour-aligned value (`Polish-2`).

# Send-to-Coach Copy

Replaced the old shared copy (which sat directly above `Send to Players` and read as if it described both targets) with:

> Your Coach AI will be reminded what to reread before helping with the next Play.

An ⓘ button, now a sibling of the `<label>` rather than nested inside it, toggles a collapsed-by-default secondary line:

> Sideline sends the reminder and reference locations, not the files themselves.

`Polish-13` proves the toggle never flips `Send to Coach` and reliably opens/closes on repeated clicks; `Polish-14` proves the primary sentence never mentions "Player" and the explainer starts collapsed.

# Manual Refresh-Trigger Rename

`Refresh now` → **`Refresh on next Copy`**, with confirmation copy `Coach Refresh will be added to your next report Copy.` (previously the machine-sounding `Marked ready to refresh.`). The underlying call (`POST /api/routines/:id/due`) is unchanged — only the label and confirmation now match what actually happens (`SliceD-19`).

# Files Changed

| File | Change |
|---|---|
| `src/control-plane/coach-routines.ts` | `HOUR_MS` constant; `validateCadence`'s time-cadence bounds widened to accept Hours; `cadenceLabel`/`lastSentLabel`/`nextLabel` made hour-aware. No other server logic changed. |
| `src/public/index.html` | Full redesign of the Coach Routines card's JS (single reference entry point; redesigned browse panel with CHECK/OPEN separation; auto-loading self-explanatory suggestions; `runRoutineMutation`/`routineSaveState` Saved✓/Done machinery; Send-to-Coach copy + relocated ⓘ toggle; Hours-aware cadence controls; Dadified `Refresh on next Copy` and `Last refresh:` line) and matching CSS (`.routine-browse-open`, `.routine-suggestion-*`, `.routine-coach-info`, `.routine-save-*`, `.routine-current-label`, and updated action-button sizing rules). The real memo-key `Map`-serialization bug (see above) was fixed in the same pass. |
| `test/coach-routines-v0-slice-d-settings.test.mjs` | 9 of 25 tests updated to the new UX contract (new entry-point name, checkbox-on-parent-folder selection, `Refresh on next Copy` label, mobile CSS selector names); the other 16 (backend authority, Game isolation, removal, Dadified states, no-Incoming-mutation, etc.) needed no change since the underlying truth model is unchanged |
| `test/coach-routines-human-field-polish.test.mjs` | **new**, 13 tests: 2 real-daemon (Hours genuinely accepted/rejected by the real validator), 11 DOM-driven (cadence round-trips and unit re-bounding, Saved/Done lifecycle including in-flight and failure states, Done's closure-not-deletion behavior, the ⓘ toggle's independence and reliability, Send-to-Coach copy, and selection survival across folder navigation) |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` | Coach Routines section: header now names Human Field Polish; the Slice D paragraph trimmed to what's still true (ownership/truth model) with a pointer to the new paragraph; a new **IS (Human Field Polish)** paragraph; a development-process breadcrumb (stale EDH, not a defect); a **FUTURE breadcrumb** for Dev Mode "Under the Hood" / Live Player Console, explicitly marked not implemented |
| `REPORTS/Claude/Coach-Routines-V0-Human-Field-Polish-Dadified-Settings-UX.md` | this report |

No other server file changed. All unrelated dirty-tree work (Q2.10F.2 Slices, Q2.10F.3/4/4.1, `.vscode/launch.json`, etc.) was preserved untouched.

# Tests and Exact Counts

```
node --test test/coach-routines-v0-slice-d-settings.test.mjs
25 passed, 0 failed

node --test test/coach-routines-human-field-polish.test.mjs
13 passed, 0 failed

node --test test/coach-routine-sources.test.mjs test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs test/coach-routines-v0-slice-d-settings.test.mjs test/coach-routines-v0-slice-e-incoming-copy-handoff.test.mjs test/coach-routines-human-field-polish.test.mjs
109 passed, 0 failed   (all Coach Routines A+B+C+D+E+Polish suites together)

node --test test/dispatcher-reliability-ux.test.mjs test/browser-live-state-reconnection.test.mjs test/control-plane-roster-projection.test.mjs test/q2-10c-work-ledger.test.mjs
32 passed, 0 failed    (broader browser/Settings regression, unaffected)
```

# Validation Results

| Command | Result |
|---|---|
| `npm run check` | PASS |
| `npm run compile` | PASS |
| `node --test test/coach-routines-human-field-polish.test.mjs` | 13 passed, 0 failed |
| `node --test` (Coach Routines A+B+C+D+E+Polish combined) | 109 passed, 0 failed |
| `npm test` (final run) | **650 passed, 0 failed, 0 skipped, 0 cancelled** (637 before this Play + 13 new) |
| `git diff --check` | PASS; only pre-existing LF/CRLF notices |

**A real defect was caught and fixed while writing the FIRST version of the new tests, not papered over:** `Polish-15` initially failed because my own test's `find(card, n => n.tagName === 'input')` matched the routine's ON/OFF checkbox (the first `<input>` in document order) rather than the intended browse-panel file checkbox — a test-authoring bug, confirmed by an isolated repro script, and fixed by scoping the lookup to the browse panel specifically. Separately, the genuine production memo-key bug described above (`JSON.stringify` silently dropping a `Map`) was found and fixed in production code, not worked around in a test.

# Compatibility Notes

- `RoutineInput.cadence.everyMs` for Hours is a perfectly ordinary value the existing `time` cadence already knew how to store and evaluate; no new field, no schema version bump.
- Any *existing* persisted Days-cadence routine remains valid under the widened validator (a day is already an hour-multiple) and displays identically.
- `.routine-suggestion-chip` and `.folder-open` CSS classes from Slice D no longer exist (replaced by the new browse/suggestion class names); nothing else in Settings referenced them.
- `#coachHandoffBanner` (Slice E's Incoming due banner) is untouched by this Play — it reads the same `status.routines.handoff` and is unaffected by the Settings redesign, confirmed by the full Slice E suite passing unchanged.

# Known Constraints

- The `Saved ✓ / Done` row does not persist across a full page reload — refreshing mid-edit returns to the calm summary state with no `Saved ✓` shown, since the flag is intentionally presentation-only and reset by `resetCoachRoutinesUiState`/a fresh render. This is consistent with "never a second persistence path."
- The suggestions "self-tidying" behavior (a suggestion disappears from the Suggested list once every offered item is already configured) means an empty-suggestions Game shows no `Suggested references` section at all rather than an explicit empty state — judged appropriately quiet rather than adding chrome for a non-event.
- Routine renaming and multi-routine creation UI remain unexposed in V0 Settings, unchanged from Slice D's own documented limitation.

# Smallest Human Field Test

1. `Developer: Reload Window`, so field proof is definitely running the current build.
2. Settings → Dev Mode → Coach Refresh.
3. Confirm cadence offers Plays / Hours / Days.
4. Click `+ Add references`.
5. Confirm a folder clearly has a separate checkbox (select) and `Open ›` (navigate) action.
6. Open a folder and select one file.
7. Confirm the selection count is visible, then `Add`.
8. Confirm the reference appears under Current references and `Saved ✓` is shown.
9. Use Suggested references and add one.
10. Click `Done`.
11. Confirm the configuration now feels finished rather than abandoned mid-form.
12. Trigger `Refresh on next Copy` and confirm its confirmation message makes sense.
13. Complete the existing Incoming Copy proof (Slice E) once, to confirm the whole loop still feels coherent end to end.

# WAS / IS / WILL BE

## WAS

Coach Routines had a fully working backend (Slices A/B/C) and a functionally complete Settings/Incoming loop (Slices D/E), but the first human to actually use it could not tell why two buttons existed for adding references, could not figure out how to explore a folder after checking it, saw a broken "Got it" interaction, misread "Refresh now" as immediate, and had no signal that their configuration was safely done.

## IS

The exact same backend and delivery truth model, presented so a non-coder can use it without reverse-engineering what a button means: one reference entry point with unambiguous select-vs-navigate controls that remember selections while exploring; self-explanatory background-loaded suggestions; a real `Saved ✓ / Done` confidence affordance backed only by real mutation results; a Send-to-Coach explanation that talks about Coach, not Players, with a toggle that reliably works; an honestly-named manual trigger; and cadence that speaks in Plays, Hours, or Days.

## WILL BE

Coach Routines V0 — Human Field Proof / Closure: a second, brief human pass against this corrected UX, followed by V0 closure. Downstream and still explicitly not started: optional exact-instance Player routine delivery (`Send to Players` stays `Coming soon`), routine renaming, multi-routine creation UI, Play-type-triggered routines, and the newly recorded FUTURE "Under the Hood" / Live Player Console concept.

# Recommended Next Play

**Coach Routines V0 — Human Field Proof / Closure**, using the smallest-field-test sequence above.

After Coach Routines V0 closes, return to the already-completed Game Setup reconnaissance and address the known `+ Add Game` visibility failure before broader Game Setup onboarding work. Game Setup itself was not started in this Play.

# Commit / Push Status

No commit was created. Nothing was pushed.

REPORT: Coach-Routines-V0-Human-Field-Polish-Dadified-Settings-UX.md
TIMESTAMP: 2026-09-14 13:41:52 -06:00 (America/Edmonton)
