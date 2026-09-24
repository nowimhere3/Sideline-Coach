# SCOUT RECONNAISSANCE REPORT
**Play ID:** remote-access-v1-stage4-recon-20260923-190151  
**Scout ID:** stage4-dns-tls-origins  
**Scout Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Game Root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  
**Status:** READ-ONLY RECONNAISSANCE (no modifications made)  

## RESULT
This report details the production DNS/TLS/origin architecture required for Stage 4 (production relay service) of the Remote Access v1 feature, based on inspection of the current source code, accepted architectural decisions, and stage reports. Stage 3E is still pending; no assumptions about Stage 3 completion are made. All findings are derived from authoritative sources and code inspection.

## KEY DISCOVERIES
- **Production relay domain:** `sideline.live` (default, per ADR and reports).  
- **WSS endpoint:** `wss://relay.sideline.live/tunnel/v1`.  
- **Browser origin pattern:** `https://h-<hostPublicId>.sideline.live`.  
- **TLS requirement:** Wildcard certificate for `*.sideline.live` (covers both the relay apex and host-specific subdomains).  
- **DNS requirement:** A record for `relay.sideline.live` and wildcard A record for `*.sideline.live` (or at least `h-*.sideline.live`).  
- **Expected origin:** Derived statically in the RelayClient from the host’s own `hostPublicId` and configured `relayDomain` (never from request headers).  
- **Host header validation:** Relay extracts `hostPublicId` from the Host header using a strict regex (`^h-[a-z2-7]{20}\\.sideline.live(?::\\d+)?$`).  
- **Cookie attributes:** `sl_dev` cookie is set with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=` (host-only by omission of Domain attribute).  
- **CORS:** Not required; architecture is strictly same-origin.  
- **TLS termination:** Assumed to occur inside the Node.js relay process (no reverse proxy mentioned in authorities).  

## FACT
- **Relay domain default:** The `relayDomain` field in `DaemonRemoteRelayConfig` and `RelayClientOptions` is documented as trusted configuration, with a default of `'sideline.live'` in test harnesses and reports ([AntiGravity Stage-3 Field Packet, line 165](#file-REPORTS\\AntiGravity\\Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md-L165)).  
- **WSS endpoint construction:** The RelayClient connects to `wss://${relayDomain}/tunnel/v1` (see scout logs in [FORMATION-RESULT.md, line 513](#file-Scouts\\remote-access-v1-stage3-recon-20260923-181132\\FORMATION-RESULT.md-L513)).  
- **Browser origin formula:** `expectedOrigin = https://h-${hostPublicId}.${relayDomain}` is constructed in the RelayClient constructor ([relay-client.ts, line 83](#file-src\\control-plane\\relay-client.ts#L83)).  
- **Wildcard TLS certificate:** Stage 4 scope specifies deployment “with a wildcard TLS certificate (DNS-01)” ([Claude ADR, line 321](#file-REPORTS\\Claude\\Remote-Access-v1-Architecture-Decision__20260923__Claude.md-L321)).  
- **Host header validation in relay:** The reference relay uses a regex to extract `hostPublicId` from the Host header (`^h-([a-z2-7]{20})\\.${domain}(?::\\d+)?$`) ([reference-relay.ts, line 74](#file-relay\\reference-relay.ts#L74)).  
- **Header allowlist:** The relay forwards only the seven headers: `accept`, `content-type`, `cookie`, `origin`, `x-sideline-action`, `last-event-id`, `user-agent` ([reference-relay.ts, line 19](#file-relay\\reference-relay.ts#L19)).  
- **Cookie attributes:** The adapter attaches `Set-Cookie: sl_dev=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` ([AntiGravity Stage-3 Field Packet, line 156](#file-REPORTS\\AntiGravity\\Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md-L156)).  
- **CORS decision:** ADR D7 states: “Remove `Access-Control-Allow-Origin: *`. Same-origin only.” ([Claude ADR, line 204](#file-REPORTS\\Claude\\Remote-Access-v1-Architecture-Decision__20260923__Claude.md-L204)).  

## INFERENCE
- **Wildcard DNS sufficiency:** A wildcard DNS record for `*.sideline.live` is sufficient for arbitrary `h-<hostPublicId>.sideline.live` because the relay extracts the hostPublicId from the first subdomain label and validates it against the base32 pattern; any matching subdomain resolves to the same IP ([reference-relay.ts, lines 74-75](#file-relay\\reference-relay.ts#L74-L75)).  
- **TLS certificate scope:** A wildcard certificate for `*.sideline.live` covers `relay.sideline.live` (one level) and `h-<hostPublicId>.sideline.live` (one level), but not deeper nesting (e.g., `foo.h-<hostPublicId>.sideline.live`). This matches the architecture’s need for exactly one level of subdomain.  
- **TLS termination location:** Since the Stage 4 scope describes deploying “the Stage 3 relay deployed with a wildcard TLS certificate” on a “small container host” with no mention of a reverse proxy, and the reference relay uses Node.js `http`/`ws` directly, it is inferred that TLS termination occurs inside the Node.js process for Stage 4.  
- **Cookie host-only behavior:** The `sl_dev` cookie is set without a `Domain` attribute, making it host-only (sent only to the exact origin that set it). This ensures cookies are not leaked across host-specific subdomains.  
- **Expected origin derivation:** The RelayClient computes `expectedOrigin` from its own `identity.hostPublicId` and configured `relayDomain`; this value is passed to the `InProcessRemoteAdapter` and never derived from incoming request headers ([AntiGravity Stage-3 Field Packet, line 164](#file-REPORTS\\AntiGravity\\Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md-L164)).  

## UNKNOWN
- **Exact production relay domain:** While `sideline.live` is the default and used in documentation, the ADR notes that the relay domain, hosting provider, and cost ceiling are “a product and ops choice” and block Stage 4 ([Claude ADR, line 366](#file-REPORTS\\Claude\\Remote-Access-v1-Architecture-Decision__20260923__Claude.md-L366)). The final domain may differ.  
- **DNS TTL and propagation specifics:** No details on DNS TTL values or propagation timing are provided in the authorities.  
- **Certificate renewal mechanism:** Whether automated renewal (e.g., Let’s Encrypt) is used, or manual renewal, is not specified.  
- **Rate limit values:** The ADR mentions rate limits (pairing endpoints, per‑IP) but does not specify numbers ([Claude ADR, line 324](#file-REPORTS\\Claude\\Remote-Access-v1-Architecture-Decision__20260923__Claude.md-L324)).  
- **Host‑registration gating mechanism:** The ADR notes this as an unknown for Stage 4 ([Claude ADR, line 326](#file-REPORTS\\Claude\\Remote-Access-v1-Architecture-Decision__20260923__Claude.md-L326)).  

## CONTRADICTION
No contradictions were found between the authorities and the codebase regarding the DNS/TLS/origin architecture for Stage 4.  

## IMPORTANT FILES / PATHS
- `src/control-plane/daemon.ts` – Defines `DaemonRemoteRelayConfig` (lines 117-124) and uses `remoteRelay.relayDomain` and `remoteRelay.relayUrl` to configure the RelayClient (lines 640-641).  
- `src/control-plane/relay-client.ts` – Constructs `expectedOrigin` from `identity.hostPublicId` and `options.relayDomain` (line 83).  
- `relay/reference-relay.ts` – Implements Host header validation and subdomain extraction (lines 74-75, 320-327).  
- `REPORTS/Claude/Remote-Access-v1-Architecture-Decision__20260923__Claude.md` – Contains Stage 4 scope and acceptance gate (lines 318-333).  
- `REPORTS/AntiGravity/Remote-Access-v1-Stage-3-Sonnet-Field-Packet__20260923__AntiGravity.md` – Documents `relayDomain` default and expected origin derivation (lines 163-168).  

## LIMITATIONS
- This reconnaissance is read‑only and based solely on the current state of the repository and accepted reports.  
- No actual DNS, TLS, or deployment details were inspected (as prohibited by the read‑only contract).  
- Findings about production behavior are inferences from the design and test‑only reference relay; the production relay may have additional considerations not visible in the source.  
- The report does not address Stage 5+ features (e.g., Coach Source, accounts) as they are out of scope for Stage 4.  

---  
**END OF REPORT**  
*This document is reconnaissance, not final architectural authority.*
