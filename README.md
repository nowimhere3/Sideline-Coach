# Sideline Coach

A tiny VS Code extension that closes a phone ↔ desktop agent loop:

1. Agent CLIs write reports into `Docs REPORT/...`.
2. Your phone sees the newest report and copies it with one tap.
3. You discuss the report in ChatGPT mobile.
4. You paste the approved next prompt into Sideline Coach.
5. The extension sends it directly to a named, already-running VS Code terminal.

The server listens on **127.0.0.1 only**. Remote phone access is intended to go through an HTTPS reverse proxy such as **Tailscale Serve**.

## Files

- `package.json` — extension manifest and settings
- `src/extension.ts` — activation, commands, secret token, status bar
- `src/server.ts` — HTTP API, SSE, report scanner, terminal dispatch
- `src/public/index.html` — single-file mobile UI

## Prerequisites

- Desktop VS Code
- Node.js 20+ recommended
- npm
- Optional but recommended: Tailscale on the desktop and phone

## Build and run in Extension Development Host

```bash
npm install
npm run compile
```

Open this folder in VS Code and press **F5**. A new "Extension Development Host" window opens. Open your real project/workspace in that window.

Run **Coach: Start Dispatcher Server** if auto-start is disabled.

## Package and install as a VSIX

```bash
npm install
npm run compile
npm run package
```

This creates a file such as:

```text
sideline-coach-0.1.0.vsix
```

Install it from VS Code:

- Extensions panel → `…` → **Install from VSIX…**
- Or:

```bash
code --install-extension sideline-coach-0.1.0.vsix
```

Reload VS Code after installation.

## Recommended terminal setup

Create dedicated VS Code integrated terminals and rename them exactly:

- `Codex`
- `Claude`
- `AntiGravity`

Then start the corresponding agent CLI in each terminal.

Sideline Coach deliberately exposes only terminals listed in:

```text
coach.terminalAllowlist
```

Do **not** add generic terminals such as `PowerShell`, `bash`, or `cmd` to that allowlist. The extension can send text into a terminal, but it cannot prove that an agent TUI is still active. If an agent exits back to a shell, a dispatched prompt could otherwise be interpreted by that shell.

## Report layout

Default search/watch glob:

```text
**/Docs REPORT/**/*.{md,txt}
```

Example:

```text
GS3/
  Docs REPORT/
    Codex Reports/
      Stage-2.6.2-RM-1.md
    Claude Reports/
      Architecture-Review.md
```

The folder immediately below `Docs REPORT` becomes the **agent/source badge** in the phone UI.

## Phone access with Tailscale Serve — recommended

Keep the extension itself on localhost. Tailscale proxies HTTPS to it.

With Sideline Coach running on the default port:

```bash
tailscale serve 49152
```

For a persistent background Serve configuration:

```bash
tailscale serve --bg 49152
```

Tailscale prints an HTTPS URL similar to:

```text
https://your-desktop.your-tailnet.ts.net
```

Put that URL in VS Code Settings:

```text
coach.publicUrl
```

Then run:

```text
Coach: Copy Mobile URL
```

That command copies the HTTPS URL plus Sideline Coach's generated access token. Send/open that URL on your phone. The UI stores the token in `sessionStorage` and immediately removes it from the visible address bar.

To stop Tailscale Serve:

```bash
tailscale serve off
```

## Cloudflare Tunnel option

For quick testing:

```bash
cloudflared tunnel --url http://localhost:49152
```

Cloudflare prints an HTTPS `trycloudflare.com` URL. Put it in `coach.publicUrl`, then use **Coach: Copy Mobile URL**.

**Important:** a Quick Tunnel is publicly reachable on the internet. Sideline Coach still requires its secret token, but Tailscale Serve is the safer default for this workflow. For persistent Cloudflare use, put Cloudflare Access authentication in front of the tunnel.

## Settings

### `coach.autoStart`
Default: `true`

Starts the localhost server after VS Code startup.

### `coach.port`
Default: `49152`

Restart the Coach server after changing this.

### `coach.reportGlobs`
Default:

```json
["**/Docs REPORT/**/*.{md,txt}"]
```

You can add alternate report structures.

### `coach.terminalAllowlist`
Default:

```json
["Codex", "Claude", "AntiGravity"]
```

Only exact matching terminal names appear on mobile and are accepted by `/api/dispatch`.

### `coach.modelSwitches`
Default:

```json
{
  "Default": "",
  "Opus": "/model opus",
  "Sonnet": "/model sonnet"
}
```

These are deliberately editable because agent CLI model commands evolve. Only configured values are accepted by the server.

### `coach.publicUrl`
Default: empty

Set this to your Tailscale Serve or Cloudflare HTTPS base URL.

### `coach.maxPromptChars`
Default: `100000`

Rejects unexpectedly huge dispatch payloads.

### `coach.maxReportBytes`
Default: `2097152` (2 MiB)

Skips oversized report files in the mobile feed.

## API

All `/api/*` endpoints require either:

```text
Authorization: Bearer <token>
```

or, for SSE only, `?token=<token>`.

### `GET /api/status`
Returns workspace roots, currently open allowlisted terminals, model-switch options, and server status.

### `GET /api/reports/latest`
Returns the newest matching report including full content.

### `GET /api/reports`
Returns the five newest matching reports including content for instant switching on mobile.

### `GET /api/events`
SSE stream. Report watcher and terminal changes trigger mobile refreshes.

### `POST /api/dispatch`

```json
{
  "terminalName": "Claude",
  "modelSwitch": "/model opus",
  "prompt": "Implement the approved plan..."
}
```

The model switch is sent first when non-empty, followed by the prompt.

## Full feedback loop

**Desktop**

1. Open the project in VS Code.
2. Open/rename dedicated terminals (`Claude`, `Codex`, etc.).
3. Start each agent CLI.
4. Let agents write reports under `Docs REPORT`.
5. Ensure Sideline Coach is active in the status bar.

**Phone**

1. Open the Coach mobile URL.
2. Tap **Copy Report to Clipboard**.
3. Paste into ChatGPT mobile and decide the next move.
4. Copy ChatGPT's approved execution prompt.
5. Return to Sideline Coach.
6. Choose the target terminal and optional model switch.
7. Paste the prompt.
8. Tap **Dispatch Play**.

The desktop agent receives the play without Remote Desktop, file-tree hunting, or tiny-screen terminal archaeology.
