**COMPLETED:** 2026-09-23 6:55 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 3D · Transport Resilience & Flow Control

**Agent:** Claude Code (Sonnet 5, MEDIUM). No commit, no push.

## Files changed
- MOD `src/control-plane/relay-client.ts` (reworked around a per-connection `Conn`)
- MOD `relay/reference-relay.ts`
- MOD `test/remote-access-v1-stage3.test.mjs` (added RA3D-1…12)

No daemon wiring; SSE `: hb` code untouched; canonical wire schema unchanged.

## Heartbeat
- **Relay:** one interval (`pingIntervalMs`, default 20 s) pings VERIFIED host sockets only with `{t:'ping', ts: Date.now()}`. `lastPongAt` is set at verification and on each valid `pong`. A host at ≥ 2 intervals (40 s default) without a pong is closed `4008` (hard `terminate()` 1 s later if the closing handshake stalls). Unverified sockets are never pinged. The timer starts in `listen()` and is cleared in `close()`.
- **Host:** `ping` is answered immediately with `{t:'pong', ts}` (echoing `ts` exactly), sent on the control path so backpressure can never delay it. A watchdog (`watchdogMs`, default 60 s) is armed at hello and re-armed on every valid post-hello relay frame; on expiry it `terminate()`s the socket and the normal reconnect path runs.

## Healthy-handshake determination
Socket open and hello-sent do NOT count. The first valid post-hello relay frame (`ping`, `req`, `cancel` or `goaway`) marks the connection healthy and resets the attempt counter to 0. RA3D-4 proves an open+hello+drop leaves the counter untouched (delays 1 s, 2 s, 5 s) and a hello answered by a ping resets it (next delay 1 s).

## Reconnect / backoff
Any unexpected close (relay drop, watchdog, protocol error, queue overflow, non-superseded goaway) cancels every in-flight adapter request, clears connection timers/queues, and schedules a reconnect: base 1/2/5/10/30/30… s × uniform 0.8–1.2 (`computeBackoffMs`, exported). Interrupted HTTP requests are never retried. `start()` now resolves once the first attempt settles; a failed first attempt is retried instead of thrown. Test seams: `timers` (reconnect timer only), `random`, `backoffScheduleMs`, `watchdogMs`, `flow`, `createSocket`. `stop()` clears the reconnect timer, cancels in-flight work, closes 1000, and the client stays permanently unusable.

## goaway
`reason === 'superseded'` → `stop()` (no reconnect, RA3D-7 shows the replacement connection is left alone). Any other reason → close this socket and reconnect on the normal backoff.

## Real browser-cancel flow
ReferenceRelay `res.on('close')`: if the request is still in flight it sends `{t:'cancel', id}` to the exact host socket and releases relay state; finished/cancelled/unknown ids are no-ops. RA3D-8: browser aborts SSE → cancel → RelayClient → `adapter.cancel` → daemon `sseClients` 0, relay and adapter maps empty, tunnel intact. RelayClient also drops any still-queued (unsent) frames of a cancelled id.

## Relay queue cap
After each `data` write, `res.writableLength > 1 MiB` (1,048,576) → relay deletes the request, sends `cancel` to the host, logs and destroys only that response. RA3D-9 uses a raw socket that never reads: the host receives exactly one `cancel`, a concurrent request completes normally, and the host connection stays up.

## Host backpressure
Response frames go through an ordered queue. If `ws.bufferedAmount > 4 MiB` the connection is marked paused and further frames queue; it resumes once `bufferedAmount <= 2 MiB` (hysteresis: 3 MiB stays paused). Resume is checked in each `ws.send` completion callback and by a 25 ms bounded poll timer that exists only while frames are queued. No `ws.on('drain')`, and no TCP-socket hooks. `hello`/`pong`/small control errors bypass the queue. RA3D-10 drives a controllable `bufferedAmount`: 5 broadcasts held while paused, released at 2 MiB in order 1–5 with none lost.

## Host queue hard bound
Queued bytes are counted per frame; if they exceed 8 MiB the tunnel is failed closed (`terminate()`), which runs the normal disconnect cleanup and reconnect. Nothing is dropped silently while the connection lives. RA3D-11: 6 MiB queued stays allowed; the third 3 MiB frame trips the bound; queue, active set, adapter map and SSE subscriber all return to 0.

## Cleanup
`teardown(conn)` (idempotent) clears watchdog and pump timers, queue and byte count, and cancels/clears active requests; the reconnect timer is cleared by `stop()`; relay clears its ping interval, `lastPongAt`, hosts/pending/inflight on `close()`, and per-socket state on socket close. RA3D-12 asserts the zeroed `stats`, empty adapter/daemon/relay maps and a cleared relay ping timer.

## Windows compatibility
Loopback TCP `ws` only; no POSIX-only calls. All tests ran on Windows; the flow-control suite runs stably (3 consecutive full runs green).

## Tests (exact counts)
- `npm run compile`: clean.
- `remote-access-v1-stage3.test.mjs`: 35 tests, 35 pass, 0 fail (3 × 3A, 13 × 3B, 7 × 3C, 12 × 3D).
- Stage 1 + Stage 2: 40 tests, 39 pass, 0 fail, 1 skipped (expected Windows POSIX-permission skip).

## Deviations
- RA3C-4 (in-test peer) was left as is; the real-relay cancel path is proven by the new RA3D-8. RA3C-4 still covers frame-level idempotency and duplicate-id handling.
- Backpressure/queue-bound tests fake `bufferedAmount` on a real socket (via `createSocket`) instead of pushing multi-MiB through the kernel; the 4/2/8 MiB thresholds are the production defaults.
- Fail-closed at 8 MiB also reconnects (it is treated as an unexpected disconnect).
- Relay cap uses `res.writableLength` (includes socket-buffered bytes), so a stalled browser is cut only after kernel/socket buffers fill plus 1 MiB.

## Verdict
Slice 3D is **GREEN** for Slice 3E.

**COMPLETED:** 2026-09-23 6:55 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-3D-Resilience-Flow-Control__20260923__Claude.md
