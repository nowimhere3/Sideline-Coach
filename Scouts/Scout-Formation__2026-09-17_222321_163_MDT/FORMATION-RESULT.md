SCOUT FORMATION RESULT

Play: Scout-Formation__2026-09-17_222321_163_MDT

Objective:
Investigate which subsystem owns the boundary between AUTO Scout need detection and context-aware routing. Compare multiple current architecture seams and tests before changing anything, and gather evidence first. Identify contradictions and the smallest remaining risk. Read-only reconnaissance only.

Scouts requested: 1
Completed: 1
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Outcome: COMPLETE

AntiGravity:
COMPLETE
model: gemini-3.8-flash-medium
report: C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Scout Only\Formations\Scout-Formation__2026-09-17_222321_163_MDT\antigravity-SCOUT-REPORT.md

Combined findings:
1 of 1 Scouts completed with a structurally usable report. Independent findings and any self-reported contradictions are preserved below; cross-Scout synthesis beyond this mechanical index requires human or Architect review.

Unique findings:
- AntiGravity: The subsystem that owns the boundary between AUTO Scout need detection and context-aware routing is **`src/routing-policy.ts`**, specifically within [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816) and its private helper [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L240-L288). 

The boundary is partitioned across distinct architecture layers:
1. **Need Detection Classifier ([`src/play-analyzer.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts)):** Pure, stateless string heuristic classifier ([`analyzeScoutNeed`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/play-analyzer.ts#L69-L105)) determining solely whether prompt wording 

Contradictions (self-reported, not averaged into consensus):
- AntiGravity: 1. **Eager Context Computation vs. Scout Short-Circuit:**
   In [`src/routing-policy.ts:558-581`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L558-L581), `detectFollowUp` and `resolveContextOwner` are computed eagerly on every invocation of [`computeContextAwareRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L541-L816). However, if `!constraints` and `computeScoutAutoRoute` succeeds at line 580, the computed `ownership` result is discarded entirely.
2. **Context Field Omission on `RoutingDecision`:**
   In [`src/routing-policy.ts:258-287`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy.ts#L258-L287), [`computeScoutAutoRoute`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/routing-policy

Recommended next step: Review the preserved independent Formation reports; forward to an Architect if a repair decision is warranted.

Evidence: C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Scout Only\Formations\Scout-Formation__2026-09-17_222321_163_MDT

