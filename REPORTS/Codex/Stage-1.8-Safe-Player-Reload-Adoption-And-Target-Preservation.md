REPORT FILE:

Stage-1.8-Safe-Player-Reload-Adoption-And-Target-Preservation.md

REPORT TIMESTAMP:

2026-09-10 19:14 MDT

---

# SIDELINE COACH — STAGE 1.8 IMPLEMENTATION

**Agent / model:** Codex / GPT-5

**Role:** Bounded Implementation Worker

**Project:** Sideline Coach

**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

**Branch:** `main`

**Result:** PASS WITH CONSTRAINTS

## Starting State

The shared working tree already contained the uncommitted Stage 1.x implementation, diagnostics, reports, and the explicitly preserved `Project SOP/SOP PROMPTS .md`. All were preserved. No Git state was changed.

## Exact Files Changed

- `src/player-instances.ts` — added proof-only provenance validation and reconciliation decisions, PENDING reservations, and per-type in-memory seat high-water tracking.
- `src/player-roster.ts` — added workspaceState provenance ownership, the idempotent open/snapshot evaluation funnel, Windows PID/start-time proof, PENDING/dead reconciliation, and removed all registry admission by terminal name or env marker.
- `src/extension.ts` — injects the Game-scoped `workspaceState` into the one activation-lifetime roster.
- `src/server.ts` — distinguishes PENDING instance dispatch (409) from unknown/closed instance dispatch (404); the legacy `terminalName` branch is unchanged.
- `src/public/index.html` — retains the selected `playerInstanceId` in page memory and never substitutes another Player during refresh.
- `test/player-instances.test.mjs` — expanded deterministic provenance, reconciliation, reservation, high-water, and persisted-shape coverage.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — recorded the amended reload-proof rule, historical marker failure, and protected future boundaries.
- `Diagnostics/CONTRACT.md` — names PlayerRoster as owner of live state and proof-only per-Game provenance while retaining preflight PLAYERS as unknown.
- This report.

## Provenance and Process-Proof Authorization

`PlayerRoster` is the sole reader and writer of `sidelineCoach.playerProvenance.v1` in `context.workspaceState`. Every stored record has exactly `instanceId`, `playerType`, `seat`, `shellPid`, and `shellStartedAt`. A newly created Player remains usable immediately; once the terminal shell PID and Windows OS process start time are observed, the roster persists that proof record.

On reload, a terminal is admitted only when its supported `terminal.processId` and a bounded `Get-Process` start-time probe exactly match a Coach-written pending record. Terminal names, labels, and `TerminalOptions.env` markers are not read for authorization. Missing process data stays PENDING and non-dispatchable; a missing process or mismatched start time is proven dead and deletes the record. A duplicate PID claim is a contradiction and deletes all conflicting claims.

## Lifecycle Funnel and Adoption

The roster loads pending records, registers one terminal-open and one terminal-close listener, evaluates the current terminal snapshot, then performs a bounded dead-record sweep. Open-event and snapshot evaluation use one idempotent funnel. A Coach-created terminal is registered synchronously, so its own open event cannot duplicate it. Server restarts reuse the activation-lifetime roster and add no roster listeners.

Legacy registry name adoption is retired. A terminal named `Claude`, `Codex`, `AntiGravity`, or `Codex 2` is never registered merely by that name. The separate legacy `terminalName` dispatch API branch remains intact.

## Pending, Seats, and Target Preservation

PENDING records reserve their original seats and return HTTP 409 with “That Player is reconnecting — try again in a moment.” Unknown or closed IDs return the existing HTTP 404 left-field response, with no sibling or name fallback. The corrected per-type high-water rule prevents reuse of the highest removed seat while any live or pending sibling remains; it resets only after the type has no live and no pending instances.

The browser now keeps the human-selected instance ID. Status refresh preserves the same target when present, shows an explicit “Choose a Player” placeholder when absent, and reselects only that same ID if it reappears. It never silently chooses a sibling.

## Automated Verification

- `npm run check` — PASS.
- `npm run compile` — PASS.
- `npm test` — PASS: 17 tests, 0 failures.
- `npm run diagnostics` — PASS: fresh, built-current snapshot produced.
- `git diff --check` — PASS.

The deterministic tests prove matching proof restores the original ID and seat; terminal-name independence; PID recycling rejection; unknown PID/start-time failure; contradiction handling; PENDING seat reservation; high-water non-reuse and reset; independent live identity; and exact persisted proof shape with malformed-state rejection. Existing adapter and diagnostics regression tests remain green.

The diagnostic snapshot still reports the pre-existing A6 port-range error and A5 duplicate-copy warning. Neither was changed in this stage.

## Human Smoke Test

Required and not performed by this worker: launch with normal F5; create Codex and Codex 2; retain explicit Codex 2 selection across terminal-focus change; run Developer: Reload Window and confirm same ID/seat reconciles and receives a tiny Play; then fully quit/reopen VS Code and confirm a revived plain `Codex 2` is not authorized.

## Breadcrumb Impact

YES. The durable rule now captures the failure of terminal env markers across reconnect, the minimal per-Game proof-only provenance record, the process-identity requirement, idempotent evaluation funnel, retired name adoption, and PENDING-aware seat rule.

## Diagnostic Impact

YES, narrowly. The contract names PlayerRoster as owner of live Player state and workspaceState provenance. No external collector, snapshot schema, assertion, or RM-1 Stage B feature changed.

## Known Unknowns

The irreducible live observation remains whether the reconnecting Extension Development Host exposes the original shell PID through `terminal.processId` and the Windows probe produces the identical start timestamp. The design fails safe if either cannot be proven. Per-Stadium workspaceState separation also remains runtime evidence, not claimed beyond VS Code's documented per-workspace ownership.

## Recommended Next Play

Run the minimal F5/reload smoke test; if it confirms process-proof re-adoption, proceed with the small Stage 1.6 collapsible Roster presentation pass.

---

REPORT FILE:

Stage-1.8-Safe-Player-Reload-Adoption-And-Target-Preservation.md

REPORT TIMESTAMP:

2026-09-10 19:14 MDT
