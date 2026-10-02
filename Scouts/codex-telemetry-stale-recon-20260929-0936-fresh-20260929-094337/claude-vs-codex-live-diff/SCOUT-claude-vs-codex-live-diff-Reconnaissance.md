**RESULT**  
The live‑usage pipelines for Claude and Codex are asymmetric: Claude runs a background polling loop (with activity‑driven early reads) that keeps its usage fresh even when Claude is used outside Sideline, whereas Codex has no background polling and relies solely on manual refresh or activity‑driven reads. This asymmetry explains why Claude appears current while Codex can become stale, producing the observed discrepancy where the global AI Usage (reflecting the last successful Codex read) shows high usage (≈96 %) while the VS Code surface (which may be driven by a more immediate source or a different code path) shows lower usage (≈75 %/93 %).  

**KEY DISCOVERIES**  

- **ClaudeUsageReader** implements a periodic polling loop (setTimeout chain) with a configurable cadence (default 5 min, allowed values [3,5,10,15] min) and an activity‑driven early‑read path (`watchClaudeActivity`). It honors provider‑directed gates (Retry‑After) and an internal Sideline fallback gate, and tracks a `rate_limited` state.  
  - *Evidence*: `src/control-plane/claude-usage-reader.ts` lines 24‑26 (cadence rationale), line 27‑30 (cadence constants), lines 320‑355 (`start()` and scheduling), lines 340‑367 (`noteClaudeActivity`).  

- **CodexUsageReader** has **no periodic polling loop**; it only provides manual `refresh()` and activity‑driven reads via `watchCodexActivity` (size‑based scan of session rollout files). It lacks provider‑directed gate handling (no `rate_limited` state) and its status model only includes `idle`, `ok`, `unavailable`.  
  - *Evidence*: `src/control-plane/codex-usage-reader.ts` lines 1‑6 (comment stating “provides manual Refresh … without … background polling loop”), lines 176‑179 (activity constants), lines 196‑237 (`watchCodexActivity`), lines 285‑301 (`noteCodexActivity`), absence of any `setInterval`/`setTimeout`‑based polling logic.  

- Both readers feed the **HealthAuthority** (`ingestClaudeUsage` for Claude, `ingest` for Codex) which updates `observedAt` and `rateLimitInfo`. The `/api/ai‑health` endpoint returns the acquisition status for each provider, showing that Claude can report `rate_limited` while Codex cannot.  
  - *Evidence*: `src/control-plane/daemon.ts` lines 1928‑1938 (GET `/api/ai‑health` returns `acquisition.claude` and `acquisition.codex`).  

- The UI (e.g., status bar, AI Usage Global) ultimately derives usage percentages from the HealthAuthority snapshot (via the `/api/ai‑health` endpoint). If Codex is not refreshed, its windows become stale, causing the displayed percentages to lag.  

**FACT**  
- ClaudeUsageReader contains a scheduled polling loop (`setTimeout` chain) that runs at least every 3 minutes (configurable).  
- CodexUsageReader contains no scheduled polling loop; it only reads on manual `refresh()` or when `watchCodexActivity` detects file‑size growth.  

**INFERENCE**  
- The observed staleness of Codex usage (global AI Usage showing 96 %/96 % while the VS Code surface shows lower percentages) is most likely caused by missing background polling for Codex, allowing its usage data to age when there is no recent Codex activity to trigger the watcher.  
- The VS Code surface may be reflecting usage from a more transient source (e.g., a live Player terminal or a per‑Game read) that updates more frequently, whereas the Global AI Usage reflects the slower‑to‑update HealthAuthority state.  

**UNKNOWN**  
- Whether the `watchCodexActivity` size‑scanner is failing in practice on Windows (due to anti‑virus, file‑system latency, or timezone‑directory mismatches) cannot be confirmed without runtime observation.  
- The exact UI path that yields the “Codex native VS Code surface” percentages (75 %/93 %) is not visible in the current source tree; it may reside in a webview or extension UI not included in the provided files.  

**CONTRADICTION**  
- No direct contradiction was found; the code consistently shows Claude with polling and Codex without.  

**IMPORTANT FILES / PATHS**  
- `src/control-plane/claude-usage-reader.ts` – Claude periodic polling and activity‑driven read logic.  
- `src/control-plane/codex-usage-reader.ts` – Codex manual‑refresh‑only design and activity watcher.  
- `src/control-plane/daemon.ts` – `/api/ai‑health` endpoint that surfaces acquisition status for both providers.  
- `src/control-plane/health-authority.ts` – Ingestion functions that store usage windows and `observedAt`.  

**GOVERNING INVARIANTS (as specified by current architecture)**  
- **Claude**: usage should be kept current via automatic periodic reacquisition (polling) supplemented by activity‑driven early reads (stale→automatic reacquisition).  
- **Codex**: usage should be updated only on manual refresh or when activity is detected (stale→manual refresh or activity‑driven read); the architecture explicitly states there is **no background polling loop**.  

Thus, the existing architecture already specifies different invariants per provider; to eliminate the staleness discrepancy one would either ensure the Codex activity watcher is reliable (or replace it with a polling loop) or accept that Codex usage will remain stale until the next manual refresh or activity trigger.  

---  
*Scout ID: claude-vs-codex-live-diff*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  
*This is reconnaissance, not final architectural authority.*
