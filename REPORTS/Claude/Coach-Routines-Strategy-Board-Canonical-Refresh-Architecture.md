REPORT FILE:
Coach-Routines-Strategy-Board-Canonical-Refresh-Architecture.md

REPORT TIMESTAMP:
2026-09-14 10:00:55 MDT (America/Edmonton)

# Executive Result

**Architecture frozen. Implementation-ready. No production code changed.** This was a report-only Play; Codex is concurrently implementing Q2.10F.4.1 in `src/public/index.html`.

Coach Routines are small Game-scoped rules, each with:
- a target: **Strategy Board** in V0, Players optional later;
- a cadence: **every N Plays** (primary) or **every N days** (lazy, no scheduler);
- optional **sources**, as Game-root-relative files or folders;
- an optional short **instruction**.

The Control Plane owns routine definitions and counters in one new atomic JSON store beside the existing ones (`~/.sideline/coach-routines.json`). Plays are counted from the router's existing delivery verdicts.

A due Strategy Board routine becomes a **Sideline-owned handoff envelope**:
- built server-side;
- shown beside the report in Incoming (never inside it);
- prepended **only to the clipboard text** when the human deliberately copies a report.

It counts as **delivered** only when that clipboard write succeeds. Rendering, reloading, previewing or selecting a report never consumes it. The report file is never touched.

**Dev Mode** is a new global preference, OFF by default. It reveals routines; it never silently creates or runs one. Turning it on *offers* a pre-filled **Canonical Refresh** (Strategy Board · Every 5 Plays), and the human confirms the sources with one tap from Stadium-provided suggestions.

Player-target routines are designed now but OFF by default and built last. They inject a preamble layer in the router's existing prompt composition, without touching the composer text, and count per exact `playerInstanceId`.

**Recommended next Play (after Codex clears the field):** Slices A + B, the server-only routine engine. It touches no `index.html`.

# Findings From Current Repo Inspection

Evidence read for this design:
- `Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`:
  - §1 North Star;
  - §2 Core loop and role split;
  - §6.9 items 5 (Game Playbook & SOP Contract), 6 (Play Envelope) and 8 (Coach Brief);
  - §27 Settings;
  - §28 Advanced / Developer surfaces.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` (Canonical Play Execution, Routing Invariant, P0.2 Reports-SC, Dad-Mode sections).
- The Q2.10F.2 A/A2/B–F, F.3 and F.4 reports.
- The source files named in each finding below.

| Topic | Current reality | Consequence for this design |
|---|---|---|
| North Star | "Hide plumbing by default. Reveal it only when it changes a human decision." "Unknown is valid." "Observation and policy remain separate." Role split: Players execute; Strategy AI strategizes. | Strategy Board is the first-class target. Routines live behind Dev Mode. "Delivered" never claims "reread". |
| Roadmap seams | Game Playbook & SOP Contract, Play Envelope, Coach Brief, and "Players receive only the context required for their Play" are already WILL BE. | Routines are the first concrete step toward a Game Playbook and Coach Brief. The Player preamble realises a narrow Play Envelope. Player refresh defaults OFF, per the context-minimisation rule. |
| Settings | `#settingsView` has static cards (Game Setup, Routing, Players & Providers, Usage & Budgets, Stadiums, GitHub & Repositories). The only live setting is `runningPlayers`. | Add a "Dev Mode" card following the same card and `settings-choice` idioms. |
| Preferences persistence | `src/running-players.ts` has `CoachPreferences { runningPlayers }` with atomic load/save to `~/.sideline/preferences.json`. The daemon has `getPreferences` / `savePreferences`, `GET`/`POST /api/preferences`, and projects `status.preferences`. | `devMode: boolean` joins `CoachPreferences`, since it is a **global** product mode. Routines are per-Game, so they go elsewhere. |
| Control Plane stores | `~/.sideline/`: `work-ledger.json` (Ledger serialize/restore, debounced `scheduleLedgerSave`), `play-queue.json` (`fileQueueStore`, atomic temp+rename), `preferences.json`, `control-plane-state.json`, `token`, `control-plane.json`. The Stadium registry itself is **in memory** (sessions re-register). | A new `coach-routines.json` uses the identical atomic pattern. Routine state must not depend on the registry persisting. |
| Game identity | Durable `gameId` from git remote / marker / registry (`game-identity.ts`), with `repoUri` when known. The registry holds `displayName`, `repoUri` and `rootFsPath` per connected session. | The routine store is keyed by `gameId`. Locator lines come from the registry at envelope-build time. |
| Player identity | Opaque, durable `playerInstanceId`; removed ids are retired and never reused. Friendly labels come from one shared presentation resolver (`src/player-display-labels.ts`, Q2.10F.3), with contiguous numbering that is presentation only. | Per-Player counters key on `playerInstanceId` only. |
| Play dispatch | `ControlPlaneRouter.dispatch` composes `deliveredPrompt = [contextPreamble] + humanPrompt + [reportProvenanceInstruction]`, emits `play-dispatched`, then `status-update` `received` / `failed` / `unknown`. Queued Plays return `status: 'queued'` and are released later with `queueItemId`. | The **counting hook** is the router verdicts the daemon already observes. The **Player injection seam** is a new optional preamble provider beside `contextPreamble`. |
| Work Ledger | Execution authority with **bounded** history (`RECENT_PLAY_LIMIT = 10`); activity is re-learned after replacement. | Not suitable as a lifetime Play counter. Routines observe the same events but keep their own small counters; the Ledger is not a second job holder. |
| Incoming | The Stadium scans `coach.reportGlobs` within the workspace, reads contents, and parses provenance. The browser `humanReportContent()` hides provenance in Preview and Copy without mutating data. **Copy Report** writes the clipboard, then calls `POST /api/work/acknowledge {reportPath}` only after success. Selecting or opening a report also acknowledges (Q2.10F.3/E). | The Copy handler already has the exact "deliberate, confirmed handoff" moment. Routine delivery attaches there as a **separate** call with a separate store. |
| File access | Only the Stadium (VS Code extension host) reads Game files. The Control Plane has only `rootFsPath` strings. The phone has nothing local. | Source browsing and validation must be Stadium RPCs (like `report.rescan`). A phone cannot use a native file picker. |
| Work in flight | The dirty tree includes daemon, router, ledger, `index.html` and tests from Q2.10F.x. Codex's Q2.10F.4.1 is in the shared UI. | Slice ordering keeps `index.html` edits to the last UI slices. |

# Recommended Architecture

```text
Settings (browser, Dev Mode)                 Incoming Copy (browser)
      │  CRUD                                     │ clipboard OK → POST /api/routines/delivered
      ▼                                           ▼
┌──────────────────────── Control Plane (daemon) ────────────────────────┐
│ CoachRoutineStore  ~/.sideline/coach-routines.json (atomic, per Game)   │
│ CoachRoutineEngine (pure):                                              │
│   observePlayAccepted(gameId, instanceId, clientRef|queueItemId, kind)  │
│   evaluate(gameId, now) → due routines (count: N Plays / time: N days)  │
│   buildStrategyBoardEnvelope(gameId, due, locator, sourceChecks)        │
│   markDelivered(gameId, [{routineId, cycle}], via)                      │
│   playerPreamble(gameId, instanceId) → text + cycles   (Slice F)        │
│ Hooks: router 'play-queued' + status-update 'received'/'unknown'        │
│ Projection: status.routines (selected Game) · status.preferences.devMode│
└───────────────┬──────────────────────────────────────────────┬─────────┘
                │ RPC routine.sources.suggest / browse / check │ router preamble provider (F)
                ▼                                              ▼
        Stadium (extension host): Game-root-bounded FS          Player dispatch payload
```

Principles:
- **Observation vs policy.** The engine observes existing verdicts and never changes routing, queueing, acknowledgement or the Ledger.
- **Server owns truth and text.** Due state and envelope text are computed in the Control Plane. The browser only renders them and concatenates the envelope with the human report text at Copy time.
- **Stadium owns filesystem truth.** Paths are stored as strings. Existence and type are Stadium observations with a timestamp, and they may be Unknown.
- **Delivered ≠ reread.** Sideline can prove it *handed over* a directive; it cannot prove the external AI read the sources. The UI and envelope say exactly that.

# Dadified Settings UX

**Settings → Dev Mode card** (the same card style as the existing ones):

```text
DEV MODE                                                     [ OFF | ON ]
Extra tools for people who like to see under the hood.
Turning this on doesn't change how your Plays run.
```

When ON, a **Coach Routines** section appears directly under the toggle.

First time, with no routines for this Game:

```text
COACH ROUTINES · Trend and Tap Assist
Sideline can remind your Strategy Board to reread your project rules,
so you don't have to remember.

 ┌─ Recommended ────────────────────────────────────────────────┐
 │ Canonical Refresh                                            │
 │ Every 5 Plays, remind the Strategy Board to reread:          │
 │   ☑ Docs ANCHOR/Sideline-Coach-Master-Product-…Roadmap.md    │
 │   ☑ Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md                  │
 │   ☐ README.md                                                │
 │   + Add file   + Add folder                                  │
 │                                  [ Not now ] [ Add routine ] │
 └──────────────────────────────────────────────────────────────┘
```

Suggestions come from the Stadium (see Source Selection). They are pre-checked only when they match canonical-document heuristics, and nothing is saved until **Add routine**. If the Game is not connected, the card says "Connect this Game's Stadium to suggest files. You can still type a path." and falls back to a path field.

Routine list, compact by default:

```text
COACH ROUTINES · Sideline Coach
 Canonical Refresh                                     ● On
 Every 5 Plays · Strategy Board · 3 files
 Last sent: 2 Plays ago · Next: in 3 Plays                    [ Edit ]

 Map Check                                             ● On
 Every 4 Plays · Strategy Board · no files
 Due now — goes out with your next copied report              [ Edit ]

 + Add Coach Routine
```

Status lines are human sentences:
- `Due now — goes out with your next copied report`
- `Last sent: never`
- `Last sent: 2 Plays ago`
- `Next: in 3 Plays`
- `Last sent: 4 days ago · Next: in 3 days`
- `Paused`
- `Needs files — add what to reread`
- `1 file couldn't be found`

**Edit** opens the routine as fill-in sentences. No cron, no "policy":

```text
Name              [ Canonical Refresh              ]
Run this routine  Every [ 5 ] [ Plays ▾ ]              (Plays | days)
Who should refresh?   ◉ Strategy Board   ☐ Players  (More options ▸)
What should they reread?
   Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md          ✓ found      ✕
   Docs ANCHOR/                                     ✓ folder     ✕
   + Add file   + Add folder
What should Sideline tell them?  (optional)
   [ Before recommending the next Play, reread these and give me a WAS / IS / NEXT Map Check. ]
Include the local folder path  ☑
                 [ Send with my next report ]  [ Delete ]  [ Save ]
```

- **Send with my next report** marks the routine due now (a manual refresh).
- **Players** is visually secondary: it sits behind "More options", unchecked, with a note: "Players already get what the Strategy Board writes. Only turn this on if Players drift too — rereading uses their context."

**+ Add Coach Routine** offers three templates:
- **Canonical Refresh:** needs sources.
- **Map Check:** no sources; instruction "Give me a Map Check: WAS / IS / NEXT / horizon."
- **Custom.**

**Incoming (only while Dev Mode is ON and a routine is due for this Game).** A slim line sits **above** the report preview, outside the report text:

```text
↻ Canonical Refresh is due · it will be added when you copy this report   [ Not this time ]
```

- The Copy button label stays `Copy Report to Clipboard`.
- After success: `✓ Report Copied · with Canonical Refresh`.
- **Not this time** excludes the routine from this one copy; it stays due. Nothing is silently skipped.
- With Dev Mode OFF, nothing appears and nothing is injected (see Dev Mode rule).

# Persistence Model

| State | Where | Scope | Why |
|---|---|---|---|
| Dev Mode on/off | `~/.sideline/preferences.json` → `CoachPreferences.devMode` (default `false`) | Global | A product mode, not Game data. Reuses the atomic preferences path and `status.preferences`. |
| Routine definitions | `~/.sideline/coach-routines.json` → `games[gameId].routines[]` | Per Game | Game-owned config. Survives daemon replacement and needs no registry persistence. |
| Game Play counter plus counted-reference dedupe | same file → `games[gameId].playCount`, `countedRefs` (bounded, last 200) | Per Game | Lifetime monotonic count; dedupes queue release and retries. |
| Strategy Board delivery state | same file → `routine.board: { baselinePlayCount, baselineAt, lastDelivered?: { at, playCount, via }, manualDue?: boolean }` | Per Game, per routine | Due is derived, never stored as a stale flag (except explicit manual due). |
| Player counters | same file → `games[gameId].players[instanceId]: { playCount, firstSeenAt, leftTeamAt? }` | Per Game, per exact instance | Stable id keys; friendly names never stored. |
| Player-routine delivery state | same file → `routine.players[instanceId]: { lastDelivered?: { at, playCount, clientRef } }` | Per Game, routine and instance | Independent of the Strategy Board channel. |
| Source check results | same file → `routine.sources[].lastCheck: { at, state: 'file' \| 'folder' \| 'missing' \| 'blocked' \| 'unknown' }` | Per Game | Truthful display when the Stadium is offline. |

- **Writes:** atomic temp+rename (`fileQueueStore` idiom), debounced like `scheduleLedgerSave`, plus an immediate flush on delivery and config mutations.
- **Losing a count:** a crash between counting and flushing can lose at most the Play counts since the last flush. That only postpones a refresh by that many Plays; it can never cause a false "delivered".
- **Versioning:** `{ version: 1, games: {...} }`. An unknown version or malformed file loads as empty with a logged warning, and the corrupt file is kept as `.bak`. Routines are never silently re-created.

# Trigger / Delivery Semantics (frozen)

## What counts as a Play (Game counter)

A Play counts **once**, when Coach has accepted it for an exact Player **as an act of the human**:

- **Counts:**
  - `status-update` `received` for a fresh dispatch;
  - `status-update` `unknown` for a fresh dispatch (it may be running; over-counting only brings a refresh earlier, and under-counting is the harmful direction);
  - `play-queued` (the human authored and committed it).
- **Does not count:**
  - `failed` / rejected / refused / empty / offline dispatch (nothing reached a Player);
  - the **release** of a queued Play (a dispatch carrying `queueItemId`, already counted at enqueue);
  - retries of a needs-attention queue item;
  - Terminal (`executionType: 'direct-shell'`) commands, which are shell mechanics rather than Strategy-Board-authored reasoning Plays. A future per-routine option could include them.
- **Deduped** by `clientRef` (dispatch) or `queueItemId` (queue) in `countedRefs`.
- **Game ownership** is the dispatch's `targetGameId`, never the browser's selected Game ("selection is viewing context, not event ownership").

**Cancelled queued Plays stay counted.** The Strategy Board still produced them; this is simple, and documented.

## When a count routine is DUE (Strategy Board)

```text
since = game.playCount − (lastDelivered?.playCount ?? baselinePlayCount)
due   = enabled && devMode && hasDeliverableContent && (manualDue || since ≥ N)
```

- A new routine's baseline is the play count at creation, so it is **not** due immediately. **Send with my next report** sets `manualDue`.
- **Due never expires or resets on its own.** If the 5th Play produces no report, or Copy is never pressed, the routine stays due and goes out with the next copied report in that Game, whichever report that is.
- "Next: in K Plays" = `max(0, N − since)`. "Last sent: X Plays ago" = `since`.

## Exact V0 time-mode behaviour

- **Unit:** days only, N from 1 to 30. Hours are deferred; a unit-agnostic `everyMs` in the model allows it later.
- **Due:** `now − (lastDelivered?.at ?? baselineAt) ≥ N × 24h`, or `manualDue`.
- **Evaluated lazily** whenever the Control Plane builds `status.routines` or handles a delivery. There is **no timer, scheduler or notification**. If nothing happens for a week, nothing is sent until the human next copies a report, and then it is due.
- **Clock:** the Control Plane clock only; the browser never decides due.

**Included in V0 engine and UI** (cheap and lazy), but secondary in the UI: the unit selector defaults to Plays. Mixed "Plays or days, whichever first" is deferred.

## When a Strategy Board routine is DELIVERED

**Delivered** = the browser's clipboard write of `envelope + humanReportContent(report)` **resolved successfully** and it then called `POST /api/routines/delivered`.

Not delivered by:
- Incoming render, reload or reconnect;
- report selection or auto-selection;
- Preview expansion;
- View Report from TEAM;
- a failed copy;
- "Not this time".

**Delivery request:**

```json
{ "gameId": "...", "deliveries": [{ "routineId": "rt_...", "cycle": "c_7" }], "via": "copy-report", "reportPath": "Reports/…md" }
```

- `cycle` is the opaque due-cycle id from the projection (see Data Model). If the cycle was already delivered (e.g. the phone copied first), the request is a no-op (`alreadyDelivered: true`).
- It is Game-scoped: a `routineId` from another Game is refused with 404.
- **Effect:** `lastDelivered = { at: now, playCount: game.playCount, via }`, clear `manualDue`, then broadcast status.
- **Order:** delivery is recorded after the clipboard succeeds. If the POST fails, the routine stays due and repeats next time. That is harmless, never lost.

**Three truths kept distinct:**
- *routine due:* engine;
- *directive delivered to the human's clipboard:* recorded;
- *sources actually reread by the external AI:* **Unknown**, never recorded or claimed. UI copy says "Last sent", never "Last refreshed" as a fact about the AI.
  - The brief's example label "Last refreshed" is deliberately rendered as **"Last sent"**.

## Dev Mode rule

- **Dev Mode OFF:** routines are **paused**. They are not injected, not shown in Incoming, and the Settings list is hidden.
  - **Counting continues** so counters stay meaningful.
  - On re-enable, routines whose count is already past N are immediately "Due now". Settings shows that before any copy happens.
- **Turning Dev Mode ON:** creates nothing on its own; it offers the recommended routine. Execution semantics are unchanged; Player routines are off unless explicitly enabled.

# Data Model

```ts
// src/control-plane/coach-routines.ts  (new, pure + store)
export type RoutineTarget = 'strategy-board' | 'players';             // 'both' = both flags set
export type RoutineCadence =
  | { kind: 'plays'; every: number }                                   // 1–100
  | { kind: 'time'; everyMs: number };                                 // V0 UI: days (1–30) × 86_400_000

export interface RoutineSource {
  path: string;                      // Game-root-relative, forward slashes, no leading '/', no '..'
  kind: 'file' | 'folder';
  lastCheck?: { at: number; state: 'file' | 'folder' | 'missing' | 'blocked' | 'unknown' };
}

export interface CoachRoutine {
  id: string;                        // 'rt_' + random
  name: string;                      // ≤ 60 chars
  template: 'canonical-refresh' | 'map-check' | 'custom';
  enabled: boolean;
  cadence: RoutineCadence;
  targets: { strategyBoard: boolean; players: boolean };   // defaults: true / false
  sources: RoutineSource[];          // ≤ 20
  instruction?: string;              // ≤ 500 chars, plain text, single envelope section
  includeLocalRoot: boolean;         // default true
  playersScope?: { mode: 'all' | 'selected'; instanceIds?: string[]; onFirstPlay: boolean }; // Slice F
  createdAt: number;
  board: { baselinePlayCount: number; baselineAt: number; manualDue?: boolean;
           lastDelivered?: { at: number; playCount: number; via: 'copy-report' | 'strategy-board-send' } };
  players: Record<string, { lastDelivered?: { at: number; playCount: number; clientRef: string } }>;
}

export interface GameRoutineState {
  gameId: string;
  playCount: number;
  countedRefs: string[];             // bounded dedupe
  players: Record<string, { playCount: number; firstSeenAt: number; leftTeamAt?: number }>;
  routines: CoachRoutine[];
}

// Projection (status.routines for the selected Game; never another Game's)
export interface RoutineView {
  id: string; name: string; enabled: boolean; template: CoachRoutine['template'];
  cadenceLabel: string;              // "Every 5 Plays" / "Every 3 days"
  targetsLabel: string;              // "Strategy Board"
  due: boolean; cycle?: string;      // cycle = `${id}:${lastDelivered?.at ?? baselineAt}:${manualDue ? 'm' : 'c'}`
  lastSentLabel: string; nextLabel: string;
  needs?: 'sources' | 'devMode';
  sources: Array<{ path: string; kind: 'file' | 'folder'; state: string }>;
}
export interface RoutinesProjection {
  gameId: string; devMode: boolean; routines: RoutineView[];
  handoff?: { text: string; deliveries: Array<{ routineId: string; cycle: string }>; names: string[] };   // present only when ≥1 due
}
```

`cycle` changes only when a delivery or manual-due occurs, so two devices copying the same due routine produce one delivery.

# Strategy Board Handoff Contract

- **Built by the server** (`buildStrategyBoardEnvelope`) from all due routines of the Game.
- **Merged into one envelope:**
  - one header;
  - one locator block;
  - sources de-duplicated across routines and ordered by first appearance;
  - each routine's instruction as its own bullet;
  - the envelope placed **before** the report text.
- **Plain text** (it survives any chat app), with no Markdown dependency:

```text
=== SIDELINE COACH ROUTINE — CANONICAL REFRESH DUE ===
Before recommending or drafting the next Play, reread the canonical project sources
below and reconcile the report that follows against them.
If you cannot open a source, say so plainly. Do not say you reread something you could not open.
Start your reply with one line: "Refresh: reread … / couldn't open …".

Game: Sideline Coach
Repository: github.com/nowimhere3/Sideline-Coach · branch q2.8-multigame-field-debug
Local folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Sources (paths inside the Game folder):
- Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md
- Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md
- Docs ANCHOR/  (folder — everything inside)
Also:
- Map Check: Give me a Map Check: WAS / IS / NEXT / horizon.
Note: the remote repository may not include unpushed local changes.
=== END COACH ROUTINE — REPORT FOLLOWS ===

<human report content, exactly as Copy produces today>
```

**Locator contract (minimum useful):**

| Line | Rule |
|---|---|
| `Game` | Display name. |
| `Repository` | Normalized `repoUri` host/owner/repo when known, else omitted. Plus `branch` when the Stadium reports it, else omitted. |
| `Local folder` | `rootFsPath`, only if the routine has `includeLocalRoot`. |
| `Sources` | Repo-relative paths plus kind. |
| Missing-at-last-check sources | Suffixed `(Sideline couldn't find this on <date>)`. |
| Unchecked sources | No claim. |
| Never included | File contents, absolute paths other than the root, tokens, ports, instance ids, clientRefs, provider or account data. |

**Report file:** unchanged byte-for-byte. The envelope exists only in `status.routines.handoff.text`, the Incoming banner, and the clipboard string.

**Preview vs Copy:**
- **Preview** shows a *separate banner* announcing inclusion. It does not render the envelope inside `#reportPreview`, so the human reads the Player's report as-is.
- **Copy** carries it.

**Future surfaces:** "Send to Strategy Board", Coach Brief, and a direct integration reuse the same builder and delivery endpoint with `via: 'strategy-board-send'`.

**Collision with acknowledgement:**
- Copy triggers two independent calls after clipboard success: the existing `/api/work/acknowledge {reportPath}` (unchanged) and `/api/routines/delivered`.
- Neither reads or writes the other's state.
- Selecting a report acknowledges it (Q2.10F.3) but never delivers routines.
- A report already acknowledged can still carry a due routine when copied again.

# Source Selection

**Stadium RPCs** (new, in the `stadium-client.ts` request switch beside `report.rescan`; all bounded to the Game root):

| RPC | Returns |
|---|---|
| `routine.sources.suggest {gameId}` | ≤ 10 candidates, each `{path, kind, reason}` |
| `routine.sources.browse {gameId, dir}` | one directory level, ≤ 200 entries: `{name, kind}` |
| `routine.sources.check {gameId, paths[]}` | `{path, state}` per path |

The Control Plane exposes these at `GET /api/routines/sources/suggest|browse` and `POST /api/routines/sources/check`, proxying to the authoritative Stadium for `gameId`. When offline, they return `state: 'unknown'` rather than an error.

**Suggestion heuristics** (Stadium, case-insensitive, depth ≤ 3):
- filenames or folders matching `north star`, `architecture`, `breadcrumb`, `sop`, `operating`, `playbook`, `roadmap`;
- `AGENTS.md`, `CLAUDE.md`, `README.md`;
- the `Docs ANCHOR/` folder and the future `Reports-SC` contract's sibling docs.

These are suggestions only; the human confirms. Filenames are never hardcoded as the answer.

**Boundary and security rules** (enforced by the Stadium, re-validated by the Control Plane on save):
- Normalize to forward slashes. Reject absolute paths, drive letters, UNC paths, `..` segments, and empty paths.
- Resolve the real path and require it inside the Game root (symlink escape gives `blocked`).
- Deny list gives `blocked`:
  - `.git/`, `node_modules/`;
  - `.env*`, `*.pem`, `*.key`, `*.pfx`, `id_rsa*`;
  - `**/secrets/**`, `**/credentials*`;
  - the whole `.sideline`/token area.
- V0 performs `stat` only; **no file contents are read or sent**. Folder browse returns names only.

The browser's **+ Add file / + Add folder** opens a small in-page browser. It starts at the Game root, shows a breadcrumb path, tap a folder to enter, "Use this folder" to add, tap a file to add it. A text field "or type a path in this Game" accepts manual paths for offline Games; those are checked when possible and otherwise shown as "Not checked yet".

"Entire canonical folder" is simply a folder source. The envelope tells the AI to read everything inside; Sideline never expands it into a file list or contents.

# Player-Side Future / Optional Contract (Slice F)

- **Off by default:** `targets.players = false`. The UI hides it behind "More options".
- **Per-Player counter:**
  - `players[instanceId].playCount` increments on the same accepted verdicts, **for the exact target instance**;
  - queued Plays count for the Player at **release** (`received` with `queueItemId`), because that is when the Player receives it;
  - Terminal is never targeted.
- **Due** (per routine, per instance, cadence as above):
  - baseline is `firstSeenAt` / `playCount = 0`;
  - with `onFirstPlay: true` (default ON for Player routines), a newly recruited exact instance is due on its first Play, since it has never read the rules.
- **Delivery point:** the router gains `setRoutinePreambleProvider((gameId, instanceId) => { text, deliveries } | undefined)`.
  - It composes `deliveredPrompt = [routinePreamble] + [contextPreamble] + humanPrompt + [reportInstruction]`.
  - The human composer text and the stored queue prompt are never modified.
  - For a queued Play the preamble is computed **at release**, not at enqueue.
- **Delivered:** only when that exact dispatch's `status-update` is `received`, matched by `clientRef` and remembered in a pending map. `failed` or `unknown` leaves it due.
  - Unknown stays due deliberately: an extra reread beats a silently skipped one.
- **Player preamble text:**

  ```text
  [Sideline Coach routine] Before starting this Play, reread: <sources>. If you cannot open one, say so in your report. Then continue with the Play below.
  ```
- **Lifecycle:**

  | Event | Effect |
  |---|---|
  | Benched | Keeps its counters (still on the Team) |
  | Put back on field | Continues its counters |
  | Removed | Counters marked `leftTeamAt`, kept 30 days for diagnostics, never reused (ids are retired) |
  | Newly recruited instance | Fresh id and fresh counters (first-Play rule) |
  | Controlled restore / reload re-adoption | Same id, so counters continue |
  | Friendly-number compaction ("Claude 2" becomes "Claude 1") | No effect, since nothing stores names |

# Implementation Slices

| Slice | Scope | Touches `index.html`? | Worker |
|---|---|---|---|
| **A. Routine domain + store** | `coach-routines.ts`: types, validation (path rules, limits), pure `evaluate`, `cycle`, labels, envelope builder, atomic store with load/save, corrupt handling, version. `CoachPreferences.devMode` (load/save, default false). | No | Codex GPT-5.6 Sol · Medium |
| **B. Engine wiring + API** | Daemon: construct store; hook router `play-queued` and `status-update` (`received`/`unknown`, skip `queueItemId` releases, skip `direct-shell`); dedupe; `status.routines` projection for the selected Game; `status.preferences.devMode`. HTTP: `GET/POST /api/routines`, `PATCH/DELETE /api/routines/:id`, `POST /api/routines/:id/due`, `POST /api/routines/delivered`, `POST /api/preferences {devMode}`. Broadcast status on mutation. | No | Codex GPT-5.6 Sol · High |
| **C. Stadium source RPCs** | `stadium-client.ts` request handlers plus a new `src/routine-sources.ts` (suggest/browse/check with boundary and deny rules; uses `vscode.workspace.fs` + realpath); daemon proxy endpoints. | No | Claude Sonnet 4.6 or Codex · Medium |
| **D. Incoming handoff injection** | Browser: Incoming due banner, "Not this time", Copy concatenation, success label, `routines/delivered` after clipboard success (independent of acknowledge). | **Yes**, Incoming + Copy handler only | Claude Sonnet 4.6 |
| **E. Dev Mode Settings UI** | Dev Mode card; recommended-routine offer; routine list; sentence editor; file/folder browser; templates (Canonical Refresh, Map Check, Custom); time unit selector. | **Yes**, `#settingsView` only | Claude Sonnet 4.6 |
| **F. Player-target routines** | Engine per-instance counters and first-Play rule; router preamble provider; release-time composition; delivered-on-received; "More options" UI. | Router + small `index.html` | Codex GPT-5.6 Sol · High |
| **G. Proof** | e2e (real daemon + fake Stadium + page); breadcrumbs; field proof. | Tests only | Codex GPT-5.6 Sol · Medium |

**Order:**
- A → B → C → D → E → G(V0 proof) → F → G(F).
- A–C are server/extension-only and can start as soon as `daemon.ts` is not being edited by Codex; check `git diff src/control-plane/daemon.ts` freshness first.
- D and E must wait for Q2.10F.4.1 to finish in `index.html`.
- V0 ends after E + G. F is optional and ships after field use shows Players drift.

# Likely File-Touch Map

| File | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| `src/control-plane/coach-routines.ts` (new) | ✚ | ✎ |  |  |  | ✎ |  |
| `src/running-players.ts` (`CoachPreferences.devMode`) | ✎ |  |  |  |  |  |  |
| `src/control-plane/daemon.ts` |  | ✎ | ✎ (proxy) |  |  | ✎ (provider wiring) |  |
| `src/control-plane/router.ts` |  | (none; events already emitted) |  |  |  | ✎ (preamble layer) |  |
| `src/routine-sources.ts` (new, Stadium side) |  |  | ✚ |  |  |  |  |
| `src/stadium-client.ts` |  |  | ✎ (RPC cases) |  |  |  |  |
| `src/public/index.html` |  |  |  | ✎ Incoming/Copy | ✎ Settings |  ✎ More options |  |
| `test/coach-routines-*.test.mjs` (new) | ✚ | ✚ | ✚ | ✚ | ✚ | ✚ | ✚ |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` |  |  |  |  |  |  | ✎ |

**Explicitly untouched:**
- `work-ledger.ts`, `execution-projection.ts`, `play-queue.ts`;
- `route-constraints.ts`, `routing-policy.ts`, `context-affinity.ts`;
- `report-provenance.ts`;
- `server.ts`: the legacy in-extension server gets no routines, and its status has no `routines`, so the browser shows nothing;
- the provider adapters.

# Test Plan

**Unit tests** (`test/coach-routines-engine.test.mjs`):
1. Every-N boundaries: counts 0…N−1 are not due, N is due, N+3 is still due until delivered; after delivery `since` resets to 0; N=1 works; changing N re-evaluates immediately.
2. Counting sources: `received` +1, `unknown` +1, `queued` +1, a release with `queueItemId` +0, `failed` +0, duplicate `clientRef` +0, `direct-shell` +0.
3. Multiple routines: independent cadences, due states and deliveries; the merged envelope de-duplicates sources and keeps each instruction.
4. Disabled routine is never due; Dev Mode OFF is never due and not projected into handoff, but counting continues; re-enable shows due where earned.
5. New routine baseline is not due; manual "Send with my next report" is due; delivery clears it.
6. Time cadence: fake clock at N days − 1 ms is not due and at N days is due; lazy evaluation only; no timers are created (assert no `setInterval` or `setTimeout` from the module).
7. Cycle idempotency: two deliveries of the same cycle record one; a stale cycle after re-due is a no-op.
8. Envelope: locator lines omitted when unknown; missing-source suffix; no contents, ids, tokens or absolute paths beyond an opted-in root; plain text; ≤ a bounded size.
9. Path validation: absolute, `..`, drive, UNC, empty and deny-listed paths are rejected; normalisation.
10. Store: atomic write, restart reload, corrupt file becomes `.bak` with empty state, unknown version refused.

**Daemon integration** (`test/coach-routines-daemon.test.mjs`, real `ControlPlaneDaemon` + fake `StadiumClient`):
- 11. **Game isolation:** five Plays in Trend never make SidelineCoach due, even while SidelineCoach is the selected Game; routine ids are refused across Games.
- 12. **Restart:** count 4, restart daemon, one more Play, due; delivered survives restart.
- 13. **Reconnect:** Stadium disconnect and reconnect never changes counters.
- 14. **Queue:** enqueue counts once; release, retry and cancel don't double count.
- 15. **Delivery endpoint:** Game-scoped, idempotent, broadcasts status; failure leaves due.

**Browser** (`test/coach-routines-incoming.test.mjs`, vm page harness with daemon shapes):
- 16. Rendering Incoming, reloading, selecting reports and expanding Preview do **not** call `routines/delivered`, and due stays.
- 17. Copy success prepends `handoff.text` and calls delivered **once** with exact cycles; acknowledge is still called separately.
- 18. Copy failure calls neither delivered nor acknowledge.
- 19. "Not this time" copies the report alone and due stays.
- 20. Preview `#reportPreview` never contains the envelope.
- 21. **Report bytes:** the Stadium fixture report file hash is identical before and after render, copy and delivery (fs read in a real-wire test).
- 22. Dev Mode OFF gives no banner and no injection.

**Sources** (`test/coach-routine-sources.test.mjs`, fixture Game folder):
- 23. Suggest finds canonical docs and ignores `node_modules` and `.git`.
- 24. Browse is one level and bounded.
- 25. Check reports `file`/`folder`/`missing`/`blocked` and symlink escape as `blocked`.
- 26. Offline Game gives `unknown` and a truthful envelope with no claims.

**Player routines** (F, `test/coach-routines-players.test.mjs`):
- 27. Off by default; with Strategy Board-only routines, the dispatch payload is byte-identical to today.
- 28. Per-instance counters keyed by id; friendly-number compaction and bench/unbench leave counters unchanged; removal marks `leftTeamAt`; a new instance starts fresh and is due on first Play.
- 29. Preamble is layered before `contextPreamble`; the stored queue prompt and composer text are unchanged.
- 30. Delivered only on `received` for that `clientRef`; `failed`/`unknown` stays due.
- 31. Strategy Board and Player channels are independent (delivering one does not deliver the other).

**Minimal human field proof (after D + E):**
1. Settings → Dev Mode ON → add the recommended Canonical Refresh with **Every 2 Plays** and the suggested files.
2. Dispatch two Plays in this Game. In Incoming, see "Canonical Refresh is due".
3. Copy the report and paste it into the Strategy Board: the routine block comes first, then the report. Settings shows "Last sent: 0 Plays ago · Next: in 2 Plays".
4. Open the report file in VS Code and confirm it has no routine text.

# Risks / Unresolved Questions

1. **Copy is the only detectable handoff.** Manual text selection on a phone bypasses delivery, so the routine stays due. That is the safe direction; future "Send to Strategy Board" covers it.
2. **Envelope noise.** A large merged envelope can clutter the chat. Mitigations: a merged de-duplicated block, a bounded instruction length, folder references instead of expansion.
3. **Remote vs local drift.** A Strategy Board reading GitHub may see older docs; the envelope notes it. Blob links for pushed files are deferred (they can mislead on dirty trees).
4. **Branch detection.** Needs a small Stadium probe (VS Code git API or `git rev-parse`). If absent, the line is omitted; not required for V0 correctness.
5. **Selected-Game-only projection.** `status.routines` follows the page's Game. Settings edits target `currentGameId` explicitly in every request body, like the queue APIs.
6. **Terminal exclusion** may surprise a Terminal-heavy user. A future per-routine checkbox would address that.
7. **Legacy in-extension server:** no routines (acceptable; not the product path).
8. **Dev Mode naming** could later split into "Advanced". The preference key stays `devMode`.
9. **Open for the human:**
   - (a) Should "Unknown" dispatches count? Recommended yes.
   - (b) Should cancelled queued Plays stay counted? Recommended yes.
   - (c) Should `Local folder` default ON? Recommended yes, matching the brief's example.

   Defaults are chosen so implementation is not blocked.

# Recommended Immediate Implementation Play (after Codex finishes)

**"Coach Routines V0 · Slices A + B — Routine engine, persistence, Play counting and handoff projection (server only)."**

- **Worker:** Codex GPT-5.6 Sol, High.
- **Files:** new `src/control-plane/coach-routines.ts`; `src/running-players.ts` (`devMode`); `src/control-plane/daemon.ts` (hooks, projection, endpoints); new tests.
- **No** `index.html`, router, ledger or queue edits.
- **Acceptance:** unit tests 1–10, daemon tests 11–15, `npm test` green, and `status.routines.handoff.text` available for Slice D.
- **Pre-flight:** confirm Q2.10F.4.1 is not editing `daemon.ts`; if it is, wait for its report.

# Breadcrumbs (to add to ARCHITECTURE-BREADCRUMBS.md during Slice G)

- *The human should not have to remember when the AI needs to remember.*
- *Strategy Board first. Players downstream.*
- *Sideline remembers when the Strategy Board needs to refresh its canonical context.*
- *Persistent memory provides continuity; canonical project sources remain authoritative.*
- *Coach Routine directives belong to Sideline's handoff layer, not to the Player's canonical report file.*
- *Player refresh is optional because unnecessary rereads consume valuable Player context.*
- *Friendly Player names are presentation. Routine ownership uses stable exact identity.*
- *Due is observation; delivered is a recorded human handoff; reread by an external AI is Unknown unless it tells us.*
- *A Play belongs to the Game it was dispatched in, not the Game being viewed.*
- *Dev Mode reveals and offers; it never silently changes what runs.*

# WAS / IS / WILL BE

## WAS

Keeping the Strategy Board aligned with North Star, SOPs and architecture rules depended on the human remembering, every few Plays, to tell it to reread them. Persistent AI memory drifted from canonical sources, and nothing in Sideline tracked or reminded. Settings had one live preference and no advanced surface.

## IS

The Coach Routines architecture is frozen:
- a global Dev Mode preference, OFF by default;
- Game-scoped routines and counters in one atomic Control Plane store;
- Play counting from existing router verdicts, deduped and Game-owned;
- lazy count and day cadences with no scheduler;
- a server-built, plain-text Strategy Board envelope delivered only by a successful deliberate Copy, never mutating reports and independent of acknowledgement;
- Stadium-bounded source suggestion, browse and check;
- an optional, off-by-default Player preamble keyed by exact instance id.

Implementation slices and a collision-aware file map are ready. No production code changed.

## WILL BE

- **V0:** Slices A → B → C (server/extension), then D → E (Incoming + Settings UI, after Q2.10F.4.1), with automated proof and a four-step human field proof.
- **Then:** Player-target routines (F) if Players drift.
- **Later:**
  - "Send to Strategy Board" and Coach Brief integration reusing the same envelope and delivery contract;
  - optional inline source snapshots (explicit, bounded, never default);
  - hour cadences and "whichever comes first";
  - Terminal-counting option;
  - Game Playbook & SOP Contract adoption of routine sources as canonical Game docs.

REPORT: Coach-Routines-Strategy-Board-Canonical-Refresh-Architecture.md
TIMESTAMP: 2026-09-14 10:00:55 MDT (America/Edmonton)
