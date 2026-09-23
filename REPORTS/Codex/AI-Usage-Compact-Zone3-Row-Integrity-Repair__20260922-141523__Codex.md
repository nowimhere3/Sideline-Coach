# Compact Scoreboard Zone-3 Row-Integrity Repair

## Exact files changed

- `src/public/index.html`
- `test/ai-usage-scoreboard-ui.test.mjs`

## Root cause

Compact telemetry used one flattened grid with 15 columns. Each provider contributed only 14 semantic grid items because its two metric wrappers use `display: contents`. The unused fifteenth column therefore remained eligible for auto-placement, allowing the next provider label (`Codex`) to occupy Claude's row and shifting the rest of Codex telemetry into a broken unlabeled row.

## Old DOM/CSS ownership

`.ai-scoreboard-compact` simultaneously owned the 14 telemetry rails and a trailing flexible Zone 3 track. Claude and Codex contributed flat label/5H/divider/Weekly groups to this auto-placement context. Zone 3 was visually intended to be empty but structurally remained a valid telemetry destination.

## New macro structure

`.ai-scoreboard-compact` now owns two sibling macro regions: `.ai-scoreboard-telemetry` and `.ai-scoreboard-zone-3`. The macro grid allocates approximately two parts to telemetry and one part to the deliberately empty reserved region. Header actions remain in `.ai-scoreboard-header`, above this body composition.

## Telemetry row ownership

The telemetry sibling alone owns the original 14 shared semantic rails: provider, six 5H cells, divider, and six Weekly cells. Claude is explicitly assigned to grid row 1 and Codex to grid row 2. Provider labels, dividers, and every 5H/Weekly child receive explicit semantic columns, so neither row depends on ambiguous cross-provider auto-placement. Provider padding retains the modest Provider-to-5H gap.

## Zone 3 implementation

Zone 3 is an empty, `aria-hidden` sibling element with no telemetry children. It is outside the 14-column telemetry grid and cannot receive an auto-placed provider label or metric. Telemetry remains confined to the left/middle region rather than stretching across the full card.

## Tests/results

- Focused Scoreboard tests: PASS, 50/50 (`test/ai-usage-scoreboard-ui.test.mjs` and `test/ai-scoreboard-settings-daemon.test.mjs`).
- Compile (`npm run compile`): PASS.
- Proof covers sibling macro ownership, absence of Zone 3 from telemetry rails, empty Zone 3, explicit Claude/Codex rows, all 14 semantic cells per provider, shared aligned rails, header utilities, title-case labels, provider styling, structural dam, and top/bottom outer spacing.

## Preserved behavior

Expanded markup and behavior were not changed. Health acquisition, Refresh, Copy, Settings, Top/Bottom persistence, provider colors, compact formatting, the structural dam, and viewport-facing breathing room remain intact.

## Repository actions

No commit or push was performed. No unrelated failures were repaired and no full-suite run was performed.
