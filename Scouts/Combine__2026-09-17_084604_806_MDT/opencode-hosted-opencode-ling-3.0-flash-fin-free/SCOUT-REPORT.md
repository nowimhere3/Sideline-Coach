---

**SIDELINE COACH — SCOUT COMBINE TRYOUT REPORT**

**EXECUTIVE ANSWER**
The project's top-level manifest is `package.json`. The declared project name is **`sideline-coach`** (display name: "Sideline Coach"). It defines a real dependency: **`ws`** (`^8.21.3`), a WebSocket library. It also declares multiple scripts, configuration properties, and VS Code extension metadata.

---

**FACTS**
- **File path:** `package.json` (root of `C:\Users\dmcal\Documents\GitHub\SidelineCoach`)
- **Declared project name:** `"sideline-coach"` (line 2)
- **Display name:** `"Sideline Coach"` (line 3)
- **Version:** `0.1.0`
- **Publisher:** `local`
- **License:** `MIT`
- **Engine requirement:** `vscode ^1.95.0`
- **Real dependency (`dependencies`):** `"ws": "^8.21.3"` (line 143)
- **Dev dependencies include:** `typescript ^5.7.2`, `@types/node ^22.10.0`, `@types/vscode ^1.95.0`, `@types/ws ^8.18.1`, `@vscode/vsce ^3.6.0`
- **Scripts defined:** `diagnostics`, `dev:games`, `dev:verify`, `scout:play`, `scout:formation`, `scout:combine`, `scout:interchangeability`, `scout:verify`, `test`, `compile`, `watch`, `check`, `vscode:prepublish`, `package`
- **Contributes configuration:** 7 properties (`coach.autoStart`, `coach.port`, `coach.reportGlobs`, `coach.terminalAllowlist`, `coach.modelSwitches`, `coach.publicUrl`, `coach.maxPromptChars`, `coach.maxReportBytes`)
- **Activation events:** `onStartupFinished`, `onCommand:coach.startServer`, `onCommand:coach.stopServer`, `onCommand:coach.copyLatestReport`, `onCommand:coach.copyMobileUrl`

---

**INFERENCES**
- This is a VS Code extension project (evidenced by `engines.vscode`, `activationEvents`, `contributes` section, and `@types/vscode` devDependency).
- The `scout:combine` script (`npm run compile --silent && node tools/scouts/run-scout-combine.mjs`) directly relates to the current Scout Play being executed.
- The project is TypeScript-based (`tsconfig.json` present, `typescript` in devDependencies, `compile` script runs `tsc`).

---

**UNKNOWN**
- Whether `package.json` has a `homepage`, `repository`, or `bugs` field — none were present in the file.

---

**CONTRADICTIONS**
- None observed. The manifest is internally consistent.

---

**RELEVANT FILES**
- `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json` — the top-level project manifest
- `C:\Users\dmcal\Documents\GitHub\SidelineCoach\tsconfig.json` — TypeScript configuration (complements package.json)
- `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package-lock.json` — lock file confirming dependency resolution

---

**RECOMMENDED NEXT STEP**
No further action needed — the bounded objective has been fully resolved. The manifest identity and at least one real dependency (`ws`) have been cited from `package.json`.

---

**PROVENANCE**
- Source: `C:\Users\dmcal\Documents\GitHub\SidelineCoach\package.json`, read in full (145 lines).
- This report is reconnaissance, not final architectural authority.

---

**SCOUT PLAY ID:** `Combine__2026-09-17_084604_806_MDT-opencode-hosted-opencode-ling-3.0-flash-fin-free`
**CANONICAL PLAY HASH:** `sha256:dbd8f7e53f834e0bb3319df73f1e61399cb00c4a5874a2ac6828369255088d`
**STATUS:** COMPLETE
