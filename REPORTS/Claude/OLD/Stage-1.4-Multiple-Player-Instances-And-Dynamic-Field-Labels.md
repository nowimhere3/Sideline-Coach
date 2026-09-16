REPORT FILE:
Stage-1.4-Multiple-Player-Instances-And-Dynamic-Field-Labels.md

REPORT TIMESTAMP:
2026-09-10 17:01 MDT

---

# SIDELINE COACH — STAGE 1.4 MULTIPLE PLAYER INSTANCE & DYNAMIC FIELD LABEL ARCHITECTURE

**Type:** Architecture only. No source modified, no commit, no push.
**Role:** Senior Systems / Product Architect (Claude Opus 5)
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`

**Working tree at inspection (preserved exactly):** modified `.vscode/tasks.json`, `package.json`, `src/public/index.html`, `src/server.ts`. Untracked: `Diagnostics/`, `Docs ANCHOR/`, `Project SOP/SOP PROMPTS .md`, `REPORTS/`, `src/player-adapters.ts`, `src/player-roster.ts`, `test/`, `tools/`. All of it is uncommitted work from earlier stages. Nothing was modified, staged, stashed, or reverted. The only file this play creates is this report.

**Baseline, run during this play:**
* `npm run check` passes.
* `npm test` passes 11 of 11.
* `npm run diagnostics` reports `FRESH` and `buildVerdict: built-current`. Its only verdict is the known `WARN A5` (two copies under the parent directory).
* `git status` was identical before and after these runs.

**Inspected:**
* Source: `src/player-adapters.ts`, `src/player-roster.ts`, `src/server.ts`, `src/extension.ts`, `src/public/index.html`, `test/player-adapters.test.mjs`.
* Diagnostics: `tools/diagnostics/*` (PLAYERS ownership) and `Diagnostics/CONTRACT.md`.
* Breadcrumbs: `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`.
* Reports: Codex `Player-Discovery-And-Put-On-Field-V1.md` and `Stage-1.3-F5-PreLaunch-Task-Repair.md`; AntiGravity `Sideline-Coach-Fresh-Canonical-Launch-Forensics.md`.
* VS Code API: the installed `@types/vscode` 1.137.0, and the rename command in the installed VS Code 1.136 workbench bundle.

---

## 1. EXECUTIVE VERDICT

**GO WITH CONSTRAINTS.**

The current architecture can support multiple simultaneous instances of the same Player, and dynamic labels, without persistence and without a breaking API change. VS Code already provides the two primitives the design needs:

* A stable in-memory `Terminal` object reference for each live terminal, closed out by `onDidCloseTerminal`.
* A creation-time `env` field that is readable later through `terminal.creationOptions`.

Together they let Coach tie an opaque Player-instance identity to the actual terminal, **without ever routing by `terminal.name`**.

None of the STOP conditions fires:

* Terminal ownership supports several instances.
* The dispatch change is additive.
* No persistence store is required.
* Report identity does not need to be redesigned first.

One condition comes close enough that it needs **explicit human approval** rather than a quiet decision, so it is constraint C3 below. Dispatch authority for *new* instances moves from "the terminal's name is in `coach.terminalAllowlist`" to "Coach created this terminal as a Player". That tightens the security boundary; it does not loosen it. It is still a change to the security rail's mechanism, so it should be approved deliberately.

**Constraints on the GO:**

| # | Constraint |
|---|---|
| **C1** | The instance registry is owned by `PlayerRoster`, and `PlayerRoster` is constructed **once per extension activation** and injected into `CoachServer`. It is not constructed per server start. (§5, §7) |
| **C2** | `POST /api/dispatch` gains an optional `playerInstanceId`. The existing `terminalName` path stays unchanged for one stage. (§9) |
| **C3** | **Human approval of the new dispatch-authority rule:** a Coach-registered Player instance is dispatchable whatever its label says; a generic terminal is never dispatchable; the name allowlist gates only the legacy path. (§9) |
| **C4** | Re-adopting instances after an extension reload is a Known Unknown that Stage 1.5's smoke test must prove. The failure mode must be "not dispatchable / unknown", never a guess. (§6, §14) |
| **C5** | No dynamic renaming of VS Code terminal tabs in Stage 1.5. Dynamic labels appear in the Coach UI first. (§8) |

---

## 2. CURRENT IMPLEMENTATION MAP

| Responsibility | Owner today | Location | Keyed by |
|---|---|---|---|
| Player type facts (id, display name, terminal name, command) | `PLAYER_ADAPTERS` table | `src/player-adapters.ts:5-9` | `PlayerId` (`claude`/`codex`/`antigravity`) |
| Availability (command resolves in the Stadium's shell) | `PlayerRoster.refreshAvailability` via profile-aware `Get-Command` | `src/player-roster.ts:34-46` | the first token of the command |
| On-field state | `playerStatus()`: `terminalNames.includes(player.terminalName)` | `src/player-adapters.ts:13-16` | **terminal name** |
| Create vs. reuse | `launchPlan()`: reuse if any terminal has the canonical name | `src/player-adapters.ts:18-22` | **terminal name** |
| Terminal creation | `vscode.window.createTerminal({ name })` + `sendText(command)` | `src/player-roster.ts:28-30` | **terminal name** |
| Put on Field API | `POST /api/players/:id/field` → `putOnField(id)` | `src/server.ts:174-179` | Player type |
| Dispatch-eligible terminal list | `buildStatus().terminals` = open terminal names ∩ `coach.terminalAllowlist` | `src/server.ts:228-231` | **terminal name** |
| Roster projection | `buildStatus().players` = `playerRoster.status()` | `src/server.ts:243` | Player type |
| Dispatch | name must be in the allowlist, exactly one terminal with that name, then `sendText` | `src/server.ts:247-293` | **terminal name** |
| Model switch | one global `coach.modelSwitches` map, sent to any target terminal | `src/server.ts:378-383`, `:287-289` | nothing (not tied to a Player type) |
| Report agent badge | the folder name under `Docs REPORT` (e.g. `Codex Reports`) | `src/server.ts:342-359` | report folder |
| Browser roster | renders `status.players`; Put on Field button | `src/public/index.html:411-444` | Player type |
| Browser dispatch target | `<select>` populated from `status.terminals`; sends `terminalName` | `index.html:385-400`, `:517-531` | **terminal name** |
| Diagnostics PLAYERS | preflight renders the configured allowlist; activation-time Player truth is explicitly `unknown` | `tools/diagnostics/collect-preflight.mjs:120`, `Diagnostics/CONTRACT.md` | configuration |

**Observed discrepancy with the prompt:** the Codex adapter's launch command is `codex --yolo`, not `codex` (`player-adapters.ts:7`). Discovery still probes the portable identity `codex`, which is the first token. The discovery principle is intact. The adapter simply carries launch flags, which is correct and worth keeping in mind for future routing adapters.

---

## 3. CURRENT IDENTITY WEAKNESSES

The terminal name currently acts as Player identity, routing key, reuse key, allowlist key, and display label all at once. Five concepts are collapsed into one mutable string. The consequences are concrete:

1. **A second instance is impossible.** `launchPlan` reuses any terminal named `Codex`, so "Put on Field" can never create Codex 2.
2. **Several instances are rejected by the safety rail.** Two terminals named `Codex` produce a dispatch 409 (`server.ts:278`). That is correct today, but it means identical names cannot be the multi-instance strategy.
3. **Renaming breaks identity.** If the human renames the `Codex` tab, the roster shows Codex as *Ready on Bench*, dispatch returns 404, and Put on Field creates a duplicate. Presentation silently changes identity, which is the exact failure North Star §12 forbids.
4. **The allowlist checks strings, not provenance.** Any hand-made PowerShell terminal named `Codex` passes the allowlist, even though it is exactly the "generic shell" the README warns about.
5. **"Which terminals are Players" has two owners.** `PLAYER_ADAPTERS[].terminalName` drives the roster, and `coach.terminalAllowlist` drives dispatch. If the configuration diverges from the adapters, the roster and the dispatcher disagree.
6. **"Which terminals can receive plays" has two projections.** The browser has `status.terminals` (name-based) for dispatch and `status.players` (adapter-based) for the roster.
7. **The model switch is global, not per Player.** `/model opus` can be sent to Codex. This is not a Stage 1.5 problem, but it shows that model/effort has no owner yet. That is why they must not be allowed to leak into identity now.

---

## 4. PROPOSED MINIMUM PLAYER-INSTANCE MODEL

There are four concepts, and each has exactly one representation.

| Concept | Representation | Mutable? | Example |
|---|---|---|---|
| **Player type** | the existing `PlayerId` / adapter `id` | No | `codex` |
| **Player instance identity** | `instanceId`: the type prefix plus 8 random hex characters | **Never** | `codex-7f3a91c2` |
| **Seat** | a positive integer assigned once at creation | **Never** for the instance's life | `2` |
| **Terminal handle** | the live `vscode.Terminal` object reference, held in memory | Ends when the terminal closes | *(object)* |
| **Field label** | **derived, never stored**: `fieldLabel(type, seat, routing)` | Yes, freely | `Codex 2 · Luna · Medium` |
| **Routing state** *(future)* | a runtime field on the instance, `unknown` until a routing adapter confirms it | Yes | `{ model: 'Luna', effort: 'Medium' }` |

### Answers to question A (Identity)

* **Minimum durable identity:** an opaque `instanceId` of the form `<type>-<8 hex>`. The type prefix keeps diagnostics readable; the random suffix makes the ID unique across sessions and across windows.
* **Why not `codex-2`?** It would be the same length and cheaper to read, but it fails three real tests:
  1. *Historical references.* After a reload, or tomorrow, a new `codex-2` would collide with yesterday's `codex-2` in diagnostics, timers, or any future record.
  2. *The multi-window future.* Two VS Code windows would each mint their own `codex-2`, which collide in a unified control plane.
  3. *North Star §12.* Internal identifiers stay opaque and independent of presentation. `codex-2` would make the display number and the identity the same thing.

  The random suffix costs nothing. The seat number carries the human-friendly ordinal separately.
* **Who creates it:** `PlayerRoster`, at the moment it creates the terminal. It is minted exactly once and then carried, never re-derived.
* **How long it lives:** as long as the terminal lives. It dies with `onDidCloseTerminal`.
* **Does it survive extension reload?** Best effort, **with no persistence**. The ID and seat are stamped into the terminal itself at creation (`env: { SIDELINE_COACH_PLAYER_ID, SIDELINE_COACH_PLAYER_SEAT }`) and read back from `terminal.creationOptions.env` on activation. The terminal is its own record. If VS Code does not preserve that field for a terminal created by an earlier extension host, the terminal is not adopted: it renders as Unknown and is not dispatchable (C4).
* **Does it need persistence yet?** **No.** A Player instance is live runtime truth about one Stadium session. Nothing currently needs it after its terminal is gone. Persistence would only be earned by a real need such as history, timers that survive restarts, or report attribution. None exists yet (§10).

**Game vs. Stadium:** an `instanceId` is Stadium-session runtime truth. It contains no workspace path, machine name, or executable path, so a Game's identity never derives from where it happens to be running (the Player Discovery rule holds).

---

## 5. OWNERSHIP MAP

| Responsibility | Owner | New or existing |
|---|---|---|
| Player type facts, command, canonical base name | `PLAYER_ADAPTERS` (`player-adapters.ts`) | Existing, unchanged |
| Pure derivations: `fieldLabel`, `nextSeat`, adoption classification, dispatch resolution | pure functions in `player-adapters.ts` | Extended; unit-testable without VS Code |
| Instance registry (create, adopt, close, look up) | `PlayerRoster` | Extended; the **single owner** of instance truth |
| Terminal ↔ instance correlation | `PlayerRoster`, via `Map<instanceId, record>` and `WeakMap<Terminal, instanceId>` | New, inside the existing owner |
| Availability | `PlayerRoster.refreshAvailability` | Existing, unchanged |
| Routing state, model/effort *(future)* | a field on the instance record, written only by a future routing adapter | Seam only |
| Display label | **nobody stores it**; `fieldLabel()` derives it on read | Derived |
| Status projection to the browser | `CoachServer.buildStatus()` reads `playerRoster.instances()` | Existing owner; reads only |
| Dispatch authority and resolution | `CoachServer.dispatch()` asks `PlayerRoster.resolve(instanceId)` | Existing owner; delegates the lookup |
| Lifetime of the registry | **the extension activation**; `PlayerRoster` is created in `activate()` and injected into `CoachServer` | **Small ownership correction (C1)** |

**Why C1 is required rather than preferred:** today `PlayerRoster` is a field of `CoachServer` (`server.ts:28`). A new `CoachServer` is built on every server start (`extension.ts:50`), and a throwaway one is built by `copyLatestReport` (`extension.ts:77`). A registry that subscribes to `onDidCloseTerminal` cannot have several short-lived owners: listeners would be duplicated, and a server restart would lose every instance's seat. The registry's lifetime must match the terminals' lifetime, which is the activation, not the HTTP listener. This is one constructor parameter, not a redesign.

---

## 6. TERMINAL CORRELATION DESIGN

### Question B

**Available VS Code handles (verified in `@types/vscode` 1.137.0):**

| Handle | Use in this design |
|---|---|
| `Terminal` object reference | **The runtime handle.** It is stable for the terminal's life within an extension host. |
| `TerminalOptions.env` → `terminal.creationOptions.env` | **The adoption marker.** It carries `instanceId` and `seat` inside the terminal itself. |
| `window.onDidCloseTerminal(t)` | **The lifecycle end.** It removes the instance by reference. |
| `terminal.processId` | Shell PID. RM-1 evidence for advanced diagnostics only; never identity, never shown in normal UX. |
| `terminal.name` | **Presentation, plus the legacy adoption key only.** Never used for routing new instances. |
| `terminal.exitStatus` | Optional evidence on close. |
| `terminal.shellIntegration` + `onDidEndTerminalShellExecution` | A future liveness seam (§9). Not used in Stage 1.5. |

**Correlation algorithm:**

1. **Creation:** `createTerminal({ name: baseLabel, env: { SIDELINE_COACH_PLAYER_ID: id, SIDELINE_COACH_PLAYER_SEAT: '2' } })`. Register `id → { type, seat, terminal }` and `terminal → id`.
2. **Lookup:** always by `instanceId` against the in-memory map. The name is never consulted.
3. **Close:** `onDidCloseTerminal(t)` → `WeakMap` lookup → remove the instance → broadcast a status change. The seat is retired (§7).
4. **Adoption at activation**, for terminals already open:
   * **Marked terminal:** a valid `SIDELINE_COACH_PLAYER_ID` for a known type → adopted with its original ID and seat.
   * **Legacy terminal:** no marker, a name exactly equal to a canonical adapter name (`Claude` / `Codex` / `AntiGravity`), present in `coach.terminalAllowlist`, and **the only** terminal with that name → adopted as seat 1 under a freshly minted ID. This keeps today's working terminals, including those made by the current V1 code, dispatchable after upgrade.
   * **Ambiguous:** two or more unmarked terminals with the same canonical name → **none is adopted**. Each renders as an unregistered Player-named terminal and is not dispatchable. This mirrors today's 409: a contradiction outranks similarity.
   * **Everything else:** ignored. It never enters the roster.

**The marker is not a secret.** The ID is visible to the Player process through its environment. That is harmless, and it also leaves a free future seam: a Player could stamp reports with the `instanceId` it was launched as, without Coach inventing Play IDs (§10).

**Isolation of the VS Code API:** the registry's decision logic (allocate, adopt, resolve, retire) should sit behind pure functions that operate on opaque handles, so every decision is testable with `node:test` and fake terminals. Only the thin wiring layer touches `vscode`.

---

## 7. MULTIPLE-INSTANCE LIFECYCLE

### Question C

**"Put another Codex on Field":**

| Human action | API | Behaviour |
|---|---|---|
| Put on Field (none on field) | existing `POST /api/players/codex/field` | Creates seat 1, labelled `Codex`. **Unchanged, idempotent semantics.** |
| Put on Field (≥1 on field) | same | Shows the existing instance. **Unchanged** (today's reuse behaviour). |
| **Add another** | **new** `POST /api/players/codex/instances` | Always creates a new instance at the next seat. |

This keeps the proven V1 route exactly as it behaves today, and makes "another" an explicit, separate intent. A double-tap on Put on Field therefore never spawns extra Players by accident.

**Seat allocation rule (pure, deterministic):**

* `nextSeat(type) = highWater(type) + 1`, where `highWater` is the largest seat issued for that type while at least one instance of that type has stayed continuously on field.
* When **zero** instances of a type remain, `highWater` resets and the next instance is seat 1.
* **Seats are not reused while any sibling of that type is still on field.**

**If Codex 1 closes and Codex 2 remains:** Codex 2 keeps its seat and label; nothing is renumbered. The next "Add another" creates **Codex 3**, not a new Codex 1.

**Why not reuse "1"?** Seat numbers are the human's handle in the strategy conversation ("Codex 1 is doing the tests"). Reusing a number while a sibling lives lets a stale human reference land on a fresh Player that has none of that context. Identity routing is safe either way, because it uses the opaque ID. The rule protects the **human's** mental model, which is North Star §1's primary constraint. Once the type's roster is empty, resetting to 1 costs nothing and keeps labels short.

**Stale targets fail safe:** if the browser still holds the `instanceId` of a Player that has left the field, dispatch returns a clear refusal ("That Player has left the field"). It **never** falls back to another instance of the same type.

**Future on-field timer:** the instance record is exactly where instance-specific runtime status belongs: `onFieldSince`, `lastDispatchAt`, `fieldState`. No new identity is needed. The timer's report-stop condition is covered in §10.

---

## 8. DYNAMIC DISPLAY-LABEL DESIGN

### Question D

**The label is a pure function, not stored state:**

```text
baseName(type, seat) = seat === 1 ? adapter.name : `${adapter.name} ${seat}`
fieldLabel(type, seat, routing) = [baseName, routing.model?, routing.effort?]
                                   .filter(known).join(' · ')
```

| Field | Owner | Mutable |
|---|---|---|
| Player type | adapter table | no |
| Instance number (seat) | registry, assigned once | no |
| Model | instance routing state (future) | yes |
| Reasoning / effort | instance routing state (future) | yes |
| Display label | **derived on every read** | changes whenever its inputs change |

Because the label is recomputed on every read and stored nowhere, it cannot become a second source of truth. No code path can read a label and treat it as an identity, because routing code only ever receives an `instanceId`.

**Only known values are shown.** In Stage 1.5 routing state is always absent, so the label is just `Codex 2`. When routing arrives, a model or effort value appears only after a routing adapter has applied it. If the human changes the model by hand inside the agent's terminal UI, Coach cannot observe that, so the value must become `unknown` and be omitted rather than go stale (North Star §7).

**Two presentation surfaces, deliberately handled differently:**

* **The Coach UI** (roster card and dispatch selector) shows the live derived label. This is where dynamic labels land in Stage 1.5.
* **The VS Code terminal tab** is set once, at creation, to `baseName` (`Codex`, `Codex 2`). It is **not** updated dynamically in Stage 1.5, because the only rename path VS Code offers, `workbench.action.terminal.renameWithArg`, acts on the **active** terminal. Using it would mean focusing each terminal before renaming it: stealing focus, racing the human's own typing, and risking renaming the wrong tab. That is a real API limitation, not a preference. Tab relabelling can return later as an optional, best-effort presentation feature. Correctness never depends on it, because the tab name is not identity.

---

## 9. DISPATCH AND ALLOWLIST IMPLICATIONS

### Question E: Dispatch target

**It should eventually target a Player instance ID.**

The migration is additive and non-breaking. `POST /api/dispatch` accepts:

```json
{ "playerInstanceId": "codex-7f3a91c2", "prompt": "...", "modelSwitch": "" }
```

* **If `playerInstanceId` is present:** resolve it through `PlayerRoster`. If the instance is not currently registered, return 404 or 410 with a human message. `terminalName` is ignored.
* **If it is absent:** today's `terminalName` path runs **byte-for-byte unchanged**: allowlist check, then unique-name check, then send.
* The success response gains `playerInstanceId` and `label`, which is additive.
* The bundled browser UI switches to sending `playerInstanceId`. The only other consumer of the API is the same bundled page, served fresh by the extension, so both change together. The legacy path is kept for one stage, and retiring it later is a separate, deliberate decision.

This is **not** an unavoidable breaking public-API change, so the STOP condition does not fire.

### Question F: Allowlist

| Target | Dispatch authority |
|---|---|
| Instance **created** by Coach's Put on Field / Add another | Authorized because Coach created it through an approved Player adapter. Its label and tab name are irrelevant. |
| Instance **adopted by marker** | Same as above. |
| Instance **adopted by legacy name** | Authorized only if its name is in `coach.terminalAllowlist`, which is exactly today's rule. |
| Legacy `terminalName` request | Today's rule, unchanged. |
| A generic terminal, or a hand-made terminal named `Codex 2` | **Never dispatchable.** It is not in the registry and not a legacy-adoptable name. |

**Why this is not a weakening:** today a hand-made shell named `Codex` passes. Under the registry, *new* instances are authorized by an object reference that Coach itself created, which cannot be forged by typing a name. Dynamic labels become safe precisely because authorization no longer reads the label. The legacy path keeps exactly the protection it has today.

**The distinction for the future "Open Terminal" feature:** generic terminals must be created **without** the Player marker and are never registered. The line between a Player terminal and a generic terminal is **registry membership**, not the name. Stage 1.5 needs no generic-terminal code; the rule simply makes the future feature safe by default.

**A gap that remains, stated honestly:** as the README warns, Coach still cannot prove that the agent's terminal UI is alive. If the agent exits back to a shell, a Play would be typed into that shell. The registry does not solve this, and neither did the allowlist. The correct future owner is shell integration: `onDidEndTerminalShellExecution` for the Player's launch command would mark the instance *left field (at shell prompt)* and refuse dispatch, and would render `unknown` where shell integration is inactive. This is the most valuable future security improvement, and it slots onto the instance record without any new identity. **It is not in Stage 1.5.**

---

## 10. REPORT-CORRELATION IMPLICATIONS

### Question G

**Multiple instances do not immediately require instance-aware report association.**

Reports are files that Players write into type-level folders (`Docs REPORT/Codex Reports/…`). Coach has never linked a report to a terminal; the agent badge is simply the folder name (`server.ts:342-359`). Running two Codex instances does not change how any report is discovered, previewed, or copied, so nothing conflates.

**Where ambiguity begins:** the moment Coach claims an *instance-level* fact about a report. For example:

* the future on-field timer stopping "when the next qualifying report arrives", or
* a roster line saying "Codex 2 returned a report".

With two Codex instances each holding an outstanding play, a new file in `Codex Reports` cannot be attributed to either one from the evidence available.

**The rule for that stage, not this one:**

* Attribute a report to an instance only when **exactly one** instance of that type has an outstanding dispatch.
* Otherwise the attribution is `unknown`, and the timer keeps running with the neutral label "report received (unattributed)".

**The trigger for stronger correlation:** if the human routinely runs several same-type instances with overlapping plays and `unknown` attribution becomes a felt problem. The cheapest mechanism would be for Players to stamp the `SIDELINE_COACH_PLAYER_ID` they were launched with (it is already in their environment, §6) into their reports. Play IDs are **not** justified yet and are not proposed.

**A mapping gap to record:** report agent badges (`Codex Reports`, `Claude Reports`, `AntiGravity`) have no declared mapping to Player types (`codex`, `claude`, `antigravity`). The timer stage will need one small adapter field for it. It is out of scope now.

---

## 11. DIAGNOSTICS IMPLICATIONS

### Question H

Player-instance state is activation-time truth, and after C1 its **single owner is `PlayerRoster`**.

**Stage 1.5 obligation (a seam only, no Stage B):** `PlayerRoster` must expose one read-only projection, `instances()`. `buildStatus()` uses it, and the future RM-1 in-extension collector will reuse it instead of re-deriving terminal state. That satisfies the existing contract line "a future in-extension collector must reuse that owner", which only needs its owner name updated.

**Future Stage B PLAYERS section**, when separately approved:

* per instance: `instanceId`, type, seat, derived label, field state, adoption method (`created` / `marker` / `legacy-name`), shell PID (reported by VS Code);
* a count of **unregistered Player-named terminals**, the ambiguity signal.

This is advanced-surface plumbing, allowed in diagnostics and never shown in normal UX.

**The preflight collector is unchanged.** Its PLAYERS section correctly stays `unknown` for activation-time state.

**Stage B diagnostics are not required for this architecture to be correct**, and they are not proposed for Stage 1.5.

---

## 12. MIGRATION PLAN FROM CURRENT V1

Each step is independently testable, in one reversible stage:

1. **Pure functions (`player-adapters.ts`):** `baseName`, `fieldLabel`, `nextSeat`, `classifyTerminalForAdoption`, `resolveDispatchTarget`, `mintInstanceId`. The existing exports keep their current behaviour, so the 3 existing Player tests still pass.
2. **Registry (`player-roster.ts`):** in-memory instance map; creation with the env marker; activation-time adoption per §6; an `onDidCloseTerminal` subscription; `ensureOnField(type)` (today's semantics), `addAnother(type)`, `resolve(instanceId)`, `instances()`.
3. **Ownership correction (C1):** construct `PlayerRoster` once in `activate()`, push it to `context.subscriptions`, and inject it into `CoachServer`. `copyLatestReport`'s throwaway server must not create a second registry.
4. **Server (`server.ts`):**
   * `buildStatus()` adds `instances: [{ instanceId, type, seat, label, fieldState }]`.
   * `players` gains an on-field count per type.
   * `terminals` is kept for one stage.
   * New route `POST /api/players/:type/instances`.
   * `dispatch()` accepts `playerInstanceId` (§9).
5. **Browser (`index.html`):**
   * The roster lists instances under their type.
   * When a type already has an instance on field, an **"Add another"** control appears.
   * The dispatch selector is populated from `instances`, with value = `instanceId` and text = label.
   * Card visuals stay consistent. **No collapse work** (that is Stage 1.6).
6. **Contracts:**
   * Update the Player breadcrumb (§15).
   * Update `Diagnostics/CONTRACT.md` so that its Player owner line names `PlayerRoster` instead of "the Coach server".

**Rollback:** every change is inside the extension. Reverting Stage 1.5 restores V1 exactly. The env markers left on open terminals are harmless to V1, which ignores them.

---

## 13. EXPLICIT NON-GOALS (Stage 1.4 and Stage 1.5)

* Model or effort routing, per-Player model adapters, and any change to `coach.modelSwitches` behaviour.
* The on-field timer.
* Dynamic renaming of VS Code terminal tabs.
* Persistence of instances or history.
* Play IDs or instance-aware report attribution.
* Shell-integration liveness detection.
* The generic "Open Terminal" feature.
* RM-1 Stage B in-extension diagnostics.
* Installation, authentication, or provisioning.
* Multi-window, multi-Stadium, or broker work; port changes.
* The collapsible roster (Stage 1.6).
* Retiring the legacy `terminalName` dispatch path.
* Fixing the debugger-attached F5 crash (exit code 134).

---

## 14. RISKS / KNOWN UNKNOWNS

1. **K1: Does `creationOptions.env` survive?** It is unproven whether VS Code fills in `creationOptions.env` for terminals created by a *previous* extension-host instance (extension reload), and for terminals revived after a *window* reload with persistent sessions.
   * *Mitigation:* fail safe to "unregistered, not dispatchable". Stage 1.5's smoke test must prove or disprove this.
   * *If disproven:* adoption falls back to the legacy-name rule for seat 1 only. Seats 2 and higher need Put on Field again after a reload. That is acceptable, and still needs no persistence.
2. **K2: Do the agent CLIs retitle their own tabs?** Whether Claude, Codex, or AntiGravity change their terminal title via escape sequences, and so change `terminal.name`, is unobserved. This design is immune, because it never routes by name. It only affects which presentation the tab shows.
3. **K3: Does `onDidCloseTerminal` pass back the same object?** The design relies on it handing back the same `Terminal` object that was created. This is the documented API pattern; Stage 1.5 should cover it with a smoke assertion and, if it fails, fall back to comparing `processId`.
4. **R1: Stale browser tabs.** A phone still running the previous page JavaScript would send `terminalName`. The legacy path serves it correctly, which is the reason for C2.
5. **R2: Legacy adoption keeps today's name-based trust** for seat 1. That is deliberate for compatibility. Tightening it (for example, refusing unmarked terminals) is a separate later decision.
6. **R3: F5 debugging currently crashes** (AntiGravity forensics: exit code 134 under `ms-vscode.js-debug`; the CLI launch in `window17` ran cleanly). Stage 1.5's human smoke test must use the CLI launch path until that is resolved. This does not block the design.
7. **R4: Scope creep toward routing.** The routing-state field must stay an empty seam in Stage 1.5. Any code that writes it is out of scope.

---

## 15. BREADCRUMB IMPACT

**YES.**

**Owner:** `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, which already exists. Its current IS entry `[WHY: Player Discovery V1]` says *"Canonical terminal names remain the existing Coach allowlist identities."* Stage 1.5 **amends** that rule rather than adding a competing one.

**Proposed amendment, to be written by Stage 1.5 and not now:**

> **IS** — [WHY: Stage 1.4] Player type, Player instance identity, terminal handle, and field label are separate concepts.
> * Type is the adapter id.
> * Instance identity is an opaque `<type>-<random>` id minted once by `PlayerRoster` at creation, carried in the terminal's creation `env`, and never derived from a name.
> * The terminal handle is the live `vscode.Terminal` reference.
> * The field label is derived on read from type, seat, and known routing state, and is never stored.
>
> Mutable presentation never routes: dispatch resolves an `instanceId` through the single `PlayerRoster` registry, whose lifetime is the extension activation. Coach-created Player instances are dispatchable regardless of label. The name allowlist governs only legacy name-based dispatch and legacy adoption. Generic terminals are never registered and never dispatchable. Seats are not reused while a same-type sibling remains on field. Canonical names (`Claude`, `Codex`, `AntiGravity`) are now the seat-1 base labels and the legacy adoption key, not identity. Instance identity is Stadium-session runtime truth and contains no Game, machine, or executable-path information.

> **WAS** — [WHY: Stage 1.4] The terminal name was simultaneously identity, reuse key, allowlist key, and label. That made a second same-type instance impossible, and meant renaming a tab silently changed identity.

**Not duplicated:** *Hide plumbing by default* and *strong internal identity, simple external UX* are already North Star §2, §3, and §12. *Machine paths are runtime evidence* is already in the Player Discovery breadcrumb. *Setup-heavy UI should yield space* is a product principle that the North Star arguably implies (§1, §15, §21) but does not state. Recording it durably is the **human's** decision: either a deliberate North Star amendment, or a breadcrumb written in Stage 1.6 when it is actually implemented. It should not be written into breadcrumbs ahead of the work.

---

## 16. DIAGNOSTIC IMPACT

**YES.**

The stage introduces a new identity concept (Player instance), new state transitions (put on field, add another, left field), and a new correlation boundary (terminal ↔ instance). Under the Durable Memory Gate, the diagnostic system must be able to expose that truth.

**It is satisfied by construction:**

* one owner, `PlayerRoster`;
* one read-only projection, `instances()`, that the future Stage B collector reuses;
* a contract-line update in `Diagnostics/CONTRACT.md` naming that owner.

The RM-1 schema, preflight collector, and assertions do **not** change in Stage 1.5.

---

## 17. RECOMMENDED STAGE 1.5 IMPLEMENTATION PLAY

```text
TASK:              Stage 1.5 — Multiple Player Instances + Dynamic Field Labels (implementation)
RECOMMENDED AGENT: Codex
REASONING:         Medium
TASK DIFFICULTY:   Medium
WHY THIS ROUTE:    Identity model, ownership, API shape, allowlist rule, seat rule, and test
                   list are settled here. What remains is bounded multi-file state plumbing
                   with pure-function tests.
WHY NOT OPUS:      No open architectural decision remains inside this fence.
ESCALATE ONLY IF:  K1/K3 fail in a way the §6 fallbacks cannot absorb, or C1's injection
                   cannot be done without restructuring activation — send only that blocker.
```

**Scope:** migration steps 1–6 in §12, under constraints C1–C5. Do not touch `tools/diagnostics/`, model switching, report scanning, authentication, or ports. Preserve all uncommitted prior-stage work and `Project SOP/SOP PROMPTS .md`.

**Automated proof required** (`node:test`, no new dependencies):

1. **Label derivation:** seat 1 → `Codex`; seat 2 → `Codex 2`; with routing → `Codex 2 · Luna · Medium`; unknown routing values are omitted; changing routing never changes `instanceId`.
2. **Seat allocation:** monotonic while siblings live; no reuse after Codex 1 closes while Codex 2 remains (the next seat is 3); resets to 1 once the type is empty.
3. **Independent addressing:** two Codex instances resolve to two distinct handles; closing one leaves the other resolvable.
4. **Fail-safe dispatch:** an unknown or closed `instanceId` → refusal, never a fallback to a sibling or a name match.
5. **Legacy dispatch:** `terminalName` behaviour is identical to V1 (allowlist check, 404, 409).
6. **Adoption:**
   * a marked terminal → the same ID and seat;
   * a single unmarked canonical-name terminal in the allowlist → seat 1;
   * duplicate unmarked canonical names → none adopted;
   * a non-canonical or generic terminal → never registered.
7. **Put on Field idempotency preserved:** a second call does not create an instance. `addAnother` always does.
8. **Single-owner test:** exactly one registry per activation. A server restart does not lose instances or duplicate close-listeners.
9. **Projection safety:** `instances()` contains no executable paths, PIDs, or environment beyond the ID, type, seat, label, and state.
10. **Regression:** the existing 11 tests pass, `npm run check` passes, and `npm run diagnostics` reports `built-current`.

**The single irreducible human smoke test** (live GS3, launched via the CLI path, not F5, per R3):

1. Put Codex on Field, then Add another → `Codex` and `Codex 2` appear.
2. Dispatch a distinct short play to each and confirm each lands in the right terminal.
3. Close `Codex` and confirm `Codex 2` still receives plays.
4. Reload the window and confirm whether the instances are re-adopted. This is the K1 evidence.

---

## 18. ROADMAP NOTE — COLLAPSIBLE ROSTER (STAGE 1.6)

**The sequence 1.4 → 1.5 → 1.6 is confirmed, for a concrete reason.** The collapsed summary ("Players · 3 On Field") is a count of **instances**, and the expanded card must accommodate instance rows and the "Add another" control. Building the collapse first would mean designing it against the single-instance model and redoing it immediately afterwards.

**Stage 1.5 must therefore add the instance rows and "Add another" in the existing card's visual language, and must not restyle the card**, so that Stage 1.6 stays a small, purely presentational pass.

**Stage 1.6 requirement as recorded:**

* A collapse control in the existing Roster header.
* A collapsed summary line derived from `instances` (for example `Players · 3 On Field`).
* Visual consistency with the current card.
* No page redesign.

Rationale: setup UI should stop consuming attention once setup is done. Where the collapsed/expanded preference lives (browser `sessionStorage` or `localStorage`) is a Stage 1.6 detail. It is presentation, never Coach state.

---

────────────────────────────────────────

REPORT FILE:
Stage-1.4-Multiple-Player-Instances-And-Dynamic-Field-Labels.md

REPORT TIMESTAMP:
2026-09-10 17:01 MDT

────────────────────────────────────────
