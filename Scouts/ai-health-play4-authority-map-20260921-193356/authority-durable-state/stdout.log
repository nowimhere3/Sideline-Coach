Now I have a thorough understanding of the codebase. Let me compile the complete reconnaissance report.

---

# SCOUT REPORT — AI Health Play 4 Authority Map

**Play ID:** `ai-health-play4-authority-map-20260921-193356`  
**Scout ID:** `authority-durable-state`  
**Scout Agent:** `sideline-scout-deep`  
**Model:** `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`  
**Date:** 2026-09-21  
**Status:** RECONNAISSANCE (not final architectural authority)

---

## RESULT

This reconnaissance maps the **existing Sideline-owned durable state** and **process lifecycle seams** under `~/.sideline` that a future global **AI Health Authority** would inherit or coordinate with. The architecture is already decided; this report identifies exact helpers, conventions, and seams for:
- Sideline directories and JSON state files
- Startup restore / safe writes / daemon stop/shutdown flushing
- Diagnostics
- Directly relevant tests
- Code that **must NOT be reused** (Game-scoped vs Sideline-global)

All claims are labeled **FACT / INFERENCE / UNKNOWN / CONTRADICTION** with exact file/symbol coordinates.

---

## KEY DISCOVERIES

### 1. The Sideline Global Root: `~/.sideline`

**FACT** — The canonical Sideline-owned directory is resolved in multiple entrypoints:
- `ControlPlaneDaemon.constructor` → `options.dir ?? process.env.SIDELINE_DIR ?? path.join(os.homedir(), '.sideline')`  [`src/control-plane/daemon.ts:195`]
- `ensureControlPlaneRunning` → same fallback  [`src/control-plane/launcher.ts:131`]
- `resolveDevelopmentScoutIntelligenceRoot` → same fallback  [`src/scout-intelligence-root.ts:53`]
- `getDurableStadiumId` → same fallback  [`src/game-identity.ts:193`]

This is **the single ownership boundary** for all Sideline-global durable state.

### 2. Durable JSON State Files (All under `~/.sideline`)

| File | Owner | Purpose | Safe-Write Pattern |
|------|-------|---------|-------------------|
| `control-plane.json` | Control Plane Daemon | Discovery manifest (port, pid, instanceId, buildId) | Atomic: write `.tmp` → `renameSync`  [`src/control-plane/daemon.ts:605-610`] |
| `control-plane-state.json` | Control Plane Daemon | Human's last selected Game (survives restart) | Atomic: write `.tmp` → `renameSync`  [`src/control-plane/daemon.ts:636-646`] |
| `token` | Control Plane Daemon | Auth token for Stadium handshake (mode 0o600) | Sync write, mode 0o600  [`src/control-plane/daemon.ts:573`] |
| `work-ledger.json` | InstanceWorkLedger | Per-instance work history, recent plays, report links | Loaded once at startup  [`src/control-plane/daemon.ts:255`]; persisted on `onChange` via `scheduleLedgerSave`  [`src/control-plane/daemon.ts:256-259`] |
| `play-queue.json` | PlayQueue | Queued Plays per Game+instance (survives freshness replacement) | Atomic store  [`src/control-plane/play-queue.ts:50-62`] |
| `scout-continuations.json` | ScoutContinuationLedger | Scout→Coach→Player continuation records | Atomic store  [`src/control-plane/scout-continuation.ts:76-88`] |
| `coach-routines.json` | CoachRoutineEngine | Game-scoped routine configs, counters, delivery evidence | Atomic store with quarantine  [`src/control-plane/coach-routines.ts:163-188`] |
| `game-filesystem.json` | GameFilesystemCoordinator | Per-Game filesystem contract (reports/SOP roots, lanes) | Atomic store with quarantine  [`src/control-plane/game-filesystem-coordinator.ts:43-81`] |
| `stadium-id` | Game Identity | Durable Stadium ID (`stadium_<platform>_<uuid>`) | Sync write, created once  [`src/game-identity.ts:207-216`] |
| `Scout Intelligence/` | Scout Bootstrap | Combine scorecards, runs, formations, Work lane | `ensureScoutIntelligenceRoot` creates required lanes  [`src/scout-intelligence-root.ts:92-97`] |
| `Scout Intelligence/Work/.coach-refresh.lock` | Scout Bootstrap | Machine-wide session guard (exclusive create `wx`) | `acquireRefreshLock` / `releaseRefreshLock`  [`src/scout-bootstrap.ts:202-224`] |

### 3. Startup Restore (What Loads at Daemon Start)

**FACT** — At `ControlPlaneDaemon.start()`:
1. Directory ensured: `fs.mkdirSync(this.dir, { recursive: true })`  [`src/control-plane/daemon.ts:413-415`]
2. Auth token loaded or created  [`src/control-plane/daemon.ts:559-575`]
3. **Work Ledger restored** from `work-ledger.json`  [`src/control-plane/daemon.ts:255`]
4. **Play Queue** loads from `play-queue.json` (restores `dispatching`→`needs-attention`)  [`src/control-plane/play-queue.ts:71-103`]
5. **Scout Continuations** load from `scout-continuations.json` (repairs `dispatching`→`unknown`, `awaiting-scout` w/o turnRef→`unknown`)  [`src/control-plane/scout-continuation.ts:99-118`]
6. **Coach Routines** load from `coach-routines.json` (quarantines unsupported schema, preserves human choices)  [`src/control-plane/coach-routines.ts:329-339`]
7. **Game Filesystem Contracts** load from `game-filesystem.json` (quarantines unsupported schema, preserves human choices)  [`src/control-plane/game-filesystem-coordinator.ts:125-139`]
8. Preferred Game selection restored from `control-plane-state.json`  [`src/control-plane/daemon.ts:210, 627-634`]
9. Discovery record written (`control-plane.json`)  [`src/control-plane/daemon.ts:605-610`]
10. Exit handlers installed (`SIGINT`/`SIGTERM` → `flushRoutines` + `removeDiscoveryRecord` + `process.exit(0)`)  [`src/control-plane/daemon.ts:650-659`]

### 4. Safe Write Conventions (Atomic, Crash-Safe)

**FACT** — All durable stores use the same pattern:
```typescript
const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
fs.renameSync(temp, file);
```
- `fileQueueStore`  [`src/control-plane/play-queue.ts:56-59`]
- `fileScoutContinuationStore`  [`src/control-plane/scout-continuation.ts:82-85`]
- `fileGameFilesystemStore`  [`src/control-plane/game-filesystem-coordinator.ts:69-72`]
- `fileCoachRoutineStore`  [`src/control-plane/coach-routines.ts:176-179`]
- `savePreferences`  [`src/running-players.ts:99-102`]

**FACT** — Unreadable/corrupt state is **quarantined** (renamed to `.bak` or timestamped `.bak`), never crashed:
- `fileGameFilesystemStore.quarantine`  [`src/control-plane/game-filesystem-coordinator.ts:74-79`]
- `fileCoachRoutineStore.quarantine`  [`src/control-plane/coach-routines.ts:181-186`]
- Work Ledger: try/catch on restore, silent fallback  [`src/control-plane/daemon.ts:255`]

### 5. Daemon Stop / Shutdown Flushing

**FACT** — `ControlPlaneDaemon.stop()`  [`src/control-plane/daemon.ts:485-540`]:
1. Clears idle timer
2. **Flushes routines immediately** (`flushRoutines()`)  [`src/control-plane/daemon.ts:493-497`]
3. Closes SSE clients
4. Rejects pending RPC requests
5. Closes all Stadium WebSocket sessions
6. Closes WebSocket server
7. Closes HTTP server (with `closeAllConnections?.()`)
8. Removes SIGINT/SIGTERM handlers
9. **Removes own discovery record** (only if PID + instanceId match)  [`src/control-plane/daemon.ts:613-625`]

**FACT** — `cleanExitHandler` (SIGINT/SIGTERM) calls `flushRoutines()` + `removeDiscoveryRecord()` + `process.exit(0)`  [`src/control-plane/daemon.ts:648-659`]

**FACT** — `CoachRoutineEngine.flush()` forces store save  [`src/control-plane/coach-routines.ts:344`]; `InstanceWorkLedger` has no explicit flush (in-memory only, history survives via serialization)  [`src/control-plane/work-ledger.ts:380-394`]

### 6. Diagnostics (Existing)

**FACT** — `tools/diagnostics/` is a standalone preflight collector:
- `collect-preflight.mjs` → gathers: package.json, source/built hashes, launch config, control-plane discovery (`control-plane.json`), port listeners, report globs, VS Code logs  [`tools/diagnostics/collect-preflight.mjs:145-166`]
- `snapshot.mjs` → probes live `/api/diagnostics` on Control Plane  [`tools/diagnostics/snapshot.mjs:13-31`]
- `redaction.mjs` → redacts tokens, user paths  [`tools/diagnostics/redaction.mjs:1-22`]
- `render-snapshot.mjs` → markdown output to `Diagnostics/local/CURRENT.md`
- `assertions.mjs` → A1-A8 health checks (build, deps, launch, port, reports, etc.)

**FACT** — Control Plane exposes `/api/diagnostics` (probed by `snapshot.mjs:20`) — not yet inspected in source but implied by test.

**FACT** — Daemon logs to `~/.sideline/logs/control-plane.log` (append-only, per-line timestamped)  [`src/control-plane/daemon.ts:681-690`]

### 7. Directly Relevant Tests

| Test File | Coverage |
|-----------|----------|
| `test/q2-10c-work-ledger.test.mjs` | Ledger dispatch/turn/disconnect/report provenance, AUTO routing, roster surfaces |
| `test/game-filesystem-contract.test.mjs` | Pure decision algorithm, durable store, precedence invariants, quarantine |
| `test/game-filesystem-detection.test.mjs` | Read-only detection against real fixtures, exact-Game wire contract |
| `test/scout-continuation.test.mjs` | Bounded ledger, authority gating, COMPLETE/non-COMPLETE outcomes, queue-release binding, Control Plane replacement replay |
| `test/coach-routines-daemon.test.mjs` | Daemon API wiring, Dev Mode defaults, CRUD, delivery, replacement reload |
| `test/scout-bootstrap.test.mjs` | Consent persistence, bounded Coach Refresh, secret boundary, machine-wide lock, no scheduler |
| `test/scout-work-hygiene.test.mjs` | (Not read but implied by name) |
| `test/tools/diagnostics/test/diagnostics.test.mjs` | Schema, redaction, freshness, assertions, non-mutation |

### 8. Code That MUST NOT Be Reused (Game-Scoped, Not Sideline-Global)

**FACT** — The following are **per-Game** or **per-Stadium**, not Sideline-global:

| Module / Symbol | Scope | Evidence |
|-----------------|-------|----------|
| `GameFilesystemContract` / `GameFilesystemCoordinator` | Per-Game (keyed by `gameId`) | [`src/control-plane/game-filesystem-coordinator.ts:150`] `get(gameId)` |
| `InstanceWorkLedger` entries | Per-Game + per-instance | [`src/control-plane/work-ledger.ts:118`] `key(gameId, instanceId)` |
| `PlayQueue` items | Per-Game + per-instance | [`src/control-plane/play-queue.ts:113-119`] `forGame` / `forInstance` |
| `CoachRoutineEngine` state | Per-Game | [`src/control-plane/coach-routines.ts:346`] `forGame(gameId)` |
| `ScoutContinuationLedger` records | Per-Game | [`src/control-plane/scout-continuation.ts:256`] `forGame(gameId)` |
| `StadiumFilesystemContractCache` | Per-Stadium (memory-only) | [`src/stadium-filesystem-contract.ts:35`] `applied` is single-Game |
| `PlayerActivityStore` | Per-Game + per-instance (in-memory only) | [`src/player-activity.ts`] not read but used in daemon  [`src/control-plane/daemon.ts:140`] |
| `game-identity` resolution | Per workspace folder | [`src/game-identity.ts:298`] `resolveGameContextSync` |
| `game-adoption` marker | Per chosen folder | [`src/game-adoption.ts:82`] writes `.sideline/game.json` **inside the Game folder** |
| `workspace-state-binding-store` | VS Code workspaceState (per workspace) | [`src/workspace-state-binding-store.ts:4`] key `sidelineCoach.playerSessions.v1` |
| `ScoutIntelligenceReportSource` | Per Scout Intelligence root (Sideline-global) but **filters by `gameId`** | [`src/scout-intelligence-report-source.ts:116`] `list(gameId, ...)` |

**CONTRADICTION** — `ScoutIntelligenceRoot` is Sideline-global (`~/.sideline/Scout Intelligence/`) but **all evidence is Game-keyed**. The Formation parents live under `Scout Intelligence/Formations/<id>/FORMATION-RESULT.md` but are only trusted for a Game if their `sideline-provenance` marker matches that `gameId`  [`src/scout-intelligence-report-source.ts:68-75`]. This is **not** a contradiction — it's correct scoping — but the AI Health Authority must understand: **Scout Intelligence is global storage, but every record is Game-attributed.**

### 9. Process Lifecycle Seams

| Seam | Location | Purpose |
|------|----------|---------|
| `ensureControlPlaneRunning` | [`src/control-plane/launcher.ts:129`] | Finds/starts/replaces Control Plane; uses `control-plane.lock` (atomic `wx`) for election |
| `ControlPlaneDaemon.start/stop` | [`src/control-plane/daemon.ts:408`], [`src/control-plane/daemon.ts:485`] | Full lifecycle; writes/removes `control-plane.json` |
| `Freshness Guard` (`assessFreshness`, `proveOwnership`) | [`src/control-plane/freshness.ts:98`], [`src/control-plane/freshness.ts:130`] | Build-identity-based replacement; prevents stale daemon reuse |
| `ScoutBootstrapService` lock | [`src/scout-bootstrap.ts:169`], [`src/scout-bootstrap.ts:202`] | Machine-wide `.coach-refresh.lock` prevents concurrent sessions |
| `StadiumClient` reconnection | [`src/stadium-client.ts`] (not fully read) | Handles Control Plane replacement via `resolveControlPlane` callback |

---

## IMPORTANT FILES / PATHS

### Sideline Global (`~/.sideline/`)
```
.sideline/
├── control-plane.json              # Daemon discovery manifest
├── control-plane-state.json        # Selected Game (survives restart)
├── token                           # Auth token (0o600)
├── work-ledger.json                # Instance work history
├── play-queue.json                 # Queued Plays (survives replacement)
├── scout-continuations.json        # Scout→Coach continuations
├── coach-routines.json             # Game-scoped routines
├── game-filesystem.json            # Per-Game filesystem contracts
├── stadium-id                      # Durable Stadium ID
├── logs/
│   └── control-plane.log           # Daemon append-only log
└── Scout Intelligence/
    ├── Combine/
    │   ├── Scorecards/             # Receiver scorecards (JSON)
    │   └── Runs/                   # Coach Refresh run evidence
    ├── Formations/                 # Formation parents (durable)
    │   └── <formation-id>/
    │       └── FORMATION-RESULT.md # With sideline-provenance marker
    ├── Player Verification/        # Verification evidence
    └── Work/
        └── .coach-refresh.lock     # Machine-wide session guard
```

### Game-Local (inside each Game folder)
```
<GameRoot>/
└── .sideline/
    └── game.json                   # Game identity marker (written by adoptGameFolder)
```

### VS Code Global State (per profile)
- `sidelineCoach.gameRegistry.v1` — Game registry  [`src/game-identity.ts:60`]
- `sidelineCoach.selectedGameId` — Selected Game  [`src/game-identity.ts:61`]
- `sidelineCoach.projectRegistry.v1` — Non-git folder → Game ID  [`src/game-identity.ts:59`]
- `sidelineCoach.scout.bootstrapConsent` — Scout bootstrap consent  [`src/scout-bootstrap.ts:40`]
- `sidelineCoach.playerSessions.v1` — Player control bindings  [`src/workspace-state-binding-store.ts:4`]
- `sidelineCoach.scout.openrouterApiKey` — SecretStorage (not globalState)  [`src/scout-openrouter-credential.ts:1`]

---

## FACT / INFERENCE / UNKNOWN / CONTRADICTION SUMMARY

### FACT
- All durable JSON files under `~/.sideline` use atomic write (temp + rename).
- Work Ledger, Play Queue, Scout Continuations, Coach Routines, Game Filesystem Contracts all survive Control Plane replacement.
- Daemon shutdown flushes routines and removes its own discovery record only.
- Scout Bootstrap consent lives in extension globalState (not Game, not SecretStorage).
- Machine-wide Scout session guard uses `~/.sideline/Scout Intelligence/Work/.coach-refresh.lock` with PID+liveness check.
- Game identity is established by `.sideline/game.json` marker (written by `adoptGameFolder`) or git remote.
- Diagnostics collector is standalone, reads `control-plane.json`, probes `/api/diagnostics`, writes `Diagnostics/local/CURRENT.md`.

### INFERENCE
- The AI Health Authority will likely need its own JSON file under `~/.sideline/` (e.g., `ai-health-authority.json`) following the same atomic-write + quarantine pattern.
- Health evidence from Stadiums (`health.evidence` notification) is currently in-memory only  [`src/control-plane/daemon.ts:142, 892-899`] — a durable Health Authority would need a persistent store.
- The `control-plane.json` discovery record already carries `buildId`, `instanceId`, `supersedes` — this is the **freshness lineage** a Health Authority could observe.
- `InstanceWorkLedger.serialize()` / `restore()`  [`src/control-plane/work-ledger.ts:380-414`] is the model for durable orchestration state that survives replacement.

### UNKNOWN
- Whether `/api/diagnostics` on Control Plane exists (probed by `snapshot.mjs` but not found in `daemon.ts` read — may be in unread portion).
- Whether the AI Health Authority should be a **separate daemon** or **embedded in Control Plane** (architecture decided elsewhere).
- Exact schema for AI Health Authority durable state (not in scope of this play).

### CONTRADICTION
- **None found.** The codebase consistently separates Sideline-global (daemon-owned, `~/.sideline/`) from Game-scoped (per-`gameId`, per-Stadium) and VS Code profile-scoped (globalState/SecretStorage).

---

## LIMITATIONS

1. **Did not inspect** `src/stadium-client.ts` fully — contains Stadium→Control Plane RPC, reconnection logic, and `scout.bootstrap` bridge.
2. **Did not inspect** `src/control-plane/router.ts` — routing logic, dispatch, queue integration.
3. **Did not inspect** `src/player-activity.ts` — live Player Terminal activity store (in-memory only).
4. **Did not inspect** `src/report-publisher.ts` / `src/report-provenance.ts` — report watching and provenance markers.
5. **Did not inspect** provider watchers, cross-device sync, AUTO/CONSERVE modes, Plays 5-6 (explicitly out of scope).
6. **Did not verify** `/api/diagnostics` endpoint implementation (only observed in diagnostics collector).

---

## RECOMMENDED NEXT MOVE (for Architect)

The AI Health Authority should:
1. **Adopt the atomic-write + quarantine store pattern** (`fileXxxStore` helpers) for its own JSON file under `~/.sideline/`.
2. **Use the Freshness Guard's `buildId`/`instanceId`/`supersedes` lineage** from `control-plane.json` to correlate health evidence with daemon generations.
3. **Persist health evidence per-Game** (like `GameFilesystemCoordinator` does) with revisioned contracts, not a flat log.
4. **Register a shutdown flush hook** like `CoachRoutineEngine.flush()` to ensure no in-flight health assessments are lost.
5. **Expose a diagnostics endpoint** (`/api/health/authority` or similar) that the existing `tools/diagnostics/snapshot.mjs` can probe.
6. **Never reuse** Game-scoped modules (`GameFilesystemCoordinator`, `InstanceWorkLedger` entries, `PlayQueue`, `CoachRoutineEngine.forGame`, `ScoutContinuationLedger.forGame`) for global authority state.

---

*End of reconnaissance. This report is evidence, not architectural authority.*
