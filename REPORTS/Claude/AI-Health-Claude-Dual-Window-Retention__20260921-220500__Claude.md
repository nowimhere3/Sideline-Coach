# AI Health — Claude Dual-Window Retention

**Date:** 2026-09-21
**Agent:** Claude Code (Claude Sonnet 5)
**Repo:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## Files Changed

1. `src/control-plane/health-authority.ts`
2. `test/health-authority.test.mjs`

## Old Overwrite Behavior

`ingest()` stored `rateLimitInfo` as a single wholesale replacement of `evidence.rate_limit_info` on every Claude ingest. A `five_hour` frame arriving and then a `seven_day` frame arriving meant the `five_hour` frame was discarded — only the most recent native window survived in state.

## New Dual-Window Behavior

Added `mergeClaudeRateLimitInfo()` (plus helpers `claudeWindowKey()` and `extractClaudeWindows()`) in `health-authority.ts`, called only for `provider === 'claude'` during `ingest()`:

- If incoming `rate_limit_info.rateLimitType` is not `'five_hour'` or `'seven_day'`, behavior is unchanged: the raw object fully replaces the prior one (legacy/back-compat path, e.g. state with no `rateLimitType` at all).
- If incoming evidence carries a recognized window type, the authority looks at the previously stored `rateLimitInfo` to recover any known windows (either already-nested `five_hour`/`seven_day` keys, or a legacy single-window object inferred from its own `rateLimitType`).
- With only one window ever observed, `rateLimitInfo` stays exactly the raw native frame (no wrapper) — preserves the existing single-window shape/tests.
- Once both windows have been observed at least once, `rateLimitInfo` becomes `{ ...latestIncomingFrame, five_hour: {...}, seven_day: {...} }` — top-level fields reflect the most recent observation (whichever window just arrived), and both windows remain addressable by key, each retaining its own `utilization` / `resetsAt` / `rateLimitType`.
- Each window updates independently: ingesting a new `five_hour` frame after both are known does not touch the stored `seven_day` frame, and vice versa.

No normalization, percentages, health classification, or policy fields were added — only factual provider-native nesting.

## Schema Compatibility

`schemaVersion` remains `1`. `rateLimitInfo` was already a bounded `Record<string, unknown>`; nesting `five_hour`/`seven_day` objects inside it is additive and passes the existing `validBoundedObject`/`boundedCopy` depth (≤4) and size checks unchanged. No migration machinery was added.

## Replay Suppression

Unchanged mechanism: `ingest()` still compares the full factual object (`provider`, `evidenceType`, computed `rateLimitInfo`, `source`) against the previous state (excluding `observedAt`) and returns `false`/skips `onChange` on an exact match. Because the merge function is deterministic given the same previous+incoming inputs, an identical replay of either window produces an identical merged `rateLimitInfo`, so replay suppression now works per-window with no false `onChange`/save.

## Persistence Compatibility

`fileHealthStateStore` save/load logic is untouched. Both windows persist and restore together as part of the same `rateLimitInfo` object. Older schema-v1 state containing only a flat, single-window `rateLimitInfo` (no nested keys) continues to load and validate normally via `validProviderState`/`validBoundedObject` — no quarantine is triggered solely by the presence (or absence) of nested window keys.

## Focused Test Result

```
node --test test/health-authority.test.mjs
✔ missing file initializes cleanly
✔ valid Claude facts remain provider-native, neutral, replay-stable, replaceable, and defensively copied
✔ Codex coexists with Claude, updates independently, and suppresses provider-specific replay
✔ Claude replay is source-specific, factual, neutral, and observed at ingestion time
✔ Claude retains both five_hour and seven_day windows simultaneously, and each replays independently
✔ Codex rate limits remain unaffected by Claude dual-window retention
✔ atomic save writes valid JSON and restores into a new Authority
✔ corrupt JSON and unsupported newer schema are quarantined and start clean
✔ persistence failure leaves good in-memory state intact
tests 9, pass 9, fail 0
```

`npm run check` (tsc --noEmit) also passed clean.

## Exact UI Play 1 Handoff

`GET /api/ai-health` and the `ai-health` SSE event now deliver, for a Claude provider that has observed both windows:

```json
{
  "providers": {
    "claude": {
      "rateLimitInfo": {
        "...latest window's own fields (rateLimitType, utilization, resetsAt, etc.)": "...",
        "five_hour": { "rateLimitType": "five_hour", "utilization": 1.0, "resetsAt": 111, "...": "..." },
        "seven_day": { "rateLimitType": "seven_day", "utilization": 0.57, "resetsAt": 222, "...": "..." }
      }
    }
  }
}
```

UI Play 1 can read `providers.claude.rateLimitInfo.five_hour` and `providers.claude.rateLimitInfo.seven_day` directly to render:

```
CLAUDE
5H <five_hour.utilization> · <five_hour.resetsAt>
WK <seven_day.utilization> · <seven_day.resetsAt>
```

If only one window has ever been observed, `rateLimitInfo` has no `five_hour`/`seven_day` keys yet (it *is* the raw single-window frame) — UI should treat the other window as UNKNOWN until nested keys appear, i.e. check for the nested key's presence before rendering that half of the scoreboard.

CLAUDE DUAL-WINDOW RETENTION PASS
