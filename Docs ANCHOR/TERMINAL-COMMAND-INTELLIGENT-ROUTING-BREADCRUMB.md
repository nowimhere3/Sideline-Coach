# Terminal Command Intelligent Routing Breadcrumb

STATUS: WILL BE / BACK-POCKET PRODUCT IDEA — NOT IMPLEMENTED

## Why this exists

Sideline Coach already has intelligent model/Player routing for AI Plays. The browser can inspect a prompt and stage a route such as Claude / Opus / High.

But some payloads are not AI work at all. They are already explicit shell commands, for example PowerShell commands such as:

```powershell
cd "C:\Users\dmcal\Documents\GitHub\Trend and Tap Assist"
Get-ChildItem ".\Onboarding-Docs" | Where-Object { $_.Name -match 'Scout|ROASTER|Roster' } | Select-Object Name
```

Sending a payload like that to Opus wastes tokens, adds latency, and may distort user intent. Sideline should eventually recognize a terminal-shaped Play and route it directly to an appropriate terminal execution path instead of treating it as an LLM reasoning task.

## Product principle

> **Explicit executable shell intent should outrank AI model routing when the payload is confidently identified as a terminal command and the selected execution policy allows it.**

This is analogous to the existing durable routing principle that explicit human routing intent outranks inference.

## Candidate route classes

Future Play routing may include first-class execution classes such as:

```text
AI_PLAY
TERMINAL_PLAY
SCOUT_PLAY
UNKNOWN / NEEDS_DECISION
```

`TERMINAL_PLAY` is an execution route, not a model.

The router should classify the requested operation before selecting an AI provider/model.

## Detection signals

Potential high-confidence terminal indicators include:

- fenced or raw PowerShell/Bash/cmd commands;
- explicit shell verbs such as `cd`, `Get-ChildItem`, `git status`, `npm test`, etc.;
- user wording such as "run this in PowerShell", "send this to terminal", or an explicit Terminal target;
- a Play payload whose dominant content is executable shell syntax rather than natural-language reasoning;
- an explicit terminal/shell route selected by the human.

Detection must be conservative. A code snippet shown for explanation is not automatically an instruction to execute it.

## Human intent precedence

Suggested precedence:

```text
1. Explicit human route / target
2. Explicit execution intent in the Play
3. High-confidence deterministic terminal classification
4. Normal AI routing policy
5. Unknown / ask for decision when ambiguous
```

Do not silently execute ambiguous code merely because it resembles PowerShell.

## Shell / environment awareness

A terminal route needs its own capability evidence, including:

- shell type (`PowerShell`, `cmd`, `bash`, etc.);
- target Game and working directory;
- target Stadium / machine;
- terminal availability / liveness;
- whether the command requires interactive input;
- whether the command is read-only, mutating, destructive, privileged, networked, or long-running;
- whether a known command is permitted by current policy.

The selected shell must match the command syntax. Sideline should not send PowerShell syntax into Bash and hope for the best.

## Safety boundary

Terminal routing is potentially more consequential than LLM routing because commands can mutate the machine directly.

Future implementation should classify command risk separately from task difficulty.

Possible command-risk classes:

```text
READ_ONLY
LOW_RISK_MUTATION
PROJECT_MUTATION
DESTRUCTIVE / PRIVILEGED
UNKNOWN
```

Examples:

- `Get-ChildItem`, `git status` → likely READ_ONLY
- `npm test` → non-source mutation but may alter caches/runtime state
- `git add`, file writes, package install → mutation
- `git reset --hard`, recursive delete, credential changes, admin commands → destructive / privileged

AUTO terminal routing should start with the safest bounded class. Higher-risk commands may require explicit human confirmation or a stricter policy.

## Relationship to current Play Dispatcher

The Play Dispatcher should eventually stage something like:

```text
STAGED ROUTE
PowerShell · Terminal

Reason:
Detected explicit PowerShell command payload; no AI reasoning required.
```

instead of:

```text
Claude · Opus · High
```

when the prompt is clearly a direct shell task.

Manual mode should still allow the human to override the route.

## Relationship to Scout automation

This becomes especially valuable for Scout automation.

A future Assistant Coach may produce an exact Scout Runner command. Sideline should be able to route that command to Terminal directly rather than paying an AI Player to merely paste/execute deterministic plumbing.

Conceptually:

```text
Assistant Coach designs Scout Play
        ↓
produces bounded Scout Runner command
        ↓
Play Dispatcher detects TERMINAL_PLAY
        ↓
PowerShell terminal receives command
        ↓
Scout Runner launches read-only Scout
        ↓
progress / timer / report return through normal Sideline surfaces
```

This helps keep premium AI effort focused on reasoning rather than terminal choreography.

## Relationship to live terminal progress

Terminal Plays should participate in the future human-readable activity/timer system.

Possible lifecycle:

```text
Queued
→ Sent to PowerShell
→ Running
→ <truthful human-readable activity summaries where observable>
→ Completed / Failed / Interrupted / Unknown
```

The UI may translate observable terminal/process events into concise plain-language status updates, but must not fabricate hidden reasoning or pretend to know what an arbitrary process is internally doing when that evidence is unavailable.

## Architecture note

Do not permanently define Terminal as a special-case hack inside Claude/Codex routing.

The more durable abstraction is:

```text
Play Classification
        ↓
Execution Route
        ├── AI Player
        ├── Terminal Runner
        ├── Scout Runner
        └── future automation/module routes
```

Then model selection happens only inside the AI/Scout routes that actually require a model.

## First proving slice

A sensible first implementation later would be intentionally narrow:

1. detect an explicitly requested PowerShell command Play;
2. require high confidence / explicit terminal intent;
3. stage `PowerShell · Terminal` instead of an AI model;
4. send it to the exact Game-scoped terminal;
5. show truthful lifecycle state;
6. do not auto-route destructive/ambiguous commands;
7. preserve MANUAL override.

Once field-proven, deterministic shell classification can expand cautiously.

## Non-goals / not frozen yet

This breadcrumb does NOT yet decide:

- exact command parser;
- exact confidence thresholds;
- final risk taxonomy;
- which commands qualify for no-confirmation AUTO execution;
- whether terminal commands run in visible terminals or a controlled runner process;
- exact UI wording;
- how interactive prompts are handled;
- shell sandboxing;
- remote Stadium execution policy;
- whether Scout Runner becomes its own execution route instead of a Terminal Play.

Those require an architecture pass before implementation.

## Durable WHY

> **Do not spend model intelligence on deterministic terminal choreography.**
>
> When the user clearly asks Sideline to execute a shell command, Coach should be able to recognize that the correct Player is the terminal itself, route safely to the right shell/Game/Stadium, show truthful progress, and reserve AI tokens for work that actually requires reasoning.
