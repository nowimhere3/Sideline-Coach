# SIDELINE COACH — LOCAL CHECKPOINT SOP

PURPOSE

Keep development fast.

Agents write.
The Dev Host publishes.

Do not independently push breadcrumbs, reports, source changes, or documentation during normal development.

Everything legitimate produced during the development window travels together at the next checkpoint.

---

## CHECKPOINT TRIGGERS

Run a checkpoint when ANY of these happens:

* About one 5-hour development window has passed
* A major feature / Play / quarter is field-closed
* A major touchdown has been reached
* Before switching to another Game/repository
* Before ending the development day
* Before beginning risky architectural work

Dad may simply say:

CHECKPOINT. STAGE ALL BREADCRUMBS.

That activates this SOP.

---

## BREADCRUMB RULE

Breadcrumbs travel WITH the work they describe.

### Feature / implementation breadcrumb

If the breadcrumb belongs to a particular implementation seam:

Place it beside the owning code.

Example:

src/player-control/codex-app-server.ts

That breadcrumb remains part of the feature and is committed with that feature at the next checkpoint.

### Cross-cutting / architectural breadcrumb

If the breadcrumb is broader than one code seam:

Place it in the existing canonical architecture breadcrumb/documentation location.

Example:

Docs ANCHOR/ARCHITECTURE-BREADCRUMBS.md

It is still NOT pushed independently.

It travels with the next checkpoint.

### Deferred product idea

If the idea belongs to another future feature but needs durable preservation:

Record it in the appropriate canonical roadmap / breadcrumb document.

Do not force it into unrelated source code.

It still travels with the next checkpoint.

---

## AGENT RULE

Claude, Codex, AntiGravity, Scouts, and other development Players may:

* edit source
* edit tests
* create reports
* create code-local breadcrumbs
* update canonical breadcrumbs
* update SOPs
* move legitimate project files

They may NOT commit or push unless Dad explicitly authorizes a checkpoint/publish action.

One branch should have one publishing authority:

THE ACTIVE DEV HOST.

---

## DURING DEVELOPMENT

Do not stop development every time a file changes.

Do not perform Git cleanup after every Play.

Do not push individual breadcrumbs.

Keep moving the product forward.

Each Play should leave its breadcrumbs beside the work it owns.

---

## FILE MOVES

When intentionally moving tracked project files:

Prefer:

git mv <old-path> <new-path>

If Dad moves files manually in Explorer or VS Code, that is acceptable.

At checkpoint time, Git should verify the resulting delete/add or rename relationship.

Intentional moves travel with the checkpoint.

---

## GENERATED / RUNTIME MATERIAL

Generated runtime/scratch material is NOT normal source-control content.

Examples include:

* temporary Scout working roots
* provider snapshots
* transient databases
* temporary logs
* caches
* generated execution scratch directories

Durable Scout evidence belongs in its approved REPORTS / durable evidence location.

The checkpoint process must not blindly run git add -A across uncontrolled runtime forests.

---

## CHECKPOINT PROCESS

When Dad says:

CHECKPOINT. STAGE ALL BREADCRUMBS.

Assistant Coach must:

1. Identify the current branch.

2. Fetch remote state without altering local work.

3. Determine ahead / behind state.

4. Review the working tree as ONE development slice.

5. Include legitimate:

   * source
   * tests
   * documentation
   * reports
   * intentional file moves
   * code-local breadcrumbs
   * canonical breadcrumbs
   * approved tooling/configuration

6. Exclude:

   * runtime scratch data
   * caches
   * accidental shell-output files
   * temporary provider state
   * secrets
   * unrelated generated debris

7. Run the appropriate automated proof:

   * compile
   * check
   * focused tests when necessary
   * full suite when checkpoint risk warrants it

8. Stage the legitimate development slice.

9. Present a concise checkpoint summary.

10. Commit once with a meaningful checkpoint message.

11. Reconcile any remote commits safely.

12. Re-run verification if reconciliation changes the tree.

13. Push.

14. Confirm:

CHECKPOINT COMPLETE

Branch synchronized.
Legitimate work published.
Runtime debris excluded.
Ready for the next Game / development window.

---

## ASSISTANT COACH RESPONSIBILITY

Dad should NOT need to remember:

* which breadcrumbs changed
* which agent created them
* which report belongs to which Play
* which files were edited during the last five hours
* which individual Git commands to type

The working tree already contains that evidence.

Assistant Coach reconstructs the checkpoint from the Dev Host state.

Dad makes the final publish decision.

---

## SUCCESS CONDITION

A checkpoint should take minutes, not an hour.

The next morning should begin with product development, not reconstruction of yesterday's Git state.

Agents write.
Dev Host publishes.
Breadcrumbs travel with their feature.
Checkpoint at touchdowns.
Then keep moving.
