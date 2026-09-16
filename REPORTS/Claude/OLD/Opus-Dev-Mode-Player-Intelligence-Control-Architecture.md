REPORT TYPE: ARCHITECTURE (no implementation)
AGENT: Claude Code · Claude Opus 5 · High
ROLE: Lead Architect — Dev Mode Player Intelligence & Control
BRANCH: `q2.8-multigame-field-debug`
INPUTS: Scout A, B, C, COMPLETE (A/B/C synthesis), D, under `REPORTS/Scout Only/Dev-Mode-Player-Control-Recon__2026-09-14/`; `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` (Routing Invariant, Provider Capacity / Usage Sentinel, Canonical Play Execution); bounded static gap-checks listed in §3.
RUNTIME SOURCE MODIFIED: none.

# Dev Mode Player Intelligence & Control Architecture

---

## 1. Executive Decision

1. **One truth model, many projections.**
   - Sideline gets a canonical, multidimensional **Player Scoreboard**: a *derived* truth model keyed by exact `(gameId, playerInstanceId)`.
   - Each dimension keeps its **existing owner**. The Scoreboard composes them and owns nothing new except two stores: capacity evidence and observe grants.
   - Dad Mode, Dev Mode, AUTO routing, scheduling, controls, and Under the Hood each project from it.
   - It is never a UI dumping ground, and it never collapses into one status enum.
2. **Evidence has two orthogonal axes: *class* (how we know) and *freshness* (how old).**
   - Precedence is defined **per question**, not globally.
   - "What the human asked", "what Sideline sent", "what the provider accepted", and "what the provider reports" are different questions with different owners.
   - Report provenance is a Sideline-stamped echo of what Sideline sent, not independent proof of the model.
3. **Execution detail is `ExecutionView.run`, never a Player name.**
   - It lives inside the existing revisioned `ExecutionView`, so it shares one epoch/revision ordering; a second store would add another stale-layer risk.
   - The Dad renderer is contractually forbidden from reading it.
4. **There is no Pause.** Human-facing control verbs are:
   - **Stop Play**: hard, per-turn, provider-gated.
   - **Checkpoint**: cooperative; a reserved Play that ends in a report.
   - **Hold / Release**: Sideline-owned queue gate, universal.
   - **Reconnect**: same provider session.
   - **Start Fresh**: explicit human decision only.
   - **Bench / On Field / Remove**: existing roster intent.

   Session preservation is a *reported property*, not a verb. Visible history is reported separately and truthfully.
5. **Capacity is scoped evidence with mandatory expiry, fanned out to instances as an eligibility reason.** It never mutates `onField`.
   - Expiry decays to **Unknown**, never to Available.
   - Unknown capacity does not block.
   - A human may *Try anyway* (explicit MANUAL only) but can never *mark available*.
6. **Context affinity is continuity evidence, graded by session continuity.**
   - An author whose provider session was not preserved has *authorship-only* affinity, which forces a handoff package.
   - Affinity chooses *within* the eligible, human-constrained set. It never grants authority.
7. **Under the Hood V1 is read-only and exact-instance, with redaction before egress.**
   - Redaction happens in the Stadium, before content leaves the extension host.
   - Frames travel over the existing Stadium→daemon WS, on demand, with bounded rings.
   - The browser gets a **per-connection scoped SSE route** on the existing daemon server, never the shared `/api/events` broadcast.
   - Viewing uses a short-lived **observe grant** bound to one instance that cannot call any control route.
   - `server.ts` is out of scope for this feature.
8. **Security is a hard gate.** Under the Hood does not ship until slices S1–S4 (redaction corpus, observe-grant authority separation, scoped-stream isolation, caps/log hygiene) are proven.
9. **First slice:** **Slice 1: Evidence vocabulary + `ExecutionView.run` projection** (types, pure projection, tests; no UI, no security surface).

---

## 2. North Star

> Coach carries the scoreboard so the Head Coach doesn't have to — and never claims to know what it cannot observe.

- **Dad Mode stays boring:** Game → Players → Reports → Plays → Send. A Player is Ready, Working, Queued, Needs you, On Bench, or "Can't take Plays now · <plain reason>".
- **Dev Mode may reveal more truth:** model, effort, evidence class, capacity scope, affinity, session proof, control capabilities.
- **Under the Hood** shows bounded, redacted, live activity for one exact Player, and grants no authority.
- Every value that is not observed is **Unknown**, and Unknown is a first-class, non-blocking, honest answer.

---

## 3. Scout Evidence Reconciled

### 3.1 Accepted as foundation (no redesign)

| Fact | Source |
|---|---|
| Exact opaque `playerInstanceId` is the routing/queue/ledger atom; labels are presentation only | Scout A, D; `player-instances.ts`, `player-display-labels.ts` |
| Game ≠ Stadium; ambiguous Game↔Stadium binding is refused (`conflicted`) | Scout D; `stadium-registry.ts:179`, `router.ts:134` |
| Work Ledger carries `model`/`effort` on current and recent Plays; `ExecutionView` omits them | Scout A; `work-ledger.ts`, `execution-projection.ts:17-34` |
| Three control transports: Codex long-lived app-server; Claude/AntiGravity one child per Play; Terminal = VS Code terminal | Scout B |
| `interrupt?()` = hard process-tree kill (Claude/AG); absent for Codex; N/A for Terminal | Scout B; `contract.ts:82` |
| Session identity durable in `workspaceState`; `eventHistory` in-memory, cap 50 | Scout B; `codex-app-server.ts:571-572`, `structured-print.ts:356` |
| `historyExpected` + `checkSession` → present / missing / unknown; Codex adds "active writer" | Scout B |
| Bench = human, reversible `onField:false`; retained identity; excluded from routing | Scout C; `player-roster.ts:386` |
| Capability snapshot = auth, catalog, `observedAt`, freshness (60 s live / 10 min cached / stale); no capacity | Scout C; `capability-types.ts:12-21`, `capability-service.ts` |
| Terminal output text is never read; only exit codes | Scout B, D; `terminal-player.ts` |
| No redaction layer anywhere in `src/` | Scout D |
| Provider children inherit full parent env | Scout D; `structured-print.ts` ProcessRunner |
| Existing breadcrumb: capacity attaches to **provider/account (and model where distinguished)**, not the instance; scheduling extends the durable queue; revalidate at release | Breadcrumbs "Provider Capacity as a Routing Dimension" |
| Existing breadcrumb: AUTO fills only what the human did not specify; context is not authority; routing precedence 1–9 | Breadcrumbs "Routing Invariant" |

### 3.2 Gap-check results (bounded, static; each materially changes architecture)

| # | Scout claim | Verified fact | Evidence | Architectural consequence |
|---|---|---|---|---|
| G1 | Scout D: SSE route auth **UNKNOWN** | **FACT:** `/api/events` is authenticated with the **same single machine token** as `/api/dispatch` and every other route. The token is accepted via `Authorization: Bearer` **or `?token=` query**. | `daemon.ts:805-812`, `daemon.ts:2292-2295`; WS `daemon.ts:310-311, 615` | There is exactly **one authority class today: token holder = full control.** No read-only authority exists. Observation authority must be *introduced* (§11.D), not assumed. |
| G2 | Scout D: Codex message/tool streaming **UNKNOWN** | **FACT:** `CodexAppServerControl` emits `progress/message` from `item/agentMessage/delta` and `progress/command`/`progress/tool` from `item/started`/`item/completed`. | `codex-app-server.ts:549-558` | Codex activity observability is *not* the weakest assumed. Only the denied/approval surface differs: Codex auto-declines requests as `kind:'request'` (`codex-app-server.ts:577-581`). |
| G3 | Scout A: meaning of capability `activeModel/activeEffort` **UNKNOWN** | **FACT:** `activeModel = control.model`, set **when the provider accepted the Play** launched with those settings, then emitted as a `settings` event. | `player-roster.ts:1210-1211`; `structured-print.ts:418-422`; Codex `codex-app-server.ts:478` | Evidence class **SIDELINE_APPLIED** (Sideline's setting accepted by the channel). Not provider-observed model truth. It is also *per control*, not per turn. |
| G4 | Scout A: report provenance model/effort | **FACT (from Scout A citation):** provenance is stamped from Control Plane dispatch facts via an instruction Sideline adds to the Play. | `report-provenance.ts:70-99`, `router.ts:280-296` | Report provenance proves **attribution** (which instance/clientRef wrote the report), **not** which model executed. Its model field is an echo of SIDELINE_RECORDED. |
| G5 | Scout D: `server.ts` relationship **UNKNOWN** | **FACT:** `CoachServer` is still instantiated "for report scanning and backward compatibility", with its own SSE and auth. | `extension.ts:55-56`; `server.ts:81-105, 841-878` | Under the Hood is **daemon-only**. `server.ts` is explicitly out of scope and must not gain activity egress. |
| G6 | Mobile exposure | **FACT:** daemon listens on `127.0.0.1` only. **UNKNOWN:** how the phone reaches it (tunnel / remote desktop / proxy). | `daemon.ts:424` | Design as if the page is reachable through an unknown relay: no master token in the observation URL, no browser persistence of activity, and the stream only while visible. |
| G7 | Dev Mode existence | **FACT:** Dev Mode is a server-owned preference (`status.preferences.devMode`, `POST /api/preferences`). | `index.html:958-966, 3633-3727` | Dev Mode is a **presentation preference, not an authority boundary.** It must never unlock control or observation authority. |
| G8 | Context model | **FACT:** `context-affinity.ts` already produces `ContextOwnership {none | owner(evidence, confidence strong/medium) | unknown}` from structured evidence first. | `context-affinity.ts:20-154` | Reuse. Extend with **session-continuity grading** (§8), not a new affinity engine. |

### 3.3 Scout contradictions resolved

| Contradiction | Resolution |
|---|---|
| Ledger model/effort vs capability `activeModel` could disagree | Different evidence classes answering different questions; per-question precedence in §7.3. |
| `interrupt?()` reads general but is uneven | Replaced in product vocabulary by capability-gated **Stop Play** descriptors (§9). It is never offered where unsupported, and never mapped to Codex `close()`. |
| "Session preserved" true for provider identity, false for visible transcript | Two separate continuity facts, `providerSession` and `visibleHistory`, in the Scoreboard (§6). |
| "On Bench / Limit reached" | Rejected. The Player stays **On Field** with eligibility reason `capacity-blocked` (§10). |
| `takingPlays = ready ∪ busy` naming tension | Replaced by derived eligibility with explicit reasons (§10.4). `capacity-blocked` is never in the immediate-dispatch set; it may be in the *later* set. |
| Fixture `executionProvider`/`timestamp` vs parser `provider`/`at` | Parser contract (`provider`/`at`) is canonical; fixture names are not graduated. |
| Scout B "DOES NOT NEED ARCHITECTURE" vs others "NEEDS ARCHITECTURE" | Scout B's primitives are sound. The vocabulary/authority decisions it listed are made here. |

---

## 4. WAS / IS / WILL BE

**WAS.**
- Sideline built exact identity, execution truth, routing constraints, context affinity, durable queues and session restore over many slices.
- Provider activity was a Stadium-local, in-VS-Code concept.
- Capacity lived in the human's head.
- One machine token granted everything.

**IS.**
- The bones are right:
  - exact identity;
  - revisioned `ExecutionView`;
  - Ledger model/effort;
  - typed route constraints;
  - evidence-first context affinity;
  - provider-specific session proof;
  - a uniform `ControlEvent` stream for all three controlled providers.
- Missing pieces:
  - a truthful projection of execution detail;
  - a control vocabulary;
  - capacity evidence;
  - session-graded continuity;
  - an observation authority class;
  - redaction;
  - a scoped activity path.

**WILL BE.**
- A derived, multidimensional Player Scoreboard with per-dimension owners, evidence classes and freshness.
- A capability-gated control verb contract.
- Scoped, expiring capacity evidence feeding a reasoned eligibility predicate.
- Session-graded context affinity.
- A read-only, redacted, exact-instance Under the Hood with a separate observe grant.
- Dad Mode unchanged except one conditional plain-language unavailable reason.

---

## 5. Canonical Player Scoreboard

### 5.1 Principles

- **Derived, not stored.** The daemon composes `projectScoreboard(gameId)` from the owners below, as a pure function like `projectExecution()`. The only *new* durable stores are the **Capacity Evidence Store** (daemon) and the in-memory **Observe Grant table** (daemon).
- **Exactly one owner per dimension.** Nothing in the Scoreboard may be written by a projection.
- **No global enum.** Every dimension is independent. Only `eligibility` is derived from other dimensions, and it is a *list of reasons*.
- **Naming.** The breadcrumb "Persistent Bottom Scoreboard" (UI-1) is a **projection** of this truth model, not the model itself.

### 5.2 Shape (conceptual TypeScript; field names are frozen intent, exact module layout is implementation detail)

```ts
type EvidenceClass =
  | 'provider-structured'   // typed field from the provider protocol for THIS turn/scope
  | 'sideline-applied'      // Sideline's setting, accepted by the provider channel (settings event at accept)
  | 'sideline-recorded'     // Sideline's own durable record of what it did (Ledger dispatch record)
  | 'local-parsed'          // versioned classifier over provider text (stderr / error string)
  | 'report-attested'       // Sideline-stamped provenance marker found in a report (attribution proof)
  | 'user-provided'         // the Head Coach said so
  | 'inferred'              // heuristic (e.g. wording-activated lookup); never blocks, never authorizes
  | 'unknown';

interface Evidence<T> {
  value: T | 'unknown';
  class: EvidenceClass;
  source: string;           // e.g. 'ledger.dispatch', 'codex:account/rateLimits', 'classifier:agy-quota@1'
  observedAt?: number;
  expiresAt?: number;       // hard: after this, value MUST project as 'unknown'
  freshness: 'live' | 'cached' | 'stale' | 'unavailable';  // reuse CapabilityFreshness
  scopeKey?: string;        // capacity only: which scope this fans out from
}

interface PlayerScoreboardEntry {
  // 1 IDENTITY — owner: PlayerInstanceBook/PlayerRoster (Stadium) + StadiumRegistry (daemon)
  identity: {
    gameId: string; stadiumId: string; playerInstanceId: string;
    playerType: 'claude' | 'codex' | 'antigravity' | 'terminal';
    provider?: string;                   // execution provider; absent for terminal
    ownership: 'coach-managed' | 'adopted' | 'external';
    transport: 'controlled' | 'legacy';
    executionType: 'reasoning' | 'direct-shell';
    displayLabel: string;                // presentation ONLY (friendlyInstanceNames)
    bindingStatus: 'connected' | 'conflicted' | 'offline';
  };
  // 2 PARTICIPATION — owner: PlayerRoster.onField (human intent). Never machine-mutated.
  participation: { onField: boolean };
  // 3 WORK STATE — owner: Work Ledger + PlayQueue via projectExecution (daemon)
  work: { execution: ExecutionView; queuedCount: number; held: boolean };
  // 4 EXECUTION DETAIL — owner: see §7; carried as ExecutionView.run
  // 5 CONTEXT CONTINUITY — owner: Ledger + reports + binding store (§8)
  continuity: ContinuityFacts;
  // 6 CAPABILITY — owner: CapabilityService snapshot (Stadium → daemon)
  capability: { snapshot: ProviderCapabilitySnapshot; routingState: 'ready'|'busy'|'unavailable'|'needs-verification' };
  // 7 CAPACITY — owner: Capacity Evidence Store (daemon), fanned out by scope
  capacity: Evidence<'available' | 'constrained' | 'blocked'> & { resetAt?: Evidence<number> };
  // 8 SESSION CONTINUITY — owner: ControlledBindingRecord + restore outcome (Stadium)
  session: {
    providerSession: Evidence<'proven-present' | 'opened-fresh' | 'missing' | 'held-by-other-writer' | 'not-applicable'>;
    historyExpected: boolean;
    sessionEpoch: number;                // increments whenever a fresh provider session opens under this instance
    visibleHistory: 'live-only-capped' | 'none';   // truth: eventHistory is in-memory, 50 events, lost on Stadium restart
  };
  // 9 OBSERVABILITY — owner: static per-adapter descriptor (Stadium), versioned with the adapter contract
  observability: Record<'lifecycle'|'message'|'command'|'tool'|'declined', 'yes'|'no'|'unknown'>;
  // 10 CONTROL CAPABILITIES — owner: static per-adapter descriptor (Stadium) + ownership
  controls: Record<ControlVerb, ControlDescriptor>;   // §9
  // DERIVED — never stored
  eligibility: { now: EligibilityVerdict; later: LaterVerdict };  // §10.4
}
```

`providerSessionRef` itself is **not** projected to the browser. Dev Mode may show a short, non-reversible fingerprint only.

---

## 6. Evidence & Provenance Model

### 6.1 Two axes

- **Class** (how we know) is from the enum above. Class never upgrades with age.
- **Freshness** (how old) is computed from `observedAt` against a **per-truth-class TTL** (§14). A hard `expiresAt` overrides everything: after it, the value is `unknown`.

### 6.2 Per-question precedence (frozen)

| Question | Authoritative answer | May fall back to | Never answered by |
|---|---|---|---|
| What did the **human** ask? | Route constraints / MANUAL selection | — | provider state, reports |
| What did **Sideline send**? | Ledger dispatch record (`sideline-recorded`) | RoutingDecision/dispatchAttempt, **only while the dispatch is pending** | capability `activeModel`, report provenance |
| What did the **provider accept** as settings for this turn? | `settings` event emitted at accept of **the same turnRef** (`sideline-applied`) | — | ledger (different question) |
| What model is the provider **actually running**? | `provider-structured` field tied to this turn | otherwise **Unknown** (Dev shows "sent" labelled as sent, not "running") | catalog `defaultModelId`, provider name, previous Play, report provenance |
| Who **wrote** this report? | `report-attested` provenance (instance, clientRef, Game) | Ledger single-active-play attribution (existing, conservative) | wording, filename guesses |
| Can this scope **execute now**? | Capacity Evidence (§10) | — | busy, bench, auth (separate reasons) |

### 6.3 Conflict rule

When two classes disagree, **both are kept**. The projection picks the answer for the question being asked, and Dev Mode shows a mismatch marker. Nothing overwrites a lower-class record with a higher-class one. The Ledger's "sent" is historical fact even if the provider later reports something else.

---

## 7. Execution Identity Projection

### 7.1 Fields (frozen)

```ts
type ModelValue =
  | { kind: 'explicit'; id: string; displayName?: string }  // Sideline sent this exact model
  | { kind: 'provider-default' }   // Sideline deliberately sent no model; provider decides; actual model Unknown
  | { kind: 'provider-managed' }   // provider protocol declares it selects per turn and Sideline cannot pin (reserved; no provider declares this today)
  | { kind: 'not-applicable' }     // direct-shell (Terminal)
  | { kind: 'unknown' };           // Sideline cannot establish what it sent (e.g. recovered turn without durable candidate)

type EffortValue =
  | { kind: 'explicit'; value: string } | { kind: 'provider-default' } | { kind: 'not-applicable' } | { kind: 'unknown' };

interface ExecutionRunDetail {          // ExecutionView.run — present only when a current or finishing Play exists
  provider?: string;
  requested?: { model?: 'auto' | string; effort?: 'auto' | string; source: 'human-constraint' | 'manual' | 'auto' };
  sent:     { model: ModelValue; effort: EffortValue };                   // sideline-recorded
  applied?: { model?: string; effort?: string; turnRef: string };         // sideline-applied, same turnRef only
  observed?: { model?: Evidence<string>; effort?: Evidence<string> };     // provider-structured only; default absent = Unknown
  mismatch?: boolean;                                                     // observed ≠ sent (Dev marker)
}
```

### 7.2 Semantics

- **Exact model:** `sent.model.kind === 'explicit'`. Dev renders `Opus · High`.
- **Provider default:** Dev renders `Provider default`. It **never** substitutes the catalog's default model name. A catalog default describes a menu, not an execution.
- **Provider-managed:** reserved. Dev renders `Chosen by provider`. It may be used only when a provider capability descriptor declares it.
- **Unknown:** Dev renders `Model unknown`.
- **Requested effort:** what the human or AUTO asked for (may be `auto`).
- **Sent effort:** the resolved value Sideline passed.
- **Observed effort:** a provider-structured value only. For every provider today it is **Unknown**, and Dev never implies otherwise.

### 7.3 Active label precedence (the single Dev label "what is it running now")

1. **Pending dispatch** (no Ledger currentPlay yet): RoutingDecision model/effort, rendered with a `Sending…` qualifier.
2. `observed` (provider-structured, same turn). Show it, plus a `≠ sent` marker if `mismatch`.
3. `applied` (same turnRef).
4. `sent` (Ledger currentPlay).
5. `Model unknown`.

Rules around this ladder:
- Capability `activeModel` is used **only** as `applied`, and **only** when its settings event belongs to the active turnRef. Otherwise it is "last applied session setting" (Dev history).
- Report provenance is **never** used for an active label.
- **Idle** Players show **no** run label. "Last ran Opus · High" is Dev history, visually distinct, never on the identity line.

### 7.4 Location decision

`run` is an **optional field of `ExecutionView`**, not a separate `devExecution` store.

- **Reason:** it shares the Play lifecycle and must share the same `(epoch, revision)` ordering. A parallel projection would reintroduce the stale-layer race this project keeps paying for.
- **Dad purity by contract:** a renderer test asserts Dad Mode output is byte-identical with and without `run`.
- A `settings` event for the active turn bumps revision.
- Terminal Plays carry `run.sent = not-applicable`.

### 7.5 Presentation (Dev Mode)

- The identity line stays `Claude 1`.
- While working, Dev Mode adds an adjunct `Opus · High` on the strip, or `Claude 1 · Opus · High` in compact rows.
- A label-mode toggle (Player / Model / Full) is optional presentation work; it is not needed for truth.
- Effort renders title-cased; the raw id is shown in a tooltip/detail.

---

## 8. Context / Continuity Model

### 8.1 Two different things

- **Context affinity:** "who already understands this work?" It is evidence-based and computed **relative to a specific Play** by the existing `detectFollowUp` + `resolveContextOwner`.
- **Context size / tokens remaining:** `Evidence<{usedTokens?, windowTokens?}>` **only** from `provider-structured` sources. Otherwise it is **Unknown**. It is never estimated from characters sent, never shown as a percentage unless the provider supplies one, and never used by AUTO when Unknown.

### 8.2 Per-instance continuity facts (Scoreboard, Play-independent)

```ts
interface ContinuityFacts {
  currentPlay?: { clientRef: string; summary?: string; startedAt: number; sessionEpoch: number };
  recentPlays: Array<{ clientRef: string; summary?: string; finishedAt: number; outcome: string; sessionEpoch: number }>; // bounded, same Game
  authoredReports: Array<{ path: string; clientRef?: string; class: 'report-attested' | 'sideline-recorded' }>;
  lastActiveAt?: number;
}
```

**New fact: `sessionEpoch`.** It is recorded on every Ledger Play and increments when a fresh provider session opens under the same instance: Start Fresh, AntiGravity replacement ref, or `opened-fresh` restore. This is the missing link between "this Player did the work" and "this Player's provider memory still contains the work".

### 8.3 Affinity grading (extends existing `strong | medium`)

| Grade | Condition |
|---|---|
| `strong` | Existing strong evidence (incoming-report / named-report / explicit provenance) **and** the Play's `sessionEpoch` equals the instance's current epoch **and** `providerSession = proven-present` |
| `medium` | Existing medium evidence (latest-report / latest-play) with the same session-continuity condition |
| `authorship-only` | The owner is proven, but the session epoch changed or session proof is missing/unknown. The Player wrote it but may not remember it. |
| `none` / `unknown` | Unchanged |

`authorship-only` **forces a handoff package** (`buildHandoffPreamble`) **even when the same instance is chosen**.

### 8.4 Influence on AUTO (frozen)

Affinity operates at routing precedence step 5 of the existing invariant, and **only chooses within** the set left after:
1. human constraints;
2. hard eligibility.

- Owner eligible and idle: prefer the owner.
- Owner busy: queue-for-owner (existing).
- Owner **capacity-blocked**: AUTO does not silently wait or reroute. It stages the existing breadcrumb's human choice: **Wait for <Player>** (eligible later) or **Use best available now** (with handoff).
- Owner benched or needs-decision: not a candidate. The handoff package still travels to whoever executes.
- Affinity never: overrides a constraint, jumps a queue, un-benches, bypasses capacity, or grants dispatch/control/observe authority.

---

## 9. Provider Control Verb Contract

### 9.1 Layers never conflated

| Layer | Lifetime | Examples |
|---|---|---|
| **Play lifecycle** | one turn | Stop Play, Checkpoint (as a Play) |
| **Queue gate** | Sideline-owned, per instance | Hold / Release |
| **Provider session** | provider conversation/thread | Reconnect, Start Fresh |
| **Visible history** | in-memory presentation | (property only in V1) |
| **Player lifecycle / roster** | instance identity | Bench, On Field, Remove |

### 9.2 Verbs (human-facing names and meanings, frozen)

| Verb | Exact meaning | Blast radius | Partial changes possible? | Kind |
|---|---|---|---|---|
| **Stop Play** | Hard-interrupts **the current turn only**, identified by `turnRef`. The Player, its session reference and its queue remain. | turn | **Yes**, always disclosed | provider-gated |
| **Checkpoint** | Delivers a **reserved Play** (`playKind:'checkpoint'`) asking the Player to write a checkpoint report to the Game's report channel. It **runs after** any current turn; it does not interrupt. Complete = normal turn completion + an attributed report. | none beyond a normal Play | n/a | provider-gated (controlled reasoning only) |
| **Hold** / **Release** | Sideline stops/resumes **releasing queued Plays** to this exact instance. A current turn continues. This is the only pause-like concept, and it is never called Pause. | queue | no | universal (Sideline-owned) |
| **Reconnect** | Re-open **the same** provider session via existing `restore()`. Outcomes: present / missing / unknown / held-by-other-writer. | session channel | no | provider-gated |
| **Start Fresh** | Open a **new** provider session under the same instance identity. Only as the human's answer to `needs-decision`, never automatic. Increments `sessionEpoch`. | provider memory | no | provider-gated, human-only |
| **Bench / Put On Field** | Existing human roster intent. It does not touch the process. | routing participation | no | universal |
| **Remove** | Existing, ownership-gated: coach-managed closes; adopted/external detaches. | player | depends | universal, ownership-gated |

**Composites** (V2 presentation, built from the above only): *Checkpoint then Hold*; *Stop Play and Hold*.

**Never offered:**
- Pause, Suspend, Freeze.
- "Preserve Session" as a button (preservation is default behaviour and a reported property).
- "Preserve visible history" in V1. Visible history is truthfully reported as `live-only-capped`. A durable transcript store would be a later, separately security-gated decision, and would be redacted like UTH.

**Automatic checkpoint text generated from the activity stream: rejected.** Checkpoint reports are Player-authored canonical content (existing rule: never sanitized or rewritten by Sideline).

### 9.3 Control descriptor

```ts
type ControlVerb = 'stop-play' | 'checkpoint' | 'hold' | 'release' | 'reconnect' | 'start-fresh' | 'bench' | 'on-field' | 'remove';
interface ControlDescriptor {
  supported: 'yes' | 'no' | 'unknown';
  reasonIfNot?: string;                  // human-readable, Dev Mode
  blastRadius: 'turn' | 'queue' | 'session' | 'player' | 'none';
  partialChangesPossible: boolean;
  certifiedAgainst?: string;             // adapter contract version, e.g. codex CERTIFIED_VERSION
}
```

### 9.4 Invariants (frozen)

- Every control verb targets exact `playerInstanceId`. **Stop Play also requires the expected `turnRef`.** A stale `turnRef` is refused, so a late click can never stop the *next* Play.
- **Codex Stop Play = `no`** until a provider-native turn interrupt is probed and certified (Probe P1). It is **never** implemented as `close()` of the app-server.
- Control verbs require **control authority**. An observe grant can invoke none of them (§11.D).
- A verb whose descriptor is `no` or `unknown` is not rendered as an enabled control. Dev Mode may show it disabled with `reasonIfNot`.
- Stop Play outcome is reported from the provider event (`turn:interrupted`) and never assumed from the kill call.

---

## 10. Capacity & Eligibility Model

### 10.1 Capacity observation

```ts
interface CapacityObservation {
  id: string;
  scope: { provider: string; accountKey: string | 'unknown-account'; model?: string };   // instance scope NOT permitted (see below)
  state: 'available' | 'constrained' | 'blocked';   // absence/expiry ⇒ 'unknown'
  window?: { label?: string };                        // provider-described window ("5-hour", "weekly"); free label, NOT a core enum
  resetAt?: number;
  usage?: { percentUsed?: number };                  // provider-structured only
  class: 'provider-structured' | 'local-parsed' | 'user-provided' | 'sideline-recorded';   // sideline-recorded = our own dispatch succeeded/failed
  source: string;                                    // parser id@version / protocol method
  observedAt: number;
  expiresAt: number;                                 // REQUIRED
  detail?: string;                                   // redacted, ≤ 120 chars, Dev only
}
```

- **Scope:**
  - Provider + account by default.
  - Model-scoped when the provider distinguishes it (e.g., a model-specific weekly cap).
  - **Not instance-scoped:** provider capacity is an account property (existing breadcrumb). A failure that is truly instance-specific is a *work/session* fact, not capacity.
- **Account key:** unknown account never fans out to a Player whose account is known to be different.
- **Fan-out:** every Scoreboard entry whose `(provider, accountKey, model?)` matches sees the most specific non-expired observation, with `scopeKey` recorded.
- **No fossilized providers:** "5-hour" and "weekly" are `window.label` strings supplied by evidence sources, not architecture enums. Multiple windows are multiple observations.

### 10.2 Provenance classes (strongest first) and default expiry policy

Numbers are **policy defaults**; the *rules* are frozen.

| Class | Example | Blocks dispatch? | Expiry |
|---|---|---|---|
| `provider-structured` | protocol rate-limit field / typed error with reset | yes | `resetAt` + grace (default 60 s); without `resetAt`: 15 min |
| `sideline-recorded` | a Play on this scope completed successfully | clears `blocked` (same scope only) | `available` for 10 min |
| `local-parsed` | versioned classifier matched `quota exceeded` | yes | `min(resetAt + grace, 6 h)`; without `resetAt`: 15 min |
| `user-provided` | Head Coach: "Claude is out until 3 PM" | yes (human-stated) | stated time, or 5 h max; human can clear |
| `inferred` | — | **never** | not stored as capacity |

**Expiry rule (frozen): expired capacity projects `unknown`, never `available`.**

### 10.3 Distinctions (frozen)

| This is… | …not capacity | Owner |
|---|---|---|
| **Busy** | a turn is running / queue owner | Ledger |
| **Bench** | human participation intent | Roster `onField` |
| **Unauthenticated** | capability snapshot `authenticated:false` | CapabilityService |
| **Needs verification** | adapter contract unproven | control factory |
| **Session needs decision** | missing session with history | binding restore |
| **Held** | Sideline queue gate | PlayQueue |
| **Conflicted** | Game open in >1 Stadium | StadiumRegistry |
| **Capacity blocked** | provider/account cannot start work now | Capacity Evidence Store |

### 10.4 Derived eligibility (never stored)

```ts
type IneligibleReason =
  | 'conflicted-game' | 'offline' | 'not-on-field' | 'session-needs-decision' | 'unauthenticated'
  | 'needs-verification' | 'capability-unavailable' | 'capacity-blocked' | 'busy' | 'held' | 'not-reasoning-for-auto';
interface EligibilityVerdict { eligible: boolean; reasons: IneligibleReason[] }   // ALL applicable reasons, never collapsed
interface LaterVerdict { possible: 'yes' | 'no' | 'unknown'; notBefore?: { at: number; class: EvidenceClass }; blockers: IneligibleReason[] }
```

- **Now:** eligible iff `reasons` is empty. `capacity: unknown` adds **no** reason.
- **Later:** `possible = yes` iff every reason is *time- or state-recoverable* (`capacity-blocked` with expiring evidence, `busy`, `held`).
  - `possible = no` for `not-on-field` (human intent; scheduling must not un-bench), `session-needs-decision`, `unauthenticated`, `conflicted-game`.
  - `possible = unknown` for `needs-verification` and `offline`.
- **AUTO tie-break only:** among otherwise-equal eligible candidates, `available` (known) may be preferred over `unknown`. Capacity preference sits at existing precedence step 8 and can never override steps 1–7.

### 10.5 Constrained route + capacity (reconciles the existing Routing Invariant)

- **Human says "Use Claude" and Claude is capacity-blocked:** there is **no silent substitution**. Staged result: `Claude 1 · Limit reached · back ~12:40`, with **Wait for Claude 1** (scheduled/conditional queue) or **Let Coach choose** (relaxes the constraint only by explicit human act).
- **MANUAL target select:** blocked instances remain visible as **disabled-with-reason** options, not hidden. This fixes Scout C's "disappears from MANUAL" gap.

### 10.6 Manual override (frozen)

- **Try anyway:** permitted **only** as an explicit MANUAL dispatch to an exact instance whose *only* non-soft reason is `capacity-blocked`.
  - Recorded in the Ledger as `override: 'capacity'`.
  - The outcome becomes new evidence: success → `sideline-recorded available`; capacity failure → refreshed `blocked`.
  - AUTO never overrides.
- **Not overridable:** `unauthenticated`, `needs-verification`, `session-needs-decision`, `conflicted-game`, `offline`. These are hard truths, not guesses. `busy` resolves by queue; `not-on-field` resolves by the human putting the Player On Field.
- **Mark available: forbidden.** A human cannot fabricate capacity. A human *can* add or clear their own `user-provided` statements.

### 10.7 Future scheduling contract

Scheduled/conditional Plays extend the durable `play-queue.ts` (existing breadcrumb). No separate subsystem.

- **An item stores a condition, never a verdict:** preferred exact instance, constraints, `notBefore?`, `releaseWhen: 'eligible' | 'time'`, fallback policy (`wait` | `best-available-with-handoff`), context refs, created/reason.
- **At release, recompute full eligibility and constraints as if dispatching now:** Game, binding, instance exists, on field, session, auth, capability, capacity, collisions, human cancellation.
  - Still ineligible → apply the item's fallback policy.
  - Still `wait` → re-arm with the next `notBefore` from fresh evidence, with bounded attempts and a visible "still waiting" state.
- **Never dispatch because a clock was reached.** `resetAt` is only the earliest retry point.

---

## 11. Under-the-Hood Observability Architecture

### 11.1 Pipeline (V1)

```text
Stadium (extension host)
  PlayerControl.onEvent (ControlEvent, raw, local)        ← unchanged; in-VS-Code pseudoterminal stays as-is
    └─ ActivityRedactor (pure, versioned 'uth-v1')         ← ONLY producer of ActivityFrame
         └─ per-instance redacted ring (≤200 frames)
              └─ forwards ONLY for instances the daemon subscribed   (WS notification: player.activity)
Control Plane daemon
  activity.subscribe / activity.unsubscribe → Stadium RPC (demand-driven egress)
  secondary secret-pattern verifier (defense in depth; counts misses, never primary)
  per-instance relay ring (≤200 frames / ≤64 KB; evicted N min after last subscriber)
  GET /api/players/instance/:instanceId/activity?gameId=…&after=…   (SSE, per-connection scoped, observe grant only)
Browser
  Under the Hood panel opens stream only while visible; no storage; renders frames
```

- **Not** the shared `/api/events` broadcast.
- **Not** `server.ts`.
- **Not** a new transport technology: same WS, same HTTP server, same SSE.

### 11.2 Canonical frame

```ts
interface ActivityFrame {
  v: 1;
  gameId: string; stadiumId: string; playerInstanceId: string;
  streamEpoch: string;     // Stadium-minted per PlayerControl lifetime (new control / restore ⇒ new epoch)
  seq: number;             // monotonic per (playerInstanceId, streamEpoch)
  at: number;              // Stadium clock
  turnRef?: string;
  kind: 'lifecycle' | 'message' | 'command' | 'tool' | 'declined' | 'settings' | 'channel' | 'gap';
  text?: string;           // redacted + bounded
  redaction: { policy: 'uth-v1'; level: 'L0' | 'L1' | 'L2'; applied: boolean; truncated: boolean };
}
```

### 11.3 Scoping

- A stream is bound to exactly one `(gameId, playerInstanceId)`.
- At subscribe, the daemon verifies:
  - the Game's authoritative session is unambiguous (conflicted → refuse, same rule as routing);
  - the instance is in that session's roster;
  - the grant matches.
- If the instance leaves the roster, the Game becomes conflicted, or the Stadium disconnects, the stream emits a terminal `channel` frame and closes.
- There are no wildcard, multi-instance or cross-Game subscriptions.

### 11.4 Epoch / sequence / reconnect

- **Cursor** = `(streamEpoch, seq)`.
- **Browser reconnect with `after=`:**
  - contiguous in the daemon ring → replay the missing frames;
  - otherwise → a `gap` frame ("earlier activity not available"), then the tail.
- **Daemon restart:** the daemon ring is empty, so it re-subscribes to the Stadium and backfills from the Stadium's redacted ring. If the Stadium also restarted, a `gap` frame follows.
- **Stadium `streamEpoch` change** (restore, new control): a `gap` frame with "Player reconnected", and seq restarts.
- The daemon's Ledger `execution_…` epoch continues to govern `ExecutionView`. Activity uses its own Stadium-origin epoch because it originates Stadium-side and must survive daemon replacement.

### 11.5 What "LIVE" truthfully means

"LIVE" refers to **the observation path**. Work state still comes only from `ExecutionView`.

| View state | Condition |
|---|---|
| `CONNECTING` | stream opening / subscription not yet acknowledged by Stadium |
| `LIVE` | scoped stream open **and** Stadium session `socketOpen` **and** subscription acknowledged **and** heartbeat within 15 s |
| `QUIET` | LIVE, no frames for ≥ 30 s (idle is not dead) |
| `DISCONNECTED · last seen <age>` | any LIVE condition fails; frames remain, visibly stale |
| `NOT AVAILABLE` | observability descriptor says no activity for this Player (Terminal) |
| `ENDED` | control closed / Player removed |

### 11.6 Provider asymmetry

- The panel renders only the `kind`s the observability descriptor marks `yes`.
- `unknown` kinds are omitted silently.
- Terminal shows `Activity isn't available for Terminal Players` (truth: output is never read).

### 11.7 Rate and coalescing

- **Stadium:**
  - coalesces `message` deltas into frames (≈250 ms or ≤ 280 chars);
  - caps ≤ 10 frames/s per instance;
  - on overflow, drops oldest and inserts a `gap` frame.
- **Daemon:** reuses the `scheduleExecutionBroadcast`-style batching.

---

## 12. Security & Redaction Contract (HARD GATE)

### A. Where redaction occurs

- **Primary, mandatory:** the Stadium `ActivityRedactor`, before any byte leaves the extension host. It is enforced **structurally**: the WS `player.activity` method accepts only `ActivityFrame`, and only the redactor constructs `ActivityFrame`. Raw `ControlEvent` has no serialization path to the daemon.
- **Defense in depth:** the daemon runs a secondary secret-pattern verifier on `text`. A hit replaces the text with `[redacted]` and increments a diagnostic counter (`redactionMiss`), which is itself a test failure signal. The daemon is never the primary redactor.
- **Browser:** never redacts. It must be safe to assume it receives only safe content.

### B. Permitted content (levels)

| Level | Content | V1 default |
|---|---|---|
| **L0** lifecycle | turn states, timestamps, channel state, category counts | **on** |
| **L1** structure | frame kind; tool name; command **program basename** only (`git`, `npm`, `pwsh`); file **basename** | **on** |
| **L2a** assistant text | redacted, ≤ 280 chars per frame | **on** |
| **L2b** command arguments | full command line after redaction | **off** (Dev setting "Show command details", per Game, server-owned) |

Redaction rules applied at L2:
- secret patterns (bearer/basic auth, `Authorization:` headers, common key prefixes, JWT shape, long high-entropy tokens);
- `KEY=value` and `--flag value` where the key or flag name matches a sensitive-name list (`token|secret|password|passwd|key|auth|cookie|session|credential`);
- URL userinfo and query strings stripped;
- absolute paths under the Game root made Game-relative;
- the home directory becomes `~`;
- paths outside the Game become `‹outside game›/basename`;
- email addresses masked.

**Never permitted, at any level:**
- environment values;
- tool **inputs** bodies (e.g., file contents passed to write/edit tools);
- tool **outputs**/command stdout/stderr (not captured today; must stay so);
- raw provider stderr;
- diffs;
- `providerSessionRef`;
- account identifiers beyond a masked Dev hint.

**Persistence:** activity text is never written to the Work Ledger, reports, `control-plane.log`, or browser storage.

### C. Subscription scoping

**Yes.** A browser receives rich activity **only** for the exact Player whose Under the Hood view it explicitly opened (§11.3). Dad-neutral status stays on `/api/events`, and rich content never rides it.

### D. Authentication / authorization

Today there is one token and full authority (G1). Architecture introduces **authority classes**:

| Class | Holder | Can |
|---|---|---|
| `control` | existing machine token | everything today, plus mint observe grants |
| `observe` | **observe grant**: opaque, random, short-lived (default 10 min, renewable while the panel is open), bound to `(gameId, playerInstanceId, 'activity:read')`, in-memory only | open the single matching activity stream; nothing else |

- `POST /api/observe/grant {gameId, playerInstanceId}` requires `control` and returns the grant.
- The activity route accepts **only** an observe grant, never the control token. So the URL an `EventSource` must carry (query string) never contains the master token.
- **Every control/dispatch/preferences route rejects observe grants** (test-enforced).
- Grants are invalidated on daemon restart, on instance removal, and on expiry.
- Dev Mode preference grants nothing.

### E. Backpressure and bounded memory (caps are architecture; numbers are policy)

- Stadium redacted ring: ≤ 200 frames per instance.
- Daemon relay ring: ≤ 200 frames / ≤ 64 KB per subscribed instance; evicted 5 min after the last subscriber.
- Per-connection write buffer: ≤ 256 KB. When `res.write()` returns false, frames are skipped for that client and a `gap` is sent on drain. Exceeding the cap disconnects the stream.
- ≤ 2 concurrent streams per instance; ≤ 6 activity streams daemon-wide.
- Frame `text` ≤ 280 chars (message) / ≤ 400 chars (L2b command).

### F. Mobile / browser exposure

- Assume access through an unknown relay (G6).
- The panel is closed by default. The stream is open only while the panel is visible (Page Visibility). A hidden tab closes it, and reopening resumes via `after=`.
- No activity in `localStorage`/`sessionStorage`/IndexedDB, notifications, or document title.
- The same content policy applies on every viewport; there is no "desktop shows more" rule.
- Leaving the page drops all frames from memory.

### Ship gate (all required before Under the Hood UI is enabled)

1. Redactor fixture corpus passes (secrets in commands, messages, paths, URLs, env-like pairs; zero leaks).
2. Observe grant cannot call any control route; control token rejected on the activity route.
3. Scoped-stream isolation: a subscriber to A never receives a frame of B or another Game (multi-Game fixture).
4. Log/storage hygiene: grep of daemon log + persisted files after a fixture run contains no frame text.
5. Caps/backpressure tests.
6. Existing `/api/events` payload unchanged (no rich fields).

---

## 13. Freshness Matrix

| Truth class | Source | Owner | Freshness rule | Expiry | Revalidation | Failure state |
|---|---|---|---|---|---|---|
| **Player identity** | `PlayerInstanceBook` + provenance/binding | Stadium `PlayerRoster` | valid for Stadium session lifetime | Stadium disconnect ⇒ instance projects `offline` (not deleted) | roster sync on WS reconnect (`rosterSynchronized`) | `offline`; AUTO refuses while unsynchronized (existing) |
| **Game/Stadium binding** | `stadium.hello` + registry | daemon `StadiumRegistry` | live while socket open + heartbeat | socket close / heartbeat loss | hello on reconnect | `offline` / `conflicted` (routing and UTH blocked) |
| **Extension build identity** | `extensionBuildId` at activation | Stadium → registry | fixed per session | session end | relaunch | dev-only mismatch flag (see relaunch report) |
| **Provider capability** | provider probes | `CapabilityService` | live < 60 s, cached < 10 min, stale after | stale ⇒ AUTO immediate dispatch refuses when `unavailable` (existing) | `/api/capabilities/refresh`, probe cadence | `stale` / `unavailable` |
| **Model availability** | capability catalog | `CapabilityService` | same as capability | same | same | model-constrained route fails truthfully |
| **Capacity evidence** | provider-structured / parsed / user / sideline-recorded | daemon Capacity Evidence Store | per-class TTL (§10.2) | hard `expiresAt` ⇒ **unknown** | new evidence; successful Play; human clear | `unknown` (non-blocking) |
| **Context affinity** | Ledger + report provenance + `sessionEpoch` | daemon (pure `context-affinity`) | recomputed per routing decision; never cached as a Player property | n/a (derived) | on every route/preview | `unknown` ⇒ no affinity preference |
| **Provider session proof** | `checkSession` / restore outcome / init echo | Stadium binding + control | proven at restore/open; valid while the control channel is ready | channel `exited`/`lost` ⇒ `unknown` until next proof | Reconnect / restore | `missing` → `needs-decision` if `historyExpected` |
| **Execution state** | Ledger + queue + turn events | daemon `projectExecution` | `(epoch, revision)` ordering | daemon replacement ⇒ new epoch; active Plays become recovery candidates (existing) | status snapshot on SSE connect | `unknown` (Dad-suppressed per existing rules) |
| **Execution run detail** | Ledger dispatch + settings + provider fields | daemon, inside `ExecutionView` | same revision as execution | with Play | same | `Model unknown` |
| **Activity stream** | `ControlEvent` → redactor | Stadium ring → daemon relay | `(streamEpoch, seq)`; heartbeat 15 s | ring caps; eviction 5 min | `after=` cursor / Stadium backfill | `gap`, `DISCONNECTED · last seen` |
| **Observe grant** | `POST /api/observe/grant` | daemon (memory) | 10 min, renewable | expiry / daemon restart / instance removed | re-mint while panel open | stream closes; panel shows reconnect |
| **Browser projection** | SSE `status`/`execution`/`activity` | browser stores | epoch/revision merge; display skew via `serverNow` | page reload / SSE reconnect resync | full status on connect (existing) | never renders Scoreboard values older than their `expiresAt` |

**Rule (frozen): one "Connected" proves only transport/session presence.** It never implies capability freshness, capacity, session proof, or extension build currency.

---

## 14. Dad Mode Projection

Dad Mode stays as it is today (the Q2.10F projection rules are preserved). Added surface: **one conditional plain-language unavailable reason, shown only when it changes a decision.**

| Visibility | Dad content |
|---|---|
| **Always** | Player label; On Field / On Bench; work state (Working · timer / Queued / Needs you / Ready) |
| **Conditionally** | `Can't take Plays now · <reason>`, only when the Player is **not working** **and** (it is the human's selected/constrained target **or** a staged route must choose Wait vs Continue). Reason priority: `Needs your decision` > `Sign-in needed` > `Being checked` > `Limit reached` (+ `· back ~12:40` only if class ≥ `local-parsed` and not expired; `user-provided` renders `· you said 3 PM`) > `Reconnecting`. |
| **Never** | model, effort, provider evidence classes, affinity grade, capacity scope, session proof, control descriptors, activity |

- Dad Mode never shows capacity `unknown`. Absence is silence.
- Dad Mode does not gain Stop Play, Checkpoint, or Hold in V1. If field use later proves Dad needs *one* control, the candidate is **Hold** (Sideline-owned, zero partial-change risk). That is a separate product decision.

---

## 15. Dev Mode Projection

Dev Mode is a preference; it confers no authority.

| Visibility | Dev content |
|---|---|
| **Dev strip/row** | `Claude 1` + run adjunct `Opus · High` / `Provider default · High` / `Model unknown`; `Sending…` qualifier; `≠ sent` mismatch marker |
| **Dev Player detail** | provider; requested vs sent vs applied vs observed; eligibility reasons (all); capacity state + class + age + reset + scope; affinity grade + evidence for the staged Play; session proof + `sessionEpoch` + `visibleHistory: live only (last 50, lost on restart)`; control descriptors (supported / not + reason / blast radius / partial-change warning); last run (history styling) |
| **Dev controls** | Stop Play (where `yes`, with the partial-changes confirmation), Checkpoint, Hold/Release, Reconnect, Start Fresh (only in `needs-decision`), Try anyway (MANUAL, capacity-only) |
| **Under the Hood only** | activity frames, LIVE state, `streamEpoch`/`seq`, gaps, redaction level notice, "Show command details" toggle |

---

## 16. Provider Capability Matrix (today, from source; ✔ yes · ✘ no · ? unknown)

| Dimension | Claude (controlled) | Codex (controlled) | AntiGravity (controlled) | Terminal |
|---|---|---|---|---|
| Transport | child process per Play | long-lived app-server + thread | child process per Play | VS Code terminal |
| `run.sent` model/effort | ✔ explicit or provider-default | ✔ | ✔ | not-applicable |
| `run.applied` (settings at accept) | ✔ | ✔ (`codex-app-server.ts:478`) | ✔ | ✘ |
| `run.observed` model | ? (Probe P2) | ? (Probe P1) | ? (init echo carries conversation, model unverified) | n/a |
| Context usage (tokens) | ? | ? (Probe P1) | ? | n/a |
| **Stop Play** | ✔ hard kill, partial changes possible | **✘** (not certified; never `close()`) | ✔ hard kill, partial changes possible | ✘ |
| **Checkpoint** | ✔ (reserved Play) | ✔ | ✔ | ✘ |
| **Hold / Release** | ✔ | ✔ | ✔ | ✘ (no queue for direct-shell today) |
| **Reconnect** | ✔ `--resume` + `checkSession` | ✔ `thread/resume`; may be `held-by-other-writer` | ✔ `--conversation` + echo check; may yield replacement ref | ✘ (re-adoption only, automatic) |
| **Start Fresh** | ✔ human decision | ✔ | ✔ | ✘ |
| Session preserved | ✔ provider session | ✔ thread | ✔ conversation | ✘ |
| Visible history | live-only, 50, lost on restart | same | same | none |
| Activity: lifecycle | ✔ | ✔ | ✔ | coarse exit only; not on UTH V1 |
| Activity: message | ✔ | ✔ (G2) | ✔ | ✘ |
| Activity: command | ✔ | ✔ (G2) | ✔ | ✘ |
| Activity: tool | ✔ | ✔ (G2) | ✔ | ✘ |
| Activity: denied/declined | ✔ `denied` | ✔ `request:declined` | ? | n/a |
| Capacity evidence | ? structured (Probe P2); `local-parsed` possible | ? structured (Probe P1) | `local-parsed` only (fixture `quota exceeded`) | n/a |

---

## 17. AUTO Routing Integration

The existing precedence (breadcrumb "Routing Invariant") is kept verbatim. This architecture plugs in as follows:

1. **Steps 1–4 (human intent)** constrain the candidate set. A capacity block on a constrained target yields Wait / Let Coach choose, never substitution.
2. **Hard eligibility filter** (new, derived §10.4) removes candidates with non-soft reasons. `busy` and `held` remain queue-eligible; `capacity-blocked` remains **later**-eligible only.
3. **Step 5 context affinity** (session-graded §8.3) chooses within. `authorship-only` forces handoff.
4. **Steps 6–7** capability and work state: unchanged.
5. **Step 8 capacity:** tie-break toward known-available; unknown is neutral.
6. **Step 9 defaults:** unchanged.

**Preview/route rationale** gains, in Dev Mode only, the eligibility reasons and evidence classes behind the choice.

---

## 18. Future Scheduling Contract

See §10.7. It is summarized here as a frozen contract so it can be handed off alone.

- Durable queue items gain condition fields only.
- Release = full re-evaluation.
- There is a fallback policy per item.
- Never fire on the clock alone.
- Never un-bench.
- Never override constraints.
- Capacity `resetAt` is the earliest retry, not a promise.
- A scheduled item whose target was removed, whose Game was archived, or whose constraint became impossible ends in a visible `Needs you`, never a silent drop or substitution.

---

## 19. Failure / Unknown Semantics

| Situation | Truthful projection |
|---|---|
| Provider never exposes model | `run.observed` absent → Dev shows sent value labelled as sent |
| Provider-default run | `Provider default`; never catalog default name |
| Daemon replaced mid-Play, no durable candidate | `run.sent = unknown`; execution `unknown` per existing recovery |
| Capacity evidence expired | `unknown`, non-blocking, Dad silent |
| Capacity classifier matched ambiguous text | not recorded as capacity; the turn stays `failed` with its summary |
| Auth failure text | `unauthenticated` reason (capability), never capacity |
| Stop Play kill returned but no `interrupted` event | Dev: `Stop requested · outcome unknown`; execution follows Ledger |
| Session check `unknown` | `providerSession = unknown`; affinity at most `authorship-only` |
| AntiGravity returns a replacement conversation | `opened-fresh` (+ `sessionEpoch` increment) if allowed; else `needs-decision` (existing) |
| Codex "active writer" | `held-by-other-writer`; Reconnect disabled with reason |
| Activity gap | explicit `gap` frame; never silently stitched |
| Redactor throws on a frame | frame dropped, `gap` frame with `redaction error` (fail closed) |
| Observe grant expired mid-view | stream closes → panel `DISCONNECTED`, auto re-mint if control-authorized page |

---

## 20. Migration From Current Architecture

| Current | Change | Compatibility |
|---|---|---|
| `ExecutionView` (no model/effort) | + optional `run` | additive; Dad renderer contract test |
| Ledger `LedgerPlay.model/effort` strings | adapter maps to `ModelValue`/`EffortValue`; + `sessionEpoch` on Play records | additive; old records map `undefined → unknown` / `provider-default` per provenance rule |
| `PlayerRoutingCapability.state` | kept; eligibility reasons derived **beside** it | no persisted contract change |
| `ProviderCapabilitySnapshot` | unchanged; capacity lives in its own store | none |
| `ContextOwnership` confidence | + `authorship-only` grade | additive; existing strong/medium semantics retained when session continuity holds |
| `PlayerControl.interrupt?()` | wrapped by descriptor `stop-play`; requires `turnRef` at the route | contract unchanged |
| `ControlEvent` | unchanged; consumed by redactor | none |
| `/api/events` | unchanged (asserted) | none |
| single token | + observe grant class | control routes unchanged; new grant route |
| `server.ts` | explicitly excluded from activity egress | none |
| MANUAL target select | blocked options disabled-with-reason instead of disappearing | presentation |

---

## 21. Implementation Slices

Each slice is independently shippable. **S** = security-gate slices; Under the Hood UI (Slice U) requires S1–S4.

### Slice 1 — Evidence vocabulary + `ExecutionView.run` projection **(FIRST)**

- **PURPOSE:** Freeze `EvidenceClass`, `Evidence<T>`, `ModelValue`, `EffortValue`, `ExecutionRunDetail`. Project `run` from Ledger `currentPlay` (sent) + active-turn `settings` (applied), with pending-dispatch bridging. No UI.
- **FILES / SEAMS:** new `src/control-plane/evidence.ts` (types only); `execution-projection.ts` (`run`); `work-ledger.ts` (store applied settings keyed by turnRef; map legacy strings); `stadium-client.ts`/`protocol.ts` only if the `settings` event is not already relayed with `turnRef` (verify first); `capability-types.ts` untouched.
- **INVARIANTS:**
  - identity/labels untouched;
  - `run` absent when no current/finishing Play;
  - provider-default never resolved to a catalog name;
  - terminal → not-applicable;
  - `run` changes bump revision.
- **AUTOMATED PROOF:** pure projection tests covering explicit, provider-default, unknown-after-recovery, terminal, applied-for-other-turn ignored, report provenance ignored for active label; Dad renderer byte-identical with/without `run` (reuse `test/q2-10f-4-compact-live-player-strip.test.mjs` fixtures); lifecycle fixture (`test/fixtures/q2-10f-2-lifecycle-trace.mjs`) shows `run` through SSE.
- **HUMAN FIELD PROOF:** none required (no UI). Optional: `/api/status` JSON inspection during a real Play.
- **DEPENDENCIES:** none.
- **ROLLBACK:** remove the optional field; no persisted schema dependency beyond additive Ledger fields.

### Slice 2 — Dev Mode run adjunct (presentation)

- **PURPOSE:** Render `Opus · High` / `Provider default` / `Model unknown` / `Sending…` in Dev Mode strips; last-run history styling.
- **FILES:** `src/public/index.html` (strip render, Dev-gated).
- **INVARIANTS:** Dad identical; label never renamed; idle shows no active label.
- **AUTOMATED PROOF:** DOM tests Dev on/off; mismatch marker.
- **HUMAN FIELD PROOF:** Dev Mode on, run Claude `Opus · High` and a provider-default AntiGravity Play on desktop and phone; toggle Dev off and confirm the strip is unchanged.
- **DEPENDENCIES:** Slice 1.
- **ROLLBACK:** CSS/JS-only.

### Slice 3 — Derived eligibility + read-only Scoreboard projection

- **PURPOSE:** Pure `deriveEligibility()` (all reasons, now/later) and `projectScoreboard(gameId)` exposed at authenticated `GET /api/scoreboard?gameId=` (Dev diagnostics). No routing behaviour change yet.
- **FILES:** new `src/control-plane/scoreboard.ts`; `daemon.ts` route; static observability/control descriptors per adapter (`player-adapters.ts` or `player-control/*` descriptor export).
- **INVARIANTS:** no stored Scoreboard; multiple reasons never collapsed; capacity absent ⇒ unknown, no reason; `onField` read-only.
- **AUTOMATED PROOF:** table tests for each reason and combination; bench vs busy vs unauth vs needs-verification vs conflicted are distinct; descriptor for Codex `stop-play = no`.
- **HUMAN FIELD PROOF:** none (diagnostic).
- **DEPENDENCIES:** Slice 1 (types).
- **ROLLBACK:** remove route + module.

### Slice 4 — Capacity Evidence Store (no parsers)

- **PURPOSE:** Scoped observations, fan-out, expiry-to-unknown, `sideline-recorded` success clearing, `user-provided` add/clear API, persistence with pruning.
- **FILES:** new `src/control-plane/capacity-evidence.ts`; daemon wiring; Scoreboard consumption.
- **INVARIANTS:** `expiresAt` required; expiry never yields available; no instance scope; `inferred` rejected; no `onField` mutation.
- **AUTOMATED PROOF:** expiry/fan-out/model-scope/account-scope tests; success on model A does not clear a model-B block; restart persistence prunes expired entries.
- **HUMAN FIELD PROOF:** Dev: state "Claude out until 3 PM" (user-provided) → Dev detail shows it with "you said"; clear it.
- **DEPENDENCIES:** Slice 3.
- **ROLLBACK:** store is additive; delete file-backed state.

### Slice 5 — Capacity-aware dispatch (routing + MANUAL)

- **PURPOSE:**
  - AUTO excludes `capacity-blocked` from immediate dispatch, with the known-available tie-break;
  - constrained target blocked → Wait / Let Coach choose staging;
  - MANUAL disabled-with-reason options;
  - **Try anyway** override recorded in the Ledger.
- **FILES:** `routing-policy.ts`, `router.ts`, `play-queue.ts` (wait condition), `index.html` (select options, staged copy).
- **INVARIANTS:** Routing Invariant precedence intact; no silent substitution; unknown capacity neutral; override only MANUAL + capacity-only.
- **AUTOMATED PROOF:** extend Q2.10E-B constraint tests with capacity cases; override outcome becomes evidence.
- **HUMAN FIELD PROOF:** with a user-provided block on Claude: "Use Claude" shows the Wait choice; AUTO picks another eligible Player with handoff; MANUAL shows Claude disabled with reason and allows Try anyway.
- **DEPENDENCIES:** Slice 4.
- **ROLLBACK:** feature flag in routing policy.

### Slice 6 — First capacity evidence sources

- **PURPOSE:** Typed provider signals → observations. Order: provider-structured where Probe P1/P2 prove fields exist; then a versioned `local-parsed` classifier for AntiGravity `quota exceeded`-class errors.
- **FILES:** `structured-print.ts` dialect result parsing; `codex-app-server.ts` (only allowlisted methods proven by P1); classifier module with version id.
- **INVARIANTS:** auth/permission failures never classified as capacity; ambiguous text not recorded; parser version in `source`.
- **AUTOMATED PROOF:** fixture frames (`test/fixtures/fake-print-cli.mjs`) for each class; negative corpus.
- **HUMAN FIELD PROOF:** next real limit hit shows `Limit reached` in Dad (when relevant) and class/age in Dev; the block expires to unknown.
- **DEPENDENCIES:** Slice 4; Probes P1/P2 for structured parts.
- **ROLLBACK:** disable individual sources.

### Slice 7 — Hold / Release

- **PURPOSE:** Sideline-owned queue gate per exact instance.
- **FILES:** `play-queue.ts`, `router.ts` route, Dev controls in `index.html`.
- **INVARIANTS:** current turn unaffected; `held` is an eligibility reason (later-eligible); survives daemon restart with queue.
- **AUTOMATED PROOF:** queued Plays not released while held; release drains in order.
- **HUMAN FIELD PROOF:** queue two Plays to Claude 1, Hold, confirm the first finishes and the second waits; Release.
- **DEPENDENCIES:** Slice 3.
- **ROLLBACK:** remove flag; queue unchanged.

### Slice 8 — Stop Play (Claude / AntiGravity)

- **PURPOSE:** Exact `turnRef`-guarded hard stop, capability-gated, with partial-change confirmation.
- **FILES:** daemon route → Stadium RPC → `PlayerControlHost` → `interrupt()`; descriptors; Dev control.
- **INVARIANTS:** stale turnRef refused; Codex/Terminal not offered; outcome from provider event; session ref retained.
- **AUTOMATED PROOF:** fake CLI long turn → stop → `interrupted`; stale turnRef refusal; observe grant rejected (once S2 exists).
- **HUMAN FIELD PROOF:** start a long Claude Play, Stop Play, confirm "Interrupted — may have made partial changes", then send a follow-up Play that resumes the same session.
- **DEPENDENCIES:** Slice 3. Must adopt S2's route-authorization pattern if S2 has landed.
- **ROLLBACK:** remove route; `interrupt()` untouched.

### Slice 9 — Checkpoint (reserved Play)

- **PURPOSE:** `playKind:'checkpoint'` reserved Play template writing to the Game report channel; Ledger distinguishes it; report attribution via provenance.
- **FILES:** `router.ts`, `work-ledger.ts` (`playKind`), template module, Dev control.
- **INVARIANTS:** never interrupts; queues behind current turn; report content Player-authored, never generated from activity.
- **AUTOMATED PROOF:** checkpoint Play recorded with kind; report attributed.
- **HUMAN FIELD PROOF:** Checkpoint a working Claude 1, confirm a checkpoint report arrives in Incoming after the current Play.
- **DEPENDENCIES:** Slice 7 (for Checkpoint-then-Hold composite later); otherwise none.
- **ROLLBACK:** remove template/route.

### Slice 10 — Session continuity grading

- **PURPOSE:** `sessionEpoch` on Plays; `providerSession` proof relayed; `authorship-only` affinity forcing handoff.
- **FILES:** `bindings.ts`/`host.ts` (epoch increments), `stadium-client.ts`/protocol (relay), `work-ledger.ts`, `context-affinity.ts`.
- **INVARIANTS:** existing strong/medium unchanged when continuity holds; affinity never authority.
- **AUTOMATED PROOF:** Start Fresh → prior report owner becomes `authorship-only` → handoff attached even to the same instance.
- **HUMAN FIELD PROOF:** after an AntiGravity replacement conversation, a follow-up on its old report includes the handoff package.
- **DEPENDENCIES:** Slice 1.
- **ROLLBACK:** grading falls back to current behaviour.

### S1 — Activity redactor (Stadium, pure) **[gate]**

- **PURPOSE:** `ActivityRedactor` `uth-v1`: levels L0–L2b, rules §12.B, coalescing, rate caps; produces `ActivityFrame` only.
- **FILES:** new `src/player-control/activity-redactor.ts` (no `vscode` import); test corpus `test/fixtures/redaction-corpus.*`.
- **INVARIANTS:** fail closed; never-permitted content unreachable; deterministic.
- **AUTOMATED PROOF:** corpus with zero leaks; property tests on high-entropy strings; path relativization per OS.
- **HUMAN FIELD PROOF:** none.
- **DEPENDENCIES:** none.
- **ROLLBACK:** unused module.

### S2 — Observe grant authority class **[gate]**

- **PURPOSE:** `POST /api/observe/grant`; grant table; route-authorization separation.
- **FILES:** `daemon.ts` (`isAuthorized` split into `requireControl` / `requireObserve(scope)`).
- **INVARIANTS:** grants cannot call any other route; control token not accepted on activity route; grants die on restart/expiry/removal.
- **AUTOMATED PROOF:** matrix test every existing `/api/*` route × grant → 401/403.
- **HUMAN FIELD PROOF:** none.
- **DEPENDENCIES:** none.
- **ROLLBACK:** remove route (no consumers yet).

### S3 — Demand-driven Stadium forwarder + daemon relay ring + scoped SSE route **[gate]**

- **PURPOSE:** `activity.subscribe/unsubscribe` RPC; `player.activity` notification; relay ring; `GET /api/players/instance/:id/activity`; epoch/seq/gap/backfill; backpressure; secondary verifier.
- **FILES:** `stadium-client.ts`, `player-roster.ts` (`handleControlEvent` tap), `protocol.ts`, `daemon.ts`.
- **INVARIANTS:** no forwarding without subscription; `/api/events` unchanged; conflicted Game refused; `server.ts` untouched.
- **AUTOMATED PROOF:** two-Game, two-instance isolation fixture; reconnect with `after=`; daemon restart backfill from Stadium ring; slow-client drop and gap; log-grep hygiene.
- **HUMAN FIELD PROOF:** none (no UI).
- **DEPENDENCIES:** S1, S2.
- **ROLLBACK:** unsubscribe-all; routes removed.

### S4 — Gate verification pack **[gate]**

- **PURPOSE:** Consolidated ship-gate test suite §12 (1–6) wired into `npm test`.
- **DEPENDENCIES:** S1–S3.

### Slice U — Under the Hood read-only panel

- **PURPOSE:** Dev Mode panel for one exact Player: LIVE/QUIET/DISCONNECTED/NOT AVAILABLE/ENDED; frames by descriptor; "Show command details" (L2b) Dev setting.
- **FILES:** `index.html`; preference field for L2b.
- **INVARIANTS:** visible-only stream; no storage; no control buttons inside the panel; Terminal shows not-available.
- **AUTOMATED PROOF:** DOM + stream lifecycle tests; visibility close/reopen resume.
- **HUMAN FIELD PROOF:**
  1. Phone + desktop: open Under the Hood for Claude 1 during a Play; frames appear; Claude 2 frames never appear.
  2. Lock the phone and return; the view resumes with a gap if needed.
  3. Run a command containing a fake token (`echo Bearer sk-TEST…`); it renders masked.
  4. Terminal Player shows not-available.
- **DEPENDENCIES:** S4, Slice 2.
- **ROLLBACK:** hide panel; server routes inert without grants.

### Recommended order

1 → 2 → 3 → (S1 ∥ S2) → S3 → S4 → U. In parallel after 3: 4 → 5 → 6; 7 → 8 → 9; 10.

### Probes (bounded, read-only or single-turn; run before the slice that needs them)

- **P1 Codex:**
  - Does the certified app-server protocol offer a turn interrupt method, rate-limit/account usage read or notification, token-usage notification, or actual model on turn/thread responses?
  - Method: inspect `codex app-server` generated schema/help for version `CERTIFIED_VERSION` plus one trivial turn, logging method names only.
  - Unblocks: Codex Stop Play, structured capacity, context usage, `run.observed`.
- **P2 Claude:**
  - Does `claude -p --output-format stream-json` emit the executed model in `system/init` or `result` frames, or a structured rate-limit frame/field?
  - Method: one trivial Play with frame keys logged (values redacted).
  - Unblocks: `run.observed`, structured capacity.
- **P3 Mobile path:** how the phone reaches `127.0.0.1:3100` (tunnel, proxy, remote desktop). Read-only config inspection. Refines §12.F. **Not blocking.**

---

## 22. Verification Strategy

- **Pure-first:** Scoreboard, eligibility, capacity expiry, affinity grading, run projection, and the redactor are pure modules with table tests. There is no `vscode` in any of them.
- **Contract tests at seams:**
  - Dad renderer invariance;
  - `/api/events` payload shape unchanged;
  - route × authority matrix;
  - Stop Play turnRef guard.
- **Reuse the live-shaped fixture:** `test/fixtures/q2-10f-2-lifecycle-trace.mjs` (real Control Plane + StadiumClient + `index.html`) for run projection and activity streaming end-to-end.
- **Multi-Game isolation:** a two-Stadium fixture for UTH scoping and conflicted refusal.
- **Negative corpora:** redaction leaks; capacity classifier false positives (auth/permission text); unknown never blocks.
- **Hygiene:** after fixture runs, grep the daemon log, Ledger file, capacity store, and preferences for frame text and secrets from the corpus.
- **Evidence discipline:** automated passes never close human field proof. Each report states both separately, per project convention.

---

## 23. Human Field-Proof Plan (consolidated)

| Slice | Proof (desktop + phone where UI) |
|---|---|
| 2 | Dev shows `Opus · High` while Claude works; provider-default AntiGravity shows `Provider default`; Dev off = unchanged strip |
| 4 | User-provided capacity statement visible in Dev with "you said", clearable |
| 5 | Constrained Claude blocked → Wait / Let Coach choose; MANUAL disabled-with-reason; Try anyway recorded |
| 6 | Real limit → Dad `Limit reached` only when relevant; expires to silence |
| 7 | Hold keeps second queued Play waiting; Release drains |
| 8 | Stop Play interrupts only the current Claude turn with partial-change disclosure; next Play resumes the session |
| 9 | Checkpoint report arrives after current Play |
| 10 | Follow-up after fresh session carries handoff |
| U | Exact-instance live view; no cross-Player frames; masked fake token; phone lock/resume gap; Terminal not-available |

---

## 24. Explicit Non-Goals

- No universal Pause, OS suspend, or cooperative mid-turn stop.
- No Codex Stop via app-server `close()`.
- No machine mutation of `onField`; no auto-bench.
- No fabricated model/effort/capacity/reset/context/token values.
- No context-percentage estimates.
- No durable transcript store in V1.
- No activity on `/api/events`, no `server.ts` activity egress, no new transport technology.
- No raw terminal output capture.
- No auto-generated checkpoint/report text from activity.
- No Dad Mode control buttons in V1.
- No provider-specific quota schemes as core enums.
- No redesign of exact Player identity, Game/Stadium separation, or the Routing Invariant.
- No Usage Sentinel meters UI in this architecture: the Capacity Evidence Store is its data foundation, and meters are a later projection.

---

## 25. Remaining Unknowns

| Unknown | Safe to proceed? | Resolution |
|---|---|---|
| Codex turn interrupt / rate-limit / token-usage / observed model | yes: descriptors default `no`/`unknown` | Probe P1 |
| Claude observed model / structured rate-limit frame | yes: `run.observed` absent, capacity `local-parsed` or unknown | Probe P2 |
| AntiGravity denied-action signal; observed model | yes: omitted kinds | future adapter probe |
| Whether an interrupted provider session is always safe to resume immediately | yes: Stop Play discloses partial changes; the next Play runs normal restore proof | observe in Slice 8 field proof |
| Mobile access path | yes: design assumes an unknown relay | Probe P3 |
| Whether `settings` events are already relayed to the daemon with `turnRef` | yes | first task inside Slice 1 (static check) |
| Terminal exit-code events reaching the daemon | yes: Terminal UTH is not-available in V1 | n/a |
| Human wording preference for capacity-blocked Dad copy | yes: plain default chosen (§14) | Slice 5 field feedback |
| Existing browser page passing the control token in `EventSource` query (`?token=`) | yes: pre-existing, outside this feature; observe grants avoid extending it | flagged for a future hardening Play |

---

## 26. Decisions Frozen By This Architecture

1. The Player Scoreboard is a **derived, multidimensional truth model** keyed by `(gameId, playerInstanceId)`. It has per-dimension owners, no global enum, and is not a UI store.
2. Evidence = **class × freshness**. Precedence is **per question**. Conflicts are kept, never overwritten.
3. **Report provenance proves attribution, not the executed model.**
4. Capability `activeModel/activeEffort` = **sideline-applied** control setting, valid for a turn only when tied to that `turnRef`.
5. Execution detail is `ExecutionView.run` (`requested / sent / applied / observed`). It is never part of a Player name, and the Dad renderer never reads it.
6. `provider-default` never displays a catalog default model; `provider-managed` is reserved; unknown is `Model unknown`.
7. **No Pause.** The verbs are Stop Play (hard, turn, provider-gated, `turnRef`-guarded), Checkpoint (reserved Play), Hold/Release (Sideline queue gate), Reconnect, Start Fresh (human-only), Bench/On Field, Remove.
8. Session preservation is a property, not a verb; **visible history is reported separately as live-only-capped.**
9. Codex Stop Play is unsupported until certified; **never `close()`**.
10. Capacity is **provider/account(/model)-scoped evidence** with mandatory `expiresAt`. **Expiry → unknown, never available.** Unknown does not block.
11. Capacity **never mutates `onField`**. Busy, Bench, Unauthenticated, Needs verification, Session-needs-decision, Held, and Conflicted are distinct eligibility reasons.
12. Eligibility is derived (`now` + `later`) with **all reasons retained**.
13. **Try anyway** is MANUAL-only and capacity-only. **Mark available is forbidden.** User-provided capacity is evidence the human can add and clear.
14. Scheduled Plays store **conditions**, re-evaluate fully at release, and never fire on the clock alone or un-bench.
15. Context affinity is **graded by session continuity** (`sessionEpoch`, session proof). `authorship-only` forces handoff. Affinity never grants authority.
16. Token/context size is shown only from provider-structured evidence; otherwise Unknown.
17. Under the Hood V1 is **read-only, exact-instance, daemon-only, demand-driven**. Redaction happens **in the Stadium before egress**, with a defense-in-depth verifier at the daemon, on a **per-connection scoped SSE route**, never `/api/events`, never `server.ts`.
18. Authority classes: **control** (existing token) and **observe** (short-lived grant bound to one instance and read-only). Observe cannot call any control route; the control token is not accepted on the activity route. **Dev Mode is not authority.**
19. Default content policy: L0 + L1 + redacted assistant text. Command arguments are opt-in (L2b). Env values, tool inputs/outputs, stderr, diffs, and session refs are **never** sent.
20. "LIVE" describes the observation path (stream + Stadium socket + subscription ack + heartbeat), not work state.
21. Activity text is never persisted (Ledger, reports, logs, browser storage).
22. One "Connected" proves only transport/session presence.
23. Dad Mode gains only a conditional plain unavailable reason; no controls in V1.
24. **Slice 1 = Evidence vocabulary + `ExecutionView.run` projection.**

---

## 27. Breadcrumbs

Durable WHY-level decisions were added to `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` under **"Dev Mode Player Intelligence & Control (WILL BE · architecture frozen · not implemented)"**. They cover:
- the multidimensional Scoreboard;
- identity vs execution detail;
- the evidence class × freshness model and per-question precedence;
- affinity vs authority;
- capacity vs busy/bench;
- provider-specific control semantics;
- observation vs control authority;
- exact-instance UTH projection;
- redaction-before-egress;
- the freshness rule;
- the Dad/Dev boundary.

The existing "Provider Capacity as a Routing Dimension" and "Routing Invariant" entries remain authoritative and are referenced, not restated.

REPORT: Opus-Dev-Mode-Player-Intelligence-Control-Architecture.md
TIMESTAMP: 2026-09-15 00:44 MDT (America/Edmonton)
