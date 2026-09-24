# SCOUT PLAY - READ-ONLY RECONNAISSANCE
**Play ID**: remote-access-v1-recon-20260923-092529  
**Scout ID**: remote-current-state  
**Assigned Custom Agent**: sideline-scout-quick  
**Assigned Model**: openrouter/cohere/north-mini-code:free  
**Game Root**: C:\Users\dmcal\Documents\GitHub\SidelineCoach

## RESULT
Complete reconnaissance of Sideline Coach's remote/mobile access architecture completed. This is reconnaissance, not final architectural authority. Focus was placed on current code paths when Dad opens Sideline from another device.

## KEY DISCOVERIES

### 1. Process/Server Architecture
FACT: The Sideline browser UI is served by **CoachServer** running in the VS Code Extension Development Host.

FACT: CoachServer is defined in `src/server.ts` and implements:
- HTTP server on `127.0.0.1:49152` (configurable via `coach.port`)
- API endpoints at `/api/` paths
- SSE (Server-Sent Events) stream at `/api/events` for real-time updates
- Static file serving from `src/public/index.html`

FACT: Mobile UI access requires Tailscale Serve or Cloudflare Tunnel because CoachServer listens **only on localhost (127.0.0.1)**.

### 2. Host/Bind Addresses and Transports
FACT: Current transport stack:
- **CoachServer**: HTTP on `127.0.0.1:49152`
- **StadiumClient**: WebSocket on `ws://127.0.0.1:3100/stadium?token=...`
- **Control Plane daemon**: HTTP health checks on `127.0.0.1:3100`

FACT: Control Plane discovery uses election lock mechanism (`control-plane.lock`) to prevent multiple instances.

### 3. Tailscale Integration
FACT: Tailscale enters workflow through **coach.publicUrl** configuration setting.

FACT: Mobile URL generation in `extension.ts` copyMobileUrl function:
```typescript
const base = (configuredPublicUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const token = await getAccessToken();
const url = `${base}/?token=${encodeURIComponent(token)}`;
```

FACT: Tailscale Serve command: `tailscale serve 49152` creates HTTPS URL like `https://your-desktop.your-tailnet.ts.net`

### 4. Authentication and Security Gates
FACT: Authentication mechanisms:
- **Token storage**: `~/.sideline/token` file OR VS Code secret storage key `sidelineCoach.accessToken`
- **Authorization**: Timing-safe comparison in CoachServer.isAuthorized() method
- **Query parameter fallback**: `?token=...` in URL query string
- **Access token generation**: 24-byte base64url random bytes in `extension.ts`

FACT: Security headers set in CoachServer.setCommonHeaders():
- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY

### 5. Mobile Browser Access Paths
FACT: Mobile access routes through multiple components:

**Normal Sideline UI:**
- HTTPS endpoint from Tailscale Serve → CoachServer HTTP → `src/public/index.html`
- Token stored in browser sessionStorage
- Single-page application with React-like architecture

**Live Player Terminal:**
- WebSocket connection from StadiumClient → Control Plane daemon
- Real-time terminal output streaming via `player.activity` notifications
- SSE updates from CoachServer for status changes

**AI Usage Scoreboard:**
- Part of mobile UI (index.html sections `#aiScoreboardContainer`)
- Pulls data via CoachServer `/api/status` endpoint
- Updates via SSE stream

**Player Activity/Status Streams:**
- CoachServer SSE at `/api/events` for roster, game, and terminal changes
- StadiumClient WebSocket for detailed player activity (`player.activity` events)
- Both maintain reconnection logic

### 6. Daemon Restart/Browser Reconnect Behavior
FACT: **CoachServer**: HTTP server recreation logic in `server.ts` start() method with proper cleanup in stop()

FACT: **StadiumClient**: Comprehensive reconnection logic in `stadium-client.ts`:
- Automatic reconnect timer (2 seconds after close)
- Freshness Guard in `launcher.ts` for Control Plane replacement
- Election lock prevents duplicate instances
- Connection state tracking with heartbeat mechanism

FACT: **Recovery paths**:
- Failed Control Plane -> Launcher starts new instance
- Mobile browser disconnect -> SSE client cleanup, auto-reconnect attempts
- Token persistence across VS Code restarts

### 7. Exact Files, Functions, Endpoints
FACT: Critical remote access files:

**Core Implementation:**
- `src/server.ts` - CoachServer class, route() method, dispatch()
- `src/extension.ts` - getAccessToken(), copyMobileUrl(), StadiumClient setup
- `src/stadium-client.ts` - connect(), reconnect(), WebSocket handling
- `src/control-plane/launcher.ts` - ensureControlPlaneRunning()

**Configuration Seams:**
- `package.json` - `coach.port`, `coach.publicUrl`, `coach.terminalAllowlist`
- `src/server.ts` line 73 - port configuration retrieval
- `src/extension.ts` line 346 - publicUrl retrieval

**API Endpoints (CoachServer):**
- GET `/` - Serve mobile UI
- GET `/api/status` - Status information
- GET `/api/events` - SSE stream
- GET `/api/reports/latest` - Latest reports
- GET `/api/players/` - Player roster operations
- POST `/api/dispatch` - Send prompts to terminals
- POST `/api/route` - Routing configuration

**WebSocket Protocol:**
- `ws://127.0.0.1:3100/stadium?token=...` - Control Plane connection
- JSON-RPC 2.0 frames for structured messaging

### 8. Components That Should NOT Be Replaced
FACT: Based on architecture analysis, these components should be preserved:

**Core Abstraction Layers:**
- CoachServer as HTTP/SSE abstraction layer
- StadiumClient as WebSocket control plane client
- Launcher election lock mechanism
- Token authentication system

**Protocol Interfaces:**
- Control Plane Protocol Version 1 (`CONTROL_PLANE_PROTOCOL_VERSION = 1`)
- JSON-RPC message structures
- Game ≠ Stadium invariant

**Security Boundaries:**
- localhost-only binding for internal services
- Token-based authentication with timing-safe comparison
- CSP and security headers
- Terminal allowlist enforcement

### 9. Relevant Breadcrumbs and Reports
FACT: Historical documentation shows established patterns:
- README.md lines 11, 103-155 detail Tailscale Serve workflow
- Architecture breadcrumbs emphasize Game ≠ Stadium separation
- Protocol version indicates intentional versioning for compatibility
- Field evidence shows mobile access has been functional in production

## FACT / INFERENCE / UNKNOWN / CONTRADICTION

### FACT
- CoachServer serves mobile UI from `127.0.0.1:49152`
- Tailscale Serve is the recommended mobile access method via `coach.publicUrl`
- Token authentication uses 24-byte base64url tokens stored in `~/.sideline/token`
- WebSocket connection to Control Plane at `127.0.0.1:3100`
- Mobile UI is a single-page application in `src/public/index.html`
- Game ≠ Stadium invariant is a documented architectural principle
- Control Plane Protocol version 1 is the current versioned interface

### INFERENCE
- Tailscale Serve provides the security boundary between mobile and local services
- The election lock mechanism prevents multiple Control Plane instances
- Mobile browser sessions maintain authentication state via sessionStorage
- Real-time updates use SSE primarily for mobile UI, WebSocket for advanced features
- Token rotation occurs when secrets are regenerated in extension context

### UNKNOWN
- Exact mobile browser user-agent parsing and compatibility
- Tailscale authentication flow specifics (assuming standard Tailscale Serve behavior)
- Cloudflare Tunnel configuration edge cases
- Mobile device notification mechanisms for reconnection events

### CONTRADICTION
- None identified in current codebase examination

## IMPORTANT FILES / PATHS

**Critical Remote Access Files:**
- `src/server.ts` - CoachServer implementation (968 lines)
- `src/extension.ts` - Extension activation and configuration (587 lines)  
- `src/stadium-client.ts` - Control Plane WebSocket client (1,235+ lines)
- `src/control-plane/launcher.ts` - Control Plane lifecycle management (302 lines)
- `src/control-plane/protocol.ts` - JSON-RPC protocol definitions (571 lines)
- `src/public/index.html` - Mobile browser UI (1,014+ lines)

**Configuration Files:**
- `package.json` - Extension manifest and settings
- `tsconfig.json` - TypeScript configuration

**Runtime State:**
- `~/.sideline/` directory - Token storage, Control Plane manifests
- `control-plane.json` - Control Plane process information
- `control-plane.lock` - Election lock file

## LIMITATIONS
- Analysis is limited to current source code, not running runtime state
- No actual Tailscale or Cloudflare Tunnel configuration observed
- Mobile app testing not performed
- Production deployment configurations not examined
- Third-party service integration details (Tailscale, Cloudflare) assumed from documentation

**Reconnaissance Complete** - This report maps the current remote/mobile access architecture for the next architect. All findings are based on read-only examination of the codebase and documentation.
