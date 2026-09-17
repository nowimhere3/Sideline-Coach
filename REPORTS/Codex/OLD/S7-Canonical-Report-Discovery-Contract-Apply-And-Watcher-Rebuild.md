REPORT FILE:
S7-Canonical-Report-Discovery-Contract-Apply-And-Watcher-Rebuild.md

REPORT TIMESTAMP:
2026-09-15 20:43 MDT

REPORT NUMBER / STAGE:
UNKNOWN (project-global chronology unresolved)

LOCAL SLICE:
S7

REPORT TITLE:
S7 — Canonical Report Discovery, Contract Apply And Watcher Rebuild

# 1. REPORT IDENTITY

Agent: Codex. Role: Implementer. Repository: `SidelineCoach`. Branch: `q2.8-multigame-field-debug`. This report covers only local architecture slice S7.

# 2. VERDICT

PASS. A ready `GameFilesystemContract.reports` coordinate now crosses the exact-Game Control Plane → Stadium boundary, becomes an anchored canonical scan/watch pattern, rebuilds live watchers on a newer effective root, immediately republishes Incoming, and supplies canonical-root-aware agent attribution. Legacy/custom `coach.reportGlobs` remain additive compatibility. S7 creates, moves, renames, and deletes no Game files or folders.

# 3. PROJECT-GLOBAL NUMBER / LOCAL S7 IDENTITY

No new authoritative project-global ledger or counter exists. The project-global report number remains `UNKNOWN (project-global chronology unresolved)`. The stable local identity is S7. No earlier report was renamed or renumbered.

# 4. ARCHITECTURE USED

Authoritative source: `REPORTS/Claude/Opus-Game-Filesystem-Browse-Search-And-Bootstrap-Architecture.md`, especially §11.1–§11.6, §21, §23 Incoming tests, and the S7 slice definition. The complete S6 implementation report was also read before edits.

The implementation follows the architecture decisions: Control Plane durability; memory-only Stadium projection; minimal exact-Game apply payload; revision ordering; anchored `RelativePattern`; additive legacy globs; canonical-first lane labeling; rebuild then immediate republish; no S8/S9 behavior.

# 5. WORKTREE SAFETY

The expected branch was confirmed. The worktree already contained substantial S1–S6 and unrelated active changes, including historical report moves/deletions. No reset, restore, stash, clean, branch switch, commit, push, historical renumbering, or unrelated rewrite was performed.

# 6. FILES CREATED

- `src/stadium-filesystem-contract.ts` — memory-only applied-contract cache, revision guard, path validation, canonical lane attribution.
- `test/s7-canonical-report-discovery.test.mjs` — focused cache, exact-Game, watcher, no-mutation, and real-wire proof.
- `REPORTS/Codex/S7-Canonical-Report-Discovery-Contract-Apply-And-Watcher-Rebuild.md` — this report.

# 7. FILES MODIFIED

- `src/control-plane/protocol.ts` — minimal S7 apply request/result types.
- `src/control-plane/daemon.ts` — exact authoritative Stadium apply, reconnect/change convergence, mixed-version diagnostics.
- `src/stadium-client.ts` — apply capability and exact-Game apply handler.
- `src/extension.ts` — shared cache, apply callback, canonical watcher host, apply acknowledgement after rebuild/rescan.
- `src/server.ts` — canonical-plus-legacy scanning patterns and canonical-first agent label.
- `src/report-publisher.ts` — pattern support, runtime rebuild/republish, watcher generation guard, serialized publishing.
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — central proven S7 boundary and remaining future slices.

# 8. CONTRACT APPLY PROTOCOL

The new RPC is `game.filesystem.apply` and is advertised as `game.filesystem.apply.v1`. Its payload contains only `gameId`, contract `revision`, `reports.path`/`reports.state`, and report `lanes`. It sends no absolute machine root, registry, filesystem contents, SOP contents, or other Game contracts.

The Control Plane resolves only `getAuthoritativeSessionForGame(contract.gameId)`. Apply runs after durable decision changes, after Game reconnect reconciliation even when the decision did not change, and after the existing reinspect route succeeds.

# 9. REVISION / STALE-APPLY SAFETY

The Stadium cache accepts a newer revision, treats the same revision as idempotent, ignores an older revision, and refuses a different Game once bound. `withExactGame` rejects a wrong `gameId` before the apply callback executes. Reconnect reprojects the durable current revision. Duplicate delivery is harmless and message arrival order cannot resurrect an obsolete root.

The cache has no store, memento, or serialization adapter. The Control Plane remains the only durable owner.

# 10. CANONICAL REPORT ROOT PRECEDENCE

When `reports.state === 'ready'` and the path is a safe Game-relative coordinate, that path is canonical context and contributes an anchored watcher/scanner pattern. `not-set`, `needs-choice`, `needs-attention`, and `unknown` contribute no canonical pattern and do not guess or create a fallback root.

# 11. LEGACY reportGlobs COMPATIBILITY

The exact Opus migration rule is implemented:

`effective patterns = canonical anchored RelativePattern ∪ effective coach.reportGlobs`.

Explicit `coach.reportGlobs` remain honored additively and are never rewritten. When no explicit values exist, the existing `Docs REPORT` and `Reports` defaults remain. URI deduplication in the existing scanner prevents duplicates. Canonical context wins for labeling; the legacy path rule is second precedence.

# 12. CANONICAL SCANNER

`CoachServer.reportPatterns()` builds `new vscode.RelativePattern(vscode.Uri.joinPath(workspaceFolder.uri, ...reportsPathSegments), '**/*.{md,txt}')`. This supports `Reports`, `Docs REPORT`, `Reports-SLC`, nested roots such as `docs/Reports`, custom roots, spaces, and glob-significant folder characters without assuming a root-level conventional name.

Existing extension limits, mtime ordering, content reads, maximum size, report limit, provenance parsing, and Incoming payload shape are unchanged.

# 13. WATCHER REBUILD / REPUBLISH

An effective canonical-root change invokes `ReportPublisher.rebuildAndPublish('report-root-changed')`: old watchers are disposed, current patterns are installed, and a fresh report snapshot is published before apply acknowledgement. Configuration changes still rebuild and republish.

Watcher callbacks carry a generation and obsolete generations stay silent. Publish work is serialized so an older scan cannot become the final published state after its replacement. Shutdown disposes configuration and filesystem watchers. Publish failures remain non-crashing and retry on later events/rescan.

# 14. LANE-AWARE AGENT ATTRIBUTION

For a path below the applied canonical root, the first segment below that root is the agent/provider. A case-insensitive match to an applied lane folder normalizes to its lane key. A report directly under the root returns `Unknown Agent`; filenames never fabricate an agent. Paths outside canonical context fall back to the existing `Reports` / `Docs REPORT` segment rule.

Automated cases cover `Reports-SLC/Claude`, custom `Codex`, nested `AntiGravity`, direct-root files, and legacy roots.

# 15. EXACT-GAME ISOLATION

Apply resolves and addresses one authoritative Stadium by the contract's `gameId`; browser selection and VS Code `globalState` do not participate. The two-Game wire fixture proves Game A's canonical watcher/report event does not alter Game B's reports or applied revision.

# 16. MIXED-VERSION BEHAVIOR

A Stadium without `game.filesystem.apply.v1` receives no apply and stays on legacy report behavior. The Control Plane logs that apply is unsupported instead of claiming activation. A newer Stadium connected to an older Control Plane receives no apply and likewise retains legacy behavior. Apply errors are logged, durable S6 state is preserved, and reconnect retries convergence.

# 17. NO-MUTATION PROOF

The real-wire fixture snapshots both temporary Game trees byte-for-byte before connect/apply and after apply/scan/watch activation. Both remain identical. No production S7 code calls `mkdir`, write, rename, move, or delete against a Game.

# 18. PLAYER-DESTINATION STATUS

Unchanged and deliberately deferred. `buildReportProvenanceInstruction` and Player report destinations were not modified. The later S9 slice must consume the same contract coordinate.

# 19. OUT-OF-SCOPE CONFIRMATION

S7 does not consume `pendingReportsAction`, create `Reports-SLC`, create Player lanes, mutate SOP content, add Settings UI/routes, implement a folder picker, change report payload semantics, or implement multi-select V2.

# 20. TESTS ADDED

Five focused S7 tests:

- S7-1: newer/same/stale/cross-Game revision behavior, unsafe path rejection, memory-only state.
- S7-2: conventional, canonical, nested, custom, direct-root, filename, lane-normalization, and unusable-state attribution.
- S7-2b: wrong-Game Stadium apply rejected before callback.
- S7-3: watcher creation, revision rebuild, disposal, immediate republish, live event, stale watcher silence.
- S7-4: real Control Plane/Stadium wire, durable apply, temp filesystem scan/watch, API convergence, two-Game isolation, no mutation.

# 21. TARGETED TEST RESULTS

Final focused S7 run: `5 pass / 0 fail / 0 skipped / 0 todo`.

Broader targeted run before the final added wrong-Game case: S6 contract + S6 detection + P0 Incoming + S7 produced `65 pass / 0 fail / 0 skipped / 0 todo`. The final wrong-Game case also passes independently and is included in the final full suite.

# 22. FULL SUITE RESULT

- `npm.cmd run check` — PASS, no TypeScript errors.
- `npm.cmd run compile` — PASS.
- `npm.cmd test` — PASS: `831 pass / 0 fail / 0 skipped / 0 todo`.
- `git diff --check` — PASS (exit 0); only pre-existing line-ending advisories were printed.

# 23. LIVE / MACHINE PROOF

Machine proof PASS. The real-wire fixture starts the actual Control Plane daemon, connects two actual `StadiumClient` instances, loads two durable Game contracts, applies each exact revision, scans real temporary report trees, publishes the existing canonical report through the real report RPC/registry path, verifies `/api/reports?gameId=...`, creates a new temporary canonical report, receives a real filesystem watcher event, republishes, and proves the exact Game API converges while the sibling Game remains unchanged.

Live human-project proof was not attempted because the running daemon is stale: live build `cp-68a20c79101b3a88edb8083a` (PID 30556) versus compiled build `cp-c2ce07737e1e937f24ab2ce5`. Nothing was restarted and no human Game/report was touched.

# 24. HUMAN FIELD PROOF STATUS

NOT PERFORMED and not claimed. After the next normal fresh activation: select Trend and Tap Assist, confirm an existing `Reports/<Agent>/` report appears with the correct agent, allow a legitimate new report to arrive, confirm automatic Incoming update, then switch Games and confirm isolation.

# 25. BREADCRUMB IMPACT

The local report subsystem headers/caches explain the memory-only ownership and watcher lifecycle. The central architecture breadcrumb now records as IS only: exact-Game apply, revision guards, ready canonical root scanning/watching, rebuild/republish, canonical lane attribution, additive legacy compatibility, and no Game mutation. Creation, lanes, Player destination, Settings, and multi-select remain WILL BE.

# 26. KNOWN CONSTRAINTS

1. The live daemon is stale, so live/human proof awaits a normal Freshness Guard relaunch and Stadium reconnect.
2. Legacy/default globs intentionally remain additive; historical reports outside the canonical root can still appear per Opus V1 compatibility.
3. Apply operational failures are logged and retried on reconnect; there is no new Dad-facing diagnostics UI in S7.
4. Canonical lane records are consumed if present, but S7 never creates them; S8 owns that mutation.
5. Multi-root workspaces retain the existing first-workspace-folder behavior.

# 27. EXACT NEXT SLICE

S8 — `Reports-SLC` creation + roster lanes. It adds the narrowly allowed `game.filesystem.ensure` mutation, creates only the canonical root when required, creates only roster-required lane folders, verifies results, remains idempotent, and never deletes or renames history. S8 was not started here.

────────────────────────────────────────
REPORT FILE:
S7-Canonical-Report-Discovery-Contract-Apply-And-Watcher-Rebuild.md

REPORT TIMESTAMP:
2026-09-15 20:43 MDT

REPORT NUMBER / STAGE:
UNKNOWN (project-global chronology unresolved)

LOCAL SLICE:
S7
────────────────────────────────────────
