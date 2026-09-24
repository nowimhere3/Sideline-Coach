# Scout Reconnaissance Report: Recent Reports Chronology

## RESULT
The current implementation does **not** order reports by true chronology (newest first) across all report producers. Instead, it groups reports by source (scoutReports first, then server reports) and sorts within each group by modification time (mtime) descending. This violates the product contract that "Recent must mean newest eligible report first across ALL supported report producers." A scout report with an older mtime can appear before a server report with a newer mtime due to source priority.

## KEY DISCOVERIES
- **Report discovery occurs in two places**:
  1. **Server scan** (`src/server.ts:scanReportsForGame`): Uses `vscode.workspace.findFiles` with globs to discover report files in the game's report folders, then sorts by file mtime descending.
  2. **Scout intelligence source** (`src/scout-intelligence-report-source.ts:ScoutIntelligenceReportSource.list`): Scans the Scout Intelligence root for formation parents (`**/<id>/FORMATION-RESULT.md`), then sorts by mtime descending and path descending.
- **Report sources that participate**:
  - Server reports: Includes any report file matching the configured globs (regardless of producer: Scout, Claude, Codex, AntiGravity, etc., if placed in the scanned folders).
  - ScoutReports: Combines:
    - *Durable reports*: From the Scout intelligence source (Scout formation parents only).
    - *Registered reports*: From explicit scout formation registrations (via `scoutFormationReports` map).
- **Chronology control**: 
  - Primary timestamp: **filesystem mtime** (modification time) is used in all sources.
  - Server reports: Sorted by mtime descending only (no secondary sort).
  - ScoutReports (durable + registered): Merged then sorted by mtime descending, then path descending for tie-breaking.
- **Sorting timing**: 
  - Each source sorts internally before merging.
  - Final ordering: **[sorted scoutReports] + [server reports (sorted by mtime, filtered to exclude duplicates)]**.
  - Thus, sorting happens **within sources** and **after merging durable/registered** (via `mergeSidelineOwnedParents`), but **not across all sources combined**.
- **Source priority overrides chronology**: ScoutReports are always placed first in the final array, regardless of mtime relative to server reports.
- **Refresh Incoming**: Triggers a full rescan (`stadium-client.ts:publishReportsChanged` → `sendReportSnapshot`), so it does **not** leave cached/stale ordering for reports within each source's limits. However, the per-source limits (10 reports each) may omit newer reports if more than 10 exist in a source.
- **Game switching**: Correctly scoped because the `stadium-client` is bound to the current game context via `gameContextGetter`.

## FACT
- `src/stadium-client.ts:378`: Final report array is constructed as `const reports = [...scoutReports, ...reports.filter((candidate) => !scoutPaths.has(reportPathKey(candidate.path))));` — scoutReports come first.
- `src/scout-intelligence-report.source.ts:96-98`: `mergeSidelineOwnedParents` sorts by `(b.mtime - a.mtime) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0)` — mtime descending, then path descending.
- `src/server.ts:788-789`: `candidates.sort((a, b) => b.mtime - a.mtime);` — mtime descending only.
- `src/extension.ts:228-232`: `reportsGetter` returns `server.scanReportsForGame(gameId, 10)` — limited to 10 server reports.

## INFERENCE
The product contract violation occurs because:
- A scout report with mtime `T_scout` and a server report with mtime `T_server` where `T_server > T_scout` will still result in the scout report appearing first if the scout report is in the scoutReports group and the server report is in the server reports group.
- This happens **regardless of** the actual mtime values due to the hard-coded priority of scoutReports over server reports in the concatenation.
- Tie-breaking within server reports is **non-deterministic** (only mtime sort; equal mtime order depends on unstable sort and filesystem enumeration order).

## UNKNOWN
- Whether the configured `reportGlobs` (used by the server scan) include the folders where non-Scout reports (Claude, Codex, AntiGravity) are stored. If not, those reports would never be discovered by the server, further skewing chronology.

## CONTRADICTION
**CONTRADICTION** exists between the current implementation and the product contract:
- Contract: "Newest eligible report first across ALL supported report producers."
- Reality: ScoutReports are always prioritized over server reports, so an older scout report can appear before a newer server report.

## IMPORTANT FILES / PATHS
- `src/stadium-client.ts` (lines 361-386): `sendReportSnapshot` — report combination logic.
- `src/scout-intelligence-report-source.ts` (lines 88-99): `mergeSidelineOwnedParents` — scoutReports sorting.
- `src/server.ts` (lines 763-817): `scanReports` — server reports sorting.
- `src/extension.ts` (lines 228-232): `reportsGetter` definition.

## SMALLEST REPAIR SEAM
Change the report combination in `src/stadium-client.ts:sendReportSnapshot` from:
```typescript
const reports = [...scoutReports, ...reports.filter((candidate) => !scoutPaths.has(reportPathKey(candidate.path)))];
```
to:
```typescript
// Combine all reports, then sort by mtime descending with deterministic tie-breaker
const allReports = [...scoutReports, ...reports];
const reportPathKey = (r: CoachReportItem) => r.path; // assuming imported
const byPath = new Map<string, CoachReportItem>();
for (const report of allReports) {
    byPath.set(reportPathKey(report), report); // dedup by path (preferring later occurrences? or first? need policy)
}
// Then sort by mtime descending, then path descending (or another deterministic tie-breaker)
const sortedReports = [...byPath.values()].sort((a, b) => 
    (b.mtime - a.mtime) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0)
);
// Apply any global limit if needed (e.g., 20 total)
```

## FOCUSED TEST CONTRACT
A test must verify:
1. **Newest report first**: Create a scout report (mtime=1000) and a server report (mtime=1001) in their respective locations. After a refresh, the server report (newer) must appear first.
2. **Provider type irrelevant**: Create a Claude report (mtime=2000) and a Codex report (mtime=2000) in the server-scanned folders. Their order must be deterministic (e.g., by path) and not influenced by producer type.
3. **Cross-source merge before sort**: Create a scout report (mtime=1500) and a server report (mtime=1500) with paths ensuring the scout report would lose a path-based tie-break. After refresh, the server report must appear first if its path wins the tie-break (proving sources are merged before sorting).
4. **Deterministic tie-break**: For reports with identical mtime, order must be consistent across runs (e.g., lexicographical by path descending).
5. **Refresh Incoming exposes newest**: After creating a new server report with the latest mtime, a Refresh Incoming must show it first (no stale caching).

Stop here. Do not implement fixes. Do not modify files. This is reconnaissance only.
