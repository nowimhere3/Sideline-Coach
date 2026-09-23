# AI Usage Scoreboard — Play 3.1: Geometry Repair + Position Control

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Depends on:** Play 3 (settings + theming) — theming, refresh/copy feedback, and Compact-display settings are unmodified.

## Files changed

Only `src/public/index.html` (CSS + JS) and `test/ai-usage-scoreboard-ui.test.mjs`. No TypeScript, no daemon, no preferences schema, no acquisition code touched.

## 1. Exact width parity with Sideline cards

**Root cause of the old mismatch:** `.ai-scoreboard`'s width was `min(calc(100% - 28px), 760px)`. On wide viewports (`100% ≥ 788px`) that resolves to a flat `760px` — the same as `.shell`'s own outer box, not a real card's *content* box. An ordinary `.card` has zero side margin, so its real left/right edges sit 14px inside `.shell` (from `.shell`'s own `padding: … 14px …`), i.e. at `min(100%, 760px) - 28px`. The old formula was 28px too wide on desktop.

**Fix:** `width: calc(min(100%, 760px) - 28px);` — this is the closed form of "shell's own responsive width, minus the same 28px shell padding every card already sits inside of." Combined with the existing `left: 50%; transform: translateX(-50%);` centering (which mirrors `.shell`'s `margin: 0 auto`), the Scoreboard's left/right edges now land exactly where a normal card's edges land, at every viewport width — narrow and wide alike, since both formulas reduce to `100% - 28px` under 788px and diverge only above it, which is exactly where they needed to.

## 2 & 3. True header/footer geometry, height that follows real content

**Old approach:** a single CSS custom property (`--ai-scoreboard-anchor-height`) with two fixed values — a static `116px` guess for collapsed, and a `body.ai-scoreboard-expanded-space { … 60vh }` guess for expanded. Neither reflected the four real states (Compact/Expanded × Top/Bottom), so content could scroll behind the card in some combination, or empty space could appear in another.

**New approach — real measurement, not another guess:**
- `updateAiScoreboardReservedSpace()` calls `root.getBoundingClientRect().height` on the live `#aiScoreboardContainer` and writes the exact pixel value to `--ai-scoreboard-anchor-height` via `document.documentElement.style.setProperty(...)`. A hidden card (`hidden` attribute → `display:none`) naturally measures `0`, so nothing extra is needed for the Settings-hidden case (see §4) — it falls out of using a real measurement instead of a flag-driven guess.
- Called from: `setAiScoreboardExpanded()` (state just changed height), `applyAiScoreboardPlacement()` (placement/density change), `openSettings()`/`closeSettings()` (visibility change), and continuously via a `ResizeObserver` on the root element (installed once in `buildAiScoreboardDom()`, guarded by `typeof ResizeObserver === 'function'`) — this catches window resizes, font-load reflows, and narrow-screen text wrapping without a manual `resize` listener.
- The `.shell` reserve rules (`body.ai-scoreboard-reserve-bottom .shell { padding-bottom: calc(32px + env(...) + var(--ai-scoreboard-anchor-height)); }`, symmetric for top) are unchanged in *shape* — only the removal of the `expanded-space` override, since the variable itself is now always the true value.
- `:root { --ai-scoreboard-anchor-height: 116px; }` remains as the pre-JS/no-ResizeObserver fallback (first paint, or a non-browser context).

This is a "smallest robust" fix, not a redesign: it replaces two guessed constants with one real measurement function called from every place the card's size can change, rather than inventing a new layout system.

## 4. Persistent Scoreboard hides while Settings is open

`openSettings()`/`closeSettings()` (existing functions, unchanged otherwise) now set `$('aiScoreboardContainer').hidden = true`/`false` and call `updateAiScoreboardReservedSpace()`. Detection is direct, not inferred: the same two functions that already own the Settings-view visibility toggle now also own the Scoreboard's visibility — there is no separate "is Settings open" poll or MutationObserver. Placement classes, `aiHealthExpanded`, and Compact-display preferences are never touched by this hide/show, so state can't be corrupted; live health acquisition (push + the Play 2 global reader) is untouched entirely — only the UI surface's `hidden` attribute changes.

## 5. Expanded replaces Compact

`setAiScoreboardExpanded(next)` now also does `$('aiScoreboardCompact').hidden = next`. The header (title, Copy, Expand/Collapse, the new position-switch) stays visible in both states — only the Compact provider-row telemetry is swapped out for the Expanded cards, eliminating the duplication the Play called out. `renderAiScoreboard()` still keeps both DOM subtrees' text content current regardless of which is visible, so re-expanding never shows stale numbers.

## 6. Expansion direction preserved

Unchanged from Play 3: `.ai-scoreboard.ai-scoreboard-bottom { flex-direction: column-reverse; }` / `.ai-scoreboard-top { flex-direction: column; }` on the two-child flex container (`.ai-scoreboard-anchor`, `.ai-scoreboard-expanded`) still makes Top grow down and Bottom grow up.

## 7 & 8. Instant Top ↔ Bottom position switch

- New icon-only button `#aiScoreboardPositionBtn` (`⇅`, no image asset) added to the existing header `.ai-scoreboard-actions` row next to Copy/Expand — same flex row, so the Compact card gains no extra height.
- `aiScoreboardTogglePlacement()`: reads the current placement, flips it, applies it to the live card **immediately** (optimistic: mutates `lastStatus.preferences.aiScoreboardPlacement` in place and calls `applyAiScoreboardPlacement()` before the network round-trip), then persists it with the *existing* `aiScoreboardPlacement` preference via `POST /api/preferences` — the same endpoint the Settings radios already use, so there is exactly one source of truth and no parallel state. Guarded by the same `canMutateLiveState()` check every other live-preference control in this file already uses.
- `updateAiScoreboardPositionButton(placement)` sets both `title` and `aria-label` to the *target* action ("Move AI Usage Scoreboard to bottom" while currently Top; "…to top" while currently Bottom) — called from `applyAiScoreboardPlacement()`, so the tooltip is always in sync, including after a Settings-driven placement change.

## 9. Close behavior preserved

Collapse, ×, and Escape were not touched — they still all call the one `setAiScoreboardExpanded()` function. Verified by a dedicated regression test (SB-30) that exercises them immediately after using the new position-switch control, confirming no interference.

## 10. Everything else in Play 3 — untouched

Provider theming (CSS selectors for Compact rows and Expanded cards), Refresh/Copy feedback states, the six Compact-display/placement/refresh-cadence preferences and their Settings UI, and the live Claude reader/push-convergence were not modified in this Play; the only files that changed are `src/public/index.html` and its test.

## Tests

`test/ai-usage-scoreboard-ui.test.mjs`:
- **SB-16** (updated): asserts the new `width: calc(min(100%, 760px) - 28px);` formula, replacing the old assertion.
- **SB-27** (new): Compact hides while Expanded, returns on Collapse.
- **SB-28** (new): opening Settings hides `#aiScoreboardContainer`; closing restores it; expanded state (opened before entering Settings) survives the round trip.
- **SB-29** (new): clicking the position-switch moves Top↔Bottom immediately (class change, no `await` on the network needed for the visual change), persists exactly one `POST /api/preferences` call, and the tooltip flips to describe the new reverse action each time.
- **SB-30** (new): Collapse/×/Escape still work correctly immediately after using the position-switch.
- All prior Play 1/2/3 tests (SB-1 through SB-26 except the renumbered SB-16) pass unchanged, confirming theming, refresh/copy feedback, alignment, and Compact-display settings were not regressed.

`npm run compile` — clean (no TypeScript was touched, but ran for completeness). `npm test` (full suite): **1593/1601 passing**. The 8 failures are the identical pre-existing, unrelated baseline failures present before this Play (same names, same count, verified before and after): extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and the one wall-clock-dependent Codex countdown test (`SB-13`).

## Manual browser check still recommended

This Play's height/measurement logic (`ResizeObserver`, `getBoundingClientRect`) is feature-detected and exercised only up to what the VM-based synthetic test harness can simulate (no real layout engine, so real pixel heights and true "does content peek through a gap" checks weren't visually verified). Per the Field Acceptance checklist in the Play, a real-browser pass after restart is worth doing, specifically:
- Confirm the Scoreboard's left/right edges visually line up with the cards directly beneath it, both narrow and wide.
- Confirm no content is visible behind/through the card in all four states (Compact/Expanded × Top/Bottom), especially right after switching Top↔Bottom or expanding/collapsing (the `ResizeObserver` should keep the reserved space in sync, but a live visual check is the real proof).
- Confirm the `⇅` icon reads clearly against the header's existing Copy/Expand button styling and is comfortably tappable on a phone.

No commit, no push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Scoreboard-Play3-1-Geometry-And-Position-Control__20260922-083000__Claude.md
