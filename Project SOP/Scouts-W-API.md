# SIDELINE COACH — DEV HOST SCOUT LAUNCH ONBOARDING

## PURPOSE

Use this whenever manually launching Scout Formations while developing Sideline Coach itself from the **Extension Development Host / VS Code terminal**.

Sideline Coach cannot Sideline Coach itself through the normal browser Game flow, so development Scouts are launched through the repository terminal using the canonical Scout runner.

Repository:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach`

---

# 1. OPEN A NEW VS CODE TERMINAL

Use:

`Ctrl + ``

The second key is the backtick key, usually directly below Esc.

Use a **new integrated terminal** so it inherits Dad's VS Code startup environment.

---

# 2. OPENROUTER API KEY IS ALREADY CONFIGURED

Dad already stores `OPENROUTER_API_KEY` in VS Code User Settings JSON / terminal startup environment.

DO NOT:

- ask Dad to paste the API key
- use `Read-Host`
- print the raw key
- put the key in a manifest
- put the key in prompts/reports/source

Simply verify it exists:

```powershell
if (-not $env:OPENROUTER_API_KEY) {
    throw "OPENROUTER_API_KEY is missing. Open a NEW VS Code integrated terminal and retry."
}

Write-Host "OPENROUTER READY:" ([bool]$env:OPENROUTER_API_KEY)
```

Expected:

`OPENROUTER READY: True`

If false, open a NEW integrated terminal before troubleshooting anything else.

---

# 3. DO NOT MANUALLY SET OPENCODE_DB

Current Scout runner owns per-attempt database isolation.

DO NOT manually set:

`$env:OPENCODE_DB`

DO NOT build custom OpenCode wrappers.

DO NOT hand-roll PowerShell `Start-Job` Scout processes.

The canonical runner owns:

- Play identity
- Scout attempts
- database isolation
- concurrency
- substitutions
- receiver/model selection
- provenance
- game film
- final Formation report

---

# 4. CREATE A FORMATION MANIFEST

A Scout Formation manifest should define:

- unique `playId`
- Sideline Coach repository as `gameRoot`
- `maxConcurrency`
- Scout lanes
- Scout aliases
- bounded reconnaissance objectives

Current useful Scout aliases:

- `sideline-scout-quick`
- `sideline-scout`
- `sideline-scout-balanced`
- `sideline-scout-deep`

Current receiver mapping commonly seen:

- Quick → Cohere North Mini Code free
- Scout → Poolside Laguna S 2.1 free
- Balanced → NVIDIA Nemotron 3 Super free
- Deep → NVIDIA Nemotron 3 Ultra free

Receiver availability can change.

Let the runner perform its normal substitution logic if a receiver is unavailable.

---

# 5. GENERIC MANIFEST TEMPLATE

Example PowerShell shape:

```powershell
cd "C:\Users\dmcal\Documents\GitHub\SidelineCoach"

if (-not $env:OPENROUTER_API_KEY) {
    throw "OPENROUTER_API_KEY is missing. Open a NEW VS Code integrated terminal and retry."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$playId = "YOUR-PLAY-NAME-$stamp"
$manifest = Join-Path $env:TEMP "$playId.json"

$formation = @{
    playId = $playId
    gameRoot = (Get-Location).Path
    maxConcurrency = 2
    substitution = "auto"

    scouts = @(
        @{
            id = "scout-a"
            agent = "sideline-scout-quick"
            objective = @'
READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not install packages.
Do not commit.
Do not push.

YOUR SCOUT OBJECTIVE HERE.
'@
        },

        @{
            id = "scout-b"
            agent = "sideline-scout-balanced"
            objective = @'
READ-ONLY RECONNAISSANCE.

Do not modify source.
Do not install packages.
Do not commit.
Do not push.

YOUR SECOND SCOUT OBJECTIVE HERE.
'@
        }
    )
}

$formation |
    ConvertTo-Json -Depth 8 |
    Set-Content -Path $manifest -Encoding UTF8

Write-Host "FORMATION:" $playId
Write-Host "MANIFEST:" $manifest

npm run scout:play -- --manifest "$manifest"
```

---

# 6. CANONICAL RUNNER

Always launch through:

```powershell
npm run scout:play -- --manifest "<manifest-path>"
```

For an existing Formation that must be rerun as a fresh attempt:

```powershell
npm run scout:play -- --manifest "<manifest-path>" --fresh
```

`--fresh` creates a new Play identity while preserving the previous attempt as game film.

Do not overwrite or erase previous Scout evidence.

---

# 7. WHAT SUCCESS LOOKS LIKE

The important lifecycle proof is:

```text
[QUEUED] scout-name · receiver
[RUNNING] scout-name · receiver
```

Once the real runner prints:

`QUEUED → RUNNING`

the launch path is working.

Leave the Formation alone and let it finish.

The terminal prompt normally does NOT return while the Scouts are still running.

---

# 8. SCOUT FAILURE IS NOT LAUNCH FAILURE

If a Scout reaches:

`QUEUED`

then:

`RUNNING`

and later reports:

`FAILED`

the launcher worked.

The failure now belongs to the:

- Scout receiver
- provider
- rate limit
- route
- temporary availability boundary

Do NOT restart debugging the launch system.

Let the rest of the Formation finish.

The runner should preserve the failed attempt and perform allowed substitution/recovery according to current runner policy.

---

# 9. EXPECTED FINAL OUTPUT

A completed Formation should produce:

- total elapsed time
- completed/failed lane counts
- receiver/model used
- substitution chain
- child Scout reports
- durable Scout Intelligence paths
- combined Formation report

Typical durable Scout evidence lives under:

`C:\Users\dmcal\.sideline\Scout Intelligence\<play-id>\`

Working Formation material may also exist under:

`C:\Users\dmcal\Documents\GitHub\SidelineCoach\Scouts\<play-id>\`

---

# 10. DEVELOPMENT NORTH STAR

Dad should spend attention on:

**THE PLAY → THE SCOUT FINDINGS → THE DECISION**

Dad should NOT repeatedly debug Scout launching.

Current Dev Host rule:

**New VS Code terminal**
→ **OPENROUTER_API_KEY already inherited**
→ **create manifest**
→ **npm run scout:play**
→ **QUEUED**
→ **RUNNING**
→ **let Formation finish**

Do not repurchase known context at premium-model cost.

Cheap/free Scouts may independently rediscover or verify known source truth.

**Scout duplication is acceptable. Premium duplication is the enemy.**