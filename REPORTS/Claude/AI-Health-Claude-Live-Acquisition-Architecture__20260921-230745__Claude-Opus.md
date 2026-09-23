# AI Health — Claude Live Acquisition Architecture

**Author:** Claude Code (Opus) · **Role:** Principal architect · **Date:** 2026-09-21
**Status:** Decision only. Nothing implemented, committed, or pushed.

---

## 1. ROOT CAUSE SUMMARY

**Finding: native push works. The Scoreboard reads the wrong field.**

`~/.sideline/ai-health-state.json` already holds a real Claude record, ingested from the controlled Play:

```
providers.claude.observedAt = 2026-09-22T04:16:49.742Z
source.playerInstanceId     = claude-ac759568
rateLimitInfo.rateLimitType = "five_hour"
rateLimitInfo.unifiedWindows.five_hour = { utilization: 0.15, resetsAt: 1790059200 }
rateLimitInfo.unifiedWindows.seven_day = { utilization: 0.43, resetsAt: 1790424000 }
```

So this path worked end to end: `structured-print.ts:485` → `stadium-client.ts:418` → `daemon.ts:921` → `HealthAuthority.ingest` → persistence. The report that the field test produced no Claude evidence is wrong, at least for this run.

**Why the Scoreboard shows UNKNOWN:** `aiScoreboardClaudeWindow` (`src/public/index.html:4500`) checks only two places:
- `info[key]`, meaning `info.five_hour`. The real event has no such field.
- `info.rateLimitType === key ? info : …`. For five_hour this returns the top-level object, which has no `utilization`, so the result is undefined and the window shows UNKNOWN. For seven_day there is no match, so it also shows UNKNOWN.

The real data sits under `unifiedWindows`, and nothing reads that. The tests passed because the fixtures (`utilization: 0.42` at the top level) use a shape that Claude never actually sends.

**Other defects:**
1. **HealthAuthority merge doesn't know about `unifiedWindows`.** `extractClaudeWindows` looks only at `info.five_hour` and `info.seven_day`. Real events carry both windows, so nothing is lost today. A partial event would drop the last known value of the other window.
2. **Push only fires during Sideline Plays.** It can never see Claude usage outside Sideline. That's the product gap, and it's why a global reader is needed.
3. **Dedupe compares the whole record, including `source` and extra fields.** If push and a reader both feed the same authority, the source and field set change on every alternation, so each one looks like a change. That means SSE and persistence churn even when the numbers haven't moved.

---

## 2. FINAL ACQUISITION ARCHITECTURE

The candidate is **confirmed, with one change:** both sources are normalized into one **canonical Claude window shape** before the authority stores anything.

```
Claude rate_limit_event (push, during Plays) ─┐
                                              ├─► canonical Claude windows ─► HealthAuthority.ingest
ClaudeUsageReader (global OAuth read) ────────┘      (dedupe on windows only)
                                                              │
                                   onChange ─► persistence (debounced) + SSE 'ai-health'
                                                              │
                                              /api/ai-health  ─► Scoreboard (one normalizer)
```

- **Push** stays the way it is. It's the lowest-latency source and costs nothing extra.
- **The reader** is the source of truth for Claude usage outside Sideline. It sends no inference request, so it consumes no usage.
- **HealthAuthority** stays a store of facts. It gets canonicalization, window merge, and a change check. It gets no scheduling and no routing policy.

---

## 3. GLOBAL OWNER / LIFECYCLE

- **Owner:** `ControlPlaneDaemon` creates exactly one `ClaudeUsageReader`, next to `healthAuthority`. There is one daemon per machine, so there is one reader. Stadiums, Games, and browsers never poll.
- **Enablement:** off by default in the constructor, so existing daemon tests never touch the network or the real credentials. It's enabled only in the production entry (`daemon.ts:3680`, the `require.main` block) through `DaemonOptions.claudeUsage = { enabled: true }`. `SIDELINE_CLAUDE_USAGE=0` turns it off.
- **start():** called at the end of `daemon.start()`. It runs one acquisition right away at startup, then a `setTimeout` chain (not `setInterval`). Every timer calls `unref()`.
- **stop():** called from `daemon.stop()` (`:508`) and from `cleanExitHandler` (`:678`). It clears the timer and aborts any request in flight.
- **In-flight dedupe:** a single `inFlight` promise. A scheduled tick or a manual refresh that arrives mid-request joins it instead of starting another request.

---

## 4. RECOMMENDED REFRESH CADENCE

**What's known about the provider:**
- `GET https://api.anthropic.com/api/oauth/usage` with `anthropic-beta: oauth-2025-04-20` is **undocumented**. Anthropic publishes no rate limit or safe polling interval for it.
- It uses no model inference.
- In real payloads (`claude-oauth-normal.json`), `utilization` is a **percent from 0 to 100**. `resets_at` is an **ISO string**.

**Engineering recommendation (not a provider guarantee):**

| Setting | Value |
|---|---|
| Base cadence | **15 s**. That's 240 requests an hour, near-live without much load on an undocumented endpoint. |
| Floor | 10 s. Enforced even for config overrides. 5 s is too aggressive for an endpoint with no published limit. |
| Backoff on failure | 30 s → 60 s → 120 s → 300 s cap. On HTTP 429, honor `Retry-After` when it's larger. |
| Recovery | After the first success, go straight back to 15 s. |
| Startup | One immediate acquisition. |
| Manual | Forced read (§6). |

During Plays, push already gives sub-second updates. Outside Sideline, the reader's 15 s interval is the worst-case lag. Keep the cadence as one constant (`CLAUDE_USAGE_INTERVAL_MS`) so it can be tuned after field observation.

---

## 5. REAL CLAUDE DATA SHAPE CONTRACT

The authority accepts only real provider shapes. The fake flat shape is no longer authoritative.

**A. Push, from `rate_limit_event`** (reference: `Ai Usage - Real Time/test/fixtures/claude-rate-limit-event.json`)
```
rate_limit_info.unifiedWindows.five_hour = { utilization: <0..1 fraction>, resetsAt: <unix seconds> }
rate_limit_info.unifiedWindows.seven_day = { utilization: <0..1 fraction>, resetsAt: <unix seconds> }
(+ status, rateLimitType, overageStatus, … : kept as extra fields, not used for dedupe)
```

**B. OAuth read**
```
payload.five_hour = { utilization: <0..100 percent>, resets_at: <ISO string> }
payload.seven_day = { utilization: <0..100 percent>, resets_at: <ISO string> }
```

**Canonical stored form.** Both sources map to the push-native shape, so the Scoreboard needs only one normalizer:
```
rateLimitInfo.unifiedWindows.{five_hour|seven_day} = { utilization: fraction 0..1, resetsAt: unix seconds }
```
- The reader converts percent → `percent / 100` and ISO → `Math.floor(Date.parse(iso) / 1000)`.
- A window that is missing or invalid is **omitted**, never zero-filled.
- The authority merges per window. When a window is missing from the incoming evidence, it keeps the last known value for that window.
- **Dedupe** compares only the canonical `unifiedWindows`, with utilization rounded to 4 decimal places. It ignores `source`, `status`, and overage fields. When the windows haven't changed, `ingest` returns false: no SSE broadcast, no save.

**Evidence types** (`protocol.ts`):
- The Claude evidence union gains `{ provider:'claude', type:'oauth_usage', usage: Record<string,unknown> }`.
- The stored `evidenceType` is either `'rate_limit_event'` or `'oauth_usage'`. It records the provenance of the most recent change.
- `schemaVersion` stays 1. The change is additive, and the validator accepts both values.

**Source** (`health-authority.ts`):
- `ProviderHealthSource` becomes a union with `{ kind: 'control-plane', reader: 'claude-oauth-usage' }`.
- No sentinel game or player IDs.

---

## 6. MANUAL REFRESH CONTRACT

There are two distinct operations:

| Operation | Endpoint | Behavior |
|---|---|---|
| Read cached state | `GET /api/ai-health` (unchanged) | Returns the snapshot. Used for initial hydration and SSE reconnect. **No button.** |
| **Refresh Health** | `POST /api/ai-health/refresh` (token-guarded like other mutating routes) | Makes a forced provider read, ingests it, and broadcasts over SSE if anything changed. |

**Refresh behavior:**
- It skips the backoff *timer* but still respects an active 429 `Retry-After`. In that case it returns `rate_limited` without calling the endpoint.
- It joins a request already in flight.
- After it finishes, the scheduled cadence restarts from now.

**Response:**
```json
{ "success": true,
  "health": <HealthAuthoritySnapshot>,
  "acquisition": { "claude": { "outcome": "changed|unchanged|unavailable|rate_limited",
                               "reason": "<code, optional>", "checkedAt": "<ISO>" } } }
```

**UI:** relabel `aiScoreboardRehydrateBtn` as **Refresh Health**. It POSTs, then renders `health` from the response. Codex needs no change.

---

## 7. AUTH / FAILURE / LAST-KNOWN RULES

**Credentials:**
- Read `~/.claude/.credentials.json`, honoring `CLAUDE_CONFIG_DIR`, then `claudeAiOauth.accessToken`.
- The file is read fresh on each attempt, so tokens that Claude Code has rotated get picked up automatically.
- On macOS the credentials live in the Keychain, which is out of scope. The reader reports `credentials_unreadable` there.

**Never refresh the token.** Rotating the refresh token would log out the user's own Claude Code session. If `expiresAt ≤ now`, report `credential_expired` and wait. The next Claude Code use rewrites the file.

**Failures:**
- HTTP 401 or 403 → `auth_rejected`, then back off.
- Timeout (10 s) or network error → back off.
- Malformed JSON or payload → `malformed_response`, then back off.

**Last known value:** no failure ever calls `ingest`. The last good facts stay in the authority and in persistence.

**Status visibility:** the reader holds a small in-memory status: `{ state, reason, lastAttemptAt, lastSuccessAt }`.
- It appears on `GET /api/ai-health` as a sibling `acquisition` field and in the refresh response.
- It goes out over SSE **only when the state changes**, never on every tick.
- It is not persisted and not part of HealthAuthority.

**Secrets:**
- The token lives only in local scope inside the fetch call.
- Never logged, returned, persisted, or included in error text.
- Reason codes are fixed strings.
- A test asserts the token never appears in logs, snapshots, or responses.

---

## 8. EXACT FILES + SYMBOLS TO TOUCH

| File | Change |
|---|---|
| `src/control-plane/claude-usage-reader.ts` **(new)** | `ClaudeUsageReader` with `start`, `stop`, and `refresh({force})`. It holds the `inFlight` promise, the backoff schedule, and the status. Also `readClaudeUsageOnce(opts)`, ported from `Ai Usage - Real Time/src/providers/claude.js` `collectClaudeUsage`, and `canonicalClaudeWindowsFromOAuth(payload)`. Injectable: `fetchImpl`, `readFileImpl`, `now`, `setTimer`/`clearTimer`, `intervalMs`, `credentialPath`. |
| `src/control-plane/protocol.ts` | `ClaudeHealthEvidence` becomes a union adding `type:'oauth_usage'`. |
| `src/control-plane/health-authority.ts` | `ClaudeProviderHealthState.evidenceType` and `source` become unions. Add an `ingestAcquired(evidence, source)` entry point, or extend `ingest` to accept the control-plane source. `canonicalClaudeWindows(info)` reads `unifiedWindows`. `mergeClaudeRateLimitInfo` merges per window on `unifiedWindows`. Dedupe compares canonical windows only for Claude. `validClaudeEvidence`, `validProviderState`, and `validSource` are updated. |
| `src/control-plane/daemon.ts` | Add `DaemonOptions.claudeUsage`. Create the reader after `healthAuthority`, `start()` it in `start()`, and stop it in `stop()` and `cleanExitHandler`. Add the `POST /api/ai-health/refresh` route next to `:1020`, and an `acquisition` field on the GET. `isHealthEvidence` (`:3651`) accepts `oauth_usage` only from the reader, **not** from a Stadium `health.evidence` notification. Enable the reader in the `require.main` block. |
| `src/public/index.html` | `aiScoreboardClaudeWindow` reads `info.unifiedWindows?.[key]` first, then the legacy fallbacks. Change the Rehydrate button to Refresh Health with a POST. No other UI work. |
| `structured-print.ts`, `stadium-client.ts`, `extension.ts` | **No change.** |
| Codex files | **No change.** |

---

## 9. FOCUSED TESTS

**Fixtures:**
- Add `test/fixtures/claude-rate-limit-event.real.json`, copied verbatim from the Ai Usage repo.
- Add `claude-oauth-usage.real.json`: percent + ISO shape.
- Update `health-authority.test.mjs`, `health-authority-daemon.test.mjs`, `q2-10c-controlled-print.test.mjs:236`, `stadium-bridge.test.mjs:79`, and `ai-usage-scoreboard-ui.test.mjs:32` to use the real `unifiedWindows` shape. The flat `utilization: 0.42` shape stays in the Scoreboard fallback test only.

**Tests:**
1. **Scoreboard:** the real event renders 5H and WK as used percentages with reset times, not UNKNOWN. This is the regression test for the root cause.
2. **Authority:**
   - Push and OAuth evidence carrying the same windows produce one change, not two.
   - Different source or status fields with the same windows produce no change.
   - A partial event keeps the other window's last known value.
   - The legacy persisted record (the current state file) still loads.
3. **Reader canonicalization:** 25 → 0.25, ISO → unix seconds. Missing or out-of-range windows are omitted.
4. **Reader lifecycle** (fake timers and fetch):
   - Immediate startup read.
   - 15 s cadence.
   - Concurrent `refresh` plus a tick produce one fetch.
   - Backoff runs 30/60/120/300, and a 429 `Retry-After` is honored.
   - Recovery returns to 15 s.
   - `stop()` clears everything.
5. **Auth:**
   - An expired token triggers no fetch and no refresh attempt, and reports `credential_expired`.
   - 401 → `auth_rejected`, and last known facts stay intact.
   - The token string never appears in logs, snapshots, or HTTP responses.
6. **Daemon:**
   - `POST /api/ai-health/refresh` without the token → 401. With the token → forced read and SSE `ai-health` on change. No SSE when unchanged.
   - The default constructor never starts the reader.
   - A Stadium `health.evidence` notification carrying `oauth_usage` is rejected.

---

## 10. ONE PLAY OR TWO

**Two Plays.** Play 1 is small and fixes the visible bug by itself today. It shouldn't wait on the reader, which carries more risk.

- **Play 1: Real-shape repair.**
  - Scoreboard `unifiedWindows` read.
  - Authority canonical merge and window-only dedupe.
  - Real fixtures replace the fake shapes.
  - Result: Claude shows as live from push right away.
- **Play 2: Global Claude usage reader.**
  - New reader, daemon ownership and lifecycle.
  - `oauth_usage` evidence and control-plane source.
  - Refresh endpoint and button, acquisition status.

---

## 11. SMALLEST EXECUTABLE WORKER PACKET

### PLAY 1: Claude real-shape repair
**AGENT:** Claude Code · **REASONING:** medium
1. In `src/public/index.html`, make `aiScoreboardClaudeWindow(info, key)` return `info.unifiedWindows[key]` when that is an object. Keep the existing fallbacks.
2. In `src/control-plane/health-authority.ts`, add `canonicalClaudeWindows(info)`, which reads `unifiedWindows` first, then the legacy `info[key]`, then `rateLimitType`.
   - Rewrite `mergeClaudeRateLimitInfo` so the stored info always carries `unifiedWindows`, with the incoming windows overriding the previous ones per window.
   - For Claude, `ingest` dedupes on canonical windows only, with utilization rounded to 4 decimal places.
3. Add the real fixture. Convert the fake Claude fixtures in the five tests listed in §9 to the real shape. Add tests 1 and 2 from §9.
4. Run `npm test`. Confirm the Scoreboard shows 15% / 43% from the existing `~/.sideline/ai-health-state.json` after a daemon restart.
- Do not touch Codex, the reader, or the endpoints. No commit.

### PLAY 2: Global Claude usage reader
**AGENT:** Claude Code · **REASONING:** medium · **Depends on:** Play 1
1. Create `src/control-plane/claude-usage-reader.ts` per §3, §4, §7, and §8. Port `collectClaudeUsage` without the token-refresh path. Add `canonicalClaudeWindowsFromOAuth`.
2. In `protocol.ts`, add the `oauth_usage` evidence type. In `health-authority.ts`, add the control-plane source union and the validators.
3. In `daemon.ts`:
   - Add the `claudeUsage` option, off by default. Enable it in `require.main`, and honor `SIDELINE_CLAUDE_USAGE=0`.
   - Wire start and stop.
   - Add `POST /api/ai-health/refresh` and the `acquisition` field on the GET.
   - Reject `oauth_usage` over the Stadium notification.
4. In `index.html`, rename the button to Refresh Health, make it POST, and render the response.
5. Add tests 3–6 from §9. Run `npm test`.
6. Field check:
   - Use Claude outside Sideline, then confirm the Scoreboard moves within about 15 s with no Play.
   - Refresh Health updates right away.
   - Repeated unchanged reads produce no SSE or state-file writes.
   - Grep the logs for the token prefix and expect zero hits.
- Do not touch Codex, routing, or UI polish. No commit.
