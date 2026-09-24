---
name: test-audit
description: Invoke whenever writing, changing, reviewing, or auditing tests in Perigram Demo. Authoring gate for new vitest, SSR-smoke, or E2E specs, plus the audit workflow for low-value, implementation-coupled, or duplicative tests and the test-only production seams they keep alive.
---

# Test Audit

Two modes, one value bar. Authoring mode gates every new or changed test at
write time. Audit mode sweeps existing tests that re-assert source, duplicate
stronger proof, couple behavior to implementation, or preserve test-only
production seams. Optimize for confidence, not deletion count.

`AGENTS.md` remains authoritative for testing policy: prefer E2E as the sole
testing mechanism; write unit tests only when core functionality demands them;
when testing a system in isolation, write all the ways it can fail first, then
the code.

## First Reads

1. `AGENTS.md`
2. [Root README development section](../../../README.md) — validation command
   set.
3. [e2e/README.md](../../../e2e/README.md) — E2E run contract, coverage map,
   and the adding-workflows rules.
4. [scripts/README.md](../../../scripts/README.md) — vitest alias/plugin
   setup, `check-arch.js` source-assertion guard, documentation guard.
5. [test-tools/README.md](../../../test-tools/README.md) — SSR smoke harness.

## Repo test surfaces

- Co-located `*.spec.js` under `server/`, `packages/`, `shared/`,
  `components/`, `composables/`, `stores/`, `utils/`, `test-data/` — run
  focused with `npx vitest run <path-or-filter>`.
- SSR page smoke (`*.ssr-smoke.js`) — run with
  `npx vitest run --config vitest.ssr.config.js`.
- Playwright E2E (`e2e/`) — requires an already-running stack; agents must
  not start Nuxt or Docker from the test runner.
- Static-boundary specs asserting source structure are allowlisted in
  `check-arch.js`; everywhere else `readFileSync` + `toContain` is a blocking
  architecture error, not a style preference.

## Authoring gate

Before adding a test, answer four questions; a missing answer means do not
add it yet:

1. What observable behavior, invariant, or independent contract does it
   protect?
2. What credible regression makes it fail?
3. Why does existing coverage not already catch that failure? Each contract
   has one primary test owner at the strongest boundary; prefer extending a
   table-driven case or shared fixture over a near-duplicate test.
4. Does it need a production seam (export, flag, wrapper, injection hook)
   that no production caller needs? If yes, move the test to the real
   boundary instead.

Then check it against every junk pattern below. A test that would break under
behavior-preserving refactoring is asserting implementation, not behavior;
rewrite it at the owning boundary before landing it. Bug regression tests must
fail on the pre-fix code for the intended reason and pass after the
owner-boundary repair; one regression at the owner boundary covers the bug.

## Junk patterns

The checklist for both modes — the gate rejects a new test that matches one,
audits hunt for existing tests that do:

- assertion-free coverage probes and self-comparisons;
- copied fixtures, inventories, manifests, or export lists;
- exact source, import, or string greps (already blocked by `check-arch.js`
  outside the static-boundary allowlist);
- duplicate invocations of the same contract at a weaker boundary;
- tests whose only purpose is preserving test-only exports, globals, or
  wrappers, or dead production code whose only callers are tests;
- expected values produced by the helper or renderer under test;
- mocks that implement the asserted behavior, or one identical mock standing
  in for different APIs;
- fixtures that supply the ordering or receipt the owner should produce;
- negative controls that pass for an unrelated reason, such as a denial from
  a different guard;
- names or fixtures that promise more than the input exercises.

## Value and retention bar

Tests justify their maintenance cost by protecting behavior, a credible
regression, or an independently meaningful contract (public API, compiled
process/runtime contract, CTS type shape, migration, storage, security,
access, offline/outbox, or design-system boundary). Keep:

- call ordering when order is observable behavior;
- regressions with a credible failure mode;
- static-boundary specs that fail when the contract key, byte, or path
  changes and survive an identifier-only refactor.

Static or slow is not a deletion reason. A test that resembles implementation
may still be the independent contract; prove otherwise before removing it. A
retained test that fails on the baseline is a possible product bug — reproduce
it and repair the owner rather than deleting the test.

## Audit workflow

Keep discovery read-only and report evidence before editing. Prefer a few
high-confidence candidates over a large speculative inventory. Lanes: core
(`server/`, `packages/`), UI (`components/`, `composables/`, `pages/`,
`stores/`, `shared/`, `utils/`), tooling (`scripts/`, `test-tools/`,
`test-data/`), and `e2e/`. Scope one coherent owner boundary per session;
subsystem-wide sweeps run as separate follow-up sessions. For E2E candidates,
reconcile against the known-stale spec inventory in `e2e/README.md` instead of
re-deriving it.

Record every field before editing; a missing field means the candidate is not
ready for deletion:

- exact test name and location;
- what failure it can actually detect;
- non-test callers of the covered production or support seam;
- stronger remaining owner-boundary proof, or why none is needed;
- relevant history and the reason the test or seam exists;
- production or test-support deletion unlocked;
- risk and the focused validation command.

Edit shape: one coherent owner-boundary batch. Delete obsolete test-only
exports, globals, wrappers, and dead production paths instead of preserving
aliases. Move retained regressions to their canonical owners. Consolidate
repeated assertions into one generic contract. Prefer net-negative production
LOC; do not add replacement tests that restate the same implementation.

## Validation

Never edit source or tests while vitest is running in the checkout.

1. Run the smallest owner and sibling specs with
   `npx vitest run <path-or-filter>`.
2. For touched page rendering, run the SSR smoke config.
3. Run E2E only when the stack is already up, per the
   [E2E run contract](../../../e2e/README.md).
4. Run `node scripts/check-arch.js` after test-practice edits.
5. Run `git diff --check`; classify and stage per `AGENTS.md` commit rules
   (implementation commit first, `neo:` commit for README/TODO updates).
6. Inspect `git diff --numstat`; report production/tooling changes separately
   from tests and test support.

## Handoff

Report removed low-value categories with root causes, production owner
simplifications, retained false positives and why they remain valuable, proof
actually run, production versus test LOC, and named follow-ups.
