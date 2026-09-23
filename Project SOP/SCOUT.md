# SIDELINE COACH — SCOUT STANDARD OPERATING PROCEDURE

## PURPOSE

Scouts exist to reduce uncertainty before expensive architecture or implementation work.

A Scout is not primarily a problem solver.

A Scout is an evidence collector and map maker.

The preferred workflow is:

```text
Question / Feature / Defect
        ↓
Split into independent uncertainty domains
        ↓
Scout A
Scout B
Scout C
...
        ↓
Evidence compression / Scout synthesis
        ↓
Architect reads the map
        ↓
Architect checks only critical seams
        ↓
Worker implements
        ↓
Automated proof
        ↓
Human field proof
```

Core principle:

> Do not pay an architect to discover facts that a cheaper Scout can establish first.

---

# 1. WHEN TO USE A SCOUT

Use Scouts when one or more of these are true:

* the relevant architecture is not yet understood;
* multiple subsystems may be involved;
* the repo is large;
* several plausible explanations exist;
* a feature spans independent technical domains;
* implementation would be risky without reconnaissance;
* the likely architect is expensive;
* the human wants to conserve premium model usage;
* the task contains substantial UNKNOWNs.

Do NOT Scout merely because a task exists.

If the cause and repair are already narrow and proven, send a Worker.

---

# 2. SPLIT THE TERRITORY BEFORE SCOUTING

Do not automatically give one Scout the entire feature.

First identify the independent uncertainty domains.

Example:

Instead of:

> "Scout Dev Mode Player Controls."

split it into:

```text
Scout A
Live Player identity + model / effort projection

Scout B
Pause / checkpoint / resume / session preservation

Scout C
Capacity / eligibility / quota / availability

Scout D
Exact-instance terminal / console / Under the Hood
```

Each Scout should have ONE coherent question.

The domains may interact, but they should be independently investigable.

Rule:

> If reconnaissance crosses multiple independent technical domains, split it.

This prevents:

* huge context windows;
* broad shallow reports;
* expensive rediscovery;
* one Scout disappearing down an unrelated rabbit hole.

---

# 3. SCOUT PRE-FLIGHT CARD

Every Scout Play must identify itself before work begins.

Include:

```text
Repo / Directory:
VS Code instance:
Player:
Model:
Reasoning effort:
Scout Depth:
Thread:
Coverage:
Purpose:
Why this Scout exists:
```

Example:

```text
Player: Codex
Model: GPT-5.6 Sol
Reasoning effort: Medium
Scout Depth: Standard

Coverage:
Exact-instance live execution identity only.

Purpose:
Determine what Sideline already knows about the Player's
current model, effort, session, and execution state.
```

---

# 4. MODEL / EFFORT DISCLOSURE

Every Scout report must record:

* Agent / Player
* exact Model
* Reasoning effort
* Scout Depth

This is our practical measure of how much reasoning power was assigned.

Do NOT invent fake IQ scores or unsupported "intelligence ratings."

Use explicit operational labels instead:

```text
MODEL:
Claude Sonnet 5

REASONING:
Medium

SCOUT DEPTH:
Standard
```

This lets the Control Tower interpret evidence appropriately and decide whether an expensive model needs to verify anything.

---

# 5. SCOUT DEPTH

Use three Scout Depth levels.

## LIGHT

Use when:

* likely seam is already known;
* only a few files/components need inspection;
* question is factual;
* low ambiguity.

Goal:

> Find the answer quickly and stop.

---

## STANDARD

Default.

Use when:

* several files or runtime seams may matter;
* architecture needs a reliable map;
* some ambiguity exists;
* evidence should be cross-checked.

Goal:

> Produce enough evidence that an Architect does not need to rediscover the subsystem.

---

## DEEP

Use sparingly.

Use when:

* cross-system behavior is genuinely complex;
* contradictions already exist;
* several independent evidence sources must be reconciled;
* architecture depends heavily on the result.

A Deep Scout is still a Scout.

It does NOT become an Architect.

---

# 6. SCOUTS ARE READ-ONLY BY DEFAULT

Default Scout rule:

```text
READ-ONLY
```

Scouts may inspect:

* source
* configuration
* tests
* runtime diagnostics
* logs
* Git history when appropriate
* local filesystem state
* existing reports
* provider documentation when authorized
* connected runtime/process state

Scouts do NOT normally:

* implement fixes;
* refactor;
* commit;
* push;
* reset;
* clean;
* alter unrelated configuration.

Reason:

> Observation and policy are separate.

A Scout should report what exists before somebody starts changing what exists.

---

# 7. EVIDENCE CLASSIFICATION

Meaningful Scout conclusions must be classified.

Use:

```text
FACT
INFERENCE
UNKNOWN
CONTRADICTION
ARCHITECT DECISION REQUIRED
```

## FACT

Directly supported by observed evidence.

Example:

> FACT: ExecutionView already contains exact `playerInstanceId`.

## INFERENCE

Strong interpretation based on evidence, but not directly observed.

Example:

> INFERENCE: Work Ledger is probably the best current source for model/effort display.

## UNKNOWN

Evidence cannot currently establish the answer.

UNKNOWN is valid.

Never fill it with confidence theatre.

## CONTRADICTION

Two apparently valid pieces of evidence disagree.

Contradictions are valuable.

Surface them explicitly.

## ARCHITECT DECISION REQUIRED

Facts are known, but choosing policy requires architecture.

Example:

> Provider quota exhaustion is observable, but whether it should change human On Field state is a policy decision.

---

# 8. REPORT WHAT EXISTS, NOT WHAT YOU WISH EXISTED

A Scout should distinguish:

```text
CURRENTLY EXISTS
PARTIALLY EXISTS
DOES NOT EXIST
UNKNOWN
POSSIBLE FUTURE SEAM
```

Do not silently convert:

> "The underlying provider may support cancellation"

into:

> "Sideline supports Pause."

Those are different claims.

---

# 9. PROVIDE EXACT SEAMS

The Scout's most valuable output is usually:

> Where should the next agent touch?

Identify concrete seams such as:

* file
* module
* interface
* RPC
* state object
* provider adapter
* event
* persistence boundary
* UI projection
* existing test seam

Example:

```text
ExecutionView already contains:
- playerInstanceId
- playRef
- timer
- executionType

Missing projection:
- provider
- model
- effort
```

That lets the Architect start at the junction instead of reading the city directory.

---

# 10. RECORD LIMITATIONS

Every Scout report must explicitly state what it DID NOT prove.

Examples:

```text
LIMITATIONS

- Did not inspect provider protocol source.
- Could not verify live quota reset timestamps.
- Did not test unexpected process termination.
- Did not inspect mobile rendering.
```

This prevents downstream agents from treating silence as evidence.

---

# 11. TOKEN / SCOPE ESCAPE HATCH

Read-only does not mean free.

Every Scout gets a scope budget.

If the territory is materially larger than estimated:

STOP.

Do not consume the entire context window.

Return:

```text
PARTIAL MAP

What was inspected:
...

What is proven:
...

What remains:
...

Recommended follow-up Scout A:
...

Recommended follow-up Scout B:
...
```

Core rule:

> When reconnaissance grows, split again rather than turning one Scout into a wandering mega-agent.

---

# 12. SCOUT REPORT FORMAT

Scout filenames begin with:

```text
SCOUT-
```

Example:

```text
SCOUT-Live-Player-Identity-And-Execution-State.md
```

Report metadata must include:

```text
REPORT TYPE: SCOUT REPORT

AGENT:
MODEL:
REASONING EFFORT:
SCOUT DEPTH:
COVERAGE:
LIMITATIONS:
```

Recommended body:

```text
1. Executive Map
2. Questions Investigated
3. Facts
4. Inferences
5. Unknowns
6. Contradictions
7. Existing Architecture Seams
8. Missing Capabilities
9. Architect Decisions Required
10. Recommended Next Move
11. Limitations
```

---

# 13. SCOUT PACKETS

When several Scouts belong to one feature/question, place them together.

Example:

```text
REPORTS/
  Scout Only/
    Dev-Mode-Player-Control-Recon__2026-09-14/
      SCOUT-A-Live-Identity.md
      SCOUT-B-Checkpoint-And-Session.md
      SCOUT-C-Capacity-And-Eligibility.md
      SCOUT-COMPLETE-Dev-Mode-Player-Control-Recon.md
```

The packet is temporary working intelligence.

It is not automatically permanent product documentation.

---

# 14. SYNTHESIZE BEFORE OPUS

Do not hand Opus five raw exploratory reports and say:

> "Good luck."

First create a Scout synthesis.

The synthesis should compress:

* consensus facts;
* contradictions;
* architecture seams;
* remaining Unknowns;
* decisions that actually require the Architect;
* recommended architecture questions.

Example:

```text
Three-layer candidate architecture:

1. Identity Layer
   exact Player instance + friendly label

2. Execution Layer
   Play / model / effort / timer / session / checkpoint

3. Eligibility Layer
   can accept work / why / evidence / expiry
```

The synthesis should eliminate duplicate discoveries.

---

# 15. ARCHITECT RULE

The Architect does NOT restart reconnaissance from zero.

The Architect should:

1. read the synthesis first;
2. inspect raw Scout reports only where useful;
3. spot-check critical evidence;
4. investigate contradictions;
5. verify high-risk seams;
6. resolve `ARCHITECT DECISION REQUIRED` items;
7. design the system.

Core rule:

> Architect checks seams, not bookshelves.

Opus should not reread the entire repository merely because Opus is capable of doing so.

---

# 16. WHEN OPUS SHOULD PERSONALLY VERIFY

Opus should spend premium reasoning primarily on:

## A. Contradictions

Where Scout evidence disagrees.

## B. High-risk architectural boundaries

Examples:

* identity
* persistence
* destructive actions
* routing ownership
* security
* concurrency
* recovery semantics

## C. Policy decisions

Where observation is known but desired behavior is not.

## D. Weak-provenance evidence

Where the Scout had to infer something important.

## E. Cross-domain seams

Where two independently scouted systems connect.

Opus does NOT need to personally re-prove every low-risk FACT.

---

# 17. TRUST EVIDENCE BY PROVENANCE, NOT MODEL

A Scout conclusion is not automatically correct because the Scout used an expensive model.

Likewise, a cheaper Scout's direct runtime observation may be stronger evidence than an Architect's inference.

Rank evidence by provenance.

Example:

```text
Human field observation
> live runtime evidence
> deterministic automated reproduction
> direct source inspection
> strong inference
> speculation
```

Model prestige does not reverse this order.

---

# 18. HUMAN EVIDENCE OVERRIDES FALSE CLOSURE

If automated proof says:

```text
PASS
```

but the human reproduces the defect:

```text
FAIL
```

the status becomes:

```text
OPEN
```

immediately.

The automated model must then be reconciled with reality.

Never continue calling the feature fixed.

---

# 19. ARCHITECT → WORKER HANDOFF

Once architecture is resolved, give implementation to the cheapest model capable of executing it safely.

Typical routing:

```text
Scout
→ inexpensive / medium reasoning

Architecture
→ Opus when warranted

Implementation
→ Sonnet / Codex / appropriate Worker

Mechanical follow-up
→ cheaper Worker
```

Do not make Opus install drywall because Opus designed the house.

---

# 20. PROOF LADDER

After Worker implementation:

```text
Implementation
↓
Focused automated tests
↓
Full regression suite
↓
Runtime / integration proof
↓
Smallest irreducible human field test
```

A feature graduates only as far as the evidence supports.

Possible states:

```text
BREADCRUMBED
SCOUTED
ARCHITECTED
IMPLEMENTED
AUTOMATED PROOF PASSED
HUMAN FIELD-PROVEN
```

Never collapse these into one generic "done."

---

# 21. SCOUT SELF-CLEANING

Scout packets are temporary intelligence.

Once useful conclusions graduate into:

* architecture;
* breadcrumbs;
* contracts;
* tests;
* SOPs;
* canonical Coach knowledge;

the raw Scout packet may be pruned.

Core principle:

> Preserve durable knowledge, not archaeological debris.

Do not allow `REPORTS/` to become an infinite attic.

---

# 22. CONTROL-TOWER RESPONSIBILITY

The Human + AI Assistant Coach decide:

* whether scouting is needed;
* how many independent Scout domains exist;
* which model each Scout deserves;
* Scout Depth;
* whether another Scout is cheaper than escalating;
* what evidence should be synthesized;
* what truly requires Opus.

Agents should not automatically escalate themselves to more expensive models.

---

# 23. COST PRINCIPLE

The purpose of the Scout system is not simply to use weaker models.

It is to allocate intelligence precisely.

Bad pattern:

```text
Opus
→ read 100 files
→ discover 85 boring facts
→ make 3 architecture decisions
```

Preferred pattern:

```text
Scout A → establish facts
Scout B → establish facts
Scout C → establish facts
        ↓
Synthesis
        ↓
Opus
→ verify 3 dangerous seams
→ resolve 3 architecture decisions
→ stop
```

This converts premium context consumption into premium decision-making.

---

# 24. CANONICAL SCOUT PIPELINE

The default Sideline Coach reconnaissance workflow is now:

```text
1. Frame the uncertainty.

2. Split it into independent domains.

3. Assign each domain:
   - Agent
   - Model
   - Reasoning effort
   - Scout Depth

4. Run READ-ONLY Scouts.

5. Require:
   FACT / INFERENCE / UNKNOWN /
   CONTRADICTION / ARCHITECT DECISION REQUIRED.

6. Stop Scouts that grow beyond scope.

7. Place related reports in one Scout packet.

8. Produce SCOUT-COMPLETE synthesis.

9. Give Architect the synthesis first.

10. Architect spot-checks only:
    - contradictions
    - risky seams
    - weak evidence
    - architecture decisions

11. Architect produces the design.

12. Worker implements.

13. Automated proof.

14. Human field proof.

15. Graduate durable knowledge.

16. Prune temporary Scout debris.
```

# FINAL PRINCIPLE

> Scouts buy information cheaply so Architects can spend intelligence on decisions.

Or, in Sideline terms:

> **Scouts watch the film. Opus calls the play. Workers run it. The human owns the scoreboard.**

