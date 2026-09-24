**COMPLETED:** 2026-09-23 7:52 PM MDT
**TIMEZONE:** America/Edmonton · Calgary, Alberta

# Remote Access v1 — Stage 4B · Deployment Packaging

**Agent:** Claude Code (Sonnet 5, LOW). Packaging only. No deployment, provider account action, DNS, TLS, purchase, secret upload, commit or push. Nothing exists in Fly.

# VERDICT: `4B GREEN FOR 4C` — with `EXTERNAL PACKAGING VERIFICATION REQUIRED`

Container BUILD is **`UNVERIFIED — Docker unavailable`** on this machine (`docker: command not found`). The artifact set is complete, its build/runtime assumptions were validated by an equivalent local simulation (below), and the first real `docker build` happens in 4C (Fly remote builder) or any Docker host. That single item must not be treated as proven until then.

## Files changed
- NEW `relay/Dockerfile`
- NEW `relay/.dockerignore` (as requested) and `relay/Dockerfile.dockerignore` (identical copy; see build-context decision)
- NEW `relay/fly.toml`
- No change to relay protocol or to `package.json`/build config beyond what 4A already made.

## Docker architecture
Multi-stage, `node:22-bookworm-slim`:
1. **build** — `npm ci --ignore-scripts` from `package.json` + `package-lock.json` (deterministic), then copies ONLY `tsconfig.json`, `relay/`, and the two shared sources `src/control-plane/relay-frames.ts` + `host-identity.ts`, and runs `npx tsc -p relay`.
2. **runtime** — `npm ci --omit=dev --ignore-scripts` (the only production dependency is `ws`), then copies the compiled `out/relay-build` from the build stage.
`CMD ["node","out/relay-build/relay/index.js"]`. No framework added.

## Runtime contents
`node_modules/ws` + `out/relay-build/{relay,src/control-plane}` compiled JS. Measured in the local simulation: `node_modules` 199 KB, `out` 98 KB. No TypeScript, tests, reports, Scout material, `.git`, `.env` or docs.

## Non-root / runtime security
`USER node`; `NODE_ENV=production`; `EXPOSE 8080`; `ENV PORT=8080` is the only `ENV` besides `NODE_ENV` and is non-secret; no `ARG`s. `STOPSIGNAL SIGTERM` (relay drains ≤ 5 s). Built-in `HEALTHCHECK` calls `GET /health` with Node's `fetch` (same Stage 4A endpoint, no second implementation). Node runs as PID 1 and handles SIGTERM itself (no `tini`; acceptable for a single process, revisit if zombie children ever appear).

## Build context decision
Context = **repository root** (`docker build -f relay/Dockerfile .`), because the relay compiles two files from `src/control-plane`. The Dockerfile's narrow `COPY` list, not the ignore file, guarantees image contents. `.dockerignore` excludes `.git`, `.env*`, keys, `node_modules`, `out`, `REPORTS`, `Project SOP`, `test`, `docs`, Scout Intelligence, editor/temp files, and does not exclude anything the build needs. Docker only honours `.dockerignore` at the context root or `<Dockerfile>.dockerignore` beside the Dockerfile, so an identical `relay/Dockerfile.dockerignore` was added next to the requested `relay/.dockerignore`. A root-level `.dockerignore` was deliberately not created.

## Fly manifest (`relay/fly.toml`)
One persistent Machine (`min_machines_running = 1`, `auto_stop_machines = "off"`, `auto_start_machines = true`, comment: never scale out because relay state is in memory); `internal_port = 8080`, `force_https = true`; `kill_signal = "SIGTERM"`, `kill_timeout = 10` (above the 5 s drain); `strategy = "rolling"`; shared-cpu-1x / 256 MB. Placeholders: `app = "REPLACE-WITH-APP-NAME-IN-4C"`, `primary_region` commented out. No domain, secret or TLS material. `[env]` carries only `PORT=8080` and `TRUST_PROXY="false"` (to be flipped only after 4C observes what the Fly edge puts in `X-Forwarded-For`; until then all clients share one limiter identity, which is safe but coarse).
Validation available without Fly tooling: the file parses cleanly as TOML (Python `tomllib`) and every key above is present with the intended value. Fly-side schema validation (key names, `--config`/`--dockerfile` context behaviour) was NOT possible without the Fly CLI (not installed, per instructions) and is a 4C check.

## Health config
Fly HTTP check `GET /health`, 15 s interval, 5 s timeout, 10 s grace; Docker `HEALTHCHECK` on the same path.

## Runtime env contract
Required: `PORT=8080` (image default), `RELAY_DOMAIN=<RELAY_DOMAIN>`, `ENROLLMENT_KEY=<secret>` (≥ 16 chars). Optional 4A controls unchanged: `TRUST_PROXY`, `BIND_HOST`, `DRAIN_MS`, `RATE_HANDSHAKE_PER_MIN`, `RATE_INVALID_BEFORE_BAN`, `BAN_MINUTES`, `RATE_HTTP_PER_MIN`, `RATE_PAIRING_PER_MIN`. Documented in the Dockerfile and `fly.toml` header comments. `RELAY_DOMAIN` and `ENROLLMENT_KEY` are supplied at run/deploy time only (in 4C via `fly secrets set`).

## Secret handling check
- `grep` of `relay/` and `package.json` finds no literal enrollment secret (the test constants live only in `test/`, which is neither copied into the image nor in the build context).
- The Dockerfile and `fly.toml` contain no `ENROLLMENT_KEY` value and no `ARG` that could carry it.
- The only `ENV` values are `NODE_ENV` and `PORT`; nothing in image history/config could hold a credential. (Image history/config inspection itself is UNVERIFIED without Docker.)

## Local packaging validation (Docker unavailable)
Not run: image build, image size, container start, `docker` cleanup.
Equivalent simulation, in a scratch directory that has exactly what the Dockerfile copies:
1. **Build stage:** copied only `package.json`, `package-lock.json`, `tsconfig.json`, `relay/`, and the two `src/control-plane` files; `npm ci --ignore-scripts` + `npx tsc -p relay` succeeded (exit 0) and produced exactly `relay/index.js`, `relay/reference-relay.js`, `src/control-plane/host-identity.js`, `src/control-plane/relay-frames.js`. This proves the COPY list is sufficient.
2. **Runtime stage:** fresh dir with `package.json` + lockfile, `npm ci --omit=dev --ignore-scripts` (only `ws` installed) and the compiled `out/relay-build`; ran the exact production command `node out/relay-build/relay/index.js` with env `PORT=0 BIND_HOST=127.0.0.1 RELAY_DOMAIN=relay.test ENROLLMENT_KEY=<random, generated at run time, never written to disk>`.
3. **Smoke results:** `/health` → `200`, `application/json`, `no-store`, body `{"status":"ok","uptime":0}`; upgrade without key → `403`; wrong key → `403`; correct key → `101` and a `challenge` frame (32-byte nonce); a real Ed25519 hello registered a host and a browser-shaped request to `h-<id>.relay.test` reached that host as a `req` frame (`/api/status`). The key appeared in neither stdout nor stderr. The process exited after `kill()` and no lingering process remained; scratch files were deleted.
This shows the build inputs, the minimal runtime tree and the production command work on Windows/Node; it does **not** prove the container build itself.

## Portability
Image is provider-neutral: no Fly SDK, no Fly-specific env or headers, no ACME/DNS/TLS. It runs anywhere with `docker run -e PORT=8080 -e RELAY_DOMAIN=… -e ENROLLMENT_KEY=… -p 8080:8080` (e.g. the DigitalOcean fallback). Fly specifics live only in `fly.toml`.

## Tests
- `npm run compile`: clean.
- `test/remote-access-v1-stage4-hardening.test.mjs`: **13 tests, 13 pass, 0 fail**.
- `test/remote-access-v1-stage3.test.mjs`: **48 tests, 48 pass, 0 fail**.
- No relay/protocol source was changed in 4B, so 4A/Stage 3 results are unchanged.

## Windows result
All validation ran on the Windows development machine (Node v24 locally; the image pins Node 22 LTS, which is not exercised here — 4C's build will run under 22).

## Breadcrumbs (NOT done in 4B)
1. **Desktop bootstrap still required before the first real production host connection (4C):** map `SIDELINE_RELAY_URL`, `SIDELINE_RELAY_DOMAIN`, `SIDELINE_ENROLLMENT_KEY` into `DaemonRemoteRelayConfig` (`relayUrl`, `relayDomain`, `enrollmentKey`). Internal plumbing only, never Dad-facing setup; the secret must not enter preferences, device files or logs (4A tests already assert that for the typed seam).
2. Verify in 4C: real `docker build`, image size and non-root start; `fly deploy --config relay/fly.toml --dockerfile relay/Dockerfile` build-context behaviour; `fly.toml` schema acceptance; what the Fly edge sends in `X-Forwarded-For` before enabling `TRUST_PROXY`; SSE/WebSocket idle behaviour through the edge; whether shared-cpu-1x/256 MB is enough.
3. Pin the base image by digest for reproducibility once a build succeeds.

## Deviations
- Added `relay/Dockerfile.dockerignore` (identical copy) because Docker will not read `relay/.dockerignore` when the context is the repo root.
- `fly.toml` `[env]` sets `TRUST_PROXY="false"` explicitly rather than trusting the Fly edge yet (the packet assumed it would).
- No lockfile/package changes were needed; `npm ci --omit=dev` works from the existing lockfile.

## Verdict for 4C
**`4B GREEN FOR 4C`** (`GREEN WITH EXTERNAL PACKAGING VERIFICATION REQUIRED`): container build/run is UNVERIFIED — Docker unavailable and must be confirmed by the first real build in 4C. Stage 4C was not started; nothing was deployed.

**COMPLETED:** 2026-09-23 7:52 PM MDT
**TIMEZONE:** America/Edmonton

C:\Users\dmcal\Documents\GitHub\SidelineCoach\REPORTS\Claude\Remote-Access-v1-Stage-4B-Deployment-Packaging__20260923__Claude.md
