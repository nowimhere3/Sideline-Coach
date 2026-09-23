# AI Health — Claude Live Acquisition Seam Validation + Opus Scope Pack

<!-- sideline-provenance: {"gameId":"game_git_3b85b965","clientRef":"ref_1790052267464_ba4af948","playerInstanceId":"antigravity-6af0f4d3","playerType":"antigravity","provider":"antigravity","model":"claude-sonnet-4-6","at":"2026-09-22T04:44:27.464Z"} -->

**REPORT FILE:** `AI-Health-Claude-Live-Acquisition-Seam-Validation__20260921-225505__AntiGravity.md`
**REPORT TIMESTAMP:** 2026-09-21 22:55 MDT (UTC-06:00, America/Edmonton)
**AGENT:** AntiGravity
**MODEL:** Claude Sonnet (strongest Sonnet available in AntiGravity)
**REASONING:** Medium
**ROLE:** Senior seam validator / architecture preflight / Opus Scope Pack compiler
**PLAY:** Senior seam validator — Claude UNKNOWN diagnosis + Opus Scope Pack
**REPOSITORY:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
**READ-ONLY:** Yes. No code modified. No commits, pushes, or shell operations.

---

## RESULT

**BOUNDED MISSION: COMPLETE.**

The root cause of `CLAUDE 5H UNKNOWN | WK UNKNOWN` is a **supply gap, not a wiring gap**.

The entire technical pipeline from Claude subprocess stdout → HealthAuthority → SSE → Scoreboard is already implemented, already tested, and already correct in the current codebase. The wiring works. The problem is that the real Claude CLI has not yet emitted a `rate_limit_event` frame through a Sideline-controlled subprocess that also successfully traversed the daemon guard conditions.

However, a second latent concern also exists: **the fake-CLI test fixture for `health-event` mode uses a flat `rate_limit_info` shape with `utilization` at top-level, while the real captured Claude event stores `utilization` inside `unifiedWindows`.** The display code's `aiScoreboardClaudeWindow` logic cannot reach `utilization` from inside `unifiedWindows`. If a real `rate_limit_event` arrives as-captured, Claude will remain UNKNOWN even when data is present in HealthAuthority. This is a display-side shape mismatch.

The **fastest, simplest, zero-inference path** to populated Claude health is a standalone OAuth GET acquisition (`https://api.anthropic.com/api/oauth/usage`) triggered at daemon start or on demand — already fully implemented in AI Usage Real Time and requiring only porting to Sideline.

Two scope items for Opus:
1. **CRITICAL — display shape mismatch** between real `rate_limit_event` shape and what `aiScoreboardClaudeWindow` can render.
2. **ARCHITECTURE — zero-inference OAuth GET acquisition** in daemon as a reliable baseline, with `rate_limit_event` as the live bonus.

---

## VERIFIED ARCHITECTURE — COMPLETE PIPELINE

### Confirmed wiring (all PROVEN by source read):

```
Claude CLI (structured-print mode)
  ↓ stdout JSON frame: { type: "rate_limit_event", rate_limit_info: {...} }
  ↓
structured-print.ts:485-491  [StructuredPrintControl.startTurn live loop]
  - if (frame.type === 'rate_limit_event')
  - boundedJsonObject(frame.rate_limit_info)
  - this.options.onHealthFrame?.(instanceId, { provider:'claude', type:'rate_limit_event', rate_limit_info })
  ↓
extension.ts:60-62  [createClaudeControlFactory({ onHealthFrame: (id, ev) => stadiumClient?.sendHealthEvidence(id, ev) })]
  ↓
stadium-client.ts:418-425  [sendHealthEvidence()]
  - if (!this.isConnected) return  [guard: disconnected clients drop silently]
  - this.sendNotification('health.evidence', { stadiumId, instanceId, gameId, playerInstanceId, evidence })
  ↓
daemon.ts:921-929  [notification handler case 'health.evidence']
  - session.features must include 'health.evidence.v1'  [stadium-client.ts:520 confirms it IS in features array]
  - session.game?.gameId must === p.gameId  [guard: game must be current]
  - isHealthEvidence(p.evidence) must pass
  - healthAuthority.ingest(p)
  ↓
health-authority.ts:115-143  [HealthAuthority.ingest()]
  - validClaudeEvidence → { provider:'claude', type:'rate_limit_event', rate_limit_info: boundedCopy(...) }
  - mergeClaudeRateLimitInfo(previous, incoming_info)  → stored as rateLimitInfo
  - onChange?.(snapshot)  → scheduleHealthSave() + broadcast('ai-health', snapshot)
  ↓
daemon.ts:222  [broadcast('ai-health', snapshot)]
  → SSE event to all subscribers: event.data = JSON.stringify(snapshot)
  ↓
index.html:4899-4906  [eventSource.addEventListener('ai-health', ...)]
  → aiHealthSnapshot = JSON.parse(event.data)
  → renderAiScoreboard()
```

**Every link is present. The wiring is complete.**

---

## FINDING A — ZERO-INFERENCE CLAUDE ACCOUNT READ (VERIFIED)

**PROVEN.**

- **File:** `C:\Users\dmcal\Documents\GitHub\Ai Usage - Real Time\src\providers\claude.js`
- **Functions:** `getClaudeUsage()` → `collectClaudeUsage()`
- **Endpoint:** `GET https://api.anthropic.com/api/oauth/usage`
- **Credential source:** `~/.claude/.credentials.json` → `credentials.claudeAiOauth.accessToken`
- **Header names:** `authorization`, `anthropic-beta` (value: `oauth-2025-04-20`), `accept`
- **Zero-inference proof:** Pure HTTP GET. No prompt, no model, no PTY, no child process, no inference tokens. Comments at lines 1-3 of `claude.js` state this explicitly; test `provider-acquisition.test.js` asserts `request.method === 'GET'`, 1 call, no credential leakage.
- **Response fields:** `five_hour.utilization` (0-100), `five_hour.resets_at`; `seven_day.utilization` (0-100), `seven_day.resets_at`
- **Normalization:** `normalizeClaudeRateLimits()` (lines 22-35) maps both windows to `makeWindow({ usedPercent, resetsAt })`
- **Expiry guard:** `oauth.expiresAt <= Date.now()` → returns `unavailableSnapshot` without fetching. No token refresh attempted.
- **Deduplication:** Module-level `inFlight` promise — concurrent callers share one request.
- **Timeout:** `AbortSignal.timeout(10_000)`

**No OAuth secrets enter HealthAuthority, browser, reports, or logs — proven by source and test.**

---

## FINDING B — WHY CLAUDE IS UNKNOWN (VERIFIED ROOT CAUSE)

The previous Play 1.1 field diagnosis (Claude, `AI-Usage-Scoreboard-UI-Play1-1-Field-Repair__20260921-235000__Claude.md`) correctly identified:

> `providers.claude` is absent entirely from the persisted state file `~/.sideline/ai-health-state.json`. The HealthAuthority genuinely contains no Claude evidence because no Sideline-Controlled Claude Player subprocess that emitted a `rate_limit_event` frame has run in this dev host's current runtime.

This is confirmed by source: `structured-print.ts:485` only fires when the Claude CLI **subprocess** emits the frame on stdout during a Sideline-launched play. An interactive Claude Code session (the one doing the reconnaissance or repairs) is not a subprocess of Sideline's `StructuredPrintControl` — it never passes through that stdout capture path.

**Additional finding (NEW, not in previous report):**

Even if `rate_limit_event` does fire through the subprocess path, there is a **display-side shape mismatch**:

- **Real captured event shape** (from `AI Usage Real Time/test/fixtures/claude-rate-limit-event.json`):
  ```json
  {
    "type": "rate_limit_event",
    "rate_limit_info": {
      "status": "allowed", "resetsAt": 1789278000, "rateLimitType": "five_hour",
      "overageStatus": "rejected", "isUsingOverage": false,
      "unifiedWindows": {
        "five_hour": { "utilization": 0.34, "resetsAt": 1789278000 },
        "seven_day": { "utilization": 0.15, "resetsAt": 1789819200 }
      }
    }
  }
  ```
- **`utilization` is inside `unifiedWindows`, NOT at the top level of `rate_limit_info`.**

- **Fake-CLI `health-event` fixture** (line 75 of `fake-print-cli.mjs`):
  ```js
  rate_limit_info: { status: 'allowed', utilization: 0.42, rateLimitType: 'five_hour', resetsAt: 123456 }
  ```
  `utilization` is at the **top level**. Tests pass because the display can find `info.utilization` or fall back to `info` itself.

- **Display code** (`index.html:4500-4503`):
  ```js
  const aiScoreboardClaudeWindow = (info, key) => {
    if (!info || typeof info !== 'object') return undefined;
    if (info[key] && typeof info[key] === 'object') return info[key];  // checks info['five_hour']
    return info.rateLimitType === key ? info : undefined;              // fallback: return info itself
  };
  ```
  After `mergeClaudeRateLimitInfo`, `rateLimitInfo` stores the raw event. For the real shape:
  - `info['five_hour']` = `undefined` (no top-level `five_hour` key)
  - Fallback: `info.rateLimitType === 'five_hour'` → `true` → returns `info` itself
  - `aiScoreboardNormalize(info, 'utilization')` → `info.utilization * 100` → **`undefined * 100 = NaN`** → returns `undefined` → **UNKNOWN**

  The real event's `unifiedWindows.five_hour.utilization` is **never read by the display code**.

- **After merge with both windows**, `rateLimitInfo` becomes:
  `{ ...last_event_info, five_hour: first_event_info, seven_day: last_event_info }`
  - `info['five_hour']` = `first_event_info` = `{ status, resetsAt, rateLimitType:'five_hour', unifiedWindows:{...} }`
  - `aiScoreboardNormalize(first_event_info, 'utilization')` → `first_event_info.utilization * 100` → **`undefined`** → still UNKNOWN

**The `unifiedWindows` nesting is never unwrapped at any layer in the Sideline codebase.**

---

## FINDING C — `rate_limit_event` DOES FIRE IN STRUCTURED-PRINT MODE (PROVEN)

The Play 1 report for AI Usage Real Time states explicitly:

> "The golden fixture `test/fixtures/claude-rate-limit-event.json` is the **real captured frame re-extracted from the Sideline session transcript** (not from documentation), `uuid` and `session_id` removed."

This proves `rate_limit_event` **does** emit during structured-print mode (`--input-format stream-json --output-format stream-json`). It is not interactive-terminal-only.

**What is UNPROVEN**: frequency, conditions (does it fire on every turn? on threshold cross? on first token?), and whether it has fired through the specific `structured-print.ts` subprocess path in the current dev host session.

---

## FINDING D — DAEMON GUARDS (VERIFIED — ALL CURRENTLY SATISFIED)

`daemon.ts:924-926` checks:
1. `session.features?.includes('health.evidence.v1')` — **stadium-client.ts:520 includes it.** ✓
2. `session.game?.gameId !== p.gameId` — game ID must match. ✓ (normal operating condition)
3. `isHealthEvidence(p.evidence)` — validates structure. ✓ (structured-print.ts builds valid shape)

No guard failures are expected. All three pass under normal Sideline operation.

---

## FINDING E — CODEX HEALTH (VERIFIED WORKING — DO NOT REDESIGN)

Codex works via:
- `account/rateLimits/updated` notification → `CodexAppServerControl.prototype.notification` (lines 631-673)
- `account/rateLimits/read` RPC → called via the already-open session (pattern: `queryCapabilities()` lines 599-615)
- Evidence shape: `{ provider:'codex', type:'account_rate_limits', rate_limits: {...} }`

Working field evidence confirms Codex health populates correctly. No action needed here.

---

## SMALLEST CORRECT PRODUCTION ARCHITECTURE

**Option A (Recommended — Fastest, Zero New Risk): Zero-Inference OAuth GET in Daemon**

The AI Usage Real Time codebase already has a complete, tested, zero-inference Claude account read that delivers both `five_hour` AND `seven_day` in one call. The simplest architecture is to port this as a daemon-side acquisition:

1. **New daemon RPC or background task** — reads `~/.claude/.credentials.json`, fetches `GET https://api.anthropic.com/api/oauth/usage` with Bearer token + `anthropic-beta: oauth-2025-04-20`, normalizes response to `{ provider:'claude', type:'claude_oauth_usage', five_hour: {utilization, resets_at}, seven_day: {utilization, resets_at} }`.
2. **Triggered**: at daemon start (if credentials exist + token valid), on Scoreboard "Rehydrate" button click, and optionally at Play boundary. Never polling.
3. **New HealthAuthority evidence type for read**: `'claude_oauth_usage'` — OR adapt existing `rate_limit_event` storage to also accept and merge OAuth GET results.
4. **Display code fix**: `aiScoreboardClaudeWindow` must also check `info.unifiedWindows?.[key]` to handle the real event shape (whether it arrives from push or read).
5. **Credential security**: token stays server-side (daemon process only). Never enters browser, SSE payload, logs, or reports.

**Option B (Live bonus — supplements A, does not replace it): `rate_limit_event` push tap**

The current push pipeline IS wired correctly but will only deliver data if:
1. A real Claude Play runs through `StructuredPrintControl`
2. Claude CLI emits `rate_limit_event` during that play
3. **AND** the display shape mismatch is fixed (see FINDING B)

This is a zero-cost bonus when it works. Fix the display shape issue regardless.

---

## DISPLAY SHAPE FIX (PRECISE SCOPE FOR OPUS)

**File:** `src/public/index.html`
**Function:** `aiScoreboardClaudeWindow` (line 4500-4504)

Current:
```js
const aiScoreboardClaudeWindow = (info, key) => {
  if (!info || typeof info !== 'object') return undefined;
  if (info[key] && typeof info[key] === 'object') return info[key];
  return info.rateLimitType === key ? info : undefined;
};
```

The fix must add a third lookup: `info.unifiedWindows?.[key]`. The display code expects a window object with `{ utilization, resetsAt }`. For the real event shape, this lives at `info.unifiedWindows.five_hour` or `info.unifiedWindows.seven_day`.

Priority lookup order (rationale: most-specific first, legacy fallback last):
1. `info[key]` — merged dual-window format (HealthAuthority after two events, or HealthAuthority OAuth GET format if adapted)
2. `info.unifiedWindows?.[key]` — real single-event format (NEW — this is the missing path)
3. `info.rateLimitType === key ? info : undefined` — legacy flat format (fake-CLI `health-event` mode and tests SB-3/SB-6)

**Test SB-5 (dual-window)** and **SB-6 (flat fallback)** will continue passing. A new test is needed for the `unifiedWindows` path using a shape matching the real golden fixture.

---

## CONTRADICTIONS RESOLVED

| Scout claim | Validation | Status |
|---|---|---|
| "pipeline drop point is `parseClaudeFrame` returning `[]`" | **SUPERSEDED.** `parseClaudeFrame` was refactored. The live loop now handles `rate_limit_event` at lines 485-491. The wiring IS present. | Contradiction resolved — Scouts had pre-refactor view |
| "Claude simply needs to run one controlled Play first" | **PARTIALLY CORRECT.** A Play must run, but even then a real event would render UNKNOWN due to shape mismatch. | Both conditions required |
| "rate_limit_event confirmed to fire in stream-json mode" | **PROVEN** by Play 1 report: "real captured frame re-extracted from Sideline session transcript." | Confirmed |
| "`unifiedWindows` shape vs flat shape" — not flagged by previous Scouts | **NEW FINDING.** Previous Scouts examined AI Usage Real Time normalizer (which handles it). SidelineCoach display code does not. | New contradiction identified |

---

## EXACT SOURCE FILES / SYMBOLS FOR OPUS

### Sideline Coach (TARGET repo for implementation)

| File | Symbol | Line | Purpose |
|---|---|---|---|
| `src/player-control/structured-print.ts` | `StructuredPrintControl.startTurn` | 480-492 | Live loop: captures `rate_limit_event`, calls `onHealthFrame` |
| `src/extension.ts` | `createClaudeControlFactory({onHealthFrame})` | 60-62 | Wires health evidence to `stadiumClient.sendHealthEvidence` |
| `src/stadium-client.ts` | `sendHealthEvidence()` | 418-425 | Sends `health.evidence` notification to daemon |
| `src/control-plane/daemon.ts` | notification handler `'health.evidence'` | 921-929 | Validates + ingests |
| `src/control-plane/daemon.ts` | `GET /api/ai-health` handler | 1020-1022 | Rehydrate endpoint |
| `src/control-plane/daemon.ts` | `broadcast('ai-health', snapshot)` | 222 | SSE push on health change |
| `src/control-plane/health-authority.ts` | `HealthAuthority.ingest()` | 115-143 | Truth store update |
| `src/control-plane/health-authority.ts` | `mergeClaudeRateLimitInfo()` | 190-202 | Window merge (dual-window retention) |
| `src/control-plane/health-authority.ts` | `validClaudeEvidence()` | 232-237 | Validation gate for Claude evidence |
| `src/control-plane/protocol.ts` | `ClaudeHealthEvidence` | 148-152 | Protocol type: only accepts `rate_limit_event` |
| `src/public/index.html` | `aiScoreboardClaudeWindow()` | 4500-4504 | **SHAPE MISMATCH HERE** — must add `unifiedWindows` path |
| `src/public/index.html` | `aiScoreboardNormalize()` | 4526-4532 | Converts window to `{used, left, resetsAt}` |
| `src/public/index.html` | `renderAiScoreboard()` | 4794-4834 | SSE and GET both converge here |
| `test/ai-usage-scoreboard-ui.test.mjs` | SB-5, SB-6, SB-15 | 163-327 | UI shape tests — SB-15 confirms UNKNOWN-not-fabricated invariant |
| `test/q2-10c-controlled-print.test.mjs` | "AI Health Play 3" | 236-252 | End-to-end health-event pipeline test (fake CLI) |
| `test/fixtures/fake-print-cli.mjs` | `mode === 'health-event'` | 75 | **SHAPE MISMATCH IN FIXTURE**: uses flat `utilization`, not `unifiedWindows` |

### AI Usage Real Time (SOURCE of acquisition pattern to port)

| File | Symbol | Purpose |
|---|---|---|
| `src/providers/claude.js` | `collectClaudeUsage()`, `normalizeClaudeRateLimits()` | Zero-inference OAuth GET — PORT THIS |
| `src/providers/claude-live.js` | `normalizeClaudeRateLimitEvent()` | Push normalizer — already handles `unifiedWindows` |
| `test/fixtures/claude-rate-limit-event.json` | (fixture) | **Real event shape** — use this for new Sideline test |

---

## ARCHITECTURE CONSTRAINTS (CONFIRMED)

All user-stated constraints verified against source:

- **ONE GLOBAL ACQUISITION OWNER**: `HealthAuthority` is global per daemon, not per-game, not per-browser. ✓ Confirmed by `daemon.ts:216-225`.
- **A failed acquisition must NOT delete good last-known factual health**: `mergeClaudeRateLimitInfo` never replaces good state with empty; ingest only updates on success. ✓
- **Both `five_hour` AND `seven_day` must be populated**: OAuth GET returns both in one call. `rate_limit_event` may come per-window (one event = one window), requiring merge. `mergeClaudeRateLimitInfo` handles accumulation. Display requires both to show non-UNKNOWN. ✓
- **Routing policy must NOT go into HealthAuthority**: protocol types and stored state contain no routing fields. ✓
- **OAuth secrets must NEVER enter HealthAuthority, browser, SSE, reports, or logs**: the credential is used server-side to fetch the URL; `rate_limit_info` contains no OAuth credentials. ✓

---

## DO NOT READ (OPUS TOKEN CONSERVATION)

Opus does NOT need to read for this specific scope:

- `src/player-control/codex-app-server.ts` — Codex works; do not redesign.
- `src/player-control/codex-contract.ts` — Codex contract; do not modify.
- `test/fixtures/fake-codex-app-server.mjs` — Codex test fixture; not relevant.
- `src/control-plane/daemon.ts` lines 1-200, 450-830, 940-3650 (HealthAuthority setup at 216-225 and `health.evidence` handler at 921-929 are the only relevant sections).
- `web/app.js` in AI Usage Real Time — this is the AI Usage app UI, not SidelineCoach's Scoreboard.
- `src/health-service.js` in AI Usage Real Time — this is the AI Usage app's service layer; the pattern to port is `collectClaudeUsage()` from `claude.js`, not the full service.
- All Scout Formation reports — already summarized here.
- Legacy, Onboarding-SOP, AI-HEALTH-SCORECARD-NORTH-STAR.md — not needed for this implementation.
- SidelineCoach REPORTS (Claude, Codex, AntiGravity prior plays) — all findings are folded into this report.

---

## OPEN QUESTIONS REMAINING FOR OPUS

1. **Where should the OAuth GET live in the daemon?** Options:
   - New HTTP endpoint (e.g., `POST /api/claude-health/acquire`) callable by Rehydrate button
   - Daemon startup background task (if credentials available)
   - Both — startup baseline + on-demand refresh
   
2. **Evidence type for OAuth GET**: `ClaudeHealthEvidence` protocol type currently requires `type: 'rate_limit_event'`. The OAuth GET produces a different shape. Should Opus:
   - Extend `protocol.ts` with a new `ClaudeOAuthHealthEvidence` type
   - Map the OAuth GET response to the same `rate_limit_event` shape (simpler, single code path)
   - Accept both types in `validClaudeEvidence` (more faithful to source identity)

3. **`fake-print-cli.mjs` fixture**: Should the `health-event` fixture be updated to use the real `unifiedWindows` shape? This would break SB-3/SB-6 tests that depend on the flat fixture. A separate `health-event-unified` mode may be cleaner.

4. **Token expiry at acquisition time**: `collectClaudeUsage` returns `unavailableSnapshot` on expired token but does NOT refresh. Sideline needs a graceful fallback — keep last-known-good health, do not clear it.

---

## FACT

1. The `rate_limit_event` wiring in SidelineCoach is complete and present: `structured-print.ts:485-491` → `onHealthFrame` → `sendHealthEvidence` → daemon `health.evidence` → `healthAuthority.ingest` → `broadcast('ai-health')`.
2. The daemon guard at `daemon.ts:925` (`session.features?.includes('health.evidence.v1')`) is satisfied — `stadium-client.ts:520` declares `'health.evidence.v1'` in the features array.
3. The `rate_limit_event` frame DOES fire in `--output-format stream-json` mode — proven by the real captured frame in `AI Usage Real Time/test/fixtures/claude-rate-limit-event.json`, confirmed as "re-extracted from the Sideline session transcript."
4. **Real `rate_limit_event` shape has `utilization` inside `unifiedWindows.five_hour`, NOT at the top level of `rate_limit_info`.** The display code (`aiScoreboardClaudeWindow`) does not look inside `unifiedWindows`. This is a display-side shape mismatch.
5. **The fake-print-cli `health-event` fixture does NOT match real Claude event shape.** Tests pass but test a shape that Claude CLI does not actually emit.
6. The Zero-Inference OAuth GET (`https://api.anthropic.com/api/oauth/usage`) is fully implemented and battle-tested in AI Usage Real Time. It delivers both windows in one HTTP call. It needs no Claude subprocess to be running.
7. HealthAuthority stores `providers.claude` as a `ClaudeProviderHealthState` — the whole `rateLimitInfo` object is stored verbatim after `mergeClaudeRateLimitInfo`, not in the normalized `makeHealthWindow` format used by AI Usage Real Time.

---

## CONTRADICTIONS

None remaining after validation. The Scout findings were based on a pre-refactor snapshot of `parseClaudeFrame`; the codebase has since been updated and the wiring is now present. The shape mismatch is a new finding not contradicted by any prior report.

---

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\Reports\AntiGravity\AI-Health-Claude-Live-Acquisition-Seam-Validation__20260921-225505__AntiGravity.md`
