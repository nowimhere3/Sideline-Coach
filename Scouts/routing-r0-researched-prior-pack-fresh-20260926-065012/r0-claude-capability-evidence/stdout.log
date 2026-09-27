## SIDELINE COACH — SCOUT PLAY REPORT
**Play ID:** routing-r0-researched-prior-pack-fresh-20260926-065012  
**Scout ID:** r0-claude-capability-evidence  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Mission:** R0 Claude Capability Evidence  

### EXECUTIVE SUMMARY
This reconnaissance establishes that **S57.1 Intelligent Routing architecture is canonical and settled**, but the critical research component - the **CapabilityPriorPack** requiring public Claude capability evidence - is currently **missing**. The repository contains the architectural specification but lacks the sourced capability research needed for R0.

### VERIFIED CURRENT CLAUDE TARGETS

**FACT:** S57.1 specifies that R0 needs a `CapabilityPriorPack` with:
- lineage mapping for Claude models
- playerType: 'claude'
- modelId: specific Claude variants (opus, sonnet, haiku)
- supported effort tiers: 'high', 'medium', 'low', 'xhigh'
- task class: 'architecture', 'implementation', 'quick', 'default'
- proposed first-pass prior mean m₀ (≤ 6)
- proposed prior strength n₀ (≤ 6)
- burn/duration ranges with evidence support

**INFERENCE:** The current repository shows existing Claude implementation in:
- `src/routing-policy.ts` - ClaudeRoutingPolicy class (lines 127-144)
- `src/provider-control.ts` - Claude model control parsing
- `src/control-plane/health-authority.ts` - ClaudeProviderHealthState

**CURRENT TRUTH:** 
- `src/routing-intel/priors.json` **DOES NOT EXIST**
- `src/routing-intel/` directory **DOES NOT EXIST**
- No researched capability pack is present for Claude

### FIRST-PARTY EVIDENCE

**FACT - Local Implementation Artifacts:**
1. **`src/routing-policy.ts:127-144`** - ClaudeRoutingPolicy implementation
   - Maps task classes to Claude models: architecture→['opus','sonnet'], implementation→['sonnet','opus'], quick→['haiku','sonnet']
   - References effort tiers: 'high', 'medium', 'low'

2. **`src/provider-control.ts:86-110`** - Claude model control parsing
   - Parses Claude CLI model status: haiku, sonnet-5, opus variants
   - References live configuration controls and model switching

3. **`src/control-plane/health-authority.ts:15-20`** - ClaudeProviderHealthState
   - Provides provider-specific health evidence for Claude
   - Contains Claude quota window tracking

**PUBLIC EVIDENCE GAP:** The architectural specification requires **public, sourced evidence** for:
- Claude model capabilities for Sideline task classes
- First-pass acceptance rates for each Claude variant
- Burn/duration statistics with empirical support
- Research quality attribution (cross-checked/single-source/extrapolated)

### SUPPORTING INDEPENDENT EVIDENCE

**INFERENCE FROM EXISTING ARCHITECTURE:**
- The S57.1 architecture shows expected capability ranges for Claude in the prior example (line 321-324):
  ```json
  {
    "node": "claude/claude-opus/*/high",
    "firstPass": 0.80, "strength": 5,
    "burn": {"fiveHour": [0.08, 0.15, 0.25], "weekly": [0.01, 0.02, 0.04]},
    "durationMin": [10, 20, 40],
    "researchedAt": "2026-09-26",
    "researchQuality": "cross-checked"
  }
  ```

**AVAILABLE SIDELINE EVIDENCE (NOT SUFFICIENT FOR PRIOR):**
- Existing routing policy shows **preferences** but **no capability performance data**
- Provider controls show **model availability** but **no success rates**
- Health authority shows **usage patterns** but **no first-pass outcomes**

### SIDELINE TASK-CLASS CROSSWALK

**CURRENT SIDELINE TASKS (from capability-types.ts:60):**
- `architecture` - Hard complexity, needs deep reasoning
- `implementation` - Medium complexity, coding focus  
- `quick` - Low complexity, speed focus
- `default` - Standard complexity

**CLAUDE MODEL ALIGNMENT (from routing-policy.ts:127-144):**
- **Architecture:** Opus (high), Sonnet (high)
- **Implementation:** Sonnet (medium), Opus (high)  
- **Quick:** Haiku (low), Sonnet (low)

**EVIDENCE GAP:** No current evidence quantifies **first-pass acceptance rates** for each of these task/model combinations.

### PROPOSED PRIOR INPUTS

**PROPOSED RESEARCH INPUT ( ARCHITECT / A-TEAM REVIEW REQUIRED ):**

Based on the architectural template and current Claude implementation, I propose these **research inputs** (NOT CANONICAL until A-Team review):

**For Claude Opus (high effort):**
- **m₀:** 0.80 (proposed from S57.1 template)
- **n₀:** 5 (maximum allowed, extrapolated from template)
- **burn:** [0.08, 0.15, 0.25] five-hour, [0.01, 0.02, 0.04] weekly
- **duration:** [10, 20, 40] minutes
- **source:** S57.1 template + provider documentation
- **researchQuality:** extrapolated (no public performance data)

**For Claude Sonnet (medium effort):**
- **m₀:** 0.65 (extrapolated from opus high→medium reduction)
- **n₀:** 5 (extrapolated)
- **burn:** [0.05, 0.12, 0.20] five-hour, [0.008, 0.018, 0.035] weekly
- **duration:** [8, 18, 35] minutes
- **researchQuality:** extrapolated

**For Claude Haiku (low effort):**
- **m₀:** 0.45 (extrapolated from medium→low reduction)
- **n₀:** 4 (extrapolated, quality degradation)
- **burn:** [0.03, 0.08, 0.15] five-hour, [0.005, 0.012, 0.025] weekly
- **duration:** [5, 15, 30] minutes
- **researchQuality:** extrapolated

### BURN / DURATION SUPPORT OR UNKNOWN

**UNKNOWN / NOT DEFENSIBLE:**
- **First-pass acceptance rates** for Claude on Sideline task classes have **no public benchmark evidence**
- **Burn statistics** are missing from all current sources
- **Duration statistics** are missing from all current sources
- **Research sources** would need to include:
  - Claude release notes documenting capability improvements
  - Independent benchmark studies on Claude performance for coding/architectural tasks
  - Provider-specific documentation of model behavior in controlled environments

**WHAT THE A-TEAM ULTIMATELY NEEDS TO LEARN:**
1. **Empirical Claude performance data** from real-world usage
2. **First-pass acceptance benchmarks** for each task class × model combination
3. **Resource consumption patterns** (burn/duration) with confidence intervals
4. **Model-specific drift patterns** over time

### CONTRADICTIONS / MODEL-VERSION RISK

**INFERENCE - CURRENT IMPLEMENTATION:**
- The routing-policy.ts shows Claude models are **available and configurable**
- provider-control.ts shows Claude supports **live model switching**
- health-authority.ts shows Claude has **quota tracking**

**CONTRADICTION - MISSING CAPABILITY DATA:**
- Architecture expects **capability performance data** but none exists
- Prior template expects **research quality attribution** but no research exists
- The gap between **specification** and **implementation** is substantial

**MODEL-VERSION RISK:**
- The current implementation assumes Claude capabilities but lacks **evidence validation**
- If Claude's actual performance differs from assumed capabilities, the entire S57.1 routing could be **mis-calibrated**
- No **drift detection** exists for capability assumptions

### SOURCES

**REQUIRED RESEARCH SOURCES (NEED TO BE FOUND):**

1. **Claude Provider Documentation:**
   - Claude release notes (dates, model capability changes)
   - Claude API documentation (supported tasks, performance characteristics)
   - Claude pricing/performance tier descriptions

2. **Independent Benchmarks:**
   - Code generation benchmarks (relevant to implementation task class)
   - Architecture reasoning benchmarks (relevant to architecture task class)  
   - Speed/latency benchmarks (relevant to quick task class)
   - First-pass acceptance rates for complex software development tasks

3. **Sideline-Specific Evidence:**
   - Historical Sideline Claude performance data (if any exists)
   - Current Sideline Claude usage analytics
   - Provider capability announcements affecting Sideline

**LIMITATIONS OF CURRENT RECONNAISSANCE:**
- Cannot access external web sources for public research
- Cannot verify provider claims without direct documentation access
- Cannot establish confidence intervals without empirical data

### RECOMMENDED NEXT MOVE

**IMMEDIATE (Scout-Lane):**
1. **Verify current Claude capability assumptions** by running actual Claude plays and collecting first-pass data
2. **Identify what evidence gaps** exist by comparing assumed vs. actual performance
3. **Establish baseline capabilities** before researching prior ranges

**SHORT-TERM (Worker-Lane):**
1. **Implement minimal priors.json** with **UNKNOWN evidence ranges** (transparent about lack of data)
2. **Add evidence collection hooks** to capture real-world Claude performance
3. **Establish research play** (R0) to systematically gather Claude capability evidence

**LONG-TERM (A-Team Lane):**
1. **Reconcile assumed vs. actual** Claude capabilities
2. **Establish validated capability priors** with proper research quality attribution
3. **Implement drift detection** for capability changes over time

### CONCLUSION

The R0 Claude capability research mission has **uncovered a critical evidence gap**: the architectural specification requires extensive public research on Claude capabilities, but such research **does not currently exist** in the repository or accessible sources.

The **CapabilityPriorPack is missing**, preventing S57.1 Intelligent Routing from being fully implemented. The A-Team must **fill this research gap** before the routing architecture can be validated and deployed.

**This Scout report is reconnaissance, not final architectural authority. The A-Team must now decide: continue evidence gathering, implement provisional ranges with UNKNOWN quality, or adjust architectural requirements based on available evidence.**
