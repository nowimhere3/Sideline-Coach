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
