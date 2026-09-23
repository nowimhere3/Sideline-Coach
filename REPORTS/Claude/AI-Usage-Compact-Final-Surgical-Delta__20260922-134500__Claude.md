# AI Usage Compact Scoreboard — Final Surgical Delta

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Continuation of / corrects:** `AI-Usage-Compact-Surgical-Alignment-Delta__20260922-105000__Claude.md`, based on field testing of that Play's result.

Eight field-tested defects. All fixed in `src/public/index.html` (CSS only — no JS change was needed) and `test/ai-usage-scoreboard-ui.test.mjs`.

## The core architectural change: one flattened shared grid

The prior delta's macro rail (`64px minmax(0,1fr) 12px minmax(0,1fr)`, with each `.ai-scoreboard-metric` an independent `inline-grid`) still let Weekly's TIME column size itself **per row** — Claude's `Sat 6:00 AM` (11 chars) and Codex's `5:05 PM` (7 chars) each got their own `auto` track inside their own metric's own grid, so even though both rows started at the same macro x-position, the reset time/AM-PM inside them landed at different offsets (defect #3). The same per-cluster `1fr`/flexible macro column also let all leftover row width pool between the 5H cluster and the divider (defect #2).

Per the Play's explicit instruction, this is now **one fully flattened grid**. `.ai-scoreboard-metric` changed from `display: inline-grid` (with its own `grid-template-columns`) to `display: contents` — the metric's own box disappears entirely, and its 6 cell children (window/value/%/dot/time/meridiem) become **direct items of the outer `.ai-scoreboard-compact` grid**, landing on that grid's own column tracks:

```css
.ai-scoreboard-compact {
  display: grid;
  grid-template-columns:
    72px
    24px 28px 14px 14px auto 24px
    auto
    24px 28px 14px 14px auto 24px;
  column-gap: 0;
  row-gap: 4px;
  align-items: baseline;
}
.ai-scoreboard-metric {
  display: contents;
  font-variant-numeric: tabular-nums;
  font-size: .88rem;
}
```

14 columns, matching the DOM's flat per-row order exactly (`[providerLabel, 6×5H-cells, sep, 6×WK-cells]`), auto-flowing Claude into row 1 and Codex into row 2 of the same template. There is now exactly **one** 5H-TIME track and **one** WK-TIME track in the whole grid, each shared by both rows — CSS Grid sizes each to the max content-width either row needs, so Weekly's time/meridiem is now structurally guaranteed to land at the same x-position for both providers, exactly like 5H already did. Row-to-row drift is no longer possible by construction, not just by convention.

No JS change was required: `buildAiScoreboardDom()`'s `makeMetric()` already built a plain wrapper `<span>` holding 6 cell children, and `compact.append(...)` already appended 8 flat top-level items per the prior delta — that DOM shape is exactly what the new CSS needs; only the CSS `display` declaration changed.

## Defect-by-defect

1. **"CLAUDE"/"5H" breathing room.** Provider-label column widened `64px → 72px`. The extra width is trailing space after the (shorter) provider text, which now reads as a small gap before the 5H cluster begins.
2. **Divider too far right / dead 5H-to-divider runway.** Solved by the flattening above: 5H's 6 cells are now individually `24/28/14/14/auto/24`-sized tracks, not one `1fr`-wide macro column — there is no flexible track left between 5H's content and the divider to swallow free width into.
3. **Weekly time/AM-PM misalignment across rows.** Solved by the flattening above (the core fix) — one shared `auto` TIME track and one shared `24px` MERIDIEM track for Weekly, used by both rows.
4. **Flatten into one shared parent grid.** Done exactly as specified — the literal column list (`PROVIDER, 5H×6, DIVIDER, WK×6`) is the grid's `grid-template-columns`, invisible (no borders/lines added), and identical for both rows since it's one grid, not two.
5. **Weekly internal rhythm matching 5H's.** `column-gap: 0` across the whole shared grid keeps every cluster's internal cells tight; the only two places with intentional padding are the provider column's own width (#1) and the divider's `padding: 0 8px` (below) — never inside a cluster.
6. **Header utility territory preserved.** `.ai-scoreboard-header` (Copy/Expand/⇅, `justify-content: space-between`) is untouched from the prior delta — it's a separate flex row above `.ai-scoreboard-compact` entirely, so Weekly (bounded by its own fixed/`auto` column widths, no `1fr`) has no mechanism to extend under it.
7. **Bottom outer breathing room 8px → 14px.** `#aiScoreboardContainer { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }` — still no `padding-top` on this rule, so the structural dam (Game content stops at the Scoreboard's top edge) is untouched; only the bottom viewport-facing value changed.
8. **Top placement 8px → 14px.** `body.ai-scoreboard-top #aiScoreboardContainer { padding-top: calc(14px + env(safe-area-inset-top)); margin-bottom: 14px; padding-bottom: 0; }` — the existing separate top-padding/bottom-margin split is preserved (air above the card, separation below it before Game content); the card's own bottom edge remains the hard structural boundary.

## Other targeted changes

- `.ai-scoreboard-sep { padding: 0 8px; }` — new. Gives the divider breathing room on both sides (supports #2 and #5) without a flexible gap track; its own column stays `auto`-sized so the padding directly inflates it.
- Removed the now-inert `.ai-scoreboard-metric.is-unknown { grid-template-columns: 24px 1fr; }` rule — under `display: contents` there is no per-metric grid left to collapse. Kept `.cell-val` left-align/muted styling for the unknown case; "UNKNOWN" renders in the shared value column with the remaining (empty) cells occupying no visible space. Confirmed by SB-42/SB-43, both still green.
- Provider theming (`.ai-scoreboard-metric.claude/.codex .cell-val/.cell-unit/.cell-time/.cell-meridiem`) — **unchanged**. Descendant selectors still match through a `display: contents` ancestor since the element remains in the DOM tree; only its own box was removed from the box tree.

## Field Target achieved

```
AI USAGE · GLOBAL                                  Copy  Expand  ⇅

CLAUDE    5H    75 %   ·   6:00 PM    |    WK    43 %   ·   Sat 6:00 AM
CODEX     5H   100 %   ·   6:19 PM    |    WK     4 %   ·       5:05 PM
```
Provider rail, 5H rail, 5H values, and 5H time/AM-PM all align as before; the divider now sits shortly after the completed 5H cluster (no dead 1fr runway); Weekly values/times/AM-PM now align across rows by construction; no internal cluster gaps; Weekly stays bounded above the header's utility territory; outer breathing room is now visibly ~14px both placements.

## Tests

`test/ai-usage-scoreboard-ui.test.mjs`:
- **SB-18** (rewritten) — asserts the one flattened 14-column template, `display: contents` on the metric, and that no per-metric `grid-template-columns` remains.
- **SB-37b** (rewritten) — the direct regression test for defect #3: no `1fr` anywhere in the shared grid, and `display: contents` confirms the metric can no longer size a time column independently per row.
- **SB-39** — unchanged assertions still hold: `.ai-scoreboard-compact` has 8 flat direct children (`display: contents` removes the metric's *box*, not its DOM node, so the structural sibling check is unaffected); comment updated to note this explicitly.
- **SB-40, SB-41** (renamed/values bumped) — assert `14px` (not `8px`) for both Bottom and Top outer spacing.
- **SB-38, SB-21, SB-22, SB-42, SB-43** and all Play 1–3.2 / prior-delta tests — ran **unchanged**, confirming the 6-cell slot structure, provider coloring, tabular numerals, Expanded view, Claude partial/genuinely-unknown handling, structural sibling layout, and Top/Bottom persistence were not disturbed.

`test/ai-usage-scoreboard-ui.test.mjs`: **46/46 passing.**
`npm run compile` — clean.
`npm test` (full suite): **1637/1645 passing.** The 8 failures are the same known pre-existing baseline set (extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, retention-value validation, Codex-controlled-terminal flows) — none touch the Scoreboard; no new failures.

## Confirmations

- **Structural dam unchanged:** `#gameScrollRegion`/`#aiScoreboardContainer` sibling layout and `order`-driven Top/Bottom placement (SB-34/SB-35/SB-37, all pass unmodified) were not touched — only the two padding/margin px values changed, and only the CSS `display` value on `.ai-scoreboard-metric` changed (no JS).
- **Expanded, health acquisition, Claude/Codex data logic, Refresh, Copy, Settings, Top/Bottom persistence:** all untouched, all green (SB-19–SB-33, SB-42, SB-43).
- No commit. No push.

## Addendum — Composition correction (same session, following field review)

The flattened-grid delta above nailed row-to-row alignment but, taken to its logical extreme (one shared rail across the *entire* card width), regressed the macro composition: it read as one undifferentiated telemetry band rather than three visual neighborhoods (Provider+5H, Weekly, reserved utility space). A follow-up Play corrected the composition while explicitly preserving the alignment guarantees. **CSS-only again; the one JS change was the provider label text itself.**

### What changed

**1. Provider column is content-sized, with an explicit gap — not a wide fixed box.**
```css
.ai-scoreboard-provider-label {
  font-weight: 800;
  letter-spacing: .02em;
  text-transform: capitalize;
  padding-right: 10px;
}
```
The grid's first column changed from a fixed `72px` to `auto` (sizes to whichever of "Claude"/"Codex" is wider); the Provider→5H gap is now the label's own `padding-right: 10px` — an intentional gap, not an oversized column (task 5 of the composition Play, explicit "do NOT create the gap via column width").

**2. A trailing reserved (empty) Zone 3 track.**
```css
.ai-scoreboard-compact {
  display: grid;
  grid-template-columns:
    auto
    24px 28px 14px 14px auto 24px
    auto
    24px 28px 14px 14px auto 24px
    minmax(0, 1fr);
  column-gap: 0;
  row-gap: 4px;
  align-items: baseline;
}
```
A 15th column, `minmax(0, 1fr)`, was appended after Weekly's meridiem cell. No DOM item is ever placed in it (each row still appends exactly 14 flat children), so it always renders as empty space — this is Zone 3, structurally: all leftover row width is explicitly captured there instead of leaving the browser's default grid `justify-content` behavior to decide where slack goes. It sits below the header's Copy/Expand/⇅ controls, and Weekly (whose own cells stay fixed/`auto`-sized, never `1fr`) has no way to expand into it.

Net effect: the card now reads as three neighborhoods — Zone 1 (provider+5H, shared rails across rows), Zone 2 (Weekly, shared rails across rows, independently of Zone 1's rails), Zone 3 (reserved, empty) — while 5H-to-5H and WK-to-WK alignment *within* each neighborhood remains exactly as structurally guaranteed as before (still one `display: contents`-flattened grid under the hood; only the column list and the provider label's box model changed).

**3. Divider position** — unchanged from the prior delta (`.ai-scoreboard-sep { padding: 0 8px; }`, `auto`-sized column) — already sat shortly after the completed 5H cluster since none of 5H's own 6 tracks were ever `1fr`; the composition-Play's "divider too far right" complaint was a description of the *pre-flattening* macro-`1fr`-column bug from two deltas ago, already resolved.

**4. Provider label typography — title case.** `buildAiScoreboardDom()`'s Compact-row label calls changed from `makeProviderLabel('CLAUDE', 'claude')` / `('CODEX', 'codex')` to `makeProviderLabel('Claude', 'claude')` / `('Codex', 'codex')`, plus `text-transform: capitalize` as a CSS belt-and-suspenders. Color (amber/orange for Claude, cyan for Codex) and `font-weight: 800` are untouched. **Scope-limited to the Compact rows only** — Copy Complete Context's clipboard text (`lines.push('CLAUDE')` / `'CODEX'`) and the Expanded view's card headers (`makeProviderCard(..., 'CLAUDE', ...)` / `'CODEX'`) were explicitly left alone; the Play only asked for the Compact row labels.

**5. Outer viewport breathing room, 14px → 16px.**
```css
#aiScoreboardContainer { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
body.ai-scoreboard-top #aiScoreboardContainer { padding-top: calc(16px + env(safe-area-inset-top)); padding-bottom: 0; margin-bottom: 14px; }
```
Only the two viewport-facing values changed. The Top placement's `margin-bottom: 14px` (the separate, modest Scoreboard→Game-content separation, not the viewport-facing gap) was deliberately left at its prior value per the Play's "preserve the modest separation" instruction — only the outward-facing `padding-top` was bumped to 16px.

### Tests

- **SB-18** (rewritten) — grid-template-columns now asserts `auto` for the provider column and a trailing `minmax(0, 1fr)`; added assertions for `text-transform: capitalize` and `padding-right: 10px` on the provider label.
- **SB-18c** (new) — Compact rows render `"Claude"`/`"Codex"` verbatim (title case), the direct regression test for task 9.
- **SB-37b** (adjusted) — the "no 1fr inside a cluster" check now strips the trailing `minmax(0, 1fr)` token before asserting no bare `1fr` remains, since Zone 3's reserved track is intentionally flexible while the 5H/Weekly cell sequences themselves must not be.
- **SB-40, SB-41** (values bumped) — assert `16px` for the Bottom/Top viewport-facing padding; SB-41's `margin-bottom: 14px` assertion is unchanged.
- All other Play 1–3.2 / prior-delta tests, including SB-39 (8 flat compact children), SB-38/42/43 (6-cell slot structure, unknown-window handling) — ran **unchanged**.

`test/ai-usage-scoreboard-ui.test.mjs`: **47/47 passing.**
`npm run compile` — clean.
`npm test` (full suite): **1638/1646 passing.** Same known pre-existing 8-name baseline failure set (none touch the Scoreboard); no new failures.

### Confirmations

- Expanded view, health acquisition, Claude/Codex data semantics, Refresh, Copy, Settings, Top/Bottom persistence, structural sibling layout, and header utility placement: all untouched, all green.
- Row-to-row alignment logic preserved exactly — only re-scoped from "one rail across the whole card" to "one rail per neighborhood" (5H's rail and Weekly's rail are each still shared across Claude/Codex independently).
- No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Compact-Final-Surgical-Delta__20260922-134500__Claude.md
