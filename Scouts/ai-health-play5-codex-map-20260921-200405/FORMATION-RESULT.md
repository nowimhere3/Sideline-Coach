# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 2/2 lanes completed · 0 substitutions · elapsed 00:05:45

Play: ai-health-play5-codex-map-20260921-200405
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-22T02:04:11.731Z
Finished: 2026-09-22T02:09:56.740Z
TOTAL ELAPSED TIME: 00:05:45

Scouts requested: 2
Completed: 2
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 2
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| codex-native-health-source | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T02:04:11.774Z | 2026-09-22T02:08:34.039Z | 00:04:22 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-native-health-source-Reconnaissance.md |
| codex-to-health-authority-seam | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-22T02:04:11.936Z | 2026-09-22T02:09:56.732Z | 00:05:44 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-to-health-authority-seam-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane codex-native-health-source: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane codex-to-health-authority-seam: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: codex-native-health-source (objective ce74fd5588b2)
- Objective: AI Health Play 5 reconnaissance only. Architecture is already decided: Sideline owns one global HealthAuthority and Play 5 adds Codex as another neutral evidence source. Inspect only the current Codex app-server/control implementation and directly relevant tests. Start with src/player-control/codex-app-server.ts, src/player-control/codex-contract.ts, nearby bindings/host seams, and Codex app-server fixtures/tests. Determine the exact native Codex rate-limit/usage health source: message names, request/read methods, update notifications, payload shapes, whether evidence is push, read, or both, and the exact symbols where Sideline already receives or can receive it. Identify exact files, symbols, fixtures, tests, FACT / CONTRADICTION / UNKNOWN. Do not implement. Do not inspect Claude health, AntiGravity, Play 6 watchers, UI, AUTO, CONSERVE, or broad repo architecture.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-native-health-source-Reconnaissance.md

**Key discoveries:** - No explicit rate-limit/usage health source was found in the Codex app-server implementation.
- The Codex app-server uses standard JSON-RPC over stdio for communication, with notifications and methods defined in the contract (codex-contract.ts).
- The only potential health-related mechanism is the `account/read` method, which is used internally for authentication and capability reporting, but its payload shape does not include explicit rate-limit/usage fields in the current implementation.
- No test files or fixtures were found for the Codex app-server in the inspected directories.

---

**FACT:** - **File:** `src/player-control/codex-app-server.ts`  
  - The `notification` method (lines 631-673) handles incoming server notifications: `turn/started`, `turn/completed`, `item/agentMessage/delta`, `item/started`, `item/completed`. None of these convey rate-limit/usage information.  
  - The `queryCapabilities` method (lines 599-615) calls `account/read` and `model/list` and returns a `ProviderCapabilitySnapshot` (via `normalizeCodexCapabilities` lines 1013-1063). This snapshot includes `provider`, `authenticated`, `accountEmail`, `planType`, `models`, `defaultModelId`, `observedAt`, `freshness`—**no rate-limit or usage fields**.  
  - The `classifyAccount` function (lines 716-726) uses `account/read` to determine account type (`'chatgpt'`, `'none'`, `'other'`) but does not extract usage data.  
  - The contract (codex-contract.ts) specifies `GetAccountResponse: ['account']` (line 63) but does not define the shape of the `account` object beyond that. The `REQUIRED_CONTRACT.fields` (lines 49-72) lists definitions the adapter reads/writes (e.g., `Thread`, `Turn`, `Account`), but none include rate-limit/usage fields.  
  - No notification or method in the contract or implementation matches a rate-limit/usage event (e.g., no `rate_limit_event` or similar).  
- **File:** `src/player-control/codex-contract.ts`  
  - Confirms the absence of rate-limit/usage in the required contract: `clientMethods` (line 43) includes `account/read` but no usage-specific method; `serverNotificatio

**INFERENCE:** - The Codex app-server does not currently implement a dedicated rate-limit/usage health source. Health evidence for Codex, if needed, would likely be derived from existing mechanisms such as the `account/read` method (which may contain usage-related fields not currently extracted by `normalizeCodexCapabilities`) or inferred from control state changes (e.g., turn completion status).  
- The absence of rate-limit/usage in the contract and implementation suggests that Play 5 may be adding this capability, but the current state does not include it.

**UNKNOWN:** - Whether the `account` object returned by `account/read` contains rate-limit/usage fields (e.g., `usage`, `rate_limit`, `remaining`, `reset`) that are not processed by `normalizeCodexCapabilities` (lines 1014-1018 only extract `type`, `email`, `planType`).  
- Whether Sideline expects to receive Codex health evidence via a new notification type, an extended `account/read` response, or another method (e.g., a dedicated `health/read`).  
- If Play 5 introduces a new health source, the exact message names, request/read methods, update notifications, and payload shapes are not present in the current codebase.

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/player-control/codex-app-server.ts`  
- `src/player-control/codex-contract.ts`  
- `src/player-control/bindings.ts`  
- `src/control-plane/protocol.ts` (for Claude health evidence contrast)

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: codex-to-health-authority-seam (objective a9945345ee5e)
- Objective: AI Health Play 5 reconnaissance only. Architecture is already decided. Map the shortest existing source path from Codex app-server health evidence into Sideline's already-built global HealthAuthority. Inspect only the Codex player-control seam, Control Plane health.evidence/HealthAuthority integration from Plays 3-4, and directly relevant transport/tests. Determine whether Codex evidence should reuse the existing Stadium -> daemon health.evidence notification, use a daemon-local adapter, or another already-existing bounded path based on current source truth. Identify the exact files, symbols, protocol/type additions if any, tests to extend, and any true contradiction. ONE Authority only. No duplicate persistence, no per-Game Authority, no provider-policy interpretation, no implementation, no Play 6 acquisition/watcher design, no UI, AUTO, CONSERVE, or unrelated exploration. Report FACT / CONTRADICTION / UNKNOWN and exact coordinates.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-to-health-authority-seam-Reconnaissance.md

**Key discoveries:** | # | Discovery | Evidence |
|---|-----------|----------|
| 1 | HealthAuthority schema hardcodes `provider: 'claude'` only | `src/control-plane/health-authority.ts:9,151-160,158` |
| 2 | Protocol defines only `ClaudeHealthEvidence`; no Codex type | `src/control-plane/protocol.ts:148-160` |
| 3 | Daemon validator `isClaudeHealthEvidence` rejects non-Claude | `src/control-plane/daemon.ts:3651-3670, 926` |
| 4 | Codex app-server protocol has **no** health/rate-limit notification | `src/player-control/codex-contract.ts:45` (serverNotifications list) |
| 5 | Codex app-server only checks conversation `status !== 'idle' && !== 'active'` | `src/player-control/codex-app-server.ts:744` |
| 6 | Play 4 handoff seam explicitly names "Play 5 provider acquisition" as next step | `REPORTS/Codex/AI-Health-Play4-2-Daemon-Integration-And-Distribution__20260921-195654__Codex.md:40-42` |

---

**FACT:** | Coordinate | Detail |
|------------|--------|
| `health-authority.ts:9` | `AI_HEALTH_SCHEMA_VERSION = 1` |
| `health-authority.ts:22-26` | `HealthAuthoritySnapshot.providers` is `Partial<Record<'claude', ProviderHealthState>>` — only `'claude'` key permitted |
| `health-authority.ts:151-160` | `validSnapshot()` rejects any provider key ≠ `'claude'` |
| `health-authority.ts:163-169` | `validProviderState()` requires `provider === 'claude'` and `evidenceType === 'rate_limit_event'` |
| `protocol.ts:148-152` | `ClaudeHealthEvidence` interface: `{ provider: 'claude', type: 'rate_limit_event', rate_limit_info: Record<string,unknown> }` |
| `protocol.ts:154-160` | `HealthEvidenceParams.evidence` is strictly `ClaudeHealthEvidence` (no union) |
| `daemon.ts:3651-3670` | `isClaudeHealthEvidence()` validates exact shape: provider='claude', type='rate_limit_event', no extra keys |
| `daemon.ts:921-929` | `case 'health.evidence':` guard: `session.features?.includes('health.evidence.v1')` + `isClaudeHealthEvidence(p.evidence)` |
| `codex-contract.ts:43-47` | `REQUIRED_CONTRACT.serverNotifications` = `['turn/started','turn/completed','item/agentMessage/delta','item/started','item/completed']` — **no health/rate-limit notification** |
| `codex-app-server.ts:631-661` | `notification()` handler only processes the 5 serverNotifications above |
| `structured-print.ts:485-490` | **Only** Claude structured-print path emits health evidence: `frame.type === 'rate_limit_event'` → `onHealthFrame(in

**INFERENCE:** | Inference | Basis |
|-----------|-------|
| Codex app-server cannot emit health evidence today without protocol change | Codex protocol (codex-contract.ts) defines no health notification; Codex RPC server sends none |
| HealthAuthority must be extended to accept `provider: 'codex'` to support Play 5 | Current `validSnapshot()`/`validProviderState()` reject any non-'claude' key (health-authority.ts:158,164) |
| The existing `health.evidence` notification is the **only** bounded path into HealthAuthority | Daemon ingests only via `case 'health.evidence':` (daemon.ts:921); no other ingestion path exists |
| Stadium → daemon `health.evidence.v1` feature gate is the transport seam | `session.features?.includes('health.evidence.v1')` required (daemon.ts:925); Stadium declares it in hello (stadium-client.ts:520) |
| A Codex health evidence type would need: new protocol interface, union in `HealthEvidenceParams`, validator, Authority schema extension | All four layers are currently Claude-exclusive |

---

**UNKNOWN:** | Unknown | Why |
|---------|-----|
| What health/rate-limit signals Codex app-server **actually emits** (if any) at the RPC level | Codex protocol schema not inspected beyond REQUIRED_CONTRACT; unknown if Codex has undocumented rate-limit notifications |
| Whether Codex CLI has a `--print`/structured mode analogous to Claude that exposes rate-limit frames | Codex app-server uses persistent app-server protocol, not per-turn print mode |
| Whether a daemon-local adapter could synthesize health evidence from Codex `turn/completed` status or errors | No evidence in source that Codex surfaces rate-limit info; would be speculation |

---

**CONTRADICTION:** | Contradiction | Location | Detail |
|---------------|----------|--------|
| **"ONE Authority only" vs. single-provider schema** | `health-authority.ts:158` + Play 5 objective | HealthAuthority validates `keys.some(key => key !== 'claude')` → false. Adding Codex **requires** schema change to allow `'codex'` key, or violates "ONE Authority" by needing a second authority. |
| **Play 4 handoff claims "Play 5 can enter through existing validated daemon ingest path"** | `REPORTS/Codex/AI-Health-Play4-2...md:40-42` | The existing path **only accepts Claude evidence** (protocol + validator + Authority). Codex cannot use it without protocol/Authority changes. |
| **No provider-policy interpretation** vs. **provider-specific evidence shape** | `health-authority.ts:171-176` | `validClaudeEvidence()` enforces exact Claude shape (3 keys only). A Codex evidence type would need its own validator — this *is* provider-specific interpretation at the boundary. |

---

**Important files:** | File | Role in Current Path | Play 5 Impact |
|------|---------------------|---------------|
| `src/control-plane/health-authority.ts` | Global Authority core — **Claude-only schema** | **Must extend**: schema version, provider keys, validator, snapshot type |
| `src/control-plane/protocol.ts` | Wire protocol — **ClaudeHealthEvidence only** | **Must extend**: `CodexHealthEvidence` interface, `HealthEvidenceParams.evidence` as union |
| `src/control-plane/daemon.ts:3651-3670,921-929` | Ingest validator + handler | **Must extend**: `isCodexHealthEvidence()`, union guard in `case 'health.evidence':` |
| `src/player-control/codex-app-server.ts:631-661` | Codex notification handler | **Must extend**: detect Codex health signals (if any), call `onHealthFrame?` equivalent |
| `src/player-control/structured-print.ts:88-90,485-490` | Reference pattern: `onHealthFrame` callback → `sendHealthEvidence` | **Pattern to replicate** for Codex control |
| `src/stadium-client.ts:418-425,520` | Stadium sender + feature declaration | **Must extend**: `sendHealthEvidence` to accept union; feature gate unchanged |
| `test/health-authority.test.mjs` | Authority unit tests | **Must extend**: Codex evidence fixtures, multi-provider snapshot tests |
| `test/health-authority-daemon.test.mjs` | Daemon integration test | **Must extend**: Codex evidence ingestion test |

---

## COMBINED FORMATION FINDINGS

2 of 2 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane codex-native-health-source: - No explicit rate-limit/usage health source was found in the Codex app-server implementation. - The Codex app-server uses standard JSON-RPC over stdio for communication, with notifications and methods defined in the contract (codex-contract.ts). - The only potential health-related mechanism is the `account/read` method, which is used internally for authentication and capability reporting, but its
- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane codex-to-health-authority-seam: **No existing path exists for Codex app-server health evidence into the global HealthAuthority.** The current architecture is explicitly single-provider (Claude only). The shortest bounded path requires protocol/type extensions to the existing `health.evidence` notification seam — there is no daemon-local adapter, no alternate transport, and no Codex health emission today. ---

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane codex-to-health-authority-seam: | Contradiction | Location | Detail | |---------------|----------|--------| | **"ONE Authority only" vs. single-provider schema** | `health-authority.ts:158` + Play 5 objective | HealthAuthority validates `keys.some(key => key !== 'claude')` → false. Adding Codex **requires** schema change to allow `'codex'` key, or violates "ONE Authority" by needing a second authority. | | **Play 4 handoff claims "Play 5 can enter through existing validated daemon ingest path"** | `REPORTS/Codex/AI-Health-Play4-2...md:40-42` | The existing path **only accepts Claude evidence** (protocol + validator + Authority). Codex cannot use it without protocol/Authority changes. | | **No provider-policy interpretation** vs. **provider-specific evidence shape** | `health-authority.ts:171-176` | `validClaudeEvidence()` enforces exact Claude shape (3 keys only). A Codex evidence type would need its own validator — this *is* provider-specific interpretation at the boundary. | ---

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane codex-native-health-source · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-native-health-source-Reconnaissance.md
- Lane codex-to-health-authority-seam · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\SCOUT-codex-to-health-authority-seam-Reconnaissance.md

### Full report — lane codex-native-health-source (sideline-scout-balanced)

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

### Full report — lane codex-to-health-authority-seam (sideline-scout-deep)

Now I have all the evidence needed. Let me compile the complete reconnaissance report.
Now I have complete evidence. Let me produce the final reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** ai-health-play5-codex-map-20260921-200405  
**Scout ID:** codex-to-health-authority-seam  
**Scout Agent:** sideline-scout-deep (openrouter/nvidia/nemotron-3-ultra-550b-a55b:free)  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Date:** 2026-09-21  

> **This is reconnaissance, not final architectural authority.** Findings are labeled FACT / INFERENCE / UNKNOWN / CONTRADICTION per SOP. Exact coordinates cited.

---

## RESULT

**No existing path exists for Codex app-server health evidence into the global HealthAuthority.** The current architecture is explicitly single-provider (Claude only). The shortest bounded path requires protocol/type extensions to the existing `health.evidence` notification seam — there is no daemon-local adapter, no alternate transport, and no Codex health emission today.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | HealthAuthority schema hardcodes `provider: 'claude'` only | `src/control-plane/health-authority.ts:9,151-160,158` |
| 2 | Protocol defines only `ClaudeHealthEvidence`; no Codex type | `src/control-plane/protocol.ts:148-160` |
| 3 | Daemon validator `isClaudeHealthEvidence` rejects non-Claude | `src/control-plane/daemon.ts:3651-3670, 926` |
| 4 | Codex app-server protocol has **no** health/rate-limit notification | `src/player-control/codex-contract.ts:45` (serverNotifications list) |
| 5 | Codex app-server only checks conversation `status !== 'idle' && !== 'active'` | `src/player-control/codex-app-server.ts:744` |
| 6 | Play 4 handoff seam explicitly names "Play 5 provider acquisition" as next step | `REPORTS/Codex/AI-Health-Play4-2-Daemon-Integration-And-Distribution__20260921-195654__Codex.md:40-42` |

---

## FACT

| Coordinate | Detail |
|------------|--------|
| `health-authority.ts:9` | `AI_HEALTH_SCHEMA_VERSION = 1` |
| `health-authority.ts:22-26` | `HealthAuthoritySnapshot.providers` is `Partial<Record<'claude', ProviderHealthState>>` — only `'claude'` key permitted |
| `health-authority.ts:151-160` | `validSnapshot()` rejects any provider key ≠ `'claude'` |
| `health-authority.ts:163-169` | `validProviderState()` requires `provider === 'claude'` and `evidenceType === 'rate_limit_event'` |
| `protocol.ts:148-152` | `ClaudeHealthEvidence` interface: `{ provider: 'claude', type: 'rate_limit_event', rate_limit_info: Record<string,unknown> }` |
| `protocol.ts:154-160` | `HealthEvidenceParams.evidence` is strictly `ClaudeHealthEvidence` (no union) |
| `daemon.ts:3651-3670` | `isClaudeHealthEvidence()` validates exact shape: provider='claude', type='rate_limit_event', no extra keys |
| `daemon.ts:921-929` | `case 'health.evidence':` guard: `session.features?.includes('health.evidence.v1')` + `isClaudeHealthEvidence(p.evidence)` |
| `codex-contract.ts:43-47` | `REQUIRED_CONTRACT.serverNotifications` = `['turn/started','turn/completed','item/agentMessage/delta','item/started','item/completed']` — **no health/rate-limit notification** |
| `codex-app-server.ts:631-661` | `notification()` handler only processes the 5 serverNotifications above |
| `structured-print.ts:485-490` | **Only** Claude structured-print path emits health evidence: `frame.type === 'rate_limit_event'` → `onHealthFrame(instanceId, {provider:'claude',type:'rate_limit_event',rate_limit_info})` |
| `stadium-client.ts:418-425` | `sendHealthEvidence(playerInstanceId, evidence: ClaudeHealthEvidence)` — typed for Claude only |
| `health-authority.test.mjs:9-12` | Test evidence factory hardcodes `provider: 'claude', type: 'rate_limit_event'` |
| `health-authority-daemon.test.mjs:58-59` | Daemon test sends only Claude evidence via `client.sendHealthEvidence()` |

---

## INFERENCE

| Inference | Basis |
|-----------|-------|
| Codex app-server cannot emit health evidence today without protocol change | Codex protocol (codex-contract.ts) defines no health notification; Codex RPC server sends none |
| HealthAuthority must be extended to accept `provider: 'codex'` to support Play 5 | Current `validSnapshot()`/`validProviderState()` reject any non-'claude' key (health-authority.ts:158,164) |
| The existing `health.evidence` notification is the **only** bounded path into HealthAuthority | Daemon ingests only via `case 'health.evidence':` (daemon.ts:921); no other ingestion path exists |
| Stadium → daemon `health.evidence.v1` feature gate is the transport seam | `session.features?.includes('health.evidence.v1')` required (daemon.ts:925); Stadium declares it in hello (stadium-client.ts:520) |
| A Codex health evidence type would need: new protocol interface, union in `HealthEvidenceParams`, validator, Authority schema extension | All four layers are currently Claude-exclusive |

---

## UNKNOWN

| Unknown | Why |
|---------|-----|
| What health/rate-limit signals Codex app-server **actually emits** (if any) at the RPC level | Codex protocol schema not inspected beyond REQUIRED_CONTRACT; unknown if Codex has undocumented rate-limit notifications |
| Whether Codex CLI has a `--print`/structured mode analogous to Claude that exposes rate-limit frames | Codex app-server uses persistent app-server protocol, not per-turn print mode |
| Whether a daemon-local adapter could synthesize health evidence from Codex `turn/completed` status or errors | No evidence in source that Codex surfaces rate-limit info; would be speculation |

---

## CONTRADICTION

| Contradiction | Location | Detail |
|---------------|----------|--------|
| **"ONE Authority only" vs. single-provider schema** | `health-authority.ts:158` + Play 5 objective | HealthAuthority validates `keys.some(key => key !== 'claude')` → false. Adding Codex **requires** schema change to allow `'codex'` key, or violates "ONE Authority" by needing a second authority. |
| **Play 4 handoff claims "Play 5 can enter through existing validated daemon ingest path"** | `REPORTS/Codex/AI-Health-Play4-2...md:40-42` | The existing path **only accepts Claude evidence** (protocol + validator + Authority). Codex cannot use it without protocol/Authority changes. |
| **No provider-policy interpretation** vs. **provider-specific evidence shape** | `health-authority.ts:171-176` | `validClaudeEvidence()` enforces exact Claude shape (3 keys only). A Codex evidence type would need its own validator — this *is* provider-specific interpretation at the boundary. |

---

## IMPORTANT FILES / PATHS

| File | Role in Current Path | Play 5 Impact |
|------|---------------------|---------------|
| `src/control-plane/health-authority.ts` | Global Authority core — **Claude-only schema** | **Must extend**: schema version, provider keys, validator, snapshot type |
| `src/control-plane/protocol.ts` | Wire protocol — **ClaudeHealthEvidence only** | **Must extend**: `CodexHealthEvidence` interface, `HealthEvidenceParams.evidence` as union |
| `src/control-plane/daemon.ts:3651-3670,921-929` | Ingest validator + handler | **Must extend**: `isCodexHealthEvidence()`, union guard in `case 'health.evidence':` |
| `src/player-control/codex-app-server.ts:631-661` | Codex notification handler | **Must extend**: detect Codex health signals (if any), call `onHealthFrame?` equivalent |
| `src/player-control/structured-print.ts:88-90,485-490` | Reference pattern: `onHealthFrame` callback → `sendHealthEvidence` | **Pattern to replicate** for Codex control |
| `src/stadium-client.ts:418-425,520` | Stadium sender + feature declaration | **Must extend**: `sendHealthEvidence` to accept union; feature gate unchanged |
| `test/health-authority.test.mjs` | Authority unit tests | **Must extend**: Codex evidence fixtures, multi-provider snapshot tests |
| `test/health-authority-daemon.test.mjs` | Daemon integration test | **Must extend**: Codex evidence ingestion test |

---

## BOUNDED PATH OPTIONS (per Objective)

| Option | Feasibility | Required Changes |
|--------|-------------|------------------|
| **Reuse Stadium → daemon `health.evidence` notification** | **Only viable path** — but requires protocol/Authority extension | 1. Protocol: add `CodexHealthEvidence`, widen `HealthEvidenceParams.evidence`<br>2. Authority: allow `'codex'` provider key, add validator<br>3. Daemon: add `isCodexHealthEvidence()` guard<br>4. Codex control: emit health evidence via callback<br>5. Stadium: widen `sendHealthEvidence` type |
| **Daemon-local adapter** | **Not feasible** — no Codex health signal exists to adapt | Codex app-server receives no rate-limit/health notifications (codex-contract.ts:45) |
| **Alternate transport (HTTP, direct call, etc.)** | **Violates "already-existing bounded path" constraint** | Would bypass the validated `health.evidence.v1` feature gate and Authority ingest seam |

---

## LIMITATIONS

- Did not inspect Codex upstream protocol schema (generated JSON) for undocumented health notifications — only the adapter's REQUIRED_CONTRACT.
- Did not evaluate whether Codex CLI has rate-limit headers/frames outside app-server protocol.
- Historical reports (Play 4 validation, etc.) cited as evidence of intent, not current source truth — current source is authoritative.
- No implementation, no Play 6 design, no UI, no AUTO/CONSERVE explored per contract.

---

## SCOUT SIGNATURE

```
Scout: sideline-scout-deep
Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
Play: ai-health-play5-codex-map-20260921-200405
Status: RECONNAISSANCE COMPLETE — OBJECTIVE BOUNDED
```

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\ai-health-play5-codex-map-20260921-200405

