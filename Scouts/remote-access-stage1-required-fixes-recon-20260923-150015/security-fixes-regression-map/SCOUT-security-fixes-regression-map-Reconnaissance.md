Now I have a comprehensive understanding of the codebase. Let me compile the reconnaissance report.

---

# SCOUT REPORT — REMOTE ACCESS V1 REQUIRED FIXES REGRESSION RECON

**Scout Agent:** sideline-scout-deep  
**Scout Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Reconnaissance Depth:** Deep  
**Report Type:** Reconnaissance, not final architectural authority  
**Play ID:** remote-access-stage1-required-fixes-recon-20260923-150015  
**Scout ID:** security-fixes-regression-map  

---

## RESULT

Reconnaissance complete. The two Opus-identified fixes target distinct but adjacent security boundaries in the Stage 1 Remote Access implementation. Evidence maps to specific source files, route policies, and test contracts.

---

## KEY DISCOVERIES

### FIX 1: Remote-device mutations require `X-Sideline-Action: 1` + Origin CSRF enforcement
**Location:** `src/control-plane/daemon.ts` lines 1151–1156, `src/control-plane/request-security.ts` lines 30–38  
**Current State:** The CSRF check exists but only for `cookie`-authenticated principals. Remote-device principals authenticate via `in-process` (Bearer token), so mutations from remote devices currently bypass CSRF.  
**Route Classification:** `remote-mutate` routes exist in `DAEMON_ROUTE_POLICIES` (e.g., `/api/dispatch`, `/api/routines`, `/api/game/select`, `/api/ai-health/refresh`, `/api/queue/*/cancel|retry`, `/api/work/acknowledge`, `/api/reports/rescan`, `/api/route`, `/api/capabilities/refresh`)  
**Test Coverage:** `test/remote-access-v1-stage1.test.mjs` test `RA1-5` validates local cookie mutations require `X-Sideline-Action: 1` + matching Origin, but **no test validates remote-device mutations enforce CSRF**.

### FIX 2: Remote redaction truncates at 8 KB (`REGEX_INPUT_CAP = 8_000`)
**Location:** `src/remote-redaction.ts` line 12, line 35; `src/player-activity.ts` line 57, line 79  
**Current State:** `redactSecrets()` slices input to 8,000 chars before applying regex rules. Long terminal output / report content silently loses secrets beyond 8 KB.  
**Hard-secret protection:** 31 regex rules in `REDACTION_RULES` (lines 16–32) cover Bearer tokens, AWS keys, GitHub PATs, JWTs, private keys, etc.  
**Test Coverage:** `test/remote-access-v1-stage1.test.mjs` test `RA1-7` validates hard-secret redaction works for short strings; `test/live-player-terminal-v02-transport.test.mjs` test `LPT-1` validates secret patterns. **No test validates >8 KB input processing**.

---

## FACT

| Claim | Evidence |
|-------|----------|
| Remote-device mutations currently skip CSRF | `daemon.ts:1151` checks `principal.authenticatedBy === 'cookie'` only; remote-device uses `authenticatedBy: 'in-process'` |
| Route policy table classifies mutation routes as `remote-mutate` | `remote-routes.ts:15-63` lists 17 `remote-mutate` routes |
| `requestOriginMatchesHost` validates same-origin | `request-security.ts:30-38` parses URL, checks protocol + host match |
| Redaction hard-codes 8 KB input cap | `remote-redaction.ts:12,35` — `REGEX_INPUT_CAP = 8_000; text.slice(0, REGEX_INPUT_CAP)` |
| Player activity also truncates at 8 KB | `player-activity.ts:57,79` — same constant, same slice before ANSI/control stripping |
| Hard-secret regexes run after truncation | `remote-redaction.ts:35-36` — slice first, then replace |
| Dev-only terminal override gated by `devMode && remoteSensitiveTerminalOutput` | `daemon.ts:1253-1255`, `running-players.ts:72,144,181` |
| Override never affects report/file redaction | `remote-redaction.ts:46-59` — `terminalActivity` option only triggers `redactRemoteTerminalDetails` |
| SSE `/api/events` and `/api/player-activity` use cookie auth | `daemon.ts:1159-1161`, `daemon.ts:1246-1262` |
| Live Player Terminal requires BOTH `devMode` AND `livePlayerConsole` | `daemon.ts:1009-1011`, `player-activity.ts` comment lines 8-9 |

---

## INFERENCE

| Inference | Basis |
|-----------|-------|
| Fix 1 must extend CSRF check to `remote-device` principals on `remote-mutate` routes | Current check only guards `cookie` auth; Bearer token mutations (extension/CLI) intentionally exempt per `RA1-5` line 136-137 |
| Fix 2 must remove or raise `REGEX_INPUT_CAP` without weakening secret detection | Truncation is a DoS guard; secret patterns must still match across chunk boundaries if streaming |
| Stage 2 remote dispatch will inherit these boundaries | `remote-routes.ts` already classifies `/api/dispatch` as `remote-mutate` |
| Browser SSE and backfill already use the shared `redactForPrincipal` boundary | `daemon.ts:1257-1261` applies redaction with `terminalActivity: true` |
| `remoteSensitiveTerminalOutput` is purely presentation — no route/file/credential policy change | `running-players.ts:71-72`, `remote-redaction.ts:8-9` |

---

## UNKNOWN

| Question | Why Unknown |
|----------|-------------|
| Whether Stage 2 will introduce new `remote-mutate` routes not yet in `DAEMON_ROUTE_POLICIES` | Stage 2 not implemented; route table is the authoritative extension point |
| Whether 8 KB cap was chosen for DoS protection or historical accident | No comment in source; `REGEX_INPUT_CAP` appears in two files identically |
| Whether streaming redaction (chunked input) is required for terminal output >8 KB | Current architecture re-sanitizes per-notification; terminal fragments are coalesced in `PlayerActivityStore` |
| Exact maximum report size seen in production | No telemetry in repo; `ACTIVITY_MESSAGE_MAX = 1200`, `ACTIVITY_LINE_MAX = 240` suggest typical lines are small |

---

## CONTRADICTION

None found. The code is internally consistent: CSRF enforcement matches the authentication model, and the 8 KB cap applies uniformly to both report/terminal redaction paths.

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/daemon.ts` | HTTP handler, CSRF check (line 1151), redaction application (lines 1257, 1904, 1995) |
| `src/control-plane/request-security.ts` | `requestOriginMatchesHost`, `timingSafeSecretEqual`, `Principal` types |
| `src/control-plane/remote-routes.ts` | `DAEMON_ROUTE_POLICIES`, `classifyDaemonRoute`, `principalMayAccess` |
| `src/remote-redaction.ts` | `redactSecrets`, `REDACTION_RULES`, `REGEX_INPUT_CAP`, `redactForPrincipal` |
| `src/player-activity.ts` | `PlayerActivityStore`, `sanitizeActivityText`, `REGEX_INPUT_CAP` duplicate |
| `src/running-players.ts` | `CoachPreferences.remoteSensitiveTerminalOutput`, `DEFAULT_PREFERENCES` |
| `test/remote-access-v1-stage1.test.mjs` | Stage 1 contract tests (RA1-1 through RA1-8) |
| `test/live-player-terminal-v02-transport.test.mjs` | LPT-1 through LPT-24 (terminal transport) |
| `test/live-player-console-first-down.test.mjs` | LPC-1 through LPT-29 (browser console) |
| `src/public/index.html` | Settings UI for `remoteSensitiveTerminalOutput` (lines 1692-1698, 7606-7756) |

---

## 1. MINIMUM FOCUSED TEST COMMAND AFTER FIX 1

```bash
# Run only the Stage 1 remote-mutate CSRF tests for remote-device principals
node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-5"
```

**Expected new assertions to pass (not yet in test):**
- `POST /api/dispatch` with `remote-device` principal + Bearer token + missing `X-Sideline-Action` → 403
- `POST /api/dispatch` with `remote-device` principal + Bearer token + `X-Sideline-Action: 1` + evil Origin → 403
- `POST /api/dispatch` with `remote-device` principal + Bearer token + `X-Sideline-Action: 1` + correct Origin → 200
- All other `remote-mutate` routes (`/api/routines`, `/api/game/select`, `/api/ai-health/refresh`, `/api/queue/*/cancel|retry`, `/api/work/acknowledge`, `/api/reports/rescan`, `/api/route`, `/api/capabilities/refresh`) exhibit same behavior

---

## 2. MINIMUM FOCUSED TEST COMMAND AFTER FIX 2

```bash
# Run only the redaction tests that exercise >8 KB input
node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-7"
```

**Expected new assertions to pass (not yet in test):**
- Input > 8 KB with secret at position 10 KB → secret redacted (no truncation loss)
- Input > 8 KB with secret split across 8 KB boundary → secret redacted
- Terminal activity > 8 KB with secret at end → secret redacted, terminal detail masked by default
- Idempotency: `redactSecrets(redactSecrets(longInput)) === redactSecrets(longInput)`

---

## 3. MINIMUM ADJACENT REGRESSION SUITE AFTER BOTH FIXES

```bash
# Full Stage 1 contract + Live Player Terminal transport + Console UI
node --test test/remote-access-v1-stage1.test.mjs test/live-player-terminal-v02-transport.test.mjs test/live-player-console-first-down.test.mjs
```

**Critical paths covered:**
| Test | Protects |
|------|----------|
| `RA1-3` | Route classification completeness (every daemon route in policy table) |
| `RA1-4` | Remote principals denied `local-only` routes |
| `RA1-5` | Cookie mutations require `X-Sideline-Action: 1` + Origin; Bearer mutations still work |
| `RA1-6` | SSE auth + headers + heartbeat |
| `RA1-7` | Shared redaction boundary: local verbatim, remote hard-secret redacted, terminal override isolated |
| `RA1-8` | `remoteSensitiveTerminalOutput` default OFF, persists, Dev-only UI |
| `LPT-1` | Secret patterns redacted; ordinary text survives |
| `LPT-5`/`LPT-6` | Store: ordering, caps, re-sanitization, streaming coalescing, session rotation |
| `LPT-8` | Daemon gate: nothing stored/broadcast unless Dev Mode AND View Player Terminal ON |
| `LPT-9` | Exact-instance routing, epoch, secret redaction on SSE/backfill |
| `LPC-1`–`LPC-3` | Dev Mode + Console setting gating |
| `LPT-15` | Activity retention gated by both flags |
| `LPT-17` | Backfill uses exact `gameId|instanceId` and epoch |
| `LPT-22` | Session rotation resets transcript + copy cursor |

---

## 4. BEHAVIORAL CONTRACTS NEITHER FIX MAY ALTER

| Contract | Must Remain True |
|----------|------------------|
| **Bearer token mutations work without CSRF** | Extension/CLI `Authorization: Bearer <token>` on `remote-mutate` routes → 200 (test `RA1-5` lines 136-137) |
| **Cookie GET requests work without CSRF** | `GET /api/status`, `/api/events`, `/api/player-activity` with cookie → 200 |
| **Local-admin (cookie or bearer) bypasses all remote boundaries** | `principalMayAccess(local, any)` → `true` (`remote-routes.ts:76`) |
| **Report/file redaction never consults `remoteSensitiveTerminalOutput`** | `redactForPrincipal(report, remote, { allowSensitiveTerminalOutput: true })` still redacts secrets (`remote-redaction.ts:51-53`, test `RA1-7` line 184) |
| **Hard-secret patterns always apply, even under terminal override** | `redactRemoteTerminalDetails` runs AFTER `redactSecrets`; override only removes path masking (`remote-redaction.ts:40-53`) |
| **PlayerActivityStore re-sanitizes every input** | Daemon never trusts upstream redaction (`player-activity.ts:1018-1019`, test `LPT-6` line 157-158) |
| **SSE `/api/events` uses cookie auth only** | No Bearer token support for SSE (`daemon.ts:1159`) |
| **`devMode` is the gate; `remoteSensitiveTerminalOutput` alone does nothing** | `daemon.ts:1253-1255`, `running-players.ts:197-199` |
| **Route classification is default-deny** | Unlisted method/path → `undefined` → 404/405 (`daemon.ts:1133-1141`) |

---

## 5. LIKELY BRITTLE TESTS / HARNESS ASSUMPTIONS

| Test / Assumption | Brittle Because |
|-------------------|-----------------|
| `RA1-3` extracts route literals via regex from `daemon.ts` source | Source-format changes (template strings, spacing) break literal extraction |
| `RA1-3` extracts method/path pairs via regex from `daemon.ts` | Same; handler refactoring breaks pattern match |
| `LPT-8` / `LPT-15` / `LPT-21` assume `livePlayerConsole` OFF discards retained activity immediately | Implementation detail: store.clear() vs. gate-on-read; test asserts empty snapshot after toggle |
| `LPT-20` / `LPT-22` / `LPT-23` / `LPT-24` depend on exact `epoch`/`sessionKey`/`playRef` rotation semantics | Any change to epoch generation or sessionKey derivation breaks these |
| `LPT-11` / `LPT-14` assume streaming fragments coalesce by `seq` equality | If `PlayerActivityStore` changes coalescing logic, duplicate/streaming tests break |
| `dev-harness.test.mjs` assumes `computeExpectedExtensionBuildId` hashes `out/stadium-client.js` | Build output location change breaks dev harness verification |
| `remote-access-v1-stage1.test.mjs` imports from `../out/` (compiled) not `../src/` | Must compile before test; source changes without compile give false passes |

---

## 6. STAGE 2 PREREQUISITES THESE FIXES MUST ESTABLISH

| Prerequisite | Why Required for Stage 2 |
|--------------|--------------------------|
| **All `remote-mutate` routes enforce CSRF for `remote-device`** | Stage 2 remote dispatch (`/api/dispatch` from paired device) must not be forgeable via cross-origin form submit |
| **Redaction processes unbounded input without secret loss** | Stage 2 may stream large terminal output / reports to remote devices; truncation would silently leak secrets |
| **`remoteSensitiveTerminalOutput` remains presentation-only** | Stage 2 must not accidentally gate route/file/credential access on this flag |
| **Route classification table covers every new Stage 2 route** | `RA1-3` test will fail if Stage 2 adds routes without policy entries |
| **SSE + backfill share the exact same `redactForPrincipal` boundary** | Stage 2 remote terminal must get same redaction as reports |
| **Bearer token path stays open for trusted extension/CLI** | Stage 2 may use Bearer for automated remote dispatch from extension |

---

## 7. EXPLICIT GO/NO-GO ACCEPTANCE CHECKLIST FOR CODEX

### GO — All Must Pass

| # | Check | Command / Verification |
|---|-------|------------------------|
| 1 | Fix 1: `remote-device` + Bearer on any `remote-mutate` route requires `X-Sideline-Action: 1` + matching Origin | `node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-5"` + new remote-device CSRF assertions |
| 2 | Fix 1: Bearer mutations (extension/CLI) still work without CSRF | `RA1-5` lines 136-137 still pass |
| 3 | Fix 1: Cookie mutations still require CSRF | `RA1-5` lines 128-134 still pass |
| 4 | Fix 1: `local-admin` (cookie or bearer) bypasses CSRF | `principalMayAccess({kind:'local-admin'}, 'remote-mutate') === true` |
| 5 | Fix 2: Input > 8 KB with secret at 10 KB → secret redacted | New test in `RA1-7` or `LPT-1` |
| 6 | Fix 2: Input > 8 KB with secret split at 8 KB boundary → secret redacted | New test |
| 7 | Fix 2: Terminal activity > 8 KB redacted correctly under both default and override | New test exercising `terminalActivity: true` with long input |
| 8 | Fix 2: Idempotent redaction (double-apply = no change) | `redactSecrets(redactSecrets(x)) === redactSecrets(x)` for long x |
| 9 | Full Stage 1 suite passes | `node --test test/remote-access-v1-stage1.test.mjs` |
| 10 | Live Player Terminal transport suite passes | `node --test test/live-player-terminal-v02-transport.test.mjs` |
| 11 | Live Player Console UI suite passes | `node --test test/live-player-console-first-down.test.mjs` |
| 12 | No route classification gaps | `RA1-3` passes (all literal routes + handler methods classified) |

### NO-GO — Any Failure Blocks

| # | Failure Mode |
|---|--------------|
| A | Any `remote-mutate` route accepts `remote-device` mutation without `X-Sideline-Action: 1` + correct Origin |
| B | Bearer token mutations (extension/CLI) start requiring CSRF |
| C | Secret leakage on input > 8 KB (any pattern in `REDACTION_RULES`) |
| D | `remoteSensitiveTerminalOutput` override affects report/file redaction or route access |
| E | `RA1-3` route classification test fails (new unclassified route) |
| F | `LPT-8`/`LPT-15` gate logic broken (activity leaks when Dev Mode or Console OFF) |
| G | SSE `/api/events` or `/api/player-activity` auth regression |

---

## 8. UNRELATED / PRE-EXISTING TESTS — DO NOT TRIGGER EXPLORATION

These tests exercise orthogonal subsystems and should not be investigated unless the above GO checks fail unexpectedly:

| Test File | Subsystem | Why Unrelated |
|-----------|-----------|---------------|
| `dev-harness.test.mjs` | Multi-Game VS Code launch harness | Dev tooling only; no runtime security boundary |
| `q2-10a-provider-control.test.mjs` | Provider control profiles | Routing policy, not remote auth/redaction |
| `q2-10b-routing-and-roster.test.mjs` | Auto/manual routing decisions | Route computation, not transport security |
| `q2-10c-work-ledger.test.mjs` | Instance work ledger | Local state tracking |
| `q2-10d-context-aware-auto.test.mjs` | Context-aware routing | Prompt analysis, not CSRF/redaction |
| `coach-routines-v0*.test.mjs` | Coach routines engine | Local routine CRUD |
| `scout-*.test.mjs` (all) | Scout player/formation/continuation | Separate player type |
| `player-control-*.test.mjs` | Player control host/contract | Extension-host internals |
| `game-filesystem-*.test.mjs` | S6/S8/S10 filesystem contract | Filesystem decisions |
| `health-authority*.test.mjs` | AI health evidence | Usage telemetry |
| `terminal-evidence-retention.test.mjs` | Terminal evidence UI retention | Browser-side only |
| `incoming-reports-*.test.mjs` | Incoming report copy/handoff | Report handling |
| `routing-intelligence.test.mjs` | Routing policy analysis | Decision logic |
| `p0-1-control-plane-freshness.test.mjs` | Daemon freshness/replacement | Process lifecycle |
| `game-foundation.test.mjs` / `multi-game-foundation.test.mjs` | Game registry basics | Core registry |
| `stadium-bridge.test.mjs` | Stadium ↔ Control Plane protocol | WebSocket RPC |
| `vsix-entries.test.mjs` | Extension packaging | Build artifact |

---

## SCOUT LIMITATIONS

- Did not execute tests (read-only reconnaissance)
- Did not verify Stage 2 route additions (Stage 2 not implemented)
- Did not measure actual production report/terminal sizes to calibrate 8 KB cap
- Did not inspect browser-side EventSource handling beyond `index.html` grep
- Did not verify `ws` WebSocket server CSRF implications (Stadium handshake uses Bearer token, not cookie)

---

## ARCHITECT DECISION REQUIRED

1. **CSRF for remote-device**: Should `remote-device` mutations require `X-Sideline-Action: 1` + Origin, or should a different mechanism (e.g., per-device CSRF token) be used? Current design reuses the cookie CSRF seam.

2. **8 KB cap replacement**: Remove entirely? Raise to 1 MB? Stream-chunk redaction? The cap exists in two files (`remote-redaction.ts`, `player-activity.ts`) — must stay synchronized.

3. **Streaming secret detection**: If input > cap is processed in chunks, secrets split across chunk boundaries need a streaming redaction approach (not currently implemented).

---

## RECOMMENDED NEXT AGENT

**Opus-class Architect** — The regression map is precise; the fixes are bounded security boundary changes requiring synthesis across route policy, CSRF seam, and redaction pipeline. Premium reasoning should focus on:
- CSRF mechanism choice for `remote-device` (header vs token)
- Unbounded redaction strategy (streaming vs raised cap)
- Stage 2 route policy extension pattern

---

**End of Reconnaissance Report**
