# Breadcrumb — Scout Intent Auto-Routing

**STATUS:** Product/routing improvement identified  
**AREA:** Sideline Coach → AUTO Play Dispatcher → Scout Routing  
**PRIORITY:** Medium  
**DATE:** 2026-09-25

## Field Observation

A Play beginning with language such as:

```text
SCOUT PLAY — Missing Inline Read Button

MODE: READ-ONLY RECONNAISSANCE
DO NOT MODIFY FILES.
```

was not recognized by AUTO routing as a Scout task.

Instead, the dispatcher staged:

```text
Codex · GPT-6-Astra · Low
```

and produced:

```text
Unrecognized model 'READ-ONLY RECONNAISSANCE' requested.
Coach did not choose another model because this Play explicitly constrained the model.
```

This is incorrect interpretation.

`READ-ONLY RECONNAISSANCE` is a **task mode / role instruction**, not a model request.

---

## Desired Behavior

AUTO routing should recognize strong Scout intent anywhere near the beginning of a Play and automatically route the task to the available **Scout Player**.

Examples of strong Scout signals:

```text
SCOUT PLAY
SCOUT
MODE: SCOUT
SCOUT / RECONNAISSANCE
READ-ONLY RECONNAISSANCE
READ ONLY RECONNAISSANCE
RECONNAISSANCE ONLY
DO NOT MODIFY FILES
INVESTIGATE AND REPORT ONLY
FORENSIC / READ-ONLY AUDIT
```

A Play such as:

```text
SCOUT PLAY — Missing Inline Read Button

MODE: READ-ONLY RECONNAISSANCE
DO NOT MODIFY FILES.
```

should result approximately in:

```text
AUTO
→ Intent: Scout / read-only reconnaissance
→ Player: Scout
→ Effort: Medium
```

The human should not have to manually change the staged route.

---

## Important Parsing Rule

Role/mode language must be parsed **before model constraints**.

For example:

```text
MODE: READ-ONLY RECONNAISSANCE
```

must NOT become:

```text
requestedModel = "READ-ONLY RECONNAISSANCE"
```

Instead:

```text
taskMode = "read-only reconnaissance"
intent = "scout"
```

Model detection should only activate when the value resembles a legitimate model/provider declaration or appears under explicit model fields such as:

```text
MODEL:
MODEL REQUEST:
AGENT / MODEL:
PLAYER / MODEL:
```

---

## Signal Strength

Do not route every use of the word `reconnaissance` to Scout automatically.

Recommended hierarchy:

### Strong / decisive Scout intent

Any of:

```text
SCOUT PLAY
MODE: SCOUT
READ-ONLY RECONNAISSANCE
RECONNAISSANCE ONLY
SCOUT / RECONNAISSANCE
```

→ Auto-route to Scout.

### Supporting Scout signals

Combinations such as:

```text
DO NOT MODIFY FILES
READ ONLY
INVESTIGATE
AUDIT
REPORT BACK
FIND ROOT CAUSE
INSPECT ONLY
```

should increase Scout confidence.

### Weak signal

The word:

```text
reconnaissance
```

by itself inside ordinary prose should not necessarily force Scout routing.

---

## Default Effort

For an automatically identified Scout/reconnaissance task:

```text
Default effort: Medium
```

unless the selected Scout Player/profile has an explicit fixed model or effort policy that should take precedence.

The goal is enough reasoning for useful forensic work without unnecessarily escalating to premium implementation-grade intelligence.

---

## Human Choice Still Wins

Explicit human routing must override inference.

Examples:

```text
AGENT: Codex
MODEL: ...
```

or a manually selected Player should remain authoritative.

AUTO routing only applies when the human has not made a conflicting explicit choice.

---

## WAS → IS → WHY → WILL BE

**WAS**

AUTO routing could encounter:

```text
MODE: READ-ONLY RECONNAISSANCE
```

and misinterpret the mode text as a requested model.

**IS**

Scout intent is semantically different from model selection and should be recognized from task language.

**WHY**

The user should be able to write natural orchestration language such as:

```text
SCOUT PLAY
READ-ONLY RECONNAISSANCE
DO NOT MODIFY FILES
```

without manually selecting Scout afterward.

**WILL BE**

AUTO routing should classify the Play first:

```text
intent
→ role/player family
→ effort
→ model
```

rather than attempting model extraction before understanding what kind of work is being requested.

---

## Desired Routing Principle

```text
Understand the job first.
Choose the Player second.
Choose the model third.
```

Not:

```text
Search arbitrary header text for something that looks like a model name.
```

---

## Smallest Future Play

Improve AUTO routing classification so explicit Scout/read-only-reconnaissance language:

1. cannot be misparsed as a model constraint;
2. automatically selects Scout when available;
3. defaults to Medium effort;
4. preserves explicit human Player/model choices;
5. treats generic `reconnaissance` alone as supporting rather than decisive evidence.