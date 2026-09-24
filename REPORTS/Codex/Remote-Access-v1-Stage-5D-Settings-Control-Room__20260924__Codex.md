# Remote Access v1 — Stage 5D Settings Control Room

**Completed:** 2026-09-24 12:17 MDT  
**Timezone:** America/Edmonton · Calgary, Alberta  
**Agent:** Codex  
**Scope:** Stage 5D only

## Outcome

The local desktop Settings area now provides the Remote Access administrative control room. A paired remote phone instead receives a read-only `Remote Session` card and never renders the local administration surface. Existing backend Principal and default-deny route policy remain the authorization authority.

## Files changed

- `src/public/index.html`
  - Added the Remote Access Settings disclosure, local master switch, product-facing connection status, `Pair Another`, paired-device list, rename, revoke-one, and confirmed revoke-all controls.
  - Added the paired-phone read-only `Remote Session` presentation.
  - Added bounded neutral Settings styles for the new card and device rows.
  - Added the local/remote presentation gate and device-management controller wiring.
- `src/control-plane/daemon.ts`
  - Added the bounded product-status projection required by the Settings card: `remoteAccess.state`.
- `test/remote-access-v1-stage5d-settings.test.mjs` (new)
  - Added the Stage 5D acceptance suite.
- `test/s55-0-settings-hierarchy.test.mjs`
  - Registered the new Settings disclosure/card in the existing hierarchy and drag/order regression harness.

No pairing, QR, relay protocol, enrollment, device-registry, `pair.html`, or Stage 5C production behavior was changed.

## Settings UI implemented

The existing Settings visual language is reused through a normal card/disclosure with the existing draggable card-order infrastructure.

Local desktop presentation includes:

- `Remote Access` ON/OFF switch;
- connection state (`Off`, `Connecting`, `Online`, `Reconnecting`, or `Unavailable`);
- `Pair Another`;
- paired-phone list with label, paired time, and last-seen time;
- `Save Name` per phone;
- confirmed `Revoke` per phone;
- confirmed `Revoke All`;
- explicit `No phones are paired yet.` empty state.

No relay URL, relay domain, WSS terminology, enrollment credential, or infrastructure language is exposed.

## Master-switch behavior

The switch posts only:

```json
{
  "remoteAccess": {
    "enabled": true
  }
}
```

or the same existing key with `false`. No second enable flag or new preference key was introduced. The existing fresh default remains OFF. Existing daemon handling therefore continues to make this preference the Stage 4E liveness lease: ON holds the daemon alive; OFF returns it to normal idle-shutdown behavior.

## Product-facing connection status

The immediately relevant source had RelayClient health internally but no safe status projection for Settings. The smallest backend contract addition is:

```json
{
  "remoteAccess": {
    "state": "off | connecting | online | reconnecting | unavailable"
  }
}
```

This projection includes no URL, domain, enrollment credential, transport details, or logs. Settings refreshes it through the existing local `/api/status` seam.

## Pair Another

`Pair Another` calls exactly:

```js
window.SendToPhoneController.open()
```

There is no duplicate pairing-create request, QR generation, countdown, or modal implementation in Stage 5D.

## Device management

The local desktop uses only the existing local-only contracts:

- `GET /api/devices` — list;
- `PATCH /api/devices/:id` — rename;
- `DELETE /api/devices/:id` — revoke one after confirmation;
- `DELETE /api/devices` — revoke all after explicit destructive confirmation.

Each successful mutation refreshes only the paired-device list.

## Local versus remote presentation

On loopback/local desktop, the full control room renders. On a paired remote hostname, the control room is hidden before Settings becomes visible and the page renders only:

> Remote Session  
> Connected to Sideline Coach

Hostname context is used only for presentation. It grants no access. The focused route-security regression verified an authenticated remote-device principal still receives `403` for `GET /api/devices`, `DELETE /api/devices`, and the other local-only administration routes, including when it supplies an attempted Bearer elevation.

## Remote Disconnect This Phone

No safe existing server-backed current-session logout route exists. Stage 5D therefore intentionally omits `Disconnect This Phone`.

No JavaScript reads, overwrites, or deletes `document.cookie`, and no attempt is made to remove the HttpOnly `sl_dev` cookie. A future disconnect control requires a bounded server-backed current-device logout/revocation seam; general device-management authority was not widened to remote principals.

## Security verification

- Pair creation remains local-only.
- Device list, rename, revoke one, and revoke all remain local-only.
- Backend Principal and route classification remain authoritative.
- Remote frontend hiding is presentation only.
- Remote Bearer/query/header attempts do not elevate authority.
- `sl_dev` remains HttpOnly and untouched by frontend JavaScript.
- The status projection contains product state only and exposes no relay/enrollment data.
- Default-deny route coverage remains green.

## Verification results

1. `npm run compile`
   - PASS (TypeScript application + relay projects)
2. `node --test test/remote-access-v1-stage5d-settings.test.mjs`
   - Total 6; passed 6; failed 0; skipped 0; cancelled 0; todo 0
3. `node --test test/remote-access-v1-stage2.test.mjs`
   - Total 31; passed 30; failed 0; skipped 1 (platform-specific POSIX mode assertion); cancelled 0; todo 0
4. `node --test test/s55-0-settings-hierarchy.test.mjs`
   - Total 22; passed 22; failed 0; skipped 0; cancelled 0; todo 0
5. `node --test test/remote-access-v1-stage5c-pairing-modal.test.mjs`
   - Total 13; passed 13; failed 0; skipped 0; cancelled 0; todo 0
6. `npm run package`
   - PASS
   - VSIX: 438 entries, 1.09 MB
   - Existing VSIX content audit: PASS; required runtime assets present; developer evidence absent

Aggregate tests: **72 total; 71 passed; 0 failed; 1 skipped; 0 cancelled; 0 todo.**

## Deviations

One bounded production-file deviation from the primarily frontend surface was necessary: `src/control-plane/daemon.ts` now projects the already-known RelayClient state as the safe product-only `remoteAccess.state` contract. No broader backend architecture changed.

The remote current-session disconnect action is omitted because no safe existing server-backed HttpOnly-cookie logout seam exists. This is a bounded future seam, not a security relaxation.

## Verdict

**STAGE 5D COMPLETE — GREEN FOR 5E**
