# Sideline Coach Reconnaissance Report
**Scout ID:** health-distribution-api-sse  
**Assigned Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Play ID:** ai-health-play4-authority-map-20260921-193356  
**Timestamp:** Mon Sep 21 2026  

## RESULT
No existing HTTP route registration for `GET /api/ai-health` or an `ai-health` server‑event/SSE endpoint is present in the Sideline Coach codebase. The JSON API response pattern, SSE mechanics, client‑connection helpers, and shutdown behavior are observable via other endpoints (e.g., `/api/events`, `/api/status`). No tests specifically target the ai‑health route because it does not exist.

## KEY DISCOVERIES
- The server defines a generic SSE endpoint at `/api/events` (server.ts lines 389‑392) using the `openEventStream` method and a `broadcast` helper (lines 912‑921).  
- JSON responses follow a consistent `{ success: boolean, ... }` pattern, implemented via the private `json` method (lines 959‑967).  
- SSE client connections are tracked in a `Set<http.ServerResponse>` (line 51) and cleaned during `stop()` (lines 112‑133).  
- No references to `/api/ai-health` or ai‑health‑specific SSE routes exist in source files (grep returned 0 matches in `src/`).  
- Test suites mock various API endpoints (e.g., `/api/status`, `/api/reports`, `/api/game/select`) but none reference `/api/ai-health`.

## FACT
- The file `src/server.ts` contains the HTTP server implementation and route registration logic (read directly).  
- Within `src/server.ts`, the `route` method (lines 227‑452) branches on `requestUrl.pathname` and handles paths such as `/api/status`, `/api/events`, `/api/reports`, etc. No branch matches `/api/ai-health`.  
- The `json` method (lines 959‑967) serializes payloads as `application/json; charset=utf-8` and sets `success`‑flagged objects.  
- The `openEventStream` method (lines 890‑910) sets `Content-Type: text/event-stream; charset=utf-8` and manages SSE heartbeats.  
- The `broadcast` method (lines 912‑921) sends `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n` frames to all tracked SSE clients.  
- The `stop` method (lines 112‑133) ends all SSE client connections and clears the `sseClients` set.  
- A recursive grep for `/api/ai-health` in the repository root yields zero matches in non‑Scout files (only matches inside the current Scout play’s own documentation).  
- Test files (e.g., `test/coach-routines-v0-slice-d-settings.test.mjs`, `test/coach-routines-human-field-polish.test.mjs`) demonstrate mocking of endpoints like `/api/status`, `/api/reports`, `/api/game/select` but never `/api/ai-health`.

## INFERENCE
- Because the SSE infrastructure (`sseClients`, `openEventStream`, `broadcast`) is already present, adding an ai‑health SSE endpoint would follow the same pattern as `/api/events` (e.g., a new branch in `route` for `/api/ai-health/events` or similar).  
- The JSON response pattern for a new `/api/ai-health` route would likely mirror existing API responses: `{ success: true, ... }` for success and `{ success: false, message: string }` for errors, using the existing `json` helper.  
- The absence of any ai‑health route or tests indicates that Play 4’s intended distribution (`GET /api/ai-health` plus an ai‑health SSE update path) has not yet been implemented in the current codebase.

## UNKNOWN
- Whether the Health Authority daemon (outside the Scout’s bounded objective) already produces a canonical health truth stream that could be consumed by a future `/api/ai-health` route.  
- If there are any internal design documents or tickets specifying the exact shape of the ai‑health JSON payload or SSE event format.  
- Whether any existing middleware (e.g., authentication, rate limiting) would apply to a new `/api/ai-health` route beyond the standard `isAuthorized` check.

## CONTRADICTION
None found. All evidence consistently shows the absence of ai‑health‑specific HTTP/SSE seams.

## IMPORTANT FILES / PATHS
- `src/server.ts` – Contains HTTP route registration, JSON response pattern (`json` method), SSE implementation (`openEventStream`, `broadcast`), and shutdown logic.  
- `src/` (directory) – Searched for `/api/ai-health`; no matches.  
- `test/` (directory) – Test suites show mocking of existing API routes but none for `/api/ai-health`.  
- Scout play files (under `Scouts/ai-health-play4-authority-map-20260921-193356/`) – Only contain the play’s own objective and metadata (not source code).  

## LIMITATIONS
- Reconnaissance is read‑only; no runtime behavior was observed.  
- Only the Sideline Coach source tree was examined; external daemon or provider code is out of scope.  
- The search relied on textual and pattern matches; implicit route generation (e.g., dynamic routers) was not evident in the inspected server implementation.  

**Note:** This report is reconnaissance, not final architectural authority. The trusted Runner will determine subsequent steps.
