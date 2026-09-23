# AI HEALTH PLAY 4 — AGY AUTHORITY SEAM VALIDATION REPORT

**Date:** 2026-09-21  
**Agent:** AntiGravity  
**Role:** Seam Validator & Scope Pack Compiler  
**Target Repo:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**Formation Intelligence:** `C:\Users\dmcal\.sideline\Scout Intelligence\ai-health-play4-authority-map-20260921-193356\FORMATION-RESULT.md`

---

## 1. EXECUTIVE SUMMARY

The architectural contract for AI Health Play 4 is verified against the Sideline Coach codebase:
- **One Global Control-Plane Health Authority**: Hosted as a singleton coordinator on `ControlPlaneDaemon` (`src/control-plane/daemon.ts`), exactly mirroring `InstanceWorkLedger`, `CoachRoutineEngine`, and `GameFilesystemCoordinator`.
- **Ingest Seam**: Consumes bounded, validated `health.evidence` notifications delivered over the existing Stadium WebSocket bridge (`src/control-plane/daemon.ts:892-900`).
- **Persistence Boundary**: Lives at `~/.sideline/ai-health-state.json` using the established Sideline-global atomic temp-write + rename + quarantine pattern (`fileCoachRoutineStore` / `fileGameFilesystemStore`).
- **Canonical Distribution**: Exposed via `GET /api/ai-health` with existing token authorization, and pushed over the existing `/api/events` SSE connection as `event: ai-health` (both at initial connection and on health state transition). No secondary SSE route or subsystem is needed.

---

## 2. SCOUT INFERENCE ADJUDICATIONS

| Scout Inference | Source Report | Adjudication | Ground Truth Correction |
|---|---|---|---|
| **1. `healthEvidenceByGame` is already “the single source of truth.”** | `authority-host-lifecycle` | **INCORRECT** | `healthEvidenceByGame` (`daemon.ts:142`) is merely an in-memory `Map<string, HealthEvidenceParams>` caching raw wire params per Game for compatibility. It performs no reconciliation, rate-limit tracking, persistence, or canonical truth calculation. The new global `HealthAuthority` is the single source of truth. `healthEvidenceByGame` remains solely as a wire-compat and test-compat seam (`test/stadium-bridge.test.mjs`). |
| **2. Health persistence should be per-Game.** | `authority-durable-state` | **INCORRECT** | Health state represents provider account capacity, utilization, and quota resets (e.g. Claude 5-hour and 7-day rate limits). These span across all Games and Stadiums on the machine. Storage MUST be Sideline-global (`~/.sideline/ai-health-state.json`), never per-Game. |
| **3. A separate `/api/ai-health/events` SSE endpoint is needed.** | `health-distribution-api-sse` | **INCORRECT** | Control Plane already operates a single unified SSE multiplexer at `/api/events` (`daemon.ts:985`, `daemon.ts:2920`). It already multiplexes `event: hello`, `event: status`, `event: execution`, and `event: activity`. Health updates ride this existing stream as `event: ai-health`. |
| **4. Health Authority might be a separate daemon.** | `authority-durable-state` | **INCORRECT** | The Authority is a coordinator within `ControlPlaneDaemon`. A separate daemon process would introduce duplicate discovery manifests, port arbitration, and unnecessary process management. |
| **5. Stadium needs a `healthEvidence.inspect` pull seam.** | `authority-host-lifecycle` | **INCORRECT** | Play 3 already established push evidence via `client.sendHealthEvidence` and `handleWsNotification` (`case 'health.evidence':`). Play 4 is strictly an ingest, reconciliation, durable state, and distribution layer. Provider acquisition and pull inspections are out of scope. |

---

## 3. VERIFIED COORDINATES

### A. Authority Ownership & Ingest
* `src/control-plane/daemon.ts`
  - Field: `private readonly healthAuthority: HealthAuthority;` (around line 173)
  - Constructor initialization: lines 220–225
  - Evidence handler: lines 892–900 (`case 'health.evidence':`)
  - Compatibility seam: lines 142, 379–382 (`getHealthEvidence`), 898 (`healthEvidenceByGame.set`)
  - Lifecycle stop: lines 485–507 (`stop()`)
  - Exit handler: lines 650–659 (`setupExitHandlers()`)
* `src/control-plane/protocol.ts`
  - Interfaces: `ClaudeHealthEvidence` (lines 148–152), `HealthEvidenceParams` (lines 154–160)
  - Validator: `isClaudeHealthEvidence` in `src/control-plane/daemon.ts:3606–3625`
* `test/stadium-bridge.test.mjs`
  - Lines 75–95: Evidence receipt and feature-gating verification

### B. Canonical Distribution
* `src/control-plane/daemon.ts`
  - HTTP routing: line 1004 (alongside `GET /api/status`)
  - Authorization: line 979 (`this.isAuthorized(req, requestUrl)`)
  - JSON serialization: line 3508 (`this.sendJson(res, status, data)`)
  - SSE connection initial sync: lines 2920–2944 (`handleSseConnection`)
  - SSE broadcast: lines 2951–2960 (`broadcast(event, data)`)
* `src/server.ts`
  - `CoachServer` in `src/server.ts` is the Stadium/in-extension server; canonical Control Plane distribution is hosted in `daemon.ts`.
* `test/coach-routines-daemon.test.mjs`
  - Lines 25–69: Direct pattern for harness-based API and daemon testing

### C. Durable Authority State
* File location: `path.join(this.dir, 'ai-health-state.json')` resolving to `~/.sideline/ai-health-state.json`
* Pattern references:
  - Atomic write: `src/control-plane/coach-routines.ts:175–180`
  - Quarantine: `src/control-plane/coach-routines.ts:181–195`
  - Store factory: `src/control-plane/coach-routines.ts:163–188` (`fileCoachRoutineStore`)
  - Debounce timer: `src/control-plane/daemon.ts:3306–3318` (`scheduleRoutineSave`, `flushRoutines`)

---

## 4. PLAY 4 IMPLEMENTATION SLICES

### Slice 4.1: HealthAuthority Engine & Durable Store
* **Files**:
  - `src/control-plane/health-authority.ts` (NEW)
  - `test/health-authority.test.mjs` (NEW)
* **Symbols**:
  - `interface HealthAuthorityState`, `interface HealthSnapshot`, `interface HealthAuthorityStore`
  - `class HealthAuthority`
  - `function fileHealthAuthorityStore(file: string, warn?: (msg: string) => void): HealthAuthorityStore`
* **Behavior**:
  - Manages provider-level canonical health state (specifically Claude 5-hour and 7-day rate limit status, resets, and utilization).
  - Ingests `HealthEvidenceParams`.
  - Emits `onChange` callback on valid evidence update.
  - Persists state via atomic temp-file write + rename.
  - Safely quarantines corrupt JSON or newer-schema versions to `.bak`.
  - Provides `getSnapshot()` for HTTP and SSE consumers.
* **Focused Tests**:
  - `test/health-authority.test.mjs`: unit tests for ingest, reconciliation, snapshot calculation, atomic file persistence, restore on reload, and corrupt file quarantine.
* **Acceptance Criteria**:
  - 100% pure unit test coverage for `HealthAuthority` and `fileHealthAuthorityStore`.
  - No dependencies on `WebSocketServer` or HTTP server.
* **Non-Goals**:
  - HTTP routing, WebSocket handling, UI, provider scraping.
* **STOP Condition**: `node --test test/health-authority.test.mjs` passes.

---

### Slice 4.2: Control Plane Daemon Ingest, Lifecycle & Distribution
* **Files**:
  - `src/control-plane/daemon.ts`
  - `test/health-authority-daemon.test.mjs` (NEW)
* **Symbols**:
  - `ControlPlaneDaemon.prototype.healthAuthority`
  - `ControlPlaneDaemon.prototype.scheduleHealthSave`
  - `ControlPlaneDaemon.prototype.flushHealth`
  - Route: `GET /api/ai-health`
  - SSE Event: `event: ai-health`
* **Behavior**:
  - Instantiate `HealthAuthority` in `ControlPlaneDaemon` constructor.
  - In `handleWsNotification` (`case 'health.evidence':`), feed validated evidence to `this.healthAuthority.ingestEvidence(p)`.
  - Retain `this.healthEvidenceByGame.set(...)` for backwards compatibility.
  - Register `GET /api/ai-health` returning `{ success: true, health: this.healthAuthority.getSnapshot() }`.
  - In `handleSseConnection`, write initial `event: ai-health` frame.
  - On `this.healthAuthority.onChange`, trigger `this.scheduleHealthSave()` and `this.broadcast('ai-health', ...)`.
  - Flush state in `daemon.stop()` and `cleanExitHandler`.
* **Focused Tests**:
  - `test/health-authority-daemon.test.mjs`: Test daemon startup restore, WS `health.evidence` ingestion, `GET /api/ai-health` response, SSE `event: ai-health` emission, and clean shutdown flush.
  - `test/stadium-bridge.test.mjs`: Verify existing evidence tests pass unbroken.
* **Acceptance Criteria**:
  - `GET /api/ai-health` returns 200 with snapshot for authorized requests (401 unauthorized).
  - SSE clients receive `event: ai-health` at connection and on updates.
  - Daemon restart restores health state from `~/.sideline/ai-health-state.json`.
* **Non-Goals**:
  - AUTO routing decisions based on health, UI cards/badges, new provider CLIs.
* **STOP Condition**: `node --test test/health-authority-daemon.test.mjs` and `node --test test/stadium-bridge.test.mjs` pass.

---

## 5. CLAUDE SCOPE PACK (SLICES 4.1 & 4.2 FIRST PACKET)

### OBJECTIVE
Implement **Slice 4.1: HealthAuthority Engine & Durable Store**.

### FILES TO CREATE
1. `src/control-plane/health-authority.ts`
2. `test/health-authority.test.mjs`

### CONTRACT DEFINITIONS

```typescript
// src/control-plane/health-authority.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { HealthEvidenceParams } from './protocol';

export interface ProviderHealthRecord {
  provider: 'claude';
  status: 'allowed' | 'limited' | 'blocked' | 'unknown';
  fiveHourUtilization?: number;
  fiveHourResetsAt?: string;
  sevenDayUtilization?: number;
  sevenDayResetsAt?: string;
  rawRateLimitInfo: Record<string, unknown>;
  lastObservedAt: number;
  lastSourceGameId: string;
  lastSourcePlayerInstanceId: string;
}

export interface HealthAuthorityState {
  version: 1;
  providers: {
    claude?: ProviderHealthRecord;
  };
  updatedAt: number;
}

export interface HealthSnapshot {
  version: 1;
  providers: {
    claude?: ProviderHealthRecord;
  };
  updatedAt: number;
}

export interface HealthAuthorityStore {
  load(): HealthAuthorityState | undefined;
  save(state: HealthAuthorityState): void;
  quarantine(reason: string): string | undefined;
}
```

### STORE IMPLEMENTATION INVARIANTS
1. `fileHealthAuthorityStore(file: string, warn?: (msg: string) => void): HealthAuthorityStore`
   - `load()`: If file doesn't exist (`ENOENT`), return undefined. If JSON parse fails or `version !== 1`, call `quarantine(reason)` and return undefined.
   - `save(state)`: Atomic write. Write to `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp` then `fs.renameSync(temp, file)`.
   - `quarantine(reason)`: If file exists, rename to `${file}.bak` (or `${file}.${Date.now()}.bak` if backup exists).

### AUTHORITY IMPLEMENTATION INVARIANTS
1. `class HealthAuthority`:
   - `constructor(private readonly store: HealthAuthorityStore, private readonly log?: (msg: string) => void)`
   - Restores state via `this.store.load()` or initializes default `{ version: 1, providers: {}, updatedAt: 0 }`.
   - `onChange?: () => void;` callback triggered whenever new valid evidence is ingested.
   - `ingestEvidence(params: HealthEvidenceParams): void`:
     - Extracts Claude rate limit info (`params.evidence.rate_limit_info`).
     - Normalizes status: if `rate_limits.five_hour.used_percentage >= 1.0` -> `'blocked'`; if `>= 0.9` -> `'limited'`; else `'allowed'`.
     - Updates `this.state.providers.claude`.
     - Updates `this.state.updatedAt = Date.now()`.
     - Invokes `this.onChange?.()`.
   - `flush(): void`: Calls `this.store.save(this.state)`.
   - `getSnapshot(): HealthSnapshot`: Returns a structured copy of `this.state`.

### TEST EXECUTION COMMAND
```bash
npm run build
node --test test/health-authority.test.mjs
```

### ACCEPTANCE CRITERIA
- `test/health-authority.test.mjs` verifies:
  1. Default initialization when file does not exist.
  2. Normalization of Claude rate limits into `allowed`/`limited`/`blocked`.
  3. Safe atomic saving to disk.
  4. Reloading persisted state on new instance.
  5. Quarantining corrupt JSON file to `.bak`.
  6. Quarantining newer schema version (e.g. `version: 99`).
- STOP immediately once tests pass.

---

## 6. ECONOMY VERIFICATION & CONCLUSION

All coordinates, lifecycle boundaries, storage formats, and distribution streams are grounded directly in the verified source files of the repository. Claude Sonnet 5 LOW can execute Slice 4.1 directly without further research.
