# AI Usage Compact Scoreboard — Surgical Alignment Delta

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Continuation of / corrects:** `AI-Usage-Compact-Three-Zone-Visual-Correction__20260922-103000__Claude.md`, based on field testing of that Play's result.

Four precise field-tested defects, four precise fixes. All in `src/public/index.html` (CSS + JS) and `test/ai-usage-scoreboard-ui.test.mjs`.

## 1. Utilities moved back to the header row

**Was:** Copy/Expand/⇅ lived in a `.ai-scoreboard-utility` cell inside the Compact grid, row-spanning both telemetry rows beside Claude's row.
**Now:** `buildAiScoreboardDom()`'s `header.append(title, actions)` — restored to the header, same row as `AI USAGE · GLOBAL`, using the header's pre-existing `justify-content: space-between` (title left, actions right — no CSS change needed there, it was untouched from Play 3). The `.ai-scoreboard-utility` class, its CSS, and the "Zone 3" concept are removed entirely — there is no more `.ai-scoreboard-utility` in the source.

## 2. Claude/Codex locked to one shared column definition

**Was:** each provider row was a separate `.ai-scoreboard-row` flex container with its own 5H metric, plus an independent `.ai-scoreboard-zone2` for Weekly — two independently-flex-sized rows that could drift from each other depending on content width.
**Now:** `.ai-scoreboard-compact` is a single CSS grid with **one** column template used by both rows:
```css
.ai-scoreboard-compact {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 12px minmax(0, 1fr);
  column-gap: 10px; row-gap: 4px; align-items: baseline;
}
```
`buildAiScoreboardDom()` now appends **eight flat children** directly into this grid — `[claudeLabel, claude5H, claudeSep, claudeWeekly, codexLabel, codex5H, codexSep, codexWeekly]` — with no per-row wrapper element at all. CSS Grid's default auto-flow places 4 items per row into the same 4 columns, so provider-label, 5H, divider, and Weekly land at byte-for-byte identical x-positions for both providers by construction — there is no independent sizing path left that could let them disagree.

## 3. Weekly rhythm matches 5H — the internal-gap bug

**Root cause found:** `.ai-scoreboard-metric` was `display: grid` (block-level) with `cell-time` on a `1fr` track. As a **direct grid child** of `.ai-scoreboard-compact`, CSS Grid's default `justify-items: stretch` forced each metric to fill its entire grid column — and the internal `1fr` time track then absorbed 100% of that stretched leftover width, producing the reported "giant gap between `%` and the reset time" specifically in Weekly (whose column, once the utility zone was removed, is now the widest one on the card).

**Fix:**
```css
.ai-scoreboard-metric {
  display: inline-grid;      /* was: grid — shrink-to-fit instead of stretch-to-fill */
  justify-self: start;       /* stay left-aligned in its column; leftover space goes AFTER the cluster */
  grid-template-columns: 24px 28px 14px 14px auto 24px;  /* TIME: auto, was 1fr */
  ...
}
```
`display: inline-grid` makes the metric's own outer box shrink-to-fit its content (so the `1fr`→`auto` time track resolves to the reset string's actual width, not the column's full width); `justify-self: start` keeps that compact cluster pinned to the left of its grid cell, so any leftover column width shows up as visible space **after** the complete cluster — between it and the next divider — never inside it. This is exactly "compact inside the cluster, spacious between clusters." 5H was already narrower (sharing its column with the label) so the bug was less visible there, but the same fix applies uniformly to both.

## 4. Outer edge spacing bumped to a field-visible 8px

Source already had ~6px; field inspection found it imperceptible. Bumped both:
```css
#aiScoreboardContainer { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }              /* was 6px */
body.ai-scoreboard-top #aiScoreboardContainer { padding-top: calc(8px + ...); margin-bottom: 8px; } /* was 6px / 6px */
```
The structural dam itself (`#gameScrollRegion`/`#aiScoreboardContainer` sibling layout, `order`-driven Top/Bottom placement, "Game content stops at the Scoreboard's top edge") is completely untouched — only the two padding/margin *values* changed, per instruction ("the structural dam remains unchanged").

## Field Target achieved

```
AI USAGE · GLOBAL                                      Copy  Expand  ⇅
CLAUDE   5H    75 %   ·   6:00 PM     |     WK    43 %   ·   Sat 6:00 AM
CODEX    5H   100 %   ·   5:49 PM     |     WK     4 %   ·       5:05 PM
```
— utilities on the header row; one shared 4-column rail for both provider rows; Weekly reads with the same tight internal rhythm as 5H; extra width lands between complete clusters, not inside one.

## Tests

`test/ai-usage-scoreboard-ui.test.mjs`:
- **SB-18** (rewritten) — asserts the one shared 4-column `.ai-scoreboard-compact` template, `inline-grid`/`justify-self:start` on the metric, and `auto` (not `1fr`) for the TIME track.
- **SB-18b** (rewritten) — Copy's `parentNode.parentNode.className` is `ai-scoreboard-header` (not the removed `ai-scoreboard-utility`).
- **SB-37b** (new) — asserts no `1fr` track exists anywhere inside `.ai-scoreboard-metric`'s column definition, and both the `inline-grid`/`justify-self` fix are present — the direct regression test for defect #3.
- **SB-39** (rewritten) — asserts label/5H/sep/Weekly are 8 flat, direct siblings of one `.ai-scoreboard-compact` grid (not nested per-row wrappers), confirming defect #2's fix structurally, not just visually.
- **SB-40, SB-41** (rewritten) — assert `8px` (not `6px`) for both Bottom and Top outer spacing.
- **SB-38, SB-21, SB-22, SB-42, SB-43** and all Play 1–3.2 tests — ran **unchanged**, confirming the micro-rail (6-cell slot structure, provider coloring, tabular numerals), Expanded view, Claude partial-unknown/expired-window handling, structural sibling layout, Top/Bottom persistence, and Settings hide/show were not disturbed by this delta.

`npm run compile` — clean.
`npm test` (full suite): **1638/1645 passing**. Failures are 7 of the same 8 known pre-existing baseline failures (the 8th, the wall-clock-timing `SB-13`, simply didn't fire this run — it's inherently flaky by real-clock timing, not new); no new failures anywhere.

## Confirmations

- **Structural dam unchanged:** verified via SB-34/SB-35/SB-37 (all pass, unmodified) — `#gameScrollRegion`/`#aiScoreboardContainer` sibling layout and `order`-driven placement are untouched; only the two padding/margin px values changed.
- **Expanded, health acquisition, Claude/Codex data logic untouched:** SB-22, SB-42, SB-43, and all reader/daemon test suites were not touched by this delta and remain green.
- No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Compact-Surgical-Alignment-Delta__20260922-105000__Claude.md
