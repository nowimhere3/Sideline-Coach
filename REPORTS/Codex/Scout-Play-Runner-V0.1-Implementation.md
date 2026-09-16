# Sideline Coach — Scout Play Runner V0.1 Implementation Report

**Agent:** Codex  
**Model:** GPT-5.6 Sol  
**Reasoning:** Medium  
**Date:** 2026-09-15 MDT  
**Branch:** `q2.8-multigame-field-debug`

# What You Found

- OpenCode 1.18.31 supports non-interactive execution through `opencode run --agent … --dir …`.
- All four Trend and Tap Assist Scout agents passed a real static read-only contract preflight with their expected models.
- The three requested standalone breadcrumb files were not present in `Docs ANCHOR`. Current Scout SOP/ROSTER, source, tests, consolidated architecture breadcrumbs, and process infrastructure were inspected instead.
- The repository already had substantial unrelated working-tree changes. They were preserved.
- No real Scout formation was launched.

# Architecture Seam Used

A standalone Node/TypeScript process runner was added at `src/scout-play-runner.ts`.

It invokes OpenCode directly, captures process pipes, and does not depend on VS Code terminals, Player transport, visible terminal history, or a human keeping a terminal open.

# Files Added

- `src/scout-play-runner.ts`
- `tools/scouts/run-scout-play.mjs`
- `tools/scouts/example-three-scout-play.json`
- `test/scout-play-runner.test.mjs`
- `test/fixtures/scout-process.mjs`
- `REPORTS/Codex/Scout-Play-Runner-V0.1-Implementation.md`

# Files Modified

- `package.json`: added the `scout:play` command.

Existing unrelated modifications were not changed or reverted.

# Scout Play Contract Implemented

The manifest supports:

- `playId`;
- absolute `gameRoot`;
- `maxConcurrency` from 1 through 32;
- one or more uniquely identified Scouts;
- an explicitly approved Scout agent;
- one bounded objective per Scout.

Unsafe IDs, duplicate Scout IDs, missing Game roots, empty objectives, invalid concurrency, and non-roster agents fail before artifacts or processes are created.

Existing Play folders are never overwritten.

# Concurrency Behavior

A bounded worker pool launches no more than `maxConcurrency` Scouts at once. Capacity is reused as Scouts finish.

One failed Scout does not stop or erase unrelated Scouts. Completion metadata retains manifest ordering for deterministic inspection.

# Process / Output Capture Behavior

Each Scout receives its own execution folder containing:

- assigned objective;
- complete generated prompt;
- `stdout.log`;
- `stderr.log`;
- lifecycle metadata;
- process start and end timestamps;
- exit code and termination signal;
- a completed report when the process succeeds.

Completed reports are copied independently into the configured durable Play folder. The runner also writes workspace-level and durable Play completion JSON artifacts.

Output is captured from child-process pipes. The implementation does not scrape VS Code terminal history.

# Read-Only Enforcement

Before launch, the runner verifies that the requested `.opencode/agents/<agent>.md`:

- is a primary agent;
- uses the expected roster model;
- has deny-by-default permissions;
- allows read, glob, grep, and list;
- denies external-directory access;
- does not grant mutating tools.

The generated prompt repeats the read-only Scout contract. The trusted runner, rather than the Scout, owns artifact persistence.

Important limitation: this is OpenCode permission-layer enforcement, not an operating-system filesystem sandbox. The OpenCode process still runs under the current Windows user account. V0.1 cannot independently prevent a defect inside OpenCode itself from writing runtime or session metadata.

# Tests Added

Six focused tests prove:

1. One Scout executes through a real child process.
2. Three Scouts execute concurrently.
3. `maxConcurrency` is respected and queued work starts as capacity opens.
4. Scout stdout, stderr, and reports remain separate.
5. One failed Scout does not erase successful results.
6. Exit codes and lifecycle outcomes remain truthful.
7. Completion metadata records actual results.
8. Report persistence can occur without writing to the Game.
9. Paths containing spaces work.
10. Output is captured through process pipes rather than terminal scraping.
11. Cancellation interrupts active Scouts without marking them complete.
12. Unsafe manifests and unproven read-only agents are rejected.

# Tests Run

- `npm run check`
- `npm run compile`
- `node --test test/scout-play-runner.test.mjs`
- `npm test`
- Static preflight against all four real Trend and Tap Assist Scout definitions
- `git diff --check`
- Sample manifest JSON validation

# Exact Test Results

- TypeScript check: passed.
- Compile: passed.
- Focused Scout Runner suite: 6 passed, 0 failed.
- Full regression suite: 826 passed, 0 failed.
- Real Scout contract preflight: 4 passed, 0 failed.
- Provider requests made: 0.

# Known Limitations

- No operating-system-level filesystem sandbox.
- No per-Scout timeout, retry policy, or provider-aware throttling.
- No UI or Control Plane integration.
- Successful stdout is persisted directly as the Markdown report; stderr remains separate.
- OpenCode authentication, OpenRouter authentication, model availability, and provider quotas remain external runtime dependencies.
- Completed Play folders are intentionally retained.
- The three named standalone breadcrumb files could not be inspected because they were absent.

# Anything Not Proven

- A real concurrent OpenRouter formation.
- Provider rate-limit behavior under concurrency.
- Real-world report quality from the four Scout models.
- OpenCode behavior during network loss or provider-side hangs.
- Three-Scout process retirement under live provider conditions.

# Field-Test Command / Procedure

After explicit human approval:

1. Copy and review `tools/scouts/example-three-scout-play.json`.
2. Replace every placeholder objective with a short, non-overlapping approved route.
3. Select a new unused `playId`.
4. Load `OPENROUTER_API_KEY` securely into the current PowerShell process.
5. Optionally use the previously proven external Scout database:

```powershell
$env:OPENCODE_DB = "$env:USERPROFILE\.local\share\opencode\scout.db"
```

6. From SidelineCoach, launch:

```powershell
npm run scout:play -- --manifest "tools\scouts\example-three-scout-play.json"
```

No field command was run during this implementation Play.

# Recommended Next Play

Conduct one controlled three-Scout formation with short, non-overlapping objectives. Inspect process evidence, reports, completion metadata, Game git status, and process retirement before adding Control Plane or UI integration.

# WAS / IS / WILL BE

## WAS

Scout execution had been manually proven through terminal experiments.

## IS

Sideline now has an inspectable, terminal-independent runner for explicitly assigned read-only formations, bounded concurrency, separate reports, truthful lifecycle, durable evidence, and interruption handling.

## WILL BE

After controlled field proof, this primitive can become the execution seam used by future Scout automation without adding automatic routing, synthesis, or autonomous decomposition.

# Readiness

The implementation is ready for a controlled three-Scout field test.

It is implementation-ready, not field-proven.

No commit or push was performed.
