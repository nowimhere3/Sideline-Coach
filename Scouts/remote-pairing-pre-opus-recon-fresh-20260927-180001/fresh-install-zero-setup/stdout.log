Now I have a complete picture. Let me compile the reconnaissance report.

---

# SCOUT REPORT: Fresh-Install Zero-Setup Remote Pairing Flow

**Play ID:** remote-pairing-pre-opus-recon-fresh-20260927-180001  
**Scout ID:** fresh-install-zero-setup  
**Agent:** sideline-scout-deep  
**Model:** openrouter/nvidia/nemotron-3-ultra-550b-a55b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Report Type:** READ-ONLY RECONNAISSANCE — not final architectural authority  

---

## RESULT

**NO** — A completely fresh Sideline Coach installation **cannot** achieve the flow `install → launch → click Send to Phone → QR appears → scan → phone connects` with zero developer intervention.

**Exact First Failing Seam:** Production relay enrollment gate at `relay/index.ts:38-40` — the relay rejects the host tunnel upgrade with **403 Forbidden** because no enrollment key is presented, and the production relay is deployed with `ALLOW_OPEN_ENROLLMENT !== 'true'`.

---

## KEY DISCOVERIES

| # | Discovery | Evidence |
|---|-----------|----------|
| 1 | Production relay URL/domain are baked in (`wss://relay.remote.mysidelinecoach.com/tunnel/v1`, `remote.mysidelinecoach.com`) | `src/control-plane/remote-bootstrap.ts:4-6` |
| 2 | Private-beta enrollment secret lives in `<sidelineDir>/remote/beta-enrollment.json` — **outside the VSIX**, no API/settings writer creates it | `src/control-plane/remote-bootstrap.ts:26-28` |
| 3 | Fresh install has no `beta-enrollment.json` → `productRemoteRelayBootstrap()` returns `enrollmentStatus: 'missing'` and **no enrollmentKey** | `src/control-plane/remote-bootstrap.ts:36-42` |
| 4 | Daemon falls back to product defaults, builds `RelayClient` **without** `enrollmentKey` | `src/control-plane/daemon.ts:233-254, 1064-1075` |
| 5 | `RelayClient` connects to production relay **without** `x-sideline-enrollment` header | `src/control-plane/relay-client.ts:146` |
| 6 | Production relay entrypoint (`relay/index.ts`) **requires** `ENROLLMENT_KEY` unless `ALLOW_OPEN_ENROLLMENT=true` (local testing only) | `relay/index.ts:38-40` |
| 7 | Reference relay enforces enrollment check on upgrade — rejects with 403 if key missing/mismatched | `relay/reference-relay.ts:150, 196-202` |
| 8 | UI auto-enables `remoteAccess.enabled=true` on "Send to Phone" click, then calls `/api/pairing/create` | `src/public/index.html:6260-6262` |
| 9 | Phone scans QR → hits `https://h-<hostPublicId>.remote.mysidelinecoach.com/pair#<secret>` → relay returns **503 "Desktop host is offline"** because host tunnel never established | `relay/reference-relay.ts:578-582, 512-524` |

---

## FACT

- `PRODUCT_RELAY_URL` and `PRODUCT_RELAY_DOMAIN` are hardcoded constants in `remote-bootstrap.ts:4-6`.
- The enrollment credential file path is `<sidelineDir>/remote/beta-enrollment.json` (`remote-bootstrap.ts:6`).
- `productRemoteRelayBootstrap()` returns `enrollmentKey` **only** when the file exists and is valid (`remote-bootstrap.ts:50-53`).
- `resolveRemoteRelayBootstrap()` in `daemon.ts:233-254` uses product defaults when no explicit env vars (`SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY`) are set.
- `RelayClient` constructor (`relay-client.ts:146`) only adds the `x-sideline-enrollment` header when `enrollmentKey` is truthy.
- Production relay `loadConfig()` (`relay/index.ts:38-40`) **throws** if `ENROLLMENT_KEY` is undefined and `ALLOW_OPEN_ENROLLMENT !== 'true'`.
- The deployed production relay at `remote.mysidelinecoach.com` runs the `index.ts` entrypoint, not the test reference relay.
- Host identity (`host-key.json`) is auto-generated on first run — **not a blocker** (`host-identity.ts:89-116`).
- Device registry (`devices.json`) is auto-created on first pairing — **not a blocker** (`device-registry.ts:32-52`).
- "Send to Phone" UI auto-enables `remoteAccess.enabled` via `POST /api/preferences` (`index.html:6260-6262`).

---

## INFERENCE

- The "trusted provisioner" mentioned in `remote-bootstrap.ts:26` is a **manual/operational step** — no automated provisioning path exists in the codebase for a fresh user.
- The enrollment key is a **shared secret between the provisioner and the production relay**; the daemon merely presents it.
- Without the enrollment key, the host tunnel **never reaches the hello/challenge phase** — the WebSocket upgrade is rejected at 403.
- The phone's QR URL resolves to the production relay, but the relay has no registered host for that `hostPublicId` → returns 503 offline page.
- The pairing exchange (`/api/pairing/exchange`) succeeds technically (it's a local daemon endpoint), but the phone can never reach the desktop UI afterward because the relay tunnel is down.
- This is a **private-beta gating mechanism**, not a bug — the architecture deliberately keeps the enrollment secret outside the VSIX.

---

## UNKNOWN

- Whether a future "provisioning path" (e.g., signed license, marketplace entitlement, first-run wizard) is planned to deliver the enrollment key invisibly.
- Whether `ALLOW_OPEN_ENROLLMENT=true` was ever used in production (evidence says no — "only for local testing").
- Exact error message Dad would see on phone (503 offline page vs. a more specific error).

---

## CONTRADICTION

None found. The codebase consistently treats the enrollment key as a **required production credential** that fresh installs lack.

---

## IMPORTANT FILES / PATHS

| File | Role |
|------|------|
| `src/control-plane/remote-bootstrap.ts` | Product relay defaults + machine enrollment file reader |
| `src/control-plane/daemon.ts:233-254, 1050-1083` | Relay bootstrap resolution + `syncRelayClient()` gating |
| `src/control-plane/relay-client.ts:146` | WebSocket upgrade header logic |
| `relay/index.ts:33-41` | **Production relay config loader — requires ENROLLMENT_KEY** |
| `relay/reference-relay.ts:150, 196-202` | Relay enforcement of enrollment on host upgrade |
| `src/public/index.html:6260-6262` | "Send to Phone" auto-enable + pairing creation |
| `src/control-plane/host-identity.ts:89-116` | Auto-generated host key (works) |
| `src/control-plane/device-registry.ts:32-52` | Auto-created device registry (works) |

---

## LIMITATIONS

- Reconnaissance only — did not deploy or test against live production relay.
- Did not inspect Fly.io deployment config for `remote.mysidelinecoach.com` (assumed to run `relay/index.ts`).
- Did not verify if any hidden/default enrollment key exists in production (source says no).
- Historical reports (Stage 4/5 field packets) confirm this is a known private-beta gate, not an oversight.

---

**End of Report** — Objective complete.
