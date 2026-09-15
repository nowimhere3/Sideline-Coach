REPORT FILE: Dev-Harness-Canonical-SidelineCoach-Source-For-Every-Game.md
REPORT TIMESTAMP: 2026-09-14 19:04 MDT (America/Edmonton)

# Dev Harness — Canonical SidelineCoach Source For Every Game

## Confirmed root cause (FACT, live-reproduced against the running daemon)

**FACT.** `SidelineCoach-GameTest` (`C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest`) is an independent git repository containing:
- its own historical, pre-Coach-Routines copy of the extension source (`src/stadium-client.ts` there has **no** `routine.sources.*` RPC handlers at all — `grep` for `routine.sources.suggest|browse|check` in that file returns nothing);
- its own `.vscode/launch.json`, with a config named `"Run Sideline Coach Extension — SidelineCoach"` whose `--extensionDevelopmentPath` is `${workspaceFolder}` — **itself**, not the canonical repo.

**FACT.** The canonical repo's own multi-Game harness (`tools/dev/host-launch-plan.mjs`) was already architecturally correct before this Play: `buildHostLaunchPlan()` hard-codes `--extensionDevelopmentPath=${repoRoot}` for every host, and a `dev-games.json` host entry has no field capable of overriding it. This part of the contract was never broken.

**FACT.** Both the canonical repo's daemon (`~/.sideline` via `os.homedir()`) and GameTest's own old copy use the identical fixed, machine-global discovery directory. So *any* Extension Development Host — whether launched from the canonical repo or from GameTest's self-hosted config — registers into the **same** detached Control Plane and shows up as an ordinary Connected Game, indistinguishable by connection state alone.

**FACT, live-reproduced during this Play** (a real daemon with 3 real sessions was already running on this machine): calling the daemon's `/api/routines/sources/browse?gameId=<GameTest's gameId>` returned exactly the reported symptom —
```json
{"success":false,"message":"Coach could not browse sources. Method 'routine.sources.browse' not implemented."}
```
while the identical call for `gameId=<Trend's gameId>` on the **same** daemon succeeded normally. This proves, against the live environment, that the daemon itself is current and correctly routes to the exact Stadium session — the defect is entirely in *which extension source that one session's Extension Development Host is running*, exactly as the field report described.

**INFERENCE (high confidence, not independently observable after the fact):** the live GameTest session was started via its own `.vscode/launch.json` self-host config — opening that folder directly and pressing F5 — rather than through the canonical repo's supported `tools/dev/launch-games.mjs` path. Under the *current* canonical config this is structurally the only way to reproduce the symptom, since `dev-games.json`'s own `gametest` entry (when driven through the canonical launcher) already correctly resolves `extensionDevelopmentPath` to the canonical repo.

**Secondary, independently real defect (FACT):** `tools/dev/dev-games.json` was stale relative to the human's actual current Games. It still referenced `../GS3` and `../SidelineCoach-GameTest` only, while `.vscode/launch.json`'s current single-Game debug configs (the ones actually in daily use) target `../Ai Usage - Real Time` (labeled "GS3") and `../Trend and Tap Assist`. This never caused *this* symptom (since extensionDevelopmentPath was never wrong there either), but it meant the multi-Game harness's own host list didn't reflect current reality.

**What Trend was actually loading:** the canonical repo's `out/extension.js`, via `.vscode/launch.json`'s `"Run Sideline Coach Extension — Trend and Tap Assist"` config (`--extensionDevelopmentPath=${workspaceFolder}` = this repo). Trend and Tap Assist itself has no `.vscode` folder and no source tree of its own — it cannot host anything, so it was never at risk of this defect.

**What GameTest was actually loading:** its own repository's ancient `out/extension.js` (if compiled there) / `src/`, via its own embedded self-hosted launch config — a source tree that predates the Coach Routines `routine.sources.*` RPC family entirely.

## Repair

### Canonical extension-source invariant (new, general, capability-agnostic proof)

Reused the exact technique the Control Plane Freshness Guard already uses (`computeControlPlaneBuild`, a SHA-256 over a script's relative-`require` closure), applied to a **different** target and a **different** purpose — proving Stadium-side extension-source identity, never touching the existing daemon-freshness mechanism:

- `src/extension.ts`: at activation, computes `computeControlPlaneBuild(context.asAbsolutePath('out/extension.js')).buildId` as `extensionBuild`, and passes it to `StadiumClient` as `extensionBuildId`.
- `src/stadium-client.ts` (`StadiumHelloParams`/hello frame) and `src/control-plane/protocol.ts` (`StadiumHelloParams.extensionBuildId`): carries this value in the `stadium.hello` handshake, alongside the pre-existing (untouched) `controlPlaneBuildId`.
- `src/control-plane/stadium-registry.ts` (`StadiumSession.extensionBuildId`) and `src/control-plane/daemon.ts`: the daemon stores whatever a Stadium self-reports and passes it through, unmodified, in `/api/diagnostics`'s `sessions[].extensionBuildId`. The daemon does **not** judge canonicalness itself — it has no privileged notion of "the" canonical repo, so comparison happens externally.
- `tools/dev/verify-multi-game.mjs`: new `computeExpectedExtensionBuildId(repoRoot)` computes the same hash over *this* repo's own currently-compiled `out/extension.js`, and new `describeExtensionSource(snapshot, expected)` compares it against every connected Game's self-reported `extensionBuildId`, producing:
  ```
  SidelineCoach Dev Harness

  Extension source: C:\Users\dmcal\Documents\GitHub\SidelineCoach

  Games:
    ✓ Trend and Tap Assist        → canonical extension
    ✓ GS3                         → canonical extension
    ✓ SidelineCoach-GameTest      → canonical extension

  PASS: all connected Stadiums use the current SidelineCoach development source.
  ```
  or, on drift:
  ```
    ✗ SidelineCoach-GameTest      → WRONG EXTENSION SOURCE (cp-xxxxxx… ≠ canonical cp-yyyyyy…)

  DEV HARNESS ERROR: one or more Games would not run the canonical SidelineCoach extension source.
  ```
  and honestly reports `UNKNOWN` (never a false PASS) for a session that predates this instrumentation or when the canonical build itself cannot be computed. This is wired into both `npm run dev:verify` and `launch-games.mjs --verify`, so the ordinary Debug-and-Go path (`compile → launch Games → verify`) surfaces this automatically — with exit code 1 on any mismatch, the developer-facing "fail clearly" requirement.

  Because the hash covers the extension's real compiled closure (`out/extension.js` → `out/stadium-client.js` → `out/routine-sources.js` → …), it automatically changes for *any* future RPC method or behavior change — Coach Routines is used only as this Play's regression sentinel, never special-cased in the launcher itself, exactly as required.

### Live proof against the actual running environment (from this session)

A live detached Control Plane with 3 real Extension Development Hosts (Trend, GS3, GameTest) happened to already be running on this machine. Running the new `dev:verify` against it correctly reported `UNKNOWN extension build` for all three — truthfully, since none of those already-running hosts have been recompiled/reloaded since this Play's `extensionBuildId` field was added — rather than a false PASS or a crash. This is the intended, honest degradation for pre-existing sessions.

### `tools/dev/dev-games.json` normalized to current intent

```json
"hosts": [
  { "name": "gs3",      "label": "GS3",                    "workspace": "../Ai Usage - Real Time",  "inspectExtensionsPort": 9229 },
  { "name": "trend",    "label": "Trend and Tap Assist",    "workspace": "../Trend and Tap Assist",  "inspectExtensionsPort": 9230 },
  { "name": "gametest", "label": "SidelineCoach-GameTest",  "workspace": "../SidelineCoach-GameTest","inspectExtensionsPort": 9231 }
]
```
Matches `.vscode/launch.json`'s current single-Game debug targets (not blindly restored from history), and **keeps GameTest** as required — as a deliberate regression fixture, not a config to delete. `.vscode/launch.json` itself needed **no changes**: its two single-Game configs already correctly used `${workspaceFolder}` (the canonical repo) as `extensionDevelopmentPath`, and its `"Dev: Launch BOTH Game Hosts"` config already correctly delegates to `launch-games.mjs`.

### Fail-closed

`buildHostLaunchPlan` already structurally cannot emit a non-canonical `extensionDevelopmentPath` (no config field exists to override it) — verified by a new test asserting this explicitly for a GameTest-shaped host entry. The genuinely new fail-closed surface is the **runtime** one: `describeExtensionSource` returning `allCanonical: false` (and the `DEV HARNESS ERROR:` line) whenever a connected session's self-reported build differs, which `launch-games.mjs --verify` and `npm run dev:verify` both now exit non-zero on.

### Files changed

- `src/extension.ts` — compute and pass `extensionBuild`.
- `src/stadium-client.ts` — new `extensionBuildId` option, sent at hello.
- `src/control-plane/protocol.ts` — `StadiumHelloParams.extensionBuildId`.
- `src/control-plane/stadium-registry.ts` — `StadiumSession.extensionBuildId`.
- `src/control-plane/daemon.ts` — store it from hello; expose it (pass-through) in `/api/diagnostics`.
- `tools/dev/verify-multi-game.mjs` — `computeExpectedExtensionBuildId`, `describeExtensionSource`.
- `tools/dev/launch-games.mjs` — `--verify` now also runs the extension-source proof and fails the exit code on drift.
- `tools/dev/dev-games.json` — normalized host list (gs3 / trend / gametest), all three pointed at their real current directories.
- `test/dev-harness.test.mjs` — strengthened (12 new tests; existing tests untouched).
- `Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md` — new `Q2.8H` breadcrumb.

No changes to `src/control-plane/freshness.ts`, `src/control-plane/launcher.ts`, or any daemon-replacement/election logic.

## Automated regression proof

`test/dev-harness.test.mjs` (strengthened, 30/30 passing), covering the assignment's 9 required invariants:
1. every generated launch plan uses the same canonical `extensionDevelopmentPath` (pre-existing test, still passing).
2. Game workspace paths remain independent (pre-existing).
3. isolated Games receive distinct `user-data-dir` values (pre-existing).
4. **new**: a Game workspace containing its own historical SidelineCoach source (GameTest-shaped) cannot replace the canonical extension source in a generated plan.
5. **new**: GameTest specifically can be used as a workspace while `extensionDevelopmentPath` still resolves to the canonical repo.
6. **new**: `describeExtensionSource` fails closed with a clear `DEV HARNESS ERROR` when a session reports a different build; treats a build-less session as honestly `UNKNOWN`, never a silent pass; and is `UNKNOWN` (not a false `PASS`) when the canonical build itself can't be computed.
7. **new**: a brand-new host config (no such field exists to configure `extensionDevelopmentPath` per host) automatically inherits the canonical source.
8. current supported Games still launch correctly — `dev-games.json`'s workspace paths verified to resolve to real, existing directories (a new test that would have caught the pre-existing staleness); full existing suite unaffected.
9. no existing multi-Game isolation/routing contract regresses — full repo suite green (below), plus `test/p0-1-control-plane-freshness.test.mjs` (47/47) proving the Freshness Guard is untouched and still fully correct.

Plus a real-daemon end-to-end test proving `extensionBuildId` actually round-trips through a live `stadium.hello` → `/api/diagnostics`, including a session deliberately self-reporting an old build to reproduce the exact field symptom's shape (Connected, but a different build) purely at the data level.

## Build/handshake proof — reused, not invented

Reused `computeControlPlaneBuild` (already existed for the Freshness Guard) wholesale — no parallel identity system, no new hashing algorithm, no new production capability-negotiation architecture. The only new code is: compute it over a second target file, carry one more optional string through the existing hello/diagnostics shapes, and compare it in the existing dev verifier.

## Daemon / Freshness Guard impact

**None.** `src/control-plane/freshness.ts` was not modified. `controlPlaneBuildId`/`controlPlaneFreshness` (the daemon's own build-vs-Stadium-expectation guard) are entirely untouched, still tested by all 47 tests in `test/p0-1-control-plane-freshness.test.mjs`, still passing. `extensionBuildId` is a new, independent field addressing a different axis (which extension SOURCE a Stadium runs, not which daemon BUILD it expects) and was added alongside the existing field, never in place of it.

## Final full-suite count

- `npm run check` — clean.
- `npm run compile` — clean.
- `test/dev-harness.test.mjs` — 30/30 passed.
- `test/p0-1-control-plane-freshness.test.mjs` — 47/47 passed (Freshness Guard unaffected).
- `npm test` (full repository suite) — **691 passed, 0 failed** (baseline 679 + 12 new).
- `git diff --check` — exit 0; only pre-existing LF/CRLF `autocrlf` informational warnings on files this Play touched, no whitespace-error findings.
- `node tools/dev/launch-games.mjs --dry-run` — confirmed against the current (normalized) `dev-games.json`: all three plans (GS3, Trend and Tap Assist, SidelineCoach-GameTest) resolve `--extensionDevelopmentPath=C:\Users\dmcal\Documents\GitHub\SidelineCoach` for every one, regardless of workspace.
- `node tools/dev/verify-multi-game.mjs` — run against the live daemon that was already running on this machine: correctly reported 3 Connected Games and honestly `UNKNOWN extension build` for all three (none has been recompiled/reloaded since this Play's field was added yet).

## Human field proof (smallest meaningful test)

1. Stop the three currently-running Extension Development Hosts for GS3 / Trend and Tap Assist / SidelineCoach-GameTest (however they were started).
2. From this repo: `npm run compile`, then launch via the ONE supported Debug-and-Go path — `Dev: Launch BOTH Game Hosts` in `.vscode/launch.json` (or `npm run dev:games -- --verify`).
3. Once all three report Connected, run `npm run dev:verify` and confirm every Game shows `✓ … → canonical extension` and the final line reads `PASS: all connected Stadiums use the current SidelineCoach development source.`
4. In **Trend and Tap Assist**: Settings → Coach Refresh → `+ Add references` works.
5. In **SidelineCoach-GameTest**: Settings → Coach Refresh → `+ Add references` ALSO works — with no special per-Game install or repair performed between steps 4 and 5.

Why GameTest specifically proves the point: its workspace still contains the old historical SidelineCoach source that caused this defect. If it now receives today's Coach Source RPCs when launched through the supported harness, the extension implementation demonstrably comes from the canonical development source, never from the Game's own files.

## WAS / IS / WILL BE

**WAS:** `host-launch-plan.mjs` already correctly hard-coded the canonical `extensionDevelopmentPath` for every harness-launched Game, but nothing could prove that at runtime — `Connected` was the only signal available, and it cannot distinguish a canonical Stadium from one launched outside the supported harness (as GameTest's own self-hosted `.vscode/launch.json` allows). `dev-games.json` had also drifted from the human's actual current Games.

**IS:** Every host-plan is (and was) structurally forced to the canonical extension source, now provably so at runtime: each Stadium self-reports a real content-hash `extensionBuildId` at hello, `tools/dev/verify-multi-game.mjs` compares it against the canonical repo's own current hash, and both `npm run dev:verify` and `launch-games.mjs --verify` fail closed with a clear `DEV HARNESS ERROR` on any mismatch. `dev-games.json` matches the human's current three Games (GS3, Trend and Tap Assist, SidelineCoach-GameTest kept deliberately as a regression fixture).

**WILL BE (breadcrumbed, not implemented):** the same `extensionBuildId` proof could eventually gate an even earlier failure mode — refusing to *treat* a session as Connected in Dad Mode until its build is known-canonical — but that would change product-facing connection semantics, which this Play deliberately did not touch (Dev/Advanced-only diagnostic, never Dad Mode). Not designed here.

REPORT: Dev-Harness-Canonical-SidelineCoach-Source-For-Every-Game.md
TIMESTAMP: 2026-09-14 19:04 MDT (America/Edmonton)
