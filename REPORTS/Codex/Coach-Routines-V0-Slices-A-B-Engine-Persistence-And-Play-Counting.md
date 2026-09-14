REPORT FILE:
Coach-Routines-V0-Slices-A-B-Engine-Persistence-And-Play-Counting.md

REPORT TIMESTAMP:
2026-09-14 10:41:39 MDT (America/Edmonton)

# Executive Result

**COACH ROUTINES V0 SLICES A+B IMPLEMENTED — ENGINE, DURABILITY, EXACT-GAME PLAY COUNTING, APIS, AND STRATEGY BOARD PROJECTION ARE AUTOMATION-GREEN.**

Sideline Coach now owns a server-side Coach Routine domain and one versioned, atomic, Game-scoped persistence store. The Control Plane counts accepted human-authored reasoning Plays at the existing router verdict seams, evaluates Every-N-Plays and lazy Every-N-days cadences, projects due Strategy Board instructions without touching reports, and records exact delivery cycles only after an explicit delivery API call.

Dev Mode remains globally OFF by default and does not alter routing or execution. Per the human amendment, the first deliberate OFF → ON transition for an exact Game establishes the enabled `Canonical Refresh · Strategy Board · Every 5 Plays · Players OFF` default. Its empty source set truthfully produces `Needs files`, not a false handoff directive. A durable initialization marker prevents deletion from being undone by a later toggle.

No Settings UI, Incoming injection, source browser/checker, Player preamble, composer mutation, report mutation, or Player-target delivery was added.

# Architecture Followed

Implementation followed `REPORTS/Claude/Coach-Routines-Strategy-Board-Canonical-Refresh-Architecture.md`, the current North Star, and the existing architecture breadcrumbs.

The key ownership split is preserved:

```text
router verdict evidence
        ↓
CoachRoutineEngine
        ↓
Game-scoped persisted counters / definitions / deliveries
        ↓
selected-Game Routine projection + Sideline-owned handoff envelope
```

Routines do not become a job owner, execution state owner, report owner, or routing policy. They observe accepted Play boundaries and manage refresh policy only.

# Architecture Deviations

One intentional deviation implements the explicit human amendment:

- Claude proposed that Dev Mode merely offer a recommended routine.
- The implemented first-enable behavior creates the routine as enabled immediately.
- It remains non-operational until canonical sources exist and projects `Needs files` meanwhile.
- `GameRoutineState.defaultsInitialized` records that the first-enable decision already occurred. Empty routine lists therefore cannot be mistaken for an uninitialized Game after a human deletes the default.

No other material architecture deviation was required.

# Domain Model

The new `src/control-plane/coach-routines.ts` owns:

- `CoachRoutine` definitions;
- Play and time `RoutineCadence` values;
- normalized Game-relative `RoutineSource` references and last-check truth seams;
- `GameRoutineState` counters, dedupe references, routine definitions, and the default-initialization marker;
- Strategy Board delivery facts and cycle identity;
- a reserved exact-`playerInstanceId` Player-target state/scope seam, with no Player delivery behavior yet;
- Dadified `RoutineView` and selected-Game `RoutinesProjection` shapes;
- the plain-text Strategy Board envelope builder;
- atomic file and in-memory store implementations.

Valid V0 cadences are:

- Every 1–100 Plays;
- Every 1–30 days, stored internally as whole-day `everyMs` values.

There is no scheduler, interval, cron process, or background due timer. Time due state is evaluated lazily using the Control Plane clock during projection/delivery operations.

# Exact Persistence Schema

Persistence lives at:

```text
~/.sideline/coach-routines.json
```

Version 1 is structurally:

```json
{
  "version": 1,
  "games": {
    "<stable gameId>": {
      "gameId": "<stable gameId>",
      "playCount": 0,
      "countedRefs": ["play:<clientRef>", "queue:<queueItemId>"],
      "players": {
        "<playerInstanceId>": {
          "playCount": 0,
          "firstSeenAt": 0,
          "leftTeamAt": 0
        }
      },
      "defaultsInitialized": false,
      "routines": [
        {
          "id": "rt_<opaque random id>",
          "name": "Canonical Refresh",
          "template": "canonical-refresh",
          "enabled": true,
          "cadence": { "kind": "plays", "every": 5 },
          "targets": { "strategyBoard": true, "players": false },
          "sources": [],
          "includeLocalRoot": true,
          "createdAt": 0,
          "board": {
            "baselinePlayCount": 0,
            "baselineAt": 0,
            "manualDue": false,
            "manualDueSeq": 0,
            "lastDelivered": {
              "at": 0,
              "playCount": 0,
              "via": "copy-report",
              "cycle": "<exact due cycle>",
              "reportPath": "<optional report path>"
            }
          },
          "players": {}
        }
      ]
    }
  }
}
```

Optional fields are omitted when absent. Counted references are bounded to the latest 200 while `playCount` remains monotonic. Writes use the existing Sideline temp-file-plus-rename idiom. Missing state loads cleanly. Unreadable, malformed, or unsupported state is moved to a `.bak` diagnostic copy and replaced in memory with an empty safe state; Coach does not crash and does not silently destroy the evidence.

# Play Counting Semantics

A Game count advances exactly once for:

- fresh downstream `received`, keyed by `clientRef`;
- fresh downstream `unknown`, keyed by `clientRef` because the human-authored Play may have executed and automatic resend is unsafe;
- `play-queued`, keyed by `queueItemId` at enqueue time.

It does not advance for:

- failed/rejected/refused/offline delivery;
- a queued Play release, because enqueue already counted it;
- a retry or duplicate reference;
- direct-shell Terminal execution;
- a missing identity reference.

Cancelled queued Plays remain counted, matching the frozen policy that Coach accepted the human-authored reasoning Play at enqueue time.

The daemon remembers the target `gameId`, Player type, queue-release identity, and execution type at `play-dispatched`. Later verdicts are attributed from that recorded dispatch evidence, never from whichever Game a browser happens to be viewing.

# Cadence and Due Semantics

New routines start at the current Game counter/time baseline. Historical Plays before creation do not make them immediately due.

Play cadence becomes due when the counter delta reaches N. Time cadence becomes due when the Control Plane clock reaches the whole-day boundary. Manual Due uses a monotonic manual sequence.

Due is derived observation, not a transient rendering flag. It remains due through status builds, page refreshes, report selection, and preview. When Dev Mode is OFF, counting continues but no Strategy Board handoff is projected. Re-enabling exposes legitimately earned due state without resetting counters.

# Default Routine First-Enable Behavior

`CoachPreferences` now additively carries:

```json
{
  "runningPlayers": "ask",
  "devMode": false
}
```

Preferences remain in the existing atomic `preferences.json` path. Existing preference files without `devMode` safely load it as `false`.

`POST /api/preferences` accepts partial preference mutations. A Dev Mode mutation must name an exact known `gameId`. On an actual global OFF → ON transition, the engine initializes that Game once:

```text
Canonical Refresh
Enabled: true
Target: Strategy Board
Player target: false
Cadence: Every 5 Plays
Sources: none
Projection: Needs files
Handoff: absent
```

The marker is persisted even when an existing human-defined routine means no default is needed. Deleting the default also retains the marker, so OFF → ON never recreates intentionally removed configuration.

# Strategy Board Handoff Projection

`status.routines` is calculated only for the selected Game and contains:

- `gameId`;
- current global `devMode` truth;
- that Game's `playCount`;
- Dadified routine views, cadence/target/last-sent/next labels, due state, needs state, and exact due cycle;
- an optional merged `handoff` only when at least one Strategy Board routine is genuinely due and deliverable.

The envelope is Sideline-owned plain text. It can contain the Game name, normalized remote repository locator, optional local root according to routine preference, configured relative source paths, routine instructions, and delivery cycle metadata kept outside the human text. Source contents are never embedded. Routine ids, counted client refs, tokens, and report contents are not leaked into the text. The result is bounded to 12,000 characters and de-duplicates shared source paths.

`Delivered` is deliberately the product word. Sideline can prove that a future Copy/Send path handed off the directive; it cannot prove an external Strategy AI opened or reread those files.

# Source Validation

Slice A validates syntax and storage boundaries without pretending to know filesystem truth:

- paths are Game-relative and normalized to `/`;
- absolute paths, drive roots, UNC roots, `.`/`..`, empty segments, escape attempts, and unsafe secret/repository internals are rejected;
- a routine has at most 20 unique source paths;
- path/name/instruction sizes are bounded;
- values are not fuzzy-corrected or fabricated.

Stadium-bounded source suggestion, browsing, realpath checking, and file/folder existence truth remain Slice C.

# APIs

Implemented on the existing authenticated Control Plane server:

- `GET /api/routines?gameId=<exact>` — definitions plus current projection;
- `POST /api/routines` — create in exact `gameId`;
- `PATCH /api/routines/:routineId` — edit in exact `gameId`;
- `DELETE /api/routines/:routineId` — delete in exact `gameId`;
- `POST /api/routines/:routineId/due` — manually mark exact routine due;
- `POST /api/routines/delivered` — exact Game + routine cycle(s) + `copy-report|strategy-board-send` evidence;
- `GET /api/preferences` — existing endpoint now includes `devMode`;
- `POST /api/preferences` — partial `runningPlayers` and/or exact-Game Dev Mode update.

Routine mutation never falls back to browser-selected Game. Missing/wrong Games or cross-Game routine ids fail closed. Delivery is idempotent across duplicate device calls; already-recorded cycles remain successful no-ops, and non-current cycles return a stale conflict without consuming current due truth.

# Files Changed

Feature-specific production changes:

- `src/control-plane/coach-routines.ts` — new domain, validation, projection, envelope, store, cadence, delivery engine;
- `src/control-plane/daemon.ts` — construction/persistence wiring, router verdict counting, exact-Game APIs, preferences integration, status projection;
- `src/control-plane/router.ts` — additive `playerType` on the existing `play-queued` event so Terminal exclusion is evidence-based;
- `src/running-players.ts` — additive persisted `devMode` preference, default false;
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — durable WAS / IS / WILL BE implementation state.

Tests:

- `test/coach-routines-engine.test.mjs` — new pure engine/store coverage;
- `test/coach-routines-daemon.test.mjs` — new real daemon/API/router-event coverage;
- `test/q2-10a-provider-control.test.mjs` — additive preference shape expectation and persistence proof;
- `test/q2-10c-work-ledger.test.mjs` — preserved Ledger wiring assertion while allowing the listener's new routine bookkeeping block.

`src/public/index.html` was not changed by this Play. Existing dirty-tree changes in all unrelated files were preserved.

# Tests and Validation

Focused Coach Routine suite:

```text
node --test test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs
25 passed
0 failed
```

The 25 test cases assert more than 30 required behavior boundaries, including N=1, changing N, received/unknown/queued/failure/direct-shell counting, release/retry/reference dedupe, multiple routines, disabled routines, Dev Mode pause/re-enable, amended default creation, Needs-files truth, durable deletion intent, manual Due, lazy day cadence/no timer, Game isolation, atomic restart persistence, corrupt/unsupported backup, source boundary validation, envelope safety, idempotent/stale delivery, CRUD, status projection, and report-byte non-mutation.

Real production-boundary coverage includes nine daemon tests using the actual authenticated HTTP routes, status builder, Control Plane router listeners, accepted/rejected dispatch results, controlled Terminal exclusion, queue event, and daemon replacement store reload.

Final validation:

```text
npm run check     PASS
npm run compile   PASS
npm test          566 passed, 0 failed
git diff --check  PASS (line-ending notices only; no whitespace errors)
```

Two pre-existing tests were intentionally updated, not weakened:

- The preference contract now correctly expects the additive `devMode: false` safe default and proves it persists.
- The Ledger source-wiring assertion now accepts the expanded `play-dispatched` listener while still requiring `ledger.recordDispatch(record)`.

# Compatibility Notes

- Existing preferences without `devMode` migrate on read to false.
- Existing routing, queue release, Work Ledger, execution projection, report provenance, Incoming, friendly labels, and Q2.10F.4.1 browser UX are unchanged in meaning.
- `status.routines` and `preferences.devMode` are additive; the current browser safely ignores them.
- Routine data survives ordinary Control Plane freshness replacement through the same shared Sideline directory as queue/Ledger state.
- Player-target shape is durable but inactive. Strategy Board-only routines do not alter dispatched Player prompts.
- No external Strategy Board obedience can be observed in V0; last state is truthfully “sent,” never “refreshed.”

# Known Constraints

- Canonical source existence and safety beyond syntax have not yet been checked by the Stadium. The amended default therefore remains `Needs files` until later source-selection work supplies sources.
- The server can build the due handoff but the browser does not yet inject it into a successful Copy/Send operation. Nothing calls the delivered endpoint automatically in A+B.
- Time cadence is deliberately lazy; with no status/delivery interaction, no background notification fires.
- The Play counter is lifetime monotonic while only the latest 200 identity references are retained. This bounds storage; an extremely old reference replayed after it leaves the window is outside V0 dedupe guarantees.
- Dev Mode is global. The first-enable default is initialized for the exact Game named in the deliberate OFF → ON request.
- Player delivery/counters remain a future downstream slice and are OFF.

# Recommended Next Slice C Play

Implement Stadium-bounded canonical source discovery and verification only:

1. add `routine.sources.suggest`, `routine.sources.browse`, and `routine.sources.check` RPCs in the extension host;
2. constrain all paths by Game root plus realpath/symlink checks;
3. return bounded file/folder/missing/blocked/unknown facts without reading source contents into the Control Plane;
4. add daemon proxy endpoints that require exact `gameId`;
5. update stored `RoutineSource.lastCheck` only from authoritative Stadium evidence;
6. preserve `Needs files` while no safe source set is confirmed.

Do not combine Slice C with Settings or Incoming UI work.

# WAS / IS / WILL BE

## WAS

The Strategy Board stayed aligned with canonical documents only when the human remembered to request a reread. Sideline had no durable rules, no Game-level cadence count, no due cycle, no delivery evidence, and no handoff envelope.

## IS

The Control Plane has one durable Coach Routine engine. It counts accepted reasoning Plays exactly once in their target Game, evaluates count/time routines lazily, preserves due truth across restarts and Dev Mode pauses, builds a bounded Sideline-owned Strategy Board envelope, and records delivery only for exact current cycles. Dev Mode is opt-in; its first Game-scoped enable establishes the amended default without fabricating source readiness. Reports and Player prompts remain untouched.

## WILL BE

Slice C will add authoritative Stadium source selection/checking. Later UI slices will expose Dev Mode/Coach Routines and attach the due envelope to the deliberate Incoming Copy handoff, marking delivery only after clipboard success. Optional exact-instance Player refresh remains downstream and OFF by default.

# Commit / Push Status

No commit was created. Nothing was pushed.

REPORT: Coach-Routines-V0-Slices-A-B-Engine-Persistence-And-Play-Counting.md
TIMESTAMP: 2026-09-14 10:41:39 MDT (America/Edmonton)
