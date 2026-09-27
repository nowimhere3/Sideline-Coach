### CURRENT SCOUT LIFECYCLE SOURCE OF TRUTH

**FACT:** The Scout lifecycle system consists of two parallel but integrated implementations:

1. **Scout Formation System** (scout-formation.ts, runScoutFormation) - Newer system focused on bounded, read-only reconnaissance
2. **Scout Play System** (scout-play-runner.ts, runScoutPlay) - Legacy system for multi-receiver formation execution

**KEY DISCOVERIES:**

- **Formation States** (scout-formation.ts:195): `COMPLETE`, `PARTIAL`, `BLOCKED`, `FAILED`, `UNKNOWN`
- **Scout Attempt States** (scout-play-runner.ts:18): `QUEUED`, `RUNNING`, `COMPLETE`, `FAILED`, `INTERRUPTED`, `UNKNOWN`  
- **Both systems track**: start/end timing, substitution events, replacement decisions, final outcomes
- **Status Persistence**: JSON files (telemetry.json, lifecycle.json), parent artifacts (FORMATION-COMPLETE.json, SCOUT-PLAY-COMPLETE.json)

**FACT:** Current Scout lifecycle status exists **both** as:
- Structured objects/events (from the runner)
- Persisted filesystem artifacts (JSON, markdown reports)

**BEST SEAM:** The existing structured runner events in **scout-play-runner.ts** provide the cleanest foundation for exposing lifecycle telemetry to the browser.

---

### RUNNER EVENT / STATE MAP

**FACT:** Runner events provide comprehensive lifecycle visibility:

| Event | Purpose | When Emitted |
|-------|---------|--------------|
| `formation-start` | Formation dispatch intent | Before any receivers run |
| `lane-queued` | Individual Scout queued | When lane's result state = QUEUED |
| `attempt-start` | Receiver execution begins | When result state = RUNNING |
| `attempt-end` | Receiver execution completes | On terminal event with receiver state |
| `substitute` | Receiver replacement | When substitute selected and fielded |
| `no-substitute` | No eligible receiver | When lane cannot field |
| `lane-complete` | Lane success achieved | When all lanes COMPLETE |
| `formation-end` | Aggregate outcome | After all executions |

**FACT:** Events include:
- Precise timing stamps (`at`, `durationMs`)
- Substitution decisions (`from`, `to`)
- Failure classification (`failureClass`, `reason`)
- Receiver/model identity (complete metadata)
- Formation outcome aggregation

**INFERENCE:** The existing event system already provides **all required lifecycle states** in the requested format, just not exposed externally to the browser.

---

### EXISTING BROWSER / HOST BRIDGES

**FACT:** Stadium-client.ts provides the existing browser integration:

1. **WebSocket/SSE Transport**: Direct real-time updates from Control Plane
2. **Stadium Client**: Process bridge connecting runner events to browser
3. **Report Notifications**: Formation result handoff already supported via `registerScoutFormationReport`
4. **Event System**: Broadcast mechanism for real-time updates

**KEY DISCOVERY:** 
- `sendTurnChanged` method already exists (stadium-client.ts:395) for exposing turn/Formation lifecycle events
- `publishReportsChanged` handles report artifact availability changes
- Stadium notification protocol includes Scout-specific features: `'scout.formation-operator.v1'`

**FACT:** The browser-facing bridge **already exists** - it's the protocol communication, not the UI display layer. Stadium client enables real-time telemetry flow to browser.

---

### DEV MODE UI SEAM

**RECOMMENDATION:** **Do NOT** scrape stdout/text. **YES** - use existing structured seam.

**BEST IMPLEMENTATION SLICE:** Extend existing **stadium-client.ts** event handling:

```typescript
// stadium-client.ts:773-807
if (req.method === 'scout.formation.status') {
  const scout = this.options.scoutPlayer;
  if (!scout) throw new Error('Scout not available');
  
  const availability = scout.availability(ctx.binding.rootFsPath);
  const ready = availability.considered.filter(candidate => candidate.eligible);
  
  return {
    success: true,
    gameId: ctx.game.gameId,
    formationStatus: availability, // Existing structured data
    receivers: ready.map(({id, player, provider}) => ({id, player, provider}))
  };
}
```

**MINIMAL STATUS MODEL:**
```typescript
interface ScoutFormationStatus {
  formationId: string;
  objective: string;
  gameRoot: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'BLOCKED' | 'UNKNOWN';
  startedAt: string;
  endedAt?: string;
  elapsedMs?: number;
  scoutsRequested: number;
  scoutsCompleted: number;
  scoutsFailed: number;
  scoutsSubstituted: number;
  receivers: {
    id: string;
    player: string;
    provider: string;
    state: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'INTERRUPTED' | 'UNKNOWN';
    startedAt?: string;
    endedAt?: string;
    durationMs?: number;
  }[];
}
```

---

### TIMER REUSE

**FACT:** Multiple timer infrastructures exist:

1. **Per-Attempt Timers** (scout-play-runner.ts:382-385): Per-receiver execution timing
2. **Formation Timers** (scout-formation.ts:608-608): Formation start/end aggregation  
3. **Scout Play Timers** (scout-play-runner.ts:384-385): Play-level elapsed calculation

**BEST REUSE:** **Formation-level timer from scout-formation.ts** already provides the exact lifecycle aggregation needed:

```typescript
// scout-formation.ts:608
const startedAt = isoNow();

// ... (formation execution) ...

const endedAt = isoNow();
const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt);
```

**CONCLUSION:** Existing timer infrastructure can directly serve the minimal elapsed time requirement for the status surface.

---

### MULTI-FORMATION / SUBSTITUTION BEHAVIOR

**ONE ACTIVE FORMATION:**
- ScoutPlayerAdapter enforces single formation (line 175: `if (this.active) throw new Error('Scout is already running a Formation.')`)
- Stadium client tracks one logical turn per Game

**MULTIPLE CONCURRENT FORMATIONS:**
- Currently **NOT SUPPORTED** (architecture limitation)
- Would require: turnRef distinction, per-formation state isolation, formation ID routing

**SUBSTITUTIONS:**
- Lane-specific replacement (scout-play-runner.ts:578-619)
- `SubstitutionRecord` structure captures: `lane`, `failedReceiver`, `replacement`, `failureReason`
- Preserved attempts track original failures for game film

**FAILED SCOUTS:**
- Each attempt maintains full provenance (stdout/stderr paths, failure classification)
- Scorecard updates track failure patterns for eligibility determination

**FORMATION COMPLETION:**
- Master formation report (FORMATION-RESULT.md) captures complete outcome
- Stadium notification via `sendTurnChanged` exposes aggregate result
- Parent provenance maintained for evidence chain

---

### MINIMAL STATUS MODEL

**REQUIRED FIELDS (per row):**
- `formationId` (timestamped identifier)
- `objective` (reconnaissance question)
- `status` (current lifecycle state)
- `startedAt` (formation dispatch time)
- `finishedAt` (completion timestamp)
- `elapsed` (formation duration)
- `receivers` (array with receiver identity and state)

**RECOMMENDED STATUS PANEL SHAPE:**
```typescript
// UI minimal representation
interface ScoutFormationRow {
  formationId: string;
  objective: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'BLOCKED';
  startedAt: string;
  finishedAt?: string;
  elapsed?: number;
  receivers: {
    name: string;        // Receiver name (e.g., "AntiGravity", "Gemini Flash Direct")
    model: string;       // Model identity
    state: string;       // Individual lifecycle state
  }[];
}
```

---

### SMALLEST IMPLEMENTATION SLICE

**IMPLEMENTATION PRIORITIES:**

1. **Protocol Extension** (stadium-client.ts:818-807): Add `scout.formation.status` RPC
2. **Event Bridge** (stadium-client.ts:224-228): Expose status change notifications to browser
3. **UI Integration** (extension.ts:217-220): Add Scout status capability to Stadium protocol
4. **Timer Integration** (scout-formation.ts:608-608): Reuse existing formation timing

**CODE IMPACT:**
- **New Protocol Method**: 20 lines in stadium-client.ts
- **Status Aggregation**: 15 lines in stadium-client.ts (existing event handling)
- **UI Capability**: 5 lines in extension.ts
- **Total Implementation**: ~40 lines, **READ-ONLY** to existing architecture

**RISK MITIGATION:**
- Use existing `scoutReportSource` for structured data access
- Leverage existing `turnStateByInstance` pattern for status tracking
- Reuse existing `notifyVirtualReadinessChanged` for status updates

---

### TEST / ACCEPTANCE PLAN

**UNIT TESTS TO PROTECT:**

1. **Protocol Method Test** (stadium-client.ts:818-807): Validate `scout.formation.status` response format
2. **Status Aggregation Test** (stadium-client.ts:224-228): Verify real-time status updates
3. **Formation Timer Reuse Test** (scout-formation.ts:608): Confirm elapsed time accuracy
4. **Multiple Formation Isolation Test**: Ensure single-formation constraint
5. **Substitution Tracking Test**: Validate replacement status propagation

**ACCEPTANCE TESTS:**

1. **Dev Mode UI Integration**: Status panel appears when Scout enabled
2. **Real-time Updates**: Browser reflects runner state changes within 100ms
3. **Lifecycle Coverage**: All 5 requested states (QUEUED, RUNNING, COMPLETE, FAILED, SUBSTITUTED) exposed
4. **No Runtime Impact**: Existing functionality unchanged
5. **Memory Footprint**: Minimal additional state tracking

---

### RISKS

**RISK 1: Architecture Complexity**
- **Probability**: LOW  
- **Impact**: Medium
- **Mitigation**: Use existing stadium protocol patterns

**RISK 2: Real-time Latency**
- **Probability**: MEDIUM
- **Impact**: Medium  
- **Mitigation**: Leverage existing WebSocket transport

**RISK 3: State Synchronization**
- **Probability**: LOW
- **Impact**: Medium
- **Mitigation**: Use existing Formation completion artifacts

**RISK 4: UI Integration Complexity**
- **Probability**: MEDIUM
- **Impact**: Low
- **Mitigation**: Start with minimal status panel, extend iteratively

**OVERALL RISK LEVEL**: MODERATE

---

### CONCLUSION

**BEST PATH:** Extend existing **stadium-client.ts** event handling to expose structured Scout formation status via new `scout.formation.status` protocol method. This leverages the **already-robust structured event system**, requires **minimal new code** (~40 lines), and provides **complete lifecycle visibility** without any runtime changes.

**VERDICT**: MODERATE

The solution leverages existing Scout infrastructure to provide a minimal bounded status surface that meets all requirements: read-only, structured telemetry, real-time updates, and Dev Mode isolation.
