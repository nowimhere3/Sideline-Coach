# AI Usage Scoreboard — Slice 3.2: Structural App-Frame Layout

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Continuation of:** Play 3 (settings + theming) and Play 3.1 (fixed-overlay geometry repair). This Slice replaces the overlay architecture itself.

## Files changed

Only `src/public/index.html` (CSS + HTML + JS) and `test/ai-usage-scoreboard-ui.test.mjs`. No TypeScript, no daemon, no acquisition code.

## Old layout ownership → new layout ownership

**Old (Play 3/3.1):** `#aiScoreboardContainer` was `position: fixed`, floating over everything. `.shell` (the single scrollable document, containing header + Scoreboard + mainWorkflow + settingsView) reserved space for it via `body.ai-scoreboard-reserve-top/-bottom { padding-top/bottom: ... var(--ai-scoreboard-anchor-height) }`, where that CSS variable was kept in sync by JS: a `ResizeObserver` on the Scoreboard root plus a `getBoundingClientRect()`-driven `updateAiScoreboardReservedSpace()` called from `setAiScoreboardExpanded`, `applyAiScoreboardPlacement`, `openSettings`, and `closeSettings`. This is a bridge — an overlay plus compensation, not a real boundary — and it's exactly the geometry class of bug this Slice's brief called out (gaps, jumps, JS/CSS falling out of sync).

**New (Slice 3.2):** `body` is the app frame — a real `display:flex; flex-direction:column; height:100vh/100dvh; overflow:hidden;` container with exactly two structural children:
- `#gameScrollRegion` (renamed from `<main class="shell">`, same width/padding rules as before) — `flex:1 1 auto; min-height:120px; overflow-y:auto;`. This is now the **sole scroll owner**. It contains header, mainWorkflow, and settingsView, exactly as before.
- `#aiScoreboardContainer.ai-scoreboard` — a true sibling of `#gameScrollRegion`, moved out from between `<header>` and `#mainWorkflow` to right after `</main>` in the DOM. `flex: 0 0 auto` — sized by its own content, never measured or compensated for.

Ordering is controlled by CSS `order`, not DOM position or JS reordering: `#gameScrollRegion { order: 1; }` (constant), `#aiScoreboardContainer { order: 2; }` (default — Bottom, after the Game region), `body.ai-scoreboard-top #aiScoreboardContainer { order: 0; }` (before the Game region). `applyAiScoreboardPlacement()` now does exactly one thing to move it: toggle the `ai-scoreboard-top` class on `body`. The browser's own flex layout engine handles everything else — reflow, the Game region's height changing, scroll clamping — for free.

The Scoreboard's own internal Compact/Expanded ordering (`.ai-scoreboard.ai-scoreboard-bottom { flex-direction: column-reverse; }` / `.ai-scoreboard-top { flex-direction: column; }`, unchanged from Play 3.1) still makes Expanded grow toward the Game region — upward at Bottom, downward at Top — because that's a separate, inner flex context on the card itself, orthogonal to the outer structural fix.

## Compensation machinery removed, and why

All of it — there was no legitimate independent owner left once the outer overlay was gone:
- `updateAiScoreboardReservedSpace()` function, and every call site (`buildAiScoreboardDom`'s `ResizeObserver` installation, `setAiScoreboardExpanded`, `applyAiScoreboardPlacement`, `openSettings`, `closeSettings`).
- CSS: `:root { --ai-scoreboard-anchor-height: 116px; }`, `body.ai-scoreboard-reserve-bottom .shell { padding-bottom: ... }`, `body.ai-scoreboard-reserve-top .shell { padding-top: ... }`.
- JS: the `ai-scoreboard-reserve-top`/`ai-scoreboard-reserve-bottom` body classes (replaced by the single `ai-scoreboard-top` class that now drives `order` directly).

**Kept, because it's not compensation:** `.ai-scoreboard-expanded { max-height: 50vh; overflow-y: auto; }` and the new `#gameScrollRegion { min-height: 120px; }`. These are safety floors/caps for extreme viewports (a very short window, or a very tall Expanded panel), not measurement-based overlay compensation — without them, flexbox alone could shrink the Game region to literally zero on a small screen, which would violate "final Game content remains completely reachable." Both are static CSS, not JS-measured.

## Settings hide/show — how it's detected

Unchanged detection point: `openSettings()`/`closeSettings()` (the same functions that already own `#settingsView`/`#mainWorkflow` visibility) now also set `$('aiScoreboardContainer').hidden = true/false`. What changed is the *consequence*: previously this required a follow-up `updateAiScoreboardReservedSpace()` call to un-reserve the now-empty space; now a real flex sibling hidden via `[hidden]` (`display:none`) is simply removed from the flex layout, and `#gameScrollRegion`'s `flex:1 1 auto` expands to fill the freed space automatically — "consumes no phantom layout space" falls out of normal CSS layout, nothing to call.

## Top/Bottom switching — persistence unchanged

`aiScoreboardTogglePlacement()` (from Play 3.1) is untouched: it still flips `lastStatus.preferences.aiScoreboardPlacement` optimistically, calls `applyAiScoreboardPlacement()`, and persists via the same `POST /api/preferences`. The *effect* of `applyAiScoreboardPlacement()` changed (toggles one body class instead of two, and no longer calls the removed reserved-space function), but the preference contract, the default of Bottom, and "an explicit persisted Top is never silently overwritten" are all unchanged and freshly re-verified by tests (SB-32, SB-33).

## Global cue

`title.textContent` in `buildAiScoreboardDom()` changed from `'AI USAGE'` to `'AI USAGE · GLOBAL'` — the only chrome change requested; no badge, no extra element.

## Scroll position preservation

No explicit JS was added to preserve `#gameScrollRegion`'s `scrollTop` across expand/collapse or Top/Bottom switching. This is deliberate: resizing a scrollable container in a real browser does not reset `scrollTop` — the browser clamps it only if it now exceeds the new scrollable range, which is exactly the "prioritize structural correctness and content reachability" behavior the Play asked for, not a jump-to-top/bottom. Adding JS to manage this would have reintroduced the class of compensation code this Slice was written to remove.

## Tests

`test/ai-usage-scoreboard-ui.test.mjs`:
- **SB-1** (updated) — the Scoreboard container is a structural sibling after `</main>`, never nested inside `#gameScrollRegion`/`#mainWorkflow`.
- **SB-16** (updated) — no `position: fixed;` anywhere in `.ai-scoreboard`; card-rail width/radius/border preserved; `order` values present for both placements.
- **SB-17** (rewritten) — `#gameScrollRegion` is `overflow-y:auto; flex:1 1 auto;` (the scroll owner), and asserts the removed machinery (`ai-scoreboard-anchor-height`, `ai-scoreboard-reserve`, `updateAiScoreboardReservedSpace`, `ResizeObserver`) is gone from the page source entirely, not merely unused.
- **SB-24** (updated) — Top/Bottom now verified via the single `ai-scoreboard-top` class on `body` (the one that drives `order`), not the old two-class reserve mechanism.
- **SB-32** (new) — Bottom is the default for an unset/new preference.
- **SB-33** (new) — a persisted Top preference remains Top on load and survives an unrelated re-render (e.g. a push health update).
- **SB-34** (new) — Bottom places the Scoreboard after the Game region and Top before it, via the exact CSS `order` values, not DOM reordering.
- **SB-35** (new) — `#gameScrollRegion` has the `min-height:120px` reachability floor, and `.ai-scoreboard-expanded` is not `position:absolute` (i.e., not floated over content).
- **SB-36** (new) — `AI USAGE · GLOBAL` is present.
- **SB-37** (new) — switching Top→Bottom→Top and opening/closing Settings leaves no stale compensation state (the machinery doesn't exist to go stale) and the Scoreboard is restored visible.
- **SB-27, SB-28, SB-29, SB-30, SB-31** (existing, from Play 3.1/the Claude-5H-freshness repair) — all passed **unchanged**, confirming Expanded-replaces-Compact, Settings hide/restore with state intact, the position-switch control, Collapse/×/Escape, and the expired-window UI defense-in-depth all survived the structural rewrite with no code changes needed to those specific behaviors.
- All Play 1/2/3 provider-theming, Refresh, Copy, and Compact-display-setting tests (SB-2 through SB-26 except SB-1/16/17/24) passed **unchanged**.

`npm run compile` — clean (no TypeScript touched, ran for completeness).
`npm test` (full suite): **1610/1618 passing**. The 8 failures are the identical pre-existing, unrelated baseline failures present before this Slice (same 8 names, same count, verified before/after): extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and the one wall-clock-dependent Codex countdown test (`SB-13`).

## Manual field checks for Dad

### Bottom collapsed
Scroll Game content to the end.
**Expected:** final Game content is fully visible and stops above Scoreboard. Nothing travels underneath.

### Bottom expanded
Expand Scoreboard.
**Expected:** it grows upward, Game viewport becomes shorter, Game remains scrollable, Compact duplicate is absent.

### Top
Switch to Top.
**Expected:** Scoreboard becomes the structural top region and Game scrolling never passes behind it.

### Settings
Open Settings.
**Expected:** Scoreboard disappears with no dead blank region.
Close Settings.
**Expected:** Scoreboard returns at the selected position.

## Breadcrumbs (recorded, not implemented)

- `observedAt` vs. `lastSuccessAt` vs. acquisition-state UI semantics — still an open design question for a future Scoreboard polish Play (see the prior OAuth-polling-policy report).
- Graded alert states (normal / stale / rate-limited / low / unavailable) — not built.
- Possible future Compact-content simplification — not built; this Slice explicitly preserved current Compact content in full.

## Confirmation

No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Scoreboard-Slice-3-2-Structural-Global-Footer__20260922-101500__Claude.md
