# SCOUT PLAY - READ-ONLY RECONNAISSANCE

Play ID: routing-r0-researched-prior-pack-fresh-20260926-065012  
Scout ID: r0-scout-openrouter-prior-terrain  
Assigned custom agent: sideline-scout-quick  
Assigned model: openrouter/cohere/north-mini-code:free  
Game root: C:\Users\dmcal\Documents\GitHub\SidelineCoach

**CURRENT SCOUT TARGET / RECEIVER MAP**

## Scout Player Identity (FACT)
- **playerType**: 'scout' (from src/scout-player-contract.ts:3)
- **instanceId**: 'scout' (from src/scout-player-contract.ts:2)
- **executionType**: 'scout-formation' (from src/scout-player.ts:76, src/scout-player.ts:156)
- **provider**: 'scout' (from src/scout-player.ts:150)
- **transport**: 'controlled' (from src/scout-player.ts:145, src/scout-player.ts:156)
- **state**: 'ready' or 'busy' (depends on active formation)
- **autoEligible**: false (from src/scout-player.ts:157)
- **supportsQueue**: false (from src/scout-player.ts:158)

## Current Scout Formation Receivers (FACT)
From src/scout-formation.ts:129:
1. **ANTIGRAVITY_CANDIDATE**
   - id: 'antigravity'
   - player: 'AntiGravity'
   - provider: 'AntiGravity'
   - execution: gemini-3.8-flash model (medium effort)
   - eligibility: Last known Player Verification state is READY

2. **GEMINI_FLASH_DIRECT_CANDIDATE**
   - id: 'gemini-flash-direct'
   - player: 'Gemini Flash Direct'
   - provider: 'Google Gemini API'
   - eligibility: Direct Gemini agent contract is read-only AND a credential is present
   - execution: createDirectGeminiExecutor (configDir: tools/scouts/opencode-interchange)

**FACT**: Scout is a Virtual PlayerType (from src/virtual-player.ts:37), NOT part of the core PlayerId types ('claude', 'codex', 'antigravity', 'terminal').

## Player Routing Capability Evidence (FACT)

From src/scout-player.ts:144-159:
```typescript
const capability = {
  instanceId: SCOUT_PLAYER_INSTANCE_ID, // 'scout'
  playerType: SCOUT_PLAYER_TYPE, // 'scout'
  transport: 'controlled',
  transportLabel: 'Controlled',
  fieldLabel: 'Scout',
  state: this.active ? 'busy' : 'ready',
  capability: {
    provider: SCOUT_PLAYER_TYPE, // 'scout'
    authenticated: true,
    models: [], // Scout has no models - it's a formation orchestrator
    observedAt,
    freshness: 'live'
  },
  executionType: 'scout-formation',
  autoEligible: false,
  supportsQueue: false
};
```

## ROUTING TARGET VS FORMATION RECEIVER

### **ROUTING TARGET: Scout Player** (FACT)
- Used in src/routing-policy.ts:278-318 (computeScoutAutoRoute)
- Used in src/routing-policy.ts:332-364 (computeScoutDirectiveRoute)
- Scout is a first-class routing target with instanceId 'scout'
- Identified via: candidate.instanceId === SCOUT_PLAYER_INSTANCE_ID && candidate.playerType === SCOUT_PLAYER_TYPE && candidate.executionType === 'scout-formation'

### **FORMATION RECEIVERS: Scout's Subordinates** (FACT)
- Scout Formation executes 1-3 receivers via runScoutFormation()
- Receivers are from DEFAULT_FORMATION_CANDIDATES (src/scout-formation.ts:129)
- Each receiver has eligibility() and createExecutor() methods
- Scout's execution is 'scout-formation' - it's the orchestrator, not the receiver

**S57.1 COMPLIANCE**: Scout-role observations never mix with Player-role observations (from src/play-analyzer.ts:247). Scout is a distinct playerType from the provider models.

## MODEL / EFFORT / COST-CLASS TRUTH

### **Scout Model Classification** (FACT)
- **playerType**: 'scout' (distinct from claude/codex/antigravity/terminal)
- **executionType**: 'scout-formation' (formation orchestrator)
- **capability.provider**: 'scout' (from src/scout-player.ts:150)
- **capability.models**: [] (Scout is model-less - it's a formation orchestrator)

### **Scout Capability Freshness** (FACT)
- **'live'** when Scout is ready and has proven eligible receivers
- **'unavailable'** when disabled or no eligible receivers
- **'busy'** when actively running a Formation

### **COST-CLASS DETERMINATION** (INFERENCE)
Scout is provider-managed infrastructure:
- **Capability**: formation orchestrator (not a reasoning model)
- **Cost structure**: Free/declared via Scout configuration 
- **Capacity**: Bounded by formation size (max 3 concurrent receivers)
- **Resource impact**: Scout cost is separate from provider model costs (from src/scouter-player-contract.ts:29-35)

### **EFFORT CLASS** (INFERENCE)
Scout's "effort" is formation management:
- **efficiency**: Bounded execution (1-3 receivers)
- **scope**: Reconnaissance orchestration only
- **duration**: Formation execution time (typically 10-30 minutes per Scout run)

## PUBLIC CAPABILITY EVIDENCE

### **Current Scout Evidence Sources** (FACT):

1. **Provider Capability Documents** (from src/scouter-player.ts:26-42):
   - OpenRouter: ~50 free-model requests/day for free account (2026-09-17)
   - OpenRouter: 1,000/day after $10+ credits
   - Rate limit: 20 requests/minute

2. **Combine Scorecards** (from src/scout-formation.ts:61-87):
   - AntiGravity candidate eligibility depends on Player Verification state
   - Requires 'READY' state from scout-player-verification
   - Direct Gemini requires GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY

3. **Real-Game Film Evidence**:
   - Look at existing REPORT files in REPORTS/Scout Only/
   - Examine Formation results for actual receiver performance
   - Review Combine scorecards for historical receiver readiness

### **Scout Model Lineages** (FACT):
- **OpenRouter-backed Scouts**: Via combine-derived candidates
- **OpenCode-hosted Scouts**: Via tools/scouts/opencode-interchange
- **Google Gemini Scouts**: Direct API integration
- **AntiGravity Scouts**: sideline-formation-scout agent

## PROPOSED RECONNAISSANCE PRIOR INPUTS

Based on current source evidence, here are proposed inputs for R0 CapabilityPriorPack:

### **PROPOSED PRIOR INPUTS** (PROPOSED RESEARCH INPUT ONLY):

```json
{
  "node": "scout/*",
  "taskClass": "formation-reconnaissance", 
  "difficulty": "hard",
  "firstPass": 0.70, // High uncertainty - Scout discovery is new
  "strength": 4, // Single-source evidence (from existing reports)
  "burn": {
    "fiveHour": [0.05, 0.10, 0.20],
    "weekly": [0.01, 0.02, 0.05]
  },
  "durationMin": [10, 20, 40], // Formation runs typically 10-40 minutes
  "researchedAt": "2026-09-26",
  "sources": [
    "Sideline Coach S31 architecture documents",
    "Scout Formation V0.2 implementation",
    "Combine scoring and Player verification evidence"
  ],
  "researchQuality": "single-source"
}
```

### **ARCHITECT DECISION REQUIRED** (ARCHITECT / A-TEAM REVIEW REQUIRED):
- Scout's 'free' cost class needs commercial envelope validation
- Formation receiver model selection needs provider interchangeability research
- Scout availability metrics need maturation from infrastructure evidence to capability belief

## KEEP OUT OF CAPABILITY PRIOR PACK

### **EXCLUDE FROM SCOUT CAPABILITY PRIOR** (FACT):

**Player-Role Observations** (must never mix with Scout-role):
- modelId values (scout has no models)
- effort classifications (scout orchestrates, doesn't reason)
- provider performance metrics (scout is infrastructure, not provider)

**Infrastructure vs Capability Confusion**:
- **Keep OUT**: Provider capacity, rate limits, authentication status
- **Keep IN**: Formation execution capability, receiver eligibility logic, orchestration performance

**Historical Reports as Evidence** (FACT):
- Scout architecture evolution (S31 → S35 → S40)
- Formation success/failure patterns
- Combine integration progress
- But NOT as current capability truth

**Provider-Specific Evidence** (FACT):
- OpenRouter quota documentation
- Gemini API credential requirements
- AntiGravity headless agent specifications
- These are infrastructure facts, not Scout capability beliefs

## SCOUT ROI INPUTS FOR LATER

### **Separate from Capability Belief** (FACT):
- **P_runs** (Provider runs): Combine scorecards count success/failure
- **P_right** (Intelligence correctness): Bad scout evidence attributions
- **Infrastructure fatigue**: Provider outages, quota exhaustion
- **Formation delays**: Queue positions, wait times

### **Scout Economics Model** (FROM REPORTS):
From S57.1 Architecture §10:
```typescript
// Scout ROI formula
reconFraction = reconPrior(taskClass, difficulty) × (1 + gap?) × (1 - possession)
savedBurn = P_useful × reconFraction × burn_p50(primaryTarget)
gain = λ_c × price(primary provider) × savedBurn
cost = λ_c × scoutPriceCost + λ_d × urgencyMult × delayHours(tier) + harm
netValue = gain − cost
```

## UNKNOWN / CONTRADICTIONS

### **CURRENT UNKNOWN** (NOT VERIFIED):
1. **Commercial Entitlement**: Exact cost class boundaries for Scout pricing
2. **Provider Capacity Truth**: Real-time OpenRouter/Gemini/AntiGravity capacity limits
3. **Formed Receiver Performance**: Actual success rates of current formation receivers
4. **Drift Detection**: How quickly Scout formation evidence decays

### **CONTRADICTIONS** (REQUIRES RESOLUTION):
1. **Ready vs Available**: Scout shows 'ready' but may have infrastructure limitations
2. **Free vs Declared**: Scout is 'free' but may have undeclared capacity constraints
3. **Formation vs Orchestration**: Is Scout execution formation management or true reconnaissance?

## SOURCES

### **PRIMARY SOURCE DOCUMENTATION** (FACT):
1. **S57.1 Architecture Report** (REPORTS/Claude/S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md)
2. **Scout Formation Implementation** (src/scout-formation.ts, src/scout-player.ts)
3. **Player Discovery System** (src/player-discovery.ts, src/player-adapters.ts)
4. **Routing Policy** (src/routing-policy.ts, src/control-plane/router.ts)

### **SECONDARY EVIDENCE** (FACT):
1. **Existing Reports**: REPORTS/Scout Only/ (Formation results, Combine scorecards)
2. **Test Files**: test/scout-*.test.mjs (implementation contracts)
3. **Project SOP**: Project SOP/Scout Launch SOP.txt (operational procedures)
4. **Commercial Architecture**: S57.2, S57.5 reports (economics integration)

### **RESEARCH GAP IDENTIFIED**:
- **No published provider evaluations** for Scout-specific capabilities
- **No benchmark data** for formation execution vs direct reconnaissance
- **No drift analysis** of Scout infrastructure capacity over time

---

**RECONNAISSANCE SUMMARY**: Scout is currently a Virtual PlayerType 'scout' that orchestrates Formation receivers via controlled transport. It's distinct from provider models and has its own executionType 'scout-formation'. The architecture supports bounded reconnaissance with infrastructure separation, but capability priors need A-Team validation for commercial and performance dimensions. Scout should remain separate from Player capability beliefs per S57.1 requirements.
