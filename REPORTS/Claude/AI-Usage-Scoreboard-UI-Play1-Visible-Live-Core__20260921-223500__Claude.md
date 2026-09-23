# AI Usage Scoreboard — UI Play 1: Visible Live Core

**Date:** 2026-09-21
**Agent:** Claude Code (Claude Sonnet 5)
**Repo:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## Files Changed

1. `src/public/index.html` (CSS + markup + inline script only)
2. `test/ai-usage-scoreboard-ui.test.mjs` (new)

No backend files touched — this Play consumes the existing canonical seam (`GET /api/ai-health`, SSE `ai-health`) exactly as-is.

## Data Hydration / SSE Wiring

- `#aiScoreboardContainer` sits directly after `</header>` and before `#mainWorkflow`, in normal flow (no `position: fixed`/`absolute`) — it consumes real layout space and pushes `#mainWorkflow` down.
- `fetchAiHealth()` calls `GET /api/ai-health`, stores the returned `health` snapshot in `aiHealthSnapshot`, and redraws. It's invoked once inside the existing `refresh()` (alongside `/api/status` and `/api/reports`) — so it rides the same initial-load and reconnect (`hello` → `synchronizeAfterHello` → `refresh()`) path everything else uses.
- `connectEvents()` gained one new listener: `eventSource.addEventListener('ai-health', ...)` — parses `event.data` directly into `aiHealthSnapshot` and redraws. No additional fetch happens on push (confirmed by test SB-4).
- Last-known health stays in memory (`aiHealthSnapshot` is a plain module-level variable, never cleared on `onerror`/reconnect); reconnect re-hydrates authoritatively via the same `refresh()` call `hello` already triggers.
- No polling loop and no synthetic provider calls were added anywhere — the only two calls into the AI Health surface are the one-shot hydration call and the passive SSE listener (test SB-3 asserts exactly one `/api/ai-health` call after load).

## Claude Mapping (incl. flat fallback)

`aiScoreboardClaudeWindow(info, key)`:
- If `info[key]` is itself an object (dual-window retention's nested `five_hour`/`seven_day`), use it.
- Otherwise, if `info.rateLimitType === key`, the flat single-window frame *is* that window — used directly, never wrapped, never fabricated.
- Otherwise `undefined` → renders `UNKNOWN` for that window only; the other, known window still renders (test SB-6).

`used% = round(utilization * 100)`, `left% = 100 - used%`, reset = native `resetsAt`.

## Codex Mapping

`aiScoreboardCodexWindow(rateLimits, durationMins)` scans both `primary` and `secondary` and picks whichever has `windowDurationMins === durationMins` (300 → 5H, 10080 → WK) — identified by duration, never by slot position (test SB-7 deliberately puts the 5-hour window in `secondary` to prove this). `used% = usedPercent`, `left% = 100 - usedPercent`.

## Compact Scoreboard

Built once via `buildAiScoreboardDom()` (idempotent — guarded by `root.dataset.built`) so the shell exists immediately, before any health fact has ever arrived. Layout: `CLAUDE` row, `CODEX` row (each `5H <left>% · <reset>` │ `WK <left>% · <reset>`), then a `[Copy]` / `[Expand ▾]` action row. Compact starts collapsed (`#aiScoreboardExpanded[hidden]`, test SB-2). Dark panel styling (`.ai-scoreboard*` CSS) reuses the existing `--card-2`/`--line`/`--accent-2` tokens — no new palette, no traffic-light health colors, `tabular-nums` for numeric alignment.

## Expanded Scoreboard

`[Expand ▾]` toggles `#aiScoreboardExpanded` and flips the button to `Collapse ▴` (test SB-9). Contains, in a responsive 2-column grid:
- **Codex card** and **Claude card** — 5H left/used/reset/countdown, WK left/used/reset/countdown, plan type (Codex only, from `rateLimitInfo.planType`), observed/refreshed timestamp. Missing facts render `UNKNOWN`, never a fabricated number.
- **Local Time card** — full local date, large live clock, timezone (browser-local via `Intl.DateTimeFormat().resolvedOptions().timeZone`, per the packet's explicit instruction — this intentionally does **not** reuse the existing `formatHumanTime`/`America/Edmonton`-hardcoded helper, since that one is pinned to Dad's fixed home timezone rather than the browser's).
- **Action card** — "Copy Complete Context" (same handler as compact Copy) and a "Rehydrate" button that only calls `fetchAiHealth()` → `GET /api/ai-health` (no polling, correctly unlabeled as "Refresh").

## Copy Complete Context

`buildAiScoreboardCopyText()` builds the clipboard string entirely from `aiHealthSnapshot` (never from rendered DOM), in the exact section order from the packet's sample (Current local time → CODEX → CLAUDE → Usage data last refreshed). Each window line is `<label>: <left>% left | <used>% used`, `Resets: <weekday, month day at time>`, `Time until reset: in ...`; a missing window collapses to a single `<label>: UNKNOWN` line — never a fabricated `0%`. "Current local time" is generated at click time (`new Date()` in `aiScoreboardCopy`); "Usage data last refreshed" comes from the canonical `health.updatedAt`, not copy time (test SB-10 uses a `refreshedAt` 60s before "now" and asserts on the canonical line, not click time). On success the button text becomes `Copied ✓` for 1.5s then reverts (test SB-11).

## Live/Local Timing Behavior

One local ticker (`setInterval(..., 1_000)`, added at the bottom of the existing init block, right after `setInterval(tickElapsedClocks, 1_000)`) re-renders the Scoreboard only "if (aiHealthExpanded || aiHealthSnapshot)" — cheap, no network. It keeps Expanded countdowns and the live local clock current. It's a separate interval from the app's existing "ONE elapsed ticker" (`tickElapsedClocks`), which is explicitly documented as doing exactly one unrelated job (roster Working-strip elapsed text) — I left that contract alone rather than overload it.

## Focused Test Result

```
node --test test/ai-usage-scoreboard-ui.test.mjs
✔ SB-1  container sits in normal shell layout after header, before mainWorkflow
✔ SB-2  Compact defaults collapsed on load
✔ SB-3  initial hydration calls GET /api/ai-health, no provider polling afterward
✔ SB-4  `ai-health` SSE listener redraws without refetching
✔ SB-5  Claude dual-window: 5H + WK both map from nested windows
✔ SB-6  Claude flat single-window fallback: known window renders, other is UNKNOWN
✔ SB-7  Codex maps 5H/WK by windowDurationMins, not slot position
✔ SB-8  missing provider/window renders UNKNOWN, never a fabricated zero
✔ SB-9  Expand/Collapse wiring toggles the Expanded dashboard
✔ SB-10 Copy Complete Context: LEFT+USED, absolute reset+countdown, click-time local time, canonical (not copy-time) refresh timestamp
✔ SB-11 Copy briefly confirms "Copied ✓" then restores
tests 11, pass 11, fail 0
```

`npm run check` (tsc --noEmit) also passed clean (index.html is untyped markup/script; unaffected by the TS check, run only to confirm the untouched TS surface is still sound).

## Deviations / Blockers

- **Timezone**: used the browser-local timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) exactly as the packet specified, rather than reusing the codebase's existing `formatHumanTime`, which is hardcoded to `America/Edmonton`. This is a deliberate, packet-directed deviation from that existing convention, not an oversight — flagging it since a future Settings Play may want to reconcile the two.
- No other deviations. Settings/preferences (LEFT vs USED toggle, countdown mode in Compact, density, Top/Bottom placement) were explicitly out of scope and not touched.

## Exact UI Play 2 Handoff

Everything Play 2 needs is already structurally present and untouched-by-omission:
- Compact currently hardcodes LEFT/REMAINING percentage, absolute reset, `Claude, Codex` order, and TOP position — Play 2's Settings should read/write a preference object and have `renderAiScoreboard()`/`buildAiScoreboardDom()` branch on it (both are already the single source of truth for compact/expanded text, so Play 2 can extend them rather than rewrite).
- The Expanded Action card (`#aiScoreboardActionCard`) is structured to take more buttons/scopes without disruption (additional "copy scopes" from the packet's future list).
- No B-Team/Scouts/Router placeholder cards were added, per instruction — Play 2 will need to add new provider cards to the same `expanded.append(...)` list in `buildAiScoreboardDom()`.
- `aiHealthSnapshot` and `aiHealthExpanded` are the only two new module-level state variables; a Settings Play can add sibling state (e.g. `aiScoreboardPreferences`) beside them without restructuring.

AI USAGE SCOREBOARD UI PLAY 1 PASS

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Scoreboard-UI-Play1-Visible-Live-Core__20260921-223500__Claude.md
