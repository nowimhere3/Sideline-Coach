REPORT FILE:

Stage-1.5-Multiple-Player-Instances-And-Dynamic-Field-Labels-Implementation.md

REPORT TIMESTAMP:

2026-09-10 17:32 MDT

---

# SIDELINE COACH — STAGE 1.5 IMPLEMENTATION

**Agent / model:** Codex / GPT-5

**Role:** Bounded Implementation Worker

**Project:** Sideline Coach

**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`

**Branch:** `main`

**Result:** PASS WITH CONSTRAINTS

## Starting State

The working tree was already dirty with prior Stage 1.x work: modified `.vscode/tasks.json`, `package.json`, `src/public/index.html`, and `src/server.ts`; untracked diagnostics, anchors, reports, player files, tests, and tools. This stage preserved that work. No commit, push, reset, stash, or unrelated cleanup occurred.

The baseline single-Player roster created/reused terminals by canonical terminal name. `CoachServer` constructed its own roster. Legacy terminal-name dispatch remained allowlist- and unique-name-based.

## Exact Files Inspected

- `src/player-roster.ts`
- `src/player-adapters.ts`
- `src/extension.ts`
- `src/server.ts`
- `src/public/index.html`
- `test/player-adapters.test.mjs`
- `package.json`
- `Diagnostics/CONTRACT.md`
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`
- `REPORTS/Claude/Stage-1.4-Multiple-Player-Instances-And-Dynamic-Field-Labels.md`
- `Project SOP/AI-Assisted Development Operating Manual.md`
- `Project SOP/SOP PROMPTS .md`
- `REPORTS/Codex/Stage-1.3-F5-PreLaunch-Task-Repair.md`

## Exact Files Changed

- `src/player-instances.ts` — added pure opaque-ID, seat, projection, and derived-label support.
- `src/player-roster.ts` — replaced the type/name-only roster with activation-lifetime terminal/object correlation, creation markers, adoption, lifecycle, and safe projection.
- `src/extension.ts` — constructs exactly one `PlayerRoster` per activation and injects it into each `CoachServer`.
- `src/server.ts` — adds instance creation and instance-ID dispatch while retaining the complete legacy terminal-name path.
- `src/public/index.html` — roster Add another control and individual Player-instance selector values.
- `test/player-instances.test.mjs` — added focused node:test contracts.
- `Diagnostics/CONTRACT.md` — identifies `PlayerRoster` as the activation-time owner.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — added the durable Stage 1.5 ownership and identity rule.
- This report.

## Identity, Labels, and Seats

`PlayerInstanceBook` mints `type-` plus eight random hex characters and keeps IDs independent of terminal names, seats, labels, routing, executable paths, and Game identity. It derives `fieldLabel` on projection: seat 1 is `Codex`; seat 2 is `Codex 2`; future known routing can render `Codex 2 · Luna · Medium`. No Stage 1.5 path writes model or effort routing state.

Seats allocate as max live sibling seat plus one. Closing seat 1 while seat 2 remains therefore yields seat 3 next; once no sibling remains, allocation restarts at seat 1. Field labels are not stored as independent state.

## Registry Ownership and Terminal Correlation

`activate()` creates one `PlayerRoster`, registers it for activation disposal, and injects the same object into every server instance. Server restart does not construct a roster or add another roster close listener. `PlayerRoster` owns both `instanceId → vscode.Terminal` and `vscode.Terminal → instanceId` maps, and owns the sole registered-terminal close listener.

Coach-created terminals receive `SIDELINE_COACH_PLAYER_ID` and `SIDELINE_COACH_PLAYER_SEAT` through `TerminalOptions.env`. Terminal tab names are stable initial base labels only; correctness does not depend on them.

## Adoption and Lifecycle

At activation, a terminal whose creation options contain a valid known-type marker adopts its original ID and seat. Unmarked canonical terminals are adopted only when their exact canonical name is allowlisted and unique, as a fresh seat-1 legacy instance. Multiple unmarked canonical duplicates are not adopted. Generic terminals, including names such as `Codex 2`, are not registered.

`POST /api/players/:type/field` remains idempotent: it shows an existing instance or creates seat 1. New `POST /api/players/:type/instances` always requests another instance and allocates the next seat. A registered terminal close retires only its own instance and broadcasts roster status.

## Dispatch and Security Rail

`POST /api/dispatch` now accepts `playerInstanceId` additively. When present, it resolves solely through PlayerRoster’s terminal-object mapping. A closed, retired, or unknown ID returns `404 That Player has left the field.` It never falls back to a sibling, label, or terminal-name lookup.

The legacy `terminalName` route remains unchanged in behavior: exact allowlist, model command allowlist, zero/multiple-name errors, and direct unique terminal-name lookup. New and marker-adopted instances are authorized by registry provenance, not mutable presentation. Generic terminals do not become instance-dispatchable from a matching-looking name.

## UI and Reports

The existing visual language is retained. The roster now exposes Add another after a Player is on field. The dispatch selector displays derived per-instance labels and sends `playerInstanceId` values. The browser does not use the legacy terminal list. Reports remain type-folder-based with no instance attribution, Play IDs, or timer work.

## Automated Verification

- `npm run check` — PASS.
- `npm run compile` — PASS.
- `npm test` — PASS: 15 tests, 0 failures.
- `npm run diagnostics` — command completed and produced a fresh snapshot.
- `git diff --check` — PASS.

The added tests cover label derivation, unknown routing omission, opaque IDs, seat monotonicity/reset, independent addressing/retirement, safe projection fields, marked-ID/seat adoption, duplicate-seat refusal, and generic absence. Existing adapter tests retain the V1 behavior proof.

Diagnostics reports pre-existing `ERROR A6` (configured port 49152 lies in the observed Windows ephemeral range) and `WARN A5` (two repository copies). This stage did not alter ports, launch setup, or copy topology; changing either was not authorized.

## Human Smoke Test and Reload Evidence

Required and not performed by this implementation worker: normal **F5 / Run → Start Debugging** from the Sideline Coach Dev Stadium; put Codex on field; Add another; dispatch separately to Codex and Codex 2; close Codex; verify Codex 2 receives a Play; reload once and observe marker adoption.

No fresh live F5 or reload was performed here. Therefore reload/marker-adoption behavior is **unverified runtime evidence**, not claimed. If reload fails to re-adopt marked terminals, fail safe and do not add persistence; report that evidence under the Stage 1.4 fallback.

## Breadcrumb Impact

YES. The existing architecture anchor now records the identity distinctions, immutable opaque IDs, derived presentation, single roster owner, provenance authorization, temporary legacy allowlist path, generic-terminal exclusion, non-reused live sibling seats, and runtime-only executable paths.

## Diagnostic Impact

YES, narrowly. `Diagnostics/CONTRACT.md` now identifies the activation-lifetime `PlayerRoster` as the source future in-extension diagnostics must reuse. No preflight collector, snapshot schema, renderer, assertions, or Stage B diagnostic feature changed.

## Remaining Known Unknowns

- Live VS Code reload retention and readability of `Terminal.creationOptions.env` markers require the specified human F5/reload observation.
- The agent CLIs may retitle tabs after launch; routing remains immune because it uses terminal objects, but the tab presentation is runtime evidence.
- Model/effort routing and instance report attribution remain intentionally absent.

## Recommended Stage 1.6

Keep Stage 1.6 as the small collapsible Roster presentation pass after the required live F5/reload smoke test supplies adoption evidence.

---

REPORT FILE:

Stage-1.5-Multiple-Player-Instances-And-Dynamic-Field-Labels-Implementation.md

REPORT TIMESTAMP:

2026-09-10 17:32 MDT
