# COMPONENT: Nesting

Command handler and compatibility job metadata for queue nesting.

## Responsibilities

- `operations.js` implements the `solveNesting` command.
- The handler validates queue state, creates a `nesting_run`, creates an initial
  `sheet_design`, enqueues `nesting.solve`, and writes a linked
  compatibility `nesting_jobs` record.
- `jobs.js` owns Mongo access for `nesting_jobs`.

The long-running execution contract is the `nesting.solve` task. The HTTP
algorithm service lives in [workers/nesting](../../../workers/nesting/README.md).

## Related

- [Command runtime](../../core/commands/README.md)
- [Task runtime](../../core/tasks/README.md)
- [Nesting runs](../nesting-runs/README.md)
