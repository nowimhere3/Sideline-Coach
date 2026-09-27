# Sideline Coach Notification Reconnaissance Report

**Scout ID:** notification-runtime-capability  
**Agent:** sideline-scout-balanced  
**Model:** openrouter/nvidia/nemotron-3-super-120b-a12b:free  
**Play ID:** ai-usage-alarm-threshold-architecture-20260925-084136  
**Date:** Fri Sep 25 2026  

---

## CURRENT RUNTIME CAPABILITIES

**FACT:** No browser Notification API usage is present in the codebase.  
- Search for `new Notification`, `webkitNotifications`, `Notification.permission`, `showNotification` yields no matches in source files.  
- The main UI (`src/public/index.html`) contains an inline script (lines 2302+) that handles EventSource and UI updates but does not request or show browser notifications.  

**FACT:** No service worker registration or push messaging infrastructure exists.  
- No `navigator.serviceWorker.register` calls found.  
- No references to `PushManager` or service worker-related code in source (only a mention in a markdown report about missing features).  

**FACT:** No native OS notification invocation (e.g., via `node-notifier`) is implemented in the Node.js daemon or extension.  
- Search for `node-notifier`, `notifier` returns no matches.  
- The daemon (`src/control-plane/daemon.ts`) handles JsonRpcNotifications for internal communication only (e.g., `game.connected`, `roster.snapshot`).  
- The extension (`src/extension.ts`) shows notifications via VS Code API (`vscode.window.showInformationMessage`, etc.) but not via OS-native notification channels.  

**FACT:** The Sideline Coach architecture consists of a VS Code extension (`src/extension.ts`) that spawns a Node.js control-plane daemon (`src/server.ts` → `src/control-plane/daemon.ts`). The daemon communicates with the webview UI (`src/public/index.html`) via `StadiumClient` (JsonRpc over WebSocket).  
- Extension uses `vscode` module to show status bar messages and information/warning/error popups within VS Code (e.g., lines 180, 312, 314, 319 in `extension.ts`).  
- The daemon runs on the host machine and can access Node.js APIs but currently does not trigger any OS notifications.  

**FACT:** The webview origin is `localhost` (or a secure `h-<hostPublicId>.<relayDomain>` for remote access).  
- Localhost is considered a secure origin for web platform features (including Notification API and Service Workers) per MDN web docs.  
- The pairing page (`src/public/pair.html`) and main UI (`src/public/index.html`) are served from `localhost` with no TLS, which is sufficient for secure-context features.  

---

## BROWSER NOTIFICATION PATH

**INFERENCE:** Browser notifications are technically feasible but not currently implemented.  
- Because the app runs on `localhost` (a secure origin), `Notification.requestPermission()` and `new Notification()` would be functional if called from the webview script.  
- No user gesture is required to check permission state, but requesting permission must occur in response to a user action (e.g., button click) to avoid automatic denial.  
- Once granted, notifications would be displayed by the browser’s notification system and would appear regardless of tab visibility (visible, background, minimized) as long as the browser process is running.  
- If the browser is closed, notifications would not be shown unless a service worker with push subscription is active (not implemented).  

**LIMITATIONS:**  
- Reliance on the browser being open; alarms would not fire if the Sideline Coach tab/window is closed.  
- Permission UX would require explicit user consent, which could be perceived as nagging if not tied to a meaningful action (e.g., enabling an alarm).  
- No current code path exists to trigger browser notifications; implementing would require adding permission requests and notification calls in the webview script or extension.  

---

## BACKGROUND / SERVICE-WORKER PATH

**INFERENCE:** A service worker could enable background push notifications but is not present and would require additional infrastructure.  
- A service worker registered on `localhost` could subscribe to push messages (via VAPID or a custom push server) and show notifications even when the webview is closed.  
- The existing architecture does not include a push server; the daemon communicates over WebSocket with connected clients only. Adapting this to push would necessitate either:  
  1. Adding a standard push service (e.g., using web-push library) to the daemon, or  
  2. Repurposing the existing WebSocket to act as a push channel (non-standard, would require keeping sockets open and handling reconnects).  
- Service workers also introduce complexity around lifecycle, updates, and caching, which are not currently needed for the app.  

**LIMITATIONS:**  
- No service worker code exists; registration, push subscription, and message handling would need to be built from scratch.  
- For localhost, self-hosted push is possible but adds moving parts (VAPID key management, endpoint enforcement).  
- If the daemon is not running, push messages cannot be relayed; the daemon must be active to forward alarm triggers to the service worker.  

---

## NATIVE HOST POSSIBILITY

**INFERENCE:** The host-side Node.js daemon could invoke OS-native notifications but does not currently do so.  
- The daemon has access to `node:os` and `node:child_process` and could call platform-specific notification tools (e.g., `osascript` on macOS, `powershell` on Windows, `notify-send` on Linux) or use a library like `node-notifier`.  
- The VS Code extension (`src/extension.ts`) already shows notifications via the VS Code API (`vscode.window.showInformationMessage`), which are surfaced within the IDE (not native OS toast).  
- No evidence of any native notification invocation in the daemon or extension.  

**LIMITATIONS:**  
- Currently zero implementation; would require adding a notification abstraction and calling it from alarm detection logic (likely in the daemon or extension).  
- Native notifications would appear regardless of whether VS Code or the browser is open, as long as the host daemon is running.  
- If the daemon is stopped (e.g., when Sideline Coach is shut down), native notifications would cease.  

---

## PERMISSION UX

**INFERENCE:** For browser notifications, permission should be requested when the user explicitly enables an alarm feature, with clear explanation and a single request to avoid nagging.  
- Best practice: show a UI toggle for “Enable browser notifications for alarms”; on turn-on, call `Notification.requestPermission()` and handle the outcome (granted → proceed; denied → disable toggle and inform user; default → keep toggle off).  
- For VS Code notifications, no extra permission is needed because the extension already has the capability to show messages within VS Code (granted by extension installation).  
- To avoid nagging, the system should remember the user’s choice (denied/granted) and not repeatedly prompt unless the user revises settings.  

**FACT:** The extension already shows VS Code notifications without additional permission prompts (e.g., connection status messages). This indicates that the host environment permits the extension to display UI elements.  

---

## LIMITATIONS

- **Browser notifications:** Require the browser/Sideline Coach tab to be open; no fallback if closed.  
- **Service worker path:** Not implemented; would add significant complexity and reliance on a push mechanism not present in current architecture.  
- **Native host notifications:** Not implemented; would require new code in daemon or extension but could reach the user even if the UI is not focused.  
- **VS Code notifications (existing):** Only work when VS Code is running; if the user closes VS Code, no notifications are delivered.  
- **Machine sleep/wake:** Any timer-based alarm would likely misfire after sleep because JavaScript timers pause; the daemon would need to use persistent timers or real-time clock alarms to be accurate across sleep cycles.  

---

## RECOMMENDED PHASE-1 NOTIFICATION CHANNEL

**RECOMMENDATION:** Use the existing VS Code notification mechanism via the extension (`vscode.window.showInformationMessage`, `showWarningMessage`, `showErrorMessage`) for Phase-1 alarm notifications.  

**Rationale:**  
- **Zero additional implementation:** The extension already calls these methods for other purposes (e.g., connection status).  
- **No new permission UX:** Users grant notification capability implicitly by installing the extension; no extra prompts are needed.  
- **Works while VS Code is active:** Sideline Coach is likely used during coding sessions when VS Code is open, making this channel contextually appropriate.  
- **Leverages existing trust:** Users already see informational messages from the extension, so alarm notifications would be consistent with established UX.  
- **Fallback considerations:** For users who close VS Code but still need alarms, a future phase could evaluate native host notifications via the daemon (Phase-2).  

**Implementation note:** Alarm detection logic (likely in the daemon or extension) should invoke the appropriate VS Code notification method when an alarm threshold is crossed, with optional severity mapping (e.g., info for low, warning for medium, error for high). To avoid excessive noise, consider coarse-grained throttling or user-configurable mute periods.  

**Evidence:**  
- Extension usage: `src/extension.ts` lines 180, 312, 314, 319, 330, 337, 341, 362, 364, 562 (all `vscode.window.show*Message`).  
- No existing browser or native notification code (searches above).  

---  
**End of Report**  
*This is reconnaissance, not final architectural authority. Evidence is prioritized; inference is labeled where certainty is lacking.*
