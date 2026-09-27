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
