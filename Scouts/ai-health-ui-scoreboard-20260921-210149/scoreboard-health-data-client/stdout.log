Now I have a complete picture. Let me compile the reconnaissance report.

---

# SCOUT REPORT: AI Health UI Scoreboard Reconnaissance

**Play ID:** ai-health-ui-scoreboard-20260921-210149  
**Scout ID:** scoreboard-health-data-client  
**Assigned Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  

**Status:** RECONNAISSANCE ONLY — Not final architectural authority  
**Epistemic Labels:** FACT / INFERENCE / UNKNOWN / CONTRADICTION used throughout

---

## RESULT

The current Sideline Coach codebase exposes **canonical AI Health data via two Control Plane seams** that are fully implemented in the daemon (`src/control-plane/daemon.ts`) but **has zero frontend UI consumption** for this data in `src/public/index.html`. The smallest integration seam is adding an `ai-health` SSE event listener + a one-time `GET /api/ai-health` hydration call, feeding a compact scorecard component pair (compact inline + expanded drawer/modal).

---

## KEY DISCOVERIES

### 1. Backend HTTP API — `GET /api/ai-health` (FACT)
- **File:** `src/control-plane/daemon.ts` lines 1020–1023
- **Response:** `{ success: true, health: HealthAuthoritySnapshot }`
- **Auth:** Bearer token required (standard `isAuthorized` check)
- **Snapshot shape** (from `src/control-plane/health-authority.ts` lines 39–43):
  ```typescript
  interface HealthAuthoritySnapshot {
    schemaVersion: 1;
    updatedAt?: string;           // ISO timestamp of last change
    providers: {
      claude?: ClaudeProviderHealthState;
      codex?: CodexProviderHealthState;
    };
  }
  ```
- **Provider state** (lines 9–35):
  ```typescript
  interface ClaudeProviderHealthState {
    provider: 'claude';
    evidenceType: 'rate_limit_event';
    rateLimitInfo: Record<string, unknown>;  // provider-native facts
    observedAt: string;                       // ISO timestamp
    source: ProviderHealthSource;             // stadiumId, instanceId, gameId, playerInstanceId
  }
  interface CodexProviderHealthState {
    provider: 'codex';
    evidenceType: 'account_rate_limits';
    rateLimitInfo: Record<string, unknown>;
    observedAt: string;
    source: ProviderHealthSource;
  }
  ```

### 2. Backend SSE — `/api/events` broadcasts `ai-health` events (FACT)
- **File:** `src/control-plane/daemon.ts` line 222 — `this.broadcast('ai-health', snapshot)` on every `HealthAuthority.onChange`
- **Event frame format** (server.ts lines 912–921 / daemon.ts line 919):
  ```
  event: ai-health
  data: {"schemaVersion":1,"updatedAt":"...","providers":{"claude":{...},"codex":{...}}}
  ```
- **Initial snapshot** sent immediately on SSE connect (tested in `test/health-authority-daemon.test.mjs` line 56)
- **Deduplication:** `HealthAuthority.ingest()` returns `false` and does not broadcast when factual fields (excluding `observedAt`) are unchanged (health-authority.ts line 131)

### 3. Frontend SSE Handling — `connectEvents()` in index.html (FACT)
- **File:** `src/public/index.html` lines 4457–4502
- **EventSource** created with `?token=` query param
- **Current listeners:** `hello`, `reports`, `status`, `execution`, `activity`
- **Missing:** No `ai-health` listener
- **Connection state machine:** `offline` → `reconnecting` (on connect/error) → `connected` (after `synchronizeAfterHello()` completes)
- **Reconnect behavior:** `eventSource.onerror` → `setConnectionState('reconnecting')` → `synchronizeAfterHello()` on next `hello`

### 4. Frontend Initial Hydration — `refresh()` (FACT)
- **File:** `src/public/index.html` lines 4421–4445
- **Parallel fetch:** `Promise.all([api('/api/status'), api('/api/reports')])`
- **On success:** `renderStatus()`, `renderReports()`, `hideAuth()`, `setConnectionState('connected')`
- **No current call to `/api/ai-health`**

### 5. Provider-Native Facts — No Classification in Backend (FACT)
- `rateLimitInfo` is a `Record<string, unknown>` — **backend never interprets, classifies, or thresholds** these values (health-authority.ts lines 119–122, 196–208)
- **Claude:** `rate_limit_info` (e.g., `{ status: 'allowed', utilization: 0.42, resetsAt: 123456 }`)
- **Codex:** `rate_limits` (e.g., `{ primary: { usedPercent: 17, resetsAt: 777, windowDurationMins: 300 }, planType: 'pro' }`)
- **Validation only:** bounded copy (max 100 nodes, depth 4, string ≤500, array ≤20, object ≤30 keys)

### 6. State Persistence & Reset Timing (FACT)
- **Persisted to:** `~/.sideline/ai-health-state.json` (health-authority.ts line 58)
- **Restored on:** daemon construction (line 112) → `restore()` (lines 156–165)
- **Flushed on:** `HealthAuthority.flush()` called during `daemon.stop()` (line 523) and SIGINT/SIGTERM (line 682)
- **Reset = daemon restart** — state survives restart; only explicit `quarantine()` clears it

---

## FACT

| # | Claim | Evidence |
|---|-------|----------|
| F1 | `GET /api/ai-health` exists and returns `{ success: true, health: HealthAuthoritySnapshot }` | `daemon.ts:1020-1023` |
| F2 | SSE `/api/events` broadcasts `event: ai-health` with full snapshot on every change | `daemon.ts:222`, `health-authority.ts:138` |
| F3 | Initial SSE connection delivers `ai-health` snapshot immediately (before any evidence) | `health-authority-daemon.test.mjs:55-56` |
| F4 | Frontend `connectEvents()` handles `hello`, `reports`, `status`, `execution`, `activity` — **no `ai-health` listener** | `index.html:4463-4497` |
| F5 | Frontend `refresh()` hydrates from `/api/status` + `/api/reports` only — **no `/api/ai-health` call** | `index.html:4424-4430` |
| F6 | Provider facts in `rateLimitInfo` are **opaque, provider-native, never classified by backend** | `health-authority.ts:119-122, 196-208` |
| F7 | `HealthAuthority` is **single global instance per daemon** (not per-Game) | `daemon.ts:145` |
| F8 | Deduplication: identical factual payload (excl. `observedAt`) suppresses broadcast & save | `health-authority.ts:131` |
| F9 | State persists to `~/.sideline/ai-health-state.json` and restores on daemon restart | `health-authority.ts:58, 156-165`, `daemon.ts:523, 682` |
| F10 | Frontend connection states: `connected` | `reconnecting` | `offline` — controls `data-live-action` element enablement | `index.html:1833-1851` |
| F11 | Reconnect flow: `onerror` → `reconnecting` → `hello` → `synchronizeAfterHello()` → `refresh()` → `connected` | `index.html:4449-4455, 4498-4501` |
| F12 | No frontend tests for AI Health UI; backend tests cover daemon HTTP/SSE only | `test/health-authority-daemon.test.mjs` |

---

## INFERENCE

| # | Inference | Basis |
|---|-----------|-------|
| I1 | UI should render **provider-native facts verbatim** (utilization %, usedPercent, resetsAt, planType) — no "healthy/degraded" badges invented | F6, bounded objective forbids inventing classifications |
| I2 | **Absence of a provider** in `providers` = `UNKNOWN` (not "healthy", not "unavailable") | F1 snapshot shape shows optional `claude?`, `codex?` |
| I3 | `observedAt` is the **sole freshness signal** — UI should show "last updated X ago" or timestamp | F1, F9 |
| I4 | **Compact + Expanded should be a small component pair**: compact inline in header/status bar (provider pills with utilization), expanded drawer/modal on click showing full `rateLimitInfo` JSON + provenance (`source`, `observedAt`) | F3 initial snapshot available immediately; F10 connection state already drives header UI |
| I5 | One-time `GET /api/ai-health` on page load + `ai-health` SSE listener = complete data path | F2, F4, F5 |
| I6 | Reconnect `hello` should **not** reset AI Health UI — SSE `ai-health` event will redeliver current snapshot | F3, F11 |
| I7 | Provider availability = presence in `providers` object; `UNKNOWN` = absent; never infer from other signals | F1, F7 |

---

## UNKNOWN

| # | Question | Why Unknown |
|---|----------|-------------|
| U1 | Exact desired visual design for compact scorecard (pills? badges? single line?) | No UI spec in repository |
| U2 | Whether expanded view should be a modal, drawer, or inline accordion | No UI spec |
| U3 | Whether `rateLimitInfo` keys are stable across provider versions (e.g., Claude always sends `utilization`, `resetsAt`) | Backend treats as opaque `Record<string, unknown>` |
| U4 | Whether UI should show `source` provenance (stadiumId, instanceId, gameId, playerInstanceId) in expanded view | Bounded objective says "render provider-native facts... provenance" but no design |
| U5 | Whether a "stale" threshold (e.g., >5 min since `observedAt`) should be surfaced visually | No policy in codebase |
| U6 | Whether `updatedAt` on snapshot (optional) differs from latest provider `observedAt` | Schema allows both; not observed in tests |

---

## CONTRADICTION

| # | Claim | Evidence |
|---|-------|----------|
| C1 | None found — backend seams exist and are tested; frontend has zero consumption | F1–F12 consistent |

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/daemon.ts` | HTTP `/api/ai-health` (L1020), SSE broadcast `ai-health` (L222), HealthAuthority instantiation (L216–225) |
| `src/control-plane/health-authority.ts` | `HealthAuthoritySnapshot` type (L39–43), provider state types (L9–35), `ingest()` deduplication (L131), persistence (L58, L146–154) |
| `src/public/index.html` | Frontend SSE `connectEvents()` (L4457–4502), `refresh()` hydration (L4421–4445), connection state machine (L1833–1851), `renderStatus()` (L4058–4408) |
| `test/health-authority-daemon.test.mjs` | Canonical test for `/api/ai-health` + `ai-health` SSE — shows expected shapes and dedup behavior |
| `test/health-authority.test.mjs` | Unit tests for `HealthAuthority` validation, persistence, quarantine |

---

## SMALLEST UI INTEGRATION SEAM (INFERENCE)

**Files to touch (read-only reconnaissance — not implementing):**
1. `src/public/index.html` — add in `connectEvents()`:
   ```js
   eventSource.addEventListener('ai-health', (event) => {
     aiHealthSnapshot = JSON.parse(event.data);
     renderAiHealthScoreboard(aiHealthSnapshot);
   });
   ```
2. `src/public/index.html` — in `refresh()` or `synchronizeAfterHello()`:
   ```js
   const health = await api('/api/ai-health').catch(() => null);
   if (health) renderAiHealthScoreboard(health.health);
   ```

**Component pair (INFERENCE):**
- **Compact** — inline in header near connection dot: `Claude: 42% · Codex: 17%` (or `Claude: UNKNOWN · Codex: 17%`)
- **Expanded** — click compact → drawer/modal showing per-provider:
  - Provider-native `rateLimitInfo` as formatted JSON / key-value list
  - `observedAt` (human relative + ISO)
  - `source` provenance (stadiumId, instanceId, gameId, playerInstanceId)
  - `UNKNOWN` badge when provider absent

**State object (INFERENCE):**
```js
let aiHealthSnapshot = null; // HealthAuthoritySnapshot | null
```

**No new stores, no polling, no classification logic** — pure projection of canonical backend truth.

---

## LIMITATIONS

- Reconnaissance only — did not inspect any Figma, design docs, or product specs outside the codebase
- Did not verify browser compatibility of `EventSource` (assumed supported per existing usage)
- Did not test actual frontend rendering — only traced code paths
- Provider-native fact schemas (`rateLimitInfo` keys) observed only via test fixtures; real provider shapes may vary
- No accessibility / i18n requirements captured

---

**End of Report**
