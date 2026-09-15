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
3. **Read-only by construction.** A Scout is reconnaissance, not an implementation Player. Its tool permissions should mechanically deny repository edits, commits, pushes, shell mutation, package installation, and destructive commands.
4. **Exact scope.** Each Scout receives a Game identity, repository root, explicit question, bounded read/search permissions, non-goals, and a report contract.
5. **Parallel fan-out.** Multiple Scouts may run concurrently because their repository authority is read-only. Concurrency still requires bounded provider/request budgets and exact Game scoping.
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

A mechanically read-only Scout may return this report through its controlled channel without being granted repository write authority. If persistent Markdown reports are later desired, prefer a separate Coach-owned report writer or a narrowly scoped report-only capability rather than granting the Scout general filesystem write access.

## Detection / orchestration concept

Future Coach logic may classify a proposed Play as:

- `NO_SCOUT_NEEDED`
- `SINGLE_SCOUT`
- `MULTI_SCOUT`
- `ARCHITECT_DIRECT`

Possible MULTI_SCOUT behavior:

1. Assistant Coach proposes the decomposition.
2. Human can approve the formation or use AUTO when trusted.
3. Coach selects Scout classes/models against live capability and capacity evidence.
4. Coach launches all bounded Scouts.
5. Each Scout gets a unique exact instance identity and Game scope.
6. Coach tracks lifecycle independently: `Queued → Reading → Reporting → Complete/Failed`.
7. Reports are collected into one Scout bundle.
8. Coach retires all Scout runtimes.
9. Assistant Coach / architect receives only the bundle plus provenance and unresolved contradictions.

## Cost / capacity principle

The economic goal is to spend premium intelligence only where premium intelligence changes the outcome.

Cheap/free Scouts should absorb repository archaeology and evidence gathering. Premium Sonnet/Opus/Codex effort should be reserved for architecture, high-risk implementation, contradiction resolution, or synthesis.

Do not assume a current provider’s quota will remain permanent. Capacity belongs in runtime evidence, not the product contract. The scheduler should choose within current truthful limits and stop safely if no eligible Scout capacity exists.

## Security / privacy hard gate

`Read-only` means no repository mutation; it does NOT mean no data leaves the machine.

Before automated free-provider scouting ships:

- never send API keys, tokens, credentials, secrets, private customer data, or other prohibited/sensitive content to providers that are not approved for it;
- respect provider data-use/privacy terms;
- scope files and directories intentionally rather than blindly uploading entire machines;
- preserve Game isolation;
- redact secrets before model egress where feasible;
- surface provider/privacy class in Dev Mode when it affects the decision;
- allow the human or organization to disable external/free Scouts entirely.

## Relationship to Players

A Scout is a temporary specialized Player role with intentionally reduced authority.

Important distinction:

```text
Implementation Player
  may modify the Game under explicit Play authority

Scout
  may observe the bounded Game surface
  may reason and report
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
- automatic report bundle + contradiction map;
- auto-retirement and cleanup;
- quality scoring against later architect/implementation outcomes;
- learning which Scout class/model is best for which reconnaissance pattern.

## Non-goals / not frozen yet

This breadcrumb does NOT yet decide:

- final UI wording;
- exact Scout count;
- exact providers/models;
- whether inferred Scout Plays require confirmation;
- whether Scout reports are persisted automatically;
- how reports are synthesized;
- exact concurrency limits;
- whether Scout runtimes appear in the normal Player roster or a transient automation surface;
- scheduling implementation details.

Those require a future architecture pass when the automation layer is ready.

## Durable WHY

> **Sideline should be able to spend many cheap, bounded, read-only eyes before spending one expensive brain.**
>
> The Head Coach should be able to call a Scout Play, have several specialized Scouts fan out across different seams, receive structured evidence, and watch the Scouts disappear when the reconnaissance is complete. The human coaches the play; Sideline carries the terminal plumbing.
