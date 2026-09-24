**SCOUT RECONNAISSANCE REPORT**  
Play ID: ai-health-play3-field-map-20260921-190521  
Scout ID: stadium-daemon-transport  
Agent: sideline-scout-balanced  
Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**RECONNAISSANCE ONLY – NOT FINAL ARCHITECTURAL AUTHORITY**  

---

### RESULT
The existing bounded message path for read‑only Game filesystem evidence (S6) has been traced from Stadium/player‑control code to the Control Plane daemon. The path uses a JSON‑RPC 2.0 request/response over the Stadium↔Control Plane WebSocket, with a feature‑gated method name, explicit param/result types, validation of the responder’s feature set and response correctness, and exercised by unit tests.

### KEY DISCOVERIES
- **Protocol/type seam** – defined in `src/control-plane/protocol.ts` as `GameFilesystemInspectParams` (lines 267‑271) and `GameFilesystemInspectResult` (lines 273‑278).  
- **Feature/version convention** – the Stadium advertises the feature string `game.filesystem.v1` in its `stadium.hello` payload (`src/stadium-client.ts`, line 509). The Control Plane evidence‑provider requires this feature before issuing the RPC.  
- **Send function (Stadium → Control Plane)** – the Stadium acts as a *server* for this request; the inbound handler is in `src/stadium-client.ts` (`handleIncomingRequest`, case `'game.filesystem.inspect'`, lines 871‑891). It calls the Stadium‑provided `options.gameFiles?.inspect` (or the fallback `inspectGameFilesystemEvidence`) and returns the evidence in the RPC result.  
- **Receive/dispatch function (Control Plane → Stadium)** – the Control Plane’s `evidenceProvider` (a `GameFilesystemEvidenceProvider`) lives in `src/control-plane/daemon.ts` (lines 227‑238). It:  
  1. Looks up the authoritative Stadium session,  
  2. Verifies the session includes `game.filesystem.v1`,  
  3. Sends RPC `game.filesystem.inspect` via `sendRpcToStadium`,  
  4. Checks `result.success` and `result.gameId`,  
  5. Sanitizes and returns the evidence (`sanitizeGameFilesystemEvidence`).  
- **Validation pattern** – see daemon.ts lines 228‑236: session status check, feature‑list inclusion, RPC success/gameId match, and evidence sanitization.  
- **Relevant tests** – unit tests that mock the evidenceProvider and exercise the coordinator:  
  - `test/game-filesystem-contract.test.mjs` (e.g., lines 395‑398, 405‑421)  
  - `test/s8-reports-slc-bootstrap.test.mjs` (evidenceProvider mocks at lines 179, 820)  

### FACT
- The RPC method `game.filesystem.inspect` exists with strongly‑typed params and result (protocol.ts lines 267‑278).  
- The Stadium declares the feature `game.filesystem.v1` in its `stadium.hello` features array (stadium-client.ts line 509).  
- The Control Plane daemon builds an `evidenceProvider` that checks for that feature before calling the RPC (daemon.ts lines 227‑238).  
- The Stadium’s inbound request handler for `game.filesystem.inspect` calls the injected `options.gameFiles?.inspect` (or fallback) and returns the evidence (stadium-client.ts lines 871‑891).  
- Tests exist that mock this provider and assert correct coordinator behavior (game-filesystem-contract.test.mjs lines 395‑398, s8-reports-slc-bootstrap.test.mjs lines 179, 820).  

### INFERENCE
- A bounded `health.evidence.v1` message would fit seamlessly by mirroring the S6 pattern:  
  1. Add a new feature string `health.evidence.v1` to the Stadium’s advertised features (stadium-client.ts line 509).  
  2. Define `HealthEvidenceInspectParams` and `HealthEvidenceInspectResult` in `protocol.ts` following the same style as the Game filesystem interfaces.  
  3. In the Stadium’s `handleIncomingRequest`, add a case for `'health.evidence.inspect'` that invokes a new callback `options.healthEvidence?.inspect` (to be supplied by the Stadium owner) and returns the evidence in the RPC result.  
  4. In the Control Plane daemon, extend (or overload) the `evidenceProvider` (or create a new `healthEvidenceProvider`) that: verifies the Stadium session includes `health.evidence.v1`, sends RPC `health.evidence.inspect`, validates the response, and returns the health evidence.  
  5. Unit tests would mirror those in `game-filesystem-contract.test.mjs`, mocking the new provider and asserting the coordinator’s handling of health evidence.  
- The Stadium should only forward evidence; no health‑specific logic (persistence, watchers, UI, etc.) is required in the Stadium for this bounded path.  

### UNKNOWN
- Whether the Stadium owner currently provides a `healthEvidence.inspect` callback (no matching field was found in `StadiumClientOptions`).  
- The exact shape of the health evidence type (it would be defined by the Stadium’s health subsystem, but no such definition appears in the current codebase).  
- Whether any existing tests already exercise a health‑evidence‑like path (none were found).  

### CONTRADICTION
- No contradictory evidence was found; the current codebase contains no trace of a `health.evidence` RPC method or feature.  

### IMPORTANT FILES / PATHS
- `src/control-plane/protocol.ts` – RPC type definitions (lines 267‑278).  
- `src/stadium-client.ts` – Stadium feature advertisement (line 509) and inbound RPC handler (lines 871‑891).  
- `src/control-plane/daemon.ts` – Control Plane evidence provider that gates on feature and performs RPC (lines 227‑238).  
- `src/control-plane/game-filesystem-coordinator.ts` – consumer of the evidence provider (lines 104, 198).  
- `test/game-filesystem-contract.test.mjs` – unit tests mocking the evidence provider (lines 395‑398).  
- `test/s8-reports-slc-bootstrap.test.mjs` – additional tests with evidenceProvider mocks (lines 179, 820).  

---  
*End of report.*
