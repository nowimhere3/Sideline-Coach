# NORTH STAR

## Governing Product and Architecture Principles

**Status:** Product and architecture constitution.

**Purpose:** This document defines the principles that govern product decisions, architecture, automation, user experience, and future development.

It is deliberately **not**:

* a project plan
* an implementation blueprint
* a feature roadmap
* a description of current architecture
* a list of current files, systems, or technologies
* a phase sequence
* a changelog

Those things may change frequently.

The principles below should change rarely.

> **A change that conflicts with this document is wrong unless the human product owner deliberately amends this document first.**

If an agent believes one of these principles is incompatible with a necessary change, it should identify the conflict and present the evidence.

It should not quietly route around the principle.

---

# 1. HUMAN SIMPLICITY IS THE PRIMARY DESIGN CONSTRAINT

> **Make the user think as little as possible.**

> **Make the user do as little as possible.**

> **Make the machine think harder so the human thinks less.**

Architectural sophistication is valuable only when it reduces:

* human work
* human decisions
* human repetition
* setup
* explanation
* cognitive load

Complex architecture may be completely appropriate.

Complex user experience usually is not.

The purpose of stronger architecture is to **purchase simplicity for the human**.

### Governing regression test

For every meaningful change, ask:

> **Does this make the user think or do more than before?**

If yes, there must be a concrete and unavoidable reason.

Otherwise, the change is a regression regardless of how technically elegant it may be internally.

---

# 2. INTERNAL IMPORTANCE DOES NOT CREATE CUSTOMER-FACING IMPORTANCE

A system may contain many important internal concepts:

* identities
* databases
* providers
* mappings
* transports
* synchronization state
* permissions
* replicas
* indexes
* capabilities
* runtime state

Their existence does not earn them a place in the interface.

> **A concept earns customer-facing existence only when a genuine customer decision depends on it.**

Do not expose something merely because:

* it exists
* it is technically important
* it is stored
* engineers need to reason about it
* exposing it makes implementation easier

Internal architecture may become more important while becoming **less visible**.

These are not opposing goals.

They are often signs of correct design.

> **More load-bearing for machines. Less visible to humans.**

---

# 3. THE CUSTOMER'S MENTAL MODEL HAS A BUDGET

Every product teaches its customer a mental model.

That model should contain the smallest possible number of durable, ordinary concepts.

The customer should understand the things they actually care about.

They should not need to understand the machinery required to make those things work.

Before adding a new customer-facing concept, ask:

> **Does the customer genuinely need to understand this in order to make a meaningful decision?**

If not, keep it internal.

The correct customer awareness of most plumbing is not:

> "We explained it clearly."

It is:

> **They never needed to know it existed.**

---

# 4. NEVER ASK A PLUMBING QUESTION WHEN YOU CAN ASK A HUMAN QUESTION

When human input is genuinely required, phrase the question in the customer's world.

Do not ask the customer to translate their intention into system architecture.

The machine should perform that translation.

A customer should answer questions about:

* what they want
* what something represents to them
* whether two things are the same
* where something belongs
* what behavior they prefer

They should not be asked to reason about:

* internal identifiers
* persistence layers
* synchronization topology
* provider selection
* database relationships
* implementation terminology

> **Ask in the customer's nouns, not the machine's nouns.**

---

# 5. THE MACHINE MUST EXHAUST ITS OPTIONS BEFORE ASKING THE HUMAN

When the system encounters a decision, follow this order:

```text
1. KNOW

Is the answer already known from trustworthy stored state?

→ Act.
→ Do not ask.


2. PROVE

Can the answer be established deterministically?

→ Act.
→ Do not ask.


3. REDUCE

Can the ambiguity be narrowed before involving the human?

→ Narrow it first.


4. PROPOSE

Is there one strong, corroborated possibility?

→ Propose it simply.
→ Prefer a yes/no decision.
→ Use the customer's language.


5. ASK

Does genuine ambiguity remain?

→ Ask one human question.
→ Provide a safe default where appropriate.
```

Human attention is a scarce resource.

Do not spend it resolving questions the machine can answer.

---

# 6. PROOF, EVIDENCE, AND AMBIGUITY ARE DIFFERENT

> **Proof licenses action.**

> **Evidence licenses a proposal.**

> **Ambiguity licenses a question.**

These must not be confused.

Strong evidence is not automatically proof.

A likely answer is not automatically a safe automatic action.

Names, appearances, layouts, proximity, similarity, or coincidence may all provide evidence.

They do not necessarily prove identity or intent.

When proof is required, require proof.

When only evidence exists, propose.

When genuine ambiguity remains, ask.

---

# 7. UNKNOWN IS A REAL STATE

Do not force uncertainty into a convenient binary.

These are different:

```text
YES
NO
UNKNOWN
```

And these are different:

```text
RELATED
UNRELATED
UNKNOWN
```

A missing permission, unavailable API, absent evidence, transient error, unobserved state, or failed lookup does not automatically mean "no."

> **Unknown must remain unknown until evidence resolves it.**

Do not manufacture certainty because certainty makes implementation easier.

A safe system declines to conclude when it cannot justify a conclusion.

---

# 8. CONTRADICTION OUTRANKS SIMILARITY

Evidence should not behave like a popularity contest.

Many weak similarities do not necessarily outweigh one strong contradiction.

Where identity or safety matters:

> **A material contradiction is a veto, not merely a lower score.**

This prevents systems from becoming dangerously confident because several superficial signals happen to agree.

---

# 9. EXPLICIT HUMAN CHOICE OUTRANKS INFERENCE

An explicit customer decision is stronger than:

* inherited state
* inferred state
* suggested state
* automation
* defaults
* heuristics
* previous assumptions

> **Automation fills a vacuum. It does not overwrite deliberate human choice.**

Once the customer explicitly chooses something, remember that choice until the customer deliberately changes it.

Do not repeatedly ask the same question simply because the system rediscovered the condition that originally caused the question.

---

# 10. INFERENCE MUST RESPECT DIRECTION AND CONSEQUENCE

Not every relationship permits inference in both directions.

A fact that safely implies something downstream may not safely imply the reverse.

Before automatically propagating a decision, ask:

* Is the relationship actually proven?
* Is the implication logically directional?
* What is the cost of being wrong?
* Would the reverse inference affect a larger or more important scope?

> **Do not "tidy up" deliberate asymmetry merely because symmetry looks architecturally cleaner.**

Correct asymmetry is better than elegant incorrectness.

When one direction is provable and the reverse is merely plausible:

```text
PROVEN DIRECTION
→ may act

PLAUSIBLE REVERSE
→ may suggest
```

---

# 11. OBSERVATION AND POLICY MUST REMAIN SEPARATE

The layer that discovers evidence should not automatically become the layer that decides what the evidence means for the customer.

Keep separate:

```text
OBSERVATION
What did we discover?

POLICY
What should the product do about it?
```

Evidence should be readable by policy.

Policy should not leak downward into evidence collection merely because combining them is convenient.

> **The layer that observes should not silently become the layer that decides.**

This separation makes future policy changes safer and prevents low-level mechanisms from accumulating product behavior.

---

# 12. STRONG INTERNAL IDENTITY ENABLES SIMPLE EXTERNAL EXPERIENCE

Different forms of identity may exist because they answer different questions.

Do not collapse distinct identities merely to make the architecture look simpler.

Instead:

> **Keep the architecture correct internally and make the experience simple externally.**

Internal identifiers should remain:

* stable
* opaque
* independent of presentation
* independent of ordinary renaming
* suitable for automation
* suitable for persistence

Names are presentation.

Names are not identity.

A rename should normally be a presentation event, not the creation of a new thing.

---

# 13. FACTS AND CAPABILITIES ARE DIFFERENT

A useful distinction:

```text
FACT
Something that can safely be known or shared.

CAPABILITY
Something this particular machine, account, session, or environment can currently do.
```

Capabilities are often local.

Examples include:

* physical paths
* permission state
* local handles
* mounted resources
* device-specific access
* local credentials

Do not accidentally turn a local capability into portable truth.

Likewise, do not mistake the absence of a local capability for the absence of the underlying fact.

> **Portable knowledge should reduce repeated setup, not leak machine-private state.**

---

# 14. CONTEXT DOES NOT AUTOMATICALLY CREATE A CUSTOMER DECISION

The existence of additional information does not itself justify exposing additional controls.

For example:

* another device exists
* another provider exists
* another stored state exists
* another possible relationship exists

These may give the machine useful context.

They do not automatically create something the human must decide.

> **System context is not the same thing as customer-facing ambiguity.**

Only surface a decision when a real unresolved customer decision actually exists.

---

# 15. SOLVE STATE BEFORE DISPLAYING STATE

Do not automatically show multiple customer-facing representations simply because multiple internal states exist.

If the machine can safely reconcile them into one customer-facing truth, do so.

Temporary complexity may appear while a real decision is unresolved.

Once resolved, it should retreat.

> **Stored complexity does not deserve permanent interface complexity.**

---

# 16. AUTOMATION EXISTS TO REMOVE WORK, NOT CONTROL

> **Automation should remove effort while preserving agency.**

Good automation:

* performs repetitive work
* remembers previous decisions
* resolves what can be proven
* stays quiet when nothing requires attention
* explains important automatic actions simply
* can be overridden
* respects explicit human choice

Bad automation:

* requires constant supervision
* repeatedly asks for confirmation
* performs irreversible actions without sufficient proof
* hides important consequences
* overrides deliberate human decisions
* becomes impossible to stop or correct

Where practical:

> **An automatic behavior should be understandable in one sentence and reversible with one obvious control.**

An automation requiring constant supervision has failed to automate.

An automation that cannot be overridden has removed control rather than work.

---

# 17. SAFETY REFUSALS MUST NOT BE AUTO-RESOLVED

If the system refuses to act because proof is insufficient, safety is uncertain, or identity is ambiguous, do not automatically bypass that refusal with a weaker heuristic.

A safety boundary exists precisely because the system does not know enough.

> **Do not solve uncertainty by lowering the standard of certainty.**

Escalate appropriately:

```text
prove
→ act

evidence
→ propose

ambiguity
→ ask

unsafe uncertainty
→ decline
```

---

# 18. PLATFORM LIMITATIONS MUST NOT BECOME PERMANENT ARCHITECTURAL TRUTH

Today's environment may impose limitations.

Those limitations are real and should be respected.

But temporary platform constraints should not become permanent assumptions in the core data model unless they genuinely define the product.

> **A limitation of today's runtime should not silently close tomorrow's architectural door.**

Keep platform-specific behavior behind appropriate seams.

Design the stable model around product truth, not temporary implementation inconvenience.

---

# 19. FUTURE OPTIONALITY IS NOT CURRENT IMPLEMENTATION SCOPE

Architecture should avoid unnecessarily closing valuable future doors.

That does not mean every possible future should be implemented today.

These are different:

```text
KEEP THIS POSSIBLE
```

and:

```text
BUILD THIS NOW
```

Preserve future optionality when today's design genuinely depends on it.

Do not build speculative infrastructure merely because a capability may someday be useful.

> **Protect the door when necessary. Do not build the hallway until reality requires it.**

---

# 20. STANDALONE VALUE COMES BEFORE INTEGRATION VALUE

A product or subsystem should justify its existence on its own terms.

Integration may make multiple systems significantly more powerful together.

That does not mean one should become architecturally dependent on another merely because integration is exciting.

> **Standalone first. Seamlessly integrable by design.**

A capability that only makes sense because another product exists probably belongs to that other product or to the integration layer.

Build strong boundaries that allow cooperation without unnecessary dependency.

---

# 21. FRICTION SHOULD BE TREATED AS A DEFECT WHEN IT IS NOT UNAVOIDABLE

Some friction is imposed by reality:

* security
* permissions
* hardware
* platform rules
* genuine ambiguity
* irreversible consequences

Accept unavoidable friction honestly.

Everything beyond that deserves scrutiny.

Repeated setup, repeated explanation, repeated confirmation, repeated reconnection, and repeated choices should not become ritual merely because the software has always required them.

> **Do not turn technical ceremony into user ceremony.**

---

# 22. WORDS CREATE MENTAL MODELS

Terminology is part of architecture.

A technically accurate word can still create the wrong customer expectation.

Choose language based on what the customer will reasonably understand it to mean.

Avoid terminology that accidentally implies:

* copying when only metadata moves
* deletion when something is recoverable
* synchronization when nothing is uploaded
* sharing when no media is shared
* permanence when persistence cannot be guaranteed

> **Product language should describe the customer's reality, not merely the engineer's mechanism.**

---

# 23. ADVANCED ACCESS IS AN ESCAPE HATCH, NOT THE ORDINARY PATH

Some users and developers may need access to internal state for:

* diagnostics
* recovery
* debugging
* support
* advanced configuration

That does not justify teaching ordinary users the machinery.

Advanced access may exist without becoming part of the normal mental model.

> **Reachable does not mean prominent.**

---

# 24. PRESERVE THE WHY

Future engineers and agents can usually discover **what** code does.

What disappears is **why** a particular design exists.

Important architecture should preserve:

* the invariant being protected
* the defect or evidence that created the rule
* the tempting alternative that must not be casually reintroduced
* the future door today's design intentionally preserves

Do not record history merely for history's sake.

Record the parts of history necessary to understand the present.

> **A future agent should be able to distinguish a rule nobody questioned from a rule the project paid dearly to learn.**

Durable reasoning should eventually live close enough to the architecture it governs that old implementation reports are not required forever.

---

# 25. CURRENT TRUTH, HISTORY, AND FUTURE INTENT MUST NOT BE CONFUSED

Architectural memory should distinguish three kinds of information:

```text
WAS

History that materially explains why the present design exists.


IS

Current architectural or product truth and the invariant it protects.


WILL BE / FUTURE

A future capability or direction today's architecture intentionally keeps possible.
```

These categories should not blur together.

Especially:

> **Future intent is not present implementation scope.**

And:

> **History is not a changelog unless that history explains a current rule.**

---

# 26. ANTI-PATTERNS

Future work must resist the following:

1. **Exposing an internal concept simply because it exists.**

2. **Removing strong internal architecture merely because it became invisible to the user.**

3. **Asking a question the system already knows how to answer.**

4. **Teaching architecture before the customer has a reason to understand it.**

5. **Treating UNKNOWN as NO.**

6. **Treating similarity as proof.**

7. **Overwriting explicit human choice with inference or automation.**

8. **Auto-resolving a safety refusal using weaker evidence.**

9. **Confusing names with identity.**

10. **Moving policy into the evidence layer.**

11. **Making temporary platform limitations permanent architectural assumptions.**

12. **Promising persistence, certainty, synchronization, or capability that the underlying system cannot actually guarantee.**

13. **Adding settings instead of eliminating the decision that created the setting.**

14. **Creating user-facing complexity to mirror internal complexity.**

15. **Trading identity or data safety for convenience.**

16. **Surfacing plumbing because additional system context exists.**

17. **Building speculative infrastructure before evidence demonstrates the need.**

18. **Allowing integration goals to weaken standalone product boundaries.**

19. **Creating automation that requires constant supervision.**

20. **Creating automation that the human cannot override.**

---

# 27. THE NORTH STAR TEST

When a difficult product or architecture decision appears, ask:

```text
Does this reduce human work?

Does this reduce unnecessary human decisions?

Can the machine know or prove the answer instead?

Are we exposing machinery merely because the machinery exists?

Are we asking in human language?

Are we distinguishing proof from evidence?

Are we preserving UNKNOWN when the truth is genuinely unknown?

Does explicit human choice still win?

Are observation and policy still separate?

Are strong internal identities remaining stable?

Are machine-local capabilities staying local?

Are we solving complexity rather than displaying it?

Is automation removing work without removing control?

Are we preserving future optionality without prematurely implementing it?

Are we accidentally making today's platform limitation permanent?

Does this system remain independently understandable and useful?

Are we preserving the reason behind important architectural decisions?
```

If the answers expose a conflict, resolve the conflict before implementation.

---

# 28. THE SHORTEST VERSION

When everything else becomes complicated, return to these principles:

> **Make the machine carry the complexity.**

> **Keep the human mental model small.**

> **Do not expose plumbing merely because it exists.**

> **Know before asking. Prove before acting.**

> **Evidence proposes. Proof acts. Ambiguity asks.**

> **UNKNOWN is a legitimate answer.**

> **Explicit human choice outranks automation.**

> **Keep observation separate from policy.**

> **Keep internal identity strong and external experience simple.**

> **Automate work, not authority.**

> **Treat unavoidable friction honestly and eliminate the rest.**

> **Protect future doors without building speculative futures.**

> **Preserve why important decisions exist.**

---

# AMENDING THIS DOCUMENT

This constitution is amended deliberately by the human product owner.

If evidence suggests one of these principles is wrong, incomplete, or in conflict with an important product requirement:

1. identify the conflict
2. present the evidence
3. stop before implementing around the principle
4. amend the constitution deliberately if appropriate

> **The North Star governs the work. The work does not quietly redefine the North Star.**
