# SCOUT PLAY - READ-ONLY RECONNAISSANCE

**Play ID:** static-browser-preview-recon-20260929-fresh-20260929-224246  
**Scout ID:** preview-static-seam  
**Assigned custom agent:** sideline-scout-quick  
**Assigned model:** openrouter/cohere/north-mini-code:free  
**Game root:** C:\Users\dmcal\Documents\GitHub\SidelineCoach  

## READ-ONLY CONTRACT
This is READ-ONLY reconnaissance. No edits, creations, deletions, or mutations are performed.

---

## RESULT

**COMPLETE: Reconnaisance completed for static browser preview discovery pipeline analysis.**

---

## KEY DISCOVERIES

### 1. **Current Preview Discovery Pipeline (CURRENT PIPELINE)**

**FACT:** The preview discovery system follows a strict pipeline that only supports running HTTP/HTTPS endpoints.

**FILES/SYMBOLS:**
- `src/preview-discovery.ts` - Core discovery module (568 lines)
- `src/control-plane/protocol.ts` - RPC protocol definitions
- `src/control-plane/daemon.ts` - HTTP server handling preview requests
- `src/stadium-client.ts` - Stadium RPC implementation
- `src/public/index.html` - Frontend preview rendering

**EVIDENCE:**
- In `src/preview-discovery.ts`: The `resolveGamePreview` function only resolves running HTTP/HTTPS endpoints
- In `src/control-plane/daemon.ts:2208`: `/api/games/preview` endpoint proxies to Stadium RPC `game.preview.v1` → `game.preview.resolve`
- In `src/stadium-client.ts:898-911`: Stadium RPC handler for `game.preview.resolve` calls `resolveGamePreview`
- In `src/preview-discovery.ts:110-117`: `parsePreviewUrl()` explicitly rejects `file://` and non-http protocols

### 2. **Static Gap Analysis (STATIC GAP)**

**FACT:** The system cannot discover static HTML content because it's designed exclusively for running dev servers.

**EVIDENCE:**
- `src/preview-discovery.ts:114-115`: `parsePreviewUrl()` rejects any protocol other than `http:` and `https:`
- `src/preview-discovery.ts:140-141`: Invalid declarations (like `file://`) return `invalid: true` and produce `reason: 'invalid-declaration'`
- `src/preview-discovery.ts:225-259`: `detectPreviewCandidates()` only scans `package.json` scripts and framework configs, not static HTML
- `src/preview-discovery.ts:482-487`: When no candidates are found, returns `reason: 'no-web-app'`

### 3. **Package-Script Heuristics**

**FACT:** Detection relies entirely on package.json scripts and framework server detection.

**EVIDENCE:**
- `src/preview-discovery.ts:163-181`: `FRAMEWORKS` array only contains server binaries (vite, next, react-scripts, etc.)
- `src/preview-discovery.ts:183`: `DEV_SCRIPT_NAMES = ['dev', 'start', 'serve', 'develop']`
- `src/preview-discovery.ts:225-259`: `detectPreviewCandidates()` analyzes these scripts to find running dev servers

---

## EXACT SEAM (EXACT SEAM)

**INFERENCE:** The smallest architectural seam for static browser content integration is the `PreviewEndpoint` contract itself.

**FACT:** `PreviewEndpoint` already contains the necessary fields (`clientUrl`, `localUrl`) that could be populated with static content, but the discovery pipeline prevents their creation.

**FILES/SYMBOLS:**
- `src/preview-discovery.ts:33-53`: `PreviewEndpoint` interface definition
- `src/preview-discovery.ts:462`: `resolveGamePreview` return type `PreviewResolution`
- `src/control-plane/protocol.ts:425-434`: `GamePreviewResolveResult` mirrors `PreviewResolution`

**EXACT SEAM LOCATION:** The `projectPreviewEndpoint()` function in `src/preview-discovery.ts:516-542` could accept static content if discovery returned it, but discovery never creates endpoints for static content.

---

## EXISTING EXTENSION POINTS (EXISTING EXTENSION POINTS)

### 1. **ToClientUrl Bridge (SECURITY RESTRICTIONS)**
**FACT:** The system has an environment-neutral bridge (`toClientUrl`) that could transform static file paths.

**FILES/SYMBOLS:**
- `src/preview-discovery.ts:65-68`: `ClientUrlMapping` interface
- `src/preview-discovery.ts:424-434`: `mapClientUrl()` function
- `src/preview-discovery.ts:906`: `toClientUrl: this.options.previewClientUrl` in Stadium RPC

**EXTENSION POINT:** The `toClientUrl` callback could be adapted to convert local file paths to secure preview URLs.

### 2. **Framework Detection Expansion**
**INFERENCE:** The framework detection system could be extended to recognize static content servers.

**FILES/SYMBOLS:**
- `src/preview-discovery.ts:163-181`: `FRAMEWORKS` array could include static server entries
- `src/preview-discovery.ts:205-212`: `explicitScriptPorts()` could parse static server ports

### 3. **Security Policy Adjustment**
**FACT:** The security allowlist could be extended to include static content access under controlled conditions.

**FILES/SYMBOLS:**
- `src/preview-discovery.ts:110-117`: `parsePreviewUrl()` security validation
- `src/preview-discovery.ts:140-141`: Invalid declaration handling

---

## FILES / SYMBOLS AGY SHOULD INSPECT

**FACT:** AGY should focus on these critical files for static preview integration:

### Priority 1 (Immediate Integration):
1. `src/preview-discovery.ts` - Core discovery and endpoint building logic
2. `src/control-plane/protocol.ts` - RPC contract definitions
3. `src/stadium-client.ts:898-911` - Stadium RPC preview resolution handler
4. `src/control-plane/daemon.ts:2208` - Control Plane preview proxy

### Priority 2 (Security & Configuration):
5. `src/preview-discovery.ts:110-117` - Security validation logic
6. `src/preview-discovery.ts:516-542` - Preview endpoint projection
7. `src/public/index.html:7808-7844` - Frontend preview rendering

### Priority 3 (Extension Points):
8. `src/preview-discovery.ts:65-68` - Client URL mapping interface
9. `src/control-plane/remote-routes.ts:35` - Route security policies
10. `src/stadium-client.ts:76-100` - Stadium client options

---

## LIMITATIONS

**FACT:** This reconnaissance is limited to read-only file inspection and cannot test runtime behavior.

**CONSTRAINTS:**
- No access to `.sideline/game.json` files (appears to be runtime-generated)
- No execution of discovery logic or testing of static content scenarios
- No ability to modify security policies or test integration scenarios
- Cannot verify actual browser behavior with static content

---

## CONCLUSION

The preview discovery system has a well-defined architectural seam at the `PreviewEndpoint` level, but requires three key changes for static content integration:
1. **Security policy adjustment** to allow static file access under controlled conditions
2. **Discovery expansion** to detect static content servers and HTML files
3. **Client URL bridge adaptation** to securely serve static content

The existing architecture supports the integration without requiring a second Preview architecture, making this a relatively contained change within the current system boundaries.

---

**RECONNAISSANCE COMPLETE** - Scout agent: sideline-scout-quick, Model: openrouter/cohere/north-mini-code:free
