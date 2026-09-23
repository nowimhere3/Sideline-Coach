# Claude Usage Accuracy + Live Freshness

**Player:** Claude Code (Opus 5.5, high) · **Date:** 2026-09-22 ~21:45 MDT · continues `Claude-5H-Post-Reset-Root-Cause-Repair__20260922__Claude.md` · **No commit, no push.**

## 1. Stage 1 root cause

`mergeClaudeRateLimitInfo` (`health-authority.ts`) treated any incoming window whose `resetsAt` was
**earlier than the stored one, even by one second**, as a stale replay from an older cycle, and kept the
stored value.

Claude's reset time for a single cycle **jitters by about 1–2 s** between sources and between reads:
- The OAuth endpoint returns fractional seconds that drift (`…11:59:59.723038+00:00`).
- The native push returns whole seconds.

So whenever the stored reset happened to land a second or two "later" than the fresh one, every fresh read
of that window was rejected until the actual reset. The window stayed frozen at an old percentage.

## 2. Why 5H moved (96 → 93) but Weekly stayed at 40%

Jitter luck.
- On Dad's manual Refresh at 03:06:04Z, the 5H reset came back 1 s *later* than stored, so it was accepted.
- The Weekly reset came back about 2 s *earlier* than stored, so it was rejected.

The 5H is exposed to the same freeze. It is now stored at …200, and my next live read returned …199, so
further 5H increases would also have been rejected.

## 3. First stale boundary

**HealthAuthority merge.** Everything upstream was correct:
- the provider returned 62%;
- the canonicalizer produced 0.62.

Everything downstream only exposes what the authority holds: `/api/ai-health` is a raw passthrough, and the
frontend normalizer is not involved.

## 4. Proof (one live read, 03:20Z; no token or credential printed)

| | five_hour | seven_day |
|---|---|---|
| raw OAuth | `utilization: 7`, `resets_at: 2026-09-23T07:39:59.723015+00:00` | `utilization: 62`, `resets_at: 2026-09-26T11:59:59.723038+00:00` |
| canonical | `0.07`, **1790149199** | `0.62`, **1790423999** |
| authority before merge (`~/.sideline/ai-health-state.json`) | `0.07`, **1790149200** | `0.60`, **1790424001** |
| merge rule `incoming < stored` | 199 < 200, so rejected (frozen) | 3999 < 4001, so **rejected (frozen at 60%)** |
| API / UI | what the authority holds | **40% left** |

Earlier evidence of the jitter: the 5H reset stored at 02:48 was 1790149199, and at 03:06 it was
1790149200, for the same cycle.

## 5. Manual Refresh, before vs after

**Before**
- It made a real OAuth read, but the merge could silently discard a window.
- The endpoint still said `unchanged` or `changed`.
- The button said **"Refreshed ✓"** on *any* HTTP 200, including 429 and failures. It ignored `acquisition`
  entirely. A correct formatter, `formatRefreshFeedback`, existed and was tested, but the page never used it.

**After**
- Resets within **15 minutes** count as the same cycle, so the fresh read always wins. Real cycles are at
  least 5 h apart, so a genuine older-cycle replay is still rejected.
- If only the reset jitter differs, the stored object is kept, so jitter alone never reports a false change.
- The fixed endpoint gives Dad's exact scenario **both** 7% and 62%.

## 6. Truthful Refresh status

- **Endpoint:** after a successful read, it checks that the authority now actually reflects every window
  the read returned (`claudeWindowsNotReflected`). If not, the outcome is **`retained`**, with
  `notReflected: ['seven_day']` and a reason.
- **Formatter:** the shared `formatRefreshFeedback` is now generic. It says "Refreshed ✓" only when every
  provider's read is `changed` or `unchanged`. Other outcomes are named, for example
  "Codex refreshed · Claude not updated" or "… Claude rate-limited".
- **Scoreboard:** the button uses the same logic (`aiScoreboardRefreshStatus`). It shows the error style
  for anything short of full success, and the tooltip says "… Showing last known usage."

## 7. Files changed

| file | change |
|---|---|
| `src/control-plane/health-authority.ts` | same-cycle tolerance in the Claude merge; exported `claudeWindowsNotReflected`; exported `ClaudeWindowKey`. Codex merge untouched. |
| `src/control-plane/daemon.ts` | refresh endpoint `retained` / `notReflected`; activity-watch wiring (option + start/stop + production entry). NUL byte preserved. |
| `src/control-plane/protocol.ts` | outcome types (`retained`, `auth_rejected`, `unavailable`, `notReflected`); generic `formatRefreshFeedback`. Existing strings unchanged. |
| `src/control-plane/claude-usage-reader.ts` | Stage 2: `noteClaudeActivity()`, `watchClaudeActivity()`, `defaultClaudeActivityDir()`. Also fixes a latent **duplicate polling chain**: `scheduleNext` now replaces any pending timer when two callers join one in-flight read. |
| `src/public/index.html` | Refresh button label and style driven by the real acquisition outcome. |
| tests | `claude-usage-reader-daemon`, `claude-usage-reader`, `ai-health-freshness-hardening` (test 11's fake reader claimed `changed` without ingesting; now it really ingests), `ai-usage-scoreboard-ui` (harness acquisition configurable + SB-19b) |

## 8. Focused tests

All 8 AI-health-related test files, run together: **171/171 pass**.
- `claude-usage-reader`
- `claude-usage-reader-daemon`
- `health-authority`
- `health-authority-daemon`
- `ai-health-freshness-hardening`
- `ai-usage-scoreboard-ui`
- `q2-10c-controlled-print`
- `stadium-bridge`

New seam tests:
- **Stage 1:** real `ClaudeUsageReader` → canonicalizer → daemon HealthAuthority →
  `POST /api/ai-health/refresh` → `GET /api/ai-health`.
  - Stored state: 4% / 60% with resets +1 s / +2 s.
  - The provider returns 7% / 62% with `…:59.723Z` resets.
  - The test asserts **both** 0.07 and 0.62, plus outcome `changed`.
- **Truthfulness:** a genuine older-cycle Weekly gives `retained` with `notReflected: ['seven_day']` and
  never "Refreshed ✓", while the 5H in the same read still updates.
- **Stage 2 (unit):**
  - a burst of activity coalesces into one read;
  - reads are at least 90 s apart;
  - continuous work reads again within 2 min;
  - Retry-After is never bypassed;
  - `stop()` cancels a pending read;
  - after an activity read, exactly one cadence chain remains.
- **Stage 2 (seam):** real daemon, real `fs.watch` on a temp transcript dir. A `.jsonl` append alone moves
  `/api/ai-health` to 7% / 62%. There is no Refresh, and the cadence timers are parked.

**Negative controls.** Each fix was disabled in the compiled output only, then recompiled back in:
- Without the same-cycle rule, the Stage 1 seam test fails. The endpoint truthfully reports `retained`.
- Without the watch wiring, the Stage 2 seam test fails with no convergence.

## 9. Compile

`npm run compile` (tsc) is clean.

## 10. Stage 2: mechanism and results

- **Sideline-controlled Claude Players** already push the native `rate_limit_event`, whose
  `unifiedWindows.{five_hour,seven_day}` carry utilization as a fraction and resets as whole seconds.
  - Confirmed in the installed Claude Code 2.1.280 and in AI Usage Real Time's captured fixture.
  - Before tonight, push (whole-second resets) and OAuth (jittered resets) could freeze each other through
    the same rule. With the same-cycle fix they now converge.
- **Claude work outside Sideline** (Dad's terminal sessions, like this one) produces no push. It does append
  to Claude Code's own transcripts.
  - The daemon now watches `%CLAUDE_CONFIG_DIR%\projects` (default `~/.claude/projects`) for `*.jsonl`
    writes. It reads no file content; the write is only a signal.
  - It then does **one** normal OAuth read once activity has been quiet for 15 s, or after at most 2 min of
    continuous work. Reads are never sooner than 90 s after the previous attempt.
  - Every read honors the provider Retry-After and the fallback gate, and then restarts the normal cadence.
- There are no inference turns and no shorter global cadence. When idle, the read rate is unchanged.
- **Kill switch:** `SIDELINE_CLAUDE_ACTIVITY=0`.

## 11. Dad field test

1. **Developer Reload once**, then refresh the browser. The daemon hands over on build mismatch.
   - Its first read should immediately correct Weekly: stored …4001 vs provider …3999 now counts as the
     same cycle.
2. Use Claude (any terminal session). Then open, in this order:
   - **official Claude Usage**;
   - **AI Usage Real Time**, refreshed;
   - the **Sideline Scoreboard**, *without* pressing Refresh, about 20–30 s after Claude stops working.
3. **Expect:** Sideline 5H and Weekly match official Claude within its rounding. AI Usage Real Time should
   agree, since it reads the same endpoint.
4. Press **Refresh** in Sideline.
   - **Expect** "Refreshed ✓" and the same numbers.
   - If it ever says "Claude not updated" or "Claude rate-limited", that is now the truth, and the card is
     showing last known values.
5. **Optional:** `~/.sideline/logs/control-plane.log` shows a
   `[claude-usage-reader] shape:` line shortly after each burst of Claude work, not only on 5-minute
   boundaries.

## Remaining risk

- **OAuth budget is shared.** The same budget is used by AI Usage Real Time and Claude Code's `/usage`.
  - 429s have already occurred at the 5-minute cadence alone (23:25Z, 03:02Z).
  - The activity path raises the read rate during active work to at most about 1 per 90 s.
  - Retry-After is always honored. If 429s become frequent, raise `CLAUDE_ACTIVITY_MIN_SPACING_MS` or set
    `SIDELINE_CLAUDE_ACTIVITY=0`.
- **Earlier automatic 5H lag.** I cannot say read-by-read how much came from cadence or 429 and how much
  from the jitter freeze, because the log does not record values. The log shows a 429 provider gate at
  03:02:31, a daemon restart, and another 429. The jitter freeze demonstrably affected both windows.
- **Codex** has the same strict `<` rule, deliberately not touched. Its resets looked stable in the field.
- **Untracked files.** The AI Health files (`claude-usage-reader.ts`, `health-authority.ts`,
  `codex-usage-reader.ts`, reader tests) are still **untracked**. Checkpoint-commit them soon.
