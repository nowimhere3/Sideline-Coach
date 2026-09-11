# SIDELINE COACH — MASTER PRODUCT BREADCRUMBS & ROADMAP

**Purpose:** One editable source of truth for product ideas, protected architectural breadcrumbs, UX principles, roadmap items, and proven behavior.

**Operating rule:** This document is not an implementation order carved in stone. It is a living map. Ideas can move between **IS**, **NEXT**, **WILL BE**, and **PARKED** as evidence changes.

---

# 1. NORTH STAR

## Human simplicity is the primary design constraint

Sideline Coach exists to let the human make decisions while the machine carries mechanical burden.

The normal user should think in:

**Game → Players → Reports → Plays → Send**

The normal user should NOT have to think in:

- extension hosts
- executable paths
- ports
- shell wrappers
- process IDs
- PATH resolution
- terminal plumbing
- provider-specific launch syntax
- install commands
- model flags
- environment internals

### Durable UX rule

> **Hide plumbing by default. Reveal it only when it changes a human decision.**

Advanced/debugging surfaces may expose plumbing when useful. Normal product surfaces should not.

---

# 2. CORE PRODUCT LOOP

The fundamental Sideline Coach economy loop is:

1. A Player produces a report.
2. Coach detects and surfaces it.
3. Human huddles with Strategy AI.
4. Strategy AI advises GO / FIX / STOP / AMEND / REWRITE.
5. Human approves the next Play.
6. Coach dispatches the Play to the intended Player.
7. Player executes.
8. Report returns.
9. Repeat.

### Durable role split

> **VS Code / terminal agents execute. Conversational Strategy AI strategizes.**

Players are execution agents.

Strategy AI is the coaching / reasoning layer.

The human remains final product authority.

---

# 3. TERMINOLOGY

## Game

A **Game** is the project / repository being coached.

Examples:

- GS3
- Browser Gallery
- FloppyDisk
- Sideline Coach

Game is the primary customer-facing top-level concept.

## Stadium

A **Stadium** is the execution environment where a Game is currently running.

Examples:

- local Windows VS Code
- GitHub Codespaces
- cloud development environment
- future supported remote environments

### Rule

> **Stadium ≠ Game.**

A Game may move between Stadiums or eventually exist in multiple Stadiums without becoming a different Game.

Most users should not need to see the Stadium concept unless the environment itself affects a decision.

## Player

An execution agent such as:

- Claude
- Codex
- AntiGravity
- future supported agents

## Play

A bounded task / prompt dispatched to one Player instance.

## Incoming

Reports, events, or other work returning from Players.

---

# 4. GLOBAL STAGE / REPORT NUMBERING

Report numbering is **global to the Project**, never per Player.

Example:

- Stage 1.1
- Stage 1.2
- Stage 1.3
- Stage 1.4
- Stage 1.5
- Stage 1.6
- Stage 1.7

Claude, Codex, AntiGravity, ChatGPT, or any future agent does not own a separate counter.

The next accepted report receives the next chronological number regardless of who produced it.

### North Star rationale

The system keeps the filing cabinet straight.

The human does not carry a backpack full of papers and manually reconstruct chronology.

---

# 5. CURRENTLY PROVEN — IS

## Player Discovery

Coach dynamically discovers whether supported Player commands exist in the current Stadium.

Durable command identities:

- Claude → `claude`
- Codex → `codex`
- AntiGravity → `agy`

### Rule

> **Player commands are durable identities. Machine-specific resolved executable paths are runtime evidence.**

Do not hard-code Windows paths or other machine-specific installation locations into product architecture.

## Put Player on Field

Coach can:

- discover an available Player
- create the correctly identified VS Code integrated terminal
- launch the Player through the Stadium's normal shell
- show the Player as On Field

This has been proven live with:

- Claude
- Codex
- AntiGravity

## Shell ownership

Player launch should preserve the environment's normal shell configuration wherever practical.

This lets existing:

- PATH
- aliases
- functions
- PowerShell profiles
- wrappers
- user configuration

remain authoritative.

## Multiple Player instance architecture

Player type, Player instance identity, terminal handle, seat, and human-facing field label are separate concepts.

Mutable presentation must never become routing identity.

## Dispatch safety

New Coach-created Player instances are authorized by Coach provenance / PlayerRoster registration rather than by visible terminal name.

Generic terminals do not become Players merely because they are named like one.

Legacy name-based dispatch remains a temporary compatibility path.

## F5 development launch

The explicit compile preLaunch task has been repaired and normal F5 / Run → Start Debugging has been proven working again.

---

# 6. ACTIVE DRIVE — NEXT

## Reload adoption correction

Observed platform truth:

VS Code persistent terminals can survive a window reload, but `TerminalOptions.env` markers are not preserved through persistent terminal reconnection.

Additional observed wrinkle:

restored terminals arrive asynchronously and must be observed through the terminal lifecycle rather than assumed to exist synchronously at extension activation.

### Required design goal

Safely re-adopt surviving Player instances after reload without weakening the rule:

> A terminal must not become an authorized Player merely because its visible name resembles `Codex 2`, `Claude 3`, etc.

Fail safe to Unknown / not dispatchable when provenance cannot be established.

## Browser live-state reconnection contract

### WAS

Browser state was fetched on initial load and later delta events, but an SSE `hello` after automatic reconnection was treated as proof of freshness. A dead Coach runtime could therefore leave stale DOM marked Connected.

### IS

Browser connection state and data freshness are coupled. Reconnecting / unverified state is explicit and live mutating controls are unavailable. An SSE `hello` triggers the existing canonical status-and-reports refresh; only successful rendering of that refresh marks the browser Connected.

### WILL BE

All live Sideline Coach surfaces must dynamically converge on current truth without a human browser refresh, including Player activity/liveness, Incoming, Outgoing, usage/capacity telemetry, reset countdowns, notifications, and other live Game state. Data-source mechanisms may differ, but manual refresh is not product workflow.

## Live Incoming reports

### WAS

Incoming report UI could remain stale until some later refresh, restart, or manual synchronization.

### IS

New valid reports automatically propagate through the canonical Coach report scan to the open browser. Latest Report and Recent reports update without browser refresh, and existing history remains available. When report refreshes overlap, only the newest requested canonical projection may render.

### WILL BE

All live Coach information should update automatically at the appropriate data seam, including future report activity, Player activity, permission requests, usage/capacity telemetry, reset countdowns, and notifications. No-manual-refresh is a product contract, not a one-off Player-state fix.

---

# 7. MULTIPLE PLAYER INSTANCES

## Protected requirement

A Game must support multiple simultaneous instances of the same Player.

Examples:

- Claude
- Claude 2
- Claude 3
- Codex
- Codex 2
- AntiGravity
- AntiGravity 2

Each instance must be independently dispatchable.

Closing one instance must not redirect its Plays to another sibling.

## Seat behavior

Human-facing seat numbers should remain stable while siblings remain alive.

Example:

If:

- Codex closes
- Codex 2 remains

then the next added instance should be:

- Codex 3

not a replacement Codex 1.

When all instances of that Player type are gone, numbering may reset.

---

# 8. DYNAMIC FIELD LABELS

## Protected requirement

Player labels should eventually communicate useful live information while remaining presentation only.

Examples:

- `Codex · Terra · Low`
- `Codex 2 · Luna · Medium`
- `Claude · Opus · High`
- `Claude 2 · Sonnet · Medium`
- `AntiGravity · Gemini 3.8 Flash · High`

### Rule

> Model, effort, seat, and display label are mutable presentation/runtime state. They are not Player identity.

The richer label should appear in Coach UI first.

Dynamic renaming of VS Code terminal tabs is optional presentation and must never be required for correctness.

---

# 9. ROSTER UX

## Collapsible Roster

### WAS

Roster setup controls permanently occupied vertical space even after the team was assembled.

### IS

Roster can collapse into a compact live `Players · N On Field` summary derived from canonical Player-instance state. Expanded Roster retains setup and Player controls; collapsed Roster yields screen space to active coaching work.

### WILL BE

Setup-heavy product surfaces should generally yield attention once setup is complete. Future status, footer, and settings surfaces may use the same principle: important information remains available without permanently dominating the workspace.

The Roster is valuable while assembling the team.

Once Players are on field, it should yield screen space to active work.

### Desired behavior

Expanded:

- Claude — On Field
- Codex — On Field
- Codex 2 — On Field
- AntiGravity — On Field
- Add another

Collapsed:

**Players · 4 On Field**

### Rule

> Setup-heavy UI should stop consuming attention after setup is complete.

Keep the existing card visually consistent.

No unnecessary page redesign.

---

# 10. MULTIPLE GAMES

## Protected WILL BE requirement

Sideline Coach must support many independent Games.

Current work intentionally proves one Game first.

Future example:

- GS3 — 4 On Field
- Browser Gallery — 2 On Field
- FloppyDisk — 1 Incoming
- Stream Loop — Ready

Each Game owns its own:

- roster
- Player instances
- reports
- staged Plays
- runtime status
- history
- incoming activity

### Isolation rule

> Activity in one Game must never accidentally route a Play, Player, report, or state into another Game.

The human should switch Games through a simple top-level Game selector without seeing window/process/port plumbing.

---

# 11. ENVIRONMENT-AGNOSTIC ORCHESTRATION

## Protected WILL BE requirement

Sideline Coach should preserve the same human workflow across supported Stadiums.

Possible Stadiums include:

- local desktop VS Code
- GitHub Codespaces
- cloud development environments
- future remote environments

Environment-specific adapters absorb capability differences.

### Rule

> The human coaches the Game, not the machine hosting it.

Some Stadiums may support opening desktop windows.

Others may be completely self-contained.

Product architecture must not assume every Stadium has identical capabilities.

---

# 12. GAME SETUP / PUT TEAM ON FIELD

## Warm-start behavior — proven direction

When Players already exist:

**Discover → Ready on Bench → Put on Field**

## Cold-start behavior — PARKED SIDE QUEST

Future fresh Stadium setup:

**Discover → Install if missing → Authenticate if needed → Verify → Put on Field → Ready**

This is important but deliberately parked while the core orchestration model is proven.

---

# 13. FRESH STADIUM PROVISIONING — PARKED

## Protected requirement

On a brand-new Codespace / cloud environment / machine, Coach should determine whether configured Players exist.

Possible states:

- Not Installed
- Installed / Needs Authentication
- Ready on Bench
- On Field

### Installation

If a Player is missing, Coach should eventually offer a guided or one-action installation path where supported.

Machine-changing installation requires explicit human authorization.

### Authentication

Installation state and authentication state are separate.

Coach should use provider-native supported authentication flows such as:

- browser / OAuth
- device-code flow
- provider-supported API-key flow
- other supported provider mechanisms

Coach should automate safe mechanical steps without becoming the casual long-term owner of provider credentials.

### Human-facing goal

**Set Up Game → Put Team on Field → Play Ball**

---

# 14. CLICK-FIRST ORCHESTRATION

## Protected interaction rule

> **Routine development should become click, select, approve, send, and copy/paste only when unavoidable.**

The human should not need to remember:

- install commands
- launch commands
- terminal names
- model flags
- auth commands
- paths
- ports
- setup sequences

Whenever a mechanical step can be represented safely as a button or automation, Coach should carry that burden.

The human should make decisions, not operate machinery.

---

# 15. GENERIC TERMINAL

## WILL BE

Coach should eventually provide an:

**Open Terminal**

action.

A generic terminal is not automatically a Player.

### Security rule

> Player terminal and generic terminal are different concepts.

Generic terminals must not enter PlayerRoster or dispatch authorization merely because of their name.

---

# 16. PLAYER LIVENESS / INTERVENTION

## Protected WILL BE requirement

Silence from a Player does not necessarily mean completion.

Coach should eventually distinguish states such as:

- Actively Working
- Waiting for Permission
- Waiting for Human Input
- Quiet / Potentially Stale
- Complete
- Unknown

This is particularly relevant for agents such as AntiGravity that may occasionally begin a process and then sit quietly waiting for a nudge.

## Bounded nudge

Coach may eventually support a scoped nudge action when a Player appears stale.

Examples conceptually:

- Continue
- Keep Going
- Status?
- Resume Play

A nudge must remain bounded to the current Player/Play context.

---

# 17. PER-PLAY PERMISSION & AUTONOMY POLICY

## Protected WILL BE requirement

The human should ultimately control how much autonomy each Play receives.

Potential palette:

### ASK ME

Surface permission/input requests to the human.

### APPROVE FOR THIS PLAY

Approve routine permission requests within the current Play boundary.

### AUTONOMOUS WITHIN PLAY FENCE

Allow the Player to act autonomously inside the explicitly approved task authority while respecting hard scope fences.

### Rule

> Autonomy policy is scoped to the Player/Play unless the human deliberately chooses a broader policy.

Broad technical capability never expands task authority.

Coach should eventually surface permission requests and allow explicit human intervention rather than forcing the human to remote-desktop into the terminal.

---

# 18. PLAYER CAPACITY / USAGE TELEMETRY

## Protected WILL BE requirement

Coach should query reliable capacity information exposed by each Player/provider through Player-specific status adapters.

Possible information:

- short-window usage
- weekly usage
- remaining capacity
- reset time
- countdown to reset
- other reliable provider limits

### Rule

> Unknown is valid.

If Coach cannot observe a value reliably, show **Unknown** rather than guessing.

## Routing philosophy

Capacity telemetry informs the human.

It should not silently decide that the human has used "too much" or force cheaper routing.

The human remains final authority.

---

# 19. PERSISTENT PLAYER CAPACITY FOOTER

## Protected WILL BE UX

Player capacity/status telemetry should live in a compact persistent footer that remains visible while the human scrolls through a Game.

Conceptually:

`Claude 78% · resets 1h42m | Codex 27% | AGY Unknown`

### UX rule

> Always available, never dominant.

The footer should behave like a scoreboard strip rather than a control panel.

Future options:

- collapse
- expand
- hide
- richer detail view

Persistent information must not become persistent clutter.

---

# 20. MODEL ROUTING

## WILL BE

A Play may eventually carry:

- Player instance
- Model
- Effort / reasoning
- Prompt

Coach can use Player-specific adapters to mechanically configure the recommended model/effort before dispatch.

Different agents expose model switching differently.

Do not assume one universal command.

### Possible human-facing routing modes

- Auto
- Conserve
- Manual

Any automatic/conservative mode must still respect minimum safe capability.

### Rule

> The human approves the Play. Coach carries the mechanical model configuration.

---

# 21. PLAYER ON-FIELD DURATION

## WILL BE

Coach should eventually show how long a Player has been working.

Example:

`Codex · Terra · Low`
`🟢 On Field · 08:43`

Simple initial implementation can be local:

- start timer when Coach successfully dispatches a Play
- stop when completion is reliably observed

Do not claim report-to-instance attribution unless evidence exists.

If multiple same-type Players have overlapping work and attribution is ambiguous, show Unknown / unattributed rather than guessing.

---

# 22. REPORT CORRELATION

Current reports are primarily type-level.

Example:

`Codex Reports`

This is sufficient until Coach begins claiming instance-level facts.

Ambiguity starts when Coach wants to say:

- Codex 2 returned this report
- stop Codex 2's timer
- this report belongs to Play X

### Rule

> Never infer instance-level report ownership without evidence.

A future mechanism may use Player instance markers in reports if the need becomes real.

Do not introduce Play IDs solely because they might someday be useful.

---

# 23. STAGED PLAY / INTERNAL PASTEBIN

## WILL BE

Coach should eventually stage the next recommended Play internally.

A staged Play may contain:

- Game
- Player instance
- Model
- Effort
- Prompt

Human actions:

### SEND

Dispatch the staged Play unchanged.

### AMEND

Ask Strategy AI only for the delta/amendment, then compose it with the existing staged Play.

### REWRITE

Request a completely revised Play when the change is substantial.

### Goal

Avoid repeatedly regenerating huge prompts when only a small amendment is needed.

---

# 24. SAFE MULTILINE PLAY TRANSPORT

## Protected requirement

A Play must be treated as one atomic dispatch payload regardless of how many lines it contains.

Some terminal/agent combinations may interpret pasted newlines as repeated submit actions.

### Rule

> A 200-line Play should arrive as one Play and one submit.

Player-specific adapters should use the safest supported multiline transport rather than blindly injecting raw newline behavior.

Possible mechanisms may include:

- terminal bracketed paste behavior
- stdin
- prompt files
- provider-specific supported input mechanisms

Do not force one transport across every Player.

---

# 25. NOTIFICATIONS

## WILL BE

Coach should support in-app notifications when a Game receives:

- a report
- a meaningful Player event
- a permission/input request
- other actionable updates

Optional device push may later project the same canonical event.

### Rule

> Push delivery does not own state.

The canonical state remains inside Coach.

Tapping a notification should restore the relevant:

**Game → Player/source → Report/event → context**

---

# 26. GITHUB / GAME ONBOARDING

## WILL BE

Possible future onboarding:

1. Sign in with GitHub.
2. Authorize appropriate repositories.
3. Choose which repositories become active Games.
4. Coach joins repository identity with live runtime identity.

### Important distinction

Repository identity and runtime identity are not the same thing.

GitHub tells Coach what project/repository exists and is authorized.

The live Coach runtime tells which Games and Players are actually active.

Potential architecture:

**ACCOUNT → GAMES → LIVE GAME STATE**

Do not expose that plumbing to ordinary users.

---

# 27. SETTINGS / ACCOUNT SETUP SURFACE

## WILL BE

Sideline Coach may eventually have a dedicated Settings surface for:

- Player setup
- provider account sign-in
- authentication handoffs
- Game setup
- environment setup
- capacity/status preferences
- autonomy defaults
- notification preferences
- advanced Stadium information

Moving between local desktop, Codespaces, cloud environments, and future Stadiums should ideally become a short guided button sequence rather than a command scavenger hunt.

---

# 28. ADVANCED / DEVELOPER SURFACES

Normal users should see Games and Players.

Advanced users may need additional information such as:

- Stadium
- runtime connection
- workspace
- Player discovery details
- diagnostic state
- server state
- environment capabilities

Example:

Game: GS3  
Stadium: Local Windows / VS Code  
Coach Runtime: Connected  
Players: 4 discovered  
Browser Preview: Available

### Rule

Advanced surfaces may reveal plumbing intentionally.

Normal surfaces remain simple.

---

# 29. BROWSER PREVIEW

## WILL BE / NEAR-TERM

Browser preview is especially valuable for remote and mobile software development.

Coach should eventually make browser-preview availability easy to discover and launch without the human remembering preview commands or ports.

Environment-specific implementation may differ between:

- local desktop
- Codespaces
- cloud development environments

Normal UX should remain a button or simple action.

---

# 30. MULTI-GAME NOTIFICATION / CONTEXT RESTORE

## WILL BE

When many Games exist, Incoming must always preserve Game context.

Example:

A Browser Gallery report notification should open:

**Browser Gallery → relevant Player → report**

not merely a generic Incoming list.

The system should answer:

> **What Game needs my attention?**

---

# 31. CURRENT PRODUCT PHILOSOPHY

We are intentionally proving one Game before building the league.

Current proving Game:

**GS3**

Current objective:

- build the Coach
- put Players on the field
- run real Plays
- receive reports
- prove dispatch
- prove multiple instances
- prove reload/lifecycle behavior
- remove human terminal burden
- reach the first full touchdown

Then expand.

---

# 32. PARKED SIDE QUESTS

These are protected but should not derail the current drive.

- fresh Stadium provisioning
- installation
- authentication
- cross-Stadium account setup
- full model routing
- on-field timer
- instance-level report attribution
- Play IDs
- generic Open Terminal
- full capacity telemetry
- persistent usage footer
- device push notifications
- GitHub onboarding
- multi-Game orchestration
- multi-Stadium orchestration
- broker architecture
- advanced settings surfaces
- automated Player permission handling
- stale/nudge automation
- browser preview automation

Parking means:

**remembered, protected, not authorized merely because it is documented.**

---

# 33. ROADMAP WORKING BOARD

## IS / PROVEN

- [x] Local Coach browser UI
- [x] Report discovery
- [x] Report preview
- [x] Clipboard report flow
- [x] Dynamic Player discovery
- [x] Put Player on Field
- [x] Claude launch
- [x] Codex launch
- [x] AntiGravity launch
- [x] Normal F5 development launch repaired
- [x] Multiple Player instance architecture
- [x] Instance-ID dispatch implementation
- [x] Add Another Player implementation
- [x] Dynamic field-label architecture
- [x] Runtime reload-adoption failure investigated
- [x] Collapsible Roster UI
- [x] Controlled Codex Player field-proven (Stage 1.17): one large multiline Play with one SEND and no Enter, same-thread continuity, report returned through live Incoming
- [x] Controlled Player persistence + safe resume implemented with P1–P28 automated proof (Stage 1.19); human reload/context proof remains pending

## CURRENT / NEXT

- [ ] Run the Stage 1.19 two-controlled-Codex reload/context/Leave-Field human proof
- [ ] Run the separately approved tiny Stage 1.8 legacy reload smoke test
- [ ] Close Stage 1 with the re-scoped multi-instance controlled-Player touchdown

## SOON

- [ ] Dynamic model/effort field labels
- [ ] Generic Open Terminal
- [ ] Browser Preview action
- [ ] Player liveness states
- [ ] Permission/input intervention surface
- [ ] Player capacity telemetry prototype
- [ ] Persistent capacity footer

## LATER

- [ ] Player installation
- [ ] Provider authentication onboarding
- [ ] Fresh Stadium Set Up Game
- [ ] Multiple Games
- [ ] Game switcher
- [ ] Notifications
- [ ] Multi-Game context restore
- [ ] GitHub onboarding
- [ ] Settings / accounts
- [ ] Model routing adapters
- [ ] On-field timers
- [ ] Staged Play / SEND / AMEND / REWRITE
- [ ] Safer multiline transport adapters
- [ ] Multi-Stadium support

---

# 34. GOVERNING PRINCIPLE FOR THIS DOCUMENT

A breadcrumb is not permission to implement it.

Every future item still follows:

**Inspect reality → decide scope → architect when needed → implement narrowly → verify → promote proven behavior from WILL BE to IS.**

One step at a time.

Build the Game.

Play the Game.

Prove the model.

Then open the league.
