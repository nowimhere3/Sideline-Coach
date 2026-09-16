REPORT FILE: Coach-Routines-V0.1-Add-Edit-And-Assistant-Coach-Repository-Coordinates.md
REPORT TIMESTAMP: 2026-09-14 15:48 MDT (America/Edmonton)

# Coach Routines V0.1 — Add / Edit + AI Assistant Coach Repository Coordinates

## What was found

**Part A.** Deleting the only Coach Routine left `Settings` showing "No Coach Routines yet for this Game." with no way to create another one — a real dead end, confirmed by reading `renderCoachRoutinesList` (`src/public/index.html`), which rendered only a static `<p>` in the empty case. The backend, however, already fully supported creation: `POST /api/routines` → `CoachRoutineEngine.create()` already existed and was exercised by nothing in the browser. Every existing routine field (enabled, cadence, target, references) was already always-editable inline with autosave via `patchRoutine` — except two fields the assignment explicitly calls out as supported: the routine's **name** and its **custom instruction**. Neither had any UI at all; a routine's name was only ever shown as a hardcoded "Coach Refresh" label.

**Part B.** The canonical handoff envelope (`buildStrategyBoardEnvelope`) already had a `Repository:` line, but it was sourced only from `locator.repoUri` — the Stadium's auto-detected git remote, never a human-editable value. There was no way to give the Assistant Coach an explicit repository coordinate for a Game where auto-detection is absent, wrong, or where the human simply wants an override for an Assistant Coach running elsewhere (phone, browser, another machine).

## Exact implementation

### Part A — Add / Edit

- **Zero state** (`src/public/index.html`, `renderCoachRoutinesList`): now renders "No Coach Refreshes yet for this Game." plus an always-present `+ Add Coach Refresh` button (shown whether the list is empty or not, so a second/third routine can be added the same way). Deleting the last routine still relies on the existing `defaultsInitialized` flag in `CoachRoutineEngine` — nothing is silently recreated; the human must explicitly click Add.
- **Add** calls the existing `POST /api/routines` with sensible defaults: `name: 'Coach Refresh'`, `template: 'custom'`, `cadence: every 5 Plays`, `targets: { strategyBoard: true }`, empty sources. `template: 'custom'` (not `'canonical-refresh'`) was deliberately chosen so the new routine gets an editable name (see below) rather than the hardcoded "Coach Refresh" label reserved for the original default routine. On success the routine appears immediately via the existing `refresh()` convergence — no separate "create mode" screen: **the freshly created card is already the live editor**, pre-populated with defaults, exactly like every other routine.
- **Edit**: this codebase's existing design is that every routine card is *always* live-editable (no separate view/edit mode) — enabled, cadence, target, and references already autosaved per field. That satisfied "existing routines must be editable" for everything except name and instruction, which were added:
  - **Name**: for any routine whose `template !== 'canonical-refresh'`, the static `<strong>` title is now a text `<input class="routine-name-input">`, pre-populated with `routine.name`, committing on `change` via the existing `patchRoutine(gameId, routine.id, { name })` path (same autosave pattern as cadence). The original default routine's template (`canonical-refresh`) keeps its fixed "Coach Refresh" label unchanged — this preserves the existing Slice E contract that the default routine's Dad-facing name is never anything else.
  - **Custom instruction**: a new `<textarea class="routine-instruction-input">` section, pre-populated with `routine.instruction`, committing on `change` via `patchRoutine(gameId, routine.id, { instruction })`. Clearing it removes the field (the engine's existing `update()` already deletes an empty `instruction` on PATCH — no backend change needed there).
  - Every mutation continues to use `routine.id`, so multiple routines remain fully independent (verified in tests below).
- **CRUD**: Add (new), Edit (name/instruction added; other fields pre-existing), Enable/Disable (pre-existing), Delete (pre-existing) — all four now function end-to-end. No end dates, run counts, or cron were added.
- **Copy polish**: the manual trigger button was renamed from `Refresh on next Copy` to `Add to next report` (and its `aria-label` to match). The underlying semantics are byte-for-byte unchanged: it still calls `POST /api/routines/:id/due`, which still sets `manualDue`; delivery/acknowledgement/idempotency logic in `CoachRoutineEngine` was not touched.

### Part B — Per-Game repository URL

**Persistence location chosen**: `GameRoutineState.repositoryUrl?: string` inside the existing `coach-routines.json` store (`src/control-plane/coach-routines.ts`), the same per-Game, atomic-write, restart-safe seam that already holds `playCount`, `countedRefs`, and `routines`. This was the smallest existing seam that is already keyed exactly by `gameId` and already survives daemon restart — no new store, no Game-identity migration, and no change to the global `preferences.json` (which is not per-Game).

- `CoachRoutineEngine.setRepositoryUrl(gameId, value)`: trims the input; blank clears it; a non-blank value must look like `https://…` (basic format check only — `^https?:\/\/[^\s]+\.[^\s]+/i`, max 300 chars) and throws `RoutineValidationError` otherwise. No GitHub call, no clone, no auth, no branch inspection — exactly as required.
- `decodeState` preserves `repositoryUrl` across a store reload.
- `RoutinesProjection.repositoryUrl` is now exposed to the browser for display/edit.
- `project()`: when a Game has a configured `repositoryUrl`, it now **wins over** the Stadium's auto-detected `repoUri` for the handoff envelope only (an explicit human choice is stronger signal than auto-detection); the Settings field itself always shows the human-configured value.
- **Endpoint**: `PATCH /api/routines/repository` (`src/control-plane/daemon.ts`), placed before the existing generic `/api/routines/:id` mutation regex so a literal path segment `repository` can never be mistaken for a routine id. Same `knowsRoutineGame` authorization gate as every other Coach Routines endpoint; same `RoutineValidationError` → 400 handling.
- **UI** (`src/public/index.html`): a `Repository (optional)` field lives inside `#coachRoutinesCard`, above the routine list (so it's visible in the zero-routine state too, since it's Game-level, not routine-level), with the helper text `Used by your AI Assistant Coach when it cannot access this Game's local files.` It never overwrites the field while the human is actively focused on it (mirrors the existing `document.activeElement` guard pattern used elsewhere in this file), saves on `change` via the new endpoint, and re-syncs from real backend truth via the existing `refresh()`/`syncCoachRoutinesSettings` convergence — no second, browser-owned copy of the value.

### Exact handoff format

`buildStrategyBoardEnvelope` gained two new lines, emitted only when a repository is present (auto-detected or human-configured):
```
If you cannot access the local Game folder, use the repository above and inspect the listed source paths there.
For this refresh, stay scoped to the listed Coach Sources unless the human explicitly asks you to inspect other repository content.
```
placed after the Sources block and before any custom instructions / the closing truthfulness note. The pre-existing `Repository: host/path[· branch X]` line and the pre-existing `Note: the remote repository may not include unpushed local changes.` line were left unchanged — meaning preserved exactly as required: no claim of currency, no claim of push status, no claim of validated access, no claim that local and remote match. Example (abbreviated) for a Game with a configured repository:
```
=== SIDELINE COACH ROUTINE — CANONICAL REFRESH DUE ===
Before recommending or drafting the next Play, reread the canonical project sources below and reconcile the report that follows against them.
If you cannot open a source, say so plainly. Do not say you reread something you could not open.
Start your reply by stating what you reread and what you could not open.

Game: Trend and Tap Assist
Repository: github.com/example/trend
Local folder: C:\Users\...\Trend and Tap Assist
Sources (paths inside the Game folder):
- NORTH-STAR.md
If you cannot access the local Game folder, use the repository above and inspect the listed source paths there.
For this refresh, stay scoped to the listed Coach Sources unless the human explicitly asks you to inspect other repository content.
Note: the remote repository may not include unpushed local changes.
=== END COACH ROUTINE — REPORT FOLLOWS ===
```
When no repository is configured (auto-detected or human-entered), no `Repository:` line and neither new sentence appears — the handoff stays valid, with no fabricated repository coordinate.

## Tests

Two new focused suites (60 new assertions across 20 tests), following this codebase's established two-layer pattern (real daemon + real `index.html` script run in `vm`):

- **`test/coach-routines-v0.1-add-edit-and-repository.test.mjs`** (10 tests):
  - V01-1: zero-state create via `POST /api/routines` with the exact defaults.
  - V01-2: Edit via `PATCH` updates the exact routine (name + instruction), no duplicate, sibling routine untouched.
  - V01-3: repository URL persists per Game, survives a fresh engine load from the same store (reload/restart seam), and Game B never inherits Game A's value.
  - V01-4: an invalid repository URL is rejected (400) without fabricating state.
  - V01-5: a configured repository URL appears in the canonical envelope alongside the local folder and Coach Sources, with the new scoping/fallback sentences and no fabricated GitHub-currency/access claims; the canonical report text itself is untouched (envelope-only change).
  - V01-6: a blank repository URL still produces a valid handoff with no fabricated `Repository:` line.
  - V01-7: the zero-state `+ Add Coach Refresh` button is visible with zero routines; clicking it creates one that appears without a browser reload.
  - V01-8: the name field is pre-populated on Edit and saving updates the exact routine, never a duplicate.
  - V01-9: the repository URL field persists on change, survives a reload-equivalent refresh, and Game B shows no inherited value.
  - V01-10: Dev Mode gating (card hidden when off) still holds alongside the new UI.
- Updated `test/coach-routines-v0-slice-d-settings.test.mjs` for the two intentional, in-scope changes: SliceD-17 now reads a custom routine's name from the new `routine-name-input`'s `.value` (an `<input>` has no `.textContent`) instead of the old static-label text; SliceD-19/21 use the renamed `Add to next report` button text instead of `Refresh on next Copy`.

Existing-contract regression (all unchanged, all still passing): manually-due routine + `Add to next report`, successful Copy delivery/acknowledgement, due-banner auto-clear (last Play's Field Corrective), acknowledgement-failure keeps due state, `Not this time`, Game isolation, cadence behavior, source selection, Dev Mode gating, Incoming report preservation — covered by the pre-existing Slice D/E, Human Field Polish, engine, daemon, and Field Corrective suites, all re-run below.

## Final full-suite count

- `npm run check` — clean.
- `npm run compile` — clean.
- Coach Routines regression suites (Slice D, Slice E, Human Field Polish, engine, daemon, Field Corrective, V0.1) — **92/92 passed**.
- `npm test` (full suite) — **663 passed, 0 failed** (baseline 653 + 10 new V0.1 tests).
- `git diff --check` — exit 0; only pre-existing LF/CRLF `autocrlf` informational warnings on files this Play touched, no whitespace-error findings.

## Human field retest

1. `Developer: Reload Window`.
2. Settings → Coach Routines: with the last routine already deleted from a prior session, confirm "No Coach Refreshes yet for this Game." and click `+ Add Coach Refresh`. Confirm a new "Coach Refresh" card appears immediately (no reload).
3. In that card, change the name (e.g. "North Star Refresh"), add a reference, set cadence, then click elsewhere — confirm "Saved ✓".
4. In the same card's "Repository (optional)" field, type `https://github.com/<your-org>/<your-repo>`, click elsewhere — confirm a "Saved." toast.
5. Click `Add to next report`. Confirm Incoming shows `↻ Coach Refresh is due`.
6. Copy the report. Confirm `✓ Report Copied · with Coach Refresh`, and paste the clipboard somewhere to visually confirm the copied text contains: the Game name, `Repository: github.com/<your-org>/<your-repo>`, `Local folder: …`, and your selected reference path(s).
7. Confirm the blue due banner disappears automatically within normal convergence time (no reload, no new Play).

## Breadcrumbs added

Added a new `### Coach Routines V0.1 Follow-ups (WILL BE — do not implement yet)` section to `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, covering (not implemented in this Play):
- Source freshness as one contract with the refresh instruction (`Coach Sources · Up to date ✓` / `Syncing…` / `Local changes not published`).
- Game identity as two distinct coordinates (local working copy vs. remote repository), with GitHub as one delivery method among several future ones.
- AI Assistant Coach terminology (Head Coach / AI Assistant Coach / Players) and a future `✓ AI Assistant Coach brief included` report-reader status with progressive teaching and a Settings glossary.

## Deliberately deferred (not implemented, per explicit instruction)

- Any Git automation: commit, push, clone, authentication, branch/revision tracking.
- Source freshness detection or remote/local drift comparison.
- Repository discovery (auto-suggesting a URL from the git remote is unchanged/pre-existing — nothing new was added there).
- Game Setup redesign.
- End dates, run counts, cron-style scheduling for routines.
- A separate modal "create mode" editor — the freshly created routine card already functions as the live editor, per the existing always-on inline-edit design; building a second, parallel editing surface would have contradicted "do not redesign the entire routine-card UI unless necessary."

## STOP CONDITION assessment

Not triggered. The repository URL uses the existing per-Game `coach-routines.json` seam (already keyed by `gameId`, already atomic, already restart-safe) with one new field and one new narrowly-scoped endpoint — no Game-identity migration, no architecture change to Coach Routines cadence/delivery.

REPORT: Coach-Routines-V0.1-Add-Edit-And-Assistant-Coach-Repository-Coordinates.md
TIMESTAMP: 2026-09-14 15:48 MDT (America/Edmonton)
