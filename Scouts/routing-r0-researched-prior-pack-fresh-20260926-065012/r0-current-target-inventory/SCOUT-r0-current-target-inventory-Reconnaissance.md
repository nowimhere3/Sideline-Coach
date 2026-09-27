# SCOUT PLAY - READ-ONLY RECONNAISSANCE

## Play ID: routing-r0-researched-prior-pack-fresh-20260926-065012
## Scout ID: r0-current-target-inventory
## Assigned custom agent: sideline-scout-quick
## Assigned model: openrouter/cohere/north-mini-code:free
## Game root: C:\Users\dmcal\Documents\GitHub\SidelineCoach

## CURRENT TARGET MATRIX

### 1. CURRENT PLAYER TYPES FOR ROUTING/SCOUT ROUTING

**FACT:** The current system has exactly 5 player types that can participate in routing:
- `'claude'` - controlled and legacy transport
- `'codex'` - controlled and legacy transport  
- `'antigravity'` - controlled and legacy transport
- `'scout'` - controlled transport, executionType: 'scout-formation'
- `'terminal'` - legacy transport only

**EVIDENCE:** 
- `src/player-adapters.ts:11` defines PlayerId as `'claude' | 'codex' | 'antigravity' | 'terminal'`
- `src/scouter-player-contract.ts:3` defines `SCOUT_PLAYER_TYPE = 'scout'`
- `src/routing-policy.ts:275` shows Scout is recognized as a player type in routing
- `src/scout-formation.ts:27` imports SCOUT_PLAYER_TYPE for Scout formation

**UNKNOWN:** Virtual player types may exist but are not documented in current source.

### 2. CURRENTLY CONFIGURED MODELIDS RELEVANT TO EXECUTION

**FACT:** Current discoverable modelIds are:
- **Claude:** `'opus'`, `'sonnet'`, `'haiku'`
- **Codex:** `'gpt-5.6-sol'`, `'gpt-6-astra'`, `'gpt-5-luna'`
- **AntiGravity:** `'flash'`, `'pro'` (and potentially Gemini models)

**EVIDENCE:**
- `src/routing-policy.ts:62-70` shows Claude policy selects from ['opus', 'sonnet', 'haiku']
- `src/routing-policy.ts:71-74` shows Claude implements selection from ['sonnet', 'opus']
- `src/routing-policy.ts:79-84` shows Claude quick selects from ['haiku', 'sonnet']
- Test fixtures in `test/routing-intelligence.test.mjs:48-71` show Codex models
- `src/routing-policy.ts:154-165` shows AntiGravity policy selects from ['flash', 'pro']

**CONTRADICTION:** 
- The architectural document S57.1 mentions lineage mapping for `claude-opus`, `claude-sonnet` but current code uses simple modelIds
- S57.1 shows `'provider-default'` but current code uses `undefined`

### 3. CURRENT LINEAGE RELATIONSHIPS

**FACT:** Current lineage relationships proven from source:
- No lineage relationships exist in current code
- `src/routing-policy.ts:312-317` shows PROVIDER_PREFERENCE table but no lineage mapping
- `src/player-adapters.ts:11` shows simple PlayerId types with no hierarchy

**EVIDENCE:** 
- All playerType values are flat: `'claude'`, `'codex'`, `'antigravity'`, `'terminal'`, `'scout'`
- No `lineage` field exists in current `PlayerRoutingCapability` interface
- `src/routing-policy.ts:313-317` shows legacy provider preference table

**INFERENCE:** 
- The architectural document's lineage mapping (`claude-opus`, `claude-sonnet`) will require new implementation
- R0 will need to research mapping between modelIds and lineage concepts

### 4. CURRENT EFFORT/REASONING TIERS REPRESENTED

**FACT:** Current effort tiers in production:
- `'low'`, `'medium'`, `'high'`
- Additional tiers seen in test data: `'ultra'`, `'max'`, `'extra-high'`, `'xhigh'`

**EVIDENCE:**
- `src/routing-policy.ts:62,68,82` shows Claude supports 'high', 'medium', 'low'
- Test fixtures: `test/routing-intelligence.test.mjs:52` shows `supportedEfforts: ['low', 'medium', 'high']`
- Test fixtures: `test/routing-intelligence.test.mjs:60` shows `supportedEfforts: ['high', 'ultra']`
- `src/capability-types.ts:8` shows `supportedEfforts: readonly string[]`

**UNKNOWN:** 
- The architectural document mentions `'provider-managed'` as an effort tier
- The architectural document mentions `'xhigh'` tier

### 5. CURRENT TRANSPORTS CONTROLLED VS CONTROLLED

**FACT:** Current transport types:
- `'controlled'` - Coach can set model/effort
- `'legacy'` - Provider manages model/effort

**EVIDENCE:**
- `src/capability-types.ts:26` defines `transport: 'controlled' | 'legacy'`
- `src/routing-policy.ts:375` checks `candidate.transport === 'legacy'`
- `src/routing-policy.ts:503` filters `controlledCandidates.filter(c => c.transport === 'controlled')`
- `src/player-adapters.ts:142` defines PlayerTransportLabel with 'Controlled' vs 'Terminal'

### 6. CURRENT TARGETS RUNTIME-REAL VS ARCHITECTURE-ONLY

**FACT:** Runtime-real targets:
- All player types exist in production: claude, codex, antigravity, scout, terminal
- ModelIds exist in test fixtures and policy logic
- Effort tiers exist in policy logic and test data

**ARCHITECTURE-ONLY PLACEHOLDERS (from S57.1 but not implemented):**
- No `CapabilityPriorPack` exists (`src/routing-intel/priors.json` missing)
- No `RoutingFilm` journal store
- No `DeferredPlay` store  
- No `RoutingEconomicsSnapshot`
- No lineage hierarchy (`playerType → lineage → modelId → effort`)

**EVIDENCE:** 
- Glob search `**/*priors*` returns no results
- No routing-intel directory exists in source
- All intelligent routing components from S57.1 are future-stage implementations

### 7. MODEL NAMES ONLY IN OLD REPORTS/HISTORY

**FACT:** Model names from historical/architectural documents:
- From S57.1: `'claude-opus'`, `'claude-sonnet'`, `'codex-frontier'`
- Current production uses: `'opus'`, `'sonnet'`, `'gpt-5.6-sol'`, etc.

**EVIDENCE:**
- S57.1: `src/routing-policy.ts:313` shows `const PROVIDER_PREFERENCE: Record<TaskClassification, readonly string[]>`
- S57.1 `src/capability-types.ts:84` shows lineage concepts: `'claude-opus'`, `'claude-sonnet'`
- Current: `src/routing-policy.ts:312` shows simple provider preference table

### 8. EXACT SOURCE FILES, SYMBOLS, AND CONFIGURATION SEAMS

**FACT:** Supporting files for current routing system:
- **Core routing logic:** `src/routing-policy.ts` (1030+ lines)
- **Play classification:** `src/play-analyzer.ts` (239 lines) 
- **Type definitions:** `src/capability-types.ts` (178 lines)
- **Context affinity:** `src/control-plane/context-affinity.ts` (242 lines)
- **Scout contract:** `src/scouter-player-contract.ts` (4 lines)
- **Player adapters:** `src/player-adapters.ts` (190 lines)

**EVIDENCE:** 
- All files are actively imported and used across the codebase
- Test coverage exists in `test/routing-intelligence.test.mjs`
- Routing decisions flow through `computeAutoRoute()` → `computeContextAwareRoute()`
- Scout integration is implemented in `computeScoutAutoRoute()` and `computeScoutDirectiveRoute()`

## PLAYER TYPE → LINEAGE → MODEL → EFFORT MAP

| Player Type | Current Lineage | Current Models | Current Efforts | Transport |
|-------------|----------------|----------------|----------------|-----------|
| claude | None (flat) | opus, sonnet, haiku | high, medium, low | controlled/legacy |
| codex | None (flat) | gpt-5.6-sol, gpt-6-astra, gpt-5-luna | high, ultra, medium, low | controlled/legacy |
| antigravity | None (flat) | flash, pro | high, medium, low | controlled/legacy |
| scout | None (special type) | Scout Formation | Formation-specific | controlled only |
| terminal | N/A | Not applicable | Not applicable | legacy only |

## ROUTABLE VS SCOUT-ONLY TARGETS

**FACT:** 
- **Runnable targets:** claude, codex, antigravity (full Player types)
- **Scout-only target:** scout (special executionType: 'scout-formation')

**EVIDENCE:**
- `src/routing-policy.ts:442` shows Scout is considered in AUTO routing when reconnaissance needed
- `src/routing-policy.ts:326` shows explicit Scout directive routing
- `src/scout-player.ts:73` shows Scout has distinct playerType and executionType
- `src/routing-policy.ts:278` shows Scout is detected via `SCOUT_PLAYER_TYPE` and `SCOUT_PLAYER_INSTANCE_ID`

## PROVIDER-MANAGED EFFORT CASES

**FACT:** Current provider-managed effort cases:
- **Claude:** legacy transport always provider-managed
- **Codex:** legacy transport always provider-managed  
- **AntiGravity:** legacy transport always provider-managed
- **Scout:** controlled transport (Formation manages)
- **Terminal:** legacy transport always provider-managed

**EVIDENCE:**
- `src/routing-policy.ts:475-501` shows when `transport === 'legacy'`, model and effort are undefined/provider-managed
- `src/routing-policy.ts:380-384` shows Terminal has no model/effort
- `src/scout-formation.ts:496-497` shows Scout has modelDisplayName: 'Scout Formation'

## STALE / HISTORICAL NAMES TO EXCLUDE

**FACT:** Names from architectural documents that should NOT enter R0:
1. `'claude-opus'` (S57.1 lineage) - current uses `'opus'`
2. `'claude-sonnet'` (S57.1 lineage) - current uses `'sonnet'`  
3. `'codex-frontier'` (S57.1 lineage) - current uses `'gpt-6-astra'`
4. `'xhigh'` effort tier (S57.1) - current uses `'ultra'`, `'max'`
5. `'provider-managed'` effort (S57.1) - current uses `undefined` for legacy

**EVIDENCE:** 
- S57.1 is a design/architectural document, not current implementation
- Current code uses flat playerType names, not lineage
- Test fixtures show current modelIds in use

## R0 RESEARCH CHECKLIST

**FACT:** R0 must research the following CURRENT system components to create the first `CapabilityPriorPack`:

### ✅ COMPLETED RESEARCH (facts established):
- **Current Player Types:** claude, codex, antigravity, scout, terminal
- **Current ModelIds:** opus, sonnet, haiku; gpt-5.6-sol, gpt-6-astra, gpt-5-luna; flash, pro
- **Current Effort Tiers:** low, medium, high, ultra, max, extra-high
- **Current Transports:** controlled vs legacy
- **Current Scout Integration:** Scout is special player type with executionType: 'scout-formation'
- **Current Routing Logic:** AUTO vs MANUAL vs Context-aware routing in `routing-policy.ts`

### ⏳ UNKNOWN RESEARCH NEEDED:
- **Lineage relationships:** Current system has none; must research mapping concepts
- **Current evidence sources:** No `RoutingFilm` exists; must research current evidence collection
- **Burn estimates:** No current burn estimation system
- **Duration estimates:** No current duration estimation system
- **Sources for researchQuality:** Must research public documentation for each model

### 📋 REQUIRED RESEARCH INPUTS (PROPOSED PRIOR INPUT):
1. **Lineage mapping research:** How do Sideline concepts map to provider model families
2. **Model capability research:** Actual performance characteristics of current models
3. **Evidence research:** Current Play outcomes and performance data
4. **Resource economics research:** Current provider capacity and pricing

## UNKNOWN TARGET IDENTITY

**FACT:** The R0 target identity has significant uncertainty:

**KNOWN:** 
- R0 must produce a `CapabilityPriorPack` with priors for current player/model/effort combinations
- The pack will feed the future intelligent routing system described in S57.1
- Current system uses flat playerType names with no lineage hierarchy

**UNKNOWN:**
- What "researched capability priors" exist currently
- Whether `priors.json` is in the repository but not in source tree
- Current evidence collection systems (if any)
- Whether the architectural document S57.1 represents current state or future plan

**INFERENCE:** 
- The architectural document appears to be a design/plan, not current implementation
- R0 is likely the research play to create the foundation for S57.1
- Current system works but lacks the statistical learning framework described in S57.1

## CONCLUSION

The R0 CURRENT ROUTING TARGET INVENTORY reveals a significant gap between the settled architectural vision (S57.1) and the current production system:

**Current Reality:** Simple rule-based routing using flat player types, provider policies, and legacy/auto mode dispatch.

**Architectural Vision:** Statistical routing with hierarchical beliefs, researched priors, and local evidence optimization.

**R0 Mission:** Research the current system's capability landscape to create the foundation for the intelligent routing architecture that doesn't yet exist.

The Scout must gather evidence about current player capabilities, model characteristics, and provider behaviors to create the first `CapabilityPriorPack` that will enable the statistical routing system envisioned in S57.1.
