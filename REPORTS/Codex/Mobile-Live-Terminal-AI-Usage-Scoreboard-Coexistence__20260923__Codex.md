# Mobile Live Terminal + AI Usage Scoreboard Coexistence

**Agent:** Codex  
**Date:** 2026-09-23  
**Status:** Complete  
**Repository actions:** No commit. No push.

## Files Changed

- `src/running-players.ts`
- `src/control-plane/daemon.ts`
- `src/public/index.html`
- `test/ai-scoreboard-settings-daemon.test.mjs`
- `test/ai-usage-scoreboard-ui.test.mjs`
- `test/live-player-console-first-down.test.mjs`
- `test/s54-4-terminal-success-retention.test.mjs`
- `Project SOP/Breadcrumbs/Settings-Information-Architecture.md`
- this report

## Setting

- Key: `aiScoreboardShowOnMobileLiveTerminal`
- Settings label: **Show on Mobile Live Terminal**
- Family: existing **AI Usage Scoreboard** Settings card
- Type: boolean
- Default: `false`, preserving the prior fullscreen mobile terminal behavior.

## Persistence

The setting uses the existing preferences contract:

`Settings checkbox → POST /api/preferences → ControlPlaneDaemon validation/merge → CoachPreferences → preferences.json → status/preferences projection`

Missing, legacy, or non-`true` stored values resolve to `false`. The setting survives daemon restart through the same atomic file-backed persistence as the other Scoreboard preferences.

## Mobile Layout Strategy

The implementation reuses both existing surfaces. It creates no duplicate Scoreboard and no second terminal.

When coexistence is allowed, the existing `.play-console` node is moved into `#mobileLiveTerminalHost`, a body-level flex sibling of `#gameScrollRegion` and `#aiScoreboardContainer`. The normal Game region is removed from mobile layout while the terminal is active. The host owns `order: 1` and flexes into the viewport remaining after the Scoreboard.

When the setting is off—or normal Scoreboard visibility disallows coexistence—the host is hidden and empty, the body coexistence class is absent, and the existing fixed fullscreen mobile terminal path remains unchanged. No blank reservation remains.

## Top / Bottom

The existing Scoreboard placement classes remain authoritative:

- Top: Scoreboard `order: 0`, terminal host `order: 1`.
- Bottom: terminal host `order: 1`, Scoreboard `order: 2`.

No new placement state or duplicate ordering contract was introduced.

## Collapse / Expand

Scoreboard Compact/Expanded state remains owned by the existing Scoreboard implementation. Because the terminal host is a flex sibling, it automatically grows or shrinks into the remaining viewport when the Scoreboard changes height.

Collapsing the Live Player Terminal releases and hides the structural host. On mobile, opening another Player terminal keeps a single primary inspection surface. Desktop terminal behavior remains embedded and unchanged.

## Visibility Contract

The coexistence gate requires all of:

- mobile viewport (`max-width: 619px`)
- persisted `aiScoreboardShowOnMobileLiveTerminal === true`
- the existing Scoreboard container is normally visible
- a Live Player Terminal is expanded

The new preference never forces a normally hidden Scoreboard visible. Settings visibility remains authoritative.

## Tests and Results

Focused primary suite:

- `test/live-player-console-first-down.test.mjs`
- `test/ai-scoreboard-settings-daemon.test.mjs`
- `test/ai-usage-scoreboard-ui.test.mjs`
- Result: **90/90 passed**

Adjacent Settings/terminal regression suites:

- `test/s55-0-settings-hierarchy.test.mjs`
- `test/s53-advanced-player-discovery.test.mjs`
- `test/s54-4-terminal-success-retention.test.mjs`
- `test/terminal-evidence-retention.test.mjs`
- Result after updating the obsolete no-mobile-breakpoint assertion: **all passed** (`RET`: 22/22; combined adjacent run otherwise 70/70 before that assertion update).

Coverage includes default, validation, file persistence/restart, setting UI save, OFF fullscreen behavior, ON structural behavior, Top, Bottom, Compact, Expanded, no phantom host, unchanged desktop, and the existing Scoreboard visibility gate.

## Compile

`npm run compile`: **PASS**.

## Breadcrumbs

Source breadcrumbs:

- `src/public/index.html` beside the mobile `.play-console` layout: `SIDELINE BREADCRUMB — LIVE PLAYER TERMINAL`.
- `src/public/index.html` beside the Scoreboard/mobile-terminal render gate: pointer to the durable Settings IA breadcrumb.

Durable breadcrumb:

- `Project SOP/Breadcrumbs/Settings-Information-Architecture.md`

## Ownership-Map Result

The supplied ownership map was accurate. The implementation did not touch `player-roster.ts`, `player-activity.ts`, or `terminal-player.ts` because execution and output transport needed no change. The only additional presentation seam was a new body-level terminal host in `src/public/index.html`, required to make the existing nested terminal a true flex sibling of the existing Scoreboard on mobile.
