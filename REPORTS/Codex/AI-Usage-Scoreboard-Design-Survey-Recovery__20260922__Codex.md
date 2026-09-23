# AI Usage Scoreboard Design Survey Recovery

**Agent:** Codex  
**Date:** 2026-09-22  
**Role:** Reconnaissance only  
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Scope:** Recover the latest accepted collapsed AI Usage Scoreboard design context before a small polish pass.  
**Repository actions:** No product code changed. No commit. No push.

## Most Relevant Reports

1. `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\AI-Usage-Compact-Final-Surgical-Delta__20260922-134500__Claude.md`
   - Establishes the shared semantic rails, Provider/5H/Weekly information architecture, alignment rationale, and subsequent three-zone composition correction.

2. `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\AI-Usage-Compact-Zone3-Row-Integrity-Repair__20260922-141523__Codex.md`
   - Contains the final accepted correction: telemetry has 14 rails; empty Zone 3 is a separate sibling, not a fifteenth telemetry column.

3. `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Codex\AI-Usage-Scoreboard-Outer-Shell-Final-Polish__20260922-142416__Codex.md`
   - Freezes the accepted telemetry content and records the card rail, structural spacing, scrollbar, divider, and Weekly-area polish.

Later operational recovery relevant to the current source:

- `C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\AntiGravity\AI-Usage-Scoreboard-Disappearance-Regression-Repair__20260922-192500__AntiGravity.md`
  - Records restoration of the approved layout after an accidental file reversion and adds the `resetsAt: null` defense.

## Survey of the Accepted Design

The collapsed desktop scoreboard is a compact control-room display with three visual neighborhoods:

- **Zone 1:** title-case provider identity plus its 5H metric.
- **Zone 2:** Weekly metric.
- **Zone 3:** intentionally empty utility/reserved space beneath the header controls.

Claude and Codex share one 14-column telemetry grid. Each metric contributes six semantic cells:

`window | value | % | separator | time | meridiem`

Metric wrappers use `display: contents`, so both provider rows land on the same grid tracks. This structurally aligns 5H and Weekly values, times, and AM/PM suffixes across rows.

Zone 3 is a separate empty sibling of the telemetry grid. It must not become another auto-placement destination. Header actions remain in their own row above the compact telemetry.

The scoreboard remains an inset normal-width card and a real flex sibling of the Game scroll region. It is not an overlay. The Game region remains the only scroll owner and ends at the scoreboard's Game-facing edge.

## Already Tried and Rejected

- **Independent per-provider or per-metric grids:** their `auto` reset-time tracks sized separately, causing Claude's longer Weekly time and Codex's shorter time to drift horizontally.
- **Flexible `1fr` tracks inside 5H or Weekly:** these created a large dead runway between the percentage, reset time, and divider.
- **One flat 15-column telemetry grid with the last column intended as Zone 3:** each provider supplied only 14 items, so CSS auto-placement put the next provider label in the unused fifteenth column and broke the following row.
- **A wide fixed provider rail such as `72px` to manufacture Provider-to-5H space:** the accepted design uses a content-sized `auto` provider column with explicit right padding.
- **Stretching telemetry across the full card:** field review rejected the resulting undifferentiated telemetry band and restored three visual neighborhoods.
- **Overlay/fixed positioning, JavaScript-measured reserved space, or a second scroll container:** rejected in favor of a real structural sibling/dam.
- **Using internal padding for the viewport-facing outer gap:** final shell polish uses external margins so the gap is visibly outside the card background.
- **Treating `{ utilization: 0, resetsAt: null }` as wholly unknown or passing `null` through `new Date()`:** the percentage remains valid at `100%` available while reset time renders `UNKNOWN`.

## Accepted Desktop Constraints to Preserve

- `.ai-scoreboard-compact` owns the macro two-region composition: telemetry plus empty Zone 3.
- `.ai-scoreboard-telemetry` owns exactly 14 shared semantic rails.
- Claude is explicitly grid row 1; Codex is row 2.
- The provider column remains content-sized; Provider-to-5H spacing is explicit padding, not an oversized rail.
- No flexible track is allowed inside either 5H or Weekly.
- Weekly time and meridiem remain shared tracks across both providers.
- Zone 3 remains empty, `aria-hidden`, and outside the telemetry grid.
- Header controls stay above telemetry and do not consume Weekly or Zone 3 rails.
- Preserve title-case `Claude` and `Codex`, provider colors, tabular numerals, compact six-cell metrics, and Expanded behavior.
- The scoreboard remains `width: calc(min(100%, 760px) - 28px)` on the normal card rail.
- Bottom placement retains an external `16px + safe-area` bottom margin. Top placement retains the equivalent top margin plus the separate 14px Game-side separation.
- `#gameScrollRegion` remains the sole scrolling region; the scoreboard remains a structural sibling/dam.

## Exact Current Implementation Areas

### Provider to `5H` spacing

- `src/public/index.html:1044` — `.ai-scoreboard-telemetry` begins with a content-sized `auto` provider column.
- `src/public/index.html:1058` — `.ai-scoreboard-provider-label { padding-right: 10px; }` owns the explicit gap.

### Weekly `% · time` alignment

- `src/public/index.html:1044` — the shared 14-track `.ai-scoreboard-telemetry` grid.
- `src/public/index.html:1074` — Weekly children are explicitly anchored to columns 9 through 14.
- `src/public/index.html:1104` — `.ai-scoreboard-metric { display: contents; }` places semantic children directly on the shared tracks.

### Compact 5H reset-time formatting

- `src/public/index.html:4882` — `aiScoreboardCompactReset` produces same-day time-only output, adds abbreviated weekday for later dates, and returns `UNKNOWN` for null, empty, or invalid reset values.
- `src/public/index.html:4938` — `aiScoreboardSplitResetTime` separates AM/PM into its dedicated rail.
- `src/public/index.html:4947` — `aiScoreboardFormatMetric` assembles the six compact semantic fields.

### Mobile reset-time visibility

- `src/public/index.html:1130` — `.cell-time` is `nowrap`, right-aligned, and may ellipsize when constrained.
- `src/public/index.html:5124` — desktop and mobile use the same compact DOM and reset cells.
- No scoreboard-specific mobile rule hides reset times.

## Cascade Caution

`.ai-scoreboard-sep` is declared twice in the current source. The later rule overrides the earlier padding but does not cancel the earlier `translateX(3ch)`. Any divider or Weekly-gap polish must account for the effective cascade rather than assuming the first declaration's padding remains active.

## Mobile Status and Unfinished Proof

No dedicated unfinished mobile-scoreboard redesign breadcrumb was found in the narrow report set. The latest recovery report states that desktop and mobile responsive behavior was restored, but it does not define a separate mobile scoreboard layout.

Current implemented behavior:

- Desktop and mobile use the same compact scoreboard, formatter, and reset cells.
- No scoreboard breakpoint selectively hides compact reset time.
- Expanded provider and secondary cards collapse from two columns to one below 560px.
- Expanded content is capped at `50vh` and scrolls internally for short/mobile viewports.
- Viewport-facing margins include safe-area insets.

The focused tests verify reset rendering and the responsive structural CSS, but there is no explicit narrow-viewport test proving that every compact reset string remains visually untruncated. This is the identifiable unfinished mobile-proof area.

## Final Handoff

The next polish pass should be surgical. Preserve the 14-rail shared telemetry grid, the separate empty Zone 3 sibling, the structural Game/Scoreboard dam, and the current reset formatting semantics. Do not reintroduce independent metric grids, internal flexible tracks, a fifteenth telemetry rail, or fixed-width provider spacing.
