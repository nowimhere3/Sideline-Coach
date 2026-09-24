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
