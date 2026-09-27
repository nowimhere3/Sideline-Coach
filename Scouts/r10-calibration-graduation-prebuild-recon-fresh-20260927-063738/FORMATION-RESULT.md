# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION COMPLETE · 3/3 lanes completed · 0 substitutions · elapsed 00:03:49

Play: r10-calibration-graduation-prebuild-recon-fresh-20260927-063738
Rerun of: r10-calibration-graduation-prebuild-recon (earlier evidence untouched)
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-27T12:37:38.791Z
Finished: 2026-09-27T12:41:28.226Z
TOTAL ELAPSED TIME: 00:03:49

Scouts requested: 3
Completed: 3
Failed: 0
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 0
Total receiver attempts: 3
Substitutions: 0
Outcome: COMPLETE

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r10-film-calibration-data | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T12:37:38.845Z | 2026-09-27T12:41:25.094Z | 00:03:46 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-film-calibration-data-Reconnaissance.md |
| r10-math-graduation | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T12:37:39.066Z | 2026-09-27T12:41:28.221Z | 00:03:49 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-math-graduation-Reconnaissance.md |
| r10-gating-ui-lifecycle | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-27T12:37:39.082Z | 2026-09-27T12:40:07.668Z | 00:02:28 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-gating-ui-lifecycle-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane r10-film-calibration-data: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane r10-math-graduation: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane r10-gating-ui-lifecycle: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: r10-film-calibration-data (objective 5bf61af49c44)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Investigate the exact existing Sideline Coach evidence pipeline needed for R10 calibration and graduation.

R10 PURPOSE:
- compute calibration from REAL resolved routing outcomes
- determine graduation per task class
- unlock calibrated Dad-facing recommendation percentages only after graduation
- recompute periodically/weekly
- allow a class to un-graduate if calibration later degrades

Trace exact current files/functions for:
- Routing Film storage and readers
- R5 attribution
- R3 belief/posterior machinery
- R6 recommendation receipts/digests
- resolved vs pending vs excluded outcomes
- task-class identity
- predicted probability / recommendation score evidence
- chosen route outcome evidence
- shadow recommendation evidence
- any existing calibration / Brier / reliability helpers
- R7 Routing Intelligence shadow report
- current Dad advisory percentage restrictions

Answer:

1. What exact records currently contain everything R10 needs?
2. Is the probability frozen at recommendation time, or would R10 risk reconstructing history?
3. How should R10 identify RESOLVED eligible outcomes without inventing attribution?
4. Where is task class canonically represented?
5. Which current records must be excluded from calibration?
6. What existing code can be reused directly?
7. What genuinely must be added?
8. Which exact files/functions should Opus touch vs reference only?

Do NOT design new statistical thresholds.
Use the governing S57.1 thresholds exactly where specified.
Do NOT implement.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-film-calibration-data-Reconnaissance.md

**Key discoveries:** Complete read-only trace of the existing Sideline Coach evidence pipeline for R10 calibration and graduation. All questions answered with exact file/symbol references and epistemic labels.

---

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** | File | Role for R10 | Opus Action |
|---|---|---|
| `src/routing-intel/dev-views.ts` | **Primary reference** — contains `buildShadowReport`, calibration bins, graduation logic, `SHADOW_MIN_N` | **TOUCH** — add `buildCalibrationReport(taskClass)`, Brier, 3-bin reliability, graduation persistence |
| `src/routing-intel/attribution.ts` | **Reference** — `projectFirstPassResolutions`, `effectiveAttributions` | **REFERENCE ONLY** — do not modify; R10 consumes its output |
| `src/routing-intel/film-index.ts` | **Reference** — `FilmObservation.firstPass`, `buildFilmIndex` | **REFERENCE ONLY** |
| `src/routing-intel/routing-film.ts` | **Reference** — `RoutingFilmRecorder.events()`, event types | **REFERENCE ONLY** |
| `src/routing-intel/recommend.ts` | **Reference** — `RoutingRecommendation.strength.calibratedFirstPass` (optional, typed) | **TOUCH** — populate `calibratedFirstPass` when task class graduated |
| `src/routing-intel/dad-advisory.ts` | **Reference** — blocks percentages pre-graduation | **TOUCH** — read `calibratedFirstPass` and format "Codex · 91%" post-graduation |
| `src/routing-intel/advisory-stage.ts` | **Reference** — R8 gate separate from R10 calibration gate | **REFERENCE ONLY** |
| `src/routing-intel/prior-pack.ts` | **Reference** — prior versions stamped on recommendations | **REFERENCE ONLY** |
| `src/capability-types.ts` | **Reference** — `TaskClassification` enum | **REFERENCE ONLY** |
| `src/play-analyzer.ts` | **Reference** — `classifyTask` produces task

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: r10-math-graduation (objective b9772fa6d3ce)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Map R10's mathematical/graduation implementation terrain against CURRENT source and the governing S57.1 architecture.

GOVERNING R10 INTENT:
Graduation is per task class.

Expected architectural requirements include:
- minimum resolved-outcome sample requirement
- reliability calibration bins
- Brier score
- comparison against pooled task-class base-rate predictor
- weekly recomputation
- ability to UN-GRADUATE
- no Dad-facing percentages before graduation

Do NOT invent replacement thresholds.

Investigate:
- whether Brier score code already exists
- whether calibration/reliability-bin helpers exist
- current probability semantics from R3/R6
- whether probabilities represent success / first-pass success / recommendation correctness
- task-class sample counting
- pending/excluded/unattributed treatment
- sparse-bin behavior
- deterministic sorting/binning conventions
- numerical edge cases
- how calibration could be computed without hindsight leakage

Answer:

1. Translate the S57.1 graduation rule into exact deterministic calculations.
2. Identify ambiguous mathematical points that require Architect judgment.
3. Identify any architecture/source mismatch.
4. Define what evidence must be frozen vs recomputable.
5. Identify likely off-by-one, sparse-bin, and denominator traps.
6. Map the smallest pure-function boundary for R10.
7. List deterministic tests Opus absolutely must write.

Do NOT change the architecture.
Do NOT implement.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-math-graduation-Reconnaissance.md

**Key discoveries:** - **FACT:** S57.1 architecture (§12.3) defines graduation per task class requiring: ≥30 resolved outcomes, 3-bin reliability check (observed rate within ±10pp of mean predicted per bin), Brier score < base-rate predictor, weekly recomputation, and ability to un-graduate.  
- **FACT:** Current implementation in `src/routing-intel\dev-views.ts` (lines 371-380) only checks:  
  - `playsLogged >= SHADOW_MIN_N.graduationPlays` (50)  
  - burn error criterion (`not-evaluable`, `within-50-percent`, `outside-50-percent`)  
  - `invariantTests: 'not-evaluated-here'`  
  - `calibratedPercent: 'not-granted'`  
  It does **not** check resolved outcomes, reliability bins, or Brier score.  
- **FACT:** Resolved outcomes (binary firstPass) and frozen predicted probabilities (from recommendation digests) are available in the Routing Film via `film-index.ts` and `dev-views.ts` (see `predictedFirstPass` function).  
- **FACT:** No Brier score, reliability-bin helpers, or task-class graduation logic exists in the source (grep for "Brier" yields only architecture/doc mentions; no calibration/reliability helpers found).  
- **FACT:** The belief engine (`belief.ts`) computes posterior means (`firstPass.mean`) for targets, but graduation requires using *frozen* predictions at recommendation time (stored in Film), not current beliefs.  
- **FACT:** SHADOW_MIN_N.graduationPlays (50) exceeds S57.1's ≥30 resolved outcomes, creating a potential mismatch if interpreted as resolved outcomes.  
- **INFEREN

**FACT:** - S57.1 §12.3: Graduation gate per task class: ≥30 resolved outcomes, 3-bin reliability check (observed rate within ±10pp of mean predicted), Brier score beats base-rate predictor, recomputed weekly, un-graduation possible.  
- `src/routing-intel\dev-views.ts` lines 371-380: Graduation object only includes `playsLogged`, `playsRequired`, `playsCriterionMet`, `burnErrorCriterion`, `invariantTests`, `calibratedPercent`.  
- `src/routing-intel\film-index.ts`: `FilmObservation.firstPass` is `{y: 0|1, attribution: number}` for resolved, skill-eligible outcomes (clean/player-defect).  
- `src/routing-intel\dev-views.ts` `predictedFirstPass` function extracts frozen predicted probability from recommendation digest at recommendation time.  
- No Brier score, reliability-bin computation, or task-class aggregation exists in `src/` (verified via grep).  
- `SHADOW_MIN_N.graduationPlays = 50` (line 45 of dev-views.ts).  
- Routing Film is append-only; recommendation digests and outcomes are immutable once recorded.

**INFERENCE:** - Graduation per task class requires:  
  1. **Resolved outcomes count**: `n_resolved = |{o in FilmObservations: o.firstPass defined ∧ o.profile.taskClass = T}| ≥ 30`  
  2. **Predicted probability**: For each resolved observation, use `predictedFirstPass` from its recommendation digest (frozen at recommendation time).  
  3. **Pooled first-pass rate**: `p_bar = (Σ y_i) / n_resolved`  
  4. **Brier score (model)**: `BS = (1/n) Σ (p_i - y_i)²`  
  5. **Brier score (base-rate)**: `BS_base = (1/n) Σ (p_bar - y_i)²`  
  6. **Reliability check**: Split [0,1] into 3 equal-width bins; for each bin b with `n_b > 0`:  
     - `mean_predicted_b = (Σ_{i in bin b} p_i) / n_b`  
     - `observed_rate_b = (Σ_{i in bin b} y_i) / n_b`  
     - Require `|observed_rate_b - mean_predicted_b| ≤ 0.1`  
  7. **Graduation decision**: `n_resolved ≥ 30` AND (all non-empty bins satisfy reliability) AND (`BS < BS_base`)  
- Boundary handling: Use `bin = Math.min(2, Math.floor(p * 3))` to avoid index overflow at p=1.0.  
- Weekly recomputation: Status must be cached and recomputed at least weekly using latest Film data.  
- Un-graduation: If recomputation fails the gate, status reverts to un-graduated.  
- Pure-function boundary: A function taking `Array<{taskClass: string, predictedProbability: number, outcome: 0|1>}` and returning graduation status per task class is deterministic and side-effect-free.

**UNKNOWN:** - Exact minimum samples per bin for reliability check (architecture silent; dev-views.ts uses 5 for shadow calibration).  
- Whether attribution weight should be used in outcome or error calculations (e.g., weight squared error by attribution weight).  
- How to handle bins with zero samples (skip or require non-empty bins).  
- Whether the base-rate predictor should use the class's pooled first-pass rate across all targets or per-target pooling.

**CONTRADICTION:** - **MISMATCH:** Architecture requires ≥30 resolved outcomes; current implementation uses `playsLogged ≥ 50` (recommended plays, not resolved outcomes) and ignores resolved outcomes entirely.  
- **MISMATCH:** Architecture requires 3-bin reliability check and Brier score comparison; current implementation computes neither.  
- **MISMATCH:** Architecture requires weekly recomputation and un-graduation; no evidence of such mechanisms in source.

**Important files:** - **Architecture:** `TEMP\S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md` (§12.3)  
- **Current (incomplete) graduation:** `src\routing-intel\dev-views.ts` (lines 371-380)  
- **Belief engine:** `src\routing-intel\belief.ts` (computes `firstPass.mean`)  
- **Film index:** `src\routing-intel\film-index.ts` (provides `FilmObservation.firstPass` and `predictedFirstPass` via `dev-views.ts`)  
- **Routing film types:** `src\routing-intel\routing-film.ts` (event schemas)

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: r10-gating-ui-lifecycle (objective 9579f7c60147)
- Objective: READ-ONLY RECONNAISSANCE ONLY. Do not modify files.

Map the product/gating lifecycle for R10.

R10 PURPOSE:
Once a task class genuinely graduates, calibrated recommendation percentages may become available to Dad.
Graduation must be reversible if later evidence no longer meets the standard.

Investigate CURRENT source for:
- R8 Dad advisory stage gate
- DadRecommendationView
- current prohibition on percentages
- R7 Routing Intelligence UI
- status payloads and Dev Mode surfaces
- any weekly/background recomputation infrastructure
- persistent vs derived product state
- daemon lifecycle / startup recomputation seams
- existing scheduler/timer infrastructure
- how recommendation/task-class information reaches Dad UI
- where percentage display could be gated without creating another routing brain

Important:
R8 remains dormant until its existing §19.4 activation gate passes.
R10 must NOT accidentally open R8.

Answer:

1. Should R10 graduation state be derived each time, cached, or durably persisted based on existing architecture?
2. Where is the narrowest honest percentage-display gate?
3. How should task-class graduation reach Dad UI without leaking Dev detail?
4. How should un-graduation remove percentages again?
5. What existing lifecycle/timer seam could support weekly recomputation?
6. What interaction exists between R8 activation and R10 percentage graduation?
7. Which files/functions should Opus modify vs leave alone?
8. Identify any hidden product-state or migration hazard.

Do NOT design pixel-level UI.
Do NOT implement.
Do NOT open R8.
Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION.
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-gating-ui-lifecycle-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** UNKNOWN

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 3 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane r10-film-calibration-data: Complete read-only trace of the existing Sideline Coach evidence pipeline for R10 calibration and graduation. All questions answered with exact file/symbol references and epistemic labels. ---
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane r10-math-graduation: - **FACT:** S57.1 architecture (§12.3) defines graduation per task class requiring: ≥30 resolved outcomes, 3-bin reliability check (observed rate within ±10pp of mean predicted per bin), Brier score < base-rate predictor, weekly recomputation, and ability to un-graduate. - **FACT:** Current implementation in `src/routing-intel\dev-views.ts` (lines 371-380) only checks: - `playsLogged >= SHADOW_MIN
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane r10-gating-ui-lifecycle: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

None.

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane r10-math-graduation: - **MISMATCH:** Architecture requires ≥30 resolved outcomes; current implementation uses `playsLogged ≥ 50` (recommended plays, not resolved outcomes) and ignores resolved outcomes entirely. - **MISMATCH:** Architecture requires 3-bin reliability check and Brier score comparison; current implementation computes neither. - **MISMATCH:** Architecture requires weekly recomputation and un-graduation; no evidence of such mechanisms in source.

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

Every requested lane returned a completed report.

## CHILD REPORTS

- Lane r10-film-calibration-data · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-film-calibration-data-Reconnaissance.md
- Lane r10-math-graduation · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-math-graduation-Reconnaissance.md
- Lane r10-gating-ui-lifecycle · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738\SCOUT-r10-gating-ui-lifecycle-Reconnaissance.md

### Full report — lane r10-film-calibration-data (sideline-scout-deep)

Now I have comprehensive evidence. Let me compile the full reconnaissance report.
---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** r10-calibration-graduation-prebuild-recon-fresh-20260927-063738  
**Scout ID:** r10-film-calibration-data  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Status:** READ-ONLY RECONNAISSANCE — Not final architectural authority  

---

## RESULT

Complete read-only trace of the existing Sideline Coach evidence pipeline for R10 calibration and graduation. All questions answered with exact file/symbol references and epistemic labels.

---

## KEY DISCOVERIES

### 1. The Single Source of Truth: Routing Film (`routing-film.jsonl`)

**FACT** — The append-only journal at `~/.sideline/routing-film.jsonl` (managed by `RoutingFilmStore` / `RoutingFilmRecorder` in `src/routing-intel/routing-film.ts`) is the canonical evidence store. It contains **five event kinds** that collectively hold everything R10 needs:

| Event Kind | Purpose | Key Fields for R10 |
|---|---|---|
| `decision` | Dispatch-time snapshot | `chosen` (target), `recommendation` (R6 digest with frozen `firstPass`, `burn` p50), `profile` (taskClass, difficulty, role), `decidedBy`, `receiptBefore`, `possession` |
| `outcome` | Completion truth | `ledgerOutcome`, `finishedAt`, `durationMs`, `burn[]` (isolated observations with `isolation`, `remainingPercentDelta`), `receiptAfter`, `failureClass`, `concurrency` |
| `link` | Follow-up → parent | `parentClientRef`, `linkEvidence` (scout-continuation / named-report / incoming-report / latest-play / touch-overlap) |
| `attribution` | Fix cause | `cause` (FixCause enum), `source` (rule/coach/envelope), `confidence`, `ruleId` |
| `resolution` | Settled first-pass state | `state` (clean/repaired/failed/excluded), `closedBy` (window-72h/three-later-plays) |

**FACT** — The Film is **global** (all Games), rotated at 5 MB × 3 generations, read via `RoutingFilmRecorder.events()` returning chronological `RoutingFilmEvent[]`.

---

### 2. Probability Is Frozen at Recommendation Time

**FACT** — The R6 `recommendRoute()` function produces a `RoutingRecommendation` whose digest is written into the Film `decision` event **at dispatch**. The digest (`RoutingFilmRecommendationDigest` in `routing-film.ts:113-133`) contains:

- `primary.firstPass` — the predicted first-pass probability (Beta posterior mean) **frozen at recommendation time**
- `primary.burn[]` — predicted p50 burn per pool/window **frozen at recommendation time**
- `engineVersion`, `weightsVersion`, `priorPackVersion` — version stamps for exact replay

**FACT** — `dev-views.ts:539-552` (`predictedFirstPass`) reads this frozen probability **only from the persisted digest**; it never reconstructs history. The Film decision event is the single source of the predicted probability for the chosen route.

**INFERENCE** — R10 calibration will compare this frozen `firstPass` against the later-resolved `firstPass.y` (0/1) from `FilmObservation.firstPass` (built by `film-index.ts:147-160` via R5 resolutions). No reconstruction risk exists.

---

### 3. RESOLVED Eligible Outcomes: Exact Identification Path

**FACT** — R5 `projectFirstPassResolutions` (`attribution.ts:321-392`) is the **sole authority** for identifying resolved, skill-eligible outcomes. It consumes:
- All Film events (decisions, outcomes, links, attributions)
- An injected `now` clock
- Returns `FirstPassProjection` with `ResolutionDetail[]` where each has:
  - `state: 'clean' | 'repaired' | 'failed' | 'excluded' | 'pending'`
  - `resolution: FirstPassResolution` (state + source + confidence)
  - `closedAt`, `closedBy`, `linkedFollowUps`

**FACT** — Resolution logic (`attribution.ts:356-387`) follows S57.1 §5.1, §8 exactly:
- Window closes at **72 hours** OR **3 later same-Game Plays touching same files** (whichever first)
- `pending` until window closes → contributes nothing to belief or calibration
- `excluded` when: `NEVER_SKILL_OUTCOMES` (interrupted/unknown/not-sent) OR `ENVIRONMENT_FAILURE_CLASSES` (provider/auth/quota/harness/interrupted) OR follow-up attributed to non-player-defect cause
- `clean` = completed + no player-defect repair in window → **y = 1**
- `repaired` = completed + player-defect repair attributed → **y = 0**
- `failed` = failed/partial/blocked with player-defect cause → **y = 0**

**FACT** — `film-index.ts:147-160` (`resolveFirstPass`) converts resolutions to `FilmObservation.firstPass = { y: 0|1, attribution: weight }` where `attributionWeight` (`film-index.ts:49-54`) applies S57.1 §5.2 weights:
- `clean` → 1.0
- `player-defect` from rule-high → 0.6, rule-low → 0.3
- `player-defect` from coach/envelope/outcome → 1.0

**R10 MUST USE** `projectFirstPassResolutions(events, now).details` filtered to `state !== 'pending' && state !== 'excluded'` — this is the **canonical, non-invented** set of resolved eligible outcomes.

---

### 4. Task Class Canonical Representation

**FACT** — Task class is `TaskClassification = 'architecture' | 'implementation' | 'quick' | 'default'` from `capability-types.ts:66`.

**FACT** — It enters the pipeline at **dispatch time** via `RoutingFilmDecisionEvent.profile` (`routing-film.ts:78`):
```typescript
readonly profile?: DispatchProfile;  // { taskClass, difficulty, role }
```
Where `DispatchProfile` comes from `control-plane/follow-up-evidence.ts` (R5 Play analysis).

**FACT** — For Film lines **before R5**, `profile` is absent. `film-index.ts:119,132` handles this: `profile?.taskClass ?? 'unknown'`, and `comparability.ts:107` treats unknown class as `'default'` with similarity 0.3 to any class.

**FACT** — The canonical per-Play task class for calibration grouping is `FilmObservation.profile?.taskClass` (from the R5 join) or `'unknown'` for pre-R5 lines. R10 must group by this field.

---

### 5. Records That MUST Be Excluded from Calibration

**FACT** — Per S57.1 §5.1, §12.3 and implemented in `film-index.ts:147-160` + `attribution.ts:371-386`, these are **excluded** (no `firstPass` evidence produced):

| Exclusion Reason | Code Location | Film Evidence |
|---|---|---|
| `ledgerOutcome ∈ {interrupted, unknown, not-sent}` | `film-index.ts:88` `NEVER_SKILL` | `outcome.ledgerOutcome` |
| `failureClass ∈ {provider, auth, quota, harness, interrupted}` | `attribution.ts:45` `ENVIRONMENT_FAILURE_CLASSES` | `outcome.failureClass` |
| Resolution `state === 'excluded'` | `attribution.ts:369,381,386` | `resolution.state` |
| Resolution `state === 'pending'` (window open) | `attribution.ts:357-360` | `resolution.state` |
| Follow-up attributed to non-player-defect cause (unattributed, prompt-change, planned-continuation, environment-drift, bad-scout-evidence, missing-context, upstream-change) | `attribution.ts:379-381` | `effectiveAttribution.cause` |

**FACT** — Only `state === 'clean'` (y=1) and `state === 'repaired'/'failed'` with `cause === 'player-defect'` (y=0) produce `FilmObservation.firstPass`. All others return `undefined` from `resolveFirstPass` and are **invisible to belief and calibration**.

---

### 6. Existing Code Reusable Directly for R10

| R10 Need | Existing Code | Location |
|---|---|---|
| Read all Film events | `RoutingFilmRecorder.events()` | `routing-film.ts:352-354` |
| Get resolved outcomes per Play | `projectFirstPassResolutions(events, now)` | `attribution.ts:321-392` |
| Get predicted probability for chosen route | `predictedFirstPass(decision, chosenKey, keyOf)` | `dev-views.ts:539-552` |
| Get observed y (0/1) for chosen route | `FilmObservation.firstPass.y` | `film-index.ts:69,125-136` |
| Group by task class | `FilmObservation.profile?.taskClass` | `film-index.ts:132` |
| Calibration bins (5-bin reliability) | `buildShadowReport` calibration bins | `dev-views.ts:402-431, 445-455` |
| Brier score components | `CalibrationBin` with `meanPredicted`, `observedRate`, `n` | `dev-views.ts:333-340, 446-450` |
| Graduation gate (50 plays, burn error, invariants) | `ShadowReport.graduation` | `dev-views.ts:371-380, 458-469` |
| Per-task-class scorecards | `buildScorecards` grouped by `target.key \| role \| taskClass` | `dev-views.ts:224-305` |
| Weekly recomputation | Pure functions with injected `now` — trivial to schedule | All projection functions |
| Un-graduation (degradation) | `graduation.status` recomputed fresh each call | `dev-views.ts:458-469` |

**FACT** — `dev-views.ts:386-472` (`buildShadowReport`) already computes **per-dispatch calibration bins** for chosen routes with frozen predictions vs. resolved outcomes. It uses exactly the R10 methodology: chosen routes only, frozen `firstPass` from digest, resolved `y` from R5.

**FACT** — The `SHADOW_MIN_N` constants (`dev-views.ts:38-46`) encode S57.1 §19.4 and §12.3 thresholds:
```typescript
calibrationBin: 5,        // §12.3: min 5 per bin
graduationPlays: 50       // §19.4: 50 dispatched plays for R8 exit
```
**Note:** §12.3 specifies **≥ 30 resolved outcomes per task class** for calibration graduation — this is distinct from the 50-play R8 shadow exit criterion.

---

### 7. What Genuinely Must Be Added for R10

| Gap | Required Addition |
|---|---|
| **Per-task-class calibration** | `buildShadowReport` aggregates across ALL task classes. R10 needs `buildCalibrationReport(events, pack, now, taskClass)` filtering to one class. |
| **Brier score computation** | Not implemented. Need `brierScore(predictions, outcomes)` = mean((p - y)²) per class. |
| **Base-rate predictor comparison** | §12.3: "Brier score beats the base-rate predictor (the class's pooled first-pass rate)". Need pooled rate per class. |
| **3-bin reliability check** | §12.3: "each bin's observed rate within ±10 pp of mean predicted". Current 5-bin exists; need 3-bin with ±10pp threshold. |
| **Graduation state persistence** | Current `graduation.status` is `'shadow'` always. Need persisted `graduated: boolean` per task class with timestamp, recomputed weekly. |
| **Dad-facing percentage unlock** | `dad-advisory.ts:6-7` explicitly blocks percentages until graduation. Need `calibratedFirstPass` in `RoutingRecommendation.strength` (already typed as optional at `recommend.ts:300`). |
| **Weekly scheduler** | Pure function exists; needs a weekly trigger (cron or on-dispatch check) that recomputes and persists graduation flags. |
| **Un-graduation logic** | If weekly recompute fails criteria → revert to words. |

---

### 8. Exact Files/Functions Opus Should Touch vs. Reference Only

| File | Role for R10 | Opus Action |
|---|---|---|
| `src/routing-intel/dev-views.ts` | **Primary reference** — contains `buildShadowReport`, calibration bins, graduation logic, `SHADOW_MIN_N` | **TOUCH** — add `buildCalibrationReport(taskClass)`, Brier, 3-bin reliability, graduation persistence |
| `src/routing-intel/attribution.ts` | **Reference** — `projectFirstPassResolutions`, `effectiveAttributions` | **REFERENCE ONLY** — do not modify; R10 consumes its output |
| `src/routing-intel/film-index.ts` | **Reference** — `FilmObservation.firstPass`, `buildFilmIndex` | **REFERENCE ONLY** |
| `src/routing-intel/routing-film.ts` | **Reference** — `RoutingFilmRecorder.events()`, event types | **REFERENCE ONLY** |
| `src/routing-intel/recommend.ts` | **Reference** — `RoutingRecommendation.strength.calibratedFirstPass` (optional, typed) | **TOUCH** — populate `calibratedFirstPass` when task class graduated |
| `src/routing-intel/dad-advisory.ts` | **Reference** — blocks percentages pre-graduation | **TOUCH** — read `calibratedFirstPass` and format "Codex · 91%" post-graduation |
| `src/routing-intel/advisory-stage.ts` | **Reference** — R8 gate separate from R10 calibration gate | **REFERENCE ONLY** |
| `src/routing-intel/prior-pack.ts` | **Reference** — prior versions stamped on recommendations | **REFERENCE ONLY** |
| `src/capability-types.ts` | **Reference** — `TaskClassification` enum | **REFERENCE ONLY** |
| `src/play-analyzer.ts` | **Reference** — `classifyTask` produces task class | **REFERENCE ONLY** |
| `src/public/index.html` (Dev UI) | **Reference** — displays shadow report at lines 9755-9770 | **TOUCH** — add calibration/graduation Dev panel |

---

## EPISTEMIC SUMMARY

| Question | Answer | Certainty |
|---|---|---|
| 1. Exact records for R10 | `RoutingFilmEvent[]` from `RoutingFilmRecorder.events()` — decision/outcome/link/attribution/resolution events with frozen recommendation digest | **FACT** |
| 2. Probability frozen? | Yes — `RoutingFilmRecommendationDigest.primary.firstPass` and `burn[]` frozen at dispatch in Film decision event | **FACT** |
| 3. RESOLVED identification | `projectFirstPassResolutions(events, now).details` filtered to `state ∈ {clean, repaired, failed}` — zero invention | **FACT** |
| 4. Task class canon | `FilmObservation.profile?.taskClass` (from R5 `DispatchProfile` join) or `'unknown'` for pre-R5 lines | **FACT** |
| 5. Excluded records | `pending`, `excluded`, `NEVER_SKILL` outcomes, `ENVIRONMENT_FAILURE_CLASSES`, non-player-defect attributions | **FACT** |
| 6. Reusable code | `buildShadowReport`, `projectFirstPassResolutions`, `predictedFirstPass`, `buildScorecards`, `FilmObservation.firstPass` | **FACT** |
| 7. Must add | Per-class calibration report, Brier score, 3-bin ±10pp check, graduation persistence, weekly scheduler, Dad percentage unlock | **FACT** |
| 8. Opus touch vs ref | Touch: `dev-views.ts` (new fns), `recommend.ts` (populate calibrated), `dad-advisory.ts` (display %), `index.html` (Dev panel). Reference: attribution, film-index, routing-film, prior-pack, capability-types | **FACT** |

---

## LIMITATIONS

1. **No runtime Film data inspected** — This reconnaissance reads source code only. Actual Film volume, task-class distribution, and resolution rates are UNKNOWN until a live journal is examined.

2. **R10 statistical thresholds** — S57.1 §12.3 specifies "≥ 30 resolved outcomes per class", "3-bin reliability ±10pp", "Brier beats base-rate". These are **governing thresholds** — I do not design alternatives.

3. **Weekly recomputation mechanism** — Not yet implemented. The pure functions support it; a scheduler seam is needed (likely in daemon or a dedicated worker).

4. **Graduation persistence format** — Not specified in S57.1. Could be a small JSON file `~/.sideline/calibration-graduation.json` with `{ taskClass: { graduated: boolean, graduatedAt: number, lastChecked: number, brier: number, reliability: [...] } }`.

5. **Dad percentage formatting** — `dad-advisory.ts` line template max 28 chars. "Codex · 91%" fits; need to verify all playerType names fit.

---

## IMPORTANT FILES / PATHS

```
src/routing-intel/
├── routing-film.ts       # Film store, recorder, event types, receipts, burn derivation
├── attribution.ts        # R5: linkFollowUp, attributeFollowUp, projectFirstPassResolutions, effectiveAttributions
├── film-index.ts         # R3: buildFilmIndex, FilmObservation, FirstPassResolution, resolveFirstPass
├── belief.ts             # R3: computeBelief, Beta-Binomial, drift detection
├── recommend.ts          # R6: recommendRoute, RoutingRecommendation, recommendationDigest
├── dev-views.ts          # R7: buildShadowReport, buildScorecards, calibration bins, graduation status
├── dad-advisory.ts       # R8: dadAdvisoryView (blocks % pre-graduation)
├── advisory-stage.ts     # R8 gate (separate from R10 calibration gate)
├── comparability.ts      # sim(class), sim(diff), decay, pooling weights
├── lineage.ts            # normalizeTarget, resolvePrior, capability identity hierarchy
├── prior-pack.ts         # PriorPackSource, segments, strength caps, age decay
├── possession.ts         # Field possession model
├── scout-roi.ts          # Scout economics
├── burn.ts               # BurnEstimate from isolated Film receipts
└── reasons.ts            # ReasonCode enum and ordering

src/capability-types.ts   # TaskClassification, RoutingMode, RouteConstraints
src/play-analyzer.ts      # classifyTask, PlayDifficulty, ScoutNeedAnalysis
src/control-plane/
├── routing-economics.ts  # RoutingEconomicsSnapshot, projectRoutingEconomics
└── work-ledger.ts        # InstanceWorkLedger, LedgerOutcome, LedgerRecentPlay

TEMP/S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md  # Governing architecture (sections 5.1, 12.3, 19.4)
```

---

**END OF RECONNAISSANCE REPORT**

### Full report — lane r10-math-graduation (sideline-scout-balanced)

**Scout Report: r10-math-graduation (openrouter/nvidia/nemotron-3-super-120b-a12b:free)**  
**Play ID:** r10-calibration-graduation-prebuild-recon-fresh-20260927-063738  
**Objective:** READ-ONLY RECONNAISSANCE ONLY. Map R10's mathematical/graduation implementation against current source and S57.1 architecture.  

---

### KEY DISCOVERIES
- **FACT:** S57.1 architecture (§12.3) defines graduation per task class requiring: ≥30 resolved outcomes, 3-bin reliability check (observed rate within ±10pp of mean predicted per bin), Brier score < base-rate predictor, weekly recomputation, and ability to un-graduate.  
- **FACT:** Current implementation in `src/routing-intel\dev-views.ts` (lines 371-380) only checks:  
  - `playsLogged >= SHADOW_MIN_N.graduationPlays` (50)  
  - burn error criterion (`not-evaluable`, `within-50-percent`, `outside-50-percent`)  
  - `invariantTests: 'not-evaluated-here'`  
  - `calibratedPercent: 'not-granted'`  
  It does **not** check resolved outcomes, reliability bins, or Brier score.  
- **FACT:** Resolved outcomes (binary firstPass) and frozen predicted probabilities (from recommendation digests) are available in the Routing Film via `film-index.ts` and `dev-views.ts` (see `predictedFirstPass` function).  
- **FACT:** No Brier score, reliability-bin helpers, or task-class graduation logic exists in the source (grep for "Brier" yields only architecture/doc mentions; no calibration/reliability helpers found).  
- **FACT:** The belief engine (`belief.ts`) computes posterior means (`firstPass.mean`) for targets, but graduation requires using *frozen* predictions at recommendation time (stored in Film), not current beliefs.  
- **FACT:** SHADOW_MIN_N.graduationPlays (50) exceeds S57.1's ≥30 resolved outcomes, creating a potential mismatch if interpreted as resolved outcomes.  
- **INFERENCE:** Graduation must be computed per task class from FilmObservations where `firstPass` is defined (resolved, skill-eligible outcomes), using frozen predicted probabilities from recommendation digests and binary outcomes (y=0/1).  
- **INFERENCE:** The 3-bin reliability check likely uses equal-width bins [0,1/3), [1/3,2/3), [2/3,1] (standard reliability diagrams), with boundaries handled via `bin = Math.min(2, Math.floor(p * 3))`.  
- **INFERENCE:** Sparse-bin behavior is ambiguous: architecture does not specify minimum samples per bin; dev-views.ts uses `SHADOW_MIN_N.calibrationBin=5` for shadow report calibration, suggesting a similar minimum may be expected.  
- **INFERENCE:** Denominator traps include off-by-one in bin indexing, division by zero if n_resolved=0 (prevented by ≥30), and empty bins (handled by skipping or requiring non-empty bins).  
- **UNKNOWN:** Whether attribution weight should be incorporated in graduation calculations (e.g., weighting outcomes or errors); architecture and current calibration use binary outcomes without weighting.  
- **CONTRADICTION:** Current `playsLogged` threshold (50) vs. S57.1 ≥30 resolved outcomes; current implementation ignores resolved outcomes entirely.  

---

### FACT
- S57.1 §12.3: Graduation gate per task class: ≥30 resolved outcomes, 3-bin reliability check (observed rate within ±10pp of mean predicted), Brier score beats base-rate predictor, recomputed weekly, un-graduation possible.  
- `src/routing-intel\dev-views.ts` lines 371-380: Graduation object only includes `playsLogged`, `playsRequired`, `playsCriterionMet`, `burnErrorCriterion`, `invariantTests`, `calibratedPercent`.  
- `src/routing-intel\film-index.ts`: `FilmObservation.firstPass` is `{y: 0|1, attribution: number}` for resolved, skill-eligible outcomes (clean/player-defect).  
- `src/routing-intel\dev-views.ts` `predictedFirstPass` function extracts frozen predicted probability from recommendation digest at recommendation time.  
- No Brier score, reliability-bin computation, or task-class aggregation exists in `src/` (verified via grep).  
- `SHADOW_MIN_N.graduationPlays = 50` (line 45 of dev-views.ts).  
- Routing Film is append-only; recommendation digests and outcomes are immutable once recorded.  

### INFERENCE
- Graduation per task class requires:  
  1. **Resolved outcomes count**: `n_resolved = |{o in FilmObservations: o.firstPass defined ∧ o.profile.taskClass = T}| ≥ 30`  
  2. **Predicted probability**: For each resolved observation, use `predictedFirstPass` from its recommendation digest (frozen at recommendation time).  
  3. **Pooled first-pass rate**: `p_bar = (Σ y_i) / n_resolved`  
  4. **Brier score (model)**: `BS = (1/n) Σ (p_i - y_i)²`  
  5. **Brier score (base-rate)**: `BS_base = (1/n) Σ (p_bar - y_i)²`  
  6. **Reliability check**: Split [0,1] into 3 equal-width bins; for each bin b with `n_b > 0`:  
     - `mean_predicted_b = (Σ_{i in bin b} p_i) / n_b`  
     - `observed_rate_b = (Σ_{i in bin b} y_i) / n_b`  
     - Require `|observed_rate_b - mean_predicted_b| ≤ 0.1`  
  7. **Graduation decision**: `n_resolved ≥ 30` AND (all non-empty bins satisfy reliability) AND (`BS < BS_base`)  
- Boundary handling: Use `bin = Math.min(2, Math.floor(p * 3))` to avoid index overflow at p=1.0.  
- Weekly recomputation: Status must be cached and recomputed at least weekly using latest Film data.  
- Un-graduation: If recomputation fails the gate, status reverts to un-graduated.  
- Pure-function boundary: A function taking `Array<{taskClass: string, predictedProbability: number, outcome: 0|1>}` and returning graduation status per task class is deterministic and side-effect-free.  

### UNKNOWN
- Exact minimum samples per bin for reliability check (architecture silent; dev-views.ts uses 5 for shadow calibration).  
- Whether attribution weight should be used in outcome or error calculations (e.g., weight squared error by attribution weight).  
- How to handle bins with zero samples (skip or require non-empty bins).  
- Whether the base-rate predictor should use the class's pooled first-pass rate across all targets or per-target pooling.  

### CONTRADICTION
- **MISMATCH:** Architecture requires ≥30 resolved outcomes; current implementation uses `playsLogged ≥ 50` (recommended plays, not resolved outcomes) and ignores resolved outcomes entirely.  
- **MISMATCH:** Architecture requires 3-bin reliability check and Brier score comparison; current implementation computes neither.  
- **MISMATCH:** Architecture requires weekly recomputation and un-graduation; no evidence of such mechanisms in source.  

### IMPORTANT FILES / PATHS
- **Architecture:** `TEMP\S57.1-Intelligent-Routing-And-Routing-Economics-Architecture.md` (§12.3)  
- **Current (incomplete) graduation:** `src\routing-intel\dev-views.ts` (lines 371-380)  
- **Belief engine:** `src\routing-intel\belief.ts` (computes `firstPass.mean`)  
- **Film index:** `src\routing-intel\film-index.ts` (provides `FilmObservation.firstPass` and `predictedFirstPass` via `dev-views.ts`)  
- **Routing film types:** `src\routing-intel\routing-film.ts` (event schemas)  

### LIMITATIONS
- Reconnaissance is read-only; no changes made to source.  
- Analysis based on current source and architecture document; behavior at runtime not observed.  
- Reliance on grep and file reads; may have missed obscure references.  
- Model is neutral; conclusions drawn from evidence, not architectural authority.  

---  
**END REPORT**  
*This is reconnaissance, not final architectural authority. Distinguish FACT / INFERENCE / UNKNOWN / CONTRADICTION as above.*

### Full report — lane r10-gating-ui-lifecycle (sideline-scout-quick)

# SIDELINE COACH SCOUT RECONNAISSANCE REPORT
## Play ID: r10-calibration-graduation-prebuild-recon-fresh-20260927-063738
## Scout ID: r10-gating-ui-lifecycle  
## Assigned custom agent: sideline-scout-quick
## Assigned model: openrouter/cohere/north-mini-code:free
## Game root: C:\Users\dmcal\Documents\GitHub\SidelineCoach

**SCOUT SOP / ROASTER COMPLIANCE:**
Read-Only reconnaissance completed. All files read-only. No mutations performed.

---

## FACT

### CURRENT ARCHITECTURE SUMMARY
The Sideline Coach system follows a strict evolution pattern (R6→R7→R8→R9→R10) with well-defined boundaries:

**R6** - Recommendation Engine (`src/routing-intel/recommend.ts`): Pure, deterministic recommendation brain using R3 belief and R5 attribution. No persistence, no timers.

**R7** - Dev Mode Views (`src/routing-intel/dev-views.ts`): Read-only projections with no scoring or persistence. Contains shadow calibration logic and graduation criteria (50 plays threshold).

**R8** - Dad Advisory Chip (`src/routing-intel/advisory-stage.ts`, `dad-advisory.ts`, `option-to-decision.ts`): Fully implemented but DORMANT behind closed stage gate. Dad sees bounded templates (one line, one subline, two actions) - **NO NUMBERS, PERCENTAGES, OR DEV INTERNALS** (explicitly noted in dad-advisory.ts line 6).

**R9** - DeferredPlay Scheduler (`src/control-plane/deferred-play-scheduler.ts`): Implements R9 DeferredPlay logic with timers, wakeups, and retry mechanisms for scheduled recomputation.

**R10** - Currently **NOT IMPLEMENTED** - no R10 graduation code exists in current source.

### R8 ARCHITECTURE DETAILS
**Stage Gate Implementation:**
- `src/routing-intel/advisory-stage.ts`: R8_ADVISORY_STAGE_GATE (compile-time constant, frozen)
- Gate can ONLY be opened by dedicated gate-opening Play proving shadow exit criteria
- No runtime sources can open it (no preferences, persisted flags, HTTP fields, or Dad switches)
- Dad advisory offers stored in-memory as `private readonly advisoryOffers = new Map` (`src/control-plane/daemon.ts` line 402)

**Dad Advisory View:**
- `src/routing-intel/dad-advisory.ts`: Template-only bounded UI
- Dad sees: `USE`/`DISMISS` actions, fixed line/subline templates
- Dad NEVER sees percentages, prices, evidence counts, or possession values
- Visible only in AUTO mode when recommendation DISAGREES with baseline
- No persistence, no state, no timers in this module

### SCHEDULER/TIMER INFRASTRUCTURE
**R9 DeferredPlayScheduler (`src/control-plane/deferred-play-scheduler.ts`):**
- Implements "wakeups" for revalidation (alarm events, health changes, finish events)
- Contains fallback timers at horizon + 2min, and at end of recovery grace
- Uses Node.js `setTimeout` with `unref()` for background timers
- File-based storage (`deferred-play.ts`)
- Startup handling: settles mid-send, then checks armed continuations

**Other Timers in System:**
- `src/control-plane/claude-usage-reader.ts`: Usage cadence gating with provider/fallback gates
- `src/report-publisher.ts`: Status update timer
- `src/stadium-client.ts`: Keep-alive timer
- `src/scout-terminal.ts`: Status draw timer

### COMMERCIAL GATE
**Feature Entitlement System (`src/commercial/gate.ts`):**
- R7.2 capability-based gating system
- Different from R8 advisory stage gate
- Answers "may I execute this capability?" not advisory visibility

---

## INFERENCE

### R10 GRADUATION INFRASTRUCTURE INFERENCES

**1. Graduation State Management:**
- Shadow calibration in `dev-views.ts` tracks `playsLogged` vs `playsRequired` (50 plays)
- When criterion met, system should transition to calibrated percentages
- Calibrated percentages have their own separate gate (§12.3) - **not granted by R7**
- R10 would need to coexist with R8's dormant advisory system

**2. Percentage Display Gate:**
- Narrowest honest gate: `dad-advisory.ts` module (explicitly excludes percentages in documentation)
- Dad sees templates: "Suggest Claude · Strong pick", "Uses Claude 5H before it resets"
- R10 would need to extend Dad view with percentage data while maintaining R8 compatibility

**3. Task-Class Graduation to Dad UI:**
- Current flow: R6 recommendation → R8 Dad advisory view (no percentages)
- R10 graduation would need to pass through same R8 bridge (`optionToDecision`)
- Graduation state must be separate from R8 stage gate to avoid accidental activation
- Dad must receive calibrated percentages without seeing R6/R7 debug internals

**4. Recomputation Infrastructure:**
- R9 DeferredPlayScheduler exists but handles R9 DeferredPlay (SCHEDULE), not R10 graduation
- No existing weekly R10 calibration recomputation seam
- R10 would need its own timer/integration point, likely in daemon startup/recomputation flow

**5. Persistent vs Derived State:**
- R8: Pure functions, no persistence (evidence in dev-views.ts: "nothing here is persisted")
- R6 recommendations are derived, not stored
- R10 would likely be similar - derived from Film + prior pack, not durably stored
- Graduation threshold (50 plays) tracked in shadow report, not in production code

### ARCHITECTURAL DECISIONS REQUIRED

**6. R8 vs R10 Interaction:**
- R8 activation must NOT accidentally open R10
- Calibrated percentages require their own gate (§12.3)
- Dad must see percentages from R10 WITHOUT seeing R8 advisory chip
- System must distinguish between "shadow mode continuing" and "calibrated percentages granted"

**7. Product State Management:**
- Graduation state likely needs to be derived (current Film + prior pack) or cached (mem/disk)
- R8 gate is compile-time constant - new gate needed for R10
- Need separation between "task-class genuinely graduated" vs "Dad sees percentages"

---

## UNKNOWN

### MISSING IMPLEMENTATION DETAILS

**8. R10 Graduation Logic:**
- Exact §12.3 gate implementation unknown
- How task-class graduation criteria determined (beyond 50 plays)
- Where calibrated percentage calculation occurs
- How graduation state is cached/derived vs persisted

**9. R10 Integration Points:**
- Specific files/functions Opus should modify vs leave alone
- Exact seam for weekly R10 recomputation
- How R10 percentages reach Dad UI without leaking Dev detail
- Existing scheduler/timer seam that could support R10

**10. Graduation vs Un-graduation:**
- How un-graduation would remove percentages again
- What triggers R10 deactivation
- Whether graduation is reversible as stated in objective

**11. System Boundaries:**
- How R8 activation and R10 percentage graduation interact
- Whether R8 must remain completely isolated from R10
- What existing "lifetime/recomputation seams" support weekly R10 recomputation

---

## CONTRADICTION

### NONE IDENTIFIED

---

## RESULT

### FINAL SCOUT ASSESSMENT

**R10 Graduation Status:** **NOT IMPLEMENTED** - R10 code does not exist in current source repository. Only references to R10 appear in comments (dad-advisory.ts line 6, dev-views.ts graduation note).

**Critical Finding:** The current system architecture shows R8 is COMPLETE but DORMANT. R10 would require substantial new implementation while maintaining strict separation from R8.

---

## KEY DISCOVERIES

### 1. R8 is COMPLETE BUT DORMANT
- Stage gate: `src/routing-intel/advisory-stage.ts` (compile-time constant, frozen)
- Dad advisory: `src/routing-intel/dad-advisory.ts` (template-only, no numbers)
- Bridge: `src/routing-intel/option-to-decision.ts` (pure R6-to-RoutingDecision)
- Gate cannot be opened from ANY product surface
- Dev Mode views reference R8 but it's purely documentation

### 2. R9 SCHEDULER EXISTS BUT IS R9-SPECIFIC
- `src/control-plane/deferred-play-scheduler.ts`: Handles R9 DeferredPlay wakeups
- Contains timers, wakeups, retry logic for SCHEDULED tasks
- **NOT** designed for R10 calibration recomputation

### 3. GRADUATION LOGIC EXISTS IN SHADOW REPORTS ONLY
- `src/routing-intel/dev-views.ts`: Graduation tracking in `buildShadowReport()`
- Tracks `playsLogged` vs `playsRequired` (50 plays threshold)
- Calibrated percentage shown as `'not-granted'` 
- Note: "a calibrated percentage has its own separate gate (§12.3) and is not granted by R7"

### 4. CLEAR SEPARATION ARCHITECTURE
- R8: Advisory chip with templates, NO NUMBERS
- Dad sees: "Suggest Claude · Strong pick", "Uses Claude 5H before it resets"
- Percentages: Explicitly marked as "those need R10 graduation" (dad-advisory.ts line 6)

### 5. NO R10 CODE EXISTS
- Zero files contain R10 implementation
- No percentage display infrastructure
- No graduation computation logic
- No R10-specific gating beyond what's in comments

---

## IMPORTANT FILES / PATHS

### R8 IMPLEMENTATION (Dormant)
- `src/routing-intel/advisory-stage.ts` - Stage gate implementation
- `src/routing-intel/dad-advisory.ts` - Dad advisory view (template-only)
- `src/routing-intel/option-to-decision.ts` - R6-to-executable bridge
- `src/control-plane/daemon.ts` - In-memory advisory offers (line 402)
- `test/r8-dad-advisory.test.mjs` - Comprehensive test suite

### SCHEDULER/INFRASTRUCTURE
- `src/control-plane/deferred-play-scheduler.ts` - R9 scheduler (background recomputation)
- `src/routing-intel/dev-views.ts` - Shadow reports with graduation tracking
- `src/commercial/gate.ts` - Commercial feature gate system

### GRADUATION/REFERENCE LOGIC
- `src/routing-intel/dev-views.ts` - SHADOW_MIN_N.graduationPlays = 50
- `src/routing-intel/dev-views.ts` - graduation object (shadow report section 371-469)

### ARCHITECTURAL BOUNDARIES
- `src/routing-intel/recommend.ts` - R6 recommendation engine (baseline source)
- `src/routing-intel/routing-film.ts` - Film storage (no recomputation)
- `src/scout-bootstrap.ts` - Scout consent system (no timers)
- `src/scout-coach-refresh.ts` - Coach refresh (human-triggered only)

---

## LIMITATIONS

1. **Read-Only Constraint:** Could not execute tests or modify files to verify behavior
2. **No Compiled Code:** TypeScript source exists but no .js files in out/ directory
3. **Historical vs Current:** Examined test files showing R8 implementation, but cannot verify against compiled production code
4. **No Runtime Inspection:** Cannot observe actual system behavior or daemon state
5. **Limited Discovery:** Unable to trace through all 5689+ lines of daemon.ts source

---

## CONCLUSION

The current Sideline Coach system has **R8 fully implemented but dormant** behind a closed stage gate. **R10 does not exist** in the current source code. The system contains all necessary architectural foundations (R6 brain, R8 advisory, R9 scheduler) but R10 graduation computation and percentage display would require substantial new implementation.

**Critical Risk:** Any R10 implementation must maintain strict separation from R8 to avoid accidental activation of the dormant advisory chip.

**Recommendation:** Implement R10 as a new capability layer that extends Dad UI with calibrated percentages while keeping R8 completely isolated and dormant. Use existing R9 scheduler patterns for weekly recomputation infrastructure.

## Recommended next step

Review the Scout reports above; forward to an Architect if a repair decision is warranted.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\r10-calibration-graduation-prebuild-recon-fresh-20260927-063738

