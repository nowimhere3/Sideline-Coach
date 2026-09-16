# Add Game: Choose Folder -> BOOM -> Game

## 1. STATUS

**IMPLEMENTED + AUTOMATED PROOF + LIVE MACHINE-OBSERVABLE PROOF - HUMAN FIELD PROOF PENDING**

## 2. WHAT WAS BROKEN

The Control Plane already registered, selected, opened, and broadcast a newly chosen Game correctly. The browser did not consume the complete canonical status snapshot carried by that broadcast. It discarded the payload and waited for a separate `/api/status` request before showing the Game.

That extra round trip left the exact field symptom possible: the folder picker closed while the freshly registered Game was not yet projected in the browser. Existing tests proved the registry after Add Game and proved browser rendering separately, but did not lock the direct Add Game status-push boundary.

## 3. ROOT CAUSE

`src/public/index.html` treated every `status` SSE event as a lightweight invalidation. Some status events are lightweight invalidations, but `broadcastStatus()` sends the full canonical projection, including `selectedGameId`, `game`, `games`, connection state, reports, roster, and routing truth.

Ignoring that complete payload made browser visibility depend on a redundant fetch and allowed an older fetch view to delay or replace the Opening projection.

## 4. WHAT CHANGED

- A complete status SSE payload (`games` present) is now applied directly and atomically with its reports.
- Lightweight status events continue to trigger the existing canonical refresh path.
- The browser regression test now keeps the GET snapshot deliberately stale, pushes a newly selected Opening Game over SSE, and proves that the header, state badge, and Game list update immediately.
- Existing static contract tests were updated to assert the stronger full-push-or-refresh behavior.

No Game identity, registry, Stadium routing, window-opening, or canonical development-source architecture changed.

## 5. FILES CHANGED

- `src/public/index.html`
- `test/multi-game-foundation.test.mjs`
- `test/browser-live-state-reconnection.test.mjs`
- `test/p0-incoming-reports.test.mjs`
- `test/q2-10a1-nonblocking-discovery.test.mjs`
- `REPORTS/Codex/Codex-Add-Game-Choose-Folder-Boom-Game.md`

## 6. WHY THIS IS THE SMALLEST CORRECT FIX

The picker, canonical identity ladder, Control Plane registry convergence, duplicate handling, Opening lifecycle, Stadium association, and window-opening strategies were already implemented and green. The remaining defect was at the final browser projection boundary. Consuming the status snapshot already on the wire removes the redundant dependency without adding a protocol, state store, endpoint, retry loop, or special Add Game path.

## 7. AUTOMATED PROOF

- `npm.cmd run check`: PASS
- `npm.cmd run compile`: PASS
- Focused browser/status tests: 42 pass, 0 fail
- Full `npm.cmd test`: 691 pass, 0 fail, 0 skipped
- `git diff --check`: PASS

The existing real HTTP + WebSocket Add Game suite proves new-folder registration, Opening -> Connected convergence, duplicate convergence, clean cancel, truthful invalid-folder failure, failed-open cleanup, correct Game scoping, and honest no-host failure. The repaired browser test additionally proves that a complete pushed snapshot surfaces a new Opening Game while the GET view is still stale.

## 8. LIVE / MACHINE-OBSERVABLE PROOF

`node tools/dev/verify-multi-game.mjs` observed the live Control Plane on port 3100 with three distinct Connected Games:

- GS3
- SidelineCoach-GameTest
- Trend and Tap Assist

The verifier also reported that all three connected Stadiums execute the current canonical SidelineCoach development source. This proves live multi-Game association and development-source integrity. It does not substitute for the human folder-picker proof.

## 9. HUMAN FIELD PROOF

**PENDING.** Codex did not claim or simulate the human gesture.

Required proof:

1. Open Sideline Coach.
2. Click Add Game.
3. Choose a real local Game folder that is not currently registered.
4. Confirm the Game appears.
5. Confirm its state is truthful.
6. If its Stadium is running, confirm it becomes Connected to the correct Game.
7. Confirm no browser refresh, Remove/Add workaround, `launch.json` surgery, or manual Game-ID work was necessary.

Passing description: **"I chose the folder and the Game just showed up."**

## 10. REGRESSIONS / RISKS

- Full status pushes now render immediately; partial status events retain the prior fetch behavior.
- Reports included in a full status snapshot are applied with the same Game snapshot, reducing cross-Game transition risk.
- A browser tab loaded before this source change still contains its previously loaded JavaScript. Start the human proof from a newly opened Sideline Coach page; no refresh is required during Add Game itself.

## 11. REMAINING UNKNOWNS

- The native folder picker and actual new-window activation have not yet been exercised by the human against this exact build.
- Installed-extension behavior remains covered by the existing `vscode.openFolder` strategy contract but was not physically exercised in this Play.

## 12. EXACT NEXT HUMAN ACTION

Open a fresh Sideline Coach page, click **Add Game**, choose one real unregistered local repository, and verify the seven human-proof steps above without refreshing the browser.

---

# Continuation: Human-paced folder picker

## 1. PREVIOUS CLAIM

The first implementation correctly repaired the final projection boundary: a complete canonical `status` SSE payload is applied directly and atomically by the browser. Automated tests and live multi-Game inspection supported that repair. It remains in place.

The prior report nevertheless left the native-picker gesture as human proof pending. It did not establish that a person could take normal time inside that picker.

## 2. HUMAN FIELD CONTRADICTION

Human field use contradicted the implied end-to-end readiness. The browser reported:

`Coach could not open the repository picker. RPC request 'game.pick' to Stadium timed out.`

The native picker sometimes appeared behind another window and remained usable after this error. Choosing a real Game folder after the error did not reliably add the Game. Other attempts produced `No repository chosen.`

Therefore the prior repair was useful but incomplete. The break was earlier than browser projection.

## 3. NEW ROOT CAUSE

`ControlPlaneDaemon.sendRpcToStadium()` applied one hard-coded 5,000 ms timeout to every Stadium RPC, including `game.pick`. `vscode.window.showOpenDialog()` legitimately remains unresolved while the human navigates. At five seconds the Control Plane deleted the pending request and rejected the browser request. When the Stadium eventually returned the chosen folder with the original JSON-RPC id, no pending correlation remained, so the response was ignored.

Repeated browser attempts could also overlap because neither the browser button nor the Control Plane serialized Add Game. Those requests had distinct monotonic ids, so a stale response could not attach to a later request, but several independent native pickers could exist. A cancellation from one of them truthfully produced `No repository chosen.`, making the combined human experience confusing.

## 4. EXACT RUNTIME SEQUENCE

Before the repair:

1. Browser `+ Add Game` POSTed `/api/game/add`.
2. The Control Plane selected the currently selected Game's authoritative Stadium when available, otherwise the first live Stadium.
3. It sent `game.pick` and entered the same 5-second pending-RPC lifecycle used by machine operations.
4. The Stadium invoked `vscode.window.showOpenDialog()` and waited for the person.
5. At five seconds the Control Plane removed the pending id, returned the timeout error, and performed no Control Plane registration.
6. The Stadium could later resolve the picker, identify the Game, and update its extension `globalState`, then send the response using the original id.
7. The Control Plane found no pending entry and discarded that late response. `recordKnownGameFromPicker`, selection, Opening state, `game.open`, status broadcast, and browser projection were never reached.

After the repair:

1. Ordinary Stadium RPCs still use a 5-second default.
2. Only `game.pick` uses a bounded 15-minute human-interaction deadline.
3. The pending request remains correlated while the picker is active.
4. Selection reaches Control Plane registration, Add Game decision, selected/Opening state, canonical status broadcast, `game.open`, and the HTTP success response.
5. The preserved status-push repair projects that canonical snapshot directly in the browser without requiring refresh.
6. Cancel remains a successful quiet no-op. A Stadium disconnect rejects its owned pending RPC immediately. Control Plane shutdown rejects all pending RPCs. A second Add Game request receives a truthful `picker-open` conflict instead of opening another dialog.

## 5. WHAT CHANGED

- Kept the ordinary RPC timeout at 5 seconds.
- Added a `game.pick`-only, bounded 15-minute human-interaction timeout.
- Associated pending RPCs with their Stadium socket and method.
- Reject pending requests immediately on owning-Stadium disconnect and on Control Plane shutdown, preventing long-lived zombie requests.
- Serialized Add Game in the Control Plane and disabled the initiating browser button until completion.
- Added concise Add Game lifecycle logging for picker request, elapsed resolution/failure, and successful registration.
- Preserved the complete-status SSE projection repair from the first implementation.

## 6. FILES CHANGED

Continuation changes:

- `src/control-plane/daemon.ts`
- `src/public/index.html`
- `test/add-game-endpoint.test.mjs`
- `test/q2-10a1-nonblocking-discovery.test.mjs`
- `REPORTS/Codex/Codex-Add-Game-Choose-Folder-Boom-Game.md`

The first implementation's focused browser/status test changes remain present. Unrelated pre-existing working-tree changes were not modified as part of this continuation.

## 7. TEST PROOF

- `npm.cmd run check`: PASS
- `npm.cmd run compile`: PASS
- Focused Add Game/browser/status suite: 56 pass, 0 fail
- Full `npm.cmd test`: 694 pass, 0 fail, 0 skipped
- `git diff --check`: PASS

The new timing regression configures the actual ordinary RPC deadline to 25 ms, leaves the actual picker unresolved for 100 ms, and gives the picker lifecycle a 500 ms bounded deadline. It proves the result is accepted after the machine deadline, the Game is registered and selected, `game.open` is called exactly once, and canonical status exposes the Game as Opening. This exercises the lifecycle contract; it does not merely extend the test runner timeout.

Additional new regressions prove that an owning Stadium disconnect fails promptly rather than waiting for the human deadline, and repeated Add Game calls cannot create overlapping picker requests. Existing coverage remains green for clean Cancel, no available Stadium, duplicate convergence, invalid folders, failed opening, exact-Game isolation, and canonical extension source.

## 8. LIVE MACHINE-OBSERVABLE PROOF

The old in-memory Control Plane was owner-verifiably replaced through the existing Freshness Guard shutdown path. A direct diagnostics comparison confirmed that the replacement process's build identity exactly matched the compiled `out/control-plane/daemon.js` build.

`node tools/dev/verify-multi-game.mjs --expect=3 --timeout=90000` then observed three distinct connected Games on the replacement Control Plane:

- Trend and Tap Assist
- SidelineCoach-GameTest
- GS3

All three reported the canonical SidelineCoach development extension source. The connected Stadium processes still advertise the prior expected Control Plane hash until their VS Code extension hosts reload, so diagnostics truthfully label them `stadium-outdated`; the picker protocol and Stadium handler used by this repair are unchanged and compatible.

The new concise runtime log points will make the final human attempt machine-correlatable as: picker requested -> picker resolved with elapsed milliseconds -> Game registered -> Game opening. No repository contents or secrets are logged.

This is live infrastructure/build proof, not a claim that Codex performed the human native-picker gesture.

## 9. WINDOW-FOREGROUND FINDING

The picker already uses the supported `vscode.window.showOpenDialog()` API in the selected Game's Stadium window when possible. The installed VS Code type contract exposes `defaultUri`, `openLabel`, file/folder/multiple selection, filters, and title. It exposes no foreground, owner-window, activation, or focus option.

No supported API-level foreground repair is available in the current architecture. Global Windows focus/process hacks would be fragile and unsafe across several VS Code windows, so none were added. Whether the picker is visibly foregrounded remains a human-field observation and a platform/VS Code limitation.

## 10. HUMAN FIELD PROOF — PENDING

**PENDING.** Codex does not claim the required human gesture.

Passing description:

**“I clicked Add Game, took my time choosing the folder, selected it, and the Game just showed up.”**

## 11. REMAINING RISKS

- Windows/VS Code may still place the supported native picker behind another window; there is no supported focus control in `OpenDialogOptions`.
- The 15-minute picker bound is deliberately finite. It supports normal human navigation while still recovering from a handler that remains alive but never resolves. An actual Stadium disconnect fails immediately.
- The three live Stadiums need a normal extension-host reload to advertise the replacement Control Plane build as current in diagnostics. This does not change the picker protocol, but the final field pass should begin from freshly opened/reloaded Sideline Coach development hosts and a fresh browser page.
- Only the human can verify native picker visibility, normal 30–60 second navigation, and the complete no-refresh experience on the real desktop.

## 12. EXACT NEXT HUMAN ACTION

1. Reload/reopen the VS Code development hosts, then open a fresh Sideline Coach page.
2. Click **Add Game** once.
3. Confirm the repository picker is visible; if it is behind another window, record that foreground failure separately but continue the correctness test.
4. Spend approximately 30–60 seconds navigating without hurrying.
5. Select a real unregistered Game repository.
6. Confirm the Game appears with truthful state and no browser refresh, Remove/Add workaround, Game-id work, or `launch.json` surgery.
7. Confirm no timeout/error appeared merely because selection took normal human time.

## CONTINUATION STATUS

**IMPLEMENTED + AUTOMATED/LIVE PROOF — HUMAN FIELD PROOF PENDING**
