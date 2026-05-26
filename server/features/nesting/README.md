# COMPONENT: Nesting

Command handler and compatibility job metadata for queue nesting.

## Responsibilities

- `operations.js` implements the `solveNesting` command.
- The handler validates queue state, creates a `nesting_run`, creates an initial
  `sheet_design`, enqueues `nesting.solve`, and writes a linked
  compatibility `nesting_jobs` record.
- The registered `nesting.solve` task executor builds the FastAPI payload from
  cassette polygon parts or dimension fallback rectangles, calls
  `NESTING_WORKER_URL`, completes/fails the task run, updates the compatibility
  job, and transitions the `nesting_run` to `COMPLETE` or final-attempt `ERROR`.
- Compatibility `nesting_jobs.projectSlug` is resolved from the parent project,
  not the queue, so notification/statistics plugins can find the project.
- Before rejecting a queue as already nesting, the handler checks the active
  compatibility job's `taskRunId`; jobs whose task is `FAILED` or `CANCELLED`
  are marked `error` and no longer block a new nesting request.
- `statistics.js` supports both legacy `nesting_jobs.sheets` payloads and the
  current worker result shape stored at `nesting_jobs.result.solution.layouts`.
- `jobs.js` owns Mongo access for `nesting_jobs`.

The long-running execution contract is the `nesting.solve` task. The HTTP
algorithm service lives in [workers/nesting](../../../workers/nesting/README.md).

## Related

- [Command runtime](../../core/commands/README.md)
- [Task runtime](../../core/tasks/README.md)
- [Nesting runs](../nesting-runs/README.md)
