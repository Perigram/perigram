# AGENTS.md

This repository operates in strict documentation-first mode. This file is the
operating protocol only. It deliberately contains no project facts: no file
paths, no commands, no technologies, no architecture. All project knowledge
lives in the interlinked README.md tree. Agents acquire knowledge by reading
that tree, never by assuming, guessing, or hardcoding it. If a rule ever
names a concrete file, path, command, or stack detail, it belongs in the
README that owns the concern, not here.

## Documentation Model

README.md files form one interlinked documentation tree, scoped by C4
levels:

- **SYSTEM (always)** — repository root. Project overview, stack, container
  and component inventory, project-wide workflows and data flows.
- **CONTAINER (optional)** — separately deployable unit directories; used
  only when the project has multiple independently deployable units.
- **COMPONENT (always)** — every functional component directory. Detail
  sufficient to understand, maintain, and extend the component without
  grepping its code.
- **CODE (optional)** — sub-component directories with 3+ files and logic
  complex enough to warrant prose. Skip for self-explanatory utilities.

### README Contract

Every README.md must:

- Describe real architecture only: purpose, entry points, contracts (data
  structures, APIs, state machines, flows), conventions, and non-obvious
  decisions. No placeholders, no guesses, no trivial file listings, nothing
  the code already makes obvious.
- Link its parent README, and be registered in the parent's component
  inventory or documentation map.
- Link every related README whose contract it consumes or extends.
- Keep canonical content single-homed: a contract (registry, schema or DTO
  definition, state machine, workflow, API contract) lives in exactly one
  canonical README. Every other README links to it. Verbatim restatement
  across READMEs is a defect.

## Mandatory First Reads

Before changing files, read:

1. The root README.md.
2. The nearest README covering the area being changed, reached by following
   links from the root.
3. Every README whose contract the change consumes or extends, following
   links outbound until the changed concern is fully understood.

Keep reads bounded to the touched concern; do not explore unrelated areas.

## Documentation Enforcement

These rules are blocking, not advisory:

1. **Docs before code.** Before changing code in an area, the nearest
   covering README must exist and match reality. If it is missing,
   incomplete, or contradicts the code, write or correct it first, before
   implementing.
2. **Docs follow change.** Every implementation change updates the affected
   READMEs in the same task session. A task is not complete until its
   documentation matches the new reality; shipping code with stale docs is
   shipping a defect. When code and README disagree, the README is wrong —
   update it rather than silently coding around it.
3. **Links follow structure.** Adding, moving, or removing a component
   updates the parent README's inventory and the links of related READMEs in
   the same task. Orphaned READMEs, dangling links, and missing cross-links
   are defects.
4. **Guards are mandatory.** Documentation changes are incomplete until the
   repository's documentation guard passes; broken links and duplicated
   canonical passages are blocking errors. Discover the guards this
   repository ships by following links from the root README. Report any
   guard that could not be run.

## Execution Rules

- Start each coding-agent session in its own git worktree created from the
  primary `local` checkout before changing files. Use a dedicated session
  branch, such as `agent/<task-slug>-<timestamp>`, so multiple agents never
  share one working tree or branch.
- Treat the primary checkout on `local` as the integration tree. Keep session
  changes inside the agent worktree until they are committed, then merge the
  session branch back into `local` from the primary checkout. If the merge is
  not clean, stop and report the conflicted files instead of resolving
  unrelated work opportunistically.
- Remove the session worktree after its branch has been merged, unless the
  user asks to keep it for inspection.
- State risky assumptions before making changes.
- Avoid any hardcoding where possible. Always use existing architectural
  patterns and abstractions, or create ones where appropriate, with task
  goal as their implementation.
- Prefer the smallest implementation that satisfies the task.
- Change only files and code chunks directly required by the task.
- Follow existing project structures, helpers, names, and conventions.
- Do not add speculative abstractions, features, or future-proofing.
- Do not refactor unrelated code.
- Do not add backward compatibility bridges, legacy fallbacks, dual-read
  paths, or adapter shims when changing data structures, permissions, routes,
  APIs, or process protocols, until asked for. Replace the old contract and
  migrate existing data in the same task.
- Do not revert or overwrite unrelated user/agent changes.
- Do not run `npm run build` or start dev servers unless explicitly asked.
- Continue until the task is implemented, documented, validated, and
  committed, or clearly report the blocker.
- When a user asks to implement a plan, execute the whole accepted plan.
  Do not intentionally ship a partial plan slice unless the user explicitly
  narrows scope or an external blocker makes completion impossible; report
  any blocker before committing partial work.

## Documentation Rules

- Keep AGENTS.md as protocol only, free of project facts. Domain-specific
  rules live in the README that owns the concern.
- If task is assigned via TODO.md, add an Agent Notes subsection under that task
  as one level deeper heading, with timestamp and report what is done or
  discovered. If task is done, replace its status to WAITING.
- Do not create or fill `TODO.md` Agent Notes only to satisfy process. Do not
  change a task not written by you. Update `TODO.md` only when the task itself
  changes tracked work, status, or plans that belong there.

## Validation Rules

- Run focused validation for the touched area whenever practical.
- Run the repository's validation guards, discovered through the links in
  the root README: architecture changes are incomplete until the
  architecture guard passes; documentation changes are incomplete until the
  documentation guard passes; framework and package contract changes run
  framework validation when practical.
- Agents with a restricted write scope run the repository's scope guard
  before committing or pushing.
- Report any validation that could not be run.

## Commit Rules

Committing is mandatory for completed work.

1. Commit task work on the session branch inside the agent worktree. Do not
   commit directly to `main` or to the primary `local` checkout.
2. Inspect `git status --short` before staging.
3. Stage only files that belong to the completed task.
4. Commit implementation changes first with a normal conventional prefix such
   as `feat:`, `fix:`, `refactor:`, or `test:`.
5. Commit documentation separately. Any README.md or TODO.md changes must be
   in a separate commit whose message starts with `neo:`.
6. If a task has both code and docs, the final state must include both commits.
7. Do not leave completed work uncommitted because the worktree was already
   dirty. Instead, inspect the dirty set, separate unrelated changes, and commit
   only the task-owned files.
8. If unrelated dirty files make safe staging impossible, stop and report the
   exact files and reason.
9. After committing in the session worktree, merge the session branch back into
   `local` from the primary checkout and report both the session commit hash and
   the merge result.
10. Do not rewrite history, amend old commits, revert commits, or use destructive
    git commands unless explicitly instructed.

At handoff, report commit hashes, validation run, and any remaining untracked or
unstaged files.
