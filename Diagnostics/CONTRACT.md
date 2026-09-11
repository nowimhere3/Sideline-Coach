# Sideline Coach RM-1 Contract

Snapshot schema: `1`. Collector: `preflight` (Stage A). Freshness horizon: ten minutes. The fixed section order is `HEADER`, `VERDICT`, `IDENTITY`, `LAUNCH`, `SERVER`, `WORKSPACE`, `PLAYERS`, `REPORTS`, `REFERENCES`.

Every value is labelled by its origin in the rendered description: observed during this run, reported by an existing owner, derived by a stated rule, or unknown. `unknown` is never converted to absence or success.

The preflight collector reads only: the extension repository, launch/task/settings configuration, a bounded sibling-directory scan, Windows TCP and ephemeral-port queries, bounded VS Code log evidence, and a bounded report-file scan. It writes only `Diagnostics/local/CURRENT.md`. It does not import VS Code APIs or alter the extension, workspace, server, configuration, reports, terminals, or Git state.

Player availability, on-field Player-instance state, and the proof-only per-Game Player provenance table are activation-time truth owned by the single activation-lifetime `PlayerRoster`; CoachServer consumes its safe projection. The table is inside VS Code `workspaceState`, so the external preflight collector cannot observe it and its `PLAYERS` section remains explicitly unknown. A future in-extension collector must reuse that owner rather than re-derive terminal state.

The Player Control Host owns the per-Game controlled-binding table plus controlled transport and restore truth. Future diagnostics may observe binding discovery/drop/quarantine, restore attempts, provider version/auth results, resume outcomes, restored readiness, previous-Play outcomes, and Leave Field, but never restore, resend, retry, cancel, repair, delete, or mutate bindings. Because the current table is inside VS Code `workspaceState`, the external preflight collector cannot inspect it and must report it as unknown.

The browser is Connected only after it receives SSE `hello` and successfully fetches and renders the canonical status-and-reports projection from the current Coach runtime. Connection loss leaves it explicitly Reconnecting and prevents live mutations until that verification succeeds. Future diagnostics may expose browser connection state, last successful canonical synchronization, or a runtime/session generation; none is collected by this contract today.

Identity hashes are SHA-256 manifests over sorted source TypeScript files and built JavaScript files respectively. They are independent representations and are not compared for byte equality. `buildVerdict` is `built-current` only when the newest built file is at least as new as the newest source file; it is `not-built` when `out/` is absent.

Redaction is allowlist-first. Paths tokenize the Windows account segment as `C:\Users\<user>`. A token-shape guard redacts known secret prefixes and unbroken token-shaped values. `coach.publicUrl` is reduced to set/unset plus scheme; its host is never rendered. Report files contribute only count, filename, mtime, and derivable agent badge; their contents are never read.

Assertions are: A1 current build, A2 dependencies/compile feasibility, A3 explicit pre-launch task definition, A4 host target exists, A5 exactly one copy under the parent directory, A6 configured port outside the measured Windows ephemeral range, A7 activation/listener alignment (extension collector only), and A8 at least one matched report. Only failing applicable assertions appear in `VERDICT`, ordered by severity then ID.
