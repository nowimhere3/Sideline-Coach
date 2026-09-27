# INTELLIGENT ROUTING V2 — COACH REFRESH SEMANTIC CLASSIFICATION

**STATUS:** BREADCRUMB / FUTURE ARCHITECTURE  
**PRIORITY:** Preserve now; evaluate against launch priorities after Breadcrumb Master Review  
**BUILD NOW:** NO

## WHY

Sideline should not need to build its own AI language-understanding engine.

We already have an intelligent semantic layer available: the user's **Assistant Coach**.

The stronger architecture may be:

> **Assistant Coach interprets the work. Sideline applies deterministic policy, plumbing, routing, and evidence.**

This reduces custom parsing/code, conserves premium development capacity, and supports a near-term launch.

---

## 1. COACH REFRESH AS SEMANTIC CLASSIFIER

Explore using Coach Refresh / Assistant Coach to return a small structured classification for each Play.

Initial conceptual classes:

- **ARCHITECT / ORCHESTRATION**
- **WORKER / IMPLEMENTATION**
- **ALL-IN-ONE**
- **UNCERTAIN**

Exact taxonomy is not locked.

If classification is uncertain, Sideline should ask the Head Coach a minimal clarification rather than silently guessing.

Example:

> What kind of work is this?  
> `ARCHITECT` · `WORKER` · `ALL-IN-ONE`

---

## 2. SHIPPED PLUMBING PACKAGE

Ship a canonical information package explaining the machine-facing rules required for Sideline to operate.

Potential contents:

- Player / model / effort concepts
- Architect vs Worker vs Scout responsibilities
- orchestration rules
- report requirements
- report formatting
- report destinations / folder conventions
- handoff requirements
- required status signals
- other canonical SOP plumbing

The Head Coach should understand only the minimum concepts necessary to operate the system.

Machine-specific formatting and procedural requirements should be attached automatically wherever possible.

---

## 3. SEPARATE THREE ROUTING JOBS

Do not collapse these into one mechanism.

### AUTO INTENT RECOGNITION

Interpret explicit human routing instructions reliably.

Examples that should eventually resolve consistently:

- `Sonnet Medium`
- `Send this to Claude Sonnet`
- `Have Sonnet Medium handle this`
- equivalent natural-language routing instructions

AUTO remains primarily an interpreter/autofill mechanism for explicit routing intent.

### PLAY CLASSIFICATION

Assistant Coach determines what kind of work the payload represents.

Example:

`ARCHITECT`, `WORKER`, `ALL-IN-ONE`, or `UNCERTAIN`.

### INTELLIGENT ROUTING

Sideline combines classification with:

- available roster
- Player capability
- model / effort suitability
- Film / historical outcomes
- current usage and capacity
- reset timing
- economics
- routing posture

to produce a recommendation or eventual authorized route.

---

## 4. FUTURE CONTROL SURFACE

Explore making Intelligent Routing a first-class visual group rather than forcing one CONSERVE actuator to communicate the entire system.

Candidate information architecture:

```text
PLAY DISPATCHER                    INTELLIGENT ROUTING

[ AUTO ] [ MANUAL ]                [ BEST ] [ CONSERVE ]
```

### BEST

Candidate label only, not locked.

Meaning:

> Use Intelligent Routing to choose the strongest overall route for the work.

`BEST` is currently preferred over `BALANCED` / `BEST FIT` because it is shorter and may communicate the intent more immediately beneath an `INTELLIGENT ROUTING` heading.

### CONSERVE

Meaning:

> Still route intelligently, but place additional weight on protecting scarce / valuable Player capacity when a capable alternative exists.

Conserve remains a **routing posture**, not routing authority.

Explicit human routing continues to win.

---

## 5. AUTHORITY MUST REMAIN SEPARATE

Do not accidentally merge:

- routing interpretation
- semantic classification
- recommendation
- routing posture
- dispatch authority

The system may understand and recommend a route before it is authorized to execute that recommendation automatically.

Existing proving / authority gates remain separate concerns.

---

## 6. OPEN DESIGN QUESTION — AUTO COACH REFRESH

Determine which Plays should automatically invoke Assistant Coach semantic classification.

Goal:

> maximize useful classification while minimizing unnecessary AI calls, latency, usage consumption, and engineering complexity.

Potential future strategies include:

- classify every eligible Play
- classify only when explicit route/task type is absent
- classify only when Intelligent Routing is requested
- reuse existing Coach Refresh responses where classification signal already exists
- cache/reuse classification where safe

Do not decide this until architecture and economics are reviewed.

---

## PRODUCT PRINCIPLE

The Head Coach should not need to understand the machinery.

Desired experience:

> Write the task normally.  
> Sideline understands what kind of work it is.  
> Sideline knows the available team and current resources.  
> Sideline recommends where the work belongs.  
> If Sideline genuinely does not know, it asks one small question.

The AI performs semantic judgment.

**Sideline performs orchestration, policy, evidence, and enforcement.**

---

## LAUNCH NOTE

Do not allow this future architecture to delay the current launch unnecessarily.

The current AUTO / MANUAL / CONSERVE system can remain the launch baseline while this is evaluated against the complete Breadcrumb Master Map.

Revisit after the breadcrumb reconnaissance and launch-priority review.