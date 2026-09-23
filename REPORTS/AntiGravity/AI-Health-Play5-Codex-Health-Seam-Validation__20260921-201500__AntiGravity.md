# AI HEALTH PLAY 5 — AGY CODEX HEALTH SEAM VALIDATION REPORT

**Date:** 2026-09-21  
**Agent:** AntiGravity  
**Role:** Seam Validator & Scope Pack Compiler  
**Target Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Formation Intelligence:** `C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play5-codex-map-20260921-200405\FORMATION-RESULT.md`

---

## 1. EXECUTIVE SUMMARY

The critical unknown is closed: **Codex has first-class, native rate-limit health sources in its app-server protocol**.
Inspecting the generated JSON schema from the locally installed `codex-cli 0.155.1` proves that:
1. Request method `account/rateLimits/read` exists for point-in-time reads.
2. Server notification `account/rateLimits/updated` exists for sparse rolling push updates.
3. Both methods return/push the `RateLimitSnapshot` schema containing `primary` and `secondary` windows (`usedPercent`, `resetsAt`, `windowDurationMins`), `planType`, and credit depletion status.
4. Sideline's `REQUIRED_CONTRACT` in `src/player-control/codex-contract.ts` simply omitted these entries.
5. Sideline's `HealthAuthority` and wire protocol are currently hardcoded for Claude only, but can safely generalize to multi-provider neutral health under schema `version: 1` without bumping the schema version or altering neutral-health semantics.

---

## 2. VERIFIED CODEX NATIVE SOURCE

Generated directly via `codex app-server generate-json-schema --experimental` from `codex-cli 0.155.1`:

### Native Request (Point-in-Time Read)
* **Method:** `'account/rateLimits/read'`
* **Request Params:** `GetAccountRateLimitsParams` (`{}`)
* **Response Type:** `GetAccountRateLimitsResponse`
* **Response Schema Coordinate:** `v2/GetAccountRateLimitsResponse.json`
* **Response Payload:**
  ```json
  {
    "rateLimits": {
      "primary": {
        "usedPercent": 12,
        "resetsAt": 1726950000,
        "windowDurationMins": 300
      },
      "secondary": {
        "usedPercent": 45,
        "resetsAt": 1727500000,
        "windowDurationMins": 10080
      },
      "planType": "plus",
      "rateLimitReachedType": null
    }
  }
  ```

### Native Notification (Push Updates)
* **Method:** `'account/rateLimits/updated'`
* **Notification Schema Coordinate:** `v2/AccountRateLimitsUpdatedNotification.json`
* **Notification Description:**
  > *"Sparse rolling rate-limit update. Clients should merge available values into the most recent `account/rateLimits/read` response or refetch that snapshot."*
* **Notification Payload:**
  ```json
  {
    "rateLimits": {
      "primary": {
        "usedPercent": 24,
        "resetsAt": 1726950000,
        "windowDurationMins": 300
      },
      "secondary": {
        "usedPercent": 48,
        "resetsAt": 1727500000,
        "windowDurationMins": 10080
      },
      "planType": "plus",
      "rateLimitReachedType": null
    }
  }
  ```

### Key Payload Field Invariants (`RateLimitSnapshot` & `RateLimitWindow`)
* `usedPercent`: Integer (0–100+).
* `resetsAt`: Integer Unix timestamp in seconds (int64) or `null`.
* `windowDurationMins`: Integer window duration in minutes (e.g. 300 for 5 hours, 10080 for 7 days) or `null`.
* `planType`: String enum (`free`, `plus`, `pro`, `team`, `business`, `enterprise`, etc.).
* `rateLimitReachedType`: String enum (`rate_limit_reached`, `workspace_owner_credits_depleted`, etc.) or `null`.

---

## 3. SCOUT INFERENCE ADJUDICATIONS

| Scout Inference | Adjudication | Ground Truth Correction |
|---|---|---|
| **1. "No explicit rate-limit/usage health source was found in Codex app-server."** | **INCORRECT** | Upstream Codex app-server protocol has both `account/rateLimits/read` and `account/rateLimits/updated`. They were simply omitted from Sideline's adapter contract (`REQUIRED_CONTRACT`). |
| **2. "Adding Codex requires schema version bump to v2."** | **INCORRECT** | `AI_HEALTH_SCHEMA_VERSION` can remain `1`. The schema defines `providers: Partial<Record<string, ProviderHealthState>>`. Adding `'codex'` alongside `'claude'` is strictly additive. Persisted v1 state files remain 100% valid and backward compatible without migration or quarantine. |
| **3. "Provider-specific evidence validation conflicts with neutral health architecture."** | **INCORRECT** | Structural/syntax boundary guards (`isClaudeHealthEvidence`, `isCodexHealthEvidence`) protect transport integrity against malformed payloads. Neutral health architecture prohibits provider-based **routing policy/threshold interpretation**, not wire validation. |
| **4. "Codex requires an alternate transport or daemon-local adapter."** | **INCORRECT** | Codex evidence reuses the exact same `health.evidence.v1` WebSocket notification path from Stadium to daemon (`client.sendHealthEvidence`). No alternate transport or daemon adapter is needed. |
| **5. "Play 5 should be one single worker slice."** | **CLARIFIED** | Splitting into two sequential slices minimizes context burden: **5.1** generalizes the Control Plane (protocol, Authority, daemon, tests); **5.2** taps the Codex player-control adapter and adds contract probe tests. |

---

## 4. VERIFIED COORDINATES

### A. Control Plane & Protocol
* `src/control-plane/protocol.ts`
  - Current: `ClaudeHealthEvidence` (lines 148–152), `HealthEvidenceParams` (lines 154–160).
  - Target: Add `CodexHealthEvidence`, define `type HealthEvidence = ClaudeHealthEvidence | CodexHealthEvidence`, and widen `HealthEvidenceParams.evidence` to `HealthEvidence`.
* `src/control-plane/health-authority.ts`
  - Provider key validation: line 158 (`keys.some((key) => key !== 'claude')` -> allow `'claude' | 'codex'`).
  - Provider state types: lines 9–20, 25 (`providers: Partial<Record<'claude' | 'codex', ProviderHealthState>>`).
  - Provider state validator: lines 163–169 (`validProviderState`).
  - Evidence validator: lines 171–176 (`validClaudeEvidence` -> add `validCodexEvidence`).
  - Ingest logic: lines 98–122 (handle both Claude and Codex evidence types).
* `src/control-plane/daemon.ts`
  - Ingest guard: line 926 (`if (typeof p.playerInstanceId !== 'string' || !p.playerInstanceId || !isHealthEvidence(p.evidence)) break;`).
  - Validator: line 3651 (`isClaudeHealthEvidence` -> add `isCodexHealthEvidence`).
* `src/stadium-client.ts`
  - Sender signature: line 418 (`sendHealthEvidence(playerInstanceId: string, evidence: HealthEvidence): void`).

### B. Codex Player Control
* `src/player-control/codex-contract.ts`
  - Client methods: line 43 (`REQUIRED_CONTRACT.clientMethods` -> add `'account/rateLimits/read'`).
  - Server notifications: line 45 (`REQUIRED_CONTRACT.serverNotifications` -> add `'account/rateLimits/updated'`).
  - Required fields: line 49 (`REQUIRED_CONTRACT.fields` -> add `AccountRateLimitsUpdatedNotification: ['rateLimits']`).
* `src/player-control/codex-app-server.ts`
  - Options: lines 80–100 (add `onHealthEvidence?: (instanceId: string, evidence: CodexHealthEvidence) => void`).
  - Notification handler: lines 631–673 (`notification()` -> handle `method === 'account/rateLimits/updated'`).
  - Capability/probe query: lines 599–615 (`queryCapabilities()` -> optionally query `'account/rateLimits/read'`).
* `test/fixtures/fake-codex-app-server.mjs`
  - Emulation: lines 43–60 (include new methods/notifications in synthesized schema for contract test).

---

## 5. PLAY 5 IMPLEMENTATION SLICES

### Slice 5.1: Control Plane Protocol & HealthAuthority Generalization
* **Files**:
  - `src/control-plane/protocol.ts`
  - `src/control-plane/health-authority.ts`
  - `src/control-plane/daemon.ts`
  - `src/stadium-client.ts`
  - `test/health-authority.test.mjs`
  - `test/health-authority-daemon.test.mjs`
* **Symbols**:
  - `interface CodexHealthEvidence`
  - `type HealthEvidence = ClaudeHealthEvidence | CodexHealthEvidence`
  - `HealthAuthority.prototype.ingest` (multi-provider support)
  - `isCodexHealthEvidence` helper in `daemon.ts`
  - `StadiumClient.prototype.sendHealthEvidence` (widened type)
* **Behavior**:
  - `HealthAuthority` ingests both Claude and Codex evidence into `providers.claude` and `providers.codex`.
  - Snapshot emits `{ schemaVersion: 1, providers: { claude?: ..., codex?: ... }, updatedAt: string }`.
  - Persistence preserves multi-provider state; reload preserves both.
  - Daemon accepts valid Codex evidence over WebSocket and broadcasts on `/api/events` as `event: ai-health`.
* **Focused Tests**:
  - `test/health-authority.test.mjs`: Verify Codex evidence ingestion, multi-provider snapshot, and state persistence.
  - `test/health-authority-daemon.test.mjs`: Verify daemon receives `client.sendHealthEvidence` with Codex evidence.
* **Acceptance Criteria**:
  - Existing Claude tests pass unchanged.
  - Codex evidence is ingested, persisted to `~/.sideline/ai-health-state.json`, and returned via `GET /api/ai-health`.
* **Non-Goals**:
  - Modifying `codex-app-server.ts` or `codex-contract.ts` (deferred to 5.2).
* **STOP Condition**: `node --test test/health-authority.test.mjs test/health-authority-daemon.test.mjs` passes.

---

### Slice 5.2: Codex Native Source Tap & Ingest
* **Files**:
  - `src/player-control/codex-contract.ts`
  - `src/player-control/codex-app-server.ts`
  - `test/fixtures/fake-codex-app-server.mjs`
  - `test/player-control-contract.test.mjs`
* **Symbols**:
  - `REQUIRED_CONTRACT.clientMethods` (includes `'account/rateLimits/read'`)
  - `REQUIRED_CONTRACT.serverNotifications` (includes `'account/rateLimits/updated'`)
  - `CodexAppServerOptions.onHealthEvidence`
  - `CodexAppServerControl.prototype.notification` handler for `'account/rateLimits/updated'`
* **Behavior**:
  - When Codex app-server pushes `account/rateLimits/updated`, `CodexAppServerControl` extracts `rateLimits`, validates bounded depth/keys, and invokes `onHealthEvidence`.
  - Schema contract probe verifies that installed Codex CLI declares these methods.
* **Focused Tests**:
  - `test/player-control-contract.test.mjs`: Emulate `account/rateLimits/updated` notification and verify callback receives bounded evidence.
* **Acceptance Criteria**:
  - Contract check passes against fake and real Codex app-server schemas.
  - Notifications are captured without interfering with turn lifecycle.
* **Non-Goals**:
  - Modifying HealthAuthority or HTTP distribution (completed in 5.1).
* **STOP Condition**: `node --test test/player-control-contract.test.mjs` passes.

---

## 6. WORKER SCOPE PACK (FIRST PACKET: SLICE 5.1)

### OBJECTIVE
Generalize Sideline Control Plane wire protocol, `HealthAuthority`, `ControlPlaneDaemon`, and `StadiumClient` to accept and persist `CodexHealthEvidence` alongside `ClaudeHealthEvidence` under `schemaVersion: 1`.

### CONTRACT CHANGES

#### 1. `src/control-plane/protocol.ts`
Add:
```typescript
export interface CodexHealthEvidence {
  provider: 'codex';
  type: 'rate_limits';
  rate_limits: Record<string, unknown>;
}

export type HealthEvidence = ClaudeHealthEvidence | CodexHealthEvidence;
```
Update `HealthEvidenceParams`:
```typescript
export interface HealthEvidenceParams {
  stadiumId: string;
  instanceId: string;
  gameId: string;
  playerInstanceId: string;
  evidence: HealthEvidence;
}
```

#### 2. `src/control-plane/health-authority.ts`
Update types:
```typescript
export interface ClaudeProviderHealthState {
  provider: 'claude';
  evidenceType: 'rate_limit_event';
  rateLimitInfo: Record<string, unknown>;
  observedAt: string;
  source: HealthEvidenceSource;
}

export interface CodexProviderHealthState {
  provider: 'codex';
  evidenceType: 'rate_limits';
  rateLimits: Record<string, unknown>;
  observedAt: string;
  source: HealthEvidenceSource;
}

export type ProviderHealthState = ClaudeProviderHealthState | CodexProviderHealthState;

export interface HealthAuthoritySnapshot {
  schemaVersion: typeof AI_HEALTH_SCHEMA_VERSION;
  updatedAt?: string;
  providers: Partial<Record<'claude' | 'codex', ProviderHealthState>>;
}
```
Update validation:
- In `validSnapshot`: allow provider keys `'claude'` and `'codex'`.
- In `validProviderState`: if `provider === 'codex'`, ensure `evidenceType === 'rate_limits'`, `rateLimits` is bounded object, and source identities are valid.
- Add `validCodexEvidence(value: unknown): CodexHealthEvidence | undefined`.
- In `ingest(params: HealthEvidenceParams)`: dispatch to `validClaudeEvidence` or `validCodexEvidence`, store under `this.state.providers[evidence.provider]`.

#### 3. `src/control-plane/daemon.ts`
Add `isCodexHealthEvidence`:
```typescript
function isCodexHealthEvidence(value: unknown): value is CodexHealthEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  if (Object.keys(evidence).some((key) => !['provider', 'type', 'rate_limits'].includes(key))) return false;
  if (evidence.provider !== 'codex' || evidence.type !== 'rate_limits') return false;
  return isBoundedJsonObject(evidence.rate_limits);
}
```
Update line 926 guard to accept `isClaudeHealthEvidence(p.evidence) || isCodexHealthEvidence(p.evidence)`.

#### 4. `src/stadium-client.ts`
Update `sendHealthEvidence`:
```typescript
sendHealthEvidence(playerInstanceId: string, evidence: HealthEvidence): void
```

### TEST COMMANDS
```bash
npm run build
node --test test/health-authority.test.mjs test/health-authority-daemon.test.mjs
```

### ACCEPTANCE CRITERIA
1. `test/health-authority.test.mjs` verifies:
   - Ingesting `CodexHealthEvidence` creates `providers.codex`.
   - Simultaneous `providers.claude` and `providers.codex` coexist in the same snapshot.
   - Restoring from disk preserves both provider states.
2. `test/health-authority-daemon.test.mjs` verifies:
   - Client sends Codex evidence; daemon ingests and stores it in `HealthAuthority`.
   - `GET /api/ai-health` returns `{ success: true, health: { providers: { codex: ... } } }`.
3. Stop when tests pass.
