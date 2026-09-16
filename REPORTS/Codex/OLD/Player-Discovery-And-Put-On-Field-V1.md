REPORT FILE:

Player-Discovery-And-Put-On-Field-V1.md

REPORT TIMESTAMP:

2026-09-10 16:24 MDT

---

# SIDELINE COACH — PLAYER DISCOVERY + PUT ON FIELD V1

**Agent / model:** Codex / GPT-5

**Role:** Bounded Implementation Worker

**Project:** Sideline Coach

**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

**Branch:** `main`

**Task:** Player Discovery Sandbox / Put on Field V1

**Breadcrumb Impact:** YES

**Diagnostic Impact:** YES

## EXECUTIVE RESULT

Implemented the smallest Player roster flow for Claude, Codex, and AntiGravity. The Stadium dynamically asks its normal PowerShell environment whether the durable command identities `claude`, `codex`, and `agy` resolve. The UI shows only Available, Ready on Bench, On Field, or Not Available. It never shows machine-specific paths or shell plumbing.

When an available Player is put on field, Coach reuses the existing canonical terminal if present; otherwise it creates the existing allowlisted terminal name through VS Code's normal integrated-terminal configuration and sends the adapter command once.

## FILES INSPECTED

- `src/extension.ts`, `src/server.ts`, `src/public/index.html`, `package.json`.
- `Diagnostics/CONTRACT.md` and `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`.
- Claude Stage 1 architecture report and both AntiGravity launch/crash reports.

## FILES CHANGED

- `src/player-adapters.ts` — centralized Player adapter data and pure terminal/availability decisions.
- `src/player-roster.ts` — profile-aware command probe plus VS Code integrated-terminal launch owner.
- `src/server.ts` — adds Player state to status and authenticated `POST /api/players/:id/field`.
- `src/public/index.html` — compact Roster card and Put on Field action.
- `test/player-adapters.test.mjs` — adapter, state, reuse, and command tests.
- `package.json` — includes Player tests in `npm test`.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — durable Player command/shell boundary.
- `Diagnostics/CONTRACT.md` — records that preflight remains explicitly unknown for activation-time Player state.

## DETECTION DESIGN

Discovery uses `Get-Command` in a normal PowerShell invocation without `-NoProfile`; no executable path is retained or sent to the UI. This preserves profile functions, aliases, PATH, wrappers, and user configuration as the authority. The live profile-aware probe found all current commands available: Claude, Codex, and AGY.

## PLAYER ADAPTER DESIGN

One adapter table owns all Stage V1 Player facts:

- Claude → terminal `Claude` → `claude`
- Codex → terminal `Codex` → `codex --yolo`
- AntiGravity → terminal `AntiGravity` → `agy`

No adapter contains a resolved path, installation flow, authentication state, model routing, or cloud-environment behavior.

## LAUNCH AND TERMINAL IDENTITY

Coach creates terminals with VS Code `createTerminal({ name })`, so the Stadium's configured integrated shell is used. It does not spawn player executables directly. Existing matching terminals are shown and reused; no duplicate terminal is created. Canonical names remain compatible with `coach.terminalAllowlist`, preserving existing dispatch behavior.

## TESTS

- `npm run check` — PASS.
- `npm run compile` — PASS.
- `npm test` — PASS: 11 tests, 0 failures.
- Player tests prove canonical command/terminal mappings, Available vs Ready on Bench vs On Field vs Not Available, and reuse-versus-create launch plans.
- Existing diagnostics T1–T8 remain passing.
- `npm run diagnostics` — PASS; snapshot remains `built-current` and its preflight PLAYERS fields correctly remain unknown.

## HUMAN TEST STILL REQUIRED

One irreducible VS Code smoke test remains: open the Coach UI in the running Extension Development Host, confirm the three Players show Available, then press Put on Field once for a Player that is not already open and confirm its named integrated terminal launches the normal interactive CLI. This validates VS Code terminal/profile behavior that Node unit tests cannot reproduce.

## BREADCRUMBS UPDATED

YES. Added the durable rule that command identity is portable while resolved executable paths are runtime evidence; Player launch must preserve the normal integrated shell; and `Claude`, `Codex`, and `AntiGravity` remain the canonical terminal identities.

## DIAGNOSTIC IMPACT

YES. Player availability/on-field state is new activation-time truth owned by `PlayerRoster` through `CoachServer`. The existing external RM-1 preflight collector cannot safely observe live VS Code terminals and therefore remains explicitly unknown. Implementing an in-extension diagnostic collector is the separately established Stage B boundary and was not expanded into this play.

## REMAINING FUTURE WORK

Installation/provisioning, authentication, model routing, Codespaces/Cloud Shell, terminal lifecycle monitoring, and in-extension RM-1 Player-state collection remain unimplemented by design.

## GIT STATUS

No commit, push, reset, stash, or history operation was performed. Pre-existing untracked `Project SOP/SOP PROMPTS .md` remains untouched. Stage A diagnostics/breadcrumb/report work remains preserved alongside this scoped implementation.

## STOP CONDITIONS

None fired. The implementation required no dependency, credential, installation, authentication, cloud, model-routing, terminal-identity, or public-contract redesign.

## EXACT RECOMMENDED NEXT PLAY

Perform the single human Stadium smoke test, then review whether Player availability/on-field state should be added to the approved in-extension RM-1 Stage B collector before any installation or authentication architecture is designed.

---

REPORT FILE:

Player-Discovery-And-Put-On-Field-V1.md

REPORT TIMESTAMP:

2026-09-10 16:24 MDT

---
