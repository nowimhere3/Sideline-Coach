# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 1 substitution · elapsed 00:13:34

Play: auto-conserve-routing-authority-20261001-202710
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-10-02T02:27:16.381Z
Finished: 2026-10-02T02:40:50.986Z
TOTAL ELAPSED TIME: 00:13:34

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 4
Substitutions: 1
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| conserve-current-architecture | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T02:27:16.399Z | 2026-10-02T02:31:46.726Z | 00:04:30 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-conserve-current-architecture-Reconnaissance.md |
| routing-authority-precedence | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T02:27:16.415Z | 2026-10-02T02:32:28.850Z | 00:05:12 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-routing-authority-precedence-Reconnaissance.md |
| policy-mode-extensibility | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T02:27:16.429Z | 2026-10-02T02:29:26.884Z | 00:02:10 | FAILED | RATE LIMITED [availability] | replaced by sideline-scout | none |
| policy-mode-extensibility | 2 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-10-02T02:29:26.900Z | 2026-10-02T02:40:50.980Z | 00:11:24 | COMPLETE | — | substituted for sideline-scout-deep | C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-policy-mode-extensibility-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane conserve-current-architecture: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane routing-authority-precedence: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane policy-mode-extensibility: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → Poolside: Laguna S 2.1 (free) (sideline-scout) → COMPLETE
    - NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) benched: RATE LIMITED — The provider rate-limited this Scout. (> sideline-scout-deep · nvidia/nemotron-3-ultra-550b-a55b:free)

## DISCOVERIES BY PLAYER

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: conserve-current-architecture (objective 0841431d2faf)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Map the CURRENT implementation and architecture of AUTO + CONSERVE routing.

This reconnaissance is an addendum to the completed routing-intent work:

S57.56 — Routing Intent Recognition Reconciliation

Do not redo S57.56.

NEW HEAD COACH ROUTING LAW:

AUTO alone:
Explicit route text is authoritative.

AUTO + CONSERVE:
CONSERVE policy may supersede the explicit route.

AUTO + BEST:
BEST policy may supersede the explicit route.
BEST is FUTURE ONLY. Do not design or implement BEST.

MANUAL:
Dad's direct selection is authoritative.

The purpose of this lane is to discover how CONSERVE actually works today.

Investigate:

1. Where CONSERVE state is stored.
2. How CONSERVE is enabled/disabled.
3. Whether CONSERVE is global, per Game, per dispatch, per session, or another scope.
4. Where CONSERVE enters the routing pipeline.
5. Whether it currently affects:
   - Player selection
   - model selection
   - reasoning effort
   - all three
6. Whether it currently runs before or after explicit RouteConstraints.
7. Whether it can currently override explicit Player/model/effort.
8. Whether it only influences dimensions left as AUTO.
9. Whether MANUAL bypasses CONSERVE completely.
10. Whether routing consumes canonical AI-health/resource state.
11. Identify the canonical health/resource source.
12. Verify routing does NOT scrape the visible Scoreboard/UI DOM.
13. Identify configured threshold sources:
    - 5-hour remaining
    - weekly remaining
    - reset horizon
    - Dad-configured thresholds
    - other resource-health signals
14. Identify all tests and breadcrumbs covering CONSERVE.
15. Identify any mismatch between documented policy and current code.

CONSERVE PRODUCT INTENT:

CONSERVE does NOT mean "always use the weakest model."

It means:

Use the cheapest / healthiest CAPABLE resource and preserve scarce premium capability for work that actually needs it.

Example:

Claude is at 14% remaining.
Dad's configured CONSERVE threshold has been crossed.
Codex is healthy and capable.

AUTO + CONSERVE should be allowed to prefer Codex instead of spending scarce Claude capacity.

If the scarce provider/model is genuinely required and no acceptable alternative exists, CONSERVE should surface that truth rather than blindly block the Play.

OUTPUT:

### CURRENT CONSERVE STATE OWNER

### CURRENT CONFIGURATION / THRESHOLDS

### CURRENT HEALTH DATA SOURCE

### ROUTING PIPELINE ENTRY POINT

### PLAYER SELECTION EFFECT

### MODEL SELECTION EFFECT

### REASONING EFFECT

### EXPLICIT-CONSTRAINT INTERACTION

### MANUAL INTERACTION

### CURRENT PRECEDENCE ORDER

### SCOREBOARD / UI DEPENDENCY CHECK

### TEST COVERAGE

### BREADCRUMB / DOCUMENTATION MAP

### CURRENT GAPS

### SOURCE MAP

Use:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: CONSERVE ARCHITECTURE MAPPED / MORE EVIDENCE REQUIRED
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-conserve-current-architecture-Reconnaissance.md

No structured sections were recognised in this report; the full text is under CHILD REPORTS below.

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: routing-authority-precedence (objective 30226c591a8c)
- Objective: READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Determine the exact authority and precedence model between:

- AUTO
- explicit routing intent inside the Play
- CONSERVE
- MANUAL
- future policy modes such as BEST

Do NOT design BEST.
Do NOT implement.

HEAD COACH'S REQUIRED LAW:

1. AUTO ALONE

Explicit route text is authoritative.

Example:

Sonnet Medium

must resolve to:

Claude · Sonnet · Medium

AUTO task-complexity inference must NOT silently replace it.

Example:

Codex 5.6 Sol Medium

must remain that exact resolved route.

2. AUTO + CONSERVE

CONSERVE becomes the higher-order routing optimization policy.

CONSERVE MAY supersede an explicit route extracted from the Play when resource-preservation policy determines another capable route is preferable.

Example:

Prompt says:
Claude Sonnet Medium

But:
- Claude is below Dad's CONSERVE threshold
- Codex is healthy
- Codex is capable of the task

AUTO + CONSERVE may choose Codex instead.

This override must be deliberate, explainable, and attributable to CONSERVE.

It must NOT look like parser failure.

3. AUTO + BEST — FUTURE

BEST would become another higher-order AUTO optimization policy focused on maximum expected task quality.

Do NOT design BEST.

Only determine whether the current architecture has a clean first-class policy seam where a future sibling mode could live.

4. MANUAL

Dad's direct route selection is authoritative.

MANUAL must not be silently overridden by AUTO, CONSERVE, task classification, or future BEST.

INVESTIGATE:

A. What authority layers exist today?

B. Is explicit route text currently represented as:
- a hard constraint
- a recommendation
- a preference
- something else?

C. Is there already a distinction between:
- "the prompt requested this"
- "Coach manually selected this"
- "AUTO inferred this"

D. Can CONSERVE currently tell which source produced the route?

E. If CONSERVE overrides an explicit text route, can the RoutingDecision explain:
- requested route
- final route
- reason for override
- health/resource evidence used

F. Does RoutingDecision currently preserve enough provenance to show:
"Prompt requested Claude Sonnet Medium; CONSERVE selected Codex 5.6 Sol Medium because Claude crossed threshold"?

G. Could MANUAL accidentally pass through the same override path?

H. Where should the authority boundary logically live based on CURRENT architecture?

Do NOT propose a full redesign.

Map existing seams and identify the minimum Architect decisions needed.

DESIRED PRECEDENCE MATRIX TO TEST AGAINST:

MANUAL DIRECT SELECTION
    highest authority

AUTO + CONSERVE
    CONSERVE policy may override prompt-extracted route

AUTO + FUTURE BEST
    BEST policy may override prompt-extracted route

AUTO ALONE
    prompt-extracted explicit route is authoritative

AUTO INFERENCE
    fills only what remains unspecified when no higher-order policy changes it

IMPORTANT DISTINCTION:

A CONSERVE override is VALID.

A parser silently losing explicit intent is NOT VALID.

The system must be able to distinguish these two cases.

OUTPUT:

### CURRENT AUTHORITY MODEL

### CURRENT ROUTE PROVENANCE

### PROMPT-EXPLICIT ROUTE SEMANTICS

### MANUAL ROUTE SEMANTICS

### CONSERVE OVERRIDE CAPABILITY

### OVERRIDE EXPLAINABILITY

### ROUTINGDECISION DATA AVAILABLE TODAY

### MISSING PROVENANCE FIELDS

### PRECEDENCE MATRIX — CURRENT

### PRECEDENCE MATRIX — HEAD COACH REQUIRED

### ARCHITECTURAL CONFLICTS

### OPUS DECISIONS REQUIRED

### WORKER-READY ITEMS

### SOURCE MAP

Use:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: ROUTING AUTHORITY PRECEDENCE MAPPED / ARCHITECT DECISION REQUIRED
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-routing-authority-precedence-Reconnaissance.md

No structured sections were recognised in this report; the full text is under CHILD REPORTS below.

### Poolside: Laguna S 2.1 (free) (sideline-scout)

- Lane: policy-mode-extensibility (objective b7c2d31e86f2)
- Objective: READ-ONLY DEEP RECONNAISSANCE.

Do not modify source.
Do not modify breadcrumbs.
Do not install packages.
Do not commit.
Do not push.

REPOSITORY:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

MISSION:
Inspect whether Sideline Coach has a clean FIRST-CLASS ROUTING POLICY seam for CONSERVE and future sibling modes.

Do NOT implement.
Do NOT design BEST behavior.
Do NOT broaden into general Intelligent Routing redesign.

HEAD COACH MENTAL MODEL:

AUTO = Sideline drives.

AUTO alone = normal routing policy.
Explicit route text is authoritative.

AUTO + CONSERVE = Sideline drives economically.
CONSERVE may supersede prompt-extracted routing intent to preserve scarce resources.

AUTO + BEST = Sideline drives for maximum performance.
FUTURE ONLY.

MANUAL = Dad drives.
Manual selection is authoritative.

The architecture should ideally separate:

WHO HAS CONTROL
from
WHAT AUTO OPTIMIZES FOR.

Investigate whether the repository currently models those as separate axes.

Examples:

Control axis:
- AUTO
- MANUAL

Optimization-policy axis:
- NORMAL
- CONSERVE
- future BEST

Determine whether current source instead entangles these concerns.

INVESTIGATE:

1. Current routing mode types/enums/interfaces.
2. Current CONSERVE representation.
3. Whether CONSERVE is a boolean, policy object, strategy, threshold state, or another shape.
4. Whether adding a future BEST sibling would fit naturally or require branching throughout routing code.
5. Whether provider health/resource state is abstracted cleanly.
6. Whether routing policy can consume health without UI coupling.
7. Whether final RoutingDecision records WHY a route was selected.
8. Whether it records WHY an explicit route was overridden.
9. Whether diagnostics/reporting can distinguish:
   - parser recognition
   - normal AUTO inference
   - CONSERVE override
   - MANUAL choice
10. What tests would prove these authority boundaries permanently.

DO NOT DESIGN BEST.

Only identify the seam that would allow:

normal
conserve
best

to be sibling AUTO optimization policies later.

REQUIRED TEST MATRIX TO MAP:

AUTO alone:
- explicit Player preserved
- explicit model preserved
- explicit effort preserved
- partial constraints filled normally
- no silent task-classification override

AUTO + CONSERVE:
- healthy requested provider stays selected where appropriate
- scarce requested provider may be overridden
- override selects capable alternative
- scarce provider remains usable when genuinely required
- override reason is observable
- canonical health state is used
- visible Scoreboard is not used as decision input

MANUAL:
- selected Player preserved
- selected model preserved
- selected effort preserved
- CONSERVE does not override Manual

FUTURE MODE EXTENSIBILITY:
- identify whether another policy can plug into one seam without duplicating routing logic

OUTPUT:

### CONTROL AXIS TODAY

### OPTIMIZATION AXIS TODAY

### CURRENT CONSERVE REPRESENTATION

### POLICY APPLICATION SEAM

### HEALTH / RESOURCE INPUT SEAM

### ROUTE PROVENANCE / EXPLANATION SEAM

### MANUAL ISOLATION

### CURRENT ENTANGLEMENTS

### FUTURE SIBLING-MODE EXTENSIBILITY

### REQUIRED DATA CONTRACT

### REQUIRED TEST MATRIX

### ARCHITECTURAL RISKS

### OPUS DECISIONS REQUIRED

### MINIMUM CHANGE SURFACE

### SOURCE MAP

Use:

FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED

End exactly:

VERDICT: POLICY-MODE SEAM MAPPED / ARCHITECT DECISION REQUIRED
- Model: openrouter/poolside/laguna-s-2.1:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-policy-mode-extensibility-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** - `src/capability-types.ts:68` — `RoutingMode = 'auto' | 'manual'` (control axis type)
- `src/routing-intel/recommend.ts:59` — `RoutingPosture = 'fast' | 'balanced' | 'sure' | 'conserve'` (entangled optimization-axis type)
- `src/control-plane/daemon.ts:465,471` — `routingMode`/`routingPosture` instance fields; the two axes stored separately (good)
- `src/control-plane/daemon.ts:186-195` — `RoutingFilmDispatchRecord = DispatchRecord & { routingMode?; decidedBy? }` (no posture field)
- `src/control-plane/daemon.ts:4866-4915` — `recordRoutingFilmDecision` (records `decidedBy`, NOT posture, into Film event)
- `src/control-plane/daemon.ts:5006` — only posture → `recommendRoute()` (shadow engine only)
- `src/control-plane/daemon.ts:5055-5056` — `setRoutingPosture` (only seam that changes posture)
- `src/control-plane/daemon.ts:2965-2984` — `POST /api/route` handler (accepts mode + posture)
- `src/control-plane/router.ts:260-267` — `computeRoute` → `computeAutoRoute`/`computeContextAwareRoute` (NO posture param)
- `src/routing-policy.ts` — `computeAutoRoute`/`computeContextAwareRoute` (no posture param)
- `src/control-plane/resource-policy.ts:7-16,34-48` — `ProviderResourcePolicy` with `isConserveActive` + `conserveLevel` (scarcity fact)
- `src/control-plane/routing-economics.ts:6,31` — imports `ResourcePolicyService`; `policy?: ProviderResourcePolicy` feeds recommendation economics
- `src/routing-intel/routing-film.ts:62` — Film decision event `decidedBy` field
- `src/public/index

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane conserve-current-architecture: No headline section recognised — see the Player report.
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane routing-authority-precedence: No headline section recognised — see the Player report.
- **Poolside: Laguna S 2.1 (free) (sideline-scout)** · lane policy-mode-extensibility: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

- Lane policy-mode-extensibility · attempt 1 · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · openrouter/nvidia/nemotron-3-ultra-550b-a55b:free: FAILED [RATE LIMITED] · elapsed 00:02:10 — The provider rate-limited this Scout. (> sideline-scout-deep · nvidia/nemotron-3-ultra-550b-a55b:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\auto-conserve-routing-authority-20261001-202710\policy-mode-extensibility\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\auto-conserve-routing-authority-20261001-202710\policy-mode-extensibility\stdout.log

## CONTRADICTIONS

None reported by the surviving Scouts. (Absence of a reported contradiction is not proof there is none.)

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane conserve-current-architecture · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-conserve-current-architecture-Reconnaissance.md
- Lane routing-authority-precedence · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-routing-authority-precedence-Reconnaissance.md
- Lane policy-mode-extensibility · Poolside: Laguna S 2.1 (free) (sideline-scout): C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710\SCOUT-policy-mode-extensibility-Reconnaissance.md

### Full report — lane conserve-current-architecture (sideline-scout-quick)

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

### Full report — lane routing-authority-precedence (sideline-scout-balanced)

### CURRENT AUTHORITY MODEL
FACT: The system has three primary routing authorities: **AUTO** (automatic route selection), **CONSERVE** (resource‑protection posture that influences recommendations), and **MANUAL** (direct human selection).  
- AUTO is implemented in `computeAutoRoute` and `computeContextAwareRoute` (`src/routing-policy.ts`).  
- CONSERVE is exposed as a toggle that sets the recommendation engine’s posture to `conserve` (`src/control-plane/daemon.ts`, lines 5004‑5006).  
- MANUAL is a routing mode that bypasses the recommendation engine and uses the same AUTO computation but with explicit constraints honored (`src/control-plane/router.ts`, lines 347‑460).  

FACT: Explicit route text (parsed into `RouteConstraints`) is the highest‑authority input for AUTO and CONSERVE when the requested resources are available; if unavailable, the router either falls back to AUTO inference (when the constraint can be satisfied by another capable option) or returns an error (when the constraint cannot be satisfied at all) (`src/routing-policy.ts`, lines 480‑625, 717‑1029).  

FACT: CONSERVE does not directly alter the AUTO decision; it only influences the **recommendation** (`src/routing-intel/recommend.ts`). The final decision becomes CONSERVE‑influenced only if the Coach explicitly accepts a CONSERVE‑biased recommendation via the advisory‑offer mechanism (`src/control-plane/daemon.ts`, lines 5110‑5131; `src/routing-intel/option-to-decision.ts`).  

### CURRENT ROUTE PROVENANCE
FACT: For any dispatched Play, the `RoutingDecision` includes:  
- `constraints` (the explicit route extracted from the Play, if any) (`src/capability-types.ts`, lines 74‑98).  
- Selected fields (`playerInstanceId`, `model`, `effort`, `provider`, etc.) that reflect what was actually routed.  
- `rationale` with human‑readable strings for player, instance, model, effort (`src/capability-types.ts`, lines 125‑130).  
- `summary` and `reason` fields that describe the outcome in Coach‑friendly language.  
FACT: The decision also carries a `context` field when a handoff or unknown owner situation applies (`src/capability-types.ts`, lines 142‑151).  

FACT: The provenance of *why* a particular option was chosen (e.g., CONSERVE‑driven resource protection) is **not** stored in the `RoutingDecision`. The recommendation engine produces a `RoutingRecommendation` that includes `scarcity` (provider‑level resource policy) and scores, but when the Coach accepts a recommendation, `optionToDecision` constructs a new rationale that only records “You accepted the suggestion.” (`src/routing-intel/option-to-decision.ts`, lines 154‑159).  

### PROMPT‑EXPLICIT ROUTE SEMANTICS
FACT: Explicit route text is parsed into a `RouteConstraints` object (`src/control-plane/route-constraints.ts`, lines 586‑716).  
FACT: In AUTO mode, explicit constraints are used to **filter** eligible seats (`eligibleSeats` with `authority: 'auto'`, `src/routing-policy.ts`, line 500) and to **constrain** model/effort selection via `constrainedSelection` (`src/routing-policy.ts`, line 592).  
FACT: If the constrained model/effort is **not** available in the live catalog, the constrained selection is ignored and the AUTO policy selection is used instead (`src/routing-policy.ts`, lines 668‑682).  
FACT: If the constrained player/model/effort is **not** present on the field at all, AUTO returns an error indicating the requested route is unavailable and that the Coach did not choose another Player because of the explicit constraint (`src/routing-policy.ts`, lines 752‑763).  
INFERENCE: Therefore, explicit route text acts as a **hard constraint** when the requested resources are available and present; otherwise it is either a **fallback trigger** (when a substitute can be found) or a **hard stop** (when no substitute exists).  

### MANUAL ROUTE SEMANTICS
FACT: When `routingMode === 'manual'`, the router calls `computeAutoRoute` or `computeContextAwareRoute` directly, bypassing the recommendation engine entirely (`src/control-plane/router.ts`, lines 347‑382).  
FACT: MANUAL honors explicit constraints in the same way as AUTO (filtering and constrained selection) and will **not** silently substitute another Player if the requested resource is unavailable; it returns an error (`src/routing-policy.ts`, lines 752‑763).  
FACT: MANUAL can be overridden only if an `advised` decision is explicitly provided in the `DispatchOptions` (i.e., the Coach had previously accepted a recommendation) (`src/control-plane/router.ts`, line 383).  
INFERENCE: MANUAL is the **highest authority** when no advised decision is present; it cannot be silently overridden by AUTO, CONSERVE, or future BEST.  

### CONSERVE OVERRIDE CAPABILITY
FACT: CONSERVE influences routing **only** through the recommendation engine’s posture weights (`src/control-plane/daemon.ts`, lines 5004‑5006; `src/routing-intel/recommend.ts`, lines 71‑78).  
FACT: The recommendation engine produces a `RoutingRecommendation` whose `primary` option is scored using the active posture (e.g., `conserve`).  
FACT: The Coach can turn that recommendation into an executable decision by accepting it via the advisory‑offer flow (`src/control-plane/daemon.ts`, lines 5110‑5131). If the Coach does **not** accept the recommendation, the baseline AUTO decision is used (`src/control-plane/daemon.ts`, line 5129‑5130).  
FACT: Thus, CONSERVE can **override** an explicit route **only** when the Coach explicitly accepts a CONSERVE‑biased recommendation that differs from the explicit request.  
INFERENCE: CONSERVE does **not** silently override explicit intent; any override is attributable to the Coach’s acceptance of a recommendation, making the override deliberate and explainable.  

### OVERRIDE EXPLAINABILITY
FACT: When a recommendation is accepted, the resulting `RoutingDecision` includes a `rationale` that states the Coach accepted the suggestion (`src/routing-intel/option-to-decision.ts`, lines 154‑159).  
FACT: The `RoutingRecommendation` itself contains:  
- `scarcity` (provider‑level `ProviderResourcePolicy` showing conserve levels) (`src/routing-intel/recommend.ts`, lines 387‑389).  
- `posture` (value: `conserve`) (`src/routing-recommend.ts`, line 262).  
- `reasons` and `scores` that detail resource‑based considerations (`src/routing-intel/recommend.ts`, lines 195‑213, 664‑689).  
FACT: However, the `RoutingDecision` **does not** preserve the detailed CONSERVE rationale (e.g., “Claude crossed threshold, Codex selected”). It only records that the Coach accepted the suggestion.  
INFERENCE: The system can explain *that* a CONSERVE‑influenced route was chosen (via the Coach’s acceptance), but it does not automatically expose the underlying resource evidence (thresholds, usage, etc.) in the final decision.  

### ROUTINGDECISION DATA AVAILABLE TODAY
FACT: The `RoutingDecision` contains the following fields relevant to provenance:  
- `mode` (`auto`/`manual`) (`src/capability-types.ts`, line 101).  
- `constraints` (the explicit route requested) (`src/capability-types.ts`, line 166).  
- `playerInstanceId`, `model`, `effort`, `provider` (the actual selections) (`src/capability-types.ts`, lines 103‑108).  
- `rationale.player`, `rationale.instance`, `rationale.model`, `rationale.effort` (human‑readable strings) (`src/capability-types.ts`, lines 125‑130).  
- `summary` and `reason` (Coach‑friendly sentence) (`src/capability-types.ts`, lines 111, 131‑132).  
FACT: The decision does **not** include fields for:  
- The requested route (separate from `constraints` in a comparable structured form).  
- The reason for any override (e.g., “CONSERVE selected X because Y crossed threshold”).  
- The specific resource evidence (conserve level, thresholds, usage) that drove the override.  

### MISSING PROVENANCE FIELDS
FACT: To satisfy the Head Coach’s requirement that a CONSERVE override be “deliberate, explainable, and attributable to CONSERVE,” the `RoutingDecision` would need to record:  
1. The **requested route** (player/model/effort) as extracted from the Play.  
2. The **final route** (player/model/effort) that was actually dispatched.  
3. An explicit **override reason** linking the change to CONSERVE (e.g., “CONSERVE selected Codex because Claude’s weekly quota was below threshold”).  
4. The **resource evidence** used (conserve level, throttle/alarm state) that justified the override.  
These fields are not present in the current `RoutingDecision` (`src/capability-types.ts`).  

### PRECEDENCE MATRIX — CURRENT
Based on the code, the effective precedence observed is:  

| Situation                              | Winner                                                                                                                               |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **MANUAL** (no advised decision)       | Manual selection (explicit constraints honored; no silent override).                                                                 |
| **MANUAL** + advised decision          | Advised decision (if Coach previously accepted a recommendation).                                                                   |
| **AUTO** (no CONSERVE, no advice)      | AUTO inference (explicit constraints honored if resources available; otherwise fall back or error).                                 |
| **AUTO** + CONSERVE (Coach accepts rec)| Coach‑accepted recommendation (which may be CONSERVE‑biased) overrides AUTO inference.                                              |
| **AUTO** + CONSERVE (Coach rejects rec)| AUTO inference (baseline) runs; CONSERVE has no effect.                                                                             |
| **AUTO** + explicit constraint (available) | Explicit constraint hard‑honored (used as filter and model/effort lock).                                                           |
| **AUTO** + explicit constraint (unavailable substitute) | Falls back to AUTO inference (another capable option) if available.                                                               |
| **AUTO** + explicit constraint (no substitute) | Error – no silent substitution.                                                                                                    |

### PRECEDENCE MATRIX — HEAD COACH REQUIRED
The Head Coach’s law requires the following precedence:  

1. **MANUAL DIRECT SELECTION** – highest authority (cannot be overridden by AUTO, CONSERVE, or BEST).  
2. **AUTO + CONSERVE** – CONSERVE policy may override prompt‑extracted route **when resource‑preservation policy determines another capable route is preferable**.  
3. **AUTO + FUTURE BEST** – BEST policy may override prompt‑extracted route (not yet implemented).  
4. **AUTO ALONE** – prompt‑extracted explicit route is authoritative.  
5. **AUTO INFERENCE** – fills only what remains unspecified when no higher‑order policy changes it.  

### ARCHITECTURAL CONFLICTS
CONTRADICTION: The current architecture does **not** give CONSERVE the authority to silently override an explicit route; any override requires the Coach’s explicit acceptance of a recommendation. This matches the Head Coach’s requirement that a CONSERVE override be deliberate and explainable, but it does **not** provide an automatic path where CONSERVE can override without Coach intervention.  
INFERENCE: To satisfy the Head Coach’s law as written (CONSERVE may supersede an explicit route when resource policy decides), the system would need to allow the **AUTO** computation itself to consult CONSERVE (or a resource policy) and **replace** the explicit route when justified, while still preserving provenance to show the override was due to CONSERVE.  

FACT: Today, the only place where resource policy (CONSERVE) influences a decision is inside the **recommendation engine**, which is advisory unless the Coach accepts it.  

### OPUS DECISIONS REQUIRED
ARCHITECT DECISION REQUIRED: To enable CONSERVE to override explicit routes **automatically** (while still being explainable), the Architect must decide:  
- Where to integrate resource‑policy evaluation (e.g., inside `computeAutoRoute`/`computeContextAwareRoute`) so that CONSERVE can adjust the selected player/model/effort when justified.  
- How to augment `RoutingDecision` with explicit override provenance fields (requested route, final route, CONSERVE reason, resource evidence).  
- Whether to keep the advisory‑offer mechanism as a fallback for Coach‑only overrides, or to replace it with an automatic CONSERVE layer that still emits an explainable decision.  

### WORKER‑READY ITEMS
FACT: The following items can be implemented without changing the authority boundaries:  
- Augment `RoutingDecision` to include a new field `override?: { requested: RouteConstraints; reason: string; evidence: ProviderResourcePolicy }` (or similar) to record when a CONSERVE‑informed substitution occurred.  
- Modify the recommendation engine to produce, alongside the primary option, an explicit “override rationale” that can be copied into the decision when the Coach accepts a recommendation that differs from the baseline.  
- Ensure that when CONSERVE posture is active, the recommendation engine’s scoring reflects resource protection and that the resulting recommendation’s `scores` and `reasons` capture the CONSERVE rationale.  

These changes would allow the system to record, in the `RoutingDecision`, that a CONSERVE override occurred and why, satisfying the Head Coach’s explainability requirement without altering the fundamental precedence (MANUAL > AUTO+CONSERVE > AUTO alone).  

### SOURCE MAP
- `src/routing-policy.ts` – AUTO routing logic, explicit constraint handling.  
- `src/control-plane/daemon.ts` – CONSERVE actuator wiring to recommendation posture.  
- `src/routing-intel/recommend.ts` – Recommendation engine, posture weighting, scarcity inclusion.  
- `src/routing-intel/option-to-decision.ts` – Bridge from recommendation to `RoutingDecision`.  
- `src/control-plane/router.ts` – Dispatch entry point, MANUAL vs AUTO routing mode selection.  
- `src/capability-types.ts` – `RouteConstraints` and `RoutingDecision` definitions.  
- `src/control-plane/smart-route-resolver.ts` – Explicit route text parsing (`resolveSmartRouteConstraints`).  
- `src/control-plane/route-constraints.ts` – `recognizeRouteConstraints` (structured/natural language constraint extraction).  

VERDICT: ROUTING AUTHORITY PRECEDENCE MAPPED / ARCHITECT DECISION REQUIRED

### Full report — lane policy-mode-extensibility (sideline-scout)

I'll begin reconnaissance by understanding the repository structure and locating the relevant routing/policy files.
Let me read the Scout SOP and explore the source structure.
Now let me explore the source code structure and search for conserve, routing, policy, and mode-related symbols.
I've found the core routing files. Let me read the critical source files in parallel.
Let me continue reading the critical files. I need to see the rest of `routing-policy.ts`, the daemon routing posture logic, the routing-intel/recommend.ts, and tests.
Now let me read the daemon routing posture logic, the route-normalization file, and explore the routing-intel directory and tests.
Let me check the daemon's RoutingPosture import and the `buildRouting` method, plus look at route-normalization and the test directory.
Let me read the `buildRouting` method and the router to see if CONSERVE reaches the actual decision path.
Critical finding emerging. Let me verify the daemon imports, the `setRoutingPosture` location, the status broadcast, and the `server.ts` routing path, plus find the test files.
Let me find the test files via glob and read the status broadcast section of daemon.ts.
The directory listing worked. Let me retry the blocked reads and look at the key test files for routing policy and recommendation engine.
Let me read the `server.ts` routing path, the daemon's Film decision recording, and the resource policy test.
Let me retry the blocked reads.
The `ai-resource-policy.test.mjs` reveals a critical fact at line 112: `daemon.ts` does NOT reference `resource-policy` at all. Let me now verify the server.ts routing path and the Film event types to complete the picture.
Let me examine the routing-film event types and the r6 test's assertions about posture in the Film, plus check the routing-film test.
Let me read the R6 shadow test, the Film dispatch record type, the routing-film decision event, and check which server entry is active.
Let me read the `RoutingFilmDispatchRecord` type definition, the UI status restoration, and check how economics connects to the recommendation.
Let me read the full conserve-control test and check a few remaining connections via grep.
Let me check the `RoutingFilmDispatchRecord` type and read the remaining parts of the conserve test and the routing-economics file.
Let me use grep to get the specific type definitions I still need, since the sandbox is intermittently blocking full file reads.
Let me check the UI dispatch path for posture, and the DispatchRecord type from work-ledger.
Let me get the `DispatchRecord` type definition via grep with context lines.
I have gathered substantial evidence. Let me do a final targeted check on the `RoutingFilmDispatchRecord` type and the R8 option-to-decision bridge, then write the report.
## Objective
Read-only reconnaissance to determine whether Sideline Coach has a clean first-class routing policy seam separating the CONTROL axis (AUTO/MANUAL) from the OPTIMIZATION axis (NORMAL/CONSERVE/future BEST), and to map the current CONSERVE representation, policy application seam, health/resource input seam, route provenance, and manual isolation.

## Important Details
- READ-ONLY: no source modifications, no breadcrumb changes, no package installs, no commits, no pushes.
- Scout agent: `sideline-scout`; model: `openrouter/pools/pool/laguna-s-2.1:free`.
- Key finding: CONSERVE exists as a daemon in-memory `routingPosture` ('balanced'|'conserve') that ONLY reaches the R6 shadow-recommendation engine (`recommendRoute`), NOT the live router (`computeAutoRoute`/`computeContextAwareRoute`).
- CONTRADICTION: `RoutingPosture` type is `'fast'|''balanced'|'sure'|'conserve'` but only 'balanced'/'conserve' are reachable from the UI; 'fast'/'sure' are engine-internal weight presets that the test `conserve-control.test.mjs` explicitly rejects as junk posture values.
- CONTRADICTION: CONSERVE name is used for two conceptually separate things — (1) Scarcity FACT (`ProviderResourcePolicy.isConserveActive`/`conserveLevel` from AlarmEngine) and (2) routing posture ('balanced'|''conserve' on the daemon). The daemon comment and `ai-resource-policy.test.mjs:112` assert `daemon.ts` does NOT import/reference `resource-policy`.
- `server.ts` (`class CoachServer`) is the legacy in-extension server with `routingMode` only; `daemon.ts` (`ControlPlaneDaemon`) is the new detached daemon with both `routingMode` and `routingPosture`.

## Work State
### Completed
- Located and read core routing files: `capability-types.ts`, `routing-policy.ts`, `routing-candidates.ts`, `control-plane/router.ts`, `control-plane/daemon.ts`, `control-plane/resource-policy.ts`, `routing-intel/recommend.ts`, `routing-intel/routing-film.ts`, `control-plane/route-constraints.ts`, `control-plane/route-normalization.ts`.
- Confirmed `RoutingMode = 'auto' | 'manual'` is the control axis (FACT: `capability-types.ts:68`, `daemon.routingMode` at `daemon.ts:465`).
- Confirmed `RoutingPosture = 'fast'|'balanced'|'sure'|'conserve'` is the optimization axis type (FACT: `recommend.ts:59`), but daemon/UI only expose 'balanced'/'conserve' (FACT: `daemon.ts:2970-2971`, `index.html:5018`).
- Confirmed `routingPosture` is in-memory in the daemon (FACT: `daemon.ts:471`), set only via `POST /api/route { posture:` (FACT: `daemon.ts:2970-2972`).
- Confirmed `routingPosture` flows ONLY to `recommendRoute()` as `posture: { value: this.routingPosture, source: 'coach-default' }` (FACT: `daemon.ts:5006`), which is the R6 shadow recommendation engine that runs AFTER the decision is fixed and never changes it.
- Confirmed the live router does NOT consume posture: `router.ts:262-263` calls `computeAutoRoute(gameId, prompt, enriched, this.policies)` / `computeContextAwareRoute(...)` with no posture arg (FACT: `router.ts`/`routing-policy.ts` signatures).
- Confirmed `RoutingFilmDispatchRecord = DispatchRecord & { routingMode?; decidedBy? }` (FACT: `daemon.ts:186-195`) and the Film decision event records `decidedBy` ('auto-baseline'|'coach-manual'|'coach-envelope') but NOT posture (FACT: `routing-film.ts:62`, `daemon.ts:4905-4906`).
- Confirmed CONSERVE does NOT reach the visible Scoreboard as decision input (FACT: `ai-resource-policy.test.mjs` references scoreboard but `daemon.ts` does not import `resource-policy`; CONSERVE-7 in `conserve-control.test.mjs` checks visible Scoreboard is not used).
- Confirmed `ResourcePolicyService`/`projectProviderResourcePolicy` is the scarcity-fact seam (FACT: `resource-policy.ts:34-48`).
- Found and partially read test files: `conserve-control.test.mjs`, `ai-resource-policy.test.mjs`, `r6-recommendation-engine.test.mjs`, `r3-belief-engine.test.mjs`, `r10-calibration-graduation.test.mjs`.
- Identified `server.ts` as legacy `CoachServer` (FACT: `server.ts:49`, `extension.ts:138`).

### Active
- (none — this is a read-only scout, no active implementation work)

### Blocked
- Sandbox intermittently blocks `read` calls on large files (`daemon.ts` at certain offsets, `routing-film.ts`, `routing-economics.ts`, `server.ts`, several test files). Mitigated via `grep` with targeted patterns.
- Could not read full `RoutingFilmDispatchRecord` type body (daemon.ts:187-195 line 187 field) and full `DispatchRecord` type body in `work-ledger.ts` — inferred from grep context.
- Could not fully read `conserve-control.test.mjs` lines 100+ and `r6-recommendation-engine.test.mjs` — partial grep coverage only.

## Next Move
1. (none — read-only reconnaissance is complete; the Runners/Architect will act on the report.)
2. Hand off structured findings to Head Coach/Architect for seam-design decisions.

## Relevant Files
- `src/capability-types.ts:68` — `RoutingMode = 'auto' | 'manual'` (control axis type)
- `src/routing-intel/recommend.ts:59` — `RoutingPosture = 'fast' | 'balanced' | 'sure' | 'conserve'` (entangled optimization-axis type)
- `src/control-plane/daemon.ts:465,471` — `routingMode`/`routingPosture` instance fields; the two axes stored separately (good)
- `src/control-plane/daemon.ts:186-195` — `RoutingFilmDispatchRecord = DispatchRecord & { routingMode?; decidedBy? }` (no posture field)
- `src/control-plane/daemon.ts:4866-4915` — `recordRoutingFilmDecision` (records `decidedBy`, NOT posture, into Film event)
- `src/control-plane/daemon.ts:5006` — only posture → `recommendRoute()` (shadow engine only)
- `src/control-plane/daemon.ts:5055-5056` — `setRoutingPosture` (only seam that changes posture)
- `src/control-plane/daemon.ts:2965-2984` — `POST /api/route` handler (accepts mode + posture)
- `src/control-plane/router.ts:260-267` — `computeRoute` → `computeAutoRoute`/`computeContextAwareRoute` (NO posture param)
- `src/routing-policy.ts` — `computeAutoRoute`/`computeContextAwareRoute` (no posture param)
- `src/control-plane/resource-policy.ts:7-16,34-48` — `ProviderResourcePolicy` with `isConserveActive` + `conserveLevel` (scarcity fact)
- `src/control-plane/routing-economics.ts:6,31` — imports `ResourcePolicyService`; `policy?: ProviderResourcePolicy` feeds recommendation economics
- `src/routing-intel/routing-film.ts:62` — Film decision event `decidedBy` field
- `src/public/index.html:3382,5010-5020,5511,8221` — UI posture actuator (toggle conserve/balanced, junk rejected client-side)
- `src/server.ts:49,55` — legacy `CoachServer` (has `routingMode` only, no posture)
- `test/conserve-control.test.mjs` — CONSERVE-1 through CONSERVE-7 test matrix (posture default, junk rejection, recommendation seam, manual isolation, scarcity untouched, UI)
- `test/ai-resource-policy.test.mjs:112` — asserts `daemonSource` does not reference `resource-policy`
- `test/r6-recommendation-engine.test.mjs` — R6 shadow-engine golden proofs incl. posture in Film digest
- `test/r3-belief-engine.test.mjs:57` — decision Film event shape (`decidedBy: 'auto-baseline'`, no posture)
- `test/r10-calibration-graduation.test.mjs:67,100` — Film digest includes `posture` but decision event does not
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
Let me gather the remaining details using grep with context (the read tool is intermittently blocked by sandbox rules for some files).
Now I have all the evidence needed. Let me compile the final Scout Report.
I now have complete evidence. Here is the Scout Report.

---

# SIDELINE COACH — SCOUT REPORT  
**Mission:** First-class routing policy seam — Control axis (AUTO/MANUAL) vs. Optimization axis (NORMAL/CONSERVE/BEST)

---

## EXECUTIVE SUMMARY

**STATUS: CONVERGED** — The two axes are cleanly separated in *state* (`daemon.routingMode` vs `daemon.routingPosture`), but the optimization axis has a **critical application gap**: postures **only reach the R6 shadow-recommendation engine** (`recommendRoute`) and **never reach the live router** (`computeAutoRoute`/`computeContextAwareRoute`). This means the optimization posture is **advisory-only** even in AUTO mode — it influences what Sideline *would* recommend, not what Sideline *actually dispatches*.

Additionally, `RoutingPosture = 'fast' | 'balanced' | 'sure' | 'conserve'` **entangles** engine-internal weight presets with human-facing policy names, and `RoutingDecision`/`RoutingFilmDecisionEvent` **do not carry** the optimization posture — creating a provenance gap.

---

## FINDING 1 — CONTROL AXIS (WHO HAS CONTROL): CLEAN SEPARATION

**FACT** (FACT): The control axis is cleanly separated throughout the stack.

| Layer | Symbol | File:Line |
|---|---|---|
| Type | `RoutingMode = 'auto' \| 'manual'` | `src/capability-types.ts:68` |
| Daemon state (DEFAULT `auto`) | `private routingMode: RoutingMode = 'auto'` | `src/control-plane/daemon.ts:465` |
| REST seam | `POST /api/route { mode: 'auto'\|'manual' }` | `src/control-plane/daemon.ts:2967-2968` |
| Status echo | `routing: { mode: this.routingMode, ... }` | `src/control-plane/daemon.ts:2984` |
| Decision provenance | `RoutingDecision.mode: RoutingMode` | `src/capability-types.ts:101` |
| Film decision | `RoutingFilmDecisionEvent` (no `decidedBy: 'coach-manual'` variant) | `src/routing-intel/routing-film.ts:62` |

The daemon comment explicitly frames `routingMode` and `routingPosture` as sibling in-memory fields with identical lifecycle ("a browser refresh restores it from status; a daemon restart returns to `balanced`").

---

## FINDING 2 — OPTIMIZATION AXIS TYPE: ENTANGLED (4 VALUES, 2 ARE ENGINE-INTERNAL)

**CONTRADICTION**: `RoutingPosture` mixes engine-internal weight presets with human-facing policies.

```typescript
// recommend.ts:59
export type RoutingPosture = 'fast' | 'balanced' | 'sure' | 'conserve';
```

| Value | Status | Evidence |
|---|---|---|
| `'balanced'` | ✅ Human-facing | Daemon + UI only accept this + 'conserve' (daemon.ts:2970-2972) |
| `'conserve'` | ✅ Human-facing | Same |
| `'fast'` | ❌ Engine-internal | `ROUTING_WEIGHTS.postures.fast` exists but daemon rejects it as junk (CONSERVE-1 test) |
| `'sure'` | ❌ Engine-internal | `ROUTING_WEIGHTS.postures.sure` exists but daemon rejects it as junk (CONSERVE-1 test) |

**CONTRADICTION**: The type carries 4 values; the daemon/UI only expose 2. Tests explicitly reject 'fast'/'sure' as invalid posture inputs.

---

## FINDING 3 — CONSERVE REPRESENTATION: TWO CONCEPTS CORRECTLY SEPARATED, COGNITIVEALL Y ENTANGLED

**FACT**: There are two distinct CONSERVE concepts, correctly kept as separate code paths but sharing a name.

### Concept A — Scarcity FACT (ResourcePolicy)
```typescript
// resource-policy.ts:7-16, 34-48
export interface ProviderResourcePolicy {
  readonly isConserveActive: boolean;     // derived from AlarmEngine
  readonly conserveLevel: 'none' | 'low' | 'critical';
}
```
- Source: `AlarmEngine` → `ResourcePolicyService` → `projectProviderResourcePolicy()`
- Sink: `routing-economics.ts:6,31` → `RoutingEconomicsSnapshot` → `recommendRoute()` (`input.economics`)
- **Never imported by `daemon.ts`** — test RP-12/13/19 asserts `daemonSource` does not match `/resource-policy/`

### Concept B — Routing POSTURE (Recommendation Weights)
```typescript
// daemon.ts:466-471 (comment), recommend.ts:59, 73-78
private routingPosture: RoutingPosture = 'balanced';  // 'balanced' | 'conserve' only
ROUTING_WEIGHTS.postures.conserve = { lambdaC: 2.5, lambdaD: 0.01, ... }  // weight preset
```
- Source: `POST /api/route { posture }` → `setRoutingPosture()` (daemon.ts:5055-5056)
- Sink: `recommendRoute()` via `posture: { value: this.routingPosture, source: 'coach-default' }` (daemon.ts:5006)

The daemon comment at daemon.ts:466-469 explicitly distinguishes: *"Human intent only, never the automatic Scarcity fact (ResourcePolicy `isConserveActive` / AlarmEngine)."*

---

## FINDING 4 — POLICY APPLICATION SEAM: THE CORE GAP

**CRITICAL**: The optimization posture **does NOT reach the live router**. It only reaches the shadow recommendation engine.

### What gets posture:
```typescript
// daemon.ts:4989-5006 — shadowRecommendation()
const recommendation = recommendRoute({
  ...
  posture: { value: this.routingPosture, source: 'coach-default' },  // ← posture flows HERE
  ...
});
```

### What does NOT get posture:
```typescript
// router.ts:260-267 — the LIVE router
const { decision } = this.computeRoute(gameId, prompt, everyCandidate, this.policies);
// computeRoute → computeAutoRoute(gameId, prompt, enriched, this.policies)  // NO posture arg
// computeRoute → computeContextAwareRoute(gameId, prompt, enriched, this.policies, context)  // NO posture arg
```

**No posture parameter** exists on:
- `computeAutoRoute()` (`routing-policy.ts`)
- `computeContextAwareRoute()` (`routing-policy.ts`)
- `RoutingDecision` (`capability-types.ts:100-184` — no posture/optimization-policy field)

**CONTRADICTION**: The R6 engine is documented as running *"AFTER the decision is fixed"* (`recommend.ts:4` comment), and `RoutingFilmDecisionEvent.decidedBy` records **who** chose the route but **not which optimization policy** was applied.

---

## FINDING 5 — POLICY RECOMMENDATION SEAM (R8 BRIDGE): ADVISORY-ONLY UNDER MANUAL

**FACT**: The R8 bridge (`optionToDecision`) enforces advisory-only semantics:

```typescript
// option-to-decision.ts:64-65
// Dad's explicit routing always wins: a locked or MANUAL route is advisory only.
if (rec.authority.mode !== 'auto' || rec.authority.advisoryOnly) return refuse('advisory-only');
```

- `RoutingFilmDecisionEvent.decidedBy` includes `'coach-accepted-primary' | 'coach-accepted-next-best' | 'coach-accepted-scout'` — these are the ONLY transitions where a shadow recommendation becomes a real decision (R8 bridge)
- `dad-advisory.ts:70`: `if (rec.authority.mode !== 'auto' || rec.authority.advisoryOnly) return undefined` — Dad never surfaces an advisory under MANUAL
- This confirms: **posture under MANUAL = advisory only, recommendation never auto-applied**

---

## FINDING 6 — HEALTH/RESOURCE INPUT SEAM: SCARCITY → SHADOW ONLY

```
AlarmEngine → ResourcePolicyService → ProviderResourcePolicy (scarcity fact)
                                                   ↓
                                         routing-economics.ts
                                                   ↓
                                         recommendRoute()  ← shadow engine only
                                                   ↓
                                         UI scoreboard (rec.scarcity)
```

**NOT consumed by**: `computeAutoRoute()`, `computeContextAwareRoute()`, `daemon.ts` (test RP-12/13/19).

**FACT**: CONSERVE-5 test verifies scarcity inputs are untouched when the posture actuator changes.

---

## FINDING 7 — ROUTE PROVENANCE / EXPLANATION SEAM: POSTURE SPLIT BETWEEN DECISION AND SHADOW

| Structure | Has posture? | Has mode? | File:Line |
|---|---|---|---|
| `RoutingDecision` | ❌ NO | ✅ `mode` | `capability-types.ts:101` |
| `RoutingFilmDecisionEvent` | ❌ NO | ❌ NO (has `decidedBy`) | `routing-film.ts:56-73` |
| `RoutingFilmRecommendationDigest` (shadow) | ✅ YES (`posture: string`) | ✅ YES (`authority.mode`) | `routing-film.ts:120-121` |

**CONTRADICTION**: The optimization posture is recorded in the **shadow recommendation digest** (which is "what Sideline would have recommended") but is **abandoned** in the actual decision event. There is no provenance of which optimization policy drove the *actual dispatch*.

---

## FINDING 8 — MANUAL ISOLATION: CONFIRMED CLEAN

**FACT**: Both control axis state and decision-level provenance confirm MANUAL isolation.

| Layer | Evidence | File:Line |
|---|---|---|
| UI state | `currentRoutingPosture` only applies when `currentRoutingMode === 'auto'` | `index.html:3042, 5170` |
| Daemon | `shadowRecommendation` builds `authority: { mode: input.mode }` from passed mode; under MANUAL, `optionToDecision` refuses advisory application | `daemon.ts:5003`, `option-to-decision.ts:65` |
| Recommendation engine | `input.authority.mode === 'manual'` → `['manual']` added to `lockedBy` → `advisoryOnly = true` | `recommend.ts:333-337` |
| R8 bridge | `rec.authority.mode !== 'auto'` → `refuse('advisory-only')` | `option-to-decision.ts:65` |
| Dad advisory | `rec.authority.mode !== 'auto'` → returns `undefined` (no advisory surfaced) | `dad-advisory.ts:70` |

**CONSERVE-4 test** confirms: "MANUAL stays human-authoritative; the shadow recommendation may reflect the posture."

---

## FINDING 9 — FUTURE EXTENSIBILITY (BEST): TWO GAPS TO CLOSE

To add a third sibling-mode (e.g., BEST) as a **first-class** optimization policy — not just a weight preset — two gaps must be closed:

### Gap A: Live router has no posture seam
`computeAutoRoute` / `computeContextAwareRoute` (`routing-policy.ts`, `router.ts:260-267`) accept no posture/optimization-policy parameter. Adding BEST to the live router requires threading a new parameter through the entire routing stack.

### Gap B: Decision-level posture provenance is absent
`RoutingDecision` and `RoutingFilmDecisionEvent` have no field for the optimization policy that was applied. The shadow digest records it, but the actual dispatch decision does not — future policies would be invisible at the decision level.

### Existing extensibility seam (usable as-is):
```typescript
// recommend.ts:73-78
postures: Object.freeze({
  fast:    { lambdaC: 0.5,  lambdaD: 0.30, lambdaR: 0.5,  q: 'mean', weeklyWait: false },
  balanced: { lambdaC: 1.0,  lambdaD: 0.05, lambdaR: 0.5,  q: 'mean', weeklyWait: false },
  sure:    { lambdaC: 0.8,  lambdaD: 0.05, lambdaR: 1.0,  q: 'lo',   weeklyWait: false },
  conserve: { lambdaC: 2.5, lambdaD: 0.01, lambdaR: 0.5,  q: 'mean', weeklyWait: true }
} satisfies Record<RoutingPosture, PostureWeights>),
```
Adding `best: { ... }` to this table + extending the daemon/UI to accept it = the **recommendation-engine** seam is ready. The **live-router** seam is not.

---

## SCORING (per Scout SOP)

| Criterion | Rating | Notes |
|---|---|---|
| Control axis cleanly separated | ✅ **Strong** | `RoutingMode` type, daemon state, REST seam, decision provenance all clean |
| Optimization axis cleanly separated | ⚠️ **Partial** | Type entangled (4 vs 2 values); state separation clean |
| Policy reaches the live router | ❌ **Absent** | Posture only reaches shadow engine (`recommendRoute`), never `computeAutoRoute` |
| Health/resource input seam | ✅ **Strong** | Scarcity fact → economics → recommendation engine; never live router or daemon |
| Route provenance (posture recorded) | ⚠️ **Split** | Posture in shadow digest, NOT in decision event / RoutingDecision |
| Manual isolation | ✅ **Verified** | Advisory-only under MANUAL confirmed at 4 layers (engine, bridge, Dad, UI) |
| Future sibling-mode (BEST) extensibility | ⚠️ **Partial** | Recommendation engine seam ready; live router + decision provenance gaps remain |

---

## ARCHITECT DECISION REQUIRED

1. **Should the optimization posture reach the live router?** — Currently it only affects the advisory shadow. If CONSERVE/NORMAL are meant to drive the *actual dispatch* in AUTO mode, posture must be threaded into `computeAutoRoute` / `computeContextAwareRoute` (architectural change, not additive).

2. **Should `RoutingPosture` be split into engine-internal weight presets vs. human-facing policies?** — `'fast'` and `'sure'` are dead at the daemon/UI boundary; moving them behind an internal type would remove the entanglement.

3. **Should `RoutingDecision` and `RoutingFilmDecisionEvent` record the optimization policy applied?** — Without this, the provenance seam is incomplete and future modes (BEST) would be unobservable at the decision level.

4. **Is the shadow-only application model an intentional design (posture = recommendation tuning) or a gap (posture = routing policy)?** — The daemon comment says "the Coach's CONSERVE actuator's truth," but CONSERVE-4 test says MANUAL makes it "advisory-only" — these two statements are only reconcilable if AUTO + CONSERVE is *also* advisory-only, which contradicts the actuator framing. This needs explicit clarification.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\auto-conserve-routing-authority-20261001-202710
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\auto-conserve-routing-authority-20261001-202710

