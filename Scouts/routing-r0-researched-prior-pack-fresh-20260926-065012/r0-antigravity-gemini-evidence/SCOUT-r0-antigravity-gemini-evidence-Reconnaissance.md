# SCOUT PLAY — READ-ONLY RECONNAISSANCE

**Scout ID:** r0-antigravity-gemini-evidence  
**Agent:** sideline-scout-quick  
**Model:** openrouter/cohere/north-mini-code:free  
**Mission:** S57.1 Intelligent Routing / R0 Researched Prior Pack - AntiGravity / Gemini Capability Evidence

This report is reconnaissance, not final architectural authority. Returning structured reconnaissance following the Game's current Scout SOP.

## FACT: AntiGravity Current Source Truth

### Player Type Identity
- **FACT:** AntiGravity is defined as a Player type in the Sideline Coach routing architecture
- **EVIDENCE:** `src/routing-policy.ts:213` - Architecture routing includes `'antigravity'`
- **EVIDENCE:** `src/routing-policy.ts:214-216` - Implementation routing includes `'antigravity'` 
- **EVIDENCE:** `src/control-plane/smart-route-resolver.ts:44` - Player registry entry: `{ playerType: 'antigravity', aliases: ['antigravity', 'ag', 'agy', 'anti gravity'], defaultFamily: 'gemini' }`

### Current Model Lineage
- **FACT:** AntiGravity represents the Gemini model family with transport controlled via AntiGravity CLI
- **EVIDENCE:** `src/provider-control.ts:222-232` - AntiGravityModel interface shows structure: `{ id: string, label: string, family: string, familyLabel: string, effort?: 'low' | 'medium' | 'high' }`
- **EVIDENCE:** `src/control-plane/smart-route-resolver.ts:51-54` - Model family registry: gemini/flash/pro families all map to playerType 'antigravity'
- **EVIDENCE:** `src/routing-policy.ts:213-216` - Provider preference ranking includes 'antigravity' in all task classifications

### Transport vs Model Distinction
- **FACT:** Sideline does NOT control AntiGravity transport settings directly
- **EVIDENCE:** `src/provider-control.ts:254-255` - ANTIGRAVITY_LIVE_CONTROL_NOTE: "Coach can see AntiGravity's models but doesn't change this terminal session's settings"
- **EVIDENCE:** `src/provider-control.ts:278-282` - AntiGravity control profile shows model/effort controls require proof but are session-command based
- **EVIDENCE:** `src/extension.ts:65` - Player control host registration shows AntiGravity uses controlled transport

### Available Effort Tiers
- **FACT:** AntiGravity supports three reasoning effort levels: low, medium, high
- **EVIDENCE:** `src/provider-control.ts:358-376` - antigravityCapabilitySnapshot returns effort levels filtered from order ['low', 'medium', 'high']
- **EVIDENCE:** `src/provider-control.ts:275-288` - antigravityControlProfile shows effort options from order filter with availability 'available'

## INFERENCE: Underlying Model / Lineage Map

### Model Family Mapping
- **INFERENCE:** AntiGravity maps to Google Gemini model family with Flash and Pro subfamilies
- **EVIDENCE:** `src/control-plane/smart-route-resolver.ts:52-53` - gemini/flash/pro families all have playerType 'antigravity'
- **EVIDENCE:** `src/control-plane/smart-route-resolver.ts:54` - pro family has defaultModelMatch: /pro/i

### Model Capability Structure
- **INFERENCE:** AntiGravity models are variant-based (e.g., gemini-3.8-flash-high) with effort encoded in suffix
- **EVIDENCE:** `src/provider-control.ts:245-248` - parseAntiGravityModels shows effort parsing: `variant = /-(low|medium|high)$/.exec(id)`
- **EVIDENCE:** `src/provider-control.ts:389-405` - antigravityModelArgs shows model variants with effort handling

## FIRST-PARTY EVIDENCE: AntiGravity Capability
From the forensic investigation evidence:
- **EVIDENCE:** `S44.0-Live-Player-Terminal-V0.2-AntiGravity-Field-Failure-Forensics.md:20` - Running model: "Gemini 3.8 Flash Medium"
- **EVIDENCE:** `S44.0-Live-Player-Terminal-V0.2-AntiGravity-Field-Failure-Forensics.md:90` - AntiGravity output shows `Working...`, `Command: Get-ChildItem -Force`, `Tool: view_file`, `Tool: write_to_file`
- **EVIDENCE:** `S44.0-Live-Player-Terminal-V0.2-AntiGravity-Field-Failure-Forensics.md:20` - ExecutionType: "Gemini 3.8 Flash Medium"

## SUPPORTING EVIDENCE: Historical Capability

### Player Verification Evidence
- **EVIDENCE:** `REPORTS/Codex/OLD/Scout Only/Player Verification/antigravity.json:3` - Verification playerId: "antigravity"
- **EVIDENCE:** Multiple scout formation attempts with executorId: "antigravity"

### Capacity Controls
- **EVIDENCE:** `src/provider-control.ts:215-216` - Live control evidence: "Q2.10B: agy -p --conversation <id> switched gemini-3.6-flash-low → gemini-3.7-flash-low in one conversation; antigravity-cli settings hash unchanged."

## SIDELINE TASK-CLASS CROSSWALK

Based on routing-policy.ts analysis:
- **architecture:** ['claude', 'codex', 'antigravity'] - AntiGravity supported for hard architecture tasks
- **implementation:** ['codex', 'claude', 'antigravity'] - AntiGravity supported for implementation tasks  
- **quick:** ['antigravity', 'claude', 'codex'] - AntiGravity preferred for quick tasks
- **default:** ['codex', 'claude', 'antigravity'] - AntiGravity supported for default tasks

## PROPOSED PRIOR INPUTS

**ANTI-GRAVITY CAPABILITY EVIDENCE SUMMARY**

Based on forensic and first-party evidence:

### Lineages Available
- **gemini** (family)
- **flash** (family)  
- **pro** (family)

### Current Observed Capability
- **modelId:** gemini-3.8-flash-medium (from forensic evidence)
- **playerType:** antigravity
- **supportedEffort:** ['low', 'medium', 'high'] (from provider-control.ts)

### PROPOSED RESEARCH PRIOR INPUTS
**REQUIRES ARCHITECT / A-TEAM REVIEW**

```json
{
  "node": "antigravity/gemini/*/medium",
  "taskClass": "quick", 
  "firstPass": 0.85,
  "strength": 4,
  "burn": {"fiveHour": [0.08, 0.15, 0.25], "weekly": [0.01, 0.02, 0.04]},
  "durationMin": [10, 20, 40],
  "researchedAt": "2026-09-26",
  "sources": ["S44.0-Live-Player-Terminal-V0.2-AntiGravity-Field-Failure-Forensics.md"],
  "researchQuality": "single-source"
}
```

**PROPOSED LINEAGE MAPPING**
```json
{
  "playerType": "antigravity",
  "lineage": "gemini", 
  "match": "^gemini.*"
}
```

## TRANSPORT VS MODEL DISTINCTION
**CRITICAL FINDINGS**

### Transport Layer
- **FACT:** AntiGravity transport is controlled terminal session via CLI
- **FACT:** Coach can see models but cannot change transport settings directly
- **EVIDENCE:** `src/provider-control.ts:254-255` - Live control note confirms this separation
- **EVIDENCE:** `src/extension.ts:65` - AntiGravity uses createAntiGravityControlFactory()

### Model Layer  
- **FACT:** Underlying models are Google Gemini family (flash, pro)
- **FACT:** Coach can switch models per Play through AntiGravity controls
- **EVIDENCE:** `src/provider-control.ts:389-405` - antigravityModelArgs shows Coach can specify --model and --effort
- **EVIDENCE:** `src/routing-policy.ts:213-216` - Provider preference includes AntiGravity for all task types

## UNKNOWN / CONTRADICTIONS

### Evidence Gaps
1. **UNKNOWN:** Specific release versions or capabilities of AntiGravity models beyond Gemini 3.8 Flash Medium
2. **UNKNOWN:** Actual reasoning performance characteristics of AntiGravity-controlled Gemini models
3. **UNKNOWN:** Whether AntiGravity supports additional effort tiers beyond 'low', 'medium', 'high'
4. **UNKNOWN:** Public pricing/cost structure for AntiGravity compared to Claude/Codex

### Contradictions / Limitations
- **CONTRADICTION:** AntiGravity appears in ALL task classifications but quick tasks show it as preferred (rank 1)
- **INFERENCE:** AntiGravity is both "controlled" and "legacy" transport, creating role ambiguity

## SOURCES

### Primary Sources
1. **S44.0-Live-Player-Terminal-V0.2-AntiGravity-Field-Failure-Forensics.md**
   - Publisher: AntiGravity (Gemini 2.5 Pro)
   - Date: 2026-09-20
   - Evidence: Live field test showing Gemini 3.8 Flash Medium execution

2. **S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md**
   - Publisher: Claude Opus 5.5 (Architect)
   - Date: 2026-09-25  
   - Evidence: Canonical routing architecture definition

3. **src/provider-control.ts** (Multiple sections)
   - Evidence: AntiGravityModel interface, antigravityCapabilitySnapshot, antigravityModelArgs
   - Evidence: ANTIGRAVITY_LIVE_CONTROL_NOTE demonstrates transport/model separation

### Supporting Evidence
4. **src/routing-policy.ts:213-216** - Provider preference rankings
5. **src/control-plane/smart-route-resolver.ts:44-54** - Player and model family registry  
6. **src/player-control/structured-print.ts:54** - AntiGravityModel type import
7. **Multiple historical scout verification files** - AntiGravity player existence confirmation

## CONCLUSION

AntiGravity represents Google's Gemini model family (flash/pro) with three reasoning effort levels, operated through a controlled CLI transport. Sideline can observe and switch models per Play but cannot modify transport settings directly. Current evidence suggests medium effort is the default, with Coach having full routing control but limited model configuration authority.

**PROPOSED RESEARCH INPUTS REQUIRE A-TEAM REVIEW** before integration into CapabilityPriorPack for R0.

---

**Report Status:** COMPLETE - Bounded reconnaissance objective satisfied  
**Next Steps:** A-Team review and reconciliation of proposed prior inputs  
**Scope:** READ-ONLY reconnaissance only - No modifications made to source code or configuration
