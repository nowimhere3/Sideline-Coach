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
