# Breadcrumb — Terminal Player Multiline Live-Output Gap

**STATUS:** Diagnosed, not yet fixed  
**AREA:** Sideline Coach → First-Class Terminal Player → Live Output / Terminal Guts  
**DATE:** 2026-09-25

## Discovery

The Terminal Player itself is working correctly for observable commands.

Field tests proved all of the following work:

- simple PowerShell commands
- multiple commands separated with `;`
- `Start-Job` / `Wait-Job` / `Receive-Job`
- large terminal output
- live `OUTPUT` capture
- Copy New / Copy All
- `Until dismissed` retention

The failure is specifically triggered by **literal multiline command input**.

## Exact Root Cause

`src/player-roster.ts` explicitly checks whether a Terminal Play contains newline characters:

```ts
const singleLine = !/\r|\n/.test(check.command.trim());

if (shell && singleLine) {
    const execution = shell.executeCommand(check.command.trim());
    const watching = this.watchCommandOutput(execution, instanceId);
    ...
    return { kind: 'accepted', turnRef, observed: true };
}
```

For a single physical line, Sideline launches the command through VS Code Shell Integration and receives a `TerminalShellExecution`, which can be watched through `execution.read()`.

If the Play contains a literal newline, it deliberately bypasses that observable route and falls back to:

```ts
terminal.sendText(check.command, true);

this.publishTerminalActivity(
    instanceId,
    'channel',
    TERMINAL_OUTPUT_UNAVAILABLE_SENT
);

return {
    kind: 'accepted',
    turnRef,
    observed: false
};
```

That produces:

```text
CHANNEL  Command sent · live output unavailable
```

## Field Proof

These worked:

```text
Write-Output "SIDELINE TERMINAL TEST"
→ OUTPUT ✅
```

```text
Write-Output "MULTI TEST A"; Write-Output "MULTI TEST B"
→ OUTPUT ✅
```

```text
Start-Job ...; Wait-Job ...; Receive-Job ...
→ OUTPUT ✅
```

A command producing approximately 5,000 characters of output also remained observable.

But a genuinely multiline PowerShell payload produced:

```text
CHANNEL  Command sent · live output unavailable
```

Therefore:

**Output size is not the problem. Background jobs are not the problem. Multiple PowerShell statements are not the problem. Literal newline characters in the dispatched Play are the trigger.**

## Why This Exists

The Terminal implementation intentionally avoids a terminal-wide listener.

Sideline watches only the execution that Coach itself started, so arbitrary commands typed manually by the human are never read.

`watchCommandOutput()` operates on the specific `TerminalShellExecution` returned by Shell Integration.

That privacy boundary is desirable.

The gap is simply that **multiline Plays currently have no equivalent observable execution path**.

## Product Meaning

From Dad's perspective:

```text
Single-line Terminal Play
→ first-class observable Player ✅

Multiline Terminal Play
→ fire-and-forget terminal paste ❌
```

But both are conceptually just:

> Send this Play to Terminal.

The distinction should eventually be invisible to the user.

## WAS → IS → WHY → WILL BE

**WAS**

Terminal Player appeared intermittently unable to show its terminal guts, leading to investigation of settings, retention, Dev Mode, stale sessions, output volume, and Terminal recruitment.

**IS**

The failure boundary is now known precisely:

```text
literal newline
→ singleLine = false
→ terminal.sendText()
→ observed = false
→ live output unavailable
```

**WHY**

Only commands launched through VS Code Shell Integration currently produce an execution object whose output Sideline can safely observe.

Multiline payloads are intentionally sent through an unobserved fallback path.

**WILL BE**

Future repair should give multiline Terminal Plays a **controlled observable execution path** while preserving the existing privacy boundary.

One possible architecture:

```text
multiline Play
→ create controlled script representation
→ launch it through one observable Shell Integration command
→ TerminalShellExecution
→ execution.read()
→ normal live OUTPUT
→ retention / Copy / Until dismissed
```

For PowerShell, a temporary `.ps1` executed through one observable command is one candidate, but the implementation Player should first inspect whether VS Code Shell Integration provides a cleaner native mechanism.

## Preserve

Future work must preserve:

- human-typed terminal commands are never globally snooped
- first-class Terminal Player identity
- live output capture
- Copy New / Copy All
- retention including `Until dismissed`
- cancellation and completion semantics
- PowerShell quoting and multiline semantics
- here-strings, pipes, blocks, and other legitimate multiline syntax

## Do Not

Do **not** simply remove the `singleLine` guard and blindly pass multiline payloads into `executeCommand()` without proving that command semantics and privacy remain correct.

## Smallest Future Play

**Add observable multiline execution to the first-class Terminal Player without introducing terminal-wide capture.**

Until then, Terminal Plays that need live-output visibility can be flattened to a single physical PowerShell line where practical.