# SIDELINE COACH — INCOMING REPORTS RECENT CHRONOLOGY REPAIR

**AGENT:** AntiGravity  
**TARGET:** Sideline Coach development source  
**REPO:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`  
**DATE:** 2026-09-22  

---

## 1. EXACT FILE(S) CHANGED

- [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts) (lines 376-379)
- [`test/recent-reports-chronology.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/recent-reports-chronology.test.mjs) (new focused test suite covering all 7 test contracts)

---

## 2. PREVIOUS BEHAVIOR

In [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts), `sendReportSnapshot()` combined Scout reports and filtered server reports via:
```typescript
const scoutReports = mergeSidelineOwnedParents(durable, registered);
const scoutPaths = new Set(scoutReports.map((report) => reportPathKey(report.path)));
reports = [...scoutReports, ...reports.filter((candidate) => !scoutPaths.has(reportPathKey(candidate.path)))];
```
Because Scout reports were placed first in the combined array without a final global sort, Scout reports unconditionally ranked ahead of all server reports (e.g. Claude, Codex, AntiGravity), even when a server report was significantly newer. Producer identity dictated rank rather than true chronology.

---

## 3. NEW BEHAVIOR

The combined report array (consisting of Scout reports and duplicate-filtered server reports) undergoes a single final global sort:
```typescript
const scoutReports = mergeSidelineOwnedParents(durable, registered);
const scoutPaths = new Set(scoutReports.map((report) => reportPathKey(report.path)));
reports = [...scoutReports, ...reports.filter((candidate) => !scoutPaths.has(reportPathKey(candidate.path)))]
  .sort((a, b) => (b.mtime - a.mtime) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
```
Newest report appears first across all producers (Scout, Claude, Codex, AntiGravity, etc.).

---

## 4. EXACT SORT / DEDUP CONTRACT

1. **Duplicate Suppression & Preference:**
   - Server reports whose normalized path matches an existing Scout report path (`reportPathKey(report.path)`) are filtered out.
   - The Scout-owned representation of that path is preserved.
2. **Primary Sort:**
   - Filesystem modification time (`mtime`) descending (`b.mtime - a.mtime`).
   - The most recently modified report is positioned first, regardless of producer/agent.
3. **Deterministic Tie-Break:**
   - When `mtime` values are identical (`b.mtime - a.mtime === 0`), tie-break by path descending (`a.path < b.path ? 1 : a.path > b.path ? -1 : 0`), exactly matching the Scout source convention in `mergeSidelineOwnedParents`.
4. **Excluded Sort Keys:**
   - No sorting by provider, Player, report type, directory source, Scout status, or filename timestamp.

---

## 5. TESTS ADDED / UPDATED

Created [`test/recent-reports-chronology.test.mjs`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/test/recent-reports-chronology.test.mjs) verifying:
1. `Recent-1. Newer server report beats older Scout report`: Scout (`mtime = 1000`) vs Server (`mtime = 2000`) -> Server report ranks #1.
2. `Recent-2. Newer Scout report beats older server report`: Scout (`mtime = 3000`) vs Server (`mtime = 2000`) -> Scout report ranks #1 (proves chronology, not reversed priority).
3. `Recent-3. Producer identity is irrelevant`: Reports from AntiGravity (3500), Scout (2500), Codex (1500), and Claude (500) sort strictly by descending mtime.
4. `Recent-4. Cross-source merge happens before final ordering`: Interleaved mtimes (Scout A: 4000, Server B: 3500, Scout C: 3000, Server D: 2500) sort into sequence `A -> B -> C -> D`.
5. `Recent-5. Equal-mtime tie is deterministic using path descending`: Identical mtime reports tie-break deterministically by descending path regardless of insertion order.
6. `Recent-6. Duplicate path behavior survives`: Colliding paths collapse to 1 report, preserving the Scout-owned representation.
7. `Recent-7. Refresh still exposes newest report at position 1`: `publishReportsChanged()` pushes a newly arrived report to position 1 on rescanning.

---

## 6. COMMANDS RUN & RESULTS

1. `npm run compile`
   - **Result:** Success (code 0).
2. `node --test test/recent-reports-chronology.test.mjs`
   - **Result:** 7/7 tests passed (duration ~145ms).
3. `node --test test/scout-durable-report-source.test.mjs test/p0-incoming-reports.test.mjs test/s7-canonical-report-discovery.test.mjs test/recent-reports-chronology.test.mjs`
   - **Result:** 35/35 tests passed (duration ~714ms).
4. `npm test` (Full test suite execution)
   - Identified preexisting baseline failures in unrelated modules; our focused repair and related suites are 100% green.

---

## 7. UNRELATED FAILURES IN BASELINE

Baseline failures in the existing workspace (not touched, per instructions):
- `test/q2-10c-work-ledger.test.mjs` (Q2.10C-U3 human confirm assertion)
- `test/q2-10f-2-completion-report-ready-acknowledgement.test.mjs` (E-24 production interval count)
- `test/q2-10f-2-team-activity-player-strips.test.mjs` (C-18 interval count)
- `test/q2-10f-3-dad-mode-projection-friendly-labels.test.mjs` (F.3-6 TypeError reading property of null)

---

## 8. WAS / IS / WILL BE

- **WAS:** `sendReportSnapshot` in [`src/stadium-client.ts`](file:///C:/Users/dmcal/Documents/GitHub/SidelineCoach/src/stadium-client.ts) concatenated `[...scoutReports, ...filteredServerReports]` without a global sort, allowing older Scout reports to shadow newer server reports.
- **IS:** `sendReportSnapshot` concatenates and executes a global descending `mtime` sort across the combined report population with a deterministic descending `path` tie-break.
- **WILL BE:** Reports appear in true chronological order in Recent incoming reports across all report producers.

---

## 9. CONFIRMATION NO COMMIT / PUSH

- **Git Commit:** NOT executed.
- **Git Push:** NOT executed.
- Work remains purely in working tree and compiled build output.
