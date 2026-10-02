# SCOUT PLAY - READ-ONLY RECONNAISSANCE REPORT

## **CURRENT CONSERVE STATE OWNER**

**Primary Owner**: `C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\daemon.ts`  
**Key Element**: `private routingPosture: RoutingPosture = 'balanced';` (line 471)

**FACT**: The CONSERVE actuator is implemented as a human-controlled routing posture in the daemon, completely separate from the ResourcePolicy service.

## **CURRENT CONFIGURATION / THRESHOLDS**

**VALID POSTURES**: Only `'balanced'` and `'conserve'` are accepted (line 2971)  
**REJECTED VALUES**: Any non-string or invalid posture values are ignored (test CONSERVE-1)

**FACT**: CONSERVE is configured through the daemon's routingPosture property, not through resource policy thresholds.

**INFERENCE**: The system appears to be in 'balanced' mode by default (evidenced by test CONSERVE-1 showing default is 'balanced').

## **CURRENT HEALTH DATA SOURCE**

**UNUSED**: ResourcePolicy's `isConserveActive` and `conserveLevel` properties  
**USED**: Routing economics and the recommendation engine's scoring system

**CONTRADICTION**: The mission description suggests CONSERVE should consume AI health state, but the implementation shows it's purely a routing posture that doesn't depend on ResourcePolicy.

**KEY DISCOVERY**: CONSERVE uses the same recommendation engine as balanced routing, but with different weights to influence economic cost sensitivity.

## **ROUTING PIPELINE ENTRY POINT**

**PRIMARY ENTRY**: `src\control-plane\daemon.ts:5006` - `posture: { value: this.routingPosture, source: 'coach-default' }`  
**SECONDARY ENTRY**: `src\routing-intel\recommend.ts:327` - `recommendRoute(input)` function  
**ENTRY SEMANTICS**: The recommendation engine receives the posture and applies it to all routing decisions

**FACT**: The routingPosture flows from daemon status through the recommendation engine, affecting the economic cost scoring weights.

## **PLAYER SELECTION EFFECT**

**EFFECTIVE**: Yes - through economic cost weighting  
**MECHANISM**: Higher `lambdaC` (cost sensitivity) in CONSERVE pushes routing toward cheaper options  
**TEST EVIDENCE**: CONSERVE-3 shows balanced prefers Claude (dearer, stronger) while CONSERVE prefers Codex

**FACT**: CONSERVE changes player selection by making economic cost a more important factor in routing decisions.

## **MODEL SELECTION EFFECT**

**EFFECTIVE**: Yes - through constrained economic scoring  
**MECHANISM**: Lower `lambdaD` (delay sensitivity) makes delay costs less important  
**RESULT**: May allow cheaper models even if slightly more expensive in delay terms

**INFERENCE**: Model selection is affected as a consequence of player selection changes, not directly targeted.

## **REASONING EFFECT**

**EFFECTIVE**: Yes - through economic scoring algorithm  
**MECHANISM**: The `estimatePoolEconomicCost` function (r11) uses windows from RoutingEconomicsSnapshot  
**INFLUENCE**: CONSERVE's weeklyWait=true affects reset horizon calculations

**KEY DISCOVERY**: Reason selection is indirectly affected through the economic cost calculations.

## **EXPLICIT-CONSTRAINT INTERACTION**

**RULE**: Explicit human constraints (MANUAL mode, route constraints) always override CONSERVE  
**TEST EVIDENCE**: CONSERVE-4 confirms MANUAL routes are human-authoritative and CONSERVE recommendations are advisory only  
**SEMANTICS**: CONSERVE respects but never replaces explicit constraints

**FACT**: CONSERVE is advisory - it never changes human-decided routes.

## **MANUAL INTERACTION**

**AUTHORITY**: Dad's direct selection is always authoritative (matches mission description)  
**OVERRIDE**: CONSERVE cannot override MANUAL mode decisions  
**TEST EVIDENCE**: CONSERVE-4 shows manual selections keep their player/model/effort regardless of CONSERVE posture

**FACT**: Manual routing bypasses CONSERVE completely - CONSERVE only affects AUTO mode decisions.

## **CURRENT PRECEDENCE ORDER**

1. **EXPLICIT CONSTRAINTS** (highest) - Route constraints, MANUAL mode
2. **CONSERVE POSTURE** (medium) - Economic cost weighting
3. **RESOURCE POLICY** (separate) - AlarmEngine thresholds (not connected to CONSERVE)
4. **BASELINE AUTO** (fallback) - Existing router decision

**ARCHITECT DECISION REQUIRED**: The ResourcePolicy service appears to be a separate system intended for future integration with CONSERVE, but is not currently used.

## **SCOREBOARD / UI DEPENDENCY CHECK**

**RESULT**: NO - routing does not consume visible Scoreboard/UI DOM  
**TEST EVIDENCE**: CONSERVE-5 confirms no references to resourcePolicy, alarmEngine, or isConserveActive in routing code

**FACT**: The routing system uses economic data from RoutingEconomicsSnapshot, not from a UI Scoreboard.

## **TEST COVERAGE**

**COMPLETE**: Comprehensive test coverage in `test/conserve-control.test.mjs` (lines 1-311)  
**AREAS COVERED**: 
- State management and API interactions (CONSERVE-1)
- Engine integration and posture passing (CONSERVE-2)  
- Economic weighting differences (CONSERVE-3)
- Authority and MANUAL mode interaction (CONSERVE-4)
- Resource policy independence (CONSERVE-5)
- UI structure and wiring (CONSERVE-6-8)

**KEY DISCOVERY**: Test coverage is excellent and validates all major CONSERVE functionality.

## **BREADCRUMB / DOCUMENTATION MAP**

**PRIMARY SOURCES**: 
- `src\control-plane\daemon.ts` - Core implementation
- `src\routing-intel\recommend.ts` - Recommendation engine weights
- `test\conserve-control.test.mjs` - Comprehensive tests
- Project SOP documentation (multiple files)

**DOCUMENTATION GAP**: SOP documentation suggests CONSERVE should consume AI health state, but implementation shows it's purely a routing posture.

## **CURRENT GAPS**

1. **HEALTH STATE CONSUMPTION**: Mission requires CONSERVE to consume AI health, but implementation uses only economic windows
2. **RESOURCE POLICY INTEGRATION**: Separate ResourcePolicy service exists but is not integrated with CONSERVE routing
3. **THRESHOLD SOURCES**: Mission requires 5-hour/weekly thresholds, but these are in AlarmEngine, not used by CONSERVE
4. **SCOREBOARD/UI**: Mission requires checking UI DOM, but routing doesn't access it

**ARCHITECT DECISION REQUIRED**: The current implementation appears to be an incomplete version that may need integration with ResourcePolicy and AI health state.

## **SOURCE MAP**

| Component | File | Responsibility |
|-----------|------|----------------|
| Routing Posture | `src\control-plane\daemon.ts` | Human-controlled actuator |
| Recommendation Engine | `src\routing-intel\recommend.ts` | Applies posture weights |
| Resource Policy | `src\control-plane\resource-policy.ts` | Separate scarcity system |
| Economic Scoring | `src\control-plane\routing-economics.ts` | Uses ResourcePolicy policies |
| UI Integration | `src\public\index.html` | Toggle button, lamp display |

## **VERDICT: MORE EVIDENCE REQUIRED**

The current implementation shows CONSERVE as a routing posture that influences economic cost sensitivity, but does not consume AI health state as described in the mission. The ResourcePolicy service exists but is not integrated with CONSERVE routing.

**KEY MISMATCH**: Mission expects CONSERVE to "consume canonical AI-health/resource state" and "protect scarce premium capacity," but the implementation uses economic windows and is separate from AI health consumption.

**RECOMMENDATION**: Further investigation needed into whether this is an incomplete implementation or a different architectural interpretation of CONSERVE functionality.

---
**SCOUT AGENT**: sideline-scout-quick  
**MODEL**: openrouter/cohere/north-mini-code:free  
**STATUS**: READ-ONLY RECONNAISSANCE COMPLETE  
**EVIDENCE LIMITS**: Primary source code and tests reviewed - architectural integration gaps identified
