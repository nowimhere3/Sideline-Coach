**COMPLETED:** 2026-09-23 6:48 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 3C · Host RelayClient Core

**Agent:** Claude Code (Sonnet 5, MEDIUM). No commit, no push.

## Files changed
- NEW `src/control-plane/relay-client.ts`
- MOD `test/remote-access-v1-stage3.test.mjs` (added RA3C-1, 1b, 1c, 2, 3, 4, 5)

No daemon wiring; no other production file touched.

## RelayClient API
```ts
new RelayClient({ relayUrl, relayDomain, identity: HostIdentity, daemon, deviceRegistry })
client.expectedOrigin   // readonly
client.adapter          // the Stage 2 InProcessRemoteAdapter it owns
await client.start()    // one outbound ws connection; resolves on open; rejects if stopped/already started
await client.stop()     // cancels in-flight requests, closes 1000, permanently unusable afterwards
```
Options are declared in the same file (no separate options module).

## expectedOrigin derivation
`https://h-${identity.hostPublicId}.${relayDomain}` computed once in the constructor from trusted configuration and handed to the adapter. Never derived from request headers. Tests connect over `ws://127.0.0.1:<port>/tunnel/v1` with `relayDomain: 'localhost'`.

## Host-key signing
Uses the existing durable `HostIdentity` (no new key, stored format untouched). `publicKey` = lowercase hex of the raw 32-byte key (from the key's JWK `x`). Signature = `crypto.sign(null, rawNonceBytes, privateKey)` base64url. RA3C-1b verifies the signature is valid over the decoded raw bytes and NOT valid over the encoded nonce string.

## Challenge / hello flow
`challenge` nonce must match `/^[A-Za-z0-9_-]{43}$/` and decode to exactly 32 bytes; otherwise close `1002` with no hello sent (RA3C-1c: short, 31-byte and non-base64url nonces). A second challenge on the same connection is a protocol error. Hello is `{t:'hello', v:1, hostPublicId, publicKey, sig, client:'sideline/1.0'}`. The real ReferenceRelay verified it and registered the real hostPublicId (RA3C-1).

## Request / response path
`req` (only after hello) is shape-validated (string id/method, `/`-prefixed path, string-only headers, string `body`/`bodyB64`) and passed to `InProcessRemoteAdapter.dispatch`. Each adapter frame (`head`/`data`/`end`/`error`) is serialized to the socket the instant it is emitted; nothing is buffered. Duplicate live ids get `error: duplicate_id`. `bodyB64` is accepted only when it round-trips as UTF-8 (adapter carries text bodies), otherwise `error: unsupported_body`. A dispatch rejection becomes `error: dispatch_failed`.

## Adapter authority preserved
RelayClient never reads `sl_dev`, never builds a Principal, and adds no router, route classification, redaction or CSRF logic. It only forwards into the Stage 2 adapter, which remains the sole authenticator.

## Authenticated remote route (RA3C-2/3)
Through ReferenceRelay → RelayClient → adapter → real daemon: `/api/status` with a valid paired `sl_dev` = 200 with sliding `Set-Cookie … Max-Age=2592000`; no cookie = 401; forged cookie = 401; Bearer alone = 401; `?token=` = 401.

## Local-only deny (RA3C-3)
`/api/devices` and `/api/diagnostics` with a valid device cookie = 403 through the real relay path, also with a `Bearer` header added (stripped by the relay allowlist).

## Streaming / cancel
RA3C-5: a real `/api/events` SSE stream yields ≥4 separate `data` frames (`hello`, `status`, `ai-health`, `execution`) with no `end`; a later `daemon.broadcast` arrives as its own frame; through the reference relay the browser receives it while the stream stays open, separated by >100 ms. RA3C-4: canonical `cancel` → `adapter.cancel(id)` → daemon `sseClients` back to 0, exactly one `end` frame, nothing streams afterwards, repeat/unknown cancels are no-ops and the tunnel stays open. `stop()` also cancels remaining in-flight streams.

## Frame safety
Non-JSON, non-object, unknown `t`, `req`/`cancel` before hello, or malformed `req` → close `1002`. `ping` and `goaway` (canonical, after hello) are ignored for now; their handling is Slice 3D.

## Windows compatibility
`ws` over loopback TCP only; all tests ran on Windows.

## Tests (exact counts)
- `npm run compile`: clean.
- `remote-access-v1-stage3.test.mjs`: 23 tests, 23 pass, 0 fail (3 × 3A, 13 × 3B, 7 × 3C).
- Stage 1 + Stage 2: 40 tests, 39 pass, 0 fail, 1 skipped (expected Windows POSIX-permission skip).

## Deviations
- RA3C-4 uses a small in-test WebSocket peer instead of ReferenceRelay, because ReferenceRelay does not yet emit `cancel` frames (browser-disconnect cancel is 3D). The other real-path tests use ReferenceRelay.
- `start()` resolves when the socket opens, not when the relay has registered the host (the protocol has no ack); tests poll `relay.isHostConnected`.
- Stopped clients are permanently unusable (`start()` rejects).

## Verdict
Slice 3C is **GREEN** for Slice 3D.

**COMPLETED:** 2026-09-23 6:48 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-3C-Host-RelayClient-Core__20260923__Claude.md
