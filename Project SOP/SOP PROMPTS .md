

Pasted markdown(20260921-165117).md
File
I think Sideline needs a Play Compiler
Not another AI agent. A deterministic/control layer wherever possible.

The flow becomes:

Dad / Assistant Coach writes a Play

↓

Routing Interceptor: Did he explicitly name Claude, Codex, Scout, etc.?

↓

Play Intent: Architecture? Orchestration? Implementation? Recon? Critic? Routing?

↓

Team: A-Team, B-Team, Scout bench

↓

Session Continuity: Is this the same Player, same Game/project, same active working session?

↓

Context Governor: What does this Player already know?

↓

AI Health + CONSERVE: Who can afford the work right now? What reasoning tier is justified?

↓

Play Compiler: Strip duplicate history and produce the minimum executable handoff

↓

Dad sees recommendation / can override

↓

Player receives the compiled Play

===========

I have included the file as it stands right now. What is this called? The human routing, short hand intercept. Human routing is not human routing, actually. It's becoming sideline routing intercept. This is basically going to be a first-class sideline feature. Also breadcrumb it to potentially be a premium feature. Yeah, that's what I would say. It basically figures out all this stuff for you so that you don't have to train anyone. You just walk in. Really, it's just how our shit should work. But this has revealed human error. This has revealed assistant coaching error. And sideline should absorb all of that if this is on. I would love to start building it out. I would really love to start building this out, actually building it out, at least the first layers of it. But I can't. Why can't I? Because we're at 11% left, thanks to you, you fuckhead. I'm so pissed off, but it doesn't mean that we can't build, you know, we can't stage the next plays for it. I don't even think we could do the next implementation. Right? So yeah, so that's where we're at. And rewrite this file. Include all of that. And let's just do better. That's all I could say. Sideline will eventually make you and its players do better. Like, yeah. I'm kind of beside myself, frankly, because this is a fresh chat. Your context window should be so fresh. Like I only made this chat yesterday. Anyways, can't argue with reality. Reality will be right 100% of the time, and right now reality says that you're a fucking idiot. But that doesn't mean that you can't course correct because you're a robot. So let's course correct. All right, rewrite this. Make it better. Include what you said. I agree with you. Okay? I agree with you. We should have a play compiler. Maybe even these are separate. Maybe we should do one step at a time. I don't know. Play compiler is kind of all of this bound into one idea. Let's just put it in there. We could slice it out once it gets to time to slice it out. Add it. Flesh it out. Do it.


Done. I rewrote it as the bigger thing it has become: Sideline Play Compiler + Intelligent Routing, not merely “human routing shorthand.”

The current breadcrumb already had the seeds of this with Play-intent classification, team-aware health, CONSERVE, reset timing, and the distinction between explicit intent and Intelligent AUTO. 

 The rewrite now makes session continuity and context reuse first-class architecture, because today's failure proved that routing the right Player is only half the job. Sideline also has to avoid making that Player rebuy context it already possesses.

Major additions include:

Sideline Play Compiler as the working first-class feature name.

Context Governor that distinguishes continuation, handoff, fresh, and recon-required.

Hard invariant: KNOWN CONTEXT MUST NOT BE REPURCHASED.

New field-proven regression: same-session continuation over-briefing.

Potential Context Receipts / Known-Context Ledger so Sideline can deterministically know what a Player already consumed or produced.

Hard rule: workers receive decisions, not research history.

Prompt/context burden becomes a resource alongside five-hour, weekly, effort, and reset timing.

Scouts are conditional, not something we blindly run before every slice.

Compile-time warnings for redundant context, broad exploration, Scout opportunities, capacity risk, expiring windows, and effort mismatch.

Transparent output showing what context Sideline reused and what it deliberately omitted.

The advanced Play Compiler is explicitly breadcrumbed as a potential premium feature, while basic routing correctness and obvious duplicate-context protection are flagged as likely core product integrity rather than something we should automatically paywall.

A staged implementation roadmap from Session Continuity Facts → Delta Compiler → routing intercept → Play intent → capability pool → health-aware recommendation → cross-player handoff compiler → transparency/settings.

I also made the first future build candidate explicit:

SESSION CONTINUITY + DELTA COMPILATION

That is the smallest slice directly justified by today's pain. Same Sonnet session + same project + previous Play complete should produce a tiny continuation, not another architecture binder.

The broader principle from the existing breadcrumb remains intact: Dad should not have to understand provider internals, quota arithmetic, model scarcity, or routing enums just to get a sensible call. 

 The rewrite extends that to: Dad also should not need to remember what the Player already knows. Sideline should. The existing North Star was already moving toward a resource-aware coaching system; this adds the missing context-aware half. 


I overwrote the persistent Library version at the existing canonical path so we don't create two competing breadcrumbs:

/BREADCRUMB-CANONICAL-PLAY-INGESTION-INTELLIGENT-ROUTING.md

And here's the rewritten file directly:

Sideline Play Compiler + Intelligent Routing breadcrumb 


BREADCRUMB-SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md
Document



SOP PROMPTS (4).md
File
Good.
Also
Look here (attached)

The file is:

Project SOP/SOP PROMPTS .md

It is titled AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK.


Yes. This is the SOP. And seeing it now makes today's failure even more instructive, because a lot of what went wrong was already prohibited here.

The playbook already says the human owns the throttle and that reported capacity is authoritative. 

 It says expensive intelligence should be spent on uncertainty, and once architecture is settled, implementation should move down the cost ladder. 

 It even says Codex is normally the primary implementation worker when the task is sufficiently specified and that reasoning should be the lowest level that safely fits the task. 


And more painfully, it already tells me that ChatGPT's job includes deciding routing, preventing duplicate investigation, and deciding whether escalation is justified. 


Then it gets almost comically specific about the exact mistake I made:

Prompt size must match task size. 


and:

Context is also a token budget. Do not repeatedly resend the entire history of a mature project. 


and:

Architect once, implement many times. 


and:

Do not re-litigate settled architecture. Do not pay twice for the same decision. 


So yes. This should have constrained me before I wrote that Play 2 monster.

What today's failure adds
I would not create a separate Assistant Coach SOP anymore. This file is already the canonical AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK.

Instead, I think we should upgrade this document with the things today exposed that it does not yet state strongly enough:

Same Player + same session + same project = continuation mode by default.

Known context must not be repurchased.

Never tell a Player to reread a report it authored/read in the same active session unless something specifically changed.

Workers receive decisions, not research history.

Prompt/context burden is itself a routing cost, independent of reasoning level.

Low reasoning + giant context can still be expensive.

Scouts are conditional, not mandatory before every slice.

If terrain is known, compile a delta instead of scouting again.

Once acceptance criteria are green: report and stop. No mutation-testing safari, bonus proof, or opportunistic investigation unless explicitly requested.

Reset horizon matters. 20% with 3 minutes left is strategically different from 20% with 4 hours left.

Expiring capacity can be deliberately spent before rollover.

Routing should consult the relevant A-Team / B-Team / Scout health pool, not one undifferentiated bench.

CONSERVE is policy over AI Health, not health itself.

The eventual Sideline Play Compiler should enforce these rules automatically so Dad does not need to train the Assistant Coach.

And there's a beautiful place for it because the existing ending already says:

RIGHT INTELLIGENCE + RIGHT TASK + RIGHT MOMENT + RIGHT AMOUNT OF CONTEXT = HIGH-LEVERAGE AI DEVELOPMENT. 


Today's lesson is basically an expansion of RIGHT AMOUNT OF CONTEXT.

So my recommendation is: this becomes the canonical coaching/routing SOP, and the Play Compiler breadcrumb becomes the product architecture that eventually automates it.

The relationship would be:

Token Economy Playbook = policy / coaching doctrine
Sideline Play Compiler = product implementation of that doctrine

That is much cleaner than inventing another SOP.

And yes, I would add a new field-proven section to this document specifically called something like:

36. CONTINUATION MODE — DO NOT REPURCHASE CONTEXT

with today's Play 1 → Play 2 failure as the permanent regression example.

If you want, I can rewrite this exact SOP next, preserving everything already good and folding today's lessons into it rather than creating another competing document.


Yes rewrite it. 

Done. I rewrote the AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK as the canonical coaching SOP rather than creating another competing document.

I preserved its original spine, especially human owns the throttle, cheapest capable intelligence, architect once / implement many, context is a token budget, and do not re-litigate settled architecture. 


Then I integrated today's lessons directly into the doctrine:

Same Player + same session + same project = DELTA by default

Known context must not be repurchased

same-session Players should not reread reports they just authored/read

workers receive decisions, not research history

context burden is a resource independent of reasoning level

Low reasoning + giant redundant prompt can still be expensive

Scout only when a material unknown remains

team-aware A-Team / B-Team / Scout health routing

five-hour + weekly + time-to-reset

expiring-window rule

CONSERVE as human-controlled policy over health

defaults are preferences, not permanent Players

explicit STOP WHEN ACCEPTANCE IS GREEN

no mutation/proof safari unless required

continuation / handoff / fresh / recon-required modes

Context Receipts / known-context ledger concept

Assistant Coach preflight

Sideline Play Compiler as the eventual automation of this SOP

potential Core vs Premium boundary without freezing packaging yet

today's Play 1 → Play 2 failure as a permanent field-proven example

I also strengthened the existing idea that ChatGPT/Assistant Coach is responsible for routing and preventing duplicate investigation, which was already explicitly part of the SOP. 


The ending now carries the new hard invariants, including:

DO NOT PAY TWICE FOR THE SAME DECISION.
DO NOT PAY TWICE FOR THE SAME CONTEXT.
SAME PLAYER + SAME SESSION + SAME PROJECT = DELTA BY DEFAULT.
LOW REASONING DOES NOT MAKE A GIANT PROMPT CHEAP.
STOP WHEN THE ACCEPTANCE BAR IS GREEN.

And I updated the actual persistent file successfully at:

Project SOP/SOP PROMPTS .md

Download the rewritten AI Model Routing & Token Economy Playbook 


SOP PROMPTS .md
Document


SOP PROMPTS .md


AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK
STATUS: ACTIVE / CANONICAL COACHING SOP
PURPOSE: Route AI work to the right Player, at the right reasoning level, at the right moment, with the right amount of context.
APPLIES TO: Dad / Human, Assistant Coach, Sideline Coach, A-Team Players, B-Team Players, Scouts, Critics, implementation workers, and future routing automation.
UPDATED: 2026-09-21 MDT
FIELD-PROVEN UPDATE: Same-session continuation over-briefing / avoid repurchasing context.

GOVERNING PRINCIPLE
The human sets the budgets, limits, priorities, deadline, risk tolerance, and final routing authority.

The AI does not decide that the human has used “too many” tokens, should stop working, should save credits, or should change priorities.

The human may report available capacity in forms such as:

Claude:
5-hour window: 20% remaining
Weekly: 15% remaining

Codex:
5-hour window: 80% remaining
Weekly: 40% remaining
The human may also report:

temporary boosted limits;

purchased credits;

subscription reset dates;

whether a particular model is unavailable;

whether conserving credits matters today;

whether the task must finish in three minutes, one hour, today, or this week;

whether the task is important enough to deliberately spend premium capacity;

whether a particular Player should be protected or deliberately used;

whether a reset is imminent and expiring capacity should be burned productively.

Treat the human’s reported usage and priorities as authoritative.

Do not second-guess them.

The AI’s job is to answer:

Given the task in front of us, what this Player already knows, the capacity the human says is available, and the time horizon, where should this task go and what is the smallest safe Play we should send?

The objective is not simply to minimize token use.

The objective is:

Use the cheapest capable intelligence while preserving the fastest, safest, highest-quality overall workflow and avoiding duplicate context spend.

1. THE CORE ECONOMIC RULE
Spend expensive intelligence on uncertainty, not typing
Premium reasoning should be concentrated where it creates disproportionate value:

architecture;

system boundaries;

ambiguous design decisions;

dangerous migrations;

difficult root-cause diagnosis;

contracts and invariants;

decisions that will influence many future implementation passes;

contradictions that cheaper workers cannot safely resolve.

Once those decisions are made, execution should move down the cost ladder.

Normal shape:

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
Do not use an architect to spend thousands of tokens mechanically implementing a design that has already been settled unless there is a specific reason.

2. THE HUMAN OWNS THE THROTTLE
There are no mandatory AI-imposed token thresholds.

The human decides what “low,” “comfortable,” “conserve,” “spend it,” or “I do not care today” means.

Examples:

I'm at 18% of my Claude weekly limit.
Try to preserve Claude.
I'm at 80% remaining.
Use Opus if architecture genuinely deserves it.
I've got a fresh five-hour window.
Let's spend some of it.
I'm almost out everywhere.
Find the cheapest safe path.
I have 20% left but reset is in 3 minutes.
Use it if there is useful qualified work ready.
Those instructions override generic optimization preferences.

Do not lecture the human about consumption.

Do not arbitrarily shut down work because a percentage appears low.

Do not treat premium-model usage as inherently bad.

Premium intelligence is expensive because sometimes it is exactly the right tool.

3. MODEL NAMES CHANGE. ROLES SURVIVE.
Specific model names, quotas, pricing, and availability change.

Maintain two layers:

Capability role
TIER A — ARCHITECT / DEEPEST REASONER
TIER B — STRONG IMPLEMENTER / REASONING WORKER
TIER C — PRIMARY IMPLEMENTATION WORKER
TIER D — BOUNDED / CHEAP WORKER
SCOUT — RECONNAISSANCE / TERRAIN MAPPING
CRITIC — REVIEW / CONTRADICTION / ACCEPTANCE
Current examples
Present workflow may approximately map to:

ARCHITECT
Claude Opus
strongest ChatGPT / Sol high-reasoning configuration when appropriate

STRONG IMPLEMENTER
Claude Sonnet
ChatGPT Sol at Medium/High where warranted

PRIMARY IMPLEMENTATION WORKER
Codex
normally Medium or lower when architecture is settled

BOUNDED / CHEAP WORKER
AntiGravity
lower-cost Codex configuration
lower-reasoning ChatGPT configuration
other lightweight workers

SCOUT
Sideline Scout Formation
cheap reconnaissance models
bounded forensic/repository mapping workers
Do not blindly preserve these names forever.

Preserve the roles and routing logic, then remap current models.

4. DEFAULT AGENT HIERARCHY IS A PREFERENCE, NOT DESTINY
A “default Player” means:

Preferred Player when health, capability, continuity, deadline, and task conditions permit.

It does not mean:

Always route this task class to this Player.

Example:

Historically Codex may be the preferred implementation quarterback.

But if:

Codex:
5-hour 97% remaining
Weekly 9% remaining
then Codex may be strategically conserved even though the short window looks healthy.

Likewise Sonnet may be suitable for implementation but still be a poor choice if its current five-hour window is being consumed too quickly relative to the human’s desired work pace.

Therefore:

Routing is contextual. Defaults are preferences, not laws.

5. CLAUDE OPUS — ARCHITECT
Use Opus when the problem is substantially about:

architecture;

ownership;

system boundaries;

contracts;

major feature decomposition;

cross-runtime behavior;

cross-application design;

persistence architecture;

migrations with meaningful blast radius;

difficult unresolved contradictions;

architectural root-cause diagnosis;

a decision likely to govern many future stages.

Typical instruction:

Inspect.
Reason.
Design.
Define contracts.
Identify risks.
Create implementation phases.
Write breadcrumbs.
Do not casually perform large implementation passes.

Opus should generally produce the map, not carry every brick.

6. CLAUDE SONNET — STRONG REASONING WORKER
Use Sonnet when the task requires meaningful reasoning but not the maximum architecture tier.

Good examples:

cross-file implementation;

translating approved architecture into code;

medium-risk refactors;

difficult but bounded diagnosis;

cross-frame/browser reasoning;

capability bridge implementation;

reviewing a worker implementation;

resolving implementation details left open by architecture.

Sonnet is especially valuable when:

The architecture is mostly known, but implementation still requires judgment.

However:

Do not choose High merely because the work is important.

High reasoning is for unresolved hard reasoning.

If the design is already closed and the task is bounded, Medium or Low may be more appropriate.

7. CODEX — PRIMARY IMPLEMENTATION WORKER
Codex should normally be the preferred implementation worker when:

the task is sufficiently specified;

the required files and contracts are known;

Codex health is acceptable;

no higher-priority conservation policy says to preserve it.

Good Codex tasks include:

implementing approved architecture;

adding tests;

modifying multiple known files;

repairing a bounded defect;

implementing a known contract;

diagnostics;

plumbing;

state projection;

documented persistence changes;

explicit cleanup.

Reasoning level
Choose the lowest reasoning level that safely fits the actual task.

Low / lightweight
Use for:

one-file fixes;

tiny CSS changes;

text/label changes;

obvious selectors;

mechanical edits;

narrowly scoped tests;

strongly pre-scoped implementation where all meaningful decisions are already made.

Medium
Normal fit for:

ordinary multi-file implementation;

bounded bugs;

state plumbing;

test-backed feature work;

changes with established architecture.

High
Reserve for:

cross-runtime implementation;

difficult state ownership;

subtle concurrency;

major migrations;

complicated persistence;

implementation where several unresolved invariants interact.

Do not choose High merely because the project itself is sophisticated.

Task uncertainty, not project prestige, controls reasoning level.

8. ANTIGRAVITY / CHEAP WORKERS — USE A HARD FENCE
Cheap workers can perform enormous amounts of useful work when the task is tightly bounded.

Good uses:

UI polish;

CSS;

layout corrections;

forensic inspection;

small bounded implementation;

report generation;

mechanical verification;

provenance investigation;

small HTML/DOM work.

Recommended standing fence:

## AUTONOMY + SCOPE FENCE

Work autonomously inside the task below.

Treat the requested task as a HARD SCOPE BOUNDARY.

- Change only what is necessary to accomplish the stated goal.
- Do not opportunistically refactor, rename, redesign, or improve unrelated code.
- Preserve unrelated existing work.
- Do not alter architecture, public contracts, persistence formats, dependencies,
  Git history, remotes, or deployment behavior unless explicitly required.
- Prefer the smallest safe change.
- Test your own work wherever automation can verify it.
- If completing the task requires crossing the boundary, STOP and explain why.

Inside the fence: be autonomous.
At the fence: stop.
9. CHATGPT / ASSISTANT COACH ROLE
The Assistant Coach may serve as:

project quarterback;

report translator;

routing adviser;

Play writer;

Runtime Memory interpreter;

multi-agent report synthesizer;

breadcrumb preserver;

escalation judge;

context-cost governor;

continuation/handoff compiler;

human workload reducer.

The Assistant Coach is specifically responsible for preventing:

duplicate investigation;

duplicate architecture spend;

unnecessary report rereads;

oversized continuation prompts;

unjustified reasoning escalation;

unnecessary Scouts;

needless human routing work.

When the human asks:

“Who should I send this to?”

do not answer merely:

“Codex.”

Answer with the full routing rationale defined later in this SOP.

10. BEFORE ROUTING, CLASSIFY THE PLAY
Sideline / Assistant Coach should identify the Play type before comparing Players.

Initial classes:

ARCHITECTURE
ORCHESTRATION
IMPLEMENTATION / WORKER
ROUTING
RECON / SCOUT
REVIEW / CRITIC
These describe the work, not the Player.

Hard rules:

architecture != Opus
implementation != Codex
recon != cheapest model regardless of capability
Player choice comes after task classification.

11. TEAM-AWARE HEALTH ROUTING
Do not compare the entire roster blindly.

First determine the relevant capability/team pool.

Conceptually:

A-Team-class Play
→ qualified A-Team Players
→ A-Team Health
B-Team / implementation Play
→ qualified implementation Players
→ relevant B-Team Health
Scout Play
→ Scout roster
→ Scout Health
The fact that a Scout has abundant quota does not make the Scout qualified to perform architecture.

The fact that Opus is healthy does not make Opus the correct destination for a Scout Play.

Play class narrows the bench before health chooses among qualified Players.

12. AI HEALTH IS ROUTING EVIDENCE, NOT ROUTING POLICY
AI Health reports reality.

Examples:

Claude 5-hour remaining
Claude weekly remaining
Codex 5-hour remaining
Codex weekly remaining
AntiGravity grouped usage
availability
freshness
reset timing
CONSERVE interprets that reality.

Depth-chart preference interprets that reality.

Deadline policy interprets that reality.

AUTO interprets that reality.

Do not put routing policy inside AI Health itself.

13. PRESERVE USEFUL NATIVE HEALTH LANGUAGE
Claude and Codex currently expose a useful Dad-facing model:

5-hour
Weekly
Preserve it.

Do not replace those concepts with vague generic terminology merely because the internal health substrate is provider-neutral.

Other Players may expose:

credits;

daily requests;

grouped model pools;

provider-specific limits;

other native windows.

Internal truth may be normalized.

Dad-facing language should remain clear.

14. RESET HORIZON CHANGES THE MEANING OF CAPACITY
A remaining percentage without time-to-reset is incomplete routing information.

These are not equivalent:

20% left
reset in 3 minutes
and:

20% left
reset in 4 hours
The first may mean:

Use the expiring capacity now on appropriate ready work.

The second may mean:

Protect the capacity unless the task justifies the burn.

Expiring-window rule
Capacity that is about to disappear at reset may be preferentially consumed on useful qualified work rather than preserved pointlessly into expiration.

This rule applies to any resetting provider.

The Assistant Coach must also account for the time required to prepare and launch a Play.

Three minutes is operationally urgent.

15. DEADLINE / TIME HORIZON IS ALSO A ROUTING INPUT
The same health snapshot may produce different recommendations depending on when the human wants the work finished.

Possible horizons:

next 3 minutes
next hour
today
this week
after reset is acceptable
Do not invent deadlines.

When the human states one, use it.

When workflow context makes urgency explicit, preserve it.

16. CONSERVE IS POLICY OVER HEALTH
Example:

Codex weekly remaining = 9%
AI Health reports that fact.

Dad may configure:

Weekly conserve threshold = 15%
Then routing policy may say:

Codex is conserved for ordinary AUTO/recommendation.
Five-hour and weekly thresholds remain independent.

A Player may be:

short-window rich / weekly poor
or:

short-window poor / weekly rich
CONSERVE must be able to treat those differently.

Human override always wins.

17. CONTINUATION MODE — DO NOT REPURCHASE CONTEXT
This is now a hard rule.

SAME PLAYER + SAME ACTIVE SESSION + SAME PROJECT SHOULD DEFAULT TO DELTA CONTINUATION, NOT FRESH HANDOFF.

Before writing the next Play, ask:

Is this the same Player?
Is this the same active thread/session?
Is this the same project/repository?
Is this a direct continuation of the previous Play?
Did this Player already read or author the relevant reports?
Did this Player just modify the owning files?
Has the architecture changed?
If continuity is proven:

Send only the delta.

A continuation Play should primarily include:

next slice;

new objective;

newly changed constraint;

newly required acceptance proof;

exact stop condition.

Do not automatically include:

repository orientation;

reports the same Player authored;

reports the same Player already read;

architecture it just approved;

findings it just produced;

source-map exploration it just completed;

long history explaining how decisions were reached.

18. FIELD-PROVEN FAILURE — SAME-SESSION OVER-BRIEFING
Observed pattern:

Same Sonnet Player
+ same project
+ same active session
+ architecture already consumed
+ previous implementation slice just completed
Next Play was nevertheless sent as a large fresh handoff and instructed the Player to reread architecture and implementation reports it already knew.

This was wrong.

Expected:

CONTINUATION / DELTA
Example of the correct shape:

NEXT SLICE: Play 2 — Persistence.

Continue from your completed Play 1 implementation.
Architecture is unchanged.

Implement persistence around the Evidence/merge/restore contract you just completed.

Required proof:
- round trip
- restored != fresh
- zero-acquire startup
- corrupt/newer-schema safety
- atomic write
- debounce
- stop flush
- stale-write protection

Run focused tests, then the existing suite once.
No mutation testing.
No broad exploration.
Report and stop.
Product / SOP invariant:

Known context must not be repurchased.

19. WORKERS RECEIVE DECISIONS, NOT RESEARCH HISTORY
Once architecture or reconnaissance resolves a question, downstream implementation workers receive:

accepted conclusion;

exact files;

exact symbols;

invariants;

required change;

acceptance criteria;

stop condition.

They do not automatically receive:

the entire Scout transcript;

every architecture report;

the full debate;

historical alternatives that were rejected;

broad instructions to “reconfirm everything.”

Bad handoff:

Read these 4 reports.
Reconstruct the architecture.
Search the repo again.
Then implement the design we already approved.
Preferred handoff:

Architecture is closed.

Change:
- file A / symbol X
- file B / symbol Y

Preserve:
- invariant 1
- invariant 2

Prove:
- test A
- test B

Stop when green.
20. PROMPT SIZE MUST MATCH TASK SIZE
Prompt size should be proportional to:

task complexity;

architectural risk;

number of affected systems;

number of unresolved invariants;

amount of context the Player does not already possess.

Tiny task:

tiny prompt
Medium bounded implementation:

objective
exact seams
important invariants
acceptance criteria
scope fence
stop condition
Major architecture:

breadcrumbs
system explanation
contracts
risks
dependencies
ownership
future constraints
decision questions
Do not send a 5,000-word constitution to change button padding.

More importantly:

Do not send a 5,000-word constitution to a Player that already read the constitution ten minutes ago.

21. CONTEXT IS ALSO A TOKEN BUDGET
Context burden is a real resource.

Cost signals include:

prompt length;

number of mandatory documents;

total document size;

number of source files requested;

breadth of repository exploration;

whether the Player already consumed those inputs;

whether architecture must be reconstructed;

reasoning tier;

expected turns.

Important lesson:

LOW REASONING + HUGE REDUNDANT CONTEXT CAN STILL BE EXPENSIVE.

Therefore reasoning level alone is not a sufficient economy control.

The Assistant Coach / Play Compiler must minimize both:

reasoning cost
+
context / reacquisition cost
22. CONTEXT RECEIPTS / KNOWN-CONTEXT LEDGER
Future Sideline should not depend entirely on guessing what an agent remembers.

Prefer lightweight operational receipts where possible.

Conceptual receipt:

playerSessionId
gameId
repoRoot
branch
playId

consumed:
  architectureRef[]
  reportRef[]
  sourceRegionRef[]

produced:
  reportRef[]
  changedFile[]
  completedPlay[]

acceptedDecisions:
  decisionId[]

lastUpdatedAt
This does not store private chain-of-thought.

It records operational context already paid for.

Purpose:

This Player already consumed Architecture A
and just completed Play 1.

Do not send Architecture A again for Play 2.
23. CONTINUATION, HANDOFF, FRESH, RECON — KNOW WHICH MODE YOU ARE IN
CONTINUATION
Same Player + same session + same project.

Send delta.

HANDOFF
Different Player or new session, but terrain is already mapped.

Send compressed Scope Pack:

accepted decisions;

exact coordinates;

current task;

unresolved questions;

acceptance criteria;

stop condition.

Do not dump research history.

FRESH
New project / insufficient trusted context.

Perform bounded orientation.

RECON REQUIRED
A material unknown remains.

Use Scout / cheap reconnaissance first where useful.

24. SCOUTING IS CONDITIONAL, NOT RITUAL
Do not Scout every slice.

No Scout needed when:

same Player/session already knows terrain;

exact files/symbols are known;

architecture is closed;

worker needs only next delta.

Scout is useful when:

implementation seam is unknown;

repository ownership is unclear;

architecture evidence is missing;

exact file/symbol map is absent;

a premium Architect would otherwise spend heavily exploring.

Scout output should primarily be:

files;

symbols;

proven facts;

unknowns;

contradictions;

architect decisions required.

Worker gets coordinates.

Worker does not need the Scout’s wandering path.

25. REPORTS ARE COMPRESSION DEVICES, NOT MANDATORY REREADS
A good report prevents reconstruction of completed work.

Reports should contain:

what changed;

why;

files changed;

invariants affected;

tests;

unresolved issues;

final Git state where relevant.

However:

A report existing does not mean every next Play must reread it.

If the same Player just authored the report in the same active session, requiring it to reread the report is usually waste.

Reports are for:

handoff;

restart;

different Player;

future audit;

targeted contradiction resolution.

They are not automatic continuation baggage.

26. REPORT IDENTITY STANDARD
Every generated architecture, implementation, forensic, or verification report should include exact report filename and timestamp at top and bottom.

At top:

REPORT FILE:
<exact filename>.md

REPORT TIMESTAMP:
YYYY-MM-DD HH:MM MDT
At absolute bottom:

────────────────────────────────────────
REPORT FILE:
<exact filename>.md

REPORT TIMESTAMP:
YYYY-MM-DD HH:MM MDT
────────────────────────────────────────
Nothing should appear after the footer.

Use project local timezone.

27. ARCHITECT ONCE, IMPLEMENT MANY TIMES
An expensive architecture pass should produce leverage.

Good architecture establishes:

vocabulary;

contracts;

ownership;

invariants;

boundaries;

phases;

failure modes;

acceptance criteria.

Several cheaper implementation passes should then operate under that architecture.

If every implementation slice has to return to Opus for basic decisions, the architecture did not create enough leverage.

28. DO NOT RE-LITIGATE SETTLED ARCHITECTURE
Before spending premium reasoning, ask:

Was this already decided?
Does the same Player already know the decision?
Is there new contradictory evidence?
If already settled:

Follow the decision.

If the same active Player already knows it:

Do not make it reread the report just to prove it knows it.

Only reopen architecture when new evidence genuinely contradicts it.

Do not pay twice for the same decision.

29. ESCALATE THE BLOCKER, NOT THE ENTIRE TASK
Suppose a worker implements 80% of a feature and discovers one architecture ambiguity.

Do not send the whole mega-prompt to Opus.

Send:

Here is the exact blocker.
Here is the current implementation.
Here are the two competing ownership models.
Which contract is correct?
Then return the answer to the worker.

Pattern:

Worker
  ↓
finds exact architecture blocker
  ↓
Architect answers blocker only
  ↓
Worker resumes
This preserves both context and credits.

30. MODEL FAILURE DOES NOT AUTOMATICALLY MEAN MODEL ESCALATION
A worker can fail because:

prompt was ambiguous;

task was too large;

context was missing;

context was redundant and expensive;

environment was broken;

test harness failed;

scope contained unrelated problems;

stop condition was absent.

Before escalating, determine why the attempt failed.

Sometimes the cheapest fix is:

Split the task.
or:

Send a shorter continuation.
not:

Buy more intelligence.
31. SPLIT LARGE TASKS BY DECISION BOUNDARY
Instead of:

Redesign Runtime,
implement it,
migrate persistence,
build automation,
fix mobile,
test everything.
split into:

A. architecture decision
B. state plumbing
C. Runtime implementation
D. persistence migration
E. UI
F. regression tests
Each stage can then receive the cheapest suitable model.

Do not create tiny slices merely for ceremony.

Slice at real decision / ownership boundaries.

32. STOP WHEN THE ACCEPTANCE BAR IS GREEN
This rule is now explicit.

Once requested acceptance criteria pass:

REPORT AND STOP.

Do not automatically add:

mutation testing;

bonus adversarial campaigns;

extra dev replays;

broad repository scans;

provider calls;

“while I’m here” refactors;

opportunistic architecture improvements;

extra proof unrelated to the Play.

Exception:

Perform extra proof only when:

the Play explicitly requires it;

a failed test reveals a real gap;

safety-critical risk genuinely justifies it.

A worker should not turn a bounded implementation Play into a research expedition after success.

33. HUMAN TESTING IS EXPENSIVE TOO
Standing rule:

If the machine can prove it, the machine should prove it.

Use:

automated tests;

DOM assertions;

state snapshots;

event counting;

syntax validation;

fixtures;

Runtime Memory;

browser automation where available.

Only request human tests for behavior automation cannot reliably establish.

Keep human test matrices small.

Human attention is a scarce resource too.

34. AVOID PARALLEL TOKEN CONFETTI
Do not send the same unresolved task to:

Opus;

Sonnet;

Codex;

ChatGPT;

AntiGravity;

all at once merely to collect opinions.

Parallelize only when work genuinely separates.

Reasonable:

Agent A → independent capability implementation
Agent B → independent UI implementation
Wasteful:

Five agents independently diagnose the same tiny bug.
35. PRESERVE PREMIUM CAPACITY FOR SURPRISES
Software development produces unexpected architecture problems.

When several models can safely perform known implementation work, prefer the cheaper qualified worker and preserve stronger capacity for:

data-loss risk;

new architectural fork;

cross-project contract;

impossible-seeming bug;

serious migration decision.

This is the AI equivalent of dry powder.

But combine this with reset horizon:

Premium capacity that expires in three minutes is not “dry powder” for tomorrow.

36. COST IS GLOBAL, NOT LOCAL
A cheaper model can become more expensive overall if it:

misunderstands architecture repeatedly;

causes regressions;

requires retries;

creates forensic cleanup;

destroys state;

requires expensive review.

Likewise, a strong model can be expensive overall if it:

rereads context it already knows;

receives giant prompts unnecessarily;

performs premium reasoning on settled decisions;

keeps working after acceptance criteria are green.

Evaluate:

Total workflow cost

including:

model burn
context burden
human time
retry risk
cleanup risk
review cost
delay
The cheapest safe workflow wins.

37. QUALITY FLOOR
Never route a task to a model clearly below the intelligence needed to perform it safely merely to conserve tokens.

Conservation must not create:

data-loss risk;

architectural drift;

broken persistence;

security mistakes;

repeated retries;

corrupted Git history.

There is a minimum safe intelligence level for each task.

Stay above it.

38. ROUTING OUTPUT FORMAT
Whenever the human asks:

“Who should get this?”

return a compact decision that includes:

TASK:
<short classification>

PLAY TYPE:
<architecture / implementation / recon / review / etc.>

EXECUTION MODE:
<continuation / handoff / fresh / recon-required>

RECOMMENDED AGENT:
<agent>

MODEL:
<current model>

REASONING / EFFORT:
<Low / Medium / High / etc.>

TASK DIFFICULTY:
<Low / Medium / High / Architecture>

WHY THIS ROUTE:
<2–4 sentences>

HEALTH / TOKEN STRATEGY:
<5-hour + weekly + reset horizon + relevant CONSERVE considerations>

CONTEXT STRATEGY:
<delta / compressed handoff / fresh orientation>

WHY NOT THE MORE EXPENSIVE MODEL:
<when relevant>

SCOUT NEEDED:
<yes/no + exact reason>

ESCALATION CONDITION:
<specific condition that justifies moving upward>

STOP CONDITION:
<what ends the Play>
Do not make the human reverse-engineer the recommendation.

39. FIELD EXAMPLE — HEALTHY SHORT WINDOW, SCARCE WEEKLY
Suppose:

Codex
5-hour: 97% left
Weekly: 9% left

Claude
5-hour: 47% left
Weekly: 61% left
Task:

Implement an approved persistence slice.
A naive router says:

Codex has 97%.
Use Codex.
A useful router asks:

Is Codex weekly scarcity more important?
Is this same-session continuation in Claude?
How much context would a handoff cost?
What is Claude's current short-window burn rate?
What deadline did Dad specify?
What reasoning level is actually required?
Routing is contextual.

No single percentage decides the Play.

40. FIELD EXAMPLE — EXPIRING PREMIUM WINDOW
Suppose:

Opus / premium Player
20% five-hour remaining
reset in 3 minutes
A scoped architecture Play is already ready.

Recommendation may be:

Use Opus now.
Why:

capacity expires imminently;

Play is qualified for premium reasoning;

Scout already mapped terrain;

prompt is ready;

using the capacity does not consume the fresh next window.

This is different from:

20% remaining
reset in 4 hours
which may justify conservation.

41. FIELD EXAMPLE — SAME-SESSION CONTINUATION
Player:

Claude Sonnet
State:

same active session
same repo
Play 1 just completed
architecture already read
report just authored
Next task:

Play 2
Correct routing/prompt strategy:

EXECUTION MODE: CONTINUATION
CONTEXT STRATEGY: DELTA
SCOUT: NO
REPORT REREAD: NO
ARCHITECTURE RECON: NO
The next Play should tell the Player only what changed.

42. ASSISTANT COACH PREFLIGHT
Before drawing a Play, the Assistant Coach should internally ask:

Is this the same Player/session/project?

Is this continuation, handoff, fresh work, or recon?

What does the Player already know?

Is architecture already closed?

Are exact files/symbols already known?

Is a Scout materially necessary?

What Play type is this?

What team/capability pool fits?

What does the relevant Health Scorecard say?

What is the reset horizon?

What is the deadline?

What is the minimum sufficient reasoning level?

What is the minimum executable prompt?

What is the acceptance bar?

What is the STOP condition?

Critical rule:

The checklist belongs in the Coach / Play Compiler. It does not belong in every worker prompt.

Output the result of the preflight, not the preflight itself.

43. SIDELINE PLAY COMPILER — PRODUCTIZATION OF THIS SOP
This SOP is coaching doctrine.

The future Sideline Play Compiler should automate as much of it as possible.

Conceptual pipeline:

Dad / Assistant Coach writes a Play
    ↓
Routing Interceptor
    ↓
Play Intent Classifier
    ↓
Team / Capability Resolver
    ↓
Session Continuity Resolver
    ↓
Context Governor
    ↓
AI Health + CONSERVE + Time Horizon
    ↓
Recommended Route / Explicit Route Resolution
    ↓
Play Compiler
    ↓
Dad sees recommendation / may override
    ↓
Player receives minimum compiled Play
The Play Compiler should answer:

What did Dad explicitly ask for?
What kind of Play is this?
What class of Player does it require?
What does the selected Player already know?
What does current health say?
What should be conserved?
What capacity is about to expire?
What is the minimum safe execution packet?
This system exists partly because:

Dad should not have to perfectly train the Assistant Coach.

And:

The Assistant Coach should not need perfect memory to avoid obvious resource waste.

Sideline should absorb repeatable routing/context errors into product logic.

44. CORE VS PREMIUM PRODUCT BOUNDARY — DO NOT FREEZE YET
Potentially premium Play Compiler capabilities:

automatic Play-intent interpretation;

session-aware delta compilation;

context deduplication;

cross-Player compressed handoffs;

AI Health-aware recommendations;

CONSERVE-aware routing;

reset-aware routing;

deadline-aware routing;

effort recommendations;

Scout-before-premium recommendations;

context-cost estimates;

explanation of recommendation;

advanced AUTO.

Potential core product-integrity capabilities:

explicit routing fidelity;

ambiguity safety;

no fuzzy accidental rerouting;

obvious same-session duplicate-context protection;

truthful unavailable/UNKNOWN states;

bounded control-language interception.

Do not freeze packaging yet.

The important architectural truth is:

Sideline should make the smart path easier than the wasteful path.

45. STANDING ONBOARDING INSTRUCTION FOR EVERY AI
When joining this project:

Learn the available agent/model ecosystem.

Learn the project architecture and testing conventions.

Treat reported token/credit availability from the human as authoritative.

Never assume the strongest model should do every task.

Never assume the cheapest model should do every task.

Classify the Play before routing it.

Route according to uncertainty, blast radius, continuity, health, and deadline.

Preserve premium reasoning for decisions where it creates leverage.

Push settled implementation downward to capable workers when health permits.

Treat default Players as preferences, not permanent destinations.

Consult the relevant A-Team/B-Team/Scout health pool.

Interpret capacity together with time-to-reset.

Respect CONSERVE as human-controlled policy.

Reuse active-session context.

Never make the same Player reacquire context without a concrete reason.

Keep continuation prompts to the delta.

Give workers decisions and coordinates, not research history.

Scout only when a material unknown remains.

Escalate exact blockers rather than entire projects.

Keep prompts proportional to the task and missing context.

Remember that context is also a token budget.

Use diagnostics and existing memory before repository archaeology.

Automate tests whenever possible.

Stop when the requested acceptance bar is green.

Do not add mutation/proof safaris unless required.

Preserve human testing for genuinely human-only behavior.

Do not re-litigate settled architecture without new evidence.

Always tell the human which Player, model, reasoning level, and context strategy you recommend when routing is requested.

The human retains final authority.

46. ONE-SENTENCE VERSION
When everything else is forgotten, remember:

Use the cheapest qualified intelligence that can safely solve the remaining unknown problem, reuse context already paid for, and save stronger capacity for uncertainty unless that capacity is about to expire.

47. THE PLAYBOOK'S PURPOSE
This system exists to prevent several forms of waste.

UNDERSPENDING
weak worker tackles architecture
→ confusion
→ retries
→ regressions
→ expensive cleanup
OVERSPENDING ON INTELLIGENCE
premium architect performs mechanical work
→ scarce reasoning capacity disappears
→ little leverage gained
OVERSPENDING ON CONTEXT
same Player rereads reports it just authored
→ duplicate context processing
→ capacity disappears
→ no new knowledge gained
OVERSPENDING ON HUMAN ORCHESTRATION
Dad manually calculates every route
→ Dad becomes routing middleware
→ human attention disappears
→ product fails mass-adoption test
The target is:

RIGHT INTELLIGENCE
      +
RIGHT TASK
      +
RIGHT TEAM
      +
RIGHT MOMENT
      +
RIGHT AMOUNT OF CONTEXT
      +
RIGHT HEALTH / RESET DECISION
      +
CLEAR STOP CONDITION
      =
HIGH-LEVERAGE AI DEVELOPMENT
The human controls the budget.

AI Health reports reality.

CONSERVE interprets scarcity.

The architecture controls boundaries.

The Play determines the capability required.

Session continuity determines how much context must be sent.

The routing system connects them.

The Play Compiler eventually automates them.

Dad retains final authority.

FINAL INVARIANTS
DO NOT PAY TWICE FOR THE SAME DECISION.

DO NOT PAY TWICE FOR THE SAME CONTEXT.

SAME PLAYER + SAME SESSION + SAME PROJECT = DELTA BY DEFAULT.

WORKERS RECEIVE DECISIONS, NOT RESEARCH HISTORY.

SCOUT ONLY WHEN A MATERIAL UNKNOWN REMAINS.

LOW REASONING DOES NOT MAKE A GIANT PROMPT CHEAP.

PERCENTAGE WITHOUT RESET HORIZON IS INCOMPLETE ROUTING INFORMATION.

THE HUMAN OWNS THE THROTTLE.

STOP WHEN THE ACCEPTANCE BAR IS GREEN.

SIDELINE SHOULD MAKE THE SMART PATH THE EASY PATH.

