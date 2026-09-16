REPORT FILE:
Coach-Routines-V0-Slice-C-Canonical-Source-Discovery-And-Verification.md

REPORT TIMESTAMP:
2026-09-14 11:47:23 -06:00 (America/Edmonton)

# Executive Result

Coach Routines V0 Slice C is implemented and automation-green. The exact Game's authoritative Stadium now discovers, browses, and verifies canonical source references within the Game root. The Control Plane proxies metadata and owns persisted Routine policy; it does not inspect the Game filesystem or ingest source contents.

Canonical Refresh remains truthfully `Needs files` until every configured source has a successful authoritative check matching its declared file/folder kind. Unchecked, Unknown, missing, blocked, wrong-kind, stale, browser-supplied, wrong-Game, or disconnected evidence cannot manufacture a Strategy Board handoff.

# Architecture Followed

The implementation follows the frozen Coach Routines architecture and the A+B engine baseline:

- Stadium owns Game-local filesystem observation.
- Control Plane owns routine definitions, cadence, delivery cycles, projections, and persistence.
- Routine sources are references plus verification facts, never cached document contents.
- Exact `gameId` is required at every RPC and HTTP boundary.
- Unknown remains valid and cannot be upgraded by syntax validation or plausible filenames.
- Suggestions are proposals only and never mutate routine configuration.

# Deviations and Tightening

No architectural redesign was required. Repository inspection found an in-progress Slice C seam in the shared dirty tree. It was preserved and hardened rather than replaced.

Two necessary truthfulness corrections were made:

1. Canonical Refresh no longer treats unchecked or Unknown sources as usable. Every configured source must be authoritatively confirmed and match its declared kind.
2. `lastCheck` now uses a monotonic Stadium observation timestamp. A stale check cannot overwrite newer persisted evidence, and client-provided `lastCheck` values are ignored.

The existing A+B cadence/count/delivery policy is unchanged. A+B tests that previously used syntax-only source fixtures were updated to explicitly establish authoritative source evidence before asserting deliverability, because Slice C intentionally supersedes that test assumption.

# Stadium / Control Plane Ownership Seam

The Stadium runs `src/routine-sources.ts` against `gameContext.binding.rootFsPath`. The Stadium client exposes three exact-Game RPCs. The daemon resolves the authoritative connected Stadium for the supplied `gameId`, sends the RPC there, validates the returned Game identity, reshapes the metadata response, and only then records valid check evidence.

The Control Plane never calls Node filesystem APIs to inspect a Game source. Its existing filesystem use remains limited to its own Control Plane state stores.

# RPC and API Additions

Stadium RPCs:

- `routine.sources.suggest`
- `routine.sources.browse`
- `routine.sources.check`

Authenticated Control Plane endpoints:

- `GET|POST /api/routines/sources/suggest` with exact `gameId`
- `GET|POST /api/routines/sources/browse` with exact `gameId` and optional Game-relative `dir`
- `POST /api/routines/sources/check` with exact `gameId` and at most 20 string paths

Suggestion responses contain only `{ path, kind, reason }`. Browse responses contain only `{ name, path, kind }`. Check responses contain only `{ path, state }` plus authoritative `checkedAt`. The daemon reconstructs these shapes so an unexpected Stadium field such as `content` cannot cross the API boundary.

# Filesystem Confinement Design

All source paths are Game-root-relative. Validation rejects empty/malformed paths, absolute paths, Windows drive paths, UNC paths, `.`/`..` traversal, and paths over 240 characters.

For existing targets, the Stadium resolves both the Game root and target with `realpath`, then requires the canonical target to remain under the canonical Game root. For missing targets, it walks to the nearest existing ancestor and performs the same canonical containment check, preventing a missing leaf beneath an escaping link from being mislabeled merely missing.

Blocked surfaces include `.git`, `node_modules`, `.sideline`, `secrets`, credential-prefixed paths, `.env` variants, private-key/certificate formats, `id_rsa` variants, and token files. Non-file/non-directory filesystem objects are not offered as sources.

# Symlink / Junction Handling

Symlinks and Windows junctions are permitted only when their canonical target remains inside the canonical Game root. Any existing target or nearest existing ancestor that resolves outside the root is `blocked`. If canonical filesystem truth cannot be established, the result is `unknown` or the browse operation fails safely; it is never guessed safe.

The Windows test harness creates a real directory junction/symlink escape and proves the link itself, an existing file through it, and a missing descendant through it are all blocked.

# Game Isolation

Every source API requires an explicit `gameId`. The daemon neither falls back to the selected browser Game nor chooses by display name. It routes only through `getAuthoritativeSessionForGame(gameId)`. Stadium handlers reject missing and mismatched Game ids before invoking any filesystem helper. Returned RPC Game identity must exactly match the request before metadata is accepted or persisted.

A disconnected known Stadium produces truthful unavailability: suggestion/browse return an offline response, while check may return per-path `unknown` without updating stored authoritative evidence.

# Source Semantics

## Suggest

Suggestion performs deterministic, evidence-based filename/folder heuristics over real Game entries. It is depth-bounded to three levels, scan-bounded to 1,000 entries and 100 directories, excludes blocked surfaces, and returns at most 10 metadata proposals. No suggestion is automatically selected or stored.

## Browse

Browse lists one exact Game-relative directory level. It scans at most 1,000 entries, excludes blocked or escaping entries, returns metadata only, sorts folders before files, and returns at most 200 entries. It does not recursively dump the repository.

## Check

Check accepts at most 20 paths. Each result is one of `file`, `folder`, `missing`, `blocked`, or `unknown`. It validates syntax, blocked surfaces, canonical root confinement, link/junction confinement, and actual filesystem type.

# `lastCheck` Semantics

Persisted `RoutineSource.lastCheck` remains:

```json
{
  "at": 1789415243000,
  "state": "file"
}
```

`at` is supplied by the authoritative Stadium and monotonically increases for source-check requests within that Stadium lifetime. The engine accepts only finite timestamped known states for configured paths. It updates only when `checkedAt` is newer than the stored observation. API create/update payloads cannot manufacture `lastCheck`; unchanged source path/kind entries retain their real observation, while changed/new sources start unchecked. The existing version-1 atomic store persists and restores valid authoritative checks without a schema migration.

# Files Changed

- `src/routine-sources.ts` — bounded Stadium-only discovery, browse, verification, exclusions, and canonical confinement.
- `src/stadium-client.ts` — exact-Game source RPC handlers and monotonic authoritative check timestamps.
- `src/control-plane/daemon.ts` — authenticated exact-Game proxy APIs, response validation/reshaping, offline behavior, and authoritative check persistence.
- `src/control-plane/coach-routines.ts` — ordered `lastCheck` ingestion, untrusted-input protection, persistence restoration, and confirmed-source deliverability.
- `test/coach-routine-sources.test.mjs` — Slice C filesystem, security, daemon, Stadium, persistence, and real-wire acceptance.
- `test/coach-routines-engine.test.mjs` — A+B cadence assertions now explicitly establish authoritative source confirmation.
- `test/coach-routines-daemon.test.mjs` — A+B API delivery assertions now explicitly establish authoritative source confirmation.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — Slice C WAS/IS/WILL BE ownership and truthfulness contract.
- This report.

All unrelated dirty-tree changes were preserved.

# Tests and Exact Counts

Focused Slice C:

- `node --test test/coach-routine-sources.test.mjs`
- 30 passed, 0 failed.

Combined Coach Routines A+B+C:

- `node --test test/coach-routine-sources.test.mjs test/coach-routines-engine.test.mjs test/coach-routines-daemon.test.mjs`
- 55 passed, 0 failed.

Full repository:

- `npm test`
- 596 passed, 0 failed.

Other validation:

- `npm run check` — passed.
- `npm run compile` — passed.
- `git diff --check` — passed; only existing Windows LF→CRLF notices were emitted.

The Slice C suite covers valid file/folder, missing/malformed, traversal/absolute/drive/UNC rejection, real symlink/junction escape, exclusions, bounded responses and request counts, exact Game routing, disconnected behavior, authoritative persistence, stale-order rejection, untrusted-check rejection, strict kind matching, no content leakage, and a real daemon + real StadiumClient WebSocket round trip.

# Compatibility Notes

- No browser or Settings files were changed for Slice C.
- No routing, execution, queue, report, acknowledgement, Incoming, composer, or Player delivery semantics were changed.
- Coach Routine persistence remains version 1 and atomic.
- Suggestions do not mutate human configuration.
- A map-check or custom instruction with no source dependency can remain source-independent; Canonical Refresh requires confirmed sources.
- Offline `unknown` observations are returned for truthfulness but are not persisted as authoritative Stadium checks.

# Known Constraints

- Suggestions use bounded deterministic filename/folder heuristics, not semantic AI classification.
- Browse is one level at a time and metadata-only.
- No scheduler, watcher, or automatic recheck exists.
- No Settings/source-picker UI exists yet.
- Source verification proves path safety/existence/type, not whether an external Strategy Board AI actually reads the referenced source.
- The Stadium timestamp orders check requests; it is not a distributed filesystem revision or file-content freshness guarantee.

# WAS / IS / WILL BE

## WAS

The Control Plane could store syntactically safe Game-relative source strings, but it could not prove that they existed, matched their declared kind, or remained inside the Game after symlink/junction resolution. Canonical Refresh therefore remained `Needs files` by design.

## IS

The exact Game's authoritative Stadium now supplies bounded metadata-only source suggestions, browsing, and checks with canonical path confinement. The Control Plane records only newer authoritative checks, preserves exact Game isolation, and emits no Canonical Refresh handoff until every configured source is confirmed safe and correctly typed.

## WILL BE

The next slice should add the Dev Mode Settings/source-selection experience over these APIs: show bounded Stadium suggestions, let the human confirm sources, display truthful missing/blocked/Unknown states, and save explicit choices. Incoming Copy delivery integration remains later and must mark a routine delivered only after the actual handoff succeeds. Player-target routines remain downstream and OFF by default.

# Recommended Next Slice

Implement Coach Routines V0 Slice D: Dadified Dev Mode Settings and canonical source selection using the established exact-Game APIs. Keep source suggestions advisory, require human confirmation, and do not yet modify Incoming, Copy, reports, or Player prompts.

# Commit / Push Status

No commit was created. Nothing was pushed.

REPORT: Coach-Routines-V0-Slice-C-Canonical-Source-Discovery-And-Verification.md
TIMESTAMP: 2026-09-14 11:47:23 -06:00 (America/Edmonton)
