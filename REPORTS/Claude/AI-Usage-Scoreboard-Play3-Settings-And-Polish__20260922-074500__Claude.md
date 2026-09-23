# AI Usage Scoreboard — Play 3: Settings + UI/UX Polish

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Depends on:** Play 1 (real-shape repair), Play 2 (global Claude reader, persistent plumbing) — both unmodified by this Play except where explicitly noted below.

## Visual reference used

`TEMP\index.html` and `TEMP\styles.css` — read only, never modified (confirmed: `git status`/`git diff` on `TEMP/` shows it untracked and empty of any diff). Borrowed:
- Provider accents: Codex cyan `#5de2d7`, Claude amber `#ffbf69` (Sideline's `--codex-accent`/`--claude-accent` tokens updated to these exact values).
- The "remaining-percentage figure + countdown accented, %-used + absolute reset left as legible body text" treatment (TEMP's `.remaining-value strong` / `.countdown` vs `.used-value` / `.reset-time`).
- Card shape language: rounded (`border-radius`), 1px `--line` border, raised shadow — translated into Sideline's existing `.ai-scoreboard-card` idiom rather than copied verbatim.

## Files changed

- `src/running-players.ts` — six new preferences: `aiScoreboardPlacement` (`top`/`bottom`, default `bottom`), `aiScoreboardDefaultExpanded` (boolean, default `false`), `aiScoreboardPercentMode` (`left`/`used`/`both`, default `left`), `aiScoreboardResetMode` (`absolute`/`countdown`/`both`, default `absolute`), `aiScoreboardDensity` (`standard`/`tight`, default `standard`), `aiScoreboardResetMarker` (`separator`/`icon`, default `separator`). Every default reproduces Play 1/2's fixed prior behavior exactly, so an unconfigured install renders identically to before these settings existed.
- `src/control-plane/daemon.ts` — `POST /api/preferences` validates and persists all six fields (400 with a specific message on an invalid value); the message/import list is extended, no other route logic touched.
- `src/public/index.html` — the bulk of the work:
  - **Card shape**: `.ai-scoreboard` is `position: fixed` but inset (`width: min(calc(100% - 28px), 760px)`, centered, `border-radius: var(--radius)`, full border, shadow) — never edge-to-edge. `.ai-scoreboard-bottom`/`.ai-scoreboard-top` classes set which edge it's pinned to.
  - **Orientation-aware expansion**: the DOM now wraps header+Compact in one `.ai-scoreboard-anchor` block, sibling to `.ai-scoreboard-expanded`. `flex-direction: column-reverse` (Bottom) vs `column` (Top) makes the anchor always render at the chosen edge and Expanded grow away from it — geometry-correct, not a repositioned copy of one animation.
  - **Provider theming, collapsed AND expanded** (per your follow-up correction): `.ai-scoreboard-row.claude/.codex .ai-scoreboard-windows` colors the whole Compact "percent · reset" text in the provider accent; `.ai-scoreboard-card.claude/.codex .ai-scoreboard-window-big` and `.ai-scoreboard-window-countdown` do the same for Expanded, while `.ai-scoreboard-window-used`/`.ai-scoreboard-window-reset` stay muted/body text (matches TEMP's own split).
  - **Collapse / × / Escape**: one function, `setAiScoreboardExpanded(next)`. The header Collapse button, a new `.ai-scoreboard-close` "×" (positioned bottom-right for Top placement, upper-right for Bottom placement — both "the panel's own far edge"), and a `document.addEventListener('keydown', …)` Escape handler (guarded — only acts while expanded) all call it. No parallel state.
  - **Refresh feedback**: button text is now `Refresh` (not `Refresh Health`); states are `Refresh` → `Refreshing…` (disabled, blocks duplicate clicks) → `Refreshed ✓` (green, `.ai-scoreboard-btn-success`) or `Refresh failed` (red, `.ai-scoreboard-btn-error`), reverting after 5s. A failure never clears `aiHealthSnapshot`.
  - **Copy feedback**: `Copied ✓` now holds for 5000ms (was 1500ms) with a success-color treatment, then reverts.
  - **Compact display settings** live in `aiScoreboardPrefs()`/`aiScoreboardPercentText()`/`aiScoreboardResetText()`, applied inside `aiScoreboardCompactLine()`. They reformat the live Compact rows immediately (no restart) because `renderStatus()` now calls `renderAiScoreboard()` after syncing preferences.
  - **Copy Complete Context stays complete** regardless of Compact settings — `buildAiScoreboardCopyText()` was never touched; it already read only the canonical health snapshot (left, used, absolute reset, and countdown for both windows), independent of any Compact rendering path. Verified by a new test (SB-26).
  - **Settings**: the old standalone "AI Usage Refresh Frequency" card is gone (folded, not duplicated) into one new `#aiScoreboardSettingsCard` — "AI Usage Scoreboard" — organized as Placement & Behavior → Compact Display (percentage/reset/density/marker) → Refresh → a static Copy & Context note, matching the requested layout. Team/B-Team/CONSERVE settings were explicitly not touched or stubbed.

## Tests

- **Placement/geometry**: SB-16 (fixed + inset + rounded + bordered, never edge-to-edge), SB-17 (`.shell` reserves space per placement side), SB-24 (Bottom default; Top preference moves the card and flips the reserve class).
- **Close behavior**: SB-23 — Collapse, ×, and Escape (only while expanded, verified inert while collapsed) all drive the same `aiScoreboardExpandBtn` state through one path.
- **Provider theming**: SB-21 (Compact rows), SB-22 (Expanded cards accent the percentage + countdown but not the absolute reset — matches TEMP's own split, and matches your correction that collapsed must be themed too).
- **Refresh**: SB-19 (label is `Refresh`, POSTs the real Play 2 endpoint, shows `Refreshed ✓` with the success class).
- **Copy**: SB-26 (Complete Context stays fully detailed under non-default Compact settings).
- **Compact display live-apply**: SB-25 (percent/reset/marker preferences reformat Compact rows without a restart).
- `test/ai-scoreboard-settings-daemon.test.mjs` (new, 3 tests): each of the six fields validates + persists + rejects an out-of-allowlist value; defaults are exactly bottom/collapsed/left/absolute/standard/separator; a save survives a daemon restart (file-backed).
- `test/s55-1-finished-state-and-time-format.test.mjs`: 8 new tests — the consolidated settings card exists (and the old standalone card does not, proving no duplicate), each of the six settings defaults correctly and persists a change via the Settings UI radios.
- Fixed two cross-harness regressions this Play's new always-on code paths exposed in *other* test files' minimal fake DOMs (not related to their own subject matter): `document.addEventListener` and `element.setAttribute` are now feature-detected before use, since a couple of older test harnesses' fake `document`/`createElement` never needed those methods before. `document.body` access is now routed through a guarded `aiScoreboardToggleBodyClass()` helper for the same reason.
- `npm run compile` — clean.
- `npm test` (full suite): **1589/1597 passing**. The 8 failures are the same pre-existing, unrelated baseline failures present before this Play (verified identical names/count before and after): extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and the one wall-clock-dependent Codex countdown test (`SB-13`) that has been flaking on real elapsed time since Play 1.

## Field behavior (per design)

After restart: the Scoreboard renders as a rounded/inset card (not edge-to-edge); Bottom is the default and stays viewport-persistent; switching Settings → AI Usage Scoreboard → Placement to Top moves the card and its expansion direction flips (grows down instead of up); Compact rows and Expanded cards both read Codex numbers in cyan and Claude numbers in amber; Refresh shows Refreshing… → Refreshed ✓/Refresh failed; Copy Complete Context confirms and holds ~5s; Collapse/×/Escape all collapse identically; Compact display settings reformat rows live; Copy Complete Context stays fully detailed regardless of those settings; live health (push + the Play 2 global reader) is unaffected.

## Known limitations

- The "×" close control and Escape handling were added as genuinely new interactive surfaces this session; I verified them against the synthetic VM-based test harness (which now supports simulated `keydown` dispatch), not a real browser. A quick manual click-through after restart is worth doing, per the Field Acceptance checklist in the Play.
- Settings card collapsibility ("this card itself may be collapsible") was explicitly optional in the Play text and was not built — the card is a single non-collapsible group with clearly labeled subsections, keeping today's diff smaller. Worth a follow-up Play only if it becomes visually crowded once Team/B-Team settings are added later.
- I did not attempt to pixel-match TEMP's exact spacing/typography scale (e.g. its `clamp()`-based type sizes) — the instruction was to translate the visual language into Sideline's existing component, not adopt TEMP's own layout system, so Sideline's existing font sizes/spacing scale were kept and only the color/treatment language was borrowed.

## Confirmations

- **TEMP files untouched**: `git status`/`git diff` on `TEMP/` show it as an untracked, unmodified directory — nothing inside it was read-then-written.
- **Play 2 live-health architecture not widened**: `claude-usage-reader.ts`, the `HealthAuthority.ingestClaudeUsage` convergence path, the `/api/ai-health` and `POST /api/ai-health/refresh` endpoints, and the one-global-reader daemon wiring are all untouched by this Play — only the *button label and visible feedback* around the existing `POST /api/ai-health/refresh` call changed. Codex acquisition and routing were not touched at all.
- No commit, no push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Scoreboard-Play3-Settings-And-Polish__20260922-074500__Claude.md
