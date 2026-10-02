**Sideline Coach Read-Only Reconnaissance – Browser Entrypoint Discovery**  
Scout ID: static-html-entrypoint-discovery  
Assigned model: openrouter/nvidia/nemotron-3-super-120b-a12b:free  
Date: Tue Sep 29 2026  

---

### RESULT
The browser entrypoint for the SidelineCoach extension is **`src/public/index.html`**, served at the root path (`/`/`/index.html`) by the embedded CoachServer. No hardcoding of `index.html` is required; the entrypoint is discoverable via server routing logic and public asset declarations.

### KEY DISCOVERIES
- **Fact**: `package.json` lists `src/public/index.html` and `src/public/pair.html` under the `"files"` array, marking them as public assets.  
- **Fact**: `src/server.ts` routes `GET /` and `GET /index.html` to serve `src/public/index.html` via `serveIndex()`.  
- **Fact**: No `.sideline/game.json` declaration exists; no `dev`/`start`/`serve` scripts appear in `package.json`.  
- **Fact**: The extension provides a VS Code command `coach.previewInBrowser` that launches the preview via `resolveGamePreview()` (which probes detected candidates).  
- **Inference**: `src/public/index.html` is the home/launch page because it is the target of the root server route.  
- **Inference**: `src/public/pair.html` is a secondary pairing page, linked from index.html (via UI controls that set `location.hash` or modify `href` to `/pair`).  
- **Generic signals** (derived from the codebase) that Sideline could use to discover a browser entrypoint without hardcoding `index.html` include:  
  1. Server route mappings (e.g., Express-like handlers for root path).  
  2. Public asset declarations in `package.json` `"files"` or similar lists.  
  3. Presence of a service worker (`sw.js`) co-located with HTML in a `public/` directory.  
  4. HTML files that lack incoming links from other project HTML files (indicating a likely entry point).  
  5. Conventional directory names (`public/`, `site/`, `docs/`) containing an `index.html`.  
- **Exclusions** applied to avoid false positives:  
  - HTML files in `node_modules/`, `dist/`, `build/`, `out/`, `coverage/`, `.next/` (generated/assets).  
  - HTML files in `test/`, `__tests__/`, `fixtures/` (test fixtures).  
  - HTML files in vendor directories (`vendor/`, `third_party/`).  
  - HTML files in report/snapshot directories (e.g., `REPORTS/*`) – these are artifacts, not source.  
- **Ambiguity case**: If multiple HTML files exist in a public directory with no clear root route (e.g., both `index.html` and `home.html`), Sideline would require a minimal human chooser (e.g., a configuration setting or user memory) to disambiguate. In SidelineCoach, ambiguity is resolved by the server routing logic.

### FACT
- `package.json` lines 24-26: `"src/public/index.html"`, `"src/public/pair.html"`, `"src/public/sw.js"` are included in the `"files"` array.  
- `src/server.ts` lines 233-235: `if (method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) { await this.serveIndex(res); return; }`  
- `src/server.ts` lines 454-468: `serveIndex()` reads `vscode.Uri.joinPath(this.context.extensionUri, 'src', 'public', 'index.html')`.  
- `src/public/index.html` lines 6270-6285: `pairingPageUrl()` sets `target.pathname = '/pair'`, indicating a link to `pair.html`.  
- No `.sideline/game.json` file exists (glob search returned no matches).  
- `package.json` lacks `dev`, `start`, `serve`, `develop` keys in `"scripts"` (lines 59-75).  

### INFERENCE
- Because the CoachServer serves `src/public/index.html` at the root URL, it is the browser entrypoint (home page) for the extension’s web UI.  
- `src/public/pair.html` is a secondary page (pairing modal) reachable via client-side navigation from `index.html`, not a direct server route.  
- In the absence of a `.sideline/game.json` declaration or conventional dev scripts, Sideline can rely on server routing logic or public asset lists to identify the entrypoint.  
- The presence of `src/public/sw.js` (a service worker) alongside the HTML files further supports that `src/public/index.html` is the PWA entry point (likely registering the service worker).  

### UNKNOWN
- Whether `src/public/pair.html` is ever served directly by the server (no route observed in the examined code).  
- If there are any alternative entry points (e.g., a different port or proxy) not visible in the provided source (though the server binds to `127.0.0.1:{port}` from configuration).  
- How GS3 structures its HTML entrypoint (due to permission restrictions preventing access to `C:\Users\dmcal\Documents\GitHub\GS3`).  

### CONTRADICTION
- No contradictory evidence was found; all signals consistently point to `src/public/index.html` as the browser entrypoint.  

### IMPORTANT FILES / PATHS
- `package.json` – shows public asset declarations.  
- `src/server.ts` – contains the routing logic that serves `index.html` at root.  
- `src/public/index.html` – the served HTML file.  
- `src/public/pair.html` – secondary HTML file linked from index.html.  
- `src/public/sw.js` – service worker, correlates with the public HTML asset.  

### GS3 FINDINGS (LIMITED)
Due to permission restrictions, the Scout could not access the GS3 repository at `C:\Users\dmcal\Documents\GitHub\GS3`. Therefore, no concrete GS3-specific facts were gathered. The analysis above is derived solely from the SidelineCoach codebase, with generic reasoning about browser entrypoint discovery that would apply to GS3 and similar projects.

### GENERIC DISCOVERY SIGNALS (EVIDENCE-BACKED FROM THIS REPO)
1. **Server routing for root path** – seen in `src/server.ts` (lines 233-235).  
2. **Public asset list in `package.json`** – `"files"` array includes HTML files (lines 24-26).  
3. **Service worker co-location** – `src/public/sw.js` suggests the HTML in the same directory is the PWA entry.  
4. **Client-side navigation hints** – `index.html` contains logic that changes `location.pathname` to `/pair` (lines 6270-6285), indicating relationship between HTML files.  

### AMBIGUITY CASES & MINIMAL HUMAN CHOOSER
- **Case**: Multiple HTML files in a public directory with no distinguishing server route or asset list ordering.  
- **Resolution**: Sideline could expose a configuration setting (e.g., `coach.browserEntrypoint`) or rely on the user’s last selected entry (remembered choice) when automated signals are insufficient.  
- **In this repo**: No ambiguity exists because the server route explicitly selects `index.html`.  

### EVIDENCE-BACKED CANDIDATE HIERARCHY (FOR SIDELINECOACH)
1. **`src/public/index.html`** – *strongest candidate*:  
   - Served at root server route (FACT).  
   - Listed in `package.json` `"files"` (FACT).  
   - Contains service worker registration logic (INFERENCE).  
   - No incoming links from other project HTML files (observed in code: no other HTML file links to `index.html`).  
2. **`src/public/pair.html`** – *weaker candidate*:  
   - Listed in `package.json` `"files"` (FACT).  
   - Linked from `index.html` via client-side navigation (FACT).  
   - No direct server route observed (likely only reachable through `index.html`).  

---  
*This report is reconnaissance, not final architectural authority. Evidence is drawn from the current source only; no modifications were made.*
