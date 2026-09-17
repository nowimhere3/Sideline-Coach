# Single Scout Automation + Live Progress Breadcrumb

STATUS: WILL BE / CRAWL-BEFORE-WALK PRODUCT DIRECTION — NOT IMPLEMENTED

## North Star

Before Sideline Coach automates multi-Scout formations, prove one bounded Scout Play end to end.

The human or AI Assistant Coach should be able to define a reconnaissance objective and hand it to Sideline without manually opening OpenCode, selecting a model, pasting a prompt, collecting output, or babysitting a terminal.

The smallest useful autonomous contract is:

```text
Human / AI Assistant Coach
        ↓
Scout Play
        ↓
Scout Router
        ↓
choose capability class / model
        ↓
launch one mechanically read-only Scout
        ↓
Scout investigates bounded Game scope
        ↓
Scout returns structured report text
        ↓
Coach-owned report writer persists artifact
        ↓
Incoming / notification
        ↓
Scout process retires
```

If this single-Scout loop is reliable, future multi-Scout orchestration is multiplication of a proven primitive rather than a new architecture.

## Product Module Direction

Scout automation should be an optional Sideline Coach product module / capability pack, not necessarily a separate VS Code extension.

It naturally depends on Sideline-native concepts including Game identity, Stadium identity, filesystem scope, report discovery, Incoming, routing, capacity/freshness, notifications, and Player lifecycle.

Possible future surface:

```text
[ Enable Scout Automation ]

Scout the Next Play
Scout Router
Scout Capacity
Scout Play History
Scout Reports
```

Leaving the module disabled should preserve normal Sideline behavior.

## Terminal Today, Process Contract Tomorrow

The first proof may invoke OpenCode through the terminal / CLI because that is the available execution boundary today.

Do not fossilize "open a visible terminal and type commands" as the final architecture.

The durable abstraction is a **Scout Runner process contract**. A visible terminal can remain a Dev Mode observation surface, while Sideline programmatically owns invocation, lifecycle, output capture, cancellation, report persistence, and retirement.

Current OpenCode exposes a non-interactive `opencode run` CLI, model selection, agent selection, JSON event output, and project-directory targeting. These make it a plausible first Scout Runner adapter.

## Scout Router V1 — Deterministic First

Avoid spending a model call merely to choose a model when simple policy is sufficient.

Route by abstract Scout capability class:

```text
QUICK
DEFAULT
DEEP
BALANCED
```

Example initial policy:

- QUICK: file/symbol/test lookup, straightforward call-chain mapping;
- DEFAULT: normal repository archaeology, ownership and execution-path tracing;
- DEEP: cross-subsystem, contradiction-heavy, historical/security/architecture-sensitive reconnaissance;
- BALANCED: middle route / fallback when QUICK is too light and DEEP is excessive.

Resolve the capability class to a currently available provider/model at runtime. Current OpenRouter free-model names are evidence, not architecture.

If deterministic classification confidence is low, a cheap routing model may be used later as an exception. Do not create token confetti when rules can decide truthfully.

## Capacity / Usage Evidence

Scout automation should understand current capacity before launching work.

Separate two truths:

1. **Local observed usage** — how many Scout/provider requests Sideline itself launched today.
2. **Provider-confirmed allowance/remaining capacity** — only when an authoritative provider API exposes it.

Never present an estimated remaining quota as provider-confirmed truth.

Possible evidence shape:

```text
SCOUT CAPACITY
Requests observed by Sideline today: 37
Published allowance: 50
Estimated remaining: 13
Evidence: LOCAL_LEDGER + PROVIDER_POLICY
Provider-confirmed remaining: UNKNOWN
Freshness: LIVE / CACHED / STALE
```

This naturally belongs beside the broader Usage Sentinel / Capacity direction.

## Read-Only Scout, Coach-Owned Filing Cabinet

The Scout itself should remain mechanically read-only against the Game.

Preferred boundary:

```text
Scout
  reads + reasons + returns report text
        ↓
Scout Runner / Coach-owned report writer
  persists the returned artifact
        ↓
REPORTS/Scout Only/<Play>/SCOUT-...md
```

Do not broaden Scout filesystem mutation merely so it can save Markdown.

## Live Terminal / Player Progress Surface

Future autonomous Scouts and ordinary terminal Players should expose useful progress to the human using the existing terminal timer/lifecycle pattern rather than showing only a silent spinner.

The human-facing goal is a compact elapsed timer plus a changing plain-language activity sentence.

Example:

```text
00:06  Reading Scout SOP and roster…
00:19  Mapping onboarding files…
00:42  Tracing report conventions…
01:08  Comparing current repo structure with the SOP…
01:31  Compressing findings…
01:46  Finished — Scout report ready
```

The sentence should describe observable activity at a useful human level. It should not expose hidden chain-of-thought, fabricate exact internal reasoning, or dump raw implementation events.

Prefer "datafied" / normalized progress language derived from real lifecycle and tool/event evidence, such as:

```text
Starting Scout
Reading files
Searching code
Inspecting tests
Comparing evidence
Preparing report
Waiting on provider
Finished
Failed
Interrupted
Unknown
```

Where richer truthful evidence exists, Sideline may decorate the state with one short bounded object:

```text
Reading files — Onboarding-Docs
Searching code — transcript sync
Inspecting tests — routing intelligence
Preparing report — Add Game identity
```

If current activity cannot be known truthfully, show a generic truthful state rather than inventing narration.

## Timer / Lifecycle Contract

Reuse the spirit of Sideline's existing Player timer/dropdown system.

A Scout/terminal activity row should be able to expose:

- elapsed time;
- canonical lifecycle state;
- current human-readable activity sentence when available;
- last meaningful activity timestamp;
- completion/failure/unknown terminal outcome;
- report artifact/path when one exists.

The progress surface is observability, not authority. It must not infer completion merely because output stopped.

## OpenCode Event Adapter Opportunity

OpenCode `run --format json` emits newline-delimited JSON events intended for scripting. A future Sideline adapter can consume those events, map supported event/tool types into normalized progress language, update the timer surface, and capture the final answer without requiring the human to watch raw terminal output.

This should be proven experimentally before freezing an event schema.

## Crawl Test

The first field proof should be deliberately small:

1. run one OpenCode Scout non-interactively against a real Game;
2. explicitly choose one free Scout model;
3. use the mechanically read-only Explore agent;
4. ask it to read the Game's Scout SOP / roster and perform one bounded reconnaissance task;
5. confirm no Game files changed;
6. confirm the Scout returns a useful structured report;
7. confirm the process exits when the bounded task is done;
8. then repeat with JSON event output to learn whether Sideline can truthfully map events into timer/progress states.

Only after this is field-proven should Sideline automate model selection, report persistence, Incoming notification, and multi-Scout fan-out.

## Desired End State

Eventually an AI Assistant Coach may hand Sideline a machine-readable Scout Play such as:

```text
SCOUT PLAY
Game: Trend and Tap Assist
Objective: Investigate full-transcript sync ownership
Scope: current Game
Routing: AUTO
Report: REQUIRED
```

Sideline chooses the Scout, checks capacity, launches it, surfaces live progress, captures and files the report, notifies the human, and retires the process.

The human should not need to manually enter Sideline Coach, open a terminal, select a model, or collect the output when AUTO is enabled.

## Durable WHY

> **Prove one autonomous Scout before building the swarm.**
>
> Sideline should own the repetitive invocation and filing plumbing, while the Head Coach owns intent and approval. The progress surface should make autonomous work legible without exposing or inventing private reasoning.
