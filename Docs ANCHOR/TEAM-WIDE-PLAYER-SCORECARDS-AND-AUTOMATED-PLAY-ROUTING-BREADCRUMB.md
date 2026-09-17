# TEAM-WIDE PLAYER SCORECARDS AND AUTOMATED PLAY ROUTING — BREADCRUMB

CALGARY TIMESTAMP: 2026-09-16 06:13 MDT

## STATUS

Future-facing product/architecture idea. Intentionally lower priority than current Scout integration and second-line proof work.

This is NOT an instruction to build the subsystem now.

---

## CORE IDEA

The Scout Depth Chart concept may generalize to the entire Sideline Coach team.

Instead of keeping performance memory only for Scouts, Sideline Coach may eventually maintain empirical scorecards for every Player class and concrete Player/model/provider route used in real Games.

Examples include:

- Claude Opus
- Claude Sonnet
- Codex / GPT-5.6 Sol
- Gemini / Gemini Flash
- Anti-Gravity
- Scout models
- future Workers
- future specialist Players
- provider-specific routes for the same underlying model

The human may have strong priors such as "Claude is the premium #1 draft pick," but the long-term system should be able to answer a more useful question:

> For this user's Games, repositories, task classes, and workflow, what does the actual game film say?

The target is not a generic leaderboard.

The target is a Sideline-owned, project-relevant evidence system.

---

## WHY THIS COULD MATTER

Sideline Coach is heading toward more automated play calling.

A future mode may allow the human to hand Sideline Coach a goal and let it:

1. classify the Play;
2. choose the formation;
3. select Players;
4. route work across available premium and reserve Players;
5. manage token/capacity constraints;
6. gather evidence;
7. escalate only when needed;
8. return the result and supporting reports.

That system becomes substantially stronger if routing is informed by empirical history rather than fixed preferences alone.

Examples:

- Which Player performs best on architecture in this repository?
- Which Worker produces the fewest regressions?
- Which Scout is best at repository archaeology?
- Which model is fastest on bounded implementation work?
- Which provider route is most reliable?
- Which Player tends to require the least downstream rediscovery?
- When premium quota is low, which second-line Player historically performs best for this task class?

---

## IMPORTANT PRINCIPLE

### Measured != Judged

The system must separate objective telemetry from downstream evaluation.

### Measured examples

- starts
- completions
- failures
- interruptions
- duration
- model
- provider
- effort/reasoning level
- task class
- repo/Game
- token/cost usage when observable
- provider error
- rate-limit event
- retry count
- report existence
- test result
- commit/result artifact existence

### Evaluation examples

- human accepted result
- Architect accepted Worker output
- downstream Player had to rediscover the subsystem
- implementation required rework
- report identified the correct files
- report contained unsupported claims
- tests passed but field proof failed
- field proof succeeded
- regression introduced
- task was over-scoped or under-scoped

Evaluations must remain attributable to their evaluator and evidence source. They must not be disguised as objective telemetry.

---

## FIELD EVIDENCE OUTRANKS BENCHMARK REPUTATION

External benchmarks and model reputation are useful priors.

Sideline's own field history should eventually carry more routing weight for Sideline-specific work.

Example:

Claude may remain the premium architecture favorite.

But if repeated Sideline Games show that another Player performs equally well on a specific bounded task class with lower cost, lower latency, or lower quota pressure, Sideline should be able to use that evidence.

This does NOT imply automatic replacement of premium Players.

It enables evidence-based formation selection.

---

## SCORECARD SCOPE

A future Player scorecard may include:

### Identity

- Player name
- model
- provider
- tool/agent harness
- reasoning/effort level
- role class

### Availability

- READY
- BUSY
- LIMITED
- RATE-LIMITED
- PROVIDER UNAVAILABLE
- AUTH ISSUE
- INJURED LIST
- UNKNOWN

### Reliability

- starts
- completion rate
- provider failure rate
- harness failure rate
- clean-retirement rate

### Performance by task class

- architecture
- code implementation
- debugging
- repository archaeology
- Scout reconnaissance
- contradiction finding
- testing
- UI/UX reasoning
- documentation
- refactoring
- report synthesis

### Cost / capacity

- observed token use
- observed API cost
- subscription/quota impact when observable
- latency
- availability windows

### Downstream quality

- rework required
- human acceptance
- Architect acceptance
- Worker success after handoff
- field-proof success
- regression rate

---

## HUMAN-FACING AND AI-FACING LAYERS

The same underlying evidence may support two presentation layers.

### Human-facing

Friendly cards / depth charts / team view.

Example:

CLAUDE OPUS
Role: Premium Architect
Status: READY
Architecture record: Excellent
Best Games: ...
Typical use: High-consequence architecture
Recent form: ...

### AI-facing

Structured routing data consumed by Sideline's play caller.

Example dimensions:

- taskClass
- difficulty
- requiredRole
- repo/Game history
- Player historical score
- provider availability
- privacy compatibility
- token/cost policy
- confidence

The AI-facing layer must not expose opaque fake scores without traceable evidence.

---

## AUTOMATED PLAY CALLING CONNECTION

This breadcrumb is particularly relevant to a future "give it to Sideline Coach and run it" mode.

Possible routing hierarchy:

1. classify the Play;
2. determine whether Scout / Architect / Worker / specialist roles are required;
3. choose formation size;
4. filter Players by availability, privacy, permissions, and budget;
5. rank eligible Players using historical task-specific game film;
6. select starter and reserve routes;
7. execute with bounded concurrency;
8. watch for provider/player failure;
9. substitute when policy allows;
10. record the result back into the scorecard system.

This creates a learning loop:

Play -> routing -> execution -> outcome -> scorecard -> better future routing

---

## SECOND-LINE / LOW-TOKEN MODE CONNECTION

This idea directly connects to token-constrained operation.

When premium Players are low on quota or deliberately conserved, Sideline may need a trusted second line.

The second line should not be chosen merely because models are free.

It should be chosen because Sideline has game film showing which reserve Players are useful for which route classes.

Possible future policy:

- premium starter when consequence/uncertainty requires it;
- empirically strong reserve when task is bounded or premium quota is constrained;
- Scout first when reconnaissance can remove expensive rediscovery;
- deterministic tools before model calls where appropriate;
- escalate only when evidence says the reserve route is insufficient.

---

## RELATIONSHIP TO SCOUT DEPTH CHART

The Scout Depth Chart remains the best first proving ground because Scout work is:

- bounded;
- separable;
- read-only;
- easy to compare;
- naturally multi-Player;
- already producing runner telemetry.

If the Scout scorecard proves useful, the architecture can later generalize to all Players.

Do not prematurely force the whole team into a Scout-specific schema.

Instead, treat Scouts as the first vertical slice of a future Team Performance system.

---

## IMPORTANT NON-GOALS

Do NOT build this now merely because the idea is attractive.

Do NOT:

- create fake universal Player ratings;
- benchmark for benchmark's sake;
- let one outcome crown or cut a Player;
- conflate provider failure with model quality;
- conflate tests with field success;
- let automation silently override explicit human Player selection;
- optimize only for cost;
- expose sensitive Game content to providers based only on performance ranking;
- replace human judgment with a mysterious score.

Explicit human routing intent must continue to outrank automated inference.

---

## NEAR-TERM ACTIONABLE SLICE

The actionable work today is smaller:

1. prove additional Scout/provider routes;
2. determine whether the existing Scout Runner can support other agents/providers;
3. run real bounded routes;
4. record exact failure seams;
5. accumulate Scout performance evidence;
6. identify a practical second-line Scout roster;
7. learn what telemetry is actually useful before designing a universal team score.

This current Scout work can directly feed the future team-wide system.

---

## WAS / IS / WILL BE

### WAS

Player selection is largely based on known capability, reputation, human preference, quota state, and task difficulty.

### IS

Scout work is beginning to generate actual Sideline-specific game film across models, providers, task classes, concurrency behavior, and failure seams.

### WILL BE

Potentially, Sideline Coach maintains an evidence-backed Team Performance layer for Scouts, Architects, Workers, and other Players, with both human-facing scorecards and AI-facing routing data.

That layer may eventually help Sideline automatically call formations, choose starters/reserves, manage token pressure, substitute around provider outages, and learn which Players actually perform best for this user's Games.

---

## PRODUCT INVARIANT CANDIDATE

> The best Player is not the model with the best reputation. The best Player is the eligible Player with the strongest relevant evidence for the Play in front of us, unless the human explicitly chooses otherwise.

This is a candidate principle, not yet a locked product invariant.

---

## PRIORITY

LOWER PRIORITY / FUTURE ARCHITECTURE.

Preserve the idea.

Do not let it distract from proving the current Scout second line and real provider/agent interoperability.

CALGARY TIMESTAMP: 2026-09-16 06:13 MDT
