**COMPLETED:** 2026-09-23 4:39 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 · Stage 2B — Pairing Store & Device Registry

**Agent:** Claude Code (Sonnet 5, medium) · No commit, no push.

## Files changed
- `src/control-plane/pairing.ts` (new)
- `src/control-plane/device-registry.ts` (new)
- `src/control-plane/remote-routes.ts` (4 policy rows added)
- `src/control-plane/daemon.ts` (imports, two fields, constructor init, exchange block, local pairing/device handlers)
- `test/remote-access-v1-stage2.test.mjs` (RA2B-1…8 appended to the 2A tests)

## Pairing implementation
`PairingStore` is memory-only (a fresh store, e.g. after daemon restart, has no pairings). `createPairing()` returns `{ pairingId, secret, code, expiresAt }`: secret = `randomBytes(16)` base64url (128 bits); TTL 5 min. Only `sha256(secret)` and `sha256(normalizedCode)` are kept (`secretHash`, `codeHash`). `exchange({secret|code})` hashes the candidate and compares with `timingSafeSecretEqual`; success deletes the pairing (single use, consumes both methods); each wrong attempt increments `failedAttempts`, and the 5th deletes the pairing (`burned`); expired records are deleted on contact. Clock is injectable for tests.

## Fallback code
8 chars from `23456789ABCDEFGHJKMNPQRSTVWXYZ` (30 chars), drawn by rejection sampling from `randomBytes` (uniform), independent of the QR secret. Displayed as `XXXX-XXXX`; normalized (uppercase, non-alphanumerics stripped) before hashing.

## DeviceRegistry implementation
File `<dir>/remote/devices.json` = `{ version: 1, devices: [...] }`. Record contains ONLY `deviceId` (16 random bytes hex), `tokenHash` (sha256 hex of a 256-bit base64url token), `label`, `createdAt`, `lastSeenAt`. `createDevice` returns the raw token once. `authenticate` compares all records with `timingSafeSecretEqual`, rejects and prunes when idle > 30 days, otherwise slides `lastSeenAt` and persists. `list()` returns records without `tokenHash`. Also `rename`, `revoke`, `revokeAll`. Labels are control-char-stripped, trimmed, capped at 60 chars.

## Persistence behavior
Temp file (`wx`, `mode 0o600`) → `renameSync`, dir `0o700`. Missing/corrupt `devices.json` loads as empty (fail-safe: no credential is honoured; the next change replaces the file). Verified the raw token never appears in the file.

## Windows compatibility
No POSIX-only calls. `rename` over an existing file works on Windows; modes are requested but best-effort there. **Genuine limitation:** on Windows Node's `0o600/0o700` do not translate to NTFS ACLs, so `host-key.json` and `devices.json` rely on the user-profile directory ACL (`~/.sideline` under the user profile) for owner-only protection; hardening with explicit ACLs was out of scope for this slice. All new tests run and pass on Windows; only the 2A POSIX-mode assertion is skipped there.

## Routes and classifications
| Route | Access | Handling |
| :--- | :--- | :--- |
| `POST /api/pairing/create` | `local-only` | returns `{ success, pairingId, secret, code, expiresAt }` |
| `POST /api/pairing/exchange` | `public` (secret-gated) | handled before the principal check like `/api/session`; 401 on any failure, no cookie |
| `GET /api/devices` | `local-only` | list (no hashes) |
| `DELETE /api/devices` | `local-only` | revoke all |
| `PATCH /api/devices/:id` | `local-only` | rename, 404 if unknown |
| `DELETE /api/devices/:id` | `local-only` | revoke, 404 if unknown |

Exchange success sets `sl_dev=<raw>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` and returns `{ success: true, deviceId }`.

## Security invariants
- `resolvePrincipal()`, Bearer, `sl_local`, Stage 1 principal/CSRF rules unchanged; a loopback request with `sl_dev` gets 401 on `/api/status` (tested).
- `expectedOrigin` is not stored in the registry.
- Remote-device principals get 403 on every pairing-create/device route (tested through the injected-principal seam).
- No dispatch adapter, `dispatchRemoteRequest`, transport, relay, or UI was added.

## Tests and counts
`npm run compile` — clean.
`node --test test/remote-access-v1-stage2.test.mjs` — 12 tests: 11 pass, 0 fail, 1 skipped (RA2A-4, POSIX mode, Windows).
`node --test test/remote-access-v1-stage1.test.mjs` — 9 tests: 9 pass, 0 fail (RA1-3/RA1-4 route classification green with the 6 new routes).
RA2B-1 create local-only + remote/unauth denied · RA2B-2 single use/reuse/fallback code · RA2B-3 expiry + alphabet · RA2B-4 5-failure burn of both methods · RA2B-5 hashes only in memory · RA2B-6 cookie flags, token hash only on disk, loopback `sl_dev` denied · RA2B-7 list/rename/revoke/revoke-all · RA2B-8 30-day sliding expiry, slide, reload.

## Deviations from the Field Packet
1. Cookie carries an extra `Max-Age=2592000` (30 days) so the pairing survives browser restarts; the four required attributes are present.
2. At most one active pairing: creating a new one supersedes the previous. Needed because a wrong secret/code cannot be attributed to a specific pairing, so failures count against the single active one.
3. `exchange` on a burned/expired/absent pairing returns a generic 401 (no distinction exposed over HTTP).
4. Corrupt `devices.json` loads empty rather than throwing (deliberately fail-safe, unlike host identity).

## Verdict
**Slice 2B is GREEN for Slice 2C.**

**COMPLETED:** 2026-09-23 4:39 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-2B-Pairing-Device-Registry__20260923__Claude.md
