This report is reconnaissance, not final architectural authority.

# Executive answer

The subsystem that owns the boundary between AUTO Scout need detection and context-aware routing is **`src/routing-policy.ts`**, specifically within [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816) and its private helper [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288). 

The boundary is partitioned across distinct architecture layers:
1. **Need Detection Classifier ([`src/play-analyzer.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts)):** Pure, stateless string heuristic classifier ([`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105)) determining solely whether prompt wording demonstrates primary reconnaissance, material evidence gap, and uncertainty blocking action. It possesses no awareness of Game identity, candidate capabilities, active roster, or context affinity.
2. **Context Affinity Detector ([`src/control-plane/context-affinity.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts)):** Detects continuations ([`detectFollowUp`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L78-L101)) and identifies context owners ([`resolveContextOwner`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L108-L154)) purely from Game report and ledger evidence. It possesses no awareness of Scout need or candidate capabilities.
3. **Route Constraints Recognizer ([`src/control-plane/route-constraints.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/route-constraints.ts)):** Extracts explicit human intent (`PLAYER: Scout`, `PLAYER: Claude`, etc.) ([`recognizeRouteConstraints`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/route-constraints.ts#L224-L296)).
4. **Boundary Owner & Policy Coordinator ([`src/routing-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts)):** Bridges [`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105) with candidate readiness via [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288). In [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816), it arbitrates precedence: explicit constraints outrank everything; when unconstrained, Scout need detection executes before context ownership resolution, intercepting reconnaissance plays before they reach context owner dispatch/queuing.
5. **Control Plane Router ([`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts)):** Supplies context and delegates both preview and actual dispatch to [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816).

---

# FACTS

1. **Classifier Isolation:** [`src/play-analyzer.ts:69-105`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105) implements [`analyzeScoutNeed(prompt: string): ScoutNeedAnalysis`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105). It is deterministic, pure, and synchronous, operating only on `prompt`. It imports no control-plane, store, candidate, or execution modules, as verified by [`test/auto-scout-need-detection.test.mjs:180-192`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/auto-scout-need-detection.test.mjs#L180-L192).
2. **Scout Candidate Validation:** [`src/routing-policy.ts:240-254`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L254) implements [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288). It evaluates [`analyzeScoutNeed(prompt)`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105), and if `need.shouldUseScout` is true, requires a candidate matching `instanceId === 'scout'`, `playerType === 'scout'`, `executionType === 'scout-formation'`, `transport === 'controlled'`, `state === 'ready'`, and `freshness !== 'unavailable'`.
3. **Execution Precedence in `computeContextAwareRoute`:** In [`src/routing-policy.ts:550-581`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L550-L581):
   - Line 550: [`recognizeRouteConstraints`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/route-constraints.ts#L224-L296) parses human constraints.
   - Lines 558–559: [`detectFollowUp`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L78-L101) and [`resolveContextOwner`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L108-L154) evaluate context ownership.
   - Lines 561–573: Invalid constraints return an error.
   - Lines 578–581: `if (!constraints) { const scoutRoute = computeScoutAutoRoute(gameId, prompt, everyCandidate); if (scoutRoute.decision) return { decision: scoutRoute.decision }; }`
   - Line 692: `if (ownership.state === 'owner') { ... }` is evaluated only after the unconstrained Scout route check.
4. **Basic AUTO Fallback Seam:** In [`src/routing-policy.ts:290-297`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L290-L297), [`computeAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L290-L428) also calls [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288) at line 296 before filtering out non-auto-eligible candidates (`autoEligible !== false`).
5. **Contract Metadata Shape:** [`src/capability-types.ts:143-150`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts#L143-L150) defines `scoutNeed?: { ... }` on [`RoutingDecision`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts#L79-L151).
6. **Unified Router Seam:** [`src/control-plane/router.ts:108-116`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L108-L116) defines [`ControlPlaneRouter.computeRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L108-L116). Both preview (`/api/route/preview`) and dispatch (`/api/dispatch`) invoke `computeRoute`, which forwards to [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816) when a `routeContextProvider` exists.

---

# INFERENCES

1. **Intentional Preemption of Context Owner:** Placing `computeScoutAutoRoute` before `ownership.state === 'owner'` in [`src/routing-policy.ts:578-581`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L578-L581) is an intentional architectural policy choice for V0.1: an explicit, bounded reconnaissance Play is designed to route to Scout before implementation or architecture work commences, regardless of which Player authored previous reports or holds current context.
2. **Preservation of Non-Scout Invariants:** Because Scout capabilities advertise `autoEligible: false`, any prompt that fails [`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105) bypasses `computeScoutAutoRoute` and drops into ordinary AUTO routing, where Scout is filtered out by `candidate.autoEligible !== false`, guaranteeing that non-reconnaissance routing remains byte-for-byte stable.

---

# UNKNOWNS

1. **Real-World Interaction between Incoming Report Focus and Reconnaissance Prompts:** Static analysis cannot establish whether users intend for an open report in the Incoming view to anchor execution to the report's owner when typing a prompt that contains both follow-up phrasing and strong reconnaissance directives.
2. **UI Rendering of Scout Decision Context:** In [`src/public/index.html`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/public/index.html), it is not statically verifiable whether omitting `decision.context` causes visual anomalies in the AUTO routing card if the human had selected an Incoming report before typing an AUTO Scout prompt.

---

# CONTRADICTIONS

1. **Eager Context Computation vs. Scout Short-Circuit:**
   In [`src/routing-policy.ts:558-581`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L558-L581), `detectFollowUp` and `resolveContextOwner` are computed eagerly on every invocation of [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816). However, if `!constraints` and `computeScoutAutoRoute` succeeds at line 580, the computed `ownership` result is discarded entirely.
2. **Context Field Omission on `RoutingDecision`:**
   In [`src/routing-policy.ts:258-287`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L258-L287), [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288) constructs a [`RoutingDecision`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts#L79-L151) that completely omits the `context` and `contextPreamble` properties. In contrast, all other decisions in `computeContextAwareRoute` (lines 685–688, 712, 729, 737, 758, 783, 800, 812) populate `decision.context` (with `{ state: 'owner' | 'unknown' | 'none', ... }`).
3. **Documentation Historical Drift:**
   [`REPORTS/Codex/S17.0-Scout-Player-V0.1-First-Class-Routing-Target.md:92-95`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/REPORTS/Codex/S17.0-Scout-Player-V0.1-First-Class-Routing-Target.md#L92-L95) documented that Scout was `autoEligible: false` and that "No keyword classifier or pretend Scout-need intelligence was added." The subsequent slice added [`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105) and [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288), intentionally overriding that previous state while retaining `autoEligible: false` as the guard against generic fallback.

---

# Relevant files / symbols

- [`src/routing-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts):
  - [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816) (authoritative boundary owner)
  - [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288) (Scout candidate bridge)
  - [`computeAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L290-L428) (unconstrained fallback)
- [`src/play-analyzer.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts):
  - [`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105) (need detection classifier)
  - [`ScoutNeedAnalysis`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L45-L54) (classifier contract)
- [`src/control-plane/context-affinity.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts):
  - [`detectFollowUp`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L78-L101) (follow-up classifier)
  - [`resolveContextOwner`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/context-affinity.ts#L108-L154) (context owner resolver)
- [`src/control-plane/route-constraints.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/route-constraints.ts):
  - [`recognizeRouteConstraints`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/route-constraints.ts#L224-L296) (explicit human intent extractor)
- [`src/control-plane/router.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts):
  - [`ControlPlaneRouter.computeRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/control-plane/router.ts#L108-L116) (preview/dispatch harness)
- [`src/capability-types.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts):
  - [`RoutingDecision`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/capability-types.ts#L79-L151) (data contract)
- [`test/auto-scout-need-detection.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/auto-scout-need-detection.test.mjs):
  - Unit and integration tests for AUTO Scout need detection and boundary assertions.

---

# Smallest remaining risk

The smallest remaining risk is **unintended context dropping during follow-up reconnaissance**:
When a human has an Incoming report selected and submits a reconnaissance Play (e.g., `"Investigate which implementation owns X in this report before modifying it"`), [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816) routes to `scout` via [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288). Because `computeScoutAutoRoute` does not receive `RouteContext` and returns a `RoutingDecision` without `context` or `contextPreamble`, the Scout formation receives only the raw human prompt without the target report path prepended in a handoff preamble.

---

# Recommended next step

When evolving from V0.1 to future policy layers:
1. Preserve [`src/routing-policy.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts) as the sole owner of the boundary.
2. Pass `context: RouteContext` and the resolved `ownership` into [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288).
3. If context ownership or an incoming report exists when Scout is chosen, attach `context: { state: ownership.state, reportPath: ... }` and generate a `contextPreamble` so that the subordinate Scout formation receives the referenced report path as explicit reconnaissance evidence.

---

# Provenance

- **Game Root:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`
- **Play ID:** `Scout-Formation__2026-09-17_222321_163_MDT`
- **Canonical Play Hash:** `sha256:f8609dc8ab0f7762e1db4bd097c87dfd289eff51eb6991bb203169fc1f71712e`
- **Execution Mode:** Read-only reconnaissance (no files created/modified; no git or shell mutations executed).
