# SCOUT STAGE 2 RECONNAISSANCE REPORT
## Play: remote-access-v1-stage2-recon-20260923-160824
## Scout: stage2-regression-acceptance-map
## Model: openrouter/cohere/north-mini-code:free

**SCout is reconnaissance, not final architectural authority.**

---

## KEY DISCOVERIES

### Current State Analysis
**FACT:** Stage 1 security is GREEN with 51/51 regression gate passed. The existing `remote-access-v1-stage1.test.mjs` demonstrates comprehensive Stage 1 testing including:
- Principal model implementation
- Route default-deny classification  
- Remote redaction
- Remote CSRF expectedOrigin seam
- SSE heartbeat and cookie auth

**FACT:** The ADR (Architecture Decision Record) provides complete Stage 2 specification with accepted scope:
- Host key + hostPublicId generation/storage
- Pairing creation/exchange with local-principal-only restrictions
- DeviceRegistry with hashed device tokens
- List/rename/revoke/revoke-all device management
- 30-day sliding expiry
- In-process remote-device dispatch
- Fake frame transport tests
- Existing allowlist/redaction enforcement

**INFERENCE:** Stage 2 implementation requires creating new functionality across multiple domains, with significant dependencies on existing Stage 1 infrastructure.

---

## 1. IMPLEMENTATION SLICES IN SAFEST ORDER

### Slice 1: Host Identity Infrastructure
**Scope:** Generate/Store host keypair, compute hostPublicId
**Dependencies:** None (independent filesystem setup)
**Risk:** LOW - purely local storage, no security boundaries

### Slice 2: Pairing Secret Management  
**Scope:** Local-principal pairing secret creation, hashing, validation
**Dependencies:** Slice 1 (needs host identity)
**Risk:** MEDIUM - security-critical secret handling

### Slice 3: DeviceRegistry Core
**Scope:** Device data structure, persistence, CRUD operations
**Dependencies:** Slice 2 (pairing creates devices)
**Risk:** MEDIUM - state management complexity

### Slice 4: Remote-Device Principal Dispatch
**Scope:** In-process frame transport adapter, Principal injection
**Dependencies:** Slices 1-3 (needs device validation)
**Risk:** HIGH - protocol adapter complexity

### Slice 5: Fake Frame Transport Tests
**Scope:** Test infrastructure for Stage 2 acceptance gates
**Dependencies:** Slice 4 (tested functionality)
**Risk:** LOW - test infrastructure

---

## 2. DEPENDENCY GRAPH

```
┌─────────────────┐    ┌─────────────────┐
│   File System   │    │   Host Identity │
│   Conventions   │───▶│  (host-key.json)│
└─────────────────┘    └─────────────────┘
                               │
                               ▼
┌─────────────────┐    ┌─────────────────┐
│  Pairing Logic  │───▶│ DeviceRegistry  │
│ (local-only)    │    │ (CRUD operations)│
└─────────────────┘    └─────────────────┘
                               │
                               ▼
┌─────────────────┐    ┌─────────────────┐
│ Remote-Redaction │───▶│ Dispatch Adapter│
│ (Stage 1 ready) │    │ (remote-device)  │
└─────────────────┘    └─────────────────┘
```

---

## 3. MINIMUM FOCUSED TESTS AFTER EACH SLICE

### After Slice 1:
```javascript
// Host key generation/persistence test
test('host key stored with owner-only permissions', async () => {
  // Verify ~/.sideline/remote/host-key.json exists
  // Verify hostPublicId format (base32(sha256(publicKey))[0..20])
  // Verify permissions are 0o600
});
```

### After Slice 2:
```javascript
// Pairing secret lifecycle test
test('pairing secret single-use 5-minute TTL', async () => {
  // Local-principal creates pairing
  // Secret hashed, never stored raw  
  // Successful exchange → device cookie
  // Reuse attempt → failure
  // 5th wrong code → pairing burned
});
```

### After Slice 3:
```javascript
// DeviceRegistry operations test
test('device list/rename/revoke/revoke-all', async () => {
  // List devices endpoint
  // Rename device label
  // Revoke individual device
  // Revoke all devices
});
```

### After Slice 4:
```javascript
// Remote dispatch adapter test
test('remote-device principal injection', async () => {
  // Paired device authorizes remote-read
  // Local-only routes denied for remote
  // Remote admin Bearer ignored
  // Remote ?token ignored
});
```

### After Slice 5:
```javascript
// Stage 2 acceptance gates test
test('pairing + auth isolation + revocation + redaction + streaming', async () => {
  // Full Stage 2 acceptance criteria from ADR
});
```

---

## 4. MINIMUM ADJACENT REGRESSION SUITE AFTER STAGE 2

**Existing tests to preserve:**
- All 51 Stage 1 regression tests (51/51)
- All Scout test suites (scout-formation, scout-continuation, etc.)
- All player routing and dispatch tests

**New regression tests:**
- Stage 2 acceptance gate tests (minimum 35 tests covering all gates)
- Integration tests verifying Stage 1 + Stage 2 compatibility

---

## 5. BEHAVIORAL CONTRACTS STAGE 2 MUST NOT CHANGE

**From ADR §2.5, Stage 1:**
- `POST /api/session` exchanges fragment for httpOnly cookie
- Browser uses cookie, never puts credentials in URLs
- CORS: same-origin only
- CSRF: `X-Sideline-Action: 1` + matching Origin
- SSE: 15s heartbeat, `no-transform`, immediate flush
- Timing-safe comparison for secrets
- Route classification: default-deny table

**Additional Stage 2 contracts:**
- Host key stored at `~/.sideline/remote/host-key.json` with 0o600
- Pairing secret: 128-bit random, hashed, single-use, 5min TTL
- Device token: 256-bit, store SHA-256 hash only
- 30-day sliding idle expiry
- Device management: local-principal only
- Remote-device: `in-process` authenticatedBy, never `bearer` or `cookie`

---

## 6. EXISTING TESTS LIKELY AFFECTED

**MODIFIED:**
- `remote-access-v1-stage1.test.mjs` - may need updated expectations for Stage 2 behavior

**NEWLY REQUIRED:**
- `remote-access-v1-stage2.test.mjs` - comprehensive Stage 2 tests

**UNAFFECTED:**
- All Scout formation/continuance tests
- All player discovery/routing tests
- All game lifecycle tests

---

## 7. TESTS KNOWN UNRELATED THAT PREMIUM PLAYER SHOULD NOT INVESTIGATE

**Stage 1 regression tests (preserve existing):**
- `scout-formation.test.mjs`
- `scout-continuation.test.mjs`
- `player-discovery.test.mjs`
- `game-foundation.test.mjs`
- `live-player-terminal-v02-transport.test.mjs`

**Stage 2 integration tests (let premium Player handle):**
- Pairing endpoint tests
- DeviceRegistry CRUD tests
- Remote dispatch adapter tests
- Acceptance gate tests

---

## 8. PERSISTENCE/RESTART ACCEPTANCE TESTS

### Host Key Persistence
```javascript
test('host key survives daemon restart', async () => {
  const dir = makeTempDir();
  const daemon1 = new ControlPlaneDaemon({ dir, port: 41700 });
  await daemon1.start();
  const hostKey1 = readHostKey(dir);
  
  await daemon1.stop();
  
  const daemon2 = new ControlPlaneDaemon({ dir, port: 41701 });
  await daemon2.start();
  const hostKey2 = readHostKey(dir);
  
  assert.deepEqual(hostKey1, hostKey2, 'host key persisted across restarts');
});
```

### DeviceRegistry Persistence
```javascript
test('device registry survives daemon restart', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41702 });
  await daemon.start();
  
  // Create device via pairing flow
  await createDeviceViaPairing(daemon.port);
  
  await daemon.stop();
  
  const daemon2 = new ControlPlaneDaemon({ dir, port: 41703 });
  await daemon2.start();
  
  // Device should still be accessible
  assert.ok(deviceExists(daemon2.port), 'devices persisted across restarts');
});
```

---

## 9. EXPIRY/REVOCATION ACCEPTANCE TESTS

### Pairing Secret Expiry
```javascript
test('pairing secret expires after 5 minutes', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41704 });
  await daemon.start();
  
  const secret = generatePairingSecret();
  storeSecretHashed(dir, secret);
  
  // Should succeed immediately
  await exchangeSecret(daemon.port, secret);
  
  // Wait 5 minutes + 1 second
  await wait(5 * 60 * 1000 + 1000);
  
  // Should now fail
  assert.equal(exchangeSecret(daemon.port, secret).status, 401);
});
```

### Device Revocation
```javascript
test('revoke device → next request unauthorized', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41705 });
  await daemon.start();
  
  // Create and pair device
  const deviceId = await createDeviceViaPairing(daemon.port);
  
  // Revoke device (local-principal only)
  await revokeDevice(daemon.port, deviceId);
  
  // Next request should be unauthorized
  const status = await statusRequestWithDeviceCookie(daemon.port, deviceId);
  assert.equal(status, 401, 'revoked device receives 401');
});
```

---

## 10. SECURITY-ABUSE CASES WORTH TESTING

### Host Key Security
```javascript
test('host key file permissions prevent unauthorized access', async () => {
  const dir = makeTempDir();
  const daemon = new ControlPlaneDaemon({ dir, port: 41706 });
  await daemon.start();
  
  // Verify file permissions are 0o600
  const keyPath = path.join(dir, 'host-key.json');
  const stats = fs.statSync(keyPath);
  assert.equal(stats.mode & 0o777, 0o600, 'host key has owner-only permissions');
});
```

### Pairing Security
```javascript
test('pairing secret never exposed in logs or network', async () => {
  // Verify secret is hashed before storage
  // Verify no logs contain raw secret
  // Verify fragment secret cleared after exchange
  // Verify typed code burns after 5 failures
});
```

### Device Token Security
```javascript
test('device token hash never exposed', async () => {
  // Verify only SHA-256 hash stored
  // Verify raw token never logged
  // Verify cookie transport is httpOnly, Secure, SameSite=Lax
});
```

---

## 11. EXPLICIT STAGE 2 GO/NO-GO CHECKLIST

### GO Conditions:
- [ ] Host key generated and stored with proper permissions
- [ ] Pairing secret creation works (local-principal only)
- [ ] DeviceRegistry can store/revoke/list/rename devices  
- [ ] 30-day sliding expiry implemented and tested
- [ ] Remote-device principal injection works
- [ ] All Stage 2 acceptance gates pass
- [ ] Integration with Stage 1 is seamless
- [ ] No regression in existing Stage 1 functionality

### NO-GO Triggers:
- [ ] Host key file permissions incorrect
- [ ] Pairing secret exposed in any form
- [ ] Device management operations fail
- [ ] Remote-device cannot bypass local-only routes
- [ ] Any Stage 2 acceptance gate fails
- [ ] Security vulnerability discovered

---

## 12. EXACT STOP LINE SEPARATING STAGE 2 FROM STAGE 3

**Stage 2 STOP Line:** After the fake frame transport tests pass and all Stage 2 acceptance gates are GREEN.

**Implementation boundary:**
```typescript
// Stage 2 dispatch adapter (src/control-plane/dispatch-adapter.ts)
export class DispatchAdapter {
  // In-process adapter for Stage 2 only
  // Never builds real relay
  // Only used in tests via fake transport
}

// Stage 3 RelayClient (src/control-plane/relay-client.ts)  
export class RelayClient {
  // Real WebSocket client for relay/v1
  // Stage 3 implementation
}
```

**Transition point:** When fake frame transport is removed and real RelayClient is implemented.

---

## 13. RECOMMENDED IMPLEMENTATION PLAYER/EFFORT

### Player Assignment (Following SOP):
- **Architecture design:** Claude Opus (high reasoning)
- **Core implementation:** Codex (implementation worker)
- **Test implementation:** Codex (test writer)
- **Security review:** Opus (security validation)

### Effort Estimation:
- **Slice 1:** 2-3 person-days (filesystem ops)
- **Slice 2:** 4-5 person-days (security-critical pairing)  
- **Slice 3:** 3-4 person-days (state management)
- **Slice 4:** 6-8 person-days (complex adapter)
- **Slice 5:** 2-3 person-days (test infrastructure)
- **Total:** 17-23 person-days

### Anti-Gravity Compression Opportunities:
- Reuse existing daemon.ts HTTP request/response patterns
- Leverage existing Principal type from request-security.ts
- Utilize existing route classification from remote-routes.ts
- Adopt existing redaction patterns from remote-redaction.ts

---

## IMPORTANT FILES / PATHS

**Source Files to Create:**
- `src/control-plane/host-identity.ts` - Host key generation/storage
- `src/control-plane/pairing.ts` - Pairing secret management
- `src/control-plane/device-registry.ts` - Device CRUD operations
- `src/control-plane/dispatch-adapter.ts` - Remote-device adapter
- `src/control-plane/fake-transport.ts` - Test infrastructure

**Source Files to Modify:**
- `src/control-plane/daemon.ts` - Add host key initialization
- `src/control-plane/remote-routes.ts` - Add pairing/device routes
- `src/control-plane/router.ts` - Add remote-device routing
- `src/public/index.html` - Add pairing UI (Stage 5 deferred)

**Test Files to Create:**
- `test/remote-access-v1-stage2.test.mjs` - Comprehensive Stage 2 tests
- `test/remote-access-v1-stage2-acceptance.test.mjs` - Acceptance gate tests

---

## LIMITATIONS

**Known Unknowns:**
1. Exact Windows vs POSIX permission implementation
2. Performance characteristics of DeviceRegistry operations  
3. Concurrency handling for pairing flows
4. Integration points with existing Scout formation

**Required Architectural Decisions:**
1. DeviceRegistry data shape (fields, ordering, indexing)
2. Pairing secret entropy and format
3. Device token cookie naming and scope
4. ExpectedOrigin validation timing and error handling

---

## CONCLUSION

**Stage 2 Implementation Path:** Safe to proceed with Slice 1→5 in order defined. Each slice builds on previous ones with increasing complexity.

**Risk Assessment:** Medium overall, primarily concentrated in Slice 4 (dispatch adapter) and security aspects of pairing.

**Recommended Timeline:** 2-3 weeks for full implementation with 2 premium Players.

**Next Scout Action:** Focus on exact implementation coordinates and seam identification for each slice. Premium Player can begin with Slice 1 while Scout maps remaining unknowns.

---

*REPORT FILE: SCOUT-remote-access-v1-stage2-regression-acceptance-map.md*
*REPORT TIMESTAMP: 2026-09-23 16:08 MDT*
