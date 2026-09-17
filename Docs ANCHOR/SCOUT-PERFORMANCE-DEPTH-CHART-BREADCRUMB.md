# Scout Performance Ledger & Depth Chart — Breadcrumb

**Status:** FUTURE / LOWER-PRIORITY BREADCRUMB  
**Captured:** 2026-09-16 MDT  
**Scope:** Sideline Coach Scout subsystem  
**Priority:** Below current Scout Runner / formation field-proof work

## Why this exists

Sideline should eventually evaluate Scouts from its own field evidence rather than relying only on provider descriptions, model cards, benchmarks, or intuition.

A Scout roster should become a real depth chart built from actual Sideline Plays:

- which Scouts complete reliably;
- which task classes they perform well on;
- where they fail;
- how long they take;
- how much provider capacity they consume;
- whether downstream Architects accept their reconnaissance;
- whether downstream Workers succeed without rediscovering the same terrain;
- where a Scout confidently reports something later disproven by stronger evidence.

The goal is not gamification for its own sake. The goal is better routing from real team history.

## Core invariant

> **Measured telemetry and judged performance are different evidence classes. Never blend them into fake precision.**

### Measured telemetry

Examples:

- Scout / model / provider
- Play ID
- task class
- start / end / duration
- queued / running / complete / failed / interrupted
- exit code
- concurrency slot / wave
- report size
- observed provider requests where available
- rate-limit events
- timeout / retry events
- model substitutions, if explicitly authorized

These should be recorded automatically by the Scout Runner whenever possible.

### Downstream evaluation

Examples:

- Architect accepted Scout map
- Architect had to reopen significant archaeology
- Scout found the decisive contradiction
- Scout recommended Worker and Worker succeeded
- Scout missed an important file / ownership seam
- Scout conclusion was later disproven
- report was high-value / low-value for its assigned task

These are evaluations, not raw telemetry. Preserve provenance such as evaluator, model, human approval, and evidence.

## Future artifacts

Possible canonical plumbing shape:

```text
Plumbing SLC/
└── Scouts/
    ├── Players/
    ├── Runs/
    ├── Performance/
    │   ├── scout-ledger.jsonl
    │   ├── depth-chart.json
    │   └── evaluations/
    └── SOPs/
```

Exact paths are not frozen by this breadcrumb.

## Scout card concept

Each Scout may eventually expose a friendly card containing evidence such as:

```text
NEMOTRON 3 ULTRA
Role: DEEP SCOUT

Status: STARTER
Starts: 14
Completed: 13
Failed: 1
Completion: 92.9%
Median runtime: 3m 42s

Observed strengths:
- deep archaeology
- contradiction finding
- historical reconciliation

Observed weaknesses:
- simple lookup may be slower than lighter Scouts

Downstream:
- Architect accepted map: 11 / 12 evaluated Plays
- significant rediscovery required: 1 / 12
```

Do not publish ratings until enough comparable field evidence exists.

## Routing evolution

Initial routing may remain deterministic by capability class:

```text
QUICK     -> North Mini
DEFAULT   -> Laguna
BALANCED  -> Nemotron Super
DEEP      -> Nemotron Ultra
```

Future routing may use evidence such as:

```text
Task class
+ historical completion
+ downstream acceptance
+ latency
+ capacity
+ cost
+ provider health
= recommended Scout
```

The routing reason should remain inspectable and human-readable.

## Position battles / roster changes

Sideline may eventually compare Scouts on genuinely comparable Plays.

Example:

```text
DEFAULT SCOUT COMPETITION

Laguna vs Nemotron Super

Completion on comparable Plays
Median runtime
Downstream acceptance
Provider reliability
Capacity / cost

Recommendation:
Promote / retain / bench / reserve / injured list
```

One failed Play is not enough to cut a Player. One successful Play is not enough to crown a star. Require repeated evidence appropriate to the decision consequence.

## Roster discovery

Future Scout research may deliberately scout available OpenCode / OpenRouter / other approved agent-model combinations to find candidate Players for specific roles.

Candidate discovery should be separated from roster promotion:

1. discover candidate;
2. verify compatibility and permissions;
3. run controlled field Plays;
4. collect telemetry;
5. evaluate report usefulness;
6. promote only when evidence supports it.

Free and paid Scouts may coexist. Cost should be one routing variable, not the only variable.

## Current field evidence seed

Formation Alpha established the first real depth-chart evidence:

- North Mini / QUICK: completed first live assigned Play.
- Laguna / DEFAULT: failed first live assigned Play with non-zero exit.
- Nemotron Ultra / DEEP: completed first live assigned Play and produced useful deep reconciliation.

This is insufficient for promotion/demotion decisions, but it proves the performance ledger has real evidence to ingest.

## Priority note

This is intentionally **not** the next implementation priority.

Current priority remains proving the Scout Runner scales across bounded concurrent formations and behaves correctly under queued waves, partial failure, and repeated real-world use.

Implement the performance ledger only after the execution primitive is boringly reliable, unless lack of telemetry starts blocking Scout routing decisions.

## Future success condition

Sideline can answer:

> "For this kind of reconnaissance, which Scout has actually performed best for us?"

using its own auditable field history rather than provider marketing or memory alone.
