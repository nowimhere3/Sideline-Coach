<!-- sideline-provenance: {"gameId":"game_git_3b85b965","clientRef":"ref_1790003623383_1e58cf67","playerInstanceId":"antigravity-6af0f4d3","playerType":"antigravity","provider":"antigravity","model":"gemini-3.8-flash","effort":"medium","at":"2026-09-21T15:13:43.383Z"} -->

# OPUS LIVE-HEALTH MAP: CLAUDE & CODEX DIRECT SEAMS

## CLAUDE DIRECT

* **Files**:
  - `src/player-control/structured-print.ts`
  - `src/player-control/contract.ts`

* **Symbols**:
  - `StructuredPrintControl.prototype.startTurn` (`src/player-control/structured-print.ts#L421-L548`)
  - `claudeDialect` (`src/player-control/structured-print.ts#L137-L196`)
  - `parseClaudeFrame` (`src/player-control/structured-print.ts#L198-L228`)
  - `PrintSignal` type (`src/player-control/structured-print.ts#L61-L66`)

* **Current Drop Point**:
  - **Frame Ingress**: In `StructuredPrintControl.startTurn`, incoming stdout chunks are buffered and split on `\n` (`child.stdout.on('data', ...)`, lines 474-481). Each parsed JSON line is passed to `this.dialect.parse(frame)` (line 482).
  - **Type Switch**: In `parseClaudeFrame(frame: JsonObject)` (lines 198-228), `const type = stringValue(frame.type)` is checked against:
    - `type === 'system' && frame.subtype === 'init'`
    - `type === 'system' && frame.subtype === 'permission_denied'`
    - `type === 'assistant'`
    - `type === 'result'`
  - **Drop**: A `rate_limit_event` frame does not match any of these branches and falls through to line 227 (`return [];`). In `startTurn`, iterating over an empty signal list produces zero actions and silently discards the frame.

* **Proposed Capture Seam**:
  - **Smallest Seam**: In `parseClaudeFrame` (or directly before `dialect.parse` in `startTurn`), intercept `type === 'rate_limit_event'` (or inspect `frame.rate_limits`).
  - To avoid polluting `PrintSignal` (which drives turn lifecycle events: init, message, command, tool, denied, result), either:
    1. Add an optional frame tap / observer hook on `StructuredPrintControl` (e.g. `onHealthFrame?: (frame: JsonObject) => void`), or
    2. Add `{ kind: 'health'; payload: JsonObject }` to `PrintSignal` and handle it in `startTurn` by emitting/storing health without modifying turn progress, turn state, or prompt delivery.
  - **Data Shape Received**:
    Top-level frame:
    ```json
    {
      "type": "rate_limit_event",
      "rate_limits": {
        "five_hour": { "used_percentage": 0.12, "resets_at": "2026-09-21T18:00:00Z" },
        "seven_day": { "used_percentage": 0.45, "resets_at": "2026-09-28T12:00:00Z" }
      }
    }
    ```
    *(Alternatively `utilization` depending on Claude Code version, matching the Anthropic OAuth usage schema).*

* **Tests to Read**:
  - `test/q2-10c-controlled-print.test.mjs` (drives `StructuredPrintControl` against fake CLI)
  - `test/fixtures/fake-print-cli.mjs` (lines 32-86: emulates Claude Code `stream-json` frame output)

---

## CODEX DIRECT

* **Files**:
  - `src/player-control/codex-app-server.ts`
  - `src/player-control/codex-contract.ts`

* **Symbols**:
  - `StdioRpcClient.prototype.handle` (`src/player-control/codex-app-server.ts#L219-L233`)
  - `CodexAppServerControl.prototype.notification` (`src/player-control/codex-app-server.ts#L631-L673`)
  - `REQUIRED_CONTRACT` (`src/player-control/codex-contract.ts#L41-L92`)
  - `REQUEST_ALLOWLIST` (`src/player-control/codex-app-server.ts#L43`)
  - `CodexAppServerControl.prototype.queryCapabilities` (`src/player-control/codex-app-server.ts#L599-L615`)
  - `captureCapabilities` (`src/player-control/codex-app-server.ts#L793-L804`)

* **Current Ignored-Notification Point**:
  - **Ingress**: `StdioRpcClient.handle` receives un-id'd frames and invokes `this.onNotification(message.method, message.params)`, which dispatches to `CodexAppServerControl.prototype.notification(method, rawParams)`.
  - **Supported Notifications**:
    - `'turn/started'`
    - `'turn/completed'`
    - `'item/agentMessage/delta'`
    - `'item/started'`
    - `'item/completed'`
    *(Matched in `REQUIRED_CONTRACT.serverNotifications` in `codex-contract.ts#L45`).*
  - **Ignored Point**: In `notification(method, rawParams)`:
    - Lines 633-634: `threadId` is undefined for account-level notifications, so it does not filter out.
    - Lines 635-672: `method === 'account/rateLimits/updated'` matches none of the turn/item branches and falls off line 673 with no action.
  - **Observation Safety**: A branch `if (method === 'account/rateLimits/updated')` can record/emit health data immediately with zero impact on `activeTurnRef`, `controlState`, or turn lifecycle.
  - *Contract Caution*: If added to `REQUIRED_CONTRACT.serverNotifications`, the startup schema probe (`checkSchemaContract`) will verify its declaration in `ServerNotification.json`.

* **Existing Read Seam**:
  - `account/rateLimits/read` is **NOT** currently implemented in SidelineCoach source.
  - `REQUEST_ALLOWLIST` (derived from `REQUIRED_CONTRACT.clientMethods`) currently allows only:
    `['initialize', 'thread/start', 'turn/start', 'account/read', 'thread/read', 'thread/resume', 'thread/turns/list', 'model/list']`.
  - Calling `this.rpc.request('account/rateLimits/read', ...)` today throws `Provider method 'account/rateLimits/read' is not allowed.`
  - **Safe Reusable Seam**: `this.rpc.request` is already used inside `queryCapabilities()` and `captureCapabilities()` to issue background RPCs (`account/read`, `model/list`) without starting a new process or sending a model turn. Adding `'account/rateLimits/read'` to `REQUIRED_CONTRACT.clientMethods` immediately unlocks `this.rpc.request('account/rateLimits/read', {})` over the existing, already-open stdio JSON-RPC session.

* **Exact Unresolved Field Proof**:
  - Whether `account/rateLimits/updated` actually fires autonomously during a normal turn in Codex CLI/app-server v0.154.0+ (or only after certain operations / not at all).
  - *Smallest field proof needed*: Log all notification methods arriving in `CodexAppServerControl.prototype.notification` during a single real Turn to verify if `account/rateLimits/updated` is pushed by `codex app-server`.

* **Tests to Read**:
  - `test/player-control-contract.test.mjs` (verifies Codex app-server RPC & notification interactions)
  - `test/fixtures/fake-codex-app-server.mjs` (emulates Codex JSON-RPC app-server responses and notifications)

---

## DO NOT READ (To Save Opus Tokens)

Opus does **NOT** need to read or analyze:
1. `src/control-plane/*` (daemon, router, play-queue, work-ledger, context-affinity)
2. `src/scout-*` (combine, formation, interchangeability, substitution, terminal, runner)
3. `src/stadium-*` & `src/game-*` (filesystem coordinators, workspace state, window opener)
4. `src/controlled-player-presentation.ts` & `src/public/*` (webview UI, styling, badges)
5. `src/report-*` (glob policy, provenance, publisher)
6. `test/s*.test.mjs` & `test/scout-*.test.mjs` (all Scout and legacy milestone suites)
