### VERIFIED STATUS CHANGES
- AI Usage Scoreboard / compact layout: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (implemented and tested per UI and test suite, but not field-proven per roadmap SOON status).
- Terminal Player / Terminal Guts: Changed from UNKNOWN to BLOCKED / NEEDS FIELD PROOF (known multiline live-output gap persists; code still contains singleLine guard).
- Remote Coach / mobile first-class control surface: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (local security foundation implemented and tested; relay/pairing architecture not yet implemented per Stage 1 breadcrumb).
- Remote Access fresh-install provisioning: Remains UNKNOWN (no evidence of work; parked in PARKED SIDE QUESTS per master roadmap).
- Smart AUTO recognition: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (resolver implemented and tested per comprehensive test suite).
- Scout Formation / Scout runtime: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (implementation and test suite present).
- AI Usage Alarms: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (engine and delivery implemented and tested per test files).
- Routing & Alarms: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (alarm engine, delivery, and CONSERVE control implemented and tested).
- CONSERVE: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (control implemented and tested per test suite).
- Schedule Later: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (deferred play implementation and test suite present).
- Copy Context automation: Changed from UNKNOWN to IMPLEMENTED BUT NOT FULLY CLOSED (button present and tested in scoreboard UI tests).
- sticky Play-to-Player assignment: Remains UNKNOWN (breadcrumb explicitly states NOT YET IMPLEMENTED; no contrary evidence found).
- MVP / release closure items: Stage 1 items (e.g., multi-instance controlled Player proof) are DONE / CLOSED per master roadmap; Stage 2 items remain IMPLEMENTED BUT NOT FULLY CLOSED or UNKNOWN as detailed above.

### ACTIVE / OPEN
- Remote Access fresh-install provisioning ( Toto: no active work evident; parked )
- sticky Play-to-Player assignment ( Toto: no implementation evident )

### IMPLEMENTED BUT NOT FULLY CLOSED
- AI Usage Scoreboard / compact layout
- Remote Coach / mobile first-class control surface
- Smart AUTO recognition
- Scout Formation / Scout runtime
- AI Usage Alarms
- Routing & Alarms
- CONSERVE
- Schedule Later
- Copy Context automation
- MVP / release closure items (Stage 2 portions)

### BLOCKED / NEEDS FIELD PROOF
- Terminal Player / Terminal Guts

### DONE / CLOSED
- Stage 1 MVP / release closure items (multi-instance controlled Player proof, etc.) per master roadmap

### SUPERSEDED
- (None observed; all breadcrumbs either active, implemented, or blocked as-is)

### UNKNOWN
- Remote Access fresh-install provisioning ( Toto: no evidence )
- sticky Play-to-Player assignment ( Toto: breadcrumb states NOT YET IMPLEMENTED )

### EVIDENCE MAP
- AI Usage Scoreboard / compact layout: `src/public/index.html` (div `#aiScoreboardContainer`), `src/running-players.ts` (aiScoreboard* preferences), `src/control-plane/protocol.ts` (aiScoreboardRefreshStatus mirror), `test/ai-usage-scoreboard-ui.test.mjs` (comprehensive UI test suite).
- Terminal Player / Terminal Guts: `src/player-roster.ts` (lines 729-731 showing singleLine guard), Project SOP/Breadcrumbs/Terminal Player Multiline Live-Output Gap.md (STATUS: Diagnosed, not yet fixed).
- Remote Coach / mobile first-class control surface: Project SOP/Breadcrumbs/Remote-Access-Architecture.md (WHAT IS: Stage 1 implemented locally; later relay/pairing not in Stage 1), `test/remote-access-v1-stage1.test.mjs` (stage1 test suite).
- Remote Access fresh-install provisioning: Master roadmap (`Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`) under PARKED SIDE QUESTS: "fresh Stadium provisioning".
- Smart AUTO recognition: `test/smart-auto-recognition-resolver.test.mjs` (acceptance & regression suite).
- Scout Formation / Scout runtime: `test/scout-formation.test.mjs` (test suite), `out/scout-formation.js` (implementation).
- AI Usage Alarms: `out/control-plane/alarm-engine.js`, `out/alarm-notification.js`, `test/ai-usage-alarm-engine.test.mjs`, `test/ai-usage-alarm-delivery.test.mjs`.
- Routing & Alarms: Same as AI Usage Alarms plus `src/routing-policy.ts` (CONSERVE integration), `test/conserve-control.test.mjs`.
- CONSERVE: `test/conserve-control.test.mjs` (test suite), `src/routing-policy.ts` (posture seam), `src/control-plane/daemon.js` (routingPosture handling).
- Schedule Later: `out/control-plane/deferred-play.js`, `out/control-plane/deferred-play-scheduler.js`, `test/r9-deferred-play.test.mjs`.
- Copy Context automation: `src/public/index.html` (aiScoreboardCopyBtn), `test/ai-usage-scoreboard-ui.test.mjs` (Copy Complete Context tests).
- sticky Play-to-Player assignment: Project SOP/Breadcrumbs/STICKY PLAY PLAYER ASSIGNMENT.md (STATUS: BOOKMARK / NOT YET IMPLEMENTED).
- Stage 1 DONE / CLOSED: Master roadmap (`Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`) #5. CURRENTLY PROVEN — IS (Stage 1 field-proven evidence).

### MASTER LEDGER CORRECTIONS RECOMMENDED
- Update master roadmap (`Docs ANCHOR/Sideline-Coach-Master-Product-Breadcrumbs-and-Roadmap.md`) SOON section: Persistent Bottom Scoreboard / Toolbar should be marked [x] (done) based on implemented UI, test suite, and integration with substrate and preferences.
- Consider moving Remote Coach / mobile first-class control surface from IMPLEMENTED BUT NOT FULLY CLOSED to BLOCKED / NEEDS FIELD PROOF if field proof for relay/pairing remains outstanding; however, current evidence shows local foundation only.
- Verify Terminal Player multiline live-output gap fix status; if resolved, update breadcrumb and move to IMPLEMENTED BUT NOT FULLY CLOSED.
- Confirm sticky Play-to-Player assignment implementation status; if implemented, update breadcrumb and move to appropriate category.

### VERDICT
STATUS MAP VERIFIED (evidence supports status changes for all examined areas; no contradictions found; recommendations align with observed implementation gaps and roadmap discrepancies).
