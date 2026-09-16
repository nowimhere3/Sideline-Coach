# Opus: Live Canonical Relaunch and Source-Browse Proof

**Agent:** Claude Code, Opus 5 (medium reasoning)
**Branch:** `q2.8-multigame-field-debug`
**Execution window:** 2026-09-14 23:54 to 2026-09-15 00:02 MDT (America/Edmonton)
**Evidence sources:** live process table, `~/.sideline/logs/control-plane.log`, live Control Plane HTTP API (`:3100`, bearer token from `~/.sideline/token`), the local filesystem. No remote access.

Timestamps in the daemon log are UTC. Below they are converted to MDT (UTC−6).

---

## 0. Headline

**The failing state no longer existed when this Play started.** The stale GameTest Extension Host had already been stopped and replaced through the canonical harness earlier in the evening:

- disconnect at 20:49:33 MDT;
- harness launch at 20:49:47–51;
- second harness relaunch at 20:58:18–22.

At the start of this Play:

- all three connected Stadiums reported the canonical `extensionBuildId`;
- `routine.sources.browse` succeeded for Trend and for GameTest;
- each Game returned its own workspace root.

So this Play did not kill or relaunch anything. There was no stale target left to stop, and killing the healthy GameTest host would have terminated its 6 roster Players. The before/after evidence for the experiment comes from the daemon log (§1). The AFTER proof is live and first-hand (§4–§8).

---

## 1. BEFORE runtime state

### 1a. The failing specimen, reconstructed from the daemon log

| Time (MDT) | Event |
|---|---|
| Sept 12 | GameTest Stadium session `inst_…_p27060_1789285058795_1` created. The extension host (PID 27060) started on Sept 12, before `routine.sources.browse` existed. GS3 was in the same situation (`p2752_1789285106850`). |
| 2026-09-14 19:09:15 | Daemon PID 30684 (the current daemon) starts. **Its parent process is PID 27060, the Sept 12 GameTest extension host.** The stale GameTest host spawned today's Freshness-Guard daemon, then reconnected to it as an ordinary "connected" Game. |
| 19:09:15 | `p27060` re-registers and binds to SidelineCoach-GameTest (`game_git_c3f83b48`). No build warning is raised. |
| 20:49:33 | **`p27060` (stale GameTest) disconnects.** `p2752` (stale GS3) disconnects at 20:49:39. |
| 20:49:47–51 | Harness-launched sessions register: Trend `p15972`, GS3 `p19692`, GameTest `p19964`. (`~/.sideline/dev-hosts` was modified at 20:49.) |
| 20:57–20:58 | Those three disconnect. |
| 20:58:18–22 | Relaunch registers: Trend `p15504`, GS3 `p23100`, **GameTest `p14184`** (the current session). |
| 21:02:23 | Harness Trend `p15504` disconnects. |
| 21:04:49 | `out/` recompiled. |
| 21:04:50 → 21:05:01 | Main-instance Trend `p43312` is replaced by main-instance Trend `p34680` (the current session). |

The `Method 'routine.sources.browse' not implemented.` string is produced Stadium-side, by the extension's JSON-RPC fallback at `src/stadium-client.ts:670`. A Stadium only returns it when the code it loaded has no handler for that method. That fits `p27060`, which activated on Sept 12. I did not observe this error live in this Play; the failure is recorded in the Sonnet report and the human field report.

### 1b. Live state at 23:58 MDT, before I took any action

- Daemon: port 3100, PID 30684, build `cp-e3bcacf7520c8f24de95cdbd`.
- Canonical expected extension build (hash of `SidelineCoach/out/extension.js` closure): `cp-5ee797ded1d03adaf1a61f2b`.

| Game | gameId | Session | Host process | Host start | extensionBuildId | browse |
|---|---|---|---|---|---|---|
| Trend and Tap Assist | `game_git_ede05e94` | `…_p34680_1789441500290_1` | ext host 34680, child of **main VS Code instance 31708** (F5-style dev window, not a harness instance) | 21:04:51 | `cp-5ee797ded1d03adaf1a61f2b` ✓ | 200, success |
| SidelineCoach-GameTest | `game_git_c3f83b48` | `…_p14184_1789441101388_1` | ext host 14184, child of harness instance **2280** (`--user-data-dir=…\dev-hosts\gametest\user-data --extensionDevelopmentPath=C:\Users\dmcal\Documents\GitHub\SidelineCoach --inspect-extensions=9231`) | 20:58:11 | `cp-5ee797ded1d03adaf1a61f2b` ✓ | 200, success |
| GS3 | `game_git_042782b8` | `…_p23100_1789441099987_1` | ext host 23100, child of harness instance 28736 (Sept 12 instance, window reloaded 20:58) | 20:58:13 | `cp-5ee797ded1d03adaf1a61f2b` ✓ | 200, success |

The GameTest failure **was not observable** at the start of this Play.

The human's own transcript (`REPORTS/SidelineCoach-Terminal-Session.md`, started 21:26) already showed both browse requests succeeding with the correct roots. That run came after the 20:58 relaunch.

---

## 2. Process or runtime stopped

**None in this Play.**

- **Stale target:** Sept 12 GameTest extension host, PID 27060. It was already gone: `Get-Process -Id 27060` found nothing, and its session disconnected at 20:49:33.
- **Current GameTest harness host (PID 2280 / ext host 14184):** canonical and healthy, with 6 roster Players (`codex-0a6eab81`, `codex-8b95fbf2`, `claude-9e82a136`, `claude-eb460e31`, `antigravity-8c7bcbe3`, `antigravity-b4eaa400`). Stopping it would violate "do not terminate unrelated Players" and would prove nothing new.
- **Harmless leftover, not touched:** crashpad-handler PID 6512, created Sept 12 18:19, `--user-data-dir=…\dev-hosts\gametest\user-data`. Its parent (31140) no longer exists. It is an orphan from the old GameTest instance and holds no extension host or session.

### Why I did not run the full `npm run dev:games -- --verify`

It would have **caused** a failure:

1. **Trend would be duplicated.** Trend currently runs in the user's main VS Code instance (31708). The harness would open a second Trend Stadium, and the registry would mark `game_git_ede05e94` as `conflicted`. Routing blocks conflicted Games (`src/control-plane/router.ts:134`, `stadium-registry.ts:179`).
2. **The GS3 entry no longer matches the running GS3.** The uncommitted edit to `tools/dev/dev-games.json` now points `gs3` at `../Ai Usage - Real Time` (a different repo), while the running GS3 host is `C:\Users\dmcal\Documents\GitHub\GS3`.

The log shows the duplicate-Trend condition already happened once tonight, from **20:49:47 to 21:02:23**: harness Trend `p15972`/`p15504` overlapped main-instance Trend `p43312`. Any Trend Add References attempt in that window would have hit a conflicted binding. (INFERENCE: this may explain some "failed in multiple Games" field reports. No UI request log was available to confirm it.)

---

## 3. Canonical compile and launch path

- `npm run compile` (`tsc -p ./`) from `C:\Users\dmcal\Documents\GitHub\SidelineCoach`: exit 0.
- The canonical build **before** and **after** compile is the same: `cp-5ee797ded1d03adaf1a61f2b`. No `src/` file is newer than the prior 21:04:49 output, so tsc emitted identical bytes.
- Launch path already in effect for GameTest: `npm run dev:games` → `tools/dev/launch-games.mjs` → `host-launch-plan.mjs`. Proof that this path was used comes from GameTest's live command line:
  - `--user-data-dir=C:\Users\dmcal\.sideline\dev-hosts\gametest\user-data`
  - `--extensionDevelopmentPath=C:\Users\dmcal\Documents\GitHub\SidelineCoach`
  - workspace `C:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest`
  - The extension path is the canonical repo, not the Game workspace.

---

## 4–5. Extension identity after compile (verifier plus independent check)

`node tools/dev/verify-multi-game.mjs --expect=3` (= `npm run dev:verify`), exit 0:

```
✓ SidelineCoach-GameTest [game_git_c3f83b48] connected
✓ GS3 [game_git_042782b8] connected
✓ Trend and Tap Assist [game_git_ede05e94] connected
PASS: 3 Game(s) Connected (expected 3).
✓ SidelineCoach-GameTest → canonical extension
✓ GS3                    → canonical extension
✓ Trend and Tap Assist   → canonical extension
PASS: all connected Stadiums use the current SidelineCoach development source.
```

I checked this independently against raw `/api/diagnostics` session records rather than relying on the verifier's PASS line:

| Game | Session extensionBuildId | Canonical (recomputed after compile) | Match |
|---|---|---|---|
| Trend | `cp-5ee797ded1d03adaf1a61f2b` | `cp-5ee797ded1d03adaf1a61f2b` | ✓ |
| GameTest | `cp-5ee797ded1d03adaf1a61f2b` | `cp-5ee797ded1d03adaf1a61f2b` | ✓ |

**What the ID measures.** `src/extension.ts:95` hashes `context.asAbsolutePath('out/extension.js')` and its closure **once, at activation**. `context` is the host's `extensionDevelopmentPath`, not the Game workspace. The hash is fixed for the life of the session, so a host that activated with old code keeps reporting the old hash (or none, if it predates Q2.8H).

There is one small caveat. The hash is taken from disk at activation, not from the modules actually loaded. A compile that lands between module load and hashing could mislabel a host. That did not happen here, because tsc produced identical bytes.

---

## 6–8. Live source-browse proof with filesystem root verification

Route: `GET http://127.0.0.1:3100/api/routines/sources/browse?gameId=<id>&dir=<dir>` with `Authorization: Bearer <~/.sideline/token>`. This is the production daemon route that dispatches `routine.sources.browse` to the bound Stadium. Each result was diffed against `fs.readdirSync` of the real workspace. Run at 00:00:23 MDT.

### TREND (`game_git_ede05e94`, rootFsPath `c:\Users\dmcal\Documents\GitHub\Trend and Tap Assist`)

- **Root (`dir=""`):** HTTP 200, `success:true`, returned gameId `game_git_ede05e94`.
  - Entries: `Docs | FILE examples | Onboarding-Docs | Reports | .gitattributes | README.md`
  - In API but not on disk: **none**. On disk but filtered: `.git`
- **`dir="Docs"`:** HTTP 200, `success:true`.
  - Entries: `Claude`, which matches disk exactly.

### GAMETEST (`game_git_c3f83b48`, rootFsPath `c:\Users\dmcal\Documents\GitHub\SidelineCoach-GameTest`)

- **Root (`dir=""`):** HTTP 200, `success:true`, returned gameId `game_git_c3f83b48`.
  - Entries: `.vscode | Diagnostics | Docs ANCHOR | Project SOP | REPORTS | src | test | tools | .gitignore | .vscodeignore | LICENSE | package-lock.json | package.json | README.md | tsconfig.json`
  - In API but not on disk: **none**. On disk but filtered: `.git`
- **`dir="src"`:** HTTP 200, `success:true`.
  - 16 entries (`control-plane`, `player-control`, `public`, `extension.ts`, `stadium-client.ts`, …), which match disk exactly.

There was no cross-Game leakage. Each Game's listing is unique to its own tree: Trend has `FILE examples`/`Onboarding-Docs`; GameTest has `Docs ANCHOR`/`src`/`tsconfig.json`.

```text
TREND
canonical extension build ✓
routine.sources.browse implemented ✓   (the call dispatched and returned; the error would be -32601)
browse request succeeds ✓  (root + Docs, exact disk match)

GAMETEST
canonical extension build ✓
routine.sources.browse implemented ✓
browse request succeeds ✓  (root + src, exact disk match)
```

**Optional UI proof:** not run. There is no existing browser/e2e driver for the live Add References dialog, and building one is out of scope.

---

## 9. Did the previous Opus causal theory survive?

**Yes, strongly supported, with one correction to the narrative.** This is Case A, but the relaunch happened at 20:49/20:58, before this Play:

> The old running GameTest extension host was the divergence. Relaunching GameTest through the canonical harness loaded current SidelineCoach code and restored the source-browse RPC.

The evidence chain:

- `p27060` activated Sept 12 and stayed connected until 20:49:33 today.
- Its replacement `p14184` was launched with the canonical `--extensionDevelopmentPath` and reports the canonical build.
- Browse returns the correct GameTest root, both through the human's 21:26 transcript and in this Play at 00:00.

**Correction to the earlier Opus pass:** the stale host was not still running "now". It was already replaced by the time the human's 21:26 transcript was taken.

**Not observed by me:** a live `-32601` from `p27060`. Its failure rests on the Sonnet report and human field evidence, plus the fact that it activated before the method existed.

---

## 10. Code changes

**None.** `npm run compile` rewrote `out/` with byte-identical output (the build hash is unchanged). No source, test, config, or Game-repository file was modified. No commit, push, pull, fetch, reset, clean, or stash. The only file written is this report.

---

## 11. Remaining risk and development hardening opportunities

These are separate from tonight's runtime question, which is explained. **Answer to the question: yes, an obsolete Game Extension Host can connect and look like an ordinary healthy Game with no warning, except through the CLI verifier.**

1. **Silent masquerade.**
   - A Stadium that predates Q2.8H sends no `extensionBuildId`. A Stadium running older source sends a different one.
   - The daemon still registers it, shows `connected` in `/api/games` and the Game dropdown, and routes RPCs to it.
   - `launcherFreshness`/`controlPlaneCompatibility` check only the **Control Plane** build, not the extension build.
   - `extensionBuildId` appears nowhere in `src/public/index.html`.
   - The only detector is `npm run dev:verify`, which nobody runs during field testing.
   - Tonight's worst case was exactly this: the stale Sept 12 host even *spawned* the current daemon at 19:09 and passed every visible health signal.
   - Smallest hardening: have the daemon compare each session's `extensionBuildId` to its own expected extension build and expose a "stale extension" status (dev-visible badge or diagnostics field). An alternative: when the Stadium gets -32601 for a known method, return a typed "Stadium is running outdated extension code, relaunch via dev:games" error to the browser instead of the raw text.
2. **Mixed launch paths create conflicts.**
   - Trend runs from the main VS Code instance (F5), while `dev-games.json` also lists Trend.
   - Running `dev:games` without `--only` duplicates Trend and blocks its routing. This happened from 20:49 to 21:02.
   - The harness does not check whether a Game is already bound before launching it. Smallest hardening: in `launch-games.mjs`, skip or warn for hosts whose workspace `gameId` is already `connected` on the Control Plane.
3. **Config drift.** The uncommitted `dev-games.json` edit points `gs3` at `../Ai Usage - Real Time`, while the running GS3 host is `../GS3`. The next full `dev:games` run will open a different repo under the "GS3" label.
4. **Leftover orphan.** Crashpad PID 6512 from the old GameTest instance. Harmless; I left it alone.

---

## 12. Current status

`LIVE RUNTIME ROOT CAUSE PROVEN — BACKEND FIX VERIFIED — HUMAN UI PROOF PENDING`

Precisely:

- **Root cause:** supported by process ancestry, session timeline, and build identity. The stale host's live error was not re-observed by me.
- **Backend:** verified live for both Games, with filesystem-exact roots.
- **UI:** the human has not yet clicked Settings → Coach Refresh → Edit → Add references in each Game since 21:05.

**Human UI proof (smallest):**

1. Do **not** run `dev:games` again.
2. In the Control Plane browser, select Trend and open Add references. Confirm the root shows `Docs, FILE examples, Onboarding-Docs, Reports…`.
3. Select SidelineCoach-GameTest and open Add references. Confirm `.vscode, Diagnostics, Docs ANCHOR, … src, test, tools…`.

If the browser tab has been open since before 20:49, hard-refresh it once first.

---

## 13. WAS / IS / WILL BE

**WAS**
- A GameTest Extension Host activated on Sept 12 (PID 27060) served GameTest until 20:49:33 on 2026-09-14.
- It predated `routine.sources.browse`, so browse for GameTest returned `Method 'routine.sources.browse' not implemented.`
- It looked fully "connected", even parented today's daemon, and nothing but a manual verifier could have flagged it.
- From 20:49 to 21:02, Trend was also briefly open in two Stadiums (conflicted).

**IS**
- One Stadium per Game.
- All three report the canonical build `cp-5ee797ded1d03adaf1a61f2b`; `dev:verify` passes, and I checked it independently against raw diagnostics.
- Live `routine.sources.browse` succeeds for Trend and GameTest, and each returns exactly its own workspace tree.
- No code changed.

**WILL BE**
- A human UI click-through in both Games closes the field proof.
- Separately, a small development-hardening Play could make an outdated or unknown extension build visible in the Control Plane (not only in `dev:verify`), and make `dev:games` refuse to duplicate an already-connected Game.
- Fix the `dev-games.json` GS3 path drift before the next full harness launch.

REPORT: Opus-Live-Canonical-Relaunch-And-Source-Browse-Proof.md
TIMESTAMP: 2026-09-15 00:02 MDT (America/Edmonton)
