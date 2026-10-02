# SCOUT REPORT
REPORT TYPE: SCOUT REPORT
AGENT: claude-freshness-ui-diff
MODEL: openrouter/nvidia/nemotron-3-super-120b-a12b:free
REASONING EFFORT: Medium
SCOUT DEPTH: Standard
COVERAGE: Claude-specific freshness/rendering path, comparison with S57.38 findings, provider/UI differential, gating mechanisms, acquisition defect analysis.
LIMITATIONS: Did not inspect live runtime logs or telemetry; did not verify actual error rates in Claude usage reader; did not inspect the exact UI rendering code in index.html (relied on test harness and SOP); did not confirm whether SIDELINE_CLAUDE_USAGE=0 in the environment under investigation.

## RESULT
The stale Claude scoreboard is likely due to a **separate Claude acquisition defect** (gated reads or lack of periodic reads) rather than a shared freshness defect. The freshness architecture shared with Codex (verifiedAt/providerFreshness) is functioning correctly per S57.38, but Claude’s reader lacks the periodic read and healing mechanisms that Codex enjoys when enabled, making it vulnerable to extended staleness during gating intervals or idle periods.

## KEY DISCOVERIES
- FACT: S57.38 introduced `verifiedAt` (last trusted confirmation) and the `providerFreshness` function, which AlarmEngine, routing economics, and UI projection all use for freshness determinations (health-authority.ts:637-651). This ensures unchanged reads update freshness (via `markVerified`) even when `observedAt` does not change.
- FACT: Claude’s `ingestClaudeUsage` updates `verifiedAt` on every successful read (changed or unchanged), preventing UNKNOWN from unchanged reads alone (health-authority.ts:187-215; claude-usage-reader.ts:242-248, 463-477).
- FACT: The ClaudeUsageReader implements provider-directed (HTTP 429 with Retry-After) and Sideline fallback (other errors) gates that suppress real acquisitions and prevent `ingestClaudeUsage` calls during gating intervals (claude-usage-reader.ts:412-447, 479-509). On gating, `applyGatedOutcome` updates status but does not call `ingestFn`.
- FACT: Codex, when enabled, gains a `UsageFreshnessCoordinator` that provides periodic reads and stale/reset healing independent of manual/activity triggers (daemon.ts:590-594). Claude has no equivalent coordinator; it relies solely on manual/activity-driven reads and the daemon’s preference-driven cadence.
- FACT: The UI receives freshness via SSE-broadcast `projectAiHealth`, which adds a `freshness` block derived from `providerFreshness` to the health authority snapshot (daemon.ts:3823-3831). UI rendering depends on this freshness (inferred from ai-usage-scoreboard-ui.test.mjs).
- INFERITION: The 5H value changing from 19% to 31% indicates successful reads occurred, but the scoreboard staleness suggests those reads were not frequent enough to keep `verifiedAt` within `maxStaleAgeMinutes`—likely due to gating or long intervals between manual/activity-driven reads.
- INFERITION: S57.38’s fixes (verifiedAt/providerFreshness) already resolve the Claude-specific issue of UNKNOWN from unchanged reads (health-authority.ts:9, 55, 117; comment: “an unchanged replay still calls onChange because FRESHNESS (verifiedAt) moved”). What remains unaddressed is Claude’s acquisition reliability.

## PROVIDER/UI DIFFERENTIAL
- **Provider (HealthAuthority)**: Updates `verifiedAt` on every successful Claude read (changed or unchanged) via `ingestClaudeUsage` → `markVerified`. Freshness is computed from `verifiedAt` (with `observedAt` fallback) via `providerFreshness`.
- **UI (Scoreboard)**: Renders usage percentages only when `freshness.current === true` (derived from `providerFreshness` in `projectAiHealth`). No differential treatment between Claude and Codex in the UI freshness path.
- **Difference**: Claude lacks Codex’s periodic read/healing mechanism (UsageFreshnessCoordinator) when Codex is enabled. Claude’s acquisition depends entirely on manual/activity-driven reads and preference-driven cadence, leaving it vulnerable to gating-induced gaps. Codex, when enabled, gets periodic reads that keep `verifiedAt` fresh even during manual/activity lulls.

## WHAT S57.38 ALREADY FIXES INCIDENTALLY
- S57.38’s introduction of `verifiedAt` and the `providerFreshness` function (health-authority.ts:620-651) ensures that unchanged Claude reads still advance freshness, preventing UNKNOWN from unchanged-read suppression alone. This incidentally fixes the Claude-specific issue noted in S57.38 §125: “without `verifiedAt` Claude would go UNKNOWN whenever Dad is idle.”

## WHAT S57.38 DOES NOT FIX
- S57.38 does not address Claude’s susceptibility to extended gating from provider-directed (HTTP 429) or Sideline fallback gates, which can suppress real acquisitions for minutes or hours (claude-usage-reader.ts:412-447, 479-509).
- S57.38 does not provide Claude with a periodic read/healing mechanism analogous to Codex’s UsageFreshnessCoordinator, leaving Claude dependent on manual/activity triggers for freshness updates.
- S57.38 does not guarantee that the UI will correctly render fresh data if the SSE broadcast or UI projection fails (though no evidence suggests this).

## EXACT FILES/SYMBOLS AGY SHOULD INSPECT
- `src/control-plane/claude-usage-reader.ts`:
  - `ClaudeUsageReader.applyOutcome` (success path clears gates)
  - `ClaudeUsageReader.applyGatedOutcome` (gating suppresses `ingestFn`)
  - `ClaudeUsageReader.read` (provider-directed and Sideline fallback gates)
  - `ClaudeUsageReader.refresh` (manual bypass of fallback gate only)
- `src/control-plane/daemon.ts`:
  - ClaudeUsageReader instantiation and `options.claudeUsage?.enabled` check (lines 560-568)
  - UsageFreshnessCoordinator instantiation conditioned on `options.codexUsage?.enabled === true` (lines 590-594) — highlighting lack of Claude equivalent
- `src/control-plane/usage-freshness-coordinator.ts`:
  - Coordinator that arms stale/reset deadlines and triggers periodic reads (lines 45-117) — absent for Claude
- `src/control-plane/health-authority.ts`:
  - `markVerified` (line 170-178) and `providerFreshness` (line 637-651) — confirm shared freshness correctness
- `src/control-plane/alarm-engine.ts`:
  - `normalizeAlarmFacts` uses `providerFreshness` (line 256-257) — confirm alarm freshness shares UI logic

## SHARED vs SEPARATE DEFECT
- **Shared freshness defect?** NO. The freshness architecture (verifiedAt/providerFreshness) is shared and functioning correctly per S57.38 tests and code. Both Claude and Codex benefit from `verifiedAt` updates on successful reads.
- **Separate Claude acquisition defect?** YES. Claude’s acquisition path lacks periodic read/healing and is prone to gating-induced gaps, while Codex (when enabled) gains the UsageFreshnessCoordinator for autonomous freshness maintenance. This explains why Claude’s scoreboard may stale despite occasional successful reads (e.g., 5H value changing from 19% to 31%)—the reads are too infrequent to counter gate-induced downtowns.

## CONCLUSION
The stale Claude scoreboard is best explained by a Claude-specific acquisition defect: the acquisition defect (gated reads or insufficient periodic reads) rather than a shared freshness flaw. S57.38’s fixes ensure that when reads succeed, freshness is updated correctly; however, Claude’s reader is not guaranteed to succeed often enough to keep `verifiedAt` within `maxStaleAgeMinutes` due to gating and lack of autonomous periodic reads. AGY should inspect the ClaudeUsageReader’s gating logic and consider adding a periodic read/healing mechanism for Claude analogous to Codex’s UsageFreshnessCoordinator.
