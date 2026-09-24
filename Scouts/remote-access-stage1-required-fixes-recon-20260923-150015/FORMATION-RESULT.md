# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:07:54

Play: remote-access-stage1-required-fixes-recon-20260923-150015
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-23T21:00:33.786Z
Finished: 2026-09-23T21:08:28.366Z
TOTAL ELAPSED TIME: 00:07:54

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| csrf-remote-principal-seam | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T21:00:33.831Z | 2026-09-23T21:03:11.010Z | 00:02:37 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-csrf-remote-principal-seam-Reconnaissance.md |
| redaction-full-payload-seam | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T21:00:33.950Z | 2026-09-23T21:05:02.061Z | 00:04:28 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-redaction-full-payload-seam-Reconnaissance.md |
| security-fixes-regression-map | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-23T21:00:33.973Z | 2026-09-23T21:08:28.358Z | 00:07:54 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-security-fixes-regression-map-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane csrf-remote-principal-seam: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane redaction-full-payload-seam: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane security-fixes-regression-map: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: csrf-remote-principal-seam (objective 771b27e92ab4)
- Objective: REMOTE ACCESS V1 — REQUIRED FIX 1 RECON ONLY.

READ-ONLY. DO NOT MODIFY SOURCE. DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Authority/context:

* REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md
* newest REPORTS/Codex report containing Remote-Access-v1-Stage-1
* newest Claude Stage 1 security review if present

Known Opus finding:
Remote-device principals are injected in-process, but the current CSRF/Origin guard in daemon.ts only runs for cookie-authenticated principals. Once Stage 2 creates remote-device principals, phone mutations could bypass X-Sideline-Action and Origin protection. Also, remote requests cannot rely on forwarded Host for Origin comparison.

Scout ONLY this seam.

Inspect the smallest relevant source/test surface, especially:

* src/control-plane/daemon.ts
* src/control-plane/request-security.ts
* src/control-plane/remote-routes.ts
* test/remote-access-v1-stage1.test.mjs
* ADR assumptions for future remote dispatch / hostPublicId / public origin

Deliver a surgical patch map for Codex:

1. exact functions/branches/line neighborhoods involved;
2. current control flow from request → principal → CSRF check → route dispatch;
3. safest minimal condition for applying CSRF protection to remote-device;
4. how expected remote public Origin should be supplied/derived without trusting a forgeable request header;
5. Stage 2 dependencies that DO NOT need implementation yet;
6. exact focused tests to add;
7. regressions/hazards to avoid;
8. anything in Opus's proposed fix that is incomplete or subtly wrong.

Do not redesign Remote Access.
Do not scout unrelated security.
Do not modify files.
Do not commit or push.

Goal: allow Codex MEDIUM to implement Fix 1 without broad repository exploration.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-csrf-remote-principal-seam-Reconnaissance.md

**Key discoveries:** **FACT:** The security gap is confirmed - remote-device principals bypass CSRF/Origin protection that cookie-authenticated principals receive.

**INFERENCE:** This creates a security vulnerability where Stage 2 remote-device principals could bypass X-Sideline-Action and Origin protection during phone mutations.

**RECOMMENDATION:** Apply CSRF/Origin protection to remote-device principals using the same pattern as cookie-authenticated principals, but using a trusted remote origin provided by the in-process injection system rather than request headers.

The fix requires changes to `src/control-plane/daemon.ts` to add CSRF protection for remote-device principals, while maintaining compatibility with the existing in-process injection architecture that Stage 2 will implement.

**FACT:** **Evidence:** In `src/control-plane/daemon.ts` lines 1151-1156:
```typescript
if (principal.authenticatedBy === 'cookie' && method !== 'GET' && method !== 'HEAD') {
  if (req.headers['x-sideline-action'] !== '1' || !requestOriginMatchesHost(req.headers.origin, req.headers.host)) {
    this.sendJson(res, 403, { success: false, message: 'Request origin could not be verified.' });
    return;
  }
}
```

**Analysis:** This check only protects cookie-authenticated principals (`authenticatedBy: 'cookie'`). Remote-device principals (`authenticatedBy: 'in-process'`) completely bypass this CSRF/Origin verification.

**INFERENCE:** 1. **Overly broad CSRF protection:** Don't apply CSRF protection to bearer-authenticated principals (they already have different trust model)
2. **Double protection:** Don't apply CSRF protection to local-admin cookie principals if they're already covered
3. **Wrong origin verification:** Don't use request headers for origin verification for remote-device principals (must use trusted in-process origin)
4. **Missing method coverage:** Ensure GET/HEAD requests are properly exempted

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: redaction-full-payload-seam (objective 01fd0f7fa84c)
- Objective: REMOTE ACCESS V1 — REQUIRED FIX 2 RECON ONLY.

READ-ONLY. DO NOT MODIFY SOURCE. DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Authority/context:

* REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md
* newest REPORTS/Codex report containing Remote-Access-v1-Stage-1
* newest Claude Stage 1 security review if present

Known Opus finding:
src/remote-redaction.ts currently caps redaction input at approximately 8,000 characters. redactForPrincipal applies this to remote strings, so long report/SSE/status payload strings can be truncated and a secret beyond the cap could either be lost or remain unsafe depending on implementation strategy.

Scout ONLY this seam.

Inspect the smallest relevant source/test surface, especially:

* src/remote-redaction.ts
* src/player-activity.ts
* relevant daemon report/SSE/status redaction calls
* test/remote-access-v1-stage1.test.mjs
* any existing redaction tests

Deliver a surgical patch map for Codex:

1. exact current redaction pipeline;
2. why the 8 KB cap exists if source/history/comments reveal it;
3. every payload type affected;
4. safest minimal whole-string strategy;
5. if chunking is recommended, determine required overlap from the ACTUAL redaction patterns rather than guessing;
6. regex/performance/ReDoS considerations;
7. preservation of exact payload length/content except for intended redactions;
8. test design using >8 KB content with a synthetic secret after the old cutoff;
9. tests for secrets that cross a chunk boundary if chunking is used;
10. ensure Dev terminal override still cannot bypass hard-secret redaction.

Do not redesign the redaction system beyond what is necessary.
Do not modify files.
Do not commit or push.

Goal: allow Codex MEDIUM to implement Fix 2 without rediscovering the redaction architecture.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-redaction-full-payload-seam-Reconnaissance.md

**Key discoveries:** - The `REGEX_INPUT_CAP = 8_000` constant is used in two places:  
  - `src/remote-redaction.ts` line 12 and line 35 (`redactSecrets` function)  
  - `src/player-activity.ts` line 57 and line 79 (`normalizeActivityText` function)  
- All remote payloads flow through `redactForPrincipal` → `redactSecrets` (with truncation) → optional terminal details redaction.  
- Affected payloads: report list/report bodies (`/api/reports`, `/api/report`), status (`/api/status`), player activity (`/api/player-activity`), and SSE events (status, ai-health, execution).  
- The redaction patterns (15 rules) are linear (no nested quantifiers or catastrophic backtracking) and thus safe for long strings.  
- No documentation or comments explain the 8 KB value; it is likely a heuristic boundary to limit worst-case regex processing time.  
- The Dev terminal override (`allowSensitiveTerminalOutput`) only affects path redaction (`redactRemoteTerminalDetails`) and never bypasses hard-secret patterns in `redactSecrets`.

**FACT:** - `src/remote-redaction.ts:12`: `const REGEX_INPUT_CAP = 8_000;`  
- `src/remote-redaction.ts:35`: `let out = String(text).slice(0, REGEX_INPUT_CAP);` in `redactSecrets`  
- `src/player-activity.ts:57`: `const REGEX_INPUT_CAP = 8_000;`  
- `src/player-activity.ts:79`: `let text = String(value ?? '').slice(0, REGEX_INPUT_CAP).replace(ANSI, '').replace(CONTROL, '');` in `normalizeActivityText`  
- `src/control-plane/daemon.ts:1904`: `this.sendJson(res, 200, redactForPrincipal(reports, principal));` (report list)  
- `src/control-plane/daemon.ts:1995`: `this.sendJson(res, 200, redactForPrincipal(found, principal));` (report body)  
- `src/control-plane/daemon.ts:1267`: `this.sendJson(res, 200, redactForPrincipal(this.buildStatus(), principal));` (status)  
- `src/control-plane/daemon.ts:1257-1261`: Player activity endpoint uses `redactForPrincipal` with `terminalActivity: true`  
- `src/control-plane/daemon.ts:3264-3272`: SSE events use `redactForPrincipal` for status, ai-health, and execution data  
- `test/remote-access-v1-stage1.test.mjs:177-199`: Test RA1-7 validates remote redaction of secrets in reports and confirms terminal override does not affect hard secrets  
- All redaction patterns in `src/remote-redaction.ts:16-32` are linear (no exponential backtracking risk)

**INFERENCE:** - The 8 KB cap exists to prevent ReDoS by bounding regex input size, though the patterns themselves are linear and likely safe for longer inputs.  
- Removing the cap will allow full payload redaction without truncation, preserving non-secret content and ensuring secrets beyond 8 KB are redacted.  
- Chunking is unnecessary because the patterns are linear and context-independent; processing the whole string avoids boundary-missed secrets.  
- The Dev terminal override cannot bypass hard-secret redaction because `redactSecrets` (which includes hard-secret patterns) is always applied before any terminal-specific redaction.

**UNKNOWN:** - Whether the 8 KB value was chosen based on specific threat modeling, benchmarking, or historical incident data (no source comments or documentation found).  
- If there are any implicit dependencies on the truncation behavior elsewhere in the codebase (beyond the inspected surfaces).

**CONTRADICTION:** - None found. All evidence consistently shows the cap is applied uniformly and the patterns are safe for longer strings.

**Important files:** - `src/remote-redaction.ts` – Core redaction logic with 8 KB cap  
- `src/player-activity.ts` – Player activity normalization also caps at 8 KB  
- `src/control-plane/daemon.ts` – Usage sites for report list, report body, status, player activity, and SSE events  
- `test/remote-access-v1-stage1.test.mjs` – Existing test validating remote redaction (RA1-7)

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: security-fixes-regression-map (objective 3fac545c9e78)
- Objective: REMOTE ACCESS V1 — REQUIRED FIXES REGRESSION / ACCEPTANCE RECON ONLY.

READ-ONLY. DO NOT MODIFY SOURCE. DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Two required fixes have already been identified by Opus:

FIX 1:
remote-device mutations must receive correct X-Sideline-Action + Origin CSRF enforcement before Stage 2 remote dispatch exists.

FIX 2:
remote redaction must process complete strings instead of silently truncating around 8 KB, while preserving hard-secret protection.

Scout the REGRESSION SURFACE, not the implementation solution.

Inspect only the tests/contracts affected by these changes, including:

* Stage 1 focused tests
* Live Player Terminal
* reports
* SSE
* Settings / Dev terminal override
* route classification
* request security
* Player Activity redaction
* any relevant daemon/browser harnesses

Deliver:

1. minimum focused test command after Fix 1;
2. minimum focused test command after Fix 2;
3. minimum adjacent regression suite after both;
4. behavioral contracts neither fix may alter;
5. likely brittle tests/harness assumptions;
6. Stage 2 prerequisites these fixes must establish;
7. explicit GO/NO-GO acceptance checklist for Codex;
8. identify tests that are unrelated/pre-existing and should not trigger exploration.

Do NOT solve the fixes unless needed to explain a regression contract.
Do NOT broaden into Stage 2 implementation.
Do not modify files.
Do not commit or push.

Goal: give Codex a precise acceptance map so it does not spend premium reasoning rediscovering regression territory.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-security-fixes-regression-map-Reconnaissance.md

**Key discoveries:** Reconnaissance complete. The two Opus-identified fixes target distinct but adjacent security boundaries in the Stage 1 Remote Access implementation. Evidence maps to specific source files, route policies, and test contracts.

---

**FACT:** | Claim | Evidence |
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

**INFERENCE:** | Inference | Basis |
|-----------|-------|
| Fix 1 must extend CSRF check to `remote-device` principals on `remote-mutate` routes | Current check only guards `cookie` auth; Bearer token mutations (extension/CLI) intentionally exempt per `RA1-5` line 136-137 |
| Fix 2 must remove or raise `REGEX_INPUT_CAP` without weakening secret detection | Truncation is a DoS guard; secret patterns must still match across chunk boundaries if streaming |
| Stage 2 remote dispatch will inherit these boundaries | `remote-routes.ts` already classifies `/api/dispatch` as `remote-mutate` |
| Browser SSE and backfill already use the shared `redactForPrincipal` boundary | `daemon.ts:1257-1261` applies redaction with `terminalActivity: true` |
| `remoteSensitiveTerminalOutput` is purely presentation — no route/file/credential policy change | `running-players.ts:71-72`, `remote-redaction.ts:8-9` |

---

**UNKNOWN:** | Question | Why Unknown |
|----------|-------------|
| Whether Stage 2 will introduce new `remote-mutate` routes not yet in `DAEMON_ROUTE_POLICIES` | Stage 2 not implemented; route table is the authoritative extension point |
| Whether 8 KB cap was chosen for DoS protection or historical accident | No comment in source; `REGEX_INPUT_CAP` appears in two files identically |
| Whether streaming redaction (chunked input) is required for terminal output >8 KB | Current architecture re-sanitizes per-notification; terminal fragments are coalesced in `PlayerActivityStore` |
| Exact maximum report size seen in production | No telemetry in repo; `ACTIVITY_MESSAGE_MAX = 1200`, `ACTIVITY_LINE_MAX = 240` suggest typical lines are small |

---

**CONTRADICTION:** None found. The code is internally consistent: CSRF enforcement matches the authentication model, and the 8 KB cap applies uniformly to both report/terminal redaction paths.

---

**Important files:** | File | Role |
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

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane csrf-remote-principal-seam: **FACT:** The security gap is confirmed - remote-device principals bypass CSRF/Origin protection that cookie-authenticated principals receive. **INFERENCE:** This creates a security vulnerability where Stage 2 remote-device principals could bypass X-Sideline-Action and Origin protection during phone mutations. **RECOMMENDATION:** Apply CSRF/Origin protection to remote-device principals using the s
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane redaction-full-payload-seam: The 8 KB input cap in `src/remote-redaction.ts` truncates all remote payloads (reports, status, SSE events, player activity) before applying hard-secret and pattern-based redactions. This risks truncating secrets beyond the cap, leaving them exposed or causing data loss. The cap appears to be a ReDoS-prevention measure, but analysis shows the redaction regexes are linear and safe for longer string
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane security-fixes-regression-map: Reconnaissance complete. The two Opus-identified fixes target distinct but adjacent security boundaries in the Stage 1 Remote Access implementation. Evidence maps to specific source files, route policies, and test contracts. ---

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane redaction-full-payload-seam: - None found. All evidence consistently shows the cap is applied uniformly and the patterns are safe for longer strings.
- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane security-fixes-regression-map: None found. The code is internally consistent: CSRF enforcement matches the authentication model, and the 8 KB cap applies uniformly to both report/terminal redaction paths. ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane csrf-remote-principal-seam · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-csrf-remote-principal-seam-Reconnaissance.md
- Lane redaction-full-payload-seam · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-redaction-full-payload-seam-Reconnaissance.md
- Lane security-fixes-regression-map · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015\SCOUT-security-fixes-regression-map-Reconnaissance.md

### Full report — lane csrf-remote-principal-seam (sideline-scout-quick)

# SCOTT RECONNAISSANCE REPORT
## SCOTT AGENT: sideline-scout-quick
## MODEL: openrouter/cohere/north-mini-code:free

## BOUNDED OBJECTIVE
REMOTE ACCESS V1 — REQUIRED FIX 1 RECON ONLY.

## GAME ROOT
C:\Users\dmcal\Documents\GitHub\SidelineCoach

## REPORT ID
remote-access-stage1-required-fixes-recon-20260923-150015

## KEY DISCOVERIES

### FACT 1: Current CSRF/Origin Protection is Incomplete
**Evidence:** In `src/control-plane/daemon.ts` lines 1151-1156:
```typescript
if (principal.authenticatedBy === 'cookie' && method !== 'GET' && method !== 'HEAD') {
  if (req.headers['x-sideline-action'] !== '1' || !requestOriginMatchesHost(req.headers.origin, req.headers.host)) {
    this.sendJson(res, 403, { success: false, message: 'Request origin could not be verified.' });
    return;
  }
}
```

**Analysis:** This check only protects cookie-authenticated principals (`authenticatedBy: 'cookie'`). Remote-device principals (`authenticatedBy: 'in-process'`) completely bypass this CSRF/Origin verification.

### FACT 2: Remote-Device Principals Cannot Be Resolved
**Evidence:** In `src/control-plane/daemon.ts` lines 3833-3847, the `resolvePrincipal` method:
```typescript
private resolvePrincipal(req: http.IncomingMessage): Principal | undefined {
  if (!this.authToken) return { kind: 'local-admin', authenticatedBy: 'bearer' };
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (timingSafeSecretEqual(bearer, this.authToken)) return { kind: 'local-admin', authenticatedBy: 'bearer' };
  const sessionToken = parseCookies(req.headers.cookie).get('sl_local');
  if (!sessionToken) return undefined;
  const key = this.hashSessionToken(sessionToken);
  const expiresAt = this.localSessions.get(key);
  if (!expiresAt || expiresAt <= Date.now()) {
    this.localSessions.delete(key);
    return undefined;
  }
  this.localSessions.set(key, Date.now() + 30 * 24 * 60 * 60 * 1000);
  return { kind: 'local-admin', authenticatedBy: 'cookie' };
}
```

**Analysis:** The `resolvePrincipal` method only creates `local-admin` principals. Remote-device principals must be injected in-process, which aligns with the Opus finding that "remote-device principals are injected in-process."

### FACT 3: CSRF/Origin Protection Seams
**Evidence:** In `src/control-plane/daemon.ts` line 1142:
```typescript
const principal = injectedPrincipal ?? this.resolvePrincipal(req);
```

**Analysis:** Principals come from either:
1. `injectedPrincipal` parameter (for remote-device principals from Stage 2)
2. `this.resolvePrincipal(req)` (for local-admin principals)

Only the cookie-authenticated path has CSRF protection.

### FACT 4: Remote-Device Principal Definition
**Evidence:** In `src/control-plane/request-security.ts` line 5:
```typescript
| { kind: 'remote-device'; deviceId: string; authenticatedBy: 'in-process' };
```

**Analysis:** Remote-device principals are defined with `authenticatedBy: 'in-process'`, confirming they must be injected and cannot be forged from HTTP headers.

## ARCHITECTURAL ANALYSIS

### Current Control Flow (lines 1140-1156 in daemon.ts):
1. `const principal = injectedPrincipal ?? this.resolvePrincipal(req);` (line 1142)
2. **Route classification** - `principalMayAccess(principal, access)` (line 1147)
3. **CSRF check** - only for `principal.authenticatedBy === 'cookie'` (lines 1151-1156)
4. Route handling (SSE, AI-health, file operations, etc.)

### Security Gap:
- **Lines 1151-1156**: CSRF/Origin protection only for cookie-authenticated principals
- **Missing**: No equivalent protection for remote-device principals (`authenticatedBy: 'in-process'`)

## SURGEON PATCH MAP FOR CODEX

### 1. Exact Functions/Branches/Line Neighborhoods Involved
**Primary location:** `src/control-plane/daemon.ts` lines 1151-1156
**Secondary location:** `src/control-plane/request-security.ts` - principal type definition
**Test verification:** `test/remote-access-v1-stage1.test.mjs` line 129-134 (existing cookie CSRF tests)

### 2. Current Control Flow Analysis
**FACT:** The flow from request → principal → CSRF check → route dispatch:
1. HTTP request arrives → `handleHttpRequest` (line 1057)
2. Principal resolution: `injectedPrincipal ?? this.resolvePrincipal(req)` (line 1142)
3. Route classification: `principalMayAccess(principal, access)` (line 1147)
4. **CONDITIONAL CSRF check**: Only for `principal.authenticatedBy === 'cookie'` (line 1151)
5. Route execution

### 3. Safest Minimal Condition for CSRF Protection to Remote-Device
**INFERENCE:** Based on the established pattern for cookie-authenticated principals, the condition should be:
```typescript
if (principal.kind === 'remote-device' && method !== 'GET' && method !== 'HEAD') {
  // Apply CSRF/Origin protection for remote-device principals
}
```

### 4. Expected Remote Public Origin Supply/Derivation
**FACT:** Remote-device principals are "accepted only as an in-process injected principal for the later relay stage; it cannot be forged from HTTP headers, cookies, or query parameters" (Codex report line 59).

**INFERENCE:** The expected remote origin must be:
1. **Trusted and non-forgeable** - established through in-process injection mechanisms
2. **Derivable without request headers** - cannot rely on forwarded Host for Origin comparison as noted in Opus finding
3. **Consistent with Stage 2 design** - must be provided by the in-process injection system that creates remote-device principals

**RECOMMENDATION:** The safest approach is to require the in-process injection system to provide the expected remote origin, and the CSRF check should use this trusted origin instead of request headers.

### 5. Stage 2 Dependencies That Do Not Need Implementation Yet
**FACT:** According to Codex report lines 147-150:
- "The Stage 2 remote frame transport does not exist yet, by design"
- "The in-process `remote-device` entry seam and route/redaction policy are implemented, but full relay/pairing end-to-end enforcement cannot be exercised until that transport is built"

**INFERENCE:** We don't need to:
- Implement remote relay/pairing transport
- Build the full end-to-end Stage 2 system
- Create actual remote-device injection logic
- Implement remote frame transport

**BUT WE DO NEED TO:** 
- Add CSRF protection for when remote-device principals are eventually injected
- Provide a mechanism for the in-process injection system to supply trusted remote origin

### 6. Exact Focused Tests to Add
**INFERENCE:** Based on existing test `test/remote-access-v1-stage1.test.mjs` lines 129-134:
- Existing tests verify cookie CSRF protection
- We need analogous tests for remote-device principal CSRF protection when they exist
- Tests should verify that remote-device principals require X-Sideline-Action and Origin verification

**RECOMMENDATION:** Add tests that would verify the fix once remote-device injection is implemented:
```javascript
// Pseudocode for test
test('RA1-9. remote-device principals enforce X-Sideline-Action and Origin when injected', () => {
  // When remote-device principals are injected via in-process mechanism
  const remotePrincipal = { kind: 'remote-device', deviceId: 'test-device', authenticatedBy: 'in-process' };
  // Verify that remote principal requires X-Sideline-Action: 1 and same-origin Origin header
});
```

### 7. Regressions/Hazards to Avoid
**INFERENCE:**
1. **Overly broad CSRF protection:** Don't apply CSRF protection to bearer-authenticated principals (they already have different trust model)
2. **Double protection:** Don't apply CSRF protection to local-admin cookie principals if they're already covered
3. **Wrong origin verification:** Don't use request headers for origin verification for remote-device principals (must use trusted in-process origin)
4. **Missing method coverage:** Ensure GET/HEAD requests are properly exempted

### 8. Incomplete or Subtle Issues in Opus's Proposed Fix
**CONTRADICTION:** The Opus finding states "remote-device principals are injected in-process, but the current CSRF/Origin guard in daemon.ts only runs for cookie-authenticated principals." This is **incomplete** because it doesn't address:

1. **Missing origin verification mechanism:** The finding doesn't specify HOW the remote origin should be established without trusting forgeable request headers
2. **Incomplete fix scope:** The finding focuses only on daemon.ts but doesn't mention the corresponding changes needed in request-security.ts or remote-routes.ts
3. **Trust boundary gaps:** The finding doesn't address the trust transition from in-process injection to runtime CSRF checks

**ARCHITECT DECISION REQUIRED:** 
1. **How to establish trusted remote origin:** Must be provided by the in-process injection system
2. **Where to store/validate remote origin:** Likely needs to be part of the Principal type or passed via injection mechanism
3. **Which methods need CSRF protection:** Should mirror cookie-authenticated principal protection

## SUMMARY

**FACT:** The security gap is confirmed - remote-device principals bypass CSRF/Origin protection that cookie-authenticated principals receive.

**INFERENCE:** This creates a security vulnerability where Stage 2 remote-device principals could bypass X-Sideline-Action and Origin protection during phone mutations.

**RECOMMENDATION:** Apply CSRF/Origin protection to remote-device principals using the same pattern as cookie-authenticated principals, but using a trusted remote origin provided by the in-process injection system rather than request headers.

The fix requires changes to `src/control-plane/daemon.ts` to add CSRF protection for remote-device principals, while maintaining compatibility with the existing in-process injection architecture that Stage 2 will implement.

### Full report — lane redaction-full-payload-seam (sideline-scout-balanced)

# Sideline Coach Reconnaissance Report

**Scout ID**: redaction-full-payload-seam  
**Agent**: sideline-scout-balanced  
**Model**: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Type**: Read-Only Reconnaissance (No modifications made)  
**Objective**: Remote Access V1 — Required Fix 2 Recon Only (inspecting the 8 KB redaction cap seam)  

## RESULT
The 8 KB input cap in `src/remote-redaction.ts` truncates all remote payloads (reports, status, SSE events, player activity) before applying hard-secret and pattern-based redactions. This risks truncating secrets beyond the cap, leaving them exposed or causing data loss. The cap appears to be a ReDoS-prevention measure, but analysis shows the redaction regexes are linear and safe for longer strings. The safest fix is to remove the cap while preserving the existing redaction logic, ensuring exact payload preservation except for intended redactions. The Dev terminal override cannot bypass hard-secret redaction as it applies only after secret redaction.

## KEY DISCOVERIES
- The `REGEX_INPUT_CAP = 8_000` constant is used in two places:  
  - `src/remote-redaction.ts` line 12 and line 35 (`redactSecrets` function)  
  - `src/player-activity.ts` line 57 and line 79 (`normalizeActivityText` function)  
- All remote payloads flow through `redactForPrincipal` → `redactSecrets` (with truncation) → optional terminal details redaction.  
- Affected payloads: report list/report bodies (`/api/reports`, `/api/report`), status (`/api/status`), player activity (`/api/player-activity`), and SSE events (status, ai-health, execution).  
- The redaction patterns (15 rules) are linear (no nested quantifiers or catastrophic backtracking) and thus safe for long strings.  
- No documentation or comments explain the 8 KB value; it is likely a heuristic boundary to limit worst-case regex processing time.  
- The Dev terminal override (`allowSensitiveTerminalOutput`) only affects path redaction (`redactRemoteTerminalDetails`) and never bypasses hard-secret patterns in `redactSecrets`.  

## FACT
- `src/remote-redaction.ts:12`: `const REGEX_INPUT_CAP = 8_000;`  
- `src/remote-redaction.ts:35`: `let out = String(text).slice(0, REGEX_INPUT_CAP);` in `redactSecrets`  
- `src/player-activity.ts:57`: `const REGEX_INPUT_CAP = 8_000;`  
- `src/player-activity.ts:79`: `let text = String(value ?? '').slice(0, REGEX_INPUT_CAP).replace(ANSI, '').replace(CONTROL, '');` in `normalizeActivityText`  
- `src/control-plane/daemon.ts:1904`: `this.sendJson(res, 200, redactForPrincipal(reports, principal));` (report list)  
- `src/control-plane/daemon.ts:1995`: `this.sendJson(res, 200, redactForPrincipal(found, principal));` (report body)  
- `src/control-plane/daemon.ts:1267`: `this.sendJson(res, 200, redactForPrincipal(this.buildStatus(), principal));` (status)  
- `src/control-plane/daemon.ts:1257-1261`: Player activity endpoint uses `redactForPrincipal` with `terminalActivity: true`  
- `src/control-plane/daemon.ts:3264-3272`: SSE events use `redactForPrincipal` for status, ai-health, and execution data  
- `test/remote-access-v1-stage1.test.mjs:177-199`: Test RA1-7 validates remote redaction of secrets in reports and confirms terminal override does not affect hard secrets  
- All redaction patterns in `src/remote-redaction.ts:16-32` are linear (no exponential backtracking risk)  

## INFERENCE
- The 8 KB cap exists to prevent ReDoS by bounding regex input size, though the patterns themselves are linear and likely safe for longer inputs.  
- Removing the cap will allow full payload redaction without truncation, preserving non-secret content and ensuring secrets beyond 8 KB are redacted.  
- Chunking is unnecessary because the patterns are linear and context-independent; processing the whole string avoids boundary-missed secrets.  
- The Dev terminal override cannot bypass hard-secret redaction because `redactSecrets` (which includes hard-secret patterns) is always applied before any terminal-specific redaction.  

## UNKNOWN
- Whether the 8 KB value was chosen based on specific threat modeling, benchmarking, or historical incident data (no source comments or documentation found).  
- If there are any implicit dependencies on the truncation behavior elsewhere in the codebase (beyond the inspected surfaces).  

## CONTRADICTION
- None found. All evidence consistently shows the cap is applied uniformly and the patterns are safe for longer strings.  

## IMPORTANT FILES / PATHS
- `src/remote-redaction.ts` – Core redaction logic with 8 KB cap  
- `src/player-activity.ts` – Player activity normalization also caps at 8 KB  
- `src/control-plane/daemon.ts` – Usage sites for report list, report body, status, player activity, and SSE events  
- `test/remote-access-v1-stage1.test.mjs` – Existing test validating remote redaction (RA1-7)  

## LIMITATIONS
- Reconnaissance limited to the specified seam; did not inspect unrelated codepaths.  
- Relied on pattern analysis for ReDoS risk; did not execute regex engines against pathological inputs.  
- Did not review git history or external documentation for cap rationale.  

---  
*This report represents reconnaissance findings, not final architectural authority. The trusted Runner will persist it for implementation planning.*

### Full report — lane security-fixes-regression-map (sideline-scout-deep)

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

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-stage1-required-fixes-recon-20260923-150015
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-stage1-required-fixes-recon-20260923-150015

