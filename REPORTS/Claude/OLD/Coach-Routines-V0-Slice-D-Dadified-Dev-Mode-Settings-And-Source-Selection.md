REPORT FILE:
Coach-Routines-V0-Slice-D-Dadified-Dev-Mode-Settings-And-Source-Selection.md

REPORT TIMESTAMP:
2026-09-14 12:17:50 -06:00 (America/Edmonton)

# Executive Result

**Coach Routines V0 Slice D is complete.** Settings now has a real, human-facing Dev Mode toggle and a Dev-Mode-only Coach Routines card, built entirely over Slices A/B/C's real APIs. A human can turn Dev Mode on, see the default routine (presented as **Coach Refresh**), adjust its cadence, choose where it goes (**Send to Coach**, with **Send to Players** truthfully shown as `Coming soon`), and build an explicit source set — via advisory suggestions, individual file selection, or a deliberate whole-folder choice — with truthful, Dadified source states. Nothing here invents a second source of truth, a second acknowledgement path, or a working Player-delivery control.

No Incoming, Copy, clipboard, or report code was touched. No Player prompt injection exists. Internal vocabulary (`canonical`, `projection`, `lastCheck`, `cadence`, `strategyBoard`, `due`, `Needs files`) stays out of every human-facing string in this Slice, verified by an explicit vocabulary test.

None of the six stop conditions applied — Slice C's real endpoints turned out to be sufficient for everything this Slice needed.

# Exact Baseline Inherited From Slice C

Verified in `src/control-plane/coach-routines.ts`, `src/routine-sources.ts`, and `src/control-plane/daemon.ts` before building (not assumed from the report alone):

- `status.preferences.devMode` (global boolean, default `false`) and `status.routines` (a `RoutinesProjection` scoped to `selectedGameId` only) are already present on every `/api/status` response and every SSE `status` convergence — no new endpoint was needed to read current truth.
- `POST /api/preferences { devMode, gameId }` — a real `false → true` transition calls `CoachRoutineEngine.initializeDevModeDefaults(gameId)` exactly once per Game; a deliberate deletion sets `defaultsInitialized = true` durably, so a later toggle never recreates it.
- `GET/POST /api/routines/sources/suggest`, `GET/POST /api/routines/sources/browse`, `POST /api/routines/sources/check` — all exact-`gameId`-scoped, metadata-only (`{path,kind,reason}` / `{name,path,kind}` / `{path,state}`), proxied through the authoritative Stadium for that Game.
- `GET /api/routines?gameId=`, `POST /api/routines`, `PATCH /api/routines/:id`, `DELETE /api/routines/:id`, `POST /api/routines/:id/due`, `POST /api/routines/delivered` — all real, exact-`gameId` + exact-`routineId` scoped, all already implemented and tested by Slices A/B/C.
- `RoutinePatch`'s `sources` field **replaces the whole array** server-side (`normalizedInput`'s `sources: input.sources ?? existing.sources`) — confirmed by reading `coach-routines.ts` directly, not assumed. Every source mutation in this Slice sends the full merged/reduced array, never a delta.
- `RoutineView.sources[].state` is `RoutineSourceState | 'not-checked'` — the exact five-plus-one-state vocabulary this Slice's Dadification maps from.
- 55/55 Coach Routines A+B+C tests and 596/596 full-repository tests passed before any edit, matching the report's claimed baseline exactly.

# Files Changed

| File | Change |
|---|---|
| `src/public/index.html` | Settings markup: a `Dev Mode` card (toggle + explanation) and a Dev-Mode-only `#coachRoutinesCard`/`#coachRoutinesList`. CSS: `.routine-*` rules for cards, cadence row, target rows, source list, browse panel, suggestion chips — all reusing the existing Settings card/button/chip language. JS: `syncCoachRoutinesSettings`, `renderCoachRoutinesList`, `renderRoutineCard`, `renderRoutineBrowsePanel`, `renderRoutineSuggestions`, `renderRoutineExplainer`, `dadifySourceState`, `patchRoutine`, `checkRoutineSourcePaths`, `addRoutineSources`, `removeRoutineSource`, `fetchRoutineSuggestions`, `openRoutineBrowse`/`closeRoutineBrowse`, `resetCoachRoutinesUiState`; wired into `renderStatus` (after `syncRunningPlayersPreference`) and `switchGame` (Game-scoped UI-state reset). |
| `test/coach-routines-v0-slice-d-settings.test.mjs` | **new**, 25 tests (4 real-daemon, 21 DOM-driven against the real page script) |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` | Coach Routines section: header now names Slice D; a new **IS (Slice D)** paragraph; **WILL BE** trimmed to what's still actually future |
| `REPORTS/Claude/Coach-Routines-V0-Slice-D-Dadified-Dev-Mode-Settings-And-Source-Selection.md` | this report |

No server file changed. All unrelated dirty-tree work (Q2.10F.2 Slices, Q2.10F.3/4/4.1, `.vscode/launch.json`, etc.) was preserved untouched.

# Dev Mode Behavior

- Markup: a plain-language card — `Dev Mode` with the exact copy `Extra tools for people who like to see under the hood. Turning this on does not change how your Plays run.` — and one checkbox, `#devModeToggle`.
- The toggle syncs from `status.preferences.devMode` on every render (`syncCoachRoutinesSettings`); it is never a second local flag.
- Changing it posts `{ devMode, gameId: currentGameId }` to the real endpoint. If no Game is selected, the toggle reverts and a toast explains why — it never silently no-ops.
- On failure, the checkbox reverts to its prior state and a toast surfaces the real error message.
- `#coachRoutinesCard` is `hidden` whenever `devMode` is false — Coach Routines are not merely de-emphasized, they are absent from ordinary Sideline.
- No routine initialization logic lives in the browser: the only thing the toggle does is call `POST /api/preferences`; `initializeDevModeDefaults` remains exclusively server-side (Slice B), confirmed by SliceD-2/SliceD-3's real-daemon tests.

# Dadified Wording Decisions

| Internal | Human-facing (this Slice) |
|---|---|
| `template === 'canonical-refresh'` routine name | **Coach Refresh** (the stored `name`/`template` are never rewritten) |
| `cadence.kind/every/everyMs` | **Send every [N] [Plays ▾ / Days ▾]** |
| `targets.strategyBoard` | **Send to Coach** — *You + your Coach AI* |
| `targets.players` (always sent as `false`) | **Send to Players** — *Players doing the work* — `Coming soon`, checkbox disabled |
| `lastCheck.state` / `'not-checked'` | *(confirmed)* nothing shown / `Not checked yet` / `Can't find this` / `Can't use this location` / `This changed` |
| `needs === 'sources'` / the literal string `"Needs files — add what to reread"` | **Add at least one reference** |
| "what does sending mean" | an ⓘ-triggered explainer: *"Coach doesn't upload these project files somewhere else. It sends a reminder telling the selected Coach or Players what to reread and where to find it."*, dismissed with **Got it** |

`SliceD-24` asserts none of `canonical`, `projection`, `lastCheck`, `strategy board`, `RPC`, or `delivery cycle` appear anywhere in the rendered Coach Routines DOM text. `SliceD-6` and `SliceD-9` additionally assert the literal internal strings `Canonical Refresh` and `Strategy Board`/`strategyBoard` never leak into the card even though they are the routine's real stored `name` and the real target flag's name.

# Routine Editor Behavior

Per routine, rendered from `RoutineView` only:

- **Enable/disable**: a checkbox bound to `routine.enabled`, `PATCH`ing `{ enabled }` on change.
- **Cadence**: a number input (`min=1`, `max` 100 for Plays / 30 for Days, matching the real server bounds) plus a Plays/Days `<select>`. Either control commits on `change` (not every keystroke), sending `{ cadence: { kind:'plays', every } }` or `{ cadence: { kind:'time', everyMs: n * 86_400_000 } }` — the exact shape `RoutineInput.cadence` requires. `86_400_000` is a presentation-layer constant mirroring the server's `DAY_MS`; no new day-length logic was introduced.
- **Target**: `Send to Coach` checkbox `PATCH`es `{ targets: { strategyBoard, players: false } }` — `players` is a literal `false`, never taken from any control, since no Player-target UI exists. `Send to Players` is `disabled`, unchecked, and wired to nothing.
- **Refresh now** (manual Due): calls the real `POST /api/routines/:id/due` — justified because Dev Mode is already the advanced gate the brief names.
- **Delete routine**: reuses the existing `confirmAction()` destructive-confirmation modal (the same one used for Remove Player / Restart with Coach controls), then calls `DELETE /api/routines/:id`.
- **Routine renaming** and **creating an additional routine** were deliberately **not** exposed in this Slice's UI (see Known Constraints) to keep scope proportional; the CRUD APIs already support both for a future slice.
- Every mutation ends with `await refresh()` — the existing SSE/status convergence path — so the view always reconverges from the next real `/api/status`, never from a locally-guessed next state.

# Source Suggestion Behavior

- Suggestions are fetched lazily, on an explicit **Show suggestions** click (`GET /api/routines/sources/suggest?gameId=`), cached per Game so repeated status refreshes don't refetch.
- Rendered as `+ {filename}` chips, one per suggestion not already in the routine's source list (`reason` becomes the chip's `title`). Nothing is pre-checked or pre-added.
- `SliceD-10` proves fetching suggestions alone never posts a mutation; only clicking a chip does, and that click sends exactly `{ sources: [...existing, { path, kind }] }`.

# File/Folder Browser Behavior

- **+ Add files** and **Browse folder** both open the same inline browse panel at the Game root (`GET /api/routines/sources/browse?gameId=&dir=`) — one shared, proportional implementation rather than two divergent pickers, since Slice C's `browse` operation is identical either way; the two buttons exist because the brief's mockup names them both.
- The panel lists exactly the metadata Slice C returns (`name`, `path`, `kind`) — folders sorted first (server-side), each row a checkbox plus (for folders) a `📁 {name}` button that **descends** into that folder without selecting it. `SliceD-11` proves opening a folder never posts a source mutation.
- **Add N selected**: checked files/folders are merged into the routine's existing source list and saved; newly added paths are immediately sent to `POST /api/routines/sources/check` so they don't sit stuck at "Not checked yet" indefinitely.
- **↑ Up one level** and **Close** are always available while browsing.

# Explicit Whole-Folder Behavior

- **Use entire "{folder}" folder** appears only while browsing a non-root directory (`routineBrowse.dir` non-empty) — never at the Game root, and never implied merely by opening that folder.
- Clicking it stores **only** `{ path: dir, kind: 'folder' }` as one source — `SliceD-12` proves this is the sole addition, distinct from `SliceD-13`'s proof that checking individual files inside that same folder adds only those exact file paths, never the folder itself.

# Per-Routine Source Ownership

- Sources are rendered, added, and removed strictly from `routine.sources` on the exact `RoutineView` being edited — every mutation call names that routine's own `id`. `SliceD-14`/`SliceD-17`'s two-routine fixture (each with its own `id` and source list) confirms one routine's card never reads or writes another's sources.
- Nothing in this Slice introduces a Game-wide or Sideline-wide source bucket; the seam Slice A/B established (sources belong to a routine, not to Sideline) is preserved exactly, protecting the future Play-type-triggered-routine concept without building it.

# Source-State Presentation

`dadifySourceState(source)`:

| `source.state` | Shown |
|---|---|
| `'not-checked'` or `'unknown'` | `Not checked yet` |
| `'missing'` | `Can't find this` |
| `'blocked'` | `Can't use this location` |
| resolved but `state !== kind` (e.g. was a file, now a folder) | `This changed` |
| matches declared `kind` | *(nothing — a confirmed source carries no badge)* |

Every non-confirmed source also gets a **Check again** button (`POST /api/routines/sources/check` for that one path) alongside **Remove** — the "next action" the brief asked for. `SliceD-15` proves all four Dadified strings render correctly from a single fixture with all five real states, and that a confirmed source shows no warning element at all.

# Game Isolation

- `syncCoachRoutinesSettings` refuses to render a projection whose `gameId` doesn't match `currentGameId` — a defensive guard against a stale/foreign-Game payload, never a fabrication.
- `switchGame` now calls `resetCoachRoutinesUiState(targetGameId)` alongside its existing execution-store reset, clearing the suggestion cache and any open browse panel the instant a Game switch begins — before the new Game's snapshot even arrives. `SliceD-17` proves an open browse panel from Game A is gone immediately after switching, and the new Game's own routine (and only that routine) renders.
- Every mutation call (`PATCH`, `DELETE`, `/due`, `/sources/*`) carries the exact `gameId`/`routineId` from the `RoutineView` being edited, never the ambient "currently selected Game" as a fallback for a different target.

# Live Convergence

No Coach Routines mutation renders an optimistic local state. Every button handler calls `await refresh()` (or the mutation itself triggers a server-side `broadcastStatus()`, as Dev Mode toggling does), which re-fetches `/api/status` and re-derives the entire Coach Routines card from the fresh `RoutinesProjection`. `SliceD-20` proves a routine mutation triggers a real, observable `/api/status` re-fetch with no test-driven manual refresh call. The routines list itself is only rebuilt when its content (routine projection + local browse/suggestion state) actually changed — a `JSON.stringify`-based memoization guard — so unrelated status refreshes (execution ticks, roster polls) don't needlessly tear down an open browse panel or in-progress cadence edit.

# Mobile Behavior

All new controls reuse the existing Settings card/button/chip vocabulary (`settings-card`, `settings-chip`, `.choice`, `quiet`/`secondary` buttons) rather than introducing a new component system. Buttons stay `min-height: 40px+`; checkboxes are `20px` (matching the existing `.settings-choice input[type=radio]` sizing convention); the browse-entry list scrolls (`max-height: 260px; overflow-y: auto`) instead of pushing the page tall. `SliceD-23` confirms no `position: fixed|sticky|absolute` anywhere in the new `.routine-*` CSS.

# Tests and Exact Counts

**Real daemon (Layer 1)** — `ControlPlaneDaemon` + real `CoachRoutineEngine`, no mocking:
- SliceD-1: Dev Mode defaults OFF for a brand-new install.
- SliceD-2: turning Dev Mode ON initializes the default routine only through the real engine (`routineEngineInstance.forGame`), with the exact `canonical-refresh` template, cadence, and truthfully empty sources.
- SliceD-3: deleting the default, then toggling Dev Mode off then on again, never resurrects it.
- SliceD-4: enabling Dev Mode for Game A creates nothing in Game B; Game B's own `/api/status` projection after an explicit Game select is empty.

**Browser (Layer 2)** — the real `src/public/index.html` script, DOM-driven, against a mocked-but-contract-shaped backend:
- SliceD-5/6: hidden by default; revealed only from backend truth, with the exact preference POST body, and the Dad-facing name never the raw internal one.
- SliceD-7/7b: Every-N-Plays and Every-N-Days cadence edits persist with the exact `RoutineInput.cadence` shape; no internal cadence vocabulary leaks.
- SliceD-8/9: enable/disable and target persistence; `Send to Players` proven disabled/unchecked/inert.
- SliceD-10: suggestions are advisory only, never mutate until an explicit chip click.
- SliceD-11/12/13: browse metadata-only rendering; opening a folder never selects it; explicit "Use entire folder" vs. individual file selection store exactly what was asked.
- SliceD-14: source removal sends the correct remaining set.
- SliceD-15/16: every Dadified source-state string, and the zero-sources needs-message, render truthfully with no internal vocabulary.
- SliceD-17: Game switch drops stale UI state and shows only the new Game's routine.
- SliceD-18: no source/browse content ever reaches the DOM beyond `name`/`path`/`kind`/`reason` (a `content` field on a browse entry is proven inert, and the production source never references `entry.content`/`source.content`).
- SliceD-19: Refresh now / Delete routine call the real exact-routine endpoints.
- SliceD-20: a mutation triggers a real status re-fetch with no manual browser refresh.
- SliceD-21: no `/api/work/acknowledge` or `/api/reports` call ever originates from a Coach Routines interaction.
- SliceD-22: the pre-existing Running Players preference still renders and saves, unaffected by the new card.
- SliceD-23: mobile-safe CSS (no fixed/sticky).
- SliceD-24: a blanket vocabulary sweep across the rendered card.

```
node --test test/coach-routines-v0-slice-d-settings.test.mjs
25 passed, 0 failed
```

Combined with the untouched Coach Routines A+B+C suite:

```
node --test test/coach-routine-sources.test.mjs test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs test/coach-routines-v0-slice-d-settings.test.mjs
80 passed, 0 failed
```

# Validation Results

| Command | Result |
|---|---|
| `npm run check` | PASS |
| `npm run compile` | PASS |
| `node --test test/coach-routines-v0-slice-d-settings.test.mjs` | 25 passed, 0 failed |
| `npm test` (final run) | **621 passed, 0 failed, 0 skipped, 0 cancelled** (596 before this Slice + 25 new) |
| `git diff --check` | PASS; only pre-existing LF/CRLF notices |

**Real defects found and fixed during implementation, not papered over in tests:**
1. `document.createTextNode(...)` was used once (building the "Send to Players — Coming soon" label). It works in real browsers but broke the moment any DOM-driven test tried to exercise that code path — and, more importantly, it was the only place in the entire file to use that API, inconsistent with every other label in the codebase which is built from `textContent`/child elements. Replaced with a plain child `<span>`, matching the established convention.
2. The cadence unit `<select>`'s initial value relied on `option.selected = true` alone; nothing set `select.value` directly. Real browsers derive one from the other; a minimal test DOM does not. Fixed by setting `cadenceUnit.value` explicitly after building the options — a real robustness improvement, not just a test accommodation.

# Compatibility Notes

- `status.preferences.devMode` and `status.routines` are additive fields the browser already safely ignored before this Slice (per Slice A/B's own report); this Slice is the first browser consumer.
- The Settings card eyebrow order changed: `Dev Mode` and (conditionally) `Coach Routines` now appear as the first two cards, ahead of the existing `Game Setup` placeholder card. No existing card's content or behavior changed.
- No change to `/api/preferences`, `/api/routines*`, dispatch, execution, report, or acknowledgement contracts.

# Known Constraints

- **Routine renaming is not exposed.** The default routine's Dad-facing title is always derived from its `template` (`canonical-refresh` → "Coach Refresh"), never from an editable `name` field, to avoid the ambiguity of a human renaming "the" default routine in V0. The real `PATCH` API already supports `name`, so this is a presentation choice, not a capability gap.
- **Creating an additional routine has no UI.** `renderCoachRoutinesList` iterates whatever `status.routines.routines` already contains (proven to work correctly for 0, 1, or N routines via SliceD-16/17's fixtures), but nothing in Settings calls `POST /api/routines` to create a new one. This was left out deliberately for scope proportionality; the seam (per-routine sources, per-routine everything) is intact for a future slice to add a "+ New Routine" action with no data-model change.
- **"+ Add files" and "Browse folder" open the identical panel.** Both always start at the Game root. A more differentiated flow (e.g. a native-feeling file-only picker vs. a folder-first navigator) was judged disproportionate to V0's scope; the single panel already satisfies every explicit requirement (bounded listing, no implicit whole-folder selection, an explicit whole-folder action).
- **The ⓘ explainer's dismissal is not persisted** across a re-render or reload — collapsing it again is one click, and it never forces itself back open uninvited, but it doesn't remember "already explained" the way a full onboarding system would. Judged appropriately lightweight per the brief's explicit "do not build a tutorial system."
- **Suggestions are cached only for the lifetime of the page/session**, keyed by Game — switching away and back re-fetches. This matches the "advisory, non-authoritative" nature of suggestions.

# WAS / IS / WILL BE

## WAS

Coach Routines had real backend authority (Slices A/B/C) — durable definitions, cadence, exact-Game Play counting, and authoritative Stadium-verified sources — but no human could see or configure any of it. Dev Mode was a preference field with no UI. The only way to create, edit, or check a routine was a direct API call.

## IS

Settings has a real Dev Mode toggle and, only when it's on, a Coach Routines card built entirely from backend truth. A human can turn a routine on or off, set its cadence in plain language, choose to send it to their Coach AI (with Player delivery honestly marked not-yet-available), and build its source set — via advisory suggestions, a bounded folder browser with deliberate individual-file or explicit whole-folder selection, or manual removal — with every source's real, Dadified state visible and actionable. Every control converges from the next real status snapshot; nothing here is a second, browser-owned truth store, and nothing touches Incoming, reports, or the clipboard.

## WILL BE

Coach Routines V0 Slice E — Incoming / Copy Strategy Board Handoff — should attach the due handoff envelope to the deliberate Incoming Copy action, calling `POST /api/routines/delivered` only after a successful clipboard write, never on render or preview. Optional exact-instance Player routine delivery, routine renaming, and multi-routine creation UI remain further downstream, explicitly protected but not built by this Slice.

# Recommended Next Play

**Coach Routines V0 Slice E — Incoming / Copy Strategy Board Handoff.**

Implementation evidence from this Slice revealed no reason to deviate from that recommendation: the Settings surface a human needs to understand and configure Coach Routines before its delivery experience matters is now real and field-checkable on its own.

# Commit / Push Status

No commit was created. Nothing was pushed.

REPORT: Coach-Routines-V0-Slice-D-Dadified-Dev-Mode-Settings-And-Source-Selection.md
TIMESTAMP: 2026-09-14 12:17:50 -06:00 (America/Edmonton)
