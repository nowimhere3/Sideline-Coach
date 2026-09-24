# Remote Access v1 · Stage 2A — Host Identity Foundation

**Agent:** Claude Code (Sonnet 5, medium) · **Date:** 2026-09-23 · No commit, no push.

## Files changed
- `src/control-plane/host-identity.ts` (new)
- `test/remote-access-v1-stage2.test.mjs` (new, Slice 2A tests only)

No other files touched. No Pairing / DeviceRegistry / dispatch / relay work started.

## Key serialization
Raw 32-byte keys, no PKCS8/SPKI needed. Node exposes Ed25519 raw bytes through JWK export (`x` = public, `d` = private seed, base64url), which I convert to lowercase hex. Stored schema is exactly the Field Packet's `StoredHostKey`:
`{ version: 1, hostPublicId, publicKeyHex (64 hex), privateKeyHex (64 hex, raw seed), createdAt }`.
Reload rebuilds the key with `createPrivateKey({ key: { kty:'OKP', crv:'Ed25519', d, x }, format:'jwk' })`.

## hostPublicId derivation
`base32Lower(sha256(rawPublicKey32)).slice(0, 20)`, RFC 4648 alphabet `abcdefghijklmnopqrstuvwxyz234567`, no padding (hand-written encoder, exported as `base32Lower` / `deriveHostPublicId`).

## Persistence behavior
- `HostIdentityManager.ensureIdentity(remoteDir): HostIdentity` returns `{ hostPublicId, publicKey, privateKey, createdAt }`.
- File: `<remoteDir>/host-key.json`; parent dir created with `mode 0o700`.
- File absent → generate + persist. File present → load and validate; never regenerate.
- Fail closed (throws `Refusing to overwrite existing host key at …: <reason>`) on: unreadable file, bad JSON, wrong version/schema, malformed hex, unusable key material, public key not matching private key, or `hostPublicId` not matching the public key. The file is left byte-for-byte untouched.

## Atomic write behavior
Written to a unique `host-key.json.<pid>.<random>.tmp` with `flag: 'wx'`, `mode 0o600`, then published and the temp removed.

## Tests and results
`npm run compile` — clean.
`node --test test/remote-access-v1-stage2.test.mjs` — 4 tests: 3 pass, 0 fail, 1 skipped.
- RA2A-1 generation, 20-char `[a-z2-7]`, independent base32 re-derivation, working sign/verify pair, no temp file left.
- RA2A-2 reload returns identical `hostPublicId`/`createdAt`, file unchanged.
- RA2A-3 five corrupt/inconsistent variants each throw and leave the file untouched.
- RA2A-4 mode `0o600` / dir not group-world accessible — **skipped on Windows** (POSIX mode not meaningfully exposed); mode is still requested in code.

## Deviations from the Field Packet
1. Publish step uses `fs.linkSync(tmp, file)` + unlink instead of `fs.renameSync`. Rename silently replaces an existing file on a create race; link fails with `EEXIST`, and that path then loads the winner's key. Same temp-file atomicity, stronger no-overwrite guarantee.
2. Temp name is `pid + random` rather than `instanceNonce` (this module has no daemon nonce).
3. Validation is stricter than the packet requires (cross-checks public/private/`hostPublicId` consistency) — still fail-closed only.

## Verdict
**Slice 2A is GREEN for Slice 2B**, with the caveat that the POSIX mode assertion could not run on this Windows host.
