# Claude 5H Post-Reset Root-Cause Repair

**Player:** Claude Code (Opus 5.5, high) · **Date:** 2026-09-22 ~21:15 MDT · **No commit, no push.**

## 1. Exact root cause

The provider does **not** omit `five_hour` after a reset. It sends
`five_hour: { utilization: 0, resets_at: null }`.

`canonicalWindowFromOAuth` (`src/control-plane/claude-usage-reader.ts`) rejected any window whose
`resets_at` was not a parseable date string. So this positive "not started" evidence from the provider
was thrown away as invalid, and the reader then reported it as an omission (`five_hour_present=false`).

After that, HealthAuthority can only produce the idle state if it still remembers an expired prior 5H
cycle, from its own lifecycle bookkeeping. The field daemon had no such memory:

| Time (UTC) | Daemon | Event |
|---|---|---|
| 09-22 14:50 | PID 17540 (build from that morning) | started |
| 09-23 ~00:00 | 17540 | 5H reset. Reader log flips to `five_hour_present=false`. The old build pruned the expired window without recording `lastExpiredFiveHourResetsAt`, then persisted that state. |
| 00:33 / 01:03 | 2076 / 36336 | restarts, still no 5H memory |
| 02:33:21 | — | current `out/` compiled (includes the tracking fix) |
| 02:33:29 → 02:48 | PID 60128 (**current code**) | 4 successful reads, all `five_hour_present=false`. No lifecycle proof, so it showed **UNKNOWN** while official Claude showed "0% used". |
| 02:48:30 | 60128 | `five_hour` active (resetsAt 07:39:59Z). This session's first message started a new window. |

**Proof of the provider shape.** Proven from the installed Claude Code 2.1.280 `/usage` renderer:
- The "Current session" row renders only when `five_hour` is a truthy object: `return it && e(Wt,{…limit:P.five_hour…})`.
- The "Resets …" text appears only when `resets_at` is truthy: `if(O){… K=\`Resets ${ne}\`}`.

So "Current session 0% used" with no reset line can only come from `{utilization: 0, resets_at: null}`.
The earlier Scout conclusion that "Anthropic may omit five_hour" was an artifact of our own canonicalizer's
logging, not a raw provider fact.

## 2. First broken boundary

**Production acquisition → canonicalization (option C, acquisition-result semantics).**
- Everything downstream already handled `{utilization:0, resetsAt:null}` correctly: the HealthAuthority
  merge, persistence and restore, `/api/ai-health` (a raw snapshot passthrough), and the frontend
  `aiScoreboardNormalize` (renders 100% left / 0% used / Reset UNKNOWN).
- The idle state never reached those layers because it was dropped at the first hop.

## 3. Why the tests passed while the field failed

The tests modeled the wrong provider fact. Their fixtures:
- **omitted** `five_hour` entirely, when the provider actually sends it with `resets_at: null`;
- **pre-seeded** the same HealthAuthority with an expired active 5H, which is exactly the Sideline-local
  memory the field daemon had lost to the older build.

No test ever passed the provider's real idle payload through the real canonicalizer.

## 4. Files changed

- `src/control-plane/claude-usage-reader.ts`
  - `canonicalWindowFromOAuth` maps exactly `utilization === 0 && resets_at === null` to
    `{utilization: 0, resetsAt: null}`.
  - Every other null or absent reset is still invalid, so it stays UNKNOWN.
  - The shape log line gains `five_hour_not_started=` for field diagnosis.
- `src/control-plane/health-authority.ts`
  - One freshness guard (`staleIdle`): an incoming provider idle frame cannot overwrite a stored
    **unexpired** active 5H cycle.
  - This is needed now that the provider idle frame can reach the merge directly. Without it, a lagging
    OAuth read could briefly flap a just-started cycle back to idle.
- `test/claude-usage-reader.test.mjs`: canonicalizer contract test, covering the idle shape kept plus the
  `{12, null}`, `{0}` and `null` cases rejected.
- `test/claude-usage-reader-daemon.test.mjs`: new end-to-end field-seam test.
  - Chain under test: **real** `ClaudeUsageReader` + canonicalizer → real daemon HealthAuthority →
    `POST /api/ai-health/refresh` → `GET /api/ai-health` → daemon restart from the persisted file.
  - It is seeded with the exact field state: weekly only, no 5H, no expired-cycle memory.
  - It asserts four things:
    - the idle state appears;
    - it survives the restart;
    - a first real 5H replaces it without a reload;
    - a lagging idle frame cannot overwrite the running cycle.

Polling, the Scoreboard UI, Codex, and the other working-tree changes were not touched.

## 5. Focused tests

`node --test` run over these files:
- `claude-usage-reader`
- `claude-usage-reader-daemon`
- `health-authority`
- `ai-health-freshness-hardening`
- `ai-usage-scoreboard-ui`

Result: **114/114 pass**.

**Negative control:** with the canonicalizer fix disabled in the compiled output, the new seam test fails
with `five_hour` = `undefined` from `/api/ai-health`. That is the exact field UNKNOWN. The fix was then
recompiled back in.

## 6. Compile

`npm run compile` (tsc) is clean.

## 7. Dad field verification

This needs a real post-reset window, where official Claude shows "0% used · Starts with your first
message". The current window started at 02:40Z and resets at **07:39:59Z (01:39:59 MDT)**. After that time,
and **before sending any Claude message**:

1. Developer Reload once, so the daemon picks up the new build through its build-mismatch handoff. Refresh
   the browser.
2. Press Refresh on the Scoreboard, or wait at most 5 minutes.
3. Expect Claude 5-HOUR to show **100% left · 0% used · Reset UNKNOWN**. Weekly is unchanged.
4. Optional check: `~/.sideline/logs/control-plane.log` shows
   `five_hour_present=true five_hour_not_started=true`.
5. Send one Claude message, then Refresh. 5-HOUR should switch to real usage with a real reset, with no
   reload.
6. Restart the Dev Host between steps 3 and 5 (optional). Idle should still show after the restart.

## 8. Remaining risk

- **Untracked files.** `claude-usage-reader.ts`, `health-authority.ts`, `codex-usage-reader.ts` and both
  reader test files are **untracked** in git. A destructive clean or reset would erase the whole AI Health
  stack, not just this fix. Checkpoint-commit them soon.
- **Undocumented endpoint.** The provider shape is inferred from Claude Code's own renderer, not from a raw
  payload captured by Sideline. The new log field will confirm it on the next real reset.
- **If the endpoint ever truly omits `five_hour`,** the existing lifecycle-memory path still applies
  unchanged. With no memory, the display is UNKNOWN by contract.
