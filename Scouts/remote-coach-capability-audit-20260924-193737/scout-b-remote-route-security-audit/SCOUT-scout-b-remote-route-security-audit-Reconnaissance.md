**Sideline Coach Read‑Only Reconnaissance – Remote Route / Security Capability Audit**  
*Play ID: remote-coach-capability-audit-20260924-193737*  
*Scout ID: scout-b-remote-route-security-audit*  
*Model: openrouter/nvidia/nemotron-3-super-120b-a12b:free*  

---

## RESULT
The current `DAEMON_ROUTE_POLICIES` in `src/control-plane/remote-routes.ts` classifies many normal Coach operations as `local-only`, blocking them for authenticated remote‑device principals. Based on the product authority that a paired remote phone is a **first‑class Sideline Coach control surface**, the following endpoints should be re‑classified to allow remote access (either `remote-read` or `remote-mutate`) because they lack a concrete, evidence‑based security justification for remaining `local-only`. A narrower, endpoint‑specific policy should precede the broad `/api/players` and `/api/games/filesystem/` catch‑alls to avoid over‑blocking.

## KEY DISCOVERIES
1. **Player lifecycle mutations** (`/api/players/add`, `/api/players/adopt`, `/api/players/adopt-terminal`, `/api/players/helper-terminal`, `/api/players/instance/*/{field,bench,remove,send}`) are all blocked by the single regex `^/api/players(?:\/|$)` (line 57) despite involving no raw secrets or enrollment credentials.  
2. **Filesystem‑setup operations** (`/api/games/files/check`, `/api/games/files/absolute-path`, `/api/games/filesystem/reinspect`, `/api/games/filesystem/choose`, `/api/games/filesystem/restore`) are blocked by the broad `^/api/games/filesystem/` prefix (line 33) even though they are either read‑only or only mutate internal Coach state.  
3. **Preferences mutation** (`POST /api/preferences`) is `local-only` (line 63) but only writes non‑secret UI/behavior flags; the daemon already validates each field (lines 2524‑2552).  
4. **Game‑add/archive/restore** (`POST /api/game/(add|archive|restore)`) are `local-only` (line 54) yet represent normal game‑lifecycle operations that the product authority expects to work remotely.  
5. **Scout formation endpoints** (`GET /api/scout/formation-receivers`, `POST /api/scout/formation-run`) are `local-only` (lines 60‑61) but are gated by `devMode` in the daemon (lines 2474‑2477); making them `remote‑read`/`remote‑mutate` would still respect that gate.  
6. **Diagnostics** (`GET /api/diagnostics`) remains `local-only` (line 42) and may expose internal state; no concrete reason to change it was found.  
7. **Session, control‑plane, device, pairing‑creation, and scout credential endpoints** retain legitimate security reasons (raw API keys, enrollment credentials, device secrets, internal control surfaces) and should stay `local-only`.

## FACT
- `POST /api/players/discover` is explicitly `remote-read` (remote‑routes.ts line 56).  
- The regex `^/api/players(?:\/|$)` maps **all** player‑related POSTs to `local-only` (remote‑routes.ts line 57).  
- `POST /api/preferences` is `local-only` (remote‑routes.ts line 63).  
- `POST /api/games/files/check` is `local-only` (remote‑routes.ts line 29).  
- `POST /api/games/files/absolute-path` is `local-only` (remote‑routes.ts line 31).  
- `POST /^\/api\/games\/filesystem\//` is `local-only` (remote‑routes.ts line 33).  
- `POST /^\/api\/game\/(?:add|archive|restore)$/` is `local-only` (remote‑routes.ts line 54).  
- `GET /api/scout/formation-receivers` and `POST /api/scout/formation-run` are `local-only` (remote‑routes.ts lines 60‑61).  
- Daemon handler for `POST /api/players/add` forwards to `forwardPlayerLifecycle` / `forwardPlayerAction` (daemon.ts lines 2361‑2375) and does not handle raw secrets.  
- Daemon handler for `POST /api/players/adopt` and `/api/players/adopt-terminal` forwards to `forwardPlayerLifecycle` with `shellPid` (daemon.ts lines 2676‑2686).  
- Daemon handler for `POST /api/players/instance/:id/{field,bench,remove,send}` forwards to appropriate lifecycle actions (daemon.ts lines 2699‑2723).  
- Daemon handler for `POST /api/preferences` validates each preference field and writes to the preferences file (daemon.ts lines 2518‑2552).  
- Daemon handler for `POST /api/games/files/check` proxies a read‑only RPC to the game (daemon.ts lines 1517‑1543).  
- Daemon handler for `POST /api/games/files/absolute-path` proxies a read‑only RPC (daemon.ts lines 1589‑1630).  
- Daemon handler for `POST /api/games/filesystem/reinspect` may trigger filesystem reconciliation and contract apply (daemon.ts lines 1647‑1675).  
- Daemon handler for `POST /api/games/filesystem/choose` records a human folder choice (reports/sop) (daemon.ts lines 1687‑1744).  
- Daemon handler for `POST /api/games/filesystem/restore` clears a human folder choice (daemon.ts lines 1751‑1778).  
- Daemon handler for `POST /api/game/add` calls `handleAddGame` (daemon.ts lines 2312‑2315); `archive` and `restore` are registry‑only operations (daemon.ts lines 2317‑2348).  
- Daemon handler for `GET /api/scout/formation-receivers` and `POST /api/scout/formation-run` checks `devMode` and returns `404` if false (daemon.ts lines 2474‑2477).  
- `POST /api/session` creates an authenticated session and is therefore `local‑only` (remote‑routes.ts line 21).  
- `POST /^\/api\/control-plane\//` targets internal control‑plane routes and is `local‑only` (remote‑routes.ts line 22).  
- `POST /api/scout/openrouter-credential` handles OpenRouter API keys and is `local‑only` (remote‑routes.ts line 58).  
- `GET,POST /api/scout/bootstrap` handles bootstrap credentials and is `local‑only` (remote‑routes.ts line 59).  
- `GET,DELETE /api/devices` and `PATCH,DELETE /^\/api\/devices\/[^/]+$/` manage device secrets and are `local‑only` (remote‑routes.ts lines 67‑68).  

## INFERENCE
- Because the product authority expressly lists **Add Player / Add to Roster**, **Adopt Player / Adopt Terminal**, **Player on Bench > Retry**, **Coach Refresh**, **Dev Mode**, **Player guts / terminal inspection**, **filesystem browsing / folder selection**, **routing controls**, **Coach Routines**, **ordinary Settings interactions**, and **normal game operations** as intended mobile capabilities, the corresponding endpoints lack a concrete security reason to remain `local-only`.  
- The principle “Touches the host” is **not** sufficient for local‑only classification; none of the inferred safe endpoints involve raw API keys, enrollment credentials, provisioning secrets, authentication tokens, device secrets, private cryptographic material, or similarly sensitive bootstrap/security material.  
- The daemon already validates or gates many of these operations (e.g., preference field validation, `devMode` check for Scout formation, session creation for `/api/session`), so moving the route classification to `remote‑read` or `remote‑mutate` would not weaken security beyond the existing checks.  
- A **narrow‑first** approach (adding explicit policies for each safe endpoint before the broad catch‑alls) follows the principle of least privilege and avoids accidentally swallowing safe operations.  

### Specific safe re‑classifications (proposed)
| Endpoint | Current | Proposed | Reasoning |
|----------|---------|----------|-----------|
| `POST /api/players/add` | local-only | remote‑mutate | Adds a player (terminal or provider); no secrets; daemon forwards to player lifecycle. |
| `POST /api/players/adopt` | local-only | remote‑mutate | Adopts a human terminal as a Player; uses `shellPid` only. |
| `POST /api/players/adopt-terminal` | local-only | remote‑mutate | Same as adopt. |
| `POST /api/players/helper-terminal` | local-only | remote‑mutate | Creates a helper terminal for auth/install; validates input. |
| `POST /api/players/instance/:id/field` | local-only | remote‑mutate | Puts player instance on field; forwards to lifecycle. |
| `POST /api/players/instance/:id/bench` | local-only | remote‑mutate | Takes instance off field; forwards to lifecycle. |
| `POST /api/players/instance/:id/remove` | local-only | remote‑mutate | Removes instance; forwards to lifecycle. |
| `POST /api/players/instance/:id/send` | local-only | remote‑mutate | Sends text to terminal; daemon validates text length. |
| `POST /api/preferences` | local-only | remote‑mutate | Writes UI/behavior prefs; daemon validates each field; no secrets. |
| `POST /api/games/files/check` | local-only | remote‑read | Read‑only check of game‑relative paths; proxies to game. |
| `POST /api/games/files/absolute-path` | local-only | remote‑read | Read‑only resolution of absolute path; proxies to game. |
| `POST /api/games/filesystem/reinspect` | local-only | remote‑mutate | Triggers reconciliation and contract apply; filesystem access alone insufficient for local‑only. |
| `POST /api/games/filesystem/choose` | local-only | remote‑mutate | Records human folder choice (reports/sop); mutates internal state only. |
| `POST /api/games/filesystem/restore` | local-only | remote‑mutate | Clears human folder choice. |
| `POST /api/game/add` | local-only | remote‑mutate | Normal game‑add operation; daemon’s `handleAddGame` does not involve secrets. |
| `POST /api/game/archive` | local-only | remote‑mutate | Archive is registry‑only. |
| `POST /api/game/restore` | local-only | remote‑mutate | Restore is registry‑only. |
| `GET /api/scout/formation-receivers` | local-only | remote‑read | Already gated by `devMode` in daemon; safe to expose remotely. |
| `POST /api/scout/formation-run` | local-only | remote‑mutate | Same gating; safe. |

All other endpoints listed in the **FACT** section that involve raw secrets, internal control surfaces, or device credentials should **remain** `local-only`.

## UNKNOWN
- Whether the `POST /api/games/filesystem/reinspect` operation could ever modify host files in a way that poses a risk (e.g., changing permissions) is not fully observed from the source; however, the principle that “filesystem access” alone is insufficient for local‑only classification leads to the inference that it is safe to allow remote‑mutate.  
- The exact threat model for allowing remote `POST /api/players/instance/:id/send` (sending arbitrary text to a terminal Player) is not fully detailed in the source; we infer it is safe because the terminal is already under Coach control and the remote principal is an authenticated Coach.  
- Whether the `POST /api/game/add` operation could launch a game with arbitrary command‑line arguments that affect the host is not examined; we infer it is safe because the product authority expects normal game operations to work remotely.

## CONTRADICTION
- No direct contradictions were found in the source; the only tension is between the existing broad `local-only` catch‑alls and the product authority’s explicit list of intended mobile capabilities. The source does not provide a concrete security justification for those catch‑alls beyond general host‑touching concerns, which the product authority explicitly rejects as sufficient reason.

## IMPORTANT FILES / PATHS
- `src/control-plane/remote-routes.ts` – route‑policy definitions (lines 15‑70).  
- `src/control-plane/daemon.ts` – handler implementations for the endpoints cited above (see specific line numbers in FACT).  
- `src/control-plane/request-security.ts` – `Principal` type and `principalMayAccess` (used by remote‑routes.ts).  
- `src/public/index.html` – shows UI usage of many endpoints (e.g., player add, adopt, preferences) but is not part of the policy layer.  

---

**Note:** This report is **read‑only reconnaissance**. It reflects the current source truth and does not constitute final architectural authority. Any changes to route policy must be evaluated by the game’s maintainers against the full threat model.
