# Development Scout Launch SOP

## Purpose

Use this SOP when launching Scouts manually during Sideline Coach development.

This SOP records only the process that was field-observed on 2026-09-20. Do not replace it with hand-built `Start-Job` wrappers, ad hoc direct `opencode run` loops, or invented launcher plumbing unless the Scout harness itself is the thing being debugged.

## North Star

The human should not debug Scout-launch plumbing every time a Scout Play is needed.

Use the existing Scout runner. Load the OpenRouter credential once into the current PowerShell process. Feed the runner a Formation manifest. Let the runner own QUEUED / RUNNING / terminal outcome state.

## Development Shell

Run from the PowerShell terminal inside the Sideline Coach source VS Code window.

Expected repository:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach`

Expected prompt:

`PS C:\Users\dmcal\Documents\GitHub\SidelineCoach>`

## Step 1 — Prepare the Formation manifest

The Formation manifest must already contain the intended Scout lanes, objectives, agents, Game root, and concurrency.

Use the exact manifest supplied for the Play. Do not rebuild or reinterpret it at launch time unless the Play explicitly requires a receiver substitution.

Known manifest shape used by the development Scout runner:

- `playId`
- `gameRoot`
- `maxConcurrency`
- `scouts[]`
  - `id`
  - `agent`
  - `objective`

## Step 2 — Set the OpenCode Scout database path

Use:

```powershell
$env:OPENCODE_DB = Join-Path $env:USERPROFILE '.local\share\opencode\scout.db'
```

## Step 3 — Load the OpenRouter API key securely into this PowerShell process

Use:

```powershell
$secure = Read-Host "Paste your OpenRouter API key" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
Write-Host "OPENROUTER READY:" ([bool]$env:OPENROUTER_API_KEY)
```

Expected confirmation:

`OPENROUTER READY: True`

Do not print, paste into reports, commit, screenshot, or persist the raw API key.

## Step 4 — Run the existing Scout Formation runner

Use the real manifest path for the Play:

```powershell
npm run scout:play -- --manifest "<ABSOLUTE MANIFEST PATH>"
```

The existing npm script compiles Sideline and invokes:

`node tools/scouts/run-scout-play.mjs --manifest <path>`

## Step 5 — Know what success looks like

The launch harness is proven to be functioning when the terminal shows real runner lifecycle lines such as:

```text
[QUEUED] <scout-id> (<agent>)
[RUNNING] <scout-id> (<agent>)
```

A later `[FAILED]` line means that receiver/attempt failed. It does not mean the launcher failed if the runner successfully reached QUEUED and RUNNING.

Do not confuse wrapper text such as a hand-written `DONE` message with runner truth.

## Step 6 — If one Scout fails while another is still running

Do not interrupt the remaining running Scout.

Let the Formation reach its truthful terminal outcome first.

Preserve the failed attempt as evidence.

Then decide whether the missing lane still needs a replacement receiver.

Do not randomly substitute an agent alias. Use current Scout roster / scorecard evidence when choosing the replacement.

## Step 7 — Receiver availability is separate from launcher health

The 2026-09-20 field run proved this distinction:

- the OpenRouter key was loaded successfully;
- `npm run scout:play` reached `[QUEUED]` and `[RUNNING]` for both lanes;
- receivers can still fail afterward because of provider/model availability or other receiver-specific conditions.

Therefore:

`QUEUED / RUNNING reached` = launcher path functioning.

`receiver later FAILED` = inspect receiver outcome, not the launcher by default.

## Do Not Do This During Ordinary Scout Launches

Do not hand-roll PowerShell `Start-Job` Scout launchers.

Do not invent direct `opencode run` wrappers.

Do not build a second orchestration layer around `npm run scout:play`.

Do not repeatedly test the launcher after QUEUED / RUNNING has already proven it is functioning.

Do not expose the OpenRouter API key.

## Current Proven Development Sequence

1. Prepare / receive the exact Formation manifest.
2. Set `OPENCODE_DB`.
3. Securely load `OPENROUTER_API_KEY`.
4. Confirm `OPENROUTER READY: True`.
5. Run `npm run scout:play -- --manifest "<path>"`.
6. Confirm `[QUEUED]` then `[RUNNING]`.
7. Let the Formation finish truthfully.
8. Treat receiver failure separately from launcher failure.
9. If a lane still matters, substitute only from current eligible Scout evidence.

## Breadcrumb

WAS: manual development Scout launches drifted into repeated custom PowerShell wrappers, paste-format failures, and launcher debugging.

IS: the existing `scout:play` runner is the development launch authority once a manifest and credential are present; QUEUED / RUNNING are the proof that launch plumbing worked.

WHY: Dad / the developer should spend attention on the Play and Scout intelligence, not re-debug the launch mechanism every time.

WILL BE: future Sideline product surfaces may remove these manual development steps, but until that is field-proven this SOP is the canonical development launch path.
