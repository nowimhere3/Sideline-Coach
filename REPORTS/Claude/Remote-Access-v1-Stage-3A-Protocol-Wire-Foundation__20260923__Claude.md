**COMPLETED:** 2026-09-23 6:31 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 3A · Protocol & Wire Foundation

**Agent:** Claude Code (Sonnet 5, MEDIUM). No commit, no push.

## Files changed
- NEW `src/control-plane/relay-frames.ts`
- MOD `src/control-plane/remote-dispatch.ts`
- MOD `src/running-players.ts`
- NEW `test/remote-access-v1-stage3.test.mjs`

## Canonical frame ownership
`relay-frames.ts` is the single wire contract. Exports `RelayToHostFrame`, `HostToRelayFrame`, `TunnelFrame` plus each per-frame interface.
Frame types: Relay→Host `challenge`, `req`, `cancel`, `ping`, `goaway`; Host→Relay `hello`, `head`, `data`, `end`, `error`, `pong`.
Field names/encodings exactly per Field Packet (`hello.v: 1`, hex `publicKey`, base64url `sig`/`nonce`, string ids, `body?`/`bodyB64?`, `chunk?`/`chunkB64?`).

## Stage 2 compatibility
`FrameReq = RelayReqFrame`; `FrameRes = HostHeadFrame | HostDataFrame | HostEndFrame | HostErrorFrame` (type aliases, no duplicate interfaces). `InProcessRemoteAdapter` logic otherwise untouched (principal minting, `sl_dev` auth, expectedOrigin, sliding cookie, shims, SSE, cancel). Existing Stage 1/2 tests pass unchanged.
Note: `FrameReq` now carries the `t: 'req'` discriminant; Stage 2 tests pass frames without `t` (JS, not type-checked), and the adapter doesn't read it.

## Header allowlist
Exported `ALLOWED_REQUEST_HEADERS` (accept, content-type, cookie, origin, x-sideline-action, last-event-id, user-agent) replaces the denylist. Names lowercased, everything else dropped. `cookie` is destructured out after allowlisting: used only to extract `sl_dev`, never placed on the request handed to the daemon. `?token=` rejection in daemon untouched.

## Preferences
`CoachPreferences.remoteAccess?: { enabled: boolean }`; `DEFAULT_PREFERENCES.remoteAccess = { enabled: false }`; `loadPreferences` yields `{ enabled: parsed.remoteAccess?.enabled === true }`, so legacy files without the key (and non-`true` values) load as disabled. No `relayDomain`, no UI, no RelayClient wiring, no network.

## Windows
Pure TypeScript types + in-process logic; no sockets, no POSIX assumptions.

## Tests
- `npm run compile`: clean.
- `remote-access-v1-stage3.test.mjs`: 3 tests, 3 pass, 0 fail (RA3A-1 frame contract, RA3A-2 header allowlist via the real adapter, RA3A-3 preference default/compat).
- Stage 1 + Stage 2: 40 tests, 39 pass, 0 fail, 1 skipped (expected Windows POSIX-permission skip).

## Deviations
None. (`daemon.ts` preferences POST handling was not inspected/changed; it is Slice 3E's concern.)

## Verdict
Slice 3A is **GREEN** for Slice 3B.

**COMPLETED:** 2026-09-23 6:31 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-3A-Protocol-Wire-Foundation__20260923__Claude.md
