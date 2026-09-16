REPORT FILE:
Stage-1-RM-1-Diagnostic-Adoption-And-Readiness.md

REPORT TIMESTAMP:
2026-09-10 15:26 MDT

---

# SIDELINE COACH — RM-1 DIAGNOSTIC ADOPTION & READINESS

**Type:** Architecture / readiness only. No implementation, no product change, no commit.
**Role:** Architect / Quarterback (Claude Opus 5)
**Repository:** `C:\Users\dmcal\Documents\GitHub\SidelineCoach`, branch `main`
**Stage classification:** First substantive stage after onboarding.

**Working tree at inspection:** one untracked file, `Project SOP/SOP PROMPTS .md`, present and **preserved unmodified**. Nothing else modified, staged, stashed, or reverted. No commit, no push.

**Grounding read:** `Project SOP/NORTH-STAR.md`, `Project SOP/AI-Assisted Development Operating Manual.md`, `Project SOP/Stage-69-Cross-Project-Diagnostic-Memory-Architecture.md`, `Project SOP/add on for Cross Project Diagnostic.md`, `Project SOP/breadcrumbs.pdf`, `Project SOP/SOP PROMPTS .md`, plus the actual current tree: `src/extension.ts`, `src/server.ts`, `package.json`, `tsconfig.json`, `.vscode/launch.json`, `.vscode/tasks.json`, `.gitignore`, `.vscodeignore`, `README.md`. Cross-project precedent read: `GS3/Diagnostics/CONTRACT.md` and `GS3/Diagnostics/README.md` (StreamLoop's existing native RM-1 binding).

---

## 1. EXECUTIVE VERDICT

**Sideline Coach is ready for a narrow RM-1 Tier 2 implementation — but the first implementation stage should be OUTSIDE the extension, not inside it.**

The governing evidence rule is that a diagnostic field is earned by a real investigation it would have shortened. The first real investigation available to us is the Extension Development Host closing unexpectedly. That failure class occurs *before or during activation*. An in-extension `Copy Diagnostics` command cannot observe a failure that prevents the extension from running — a front door that only exists inside the failing process is useless for exactly the failure being investigated.

Reconstructing today's evidence by hand took roughly a dozen tool calls. Of the load-bearing facts recovered, **six of seven were observable entirely from outside the extension host**, and the seventh — whether activation actually occurred — turns out to be readable from VS Code's own existing logs. Therefore:

* **Stage A (first):** a zero-dependency, read-only **preflight snapshot tool** plus the committed `Diagnostics/` reader front door. It changes no product code, adds no producer, and works when the extension cannot run. This is the RM-1 Phase-1 shape exactly: *a reader and a renderer over evidence that already exists*.
* **Stage B (second):** the in-extension `Coach: Copy Diagnostics` command, which fills in the runtime truths only an activated extension can see, reusing the existing `CoachServer.buildStatus()` owner rather than duplicating it.

**No new instrumentation is required for either stage.** That is a load-bearing finding, established by evidence, and is the reason this adoption stays inside the approved Tier 2 fence.

---

## 2. CURRENT RUNTIME MAP

Sideline Coach is four moving parts: a VS Code extension activation, a localhost HTTP server, a workspace-scoped report scanner, and a terminal dispatcher. Ownership of each relevant truth today:

| Runtime truth | Current owner | Source location | Observable when extension is NOT activated? |
|---|---|---|---|
| Extension manifest identity, version, `main` entry | `package.json` | disk | **Yes** |
| Compiled build artifact | `tsc` via `npm run compile` → `out/**/*.js` | disk | **Yes** |
| Dependency installation state | npm | `node_modules/` | **Yes** |
| Launch intent (dev path + host folder + preLaunchTask) | `.vscode/launch.json`, `.vscode/tasks.json` | disk | **Yes** |
| Whether activation occurred | `extension.ts activate()` | VS Code exthost | **Yes — via VS Code `exthost.log`** (see §3, O12) |
| Whether preLaunchTask ran | VS Code task system | VS Code `tasks.log` | **Yes** |
| Configured port / autoStart / globs / allowlist | `vscode.workspace.getConfiguration('coach')` | settings + manifest defaults | Partially (defaults + settings.json readable) |
| Whether a listener exists on the port | OS TCP table | kernel | **Yes** |
| `isRunning` / server lifecycle state | `CoachServer.isRunning` (`httpServer.listening`) | `src/server.ts:34` | No — inside only |
| Workspace roots / active project | `CoachServer.buildStatus()` | `src/server.ts:217` | No — inside only |
| Open allowlisted terminals + duplicates | `vscode.window.terminals` filtered | `src/server.ts:220`, `:263` | No — inside only |
| Report discovery results | `CoachServer.scanReports()` via `vscode.workspace.findFiles` | `src/server.ts:285` | Approximately (direct fs walk of the target folder) |
| Access token | `context.secrets` key `sidelineCoach.accessToken` | `src/extension.ts:5` | **Must never be recorded at all** |

**The ownership conclusion that constrains the design:** `CoachServer.buildStatus()` already owns the projection of port, active project, workspace roots, terminals, and model switches. Diagnostics must **read that owner**, not build a competing one. Creating a second path to those five facts would be exactly the duplicate-owner anti-pattern the Operating Manual §9 warns about.

---

## 3. CURRENT CRASH BOUNDARY

**No root cause is claimed.** The following separates what was measured from what remains unknown.

### 3.1 OBSERVED (measured on this machine, 2026-09-10 ~15:20 MDT)

| # | Observation |
|---|---|
| **O1** | The git repository `SidelineCoach` has **no `out/` directory**. `package.json` declares `"main": "./out/extension.js"`, which therefore cannot resolve in this copy. |
| **O2** | The repository has **no `node_modules/`**. `npm run compile` (`tsc -p ./`) cannot succeed here, and there is **no global `tsc` on PATH**. Node v24.12.0 and npm 11.6.2 are available. |
| **O3** | `.vscode/launch.json` declares `"preLaunchTask": "npm: compile"`, but `.vscode/tasks.json` defines **only** `npm: watch`. Resolution of `npm: compile` depends entirely on VS Code's npm task auto-detection. |
| **O4** | **Three copies of Sideline Coach exist on this machine.** Only `C:\Users\dmcal\Documents\GitHub\sideline-coach` (which is **not** a git repository) has `node_modules/` and a populated `out/` (built 13:12). The git repo `SidelineCoach` (directory created 13:39) has never been built. `Downloads\sideline-coach-source` is a third, empty copy. |
| **O5** | `src/extension.ts`, `src/server.ts`, `src/public/index.html`, `.vscode/launch.json`, and `package.json` are **byte-identical (SHA-256)** between the git repo and the built sibling. The two copies differ only in build state and git identity. |
| **O6** | A fourth git identity is nested inside the sibling at `sideline-coach\Sideline Coach\`, containing only `README.md` and `.gitattributes` — an empty clone of the GitHub repo living inside the working prototype folder. |
| **O7** | `launch.json` hardcodes `C:\Users\dmcal\Documents\GitHub\GS3` as the host folder. GS3 exists, and contains `Docs REPORT` with 28 `.md`/`.txt` files across `AntiGravity`, `Claude Reports`, `Codex Reports`, `Tests`. |
| **O8** | **`coach.port` default `49152` is exactly the first port of the Windows TCP dynamic/ephemeral range.** `netsh int ipv4 show dynamicport tcp` reports Start Port 49152, 16384 ports (49152–65535). Port ownership is therefore racy by construction: the OS may assign 49152 to any outbound socket. |
| **O9** | No process is currently listening on 49152. Chrome (PID 4324) holds two `SYN_SENT` sockets toward `127.0.0.1:49152` — a stale mobile-UI tab retrying against a server that is not running. |
| **O10** | 18 `Code.exe` processes are running. VS Code 1.136.0. No Sideline Coach VSIX is installed in `~/.vscode/extensions`. |
| **O11** | **Code fact.** `CoachServer.start()` (`src/server.ts:62-75`) registers both `'error'` and `'listening'` with `once`, and `onListening` explicitly removes the error listener. After a successful listen the HTTP server has **no `'error'` listener at all**. A later server-level `'error'` event would be an unhandled `EventEmitter` error → uncaught exception in the extension host. This is an independent, unexercised failure pathway. |
| **O12** | **VS Code's own logs already record activation.** `exthost.log` contains lines of the form `ExtensionService#_doActivateExtension <id>, startup: <bool>, activationEvent: '<event>'`, and per-window `tasks.log` files exist. 13 log files under the current session mention "sideline". Activation truth and preLaunchTask truth are therefore **readable from existing evidence, with no new instrumentation.** |
| **O13** | No `coach.*` keys exist in user `settings.json`; all configuration is currently at manifest defaults. |

### 3.2 UNKNOWN (must not be guessed)

| # | Unknown |
|---|---|
| **U1** | Which directory was supplied as `--extensionDevelopmentPath` at the moment of failure — the git repo (`SidelineCoach`, unbuilt) or the sibling (`sideline-coach`, built). |
| **U2** | Whether the preLaunchTask ran, succeeded, failed, or was skipped. |
| **U3** | Whether `activate()` was ever entered. |
| **U4** | Whether the window closed before or after activation. |
| **U5** | Whether the debug session terminated the window, or the window exited on its own. |
| **U6** | Whether port 49152 was held by another process at the moment of failure. |
| **U7** | The exact error text, if any, VS Code displayed. |

### 3.3 Honest assessment

O1–O4 make a launch-time failure highly plausible **for the git-repo copy**, and O8 and O11 each describe an independent latent defect. But *"the window opened and then closed"* is not fully explained by any single observed fact, and the human reports that closing the existing GS3 instance did not eliminate the behaviour. **Evidence must decide, and the evidence needed (U1–U5) is exactly what O12 says is already sitting in VS Code's logs.** That is the strongest possible argument for building the reader before touching the product.

---

## 4. MINIMUM TIER 2 SNAPSHOT

One structured object, one Markdown renderer, two collectors (`preflight` outside, `extension` inside), fixed and greppable section order. Sections below are the complete V1 set; adding one requires a `CONTRACT.md` change.

### 4.1 Sections and fields

**`## HEADER`** — `generatedAt` (ISO 8601 with explicit offset), rendered age, `FRESH`/`STALE` against a 10-minute horizon, collector (`preflight`|`extension`), collector version, snapshot schema, host name, OS build, VS Code version, redaction mode.
*Earns its place:* freshness is mandatory under RM-1, and with three copies and 18 windows on this machine an artifact that cannot identify which runtime it describes is worse than none.

**`## VERDICT`** — only the assertions currently failing, most severe first; otherwise `No anomalies detected by automated assertions.`
*Earns its place:* this is the section that makes the first twenty lines usually contain the answer.

**`## IDENTITY`** — `extensionDevelopmentPath` (absolute, account tokenized), `isGitRepo` + branch + short HEAD sha, `packageVersion`, `sourceHash` (8-char SHA-256 over sorted `src/**/*.ts`), `builtHash` (over `out/**/*.js`) or `unknown (out/ absent)`, `builtAt`, `dependenciesInstalled`, `buildVerdict` (derived: `built-current` | `built-stale` | `not-built` | `unknown`), `otherCopiesDetected` (count + paths of sibling directories one level up containing a `sideline-coach` package.json).
*Earns its place:* directly O1, O2, O4, O5. `otherCopiesDetected` is the single field that would have saved the most archaeology today, and its cost is one bounded directory scan.

**`## LAUNCH`** — `launchConfigPresent` + configuration name, resolved `extensionDevelopmentPath` arg, host folder target + `hostFolderExists`, `preLaunchTask` name, `preLaunchTaskDefinedInTasksJson`, `npmScriptExists`, `compileFeasible` (derived), and — when readable — `lastActivationSeen` and `lastPreLaunchTaskResult` read from VS Code's `exthost.log` / `tasks.log`.
*Earns its place:* O3, O7, O12, and the direct route to U1–U3. This is the section that would have short-circuited the current investigation.

**`## SERVER`** — `configuredPort`, `portInOsEphemeralRange` (boolean + the measured range), `bindAddress` (127.0.0.1), `autoStart`, `listenerPresent` (observed from the OS TCP table) + owning PID where resolvable, `listenerIsThisExtension` (`unknown` under the preflight collector — stated honestly).
*Earns its place:* O8 is a standing latent defect that will otherwise be rediscovered indefinitely; O9 shows the listener question is already live.

**`## WORKSPACE`** — workspace folders (names + tokenized paths), workspace file or none. Under the preflight collector this renders the *intended* host folder from `launch.json`, explicitly labelled as intent (Derived), never as an observation.
*Earns its place:* report discovery is workspace-scoped (`vscode.workspace.findFiles`), so "no workspace" silently produces "no reports".

**`## PLAYERS`** — resolved `terminalAllowlist`, open allowlisted terminal names, duplicate-name detection. Preflight renders `unknown (requires activated extension)`.
*Earns its place:* the dispatcher's only two real failure modes are 404 *not open* (`src/server.ts:264`) and 409 *duplicate name* (`:268`). Two fields make both answerable at a glance.

**`## REPORTS`** — resolved `reportGlobs`, matched file **count**, newest report filename + mtime + agent badge. **Never any report content.**
*Earns its place:* "why does my phone show no reports" is the other guaranteed recurring question. Counts and one filename answer it; content would violate the paste-safety contract.

**`## REFERENCES`** — absolute paths only (launch.json, settings, `out/`, VS Code log session directory). Paths, never contents.

### 4.2 Assertion set (drives VERDICT)

| Id | Assertion |
|---|---|
| A1 | Build present and not older than newest source (`buildVerdict` is `built-current`) |
| A2 | Dependencies installed, or compile otherwise demonstrably feasible |
| A3 | `preLaunchTask` resolves to a definition that exists |
| A4 | Launch host folder target exists |
| A5 | Exactly one Sideline Coach copy under the parent of the extension development path |
| A6 | Configured port lies outside the OS ephemeral range |
| A7 | *(extension collector)* Activation completed, and listener state matches `autoStart` intent |
| A8 | Report globs resolve to at least one file in the target workspace |

Each assertion traces to an observed fact above. None is speculative.

### 4.3 Deliberately excluded

Report contents; prompt text; dispatched text; terminal buffers; the access token; full environment variables; the installed-extension list; process/CPU/memory telemetry; arbitrary URLs. **`coach.publicUrl` is recorded only as `set`/`unset` plus scheme** — it is a remote-access hostname and is treated as sensitive, never printed.

---

## 5. IDENTITY MODEL

**Four identities, all of which already exist. None is invented.**

1. **COPY** — `extensionDevelopmentPath`: which directory on disk is being run as the extension. (Earned by O4: three copies exist.)
2. **BUILD** — `sourceHash` / `builtHash` / `builtAt`. This is RM-1's three-way source/deployed/running comparison, honestly reduced to the two terms observable outside the process; the third term, `runningHash`, is reserved for the Stage B collector and renders `unknown` until then.
3. **WORKSPACE** — the host folder actually opened (or, in preflight, the folder `launch.json` intends to open).
4. **SERVER** — the tuple `(bindAddress, configuredPort, listenerPid)`.

**Explicitly not created:** no Coach instance GUID, no window identifier, no device UUID (host name suffices), no session identity. Six identities were available; four are earned.

**The multi-window trap today's design must avoid.** A single fixed `coach.port` cannot serve N VS Code windows: the first window to activate wins the port, and every subsequent window fails with `EADDRINUSE`, degraded to an error toast (`src/extension.ts:62`). The diagnostic must therefore **always render SERVER as that tuple rather than a bare `running: yes`**, so a future multi-window or broker design is describable in the existing vocabulary without inventing a new identity concept. This protects the door. It authorizes no broker, no port negotiation, and no multi-window work now.

---

## 6. STORAGE / FRONT DOOR

Matching the existing StreamLoop/GS3 binding exactly, so the two projects stay readable by the same agent:

**Committed to the repository (machine-independent, durable):**

```text
Diagnostics/
  README.md      reader SOP and entry point
  CONTRACT.md    Sideline Coach's RM-1 binding: sections, fields, redaction, freshness
  .gitignore     one line: local/
```

**Never committed:** everything under `Diagnostics/local/`, which is a disposable projection.

**Generation, Stage A:** `tools/diagnostics/snapshot.mjs` — plain Node, **zero dependencies**. The zero-dependency constraint is not stylistic: `node_modules` being absent is one of the conditions the tool must be able to report on (O2), so it must not require `node_modules` to run. Read-only. Writes `Diagnostics/local/CURRENT.md` and prints the identical Markdown to stdout, so the human can copy from the terminal or the file. Invoked as `node tools/diagnostics/snapshot.mjs`.

**Generation, Stage B:** a `Coach: Copy Diagnostics` command feeding the same renderer to the clipboard. This matches the extension's existing clipboard-command precedent (`coach.copyLatestReport`, `coach.copyMobileUrl`) and needs no storage at all.

**One generator model → one renderer → two collectors → two destinations. No third format, no bundle, no archive.**

**A boundary that must be stated as a rule:** the extension must **never** write diagnostics into the host workspace. The workspace is somebody else's repository (GS3 today, any project tomorrow), and writing there would pollute a project Coach does not own. If extension-side persistence is ever needed, it belongs in `context.globalStorageUri`, which is machine-private and outside every repository. Stage B needs no persistence whatsoever.

---

## 7. SECURITY / PRIVACY

**Allowlist, applied at the producer, before anything is written or rendered.** A value whose shape is not explicitly permitted for its field is omitted. There is no deep mode and no unsafe toggle.

**Never recorded, at any level:** the access token in `context.secrets` (`sidelineCoach.accessToken`); `coach.publicUrl`'s host (recorded only as `set`/`unset` + scheme); report file contents; prompt or dispatched text; terminal buffer contents; `Authorization` headers; cookies; signed URL query strings; environment variables; clipboard contents.

**Paths:** recorded, because path truth is a primary purpose here (O1, O4, O7), with the account segment tokenized — `C:\Users\dmcal\...` → `C:\Users\<user>\...`. Every other segment is preserved verbatim.

**Token-shape guard** as a net beneath the allowlist: any candidate string of ≥20 unbroken base64/base64url/hex characters, or bearing a known prefix (`ghp_`, `github_pat_`, `ya29.`, `sk-`, `AIza`, `xoxb-`, `Bearer `, `eyJ`), is replaced with `<redacted:shape>`.

**Budget:** 16 KB target, 40 KB hard cap, truncation never silent — each truncation carries a marker naming the on-disk path.

**The honest limit, to be stated in `README.md`:** the artifact is *secret-free*, not anonymous. Workspace names, folder paths, report filenames, and terminal names are the user's own vocabulary and are recorded deliberately, because they are what makes the diagnosis legible. If those names are themselves sensitive, review before pasting.

---

## 8. OWNERSHIP

| Responsibility | Owner | New or existing |
|---|---|---|
| Outside-process truth collection | `tools/diagnostics/collect-preflight.mjs` | New (developer tool, not product code) |
| Inside-process truth collection | thin adapter over existing `CoachServer.buildStatus()` | Existing owner reused |
| Rendering | single shared `render-snapshot.mjs` | New, one owner for both collectors |
| Redaction | producer-side allowlist inside each collector | New, never at render time |
| Verdict / assertions | one pure-function `assertions.mjs` over the structured snapshot | New |
| VS Code command surface | `src/extension.ts` `registerCommand`, alongside the existing four | Existing owner |
| Configuration resolution | existing `getReportGlobs()` / `getTerminalAllowlist()` / `getModelSwitches()` / `port` getters | Existing owners, read only |
| Identity derivation | the collectors | New, no persisted identity created |
| Storage | `Diagnostics/local/` only; never the host workspace | New, bounded |

**No truth already owned by `CoachServer` is re-derived.** Where the extension collector needs port, workspace roots, or terminals, it calls the existing projection.

---

## 9. IMPLEMENTATION PLAN

**Gate 0 — baseline (first act of the implementation play, not this one).** Run `npm install` in the repository, then `npm run check`, then `npm run compile`; record all three results and whether `out/` is produced. See §10.1 for why this was deliberately *not* done during this architecture play.

**Stage A — preflight snapshot + reader front door.** Build `tools/diagnostics/` (collector, renderer, assertions) and commit `Diagnostics/README.md`, `Diagnostics/CONTRACT.md`, `Diagnostics/.gitignore`. **No product code is touched — `src/` is not modified at all.** Near-zero regression risk by construction.
*Done when:* running the tool on this machine correctly reports `not-built`, dependencies absent, three copies detected, host folder present, port inside the ephemeral range, and report count for GS3 — each verified by automated test against fixtures, not by eyeball.

**Stage B — `Coach: Copy Diagnostics`.** Add the command and the extension collector; fill `IDENTITY.runningHash`, `WORKSPACE`, `PLAYERS`, and `SERVER.listenerIsThisExtension` from inside; reuse `buildStatus()`.
*Done when:* the command produces an artifact byte-identical in structure to the preflight one, with the previously-`unknown` fields resolved, and the token-exclusion test passes with a real secret stored.

**Explicitly deferred, requiring separate evidence and approval:** Tier 1 Journal, Incidents, Last-Known-Good, schedulers, daemons, background polling, telemetry, automatic repair, cross-project aggregation, the multi-window broker, port negotiation, tunnels, and push notifications.

**On the instrumentation question (prompt §5).** The one truth not observable from outside is *how far `activate()` got before the host died*. The tempting answer is an activation marker written at the top of `activate()` — but that is Tier-1-shaped and would be a quiet expansion of RM-1, so it is **not proposed**. The cheaper and RM-1-correct answer is that this truth **already exists**: VS Code writes `ExtensionService#_doActivateExtension` lines to `exthost.log` and task results to `tasks.log` (O12). Stage A therefore *reads* that evidence rather than creating new evidence. Instrumentation should be revisited only if Stage A proves log reading unreliable — and then as a separately approved stage.

---

## 10. AUTOMATED PROOF

Tests use Node's built-in `node:test` runner — **no new dependency**, consistent with the zero-dependency constraint on the tool itself.

**Stage A gate:**

| # | Test | Asserts |
|---|---|---|
| T1 | Schema / stable headings | The rendered artifact contains exactly the nine fixed section headings, in the contracted order. |
| T2 | Redaction, adversarial | A fixture carrying a `ghp_`-shaped value, a JWT, a `coach.publicUrl`, and a report file containing a token-shaped string produces output containing none of them; `C:\Users\dmcal` is tokenized; `\Packages\`-style segments survive. |
| T3 | UNKNOWN behaviour | With `out/` absent, `builtHash` renders literally `unknown (out/ absent)` — never `0`, `false`, `""`, or an omitted line. |
| T4 | Safe failure | Missing `launch.json`, missing `tasks.json`, unreadable directories, and an absent log root each still produce a complete artifact with `unknown` sections, exit code 0, and no thrown exception. |
| T5 | Freshness | `generatedAt` carries an explicit offset; an artifact past the 10-minute horizon renders `STALE`. |
| T6 | Verdict determinism | Each assertion A1–A8 has a passing and a failing fixture; VERDICT lists exactly the failing ones, most severe first. |
| T7 | **No-mutation** | A fixture tree is hashed before and after a run; the hashes are identical, and no write occurs outside `Diagnostics/local/`. This is the machine proof of *diagnostics observe, they never act*. |
| T8 | Budget | A worst-case fixture renders ≤ 40 KB, and any truncation carries a marker naming a path. |

**Stage B gate adds:**

| # | Test | Asserts |
|---|---|---|
| T9 | Single owner | The extension collector's port / workspace / terminal values derive from `buildStatus()`; a unit test fails if a second derivation path is introduced. |
| T10 | Token exclusion under real conditions | With an access token actually stored in `context.secrets`, the generated artifact does not contain it in any form. |
| T11 | No product mutation | Generating a snapshot does not start, stop, or reconfigure the server, and does not send text to any terminal. |

---

## 11. STOP CONDITIONS

Implementation must stop and report, rather than improvise, if:

1. The preflight collector cannot answer the O1/O2/O4-class questions without importing VS Code APIs — the two-collector split would then be the wrong architecture.
2. Reading `exthost.log` / `tasks.log` proves unreliable or the mapping from window directory to workspace cannot be established — activation truth would then require instrumentation, which is **not** in this fence and needs separate approval.
3. Stage A cannot remain a pure reader — i.e. making the snapshot observable requires changing `src/`.
4. Any diagnostic read is found to mutate product behaviour (T7 or T11 failing).
5. The artifact cannot stay under the 40 KB cap without dropping a load-bearing section — the contract needs revision, not silent truncation.
6. The separate crash investigation shows the failure lies entirely inside the debug adapter or window lifecycle, and none of the nine sections would have shortened it — the fields must then be re-earned rather than retained on principle.

---

## 12. BREADCRUMB IMPACT

**YES.**

Adopting RM-1 establishes durable architectural truth that does not exist anywhere in this project today: a runtime-truth boundary, a committed reader contract, an identity model, and one non-negotiable rule — *Sideline Coach never writes diagnostics into the host workspace*.

**Owner problem, stated plainly:** Sideline Coach currently has **no** breadcrumb or anchor document. There is no `Docs ANCHOR/`, no `ARCHITECTURE-BREADCRUMBS.md`, and no contracts document. GS3 uses `Docs ANCHOR/` for this purpose. **Proposed owner:** create `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` at Stage A, with `Diagnostics/CONTRACT.md` owning the diagnostic-vocabulary specifics.

**Proposed breadcrumb, for the approval gate — not written during this play:**

> **IS** — [WHY: Stage 1] Sideline Coach records runtime truth under RUNTIME MEMORY (RM-1) as a Tier 2 on-demand snapshot only; Journal, Incidents, and Last-Known-Good are not implemented. Two collectors feed one renderer: a zero-dependency preflight tool that observes build, launch, port, and copy identity from outside the extension host, and an in-extension command that observes activation-time truth from inside by reusing `CoachServer.buildStatus()`. The preflight collector exists because Sideline Coach's characteristic failure is a launch or activation failure, which an in-process diagnostic structurally cannot observe. Activation truth is *read* from VS Code's own `exthost.log` and `tasks.log` rather than produced by new instrumentation. The repository commits only `Diagnostics/README.md`, `CONTRACT.md`, and `.gitignore`; runtime evidence lives in gitignored `Diagnostics/local/` and is never committed. Diagnostics observe and never act, are redacted by allowlist, and never write into the host workspace — that workspace belongs to another project.

> **WAS** — [WHY: Stage 1] Runtime truth previously existed only as transient state and human memory. Establishing which copy of the extension was built, which was launched, whether activation occurred, and whether the port was available required manual archaeology across multiple directories, the OS TCP table, and VS Code's logs, repeated once per investigation.

> **WHY** — The most expensive defects in this system are not wrong logic; they are correct logic running somewhere other than where it was believed to be running. Three copies of this extension exist on one machine, only one of which is built, and the default port sits inside the OS ephemeral range. Diagnostics exist to make that class of defect visible in a single line.

---

## 13. DIAGNOSTIC IMPACT

**YES** — necessarily, since this stage defines the diagnostic system itself.

Beyond that, the stage names truths the snapshot must expose: a path contract (`Diagnostics/local/`), an external dependency (the Node runtime and the absence of `node_modules`), a deployment boundary (source versus built artifact across multiple copies), and an identity concept (copy / build / workspace / server). Each is represented in §4, and each carries a corresponding assertion in §4.2.

---

## 14. KNOWN UNKNOWNS

1. **U1–U7 from §3.2** remain open. They are the input to the separate crash-investigation play, not to this one.
2. Whether `npm: compile` actually resolves via VS Code's npm auto-detection on this machine — configuration-dependent and not directly measurable from disk.
3. Whether the human's failing launch used `SidelineCoach` or `sideline-coach`. This is the single most valuable unknown, and O12 suggests it is recoverable from logs.
4. Whether VS Code log retention will still hold the failing session by the time the crash play runs. Log sessions rotate; today's sessions contain only `cli.log`, while window and exthost logs live under the long-running session started 2026-09-09.
5. Reliability of mapping a numbered window log directory to a specific workspace — bounded, but unproven.
6. Whether Coach will ever run on a machine other than this one; the preflight collector's Windows-specific probes (`netsh`, TCP table) would need a portability seam if so. Not built now.
7. Whether O11's missing post-listen `'error'` handler has ever actually fired. It is a code fact, not an observed failure.

---

## 15. EXACT NEXT PLAY

**Recommended assignment for the Human + Strategy AI to approve.**

```text
TASK:            Stage A — RM-1 Tier 2 preflight snapshot + Diagnostics/ reader front door
RECOMMENDED AGENT: Codex
REASONING:       Medium
TASK DIFFICULTY: Medium
WHY THIS ROUTE:  The architecture, contract, sections, assertions, redaction rules, and
                 test list are settled by this report. What remains is bounded,
                 well-specified, test-backed implementation in one new directory.
WHY NOT OPUS:    No unresolved architectural decision remains in this stage.
ESCALATION:      If STOP condition 1 or 2 in §11 is hit — the preflight collector cannot
                 answer the build/copy/port questions without VS Code APIs, or VS Code log
                 reading proves unreliable — stop and escalate only that blocker.
```

**Scope for that assignment:**

* Gate 0 first: `npm install`, `npm run check`, `npm run compile`; report all three results before writing new code.
* Create `tools/diagnostics/` — collector, renderer, assertions — plain Node, zero dependencies.
* Create `Diagnostics/README.md`, `Diagnostics/CONTRACT.md`, `Diagnostics/.gitignore` (`local/`).
* Create `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` carrying the §12 breadcrumb.
* Add tests T1–T8 using `node:test`, plus an `npm run diagnostics` and `npm test` script.
* **Do not modify `src/`.** Do not add the VS Code command (that is Stage B). Do not fix the crash. Do not change port defaults, dispatch, authentication, or report architecture.
* Preserve the untracked `Project SOP/SOP PROMPTS .md`.

**Recommended play after Stage A:** the crash investigation, which by then should begin by running the snapshot and reading `exthost.log`, rather than by repeating today's archaeology.

**One note for the human, outside this stage's scope but worth a decision soon:** the repository copy has never been built, and the built copy is not the repository. Deciding which directory is canonical — and retiring the others — is a small, separate, and probably valuable cleanup play. It is deliberately not bundled here.

---

## STATUS

Architecture and readiness only. **Nothing implemented. No product code changed. No files created outside this report. No commit, no push.** The working tree is unchanged apart from this report, and the untracked `Project SOP/SOP PROMPTS .md` was preserved exactly as found.

**Baseline established:** TypeScript typecheck of the current source passes (`tsc --noEmit`, exit 0), verified against byte-identical sources using the sibling copy's already-installed toolchain so that this repository's tracked files and dependency state were not altered. No test script and no automated tests currently exist. `npm install` was deliberately **not** run here, because the absence of `node_modules` is itself primary evidence for the open crash investigation, and installing would have both disturbed that reproduction and risked modifying the tracked `package-lock.json` during an architecture-only play. It is Gate 0 of the implementation play instead.

---

────────────────────────────────────────

REPORT FILE:
Stage-1-RM-1-Diagnostic-Adoption-And-Readiness.md

REPORT TIMESTAMP:
2026-09-10 15:26 MDT

────────────────────────────────────────
