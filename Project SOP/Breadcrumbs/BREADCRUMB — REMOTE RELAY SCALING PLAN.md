# BREADCRUMB — REMOTE RELAY SCALING PLAN

## PRODUCT

Sideline Coach

Public brand domain:

`mysidelinecoach.com`

Current Remote Access architecture:

Desktop Sideline
→ outbound WSS
→ Sideline production relay
→ HTTPS/SSE
→ Dad's phone

Dad must NEVER configure hosting, DNS, TLS, ports, relay URLs, provider accounts, infrastructure secrets, or scaling.

Dad's North Star remains:

**Enable Sideline Coach → Run Plays → Send to Phone → Scan / Connect → BOOM → Coach comes with Dad.**

---

# CURRENT STAGE 4 BETA ARCHITECTURE

For the first real production deployment:

**ONE persistent relay instance.**

Likely initial provider:

Fly.io

Initial shape:

* 1 Node.js relay container
* 1 Fly Machine
* approximately 256–512 MB RAM
* shared CPU
* provider-managed HTTPS/WSS
* wildcard DNS/TLS
* in-memory relay state
* no database
* no Redis
* no distributed message bus
* no Kubernetes
* no Terraform
* no horizontal scaling
* no per-customer relay instance

The relay remains extremely lightweight.

Its primary jobs are:

* maintain desktop WSS connections
* route browser requests to the correct desktop
* stream responses/SSE
* enforce relay security boundaries
* perform heartbeat/reconnect coordination

---

# WHY SINGLE INSTANCE FIRST

Each connected desktop currently owns one live WebSocket attached to a specific relay process.

Example:

```text
Dad A Desktop
     │
     ▼
Relay Instance 1
     ▲
     │
Dad A Phone
```

This is deterministic and simple.

For one-user beta and early usage, one instance avoids unnecessary distributed-systems complexity.

---

# IMPORTANT SCALE BOUNDARY

Naively adding a second independent relay instance is NOT safe.

Example failure:

```text
Dad A Desktop
     │
     ▼
Relay Instance 1

Dad A Phone
     │
     ▼
Relay Instance 2
```

Instance 2 does not own Dad A's desktop socket.

It therefore cannot route the phone request correctly and may return:

`503 host_offline`

even though Dad's desktop is actually connected.

Therefore:

**HORIZONTAL SCALE REQUIRES HOST-AWARE ROUTING.**

---

# SCALE LADDER

## LEVEL 0 — DEVELOPMENT

Local/reference relay only.

Purpose:

* protocol
* security
* resilience
* testing

STATUS:

COMPLETE in Stage 3.

---

## LEVEL 1 — PRIVATE / ONE-USER BETA

One production relay instance.

Expected characteristics:

* one Fly Machine
* persistent
* inexpensive
* simple
* stateless on disk
* in-memory host map
* automatic desktop reconnect

Use this until actual utilization proves more capacity is required.

---

## LEVEL 2 — VERTICAL SCALE

Before introducing multiple relay processes:

**MAKE THE SINGLE RELAY BIGGER.**

Possible changes:

* 256 MB → 512 MB RAM
* 512 MB → 1 GB RAM
* larger shared CPU allocation
* increased connection/file-descriptor limits if necessary

This preserves the existing routing architecture.

Preferred scale strategy:

**VERTICAL FIRST.**

Do not introduce distributed routing merely because another Machine can be created.

---

# LEVEL 3 — MULTI-INSTANCE RELAY

Trigger:

Real measured capacity, availability, regional, or reliability requirements exceed what one relay instance should handle.

At this point Sideline must introduce deterministic host routing.

Possible future architectures include:

## OPTION A — LOAD-BALANCER AFFINITY

Route both:

* desktop host WSS
* browser traffic for that host

to the same relay instance based on:

`hostPublicId`

Example:

```text
hostPublicId ABC → Relay 1
hostPublicId XYZ → Relay 2
```

Requires infrastructure capable of deterministic routing.

---

## OPTION B — SHARED HOST DIRECTORY

Each relay registers:

`hostPublicId → relayInstanceId`

in a lightweight shared directory.

Possible future technologies:

* Redis
* NATS
* purpose-built routing service
* provider-native distributed state

Browser request reaches any edge relay.

Relay asks:

"Which relay owns Host ABC?"

Then forwards/routes appropriately.

This introduces distributed infrastructure and should NOT exist until needed.

---

## OPTION C — CONSISTENT HASH ROUTING

Hash:

`hostPublicId`

to select the target relay shard.

Example:

```text
hash(hostPublicId) % relayCount
```

Both host tunnel and browser traffic must follow identical routing.

Useful when deterministic routing is available at ingress.

Requires careful rebalance behavior when instance count changes.

---

# LEVEL 4 — REGIONAL RELAYS

Possible future scale:

```text
Calgary / Western Canada
US West
US East
Europe
Asia-Pacific
```

Desktop host may connect to nearest appropriate relay region.

Dad's phone traffic routes to the relay/region currently owning Dad's host.

Potential benefits:

* lower latency
* reduced cross-region bandwidth
* better resilience
* regional capacity isolation

Do NOT implement until usage justifies it.

---

# LEVEL 5 — HIGH AVAILABILITY

Future reliability goals may require:

* multiple instances
* host ownership directory
* health-aware routing
* connection migration
* deploy draining
* regional failover

Desktop RelayClient already helps because it supports:

* disconnect detection
* exponential reconnect
* fresh challenge/hello
* duplicate-host supersession
* graceful shutdown/goaway handling

Therefore future infrastructure may change without redesigning Dad's local application.

---

# PROVIDER PORTABILITY

The relay must remain container/provider-neutral.

Current likely deployment:

`Docker → Fly.io`

Future deployment may be:

`Docker → DigitalOcean`

or:

`Docker → Hetzner/VPS`

or:

`Docker → AWS/GCP/Azure`

or:

`Docker → Sideline-owned physical/cloud infrastructure`

Fly.io is NOT part of the Sideline protocol.

Fly.io is merely the first production hosting substrate.

The following remain Sideline-owned abstractions:

* RelayClient
* relay protocol
* hostPublicId
* enrollment
* host routing
* security boundaries
* Remote Access UI

Therefore Sideline must remain portable away from Fly.

---

# SELF-HOSTING FUTURE

Sideline may eventually operate its own server infrastructure.

The existing Docker architecture should permit:

```text
Same relay container
→ Sideline-owned VPS/server
→ reverse proxy / TLS
→ public internet
```

Self-hosting trades provider convenience for responsibility:

* OS/security updates
* uptime
* networking
* firewall
* TLS
* monitoring
* DDoS mitigation
* failover
* hardware/cloud capacity

Do not move away from managed hosting until economics or scale justify it.

---

# COST PRINCIPLE

Early relay traffic should be inexpensive because:

* one persistent lightweight process
* small request/control payloads
* no persistent database
* no media storage
* no GPU workload
* no AI inference performed by relay
* desktops execute their own local work
* relay mostly routes and streams

Therefore early cost should scale much more closely with:

**connected hosts + traffic**

than with:

**AI workload**

This is strategically important.

Sideline's cloud does NOT need to run Dad's Claude/Codex/Gemini workloads.

It transports commands/results between Dad and his own computer.

---

# FUTURE SCALE METRICS

Do NOT scale from intuition.

Record metrics such as:

* active host WebSockets
* peak concurrent hosts
* requests/sec
* SSE connections
* bytes/sec
* memory consumption
* CPU
* event-loop latency
* reconnect rate
* queue pressure
* queue overflow
* heartbeat timeout rate
* 5xx rate
* latency percentiles
* relay monthly cost

Scale only when real game film demonstrates the need.

---

# SCALE PRINCIPLE

**SIMPLE UNTIL PROVEN OTHERWISE.**

Preferred order:

```text
1 relay
→ bigger relay
→ deterministic multi-relay routing
→ regional relays
→ high availability
```

NOT:

```text
1 user
→ Kubernetes
→ Redis
→ service mesh
→ sadness
```

---

# DAD NORTH STAR

No scaling architecture may leak into Dad's experience.

Whether Sideline has:

* 1 relay
* 10 relays
* 100 relays
* multiple regions
* its own infrastructure

Dad still experiences:

**Enable Sideline Coach**

**Run Play**

**Send to Phone**

**Connect**

**BOOM**

The infrastructure must disappear behind the product.

---

# STATUS

BREADCRUMB ONLY.

Do not interrupt Remote Access Stage 4 implementation to build future scale infrastructure.

Scale architecture activates only when measured production usage justifies it.
