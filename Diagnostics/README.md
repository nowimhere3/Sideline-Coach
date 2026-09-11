# Sideline Coach Diagnostics

Sideline Coach uses RUNTIME MEMORY (RM-1) for a small, on-demand snapshot of runtime-adjacent truth. Source describes intent; this folder tells a reader how to inspect what the machine observed.

Start with `local/CURRENT.md`. Check `generatedAt` and `FRESH`/`STALE` first. A snapshot older than ten minutes is stale evidence: regenerate it before relying on build, launch, server, or report facts.

Generate a fresh preflight snapshot with:

```text
node tools/diagnostics/snapshot.mjs
```

This is a read-only, zero-dependency developer tool. It is safe when the extension cannot activate. It writes only `Diagnostics/local/CURRENT.md` and prints identical Markdown to stdout. `local/` is a disposable, gitignored projection; it is never committed and it never flows back into product state.

Read `## VERDICT` first, then `## IDENTITY`, `## LAUNCH`, and `## SERVER`. The preflight collector can only observe evidence outside an activated extension. It deliberately reports terminal state, live workspace state, and listener ownership as `unknown (requires activated extension)` rather than guessing.

The artifact is secret-free by producer allowlist, not anonymous. It records tokenized paths, workspace names, and report filenames because those facts make diagnosis legible. It never records access tokens, cookies, headers, prompt text, report contents, terminal buffers, clipboard contents, environment-variable dumps, or public URL hosts. If your own names are sensitive, review the snapshot before pasting it.

Diagnostics observe; they never act. If a snapshot is stale or a value is `unknown`, say what evidence is missing rather than inventing certainty.
