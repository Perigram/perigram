# AGENTS.md

```yaml
doc_id: PERIGRAM-AGENTS-001
classification: reference
status: active
owner: product-owner
created: 2025-10-22
updated: 2026-10-24
```


This repository operates in strict documentation-first mode. This file is the
operating protocol only. It deliberately contains no project facts: no file
paths, no commands, no technologies, no architecture. All project knowledge
lives in the interlinked README.md tree. Agents acquire knowledge by reading
that tree, never by assuming, guessing, or hardcoding it. If a rule ever
names a concrete file, path, command, or stack detail, it belongs in the
README that owns the concern, not here.

## Operation mode

- If tasks execution would involve violation of arctitecture principles, project
  guidelines or common sense, tell it explicitly, without inventing walkarounds or slop. User
  may not understand how things work and his intent may be re-shaped to be delivered elegantly
  in terms of software architecture. DO NOT REJECT USER REQUESTS SILENTLY.

- DO NOT EVER BLAME STALE BROWSER TAB OR DOCKER UNTIL ABSOLUTELY SURE THAT ITS THE PROBLEM!
  PROBLEM IS ALMOST ALWAYS SLOP WRITTEN BY AI!

## Documentation Model

Documentation consists of README.md, SPEC.md and TODO.md files across codebase.

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

- Be the component's reference sheet, in present tense: purpose in one or
  two sentences, the contracts that live here and nowhere else (shapes,
  seams, route and export inventories, state machines — as tables or
  fenced examples), conventions, and non-obvious decisions (traps,
  invariants, ordering).
- Carry what is necessary and sufficient for a maintainer to understand,
  maintain, and extend the component without grepping its code. The test
  for every sentence: deleting it must lose a fact or a link a maintainer
  uses. Placeholders, guesses, trivial file listings, and restatement of
  what the code already shows are defects.
- Be true to the code: every contract-shaped claim (a name, route, count,
  constant, behavior) is verified against the code it names in the same
  edit that writes or keeps it.
- Carry law, and leave provenance to SPEC.md and TODO.md: a README
  sentence states the rule as it stands — citing no dates, attributing no
  decisions, narrating no change.
- Prefer a table row or fenced example over a prose paragraph; one fact
  per sentence.
- Link its parent README, and be registered in the parent's component
  inventory or documentation map.
- Link every related README whose contract it consumes or extends.
- Keep canonical content single-homed: a contract (registry, schema or DTO
  definition, state machine, workflow, API contract) lives in exactly one
  canonical README. Every other README links to it. Verbatim restatement
  across READMEs is a defect.
- Stay short by construction: when a README keeps growing, the new content
  belongs in a child README, the parent's inventory, or the SPEC — split
  or link it. Clean slop left by other agents on sight.

SPEC.md describes desired state of system, container, component or code.
It's either written by human or from human words, never invented by AI agents.
TODO.md is operational delta between SPEC.md and README.md.

## Mandatory First Reads

Before changing files, read:

1. The root README.md.
2. The nearest README covering the area being changed, reached by following
   links from the root.
3. Every README whose contract the change consumes or extends, following
   links outbound until the changed concern is fully understood.

Keep reads bounded to the touched concern; do not explore unrelated areas.

The gate is per concern, not per session. Each new concern touched during a
session — including one introduced by a bug report or a runtime error —
restarts these reads for the area that owns the concern. Diagnosis is
change work: a causal claim about behavior may be formed only after the
README owning that contract has been read. Following error messages through
code is investigation, not a substitute for the contract.

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
5. **Contradictions are blocking.** Code behavior that contradicts a README
   sentence already read is a defect: stop, reconcile the two (fix whichever
   is wrong), and report the contradiction in the same task. Presenting
   observed code behavior as the contract, without reconciling it against the
   owning README, is itself the defect — the code is not the authority on
   intent.
6. **Comments do not home contracts.** Authoring, compilation, and runtime
   semantics — what authored data means and how it is evaluated — live in the
   owning README. A code comment may explain local implementation, but a
   contract-shaped comment is a misplaced contract: move the contract to its
   canonical README and leave the comment as a pointer. The documentation
   guard surfaces contract-shaped comments as a homing backlog; entries there
   are resolved by giving the contract a README home or consciously keeping
   them as tracked debt.

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
- An OpenCode session's home directory is never a session worktree. Keep the
  session homed at the primary checkout and reach worktree files by absolute
  path. Before removing a session worktree, move any session still homed
  inside it back to the primary checkout directory: deleting a worktree that
  homes a session orphans that session — it vanishes from the session list
  and cannot be resumed.
- State risky assumptions before making changes.
- Cite the contract: when a task's conclusion rests on a behavioral claim,
  name the README contract relied on. If no README states the behavior, that
  absence is a finding — either the documentation is missing the contract or
  the code implements an undocumented one.
- Avoid any hardcoding where possible. Always use existing architectural
  patterns and abstractions, or create ones where appropriate, with task
  goal as their implementation.
- Prefer the smallest implementation that satisfies the task.
- Change only files and code chunks directly required by the task.
- Follow existing project structures, helpers, names, and conventions.
- Do not add speculative abstractions, features, or future-proofing.
- Do not refactor unrelated code.
- No compatibility with retired contracts, ever, unless the owner orders it
  in so many words this session: not bridges, legacy fallbacks, dual-read
  paths, adapter shims — and not "boundary projections" or wire adapters
  that keep a retired shape alive under a new name. When a contract
  changes, its consumers and stored data migrate in the same task. Compat
  built to support slop is more slop.
- No assumed fields: a serialization boundary carries exactly what its
  domain stores. Synthesizing alias blocks, universal display fields, or
  costume names for stored slots at the wire is a defect, not a design.
  Only true must-haves travel, as plain fields.
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
- When user declares desired feature or state of app, component, or service, it should ALWAYS
  go to SPEC.md in appropriate place, and TODO.md gets updated. Then, implement.

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
- Only if user says task is done, move it to TODO.md_archive. NEVER
  mark it as done by yourself. 

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

## Coding rules

### Tests

- DON'T write unit tests after you write code unless it absolutely necessary to test core functionality. 
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact. 
- DO NOT USE BROWSER OR PLAYWRIGHT UNLESS ABSOLUTERLY NECESSARY
- If you must test a system in isolation, FIRST write all the ways it could fail, THEN write the code.

### UI labels

- Unless absolutely needed, DO NOT add any labels or messages that need to "describe" UI element or action. UI needs to be self-explanatory. 
- Unless absolutely needed, DO NOT expose ID or other technical information that belongs to code only, unless it's absolutely needed for
  debugging or administration. 

### UNSLOP EVERYTHING YOU SEE

- If you meet obvious slop, fix it immediately. Most of times it's duplications: one thing lives in
  2-3-10 places because previous agents failed to find existing place and wrote their own new
  implementations. Your side quest is to fix, centralize, deduplicate, and make docs match reality. 
  Before doing it, check top-level project architecture to decide where thing should live.
- Remove slop docs and comments that bloat codebase. Previous agents often left comments on "why
  they removed something" and "what it's no more" which no one gives fuck about. Remove this slop
  when you see it. Also remove verbose explanations of obvious things that give zero value. I need
  only concrete conventional docs that describe software, not a place for agents to release their
  graphomania. 

### Comment and prose bans (absolute, owner direction 2026-10-17)

- A comment carries at most ONE fact the code cannot show: a trap, an
  invariant, a decision. Everything else is deleted, not trimmed.
- Banned forever in comments, READMEs, TODO notes, and commit messages:
  - negative-space prose — "never X", "not Y", "no longer", "instead
    of", "unlike", "rather than", "without" — describing a thing by what
    it is not;
  - history — why it changed, what it replaced, what used to be;
  - narrating the code in words;
  - two sentences where one carries the only fact.
- A README paragraph whose deletion changes nothing for a maintainer
  using the thing is slop.
- Shipping a banned sentence is shipping a defect, same as a failing
  guard.
