# Sideline Coach — Stage 1.15 Atomic Play Transport + Reliable Submit Stop Report

## Result

STOP. The current public VS Code extension terminal API cannot establish the required atomic multiline paste contract safely for Codex on this Windows runtime. No unproven dispatch transport change was retained.

## Starting state

The existing dispatch path correctly resolves an opaque Player instance through `PlayerRoster`, rejects pending/unknown instances, obtains that instance's terminal, sends any allowlisted model switch separately, and then calls `terminal.sendText(prompt.replace(/\u0000/g, ''), true)`.

The browser dispatch request already carries `playerInstanceId`, not a terminal name. Multiple same-type Player instances, exact targeting, reconnect synchronization, Roster behavior, and Incoming reports were already proven and were not changed.

## Existing dispatch mechanism inspected

`POST /api/dispatch` reaches `CoachServer.dispatch()`. After target resolution it uses VS Code's public `Terminal.sendText(text, shouldExecute)` API. The current model switch is a distinct `sendText(modelSwitch, true)` call; the Play is then sent as one call with `shouldExecute: true`.

VS Code documents that `shouldExecute` adds the platform execution newline to the text it writes to terminal stdin. Thus the current Play payload and submit newline are in the same terminal input operation. This directly explains the observed Codex behavior: the complete text can land in Codex's composer while the final newline is interpreted as part of its paste/input handling rather than as a clean separate submit.

## Transport investigation and stop condition

The supported extension API does provide `sendText(prompt, false)` and a separate `sendText('', true)`, which could separate insertion from submit. However, its public surface provides no way to request the terminal's bracketed-paste transport mode. Current VS Code source confirms the internal terminal implementation has an optional bracketed-paste parameter, but the extension-host RPC exposes only text and `shouldExecute`; extensions cannot select that internal mode.

Without bracketed-paste control, a multiline `sendText` operation normalizes line breaks to terminal return characters. For a TUI this is raw key-like input, not a proven atomic paste event; it can recreate the exact failure this stage must prevent: line-by-line execution or a partial/misinterpreted Play. Manually injecting bracketed-paste escape sequences would be an unverified Codex-specific protocol assumption. Current Codex Windows behavior varies across versions and terminals, including bracketed-paste and paste-burst edge cases, so that would not satisfy failure safety.

This meets the stage's explicit stop condition: VS Code's supported terminal APIs cannot provide safe atomic transport. Implementing a focus-dependent workbench command or OS-level keyboard automation would also violate the target-instance and supported-API safety boundaries, so neither was attempted.

## Retained changes

None to runtime source, Player adapters, browser UI, tests, breadcrumbs, or diagnostics contract. A tentative adapter-owned two-write implementation and its tests were removed after the public API inspection showed it could not prove atomic multiline delivery.

## Exact files changed

- `REPORTS/Codex/Stage-1.15-Atomic-Play-Transport-Stop-Report.md`

## Codex, Claude, and AntiGravity implications

Codex is the observed failing case and cannot be certified with the present terminal API. Claude and AntiGravity were not forced through the same unproven path. Their current behavior remains unchanged; this stage does not claim an atomic multiline guarantee for them.

## Model switching and Player safety

No sequencing change was retained. Existing model-switch behavior, empty/invalid prompt rejection, max-prompt validation, exact Player-instance resolution, pending/closed refusal, and legacy compatibility behavior remain unchanged.

## Automated verification

The unchanged runtime passed its existing verification suite:

```text
npm run check       # passed
npm run compile     # passed
npm test            # 25 passed, 0 failed
git diff --check    # passed
npm run diagnostics # completed
```

Diagnostics again reported only the existing unrelated `A6` configured-port ephemeral-range condition and `A5` duplicate-copy warning.

## Human verification

Not requested because the required safe transport was not implemented. Asking a human to test an unproven multiline transport would not satisfy the stage contract.

## Breadcrumb Impact

No implementation behavior changed, so the existing Safe Multiline Play Transport requirement remains a protected WILL BE item. No breadcrumb was promoted to IS.

## Diagnostic Impact

YES — a durable future diagnostic boundary has been identified, but no diagnostics feature was added. A future transport owner should be able to distinguish: Player resolved, payload transport attempted/failed, and submit attempted. Current RM-1 cannot observe those facts without new instrumentation and must not infer them.

## Remaining known unknowns

- Whether the running Codex version and terminal expose a stable provider-supported input bridge other than VS Code `Terminal.sendText`.
- Whether Claude or AntiGravity publish a supported atomic-paste/submit mechanism suitable for their adapters.
- Whether a future VS Code public API will expose bracketed paste or a per-terminal key-event transport without relying on focus.

## Recommended next Play

Architect and prove a supported Codex-specific transport bridge that can send one bracketed payload and one distinct submit to the already resolved terminal instance before changing dispatch again.

REPORT NAME: Stage-1.15-Atomic-Play-Transport-Stop-Report.md
STAGE: Stage 1.15
WHAT IT IS: Atomic Play Transport + Reliable Submit Stop Report
TIMESTAMP: 2026-09-11 00:20 MDT
