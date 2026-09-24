# Remote Access v1 · Stage 1 Security Fixes — Codex Field Packet

**Agent:** Anti-Gravity · **Role:** A-Team Scout / Architecture Reconciler  
**Target:** Codex (Medium Effort Implementation Packet)  
**Date:** 2026-09-23  
**Status:** READY FOR CODEX EXECUTION  

---

## A. VERDICT

### **READY**

Both required Stage 1 security repairs are fully understood, mathematically bounded, and ready for immediate implementation by Codex (Medium Effort). Neither repair requires broad repository discovery, relay implementation, or Stage 2 transport construction.

---

## B. SLICE 1 — REMOTE CSRF / ORIGIN ENFORCEMENT

### 1. Exact Files Involved
* `src/control-plane/request-security.ts`
* `src/control-plane/daemon.ts`
* `test/remote-access-v1-stage1.test.mjs`

### 2. Exact Functions & Seams
* `src/control-plane/request-security.ts`: `Principal` type definition (lines 3–6) and new helper `requestOriginMatchesExpected`.
* `src/control-plane/daemon.ts`: `handleHttpRequest()` CSRF enforcement block (lines 1151–1156).

### 3. How Trusted Expected Origin Enters the In-Process Seam
`remote-device` principals enter exclusively in-process via `injectedPrincipal` into `handleHttpRequest(req, res, injectedPrincipal)`. They cannot be forged via HTTP headers, cookies, or query strings.
* **Mechanism:** Add `expectedOrigin?: string` directly to the `remote-device` variant of the `Principal` discriminated union in `request-security.ts`.
* When Stage 2 injects a `remote-device` principal, the in-process caller (which already knows the host's assigned public domain from relay registration, e.g. `https://h-<hostPublicId>.<relay-domain>`) supplies `expectedOrigin`.
* For CSRF checks on remote mutations, the daemon compares `req.headers.origin` directly against `principal.expectedOrigin`. It does **not** inspect or trust the request's `Host` header (which may be omitted, stripped, or spoofed by intermediate hops). If `principal.expectedOrigin` is missing or does not match `req.headers.origin`, the check fails closed (HTTP 403).

### 4. Smallest Implementation Change

#### A. In `src/control-plane/request-security.ts`:
Update `Principal` and export `requestOriginMatchesExpected`:
```typescript
export type Principal =
  | { kind: 'local-admin'; authenticatedBy: 'bearer' | 'cookie' }
  | { kind: 'remote-device'; deviceId: string; authenticatedBy: 'in-process'; expectedOrigin?: string };

export function requestOriginMatchesExpected(origin: string | undefined, expectedOrigin: string | undefined): boolean {
  if (!origin || !expectedOrigin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
```

#### B. In `src/control-plane/daemon.ts` (around line 1151):
Replace lines 1151–1156 with:
```typescript
    if ((principal.authenticatedBy === 'cookie' || principal.kind === 'remote-device') && method !== 'GET' && method !== 'HEAD') {
      const originMatches = principal.kind === 'remote-device'
        ? requestOriginMatchesExpected(req.headers.origin, principal.expectedOrigin)
        : requestOriginMatchesHost(req.headers.origin, req.headers.host);
      if (req.headers['x-sideline-action'] !== '1' || !originMatches) {
        this.sendJson(res, 403, { success: false, message: 'Request origin could not be verified.' });
        return;
      }
    }
```
Import `requestOriginMatchesExpected` from `./request-security` at top of `daemon.ts`.

### 5. What NOT to Change
* **DO NOT** apply CSRF checks to `local-admin` with `bearer` authentication. Trusted local CLI / VS Code extension requests (`Authorization: Bearer <token>`) must remain exempt from CSRF.
* **DO NOT** alter the local cookie CSRF check: `principal.authenticatedBy === 'cookie'` continues to compare `origin` against `req.headers.host`.
* **DO NOT** alter `GET` or `HEAD` handling: safe methods remain exempt.
* **DO NOT** alter `resolvePrincipal()`: `remote-device` must **never** be resolved from HTTP headers, cookies, or queries.
* **DO NOT** implement Stage 2 frame transports, relay clients, or device pairing.

### 6. Focused Test Additions
In `test/remote-access-v1-stage1.test.mjs`, add tests in `RA1-5` or as a new test `RA1-5b`:
1. `requestOriginMatchesExpected` helper unit assertions (`true` on matching scheme/host, `false` on foreign/missing).
2. Remote mutation via `handleHttpRequest` (or injected principal via local harness) on a `remote-mutate` route (e.g. `POST /api/dispatch` or `POST /api/preferences`):
   * Without `X-Sideline-Action: 1` → returns **403**.
   * With `X-Sideline-Action: 1` but `Origin: https://evil.test` (mismatched) → returns **403**.
   * With `X-Sideline-Action: 1` and missing `principal.expectedOrigin` → returns **403**.
   * With `X-Sideline-Action: 1` and matching `Origin: https://h-test.sideline.live` → proceeds past CSRF guard.

### 7. Exact Test Command
```bash
npm run compile && node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-5"
```

### 8. STOP Condition for Slice 1
Stop when `RA1-5` and the new remote CSRF test pass cleanly, and `npm run compile` produces zero errors.

---

## C. SLICE 2 — FULL-PAYLOAD REMOTE REDACTION

### 1. Exact Files Involved
* `src/remote-redaction.ts`
* `test/remote-access-v1-stage1.test.mjs`

### 2. Exact Functions & Seams
* `src/remote-redaction.ts`: `REGEX_INPUT_CAP` (line 12) and `redactSecrets()` (lines 34–38).

### 3. Resolution of the Cap Question: `remote-redaction.ts` vs `player-activity.ts`
* **Defect Location:** The defect is **exclusively** in `src/remote-redaction.ts`. `redactForPrincipal` calls `redactSecrets`, which is applied to entire reports (`/api/report`), status snapshots, and SSE payloads. Slicing at 8,000 chars truncates legitimate reports (which can legally be up to 2 MB per `maxReportBytes`) and leaves any secrets after 8 KB unredacted.
* **Player Activity Invariant:** In `src/player-activity.ts`, lines are already structurally clamped to `ACTIVITY_LINE_MAX = 240` and messages to `ACTIVITY_MESSAGE_MAX = 1200`. The 8 KB cap in `player-activity.ts` is an upstream defense-in-depth sanitization limit for terminal activity chunks.
* **Instruction for Codex:** **Remove the cap in `src/remote-redaction.ts` ONLY.** Do **NOT** touch `src/player-activity.ts`.

### 4. Safest Full-Payload Strategy
* **Analysis:** All 15 regex patterns in `REDACTION_RULES` (`src/remote-redaction.ts:16-32`) are linear scanning patterns without nested quantifiers or catastrophic backtracking hazards.
* **Strategy:** Process the whole string directly without slicing.
* **Why Chunking is Unnecessary and Dangerous:** Chunking introduces complex boundary edge cases (e.g. a 40-character secret or private key header split across an 8 KB boundary). Operating on the full string in memory is fast, safe, and guarantees zero missed split secrets.
* **Implementation in `src/remote-redaction.ts`:**
  * Remove `const REGEX_INPUT_CAP = 8_000;` (line 12).
  * Update `redactSecrets()` (lines 34–38) to:
    ```typescript
    export function redactSecrets(text: string): string {
      let out = String(text);
      for (const [pattern, replacement] of REDACTION_RULES) out = out.replace(pattern, replacement);
      return out;
    }
    ```

### 5. Terminal Override Invariant
The dev terminal override (`allowSensitiveTerminalOutput: true`) in `redactForPrincipal()` **only** bypasses `redactRemoteTerminalDetails()` (home folder path masking). `redactSecrets()` runs on every string unconditionally *before* terminal detail masking. This invariant remains completely untouched.

### 6. Focused Test Additions
In `test/remote-access-v1-stage1.test.mjs`, expand `RA1-7`:
1. Construct a report string longer than 8 KB (e.g. 12,000 characters) with an AWS key (`AKIAIOSFODNN7EXAMPLE`) and a Bearer token located well beyond the 8 KB mark (e.g. at index 10,000).
2. Pass through `redactForPrincipal(report, remote)`.
3. Assert:
   * The returned report content length is **not** truncated to 8,000 characters (full length preserved minus redacted token replacement delta).
   * The secret at index 10,000 is redacted (`[redacted]`).
   * Non-secret content before and after 8 KB is preserved verbatim.

### 7. Exact Test Command
```bash
npm run compile && node --test test/remote-access-v1-stage1.test.mjs --test-name-pattern="RA1-7"
```

### 8. STOP Condition for Slice 2
Stop when `RA1-7` passes with the >8 KB full-payload test, and `npm run compile` produces zero errors.

---

## D. AFTER BOTH: MINIMUM ADJACENT REGRESSION SUITE

Run the targeted adjacent regression command mapped by the Scout formation:

```bash
npm run compile && node --test test/remote-access-v1-stage1.test.mjs test/live-player-terminal-v02-transport.test.mjs test/live-player-console-first-down.test.mjs
```

**Passing Criteria:** All 50 existing tests + the new Slice 1 & Slice 2 tests must pass with zero failures.

---

## E. CODEX DO-NOT-EXPLORE LIST

Codex must **NOT** investigate, refactor, or attempt to fix failures in orthogonal subsystems. The following areas are strictly out of scope:

| Do-Not-Explore Area | Reason |
| :--- | :--- |
| `src/player-activity.ts` | Activity line/message limits are intentional; do not touch `REGEX_INPUT_CAP` here. |
| `dev-harness.test.mjs` | Multi-Game VS Code launch harness tooling; unrelated to transport security. |
| `q2-10*.test.mjs` | Routing engine, context-affinity, and work-ledger decision policies. |
| `coach-routines-*.test.mjs` | Routine CRUD operations and delivery tracking. |
| `scout-*.test.mjs` | Scout formation, tryout, and Combine machinery. |
| `player-control-*.test.mjs` | Extension host Player process management. |
| `game-filesystem-*.test.mjs` | S6/S8/S10 local filesystem contracts and watchers. |
| `health-authority*.test.mjs` | AI token and usage rate telemetry acquisition. |
| Stage 2 Relay / Frame Transport | Do not create relay sockets, WebSocket adapters, or device pairing logic. |

---

## F. STAGE 2 GATE CRITERIA

These two repairs directly fulfill Claude's conditional **GO** for Stage 2 under the following exact verification conditions:

1. **CSRF Gate:** Any mutation request evaluated under `principal.kind === 'remote-device'` fails with HTTP 403 unless it presents `X-Sideline-Action: 1` AND an `Origin` matching `principal.expectedOrigin`. Local Bearer mutations remain unaffected.
2. **Redaction Gate:** Remote report, status, and SSE payloads greater than 8 KB retain their full content while redacting any secret regardless of its byte position.
3. **Compilation & Suite Gate:** `npm run compile` is clean, and the 50-test adjacent suite (`remote-access-v1-stage1`, `live-player-terminal-v02-transport`, `live-player-console-first-down`) is 100% green.

---

The field packet is saved at:  
[Remote-Access-Stage1-Security-Fixes-Codex-Field-Packet__20260923__AntiGravity.md](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/AntiGravity/Remote-Access-Stage1-Security-Fixes-Codex-Field-Packet__20260923__AntiGravity.md)
