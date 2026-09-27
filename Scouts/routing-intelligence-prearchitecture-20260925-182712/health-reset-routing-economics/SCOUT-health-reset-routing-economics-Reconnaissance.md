# SCOUT RECONNAISSANCE REPORT
**Play ID:** routing-intelligence-prearchitecture-20260925-182712  
**Scout ID:** health-reset-routing-economics  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free

## READ-ONLY RECONNAISSANCE OBJECTIVE
Map factual existing terrain for Routing Economics and AI health/reset systems. Identify seams, evidence gaps, and architect decisions required.

---

## SUMMARY OF EVIDENCE GATHERED

### CURRENT RESOURCE ECONOMICS INPUTS
**FACTO**: Health state persistence and tracking systems exist but have critical gaps.

**KNOWN FILES / PATHS**:
- `src/control-plane/health-authority.ts` - Core health state management
- `src/control-plane/alarm-engine.ts` - Threshold and state transitions  
- `src/control-plane/alarm-state-store.ts` - Alarm rule persistence
- `src/control-plane/resource-policy.ts` - Resource policy projections
- `src/control-plane/claude-usage-reader.ts` - Claude usage tracking
- `src/control-plane/codex-usage-reader.ts` - Codex usage tracking
- `src/control-plane/router.ts` - Dispatch routing logic
- `src/control-plane/play-queue.ts` - Play queuing system

---

## DETAILED ANALYSIS

### FACT: Health State Architecture

#### Health Authority System (`health-authority.ts`)
**FACT**: Implements provider health state tracking with:

- **ProviderHealthState interfaces**: Claude and Codex with `observedAt` timestamp field
- **HealthAuthoritySnapshot**: `schemaVersion`, `updatedAt`, `providers` objects
- **File persistence**: `fileHealthStateStore()` with quarantine/backup mechanisms
- **Evidence ingestion**: `ingest()` and `ingestClaudeUsage()` methods
- **Reset horizon tracking**: `pruneExpired()` method with `resetsAt` fields

**INFERENCE**: System designed for durable health state preservation across Control Plane restarts, with evidence provenance tracking.

#### Alarm Engine System (`alarm-engine.ts`)
**FACT**: Tracks provider health thresholds and transitions:

- **AlarmRuleState**: `NORMAL`, `LOW`, `CRITICAL`, `UNKNOWN` states
- **PersistedAlarmRuleState**: `horizonResetsAt`, `lastProcessedResetCycle` for reset horizon tracking
- **Rule evaluation**: `evaluateAlarmState()` based on `remainingPercent` and thresholds
- **Event delivery**: `AiAlarmEvent` with `remainingPercent` and `resetsAt` fields

**INFERENCE**: Provides threshold monitoring but doesn't expose remaining percentages directly to routing decisions.

#### Usage Readers (`claude-usage-reader.ts`, `codex-usage-reader.ts`)
**FACT**: Complementary acquisition systems:

- **ClaudeUsageReader**: OAuth-based usage reading with 3-15 minute cadence
- **CodexUsageReader**: App-server RPC-based usage reading  
- **Activity triggering**: `noteClaudeActivity()`, `noteCodexActivity()` for event-driven freshness
- **Distinct timestamps**: `lastSuccessAt` vs `observedAt` (health state changes vs reader checks)

**INFERENCE**: Usage readers provide additional freshness signals but don't integrate directly with resource economics calculations.

### MISSING DATA: Core Routing Economics Inputs

**UNKNOWN**: The following critical inputs are NOT currently available:

1. **Claude 5H remaining percentage**: Not directly exposed in current APIs
2. **Claude 5H reset horizon**: Only available as internal `horizonResetsAt` in alarm state
3. **Claude Weekly remaining percentage**: Not directly exposed  
4. **Claude Weekly reset horizon**: Internal state only
5. **Codex 5H remaining percentage**: Not directly exposed
6. **Codex 5H reset horizon**: Internal state only
7. **Codex Weekly remaining percentage**: Not directly exposed
8. **Codex Weekly reset horizon**: Internal state only
9. **Resource delta across a Play**: No calculation capability exists

**FACT**: Key economic inputs are trapped in internal state with no direct projection to routing decisions.

---

## EXISTING SEAMS FOR SCHEDULING / ROUTING

### SCHEDULE-LATER EXISTING SEAMS
**FACT**: Found limited scheduling seams:

- `play-queue.ts`: Queue system with `enqueue()`, `head()`, `markDispatching()`, `complete()` methods
- `router.ts`: Queue integration with `whenBusy: 'queue'` option
- `execution-projection.ts`: Queue counting in `ExecutionView.queue` property

**INFERENCE**: Basic queuing exists but no sophisticated scheduling logic based on reset horizons or economic optimization.

### NEXT-BEST-PLAYER SEAMS  
**FACT**: Limited availability:

- `routing-policy.ts`: `PROVIDER_PREFERENCE` table for provider ordering
- `router.ts`: Candidate filtering and provider selection logic
- `smart-route-resolver.ts`: Smart intent recognition for routing

**INFERENCE**: Provider selection based on capability and freshness, but no economic optimization considering reset horizons.

---

## ARCHITECT DECISIONS REQUIRED

### 1. **Resource Economics API GAP**
**REQUIRES ARCHITECT DECISION**: Exposing remaining percentages and reset horizons requires:
- New projection functions in `resource-policy.ts`
- API endpoints to surface health metrics for routing
- Integration between alarm engine state and routing decisions

### 2. **Play-Level Cost Estimation** 
**REQUIRES ARCHITECT DECISION**: Current system cannot estimate resource delta across Plays because:
- No historical cost tracking across Play lifecycles
- No integration between Play execution and provider usage
- Missing correlation between Play work and quota consumption

### 3. **Schedule-Later Economic Optimization**
**REQUIRES ARCHITECT DECISION**: Need sophisticated scheduling that considers:
- Reset horizon proximity
- Remaining capacity percentages  
- Play economic value vs resource cost
- Provider-specific reset patterns

### 4. **Next-Best-Player Economic Routing**
**REQUIRES ARCHITECT DECISION**: Economic ranking requires:
- Provider capacity scoring (current % remaining, time to reset)
- Reset-aware routing prioritization
- Economic threshold policies (CONSERVE integration)

---

## CURRENT SYSTEM CAPABILITIES

**FACT**: Available evidence for economic decisions:

1. **Provider availability**: `capability.freshness !== 'unavailable'`
2. **Provider capability**: `capability.models.length > 0`
3. **Provider state**: Ready/busy work states from `instanceWorkLedger`
4. **Play type classification**: Architecture/implementation/recon via `play-analyzer.ts`
5. **Team-aware routing**: `A-Team`/`B-Team`/`Scout` routing in `routing-policy.ts`

**FACT**: Missing economic intelligence:
- Remaining percentages hidden in internal state
- Reset timing not exposed to routing
- Historical cost data unavailable
- Economic optimization logic absent

---

## SPECIFIC MISSING IMPLEMENTATIONS

### 1. **ProviderResourcePolicy Integration Gap**
**INFEASIBLE**: `ProviderResourcePolicy` exists but isn't integrated with routing:
- `resource-policy.ts` provides policy projections
- `router.ts` doesn't consume these projections
- No economic routing based on remaining capacity

### 2. **Health Freshness as Economic Signal**
**INFEASIBLE**: Health freshness (`observedAt`) doesn't impact routing:
- `capability.freshness` only indicates availability
- No freshness-weighted routing decisions
- No economic value assigned to fresher data

### 3. **Reset Horizon Awareness**
**INFEASIBLE**: Reset timing is internal only:
- `horizonResetsAt` in alarm state is private
- No routing based on reset proximity
- No optimization before reset windows

---

## EVIDENCE GATHERING LIMITATIONS

**CONTRADICTION**: SOP requires more economic intelligence than system provides:
- SOP mentions "5H remaining", "weekly remaining", "reset horizon" 
- System provides these metrics but doesn't expose them to routing
- SOP requires economic optimization but system lacks routing economics

**IMPORTANT FILES STILL NEED EX examination**:
- `src/running-players.ts` - Player preferences may contain economic config
- `src/control-plane/work-ledger.ts` - May have cost/usage tracking
- `src/capability-service.ts` - May have freshness/economic calculations

---

## CONCLUSION

**FACT**: Current system provides foundational infrastructure but missing critical Routing Economics components:
- Health state tracking exists but economic metrics hidden
- Alarm engine provides threshold monitoring but no economic optimization  
- Provider selection based on capability, not economics
- Scheduling limited to basic queuing, no economic optimization
- No integration between health freshness and routing decisions

**ARCHITECT DECISIONS REQUIRED**:
1. Expose remaining percentages and reset horizons to routing
2. Implement play-level resource delta calculation
3. Add economic optimization to schedule-later functionality
4. Integrate ProviderResourcePolicy with routing decisions
5. Build reset-aware next-best-player selection
6. Connect health freshness to economic routing weightings

The system has the plumbing for health monitoring but requires economic intelligence layer to fulfill Routing Economics requirements.
