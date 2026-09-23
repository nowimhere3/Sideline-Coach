# AI Usage Scoreboard — Outer Shell Final Polish

## Files changed

- `src/public/index.html`
- `test/ai-usage-scoreboard-ui.test.mjs`
- `Project SOP/Breadcrumbs/AI-Health-Factual-Parity.md`

## Viewport-facing breathing room

Bottom placement now uses an external `margin-bottom` of approximately 16px plus the bottom safe-area inset. Top placement uses the equivalent external `margin-top` plus the top safe-area inset. These margins expose a visible gap outside the card background. The Game-facing card edge remains hard; the existing top-placement Game-side separation remains unchanged.

## Game scrollbar

The existing `#gameScrollRegion` remains the sole scroll owner with `overflow-y: auto`. Its scrollbar chrome is hidden with `scrollbar-width: none`, `-ms-overflow-style: none`, and a WebKit scrollbar rule. Wheel, trackpad, touch, keyboard, focus scrolling, and normal overflow behavior remain enabled. No second scroll container or overlay compensation was introduced.

## Outer card rail

The Scoreboard retains its established normal-card rail and left edge. Removing scrollbar chrome from the Game scroll owner restores its full content-box rail, eliminating the scrollbar-width loss that made ordinary cards appear slightly narrower on the right. The Scoreboard and main cards therefore resolve against the same visual left/right neighborhood without recomputing or narrowing the approved telemetry grid.

## Frozen content

The approved Compact telemetry grid, provider rows, semantic rails, spacing, divider, typography, colors, title-case labels, header utilities, Expanded view, health acquisition, percentages, and structural dam were not changed in this pass.

## AI Health parity breadcrumb

A future-investigation breadcrumb records the field-observed Claude percentage difference and delayed Codex active-task consumption. No OAuth reader, native push, Codex health, polling, Health Authority, normalization, or percentage-rendering behavior was investigated or changed.

## Tests/results

- Focused Scoreboard tests: PASS, 50/50.
- Compile (`npm run compile`): PASS.
- Tests prove external top/bottom gaps, unchanged Game-side dam, hidden scrollbar chrome with scrolling retained, preserved card rail, and the previously approved Compact/Expanded behavior.

## Repository actions

No commit or push was performed. No unrelated failures were repaired and no full-suite run was performed.

## Final divider delta

The shared Compact divider glyph received one `translateX(3ch)` nudge. The common rule moves Claude and Codex dividers together without changing grid tracks, Weekly placement, card width, or any other approved telemetry/shell behavior. Focused Scoreboard UI tests and compile remained green.

The shared `WK` label received a matching `translateX(3ch)` post-divider breathing gap while its Weekly value, percentage, dot, time, and AM/PM rails remained fixed.
