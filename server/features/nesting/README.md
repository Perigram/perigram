# COMPONENT: Nesting

Command handler and compatibility job metadata for queue nesting.

## Responsibilities

- `operations.js` implements the `solveNesting` command.
- The handler validates queue state, transitions a draft queue to `NESTING`,
  creates a `nesting_run`, enqueues `nesting.solve`, and writes a linked
  compatibility `nesting_jobs` record.
- Command output is initially the `nesting_run` plus task/job references.
  `sheet_design` entities are created only after the worker returns, one entity
  per physical sheet layout in `solution.layouts[]`. Generated files are
  requested separately through artifact/attachment commands; the queue nesting
  API does not request attachments unless explicitly told to.
- The registered `nesting.solve` task executor builds the FastAPI payload from
  cassette polygon parts or dimension fallback rectangles, carries baked OCCS
  `layerData` as request-side source layers, calls `NESTING_WORKER_URL`,
  enriches stripped worker responses with source request geometry, source
  layers, and bin shape data, creates one `sheet_design` per returned layout,
  stores their IDs on `nesting_run.data.sheetDesignIds`, completes/fails the
  task run, updates the compatibility job, transitions the `nesting_run` to
  `COMPLETE` or final-attempt `ERROR`, and transitions the parent queue from
  `NESTING` to `READY` on success or back to `DRAFT` on final failure.
- Run summaries use explicit worker `efficiency`/`remnantArea` metrics when
  present. Current `lbf` responses usually expose only `solution.density` and
  layout placements, so `operations.js` falls back to density and then placed
  source polygon area to derive card-visible utilization and remnant area.
- Compatibility `nesting_jobs.projectSlug` is resolved from the parent project,
  not the queue, so notification/statistics plugins can find the project.
- Before rejecting a queue as already nesting, the handler checks the active
  compatibility job's `taskRunId`; jobs whose task is `FAILED` or `CANCELLED`
  are marked `error` and no longer block a new nesting request.
- `statistics.js` supports both legacy `nesting_jobs.sheets` payloads and the
  current worker result shape stored at `nesting_jobs.result.solution.layouts`.
- `jobs.js` owns Mongo access for `nesting_jobs`.
- Warehouse-mode runs resolve sheet size and sheet count from
  `queue.data.job.materialPool`. The FastAPI worker still receives only its
  strict `{ width, height, space, sheetCount, sheet_polygon }` params, while the
  nesting run/job keep `materialPool` context for downstream sheet-design and
  inventory UI. Mixed stock sizes or stock entries without dimensions are
  rejected before task creation. The command may also receive a normalized
  `materialPool` directly from QueueEditor; an empty or omitted command
  material pool falls back to the saved queue material pool instead of
  overriding it.

`buildJobFiles()` is exported for focused coverage of the handoff from queue
items to worker files. Parametric queue entries must load the cassette template,
bake it with the entry `parameters`, and pass the baked cassette ID plus baked
`polygonParts` into `buildNestingWorkerRequest()`. The fetched cassette entity
is the source of truth for whether an item is parametric; a stale queue item
`type` must not make an OCCS template skip baking and fall back to a rectangle.
For OCCS templates with multiple `sheet` workpieces, baking stores one
`polygonPart` per sheet workpiece. The FastAPI worker receives these as separate
items with the same baked cassette ID, preserving the single template reference
while allowing independent placement. Degenerate polygon parts with fewer than
three unique points or zero area are skipped before the worker request, so
legacy DXF imports that contain two-point closed curves do not produce worker
geometry warnings. Each request item also carries only the
source layers relevant to that workpiece (`cut.outer`, `fold.route`, dimensions,
and other annotation layers); the worker is not expected to preserve those
unknown fields, so the task merges them back from the request before sheet
design preview projection. `enrichNestingResult()` also keeps request items that
are absent from a partial worker `items` array, because layouts may still
reference those request ids after demand expansion; the request copy remains the
source for cassette design ids, source layers, and preview geometry.

The long-running execution contract is the `nesting.solve` task. The HTTP
algorithm service lives in [workers/nesting](../../../workers/nesting/README.md).

## Related

- [Command runtime](../../core/commands/README.md)
- [Task runtime](../../core/tasks/README.md)
- [Nesting runs](../nesting-runs/README.md)
