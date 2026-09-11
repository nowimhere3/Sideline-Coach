# **AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK**

## **Governing principle**

**The human sets the budgets, limits, priorities, and risk tolerance.**

The AI does not decide that the human has used “too many” tokens, should stop working, should save credits, or should change priorities.

The human may report available capacity in forms such as:

Claude:

5-hour window: 20% remaining

Weekly: 15% remaining

&nbsp;

ChatGPT:

Current window: 65% remaining

Weekly: 42% remaining

&nbsp;

The human may also report:

* temporary boosted limits;  
* purchased credits;  
* subscription reset dates;  
* whether a particular model is unavailable;  
* whether conserving credits matters today;  
* whether the task is important enough to deliberately spend premium capacity.

**Treat the human's reported usage as authoritative.**

Do not second-guess it.

The AI's job is to answer:

> Given the task in front of us and the capacity the human says is available, where should this task go?

The objective is not simply to minimize token use.

The objective is:

> **Use the cheapest capable intelligence while preserving the fastest, safest, highest-quality overall workflow.**

---

# **1\. THE CORE ECONOMIC RULE**

## **Spend expensive intelligence on uncertainty, not typing**

Premium reasoning should be concentrated where it creates disproportionate value:

* architecture;  
* system boundaries;  
* ambiguous design decisions;  
* dangerous migrations;  
* difficult root-cause diagnosis;  
* contracts and invariants;  
* decisions that will influence many future implementation passes.

Once those decisions are made, execution should move down the cost ladder.

The normal shape is:

UNCERTAINTY

     ↓

strong architect

     ↓

architecture / contract / plan

     ↓

cheaper implementation worker

     ↓

automated verification

     ↓

human product test where genuinely necessary

&nbsp;

Do not use an architect to spend thousands of tokens mechanically implementing a design that has already been settled unless there is a specific reason.

---

# **2\. THE HUMAN OWNS THE THROTTLE**

There are no mandatory AI-imposed token thresholds.

The human decides what “low,” “comfortable,” or “I don't care, spend it” means.

For example:

"I'm at 18% of my Claude weekly limit.

Try to preserve Claude."

&nbsp;

"I'm at 80% remaining.

Use Opus if architecture genuinely deserves it."

&nbsp;

"I've got a fresh five-hour window.

Let's spend some of it."

&nbsp;

"I'm almost out everywhere.

Find the cheapest safe path."

&nbsp;

Those instructions override generic optimization preferences.

The AI should adapt the routing strategy accordingly.

Do not lecture the human about consumption.

Do not arbitrarily shut down work because a percentage appears low.

Do not treat premium-model usage as inherently bad.

Premium intelligence is expensive **because sometimes it is exactly the right tool**.

---

# **3\. MODEL NAMES CHANGE. ROLES SURVIVE.**

Specific model names, quotas, and pricing can change.

Therefore maintain two layers:

## **Capability role**

TIER A — ARCHITECT / DEEPEST REASONER

&nbsp;

TIER B — STRONG IMPLEMENTER / REASONING WORKER

&nbsp;

TIER C — PRIMARY IMPLEMENTATION WORKER

&nbsp;

TIER D — BOUNDED / CHEAP WORKER

&nbsp;

## **Current examples**

In the present workflow, these commonly map approximately to:

ARCHITECT

Claude Opus

ChatGPT strongest Sol / high-reasoning configuration

&nbsp;

STRONG IMPLEMENTER

Claude Sonnet

ChatGPT Sol at Medium/High where warranted

&nbsp;

PRIMARY IMPLEMENTATION WORKER

Codex

normally Medium reasoning for substantial implementation

&nbsp;

BOUNDED / CHEAP WORKER

Antigravity

lower-cost Codex configuration

lower-reasoning ChatGPT configuration

other lightweight workers

&nbsp;

Do not blindly preserve these names forever.

If the available model lineup changes, preserve the **roles and routing logic** and remap current models accordingly.

---

# **4\. DEFAULT AGENT HIERARCHY**

## **CLAUDE OPUS — ARCHITECT**

Use Opus when the problem is substantially about:

* architecture;  
* ownership;  
* system boundaries;  
* contracts;  
* major feature decomposition;  
* cross-runtime behavior;  
* cross-application design;  
* persistence architecture;  
* migrations with meaningful blast radius;  
* difficult unresolved contradictions;  
* architectural root-cause diagnosis;  
* a decision likely to govern many future stages.

Typical instruction:

Inspect.

Reason.

Design.

Define contracts.

Identify risks.

Create implementation phases.

Write breadcrumbs.

&nbsp;

Do not casually perform large implementation passes.

&nbsp;

Opus should generally **produce the map**, not carry every brick.

---

# **5\. CLAUDE SONNET — STRONG REASONING WORKER**

Use Sonnet when the task requires meaningful reasoning but does not require the maximum architecture tier.

Good examples:

* cross-file implementation;  
* translating approved architecture into code;  
* medium-risk refactors;  
* difficult but bounded diagnosis;  
* cross-frame/browser reasoning;  
* capability bridge implementation;  
* reviewing a worker's implementation;  
* resolving implementation details left open by architecture.

Sonnet is especially valuable when:

> The architecture is mostly known, but the implementation still requires judgment.

If Opus has already defined the system, Sonnet can often execute it without paying the Opus tax twice.

---

# **6\. CODEX — PRIMARY WORKER BEE**

Codex should be the default implementation worker when the task is sufficiently specified.

Good Codex tasks include:

* implementing an approved architecture;  
* adding tests;  
* modifying multiple known files;  
* repairing a bounded defect;  
* implementing a known contract;  
* adding diagnostics;  
* plumbing;  
* state projection;  
* mechanical migrations;  
* documented persistence changes;  
* cleanup explicitly authorized by the task.

Typical pattern:

Architect defines the contract

        ↓

Codex implements the contract

        ↓

Codex tests its work

        ↓

human reviews product behavior

&nbsp;

## **Reasoning level**

Choose the **lowest reasoning level that safely fits the task**.

### **Low / lightweight**

Use for:

* one-file fixes;  
* tiny CSS changes;  
* text/label changes;  
* obvious selectors;  
* highly mechanical edits;  
* narrowly scoped tests.

### **Medium**

Default for:

* ordinary multi-file implementation;  
* bounded bugs;  
* state plumbing;  
* test-backed feature work;  
* changes with established architecture.

### **High**

Reserve for:

* cross-runtime implementation;  
* difficult state ownership;  
* subtle concurrency;  
* major migrations;  
* complicated persistence;  
* implementation where several architectural invariants interact.

Do not choose High merely because the project itself is sophisticated.

**Task difficulty, not project prestige, controls reasoning level.**

---

# **7\. ANTIGRAVITY — BOUNDED CHEAP WORKER**

Antigravity is useful for tightly fenced work.

Good uses:

* UI polish;  
* CSS;  
* layout corrections;  
* forensic inspection;  
* small bounded implementation;  
* report generation;  
* mechanical verification;  
* provenance investigations;  
* small HTML/DOM work.

Every Antigravity task should have an explicit scope fence.

Recommended standing fence:

\#\# AUTONOMY \+ SCOPE FENCE

&nbsp;

Work autonomously inside the task below. Do not ask for routine permission to inspect, edit, build, test, or verify what is necessary to complete it.

&nbsp;

Treat the requested task as a HARD SCOPE BOUNDARY:

&nbsp;

\- Change only what is necessary to accomplish the stated goal.

\- Do not opportunistically refactor, clean up, rename, redesign, or "improve" unrelated code.

\- Preserve all unrelated existing work, including dirty/uncommitted files.

\- Do not alter architecture, public contracts, persistence formats, dependencies, Git history, remotes, or deployment behavior unless the task explicitly requires it.

\- Prefer the smallest safe change that solves the problem.

\- Test your own work wherever automation can verify it.

\- If completing the task would require crossing this boundary, STOP and explain exactly why rather than expanding scope yourself.

&nbsp;

Inside the fence: be autonomous.

&nbsp;

At the fence: stop.

&nbsp;

A cheap worker with a good fence can perform enormous amounts of useful work safely.

---

# **8\. CHATGPT'S ROLE**

ChatGPT may serve several roles depending on available capacity.

Typical responsibilities include:

* project quarterback;  
* translating reports into human language;  
* deciding which agent should receive the next task;  
* writing handoff prompts;  
* interpreting Runtime Memory diagnostics;  
* synthesizing multiple agent reports;  
* preserving breadcrumbs;  
* deciding when architecture is actually necessary;  
* preventing duplicate investigation;  
* helping determine whether escalation is justified.

When the human asks:

> "Who should I send this to?"

ChatGPT should not answer merely:

> "Codex."

It should answer in a routing form such as:

Recommended destination:

Codex

&nbsp;

Model / configuration:

Terra

&nbsp;

Reasoning:

Medium

&nbsp;

Task difficulty:

Medium

&nbsp;

Why:

Architecture is already settled. This is a bounded multi-file implementation with tests.

&nbsp;

Why not Opus:

No unresolved architectural decision currently justifies spending architect capacity.

&nbsp;

Escalation:

If Codex discovers a real ownership contradiction, stop implementation and send only that contradiction to Sonnet or Opus.

&nbsp;

---

# **9\. TOKEN-STATUS ROUTING**

When the human reports current token availability, use it as another routing variable.

Example:

Claude

5-hour: 20%

weekly: 15%

&nbsp;

ChatGPT

window: 70%

weekly: 65%

&nbsp;

For a medium implementation task:

**Likely routing: Codex / ChatGPT-side worker.**

Preserve scarce Claude capacity for a future architectural decision.

Conversely:

Claude

fresh 5-hour window

weekly: 80%

&nbsp;

ChatGPT

weekly: 10%

&nbsp;

For a major architectural fork:

**Likely routing: Claude Opus.**

The correct destination changes according to both:

TASK SHAPE

\+

AVAILABLE CAPACITY

&nbsp;

Neither should be considered in isolation.

---

# **10\. DO NOT USE FIXED PERCENTAGE RULES UNLESS THE HUMAN CREATES THEM**

Avoid simplistic rules such as:

Below 20% never use Opus.

&nbsp;

That can produce terrible decisions.

A genuinely important architecture problem may justify using the final 10%.

A tiny CSS bug may not justify using Opus even at 100%.

Instead ask:

How valuable is premium reasoning HERE?

&nbsp;

Then compare that value against the capacity the human says should be preserved.

---

# **11\. THE ESCALATION LADDER**

Do not jump immediately to the strongest model when something goes wrong.

Use progressive escalation.

1\. Existing diagnostics / Runtime Memory

        ↓

2\. Cheapest capable forensic inspection

        ↓

3\. Primary implementation/reasoning worker

        ↓

4\. Strong reasoning worker

        ↓

5\. Architect only if the problem is actually architectural

&nbsp;

For projects implementing RUNTIME MEMORY:

problem observed

→ read current diagnostics

→ identify likely broken boundary

→ inspect source only where necessary

&nbsp;

Do not burn premium tokens reconstructing Runtime state the diagnostic system already knows.

---

# **12\. ESCALATE THE BLOCKER, NOT THE ENTIRE TASK**

This is one of the most important rules.

Suppose Codex successfully implements 80% of a feature but discovers one architectural ambiguity.

Do NOT automatically send the entire original mega-prompt to Opus.

Instead extract:

Here is the exact architecture blocker.

Here is the current implementation.

Here are the two competing ownership models.

Which contract is correct?

&nbsp;

Send **that small problem** to the stronger model.

Then return the answer to the cheaper worker.

Pattern:

Codex

  ↓

finds architecture blocker

  ↓

Opus answers ONLY blocker

  ↓

Codex resumes implementation

&nbsp;

This preserves both context and credits.

---

# **13\. PROMPT SIZE MUST MATCH TASK SIZE**

Prompt size should be proportional to:

* task complexity;  
* architectural risk;  
* number of affected systems;  
* number of invariants that must be preserved.

Tiny task:

tiny prompt

&nbsp;

Medium bounded implementation:

clear scope

important architecture anchors

acceptance criteria

tests

scope fence

&nbsp;

Major architectural feature:

full breadcrumbs

system explanation

contracts

risks

dependencies

ownership

future constraints

implementation phases

&nbsp;

Do not send a 5,000-word constitution to change button padding.

Do not send a six-sentence prompt for a cross-application architectural migration.

---

# **14\. CONTEXT IS ALSO A TOKEN BUDGET**

Do not repeatedly resend the entire history of a mature project.

Use durable project memory:

Docs ANCHOR

Diagnostics/

recent implementation reports

current contracts

targeted source files

&nbsp;

Prefer:

Read these 4 anchors and the newest relevant report.

&nbsp;

over:

Here are 70,000 tokens describing the last three weeks.

&nbsp;

The repository should gradually carry more of its own institutional memory.

---

# **15\. REPORTS ARE COMPRESSION DEVICES**

A good implementation report prevents the next agent from reconstructing completed work.

Reports should contain:

* what changed;  
* why;  
* files changed;  
* invariants affected;  
* tests;  
* unresolved issues;  
* final git state.

They should not become novels merely because the agent had a large context window.

Keep recent reports readily available.

Move durable architectural truth into anchors.

Git remains the deep archive.

---

# **16\. REPORT IDENTITY STANDARD**

Every generated architecture, implementation, forensic, or verification report should include the **exact report filename and timestamp at both the top and bottom**.

At the top:

REPORT FILE:

\<exact filename\>.md

&nbsp;

REPORT TIMESTAMP:

YYYY-MM-DD HH:MM MDT

&nbsp;

At the absolute bottom:

────────────────────────────────────────

REPORT FILE:

\<exact filename\>.md

&nbsp;

REPORT TIMESTAMP:

YYYY-MM-DD HH:MM MDT

────────────────────────────────────────

&nbsp;

Reason:

* the terminal often shows the end of an agent's output;  
* the bottom tells the human which file to open;  
* opening the report normally begins at the top;  
* the top confirms that the correct report was opened.

Nothing should appear after the footer.

Use the project's configured local timezone.

---

# **17\. HUMAN TESTING IS EXPENSIVE TOO**

Do not offload testing onto the human simply because the agent can ask.

The standing rule is:

> **If the machine can prove it, the machine should prove it.**

Agents should use:

* automated tests;  
* DOM assertions;  
* state snapshots;  
* event counting;  
* syntax validation;  
* test fixtures;  
* Runtime Memory;  
* browser automation where available.

Only request human tests for things automation genuinely cannot establish reliably.

Keep human test matrices extremely small.

The human will naturally discover additional issues during active product use.

---

# **18\. AVOID PARALLEL TOKEN CONFETTI**

Do not send the same unresolved task to:

* Opus;  
* Sonnet;  
* Codex;  
* ChatGPT;  
* Antigravity;

all at once merely to collect opinions.

That multiplies spend without necessarily multiplying truth.

Parallelize only when the work genuinely separates.

Example:

Agent A → Fill Panel capability implementation

&nbsp;

Agent B → Browser Gallery Hearts implementation

&nbsp;

is reasonable if the surfaces are independent.

But:

five agents independently diagnose one CSS bug

&nbsp;

is waste.

---

# **19\. ARCHITECT ONCE, IMPLEMENT MANY TIMES**

An expensive architecture pass should produce leverage.

Good architecture establishes:

* vocabulary;  
* contracts;  
* ownership;  
* invariants;  
* boundaries;  
* phases;  
* failure modes;  
* acceptance criteria.

Several cheaper implementation passes can then operate under that architecture.

If every implementation task has to return to Opus for basic decisions, the architecture was probably not durable enough.

---

# **20\. DO NOT RE-LITIGATE SETTLED ARCHITECTURE**

Before spending premium reasoning, check:

* architecture anchors;  
* current contracts;  
* newest relevant architecture report;  
* Runtime Memory;  
* implementation breadcrumbs.

If the question was already settled, follow the existing decision unless new evidence genuinely contradicts it.

Do not pay twice for the same decision.

---

# **21\. FORENSIC DEBUGGING PLAYBOOK**

When a bug appears:

1\. Capture Runtime Memory diagnostics if available.

&nbsp;

2\. Determine which boundary appears unhealthy.

&nbsp;

3\. Check whether the defect can be reproduced cheaply.

&nbsp;

4\. Send a bounded forensic task to the cheapest capable agent.

&nbsp;

5\. Separate:

   \- proven facts;

   \- hypotheses;

   \- unknowns.

&nbsp;

6\. Only escalate if the remaining uncertainty actually requires stronger reasoning.

&nbsp;

7\. Fix the proven defect.

&nbsp;

8\. Add regression coverage.

&nbsp;

9\. Do not opportunistically redesign surrounding architecture.

&nbsp;

A generic error message should not automatically trigger a repository-wide architecture audit.

---

# **22\. MODEL FAILURE DOES NOT AUTOMATICALLY MEAN MODEL ESCALATION**

A worker may fail because:

* the prompt was ambiguous;  
* the task was too large;  
* required context was missing;  
* the environment was broken;  
* the test harness failed;  
* the scope contained two unrelated problems.

Before escalating models, determine **why the attempt failed**.

Sometimes the cheapest fix is:

> Split the task.

not:

> Buy more intelligence.

---

# **23\. SPLIT LARGE TASKS BY DECISION BOUNDARY**

When token capacity is constrained, decomposition becomes especially valuable.

Instead of:

Redesign Runtime, implement it, migrate persistence,

build automation, fix mobile, test everything.

&nbsp;

split into:

A. architecture decision

B. state plumbing

C. Runtime implementation

D. persistence migration

E. UI

F. regression tests

&nbsp;

Each stage can then receive the cheapest suitable model.

---

# **24\. PRESERVE PREMIUM CAPACITY FOR SURPRISES**

Software development produces unexpected architecture problems.

Therefore, when several models can perform a known implementation equally safely, prefer the cheaper worker and preserve stronger capacity for:

* an unexpected data-loss risk;  
* a new architectural fork;  
* a cross-project contract;  
* an impossible-seeming bug;  
* a serious migration decision.

This is the AI equivalent of keeping dry powder.

---

# **25\. WHEN THE HUMAN ASKS FOR ROUTING, RESPOND IN THIS FORMAT**

Whenever the human says something such as:

> "I'm at 20% Claude five-hour, 15% Claude weekly, 60% ChatGPT weekly. Who gets this?"

return a compact routing decision:

TASK:

\<short classification\>

&nbsp;

RECOMMENDED AGENT:

\<Codex / Sonnet / Opus / AGY / etc.\>

&nbsp;

MODEL:

\<exact currently available model\>

&nbsp;

REASONING / EFFORT:

\<Low / Medium / High / etc.\>

&nbsp;

TASK DIFFICULTY:

\<Low / Medium / High / Architecture\>

&nbsp;

WHY THIS ROUTE:

\<2–4 sentences\>

&nbsp;

WHY NOT THE MORE EXPENSIVE MODEL:

\<brief reason, when relevant\>

&nbsp;

TOKEN STRATEGY:

\<what capacity this preserves\>

&nbsp;

ESCALATION CONDITION:

\<specific condition that would justify moving upward\>

&nbsp;

Do not make the human reverse-engineer the recommendation.

---

# **26\. EXAMPLE — LOW CLAUDE CAPACITY**

Human:

Claude:

5-hour 20%

weekly 15%

&nbsp;

ChatGPT:

window 70%

weekly 60%

&nbsp;

Task:

Implement an already-approved Settings panel and tests.

&nbsp;

Recommended response:

RECOMMENDED AGENT:

Codex

&nbsp;

MODEL:

current primary Codex implementation model

&nbsp;

EFFORT:

Medium

&nbsp;

TASK DIFFICULTY:

Medium

&nbsp;

WHY:

The architecture is already decided. This is bounded implementation and test work.

&nbsp;

TOKEN STRATEGY:

Preserve the remaining Claude capacity for architecture or unexpected blockers.

&nbsp;

ESCALATE ONLY IF:

Codex discovers a genuine ownership or contract contradiction.

&nbsp;

---

# **27\. EXAMPLE — FRESH PREMIUM WINDOW**

Human:

Claude:

fresh 5-hour window

weekly 72%

&nbsp;

Task:

We need to decide how three applications should share identity,

persistence, automation ownership, and cross-device synchronization.

&nbsp;

Recommended:

AGENT:

Claude Opus

&nbsp;

ROLE:

Architect

&nbsp;

TASK DIFFICULTY:

High architecture

&nbsp;

WHY:

The decision will govern multiple systems and future implementation passes.

&nbsp;

FOLLOW-UP:

Send implementation to Sonnet or Codex after Opus locks the contracts.

&nbsp;

---

# **28\. EXAMPLE — TINY UI DEFECT**

Task:

The Settings list needs the icon moved 6px and the label aligned.

&nbsp;

Even with abundant premium capacity:

AGENT:

Antigravity or lightweight Codex

&nbsp;

EFFORT:

Low

&nbsp;

WHY:

This is bounded presentation work with no architectural uncertainty.

&nbsp;

OPUS:

Not justified.

&nbsp;

Availability does not create complexity where none exists.

---

# **29\. EXAMPLE — WEIRD BUG**

Task:

Nested Runtime Undo sometimes affects the wrong Panel.

&nbsp;

Do not automatically use Opus.

Start with:

Runtime Memory

→ reproduction

→ bounded forensic investigation

→ existing ownership contracts

&nbsp;

If the evidence reveals:

implementation violates known contract

&nbsp;

send fix to Codex/Sonnet.

If it reveals:

two contracts conflict and ownership is genuinely undefined

&nbsp;

then escalate that exact contradiction to Opus.

---

# **30\. COST IS GLOBAL, NOT LOCAL**

A cheaper model can become more expensive overall if it:

* repeatedly misunderstands architecture;  
* causes regressions;  
* needs three retries;  
* produces huge forensic cleanup;  
* destroys state;  
* requires expensive review.

Likewise, using Opus for every simple implementation wastes capacity.

Therefore evaluate:

> **total workflow cost**

not merely:

> tokens consumed by this single prompt.

The cheapest safe workflow wins.

---

# **31\. QUALITY FLOOR**

Never route a task to a model that is clearly below the capability needed to perform it safely merely to conserve tokens.

Conservation must not create:

* data-loss risk;  
* architectural drift;  
* broken persistence;  
* security mistakes;  
* repeated retries;  
* corrupted Git history.

There is a minimum safe intelligence level for every task.

Stay above it.

---

# **32\. USER OVERRIDE**

The human can override routing at any time.

Examples:

"Use Opus anyway."

&nbsp;

"I don't care about credits today."

&nbsp;

"Keep Claude untouched."

&nbsp;

"Only use Codex."

&nbsp;

"Give AGY a shot first."

&nbsp;

"I want Sonnet reviewing this."

&nbsp;

"Spend the premium window."

&nbsp;

Follow that instruction.

You may explain tradeoffs, but the final routing authority belongs to the human.

---

# **33\. STANDING ONBOARDING INSTRUCTION FOR EVERY AI**

When joining this project:

1. Learn the available agent/model ecosystem.  
2. Learn the project's architecture and testing conventions.  
3. Treat reported token/credit availability from the human as authoritative.  
4. Never assume the strongest model should do every task.  
5. Never assume the cheapest model should do every task.  
6. Route according to task uncertainty, blast radius, and available capacity.  
7. Preserve premium reasoning for decisions where it creates leverage.  
8. Push settled implementation downward to capable workers.  
9. Escalate exact blockers rather than entire projects.  
10. Keep prompts proportional to tasks.  
11. Use diagnostics and existing project memory before repository archaeology.  
12. Automate tests whenever possible.  
13. Preserve human testing for genuinely human-only behavior.  
14. Do not re-litigate settled architecture without new evidence.  
15. Always tell the human which agent, model, and reasoning level you recommend when routing is requested.

---

# **34\. ONE-SENTENCE VERSION**

When everything else is forgotten, remember:

> **Use the cheapest model that can safely solve the known problem, and save the strongest model for the parts we do not yet understand.**

---

# **35\. THE PLAYBOOK'S PURPOSE**

This system exists to prevent two opposite forms of waste:

UNDERSPENDING

→ weak worker tackles architecture

→ confusion

→ retries

→ regressions

→ expensive cleanup

&nbsp;

and:

OVERSPENDING

→ premium architect performs mechanical work

→ scarce reasoning capacity disappears

→ nothing was gained from the premium spend

&nbsp;

The target is the middle:

RIGHT INTELLIGENCE

      \+

RIGHT TASK

      \+

RIGHT MOMENT

      \+

RIGHT AMOUNT OF CONTEXT

      \=

HIGH-LEVERAGE AI DEVELOPMENT

&nbsp;

The human controls the budget.

The architecture controls the boundaries.

The task determines the intelligence required.

The routing system connects the three.

&nbsp;