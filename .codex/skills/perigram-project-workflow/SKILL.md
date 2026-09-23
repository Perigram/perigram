---
name: cutkit-project-workflow
description: Follow CutKit Demo repository workflow when doing coding-agent work in this repo, especially documentation-first context assembly, README synchronization, TODO.md Agent Notes, validation selection, commit discipline, branch discipline, and keeping AGENTS.md as the mandatory source of truth.
---

# CutKit Project Workflow

Use this skill as the repo-local entry point for project workflow. It does not
replace `AGENTS.md`; read `AGENTS.md` first and treat it as authoritative.

## First Reads

1. `AGENTS.md`
2. Root `README.md`
3. The local component README for the area being changed
4. Related component READMEs linked from those docs

If a required README is missing or stale, update it before relying on code
inspection for context.

## Operating Rules

- State assumptions and success criteria before making non-trivial changes.
- Keep edits surgical and scoped to the requested task.
- Preserve unrelated user or agent changes in the worktree.
- Prefer existing project patterns, helpers, and documented workflows.
- Do not introduce compatibility bridges, legacy fallbacks, dual-read paths, or
  adapter shims for changed data structures, permissions, routes, APIs, or
  process protocols. Replace the old contract and include the migration for
  existing data in the same task.
- Do not run `npm run build` or start dev servers unless the user asks.
- Use focused validation for the touched area.
- When committing, stay on `local` and keep implementation commits separate from
  README/TODO documentation commits.

## Closeout

- Synchronize the relevant README files when behavior, structure, workflows, or
  public contracts changed.
- Add an `Agent Notes` entry under the relevant `TODO.md` task with date, task,
  files changed, docs updated, and key decisions.
- Use a `neo: ...` commit message for documentation-only commits.
