# Stage 69 — Cross-Project Diagnostic Memory Architecture

**Type:** Architecture / design only. No implementation, no product change, no commit.
**Author:** Claude Opus 5 (principal architect role)
**Date:** 2026-09-10
**Repository:** Gallery-Media-Suite, branch `suite-v1` (LOCAL GIT ONLY)
**Scope:** a cross-project diagnostic contract, a concrete CURATION ENGIINE binding, and brief mappings for Browser Gallery, StreamLoop, and Tampermonkey collectors.

**Grounding read before writing:** `NORTH-STAR.md`, `AI-Assisted Development Operating Manual.md`, `docs/ARCHITECTURE-BREADCRUMBS.md` (IS/WAS/WHY, incl. Stage 63, 65B, 66B, 68B), `docs/CONTRACTS.md` (Ownership; Directory ownership under `%APPDATA%\FloppyDisk` (Stage 63); Atomic JSON; Status schema; Status reading and liveness; Device identity; Activity S17A), `src/FloppyDisk.Suite.Contracts/*`, `src/FloppyDisk.Suite/WorkerDeploymentService.cs`, `src/FloppyDisk.Suite/WorkerClosureIdentity.cs`, `workers/floppy_common.py`, and the newest reports under `Reports/Claude/` and `Reports/Codex/`.

---

# 1. Executive Recommendation

## 1.1 Name

**RUNTIME MEMORY** — protocol identifier **`RM-1`**.

Not "logging". Not "telemetry". Not "observability". The name states the purpose: the system keeps a small, durable, bounded memory of what actually ran, so that neither a human nor an agent has to reconstruct it from source assumptions.

Three kinds of truth, three owners, no overlap:

| Truth | Artifact | Answers |
|---|---|---|
| Design truth | `docs/ARCHITECTURE-BREADCRUMBS.md` (WAS / IS / WHY) | Why the system is shaped this way |
| Intended behaviour | source code + `docs/CONTRACTS.md` | What *should* happen |
| **Runtime truth** | **RUNTIME MEMORY (RM-1)** | **What actually happened, where, under which build** |

## 1.2 The two tiers

**Tier 1 — JOURNAL.** An append-only, per-writer, daily-rotated JSONL history of *meaningful boundary events only*. Cheap at write time: it records facts already in hand and performs one small append. Bounded by day count and byte cap. This is durable history and answers "when did this start being wrong?"

**Tier 2 — SNAPSHOT.** A generated-on-demand statement of current truth: identity, paths (logical **and** resolved physical), running processes with a three-way closure comparison, per-subsystem state, dependency resolution, recent errors, recent events, last-known-good delta. It is allowed to do slightly expensive work (stat, count, read markers, probe a dependency version) precisely because it runs only when asked. It answers "what is true right now, and is the thing I am about to debug even the thing that is running?"

**The exported artifact is the snapshot itself.** `COPY DIAGNOSTICS` puts the rendered snapshot Markdown on the clipboard; `CURRENT.md` on disk is byte-identical to what was copied. There is no third "bundle format" concept. One generator, one document, two destinations.

## 1.3 Decisive recommendation on the repo-local `Diagnostics/` folder

**Yes — every project gets a `Diagnostics/` folder, and it is a hybrid: contract committed, evidence never committed but always locally present.**

The reconciliation that makes this work, and which the usual "git pollution" objection misses:

> **An AI agent reads the working tree, not the git index. A gitignored file is fully readable by the agent and completely invisible to history.**

So:

```text
Diagnostics/
  README.md        [committed]   the agent entry point + SOP + freshness rules
  CONTRACT.md      [committed]   this project's RM-1 binding: events, fields, redaction, retention
  .gitignore       [committed]   ignores local/
  local/           [gitignored]  the machine-owned projection an agent actually reads
```

* **Committed** = machine-independent, durable, reviewable: what the files mean, which one to read first, what is guaranteed redacted, how stale is too stale.
* **Gitignored but present** = machine-specific runtime evidence, projected from the runtime store on demand.
* **Never committed** = raw runtime evidence, in any form, on any branch. If a specific piece of evidence matters permanently, a human quotes the relevant *lines* into a `Reports/` document; that makes it a report, which the Operating Manual already governs (§36: reports are working memory, not permanent architecture).

This preserves exactly the benefit the human wants — a cheap, obvious, bounded place an agent looks *before* crawling the repo — while structurally preventing repository pollution, multi-device merge conflicts, stale committed truth, and accidental secret commits.

## 1.4 The value claim, stated honestly

Of the six historical CURATION ENGIINE bugs cited (MSIX/AppData split, stale deployed closure, Auto Printer retry zombie, WPF binding regression, status read race, single-shell identity), **five would have been visible in the Tier 2 snapshot alone, before any source file was opened** — four of them in a single line each. The sixth (the WPF binding regression) is genuinely invisible to runtime diagnostics: the data was correct and only the view was wrong. That honest limit is stated up front and revisited in §24.

That asymmetry is why **Phase 1 is the snapshot, not the journal** (§21).

---

# 2. Design Principles

Durable rules, written to survive years and to be quotable in review.

1. **Runtime truth is observed, never inferred.** Every field states what was measured. Where measurement is impossible the value is literally `unknown` — never a guess, never a plausible default. (NORTH-STAR §7: unknown is a real state.)
2. **Diagnostics observe; they never act.** No diagnostic path repairs, restarts, migrates, deletes, or reconfigures anything. (NORTH-STAR §11: observation and policy remain separate.)
3. **Diagnostics may never break the product.** Every write sits inside one broad failure boundary, bounded in attempts, incapable of recursion, and invisible to domain outcomes. A diagnostics failure degrades diagnostics only — and says so.
4. **Event-time is cheap; snapshot-time may be expensive.** Event-time writes only facts already in hand. Directory enumeration, hashing, process inspection, and dependency probing happen at snapshot time or never.
5. **Boundaries, not loops.** An event marks a state transition or a decision at a component boundary. Polls, refreshes, scans that found nothing, and unchanged state are never events.
6. **Identity is reused, never invented.** Correlation uses the domain identity that already exists and is already proven (`jobId`, `profileId`, `sessionId`, closure hash). RM-1 introduces no competing identity concept. (Mirrors the S17A `eventId` discipline exactly.)
7. **Bounded by construction.** Every store has a deterministic cap in days, records, and bytes, enforced without a scheduler, daemon, or background service.
8. **Safe to paste by default.** The default artifact is redacted by an allowlist, not a denylist. Anything not explicitly permitted is omitted. There is no "unsafe mode" behind a checkbox.
9. **Counts, hashes, and identities — never payloads.** No URL lists, database dumps, media inventories, or raw response bodies. A count plus a stable hash answers the debugging question at a thousandth of the tokens.
10. **Stable headings and a closed vocabulary.** Section names, event names, severities, and results are a fixed, small, documented set an agent can `grep`. Adding an event name requires a `CONTRACT.md` edit — that friction is deliberate and is what prevents log sprawl.
11. **Stale evidence is worse than no evidence.** Every generated artifact states `generatedAt`, the build that generated it, and its freshness horizon. A reader that cannot establish freshness treats the artifact as unknown, not as current.
12. **Diagnostics complement breadcrumbs; they never duplicate them.** A diagnostic record may cite a breadcrumb tag (`WHY:Stage 65B`). A breadcrumb never cites an individual runtime event. One-way linkage, no duplication, no drift.
13. **The contract is shared; the implementation is native.** Projects share the envelope, vocabulary, redaction rules, and file layout. They do not share a runtime library across C#, Python, browser JS, and Tampermonkey.
14. **Runtime state is machine-private; the repository holds only the contract.** Product code never learns a repository path. Projection into `Diagnostics/local/` is a developer-tool concern, never a product feature.
15. **The human is not the diagnostic test harness.** Diagnostics are validated by automated tests, including replayed fixtures of real historical bugs (§22).

---

# 3. Common Diagnostic Envelope (`RM-1`)

One JSON object per line, UTF-8, no BOM, `\n`-terminated.

## 3.1 Required fields

| Field | Type | Meaning |
|---|---|---|
| `v` | int | Envelope schema version. `1`. |
| `ts` | string | ISO 8601 with **explicit offset**: `2026-09-10T10:42:13.412-06:00`. Local time with offset, matching every existing contract in `docs/CONTRACTS.md`. |
| `proj` | string | Project slug: `curation-engiine`, `browser-gallery`, `streamloop`, `floppydisk`, `collector`. |
| `comp` | string | Component slug within the project: `suite`, `auto-printer`, `heart-watcher`, `sync-v3`, `panel-runtime`, `adapter`. |
| `evt` | string | Event name from the closed taxonomy (§4). |
| `sev` | string | `info` \| `warn` \| `error` \| `critical`. |
| `msg` | string | ≤ 120 chars, factual, no stack traces, no full URLs, no prose flourish. |

## 3.2 Strongly recommended (present whenever knowable)

| Field | Type | Meaning |
|---|---|---|
| `dev` | string | Device identity: 8-char prefix of the stable device UUID. The full UUID appears only in the snapshot header. |
| `build` | string | Runtime identity of the *writer*: `<comp>:<8-char build or closure hash>`. The single most valuable optional field. |
| `res` | string | `ok` \| `skipped` \| `blocked` \| `failed` \| `retrying` \| `waiting` \| `unknown`. |
| `corr` | string | Correlation identity (§5): `job:<jobId>`, `profile:<uuid8>`, `session:<id>`, `run:<iso>`. |

## 3.3 Optional

| Field | Type | Meaning |
|---|---|---|
| `subj` | string | The thing this is about, in the domain's own words: a slot name, a Floppy name, a filename, a panel position. Redaction rules apply. |
| `op` | string | Operation name where finer than `evt`: `execute-print-job`, `adopt-generation`. |
| `ev` | object | Evidence. **Scalars only**, ≤ 10 keys; arrays only of ≤ 8 scalars. No nested objects. |
| `ref` | string | Breadcrumb or contract citation: `WHY:Stage 65B`, `CONTRACTS#status-schema`. Only on policy-defining events. |
| `seq` | int | Monotonic per-process counter; tie-breaks equal timestamps and proves the absence of gaps. |
| `n` | int | Coalesced occurrence count (§6.5). Absent means 1. |
| `until` | string | End of the coalescing window when `n > 1`. |

## 3.4 Hard constraints (testable)

* One serialized line ≤ **512 bytes**. A producer that would exceed it truncates `ev` first, then `msg`, and sets `ev.trunc = true`.
* `ev` values are scalars, or arrays of at most 8 scalars. Nested objects are rejected at write time.
* No field may contain a query string, an `Authorization`-class value, a token-shaped string, or a path outside the redaction rules (§11).
* Readers preserve unknown fields (the rule every existing contract already follows). An unknown `evt` renders as-is and never crashes a reader.
* A malformed line is skipped by every reader; it never aborts a read. (Same discipline as `list_activity_events` / `ActivityReader`.)

## 3.5 Example lines

```jsonl
{"v":1,"ts":"2026-09-10T10:42:13.412-06:00","proj":"curation-engiine","comp":"auto-printer","dev":"9f3c1a77","build":"auto-printer:09b2c1d4","evt":"job.accept","sev":"info","res":"ok","corr":"job:Beautiful-Girls-80-i1wj8h","seq":41,"msg":"Accepted print job","ev":{"sources":6,"slot":"Beautiful-Girls"}}
{"v":1,"ts":"2026-09-10T10:42:19.907-06:00","proj":"curation-engiine","comp":"auto-printer","dev":"9f3c1a77","build":"auto-printer:09b2c1d4","evt":"job.phase","sev":"info","res":"ok","corr":"job:Beautiful-Girls-80-i1wj8h","seq":44,"op":"extraction","msg":"Extraction complete","ev":{"urls":3780,"elapsedMs":6495}}
{"v":1,"ts":"2026-09-10T10:46:11.220-06:00","proj":"curation-engiine","comp":"suite","dev":"9f3c1a77","build":"suite:7d10ffa2","evt":"contract.recovered","sev":"warn","res":"ok","subj":"status/heart-watcher.json","seq":903,"msg":"Status read sharing violation, recovered","ev":{"attempt":2,"errorClass":"io-sharing-violation"},"ref":"WHY:Stage 67B"}
{"v":1,"ts":"2026-09-10T10:50:32.004-06:00","proj":"curation-engiine","comp":"suite","dev":"9f3c1a77","build":"suite:7d10ffa2","evt":"deploy.mismatch","sev":"critical","res":"blocked","subj":"auto-printer","seq":911,"msg":"Running closure predates packaged closure","ev":{"packaged":"91e4bb02","deployed":"91e4bb02","running":"09b2c1d4","pid":12472}}
```

Typical line: 230–330 bytes. A busy CURATION ENGIINE day is realistically 200–600 events ≈ 60–180 KB — an entire day of runtime history readable well inside a normal context window, and the snapshot's own tail (§7) usually makes reading the raw day unnecessary.

---

# 4. Event Taxonomy

Closed vocabulary. `category.verb`, lowercase, exactly two segments. Adding a name is a contract change.

## 4.1 Categories and names

**`proc` — process lifecycle**
`proc.start`, `proc.stop`, `proc.crash`

**`build` — executing identity**
`build.active` (this shell/worker began executing this build), `build.takeover` (single-shell ownership changed hands), `build.mismatch` (two identities disagree where they must agree)

**`deploy` — deployable runtime closures**
`deploy.publish`, `deploy.request`, `deploy.accept` (a worker adopted a refresh), `deploy.mismatch` (source ≠ deployed ≠ running)

**`config` — configuration and intent**
`config.change` (key-level; values redacted per §11), `config.invalid`

**`path` — filesystem contract truth**
`path.materialize`, `path.missing`, `path.redirected`, `path.mismatch` (logical string identical, resolved physical differs — the Stage 63 class)

**`ident` — subject identity**
`ident.change` (active profile, library, device name, session), `ident.ambiguous` (two subjects indistinguishable by display name — the BEAST class)

**`job` — units of work**
`job.accept`, `job.phase`, `job.retry`, `job.complete`, `job.fail`, `job.reject`

**`dep` — external dependencies**
`dep.resolve` (which executable/interpreter is actually being used), `dep.missing`, `dep.version`

**`contract` — persisted-contract health**
`contract.unsupported` (schema version outside the supported set), `contract.corrupt`, `contract.recovered`

**`perm` — capability and permission**
`perm.lost`, `perm.restore`

**`sync` — shared or replicated state**
`sync.adopt`, `sync.publish`, `sync.lease`, `sync.conflict`

**`state` — coarse subsystem transitions**
`state.transition` (emitted only when the coarse state genuinely changed)

**`recover` — self-healing that actually occurred**
`recover.action`

**`diag` — diagnostics about diagnostics**
`diag.degraded` (writes failing; journaling disabled for this process), `diag.capped` (a cap was reached; routine events suppressed, `warn`+ still recorded), `diag.snapshot` (a snapshot was generated)

Thirty-four names total. That ceiling is a feature.

## 4.2 Severity

| Severity | Meaning | Consequence |
|---|---|---|
| `info` | A meaningful boundary was crossed successfully, or a decision was made. | Journal only. |
| `warn` | Something anomalous happened and the system handled it. | Journal; appears in snapshot RECENT ERRORS. |
| `error` | An operation failed. The product still functions. | Journal; snapshot; longer retention (§6.4). |
| `critical` | A contract, identity, or boundary invariant is violated; the product's stated truth cannot be trusted. | Journal; snapshot **VERDICT**; **auto-captures an incident** (§12). |

`critical` is deliberately rare. Its canonical members are `deploy.mismatch`, `path.mismatch`, `ident.ambiguous`, `contract.unsupported`, and `proc.crash`.

## 4.3 Result vocabulary

`ok` · `skipped` · `blocked` · `failed` · `retrying` · `waiting` · `unknown`

`skipped` (a deliberate non-action) and `blocked` (a precondition was not met, and the system correctly declined to guess) are distinct on purpose — the repository's own principles treat "declined to act on ambiguity" as a success, not a failure, and the diagnostic vocabulary must be able to say so.

## 4.4 Explicitly NOT events

Never persisted, in any project:

* UI refresh ticks, binding updates, render passes, the 250 ms WPF cadence
* poll iterations that observed no change (Heart Watcher's steady state)
* directory scans that found nothing
* repeated identical state (`state.transition` where new == previous)
* per-item loops over collections — emit one summary line with counts
* payload dumps: URL lists, file inventories, database rows, raw responses, full stderr
* anything derivable from an already-recorded event plus arithmetic

---

# 5. Correlation Model

Deliberately not distributed tracing. Four levels, each optional, each reusing an identity that already exists.

```text
dev   (device)          which machine observed this
 └─ build  (runtime)    which executing identity produced it
     └─ corr            which flow it belongs to
         └─ subj        which concrete thing it is about
```

## 5.1 Rules

1. **`corr` is a namespaced domain identity**, never a fresh GUID: `job:<jobId>`, `profile:<uuid8>`, `session:<id>`, `run:<runStartedIso>`, `package:<stableFolderName>`.
2. **A correlation identity is minted exactly once**, by the component that first creates durable domain truth, and is then *carried* — never re-derived — by every downstream component. Auto Printer's `jobId` and Heart Watcher's preservation identity already satisfy this.
3. **Cross-process stitching is by shared `corr` value, not parent pointers.** There is no `parentEventId`. Reconstructing a flow is: `grep` the `corr` across the day's per-writer files, sort by `ts`, tie-break by `(comp, seq)`.
4. **Cross-device stitching is by `corr` + `dev`**, and only where a genuinely shared identity already crosses devices (a profile UUID, a Sync V3 generation, a media identity hash). RM-1 never synchronizes diagnostic stores between devices; **two bundles pasted side by side is the supported cross-device workflow**, and it is sufficient.
5. **One `corr` per event.** Where a flow hands off between identities (Print Queue manifest → Auto Printer job), the receiving component emits a single `job.accept` carrying the new `corr` with the predecessor inside `ev.from`. That one hop is the entire handoff record.

## 5.2 The reference flow, stitched

```text
browser collector   corr=slot:Beautiful-Girls            manifest committed
Print Queue         corr=job:Beautiful-Girls-80-i1wj8h   ev.from=slot:Beautiful-Girls
Auto Printer        corr=job:…                           job.accept → job.phase(extraction) → job.complete
Floppy published    corr=job:…                           subj="Beautiful-Girls - 3,780.txt"
Browser Gallery     corr=profile:c7b7xxxx                heart recorded (device replica)
Heart Watcher       corr=profile:c7b7xxxx                job.complete  ev.receipt=<sha8>
```

Six greps, no schema, no tracing backend, and no requirement beyond "each device's own clock offsets are honest".

---

# 6. Tier 1 — Journal Architecture

## 6.1 Storage location and layout

A machine-private runtime store per project. For CURATION ENGIINE:

```text
%APPDATA%\FloppyDisk\diagnostics\
    journal\
        2026-09-10.suite.jsonl
        2026-09-10.auto-printer.jsonl
        2026-09-10.heart-watcher.jsonl
        2026-09-09.suite.jsonl
    incidents\
        2026-09-10T104532-auto-printer-job-fail.md
        2026-09-10T104532-auto-printer-job-fail.json
    snapshot.json
    CURRENT.md
    lkg.json
```

**Non-negotiable implementation constraint for this repository:** `diagnostics`, `diagnostics\journal`, and `diagnostics\incidents` must be added to `SharedContractDirectories.RelativePaths` in the same change that introduces them, so `SharedContractDirectories.Materialize` creates them at the top of `App.OnStartup` before any worker launch. A packaged (Microsoft Store) Python worker that creates one of these directories first captures it permanently inside `%LOCALAPPDATA%\Packages\<family>\LocalCache\Roaming\`, and the Suite reading the real path sees nothing, with no error on either side. **A diagnostics system that silently loses its own evidence to the exact bug it exists to expose would be a self-inflicted embarrassment.** (`docs/CONTRACTS.md`, "Directory ownership under `%APPDATA%\FloppyDisk` (Stage 63)"; `[WHY: Stage 63]` breadcrumb.)

## 6.2 One file per writer per day — the concurrency answer

Several independent processes write concurrently. The codebase has already proved the right primitive (Activity, "Multi-process write safety"): **never give concurrent writers a shared mutable file.**

* The file name is `<date>.<comp>.jsonl` — processes of different components never share a file.
* Two processes of the *same* component are prevented elsewhere (worker singleton, single-shell mutex). If it ever happens anyway, the writer appends its PID (`<date>.<comp>.<pid>.jsonl`); detection is free and the file name itself becomes the evidence.
* Writes are `O_APPEND` of a single ≤512-byte line. No locks, no read-modify-write, no temp-file dance. A partial line from a hard kill is one malformed trailing line, which every reader skips.

**This is deliberately different from Activity's one-file-per-event.** Activity is a curated 500-record customer surface; the journal is a higher-count developer history where one file per event would create tens of thousands of files. Same principle (no shared mutable file), different granularity, and the difference is justified by the record counts — not by preference.

## 6.3 Rotation

By local date, evaluated at write time from the writer's own clock. A process running across midnight simply begins appending to the next day's file. No scheduler, no rotation daemon, no state file.

## 6.4 Retention (deterministic, no background service)

Evaluated **only** on a process's first write and on the first write after a date rollover — never on every append.

| Rule | Default |
|---|---|
| Routine day files retained | **14 days** |
| Day files containing any `error`/`critical` | **60 days** |
| Total journal byte cap | **32 MB**, oldest-first eviction, error-bearing days evicted last |
| Single day file byte cap | **4 MB** → emit one `diag.capped`, suppress `info` for the remainder of that day; `warn`/`error`/`critical` continue |
| Incidents retained | most recent **25**, and **90 days**, whichever is more permissive; never evicted below 5 |

Retention deletes only files RM-1 itself created, under the diagnostics root, matching its own naming pattern. It is structurally incapable of touching domain truth — the same guarantee the Activity retention section already makes about receipts and provenance.

## 6.5 Deduplication and coalescing

Three mechanisms, cheapest first:

1. **Transition suppression.** `state.transition` is emitted only when the coarse state differs from the last emitted one for that component. Cost: one in-memory field.
2. **Window coalescing.** An identical `(comp, evt, res, corr, hash(ev))` within a **60-second** window is held in memory and flushed once with `n` and `until` — on window expiry, on any different event, or at process exit. Retry storms and permission flapping compress to one line without losing the count.
3. **Rate ceiling.** A hard per-process ceiling of **120 events/minute**. On exceed, emit one `diag.capped` carrying the suppressed count and drop `info` for the remainder of that minute. `warn`+ is never dropped.

## 6.6 Failure containment

* The whole write path sits inside one deliberately broad catch that returns `false` and is never checked by a caller — the exact pattern already blessed for `publish_activity_event` and for the same reason.
* **One** retry maximum, immediate, no backoff loop, no queue, no buffer that can grow.
* After **3** consecutive failures in a process, journaling is disabled for that process's lifetime and an in-memory flag is set; the flag surfaces at snapshot time as `diag.degraded`. Diagnostics never journal their own journal failures (recursion guard).
* Journaling never runs on a UI thread and never inside a lock held by a domain operation.

## 6.7 Rendering

Stored once as JSONL. A Markdown day view is **rendered on demand** by the snapshot generator / exporter, never stored twice:

```text
10:42:13  auto-printer        job.accept        ok    job:Beautiful-Girls-80-i1wj8h  sources=6
10:42:19  auto-printer        job.phase         ok    extraction  urls=3780 elapsedMs=6495
10:46:11  suite         WARN  contract.recovered ok   status/heart-watcher.json  attempt=2
10:50:32  suite         CRIT  deploy.mismatch   blocked  auto-printer  running=09b2c1d4 packaged=91e4bb02
```

**Write once (JSONL); render on demand (Markdown); never maintain both on disk.** That resolves the Markdown-vs-JSON-vs-JSONL question decisively: JSONL is the storage format, Markdown is a projection, and JSON (the snapshot) is the one place a structured *document* is genuinely the right shape.

---

# 7. Tier 2 — Current Snapshot Architecture

## 7.1 Generation

* **On demand only** — a user action, a developer-tool invocation, or an incident capture. There is no periodic snapshot writer and no timer.
* One generator pass produces **two artifacts** written atomically (temp file + replace, the existing `AtomicJson` discipline): `snapshot.json` (structured) and `CURRENT.md` (rendered, byte-identical to what `COPY DIAGNOSTICS` places on the clipboard).
* It emits exactly one `diag.snapshot` journal event and changes nothing else.
* Budget: **≤ 1.5 s typical, 5 s hard cap.** Any probe exceeding its individual timeout yields the literal `unknown (timeout)` and the snapshot still completes. Never blocks the UI thread.

## 7.2 Fixed section order (stable headings an agent can `grep`)

1. `## HEADER` — `generatedAt` with offset, project, device name + full UUID, generator build, product build, freshness verdict, redaction mode.
2. `## VERDICT` — 0–6 lines: every automated assertion (§15.3) that currently **fails**, most severe first. If none: `No anomalies detected by automated assertions.` This section exists so the first twenty lines of the paste frequently contain the answer.
3. `## IDENTITY` — product build id + build time, human-test-build flag, shell ownership (owner PID, start time, build hash, takeover count), contract/schema versions per persisted store.
4. `## PATHS` — the path truth table (§14).
5. `## RUNTIME` — one row per deployable component: desired state, observed state, PID, process start time, interpreter, and the **three-way closure comparison** (§13).
6. `## STATE` — per subsystem: queue depths, pending counts, last success (what + when), last error (class + when), plus that subsystem's contract-defined counters. Bounded to roughly two lines per subsystem.
7. `## DEPENDENCIES` — resolved external executables: absolute path, version string, how it was resolved, and whether the path sits under a packaged/redirected container.
8. `## RECENT ERRORS` — the last **10** `warn`+ journal entries, one line each, newest first, with `corr`.
9. `## RECENT EVENTS` — the last **25** journal entries of any severity, one line each.
10. `## LAST KNOWN GOOD` — the LKG record and the delta since (§15).
11. `## REFERENCES` — absolute paths to deeper evidence (journal directory, incidents, receipts, provenance) plus breadcrumb tags relevant to the components named above. **Paths, never contents.**

## 7.3 Observed / Reported / Derived

Every value belongs to exactly one class, and the class is visible in the rendering:

* **Observed** — the generator measured it directly this run (file exists, PID running, marker contents). Rendered plainly.
* **Reported** — another process asserted it; the generator is quoting. Rendered with reporter and age: `running closure 09b2c1d4 (reported by pid 12472, 41s ago)`.
* **Derived** — computed from observed values by a stated rule. Rendered with the rule: `verdict: running-stale (running ≠ packaged)`.

This is not decoration. The MSIX bug was costly precisely because a *reported* string (`%APPDATA%\FloppyDisk\activity`) was read as an *observed* location. RM-1 makes that confusion unrepresentable.

## 7.4 Freshness

`CURRENT.md` states `generatedAt` and a **freshness horizon of 10 minutes** for interactive debugging. Beyond it, the header renders:

```text
FRESHNESS: STALE — generated 3h 12m ago. Regenerate before trusting RUNTIME / STATE.
```

An agent reading a stale snapshot must either regenerate it (the command is named in `Diagnostics/README.md`) or explicitly state that it is reasoning from stale evidence. **The document tells the reader how to judge it; the reader never has to know the rule.**

---

# 8. Diagnostic Bundle (`COPY DIAGNOSTICS`)

## 8.1 What it produces

**Exactly the rendered snapshot** — the same text as `CURRENT.md`. No archive, no zip, no attachments, no second format. One button, one document, one paste.

## 8.2 Size and token budget

| | Target | Hard cap | Behaviour at cap |
|---|---|---|---|
| Rendered snapshot | **≤ 16 KB (~4k tokens)** | **40 KB (~10k tokens)** | Sections truncate in reverse priority order, each with an explicit `… truncated, N more — see <path>` marker |

Priority under truncation, highest first: HEADER, VERDICT, IDENTITY, RUNTIME, PATHS, RECENT ERRORS, DEPENDENCIES, STATE, LAST KNOWN GOOD, RECENT EVENTS, REFERENCES.

**Nothing is ever truncated silently.** A truncation marker naming the on-disk path is itself high-value evidence: it tells the agent exactly which deeper file to open, which is the whole point of the two-tier design.

## 8.3 Levels — rejected, with one exception

Compact / Standard / Deep as user-visible settings are rejected: three settings serving one workflow, and a human should not have to choose an evidence depth while something is broken. Instead:

* **`COPY DIAGNOSTICS`** — the bounded snapshot, to the clipboard. This is the product surface.
* **`SAVE DIAGNOSTICS`** — writes the complete projection (snapshot + rendered journal days + incidents) to a folder and reveals it. This is the escape hatch, and it is a *destination* difference, not a verbosity setting. (NORTH-STAR §23: advanced access is an escape hatch, not the ordinary path.)

## 8.4 Skeleton

```text
CURATION ENGIINE DIAGNOSTICS  (RM-1)
generated 2026-09-10T10:51:04-06:00 · FRESH · device "Studio-PC" 9f3c1a77-… · redaction: default

## VERDICT
CRITICAL  auto-printer: running closure 09b2c1d4 predates packaged 91e4bb02 (pid 12472, up 4h12m)
WARN      status/heart-watcher.json: 2 sharing-violation recoveries in the last hour

## IDENTITY
Suite build 7d10ffa2 · built 2026-09-10T09:58-06:00 · HumanTestBuild=false
Shell owner pid 21884 started 09:59:11 · build 7d10ffa2 · takeovers today: 1
Contracts: status=1 activity=1 progress=1 lifecycle=1 diagnostics=1
…
```

---

# 9. Project `Diagnostics/` Folder

## 9.1 Exact structure

```text
Diagnostics/
  README.md                      [committed]      AI entry point. ~80 lines. The SOP (§20).
  CONTRACT.md                    [committed]      This project's RM-1 binding.
  .gitignore                     [committed]      Contains: local/
  schema/rm-1.event.json         [committed, optional]   JSON Schema for the envelope
  schema/rm-1.snapshot.json      [committed, optional]   JSON Schema for snapshot.json
  local/                         [gitignored, generated, machine-owned]
    CURRENT.md                   [generated]      the rendered snapshot (identical to COPY DIAGNOSTICS)
    snapshot.json                [generated]      structured form
    lkg.json                     [generated]      last-known-good record
    journal/2026-09-10.md        [generated]      rendered day views
    journal/2026-09-10.*.jsonl   [generated]      raw copies, only when SAVE DIAGNOSTICS was used
    incidents/…                  [generated]      copies of incident pairs
    EXPORTED.txt                 [generated]      exporter build, source runtime path, export time
```

| Item | Classification |
|---|---|
| `README.md` | committed · durable · human+AI authored |
| `CONTRACT.md` | committed · durable · human authored, reviewed like any contract |
| `schema/*.json` | committed · optional · durable |
| `.gitignore` | committed · durable |
| `local/**` | generated · gitignored · runtime-owned · machine-specific · ephemeral |
| exported bundles the user saves elsewhere | user-exported · outside the repo entirely |

## 9.2 Answers to the specific questions asked

**Which files are committed?** Only `README.md`, `CONTRACT.md`, `.gitignore`, and the optional schemas. All are machine-independent.

**Which are gitignored?** Everything under `local/`, via a single line. One rule, no per-file exceptions, no `!` re-inclusions — exceptions are how evidence eventually gets committed by accident.

**Which are generated?** Everything under `local/`, by the exporter, deterministically, from the runtime store.

**Which are durable?** The committed ones. `local/` is disposable by definition: deleting it loses nothing, because the runtime store is the authority.

**Which machine writes them?** The machine the projection describes, and only that machine. `local/` is never shared, synced, or copied between devices.

**How are multi-device files separated?** They are not merged — they cannot collide, because `local/` never enters git. `EXPORTED.txt` and the snapshot header both name the device, so a bundle pasted from another device is self-identifying. Cross-device comparison is a human/agent activity on two pasted bundles, not a storage feature.

**How are stale snapshots detected?** `generatedAt` + freshness horizon in the header (§7.4), plus `EXPORTED.txt` recording when the projection itself was produced and from where. `README.md` tells the agent the exact regeneration command.

**Should incident reports live there?** Incidents live in the **runtime store** and are *copied* into `local/incidents/` on export. An incident becomes repository-durable only when a human deliberately quotes it into a `Reports/` document — at which point it is a report, governed by the existing report rules, not a diagnostic file.

**Should formal architecture diagnostics/contracts live there or in `docs/`?** Split by audience and lifetime:
* `docs/CONTRACTS.md` — the machine-state contracts the *product* implements (where diagnostics data lives, what schema it uses, who owns the directory). Diagnostics gets a section there, exactly like Activity and Status did.
* `Diagnostics/CONTRACT.md` — the *diagnostic vocabulary* binding: which events this project emits, which fields, which redaction, which retention. It is the reference an implementer and an agent read.
* `Diagnostics/README.md` — the operating procedure for a reader.

`docs/` stays the home of product contracts. `Diagnostics/` is the reader's front door. The one-line rule: **`docs/` says what the product must do; `Diagnostics/` says how to read what it did.**

**Should runtime evidence ever be committed?** **No.** Not sanitized, not "just this once", not as a test fixture pulled from a live machine. Test fixtures are *authored* (§22), not harvested — authored fixtures are stable, reviewable, secret-free by construction, and do not rot when a real machine changes.

## 9.3 Why the folder earns its place

Without it, an agent's first move on "Auto Printer is stuck" is a repo-wide search costing dozens of tool calls and tens of thousands of tokens. With it, the first move is: open `Diagnostics/README.md` (≈800 tokens), then `Diagnostics/local/CURRENT.md` (≈4k tokens). Two reads, bounded, and the VERDICT section is often the answer. The folder is not storage — it is a **known address**.

---

# 10. Runtime Storage vs Repository Projection — resolved

**Decision: (C) hybrid, with a hard boundary and a single direction of flow.**

```text
   PRODUCT                    RUNTIME STORE                    REPOSITORY
   (C#, Python,          %APPDATA%\FloppyDisk\             Diagnostics/local/
    browser, TM)   ───▶     diagnostics\          ──▶       (projection)
                          (the sole authority)      ▲
                                                    │
                                            tools/diagnostics/
                                            Export-Diagnostics.ps1
                                            (developer tool, read-only)
```

Rules that make this durable:

1. **The runtime store is the only authority.** Everything else is a copy that may be stale and says so.
2. **Product code never writes into the repository, and never learns a repository path.** A shipped application that knows where its source lives is a portability defect and a security surface. This is also why the answer is not (A).
3. **The projection is produced by a developer tool**, not the app: `tools/diagnostics/Export-Diagnostics.ps1` (name illustrative). It is read-only with respect to the runtime store, deterministic, safe to run at any time, and has no product side effects — so an agent may run it itself without approval anxiety.
4. **The projection is one-directional.** Nothing in `Diagnostics/local/` ever flows back into the runtime store. Editing a projected file changes nothing; that is a feature.
5. **The agent may read either.** `README.md` names both: the projection first (cheap, rendered, bounded), the runtime store second (authoritative, raw). If the projection is stale or missing, the agent runs the exporter or reads the runtime store directly.
6. **Browser-resident projects have no filesystem runtime store.** For them the runtime store is IndexedDB or `GM_setValue`, the export is the clipboard or a downloaded file, and `Diagnostics/local/` is populated by the human pasting a saved bundle. Same contract, different transport (§17–19).

Why not (B) alone (runtime only, no repo folder): it loses the known address, which is the single largest token saving in the whole design. Why not (A) alone (repo only): git pollution, multi-device conflicts, secret risk, and product code knowing repo paths. The hybrid keeps the address and discards the liabilities.

---

# 11. Privacy / Redaction Contract

**Default posture: allowlist. If a value's shape is not explicitly permitted for its field, it is omitted.** Redaction is applied at the *producer*, before anything is written — never at render time, and never at paste time. Evidence that was never written cannot leak from a file someone forgot about.

## 11.1 Never recorded, in any mode, at any level

Passwords · authentication cookies · session tokens · bearer/API keys · GitHub PATs · Google OAuth access or refresh tokens · signed-URL query strings · `Authorization`-class header values · credential file contents · private key material · full contents of user documents, media, or databases · clipboard contents · window titles of other applications · email addresses other than an identity the user has explicitly configured as their own.

There is no setting, flag, or "deep mode" that turns any of these on. A category that can be enabled is a category that will eventually appear in a paste.

## 11.2 URL sanitization (the rule that matters most)

A URL is never recorded verbatim. It is reduced to:

```text
<scheme>://<host><path-with-last-segment-kept>  #<sha256(full-url)[0:8]>
```

* **The query string and fragment are dropped entirely, always.** Not filtered by parameter name — dropped. Signature parameters are unpredictably named, and a denylist of parameter names is a guarantee that will eventually fail.
* Path segments longer than 64 chars, or matching a token shape (§11.4), are replaced with `…`.
* The 8-char hash preserves identity: two events referring to the same URL are provably the same URL, and a URL can be matched against a receipt, without the URL itself ever appearing.
* **Counts, never lists.** `ev.urls = 3780`, never 3,780 strings. If a specific URL genuinely must be examined, the snapshot points at the receipt or provenance file that already holds it, on the user's own disk.

## 11.3 Paths

Recorded, because path truth is a primary purpose of this system (§14) — with one transform:

* The user account segment is tokenized: `C:\Users\dmcal\AppData\Roaming\…` → `C:\Users\<user>\AppData\Roaming\…`.
* Every other segment is preserved verbatim, including `\Packages\<family>\LocalCache\Roaming\` — that segment *is* the Stage 63 evidence and must survive redaction.
* Drive letters and UNC hosts are preserved. Google Drive folder names are preserved (they are the user's own organizational vocabulary and are the point of the diagnostic).

## 11.4 Token-shaped-string guard

Any candidate string value is rejected (replaced with `<redacted:shape>`) when it matches a token shape: ≥ 20 chars of unbroken base64/base64url/hex, or a known prefix (`ghp_`, `gho_`, `github_pat_`, `ya29.`, `sk-`, `AIza`, `xoxb-`, `Bearer `, `eyJ` for JWT). This is a *safety net beneath* the allowlist, not a substitute for it — a value that has no business being written is omitted by the allowlist first, and the shape guard only catches producer mistakes.

## 11.5 Field-level allowlist discipline

`CONTRACT.md` per project declares, for each event name, the exact permitted `ev` keys and their types. A producer emitting an undeclared key is a contract violation caught by test (§22), not a runtime judgement call. `subj` is permitted to carry user-visible names (slot names, Floppy names, filenames, panel titles) because these are the user's own words about their own content, they are what the human will recognize in a diagnosis, and they are exactly what the existing Activity contract already displays.

## 11.6 Configuration values

`config.change` records **key names and value classes only**: `{"key":"gallery_dl","from":"unset","to":"path"}` — never the values themselves. Paths are the one exception and follow §11.3. This is sufficient to diagnose "the configuration changed at 10:41 and it broke at 10:42" without ever transporting a setting's contents.

## 11.7 The guarantee we can actually make

`Diagnostics/README.md` states it plainly, and the wording matters because overclaiming here is worse than underclaiming:

> Everything in this artifact was produced by an allowlist: each field is a value a producer was explicitly permitted to record. No credential, token, cookie, signed URL, query string, or document content is recorded by any code path. Paths and user-chosen names (slot, library, filename) **are** recorded, with the account name tokenized. If your slot and library names are themselves sensitive, review before pasting.

That last sentence is the honest limit. We do not promise the artifact is anonymous; we promise it is **secret-free** and that the user's own vocabulary is the only personal content in it.

---

# 12. Failure / Incident Capture

## 12.1 When an incident snapshot is created

Automatically, and only on these:

1. Any `critical` event.
2. Any `job.fail` that is **terminal** (retries exhausted / permanently failed) — never a transient failure that will be retried.
3. An unhandled exception that reaches a top-level handler in any component.
4. A `proc.crash` observed by a supervisor (process gone without a `proc.stop`).

Nothing else. In particular: not warnings, not recovered errors, not first-attempt failures, and not "unusual but handled" states. Those live in the journal, which is what the journal is for.

## 12.2 Dedupe — the anti-spam rule

An incident is written only if no incident with the **same `(comp, evt, errorClass, corr)`** was written in the last **60 minutes**. A suppressed repeat instead increments `repeatCount` inside the existing incident's JSON sidecar and updates its `lastSeenAt` — an in-place counter bump, not a new file.

The Auto Printer retry zombie is the motivating case: one physical job failing every 300 s for hours must produce **one** incident file with `repeatCount: 47`, not 47 files. And that single number is itself the diagnosis — it says "unbounded retry" more clearly than any prose.

## 12.3 Contents

A pair of files sharing a stem: `<localTimestamp>-<comp>-<evt>.md` and `.json`.

* **The full Tier-2 snapshot as of the moment of failure**, captured immediately so that the state that caused it survives (queues drain, files move, processes exit — by the time a human notices, the evidence is usually gone).
* The triggering event's full envelope.
* The last **20** journal entries from the failing component and the last **10** from every other component, both windows ending at the trigger.
* `errorClass` (an enumerated, stable slug — `no-media-urls`, `io-sharing-violation`, `dependency-missing`, `permission-denied`, `contract-unsupported`, `path-redirected`, `timeout`, `unclassified`), a bounded `errorDetail` (**first 2 KB + last 1 KB** of the message/stderr, middle elided with a byte count), and the causal chain (`corr` plus the preceding attempts).
* `nextAction` and `retryAt` when the system decided one — *what the system decided to do next* is often the actual bug.

Hard cap: **64 KB per incident pair.** Stack traces are permitted here (and only here), bounded by the same 2 KB + 1 KB rule.

## 12.4 What an incident must never do

Never block, delay, or alter the failure path. Never retry its own write. Never trigger on its own failure. Incident capture runs strictly *after* the domain outcome is durable, on the same failure-independence principle already established for Activity publication.

---

# 13. Source vs Runtime Identity

This is the section that would have collapsed the stale-worker investigation to one line.

## 13.1 The three identities, and who owns each

| Identity | Meaning | Owner / source |
|---|---|---|
| **Source closure** | The ordered dependency closure hash computed from the packaged/repository files as they exist now | The Suite, via `WorkerClosureIdentity.Compute` |
| **Deployed closure** | The hash recorded in the marker inside the published runtime directory | `.deployed-closure.json` at `%LOCALAPPDATA%\FloppyDisk\workers\<workerId>\` |
| **Running closure** | The hash the live process itself read from its own marker at startup | **Reported by the running process**, never inferred |

The third is the one that is normally missing, and it is the one that matters. `floppy_common._runtime_closure_id(script_path)` already computes exactly this value; the requirement is that each worker **publish it** — in its status record's `detail`, and in its `proc.start` journal event — so the Suite can compare rather than assume.

## 13.2 Minimum evidence set (per deployable component)

```text
component        auto-printer
sourceClosure    91e4bb02…      (observed, computed this snapshot)
deployedClosure  91e4bb02…      (observed, marker mtime 2026-09-10T09:58:31-06:00)
runningClosure   09b2c1d4…      (reported by pid 12472 at proc.start, 4h12m ago)
pid              12472
processStartedAt 2026-09-10T06:38:44-06:00
interpreter      C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_…\python3.13.exe  [packaged]
handshakeVersion 1
verdict          RUNNING-STALE
```

Eight lines. Any agent reads them and says: *the source contains the fix, the deployment contains the fix, the live process predates both — restart the worker before reading another line of code.*

## 13.3 Verdict rules (derived, and the rule is printed)

| Condition | Verdict |
|---|---|
| source == deployed == running | `current` |
| source ≠ deployed | `deploy-stale` — the deployment has not picked up the source |
| source == deployed ≠ running | `running-stale` — **the classic stale-worker case** |
| running unknown, process alive, process start < marker mtime | `running-suspect` — the process predates the deployment |
| running unknown, process alive, process start > marker mtime | `running-probable-current` (explicitly *probable*, never `current`) |
| no process | `not-running` |

`running-probable-current` is deliberately not promoted to `current`. Timestamp ordering is evidence, not proof — and the repository's own status contract already makes exactly this distinction between `Stale` and `Stopped`. RM-1 inherits that discipline rather than inventing a looser one.

## 13.4 The shell's own identity

The same three-way question applies to the WPF shell, and Stage 66B already produced the evidence: `ShellBuildIdentity` (SHA-256 content hash for build equality, `FileTimeUtc` for chronological ordering, PID, and process start time). The snapshot reports the owning shell's build hash, its file time, its PID and start time, whether this process is the owner or a deferring challenger, the takeover count for the session, and — critically — the **HumanTestBuild** flag from assembly metadata. "Which build is the user actually looking at?" must never again require inference.

## 13.5 Dependencies are an identity too

`dep.resolve` records the **absolute resolved path** of every external executable actually used (`gallery-dl.exe`, the Python interpreter), its version string, and the resolution method (configured / PATH / probed). `floppy_common.resolve_gallery_dl` already performs this resolution; the requirement is to publish the result. "Which gallery-dl is running?" and "is this interpreter packaged?" are the same class of question as "which closure is running?" and deserve the same treatment.

---

# 14. Path Truth Contract

## 14.1 The rule

**For every path that is part of a cross-process contract, record the logical form, the resolved physical form, and the observed state — from the perspective of the process that actually uses it.**

Perspective is the entire point. Two processes reporting the same logical string while resolving to different physical directories is precisely the Stage 63 bug, and it is invisible unless both perspectives are recorded.

## 14.2 Compact representation

Structured (`snapshot.json`):

```json
{"id":"activity.events",
 "logical":"%APPDATA%\\FloppyDisk\\activity\\events",
 "resolved":"C:\\Users\\<user>\\AppData\\Roaming\\FloppyDisk\\activity\\events",
 "by":"suite","exists":true,"entries":143,"mtime":"2026-09-10T10:46:02-06:00",
 "redirected":false,"owner":"suite","flags":[]}
```

Rendered (`CURRENT.md`) — one line per path, aligned, greppable:

```text
PATH  activity.events    %APPDATA%\FloppyDisk\activity\events
      suite   → C:\Users\<user>\AppData\Roaming\FloppyDisk\activity\events   exists n=143  10:46:02
      worker  → C:\Users\<user>\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.13_…\LocalCache\Roaming\FloppyDisk\activity\events   exists n=1,204  10:46:11
      ⚠ MISMATCH — same logical path, different physical directories (packaged AppData redirection)
```

Three lines to state a bug that cost days. That single rendering justifies this section.

## 14.3 Fields

| Field | Meaning |
|---|---|
| `id` | Stable contract identifier (`activity.events`, `status`, `print-queue.incoming`, `diagnostics.journal`) |
| `logical` | The path exactly as the contract expresses it, environment variables unexpanded |
| `resolved` | The fully resolved physical path **as this reporter resolves it**, account name tokenized |
| `by` | Which component resolved it (`suite`, `auto-printer`, …) |
| `exists`, `entries`, `mtime` | Observed state (`entries` bounded — report `>5000` rather than counting further) |
| `redirected` | True when `resolved` contains a `\Packages\…\LocalCache\` segment — the mechanical Stage 63 detector |
| `owner` | The contract's declared first-creator (for CURATION ENGIINE: always `suite`, per the Stage 63 invariant) |
| `flags` | `mismatch` · `missing` · `not-owner-created` · `unwritable` |

## 14.4 How mismatch is detected

At snapshot time the generator compares its own resolution against every resolution **reported by a worker in that worker's status record or `proc.start` event**. Divergence emits `path.mismatch` at `critical`, raises a VERDICT line, and captures an incident. Workers therefore report their resolved contract directories once, at startup, at a cost of a few dozen bytes.

## 14.5 Which paths qualify

Only paths that are **cross-process contracts or user-configured roots**: the `%APPDATA%\FloppyDisk` contract directories, Print Queue root, FloppyDisk home, Favorites, Printed Floppies, library roots, the Browser Gallery V3 sync folder, the diagnostics root itself. Not temp files, not per-item paths, not anything inside a loop. Roughly 10–15 rows for CURATION ENGIINE — a bounded table, not a filesystem crawl.

---

# 15. Freshness / Last-Known-Good

## 15.1 Freshness

Three signals, all in the header, all cheap:

1. `generatedAt` with offset, plus rendered age (`generated 41s ago`).
2. A **FRESH / STALE** verdict against the 10-minute horizon (§7.4).
3. Per-value ages wherever a value is *reported* rather than observed (`reported by pid 12472, 41s ago`) — a fresh snapshot quoting a two-hour-old worker report is not fresh evidence about that worker, and must not appear to be.

The reader is never asked to compute an age. The document does it.

## 15.2 Last-known-good

`lkg.json` records the most recent moment at which **every automated assertion passed**:

```json
{"v":1,"at":"2026-09-10T09:58:44-06:00",
 "builds":{"suite":"7d10ffa2","auto-printer":"91e4bb02","heart-watcher":"5c19aa30"},
 "contracts":{"status":1,"activity":1,"progress":1,"diagnostics":1},
 "assertions":"all-pass","assertionSetVersion":3}
```

Written only by the snapshot generator, only when the full assertion set passes, and only when at least one recorded identity differs from the stored record (so it does not churn). Never written by a product code path — LKG is an observation about the system, not a state of it.

## 15.3 The assertion set

Deterministic, boolean, cheap, and each with a stable id. For CURATION ENGIINE:

| Id | Assertion |
|---|---|
| `A1` | Every deployable component's closure verdict is `current` or `not-running` |
| `A2` | No path row carries `mismatch`, `not-owner-created`, or `unwritable` |
| `A3` | Every status file present is `Valid` and `Current`, or the worker is intentionally stopped |
| `A4` | Every declared dependency resolved to an existing executable with a readable version |
| `A5` | Exactly one shell owner exists, and it is the newest known build |
| `A6` | No `critical` event in the last 24 h |
| `A7` | Every persisted contract version is inside the supported set |
| `A8` | Diagnostics itself is not degraded (`diag.degraded` absent this session) |

The VERDICT section is literally "the assertions that are currently false". This is the mechanism that makes diagnostics **machine-verifiable rather than human-interpreted**, which is the Human Test Rule expressed as architecture.

## 15.4 How a historical regression is bounded — the Stage 2 / Stage 5 problem

Stage numbers are the wrong axis; they are a naming convention that will outlive its usefulness. The durable axis is **identity change over time**, which the journal already records:

```text
1. Snapshot → current builds/closures/contract versions.
2. lkg.json → the last time everything passed, and the identities that were current then.
3. grep the journal for build.active / deploy.publish / config.change / ident.change
   between the LKG timestamp and now.
   → the ordered list of identity changes in the regression window, usually 1–5 lines.
4. Only those changed identities need their design history read.
   Look them up in ARCHITECTURE-BREADCRUMBS by the WHY tag the journal event cited.
5. Only now open source code — for one component, one change.
```

This never requires reading Stage 1–5 implementation reports. It requires reading *the identities that actually changed*, which is a set the journal already knows. If numbered stages disappear tomorrow, the mechanism is unaffected: it depends on build hashes and timestamps, and the human-readable `stageTag` (`Stage 65B`) is optional decoration carried in `ref` — useful for citation, never load-bearing.

---

# 16. CURATION ENGIINE Reference Design

## 16.0 Diagnostics is NOT Activity — the boundary that must not blur

`docs/CONTRACTS.md` is explicit: Activity is **curated, customer-facing History**, its `title` is always "explain-to-my-dad" prose, and *"no stack traces, JSON, PIDs, SHA-256 hashes, `provenanceJobId`s, receipt/APPDATA paths, or retry-internals ever appear in a published event."* Live status (`status\<worker>.json`) is a third thing again: what is happening right now, for the customer.

Diagnostics is the fourth surface and the developer's one. It is everything Activity is forbidden to contain.

| Surface | Audience | Vocabulary | Store | Retention |
|---|---|---|---|---|
| Status | customer | 7 states + one sentence | `status\<worker>.json` | current only |
| Activity / History | customer | plain prose, no internals | `activity\events\*.json` | 500 / 30 days |
| Live Activity | customer | right-now only | in-memory | none |
| **Diagnostics (RM-1)** | **developer + AI** | **hashes, PIDs, paths, closures, classes** | **`diagnostics\`** | **14 / 60 days** |

**Do not merge them. Do not add diagnostic fields to Activity.** Relaxing Activity's vocabulary to serve debugging would silently convert a customer feature into a log viewer, and that is a product regression regardless of how convenient it seems.

They join without merging, through identity: an Activity event and a diagnostic event about the same job both carry the `jobId`. An agent can therefore say "the customer saw *this* line at 10:42; the diagnostic record for the same `jobId` shows the retry" without either surface knowing about the other.

## 16.1 Storage

```text
%APPDATA%\FloppyDisk\diagnostics\
    journal\<date>.<comp>.jsonl
    incidents\<stamp>-<comp>-<evt>.{md,json}
    snapshot.json
    CURRENT.md
    lkg.json
```

Components: `suite`, `auto-printer`, `auto-splitter`, `heart-watcher`, `health`, `favorites-backup`, `refresher`, `purgatory`.

Required implementation constraints:

* Add `diagnostics`, `diagnostics\journal`, `diagnostics\incidents` to `SharedContractDirectories.RelativePaths` **in the same change** (Stage 63 invariant, §6.1).
* C# side: a small `DiagnosticJournal` writer plus `DiagnosticSnapshot` generator in `FloppyDisk.Suite.Contracts` alongside `AtomicJson`, `ContractPaths`, `StatusReader`, `ActivityReader`. Path helpers belong in `ContractPaths` with the existing ones.
* Python side: `write_diag_event(...)` in `floppy_common.py`, next to `publish_activity_event`, with the same broad-catch failure independence and the same atomic/append discipline. It reuses `_runtime_closure_id`, `resolve_gallery_dl`, `appdata_dir`, and `sha256_file`, all of which already exist.
* Add a `## Diagnostics (RM-1)` section to `docs/CONTRACTS.md` declaring ownership, schema, retention, and the redaction allowlist — the same treatment Activity received in S17A.

## 16.2 Tier 1 — which CURATION ENGIINE events are journal-worthy

**Suite (`suite`)**

| Event | When | Key evidence |
|---|---|---|
| `proc.start` / `proc.stop` | shell start/exit | build hash, buildTime, HumanTestBuild, pid, entry mode (`window`/`--start-worker`/`--recycle-worker`/`--run-scheduled-health`) |
| `build.active` | build identity established at startup | `sha`, `fileTimeUtc`, `humanTest` |
| `build.takeover` | Stage 66B ownership change | `role` (host/challenger), `hostSha`, `challengerSha`, `outcome`, `waitMs` |
| `path.materialize` | after `SharedContractDirectories.Materialize` | count created, and any row that was already present but `redirected` |
| `path.mismatch` | a worker reports a different resolved path | `id`, `suiteResolved`, `workerResolved`, `comp` — **critical** |
| `deploy.publish` | a closure is published | `workerId`, `closureId`, `files`, `bytes`, `durationMs` |
| `deploy.request` / `deploy.mismatch` | refresh requested; identities disagree | `packaged`, `deployed`, `running`, `pid` |
| `config.change` | Suite writes config/suite.json | changed key names + value classes only (§11.6) |
| `contract.corrupt` / `contract.recovered` | corrupt or unreadable contract file; retry succeeded | `subj`, `attempt`, `errorClass` — the Stage 67B status-read race lands here |
| `contract.unsupported` | status/schema version outside the supported set | `subj`, `found`, `supported` |
| `dep.resolve` | at startup / on config change | `tool`, `path`, `version`, `method`, `packaged` |
| `state.transition` | a worker's coarse state changed as the Suite observes it | `comp`, `from`, `to`, `evidence` (`status`/`process`/`both`) |
| `diag.snapshot` | a snapshot was generated | `reason` (`user`/`incident`/`tool`), `ms`, `bytes` |

**Auto Printer (`auto-printer`)**

| Event | When | Key evidence |
|---|---|---|
| `proc.start` | worker start | `runningClosure`, `pid`, `interpreter`, `packaged`, resolved contract paths |
| `job.accept` | manifest committed and accepted | `jobId` as `corr`, `sources`, `slot`, `route`, `ev.from` = queue identity |
| `job.phase` | phase boundary only (settling → extraction → publish) | `phase`, `urls`, `elapsedMs` |
| `job.retry` | a retry is scheduled | `attempt`, `maxAttempts` (**2**, `ref: WHY:Stage 65B`), `cooldownSec` (300), `retryAt`, `errorClass` |
| `job.complete` | terminal success | `urls`, `floppy` (filename), `durationMs` |
| `job.fail` | terminal failure | `attempt/max`, `errorClass`, `movedTo`, `receipt` — **error**, captures an incident |
| `job.reject` | malformed manifest | `reason` |
| `dep.resolve` | gallery-dl resolution at startup | `path`, `version` |
| `path.*` | resolved contract directories at startup | one row per contract path |

The retry zombie, replayed under this design, is a single line repeated with `n`, plus one incident carrying `repeatCount: 47` and `maxAttempts` visible next to `attempt: 48`. The contradiction is on one screen.

**Heart Watcher (`heart-watcher`)**

| Event | When | Key evidence |
|---|---|---|
| `proc.start` | start | `runningClosure`, `pid`, configured profile id (8-char), sync folder path row |
| `ident.change` | active profile / library association changed | `from`, `to` (uuid8), `libraries` (count) |
| `ident.ambiguous` | two or more visible profiles share a display name | `name`, `uuids` (≤8 prefixes) — **critical** |
| `sync.adopt` | a V3 generation was adopted | `generation`, `profile`, `items` |
| `job.accept`/`job.complete`/`job.fail` | per preservation batch, **not per item** | `actionable`, `alreadyPreserved`, `blocked`, `failed` |
| `state.transition` | idle ↔ working ↔ waiting | coarse only |
| `recover.action` | `SYNC EXISTING HEARTS` sweep ran (Stage 68B) | `trigger` (`control-file`/`cli`), `evaluated`, `recovered`, `blocked`, `skipped` |
| `perm.lost` / `perm.restore` | sync folder unreadable / readable again | `path id`, `errorClass` |

Note the deliberate shape: a 143-item preservation run is **one** `job.complete` with four counters, not 143 events. Per-item truth already lives in receipts and SQLite, and the snapshot's REFERENCES section points there.

**Health / Favorites Backup / Refresher / Purgatory / Auto Splitter**

One `job.accept` + one `job.complete|fail` per run, with the run's own counters; `recover.action` for a promotion or restore; `contract.*` for corrupt metadata. Health publishes a run summary with `pass/suspect/dead` counts — never per-Floppy diagnostic events, exactly mirroring the Activity scope reduction already documented for it.

## 16.3 Tier 2 — what `COPY DIAGNOSTICS` contains

```text
CURATION ENGIINE DIAGNOSTICS  (RM-1 · snapshot schema 1)
generated 2026-09-10T10:51:04-06:00 (41s ago) · FRESH
device "Studio-PC" 9f3c1a77-4b21-4a0e-9b6e-5f2d0c118a33 · Windows 11 26200 · redaction: default

## VERDICT
CRITICAL  auto-printer running closure 09b2c1d4 predates deployed 91e4bb02 (pid 12472, started 06:38:44)
WARN      status/heart-watcher.json — 2 sharing-violation recoveries in the last hour

## IDENTITY
suite            build 7d10ffa2  built 2026-09-10T09:58:12-06:00  HumanTestBuild=false
shell ownership  owner pid 21884 (this process)  started 09:59:11  takeovers this session 1
contracts        status=1 activity=1 progress=1 lifecycle=1 refresh-handshake=1 diagnostics=1

## PATHS
appdata.root      %APPDATA%\FloppyDisk
                  suite → C:\Users\<user>\AppData\Roaming\FloppyDisk  exists
status            …\status              exists n=6    10:50:58
activity.events   …\activity\events     exists n=143  10:46:02
                  auto-printer → C:\Users\<user>\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.13_…\LocalCache\Roaming\FloppyDisk\activity\events  exists n=1204
                  ⚠ MISMATCH — packaged AppData redirection (see WHY:Stage 63)
auto-printer.*    progress|routes|receipts  exists n=0|1|318
print-queue       G:\My Drive\Print Queue\Incoming   exists n=2  (Google Drive)
floppydisk.home   D:\FloppyDisk                      exists
favorites         D:\FloppyDisk\Favorites            exists n=4,102
diagnostics       …\diagnostics                      exists  journal 3 days / 1.1 MB

## RUNTIME
comp            desired  observed  pid    started    source    deployed  running   verdict
auto-printer    enabled  working   12472  06:38:44   91e4bb02  91e4bb02  09b2c1d4  RUNNING-STALE
heart-watcher   enabled  idle      9330   09:59:20   5c19aa30  5c19aa30  5c19aa30  current
auto-splitter   disabled not-running –     –          3ab77c10  3ab77c10  –         not-running
interpreter     C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_…\python3.13.exe  [PACKAGED]

## STATE
auto-printer   queue: 2 waiting, 1 in cooldown (retryAt 10:53:41) · attempt 2/2 on job Beautiful-Girls-80-i1wj8h
               last success 10:42:20 "Beautiful-Girls - 3,780.txt" · last error 10:47:41 no-media-urls
heart-watcher  profile c7b7xxxx "BEAST" · libraries 3 · pending 0 · preserved today 143 · blocked 4
               last success 10:46:02 · last error –
health         last run 2026-09-09T22:00 · pass 812 suspect 3 dead 1
favorites-bkp  available · last cycle 10:30:00 · copied 12 · pending 0

## DEPENDENCIES
gallery-dl   C:\Python314\Scripts\gallery-dl.exe   1.27.4   (configured)     not packaged
python       …\WindowsApps\PythonSoftwareFoundation.Python.3.13_…            PACKAGED  ⚠ redirection applies
google drive G:\My Drive                           present

## RECENT ERRORS  (last 10 warn+)
10:50:32  CRIT  suite         deploy.mismatch     auto-printer  running=09b2c1d4 packaged=91e4bb02
10:47:41  ERR   auto-printer  job.fail            job:Beautiful-Girls-80-i1wj8h  attempt=2/2 errorClass=no-media-urls
10:46:11  WARN  suite         contract.recovered  status/heart-watcher.json  attempt=2  n=2

## RECENT EVENTS  (last 25)
…one line each…

## LAST KNOWN GOOD
all assertions passed 2026-09-10T09:58:44-06:00 (53m ago)
identity changes since: deploy.publish auto-printer 91e4bb02 @09:58:31 · build.takeover suite 7d10ffa2 @09:59:11

## REFERENCES
journal      C:\Users\<user>\AppData\Roaming\FloppyDisk\diagnostics\journal\2026-09-10.*.jsonl
incidents    …\diagnostics\incidents\  (2 today)
receipts     …\auto-printer\receipts\  (318)
breadcrumbs  WHY:Stage 63 (AppData redirection) · WHY:Stage 65B (bounded retries) · WHY:Stage 66B (single shell)
```

Roughly 90 lines, ~5 KB, well under the 16 KB target — and it contains the answer to five of the six historical bugs.

## 16.4 What Python workers expose

At startup (once): `proc.start` carrying `runningClosure` (from `_runtime_closure_id`), `pid`, `processStartedAt`, `interpreter` (`sys.executable`), `packaged` (whether the interpreter path contains `\WindowsApps\` or the process resolves AppData into a `LocalCache` container), and **its own resolved contract paths** for every directory it reads or writes.

Continuously: the boundary events in §16.2 only.

Additionally, each worker adds three keys to its existing `status\<worker>.json` `detail` object — within the existing 4,096-byte cap, and additive to schema 1 so no version bump is required:

```json
"detail": { "closure": "09b2c1d4", "appdataResolved": "C:\\Users\\<user>\\AppData\\Roaming\\FloppyDisk", "diag": 1 }
```

That is the entire mechanism by which the Suite can compare perspectives, and it costs about 120 bytes per worker. `diag: 1` declares "this worker speaks RM-1", so the snapshot can distinguish *"reports nothing"* from *"reports nothing because it is an older generation"* — an `unknown` with a reason instead of an `unknown` with a shrug.

## 16.5 What the WPF shell exposes

* Its own `build.active` at startup and every `build.takeover` negotiation outcome (Stage 66B already computes every field needed).
* `path.materialize` immediately after `SharedContractDirectories.Materialize`, including the `redirected` flag per row.
* The snapshot generator itself, plus the two commands (§16.9).
* Reader-side observations it already makes but currently discards: `StatusReader` outcomes (`NeverRun`/`Invalid`/`UnsupportedSchema`/`Valid`, and `Current`/`Stale`/`Stopped`) become `contract.*` and `state.transition` events **only on change** — never on the 250 ms cadence.

Explicitly **not** exposed: binding state, view-model property values, rendering. The WPF binding regression is outside RM-1's reach; a `PropertyChanged` defect is a view bug whose correct instrument is a unit test on the view-model, not a runtime journal. Say so plainly rather than pretending otherwise (§24).

## 16.6 Auto Printer worked example — the retry zombie under RM-1

```jsonl
{"ts":"10:42:13","evt":"job.accept","corr":"job:BG-80-i1wj8h","res":"ok","ev":{"sources":6,"slot":"Beautiful-Girls"}}
{"ts":"10:42:19","evt":"job.phase","corr":"job:BG-80-i1wj8h","op":"extraction","ev":{"urls":0,"elapsedMs":6495}}
{"ts":"10:42:19","evt":"job.retry","sev":"warn","res":"retrying","corr":"job:BG-80-i1wj8h","ev":{"attempt":1,"maxAttempts":2,"cooldownSec":300,"errorClass":"no-media-urls"},"ref":"WHY:Stage 65B"}
{"ts":"10:47:41","evt":"job.fail","sev":"error","res":"failed","corr":"job:BG-80-i1wj8h","ev":{"attempt":2,"maxAttempts":2,"errorClass":"no-media-urls","movedTo":"Failed\\Beautiful-Girls"}}
```

Four lines, terminal, bounded — the correct behaviour is *provable from the record*. Under the old unbounded behaviour the same record would read `attempt: 48, maxAttempts: 2` with `n=47` coalescing and one incident carrying `repeatCount: 47`: the policy and the reality visibly contradicting each other, which is the fastest possible diagnosis.

## 16.7 Heart Watcher / Sync / Favorites worked example

```text
10:44:58  ident.change    profile c7b7xxxx → 9d21xxxx  libraries=3
10:45:02  ident.ambiguous CRIT  name="BEAST" uuids=[c7b7xxxx,9d21xxxx,41f0xxxx]
10:45:03  sync.adopt      generation=418  profile=9d21xxxx  items=1,204
10:46:02  job.complete    actionable=147 recovered=143 alreadyPreserved=1,057 blocked=4 failed=0
```

The BEAST ambiguity is stated once, at `critical`, with three UUID prefixes — the exact fact that previously required a dedicated investigation. Note also what is absent: no per-item lines, no URLs, no library contents. Four lines describe a 1,204-item reconciliation.

## 16.8 Human Test Build and single-shell ownership

Both are IDENTITY-section facts and both are already computed:

```text
suite  build 7d10ffa2  built 09:58:12  HumanTestBuild=true   ← from assembly metadata
shell  owner pid 21884 (this process) started 09:59:11 · challenger 4120 deferred @10:03:22 (older build a11c9f30)
```

"Am I looking at the build I just made?" and "is an older shell still holding the tray icon?" become two lines the human never has to reason about — which is the North Star applied to the developer as well as the customer.

## 16.9 UX surface (minimal)

Three affordances, no settings, no enable/disable toggle:

1. **`Copy Diagnostics`** — under the existing Advanced/Tools area. Generates and copies. One toast: "Diagnostics copied (5 KB)."
2. **`Save Diagnostics`** — same area. Writes the full projection to a chosen folder and reveals it.
3. **On any error surface**: `[Copy Diagnostics]` next to the message. This is the highest-value placement in the whole design — it captures the state *at the moment the human noticed*, and it replaces "describe what happened from memory" with one click.

Incident capture is fully automatic and has no UI. There is no "enable diagnostics" setting: a diagnostic system that can be off is a diagnostic system that is off exactly when it is needed.

---

# 17. Browser Gallery Mapping

`proj: "browser-gallery"` · components: `shell`, `profile-store`, `sync-v3`, `fsa`, `favorites`.

**Storage.** No filesystem runtime store. The journal is a bounded ring in IndexedDB (`diagnostics` object store, **2,000 records or 14 days**, evicted on write when over cap). The snapshot is generated in memory on demand. `COPY DIAGNOSTICS` writes to the clipboard; `SAVE DIAGNOSTICS` triggers a download of the same text. **Nothing is ever written into a library folder, a Drive folder, or anywhere inside Sync V3** — Browser Gallery Sync V3 is read-only and that boundary is not negotiable for diagnostics either.

**Snapshot-worthy current state.**

```text
## IDENTITY
app build <hash> · schema profileStore=<n> syncV3=<n> · device replica <id> "Windows-Studio"

## PROFILES                        ← the BEAST section
active   9d21xxxx "BEAST"  libraries 3  created 2026-03-11  lastOpened 10:44
         c7b7xxxx "BEAST"  libraries 1  lastOpened 2026-08-02   ⚠ duplicate display name
         41f0xxxx "BEAST"  libraries 0  lastOpened 2026-06-19   ⚠ duplicate display name

## LIBRARIES
lib-a  "Photos"   handle granted   root G:\My Drive\Gallery\Photos   items 12,480  hearts 1,204
lib-b  "Archive"  handle PROMPT    ⚠ permission not granted this session

## SYNC V3
generation adopted 418 @10:45:03 · last publication 10:46:02 (this device)
writer lease: held by replica win-studio until 10:52:00 · mode READ-ONLY (V3 contract)
peer replicas seen: chromebook-a (gen 417, 2026-09-09T21:10)

## COUNTS
hearts 1,204 · tags 88 · hidden 41 · pending merges 0
```

**Journal-worthy events.** `ident.change` (profile/library switch), `ident.ambiguous` (duplicate display names — emitted once per session, at `critical`), `perm.lost`/`perm.restore` (FSA handle permission), `sync.adopt`, `sync.publish`, `sync.lease`, `sync.conflict`, `contract.unsupported` (IndexedDB schema version), `proc.start` (page/session start with build hash).

**Project-specific `ev` keys.** `profile` (uuid8), `library` (id), `generation`, `replica`, `handleState` (`granted`/`prompt`/`denied`), `items`, `hearts`.

**Redaction.** Never record media URLs, file contents, or full item lists. Library *names* and folder *paths* are recorded (the user's own vocabulary, and often the point of the diagnosis). Profile UUIDs appear as 8-char prefixes in events and in full only in the snapshot's PROFILES section — because for this project, identity ambiguity is the recurring bug and the full UUID is the resolution.

---

# 18. StreamLoop Mapping

`proj: "streamloop"` · components: `runtime`, `panel`, `persistence`, `automation`.

**Storage.** Journal in IndexedDB or `localStorage` ring (**1,000 records / 7 days** — StreamLoop's questions are recency-dominated). Snapshot on demand. `COPY DIAGNOSTICS` to clipboard.

**Snapshot-worthy current state.**

```text
## IDENTITY
runtime build <hash> · persistence schema 4 (loaded) · session s-2026-09-10-a started 09:12:44

## POSITIONS
1  content:yt:<id8>   "Morning Set"     assigned 09:14:02 by preset "Studio"   iframe: loaded
2  content:tw:<id8>   "Channel B"       assigned 10:02:18 by user              iframe: loaded
3  (empty)                              cleared  10:31:00 by automation "rotate"
4  content:web:<h8>   "Dashboard"       assigned 09:12:50 by session-restore   iframe: BLOCKED (X-Frame-Options)

## PERSISTENCE
github: repo <owner>/<repo> branch main · last pull 09:12:40 (sha a1b2c3d) · last push 10:31:02 (sha e4f5a6b)
local runtime state differs from persisted: yes (position 3 cleared, not yet pushed)

## HISTORY (last 10 global)
10:31:00  position 3 cleared        automation:rotate
10:02:18  position 2 ← Channel B    user
…
## AUTOMATIONS
rotate  enabled  every 30m  last run 10:31:00  next 11:01:00  failures 0
```

**Journal-worthy events.** `proc.start` (session start with build + persistence schema), `ident.change` (session change), `state.transition` (position assignment/clear — carrying `position`, `contentId`, `by`), `sync.publish`/`sync.adopt` (GitHub push/pull with commit sha), `sync.conflict` (persisted state diverged), `perm.lost` (iframe blocked / WebView permission), `recover.action` (session restore), `contract.unsupported` (persisted schema newer than runtime).

**The decisive field is `by`.** "What action put this content here?" — user, preset, automation, or session-restore — is StreamLoop's characteristic question, and answering it costs one enum per event.

**Bounds.** Global history in the snapshot is capped at 10 entries and per-panel history at 5. Content is identified by a stable id or an 8-char URL hash, never a full URL (§11.2).

---

# 19. Tampermonkey Collector Mapping

`proj: "collector"` · components: `userscript`, `adapter`, `queue`.

**Storage.** The most constrained environment, so the smallest binding: a `GM_setValue` ring of **200 events / 64 KB / 7 days**, whichever binds first. Snapshot generated on demand and exposed through a single `GM_registerMenuCommand("Copy Diagnostics")`. No UI, no panel, no settings.

**Snapshot-worthy current state.**

```text
COLLECTOR DIAGNOSTICS (RM-1)
generated 2026-09-10T10:51:04-06:00 · userscript 3.4.1 (@updateURL host: <host>)
site example.invalid · adapter "gallery-a" v3 · route match: /user/:id/media (pattern #2)
slot "Beautiful-Girls" · items this slot 80 · slots total 6 · items total 3,780
IndexedDB: available (schema 2) · Print Queue handle: granted (G:\My Drive\Print Queue\Incoming)
automation: idle · last extraction 10:41:58 ok  items=80  elapsed 2.1s
pagination: learned (next-selector #3, depth 4/…, last advance 10:41:12)
last error: 10:22:09 permission-denied (Print Queue handle) — restored 10:23:41
```

**Journal-worthy events.** `proc.start` (script injected: version, adapter, route), `ident.change` (active slot changed), `job.accept`/`job.complete`/`job.fail` (an extraction run, with counts only), `perm.lost`/`perm.restore` (handle/IndexedDB availability), `dep.missing` (adapter has no match for this route), `state.transition` (automation session start/stop), `sync.publish` (manifest committed to Print Queue, carrying the slot identity that becomes Auto Printer's `ev.from`).

**The hard rule for this project: counts, never collections.** Thirty thousand collected URLs are represented by the number `30,000`, a slot name, and a manifest path. This is the environment where the temptation to dump is greatest and the cost of dumping is highest.

---

# 20. AI Debugging Protocol

This is the exact content for `Diagnostics/README.md` (trim per project). It is written to be read by an agent, cheaply, first.

---

> ## Diagnostics — read this first
>
> This project records **runtime truth** under the RUNTIME MEMORY protocol (RM-1). Source code says what *should* happen; `docs/ARCHITECTURE-BREADCRUMBS.md` says *why* the design is as it is; these files say **what actually happened**.
>
> ### Where things are
>
> | File | What it is |
> |---|---|
> | `local/CURRENT.md` | Current-truth snapshot, rendered. **Start here.** |
> | `local/snapshot.json` | Same content, structured. |
> | `local/journal/<date>.md` | Rendered day history. |
> | `local/incidents/` | Immutable captures taken at the moment of failure. |
> | `local/lkg.json` | The last time every automated assertion passed. |
> | `CONTRACT.md` | Event names, fields, redaction rules, retention. |
>
> The authoritative runtime store is `%APPDATA%\FloppyDisk\diagnostics\` *(project-specific)*. `local/` is a projection of it and may be stale or absent.
>
> ### Standard operating procedure
>
> 1. **Read `local/CURRENT.md`.** Check the header's freshness line first. If it says STALE or the file is missing, run `tools/diagnostics/Export-Diagnostics.ps1` (read-only, no product side effects, safe to run at any time) or read the runtime store directly.
> 2. **Read the `## VERDICT` section.** These are failing automated assertions. If the reported problem is named there, you likely already have the answer — go to step 5.
> 3. **Check `## RUNTIME` before reading any code.** If a component's verdict is `RUNNING-STALE` or `DEPLOY-STALE`, the code you are about to read is *not the code that ran*. Report that first; do not debug source against stale runtime.
> 4. **Check `## PATHS` for `MISMATCH` / `redirected`.** Identical logical paths with different physical paths mean two processes are using different directories and neither reports an error.
> 5. **Bound the regression window.** Take the timestamp from `local/lkg.json` (or the user's last-known-good time). `grep` the journal between then and now for `build.active`, `deploy.publish`, `config.change`, `ident.change`. That short list is what actually changed.
> 6. **Read design history only for the components that changed**, via the `WHY:` tags cited in those events, in `docs/ARCHITECTURE-BREADCRUMBS.md`.
> 7. **Only now open implementation code**, for those components only.
> 8. If an incident file exists for the failure, read it **instead of** reconstructing state — it captured the state at the moment of failure, which no longer exists.
>
> ### Rules for reading this evidence
>
> - **`unknown` means unknown.** It is never a stand-in for zero, false, or absent. Do not resolve it by guessing; say what evidence would resolve it.
> - **Distinguish observed / reported / derived.** A *reported* value is another process's claim, and its age is printed next to it. A snapshot generated 5 seconds ago may still be quoting a worker report from two hours ago.
> - **Absence of an event is not evidence of absence.** Journals are bounded (see `CONTRACT.md`) and coalesced. Check `diag.capped` / `diag.degraded` before concluding that nothing happened.
> - **Counts, not lists.** If you need the individual items, `## REFERENCES` names the files that hold them. Do not ask the user to paste them.
> - **This artifact is redacted by allowlist.** Do not ask for tokens, cookies, signed URLs, or raw payloads; no code path records them.
> - **Do not ask the user to gather evidence you can generate.** Run the exporter yourself.
>
> ### When diagnostics do not cover it
>
> Some defects are structurally invisible here — view/binding bugs, layout, anything where the data was correct and only the presentation was wrong. Say so explicitly and move to the appropriate instrument (a view-model unit test), rather than hunting for a runtime cause that does not exist.

---

**Token economics.** This README is ~800 tokens. `CURRENT.md` is ~4k. Together they replace what has historically been dozens of tool calls and tens of thousands of tokens of repository archaeology — and, more importantly, they replace *assumptions* with *evidence* at the start of the investigation rather than at message twenty.

---

# 21. Implementation Phases

Explicitly ordered so that **Phase 1 is small, self-contained, requires no worker changes, and is useful the day it lands.**

## Phase 1 — Snapshot only, CURATION ENGIINE, Suite-side (highest leverage)

**Build:** a `DiagnosticSnapshot` generator in `FloppyDisk.Suite.Contracts`; `Copy Diagnostics` and `Save Diagnostics` in the existing Advanced/Tools area; `Diagnostics/README.md`, `Diagnostics/CONTRACT.md`, `.gitignore`; a `## Diagnostics (RM-1)` section in `docs/CONTRACTS.md`.

**Do not build:** the journal, incidents, worker instrumentation, LKG, or any other project.

**Why this first:** every input already exists on disk. Status files, lifecycle files, closure markers, `device.json`, `suite.json`, Activity counts, Print Queue contents, `resolve_gallery_dl`'s answer, `SharedContractDirectories`' paths, `ShellBuildIdentity`, assembly metadata. **Phase 1 is a reader and a renderer — it changes no producer anywhere.** That means near-zero regression risk, no cross-language coordination, and no new persisted contract to get wrong.

**Immediate value:** VERDICT, IDENTITY, PATHS, RUNTIME, DEPENDENCIES. The MSIX split, the stale closure, the shell identity question, and the packaged-interpreter surprise all become visible. RECENT ERRORS / RECENT EVENTS render as `no journal yet (Phase 2)` — an honest empty section, not a fake one.

**Done when:** a fresh `CURRENT.md` on the human's machine names the correct build, the correct owner shell, all contract paths with resolved forms, all worker PIDs with closure comparison, and the resolved gallery-dl — verified against reality by test, not by eyeball.

## Phase 2 — Journal, both languages, a short event list

`DiagnosticJournal` (C#) and `write_diag_event` (Python), the retention rules, and **only these events to begin**: `proc.start`, `proc.stop`, `build.active`, `build.takeover`, `deploy.publish`, `deploy.mismatch`, `path.mismatch`, `config.change`, `dep.resolve`, `job.accept`, `job.retry`, `job.fail`, `contract.corrupt`. Thirteen events. Plus the three `detail` keys workers add to their status records (§16.4), which is what makes `path.mismatch` and the running-closure comparison *provable* rather than inferred.

Wire RECENT ERRORS / RECENT EVENTS into the snapshot. Add the cross-language round-trip test (Python writes, C# reads; C# writes, Python reads) mirroring the existing S3 test discipline.

## Phase 3 — Incidents, LKG, assertions

Automatic incident capture with the 60-minute dedupe; `lkg.json`; the assertion set driving VERDICT; the `[Copy Diagnostics]` button on error surfaces (this is the UX payoff and it needs incidents behind it to be worth pressing).

## Phase 4 — Second project: Browser Gallery

Chosen next because identity ambiguity (the BEAST problem) is its recurring cost and the snapshot alone solves it — the same shape as Phase 1, proving the contract transfers without a shared library.

## Phase 5 — StreamLoop and collectors

Smallest bindings, mostly snapshot-only. By this point the contract has been exercised in three runtimes; if it needs revision, revise it here and version the envelope (`v: 2`), rather than earlier on speculation.

## Explicitly deferred, possibly forever

Deterministic daily summarization; cross-device diagnostic aggregation; any shared runtime library; any HTTP surface; a diagnostics viewer UI. Each is a plausible-sounding addition whose value should be demonstrated by a real, felt need before a line is written. (Operating Manual §6: evidence before infrastructure; §27: do not solve later problems early.)

---

# 22. Tests / Verification

Diagnostics must be machine-verifiable. The human is not the harness.

| # | Test | Asserts |
|---|---|---|
| T1 | **Envelope conformance** | Every producer's output validates against the schema: required fields present, `evt` in the closed set, line ≤ 512 bytes, `ev` scalars only, no nested objects. |
| T2 | **Cross-language round trip** | Python writes journal + status detail; C# reads and renders identically. C# writes; Python reads. Mirrors the existing S3 discipline. |
| T3 | **Redaction, adversarial** | Seed a fixture with a signed URL (`?X-Goog-Signature=…`), a `ghp_` token, a JWT, a cookie header, an OAuth refresh token, an absolute user path. Assert: none appear in journal, snapshot, incident, or clipboard output; the URL survives only as host + hash; the account name is tokenized; the `\Packages\` segment **is** preserved. |
| T4 | **Retention determinism** | Given a synthetic store of 40 days / 60 MB / 200 incidents, retention produces exactly the documented survivors, deletes nothing outside the diagnostics root, and never touches receipts/provenance/Activity. |
| T5 | **Failure independence** | Make the diagnostics directory read-only, missing, and full. Assert: every domain operation completes with identical outcomes; ≤ 1 retry per write; journaling disables after 3 failures; `diag.degraded` surfaces; no exception escapes; no recursion. |
| T6 | **Budget** | The rendered snapshot is ≤ 40 KB in a worst-case fixture (all workers running, max queue, max errors), and every truncation carries a marker with a path. |
| T7 | **Freshness** | A snapshot older than the horizon renders STALE; a snapshot quoting an old worker report prints that report's age. |
| T8 | **Coalescing and rate ceiling** | 500 identical events in 60 s produce one line with `n=500`; a burst past 120/min produces exactly one `diag.capped` and drops no `warn`+. |
| T9 | **Incident dedupe** | 47 identical terminal failures over 4 h produce **one** incident file with `repeatCount: 47`. |
| T10 | **Assertion correctness** | Each assertion (`A1`–`A8`) has a passing and a failing fixture; VERDICT renders exactly the failing ones, most severe first. |
| **T11** | **Golden-bug replay** | The load-bearing test. See below. |

## T11 — Golden-bug replay

Author (never harvest — §9.2) a fixture per historical bug, run the real snapshot generator against it, and assert that the defect is stated in the output within a bounded number of lines:

| Fixture | Must appear |
|---|---|
| `msix-appdata-split` | PATHS row for `activity.events` with two resolutions and `⚠ MISMATCH`; VERDICT line; `redirected=true` |
| `stale-deployed-closure` | RUNTIME verdict `RUNNING-STALE` with all three hashes; VERDICT line |
| `auto-printer-retry-zombie` | STATE showing `attempt 48/2`; one incident with `repeatCount`; VERDICT line |
| `status-read-race` | RECENT ERRORS showing `contract.recovered` with `n≥2`; **no** false `Invalid` in RUNTIME |
| `two-shells` | IDENTITY showing owner + deferring challenger with both build hashes |
| `duplicate-profile-name` (Browser Gallery) | PROFILES listing all three UUIDs with `⚠ duplicate display name` |

This suite is what converts "diagnostics would have helped" from a claim into a regression-protected property. It also prevents the slow decay in which a generator keeps producing output long after that output stopped being true.

---

# 23. Architecture Breadcrumb

Recommended wording for `docs/ARCHITECTURE-BREADCRUMBS.md`, in the established voice.

**IS** *(add to the IS section)*

> - [WHY: Stage 69] Runtime truth is recorded as **RUNTIME MEMORY (RM-1)**, a two-tier diagnostic contract, and is a fourth surface distinct from Status (live customer state), Activity/History (curated customer prose), and Live Activity (right-now customer view). Tier 1 is a bounded, append-only, per-writer daily JSONL **journal** of boundary events — never polls, never loops, never payloads — written from facts already in hand and containerized so no two processes share a mutable file. Tier 2 is an on-demand **snapshot** of current truth (identity, logical *and* resolved physical paths, three-way source/deployed/running closure comparison, per-subsystem state, resolved dependencies, recent errors, last-known-good delta); the rendered snapshot *is* the artifact `COPY DIAGNOSTICS` places on the clipboard. Runtime evidence lives only in the machine-private store under `%APPDATA%\FloppyDisk\diagnostics\` (registered in `SharedContractDirectories.RelativePaths`, per Stage 63); the repository's `Diagnostics/` folder commits only the reader's contract (`README.md`, `CONTRACT.md`, schemas) and projects evidence into a gitignored `local/`. Diagnostics observe and never act, are redacted by allowlist so the default artifact is safe to paste, are bounded in days/records/bytes without any scheduler, and can never block, delay, or alter a domain outcome.

**WAS** *(add to the WAS section)*

> - [WHY: Stage 69] Runtime truth previously existed only as transient state: a live status file, a customer History event, and whatever a human happened to observe before it disappeared. Reconstructing what actually ran meant inspecting processes, AppData, deployment markers, and source by hand, once per investigation, and repeating that reconstruction for every agent and every session.

**WHY** *(the durable rationale, quoted in `Diagnostics/README.md` and in `CONTRACT.md`)*

> **Runtime truth must be inspectable without reconstructing it from source assumptions.** Source code states intent; architecture breadcrumbs state why that intent was chosen; neither can state what actually executed, on which machine, under which build, against which physical directory. Diagnostics record what actually ran, where it ran, what state it observed, and which boundary failed — so that an investigation starts at the first broken boundary instead of re-deriving the environment. The most expensive defects in this system have not been wrong logic; they have been **correct logic running somewhere other than where it was believed to be running**. Diagnostics exist to make that class of defect visible in a single line.

That last sentence is the durable one. It is the difference between "we added logging" and an architectural commitment.

---

# 24. Open Risks / Tradeoffs

Stated critically, because a design report that only advocates is not a design report.

1. **Diagnostics can become a second product.** Every section here is defensible; all of them together are a system with its own schema, retention, tests, and maintenance cost. The mitigation is the phase order (§21) and a standing rule: *no new event name, section, or file without a defect it would have shortened.* If Phase 1 does not visibly reduce debugging effort, stop — do not proceed to Phase 2 on principle.

2. **A generator bug produces confident falsehood.** This is the worst failure mode in the design: fabricated truth is more damaging than no truth, because it is trusted. Mitigations: Observed/Reported/Derived labelling; `unknown` as a real, printed value; T11 golden-bug replay; and the rule that the snapshot never infers what it can measure and never measures what it can quote.

3. **RM-1 cannot see view-layer defects.** The WPF binding regression would not have appeared in any section of this design. Anything where correct data is presented incorrectly is outside the reach of runtime diagnostics. The README says so explicitly (§20) — an agent that hunts for a runtime cause of a view bug has been actively misled by our own tooling.

4. **The journal will attract verbose logging.** The pressure to "just add one more event" is constant and each instance is individually reasonable. The closed vocabulary plus the `CONTRACT.md` edit requirement is the only real defence, and it works only if enforced in review.

5. **The projection will go stale, and stale evidence misleads.** Freshness lines mitigate but do not eliminate this: an agent can still skim past a STALE banner. Accepted risk, minimized by making regeneration a single safe command an agent can run itself.

6. **Redaction creates false confidence.** The allowlist is strong, but `subj` carries user-chosen names and paths carry folder names. For this user's content, slot and library names may themselves be sensitive. The README states the honest limit rather than promising anonymity (§11.7) — under-promising here is the only safe posture.

7. **Cross-project standardization may ossify prematurely.** Three of the four projects are not yet instrumented; the envelope is being designed partly on prediction. Mitigation: `v` is in every record from day one, projects bind independently, and revisions happen at Phase 5 with three runtimes' evidence — not now, and not speculatively.

8. **`%APPDATA%` vs `%LOCALAPPDATA%` is a genuine tradeoff.** Diagnostics are machine-private and non-roaming, which argues for `%LOCALAPPDATA%`. I recommend `%APPDATA%\FloppyDisk\diagnostics\` anyway, because both the unpackaged Suite and packaged Python workers must write there and the Suite must read it — the same class as `activity\events`, with the same Stage 63 protection already implemented and tested. The cost is bounded roaming-profile bytes (32 MB cap). If roaming profile size ever becomes a real constraint, this is the first thing to move — and the move is a path change, not a design change.

9. **Per-writer daily files can proliferate.** Eight components × 14 days = up to 112 small files. This is fine on NTFS and trivially bounded, but it is not free, and a future component explosion would need the cap revisited.

10. **Worker-reported values can lie after the fact.** A worker reports its resolved paths and closure at startup; if something changes underneath it mid-run, the report is stale but still printed. The age annotation exposes this, and `running-probable-current` refuses to overclaim — but a reader who ignores the age can still be fooled.

11. **This design deliberately does not solve cross-device correlation.** Two bundles pasted side by side is the whole answer. If cross-device diagnosis becomes a weekly activity rather than a rare one, that decision deserves revisiting — with evidence, not in advance.

---

# 25. Final Recommendation

**First — Phase 1: the CURATION ENGIINE Tier 2 snapshot, Suite-side only.**
A reader and a renderer over evidence that already exists on disk; `Copy Diagnostics` / `Save Diagnostics`; `Diagnostics/README.md` + `CONTRACT.md` + `.gitignore`; a `## Diagnostics (RM-1)` section in `docs/CONTRACTS.md`. No producer changes anywhere, no new persisted contract, no worker edits, near-zero regression risk. It makes the stale-closure, MSIX-path, packaged-interpreter, and shell-identity classes visible immediately — and it is the smallest thing that would have shortened the most real investigations.

**Second — Phase 2: the journal, both languages, thirteen events**, plus the three `detail` keys workers add to their status records. This converts current truth into *durable* truth and makes the regression window bounded by evidence instead of by memory. Ship it with the cross-language round-trip test and the redaction test from day one.

**Third — Phase 3: incidents, last-known-good, and the assertion set** — with `[Copy Diagnostics]` on error surfaces. This is where the target user experience actually lands: *something broke → Copy Diagnostics → paste*. It requires incidents behind it to be worth pressing, which is why it is third and not first.

Then Browser Gallery (Phase 4), then StreamLoop and collectors (Phase 5), revising the envelope only once three runtimes have exercised it.

**One rule above the phases:** every addition to this system must be justified by a defect it would have shortened. Diagnostics that grow because growth feels responsible become the very archaeology they exist to eliminate.

---

## Status

Architecture only. Nothing implemented, no product code changed, no commit made. `Diagnostics/`, the runtime store, `SharedContractDirectories.RelativePaths`, `docs/CONTRACTS.md`, and `docs/ARCHITECTURE-BREADCRUMBS.md` are **unmodified** — §23 supplies the exact breadcrumb wording to add if and when this design is approved and implemented.

**Recommended next step:** approve or amend Phase 1 scope only. Do not approve Phases 2–5 in the same decision; each should be justified by what Phase 1 actually reveals.
