# AGENTS.md

This repository operates in strict documentation-first mode. This file is the
 operating protocol; project architecture details live in README.md files.

## Mandatory First Reads

Before changing files, read:

1. `README.md`
2. The nearest relevant component README for the area being changed
3. Related READMEs linked from those docs

Use these source-of-truth docs for technical rules:

| Area | Source of truth |
|---|---|
| System overview | `README.md` |
| Backend architecture | `server/README.md` |
| Backend feature Golden Path | `server/features/_template/README.md` |
| API routes | `server/api/README.md` |
| Workflow/status engine | `server/core/machines/README.md` |
| Frontend components and design system | `components/README.md`, `components/shared/README.md` |
| Frontend entity data flow | `composables/README.md` |
| Scripts and validation | `scripts/README.md` |
| External agent write scope | `.agents/README.md`, `.agents/app-layer.allowlist` |

If a required README is missing, stale, or contradicts code, update the README
first or in the same task before relying on implementation details.

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

- Every implementation change must update relevant README.md documentation in
  the same task session.
- Documentation should explain real architecture, flows, contracts, and unusual
  decisions. Avoid placeholders, guesses, and obvious file listings.
- Keep AGENTS.md as protocol only. Move backend/frontend/domain-specific rules
  to the relevant README source of truth.
- If task is assigned via TODO.md, add an Agent Notes subsection under that task
  as one level deeper heading, with timestamp and report what is done or
  discovered. If task is done, replace its status to WAITING.
- Do not create or fill `TODO.md` Agent Notes only to satisfy process. Do not
  change a task not written by you. Update `TODO.md` only when the task itself
  changes tracked work, status, or plans that belong there.

## Context Assembly

Before writing or editing code, assemble atomic context from the mandatory
first reads and the canonical contracts they reference. Check each section or
component README being touched, then follow links outbound to entity, feature,
API, machine, and shared-component contract docs until the changed concern is
fully understood.

- Read the README for the touched area before changing its code.
- Follow the source-of-truth links to related contracts from that README.
- Do not restate or duplicate a canonical contract (entity registries, DTO
  blocks, status/process machines, lineage, auth context, workflow actions)
  in another README; link to the canonical doc instead.
- Keep reads bounded to the touched concern, but do not skip a contract that
  the changed code consumes or extends.
- If a required README is missing or stale, fix the README in the same task
  before relying on implementation details.
- Before committing, run `node scripts/check-docs.js` and resolve any broken
  internal links or duplicated canonical-contract passages it reports.

## Validation Rules

- Run focused validation for the touched area whenever practical.
- Backend architecture changes are incomplete until `node scripts/check-arch.js`
  passes.
- Framework/package contract changes should run `npm run framework:validate`
  when practical.
- External top-layer/app-composition agents must run
  `npm run agent:scope-check -- --base origin/local` before committing or
  pushing.
- Documentation changes are incomplete until `node scripts/check-docs.js`
  passes.
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
