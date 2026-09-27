# SCOUT REPORT

**REPORT TYPE:** SCOUT REPORT

**SCOUT AGENT:** OpenCode

**SCOUT MODEL:** openrouter/cohere/north-mini-code:free

**SCOUT REASONING / EFFORT:** Medium

**SCOUT ROLE:** Read-Only Reconnaissance Scout

**SCOUT SCOPE:** Lane 2 investigation of existing player scorecards, outcomes, fix attribution, and cost evidence in Sideline Coach repository

**RECONNAISSANCE DEPTH:** Standard

**SCOUT DATE / TIMESTAMP:** 2026-09-25_182712_MDT

---
**This report is reconnaissance, not final architectural authority.**

# EXECUTIVE MAP

Investigation of existing Sideline Coach terrain for future Intelligent Routing / Routing Economics engine data collection requirements. Focus on Lane 2: SCORECARDS / OUTCOMES / FIX ATTRIBUTION / COST EVIDENCE.

# QUESTION INVESTIGATED

What player scorecard, outcome, and cost evidence currently exists in Sideline Coach that could support statistically informed Player Scorecards and cost-aware routing decisions?

# CURRENT TRUTH

Sideline Coach currently maintains a sophisticated Scout ecosystem with extensive evidence collection capabilities. Key findings indicate substantial existing infrastructure that partially addresses future Intelligent Routing requirements.

# EVIDENCE MAP

## EXISTING PLAYER SCORECARD DATA

**FACT:** Sideline Coach maintains 27 durable prospect scorecards in `REPORTS/Scout Only/Combine/Scorecards/`.

**EXAMPLE CARD:** `openrouter-cohere-north-mini-code-free.json`
- **Exact file:** `REPORTS/Scout Only/Combine/Scorecards/openrouter-cohere-north-mini-code-free.json`
- **Fields captured:** provider, model, displayName, firstSeen, lastSeen, lastTryoutAt, currentStatus, totals (starts/completions/failures/providerFailures/rateLimitFailures/authFailures/blocked), routeAttempts, latestEvidencePaths, latestObservedRoute, notes
- **Status values:** READY, CALL BACK LATER, LIMITED, UNAVAILABLE, AUTH ISSUE, RATE LIMITED, PROVIDER UNSTABLE

**FACT:** Combine scorecards accumulate evidence across multiple tryout runs and never erase prior data.

**EXAMPLE VERIFICATION:** `REPORTS/Scout Only/Player Verification/antigravity.json`
- **Player verification state:** READY with provider credentials and model configuration
- **Authority tracking:** VERIFIED status for read-only contract, real game read, lifecycle, and report contract compliance

## EXISTING PLAY OUTCOME DATA

**FACT:** Scout Formation runs create detailed completion evidence in `REPORTS/Scout Only/Scout-Formation__<timestamp>/`.

**EXAMPLE:** Recent formation `Scout-Formation__2026-09-17_075139_921_MDT/FORMATION-COMPLETE.json`
- **Play tracking:** Unique formation IDs, canonical hashes, semantic prompt hashes
- **Timing evidence:** startAt, endAt, durationMs for each attempt
- **Outcome classification:** COMPLETE/PARTIAL/BLOCKED/FAILED/UNKNOWN with detailed synthesis
- **Candidate evaluation:** considered/selected lists with eligibility reasons
- **Failure boundaries:** provider errors, infrastructure blocks, contract violations

**FACT:** Combine runs create parallel evidence in `REPORTS/Scout Only/Combine/Runs/<id>/` with detailed attempt telemetry.

## FIX / REPAIR ATTRIBUTION

**FACT:** Substitution engine tracks repair decisions in `scout-substitution.ts` with detailed failure classification.

**LIMITATION:** Player-caused repair attribution is NOT directly tracked - only failure types are recorded (provider/auth/rate-limit vs infrastructure).

**INFERENCE:** Future architecture would need explicit tracking of:
- Requirement changes vs environment failures vs upstream changes
- Player-specific repair patterns vs generic infrastructure issues
- Retry effectiveness and substitution success rates

## RESOURCE-COST DATA CURRENTLY AVAILABLE

**FACT:** No explicit provider cost tracking exists in current codebase.

**FACT:** Rate limit/quota events are tracked in ScoutAttemptTelemetry as `rateLimitOrQuotaEvent` but not cost-calculated.

**FACT:** Provider credential availability is tracked but not resource consumption.

**UNKNOWN:** Economic optimization opportunities cannot be measured without cost data.

# WHAT CAN BE DERIVED SAFELY

## From Existing Evidence:
1. **Model Performance Trends:** Scorecard totals across multiple providers/models
2. **Availability Patterns:** Status transitions and failure classification
3. **Execution Timeline:** Attempt timing and duration metrics
4. **Eligibility Evolution:** Readiness changes and qualification evidence
5. **Failure Pattern Analysis:** Provider vs infrastructure failure rates

## What Cannot Be Derived:
1. **Player-Caused Fix Attribution:** No mechanism to distinguish player-specific vs environmental failures
2. **Economic Cost Optimization:** No provider cost or credit consumption tracking
3. **5H/Weekly State Management:** No resource window tracking or reset horizon data
4. **Context Continuity:** Limited evidence about session persistence or state changes

# WHAT IS NOT CURRENTLY RECORDED

## Critical Evidence Gaps:
1. **Resource Cost Metrics:** No tracking of provider costs, credits used, or rate limit consumption
2. **Player-Caused Repair Attribution:** Cannot distinguish requirement changes from environment failures
3. **5H/Weekly State Management:** No resource window allocation or reset tracking
4. **Substitution Effectiveness:** No data on repair success rates vs original failures
5. **Context Persistence:** Limited evidence about session continuity or state changes
6. **Business Metric Integration:** No revenue impact or customer value tracking

# MINIMUM FUTURE EVIDENCE GAPS

## Required for Intelligent Routing:
1. **Provider Cost Tracking:** Credit consumption, request rates, quota usage
2. **Player-Repair Attribution:** Distinguish player-caused vs environmental failures
3. **Resource Window Management:** 5H and weekly state tracking
4. **Substitution Success Metrics:** Repair effectiveness and cost comparison
5. **Session Context Continuity:** State persistence and continuity evidence
6. **Economic Outcome Integration:** Resource burn vs value delivered

## Data Schema Expansion Needed:
```json
{
  "playId": "...",
  "player": "...",
  "model": "...",
  "provider": "...",
  "resourceCost": {
    "providerCost": "...",
    "rateLimitConsumed": "...", 
    "creditsUsed": "...",
    "5HwindowUsed": "...",
    "weeklyWindowUsed": "..."
  },
  "repairAttribution": {
    "playerCaused": "true|false",
    "repairType": "requirement|environment|upstream|missingContext",
    "repairSuccessful": "true|false"
  },
  "contextState": {
    "sessionContinuity": "...",
    "priorExperience": "...",
    "sessionDepth": "..."
  }
}
```

# ARCHITECT DECISIONS REQUIRED

## Core Architecture Questions:
1. **Cost Integration:** Should economic optimization be built atop current provider tracking, or does Sideline need dedicated cost collection?
2. **Attribution Logic:** What evidence sources can reliably distinguish player-caused vs environmental failures?
3. **Resource Window Management:** How should 5H and weekly reset horizons integrate with existing Scout scheduling?
4. **Substitution Economics:** Should repair decisions consider cost-benefit analysis of substitutions?
5. **Data Lifecycle:** How long should economic and attribution data be retained vs operational telemetry?

## Implementation Strategy:
**PHASE 1:** Build minimal evidence collection to support basic economic optimization
**PHASE 2:** Add player-repair attribution using existing failure classification
**PHASE 3:** Integrate resource window tracking and economic metrics
**PHASE 4:** Add context continuity and substitution effectiveness tracking

# RISKS / BOUNDARIES

## Technical Risks:
1. **Provider API Changes:** Cost tracking may break if provider billing APIs change
2. **Data Privacy:** Economic metrics may expose sensitive provider information
3. **Performance Impact:** Additional evidence collection may slow Scout operations

## Business Risks:
1. **ROI Measurement:** Cannot measure Scout economic value without cost data
2. **Player Experience:** Poor repair attribution may lead to suboptimal routing
3. **Resource Waste:** Inefficient repair attribution may waste provider resources

# RECOMMENDED NEXT AGENT / MODEL / EFFORT

**IMMEDIATE (Standard Scout):**
- Continue investigating specific evidence gaps in repair attribution
- Examine any existing test data for failure classification patterns

**DEEPER (Nemotron 3 Ultra):**
- Reconstruct cross-subsystem integration points for economic data collection
- Identify all seams where cost/resource data currently drops off
- Map required schema expansions for future Intelligent Routing engine

**EDITORIAL:**
- This reconnaissance should inform architectural decisions about evidence collection scope
- Focus on minimal viable evidence for economic routing optimization

# WHAT THE FUTURE ARCHITECT SHOULD VERIFY

1. **Existing Evidence Sufficiency:** Review test scenarios to validate current evidence completeness
2. **Provider API Access:** Confirm economic data availability from current provider integrations
3. **Cost Attribution Feasibility:** Investigate whether provider billing data can be mapped to Scout usage
4. **Repair Attribution Sources:** Identify reliable signals for player-vs-environment failure classification

# WHAT THE FUTURE ARCHITECT SHOULD NOT NEED TO REDISCOVER

1. **Current Evidence Location:** Scout reports and test files already document existing capabilities
2. **Architecture Overview:** Current source code and documentation describe existing Scout infrastructure
3. **Evidence Collection Mechanisms:** Combine and Formation engines already implement evidence collection

# WAS / IS / WILL BE

**WAS:** Scout infrastructure was manually discovering providers and maintaining basic tryout counters
**IS:** Current Scout system provides extensive evidence collection via scorecards, formation runs, and player verification
**WILL BE:** Future Intelligent Routing will require expanded economic and attribution evidence beyond current collection scope

# SCOUT LIMITATIONS

This reconnaissance was performed by Cohere North Mini Code Free with Medium reasoning effort. Key limitations:

1. **Depth Scope:** Focused on reading existing source files and test evidence, not executing Scout formations
2. **Economic Analysis:** Cannot evaluate provider costs without access to actual API pricing or billing data
3. **Player Behavior:** Cannot infer player-specific repair patterns without runtime player behavior data
4. **Future Design:** Cannot design final Intelligent Routing architecture per bounded objective requirements

**RECOMMENDED NEXT STEP:** A deeper Sonnet-class Architect should analyze this evidence compression and recommend specific architectural expansions for economic routing optimization.

---

**Scout completed bounded reconnaissance for Lane 2 SCORECARDS/OUTCOMES/FIX ATTRIBUTION/COST EVIDENCE.** The existing Sideline Coach infrastructure provides substantial foundation for future Intelligent Routing, but significant evidence gaps remain in economic metrics, player-repair attribution, and resource window management.
