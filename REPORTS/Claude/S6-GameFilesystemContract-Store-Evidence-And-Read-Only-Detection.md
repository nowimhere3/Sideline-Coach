REPORT FILE:
S6-GameFilesystemContract-Store-Evidence-And-Read-Only-Detection.md

REPORT TIMESTAMP:
2026-09-15 20:04 MDT

REPORT NUMBER / STAGE:
UNKNOWN (project-global chronology is ambiguous — see §3)

LOCAL SLICE:
S6

REPORT TITLE:
S6 — GameFilesystemContract Store, Evidence And Read-Only Detection

# S6 — GameFilesystemContract Store, Evidence And Read-Only Detection

## 1. REPORT IDENTITY

| Field | Value |
|---|---|
| Report file | `REPORTS/Claude/S6-GameFilesystemContract-Store-Evidence-And-Read-Only-Detection.md` |
| Timestamp | 2026-09-15 20:04 MDT (America/Edmonton) |
| Project-global number / stage | **UNKNOWN** (§3) |
| Local slice | **S6** |
| Branch | `q2.8-multigame-field-debug` (verified before and after implementation) |
| Executed by | **Claude Code · Claude Opus 5 · High effort** |
| Play addressed to | `AGENT: Codex / GPT-5.6 Sol` |

**Lane note — read this before filing.** The Play asked for the report in `REPORTS/Codex`, where S1–S5 live. This slice was executed by Claude, not Codex. Sideline derives the Incoming agent badge from the folder directly under the report root (`server.ts:describeReport()`), so filing Claude's work in the Codex lane would make the product state a false author. The report is therefore in the Claude lane with the `S6-` series name preserved. Say the word and it can be moved or copied to `REPORTS/Codex` for series continuity.

## 2. VERDICT

S6 is implemented and automated proof is green: **53 new tests pass, and the full suite is 820/820.**

Sideline Coach can now answer, durably and per Game:

- where this Game's Reports root is;
- where its SOP/onboarding root is;
- whether that came from a human, from unambiguous evidence, or from nothing;
- whether the evidence is ambiguous, invalid, missing, or simply unavailable.

It does this **without touching a single Game folder**. Detection is read-only, and every detection test asserts the Game tree is byte-identical before and after.

No `Reports-SLC`, SOP folder, or Player report lane is created. No watcher or `coach.reportGlobs` behavior changed. No Settings UI was added.

## 3. PROJECT-GLOBAL NUMBER / LOCAL S6 IDENTITY

**Project-global number: UNKNOWN. Not guessed.**

The Play states report numbering is global to the project and never per Player. Repository evidence does not currently support deriving the next number:

| Evidence | Numbering |
|---|---|
| `REPORTS/Codex/S1…S5` (the immediately preceding slices) | no global number at all |
| `REPORTS/Claude/1.1-Opus-Add-Game-Final-Adoption-And-Launch-Contract.md` | `1.1` |
| `REPORTS/Claude/55-P0-Mobile-Incoming-Reports-Regression-Forensics.md` | `55` |
| `REPORTS/Codex/5-5-5-Fix-Report-Path-Contract.md` | `5-5-5` |
| `Project SOP/Stage-69-Cross-Project-Diagnostic-Memory-Architecture.md` | `Stage-69` |
| `Project SOP/SOP PROMPTS .md` | contains no numbering rule (searched for number/stage/chronology) |

Four incompatible schemes and no maintained counter. Per the Play's instruction for genuine ambiguity: state UNKNOWN, preserve `S6`, report the ambiguity. Nothing was renumbered, and no Codex-only counter was invented.

**To fix this going forward,** the project needs one authoritative counter — for example a `Project SOP/REPORT-INDEX.md` ledger, or a rule such as "next integer above the highest `NN-` prefix across all lanes". Once that exists, this report can be renamed to carry the number.

## 4. ARCHITECTURE USED

`REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`, specifically:

- §0 decision 1 (empty roster: root yes, lanes only on roster join) — honored by creating nothing at all in S6 and by never fabricating lanes;
- §5 (contract schema, store location, projection);
- §6 (Stadium/Control Plane split);
- §7.2–7.4 (evidence model, decision algorithm, ambiguity definition);
- §9 (SOP contract);
- §12.1 (module layout), §12.3 (RPC/HTTP seams);
- §20 (security boundaries), §22 (edge cases), §24 slice **S6**.

**One deliberate deviation from §24.** §24 said a no-candidate Game would be recorded as state `unknown` with a Dev Mode note. That would be untrue: the Stadium *did* look and *did* prove nothing is there. Implemented instead as `state: 'not-set'`, `provenance: 'none'`, plus an explicit `pendingReportsAction: 'create-reports-slc'`. `unknown` is now reserved for its honest meaning — the root could not be resolved or was never inspected (test S6-17, S6-49).

## 5. WORKTREE SAFETY

- Branch verified `q2.8-multigame-field-debug` before editing.
- The tree contained substantial pre-existing modified and untracked work (S1–S5 sources and reports, `Project SOP/Scout SOP and ROASTER/`, `REPORTS/**/OLD/`, Scout folders, `src/game-adoption.ts`, `README.md`, `package.json`, and several modified tests). **All of it was preserved.**
- No `reset`, `restore`, `stash`, `clean`, or `checkout`. No commit, no push.
- No Scout report, Opus architecture report, or S1–S5 report was renamed, renumbered, or rewritten.
- `git diff --check` passes (exit 0). The only output is pre-existing CRLF/LF advisory warnings on files Git already tracked that way.

## 6. FILES CREATED

| File | Purpose |
|---|---|
| `src/game-filesystem-contract.ts` | Pure contract: schema, name recognition, evidence types, `decideReportsRoot`, `decideSopRoot`, evidence sanitizer, Dad-facing projection. No `fs`, no `vscode`, no Control Plane import. |
| `src/control-plane/game-filesystem-coordinator.ts` | Durable atomic store (`fileGameFilesystemStore`) and `GameFilesystemCoordinator`: reconcile with single-flight, revision management, human-choice seam. |
| `test/game-filesystem-contract.test.mjs` | 37 tests: recognition, decision algorithm, precedence, vanished roots, projection, store durability. |
| `test/game-filesystem-detection.test.mjs` | 16 tests: real-filesystem fixtures, no-mutation proof, junction escape, blocked paths, exact-Game wire contract. |

## 7. FILES MODIFIED

| File | Change |
|---|---|
| `src/game-files.ts` | Added read-only evidence: `countReportFiles`, `deriveNestedReportRoots`, `classifyRootCandidate`, `inspectGameFilesystemEvidence`. Existing Browse/Check/Search/Resolve untouched. |
| `src/stadium-client.ts` | New `game.filesystem.inspect` handler through the existing `withExactGame` guard; `gameFiles.inspect` test seam; `reportPathsGetter` option; feature list now `['game.files.v1', 'game.filesystem.v1']`. |
| `src/control-plane/protocol.ts` | Added `GameFilesystemInspectParams` / `GameFilesystemInspectResult`. |
| `src/control-plane/daemon.ts` | Coordinator construction and evidence provider; reconcile on `game-connected`; `GET /api/games/filesystem`; `POST /api/games/filesystem/reinspect`; `projectGameFilesystem()`; `gameSetup` in `buildStatus()`. |
| `src/server.ts` | Added `reportPathsForGame(gameId, limit)` — Game-relative report coordinates only, no content. Report discovery itself unchanged. |
| `src/extension.ts` | Wires `reportPathsGetter` to that method. |
| `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` | One `IS (S6)` bullet plus a "Still WILL BE after S6" bullet in the existing S-slice block. |

## 8. GAMEFILESYSTEMCONTRACT SCHEMA

```ts
interface GameFilesystemContract {
  schemaVersion: 1;
  gameId: string;
  revision: number;                    // +1 only when a decision actually changes
  reports: CanonicalFolder & { lanes: Record<string, ReportLaneRecord> };
  sop: CanonicalFolder;
  lastInspectedAt?: string;
  pendingReportsAction?: 'create-reports-slc';   // recorded, never performed in S6
}

interface CanonicalFolder {
  path?: string;                       // Game-relative, '/'-separated, on-disk casing; never '' or '.'
  provenance: 'none' | 'adopted' | 'created' | 'detected' | 'human';
  state: 'unknown' | 'ready' | 'not-set' | 'needs-choice' | 'needs-attention';
  candidates?: string[];               // only when needs-choice (max 8)
  attention?: { code: AttentionCode; detail?: string };
  decidedAt?: string;                  // when path/provenance changed
  verifiedAt?: string;                 // when Stadium evidence last confirmed it
}

type AttentionCode = 'missing' | 'not-a-folder' | 'blocked' | 'escapes-game'
                   | 'inaccessible' | 'name-collision' | 'create-failed' | 'multiple-case-variants';
```

Key properties:

- **Observed candidate, chosen root, provenance and ambiguity are four separate fields**, never collapsed into one string.
- Paths are **Game-relative**; no absolute machine path is ever persisted.
- `lanes` exists in the schema for later slices and is **always `{}` after S6** (test S6-25, S6-38).
- `revision` is reserved for the later Stadium projection; it does not increment on a re-inspection that changes nothing (test S6-31).

## 9. DURABLE STORE OWNERSHIP

- **File:** `~/.sideline/game-filesystem.json` (`SIDELINE_DIR` honored), beside `coach-routines.json`, `play-queue.json` and `work-ledger.json`.
- **Owner:** Control Plane. The daemon may not share a Stadium's filesystem at all, so it never inspects a Game itself.
- **Not used:** `.sideline/game.json` (identity, per 1.1 §11), VS Code `globalState` (per profile/window, and the source of the P0 Incoming regression), `coach-routines.json` (different domain).
- **Write pattern:** temp file + `renameSync`, mirroring `fileCoachRoutineStore`.
- **Keying:** by stable `gameId`. Games cannot overwrite one another (test S6-29), and nothing depends on the selected Game.
- **Durability:** a replacement daemon inherits the file with revisions intact (test S6-30).
- **Corruption:** unreadable JSON is quarantined to `.bak` and the daemon starts clean (S6-35). An unsupported `schemaVersion` is quarantined with a warning that names the Games whose **human** choices must be re-made, since everything else is re-derivable (S6-36).

## 10. REPORTS ROOT DETECTION

Recognized at the Game root, case-insensitively: `Reports-SLC`, `Reports`, `Docs REPORT`. Look-alikes (`Reporting`, `Reports-SLC-old`) are not candidates (S6-1).

Evidence also includes **nested report roots** proven by reports Sideline already discovers — for example `docs/Reports` — so a Game whose working reports live below the root is not mistaken for a Game with no reporting system (S6-13, S6-46). This is derived from the Game's own discovered report coordinates via `server.reportPathsForGame()`; no new scanning contract was introduced.

Decision (architecture §7.3):

```
A/B. provenance human | adopted | created → verify only; never re-detect
C.   provenance none:
       exactly one populated candidate            → adopt
       more than one populated candidate          → needs-choice
       none populated, Reports-SLC present        → adopt Reports-SLC
       none populated, exactly one candidate      → adopt
       none populated, several candidates         → needs-choice
       no candidate, Reports-SLC name occupied    → needs-attention (never touched)
       no candidate at all                        → not-set + pendingReportsAction
```

Play §6 cases, as implemented: **A** `Reports` only → adopted/unambiguous (S6-4, S6-38). **B** nothing → no valid root, creation only recorded (S6-6, S6-40). **C** `Reports-SLC` + `Reports` → decided by evidence, not by name preference; if both hold reports it is ambiguous (S6-10, S6-42). **D** recognized name that is a file → not a directory candidate, reported truthfully, left untouched (S6-14, S6-43).

## 11. SOP ROOT DETECTION

- Strong names only, separator-insensitive: `Onboarding-SOP`, `Onboarding-Docs`, `Project SOP`, `SOP` (S6-2).
- One valid candidate → `detected` / `ready`. Several → `needs-choice`. None → `not-set`, which is normal and never an error (S6-23).
- **Never created, never copied, never renamed.**
- `suggestSources()` heuristics were deliberately **not** used. Documentation candidate discovery is not canonical SOP authority; the two concepts stay separate, and Coach Routines remains untouched.

## 12. EVIDENCE / PROVENANCE MODEL

Stadium-produced evidence (`inspectGameFilesystemEvidence`):

```ts
{ gameId, rootResolvable,
  reportRootEntries: [{ name, recognized, kind, safety, reportFiles, reportFilesTruncated }],
  nestedReportRoots: [{ path, reportFiles }],
  sopRootEntries:    [{ name, recognized, kind, safety }],
  checks:            [{ path, state }],     // current contract paths
  observedAt, truncated }
```

- `safety` is `ok | escapes-game | blocked | inaccessible`; `kind` is `folder | file | other`.
- The contract retains **why**: `provenance` plus `candidates` plus `attention`, so "Reports is authoritative" is always backed by "exactly one populated recognized root existed" or "the human chose it".
- Emptiness is evidence: an empty recognized folder does not compete with a populated one, and a **truncated** count is never treated as empty (S6-8, S6-9).
- Evidence crosses a process boundary, so the Control Plane sanitizes it (`sanitizeGameFilesystemEvidence`): unrecognized names, malformed states, foreign `gameId`, and root-level paths posing as nested roots are dropped rather than believed (S6-28).

## 13. AMBIGUITY / NEEDS-ATTENTION MODEL

- **Ambiguous** = more than one valid populated candidate, or several valid empty candidates with no `Reports-SLC`. Result: `needs-choice` with the candidate list. No path is claimed.
- **Needs attention** = a configured root that is missing, not a folder, blocked, escaping, or inaccessible; or the canonical name occupied by something that is not a usable folder.
- **Unknown** = the Stadium could not resolve the Game root, or no inspection has happened. Unusable evidence never becomes proof of absence (S6-17, S6-49).
- Certainty is never invented to return a single answer.

## 14. HUMAN OVERRIDE PRECEDENCE

- `provenance: 'human'` is verified, never re-detected. New, more attractive evidence does not displace it (S6-18).
- `recordHumanChoice(gameId, kind, path)` and `clearChoice(...)` exist as the storage seam for the later Settings picker. **No HTTP route exposes them in S6**, so no UI can mutate a choice yet.
- "Use automatic" clears the decision and lets detection decide again (S6-34).

## 15. VANISHED ROOT BEHAVIOR

- A human-selected root that disappears → `needs-attention{missing}`, path retained, **no silent fallback** even when a perfectly good `Reports` folder now exists (S6-19).
- An adopted root replaced by a file → `needs-attention{not-a-folder}` (S6-20).
- A Sideline-`created` root that vanished → re-creation is *proposed* (`pendingReportsAction`) only when nothing else competes; with a competitor it is `needs-attention` plus candidates (S6-22). S6 performs neither.
- `unknown` evidence (offline/uninspected) keeps the previous decision and its previous `verifiedAt` (S6-21).
- The same rules apply to the SOP root (S6-24).

## 16. EXACT-GAME STADIUM EVIDENCE

- The Control Plane asks only `getAuthoritativeSessionForGame(gameId)` and only when it advertises `game.filesystem.v1`.
- The Stadium answers through the existing `withExactGame` guard, using its own `ctx.binding.rootFsPath`. No caller-supplied root exists in the contract.
- Evidence whose `gameId` is not the requested Game is discarded with a warning (S6-33 unit, S6-52 wire).
- Offline, conflicted, or feature-less Stadium → `inspected: false`, last durable answer stands (S6-32, S6-51, S6-53).
- Never: another Stadium as fallback, a sibling Game, a parent directory, or another drive.

## 17. STATUS / API PROJECTION

- `GET /api/games/filesystem?gameId=…` → `{ success, gameId, gameSetup, diagnostics? }`.
- `POST /api/games/filesystem/reinspect { gameId }` → read-only re-inspection, then the same projection plus `inspected` / `changed`. Offline returns 409 **with** the last known projection.
- `/api/status` now carries `gameSetup` for the selected Game.
- **Dad-facing projection** carries folder label, provenance wording (`Using existing folder` / `Created by Sideline` / `Automatically selected` / `Chosen by you` / `Not set`), state, one human sentence for attention, candidate paths, and `canChange`. It contains no `gameId`, no revision, no `.sideline`, and no absolute path (asserted in S6-26).
- **Diagnostics** (raw contract: revision, provenance, attention codes, pending action) are attached **only when Dev Mode is on**.

## 18. NO-MUTATION PROOF

Every fixture test wraps detection in a full recursive snapshot — directory names plus file bytes — and asserts equality before and after (`detect()` helper in `test/game-filesystem-detection.test.mjs`).

Specifically proven:

- a clean Game gains no `Reports-SLC` and no `Reports` (S6-40);
- a file named `Reports-SLC` keeps its exact bytes (S6-43);
- the wire path (`reinspect` through daemon → Stadium RPC → real filesystem) mutates nothing (S6-50);
- `lanes` stays `{}` — no `Reports-SLC/Codex`, `/Claude`, or `/AntiGravity` is created or claimed (S6-25, S6-38);
- no SOP folder is created (S6-39, S6-40).

The only filesystem writes S6 performs anywhere are to its own Control Plane state file in `~/.sideline/`.

## 19. BACKWARD COMPATIBILITY

- `coach.reportGlobs`, `scanReports`, `describeReport`, `ReportPublisher`, and Incoming are **unchanged**. S7 owns that migration.
- `server.reportPathsForGame()` is additive and reuses the existing scan with `includeContent: false`.
- Coach Routines, its legacy `routine.sources.*` RPCs and `/api/routines/sources/*` routes are untouched.
- S1–S5 Browse, Check, Search, absolute-path resolution and their UI are untouched; `game.files.v1` still advertises.
- A Stadium that predates S6 simply never advertises `game.filesystem.v1`, is never inspected, and keeps working (S6-51).
- No existing test was weakened or deleted.

## 20. TESTS ADDED

**`test/game-filesystem-contract.test.mjs` — 37 tests.** Name recognition (S6-1, S6-2); reports adoption S6-3…S6-17 (Reports-SLC, Reports, Docs REPORT, no candidate, two populated, empty-vs-populated, truncated counts, canonical tie-break, all three names, nested root, file collision, escape, inaccessible, unresolvable root); precedence and vanished roots S6-18…S6-22; SOP S6-23, S6-24; contract application, projection, sanitizing S6-25…S6-28; store S6-29…S6-37 (per-Game independence, durability across replacement, revision discipline, no-evidence, wrong-Game, human precedence, corruption, schema quarantine, single-flight).

**`test/game-filesystem-detection.test.mjs` — 16 tests.** Real fixtures for the four Play §22 shapes (S6-38 Trend-shaped, S6-39 AI-Usage-shaped, S6-40 clean, S6-41 legacy); ambiguity on a real tree (S6-42); file collision (S6-43); junction/symlink escape (S6-44); blocked locations `.git`, `node_modules`, `secrets` (S6-45); nested root adoption and derivation (S6-46, S6-47); bounded counting and truncation (S6-48); unresolvable root (S6-49); wire contract (S6-50…S6-53).

No user machine path is hard-coded; every fixture is a temporary directory removed in `finally`.

## 21. TARGETED TEST RESULTS

```
node --test test/game-filesystem-contract.test.mjs    → 37/37 pass   (143 ms)
node --test test/game-filesystem-detection.test.mjs   → 16/16 pass   (316 ms)
```

S6-44 genuinely exercised the escape path: junction creation was independently confirmed to work in this environment, so the test's skip branch was not taken.

## 22. FULL SUITE RESULT

```
npm.cmd run check      → clean (tsc --noEmit, no errors)
npm.cmd run compile    → clean
npm.cmd test           → 820 pass / 0 fail / 0 skipped / 0 todo   (16.1 s)
git diff --check       → exit 0 (only pre-existing CRLF advisories)
```

## 23. LIVE / MACHINE PROOF

**Automated machine proof:** the wire tests drive the real daemon over HTTP, the real registry/RPC path, and the real filesystem inspector, then assert the Game tree is unchanged (S6-50…S6-53).

**Live proof against a running Game was deliberately NOT performed.** The runtime is not fresh:

| | Build |
|---|---|
| Running Control Plane (`~/.sideline/control-plane.json`, pid 30556) | `cp-68a20c79101b3a88edb8083a` |
| Newly compiled daemon | `cp-8067333f7535c76645922b82` |

The live daemon predates S6, so it has no coordinator and no `game.filesystem.inspect`; `~/.sideline/game-filesystem.json` does not exist yet. Manufacturing proof would have required restarting the human's live Control Plane and reloading Stadiums mid-session, which the Play forbids. Nothing was restarted and no live Game was touched.

**Read-only live proof available after the next normal relaunch:**

```
GET /api/games/filesystem?gameId=<Trend and Tap Assist>
    expect: reports "Reports" · Using existing folder; sop "Onboarding-Docs" · Automatically selected
GET /api/games/filesystem?gameId=<Ai Usage - Real Time>
    expect: reports "Reports" · Using existing folder; sop "Onboarding-SOP" · Automatically selected
```

Both are pure reads. Detection also runs automatically when each Game connects.

## 24. HUMAN FIELD PROOF STATUS

**Not required, and not claimed.** S6 adds no Dad-facing interaction — the Game Setup card is S10. The only human-visible surface is the `gameSetup` field in the status payload, which no UI renders yet.

## 25. BREADCRUMB IMPACT

`Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, in the existing S-slice block beside S1–S5 (the adjacent breadcrumb for this subsystem), gained:

- **`IS (S6)`** — recording only what is proven: durable Game-keyed contract separate from Game identity; Game-relative paths; exact-Game Stadium evidence; read-only Reports/SOP detection; human authority outranking automatic evidence; ambiguity/Unknown/Needs Attention as valid states; and explicitly **no filesystem mutation**.
- **"Still WILL BE after S6"** — `Reports-SLC` creation, Player report lanes, watcher/`reportGlobs` migration, the report-destination footer, and the Settings picker, none promoted.

Each new module also carries its own header breadcrumb explaining why it exists and what it must never do.

## 26. KNOWN CONSTRAINTS

1. **Live runtime is stale** (§23). S6 activates only after a rebuild plus Control Plane replacement and Stadium reconnect.
2. **Nested report-root evidence is bounded** by the existing report scan (200 coordinates, itself capped at 500 files per glob). A working nested root with no currently discovered reports is invisible, and the Game falls to `not-set`. Deliberate: evidence, not speculation.
3. **`pendingReportsAction` is advisory.** Nothing consumes it until S8.
4. **Case-variant folders on a case-sensitive filesystem** (`Reports` and `REPORTS` side by side) are two candidates and resolve to `needs-choice`. The `multiple-case-variants` attention code exists but is reserved for lane work in S8.
5. **Root-level `safety: 'blocked'` is currently unreachable** — no recognized report/SOP name is on the blocklist. The branch is kept as defense in depth if the blocklist ever grows.
6. **Human-choice APIs exist without a route**, by design. Until S10 they can only be exercised by tests.
7. **Multi-root workspaces** remain first-folder-only, unchanged from S1–S5.
8. **Project-global report numbering is unresolved** (§3) and needs a human decision.

## 27. EXACT NEXT SLICE

**S7 — canonical report discovery: `game.filesystem.apply` + watcher rebuild + lane-aware agent label.** It was not started here.

S7 should carry two findings this slice re-confirmed in source:

1. `server.ts:describeReport()` derives the Incoming agent from the first `docs report` / `reports` path segment, so a report under `Reports-SLC/Claude/` or a human-chosen root would display as **"Unknown Agent"**. S7 must resolve the agent from the canonical root first, then fall back to the legacy rule.
2. `src/control-plane/router.ts` (the `buildReportProvenanceInstruction` footer for Controlled Players) remains the seam where the canonical report destination reaches Players. S9 uses the same contract revision the Stadium watches, which is what makes "Player writes here, Incoming scans there" impossible by construction.

────────────────────────────────────────
REPORT FILE:
S6-GameFilesystemContract-Store-Evidence-And-Read-Only-Detection.md

REPORT TIMESTAMP:
2026-09-15 20:04 MDT

REPORT NUMBER / STAGE:
UNKNOWN (project-global chronology ambiguous)

LOCAL SLICE:
S6
────────────────────────────────────────
