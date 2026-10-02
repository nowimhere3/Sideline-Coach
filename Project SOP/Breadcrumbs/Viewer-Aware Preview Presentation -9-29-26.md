# BREADCRUMB — Viewer-Aware Preview Presentation

**BREADCRUMB TIMESTAMP:**  
Tuesday, September 29, 2026 · 8:53 AM MDT

**STATUS:**  
IMPLEMENTED — TARGET SELECTION + ADAPTIVE CURRENT-DEVICE SIZING

## Core Principle

### Viewer target rule (S57.55A)

Preview target describes the desired inspection viewport, not the physical Game host.

Default target follows the current viewer device class, with explicit Phone / Tablet / Desktop override before launch.

- The cockpit preselects Phone at responsive widths up to 619px, Tablet from 620px through 1023px, and Desktop from 1024px. This follows the existing phone breakpoint, without user-agent parsing or host/transport inference.
- Dad chooses the target beside Preview before launching Preview Work. The existing new-tab URL carries `previewTarget=phone|tablet|desktop` alongside `previewWork=<gameId>`; the receiving viewer validates it and initializes the existing preset before loading the Game iframe.
- Remote and local Preview reuse the same existing presets. Remote transport never resets the selected viewport to Desktop or hides Phone / Tablet controls.
- Tab 1 remains the cockpit; Tab 2 owns Preview Work. The raw Game opens in Tab 3 only through the existing explicit **Open in new tab** action.
- Target is presentation state only. Game/Stadium physical location, grants, tickets, cookies, authorization and relay routing have no influence on its default and receive no target field.

### Current-device sizing rule (S57.55C)

Current-device Preview is adaptive; cross-device Preview is deterministic emulation.

- A selected target matching the viewer's current responsive class uses actual launch viewport dimensions in CSS pixels: `window.visualViewport.width/height`, falling back to `document.documentElement.clientWidth/clientHeight`. Desktop retains the existing available/fill behavior.
- Launch rechecks the existing Phone ≤619px / Tablet 620–1023px / Desktop ≥1024px contract and measures immediately before opening Preview Work, including the current orientation. No permanent orientation observer is added.
- The existing viewer URL carries `previewViewport=<width>x<height>` only for a measured same-device Phone/Tablet target, or `previewViewport=fill` for same-device Desktop. The receiver validates finite dimensions from 1 through 16384 CSS pixels and applies them through the existing sizing engine before iframe navigation. Missing or invalid dimensions fall back to the existing preset.
- Other selected classes use stable existing emulation presets: Phone 390×844, Tablet 768×1024, Desktop fill. The receiving tab never reclassifies a cross-device selection as adaptive merely because its own dimensions differ.
- Physical Game/Stadium location never determines viewport dimensions. Local and Remote Preview share this presentation rule; no dimensions enter transport, authorization, grants, tickets or cookies.

Browser Preview must adapt its presentation to **the device Dad is currently using to view Sideline**, without changing the underlying running Game.

The Game remains one live application.

The Preview surface changes shape around the viewer.

## Preview Work Workflow Rule (S57.43A)

Preview must preserve the Sideline Coach workflow rather than replace or navigate away from it.

- One deliberate **Preview Work** click synchronously opens a separate Sideline Preview viewer tab. That viewer owns the Preview controls and embeds the resolved `PreviewEndpoint`.
- The original Sideline Coach tab remains the cockpit and is never navigated, hidden, replaced, or covered by Preview Work.
- The raw Game does not open automatically. It opens in another tab only when Dad deliberately uses **Open in new tab** from the Preview viewer.
- Resolution failure stays inside the separate Preview viewer and leaves the original Sideline tab untouched.
- The embedded Preview sheet is the content of the separate viewer surface, not an overlay that consumes the original Coach surface.
- No persistent Preview-tab registry, cross-tab synchronization, or second Preview architecture is implied.

## Desktop / Computer

When Sideline Coach is being viewed in a normal desktop browser:

- use the available desktop preview area efficiently
- preserve Desktop / Tablet / Phone viewport presets
- allow the preview canvas to use the larger browser surface
- avoid artificially constraining the preview to a phone-sized presentation
- give the embedded Preview sheet an explicit viewport-relative height so the running Game consumes most of the useful space below its controls
- treat Desktop / Tablet / Phone primarily as simulated application widths; changing preset must not collapse the available inspection height into a shallow strip

## Phone / Remote Preview

When Sideline Coach is being viewed from Dad's phone:

- optimize the Preview experience for the phone's actual available screen
- support portrait / landscape appropriately
- landscape should use the phone's horizontal space rather than presenting a tiny desktop-oriented preview shell
- avoid unnecessary surrounding chrome
- keep the Game itself unchanged

## Governing Rule

```text
One running Game
        ↓
One PreviewEndpoint
        ↓
Viewer-aware presentation
        ├─ Desktop browser → desktop-optimized preview surface
        └─ Phone → phone-optimized preview surface
```

This is a **presentation concern**, not a second Game instance and not a second PreviewEndpoint architecture.

Preserve this requirement when designing Remote / Send Preview to Phone in R13/R14.

## Remote Preview (R13): decided shape

Decision record: `REPORTS/Claude/S57.45-R13-Remote-Static-Preview-Architecture.md` (2026-09-30).

- **Origin:** Remote Preview runs on a dedicated per-Game origin, `p-<hostPublicId>-<gameTag>.<RELAY_DOMAIN>`, under the existing wildcard. The Sideline app stays on `h-<hostPublicId>.<RELAY_DOMAIN>`. It is never path-scoped under the app origin.
- **Transport:** relay labels `p-` requests `surface:'preview'` → host adapter → daemon **RemotePreviewGateway** → loopback `GET`/`HEAD` → Stadium-owned `StaticPreviewServer`. Preview-surface requests never reach the daemon router.
- **Authority:** an ephemeral, memory-only **RemotePreviewGrant** minted by the daemon on `POST /api/games/preview/remote`, bound to device + Game + Stadium session instance + static-server instance. A single-use entry ticket becomes the host-only cookie `__Host-sl_pv` on the Preview origin. Grants never live in DeviceRegistry.
- **Target:** only from the Stadium's `game.preview.remoteTarget` for the grant's Game, advertised only by a co-located Stadium. Every response must echo the expected static-server instance. The phone never supplies a host or port.
- **Representation:** canonical `PreviewEndpoint` never gains remote fields. Remote viewers get a separate projection with `remote.frameUrl`/`openUrl` and no `localUrl`/`clientUrl`.
- **Isolation:** the Game runs as ordinary JS (`allow-same-origin` is allowed) on an origin that holds no Sideline credential. The device cookie is `__Host-sl_dev`. The gateway owns a minimal CSP (`frame-ancestors`) and refuses service-worker registration.
- **Fail closed:** any change of device, Stadium session, or server instance, or an expiry, ends the preview. Recovery is always tapping Preview Work again, never silent rebinding.
- **R13 fence:** static only, GET/HEAD, assets ≤ 8 MiB, no Range. Vite/HMR/dev servers and non-co-located Stadiums are R14.
