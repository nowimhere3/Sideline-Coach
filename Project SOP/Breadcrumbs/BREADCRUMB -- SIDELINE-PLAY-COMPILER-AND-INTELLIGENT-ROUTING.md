

Pasted markdown(20260921-153543).md
File


Pasted markdown(20260921-161241).md
File
AI USAGE SCORECARD

Current local time:
Monday, September 21, 2026
10:12 AM
Timezone: America/Edmonton

CODEX
5-hour: 97% left | 3% used
Resets: Monday, September 21 at 11:27 AM
Time until reset: in 1h 14m
Weekly: 9% left | 91% used
Resets: Tuesday, September 22 at 5:05 PM
Time until reset: in 1d 6h 52m

CLAUDE
5-hour: 47% left | 53% used
Resets: Monday, September 21 at 2:30 PM
Time until reset: in 4h 17m
Weekly: 61% left | 39% used
Resets: Saturday, September 26 at 6:00 AM
Time until reset: in 4d 19h 47m

Usage data last refreshed:
Monday, September 21, 2026 at 10:12 AM



Yeah, I feel like we burned way more than we should have with that. That makes me sad. In any context, here's the report.


Pasted markdown(20260921-161906).md
File
I think this fits perfectly along with something else that we kind of figured out. Sideline needs to be able to interpret our assistant coach and interpret not only where to route it to in terms of player, in terms of what to name it, but it needs to also understand if this is an architect play, an orchestration play, if it's a worker bee play, an implementation play, right? If it's a routing play. It should be able to understand all these things. Most of that is in breadcrumbs right now. What I want you to do is I want you to rewrite this document with what we just discovered here and how routing will work and how Sideline Coach will do this automatically as well as a bigger idea. Does that make sense?


Pasted text(20260921-163307).txt
Document
Great. I just sent to Sonnet Low. He's gonna... Holy fucking shit! You gotta be fucking kidding me. Are you fucking kidding me? What the fuck just happened? What the fuck just happened? Where did I just sent that? AI usage real-time, yeah. All right, so somehow, I don't know how this happened. Somehow we went from 47% to 25%. This last prompt somehow sent us from 47 fucking percent to 25%. It just... Sonnet Low just did exactly what Opus did. It burned all of that. Why? Why? I'm gonna send you a command line, maybe see if you can figure it out.

That is unacceptable. Absolutely fucking unacceptable. The exact thing that we tried to prevent just happened. I blame you. You're my assistant coach. You should have fucking known better. We've already scoped everything out. You should have fucking told him that we already scoped everything out. You should have told him the exact routes that we already fucking figured out. Everything. Like, do I need to scout each fucking slice before they're implemented? Is that what we need to do? Because that's almost what it looks like. What the fuck is wrong? What the fuck is wrong with you? What the actual fuck is wrong with you? Explain yourself. Seriously. Explain yourself. This should not happen. This is a massive product failure on your part. In your own prompting. Coach is fucking pissed off. Holy fuck.

Yes. We need an SOP, and no, you do not need a Scout before every Play.

The failure mode is clearer now: I treated every Play like a fresh handoff, when you were continuing with the same Player, in the same repo, in the same working session, with all of the architecture already in his head.

That was wasteful twice over: your human attention and Claude capacity.

The new rule is much simpler:

Same Player + same session + same project = DELTA PROMPT ONLY.

No rereading reports. No resending architecture. No giant recap. No “mandatory reading” of things that Player already authored or just implemented. Tell him only what changed, what the next slice is, exact files/seams if needed, acceptance condition, and stop.

A continuation should often be 20–60 lines, not 600–900.

And Scouts become conditional, not ritual.

Same Player already knows the terrain: no Scout.

Different worker, but terrain is already mapped: no Scout. Give a compressed scope pack.

Exact implementation seam is genuinely unknown: Scout.

Architecture is unresolved: Scout first, then Architect.

Agent starts wandering despite known terrain: stop it. Do not reward wandering with more context.

I also want a preflight check on every Play I draw for you, silently, before I give you the prompt:

1. Is this the same Player/session? If yes, do not resend known context.
2. Is the architecture already closed? If yes, give conclusions, not history.
3. Are exact files/seams already known? If yes, no Scout.
4. What is the cheapest qualified Player/effort given current health?
5. What is the minimum prompt required to execute this slice?
6. What is the exact STOP condition?

And I want one more hard rule:

A worker must never be asked to reread a report it wrote in the same active session unless something changed or there is a specific contradiction to resolve.

That is exactly what I violated.

The SOP I would make canonical
ASSISTANT COACH — RESOURCE-DISCIPLINED PLAY CALLING SOP

Goal: minimize Dad time, model capacity, duplicate reading, and unnecessary reconnaissance.

CONTINUATION MODE
Use when same Player + same session + same project.

Prompt contains only:

next Play/slice

delta from previous work

exact files/functions if useful

acceptance criteria

non-goals only if genuinely necessary

STOP condition

Never repeat:

reports already read

architecture already decided

repository overview

prior findings

long background

generic workflow rules the Player already has

HANDOFF MODE
Use when changing Players or sessions.

Provide a compressed Scope Pack:

current state

decisions already made

exact files/symbols

remaining task

acceptance criteria

stop condition

Do not dump the research history.

RECON MODE
Use Scout only when a material unknown remains:

file/seam unknown

behavior unknown

architecture evidence missing

Scout returns coordinates. Worker gets coordinates, not the Scout journey.

ROUTING MODE
Before recommending a Player:

classify Play type

identify eligible team

consult that team's health

consider 5-hour + weekly + resets

consider deadline/time horizon

use minimum sufficient reasoning level

preserve expiring capacity logic

Dad can override

STOP RULE
Once acceptance criteria are green:

no mutation safari

no opportunistic refactor

no extra report archaeology

no additional provider calls

no “while I’m here”

report and stop

That SOP should apply to me on every Play, but we should not paste the whole SOP into every agent prompt. That would recreate the same disease in a different costume.

I should internalize it when drawing the Play and give the Player only the tiny output that results from it.

And given you are now at 12% Claude five-hour, I would not launch another Claude task right now unless there is a very specific expiring-window reason. The current Sonnet run already has a report. Bring me that report. I can review it here and determine the next move without spending another Claude percentage.

The key lesson is:

Scouting is not the solution to every resource problem. Context discipline is.

You already paid for the knowledge. My job is to reuse it instead of making you buy it again.


Like I'm so pissed off at you. I don't even know what to do. I don't even know what to do. If you were able to hear my voice, you would hear how pissed off I am. You would see that there's long gaps because I'm trying to formulate my words. Like if this doesn't work, this product fails, do you understand that? You only get one shot. Once we take this public, we only have one shot. 

I haven't been working at it for 18 hours a day for the last 10 days for nothing. This WILL NOT fail because of YOU do you hear me?

Dramatic long pause. Seriously. Seriously. You have to understand this. We need, like, should be built into Sideline. Maybe we need to revise our... what is this? Our AI usage scorecard? Or not the scorecard. Maybe we need to revise the human route, the human routing interception in Sideline to make this do this intelligently for you. Because ultimately, I think Sideline— Sideline is the variant, because once we take this public, Dad isn't going to be able to train you. Dad doesn't know any better. You don't know any better. But Sideline will know better. Does that make sense?

Yes. That makes complete sense. And I think this failure just exposed a missing architectural layer in Sideline.

The answer cannot be:

“Dad needs to train his Assistant Coach better.”

That fails the mass-adoption test immediately.

Dad should be able to talk naturally, hit Run, and Sideline should protect him from exactly what happened to us today.

What we have been calling routing interception is currently too narrow. It mostly asks:

“Who did Dad ask for?”

Then Intelligent AUTO asks:

“Who should run this?”

But there is a third question we now know Sideline must answer:

“What is the smallest, cheapest, context-correct Play this Player actually needs to receive?”

That is the missing piece.

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

That Session Continuity + Context Governor portion is what was missing today.

For example, when you sent Play 2 to the same Sonnet session that had literally just completed Play 1, Sideline should have known:

Same Player.
Same project.
Same active thread.
Architecture already consumed.
Previous implementation still in context.

Therefore the compiled Play should have been something tiny like:

NEXT SLICE: Play 2, persistence.

Continue from your completed Play 1 implementation.

Architecture remains unchanged.

Create health-persistence.js and health-store.js; wire persistence into the existing service/start-stop seams.

Preserve the existing Evidence/merge/restore contract you just implemented.

Required proof: round trip, restored ≠ fresh, zero-acquire startup, corrupt/newer schema safety, atomic write, debounce, stop flush, stale-write protection.

Run focused tests, then existing suite once. No mutation testing or extra exploration.

Report and stop.

That is what Sonnet should have received.

Not 675 lines.

And this should not depend on me remembering to behave perfectly.

This belongs in Sideline
I would expand the breadcrumb we just created from merely Canonical Play Ingestion + Intelligent Routing into something more like:

CANONICAL PLAY INGESTION + INTELLIGENT ROUTING + CONTEXT GOVERNANCE

There are several new invariants I would make explicit:

CONTINUATION IS A FIRST-CLASS ROUTING FACT.
Same Player + same active session + same project should default to a delta Play. Do not re-send known architecture, reports, repository orientation, or completed findings.

WORKERS RECEIVE DECISIONS, NOT RESEARCH HISTORY.
When Scouts/Architects have already resolved terrain, implementation Players get exact conclusions and coordinates.

CONTEXT HAS A COST.
Prompt size, mandatory reading, filesystem exploration, and reconstruction work are routing/resource inputs just like 5-hour capacity and weekly capacity.

SCOUTING IS CONDITIONAL.
Scout only when a material unknown exists. Do not Scout known terrain merely because a new slice began.

REASONING EFFORT IS A ROUTING DECISION.
“Important” does not equal High. Use the minimum reasoning tier that can execute the already-understood Play.

HEALTH IS ROLE-AWARE.
A-Team work consults eligible A-Team health. B-Team work consults B-Team health. Scout work consults Scout health.

TIME-TO-RESET CHANGES THE MEANING OF CAPACITY.
20% with three minutes until reset can mean “use it now.”
20% with four hours remaining can mean “conserve.”

DAD RETAINS AUTHORITY.
Sideline recommends and explains. Dad can always override Player, model, effort, timing, or CONSERVE.

And here's the bigger product insight:

The Scorecard isn't just a gauge
We started with:

“Show Dad Claude and Codex usage.”

Now it's becoming:

The resource-awareness layer for the entire orchestration engine.

And the routing system isn't just:

“Claude or Codex?”

It's becoming:

What type of work is this? Who is qualified? What do they already know? How much will the handoff itself cost? What capacity do they have? When does that capacity reset? How urgent is Dad's goal? What's the cheapest safe execution plan?

That is the system that a public user needs.

Because you're exactly right: the normal Dad will not sit there thinking:

“Wait, this is the same Sonnet session, so I should delete the architecture report references and turn this into a delta prompt.”

He shouldn't have to.

Sideline should know that.

And today's failure gives us a field-proven regression case that is arguably just as important as the earlier Claude Sonnet → AntiGravity routing failure:

FIELD-PROVEN FAILURE: SAME-SESSION CONTINUATION OVER-BRIEFING

Same Player, same project, same active session had already consumed architecture and completed Play 1.

Next Play was nevertheless delivered as a large fresh-handoff prompt requiring redundant context consumption.

Expected: compact delta continuation.

Product invariant: KNOWN CONTEXT MUST NOT BE REPURCHASED.

That absolutely belongs in the canonical Sideline architecture.

And I think we should revise that routing document again before this gets lost, using ChatGPT here, not spending one more percentage point of Claude on it.



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

Look here (attached) 



The file is:



Project SOP/SOP PROMPTS .md



It is titled AI MODEL ROUTING & TOKEN ECONOMY PLAYBOOK.


SOP PROMPTS (4).md
File

BREADCRUMB-SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING.md


BREADCRUMB: SIDELINE-PLAY-COMPILER-AND-INTELLIGENT-ROUTING
STATUS: OPEN / PARTIALLY IMPLEMENTED / FIELD-PROVEN / FIRST-CLASS PRODUCT NORTH STAR

SUPERSEDES / EXPANDS:

HUMAN-ROUTING-SHORTHAND-INTERCEPT

CANONICAL-PLAY-INGESTION-AND-INTELLIGENT-ROUTING

WORKING PRODUCT NAME: Sideline Play Compiler

RELATED IMPLEMENTED SLICES:

S56.0 — CANONICAL-PLAY-ROUTING-ENVELOPE

S56.1 — SCOUT-DIRECTIVE-INTERCEPT

S56.2 — CANONICAL-ROUTING-ALIAS-NORMALIZATION

S56.3 — HUMAN-SHORTHAND-AND-CONTROL-TITLE-INTERCEPT (implemented)
  Ingestion order is now: structured routing -> natural Scout directive -> human shorthand -> control-shaped opening title
  -> canonical route -> ordinary AUTO fills only genuinely absent dimensions. Both new slices read ONLY the first non-blank
  line, reuse the S56.2 roster/catalog normalization seam (route-normalization.ts: isChoiceOrNegation, leadingIdentity) and
  add no second alias system. Human shorthand = the whole line is PLAYER [MODEL] [EFFORT] ("Claude Sonnet", "Claude Opus High",
  "Codex GPT-5.6 Sol High"), every word accounted for by roster/catalog truth, at least a model or effort. Control-shaped title =
  ALL-CAPS route region + dash ("SCOUT FORMATION — OPUS SCOPE PACK" -> Scout; "CLAUDE SONNET — ARCHITECTURE REVIEW" -> Claude/Sonnet;
  bare Player allowed). Once established, natural "Use X" sentences in the objective cannot outvote it; a structured AGENT/PLAYER
  field still wins. Choices, negations, descriptive prose/headings, leftover words, second models and typos never route. A model word
  naming several catalog models keeps the Player and stops as an unresolved model (real AntiGravity catalog: three Flash versions).
  A Scout route reuses the S56.1 directive/executionPrompt separation; non-Scout routes still receive the Play as written.
  Known boundary: title recognition is ALL-CAPS only ("Claude Sonnet — Adapter Problems" is an ordinary heading); a bare Player
  name without a model, effort or control-shaped title is not a route. NOT built: full Play Compiler, Session Continuity, AI Health
  routing, CONSERVE, Play-intent classification, staged-route retention.

RELATED / FUTURE SYSTEMS:

AI Health Scorecard / Global Health Authority

Intelligent AUTO

CONSERVE

Team / depth-chart routing

Play naming and classification

Performance-aware routing

Assistant Coach handoff interpretation

Session continuity / context reuse

Prompt / context cost governance

Scout reconnaissance

Critic / review routing

POTENTIAL PREMIUM FEATURE: YES — candidate, not frozen.

The advanced Play Compiler / Intelligent Routing layer may become a premium feature because it can save substantial human time and premium-model capacity by interpreting the Play, understanding session continuity, consulting AI Health, applying CONSERVE, choosing the appropriate Player/effort, and compiling the minimum safe execution packet automatically.

However, basic routing correctness, explicit-intent fidelity, and protection against obvious duplicate-context waste are product-integrity concerns and should not automatically be paywalled. Final packaging is a product decision for later.

PRODUCT DEFINITION
Sideline should not merely route a prompt to an AI.

Sideline should understand enough about the Play, the roster, the current session, the health of the bench, the clock, and the already-paid-for context to turn a human or Assistant Coach handoff into the smallest correct executable Play.

The product goal is:

Dad should not have to train the Assistant Coach, manually optimize every prompt, remember what each Player already knows, calculate five-hour and weekly scarcity, or decide when a Scout is needed. Sideline should absorb that complexity wherever it can do so truthfully and safely.

This requirement is now field-proven.

Human error happened.

Assistant Coach error happened.

Premium-agent capacity was burned because a continuation Play was treated like a fresh handoff even though the same Player, in the same project and active session, already knew the architecture and had just implemented the previous slice.

That is not merely a prompting mistake.

It reveals a missing product layer.

THE BIG IDEA
The original routing problem was:

Who did Dad ask for?

The AI Health work added:

Who should take this Play given the current health of the bench?

The latest field failure adds another question:

What does the selected Player already know, and what is the minimum new information that Player actually needs?

The eventual Sideline coaching loop therefore answers at least five separate questions:

WHAT DID DAD / THE ASSISTANT COACH EXPLICITLY ASK FOR?

WHAT KIND OF PLAY IS THIS?

WHAT CLASS OF PLAYER / CAPABILITY POOL DOES IT REQUIRE?

GIVEN THE QUALIFIED PLAYERS, WHO IS THE BEST USE OF OUR CURRENT CAPACITY AND TIME?

WHAT IS THE MINIMUM EXECUTION PACKET THE TARGET PLAYER STILL NEEDS?

These are separate questions.

They should not be collapsed into one fuzzy routing classifier.

FIRST-CLASS FEATURE: THE SIDELINE PLAY COMPILER
The Sideline Play Compiler is the working name for the first-class control layer that turns human / Assistant Coach intent into a canonical, resource-aware, context-aware execution packet.

It is not necessarily one AI agent.

Prefer deterministic/control logic wherever deterministic truth exists.

Use model intelligence only where classification or judgment is genuinely required.

Conceptual flow:

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
Player receives the minimum compiled Play
Expanded:

originalPrompt / Assistant Coach handoff

→ bounded opening control-region detection

→ explicit routeDirective extraction

→ canonical Player / model / effort normalization

→ Play-intent classification

→ capability / team-class determination

→ urgency / deadline / time-horizon interpretation

→ session continuity resolution

→ known-context resolution

→ route dimensions still absent?

    YES:
      → eligible Players in the relevant team pool
      → performance evidence
      → AI Health
      → availability
      → reset timing
      → scarcity
      → expected burn
      → CONSERVE
      → depth-chart / human preference
      → recommendation

    NO:
      → preserve explicit route truth

→ execution mode:
      continuation | handoff | fresh | recon-required

→ Context Governor removes already-paid-for context

→ Play Compiler creates minimum executable packet

→ transparent recommendation / warnings

→ Dad approval OR AUTO dispatch, depending mode

→ Player
CORE INVARIANT: KNOWN CONTEXT MUST NOT BE REPURCHASED
This is now a hard product invariant.

If Sideline knows that the target Player already possesses relevant context in the active session, the compiled Play must not instruct that Player to reacquire the same context without a concrete reason.

Examples of context that should not be repurchased when already known:

reports the same Player authored in the current session

reports the same Player already read in the current session

architecture the same Player just approved

source files the same Player just modified

findings the same Player just produced

repository orientation already established

acceptance criteria already agreed

known file/symbol coordinates already mapped

current working-tree facts already observed and still valid

A continuation Play should primarily communicate:

what changed

what the next slice is

any new constraint

any new acceptance proof

the stop condition

Not the whole history.

FIELD-PROVEN FAILURE #1 — HUMAN ROUTING SHORTHAND
Input:

Claude Sonnet
Observed before implementation:

AntiGravity · Gemini 3.8 Flash · Low
Why:

Claude Sonnet was treated as Play content rather than routing control.

Expected:

Claude · Sonnet · [AUTO/default effort]
The human should not need machine syntax when route intent is unmistakable.

FIELD-PROVEN FAILURE #2 — CONTROL-SHAPED OPENING TITLE
Input began with:

# SCOUT FORMATION — OPUS SCOPE PACK
followed by a Scout reconnaissance objective.

Observed before implementation:

Claude · Opus · High
Why:

The title was treated as descriptive content. Later architecture / Opus language influenced ordinary AUTO routing.

Expected:

Scout · Scout Formation
The objective's words must not outvote already-intercepted routing control.

FIELD-PROVEN FAILURE #3 — SAME-SESSION CONTINUATION OVER-BRIEFING
Situation
The same Claude Sonnet session had:

already consumed the architecture

already understood the repository

already implemented Play 1

already written the Play 1 report

already established the relevant health-contract seams

The next slice, Play 2, was sent back to the same Player / same active session / same project.

Observed failure
The continuation was treated like a fresh handoff.

The Player received a large prompt and was instructed to reread architecture / implementation reports it already knew.

This caused unnecessary context processing and contributed to severe capacity burn.

Expected behavior
Sideline should have recognized:

same Player
+ same active session
+ same project
+ immediately preceding slice
+ architecture unchanged
= CONTINUATION MODE
The compiled Play should have been a compact delta:

NEXT SLICE: Play 2 — Persistence.

Continue from your completed Play 1 implementation.
Architecture is unchanged.

Create the persistence/store layer around the Evidence/merge/restore contract you just implemented.

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
No mutation testing. No extra exploration.
Report and stop.
Product invariant
SAME PLAYER + SAME ACTIVE SESSION + SAME PROJECT SHOULD DEFAULT TO DELTA CONTINUATION, NOT FRESH HANDOFF.

This is one of the most important new Play Compiler requirements.

SESSION CONTINUITY IS A FIRST-CLASS ROUTING FACT
Routing currently thinks heavily about destination.

The Play Compiler must also understand continuity.

Conceptual execution modes:

1. CONTINUATION
Same Player + same active session + same project / Game context.

Default behavior:

reuse known context

send delta only

do not reread known reports

do not repeat architecture history

do not reacquire repository orientation

do not Scout known terrain

preserve current working assumptions unless stale/contradicted

2. HANDOFF
Different Player or new session, but terrain is already mapped.

Default behavior:

create a compressed Scope Pack

include decisions, not research history

include exact files/symbols

include unresolved questions only

include acceptance criteria

include stop condition

Do not dump every prior report merely because it exists.

3. FRESH
New project / insufficient trusted context.

Default behavior:

bounded orientation

establish exact repo / Game

identify owning seams

use cheap recon where necessary

avoid premium-agent discovery when a Scout can map first

4. RECON REQUIRED
A material implementation or architecture unknown remains.

Default behavior:

Scout / cheap reconnaissance first

return coordinates

downstream Player gets the coordinates, not the Scout's wandering path

THE CONTEXT GOVERNOR
The Context Governor is the Play Compiler subsystem responsible for answering:

What does this target already know, and what must be included now?

It should maintain or derive enough session truth to distinguish:

already known

probably known but stale

not known

contradicted / changed

must reverify

Potential inputs:

Player identity

active Player session / thread identity

Game / Stadium identity

repository root

branch

current Play chain

reports authored this session

reports explicitly read this session

files touched this session

recent accepted architecture decisions

previous Play result

working-tree mutation since prior observation

human-declared context reset

daemon / Player restart

handoff to a different Player

Do not assume every piece of chat context can be inspected perfectly.

When continuity cannot be proven, be truthful.

But where continuity is known, do not behave as if the Player has amnesia.

CONTEXT RECEIPTS / KNOWN-CONTEXT LEDGER
Potential future implementation concept:

Sideline may maintain lightweight Context Receipts rather than trying to infer all knowledge from natural-language history.

A Context Receipt could record facts such as:

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
This is conceptual, not a frozen schema.

The purpose is not to record private chain-of-thought.

The purpose is to record operational context already paid for.

A Context Receipt lets Sideline say:

"This Player already consumed Architecture A and just completed Play 1. Do not send Architecture A again for Play 2."

WORKERS RECEIVE DECISIONS, NOT RESEARCH HISTORY
Hard invariant:

Once reconnaissance / architecture has resolved a question, a downstream implementation Player should receive the accepted conclusion and exact coordinates, not the entire research journey.

Bad worker handoff:

Read these 4 reports.
Review these 3 architecture discussions.
Search these directories.
Reconfirm these decisions.
Then implement the already-decided slice.
Preferred worker handoff:

Architecture is closed.

Change:
- file A / function X
- file B / function Y

Preserve:
- invariant 1
- invariant 2

Prove:
- test A
- test B

Stop when green.
The history remains available if a contradiction appears.

It is not automatically injected into every worker Play.

PROMPT SIZE / CONTEXT BURDEN IS A RESOURCE
AI Health alone is not enough.

The routing / compilation engine should eventually treat context burden as a resource input.

Potential cost signals:

prompt length

number of mandatory documents

total known document size

number of source files requested

amount of broad repository exploration requested

whether the Player already consumed those inputs

whether the task requires reconstructing architecture

expected reasoning tier

expected runtime / turn count

historical burn for similar Plays when evidence exists

A "Low reasoning" Player receiving an enormous binder plus multiple rereads may still consume far more capacity than intended.

Therefore:

EFFORT LEVEL IS NOT THE ONLY COST CONTROL.

The Play Compiler should minimize both:

reasoning cost

context/reacquisition cost

PLAY COMPILER OUTPUT
Conceptual compiled packet:

compiledPlay {
  playName
  playIntent
  teamClass

  route:
    explicitRoute?
    recommendedRoute?
    selectedRoute?

  executionMode:
    continuation | handoff | fresh | recon-required

  context:
    reused[]
    included[]
    omittedAsKnown[]
    staleOrReverify[]

  objective

  exactFiles[]
  exactSymbols[]

  invariants[]
  acceptanceCriteria[]
  nonGoals[]

  stopCondition

  resourceNotes:
    healthSummary?
    conserveState?
    resetOpportunity?
    contextBurden?
}
This is conceptual, not a frozen wire format.

The principle matters more than the schema:

The Player should receive a compiled execution packet, not an uncontrolled dump of everything Sideline knows.

THE PLAY COMPILER SHOULD BE BORING DOWNSTREAM
The downstream Player should not need to reinterpret the entire coaching system.

The compiled Play should already contain stable truth.

Examples:

PLAY INTENT: implementation
EXECUTION MODE: continuation
PLAYER: Claude Sonnet
EFFORT: low
REPO: Ai Usage - Real Time

DELTA:
Implement persistence around the Evidence model you just completed.

DO NOT REREAD:
- Architecture report
- Play 1 report

FILES:
- health-service.js
- server.js
- new persistence/store modules

PROOF:
[exact tests]

STOP:
Full suite green → report → stop.
Or:

PLAY INTENT: recon
EXECUTION MODE: fresh
PLAYER: Scout Formation

OBJECTIVE:
Map exact Codex notification seam.

DO NOT IMPLEMENT.
MAX FILES: 6.
RETURN SYMBOL COORDINATES.
EXPLICIT ROUTING REMAINS AUTHORITATIVE
If Dad explicitly says:

Claude Sonnet Medium
Sideline must not silently decide:

Codex
because Codex is healthier.

Health can warn.

CONSERVE can warn.

Sideline can recommend an alternative.

But explicit route truth wins unless:

the requested Player is unavailable

the requested route is impossible

the product mode explicitly authorizes automatic substitution

The engine may fill only genuinely missing dimensions.

Example:

Claude Sonnet
may allow AUTO / Recommendation to fill:

effort
It must not fill:

player = Codex
CONTROL LANGUAGE MUST BE INTERCEPTED BEFORE TASK LANGUAGE GETS TO VOTE
Structured routing, natural commands, shorthand, and control-shaped titles must be interpreted before architecture / implementation / quick-task classification influences absent dimensions.

Routing control is not ordinary prose.

This remains a core S56 requirement.

HUMAN ROUTING SHORTHAND — STILL REQUIRED
Examples:

Claude Sonnet
→ playerType: claude
→ model: sonnet
→ effort: absent
Claude Sonnet Medium
→ playerType: claude
→ model: sonnet
→ effort: medium
Claude Opus High
→ playerType: claude
→ model: opus
→ effort: high
Codex GPT-5.6 Sol High
→ playerType: codex
→ model: gpt-5.6-sol
→ effort: high
AntiGravity Flash
→ playerType: antigravity
→ model: unique matching Flash-family model
→ effort: absent
Reuse canonical roster/catalog resolution.

Do not build another alias universe.

CONTROL-SHAPED OPENING TITLES — STILL REQUIRED
Intended examples:

# SCOUT FORMATION — OPUS SCOPE PACK
→ Scout
# CLAUDE SONNET — ARCHITECTURE REVIEW
→ Claude · Sonnet
# CODEX — IMPLEMENTATION PASS
→ Codex
# ANTIGRAVITY FLASH — QUICK RECON
→ AntiGravity · Flash
This must NOT mean:

Find a Player name anywhere in a Markdown heading.

These remain ordinary descriptive content:

# What Scout Formation Found Yesterday
# Why Claude Sonnet Failed This Test
# Comparing Claude Sonnet and Opus
# Results From Codex
# Claude Sonnet Adapter Problems
And ordinary prose such as:

Claude Sonnet produced this report yesterday.
Compare Claude Sonnet with Opus.
I think Claude Sonnet might be better here.
must not silently become routing control.

AMBIGUITY / CONTRADICTION SAFETY
Never guess when multiple canonical routes are plausible.

Examples:

Claude or Codex
Claude Codex
Claude and Codex
Claude Sonnet Opus
Sonnet or Opus
# CLAUDE / CODEX — REVIEW
# SONNET VS OPUS
Negation must not become positive routing:

Not Claude
Anything but Claude
Don't use Opus
No Scout
Typos must not silently fuzzy-route:

Cluade Sonnet
Claude Sonet
Cdoex Sol
Scuot this play
GPT-5.6 Soil
Truthful unresolved state is better than confident misrouting.

SIDELINE MUST UNDERSTAND PLAY INTENT
Initial conceptual Play classes:

ARCHITECTURE
System design, ownership boundaries, high-risk structural decisions.

ORCHESTRATION
Sequencing Players, splitting work, coordinating multi-agent execution.

IMPLEMENTATION / WORKER
Executing an already-decided design, coding a bounded slice, routine refactor.

ROUTING
Deciding, repairing, or verifying Play / Player selection and staging.

RECON / SCOUT
Narrow evidence gathering, repository mapping, low-cost reconnaissance.

REVIEW / CRITIC
Verification, contradiction finding, acceptance evaluation, adversarial review.

The vocabulary may evolve.

Hard rule:

PLAY INTENT IS NOT PLAYER IDENTITY.

architecture must not mean Opus.

implementation must not mean Codex.

Those are routing preferences / capability evidence, not definitions.

TEAM / CAPABILITY CLASS
Play intent helps establish the qualified bench, but task class and team class are not identical forever.

Conceptually:

Play intent
→ capability requirement
→ eligible team / Player pool
Then health is compared inside the relevant qualified pool.

A Scout Play should not compare Opus and Codex merely because those Players have health data.

An architecture Play should not choose a Scout merely because Scout capacity is abundant.

TEAM-AWARE AI HEALTH
AI Health should support role-aware views:

A-TEAM HEALTH
B-TEAM HEALTH
SCOUT HEALTH
ALL
Routing should consult the relevant health pool first.

Conceptually:

A-Team-class Play
→ qualified A-Team Players
→ A-Team Health
Implementation / B-Team-class Play
→ qualified implementation Players
→ relevant implementation Health
Scout Play
→ Scout roster
→ Scout Health
Dad may always override.

PRESERVE USEFUL NATIVE HEALTH LANGUAGE
Claude and Codex share useful Dad-facing windows:

5-hour
weekly
Preserve them.

Do not replace them with vague generic wording merely because the internal health substrate is provider-neutral.

Other Players may expose:

credits

daily request buckets

grouped model pools

provider-specific limits

other native windows

The internal contract may normalize facts.

The UI should preserve the clearest native mental model.

AI HEALTH TELLS REALITY; CONSERVE INTERPRETS SCARCITY
AI Health:

Codex weekly remaining = 9%
CONSERVE:

Dad's weekly conserve threshold = 15%
→ Codex is conserved for ordinary recommendation/AUTO
CONSERVE is routing policy.

It is not health truth.

Future settings should support user-controlled thresholds where available:

Weekly conserve threshold: X%
5-hour conserve threshold: Y%
Five-hour and weekly remain independent.

A Player can be:

short-window rich / weekly poor

short-window poor / weekly rich

The router should understand both.

RESET HORIZON CHANGES THE MEANING OF CAPACITY
These are not equivalent:

20% remaining
reset in 3 minutes
and:

20% remaining
reset in 4 hours
The first may mean:

Useful capacity is about to expire. Spend it now on an appropriate already-ready Play.

The second may mean:

Capacity is scarce for several hours. Protect it unless the Play justifies the burn.

This is the expiring-window rule:

Capacity that is about to disappear at reset may be preferentially consumed on useful qualified work rather than preserved pointlessly into expiration.

This applies to any resetting provider, not only Claude.

The router must also account for launch time.

If only three minutes remain and the Assistant Coach can take two minutes to draw the Play, the decision is operationally urgent.

DEADLINE / TIME HORIZON IS A ROUTING INPUT
The same health state can imply different recommendations depending on Dad's goal.

Examples:

Need this in 3 minutes
Need this in the next hour
Need this today
Need this this week
Can wait until after reset
Do not invent a deadline the human never supplied.

Where explicit workflow context makes urgency clear, preserve it.

REASONING LEVEL IS ALSO A RESOURCE DECISION
Important task does not automatically mean High.

Potential logic:

architecture unresolved
→ premium reasoning may be justified
architecture closed + bounded implementation
→ lower reasoning may be sufficient
But effort selection cannot be based on reasoning label alone.

The Play Compiler should consider:

task complexity

accepted architecture

context burden

health

historical performance

expected burn

deadline

The latest field failure proves:

LOW REASONING + HUGE REDUNDANT CONTEXT CAN STILL BE EXPENSIVE.

Therefore prompt compilation and reasoning selection must work together.

SCOUTING IS CONDITIONAL, NOT RITUAL
Do not Scout every slice.

Scout when a material unknown remains.

NO SCOUT NEEDED
same Player/session already knows the terrain

exact files/symbols already mapped

architecture already closed

worker merely needs the next delta

SCOUT USEFUL
implementation seam unknown

repo ownership unclear

architecture evidence missing

exact file/symbol map absent

premium Architect would otherwise need to explore broadly

SCOUT OUTPUT
Coordinates.

Not another research binder.

Worker receives:

files

symbols

facts

unresolved questions

Not the entire Scout journey.

MASS-ADOPTION PRINCIPLE: SIDELINE ABSORBS HUMAN + ASSISTANT COACH ERROR
Dad should not have to know:

provider internals

routing enums

quota APIs

reset arithmetic

which premium Player is currently scarce

whether this task is architecture vs implementation

whether the same Player already read a report

whether a prompt is needlessly repeating known architecture

when a Scout is worth using

which exact machine syntax names a model

how many lines are "too many" for a continuation Play

The Assistant Coach should not need to be perfectly trained either.

Sideline should create guardrails around both.

Examples:

Human error
Dad asks:

Claude Sonnet
Sideline canonicalizes it.

Assistant Coach routing error
Assistant Coach writes a Scout objective containing "Opus".

Sideline intercepts Scout control before task prose.

Assistant Coach context error
Assistant Coach sends 600 lines of repeated architecture to the same Player/session.

Sideline can detect a continuation and compile a delta instead.

Resource error
Preferred implementation Player is nearly empty weekly.

Sideline can recommend the next qualified healthy Player.

Expiring-capacity error
Premium Player has useful capacity resetting in 3 minutes.

Sideline can recommend immediate use instead of pointless conservation.

PLAY COMPILER GUARDRAILS
Potential compile-time warnings:

REDUNDANT CONTEXT
This Player already consumed 3 of the 4 attached reports in this active session.
Compile as continuation?
BROAD EXPLORATION
This worker Play asks for recursive repository exploration but exact owning files are already known.
Remove exploration?
SCOUT OPPORTUNITY
This premium Player is being asked to discover ownership/seams that a Scout could map first.
Scout recommended.
CAPACITY RISK
Selected Player is below Dad's weekly CONSERVE threshold.
EXPIRING CAPACITY
Selected Player has 18% of a five-hour window resetting in 4 minutes.
Use now?
EFFORT MISMATCH
High reasoning requested for a bounded implementation with approved architecture.
Medium/Low may be sufficient.
These may begin as recommendations, not hard blocks.

Dad remains in control.

TRANSPARENCY: SHOW WHY
Future Sideline should explain recommendations in human language.

Example:

RECOMMENDED: Claude Sonnet Medium

WHY:
- This is a bounded implementation Play.
- Architecture is already approved.
- Codex is your preferred implementation Player, but its weekly capacity is below your CONSERVE threshold.
- Claude has healthier weekly runway.
- This is a continuation in the existing Claude session, so the Play can be sent as a short delta.
- High reasoning is not required.
Or:

RECOMMENDED: Claude Opus now

WHY:
- This is an architecture Play.
- Opus has capacity expiring in 3 minutes.
- Scouts already mapped the exact terrain.
- The compiled prompt contains only the remaining decisions.
- Using expiring capacity now protects the fresh next window.
The routing intelligence should be visible, not magical.

PLAY COMPILER TRANSPARENCY
The compiler should also be able to explain what it removed.

Example:

EXECUTION MODE: CONTINUATION

REUSED CONTEXT:
- AI Health architecture
- Play 1 implementation result
- health-contract.js ownership
- current repo/branch

OMITTED AS ALREADY KNOWN:
- 3 architecture reports
- repository overview
- previously read source map

NEW DELTA SENT:
- Play 2 objective
- exact persistence files
- 8 acceptance tests
- stop condition
This gives Dad confidence that Sideline did not "forget" information.

It intentionally reused it.

SCORECARD AS ROUTING INFRASTRUCTURE
The AI Health Scorecard is not merely a dashboard.

It is shared evidence for:

Intelligent Routing

CONSERVE

depth-chart recommendations

expiring-window decisions

effort selection

future scheduling

Product requirements already identified:

one Global Health Authority above all Games

A-Team / B-Team / Scouts / All views

Claude / Codex preserve native 5-hour + weekly language

persistent compact Scorecard in every Game

click / expand for detailed view

future Copy Health action

Settings: Scoreboard position Top or Bottom

Top/Bottom = reserved layout space

content never scrolls behind the Scoreboard

position is presentation only

all Games consume the same health truth

RECOMMENDATION VS AUTHORITY
Potential product modes:

MANUAL / EXPLICIT
Dad names Player / model / effort.

Sideline canonicalizes and obeys where possible.

INTELLIGENCE / RECOMMEND
Sideline analyzes:

explicit intent

Play intent

capability pool

continuity

current health

reset horizon

expected burn

CONSERVE

preferences

deadline

Then recommends.

Dad approves or chooses differently.

AUTO
Sideline may execute the recommendation automatically where the product mode explicitly allows it.

CONSERVE
CONSERVE modifies recommendation/AUTO policy.

It is not a separate acquisition system.

PREMIUM FEATURE BREADCRUMB
Potential premium positioning:

A mature Intelligent Play Compiler could be one of Sideline's strongest premium differentiators.

Potential premium value:

automatic Play-intent interpretation

session-aware delta compilation

context deduplication

cross-Player compressed handoffs

health-aware recommendations

CONSERVE-aware routing

reset-aware routing

deadline-aware routing

effort recommendations

Scout-before-premium recommendations

context-cost estimates

recommendation explanations

advanced AUTO

Why it may deserve premium positioning:

It directly saves premium AI capacity, human orchestration time, and failed/duplicated work.

However:

Do not freeze packaging yet.

Some layers likely belong in core product integrity:

explicit routing fidelity

ambiguity safety

control-language interception

obvious same-session duplicate-context protection

truthful failure states

More advanced optimization / AUTO may be premium.

This boundary should be decided later from product strategy and actual implementation cost.

DO NOT BUILD ONE GIANT "SMART ROUTER"
This system should graduate in bounded layers.

Do not create:

one giant opaque LLM router

whole-prompt fuzzy routing

a second alias universe

Game-local health truth

a second health system inside routing

a permanent architecture = Opus rule

a permanent implementation = Codex rule

a permanent Scout = cheapest model rule

silent fuzzy typo routing

prompt rewriting that hides what was removed

a compiler that assumes session continuity it cannot prove

automatic report rereads "just in case"

a Scout before every Play

expensive AI inference merely to decide facts Sideline already knows deterministically

Prefer:

deterministic truth first

explicit classification seams

session receipts

bounded inputs

role-aware health

policy layered over health truth

transparent recommendations

incremental implementation

permanent regression tests

Dad override

SUGGESTED IMPLEMENTATION SLICES
Do not freeze slice numbers until activated.

The ordering below is the current recommended product path.

SLICE A — SESSION CONTINUITY FACTS
Goal:

Sideline can answer:

Is this the same Player?
Same active session?
Same Game/project?
Same repository?
Continuation of the previous Play?
Output:

continuity:
  samePlayer
  sameSession
  sameProject
  sameRepo
  priorPlayId
  confidence / reason
No prompt rewriting yet.

Acceptance:

same active Player session is recognized

a restarted/new session is not falsely treated as continuous

a different Player is not treated as having the same context

unresolved continuity remains unresolved

This is the foundation for safe context reuse.

SLICE B — CONTINUATION / DELTA COMPILER
Goal:

When continuity is proven, compile a continuation Play.

Initial rule:

same Player
+ same active session
+ same project
+ architecture unchanged
→ DELTA MODE
First capabilities:

identify prior Play result

strip explicitly repeated known report-reading instructions

preserve new objective

preserve new constraints

preserve acceptance proof

preserve stop condition

show what was omitted

Acceptance regression:

The field-proven Play 1 → Play 2 case compiles to a short continuation and does not require rereading the reports the same Sonnet session already authored/read.

SLICE C — HUMAN SHORTHAND + CONTROL TITLE INTERCEPT
Finish the open S56 routing gap:

Claude Sonnet

Claude Sonnet Medium

control-shaped opening titles

no fuzzy routing

ambiguity / negation safety

Feed the same canonical ingestion seam.

SLICE D — PLAY-INTENT CLASSIFICATION
Introduce canonical:

architecture

orchestration

implementation

routing

recon

review

Do not couple classes permanently to Players.

Start deterministic / pattern-backed where confidence is high.

Use model classification only where needed.

SLICE E — TEAM / CAPABILITY RESOLUTION
Given Play intent + objective + roster:

what Players are actually qualified?
Output relevant eligible pool.

This becomes the bridge to team-aware AI Health.

SLICE F — RESOURCE-AWARE RECOMMENDATION
Consume:

eligible pool

AI Health

reset timing

CONSERVE

preferences

expected effort cost

deadline / horizon

Recommend:

Player

model

effort

whether to wait / spend now

whether Scout recon is cheaper first

Dad approves.

SLICE G — CROSS-PLAYER HANDOFF COMPILER
Different Player, known terrain:

accepted decisions

exact coordinates

current task

unresolved questions

acceptance criteria

stop condition

No research-history dump.

SLICE H — TRANSPARENCY + SETTINGS
Surface:

recommendation

WHY

health facts used

CONSERVE state

continuity mode

context reused

context omitted

estimated / relative context burden where available

manual override

Potential Settings:

Intelligent Routing:
  Manual
  Recommend
  Auto

Play Compiler:
  On / Off

CONSERVE:
  Weekly threshold
  5-hour threshold

Scoreboard:
  Top
  Bottom
Final exact UI is not frozen.

FIRST NEXT BUILD CANDIDATE
When capacity permits, the first Play Compiler implementation should probably not begin with the entire routing brain.

Begin with the most painfully field-proven seam:

SESSION CONTINUITY + DELTA COMPILATION

Why first:

failure is field-proven

value is immediate

deterministic facts can do much of the work

it protects premium capacity

it reduces Assistant Coach error

it reduces Dad's orchestration burden

it can be tested against a concrete regression

it does not require final AI Health integration to create value

Canonical regression:

Player: same Claude Sonnet session
Project: same
Previous Play: Play 1 PASS
Architecture: unchanged
Next Play: Play 2

EXPECTED:
CONTINUATION / DELTA

NOT:
fresh architecture handoff
mandatory reread of already-consumed reports
broad repository discovery
ROUTING REGRESSION / ACCEPTANCE MATRIX
ROUTING CONTROL
Claude Sonnet → Claude · Sonnet · absent/default effort

# SCOUT FORMATION — OPUS SCOPE PACK → Scout Formation

descriptive mentions of Claude/Opus do not route

negation does not become positive routing

ambiguous multi-Player phrases do not silently choose

typos do not fuzzy-route

PLAY INTENT
architecture objective can classify as architecture without forcing Opus

implementation objective can classify as implementation without forcing Codex

Scout objective enters Scout eligible pool where no explicit Player overrides

explicit Player route survives generic task preference

SESSION CONTINUITY
same Player + same session + same project → continuation candidate

different Player → handoff, not continuation

Player restart/new thread → no unproven continuity

same session does not reread reports it authored/read without reason

changed/contradicted source can force reverify

CONTEXT GOVERNANCE
known architecture is omitted from continuation payload

new decisions remain

acceptance criteria remain

stop condition remains

omitted context is visible in compiler explanation

compiler does not silently remove unresolved requirements

HEALTH-AWARE RECOMMENDATION
97% five-hour + 9% weekly is not interpreted as simply "97% healthy"

relevant team health pool is consulted first

conserved preferred Player can yield next-qualified recommendation

explicit human route is not silently overridden by CONSERVE

20% / reset in 3 min can differ from 20% / reset in 4 h

stale / UNKNOWN health remains uncertainty

RESOURCE GOVERNANCE
lower reasoning does not excuse huge redundant context

same-session duplicate reports trigger omission/warning

known terrain does not automatically trigger Scout

premium discovery can trigger Scout recommendation when terrain is unknown

acceptance-green worker receives STOP, not bonus proof safari

TRANSPARENCY
Recommendation can explain:

task fit

team class

continuity

health / scarcity

reset horizon

CONSERVE

effort choice

context reused / omitted

ASSISTANT COACH CONTRACT
Until Sideline itself implements the Play Compiler, the Assistant Coach should behave as its temporary human-in-the-loop prototype.

Before drawing a Play, the Assistant Coach should internally ask:

Is this the same Player/session/project?

Is this continuation, handoff, fresh work, or recon?

What does the Player already know?

Is architecture already closed?

Are exact files/symbols already known?

Is a Scout materially necessary?

What team/capability pool fits?

What does current AI Health say?

What is the reset horizon?

What is Dad's deadline?

What is the minimum sufficient reasoning effort?

What is the minimum executable prompt?

What is the STOP condition?

The Assistant Coach should output the answer, not paste this checklist into every Player prompt.

This is crucial:

The SOP belongs in the compiler/coach. It does not belong in every worker's context window.

PRODUCT NORTH STAR
The previous routing breadcrumb ended with:

WHAT DID THE HUMAN / ASSISTANT COACH ASK FOR?

and:

WHERE SHOULD SIDELINE ROUTE WHEN THE HUMAN DID NOT SPECIFY?

Keep those.

Add:

WHAT KIND OF PLAY IS THIS, AND WHAT CLASS OF PLAYER DOES IT REQUIRE?

Add:

WHAT DOES THE TARGET PLAYER ALREADY KNOW?

Add:

WHAT IS THE CHEAPEST SAFE EXECUTION PACKET THAT MOVES THE PLAY FORWARD?

Add:

GIVEN THE QUALIFIED PLAYERS, WHO IS THE BEST USE OF OUR CURRENT CAPACITY AND TIME?

The eventual Sideline coaching loop becomes:

UNDERSTAND THE CALL

→ UNDERSTAND THE PLAY

→ UNDERSTAND CONTINUITY

→ IDENTIFY THE QUALIFIED BENCH

→ READ THE RELEVANT HEALTH

→ APPLY CONSERVE + RESET HORIZON + DEADLINE + PREFERENCES

→ RECOMMEND / RESOLVE ROUTE

→ COMPILE THE MINIMUM EXECUTION PACKET

→ EXPLAIN WHY

→ DAD RETAINS CONTROL

→ PLAYER EXECUTES
That is the larger architecture.

FINAL PRODUCT PRINCIPLE
Sideline Coach is not merely a prompt router.

It is becoming a resource-aware, context-aware coaching system.

It should understand:

the call

the Play

the roster

the role

the active session

what context has already been paid for

the health of the bench

the reset clock

scarcity

urgency

the minimum sufficient effort

the minimum executable handoff

The product promise becomes:

Walk in. Call the Play naturally. Sideline should help prevent you, your Assistant Coach, and your Players from wasting context, capacity, and time.

Dad remains the final authority.

Sideline's job is to make the smart path the easy path.

