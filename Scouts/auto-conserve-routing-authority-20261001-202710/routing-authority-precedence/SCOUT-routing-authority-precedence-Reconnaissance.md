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
