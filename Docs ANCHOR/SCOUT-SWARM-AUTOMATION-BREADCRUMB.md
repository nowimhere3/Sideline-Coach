# Scout Swarm Automation Breadcrumb

STATUS: WILL BE / BACK-POCKET PRODUCT IDEA — NOT IMPLEMENTED

## North Star

Sideline Coach should eventually be able to turn one difficult future Play into a small, temporary read-only scouting formation: multiple Scouts run bounded reconnaissance in parallel, return their findings, then retire themselves. The human should experience this as running a football play, not as manually opening four terminals and babysitting four agents.

The product idea is deliberately simple at the surface:

```text
Human / AI Assistant Coach defines the next problem
                ↓
        Scout Play detected
                ↓
      Coach decomposes the field
                ↓
  Scout A   Scout B   Scout C   Scout D
  bounded   bounded   bounded   bounded
  read-only read-only read-only read-only
        ↘      ↓        ↓      ↙
          Scout reports return
                ↓
     Assistant Coach / Architect synthesizes
                ↓
        Scouts retire automatically
```

Think of the Scouts as temporary wide receivers: each runs a different route, none owns the whole playbook, none is authorized to edit the field, and all disappear after reporting what they saw.

## Human-facing concepts

Potential future entry points:

- **Scout the Next Play** button.
- An Assistant Coach prompt can explicitly request scouting.
- Coach may infer that a prompt contains one or more separable Scout questions and surface `Scout Play detected` / `Multiple Scout Plays detected` before launch.
- Dad Mode should show only the useful decision: what is being scouted, how many Scouts are being sent, and when their reports are back.
- Dev Mode may expose the selected Scout models, scopes, evidence, request/cost budget, and live progress.

No final UI is frozen by this breadcrumb.

## Core automation idea

1. **Decompose, do not duplicate.** The Assistant Coach turns one larger question into 2–4 independent bounded Scout assignments. Parallel Scouts should cover different seams rather than repeating the same search unless intentional redundancy is requested.
2. **Choose the cheapest capable intelligence.** Scout selection should use capability, expected depth, speed, context window, provider availability, privacy policy, and current budget/capacity. Do not fossilize today’s free-model names into core architecture.
3. **Read-only by construction.** A Scout is reconnaissance, not an implementation Player. Its production/source authority should mechanically deny repository edits, commits, pushes, package installation, destructive commands, and unrelated mutation.
4. **Exact scope.** Each Scout receives a Game identity, repository root, explicit question, bounded read/search permissions, non-goals, and a report contract.
5. **Parallel fan-out.** Multiple Scouts may run concurrently because their production authority is read-only. Concurrency still requires bounded provider/request budgets and exact Game scoping.
6. **Report, then retire.** Each Scout returns a structured report and its runtime is torn down automatically. Scouts should not linger On Field as permanent Players unless intentionally recruited later.
7. **Synthesize separately.** Scout conclusions are evidence, not architecture truth. The AI Assistant Coach, human Head Coach, or a premium architect such as Opus may reconcile Scout reports and decide the next Play.

## Suggested Scout classes

These are capability classes, not permanent model names:

- **Quick Scout** — very fast file/location/call-chain reconnaissance; smallest useful context and lowest cost.
- **Default Scout** — normal bounded A/B/C/D-style repository investigation; strong code comprehension and good speed.
- **Deep Scout** — difficult subsystem tracing, large context, contradictions, architecture-relevant reconnaissance; slower but still cheaper than premium architecture models.
- **Redundant Scout** — optional second independent read of a high-risk seam when confidence matters more than request count.

Current OpenCode + OpenRouter experiments demonstrate that a free/very-low-cost reconnaissance layer is plausible, but the provider/model roster is runtime evidence and may change.

## Scout report contract

A useful Scout should be able to return more than file names. Expected report sections may include:

- Executive answer
- Facts
- Inferences
- Unknowns
- Contradictions
- Relevant files / symbols / boundaries
- Likely seams
- Risks
- Recommended next probe or architect decision
- Readiness classification such as `READY FOR SYNTHESIS` or `NEEDS ONE MORE BOUNDED PROBE`

Every Scout report should also self-identify its provenance, consistent with the Scout SOP:

```text
REPORT TYPE: SCOUT REPORT
SCOUT AGENT: <agent / harness>
SCOUT MODEL: <exact model>
SCOUT REASONING / EFFORT: <exact setting if known>
RECONNAISSANCE DEPTH: Light / Standard / Deep
SCOUT SCOPE: <bounded question>
SCOUT TIMESTAMP: <project-local time>
```

The report should explicitly separate FACT / INFERENCE / UNKNOWN / CONTRADICTION / ARCHITECT DECISION REQUIRED. A future Architect should know both what evidence was found and what capability level produced that evidence.

## Per-Play Scout Workspace / Report Folder

A MULTI_SCOUT Play should create one temporary **Scout workspace folder for the duration of that Play**, under the repository’s Scout-report parent.

Current Sideline convention may use:

```text
REPORTS/
└── Scout Only/
    └── <Scout-Play-Topic__Timestamp>/
        ├── SCOUT-A-<Topic>-Reconnaissance.md
        ├── SCOUT-B-<Topic>-Reconnaissance.md
        ├── SCOUT-C-<Topic>-Reconnaissance.md
        ├── SCOUT-D-<Topic>-Reconnaissance.md
        └── SCOUT-COMPLETE-<Topic>.md        # optional compilation
```

The exact future parent name (`Scout Only`, `Scout`, etc.) is not frozen yet. The invariant is the **one-Play / one-child-folder boundary**.

Why this matters:

- all reconnaissance for one future Play is physically grouped together;
- no Scout report pollutes ordinary implementation/architecture report space;
- Opus/Sonnet/another Architect can be handed one folder path instead of hunting across the repository;
- the folder is a bounded working-memory package that can later be pruned after durable knowledge graduates;
- concurrent Scout Plays cannot casually mix evidence;
- a human can inspect one directory and immediately understand the reconnaissance package.

Each Scout should write only its own `SCOUT-...` artifact inside that Play folder. Source code, tests, breadcrumbs, configuration, and unrelated reports remain outside Scout write authority.

If the chosen read-only harness cannot safely support a narrowly scoped report-only write permission, keep the Scout itself fully read-only and let a Coach-owned report writer persist the Scout’s returned text into its assigned artifact. **Do not grant broad repository mutation merely so a Scout can save Markdown.**

## Scout Bundle / Cheap Compilation Stage

After all bounded Scouts complete, Sideline may optionally send their reports to one inexpensive **Compiler Scout** / evidence-compression step.

That step is NOT the Architect.

Its job is only to produce something like:

```text
SCOUT-COMPLETE-<Topic>.md
```

containing:

- which Scouts ran;
- exact agent/model/reasoning/depth provenance;
- each Scout’s headline finding;
- agreements;
- contradictions;
- unresolved unknowns;
- important file/seam references;
- recommended architect questions;
- which individual reports contain the strongest evidence.

It must not silently resolve contradictions or turn Scout suggestions into architecture decisions.

The ideal premium handoff becomes:

```text
Scout Play folder complete
        ↓
Sideline notification / Incoming
        ↓
Human: "Great, send this to Opus"
        ↓
Opus reads SCOUT-COMPLETE first
        ↓
Opus spot-checks / opens individual SCOUT-A/B/C/D reports as needed
        ↓
Premium reasoning starts where reconnaissance ends
```

The Architect may receive either the whole Scout Play folder or the compiled report plus exact paths to each individual Scout artifact.

## Detection / orchestration concept

Future Coach logic may classify a proposed Play as:

- `NO_SCOUT_NEEDED`
- `SINGLE_SCOUT`
- `MULTI_SCOUT`
- `ARCHITECT_DIRECT`

Possible MULTI_SCOUT behavior:

1. Assistant Coach proposes the decomposition.
2. Human can approve the formation or use AUTO when trusted.
3. Coach creates the one-Play Scout child folder.
4. Coach selects Scout classes/models against live capability and capacity evidence.
5. Coach launches all bounded Scouts.
6. Each Scout gets a unique exact instance identity, Game scope, report filename, and bounded write target (or Coach-owned report sink).
7. Coach tracks lifecycle independently: `Queued → Reading → Reporting → Complete/Failed`.
8. Each completed report appears as an Incoming/notification event.
9. When all required routes complete, Coach may run the cheap compilation stage.
10. Reports are collected into one Scout bundle with provenance and unresolved contradictions preserved.
11. Coach retires all Scout runtimes automatically.
12. Assistant Coach / human decides whether to send the bundle to a Worker, Sonnet-class architect, or Opus-class architect.

## Notification / handoff contract

The Scout Swarm should feel finished without the human polling terminals.

Useful future notification semantics:

```text
Scout A complete
Scout B complete
Scout C complete
Scout D complete
Scout Play complete — 4/4 reports ready
```

Sideline’s Incoming/report surface is a natural candidate for surfacing these artifacts, but final UX is not frozen.

The human-facing handoff should be as small as:

> "Scouts are back. Four reports and one compiled map are ready. Send to Architect?"

No terminal archaeology should be required.

## Cost / capacity principle

The economic goal is to spend premium intelligence only where premium intelligence changes the outcome.

Cheap/free Scouts should absorb repository archaeology and evidence gathering. Premium Sonnet/Opus/Codex effort should be reserved for architecture, high-risk implementation, contradiction resolution, or synthesis.

Do not assume a current provider’s quota will remain permanent. Capacity belongs in runtime evidence, not the product contract. The scheduler should choose within current truthful limits and stop safely if no eligible Scout capacity exists.

## Security / privacy hard gate

`Read-only` means no production repository mutation; it does NOT mean no data leaves the machine.

Before automated free-provider scouting ships:

- never send API keys, tokens, credentials, secrets, private customer data, or other prohibited/sensitive content to providers that are not approved for it;
- respect provider data-use/privacy terms;
- scope files and directories intentionally rather than blindly uploading entire machines;
- preserve Game isolation;
- redact secrets before model egress where feasible;
- surface provider/privacy class in Dev Mode when it affects the decision;
- allow the human or organization to disable external/free Scouts entirely;
- restrict any Scout write authority to its assigned report artifact/folder only.

## Relationship to Players

A Scout is a temporary specialized Player role with intentionally reduced authority.

Important distinction:

```text
Implementation Player
  may modify the Game under explicit Play authority

Scout
  may observe the bounded Game surface
  may reason and report
  may write only its assigned Scout report artifact when that capability is explicitly granted
  may NOT implement
```

This distinction should remain enforceable at the tool/capability layer rather than relying only on prompt instructions.

## Relationship to future automation

This concept belongs naturally beside Sideline’s automation / Coach Routines direction but should not be conflated with time-based reminders. It is an **event-driven orchestration automation**: a coaching decision triggers a temporary parallel reconnaissance formation, which terminates when its reports return.

Longer-term possibilities include:

- automatically scouting before an Opus architecture Play;
- a standard `Scout A/B/C/D` formation template;
- dynamic Scout count based on problem complexity;
- intentional model diversity to reduce correlated blind spots;
- automatic per-Play Scout folder creation;
- automatic Scout report naming and provenance stamping;
- automatic report bundle + contradiction map;
- cheap compilation into `SCOUT-COMPLETE-*`;
- Incoming notifications as each route returns and when the formation is complete;
- auto-retirement and cleanup;
- quality scoring against later architect/implementation outcomes;
- learning which Scout class/model is best for which reconnaissance pattern.

## Working-memory lifecycle

Scout folders are temporary working memory, not permanent architecture.

After architecture stabilizes and durable knowledge graduates into breadcrumbs, tests, SOPs, North Star, README/contracts, or source truth, old Scout Play folders may be pruned according to the normal report lifecycle.

The goal is a clean handoff package, not another geological layer of permanent reports.

## Non-goals / not frozen yet

This breadcrumb does NOT yet decide:

- final UI wording;
- exact Scout count;
- exact providers/models;
- final parent directory name (`Scout Only` vs `Scout`);
- whether inferred Scout Plays require confirmation;
- whether Scouts themselves receive report-only writes or Coach persists their reports;
- whether compilation is mandatory or optional;
- exact compilation model;
- exact concurrency limits;
- whether Scout runtimes appear in the normal Player roster or a transient automation surface;
- scheduling implementation details.

Those require a future architecture pass when the automation layer is ready.

## Durable WHY

> **Sideline should be able to spend many cheap, bounded, read-only eyes before spending one expensive brain.**
>
> The Head Coach should be able to call a Scout Play, have several specialized Scouts fan out across different seams, receive self-identifying structured evidence inside one bounded Scout Play folder, get notified when the formation is back, and hand one clean reconnaissance package to the Architect. The Scouts then disappear. The human coaches the play; Sideline carries the terminal and report plumbing.
