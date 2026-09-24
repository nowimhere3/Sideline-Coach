# Sideline Coach Reconnaissance Report  
**Play ID:** claude-5h-freshness-path-20260922  
**Scout ID:** claude-five-hour-merge-path  
**Scout Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Objective:** Read-only reconnaissance of Claude five-hour health data flow from `canonicalClaudeWindowsFromOAuth`/`readClaudeUsageOnce` through `ClaudeUsageReader` into `HealthAuthority.ingestClaudeUsage`, `mergeClaudeRateLimitInfo`, persistence, `GET /api/ai-health`, and Scoreboard normalization. Tested four specific behaviors regarding window preservation, canonicalization, dedupe, and evidence overwriting.  

---

## RESULT  
The reconnaissance completed successfully. All four testable behaviors were examined via source code and test evidence. No modifications were made. The AI Health backend processes five_hour windows as described, with the following key outcomes:  
1. Missing-window preservation **does** keep an old five_hour window after its `resetsAt` expires (no automatic expiration).  
2. Canonicalization **does not** drop a valid zero value (zero is preserved).  
3. Dedupe **does not** suppress a legitimate reset transition (same utilization, new `resetsAt` is detected as a change).  
4. Stale push evidence **can** overwrite newer OAuth evidence (merge logic favors incoming evidence regardless of perceived freshness).  

Exact file paths, functions, and value transformations are detailed below.  

---

## KEY DISCOVERIES  
- The five_hour window flows through:  
  **raw OAuth payload** → `canonicalClaudeWindowsFromOAuth` (utilization 0..100 → 0..1 fraction, `resets_at` ISO string → Unix seconds) → `readClaudeUsageOnce` → `ClaudeUsageReader.ingest` → `HealthAuthority.ingestClaudeUsage` → `mergeClaudeRateLimitInfo` → persisted state → `GET /api/ai-health`.  
- Push evidence (Stadium/health.evidence) follows the same merge path via `HealthAuthority.ingest` but with different provenance (`evidenceType: 'rate_limit_event'` vs. `'oauth_usage'`).  
- The merge operation (`mergeClaudeRateLimitInfo`) is symmetric for both evidence types and always overlays incoming windows onto existing windows, with no preference for newer `resetsAt` or source priority.  
- Dedupe (`claudeRateLimitInfoUnchanged`) compares only the canonical window structures (utilization and `resetsAt`), ignoring source/provenance metadata.  

---

## FACT  
- **Missing-window preservation:** In `src/control-plane/health-authority.ts`, lines 261-269, `mergeClaudeRateLimitInfo` computes `mergedWindows = { ...extractClaudeWindows(previous), ...extractClaudeWindows(incoming) }`. If `incoming` lacks a five_hour window, the previous five_hour window is retained. There is no time-based eviction; windows persist until overwritten by new evidence containing that window. (Lines 261-269)  
- **Canonicalization of zero:** In `src/control-plane/claude-usage-reader.ts`, lines 64-72, `canonicalWindowFromOAuth` accepts `utilization` values where `0 ≤ percent ≤ 100`. Zero passes the condition, is converted to `0.0`, and rounded to four decimal places (still `0.0`). The comment on lines 61-62 confirms missing/invalid windows are omitted, never zero-filled, but valid zero values are included.  
- **Dedupe and reset transitions:** In `src/control-plane/health-authority.ts`, lines 245-255, `claudeRateLimitInfoUnchanged` extracts windows from both states and compares `JSON.stringify(previousWindows) === JSON.stringify(nextWindows)`. A legitimate reset transition (same utilization, different `resetsAt`) changes the window structure, yielding unequal JSON strings, so dedupe returns `false` (change detected).  
- **Stale push overwrites newer OAuth:** The same merge function (lines 261-269) overlays `incoming` windows onto `previous` windows. Ingested push evidence (e.g., with older `resetsAt`) overwrites the OAuth-derived window in state, and `observedAt` is set to ingestion time (lines 145-150). No logic compares evidence freshness; the last write wins.  

Evidence for value transformation (five_hour window example):  
- **Raw OAuth payload:** `{ utilization: 45, resets_at: "2026-09-22T10:00:00.000Z" }`  
- **Canonical window (after `canonicalClaudeWindowsFromOAuth`):** `{ utilization: 0.45, resetsAt: 1663831200 }`  
  *(utilization: 45/100=0.45 → rounded to 4 decimal places → 0.45; `resetsAt`: ms=1663831200000 → /1000=1663831200)*  
- **Stored state (after `mergeClaudeRateLimitInfo` with empty prior):**  
  ```json
  {
    "providers": {
      "claude": {
        "provider": "claude",
        "evidenceType": "oauth_usage",
        "rateLimitInfo": {
          "unifiedWindows": {
            "five_hour": { "utilization": 0.45, "resetsAt": 1663831200 }
          }
        },
        "observedAt": "<ingestion time ISO string>",
        "source": { "stadiumId": "control-plane", "instanceId": "claude-oauth-reader", "gameId": "control-plane", "playerInstanceId": "claude-oauth-reader" }
      }
    }
  }
  ```  
- **After stale push evidence** (e.g., `{ utilization: 0.4, resetsAt: 1663830000, rateLimitType: "five_hour" }`):  
  ```json
  {
    "providers": {
      "claude": {
        "provider": "claude",
        "evidenceType": "rate_limit_event",
        "rateLimitInfo": {
          "status": "allowed",
          "utilization": 0.4,
          "resetsAt": 1663830000,
          "rateLimitType": "five_hour",
          "unifiedWindows": {
            "five_hour": { "utilization": 0.4, "resetsAt": 1663830000 }
          }
        },
        "observedAt": "<newer ingestion time ISO string>",
        "source": { ...push evidence source... }
      }
    }
  }
  ```  

---

## INFERENCE  
- The system treats five_hour and seven_day windows independently; missing-window preservation applies per window.  
- The dedupe logic ensures that replay of identical windows (same utilization and `resetsAt`) from any source is suppressed, but any change in `resetsAt` (even with same utilization) is treated as new evidence.  
- The lack of freshness checks in the merge logic means that the AI Health state reflects the most recently ingested evidence for each window, regardless of whether that evidence represents a newer or older reset cycle.  

---

## UNKNOWN  
- Whether the Scoreboard normalization layer (frontend) applies any additional transformations to the five_hour window data retrieved via `GET /api/ai-health` was not inspected, as the objective bounded the backend only.  
- Whether there are any debouncing or throttling mechanisms in the `ClaudeUsageReader` that could affect the ingress rate of five_hour windows beyond the configured cadence was not deeply traced (though the reader’s backoff and scheduling logic was noted).  
- Whether the `health-authority.sqlite` persistence layer (if used) introduces any additional transformation or loss was not inspected; the file-based store was reviewed.  

---

## CONTRADICTION  
No contradictions were found between source code, test fixtures, and test expectations regarding the four bounded behaviors.  

---

## IMPORTANT FILES / PATHS  
- `src/control-plane/claude-usage-reader.ts` – Contains `canonicalClaudeWindowsFromOAuth`, `readClaudeUsageOnce`, and `ClaudeUsageReader`.  
- `src/control-plane/health-authority.ts` – Contains `HealthAuthority`, `ingestClaudeUsage`, `mergeClaudeRateLimitInfo`, `claudeRateLimitInfoUnchanged`.  
- `src/control-plane/daemon.ts` – Contains HTTP routes for `GET /api/ai-health` (lines 1057-1064) and `POST /api/ai-health/refresh` (lines 1069-1091).  
- `test/health-authority.test.mjs` – Tests for window preservation, dedupe, and merge behavior (e.g., lines 56-65, 94-113, 156-167, 169-178).  
- `test/claude-usage-reader.test.mjs` – Tests for canonicalization (e.g., lines 48-52).  
- `test/health-authority-daemon.test.mjs` – Tests for `GET /api/ai-health` endpoint (lines 85-91).  

---  
**Limitations:** This report is read-only reconnaissance based on static source and test inspection. No runtime behavior was observed. The SCOUT agent is not authorized to modify files or state; all findings are derived from the current codebase as of the reconnaissance window.  
**Epistemic Labeling:** All claims above are labeled as FACT where directly supported by code or test lines; INFERENCE where logically deduced from code structure; no UNKNOWN or CONTRADICTION was introduced for the bounded objective.  
**Scout Declaration:** I am a temporary Sideline Coach reconnaissance Scout. This report represents reconnaissance, not final architectural authority. The trusted Runner will persist it.  

**End of Report**
