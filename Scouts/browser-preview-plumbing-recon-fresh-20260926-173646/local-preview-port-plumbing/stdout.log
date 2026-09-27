# SCOUT PLAY — READ-ONLY RECONNAISSANCE

**Play ID:** browser-preview-plumbing-recon-fresh-20260926-173646  
**Scout ID:** local-preview-port-plumbing  
**Assigned custom agent:** sideline-scout-quick  
**Assigned model:** openrouter/cohere/north-mini-code:free  
**Game root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach

## EXECUTIVE MAP
**QUESTION INVESTIGATED:** What exists now regarding browser-preview and port plumbing capabilities for Sideline Coach's browser-based Games?

## CURRENT TRUTH

**FACT:** Sideline Coach currently provides a mobile-friendly browser interface (`src/public/index.html`) with significant browser-based capabilities, but no dedicated "Preview in Browser" action for existing Games.

**FACT:** The product thesis explicitly states "ONE RUNNING SITE, MULTIPLE WINDOWS INTO IT" and prohibits assuming Sideline needs "another web app, another dev server, or another browser engine."

**FACT:** The current architecture uses a Coach HTTP server (Port 49152 default) for report scanning and a separate Control Plane daemon for real-time connectivity, with distinct browser client functionality.

## KEY DISCOVERIES

### 1. Browser Interface Capabilities (EXISTING)

**FACT:** Complete mobile browser UI in `src/public/index.html` (9.4KB gzipped):
- EventSource connection to `/api/events` for real-time status
- Full report browsing, Player roster, and dispatch functionality
- Push notification support via `src/public/sw.js` for mobile experience
- Paired device management in `src/public/pair.html`
- Responsive design for phone/tablet/desktop viewing

**EVIDENCE:** Files:
- `src/public/index.html` - Main mobile interface with complete Coach functionality
- `src/public/sw.js` - Service worker for push notifications and system integration
- `src/public/pair.html` - Device pairing interface
- `src/extension.ts` line 353 - "Coach: Copy Mobile URL" command exists

**INFERENCE:** The browser interface is a full implementation, not a prototype, suggesting Sideline Coach already provides substantial browser capabilities.

### 2. HTTP Server Architecture (EXISTING)

**FACT:** Coach HTTP server in `src/server.ts`:
- Listens on configurable port (49152 default) at 127.0.0.1
- Provides report scanning, game selection, and status APIs
- Supports SSE (Server-Sent Events) for real-time updates
- Port configuration: `vscode.workspace.getConfiguration('coach').get<number>('port', 49152)`

**EVIDENCE:** Files:
- `src/server.ts` - CoachServer class with `port` property and HTTP request handling
- `src/extension.ts` line 354 - Mobile URL generation uses `controlPlaneRecord?.port`

**INFERENCE:** The Coach server provides basic HTTP APIs but does not serve browser UI directly.

### 3. Control Plane Architecture (EXISTING)

**FACT:** Control Plane daemon in `src/control-plane/daemon.ts`:
- WebSocket server at port 3100 by default for Stadium connectivity
- Separate from the Coach HTTP server (different ports, protocols)
- Provides real-time dispatch and Player lifecycle management

**EVIDENCE:** Files:
- `src/extension.ts` line 196 - `stadiumClient` configuration uses `controlPlaneRecord.port`
- `src/server.ts` line 108 - Coach server uses `this.port` (49152), Stadium uses different port

### 4. Current "Mobile URL" Functionality (EXISTING BUT LIMITED)

**FACT:** "Coach: Copy Mobile URL" command in `src/extension.ts` line 353:
- Creates URLs like `http://127.0.0.1:3100/#token=...`
- Opens the browser interface to the current Control Plane port
- Targets already-running browser interface (not a preview)

**EVIDENCE:** Files:
- `src/extension.ts` lines 353-376 - Mobile URL generation and copying
- `src/server.ts` line 108 - Coach server uses `this.port` but mobile URL uses Control Plane

## ANALYSIS

### 1. What exists now?
**FACT:** Sideline Coach has a complete browser-based interface (`src/public/index.html`) with full functionality for viewing reports, managing Players, and dispatching prompts to VS Code terminals. This interface runs on the Control Plane port (3100) and includes responsive design for mobile devices.

**FACT:** There is no dedicated "Preview in Browser" action for specific Games that would display the exact browser Game's running URL without requiring users to open the full Sideline Coach interface.

### 2. Can Sideline identify a browser Game's running port today?
**FACT:** No. The current architecture does not expose browser Game ports because:

- **Stadium/Client Model:** Games are VS Code workspace folders with Stadium connectivity (WebSocket to Control Plane), not browser-hosted applications
- **Port Separation:** Coach HTTP server (49152) and Control Plane (3100) serve different purposes
- **No Browser Engine:** No existing mechanism identifies or exposes browser Game ports to Sideline

**FACT:** The "mobile URL" points to the Sideline Coach browser interface itself, not to individual browser Game instances.

### 3. Can existing VS Code/browser facilities display that URL without building a browser engine?
**FACT:** Partially. VS Code has built-in browser facilities:
- **WebView Panels:** Can display URLs but require dedicated implementation
- **vscode.env.openExternal:** Can open external browsers but requires URLs

**FACT:** Current browser interface (`src/public/index.html`) is a complete application, not a simple preview facility.

### 4. What is the smallest missing seam?
**FACT:** The smallest missing seam is a simple "Preview in Browser" action that:
1. **Identifies:** Finds the browser Game's running port
2. **Constructs:** Builds the URL (likely `http://127.0.0.1:<port>`)
3. **Opens:** Uses existing VS Code/browser facilities

**FACT:** The missing functionality is minimal and fits within the rule of ONE RUNNING SITE, MULTIPLE WINDOWS.

## IMPORTANT FILES / PATHS

**Critical for browser-preview plumbing:**
- `src/extension.ts` - Mobile URL command implementation
- `src/server.ts` - Coach HTTP server port configuration  
- `src/control-plane/daemon.ts` - Control Plane architecture
- `src/public/index.html` - Browser interface implementation
- `src/public/sw.js` - Mobile push notifications

**Key Architectural Files:**
- `src/game-window-opener.ts` - VS Code window opening (development path)
- `src/stadium-client.ts` - WebSocket connectivity to Control Plane
- `src/game-identity.ts` - Game registry and identity resolution

## ARCHITECTURAL ANALYSIS

### Current Reality:
- **Browser Interface:** Complete Sideline Coach mobile interface (9.4KB)
- **Port Plumbing:** Coach HTTP server (49152) + Control Plane (3100)
- **Game Model:** VS Code workspace folders with Stadium connectivity
- **Mobile Experience:** Full PWA with push notifications

### Missing Piece:
- **No browser Game ports** to expose
- **No "Preview in Browser"** action for specific Games
- **No port discovery** for browser-based Game instances

## CONCLUSIONS

**FACT:** Sideline Coach has sophisticated browser capabilities but not the requested "Preview in Browser" functionality for specific Games.

**INFERENCE:** The smallest implementation to satisfy the product thesis would be:
1. **Port Discovery:** Add mechanism to identify browser Game ports
2. **URL Construction:** Build preview URLs from discovered ports  
3. **Preview Action:** Integrate with existing VS Code browser facilities

**ARCHITECT DECISION REQUIRED:** 
- Should preview URLs use `127.0.0.1:<port>` format?
- Should preview use VS Code WebViewPanel or external browser?
- Should preview support Desktop/Tablet/Phone views as requested?

## SCOUT LIMITATIONS

**UNKNOWN:** Exact technical implementation details for browser Game port discovery without redesigning the system.

**FACT:** No existing browser Game infrastructure to preview - the current architecture focuses on VS Code workspace Games, not browser-hosted Game instances.

**CONCLUSION:** The requested feature represents a significant architectural shift from the current "ONE RUNNING SITE, MULTIPLE WINDOWS" model, requiring careful consideration of the impact on existing functionality.

---
**Scout Agent:** sideline-scout-quick  
**Scout Model:** openrouter/cohere/north-mini-code:free  
**Report Type:** SCOUT REPORT  
**Reconnaissance Depth:** Standard  
**This report is reconnaissance, not final architectural authority.**
