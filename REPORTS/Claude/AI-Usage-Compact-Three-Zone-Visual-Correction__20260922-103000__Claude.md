# AI Usage Compact Scoreboard — Three-Zone Visual Correction

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Continuation of:** Slice 3.2 (structural app-frame layout, already correct and untouched).

## Starting-state audit

Before writing anything, I read the source AntiGravity had already landed. Two of the Play's requirements were **already implemented and tests were already green**:

1. **Claude 5H "known-full / reset-unknown" presentation.** `aiScoreboardNormalize()` already builds `{used, left, resetsAt: undefined}` instead of discarding the whole window when only `resetsAt` is missing (`resetsAt: hasReset ? resetsAt : undefined`, not the old "both-or-nothing" check). `aiScoreboardFormatMetric()` already renders `time = 'UNKNOWN'` for that case while `val`/`unit` stay factual. Result: `5H 100% · UNKNOWN` already worked, and tests SB-42/SB-43 already existed and passed. **No code change needed here** — I only left it alone and confirmed it, per the Play's own instruction ("if already guaranteed by another mechanism, do not change code unnecessarily").
2. **Outer structural spacing** (Bottom: ~6px below the card; Top: ~6px above + a separate ~6px content-separation margin below it). Already present verbatim in `#aiScoreboardContainer` / `body.ai-scoreboard-top #aiScoreboardContainer` CSS from Slice 3.2, with tests SB-40/SB-41 already green. **No code change needed here either.**

The actual bug — the macro composition — was real and is what this Play fixed.

## The real problem, and the exact fix

**Root cause:** the utility controls (Copy / Expand / ⇅) lived in a separate full-width `.ai-scoreboard-header` banner *above* the Compact telemetry, while each provider's telemetry (`.ai-scoreboard-row`) spanned the full card width below it (`grid-template-columns: 62px 1fr`, with `.ai-scoreboard-windows` internally splitting that `1fr` into `1fr 14px 1fr` for 5H/Weekly). There was no macro three-zone composition at all — telemetry and the utility row were two independent full-width bands stacked vertically, not the Field Target's single row with Zone 1 | Zone 2 | Zone 3 side by side.

**Fix — `src/public/index.html`, CSS:**
- `.ai-scoreboard-compact` is now a CSS grid: `grid-template-columns: minmax(0,1fr) 12px minmax(0,1fr) auto;` — Zone 1 (flexible), a 12px divider column, Zone 2 (flexible), Zone 3 (`auto`, sized to its own buttons rather than a hard-coded third — per the Play's explicit instruction not to force mathematical 33.333% widths).
- `.ai-scoreboard-utility { grid-column: 4; grid-row: 1 / span 2; align-self: start; }` — the utility cell spans both provider rows but its content (`.ai-scoreboard-actions`, unchanged flex row of the three buttons) only occupies the first row; the space below is empty by construction, not a bug.
- `.ai-scoreboard-row` changed from a 2-column grid (`62px 1fr`) to a simple flex row (`display:flex; align-items:baseline; gap:8px;`) holding just the provider label + the 5H metric — this **is** Zone 1 now.
- New `.ai-scoreboard-zone2` class holds *only* the Weekly metric, no repeated provider label — matches the Field Target exactly (`WK 43% · Sat 6:00 AM`, no `CLAUDE` prefix on the second telemetry field).
- `.ai-scoreboard-windows` (the old 5H|divider|WK wrapper) is gone — the divider (`│`) is now its own grid cell between Zone 1 and Zone 2 in each row.
- **Provider theming moved from the row to the metric itself:** `.ai-scoreboard-metric.claude`/`.codex` (not `.ai-scoreboard-row.claude`/`.codex`) now drives `.cell-val`/`.cell-unit`/`.cell-time`/`.cell-meridiem` color. This was a required consequence of splitting Zone 1/Zone 2 into separate grid cells — Zone 2's Weekly metric is no longer a descendant of the row that carries the accent class, so theming had to move to the metric element (which now gets the accent class directly, e.g. `fiveHour.className = 'ai-scoreboard-metric claude'`). This is *more* robust than before, not a workaround: Zone 1 and Zone 2 now share literally identical theming logic regardless of which grid cell holds them.
- **`.cell-meridiem` was missing from the provider-color rule entirely** (only `cell-val`/`cell-unit`/`cell-time` were colored before) — added, per the Play's explicit requirement that "the complete percentage expression and meridiem should read in provider color."
- **`.cell-meridiem { padding-left: 4px; }`** added — the Play's explicit "add visible breathing room between time value and AM/PM."
- Everything else in the micro rail (`.ai-scoreboard-metric { grid-template-columns: 24px 28px 14px 14px 1fr 24px; }` — window/value/%/dot/time/meridiem, tabular numerals, right/left alignment per cell) was already correct from AntiGravity's work and is untouched.

**Fix — `src/public/index.html`, JS (`buildAiScoreboardDom`):**
- `header.append(title)` — the header no longer appends `actions`; it holds only the restrained `AI USAGE · GLOBAL` title line.
- New `makeZone1(id, label, accentClass)` builds the provider-label + 5H metric flex row (replaces the old `makeProviderRow`'s row half).
- New `makeZone2(id, accentClass)` builds the Weekly-only cell.
- New `makeSep()` builds one `│` divider per row (previously one `.ai-scoreboard-sep` shared inside `.ai-scoreboard-windows`; now one per row since Zone 1/Zone 2 are separate grid cells).
- `utility` (containing the existing `actions` element, untouched) is appended once, positioned via `grid-column:4; grid-row:1/span2` in CSS — not duplicated per row.
- `compact.append(...)` in exact DOM order `[claudeZone1, claudeSep, claudeZone2, utility, codexZone1, codexSep, codexZone2]` — CSS Grid auto-placement fills row 1's columns 1–3 from the first three items, places `utility` at its explicit `column:4/row:1-2`, then continues auto-placement into row 2 columns 1–3 for the Codex items (column 4 of row 2 is already claimed by `utility`'s row-span, so it's correctly skipped — no manual `grid-row`/`grid-column` needed on the Codex cells).
- Element IDs (`aiScoreboardClaudeRowFiveHour`, `aiScoreboardClaudeRowWeekly`, etc.) are unchanged, so `renderAiScoreboard()`'s `setCompact()` lookups needed **zero changes**.

## Final macro-zone proportions

`grid-template-columns: minmax(0,1fr) 12px minmax(0,1fr) auto;` — Zone 1 and Zone 2 are equal flexible fractions of whatever width remains after the divider and Zone 3's own content width are subtracted; Zone 3 is sized to exactly fit Copy + Expand + ⇅ (not a fixed third). On the card's ~700px content width this yields roughly balanced-but-not-mathematically-equal thirds — Zone 1/Zone 2 each get noticeably more room than Zone 3, matching "approximately three visual bands... balanced... not sacred 33.333% widths."

## Final micro-grid column contract (unchanged from AntiGravity, confirmed correct)

```
.ai-scoreboard-metric { grid-template-columns: 24px 28px 14px 14px 1fr 24px; }
  cell-window (24px, muted)  → "5H " / "WK "
  cell-val    (28px, right)  → dynamic percentage number, provider-colored
  cell-unit   (14px, left)   → "%", provider-colored
  cell-dot    (14px, center) → "·" / "↻", muted
  cell-time   (1fr, right)   → dynamic clock/date, provider-colored
  cell-meridiem (24px, left, padding-left:4px, provider-colored) → "AM"/"PM"
```

## Claude partial-unknown treatment (confirmed, unchanged)

`5H 100% · UNKNOWN` when the percentage/utilization is known but `resetsAt` is not — the percentage renders factually via the normal 6-cell metric grid (not the collapsed `is-unknown` 2-column layout, which is reserved for when the *entire* window is missing). A genuinely unknown window (no window object at all, e.g. no push/reader evidence has ever arrived) still renders the collapsed `5H UNKNOWN`. No backend/HealthAuthority change — purely how `index.html`'s existing `aiScoreboardNormalize`/`aiScoreboardFormatMetric` were already built.

## Top/Bottom outer spacing (confirmed, unchanged)

- Bottom: `#aiScoreboardContainer { padding-bottom: calc(6px + env(safe-area-inset-bottom)); }`, no `padding-top` — Game content still stops at the card's hard top edge (Slice 3.2's structural boundary, untouched), with ~6px of breathing room below the card before the viewport edge.
- Top: `body.ai-scoreboard-top #aiScoreboardContainer { padding-top: calc(6px + ...); padding-bottom: 0; margin-bottom: 6px; }` — 6px above the card, and a separate 6px `margin-bottom` gives the Game content its own comfortable separation from the card's bottom (hard) edge.

## Tests

`test/ai-usage-scoreboard-ui.test.mjs`:
- **SB-18** (rewritten) — asserts the macro grid (`grid-template-columns: minmax(0, 1fr) 12px minmax(0, 1fr) auto;`), the utility row-span, the unchanged micro rail, and the new meridiem breathing-room padding.
- **SB-18b** (new) — DOM-level: Copy/Expand/position-switch live inside `.ai-scoreboard-utility`, not a `.ai-scoreboard-header` child; exactly two provider telemetry rows remain (Compact stays two rows).
- **SB-21** (rewritten) — provider theming now asserted on `.ai-scoreboard-metric.claude`/`.codex` (val/unit/time/meridiem), not the old row-level `.ai-scoreboard-windows` selector.
- **SB-39** (rewritten) — same theming-selector update, plus confirms Zone 1 is a flex row and the micro rail is unchanged.
- **SB-38, SB-40, SB-41, SB-42, SB-43** (pre-existing, from AntiGravity's work) — ran **unchanged**, all green: identical 6-cell slot structure between Claude/Codex, both outer-spacing rules, and both Claude partial-unknown/genuinely-unknown/expired-window cases.
- All other Play 1–3.2 tests (SB-1 through SB-37 except the three rewritten above) passed **unchanged**.

`npm run compile` — clean (no TypeScript touched).
`npm test` (full suite): **1637/1644 passing**. The failures are 7 of the same 8 known pre-existing baseline failures (the 8th, the wall-clock-dependent `SB-13`, happened not to fire this run — it's timing-flaky by nature, not new); no new failures anywhere.

## Confirmations

- **Structural dam intact:** `#gameScrollRegion`/`#aiScoreboardContainer` sibling layout, CSS `order`-driven Top/Bottom placement, and the Game-region-owns-scrolling boundary from Slice 3.2 were not touched at all — only the CSS/DOM *inside* `.ai-scoreboard-compact` changed.
- **Acquisition/Expanded untouched:** no changes to `claude-usage-reader.ts`, `health-authority.ts`, `daemon.ts`, Codex health, Refresh, Copy Complete Context, or the Expanded view's own CSS/DOM (`.ai-scoreboard-card`, `.ai-scoreboard-window-*`) — all verified passing unchanged.
- No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Compact-Three-Zone-Visual-Correction__20260922-103000__Claude.md
