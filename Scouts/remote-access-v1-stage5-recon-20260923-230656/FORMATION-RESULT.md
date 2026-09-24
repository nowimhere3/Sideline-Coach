# FORMATION RESULT

SCOUT FORMATION RESULT

FORMATION PARTIAL · 3/4 lanes completed · 0 substitutions · elapsed 00:05:33

Play: remote-access-v1-stage5-recon-20260923-230656
Game: C:\Users\dmcal\Documents\GitHub\SidelineCoach
Started: 2026-09-24T05:07:19.150Z
Finished: 2026-09-24T05:12:52.411Z
TOTAL ELAPSED TIME: 00:05:33

Scouts requested: 4
Completed: 3
Failed: 1
Blocked: 0
Interrupted: 0
Unknown: 0
Failed / unfilled lanes: 1
Total receiver attempts: 4
Substitutions: 0
Outcome: PARTIAL

## PLAYERS WHO TOOK THE FIELD

| Lane | Attempt | Player | Provider | Model | Reasoning effort | Start | Finish | Elapsed | Result | Failure class | Substitution | Child report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stage5-pairing-security-session-ux | 1 | NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) | OpenRouter | openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T05:07:19.182Z | 2026-09-24T05:12:18.895Z | 00:04:59 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-pairing-security-session-ux-Reconnaissance.md |
| stage5-main-settings-ui-seams | 1 | NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) | OpenRouter | openrouter/nvidia/nemotron-3-super-120b-a12b:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T05:07:19.326Z | 2026-09-24T05:12:52.403Z | 00:05:33 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-main-settings-ui-seams-Reconnaissance.md |
| stage5-mobile-responsive-experience | 1 | Poolside: Laguna S 2.1 (free) (sideline-scout) | OpenRouter | openrouter/poolside/laguna-s-2.1:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T05:07:19.341Z | 2026-09-24T05:10:06.499Z | 00:02:47 | FAILED | RATE LIMITED [availability] | — | none |
| stage5-acceptance-slicing-dad-experience | 1 | Cohere: North Mini Code (free) (sideline-scout-quick) | OpenRouter | openrouter/cohere/north-mini-code:free | UNKNOWN - not exposed by provider (provider-managed) | 2026-09-24T05:07:19.353Z | 2026-09-24T05:10:21.681Z | 00:03:02 | COMPLETE | — | — | C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-acceptance-slicing-dad-experience-Reconnaissance.md |

## SUBSTITUTION CHAIN

- Lane stage5-pairing-security-session-ux: NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) → COMPLETE
- Lane stage5-main-settings-ui-seams: NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) → COMPLETE
- Lane stage5-mobile-responsive-experience: Poolside: Laguna S 2.1 (free) (sideline-scout) → NO ELIGIBLE SUBSTITUTE REMAINED
    - Poolside: Laguna S 2.1 (free) (sideline-scout) benched: RATE LIMITED — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
- Lane stage5-acceptance-slicing-dad-experience: Cohere: North Mini Code (free) (sideline-scout-quick) → COMPLETE
- Lane stage5-mobile-responsive-experience: no eligible substitute remained after sideline-scout (RATE LIMITED).
    - not used: sideline-scout-quick — Already fielded on another lane in this Formation.
    - not used: sideline-scout — Already attempted for this lane.
    - not used: sideline-scout-balanced — Already fielded on another lane in this Formation.
    - not used: sideline-scout-deep — Already fielded on another lane in this Formation.

## DISCOVERIES BY PLAYER

### NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)

- Lane: stage5-pairing-security-session-ux (objective 3415c467639d)
- Objective: REMOTE ACCESS V1 — STAGE 5 RECONNAISSANCE

LANE 1: PAIRING / SECURITY / SESSION UX ARCHITECTURE

READ-ONLY RECONNAISSANCE.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.
DO NOT DEPLOY.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

CURRENT STATE:

Stage 4D real-network acceptance is STILL IN PROGRESS.
Stage 4E final Stage 4 acceptance is NOT COMPLETE.

Do NOT assume Stage 4 GO.

Stage 5 may be designed in advance, but implementation is NOT authorized until Stage 4 closes GREEN.

AUTHORITATIVE CONTEXT TO READ AS NEEDED:

REPORTS\AntiGravity\Remote-Access-v1-Stage-4-Production-Field-Packet__20260923__AntiGravity.md

REPORTS\Claude\Remote-Access-v1-Stage-4C-Cloud-Deployment-Wildcard-TLS__20260923__Claude.md

Relevant Stage 2/3 pairing/device implementation and current source.

PRODUCT NORTH STAR:

Dad must experience:

Enable Sideline Coach
→ Run Plays
→ Send to Phone
→ Scan / Connect
→ BOOM
→ Sideline is available remotely.

Dad must NOT configure:

* Fly.io
* DNS
* TLS
* relay URLs
* ports
* Docker
* environment variables
* enrollment secrets
* Tailscale
* router settings

Scout the EXISTING pairing / device / authentication seams and design the smallest Stage 5 product flow over them.

Investigate:

1. Exact current pairing implementation:

   * pairing creation
   * pairing secret
   * expiry
   * one-time behavior
   * exchange endpoint
   * sl_dev cookie
   * device registry
   * rename/revoke/revoke-all seams
   * public host origin
   * expectedOrigin
   * remote principal

2. Determine the cleanest production UX for:

   Send to Phone
   → pairing generated
   → QR shown
   → phone scans
   → public host URL opens
   → pairing completes
   → sl_dev established
   → phone enters Sideline

3. Determine whether the intended QR URL can directly be:

   https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>

   Verify against ACTUAL current code.

4. Determine exactly what browser-side code is missing today to consume the fragment and complete pairing.

5. Determine whether the fragment can be processed without ever sending the secret to:

   * relay logs
   * HTTP request URLs
   * referrer
   * server access logs

6. Determine exact error states Dad may encounter:

   * expired pairing
   * used pairing
   * relay offline
   * desktop offline
   * certificate/network failure
   * invalid pairing
   * device revoked
   * already paired

7. Define retry/recovery UX.

8. Determine how many clicks/taps the ideal flow requires.

9. Identify whether pairing modal should remain open until phone confirmation is observed.

10. Identify what signal can prove to the desktop UI that the phone has successfully paired.

11. Identify all security invariants Stage 5 UI MUST NOT weaken.

12. Identify exact implementation files/components likely involved.

13. Identify any dependency on unresolved Stage 4D/4E findings.

14. Produce exact acceptance tests for:

* QR correctness
* fragment secrecy
* pairing expiry
* pairing one-time use
* successful device creation
* sliding cookie
* revoked device
* offline host
* reconnect
* two-device pairing
* no credential leakage

15. Recommend bounded implementation slices.

DO NOT:

* modify code
* build QR UI
* create Stage 5 UI
* deploy
* change security semantics
* change pairing lifetime
* add accounts
* add GitHub auth
* begin implementation
* commit or push

GOAL:

Give the Stage 5 Architect a verified map from today's low-level pairing protocol to:

SEND TO PHONE
→ QR
→ SCAN
→ PAIRED

with zero infrastructure configuration exposed to Dad.
- Model: openrouter/nvidia/nemotron-3-ultra-550b-a55b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-pairing-security-session-ux-Reconnaissance.md

**Key discoveries:** Stage 5 (Dad-facing "Send to Phone → QR → Scan → Paired" UX) is **designable today** over the existing Stage 2/3/4 pairing, device, and relay seams. No new protocol changes are required. The implementation surface is bounded to:
- Desktop UI: "Send to Phone" button, QR modal, pairing status
- Phone browser: fragment consumer at `/pair#<secret>` → POST `/api/pairing/exchange` → cookie → Sideline
- Zero infrastructure configuration exposed to Dad

Stage 4D/4E acceptance is still in progress (per Stage 4 Field Packet). Stage 5 implementation is **not authorized** until Stage 4 closes GREEN. This reconnaissance is preparatory only.

---

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** UNKNOWN

**CONTRADICTION:** | Claim | Reality | Source |
|-------|---------|--------|
| "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" | **False** — `/pair` route does not exist | `DAEMON_ROUTE_POLICIES`, `daemon.ts` |
| "Stage 4 complete" | **False** — 4D/4E in progress | Stage 4 Field Packet, 4C Report |

---

**Important files:** ```
src/control-plane/pairing.ts              # Pairing protocol (core)
src/control-plane/device-registry.ts      # Device credentials & persistence
src/control-plane/daemon.ts               # HTTP endpoints (pairing create/exchange)
src/control-plane/remote-dispatch.ts      # sl_dev auth, remote-device principal
src/control-plane/remote-routes.ts        # Route access classification
src/control-plane/relay-client.ts         # expectedOrigin derivation
src/public/index.html                     # All frontend (HTML + CSS + JS)
test/remote-access-v1-stage2.test.mjs     # Pairing/device contract tests
test/remote-access-v1-stage3.test.mjs     # Relay/adapter contract tests
test/remote-access-v1-stage4-hardening.test.mjs  # Production hardening tests
REPORTS/AntiGravity/Remote-Access-v1-Stage-4-Production-Field-Packet__20260923__AntiGravity.md
REPORTS/Claude/Remote-Access-v1-Stage-4C-Cloud-Deployment-Wildcard-TLS__20260923__Claude.md
```

---

### NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)

- Lane: stage5-main-settings-ui-seams (objective 4117e3015c84)
- Objective: REMOTE ACCESS V1 — STAGE 5 RECONNAISSANCE

LANE 2: MAIN PAGE + SETTINGS UX / EXISTING UI SEAMS

READ-ONLY RECONNAISSANCE.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Stage 4D is still running.
Stage 4E is not complete.
Do NOT assume Stage 4 GO.

Scout the CURRENT Sideline Coach UI architecture and determine exactly how Stage 5 Remote Access should integrate without redesigning the product.

PRODUCT DECISION ALREADY MADE:

MAIN PAGE = SIMPLE ACTION / OUTCOME

SETTINGS = CONTROL ROOM

Main page should expose a compact outcome action:

SEND TO PHONE

Settings should contain the detailed Remote Access controls.

Investigate the current UI source and identify:

1. Exact main-page component/file hierarchy.

2. Best existing location for:
   Send to Phone

3. Whether this should be:

   * button
   * card action
   * compact status action
     based on CURRENT visual hierarchy.

4. Exact QR modal/popover/dialog seam already available in the app.

5. Required main-page states:

   * Remote Access unavailable
   * Remote Access available
   * pairing ready
   * waiting for phone
   * paired
   * phone connected
   * desktop/relay offline
   * error

6. Keep the normal main page restrained.
   Do NOT turn Remote Access into a giant dashboard.

7. Scout current Settings architecture.

8. Determine exact location for a new:

REMOTE ACCESS

Settings card/disclosure.

9. Desired controls:

   * Enabled / Disabled
   * Send / Pair another device
   * Connected devices
   * device label
   * last seen if already available safely
   * rename
   * revoke
   * revoke all
   * remote status
   * production relay connectivity status
   * advanced terminal redaction override where already architecturally allowed

10. Determine what settings are NEVER shown to Dad:

    * relay URL
    * domain
    * Fly
    * TLS
    * enrollment key
    * ports
    * DNS
    * WSS details

11. Determine how device list changes should update live.

12. Determine what existing APIs already provide each control and which UI-facing API gaps remain.

13. Determine how Remote Access enabled state interacts with the existing local preference.

14. Determine exact files likely modified.

15. Preserve:

    * current card reorder architecture
    * collapsibility
    * current Settings IA
    * current desktop visual language

16. Identify tests required for:

    * Send to Phone visibility
    * modal lifecycle
    * successful pairing transition
    * settings device list
    * rename/revoke
    * disabled state
    * offline relay
    * repeated pairing
    * cleanup

17. Identify Stage 4 dependencies.

18. Recommend smallest implementation slices.

DO NOT:

* redesign the whole page
* redesign Settings
* implement
* add decorative UI
* build Stage 5
* touch backend protocol
* commit or push

GOAL:

Map the exact CURRENT UI seams so premium Claude receives:

FILES + STATES + DECISIONS

not:

"Go explore the frontend and figure out where Remote Access belongs."
- Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-main-settings-ui-seams-Reconnaissance.md

**Key discoveries:** - The page already provides a generic modal seam (`#confirmModal`) used for confirmation dialogs (lines 2023‑2032) and a reusable browsing sheet (`#gameBrowserSheet`) for file‑folder selection (lines 1994‑…).  
- The central refresh routine `refresh()` (lines 5801‑5826) polls `/api/status` and `/api/reports`, updates UI, hides auth, and reconciles connection state.  
- Settings cards follow a uniform pattern: a `<div class="settings-card settings-disclosure">` with a header button (`settings-disclosure-header`) and a collapsible body (`settings-disclosure-body`).  
- No existing Remote Access API endpoints appear in the script; all current endpoints relate to reports, dispatch, preferences, routines, and health telemetry.  
- The visual header already contains a connection indicator and a Settings button in `.header‑actions`; adding a third button there would preserve the existing layout and visual hierarchy.

**FACT:** - The main page hierarchy is: `body > main#gameScrollRegion > header`, then sequentially `section#authCard`, `section#recruitCard`, `section#rosterCard`, `section#incomingCard`, `section class="card"` (outgoing Play Dispatcher) – all visible within the scrollable region (lines 1430‑1626).  
- The Settings UI is hidden by default (`settings-view[hidden]` CSS) and revealed via `$('#settingsBtn').click()` → `openSettings()` (lines 7113‑7127).  
- The generic confirmation modal is defined by `.modal-backdrop` and `.modal` CSS (lines 746‑760) and instantiated as `<div id="confirmModal" class="modal-backdrop" hidden> … </div>` (lines 2023‑2032).  
- The `refresh()` function (lines 5801‑5826) performs `await Promise.all([api('/api/status'), api('/api/reports')])`, then calls `renderStatus`, `renderReports`, `fetchAiHealth`, `hideAuth`, and updates connection state.  
- Settings cards are constructed using the pattern seen in `modeSettingsCard` (lines 1639‑1649), `livePlayerConsoleCard` (lines 1661‑1714), etc., each with a header button and a collapsible body.  
- The following API endpoints are invoked in the script: `/api/status`, `/api/reports`, `/api/events` (SSE), `/api/session`, `/api/work/acknowledge`, `/api/player-activity`, `/api/scout/*`, `/api/preferences`, `/api/routines/*`, `/api/games/filesystem/*`, `/api/dispatch`. No endpoints related to remote access (pairing, device list, toggle) are present.  
- The visual header actions are located in `<div class="header-actions">

**INFERENCE:** - A “Send to Phone” button would fit naturally as a third element in `.header‑actions`, aligned with the existing Settings button, because the header already groups compact actions (connection status, settings) and the main page is intended to expose a single outcome action (SEND TO PHONE) without becoming a dashboard.  
- The QR pairing dialog could reuse the existing `#confirmModal` markup and styling (modal backdrop + centered modal) – the same pattern used for the “Remove Player” confirmation – by replacing its title/body/actions with QR‑code display and a Cancel button.  
- Remote Access state can be derived from a combination of `connectionState` (`connected`/`reconnecting`/`offline`) and a new preference flag (e.g., `remoteAccessEnabled`) stored via `/api/preferences`. The UI would reflect:  
  - *Unavailable*: `connectionState !== 'connected'`  
  - *Available*: `connectionState === 'connected'` & `remoteAccessEnabled === false`  
  - *Pairing ready*: `remoteAccessEnabled === true` & no active pairing  
  - *Waiting for phone*: after user taps “Send/Pair another device” and QR displayed  
  - *Paired*: after phone scans QR and reports success via `/api/remote-access/pair`  
  - *Phone connected*: when a device shows active session in `/api/status`  
  - *Desktop/relay offline*: `connectionState === 'offline'`  
  - *Error*: non‑OK response from remote‑access APIs  
- The Settings IA already supports a new card; a logical place for Remote Access is after the Mode Setti

**UNKNOWN:** - Whether the Control Plane already exposes remote‑access related data in `/api/status` or `/api/reports` under a different key (no evidence found).  
- The exact shape of the pairing payload (e.g., whether a QR code is represented as a data‑URL or a base64 string) and which endpoint delivers it.  
- Whether the existing `connectionState` transitions already reflect relay‑only versus phone‑connected states, or whether a distinct `remoteAccessState` is needed.  
- The precise naming and default values for the new preference(s) that would gate Remote Access (e.g., `remoteAccess.enabled`, `remoteAccess.relayUrl`).

**CONTRADICTION:** - None observed within the scoped UI code; all patterns are consistent and extensible.

**Important files:** - `src/public/index.html` – the sole UI source; modifications would be confined to this file for the button, modal, settings card, and associated event listeners.  
- (Backend API contracts are out of scope for this read‑only reconnaissance; any required endpoint additions would reside in the Control Plane TypeScript files under `src/control-plane/`.)  

---  
**Scout ID:** stage5-main-settings-ui-seams  
**Assigned model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This report is reconnaissance, not final architectural authority.  

---  
*End of report.*

### Cohere: North Mini Code (free) (sideline-scout-quick)

- Lane: stage5-acceptance-slicing-dad-experience (objective f66a3ed2deb3)
- Objective: REMOTE ACCESS V1 — STAGE 5 RECONNAISSANCE

LANE 4: STAGE 5 ACCEPTANCE / SLICING / DAD EXPERIENCE

READ-ONLY RECONNAISSANCE.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Stage 4D is currently being field-tested.
Stage 4E is not complete.

Do NOT assume Stage 4 GO.

Scout Stage 5 as a PRODUCT ACCEPTANCE problem.

The current intended Dad experience is:

ENABLE SIDELINE COACH
→ RUN PLAYS
→ SEND TO PHONE
→ QR
→ SCAN
→ CONNECT
→ BOOM
→ SIDELINE IS AVAILABLE ON THE GO

The infrastructure MUST disappear.

Investigate:

1. Define exact Stage 5 entry condition from Stage 4E.

2. Define smallest Stage 5 slice sequence.

3. Candidate conceptual slices may include:

   5A — browser pairing landing flow
   5B — Send to Phone + QR desktop UI
   5C — Remote Access Settings / device management
   5D — responsive mobile polish
   5E — final Dad field acceptance

But independently verify the correct decomposition.

4. Define Dad-facing acceptance for the entire feature.

5. Measure expected human actions.

Ideal first-device path should approach:

click Send to Phone
→ scan QR
→ done

6. Define:
   first pairing
   repeat visit
   second device
   revoke device
   pair replacement device
   desktop offline
   relay offline
   expired QR
   phone changes network
   phone returns later

7. Determine what requires explicit confirmation versus automatic behavior.

8. Define how pairing success is communicated simultaneously on desktop and phone.

9. Determine whether Dad should ever manually toggle Remote Access.

10. Consider whether Remote Access should:

    * default off
    * enable on first Send to Phone
    * remain enabled after first pairing

Do NOT decide from preference alone; inspect current security/product architecture and present recommendation.

11. Define zero-setup invariant.

12. Define exact anti-goals.

13. Define Stage 5 GO / NO-GO checklist.

14. Define final real-world field test:

    * Windows desktop
    * Android phone
    * cellular
    * Wi-Fi transition
    * Play running
    * report received
    * next action/routing control
    * disconnect/reconnect
    * revoke

15. Identify which temporary Stage 4 developer steps Stage 5 MUST eliminate.

Examples:
javascript: pairing
DevTools Console
environment variables
manual host URL
manual pairing code entry

16. Identify what operational infrastructure must remain completely invisible.

17. Identify potential UX traps.

18. Determine tests and files where possible.

19. Identify anything dependent on final 4D/4E findings.

20. Recommend Player/model/reasoning level for each implementation slice.

DO NOT:

* implement
* redesign the architecture
* create UI
* begin Stage 5
* commit or push

GOAL:

Produce a clean acceptance and execution map so Stage 5 turns the already-working production transport into:

"Dad clicks one thing and Sideline follows him."
- Model: openrouter/cohere/north-mini-code:free · Provider: OpenRouter · Reasoning effort: UNKNOWN - not exposed by provider (provider-managed)
- Source report: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-acceptance-slicing-dad-experience-Reconnaissance.md

**Key discoveries:** UNKNOWN

**FACT:** UNKNOWN

**INFERENCE:** UNKNOWN

**UNKNOWN:** 1. **Dad-facing UI Architecture**: No existing pairing UI in codebase - unknown how this should integrate with existing extension UI
2. **Mobile App Integration**: Unknown how pairing QR should work with mobile Sideline Coach app
3. **Settings Card Design**: Unknown what fields/settings card should show for device management
4. **Responsive Design**: Unknown how pairing flow should work across desktop/mobile screen sizes


5. **Success Confirmation Patterns**: Unknown what constitutes "simultaneous communication" of pairing success
6. **Default Remote Access State**: Unknown whether current `remoteAccess.enabled: false` default should change
7. **Zero-Setup Flow**: Unknown what the minimal user actions should be for first-time setup
8. **Network Transition Support**: Unknown how pairing should handle Wi-Fi/cell switching scenarios

**CONTRADICTION:** 1. **Current vs Desired**: Current implementation requires manual developer intervention; Stage 5 requires zero manual intervention
2. **Visibility vs Infrastructure**: Current pairing exposes developer tools; Stage 5 requires infrastructure to remain completely invisible
3. **Security vs UX**: Current pairing security focuses on developer tools; Stage 5 needs security for non-technical users
4. **Memory vs Persistence**: Current pairing store is memory-only (survives daemon restart but not new machine); Stage 5 may need cross-device persistence

**Important files:** UNKNOWN

## COMBINED FORMATION FINDINGS

3 of 4 lanes completed. This is a mechanical evidence index of what each Player returned, attributed to the Player that produced it; it is not a verdict. Cross-Scout judgement requires a human or an Architect, and Scout evidence is reconnaissance, not architectural authority.

- **NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep)** · lane stage5-pairing-security-session-ux: Stage 5 (Dad-facing "Send to Phone → QR → Scan → Paired" UX) is **designable today** over the existing Stage 2/3/4 pairing, device, and relay seams. No new protocol changes are required. The implementation surface is bounded to: - Desktop UI: "Send to Phone" button, QR modal, pairing status - Phone browser: fragment consumer at `/pair#<secret>` → POST `/api/pairing/exchange` → cookie → Sideline - 
- **NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced)** · lane stage5-main-settings-ui-seams: The Sideline Coach UI is a single‑page application contained in `src/public/index.html`. The main page (the scrollable region `<main id="gameScrollRegion">`) consists of a header followed by a sequence of cards: **authCard** (Access), **recruitCard** (Scouting), **rosterCard** (Roster), **incomingCard** (Latest Report), and **outgoingCard** (Play Dispatcher). The Settings UI is a hidden `<section 
- **Cohere: North Mini Code (free) (sideline-scout-quick)** · lane stage5-acceptance-slicing-dad-experience: No headline section recognised — see the Player report.

## FAILED / BLOCKED ATTEMPTS

- Lane stage5-mobile-responsive-experience · attempt 1 · Poolside: Laguna S 2.1 (free) (sideline-scout) · openrouter/poolside/laguna-s-2.1:free: FAILED [RATE LIMITED] · elapsed 00:02:47 — The provider rate-limited this Scout. (> sideline-scout · poolside/laguna-s-2.1:free)
    - stderr: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-stage5-recon-20260923-230656\stage5-mobile-responsive-experience\stderr.log
    - stdout / partial output: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-stage5-recon-20260923-230656\stage5-mobile-responsive-experience\stdout.log

## CONTRADICTIONS

- NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep) · lane stage5-pairing-security-session-ux: | Claim | Reality | Source | |-------|---------|--------| | "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" | **False** — `/pair` route does not exist | `DAEMON_ROUTE_POLICIES`, `daemon.ts` | | "Stage 4 complete" | **False** — 4D/4E in progress | Stage 4 Field Packet, 4C Report | ---
- NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced) · lane stage5-main-settings-ui-seams: - None observed within the scoped UI code; all patterns are consistent and extensible.
- Cohere: North Mini Code (free) (sideline-scout-quick) · lane stage5-acceptance-slicing-dad-experience: 1. **Current vs Desired**: Current implementation requires manual developer intervention; Stage 5 requires zero manual intervention 2. **Visibility vs Infrastructure**: Current pairing exposes developer tools; Stage 5 requires infrastructure to remain completely invisible 3. **Security vs UX**: Current pairing security focuses on developer tools; Stage 5 needs security for non-technical users 4. **Memory vs Persistence**: Current pairing store is memory-only (survives daemon restart but not new machine); Stage 5 may need cross-device persistence

These are self-reported and are not adjudicated here.

## UNKNOWN / UNFILLED TERRITORY

These lanes returned no completed report. Absence is not success, and nothing in this report speaks for them:

- stage5-mobile-responsive-experience: FAILED. Objective: REMOTE ACCESS V1 — STAGE 5 RECONNAISSANCE

LANE 3: MOBILE SIDELINE EXPERIENCE

READ-ONLY RECONNAISSANCE.
DO NOT MODIFY SOURCE.
DO NOT IMPLEMENT.

Repository:
C:\Users\dmcal\Documents\GitHub\SidelineCoach

Stage 4D/4E are not finished.
Do NOT assume final Stage 4 GO.

Current real-network testing has already demonstrated that the existing Sideline Coach page can render remotely through the production relay.

Scout the CURRENT responsive/mobile architecture and determine the smallest Stage 5 mobile experience necessary for Dad.

NORTH STAR:

Dad leaves the desktop.

Dad opens Sideline on phone.

Dad should be able to understand:

* What Game am I in?
* Is Coach online?
* Which Players are active?
* What Play is running?
* What happened?
* What needs my decision?
* Can I route the next Play?

Dad should NOT receive a miniature desktop IDE.

Investigate:

1. Current responsive breakpoints and mobile CSS/components.

2. Which current main-page sections already work acceptably on a narrow phone.

3. Which sections become unusable or noisy.

4. Current Live Player Terminal mobile behavior.

5. Current AI Usage Scoreboard mobile behavior.

6. Current Game selector / status behavior.

7. Current Player cards / execution status.

8. Current reports / action controls.

9. What Dad ACTUALLY needs on mobile for Stage 5.

10. Separate:
    MUST HAVE IN STAGE 5
    from
    FUTURE MOBILE POLISH

11. Determine whether Stage 5 can primarily reuse the existing responsive page instead of creating a separate mobile application.

12. Prefer:
    ONE WEB APP
    ONE ROUTING MODEL
    RESPONSIVE PRESENTATION

unless the existing architecture proves otherwise.

13. Determine phone navigation needs.

14. Determine if Settings should remain accessible on phone and which controls should be suppressed.

15. Determine how offline/reconnect should present on mobile.

16. Determine how a running Play should remain visible while Dad moves between sections.

17. Determine touch-target / viewport / overflow issues.

18. Identify exact source files.

19. Identify Stage 4D findings that may alter mobile behavior:

* SSE reconnect
* cellular transitions
* offline host
* device revocation

20. Define acceptance for representative narrow Android viewport sizes.

21. Recommend exact Stage 5 mobile test matrix.

DO NOT:

* create a native Android app
* create voice infrastructure
* build a second mobile backend
* redesign the whole product
* implement
* commit or push

IMPORTANT:

Voice is NOT a Stage 5 infrastructure requirement.

Dad may use:

* phone keyboard
* phone native speech-to-text
* Assistant Coach / conversational interface

Do not invent a custom voice layer.

GOAL:

Determine the minimum responsive Sideline experience that makes:

"Coach comes with Dad"

true on a normal phone browser.

## CHILD REPORTS

- Lane stage5-pairing-security-session-ux · NVIDIA: Nemotron 3 Ultra (free) (sideline-scout-deep): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-pairing-security-session-ux-Reconnaissance.md
- Lane stage5-main-settings-ui-seams · NVIDIA: Nemotron 3 Super (free) (sideline-scout-balanced): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-main-settings-ui-seams-Reconnaissance.md
- Lane stage5-acceptance-slicing-dad-experience · Cohere: North Mini Code (free) (sideline-scout-quick): C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656\SCOUT-stage5-acceptance-slicing-dad-experience-Reconnaissance.md

### Full report — lane stage5-pairing-security-session-ux (sideline-scout-deep)

Now I have a comprehensive understanding of the current state. Let me compile the reconnaissance report.

---

# SCOUT RECONNAISSANCE REPORT

**Play ID:** remote-access-v1-stage5-recon-20260923-230656  
**Scout ID:** stage5-pairing-security-session-ux  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Status:** RECONNAISSANCE ONLY — NOT FINAL ARCHITECTURAL AUTHORITY  
**Date:** 2026-09-23

---

## RESULT

Stage 5 (Dad-facing "Send to Phone → QR → Scan → Paired" UX) is **designable today** over the existing Stage 2/3/4 pairing, device, and relay seams. No new protocol changes are required. The implementation surface is bounded to:
- Desktop UI: "Send to Phone" button, QR modal, pairing status
- Phone browser: fragment consumer at `/pair#<secret>` → POST `/api/pairing/exchange` → cookie → Sideline
- Zero infrastructure configuration exposed to Dad

Stage 4D/4E acceptance is still in progress (per Stage 4 Field Packet). Stage 5 implementation is **not authorized** until Stage 4 closes GREEN. This reconnaissance is preparatory only.

---

## KEY DISCOVERIES

### 1. Exact Current Pairing Implementation (FACT)

**File:** `src/control-plane/pairing.ts`

| Property | Value | Evidence |
|----------|-------|----------|
| TTL | 5 minutes (`PAIRING_TTL_MS = 5 * 60 * 1000`) | Line 4 |
| Max failed attempts | 5 (`PAIRING_MAX_FAILED_ATTEMPTS = 5`) | Line 5 |
| Secret | 128-bit, base64url (22 chars) | Line 63, test RA2D-1 |
| Fallback code | 8 chars from Crockford alphabet, formatted `XXXX-XXXX` | Lines 7, 37-47, 73 |
| Storage | Memory-only `Map<string, PairingRecord>` | Line 56 |
| Hashing | SHA-256 of secret and code only; raw never stored | Lines 31, 68-69, 95-98 |
| One-time use | `exchange()` deletes record on success | Line 92 |
| New pairing supersedes | `createPairing()` clears all records | Line 61 |
| Daemon restart | Drops all pairings (memory-only) | Line 51-52, test RA2D-2 |

**Endpoints (FACT):**
- `POST /api/pairing/create` — `local-only`, returns `{ pairingId, secret, code, expiresAt }` (daemon.ts:1276-1279)
- `POST /api/pairing/exchange` — `public`, accepts `{ secret }` or `{ code }`, optional `{ label }`, returns `{ success: true, deviceId }` + `Set-Cookie: sl_dev=<token>` (daemon.ts:1186-1197)

**PairingExchangeResult (FACT):**
```typescript
type PairingExchangeResult =
  | { ok: true; pairingId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'burned' };
```
Lines 19-21

### 2. Device Registry & sl_dev Cookie (FACT)

**File:** `src/control-plane/device-registry.ts`

| Property | Value | Evidence |
|----------|-------|----------|
| Token | 256-bit, base64url (43 chars) | Line 40, test RA2B-6 |
| Storage | `~/.sideline/remote/devices.json` (atomic write, 0o600) | Lines 35, 122-132 |
| Persisted | Only `tokenHash` (SHA-256), never raw token | Lines 27-28, 44, test RA2B-6 |
| Idle expiry | 30 days sliding (`DEVICE_IDLE_EXPIRY_MS`) | Line 6, 64-65 |
| Cookie | `sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` | remote-dispatch.ts:12-13, 78 |
| Cookie refresh | Slid on every authenticated remote request | remote-dispatch.ts:78, test RA2C-5 |
| Loopback protection | `sl_dev` from localhost never authenticates | remote-dispatch.ts:70, test RA2C-8 |

**Device management (local-only):**
- `GET /api/devices` — list (no hashes)
- `PATCH /api/devices/:id` — rename
- `DELETE /api/devices/:id` — revoke one
- `DELETE /api/devices` — revoke all

### 3. Expected Origin & Remote Principal (FACT)

**File:** `src/control-plane/remote-dispatch.ts`

- `expectedOrigin` = `https://h-${hostPublicId}.${relayDomain}` (Line 30, 85)
- Derived **only** by `RelayClient` at connect time from durable host identity + trusted config (relay-client.ts:85)
- **Never** from request `Host` or `Origin` headers (remote-dispatch.ts:66-67)
- `remote-device` principal minted **only** in `InProcessRemoteAdapter` (Lines 36, 66, 76)

**Route policy (FACT):** `remote-routes.ts:63` — `/api/pairing/exchange` is `public`; all device management is `local-only`.

### 4. Relay Architecture (FACT)

- Stage 4C production relay live at `wss://relay.remote.mysidelinecoach.com/tunnel/v1`
- Phone browser origin: `https://h-<hostPublicId>.remote.mysidelinecoach.com`
- Host connects outbound WSS to `relay.<RELAY_DOMAIN>` with `x-sideline-enrollment` header
- 7-header allowlist: `accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent`
- SSE streaming verified working through Fly edge with `Content-Encoding: none` (Stage 4C report)

---

## 3. QR URL Format Verification (FACT / INFERENCE)

**Proposed QR URL:** `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`

**Verification against current code:**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Host origin format | ✅ Matches | `expectedOrigin = https://h-${hostPublicId}.${relayDomain}` (relay-client.ts:85) |
| `/pair` path | ❌ **Does not exist** | No route for `/pair` in `DAEMON_ROUTE_POLICIES` or daemon.ts |
| Fragment `#<secret>` | ✅ Standard | Browser never sends fragment to server |
| Secret consumption | ✅ Works | `POST /api/pairing/exchange` accepts `{ secret }` (daemon.ts:1187-1188) |

**INFERENCE:** The `/pair` route **must be added** as a static page that reads `location.hash` and POSTs to `/api/pairing/exchange`. This is the missing browser-side code.

---

## 4. Missing Browser-Side Code (FACT)

**Current state:** No `/pair` route exists. No fragment consumer exists.

**Required minimal implementation:**
1. **Add route** `/pair` → serves static HTML (public access)
2. **Static page** at `/pair`:
   - Reads `location.hash` (e.g., `#<secret>`)
   - Strips `#`, POSTs `{ secret }` to `/api/pairing/exchange`
   - On success: navigates to `/` (Sideline loads with `sl_dev` cookie)
   - On failure: shows error UI (expired, used, invalid, burned, offline)

**Fragment secrecy (FACT):** Fragments are **never sent to server** (HTTP spec). They do not appear in:
- Relay logs (only pathname logged, Stage 4C report:464)
- HTTP request URLs
- Referrer headers (when navigating same-origin)
- Server access logs

---

## 5. Fragment Secrecy Verification (FACT)

| Vector | Leaks Secret? | Evidence |
|--------|---------------|----------|
| Relay logs | ❌ No | Only `path` (pathname) logged, query stripped (Stage 4C report:464, reference-relay.ts:555) |
| HTTP request URL | ❌ No | Fragment never transmitted |
| Referrer | ❌ No | Same-origin navigation from `/pair` to `/` keeps fragment off Referrer |
| Server access logs | ❌ No | Never reaches server |
| Browser history | ⚠️ Yes (local) | `location.hash` stays in history unless replaced |

**Mitigation:** On successful exchange, `history.replaceState(null, '', '/')` clears fragment from history.

---

## 6. Error States Dad May Encounter (FACT / INFERENCE)

| Error State | Trigger | HTTP Response | User-Facing Message |
|-------------|---------|---------------|---------------------|
| **Expired pairing** | `now() >= expiresAt` | 401 `{ success: false, message: 'Pairing could not be verified.' }` | "This QR code has expired. Tap 'Send to Phone' again." |
| **Used pairing** | Secret already exchanged | 401 (same body) | "This QR code was already used. Tap 'Send to Phone' again." |
| **Burned pairing** | 5 failed attempts | 401 (same body) | "Too many failed attempts. Tap 'Send to Phone' again." |
| **Relay offline** | No host connected | 503 `{ code: 'host_offline', message: 'Desktop host is offline' }` | "Desktop is offline. Make sure Sideline Coach is running on Dad's computer." |
| **Desktop offline** | Daemon not running | Connection refused / timeout | Same as relay offline |
| **Certificate/network failure** | TLS error, DNS fail | Browser error page | "Can't reach Sideline. Check internet connection." |
| **Invalid pairing** | Wrong secret/code format | 401 (same body) | "Invalid QR code. Please scan again." |
| **Device revoked** | After pairing, device revoked | 401 on subsequent requests | "This device was removed. Tap 'Send to Phone' to pair again." |
| **Already paired** | Phone already has valid `sl_dev` | N/A (cookie works) | Already in Sideline — no action needed |

**Critical invariant (FACT):** All failure responses return **identical generic body** — no oracle detail (test RA2D-2:569).

---

## 7. Retry/Recovery UX (INFERENCE)

| Scenario | Recovery Action |
|----------|-----------------|
| Expired/Used/Burned/Invalid | "Tap 'Send to Phone' again" → new pairing, new QR |
| Relay/Desktop offline | Auto-retry polling (e.g., every 5s) with "Retry" button; show desktop status |
| Network failure | "Check connection" toast; auto-retry when online event fires |
| Device revoked | Treat as expired → new pairing flow |
| Already paired | Detect `sl_dev` on load → skip QR, go straight to Sideline |

**Pairing modal behavior:** Should remain open with live countdown (5:00 → 0:00) and auto-refresh QR when expired. Close only on explicit "Cancel" or successful phone confirmation signal.

---

## 8. Ideal Click/Tap Count (INFERENCE)

| Step | Desktop (Dad) | Phone |
|------|---------------|-------|
| 1. Open Settings → Remote Access | 1 click | — |
| 2. Tap "Send to Phone" | 1 click | — |
| 3. QR modal opens (auto) | 0 | — |
| 4. Phone: Open camera / QR scanner | — | 1 tap |
| 5. Phone: Tap notification to open URL | — | 1 tap |
| 6. Phone: Pairing completes (auto) | — | 0 |
| 7. Phone: Sideline loads | — | 0 |
| **Total** | **2 clicks** | **2 taps** |

**Optimal:** Zero manual code entry. Fallback code `XXXX-XXXX` shown below QR for manual entry if camera fails.

---

## 9. Pairing Modal: Remain Open Until Phone Confirmation? (INFERENCE)

**Yes.** The modal should:
- Show live countdown (5 min)
- Poll `/api/pairing/exchange` status indirectly via SSE `execution` or dedicated status endpoint
- Show "Phone paired!" confirmation when device created
- Auto-close on success, or stay open with "Paired — opening Sideline..." message
- Provide "Cancel" to abort pairing (deletes pairing server-side)

**Signal for phone confirmation (INFERENCE):**
- SSE `/api/events` broadcasts `device-created` event (not yet implemented)
- OR: Modal polls `GET /api/devices` (local-only — needs new `public` read endpoint or SSE event)
- OR: Modal opens SSE connection and listens for `pairing-complete` frame

**Simplest:** New SSE event type `pairing-complete` with `{ deviceId, label }` broadcast from daemon after successful exchange.

---

## 10. Security Invariants Stage 5 UI MUST NOT Weaken (FACT)

| Invariant | Must Preserve |
|-----------|---------------|
| **Secret never logged/persisted** | QR secret only in memory, fragment, QR image; never in API URLs, logs, storage |
| **One-time use** | `exchange()` burns pairing; UI must not allow re-scan of same QR |
| **5-minute TTL** | UI must show countdown; auto-expire |
| **Max 5 failed attempts** | UI must not encourage brute force; show generic error |
| **Local-only pairing creation** | Only Dad (local-admin) can create pairing via UI |
| **Device token hash only** | UI must never display raw `sl_dev` token |
| **Expected origin enforcement** | Remote mutations require `Origin: https://h-<hostPublicId>.<RELAY_DOMAIN>` + `X-Sideline-Action: 1` |
| **No credential in QR URL query** | Fragment only (`#secret`), never `?secret=` |
| **Loopback protection** | `sl_dev` from localhost never works (test RA2C-8) |
| **Rate limiting** | Pairing exchange bucket (10/min/IP) enforced at relay (Stage 4A) |

---

## 11. Exact Implementation Files/Components (FACT)

| Layer | Files | Role |
|-------|-------|------|
| **Pairing protocol** | `src/control-plane/pairing.ts` | `PairingStore`, `createPairing()`, `exchange()` |
| **Device registry** | `src/control-plane/device-registry.ts` | `DeviceRegistry`, `createDevice()`, `authenticate()` |
| **Daemon endpoints** | `src/control-plane/daemon.ts:1186-1197, 1276-1279` | `POST /api/pairing/exchange`, `POST /api/pairing/create` |
| **Route policy** | `src/control-plane/remote-routes.ts:62-63` | Access classification |
| **Remote auth** | `src/control-plane/remote-dispatch.ts:64-79` | `sl_dev` verification, principal minting |
| **Relay client** | `src/control-plane/relay-client.ts:85` | `expectedOrigin` derivation |
| **Frontend (HTML)** | `src/public/index.html` | Settings UI, modal system, toast, API client |
| **Frontend (JS)** | `src/public/index.html:2038+` | `api()`, `showToast()`, `confirmAction()`, modal logic |
| **Tests** | `test/remote-access-v1-stage2.test.mjs` | Pairing/device contract verification |

---

## 12. Dependency on Unresolved Stage 4D/4E Findings (UNKNOWN / FACT)

| Dependency | Status | Impact on Stage 5 |
|------------|--------|-------------------|
| Real cellular SSE stability | 4D in progress | If SSE fails, pairing confirmation signal unreliable |
| Rate limiter tuning (coarse IP) | 4C finding #1 | Phone asset loads may hit 120/min limit; may need higher `RATE_HTTP_PER_MIN` |
| Enrollment key rotation | 4C finding #2 | New key needed for 4D; Stage 5 assumes stable relay |
| Fly log retention | 4C finding #5 | Debugging pairing issues may need live `fly logs --tail` |
| SSE drain on deploy | 4C finding #6 | 5s drain may interrupt pairing if deploy during flow |

**Stage 5 can proceed with design assuming Stage 4 green.** Implementation blocked until 4E signoff.

---

## 13. Acceptance Tests for Stage 5 (FACT / INFERENCE)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| **ST5-1** | QR correctness | QR encodes `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`; secret matches `POST /api/pairing/create` response |
| **ST5-2** | Fragment secrecy | Secret never appears in: relay logs, network tab URLs, Referrer, server access logs, `localStorage`/`sessionStorage` |
| **ST5-3** | Pairing expiry | After 5 min, QR scan → "expired" error; new "Send to Phone" works |
| **ST5-4** | One-time use | Scan same QR twice → 2nd scan fails with generic error; new QR works |
| **ST5-5** | Successful device creation | Scan → `sl_dev` cookie set → `/` loads Sideline → device listed in `GET /api/devices` |
| **ST5-6** | Sliding cookie | Authenticated request → `Set-Cookie` with `Max-Age=2592000`; `lastSeenAt` updated in registry |
| **ST5-7** | Revoked device | Revoke in Settings → phone gets 401 → "Device removed, pair again" |
| **ST5-8** | Offline host | Desktop stopped → QR scan → 503 `host_offline` → "Desktop offline" UI |
| **ST5-9** | Reconnect | Desktop restart → phone auto-reconnects (SSE) or manual refresh works |
| **ST5-10** | Two-device pairing | Pair phone A → pair phone B → both listed in devices, independent `sl_dev` |
| **ST5-11** | No credential leakage | Secret not in: QR image alt text, page source, console.log, network payloads (except exchange body), history after `replaceState` |

---

## 14. Recommended Bounded Implementation Slices (INFERENCE)

| Slice | Scope | Files Touched | Dependencies |
|-------|-------|---------------|--------------|
| **5A: Pairing Route & Fragment Consumer** | Add `GET /pair` static page; read `location.hash`; POST to `/api/pairing/exchange`; on success `replaceState('/')` | `daemon.ts` (new route), `index.html` (new `/pair` HTML + JS) | Stage 4E green |
| **5B: "Send to Phone" Desktop UI** | Settings card: "Remote Access" disclosure → "Send to Phone" button → QR modal with live countdown, fallback code, cancel | `index.html` (settings card + modal), JS (pairing creation, modal lifecycle) | 5A |
| **5C: Phone Pairing UX** | `/pair` page: loading spinner, success animation, error states (expired, used, offline, burned), "Open Sideline" button | `index.html` (`/pair` page JS) | 5A |
| **5D: Pairing Confirmation Signal** | SSE event `pairing-complete` broadcast from daemon after exchange; modal listens and shows "Phone paired!" | `daemon.ts` (broadcast), `remote-dispatch.ts`, `index.html` (SSE listener in modal) | 5B |
| **5E: Device Management UI** | Settings → "Paired Devices" list → rename/revoke/revoke-all; shows last seen | `index.html` (settings card), JS (device API calls) | 5B |
| **5F: Mobile Viewport Polish** | Ensure `/` and `/pair` work on phone: safe-area, touch targets, reader font sizes | `index.html` (CSS @media) | 5C |

**Total new code estimate:** ~400 lines (HTML/JS/CSS) + ~50 lines (daemon route + SSE event). Zero protocol changes.

---

## 15. Limitations & Gaps

| Gap | Type | Notes |
|-----|------|-------|
| No `/pair` route exists | FACT | Must be added in 5A |
| No SSE `pairing-complete` event | FACT | Must be added in 5D for modal confirmation |
| No `public` device list endpoint | FACT | Modal cannot poll devices; needs SSE or new route |
| QR code generation lib not in repo | UNKNOWN | Will need `qrcode` or similar (tiny, no deps preferred) |
| Stage 4D/4E not green | FACT | Implementation blocked per SOP |
| Rate limiter may affect phone asset loads | INFERENCE | 4C finding #1; may need `RATE_HTTP_PER_MIN=300` for beta |
| No automated QR visual test | UNKNOWN | Manual verification required |

---

## 16. Contradictions Found

| Claim | Reality | Source |
|-------|---------|--------|
| "QR URL can directly be `https://h-<hostPublicId>.<RELAY_DOMAIN>/pair#<secret>`" | **False** — `/pair` route does not exist | `DAEMON_ROUTE_POLICIES`, `daemon.ts` |
| "Stage 4 complete" | **False** — 4D/4E in progress | Stage 4 Field Packet, 4C Report |

---

## IMPORTANT FILES / PATHS

```
src/control-plane/pairing.ts              # Pairing protocol (core)
src/control-plane/device-registry.ts      # Device credentials & persistence
src/control-plane/daemon.ts               # HTTP endpoints (pairing create/exchange)
src/control-plane/remote-dispatch.ts      # sl_dev auth, remote-device principal
src/control-plane/remote-routes.ts        # Route access classification
src/control-plane/relay-client.ts         # expectedOrigin derivation
src/public/index.html                     # All frontend (HTML + CSS + JS)
test/remote-access-v1-stage2.test.mjs     # Pairing/device contract tests
test/remote-access-v1-stage3.test.mjs     # Relay/adapter contract tests
test/remote-access-v1-stage4-hardening.test.mjs  # Production hardening tests
REPORTS/AntiGravity/Remote-Access-v1-Stage-4-Production-Field-Packet__20260923__AntiGravity.md
REPORTS/Claude/Remote-Access-v1-Stage-4C-Cloud-Deployment-Wildcard-TLS__20260923__Claude.md
```

---

## EPISTEMIC LABELS USED

- **FACT** — Directly observed in source code or test assertions
- **INFERENCE** — Reasoned from facts; not yet implemented
- **UNKNOWN** — Not observed; cannot confirm
- **CONTRADICTION** — Claim vs. reality mismatch identified
- **ARCHITECT DECISION REQUIRED** — None in this report (all bounded by existing seams)

---

**END OF RECONNAISSANCE**  
*This report is reconnaissance, not final architectural authority. The Stage 5 Architect owns design decisions.*

### Full report — lane stage5-main-settings-ui-seams (sideline-scout-balanced)

**RESULT**  
The Sideline Coach UI is a single‑page application contained in `src/public/index.html`. The main page (the scrollable region `<main id="gameScrollRegion">`) consists of a header followed by a sequence of cards: **authCard** (Access), **recruitCard** (Scouting), **rosterCard** (Roster), **incomingCard** (Latest Report), and **outgoingCard** (Play Dispatcher). The Settings UI is a hidden `<section id="settingsView">` that presents a vertical list of disclosable cards (mode‑settings, live‑player‑terminal, scout‑intelligence, coach‑routines, game‑setup, routing, players‑providers, usage‑budgets, stadiums, github‑repositories, time‑format, ai‑usage‑scorecard). The AI Usage Scoreboard (`<div id="aiScoreboardContainer">`) is a flex sibling of the main scroll region.

**KEY DISCOVERIES**  
- The page already provides a generic modal seam (`#confirmModal`) used for confirmation dialogs (lines 2023‑2032) and a reusable browsing sheet (`#gameBrowserSheet`) for file‑folder selection (lines 1994‑…).  
- The central refresh routine `refresh()` (lines 5801‑5826) polls `/api/status` and `/api/reports`, updates UI, hides auth, and reconciles connection state.  
- Settings cards follow a uniform pattern: a `<div class="settings-card settings-disclosure">` with a header button (`settings-disclosure-header`) and a collapsible body (`settings-disclosure-body`).  
- No existing Remote Access API endpoints appear in the script; all current endpoints relate to reports, dispatch, preferences, routines, and health telemetry.  
- The visual header already contains a connection indicator and a Settings button in `.header‑actions`; adding a third button there would preserve the existing layout and visual hierarchy.

**FACT**  
- The main page hierarchy is: `body > main#gameScrollRegion > header`, then sequentially `section#authCard`, `section#recruitCard`, `section#rosterCard`, `section#incomingCard`, `section class="card"` (outgoing Play Dispatcher) – all visible within the scrollable region (lines 1430‑1626).  
- The Settings UI is hidden by default (`settings-view[hidden]` CSS) and revealed via `$('#settingsBtn').click()` → `openSettings()` (lines 7113‑7127).  
- The generic confirmation modal is defined by `.modal-backdrop` and `.modal` CSS (lines 746‑760) and instantiated as `<div id="confirmModal" class="modal-backdrop" hidden> … </div>` (lines 2023‑2032).  
- The `refresh()` function (lines 5801‑5826) performs `await Promise.all([api('/api/status'), api('/api/reports')])`, then calls `renderStatus`, `renderReports`, `fetchAiHealth`, `hideAuth`, and updates connection state.  
- Settings cards are constructed using the pattern seen in `modeSettingsCard` (lines 1639‑1649), `livePlayerConsoleCard` (lines 1661‑1714), etc., each with a header button and a collapsible body.  
- The following API endpoints are invoked in the script: `/api/status`, `/api/reports`, `/api/events` (SSE), `/api/session`, `/api/work/acknowledge`, `/api/player-activity`, `/api/scout/*`, `/api/preferences`, `/api/routines/*`, `/api/games/filesystem/*`, `/api/dispatch`. No endpoints related to remote access (pairing, device list, toggle) are present.  
- The visual header actions are located in `<div class="header-actions">` (lines 1451‑1454) and currently contain a `.connection` element and the `#settingsBtn` button.  

**INFERENCE**  
- A “Send to Phone” button would fit naturally as a third element in `.header‑actions`, aligned with the existing Settings button, because the header already groups compact actions (connection status, settings) and the main page is intended to expose a single outcome action (SEND TO PHONE) without becoming a dashboard.  
- The QR pairing dialog could reuse the existing `#confirmModal` markup and styling (modal backdrop + centered modal) – the same pattern used for the “Remove Player” confirmation – by replacing its title/body/actions with QR‑code display and a Cancel button.  
- Remote Access state can be derived from a combination of `connectionState` (`connected`/`reconnecting`/`offline`) and a new preference flag (e.g., `remoteAccessEnabled`) stored via `/api/preferences`. The UI would reflect:  
  - *Unavailable*: `connectionState !== 'connected'`  
  - *Available*: `connectionState === 'connected'` & `remoteAccessEnabled === false`  
  - *Pairing ready*: `remoteAccessEnabled === true` & no active pairing  
  - *Waiting for phone*: after user taps “Send/Pair another device” and QR displayed  
  - *Paired*: after phone scans QR and reports success via `/api/remote-access/pair`  
  - *Phone connected*: when a device shows active session in `/api/status`  
  - *Desktop/relay offline*: `connectionState === 'offline'`  
  - *Error*: non‑OK response from remote‑access APIs  
- The Settings IA already supports a new card; a logical place for Remote Access is after the Mode Settings card (Dad Mode) and before the Live Player Terminal card, preserving the top‑to‑bottom flow of account‑related → device‑related → advanced‑feature sections.  
- Device‑list updates would arrive via the existing status‑refresh mechanism (`refresh()`) or SSE `status`/`reports` events, because the Control Plane would expose paired devices in `/api/status` (or a dedicated `/api/remote-access/status`) which `renderStatus` already consumes.  
- Since no remote‑access endpoints are observed, implementing the feature would require adding new API routes in the Control Plane (e.g., `/api/remote-access/*`). The UI layer would only need to call those endpoints and update state accordingly.  
- Adding the button, modal, settings card, and wiring their click handlers to the new endpoints would be the smallest viable slices, each of which can be tested independently.  

**UNKNOWN**  
- Whether the Control Plane already exposes remote‑access related data in `/api/status` or `/api/reports` under a different key (no evidence found).  
- The exact shape of the pairing payload (e.g., whether a QR code is represented as a data‑URL or a base64 string) and which endpoint delivers it.  
- Whether the existing `connectionState` transitions already reflect relay‑only versus phone‑connected states, or whether a distinct `remoteAccessState` is needed.  
- The precise naming and default values for the new preference(s) that would gate Remote Access (e.g., `remoteAccess.enabled`, `remoteAccess.relayUrl`).  

**CONTRADICTION**  
- None observed within the scoped UI code; all patterns are consistent and extensible.

**IMPORTANT FILES / PATHS**  
- `src/public/index.html` – the sole UI source; modifications would be confined to this file for the button, modal, settings card, and associated event listeners.  
- (Backend API contracts are out of scope for this read‑only reconnaissance; any required endpoint additions would reside in the Control Plane TypeScript files under `src/control-plane/`.)  

---  
**Scout ID:** stage5-main-settings-ui-seams  
**Assigned model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Note:** This report is reconnaissance, not final architectural authority.  

---  
*End of report.*

### Full report — lane stage5-acceptance-slicing-dad-experience (sideline-scout-quick)

# SCOUT PLAY — READ-ONLY RECONNAISSANCE

You are acting as a Sideline Coach Read-Only Reconnaissance Scout.

Do not modify production code, tests, configuration, architecture documents,
breadcrumbs, git state, packages, runtime state, or unrelated files.
Do not commit, push, reset, clean, stash, or implement a fix.

QUESTION / OBJECTIVE:
SCOUT Stage 5 Product Acceptance Reconnaissance: Define the Dad-facing Remote Access pairing experience for "click Send to Phone → scan QR → done" workflow. Stage 4D is field-tested, Stage 4E is not complete. Must eliminate all developer steps (pairing codes, DevTools, env vars, manual URLs, manual code entry). Must determine exact Stage 5 entry condition from Stage 4E, smallest slice sequence, Dad acceptance criteria, human action paths, pairing success communication, Remote Access defaults, zero-setup invariants, anti-goals, GO/NO-GO checklist, and field test scenarios.

SCOPE:
C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\*
C:\Users\dmcal\Documents\GitHub\SidelineCoach\test\remote-access-v1-*.test.mjs
C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\remote-redaction.ts
C:\Users\dmcal\Documents\GitHub\SidelineCoach\Project SOP\Breadcrumbs\Remote-Access-Architecture.md
C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Architecture-Decision__20260923__Claude.md
C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\control-plane\remote-*.ts
C:\Users\dmcal\Documents\GitHub\SidelineCoach\src\scout-*.ts
C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\AntiGravity\*

Your job is to map what exists and compress the evidence for a future Architect or Worker. Do not silently redesign the subsystem.

Return a complete Scout Report containing:

REPORT TYPE: SCOUT REPORT
SCOUT AGENT: opencode
SCOUT MODEL: openrouter/cohere/north-mini-code:free
SCOUT REASONING / EFFORT: Provider default / discovery-focused
SCOUT ROLE: Read-Only Reconnaissance Scout
SCOUT SCOPE: Stage 5 product acceptance analysis of Dad-facing Remote Access experience
RECONNAISSANCE DEPTH: Standard
SCOUT DATE / TIMESTAMP: 2026-09-23T23:06:56-04:00

This report is reconnaissance, not final architectural authority.

# Executive Map

## Question Investigated

Define Stage 5 as a product acceptance problem that transforms the existing production transport (Stage 1-4D) into a seamless Dad experience: "Dad clicks one thing and Sideline follows him" without infrastructure visibility.

## Current Truth

Stage 4D (client IP) is field-tested and implemented. Stage 4E is not complete - currently pairing/device registry exists but Dad-facing UX is missing. The infrastructure MUST disappear per requirements (no manual pairing codes, DevTools, env vars, manual URLs, manual code entry). Must evolve from developer-focused APIs to user-centric flows.

## Evidence Map

**Existing Infrastructure (WHAT IS):**
1. Pairing APIs: `POST /api/pairing/create` (local-only), `POST /api/pairing/exchange` (public, secret-gated)
2. Device registry with SHA256-hashed tokens, 30-day expiry
3. In-process remote adapter with device cookie authentication
4. Remote routes with default-deny policy, local-only routes (`/api/devices`, `/api/pairing/create`)
5. Pairing store: memory-only, one active pairing, codes expire in 5 minutes
6. No Dad-facing pairing UI exists in any current source

**Missing UX Components:**
1. No browser pairing landing flow
2. No QR scanning interface in mobile UI
3. No "Send to Phone" button/desktop UI
4. No Remote Access settings card for pairing/devices
5. No responsive mobile polish for pairing
6. No final Dad field acceptance workflow

# Relevant Files / Symbols / Ownership Seams

## Core Infrastructure Files

**Stage 1-3 (Implemented):**
- `src/control-plane/remote-routes.ts` - route policy definitions including pairing routes
- `src/control-plane/remote-dispatch.ts` - InProcessRemoteAdapter, pairing exchange logic
- `src/control-plane/device-registry.ts` - device token storage and authentication
- `src/control-plane/pairing.ts` - pairing store, QR/secret generation, exchange logic
- `src/remote-redaction.ts` - remote output redaction policies

**Tests (Evidence):**
- `test/remote-access-v1-stage2.test.mjs` - pairing API tests (Stage 2)
- `test/remote-access-v1-stage3.test.mjs` - relay/transport adapter tests (Stage 3)
- `test/remote-access-v1-stage4c-bootstrap.test.mjs` - remote relay bootstrap tests (Stage 4C)
- `test/remote-access-v1-stage4d-client-ip.test.mjs` - client IP config tests (Stage 4D)

**Architecture Documents:**
- `Project SOP/Breadcrumbs/Remote-Access-Architecture.md` - durable breadcrumb showing current state and planned evolution
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` - original ADR

# Execution / Data Flow

## Current Developer Flow (WHAT IS):

1. **Desktop Developer**: Calls `POST /api/pairing/create` (Bearer token required)
2. **Gets QR secret + fallback code** (8 chars, base32 alphabet)
3. **Developer shows QR code or code** to phone user manually
4. **Phone User**: Manually enters code or scans QR (development-only)
5. **Exchange**: `POST /api/pairing/exchange` with secret/code → gets `sl_dev` cookie
6. **Remote Access**: Uses in-process adapter for all remote requests

## Stage 5 Desired Flow (TO BE):

1. **Dad Desktop**: Clicks "Send to Phone" button → automatic pairing initiation
2. **Automatic QR generation**: QR code displayed, automatically scannable
3. **Dad Phone**: Scans QR → automatic pairing exchange
4. **Success confirmation**: Both desktop and phone show pairing success simultaneously
5. **Infrastructure disappears**: No visible pairing codes, no manual steps, no developer tools required

# FACTS

## Implemented Components (FACT):

1. **Pairing Store**: Memory-only, SHA256 hashes only, 5-minute TTL, 5-attempt burn policy
2. **Device Registry**: 30-day sliding expiry, SHA256 token hashes only, no raw token persistence
3. **Route Policy**: `/api/pairing/create` local-only, `/api/pairing/exchange` public, `/api/devices` local-only
4. **In-Process Adapter**: Handles `POST /api/pairing/exchange` without `sl_dev` cookie
5. **Authentication**: Device cookie authentication with 30-day Max-Age, origin validation
6. **Security**: Cookie not passed to daemon handlers, headers allowlist, CSRF protection

## Missing Components (FACT):

1. **No pairing landing page**: No browser-based pairing initiation flow
2. **No "Send to Phone" UI**: No Dad-facing button or desktop UI element
3. **No QR scanning**: No mobile scanning interface for pairing QR codes
4. **No device management UI**: No settings card showing paired devices
5. **No success feedback**: No simultaneous desktop/phone success confirmation
6. **No automatic pairing**: No infrastructure to automatically initiate pairing

# INFERENCES

## Architecture Inferences:

1. **Stage 4E Entry Point**: Stage 5 entry condition is "Dad clicks Send to Phone → automatic QR generation → phone scans → pairing established without manual intervention"

2. **Developer Steps to Eliminate**: Manual pairing codes, DevTools Console usage, environment variable configuration, manual host URL entry, manual pairing code entry - all must disappear

3. **Default State Requirements**: Remote Access should probably default OFF, enable on first pairing, remain enabled after first successful pairing (based on current preferences defaulting to false)

4. **Success Communication**: Pairing success must be communicated simultaneously on both desktop and phone through UI elements

5. **Integration Points**: Stage 5 must integrate with existing Stage 1-4D security foundation while adding Dad-facing UX layers

# UNKNOWNS

1. **Dad-facing UI Architecture**: No existing pairing UI in codebase - unknown how this should integrate with existing extension UI
2. **Mobile App Integration**: Unknown how pairing QR should work with mobile Sideline Coach app
3. **Settings Card Design**: Unknown what fields/settings card should show for device management
4. **Responsive Design**: Unknown how pairing flow should work across desktop/mobile screen sizes


5. **Success Confirmation Patterns**: Unknown what constitutes "simultaneous communication" of pairing success
6. **Default Remote Access State**: Unknown whether current `remoteAccess.enabled: false` default should change
7. **Zero-Setup Flow**: Unknown what the minimal user actions should be for first-time setup
8. **Network Transition Support**: Unknown how pairing should handle Wi-Fi/cell switching scenarios

# CONTRADICTIONS

1. **Current vs Desired**: Current implementation requires manual developer intervention; Stage 5 requires zero manual intervention
2. **Visibility vs Infrastructure**: Current pairing exposes developer tools; Stage 5 requires infrastructure to remain completely invisible
3. **Security vs UX**: Current pairing security focuses on developer tools; Stage 5 needs security for non-technical users
4. **Memory vs Persistence**: Current pairing store is memory-only (survives daemon restart but not new machine); Stage 5 may need cross-device persistence

# Architecture Decisions Still Required

1. **Pairing Initiation Trigger**: Should Stage 5 pairing start automatically (e.g., when Dad runs first play) or require explicit "Send to Phone" click?
2. **QR Generation Flow**: Should pairing QR be generated automatically when Dad clicks "Send to Phone" or require additional confirmation?
3. **Mobile App Integration**: Should Stage 5 pairing work with existing Sideline Coach mobile app or require new mobile UI?
4. **Device Management Location**: Where should device management appear (Settings card, desktop UI, mobile app)?
5. **Success Notification Timing**: What constitutes "simultaneous" success confirmation - same page load, same moment, coordinated timing?
6. **Remote Access Defaults**: Should Remote Access default off, enable on first pairing, or require explicit opt-in?
7. **Network Transition Support**: How should pairing handle network changes (cellular to Wi-Fi, phone returns to network)?
8. **Persistence Strategy**: Should pairing tokens persist across device restarts, new machines, or stay memory-only?

# What Does NOT Need Architecture

1. **Security Foundation**: Stage 1-4D security (route policies, redaction, authentication) is complete and should not be redesigned
2. **Transport Layer**: Stage 2-3 transport (in-process adapter, relay architecture) is complete and should not be redesigned
3. **Device Registry Logic**: Current device registry with SHA256 hashes and expiry logic should remain unchanged
4. **Basic Pairing Logic**: Secret/code generation, hash storage, exchange logic should remain

# Risks / Boundaries

1. **Security Reduction Risk**: Simplified UX may introduce security vulnerabilities if user education is insufficient
2. **Device Management Complexity**: Managing multiple devices with simplified UI may lead to confusion
3. **Network Transition Risk**: Handling network changes during pairing may introduce connection reliability issues
4. **Mobile Integration Risk**: Integrating with mobile app may introduce compatibility or platform-specific issues
5. **User Error Risk**: Removing manual verification steps may increase user error potential
6. **Support Burden Risk**: Simplified flows may create new support issues when things go wrong

# Recommended Next Agent / Model / Effort

1. **Quick Scout (North Mini Code)**: Investigate existing UI architecture to understand where pairing flow should integrate
2. **Default Scout (Laguna S 2.1)**: Examine mobile app architecture to understand QR scanning integration points
3. **Deep Scout (Nemotron 3 Ultra)**: Analyze user experience requirements and security implications of removing manual steps
4. **Sonnet-Architect**: Make architectural decisions on pairing initiation triggers and success communication patterns
5. **Opus-Architect**: Synthesize cross-cutting concerns (security, UX, persistence) for complete Stage 5 design

# What the Future Architect Should Verify

1. **Current Pairing APIs**: Verify exact contract of `POST /api/pairing/create` and `POST /api/pairing/exchange`
2. **Device Registry Behavior**: Verify device authentication, expiry, and revocation mechanisms
3. **Route Policy Enforcement**: Verify local-only vs remote-read classifications for all pairing-related endpoints
4. **Security Boundaries**: Verify no security weaknesses in current pairing implementation
5. **Integration Points**: Identify all extension/mobile app hooks for pairing flow integration

# What the Future Architect Should NOT Need to Rediscover

1. **Stage 1-4D Security**: Existing security foundation (route policies, redaction, authentication) should remain unchanged
2. **Transport Architecture**: In-process adapter and relay transport should remain as-is
3. **Device Registry Core Logic**: SHA256 storage, expiry logic, authentication mechanisms should remain
4. **Basic Pairing Operations**: Secret/code generation, exchange logic, hash storage should remain

# WAS / IS / WILL BE

## WAS (Before Stage 5):

- **Developer Tools Required**: Manual pairing codes, DevTools, environment variables, manual URLs
- **UX Complexity**: Manual code entry, multiple manual steps, developer intervention required
- **Security Focus**: Developer-focused security, enterprise authentication
- **Visibility**: Developer tools visible, infrastructure exposed

## IS (Current State):

- **Pairing APIs Exist**: `POST /api/pairing/create` (local-only), `POST /api/pairing/exchange` (public)
- **Device Registry**: SHA256-hashed tokens, 30-day expiry, memory-only storage
- **Security Foundation**: Route policies, redaction, authentication complete
- **Missing UX**: No Dad-facing pairing UI, no QR scanning, no device management

## WILL BE (Stage 5):

- **Developer Tools Disappear**: No manual pairing codes, DevTools, env vars, manual URLs
- **UX Simplified**: "Click Send to Phone → scan QR → done" - zero manual steps
- **Security Maintained**: Same security foundation, enhanced for non-technical users
- **Infrastructure Invisible**: Relay transport, pairing mechanism completely transparent to Dad

# Scout Limitations

1. **No UI/UX Design Capability**: Cannot design or prototype new UI components
2. **No Security Architecture Redesign**: Cannot modify existing security policies or implementations
3. **No Implementation Capability**: Cannot write code for new pairing flows or mobile integrations
4. **No Testing Infrastructure**: Cannot run actual user testing or field validation
5. **No Production Deployment**: Cannot deploy or validate Stage 5 in real environment

This reconnaissance identifies Stage 5 as a significant product acceptance challenge requiring UI/UX design, security adaptation for non-technical users, and integration across desktop/mobile platforms while maintaining existing security foundations.

## Recommended next step

Review the surviving Scout reports above; decide whether the unfilled lanes justify a new Scout Play before forwarding to an Architect.

## Evidence

Durable evidence folder: C:\Users\dmcal\.sideline\Scout Intelligence\remote-access-v1-stage5-recon-20260923-230656
Working folder: C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\remote-access-v1-stage5-recon-20260923-230656

