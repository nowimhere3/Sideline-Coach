# Sideline Coach Breadcrumb Consolidation Report

CALGARY TIMESTAMP: 2026-09-16 06:47 MDT

STATUS: CONSOLIDATION / HOLDING PEN / AUDIT INPUT

BRANCH: `q2.8-multigame-field-debug`

## Purpose

This file consolidates the standalone breadcrumb documents currently living in `Docs ANCHOR/` into one review surface.

It exists because the recent Scout / Terminal / routing detour produced several useful future-facing ideas, but many were captured as separate breadcrumb documents rather than being distilled into the GS3-style durable memory pattern:

- implementation-seam breadcrumbs beside the code they govern;
- cross-cutting invariants in canonical architecture anchors;
- deferred future work in a canonical NEXT / roadmap surface;
- WAS / IS / WHY / WILL BE language that prevents future Players from accidentally repeating old mistakes.

This report is therefore a **preservation layer**, not a declaration that every statement below is current architectural truth.

Later Scouts / Architects should audit this document against current source, tests, field evidence, `ARCHITECTURE-BREADCRUMBS.md`, and the Master Product Roadmap, then graduate durable truth into the codebase where it actually belongs.

**No original breadcrumb files are deleted by this consolidation.** They remain source evidence until an intentional cleanup / graduation Play decides what can be absorbed, superseded, retained, or pruned.

---

# 1. Source Inventory

Standalone breadcrumb files consolidated here:

1. `Docs ANCHOR/GAME-SELECTOR-UI-BREADCRUMB.md`
2. `Docs ANCHOR/GITHUB-CONNECTION-BREADCRUMB.md`
3. `Docs ANCHOR/SCOUT-SWARM-AUTOMATION-BREADCRUMB.md`
4. `Docs ANCHOR/SINGLE-SCOUT-AUTOMATION-AND-LIVE-PROGRESS-BREADCRUMB.md`
5. `Docs ANCHOR/SLC-PLUMBING-WORKSPACE-BREADCRUMB.md`
6. `Docs ANCHOR/SCOUT-PERFORMANCE-DEPTH-CHART-BREADCRUMB.md`
7. `Docs ANCHOR/TERMINAL-COMMAND-INTELLIGENT-ROUTING-BREADCRUMB.md`
8. `Docs ANCHOR/TERMINAL-INCREMENTAL-COPY-CHECKPOINT-BREADCRUMB.md`
9. `Docs ANCHOR/TEAM-WIDE-PLAYER-SCORECARDS-AND-AUTOMATED-PLAY-ROUTING-BREADCRUMB.md`

Canonical context that should be consulted during a future audit rather than replaced by this report:

- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`
- relevant source files / tests / runtime evidence

---

# 2. How To Read This Report

Each item is placed into a provisional bucket:

- **LIKELY CURRENT / PARTIALLY IMPLEMENTED**: evidence suggests some or all of the idea has already entered working code or field proof.
- **WILL BE / FUTURE**: intentionally preserved idea, not yet established as implementation truth.
- **MIXED / NEEDS AUDIT**: parts became real while the standalone breadcrumb still speaks as if the whole feature is future.
- **POSSIBLY STALE / SUPERSEDED**: later architecture may already have replaced parts of the original wording.

These labels are intentionally provisional. A future Scout audit should verify them mechanically.

---

# 3. Game Selector UI

SOURCE: `GAME-SELECTOR-UI-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / SMALL UX PASS**

## Durable idea

The compact Game selector should give Game identity more horizontal priority than repeatedly spelling out `Connected` in every healthy row.

Preferred direction:

```text
●  Game Name                                      Exit
```

with:

- compact truthful connection indicator;
- aligned Game names;
- consistent right-aligned Exit action;
- explicit text retained for materially different states such as Offline, Opening, Conflicted, Needs Decision, etc.;
- accessibility retained through label/title/tooltip or equivalent.

## Why

The selector exists primarily to choose a Game. Repeated healthy-state text creates noise and truncates the identity the human actually needs to scan.

## Future audit questions

- Has this UI already changed?
- Are the current state names still the same?
- Is a green dot sufficient for current accessibility requirements?
- What exact source component owns Game selector row rendering now?

---

# 4. GitHub Account Connection

SOURCE: `GITHUB-CONNECTION-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / BACK POCKET**

## Durable idea

Sideline may eventually offer a simple account-level GitHub connection rather than requiring manual PAT entry or repeated per-Game authentication.

Initial architecture candidate captured at the time:

- GitHub Device Flow;
- Octokit as the first library to investigate;
- one Sideline-level connected account capability;
- Game repository URL remains a separate Game coordinate;
- possible future GitHub App only if the permission model justifies the machinery.

Dad-facing target:

```text
GitHub · Not connected
→ Connect GitHub
→ browser/device approval
→ ✓ Connected as <account>
```

## Durable separation

Authentication identity and repository/Game identity are different concerns.

## Future audit questions

- Does current Sideline GitHub functionality still rely on PAT/manual auth anywhere?
- Has a GitHub App or another connection path already become preferable?
- Which future feature actually needs GitHub auth before this is worth building?

---

# 5. Scout Automation: One Scout Before The Swarm

SOURCE: `SINGLE-SCOUT-AUTOMATION-AND-LIVE-PROGRESS-BREADCRUMB.md`

PROVISIONAL STATUS: **MIXED / PARTIALLY IMPLEMENTED / NEEDS AUDIT**

## Original durable principle

> Prove one autonomous Scout before building the swarm.

The intended primitive was:

```text
Human / Assistant Coach
→ bounded Scout Play
→ deterministic Scout Router
→ mechanically read-only Scout
→ bounded Game reconnaissance
→ structured returned report
→ Coach-owned persistence
→ Incoming / notification
→ process retires
```

## Ideas that appear to have graduated at least partially

Recent field work produced a standalone Scout Play Runner V0.1 that:

- invokes Scouts programmatically rather than depending on terminal-history scraping;
- supports explicit Game root and bounded objective;
- validates approved Scout agents;
- captures stdout/stderr/lifecycle evidence;
- persists per-Play artifacts;
- supports bounded concurrency;
- isolates individual failures;
- retires processes after execution.

This means the old wording "WILL BE / NOT IMPLEMENTED" is no longer uniformly true.

## Still-future ideas from the breadcrumb

- truthful live human-readable progress derived from observable events;
- normalized states such as Reading Files / Searching Code / Preparing Report / Waiting on Provider;
- richer OpenCode JSON event adapter;
- automatic model selection from capability class;
- Scout capacity UI;
- Scout Play history surface;
- fully automatic report filing / Incoming experience integrated into the product UI.

## Durable invariants worth preserving

- progress is observability, not authority;
- never expose or invent hidden chain-of-thought;
- if activity cannot be known truthfully, show a generic truthful state;
- Scout remains read-only while Coach owns the filing cabinet;
- deterministic routing should be preferred where rules are sufficient;
- provider/model names are runtime evidence, not permanent architecture.

---

# 6. Scout Swarm / Formation Automation

SOURCE: `SCOUT-SWARM-AUTOMATION-BREADCRUMB.md`

PROVISIONAL STATUS: **MIXED / SUBSTANTIAL PLUMBING PROVEN, PRODUCT AUTOMATION STILL FUTURE**

## North Star

One difficult Play can be decomposed into several independent bounded reconnaissance routes, executed by temporary read-only Scouts in parallel, then gathered and handed to a separate synthesizer / Architect.

Football framing remains useful:

> Scouts are temporary receivers running different routes. None owns the whole playbook. None is allowed to implement. They return evidence and leave the field.

## Durable swarm principles

- decompose rather than duplicate;
- cheapest capable intelligence first;
- read-only by construction;
- exact Game and scope boundaries;
- bounded provider/request concurrency;
- independent lifecycle and failure isolation;
- report, then retire;
- Scout conclusions are evidence, not architecture truth;
- synthesis is a separate role;
- one Play should have one bounded Scout evidence package / folder;
- Scouts should not receive broad repository write authority just to save Markdown;
- premium reasoning should begin where reconnaissance ends.

## What recent field work appears to have proven

Formation Alpha and Formation Bravo created useful evidence that the primitive can support multiple requested Scouts and bounded execution slots.

Formation Bravo specifically demonstrated queue advancement and capacity recycling under `maxConcurrency = 2`, even though all provider/model executions failed in that run.

That means the swarm breadcrumb is no longer purely hypothetical at the runner level.

## What remains future

- automatic decomposition by Sideline;
- Dad Mode `Scout the Next Play` UX;
- automatic Scout selection against live capability, privacy, capacity and cost;
- product-native Incoming completion notifications;
- optional cheap Compiler Scout;
- auto-retirement / cleanup lifecycle integrated into normal Sideline UI;
- mature retry/substitution policy;
- provider-diverse roster selection;
- long-term pruning / graduation workflow.

## Important correction learned from field work

A provider failure must not automatically become a Player-quality failure.

Future telemetry should distinguish at least:

- model / Scout failure;
- provider failure;
- upstream capacity/rate limit;
- harness failure;
- auth failure;
- runner failure;
- unknown.

---

# 7. Scout Performance Ledger / Depth Chart

SOURCE: `SCOUT-PERFORMANCE-DEPTH-CHART-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / EVIDENCE SEED EXISTS**

## Durable principle

> Measured telemetry and judged performance are different evidence classes.

Do not blend them into fake precision.

### Objective telemetry examples

- Scout / model / provider;
- Play ID;
- task class;
- start/end/duration;
- queue/running/completion/failure/interruption;
- provider errors;
- rate limits;
- retry / timeout;
- report existence / size;
- concurrency slot;
- substitutions when explicitly authorized.

### Downstream evaluation examples

- Architect accepted Scout map;
- significant rediscovery required;
- decisive contradiction found;
- important seam missed;
- Worker succeeded from Scout evidence;
- unsupported claim later disproven;
- report usefulness for assigned route.

Evaluation must preserve who/evidence produced the judgment.

## Depth-chart idea

Over repeated comparable real Plays, Sideline may learn which Scout performs best for which reconnaissance class.

Potential human concepts:

- Starter
- Backup
- Reserve
- Injured List
- Position Battle

Do not crown or cut a Player from one Play.

## Current evidence seed

Formation Alpha supplied early game film for North Mini, Laguna, and Nemotron Ultra.

Formation Bravo supplied useful runner/provider-failure evidence but should not be treated as four Scout losses without proof of model-level failure.

## Future success question

> For this kind of reconnaissance, which Scout has actually performed best for us?

---

# 8. Second Line / Free-Agent Scout Roster

SOURCE STATUS: **RECENT DISCUSSION / NOT YET CLEANLY GRADUATED INTO CANONICAL CODE MEMORY**

This idea arose directly from the Scout field tests and should be preserved here until audited.

## Core idea

Do not make OpenRouter, Anti-Gravity, or any single endpoint the entire scouting department.

Build a second line / receiving corps across multiple approved providers and agent harnesses.

Potential candidate routes discussed:

- Anti-Gravity as veteran / specialty Scout;
- Gemini Flash direct through Google;
- Nemotron Ultra / Super direct through NVIDIA;
- GPT-OSS through Groq;
- North / Qwen / Nex / other free candidates through OpenRouter;
- future local models where appropriate.

## Durable routing idea

A Scout should eventually be selected across dimensions such as:

```text
task class
+ historical game film
+ current availability
+ provider health
+ privacy compatibility
+ context capability
+ latency
+ cost / quota
= recommended route
```

## Availability vocabulary candidate

- READY
- BUSY
- LIMITED
- RATE-LIMITED
- PROVIDER UNAVAILABLE
- AUTH ISSUE
- INJURED LIST
- UNKNOWN

## Why this matters

The system originated partly because one dependable Scout, Anti-Gravity, was being overburdened.

The lesson is not to replace one superhero with a different superhero.

The durable product direction is:

> Build a receiving corps, not a superhero.

---

# 9. SLC Plumbing Workspace

SOURCE: `SLC-PLUMBING-WORKSPACE-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / ORGANIZATIONAL IDEA / DO NOT REORG YET**

## Core idea

Sideline may eventually need one bounded backstage workspace for internal orchestration plumbing that is neither normal product source nor ordinary human-facing project docs.

Candidate root from the original breadcrumb:

```text
Plumbing SLC/
```

Possible contents:

- canonical Scout / Player definitions;
- runner contracts;
- machine handoff formats;
- plumbing-only SOPs;
- routing/capability manifests;
- templates;
- provider experiments;
- plumbing reports;
- performance data.

## Important invariant

Do **not** blindly move mature existing folders into this workspace.

`Docs ANCHOR/`, `Project SOP/`, `REPORTS/`, `src/`, and `test/` retain their current purposes unless a future architecture Play explicitly changes them.

## Durable WHY

Sideline needs a backstage, but Dad Mode should not need to understand the backstage.

## Audit concern

This idea overlaps with several pieces that have since become real (`tools/scouts`, Scout Runner source, reports, runtime artifacts). A future architecture pass should first inventory what already exists before inventing a new folder tree.

---

# 10. Intelligent Terminal Command Routing

SOURCE: `TERMINAL-COMMAND-INTELLIGENT-ROUTING-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / PARTIALLY PREPARED BY CURRENT TERMINAL PLAYER ARCHITECTURE**

## Durable principle

> Do not spend model intelligence on deterministic terminal choreography.

If the human explicitly provides executable shell intent and policy allows it, Sideline should eventually be able to select a Terminal execution route before selecting an AI model.

Potential route classes:

```text
AI_PLAY
TERMINAL_PLAY
SCOUT_PLAY
UNKNOWN / NEEDS_DECISION
```

## Intent precedence candidate

1. explicit human route / target;
2. explicit execution intent;
3. high-confidence deterministic terminal classification;
4. normal AI routing;
5. ask when ambiguous.

## Safety separation

Command risk is not the same thing as task difficulty.

Candidate classes:

- READ_ONLY
- LOW_RISK_MUTATION
- PROJECT_MUTATION
- DESTRUCTIVE / PRIVILEGED
- UNKNOWN

Ambiguous code should never silently execute merely because it resembles PowerShell.

## Architecture direction

Do not wedge Terminal as a Claude/Codex special case.

Prefer:

```text
Play Classification
→ Execution Route
   ├── AI Player
   ├── Terminal Runner
   ├── Scout Runner
   └── future modules
```

Model selection happens only on routes that require a model.

## Audit note

Current Sideline now has a first-class Terminal Player and exact-instance execution concepts. A future Scout should compare this breadcrumb against the current Terminal Player implementation before calling any part of the original design new.

---

# 11. Terminal Incremental Copy / Checkpoint

SOURCE: `TERMINAL-INCREMENTAL-COPY-CHECKPOINT-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / BACK POCKET**

## Durable principle

> The Assistant Coach should never need the same terminal history twice.

Each terminal/session may hold its own explicit copy checkpoint. A later Copy action returns only activity after that checkpoint and advances the checkpoint.

Concept:

```text
history ... checkpoint A
new command/output
new command/output
current end

Copy New
→ returns only A..current end
→ current end becomes checkpoint B
```

## Potential implementation primitives

- append-only terminal output/event ledger + cursor;
- transcript snapshot + offset;
- structured command execution records for Coach-owned Terminal Plays;
- hybrid structured/manual approach.

## Truthfulness invariant

If scrollback or buffer history has been lost, Sideline must not pretend the previous checkpoint can still produce an exact delta.

## Safety

Terminal evidence may contain secrets. Clipboard-only local actions and external Send actions should have different privacy expectations.

## Relationship to automated Scout work

Useful for manual debugging and fallback evidence handoff. Fully automated Scout Runner work should eventually return structured execution evidence without requiring terminal-copy operations.

---

# 12. Team-Wide Player Scorecards / Automated Play Calling

SOURCE: `TEAM-WIDE-PLAYER-SCORECARDS-AND-AUTOMATED-PLAY-ROUTING-BREADCRUMB.md`

PROVISIONAL STATUS: **WILL BE / BIGGER PICTURE / LOWER PRIORITY**

## Core idea

The Scout Depth Chart may be the first vertical slice of a future Team Performance layer covering every Player/model/provider route Sideline uses.

Examples:

- Claude Opus / Sonnet;
- Codex / GPT families;
- Gemini;
- Anti-Gravity;
- Scouts;
- Workers;
- specialist Players;
- different provider routes to the same underlying model.

## Durable question

> What does Sideline's own game film say is best for this user's Games and task classes?

External reputation and benchmarks remain useful priors, but real Sideline outcomes may eventually inform routing more strongly for repeated comparable work.

## Scorecard dimensions discussed

- identity / model / provider / harness / effort;
- current availability;
- reliability;
- task-class performance;
- latency / token / cost / quota impact;
- downstream rework;
- human / Architect acceptance;
- field-proof success;
- regressions;
- confidence and evidence provenance.

## Human-facing + AI-facing layers

The same underlying evidence may support:

- friendly human roster/depth-chart cards;
- structured machine routing evidence.

The machine side must not manufacture opaque universal scores.

## Automated play-calling loop candidate

```text
Play
→ classify
→ determine roles / formation
→ filter by availability / privacy / permissions / budget
→ use relevant historical game film
→ choose starter + reserve
→ execute
→ substitute if policy allows
→ observe result
→ feed evidence back into future routing
```

Explicit human routing intent remains higher authority than automated inference.

## Low-token / CONSERVE relationship

When premium quota is constrained, Sideline needs a trustworthy second line.

The reserve should be selected from evidence, not simply because it is free.

Potential strategy:

- premium Player when consequence/uncertainty requires it;
- empirically strong reserve for bounded work or scarcity;
- Scout first when reconnaissance can reduce expensive rediscovery;
- deterministic tool/Terminal route before model calls where appropriate;
- escalate only when the evidence says the reserve route is insufficient.

---

# 13. Cross-Cutting Principles Repeated Across These Breadcrumbs

These ideas recur often enough that a future audit should consider whether they deserve canonical invariants or implementation-seam comments:

1. **Explicit human intent outranks inference.**
2. **Game identity and execution/provider authority are separate concerns.**
3. **Field evidence outranks marketing, tests, or assumptions when they conflict.**
4. **Measured telemetry and judged quality must remain separate.**
5. **Provider failure is not automatically Player failure.**
6. **Read-only means no Game mutation, not "private" or "no model egress."**
7. **Choose the cheapest capable intelligence, but never optimize only for price.**
8. **Do not spend model reasoning on deterministic work a safe tool can perform directly.**
9. **Scout conclusions are evidence, not architecture authority.**
10. **The Play determines the formation; the roster does not create unnecessary work.**
11. **Temporary evidence should graduate into durable code/tests/contracts/SOPs/breadcrumbs rather than becoming permanent report geology.**
12. **Dad Mode should hide plumbing, not truth.**
13. **Unknown is a legitimate state. Never fabricate certainty.**
14. **Capacity, quota, availability, provider, model, and harness are separate dimensions.**
15. **A strong second line increases resilience and reduces premium-token pressure.**

---

# 14. Candidate WAS / IS / WILL BE Snapshot For The Scout Detour

This is intentionally a draft for future Scout verification.

## WAS

- Anti-Gravity functioned as the dependable primary Scout and was repeatedly used for reconnaissance.
- Scout work was largely manual and single-agent.
- OpenRouter / OpenCode were explored as a route to free or low-cost Scout capacity.
- Provider/model names were initially treated too much like stable availability.

## IS

- A Scout Runner implementation exists and has automated proof.
- Real read-only Scouts have run against Trend and Tap Assist.
- Formation Alpha returned useful reports from multiple Scouts and isolated a failed route.
- Formation Bravo proved bounded queue behavior and slot reuse under failure.
- Upstream/provider availability has been observed as a real failure class.
- OpenRouter should be treated as one provider route, not the entire Scout architecture.
- Second-line / provider-diverse Scout exploration is now the useful next learning surface when real work warrants it.

## WILL BE / POSSIBLE

- direct-provider Scout routes such as Google, NVIDIA, Groq, and other approved providers;
- Anti-Gravity returning as a specialty/veteran Scout rather than carrying the entire department;
- a real Scout depth chart driven by game film;
- team-wide scorecards only after the Scout vertical slice proves useful;
- automated substitutions around quota/provider outages;
- AUTO / CONSERVE play calling informed by availability and relevant historical evidence;
- compact, truthful progress surfaces;
- canonical breadcrumb graduation into the exact code/invariant seams that future Players will encounter.

---

# 15. Future Scout Audit Play

When it becomes worth spending the effort, send bounded Scouts across this consolidation report and current code with separate routes.

Suggested formation:

### Route A: Current implementation map

Determine which consolidated ideas already exist in source/tests and identify exact implementation seams.

### Route B: Architecture / roadmap reconciliation

Compare this report against:

- `ARCHITECTURE-BREADCRUMBS.md`
- Master Product Breadcrumbs and Roadmap
- current Stage/Q/P0 sequence

Identify duplicates, contradictions, and already-superseded ideas.

### Route C: Staleness audit

For every section classify:

- WAS
- IS
- WILL BE
- STALE
- SUPERSEDED
- UNKNOWN

with evidence.

### Route D: Graduation map

Recommend where each durable idea should ultimately live:

- source-code breadcrumb comment;
- canonical invariant;
- NEXT/roadmap item;
- test/contract;
- SOP;
- no longer needed / prune candidate.

The Scouts should **not** directly rewrite the entire architecture from their own reconnaissance. Their output should become the evidence package for an Architect / human cleanup decision.

---

# 16. Proposed Quarterly Breadcrumb Hygiene

A lightweight recurring process may be enough:

1. During active work, preserve useful ideas quickly rather than burning time perfectly placing every future breadcrumb.
2. Put temporary unplaced breadcrumbs into one consolidation / quarter holding report rather than many separate files.
3. At a natural quarter/stage boundary, run a Scout audit against current source and field evidence.
4. Classify each item WAS / IS / WILL BE / STALE / SUPERSEDED / UNKNOWN.
5. Graduate the valuable durable WHY into the code seam, invariant, contract, or roadmap where a future Player will actually encounter it.
6. Preserve source evidence until graduation is verified.
7. Prune or archive temporary breadcrumb/report geology only after the durable truth is safely absorbed.

This keeps capture cheap during fast product work while still moving toward the GS3 model of distributed architectural memory.

---

# 17. Non-Goals Of This Consolidation

This report does NOT:

- claim all included ideas are current;
- authorize implementation of every future idea;
- delete or reorganize mature code/folders;
- replace `ARCHITECTURE-BREADCRUMBS.md`;
- replace the Master Product Roadmap;
- decide final architecture for Plumbing SLC;
- crown Scout/model winners;
- turn provider failures into model-quality judgments;
- force a quarterly process if a better lightweight cadence emerges.

Its job is simpler:

> **Preserve the useful breadcrumbs in one place so none of the recent thinking is lost, then let future game film and a bounded audit decide what deserves to graduate into the canonical codebase.**

---

# 18. Durable Working Rule Going Forward

When the Head Coach says **"breadcrumb this"**, the preferred long-term meaning remains the GS3 house style:

- preserve durable WHY beside the implementation seam where future Players need it;
- preserve cross-cutting rules in canonical anchors/invariants;
- preserve deferred future decisions in the roadmap/NEXT surface;
- use WAS / IS / WHY / WILL BE where it prevents rediscovery or regression.

When the correct seam is not yet known, or placing it correctly would derail the active Play, capture it first in this **single consolidation holding report** and graduate it later.

That gives Sideline two gears:

```text
FAST CAPTURE
→ one breadcrumb holding report

DURABLE GRADUATION
→ code comments / invariants / tests / contracts / roadmap
```

The goal is not perfect documentation in the middle of every drive.

The goal is that the team never loses the playbook.

CALGARY TIMESTAMP: 2026-09-16 06:47 MDT
