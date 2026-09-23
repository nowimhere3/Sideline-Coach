# AI Health — Claude Real-Shape Repair (Play 1)

**Agent:** Claude Code (Sonnet)
**Game:** Ai Usage - Real Time
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

## Root cause confirmed

Real Claude health evidence has always been persisted to `~/.sideline/ai-health-state.json`, but it arrives shaped as:

```
rateLimitInfo.unifiedWindows.five_hour  = { utilization: 0-1 fraction, resetsAt: unix seconds }
rateLimitInfo.unifiedWindows.seven_day  = { utilization: 0-1 fraction, resetsAt: unix seconds }
```

Both the Scoreboard's window reader and `HealthAuthority`'s merge/dedupe logic only ever looked at flat `info[key]` / `info.rateLimitType`, never at `info.unifiedWindows`. Real evidence fell through every case, so the Scoreboard rendered `UNKNOWN` even though correct data was already on disk.

## Changes made

**`src/public/index.html`** — `aiScoreboardClaudeWindow(info, key)` now checks, in order: `info.unifiedWindows?.[key]` (real shape) → `info[key]` (legacy dual-window nesting) → `info.rateLimitType === key` (legacy flat single-window). All existing fallbacks are preserved.

**`src/control-plane/health-authority.ts`**
- `extractClaudeWindows(info)` is the new canonical window reader, same three-tier order as the UI.
- `mergeClaudeRateLimitInfo(previous, incoming)` now merges *per window*: `{ ...extractClaudeWindows(previous), ...extractClaudeWindows(incoming) }`, so a window missing from the incoming event preserves the last known value of the other window. Output always carries canonical `unifiedWindows.five_hour` / `unifiedWindows.seven_day` alongside whatever top-level legacy fields (`rateLimitType`, `status`, etc.) the incoming evidence had, when at least one window was recognized. If no window shape is recognized at all (fully unknown payload), the incoming object passes through unchanged, as before.
- `claudeRateLimitInfoUnchanged(previous, next)` replaces the old full-object dedupe for Claude: it compares canonical windows only, so identical health reported from a different `playerInstanceId`/source no longer registers as a false change (per spec: "compare canonical quota windows rather than source/provenance noise"). Falls back to comparing raw facts only when neither side has recognizable window structure, so genuinely different unknown-shape payloads are never mistaken for a replay (this fallback was required to keep `health-authority-daemon.test.mjs`'s flat-utilization-only fixture passing).
- Codex's dedupe/merge path is untouched.

## Test changes

`test/health-authority.test.mjs` — rewritten around the real `unifiedWindows` fixture shape (mirroring `Ai Usage - Real Time/test/fixtures/claude-rate-limit-event.json`) as the primary case. Added:
- real event renders/persists both windows, replay-stable, defensively copied
- partial incoming (legacy flat single-window) evidence preserves the other last-known `unifiedWindows` window
- one kept legacy-flat test: single flat `rateLimitType` frame with no `unifiedWindows` still loads and normalizes into canonical `unifiedWindows`
- dedupe is now source/provenance-agnostic for Claude (rewrote the test that previously asserted source-specific replay, since that behavior was the bug this Play targets)
- dual-window accumulation from two successive legacy flat frames, Codex non-interference — all updated to assert against `unifiedWindows.*` instead of flat top-level keys

`test/ai-usage-scoreboard-ui.test.mjs` — added **SB-5a**: a real Claude `unifiedWindows` event renders both `5H` and `WK` instead of `UNKNOWN`. Existing SB-5/SB-6 (legacy nested/flat fallback) left intact and still passing.

No fixture/test changes were needed for `health-authority-daemon.test.mjs`, `stadium-bridge.test.mjs`, or Codex — confirmed unaffected.

## Verification

- `npm run compile` — clean.
- Focused run (`test/health-authority.test.mjs`, `test/health-authority-daemon.test.mjs`, `test/ai-usage-scoreboard-ui.test.mjs`): all green.
- `npm test` (full suite): **1533/1541 passing**. The 8 failures are pre-existing and unrelated to this Play (extension registration-pattern assertions, work-ledger/terminal-restart flow, activity-strip ticker counts, and one wall-clock-dependent Codex countdown test in `ai-usage-scoreboard-ui.test.mjs` — none involve Claude window shape or `HealthAuthority`). Verified the failure count was 8 before and after this change.
- Read the live `~/.sideline/ai-health-state.json`: the currently persisted Claude record already has the exact `rateLimitInfo.unifiedWindows.{five_hour,seven_day}` shape this fix reads, with real `utilization`/`resetsAt` values for both windows (5H: 0.15, WK: 0.43) — confirming field acceptance is a daemon/extension restart away, no invented values used.

## Scope discipline

No OAuth reader, no refresh-cadence change, no new provider endpoints, no routing changes, no Codex changes, no Scoreboard visual/settings redesign. No commit made.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Health-Claude-Real-Shape-Repair__20260922-053000__Claude.md
