REPORT FILE:
Stage-1.7-Player-Reload-Adoption-Architecture-Amendment.md

REPORT TIMESTAMP:
2026-09-10 18:58 MDT

---

# SIDELINE COACH — STAGE 1.7 PLAYER RELOAD ADOPTION ARCHITECTURE AMENDMENT

**Type:** Architecture amendment only. No source modified. No commit, no push.
**Role:** Senior Systems / Product Architect (Claude Opus 5)
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`

**Working tree (preserved exactly):**
* Modified: `.vscode/tasks.json`, `package.json`, `src/extension.ts`, `src/public/index.html`, `src/server.ts`.
* Untracked: `Diagnostics/`, `Docs ANCHOR/`, `Project SOP/SOP PROMPTS .md`, `REPORTS/`, `src/player-adapters.ts`, `src/player-instances.ts`, `src/player-roster.ts`, `test/`, `tools/`.
* The only new file is this report.

**Baseline (run during this play):**
* `npm run check`: PASS.
* `npm test`: PASS, 15 of 15.
* `npm run diagnostics`: `FRESH`, `built-current`. Two findings, both pre-existing and outside this stage's scope: `ERROR A6` (port 49152 is in the Windows ephemeral range) and `WARN A5` (two copies of the extension).
* `git status` was unchanged by these runs.

**Read:**
* Reports: AntiGravity `Stage-1.6-Surviving-Player-Reload-Adoption-Forensics.md`; Claude `Stage-1.4-…`; Codex `Stage-1.5-…-Implementation.md`.
* Current code: `src/player-roster.ts`, `src/player-instances.ts`, `src/player-adapters.ts`, `src/extension.ts` (diff), `src/server.ts` (dispatch), `src/public/index.html` (selector).
* Tests: `test/player-instances.test.mjs`.
* Durable docs: `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, `Diagnostics/CONTRACT.md`.
* VS Code platform: the installed `@types/vscode` 1.137.0 `Terminal` and `ExtensionContext` surfaces; the installed VS Code 1.136 workbench (terminal setting defaults, reconnect PID path); user and GS3 settings.

---

## 1. VERDICT

**GO WITH CONSTRAINTS.**

A small, bounded correction lets Coach safely recognise a surviving Player after a window reload, keeping its original `instanceId` and seat. It requires **minimal persistence**. That persistence is now earned by observed runtime evidence rather than speculation.

The correction deliberately **rejects** the Stage 1.6 name-matching recommendation, because VS Code's default settings would turn it into a path for sending Plays into plain shells (§10).

**None of the STOP conditions fires.**
* The public API does not change shape.
* The security boundary is preserved and tightened.
* The persistence is one bounded key in an owner VS Code already provides.
* Report identity is untouched.

**Constraints:**

| # | Constraint |
|---|---|
| **K1** | Restored-terminal authorization rests on **process identity proof** (shell PID + OS process start time) matched against a Coach-written provenance record. `terminal.name` never authorizes. |
| **K2** | The persisted table holds provenance only (§6). It must not become a store for labels, routing, activity, policy, or history. |
| **K3** | All terminal evaluation, whether from the activation snapshot or `onDidOpenTerminal`, runs through **one idempotent funnel** owned by `PlayerRoster`. |
| **K4** | **Human decision:** legacy seat-1 name adoption. The default (no approval needed) keeps the rule unchanged but confines it to the activation snapshot, never the new `onDidOpenTerminal` path. The recommendation (approval needed) is to retire it (§10, Q5). |
| **K5** | The browser keeps the human's chosen dispatch target by `instanceId` and **never substitutes** another Player (§12). This fixes an existing wrong-target hazard that reload makes worse. |

---

## 2. EXACT CAUSE OF THE STAGE 1.6 FAILURE

Three barriers compound. Each alone would have prevented re-adoption. All are confirmed against the current code.

1. **Timing.** `PlayerRoster`'s constructor calls `adoptExistingTerminals()` once, synchronously, from `activate()` (`player-roster.ts:22-23`, `extension.ts:13`). VS Code reconnects persistent terminals asynchronously, so they appear *after* that snapshot. `PlayerRoster` subscribes only to `onDidCloseTerminal` (`player-roster.ts:24`). No path ever evaluates a terminal that arrives later.
2. **Marker erasure.** VS Code rebuilds reconnected terminals from `{ attachPersistentProcess }`, which carries no launch options. `terminal.creationOptions.env` is therefore `undefined`, and `markers()` (`player-roster.ts:102-108`) returns nothing.
3. **Canonical-only fallback.** Unmarked adoption matches only `candidate.terminalName === terminal.name` against `Claude` / `Codex` / `AntiGravity` (`player-roster.ts:86`). `Codex 2` matches neither the adapters nor the allowlist.

**The architectural root cause is barrier 2.** Fixing barrier 1 alone would change nothing for seats ≥ 2. Fixing barrier 3 by name alone would be unsafe (§10).

---

## 3. WHICH STAGE 1.4 ASSUMPTION IS NOW INVALID

The disproven assumption is Stage 1.4 §4 and §6, identified there as Known Unknown **K1**:

> *The terminal is its own record.* The identity and seat stamped into `TerminalOptions.env` can be read back from `terminal.creationOptions.env` after reload, so **no persistence is required**.

This is **false for window reload**. Stage 1.6 observed it, and the reconnect code path confirms it.

What follows from that:
* The Stage 1.4 conclusion "Persistence required now: No" was correct **given that assumption**, and is **withdrawn**.
* The Stage 1.4 **fallback for K1** is also withdrawn. It said adoption would fall back to legacy name adoption for seat 1, and seats ≥ 2 would need Put on Field again. That fallback is superseded, because the platform evidence shows a better, safe option exists.

**What remains valid from Stage 1.4 and 1.5:**
* the four separated concepts (type, instance ID, terminal handle, label);
* opaque immutable IDs;
* derived labels;
* one activation-lifetime owner;
* provenance-based authorization;
* instance-ID dispatch;
* the refusal to route by name.

This amendment strengthens those rules rather than replacing them.

---

## 4. RECOMMENDED MINIMUM RELOAD-ADOPTION MODEL

### Options evaluated

| Option | Evaluation | Decision |
|---|---|---|
| **A — Fresh ID recognised by name/seat** | No provenance survives except the tab name, and the name is forgeable. The decisive evidence: **VS Code revives tabs by name after a full restart.** With `enablePersistentSessions: true` and `persistentSessionReviveProcess: "onExit"` (both defaults, confirmed in the installed workbench; no user or GS3 overrides), quitting and reopening VS Code restores a tab titled `Codex 2` with a **fresh PowerShell and no Codex running**. Name-based adoption would mark that plain shell On Field and type the next Play into PowerShell as commands. That is exactly the hazard the security rail exists to prevent. Option A also discards the instance ID. | **Rejected** (also rejects Stage 1.6 §5.2's regex) |
| **C — Another supported runtime handle** | `vscode.Terminal` exposes only `name`, `processId`, `creationOptions`, `exitStatus`, `state`, `shellIntegration` (verified in the installed types). **There is no persistent terminal identifier in the API.** `processId` is documented and survives reconnection: the workbench sets `shellProcessId = c.pid` from the ptyHost's live process on reconnect, and Stage 1.6 observed PowerShell PID 34148 surviving. But a PID alone proves nothing unless Coach previously recorded *which* PID it created. | **Necessary but insufficient alone** |
| **B — Minimal workspace persistence** | `ExtensionContext.workspaceState` (a `Memento`) is an existing, supported, machine-local, per-workspace owner. It can hold the one thing that is otherwise unrecoverable: *Coach created a Player whose shell was this process*. | **Adopted, combined with C** |

### The model: B + C, provenance keyed by process identity

* When Coach creates a Player terminal, it records `{instanceId, playerType, seat, shellPid, shellStartedAt}`.
* After a reload, a terminal is re-adopted **only** if its live shell has the same PID **and** the same OS process start time as a record.
* It then keeps its **original `instanceId` and seat**. It is the same Player, because it is provably the same process.

**Why the start time is required, not decorative.** After a full restart, a revived `Codex 2` shell gets a new PID. Windows recycles PIDs, so that new PID could occasionally equal the old recorded one. PID plus process start time uniquely identifies a process for the life of the OS boot. It closes the one remaining path by which a revived plain shell could inherit a Player's authority.

The start time comes from the OS, through the PowerShell mechanism `PlayerRoster` already uses for availability. It uses no undocumented VS Code internals. On platforms where it cannot be read, the result is `unknown` and the terminal is not adopted.

---

## 5. IS PERSISTENCE NOW JUSTIFIED?

**Yes.** It was earned by a real, observed failure: the human's smoke test in Stage 1.6, with its forensics. Persistence is not being added for hypothetical scale.

The platform **destroys** the only provenance signal Coach wrote into the terminal, and **preserves** a signal (the tab name) that cannot carry provenance. A Coach-authored record outside the terminal is the smallest thing that can bridge the reload.

This is not a persistence subsystem:
* one key, holding at most one entry per live Player;
* no history;
* no sync;
* no schema migration machinery beyond a version in the key name.

---

## 6. EXACT MINIMAL PERSISTED DATA

**Store:** `context.workspaceState`
**Key:** `sidelineCoach.playerProvenance.v1`
**Value:** an array of:

```json
{ "instanceId": "codex-7f3a91c2", "playerType": "codex", "seat": 2,
  "shellPid": 34148, "shellStartedAt": "2026-09-10T18:31:02.1234567Z" }
```

| Field | Why it is required |
|---|---|
| `instanceId` | Lets the same Player keep its identity across reload; stale browser references keep working. |
| `playerType` | Required to rebuild the record; must match a known adapter. |
| `seat` | Keeps the label `Codex 2` and reserves the seat while reconnecting. |
| `shellPid` | The only supported surviving terminal handle (Option C). |
| `shellStartedAt` | Turns the PID into proof (§4). |

**Explicitly never stored:**
* labels or terminal names;
* routing, model, or effort;
* activity or permission state;
* prompts, reports, or dispatch history;
* executable paths, the token, or machine names.

**Scope and bounds:**
* `workspaceState` is per workspace: each Game gets its own table. That satisfies the protected multi-Game WILL BE, and no global or single-Game assumption is introduced.
* It is machine-local and must **never** be registered for Settings Sync. PIDs are local capabilities, not portable facts (North Star §13).
* It is never written into the Game repository.
* Entries are removed when a terminal closes or when a record is proven dead, so the table never holds more than the live instances.
* A missing, malformed, or unknown-version value is ignored and replaced. The failure mode is "no restored Players", never a crash or a guess.

---

## 7. OWNERSHIP

| Responsibility | Owner |
|---|---|
| Provenance table: read, write, delete | `PlayerRoster` (the sole writer), given `context.workspaceState` by `activate()` |
| Pure decisions: match a record to an observed process, proven-dead test, seat reservation, contradiction detection | pure functions in `player-instances.ts`, VS Code-free and unit-tested |
| Process start-time probe | a small injectable function inside `player-roster.ts`, alongside the existing availability probe |
| Terminal ↔ instance maps and lifecycle listeners | `PlayerRoster` (unchanged owner) |
| Dispatch resolution | `CoachServer.dispatch()` asks `PlayerRoster` (unchanged) |
| Selected dispatch target in the browser | page memory in `index.html`; presentation only, never server state |

**No new owner is created.** `PlayerRoster` stays the single activation-lifetime owner of Player-instance truth. It now also owns that truth's only persisted provenance. `extension.ts` changes by one constructor argument.

---

## 8. `onDidOpenTerminal` LIFECYCLE DESIGN

**Yes: Stage 1.8 subscribes to `vscode.window.onDidOpenTerminal`**, and every terminal flows through one funnel.

```text
PlayerRoster constructor (once per activation)
  1. load provenance table (synchronous Memento.get) → records become PENDING reservations
  2. subscribe onDidOpenTerminal  → evaluate(t)
     subscribe onDidCloseTerminal → retire(t)            (existing)
  3. evaluate every terminal in vscode.window.terminals  (snapshot)
  4. proven-dead sweep of PENDING records (one batched OS probe)
```

**The listeners are subscribed *before* the snapshot is evaluated**, so a terminal arriving in between cannot be missed. The funnel is idempotent, so a terminal seen by both paths is harmless.

**The funnel, `evaluate(terminal, origin)`:**
* Returns immediately if the terminal is already registered or is currently being evaluated (a `WeakSet` in-flight guard).
* A terminal Coach itself creates is registered **synchronously at creation**, exactly as in Stage 1.5, so its own `onDidOpenTerminal` event is a no-op.
* After creation, Coach awaits `processId` and the start-time probe **asynchronously**, then writes the provenance record. Dispatch is never delayed by this.

**Disposal:** both listeners are owned by `PlayerRoster` and disposed with it through `context.subscriptions`. A server restart adds no listeners, preserving the Stage 1.5 single-owner test.

---

## 9. RECONCILIATION ALGORITHM

For each evaluated terminal:

```text
pid = await terminal.processId
if pid is undefined                      → leave unregistered (UNKNOWN). Stop.
claims = PENDING records with shellPid == pid
if claims.length > 1                     → contradiction: drop those records, adopt none. Stop.
if claims.length == 1:
    started = probeStartTime(pid)
    if started is unknown                → leave unregistered; record stays PENDING. Stop.
    if started == claim.shellStartedAt   → ADOPT: original instanceId + seat; register;
                                            record becomes LIVE; fire roster change. Stop.
    else                                 → PID recycled: record is PROVEN DEAD → delete. Stop.
no claim:
    if origin == 'snapshot' and the legacy rule applies (K4 default) → legacy seat-1 adoption
    else                                 → never registered (a generic terminal)
```

**The proven-dead sweep** runs once at construction, in one batched probe. It resolves records whose terminal never arrives:

| Probe result for a PENDING record | Outcome |
|---|---|
| Process is not alive | Proven dead: delete the record and release the seat. |
| Process is alive with a different start time | Proven dead: delete the record and release the seat. |
| Process is alive with the same start time | Keep PENDING (the terminal may still be restoring). |
| Probe failed | Keep PENDING (unknown). |

**There are no timers.** Records are cleared by proof, never by elapsed time.

**Seats:**
* PENDING records **reserve** their seat, so an "Add another" during reconnection can never take `Codex 2` from a Player that is still coming back.
* A PENDING record that never resolves in this activation simply leaves its seat skipped. That is harmless.

**`terminal.name` is not read anywhere in this algorithm.**
* A restored Player whose tab the human renamed is still recognised.
* A terminal merely *named* `Codex 2` is never recognised.

---

## 10. SECURITY AND PROVENANCE RULE

> **A restored terminal is dispatch-authorized only when `PlayerRoster` holds a provenance record, written by Coach when it created that Player, whose `(shellPid, shellStartedAt)` equals the restored terminal's live process identity. Names, labels, and markers never authorize.**

**Q1. What evidence authorizes a restored terminal?**
Process identity proof against Coach-written provenance. Nothing else. Everything short of that is either a proposal or unknown, and neither authorizes dispatch (North Star §6).

**Q2. Can `terminal.name` take part only as reconciliation evidence?**
It *could*, but it is **neither necessary nor sufficient**, so it is **not used at all** for restored Players. Using it would add a failure mode: a human-renamed tab would no longer be recognised. It would add no safety: the process proof is already decisive. Names remain presentation.

**Q3. How is a hand-made terminal called `Codex 2` kept out?**
No provenance record has its shell's PID and start time, so it reaches the "no claim" branch. It is not a snapshot legacy candidate either, because it is not a canonical name. **It is never registered.** The same holds for a *revived* `Codex 2` after a full VS Code restart: its fresh shell fails the proof, and its record is proven dead and deleted.

**Q4. Provenance exists but the terminal cannot be uniquely reconciled?**
**Fail safe to unknown and not dispatchable. Never guess.**

| Situation | Outcome |
|---|---|
| PID unresolved | Terminal unregistered. |
| Start time unreadable | Terminal unregistered; record PENDING; dispatch to that ID answers "reconnecting". |
| Two records claim one PID | Contradiction: adopt neither, drop both. |
| Start time mismatch | Proven dead: record deleted. |

In each case the human's remedy is the ordinary one: **Add another**. Coach never lowers the standard of proof to recover a Player (North Star §17).

**Q5. Legacy seat-1 name adoption.**
* **Its rule is unchanged.** An unmarked, unique, allowlisted canonical name (`Claude` / `Codex` / `AntiGravity`) is adopted as a fresh seat 1.
* **But it must not be fed by the new `onDidOpenTerminal` funnel.** Otherwise the lifecycle fix would begin adopting revived plain shells named `Codex` after every full restart.
* **K4 default (no approval needed):** legacy adoption runs only for the activation snapshot, and only **after** provenance matching, so a real Coach-created seat 1 keeps its original ID. This preserves Stage 1.5's exposure exactly, with no new exposure.
* **Recommendation (needs your approval):** retire legacy adoption. Its purpose was migrating terminals created by V1 code. Stage 1.5 is not yet committed, and every Coach-created terminal now carries provenance, so that purpose has effectively expired. It is now the **last name-based path into the Player registry**.
* **A related hazard, unchanged by this stage:** the untouched legacy `terminalName` *dispatch* route has always been able to type into a revived plain `Codex` shell. It should be included in the same retirement decision. It is **not** altered here.

---

## 11. FAILURE / UNKNOWN BEHAVIOUR

| Condition | Roster shows | Dispatch to that ID |
|---|---|---|
| Proven restored | Player On Field, same label and seat | Works, same `instanceId` |
| PENDING (process alive, terminal not yet matched) | Nothing (no new UI state in Stage 1.8) | **409** "That Player is reconnecting — try again in a moment." |
| Proven dead, or never Coach-provenanced | Nothing; type shows Ready on Bench | **404** "That Player has left the field." (existing) |
| Probe unavailable (non-Windows Stadium) | No restored Players | 404 once the record is dropped; 409 while PENDING |
| `workspaceState` write fails | Player works this session; not restorable after reload | Normal in-session behaviour |
| Table missing, malformed, or wrong version | No restored Players; table replaced | 404 |

**No path sends to a sibling or matches by name as a fallback.**

The PENDING 409 is the only new response. It replaces a misleading "left the field" for a Player that is actually still there. That is `unknown` stated honestly, not guessed away (North Star §7).

---

## 12. STALE BROWSER-TARGET BEHAVIOUR

**Existing defect, confirmed:** `renderStatus()` clears and rebuilds the dispatch `<select>` on **every** status refresh (`index.html:385-400`), with no restoration of the previous choice. Status refreshes fire on terminal open or close, on **active-terminal change**, and on roster change (`server.ts:140-145`).

**Consequence:** the human selects `Codex 2` on the phone, then clicks any terminal tab in VS Code. The selector silently resets to the first Player, and **Dispatch Play sends the Play to the wrong Player**. The same thing happens after every reload, when the SSE connection reconnects.

This predates this stage. Multiple instances and reload both make it more likely, and it is precisely "stale browser-target behaviour", so it belongs in this amendment.

**Required rule (K5):**
* The page remembers the selected `instanceId` in page memory.
* On each refresh, if that ID is present, it stays selected.
* If it is absent, the selector shows an explicit **"Choose a Player"** placeholder (empty value). Dispatch is then refused client-side with the existing "put a Player on the field / choose" message.
* If the same ID reappears later (a Player proven restored after reload), it is **re-selected automatically**. The same Player, and only the same Player.
* **Another instance is never substituted.**

Across reload, a Player that keeps its ID means the phone's selection simply survives, which matches the human's mental model that *Codex 2 is still Codex 2*.

---

## 13. MIGRATION IMPACT ON STAGE 1.5

| File | Change |
|---|---|
| `src/player-roster.ts` | Replace one-shot `adoptExistingTerminals()` with the §8 funnel plus `onDidOpenTerminal`. Add the provenance table (load, write after the probe, delete on close or proof of death). Add the start-time probe. **Stop reading env markers for authorization.** Keep writing them: they are harmless and remain the Stage 1.4 seam that would let a Player stamp its own ID into reports. Expose `resolve(id) → live \| pending \| unknown`. |
| `src/player-instances.ts` | Pure reconcile, proven-dead, and contradiction functions. PENDING seat reservation. **Seat rule fix** (see below). |
| `src/extension.ts` | Pass `context.workspaceState` to `new PlayerRoster(...)`. |
| `src/server.ts` | Instance dispatch distinguishes PENDING (409) from unknown (404). The legacy `terminalName` branch is **untouched**. |
| `src/public/index.html` | K5 selection preservation. No visual changes. |
| Tests, `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`, `Diagnostics/CONTRACT.md` | Per §14, §16, §17. |

**No route, request shape, or response shape changes**, apart from the single new 409 status.

**Seat-rule deviation found while inspecting, to be fixed in Stage 1.8 as a separately listed item.**
* `PlayerInstanceBook.allocate()` computes *highest live seat + 1* (`player-instances.ts:18-19`).
* So closing the **highest** seat while lower siblings live **reuses** it: `Codex`, `Codex 2`, `Codex 3` → close `Codex 3` → Add another → a new `Codex 3`.
* That contradicts the Stage 1.5 breadcrumb: "Seats do not reuse a missing ordinal while same-type siblings remain."
* The existing test covers only closing seat 1, so it does not catch this.
* The fix is an in-memory per-type high-water mark that resets only when a type has no live **and** no PENDING instances. It touches the same allocation code this amendment already changes for seat reservation. That is why it is bundled here, with its own test, rather than done silently or split into its own play.
* The high-water mark is **not** persisted. After a reload it restarts from the highest adopted or PENDING seat. That is an accepted, documented limitation.

**Rollback:** reverting Stage 1.8 restores Stage 1.5 behaviour. A leftover `workspaceState` key is inert to Stage 1.5, which never reads it.

---

## 14. AUTOMATED TESTS REQUIRED (`node:test`, no new dependencies)

All reconciliation decisions must be pure functions over plain data (records plus observed `{pid, startedAt}`), so they can be tested without VS Code.

| # | Contract |
|---|---|
| T1 | Record + matching PID + matching start time → adopted with the **original** `instanceId` and seat. |
| T2 | Name independence: a terminal named `Codex 2` with no matching record → not adopted. A matching record on a tab renamed to anything → adopted. |
| T3 | Recycled PID (start time differs) → not adopted; record deleted. |
| T4 | Start time unknown → not adopted; record kept PENDING; `resolve()` returns `pending`. |
| T5 | PID undefined → not adopted. |
| T6 | Idempotent funnel: one terminal seen by snapshot **and** `onDidOpenTerminal` → registered once. A Coach-created terminal's own open event → no second registration. |
| T7 | PENDING seat reservation: PENDING `Codex 2` → Add another gets seat 3. After proof of death → seat released. |
| T8 | Proven-dead sweep: record whose process is not alive → deleted at construction. |
| T9 | Contradiction: two records with one PID → neither adopted; both dropped. |
| T10 | Persisted shape: create → record written with exactly the five §6 fields; close → deleted. No label, name, path, routing, or prompt ever appears. A malformed or unknown-version table → ignored and replaced. |
| T11 | Legacy (K4 default): an unmarked canonical `Codex` arriving via `onDidOpenTerminal` → **not** adopted. Snapshot legacy behaviour unchanged. A provenance match beats legacy for seat 1. |
| T12 | Single owner: exactly one open listener and one close listener per activation; server restart adds none. |
| T13 | Seat rule: close the highest seat while siblings live → the next seat is **not** reused. Type fully empty → the next seat is 1. |
| T14 | Dispatch: PENDING ID → 409; unknown or closed ID → 404; never a sibling or name fallback. Legacy `terminalName` behaviour unchanged. |
| T15 | Regression: the existing 15 tests pass, `npm run check` passes, `npm run diagnostics` reports `built-current`. |

The **browser selection rule (K5)** lives in the single inline page script. The page has no test harness, and adding one is out of scope. It is verified in the smoke test instead (§15, step 2).

---

## 15. SMALLEST HUMAN SMOKE TEST

Use the same launch path as the Stage 1.6 test, in the GS3 Game. Four steps:

1. Put Codex on Field, then Add another. Close `Codex`. **Expect:** `Codex 2` only.
2. On the phone, select `Codex 2`. Click a different terminal tab in VS Code. **Expect:** the phone still targets `Codex 2`. *(K5)*
3. Run **Developer: Reload Window**. **Expect:** within a few seconds `Codex 2` is On Field again with the same seat, the phone is still targeting it, and a short Play lands in `Codex 2`. *(Proves the reconnect PID + start-time match; resolves the §18 Known Unknown U1.)*
4. Quit VS Code completely and reopen GS3. **Expect:** the revived `Codex 2` tab is **not** On Field and **cannot** receive a Play. *(Proves the revive-safety case, the reason names were rejected.)*

---

## 16. BREADCRUMB IMPACT

**YES.**

**Owner:** `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md`. Stage 1.8 writes these changes; this play does not.

**1. Amend** the `[WHY: Stage 1.5]` IS entry. Its phrase "Coach-created **or marker-adopted** instances are dispatch-authorized" becomes:

> …Coach-created instances, and restored instances **proven** to be the same shell process (PID + OS start time) as a Coach-written provenance record in the Game's `workspaceState`, are dispatch-authorized. Terminal names, labels, and env markers never authorize. `PlayerRoster` is the sole owner of that provenance, which holds only instance ID, type, seat, shell PID, and shell start time, and is machine-local, per-Game, never synced, and never committed. All terminal evaluation flows through one idempotent `PlayerRoster` funnel fed by the activation snapshot and `onDidOpenTerminal`. Unreconcilable terminals fail safe to unknown and are not dispatchable.

**2. Add a WAS entry:**

> [WHY: Stage 1.7] Stage 1.4 assumed a terminal could carry its own identity in `TerminalOptions.env`. VS Code discards `creationOptions.env` on persistent-terminal reconnect, and revives tabs by name after a full restart with fresh shells. So terminal-carried markers could not survive a reload, and names could not safely stand in for them. Minimal provenance persistence was earned by that observed failure.

**3. Add a `## WILL BE` section.** The document currently has only IS / WAS / WHY, while the Operating Manual §35 defines WAS / IS / WILL BE. The section carries protected futures that are explicitly **not** implementation authorization:

> - **Player activity and intervention policy.** Coach will eventually recognise when a Player is actively working, waiting for permission, waiting for human input, quiet or stale, or complete. The human will choose a per-Play autonomy policy — *Ask me* / *Approve for this Play* / *Autonomous within the Play fence* — and Coach may send a scoped nudge to a Player that goes quiet after starting work. Activity observation and autonomy policy must stay separate layers (North Star §11). Both belong to live instance and Play state, **never** to the provenance table.
> - **Many Games.** Sideline Coach will operate many Games. Player runtime state is scoped per Game (`workspaceState`) and carries no Game, Stadium, or machine identity in its IDs.

**Conflict check:** neither future conflicts with this design. Activity and policy attach to the live instance record. Provenance stays proof-only (K2). The per-Game scope is already how `workspaceState` works.

**Legacy adoption:** if you approve retiring it (K4), Stage 1.8 also removes "canonical seat-1 legacy adoption" from the amended entry.

---

## 17. DIAGNOSTIC IMPACT

**YES.** This stage introduces persisted Player state, a new reconciliation boundary, and new states (PENDING, proven dead, restored).

**For Stage 1.8:** update the `Diagnostics/CONTRACT.md` Player line so that it names `PlayerRoster` as the owner of both live instances and the per-Game provenance table. Add that the preflight collector cannot read `workspaceState` (it is inside VS Code's storage database), so its PLAYERS section stays `unknown`. There is no schema, collector, or assertion change.

**For the future Stage B collector** (separately approved): reuse `PlayerRoster`'s projection, adding:
* the adoption method per instance: `created` / `restored` / `legacy-name`;
* counts of PENDING, proven-dead-this-activation, and contradiction events.

PIDs are permitted on that advanced surface. They never appear in normal UX.

---

## 18. RECOMMENDED NEXT IMPLEMENTATION PLAY

```text
TASK:              Stage 1.8 — Player reload adoption (provenance + lifecycle) + target-preservation fix
RECOMMENDED AGENT: Codex
REASONING:         Medium   (High is not required; decision logic is specified as pure functions)
TASK DIFFICULTY:   Medium
WHY THIS ROUTE:    The identity, proof rule, persisted shape, ownership, funnel, failure table, and tests
                   are fully specified. What remains is bounded state plumbing in files the same worker
                   already built in Stage 1.5.
WHY NOT OPUS:      No open architectural decision remains inside the fence.
ESCALATE ONLY IF:  the reconnected terminal's processId proves not to equal the original shell PID,
                   or the OS start-time probe cannot be made reliable on Windows — send only that blocker.
```

**Scope:**
* §13 changes under constraints K1–K5, including the seat-rule fix (T13) as a separately reported item.
* Tests T1–T15.
* Breadcrumb and contract updates per §16–17.
* Legacy adoption: **K4 default** unless you approve retirement in the prompt.

**Must not touch:** routing, model switches, report scanning, diagnostics tooling, the legacy `terminalName` dispatch branch, ports, or the Stage 1.6+ UI roadmap items. Preserve all uncommitted prior work and `Project SOP/SOP PROMPTS .md`.

**Known unknowns carried into Stage 1.8:**

| # | Known unknown |
|---|---|
| **U1** | Whether `terminal.processId` resolves to the original shell PID after reconnect. The workbench code and Stage 1.6 OS evidence strongly indicate it does. It is not yet observed end-to-end; smoke step 3 proves it. |
| **U2** | Whether a Game's `workspaceState` is distinct per Stadium (for example Codespaces). Expected, unverified. It is not needed now: the probe returns `unknown` off Windows, and the product's availability probe is already Windows-only. |
| **U3** | UX after a full restart: revived tabs named `Codex 2` look like Players but correctly are not. A future "resume Player" affordance is parked and out of scope. |

---

────────────────────────────────────────

REPORT FILE:
Stage-1.7-Player-Reload-Adoption-Architecture-Amendment.md

REPORT TIMESTAMP:
2026-09-10 18:58 MDT

────────────────────────────────────────
