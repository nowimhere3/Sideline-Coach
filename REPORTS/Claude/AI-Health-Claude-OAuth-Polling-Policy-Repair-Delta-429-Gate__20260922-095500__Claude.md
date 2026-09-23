# AI Health — Claude OAuth Polling Policy: 429 Manual-Refresh Gate Delta

**Agent:** Claude Code (Sonnet)
**Game:** Sideline Coach
**Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**Continuation of:** `AI-Health-Claude-OAuth-Polling-Policy-Repair__20260922-093000__Claude.md`

## Was the hole real?

**Yes.** Before this delta, `applyOutcome()` only set `rateLimitedUntilMs` when the 429 response carried a usable `Retry-After` header:

```ts
if (outcome.code === 'rate_limited' && outcome.retryAfterMs) {
  this.rateLimitedUntilMs = this.now() + outcome.retryAfterMs;
}
```

`scheduleNext()` separately computed the fallback backoff rung (`5m/10m/20m/40m/60m`) for the *scheduler's own next timer*, but that computed value was never written back into `rateLimitedUntilMs`. So: 429 with no `Retry-After` → scheduler correctly waited its 5-minute rung, but `read()`'s gate check (`rateLimitedUntilMs !== undefined && now() < rateLimitedUntilMs`) saw `undefined` and let a manual `refresh()` straight through to a real fetch. Exactly the hole described.

## Exact change

Two edits to `src/control-plane/claude-usage-reader.ts`, both inside the existing `ClaudeUsageReader` class — no second timer, no second scheduler:

1. **`applyOutcome()`**: removed the `Retry-After`-only gate-setting. Gate-setting now happens in exactly one place.
2. **`scheduleNext()`**: after computing `delayMs` as `max(backoff rung, Retry-After)` (already the existing logic), it now also sets `this.rateLimitedUntilMs = this.now() + delayMs` whenever `outcome.code === 'rate_limited'` — regardless of whether a `Retry-After` was present. This directly implements the required contract: the gate is always `max(fallback backoff, valid Retry-After)`.

**A second issue surfaced while fixing the first one, and was fixed in the same edit:** naively calling `scheduleNext()` for the *synthetic* short-circuit outcome that `read()` returns while already gated (e.g. from a manual refresh pressed mid-gate) would have advanced `backoffIndex` and re-extended the gate on every such no-op check — escalating the ladder from requests that never reached the provider at all. Fixed by adding a `stillGated` branch to `scheduleNext()`:

```ts
const stillGated = this.rateLimitedUntilMs !== undefined && this.rateLimitedUntilMs > this.now();
...
} else if (stillGated) {
  // Reschedule for the remaining gate time only — never advance the ladder
  // or extend the gate for a request that never reached the provider.
  delayMs = this.rateLimitedUntilMs! - this.now();
}
```

This correctly distinguishes a real provider response from a short-circuited no-op: by the time `scheduleNext()` runs for a *real* fetch outcome, `read()` would only have proceeded to fetch if the gate was already `undefined` or in the past, so `stillGated` is false for every genuine provider response and true only for synthetic short-circuits.

## Contract, verified point by point

1. Manual Refresh joins/respects an active gate — unchanged, already correct (`read()`'s gate check).
2. Scheduler backoff on ordinary (non-429) failures — unchanged; `stillGated` is never true for those since `rateLimitedUntilMs` is only ever set for `rate_limited` outcomes.
3. **429 with no Retry-After now establishes the fallback gate** — the fix.
4. **Gate = max(fallback rung, valid Retry-After)** — the fix (delayMs already computed the max; now it's also written into the gate).
5. **Scheduler and Manual Refresh obey the same gate** — both go through `read()`'s single check.
6. **Success clears the gate and resets escalation** — unchanged (`applyOutcome`'s success branch already clears `rateLimitedUntilMs`; `scheduleNext`'s success branch already resets `backoffIndex = -1`).
7. **A short-circuited check never re-escalates the ladder** — the second fix, uncovered while verifying #3–#5.

## Tests

`test/claude-usage-reader.test.mjs` — replaced the now-incompatible `HTTP 429 specifically follows the same 5m -> 10m -> 20m backoff ladder without a usable Retry-After` test (it assumed every synthetic timer-fire was a real provider response, which is no longer true after the fix — a virtue, not a regression, since it's exactly the distinction the fix needed to get right) with one comprehensive test using an injectable, manually-advanced clock:

**`HTTP 429 without Retry-After: fallback gate blocks scheduler/manual reads until it expires, escalates 5m->10m->20m->40m->60m across repeats, and success clears/resets it`**
1. Startup 429 (no Retry-After) → one real fetch, gate set to 5m.
2. `reader.refresh()` called *while still gated* → fetch count stays at 1 (zero additional network requests), outcome is `rate_limited`, `changed: false`.
3. Clock advanced past the gate; the rescheduled timer fires → fetch count becomes 2 (a real request happened), and — since this is a genuine second consecutive 429 — the gate escalates to 10m.
4. Repeated for 20m, 40m, 60m (cap), and confirms it stays capped at 60m on a sixth consecutive 429.
5. A success clears the gate and returns the schedule to the configured 5-minute cadence.
6. A fresh 429 *after* that recovery restarts the ladder at 5m (not 10m), proving the escalation index was genuinely reset, not just the gate timestamp.

Retained and unchanged: `a valid Retry-After larger than the computed backoff step is honored` (single-shot, still passes as-is) and `manual refresh does not bypass an active provider rate-limit gate` (the simpler single-gate version of point 2 above, kept per the instruction not to remove existing coverage).

## Results

```
node --test test/claude-usage-reader.test.mjs
  ℹ tests 22
  ℹ pass 22
  ℹ fail 0

npm run compile   → clean

npm test (full suite)
  ℹ tests 1612
  ℹ pass 1604
  ℹ fail 8   (identical pre-existing, unrelated baseline failures — same 8 names as before this delta:
              SB-13, "10. Switching Game...", P26-P27, Q2.10C-13, Q2.10C-U3, E-24, C-18, F.3-6)
```

No new failures anywhere in the suite.

## Confirmation

No commit. No push.

C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\Claude\AI-Health-Claude-OAuth-Polling-Policy-Repair-Delta-429-Gate__20260922-095500__Claude.md
