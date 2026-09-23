# AI Usage Scoreboard — UI Play 1.1: Field Repair

**Date:** 2026-09-21
**Agent:** Claude Code (Claude Sonnet 5)
**Repo:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## Files Changed

1. `src/public/index.html` (timestamp normalization fix + visual repair, CSS/markup/inline script only)
2. `test/ai-usage-scoreboard-ui.test.mjs` (5 new focused tests, 1 assertion updated for the new text format)

No backend files touched.

## 1. Timestamp Bug — Root Cause

Confirmed against the actual runtime state file (`~/.sideline/ai-health-state.json`) written by this dev host:

```json
"primary":   { "usedPercent": 30, "windowDurationMins": 300,   "resetsAt": 1790058080 },
"secondary": { "usedPercent": 95, "windowDurationMins": 10080, "resetsAt": 1790118301 }
```

These are **Unix seconds** (10-digit values, matching Codex's native `account_rate_limits` facts). `aiScoreboardNormalize()` in Play 1 stored `win.resetsAt` verbatim and every formatter (`new Date(resetsAt)`) treated it as epoch **milliseconds**. `new Date(1790058080)` is `Wed Jan 21 1970 10:14:18 GMT-0700` — an exact match for the field-observed "Wednesday, January 21 at 10:14 AM" and the "in 0m" countdown (a date 56 years in the past clamps to `Math.max(0, ...)` = 0).

## Exact Timestamp Fix

Added one shared normalizer and made it the single point of truth:

```js
const aiScoreboardEpochMs = (resetsAt) => {
  if (!Number.isFinite(resetsAt)) return undefined;
  return resetsAt < 1e11 ? resetsAt * 1000 : resetsAt;
};
```

Called exactly once, inside `aiScoreboardNormalize()` (the one function every window — Claude and Codex — passes through before its `{ used, left, resetsAt }` result is used anywhere). Compact, Expanded, the countdown ticker, and Copy Complete Context all read `.resetsAt` only from that normalized object, so no duplicate conversion logic exists anywhere else — confirmed by grep before the fix (only one `win.resetsAt` assignment site existed).

Verified against the real field values: `1790058080 * 1000` → `2026-09-22T06:21:20.000Z` (Tue Sep 22, 12:21 AM America/Edmonton) and `1790118301 * 1000` → `2026-09-22T23:05:01.000Z` (Tue Sep 22, 5:05 PM America/Edmonton) — exact match to the known-good manual usage card in the field report.

The `< 1e11` threshold safely distinguishes Unix-seconds (~1.79 billion, 10 digits) from epoch-ms (~1.79 trillion, 13 digits) with an enormous margin — the crossover point is roughly the year 5138 in seconds vs. 1973 in ms, so no realistic timestamp from either provider is ambiguous.

## 2. Claude UNKNOWN — Root Cause (Diagnosis: B)

Traced the runtime seam end-to-end:

- `GET /api/ai-health` → `HealthAuthority.getSnapshot()` → the persisted state file, which is confirmed to contain **only** a `codex` entry; `providers.claude` is absent entirely (not present-but-malformed).
- Ingest path: `daemon.ts` `health.evidence` notification handler → `healthAuthority.ingest(p)`. This only fires when a session sends a `health.evidence` notification, which requires `session.features.includes('health.evidence.v1')`.
- Acquisition path: `stadium-client.ts#sendHealthEvidence()` is called from exactly one place for Claude — `src/player-control/structured-print.ts:485-491`, inside the stdout-frame parser for a **Sideline-launched Controlled Player child process** (`claude --print ...`). It only fires when that child process itself emits a native `rate_limit_event` JSON frame on stdout.

Conclusion: **B — the HealthAuthority genuinely contains no Claude evidence** because no Sideline-Controlled Claude Player subprocess that emitted a `rate_limit_event` frame has run in this dev host's current runtime. This interactive Claude Code session (the one doing this repair) is not a Sideline-launched Controlled Player — it never travels through `structured-print.ts`'s stdout capture — so it was never going to produce Claude evidence regardless of frontend correctness. The known-good manual usage card the field report cites proves current *account* truth exists, but that fact has no path into `HealthAuthority` today; that would require running a Controlled Claude Player through Sideline (or a new acquisition mechanism), which is explicitly out of scope for this UI repair per instruction.

**No repair was required or attempted for this** — it is a documented acquisition-path gap, not a bug. `providers.claude` absent → the Scoreboard correctly renders `UNKNOWN` for both Claude windows (never fabricated), exactly as Play 1 already specified. Test SB-15 locks in this UNKNOWN-not-fabricated behavior explicitly for the no-Claude-evidence case, using a Codex-only snapshot matching the real persisted state shape.

## 3. Visual Acceptance Repair

**Root cause of the "giant full-width button" complaint**: the global base stylesheet applies `button { width: 100%; padding: 12px 14px; font-weight: 800; background: var(--accent); }` to every `<button>` in the app. Play 1's `.ai-scoreboard-actions button` rule overrode height/padding/font-size/border but never `width` or `background`, so Compact's Copy/Expand buttons inherited full-bleed width and bright accent-green fill — reading as dominant chrome instead of secondary actions. Fixed with an explicit `width: auto`, transparent background, and muted color for `.ai-scoreboard-actions button` / `.ai-scoreboard-btn-ghost`.

Compact now has: a small uppercase "AI USAGE" title row with the (now properly secondary, right-aligned, auto-width) Copy/Expand actions beside it, then two provider rows in a `62px | 1fr` grid so `CLAUDE`/`CODEX` labels and their 5H/WK numbers align vertically — data reads first, actions read second.

Expanded now uses the target visual language: a 2-column (1-column below 560px) grid of provider cards, each with a colored identity badge + heading (Codex = cyan `--codex-accent`, Claude = amber `--claude-accent`, both new CSS custom properties layered on the existing dark-panel tokens — no new palette), then a `5-HOUR` block (large `left%` number, smaller `used%`, reset date, reset time on one line, countdown) with a divider, then a `WEEKLY` block in the same shape. Local Time and Action cards sit in a second row below the provider cards. No health-status colors (good/bad/critical), no football graphics — restrained instrumentation-panel styling using only tokens already in the file (`--card`, `--card-2`, `--line`, `--muted`, `--text`) plus the two new accent hues.

## Copy Verification

`buildAiScoreboardCopyText()` was not changed in Play 1.1 beyond inheriting the timestamp fix automatically (it reads `.resetsAt` from the same normalized window objects as every on-screen formatter — there was never a second, DOM-scraped code path to diverge). Test SB-14 explicitly re-verifies the clipboard text against the real field Unix-second values and confirms it reports `September 22`, not `January 21`/`1970`. Click-time local time, timezone, LEFT+USED, absolute reset, countdown, and canonical (non-copy-time) last-refreshed remain covered by the existing SB-10.

## Focused Test Results

```
node --test test/ai-usage-scoreboard-ui.test.mjs
✔ SB-1  … SB-11  (all Play 1 behaviors, still green; SB-9 assertion updated for the new "100%" text format)
✔ SB-12 Unix-second Codex resetsAt normalizes correctly in Compact, not epoch 1970
✔ SB-13 Unix-second Codex resetsAt normalizes correctly in Expanded reset + countdown
✔ SB-14 Copy Complete Context uses the same normalized reset as onscreen
✔ SB-15 Claude absent renders UNKNOWN everywhere, never fabricated, no extra fetch
tests 15, pass 15, fail 0
```

`npm run check` (tsc --noEmit) passed clean.

## Exact Remaining Blocker

None for Play 1.1's own scope. The one open item is **not a blocker** but a real, documented product gap: Claude usage facts have no acquisition path into `HealthAuthority` unless a Claude Player is run as a Sideline-Controlled Player. That is a backend/acquisition seam for a future Play, not something this UI repair could or should paper over.

## Is UI Play 2 Safe to Begin?

Yes. The Compact/Expanded structure, IDs, and state variables Play 2 (Settings) will extend are unchanged in shape from Play 1's handoff — only their internal text formatting and CSS classes changed. The timestamp fix is centralized, so Play 2's countdown-mode/preference work builds on already-correct reset math.

AI USAGE SCOREBOARD UI PLAY 1.1 PASS

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Usage-Scoreboard-UI-Play1-1-Field-Repair__20260921-235000__Claude.md
