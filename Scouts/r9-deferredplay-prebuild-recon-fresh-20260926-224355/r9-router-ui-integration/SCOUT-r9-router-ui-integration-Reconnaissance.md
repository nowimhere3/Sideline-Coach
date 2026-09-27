REPORT TYPE: SCOUT REPORT

SCOUT AGENT: sideline-scout-quick
SCOUT MODEL: openrouter/cohere/north-mini-code:free
SCOUT REASONING / EFFORT: Medium (standard reconnaissance following Sideline Coach SOP)
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE: R8/R9 router/browser UI seams investigation, Player status presentation, notification/cancellation patterns, API/daemon seam mapping
RECONNAISSANCE DEPTH: Standard

# Executive Map

This Scout Report investigates the existing R8/Router/browser UI seams that R9 will need, focusing on the six specific questions provided in the reconnaissance objective. The investigation covers `optionToDecision`, `wait-for-reset` representation, Dad advisory flows, `router.routePlay` dispatch paths, PlayQueue handoff, Player pills/status presentation, notification patterns, cancellation actions, and daemon HTTP/API patterns.

# Question Investigated

Map the existing R8 / router / browser UI seams that R9 will need, with specific focus on the six strategic questions about Player pill/status surfaces, canonical resource truth, state duplication minimization, API seam reuse, architectural boundaries, and files/functions that should be known before UI placement.

# Current Truth

The investigation reveals several key findings:

1. **R8 is implemented but dormant** with a closed stage gate that prevents activation from any product surface
2. **`optionToDecision`** exists as a pure, deterministic bridge function in `src/routing-intel/option-to-decision.ts` that refuses `wait-for-reset` options (noting "R9 owns DeferredPlay / SCHEDULE")
3. **RouteOption `wait-for-reset`** is represented in the recommendation engine with `kind: 'wait-for-reset'` but is explicitly refused by `optionToDecision`
4. **Dad advisory flow** exists behind closed gates in `src/routing-intel/dad-advisory.ts` and `src/routing-intel/advisory-stage.ts`
5. **Router.routePlay dispatch** is implemented in `src/control-plane/router.ts` with comprehensive dispatch logic including queuing, manual routing, and Scout handling
6. **PlayQueue handoff** is implemented in `src/control-plane/play-queue.ts` with states: `queued`, `dispatching`, `needs-attention`
7. **Player status presentation** is handled through `src/player-roster.ts` with `status()` method projecting player cards
8. **Notification patterns** are implemented in `src/control-plane/alarm-engine.ts` for AI usage alerts
9. **Cancellation actions** exist via `/api/queue/*/cancel` routes and `PlayQueue.cancel()` method
10. **Daemon HTTP/API patterns** are implemented through `src/control-plane/daemon.ts` with extensive RPC handling

# Evidence Map

## Key Files / Symbols / Ownership Seams

### 1. optionToDecision Bridge
**FILE:** `src/routing-intel/option-to-decision.ts`
**FUNCTION:** `export function optionToDecision(...)`
**EVIDENCE:** Line 63 explicitly refuses `wait-for-reset`: `if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');`
**SIGNIFICANCE:** R8's single advice-to-decision bridge, pure and deterministic, explicitly delegates `wait-for-reset` to R9

### 2. RouteOption wait-for-reset Representation  
**FILE:** `src/routing-intel/recommend.ts`
**TYPE:** `kind: 'send' | 'queue' | 'handoff' | 'scout-first' | 'wait-for-reset'`
**EVIDENCE:** Line 216 defines the union type; line 867 shows generation logic: `kind: 'wait-for-reset'`
**SIGNIFICANCE:** Wait-for-reset is a first-class RouteOption kind in recommendations but refused by optionToDecision

### 3. Dad Advisory / Staged-route Flow
**FILE:** `src/routing-intel/dad-advisory.ts`
**FUNCTION:** `dadAdvisoryView(...)`
**EVIDENCE:** Line 56: `if (!primary || primary.kind === 'wait-for-reset') return undefined;`
**SIGNIFICANCE:** Dad advisory explicitly ignores wait-for-reset options

### 4. router.routePlay / dispatch path
**FILE:** `src/control-plane/router.ts`
**CLASS:** `ControlPlaneRouter`
**FUNCTION:** `dispatch(...)`
**EVIDENCE:** Lines 267-752 implement comprehensive dispatch logic including queuing, manual routing, and Scout handling
**SIGNIFICANCE:** Central dispatch implementation with feature gates, PlayQueue integration, and comprehensive error handling

### 5. PlayQueue handoff
**FILE:** `src/control-plane/play-queue.ts`
**CLASS:** `PlayQueue`
**FUNCTION:** `cancel(id: string, gameId?: string): QueuedPlay | undefined`
**EVIDENCE:** Lines 178-184 implement cancellation; lines 22-42 define QueuedPlay states
**SIGNIFICANCE:** Durable queue store with cancellation API at `/api/queue/*/cancel`

### 6. Player pills / Player status presentation
**FILE:** `src/player-roster.ts`
**CLASS:** `PlayerRoster`
**FUNCTION:** `status(activeGameId?: string)`
**EVIDENCE:** Lines 444-511 project player cards for UI presentation
**SIGNIFICANCE:** Central player status projection including controlled players, virtual players, and field states

### 7. report/status/info affordances around Players
**FILE:** `src/public/index.html` (frontend)
**EVIDENCE:** Multiple status rendering functions in browser including `renderStatus()`, `renderPlayerStrips()`
**SIGNIFICANCE:** Browser consumes daemon status and renders Player cards with various states

### 8. existing notification / needs-attention UI patterns
**FILE:** `src/control-plane/alarm-engine.ts`
**CLASS:** `AlarmEngine`
**EVIDENCE:** Lines 22-36 define AiAlarmEvent structure; lines 220-225 deliver events to callbacks
**SIGNIFICANCE:** AI usage notification system with threshold escalation and recovery events

### 9. cancellation actions
**FILE:** `src/control-plane/remote-routes.ts`
**EVIDENCE:** Line 55: `{ methods: ['POST'], path: /^\\/api\\/queue\\/[^/]+\\/(?:cancel|retry)$/, access: 'remote-mutate' }`
**SIGNIFICANCE:** Remote API cancellation route definition

### 10. daemon HTTP/API patterns
**FILE:** `src/control-plane/daemon.ts`
**CLASS:** `ControlPlaneDaemon`
**EVIDENCE:** Lines 940-950 show WebSocket upgrade handling; comprehensive RPC handling throughout
**SIGNIFICANCE:** Central daemon with HTTP API, WebSocket relay, and extensive RPC protocol handling

# FACTS

1. **`optionToDecision` exists and is pure/deterministic**
   - FILE: `src/routing-intel/option-to-decision.ts`
   - FUNCTION: `optionToDecision(rec, option, ctx)`
   - LINE: 57-165
   - CONFIRMED: Implementation present and tested

2. **RouteOption `wait-for-reset` is defined but refused**
   - FILE: `src/routing-intel/recommend.ts`
   - TYPE: `kind` union includes `'wait-for-reset'`
   - FILE: `src/routing-intel/option-to-decision.ts`
   - LINE: 63: `if (option.kind === 'wait-for-reset') return refuse('wait-not-actionable');`
   - INFERENCE: R9 explicitly owns DeferredPlay/SCHEDULE for wait-for-reset

3. **Dad advisory stage gate exists and is closed**
   - FILE: `src/routing-intel/advisory-stage.ts`
   - TYPE: `AdvisoryStageGate`
   - REPORT: `S57.20-R8-Dad-Mode-Advisory-Routing-Implementation.md` line 32: "The §19.4 criteria were not weakened, no shadow evidence was invented, and R8 does not become active in this Play"

4. **Router.routePlay dispatch is comprehensive**
   - FILE: `src/control-plane/router.ts`
   - CLASS: `ControlPlaneRouter`
   - FUNCTION: `dispatch(options)`
   - CONFIRMED: Full implementation with PlayQueue integration, Scout handling, and commercial gates

5. **PlayQueue cancellation API exists**
   - FILE: `src/control-plane/play-queue.ts`
   - FUNCTION: `cancel(id: string, gameId?: string)`
   - LINE: 178-184
   - REMOTE: `/api/queue/*/cancel` endpoint documented in `src/control-plane/remote-routes.ts`

6. **Player status presentation is centralized**
   - FILE: `src/player-roster.ts`
   - FUNCTION: `status()`
   - CONFIRMED: Projects controlled players, virtual players, field states for UI consumption

7. **Notification system exists for AI usage**
   - FILE: `src/control-plane/alarm-engine.ts`
   - CLASS: `AlarmEngine`
   - CONFIRMED: AI usage alarm system with threshold events and delivery mechanisms

8. **Daemon has WebSocket relay patterns**
   - FILE: `src/control-plane/daemon.ts`
   - LINE: 940-950: WebSocket upgrade handling
   - SIGNIFICANCE: Stadium communication pattern for R9 integration

# INFERENCES

1. **R9 Schedule contextual action should reuse existing notification patterns**
   - INFERENCE: AlarmEngine in `alarm-engine.ts` provides threshold-based notification delivery that could be adapted for scheduling
   - SUPPORT: AiAlarmEvent structure includes `remainingPercent`, `resetsAt`, `message` fields relevant to scheduling

2. **Player pill surfaces already know resource truth**
   - INFERENCE: `player-roster.ts` `status()` method projects canonical resource state including `modelDisplayName`, `effortDisplayName`, `controlState`
   - SUPPORT: Lines 480-494 show controlled player status includes active model/effort from PlayerControlHost

3. **Schedule/cancel actions require minimal duplicate state**
   - INFERENCE: PlayQueue already has cancellation via `cancel()` method; AlarmEngine has notification state
   - SUPPORT: PlayQueue tracks `state: 'queued' | 'dispatching' | 'needs-attention'` with `attention` field for human messages

4. **R9 can reuse daemon HTTP/API seams**
   - INFERENCE: Daemon implements comprehensive RPC pattern with `notification` handlers and WebSocket relay
   - SUPPORT: `daemon.ts:921-929` shows health evidence notification handler; existing WebSocket upgrade pattern

5. **Schedule in wrong layer would be dangerous**
   - INFERENCE: Putting Schedule in Router would duplicate PlayQueue functionality; putting in Player presentation would leak routing logic
   - SUPPORT: Architecture breadcrumb in `ARCHITECTURE-BREADCRUMBS.md:125`: "One derived Player Scoreboard, never one status enum"

6. **Council/Opus should know about these exact seams**
   - INFERENCE: R9 Schedule needs to integrate with existing queuing/cancellation patterns without architectural violations
   - SUPPORT: Multiple seams identified: PlayQueue, AlarmEngine, Router, PlayerRoster

# UNKNOWN

1. **Exact UI implementation details for schedule/cancel affordances**
   - UNKNOWN: How schedule/cancel will appear in browser UI vs. daemon API
   - LIMITATION: Frontend files exist but implementation details not examined in this reconnaissance

2. **Contextual scheduling trigger logic**
   - UNKNOWN: Specific conditions that should trigger schedule affordances
   - INFERENCE: Product idea mentions "when a relevant Player/resource limit is reached or a wait-for-reset option exists"

3. **R9 DeferredPlay integration points**
   - UNKNOWN: Where R9 DeferredPlay will connect to R8 existing seams
   - EVIDENCE: `option-to-decision.ts:11` notes "R9 owns DeferredPlay / SCHEDULE"

4. **Browser notification channel specifics**
   - UNKNOWN: Whether schedule notifications use AlarmEngine or separate channel
   - LIMITATION: AlarmEngine exists but browser notification routing not examined

5. **Minimal state duplication requirements**
   - UNKNOWN: Exact scope of state that Schedule would need to duplicate
   - INFERENCE: PlayQueue already tracks scheduling state; AlarmEngine tracks notification state

# CONTRADICTIONS

1. **Terminal Player routing status**
   - CONTRADICTION: Some reports mention Terminal Player routing future (AUTO terminal routing for `git status` etc.)
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:754` states "CONTRADICTED. Q2.9C's single-legacy branch never sees a playerType: 'terminal' candidate because it is filtered out at routing-policy.ts:330"
   - SIGNIFICANCE: Terminal routing appears blocked but product direction suggests future need

2. **Dev Mode settings vs. Advanced Player Discovery visibility**
   - CONTRADICTION: Dev Mode settings may conflict with Advanced Player Discovery gates
   - EVIDENCE: `terminal-ux-routing-recon-20260920-113635-fresh-20260920-150907:83` shows `projectDiscovery(discovery, preferences.runningPlayers)` with Dev Mode gating
   - SIGNIFICANCE: Settings visibility conflicts could impact R9 Schedule affordance discovery

# Architecture Decisions Still Required

1. **Schedule Affordance Placement Layer**
   - QUESTION: Should Schedule be in Router layer (reuse queuing), Player presentation layer (contextual), or new layer?
   - EVIDENCE: Product idea favors "contextual Player/resource action rather than permanent global Dispatcher button"
   - RISK: Wrong layer choice would duplicate state or break architectural boundaries

2. **Notification Channel Integration**
   - QUESTION: Should Schedule use AlarmEngine notifications or separate channel?
   - EVIDENCE: AlarmEngine exists for AI usage; Schedule would need resource limit notifications
   - ARCHITECTURAL: Mixing scheduling with usage alerts could confuse user attention

3. **Player Pill State Management**
   - QUESTION: Should Player pills show Schedule state or rely on separate notification?
   - EVIDENCE: PlayerRoster.status() already projects rich state including controlled players
   - UX: Contextual vs. permanent UI pollution concern from product idea

4. **Cancel/Retry Semantics**
   - QUESTION: Should Schedule support cancel/retry or only defer?
   - EVIDENCE: PlayQueue already has cancel/retry; Schedule might need similar for resource limits
   - STATE: Would require extending current PlayQueue semantics beyond Play queuing

# What Does NOT Need Architecture

1. **Basic Player Status Surfaces**
   - ALREADY RESOLVED: PlayerRoster.status() already projects comprehensive player state for UI
   - SUPPORT: Lines 444-511 in `player-roster.ts` show existing rich player status projection

2. **Existing Notification Infrastructure**
   - ALREADY RESOLVED: AlarmEngine provides threshold-based notification delivery
   - SUPPORT: `alarm-engine.ts` implements complete event delivery system

3. **Cancellation Functionality**
   - ALREADY RESOLVED: PlayQueue.cancel() and `/api/queue/*/cancel` provide cancellation
   - SUPPORT: Implementation exists and is tested

4. **Router Dispatch Logic**
   - ALREADY RESOLVED: Router.dispatch() handles complex routing scenarios
   - SUPPORT: Comprehensive implementation with PlayQueue integration

# Risks / Boundaries

1. **Schedule State Duplication Risk**
   - RISK: Schedule could duplicate PlayQueue state if placed in wrong layer
   - BOUNDARY: Must respect existing queue semantics and not break durable truth

2. **Attention Pollution Risk**
   - RISK: Contextual Schedule affordances could overwhelm user attention if not properly gated
   - BOUNDARY: Product idea mentions "repeated explanatory prompting may diminish after user understands the pattern"

3. **Integration Complexity Risk**
   - RISK: Connecting R9 DeferredPlay to R8 existing seams requires careful seam mapping
   - BOUNDARY: Architecture breadcrumb warns against silent rerouting absent approved routing policy

4. **Notification Overload Risk**
   - RISK: Mixing Schedule notifications with AI usage notifications could confuse users
   - BOUNDARY: Need separate channels or clear categorization

5. **UI Layer Conflict Risk**
   - RISK: Schedule in Player presentation vs. Router layer creates ownership ambiguity
   - BOUNDARY: Architecture principles favor clear ownership boundaries

# Recommended Next Agent / Model / Effort

**SONNET-CLASS ARCHITECT / HIGH**
- **WHY:** Multiple meaningful choices remain around Schedule layer placement and integration points
- **WHAT REMAINS UNCERTAIN:** Exact UI placement, scheduling trigger logic, notification channel selection
- **WHY CHEAPER FIRST:** Standard reconnaissance found existing seams but architectural decisions require synthesis

# What the Future Architect Should Verify

1. **Schedule affordance placement layer**
   - Verify: Whether Schedule belongs in Router, Player presentation, or new layer
   - CHECK: Existing seams for reuse vs. architectural duplication risk

2. **Contextual scheduling trigger conditions**
   - Verify: Specific Player/resource limit conditions for Schedule affordances
   - CHECK: Integration with wait-for-reset option detection

3. **Notification channel integration strategy**
   - Verify: Whether Schedule uses AlarmEngine or separate notification system
   - CHECK: User attention patterns and notification categorization

4. **State management boundaries**
   - Verify: Minimal state duplication requirements for Schedule functionality
   - CHECK: PlayQueue, AlarmEngine, and Router existing state overlap

5. **R9 DeferredPlay integration points**
   - Verify: Exact connection points between R8 existing seams and R9 DeferredPlay
   - CHECK: Seam compatibility and architectural transition path

# What the Future Architect Should NOT Need to Rediscover

1. **Existing optionToDecision implementation**
   - ALREDY DOCUMENTED: Pure bridge function in `src/routing-intel/option-to-decision.ts`

2. **RouteOption wait-for-reset definition**
   - ALREDY DOCUMENTED: Wait-for-reset as first-class RouteOption kind

3. **Dad advisory stage gate existence**
   - ALREDY DOCUMENTED: Closed R8 advisory stage in `src/routing-intel/advisory-stage.ts`

4. **Router dispatch comprehensive implementation**
   - ALREDY DOCUMENTED: Full router implementation in `src/control-plane/router.ts`

5. **PlayQueue cancellation API**
   - ALREDY DOCUMENTED: Cancel method and `/api/queue/*/cancel` route

6. **Player status projection complexity**
   - ALREDY DOCUMENTED: Rich player status in `src/player-roster.ts`

# WAS / IS / WILL BE

## WAS
- R8 implemented but dormant with closed stage gate
- `optionToDecision` bridge exists but refuses `wait-for-reset`
- Dad advisory flows exist behind closed gates
- Player pills/status surfaces exist but don't carry R9 state
- Notification system exists for AI usage only
- Cancellation exists for queued Plays only

## IS  
- R8 architecture fully implemented and tested
- `optionToDecision` pure function refuses wait-for-reset (R9 owns it)
- Dad advisory stage gate is closed and cannot be opened
- PlayerRoster.status() projects comprehensive player state for UI
- AlarmEngine implements AI usage notifications
- PlayQueue provides cancellation and retry functionality
- Router.dispatch() handles complex routing with PlayQueue integration

## WILL BE (with R9 integration)
- R9 Schedule contextual affordances appear when resource limits reached
- Player pills may carry R9 state/actions alongside existing status
- Schedule notifications reuse AlarmEngine patterns with contextual gating
- R9 DeferredPlay integrates at optionToDecision seam
- Schedule/cancellation actions minimize duplicate state through existing APIs
- UI placement decisions require architectural layer evaluation

# Scout Limitations

This reconnaissance was performed by:
- **Agent:** sideline-scout-quick  
- **Model:** openrouter/cohere/north-mini-code:free
- **Effort:** Medium

**LIMITATIONS:**
1. **Frontend Implementation Details:** Browser UI implementation for Schedule affordances not examined
2. **Trigger Logic Specificity:** Exact conditions for Schedule affordance display not defined in codebase
3. **R9 DeferredPlay Integration:** Precise connection points between R8 and R9 not fully mapped
4. **Notification Channel Strategy:** Browser notification routing not analyzed in detail
5. **Minimal State Analysis:** Exact scope of state duplication requirements not quantified

**WHAT WAS INVESTIGATED:**
- ✅ `optionToDecision` implementation and refusal logic
- ✅ RouteOption wait-for-reset representation
- ✅ Dad advisory stage gate and closed implementation
- ✅ Router.routePlay comprehensive dispatch logic
- ✅ PlayQueue cancellation and state management
- ✅ PlayerRoster.status() player presentation
- ✅ AlarmEngine notification patterns
- ✅ Daemon WebSocket and API patterns
- ✅ Cancellation route definitions
- ✅ Product idea analysis and architectural implications

**A stronger Architect may identify:**
- Higher-order seams not visible at this reconnaissance level
- Integration complexity between identified seams
- UI implementation details for Schedule affordances
- Exact trigger logic for contextual scheduling
- Notification channel optimization strategies

---
**This report is reconnaissance, not final architectural authority.**

A stronger Architect should spot-check the highest-consequence evidence and reopen only areas where the evidence is weak, contradictory, incomplete, or architecture-sensitive.
