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
