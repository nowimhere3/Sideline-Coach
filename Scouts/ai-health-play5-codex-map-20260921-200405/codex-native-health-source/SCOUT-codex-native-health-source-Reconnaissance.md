# Scout Report: AI Health Play 5 Reconnaissance

**Scout ID:** codex-native-health-source  
**Assigned Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Objective:** Determine the exact native Codex rate-limit/usage health source: message names, request/read methods, update notifications, payload shapes, whether evidence is push, read, or both, and the exact symbols where Sideline already receives or can receive it. Inspect only src/player-control/codex-app-server.ts, src/player-control/codex-contract.ts, nearby bindings/host seams, and Codex app-server fixtures/tests.

---

## KEY DISCOVERIES

- No explicit rate-limit/usage health source was found in the Codex app-server implementation.
- The Codex app-server uses standard JSON-RPC over stdio for communication, with notifications and methods defined in the contract (codex-contract.ts).
- The only potential health-related mechanism is the `account/read` method, which is used internally for authentication and capability reporting, but its payload shape does not include explicit rate-limit/usage fields in the current implementation.
- No test files or fixtures were found for the Codex app-server in the inspected directories.

---

## FACT

- **File:** `src/player-control/codex-app-server.ts`  
  - The `notification` method (lines 631-673) handles incoming server notifications: `turn/started`, `turn/completed`, `item/agentMessage/delta`, `item/started`, `item/completed`. None of these convey rate-limit/usage information.  
  - The `queryCapabilities` method (lines 599-615) calls `account/read` and `model/list` and returns a `ProviderCapabilitySnapshot` (via `normalizeCodexCapabilities` lines 1013-1063). This snapshot includes `provider`, `authenticated`, `accountEmail`, `planType`, `models`, `defaultModelId`, `observedAt`, `freshness`—**no rate-limit or usage fields**.  
  - The `classifyAccount` function (lines 716-726) uses `account/read` to determine account type (`'chatgpt'`, `'none'`, `'other'`) but does not extract usage data.  
  - The contract (codex-contract.ts) specifies `GetAccountResponse: ['account']` (line 63) but does not define the shape of the `account` object beyond that. The `REQUIRED_CONTRACT.fields` (lines 49-72) lists definitions the adapter reads/writes (e.g., `Thread`, `Turn`, `Account`), but none include rate-limit/usage fields.  
  - No notification or method in the contract or implementation matches a rate-limit/usage event (e.g., no `rate_limit_event` or similar).  
- **File:** `src/player-control/codex-contract.ts`  
  - Confirms the absence of rate-limit/usage in the required contract: `clientMethods` (line 43) includes `account/read` but no usage-specific method; `serverNotifications` (line 45) includes only turn/item events; `fields` (lines 49-72) and `enums` (lines 74-85) contain no usage-related definitions.  
- **File:** `src/player-control/bindings.ts`  
  - Defines binding structures but no health evidence emission or reception symbols.  
- **Search for test/fixture files:**  
  - No files matching `*codex*.test.ts`, `*fixture*.ts`, or similar were found in `src/player-control/` or `src/__tests__/` (via glob patterns).  
- **File:** `src/control-plane/protocol.ts`  
  - Defines `ClaudeHealthEvidence` (lines 148-152) for structured-print mode (Claude only). No equivalent exists for Codex.  

## INFERENCE

- The Codex app-server does not currently implement a dedicated rate-limit/usage health source. Health evidence for Codex, if needed, would likely be derived from existing mechanisms such as the `account/read` method (which may contain usage-related fields not currently extracted by `normalizeCodexCapabilities`) or inferred from control state changes (e.g., turn completion status).  
- The absence of rate-limit/usage in the contract and implementation suggests that Play 5 may be adding this capability, but the current state does not include it.  

## UNKNOWN

- Whether the `account` object returned by `account/read` contains rate-limit/usage fields (e.g., `usage`, `rate_limit`, `remaining`, `reset`) that are not processed by `normalizeCodexCapabilities` (lines 1014-1018 only extract `type`, `email`, `planType`).  
- Whether Sideline expects to receive Codex health evidence via a new notification type, an extended `account/read` response, or another method (e.g., a dedicated `health/read`).  
- If Play 5 introduces a new health source, the exact message names, request/read methods, update notifications, and payload shapes are not present in the current codebase.  

## IMPORTANT FILES / PATHS

- `src/player-control/codex-app-server.ts`  
- `src/player-control/codex-contract.ts`  
- `src/player-control/bindings.ts`  
- `src/control-plane/protocol.ts` (for Claude health evidence contrast)  

## LIMITATIONS

- This report is based solely on the current source code; runtime behavior or undocumented fields cannot be confirmed.  
- No test or fixture files were available to inspect expected payloads or behavior.  
- The reconnaissance did not extend to broader Sideline/control-plane architecture beyond the bounded objective.  

## CONCLUSION

No native Codex rate-limit/usage health source is present in the inspected files. The current Codex app-server provides control events and capability snapshots but lacks explicit rate-limit/usage messaging or payloads.  

---  
**Note:** This is reconnaissance, not final architectural authority. Evidence is limited to the files and symbols inspected.  
**Report completed.**
