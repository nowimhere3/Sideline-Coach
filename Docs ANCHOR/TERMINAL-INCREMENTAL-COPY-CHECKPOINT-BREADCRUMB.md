# Terminal Incremental Copy / Checkpoint Breadcrumb

STATUS: WILL BE / BACK-POCKET PRODUCT IDEA — NOT IMPLEMENTED

## North Star

Sideline Coach should eventually make terminal collaboration with the Assistant Coach dramatically less manual by letting the human copy **only the terminal activity that has happened since the last copy checkpoint**.

The human should not need to repeatedly select and copy an entire terminal transcript just to show the Assistant Coach what changed.

The intended experience is:

```text
Terminal already contains history
        ↓
Human clicks Copy / Send Terminal Delta
        ↓
Sideline copies everything since the previous checkpoint
        ↓
That point becomes the new checkpoint
        ↓
More commands run
        ↓
Human clicks Copy again
        ↓
Only the newly-added command/output range is copied
```

This creates a lightweight terminal-delta protocol between the human, Sideline Coach, and the AI Assistant Coach.

## Human example

Assume the terminal currently contains a long history.

### First handoff

The human chooses the terminal and clicks something like:

```text
Copy Since Last Checkpoint
```

If no checkpoint exists yet, Sideline may copy the current available terminal history or allow the human to establish an initial baseline/checkpoint.

That copied range becomes **Checkpoint A**.

The human sends the copied terminal evidence to the Assistant Coach.

### Second handoff

Three more commands are run.

The human clicks Copy again.

Sideline copies only:

```text
Checkpoint A
        ↓
command 1 + output
command 2 + output
command 3 + output
        ↓
current end of terminal
```

The new end becomes **Checkpoint B**.

### Third handoff

One more command is run.

The human clicks Copy again.

Only that one command and its output are copied.

The end becomes **Checkpoint C**.

The result is incremental evidence handoff instead of repetitive terminal archaeology.

## Core product invariant

> **Copying terminal evidence should advance an explicit per-terminal checkpoint, so the next copy returns only the delta since that checkpoint.**

Checkpoint state belongs to the terminal/session instance, not globally across every terminal.

Two terminals may therefore have independent checkpoints:

```text
Terminal A → checkpoint A7
Terminal B → checkpoint B2
```

## Why this matters

This can remove several repeated manual steps from the Sideline workflow:

- no repeated Select All;
- no repeated copying of hundreds of old lines;
- less noise sent to the Assistant Coach;
- fewer duplicate tokens spent re-reading terminal history;
- easier mobile/remote debugging;
- much clearer cause/effect between a newly-issued command and its result;
- faster iteration when the Assistant Coach is directing terminal experiments;
- cleaner terminal evidence for bug reports and architecture discussions.

This is especially valuable when the Assistant Coach is operating as the control tower while the human runs commands on another machine/window.

## Relationship to terminal reports

The same captured delta could support multiple output modes.

Potential actions:

```text
Copy Delta
Copy Delta as Report
Send Delta to Incoming
Send Delta to Assistant Coach
Save Delta
```

The simplest first implementation may just place the captured range on the clipboard.

A richer later version may wrap it in a small terminal evidence envelope such as:

```text
TERMINAL DELTA
Game: Trend and Tap Assist
Stadium: <exact instance>
Terminal: PowerShell 1
From checkpoint: A
To checkpoint: B
Started: <timestamp if known>
Captured: <timestamp>

<command/output transcript>
```

Do not require this reporting wrapper for the first useful version.

## Per-command relationship

The checkpoint primitive naturally supports per-command capture without requiring command-level parsing to be perfect.

If only one command has executed since the last checkpoint, the copied delta effectively becomes a one-command report.

Later Sideline may become command-aware and explicitly divide the delta into:

```text
Command
stdout
stderr
exit code
elapsed time
```

However, command parsing is an enhancement. The durable primitive is the **byte/line/event range since the last checkpoint**.

## Possible implementation approaches

Final implementation is not frozen.

Potential approaches include:

### 1. Terminal-output event ledger

If Sideline owns or observes terminal output events, maintain an append-only per-terminal event buffer and store a checkpoint cursor.

```text
terminal event 0
terminal event 1
...
terminal event N
                ↑ checkpoint
terminal event N+1
...
terminal event M
                ↑ current end
```

Copy returns `N+1..M`, then moves the cursor to `M`.

This is likely the cleanest architecture if exact terminal event capture is available.

### 2. Transcript snapshot + offset

Persist or observe a terminal transcript and store the previous character/line offset.

On Copy:

```text
new transcript substring = transcript[lastOffset:currentEnd]
lastOffset = currentEnd
```

Need care around terminal scrollback truncation, control sequences, wrapping, clear-screen behavior, and buffer resets.

### 3. Command execution records

For commands launched through Sideline's own Terminal Runner, Sideline can retain structured command records directly.

```text
commandId
command text
working directory
startedAt
finishedAt
exitCode
stdout/stderr
```

Then checkpointing can operate over command IDs rather than raw terminal text.

This may ultimately provide the highest-quality evidence for Sideline-owned terminal Plays.

### 4. Hybrid

Use structured command records for Sideline-launched commands and raw terminal-delta capture for human/manual terminal activity.

This may provide the best long-term experience.

## Checkpoint semantics

Potential checkpoint states:

```text
NO_CHECKPOINT
CHECKPOINT_ACTIVE
BUFFER_RESET
CHECKPOINT_STALE
```

Sideline should avoid pretending a perfect delta exists after terminal history has been irreversibly lost or reset.

If scrollback is truncated or the terminal is recreated, the UI should surface that the prior checkpoint can no longer be honored exactly.

Example:

```text
Previous checkpoint is no longer available.
Copying from earliest available terminal history.
```

## UX possibilities

Potential compact actions:

```text
Copy New
Copy Since Last
Send New to Coach
Mark Checkpoint
Reset Checkpoint
```

A simple copy icon may be enough for Dad Mode once the behavior is understood.

Dev Mode may expose:

```text
Checkpoint: 2026-09-15 16:52:14
New events: 37
New commands: 3
Buffer integrity: Exact
```

No final wording or UI is frozen.

## Relationship to live terminal observability

This complements the separate breadcrumb for human-readable terminal progress.

Live progress answers:

> "What is the terminal doing right now?"

Incremental copy answers:

> "What happened since the last time I showed the Coach?"

Together they create a much stronger terminal control surface.

## Relationship to intelligent terminal routing

This also complements intelligent PowerShell/terminal routing.

Future flow:

```text
Assistant Coach proposes executable PowerShell
        ↓
Sideline routes Play directly to Terminal Runner
        ↓
Terminal progress is observable
        ↓
command completes/fails
        ↓
new terminal evidence accumulates after checkpoint
        ↓
Copy/Send Delta
        ↓
Assistant Coach receives only the new evidence
```

This reduces both manual friction and repeated context/token cost.

## Relationship to Scout automation

The same terminal-delta primitive may be useful during Scout Runner experiments.

For example:

```text
Checkpoint A
↓
launch Scout test
↓
OpenCode logs + provider response + exit state
↓
Copy Delta
↓
Assistant Coach receives exactly the Scout test evidence
```

Later, fully automated Scout Runs should report through structured Sideline lifecycle/events rather than requiring terminal-copy operations, but the delta feature remains valuable for manual debugging and fallback inspection.

## Safety / privacy

Copying terminal output can expose secrets.

Future implementation should consider:

- obvious secret/token redaction before automatic send operations;
- distinction between Copy to Clipboard and Send externally;
- explicit destination before automatic transmission;
- Game/Stadium/terminal identity in Dev Mode;
- avoiding silent upload of entire old terminal histories;
- local-only checkpoint state where possible.

The clipboard action itself may remain deliberately local/manual even when Send-to-Coach becomes available later.

## Non-goals / not frozen

This breadcrumb does NOT yet decide:

- exact UI wording;
- whether first Copy captures all history or starts a new baseline;
- whether checkpoint units are lines, bytes, PTY events, or command IDs;
- scrollback retention policy;
- how terminal reset/clear-screen affects checkpoints;
- whether the clipboard payload is raw text or a structured report;
- whether Send to Assistant Coach is automatic or confirmation-gated;
- exact secret-redaction system;
- exact mobile UX.

These should be resolved when terminal observability / Runner architecture is actively implemented.

## Durable WHY

> **The Assistant Coach should never need the same terminal history twice.**
>
> Sideline should remember where the last terminal handoff ended, then make the next handoff contain only what is new. This turns terminal collaboration into an incremental evidence stream rather than repeated copy-all archaeology.
